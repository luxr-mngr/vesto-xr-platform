/**
 * Shared <model-viewer> tuning so the live Artifact Detail viewer and the
 * off-screen thumbnail-capture viewer (MyLibrary.tsx) never drift apart.
 */
export const MODEL_EXPOSURE = "1";

interface SceneGraphTextureInfo {
  texture: unknown;
  setTexture(texture: unknown): Promise<void>;
}

interface SceneGraphMaterial {
  emissiveTexture?: SceneGraphTextureInfo;
  pbrMetallicRoughness: {
    baseColorTexture?: SceneGraphTextureInfo;
    setBaseColorFactor(rgba: [number, number, number, number]): void;
  };
  setEmissiveFactor(rgb: [number, number, number]): void;
}

/**
 * Sketchfab's GLB exporter commonly bakes an artifact's actual color photo
 * into the material's *emissive* slot instead of its base-color slot — likely
 * to bypass their own viewer's PBR relighting — while leaving base color at
 * its white default. A standards-compliant PBR renderer like model-viewer
 * takes that literally: white-lit geometry plus the photo glowing on top,
 * which reads as a washed-out/overexposed render no matter the exposure
 * setting, because the real texture is simply in the wrong slot.
 *
 * This moves any emissive-only texture into the base-color slot (and zeroes
 * the emissive factor so it isn't double-counted) using model-viewer's scene
 * graph API. Safe to run on any model — it's a no-op if a material already
 * has its own base-color texture.
 */
export async function fixEmissiveOnlyMaterials(viewer: {
  model?: { materials: SceneGraphMaterial[] };
}): Promise<void> {
  try {
    for (const material of viewer.model?.materials ?? []) {
      const emissiveTexture = material.emissiveTexture?.texture;
      const hasBaseColorTexture = !!material.pbrMetallicRoughness.baseColorTexture?.texture;
      if (!emissiveTexture || hasBaseColorTexture) continue;

      await material.pbrMetallicRoughness.baseColorTexture?.setTexture(emissiveTexture);
      material.pbrMetallicRoughness.setBaseColorFactor([1, 1, 1, 1]);
      await material.emissiveTexture?.setTexture(null);
      material.setEmissiveFactor([0, 0, 0]);
    }
  } catch {
    // Best-effort: if model-viewer's scene-graph API shape ever changes,
    // fall back to rendering the material as authored rather than throwing.
  }
}
