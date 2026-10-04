# Getting started

[Project overview](../README.md) · [Deployment](../web/docs/deployment.md)

## Requirements

Install Node.js 20.9+, npm and Docker with Linux containers.
Python 3.12 and uv are needed only when running the Python services outside Docker.
Commands use Bash, including Git Bash on Windows.

## Start locally

From the repository root:

```bash
cd web
cp .env.example .env.local
```

Edit `.env.local`:

- Generate separate values for `BETTER_AUTH_SECRET` and `IP_HASH_SALT`.
  Run `openssl rand -hex 32` once for each secret.
- Keep the example's local application URLs and database URL.
- Set `NEXT_PUBLIC_EMAIL_DELIVERY_MODE=console` and leave
  `EMAIL_DELIVERY_TOKEN` empty to print verification links in the server terminal.

```bash
npm ci
npm run db:setup
npm run estimator:start
npm run dev
```

Open [localhost:3000](http://localhost:3000).
Database setup starts PostgreSQL, applies the schema and history protections,
and generates Prisma Client. The estimator includes its data.

PostgreSQL and the estimator listen locally on ports 5432 and 8000.
For later starts, `npm run services:start` starts both.

## Try the platform

The database starts empty. To load [sample accounts and listings](../web/docs/dev-seed.md),
run these commands from `web/` against a disposable local database:

```bash
# Deletes existing data in the target database.
npm run db:seed
npm run db:verify-seed
```

Browse `/search`, sign in with a sample account, and explore the dashboard.
You can also register and follow the verification link in the server terminal.
Create a listing at `/dashboard/listings/new`.

A new publication needs a real Didit sandbox approval. Sample identities do not
bypass verification. Listing uploads are public, including draft uploads.
Put private documents in a transaction room.

## Optional services

| Feature | What to configure |
| --- | --- |
| AI writing, search and photo assessment | `OPENROUTER_API_KEY` |
| Price estimates | Running estimator and access to PDOK for address lookup |
| New listing publication | [Didit sandbox credentials](../web/docs/didit-setup.md) |
| Production email | Brevo key and your own verified sender |
| Imported homes | [Aggregator](../aggregator/README.md) |
| Admin metrics | [Admin account](../web/docs/admin-dashboard.md) |

Manual listing editing and ordinary search work without AI.
Estimates may be unavailable when evidence or an external service is missing.
Keep credentials in private environment files.

If you set `ML_ESTIMATOR_TOKEN`, use the same token in the web app and estimator.
Local Compose does not read `.env.local` automatically. Export the token in the
shell before starting the estimator, or pass `--env-file .env.local` to Compose.

## Development commands

Run these from `web/`:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run validate` | Generate Prisma Client, lint, check types and build |
| `npm run services:start` / `npm run services:stop` | Start or stop local services |
| `npm run db:studio` | Browse database records |
| `npm run db:logs` / `npm run estimator:logs` | Read service logs |
| `npx tsx --test tests/*.test.ts tests/*.test.tsx src/features/admin/access.test.ts` | Run web tests |

Validation does not run tests. Python test commands are in the
[estimator](../estimator/README.md) and [aggregator](../aggregator/README.md) guides.

## Troubleshooting

| Problem | Check |
| --- | --- |
| No listings | Load sample data or publish a listing |
| Database connection fails | Docker, port 5432 and `DATABASE_URL` |
| Missing Prisma Client | Run `npm run db:generate` |
| No verification email locally | Look in the development server terminal |
| Estimate unavailable | Estimator logs, PDOK access and data freshness |
| AI unavailable | OpenRouter key and provider availability |

For public hosting, follow the [deployment guide](../web/docs/deployment.md).
