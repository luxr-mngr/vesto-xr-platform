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
  thumbnail_r2_key: string | null;
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
    thumbnailR2Key: row.thumbnail_r2_key,
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
        "SELECT id, organization_id, created_by, title, status, visibility, glb_r2_key, thumbnail_r2_key FROM artifacts WHERE id = ?"
      )
      .bind(id)
      .first<ArtifactRow>();
    return row ? artifactFromRow(row) : null;
  }

  async listArtifacts() {
    const { results } = await this.db
      .prepare("SELECT id, organization_id, created_by, title, status, visibility, glb_r2_key, thumbnail_r2_key FROM artifacts")
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
    if (patch.glbR2Key !== undefined) {
      fields.push("glb_r2_key = ?");
      values.push(patch.glbR2Key);
    }
    if (patch.thumbnailR2Key !== undefined) {
      fields.push("thumbnail_r2_key = ?");
      values.push(patch.thumbnailR2Key);
    }
    if (fields.length === 0) return;
    fields.push("updated_at = datetime('now')");
    values.push(id);
    await this.db.prepare(`UPDATE artifacts SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
  }

  async deleteArtifact(id: string) {
    await this.db.prepare("DELETE FROM artifacts WHERE id = ?").bind(id).run();
  }

  async createCustomFieldDefinition(def: CustomFieldDefinition, createdBy: string) {
    await this.db
      .prepare(
        `INSERT INTO custom_field_definitions (id, key, label, field_type, created_by)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(def.id, def.key, def.label, def.fieldType, createdBy)
      .run();
  }

  async getCustomFieldDefinitionById(id: string) {
    return this.db
      .prepare("SELECT id, key, label, field_type as fieldType FROM custom_field_definitions WHERE id = ?")
      .bind(id)
      .first<CustomFieldDefinition>();
  }

  async listCustomFieldDefinitions() {
    const { results } = await this.db
      .prepare("SELECT id, key, label, field_type as fieldType FROM custom_field_definitions")
      .all<CustomFieldDefinition>();
    return results;
  }

  async updateCustomFieldDefinition(id: string, patch: Partial<Pick<CustomFieldDefinition, "label" | "fieldType">>) {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (patch.label !== undefined) {
      fields.push("label = ?");
      values.push(patch.label);
    }
    if (patch.fieldType !== undefined) {
      fields.push("field_type = ?");
      values.push(patch.fieldType);
    }
    if (fields.length === 0) return;
    values.push(id);
    await this.db.prepare(`UPDATE custom_field_definitions SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
  }

  async deleteCustomFieldDefinition(id: string) {
    await this.db.prepare("DELETE FROM custom_field_definitions WHERE id = ?").bind(id).run();
  }

  async getArtifactCustomFieldValues(artifactId: string) {
    const { results } = await this.db
      .prepare("SELECT field_key as fieldKey, field_value as fieldValue FROM artifact_custom_fields WHERE artifact_id = ?")
      .bind(artifactId)
      .all<{ fieldKey: string; fieldValue: string }>();
    const values: Record<string, string> = {};
    for (const row of results) values[row.fieldKey] = row.fieldValue;
    return values;
  }

  async setArtifactCustomFieldValues(artifactId: string, values: Record<string, string>) {
    const statements = [
      this.db.prepare("DELETE FROM artifact_custom_fields WHERE artifact_id = ?").bind(artifactId),
      ...Object.entries(values).map(([key, value]) =>
        this.db
          .prepare(
            `INSERT INTO artifact_custom_fields (id, artifact_id, field_key, field_value) VALUES (?, ?, ?, ?)`
          )
          .bind(crypto.randomUUID(), artifactId, key, value)
      ),
    ];
    await this.db.batch(statements);
  }

  async countArtifactCustomFieldUsage(fieldKey: string) {
    const row = await this.db
      .prepare("SELECT COUNT(*) as count FROM artifact_custom_fields WHERE field_key = ?")
      .bind(fieldKey)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  async createApiKey(key: ApiKey & { keyHash: string; label: string; createdBy: string }) {
    await this.db
      .prepare(
        `INSERT INTO api_keys (id, organization_id, key_hash, label, created_by)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(key.id, key.organizationId, key.keyHash, key.label, key.createdBy)
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

  async incrementRateLimitHit(bucketKey: string, windowStart: number) {
    const row = await this.db
      .prepare(
        `INSERT INTO rate_limit_hits (bucket_key, window_start, count) VALUES (?, ?, 1)
         ON CONFLICT (bucket_key, window_start) DO UPDATE SET count = count + 1
         RETURNING count`
      )
      .bind(bucketKey, windowStart)
      .first<{ count: number }>();
    return row!.count;
  }
}
