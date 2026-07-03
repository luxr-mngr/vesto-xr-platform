import type { Hono } from "hono";
import { can } from "@vestoxr/shared";
import { requireAuth } from "../middleware/auth.js";
import { hashPassword } from "../lib/password.js";
import type { HonoEnv } from "../app.js";
import type { StoredUser } from "../repo/types.js";

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

  // Admin-created accounts skip the pending-approval queue: an admin picking
  // the role/org/password up front is equivalent to register + approve.
  app.post("/users", requireAuth, async (c) => {
    const actor = c.get("user")!;
    if (!can(actor, "user.create")) return c.json({ error: "Forbidden." }, 403);

    const body = await c.req.json<{
      email?: string;
      password?: string;
      role?: "admin" | "curator" | "assistant";
      organizationId?: string | null;
    }>();
    const email = body.email?.trim().toLowerCase();
    const password = body.password;

    if (!email || !password || password.length < 8) {
      return c.json({ error: "A valid email and an 8+ character password are required." }, 400);
    }

    const repo = c.get("repo");
    if (await repo.getUserByEmail(email)) {
      return c.json({ error: "An account with that email already exists." }, 409);
    }

    const user: StoredUser = {
      id: crypto.randomUUID(),
      email,
      passwordHash: await hashPassword(password),
      role: body.role ?? null,
      organizationId: body.organizationId ?? null,
      status: "active",
    };
    await repo.createUser(user);

    return c.json(
      { id: user.id, email: user.email, role: user.role, organizationId: user.organizationId, status: user.status },
      201
    );
  });

  app.delete("/users/:id", requireAuth, async (c) => {
    const actor = c.get("user")!;
    if (!can(actor, "user.delete")) return c.json({ error: "Forbidden." }, 403);

    const id = c.req.param("id");
    if (id === actor.id) return c.json({ error: "You cannot delete your own account." }, 400);

    const repo = c.get("repo");
    const target = await repo.getUserById(id);
    if (!target) return c.json({ error: "User not found." }, 404);

    await repo.deleteUser(id);
    return c.json({ ok: true });
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
