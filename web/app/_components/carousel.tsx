"use client";

import { useRef } from "react";
import { PoiCard } from "./poi-card";
import type { Poi } from "@/lib/types";

export function Carousel({ items }: { items: Poi[] }) {
  const ref = useRef<HTMLDivElement>(null);

  const scroll = (dir: 1 | -1) => {
    ref.current?.scrollBy({ left: dir * 360, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div
        ref={ref}
        className="no-scrollbar flex snap-x snap-mandatory gap-6 overflow-x-auto pb-2"
      >
        {items.map((p) => (
          <div key={p.id} className="w-[300px] shrink-0 snap-start sm:w-[330px]">
            <PoiCard poi={p} />
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-2">
        <button
          onClick={() => scroll(-1)}
          aria-label="Previous"
          className="grid h-10 w-10 place-items-center rounded-full border border-line bg-paper-card text-ink transition hover:bg-ink hover:text-paper"
        >
          ←
        </button>
        <button
          onClick={() => scroll(1)}
          aria-label="Next"
          className="grid h-10 w-10 place-items-center rounded-full border border-line bg-paper-card text-ink transition hover:bg-ink hover:text-paper"
        >
          →
        </button>
      </div>
    </div>
  );
}
