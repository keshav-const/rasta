import "server-only";

// API-key generation for the developer portal.
//
// The format MUST match the Go service byte-for-byte, so a key minted here
// authenticates there without any shared code (see rasta-api/cmd/mintkey/main.go
// and rasta-api/internal/auth.HashKey):
//
//   raw    = "khoj_" + 24 random bytes as lowercase hex   (48 hex → 53 chars total)
//   hash   = sha256(raw) as lowercase hex                 (ONLY this is persisted)
//   prefix = raw[:14] = "khoj_" + 9 hex chars             (shown in the dashboard)
//
// The raw key is returned ONCE to the creating request and never stored; a DB leak
// therefore can't be replayed against the API. Pure Web Crypto so it runs in either
// the Node or Edge runtime, like lib/auth.ts.

const HEX = "0123456789abcdef";

function toHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += HEX[b >> 4] + HEX[b & 0x0f];
  return s;
}

export type MintedKey = { raw: string; hash: string; prefix: string };

export async function mintApiKey(): Promise<MintedKey> {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  const raw = "khoj_" + toHex(buf);
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)),
  );
  return { raw, hash: toHex(digest), prefix: raw.slice(0, 14) };
}
