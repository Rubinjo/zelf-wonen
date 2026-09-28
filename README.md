# ZelfWonen

**A self-service Dutch housing platform, with AI-assisted discovery and listing tools.**

ZelfWonen brings property search, owner listings, viewings, bidding and transaction
coordination into one application. Owners can prepare and publish sale or rental
listings on ZelfWonen without a publication fee. Imported listings link back to
their original platforms; ZelfWonen does not publish advertisements to external portals.

[Get started](docs/getting-started.md) · [Architecture](docs/architecture.md) ·
[AI engineering](docs/ai-engineering.md) · [Documentation](docs/README.md)

> [!IMPORTANT]
> ZelfWonen has minimal financial backing and is **not actively maintained**.
> Support, fixes, provider availability and data refreshes are not guaranteed.
> It is available as a platform to explore and self-host, and as an AI engineering
> portfolio project; operating it for real users requires the work described in
> [release readiness](docs/release-readiness.md).
>
> I am open to being contacted by people interested in helping make ZelfWonen
> commercially viable.

## Explore the platform

| For | Implemented workflows |
| --- | --- |
| **Buyers and tenants** | Sale/rental search, filters, a synchronized map, favorites, saved searches, shared shortlists and a personal dashboard. |
| **Property owners** | Draft editor, property-data lookups, photos and floor plans, Dutch/English writing assistance, viewing management and free platform publication. |
| **Transaction participants** | Bids, a hash-chained bid logbook, private messages and documents, agreement confirmations, milestones and versioned property passports with PDF exports. |
| **Operators** | An owner-only metrics dashboard, container deployment, backup scripts and an optional Funda/Kamernet import worker. |

Publishing requires verified email, a complete listing and a current Didit identity
approval. Identity verification does not prove property ownership. Agreement
confirmations are implemented, but **digital agreement signing is unavailable**.
Imported properties use the source platform for viewings, bids and transactions.

## AI engineering in context

The project combines structured LLM output with conventional application logic:

- **Writing:** proposes Dutch and English titles and descriptions from supplied
  property facts and owner drafts, for the owner to review.
- **Search:** converts natural language into validated filters used by the existing
  database query builder. The model does not generate SQL.
- **Valuation:** assesses visible photo condition on a fixed rubric, then passes
  structured features to a deterministic Python model. Completed sales take
  precedence over property or municipal WOZ statistical fallbacks.

The implementation includes schema validation, provider fallback, authorized image
access, content-versioned valuation caching and explicit unavailable results.
Valuation bounds are heuristic; the small regional sales evaluation does not
establish nationwide accuracy. Read the [AI engineering guide](docs/ai-engineering.md)
for source links, decisions and limitations.

## Run locally

Install **Node.js 20.9+**, npm and Docker with Linux containers. From the repository root:

```bash
cd web
cp .env.example .env.local
# Edit .env.local: replace BETTER_AUTH_SECRET and IP_HASH_SALT with separate random secrets.
# For local email links, set NEXT_PUBLIC_EMAIL_DELIVERY_MODE=console.
npm ci
npm run db:setup
npm run estimator:start
npm run dev
```

Open [localhost:3000](http://localhost:3000). A fresh database has no listings.
Use the optional [development seed](web/docs/dev-seed.md) to explore sample users
and workflows; **seeding deletes existing data in the target database**.

Basic browsing and seeded workflows need no AI or identity-provider credentials.
OpenRouter enables AI assistance; Didit sandbox credentials are needed to test
new publication approvals. Local sign-up prints email-verification links in the
server terminal when no email delivery key is configured.

See [getting started](docs/getting-started.md) for configuration, feature requirements
and troubleshooting. For a server deployment, use the [VPS guide](web/docs/deployment.md).

## How it is built

| Component | Technologies and responsibility |
| --- | --- |
| [Web application](web/) | Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, TanStack Query, Better Auth and Zod; UI, authentication and domain workflows. |
| [Persistence](web/prisma/schema.prisma) | PostgreSQL 17, Prisma 7 and SQL append-only triggers; shared application and imported-listing data. |
| [AI integration](web/src/lib/integrations/openrouter.ts) | Vercel AI SDK with OpenRouter, structured outputs and configured model fallbacks. |
| [Estimator](estimator/README.md) | Python 3.12, FastAPI and Pydantic; comparable sales, indexed WOZ fallbacks and bundled public-data artifacts. |
| [Aggregator](aggregator/README.md) | Python 3.12, HTTPX, Pydantic and asyncpg; optional discovery, normalization and media ingestion. |
| [Deployment](web/docs/deployment.md) | Docker Compose, Caddy HTTPS and persistent local volumes; systemd timer for optional imports. |

The [architecture guide](docs/architecture.md) explains service boundaries and trust
controls. The [repository map](docs/directory-structure.md) points to the code.

## Contributing and release status

Focused improvements and reproducible bug reports are welcome, with no guaranteed
review timeline. Start with [contributing](CONTRIBUTING.md) and the
[public-release gaps](docs/release-readiness.md).

The application code and documentation are licensed under the [MIT License](LICENSE).
Bundled datasets retain their separate [attribution and license notices](estimator/data/NOTICE.md).
Third-party assets retain their respective rights; the MIT license does not replace
those notices or grant rights to third-party brands.
