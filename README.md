# ZelfWonen

Self-service Dutch real-estate platform for owners who want to sell or rent without a traditional broker. The scaffold uses Next.js App Router, TypeScript, Tailwind CSS, Better Auth, TanStack Query, Zod, Vercel AI SDK, Prisma, PostgreSQL, and a REST contract for a deterministic Python estimator.

## What is scaffolded

- Bilingual Dutch/English marketing shell
- Better Auth with mandatory email verification
- Server-side verified-email authorization guard
- Prisma/PostgreSQL draft for users, sessions, properties, labels, listings, media, iDIN attempts, packages, publications, bids, immutable events, exports, estimate cache, and audit events
- PDOK address lookup route and local normalized Kadaster/EP-Online read path
- AI listing-description route
- Three-tier estimator orchestration and OpenAPI contract
- iDIN provider port plus strict publication gate
- Funda-style publisher adapter with Bronze/Silver/Gold packages
- Immutable, hash-chained bid submission and PostgreSQL trigger draft

## Local setup

Requirements: Node.js 20.9+, npm, and Docker Desktop with Linux containers.

1. Copy `.env.example` to `.env.local` and replace every required placeholder. A local file is already configured in this workspace.
2. Install dependencies with `npm install`.
3. Start PostgreSQL 17, generate Prisma, migrate, and apply immutable-history triggers with `npm run db:setup`.
4. Start the application with `npm run dev`.

The database runs from `compose.yaml` as `houser-postgres`, publishes port 5432, and persists data in the `houser_postgres_data` Docker volume. Local verification links are printed in the Next.js terminal when no delivery webhook is configured.

Do not run a production deployment with the example Better Auth secret, IP salt, media URL, or simulated provider endpoints.

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
| `npm run db:setup` | Start PostgreSQL and initialize the complete schema |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:migrate` | Create/apply a development migration |
| `npm run db:deploy` | Apply committed migrations in deployment |
| `npm run db:studio` | Open Prisma Studio |
| `npm run validate` | Generate, lint, typecheck, and build |

## Documentation

- [Architecture and security decisions](docs/architecture.md)
- [Next.js directory structure](docs/directory-structure.md)
- [Python estimator REST contract](docs/estimator-openapi.yaml)
- [Database schema draft](prisma/schema.prisma)
- [Append-only trigger draft](prisma/immutability.sql)

## Production gaps

This is an architectural scaffold, not a legally certified production system. Before launch, implement the listing wizard UI, signed uploads/scanning, official Kadaster and EP-Online ingestion jobs, certified iDIN callbacks, payments, anonymized PDF generation, provider webhooks, rate limits, notification delivery, admin moderation, tests, observability, GDPR workflows, and independent Dutch legal/privacy review.
