import type { Artifact, ArtifactStatus, User } from "../types.js";
import { can } from "./rbac.js";

export type LifecycleAction = "submit" | "approve" | "reject" | "unpublishToDraft";

export interface TransitionResult {
  ok: boolean;
  nextStatus?: ArtifactStatus;
  error?: string;
}

const LEGAL_EDGES: Record<LifecycleAction, { from: ArtifactStatus; to: ArtifactStatus }> = {
  submit: { from: "draft", to: "pending_review" },
  approve: { from: "pending_review", to: "published" },
  reject: { from: "pending_review", to: "rejected" },
  unpublishToDraft: { from: "rejected", to: "draft" },
};

const REQUIRED_PERMISSION: Record<LifecycleAction, "artifact.submitForReview" | "artifact.approve" | "artifact.reject"> = {
  submit: "artifact.submitForReview",
  approve: "artifact.approve",
  reject: "artifact.reject",
  // moving a rejected artifact back to draft for another edit pass is an edit-adjacent
  // action, gated the same way as approving/rejecting it in the first place.
  unpublishToDraft: "artifact.reject",
};

/**
 * Pure state-machine transition (ADR 0004). Route handlers persist the
 * returned nextStatus; they must not branch on role/status themselves.
 */
export function transition(
  actor: User,
  artifact: Artifact,
  action: LifecycleAction
): TransitionResult {
  const edge = LEGAL_EDGES[action];

  if (artifact.status !== edge.from) {
    return {
      ok: false,
      error: `Cannot ${action}: artifact is '${artifact.status}', expected '${edge.from}'.`,
    };
  }

  const permission = REQUIRED_PERMISSION[action];
  if (!can(actor, permission, { artifact })) {
    return { ok: false, error: `Actor is not permitted to '${action}' this artifact.` };
  }

  return { ok: true, nextStatus: edge.to };
}
