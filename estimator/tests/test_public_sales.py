import csv
import io
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.data import load_sales
from app.main import app
from app.model import DATA_DIR, ComparableSalesModel, InsufficientData
from app.schemas import EstimateRequest
from scripts.fetch_public_sales import SOURCE_SHA256, prepare, write_artifact


def public_csv() -> bytes:
    stream = io.StringIO()
    fields = [
        "id",
        "zipcode4",
        "zipcode6",
        "zipcode6id",
        "housetype",
        "house-area",
        "rooms",
        "buildyear",
        "retailvalue",
        "valuationdate",
        "x-coor",
        "y-coor",
        "askingprice",
    ]
    writer = csv.DictWriter(stream, fieldnames=fields)
    writer.writeheader()
    for i in range(5):
        writer.writerow(
            dict(
                zip(
                    fields,
                    [
                        str(i),
                        "3544",
                        "3544MC",
                        f"3544MC{i:03}",
                        "woonhuis",
                        "145",
                        "5",
                        "2007",
                        "615",
                        "2024-04-04",
                        "52.0988",
                        "5.0392",
                        "999999",
                    ],
                    strict=True,
                )
            )
        )
    return stream.getvalue().encode()


def test_public_conversion_uses_transaction_units_and_preserves_anonymity():
    dataset = prepare(public_csv())
    sale = dataset.sales[0]
    assert sale.salePriceCents == 61_500_000
    assert sale.saleDate == date(2024, 4, 4)
    assert sale.propertyType == "HOUSE"
    assert sale.houseNumber is None
    assert sale.propertyId == "utrecht-3544MC000"
    assert (sale.latitude, sale.longitude) == (52.0988, 5.0392)
    assert dataset.license == "CC BY-SA 4.0"


def test_synthetic_schema_is_rejected():
    with pytest.raises(ValueError, match="real 2025"):
        prepare(b"id,zipcode,retailvalue\n1,3525,500000\n")


def test_changed_source_does_not_replace_artifact(tmp_path):
    output = tmp_path / "public-sales.json"
    output.write_text("existing artifact")
    with pytest.raises(ValueError, match="checksum"):
        write_artifact(public_csv(), output)
    assert output.read_text() == "existing artifact"


def test_public_source_rejects_inconsistent_postcode():
    with pytest.raises(ValueError, match="line 2"):
        prepare(public_csv().replace(b"3544,3544MC", b"1234,3544MC"))


def test_bundled_public_data_serves_real_api_predictions(monkeypatch):
    class SnapshotDate(date):
        @classmethod
        def today(cls):
            return cls(2026, 9, 15)

    monkeypatch.setattr("app.model.date", SnapshotDate)
    monkeypatch.delenv("ESTIMATOR_SALES_PATH", raising=False)
    monkeypatch.setenv("ML_ESTIMATOR_TOKEN", "test-token")
    dataset, _ = load_sales(DATA_DIR / "public-sales.json")
    assert len(dataset.sales) == 153
    assert dataset.sourceSha256 == SOURCE_SHA256
    assert all(s.houseNumber is None for s in dataset.sales)
    real_model = ComparableSalesModel.from_files()
    monkeypatch.setattr("app.main.model", real_model)
    client = TestClient(app)
    assert client.get("/health").json()["status"] == "ok"
    payload = dict(
        postcode="3544MC",
        houseNumber=42,
        propertyType="HOUSE",
        livingAreaSqm=145,
        roomCount=5,
        constructionYear=2007,
    )
    response = client.post(
        "/v1/estimate", json=payload, headers={"Authorization": "Bearer test-token"}
    )
    assert response.status_code == 200
    result = response.json()
    assert result["comparableCount"] >= 5
    assert result["lowerBoundCents"] < result["estimatedValueCents"] < result["upperBoundCents"]
    assert result["modelVersion"] == client.get("/health").json()["modelVersion"]
    with pytest.raises(InsufficientData):
        real_model.predict(EstimateRequest.model_validate(payload | {"postcode": "1012AB"}))


def test_explicit_invalid_override_does_not_silently_use_public_data(tmp_path, monkeypatch):
    monkeypatch.setenv("ESTIMATOR_SALES_PATH", str(tmp_path / "missing.json"))
    with pytest.raises(OSError):
        ComparableSalesModel.from_files()


def test_anonymized_subject_postcode_is_excluded(model):
    model.sales = [sale.model_copy(update={"houseNumber": None}) for sale in model.sales]
    request = EstimateRequest(
        postcode="1012AC",
        houseNumber=999,
        propertyType="APARTMENT",
        livingAreaSqm=82.5,
        roomCount=4,
        constructionYear=1998,
    )
    with pytest.raises(InsufficientData):
        model.predict(request)


def test_nearby_selection_uses_coordinates_not_postcode_numbers(model):
    request = EstimateRequest(
        postcode="1012AB",
        houseNumber=42,
        propertyType="APARTMENT",
        livingAreaSqm=82.5,
        roomCount=4,
        constructionYear=1998,
    )
    anchor = model.sales[0].model_copy(update={"latitude": 52.1, "longitude": 5.1})
    # A distinct sector is close in real geography, despite a distant postcode number.
    nearby = [
        sale.model_copy(update={"postcode": "9999AA", "latitude": 52.11, "longitude": 5.1})
        for sale in model.sales[1:]
    ]
    model.sales = [anchor, *nearby]
    assert model.predict(request).comparableCount == 8
    model.sales = [anchor, *[sale.model_copy(update={"latitude": 53.1}) for sale in nearby]]
    with pytest.raises(InsufficientData):
        model.predict(request)


def test_unseen_sector_cannot_borrow_nearby_sales(model):
    model.sales = [s.model_copy(update={"latitude": 52.1, "longitude": 5.1}) for s in model.sales]
    request = EstimateRequest(
        postcode="1013AB",
        houseNumber=42,
        propertyType="APARTMENT",
        livingAreaSqm=82.5,
        roomCount=4,
        constructionYear=1998,
    )
    with pytest.raises(InsufficientData):
        model.predict(request)
