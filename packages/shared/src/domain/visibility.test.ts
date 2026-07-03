import { describe, expect, it } from "vitest";
import { canView, isStorePublic, isVisibleInMyLibrary } from "./visibility.js";
import { ORG_A, ORG_B, makeArtifact, makeUser } from "./testFixtures.js";

describe("visibility.isStorePublic", () => {
  it("is true only when published AND public", () => {
    expect(isStorePublic(makeArtifact({ status: "published", visibility: "public" }))).toBe(true);
  });

  it("is false when published but private", () => {
    expect(isStorePublic(makeArtifact({ status: "published", visibility: "private" }))).toBe(
      false
    );
  });

  it("is false when public but not yet published (draft/pending/rejected)", () => {
    for (const status of ["draft", "pending_review", "rejected"] as const) {
      expect(isStorePublic(makeArtifact({ status, visibility: "public" }))).toBe(false);
    }
  });
});

describe("visibility.isVisibleInMyLibrary", () => {
  it("shows an org's own artifacts to its members regardless of status", () => {
    const curator = makeUser({ role: "curator", organizationId: ORG_A });
    const draft = makeArtifact({ organizationId: ORG_A, status: "draft" });
    expect(isVisibleInMyLibrary(curator, draft)).toBe(true);
  });

  it("hides another organization's artifacts from a non-admin", () => {
    const curator = makeUser({ role: "curator", organizationId: ORG_A });
    const othersArtifact = makeArtifact({ organizationId: ORG_B });
    expect(isVisibleInMyLibrary(curator, othersArtifact)).toBe(false);
  });

  it("shows every organization's artifacts to an admin", () => {
    const admin = makeUser({ role: "admin", organizationId: null });
    const othersArtifact = makeArtifact({ organizationId: ORG_B });
    expect(isVisibleInMyLibrary(admin, othersArtifact)).toBe(true);
  });
});

describe("visibility.canView (combined read predicate)", () => {
  it("lets an anonymous/logged-out caller see only Store-public artifacts", () => {
    const publicArtifact = makeArtifact({ status: "published", visibility: "public" });
    const privateArtifact = makeArtifact({ status: "published", visibility: "private" });

    expect(canView(null, publicArtifact)).toBe(true);
    expect(canView(null, privateArtifact)).toBe(false);
  });

  it("never lets a private draft from another org leak to a logged-in user", () => {
    const curator = makeUser({ role: "curator", organizationId: ORG_A });
    const othersDraft = makeArtifact({
      organizationId: ORG_B,
      status: "draft",
      visibility: "private",
    });

    expect(canView(curator, othersDraft)).toBe(false);
  });
});
