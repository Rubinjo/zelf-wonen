# Development seed (dummy data)

[Documentation](../../docs/README.md) · [Getting started](../../docs/getting-started.md)

A complete set of dummy data for the **local development database only**. It lets
you explore the main application workflows without entering sample records by hand.
External providers still need their own configuration; seed identity fixtures
cannot unlock new publication approvals.

## Safety

The seed has development guards:

- it refuses to run when `NODE_ENV=production`
- it checks `DATABASE_URL` for a localhost, IPv4 loopback or IPv6 loopback marker

It **wipes all existing data** first (append-only triggers are temporarily
disabled, then re-enabled). Use only a disposable local database and verify the
actual target yourself; a local tunnel or a URL containing a loopback marker is
not proof that its data is disposable.

## Commands

```bash
# From web/
npm run db:seed            # tsx prisma/seed.ts
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
  passwords are reset to the same shared development password.
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
