from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

VALID_REQUEST = {
    "postcode": "1012AB",
    "houseNumber": 42,
    "propertyType": "APARTMENT",
    "livingAreaSqm": 82.5,
    "roomCount": 4,
    "constructionYear": 1998,
    "qualitativeFeatures": {
        "kitchenCondition": 4,
        "bathroomCondition": 3,
        "interiorFinish": 4,
        "naturalLight": 5,
        "exteriorCondition": 3,
        "confidence": 0.8,
        "evidence": ["Bright living room", "Modern kitchen"],
    },
}


def test_health_reports_model_version() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["modelVersion"]


def test_estimate_requires_configured_service_token(monkeypatch) -> None:
    monkeypatch.setenv("ML_ESTIMATOR_TOKEN", "test-service-token")

    missing = client.post("/v1/estimate", json=VALID_REQUEST)
    invalid = client.post(
        "/v1/estimate",
        json=VALID_REQUEST,
        headers={"Authorization": "Bearer wrong-token"},
    )

    assert missing.status_code == 401
    assert invalid.status_code == 401


def test_estimate_accepts_valid_service_token(monkeypatch) -> None:
    monkeypatch.setenv("ML_ESTIMATOR_TOKEN", "test-service-token")

    response = client.post(
        "/v1/estimate",
        json=VALID_REQUEST,
        headers={"Authorization": "Bearer test-service-token"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["lowerBoundCents"] <= body["estimatedValueCents"]
    assert body["estimatedValueCents"] <= body["upperBoundCents"]
    assert 0 <= body["confidence"] <= 1
    assert body["modelVersion"]


def test_estimate_is_deterministic(monkeypatch) -> None:
    monkeypatch.delenv("ML_ESTIMATOR_TOKEN", raising=False)

    first = client.post("/v1/estimate", json=VALID_REQUEST)
    second = client.post("/v1/estimate", json=VALID_REQUEST)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json() == second.json()


def test_estimate_rejects_invalid_or_unknown_input(monkeypatch) -> None:
    monkeypatch.delenv("ML_ESTIMATOR_TOKEN", raising=False)
    invalid_request = {
        **VALID_REQUEST,
        "postcode": "0123 ab",
        "livingAreaSqm": 0,
        "untrustedFeature": 5,
    }

    response = client.post("/v1/estimate", json=invalid_request)

    assert response.status_code == 422
    invalid_fields = {tuple(error["loc"]) for error in response.json()["detail"]}
    assert ("body", "postcode") in invalid_fields
    assert ("body", "livingAreaSqm") in invalid_fields
    assert ("body", "untrustedFeature") in invalid_fields
