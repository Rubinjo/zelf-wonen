# Didit identity verification

[Documentation](../../docs/README.md) · [Deployment](deployment.md)

Didit verifies the identity of an email-verified listing owner before free
publication. Existing verified identities are reused for the configured identity
TTL (365 days by default, configurable with `IDENTITY_VERIFICATION_TTL_DAYS`).
Approvals are cached durably in PostgreSQL per user, survive restarts, and work
across listings without new Didit calls or quota consumption. Both the TTL and
stored expiry are enforced. Production accepts only `DIDIT`, and local sandbox
mode accepts only `DIDIT_SANDBOX`; historical iDIN and seed records are excluded.
This does not sign purchase agreements. The old iDIN signing simulator has been
removed; digital signing is unavailable pending a separate signing integration.

## Configure your Didit account

1. Create a dedicated Didit workspace/application for this deployment. Do not
   share its free allowance with other projects, manual sessions or verification
   links: the app cannot count calls made outside its database.
2. Configure a KYC workflow containing only the free-bundle features: ID
   verification, passive liveness, face match and device/IP analysis. Disable
   paid extras, automatic re-verification/retry loops and any unneeded modules.
   Publish/activate the workflow before allowing production verifications; a
   draft workflow is not a production readiness confirmation.
   Configure the session lifetime and approval rules in Didit. If requiring age
   18+, enforce that in the workflow's approval policy.
3. Set `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET` and
   `DIDIT_MODE=live` in `web/.env.production`. Set `NEXT_PUBLIC_APP_URL` to your
   HTTPS origin (already provided by Compose).
4. In Didit's **API & Webhooks** settings, configure
   `https://YOUR_DOMAIN/api/identity/didit/webhook`. Copy its webhook secret into
   the environment variable above. The endpoint validates the full raw-body
   `X-Signature` HMAC and the signed timestamp, then retrieves the authoritative
   session decision using the private API key. No simple-signature fallback is used.
5. Recreate the web container after setting runtime credentials. Attempts and
   audits use the application's identity tables; initialize the schema using the
   deployment guide before enabling verification.
6. Test with sandbox credentials on a local/nonproduction deployment using
   `DIDIT_MODE=sandbox`. Sandbox approvals are recorded as `DIDIT_SANDBOX` and
   cannot unlock production publishing, including when copying a development DB.
   Switching to live requires live application credentials, not just a mode flag.

Missing/invalid credentials fail closed. Credentials are never sent to the browser.
Do not configure paid features merely because a dashboard recommends them. Didit
was configured around a 500-check monthly allowance. Verify the current plan,
pricing and workflow settings before enabling live traffic; the app's hardcoded
cap is not a statement of the provider's current offer.

## Monthly cap and failure handling

- The hardcoded ceiling is **499 reservations**, strictly below 500, across all
  users/listings/processes sharing the database. It is not a per-user limit.
- The server obtains a global PostgreSQL transaction advisory lock, counts usage,
  and commits an `INITIATED` attempt before calling Didit. It never automatically
  retries the session-creation POST. Concurrent requests cannot reserve the same
  final slot. A failed database reservation cannot trigger a provider call.
- Every attempt requested or completed in the current **UTC calendar month**
  counts. All unfinished `INITIATED`/`PENDING` attempts from earlier months also
  count because they may still execute. The count can therefore be conservative.
- Already-verified accounts consume nothing. Pending sessions are reused across
  listings for the same account. In-flight/uncertain starts return a pending error.
- At the ceiling the start endpoint returns HTTP **429**, code
  `VERIFICATION_LIMIT_REACHED`, and the listing editor shows a dismissible error
  toast explaining that the monthly allowance is exhausted. No Didit call follows.
- Failed, cancelled and expired attempts are not refunded within the month.
  Unknown outcomes remain reserved across months. Do not delete attempt rows or
  restore an older DB mid-month: that can erase the budget history. Preserve these
  records in backups and when migrating hosts.

If a creation request times out and no webhook arrives, inspect the Didit console
using the attempt UUID (`vendor_data`). A signed webhook can reconcile the
reservation even if the creation response was lost. If no remote session exists,
an administrator may mark it failed only after confirming that with Didit; retain
the row and completion timestamp so it still counts for the current month.
Never automatically refund or blindly retry an uncertain session.

This cap bounds this application's session creation. It cannot guarantee the
provider bill if another application shares the workspace, an administrator
creates sessions, paid features are enabled, or the provider changes its pricing.

## Trust and data handling

Session IDs, workflow IDs, opaque attempt IDs and live/sandbox mode are checked
against the local reservation. Browser return parameters never verify an account.
Only an authoritative approved decision is accepted; in-review stays pending.
The webhook and browser return both use an idempotent, locked update. The return
page polls local status for delayed webhooks without making more provider calls.

The app stores status, timestamps, workflow/session references and a minimal
append-only audit event. Documents, selfies, extracted personal data and biometric
templates are discarded by the response schema and are not persisted or logged.
Review Didit's own retention settings separately. A verification does not prove
property ownership or guarantee that a person cannot create multiple accounts.

## Sources and verification

- [Create Session](https://docs.didit.me/sessions-api/create-session)
- [Retrieve Session](https://docs.didit.me/sessions-api/retrieve-session)
- [Webhook signatures](https://docs.didit.me/integration/webhooks)
- [Current pricing](https://didit.me/pricing/)

Focused tests: `node --import tsx --test tests/didit.test.ts tests/publication.test.ts tests/identity-cache.test.ts`.
These use mocked external requests and database delegates; live credentials are
not required and no paid verification is created by running them.
