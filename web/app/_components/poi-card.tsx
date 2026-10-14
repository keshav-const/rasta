import Link from "next/link";
import { Photo } from "./photo";
import type { Poi } from "@/lib/types";

export function PoiCard({ poi }: { poi: Poi }) {
  const score = Math.round(poi.recommendation_score * 100);
  const desc = (poi.specialities ?? []).slice(0, 3).join(" · ");
  return (
    <Link
      href={`/poi/${poi.slug}`}
      className="lift group flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-paper-card transition-colors hover:border-vermilion/50"
    >
      <div className="relative overflow-hidden">
        <Photo
          category={poi.poi_category}
          className="transition-transform duration-[900ms] ease-out group-hover:scale-[1.07]"
        />
        <div className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-2xl glass-dark font-display text-lg font-semibold text-paper">
          {score}
        </div>
        {poi.verification_status === "community_verified" && (
          <div className="absolute left-3 top-3 rounded-full bg-paper/90 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-teal backdrop-blur">
            ✓ verified
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/25 to-transparent" />
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-xl font-semibold leading-snug text-ink transition-colors group-hover:text-vermilion">
          {poi.name}
        </h3>
        <div className="mt-1.5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-ink-mute">
          <span className="h-1.5 w-1.5 rounded-full bg-teal" />
          {(poi.poi_category ?? "place").replace(/_/g, " ")}
          {poi.areas?.name ? ` · ${poi.areas.name}` : ""}
        </div>
        <p className="mt-3 line-clamp-2 min-h-[2.75rem] text-sm text-ink-soft">
          {desc || "Aggregated travel intelligence for this place."}
        </p>
        <div className="mt-auto flex items-center justify-between pt-5">
          <span className="font-mono text-[11px] text-ink-mute">
            {poi.frequency_count} source{poi.frequency_count === 1 ? "" : "s"}
          </span>
          <span className="text-vermilion transition-transform duration-300 group-hover:translate-x-1">→</span>
        </div>
      </div>
    </Link>
  );
}
