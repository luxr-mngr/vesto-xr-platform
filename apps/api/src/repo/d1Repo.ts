import type { ApiKey, Artifact, CustomFieldDefinition, Organization } from "@vestoxr/shared";
import type { Repo, StoredUser } from "./types.js";

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: StoredUser["role"];
  organization_id: string | null;
  status: StoredUser["status"];
}

interface ArtifactRow {
  id: string;
  organization_id: string;
  created_by: string;
  title: string;
  status: Artifact["status"];
  visibility: Artifact["visibility"];
  glb_r2_key: string | null;
}

function userFromRow(row: UserRow): StoredUser {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    organizationId: row.organization_id,
    status: row.status,
  };
}

function artifactFromRow(row: ArtifactRow): Artifact {
  return {
    id: row.id,
    organizationId: row.organization_id,
    createdBy: row.created_by,
    title: row.title,
    status: row.status,
    visibility: row.visibility,
    glbR2Key: row.glb_r2_key,
  };
}

/** Cloudflare D1-backed Repo (ADR 0001) — thin SQL mapping, no business logic. */
export class D1Repo implements Repo {
  constructor(private db: D1Database) {}

  async createUser(user: StoredUser) {
    await this.db
      .prepare(
        `INSERT INTO users (id, email, password_hash, role, organization_id, status)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(user.id, user.email, user.passwordHash, user.role, user.organizationId, user.status)
      .run();
  }

  async getUserById(id: string) {
    const row = await this.db
      .prepare("SELECT id, email, password_hash, role, organization_id, status FROM users WHERE id = ?")
      .bind(id)
      .first<UserRow>();
    return row ? userFromRow(row) : null;
  }

  async getUserByEmail(email: string) {
    const row = await this.db
      .prepare("SELECT id, email, password_hash, role, organization_id, status FROM users WHERE email = ?")
      .bind(email)
      .first<UserRow>();
    return row ? userFromRow(row) : null;
  }

  async listUsers() {
    const { results } = await this.db
      .prepare("SELECT id, email, password_hash, role, organization_id, status FROM users ORDER BY created_at DESC")
      .all<UserRow>();
    return results.map(userFromRow);
  }

  async updateUser(id: string, patch: Partial<StoredUser>) {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (patch.role !== undefined) {
      fields.push("role = ?");
      values.push(patch.role);
    }
    if (patch.organizationId !== undefined) {
      fields.push("organization_id = ?");
      values.push(patch.organizationId);
    }
    if (patch.status !== undefined) {
      fields.push("status = ?");
      values.push(patch.status);
    }
    if (fields.length === 0) return;
    values.push(id);
    await this.db.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
  }

  async deleteUser(id: string) {
    await this.db.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
  }

  async createOrganization(org: Organization) {
    await this.db
      .prepare("INSERT INTO organizations (id, name, slug) VALUES (?, ?, ?)")
      .bind(org.id, org.name, org.slug)
      .run();
  }

  async getOrganizationById(id: string) {
    return this.db.prepare("SELECT id, name, slug FROM organizations WHERE id = ?").bind(id).first<Organization>();
  }

  async listOrganizations() {
    const { results } = await this.db.prepare("SELECT id, name, slug FROM organizations").all<Organization>();
    return results;
  }

  async updateOrganization(id: string, patch: Partial<Pick<Organization, "name" | "slug">>) {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (patch.name !== undefined) {
      fields.push("name = ?");
      values.push(patch.name);
    }
    if (patch.slug !== undefined) {
      fields.push("slug = ?");
      values.push(patch.slug);
    }
    if (fields.length === 0) return;
    values.push(id);
    await this.db.prepare(`UPDATE organizations SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
  }

  async countUsersByOrganization() {
    const { results } = await this.db
      .prepare("SELECT organization_id as organizationId, COUNT(*) as count FROM users WHERE organization_id IS NOT NULL GROUP BY organization_id")
      .all<{ organizationId: string; count: number }>();
    const counts: Record<string, number> = {};
    for (const row of results) counts[row.organizationId] = row.count;
    return counts;
  }

  async createArtifact(artifact: Artifact) {
    await this.db
      .prepare(
        `INSERT INTO artifacts (id, organization_id, created_by, title, status, visibility)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        artifact.id,
        artifact.organizationId,
        artifact.createdBy,
        artifact.title,
        artifact.status,
        artifact.visibility
      )
      .run();
  }

  async getArtifactById(id: string) {
    const row = await this.db
      .prepare(
        "SELECT id, organization_id, created_by, title, status, visibility, glb_r2_key FROM artifacts WHERE id = ?"
      )
      .bind(id)
      .first<ArtifactRow>();
    return row ? artifactFromRow(row) : null;
  }

  async listArtifacts() {
    const { results } = await this.db
      .prepare("SELECT id, organization_id, created_by, title, status, visibility, glb_r2_key FROM artifacts")
      .all<ArtifactRow>();
    return results.map(artifactFromRow);
  }

  async updateArtifact(id: string, patch: Partial<Artifact>) {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (patch.status !== undefined) {
      fields.push("status = ?");
      values.push(patch.status);
    }
    if (patch.visibility !== undefined) {
      fields.push("visibility = ?");
      values.push(patch.visibility);
    }
    if (patch.title !== undefined) {
      fields.push("title = ?");
      values.push(patch.title);
    }
    if (fields.length === 0) return;
    fields.push("updated_at = datetime('now')");
    values.push(id);
    await this.db.prepare(`UPDATE artifacts SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
  }

  async deleteArtifact(id: string) {
    await this.db.prepare("DELETE FROM artifacts WHERE id = ?").bind(id).run();
  }

  async createCustomFieldDefinition(def: CustomFieldDefinition) {
    await this.db
      .prepare(
        `INSERT INTO custom_field_definitions (id, key, label, field_type, created_by)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(def.id, def.key, def.label, def.fieldType, def.id)
      .run();
  }

  async listCustomFieldDefinitions() {
    const { results } = await this.db
      .prepare("SELECT id, key, label, field_type as fieldType FROM custom_field_definitions")
      .all<CustomFieldDefinition>();
    return results;
  }

  async createApiKey(key: ApiKey & { keyHash: string; label: string }) {
    await this.db
      .prepare(
        `INSERT INTO api_keys (id, organization_id, key_hash, label, created_by)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(key.id, key.organizationId, key.keyHash, key.label, key.id)
      .run();
  }

  async getApiKeyByHash(hash: string) {
    return this.db
      .prepare("SELECT id, organization_id as organizationId, revoked_at as revokedAt FROM api_keys WHERE key_hash = ?")
      .bind(hash)
      .first<ApiKey>();
  }

  async listApiKeysForOrganization(organizationId: string) {
    const { results } = await this.db
      .prepare("SELECT id, organization_id as organizationId, revoked_at as revokedAt FROM api_keys WHERE organization_id = ?")
      .bind(organizationId)
      .all<ApiKey>();
    return results;
  }

  async revokeApiKey(id: string) {
    await this.db.prepare("UPDATE api_keys SET revoked_at = datetime('now') WHERE id = ?").bind(id).run();
  }
}
