import type { Artifact, User } from "../types.js";

export const ORG_A = "org-a";
export const ORG_B = "org-b";

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "user@example.com",
    role: "curator",
    organizationId: ORG_A,
    status: "active",
    ...overrides,
  };
}

export function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: "artifact-1",
    organizationId: ORG_A,
    createdBy: "user-1",
    title: "Ceramic Vessel",
    description: null,
    status: "draft",
    visibility: "private",
    glbR2Key: null,
    thumbnailR2Key: null,
    ...overrides,
  };
}
