import Link from "next/link";
import { redirect } from "next/navigation";
import { readDevSession } from "@/lib/devauth";
import { supabaseAdmin } from "@/lib/supabase";
import {
  aggregateUsage,
  summarize,
  lastNDays,
  USAGE_WINDOW_DAYS,
  type UsageRow,
} from "@/lib/usage";
import { logout } from "../actions";
import KeyManager, { type KeyRow } from "./_components/KeyManager";

export const dynamic = "force-dynamic";

export default async function DeveloperDashboard() {
  const session = await readDevSession();
  if (!session) redirect("/developers/login");

  const admin = supabaseAdmin();

  // Keys scoped to the signed-in developer. Never selects key_hash — the raw key
  // is unrecoverable by design, and the hash has no business reaching the client.
  const { data } = await admin
    .from("api_keys")
    .select("id,name,key_prefix,plan,created_at,last_used_at,revoked_at")
    .eq("user_id", session.sub)
    .order("created_at", { ascending: false });
  const keys: KeyRow[] = (data ?? []).map((k) => ({
    id: k.id,
    name: k.name,
    prefix: k.key_prefix,
    plan: k.plan,
    createdAt: k.created_at,
    lastUsedAt: k.last_used_at,
    revokedAt: k.revoked_at,
  }));

  // Usage: read the last 30 days of api_usage for THIS developer's keys only
  // (api_usage has no user_id, so we scope by the key ids we just fetched).
  const keyIds = keys.map((k) => k.id);
  let usageRows: UsageRow[] = [];
  if (keyIds.length) {
    const since = lastNDays(USAGE_WINDOW_DAYS)[0];
    const { data: u } = await admin
      .from("api_usage")
      .select("api_key_id, day, requests")
      .in("api_key_id", keyIds)
      .gte("day", since);
    usageRows = (u ?? []) as UsageRow[];
  }
  const usage = aggregateUsage(usageRows);
  const summary = summarize(usage);

  return (
    <div className="min-h-screen bg-paper px-6 py-12">
      <div className="grain pointer-events-none absolute inset-0" />
      <div className="relative z-10 mx-auto max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/developers" className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-vermilion font-display text-lg font-semibold text-paper">
              K
            </span>
            <span className="leading-tight">
              <span className="block font-display text-base font-semibold text-ink">Khoj</span>
              <span className="block text-[11px] uppercase tracking-[0.2em] text-ink-mute">
                Developers
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/developers/docs"
              className="rounded-xl px-3.5 py-2 text-sm text-ink-soft transition hover:text-ink"
            >
              Docs
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-xl border border-line px-3.5 py-2 text-sm text-ink-soft transition hover:border-ink hover:text-ink"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>

        <h1 className="mb-1 font-display text-2xl font-semibold text-ink">Dashboard</h1>
        <p className="mb-8 text-sm text-ink-soft">
          Signed in as <span className="font-medium text-ink">{session.email}</span>.
        </p>

        <KeyManager keys={keys} usage={usage} summary={summary} />
      </div>
    </div>
  );
}
