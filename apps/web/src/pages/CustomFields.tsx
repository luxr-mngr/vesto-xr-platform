import { useEffect, useState, type FormEvent } from "react";
import type { CustomFieldDefinition } from "@vestoxr/shared";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { ApiError, apiFetch } from "../lib/api.js";
import { useI18n } from "../lib/i18n.js";

const FIELD_TYPES: CustomFieldDefinition["fieldType"][] = ["text", "number", "date", "boolean"];

export function CustomFields() {
  const { t } = useI18n();
  const [fields, setFields] = useState<CustomFieldDefinition[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState<CustomFieldDefinition["fieldType"]>("text");
  const [newIsPublicShowcase, setNewIsPublicShowcase] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editFieldType, setEditFieldType] = useState<CustomFieldDefinition["fieldType"]>("text");
  const [editIsPublicShowcase, setEditIsPublicShowcase] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  async function load() {
    setFields(await apiFetch<CustomFieldDefinition[]>("/custom-fields"));
  }

  useEffect(() => {
    load();
  }, []);

  const typeLabel: Record<CustomFieldDefinition["fieldType"], string> = {
    text: t("customFields.typeText"),
    number: t("customFields.typeNumber"),
    date: t("customFields.typeDate"),
    boolean: t("customFields.typeBoolean"),
  };

  async function createField(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      await apiFetch("/custom-fields", {
        method: "POST",
        body: JSON.stringify({ key: newKey, label: newLabel, fieldType: newFieldType, isPublicShowcase: newIsPublicShowcase }),
      });
      setNewKey("");
      setNewLabel("");
      setNewFieldType("text");
      setNewIsPublicShowcase(false);
      setShowCreate(false);
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : t("customFields.genericError"));
    } finally {
      setCreating(false);
    }
  }

  function startEdit(field: CustomFieldDefinition) {
    setRowError(null);
    setEditingId(field.id);
    setEditLabel(field.label);
    setEditFieldType(field.fieldType);
    setEditIsPublicShowcase(field.isPublicShowcase);
  }

  async function saveEdit(id: string) {
    setRowError(null);
    try {
      await apiFetch(`/custom-fields/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ label: editLabel, fieldType: editFieldType, isPublicShowcase: editIsPublicShowcase }),
      });
      setEditingId(null);
      await load();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : t("customFields.genericError"));
    }
  }

  async function deleteField(field: CustomFieldDefinition) {
    if (!confirm(t("customFields.confirmDelete"))) return;
    setRowError(null);
    try {
      await apiFetch(`/custom-fields/${field.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : t("customFields.genericError"));
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("customFields.title")}</h1>
          <p className="mt-1 text-sm text-text-secondary dark:text-text-secondary-dark">{t("customFields.subtitle")}</p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Plus size={16} />
          {t("customFields.addField")}
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={createField}
          className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-5 dark:border-border-dark dark:bg-surface-dark"
        >
          <div>
            <label className="mb-1 block text-sm font-medium">{t("customFields.key")}</label>
            <input
              type="text"
              required
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="w-48 rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent dark:border-border-dark"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("customFields.label")}</label>
            <input
              type="text"
              required
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="w-48 rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent dark:border-border-dark"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("customFields.fieldType")}</label>
            <select
              value={newFieldType}
              onChange={(e) => setNewFieldType(e.target.value as CustomFieldDefinition["fieldType"])}
              className="rounded-md border border-border bg-transparent px-2 py-2 text-sm dark:border-border-dark"
            >
              {FIELD_TYPES.map((ft) => (
                <option key={ft} value={ft}>
                  {typeLabel[ft]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={newIsPublicShowcase}
                onChange={(e) => setNewIsPublicShowcase(e.target.checked)}
              />
              {t("customFields.publicShowcase")}
            </label>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Check size={16} />
            {t("customFields.create")}
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(false)}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:bg-black/5 dark:border-border-dark dark:text-text-secondary-dark dark:hover:bg-white/5"
          >
            <X size={16} />
            {t("customFields.cancel")}
          </button>
          {createError && <p className="w-full text-sm text-red-500">{createError}</p>}
        </form>
      )}

      {rowError && <p className="mb-3 text-sm text-red-500">{rowError}</p>}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface dark:border-border-dark dark:bg-surface-dark">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-text-secondary dark:border-border-dark dark:text-text-secondary-dark">
            <tr>
              <th className="px-4 py-3 font-medium">{t("customFields.key")}</th>
              <th className="px-4 py-3 font-medium">{t("customFields.label")}</th>
              <th className="px-4 py-3 font-medium">{t("customFields.fieldType")}</th>
              <th className="px-4 py-3 font-medium">{t("customFields.publicShowcase")}</th>
              <th className="px-4 py-3 font-medium">{t("customFields.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {(fields ?? []).map((f) =>
              editingId === f.id ? (
                <tr key={f.id} className="border-b border-border last:border-0 dark:border-border-dark">
                  <td className="px-4 py-3 text-text-secondary dark:text-text-secondary-dark">{f.key}</td>
                  <td className="px-4 py-3">
                    <input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-sm outline-none focus:border-accent dark:border-border-dark"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={editFieldType}
                      onChange={(e) => setEditFieldType(e.target.value as CustomFieldDefinition["fieldType"])}
                      className="rounded-md border border-border bg-transparent px-2 py-1 text-sm dark:border-border-dark"
                    >
                      {FIELD_TYPES.map((ft) => (
                        <option key={ft} value={ft}>
                          {typeLabel[ft]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={editIsPublicShowcase}
                      onChange={(e) => setEditIsPublicShowcase(e.target.checked)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(f.id)}
                        title={t("customFields.save")}
                        className="rounded-md border border-border p-1.5 text-accent hover:bg-accent/10 dark:border-border-dark"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        title={t("customFields.cancel")}
                        className="rounded-md border border-border p-1.5 text-text-secondary hover:bg-black/5 dark:border-border-dark dark:text-text-secondary-dark dark:hover:bg-white/5"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={f.id} className="border-b border-border last:border-0 dark:border-border-dark">
                  <td className="px-4 py-3">{f.key}</td>
                  <td className="px-4 py-3">{f.label}</td>
                  <td className="px-4 py-3">{typeLabel[f.fieldType]}</td>
                  <td className="px-4 py-3">{f.isPublicShowcase ? <Check size={14} className="text-accent" /> : "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEdit(f)}
                        title={t("customFields.edit")}
                        className="rounded-md border border-border p-1.5 text-text-secondary hover:bg-black/5 dark:border-border-dark dark:text-text-secondary-dark dark:hover:bg-white/5"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => deleteField(f)}
                        title={t("customFields.delete")}
                        className="rounded-md border border-border p-1.5 text-red-500 hover:bg-red-500/10 dark:border-border-dark"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
            {fields && fields.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-text-secondary dark:text-text-secondary-dark">
                  {t("customFields.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
