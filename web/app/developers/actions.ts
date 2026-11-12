"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { mintApiKey } from "@/lib/apikey";
import { getUserPlan } from "@/lib/billing";
import {
  supabaseAuthClient,
  createDevSessionToken,
  readDevSession,
  DEV_SESSION_COOKIE,
  DEV_MAX_AGE_SEC,
} from "@/lib/devauth";

const DASHBOARD = "/developers/dashboard";
// Self-serve cap: one developer can hold at most this many ACTIVE keys. Caps the
// blast radius of a leaked account and keeps bulk-key minting (an abuse vector)
// off the table. Revoking frees a slot.
const MAX_ACTIVE_KEYS = 10;

async function startSession(sub: string, email: string) {
  const store = await cookies();
  store.set(DEV_SESSION_COOKIE, await createDevSessionToken(sub, email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DEV_MAX_AGE_SEC,
  });
}

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email.includes("@") || password.length < 8) {
    redirect("/developers/signup?error=invalid");
  }
  // Account creation needs the service role; email_confirm:true skips the email
  // round-trip (no mail infra needed for the portal).
  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    const code = error?.message.toLowerCase().includes("already") ? "exists" : "failed";
    redirect(`/developers/signup?error=${code}`);
  }
  await startSession(data.user.id, email);
  redirect("/developers/dashboard");
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const { data, error } = await supabaseAuthClient().auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    redirect("/developers/login?error=1");
  }
  await startSession(data.user.id, email);
  redirect("/developers/dashboard");
}

export async function logout() {
  const store = await cookies();
  store.delete(DEV_SESSION_COOKIE);
  redirect("/developers/login");
}

// --- API key management (M3 inc 2) -------------------------------------------
// The Next app owns key issuance because it has the service_role (RLS-bypassing)
// Postgres client; the Go API only ever READS api_keys to resolve a key -> plan.
// Identity always comes from the session cookie, never from client-supplied form
// data — a Server Action is a public POST endpoint, so ownership is enforced here.

export type CreateKeyResult =
  | { ok: true; rawKey: string; prefix: string }
  | { ok: false; error: string };

/** useActionState signature: (prevState, formData). Returns the raw key ONCE. */
export async function createKey(
  _prev: CreateKeyResult | null,
  formData: FormData,
): Promise<CreateKeyResult> {
  const session = await readDevSession();
  if (!session) return { ok: false, error: "Your session expired — sign in again." };

  const name = String(formData.get("name") ?? "").trim().slice(0, 60) || "default";
  const admin = supabaseAdmin();

  // Enforce the per-developer active-key cap (scoped to THIS user's id).
  const { count, error: countErr } = await admin
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .eq("user_id", session.sub)
    .is("revoked_at", null);
  if (countErr) return { ok: false, error: "Could not create key. Try again." };
  if ((count ?? 0) >= MAX_ACTIVE_KEYS) {
    return { ok: false, error: `You can have ${MAX_ACTIVE_KEYS} active keys. Revoke one first.` };
  }

  const { raw, hash, prefix } = await mintApiKey();
  // Keys inherit the ACCOUNT's current plan (Pro if the user has an active subscription,
  // else Free) — so a Pro user's new keys get Pro limits immediately. Storing only the
  // hash means the raw key below is the one and only time it is ever visible.
  const plan = await getUserPlan(session.sub);
  const { error } = await admin.from("api_keys").insert({
    user_id: session.sub,
    owner_email: session.email,
    name,
    key_hash: hash,
    key_prefix: prefix,
    plan,
    scopes: [],
  });
  if (error) return { ok: false, error: "Could not create key. Try again." };

  revalidatePath(DASHBOARD); // re-render the list in the same response
  return { ok: true, rawKey: raw, prefix };
}

/** Soft-delete (set revoked_at). A revoked key stops authenticating immediately
 *  because the Go lookup index is partial on `revoked_at is null`. */
export async function revokeKey(formData: FormData) {
  const session = await readDevSession();
  if (!session) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  // Ownership-scoped: the id comes from the client, so we only touch a row that is
  // BOTH that id AND owned by the signed-in user — one developer can never revoke
  // another's key by POSTing an arbitrary id.
  await supabaseAdmin()
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", session.sub)
    .is("revoked_at", null);
  revalidatePath(DASHBOARD);
}
