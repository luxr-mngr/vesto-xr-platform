import { useEffect, useState } from "react";
import type { Organization } from "@vestoxr/shared";
import { Check, Pencil, X } from "lucide-react";
import { apiFetch } from "../lib/api.js";
import { useI18n } from "../lib/i18n.js";

export function Organizations() {
  const { t } = useI18n();
  const [organizations, setOrganizations] = useState<Organization[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setOrganizations(await apiFetch<Organization[]>("/organizations"));
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(org: Organization) {
    setEditingId(org.id);
    setEditingName(org.name);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
  }

  async function saveEdit(id: string) {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/organizations/${id}`, { method: "PATCH", body: JSON.stringify({ name: editingName }) });
      cancelEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("organizations.genericError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("organizations.title")}</h1>
        <p className="mt-1 text-sm text-text-secondary dark:text-text-secondary-dark">{t("organizations.subtitle")}</p>
      </div>

      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface dark:border-border-dark dark:bg-surface-dark">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-text-secondary dark:border-border-dark dark:text-text-secondary-dark">
            <tr>
              <th className="px-4 py-3 font-medium">{t("organizations.name")}</th>
              <th className="px-4 py-3 font-medium">{t("organizations.slug")}</th>
              <th className="px-4 py-3 font-medium">{t("organizations.members")}</th>
            </tr>
          </thead>
          <tbody>
            {(organizations ?? []).map((o) => (
              <tr key={o.id} className="border-b border-border last:border-0 dark:border-border-dark">
                <td className="px-4 py-3">
                  {editingId === o.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => saveEdit(o.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(o.id);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        className="w-48 rounded-md border border-border bg-transparent px-2 py-1 outline-none focus:border-accent dark:border-border-dark"
                      />
                      <button
                        disabled={saving}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => saveEdit(o.id)}
                        className="text-accent disabled:opacity-50"
                      >
                        <Check size={16} />
                      </button>
                      <button onMouseDown={(e) => e.preventDefault()} onClick={cancelEdit} className="text-text-secondary dark:text-text-secondary-dark">
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(o)}
                      className="flex items-center gap-2 text-left hover:underline"
                      title={t("organizations.name")}
                    >
                      {o.name}
                      <Pencil size={12} className="text-text-secondary dark:text-text-secondary-dark" />
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-text-secondary dark:text-text-secondary-dark">{o.slug}</td>
                <td className="px-4 py-3">{o.memberCount ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
