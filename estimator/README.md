# ZelfWonen estimator

Deterministic FastAPI service used by the Next.js estimator orchestrator. The service accepts normalized quantitative property data and optional fixed-rubric qualitative features. It returns integer euro-cent estimates and confidence bounds.

## Local development

The project uses uv and Python 3.12.

- `uv sync --python 3.12` creates the environment from `uv.lock`.
- `uv run uvicorn app.main:app --reload` starts the service on port 8000.
- `uv run pytest` runs the API contract tests.
- `uv run ruff check app tests` runs lint checks.

Set `ML_ESTIMATOR_TOKEN` to require a bearer token for `/v1/estimate`. The `/health` endpoint intentionally remains unauthenticated for service health checks.

The bundled model is deterministic scaffolding. Production requires a licensed, signed, versioned model artifact and monitored data/model governance.
