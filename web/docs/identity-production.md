# Identity-provider research

[Project overview](../../README.md) · [Didit setup](didit-setup.md)

This summarizes the September 2026 identity-provider investigation.
It is historical context. Provider offers and transition dates need checking
before making a new integration decision.

## Supported provider

zelf-wonen uses Didit before listing publication.
Approvals are reused across listings for 365 days by default.
Production requires live approvals. Sandbox and sample identities cannot unlock it.

Use [Didit setup](didit-setup.md) for configuration, quota and recovery.
Verification does not prove property ownership or sign agreements.
Digital signing is unavailable.

## Earlier alternatives

The investigation considered iDIN providers including
[CM.com](https://www.cm.com/nl-nl/idin/),
[Buckaroo](https://www.buckaroo.nl/online-betalingen/betaalmethoden/idin),
[Bluem](https://www.bluem.nl/oplossingen/identity/identificeren) and
[Signicat](https://developer.signicat.com/identity-methods/idin/setup/).

No free production iDIN plan was verified.
A sandbox or free account does not establish free production identification.
Any comparison should include setup fees, monthly minimums, failed checks and
migration costs. Login pricing may differ from full identity verification.

The investigation also recorded an iDIN-to-itsme transition.
Review [Rabobank's notice](https://www.rabobank.nl/bedrijven/betalen/rabo-identity-services/idin-wordt-itsme)
and provider migration terms before relying on a schedule.

## Migration considerations

A future provider needs server-verified results bound to the signed-in account,
expiry handling, spending limits and a minimal data-retention policy.
Existing identities need a reviewed mapping and recovery plan.
Multiple provider identifiers do not guarantee one account per person.

The old iDIN simulator and signing flow were retired.
Their endpoints return 410 and cannot change verification or signing state.
Historical audit records remain readable.
