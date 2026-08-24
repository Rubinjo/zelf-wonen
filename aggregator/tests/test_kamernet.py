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
