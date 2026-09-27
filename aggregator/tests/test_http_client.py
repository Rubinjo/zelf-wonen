from unittest.mock import AsyncMock

import pytest

from app.config import Settings
from app.http_client import ScrapeError, ScraperClient, ScrapeResponse


@pytest.mark.parametrize(
    "status,body",
    [
        (403, "Forbidden"),
        (401, "Unauthorized"),
        (200, "<title>Just a moment...</title>"),
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
