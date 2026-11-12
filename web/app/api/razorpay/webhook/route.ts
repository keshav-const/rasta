import { verifyWebhookSignature } from "@/lib/razorpay";
import { applySubscriptionEvent } from "@/lib/billing";

// Razorpay webhook — the SOURCE OF TRUTH for plan changes. The browser Checkout flow
// only starts a subscription; this server-to-server callback is what actually flips a
// user to Pro (or back to Free), because it's signed and can't be spoofed by a client.
//
// Configure in the Razorpay dashboard: URL = https://<app>/api/razorpay/webhook,
// secret = RAZORPAY_WEBHOOK_SECRET, events = subscription.*.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Must read the RAW body for signature verification — not the parsed JSON.
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (!(await verifyWebhookSignature(raw, signature))) {
    return new Response(JSON.stringify({ error: "invalid signature" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  let event: {
    event?: string;
    payload?: { subscription?: { entity?: { id?: string; status?: string; current_end?: number } } };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const sub = event.payload?.subscription?.entity;
  // Only subscription.* events carry a subscription entity; ignore the rest.
  if (event.event?.startsWith("subscription.") && sub?.id && sub.status) {
    try {
      await applySubscriptionEvent(sub.id, sub.status, sub.current_end ?? null);
    } catch (e) {
      // Log and 500 so Razorpay retries, rather than silently dropping a plan change.
      console.error("razorpay webhook apply failed:", e);
      return new Response("apply failed", { status: 500 });
    }
  }

  // Acknowledge everything else so Razorpay doesn't retry events we don't act on.
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
