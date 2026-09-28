# ZelfWonen inbound aggregator

[Documentation](../docs/README.md) · [Architecture](../docs/architecture.md)

> This optional service shares the project's [limited support status](../README.md).
> Live source access and completeness require operator validation.

A standalone Python/uv worker that scrapes, parses and normalizes rental/sale
listings from **Funda** and **Kamernet**. More sources are added through a pluggable adapter
pattern without touching the pipeline.

This service is intentionally isolated from the Next.js web application. It only
reads/writes PostgreSQL (the same database the web app uses) and image storage.

## Principles

- **Scraping resilience** — rotating residential proxies, rotating User-Agent
  strings, exponential backoff with jitter, bounded retries, and a polite delay
  between requests.
- **Schema normalization** — chaotic HTML/JSON from each source is mapped onto
  one strict internal schema (`app/models.py`).
- **Image hosting** — source images are downloaded and re-hosted in
  a persistent local volume on the VM (or optionally S3/R2). The
  UI never hotlinks source images.
- **Scheduled one-shot runs** — production uses a host systemd timer, daily at
  04:20 Europe/Amsterdam with up to ten minutes of jitter and missed-run catch-up.
  A PostgreSQL advisory lock prevents overlapping imports; a host lock coordinates
  imports with VM backups. The continuous loop remains available for development.
- **Conservative identity** — existing source links retain their master record.
  New Funda records may match a postcode, positive house number and suffix;
  other records use source + external ID. No street-only matching across cities
  and no merging different Kamernet rooms at the same address. Existing mistaken
  merges require a separate data review; this change does not split old records.
- **Full detail refresh + guarded expiry** — every discovered listing is refreshed
  on each run. Raw responses are kept in `raw_payloads`. Confirmed detail 404/410
  responses mark records offline; absence-based expiry is disabled by default.
  Even when enabled, empty discovery, pagination/cap failures and listing errors
  prevent absence-based expiry. HTTP block/challenge pages fail the run.
- **Observable failures** — either source failing results in a nonzero exit code,
  after attempting both. Per-source counts and last-success timestamps are written
  atomically to a private status file. systemd retains logs and emits local alerts.

Deployment commands, bounded live validation, timer installation and monitoring
are in [the VM deployment guide](../web/docs/deployment.md#scheduled-listing-imports-systemd).
The endpoints and parsers still require validation against the live sites from
the VM. Unit tests do not certify access or source coverage. Discovery limits are
failure thresholds, not a way to gradually cover all listings. An absent listing
stays in its previous state when absence-based expiry is disabled.

## Local development

First initialize the shared database using the [web setup guide](../docs/getting-started.md).
A sync writes real imported records and downloads media; it is not a dry run.

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
| `AGGREGATOR_SYNC_INTERVAL_SECONDS` | `21600` | development loop interval; the production timer is separate |
| `AGGREGATOR_STATUS_FILE` | `.state/status.json` | private per-source run results; `/app/state/status.json` in production |
| `AGGREGATOR_EXPIRE_MISSING` | `false` | opt in only after verifying exhaustive discovery |
| `AGGREGATOR_MAX_LISTINGS_PER_SOURCE` | `10000` | fail safely if a source exceeds this limit |
| `AGGREGATOR_POLITE_DELAY_SECONDS` | `0.5` (production: `1`) | delay between outbound requests |
| `AGGREGATOR_PROXY_URLS` | *(empty)* | comma-separated residential proxy URLs |
| `AGGREGATOR_USER_AGENTS` | built-in list | `\|`-separated User-Agents |
| `AGGREGATOR_ENABLED_SOURCES` | `FUNDA,KAMERNET` | enabled adapters |
| `AGGREGATOR_FUNDA_SITEMAP_URL` | `https://www.funda.nl/sitemap/v1/huizen.xml` | discovery feed |
| `AGGREGATOR_KAMERNET_SEARCH_URL` | `https://kamernet.nl/api/listing/search` | discovery feed |
| `AGGREGATOR_IMAGE_STORAGE_MODE` | `local` | `local` or `s3` |
| `AGGREGATOR_LOCAL_MEDIA_DIR` | `../web/public/aggregated-media` | local image directory; `/app/media` volume in Docker |
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
that same folder into the container. The production Compose stack already shares
the persistent `aggregated_media` volume with Caddy. Downloads are limited to
20 MiB, checked for supported image signatures, named by content hash, and
published atomically. HTML/error responses are not saved as photos.

For S3, also set the web app's `AGGREGATED_MEDIA_BASE_URL` to the bucket's public
serving URL. The aggregator only writes objects; it does not configure bucket
access policies. `OBJECT_STORAGE_MEDIA_BASE_URL` is not used.

## Adding a new source

1. Subclass `app/adapters/__init__.py::SourceAdapter`.
2. Implement `discover`, `fetch_detail`, `parse_detail` and `normalize`.
3. Register it in `AdapterRegistry.default()` and add its name to
   `AGGREGATOR_ENABLED_SOURCES`.

The sync orchestrator (`app/sync.py`) is source-agnostic; it never imports
provider specifics.

## Legal note

Confirm source-access, redistribution and image-hosting permissions before
enabling imports. Adapter availability does not establish permission to collect
or republish a provider's content. Obtain an appropriate review for your deployment.
