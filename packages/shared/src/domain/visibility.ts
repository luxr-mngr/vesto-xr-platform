import type { Artifact, User } from "../types.js";

/** An artifact is in the public Store iff published AND marked public (ADR 0003). */
export function isStorePublic(artifact: Artifact): boolean {
  return artifact.status === "published" && artifact.visibility === "public";
}

/**
 * My Library visibility: any artifact belonging to the actor's own organization,
 * regardless of status/visibility. Admins see every organization's library.
 */
export function isVisibleInMyLibrary(actor: User, artifact: Artifact): boolean {
  if (actor.role === "admin") return true;
  return actor.organizationId !== null && actor.organizationId === artifact.organizationId;
}

/** Combined read predicate used by list/detail endpoints (ADR 0003, ADR 0008). */
export function canView(actor: User | null, artifact: Artifact): boolean {
  if (isStorePublic(artifact)) return true;
  if (!actor) return false;
  return isVisibleInMyLibrary(actor, artifact);
}
