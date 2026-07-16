import hmac
import os

from fastapi import Depends, FastAPI, Header, HTTPException, status

from .model import DeterministicSpatialRegressor
from .schemas import EstimateRequest, EstimateResponse

app = FastAPI(
    title="ZelfWonen deterministic property estimator",
    version="1.0.0",
    docs_url=(
        "/docs" if os.getenv("ENVIRONMENT", "development") != "production" else None
    ),
)
model = DeterministicSpatialRegressor()


def authorize(authorization: str | None = Header(default=None)) -> None:
    expected = os.getenv("ML_ESTIMATOR_TOKEN")
    if not expected:
        return
    supplied = authorization.removeprefix("Bearer ") if authorization else ""
    if not hmac.compare_digest(supplied, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid service token"
        )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "modelVersion": model.model_version}


@app.post(
    "/v1/estimate", response_model=EstimateResponse, dependencies=[Depends(authorize)]
)
def estimate(request: EstimateRequest) -> EstimateResponse:
    return model.predict(request)
