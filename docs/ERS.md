# VestoXR Manager — Engineering Requirements Specification

**Version:** 0.1 (Draft)
**Date:** 2026-07-03
**Owner:** LUXR CORE
**Status:** For review

---

## 1. Purpose & Summary

VestoXR Manager is a web platform for digitizing, cataloguing, and distributing 3D archaeological artifacts as GLB files. Institutions ("organizations") upload GLBs, enrich them with archaeological metadata, and publish them either privately (org-only) or to a shared public library. A REST API exposes approved GLBs and their metadata so that external tools — primarily **Unreal Engine**, via an HTTP plugin — can browse, query, and download artifacts at runtime.

The system borrows its admin UX pattern from `platform.simtryx.com/admin` (minimalist tables, toggle switches, inline role dropdowns, license-style stat bar) and its visual identity from `luxrcore.com`.

### 1.1 Goals
- Simple email/password auth with an **admin-gated approval queue** for new accounts (mirrors the Simtryx flow).
- Role-based access: **Admin**, **Curator**, **Assistant**.
- Multi-tenant **organizations**, each owning and managing their own artifacts.
- A **public library** ("Store") where every organization's *published* artifacts are visible to all users, plus a **"My Library"** view scoped to the logged-in user's organization (including drafts/pending items).
- CRUD for GLB assets with a **draft → pending review → published** workflow.
- A rich, admin-extensible **metadata schema** tailored to archaeological digitization.
- Cloudflare-native storage and hosting, optimized for minimum cost.
- A stable, versioned **public API** (API-key authenticated) for Unreal Engine and other external consumers to list/search/download GLBs.

### 1.2 Non-Goals (v1)
- In-browser 3D editing/annotation of GLBs (viewing/preview only).
- Real-time collaborative editing of metadata.
- Billing/subscription management (organizations are provisioned manually by an Admin).
- Full dynamic schema builder (custom fields are simple key/value additions in v1, not typed field definitions with validation rules).

---

## 2. Tech Stack

Chosen to stay **entirely on Cloudflare's free/low-cost tier** as long as possible.

| Layer | Choice | Notes |
|---|---|---|
| Frontend | **Vite + React + TypeScript** | SPA, deployed to **Cloudflare Pages** |
| UI styling | Tailwind CSS | Matches the flat, minimal Simtryx look cheaply |
| Backend/API | **Cloudflare Workers** (TypeScript, Hono router) | One Worker, versioned routes (`/api/v1/...`) |
| Database | **Cloudflare D1** (SQLite at the edge) | Users, orgs, roles, artifact metadata, custom fields, API keys, audit log |
| File storage | **Cloudflare R2** | GLB binaries + generated thumbnails/preview images |
| Auth | Custom email/password, session via **signed JWT in httpOnly cookie** | No third-party auth vendor → zero extra cost |
| Background tasks (thumbnail extraction, etc.) | Cloudflare Queues (optional, phase 2) | Deferred until needed |
| Email (approval notifications) | Cloudflare Email Workers or a free-tier transactional provider (e.g. Resend free tier) | Only for "your account was approved" / "reset password" emails |

**Why this stack:** Workers + D1 + R2 have no idle cost (pay-per-request/storage), Pages hosting is free for the frontend, and everything lives in one Cloudflare account/bill — no cross-vendor latency or separate infra to operate.

### 2.1 Repos / Package Layout
```
VestoXR-Manager/
├─ apps/
│  ├─ web/              # Vite + React admin & public app
│  └─ api/               # Cloudflare Worker (Hono) - the backend
├─ packages/
│  └─ shared/            # Shared TS types (Artifact, User, Role, MetadataSchema, ApiKey…)
├─ migrations/           # D1 SQL migrations
└─ docs/
   └─ ERS.md             # this document
```
A monorepo (npm/pnpm workspaces) keeps shared types between the Worker and the Vite app in sync without publishing a package.

---

## 3. Architecture Overview

```
                         ┌────────────────────────┐
                         │   Cloudflare Pages      │
                         │   (Vite + React SPA)    │
                         │   admin.vestoxr.com     │
                         └───────────┬────────────┘
                                     │ fetch (cookie/session)
                                     ▼
                         ┌────────────────────────┐
                         │   Cloudflare Worker     │
                         │   api.vestoxr.com       │
                         │   (Hono routes, JWT     │
                         │    auth, RBAC middleware)│
                         └───────┬────────┬────────┘
                                 │        │
                     ┌───────────┘        └───────────┐
                     ▼                                ▼
           ┌──────────────────┐              ┌──────────────────┐
           │  Cloudflare D1    │              │  Cloudflare R2    │
           │  (users, orgs,    │              │  (GLB files,      │
           │   artifacts,      │              │   thumbnails)     │
           │   metadata, keys) │              │                    │
           └──────────────────┘              └──────────────────┘
                                                        ▲
                                                        │ signed download URL
                                                        │
                                             ┌──────────────────────┐
                                             │   Unreal Engine       │
                                             │   HTTP plugin         │
                                             │   (org API key)       │
                                             └──────────────────────┘
```

Two consumers hit the same Worker API:
1. The **web app** (session-cookie auth) for humans (admins/curators/assistants) managing content.
2. **External integrations** (API-key auth), e.g. Unreal Engine, for read-only listing/search/download.

---

## 4. Data Model (D1 schema, logical)

```
organizations
 ├─ id (uuid, pk)
 ├─ name
 ├─ slug (unique)
 ├─ created_at

users
 ├─ id (uuid, pk)
 ├─ email (unique)
 ├─ password_hash
 ├─ role            -- 'admin' | 'curator' | 'assistant'
 ├─ organization_id (fk → organizations.id, nullable for admin)
 ├─ status          -- 'pending' | 'active' | 'disabled'
 ├─ created_at
 ├─ last_login_at
 ├─ login_count

artifacts
 ├─ id (uuid, pk)
 ├─ organization_id (fk)
 ├─ created_by (fk → users.id)
 ├─ title
 ├─ description          -- short free text, shown on Artifact Detail and the public showcase (§11.4)
 ├─ glb_r2_key           -- storage path in R2
 ├─ thumbnail_r2_key     -- generated preview image (nullable)
 ├─ file_size_bytes
 ├─ checksum_sha256
 ├─ visibility           -- 'private' | 'public'   (org-only vs shared library)
 ├─ status               -- 'draft' | 'pending_review' | 'published' | 'rejected'
 ├─ reviewed_by (fk → users.id, nullable)
 ├─ reviewed_at
 ├─ created_at
 ├─ updated_at

artifact_metadata            -- fixed archaeological schema, 1:1 with artifact
 ├─ artifact_id (fk, pk)
 ├─ site_name
 ├─ culture_period
 ├─ material
 ├─ dimensions             -- e.g. "12.4 x 8.1 x 3.2 cm"
 ├─ weight_grams
 ├─ dating_method
 ├─ estimated_date          -- free text, e.g. "800-1200 CE"
 ├─ excavation_date
 ├─ provenance
 ├─ condition
 ├─ catalog_id              -- institution's own inventory number
 ├─ description
 ├─ tags                    -- JSON array

artifact_custom_fields       -- admin-defined key/value extensions, N:1 with artifact
 ├─ id (pk)
 ├─ artifact_id (fk)
 ├─ field_key               -- must exist in custom_field_definitions
 ├─ field_value

custom_field_definitions     -- admin-managed catalog of extra fields
 ├─ id (pk)
 ├─ key (unique)
 ├─ label
 ├─ field_type              -- 'text' | 'number' | 'date' | 'boolean'
 ├─ is_public_showcase      -- opt-in: may this field's value appear on the unauthenticated public showcase (§11.4)?
 ├─ created_by (fk → users.id)
 ├─ created_at

api_keys
 ├─ id (pk)
 ├─ organization_id (fk)
 ├─ key_hash                -- store hash only, show raw key once on creation
 ├─ label
 ├─ created_by (fk → users.id)
 ├─ created_at
 ├─ last_used_at
 ├─ revoked_at (nullable)

audit_log
 ├─ id (pk)
 ├─ actor_user_id (fk, nullable)
 ├─ action                  -- 'user_approved', 'artifact_published', 'key_revoked', …
 ├─ target_type / target_id
 ├─ metadata (JSON)
 ├─ created_at
```

Notes:
- Only **Admin** can create rows in `custom_field_definitions` — this is the "admin creates new fields for GLB uploaded" requirement.
- `artifacts.visibility` + `status` together drive what shows in the **Store** (public) vs **My Library** (org-scoped): a row is Store-visible only when `visibility = 'public' AND status = 'published'`.

---

## 5. Roles & Permissions

| Capability | Admin | Curator | Assistant |
|---|---|---|---|
| Approve/disable user accounts | ✅ | ❌ | ❌ |
| Assign roles & organizations | ✅ | ❌ | ❌ |
| Create organizations | ✅ | ❌ | ❌ |
| Create/edit custom field definitions | ✅ | ❌ | ❌ |
| Upload GLB + fixed metadata | ✅ (any org) | ✅ (own org) | ✅ (own org) |
| Edit GLB metadata | ✅ | ✅ (own org) | ✅ (own uploads, while draft) |
| Submit artifact for review | ✅ | ✅ | ✅ |
| Approve/reject → publish artifact | ✅ | ✅ (own org's queue) | ❌ |
| Delete artifact | ✅ | ✅ (own org) | ❌ |
| Manage org's API keys | ✅ | ✅ (own org) | ❌ |
| View public Store | ✅ | ✅ | ✅ |
| View My Library (own org, incl. drafts) | ✅ | ✅ | ✅ (own uploads only) |

**Assistant** uploads are always created with `status = 'draft'` and cannot self-transition to `pending_review` beyond their own items becoming visible to a Curator/Admin for review — i.e., assistants can prepare content but a Curator or Admin must move it forward.

---

## 6. Authentication & Account Approval Flow

1. **Sign up** — user submits email + password (`POST /api/v1/auth/register`). Account is created with `status = 'pending'`, no organization assigned yet, no role assigned yet (or a default lowest-privilege placeholder).
2. **Pending state** — user cannot log in (or logs in to a "waiting for approval" screen only) until an Admin acts.
3. **Admin review** — in **Administración**, pending users appear in the same table as active ones (matching the Simtryx screenshot), with the Estado toggle disabled/greyed until the Admin assigns:
   - a **role** (Admin / Curator / Assistant), and
   - an **organization** (not required for Admin).
   Setting these and flipping the toggle moves `status → 'active'`.
4. **Login** — active users authenticate via `POST /api/v1/auth/login`; on success the Worker issues a signed JWT set as an httpOnly, Secure, SameSite=None cookie (the web app and API are deployed on separate origins — Pages vs. Workers — so the cookie must be sendable cross-site; `SameSite=Lax` would silently drop it on every `fetch` other than a top-level navigation). Session length: 7 days, refreshed on activity.
5. **Disable** — Admin can flip status back to `'disabled'` at any time (same toggle), immediately invalidating future requests (checked server-side per request, not just at login).
6. **Password reset** — standard email-token flow (deferred to phase 2 if email sending isn't wired up yet; phase 1 can support Admin-triggered manual reset).

Passwords are hashed with **scrypt/bcrypt** (Workers-compatible via `@node-rs/bcrypt` alternative or WebCrypto-based scrypt) — never stored in plaintext, never logged.

---

## 7. Artifact (GLB) Lifecycle

```
 [draft] --submit for review--> [pending_review] --approve--> [published]
    ▲                                  │
    └───────────reject/edit────────────┘
```

- **Upload:** Curator/Assistant selects a GLB (client validates extension + max size, 200 MB soft limit for v1 — enforced both client-side before upload and server-side via `Content-Length` on `PUT /artifacts/:id/glb`, see `MAX_GLB_SIZE_BYTES` in `packages/shared`) and fills in the fixed metadata form + any applicable custom fields. **Implemented as direct-through-Worker streaming**, not a presigned R2 PUT — see §10 note.
- **Draft:** editable freely by its creator (and any Curator/Admin in the org).
- **Submit for review:** status → `pending_review`; appears in the org's review queue for Curators/Admins.
- **Publish:** Curator/Admin sets `visibility` (`private` = org-only "My Library"; `public` = also appears in the shared **Store**) and status → `published`.
- **Reject:** returns to `draft` with a required reviewer comment (stored in `audit_log`). **Not yet implemented**: the reject route (`POST /artifacts/:id/reject`) transitions status only; there's no comment field/route yet.
- **Delete:** soft-delete (status flag) recommended so R2 objects aren't orphaned without a cleanup pass; hard delete removes the R2 object + DB row (Admin/Curator only).
- **Thumbnail (implemented):** generated client-side — a throwaway off-screen `<model-viewer>` renders the just-picked GLB, `toBlob()` captures a PNG once the "load" event fires, and the PNG is uploaded via `PUT /artifacts/:id/thumbnail` (same direct-through-Worker streaming pattern as the GLB itself, `apps/web/src/pages/MyLibrary.tsx`). No server-side 3D renderer involved.

---

## 8. Metadata Schema (Archaeological Digitization)

### 8.1 Fixed fields (always present, defined in section 4)
`site_name, culture_period, material, dimensions, weight_grams, dating_method, estimated_date, excavation_date, provenance, condition, catalog_id, description, tags`

These map to common museum/archaeology cataloguing standards (loosely aligned with Dublin Core / CIDOC-CRM concepts like object type, material, period, provenance) without requiring a full ontology in v1.

### 8.2 Custom fields (Admin-managed)
- Admin defines a **global catalog** of additional field keys (`custom_field_definitions`): label, type (`text`/`number`/`date`/`boolean`).
- Any Curator/Assistant filling out an artifact's metadata sees the current custom-field catalog as optional extra inputs.
- Values are stored per-artifact in `artifact_custom_fields`.
- Rationale for "global catalog, not per-artifact free-form": keeps the Store filterable/searchable (you can facet-search "Dynasty = Ming" across all orgs) instead of every artifact inventing its own key names.

---

## 9. Organizations & Visibility Model

- Every non-admin user belongs to exactly one **organization**.
- Organizations fully own their artifacts: only their own Curators/Admins can edit/publish/delete them.
- **Store** (public library): all users (any org, any role) can browse `published` + `public` artifacts from *every* organization — read-only, no edit controls, optionally shows organization/attribution and a filtered set of metadata (e.g. hide internal `catalog_id` or `provenance` notes if an org marks them sensitive — flag deferred to phase 2 if needed).
- **My Library**: scoped to the logged-in user's organization; shows all statuses (draft/pending/published/rejected) and the internal review queue.
- Admin has a global view across all organizations plus the org/user management screens.

---

## 10. Storage Layout (Cloudflare R2)

```
r2://vestoxr-assets/
 └─ {organization_slug}/
     └─ {artifact_id}/
         ├─ model.glb
         └─ thumbnail.png
```

- Bucket is **private** (no public bucket access); all reads go through the Worker.
- **Web app uploads/downloads (implemented):** `PUT /api/artifacts/:id/glb` and `GET /api/artifacts/:id/glb` stream the GLB directly through the Worker's `BUCKET` (R2Bucket) binding, gated by the same `artifact.editMetadata` / `canView` checks as the rest of the artifact API — no presigned URL round trip. This is a deliberate simplification vs. the presigned-PUT sketch below: the app only has an R2Bucket binding (no S3-compatible access keys), and Workers can stream a request body straight into R2 without buffering it, so a direct-through-Worker PUT/GET is sufficient at this scale and keeps auth in one place.
- **External API downloads (Unreal, not yet implemented):** still expected to use short-lived presigned R2 GET URLs (§11 `/artifacts/:id/download`) once that endpoint is built, since external clients shouldn't hold a session cookie.
- Checksums (`checksum_sha256`) and presigned PUT for uploads remain open items — not implemented in the current scaffold. The 200MB soft size limit **is** enforced now (client-side before upload, and server-side via `Content-Length` on the PUT route).

---

## 11. Public/External API (for Unreal Engine & integrations)

See [UNREAL_INTEGRATION.md](UNREAL_INTEGRATION.md) for the client-side consumption flow (auth, the two-step download, a worked C++ example) — this section is the contract; that doc is how to actually call it from an Unreal project.

Base URL: `https://api.vestoxr.com/api/v1/`

**Auth:** Every external request sends `Authorization: Bearer <org_api_key>`. Keys are created/revoked by a Curator/Admin in the org's settings screen, shown once in full, stored as a hash server-side. Each key is scoped to:
- read access to its own organization's artifacts (any status the org allows, typically published), and
- read access to the global public **Store**.

| Method | Path | Description |
|---|---|---|
| `GET` | `/artifacts` | List/search artifacts. Query params: `q`, `organization`, `culture_period`, `material`, `tags`, `page`, `page_size`. Returns Store + own-org results depending on key scope. |
| `GET` | `/artifacts/:id` | Full metadata (fixed + custom fields) for one artifact. |
| `GET` | `/artifacts/:id/download` | Returns `{ url, expires_at }` — a short-lived signed R2 GET URL for the `.glb` binary. Unreal plugin fetches this, then downloads the file directly from R2. |
| `GET` | `/artifacts/:id/thumbnail` | **Implemented.** Same pattern, for the PNG preview. |
| `GET` | `/organizations/:slug` | Public org profile (name only, no user data). **Not yet implemented.** |

**Second auth mode — per-user Store access (implemented):** for read-only viewer clients (e.g. a VR visualizer) where embedding one shared org API key in a distributed client isn't the right fit, any active user (any role/org) can instead authenticate as themselves and browse/download only the public **Store** — not their own organization's private library.

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/session/login` | Body `{ email, password }`. Returns `{ token, expires_at, user }` — a 7-day bearer token, independent of both the web app's httpOnly session cookie and the org-scoped API key. Rate-limited like `/auth/login` (10/min/IP). |
| `GET` | `/v1/store/artifacts` | `Authorization: Bearer <user token>`. Lists only `published` + `public` artifacts, from any organization. |
| `GET` | `/v1/store/artifacts/:id` | Same auth/scope as above; `404` for anything not Store-visible (including the caller's own org's drafts). |
| `GET` | `/v1/store/artifacts/:id/download` / `/thumbnail` | Same signed-URL pattern as the API-key flow — both flows share the one `/v1/download/:token` redemption route. |

This is a narrower, separate surface from the org-API-key routes above (Store-only, no write access, can't reach a caller's own private/draft artifacts) — deliberately not implemented by teaching the web app's cookie-based `requireAuth` to also accept a header, so a token meant only for a read-only Store viewer can never be replayed against the admin app's write routes. See [UNREAL_INTEGRATION.md](UNREAL_INTEGRATION.md) for when to use this vs. the org API key.

### 11.4 Public showcase (no auth at all — demo day)

A third, even narrower read surface (ADR 0009), for a walk-up "presentation" web view of the catalog with **no login of any kind** — meant for a demo-day booth screen or a visitor's own phone.

| Method | Path | Description |
|---|---|---|
| `GET` | `/public/showcase/artifacts` | No auth. Same `published` + `public` scope as the Store. Each entry is `{ id, title, description, hasGlb, hasThumbnail, fields }`, where `fields` is only the subset of the global custom-field catalog an admin has flagged `isPublicShowcase` — the rest of the catalog (e.g. internal condition/provenance notes) stays hidden even on an otherwise-public artifact. |
| `GET` | `/public/showcase/artifacts/:id/thumbnail` / `/glb` | No auth. Streams the binary directly; `404` unless the artifact is Store-visible. |

Rate-limited per source IP (300 req/min) rather than per credential, since there is no credential — generous enough for a kiosk auto-advancing through a whole catalog, bounded enough to deter scraping. This surface is intentionally never more permissive than the Store: it uses the exact same `isStorePublic` predicate, just without requiring the visitor to have an account at all.

The frontend's `/showcase` route (§12) is the one built-in consumer, but the shape is generic enough for an embed on an external event page if needed later.

Internal (session-cookie authenticated) endpoints for the admin app mirror CRUD needs: `/auth/*`, `/users/*`, `/organizations/*`, `/artifacts/*` (POST/PATCH/DELETE + `/submit`, `/approve`, `/reject`), `/custom-fields/*`, `/api-keys/*`.

API is versioned (`/v1/`) from day one so the Unreal plugin's contract can evolve without breaking older shipped builds.

---

## 12. Frontend (Vite + React) — Screens

Matching the Simtryx reference for structure and tone (left sidebar nav, flat cards, table with inline dropdowns/toggles), restyled with LUXR CORE brand colors.

1. **Login / Register** — centered card, email + password, "forgot password" link, "no account? Register" — same layout as the provided screenshot.
2. **Pending approval screen** — shown post-registration until an Admin activates the account.
3. **Dashboard / Inicio** — quick stats (artifacts total, published, pending review, org's storage used).
4. **Store** (public library) — grid of published artifacts across all orgs, filters by culture/period/material/org, search.
5. **My Library** — org-scoped grid with status badges (draft/pending/published/rejected), upload button, review queue for Curators/Admins.
6. **Artifact Detail** — GLB preview (e.g. `<model-viewer>` web component), fixed metadata panel, custom fields panel, status/history, publish/reject actions (role-gated).
7. **Upload/Edit Artifact** — file picker, fixed-field form, dynamic custom-field inputs pulled from the current catalog.
8. **Administración** — near-identical structure to the reference screenshot: user table (email, role dropdown, org dropdown, created/last-access/access-count, status toggle, delete), "Agregar Usuario" / "Importar CSV" actions, license-style stat bar repurposed as **org/storage stats**.
9. **Custom Fields** (Admin only) — simple table to add/rename/retire metadata field definitions.
10. **API Keys** (Curator/Admin) — per-org key list, create (show-once), revoke.
11. **Organizations** (Admin only) — create/rename organizations, see member counts.
12. **Showcase** (`/showcase`, no login) — kiosk/presentation view for demo-day: one large auto-rotating 3D piece at a time (title, description, admin-flagged public custom fields), next/prev + play/pause controls, auto-advances through the full public catalog on a loop (§11.4).

### 12.1 Visual Design

Layout/interaction pattern (tables, toggles, dropdowns, stat bars) follows the Simtryx admin reference; color and typography follow LUXR CORE's actual brand (extracted from `luxrcore.com` screenshots, dark and light mode).

**Color tokens**

| Token | Dark mode | Light mode |
|---|---|---|
| `bg` (page background) | `#08090D` (near-black, faint navy) | `#F3F4FA` (soft lavender-white) |
| `surface` (cards/inputs) | `#101218` | `#FFFFFF` |
| `border` | `rgba(255,255,255,0.08)` | `rgba(11,12,20,0.08)` |
| `text-primary` (headings) | `#F5F6FA` | `#0B0C14` |
| `text-secondary` (body/labels) | `#9AA0AE` | `#6B7280` |
| `accent` (brand blue — links, primary buttons, active states, bullets) | `#3D5AFE` | `#3D5AFE` |
| `accent-gradient` | linear-gradient `#5B7CFA → #3D5AFE` (used on hero-style CTAs / highlighted words) | same |
| `radial glow` (decorative background accent, used sparingly behind hero/CTA sections) | soft indigo radial `rgba(61,90,254,0.25)` fading to transparent | soft lavender radial `rgba(61,90,254,0.12)` |

The accent blue (`#3D5AFE`-ish "LUXR Blue") is the *only* saturated color in the system — everything else is near-neutral grayscale/navy, exactly like the reference site. Use it for: primary buttons, active nav underline, active toggle state, active filter pill (e.g. "XR Experience" pill pattern → reusable for role/status filter pills in the admin table), links, list bullets, and small uppercase tracked labels (e.g. "OUR MISSION", "WHAT WE DO" style eyebrows — reused for section eyebrows like "ARTIFACT STATUS" or "ORGANIZATION").

Admin CRUD screens (user/artifact tables) should stay closer to the Simtryx reference's density and neutrality — mostly grayscale surfaces — and use the accent blue only for primary actions and active/selected states, not decoratively (the glow/gradient treatment is for marketing-style pages like login/landing, not dense data tables).

**Typography**
- Not using LUXR CORE's site typography (serif display font) for this app — VestoXR Manager is a dense CRUD/admin tool, not a marketing site, so it uses a single clean grotesque sans (e.g. Inter) throughout: headings, body, tables, forms, and eyebrow/section labels alike (uppercase, letter-spaced, in `accent` blue for the label style only).
- Only the **color system** (§ color tokens above) and general minimal/flat layout language carry over from LUXR CORE and Simtryx; typography is intentionally its own, simpler system.
- Logo: use a plain "VestoXR" wordmark (sans, bold) in the sidebar/nav — no serif, no borrowed glyph/sparkle accent from the LUXR CORE mark.

Both dark and light modes are already proven brand variants (confirmed via the provided screenshots), so the admin app should ship with a **theme toggle** (dark default, matching Simtryx's dark sidebar reference merged with LUXR's dark-mode palette) rather than committing to only one.

---

## 13. Security Considerations
- Passwords hashed (never reversible); JWT signed with a Worker secret (`wrangler secret`), rotated periodically.
- Role and organization checks enforced **server-side on every request** (never trust client-sent role/org).
- R2 bucket has no public access; all file delivery is via time-limited signed URLs.
- API keys stored as salted hashes; raw key shown exactly once at creation.
- **Rate limiting (implemented):** a fixed-window D1-backed counter (`rate_limit_hits` table, `apps/api/src/middleware/rateLimit.ts`) gates `POST /auth/login` (10 req/min per source IP) and the whole public `/v1/*` API (120 req/min per API key) to deter brute force / scraping.
- Audit log for account approvals, role changes, publishes, key creation/revocation.
- CORS locked to the known frontend origin(s) + explicitly open for the download endpoints Unreal needs (or Unreal calls the API directly, not from a browser context, so CORS is largely a non-issue there).

---

## 14. Cost Model (why this stack is cheap)
- **Workers:** 100k requests/day free, then $0.30/million.
- **D1:** 5GB storage + 5M row reads/day free tier — ample for metadata at this scale.
- **R2:** no egress fees (unlike S3), $0.015/GB-month storage — GLBs are the only real cost driver, scales with content volume not traffic.
- **Pages:** free static hosting + free SSL for the Vite app.
- No third-party auth/DB vendor bills. Total infra cost at moderate scale: likely low single-digit dollars/month until artifact/download volume becomes large.

---

## 15. Phased Delivery Plan

**Phase 1 — Core CRUD & Auth (MVP)**
- D1 schema + migrations, Worker skeleton (Hono), JWT auth, register/pending/approve flow.
- Admin screen (users table matching reference), role + org assignment.
- Artifact upload (presigned R2 PUT), fixed metadata form, draft/publish/private-public toggle (no review step yet — Admin/Curator publish directly).
- Store + My Library grids, artifact detail with `<model-viewer>` preview.
- Public API v1 (list, detail, download) + per-org API key management.

**Phase 2 — Review Workflow & Extensibility**
- Draft → pending_review → published/rejected pipeline — implemented; reviewer comments on reject are **not yet implemented** (no comment field/route).
- Custom field definitions (Admin) + custom field inputs on upload/edit — **implemented**: catalog CRUD plus a per-artifact values panel on Artifact Detail (`GET`/`PUT /artifacts/:id/custom-fields`), validated against the catalog via `validateCustomFieldValues`.
- Audit log UI, CSV import for bulk artifact/user creation (mirrors "Importar CSV" in the reference) — **not yet implemented**.

**Phase 3 — Polish & Unreal Integration Hardening**
- Search/filter facets on Store (culture, period, material, tags, org) — **not yet implemented**.
- Unreal Engine sample plugin/README demonstrating auth + list + download flow — **README done** ([UNREAL_INTEGRATION.md](UNREAL_INTEGRATION.md): auth model, the two-step download flow, a worked C++ example); no packaged/tested sample plugin yet.
- Rate limiting — **implemented** (§13). Thumbnail generation — **implemented** (§7, client-side capture). Password-reset emails — **not yet implemented**.

---

## 16. Open Questions
1. ~~Exact LUXR CORE brand hex codes / logo assets~~ — resolved: palette and typography extracted from provided `luxrcore.com` dark/light screenshots, see §12.1. Exact hex values are close approximations from the screenshots; grab final design-token values from Figma/CSS if pixel-perfect matching is required later.
2. Max GLB file size limit and expected total catalog size (affects R2 cost planning and whether a CDN cache layer is worth adding later).
3. Should the public Store hide any fixed/custom metadata fields per-organization (e.g., sensitive provenance info), or is everything published always fully visible? Partially addressed for the new unauthenticated public showcase only (§11.4): custom fields are opt-in globally via `isPublicShowcase`, but there is still no per-organization override — an org cannot show a field on the Store while hiding it from the showcase, or vice versa. Still open for the Store itself, which shows the full catalog to any authenticated viewer as before.
4. Is a CSV bulk-import needed for artifacts (not just users) in Phase 1, given the reference screenshot's "Importar CSV" feature is currently scoped to users only?
5. Any requirement for offline/cached access in Unreal (bundle GLBs at build time vs always fetch live at runtime)?
