import type { Hono } from "hono";
import { can, canView, transition, validateCustomFieldValues, MAX_GLB_SIZE_BYTES, type Artifact } from "@vestoxr/shared";
import { requireAuth } from "../middleware/auth.js";
import type { HonoEnv } from "../app.js";

export function registerArtifactRoutes(app: Hono<HonoEnv>) {
  app.get("/artifacts", requireAuth, async (c) => {
    const actor = c.get("user")!;
    const all = await c.get("repo").listArtifacts();
    return c.json(all.filter((a) => canView(actor, a)));
  });

  app.get("/artifacts/:id", requireAuth, async (c) => {
    const actor = c.get("user")!;
    const artifact = await c.get("repo").getArtifactById(c.req.param("id"));
    if (!artifact || !canView(actor, artifact)) return c.json({ error: "Not found." }, 404);
    return c.json(artifact);
  });

  // Creates the DB row in 'draft' status; the actual GLB upload happens via a
  // separate presigned-R2-PUT step (ERS §10), not modeled in this scaffold.
  app.post("/artifacts", requireAuth, async (c) => {
    const actor = c.get("user")!;
    if (!can(actor, "artifact.upload")) return c.json({ error: "Forbidden." }, 403);

    const body = await c.req.json<{ title?: string; description?: string; organizationId?: string }>();
    if (!body.title) return c.json({ error: "title is required." }, 400);

    const organizationId = actor.role === "admin" ? body.organizationId : actor.organizationId;
    if (!organizationId) return c.json({ error: "organizationId is required." }, 400);

    const artifact: Artifact = {
      id: crypto.randomUUID(),
      organizationId,
      createdBy: actor.id,
      title: body.title,
      description: body.description?.trim() || null,
      status: "draft",
      visibility: "private",
      glbR2Key: null,
      thumbnailR2Key: null,
    };
    await c.get("repo").createArtifact(artifact);
    return c.json(artifact, 201);
  });

  app.patch("/artifacts/:id", requireAuth, async (c) => {
    const actor = c.get("user")!;
    const repo = c.get("repo");
    const artifact = await repo.getArtifactById(c.req.param("id"));
    if (!artifact) return c.json({ error: "Not found." }, 404);
    if (!can(actor, "artifact.editMetadata", { artifact })) return c.json({ error: "Forbidden." }, 403);

    const body = await c.req.json<{ title?: string; description?: string | null }>();
    await repo.updateArtifact(artifact.id, {
      title: body.title ?? artifact.title,
      description: body.description !== undefined ? body.description?.trim() || null : artifact.description,
    });
    return c.json({ ok: true });
  });

  // Direct-to-Worker GLB upload (streamed into R2 via the Workers binding).
  // Deviates from the presigned-PUT flow sketched in ERS §10: this scaffold's
  // Env only carries an R2Bucket binding (no S3-compatible access keys), and
  // Workers can stream a request body straight into R2 without buffering it,
  // so there's no need for a presigned-URL round trip. See ERS §10 note.
  app.put("/artifacts/:id/glb", requireAuth, async (c) => {
    const actor = c.get("user")!;
    const repo = c.get("repo");
    const artifact = await repo.getArtifactById(c.req.param("id"));
    if (!artifact) return c.json({ error: "Not found." }, 404);
    if (!can(actor, "artifact.editMetadata", { artifact })) return c.json({ error: "Forbidden." }, 403);
    if (!c.req.raw.body) return c.json({ error: "A GLB file body is required." }, 400);

    // Soft 200MB limit (ERS §7). Content-Length is client-supplied and not a
    // hard guarantee, but it's enough to reject oversized uploads up front
    // rather than streaming the whole thing into R2 first.
    const contentLength = Number(c.req.header("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_GLB_SIZE_BYTES) {
      return c.json({ error: `GLB file exceeds the ${MAX_GLB_SIZE_BYTES / (1024 * 1024)}MB limit.` }, 413);
    }

    const key = `${artifact.organizationId}/${artifact.id}/model.glb`;
    await c.env.BUCKET.put(key, c.req.raw.body, {
      httpMetadata: { contentType: "model/gltf-binary" },
    });
    await repo.updateArtifact(artifact.id, { glbR2Key: key });
    return c.json({ glbR2Key: key });
  });

  // Client-captured PNG preview upload (ERS §7: rendered off-screen, captured
  // from canvas, uploaded at upload time — no server-side 3D renderer needed).
  app.put("/artifacts/:id/thumbnail", requireAuth, async (c) => {
    const actor = c.get("user")!;
    const repo = c.get("repo");
    const artifact = await repo.getArtifactById(c.req.param("id"));
    if (!artifact) return c.json({ error: "Not found." }, 404);
    if (!can(actor, "artifact.editMetadata", { artifact })) return c.json({ error: "Forbidden." }, 403);
    if (!c.req.raw.body) return c.json({ error: "A PNG thumbnail body is required." }, 400);

    const key = `${artifact.organizationId}/${artifact.id}/thumbnail.png`;
    await c.env.BUCKET.put(key, c.req.raw.body, { httpMetadata: { contentType: "image/png" } });
    await repo.updateArtifact(artifact.id, { thumbnailR2Key: key });
    return c.json({ thumbnailR2Key: key });
  });

  app.get("/artifacts/:id/thumbnail", requireAuth, async (c) => {
    const actor = c.get("user")!;
    const repo = c.get("repo");
    const artifact = await repo.getArtifactById(c.req.param("id"));
    if (!artifact || !canView(actor, artifact)) return c.json({ error: "Not found." }, 404);
    if (!artifact.thumbnailR2Key) return c.json({ error: "No thumbnail uploaded yet." }, 404);

    const object = await c.env.BUCKET.get(artifact.thumbnailR2Key);
    if (!object) return c.json({ error: "Thumbnail missing from storage." }, 404);

    return new Response(object.body, { headers: { "content-type": "image/png" } });
  });

  // Admin-managed custom-field values for this artifact (ADR 0005) — read is
  // gated by the same visibility rule as the artifact itself; writes require
  // metadata-edit permission, and every submitted key/value is validated
  // against the current catalog before being persisted.
  app.get("/artifacts/:id/custom-fields", requireAuth, async (c) => {
    const actor = c.get("user")!;
    const repo = c.get("repo");
    const artifact = await repo.getArtifactById(c.req.param("id"));
    if (!artifact || !canView(actor, artifact)) return c.json({ error: "Not found." }, 404);
    return c.json(await repo.getArtifactCustomFieldValues(artifact.id));
  });

  app.put("/artifacts/:id/custom-fields", requireAuth, async (c) => {
    const actor = c.get("user")!;
    const repo = c.get("repo");
    const artifact = await repo.getArtifactById(c.req.param("id"));
    if (!artifact) return c.json({ error: "Not found." }, 404);
    if (!can(actor, "artifact.editMetadata", { artifact })) return c.json({ error: "Forbidden." }, 403);

    const values = await c.req.json<Record<string, string>>();
    const catalog = await repo.listCustomFieldDefinitions();
    const result = validateCustomFieldValues(catalog, values);
    if (!result.ok) return c.json({ error: result.error }, 400);

    await repo.setArtifactCustomFieldValues(artifact.id, values);
    return c.json(values);
  });

  // Streams the GLB back through the Worker (bucket is private, ERS §13).
  app.get("/artifacts/:id/glb", requireAuth, async (c) => {
    const actor = c.get("user")!;
    const repo = c.get("repo");
    const artifact = await repo.getArtifactById(c.req.param("id"));
    if (!artifact || !canView(actor, artifact)) return c.json({ error: "Not found." }, 404);
    if (!artifact.glbR2Key) return c.json({ error: "No GLB uploaded yet." }, 404);

    const object = await c.env.BUCKET.get(artifact.glbR2Key);
    if (!object) return c.json({ error: "GLB file missing from storage." }, 404);

    return new Response(object.body, {
      headers: { "content-type": "model/gltf-binary" },
    });
  });

  app.delete("/artifacts/:id", requireAuth, async (c) => {
    const actor = c.get("user")!;
    const repo = c.get("repo");
    const artifact = await repo.getArtifactById(c.req.param("id"));
    if (!artifact) return c.json({ error: "Not found." }, 404);
    if (!can(actor, "artifact.delete", { artifact })) return c.json({ error: "Forbidden." }, 403);

    if (artifact.glbR2Key) await c.env.BUCKET.delete(artifact.glbR2Key);
    await repo.deleteArtifact(artifact.id);
    return c.json({ ok: true });
  });

  // Lifecycle transitions (ADR 0004) — the route only calls `transition` and
  // persists its result; it contains no role/status branching of its own.
  for (const [path, action] of [
    ["submit", "submit"],
    ["approve", "approve"],
    ["reject", "reject"],
  ] as const) {
    app.post(`/artifacts/:id/${path}`, requireAuth, async (c) => {
      const actor = c.get("user")!;
      const repo = c.get("repo");
      const artifact = await repo.getArtifactById(c.req.param("id"));
      if (!artifact) return c.json({ error: "Not found." }, 404);

      const result = transition(actor, artifact, action);
      if (!result.ok) return c.json({ error: result.error }, 403);

      await repo.updateArtifact(artifact.id, { status: result.nextStatus });
      return c.json({ status: result.nextStatus });
    });
  }

  // Toggling public/private distribution (ADR 0003) is independent of the
  // status state machine, but still gated by the same publish permission.
  app.post("/artifacts/:id/visibility", requireAuth, async (c) => {
    const actor = c.get("user")!;
    const repo = c.get("repo");
    const artifact = await repo.getArtifactById(c.req.param("id"));
    if (!artifact) return c.json({ error: "Not found." }, 404);
    if (!can(actor, "artifact.publish", { artifact })) return c.json({ error: "Forbidden." }, 403);

    const body = await c.req.json<{ visibility?: "private" | "public" }>();
    if (body.visibility !== "private" && body.visibility !== "public") {
      return c.json({ error: "visibility must be 'private' or 'public'." }, 400);
    }

    await repo.updateArtifact(artifact.id, { visibility: body.visibility });
    return c.json({ visibility: body.visibility });
  });
}
