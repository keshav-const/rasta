import Link from "next/link";
import type { Place } from "@/lib/khoj";
import { placeTypeLabel, pretty } from "@/lib/display";

// A single entity in a browse grid → links to its POI page. Server component (just a link).
export function EntityCard({ p, showCity = true }: { p: Place; showCity?: boolean }) {
  const pct = Math.round((p.trust?.score ?? 0) * 100);
  const fresh = p.freshness;
  return (
    <Link
      href={`/poi/${p.slug}`}
      className="group block rounded-2xl border border-line bg-paper-card p-4 transition hover:border-ink/30 hover:shadow-[0_18px_40px_-28px_rgba(23,20,15,.5)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-display text-base font-semibold text-ink group-hover:text-vermilion">
            {p.name}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded border border-line px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-soft">
              {placeTypeLabel(p)}
            </span>
            {showCity && <span className="truncate text-xs text-ink-mute">{pretty(p.city)}</span>}
            {p.lat != null && p.lng != null && (
              <span className="rounded-full border border-vermilion/30 bg-vermilion/5 px-1.5 py-0.5 text-[9px] font-medium text-vermilion">
                📍
              </span>
            )}
          </div>
        </div>
        {fresh && fresh.label !== "unknown" && (
          <span className="shrink-0 rounded-full border border-line bg-paper px-2 py-0.5 text-[10px] font-medium capitalize text-ink-soft">
            {fresh.label}
          </span>
        )}
      </div>
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[11px] text-ink-soft">
          <span>Trust</span>
          <span className="font-mono text-ink">{(p.trust?.score ?? 0).toFixed(2)}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-vermilion" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1.5 text-[11px] text-ink-mute">
          {p.trust?.sources ?? p.sources} source{(p.trust?.sources ?? p.sources) === 1 ? "" : "s"} ·{" "}
          {p.trust?.platforms ?? 1} platform{(p.trust?.platforms ?? 1) === 1 ? "" : "s"}
          {p.distance_km != null && <> · {p.distance_km.toFixed(1)} km</>}
        </div>
      </div>
    </Link>
  );
}
