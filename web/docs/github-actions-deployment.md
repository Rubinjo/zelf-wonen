# Deploy zelf-wonen.online with GitHub Actions

The workflow is `.github/workflows/release.yml`. Pull requests validate and build
all three images without publishing. Pushes to `main` validate and publish to GHCR.
Production deployment is manual: **Actions → Validate, publish and deploy → Run
workflow**, branch **main**, with **deploy** selected. No production seed or backup
job is configured.

## One-time environment setup

In GitHub repository **Settings → Environments → production**, allow only `main`
and set these environment secrets:

| Secret | Value |
| --- | --- |
| `VPS_HOST` | `95.211.45.57` |
| `VPS_USER` | `deploy` |
| `VPS_PORT` | `22` |
| `VPS_SSH_KEY` | Complete private automation key, including BEGIN/END lines |
| `VPS_KNOWN_HOSTS` | Verified host-key entry for `95.211.45.57` |
| `PRODUCTION_ENV` | Complete application `.env.production` contents, excluding `VPS_PASSWORD` |

The automation key's public key must be in `deploy`'s `authorized_keys`, and that
account must be in the `docker` group. No password or sudo is used by the workflow.
It creates `~/zelf-wonen/releases` itself. Keep SSH port 22 accessible to GitHub's
hosted runners; an allowlist containing only your home IP will block deployment.

Prepare `web/.env.production` locally using `.env.production.example`:

- Set `APP_DOMAIN=zelf-wonen.online` and
  `COMPOSE_PROJECT_NAME=zelfwonen-production`.
- Set independent random `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `IP_HASH_SALT`
  and `ML_ESTIMATOR_TOKEN` values. Keep the database password URL-safe.
- Supply Brevo, OpenRouter and live Didit credentials, and your verified sender.
- Configure Didit's webhook as
  `https://zelf-wonen.online/api/identity/didit/webhook`.
- Set the owner admin email if required. Never use the development seed.

Paste the application environment into the `PRODUCTION_ENV` GitHub environment
secret. Do not include `VPS_PASSWORD`. No manual upload is needed: each manual
deployment streams the secret over verified SSH, stages it under the deployment
lock, checks Compose configuration and pulls the images, then atomically replaces
`~/zelf-wonen/.env.production` with permissions `600`. CRLF line endings are
normalized. Secret contents are never executed as shell code, printed, or added
to the release archive. Empty/invalid input leaves the existing environment intact.

To change configuration, update `PRODUCTION_ENV` and deploy again. Never commit the
populated file. Changing `POSTGRES_PASSWORD` does not change an initialized
PostgreSQL user's password: coordinate that change separately. On a rollback run
directly on the VPS, the script reuses the current server environment; it does not
keep old secret versions. Once service replacement starts, deployment failure does
not revert the new environment automatically.

The aggregator image includes the locked curl_cffi dependency for Funda's
Chrome-compatible transport. Compose defaults `AGGREGATOR_FUNDA_TRANSPORT` to
`chrome`, including when the variable is absent from an older `PRODUCTION_ENV`.
No browser installation or desktop session is required on Leaseweb. The images
job checks that the native transport library loads inside the Linux amd64 image.
Deploy the new image digest before validating or resuming imports. From
`~/zelf-wonen/web`, use the deployment wrapper so the release manifest and
production volumes are selected consistently:

```bash
bash scripts/sync-aggregator.sh check-sources --sources FUNDA --check-images --reset-cooldown
```

This checks a detail and its first available image, then clears only Funda's
old cooldown on success. It preserves import queues and other sources' status.
The daily timer continues to run `sync` using the new release's image digest.

The PostgreSQL database and role are both `zelfwonen`. Use this URL in the secret
for consistency (Compose also supplies it explicitly to the web container):

```dotenv
DATABASE_URL=postgresql://zelfwonen:${POSTGRES_PASSWORD}@postgres:5432/zelfwonen?schema=public
```

## First publication and launch

1. Commit and push the workflow and deployment files to `main`.
2. Wait for the push-triggered workflow to succeed. This publishes images but does
   not contact the VPS.
3. In your GitHub profile's **Packages**, open `zelf-wonen-web`,
   `zelf-wonen-estimator` and `zelf-wonen-aggregator`. Under each package's settings,
   change visibility to **public**. GHCR initially creates packages as private;
   repository visibility alone does not make a package public. The VPS pulls
   anonymously, so all three must be public before deployment.
4. Confirm root and `www` DNS point to this VPS and inbound TCP 80/443 are open.
5. Run the workflow manually on **main** with **deploy=true** and
   **initialize_database=true**.
6. Open `https://zelf-wonen.online`. Verify that `www` redirects to the root domain.

The workflow rebuilds/publishes the selected commit, then passes its exact image
digests to the deployment job. The web build embeds the production domain.
It uploads only Compose/Caddy configuration, scripts, schema metadata and an image
manifest; `PRODUCTION_ENV` travels separately over SSH. The maintenance helper uses the same web
image as the application.

Initialization checks that PostgreSQL has no public tables, runs `db:push` and
`db:immutability`, and records a schema fingerprint. It never calls `db:seed`,
`db:reset` or `--accept-data-loss`. Running initialization again is refused.
If initialization fails halfway through, stop and inspect the database rather
than deleting its volumes or forcing a rerun. An operator must complete/review
the interrupted schema initialization before recording its fingerprint.

## Later deployments and recovery

### Installations using the previous database name

Fresh installations use database/role `zelfwonen` and the production volume
`zelfwonen-production_zelfwonen_postgres_data`. Existing databases are not renamed
by changing Compose settings. If the old `zelfwonen-production_houser_postgres_data`
volume exists without the new volume, deployment stops before replacing secrets
or starting containers. Do not enable initialization to bypass that failure.

An existing installation needs an explicit database migration: stop its writers,
rename the old database and role to `zelfwonen`, and transfer the stopped database
volume to the new volume name while preserving ownership. Verify the migrated
database before resuming deployment. Keep the old volume until that verification
is complete. This pipeline does not perform that migration or delete any volumes.
If no previous deployment has initialized PostgreSQL, no migration is needed.

Local development defaults were renamed too. Update your private `.env.local`
database URL to match `.env.example`; existing local volumes must be migrated if
their data is needed. The new local Compose defaults will use a different volume,
and the previous one remains on disk.

### Deploying another release

Run the workflow on **main** with **deploy=true**, **initialize_database=false**.
Pushes alone only publish images. Deployments are serialized in GitHub and use the
same server lock as listing imports. Unchanged schema files must match the stored
fingerprint. Database setup uses the Prisma schema directly: schema-changing
releases are blocked until an operator performs a reviewed upgrade and updates
`~/zelf-wonen/schema.sha256` to the reviewed schema/trigger fingerprint. Do not
blindly overwrite that file to bypass the check.

Releases remain in `~/zelf-wonen/releases/<commit>-<run>-<attempt>/web`.
`~/zelf-wonen/web` points to the most recent successfully deployed release.
`current-release` and `previous-release` record successful deployments. Database
and media volumes always use the fixed `zelfwonen-production` project name.
Never run `docker compose down -v` against this deployment.

On the VPS, inspect the active release with:

```bash
cd ~/zelf-wonen/web
docker compose --env-file .env.production --env-file .release.env \
  -p zelfwonen-production ps
docker compose --env-file .env.production --env-file .release.env \
  -p zelfwonen-production logs --tail 100 web estimator caddy
```

If deployment fails after recreating services, some new containers may already be
running even though the `web` symlink still points to the last successful release.
Use the failed release directory from the Actions log to inspect those services.
There is no automatic rollback or data restore. To reapply the last successful
release after a failed update, run:

```bash
bash "$(cat ~/zelf-wonen/current-release)/scripts/deploy-vps.sh" false
```

To roll back a successful update, use `previous-release` instead. The same schema
check applies: reverting application images cannot undo database changes. If the
first deployment initialized the database but failed at readiness or HTTPS, fix
the cause and rerun with **initialize_database=false**.

## Scheduled listing imports

Images are published for the aggregator, but deployment does not silently enable
outbound imports. Follow the bounded and full manual validation in
[the deployment runbook](deployment.md#scheduled-listing-imports-systemd), adding
`--env-file .release.env -p zelfwonen-production` to its Compose commands. Run from
`~/zelf-wonen/web`; images are already pulled, so skip build instructions.

After a successful full manual run, install the supplied units on the VPS:

```bash
cd ~/zelf-wonen/web
sudo install -m 644 systemd/zelfwonen-aggregator.service \
  systemd/zelfwonen-aggregator.timer systemd/zelfwonen-aggregator-alert.service \
  /etc/systemd/system/
sudo mkdir -p /etc/systemd/system/zelfwonen-aggregator.service.d
sudo tee /etc/systemd/system/zelfwonen-aggregator.service.d/deployment.conf > /dev/null <<'EOF'
[Service]
User=deploy
WorkingDirectory=/home/deploy/zelf-wonen/web
ExecStart=
ExecStart=/usr/bin/bash /home/deploy/zelf-wonen/web/scripts/sync-aggregator.sh
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now zelfwonen-aggregator.timer
systemctl list-timers zelfwonen-aggregator.timer
```

The wrapper reads the current release's image manifest and shares the deployment
lock. Imports run daily at 04:20 Europe/Amsterdam with jitter. A provider failure
is recorded locally; this setup does not configure external alert delivery.

## Verification boundaries

The workflow runs web lint/type checks/tests, Python tests, all image builds,
container readiness checks and a public HTTPS request from both VPS and runner.
It does not prove live provider credentials work. Verify registration and email
delivery, login, Didit verification, uploads, AI assistance, valuation and listing
imports using your real provider accounts before sharing the platform.

Brief downtime during container replacement is expected. Backups are deferred at
the owner's request. GitHub stores images and source, not production database or
uploaded files. Digital agreement signing remains an unimplemented app feature.
