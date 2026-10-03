"""Funda adapter.

Funda renders server-side HTML with schema.org JSON-LD and OpenGraph meta tags.
Discovery uses public search pages, with an optional legacy sitemap override.
Detail pages use Nuxt state, JSON-LD and labelled HTML facts. A contracted feed with a
different schema needs its own adapter.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from collections.abc import AsyncIterator
from typing import Any
from urllib.parse import parse_qs, urlsplit

from selectolax.parser import HTMLParser

from ..config import Settings
from ..http_client import ScrapeError, ScraperClient
from ..models import ListingPurpose, ListingSource, NormalizedListing
from ..normalizer import (
    clean_text,
    normalize_availability,
    normalize_energy_label,
    normalize_house_number,
    normalize_house_number_addition,
    normalize_images,
    normalize_postcode,
    normalize_price_cents,
    normalize_property_type,
    normalize_purpose,
    pick_text,
)
from . import DetailPayload, ListingGone, SourceAdapter
from .parsing import (
    extract_embedded_json,
    extract_json_ld,
    extract_labelled_facts,
    extract_meta,
    extract_nuxt_data,
    find_objects,
    first_number,
)
from .search import listing_links, page_url, source_url

_FUNDA_ID = re.compile(r"(?:/|(?:huis|appartement|woning|studio)-)(\d{8})(?:[-/]|$)")
_LISTING_URL = re.compile(r"/(koop|huur)/")


class FundaAdapter(SourceAdapter):
    source = ListingSource.FUNDA
    display_name = "Funda"
    brand_hex = "#F7A100"  # Funda orange

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or Settings()
        self.discovery_cursor = {}

    async def discover(self, client: ScraperClient) -> AsyncIterator[dict[str, Any]]:
        if not self.settings.funda_sitemap_url:
            async for summary in self._discover_search(client):
                yield summary
            return
        async for summary in self._discover_sitemap(client):
            yield summary

    async def _discover_search(self, client: ScraperClient) -> AsyncIterator[dict[str, Any]]:
        self.discovery_complete = False
        seen: set[str] = set()
        seeds = [url.strip() for url in self.settings.funda_search_urls.split("|") if url.strip()]
        if not seeds:
            raise ScrapeError("Funda search URLs are empty")
        resume = dict(self.discovery_cursor)
        fetched = 0
        for seed_index, seed in enumerate(seeds):
            if seed_index < resume.get("seed", 0):
                continue
            source_url(seed, self.settings.funda_base_url)
            previous_pages: set[tuple[str, ...]] = set()
            start = resume.get("page", 1) if seed_index == resume.get("seed", 0) else 1
            for page in range(start, self.settings.max_pages_per_search + 1):
                self.discovery_cursor = {"seed": seed_index, "page": page}
                response = await client.fetch(page_url(seed, "search_result", page))
                fetched += 1
                response.require_success()
                lists = [
                    obj for obj in extract_json_ld(response.text) if obj.get("@type") == "ItemList"
                ]
                links = listing_links(response.text, self.settings.funda_base_url, _FUNDA_ID)
                links = {key: url for key, url in links.items() if _LISTING_URL.search(url)}
                for obj in lists:
                    entries = obj.get("itemListElement")
                    if not isinstance(entries, list):
                        raise ScrapeError("invalid Funda ItemList")
                    for entry in entries:
                        if not isinstance(entry, dict):
                            raise ScrapeError("invalid Funda search item")
                        item = entry.get("item", entry)
                        url = item.get("url") if isinstance(item, dict) else item
                        if not isinstance(url, str) or not _FUNDA_ID.search(url):
                            raise ScrapeError("Funda search item has no listing URL")
                        links[self._external_id(url)] = source_url(
                            url, self.settings.funda_base_url
                        )
                if not links:
                    if lists and all(obj.get("itemListElement") == [] for obj in lists):
                        break
                    raise ScrapeError("Funda search lacks recognized listing data")
                fingerprint = tuple(sorted(links))
                if fingerprint in previous_pages:
                    raise ScrapeError("Funda search repeated a page; discovery incomplete")
                previous_pages.add(fingerprint)
                for external_id, url in links.items():
                    if external_id in seen:
                        continue
                    seen.add(external_id)
                    if len(seen) > self.settings.max_listings_per_source:
                        raise ScrapeError("Funda listing limit reached; discovery incomplete")
                    yield {
                        "external_id": external_id,
                        "url": url,
                        "purpose_raw": "rent" if "/huur" in seed else "buy",
                    }
                # Missing pagination markup is not evidence of complete coverage.
                tree = HTMLParser(response.text)
                if tree.css_first('[rel="next"][aria-disabled="true"]'):
                    break
                page_numbers = set()
                for anchor in tree.css("a[href]"):
                    href = anchor.attributes.get("href", "")
                    values = parse_qs(urlsplit(href).query).get("search_result", [])
                    if values and values[0].isdigit():
                        page_numbers.add(int(values[0]))
                if page_numbers and page - 1 in page_numbers and max(page_numbers) <= page:
                    break
                self.discovery_cursor = {"seed": seed_index, "page": page + 1}
                if fetched >= self.settings.discovery_page_batch_size:
                    return
            else:
                raise ScrapeError("Funda page limit reached; discovery incomplete")
            self.discovery_cursor = {"seed": seed_index + 1, "page": 1}
            if fetched >= self.settings.discovery_page_batch_size and seed_index < len(seeds) - 1:
                return
        self.discovery_complete = True
        self.discovery_cursor = {}

    async def _discover_sitemap(self, client: ScraperClient) -> AsyncIterator[dict[str, Any]]:
        pending = [self.settings.funda_sitemap_url]
        visited: set[str] = set()
        seen: set[str] = set()
        count = 0
        ns = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
        while pending:
            sitemap_url = pending.pop()
            if not sitemap_url or sitemap_url in visited:
                raise ScrapeError("empty or cyclic Funda sitemap")
            visited.add(sitemap_url)
            if len(visited) > 1000:
                raise ScrapeError("Funda sitemap traversal limit exceeded")
            response = await client.fetch(sitemap_url)
            response.require_success()
            try:
                root = ET.fromstring(response.text)
            except ET.ParseError as exc:
                raise ScrapeError(f"invalid Funda sitemap XML from {sitemap_url}") from exc
            if root.tag == f"{ns}sitemapindex":
                pending.extend((loc.text or "").strip() for loc in root.iter(f"{ns}loc"))
                continue
            if root.tag != f"{ns}urlset":
                raise ScrapeError("unexpected Funda sitemap format")
            for loc in root.iter(f"{ns}loc"):
                url = (loc.text or "").strip()
                if not _LISTING_URL.search(url) or url in seen:
                    continue
                seen.add(url)
                count += 1
                if count > self.settings.max_listings_per_source:
                    raise ScrapeError("Funda listing limit reached; discovery incomplete")
                yield {
                    "external_id": self._external_id(url),
                    "url": url,
                    "purpose_raw": "rent" if "/huur/" in url else "buy",
                }

    async def fetch_detail(self, client: ScraperClient, summary: dict[str, Any]) -> DetailPayload:
        response = await client.fetch(summary["url"], referer=self.settings.funda_base_url)
        if response.status_code in (404, 410):
            raise ListingGone(f"funda listing gone: {summary['url']}")
        if response.url != summary["url"] and self._external_id(response.url) != str(
            summary["external_id"]
        ):
            raise ScrapeError("Funda detail redirected away from the listing")
        return DetailPayload(
            url=summary["url"],
            content_type=response.content_type,
            body=response.text,
        )

    def parse_detail(self, summary: dict[str, Any], payload: DetailPayload) -> dict[str, Any]:
        html = payload.body
        meta = extract_meta(html)
        objects = find_objects(
            html, {"product", "residence", "realestatelisting", "offer", "apartment", "house"}
        )
        result: dict[str, Any] = dict(summary)

        # --- JSON-LD is the richest signal ----------------------------------
        offer = next(
            (obj for obj in objects if obj.get("price") or obj.get("offers") or "address" in obj),
            {},
        )
        address = offer.get("address") or {}
        if isinstance(address, list):
            address = address[0] if address else {}
        if not isinstance(address, dict):
            address = {}

        result["title"] = pick_text(offer.get("name"), meta.get("og:title"), summary.get("title"))
        result["description"] = pick_text(offer.get("description"), meta.get("og:description"))
        result["street"] = pick_text(address.get("streetAddress"), _split_address(offer, meta))
        result["postcode"] = pick_text(address.get("postalCode"), meta.get("og:postal-code"))
        result["city"] = pick_text(address.get("addressLocality"), meta.get("og:city"))
        result["house_number"] = (
            address.get("houseNumber")
            or _house_number_from_meta(meta)
            or _house_number_from_text(result.get("street"))
        )
        result["house_number_addition"] = address.get("houseNumberAddition") or (
            normalize_house_number_addition(address.get("houseNumber"))
            or normalize_house_number_addition(result.get("street"))
        )
        result["images"] = _images(offer, meta)
        result["latitude"] = _geo(offer, meta, "latitude")
        result["longitude"] = _geo(offer, meta, "longitude")
        result["living_area_sqm"] = _area(offer)
        result["room_count"] = offer.get("numberOfRooms")
        result["bedroom_count"] = offer.get("numberOfBedrooms")
        result["construction_year"] = offer.get("yearBuilt")
        result["energy_label"] = pick_text(offer.get("energyLabel"), meta.get("og:energy-label"))

        # Prices: JSON-LD nests prices under `offers`; keep raw for normalizer.
        result["price_raw"] = _price(offer) or meta.get("product:price:amount")
        nested_offer = offer.get("offers") or {}
        if isinstance(nested_offer, list):
            nested_offer = nested_offer[0] if nested_offer else {}
        result["status_raw"] = (
            offer.get("availability")
            or (nested_offer.get("availability") if isinstance(nested_offer, dict) else None)
            or meta.get("og:status")
        )

        # --- Fall back to embedded state / regex on raw HTML -----------------
        if not result.get("street") or not result.get("postcode"):
            state = extract_embedded_json(html, ("__INITIAL_STATE__", "__NEXT_DATA__"))
            result["embedded"] = state
        # Labelled facts survive CSS changes and supplement incomplete JSON-LD.
        tree = HTMLParser(html)
        facts = extract_labelled_facts(html)
        state = extract_nuxt_data(html).get("data", {})
        detail = (
            next(
                (
                    value
                    for key, value in state.items()
                    if key.startswith("cachedListingData_")
                    and key.endswith(f"_{summary.get('external_id')}")
                    and isinstance(value, dict)
                ),
                {},
            )
            if isinstance(state, dict)
            else {}
        )
        if detail:
            # State also supplies facts when the HTML feature panel is absent.
            if detail.get("features"):
                facts = {}

            def feature_facts(items: list[dict[str, Any]]) -> None:
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    label = clean_text(item.get("Label")).lower()
                    value = item.get("EnergyLabel") or item.get("Value")
                    if label and value:
                        text = HTMLParser(str(value)).text(separator=" ")
                        facts.setdefault(label, clean_text(text))
                    feature_facts(item.get("KenmerkenList") or [])

            feature_facts(detail.get("features") or [])
            address = detail.get("address") or {}
            for key, state_key in {
                "street": "addressTitle",
                "postcode": "postcode",
                "city": "city",
                "house_number": "houseNumber",
                "province": "province",
            }.items():
                result[key] = result.get(key) or address.get(state_key)
            result["price_raw"] = (detail.get("price") or {}).get("numericPrice") or result.get(
                "price_raw"
            )
        description = detail.get("description") or {}
        if isinstance(description, dict) and description.get("content"):
            result["description"] = description["content"]
        else:
            for heading in tree.css("h2, h3"):
                if clean_text(heading.text()).lower() == "omschrijving":
                    panel = heading.parent.css_first('[data-testid="expandable-panel-header"]')
                    if panel is not None:
                        result["description"] = panel.text(separator="\n").strip()
                        break
        photos = (detail.get("media") or {}).get("photos") or {}
        if isinstance(photos, dict):
            template = photos.get("mediaBaseUrl", "")
            if isinstance(template, str) and "{id}" in template:
                result["images"] = [
                    {"url": template.replace("{id}", str(item["id"]))}
                    for item in photos.get("items", [])
                    if isinstance(item, dict) and item.get("id")
                ] or result["images"]
        if not photos.get("items"):
            # Restrict HTML fallback to listing photos, excluding video thumbnails,
            # broker logos, recommendations and virtual styling previews.
            gallery = tree.css('#media a[href*="/media/fotos"] img')
            if gallery:
                result["images"] = [
                    {"url": n.attributes["src"]} for n in gallery if n.attributes.get("src")
                ]
        coordinates = detail.get("coordinates") or {}
        result["latitude"] = result.get("latitude") or coordinates.get("lat")
        result["longitude"] = result.get("longitude") or coordinates.get("lng")
        title = result.get("title") or (
            tree.css_first("title").text() if tree.css_first("title") else ""
        )
        address_match = re.search(
            r"(?:Te koop:|Te huur:|Huis te koop:|Appartement te koop:)\s*(.*?)\s+"
            r"(\d{4}\s?[A-Z]{2})\s+(.+?)(?:\s*\[|\s*\||$)",
            title,
            re.IGNORECASE,
        )
        if address_match:
            result["street"] = result.get("street") or address_match[1]
            result["postcode"] = result.get("postcode") or address_match[2]
            result["city"] = result.get("city") or address_match[3]
            result["house_number"] = result.get("house_number") or _house_number_from_text(
                address_match[1]
            )
        if not result.get("price_raw"):
            price = facts.get("vraagprijs") or facts.get("huurprijs") or ""
            match = re.search(r"€\s*([\d.,]+)", price)
            result["price_raw"] = match[1] if match else None
        for key, labels in {
            "living_area_sqm": ("wonen", "woonoppervlakte"),
            "plot_area_sqm": ("perceel", "perceeloppervlakte"),
            "volume_cubic_meters": ("inhoud",),
            "construction_year": ("bouwjaar",),
            "room_count": ("aantal kamers",),
            "bathroom_count": ("aantal badkamers",),
        }.items():
            if not result.get(key):
                result[key] = next(
                    (first_number(facts[label]) for label in labels if label in facts), None
                )
        result["energy_label"] = result.get("energy_label") or facts.get("energielabel")
        result["status_raw"] = result.get("status_raw") or facts.get("status")
        # Keep the full labelled feature set; only some facts have dedicated columns.
        result["interior"] = {
            label: value
            for label, value in facts.items()
            if label not in {"inwoners", "gezin met kinderen", "gem. vraagprijs / m²"}
        }
        for key, label in {
            "garden": "tuin",
            "balcony": "balkon",
            "garage": "soort garage",
            "storage": "schuur/berging",
        }.items():
            result[key] = facts.get(label)
        result["amenities"] = [
            clean_text(item)
            for item in re.split(r",|\s+en\s+", facts.get("voorzieningen", ""))
            if clean_text(item)
        ]
        result["property_type"] = facts.get("soort woonhuis") or facts.get("soort appartement")
        if not result.get("property_type"):
            result["property_type"] = "apartment" if "appartement" in payload.url else "house"
        bedrooms = re.search(r"(\d+)\s*slaapkamer", facts.get("aantal kamers", ""))
        if bedrooms and not result.get("bedroom_count"):
            result["bedroom_count"] = int(bedrooms[1])
        return result

    def normalize(self, merged: dict[str, Any]) -> NormalizedListing:
        purpose = normalize_purpose(merged.get("purpose_raw") or merged.get("purpose"))
        postcode = normalize_postcode(merged.get("postcode"))
        house_number = normalize_house_number(merged.get("house_number")) or 0
        street = clean_text(merged.get("street") or _split_address(merged, {}) or "Onbekend")
        city = clean_text(merged.get("city") or "Onbekend")
        price_cents = normalize_price_cents(
            str(merged.get("price_raw") or merged.get("price") or "")
        )
        availability = normalize_availability(merged.get("status_raw") or merged.get("status"))

        return NormalizedListing(
            source=ListingSource.FUNDA,
            external_id=str(merged.get("external_id") or ""),
            url=str(merged.get("url") or ""),
            purpose=purpose,
            availability=availability,
            title=clean_text(merged.get("title")) or None,
            description="\n".join(
                clean_text(line) for line in str(merged.get("description") or "").splitlines()
            ).strip()
            or None,
            asking_price_cents=price_cents if purpose == ListingPurpose.SALE else None,
            monthly_rent_cents=price_cents if purpose == ListingPurpose.RENT else None,
            street=street,
            house_number=house_number,
            house_number_addition=merged.get("house_number_addition")
            or (
                normalize_house_number_addition(merged.get("house_number"))
                or normalize_house_number_addition(street)
            ),
            postcode=postcode,
            city=city,
            municipality=clean_text(merged.get("municipality")) or None,
            province=clean_text(merged.get("province")) or None,
            latitude=_float(merged.get("latitude")),
            longitude=_float(merged.get("longitude")),
            property_type=normalize_property_type(
                merged.get("property_type") or merged.get("type")
            ),
            living_area_sqm=_float(merged.get("living_area_sqm")),
            plot_area_sqm=_float(merged.get("plot_area_sqm")),
            volume_cubic_meters=_float(merged.get("volume_cubic_meters")),
            room_count=_int(merged.get("room_count")),
            bedroom_count=_int(merged.get("bedroom_count")),
            bathroom_count=_int(merged.get("bathroom_count")),
            construction_year=_int(merged.get("construction_year")),
            energy_label=normalize_energy_label(merged.get("energy_label")),
            interior=self._interior(merged),
            amenities=self._amenities(merged),
            images=normalize_images(merged.get("images")),
        )

    # --- helpers ------------------------------------------------------------

    @staticmethod
    def _external_id(url: str) -> str:
        match = _FUNDA_ID.search(url)
        return match.group(1) if match else url

    @staticmethod
    def _interior(merged: dict[str, Any]) -> dict[str, str]:
        interior: dict[str, str] = dict(merged.get("interior") or {})
        for key in ("garden", "balcony", "garage", "storage"):
            value = clean_text(merged.get(key))
            if value:
                interior[key] = value
        return interior

    @staticmethod
    def _amenities(merged: dict[str, Any]) -> list[str]:
        raw = merged.get("amenities") or merged.get("features") or []
        if isinstance(raw, str):
            raw = [item.strip() for item in raw.split(",") if item.strip()]
        return [clean_text(item) for item in raw if clean_text(item)]


def _split_address(offer: dict[str, Any], meta: dict[str, str]) -> str | None:
    street = offer.get("street") or meta.get("og:street")
    if street:
        return clean_text(street)
    name = clean_text(offer.get("name") or meta.get("og:title") or "")
    # Funda titles look like "Te koop: Kalverstraat 42 1012 AB Amsterdam".
    match = re.search(r":\s*([A-Za-zÀ-ÿ' -]+?)\s+\d+", name)
    return clean_text(match.group(1)) if match else None


def _house_number_from_meta(meta: dict[str, str]) -> int | None:
    return normalize_house_number(meta.get("og:house-number"))


def _house_number_from_text(value: str | None) -> int | None:
    return normalize_house_number(value)


def _images(offer: dict[str, Any], meta: dict[str, str]) -> list[dict[str, Any]]:
    images = offer.get("image") or offer.get("photo") or []
    if isinstance(images, str):
        images = [images]
    if images:
        return [{"url": item} if isinstance(item, str) else item for item in images]
    og_images = meta.get("og:image") or meta.get("og:image:url")
    return [{"url": og_images}] if og_images else []


def _price(offer: dict[str, Any]) -> Any:
    if offer.get("price"):
        return offer["price"]
    offers = offer.get("offers")
    if isinstance(offers, dict):
        return offers.get("price")
    if isinstance(offers, list) and offers:
        return offers[0].get("price") if isinstance(offers[0], dict) else None
    return None


def _area(offer: dict[str, Any]) -> Any:
    floor_size = offer.get("floorSize")
    if isinstance(floor_size, dict):
        return floor_size.get("value") or floor_size.get("floorSizeValue")
    return floor_size or offer.get("floorSizeValue")


def _geo(offer: dict[str, Any], meta: dict[str, str], axis: str) -> float | None:
    geo = offer.get("geo") or {}
    value = geo.get(axis)
    if value is None:
        value = meta.get(f"og:{axis}")
    return _float(value)


def _float(value: Any) -> float | None:
    try:
        return float(str(value).replace(",", ".").replace("m²", "").replace("m2", "").strip())
    except (TypeError, ValueError):
        return None


def _int(value: Any) -> int | None:
    try:
        return int(float(str(value).replace(",", ".")))
    except (TypeError, ValueError):
        return None
