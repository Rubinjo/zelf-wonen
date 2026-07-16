# Initial Next.js App Router structure

```text
web/
├─ docs/
│  ├─ architecture.md                 # Trust boundaries, diagrams and decisions
│  ├─ directory-structure.md          # This map
│  └─ estimator-openapi.yaml          # Next.js ↔ Python REST contract
├─ prisma/
│  ├─ schema.prisma                   # PostgreSQL domain + Better Auth schema
│  ├─ migrations/                     # Generated migrations (next step)
│  └─ immutability.sql                # Append-only database triggers
├─ public/                            # Brand/static assets
├─ src/
│  ├─ app/
│  │  ├─ (auth)/
│  │  │  ├─ sign-in/page.tsx           # Sign in (planned)
│  │  │  ├─ sign-up/page.tsx           # Sign up (planned)
│  │  │  └─ verify-email/page.tsx      # Verification guidance (planned)
│  │  ├─ (platform)/
│  │  │  ├─ dashboard/page.tsx        # Verified-user dashboard (planned)
│  │  │  └─ properties/
│  │  │     ├─ new/page.tsx           # Listing wizard (planned)
│  │  │     └─ [listingId]/page.tsx   # Autosave/preview/publish (planned)
│  │  ├─ api/
│  │  │  ├─ auth/[...all]/route.ts     # Better Auth handler
│  │  │  ├─ ai/listing-description/   # Vercel AI SDK writing helper
│  │  │  ├─ estimates/route.ts         # Three-tier estimator orchestrator
│  │  │  ├─ property-data/route.ts     # PDOK + normalized official data
│  │  │  ├─ listings/[listingId]/
│  │  │  │  ├─ bids/route.ts           # Immutable bid submission
│  │  │  │  └─ publish/route.ts        # iDIN/payment/publication gate
│  │  │  └─ webhooks/
│  │  │     ├─ idin/route.ts           # Signed provider callback (planned)
│  │  │     └─ payments/route.ts       # Signed payment callback (planned)
│  │  ├─ globals.css
│  │  ├─ layout.tsx
│  │  └─ page.tsx                      # Bilingual marketing shell
│  ├─ components/
│  │  ├─ providers/query-provider.tsx
│  │  ├─ ui/                           # Accessible primitives (planned)
│  │  └─ listing/                      # Wizard/media/floor-plan UI (planned)
│  ├─ features/
│  │  ├─ auth/guards.ts
│  │  ├─ bidding/submit-bid.ts
│  │  ├─ estimator/service.ts
│  │  └─ listings/publish-listing.ts
│  ├─ generated/prisma/                # Generated, excluded from manual edits
│  ├─ lib/
│  │  ├─ integrations/
│  │  │  ├─ identity/idin-provider.ts
│  │  │  ├─ property-data/pdok-client.ts
│  │  │  └─ publishing/
│  │  │     ├─ publisher.ts
│  │  │     └─ funda-publisher.ts
│  │  ├─ schemas/                      # Shared Zod API/domain contracts
│  │  ├─ auth-client.ts
│  │  ├─ auth.ts
│  │  └─ db.ts
│  └─ types/api.ts
├─ .env.example
├─ compose.yaml                       # Local PostgreSQL 17 container
├─ next.config.ts
├─ package.json
├─ prisma.config.ts
└─ tsconfig.json
```

Route handlers own HTTP concerns only. Business rules live under `features`; provider details live under `lib/integrations`; shared validation lives under `lib/schemas`. React Server Components are the default, while TanStack Query is used only for interactive autosave, wizard, upload, estimate, and status polling surfaces.
