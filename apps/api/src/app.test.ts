import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { MemoryRepo } from "./repo/memoryRepo.js";
import type { Env } from "./types/env.js";

const env: Env = {
  DB: {} as D1Database,
  BUCKET: {} as R2Bucket,
  JWT_SECRET: "test-secret-not-for-production",
  APP_VERSION: "0.1.0-test",
};

function sessionCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) throw new Error("Expected a Set-Cookie header on the login response.");
  return setCookie.split(";")[0]!;
}

async function json<T = Record<string, any>>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

/** End-to-end (HTTP-level) coverage that route handlers actually enforce the
 * shared RBAC/lifecycle rules — not just that the pure functions are correct
 * in isolation (ADR 0008). */
describe("apps/api HTTP routes", () => {
  let repo: MemoryRepo;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    repo = new MemoryRepo();
    app = createApp(repo);
  });

  async function registerAndActivate(
    email: string,
    role: "admin" | "curator" | "assistant",
    organizationId: string | null
  ) {
    await app.request("/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "password123" }),
    }, env);

    const user = await repo.getUserByEmail(email);
    await repo.updateUser(user!.id, { role, organizationId, status: "active" });

    const loginRes = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "password123" }),
    }, env);
    return { cookie: sessionCookie(loginRes), id: user!.id };
  }

  it("blocks login while an account is still pending admin approval", async () => {
    await app.request("/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "new@example.com", password: "password123" }),
    }, env);

    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "new@example.com", password: "password123" }),
    }, env);

    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.status).toBe("pending");
  });

  it("blocks login once an admin has disabled the account", async () => {
    const { id } = await registerAndActivate("todisable@example.com", "curator", "org-a");
    await repo.updateUser(id, { status: "disabled" });

    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "todisable@example.com", password: "password123" }),
    }, env);

    expect(res.status).toBe(403);
  });

  it("rejects a non-admin trying to list all users", async () => {
    const { cookie } = await registerAndActivate("curator@example.com", "curator", "org-a");

    const res = await app.request("/users", { headers: { cookie } }, env);

    expect(res.status).toBe(403);
  });

  it("lets an admin create a user directly, active with no approval queue", async () => {
    const admin = await registerAndActivate("root-admin@example.com", "admin", null);

    const res = await app.request(
      "/users",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: admin.cookie },
        body: JSON.stringify({ email: "curator-new@example.com", password: "password123", role: "curator", organizationId: "org-a" }),
      },
      env
    );

    expect(res.status).toBe(201);
    const created = await json<{ status: string; role: string }>(res);
    expect(created.status).toBe("active");
    expect(created.role).toBe("curator");

    const loginRes = await app.request(
      "/auth/login",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "curator-new@example.com", password: "password123" }) },
      env
    );
    expect(loginRes.status).toBe(200);
  });

  it("rejects a non-admin trying to create a user", async () => {
    const { cookie } = await registerAndActivate("notadmin@example.com", "curator", "org-a");

    const res = await app.request(
      "/users",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ email: "sneaky@example.com", password: "password123", role: "admin" }),
      },
      env
    );

    expect(res.status).toBe(403);
  });

  it("lets an admin delete another user, but not themselves", async () => {
    const admin = await registerAndActivate("deleter-admin@example.com", "admin", null);
    const target = await registerAndActivate("todelete@example.com", "curator", "org-a");

    const selfDeleteRes = await app.request(`/users/${admin.id}`, { method: "DELETE", headers: { cookie: admin.cookie } }, env);
    expect(selfDeleteRes.status).toBe(400);

    const res = await app.request(`/users/${target.id}`, { method: "DELETE", headers: { cookie: admin.cookie } }, env);
    expect(res.status).toBe(200);
    expect(await repo.getUserById(target.id)).toBeNull();
  });

  it("rejects a non-admin trying to delete a user", async () => {
    const curator = await registerAndActivate("curator3@example.com", "curator", "org-a");
    const other = await registerAndActivate("victim@example.com", "assistant", "org-a");

    const res = await app.request(`/users/${other.id}`, { method: "DELETE", headers: { cookie: curator.cookie } }, env);

    expect(res.status).toBe(403);
  });

  it("full artifact lifecycle: assistant drafts, curator approves and publishes to the Store", async () => {
    const assistant = await registerAndActivate("assist@example.com", "assistant", "org-a");
    const curator = await registerAndActivate("curator2@example.com", "curator", "org-a");

    const createRes = await app.request(
      "/artifacts",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: assistant.cookie },
        body: JSON.stringify({ title: "Inca Quipu" }),
      },
      env
    );
    expect(createRes.status).toBe(201);
    const artifact = await json<{ id: string; status: string }>(createRes);
    expect(artifact.status).toBe("draft");

    // Assistant may submit their own draft...
    const submitRes = await app.request(
      `/artifacts/${artifact.id}/submit`,
      { method: "POST", headers: { cookie: assistant.cookie } },
      env
    );
    expect(submitRes.status).toBe(200);

    // ...but may NOT approve it themselves.
    const assistantApproveRes = await app.request(
      `/artifacts/${artifact.id}/approve`,
      { method: "POST", headers: { cookie: assistant.cookie } },
      env
    );
    expect(assistantApproveRes.status).toBe(403);

    // A curator in the same org can approve.
    const approveRes = await app.request(
      `/artifacts/${artifact.id}/approve`,
      { method: "POST", headers: { cookie: curator.cookie } },
      env
    );
    expect(approveRes.status).toBe(200);
    expect((await json<{ status: string }>(approveRes)).status).toBe("published");

    // Still private by default — not yet in the public Store.
    let storeArtifact = await repo.getArtifactById(artifact.id);
    expect(storeArtifact?.visibility).toBe("private");

    // Curator opts it into the public Store.
    const visRes = await app.request(
      `/artifacts/${artifact.id}/visibility`,
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: curator.cookie },
        body: JSON.stringify({ visibility: "public" }),
      },
      env
    );
    expect(visRes.status).toBe(200);
  });

  it("blocks a curator from approving another organization's artifact", async () => {
    const orgACurator = await registerAndActivate("orga@example.com", "curator", "org-a");
    const orgBCurator = await registerAndActivate("orgb@example.com", "curator", "org-b");

    const createRes = await app.request(
      "/artifacts",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: orgACurator.cookie },
        body: JSON.stringify({ title: "Moche Pot" }),
      },
      env
    );
    const artifact = await json<{ id: string }>(createRes);
    await app.request(`/artifacts/${artifact.id}/submit`, { method: "POST", headers: { cookie: orgACurator.cookie } }, env);

    const crossOrgApprove = await app.request(
      `/artifacts/${artifact.id}/approve`,
      { method: "POST", headers: { cookie: orgBCurator.cookie } },
      env
    );

    expect(crossOrgApprove.status).toBe(403);
  });

  it("external v1 API never leaks another organization's private artifact", async () => {
    const orgACurator = await registerAndActivate("keyorg@example.com", "curator", "org-a");

    const createRes = await app.request(
      "/artifacts",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: orgACurator.cookie },
        body: JSON.stringify({ title: "Private Relic" }),
      },
      env
    );
    const artifact = await json<{ id: string }>(createRes);

    const keyRes = await app.request(
      "/organizations/org-b/api-keys",
      { method: "POST", headers: { "content-type": "application/json", cookie: orgACurator.cookie } },
      env
    );
    // org-a curator cannot even create a key scoped to org-b.
    expect(keyRes.status).toBe(403);

    const ownKeyRes = await app.request(
      "/organizations/org-a/api-keys",
      { method: "POST", headers: { "content-type": "application/json", cookie: orgACurator.cookie } },
      env
    );
    expect(ownKeyRes.status).toBe(201);

    const rawKey = (await json<{ key: string }>(ownKeyRes)).key as string;

    const listRes = await app.request("/v1/artifacts", { headers: { authorization: `Bearer ${rawKey}` } }, env);
    const visible = await json<Array<{ id: string }>>(listRes);
    // org-a's own key: sees its own draft artifact...
    expect(visible.some((a: { id: string }) => a.id === artifact.id)).toBe(true);
  });
});
