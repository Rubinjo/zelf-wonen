# ZelfWonen inbound aggregator

A standalone Python/uv cron microservice that scrapes, parses, normalizes and
deduplicates rental/sale listings from **Funda** and **Kamernet** into a single
master record per property. More sources are added through a pluggable adapter
pattern without touching the pipeline.

This service is intentionally isolated from the Next.js web application. It only
reads/writes PostgreSQL (the same database the web app uses) and object storage.

## Principles

- **Scraping resilience** — rotating residential proxies, rotating User-Agent
  strings, exponential backoff with jitter, bounded retries, and a polite delay
  between requests.
- **Extreme normalization** — chaotic HTML/JSON from each source is mapped onto
  one strict internal schema (`app/models.py`).
- **Image hosting** — source images are downloaded and re-hosted in
  platform-controlled object storage (S3/R2) or a local directory in dev. The
  UI never hotlinks source images.
- **Locked cron** — a PostgreSQL advisory lock guarantees a scrape that runs
  longer than the 6-hour interval never overlaps with itself.
- **Intelligent dedup** — the same property listed on Funda and Kamernet with
  different IDs merges into one master record by `postcode + house number` OR
  `street + house number`. `platform_links` keeps every direct link.
- **Incremental + expiry** — detail pages are only fetched when a listing is new
  or its summary (price/status/title) changed. Raw responses are kept in
  `raw_payloads`. Listings that 404 or disappear from a sitemap are marked
  `OFFLINE`/`EXPIRED`, never deleted.

## Local development

```bash
cd aggregator
uv sync --python 3.12
uv run python -m app.main sync      # one-shot sync
uv run python -m app.main run       # loop forever on the interval
uv run pytest                       # unit tests
uv run ruff check app tests         # lint
```

Set the environment via `AGGREGATOR_`-prefixed variables (or a `.env` file):

| Variable | Default | Purpose |
| --- | --- | --- |
| `AGGREGATOR_DATABASE_URL` | `postgresql://houser:houser_dev_password@localhost:5432/houser` | Postgres DSN |
| `AGGREGATOR_SYNC_INTERVAL_SECONDS` | `21600` | cron cadence |
| `AGGREGATOR_PROXY_URLS` | *(empty)* | comma-separated residential proxy URLs |
| `AGGREGATOR_USER_AGENTS` | built-in list | `\|`-separated User-Agents |
| `AGGREGATOR_ENABLED_SOURCES` | `FUNDA,KAMERNET` | enabled adapters |
| `AGGREGATOR_FUNDA_SITEMAP_URL` | `https://www.funda.nl/sitemap/v1/huizen.xml` | discovery feed |
| `AGGREGATOR_KAMERNET_SEARCH_URL` | `https://kamernet.nl/api/listing/search` | discovery feed |
| `AGGREGATOR_IMAGE_STORAGE_MODE` | `local` | `local` or `s3` |
| `AGGREGATOR_LOCAL_MEDIA_DIR` | `../web/public/aggregated-media` | dev image dir |
| `AGGREGATOR_OBJECT_STORAGE_*` | — | S3/R2 endpoint, bucket, region, keys |

For object storage, configure `AGGREGATOR_OBJECT_STORAGE_ENDPOINT_URL`,
`AGGREGATOR_OBJECT_STORAGE_BUCKET`, `AGGREGATOR_OBJECT_STORAGE_REGION`,
`AGGREGATOR_OBJECT_STORAGE_ACCESS_KEY_ID` and
`AGGREGATOR_OBJECT_STORAGE_SECRET_ACCESS_KEY`, then set
`AGGREGATOR_IMAGE_STORAGE_MODE=s3`.

In local mode the default `AGGREGATOR_LOCAL_MEDIA_DIR` points at
`web/public/aggregated-media`, so the Next.js app serves the re-hosted images
directly at `/aggregated-media/*` (matching the web app's
`AGGREGATED_MEDIA_BASE_URL`). When running inside Docker in local mode, mount
that same folder into the container or switch to `s3`.

## Adding a new source

1. Subclass `app/adapters/__init__.py::SourceAdapter`.
2. Implement `discover`, `fetch_detail`, `parse_detail` and `normalize`.
3. Register it in `AdapterRegistry.default()` and add its name to
   `AGGREGATOR_ENABLED_SOURCES`.

The sync orchestrator (`app/sync.py`) is source-agnostic; it never imports
provider specifics.

## Legal note

Scraping Funda and Kamernet is adversarial and may violate their terms of
service. Confirm lawful access (licensed feeds, robots policy, or contractual
agreements) before enabling production scraping, and review redistribution and
image-hosting rights with counsel.
