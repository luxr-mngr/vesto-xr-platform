# CLAUDE.md — agent rules for VestoXR Manager

Read [docs/ERS.md](docs/ERS.md) and [docs/adr/README.md](docs/adr/README.md) before making architectural changes. This file is the terse, enforceable subset for day-to-day work.

## Non-negotiables

1. **Business rules live only in `packages/shared/src/domain/`.** RBAC (`rbac.ts`), lifecycle transitions (`artifactLifecycle.ts`), visibility (`visibility.ts`), custom-field validation (`customFields.ts`), API-key scoping (`apiKeyScope.ts`). Route handlers in `apps/api/src/routes/*` call these and persist/return the result — they must never contain their own `if (role === ...)` or status-branching logic. If you see that pattern creeping into a handler, move it into `packages/shared` instead (ADR 0008).
2. **Every business rule change needs a test in the same PR.** Add/update the Vitest spec co-located with the domain module (`*.test.ts`). Illegal-path tests (wrong role, wrong org, wrong status) are as important as the happy path — that's the whole point of this test suite.
3. **`packages/shared` stays framework-free.** No Hono, no React, no DOM APIs, no Workers-only globals beyond what both runtimes already share (WebCrypto, `fetch`). It's imported unmodified by both `apps/api` and `apps/web`.
4. **Don't reintroduce a third-party auth/DB vendor.** The Cloudflare-only stack (Workers + D1 + R2 + Pages) was an explicit cost-driven decision (ADR 0001). Password hashing and sessions are hand-rolled with WebCrypto (`apps/api/src/lib/{password,jwt}.ts`) for the same reason — don't add bcrypt/jsonwebtoken/etc. as dependencies.
5. **Custom metadata fields are a flat, global, admin-only catalog** (`custom_field_definitions`), not a per-artifact or per-organization dynamic schema builder. Don't build toward a more flexible schema system unless the ERS is updated first (ADR 0005).
6. **Typography: no serif/display font, no LUXR CORE wordmark/sparkle glyph.** This app intentionally uses one plain sans-serif (Inter) throughout, including headings — that was an explicit correction, not an oversight. Only the LUXR CORE **color tokens** (see `apps/web/tailwind.config.js` and ERS §12.1) carry over from the brand.
7. **Package manager is npm workspaces**, not pnpm/yarn (pnpm isn't installed in this environment — ADR 0007). Run installs from the repo root.

## When you touch...

- **A route handler** (`apps/api/src/routes/*.ts`): keep it thin — parse input, call a `packages/shared` domain function or a `Repo` method, return the result. Add an HTTP-level test in `apps/api/src/app.test.ts` if the change affects cross-cutting auth/lifecycle behavior (not needed for pure CRUD plumbing).
- **The D1 schema** (`apps/api/migrations/*.sql`): add a new numbered migration file; never edit a migration that may already be applied anywhere. Keep `docs/ERS.md` §4 in sync if the shape of a table changes.
- **The Repo interface** (`apps/api/src/repo/types.ts`): update both `d1Repo.ts` (real) and `memoryRepo.ts` (test double) together — tests run against the in-memory repo and must keep passing.
- **Anything role/org/lifecycle/visibility-shaped in the frontend** (e.g. deciding whether to show a "Publish" button): reuse the same `packages/shared` predicate the backend uses (see `apps/web/src/pages/Store.tsx` and `MyLibrary.tsx` for the pattern) instead of re-deriving the logic in a component.
- **A release**: bump the version in three places together — `apps/web/src/lib/version.ts`, `apps/api/wrangler.toml` (`APP_VERSION`), and the three `package.json` files. There's no automated bump script yet.

## Commands

```bash
npm install            # from repo root — installs all workspaces
npm test                # all workspaces' Vitest suites
npm run typecheck       # tsc --noEmit across all workspaces
npm run dev:api         # apps/api via wrangler dev
npm run dev:web         # apps/web via vite (proxies /api to :8787)
```

## Open items to flag, not silently resolve

These are recorded as open questions in `docs/ERS.md` §16 — if a task touches one, surface the ambiguity to the user rather than guessing:
- Max GLB file size / total catalog size assumptions.
- Whether the public Store should ever hide specific metadata fields per organization.
- Whether artifact CSV bulk-import is in scope (only user CSV import is currently speced, per the Simtryx reference).
- Whether Unreal needs offline/cached GLBs vs. always-live fetch.
