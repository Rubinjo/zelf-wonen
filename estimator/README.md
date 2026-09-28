# ZelfWonen public-data price estimator

[Documentation](../docs/README.md) · [AI engineering](../docs/ai-engineering.md) · [Method](METHOD.md)

> This service is not actively maintained. Bundled evidence ages; operators must
> refresh indices and review dataset coverage. See [project status](../README.md).

A FastAPI service that estimates property values from local completed sales,
then falls back to indexed property or municipal WOZ statistics. It returns
integer euro cents and supports Bearer authentication. The Next.js application
adds caching and optional photo-condition assessment. It runs
out of the box using **free, bundled public data**, without a Kadaster
Woningtransacties subscription, API key, or private sales export.

## Sources and coverage

The figures below describe the bundled September 2026 snapshot, not a live data feed.

- **Utrecht Housing Dataset**, real-data release: 153 completed transactions from
  January–November 2024 in 26 postcode sectors around Utrecht, Vleuten, De Meern
  and Nieuwegein. [Source and license](https://www.kaggle.com/datasets/ictinstitute/utrecht-housing-dataset),
  [publication](https://ictinstitute.nl/utrecht-housing-dataset-2025/).
  The Kaggle data is CC BY-SA 4.0; the derived `data/public-sales.json` has the same
  license. Full attribution and transformation details: [data/NOTICE.md](data/NOTICE.md).
- **CBS / Kadaster StatLine 85773NED**: the free national monthly existing-home
  price index, CC BY 4.0. `data/cbs-index.json` contains values through July 2026.
  [Source](https://www.cbs.nl/nl-nl/cijfers/detail/85773NED).

The imported target is `retailvalue` (actual transaction price, in thousands of
euros), converted to integer euro cents. `valuationdate` is the transaction date.
Asking prices and the older **synthetic** Utrecht datasets packaged in the same
archive are excluded. The research authors originally collected the sale prices;
using their openly licensed release requires no purchase from Kadaster.

The sales sample is regional. A **nationwide statistical fallback covers all 342
municipalities** using official municipal median WOZ per m² and CBS regional
market indices. Optional owner-supplied property WOZ takes precedence over the
municipal median when local sales are insufficient. This does not establish
national transaction-price accuracy. See [method and API details](METHOD.md).
Nonresidential properties, new construction, homes outside 25–350 m², missing
geography and stale indices return 422. The local-sales branch needs five comparables.
At the bundled September 2026 snapshot, 116 of the 153 source property profiles
have sufficient support after excluding their full postcode. This is a coverage
check, not an accuracy test.

## Run

From `estimator/`, with Python 3.12 and uv:

```bash
uv sync --python 3.12
uv run uvicorn app.main:app --reload
```

No download is needed for normal startup. `GET /health` reports `status: ok` when
artifacts load. Set `ML_ESTIMATOR_TOKEN` to require Bearer authentication on
`POST /v1/estimate`. Missing or invalid artifacts return 503 for estimates.

Example request with support in the bundled data:

```bash
curl http://localhost:8000/v1/estimate \
  -H 'Content-Type: application/json' \
  -d '{"postcode":"3544MC","houseNumber":42,"propertyType":"HOUSE","livingAreaSqm":145,"roomCount":5,"constructionYear":2007}'
```

Include `-H "Authorization: Bearer $ML_ESTIMATOR_TOKEN"` when a token is set.
Docker includes all three public artifacts and their attribution. Production Compose
needs no sales-data mount; local Compose mounts `estimator/data` read-only for
refreshes. See [VPS deployment](../web/docs/deployment.md).

## Reproduce or refresh the data

```bash
uv run python -m scripts.fetch_public_sales
uv run python scripts/fetch_cbs.py
uv run python scripts/fetch_national.py
uv run python -m scripts.evaluate --cutoff 2024-07-01
uv run pytest
uv run ruff check app tests scripts
```

The public-data importer downloads archive version 5 without authentication,
selects only `2025-housing-dataset-alldata.csv`, checks its SHA-256, validates all
153 rows, and atomically replaces `data/public-sales.json`. It fails before
replacement on an unexpected source change. A newer research release requires
reviewing its schema, provenance and license before updating the pin. The pinned
2024 sample is static; re-downloading it does not make its sales newer.

Restart after changing any artifact (rebuild the production image). All
content hashes enter the model version, invalidating cached Next.js valuations.
The index must be refreshed at least every 180 days; old sales eventually leave
the three-year window and require a newer sales dataset.

## Method

1. Use verified PDOK subject coordinates. Direct internal callers without
   coordinates retain the approximate pre-valuation postcode-sector sample center.
2. Select same-type sales within 5 km of that center, in the previous three
   years and strictly before valuation. Require area ratio 0.75–1.33, rooms
   within two and construction year within 30 when known. If coordinates are
   absent in an optional custom export, require the same postcode sector.
3. Research house numbers are anonymized: keep them null and exclude **all sales
   in the subject's full six-character postcode**. Never treat `zipcode6id` as a
   house number. Deduplicate by dwelling, rank by geographic distance, area,
   rooms, year and recency, and require 5–20 distinct comparables.
4. Normalize price per m² with the national CBS index, scale to subject area,
   and take the similarity-weighted median. This is a deterministic nearest-
   comparable model: loading the prepared observations fits its reference set;
   no separate regression training or extra ML dependency is needed.
5. Apply the bounded visible-photo adjustment and return euro cents, bounds,
   support count, valuation month, adjustment percentage and artifact version.

The valuation month is the latest completed month available in the index,
not a forecast to today's market. Missing sale-month indices are excluded.
The existing Next.js vision integration verifies image ownership and falls back
to the quantitative estimate if photo assessment fails.

Photo adjustment: `0.02 × confidence × sum(visible score − 3) / 5`, bounded at
±4%. Unknown dimensions are neutral; absent evidence or confidence below 0.5
produces no adjustment. This is a heuristic, not a learned renovation return.
Photos widen bounds and never increase confidence.

## Evaluation and limitations

The following is the recorded result for the bundled artifacts; rerun the command
above after changing data or model code.

Forward-only evaluation uses only pre-cutoff sales to predict holdout sales at
their transaction dates. The July 1, 2024 cutoff yields **90 holdout records,
28 supported estimates (31.1% coverage), 11.3% median absolute percentage error
and 13.3% mean error**; 75% of supported outcomes fall within the heuristic bounds.
Unsupported records stay in the estimation-coverage denominator. Error and
interval coverage are calculated only for supported estimates. This small,
selectively supported sample does not establish national or production accuracy.
The geography extension was developed using this dataset; this report is a
reproducible diagnostic, not an untouched final validation set. Revised CBS
vintages also prevent a point-in-time publication backtest.

Bounds use weighted dispersion, a 15% floor, small-sample and photo penalties.
They are not calibrated prediction intervals; confidence is a support score,
not a probability. The sample-center location can miss local differences.
Leasehold, energy labels, plot size, monuments and hidden defects are not modeled.
Treat the result as indicative, not a taxatierapport.

## Optional custom completed-sales data

The existing normalized CSV importer remains available:

```bash
uv run python -m scripts.prepare_sales /path/to/sales.csv \
  --source 'Provider and export date' --license 'Permitted-use reference'
ESTIMATOR_SALES_PATH=data/sales.json uv run uvicorn app.main:app
```

Required CSV columns:

```text
transactionId,propertyId,postcode,houseNumber,propertyType,livingAreaSqm,roomCount,constructionYear,saleDate,salePriceCents
```

Use HOUSE/APARTMENT, ISO sale dates, integer euro cents, and stable dwelling IDs.
An empty house number means anonymized. Optional `latitude` and `longitude` must
be supplied together. Verify completed, existing residential, single-property
market sales before importing. Private artifacts remain git-ignored and excluded
from Docker builds. Mount a custom artifact read-only and explicitly configure
`ESTIMATOR_SALES_PATH`; a broken override fails rather than silently switching data.
