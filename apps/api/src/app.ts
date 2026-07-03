import { Hono } from "hono";
import type { ApiKey, User } from "@vestoxr/shared";
import type { Env } from "./types/env.js";
import type { Repo } from "./repo/types.js";
import { D1Repo } from "./repo/d1Repo.js";
import { attachUser } from "./middleware/auth.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerUserRoutes } from "./routes/users.js";
import { registerArtifactRoutes } from "./routes/artifacts.js";
import { registerCustomFieldRoutes } from "./routes/customFields.js";
import { registerApiKeyRoutes } from "./routes/apiKeys.js";
import { registerOrganizationRoutes } from "./routes/organizations.js";
import { registerPublicRoutes } from "./routes/public.js";

export interface HonoEnv {
  Bindings: Env;
  Variables: {
    repo: Repo;
    user: User | null;
    apiKey: ApiKey | null;
  };
}

/**
 * Builds the Hono app. `overrideRepo` lets tests inject a MemoryRepo instead
 * of talking to a real D1 binding (ADR 0008: routes are thin, so this is the
 * only seam needed to test them without Miniflare).
 */
export function createApp(overrideRepo?: Repo) {
  const app = new Hono<HonoEnv>();

  app.use("*", async (c, next) => {
    c.set("repo", overrideRepo ?? new D1Repo(c.env.DB));
    c.set("user", null);
    c.set("apiKey", null);
    await next();
  });
  app.use("*", attachUser);

  app.get("/health", (c) => c.json({ ok: true, version: c.env.APP_VERSION ?? "0.0.0" }));

  registerAuthRoutes(app);
  registerUserRoutes(app);
  registerArtifactRoutes(app);
  registerCustomFieldRoutes(app);
  registerApiKeyRoutes(app);
  registerOrganizationRoutes(app);
  registerPublicRoutes(app);

  return app;
}
