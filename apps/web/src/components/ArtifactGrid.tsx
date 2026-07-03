import type { Artifact } from "@vestoxr/shared";
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

export function ArtifactGrid({ artifacts, emptyLabel }: { artifacts: Artifact[]; emptyLabel: string }) {
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
          <div className="mb-3 flex aspect-square items-center justify-center rounded-lg bg-black/5 text-text-secondary dark:bg-white/5 dark:text-text-secondary-dark">
            {t("artifactGrid.preview")}
          </div>
          <p className="truncate font-medium">{artifact.title}</p>
          <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[artifact.status]}`}>
            {t(STATUS_KEY[artifact.status])}
          </span>
        </div>
      ))}
    </div>
  );
}
