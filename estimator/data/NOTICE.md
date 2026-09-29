# Public data attribution

## Utrecht completed sales

`public-sales.json` is adapted from **The Utrecht Housing dataset: A housing
appraisal dataset**, Sieuwert van Otterloo and Pavlo Burda, ICT Institute (2025).
[Paper](https://doi.org/10.54822/QVHM1662) ·
[Publisher](https://ictinstitute.nl/utrecht-housing-dataset-2025/) ·
[Dataset and license](https://www.kaggle.com/datasets/ictinstitute/utrecht-housing-dataset).

The Kaggle release is licensed **[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)**.
This adapted data artifact is distributed under that same license. Retain this
notice and the artifact's attribution when redistributing the data. The data
authors do not endorse ZelfWonen. This notice concerns the dataset, not a change
to the license of the application's code.

Source: Kaggle archive version 5, `2025-housing-dataset-alldata.csv`, 153 real
transactions dated 2024-01-31 through 2024-11-27. Retrieved 2026-09-15.
SHA-256 of the original CSV:
`a57964f094652d5f0f90c2d14a29e57c2c0740c2ad04fb00386dbf3e4dc526d0`.

Changes: selected model input columns including published coordinates; translated house types; converted
`retailvalue` from thousands of euros into integer euro cents; namespaced record
IDs; represented withheld house numbers as null. `zipcode6id` is an anonymized
identifier, **not** a real house number. Asking prices are not used. The older
synthetic files in the same download archive are not used.

Coverage: 26 postcode sectors in Utrecht, Vleuten, De Meern and Nieuwegein.
Records are a small research sample, not a comprehensive market feed.

## Monthly index

`cbs-index.json`: CBS / Kadaster, StatLine
[85773NED](https://www.cbs.nl/nl-nl/cijfers/detail/85773NED),
[CC BY 4.0](https://www.cbs.nl/en-gb/about-us/website/copyright).
See the artifact for retrieval date and source URL. CBS / Kadaster do not endorse
this estimator. This public index requires no paid Woningtransacties subscription.

## Municipal WOZ and regional market indices

`national-woz.json`: CBS, 2025 municipal median WOZ per square metre,
342 municipalities, value reference date **1 January 2024**, published 13 February 2026.
[Original table](https://www.cbs.nl/item?sc_itemid=9f5fb087-2192-4ede-91d2-29bc7e0d3a9e&sc_lang=nl-nl).
Regional quarterly existing-home price indices: CBS / Kadaster,
[85792NED](https://www.cbs.nl/nl-nl/cijfers/detail/85792NED).
Both are [CC BY 4.0](https://www.cbs.nl/en-gb/about-us/website/copyright).
Changes: chart CSV extracted, municipality codes retained, quarterly indices
selected. These are aggregate statistics, not individual transaction labels.

## Asking-price plausibility benchmark

Bron: **Residentievinder (residentievinder.nl)**, asking-price snapshot published
15 August 2026, observations 18 July–14 August 2026, 338 municipalities.
[Dataset version 1](https://www.kaggle.com/datasets/dekeijzer/vraagprijs-per-m-per-gemeente-nederland)
· [Methodology](https://data.residentievinder.nl/prijs-per-m2/over-deze-data/).
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Changes: retained median asking €/m² and counts; joined municipality names to CBS
codes, including eight explicit name aliases. Original CSV SHA-256:
`31821762202714ed3418cda9c37f7a5beacdb44d220ec7332288de4e9552b49d`.
The benchmark only checks plausibility and widens bounds; it never becomes a
completed-sale label or adjusts the central estimate. No endorsement implied.
