import { useEffect, useState, type FormEvent } from "react";
import type { Organization, Role } from "@vestoxr/shared";
import { Check, Plus, Trash2, UserPlus, X } from "lucide-react";
import { apiFetch } from "../lib/api.js";
import { useI18n } from "../lib/i18n.js";

interface AdminUser {
  id: string;
  email: string;
  role: Role | null;
  organizationId: string | null;
  status: "pending" | "active" | "disabled";
}

const ROLES: Role[] = ["admin", "curator", "assistant"];

export function Admin() {
  const { t } = useI18n();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [organizations, setOrganizations] = useState<Organization[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<Role>("assistant");
  const [newOrg, setNewOrg] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [showNewOrg, setShowNewOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [orgError, setOrgError] = useState<string | null>(null);
  const [creatingOrg, setCreatingOrg] = useState(false);

  async function load() {
    setUsers(await apiFetch<AdminUser[]>("/users"));
  }

  async function loadOrganizations() {
    setOrganizations(await apiFetch<Organization[]>("/organizations"));
  }

  useEffect(() => {
    load();
    loadOrganizations();
  }, []);

  async function createOrganization(e: FormEvent) {
    e.preventDefault();
    setOrgError(null);
    setCreatingOrg(true);
    try {
      const org = await apiFetch<Organization>("/organizations", {
        method: "POST",
        body: JSON.stringify({ name: newOrgName }),
      });
      setNewOrgName("");
      setShowNewOrg(false);
      await loadOrganizations();
      setNewOrg(org.id);
    } catch (err) {
      setOrgError(err instanceof Error ? err.message : t("login.genericError"));
    } finally {
      setCreatingOrg(false);
    }
  }

  async function patch(id: string, body: Partial<Pick<AdminUser, "role" | "organizationId" | "status">>) {
    await apiFetch(`/users/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    await load();
  }

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      await apiFetch("/users", {
        method: "POST",
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          role: newRole,
          organizationId: newOrg || null,
        }),
      });
      setNewEmail("");
      setNewPassword("");
      setNewRole("assistant");
      setNewOrg("");
      setShowCreate(false);
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : t("login.genericError"));
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    if (!confirm(t("admin.confirmDelete"))) return;
    await apiFetch(`/users/${id}`, { method: "DELETE" });
    await load();
  }

  const pendingCount = users?.filter((u) => u.status === "pending").length ?? 0;
  const activeCount = users?.filter((u) => u.status === "active").length ?? 0;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("admin.title")}</h1>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <UserPlus size={16} />
          {t("admin.addUser")}
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={createUser}
          className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-5 dark:border-border-dark dark:bg-surface-dark"
        >
          <div>
            <label className="mb-1 block text-sm font-medium">{t("admin.newUserEmail")}</label>
            <input
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-56 rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent dark:border-border-dark"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("admin.newUserPassword")}</label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-48 rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent dark:border-border-dark"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("admin.role")}</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Role)}
              className="rounded-md border border-border bg-transparent px-2 py-2 text-sm dark:border-border-dark"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("admin.organization")}</label>
            <div className="flex items-center gap-2">
              <select
                value={newOrg}
                onChange={(e) => setNewOrg(e.target.value)}
                className="w-40 rounded-md border border-border bg-transparent px-2 py-2 text-sm dark:border-border-dark"
              >
                <option value="">—</option>
                {(organizations ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowNewOrg((v) => !v)}
                title={t("admin.newOrganization")}
                className="rounded-md border border-border p-2 text-text-secondary hover:bg-black/5 dark:border-border-dark dark:text-text-secondary-dark dark:hover:bg-white/5"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
          {showNewOrg && (
            <div className="flex items-end gap-2">
              <div>
                <label className="mb-1 block text-sm font-medium">{t("admin.newOrganization")}</label>
                <input
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  className="w-40 rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent dark:border-border-dark"
                />
              </div>
              <button
                type="button"
                disabled={creatingOrg || !newOrgName.trim()}
                onClick={createOrganization}
                className="flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Check size={16} />
                {t("admin.create")}
              </button>
              {orgError && <p className="w-full text-sm text-red-500">{orgError}</p>}
            </div>
          )}
          <button
            type="submit"
            disabled={creating}
            className="flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Check size={16} />
            {t("admin.create")}
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(false)}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:bg-black/5 dark:border-border-dark dark:text-text-secondary-dark dark:hover:bg-white/5"
          >
            <X size={16} />
            {t("admin.cancel")}
          </button>
          {createError && <p className="w-full text-sm text-red-500">{createError}</p>}
        </form>
      )}

      <div className="mb-6 rounded-xl border border-border bg-surface p-5 dark:border-border-dark dark:bg-surface-dark">
        <h2 className="mb-3 text-sm font-semibold">{t("admin.accountInfo")}</h2>
        <div className="flex gap-8 text-sm">
          <p>
            {t("admin.total")}: <span className="font-semibold">{users?.length ?? "—"}</span>
          </p>
          <p>
            {t("admin.active")}: <span className="font-semibold">{activeCount}</span>
          </p>
          <p>
            {t("admin.pendingApproval")}: <span className="font-semibold">{pendingCount}</span>
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface dark:border-border-dark dark:bg-surface-dark">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-text-secondary dark:border-border-dark dark:text-text-secondary-dark">
            <tr>
              <th className="px-4 py-3 font-medium">{t("admin.email")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.role")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.organization")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.status")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0 dark:border-border-dark">
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role ?? ""}
                    onChange={(e) => patch(u.id, { role: e.target.value as Role })}
                    className="rounded-md border border-border bg-transparent px-2 py-1 dark:border-border-dark"
                  >
                    <option value="" disabled>
                      —
                    </option>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={u.organizationId ?? ""}
                    onChange={(e) => patch(u.id, { organizationId: e.target.value || null })}
                    className="rounded-md border border-border bg-transparent px-2 py-1 dark:border-border-dark"
                  >
                    <option value="">—</option>
                    {(organizations ?? []).map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() =>
                      patch(u.id, { status: u.status === "active" ? "disabled" : "active" })
                    }
                    disabled={u.status === "pending" && (!u.role || !u.organizationId)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-30 ${
                      u.status === "active" ? "bg-accent" : "bg-black/20 dark:bg-white/20"
                    }`}
                    title={
                      u.status === "pending"
                        ? t("admin.assignFirst")
                        : u.status === "active"
                          ? t("admin.disableAccount")
                          : t("admin.enableAccount")
                    }
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        u.status === "active" ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {u.status === "pending" && (
                      <span className="text-text-secondary dark:text-text-secondary-dark">
                        {t("admin.awaitingApproval")}
                      </span>
                    )}
                    <button
                      onClick={() => remove(u.id)}
                      className="flex items-center gap-1 font-medium text-red-500 hover:underline"
                    >
                      <Trash2 size={14} />
                      {t("admin.delete")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
