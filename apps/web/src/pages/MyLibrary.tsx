import { useEffect, useState, type FormEvent } from "react";
import { isVisibleInMyLibrary, MAX_GLB_SIZE_BYTES, type Artifact, type Organization, type User } from "@vestoxr/shared";
import { Upload } from "lucide-react";
import { API_BASE, apiFetch, apiUploadFile } from "../lib/api.js";
import { ArtifactGrid, type ArtifactActions } from "../components/ArtifactGrid.js";
import { useAuth } from "../context/AuthContext.js";
import { useI18n } from "../lib/i18n.js";
import { fixEmissiveOnlyMaterialsInGlb, MODEL_EXPOSURE } from "../lib/modelViewer.js";

/**
 * Renders a GLB off-screen in a throwaway <model-viewer> and captures a PNG
 * snapshot once it's loaded (ERS §7) — avoids needing a server-side 3D
 * renderer for thumbnails. Resolves null on load failure/timeout so a bad/slow
 * model never blocks the artifact upload itself.
 *
 * `reveal="manual"` + `loading="eager"` + `dismissPoster()` are required here:
 * model-viewer's defaults use an IntersectionObserver to defer loading/
 * rendering until the element is visible in the viewport, and this element is
 * deliberately positioned off-screen — without overriding that, "load" never
 * fires and every capture silently times out after 15s.
 */
async function captureThumbnail(file: File): Promise<Blob | null> {
  const fixed = fixEmissiveOnlyMaterialsInGlb(await file.arrayBuffer());
  const fixedBlob = new Blob([fixed], { type: "model/gltf-binary" });

  return new Promise((resolve) => {
    const viewer = document.createElement("model-viewer") as HTMLElement & {
      src: string;
      toBlob: (opts?: { idealAspect?: boolean }) => Promise<Blob>;
      dismissPoster: () => void;
    };
    viewer.setAttribute("reveal", "manual");
    viewer.setAttribute("loading", "eager");
    // Matches ArtifactDetail's live viewer exposure so a captured thumbnail
    // doesn't look brighter/more blown-out than the model actually renders.
    viewer.setAttribute("exposure", MODEL_EXPOSURE);
    viewer.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:512px;height:512px;";
    const objectUrl = URL.createObjectURL(fixedBlob);
    viewer.src = objectUrl;
    document.body.appendChild(viewer);
    viewer.dismissPoster();

    let settled = false;
    const finish = (result: Blob | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      URL.revokeObjectURL(objectUrl);
      viewer.remove();
      resolve(result);
    };

    const timeout = setTimeout(() => finish(null), 15000);
    viewer.addEventListener(
      "load",
      () => {
        viewer.toBlob({ idealAspect: true }).then(finish).catch(() => finish(null));
      },
      { once: true }
    );
    viewer.addEventListener("error", () => finish(null), { once: true });
  });
}

/** My Library: the logged-in user's own organization, every status (ADR 0003). */
export function MyLibrary() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newOrgId, setNewOrgId] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function load() {
    setArtifacts(await apiFetch<Artifact[]>("/artifacts"));
  }

  useEffect(() => {
    load();
    if (user?.role === "admin") apiFetch<Organization[]>("/organizations").then(setOrganizations);
  }, [user?.role]);

  // `status: "active"` is safe to assume here: this page only renders behind
  // ProtectedRoute, which already requires an authenticated (active) user.
  const actor: User | null = user ? { ...user, status: "active" } : null;
  const mine = actor ? (artifacts ?? []).filter((a) => isVisibleInMyLibrary(actor, a)) : [];

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    if (newFile && newFile.size > MAX_GLB_SIZE_BYTES) {
      setUploadError(t("myLibrary.fileTooLarge"));
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const artifact = await apiFetch<Artifact>("/artifacts", {
        method: "POST",
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDescription.trim() || undefined,
          organizationId: newOrgId || undefined,
        }),
      });
      if (newFile) {
        await apiUploadFile(`/artifacts/${artifact.id}/glb`, newFile);
        const thumbnail = await captureThumbnail(newFile);
        if (thumbnail) {
          await apiUploadFile(`/artifacts/${artifact.id}/thumbnail`, new File([thumbnail], "thumbnail.png", { type: "image/png" }));
        }
      }
      setNewTitle("");
      setNewDescription("");
      setNewOrgId("");
      setNewFile(null);
      setShowUpload(false);
      await load();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t("login.genericError"));
    } finally {
      setUploading(false);
    }
  }

  const actions: ArtifactActions = {
    onSubmit: async (a) => {
      await apiFetch(`/artifacts/${a.id}/submit`, { method: "POST" });
      await load();
    },
    onApprove: async (a) => {
      await apiFetch(`/artifacts/${a.id}/approve`, { method: "POST" });
      await load();
    },
    onReject: async (a) => {
      if (!confirm(t("myLibrary.confirmReject"))) return;
      await apiFetch(`/artifacts/${a.id}/reject`, { method: "POST" });
      await load();
    },
    onToggleVisibility: async (a) => {
      const visibility = a.visibility === "public" ? "private" : "public";
      await apiFetch(`/artifacts/${a.id}/visibility`, { method: "POST", body: JSON.stringify({ visibility }) });
      await load();
    },
    onEdit: async (a) => {
      const title = window.prompt(t("myLibrary.editTitle"), a.title);
      if (!title || title === a.title) return;
      await apiFetch(`/artifacts/${a.id}`, { method: "PATCH", body: JSON.stringify({ title }) });
      await load();
    },
    onDelete: async (a) => {
      if (!confirm(t("myLibrary.confirmDelete"))) return;
      await apiFetch(`/artifacts/${a.id}`, { method: "DELETE" });
      await load();
    },
    onRegenerateThumbnail: async (a) => {
      // Backfill for artifacts uploaded before thumbnail capture worked, or
      // whose capture failed silently — re-fetches the already-stored GLB
      // (via our own authenticated request, since model-viewer's internal
      // fetch wouldn't carry the session cookie cross-origin) and re-runs
      // the same off-screen capture used at upload time.
      const res = await fetch(`${API_BASE}/artifacts/${a.id}/glb`, { credentials: "include" });
      if (!res.ok) return;
      const file = new File([await res.blob()], "model.glb", { type: "model/gltf-binary" });
      const thumbnail = await captureThumbnail(file);
      if (thumbnail) {
        await apiUploadFile(`/artifacts/${a.id}/thumbnail`, new File([thumbnail], "thumbnail.png", { type: "image/png" }));
        await load();
      }
    },
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("myLibrary.title")}</h1>
          <p className="mt-1 text-text-secondary dark:text-text-secondary-dark">{t("myLibrary.subtitle")}</p>
        </div>
        <button
          onClick={() => setShowUpload((v) => !v)}
          className="flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Upload size={16} />
          {t("myLibrary.upload")}
        </button>
      </div>

      {showUpload && (
        <form
          onSubmit={upload}
          className="mb-6 mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-5 dark:border-border-dark dark:bg-surface-dark"
        >
          <div>
            <label className="mb-1 block text-sm font-medium">{t("myLibrary.uploadTitle")}</label>
            <input
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-56 rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent dark:border-border-dark"
            />
          </div>
          {user?.role === "admin" && (
            <div>
              <label className="mb-1 block text-sm font-medium">{t("myLibrary.uploadOrganization")}</label>
              <select
                required
                value={newOrgId}
                onChange={(e) => setNewOrgId(e.target.value)}
                className="w-40 rounded-md border border-border bg-transparent px-2 py-2 text-sm dark:border-border-dark"
              >
                <option value="">—</option>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium">{t("myLibrary.uploadDescription")}</label>
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              rows={2}
              className="w-56 rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent dark:border-border-dark"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("myLibrary.uploadFile")}</label>
            <input
              type="file"
              accept=".glb,model/gltf-binary"
              onChange={(e) => setNewFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={uploading}
            className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {uploading ? t("myLibrary.uploading") : t("myLibrary.uploadSubmit")}
          </button>
          <button
            type="button"
            onClick={() => setShowUpload(false)}
            className="rounded-md border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:bg-black/5 dark:border-border-dark dark:text-text-secondary-dark dark:hover:bg-white/5"
          >
            {t("admin.cancel")}
          </button>
          {uploadError && <p className="w-full text-sm text-red-500">{uploadError}</p>}
        </form>
      )}

      <div className="mt-6">
        <ArtifactGrid artifacts={mine} emptyLabel={t("myLibrary.empty")} actor={actor} actions={actions} />
      </div>
    </div>
  );
}
