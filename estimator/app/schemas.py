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
    addition: str | None = Field(default=None, max_length=12)
    municipalityCode: str | None = Field(default=None, pattern=r"^GM[0-9]{4}$")
    provinceCode: str | None = Field(default=None, pattern=r"^PV(2[0-9]|3[01])$")
    latitude: float | None = Field(default=None, ge=50, le=54)
    longitude: float | None = Field(default=None, ge=3, le=8)
    wozValueCents: int | None = Field(default=None, ge=1_000_000, le=2_000_000_000)
    wozAssessmentYear: int | None = Field(default=None, ge=2000, le=2200)

    @model_validator(mode="after")
    def paired_woz(self) -> "EstimateRequest":
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Supply both coordinates")
        if (self.wozValueCents is None) != (self.wozAssessmentYear is None):
            raise ValueError("Supply both the WOZ value and assessment year")
        return self


class EstimateResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    estimatedValueCents: int = Field(ge=0)
    lowerBoundCents: int = Field(ge=0)
    upperBoundCents: int = Field(ge=0)
    confidence: float = Field(ge=0, le=1)
    modelVersion: str
    comparableCount: int = Field(ge=0)
    method: Literal["COMPARABLE_SALES", "PROPERTY_WOZ", "MUNICIPAL_WOZ"] = "COMPARABLE_SALES"
    warnings: list[str] = Field(default_factory=list)
    sourceUrl: str = "https://www.kaggle.com/datasets/ictinstitute/utrecht-housing-dataset"
    referenceMonth: str | None = None
    calibrated: Literal[False] = False
    askingBenchmarkCents: int | None = None
    askingSourceUrl: str | None = None
    valuationMonth: str = Field(pattern=r"^20[0-9]{2}-(0[1-9]|1[0-2])$")
    conditionAdjustmentPercent: float = Field(ge=-4, le=4)

    @model_validator(mode="after")
    def bounds_contain_estimate(self) -> "EstimateResponse":
        if not self.lowerBoundCents <= self.estimatedValueCents <= self.upperBoundCents:
            raise ValueError("Estimate must be within its confidence bounds")
        return self
