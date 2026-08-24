from app.adapters import DetailPayload
from app.adapters.funda import FundaAdapter
from app.models import ListingPurpose

FUNDA_HTML = """
<html>
<head>
  <title>Te koop: Kalverstraat 42 1012 AB Amsterdam</title>
  <meta property="og:title" content="Te koop: Kalverstraat 42 1012 AB Amsterdam" />
  <meta property="og:description" content="Licht appartement in het centrum." />
  <script type="application/ld+json">
  {
    "@type": "Product",
    "name": "Te koop: Kalverstraat 42 1012 AB Amsterdam",
    "description": "Licht appartement in het centrum.",
    "offers": {"price": "450000", "priceCurrency": "EUR"},
    "floorSize": {"value": "85"},
    "numberOfRooms": 3,
    "yearBuilt": 1900,
    "image": ["https://img.funda.example/1.jpg"],
    "address": {
      "streetAddress": "Kalverstraat 42",
      "postalCode": "1012AB",
      "addressLocality": "Amsterdam"
    }
  }
  </script>
</head>
<body></body>
</html>
"""


def test_funda_parse_and_normalize():
    adapter = FundaAdapter()
    summary = {
        "external_id": "12345678",
        "url": "https://www.funda.nl/koop/amsterdam/12345678/",
        "purpose_raw": "buy",
    }
    payload = DetailPayload(url=summary["url"], content_type="text/html", body=FUNDA_HTML)
    parsed = adapter.parse_detail(summary, payload)
    listing = adapter.normalize({**summary, **parsed})

    assert listing.external_id == "12345678"
    assert listing.purpose is ListingPurpose.SALE
    assert listing.asking_price_cents == 45_000_000
    assert listing.street == "Kalverstraat 42"
    assert listing.postcode == "1012AB"
    assert listing.city == "Amsterdam"
    assert listing.living_area_sqm == 85.0
    assert listing.room_count == 3
    assert listing.construction_year == 1900
    assert listing.images[0].url == "https://img.funda.example/1.jpg"


def test_funda_normalize_from_summary_only():
    adapter = FundaAdapter()
    summary = {
        "external_id": "12345678",
        "url": "https://www.funda.nl/huur/amsterdam/12345678/",
        "purpose_raw": "rent",
    }
    listing = adapter.normalize(summary)
    assert listing.purpose is ListingPurpose.RENT
    assert listing.house_number == 0  # unknown until detail fetched
