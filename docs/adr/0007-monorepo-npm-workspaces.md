# 0007 — Monorepo via npm workspaces

## Status
Accepted — 2026-07-03

## Context
The Worker API and the Vite frontend both need to share TypeScript types (User, Organization, Artifact, roles, etc.) and, more importantly, the pure business-rule modules (RBAC, lifecycle, visibility, custom-field validation, API-key scope — 0008) so that the same rules aren't reimplemented or drift between frontend button-disabling logic and backend enforcement. pnpm is not installed in this environment; npm ≥ 7 supports workspaces natively.

## Decision
Single repo, npm workspaces: `apps/web`, `apps/api`, `packages/shared`. `packages/shared` has no build step of its own for now (consumed via TS path references / workspace symlink); it exports domain types and pure functions only — no framework dependencies (no Hono, no React), so it can be imported unmodified by both the Worker and the browser bundle.

## Consequences
- **Positive:** one `npm install` at the root wires up all three packages; a change to a business rule (e.g. a new lifecycle transition) is made once and both apps pick it up.
- **Negative:** `packages/shared` must stay dependency-free of both Workers-only and DOM-only APIs, or it stops being importable by one side — enforced by keeping it to plain TypeScript + Vitest only.

## Alternatives considered
- **pnpm workspaces:** preferred by many for stricter dependency isolation, but not installed on this machine and not worth introducing an extra toolchain requirement for a two-app monorepo. Revisit if the team standardizes on pnpm elsewhere.
- **Separate repos for web/api with a published shared npm package:** avoids monorepo tooling entirely, but adds versioning/publish overhead that isn't justified at this project's current size.
