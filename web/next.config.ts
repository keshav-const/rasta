import type { NextConfig } from "next";

// distDir is env-driven so the public (:4321) and admin (:4322) dev servers
// can run at the same time from one codebase without clashing on .next.
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DISTDIR || ".next",
};

export default nextConfig;
