import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { Artifact, Organization } from "@vestoxr/shared";
import { apiFetch } from "../lib/api.js";
import { useI18n } from "../lib/i18n.js";

const STATUS_KEY: Record<Artifact["status"], "artifactGrid.statusDraft" | "artifactGrid.statusPendingReview" | "artifactGrid.statusPublished" | "artifactGrid.statusRejected"> = {
  draft: "artifactGrid.statusDraft",
  pending_review: "artifactGrid.statusPendingReview",
  published: "artifactGrid.statusPublished",
  rejected: "artifactGrid.statusRejected",
};

export function ArtifactDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const [artifact, setArtifact] = useState<Artifact | null | undefined>(undefined);
  const [organization, setOrganization] = useState<Organization | null>(null);

  useEffect(() => {
    if (!id) return;
    apiFetch<Artifact>(`/artifacts/${id}`)
      .then(setArtifact)
      .catch(() => setArtifact(null));
  }, [id]);

  useEffect(() => {
    if (!artifact) return;
    apiFetch<Organization[]>("/organizations").then((orgs) => {
      setOrganization(orgs.find((o) => o.id === artifact.organizationId) ?? null);
    });
  }, [artifact]);

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
          <div className="aspect-square overflow-hidden rounded-xl border border-border bg-black/5 dark:border-border-dark dark:bg-white/5">
            {artifact.glbR2Key ? (
              <model-viewer
                src={`/api/artifacts/${artifact.id}/glb`}
                alt={artifact.title}
                camera-controls
                auto-rotate
                style={{ width: "100%", height: "100%" }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-center text-text-secondary dark:text-text-secondary-dark">
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
        </div>
      </div>
    </div>
  );
}
