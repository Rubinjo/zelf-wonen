# Getting started

[Documentation](README.md) · [Deployment](../web/docs/deployment.md)

## Requirements

- Node.js 20.9 or later and npm (the web Docker image uses Node.js 22).
- Docker Engine with Compose, or Docker Desktop using Linux containers.
- Python 3.12 and uv only if running the Python services outside Docker.

Commands below use Bash, including Git Bash on Windows. Run them from the
repository root unless a different directory is shown.

## Start a local instance

```bash
cd web
cp .env.example .env.local
```

Edit `.env.local` before starting. Generate independent values for
`BETTER_AUTH_SECRET` and `IP_HASH_SALT`, for example by running
`openssl rand -hex 32` twice. Keep the local application URLs and database URL
from the example. Set `NEXT_PUBLIC_EMAIL_DELIVERY_MODE=console` to match local
email-link logging, and leave `EMAIL_DELIVERY_TOKEN` empty.

```bash
npm ci
npm run db:setup
npm run estimator:start
npm run dev
```

Visit [localhost:3000](http://localhost:3000). `db:setup` starts PostgreSQL, pushes
the schema, installs append-only triggers and generates Prisma Client. It is a
fresh-development setup: there are no committed Prisma migrations. See the
[deployment guide](../web/docs/deployment.md#first-launch) for existing databases.

The estimator starts with bundled data; a separate dataset download is unnecessary.
Docker publishes PostgreSQL on `127.0.0.1:5432` and the estimator on
`127.0.0.1:8000`. Subsequent starts can use `npm run services:start` for both.

## Try the workflows

For an empty local database, the [development seed](../web/docs/dev-seed.md)
provides sample accounts, listings, bids and transaction rooms:

```bash
# From web/. Destructive: only use a disposable local database.
npm run db:seed
npm run db:verify-seed
```

1. Browse `/search` and a property's detail page.
2. Sign in with an account from the seed guide, or register and follow the
   verification link printed in the development server terminal.
3. Explore `/dashboard/seeker`, owner listings and seeded transaction rooms.
4. Try a new listing at `/dashboard/listings/new`. Publishing a new listing still
   requires a real Didit sandbox approval; seed identities do not bypass it.

Listing uploads are publicly served, including draft uploads. Use only public
marketing material there; private documents belong in a transaction room.

## Optional features and configuration

| Feature | Requirement | Without it |
| --- | --- | --- |
| AI writing and search | `OPENROUTER_API_KEY` | Writing reports unavailable; search can fall back to ordinary text search. |
| Photo assessment | OpenRouter plus authorized uploaded photos | Quantitative estimation continues when assessment fails. |
| Price estimates | Running estimator and outbound PDOK access | No estimate if the service, address resolution or evidence is unavailable. |
| New listing publication | [Didit sandbox configuration](../web/docs/didit-setup.md) locally | Drafts remain usable; publication stays gated. |
| Production email | Brevo key and your own verified sender | Local links are logged; production delivery fails without configuration. |
| Imported listings | Optional [aggregator](../aggregator/README.md) | Native listings and sample data still work. |
| Operator metrics | [Admin account configuration](../web/docs/admin-dashboard.md) | Admin access is disabled. |

Provider credentials belong only in private environment files. The example email
sender must be replaced with your own verified sender before enabling delivery.
Maps and live property-data lookups also depend on external network access.

The local Compose CLI does not automatically read Next.js's `.env.local`. If you
set `ML_ESTIMATOR_TOKEN`, export the same value in the shell that starts the local
estimator, or pass `--env-file .env.local` when calling Compose directly.

## Useful commands

Run web commands from `web/`:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run validate` | Generate Prisma Client, lint, typecheck and build; does not run tests |
| `npm run lint` / `npm run typecheck` | Individual static checks |
| `npm run services:start` / `npm run services:stop` | Start or stop local PostgreSQL and estimator containers |
| `npm run db:studio` | Inspect the database |
| `npm run db:logs` / `npm run estimator:logs` | Service logs |

Focused test commands are in [contributing](../CONTRIBUTING.md). Service-specific
commands live in the [estimator](../estimator/README.md) and
[aggregator](../aggregator/README.md) guides.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Empty marketplace | A fresh database is empty. Native public results require a `LIVE` listing and public slug; sample data is optional. |
| Database connection failure | Docker is running, port 5432 is available and `DATABASE_URL` matches the local container. |
| Missing Prisma Client | Run `npm run db:generate` from `web/`. |
| No verification email | With no delivery key in development, read the server terminal for the link. |
| Estimate unavailable | Check estimator logs, PDOK connectivity, supported property inputs and artifact age. Health confirms loading, not valuation coverage. |
| AI unavailable | Check the provider key and model availability; the configured fallbacks are not an availability guarantee. |

For a public deployment, continue with [release readiness](release-readiness.md)
and the [VPS runbook](../web/docs/deployment.md).
