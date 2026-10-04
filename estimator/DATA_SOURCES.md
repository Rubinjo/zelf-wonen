# Housing-data research

[Estimator guide](README.md) · [Implemented method](METHOD.md) · [Attribution](data/NOTICE.md)

This summarizes the September 2026 investigation.
Availability and terms were recorded then and have not been revalidated.
Use the method and attribution guides for the bundled implementation.

The main constraint was finding completed-sale prices with property attributes.
National address coverage and neighborhood statistics do not provide national
sale-price labels or establish valuation accuracy.

## Sources considered

| Source | Useful for | Limitation |
| --- | --- | --- |
| [BAG via PDOK](https://www.pdok.nl/ogc-apis/-/article/basisregistratie-adressen-en-gebouwen-ba-1) | Addresses, building IDs, area and location | No sale prices |
| [CBS neighborhood data](https://www.cbs.nl/nl-nl/cijfers/detail/85984NED) | Housing context and WOZ statistics | Aggregate values rather than individual sale observations |
| [CBS regional indices](https://www.cbs.nl/nl-nl/cijfers/detail/85792NED) | Price movement over time | Regional indices do not describe each property's value |
| [Residentievinder](https://data.residentievinder.nl/prijs-per-m2/over-deze-data/) | Municipal asking-price benchmarks | Asking prices differ from completed prices |
| [RVO EP-Online](https://public.ep-online.nl/swagger/index.html) | Registered energy labels | Requires credentials and review of reuse terms |
| [Joined BAG/CBS dataset](https://www.kaggle.com/datasets/danushkumarv/netherlands-housing-analytics) | Feature-pipeline prototyping | Neighborhood WOZ is not an individual sale-price label |

The implemented estimator uses regional completed sales, municipal WOZ, CBS
indices and a separate asking-price check. It has no trained energy or amenity
premium model.

## Sources that did not solve the price gap

Sold-listing datasets can contain the last asking price rather than the completed
price. Check the actual fields and upstream rights before importing them.

Individual [WOZ inspection](https://www.waarderingskamer.nl/voor-gemeenten/hulpmiddelen/vraagbaak-waardevastelling-wet-woz/hoofdstuk-7-openbare-en-niet-openbare-woz-gegevens)
does not establish permission for bulk extraction.
[WOZ API access](https://www.kadaster.nl/zakelijk/producten/adressen-en-gebouwen/woz-api-bevragen)
was restricted to specified uses.
[CBS microdata](https://www.cbs.nl/nl-nl/onze-diensten/maatwerk-en-microdata/microdata-zelf-onderzoek-doen)
requires approved access and was not a free public production source.

## Future data work

Obtain geographically diverse completed-sale records with permission to use them.
Keep dwelling identifiers, reference dates and price bases explicit.
Evaluate on later sales and separate regions, reporting both error and supported
coverage. Keep the same home out of both development and evaluation groups.

More feature records alone do not close the sale-price gap.
