// Admin session helpers — a signed, expiring session token backing the admin
// password gate. Pure Web Crypto (HMAC-SHA256) + base64url so this runs in BOTH
// the Edge middleware and Node server actions. No next/headers import here (that
// would break the Edge runtime) — cookie reading/writing lives at the call site.

const enc = new TextEncoder();
const dec = new TextDecoder();

export const SESSION_COOKIE = "admin_session";
export const MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days

function toB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/** Mint a signed `<payload>.<sig>` token whose payload carries an expiry. */
export async function createSessionToken(): Promise<string> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not set");
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC;
  const payload = toB64Url(enc.encode(JSON.stringify({ exp })));
  const key = await hmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
  return `${payload}.${toB64Url(sig)}`;
}

/** True only if the token's signature verifies AND it hasn't expired. Fails closed. */
export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || !token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  try {
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify("HMAC", key, fromB64Url(sig) as BufferSource, enc.encode(payload));
    if (!ok) return false;
    const { exp } = JSON.parse(dec.decode(fromB64Url(payload)));
    return typeof exp === "number" && exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

/** Constant-time-ish password check against ADMIN_PASSWORD. Fails closed if unset. */
export function verifyPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!expected || input.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < input.length; i++) diff |= input.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
