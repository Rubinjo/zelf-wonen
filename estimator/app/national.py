"""Local sales first, then an explicitly uncalibrated nationwide WOZ indication."""

import hashlib
import json
from datetime import date
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .model import DATA_DIR, ComparableSalesModel, InsufficientData
from .schemas import EstimateRequest, EstimateResponse


class Municipality(BaseModel):
    name: str
    wozPerSqm: int = Field(gt=0, le=100_000)


class AskingMunicipality(BaseModel):
    medianPerSqm: int = Field(gt=0)
    count: int = Field(gt=0)


class AskingData(BaseModel):
    source: str
    downloadUrl: str
    license: str
    publishedAt: date
    sourceSha256: str
    municipalities: dict[str, AskingMunicipality]


class NationalData(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    source: str
    license: str
    publishedAt: date
    referenceMonth: str = Field(pattern=r"^20[0-9]{2}-(0[1-9]|1[0-2])$")
    assessmentYear: int
    sourceSha256: str
    municipalities: dict[str, Municipality]
    asking: AskingData
    regionalIndices: dict[str, dict[str, Annotated[float, Field(gt=0, lt=1000)]]]
    regionalIndexSource: str

    @model_validator(mode="after")
    def validate_references(self) -> "NationalData":
        if self.referenceMonth != f"{self.assessmentYear - 1}-01":
            raise ValueError("WOZ assessment year and reference date disagree")
        if "NL01" not in self.regionalIndices or any(
            f"PV{code}" not in self.regionalIndices for code in range(20, 32)
        ):
            raise ValueError("National and provincial indices are required")
        for series in self.regionalIndices.values():
            if not series or any(
                len(key) != 8
                or key[4:6] != "KW"
                or not key[:4].isdigit()
                or key[-2:] not in ("01", "02", "03", "04")
                for key in series
            ):
                raise ValueError("Invalid quarterly index periods")
        if not self.asking.municipalities.keys() <= self.municipalities.keys():
            raise ValueError("Unmatched asking benchmark municipality")
        return self


class NationalModel:
    def __init__(self, comparables: ComparableSalesModel, data: NationalData, digest: str):
        self.comparables = comparables
        self.data = data
        self.model_version = f"nl-hierarchy-v1-{comparables.model_version}-{digest}"

    @classmethod
    def from_files(cls) -> "NationalModel":
        raw = (DATA_DIR / "national-woz.json").read_bytes()
        data = NationalData.model_validate(json.loads(raw))
        if len(data.municipalities) != 342:
            raise ValueError("Incomplete national coverage")
        return cls(ComparableSalesModel.from_files(), data, hashlib.sha256(raw).hexdigest()[:12])

    def predict(self, request: EstimateRequest, *, as_of: date | None = None) -> EstimateResponse:
        as_of = as_of or date.today()
        if request.propertyType not in ("HOUSE", "APARTMENT"):
            raise InsufficientData("Only existing houses and apartments are supported")
        if request.constructionYear and request.constructionYear >= as_of.year:
            raise InsufficientData("New construction is outside this model")
        if not 25 <= request.livingAreaSqm <= 350:
            raise InsufficientData("Properties outside 25–350 m² need an individual valuation")
        try:
            result = self.comparables.predict(request, as_of=as_of)
            return self.cross_check(
                request,
                result.model_copy(
                    update={
                        "modelVersion": self.model_version,
                        "warnings": [
                            "Bandbreedte is indicatief; geen gekalibreerd betrouwbaarheidsinterval."
                        ],
                    }
                ),
                as_of,
            )
        except InsufficientData:
            pass
        index = self.comparables.index
        months = [month for month in index if month < as_of.strftime("%Y-%m")]
        if not months or (as_of - date.fromisoformat(max(months) + "-01")).days > 180:
            raise InsufficientData("CBS price index is unavailable or stale")
        target = max(months)
        warnings = [
            "Geen voldoende vergelijkbare verkochte woningen beschikbaar.",
            "Bandbreedte is indicatief en niet statistisch gekalibreerd.",
        ]
        if request.wozValueCents is not None and request.wozAssessmentYear is not None:
            if request.wozAssessmentYear > as_of.year:
                raise InsufficientData("Future WOZ assessments are not supported")
            reference = f"{request.wozAssessmentYear - 1}-01"
            base = request.wozValueCents
            method = "PROPERTY_WOZ"
            spread = 0.30
            source = "https://www.wozwaardeloket.nl/"
            warnings.append(
                "WOZ-waarde door gebruiker aangeleverd en niet onafhankelijk gecontroleerd."
            )
        else:
            if self.data.publishedAt > as_of:
                raise InsufficientData("Municipal statistics were not available on this date")
            municipality = self.data.municipalities.get(request.municipalityCode or "")
            if municipality is None:
                raise InsufficientData("A verified Dutch municipality or property WOZ is required")
            reference = self.data.referenceMonth
            base = municipality.wozPerSqm * request.livingAreaSqm * 100
            method = "MUNICIPAL_WOZ"
            spread = 0.45
            source = self.data.source
            warnings.append(
                f"Gemeentelijke WOZ-mediaan per m² ({municipality.name}); "
                "geen individuele woningwaarde. Woningtype, erfpacht, perceel en staat "
                "kunnen sterk afwijken van deze mediaan."
            )
        if reference not in index or reference > target:
            raise InsufficientData("WOZ reference date has no applicable historical price index")
        if (as_of - date.fromisoformat(reference + "-01")).days > 4 * 366:
            raise InsufficientData("WOZ reference is too old; refresh the source")
        factor = index[target] / index[reference]
        region = next(
            (
                code
                for code in (request.municipalityCode, request.provinceCode)
                if code in self.data.regionalIndices
            ),
            None,
        )
        if region:
            local = self.data.regionalIndices[region]
            national = self.data.regionalIndices["NL01"]
            reference_quarter = f"{reference[:4]}KW{(int(reference[5:]) - 1) // 3 + 1:02d}"
            quarters = [
                quarter
                for quarter in local
                if quarter in national and f"{quarter[:4]}-{int(quarter[-2:]) * 3:02d}" <= target
            ]
            latest = max(quarters) if quarters else None
            if (
                latest
                and reference_quarter in local
                and reference_quarter in national
                and reference_quarter <= latest
                and (as_of.year - int(latest[:4])) * 12 + as_of.month - int(latest[-2:]) * 3 <= 9
            ):
                # Regional quarterly growth relative to national quarterly growth;
                # national monthly movement bridges to the requested index month.
                factor *= (local[latest] / local[reference_quarter]) / (
                    national[latest] / national[reference_quarter]
                )
                warnings.append(
                    f"CBS regionale prijsontwikkeling {region} t/m {latest}; "
                    "landelijke maandindex voor de tussenliggende maanden."
                )
            else:
                region = None
        if not region:
            warnings.append(
                "Landelijke prijsontwikkeling toegepast; lokale ontwikkeling kan afwijken."
            )
        value = round(base * factor)
        return self.cross_check(
            request,
            EstimateResponse(
                estimatedValueCents=value,
                lowerBoundCents=round(value * (1 - spread)),
                upperBoundCents=round(value * (1 + spread)),
                confidence=0.4 if method == "PROPERTY_WOZ" else 0.2,
                comparableCount=0,
                modelVersion=self.model_version,
                valuationMonth=target,
                conditionAdjustmentPercent=0,
                method=method,
                warnings=warnings,
                sourceUrl=source,
                referenceMonth=reference,
            ),
            as_of,
        )

    def cross_check(
        self, request: EstimateRequest, result: EstimateResponse, as_of: date
    ) -> EstimateResponse:
        asking = self.data.asking
        observation = asking.municipalities.get(request.municipalityCode or "")
        # Asking prices are a dated diagnostic, never completed-sale training labels.
        if observation is None or not 0 <= (as_of - asking.publishedAt).days <= 180:
            return result
        benchmark = round(observation.medianPerSqm * request.livingAreaSqm * 100)
        warnings = list(result.warnings)
        warnings.append(
            "Vraagprijscontrole: Residentievinder, juli–augustus 2026, "
            "gemeentelijke mediaan; geen gerealiseerde verkoopprijzen."
        )
        lower, upper = result.lowerBoundCents, result.upperBoundCents
        if abs(benchmark / result.estimatedValueCents - 1) > 0.25:
            warnings.append(
                "Vraagprijsbenchmark wijkt meer dan 25% af; "
                "bandbreedte verruimd. Laat de woning individueel beoordelen."
            )
            lower = min(lower, round(benchmark * 0.85))
            upper = max(upper, round(benchmark * 1.15))
        return result.model_copy(
            update={
                "askingBenchmarkCents": benchmark,
                "askingSourceUrl": asking.source,
                "warnings": warnings,
                "lowerBoundCents": lower,
                "upperBoundCents": upper,
            }
        )
