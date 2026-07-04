import { describe, expect, it } from "vitest";
import { isKnownFieldKey, validateCustomFieldValue, validateCustomFieldValues } from "./customFields.js";
import type { CustomFieldDefinition } from "../types.js";

const textField: CustomFieldDefinition = {
  id: "1",
  key: "dynasty",
  label: "Dynasty",
  fieldType: "text",
};
const numberField: CustomFieldDefinition = {
  id: "2",
  key: "sherd_count",
  label: "Sherd Count",
  fieldType: "number",
};
const dateField: CustomFieldDefinition = {
  id: "3",
  key: "acquisition_date",
  label: "Acquisition Date",
  fieldType: "date",
};
const boolField: CustomFieldDefinition = {
  id: "4",
  key: "on_loan",
  label: "On Loan",
  fieldType: "boolean",
};

describe("customFields.validateCustomFieldValue", () => {
  it("accepts a non-empty text value", () => {
    expect(validateCustomFieldValue(textField, "Ming").ok).toBe(true);
  });

  it("rejects an empty text value", () => {
    expect(validateCustomFieldValue(textField, "").ok).toBe(false);
  });

  it("accepts a numeric string for a number field", () => {
    expect(validateCustomFieldValue(numberField, "42").ok).toBe(true);
  });

  it("rejects a non-numeric string for a number field", () => {
    expect(validateCustomFieldValue(numberField, "forty-two").ok).toBe(false);
  });

  it("accepts a valid ISO date", () => {
    expect(validateCustomFieldValue(dateField, "2025-04-01").ok).toBe(true);
  });

  it("rejects a malformed or invalid date", () => {
    expect(validateCustomFieldValue(dateField, "04/01/2025").ok).toBe(false);
    expect(validateCustomFieldValue(dateField, "2025-13-40").ok).toBe(false);
  });

  it("accepts only literal 'true'/'false' for a boolean field", () => {
    expect(validateCustomFieldValue(boolField, "true").ok).toBe(true);
    expect(validateCustomFieldValue(boolField, "false").ok).toBe(true);
    expect(validateCustomFieldValue(boolField, "yes").ok).toBe(false);
  });
});

describe("customFields.isKnownFieldKey", () => {
  const catalog = [textField, numberField];

  it("accepts a key present in the admin-curated catalog", () => {
    expect(isKnownFieldKey("dynasty", catalog)).toBe(true);
  });

  it("rejects a key an org invented outside the catalog", () => {
    expect(isKnownFieldKey("made_up_field", catalog)).toBe(false);
  });
});

describe("customFields.validateCustomFieldValues", () => {
  const catalog = [textField, numberField, dateField, boolField];

  it("accepts a full set of valid values", () => {
    expect(
      validateCustomFieldValues(catalog, { dynasty: "Ming", sherd_count: "12", on_loan: "false" }).ok
    ).toBe(true);
  });

  it("rejects an unknown key even if the rest are valid", () => {
    const result = validateCustomFieldValues(catalog, { dynasty: "Ming", made_up_field: "x" });
    expect(result.ok).toBe(false);
  });

  it("rejects a known key with a type-invalid value", () => {
    const result = validateCustomFieldValues(catalog, { sherd_count: "not-a-number" });
    expect(result.ok).toBe(false);
  });

  it("accepts an empty value set (all custom fields optional)", () => {
    expect(validateCustomFieldValues(catalog, {}).ok).toBe(true);
  });
});
