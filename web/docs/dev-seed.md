# Sample development data

[Project overview](../../README.md) · [Getting started](../../docs/getting-started.md)

The seed provides local sample accounts, listings, viewings, bids and transaction
rooms so you can explore zelf-wonen.

> [!WARNING]
> Seeding deletes all existing data in the target database.
> Use only a disposable local database. Production and non-loopback URL guards
> do not prove the target is safe, especially when using a tunnel.

## Load the data

Run from `web/`:

```bash
npm run db:setup
npm run db:seed
npm run db:verify-seed
```

The seed includes 10 users, 14 properties, 15 listings across the main statuses,
and three sale or rental transactions. It also creates sample media, documents,
favorites, searches and shared shortlists.

The verification command checks passwords, history chains and generated files.
External services still need credentials. Sample identity records cannot unlock
new publication approvals.

## Sign in

Every account uses **`DevPassw0rd!`**. Two-factor authentication is disabled.

| Owner email | Try |
| --- | --- |
| `jan.devries@example.dev` | Live listing, under-offer transaction and land |
| `sanne.bakker@example.dev` | Completed sale and parking space |
| `mohamed.elamrani@example.dev` | Drafts and a listing without bids |
| `anouk.jansen@example.dev` | Ready-for-verification and archived listings |
| `pieter.visser@example.dev` | Rental listings |

| Seeker email | Try |
| --- | --- |
| `thomas.mulder@example.dev` | Under-offer transaction |
| `lisa.vandijk@example.dev` | Completed sale and rental |
| `david.deboer@example.dev` | Bids and shortlist |
| `femke.smit@example.dev` | Rental bids |
| `bram.willems@example.dev` | English-language account |

## Generated files

Sample public images live in `web/public/dev/listings/`.
Private PDFs live in `web/.data/transaction-documents/` and
`web/.data/logbooks/`.

Each run replaces previous sample records and generated files.
Keep any work you want to retain elsewhere before reseeding.
