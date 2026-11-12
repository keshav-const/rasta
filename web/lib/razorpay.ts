import "server-only";

// Minimal Razorpay REST client — no SDK dependency, just fetch + Basic auth. Test and
// live modes differ only by which keys are in the env, so flipping is a dashboard change.
// Nothing here runs unless billing env is configured (see razorpayConfigured).

const BASE = "https://api.razorpay.com/v1";

const KEY_ID = process.env.RAZORPAY_KEY_ID ?? "";
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? "";
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";

/** True only when the keys needed to create subscriptions are present. The UI uses
 *  this to show "billing coming soon" instead of a broken button before keys are set. */
export function razorpayConfigured(): boolean {
  return Boolean(KEY_ID && KEY_SECRET && process.env.RAZORPAY_PLAN_ID_PRO);
}

/** The public key id Checkout.js needs in the browser. Safe to expose. */
export function publicKeyId(): string {
  return process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || KEY_ID;
}

async function rzp(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (body?.error as { description?: string })?.description ?? res.statusText;
    throw new Error(`razorpay ${res.status}: ${msg}`);
  }
  return body;
}

/** Create a recurring subscription for the Pro plan. `notes` carries our user_id so the
 *  webhook can map the subscription back to the account. */
export async function createSubscription(
  planId: string,
  notes: Record<string, string>,
): Promise<{ id: string; short_url?: string; status?: string }> {
  const body = await rzp("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      plan_id: planId,
      total_count: 120, // up to 120 cycles; effectively ongoing for monthly
      customer_notify: 1,
      notes,
    }),
  });
  return { id: body.id as string, short_url: body.short_url as string, status: body.status as string };
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  // cancel_at_cycle_end:0 = cancel immediately.
  await rzp(`/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ cancel_at_cycle_end: 0 }),
  });
}

/** Verify a webhook's X-Razorpay-Signature = HMAC-SHA256(rawBody, webhook_secret), hex.
 *  Constant-time compare. Returns false if no secret is configured. */
export async function verifyWebhookSignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!WEBHOOK_SECRET || !signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const expected = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
