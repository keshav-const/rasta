"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import GlassSurface from "./GlassSurface";

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const light = !scrolled; // over dark hero -> light text + visible dark-bg backing
  const tone = light ? "text-paper" : "text-ink";
  const hover = light ? "hover:bg-paper/10 hover:text-paper" : "hover:bg-ink/5 hover:text-ink";

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
      className="fixed inset-x-0 top-4 z-50 flex justify-center px-4"
    >
      {/* Adaptive backing sits BEHIND the transparent glass so the pill stays
          visible on flat dark backgrounds (where refraction has nothing to bend). */}
      <div
        className={`relative w-full max-w-3xl rounded-full transition-all duration-500 ${
          light
            ? "bg-paper/12 ring-1 ring-paper/25 shadow-[0_16px_44px_-18px_rgba(0,0,0,0.65)]"
            : "ring-1 ring-ink/10 shadow-[0_16px_44px_-24px_rgba(23,20,15,0.35)]"
        }`}
      >
        <GlassSurface
          width="100%"
          height={58}
          borderRadius={40}
          backgroundOpacity={0}
          saturation={1.8}
          brightness={62}
          blur={11}
          displace={1}
          distortionScale={-140}
          greenOffset={12}
          blueOffset={22}
          className="!w-full"
        >
          <div className="flex w-full items-center justify-between pl-3 pr-2.5">
            <Link href="/" className={`flex items-center gap-2.5 ${tone}`}>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-vermilion font-display text-base font-semibold text-paper shadow-[0_6px_16px_-6px_rgba(234,78,27,0.9)]">
                R
              </span>
              <span className="font-display text-lg font-semibold tracking-tight">Rasta</span>
            </Link>

            <nav className={`flex items-center gap-1 text-sm ${tone}`}>
              <a href="/#places" className={`hidden rounded-full px-3.5 py-1.5 transition sm:block ${hover}`}>
                Places
              </a>
              <a href="/#areas" className={`hidden rounded-full px-3.5 py-1.5 transition sm:block ${hover}`}>
                Neighbourhoods
              </a>
              <span
                className={`ml-1 rounded-full px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] ${
                  light ? "bg-paper/15 text-paper" : "bg-ink/10 text-ink"
                }`}
              >
                Delhi · NCR
              </span>
            </nav>
          </div>
        </GlassSurface>
      </div>
    </motion.header>
  );
}
