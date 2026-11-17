"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";

// A clean, always-legible header. Two modes:
//  • onHero (over the dark photo hero, before scroll): a dark translucent bar + light text.
//  • solid  (every other page, or after scrolling the hero): opaque paper bar + ink text.
// (The previous glass/refraction header bled the hero headline through it and vanished on
//  light pages — this replaces it with a plain, readable bar.)

export function SiteHeader({ onHero = false }: { onHero?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const glass = onHero && !scrolled; // light text over the photo
  const tone = glass ? "text-paper" : "text-ink";
  const linkHover = glass ? "hover:bg-paper/15" : "hover:bg-ink/5";

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
      className="fixed inset-x-0 top-3 z-50 flex justify-center px-4"
    >
      <div
        className={`flex w-full max-w-3xl items-center justify-between rounded-full border py-1.5 pl-3 pr-2 transition-all duration-300 ${
          glass
            ? "border-paper/20 bg-ink/40 backdrop-blur-md shadow-[0_10px_40px_-18px_rgba(0,0,0,0.7)]"
            : "border-line bg-paper-card/90 backdrop-blur-md shadow-[0_10px_34px_-20px_rgba(23,20,15,0.4)]"
        }`}
      >
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
    </motion.header>
  );
}
