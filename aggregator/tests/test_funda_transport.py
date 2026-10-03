import hashlib
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from curl_cffi.requests import Headers, RequestsError, Response

from app.config import Settings
from app.http_client import ScrapeError, ScraperClient, SourceUnavailable


def curl_session(body: bytes, status: int = 200, headers: dict[str, str] | None = None):
    session = AsyncMock()

    async def get(url, *, content_callback, **kwargs):
        if content_callback(body) != len(body):
            raise RequestsError("transfer aborted")
        response = Response()
        response.url = url
        response.status_code = status
        response.headers = Headers(headers or {"content-type": "text/html; charset=utf-8"})
        return response

    session.get.side_effect = get
    return session


async def test_funda_uses_one_chrome_session_for_html_and_images():
    body = "<html>€ 450.000</html>".encode()
    session = curl_session(body)
    settings = Settings(proxy_urls="http://proxy.example:8080")
    with patch("app.http_client.AsyncSession", return_value=session) as factory:
        async with ScraperClient(settings) as client:
            response = await client.fetch("https://www.funda.nl/zoeken/koop")
            image = await client.fetch_bytes(
                "https://cloud.funda.nl/image.jpg",
                referer="https://www.funda.nl/detail/koop/test/12345678/",
                max_bytes=100,
            )
    assert response.text == body.decode()
    assert response.content_hash == hashlib.sha256(body).hexdigest()
    assert image == body
    assert session.get.await_count == 2
    factory.assert_called_once()
    assert factory.call_args.kwargs["impersonate"] == "chrome"
    assert factory.call_args.kwargs["allow_redirects"] is False
    assert factory.call_args.kwargs["proxy"] == "http://proxy.example:8080"
    assert "User-Agent" not in factory.call_args.kwargs["headers"]
    session.close.assert_awaited_once()


@pytest.mark.parametrize(
    ("status", "body", "headers", "delay"),
    [
        (200, b"<title>Je bent bijna op de pagina die je zoekt [funda]</title>", {}, 0),
        (429, b"rate limit", {"retry-after": "90000"}, 90000),
    ],
)
async def test_chrome_transport_still_stops_on_restrictions(status, body, headers, delay):
    session = curl_session(body, status, headers)
    with patch("app.http_client.AsyncSession", return_value=session):
        async with ScraperClient(Settings(max_retries=4)) as client:
            with pytest.raises(SourceUnavailable) as error:
                await client.fetch("https://www.funda.nl/zoeken/koop")
    assert error.value.retry_after == delay
    session.get.assert_awaited_once()


async def test_chrome_transport_aborts_oversized_images():
    session = curl_session(b"123456789")
    with patch("app.http_client.AsyncSession", return_value=session):
        async with ScraperClient(Settings()) as client:
            assert await client.fetch_bytes("https://www.funda.nl/image.jpg", max_bytes=8) is None


async def test_chrome_transport_aborts_oversized_html_without_retry():
    session = curl_session(b"x" * (5 * 1024 * 1024 + 1))
    with patch("app.http_client.AsyncSession", return_value=session):
        async with ScraperClient(Settings()) as client:
            with pytest.raises(SourceUnavailable, match="5 MiB"):
                await client.fetch("https://www.funda.nl/zoeken/koop")
    session.get.assert_awaited_once()


async def test_chrome_network_error_uses_existing_retry_policy():
    session = curl_session(b"listing")
    respond = session.get.side_effect
    attempts = 0

    async def transient(*args, **kwargs):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise RequestsError("timeout")
        return await respond(*args, **kwargs)

    session.get.side_effect = transient
    with patch("app.http_client.AsyncSession", return_value=session):
        async with ScraperClient(Settings(retry_backoff_base_seconds=0)) as client:
            assert (await client.fetch("https://www.funda.nl/zoeken/koop")).text == "listing"
    assert attempts == 2


async def test_chrome_redirect_cannot_leave_source_origin():
    session = curl_session(b"", 302, {"location": "https://other.example/search"})
    with patch("app.http_client.AsyncSession", return_value=session):
        async with ScraperClient(Settings()) as client:
            with pytest.raises(ScrapeError, match="outside its HTTPS origin"):
                await client.fetch("https://www.funda.nl/zoeken/koop")
    session.get.assert_awaited_once()


async def test_http_override_keeps_funda_on_httpx():
    with patch("app.http_client.AsyncSession") as factory:
        async with ScraperClient(Settings(funda_transport="http")) as client:
            await client._client.aclose()
            client._client = httpx.AsyncClient(
                transport=httpx.MockTransport(lambda request: httpx.Response(200, text="listing"))
            )
            assert (await client.fetch("https://www.funda.nl/zoeken/koop")).text == "listing"
    factory.assert_not_called()
