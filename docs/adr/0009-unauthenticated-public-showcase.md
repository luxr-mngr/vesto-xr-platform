# 0009 — Public showcase: a third, fully unauthenticated read surface

## Status
Accepted — 2026-07-20

## Context
For demo day, visitors need to browse the published catalog from a booth screen or their own phone with no login at all — not even the lightweight per-user bearer token the Store already uses (ADR 0006 addendum, `/v1/store/*`). Every existing read path (`/artifacts/*`, `/v1/store/*`) requires some credential (session cookie, org API key, or a user token from `/v1/session/login`), because until now every consumer was either the admin app itself or a known external client (Unreal, a logged-in Store viewer).

Two smaller decisions rode along with this:
- `Artifact` had no free-text `description` — only `title` — so there was nothing to show as the "brief description" visitors need.
- The global custom-field catalog (ADR 0005) is shown in full to any authenticated Store/library viewer; nothing distinguished a field like "Dynasty" (fine to show a stranger) from one like internal condition/provenance notes (not).

## Decision
- Add `GET /public/showcase/artifacts(+ /:id/thumbnail, /:id/glb)` (`apps/api/src/routes/showcase.ts`) with **no auth middleware at all** — scoped to the exact same `isStorePublic` predicate (`packages/shared/src/domain/visibility.ts`) already used by the Store, so this surface is never more permissive than what a logged-in user could already see. Rate-limited per source IP (300/min) since there's no credential to bucket by.
- Add `Artifact.description` (plain nullable text column, editable wherever title already is) rather than reviving the unused legacy `artifact_metadata` table from the original scaffold — that table predates ADR 0005's pivot to the flat custom-field catalog and stays out of scope here.
- Add `CustomFieldDefinition.isPublicShowcase` (admin-toggled boolean, default `false`) so admins opt specific fields into the anonymous showcase per-field, independent of whether the artifact itself is public. The showcase route filters the catalog by this flag before attaching values to each artifact; the Store and My Library are unaffected and keep showing the full catalog to authenticated viewers as before.
- Add a matching `/showcase` frontend route (`apps/web/src/pages/Showcase.tsx`), mounted outside `ProtectedRoute`/`Layout` like `/login`: one large auto-rotating piece at a time, auto-advancing through the public catalog, meant to be left running unattended on a booth screen.

## Consequences
- **Positive:** a genuinely link-shareable, walk-up-and-browse catalog exists without creating shared demo-day credentials or loosening any existing auth path. Per-field showcase opt-in means an org can mark an artifact public for the Store without every custom field on it becoming stranger-visible.
- **Negative:** a fourth distinct read-auth mode on top of session cookie / org API key / user bearer token (ADR 0006) — more surface to keep straight. Mitigated by giving it the narrowest possible scope (read-only, `isStorePublic` only, one dedicated route file) rather than branching auth behavior inside the existing `/artifacts/*` or `/v1/store/*` handlers.
- **Negative:** any field an admin flags `isPublicShowcase` is visible to literally anyone once the field has a value on a public artifact — there's no per-organization override. Acceptable for a flat/global catalog (ADR 0005); flagged in ERS §16 as a boundary future work should revisit only if an org needs per-org showcase field control.

## Alternatives considered
- **Reuse `/v1/store/*` with the existing user-token auth, just for a new frontend page:** simplest, but still requires every demo-day visitor to have (or be handed) a VestoXR login — defeats the "public, no login" requirement.
- **A shared "demo" account/password distributed at the booth:** avoids new routes entirely, but is a real credential that outlives the event, shows up in browser history/autofill, and still requires whoever's tending the booth to project a login screen. Rejected in favor of a route that needs nothing typed at all.
- **Revive `artifact_metadata`'s `description` column instead of adding one to `artifacts`:** would have matched the original (pre-ADR-0005) schema sketch, but that table is otherwise fully unused and reviving only its `description` column while leaving the rest dead adds confusion without benefit.
