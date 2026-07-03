# VestoXR Manager

A GLB CRUD/CMS platform for digitizing archaeological artifacts, built on Cloudflare (Workers + D1 + R2 + Pages), with a public API that Unreal Engine consumes to pull models into experiences at runtime.

Start here:
- **Requirements**: [docs/ERS.md](docs/ERS.md) — full Engineering Requirements Specification (data model, roles, lifecycle, API contract, design system).
- **Decisions**: [docs/adr/](docs/adr/README.md) — why the stack, auth flow, multi-tenancy model, lifecycle, metadata schema, API-key/signed-URL scheme, monorepo, and test strategy are shaped the way they are.
- **Agent/contributor rules**: [CLAUDE.md](CLAUDE.md).

## Structure

```
apps/
  web/       Vite + React + TS + Tailwind — the admin/store frontend
  api/       Cloudflare Worker (Hono) — the REST API, backed by D1 + R2
packages/
  shared/    Framework-free domain types + business-rule functions (RBAC,
             artifact lifecycle, visibility, custom fields, API key scope),
             each with its own Vitest suite — imported by both apps/api and
             apps/web so the rules never drift between backend and frontend.
migrations/  (inside apps/api/migrations) — D1 schema
docs/
  ERS.md     Engineering Requirements Specification
  adr/       Architecture Decision Records
```

## Setup

```bash
npm install
```

## Running tests

```bash
npm test              # runs every workspace's Vitest suite
npm run typecheck      # tsc --noEmit across all workspaces
```

The bulk of business-rule coverage lives in `packages/shared/src/domain/*.test.ts` (pure unit tests — no D1/Miniflare needed). `apps/api/src/app.test.ts` adds HTTP-level tests proving the route handlers actually enforce those rules end-to-end (see ADR 0008).

## Running locally

```bash
# Terminal 1 — API (Cloudflare Worker, local Miniflare via Wrangler)
npm run dev:api

# Terminal 2 — frontend (Vite dev server, proxies /api to the Worker on :8787)
npm run dev:web
```

First-time API setup:
```bash
cd apps/api
wrangler d1 create vestoxr-db        # then paste the returned database_id into wrangler.toml
npm run db:migrate:local
wrangler secret put JWT_SECRET       # any long random string, for local dev only
```

## Deploying

- **API**: `npm run deploy --workspace @vestoxr/api` (requires a real D1 database + R2 bucket provisioned in your Cloudflare account, and `JWT_SECRET` set via `wrangler secret put`).
- **Web**: connect `apps/web` to Cloudflare Pages (build command `npm run build`, output directory `dist`), or `npx wrangler pages deploy dist`.

## Versioning

The app version is tracked in three places that should move together on every release:
- `apps/web/src/lib/version.ts` (`APP_VERSION`) — shown in the sidebar footer (`v0.1.0`).
- `apps/api/wrangler.toml` (`APP_VERSION` var) — returned by `GET /health`.
- `package.json` versions in `apps/web`, `apps/api`, `packages/shared`.

There's no automated release/bump script yet — bump all three by hand until that's worth automating.
