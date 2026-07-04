import { Link } from "react-router-dom";
import { can, type Artifact, type User } from "@vestoxr/shared";
import { Check, Eye, EyeOff, Pencil, Send, Trash2, X } from "lucide-react";
import { API_BASE } from "../lib/api.js";
import { useI18n } from "../lib/i18n.js";

const STATUS_KEY: Record<Artifact["status"], "artifactGrid.statusDraft" | "artifactGrid.statusPendingReview" | "artifactGrid.statusPublished" | "artifactGrid.statusRejected"> = {
  draft: "artifactGrid.statusDraft",
  pending_review: "artifactGrid.statusPendingReview",
  published: "artifactGrid.statusPublished",
  rejected: "artifactGrid.statusRejected",
};

const STATUS_CLASSES: Record<Artifact["status"], string> = {
  draft: "bg-text-secondary/10 text-text-secondary dark:text-text-secondary-dark",
  pending_review: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  published: "bg-accent/10 text-accent",
  rejected: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export interface ArtifactActions {
  onSubmit: (artifact: Artifact) => void;
  onApprove: (artifact: Artifact) => void;
  onReject: (artifact: Artifact) => void;
  onToggleVisibility: (artifact: Artifact) => void;
  onEdit: (artifact: Artifact) => void;
  onDelete: (artifact: Artifact) => void;
}

/** `actor` + `actions` are optional so the read-only public Store can reuse this grid. */
export function ArtifactGrid({
  artifacts,
  emptyLabel,
  actor,
  actions,
}: {
  artifacts: Artifact[];
  emptyLabel: string;
  actor?: User | null;
  actions?: ArtifactActions;
}) {
  const { t } = useI18n();

  if (artifacts.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-8 text-center text-text-secondary dark:border-border-dark dark:text-text-secondary-dark">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {artifacts.map((artifact) => (
        <div
          key={artifact.id}
          className="rounded-xl border border-border bg-surface p-4 dark:border-border-dark dark:bg-surface-dark"
        >
          <Link
            to={`/artifacts/${artifact.id}`}
            className="mb-3 flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-black/5 text-text-secondary hover:opacity-80 dark:bg-white/5 dark:text-text-secondary-dark"
          >
            {artifact.thumbnailR2Key ? (
              <img
                src={`${API_BASE}/artifacts/${artifact.id}/thumbnail`}
                alt={artifact.title}
                className="h-full w-full object-cover"
              />
            ) : (
              t("artifactGrid.preview")
            )}
          </Link>
          <Link to={`/artifacts/${artifact.id}`} className="truncate font-medium hover:text-accent">
            {artifact.title}
          </Link>
          <div className="mt-2 flex items-center gap-2">
            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[artifact.status]}`}>
              {t(STATUS_KEY[artifact.status])}
            </span>
            {artifact.visibility === "public" && (
              <span className="inline-flex items-center gap-1 text-xs text-text-secondary dark:text-text-secondary-dark">
                <Eye size={12} />
                {t("artifactGrid.public")}
              </span>
            )}
          </div>

          {actor && actions && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3 dark:border-border-dark">
              {can(actor, "artifact.editMetadata", { artifact }) && (
                <button
                  onClick={() => actions.onEdit(artifact)}
                  title={t("artifactGrid.edit")}
                  className="rounded-md border border-border p-1.5 text-text-secondary hover:bg-black/5 dark:border-border-dark dark:text-text-secondary-dark dark:hover:bg-white/5"
                >
                  <Pencil size={14} />
                </button>
              )}
              {artifact.status === "draft" && can(actor, "artifact.submitForReview", { artifact }) && (
                <button
                  onClick={() => actions.onSubmit(artifact)}
                  title={t("artifactGrid.submit")}
                  className="rounded-md border border-border p-1.5 text-text-secondary hover:bg-black/5 dark:border-border-dark dark:text-text-secondary-dark dark:hover:bg-white/5"
                >
                  <Send size={14} />
                </button>
              )}
              {artifact.status === "pending_review" && can(actor, "artifact.approve", { artifact }) && (
                <button
                  onClick={() => actions.onApprove(artifact)}
                  title={t("artifactGrid.approve")}
                  className="rounded-md border border-border p-1.5 text-accent hover:bg-accent/10 dark:border-border-dark"
                >
                  <Check size={14} />
                </button>
              )}
              {artifact.status === "pending_review" && can(actor, "artifact.reject", { artifact }) && (
                <button
                  onClick={() => actions.onReject(artifact)}
                  title={t("artifactGrid.reject")}
                  className="rounded-md border border-border p-1.5 text-red-500 hover:bg-red-500/10 dark:border-border-dark"
                >
                  <X size={14} />
                </button>
              )}
              {artifact.status === "published" && can(actor, "artifact.publish", { artifact }) && (
                <button
                  onClick={() => actions.onToggleVisibility(artifact)}
                  title={artifact.visibility === "public" ? t("artifactGrid.makePrivate") : t("artifactGrid.makePublic")}
                  className="rounded-md border border-border p-1.5 text-text-secondary hover:bg-black/5 dark:border-border-dark dark:text-text-secondary-dark dark:hover:bg-white/5"
                >
                  {artifact.visibility === "public" ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              )}
              {can(actor, "artifact.delete", { artifact }) && (
                <button
                  onClick={() => actions.onDelete(artifact)}
                  title={t("artifactGrid.delete")}
                  className="ml-auto rounded-md border border-border p-1.5 text-red-500 hover:bg-red-500/10 dark:border-border-dark"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
