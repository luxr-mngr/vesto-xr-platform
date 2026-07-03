import type { ApiKey, Artifact, CustomFieldDefinition, Organization } from "@vestoxr/shared";
import type { Repo, StoredUser } from "./types.js";

/** In-memory Repo for unit/route tests — no D1/Miniflare required (ADR 0008 style). */
export class MemoryRepo implements Repo {
  users = new Map<string, StoredUser>();
  organizations = new Map<string, Organization>();
  artifacts = new Map<string, Artifact>();
  customFieldDefinitions = new Map<string, CustomFieldDefinition>();
  apiKeys = new Map<string, ApiKey & { keyHash: string; label: string }>();

  async createUser(user: StoredUser) {
    this.users.set(user.id, user);
  }
  async getUserById(id: string) {
    return this.users.get(id) ?? null;
  }
  async getUserByEmail(email: string) {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }
  async listUsers() {
    return [...this.users.values()];
  }
  async updateUser(id: string, patch: Partial<StoredUser>) {
    const existing = this.users.get(id);
    if (existing) this.users.set(id, { ...existing, ...patch });
  }
  async deleteUser(id: string) {
    this.users.delete(id);
  }

  async createOrganization(org: Organization) {
    this.organizations.set(org.id, org);
  }
  async getOrganizationById(id: string) {
    return this.organizations.get(id) ?? null;
  }
  async listOrganizations() {
    return [...this.organizations.values()];
  }

  async createArtifact(artifact: Artifact) {
    this.artifacts.set(artifact.id, artifact);
  }
  async getArtifactById(id: string) {
    return this.artifacts.get(id) ?? null;
  }
  async listArtifacts() {
    return [...this.artifacts.values()];
  }
  async updateArtifact(id: string, patch: Partial<Artifact>) {
    const existing = this.artifacts.get(id);
    if (existing) this.artifacts.set(id, { ...existing, ...patch });
  }
  async deleteArtifact(id: string) {
    this.artifacts.delete(id);
  }

  async createCustomFieldDefinition(def: CustomFieldDefinition) {
    this.customFieldDefinitions.set(def.key, def);
  }
  async listCustomFieldDefinitions() {
    return [...this.customFieldDefinitions.values()];
  }

  async createApiKey(key: ApiKey & { keyHash: string; label: string }) {
    this.apiKeys.set(key.id, key);
  }
  async getApiKeyByHash(hash: string) {
    return [...this.apiKeys.values()].find((k) => k.keyHash === hash) ?? null;
  }
  async listApiKeysForOrganization(organizationId: string) {
    return [...this.apiKeys.values()].filter((k) => k.organizationId === organizationId);
  }
  async revokeApiKey(id: string) {
    const existing = this.apiKeys.get(id);
    if (existing) this.apiKeys.set(id, { ...existing, revokedAt: new Date().toISOString() });
  }
}
