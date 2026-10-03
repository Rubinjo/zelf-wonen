from pathlib import Path

from app.adapters import DetailPayload
from app.adapters.kamernet import KamernetAdapter
from app.models import ListingPurpose


def test_kamernet_extract_cards_handles_nested_shapes():
    adapter = KamernetAdapter()
    cards = adapter._extract_cards(
        {"data": {"listings": [{"id": "abc", "url": "https://kamernet.nl/x"}]}}
    )
    assert len(cards) == 1
    assert cards[0]["id"] == "abc"


def test_kamernet_normalize():
    adapter = KamernetAdapter()
    merged = {
        "external_id": "abc",
        "url": "https://kamernet.nl/huren/amsterdam/kamer/abc",
        "purpose_raw": "rent",
        "title": "Kamer in Amsterdam",
        "price_raw": "850",
        "street": "Kalverstraat",
        "house_number": "42",
        "postcode": "1012 AB",
        "city": "Amsterdam",
        "living_area_sqm": "14",
        "room_count": "1",
        "energy_label": "C",
    }
    listing = adapter.normalize(merged)
    assert listing.purpose is ListingPurpose.RENT
    assert listing.monthly_rent_cents == 85_000
    assert listing.street == "Kalverstraat"
    assert listing.postcode == "1012AB"
    assert listing.room_count == 1


def test_current_kamernet_detail_preserves_facilities_and_rental_terms():
    html = (Path(__file__).parent / "fixtures/kamernet-detail.html").read_text(encoding="utf-8")
    adapter = KamernetAdapter()
    summary = {
        "external_id": "2408944",
        "url": "https://kamernet.nl/huren/kamer-arnhem/de-houtmanstraat/kamer-2408944",
        "purpose_raw": "rent",
    }
    listing = adapter.normalize(
        adapter.parse_detail(summary, DetailPayload(summary["url"], "text/html", html))
    )
    assert listing.monthly_rent_cents == 47500
    assert listing.living_area_sqm == 12
    assert len(listing.images) == 5
    assert "Gedeelde keuken" in listing.amenities
    assert "Gedeelde badkamer" in listing.amenities
    assert "Internet beschikbaar" in listing.amenities
    assert listing.energy_label is None
    assert listing.bathroom_count is None  # A shared bathroom is not a private bathroom count.
    assert listing.service_costs_cents is None
    assert listing.interior["Inrichting"] == "Gemeubileerd"
    assert listing.interior["Huisdieren toegestaan"] == "Nee"
    assert listing.interior["Borg"] == "€ 500"
    assert listing.interior["Inclusief vaste lasten"] == "Ja"
    assert listing.interior["Beschikbaar tot"] == "2027-07-01T00:00:00"
