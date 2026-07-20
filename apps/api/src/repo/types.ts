import type {
  ApiKey,
  Artifact,
  CustomFieldDefinition,
  Organization,
  User,
} from "@vestoxr/shared";

export interface StoredUser extends User {
  passwordHash: string;
}

export interface Repo {
  createUser(user: StoredUser): Promise<void>;
  getUserById(id: string): Promise<StoredUser | null>;
  getUserByEmail(email: string): Promise<StoredUser | null>;
  listUsers(): Promise<StoredUser[]>;
  updateUser(id: string, patch: Partial<StoredUser>): Promise<void>;
  deleteUser(id: string): Promise<void>;

  createOrganization(org: Organization): Promise<void>;
  getOrganizationById(id: string): Promise<Organization | null>;
  listOrganizations(): Promise<Organization[]>;
  updateOrganization(id: string, patch: Partial<Pick<Organization, "name" | "slug">>): Promise<void>;
  countUsersByOrganization(): Promise<Record<string, number>>;

  createArtifact(artifact: Artifact): Promise<void>;
  getArtifactById(id: string): Promise<Artifact | null>;
  listArtifacts(): Promise<Artifact[]>;
  updateArtifact(id: string, patch: Partial<Artifact>): Promise<void>;
  deleteArtifact(id: string): Promise<void>;

  createCustomFieldDefinition(def: CustomFieldDefinition, createdBy: string): Promise<void>;
  getCustomFieldDefinitionById(id: string): Promise<CustomFieldDefinition | null>;
  listCustomFieldDefinitions(): Promise<CustomFieldDefinition[]>;
  /** Renames the label and/or retypes the field (ERS §12 "add/rename/retire") — the `key` itself is immutable once created. */
  updateCustomFieldDefinition(id: string, patch: Partial<Pick<CustomFieldDefinition, "label" | "fieldType">>): Promise<void>;
  deleteCustomFieldDefinition(id: string): Promise<void>;

  getArtifactCustomFieldValues(artifactId: string): Promise<Record<string, string>>;
  /** Replaces the artifact's entire custom-field value set with `values` (ADR 0005). */
  setArtifactCustomFieldValues(artifactId: string, values: Record<string, string>): Promise<void>;
  /** Number of artifacts currently holding a value for `fieldKey` — used to block deleting an in-use field definition. */
  countArtifactCustomFieldUsage(fieldKey: string): Promise<number>;

  createApiKey(key: ApiKey & { keyHash: string; label: string; createdBy: string }): Promise<void>;
  getApiKeyByHash(hash: string): Promise<ApiKey | null>;
  listApiKeysForOrganization(organizationId: string): Promise<ApiKey[]>;
  revokeApiKey(id: string): Promise<void>;

  /** Fixed-window rate-limit counter (ERS §13): increments `bucketKey`'s count for `windowStart` and returns the new total. */
  incrementRateLimitHit(bucketKey: string, windowStart: number): Promise<number>;
}
