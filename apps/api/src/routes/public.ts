import type { Hono } from "hono";
import { authorizeApiKeyAccess } from "@vestoxr/shared";
import { hashApiKey } from "../lib/apiKey.js";
import { signSession, verifySession } from "../lib/jwt.js";
import { rateLimit } from "../middleware/rateLimit.js";
import type { HonoEnv } from "../app.js";

const DOWNLOAD_TOKEN_TTL_SECONDS = 600; // 10 minutes (ERS §10, ADR 0006)

// 120 requests/minute per API key — generous for a polling Unreal client, but
// bounds scraping/abuse of a single org's key (ERS §13).
const publicApiRateLimit = rateLimit({
  limit: 120,
  windowSeconds: 60,
  bucketKey: (c) => `publicapi:${c.req.header("Authorization") ?? "none"}`,
});

/**
 * External API (Unreal Engine, etc.) — authenticated by per-org API key
 * (ADR 0006), never by the session cookie. `/v1/artifacts/:id/download`
 * hands back a short-lived signed download token rather than the bytes
 * themselves; `/v1/download/:token` is the only route that reads R2.
 */
export function registerPublicRoutes(app: Hono<HonoEnv>) {
  app.use("/v1/*", publicApiRateLimit);

  app.use("/v1/*", async (c, next) => {
    const auth = c.req.header("Authorization");
    const rawKey = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
    if (!rawKey) return c.json({ error: "Missing API key." }, 401);

    const key = await c.get("repo").getApiKeyByHash(await hashApiKey(rawKey));
    if (!key || key.revokedAt !== null) return c.json({ error: "Invalid or revoked API key." }, 401);

    c.set("apiKey", key);
    await next();
  });

  app.get("/v1/artifacts", async (c) => {
    const apiKey = c.get("apiKey")!;
    const all = await c.get("repo").listArtifacts();
    return c.json(all.filter((a) => authorizeApiKeyAccess(apiKey, a)));
  });

  app.get("/v1/artifacts/:id", async (c) => {
    const apiKey = c.get("apiKey")!;
    const artifact = await c.get("repo").getArtifactById(c.req.param("id"));
    if (!artifact || !authorizeApiKeyAccess(apiKey, artifact)) return c.json({ error: "Not found." }, 404);
    return c.json(artifact);
  });

  app.get("/v1/artifacts/:id/download", async (c) => {
    const apiKey = c.get("apiKey")!;
    const artifact = await c.get("repo").getArtifactById(c.req.param("id"));
    if (!artifact || !authorizeApiKeyAccess(apiKey, artifact)) return c.json({ error: "Not found." }, 404);
    if (!artifact.glbR2Key) return c.json({ error: "This artifact has no uploaded GLB yet." }, 404);

    const exp = Math.floor(Date.now() / 1000) + DOWNLOAD_TOKEN_TTL_SECONDS;
    const token = await signSession({ sub: artifact.id, exp, kind: "glb" }, c.env.JWT_SECRET);
    const url = new URL(c.req.url);
    return c.json({
      url: `${url.origin}/v1/download/${token}`,
      expires_at: new Date(exp * 1000).toISOString(),
    });
  });

  // Same signed-URL pattern as /download, for the generated PNG preview (ERS §11).
  app.get("/v1/artifacts/:id/thumbnail", async (c) => {
    const apiKey = c.get("apiKey")!;
    const artifact = await c.get("repo").getArtifactById(c.req.param("id"));
    if (!artifact || !authorizeApiKeyAccess(apiKey, artifact)) return c.json({ error: "Not found." }, 404);
    if (!artifact.thumbnailR2Key) return c.json({ error: "This artifact has no thumbnail yet." }, 404);

    const exp = Math.floor(Date.now() / 1000) + DOWNLOAD_TOKEN_TTL_SECONDS;
    const token = await signSession({ sub: artifact.id, exp, kind: "thumbnail" }, c.env.JWT_SECRET);
    const url = new URL(c.req.url);
    return c.json({
      url: `${url.origin}/v1/download/${token}`,
      expires_at: new Date(exp * 1000).toISOString(),
    });
  });

  // Deliberately outside the API-key gate above: the token itself is the
  // credential (short-lived, single-artifact-scoped), matching the "signed
  // URL delivers the bytes" half of ADR 0006. `kind` picks the GLB vs. the
  // thumbnail R2 object without needing two separate token-verifying routes.
  app.get("/v1/download/:token", async (c) => {
    const claims = await verifySession(c.req.param("token"), c.env.JWT_SECRET);
    if (!claims) return c.json({ error: "Expired or invalid download link." }, 401);

    const artifact = await c.get("repo").getArtifactById(claims.sub);
    if (!artifact) return c.json({ error: "Not found." }, 404);

    const isThumbnail = claims.kind === "thumbnail";
    const key = isThumbnail ? artifact.thumbnailR2Key : artifact.glbR2Key;
    if (!key) return c.json({ error: "Not found." }, 404);

    const object = await c.env.BUCKET.get(key);
    if (!object) return c.json({ error: "Not found." }, 404);

    return new Response(object.body, {
      headers: { "Content-Type": isThumbnail ? "image/png" : "model/gltf-binary" },
    });
  });
}
