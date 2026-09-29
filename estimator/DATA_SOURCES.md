# Housing-data research (September 2026)

[Documentation](../docs/README.md) · [Implemented method](METHOD.md)

> Historical research, retained for context. Availability, terms and coverage
> below were recorded at the research date and have not been revalidated in the
> documentation review. This is not a current procurement or licensing guide.

Researched 2026-09-15. Scope: free/public sources for extending the existing
Utrecht comparable-sales estimator across the Netherlands.

## Conclusion

Implementation update, 2026-09-16: the serving estimator now combines PDOK address
resolution, local completed sales, optional property WOZ, official municipal WOZ
medians, regional/national CBS price indices and a separate asking-price check.
See [implemented hierarchy, safeguards and limitations](METHOD.md). The remaining
sources below are research context; unvalidated demographic, energy and amenity
coefficients were deliberately not introduced.

There is enough open data to build national property coverage and an indicative
regional valuation baseline. This research did **not** find a verified, freely
reusable nationwide file of individual completed-sale prices with property
attributes. That remains the constraint on training and validating an accurate
national sale-price model. More property records without sale prices do not
resolve it. The existing Utrecht holdout score cannot establish national accuracy.

## Sources assessed

### 1. BAG via PDOK: the national property foundation

[Official service](https://www.pdok.nl/ogc-apis/-/article/basisregistratie-adressen-en-gebouwen-ba-1)
· [API collections](https://api.pdok.nl/kadaster/bag/ogc/v2/collections?f=json)

- National addresses, residential units, buildings, floor area, construction year,
  geometry, identifiers and object status; the service is updated daily.
- Metadata verified: Public Domain Mark 1.0; public API, no paid subscription.
- Use the residential-unit identifier, not just the building identifier, so
  apartments stay distinct. Preserve house-number additions and unit identities.
- Use coordinates to assign municipality/neighbourhood and find nearby properties.
  BAG use functions do not provide a complete market housing-type classification.
- No sale prices. BAG area also needs a documented definition and should not be
  assumed identical to a listing's measured living area.

Existing integration: `web/src/lib/integrations/property-data/bag-wfs-client.ts`.
The estimator now receives PDOK subject coordinates and official municipality
and province codes. It does not require a bulk BAG feature dataset.

### 2. CBS neighbourhood/postcode data: local context

[Kerncijfers 2024, 85984NED](https://www.cbs.nl/nl-nl/cijfers/detail/85984NED)
· [Postcode6 API](https://api.pdok.nl/cbs/postcode6/ogc/v1/api?f=html)

- National small-area housing statistics, average WOZ, housing mix and proximity
  to amenities; CBS/PDOK releases use CC BY 4.0.
- Join by official neighbourhood code or spatial boundaries, with the appropriate
  reference year. Suppressed values must remain missing.
- WOZ is an assessed value with a valuation reference date, not a sale observation.
  For example, the 2026 WOZ assessment refers to 1 January 2025.
  [CBS explanation](https://www.cbs.nl/nl-nl/nieuws/2026/25/gemiddelde-woz-waarde-ruim-10-procent-hoger).
- Do not assign the same neighbourhood WOZ average to every BAG unit and treat
  those copies as independent price-training examples.

Existing integration: `web/src/lib/integrations/neighborhood-data-client.ts`
already discovers CBS datasets and retrieves neighbourhood context. Extend that
pipeline instead of creating another inconsistent address-to-neighbourhood join.

### 3. Ready-made BAG/CBS join: faster prototyping

[Netherlands Housing: Neighborhoods & Buildings](https://www.kaggle.com/datasets/danushkumarv/netherlands-housing-analytics)

- Kaggle version 9, updated 2026-05-04; declared CC BY 4.0.
- Publisher reports 8,633,533 residential records, with BAG IDs, area, year,
  coordinates, municipality and neighbourhood codes, plus 2023/2024 CBS tables.
- Metadata and downloadable data dictionary were inspected. The large Parquet
  files were not downloaded or independently audited in this assessment.
- Useful as a starting feature dataset. It contains neighbourhood WOZ statistics,
  not millions of individual price labels. Prefer direct official feeds for a
  maintained production pipeline; check unit/building semantics and status filters.

### 4. CBS regional transaction indices: better time adjustment

[Regional PBK, 85792NED](https://www.cbs.nl/nl-nl/cijfers/detail/85792NED)
· [Average sale prices, 83625NED](https://www.cbs.nl/nl-nl/cijfers/detail/83625NED)

- Public StatLine data; CC BY 4.0 under the
  [CBS copyright policy](https://www.cbs.nl/en-gb/about-us/website/copyright).
- Verified the regional index API: it includes all 12 provinces, the four major
  cities, national and broad regional series. It is not an index for every
  individual municipality.
- Extend the current national-only index normalization with the applicable
  regional series and explicit fallback rules, respecting quarterly periods.
- Municipal average completed-sale prices are useful aggregate benchmarks. Their
  changes also reflect which homes sold; do not use them as a substitute for a
  constant-quality price index or individual sale records.

CBS also publishes municipal median WOZ per square metre:
[February 2026 publication](https://www.cbs.nl/item?sc_itemid=9f5fb087-2192-4ede-91d2-29bc7e0d3a9e&sc_lang=nl-nl).
This provides an official assessed-value baseline, not a verified property quote.

### 5. Residentievinder: current asking-price benchmarks

[Methodology](https://data.residentievinder.nl/prijs-per-m2/over-deze-data/)
· [Downloadable snapshot](https://www.kaggle.com/datasets/dekeijzer/vraagprijs-per-m-per-gemeente-nederland)

- Downloaded and inspected version 1: **338 municipality rows**, all with numeric
  median asking prices per square metre; their observation counts sum to 64,419.
  These are 338 aggregate records, not 64,419 downloadable individual homes.
- The release describes an observation window of 18 July–14 August 2026.
  The included LICENSE.txt explicitly permits commercial reuse under CC BY 4.0
  with Residentievinder attribution.
- Includes counts and price-distribution percentiles. Useful for a separately
  labelled asking-price baseline and market comparisons.
- Recently sold listings still use their last asking price. P10/P90 describe the
  observed stock's price distribution, not an individual prediction interval.
- The advertised live CSV returned HTTP 403 in this environment. The pinned
  Kaggle snapshot downloaded successfully; unattended live refresh is unverified.

### 6. RVO EP-Online: energy features

[Official API](https://public.ep-online.nl/swagger/index.html)
· [API-key application](https://apikey.ep-online.nl/)
· [RVO file-download manual](https://www.rvo.nl/sites/default/files/2025-02/handleiding-ep-online-opvragen-van-bestanden.pdf)

- Official national register of registered energy labels; individual lookup,
  monthly total files and daily changes. Public access requires an API key and
  acceptance of RVO's terms; do not assume a CC0 redistribution license.
- Match using BAG addressable-object IDs, retaining registration/validity dates.
  Not every property necessarily has a usable registered label.
- It supplies model features, not prices. Estimate their effect from appropriate
  labelled data rather than inventing fixed A-label premiums. Avoid using labels
  issued after a historical sale when evaluating that sale.
- No account was requested and no authenticated download was attempted.

## Sources that do not close the sale-price gap

- [Funda sold-houses dataset](https://www.kaggle.com/datasets/yoerireumkens/funda-sold-houses-data-raw-dutch-columns):
  metadata says CC0, last update August 2023. Its documented price is
  `Laatste vraagprijs` (last asking price). Sold status does not turn that into
  the completed price. A dataset uploader's license also does not independently
  establish rights to every upstream field.
- [Bryan2k19 Dutch House Prices](https://www.kaggle.com/datasets/bryan2k19/dutch-house-prices-dataset):
  metadata identifies CC BY-NC-SA 4.0 and a 2022 release. It is unsuitable as the
  default dataset for this commercial platform without appropriate permission.
- [2026 Funda city sample](https://www.kaggle.com/datasets/anatolyskuba/netherlands-house-prices-by-city-funda-2026):
  CC BY 4.0, but only 67 city summaries and a small listing sample; asking prices.
- [WOZ-waardeloket rules](https://www.waarderingskamer.nl/voor-gemeenten/hulpmiddelen/vraagbaak-waardevastelling-wet-woz/hoofdstuk-7-openbare-en-niet-openbare-woz-gegevens):
  public individual inspection does not make the register an unrestricted bulk
  data source. The authority states that bulk supply and mass electronic
  extraction are not currently permitted.
- [WOZ API Bevragen](https://www.kadaster.nl/zakelijk/producten/adressen-en-gebouwen/woz-api-bevragen):
  access is for municipalities and specified statutory uses, not a general free
  commercial valuation API.
- [CBS transaction microdata](https://www.cbs.nl/nl-nl/onze-diensten/maatwerk-en-microdata/microdata-zelf-onderzoek-doen/microdatabestanden/transactieskoopwoningen-transacties-bestaande-koopwoningen)
  really contains completed transactions, but access requires approved research,
  a controlled environment and costs. It is not an openly downloadable production
  source. [Access rules](https://www.cbs.nl/nl-nl/onze-diensten/maatwerk-en-microdata/microdata-zelf-onderzoek-doen).

## Original integration and validation proposals

1. Build one versioned national property-feature pipeline: BAG unit IDs and exact
   locations, dated CBS neighbourhood records, and optional RVO energy labels.
   Keep identifiers and reference dates consistent between training and serving.
2. Keep three price bases distinct: completed sale, assessed WOZ and asking price.
   Add explicit provenance, price basis, geographic support and reference dates
   to the estimator output. A national statistical baseline should not claim to
   have five individual completed-sale comparables.
3. Retain the Utrecht comparable-sales route where supported. Develop and label
   a national baseline separately using public local benchmarks; do not treat a
   regional average multiplied by area as demonstrated individual accuracy.
4. Obtain geographically diverse completed-sale labels to learn and validate the
   final price model: permitted platform transaction records, broker/data-sharing
   partnerships, or a suitable licensed release. This assessment establishes no
   free national source for that step.
5. Evaluate on later sales and held-out areas, grouping repeated properties so
   the same home cannot occur on both sides. Report errors, estimation coverage
   and interval coverage by province, housing type, size and price band. Compare
   with simple local/WOZ baselines. Tune uncertainty on separate calibration data.

This file records research and integration recommendations. No national accuracy
claim is made. The original research preceded the implementation linked above.
