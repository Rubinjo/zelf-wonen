# zelf-wonen listing aggregator

[Project overview](../README.md) · [Deployment](../web/docs/deployment.md#automatic-daily-listing-imports)

This optional Python worker imports sale and rental listings from Funda and
Kamernet into the web app's PostgreSQL database. It downloads photos and adds
neighborhood information through the web app.

Imported homes link back to the original platform for viewings and bids.
Confirm source-access and redistribution permissions before enabling imports.
Source availability and parser compatibility need ongoing review.

## Run locally

Initialize the database and start the web app using
[getting started](../docs/getting-started.md), then run:

```bash
cd aggregator
uv sync --python 3.12
uv run python -m app.main check-sources
uv run python -m app.main sync
```

`check-sources` checks discovery and one detail per source without writing listings
or media. `sync` imports one resumable batch. Use `run` for a continuous loop.

Choose sources with `--sources FUNDA`, `--sources KAMERNET` or
`--sources FUNDA,KAMERNET`. The option overrides the configured selection.

## Configuration

Set `AGGREGATOR_` environment variables or use `aggregator/.env` for direct uv runs.
The full settings are in [app/config.py](app/config.py).

| Variable | Default or purpose |
| --- | --- |
| `AGGREGATOR_DATABASE_URL` | Local database from the web example environment |
| `AGGREGATOR_ENABLED_SOURCES` | `FUNDA,KAMERNET` |
| `AGGREGATOR_SYNC_INTERVAL_SECONDS` | 21600 locally, 86400 in production Compose |
| `AGGREGATOR_STATUS_FILE` | `.state/status.json`, or `/app/state/status.json` in Docker |
| `AGGREGATOR_DISCOVERY_PAGE_BATCH_SIZE` | 20 search pages per run |
| `AGGREGATOR_DETAIL_BATCH_SIZE` | 500 detail attempts per source per run |
| `AGGREGATOR_POLITE_DELAY_SECONDS` | 5 seconds between requests |
| `AGGREGATOR_FUNDA_SEARCH_URLS` / `AGGREGATOR_KAMERNET_SEARCH_URLS` | Pipe-separated search URLs, national searches by default |
| `AGGREGATOR_FUNDA_TRANSPORT` | `chrome` via curl_cffi, with no browser installation needed |
| `AGGREGATOR_LOCAL_MEDIA_DIR` | `../web/public/aggregated-media` |
| `AGGREGATOR_NEIGHBORHOOD_ENRICHMENT_URL` | Web app's internal neighborhood endpoint |
| `AGGREGATOR_NEIGHBORHOOD_ENRICHMENT_TOKEN` | Must match the web app's `AGGREGATOR_ENRICHMENT_TOKEN` |

Remove old `AGGREGATOR_FUNDA_SITEMAP_URL` and `AGGREGATOR_KAMERNET_SEARCH_URL`
overrides to use public-search discovery. Hard page and listing limits are failure
thresholds, rather than batch sizes.

Local storage is the default. Production shares the media volume with Caddy.
For S3-compatible storage, set `AGGREGATOR_IMAGE_STORAGE_MODE=s3` and the
`AGGREGATOR_OBJECT_STORAGE_ENDPOINT_URL`, `AGGREGATOR_OBJECT_STORAGE_BUCKET`,
`AGGREGATOR_OBJECT_STORAGE_REGION`, `AGGREGATOR_OBJECT_STORAGE_ACCESS_KEY_ID`
and `AGGREGATOR_OBJECT_STORAGE_SECRET_ACCESS_KEY`.
Set the web app's `AGGREGATED_MEDIA_BASE_URL` to the public serving URL.
Bucket access policies must be configured separately.

## Import behavior

- Queues and discovery cursors survive restarts. Keep the state directory
  when upgrading, and share it when changing runners.
- A database lock prevents overlapping imports. Stop the background worker
  before manual checks or state changes.
- Existing source links keep their listing identity. New Funda records can
  match by postcode, house number and suffix. Distinct Kamernet rooms stay separate.
- Missing search results do not expire listings. Confirmed detail 404/410 responses
  or explicit source status can mark them offline.
- Photos are checked, stored by content hash and reused on later runs.
- Neighborhood enrichment failures leave the imported listing usable and are
  retried later. Run `npm run neighborhood:backfill` from `web/` to enrich
  existing records without scraping.

Production imports immediately after startup, then every 24 hours by default.
A nationwide crawl may take many batches. Source changes can affect coverage.

## Troubleshooting

Inspect logs and the private status file. It records progress, pending work,
last completed crawl, failures and the next retry time.
A partial batch can succeed without completing the crawl.

Restrictions and repeated failures trigger persistent cooldowns, from six hours
up to seven days by default. A provider's longer Retry-After takes precedence.
Actual search, detail or image challenges and HTTP 401/403/429 stop that source.
Robots.txt checks are advisory and do not prevent collection.

After fixing access, stop the worker and run:

```bash
uv run python -m app.main check-sources --sources FUNDA --check-images --reset-cooldown
```

This clears only the selected source's cooldown after a successful detail and
optional image check. It preserves queues and other sources' state.
Do not repeatedly clear cooldowns to retry a blocked provider.

For a deployed installation, use the
[deployment commands](../web/docs/deployment.md#automatic-daily-listing-imports).
Local access does not establish access from your VPS.

If uv reports an environment mismatch, run `unset VIRTUAL_ENV` and use `uv run`
without activating a separate environment. A checkpoint error needs inspection
with the worker stopped. Keep the state rather than deleting it blindly.

## Development

```bash
uv run pytest
uv run ruff check app tests
```

To add a source, implement `SourceAdapter` in [app/adapters/](app/adapters/),
register it in `AdapterRegistry.default()`, and enable its name in configuration.
Implement discovery, detail fetching, parsing and normalization.
Tests check parsers and pipeline behavior, while live access needs a source check.
