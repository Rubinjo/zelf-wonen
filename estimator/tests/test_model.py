from datetime import date, timedelta

import pytest
from pydantic import ValidationError

from app.data import SalesDataset
from app.model import InsufficientData
from app.schemas import EstimateRequest, QualitativeFeatures


def request(**changes):
    return EstimateRequest.model_validate(
        dict(
            postcode="1012AB",
            houseNumber=42,
            propertyType="APARTMENT",
            livingAreaSqm=82.5,
            roomCount=4,
            constructionYear=1998,
        )
        | changes
    )


def test_actual_sale_prices_and_index_determine_value(model):
    result = model.predict(request())
    assert result.estimatedValueCents == 44_000_000
    assert result.comparableCount == 8
    model.sales = [sale.model_copy(update={"salePriceCents": 50_000_000}) for sale in model.sales]
    assert model.predict(request()).estimatedValueCents == 55_000_000


@pytest.mark.parametrize(
    "change",
    [
        dict(postcode="9999AB"),
        dict(propertyType="HOUSE"),
        dict(livingAreaSqm=200),
        dict(roomCount=10),
        dict(constructionYear=1900),
        dict(propertyType="LAND"),
    ],
)
def test_no_supported_comparables_means_no_invented_price(model, change):
    with pytest.raises(InsufficientData):
        model.predict(request(**change))


def test_repeat_and_future_sales_do_not_inflate_support(model):
    one = model.sales[0]
    model.sales = [one.model_copy(update={"transactionId": str(i)}) for i in range(10)]
    model.sales += [
        one.model_copy(
            update={"propertyId": "future", "saleDate": date.today() + timedelta(days=1)}
        )
    ]
    with pytest.raises(InsufficientData):
        model.predict(request())


def test_subject_address_is_excluded(model):
    model.sales = [
        s.model_copy(update={"postcode": "1012AB", "houseNumber": 42}) for s in model.sales
    ]
    with pytest.raises(InsufficientData):
        model.predict(request())


def test_stale_index_is_rejected(model):
    model.index = {"2020-01": 100}
    with pytest.raises(InsufficientData, match="stale"):
        model.predict(request())


@pytest.mark.parametrize(
    "features",
    [
        QualitativeFeatures(confidence=1),
        QualitativeFeatures(kitchenCondition=5, confidence=0, evidence=["Kitchen visible"]),
        QualitativeFeatures(kitchenCondition=5, confidence=1, evidence=[]),
    ],
)
def test_unknown_low_confidence_or_unsupported_images_are_neutral(model, features):
    assert model.predict(request(qualitativeFeatures=features)).estimatedValueCents == 44_000_000


def test_visible_condition_is_bounded_and_does_not_inflate_confidence(model):
    base = model.predict(request())
    features = QualitativeFeatures(
        kitchenCondition=5,
        bathroomCondition=5,
        interiorFinish=5,
        naturalLight=5,
        exteriorCondition=5,
        confidence=1,
        evidence=["Visible modern finishes"],
    )
    result = model.predict(request(qualitativeFeatures=features))
    assert result.estimatedValueCents == round(base.estimatedValueCents * 1.04)
    assert result.conditionAdjustmentPercent == 4
    assert result.confidence <= base.confidence
    features.confidence = 0.5
    assert model.predict(request(qualitativeFeatures=features)).conditionAdjustmentPercent == 2


def test_dataset_rejects_duplicates_and_asking_prices(sales):
    data = dict(
        source="synthetic test", license="test only", priceBasis="completed-sale", sales=sales
    )
    assert len(SalesDataset.model_validate(data).sales) == 8
    with pytest.raises(ValidationError):
        SalesDataset.model_validate(data | {"sales": [sales[0]] * 5})
    with pytest.raises(ValidationError):
        SalesDataset.model_validate(data | {"priceBasis": "asking-price"})


def test_missing_dataset_returns_unavailable(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app

    monkeypatch.setattr("app.main.model", None)
    monkeypatch.delenv("ML_ESTIMATOR_TOKEN", raising=False)
    client = TestClient(app)
    assert client.get("/health").json()["status"] == "data_unavailable"
    assert client.post("/v1/estimate", json=request().model_dump()).status_code == 503


def test_one_extreme_sale_does_not_move_median(model):
    model.sales[0] = model.sales[0].model_copy(update={"salePriceCents": 400_000_000})
    assert model.predict(request()).estimatedValueCents == 44_000_000


def test_partial_photo_coverage_has_smaller_effect(model):
    features = QualitativeFeatures(
        kitchenCondition=5, confidence=1, evidence=["Photo 1: modern kitchen"]
    )
    assert model.predict(request(qualitativeFeatures=features)).conditionAdjustmentPercent == 0.8
