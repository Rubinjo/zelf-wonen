from datetime import date

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.model import InsufficientData
from app.national import NationalModel
from app.schemas import EstimateRequest

AS_OF = date(2026, 9, 16)


def request(**overrides):
    return EstimateRequest.model_validate(
        {
            "postcode": "1012AB",
            "houseNumber": 42,
            "propertyType": "APARTMENT",
            "livingAreaSqm": 100,
            "roomCount": 4,
            "constructionYear": 1990,
            "municipalityCode": "GM0363",
            **overrides,
        }
    )


def national():
    model = NationalModel.from_files()
    model.comparables.sales = []
    return model


def test_all_342_municipalities_have_a_finite_statistical_estimate():
    model = national()
    for code in model.data.municipalities:
        result = model.predict(request(municipalityCode=code), as_of=AS_OF)
        assert result.method == "MUNICIPAL_WOZ"
        assert result.comparableCount == 0
        assert result.calibrated is False
        assert 0 < result.lowerBoundCents < result.estimatedValueCents < result.upperBoundCents


def test_woz_uses_previous_year_reference_and_takes_precedence_over_median():
    model = national()
    result = model.predict(
        request(wozValueCents=40_000_000, wozAssessmentYear=2025, municipalityCode="GM0014"),
        as_of=AS_OF,
    )
    assert result.method == "PROPERTY_WOZ"
    assert result.referenceMonth == "2024-01"
    assert result.estimatedValueCents == round(
        40_000_000 * model.comparables.index["2026-07"] / model.comparables.index["2024-01"]
    )
    assert result.conditionAdjustmentPercent == 0


def test_rejects_unpaired_woz_and_coordinates():
    with pytest.raises(ValidationError):
        request(wozValueCents=40_000_000)
    with pytest.raises(ValidationError):
        request(latitude=52)


def test_regional_adjustment_uses_common_completed_quarters():
    model = national()
    result = model.predict(request(wozValueCents=40_000_000, wozAssessmentYear=2025), as_of=AS_OF)
    regional = model.data.regionalIndices["GM0363"]
    national_index = model.data.regionalIndices["NL01"]
    expected = 40_000_000 * model.comparables.index["2026-07"] / model.comparables.index["2024-01"]
    expected *= (regional["2026KW02"] / regional["2024KW01"]) / (
        national_index["2026KW02"] / national_index["2024KW01"]
    )
    assert result.estimatedValueCents == round(expected)
    assert any("GM0363" in warning for warning in result.warnings)


@pytest.mark.parametrize(
    "overrides",
    [
        {"municipalityCode": None},
        {"municipalityCode": "GM9999"},
        {"propertyType": "LAND"},
        {"livingAreaSqm": 500},
        {"constructionYear": 2026},
        {"wozValueCents": 40_000_000, "wozAssessmentYear": 2027},
    ],
)
def test_unsupported_subjects_fail_instead_of_getting_a_national_average(overrides):
    with pytest.raises(InsufficientData):
        national().predict(request(**overrides), as_of=AS_OF)


def test_no_future_municipal_release_or_stale_index():
    model = national()
    with pytest.raises(InsufficientData):
        model.predict(request(), as_of=date(2025, 12, 1))
    with pytest.raises(InsufficientData, match="stale"):
        model.predict(request(), as_of=date(2027, 9, 1))


def test_asking_cross_check_never_changes_center_and_only_widens_bounds():
    model = national()
    before = model.predict(request(), as_of=date(2026, 8, 14))
    assert before.askingBenchmarkCents is None
    after = model.predict(request(), as_of=AS_OF)
    assert after.askingBenchmarkCents is not None
    assert after.estimatedValueCents == before.estimatedValueCents
    assert after.lowerBoundCents <= before.lowerBoundCents
    assert after.upperBoundCents >= before.upperBoundCents


def test_http_serves_national_model(monkeypatch):
    monkeypatch.setattr("app.main.model", national())
    monkeypatch.delenv("ML_ESTIMATOR_TOKEN", raising=False)
    response = TestClient(app).post("/v1/estimate", json=request().model_dump())
    assert response.status_code == 200
    assert response.json()["method"] == "MUNICIPAL_WOZ"
