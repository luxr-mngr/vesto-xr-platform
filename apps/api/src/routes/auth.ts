import type { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { signSession } from "../lib/jwt.js";
import { SESSION_COOKIE } from "../middleware/auth.js";
import type { HonoEnv } from "../app.js";
import type { StoredUser } from "../repo/types.js";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days (ERS §6)

export function registerAuthRoutes(app: Hono<HonoEnv>) {
  // Account starts 'pending' with no role/org — an Admin must activate it (ADR 0002).
  app.post("/auth/register", async (c) => {
    const body = await c.req.json<{ email?: string; password?: string }>();
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
      role: null,
      organizationId: null,
      status: "pending",
    };
    await repo.createUser(user);

    return c.json({ status: "pending", message: "Registered. Awaiting admin approval." }, 201);
  });

  app.post("/auth/login", async (c) => {
    const body = await c.req.json<{ email?: string; password?: string }>();
    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    if (!email || !password) return c.json({ error: "Email and password are required." }, 400);

    const repo = c.get("repo");
    const user = await repo.getUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return c.json({ error: "Invalid credentials." }, 401);
    }

    if (user.status === "pending") {
      return c.json({ error: "Account is awaiting admin approval.", status: "pending" }, 403);
    }
    if (user.status === "disabled") {
      return c.json({ error: "Account has been disabled.", status: "disabled" }, 403);
    }

    const token = await signSession(
      { sub: user.id, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS },
      c.env.JWT_SECRET
    );
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });

    return c.json({ id: user.id, email: user.email, role: user.role, organizationId: user.organizationId });
  });

  app.post("/auth/logout", async (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  app.get("/auth/me", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ user: null });
    return c.json({ user: { id: user.id, email: user.email, role: user.role, organizationId: user.organizationId } });
  });
}
