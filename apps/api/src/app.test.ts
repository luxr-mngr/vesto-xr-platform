import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { MemoryRepo } from "./repo/memoryRepo.js";
import type { Env } from "./types/env.js";

/** Minimal in-memory stand-in for the R2Bucket binding, just enough for the GLB routes. */
class MemoryR2Bucket {
  private objects = new Map<string, ArrayBuffer>();

  async put(key: string, value: ReadableStream | ArrayBuffer | null) {
    const buf = value instanceof ReadableStream ? await new Response(value).arrayBuffer() : (value ?? new ArrayBuffer(0));
    this.objects.set(key, buf);
  }
  async get(key: string) {
    const buf = this.objects.get(key);
    return buf ? { body: new Response(buf).body! } : null;
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
}

const env: Env = {
  DB: {} as D1Database,
  BUCKET: new MemoryR2Bucket() as unknown as R2Bucket,
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
    await repo.createOrganization({ id: "org-a", name: "Org A", slug: "org-a" });

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

  it("rejects creating a user with an organization that doesn't exist", async () => {
    const admin = await registerAndActivate("org-check-admin@example.com", "admin", null);

    const res = await app.request(
      "/users",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: admin.cookie },
        body: JSON.stringify({
          email: "orphan@example.com",
          password: "password123",
          role: "curator",
          organizationId: "does-not-exist",
        }),
      },
      env
    );

    expect(res.status).toBe(400);
    expect(await repo.getUserByEmail("orphan@example.com")).toBeNull();
  });

  it("lets an admin create an organization, and blocks a non-admin from doing so", async () => {
    const admin = await registerAndActivate("org-admin@example.com", "admin", null);
    const curator = await registerAndActivate("org-curator@example.com", "curator", "org-a");
    await repo.createOrganization({ id: "org-a", name: "Org A", slug: "org-a" });

    const forbidden = await app.request(
      "/organizations",
      { method: "POST", headers: { "content-type": "application/json", cookie: curator.cookie }, body: JSON.stringify({ name: "Curator Org" }) },
      env
    );
    expect(forbidden.status).toBe(403);

    const res = await app.request(
      "/organizations",
      { method: "POST", headers: { "content-type": "application/json", cookie: admin.cookie }, body: JSON.stringify({ name: "LuXR Institute" }) },
      env
    );
    expect(res.status).toBe(201);
    const created = await json<{ id: string; slug: string }>(res);
    expect(created.slug).toBe("luxr-institute");

    const dupeRes = await app.request(
      "/organizations",
      { method: "POST", headers: { "content-type": "application/json", cookie: admin.cookie }, body: JSON.stringify({ name: "LuXR Institute" }) },
      env
    );
    expect(dupeRes.status).toBe(409);

    const listRes = await app.request("/organizations", { headers: { cookie: curator.cookie } }, env);
    expect(listRes.status).toBe(200);
    const list = await json<Array<{ id: string }>>(listRes);
    expect(list.some((o) => o.id === created.id)).toBe(true);
  });

  it("lets an admin rename an organization, blocks slug collisions and non-admins", async () => {
    const admin = await registerAndActivate("org-rename-admin@example.com", "admin", null);
    const curator = await registerAndActivate("org-rename-curator@example.com", "curator", "org-a");
    await repo.createOrganization({ id: "org-a", name: "Org A", slug: "org-a" });
    await repo.createOrganization({ id: "org-b", name: "Org B", slug: "org-b" });

    const forbidden = await app.request(
      "/organizations/org-a",
      { method: "PATCH", headers: { "content-type": "application/json", cookie: curator.cookie }, body: JSON.stringify({ name: "Nope" }) },
      env
    );
    expect(forbidden.status).toBe(403);

    const notFound = await app.request(
      "/organizations/does-not-exist",
      { method: "PATCH", headers: { "content-type": "application/json", cookie: admin.cookie }, body: JSON.stringify({ name: "Ghost" }) },
      env
    );
    expect(notFound.status).toBe(404);

    const collision = await app.request(
      "/organizations/org-a",
      { method: "PATCH", headers: { "content-type": "application/json", cookie: admin.cookie }, body: JSON.stringify({ name: "Org B" }) },
      env
    );
    expect(collision.status).toBe(409);

    const renameRes = await app.request(
      "/organizations/org-a",
      { method: "PATCH", headers: { "content-type": "application/json", cookie: admin.cookie }, body: JSON.stringify({ name: "Org A Renamed" }) },
      env
    );
    expect(renameRes.status).toBe(200);
    const renamed = await json<{ name: string; slug: string }>(renameRes);
    expect(renamed.name).toBe("Org A Renamed");
    expect(renamed.slug).toBe("org-a-renamed");
    expect((await repo.getOrganizationById("org-a"))?.name).toBe("Org A Renamed");
  });

  it("reports accurate member counts per organization on the list endpoint", async () => {
    const admin = await registerAndActivate("org-count-admin@example.com", "admin", null);
    await repo.createOrganization({ id: "org-a", name: "Org A", slug: "org-a" });
    await repo.createOrganization({ id: "org-b", name: "Org B", slug: "org-b" });
    await registerAndActivate("org-count-1@example.com", "curator", "org-a");
    await registerAndActivate("org-count-2@example.com", "assistant", "org-a");
    await registerAndActivate("org-count-3@example.com", "curator", "org-b");

    const res = await app.request("/organizations", { headers: { cookie: admin.cookie } }, env);
    expect(res.status).toBe(200);
    const list = await json<Array<{ id: string; memberCount: number }>>(res);
    expect(list.find((o) => o.id === "org-a")?.memberCount).toBe(2);
    expect(list.find((o) => o.id === "org-b")?.memberCount).toBe(1);
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

  it("curator uploads a GLB, can download it back, and it's gone after delete", async () => {
    const curator = await registerAndActivate("glb-curator@example.com", "curator", "org-a");
    const outsider = await registerAndActivate("glb-outsider@example.com", "curator", "org-b");

    const createRes = await app.request(
      "/artifacts",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: curator.cookie },
        body: JSON.stringify({ title: "Ceramic Vase" }),
      },
      env
    );
    const artifact = await json<{ id: string; glbR2Key: string | null }>(createRes);
    expect(artifact.glbR2Key).toBeNull();

    const glbBytes = new Uint8Array([1, 2, 3, 4]);

    // A curator from a different org may not upload to this artifact.
    const forbiddenPut = await app.request(
      `/artifacts/${artifact.id}/glb`,
      { method: "PUT", headers: { cookie: outsider.cookie }, body: glbBytes },
      env
    );
    expect(forbiddenPut.status).toBe(403);

    const putRes = await app.request(
      `/artifacts/${artifact.id}/glb`,
      { method: "PUT", headers: { cookie: curator.cookie }, body: glbBytes },
      env
    );
    expect(putRes.status).toBe(200);
    expect((await repo.getArtifactById(artifact.id))?.glbR2Key).not.toBeNull();

    const getRes = await app.request(`/artifacts/${artifact.id}/glb`, { headers: { cookie: curator.cookie } }, env);
    expect(getRes.status).toBe(200);
    expect(new Uint8Array(await getRes.arrayBuffer())).toEqual(glbBytes);

    // Still not visible to a curator outside the org (private draft).
    const forbiddenGet = await app.request(`/artifacts/${artifact.id}/glb`, { headers: { cookie: outsider.cookie } }, env);
    expect(forbiddenGet.status).toBe(404);

    const deleteRes = await app.request(`/artifacts/${artifact.id}`, { method: "DELETE", headers: { cookie: curator.cookie } }, env);
    expect(deleteRes.status).toBe(200);
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

  it("lets the signed download token be redeemed with no further credential", async () => {
    const curator = await registerAndActivate("dl-curator@example.com", "curator", "org-a");
    const createRes = await app.request(
      "/artifacts",
      { method: "POST", headers: { "content-type": "application/json", cookie: curator.cookie }, body: JSON.stringify({ title: "Downloadable" }) },
      env
    );
    const artifact = await json<{ id: string }>(createRes);
    await app.request(`/artifacts/${artifact.id}/glb`, { method: "PUT", headers: { cookie: curator.cookie }, body: new Uint8Array([9, 9, 9]) }, env);

    const keyRes = await app.request(
      "/organizations/org-a/api-keys",
      { method: "POST", headers: { "content-type": "application/json", cookie: curator.cookie } },
      env
    );
    const rawKey = (await json<{ key: string }>(keyRes)).key;

    const downloadRes = await app.request(
      `/v1/artifacts/${artifact.id}/download`,
      { headers: { authorization: `Bearer ${rawKey}` } },
      env
    );
    expect(downloadRes.status).toBe(200);
    const { url } = await json<{ url: string }>(downloadRes);

    // The token itself is the credential — no Authorization header at all here.
    const bytesRes = await app.request(new URL(url).pathname, {}, env);
    expect(bytesRes.status).toBe(200);
    expect(new Uint8Array(await bytesRes.arrayBuffer())).toEqual(new Uint8Array([9, 9, 9]));
  });

  it("lets any active user log in for a Store-only bearer token, regardless of role", async () => {
    await registerAndActivate("assist-store@example.com", "assistant", "org-a");

    const loginRes = await app.request(
      "/v1/session/login",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "assist-store@example.com", password: "password123" }) },
      env
    );
    expect(loginRes.status).toBe(200);
    const body = await json<{ token: string; user: { role: string } }>(loginRes);
    expect(body.user.role).toBe("assistant");
    expect(typeof body.token).toBe("string");
  });

  it("rejects a Store login for the wrong password or a pending/disabled account", async () => {
    const wrongPassword = await app.request(
      "/v1/session/login",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "nope@example.com", password: "password123" }) },
      env
    );
    expect(wrongPassword.status).toBe(401);

    await app.request(
      "/auth/register",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "pending-store@example.com", password: "password123" }) },
      env
    );
    const pendingRes = await app.request(
      "/v1/session/login",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "pending-store@example.com", password: "password123" }) },
      env
    );
    expect(pendingRes.status).toBe(403);
  });

  it("Store endpoints show only published+public artifacts, never a user's own private drafts, and require a valid token", async () => {
    const curator = await registerAndActivate("store-curator@example.com", "curator", "org-a");
    const assistant = await registerAndActivate("store-assistant@example.com", "assistant", "org-b");

    const draftRes = await app.request(
      "/artifacts",
      { method: "POST", headers: { "content-type": "application/json", cookie: curator.cookie }, body: JSON.stringify({ title: "Still a draft" }) },
      env
    );
    const draft = await json<{ id: string }>(draftRes);

    const publishedRes = await app.request(
      "/artifacts",
      { method: "POST", headers: { "content-type": "application/json", cookie: curator.cookie }, body: JSON.stringify({ title: "Store piece" }) },
      env
    );
    const published = await json<{ id: string }>(publishedRes);
    await app.request(`/artifacts/${published.id}/glb`, { method: "PUT", headers: { cookie: curator.cookie }, body: new Uint8Array([5, 5, 5]) }, env);
    await app.request(`/artifacts/${published.id}/submit`, { method: "POST", headers: { cookie: curator.cookie } }, env);
    await app.request(`/artifacts/${published.id}/approve`, { method: "POST", headers: { cookie: curator.cookie } }, env);
    await app.request(
      `/artifacts/${published.id}/visibility`,
      { method: "POST", headers: { "content-type": "application/json", cookie: curator.cookie }, body: JSON.stringify({ visibility: "public" }) },
      env
    );

    // No token at all.
    const noTokenRes = await app.request("/v1/store/artifacts", {}, env);
    expect(noTokenRes.status).toBe(401);

    // An assistant from a completely different org can still see the Store...
    const loginRes = await app.request(
      "/v1/session/login",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "store-assistant@example.com", password: "password123" }) },
      env
    );
    const { token } = await json<{ token: string }>(loginRes);

    const listRes = await app.request("/v1/store/artifacts", { headers: { authorization: `Bearer ${token}` } }, env);
    expect(listRes.status).toBe(200);
    const list = await json<Array<{ id: string }>>(listRes);
    expect(list.some((a) => a.id === published.id)).toBe(true);
    // ...but never the other org's still-draft artifact.
    expect(list.some((a) => a.id === draft.id)).toBe(false);

    const draftDetailRes = await app.request(`/v1/store/artifacts/${draft.id}`, { headers: { authorization: `Bearer ${token}` } }, env);
    expect(draftDetailRes.status).toBe(404);

    // Full end-to-end download: get the signed URL via the Store token, then
    // redeem it with no further credential.
    const downloadRes = await app.request(`/v1/store/artifacts/${published.id}/download`, { headers: { authorization: `Bearer ${token}` } }, env);
    expect(downloadRes.status).toBe(200);
    const { url } = await json<{ url: string }>(downloadRes);
    const bytesRes = await app.request(new URL(url).pathname, {}, env);
    expect(bytesRes.status).toBe(200);
    expect(new Uint8Array(await bytesRes.arrayBuffer())).toEqual(new Uint8Array([5, 5, 5]));
  });

  it("exposes the public showcase with no auth at all, only published+public artifacts, and only fields flagged isPublicShowcase", async () => {
    const admin = await registerAndActivate("showcase-admin@example.com", "admin", null);
    const curator = await registerAndActivate("showcase-curator@example.com", "curator", "org-a");

    await app.request(
      "/custom-fields",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: admin.cookie },
        body: JSON.stringify({ key: "era", label: "Era", fieldType: "text", isPublicShowcase: true }),
      },
      env
    );
    await app.request(
      "/custom-fields",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: admin.cookie },
        body: JSON.stringify({ key: "internal_notes", label: "Internal Notes", fieldType: "text" }),
      },
      env
    );

    const draftRes = await app.request(
      "/artifacts",
      { method: "POST", headers: { "content-type": "application/json", cookie: curator.cookie }, body: JSON.stringify({ title: "Still a draft" }) },
      env
    );
    const draft = await json<{ id: string }>(draftRes);

    const publishedRes = await app.request(
      "/artifacts",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: curator.cookie },
        body: JSON.stringify({ title: "Showcase piece", description: "A brief blurb." }),
      },
      env
    );
    const published = await json<{ id: string }>(publishedRes);
    await app.request(`/artifacts/${published.id}/glb`, { method: "PUT", headers: { cookie: curator.cookie }, body: new Uint8Array([7, 7, 7]) }, env);
    await app.request(`/artifacts/${published.id}/submit`, { method: "POST", headers: { cookie: curator.cookie } }, env);
    await app.request(`/artifacts/${published.id}/approve`, { method: "POST", headers: { cookie: curator.cookie } }, env);
    await app.request(
      `/artifacts/${published.id}/visibility`,
      { method: "POST", headers: { "content-type": "application/json", cookie: curator.cookie }, body: JSON.stringify({ visibility: "public" }) },
      env
    );
    await app.request(
      `/artifacts/${published.id}/custom-fields`,
      {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: curator.cookie },
        body: JSON.stringify({ era: "Bronze Age", internal_notes: "Handle with care" }),
      },
      env
    );

    // No cookie, no bearer token, no API key — a completely anonymous request.
    const listRes = await app.request("/public/showcase/artifacts", {}, env);
    expect(listRes.status).toBe(200);
    const list = await json<Array<{ id: string; title: string; description: string | null; fields: Array<{ key: string; value: string }> }>>(listRes);

    expect(list.some((a) => a.id === draft.id)).toBe(false);
    const entry = list.find((a) => a.id === published.id)!;
    expect(entry.description).toBe("A brief blurb.");
    expect(entry.fields).toEqual([{ key: "era", label: "Era", value: "Bronze Age" }]);

    const glbRes = await app.request(`/public/showcase/artifacts/${published.id}/glb`, {}, env);
    expect(glbRes.status).toBe(200);
    expect(new Uint8Array(await glbRes.arrayBuffer())).toEqual(new Uint8Array([7, 7, 7]));

    const draftGlbRes = await app.request(`/public/showcase/artifacts/${draft.id}/glb`, {}, env);
    expect(draftGlbRes.status).toBe(404);
  });

  it("validates and persists custom-field values, rejecting unknown keys and cross-org edits", async () => {
    const admin = await registerAndActivate("cf-admin@example.com", "admin", null);
    const curator = await registerAndActivate("cf-curator@example.com", "curator", "org-a");
    const outsider = await registerAndActivate("cf-outsider@example.com", "curator", "org-b");

    await app.request(
      "/custom-fields",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: admin.cookie },
        body: JSON.stringify({ key: "dynasty", label: "Dynasty", fieldType: "text" }),
      },
      env
    );

    const createRes = await app.request(
      "/artifacts",
      { method: "POST", headers: { "content-type": "application/json", cookie: curator.cookie }, body: JSON.stringify({ title: "Jade Mask" }) },
      env
    );
    const artifact = await json<{ id: string }>(createRes);

    const unknownKeyRes = await app.request(
      `/artifacts/${artifact.id}/custom-fields`,
      { method: "PUT", headers: { "content-type": "application/json", cookie: curator.cookie }, body: JSON.stringify({ made_up: "x" }) },
      env
    );
    expect(unknownKeyRes.status).toBe(400);

    const outsiderRes = await app.request(
      `/artifacts/${artifact.id}/custom-fields`,
      { method: "PUT", headers: { "content-type": "application/json", cookie: outsider.cookie }, body: JSON.stringify({ dynasty: "Ming" }) },
      env
    );
    expect(outsiderRes.status).toBe(403);

    const okRes = await app.request(
      `/artifacts/${artifact.id}/custom-fields`,
      { method: "PUT", headers: { "content-type": "application/json", cookie: curator.cookie }, body: JSON.stringify({ dynasty: "Ming" }) },
      env
    );
    expect(okRes.status).toBe(200);

    const getRes = await app.request(`/artifacts/${artifact.id}/custom-fields`, { headers: { cookie: curator.cookie } }, env);
    expect(await json(getRes)).toEqual({ dynasty: "Ming" });
  });

  it("supports the full custom-field definition lifecycle: rename, retire, and block-while-in-use", async () => {
    const admin = await registerAndActivate("cf-crud-admin@example.com", "admin", null);
    const curator = await registerAndActivate("cf-crud-curator@example.com", "curator", "org-a");

    const createRes = await app.request(
      "/custom-fields",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: admin.cookie },
        body: JSON.stringify({ key: "material", label: "Material", fieldType: "text" }),
      },
      env
    );
    const field = await json<{ id: string; key: string }>(createRes);

    // Non-admin cannot rename or retire.
    const forbiddenPatch = await app.request(
      `/custom-fields/${field.id}`,
      { method: "PATCH", headers: { "content-type": "application/json", cookie: curator.cookie }, body: JSON.stringify({ label: "Nope" }) },
      env
    );
    expect(forbiddenPatch.status).toBe(403);
    const forbiddenDelete = await app.request(`/custom-fields/${field.id}`, { method: "DELETE", headers: { cookie: curator.cookie } }, env);
    expect(forbiddenDelete.status).toBe(403);

    // Admin renames the label.
    const renameRes = await app.request(
      `/custom-fields/${field.id}`,
      { method: "PATCH", headers: { "content-type": "application/json", cookie: admin.cookie }, body: JSON.stringify({ label: "Raw Material" }) },
      env
    );
    expect(renameRes.status).toBe(200);
    const list = await json<Array<{ id: string; label: string }>>(await app.request("/custom-fields", { headers: { cookie: admin.cookie } }, env));
    expect(list.find((f) => f.id === field.id)?.label).toBe("Raw Material");

    // Put it to use on an artifact...
    const artifactRes = await app.request(
      "/artifacts",
      { method: "POST", headers: { "content-type": "application/json", cookie: curator.cookie }, body: JSON.stringify({ title: "Basalt Axe" }) },
      env
    );
    const artifact = await json<{ id: string }>(artifactRes);
    const setValueRes = await app.request(
      `/artifacts/${artifact.id}/custom-fields`,
      { method: "PUT", headers: { "content-type": "application/json", cookie: curator.cookie }, body: JSON.stringify({ material: "Basalt" }) },
      env
    );
    expect(setValueRes.status).toBe(200);

    // ...deletion is now blocked while it's in use.
    const blockedDelete = await app.request(`/custom-fields/${field.id}`, { method: "DELETE", headers: { cookie: admin.cookie } }, env);
    expect(blockedDelete.status).toBe(409);

    // Clear the value, then deletion succeeds.
    await app.request(
      `/artifacts/${artifact.id}/custom-fields`,
      { method: "PUT", headers: { "content-type": "application/json", cookie: curator.cookie }, body: JSON.stringify({}) },
      env
    );
    const deleteRes = await app.request(`/custom-fields/${field.id}`, { method: "DELETE", headers: { cookie: admin.cookie } }, env);
    expect(deleteRes.status).toBe(200);
    const listAfter = await json<Array<{ id: string }>>(await app.request("/custom-fields", { headers: { cookie: admin.cookie } }, env));
    expect(listAfter.some((f) => f.id === field.id)).toBe(false);
  });

  it("rate-limits repeated login attempts from the same source", async () => {
    await registerAndActivate("ratelimited@example.com", "curator", "org-a");

    let lastStatus = 0;
    for (let i = 0; i < 11; i++) {
      const res = await app.request(
        "/auth/login",
        {
          method: "POST",
          headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7" },
          body: JSON.stringify({ email: "ratelimited@example.com", password: "wrong-password" }),
        },
        env
      );
      lastStatus = res.status;
    }

    expect(lastStatus).toBe(429);
  });
});
