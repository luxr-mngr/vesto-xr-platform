import { describe, expect, it } from "vitest";
import { isKnownFieldKey, validateCustomFieldValue } from "./customFields.js";
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
