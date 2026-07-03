import { useEffect, useState } from "react";
import type { Artifact } from "@vestoxr/shared";
import { apiFetch } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.js";

export function Dashboard() {
  const { user } = useAuth();
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null);

  useEffect(() => {
    apiFetch<Artifact[]>("/artifacts").then(setArtifacts);
  }, []);

  const total = artifacts?.length ?? 0;
  const published = artifacts?.filter((a) => a.status === "published").length ?? 0;
  const pending = artifacts?.filter((a) => a.status === "pending_review").length ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-bold">Inicio</h1>
      <p className="mt-1 text-text-secondary dark:text-text-secondary-dark">
        Bienvenido, {user?.email}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "Artifacts visible to you", value: total },
          { label: "Published", value: published },
          { label: "Pending review", value: pending },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-border bg-surface p-5 dark:border-border-dark dark:bg-surface-dark"
          >
            <p className="text-sm text-text-secondary dark:text-text-secondary-dark">{stat.label}</p>
            <p className="mt-1 text-3xl font-bold">{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
