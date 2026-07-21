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

    const body = await c.req.json<{ key?: string; label?: string; fieldType?: string; isPublicShowcase?: boolean }>();
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
      isPublicShowcase: body.isPublicShowcase ?? false,
    };
    await c.get("repo").createCustomFieldDefinition(def, actor.id);
    return c.json(def, 201);
  });

  // Rename the label and/or retype a field (ERS §12: "add/rename/retire"); the
  // `key` is immutable once created since it's referenced by stored artifact
  // custom-field values and by external API consumers faceting on it.
  app.patch("/custom-fields/:id", requireAuth, async (c) => {
    const actor = c.get("user")!;
    if (!can(actor, "customField.update")) return c.json({ error: "Forbidden." }, 403);

    const repo = c.get("repo");
    const existing = await repo.getCustomFieldDefinitionById(c.req.param("id"));
    if (!existing) return c.json({ error: "Not found." }, 404);

    const body = await c.req.json<{ label?: string; fieldType?: string; isPublicShowcase?: boolean }>();
    if (body.fieldType !== undefined && !["text", "number", "date", "boolean"].includes(body.fieldType)) {
      return c.json({ error: "fieldType must be text, number, date, or boolean." }, 400);
    }

    const patch: Partial<Pick<CustomFieldDefinition, "label" | "fieldType" | "isPublicShowcase">> = {};
    if (body.label !== undefined) patch.label = body.label;
    if (body.fieldType !== undefined) patch.fieldType = body.fieldType as CustomFieldDefinition["fieldType"];
    if (body.isPublicShowcase !== undefined) patch.isPublicShowcase = body.isPublicShowcase;

    await repo.updateCustomFieldDefinition(existing.id, patch);
    return c.json({ ...existing, ...patch });
  });

  // "Retire" a field definition. Blocked while any artifact still holds a
  // value for it, rather than cascading the delete, so removing a field from
  // the catalog can never silently drop recorded data.
  app.delete("/custom-fields/:id", requireAuth, async (c) => {
    const actor = c.get("user")!;
    if (!can(actor, "customField.delete")) return c.json({ error: "Forbidden." }, 403);

    const repo = c.get("repo");
    const existing = await repo.getCustomFieldDefinitionById(c.req.param("id"));
    if (!existing) return c.json({ error: "Not found." }, 404);

    const usageCount = await repo.countArtifactCustomFieldUsage(existing.key);
    if (usageCount > 0) {
      return c.json({ error: `Cannot delete: ${usageCount} artifact(s) still have a value for this field.` }, 409);
    }

    await repo.deleteCustomFieldDefinition(existing.id);
    return c.json({ ok: true });
  });
}
