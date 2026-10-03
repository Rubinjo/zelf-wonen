# Repository map

[Documentation](README.md) · [Architecture](architecture.md)

```text
zelf-wonen/
├── README.md                 Project introduction and quick start
├── CONTRIBUTING.md           Contribution scope and validation
├── AGENTS.md                 Coding-agent instructions
├── docs/                     Project-wide guides and release readiness
├── web/
│   ├── docs/                 Web operations, seed and identity guides; API contract
│   ├── prisma/               Authoritative schema, seed and append-only SQL triggers
│   ├── scripts/              Backups, import wrapper and seed verification
│   ├── systemd/              Scheduled import and local alert units
│   ├── src/
│   │   ├── app/              Pages and API route handlers
│   │   ├── components/       React UI by feature
│   │   ├── features/         Domain services and access rules
│   │   ├── lib/              Schemas, provider adapters, auth, storage and translations
│   │   ├── generated/prisma/ Generated Prisma Client
│   │   └── types/            Shared API types
│   ├── tests/                Focused Node/TypeScript tests
│   ├── public/               Public assets and development media
│   ├── compose.local.yaml    Local PostgreSQL, estimator and optional aggregator
│   └── compose.yaml          VPS stack behind Caddy
├── estimator/
│   ├── app/                  FastAPI, Pydantic and deterministic valuation
│   ├── data/                 Bundled public artifacts and attribution
│   ├── scripts/              Import, refresh and evaluation tools
│   └── tests/                Model, API and data-pipeline tests
└── aggregator/
    ├── app/                  Adapters, normalization, sync, database and storage
    └── tests/                Parser and pipeline tests
```

The application schema lives at [web/prisma/schema.prisma](../web/prisma/schema.prisma).
Database setup uses the current Prisma schema directly, without migrations.
Generated code and runtime folders are not the starting point for manual changes.

## Useful entry points

| Task | Start here |
| --- | --- |
| Owner drafts and publication | [listing services](../web/src/features/listings/), [listing UI](../web/src/components/listing/) |
| Search and AI interpretation | [marketplace service](../web/src/features/listings/marketplace-service.ts), [AI search](../web/src/features/listings/ai-search.ts) |
| Identity verification | [identity services](../web/src/features/identity/), [webhook route](../web/src/app/api/identity/didit/webhook/route.ts) |
| AI writing | [listing-description route](../web/src/app/api/ai/listing-description/route.ts) |
| Price estimation | [web orchestrator](../web/src/features/estimator/service.ts), [Python hierarchy](../estimator/app/national.py) |
| Files and downloads | [storage](../web/src/lib/storage.ts), [transaction routes](../web/src/app/api/transactions/) |
| Imported listings | [sync orchestrator](../aggregator/app/sync.py), [source adapters](../aggregator/app/adapters/) |

Local private documents live under `web/.data/`; listing uploads under
`web/public/uploads/` are public. Container volumes preserve these paths.
See [storage and backups](../web/docs/deployment.md#persistence-and-updates).
