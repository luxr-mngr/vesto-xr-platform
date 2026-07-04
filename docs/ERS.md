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

- **Upload:** Curator/Assistant selects a GLB (client validates extension + max size, e.g. 200 MB soft limit for v1) and fills in the fixed metadata form + any applicable custom fields. File is uploaded directly to R2 via a **pre-signed PUT URL** issued by the Worker (keeps large binaries off the Worker's request path).
- **Draft:** editable freely by its creator (and any Curator/Admin in the org).
- **Submit for review:** status → `pending_review`; appears in the org's review queue for Curators/Admins.
- **Publish:** Curator/Admin sets `visibility` (`private` = org-only "My Library"; `public` = also appears in the shared **Store**) and status → `published`.
- **Reject:** returns to `draft` with a required reviewer comment (stored in `audit_log`).
- **Delete:** soft-delete (status flag) recommended so R2 objects aren't orphaned without a cleanup pass; hard delete removes the R2 object + DB row (Admin/Curator only).
- **Thumbnail:** generated client-side (render GLB off-screen, capture canvas, upload PNG) at upload time in v1 to avoid needing a server-side 3D renderer.

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
- Checksums (`checksum_sha256`) and presigned PUT for uploads remain open items — not implemented in the current scaffold.

---

## 11. Public/External API (for Unreal Engine & integrations)

Base URL: `https://api.vestoxr.com/api/v1/`

**Auth:** Every external request sends `Authorization: Bearer <org_api_key>`. Keys are created/revoked by a Curator/Admin in the org's settings screen, shown once in full, stored as a hash server-side. Each key is scoped to:
- read access to its own organization's artifacts (any status the org allows, typically published), and
- read access to the global public **Store**.

| Method | Path | Description |
|---|---|---|
| `GET` | `/artifacts` | List/search artifacts. Query params: `q`, `organization`, `culture_period`, `material`, `tags`, `page`, `page_size`. Returns Store + own-org results depending on key scope. |
| `GET` | `/artifacts/:id` | Full metadata (fixed + custom fields) for one artifact. |
| `GET` | `/artifacts/:id/download` | Returns `{ url, expires_at }` — a short-lived signed R2 GET URL for the `.glb` binary. Unreal plugin fetches this, then downloads the file directly from R2. |
| `GET` | `/artifacts/:id/thumbnail` | Same pattern, for the PNG preview. |
| `GET` | `/organizations/:slug` | Public org profile (name only, no user data). |

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
- Rate limiting on `/auth/login` and the public API (Cloudflare Workers rate limiting or a D1-backed counter) to deter brute force / scraping.
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
- Full draft → pending_review → published/rejected pipeline with reviewer comments.
- Custom field definitions (Admin) + custom field inputs on upload/edit.
- Audit log UI, CSV import for bulk artifact/user creation (mirrors "Importar CSV" in the reference).

**Phase 3 — Polish & Unreal Integration Hardening**
- Search/filter facets on Store (culture, period, material, tags, org).
- Unreal Engine sample plugin/README demonstrating auth + list + download flow.
- Rate limiting, thumbnail generation improvements, password-reset emails.

---

## 16. Open Questions
1. ~~Exact LUXR CORE brand hex codes / logo assets~~ — resolved: palette and typography extracted from provided `luxrcore.com` dark/light screenshots, see §12.1. Exact hex values are close approximations from the screenshots; grab final design-token values from Figma/CSS if pixel-perfect matching is required later.
2. Max GLB file size limit and expected total catalog size (affects R2 cost planning and whether a CDN cache layer is worth adding later).
3. Should the public Store hide any fixed/custom metadata fields per-organization (e.g., sensitive provenance info), or is everything published always fully visible?
4. Is a CSV bulk-import needed for artifacts (not just users) in Phase 1, given the reference screenshot's "Importar CSV" feature is currently scoped to users only?
5. Any requirement for offline/cached access in Unreal (bundle GLBs at build time vs always fetch live at runtime)?
