import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { SiteHeader } from "@/app/_components/site-header";
import { Reveal } from "@/app/_components/reveal";
import { Photo } from "@/app/_components/photo";

export const dynamic = "force-dynamic";

type Claim = { field: string; value: string; evidence?: string; timestamp_seconds?: number; confidence?: number };

export default async function PoiPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = supabaseAdmin();

  const { data: rows } = await db
    .from("points_of_interest")
    .select("*, areas(name), destinations(name, slug)")
    .eq("slug", slug)
    .order("recommendation_score", { ascending: false })
    .limit(1);
  const poi = rows?.[0] as any;
  if (!poi) notFound();

  const { data: evidence } = await db
    .from("entity_evidence")
    .select("stance, claims, sources(video_id, title, creator_name, view_count)")
    .eq("entity_id", poi.id);

  const score = Math.round((poi.recommendation_score ?? 0) * 100);
  const ev = (evidence ?? []) as any[];

  // "The details": distinct English facts NOT already shown in the verdict.
  // (Raw evidence quotes are in the source language — Hindi here — so we surface
  // the normalized English value instead of dumping transcript text.)
  const COVERED = new Set([
    "speciality", "must_try_item", "tip", "warning", "best_time", "price_level",
    "crowd_level", "average_cost",
  ]);
  const DEVANAGARI = /[ऀ-ॿ]/;
  const factSeen = new Set<string>();
  const details = ev
    .flatMap((e) => (Array.isArray(e.claims) ? (e.claims as Claim[]) : []).map((c) => ({ ...c, src: e.sources })))
    .filter(
      (c) =>
        c.value &&
        !COVERED.has((c.field ?? "").toLowerCase()) &&
        !DEVANAGARI.test(c.value)
    )
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .filter((c) => {
      const k = `${c.field}|${c.value}`.toLowerCase();
      if (factSeen.has(k)) return false;
      factSeen.add(k);
      return true;
    })
    .slice(0, 8);

  // Provenance: unique sources.
  const srcMap = new Map<string, any>();
  for (const e of ev) if (e.sources?.video_id) srcMap.set(e.sources.video_id, { ...e.sources, stance: e.stance });
  const sources = [...srcMap.values()];

  const practical = [
    ["Best time", poi.best_time],
    ["Price", poi.price_level],
    ["Crowd", poi.crowd_info],
    ["Avg cost", poi.average_cost_inr ? `₹${poi.average_cost_inr}` : null],
  ].filter(([, v]) => v);

  return (
    <div className="bg-paper">
      {/* Hero */}
      <section className="relative overflow-hidden bg-ink text-paper">
        <Photo category={poi.poi_category} ratio="absolute inset-0 h-full w-full" className="opacity-45" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/75 to-ink/40" />
        <SiteHeader />
        <div className="relative z-10 mx-auto max-w-5xl px-6 pb-14 pt-40">
          <Reveal>
            <Link href="/#places" className="font-mono text-[11px] uppercase tracking-[0.2em] text-paper/60 hover:text-paper">
              ← Back to the graph
            </Link>
          </Reveal>
          <Reveal delay={0.05}>
            <div className="mt-6 flex items-end justify-between gap-6">
              <div>
                <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-vermilion">
                  {(poi.poi_category ?? "place").replace(/_/g, " ")}
                  {poi.areas?.name ? ` · ${poi.areas.name}` : ""}
                  {poi.destinations?.name ? ` · ${poi.destinations.name}` : ""}
                </div>
                <h1 className="font-display text-6xl font-semibold leading-none tracking-tight md:text-7xl">
                  {poi.name}
                </h1>
                {poi.name_local && <div className="mt-2 text-xl text-paper/60">{poi.name_local}</div>}
              </div>
              <div className="shrink-0 rounded-2xl glass-dark px-6 py-4 text-center">
                <div className="font-display text-5xl font-semibold text-paper">{score}</div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-paper/50">graph score</div>
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.12}>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-vermilion px-4 py-1.5 text-sm font-medium text-paper">
              Backed by {poi.frequency_count} source{poi.frequency_count === 1 ? "" : "s"}
            </div>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6 py-16">
        {/* The verdict */}
        <Reveal><SectionLabel>The verdict</SectionLabel></Reveal>
        <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
          <div className="space-y-8 md:col-span-2">
            {poi.specialities?.length > 0 && (
              <Reveal>
                <Block title="Must try">
                  <div className="flex flex-wrap gap-2">
                    {poi.specialities.map((s: string, i: number) => (
                      <span key={i} className="rounded-full bg-vermilion-soft px-3 py-1.5 text-sm text-vermilion">{s}</span>
                    ))}
                  </div>
                </Block>
              </Reveal>
            )}
            {poi.tips?.length > 0 && (
              <Reveal>
                <Block title="Good to know">
                  <ul className="space-y-2">
                    {poi.tips.map((t: string, i: number) => (
                      <li key={i} className="flex gap-3 text-ink-soft"><span className="text-vermilion">→</span> {t}</li>
                    ))}
                  </ul>
                </Block>
              </Reveal>
            )}
            {poi.warnings?.length > 0 && (
              <Reveal>
                <Block title="Heads up">
                  <ul className="space-y-2">
                    {poi.warnings.map((w: string, i: number) => (
                      <li key={i} className="flex gap-3 text-ink-soft"><span className="text-vermilion">⚠</span> {w}</li>
                    ))}
                  </ul>
                </Block>
              </Reveal>
            )}
          </div>

          {practical.length > 0 && (
            <Reveal delay={0.1}>
              <div className="rounded-2xl border border-line bg-paper-card p-6">
                <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-mute">Practical</div>
                <dl className="space-y-4">
                  {practical.map(([k, v]) => (
                    <div key={k as string}>
                      <dt className="font-mono text-[11px] uppercase tracking-wide text-ink-mute">{k}</dt>
                      <dd className="mt-0.5 capitalize text-ink">{v as string}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Reveal>
          )}
        </div>

        {/* The details — distinct English facts */}
        {details.length > 0 && (
          <div className="mt-16">
            <Reveal><SectionLabel>The details</SectionLabel></Reveal>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {details.map((d, i) => (
                <Reveal key={i} delay={i * 0.04}>
                  <div className="flex h-full items-start gap-4 rounded-2xl border border-line bg-paper-card p-5">
                    <div className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-teal">
                      {d.field?.replace(/_/g, " ")}
                    </div>
                    <div className="text-ink">{d.value}</div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        )}

        {/* Sources — clean provenance, no transcript dump */}
        <div className="mt-16">
          <Reveal><SectionLabel>Sources · {sources.length}</SectionLabel></Reveal>
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper-card">
            {sources.map((s, i) => (
              <a
                key={i}
                href={`https://youtu.be/${s.video_id}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-4 px-6 py-4 transition hover:bg-paper-soft/60"
              >
                <div className="min-w-0">
                  <div className="font-medium text-ink">{s.creator_name ?? "Creator"}</div>
                  <div className="truncate text-sm text-ink-mute">{s.title}</div>
                </div>
                <div className="shrink-0 text-right font-mono text-[11px] text-ink-mute">
                  <div className="uppercase tracking-wide text-teal">{s.stance?.replace(/_/g, " ")}</div>
                  {s.view_count ? `${Intl.NumberFormat("en-IN").format(s.view_count)} views` : ""}
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-6 font-mono text-[11px] uppercase tracking-[0.25em] text-vermilion">{children}</h2>;
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 font-display text-2xl font-semibold text-ink">{title}</h3>
      {children}
    </div>
  );
}
