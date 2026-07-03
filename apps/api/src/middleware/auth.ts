import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { verifySession } from "../lib/jwt.js";
import type { HonoEnv } from "../app.js";

export const SESSION_COOKIE = "vestoxr_session";

/** Loads the current user (if any) from the session cookie; never blocks the request. */
export const attachUser = createMiddleware<HonoEnv>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const claims = await verifySession(token, c.env.JWT_SECRET);
    if (claims) {
      const user = await c.get("repo").getUserById(claims.sub);
      // Re-validate against current DB state (ADR 0002) — a token survives
      // until its exp even if an admin disabled the account moments ago.
      if (user && user.status === "active") {
        c.set("user", user);
      }
    }
  }
  await next();
});

/** Blocks the request unless attachUser found an active, authenticated user. */
export const requireAuth = createMiddleware<HonoEnv>(async (c, next) => {
  if (!c.get("user")) return c.json({ error: "Authentication required." }, 401);
  await next();
});
