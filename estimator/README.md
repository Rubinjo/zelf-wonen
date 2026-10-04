# zelf-wonen price estimator

[Project overview](../README.md) · [Method](METHOD.md) · [Data attribution](data/NOTICE.md)

This Python API returns indicative property values. It first uses similar completed
sales, then falls back to property WOZ or municipal WOZ statistics.
The web app adds address verification, caching and optional photo assessment.

Bundled public data makes startup possible without a download or paid Kadaster
subscription. The data needs periodic refresh because the project is not actively
maintained.

## Run

From the repository root, with Python 3.12 and uv:

```bash
cd estimator
uv sync --python 3.12
uv run uvicorn app.main:app --reload
```

The API listens on port 8000. `GET /health` checks that data loads.
Set `ML_ESTIMATOR_TOKEN` to require Bearer authentication for estimates.
Keep the production API private.

```bash
curl http://localhost:8000/v1/estimate \
  -H 'Content-Type: application/json' \
  -d '{"postcode":"3544MC","houseNumber":42,"propertyType":"HOUSE","livingAreaSqm":145,"roomCount":5,"constructionYear":2007}'
```

Add `-H "Authorization: Bearer $ML_ESTIMATOR_TOKEN"` when a token is configured.
Values are returned in integer euro cents. See the
[API contract](../web/docs/estimator-openapi.yaml) for request and response fields.

## Data and limitations

The bundled September 2026 snapshot contains:

- 153 completed sales from 2024 around Utrecht, Vleuten, De Meern and Nieuwegein.
- CBS national monthly and regional quarterly price indices.
- Municipal WOZ medians for 342 municipalities.
- Residentievinder asking-price benchmarks for 338 municipalities.

Completed sales, assessed WOZ and asking prices remain separate.
Asking benchmarks can widen the range but never change the central estimate.
[Data attribution](data/NOTICE.md) records sources, transformations and licenses.
[Data research](DATA_SOURCES.md) explains the original source selection.

The completed-sales sample is small and regional. Nationwide WOZ coverage does
not establish nationwide sale-price accuracy. Estimates exclude unsupported
properties, new construction, homes outside 25–350 m² and stale evidence.
Insufficient inputs or support return 422. Invalid artifacts return 503.

Bounds are heuristic, rather than calibrated prediction intervals.
Leasehold, energy labels, plot size, monuments and hidden defects are not modeled.
Treat an estimate as an indication, rather than a professional appraisal.
The [method guide](METHOD.md) explains selection, time adjustment and photo influence.

## Refresh and evaluate

Run from `estimator/`:

```bash
uv run python -m scripts.fetch_public_sales
uv run python scripts/fetch_cbs.py
uv run python scripts/fetch_national.py
uv run python -m scripts.evaluate --cutoff 2024-07-01
```

The sales importer pins a reviewed source release and checks its hash.
Downloading it again does not make the 2024 sales newer.
Review provenance and licensing before changing the source pin.
Indices expire after 180 days, and sales leave the model after three years.

Restart the service after changing data. Rebuild the production image.
Artifact hashes change the model version and invalidate the web app's cached estimates.

The recorded forward evaluation has 90 holdout records, with 28 supported estimates
(31.1% coverage), 11.3% median absolute percentage error and 13.3% mean error.
75% of supported outcomes fall within the heuristic bounds.
Rerun evaluation after changing the data or model.
These results describe a small development sample, rather than independent
national validation. Revised indices prevent a strict point-in-time backtest.

## Custom completed-sales data

```bash
uv run python -m scripts.prepare_sales /path/to/sales.csv \
  --source 'Provider and export date' --license 'Permitted-use reference'
ESTIMATOR_SALES_PATH=data/sales.json uv run uvicorn app.main:app
```

Required columns:

```text
transactionId,propertyId,postcode,houseNumber,propertyType,livingAreaSqm,roomCount,constructionYear,saleDate,salePriceCents
```

Use `HOUSE` or `APARTMENT`, ISO dates, stable dwelling IDs and integer euro cents.
An empty house number represents an anonymized address. Optional latitude and
longitude must be supplied together. Import only verified completed residential
sales with permission to use them.

Private artifacts are excluded from Git and Docker builds.
Mount custom data read-only and set `ESTIMATOR_SALES_PATH` explicitly.
An invalid override fails rather than silently using bundled data.

## Tests

```bash
uv run pytest
uv run ruff check app tests scripts
```
