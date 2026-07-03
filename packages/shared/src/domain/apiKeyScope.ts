import type { ApiKey, Artifact } from "../types.js";
import { isStorePublic } from "./visibility.js";

/**
 * An API key (ADR 0006) may read its own organization's artifacts (any status
 * the org has stored) plus anything already public in the Store. It can never
 * see another organization's private/draft/pending/rejected artifacts.
 */
export function authorizeApiKeyAccess(key: ApiKey, artifact: Artifact): boolean {
  if (key.revokedAt !== null) return false;
  if (artifact.organizationId === key.organizationId) return true;
  return isStorePublic(artifact);
}
