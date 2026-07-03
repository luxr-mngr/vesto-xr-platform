import { useEffect, useState } from "react";
import { isStorePublic, type Artifact } from "@vestoxr/shared";
import { apiFetch } from "../lib/api.js";
import { ArtifactGrid } from "../components/ArtifactGrid.js";
import { useI18n } from "../lib/i18n.js";

/**
 * Public Store: every organization's published+public artifacts.
 * Filtered client-side with the same `isStorePublic` predicate the API uses
 * (ADR 0008) — the /artifacts endpoint already scopes results to what the
 * logged-in user may see at all, so this just narrows to the Store subset.
 */
export function Store() {
  const { t } = useI18n();
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null);

  useEffect(() => {
    apiFetch<Artifact[]>("/artifacts").then(setArtifacts);
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold">{t("store.title")}</h1>
      <p className="mt-1 text-text-secondary dark:text-text-secondary-dark">{t("store.subtitle")}</p>

      <div className="mt-6">
        <ArtifactGrid artifacts={(artifacts ?? []).filter(isStorePublic)} emptyLabel={t("store.empty")} />
      </div>
    </div>
  );
}
