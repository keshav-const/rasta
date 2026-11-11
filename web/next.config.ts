import type { NextConfig } from "next";

// distDir is env-driven so the public (:4321) and admin (:4322) dev servers
// can run at the same time from one codebase without clashing on .next.
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DISTDIR || ".next",
  // The public face is the developer portal. `/` sends visitors there; the consumer
  // site (/, /poi/*) still exists underneath, just isn't the front door. Temporary
  // (307) so it isn't hard-cached — easy to revert by removing this block.
  async redirects() {
    return [{ source: "/", destination: "/developers", permanent: false }];
  },
};

export default nextConfig;
