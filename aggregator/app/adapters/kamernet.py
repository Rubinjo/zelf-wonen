"""Kamernet adapter.

Kamernet is a JavaScript SPA: search results come back as JSON and detail pages
embed JSON-LD plus a ``window.__INITIAL_STATE__`` blob. This adapter reads the
JSON search endpoint for discovery and parses the detail page's JSON-LD /
embedded state for the full record.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any
from urllib.parse import quote

from ..config import Settings
from ..http_client import ScraperClient
from ..models import ListingPurpose, ListingSource, NormalizedListing
from ..normalizer import (
    clean_text,
    normalize_availability,
    normalize_energy_label,
    normalize_house_number,
    normalize_images,
    normalize_postcode,
    normalize_price_cents,
    normalize_property_type,
    normalize_purpose,
    pick_text,
)
from . import DetailPayload, ListingGone, SourceAdapter
from .parsing import deep_get, extract_embedded_json, extract_json_ld, extract_meta


class KamernetAdapter(SourceAdapter):
    source = ListingSource.KAMERNET
    display_name = "Kamernet"
    brand_hex = "#0A2E4D"  # Kamernet navy

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or Settings()

    async def discover(self, client: ScraperClient) -> AsyncIterator[dict[str, Any]]:
        base = self.settings.kamernet_search_url
        if not base:
            return
        page = 1
        count = 0
        while count < self.settings.max_listings_per_source:
            url = self._search_url(base, page)
            data = await client.fetch_json(url, referer=self.settings.kamernet_base_url)
            listings = self._extract_cards(data)
            if not listings:
                break
            for card in listings:
                external_id = str(
                    card.get("id")
                    or card.get("listingId")
                    or card.get("objectId")
                    or card.get("uuid")
                    or ""
                )
                listing_url = card.get("url") or card.get("shareUrl") or card.get("link")
                if not external_id or not listing_url:
                    continue
                count += 1
                if count > self.settings.max_listings_per_source:
                    break
                yield {
                    "external_id": external_id,
                    "url": listing_url,
                    "purpose_raw": card.get("purpose") or card.get("listingType"),
                    "title": card.get("title") or card.get("name"),
                    "price_raw": card.get("price")
                    or card.get("rentPrice")
                    or card.get("priceTotal"),
                    "status_raw": card.get("status"),
                    "city": card.get("city") or deep_get(card, "address", "city"),
                    "street": card.get("street") or deep_get(card, "address", "street"),
                    "house_number": card.get("houseNumber")
                    or deep_get(card, "address", "houseNumber"),
                    "postcode": card.get("postcode") or deep_get(card, "address", "postcode"),
                    "images": card.get("images") or card.get("photos") or [],
                }
            if len(listings) < self._page_size:
                break
            page += 1

    async def fetch_detail(self, client: ScraperClient, summary: dict[str, Any]) -> DetailPayload:
        response = await client.fetch(summary["url"], referer=self.settings.kamernet_base_url)
        if response.status_code in (404, 410):
            raise ListingGone(f"kamernet listing gone: {summary['url']}")
        return DetailPayload(
            url=summary["url"],
            content_type=response.content_type,
            body=response.text,
        )

    def parse_detail(self, summary: dict[str, Any], payload: DetailPayload) -> dict[str, Any]:
        html = payload.body
        result: dict[str, Any] = dict(summary)
        meta = extract_meta(html)

        # Kamernet embeds its data model in JSON-LD and __INITIAL_STATE__.
        json_ld = extract_json_ld(html)
        state = extract_embedded_json(html, ("__INITIAL_STATE__", "__NEXT_DATA__"))

        address = self._address(json_ld, state)
        result["title"] = pick_text(
            self._from_state(state, "title"), meta.get("og:title"), summary.get("title")
        )
        result["description"] = pick_text(
            self._from_state(state, "description"), meta.get("og:description")
        )
        result["street"] = pick_text(
            address.get("street"), summary.get("street"), meta.get("og:street")
        )
        result["postcode"] = pick_text(
            address.get("postcode"), summary.get("postcode"), meta.get("og:postal-code")
        )
        result["city"] = pick_text(address.get("city"), summary.get("city"), meta.get("og:city"))
        result["house_number"] = pick_text(address.get("houseNumber"), summary.get("house_number"))
        result["price_raw"] = pick_text(
            self._from_state(state, "price"),
            self._from_state(state, "rentPrice"),
            summary.get("price_raw"),
            meta.get("product:price:amount"),
        )
        result["status_raw"] = pick_text(
            self._from_state(state, "status"), summary.get("status_raw")
        )
        result["living_area_sqm"] = pick_text(
            self._from_state(state, "surfaceArea"),
            self._from_state(state, "livingArea"),
        )
        result["room_count"] = pick_text(self._from_state(state, "numberOfRooms"))
        result["bedroom_count"] = pick_text(self._from_state(state, "numberOfBedrooms"))
        result["construction_year"] = pick_text(self._from_state(state, "constructionYear"))
        result["energy_label"] = pick_text(self._from_state(state, "energyLabel"))
        result["property_type"] = pick_text(
            self._from_state(state, "propertyType"), self._from_state(state, "type")
        )
        result["amenities"] = self._from_state(state, "amenities") or self._from_state(
            state, "facilities"
        )
        result["images"] = (
            self._from_state(state, "images")
            or self._from_state(state, "photos")
            or summary.get("images")
            or []
        )
        return result

    def normalize(self, merged: dict[str, Any]) -> NormalizedListing:
        purpose = normalize_purpose(merged.get("purpose_raw") or merged.get("purpose"))
        postcode = normalize_postcode(merged.get("postcode"))
        house_number = normalize_house_number(merged.get("house_number")) or 0
        street = clean_text(merged.get("street") or "Onbekend")
        city = clean_text(merged.get("city") or "Onbekend")
        price_cents = normalize_price_cents(merged.get("price_raw") or merged.get("price"))
        availability = normalize_availability(merged.get("status_raw") or merged.get("status"))

        return NormalizedListing(
            source=ListingSource.KAMERNET,
            external_id=str(merged.get("external_id") or ""),
            url=str(merged.get("url") or ""),
            purpose=purpose,
            availability=availability,
            title=clean_text(merged.get("title")) or None,
            description=clean_text(merged.get("description")) or None,
            asking_price_cents=price_cents if purpose == ListingPurpose.SALE else None,
            monthly_rent_cents=price_cents if purpose == ListingPurpose.RENT else None,
            street=street,
            house_number=house_number,
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

    _page_size = 50

    def _search_url(self, base: str, page: int) -> str:
        separator = "&" if "?" in base else "?"
        return (f"{base}{separator}page={page}&pageSize={self._page_size}&city={quote('')}").rstrip(
            "&city="
        )

    @staticmethod
    def _extract_cards(data: dict[str, Any]) -> list[dict[str, Any]]:
        if isinstance(data, list):
            return data
        for key in ("listings", "results", "items", "data", "records"):
            value = data.get(key)
            if isinstance(value, list):
                return value
            if isinstance(value, dict):
                nested = KamernetAdapter._extract_cards(value)
                if nested:
                    return nested
        return []

    @staticmethod
    def _address(json_ld: list[dict[str, Any]], state: dict[str, Any]) -> dict[str, Any]:
        for obj in json_ld:
            address = obj.get("address")
            if isinstance(address, dict) and address.get("streetAddress"):
                return {
                    "street": address.get("streetAddress"),
                    "postcode": address.get("postalCode"),
                    "city": address.get("addressLocality"),
                    "houseNumber": address.get("houseNumber"),
                }
        address = deep_get(state, "listing", "address") or deep_get(state, "address")
        return address if isinstance(address, dict) else {}

    @staticmethod
    def _from_state(state: dict[str, Any], *keys: str) -> Any:
        if not state:
            return None
        value = deep_get(state, *keys)
        return value

    @staticmethod
    def _interior(merged: dict[str, Any]) -> dict[str, str]:
        interior: dict[str, str] = {}
        for key in ("furnished", "balcony", "garden", "storage"):
            value = clean_text(merged.get(key))
            if value:
                interior[key] = value
        return interior

    @staticmethod
    def _amenities(merged: dict[str, Any]) -> list[str]:
        raw = merged.get("amenities") or merged.get("facilities") or []
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except json.JSONDecodeError:
                raw = [item.strip() for item in raw.split(",") if item.strip()]
        if isinstance(raw, dict):
            raw = list(raw.values())
        return [clean_text(item) for item in raw if clean_text(item)]


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
