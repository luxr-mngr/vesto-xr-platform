-- Initial schema (ERS §4 / ADR 0001, 0002, 0003, 0004, 0005, 0006)

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT CHECK (role IN ('admin', 'curator', 'assistant')),
  organization_id TEXT REFERENCES organizations(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'disabled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT,
  login_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_users_organization ON users(organization_id);

CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  glb_r2_key TEXT,
  thumbnail_r2_key TEXT,
  file_size_bytes INTEGER,
  checksum_sha256 TEXT,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'published', 'rejected')),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_artifacts_organization ON artifacts(organization_id);
CREATE INDEX idx_artifacts_status_visibility ON artifacts(status, visibility);

CREATE TABLE artifact_metadata (
  artifact_id TEXT PRIMARY KEY REFERENCES artifacts(id) ON DELETE CASCADE,
  site_name TEXT,
  culture_period TEXT,
  material TEXT,
  dimensions TEXT,
  weight_grams REAL,
  dating_method TEXT,
  estimated_date TEXT,
  excavation_date TEXT,
  provenance TEXT,
  condition TEXT,
  catalog_id TEXT,
  description TEXT,
  tags TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE custom_field_definitions (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'date', 'boolean')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE artifact_custom_fields (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL REFERENCES custom_field_definitions(key),
  field_value TEXT NOT NULL,
  UNIQUE (artifact_id, field_key)
);

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  key_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE INDEX idx_api_keys_organization ON api_keys(organization_id);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
