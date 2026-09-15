import hmac
import os

from fastapi import Depends, FastAPI, Header, HTTPException, status

from .model import ComparableSalesModel, InsufficientData
from .schemas import EstimateRequest, EstimateResponse

app = FastAPI(
    title="ZelfWonen deterministic property estimator",
    version="1.0.0",
    docs_url=("/docs" if os.getenv("ENVIRONMENT", "development") != "production" else None),
)
try:
    model = ComparableSalesModel.from_files()
except (OSError, ValueError, KeyError):
    model = None


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
    return {
        "status": "ok" if model else "data_unavailable",
        "modelVersion": model.model_version if model else "unavailable",
    }


@app.post("/v1/estimate", response_model=EstimateResponse, dependencies=[Depends(authorize)])
def estimate(request: EstimateRequest) -> EstimateResponse:
    if model is None:
        raise HTTPException(status_code=503, detail="Validated completed-sales dataset unavailable")
    try:
        return model.predict(request)
    except InsufficientData as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
