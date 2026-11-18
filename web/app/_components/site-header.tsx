"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import GlassSurface from "./GlassSurface";

// The liquid-glass header, kept — with the visibility bugs fixed:
//  • an opaque-enough BACKING sits behind the glass so the pill is clearly visible on light
//    pages (paper) and so the hero headline can't bleed through its refraction;
//  • text colour + backing switch on `onHero` (light over the photo, ink everywhere else),
//    instead of guessing from scroll alone (which left it invisible on the light pages).
export function SiteHeader({ onHero = false }: { onHero?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const glass = onHero && !scrolled; // light text over the photo hero
  const tone = glass ? "text-paper" : "text-ink";
  const linkHover = glass ? "hover:bg-paper/15" : "hover:bg-ink/5";

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
      className="fixed inset-x-0 top-3 z-50 flex justify-center px-4"
    >
      {/* Backing behind the glass: dark-translucent over the hero, opaque paper elsewhere.
          This is what makes the glass legible without removing the refraction look. */}
      <div
        className={`relative w-full max-w-3xl rounded-full transition-all duration-500 ${
          glass
            ? "bg-ink/35 ring-1 ring-paper/25 shadow-[0_16px_44px_-18px_rgba(0,0,0,0.6)]"
            : "bg-paper-card/85 ring-1 ring-line shadow-[0_14px_40px_-20px_rgba(23,20,15,0.32)]"
        }`}
      >
        <GlassSurface
          width="100%"
          height={56}
          borderRadius={40}
          backgroundOpacity={0}
          saturation={1.7}
          brightness={glass ? 62 : 104}
          blur={10}
          displace={1}
          distortionScale={-96}
          greenOffset={10}
          blueOffset={18}
          className="!w-full"
        >
          <div className="flex w-full items-center justify-between pl-3 pr-2">
            <Link href="/" className={`flex items-center gap-2.5 ${tone}`}>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-vermilion font-display text-base font-semibold text-paper shadow-[0_6px_16px_-6px_rgba(234,78,27,0.9)]">
                K
              </span>
              <span className="font-display text-lg font-semibold tracking-tight">Khoj</span>
            </Link>

            <nav className={`flex items-center gap-0.5 text-sm font-medium ${tone}`}>
              <Link href="/explore" className={`hidden rounded-full px-3 py-1.5 transition sm:block ${linkHover}`}>
                Explore
              </Link>
              <Link href="/#cities" className={`hidden rounded-full px-3 py-1.5 transition sm:block ${linkHover}`}>
                Destinations
              </Link>
              <Link href="/search" className={`rounded-full px-3 py-1.5 transition ${linkHover}`}>
                Search
              </Link>
              <Link
                href="/developers"
                className="ml-1 rounded-full bg-vermilion px-3.5 py-1.5 text-[13px] font-semibold text-paper transition hover:opacity-90"
              >
                Developers
              </Link>
            </nav>
          </div>
        </GlassSurface>
      </div>
    </motion.header>
  );
}
