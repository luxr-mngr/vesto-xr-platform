import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { can, type Artifact, type CustomFieldDefinition, type Organization, type User } from "@vestoxr/shared";
import { API_BASE, apiFetch } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.js";
import { useI18n } from "../lib/i18n.js";
import { MODEL_EXPOSURE } from "../lib/modelViewer.js";

const STATUS_KEY: Record<Artifact["status"], "artifactGrid.statusDraft" | "artifactGrid.statusPendingReview" | "artifactGrid.statusPublished" | "artifactGrid.statusRejected"> = {
  draft: "artifactGrid.statusDraft",
  pending_review: "artifactGrid.statusPendingReview",
  published: "artifactGrid.statusPublished",
  rejected: "artifactGrid.statusRejected",
};

export function ArtifactDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const { user } = useAuth();
  const [artifact, setArtifact] = useState<Artifact | null | undefined>(undefined);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [catalog, setCatalog] = useState<CustomFieldDefinition[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [savingFields, setSavingFields] = useState(false);
  const [fieldsMessage, setFieldsMessage] = useState<string | null>(null);
  const [modelObjectUrl, setModelObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    apiFetch<Artifact>(`/artifacts/${id}`)
      .then(setArtifact)
      .catch(() => setArtifact(null));
  }, [id]);

  // <model-viewer>'s own internal fetch for `src` doesn't send credentials on
  // a cross-origin request, so pointing it straight at the (session-cookie
  // gated) GLB route would 401 in production where the API and web app are
  // separate origins. Fetching the bytes ourselves (with credentials) and
  // handing model-viewer a blob: URL sidesteps that entirely.
  useEffect(() => {
    if (!artifact?.glbR2Key) {
      setModelObjectUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    fetch(`${API_BASE}/artifacts/${artifact.id}/glb`, { credentials: "include" })
      .then((res) => (res.ok ? res.blob() : Promise.reject(res)))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setModelObjectUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setModelObjectUrl(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [artifact?.id, artifact?.glbR2Key]);

  useEffect(() => {
    if (!artifact) return;
    apiFetch<Organization[]>("/organizations").then((orgs) => {
      setOrganization(orgs.find((o) => o.id === artifact.organizationId) ?? null);
    });
    apiFetch<CustomFieldDefinition[]>("/custom-fields").then(setCatalog);
    apiFetch<Record<string, string>>(`/artifacts/${artifact.id}/custom-fields`).then(setValues);
  }, [artifact]);

  // `status: "active"` is safe to assume here: this page only renders behind
  // ProtectedRoute, which already requires an authenticated (active) user.
  const actor: User | null = user ? { ...user, status: "active" } : null;
  const canEdit = !!(artifact && actor && can(actor, "artifact.editMetadata", { artifact }));

  async function saveCustomFields() {
    if (!artifact) return;
    setSavingFields(true);
    setFieldsMessage(null);
    try {
      await apiFetch(`/artifacts/${artifact.id}/custom-fields`, { method: "PUT", body: JSON.stringify(values) });
      setFieldsMessage(t("artifactDetail.customFieldsSaved"));
    } catch {
      setFieldsMessage(t("artifactDetail.customFieldsError"));
    } finally {
      setSavingFields(false);
    }
  }

  if (artifact === undefined) return null;

  if (artifact === null) {
    return (
      <div>
        <Link to="/library" className="flex items-center gap-1 text-sm text-accent hover:underline">
          <ArrowLeft size={14} />
          {t("artifactDetail.back")}
        </Link>
        <p className="mt-6 text-text-secondary dark:text-text-secondary-dark">{t("artifactDetail.notFound")}</p>
      </div>
    );
  }

  return (
    <div>
      <Link to="/library" className="flex items-center gap-1 text-sm text-accent hover:underline">
        <ArrowLeft size={14} />
        {t("artifactDetail.back")}
      </Link>

      <h1 className="mt-4 text-2xl font-bold">{artifact.title}</h1>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="aspect-square overflow-hidden rounded-xl border border-border bg-bg-dark dark:border-border-dark">
            {modelObjectUrl ? (
              <model-viewer
                src={modelObjectUrl}
                alt={artifact.title}
                camera-controls
                auto-rotate
                exposure={MODEL_EXPOSURE}
                style={{ width: "100%", height: "100%" }}
              />
            ) : artifact.glbR2Key ? (
              <div className="flex h-full items-center justify-center text-center text-text-secondary-dark">
                {t("artifactDetail.loadingPreview")}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-center text-text-secondary-dark">
                {t("artifactDetail.noPreview")}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 dark:border-border-dark dark:bg-surface-dark">
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-text-secondary dark:text-text-secondary-dark">{t("artifactDetail.status")}</dt>
              <dd className="mt-0.5 font-medium">{t(STATUS_KEY[artifact.status])}</dd>
            </div>
            <div>
              <dt className="text-text-secondary dark:text-text-secondary-dark">{t("artifactDetail.visibility")}</dt>
              <dd className="mt-0.5 font-medium">
                {artifact.visibility === "public" ? t("artifactDetail.visibilityPublic") : t("artifactDetail.visibilityPrivate")}
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary dark:text-text-secondary-dark">{t("artifactDetail.organization")}</dt>
              <dd className="mt-0.5 font-medium">{organization?.name ?? artifact.organizationId}</dd>
            </div>
          </dl>

          <div className="mt-6 border-t border-border pt-4 dark:border-border-dark">
            <h2 className="text-sm font-semibold">{t("artifactDetail.customFieldsTitle")}</h2>
            {catalog.length === 0 ? (
              <p className="mt-2 text-sm text-text-secondary dark:text-text-secondary-dark">
                {t("artifactDetail.customFieldsEmpty")}
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {catalog.map((field) => (
                  <div key={field.key}>
                    <label className="mb-1 block text-xs font-medium text-text-secondary dark:text-text-secondary-dark">
                      {field.label}
                    </label>
                    {canEdit ? (
                      field.fieldType === "boolean" ? (
                        <select
                          value={values[field.key] ?? ""}
                          onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                          className="w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm dark:border-border-dark"
                        >
                          <option value="">—</option>
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      ) : (
                        <input
                          type={field.fieldType === "number" ? "number" : field.fieldType === "date" ? "date" : "text"}
                          value={values[field.key] ?? ""}
                          onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                          className="w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm outline-none focus:border-accent dark:border-border-dark"
                        />
                      )
                    ) : (
                      <p className="text-sm">{values[field.key] || "—"}</p>
                    )}
                  </div>
                ))}
                {canEdit && (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={saveCustomFields}
                      disabled={savingFields}
                      className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {t("artifactDetail.customFieldsSave")}
                    </button>
                    {fieldsMessage && <span className="text-xs text-text-secondary dark:text-text-secondary-dark">{fieldsMessage}</span>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
