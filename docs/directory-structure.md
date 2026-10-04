# Repository map

[Project overview](../README.md) · [Architecture](architecture.md)

```text
zelf-wonen/
├── README.md              Overview and documentation links
├── docs/                  Setup, architecture and repository guides
├── web/
│   ├── docs/              Deployment, identity and sample-data guides
│   ├── prisma/            Database schema, seed and history protections
│   ├── scripts/           Deployment, backup and maintenance tools
│   ├── src/
│   │   ├── app/           Pages and API routes
│   │   ├── components/    User interface
│   │   ├── features/      Workflow rules and services
│   │   └── lib/           Shared utilities and provider integrations
│   ├── tests/             Web tests
│   ├── public/            Logos and public assets
│   ├── compose.local.yaml Local services
│   └── compose.yaml       Production services
├── estimator/
│   ├── app/               Valuation API and model
│   ├── data/              Bundled data and attribution
│   ├── scripts/           Data refresh and evaluation
│   └── tests/             Estimator tests
└── aggregator/
    ├── app/               Source adapters and import pipeline
    └── tests/             Aggregator tests
```

## Where to start

| Task | Location |
| --- | --- |
| Listings and search | [web/src/features/listings/](../web/src/features/listings/) |
| Identity verification | [web/src/features/identity/](../web/src/features/identity/) |
| Bids | [web/src/features/bidding/](../web/src/features/bidding/) |
| Transactions and dossiers | [web/src/features/transactions/](../web/src/features/transactions/) |
| Price estimates | [estimator guide](../estimator/README.md) |
| Listing imports | [aggregator guide](../aggregator/README.md) |
| Database changes | [Prisma schema](../web/prisma/schema.prisma) |

Database setup applies the current Prisma schema directly. Review changes before
applying them to an existing database.

Local listing uploads live in `web/public/uploads/` and are public.
Private documents live in `web/.data/`. See
[deployment storage](../web/docs/deployment.md#persistence-and-updates) before
moving or backing up an installation.
