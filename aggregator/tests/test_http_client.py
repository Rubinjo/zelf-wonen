from unittest.mock import AsyncMock

import httpx
import pytest

from app.config import Settings
from app.http_client import ScrapeError, ScraperClient, ScrapeResponse, SourceUnavailable


@pytest.mark.parametrize(
    "status,body",
    [
        (403, "Forbidden"),
        (401, "Unauthorized"),
        (200, "<title>Just a moment...</title>"),
        (200, "<title>Je bent bijna op de pagina die je zoekt [funda]</title>"),
    ],
)
async def test_rejects_blocks(status, body):
    async with ScraperClient(Settings(max_retries=0)) as client:
        client._request_once = AsyncMock(
            return_value=ScrapeResponse(
                "https://example.org",
                status,
                "text/html",
                body,
                "hash",
            )
        )
        with pytest.raises(ScrapeError):
            await client.fetch("https://example.org")


@pytest.mark.parametrize("status", [404, 410])
async def test_gone_response_reaches_adapter(status):
    async with ScraperClient(Settings(max_retries=0)) as client:
        client._request_once = AsyncMock(
            return_value=ScrapeResponse(
                "https://example.org",
                status,
                "text/html",
                "gone",
                "hash",
            )
        )
        assert (await client.fetch("https://example.org")).status_code == status


@pytest.mark.parametrize("status", [404, 410])
async def test_json_discovery_rejects_error_status_before_parsing(status):
    async with ScraperClient(Settings(max_retries=4)) as client:
        client._request_once = AsyncMock(
            return_value=ScrapeResponse(
                "https://example.org/search", status, "application/json", '{"items": []}', "hash"
            )
        )
        with pytest.raises(ScrapeError, match=f"HTTP {status} for https://example.org/search"):
            await client.fetch_json("https://example.org/search")
        client._request_once.assert_awaited_once()


@pytest.mark.parametrize("status", [401, 403, 429])
async def test_access_restrictions_do_not_retry_or_rotate(status):
    async with ScraperClient(Settings(max_retries=4)) as client:
        client._request_once = AsyncMock(
            return_value=ScrapeResponse(
                "https://example.org", status, "text/plain", "stop", "h", retry_after=90000
            )
        )
        with pytest.raises(SourceUnavailable) as error:
            await client.fetch("https://example.org")
        assert error.value.retry_after == 90000
        client._request_once.assert_awaited_once()


async def test_robots_disallow_warns_and_continues(caplog):
    async with ScraperClient(Settings(respect_robots=True)) as client:
        client._request_once = AsyncMock(
            side_effect=[
                ScrapeResponse(
                    "https://example.org/robots.txt",
                    200,
                    "text/plain",
                    "User-agent: *\nDisallow: /private\nCrawl-delay: 99999",
                    "h",
                ),
                ScrapeResponse("https://example.org/private", 200, "text/html", "listing", "h"),
            ]
        )
        assert (await client.fetch("https://example.org/private")).text == "listing"
        assert client._request_once.await_count == 2
        assert client._delay == 0
        assert "robots.txt disallows" in caplog.text


@pytest.mark.parametrize(
    "robots_result",
    [
        ScrapeResponse("https://example.org/robots.txt", 403, "text/plain", "denied", "h"),
        ScrapeResponse(
            "https://example.org/robots.txt",
            200,
            "text/html",
            "<!doctype html><title>Je bent bijna op de pagina die je zoekt</title>",
            "h",
        ),
        httpx.ReadTimeout("robots timeout"),
    ],
)
async def test_robots_failure_warns_once_and_does_not_block_pages(robots_result, caplog):
    async with ScraperClient(Settings(respect_robots=True)) as client:
        page = ScrapeResponse("https://example.org/listing", 200, "text/html", "listing", "h")
        client._request_once = AsyncMock(side_effect=[robots_result, page, page])
        await client.fetch("https://example.org/listing")
        await client.fetch("https://example.org/listing")
        assert client._request_once.await_count == 3
        assert caplog.text.count("robots.txt unavailable") == 1


async def test_transient_failure_recovers_with_same_user_agent():
    calls = []

    def respond(request):
        calls.append(request.headers["User-Agent"])
        return httpx.Response(503 if len(calls) == 1 else 200, text="ok")

    async with ScraperClient(Settings(retry_backoff_base_seconds=0)) as client:
        await client._client.aclose()
        client._client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
        assert (await client.fetch("https://example.org")).text == "ok"
    assert len(calls) == 2
    assert len(set(calls)) == 1


async def test_redirect_continues_despite_robots_disallow():
    requested = []

    def respond(request):
        requested.append(request.url.path)
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow: /private")
        if request.url.path == "/private":
            return httpx.Response(200, text="listing")
        return httpx.Response(302, headers={"Location": "/private"})

    async with ScraperClient(Settings(respect_robots=True)) as client:
        await client._client.aclose()
        client._client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
        assert (await client.fetch("https://example.org/start")).text == "listing"
    assert requested == ["/robots.txt", "/start", "/private"]


async def test_compressed_html_is_decoded_once():
    import gzip

    html = "<html>Test woning</html>"
    async with ScraperClient(Settings()) as client:
        await client._client.aclose()
        client._client = httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(
                    200, content=gzip.compress(html.encode()), headers={"Content-Encoding": "gzip"}
                )
            )
        )
        assert (await client.fetch("https://example.org/listing")).text == html
