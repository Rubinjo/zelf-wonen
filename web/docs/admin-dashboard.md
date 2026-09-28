# Admin metrics dashboard

[Documentation](../../docs/README.md) · [Deployment](deployment.md)

This dashboard reports operational metrics; it does not provide a moderation console.

Set `ADMIN_USER_ID` to the immutable `users.id` of your own email-verified account in the server environment (`web/.env.local` locally, `web/.env.production` with Docker Compose). Restart the web service after changing it. Find the ID using Prisma Studio (`npm run db:studio`) and the users table. Do not use an email address or a public `NEXT_PUBLIC_` variable.

Visit `/dashboard/admin`, or use the Admin link in the dashboard header, on desktop or mobile. Alternatively, set `ADMIN_EMAIL` to your owner email address. The account must verify that email before access is granted. `ADMIN_USER_ID` takes precedence if both are set. Leaving both settings empty disables access. Other accounts and signed-out requests cannot access dashboard metrics: the server checks the session, email verification and configured owner before querying data. The page is dynamic and provider requests bypass the cache.

- Accounts: all users, email-verified users, new users in the current UTC month, and unique users with an unexpired session. Active sessions are a proxy, not historical monthly active users.
- Listings: native listings by status, active aggregated listings separately, and transactions currently in ACTIVE status.
- OpenRouter: reported total, daily and monthly USD credit usage for `OPENROUTER_API_KEY`, plus the remaining key spending limit. This is key-scoped, not account-wide; a shared key includes other applications. A missing key or provider failure displays unavailable, never zero. External BYOK provider charges are excluded. See the [provider API reference](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key).
- Didit: locally recorded attempts by current status, live/sandbox starts this UTC month, and remaining app quota using the same budget predicate as verification creation. The budget includes pending and uncertain reservations carried from previous months. These counts are not an invoice or Didit account-wide usage.

The dashboard reads the existing application tables. Counts describe this deployment;
provider usage is not a complete billing or service-health view.
