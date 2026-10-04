# Admin dashboard

[Project overview](../../README.md) · [Deployment](deployment.md)

The dashboard shows metrics for this installation. It has no moderation tools.

## Enable access

Set `ADMIN_USER_ID` to your account's `users.id` in `.env.local` or
`.env.production`, then restart the web service.
Find the ID with `npm run db:studio`. Use the server setting, rather than a
public `NEXT_PUBLIC_` variable.

Alternatively, set `ADMIN_EMAIL`. The account must have verified email.
`ADMIN_USER_ID` takes precedence. Leaving both settings empty disables access.

Open `/dashboard/admin` or use the dashboard's Admin link.
The server checks access before loading metrics.

## Metrics

| Metric | Meaning |
| --- | --- |
| Accounts | Total, verified, new this UTC month and users with unexpired sessions |
| Listings | Native listings by status, active imports and active transactions |
| OpenRouter | Reported usage and spending limit for the configured API key |
| Didit | Local attempts, monthly starts and remaining application quota |

Active sessions do not measure historical monthly activity.
OpenRouter usage includes other apps sharing the key and excludes external BYOK
charges. Missing credentials or provider failures show unavailable.

Didit counts include pending reservations from previous months.
They describe the app's quota, rather than the provider's invoice.
See [Didit setup](didit-setup.md).
