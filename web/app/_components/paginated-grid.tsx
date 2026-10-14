"use client";

import { useRef, useState } from "react";
import { PoiCard } from "./poi-card";
import type { Poi } from "@/lib/types";

export function PaginatedGrid({ items, perPage = 12 }: { items: Poi[]; perPage?: number }) {
  const [page, setPage] = useState(1);
  const topRef = useRef<HTMLDivElement>(null);
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const slice = items.slice((page - 1) * perPage, page * perPage);

  const go = (p: number) => {
    setPage(Math.min(Math.max(1, p), pages));
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div>
      <div ref={topRef} className="scroll-mt-28" />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {slice.map((p) => (
          <PoiCard key={p.id} poi={p} />
        ))}
      </div>

      {pages > 1 && (
        <div className="mt-12 flex items-center justify-center gap-2">
          <PagerBtn onClick={() => go(page - 1)} disabled={page === 1} label="←" />
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => go(p)}
              className={`h-10 w-10 rounded-full font-mono text-sm transition ${
                p === page
                  ? "bg-ink text-paper"
                  : "border border-line bg-paper-card text-ink-soft hover:border-ink hover:text-ink"
              }`}
            >
              {p}
            </button>
          ))}
          <PagerBtn onClick={() => go(page + 1)} disabled={page === pages} label="→" />
        </div>
      )}
    </div>
  );
}

function PagerBtn({ onClick, disabled, label }: { onClick: () => void; disabled: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="grid h-10 w-10 place-items-center rounded-full border border-line bg-paper-card text-ink transition hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-paper-card disabled:hover:text-ink"
    >
      {label}
    </button>
  );
}
