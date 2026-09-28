# Identity-provider research (September 2026)

[Documentation](../../docs/README.md) · [Active Didit setup](didit-setup.md)

> Historical research, not deployment instructions. Prices, provider offers and
> transition dates below were recorded during the original investigation and
> have not been revalidated in the documentation review.

**Current implementation:** listing verification uses Didit. See
[Didit setup and the 499-session cap](didit-setup.md). The iDIN/itsme comparison
below is retained as background research for a possible future provider change.

Research checked 17 September 2026. ZelfWonen is free for users, but production
iDIN has a business cost. No free production iDIN plan was verified. A free
provider account or sandbox is not a free production identity service.

## Providers assessed

| Provider | Publicly advertised charge | Qualification |
| --- | --- | --- |
| CM.com | Full identification: EUR 0.65 Basic / EUR 0.49 Advanced per transaction | Subscription tiers; obtain setup/monthly/minimum fees before comparing total costs. |
| Buckaroo | EUR 0.68 per iDIN transaction | Confirm identification attributes, fixed charges, VAT and itsme migration terms in the quote. |
| Bluem | EUR 0.099 per secure login | Login is not equivalent to full initial identification; request a full-identification quote. |
| Signicat | Quote-based | Free sandbox; signed agreement required for production. |

Sources:

- https://www.cm.com/nl-nl/idin/
- https://www.buckaroo.nl/online-betalingen/betaalmethoden/idin
- https://www.bluem.nl/oplossingen/identity/identificeren
- https://developer.signicat.com/identity-methods/idin/setup/
- https://www.idin.nl/en/businesses/faq/

The original assessment proposed comparing CM.com with Buckaroo and
Bluem using the expected monthly number of *new identities*. A lowest unit price
does not establish the lowest total cost: compare setup + monthly minimums +
successful/failed verification charges + any migration costs. This comparison is not evidence of a provider contract or an enabled integration.

## Transition recorded in the original research

The original research recorded a Rabobank notice that iDIN would stop on
31 December 2027. Its recommendation was to investigate itsme support and how
existing subject identifiers would be mapped before any provider migration.
Recheck the source before relying on that date or making an integration decision.

Sources:
- https://www.rabobank.nl/bedrijven/betalen/rabo-identity-services/idin-wordt-itsme
- https://releasenotes.cm.com/release-notes/connectivity-platform/verification

## Historical flow proposal

1. Keep verified email and the existing account sign-in / optional TOTP.
2. Require identity verification before the first sensitive action, particularly
   publishing. Reuse the account verification for subsequent listings instead of
   charging a bank verification for every login or listing. The existing reuse
   window defaults to 365 days. Agreement signing would require a separate integration;
   it is currently unavailable.
3. Use the provider-hosted bank/itsme selection and return flow. Bind the attempt
   to the authenticated account, purpose and random state, and only accept a
   server-verified provider result. Handle cancellation, expiry and duplicate callbacks.
4. Request only needed attributes. Retain a keyed subject hash and verification
   status/timestamps, not raw bank assertions. Define duplicate-account and
   recovery handling; bank-specific identifiers cannot guarantee one human has
   only one account across all banks.
5. Rate-limit attempt creation and sensitive actions, cap verification spending,
   and provide reporting, moderation and suspension. Identity verification alone
   neither prevents abuse nor proves ownership of an advertised property.

## Current implementation boundary

Didit is the only supported identity provider. See [Didit setup](didit-setup.md).
The comparison above is historical research, not the active implementation.
The iDIN simulator, adapter, signing flow and configuration were retired.
Old start/callback endpoints return HTTP 410 and cannot change verification or
signing state. Historical audit enum values and signature labels remain readable.
Production accepts only live Didit approvals. Development seed fixtures never
unlock verification; use an actual Didit sandbox workflow for local testing.

Verification is persisted per user for 365 days by default and reused across
listings. Expired or non-Didit records cannot unlock publishing. Didit identity
approval never signs an agreement; digital agreement signing is unavailable until
a separate signing integration is implemented.
