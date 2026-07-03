import type { Hono } from "hono";
import { can } from "@vestoxr/shared";
import { requireAuth } from "../middleware/auth.js";
import { generateRawApiKey, hashApiKey } from "../lib/apiKey.js";
import type { HonoEnv } from "../app.js";

export function registerApiKeyRoutes(app: Hono<HonoEnv>) {
  app.get("/organizations/:orgId/api-keys", requireAuth, async (c) => {
    const actor = c.get("user")!;
    const organizationId = c.req.param("orgId");
    if (!can(actor, "apiKey.manage", { organizationId })) return c.json({ error: "Forbidden." }, 403);

    const keys = await c.get("repo").listApiKeysForOrganization(organizationId);
    return c.json(keys.map((k) => ({ id: k.id, revokedAt: k.revokedAt })));
  });

  // Raw key is returned exactly once here and never again (ADR 0006).
  app.post("/organizations/:orgId/api-keys", requireAuth, async (c) => {
    const actor = c.get("user")!;
    const organizationId = c.req.param("orgId");
    if (!can(actor, "apiKey.manage", { organizationId })) return c.json({ error: "Forbidden." }, 403);

    const body = await c.req.json<{ label?: string }>().catch(() => ({}) as { label?: string });
    const rawKey = generateRawApiKey();
    const id = crypto.randomUUID();

    await c.get("repo").createApiKey({
      id,
      organizationId,
      revokedAt: null,
      keyHash: await hashApiKey(rawKey),
      label: body.label ?? "API key",
    });

    return c.json({ id, key: rawKey }, 201);
  });

  app.delete("/organizations/:orgId/api-keys/:id", requireAuth, async (c) => {
    const actor = c.get("user")!;
    const organizationId = c.req.param("orgId");
    if (!can(actor, "apiKey.manage", { organizationId })) return c.json({ error: "Forbidden." }, 403);

    await c.get("repo").revokeApiKey(c.req.param("id"));
    return c.json({ ok: true });
  });
}
