import Image from "next/image";
import { supabaseAdmin } from "@/lib/supabase";
import { SiteHeader } from "./_components/site-header";
import { Reveal } from "./_components/reveal";
import { Blobs } from "./_components/blobs";
import { Carousel } from "./_components/carousel";
import { PaginatedGrid } from "./_components/paginated-grid";
import type { Poi } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const db = supabaseAdmin();
  const [{ data: raw }, sources, signals] = await Promise.all([
    db
      .from("points_of_interest")
      .select("id,name,slug,poi_category,frequency_count,recommendation_score,specialities,verification_status,areas(name),destinations(slug)")
      .order("recommendation_score", { ascending: false }),
    db.from("sources").select("*", { count: "exact", head: true }).eq("status", "resolved"),
    db.from("entity_evidence").select("*", { count: "exact", head: true }),
  ]);

  const pois = (raw ?? []) as unknown as Poi[];
  const featured = pois.slice(0, 10);

  const areaCounts = new Map<string, number>();
  for (const p of pois) {
    const a = p.areas?.name;
    if (a) areaCounts.set(a, (areaCounts.get(a) ?? 0) + 1);
  }
  const areas = [...areaCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);

  return (
    <div className="bg-paper">
      {/* ---------------- Hero ---------------- */}
      <section className="relative min-h-[92vh] overflow-hidden bg-ink text-paper">
        {/* photographic backdrop */}
        <div className="absolute inset-0">
          <Image
            src="/hero/india-gate.jpg"
            alt="Delhi"
            fill
            priority
            sizes="100vw"
            className="kenburns object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/60 to-ink/90" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/85 via-ink/40 to-transparent" />
        <div className="grain absolute inset-0 opacity-40" />
        <div className="opacity-70"><Blobs /></div>
        <SiteHeader />

        <div className="relative z-10 mx-auto flex min-h-[92vh] max-w-6xl flex-col justify-center px-6 pt-24">
          <Reveal>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full liquid-glass on-dark px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.25em] text-paper">
              <span className="relative z-10 flex items-center gap-2">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-vermilion" />
                A living travel graph · Delhi + Gurgaon
              </span>
            </div>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="font-display text-6xl font-semibold leading-[0.92] tracking-tight md:text-8xl">
              The Delhi
              <br />
              <span className="bg-gradient-to-r from-vermilion via-[#f7a24a] to-vermilion bg-clip-text text-transparent">
                worth your time.
              </span>
            </h1>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="mt-8 max-w-xl text-lg text-paper/80">
              We aggregate the best of what the internet knows about every place — specialities,
              timing, crowds, the small tips — and distil it into one honest, ranked map of the city.
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <div className="mt-10 flex flex-wrap items-center gap-8">
              <Stat n={pois.length} label="places mapped" />
              <div className="h-10 w-px bg-paper/20" />
              <Stat n={sources.count ?? 0} label="sources aggregated" />
              <div className="h-10 w-px bg-paper/20" />
              <Stat n={signals.count ?? 0} label="signals distilled" />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------- Featured carousel ---------------- */}
      <section id="places" className="relative mx-auto max-w-6xl px-6 py-20">
        <Reveal>
          <div className="mb-8">
            <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.25em] text-vermilion">
              Top of the graph
            </div>
            <h2 className="font-display text-4xl font-semibold tracking-tight text-ink">
              Highest-signal places right now
            </h2>
          </div>
        </Reveal>
        <Reveal delay={0.05}>
          <Carousel items={featured} />
        </Reveal>
      </section>

      {/* ---------------- Paginated grid ---------------- */}
      <section className="relative border-t border-line bg-paper-soft/40">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <Reveal>
            <div className="mb-8 flex items-end justify-between">
              <div>
                <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.25em] text-teal">
                  The whole map
                </div>
                <h2 className="font-display text-4xl font-semibold tracking-tight text-ink">
                  Explore every place
                </h2>
              </div>
              <span className="font-mono text-sm text-ink-mute">{pois.length} places</span>
            </div>
          </Reveal>
          <PaginatedGrid items={pois} perPage={12} />
        </div>
      </section>

      {/* ---------------- Areas ---------------- */}
      <section id="areas" className="border-t border-line bg-paper">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <Reveal>
            <div className="mb-8 font-mono text-[11px] uppercase tracking-[0.25em] text-vermilion">
              By neighbourhood
            </div>
          </Reveal>
          <Reveal delay={0.05}>
            <div className="flex flex-wrap gap-3">
              {areas.map(([name, count]) => (
                <span
                  key={name}
                  className="lift inline-flex items-center gap-2 rounded-full border border-line bg-paper-card px-4 py-2 text-sm text-ink"
                >
                  {name}
                  <span className="font-mono text-xs text-ink-mute">{count}</span>
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------- Footer ---------------- */}
      <footer className="relative overflow-hidden bg-ink text-paper">
        <div className="grain absolute inset-0 opacity-50" />
        <div className="relative z-10 mx-auto max-w-6xl px-6 py-16">
          <div className="font-display text-5xl font-semibold tracking-tight">Rasta</div>
          <p className="mt-3 max-w-md text-paper/60">
            A travel intelligence graph for Delhi &amp; Gurgaon. Built by aggregating and ranking the
            best of what the internet already knows.
          </p>
          <div className="mt-8 font-mono text-[11px] uppercase tracking-[0.2em] text-paper/40">
            {pois.length} places · {sources.count ?? 0} sources · {signals.count ?? 0} signals
          </div>
        </div>
      </footer>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="font-display text-4xl font-semibold tabular-nums">{n}</div>
      <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-paper/50">{label}</div>
    </div>
  );
}
