# Deployment Guide — Cloudflare Setup & Migration

Step-by-step instructions to provision Cloudflare resources for VestoXR Manager and deploy/migrate the app. This is the operational companion to [ERS.md](ERS.md) section 9 (architecture) and [ADR 0001](adr/0001-cloudflare-native-stack.md) (why Cloudflare-only). Read those first if you're unsure *why* the stack looks like this — this doc only covers *how*.

## 0. Prerequisites

- A Cloudflare account (free tier is sufficient to start — see ERS section 14).
- Node.js + npm installed locally, repo cloned, `npm install` run from the repo root (npm workspaces — see [ADR 0007](adr/0007-monorepo-npm-workspaces.md)).
- Wrangler CLI (already a devDependency of `apps/api` — no separate global install needed; invoke it via `npx wrangler` or the npm scripts below).

Log in once per machine:

```bash
cd apps/api
npx wrangler login
```

This opens a browser to authorize the CLI against your Cloudflare account.

## 1. Create the D1 database

```bash
npx wrangler d1 create vestoxr-db
```

This prints a `database_id`. Copy it into [apps/api/wrangler.toml](../apps/api/wrangler.toml), replacing the placeholder:

```toml
[[d1_databases]]
binding = "DB"
database_name = "vestoxr-db"
database_id = "REPLACE_WITH_REAL_D1_DATABASE_ID"   # <- paste the real id here
migrations_dir = "migrations"
```

`wrangler.toml` is checked into git, so this id becomes shared config for the team/deploy pipeline — it is not a secret.

## 2. Create the R2 bucket

```bash
npx wrangler r2 bucket create vestoxr-assets
```

The binding is already declared in `wrangler.toml`:

```toml
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "vestoxr-assets"
```

No further edit needed unless you want a different bucket name (keep the binding name `BUCKET` — the code references it directly).

## 3. Run migrations

Local (for `npm run dev:api`, backed by Miniflare's local D1 emulation):

```bash
cd apps/api
npm run db:migrate:local
```

Remote (applies the same SQL files in `apps/api/migrations/*.sql` to the real D1 database created in step 1):

```bash
npx wrangler d1 migrations apply vestoxr-db --remote
```

Run this again any time a new numbered migration file is added (per CLAUDE.md: never edit an already-applied migration, always add a new numbered file).

## 4. Set secrets

`JWT_SECRET` is never committed (see the comment at the bottom of `wrangler.toml`). Generate and set one per environment:

```bash
cd apps/api
npx wrangler secret put JWT_SECRET
```

Paste a long random value when prompted (e.g. `openssl rand -base64 48`). For local dev, put the same variable in a `.dev.vars` file at `apps/api/.dev.vars` (already gitignored):

```
JWT_SECRET=some-local-only-value
```

## 5. Deploy the API (Worker)

```bash
cd apps/api
npm run deploy
```

This runs `wrangler deploy`, which reads `wrangler.toml` and publishes the Worker along with its D1/R2 bindings. Wrangler prints the deployed Worker URL (`https://vestoxr-api.<your-subdomain>.workers.dev` by default).

Bump `APP_VERSION` in `wrangler.toml` before a release if the change is user-visible (see CLAUDE.md's version-bump rule) — it's surfaced in the web UI's health/version indicator.

## 6. Deploy the web app (Cloudflare Pages)

The web app is a static Vite build with no Pages-specific config file yet — set it up once via the dashboard or CLI:

**Dashboard (recommended for first setup):**
1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**, select this repo.
2. Build settings:
   - **Build command:** `npm run build --workspace apps/web`
   - **Build output directory:** `apps/web/dist`
   - **Root directory:** `/` (build runs from repo root so the npm workspace resolves `@vestoxr/shared`)
3. Add an environment variable if the web app needs to know the deployed API origin (see step 7).

**CLI (subsequent manual deploys):**
```bash
npm run build --workspace apps/web
npx wrangler pages deploy apps/web/dist --project-name vestoxr-web
```

## 7. Point the web app at the deployed API

Locally, `apps/web/vite.config.ts` proxies `/api/*` to `http://localhost:8787` (the local `wrangler dev` Worker) — this proxy only applies to `vite dev` and does **not** exist in the production static build. Check `apps/web/src/lib/api.ts` for how the deployed build resolves the API base URL, and set that to your deployed Worker URL from step 5 (either hardcoded per environment, or via a Pages environment variable, matching whatever pattern `api.ts` currently expects) before shipping the Pages deploy.

## 8. Verify

- Hit the Worker's health/version endpoint directly to confirm `APP_VERSION` matches what you expect.
- Load the Pages URL, confirm login/register works end-to-end (exercises Worker → D1 → JWT secret).
- Upload a test artifact GLB and confirm it round-trips through R2.

## Ongoing migrations (after initial setup)

Whenever `apps/api/migrations/` gains a new file:

```bash
cd apps/api
npm run db:migrate:local                              # update local dev DB
npx wrangler d1 migrations apply vestoxr-db --remote   # update production DB
```

Then `npm run deploy` to ship the Worker code that depends on the new schema. Keep [ERS.md](ERS.md) section 4 in sync with any schema shape change, per CLAUDE.md.

## Open items

Per CLAUDE.md's "open items to flag" list, this guide does not resolve: max GLB/catalog size limits, whether Queues/Email Workers (ERS section 9, listed as phase 2/optional) are provisioned, or CI/CD automation for the deploy steps above — all deploys here are manual/local until that's decided.
