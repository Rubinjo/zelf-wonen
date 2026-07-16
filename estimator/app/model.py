from dataclasses import dataclass

from .schemas import EstimateRequest, EstimateResponse

MODEL_VERSION = "spatial-hedonic-nl-2026.07.1"

# Euro-cent baselines are deliberately versioned with the service. In production,
# load signed, licensed training artifacts and postcode-sector features at startup.
BASE_PRICE_PER_SQM_CENTS = {
    "HOUSE": 470_000,
    "APARTMENT": 515_000,
    "PARKING": 110_000,
    "LAND": 175_000,
    "COMMERCIAL": 285_000,
    "OTHER": 350_000,
}


@dataclass(frozen=True)
class DeterministicSpatialRegressor:
    model_version: str = MODEL_VERSION

    def predict(self, request: EstimateRequest) -> EstimateResponse:
        base = BASE_PRICE_PER_SQM_CENTS[request.propertyType]
        postcode_number = int(request.postcode[:4])

        # Deterministic spatial proxy. It intentionally has no random state and is
        # replaceable by a fitted spatial/XGBoost artifact behind this same port.
        spatial_factor = 0.84 + ((postcode_number * 2654435761) % 10_000) / 100_000
        size_factor = max(
            0.82, min(1.12, 1.08 - max(request.livingAreaSqm - 80, 0) * 0.0012)
        )
        expected_rooms = max(1.0, request.livingAreaSqm / 28)
        room_factor = max(
            0.94, min(1.06, 1 + (request.roomCount - expected_rooms) * 0.012)
        )

        year_factor = 1.0
        if request.constructionYear:
            if request.constructionYear >= 2015:
                year_factor = 1.08
            elif request.constructionYear >= 1995:
                year_factor = 1.035
            elif request.constructionYear < 1945:
                year_factor = 1.025

        qualitative_factor = 1.0
        confidence = 0.56
        uncertainty = 0.17
        if request.qualitativeFeatures:
            features = request.qualitativeFeatures
            score = (
                features.kitchenCondition
                + features.bathroomCondition
                + features.interiorFinish
                + features.naturalLight
                + features.exteriorCondition
            ) / 5
            qualitative_factor = 1 + (score - 3) * 0.035
            confidence = min(0.84, 0.66 + features.confidence * 0.16)
            uncertainty = 0.11

        estimate = round(
            base
            * request.livingAreaSqm
            * spatial_factor
            * size_factor
            * room_factor
            * year_factor
            * qualitative_factor
        )
        return EstimateResponse(
            estimatedValueCents=estimate,
            lowerBoundCents=round(estimate * (1 - uncertainty)),
            upperBoundCents=round(estimate * (1 + uncertainty)),
            confidence=confidence,
            modelVersion=self.model_version,
        )
