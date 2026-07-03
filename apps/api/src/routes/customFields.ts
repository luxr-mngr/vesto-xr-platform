import type { Hono } from "hono";
import { can, type CustomFieldDefinition } from "@vestoxr/shared";
import { requireAuth } from "../middleware/auth.js";
import type { HonoEnv } from "../app.js";

export function registerCustomFieldRoutes(app: Hono<HonoEnv>) {
  // Any active user can read the catalog to populate an upload/edit form.
  app.get("/custom-fields", requireAuth, async (c) => {
    return c.json(await c.get("repo").listCustomFieldDefinitions());
  });

  // Only Admins may extend the global custom-field catalog (ADR 0005, ERS §5).
  app.post("/custom-fields", requireAuth, async (c) => {
    const actor = c.get("user")!;
    if (!can(actor, "customField.create")) return c.json({ error: "Forbidden." }, 403);

    const body = await c.req.json<{ key?: string; label?: string; fieldType?: string }>();
    if (!body.key || !body.label || !body.fieldType) {
      return c.json({ error: "key, label, and fieldType are required." }, 400);
    }
    if (!["text", "number", "date", "boolean"].includes(body.fieldType)) {
      return c.json({ error: "fieldType must be text, number, date, or boolean." }, 400);
    }

    const def: CustomFieldDefinition = {
      id: crypto.randomUUID(),
      key: body.key,
      label: body.label,
      fieldType: body.fieldType as CustomFieldDefinition["fieldType"],
    };
    await c.get("repo").createCustomFieldDefinition(def);
    return c.json(def, 201);
  });
}
