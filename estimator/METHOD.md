# Estimation method

[Estimator guide](README.md) · [Data attribution](data/NOTICE.md)

## Choosing the evidence

The estimator uses the first supported method:

1. At least five similar local completed sales.
2. Owner-supplied property WOZ with an assessment year.
3. Municipal median WOZ per square metre multiplied by living area.

Municipal WOZ mixes property types and lacks property-specific condition and
location detail. Its nationwide coverage is a statistical fallback.

## Comparable sales

The model selects same-type sales within 5 km, from the previous three years and
strictly before valuation. It compares area, room count, age, distance and recency,
then uses 5–20 distinct homes to calculate a weighted median price per square metre.

PDOK coordinates locate the subject. Direct API calls without coordinates use an
approximate postcode-sector center. Custom sales without coordinates must share
the postcode sector. Anonymized sales in the subject's full postcode are excluded
to avoid using the subject as its own comparable.

CBS indices adjust sale prices to the latest completed month in the data.
The result is scaled to the subject's area. This is a deterministic comparable
model with no separate regression training step.

## WOZ and time adjustment

A WOZ assessment refers to an earlier value date. For example, the bundled 2025
assessment refers to January 2024. National monthly CBS growth updates that value,
with regional quarterly correction where available.

Indices older than 180 days and WOZ references older than four years are rejected.
Responses identify the method, region, reference dates, sources and warnings.
Owner-supplied WOZ remains marked unverified.

Property WOZ starts with a ±30% range, and municipal WOZ with ±45%.
These are policy choices. Confidence describes evidence support rather than
a probability of accuracy.

A recent municipal asking-price benchmark can widen the range when it differs
by more than 25%. It does not change the estimate or become a completed-sale label.

## Photo assessment

The web app checks uploaded photo ownership and file hashes before sending photos
to the AI provider. If assessment fails, estimation continues without photo scores.

Comparable-sales estimates can receive a visible-condition adjustment capped at
±4%. Unknown dimensions are neutral. Low-confidence assessments make no adjustment.
Photos can widen bounds and never increase confidence.
WOZ methods receive no photo adjustment. This rule is a heuristic rather than
a learned renovation premium.

## API integration

The web app resolves the full address with PDOK and supplies municipality,
province and coordinates. Unresolved addresses return 422, and PDOK outages return 503.
The cache includes location, inputs, photo hashes and the model's data version.

Trusted direct Python callers should supply `municipalityCode`, `provinceCode`
and paired `latitude`/`longitude`. Optional `wozValueCents` and
`wozAssessmentYear` must be supplied together.
See the [API contract](../web/docs/estimator-openapi.yaml).

## Validation limits

The regional forward evaluation is described in the [estimator guide](README.md#refresh-and-evaluate).
It does not validate national accuracy. Future municipal snapshots are excluded
from historical predictions, but revised CBS indices still prevent a strict
point-in-time backtest. Bounds remain uncalibrated.

Use the [refresh commands](README.md#refresh-and-evaluate) after reviewing new data
releases and their reference dates, coverage and licenses.
