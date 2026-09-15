from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

PropertyType = Literal["HOUSE", "APARTMENT", "PARKING", "LAND", "COMMERCIAL", "OTHER"]


class QualitativeFeatures(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    kitchenCondition: int | None = Field(default=None, ge=1, le=5)
    bathroomCondition: int | None = Field(default=None, ge=1, le=5)
    interiorFinish: int | None = Field(default=None, ge=1, le=5)
    naturalLight: int | None = Field(default=None, ge=1, le=5)
    exteriorCondition: int | None = Field(default=None, ge=1, le=5)
    confidence: float = Field(ge=0, le=1)
    evidence: list[str] = Field(default_factory=list, max_length=10)


class EstimateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    postcode: str = Field(pattern=r"^[1-9][0-9]{3}[A-Z]{2}$")
    houseNumber: int = Field(gt=0)
    propertyType: PropertyType
    livingAreaSqm: float = Field(gt=0, le=10_000)
    roomCount: int = Field(gt=0, le=100)
    constructionYear: int | None = Field(default=None, ge=1000, le=2200)
    qualitativeFeatures: QualitativeFeatures | None = None


class EstimateResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    estimatedValueCents: int = Field(ge=0)
    lowerBoundCents: int = Field(ge=0)
    upperBoundCents: int = Field(ge=0)
    confidence: float = Field(ge=0, le=1)
    modelVersion: str
    comparableCount: int = Field(ge=5)
    valuationMonth: str = Field(pattern=r"^20[0-9]{2}-(0[1-9]|1[0-2])$")
    conditionAdjustmentPercent: float = Field(ge=-4, le=4)

    @model_validator(mode="after")
    def bounds_contain_estimate(self) -> "EstimateResponse":
        if not self.lowerBoundCents <= self.estimatedValueCents <= self.upperBoundCents:
            raise ValueError("Estimate must be within its confidence bounds")
        return self
