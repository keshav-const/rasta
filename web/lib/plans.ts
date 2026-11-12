// Plan catalog for the portal UI. The ENFORCED limits live in the Go API
// (internal/auth.Plans) — this is the display/metadata mirror. A key's `plan` column
// is what the API reads; billing just updates that column (see lib/billing.ts).

export type PlanId = "free" | "pro" | "enterprise";

export type PlanInfo = {
  id: PlanId;
  name: string;
  priceLabel: string;
  reqPerMin: number;
  reqPerDay: number;
  maxPage: number;
  fullEvidence: boolean;
  selfServe: boolean; // can a developer buy it from the dashboard?
  blurb: string;
};

export const PLANS: Record<PlanId, PlanInfo> = {
  free: {
    id: "free",
    name: "Free",
    priceLabel: "₹0",
    reqPerMin: 60,
    reqPerDay: 5_000,
    maxPage: 100,
    fullEvidence: false,
    selfServe: true,
    blurb: "For prototyping and small projects.",
  },
  pro: {
    id: "pro",
    name: "Pro",
    // Illustrative — the real amount is set on the Razorpay Plan; override via
    // NEXT_PUBLIC_RAZORPAY_PRO_PRICE for display.
    priceLabel: process.env.NEXT_PUBLIC_RAZORPAY_PRO_PRICE ?? "₹999 / mo",
    reqPerMin: 600,
    reqPerDay: 100_000,
    maxPage: 100,
    fullEvidence: true,
    selfServe: true,
    blurb: "Higher limits + full source evidence on every result.",
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    priceLabel: "Contact us",
    reqPerMin: 3_000,
    reqPerDay: 2_000_000,
    maxPage: 100,
    fullEvidence: true,
    selfServe: false, // sales-assisted, not self-checkout
    blurb: "Custom limits, SLAs and support.",
  },
};
