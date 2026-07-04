import type { CustomFieldDefinition } from "../types.js";

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates a raw string value against an admin-defined custom field's
 * declared type (ADR 0005). Values are always transported as strings
 * (form inputs / JSON) and parsed here rather than trusted as-is.
 */
export function validateCustomFieldValue(
  definition: CustomFieldDefinition,
  value: string
): ValidationResult {
  switch (definition.fieldType) {
    case "text":
      return value.length > 0
        ? { ok: true }
        : { ok: false, error: `${definition.label} cannot be empty.` };

    case "number":
      return Number.isFinite(Number(value)) && value.trim() !== ""
        ? { ok: true }
        : { ok: false, error: `${definition.label} must be a number.` };

    case "date":
      return ISO_DATE_RE.test(value) && !Number.isNaN(Date.parse(value))
        ? { ok: true }
        : { ok: false, error: `${definition.label} must be an ISO date (YYYY-MM-DD).` };

    case "boolean":
      return value === "true" || value === "false"
        ? { ok: true }
        : { ok: false, error: `${definition.label} must be 'true' or 'false'.` };

    default:
      return { ok: false, error: `Unknown field type for ${definition.label}.` };
  }
}

/**
 * A submitted field key must exist in the admin-curated global catalog (ADR 0005) —
 * artifacts/orgs cannot invent ad hoc keys.
 */
export function isKnownFieldKey(
  key: string,
  catalog: readonly CustomFieldDefinition[]
): boolean {
  return catalog.some((def) => def.key === key);
}

/**
 * Validates a full set of submitted custom-field values (artifact upload/edit form)
 * against the current catalog: every key must be known, and its value must satisfy
 * that key's declared type (ADR 0005).
 */
export function validateCustomFieldValues(
  catalog: readonly CustomFieldDefinition[],
  values: Record<string, string>
): ValidationResult {
  for (const [key, value] of Object.entries(values)) {
    if (!isKnownFieldKey(key, catalog)) {
      return { ok: false, error: `Unknown custom field key: ${key}.` };
    }
    const definition = catalog.find((def) => def.key === key)!;
    const result = validateCustomFieldValue(definition, value);
    if (!result.ok) return result;
  }
  return { ok: true };
}
