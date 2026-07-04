export type Role = "admin" | "curator" | "assistant";

export type UserStatus = "pending" | "active" | "disabled";

export interface User {
  id: string;
  email: string;
  role: Role | null;
  organizationId: string | null;
  status: UserStatus;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  /** Present only on endpoints that compute it (GET /organizations) — not a stored column. */
  memberCount?: number;
}

export type ArtifactStatus = "draft" | "pending_review" | "published" | "rejected";

export type ArtifactVisibility = "private" | "public";

export interface Artifact {
  id: string;
  organizationId: string;
  createdBy: string;
  title: string;
  status: ArtifactStatus;
  visibility: ArtifactVisibility;
  /** R2 object key for the GLB binary; null until the upload step completes (ERS §10). */
  glbR2Key: string | null;
  /** R2 object key for the generated PNG preview; null until a thumbnail is captured (ERS §7). */
  thumbnailR2Key: string | null;
}

/** Soft upload-size limit for GLB binaries (ERS §7) — enforced client- and server-side. */
export const MAX_GLB_SIZE_BYTES = 200 * 1024 * 1024;

export type CustomFieldType = "text" | "number" | "date" | "boolean";

export interface CustomFieldDefinition {
  id: string;
  key: string;
  label: string;
  fieldType: CustomFieldType;
}

export interface ApiKey {
  id: string;
  organizationId: string;
  revokedAt: string | null;
}

/** The set of actions the RBAC matrix (§ ERS 5, ADR 0008) governs. */
export type Action =
  | "user.approve"
  | "user.assignRoleAndOrg"
  | "user.disable"
  | "user.create"
  | "user.delete"
  | "organization.create"
  | "customField.create"
  | "customField.update"
  | "customField.delete"
  | "artifact.upload"
  | "artifact.editMetadata"
  | "artifact.submitForReview"
  | "artifact.approve"
  | "artifact.reject"
  | "artifact.publish"
  | "artifact.delete"
  | "apiKey.manage";
