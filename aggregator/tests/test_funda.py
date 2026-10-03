from pathlib import Path

from app.adapters import DetailPayload
from app.adapters.funda import FundaAdapter
from app.models import ListingAvailability, ListingPurpose

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


def test_numeric_price_is_euros_and_house_suffix_is_preserved():
    listing = FundaAdapter().normalize(
        {
            "external_id": "1",
            "price_raw": 450000,
            "house_number": "42A",
        }
    )
    assert listing.asking_price_cents == 45_000_000
    assert listing.house_number == 42
    assert listing.house_number_addition == "A"


def test_nested_offer_sold_status():
    html = FUNDA_HTML.replace(
        '"priceCurrency": "EUR"', '"availability": "https://schema.org/SoldOut"'
    )
    adapter = FundaAdapter()
    parsed = adapter.parse_detail({}, DetailPayload("https://example.org", "text/html", html))
    assert adapter.normalize(parsed).availability == ListingAvailability.EXPIRED


def test_current_nuxt_detail_keeps_gallery_description_and_features():
    html = (Path(__file__).parent / "fixtures/funda-detail.html").read_text(encoding="utf-8")
    adapter = FundaAdapter()
    summary = {"external_id": "44522879", "url": "https://www.funda.nl/detail/koop/x/44522879/"}
    listing = adapter.normalize(
        adapter.parse_detail(summary, DetailPayload(summary["url"], "text/html", html))
    )
    assert len(listing.images) == 44
    assert listing.images[0].url == "https://cloud.funda.nl/valentina_media/235/802/920.jpg"
    assert listing.images[1].url == "https://cloud.funda.nl/valentina_media/235/802/902.jpg"
    assert "\n\nTweede verdieping\n" in listing.description
    assert listing.description.endswith("cv-ketel en zonnepanelen.")
    assert listing.postcode == "8939AR"
    assert listing.house_number == 11
    assert listing.living_area_sqm == 144
    assert listing.plot_area_sqm == 315
    assert listing.volume_cubic_meters == 555
    assert listing.bedroom_count == 4
    assert listing.bathroom_count == 1
    assert listing.energy_label.value == "A"
    assert listing.interior["verwarming"] == "Cv-ketel"
    assert listing.interior["tuin"] == "Achtertuin"
    assert "zonnepanelen" in listing.amenities
    assert listing.latitude == 53.18501


def test_html_description_and_gallery_fallback_excludes_unrelated_media():
    html = FUNDA_HTML.replace(
        "<body></body>",
        """<body>
      <section><h2>Omschrijving</h2><div data-testid="expandable-panel-header">
      Volledige omschrijving.<br>Tweede alinea met de indeling.</div></section>
      <div id="media">
        <a href="/media/fotos"><img src="https://img.example/1.jpg"></a>
        <a href="/media/fotos"><img src="https://img.example/2.jpg"></a>
        <a href="/media/videos"><img src="https://img.example/video.jpg"></a>
      </div><img src="https://img.example/broker.jpg">
      <dl><dt>Inhoud</dt><dd>250 m³</dd><dt>Isolatie</dt><dd>Dubbel glas</dd></dl>
    </body>""",
    )
    adapter = FundaAdapter()
    listing = adapter.normalize(
        adapter.parse_detail({}, DetailPayload("https://example.org", "text/html", html))
    )
    assert [image.url for image in listing.images] == [
        "https://img.example/1.jpg",
        "https://img.example/2.jpg",
    ]
    assert "Tweede alinea" in listing.description
    assert listing.volume_cubic_meters == 250
    assert listing.interior["isolatie"] == "Dubbel glas"
