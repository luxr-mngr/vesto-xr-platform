import { describe, expect, it } from "vitest";
import { transition } from "./artifactLifecycle.js";
import { ORG_A, ORG_B, makeArtifact, makeUser } from "./testFixtures.js";

describe("artifactLifecycle.transition", () => {
  it("allows a curator to submit their own org's draft for review", () => {
    const curator = makeUser({ role: "curator", organizationId: ORG_A });
    const draft = makeArtifact({ organizationId: ORG_A, status: "draft" });

    const result = transition(curator, draft, "submit");

    expect(result).toEqual({ ok: true, nextStatus: "pending_review" });
  });

  it("allows an assistant to submit their own draft for review", () => {
    const assistant = makeUser({ id: "assist-1", role: "assistant", organizationId: ORG_A });
    const draft = makeArtifact({ createdBy: "assist-1", status: "draft" });

    expect(transition(assistant, draft, "submit")).toEqual({
      ok: true,
      nextStatus: "pending_review",
    });
  });

  it("rejects submitting an artifact that is not currently a draft", () => {
    const curator = makeUser({ role: "curator", organizationId: ORG_A });
    const pending = makeArtifact({ organizationId: ORG_A, status: "pending_review" });

    const result = transition(curator, pending, "submit");

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/expected 'draft'/);
  });

  it("allows a curator to approve their own org's pending artifact, publishing it", () => {
    const curator = makeUser({ role: "curator", organizationId: ORG_A });
    const pending = makeArtifact({ organizationId: ORG_A, status: "pending_review" });

    expect(transition(curator, pending, "approve")).toEqual({
      ok: true,
      nextStatus: "published",
    });
  });

  it("blocks a curator from approving another organization's pending artifact", () => {
    const curator = makeUser({ role: "curator", organizationId: ORG_A });
    const pending = makeArtifact({ organizationId: ORG_B, status: "pending_review" });

    const result = transition(curator, pending, "approve");

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not permitted/);
  });

  it("blocks an assistant from approving even their own submission", () => {
    const assistant = makeUser({ id: "assist-1", role: "assistant", organizationId: ORG_A });
    const pending = makeArtifact({ createdBy: "assist-1", status: "pending_review" });

    const result = transition(assistant, pending, "approve");

    expect(result.ok).toBe(false);
  });

  it("rejecting a pending artifact returns it to draft", () => {
    const curator = makeUser({ role: "curator", organizationId: ORG_A });
    const pending = makeArtifact({ organizationId: ORG_A, status: "pending_review" });

    expect(transition(curator, pending, "reject")).toEqual({
      ok: true,
      nextStatus: "rejected",
    });
  });

  it("rejects an out-of-order transition (e.g. approving a draft directly)", () => {
    const curator = makeUser({ role: "curator", organizationId: ORG_A });
    const draft = makeArtifact({ organizationId: ORG_A, status: "draft" });

    const result = transition(curator, draft, "approve");

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/expected 'pending_review'/);
  });

  it("allows moving a rejected artifact back to draft for another edit pass", () => {
    const curator = makeUser({ role: "curator", organizationId: ORG_A });
    const rejected = makeArtifact({ organizationId: ORG_A, status: "rejected" });

    expect(transition(curator, rejected, "unpublishToDraft")).toEqual({
      ok: true,
      nextStatus: "draft",
    });
  });
});
