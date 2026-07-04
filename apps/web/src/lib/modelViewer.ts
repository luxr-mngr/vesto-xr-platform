/**
 * Shared <model-viewer> tuning so the live Artifact Detail viewer and the
 * off-screen thumbnail-capture viewer (MyLibrary.tsx) never drift apart.
 * Lower than model-viewer's default of 1 — the default reads as blown-out
 * on pale/light-colored scans under its default studio lighting.
 */
export const MODEL_EXPOSURE = "0.4";
