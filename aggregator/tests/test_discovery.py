from unittest.mock import AsyncMock

import pytest

from app.adapters.funda import FundaAdapter
from app.adapters.kamernet import KamernetAdapter
from app.config import Settings
from app.http_client import ScrapeError, ScrapeResponse


def xml(body):
    return ScrapeResponse("https://example.org", 200, "application/xml", body, "hash")


async def test_funda_sitemap_index_and_limit():
    client = AsyncMock()
    client.fetch.side_effect = [
        xml("""
        <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <sitemap><loc>https://example.org/child.xml</loc></sitemap>
        </sitemapindex>"""),
        xml("""
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url><loc>https://www.funda.nl/koop/12345678/</loc></url>
          <url><loc>https://www.funda.nl/huur/12345679/</loc></url>
        </urlset>"""),
    ]
    adapter = FundaAdapter(
        Settings(max_listings_per_source=1, funda_sitemap_url="https://example.org/root.xml")
    )
    with pytest.raises(ScrapeError, match="limit"):
        _ = [item async for item in adapter.discover(client)]
    assert client.fetch.await_count == 2


async def test_funda_bad_xml_fails():
    client = AsyncMock()
    client.fetch.return_value = xml("<html>not a sitemap")
    with pytest.raises(ScrapeError):
        _ = [
            item
            async for item in FundaAdapter(
                Settings(funda_sitemap_url="https://example.org/root.xml")
            ).discover(client)
        ]


async def test_kamernet_pages_until_explicit_empty_page():
    client = AsyncMock()
    client.fetch_json.side_effect = [
        {"items": [{"id": "1", "url": "/huren/1"}]},
        {"items": [{"id": "2", "url": "/huren/2"}]},
        {"items": []},
    ]
    items = [
        item
        async for item in KamernetAdapter(
            Settings(kamernet_search_url="https://example.org/search")
        ).discover(client)
    ]
    assert len(items) == 2
    assert items[0]["url"] == "https://kamernet.nl/huren/1"
    assert items[0]["purpose_raw"] == "rent"


async def test_kamernet_repeated_page_fails():
    client = AsyncMock()
    client.fetch_json.return_value = {"items": [{"id": "1", "url": "/huren/1"}]}
    with pytest.raises(ScrapeError, match="repeated"):
        _ = [
            item
            async for item in KamernetAdapter(
                Settings(kamernet_search_url="https://example.org/search")
            ).discover(client)
        ]


def test_kamernet_unknown_schema_is_not_empty_success():
    with pytest.raises(ScrapeError):
        KamernetAdapter._extract_cards({"error": "denied"})


@pytest.mark.parametrize("status", [404, 410])
async def test_funda_missing_sitemap_reports_http_error(status):
    client = AsyncMock()
    client.fetch.return_value = ScrapeResponse(
        "https://example.org/missing.xml", status, "application/xml", "", "hash"
    )
    with pytest.raises(ScrapeError, match=f"HTTP {status} for https://example.org/missing.xml"):
        _ = [
            item
            async for item in FundaAdapter(
                Settings(funda_sitemap_url="https://example.org/root.xml")
            ).discover(client)
        ]
