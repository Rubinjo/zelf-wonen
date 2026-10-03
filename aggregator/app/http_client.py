"""Stable, rate-limited sessions; bounded retries and immediate stops on blocks."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
import random
from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import urljoin, urlsplit

import httpx
from curl_cffi.requests import AsyncSession, RequestsError
from curl_cffi.requests import Response as CurlResponse

from .config import Settings
from .robots import RobotsRules

logger = logging.getLogger(__name__)


class ScrapeError(RuntimeError):
    """Raised when fetching or interpreting source data fails."""


class SourceUnavailable(ScrapeError):
    """Stop this source immediately; a later scheduled run may try again."""

    def __init__(self, message: str, retry_after: float = 0) -> None:
        super().__init__(message)
        self.retry_after = retry_after


def retry_after_seconds(value: str | None) -> float:
    if not value:
        return 0
    try:
        seconds = float(value)
        return max(0, seconds) if math.isfinite(seconds) else 0
    except ValueError:
        try:
            return max(0, (parsedate_to_datetime(value) - datetime.now(UTC)).total_seconds())
        except (ValueError, TypeError, OverflowError):
            return 0


@dataclass
class ScrapeResponse:
    url: str
    status_code: int
    content_type: str | None
    text: str
    # SHA-256 of the raw bytes; used to skip unchanged detail pages.
    content_hash: str
    retry_after: float = 0
    location: str | None = None

    def require_success(self) -> None:
        """Discovery errors must never be interpreted as empty or removed listings."""
        if not 200 <= self.status_code < 300:
            raise ScrapeError(f"HTTP {self.status_code} for {self.url}")


class ScraperClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._user_agent = next(iter(settings.user_agent_list), "zelfwonen-aggregator/0.1")
        self._request_lock = asyncio.Lock()
        self._robots: dict[str, RobotsRules] = {}
        self._delay = settings.polite_delay_seconds
        self._funda_client: AsyncSession | None = None
        self._client = httpx.AsyncClient(
            proxy=next(iter(settings.proxy_list), None),
            timeout=settings.request_timeout_seconds,
            follow_redirects=False,
            headers={
                "Accept": (
                    "text/html,application/xhtml+xml,application/json;q=0.9,"
                    "application/xml;q=0.8,*/*;q=0.7"
                ),
                "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8",
            },
        )

    async def __aenter__(self) -> ScraperClient:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        try:
            if self._funda_client is not None:
                await self._funda_client.close()
        finally:
            await self._client.aclose()

    async def fetch(self, url: str, *, referer: str | None = None) -> ScrapeResponse:
        """GET with bounded transient retries; restrictions stop the source."""
        for _ in range(6):
            await self._check_robots(url)
            response = await self._fetch(url, referer=referer)
            if response.status_code not in (301, 302, 303, 307, 308):
                return response
            url = self._redirect_url(url, response.location)
        raise ScrapeError("too many source redirects")

    @staticmethod
    def _redirect_url(url: str, location: str | None) -> str:
        if not location:
            raise ScrapeError("redirect without Location")
        target = urljoin(url, location)
        parts = urlsplit(target)
        if parts.scheme != "https" or parts.netloc != urlsplit(url).netloc:
            raise SourceUnavailable("source redirected outside its HTTPS origin")
        return target

    async def _fetch(self, url: str, *, referer: str | None = None) -> ScrapeResponse:
        last_error: Exception | None = None
        for attempt in range(self._settings.max_retries + 1):
            try:
                response = await self._request_once(url, referer=referer)
                if response.status_code in (401, 403, 429):
                    raise SourceUnavailable(
                        f"HTTP {response.status_code} for {url}", response.retry_after
                    )
                if response.retry_after and response.status_code >= 500:
                    raise SourceUnavailable(
                        f"HTTP {response.status_code} for {url}", response.retry_after
                    )
                if any(
                    marker in response.text.lower()
                    for marker in (
                        "<title>just a moment",
                        "<title>access denied",
                        "cf-chl-",
                        "<title>captcha",
                        "<title>robot or human",
                        "<title>je bent bijna op de pagina die je zoekt",
                    )
                ):
                    raise SourceUnavailable(f"challenge page for {url}")
                if response.status_code not in (301, 302, 303, 307, 308, 404, 410) and not (
                    200 <= response.status_code < 300
                ):
                    raise ScrapeError(f"HTTP {response.status_code} for {url}")
                return response
            except SourceUnavailable:
                raise
            except (httpx.HTTPError, ScrapeError) as exc:  # noqa: B902 - httpx.HTTPError subclass
                last_error = exc
                if attempt >= self._settings.max_retries:
                    break
                delay = self._backoff(attempt)
                logger.warning(
                    "retrying %s in %.1fs (attempt %d/%d)",
                    url,
                    delay,
                    attempt + 1,
                    self._settings.max_retries,
                )
                await asyncio.sleep(delay)
        raise ScrapeError(f"failed to fetch {url}: {last_error}") from last_error

    async def fetch_json(
        self, url: str, *, referer: str | None = None
    ) -> dict[str, Any] | list[dict[str, Any]]:
        response = await self.fetch(url, referer=referer)
        response.require_success()
        try:
            data = json.loads(response.text)
            if not isinstance(data, (dict, list)):
                raise ValueError("expected an object or array")
            return data
        except ValueError as exc:
            raise ScrapeError(f"invalid JSON from {url}") from exc

    async def _request_once(self, url: str, *, referer: str | None) -> ScrapeResponse:
        headers = {"User-Agent": self._user_agent}
        if referer:
            headers["Referer"] = referer
        async with self._request_lock:
            await asyncio.sleep(self._delay)
            if self._uses_funda_transport(url, referer):
                result = await self._request_funda(url, referer=referer, max_bytes=5 * 1024 * 1024)
                if result is None:
                    raise SourceUnavailable("source page exceeds 5 MiB response limit")
                response, body = result
                return ScrapeResponse(
                    url=response.url,
                    status_code=response.status_code,
                    content_type=response.headers.get("content-type"),
                    text=body.decode(response.encoding or "utf-8", errors="replace"),
                    content_hash=hashlib.sha256(body).hexdigest(),
                    retry_after=retry_after_seconds(response.headers.get("retry-after")),
                    location=response.headers.get("location"),
                )
            async with self._client.stream("GET", url, headers=headers) as response:
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > 5 * 1024 * 1024:
                        raise SourceUnavailable("source page exceeds 5 MiB response limit")
        content_hash = hashlib.sha256(body).hexdigest()
        return ScrapeResponse(
            url=str(response.url),
            status_code=response.status_code,
            content_type=response.headers.get("content-type"),
            text=bytes(body).decode(response.encoding or "utf-8", errors="replace"),
            content_hash=content_hash,
            retry_after=retry_after_seconds(response.headers.get("retry-after")),
            location=response.headers.get("location"),
        )

    def _uses_funda_transport(self, url: str, referer: str | None) -> bool:
        origin = urlsplit(self._settings.funda_base_url).netloc
        return self._settings.funda_transport == "chrome" and (
            urlsplit(url).netloc == origin
            or (referer is not None and urlsplit(referer).netloc == origin)
        )

    async def _request_funda(
        self, url: str, *, referer: str | None, max_bytes: int
    ) -> tuple[CurlResponse, bytes] | None:
        if self._funda_client is None:
            # Keep Chrome's TLS fingerprint and headers consistent for the entire
            # session. Changing only httpx's User-Agent cannot reproduce this.
            self._funda_client = AsyncSession(
                impersonate="chrome",
                proxy=next(iter(self._settings.proxy_list), None),
                timeout=self._settings.request_timeout_seconds,
                allow_redirects=False,
                headers={"Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8"},
            )
        headers = {"Referer": referer} if referer else {}
        body = bytearray()
        oversized = False

        def collect(chunk: bytes) -> int:
            nonlocal oversized
            if len(body) + len(chunk) > max_bytes:
                oversized = True
                return 0  # Abort the transfer before buffering an oversized body.
            body.extend(chunk)
            return len(chunk)

        try:
            response = await self._funda_client.get(url, headers=headers, content_callback=collect)
        except RequestsError as exc:
            if oversized:
                return None
            # Preserve the existing retry and optional-image error handling.
            raise httpx.RequestError(f"Funda transport failed: {exc}") from exc
        return response, bytes(body)

    async def _check_robots(self, url: str) -> None:
        if not self._settings.respect_robots:
            return
        parts = urlsplit(url)
        origin = f"{parts.scheme}://{parts.netloc}"
        if origin not in self._robots:
            try:
                # Advisory metadata gets one bounded attempt, never source retries
                # or cooldowns. Cache failures too so every listing does not retry it.
                response = await self._request_once(f"{origin}/robots.txt", referer=None)
                response.require_success()
                if "<html" in response.text.lower() or "<!doctype html" in response.text.lower():
                    raise ScrapeError(f"invalid robots.txt for {origin}")
                self._robots[origin] = RobotsRules(response.text, self._user_agent)
            except (ScrapeError, httpx.HTTPError, ValueError) as exc:
                logger.warning("robots.txt unavailable for %s: %s; continuing", origin, exc)
                self._robots[origin] = RobotsRules("", self._user_agent)
            if self._robots[origin].delay:
                logger.warning(
                    "robots.txt requests crawl-delay %s for %s; using configured delay %s",
                    self._robots[origin].delay,
                    origin,
                    self._settings.polite_delay_seconds,
                )
        parser = self._robots[origin]
        if not parser.can_fetch(url):
            logger.warning("robots.txt disallows %s; continuing", url)

    async def fetch_bytes(
        self, url: str, *, referer: str | None = None, max_bytes: int
    ) -> bytes | None:
        """Images share the session, robots policy and pacing of HTML requests."""
        for _ in range(6):
            result = await self._fetch_bytes_once(url, referer=referer, max_bytes=max_bytes)
            if isinstance(result, str):
                url = self._redirect_url(url, result)
            else:
                return result
        raise ScrapeError("too many image redirects")

    async def _fetch_bytes_once(
        self, url: str, *, referer: str | None, max_bytes: int
    ) -> bytes | str | None:
        await self._check_robots(url)
        headers = {"User-Agent": self._user_agent}
        if referer:
            headers["Referer"] = referer
        async with self._request_lock:
            await asyncio.sleep(self._delay)
            if self._uses_funda_transport(url, referer):
                result = await self._request_funda(url, referer=referer, max_bytes=max_bytes)
                if result is None:
                    return None
                response, body = result
                if response.status_code in (301, 302, 303, 307, 308):
                    return response.headers.get("location")
                if response.status_code in (401, 403, 429):
                    raise SourceUnavailable(
                        f"HTTP {response.status_code} for {url}",
                        retry_after_seconds(response.headers.get("retry-after")),
                    )
                return body if 200 <= response.status_code < 300 else None
            async with self._client.stream("GET", url, headers=headers) as response:
                if response.status_code in (301, 302, 303, 307, 308):
                    return response.headers.get("location")
                if response.status_code in (401, 403, 429):
                    raise SourceUnavailable(
                        f"HTTP {response.status_code} for {url}",
                        retry_after_seconds(response.headers.get("retry-after")),
                    )
                if not 200 <= response.status_code < 300:
                    return None
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > max_bytes:
                        return None
                return bytes(body)

    def _backoff(self, attempt: int) -> float:
        base = self._settings.retry_backoff_base_seconds
        cap = self._settings.retry_backoff_max_seconds
        exponential = min(cap, base * (2**attempt))
        return exponential + random.uniform(0, exponential * 0.25)
