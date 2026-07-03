import { useEffect, useState } from "react";
import type { Role } from "@vestoxr/shared";
import { apiFetch } from "../lib/api.js";

interface AdminUser {
  id: string;
  email: string;
  role: Role | null;
  organizationId: string | null;
  status: "pending" | "active" | "disabled";
}

const ROLES: Role[] = ["admin", "curator", "assistant"];

export function Admin() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);

  async function load() {
    setUsers(await apiFetch<AdminUser[]>("/users"));
  }

  useEffect(() => {
    load();
  }, []);

  async function patch(id: string, body: Partial<Pick<AdminUser, "role" | "organizationId" | "status">>) {
    await apiFetch(`/users/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    await load();
  }

  const pendingCount = users?.filter((u) => u.status === "pending").length ?? 0;
  const activeCount = users?.filter((u) => u.status === "active").length ?? 0;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Administración de Usuarios</h1>
      </div>

      <div className="mb-6 rounded-xl border border-border bg-surface p-5 dark:border-border-dark dark:bg-surface-dark">
        <h2 className="mb-3 text-sm font-semibold">Información de Cuentas</h2>
        <div className="flex gap-8 text-sm">
          <p>
            Total: <span className="font-semibold">{users?.length ?? "—"}</span>
          </p>
          <p>
            Activos: <span className="font-semibold">{activeCount}</span>
          </p>
          <p>
            Pendientes de aprobación: <span className="font-semibold">{pendingCount}</span>
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface dark:border-border-dark dark:bg-surface-dark">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-text-secondary dark:border-border-dark dark:text-text-secondary-dark">
            <tr>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium">Organización</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Acciones</th>
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
                  <input
                    defaultValue={u.organizationId ?? ""}
                    placeholder="org-id"
                    onBlur={(e) => patch(u.id, { organizationId: e.target.value || null })}
                    className="w-32 rounded-md border border-border bg-transparent px-2 py-1 dark:border-border-dark"
                  />
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
                        ? "Assign a role and organization first"
                        : u.status === "active"
                          ? "Disable account"
                          : "Enable account"
                    }
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        u.status === "active" ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </td>
                <td className="px-4 py-3 text-text-secondary dark:text-text-secondary-dark">
                  {u.status === "pending" ? "Awaiting approval" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
