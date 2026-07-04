# CLAUDE.md — agent rules for VestoXR Manager

Read [docs/ERS.md](docs/ERS.md) and [docs/adr/README.md](docs/adr/README.md) before making architectural changes. This file is the terse, enforceable subset for day-to-day work.

## Non-negotiables

1. **Business rules live only in `packages/shared/src/domain/`.** RBAC (`rbac.ts`), lifecycle transitions (`artifactLifecycle.ts`), visibility (`visibility.ts`), custom-field validation (`customFields.ts`), API-key scoping (`apiKeyScope.ts`). Route handlers in `apps/api/src/routes/*` call these and persist/return the result — they must never contain their own `if (role === ...)` or status-branching logic. If you see that pattern creeping into a handler, move it into `packages/shared` instead (ADR 0008).
2. **Every business rule change needs a test in the same PR.** Add/update the Vitest spec co-located with the domain module (`*.test.ts`). Illegal-path tests (wrong role, wrong org, wrong status) are as important as the happy path — that's the whole point of this test suite.
3. **`packages/shared` stays framework-free.** No Hono, no React, no DOM APIs, no Workers-only globals beyond what both runtimes already share (WebCrypto, `fetch`). It's imported unmodified by both `apps/api` and `apps/web`.
4. **Don't reintroduce a third-party auth/DB vendor.** The Cloudflare-only stack (Workers + D1 + R2 + Pages) was an explicit cost-driven decision (ADR 0001). Password hashing and sessions are hand-rolled with WebCrypto (`apps/api/src/lib/{password,jwt}.ts`) for the same reason — don't add bcrypt/jsonwebtoken/etc. as dependencies.
5. **Custom metadata fields are a flat, global, admin-only catalog** (`custom_field_definitions`), not a per-artifact or per-organization dynamic schema builder. Don't build toward a more flexible schema system unless the ERS is updated first (ADR 0005).
6. **Typography: no serif/display font.** This app intentionally uses one plain sans-serif (Inter) throughout, including headings — that was an explicit correction, not an oversight. The LUXR CORE **color tokens** (see `apps/web/tailwind.config.js` and ERS section 12.1) carry over from the brand, and the LUXR wordmark/sparkle glyph (`apps/web/src/assets/luxr-logo.svg`) may be used as a small "powered by" lockup (see `Login.tsx` and `Layout.tsx`) — but never as a substitute display font or a redesign of the app's own headings.
7. **Package manager is npm workspaces**, not pnpm/yarn (pnpm isn't installed in this environment — ADR 0007). Run installs from the repo root.
8. **Keep all docs updated alongside code.** If a change alters the DB schema, an API contract, an RBAC/lifecycle rule, or an architectural decision, update `docs/ERS.md` (and add an ADR under `docs/adr/` if it's a new decision) in the same PR — don't leave docs to drift from the code.

## When you touch...

- **A route handler** (`apps/api/src/routes/*.ts`): keep it thin — parse input, call a `packages/shared` domain function or a `Repo` method, return the result. Add an HTTP-level test in `apps/api/src/app.test.ts` if the change affects cross-cutting auth/lifecycle behavior (not needed for pure CRUD plumbing).
- **The D1 schema** (`apps/api/migrations/*.sql`): add a new numbered migration file; never edit a migration that may already be applied anywhere. Keep `docs/ERS.md` section 4 in sync if the shape of a table changes.
- **The Repo interface** (`apps/api/src/repo/types.ts`): update both `d1Repo.ts` (real) and `memoryRepo.ts` (test double) together — tests run against the in-memory repo and must keep passing.
- **Anything role/org/lifecycle/visibility-shaped in the frontend** (e.g. deciding whether to show a "Publish" button): reuse the same `packages/shared` predicate the backend uses (see `apps/web/src/pages/Store.tsx` and `MyLibrary.tsx` for the pattern) instead of re-deriving the logic in a component.
- **A release, or any change worth versioning** (a shipped feature, a fix affecting users, an API/schema change): consider whether the version should bump. The root `package.json`'s `"version"` field is the single source of truth — bump it there, then run `npm run version:sync` to propagate it into `apps/web/src/lib/version.ts`, `apps/api/wrangler.toml` (`APP_VERSION`), and the other two `package.json` files. Never hand-edit those derived files; `npm run version:check` verifies they match and fails if any have drifted. Use semver: patch for fixes, minor for backwards-compatible features, major for breaking API/schema changes. Skip the bump for pure internal refactors, docs, or test-only changes with no user-visible or contract effect.

## Commit conventions

- **One logical change per commit.** Don't bundle an unrelated docs fix, a dependency bump, and a feature change into one commit — split them so each commit's diff matches its message.
- **Use Conventional Commits for the title**: `type(scope): summary`, imperative mood, summary lowercase, no trailing period, ≤72 chars.
  - `type` is one of `feat|fix|refactor|test|docs|chore|build|perf|style`.
  - `scope` is the touched package/area (e.g. `api`, `web`, `shared`, `rbac`, `d1`, `ers`) — omit only when the change is truly repo-wide.
  - Example: `fix(rbac): reject cross-org artifact transfer`.
- **Body explains why, not what** — the diff already shows what changed; use the body for the motivating reason, especially for business-rule changes (link the ADR/ERS section if relevant).
- Follow the repo-wide git safety rules already in your operating instructions (no `--amend` on published commits, no `--no-verify`, confirm before any destructive op) — this section only adds scope/title conventions on top of those.

## Deploying

- **A manual `wrangler pages deploy` build must set `VITE_API_BASE_URL` to the deployed Worker's origin, with no `/api` suffix** — e.g. `VITE_API_BASE_URL=https://vestoxr-api.vestoxr.workers.dev npm run build --workspace apps/web`. The Worker's routes are mounted at the root (`/auth/login`, `/artifacts`, …, no `/api` prefix); only the local Vite dev proxy adds and then strips an `/api` prefix (`apps/web/vite.config.ts`). Forgetting this env var silently builds a bundle that calls the relative path `/api/...` on the Pages domain itself, which has no such route and fails logins with a 405 — this has actually happened once (2026-07-03) and cost a redeploy cycle to diagnose. This only applies to manual CLI deploys; a dashboard git-connected Pages build would read `VITE_API_BASE_URL` from its configured build environment variable instead.

## Commands

```bash
npm install            # from repo root — installs all workspaces
npm test                # all workspaces' Vitest suites
npm run typecheck       # tsc --noEmit across all workspaces
npm run dev:api         # apps/api via wrangler dev
npm run dev:web         # apps/web via vite (proxies /api to :8787)
```

## Open items to flag, not silently resolve

These are recorded as open questions in `docs/ERS.md` section 16 — if a task touches one, surface the ambiguity to the user rather than guessing:
- Max GLB file size / total catalog size assumptions.
- Whether the public Store should ever hide specific metadata fields per organization.
- Whether artifact CSV bulk-import is in scope (only user CSV import is currently speced, per the Simtryx reference).
- Whether Unreal needs offline/cached GLBs vs. always-live fetch.
