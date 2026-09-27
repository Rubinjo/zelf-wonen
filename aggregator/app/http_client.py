"""Resilient scraping HTTP client.

Treats scraping as a brittle, adversarial operation:

- rotating residential proxies (round-robin pool),
- rotating User-Agent strings,
- exponential backoff with jitter and bounded retries,
- optional polite delay between requests,
- a hard timeout so a hung connection can never stall the whole cron run.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import random
from dataclasses import dataclass
from typing import Any

import httpx

from .config import Settings

logger = logging.getLogger(__name__)


class ScrapeError(RuntimeError):
    """Raised after all retry attempts for a URL have failed."""


@dataclass
class ScrapeResponse:
    url: str
    status_code: int
    content_type: str | None
    text: str
    # SHA-256 of the raw bytes; used to skip unchanged detail pages.
    content_hash: str


class RotatingProxyPool:
    def __init__(self, proxies: list[str]) -> None:
        self._proxies = proxies
        self._index = 0

    @property
    def empty(self) -> bool:
        return not self._proxies

    def next(self) -> str | None:
        if not self._proxies:
            return None
        proxy = self._proxies[self._index % len(self._proxies)]
        self._index += 1
        return proxy


class RotatingUserAgentPool:
    def __init__(self, user_agents: list[str]) -> None:
        self._agents = user_agents or ["zelfwonen-aggregator/0.1"]

    def next(self) -> str:
        return random.choice(self._agents)


class ScraperClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._proxies = RotatingProxyPool(settings.proxy_list)
        self._user_agents = RotatingUserAgentPool(settings.user_agent_list)
        self._client = httpx.AsyncClient(
            timeout=settings.request_timeout_seconds,
            follow_redirects=True,
            headers={
                "Accept": (
                    "text/html,application/xhtml+xml,application/json;q=0.9,"
                    "application/xml;q=0.8,*/*;q=0.7"
                ),
                "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8",
                "Cache-Control": "no-cache",
            },
        )

    async def __aenter__(self) -> ScraperClient:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._client.aclose()

    async def fetch(self, url: str, *, referer: str | None = None) -> ScrapeResponse:
        """GET ``url`` with proxy/UA rotation and bounded retries."""
        last_error: Exception | None = None
        for attempt in range(self._settings.max_retries + 1):
            try:
                response = await self._request_once(url, referer=referer)
                if response.status_code not in (404, 410) and not 200 <= response.status_code < 300:
                    raise ScrapeError(f"HTTP {response.status_code} for {url}")
                if response.status_code == 200 and any(
                    marker in response.text.lower()
                    for marker in (
                        "<title>just a moment",
                        "<title>access denied",
                        "cf-chl-",
                        "<title>captcha",
                        "<title>robot or human",
                    )
                ):
                    raise ScrapeError(f"challenge page for {url}")
                return response
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
        try:
            data = json.loads(response.text)
            if not isinstance(data, (dict, list)):
                raise ValueError("expected an object or array")
            return data
        except ValueError as exc:
            raise ScrapeError(f"invalid JSON from {url}") from exc

    async def _request_once(self, url: str, *, referer: str | None) -> ScrapeResponse:
        await asyncio.sleep(self._settings.polite_delay_seconds)
        headers = {"User-Agent": self._user_agents.next()}
        if referer:
            headers["Referer"] = referer
        proxy = self._proxies.next()
        if proxy:
            # httpx configures proxies on the client, not on individual requests.
            async with httpx.AsyncClient(
                proxy=proxy,
                timeout=self._settings.request_timeout_seconds,
                follow_redirects=True,
                headers=self._client.headers,
            ) as session:
                response = await session.get(url, headers=headers)
        else:
            response = await self._client.get(url, headers=headers)
        content_hash = hashlib.sha256(response.content).hexdigest()
        return ScrapeResponse(
            url=str(response.url),
            status_code=response.status_code,
            content_type=response.headers.get("content-type"),
            text=response.text,
            content_hash=content_hash,
        )

    def _backoff(self, attempt: int) -> float:
        base = self._settings.retry_backoff_base_seconds
        cap = self._settings.retry_backoff_max_seconds
        exponential = min(cap, base * (2**attempt))
        return exponential + random.uniform(0, exponential * 0.25)
