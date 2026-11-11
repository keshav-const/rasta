import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Khoj — cultural data API for India",
  description:
    "A provenance-first API over a verified cultural graph of India. Every result cites its independent sources, with a trust score and freshness.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* SVG displacement filter powering the liquid-glass refraction */}
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
          <filter id="liquid-glass-filter">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.006 0.012"
              numOctaves={2}
              seed={7}
              result="noise"
            />
            <feGaussianBlur in="noise" stdDeviation="1.2" result="blurred" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="blurred"
              scale="26"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </svg>
        {children}
      </body>
    </html>
  );
}
