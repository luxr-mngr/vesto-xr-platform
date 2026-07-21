# Architecture Decision Records

Each ADR captures one significant, hard-to-reverse technical decision: the context that forced it, the decision itself, and the consequences (including what we gave up). Numbered sequentially, never renumbered; a superseded ADR stays in place with a note pointing at its replacement.

| # | Title | Status |
|---|---|---|
| [0001](0001-cloudflare-native-stack.md) | Cloudflare-native stack (Workers + D1 + R2 + Pages) | Accepted |
| [0002](0002-custom-auth-with-approval-queue.md) | Custom email/password auth with admin approval queue | Accepted |
| [0003](0003-organization-multi-tenancy-and-visibility.md) | Organization multi-tenancy with a shared public Store | Accepted |
| [0004](0004-artifact-lifecycle-state-machine.md) | Explicit artifact lifecycle state machine | Accepted |
| [0005](0005-metadata-fixed-schema-plus-custom-fields.md) | Fixed metadata schema + admin-managed global custom-field catalog | Accepted |
| [0006](0006-external-api-key-plus-signed-urls.md) | External API auth: per-org API key + short-lived signed R2 URLs | Accepted |
| [0007](0007-monorepo-npm-workspaces.md) | Monorepo via npm workspaces (no separate package manager) | Accepted |
| [0008](0008-domain-logic-as-pure-tested-modules.md) | Business rules live in pure, framework-free modules with unit tests | Accepted |
| [0009](0009-unauthenticated-public-showcase.md) | Public showcase: a third, fully unauthenticated read surface | Accepted |

To add a new one, copy the shape of an existing ADR (Context / Decision / Consequences / Alternatives considered) and append a row above.
