import { useEffect, useState } from "react";
import type { Artifact } from "@vestoxr/shared";
import { apiFetch } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.js";
import { useI18n } from "../lib/i18n.js";

export function Dashboard() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null);

  useEffect(() => {
    apiFetch<Artifact[]>("/artifacts").then(setArtifacts);
  }, []);

  const total = artifacts?.length ?? 0;
  const published = artifacts?.filter((a) => a.status === "published").length ?? 0;
  const pending = artifacts?.filter((a) => a.status === "pending_review").length ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-bold">{t("nav.dashboard")}</h1>
      <p className="mt-1 text-text-secondary dark:text-text-secondary-dark">
        {t("dashboard.welcome", { email: user?.email ?? "" })}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: t("dashboard.statVisible"), value: total },
          { label: t("dashboard.statPublished"), value: published },
          { label: t("dashboard.statPending"), value: pending },
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
