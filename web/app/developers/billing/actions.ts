"use server";

import { readDevSession } from "@/lib/devauth";
import {
  razorpayConfigured,
  publicKeyId,
  createSubscription,
  cancelSubscription,
} from "@/lib/razorpay";
import { getUserPlan, recordSubscription, applyPlanToKeys, activeSubscriptionId } from "@/lib/billing";

export type UpgradeResult =
  | { ok: true; subscriptionId: string; keyId: string }
  | { ok: false; error: string };

/** Start a Pro upgrade: create a Razorpay subscription, remember it against the user,
 *  and hand the browser what Checkout.js needs. The actual plan flip happens later, in
 *  the webhook (the trusted path) — never here. */
export async function startUpgrade(): Promise<UpgradeResult> {
  const session = await readDevSession();
  if (!session) return { ok: false, error: "Your session expired — sign in again." };
  if (!razorpayConfigured()) return { ok: false, error: "Billing isn’t configured yet." };

  if ((await getUserPlan(session.sub)) === "pro") {
    return { ok: false, error: "You’re already on Pro." };
  }

  const planId = process.env.RAZORPAY_PLAN_ID_PRO!;
  try {
    const sub = await createSubscription(planId, { user_id: session.sub, email: session.email });
    await recordSubscription(session.sub, sub.id, "pro");
    return { ok: true, subscriptionId: sub.id, keyId: publicKeyId() };
  } catch (e) {
    console.error("startUpgrade failed:", e);
    return { ok: false, error: "Could not start checkout. Try again." };
  }
}

export type CancelResult = { ok: boolean; error?: string };

/** Cancel the user's subscription immediately. We flip keys back to Free right away for
 *  responsiveness; the webhook will also confirm it. */
export async function cancelPro(): Promise<CancelResult> {
  const session = await readDevSession();
  if (!session) return { ok: false, error: "Your session expired." };
  const subId = await activeSubscriptionId(session.sub);
  if (!subId) return { ok: false, error: "No active subscription found." };
  try {
    await cancelSubscription(subId);
    await applyPlanToKeys(session.sub, "free");
    return { ok: true };
  } catch (e) {
    console.error("cancelPro failed:", e);
    return { ok: false, error: "Could not cancel. Try again." };
  }
}
