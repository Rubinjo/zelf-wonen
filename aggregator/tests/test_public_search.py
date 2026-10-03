"""Reduced, synthetic fixtures matching observed public-page schemas.

Kamernet's Next.js field names/pagination were verified on 2026-09-29.
Funda fixtures cover JSON-LD and labelled HTML, not a claim of live access.
"""

import json
from unittest.mock import AsyncMock

import pytest

from app.adapters import DetailPayload
from app.adapters.funda import FundaAdapter
from app.adapters.kamernet import KamernetAdapter
from app.adapters.parsing import extract_embedded_json
from app.config import Settings
from app.http_client import ScrapeError, ScrapeResponse


def next_html(target):
    data = {
        "props": {
            "pageProps": {"targetPageProps": target, "hasError404": False, "hasError500": False}
        }
    }
    return '<script id="__NEXT_DATA__" type="application/json">' + json.dumps(data) + "</script>"


def response(html):
    return ScrapeResponse("https://kamernet.nl/huren/kamer-nederland", 200, "text/html", html, "h")


def search_page(page, ids, total=3):
    target = {
        "allFilters": {"pageNo": page, "listingsPerPage": 2},
        "findListingsResponse": {"listings": [{"listingId": i} for i in ids], "total": total},
    }
    return next_html(target) + "".join(
        f'<a href="/huren/kamer-utrecht/teststraat/kamer-{i}">Room</a>' for i in ids
    )


async def test_kamernet_public_pagination_and_overlap():
    client = AsyncMock()
    client.fetch.side_effect = [response(search_page(1, [1, 2])), response(search_page(2, [2, 3]))]
    adapter = KamernetAdapter(
        Settings(kamernet_search_urls="https://kamernet.nl/huren/kamer-utrecht")
    )
    results = [row async for row in adapter.discover(client)]
    assert [row["external_id"] for row in results] == ["1", "2", "3"]
    assert "pageNo=2" in client.fetch.call_args.args[0]


async def test_kamernet_search_cursor_resumes_at_next_page():
    settings = Settings(
        discovery_page_batch_size=1, kamernet_search_urls="https://kamernet.nl/huren/kamer-utrecht"
    )
    first = KamernetAdapter(settings)
    client = AsyncMock()
    client.fetch.return_value = response(search_page(1, [1, 2]))
    assert len([row async for row in first.discover(client)]) == 2
    assert not first.discovery_complete
    second = KamernetAdapter(settings)
    second.discovery_cursor = first.discovery_cursor
    client.fetch.return_value = response(search_page(2, [3]))
    assert len([row async for row in second.discover(client)]) == 1
    assert "pageNo=2" in client.fetch.call_args.args[0]
    assert second.discovery_complete


@pytest.mark.parametrize("second", [search_page(1, [1, 2]), "<html>changed</html>"])
async def test_kamernet_changed_page_or_ignored_pagination_fails(second):
    client = AsyncMock()
    client.fetch.side_effect = [response(search_page(1, [1, 2])), response(second)]
    with pytest.raises(ScrapeError):
        _ = [row async for row in KamernetAdapter().discover(client)]


def test_kamernet_detail_uses_listing_not_recommendations():
    detail = {
        "listingId": 123,
        "isActive": True,
        "isBlocked": False,
        "dutchTitle": "Test room",
        "computedStreetName": "Teststraat",
        "computedCityName": "Utrecht",
        "postalCode": "1234AB",
        "houseNumber": "12",
        "totalRentalPrice": 750,
        "surfaceArea": 18,
        "imageList": ["00000000-0000-0000-0000-000000000001"],
        "suggestedListingResult": [{"totalRentalPrice": 9999}],
    }
    html = next_html({"listingDetails": detail})
    adapter = KamernetAdapter()
    summary = {
        "external_id": "123",
        "url": "https://kamernet.nl/huren/kamer-123",
        "purpose_raw": "rent",
    }
    parsed = adapter.parse_detail(summary, DetailPayload(summary["url"], "text/html", html))
    listing = adapter.normalize(parsed)
    assert listing.monthly_rent_cents == 75000
    assert listing.street == "Teststraat"
    assert listing.images[0].url.endswith("00000000-0000-0000-0000-000000000001")
    with pytest.raises(ScrapeError, match="identity"):
        adapter.parse_detail(
            {**summary, "external_id": "456"}, DetailPayload(summary["url"], "text/html", html)
        )


async def test_funda_jsonld_search_canonical_ids_and_explicit_end():
    client = AsyncMock()
    url = "https://www.funda.nl/detail/koop/utrecht/huis-teststraat-12/12345678/"
    first = (
        '<script type="application/ld+json">'
        + json.dumps({"@graph": [{"@type": "ItemList", "itemListElement": [{"url": url}]}]})
        + "</script>"
    )
    empty = (
        '<script type="application/ld+json">'
        + json.dumps({"@type": "ItemList", "itemListElement": []})
        + "</script>"
    )
    client.fetch.side_effect = [response(first), response(empty)]
    adapter = FundaAdapter(Settings(funda_search_urls="https://www.funda.nl/zoeken/koop"))
    rows = [row async for row in adapter.discover(client)]
    assert rows == [{"external_id": "12345678", "url": url, "purpose_raw": "buy"}]
    assert "search_result=2" in client.fetch.call_args.args[0]
    assert (
        adapter._external_id("https://www.funda.nl/koop/utrecht/huis-12345678-teststraat/")
        == "12345678"
    )


async def test_funda_repeated_page_cannot_complete():
    client = AsyncMock()
    client.fetch.return_value = response('<a href="/detail/koop/test/12345678/">Test</a>')
    with pytest.raises(ScrapeError, match="repeated"):
        _ = [row async for row in FundaAdapter().discover(client)]


async def test_funda_last_page_pagination_does_not_request_past_end():
    client = AsyncMock()
    client.fetch.side_effect = [
        response('<a href="/detail/koop/test/12345678/">Test</a><a href="?search_result=2">2</a>'),
        response(
            '<a href="/detail/koop/test/12345679/">Test</a>'
            '<a href="?search_result=1">1</a><a href="?search_result=2">2</a>'
        ),
    ]
    adapter = FundaAdapter(Settings(funda_search_urls="https://www.funda.nl/zoeken/koop"))
    assert len([row async for row in adapter.discover(client)]) == 2
    assert adapter.discovery_complete
    assert client.fetch.await_count == 2


def test_funda_labelled_facts_without_jsonld():
    html = """<title>Te koop: Teststraat 12 1234 AB Utrecht [funda]</title>
    <dl><dt>Vraagprijs</dt><dd>€ 450.000 k.k.</dd><dt>Wonen</dt><dd>85 m²</dd>
    <dt>Aantal kamers</dt><dd>3 kamers (2 slaapkamers)</dd>
    <dt>Status</dt><dd>Verkocht</dd></dl>"""
    adapter = FundaAdapter()
    parsed = adapter.parse_detail({}, DetailPayload("https://www.funda.nl/test", "text/html", html))
    listing = adapter.normalize(parsed)
    assert listing.asking_price_cents == 45000000
    assert listing.city == "Utrecht"
    assert listing.bedroom_count == 2
    assert listing.availability.value == "EXPIRED"


def test_embedded_assignment_handles_nested_braces_and_semicolons():
    html = '<script>window.__INITIAL_STATE__ = {"listing":{"description":"a }; b"}};</script>'
    assert extract_embedded_json(html, ("__INITIAL_STATE__",))["listing"]["description"] == "a }; b"
