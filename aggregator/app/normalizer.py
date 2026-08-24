"""Data normalization: chaotic source fields -> strict internal schema.

Every source-specific extraction path ends here, so the persisted listing is
always one canonical shape regardless of how Funda or Kamernet names a field.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from .models import (
    EnergyLabel,
    ListingAvailability,
    ListingPurpose,
    PropertyType,
    SourceImage,
)

_WHITESPACE = re.compile(r"\s+")
_POSTCODE = re.compile(r"^\d{4}\s?[A-Za-z]{2}$")
_HOUSE_NUMBER = re.compile(r"(\d{1,5})")
_ENERGY_LABELS = {
    "a+++++": EnergyLabel.A_PLUS_PLUS_PLUS_PLUS_PLUS,
    "a++++": EnergyLabel.A_PLUS_PLUS_PLUS_PLUS,
    "a+++": EnergyLabel.A_PLUS_PLUS_PLUS,
    "a++": EnergyLabel.A_PLUS_PLUS,
    "a+": EnergyLabel.A_PLUS,
    "a": EnergyLabel.A,
    "b": EnergyLabel.B,
    "c": EnergyLabel.C,
    "d": EnergyLabel.D,
    "e": EnergyLabel.E,
    "f": EnergyLabel.F,
    "g": EnergyLabel.G,
}

_PROPERTY_TYPES = {
    "house": PropertyType.HOUSE,
    "woning": PropertyType.HOUSE,
    "eengezinswoning": PropertyType.HOUSE,
    "tussenwoning": PropertyType.HOUSE,
    "hoekwoning": PropertyType.HOUSE,
    "vrijstaande woning": PropertyType.HOUSE,
    "twee-onder-een-kapwoning": PropertyType.HOUSE,
    "apartment": PropertyType.APARTMENT,
    "appartement": PropertyType.APARTMENT,
    "studio": PropertyType.APARTMENT,
    "parking": PropertyType.PARKING,
    "parkeerplaats": PropertyType.PARKING,
    "garage": PropertyType.PARKING,
    "land": PropertyType.LAND,
    "bouwgrond": PropertyType.LAND,
    "commercial": PropertyType.COMMERCIAL,
    "bedrijfsruimte": PropertyType.COMMERCIAL,
    "kantoor": PropertyType.COMMERCIAL,
    "winkel": PropertyType.COMMERCIAL,
}

_AVAILABILITY = {
    "active": ListingAvailability.ACTIVE,
    "available": ListingAvailability.ACTIVE,
    "beschikbaar": ListingAvailability.ACTIVE,
    "te koop": ListingAvailability.ACTIVE,
    "te huur": ListingAvailability.ACTIVE,
    "expired": ListingAvailability.EXPIRED,
    "offline": ListingAvailability.OFFLINE,
    "sold": ListingAvailability.EXPIRED,
    "rented": ListingAvailability.EXPIRED,
    "verkocht": ListingAvailability.EXPIRED,
    "verhuurd": ListingAvailability.EXPIRED,
    "onder bod": ListingAvailability.ACTIVE,
    "under offer": ListingAvailability.ACTIVE,
}


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    return _WHITESPACE.sub(" ", str(value)).strip()


def strip_accents(value: str) -> str:
    return "".join(
        char for char in unicodedata.normalize("NFKD", value) if not unicodedata.combining(char)
    )


def normalize_postcode(value: Any) -> str | None:
    raw = clean_text(value).upper().replace(" ", "")
    if not raw:
        return None
    # Accept "1234AB" and "1234 AB".
    if re.match(r"^\d{4}[A-Za-z]{2}$", raw):
        return f"{raw[:4]}{raw[4:6].upper()}"
    return None


def normalize_house_number(value: Any) -> int | None:
    raw = clean_text(value)
    match = _HOUSE_NUMBER.search(raw)
    return int(match.group(1)) if match else None


def normalize_price_cents(value: Any) -> int | None:
    """Parse a price string/float ("€ 450.000", "1.250,-", 1250.50) into euro cents."""
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        # Assume already-cents inputs that look like an integer price are cents.
        return value
    raw = clean_text(value)
    if not raw:
        return None
    raw = raw.replace("€", "").replace("euro", "").replace("EUR", "").strip()
    raw = raw.replace(",-", "").replace(",- ", "")
    # Dutch thousands: "1.250" -> 1250; careful with "1.250,50".
    if "," in raw and "." in raw:
        raw = raw.replace(".", "").replace(",", ".")
    elif "," in raw and not raw.endswith(",00"):
        raw = raw.replace(",", ".")
    else:
        raw = raw.replace(".", "").replace(",", ".")
    try:
        return int(round(float(raw) * 100))
    except ValueError:
        return None


def normalize_energy_label(value: Any) -> EnergyLabel | None:
    raw = strip_accents(clean_text(value)).lower()
    raw = raw.replace("energielabel", "").replace("label", "").strip()
    return _ENERGY_LABELS.get(raw)


def normalize_property_type(value: Any) -> PropertyType:
    raw = strip_accents(clean_text(value)).lower()
    for key, property_type in _PROPERTY_TYPES.items():
        if key in raw:
            return property_type
    return PropertyType.HOUSE


def normalize_availability(value: Any) -> ListingAvailability:
    raw = strip_accents(clean_text(value)).lower()
    for key, availability in _AVAILABILITY.items():
        if key == raw or key in raw:
            return availability
    return ListingAvailability.ACTIVE


def normalize_purpose(value: Any) -> ListingPurpose:
    raw = clean_text(value).lower()
    if any(token in raw for token in ("huur", "rent", "rental")):
        return ListingPurpose.RENT
    return ListingPurpose.SALE


def normalize_images(value: Any) -> list[SourceImage]:
    if not value:
        return []
    if isinstance(value, dict):
        value = [value]
    images: list[SourceImage] = []
    for item in value:
        if isinstance(item, str):
            images.append(SourceImage(url=item))
            continue
        if isinstance(item, dict):
            url = item.get("url") or item.get("src") or item.get("large") or item.get("original")
            if url:
                images.append(
                    SourceImage(
                        url=clean_text(url),
                        width=_to_int(item.get("width")),
                        height=_to_int(item.get("height")),
                    )
                )
    return images


def _to_int(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def pick_text(*values: Any) -> str | None:
    for value in values:
        text = clean_text(value)
        if text:
            return text
    return None


def merge_missing(master: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    """Fill missing master fields from a newly discovered source, never overwriting."""
    merged = dict(master)
    for key, value in incoming.items():
        if merged.get(key) in (None, "", [], {}) and value not in (None, "", [], {}):
            merged[key] = value
    return merged
