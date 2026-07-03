import type { Action, Artifact, User } from "../types.js";

export interface RbacContext {
  artifact?: Artifact;
  /** The user whose account is being acted on, for user-management actions. */
  targetUser?: User;
  /** The organization a non-artifact-scoped resource belongs to (e.g. an API key). */
  organizationId?: string;
}

function sameOrg(actor: User, organizationId: string | null | undefined): boolean {
  return actor.organizationId !== null && actor.organizationId === organizationId;
}

/**
 * Single source of truth for "can this actor do this action" (ADR 0008, ERS §5).
 * Route handlers must call this instead of branching on `actor.role` themselves.
 */
export function can(actor: User, action: Action, context: RbacContext = {}): boolean {
  if (actor.status !== "active" || actor.role === null) return false;

  switch (action) {
    case "user.approve":
    case "user.assignRoleAndOrg":
    case "user.disable":
    case "organization.create":
    case "customField.create":
      return actor.role === "admin";

    case "artifact.upload":
      return actor.role === "admin" || actor.role === "curator" || actor.role === "assistant";

    case "artifact.editMetadata": {
      const artifact = context.artifact;
      if (!artifact) return false;
      if (actor.role === "admin") return true;
      if (actor.role === "curator") return sameOrg(actor, artifact.organizationId);
      // assistant: only their own uploads, and only while still a draft
      return (
        actor.role === "assistant" &&
        artifact.createdBy === actor.id &&
        artifact.status === "draft"
      );
    }

    case "artifact.submitForReview": {
      const artifact = context.artifact;
      if (!artifact) return false;
      if (actor.role === "admin") return true;
      if (actor.role === "curator") return sameOrg(actor, artifact.organizationId);
      return actor.role === "assistant" && artifact.createdBy === actor.id;
    }

    case "artifact.approve":
    case "artifact.reject":
    case "artifact.publish":
    case "artifact.delete": {
      const artifact = context.artifact;
      if (actor.role === "admin") return true;
      if (actor.role === "curator") {
        if (!artifact) return false;
        return sameOrg(actor, artifact.organizationId);
      }
      return false; // assistants never approve/reject/publish/delete
    }

    case "apiKey.manage": {
      if (actor.role === "admin") return true;
      if (actor.role === "curator") return sameOrg(actor, context.organizationId);
      return false; // assistants never manage API keys
    }

    default:
      return false;
  }
}
