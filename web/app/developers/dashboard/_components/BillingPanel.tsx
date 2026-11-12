"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PLANS, type PlanId } from "@/lib/plans";
import { startUpgrade, cancelPro } from "../../billing/actions";

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

// Minimal shape of the Razorpay Checkout global we use.
type RazorpayCtor = new (opts: Record<string, unknown>) => { open: () => void };
declare global {
  interface Window {
    Razorpay?: RazorpayCtor;
  }
}

function loadCheckout(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"));
    if (window.Razorpay) return resolve();
    const s = document.createElement("script");
    s.src = CHECKOUT_SRC;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("failed to load Razorpay"));
    document.body.appendChild(s);
  });
}

function PlanCard({
  plan,
  current,
  children,
}: {
  plan: (typeof PLANS)[PlanId];
  current: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-4 ${current ? "border-vermilion bg-vermilion/5" : "border-line bg-paper"}`}>
      <div className="flex items-baseline justify-between">
        <span className="font-display text-base font-semibold text-ink">{plan.name}</span>
        <span className="text-sm text-ink-soft">{plan.priceLabel}</span>
      </div>
      <p className="mt-1 text-xs text-ink-mute">{plan.blurb}</p>
      <ul className="mt-3 space-y-1 text-xs text-ink-soft">
        <li>{plan.reqPerMin.toLocaleString()} req/min · {plan.reqPerDay.toLocaleString()} req/day</li>
        <li>{plan.fullEvidence ? "Full source evidence" : "Core fields"}</li>
      </ul>
      <div className="mt-3">{current ? <span className="text-xs font-medium text-vermilion">Current plan</span> : children}</div>
    </div>
  );
}

export default function BillingPanel({
  currentPlan,
  billingConfigured,
  email,
}: {
  currentPlan: PlanId;
  billingConfigured: boolean;
  email: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function upgrade() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await startUpgrade();
      if (!res.ok) {
        setMsg(res.error);
        return;
      }
      await loadCheckout();
      const rzp = new window.Razorpay!({
        key: res.keyId,
        subscription_id: res.subscriptionId,
        name: "Khoj API",
        description: "Pro plan",
        prefill: { email },
        theme: { color: "#ea4e1b" },
        handler: () => {
          setMsg("Payment received — your plan activates in a few seconds.");
          setTimeout(() => router.refresh(), 4000);
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.open();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!confirm("Cancel Pro and revert your keys to Free limits?")) return;
    setBusy(true);
    setMsg(null);
    const res = await cancelPro();
    setBusy(false);
    if (res.ok) {
      setMsg("Subscription cancelled — back on Free.");
      router.refresh();
    } else {
      setMsg(res.error ?? "Could not cancel.");
    }
  }

  const isPro = currentPlan === "pro";

  return (
    <div className="rounded-2xl border border-line bg-paper-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Plan & billing</h2>
          <p className="text-sm text-ink-soft">
            You’re on <span className="font-medium text-ink">{PLANS[currentPlan].name}</span>. Your keys
            inherit this plan’s limits.
          </p>
        </div>
        {isPro && (
          <button
            onClick={cancel}
            disabled={busy}
            className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-soft transition hover:border-vermilion hover:text-vermilion disabled:opacity-50"
          >
            Cancel Pro
          </button>
        )}
      </div>

      {msg && (
        <p className="mb-4 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink">{msg}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <PlanCard plan={PLANS.free} current={currentPlan === "free"} />
        <PlanCard plan={PLANS.pro} current={isPro}>
          {billingConfigured ? (
            <button
              onClick={upgrade}
              disabled={busy}
              className="rounded-lg bg-ink px-3.5 py-2 text-xs font-medium text-paper transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Starting…" : "Upgrade to Pro"}
            </button>
          ) : (
            <span className="text-xs text-ink-mute">Billing coming soon</span>
          )}
        </PlanCard>
        <PlanCard plan={PLANS.enterprise} current={currentPlan === "enterprise"}>
          <a
            href="mailto:keshav.laddha@herovired.com?subject=Khoj%20API%20Enterprise"
            className="rounded-lg border border-line px-3.5 py-2 text-xs font-medium text-ink transition hover:border-ink"
          >
            Contact us
          </a>
        </PlanCard>
      </div>
    </div>
  );
}
