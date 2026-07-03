import { describe, expect, it } from "vitest";
import { authorizeApiKeyAccess } from "./apiKeyScope.js";
import { ORG_A, ORG_B, makeArtifact } from "./testFixtures.js";
import type { ApiKey } from "../types.js";

function makeKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return { id: "key-1", organizationId: ORG_A, revokedAt: null, ...overrides };
}

describe("apiKeyScope.authorizeApiKeyAccess", () => {
  it("allows a key to read any-status artifacts belonging to its own organization", () => {
    const key = makeKey({ organizationId: ORG_A });
    const draft = makeArtifact({ organizationId: ORG_A, status: "draft", visibility: "private" });
    expect(authorizeApiKeyAccess(key, draft)).toBe(true);
  });

  it("allows a key to read another organization's Store-public artifact", () => {
    const key = makeKey({ organizationId: ORG_A });
    const othersPublished = makeArtifact({
      organizationId: ORG_B,
      status: "published",
      visibility: "public",
    });
    expect(authorizeApiKeyAccess(key, othersPublished)).toBe(true);
  });

  it("denies a key access to another organization's private/unpublished artifact", () => {
    const key = makeKey({ organizationId: ORG_A });
    const othersDraft = makeArtifact({
      organizationId: ORG_B,
      status: "draft",
      visibility: "private",
    });
    expect(authorizeApiKeyAccess(key, othersDraft)).toBe(false);
  });

  it("denies a key access to another org's published-but-private artifact", () => {
    const key = makeKey({ organizationId: ORG_A });
    const othersPrivatePublished = makeArtifact({
      organizationId: ORG_B,
      status: "published",
      visibility: "private",
    });
    expect(authorizeApiKeyAccess(key, othersPrivatePublished)).toBe(false);
  });

  it("denies all access once a key has been revoked, even for its own org", () => {
    const revokedKey = makeKey({ organizationId: ORG_A, revokedAt: "2026-07-01T00:00:00Z" });
    const ownArtifact = makeArtifact({ organizationId: ORG_A });
    expect(authorizeApiKeyAccess(revokedKey, ownArtifact)).toBe(false);
  });
});
