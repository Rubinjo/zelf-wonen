# ZelfWonen

Self-service Dutch real-estate platform for owners who want to sell or rent without a traditional broker. The scaffold uses Next.js App Router, TypeScript, Tailwind CSS, Better Auth, TanStack Query, Zod, Vercel AI SDK, Prisma, PostgreSQL, and a REST contract for a deterministic Python estimator. Listing on ZelfWonen is completely free; the platform does not publish advertisements to external portals.

## What is scaffolded

- Bilingual Dutch/English marketing shell
- Public sale/rental marketplace at `/search` with shareable filters, sorting, pagination, local favorites, and a synchronized OpenStreetMap view
- Better Auth with mandatory email verification
- Server-side verified-email authorization guard
- Prisma/PostgreSQL draft for users, sessions, properties, labels, listings, media, Didit attempts, publications, bids, immutable events, exports, estimate cache, and audit events
- PDOK address, BAG and cadastral parcel lookups, live single-address Energielabel.nl lookup, and stored property-data fallback
- AI listing-description route
- Three-tier estimator orchestration and OpenAPI contract
- Didit hosted verification plus strict publication gate
- Inbound listing aggregator microservice (`aggregator/`, Python + uv) that scrapes, normalizes and deduplicates Funda/Kamernet listings; this is independent of free owner listings
- Immutable, hash-chained bid submission and PostgreSQL trigger draft
- Buyer/seller transaction room with chat, private document exchange, deadlines, agreement confirmations, notary and handover workflow
- Versioned, hash-chained property passport with completeness score and verifiable PDF export

## Local setup

Requirements: Node.js 20.9+, npm, and Docker Desktop with Linux containers. Python 3.12 and uv are only required when running the estimator or the inbound aggregator outside Docker.

1. From `web/`, copy `.env.example` to `.env.local` and replace every required placeholder. A local file is already configured in this workspace.
2. Install dependencies with `npm install`.
3. Start PostgreSQL 17, generate Prisma, migrate, and apply immutable-history triggers with `npm run db:setup`.
4. Start the deterministic estimator with `npm run estimator:start`.
5. Start the application with `npm run dev`.

For local development, PostgreSQL and the estimator are defined in `web/compose.local.yaml`. Use `npm run services:start` to build and start both. PostgreSQL publishes localhost port 5432 and persists data in the `houser_postgres_data` Docker volume; the estimator publishes localhost port 8000. Local verification links are printed in the Next.js terminal when no delivery webhook is configured.

The marketplace only exposes listings with status `LIVE` and a public slug. Map markers require latitude and longitude on the related property, and map tiles are loaded in the browser from OpenStreetMap, so the deployed client needs outbound internet access to `tile.openstreetmap.org`.

Do not run a production deployment with the example Better Auth secret, IP salt, media URL, or simulated provider endpoints.

## VPS deployment

`web/compose.yaml` runs the production web app behind Caddy HTTPS with private PostgreSQL and estimator services. See [VPS deployment](web/docs/deployment.md) for environment configuration, database initialization, persistent volumes, and the bundled free estimator dataset.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run strict TypeScript checks |
| `npm run db:start` | Start the PostgreSQL container |
| `npm run db:stop` | Stop the PostgreSQL container |
| `npm run db:logs` | Follow PostgreSQL container logs |
| `npm run services:start` | Build and start PostgreSQL and the estimator |
| `npm run services:stop` | Stop all local service containers |
| `npm run estimator:start` | Build and start the deterministic estimator |
| `npm run estimator:logs` | Follow estimator container logs |
| `npm run db:setup` | Start PostgreSQL and initialize the complete schema |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:push` | Push the Prisma schema to the database |
| `npm run db:immutability` | Apply append-only PostgreSQL triggers |
| `npm run db:migrate` | Create/apply a development migration |
| `npm run db:deploy` | Apply committed migrations in deployment |
| `npm run db:studio` | Open Prisma Studio |
| `npm run validate` | Generate, lint, typecheck, and build |

## Inbound aggregator

A separate Python/uv cron microservice in `aggregator/` scrapes, normalizes and
deduplicates Funda/Kamernet listings into the same PostgreSQL database. It
rotates residential proxies and User-Agents, re-hosts images in persistent VM storage (optionally S3/R2),
and never deletes listings that disappear — it marks them `OFFLINE`/`EXPIRED`.

```bash
cd aggregator
uv sync --python 3.12
uv run python -m app.main sync     # one-shot sync
uv run python -m app.main run      # loop every 6 hours (advisory-locked)
uv run pytest                      # unit tests
```

Configure it with `AGGREGATOR_`-prefixed environment variables (see
`aggregator/README.md`). The optional Docker Compose service is enabled with
`docker compose -f compose.local.yaml --profile aggregator up -d --build` from `web/`.

## Documentation

- [Architecture and security decisions](docs/architecture.md)
- [Next.js directory structure](docs/directory-structure.md)
- [Inbound aggregator microservice](../aggregator/README.md)
- [Python estimator REST contract](docs/estimator-openapi.yaml)
- [Database schema draft](prisma/schema.prisma)
- [Append-only trigger draft](prisma/immutability.sql)

## Production gaps

This is not yet a legally certified production system. The owner listing workflow, bid logbook/PDF, estimator, Didit identity verification, and free platform publication are implemented. The portfolio VM uses persistent local media volumes and authenticated private-document downloads; see [storage and backups](web/docs/deployment.md#persistence-and-updates). Before handling real transactions, add a production agreement-signing integration and immutable document archival; add malware scanning, rate limits, notifications, admin moderation, broader automated tests, observability, GDPR workflows, accessibility/localization review, and independent Dutch legal/privacy review.

## Free publication and identity verification

Owner listings require verified email, a complete listing and current identity verification through Didit. There are no packages, checkout, payment endpoints or outbound publishing adapters. Historical order tables remain for existing records; new publications do not reference orders or packages. No schema migration is needed for this change. See [Didit setup and the 499-session limit](web/docs/didit-setup.md).
