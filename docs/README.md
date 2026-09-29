# Documentation

[Project overview](../README.md)

## Start here

| Goal | Read |
| --- | --- |
| Run and explore the application | [Getting started](getting-started.md) and [sample data](../web/docs/dev-seed.md) |
| Understand the design | [Architecture](architecture.md) and [repository map](directory-structure.md) |
| Review the AI engineering | [AI engineering](ai-engineering.md), [estimator](../estimator/README.md) and [valuation method](../estimator/METHOD.md) |

## Service and operations guides

- **Web:** [VPS deployment and backups](../web/docs/deployment.md),
  [Didit setup](../web/docs/didit-setup.md),
  [admin dashboard](../web/docs/admin-dashboard.md).
- **Estimator:** [run, refresh and evaluate](../estimator/README.md),
  [method and uncertainty](../estimator/METHOD.md),
  [data attribution](../estimator/data/NOTICE.md),
  [internal REST contract](../web/docs/estimator-openapi.yaml).
- **Aggregator:** [configuration, operation and adapter development](../aggregator/README.md).

## Research background

[Housing-data research](../estimator/DATA_SOURCES.md) and
[identity-provider research](../web/docs/identity-production.md) retain dated
investigations. They are background material, not current provider offers or
promises of future work. Use the implementation guides above for active behavior.

Project-wide guides live in this directory; service runbooks stay with the code
they describe. Data attribution stays beside the distributed artifacts.
[AGENTS.md](../AGENTS.md) records coding-agent preferences, while
[CONTRIBUTING.md](../CONTRIBUTING.md) is the entry point for contributors.
