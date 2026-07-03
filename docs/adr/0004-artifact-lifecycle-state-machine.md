# 0004 — Explicit artifact lifecycle state machine

## Status
Accepted — 2026-07-03

## Context
Artifacts move through an editorial review process before becoming publicly visible (§ ERS 7): `draft → pending_review → published`, with a `rejected` path back to `draft`. Different roles are allowed different transitions (Assistants can create drafts and submit for review but not approve; Curators/Admins can approve/reject/publish within their own org). Without a single source of truth for "what transitions are legal, by whom," this logic tends to leak into API handlers and drift between endpoints.

## Decision
Model the lifecycle as an explicit finite state machine in `packages/shared/src/domain/artifactLifecycle.ts`:
- A `transition(current, action, actor, artifact)` pure function returns the next status or throws/returns an error result — it does not touch the database.
- Legal edges: `draft --submit--> pending_review`, `pending_review --approve--> published`, `pending_review --reject--> draft`, plus `publish`/`unpublish` toggling the independent `visibility` flag (0003) only from `published`.
- Role authorization for each edge is checked via the same RBAC predicate used everywhere else (0008), not re-implemented per transition.
- API route handlers call this function and persist only the result; they contain no branching business logic of their own.

## Consequences
- **Positive:** the state machine is unit-testable in isolation (no D1/Workers runtime needed), and is the single place that can answer "can this actor do this to this artifact right now" — used identically by the API and, if needed later, by the frontend to decide which buttons to show.
- **Negative:** any new status or transition (e.g. an "archived" state, phase 3) requires updating this one module plus its tests — treated as a feature, not a cost, since it forces the alternative states to be considered explicitly rather than bolted on ad hoc.

## Alternatives considered
- **Implicit status field with ad hoc `if` checks in each route handler:** faster to write initially, but is exactly the pattern that produces inconsistent business rules (e.g. one endpoint forgetting a role check). Rejected in favor of a single tested module (0008).
