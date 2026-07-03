// Minimal HMAC-SHA256 signed token (JWT-shaped) using WebCrypto only —
// no external dependency, works identically under Workers and Node/Vitest.

export interface SessionClaims {
  sub: string; // user id
  exp: number; // unix seconds
}

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let str = "";
  for (const b of arr) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(input.length + ((4 - (input.length % 4)) % 4), "=");
  const str = atob(padded);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signSession(claims: SessionClaims, secret: string): Promise<string> {
  const payload = base64url(new TextEncoder().encode(JSON.stringify(claims)));
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${base64url(signature)}`;
}

export async function verifySession(token: string, secret: string): Promise<SessionClaims | null> {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64urlDecode(signature),
    new TextEncoder().encode(payload)
  );
  if (!valid) return null;

  const claims = JSON.parse(new TextDecoder().decode(base64urlDecode(payload))) as SessionClaims;
  if (claims.exp < Math.floor(Date.now() / 1000)) return null;
  return claims;
}
