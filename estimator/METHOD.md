# National estimation method

[Estimator](README.md) · [AI engineering](../docs/ai-engineering.md)

Coverage counts below describe the bundled September 2026 artifacts.

## Evidence hierarchy

1. At least five similar local completed sales: existing weighted comparable model.
2. Otherwise, owner-supplied property WOZ, if supplied with its assessment year.
3. Otherwise, CBS municipal median WOZ €/m² multiplied by subject living area.

The third branch covers all 342 municipalities. It is a statistical indication,
not a nationally trained or validated transaction-price model. WOZ medians mix
property types and cannot account for plot, leasehold, condition, energy labels
or micro-location. Adding untrained premiums for those features would imply
accuracy that the available data cannot establish.

## Time adjustment

2025 WOZ values have a **January 2024 value reference date**. The national monthly
CBS index moves this value to the latest available completed month. Where
available, regional quarterly growth relative to national quarterly growth
corrects the factor for the municipality (four large cities) or province:

`monthly national growth × regional quarterly growth / national quarterly growth`.

Both quarterly growth factors use the reference quarter and latest common
completed quarter. National monthly movement interpolates the remaining months;
this is not an observed monthly regional series. The response names the region
and quarter, or warns that national growth was used. Index data must be less
than 180 days old; WOZ references older than four years are rejected.

## Uncertainty and asking-price cross-check

WOZ methods return zero comparables and apply no photo adjustment. Indicative
initial ranges are ±30% for property WOZ and ±45% for municipal WOZ. These are
policy choices, not fitted error quantiles. Confidence is a support score, never
a probability; the UI shows method and support rather than a certainty percentage.

Residentievinder municipal asking medians (338 municipalities, July–August 2026)
are a plausibility check only, usable for 180 days after publication. A difference
over 25% expands the range to include ±15% around the asking benchmark. The
central estimate remains unchanged. Differences may reflect property mix or
seller expectations; asking prices are never used as completed-sale labels.

No nationwide accuracy metric is claimed. The existing forward evaluation tests
the regional completed-sales branch only. The 2026 aggregate releases must not
be used to claim a 2024 historical backtest. Publication and staleness guards
prevent future municipal and asking snapshots from entering historical predictions;
CBS revised index vintages still preclude a strict point-in-time backtest.

## Integration

Next.js verifies the full address with PDOK, including house-number addition, and
passes municipality, province and exact coordinates to the internal estimator.
Internal fields are stripped from public requests and resolved by the server.
If PDOK cannot verify the address, the API returns 422; a PDOK outage returns 503.
Location context and all three artifact content hashes enter the cache key.

Direct Python service callers should supply `municipalityCode` (e.g. `GM0363`),
`provinceCode` (e.g. `PV27`), and paired `latitude`/`longitude`. Only trusted callers
should access this internal API. Optional `wozValueCents` and `wozAssessmentYear`
must be supplied together. The user value is explicitly marked unverified.

Responses add `method`, `warnings`, `sourceUrl`, `referenceMonth`,
`askingBenchmarkCents`, `askingSourceUrl`, and `calibrated: false`.
The existing cents, bounds, version and valuation month contract remains.
The UI offers optional WOZ inputs and displays the method, dates and source links.

## Refresh

From `estimator/`, run `uv run python scripts/fetch_national.py` and
`uv run python scripts/fetch_cbs.py`,
then restart the service (rebuild production Docker). The national importer
validates all municipal medians, all 12 provincial series, 338 exact asking
joins and the pinned asking CSV hash before atomically replacing the artifact.
Changing the WOZ release requires reviewing its assessment year, reference date,
publication date and coverage assertions in the importer.

Data provenance and licenses: [data/NOTICE.md](data/NOTICE.md).
