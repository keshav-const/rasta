"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import {
  supabaseAuthClient,
  createDevSessionToken,
  DEV_SESSION_COOKIE,
  DEV_MAX_AGE_SEC,
} from "@/lib/devauth";

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
