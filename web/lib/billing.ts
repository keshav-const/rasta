import "server-only";
import { supabaseAdmin } from "./supabase";
import type { PlanId } from "./plans";

// Billing state lives in the `subscriptions` table; the ENFORCED plan is the `plan`
// column on a user's api_keys (which the Go API reads per-request). So "applying" a
// plan = stamping that column. The subscriptions table is the source of truth + audit.

const ACTIVE = new Set(["active", "authenticated", "charged"]);

/** The user's current effective plan: 'pro'/'enterprise' if they have an active
 *  subscription, else 'free'. */
export async function getUserPlan(userId: string): Promise<PlanId> {
  const { data } = await supabaseAdmin()
    .from("subscriptions")
    .select("plan,status")
    .eq("user_id", userId)
    .in("status", ["active", "authenticated", "charged"])
    .order("created_at", { ascending: false })
    .limit(1);
  const row = data?.[0];
  return (row?.plan as PlanId) ?? "free";
}

/** Stamp every one of a user's keys with a plan — this is what actually changes what
 *  the API enforces. Called from the webhook on activate/cancel. */
export async function applyPlanToKeys(userId: string, plan: PlanId): Promise<void> {
  await supabaseAdmin().from("api_keys").update({ plan }).eq("user_id", userId);
}

/** Record a freshly-created subscription (status 'created') so the webhook can map the
 *  Razorpay subscription id back to this user later. */
export async function recordSubscription(
  userId: string,
  subscriptionId: string,
  plan: PlanId,
): Promise<void> {
  await supabaseAdmin()
    .from("subscriptions")
    .upsert(
      { user_id: userId, razorpay_subscription_id: subscriptionId, plan, status: "created" },
      { onConflict: "razorpay_subscription_id" },
    );
}

/** Apply a Razorpay subscription event: update the row's status and, as a side effect,
 *  stamp the user's keys with the right plan (pro when active, free when it ends). */
export async function applySubscriptionEvent(
  subscriptionId: string,
  status: string,
  periodEnd: number | null,
): Promise<{ matched: boolean }> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("subscriptions")
    .select("user_id,plan")
    .eq("razorpay_subscription_id", subscriptionId)
    .limit(1);
  const row = data?.[0];
  if (!row) return { matched: false }; // unknown subscription (not ours) — ignore

  await admin
    .from("subscriptions")
    .update({
      status,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("razorpay_subscription_id", subscriptionId);

  const plan = (row.plan as PlanId) ?? "pro";
  await applyPlanToKeys(row.user_id as string, ACTIVE.has(status) ? plan : "free");
  return { matched: true };
}

/** The user's active subscription id, if any (for cancel). */
export async function activeSubscriptionId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from("subscriptions")
    .select("razorpay_subscription_id,status")
    .eq("user_id", userId)
    .in("status", ["active", "authenticated", "charged", "created"])
    .order("created_at", { ascending: false })
    .limit(1);
  return (data?.[0]?.razorpay_subscription_id as string) ?? null;
}
