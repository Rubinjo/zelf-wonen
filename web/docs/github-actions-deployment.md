# Deploy with GitHub Actions

[Project overview](../../README.md) · [VPS guide](deployment.md)

The [release workflow](../../.github/workflows/release.yml) checks and builds
all three services. Pushes to `main` publish images to GHCR.
Production deployment is manual.

## One-time setup

In GitHub, open **Settings → Environments → production**.
Allow only `main` and configure:

| Secret | Value |
| --- | --- |
| `VPS_HOST` | `95.211.45.57` |
| `VPS_USER` | `deploy` |
| `VPS_PORT` | `22` |
| `VPS_SSH_KEY` | Complete private automation key |
| `VPS_KNOWN_HOSTS` | Verified server host-key entry |
| `PRODUCTION_ENV` | Complete application production environment, excluding `VPS_PASSWORD` |

Install the public automation key in the deploy account's `authorized_keys`.
The account needs Docker access. SSH must be reachable from GitHub runners.
The workflow uses key authentication without sudo.

Prepare the application environment from `web/.env.production.example`:

- Set `APP_DOMAIN=zelf-wonen.online` and `COMPOSE_PROJECT_NAME=zelfwonen-production`.
- Set separate random database, authentication, IP hash and estimator secrets.
- Configure Brevo, OpenRouter and live Didit credentials.
- Use `https://zelf-wonen.online/api/identity/didit/webhook` for Didit.
- Optionally configure the admin account. Do not enable development seeding.

The database and role are `zelfwonen`:

```dotenv
DATABASE_URL=postgresql://zelfwonen:${POSTGRES_PASSWORD}@postgres:5432/zelfwonen?schema=public
```

Paste the environment into `PRODUCTION_ENV`. Do not commit the populated file.
Each deployment validates it and sends it over verified SSH, then replaces the
server file with permissions 600. To change configuration, update the secret
and deploy again. Changing the environment password does not update an existing
PostgreSQL user's password.

## First launch

1. Push the release files to `main` and wait for successful image publication.
2. In GitHub Packages, make the web, estimator and aggregator packages public.
   The VPS pulls anonymously.
3. Point root and `www` DNS to the VPS and allow inbound ports 80 and 443.
4. Open **Actions → Validate, publish and deploy → Run workflow**.
   Select **main**, **deploy=true** and **initialize_database=true**.
5. Open [zelf-wonen.online](https://zelf-wonen.online) and check the `www` redirect.

Initialization requires an empty database. It applies the schema and history
protections and records a schema fingerprint. It never seeds data.
A second initialization is refused.

If initialization fails halfway, inspect and complete the database setup before
continuing. Do not delete volumes or force another initialization.
If the database initialized but a later readiness check failed, fix the cause
and deploy with **initialize_database=false**.

## Later deployments

Run the workflow on `main` with **deploy=true** and **initialize_database=false**.
Pushes alone do not deploy. The selected commit is rebuilt and deployed using
exact image digests.

Schema changes require a reviewed database upgrade and an updated
`~/zelf-wonen/schema.sha256` fingerprint. Do not overwrite it just to bypass the check.

Releases live under `~/zelf-wonen/releases/`.
`~/zelf-wonen/web` points to the last successful release.
Database and media volumes use the fixed `zelfwonen-production` project name.

```bash
cd ~/zelf-wonen/web
docker compose --env-file .env.production --env-file .release.env \
  -p zelfwonen-production ps
docker compose --env-file .env.production --env-file .release.env \
  -p zelfwonen-production logs --tail 100 web estimator caddy
```

Never use `docker compose down -v` here.
Replacement may cause brief downtime. No automated backup job is configured.

### Previous database names

An installation using the old `houser` database or volume needs an explicit
migration before deployment. Changing Compose settings does not rename existing data.
Deployment stops if it finds the old production volume without the new one.

Stop writers, migrate the database, role and volume while preserving ownership,
and verify the result before resuming. Keep the old volume until verification.
Do not use initialization to bypass this check.

Local installations also need their private database URL updated to match
`.env.example`. Preserve or migrate old volumes if their data is needed.

## Recovery

A failed deployment can leave some new containers running while the web symlink
still points to the previous successful release. Inspect the failed release
directory shown in the Actions log.

To reapply the last successful release:

```bash
bash "$(cat ~/zelf-wonen/current-release)/scripts/deploy-vps.sh" false
```

To roll back a successful update, use `previous-release` in place of
`current-release`. Schema checks still apply. Reverting images cannot undo
database changes.

Recovery uses the current server environment. Old secrets are not retained,
and a deployment failure after service replacement does not automatically
restore the previous environment or application.

## Listing imports

Production starts the aggregator after the web app and database are healthy.
It imports immediately and repeats every 24 hours by default.
Queues and cooldowns persist between releases.

```bash
cd ~/zelf-wonen/web
docker compose --env-file .env.production --env-file .release.env \
  -p zelfwonen-production logs --tail 100 aggregator
docker compose --env-file .env.production --env-file .release.env \
  -p zelfwonen-production exec -T aggregator cat /app/state/status.json
```

Stop the worker before manual checks:

```bash
docker compose --env-file .env.production --env-file .release.env \
  -p zelfwonen-production stop -t 60 aggregator
bash scripts/sync-aggregator.sh check-sources --check-images --reset-cooldown
docker compose --env-file .env.production --env-file .release.env \
  -p zelfwonen-production up -d --no-build aggregator
```

The wrapper selects the deployed image digests and maintenance lock.
Add `--sources FUNDA` to check only Funda.
Deploy the new image before testing a transport fix.
No browser installation is needed.

Disable any old systemd import timer so Docker is the only scheduler.
Source failures do not fail deployment. Check VPS access and crawl progress
using the [aggregator guide](../../aggregator/README.md).
External failure alerts are not configured.

## Before inviting users

The workflow checks code, images, readiness and public HTTPS.
Test email delivery, login, identity verification, uploads, AI, estimates and
imports with your provider accounts. These checks do not replace backups:
GitHub stores source and images, rather than your database or uploaded files.
