# Deploy zelf-wonen to a VPS

[Project overview](../../README.md) · [GitHub Actions deployment](github-actions-deployment.md)

This guide builds the app directly on a Linux VPS with Docker Engine and Compose.
For the repository's automated deployment to zelf-wonen.online, use the
[GitHub Actions guide](github-actions-deployment.md).

Run commands from `web/`. The stack includes Caddy, the web app, PostgreSQL,
the estimator and a daily listing importer. The project is not actively maintained,
so verify the features you intend to offer before inviting users.

## Configure the server

```bash
cp .env.production.example .env.production
chmod 600 .env.production
openssl rand -hex 32
```

Edit `.env.production`:

- Set `APP_DOMAIN` to your hostname, without a scheme or path.
- Generate separate secrets for `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`,
  `IP_HASH_SALT` and `ML_ESTIMATOR_TOKEN`. Use a URL-safe database password.
- Configure Brevo with `EMAIL_DELIVERY_TOKEN`, `EMAIL_FROM_NAME` and your verified
  `EMAIL_FROM_ADDRESS`. Enable transactional sending and authenticate the sender domain.
- Add `OPENROUTER_API_KEY` for AI features and
  [live Didit credentials](didit-setup.md) for new listing publication.

The Brevo endpoint defaults to `https://api.brevo.com/v3/smtp/email`.
A custom `EMAIL_DELIVERY_WEBHOOK_URL` must match that URL.
Production email fails without a key. The example sender is not a shared email service.

Point the domain's DNS A record to the VPS. Add AAAA only if IPv6 also reaches it.
Allow inbound ports 80 and 443. Caddy obtains HTTPS certificates once DNS works.
Only Caddy publishes host ports. PostgreSQL and the estimator stay private.

Always use `--env-file .env.production`. Public application URLs are set at build
time, so rebuild the web image after changing the domain.

## First launch

```bash
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d --wait postgres
```

For a **new, empty database**, apply the schema and history protections:

```bash
docker compose --env-file .env.production run --rm --no-deps web npm run db:push
docker compose --env-file .env.production run --rm --no-deps web npm run db:immutability
docker compose --env-file .env.production up -d --wait
```

Existing databases need a backup and reviewed schema changes first.
Do not use reset or data-loss flags in production.

Keep the same Compose project name to reuse volumes.
Changing `POSTGRES_PASSWORD` does not change an initialized database's password.
A new installation has no data unless you restore a backup.
Never load development sample data in production.

Verify registration, email, login, uploads, Didit, AI and estimates with your
configured providers. Container health alone does not verify provider credentials.

## Estimator data

The image includes public completed-sales data, CBS indices, municipal WOZ
statistics and asking-price benchmarks. It needs no paid data subscription.
The web app needs outbound PDOK access to resolve addresses.

Follow the [estimator refresh guide](../../estimator/README.md#refresh-and-evaluate),
then rebuild the service:

```bash
docker compose --env-file .env.production up -d --build estimator
```

Data health confirms loading, rather than accuracy or coverage.
Custom sales data needs a read-only mount and explicit `ESTIMATOR_SALES_PATH`.

## Automatic daily listing imports

The aggregator starts after the database and web app are healthy.
It imports immediately, then every 24 hours by default.
`AGGREGATOR_SYNC_INTERVAL_SECONDS` controls the interval from startup.
Docker restarts the worker after failure or a VPS reboot.

Disable any previously installed systemd import timer so Docker is the only scheduler.
Funda uses the bundled Chrome-compatible transport, with no browser installation needed.
Source access still needs checking from your VPS.

Inspect logs and saved progress:

```bash
docker compose --env-file .env.production logs --tail 100 aggregator
docker compose --env-file .env.production exec -T aggregator cat /app/state/status.json
```

For a bounded check or cooldown recovery, stop the worker first:

```bash
docker compose --env-file .env.production stop -t 60 aggregator
bash scripts/sync-aggregator.sh check-sources --check-images --reset-cooldown
docker compose --env-file .env.production up -d --no-build aggregator
```

The check does not import listings or save photos. It clears cooldowns only after
successful checks. Add `--sources FUNDA` to select one source.
The wrapper also selects release image digests for Actions deployments.

State, queues and cooldowns persist in `aggregator_state`.
Partial batches preserve the previous completed-crawl timestamp.
Monitor progress and crawl age as well as container health.
Nationwide imports can take many batches. External failure alerts are not configured.
See the [aggregator guide](../../aggregator/README.md) for settings and recovery.

## Persistence and updates

| Content | Volume | Access |
| --- | --- | --- |
| Database | `zelfwonen_postgres_data` | Internal |
| Listing photos, floor plans and PDFs | `web_uploads` | Public, including drafts |
| Imported photos | `aggregated_media` | Public |
| Transaction documents and bid logbooks | `web_data` | Authorized application access |
| Import progress | `aggregator_state` | Internal |
| HTTPS certificates | `caddy_data` | Internal |

Use listing uploads only for marketing material. Put private documents in
transaction rooms. Caddy has no access to the private document volume.

Runtime photos use direct media requests through Caddy. Keep `ListingImage`'s
`unoptimized` setting because Next.js image optimization can miss files added
after startup. Photo assessment reads authorized files from disk.
`OBJECT_STORAGE_MEDIA_BASE_URL` is obsolete.
`AGGREGATED_MEDIA_BASE_URL` configures imported photos only.

When moving local files, restore `web/.data` into `web_data`, uploads into
`web_uploads`, and imported photos into `aggregated_media`.
The web process needs write ownership with UID/GID 1000.
Multiple web hosts would need shared file storage.

After reviewing any database changes and backing up, update services:

```bash
docker compose --env-file .env.production up -d --build --wait
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs --tail 100 caddy web estimator
```

Container replacement can cause brief downtime.
**Do not run `docker compose down -v` on an installation you want to keep.**

### Backup and restore

These commands apply to a full checkout built on the VPS.
The Actions release bundle does not include the backup script or configure backups.

```bash
bash scripts/backup-vm.sh
# Optional destination:
bash scripts/backup-vm.sh /var/backups/zelfwonen
```

The script briefly stops web and aggregator writers, dumps PostgreSQL, archives
the three content volumes, checks the archives and restarts the previous writers.
Do not run other database writers during backup.
Only directories containing `COMPLETE` are successful backups.

Copy completed backups to private, encrypted off-server storage.
Keep the matching code revision and production environment securely.
Backups contain private documents. Import state and Caddy certificates are not included.
Preserve import state separately when moving hosts. Certificates can be reissued.

Test restoration using trusted backups, the same code revision and **empty volumes**:

```bash
backup_dir=/absolute/path/to/completed-backup
(cd "$backup_dir" && sha256sum -c SHA256SUMS)
docker compose --env-file .env.production build web
docker compose --env-file .env.production up -d --wait postgres
docker compose --env-file .env.production exec -T postgres \
  pg_restore -U zelfwonen -d zelfwonen --exit-on-error --no-owner < "$backup_dir/database.dump"
docker compose --env-file .env.production --profile maintenance run --rm --no-deps -T \
  storage-maintenance -xzpf - --numeric-owner < "$backup_dir/files.tar.gz"
docker compose --env-file .env.production up -d --wait
```

The dump includes schema and history protections. Do not run `db:push` before restoring.
Verify a listing photo, private document download and new upload afterward.
Docker volumes are not backups or immutable archives.

## Local development

Use `compose.local.yaml` through the npm scripts:

```bash
npm run services:start
npm run dev
# Optional local imports:
docker compose -f compose.local.yaml --profile aggregator up -d --build
```

Local PostgreSQL and estimator ports bind to loopback only.
Do not merge the local Compose file into production.
