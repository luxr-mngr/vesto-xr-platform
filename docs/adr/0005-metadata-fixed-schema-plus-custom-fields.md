# 0005 — Fixed metadata schema + admin-managed global custom-field catalog

## Status
Accepted — 2026-07-03

## Context
Artifacts need archaeological metadata (site, culture/period, material, dimensions, dating, provenance, etc. — § ERS 8). The product owner wants admins to be able to add new fields later without a deploy, but also wants the Store to stay filterable/searchable across organizations, which a fully free-form per-artifact schema would prevent (every org would invent its own key names).

## Decision
- Ship a fixed set of common archaeology fields as real, typed columns (`artifact_metadata` table).
- Additional fields are defined **globally, by Admins only**, in a `custom_field_definitions` catalog (key, label, type). Any org's Curator/Assistant can fill in values for artifacts (`artifact_custom_fields`), but nobody can invent a new key outside this catalog.
- Value validation against the field's declared type (`text`/`number`/`date`/`boolean`) is a pure function (`validateCustomFieldValue`), not inline in the upload form or the API handler.

## Consequences
- **Positive:** the Store can facet-search/filter on custom fields consistently across all organizations (e.g. "Dynasty = Ming" spanning multiple orgs' artifacts), since the key vocabulary is shared and admin-curated.
- **Negative:** an org cannot self-serve a one-off field without going through an Admin — acceptable trade given the product owner explicitly scoped custom-field creation to Admin only.

## Alternatives considered
- **Fully dynamic per-org/per-artifact schema builder:** more flexible, but explicitly declined by the product owner in favor of a fixed-plus-admin-catalog model for v1 (recorded during requirements gathering, see ERS §1.2 Non-Goals).
- **Fixed schema only, no extensibility:** simplest, but doesn't satisfy "admin can create new fields for GLB uploaded."
