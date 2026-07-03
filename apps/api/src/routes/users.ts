import type { Hono } from "hono";
import { can } from "@vestoxr/shared";
import { requireAuth } from "../middleware/auth.js";
import type { HonoEnv } from "../app.js";

export function registerUserRoutes(app: Hono<HonoEnv>) {
  // Listing/managing accounts is admin-only (ADR 0002, ERS §5) — gated by the
  // same shared RBAC predicate every other route uses.
  app.get("/users", requireAuth, async (c) => {
    const actor = c.get("user")!;
    if (!can(actor, "user.assignRoleAndOrg")) return c.json({ error: "Forbidden." }, 403);

    const users = await c.get("repo").listUsers();
    return c.json(
      users.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        organizationId: u.organizationId,
        status: u.status,
      }))
    );
  });

  // Approve/assign role+org, or disable — the same admin-only action set (ADR 0002).
  app.patch("/users/:id", requireAuth, async (c) => {
    const actor = c.get("user")!;
    if (!can(actor, "user.assignRoleAndOrg")) return c.json({ error: "Forbidden." }, 403);

    const id = c.req.param("id");
    const repo = c.get("repo");
    const target = await repo.getUserById(id);
    if (!target) return c.json({ error: "User not found." }, 404);

    const body = await c.req.json<{
      role?: "admin" | "curator" | "assistant";
      organizationId?: string | null;
      status?: "active" | "disabled";
    }>();

    await repo.updateUser(id, {
      role: body.role ?? target.role,
      organizationId: body.organizationId !== undefined ? body.organizationId : target.organizationId,
      status: body.status ?? target.status,
    });

    return c.json({ ok: true });
  });
}
