# 0003 — Organization multi-tenancy with a shared public Store

## Status
Accepted — 2026-07-03

## Context
The product owner wants each institution ("organization") to fully own and manage its own artifacts, but also wants a single shared "Store" where anyone (any org, any role) can browse everyone's published work — described as "like a store or public library where everyone will see all glb". This is a hybrid between strict multi-tenant isolation and a fully shared catalog.

## Decision
- Every non-admin user belongs to exactly one organization (`users.organization_id`).
- Every artifact belongs to exactly one organization (`artifacts.organization_id`) and only that org's Curators/Admins (plus global Admins) can mutate it.
- Two orthogonal fields drive read visibility, not one:
  - `status`: `draft | pending_review | published | rejected` (editorial state, § 0004)
  - `visibility`: `private | public` (org-only vs shared-store distribution)
- An artifact appears in the public **Store** iff `status = 'published' AND visibility = 'public'`. It appears in the owning org's **My Library** regardless of status/visibility.
- This computation (`isStorePublic(artifact)`) is a pure, unit-tested function — not duplicated ad hoc in every query — see 0008.

## Consequences
- **Positive:** organizations keep full editorial control while still being able to opt individual artifacts into the shared public catalog; the two-flag model (status × visibility) cleanly separates "is this finished/approved" from "who gets to see it," which will matter later if an org wants a published-but-org-only artifact (e.g. an internal reference piece).
- **Negative:** every read path (API list endpoints, Store UI, My Library UI) must apply the same visibility predicate consistently — a single shared helper function is required to avoid drift/bugs (addressed directly by 0008: this predicate is centralized and tested, not reimplemented per endpoint).

## Alternatives considered
- **Fully isolated multi-tenancy (no shared Store):** simpler mental model, but doesn't satisfy the explicit "everyone sees all glb" requirement.
- **Single global catalog, org as a label only (no isolation):** rejected because the owner explicitly wants "each organization handles their own artifacts" — i.e., real ownership/edit boundaries, not just tagging.
