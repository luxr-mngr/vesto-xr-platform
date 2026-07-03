function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Raw key shown once at creation; only its hash (below) is ever stored. */
export function generateRawApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `vxr_${toHex(bytes.buffer)}`;
}

export async function hashApiKey(rawKey: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawKey));
  return toHex(digest);
}
