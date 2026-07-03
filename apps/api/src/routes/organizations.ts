import type { Hono } from "hono";
import { can, type Organization } from "@vestoxr/shared";
import { requireAuth } from "../middleware/auth.js";
import type { HonoEnv } from "../app.js";

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function registerOrganizationRoutes(app: Hono<HonoEnv>) {
  // Any active user can read the list to populate role/org assignment forms;
  // memberCount is computed (not stored) so every caller gets it for free.
  app.get("/organizations", requireAuth, async (c) => {
    const repo = c.get("repo");
    const [orgs, counts] = await Promise.all([repo.listOrganizations(), repo.countUsersByOrganization()]);
    return c.json(orgs.map((o) => ({ ...o, memberCount: counts[o.id] ?? 0 })));
  });

  // Only Admins may provision new organizations (ERS §11, ADR 0002).
  app.post("/organizations", requireAuth, async (c) => {
    const actor = c.get("user")!;
    if (!can(actor, "organization.create")) return c.json({ error: "Forbidden." }, 403);

    const body = await c.req.json<{ name?: string }>().catch(() => ({}) as { name?: string });
    const name = body.name?.trim();
    const slug = name ? slugify(name) : "";
    if (!name || !slug) return c.json({ error: "A name is required." }, 400);

    const repo = c.get("repo");
    if ((await repo.listOrganizations()).some((o) => o.slug === slug)) {
      return c.json({ error: "An organization with that name already exists." }, 409);
    }

    const org: Organization = { id: crypto.randomUUID(), name, slug };
    await repo.createOrganization(org);
    return c.json(org, 201);
  });

  // Rename — reuses the same admin-only gate as create (ERS §12 item 11); no
  // separate Action type since org management as a whole is admin-only.
  app.patch("/organizations/:id", requireAuth, async (c) => {
    const actor = c.get("user")!;
    if (!can(actor, "organization.create")) return c.json({ error: "Forbidden." }, 403);

    const id = c.req.param("id");
    const repo = c.get("repo");
    const existing = await repo.getOrganizationById(id);
    if (!existing) return c.json({ error: "Organization not found." }, 404);

    const body = await c.req.json<{ name?: string }>().catch(() => ({}) as { name?: string });
    const name = body.name?.trim();
    if (!name) return c.json({ error: "A name is required." }, 400);

    const slug = slugify(name);
    if (!slug) return c.json({ error: "A name is required." }, 400);

    if ((await repo.listOrganizations()).some((o) => o.id !== id && o.slug === slug)) {
      return c.json({ error: "An organization with that name already exists." }, 409);
    }

    await repo.updateOrganization(id, { name, slug });
    return c.json({ ...existing, name, slug });
  });
}
