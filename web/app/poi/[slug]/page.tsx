import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SiteHeader } from "@/app/_components/site-header";
import { Reveal } from "@/app/_components/reveal";
import PoiMap from "@/app/_components/PoiMap";
import { getPlace, type Evidence } from "@/lib/khoj";

export const dynamic = "force-dynamic";

const pretty = (s: string | null | undefined) =>
  (s ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const TYPE_LABELS: Record<string, string> = {
  festival: "Festival",
  cuisine: "Cuisine",
  dish: "Dish",
  sport: "Sport",
  craft: "Craft",
  performing_art: "Performing art",
  art_form: "Art form",
  cultural: "Culture",
  activity: "Activity",
};
function typeLabel(entity_type: string, category: string | null) {
  if (entity_type === "poi") return pretty(category) || "Place";
  return TYPE_LABELS[entity_type] ?? pretty(entity_type);
}

const PLATFORM: Record<string, { label: string; glyph: string }> = {
  youtube: { label: "YouTube", glyph: "▶" },
  wikipedia: { label: "Wikipedia", glyph: "W" },
  blog: { label: "Blog", glyph: "✎" },
  podcast: { label: "Podcast", glyph: "🎙" },
};
const platformMeta = (p: string) => PLATFORM[p] ?? { label: pretty(p), glyph: "•" };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = await getPlace(slug);
  if (!p) return { title: "Not found — Khoj" };
  return {
    title: `${p.name} — ${pretty(p.city)} · Khoj`,
    description: `${p.name}: corroborated by ${p.trust.sources} sources across ${p.trust.platforms} platforms.`,
  };
}

function StanceTag({ stance }: { stance: string }) {
  const tone =
    stance === "recommended"
      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
      : stance === "warned_against"
        ? "text-red-700 bg-red-50 border-red-200"
        : "text-ink-mute bg-paper border-line";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${tone}`}>
      {stance.replace(/_/g, " ")}
    </span>
  );
}

function SourceRow({ e }: { e: Evidence }) {
  const m = platformMeta(e.source.platform);
  const inner = (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-paper-card p-4 transition hover:border-ink/30">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink/5 font-mono text-sm text-ink">
        {m.glyph}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex flex-wrap items-center gap-2">
          <span className="rounded border border-line px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-soft">
            {m.label}
          </span>
          <StanceTag stance={e.stance} />
          {e.source.upload_date && (
            <span className="text-[11px] text-ink-mute">{e.source.upload_date}</span>
          )}
        </div>
        <div className="truncate font-medium text-ink">{e.source.title ?? "Untitled source"}</div>
        {e.source.creator && <div className="truncate text-xs text-ink-mute">{e.source.creator}</div>}
      </div>
      {e.source.url && <span className="shrink-0 self-center text-ink-mute">↗</span>}
    </div>
  );
  return e.source.url ? (
    <a href={e.source.url} target="_blank" rel="noreferrer" className="block">
      {inner}
    </a>
  ) : (
    inner
  );
}

export default async function PoiPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getPlace(slug);
  if (!p) notFound();

  const trustPct = Math.round((p.trust?.score ?? 0) * 100);
  const fresh = p.freshness;
  const enduring = !fresh; // cultural/enduring types carry no freshness

  // distinct English facts from the claims (skip Devanagari transcript text + dupes)
  const DEVANAGARI = /[ऀ-ॿ]/;
  const seen = new Set<string>();
  const facts = p.evidence
    .flatMap((e) => e.claims ?? [])
    .filter((c) => c.value && !DEVANAGARI.test(c.value))
    .filter((c) => {
      const k = `${c.field}|${c.value}`.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 8);

  // platform mix for the trust story
  const platforms = [...new Set(p.evidence.map((e) => e.source.platform))];

  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-6 pb-20 pt-28">
        <Reveal>
          <Link href={`/city/${p.city}`} className="text-sm text-ink-soft transition hover:text-ink">
            ← {pretty(p.city)}
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded border border-line px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-ink-soft">
              {typeLabel(p.entity_type, p.category)}
            </span>
            {!enduring && fresh && fresh.label !== "unknown" && (
              <span className="rounded-full border border-line bg-paper px-2 py-0.5 text-[11px] font-medium capitalize text-ink-soft">
                {fresh.label}
              </span>
            )}
          </div>
          <h1 className="mt-2 font-display text-4xl font-semibold text-ink sm:text-5xl">{p.name}</h1>
        </Reveal>

        {/* trust strip */}
        <Reveal>
          <div className="mt-6 grid gap-4 rounded-2xl border border-line bg-paper-card p-5 sm:grid-cols-[1fr_auto]">
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-ink-soft">
                <span>Trust — how well-corroborated this is</span>
                <span className="font-mono text-ink">{(p.trust?.score ?? 0).toFixed(2)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-vermilion" style={{ width: `${trustPct}%` }} />
              </div>
              <p className="mt-2 text-sm text-ink-soft">
                Backed by <span className="font-medium text-ink">{p.trust.sources} independent sources</span> across{" "}
                <span className="font-medium text-ink">{p.trust.platforms} platforms</span>
                {platforms.length > 0 && <> — {platforms.map(pretty).join(", ")}</>}.
                {enduring ? (
                  <> An enduring tradition, so it carries no freshness label.</>
                ) : fresh ? (
                  <> Freshness: <span className="font-medium text-ink">{fresh.label}</span>.</>
                ) : null}
              </p>
            </div>
          </div>
        </Reveal>

        {/* map */}
        {p.lat != null && p.lng != null && (
          <Reveal>
            <div className="mt-6">
              <PoiMap lat={p.lat} lng={p.lng} name={p.name} />
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink-mute">
                <span className="font-mono">📍 {p.lat.toFixed(5)}, {p.lng.toFixed(5)}</span>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=15/${p.lat}/${p.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2 hover:text-ink"
                >
                  Open in OpenStreetMap ↗
                </a>
              </div>
            </div>
          </Reveal>
        )}

        {/* facts */}
        {facts.length > 0 && (
          <Reveal>
            <section className="mt-10">
              <h2 className="mb-3 font-display text-xl font-semibold text-ink">What people say</h2>
              <div className="flex flex-wrap gap-2">
                {facts.map((f, i) => (
                  <span key={i} className="rounded-lg border border-line bg-paper-card px-3 py-1.5 text-sm text-ink-soft">
                    {f.field && <span className="text-ink-mute">{pretty(f.field)}: </span>}
                    <span className="text-ink">{f.value}</span>
                  </span>
                ))}
              </div>
            </section>
          </Reveal>
        )}

        {/* receipts — every source behind this entity, all platforms */}
        <Reveal>
          <section className="mt-10">
            <h2 className="mb-1 font-display text-xl font-semibold text-ink">The receipts</h2>
            <p className="mb-4 text-sm text-ink-soft">
              Every source this entity is built from — the provenance behind the trust score.
            </p>
            <div className="grid gap-3">
              {p.evidence.map((e, i) => (
                <SourceRow key={i} e={e} />
              ))}
            </div>
          </section>
        </Reveal>

        <div className="mt-12 rounded-2xl border border-line bg-paper-card p-5 text-sm text-ink-soft">
          Every fact on this page came from the public{" "}
          <Link href="/developers" className="font-medium text-vermilion underline underline-offset-2">
            Khoj API
          </Link>{" "}
          — this site is its live demo. Build your own with the same data.
        </div>
      </main>
    </div>
  );
}
