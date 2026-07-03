# 0001 — Cloudflare-native stack (Workers + D1 + R2 + Pages)

## Status
Accepted — 2026-07-03

## Context
VestoXR Manager needs: a hosted API, a relational store for users/orgs/artifact metadata, binary storage for GLB files (potentially large, many per organization), and a hosted frontend. The explicit constraint from the project owner was **minimum operating cost**, ideally on a single vendor to avoid cross-cloud egress fees and multiple bills.

## Decision
Run the entire stack on Cloudflare:
- **Cloudflare Workers** (Hono router) for the API.
- **Cloudflare D1** (SQLite) for all relational data (users, organizations, artifacts, metadata, custom fields, API keys, audit log).
- **Cloudflare R2** for GLB binaries and thumbnails.
- **Cloudflare Pages** for the Vite/React frontend.

## Consequences
- **Positive:** no idle cost (pay-per-request/storage), no R2 egress fees (unlike S3), one vendor/bill, edge latency for the Worker, free SSL + hosting for Pages.
- **Negative:** D1 is SQLite-based — no native `JSONB`, weaker concurrent-write guarantees than Postgres, and row-level scaling ceilings exist (acceptable at this project's expected scale: metadata rows, not GLB bytes, live in D1). Vendor lock-in to Cloudflare's APIs (R2 presigned URLs, D1 driver, Workers runtime) — acceptable trade for the cost profile.
- Local dev requires `wrangler dev` + D1 local emulation; the team must standardize on Wrangler tooling.

## Alternatives considered
- **Node/Express + Postgres + R2 (S3-compatible API):** more familiar tooling and stronger relational guarantees, but requires hosting a server somewhere (not free) and adds a second vendor for compute.
- **Supabase (Postgres + Auth) + R2 for files:** offloads auth/DB ops, but introduces a second vendor bill and reduces control over the custom approval-queue auth flow required here.

Both were rejected primarily on cost and "one vendor" grounds per explicit product direction.
