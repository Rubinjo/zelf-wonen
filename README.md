# zelf-wonen

<img src="web/public/logo.svg" alt="zelf-wonen logo" width="420">

**zelf-wonen** is a self-service Dutch housing platform for buyers, tenants and
property owners. Search for a home, publish a sale or rental listing for free,
and manage viewings, bids and the steps toward a sale or rental in one place.

> [!IMPORTANT]
> zelf-wonen has minimal financial backing and is **not actively maintained**.
> Support, fixes and data refreshes are not guaranteed.
> You can explore or self-host the platform. I welcome contact from people
> interested in helping make it commercially viable.

## Features

- **Find a home:** search sale and rental listings with filters, a map and
  natural-language search. View property and neighborhood information.
- **Keep track:** save favorites and searches, share shortlists, and follow
  viewings and bids from your dashboard.
- **Publish a property:** prepare a listing with photos, floor plans and
  property-data lookups. Get optional Dutch and English writing assistance.
- **Arrange viewings and bids:** manage viewing slots, bookings, private messages
  and bids with an exportable bid history.
- **Manage a sale or rental:** share private documents, confirm agreement terms,
  track milestones and export a versioned property dossier.
- **Explore price estimates:** get an indicative value based on completed sales
  or WOZ data, with optional photo assessment.
- **Browse imported homes:** discover Funda and Kamernet listings alongside
  owner listings, then continue on the original platform.

Publishing requires verified email, a complete listing and Didit identity approval.
Digital agreement signing is not implemented yet.

## Run locally

Install Node.js 20.9+, npm and Docker with Linux containers.
From the repository root, using Bash:

```bash
cd web
cp .env.example .env.local
```

Set separate random values for `BETTER_AUTH_SECRET` and `IP_HASH_SALT` in
`.env.local`. Set `NEXT_PUBLIC_EMAIL_DELIVERY_MODE=console` for local email links.

```bash
npm ci
npm run db:setup
npm run estimator:start
npm run dev
```

Open [localhost:3000](http://localhost:3000). The database starts empty.
The optional [sample data](web/docs/dev-seed.md) lets you try the main workflows.
**Seeding deletes existing data in the target database.**

Basic browsing and sample workflows need no AI or identity credentials.
OpenRouter enables AI assistance. Didit sandbox credentials let you test new
publication approvals. Local email-verification links appear in the server terminal
when no delivery key is configured.

## Documentation

- [Getting started](docs/getting-started.md): configuration, commands and troubleshooting.
- [Architecture](docs/architecture.md) and [repository map](docs/directory-structure.md): how the code fits together.
- [VPS deployment](web/docs/deployment.md) or [GitHub Actions deployment](web/docs/github-actions-deployment.md): run your own installation.
- [Didit setup](web/docs/didit-setup.md) and [admin dashboard](web/docs/admin-dashboard.md): identity verification and metrics.
- [Estimator](estimator/README.md): run the valuation service, refresh data and understand its limits.
- [Aggregator](aggregator/README.md): import listings from external platforms.

## Technology and license

The web app uses Next.js, React, TypeScript, Tailwind CSS, TanStack Query,
Better Auth and Zod. PostgreSQL and Prisma store application data.
Python services provide price estimates and optional listing imports.
Docker Compose and Caddy support deployment.

Application code and documentation use the [MIT License](LICENSE).
Bundled data has separate [licenses and attribution](estimator/data/NOTICE.md).
Third-party assets and brands retain their respective rights.
