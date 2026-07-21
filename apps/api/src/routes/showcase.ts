import type { Hono } from "hono";
import { isStorePublic } from "@vestoxr/shared";
import { rateLimit } from "../middleware/rateLimit.js";
import type { HonoEnv } from "../app.js";

// Generous but bounded per-IP limit — this surface is meant to be walked up
// to and browsed at a demo booth with no login, so it can't be gated by a
// credential the way /v1/* and /artifacts/* are (ERS §13).
const showcaseRateLimit = rateLimit({
  limit: 300,
  windowSeconds: 60,
  bucketKey: (c) => `showcase:${c.req.header("cf-connecting-ip") ?? "unknown"}`,
});

/**
 * Fully unauthenticated, read-only surface for the demo-day public showcase
 * (ERS §11.4). Scoped to exactly the same `isStorePublic` predicate as the
 * Store — published AND visibility=public — so nothing reachable here is any
 * more exposed than what a logged-in user could already see in the Store.
 *
 * Custom-field values are filtered to only those definitions an admin has
 * explicitly flagged `isPublicShowcase`; the rest of the global catalog
 * (potentially internal-only fields like provenance/condition notes) stays
 * hidden from anonymous visitors even on an otherwise-public artifact.
 */
export function registerShowcaseRoutes(app: Hono<HonoEnv>) {
  app.use("/public/showcase/*", showcaseRateLimit);

  app.get("/public/showcase/artifacts", async (c) => {
    const repo = c.get("repo");
    const [artifacts, catalog] = await Promise.all([repo.listArtifacts(), repo.listCustomFieldDefinitions()]);
    const publicCatalog = catalog.filter((f) => f.isPublicShowcase);

    const result = await Promise.all(
      artifacts.filter(isStorePublic).map(async (artifact) => {
        const values = publicCatalog.length > 0 ? await repo.getArtifactCustomFieldValues(artifact.id) : {};
        return {
          id: artifact.id,
          title: artifact.title,
          description: artifact.description,
          hasGlb: !!artifact.glbR2Key,
          hasThumbnail: !!artifact.thumbnailR2Key,
          fields: publicCatalog
            .filter((f) => values[f.key] !== undefined)
            .map((f) => ({ key: f.key, label: f.label, value: values[f.key] })),
        };
      })
    );
    return c.json(result);
  });

  app.get("/public/showcase/artifacts/:id/thumbnail", async (c) => {
    const artifact = await c.get("repo").getArtifactById(c.req.param("id"));
    if (!artifact || !isStorePublic(artifact) || !artifact.thumbnailR2Key) return c.json({ error: "Not found." }, 404);

    const object = await c.env.BUCKET.get(artifact.thumbnailR2Key);
    if (!object) return c.json({ error: "Not found." }, 404);
    return new Response(object.body, { headers: { "content-type": "image/png" } });
  });

  app.get("/public/showcase/artifacts/:id/glb", async (c) => {
    const artifact = await c.get("repo").getArtifactById(c.req.param("id"));
    if (!artifact || !isStorePublic(artifact) || !artifact.glbR2Key) return c.json({ error: "Not found." }, 404);

    const object = await c.env.BUCKET.get(artifact.glbR2Key);
    if (!object) return c.json({ error: "Not found." }, 404);
    return new Response(object.body, { headers: { "content-type": "model/gltf-binary" } });
  });
}
