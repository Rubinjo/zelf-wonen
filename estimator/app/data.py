"""Validated, versioned completed-sale inputs; listing asking prices are not accepted."""

import hashlib
import json
from datetime import date
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Sale(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    transactionId: str = Field(min_length=1)
    propertyId: str = Field(min_length=1)
    postcode: str = Field(pattern=r"^[1-9][0-9]{3}[A-Z]{2}$")
    houseNumber: int = Field(gt=0)
    propertyType: Literal["HOUSE", "APARTMENT"]
    livingAreaSqm: float = Field(ge=15, le=1000)
    roomCount: int = Field(ge=1, le=30)
    constructionYear: int = Field(ge=1000, le=2200)
    saleDate: date
    salePriceCents: int = Field(ge=1_000_000, le=2_000_000_000)

    @model_validator(mode="after")
    def valid_date(self) -> "Sale":
        if self.saleDate > date.today() or self.constructionYear > self.saleDate.year:
            raise ValueError("Sale date must be historical and after construction")
        return self


class SalesDataset(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: str = Field(min_length=1)
    license: str = Field(min_length=1)
    priceBasis: Literal["completed-sale"]
    sales: list[Sale] = Field(min_length=5)

    @model_validator(mode="after")
    def unique_transactions(self) -> "SalesDataset":
        ids = [sale.transactionId for sale in self.sales]
        if len(set(ids)) != len(ids):
            raise ValueError("Duplicate transaction IDs")
        return self


def load_sales(path: Path) -> tuple[SalesDataset, str]:
    raw = path.read_bytes()
    return SalesDataset.model_validate_json(raw), hashlib.sha256(raw).hexdigest()[:12]


def load_index(path: Path) -> tuple[dict[str, float], str]:
    raw = path.read_bytes()
    months = json.loads(raw)["months"]
    for month, value in months.items():
        date.fromisoformat(month + "-01")
        if not isinstance(value, (int, float)) or not 0 < value < 1000:
            raise ValueError("Invalid CBS index value")
    if not months:
        raise ValueError("Empty CBS index")
    return months, hashlib.sha256(raw).hexdigest()[:12]
