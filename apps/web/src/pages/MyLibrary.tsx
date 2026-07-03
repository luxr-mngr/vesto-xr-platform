import { useEffect, useState } from "react";
import { isVisibleInMyLibrary, type Artifact, type User } from "@vestoxr/shared";
import { apiFetch } from "../lib/api.js";
import { ArtifactGrid } from "../components/ArtifactGrid.js";
import { useAuth } from "../context/AuthContext.js";
import { useI18n } from "../lib/i18n.js";

/** My Library: the logged-in user's own organization, every status (ADR 0003). */
export function MyLibrary() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null);

  useEffect(() => {
    apiFetch<Artifact[]>("/artifacts").then(setArtifacts);
  }, []);

  // `status: "active"` is safe to assume here: this page only renders behind
  // ProtectedRoute, which already requires an authenticated (active) user.
  const actor: User | null = user ? { ...user, status: "active" } : null;
  const mine = actor ? (artifacts ?? []).filter((a) => isVisibleInMyLibrary(actor, a)) : [];

  return (
    <div>
      <h1 className="text-2xl font-bold">{t("myLibrary.title")}</h1>
      <p className="mt-1 text-text-secondary dark:text-text-secondary-dark">{t("myLibrary.subtitle")}</p>

      <div className="mt-6">
        <ArtifactGrid artifacts={mine} emptyLabel={t("myLibrary.empty")} />
      </div>
    </div>
  );
}
