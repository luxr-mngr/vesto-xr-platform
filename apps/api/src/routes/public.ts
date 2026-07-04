import type { Context, Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { authorizeApiKeyAccess, isStorePublic } from "@vestoxr/shared";
import { hashApiKey } from "../lib/apiKey.js";
import { verifyPassword } from "../lib/password.js";
import { signSession, verifySession } from "../lib/jwt.js";
import { rateLimit } from "../middleware/rateLimit.js";
import type { HonoEnv } from "../app.js";

const DOWNLOAD_TOKEN_TTL_SECONDS = 600; // 10 minutes (ERS §10, ADR 0006)
const USER_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days, matching the web session cookie's TTL

// 120 requests/minute per credential (API key or user token) — generous for a
// polling client, but bounds scraping/abuse of a single credential (ERS §13).
const publicApiRateLimit = rateLimit({
  limit: 120,
  windowSeconds: 60,
  bucketKey: (c) => `publicapi:${c.req.header("Authorization") ?? "none"}`,
});

// Tighter limit on the login endpoint itself, mirroring /auth/login's
// brute-force protection (bucketed by IP, since there's no credential yet).
const sessionLoginRateLimit = rateLimit({
  limit: 10,
  windowSeconds: 60,
  bucketKey: (c) => `store-login:${c.req.header("cf-connecting-ip") ?? "unknown"}`,
});

const requireApiKey = createMiddleware<HonoEnv>(async (c, next) => {
  const auth = c.req.header("Authorization");
  const rawKey = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
  if (!rawKey) return c.json({ error: "Missing API key." }, 401);

  const key = await c.get("repo").getApiKeyByHash(await hashApiKey(rawKey));
  if (!key || key.revokedAt !== null) return c.json({ error: "Invalid or revoked API key." }, 401);

  c.set("apiKey", key);
  await next();
});

/**
 * Gates the /v1/store/* routes: any active user of any role/organization,
 * authenticated with the bearer token issued by POST /v1/session/login (ADR
 * 0006 addendum) — not the org-scoped API key used by /v1/artifacts/*, and
 * not the httpOnly session cookie the web app uses. This is deliberately a
 * separate, narrower surface (Store reads only) rather than teaching the
 * existing cookie-based requireAuth to also accept a header, so a token meant
 * for a read-only Store viewer can never be reused against the admin app's
 * write routes.
 */
const requireUserToken = createMiddleware<HonoEnv>(async (c, next) => {
  const auth = c.req.header("Authorization");
  const rawToken = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
  if (!rawToken) return c.json({ error: "Missing bearer token." }, 401);

  const claims = await verifySession(rawToken, c.env.JWT_SECRET);
  if (!claims) return c.json({ error: "Expired or invalid token." }, 401);

  const user = await c.get("repo").getUserById(claims.sub);
  if (!user || user.status !== "active") return c.json({ error: "Expired or invalid token." }, 401);

  c.set("user", user);
  await next();
});

/**
 * External API (Unreal Engine, etc.) — authenticated by per-org API key
 * (ADR 0006), never by the session cookie. `/v1/artifacts/:id/download`
 * hands back a short-lived signed download token rather than the bytes
 * themselves; `/v1/download/:token` is the only route that reads R2.
 *
 * `/v1/store/*` is a second, narrower auth mode for the same download-token
 * pattern: any logged-in user (any role/org) can browse and download the
 * public Store — not their own organization's private library — using a
 * bearer token obtained from their real VestoXR login rather than a shared
 * per-org API key. Meant for read-only viewer clients (e.g. a VR visualizer)
 * where embedding a single shared org API key in a distributed client isn't
 * the right fit.
 */
export function registerPublicRoutes(app: Hono<HonoEnv>) {
  app.use("/v1/*", publicApiRateLimit);

  app.get("/v1/artifacts", requireApiKey, async (c) => {
    const apiKey = c.get("apiKey")!;
    const all = await c.get("repo").listArtifacts();
    return c.json(all.filter((a) => authorizeApiKeyAccess(apiKey, a)));
  });

  app.get("/v1/artifacts/:id", requireApiKey, async (c) => {
    const apiKey = c.get("apiKey")!;
    const artifact = await c.get("repo").getArtifactById(c.req.param("id"));
    if (!artifact || !authorizeApiKeyAccess(apiKey, artifact)) return c.json({ error: "Not found." }, 404);
    return c.json(artifact);
  });

  app.get("/v1/artifacts/:id/download", requireApiKey, async (c) => {
    const apiKey = c.get("apiKey")!;
    const artifact = await c.get("repo").getArtifactById(c.req.param("id"));
    if (!artifact || !authorizeApiKeyAccess(apiKey, artifact)) return c.json({ error: "Not found." }, 404);
    if (!artifact.glbR2Key) return c.json({ error: "This artifact has no uploaded GLB yet." }, 404);
    return c.json(await issueDownloadToken(c, artifact.id, "glb"));
  });

  // Same signed-URL pattern as /download, for the generated PNG preview (ERS §11).
  app.get("/v1/artifacts/:id/thumbnail", requireApiKey, async (c) => {
    const apiKey = c.get("apiKey")!;
    const artifact = await c.get("repo").getArtifactById(c.req.param("id"));
    if (!artifact || !authorizeApiKeyAccess(apiKey, artifact)) return c.json({ error: "Not found." }, 404);
    if (!artifact.thumbnailR2Key) return c.json({ error: "This artifact has no thumbnail yet." }, 404);
    return c.json(await issueDownloadToken(c, artifact.id, "thumbnail"));
  });

  // Issues a bearer token for any active user (any role/org) — separate from
  // both the web app's httpOnly cookie and the org-scoped API key.
  app.post("/v1/session/login", sessionLoginRateLimit, async (c) => {
    const body = await c.req.json<{ email?: string; password?: string }>();
    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    if (!email || !password) return c.json({ error: "Email and password are required." }, 400);

    const repo = c.get("repo");
    const user = await repo.getUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return c.json({ error: "Invalid credentials." }, 401);
    }
    if (user.status !== "active") {
      return c.json({ error: "Account is not active.", status: user.status }, 403);
    }

    const exp = Math.floor(Date.now() / 1000) + USER_TOKEN_TTL_SECONDS;
    const token = await signSession({ sub: user.id, exp }, c.env.JWT_SECRET);
    return c.json({
      token,
      expires_at: new Date(exp * 1000).toISOString(),
      user: { id: user.id, email: user.email, role: user.role, organizationId: user.organizationId },
    });
  });

  app.get("/v1/store/artifacts", requireUserToken, async (c) => {
    const all = await c.get("repo").listArtifacts();
    return c.json(all.filter(isStorePublic));
  });

  app.get("/v1/store/artifacts/:id", requireUserToken, async (c) => {
    const artifact = await c.get("repo").getArtifactById(c.req.param("id"));
    if (!artifact || !isStorePublic(artifact)) return c.json({ error: "Not found." }, 404);
    return c.json(artifact);
  });

  app.get("/v1/store/artifacts/:id/download", requireUserToken, async (c) => {
    const artifact = await c.get("repo").getArtifactById(c.req.param("id"));
    if (!artifact || !isStorePublic(artifact)) return c.json({ error: "Not found." }, 404);
    if (!artifact.glbR2Key) return c.json({ error: "This artifact has no uploaded GLB yet." }, 404);
    return c.json(await issueDownloadToken(c, artifact.id, "glb"));
  });

  app.get("/v1/store/artifacts/:id/thumbnail", requireUserToken, async (c) => {
    const artifact = await c.get("repo").getArtifactById(c.req.param("id"));
    if (!artifact || !isStorePublic(artifact)) return c.json({ error: "Not found." }, 404);
    if (!artifact.thumbnailR2Key) return c.json({ error: "This artifact has no thumbnail yet." }, 404);
    return c.json(await issueDownloadToken(c, artifact.id, "thumbnail"));
  });

  // Deliberately ungated by requireApiKey/requireUserToken: the token itself
  // is the credential (short-lived, single-artifact-scoped), matching the
  // "signed URL delivers the bytes" half of ADR 0006. `kind` picks the GLB
  // vs. the thumbnail R2 object without needing two separate routes. Shared
  // by both the API-key flow and the /v1/store/* user-token flow above.
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

async function issueDownloadToken(c: Context<HonoEnv>, artifactId: string, kind: "glb" | "thumbnail") {
  const exp = Math.floor(Date.now() / 1000) + DOWNLOAD_TOKEN_TTL_SECONDS;
  const token = await signSession({ sub: artifactId, exp, kind }, c.env.JWT_SECRET);
  const url = new URL(c.req.url);
  return { url: `${url.origin}/v1/download/${token}`, expires_at: new Date(exp * 1000).toISOString() };
}
