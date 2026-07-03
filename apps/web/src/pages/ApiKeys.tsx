import { useEffect, useState, type FormEvent } from "react";
import type { Organization } from "@vestoxr/shared";
import { Check, Copy, Key, Trash2, X } from "lucide-react";
import { apiFetch } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.js";
import { useI18n } from "../lib/i18n.js";

interface ApiKeySummary {
  id: string;
  revokedAt: string | null;
}

export function ApiKeys() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isCurator = user?.role === "curator";

  const [organizations, setOrganizations] = useState<Organization[] | null>(null);
  const [orgId, setOrgId] = useState<string>("");
  const [keys, setKeys] = useState<ApiKeySummary[] | null>(null);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Shown exactly once: the raw key is never retrievable again after this response (ADR 0006).
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isCurator && user?.organizationId) {
      setOrgId(user.organizationId);
    }
  }, [isCurator, user?.organizationId]);

  useEffect(() => {
    if (isAdmin) {
      apiFetch<Organization[]>("/organizations").then(setOrganizations);
    }
  }, [isAdmin]);

  async function load(id: string) {
    setKeys(await apiFetch<ApiKeySummary[]>(`/organizations/${id}/api-keys`));
  }

  useEffect(() => {
    if (orgId) void load(orgId);
    else setKeys(null);
  }, [orgId]);

  async function createKey(e: FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setError(null);
    setCreating(true);
    try {
      const created = await apiFetch<{ id: string; key: string }>(`/organizations/${orgId}/api-keys`, {
        method: "POST",
        body: JSON.stringify({ label: label.trim() || undefined }),
      });
      setLabel("");
      setRevealedKey(created.key);
      setCopied(false);
      await load(orgId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("apiKeys.genericError"));
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!orgId) return;
    if (!confirm(t("apiKeys.confirmRevoke"))) return;
    await apiFetch(`/organizations/${orgId}/api-keys/${id}`, { method: "DELETE" });
    await load(orgId);
  }

  async function copyKey() {
    if (!revealedKey) return;
    await navigator.clipboard.writeText(revealedKey);
    setCopied(true);
  }

  if (!isAdmin && !isCurator) return null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("apiKeys.title")}</h1>
        <p className="text-sm text-text-secondary dark:text-text-secondary-dark">{t("apiKeys.subtitle")}</p>
      </div>

      {isAdmin && (
        <div className="mb-6">
          <label className="mb-1 block text-sm font-medium">{t("apiKeys.organization")}</label>
          <select
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            className="w-64 rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent dark:border-border-dark"
          >
            <option value="">{t("apiKeys.selectOrganization")}</option>
            {(organizations ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {revealedKey && (
        <div className="mb-6 rounded-xl border border-accent bg-accent/5 p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-accent">
              <Key size={16} />
              {t("apiKeys.newKeyTitle")}
            </h2>
            <button
              onClick={() => setRevealedKey(null)}
              className="text-text-secondary hover:text-text-primary dark:text-text-secondary-dark dark:hover:text-text-primary-dark"
              title={t("apiKeys.dismiss")}
            >
              <X size={16} />
            </button>
          </div>
          <p className="mb-3 text-sm text-text-secondary dark:text-text-secondary-dark">{t("apiKeys.newKeyWarning")}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-md border border-border bg-surface px-3 py-2 text-xs dark:border-border-dark dark:bg-surface-dark">
              {revealedKey}
            </code>
            <button
              onClick={copyKey}
              className="flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? t("apiKeys.copied") : t("apiKeys.copy")}
            </button>
          </div>
        </div>
      )}

      {orgId ? (
        <>
          <form
            onSubmit={createKey}
            className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-5 dark:border-border-dark dark:bg-surface-dark"
          >
            <div>
              <label className="mb-1 block text-sm font-medium">{t("apiKeys.labelField")}</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-56 rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent dark:border-border-dark"
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Check size={16} />
              {creating ? t("apiKeys.creating") : t("apiKeys.createKey")}
            </button>
            {error && <p className="w-full text-sm text-red-500">{error}</p>}
          </form>

          <div className="overflow-x-auto rounded-xl border border-border bg-surface dark:border-border-dark dark:bg-surface-dark">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-text-secondary dark:border-border-dark dark:text-text-secondary-dark">
                <tr>
                  <th className="px-4 py-3 font-medium">{t("apiKeys.id")}</th>
                  <th className="px-4 py-3 font-medium">{t("apiKeys.status")}</th>
                  <th className="px-4 py-3 font-medium">{t("apiKeys.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {(keys ?? []).map((k) => (
                  <tr key={k.id} className="border-b border-border last:border-0 dark:border-border-dark">
                    <td className="px-4 py-3 font-mono text-xs">{k.id.slice(0, 8)}…</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          k.revokedAt
                            ? "bg-red-500/10 text-red-600 dark:text-red-400"
                            : "bg-accent/10 text-accent"
                        }`}
                      >
                        {k.revokedAt ? t("apiKeys.revoked") : t("apiKeys.active")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {!k.revokedAt && (
                        <button
                          onClick={() => revoke(k.id)}
                          className="flex items-center gap-1 font-medium text-red-500 hover:underline"
                        >
                          <Trash2 size={14} />
                          {t("apiKeys.revoke")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {keys && keys.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-text-secondary dark:text-text-secondary-dark">
                      {t("apiKeys.empty")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        isAdmin && (
          <p className="text-sm text-text-secondary dark:text-text-secondary-dark">{t("apiKeys.chooseOrgPrompt")}</p>
        )
      )}
    </div>
  );
}
