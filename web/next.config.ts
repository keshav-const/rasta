import type { NextConfig } from "next";

// distDir is env-driven so the public (:4321) and admin (:4322) dev servers
// can run at the same time from one codebase without clashing on .next.
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DISTDIR || ".next",
  // M5: the India-wide consumer site is now the front door at `/` (it dogfoods the live
  // API). The developer portal lives at `/developers`. (Earlier the root redirected to
  // the portal while the consumer site was still the old NCR build — no longer needed.)
};

export default nextConfig;
