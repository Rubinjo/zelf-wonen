"""Kamernet adapter.

Public search and detail HTML embed structured Next.js page data. Discovery
checks page numbers and listing links; details must match the discovered ID.
Legacy configured JSON discovery and JSON-LD details remain supported.
"""

from __future__ import annotations

import json
import math
import re
from collections.abc import AsyncIterator
from typing import Any
from urllib.parse import urljoin

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
from .parsing import deep_get, extract_embedded_json, extract_json_ld, extract_meta
from .search import listing_links, page_url, source_url

_KAMERNET_ID = re.compile(r"/(?:kamer|appartement|studio|room|apartment)-(\d+)(?:/|$)")


class KamernetAdapter(SourceAdapter):
    source = ListingSource.KAMERNET
    display_name = "Kamernet"
    brand_hex = "#0A2E4D"  # Kamernet navy

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or Settings()
        self.discovery_cursor = {}

    async def discover(self, client: ScraperClient) -> AsyncIterator[dict[str, Any]]:
        if not self.settings.kamernet_search_url:
            async for summary in self._discover_search(client):
                yield summary
            return
        async for summary in self._discover_json(client):
            yield summary

    async def _discover_search(self, client: ScraperClient) -> AsyncIterator[dict[str, Any]]:
        self.discovery_complete = False
        seen: set[str] = set()
        seeds = [u.strip() for u in self.settings.kamernet_search_urls.split("|") if u.strip()]
        if not seeds:
            raise ScrapeError("Kamernet search URLs are empty")
        resume = dict(self.discovery_cursor)
        fetched = 0
        for seed_index, seed in enumerate(seeds):
            if seed_index < resume.get("seed", 0):
                continue
            source_url(seed, self.settings.kamernet_base_url)
            pages_seen: set[tuple[str, ...]] = set()
            start = resume.get("page", 1) if seed_index == resume.get("seed", 0) else 1
            for page in range(start, self.settings.max_pages_per_search + 1):
                self.discovery_cursor = {"seed": seed_index, "page": page}
                response = await client.fetch(page_url(seed, "pageNo", page))
                fetched += 1
                response.require_success()
                target = self._page_data(response.text)
                result = target.get("findListingsResponse")
                filters = target.get("allFilters", {})
                if not isinstance(result, dict) or not isinstance(filters, dict):
                    raise ScrapeError("Kamernet search lacks structured listing data")
                cards = result.get("listings")
                total, size = result.get("total"), filters.get("listingsPerPage")
                if (
                    not isinstance(cards, list)
                    or not isinstance(total, int)
                    or isinstance(total, bool)
                    or total < 0
                    or not isinstance(size, int)
                    or isinstance(size, bool)
                    or size < 1
                    or filters.get("pageNo") != page
                ):
                    raise ScrapeError("invalid Kamernet pagination data")
                operation = result.get("OpResponse", {})
                if operation.get("HttpStatusCode", 200) != 200:
                    raise ScrapeError("Kamernet search reported an upstream error")
                if total == 0 and page == 1 and not cards:
                    break
                if not cards:
                    if page > math.ceil(total / size):
                        break
                    raise ScrapeError("Kamernet search ended before its reported total")
                links = listing_links(response.text, self.settings.kamernet_base_url, _KAMERNET_ID)
                ids: list[str] = []
                for card in cards:
                    if not isinstance(card, dict) or not card.get("listingId"):
                        raise ScrapeError("invalid Kamernet search card")
                    external_id = str(card["listingId"])
                    if external_id not in links:
                        raise ScrapeError("Kamernet search card lacks a matching detail link")
                    ids.append(external_id)
                fingerprint = tuple(sorted(ids))
                if fingerprint in pages_seen:
                    raise ScrapeError("Kamernet search repeated a page")
                pages_seen.add(fingerprint)
                for external_id in ids:
                    if external_id in seen:
                        continue
                    seen.add(external_id)
                    if len(seen) > self.settings.max_listings_per_source:
                        raise ScrapeError("Kamernet listing limit reached; discovery incomplete")
                    yield {
                        "external_id": external_id,
                        "url": links[external_id],
                        "purpose_raw": "rent",
                    }
                if page >= math.ceil(total / size):
                    break
                self.discovery_cursor = {"seed": seed_index, "page": page + 1}
                if fetched >= self.settings.discovery_page_batch_size:
                    return
            else:
                raise ScrapeError("Kamernet page limit reached; discovery incomplete")
            self.discovery_cursor = {"seed": seed_index + 1, "page": 1}
            if fetched >= self.settings.discovery_page_batch_size and seed_index < len(seeds) - 1:
                return
        self.discovery_complete = True
        self.discovery_cursor = {}

    @staticmethod
    def _page_data(html: str) -> dict[str, Any]:
        state = extract_embedded_json(html, ("__NEXT_DATA__",))
        props = deep_get(state, "props", "pageProps")
        if not isinstance(props, dict) or props.get("hasError404") or props.get("hasError500"):
            raise ScrapeError("Kamernet returned an error or unrecognized page")
        target = props.get("targetPageProps")
        if not isinstance(target, dict):
            raise ScrapeError("Kamernet page lacks targetPageProps")
        return target

    async def _discover_json(self, client: ScraperClient) -> AsyncIterator[dict[str, Any]]:
        base = self.settings.kamernet_search_url
        if not base:
            raise ScrapeError("Kamernet discovery URL is empty")
        page = 1
        count = 0
        seen: set[str] = set()
        while True:
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
                    raise ScrapeError("Kamernet card missing ID or URL")
                if external_id in seen:
                    raise ScrapeError("Kamernet pagination repeated a listing")
                seen.add(external_id)
                count += 1
                if count > self.settings.max_listings_per_source:
                    raise ScrapeError("Kamernet listing limit reached; discovery incomplete")
                yield {
                    "external_id": external_id,
                    "url": urljoin(self.settings.kamernet_base_url, listing_url),
                    "purpose_raw": card.get("purpose") or card.get("listingType") or "rent",
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
        state = extract_embedded_json(html, ("__NEXT_DATA__",))
        if state:
            detail = self._page_data(html).get("listingDetails")
            if not isinstance(detail, dict):
                raise ScrapeError("Kamernet detail lacks listingDetails")
            if str(detail.get("listingId")) != str(summary.get("external_id")):
                raise ScrapeError("Kamernet detail identity does not match discovery")
            if not isinstance(detail.get("isActive"), bool) or detail.get("isBlocked"):
                raise ScrapeError("Kamernet detail availability cannot be established")
            images = detail.get("imageList") or []
            if not isinstance(images, list) or not all(isinstance(i, str) for i in images):
                raise ScrapeError("invalid Kamernet image list")
            return {
                **summary,
                **_detail_features(html, detail),
                "title": detail.get("dutchTitle") or detail.get("englishTitle"),
                "description": detail.get("dutchDescription") or detail.get("englishDescription"),
                "street": detail.get("computedStreetName"),
                "city": detail.get("computedCityName"),
                "postcode": detail.get("postalCode"),
                "house_number": detail.get("houseNumber"),
                "house_number_addition": detail.get("houseNumberAddition"),
                "price_raw": detail.get("totalRentalPrice"),
                "living_area_sqm": detail.get("surfaceArea"),
                "room_count": detail.get("numOfRooms"),
                "bedroom_count": detail.get("numOfBedrooms"),
                "available_from": detail.get("availabilityStartDate"),
                "latitude": detail.get("postalCodeLat"),
                "longitude": detail.get("postalCodeLong"),
                "property_type": "appartement"
                if "/appartement-" in payload.url
                else "studio"
                if "/studio-" in payload.url
                else "room",
                "status_raw": "active" if detail["isActive"] else "expired",
                "images": [
                    {"url": f"https://resources.kamernet.nl/image/{key}"}
                    for key in images
                    if re.fullmatch(r"[a-fA-F0-9-]{36}", key)
                ],
            }
        result: dict[str, Any] = dict(summary)
        meta = extract_meta(html)

        # Kamernet embeds its data model in JSON-LD and __INITIAL_STATE__.
        json_ld = extract_json_ld(html)
        state = extract_embedded_json(html, ("__INITIAL_STATE__", "__NEXT_DATA__"))
        if not json_ld and not state:
            raise ScrapeError("Kamernet detail lacks structured listing data")

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
        result["house_number_addition"] = address.get("houseNumberAddition") or (
            normalize_house_number_addition(result["house_number"])
            or normalize_house_number_addition(result["street"])
        )
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
        price_cents = normalize_price_cents(
            str(merged.get("price_raw") or merged.get("price") or "")
        )
        availability = normalize_availability(merged.get("status_raw") or merged.get("status"))

        return NormalizedListing(
            source=ListingSource.KAMERNET,
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
            service_costs_cents=normalize_price_cents(merged.get("service_costs_raw")),
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
            available_from=merged.get("available_from"),
        )

    # --- helpers ------------------------------------------------------------

    _page_size = 50

    def _search_url(self, base: str, page: int) -> str:
        separator = "&" if "?" in base else "?"
        return f"{base}{separator}page={page}&pageSize={self._page_size}"

    @staticmethod
    def _extract_cards(data: dict[str, Any] | list[dict[str, Any]]) -> list[dict[str, Any]]:
        if isinstance(data, list):
            return data
        for key in ("listings", "results", "items", "data", "records"):
            value = data.get(key)
            if isinstance(value, list):
                return value
            if isinstance(value, dict):
                return KamernetAdapter._extract_cards(value)
        raise ScrapeError("unrecognized Kamernet search response")

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
                    "houseNumberAddition": address.get("houseNumberAddition"),
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
        interior: dict[str, str] = dict(merged.get("interior") or {})
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


def _detail_features(html: str, detail: dict[str, Any]) -> dict[str, Any]:
    """Read rendered facility labels rather than guessing Kamernet's enum IDs."""
    tree = HTMLParser(html)
    amenities: list[str] = []
    interior: dict[str, str] = {}
    energy_label = detail.get("energyLabel")
    for heading in tree.css("h2, h3, h4, h5"):
        if clean_text(heading.text()).lower() in {"wat je krijgt", "what you get"}:
            for node in heading.parent.css("p"):
                value = clean_text(node.text())
                if not value:
                    continue
                if "energielabel" in value.lower() or "energy label" in value.lower():
                    match = re.search(r"\b([A-G]\+{0,5})\b", value)
                    if match:
                        energy_label = match[1]
                else:
                    amenities.append(value)
            break
    for heading in tree.css("h6"):
        match = re.search(
            r"\b(gemeubileerd|gestoffeerd|kaal|furnished|unfurnished)\b",
            heading.text(),
            re.IGNORECASE,
        )
        if match:
            interior["Inrichting"] = match[1].capitalize()
            break
    for key, label in {
        "utilitiesIncluded": "Inclusief vaste lasten",
        "candidatePetsAllowed": "Huisdieren toegestaan",
        "candidateSmokingAllowed": "Roken toegestaan",
        "isRegistrationAllowed": "Inschrijving mogelijk",
    }.items():
        value = detail.get(key)
        if isinstance(value, bool):
            interior[label] = "Ja" if value else "Nee"
    for key, label in {
        "deposit": "Borg",
        "agencyFee": "Bemiddelingskosten",
        "internetAdditionalCosts": "Extra internetkosten",
    }.items():
        value = detail.get(key)
        if value is not None:
            interior[label] = f"€ {value}"
    for key, label in {
        "availabilityEndDate": "Beschikbaar tot",
        "suitableForNumberOfPersons": "Aantal huurders",
    }.items():
        if detail.get(key) is not None:
            interior[label] = str(detail[key])
    return {
        "amenities": amenities,
        "interior": interior,
        "energy_label": energy_label,
        "construction_year": detail.get("constructionYear"),
        "bathroom_count": detail.get("numOfBathrooms"),
        "service_costs_raw": detail.get("serviceCosts"),
    }
