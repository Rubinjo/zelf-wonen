# Deploy to a VPS with Docker Compose

[Documentation](../../docs/README.md) · [Release readiness](../../docs/release-readiness.md)

> This is an operator runbook for the supplied configuration, not a managed hosting
> commitment. The project is not actively maintained; review release gaps before
> serving real users.

The production stack is `web/compose.yaml`. It runs Caddy, Next.js, PostgreSQL
and the estimator; the aggregator remains opt-in. Run the commands below from
`web/` on the Linux VPS with Docker Engine and the Compose plugin installed.

## Configure the deployment

```bash
cp .env.production.example .env.production
chmod 600 .env.production
openssl rand -hex 32
```

Edit `.env.production`. Set `APP_DOMAIN` to your hostname only (for example
`platform.example.com`), and generate a separate random value for each of
`POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `IP_HASH_SALT` and
`ML_ESTIMATOR_TOKEN`. Use a URL-safe database password, such as the hex output
above, because Compose embeds it in database URLs. Configure email delivery:
production sign-up requires a Brevo API key in `EMAIL_DELIVERY_TOKEN`.
`EMAIL_DELIVERY_WEBHOOK_URL` defaults to `https://api.brevo.com/v3/smtp/email`;
if provided, it must match that URL. Set `EMAIL_FROM_NAME` and `EMAIL_FROM_ADDRESS` to your own sender identity after
verifying it in Brevo; the example configuration's existing sender is not a
shared delivery service. Authenticate
the sender domain in Brevo and ensure transactional sending is enabled.
The application supplies the email content directly, so no Brevo template is
needed. Without an API key, local development logs verification links; production
fails instead. Set `NEXT_PUBLIC_EMAIL_DELIVERY_MODE=console` to show the local
development hint when using console delivery.

Fill in the other
provider settings for features you intend to enable. Creating containers does not
provision external provider accounts or validate their configuration.

For listing identity verification, configure Didit as described in
[Didit setup](didit-setup.md). The credentials are server-only and loaded through
the existing `.env.production` container env file. A production deployment
requires live Didit credentials, its webhook secret, and a configured KYC workflow.
Verify the provider's current allowance and pricing before enabling traffic.

Always pass `--env-file .env.production`: it supplies Compose interpolation as
well as the web container's environment. Local secrets and runtime files are
excluded from the web image's build context. Public application URL and email UI
mode are set at build time; rebuild the web image after changing the hostname.

Point the domain's DNS A record to the VPS IPv4 address. Only add an AAAA record
if IPv6 reaches this VPS too. Allow inbound TCP 80 and 443 and restrict SSH as
appropriate in your VPS firewall. Caddy obtains/renews HTTPS certificates
and redirects HTTP to HTTPS once DNS and these ports are reachable. Certificates
persist in `caddy_data`.

Only Caddy publishes host ports. PostgreSQL and the estimator use an internal
Docker network with no external connectivity. Next.js can reach external
providers through its frontend network, and the optional aggregator has a
separate network for outbound requests.

## Public estimator data

The estimator image includes the free **Utrecht Housing Dataset** real-sales
release (153 transactions, CC BY-SA 4.0), public CBS monthly/regional indices,
WOZ medians for all 342 municipalities and 338 Residentievinder asking benchmarks.
No paid Kadaster export, API key, or host data directory is required. Local sales
take precedence; elsewhere the service returns an explicitly limited WOZ-based
statistical indication. Next.js needs outbound PDOK access to resolve addresses.
See [source attribution and limitations](../../estimator/README.md).

To reproduce the public artifact or refresh the monthly index on a machine with
Python 3.12 and uv:

```bash
cd ../estimator
uv sync --python 3.12
uv run python -m scripts.fetch_public_sales
uv run python scripts/fetch_cbs.py
uv run python scripts/fetch_national.py
cd ../web
docker compose --env-file .env.production up -d --build estimator
```

The sales download is pinned to a reviewed release; a newer release requires
reviewing and updating that pin. The index expires after 180 days. Sales older
than three years are excluded, so the static research sample also needs eventual
replacement. Normal service startup and prediction need no external network.

All three artifacts enter the model version and invalidate cached valuations when
changed. The health check requires valid loaded artifacts. Missing or invalid
data makes estimates return 503; sparse/unsupported requests return 422.
Health confirms loading, not accuracy or address coverage.

For a custom completed-sales artifact, explicitly add a read-only volume and
`ESTIMATOR_SALES_PATH` in a deployment override. Private artifacts are never
included in the image; the public artifact is used by default.

## First launch

Build the images and start the database:

```bash
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d --wait postgres
```

For a **new, empty database**, initialize the current schema and immutable-history
triggers explicitly (there are no committed Prisma migrations yet):

```bash
docker compose --env-file .env.production run --rm --no-deps web npm run db:push
docker compose --env-file .env.production run --rm --no-deps web npm run db:immutability
docker compose --env-file .env.production up -d --wait
```

For an existing database, back it up and review the schema transition first.
Do not use reset or accept-data-loss flags. Once versioned migrations are
introduced, deploy them with `npm run db:deploy` instead. Database changes are
not run automatically on container startup.

Existing PostgreSQL volumes retain their original credentials:
changing `POSTGRES_PASSWORD` does not change an initialized database user's
password. Retain the established Compose project name when reusing volumes;
changing it creates a different set of volumes. A new VPS starts empty unless
you restore database and media backups.

Build the opt-in aggregator separately. Production uses a host timer and one-shot
containers; do not start a second continuous worker:

```bash
docker compose --env-file .env.production --profile aggregator build aggregator
```

Default local aggregator media is shared with Caddy and served at
`/aggregated-media/*`. Existing S3 settings remain supported; set
`AGGREGATOR_IMAGE_STORAGE_MODE=s3`, its object-storage settings and
`AGGREGATED_MEDIA_BASE_URL` together if using that option.

### Scheduled listing imports (systemd)

The supplied timer runs daily at **04:20 Europe/Amsterdam**, with up to ten minutes
of jitter. A missed run is caught up after boot. Weekly-only operation can use
`OnCalendar=Tue *-*-* 04:20:00 Europe/Amsterdam` instead, but daily imports reduce
stale rental data. No host crontab or continuously running aggregator is needed.

The current provider endpoints and parsers still require live validation from
your VM. A healthy process is not proof that those sites are accessible.
First initialize the database as above, build the aggregator, then run a bounded
import with absence-based expiry disabled (the default):

```bash
docker compose --env-file .env.production --profile aggregator stop aggregator
docker compose --env-file .env.production --profile aggregator run --rm -T \
  -e AGGREGATOR_MAX_LISTINGS_PER_SOURCE=5 aggregator sync
```

This writes up to five listings per source to the real database. Hitting the cap
deliberately returns a failure because discovery is incomplete; inspect the
imported addresses, prices, links and images, as well as the logs. A blocked
endpoint or changed response schema must be fixed before unattended deployment.
The cap is not pagination: if your intended complete feed exceeds 10,000 records,
increase `AGGREGATOR_MAX_LISTINGS_PER_SOURCE` and measure runtime/storage usage.
Keep `AGGREGATOR_EXPIRE_MISSING=false` until exhaustive discovery is demonstrated.
Confirmed detail-page 404/410 responses can still mark listings offline.

Install the units after a successful full manual run:

```bash
bash scripts/sync-aggregator.sh
# Unit paths assume the repository is /opt/zelf-wonen; edit the .service if different.
sudo install -m 644 systemd/zelfwonen-aggregator.* /etc/systemd/system/
sudo install -m 644 systemd/zelfwonen-aggregator-alert.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now zelfwonen-aggregator.timer
systemctl list-timers zelfwonen-aggregator.timer
journalctl -u zelfwonen-aggregator.service -n 100 --no-pager
```

The service runs under the host system manager, requires Docker, and has a
20-hour run timeout. The database must already be running. It stops its named
one-shot container on timeout or service stop. The wrapper and backup script
share `.maintenance.lock`, so scheduled imports and backups do not write at the
same time. Use the wrapper for manual production imports too. Stop the timer
before deployment/schema maintenance and restart it afterwards.

Any source/listing failure or incomplete discovery makes the service fail, while
the other source is still attempted. `zelfwonen-aggregator-alert.service` writes
an error-priority **local journal/syslog alert**. This does not send email or
notify a phone: connect that unit to your existing monitoring/notification
handler before relying on unattended operation. An external dead-man monitor is
also needed to notice when the VM itself or its timer stops running.

Per-source counts (`seen`, `processed`, `failed`), last attempt, last successful
completion and failure state persist in the private `aggregator_state` volume:

```bash
docker compose --env-file .env.production --profile aggregator run --rm --no-deps -T \
  --entrypoint cat aggregator /app/state/status.json
```

`processed` includes confirmed gone listings. A failure preserves the previous
last-success timestamp. Alert if either source has never succeeded or has not
succeeded for seven days; for the daily schedule, investigating after 26 hours
is preferable. Database/startup failures appear in the service journal even if
the worker cannot update its status file. The state volume is operational
metadata, separate from public images and not included in content backups.

## Persistence and updates

The supplied single-VM deployment uses the VM's filesystem and persistent Docker
volumes. No S3 account, separate storage server, or media hostname is needed.
The shared `src/lib/storage.ts` module handles owner media, transaction uploads,
generated agreement/passport PDFs, and bid logbooks. Writes publish complete files
atomically and never overwrite an existing key. PostgreSQL stores metadata and
hashes, not file contents. Existing database keys and files need no migration.

| Files | Volume / path in web container | Access |
| --- | --- | --- |
| Listing photos, floor plans, listing PDFs | `web_uploads` / `/app/public/uploads` | Public `/uploads/*`, including draft uploads |
| Imported listing images | `aggregated_media` / `/app/public/aggregated-media` | Public `/aggregated-media/*` |
| Transaction uploads and generated agreement/passport PDFs | `web_data` / `/app/.data/transaction-documents` | Verified session and room membership |
| Bid logbook exports | `web_data` / `/app/.data/logbooks` | Authorized logbook API |

Listing attachments are for public marketing material. Put private evidence and
personal documents in the transaction room. Caddy has no mount for `web_data`.
Uploaded files use revalidation caching so removing a file is reflected on the
next request; imported content-hashed images have a one-day browser cache.
Temporary upload files are hidden by Caddy. Local development uses the same
directory layout with Next.js serving `public/`.

The estimator checks ownership of READY media records, reads photo bytes from
disk, verifies their stored SHA-256 hashes, and sends them to the configured AI
provider. It also works on localhost without a publicly reachable image URL.
`OBJECT_STORAGE_MEDIA_BASE_URL` is obsolete and ignored; remove it from existing
environment files. `AGGREGATED_MEDIA_BASE_URL` remains specific to imported images
and defaults to `/aggregated-media`.

Named volumes retain PostgreSQL data, uploaded listing media, private documents,
aggregated media, and Caddy state. Caddy serves listing uploads at `/uploads/*`;
private `.data` documents are mounted only into Next.js and retain their
application authorization. New files are served without rebuilding the image.
The web process runs as the unprivileged `node` user.

Local `web/.data` and `web/public/uploads` files are not baked into the image.
If moving an existing installation, restore them into `web_data` and
`web_uploads`, respectively, with ownership writable by UID/GID 1000.
Likewise restore aggregated images into `aggregated_media`.

Back up the database and media to off-server storage; Docker volumes alone are
not backups. Do not use `docker compose down -v` on a deployment you want to keep.

### Backup and restore

From `web/` on the Linux VM, after building the application image:

```bash
bash scripts/backup-vm.sh
# Optional destination (relative paths are resolved from web/):
bash scripts/backup-vm.sh /var/backups/zelfwonen
```

The script briefly stops the running web/aggregator writers, dumps PostgreSQL,
archives all three file volumes, verifies archive readability, writes checksums,
and restarts exactly those writers. This causes brief application downtime.
Do not run database maintenance or other writers during the backup. The
`storage-maintenance` service only runs explicitly and has no network access.
Only a backup directory containing `COMPLETE` is a successful backup. The
default `.backups/` directory is excluded from Git and Docker image builds.
Copy completed directories to private, encrypted storage outside the VM; keep
the matching source revision and `.env.production` separately in secure storage.
The archive contains private documents. Caddy certificates are not in this
archive and can be reissued after restore.

Test restoration into a **fresh deployment with empty volumes**, with the same
application revision and its production environment configured. From `web/`:

```bash
backup_dir=/absolute/path/to/completed-backup
(cd "$backup_dir" && sha256sum -c SHA256SUMS)
docker compose --env-file .env.production build web
docker compose --env-file .env.production up -d --wait postgres
docker compose --env-file .env.production exec -T postgres \
  pg_restore -U houser -d houser --exit-on-error --no-owner < "$backup_dir/database.dump"
docker compose --env-file .env.production --profile maintenance run --rm --no-deps -T \
  storage-maintenance -xzpf - --numeric-owner < "$backup_dir/files.tar.gz"
docker compose --env-file .env.production up -d --wait
```

The dump restores schema, data, and triggers; do not run `db:push` first during
restore. The file archive preserves ownership (web UID/GID 1000). Use trusted
backups only. Verify an existing listing photo, a private document download,
and a new upload after restore. This is a single-VM design: disk capacity and
off-server backup retention must be monitored. Multiple web hosts would need
shared storage or an object-storage adapter. Local storage does not provide
WORM/object-lock guarantees for legal archives.

After transferring updated code, rebuild and recreate changed services:

```bash
docker compose --env-file .env.production up -d --build --wait
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs --tail 100 caddy web estimator
```

Schedule any necessary schema changes separately before the updated app starts.
Single-server recreation can cause brief downtime.

## Local development

The npm database/service scripts explicitly use `compose.local.yaml`.
It publishes PostgreSQL and the estimator on **127.0.0.1 only**, so the
host-run Next.js dev server and Prisma CLI still work. It also mounts
`estimator/data` read-only, including the bundled public sales and CBS index.

```bash
npm run services:start
npm run dev
# Optional local aggregator:
docker compose -f compose.local.yaml --profile aggregator up -d --build
```

Do not merge the local Compose file into the production stack.
