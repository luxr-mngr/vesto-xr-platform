# 0008 — Business rules live in pure, framework-free modules with unit tests

## Status
Accepted — 2026-07-03

## Context
This project's actual business risk isn't rendering or routing — it's getting the *rules* wrong: a Curator publishing another org's artifact, an Assistant approving their own submission, a private artifact leaking into the public Store, a custom-field value of the wrong type being persisted, or an API key reaching another organization's private data. Explicit instruction from the product owner: protect business rules with tests.

## Decision
Every business rule that governs "who can do what to what, and what state comes next" is implemented as a **pure function in `packages/shared/src/domain/`**, with no dependency on D1, Hono, HTTP, or React:
- `rbac.ts` — `can(actor, action, resource)` permission matrix (§ ERS 5).
- `artifactLifecycle.ts` — legal status transitions (0004).
- `visibility.ts` — `isStorePublic(artifact)` / `libraryVisibleTo(actor, artifact)` (0003).
- `customFields.ts` — `validateCustomFieldValue(definition, value)` (0005).
- `apiKeyScope.ts` — `authorizeApiKeyAccess(key, artifact)` (0006).

Each module has a co-located Vitest spec covering the legal paths **and** the illegal ones (e.g. "assistant cannot approve," "private artifact never appears in Store," "wrong-org API key is denied"). API route handlers (`apps/api/src/routes/*`) call these functions and persist/return their result — they must not contain their own `if (role === ...)` branching. This makes the test suite the executable spec of the ERS's role/lifecycle/visibility tables, not an afterthought bolted onto HTTP handlers.

## Consequences
- **Positive:** business rules are verifiable without spinning up Miniflare/D1/HTTP in most cases — fast unit tests, easy to keep green in CI. A change to the ERS's permission table (§5) has one obvious place to update and one test file that proves it.
- **Negative:** requires discipline to keep route handlers thin; if a handler starts encoding its own authorization logic instead of delegating, the single-source-of-truth property breaks. Code review should treat new `if (role === ...)` in a route handler as a signal to move that logic into `packages/shared/src/domain/`.

## Alternatives considered
- **Authorization/lifecycle logic inline in route handlers, tested via HTTP-level integration tests only:** integration tests are valuable too (and worth adding for the happy paths, especially around D1 migrations), but alone they make it easy for one endpoint to drift from another's rules and are slower/heavier to run for every edge case of a permission matrix. Pure unit tests are used for exhaustive rule coverage; integration/HTTP tests are reserved for wiring, not rule correctness.
