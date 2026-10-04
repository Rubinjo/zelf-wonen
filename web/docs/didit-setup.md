# Didit identity verification

[Project overview](../../README.md) · [Deployment](deployment.md)

Didit verifies a listing owner's identity before publication.
Approved identities are stored per account and reused for 365 days by default.
Set `IDENTITY_VERIFICATION_TTL_DAYS` to change that lifetime.

Verification does not prove property ownership or sign an agreement.
Digital agreement signing is not implemented yet.

## Setup

1. Create a dedicated Didit workspace for this deployment.
2. Configure and activate a KYC workflow. Review its approval rules, retention
   settings and current pricing. Disable unneeded paid extras and automatic retries.
3. Set `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET` and
   `DIDIT_MODE=live` in `web/.env.production`.
4. Set the webhook URL in Didit to
   `https://YOUR_DOMAIN/api/identity/didit/webhook`.
   Ensure `NEXT_PUBLIC_APP_URL` matches your HTTPS origin.
5. Initialize the database following the deployment guide and recreate the web container.

For local testing, use sandbox credentials and `DIDIT_MODE=sandbox`.
Production accepts only live approvals. Sandbox, seed and historical iDIN records
cannot unlock production publishing. Switching modes requires matching credentials.

Credentials stay on the server. Missing or invalid configuration blocks verification.

## Monthly limit

The app allows **499 reservations** across all users sharing the database.
This is an application limit, rather than a guarantee about Didit's current plan
or your bill. Other apps or manual sessions in the same workspace are not counted.

The server reserves an attempt before calling Didit, with a database lock to
prevent concurrent requests exceeding the cap. It does not automatically retry
session creation. Existing approvals and reused pending sessions consume no
new reservation.

Usage includes attempts requested or completed in the current UTC month, plus
unfinished attempts from earlier months. Failed, cancelled and expired attempts
still count in the current month. At the cap, the app returns 429 with
`VERIFICATION_LIMIT_REACHED`.

Preserve attempt history in backups and host moves.
Deleting attempts or restoring an older database can erase spending history.

## Failed or uncertain attempts

If creation times out, inspect the Didit console using the attempt UUID
(`vendor_data`). A signed webhook can reconcile a session whose creation response
was lost. Do not blindly retry or refund an uncertain attempt.

An administrator may mark an attempt failed only after confirming no remote
session exists. Retain the row and completion timestamp so it still counts
for the current month.

## Trust and privacy

The server checks webhook signatures, signed timestamps, session details and the
authoritative provider decision. Browser return parameters cannot approve an account.
In-review decisions remain pending.

The app retains verification status, timestamps, references and audit events.
It does not retain identity documents, selfies or biometric templates.
Review the provider's own retention separately.

## References and tests

- [Create session](https://docs.didit.me/sessions-api/create-session)
- [Retrieve session](https://docs.didit.me/sessions-api/retrieve-session)
- [Webhooks](https://docs.didit.me/integration/webhooks)
- [Pricing](https://didit.me/pricing/)

From `web/`:

```bash
node --import tsx --test tests/didit.test.ts tests/publication.test.ts tests/identity-cache.test.ts
```

These tests use mocks and create no paid verification sessions.
