"""Local comparable sales, normalized to the most recent available CBS index month."""

import math
import os
from datetime import date
from pathlib import Path

from .data import Sale, load_index, load_sales
from .schemas import EstimateRequest, EstimateResponse

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
MODEL_VERSION = "nl-comparables-v1"
CONDITION_FIELDS = (
    "kitchenCondition",
    "bathroomCondition",
    "interiorFinish",
    "naturalLight",
    "exteriorCondition",
)


class InsufficientData(ValueError):
    pass


def weighted_quantile(values: list[tuple[float, float]], quantile: float) -> float:
    ordered = sorted(values)
    threshold = sum(weight for _, weight in ordered) * quantile
    accumulated = 0.0
    for value, weight in ordered:
        accumulated += weight
        if accumulated >= threshold:
            return value
    return ordered[-1][0]


class ComparableSalesModel:
    def __init__(self, sales: list[Sale], index: dict[str, float], version: str):
        self.sales = sales
        self.index = index
        self.model_version = version

    @classmethod
    def from_files(cls) -> "ComparableSalesModel":
        dataset, sales_hash = load_sales(
            Path(os.getenv("ESTIMATOR_SALES_PATH", str(DATA_DIR / "sales.json")))
        )
        index, index_hash = load_index(DATA_DIR / "cbs-index.json")
        return cls(dataset.sales, index, f"{MODEL_VERSION}-{sales_hash}-{index_hash}")

    def predict(self, request: EstimateRequest, *, as_of: date | None = None) -> EstimateResponse:
        as_of = as_of or date.today()
        if request.propertyType not in ("HOUSE", "APARTMENT"):
            raise InsufficientData("Only existing houses and apartments are supported")
        if request.constructionYear and request.constructionYear > as_of.year:
            raise InsufficientData("New construction is outside the historical-sales model")
        months = [month for month in self.index if month < as_of.strftime("%Y-%m")]
        if not months:
            raise InsufficientData("No historical price index available")
        target_month = max(months)
        if (as_of - date.fromisoformat(target_month + "-01")).days > 180:
            raise InsufficientData("CBS price index is stale; refresh it before estimating")
        # One observation per property avoids repeat sales dominating the neighborhood.
        candidates: dict[str, tuple[float, Sale]] = {}
        for sale in self.sales:
            age = (as_of - sale.saleDate).days
            ratio = sale.livingAreaSqm / request.livingAreaSqm
            month = sale.saleDate.strftime("%Y-%m")
            if (
                not 0 < age <= 3 * 365
                or month > target_month
                or month not in self.index
                or sale.postcode[:4] != request.postcode[:4]
                or sale.propertyType != request.propertyType
                or (sale.postcode == request.postcode and sale.houseNumber == request.houseNumber)
                or not 0.75 <= ratio <= 1.33
                or abs(sale.roomCount - request.roomCount) > 2
            ):
                continue
            year_distance = (
                abs(sale.constructionYear - request.constructionYear)
                if request.constructionYear
                else 20
            )
            if year_distance > 30:
                continue
            distance = (
                abs(math.log(ratio)) / 0.25
                + abs(sale.roomCount - request.roomCount) / 2
                + year_distance / 30
                + age / 1095
            )
            previous = candidates.get(sale.propertyId)
            if previous is None or sale.saleDate > previous[1].saleDate:
                candidates[sale.propertyId] = (distance, sale)
        nearest = sorted(candidates.values(), key=lambda item: (item[0], item[1].transactionId))[
            :20
        ]
        if len(nearest) < 5:
            raise InsufficientData("At least five similar local completed sales are required")
        values = [
            (
                sale.salePriceCents
                / sale.livingAreaSqm
                * request.livingAreaSqm
                * self.index[target_month]
                / self.index[sale.saleDate.strftime("%Y-%m")],
                1 / (1 + distance),
            )
            for distance, sale in nearest
        ]
        base = weighted_quantile(values, 0.5)
        # This conservative prior is not a fitted renovation return. Unknown dimensions
        # stay neutral, and limited coverage reduces the adjustment automatically.
        adjustment = 0.0
        features = request.qualitativeFeatures
        if features and features.evidence and features.confidence >= 0.5:
            adjustment = (
                sum((getattr(features, key) or 3) - 3 for key in CONDITION_FIELDS)
                / 5
                * 0.02
                * features.confidence
            )
        estimate = round(base * (1 + adjustment))
        spread = max(
            0.15, (weighted_quantile(values, 0.9) - weighted_quantile(values, 0.1)) / (2 * base)
        )
        spread = min(0.6, spread + 0.1 / math.sqrt(len(values)) + abs(adjustment))
        return EstimateResponse(
            estimatedValueCents=estimate,
            lowerBoundCents=round(estimate * (1 - spread)),
            upperBoundCents=round(estimate * (1 + spread)),
            confidence=round(min(0.75, len(values) / 30) * (1 - spread), 3),
            modelVersion=self.model_version,
            comparableCount=len(values),
            valuationMonth=target_month,
            conditionAdjustmentPercent=round(adjustment * 100, 2),
        )
