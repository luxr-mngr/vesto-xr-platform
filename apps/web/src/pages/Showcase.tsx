import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { API_BASE } from "../lib/api.js";
import { useI18n } from "../lib/i18n.js";
import { fixEmissiveOnlyMaterialsInGlb, MODEL_EXPOSURE } from "../lib/modelViewer.js";
import luxrLogo from "../assets/luxr-logo.svg";

interface ShowcaseField {
  key: string;
  label: string;
  value: string;
}

interface ShowcaseArtifact {
  id: string;
  title: string;
  description: string | null;
  hasGlb: boolean;
  hasThumbnail: boolean;
  fields: ShowcaseField[];
}

const AUTO_ADVANCE_SECONDS = 25;

/**
 * Fully unauthenticated kiosk view for demo-day: no login, one large piece at
 * a time, auto-rotating 3D model + description, auto-advancing through every
 * published+public artifact on a loop unless a visitor takes over the
 * next/prev controls (which pauses auto-advance so it isn't fighting them).
 */
export function Showcase() {
  const { t } = useI18n();
  const [artifacts, setArtifacts] = useState<ShowcaseArtifact[] | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [modelObjectUrl, setModelObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/public/showcase/artifacts`)
      .then((res) => res.json())
      .then((data: ShowcaseArtifact[]) => setArtifacts(data));
  }, []);

  const current = artifacts && artifacts.length > 0 ? artifacts[index % artifacts.length] : null;

  useEffect(() => {
    if (!playing || !artifacts || artifacts.length < 2) return;
    const timer = setInterval(() => setIndex((i) => i + 1), AUTO_ADVANCE_SECONDS * 1000);
    return () => clearInterval(timer);
  }, [playing, artifacts]);

  useEffect(() => {
    if (!current?.hasGlb) {
      setModelObjectUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    fetch(`${API_BASE}/public/showcase/artifacts/${current.id}/glb`)
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(res)))
      .then((buffer) => {
        if (cancelled) return;
        const fixed = fixEmissiveOnlyMaterialsInGlb(buffer);
        objectUrl = URL.createObjectURL(new Blob([fixed], { type: "model/gltf-binary" }));
        setModelObjectUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setModelObjectUrl(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [current?.id, current?.hasGlb]);

  const dots = useMemo(() => artifacts ?? [], [artifacts]);

  function goTo(i: number) {
    setPlaying(false);
    setIndex(i);
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg-dark text-white">
      <header className="flex items-center justify-between px-8 py-5">
        <img src={luxrLogo} alt="LUXR" className="h-6 opacity-80" />
        <h1 className="text-lg font-semibold tracking-wide">{t("showcase.title")}</h1>
        <div className="w-6" />
      </header>

      {!artifacts && <div className="flex flex-1 items-center justify-center text-text-secondary-dark">{t("showcase.loading")}</div>}

      {artifacts && artifacts.length === 0 && (
        <div className="flex flex-1 items-center justify-center text-text-secondary-dark">{t("showcase.empty")}</div>
      )}

      {current && (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-8 pb-8 lg:flex-row lg:items-stretch">
          <div className="flex aspect-square w-full max-w-2xl flex-1 items-center justify-center overflow-hidden rounded-2xl bg-black/30">
            {modelObjectUrl ? (
              <model-viewer
                key={current.id}
                src={modelObjectUrl}
                alt={current.title}
                camera-controls
                auto-rotate
                exposure={MODEL_EXPOSURE}
                style={{ width: "100%", height: "100%" }}
              />
            ) : (
              <span className="text-text-secondary-dark">{t("showcase.loadingPreview")}</span>
            )}
          </div>

          <div className="flex w-full max-w-md flex-col justify-center gap-4">
            <h2 className="text-3xl font-bold">{current.title}</h2>
            {current.description && <p className="text-lg text-text-secondary-dark">{current.description}</p>}
            {current.fields.length > 0 && (
              <dl className="mt-2 space-y-2 border-t border-white/10 pt-4">
                {current.fields.map((f) => (
                  <div key={f.key} className="flex justify-between gap-4 text-sm">
                    <dt className="text-text-secondary-dark">{f.label}</dt>
                    <dd className="text-right font-medium">{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      )}

      {dots.length > 1 && (
        <footer className="flex items-center justify-center gap-4 pb-8">
          <button
            onClick={() => goTo(index - 1)}
            className="rounded-full border border-white/20 p-2 hover:bg-white/10"
            aria-label={t("showcase.previous")}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={() => setPlaying((p) => !p)}
            className="rounded-full border border-white/20 p-2 hover:bg-white/10"
            aria-label={playing ? t("showcase.pause") : t("showcase.play")}
          >
            {playing ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button
            onClick={() => goTo(index + 1)}
            className="rounded-full border border-white/20 p-2 hover:bg-white/10"
            aria-label={t("showcase.next")}
          >
            <ChevronRight size={20} />
          </button>
          <div className="ml-4 flex gap-1.5">
            {dots.map((a, i) => (
              <button
                key={a.id}
                onClick={() => goTo(i)}
                aria-label={a.title}
                className={`h-2 w-2 rounded-full ${i === index % dots.length ? "bg-white" : "bg-white/25"}`}
              />
            ))}
          </div>
        </footer>
      )}
    </div>
  );
}
