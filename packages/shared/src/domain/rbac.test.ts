import { describe, expect, it } from "vitest";
import { can } from "./rbac.js";
import { ORG_A, ORG_B, makeArtifact, makeUser } from "./testFixtures.js";

describe("rbac.can", () => {
  it("denies every action for a pending (not-yet-active) user", () => {
    const pending = makeUser({ status: "pending", role: null });
    expect(can(pending, "artifact.upload")).toBe(false);
    expect(can(pending, "artifact.approve", { artifact: makeArtifact() })).toBe(false);
  });

  it("denies every action for a disabled user, even with a role", () => {
    const disabled = makeUser({ status: "disabled", role: "admin" });
    expect(can(disabled, "user.approve")).toBe(false);
  });

  describe("admin-only actions", () => {
    for (const action of [
      "user.approve",
      "user.assignRoleAndOrg",
      "user.disable",
      "user.create",
      "user.delete",
      "organization.create",
      "customField.create",
    ] as const) {
      it(`only admin can '${action}'`, () => {
        expect(can(makeUser({ role: "admin" }), action)).toBe(true);
        expect(can(makeUser({ role: "curator" }), action)).toBe(false);
        expect(can(makeUser({ role: "assistant" }), action)).toBe(false);
      });
    }
  });

  describe("artifact.upload", () => {
    it("is allowed for admin, curator, and assistant alike", () => {
      expect(can(makeUser({ role: "admin" }), "artifact.upload")).toBe(true);
      expect(can(makeUser({ role: "curator" }), "artifact.upload")).toBe(true);
      expect(can(makeUser({ role: "assistant" }), "artifact.upload")).toBe(true);
    });
  });

  describe("artifact.editMetadata", () => {
    it("lets a curator edit any artifact in their own organization", () => {
      const curator = makeUser({ role: "curator", organizationId: ORG_A });
      const artifact = makeArtifact({ organizationId: ORG_A, createdBy: "someone-else" });
      expect(can(curator, "artifact.editMetadata", { artifact })).toBe(true);
    });

    it("blocks a curator from editing another organization's artifact", () => {
      const curator = makeUser({ role: "curator", organizationId: ORG_A });
      const artifact = makeArtifact({ organizationId: ORG_B });
      expect(can(curator, "artifact.editMetadata", { artifact })).toBe(false);
    });

    it("lets an assistant edit only their own draft upload", () => {
      const assistant = makeUser({ id: "assist-1", role: "assistant", organizationId: ORG_A });
      const ownDraft = makeArtifact({ createdBy: "assist-1", status: "draft" });
      expect(can(assistant, "artifact.editMetadata", { artifact: ownDraft })).toBe(true);
    });

    it("blocks an assistant from editing someone else's upload", () => {
      const assistant = makeUser({ id: "assist-1", role: "assistant", organizationId: ORG_A });
      const othersDraft = makeArtifact({ createdBy: "assist-2", status: "draft" });
      expect(can(assistant, "artifact.editMetadata", { artifact: othersDraft })).toBe(false);
    });

    it("blocks an assistant from editing their own artifact once it is no longer a draft", () => {
      const assistant = makeUser({ id: "assist-1", role: "assistant", organizationId: ORG_A });
      const submitted = makeArtifact({ createdBy: "assist-1", status: "pending_review" });
      expect(can(assistant, "artifact.editMetadata", { artifact: submitted })).toBe(false);
    });
  });

  describe("assistants can never approve, reject, publish, or delete", () => {
    const assistant = makeUser({ role: "assistant", organizationId: ORG_A });
    const artifact = makeArtifact({ organizationId: ORG_A, status: "pending_review" });

    for (const action of ["artifact.approve", "artifact.reject", "artifact.publish", "artifact.delete"] as const) {
      it(`assistant cannot '${action}' even on their own org's artifact`, () => {
        expect(can(assistant, action, { artifact })).toBe(false);
      });
    }
  });

  describe("curator publish/approve/reject/delete is scoped to their own organization", () => {
    const curator = makeUser({ role: "curator", organizationId: ORG_A });

    it("allows within own organization", () => {
      const artifact = makeArtifact({ organizationId: ORG_A, status: "pending_review" });
      expect(can(curator, "artifact.approve", { artifact })).toBe(true);
      expect(can(curator, "artifact.delete", { artifact })).toBe(true);
    });

    it("denies for another organization's artifact", () => {
      const artifact = makeArtifact({ organizationId: ORG_B, status: "pending_review" });
      expect(can(curator, "artifact.approve", { artifact })).toBe(false);
      expect(can(curator, "artifact.delete", { artifact })).toBe(false);
    });
  });

  describe("apiKey.manage", () => {
    it("admin can manage any organization's keys", () => {
      expect(
        can(makeUser({ role: "admin" }), "apiKey.manage", { organizationId: ORG_B })
      ).toBe(true);
    });

    it("curator can manage only their own organization's keys", () => {
      const curator = makeUser({ role: "curator", organizationId: ORG_A });
      expect(can(curator, "apiKey.manage", { organizationId: ORG_A })).toBe(true);
      expect(can(curator, "apiKey.manage", { organizationId: ORG_B })).toBe(false);
    });

    it("assistant can never manage keys", () => {
      const assistant = makeUser({ role: "assistant", organizationId: ORG_A });
      expect(can(assistant, "apiKey.manage", { organizationId: ORG_A })).toBe(false);
    });
  });
});
