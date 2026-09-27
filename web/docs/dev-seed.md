# Development seed (dummy data)

A complete set of dummy data for the **local development database only**. It lets
you exercise every feature of the platform without manual setup.

## Safety

The seed is deliberately guarded so it can **never** hit a production or staging
database:

- it refuses to run when `NODE_ENV=production`
- it refuses to run unless `DATABASE_URL` points at `localhost`/`127.0.0.1`

It **wipes all existing data** first (append-only triggers are temporarily
disabled, then re-enabled), so it is safe and re-runnable in dev.

## Commands

```bash
# From web/
npm run db:seed            # tsx prisma/seed.ts
npx prisma db seed         # equivalent (also triggered by `prisma migrate reset`)
npm run db:verify-seed     # sanity-checks the seeded data (credentials + hash chains)
```

Prerequisites: the dev Postgres container must be running and the schema pushed:

```bash
npm run db:setup           # docker up + db push + immutability triggers + generate
npm run db:seed
```

## What is seeded

- 10 users (5 owners + 5 seekers), all with verified e-mail and working passwords
- 14 properties (houses, apartments, a parking space and a plot of land),
  including Rijksmonumenten
- energy labels + CBS neighborhood profiles per property
- 15 listings covering **every** status: `DRAFT`, `READY_FOR_VERIFICATION`,
  `LIVE`, `UNDER_OFFER`, `SOLD`, `RENTED`, `ARCHIVED`, plus an
  expired-bid-window listing
- listing media, floor plans, free `PLATFORM` publications
  (incl. one `REJECTED` and some `WITHDRAWN`)
- cryptographically chained bids + bid events (validated by
  `verifyAndOrderBidChain`)
- viewing slots/bookings, favorites, saved searches, shortlist shares,
  seeker notifications, development identity fixtures (verified/pending/failed)
  and email verification audit logs
- 3 property transactions: a pending sale, a completed sale and a completed
  rental — with milestones, messages, documents, chained events and passport
  versions
- estimator caches + postcode price stats

## Login credentials

> **Password for every account: `DevPassw0rd!`** (2FA is disabled so you can log
> in immediately; enable it in Account settings to test TOTP.)

### Owners

| Name               | Email                         | Interesting data                                  |
| ------------------ | ----------------------------- | ------------------------------------------------- |
| Jan de Vries       | `jan.devries@example.dev`     | Grachtpand (live), under-offer deal, land         |
| Sanne Bakker       | `sanne.bakker@example.dev`    | Completed sale (Rotterdam), parking space         |
| Mohamed El Amrani  | `mohamed.elamrani@example.dev`| Den Haag listing (no bids yet), drafts            |
| Anouk Jansen       | `anouk.jansen@example.dev`    | Ready-for-verification listing, archived listing  |
| Pieter Visser      | `pieter.visser@example.dev`   | Rental listings (live + completed rental)         |

### Seekers

| Name              | Email                         | Interesting data                                  |
| ----------------- | ----------------------------- | ------------------------------------------------- |
| Thomas Mulder     | `thomas.mulder@example.dev`   | Buyer in the under-offer transaction              |
| Lisa van Dijk     | `lisa.vandijk@example.dev`    | Buyer of the sold property + renter (completed)   |
| David de Boer     | `david.deboer@example.dev`    | Highest bidder on the grachtpand, shortlist       |
| Femke Smit        | `femke.smit@example.dev`      | Failed development identity attempt, bids on rentals              |
| Bram Willems      | `bram.willems@example.dev`    | EN locale, pending development identity attempt                   |

## Notes

- The seed recreates data every run; your logins remain valid because password
  hashes are regenerated deterministically against the same shared password.
- The seed generates **real dummy media files** so URLs resolve instead of
  returning 404:
  - listing photos + floor plans → PNGs written to `web/public/dev/listings/…`
    (served at `/${storageKey}`)
  - transaction documents + bid logbook exports → PDFs written to
    `web/.data/transaction-documents/…` and `web/.data/logbooks/…`
  Old generated files are deleted at the start of every seed run.
- `npm run db:verify-seed` runs the app's own integrity checks on bid chains,
  transaction event chains and passport chains, verifies a seeded password
  against Better Auth's `verifyPassword`, and confirms every seeded media /
  document file actually exists on disk.
