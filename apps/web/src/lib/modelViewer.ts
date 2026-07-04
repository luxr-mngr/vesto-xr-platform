/**
 * Shared <model-viewer> tuning so the live Artifact Detail viewer and the
 * off-screen thumbnail-capture viewer (MyLibrary.tsx) never drift apart.
 */
export const MODEL_EXPOSURE = "1";

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK_TYPE = 0x4e4f534a;

/**
 * Sketchfab's GLB exporter commonly bakes an artifact's actual color photo
 * into a material's *emissive* slot instead of its base-color slot — likely
 * to bypass their own viewer's PBR relighting — leaving base color at its
 * white default. A standards-compliant PBR renderer like model-viewer takes
 * that literally: white-lit geometry plus the photo glowing on top, which
 * reads as a washed-out/overexposed render no matter the exposure setting,
 * because the real texture is simply in the wrong slot.
 *
 * This rewrites the GLB's JSON chunk directly — moving any emissive-only
 * texture into the base-color slot and zeroing the emissive factor — rather
 * than mutating model-viewer's in-memory scene graph after load, since that
 * relies on assumptions about a third-party API surface that turned out not
 * to hold. A raw binary rewrite can be verified byte-for-byte independent of
 * any particular viewer's runtime behavior. Returns the input unchanged if
 * it isn't a valid GLB or no material needs fixing.
 */
export function fixEmissiveOnlyMaterialsInGlb(glb: ArrayBuffer): ArrayBuffer {
  const view = new DataView(glb);
  if (glb.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC) return glb;

  const version = view.getUint32(4, true);
  const jsonChunkLength = view.getUint32(12, true);
  const jsonChunkType = view.getUint32(16, true);
  if (jsonChunkType !== JSON_CHUNK_TYPE) return glb;

  const jsonStart = 20;
  const jsonText = new TextDecoder().decode(new Uint8Array(glb, jsonStart, jsonChunkLength));
  const json = JSON.parse(jsonText);

  let changed = false;
  for (const material of json.materials ?? []) {
    const hasBaseColorTexture = !!material.pbrMetallicRoughness?.baseColorTexture;
    const emissiveTexture = material.emissiveTexture;
    if (!hasBaseColorTexture && emissiveTexture) {
      material.pbrMetallicRoughness = material.pbrMetallicRoughness ?? {};
      material.pbrMetallicRoughness.baseColorTexture = { ...emissiveTexture };
      delete material.emissiveTexture;
      material.emissiveFactor = [0, 0, 0];
      changed = true;
    }
  }
  if (!changed) return glb;

  let newJsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const pad = (4 - (newJsonBytes.length % 4)) % 4;
  if (pad > 0) {
    const padded = new Uint8Array(newJsonBytes.length + pad);
    padded.set(newJsonBytes);
    padded.fill(0x20, newJsonBytes.length);
    newJsonBytes = padded;
  }

  const restStart = jsonStart + jsonChunkLength;
  const rest = new Uint8Array(glb, restStart);
  const newTotalLength = jsonStart + newJsonBytes.length + rest.length;

  const out = new ArrayBuffer(newTotalLength);
  const outView = new DataView(out);
  outView.setUint32(0, GLB_MAGIC, true);
  outView.setUint32(4, version, true);
  outView.setUint32(8, newTotalLength, true);
  outView.setUint32(12, newJsonBytes.length, true);
  outView.setUint32(16, JSON_CHUNK_TYPE, true);
  new Uint8Array(out, jsonStart, newJsonBytes.length).set(newJsonBytes);
  new Uint8Array(out, jsonStart + newJsonBytes.length, rest.length).set(rest);

  return out;
}
