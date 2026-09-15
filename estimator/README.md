# ZelfWonen historical-sales estimator

FastAPI service retaining the existing property request, authentication, euro-cent
output and Next.js image integration. Fixed €/m² prices, postcode hashing and the
emergency national-price fallback have been removed.

## Data and readiness

The repository contains **real CBS/Kadaster monthly historical price-index data**:
[StatLine 85773NED](https://www.cbs.nl/nl-nl/cijfers/detail/85773NED), January 1995
through July 2026, downloaded on 14 September 2026. `data/cbs-index.json` records
source, retrieval date and values. This national existing-home index is **not
individual transactions or a property price-per-m² dataset**.
Attribution: CBS / Kadaster; [CC BY 4.0](https://www.cbs.nl/en-gb/about-us/website/copyright).
CBS does not endorse this estimator.

**No licensed Dutch property-level completed-sale export was supplied.** Requests
return 503 until one is imported. Real-world accuracy has not been measured.
Synthetic test transactions are isolated in tests, never used as market evidence.

Suitable sources include [Kadaster Woningtransacties](https://www.kadaster.nl/zakelijk/producten/vastgoed/woningtransacties)
or another licensed provider. Join verified completed prices to reliable property
attributes, such as BAG dwelling identifiers, area and construction year; room
counts require a verified property source. Include only existing residential,
market-conform, single-property sales. Exclude family transfers, bundled sales,
new-build transactions and uncertain price/area records. The importer validates
structure, not the truth of a provider's completed-sale declaration. Asking prices
from the aggregator are not sale prices and are not used.

## Prepare and run

From `estimator/`, using Python 3.12 and uv:

```bash
uv sync --python 3.12
uv run python scripts/fetch_cbs.py
uv run python -m scripts.prepare_sales /path/to/licensed-sales.csv --source 'Provider and export date' --license 'Agreement/reference and permitted use'
uv run uvicorn app.main:app --reload
uv run pytest
uv run ruff check app tests scripts
```

Required CSV columns (prices in **integer euro cents**, ISO YYYY-MM-DD sale dates,
property type HOUSE or APARTMENT):

```text
transactionId,propertyId,postcode,houseNumber,propertyType,livingAreaSqm,roomCount,constructionYear,saleDate,salePriceCents
```

Use stable dwelling IDs, including individual apartment units. The importer
normalizes postcode spacing/case and rejects missing/unknown fields, invalid
ranges, future sales and duplicate transaction IDs. It atomically writes
`data/sales.json` only after the entire file validates. Source and license metadata
are mandatory. Keep source CSVs outside the repository; private sale artifacts are
git-ignored. No purchase or provider-specific scraping is performed.

Set `ESTIMATOR_SALES_PATH` for a different artifact location and
`ML_ESTIMATOR_TOKEN` to require authentication. Restart after refreshing artifacts;
both content hashes enter the model version and invalidate Next.js valuations.
Docker includes the public index only: mount private sales read-only at
`/app/data/sales.json`, or configure and mount an alternative path. Never bake
licensed/private data into the image. `/health` is unauthenticated and reports
`data_unavailable` when data cannot load; it remains a process health check.

## Method

1. Select sales in the preceding three years, strictly before valuation, from the
   same four-digit postcode and property type. Exclude the subject address and use
   at most one sale per dwelling. Numeric postcode distance is not geographic distance.
2. Require area within 0.75–1.33 times the subject, rooms within two, and year within
   30 years when known. Rank by area, rooms, year and recency; require at least five
   comparable dwellings and use at most 20.
3. Normalize each price per m² using the national CBS index ratio, multiply by
   subject area, and take the similarity-weighted median. This is a comparable-sales
   model without an additional ML dependency or invented feature premiums.
4. Apply the bounded photo adjustment below. Return final euro cents, bounds,
   support count, valuation month, adjustment percentage and artifact version.

The valuation month is the latest completed month in the index, not a forecast
to today's market. Missing sale-month indices are excluded. An index older than
180 days is rejected. Unsupported/sparse properties return 422; unavailable data
returns 503. Next.js retains photo-failure fallback to the quantitative model but
does not substitute unverified postcode statistics or a fixed national price.

## Uploaded images

Next.js verifies READY images belong to the authenticated owner before using the
existing vision provider. Configure that provider and object-storage media URL.
Kitchen, bathroom, interior, light and exterior use the existing 1–5 rubric;
unseen features must be null. Owner claims and instructions embedded in photos
are not visual evidence. Assessment failure leaves the numerical model usable.

Adjustment: `0.02 × confidence × sum(visible score − 3) / 5`, bounded at ±4%.
Unknown dimensions contribute zero; missing evidence or confidence below 0.5
produces no adjustment. This is a conservative heuristic, **not a coefficient
learned from paired condition/sale data** or renovation ROI. Images widen bounds
and never increase confidence. Photos cannot establish hidden defects, structural
condition, renovation dates or representative daylight. Tests do not call a live
vision provider.

## Evaluation and limitations

```bash
uv run python -m scripts.evaluate --cutoff 2025-01-01
```

Forward-only holdout evaluation uses pre-cutoff transactions to predict later
sales at their sale dates. Reports include holdout count, estimated count,
median/mean absolute percentage error and interval coverage. Unsupported cases
remain in the coverage denominator. Revised CBS vintages mean this is not a
point-in-time publication backtest. Evaluate your licensed export before enabling
customer valuations; there is no measured real-market accuracy claim here.

Bounds combine weighted dispersion, a 15% floor, small-sample and photo penalties.
They are **not calibrated prediction intervals**. Confidence is a conservative
support score, not a probability. Selection thresholds are defaults, not optimized
parameters. The national index can miss local movements, and postcode sectors
can contain heterogeneous neighborhoods. Leasehold, energy labels, plot area,
monuments, exact micro-location and hidden defects are not modeled because the
current request lacks reliable corresponding sale features. Room count/year affect
selection; missing year reduces similarity. Parking, land, commercial and new-build
valuations are unsupported. This is indicative, not a taxatierapport.
