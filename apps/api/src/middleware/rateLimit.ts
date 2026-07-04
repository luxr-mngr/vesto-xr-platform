import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import type { HonoEnv } from "../app.js";

export interface RateLimitOptions {
  /** Max requests allowed per window. */
  limit: number;
  windowSeconds: number;
  /** Identifies the caller for this bucket (e.g. IP for login, API key id for the public API). */
  bucketKey: (c: Context<HonoEnv>) => string;
}

/**
 * Fixed-window rate limiter backed by the shared D1-counter Repo method (ERS §13).
 * Deliberately per-route rather than global: login and the public API have very
 * different traffic shapes and need independent limits.
 */
export function rateLimit({ limit, windowSeconds, bucketKey }: RateLimitOptions) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
    const key = bucketKey(c);
    const count = await c.get("repo").incrementRateLimitHit(key, windowStart);
    if (count > limit) {
      return c.json({ error: "Too many requests. Please try again later." }, 429);
    }
    await next();
  });
}
