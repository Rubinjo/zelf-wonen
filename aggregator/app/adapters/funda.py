"""Funda adapter.

Funda renders server-side HTML with schema.org JSON-LD and OpenGraph meta tags.
Discovery uses the public sitemap; detail pages are parsed from JSON-LD with a
meta/HTML fallback. The endpoint is configurable so a contracted feed can be
swapped in without touching the pipeline.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from collections.abc import AsyncIterator
from typing import Any

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
from .parsing import extract_embedded_json, extract_meta, find_objects

_FUNDA_ID = re.compile(r"/(\d{8})")
_LISTING_URL = re.compile(r"/(koop|huur)/")


class FundaAdapter(SourceAdapter):
    source = ListingSource.FUNDA
    display_name = "Funda"
    brand_hex = "#F7A100"  # Funda orange

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or Settings()

    async def discover(self, client: ScraperClient) -> AsyncIterator[dict[str, Any]]:
        sitemap_url = self.settings.funda_sitemap_url
        if not sitemap_url:
            return
        response = await client.fetch(sitemap_url)
        try:
            root = ET.fromstring(response.text)
        except ET.ParseError:
            return
        count = 0
        for loc in root.iter("{http://www.sitemaps.org/schemas/sitemap/0.9}loc"):
            url = (loc.text or "").strip()
            if not _LISTING_URL.search(url):
                continue
            count += 1
            if count > self.settings.max_listings_per_source:
                break
            yield {
                "external_id": self._external_id(url),
                "url": url,
                "purpose_raw": "rent" if "/huur/" in url else "buy",
            }

    async def fetch_detail(self, client: ScraperClient, summary: dict[str, Any]) -> DetailPayload:
        response = await client.fetch(summary["url"], referer=self.settings.funda_base_url)
        if response.status_code in (404, 410):
            raise ListingGone(f"funda listing gone: {summary['url']}")
        return DetailPayload(
            url=summary["url"],
            content_type=response.content_type,
            body=response.text,
        )

    def parse_detail(self, summary: dict[str, Any], payload: DetailPayload) -> dict[str, Any]:
        html = payload.body
        meta = extract_meta(html)
        objects = find_objects(html, {"product", "residence", "realestatelisting", "offer"})
        result: dict[str, Any] = dict(summary)

        # --- JSON-LD is the richest signal ----------------------------------
        offer = next(
            (obj for obj in objects if obj.get("price") or obj.get("offers") or "address" in obj),
            {},
        )
        address = offer.get("address") or {}
        if isinstance(address, list):
            address = address[0] if address else {}

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
        result["status_raw"] = offer.get("availability") or meta.get("og:status")

        # --- Fall back to embedded state / regex on raw HTML -----------------
        if not result.get("street") or not result.get("postcode"):
            state = extract_embedded_json(html, ("__INITIAL_STATE__", "__NEXT_DATA__"))
            result["embedded"] = state
        return result

    def normalize(self, merged: dict[str, Any]) -> NormalizedListing:
        purpose = normalize_purpose(merged.get("purpose_raw") or merged.get("purpose"))
        postcode = normalize_postcode(merged.get("postcode"))
        house_number = normalize_house_number(merged.get("house_number")) or 0
        street = clean_text(merged.get("street") or _split_address(merged, {}) or "Onbekend")
        city = clean_text(merged.get("city") or "Onbekend")
        price_cents = normalize_price_cents(merged.get("price_raw") or merged.get("price"))
        availability = normalize_availability(merged.get("status_raw") or merged.get("status"))

        return NormalizedListing(
            source=ListingSource.FUNDA,
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

    @staticmethod
    def _external_id(url: str) -> str:
        match = _FUNDA_ID.search(url)
        return match.group(1) if match else url

    @staticmethod
    def _interior(merged: dict[str, Any]) -> dict[str, str]:
        interior: dict[str, str] = {}
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
