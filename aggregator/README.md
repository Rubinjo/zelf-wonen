# ZelfWonen inbound aggregator

[Documentation](../docs/README.md) · [Architecture](../docs/architecture.md)

> This optional service shares the project's [limited support status](../README.md).
> Live source access and completeness require operator validation.

A standalone Python/uv worker that scrapes, parses and normalizes rental/sale
listings from **Funda** and **Kamernet**. More sources are added through a pluggable adapter
pattern without touching the pipeline.

The worker writes PostgreSQL (the same database the web app uses) and image
storage. It also calls the web app's internal neighborhood endpoint to reuse
the native listing data sources.

## Principles

- **Polite collection** — a stable session/identity, advisory robots.txt checks, five-second
  request spacing (including images), bounded transient retries, and persistent
  cooldowns for restrictions. No CAPTCHA solving or identity rotation on blocks.
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
- **Resumable discovery and detail refresh** — each run advances a bounded number
  of search pages and processes a bounded detail batch. Atomic queues beside the
  status file survive restarts. Raw detail responses remain in `raw_payloads`.
  Active links missing from search are queued for explicit detail checks at the
  end of a crawl. Public-search adapters never expire records based on absence;
  confirmed detail 404/410 responses and explicit listing status determine removal.
- **Observable failures** — either source failing results in a nonzero exit code,
  after attempting both. Per-source counts and last-success timestamps are written
  atomically to a private status file. systemd retains logs and emits local alerts.

Deployment commands, bounded live validation, timer installation and monitoring
are in [the VM deployment guide](../web/docs/deployment.md#scheduled-listing-imports-systemd).
Unit tests do not certify live access or coverage. On 2026-09-29, the bounded live
check validated Kamernet search and one detail. On 2026-10-02, Funda discovery and
one detail passed using the Chrome-compatible transport; the previous httpx
transport returned a verification page. This validates access from the local
Windows host, not nationwide coverage or access from the production VM.
No implementation can guarantee uninterrupted collection, zero maintenance, or
that the providers will never block it. A supported feed/allowlisted integration
is the appropriate next step when a provider consistently restricts access.

## Local development

First initialize the shared database using the [web setup guide](../docs/getting-started.md).
A sync writes real imported records and downloads media; it is not a dry run.

```bash
cd aggregator
uv sync --python 3.12
uv run python -m app.main check-sources # one detail per source; no DB/media writes
uv run python -m app.main sync      # one resumable batch per source
uv run python -m app.main run       # loop forever on the interval
uv run pytest                       # unit tests
uv run ruff check app tests         # lint
```

### Selecting adapters

Use `--sources` to choose adapters for a command. Names are case-insensitive;
multiple names are comma-separated. The option works with `sync`, `run` and
`check-sources`, and overrides `AGGREGATOR_ENABLED_SOURCES` for that process.
Without the option, the configured sources are used (both by default).

```bash
uv run python -m app.main sync --sources FUNDA
uv run python -m app.main run --sources FUNDA
uv run python -m app.main check-sources --sources FUNDA
uv run python -m app.main sync --sources FUNDA,KAMERNET
```

For a persistent selection, put `AGGREGATOR_ENABLED_SOURCES=FUNDA` in
`aggregator/.env` when running from the aggregator directory. For Docker, set
the same variable in the environment file used by Compose. Changing the
selection leaves existing imports and the unselected adapter's checkpoints
intact; it only controls which adapters run.

Set the environment via `AGGREGATOR_`-prefixed variables (or a `.env` file):

| Variable | Default | Purpose |
| --- | --- | --- |
| `AGGREGATOR_DATABASE_URL` | `postgresql://zelfwonen:zelfwonen_dev_password@localhost:5432/zelfwonen` | Postgres DSN |
| `AGGREGATOR_SYNC_INTERVAL_SECONDS` | `21600` | development loop interval; the production timer is separate |
| `AGGREGATOR_STATUS_FILE` | `.state/status.json` | private per-source run results; `/app/state/status.json` in production |
| `AGGREGATOR_EXPIRE_MISSING` | `false` | reserved for explicitly exhaustive adapters; ignored by public search adapters |
| `AGGREGATOR_MAX_LISTINGS_PER_SOURCE` | `100000` | hard failure threshold per crawl |
| `AGGREGATOR_MAX_PAGES_PER_SEARCH` | `1000` | hard failure threshold per search; scope large searches into smaller areas |
| `AGGREGATOR_DISCOVERY_PAGE_BATCH_SIZE` | `20` | search pages per invocation, with a saved cursor |
| `AGGREGATOR_DETAIL_BATCH_SIZE` | `500` | detail attempts per source/invocation |
| `AGGREGATOR_SOURCE_TIMEOUT_SECONDS` | `14400` | deadline per source; acknowledged detail work survives |
| `AGGREGATOR_SOURCE_COOLDOWN_SECONDS` | `21600` | initial failure cooldown, doubles on repeated failures |
| `AGGREGATOR_MAX_SOURCE_COOLDOWN_SECONDS` | `604800` | cap on automatic backoff; longer Retry-After still takes precedence |
| `AGGREGATOR_POLITE_DELAY_SECONDS` | `5` | configured delay between outbound requests; robots directives do not override it |
| `AGGREGATOR_RESPECT_ROBOTS` | `true` | legacy name: true checks robots.txt and warns; false skips the check; neither blocks execution |
| `AGGREGATOR_PROXY_URLS` | *(empty)* | optional egress proxy; only the first legacy list entry is used |
| `AGGREGATOR_USER_AGENTS` | `zelfwonen-aggregator/0.1` | httpx identity; only the first legacy list entry is used; Chrome transport uses its matching browser headers |
| `AGGREGATOR_ENABLED_SOURCES` | `FUNDA,KAMERNET` | enabled adapters |
| `AGGREGATOR_FUNDA_SEARCH_URLS` | national buy + rent searches | pipe-separated public search URLs |
| `AGGREGATOR_FUNDA_TRANSPORT` | `chrome` | Chrome-compatible TLS/HTTP and browser headers through curl_cffi; `http` selects the previous httpx transport |
| `AGGREGATOR_KAMERNET_SEARCH_URLS` | national room + apartment + studio searches | pipe-separated public search URLs |
| `AGGREGATOR_FUNDA_SITEMAP_URL` | *(empty)* | optional legacy sitemap override; not needed for public search |
| `AGGREGATOR_KAMERNET_SEARCH_URL` | *(empty)* | optional legacy paginated-JSON override; not needed for public search |
| `AGGREGATOR_MAX_IMAGES_PER_LISTING` | `50` | maximum images downloaded per listing; existing photos are reused |
| `AGGREGATOR_NEIGHBORHOOD_ENRICHMENT_URL` | `http://localhost:3000/api/internal/aggregator/neighborhood` | shared web enrichment endpoint; empty disables enrichment |
| `AGGREGATOR_NEIGHBORHOOD_ENRICHMENT_TOKEN` | `zelfwonen-local-aggregator` | must match the web app's `AGGREGATOR_ENRICHMENT_TOKEN`; production Compose defaults both to the existing estimator service token |
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

## Detail and neighborhood enrichment

Funda details include the Nuxt photo gallery, full description and labelled
features. Kamernet facilities use the rendered labels, preserving shared/private
facilities without guessing enum IDs or treating a shared bathroom as a private
bathroom count. Additional features and rental terms are stored in `interior`.
Existing imports receive missing images on subsequent detail refreshes.
The property page maps Funda facts to ZelfWonen's own detail groups and supported
amenities/parking options; unmatched facts are omitted. Imported properties use
the same location map as native listings.

Neighborhood enrichment runs after saving each listing and reuses the web app's
PDOK address lookup and `NeighborhoodDataClient` (CBS statistics/crime/education,
OpenStreetMap facilities, RIVM noise and KCAF/PDOK foundation data). Profiles are
stored in the same table and displayed/filtered like native properties. Fresh
profiles are reused for 30 days; missing OpenStreetMap data at a known address
is retried after an hour. Opening an imported property also loads missing or
expired neighborhood data while the main listing renders. Endpoint failures are logged and retried next
sync without failing the scraped listing. Individual sources may leave fields
unavailable, as with native listings. Missing house numbers can use an unambiguous
postcode neighborhood, with address-specific measurements left empty.

Initialize a fresh database from `web` before starting the worker:

```bash
npm run db:setup
```

The Prisma schema includes the imported neighborhood relation directly. Setup
also installs its ownership constraint and the append-only history triggers;
no migrations or separate upgrade SQL are needed.

Run `npm run neighborhood:backfill` to enrich existing native and imported
listings without scraping. Local enrichment expects the web app to be running
on port 3000; local Docker uses `host.docker.internal`. Production Compose wires
the worker to the web service and supplies a matching token. A separately hosted
worker needs both enrichment settings configured explicitly.

## Adding a new source adapter

1. Subclass `app/adapters/__init__.py::SourceAdapter`.
2. Implement `discover`, `fetch_detail`, `parse_detail` and `normalize`.
   Resumable discovery exposes `discovery_cursor` and `discovery_complete`; only
   an explicitly exhaustive adapter may set `supports_missing_expiry=True`.
3. Register it in `AdapterRegistry.default()` and add its name to
   `AGGREGATOR_ENABLED_SOURCES`.

The sync orchestrator (`app/sync.py`) is source-agnostic; it never imports
provider specifics.

## Legal note

Confirm source-access, redistribution and image-hosting permissions before
enabling imports. Adapter availability does not establish permission to collect
or republish a provider's content. Obtain an appropriate review for your deployment.


## Troubleshooting discovery and source readiness

Remove the historical `AGGREGATOR_FUNDA_SITEMAP_URL` and
`AGGREGATOR_KAMERNET_SEARCH_URL` overrides from existing environment files (or set
them empty). Their old defaults returned HTTP 404 on 2026-09-29. The new default
adapters discover from public search HTML instead.
A 404/410 from discovery fails the source; only a detail-page 404/410 means a
listing has been removed. Failed discovery never triggers absence-based expiry.

The original XML/JSON errors hid these HTTP failures. Discovery now reports the
HTTP status and URL before parsing. Funda's observed human-verification page is
also treated as a source failure, including when served with HTTP 200.

The `VIRTUAL_ENV` warning is separate: the active environment path differs from
uv's project environment (the reported `C:/c/Users/...` path is malformed).
Activation is unnecessary with uv. In Git Bash, from `aggregator`, use:

```bash
unset VIRTUAL_ENV
uv sync --python 3.12
uv run python -m app.main sync
```

This removes the environment mismatch; it does not repair discovery. Do not use
`--active` to select the incorrectly addressed environment. A locally launched
worker connects to `localhost:5432`; the Compose worker uses `postgres:5432`.
The provided traceback reached discovery after acquiring the PostgreSQL lock,
so database connectivity was already working for that run.

### Unattended operation and recovery

If sync reports `cooling down until ...`, it has skipped all source requests
because a previous failure set `next_retry_at` in `.state/status.json` (or
`AGGREGATOR_STATUS_FILE`). The default delay is 6 hours, then 12, 24, 48 hours,
up to 7 days on consecutive failures. Skipped runs do not extend the delay.
Timestamps include their timezone; `+00:00` is UTC. Successful batches reset
the failure count and cooldown. New failures retain their `ScrapeError` message
in private status, and cooldown warnings include the saved reason. Older
statuses containing only `inspect the service journal` require the original logs.

To diagnose current discovery and one detail without database/media writes or
changing the saved cooldown, run this bounded check once:

```bash
uv run python -m app.main check-sources --sources FUNDA
```

Add `--check-images` to validate the first image if available. After a transport
fix, `--reset-cooldown` clears each selected source's saved cooldown only after
its detail and optional image check succeed. It retains run history, queues and
other sources' state. In production invoke this through
`bash scripts/sync-aggregator.sh check-sources --sources FUNDA --check-images --reset-cooldown`
from the deployed web directory, so it uses the maintenance lock and image digest.

Funda's previous httpx transport received HTTP 200 with a human-verification
page on 2026-10-02. The default now uses a stable curl_cffi session with Chrome's
TLS/HTTP fingerprint and matching browser headers for Funda pages and their
image downloads. Changing only User-Agent does not reproduce a browser's
network behavior. This transport needs no browser installation, copied personal
cookies, JavaScript automation or CAPTCHA solver. Kamernet keeps using httpx.
The same pacing, proxy, body limits, redirect checks and stop-on-block rules apply.

After upgrading, run `uv sync` and the bounded check above. If it succeeds but
sync still observes a cooldown from the previous transport, stop the worker,
back up the private status file, and set only Funda's `next_retry_at` to `null`.
Leave queues and the other source's status intact; the next successful batch
resets the failure count. Do this only after fixing and validating access, not
to repeatedly retry a blocked source. A provider-supported feed remains an
option if requests are persistently restricted.

Funda uses search-page JSON-LD/listing links and labelled detail facts. Kamernet
uses the public HTML's Next.js page data, verifies the returned page number, and
cross-checks card IDs against detail links. No private search API, login, or browser
interaction is required. HTML/schema changes still require parser maintenance.

The design takes inspiration from the search/detail split in
[whchien/FundaScraper](https://github.com/whchien/funda-scraper) and the labelled
property facts in [khpeek/funda-scraper](https://github.com/khpeek/funda-scraper).
Their source code and dependencies are not incorporated.

Production keeps the existing daily systemd timer; local Compose uses the existing
continuous loop. Both Compose stacks mount private state at `/app/state`.
Keep that volume across upgrades. Direct uv runs keep state in `.state` relative
to the aggregator working directory. Do not alternate runners with separate state
directories: the database lock prevents overlap, but cooldowns/queues must also be shared.

Each run advances at most 20 search pages, drains at most 500 detail entries and
saves acknowledged progress every 25 entries and on normal/error exit. A forced
kill may replay up to 25 entries; source-ID upserts preserve identity. Discovery
failures replay at most the current page batch. A timeout saves detail progress,
then backs off. Queued detail work is prioritized over additional discovery.
When discovery and all queued/stale-link checks finish, the next invocation starts
a fresh crawl. Live page ordering can change between requests, so coverage is not
a snapshot guarantee. Choose geographic search scopes and batch sizes that meet
your freshness needs without increasing request rate; nationwide crawls can take
many invocations. New listings on already-visited pages wait for the next crawl.

Robots.txt is advisory: disallows, crawl-delay directives, HTTP errors, challenge
pages and network failures produce warnings and collection continues. Its fetch
gets one bounded attempt per origin/session; failed checks are cached too.
401/403/429 responses and challenge pages on actual search, detail or image requests
still stop that source immediately. Retry-After and exponential cooldown survive restarts.
The other source still runs. Persistent schema failures also back off instead of
hammering a broken endpoint. Three consecutive detail errors stop a batch; failed
items remain queued behind unfinished work for a later attempt.
After three failed detail attempts, a malformed item is deferred until the next
crawl. The current crawl is still reported as failed and existing data is kept,
but a single bad listing cannot permanently prevent fresh discovery.

`status.json` records `outcome` (partial/complete/failed), `pending`,
`discovery_complete`, `last_progress`, `last_success`, and `next_retry_at`.
A partial batch exits successfully but never advances full-crawl `last_success`.
A failing or cooling-down source makes sync exit nonzero after attempting both.
Monitor both progress and completed-crawl age; process liveness alone is insufficient.
The existing systemd failure alert is local journal/syslog only.

Changing a source's search configuration invalidates its saved queue on the next
eligible attempt; existing database rows remain. A corrupt checkpoint fails closed
with its path in the journal. Stop the worker before inspecting/replacing state.
Do not clear cooldowns to repeatedly retry a provider that is restricting access.

For stronger availability guarantees, integrate a provider-supported feed with
documented coverage and removal semantics through the same SourceAdapter interface.
A feed with a different schema needs its own adapter, not just a changed URL.
