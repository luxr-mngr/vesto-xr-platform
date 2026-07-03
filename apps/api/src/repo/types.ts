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

  createArtifact(artifact: Artifact): Promise<void>;
  getArtifactById(id: string): Promise<Artifact | null>;
  listArtifacts(): Promise<Artifact[]>;
  updateArtifact(id: string, patch: Partial<Artifact>): Promise<void>;
  deleteArtifact(id: string): Promise<void>;

  createCustomFieldDefinition(def: CustomFieldDefinition): Promise<void>;
  listCustomFieldDefinitions(): Promise<CustomFieldDefinition[]>;

  createApiKey(key: ApiKey & { keyHash: string; label: string }): Promise<void>;
  getApiKeyByHash(hash: string): Promise<ApiKey | null>;
  listApiKeysForOrganization(organizationId: string): Promise<ApiKey[]>;
  revokeApiKey(id: string): Promise<void>;
}
