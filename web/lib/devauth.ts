import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { signPayload, verifyPayload } from "./auth";

// Developer-portal session. Identity comes from Supabase Auth (auth.users); the
// session itself is the same Edge-safe signed cookie the admin gate uses, carrying
// the developer's user id + email. Separate cookie + payload from the admin session.

export const DEV_SESSION_COOKIE = "dev_session";
export const DEV_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days

function sessionSecret(): string {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s) throw new Error("ADMIN_SESSION_SECRET is not set");
  return s;
}

export type DevSession = { sub: string; email: string };
type Payload = DevSession & { exp: number };

export async function createDevSessionToken(sub: string, email: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + DEV_MAX_AGE_SEC;
  return signPayload({ sub, email, exp }, sessionSecret());
}

/** Read + verify the developer session cookie (for server components / actions). */
export async function readDevSession(): Promise<DevSession | null> {
  const store = await cookies();
  const p = await verifyPayload<Payload>(store.get(DEV_SESSION_COOKIE)?.value, sessionSecret());
  if (!p || typeof p.exp !== "number" || p.exp <= Math.floor(Date.now() / 1000)) return null;
  return { sub: p.sub, email: p.email };
}

/** Public auth client (anon key) — used for signInWithPassword. Account creation
 *  uses the service-role admin client (lib/supabase.ts) instead. */
export function supabaseAuthClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
