"""Strict internal schema for normalized listings.

Source adapters emit chaotic dictionaries; the normalizer maps them onto these
Pydantic models. Everything the UI or database touches goes through this module,
so there is exactly one internal representation of a listing.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field


class ListingSource(StrEnum):
    FUNDA = "FUNDA"
    KAMERNET = "KAMERNET"


class ListingPurpose(StrEnum):
    SALE = "SALE"
    RENT = "RENT"


class ListingAvailability(StrEnum):
    ACTIVE = "ACTIVE"
    EXPIRED = "EXPIRED"
    OFFLINE = "OFFLINE"
    ERROR = "ERROR"


class PropertyType(StrEnum):
    HOUSE = "HOUSE"
    APARTMENT = "APARTMENT"
    PARKING = "PARKING"
    LAND = "LAND"
    COMMERCIAL = "COMMERCIAL"
    OTHER = "OTHER"


class EnergyLabel(StrEnum):
    A_PLUS_PLUS_PLUS_PLUS_PLUS = "A_PLUS_PLUS_PLUS_PLUS_PLUS"
    A_PLUS_PLUS_PLUS_PLUS = "A_PLUS_PLUS_PLUS_PLUS"
    A_PLUS_PLUS_PLUS = "A_PLUS_PLUS_PLUS"
    A_PLUS_PLUS = "A_PLUS_PLUS"
    A_PLUS = "A_PLUS"
    A = "A"
    B = "B"
    C = "C"
    D = "D"
    E = "E"
    F = "F"
    G = "G"


class SourceImage(BaseModel):
    url: str
    width: int | None = None
    height: int | None = None


class NormalizedListing(BaseModel):
    """A fully normalized listing, independent of its source."""

    source: ListingSource
    external_id: str
    url: str

    purpose: ListingPurpose
    availability: ListingAvailability = ListingAvailability.ACTIVE

    title: str | None = None
    description: str | None = None

    asking_price_cents: int | None = None
    monthly_rent_cents: int | None = None
    service_costs_cents: int | None = None

    # Address
    street: str
    house_number: int
    house_number_addition: str | None = None
    postcode: str | None = None
    city: str
    municipality: str | None = None
    province: str | None = None
    latitude: float | None = None
    longitude: float | None = None

    # Property facts
    property_type: PropertyType = PropertyType.HOUSE
    living_area_sqm: float | None = None
    plot_area_sqm: float | None = None
    volume_cubic_meters: float | None = None
    room_count: int | None = None
    bedroom_count: int | None = None
    bathroom_count: int | None = None
    construction_year: int | None = None
    energy_label: EnergyLabel | None = None

    # Open vocabularies are normalized to string lists / key-value maps.
    interior: dict[str, str] = Field(default_factory=dict)
    amenities: list[str] = Field(default_factory=list)

    available_from: str | None = None  # ISO date
    images: list[SourceImage] = Field(default_factory=list)

    first_seen_at: str | None = None  # ISO datetime
    last_seen_at: str | None = None  # ISO datetime


class SummaryFingerprint(BaseModel):
    """Cheap comparison snapshot used for incremental sync."""

    external_id: str
    url: str
    price_cents: int | None = None
    availability: ListingAvailability = ListingAvailability.ACTIVE
    title: str | None = None
    raw_text: str = ""
