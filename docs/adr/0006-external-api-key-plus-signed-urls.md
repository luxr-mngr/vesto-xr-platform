# 0006 — External API auth: per-org API key + short-lived signed R2 URLs

## Status
Accepted — 2026-07-03

## Context
Unreal Engine (and potentially other external tools) needs to list/search artifacts and download GLB binaries at runtime, without a human logging in through the web session-cookie flow. The R2 bucket must stay private (no public bucket access, § ERS 10) for security and to avoid uncontrolled egress.

## Decision
Split the concern in two:
- **Listing/search/detail** (`GET /artifacts`, `/artifacts/:id`) is authenticated with a long-lived **per-organization API key**, sent as `Authorization: Bearer <key>`. Keys are created/shown-once/revoked by Curators/Admins in the org's settings screen; only a hash is stored server-side.
- **The actual GLB/thumbnail bytes** are never served directly by the key-authenticated endpoint. Instead, `GET /artifacts/:id/download` returns a **short-lived signed R2 URL** (default TTL ~10 minutes); the Unreal plugin fetches that URL directly from R2.
- A key's authorization scope (`authorizeApiKeyAccess`) is a pure function: it can read its own organization's artifacts plus the global public Store, nothing else — same predicate style as the RBAC/lifecycle modules (0008).

## Consequences
- **Positive:** a leaked/committed-to-a-game-project API key can list/query metadata but cannot itself serve unlimited file downloads indefinitely — the signed URL's short TTL limits blast radius. Simple to embed in an Unreal plugin config (one static string) with a revoke path when a key needs to be rotated.
- **Negative:** slightly more moving parts than serving files directly from the keyed endpoint (two round trips: get signed URL, then fetch bytes). Accepted as the right trade for keeping the bucket private.

## Alternatives considered
- **Signed URLs minted by the web app only, no persistent API key:** removes the "static key in a shipped game build" risk entirely, but requires a live request to the authenticated web session to mint each URL — awkward for a standalone Unreal runtime with no human logged in. Rejected for this use case, but noted as viable for a future "web-app-triggered export" feature.
- **API key with direct file serving (no signed URL indirection):** simpler, but ties every download to the Worker's request/response cycle and removes the extra revocation safety margin the signed-URL indirection provides.
