import Link from "next/link";
import { readDevSession } from "@/lib/devauth";
import LiveExplorer from "./_components/LiveExplorer";
import UseCases from "./_components/UseCases";

export const dynamic = "force-dynamic";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://khoj-ibli.onrender.com";

type Stats = { places: number; cities: number; sources: number; claims: number };

async function getStats(): Promise<Stats | null> {
  try {
    // revalidate often so the landing reflects fresh ingestion within ~a minute (the API
    // itself caches /v1/stats ~60s, so this stays cheap).
    const r = await fetch(`${API_BASE}/v1/stats`, { next: { revalidate: 60 } });
    if (!r.ok) return null;
    const j = await r.json();
    return j.data as Stats;
  } catch {
    return null;
  }
}

const nf = new Intl.NumberFormat("en-IN");

const FEATURES = [
  {
    title: "Provenance, not vibes",
    body: "Every place cites its independent sources. A trust score (breadth × platform diversity) tells you how corroborated each fact is — no SEO slop, no fake reviews.",
  },
  {
    title: "Freshness as its own axis",
    body: "Enduring traditions never “expire”; volatile things like restaurants carry a freshness label that decays over time. You always know how current a fact is.",
  },
  {
    title: "Geo + fuzzy search",
    body: "Filter by city or country, search near a point or within a bounding box, and match names fuzzily. Built for real map and discovery UIs.",
  },
];

const SAMPLE = `{
  "name": "Dal Lake",
  "city": "srinagar",
  "category": "lake",
  "lat": 34.1255, "lng": 74.8422,
  "trust":     { "sources": 6, "platforms": 3, "score": 0.9 },
  "freshness": { "label": "fresh", "age_days": 120 }
}`;

// The full capability surface, so a developer sees everything the live API offers today.
const CAPABILITIES = [
  {
    tag: "Provenance",
    title: "Trust as a filterable signal",
    body: "Every entity carries its source + platform counts and a trust score. Filter with min_sources / min_platforms so a single viral video never passes as verified.",
  },
  {
    tag: "Freshness",
    title: "Know how current a fact is",
    body: "An orthogonal, type-gated axis: null for enduring traditions, decaying for volatile places. Use fresh_only and max_source_age_days.",
  },
  {
    tag: "Cultural graph",
    title: "Not places-only",
    body: "8,100+ entities across 870 destinations — festivals, dance, folk theatre, crafts, cuisines, dishes and traditional sports are first-class types, not tags.",
  },
  {
    tag: "Geo + maps",
    title: "Radius & viewport queries",
    body: "Physical places are ~93% geocoded. Query near=lat,lng + radius_km (nearest-first, with distance_km) or bbox for a map viewport.",
    isNew: true,
  },
  {
    tag: "Search",
    title: "Typo-tolerant fuzzy match",
    body: "q= runs a trigram + substring search (pg_trgm) that is ranked and forgiving of spelling — built for real search boxes.",
  },
  {
    tag: "Receipts",
    title: "Full evidence per entity",
    body: "/v1/places/{slug} returns every source behind a place — platform, title, url, creator, date, stance and raw claims. The moat, and perfect for grounding an LLM.",
  },
  {
    tag: "Taxonomy",
    title: "Cities, types & headline stats",
    body: "/v1/cities (counts per destination), /v1/entities (the type taxonomy or a type's rows) and /v1/stats (live totals) for discovery UIs.",
  },
  {
    tag: "Scale",
    title: "Keyset pagination",
    body: "The default sort returns meta.next_cursor — stable, fast paging at any depth, no offset drift as the graph grows.",
  },
  {
    tag: "Access",
    title: "Keys, plans & rate limits",
    body: "Keyless to try; a key raises limits and unlocks Pro. Plan-aware rate limiting returns RateLimit-* + Retry-After headers. Free / Pro / Enterprise.",
  },
  {
    tag: "Performance",
    title: "ETag caching & 304s",
    body: "Hot GETs are cached and served with a strong ETag; conditional requests get 304 Not Modified and an X-Cache: HIT.",
  },
  {
    tag: "Docs",
    title: "OpenAPI + interactive reference",
    body: "The spec is generated from the handlers and rendered as a live, try-it reference — easy for humans and for AI agents to consume.",
  },
  {
    tag: "Shape",
    title: "One envelope, one error model",
    body: "Every response is { data, meta } or { error: { code, message } }. Predictable to parse, everywhere.",
  },
];

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-display text-2xl font-semibold text-ink sm:text-3xl">{value}</div>
      <div className="text-[11px] uppercase tracking-[0.16em] text-ink-mute">{label}</div>
    </div>
  );
}

export default async function DevelopersLanding() {
  const [session, stats] = await Promise.all([readDevSession(), getStats()]);

  return (
    <div className="min-h-screen bg-paper">
      <div className="grain pointer-events-none absolute inset-0" />
      <div className="relative z-10">
        {/* Nav */}
        <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Link href="/developers" className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-vermilion font-display text-lg font-semibold text-paper">
              K
            </span>
            <span className="leading-tight">
              <span className="block font-display text-base font-semibold text-ink">Khoj</span>
              <span className="block text-[11px] uppercase tracking-[0.2em] text-ink-mute">
                Developers
              </span>
            </span>
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/developers/docs" className="rounded-xl px-3 py-2 text-ink-soft transition hover:text-ink">
              Docs
            </Link>
            {session ? (
              <Link href="/developers/dashboard" className="rounded-xl bg-ink px-3.5 py-2 font-medium text-paper transition hover:opacity-90">
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/developers/login" className="rounded-xl px-3 py-2 text-ink-soft transition hover:text-ink">
                  Sign in
                </Link>
                <Link href="/developers/signup" className="rounded-xl bg-ink px-3.5 py-2 font-medium text-paper transition hover:opacity-90">
                  Get a key
                </Link>
              </>
            )}
          </nav>
        </header>

        {/* Hero */}
        <section className="mx-auto max-w-5xl px-6 pt-8 pb-10">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.25em] text-vermilion">
            Provenance-first cultural data · India
          </p>
          <h1 className="max-w-3xl font-display text-4xl font-semibold leading-tight text-ink sm:text-5xl">
            A verified cultural graph of India, as one clean REST API.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-ink-soft">
            8,100+ places <span className="text-ink">and</span> living traditions — festivals,
            dance, crafts, cuisines and folk sports — each citing the independent sources behind it.
            Query by city, map radius, or name; every result carries a trust score and, where it
            matters, a freshness label.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={session ? "/developers/dashboard" : "/developers/signup"}
              className="rounded-xl bg-vermilion px-5 py-2.5 text-sm font-medium text-paper transition hover:opacity-90"
            >
              {session ? "Go to dashboard" : "Get an API key"}
            </Link>
            <Link href="/developers/docs" className="rounded-xl border border-line px-5 py-2.5 text-sm font-medium text-ink transition hover:border-ink">
              Read the docs
            </Link>
          </div>

          {/* Live stats */}
          {stats && (
            <div className="mt-10 grid max-w-2xl grid-cols-2 gap-6 border-t border-line pt-6 sm:grid-cols-4">
              <Stat value={nf.format(stats.places)} label="Places" />
              <Stat value={nf.format(stats.cities)} label="Cities" />
              <Stat value={nf.format(stats.sources)} label="Sources" />
              <Stat value={nf.format(stats.claims)} label="Claims" />
            </div>
          )}
        </section>

        {/* Interactive explorer */}
        <section className="mx-auto max-w-5xl px-6 pb-14">
          <LiveExplorer />
        </section>

        {/* Real-world use cases (self-playing) */}
        <section className="mx-auto max-w-5xl px-6 pb-14">
          <UseCases />
        </section>

        {/* Features + response shape */}
        <section className="mx-auto max-w-5xl px-6 pb-16">
          <h2 className="mb-1 font-display text-2xl font-semibold text-ink">Why Khoj</h2>
          <p className="mb-5 text-sm text-ink-soft">
            Two signals no stock travel API offers — plus the search, geo and access features you
            expect from a production API.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-line bg-paper-card p-5">
                <h3 className="mb-2 font-display text-base font-semibold text-ink">{f.title}</h3>
                <p className="text-sm text-ink-soft">{f.body}</p>
              </div>
            ))}
          </div>

          {/* Full capability surface */}
          <h3 className="mb-1 mt-12 font-display text-xl font-semibold text-ink">
            Everything in the API
          </h3>
          <p className="mb-5 text-sm text-ink-soft">
            The complete surface available today — keyless to try, no waitlist.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((c) => (
              <div key={c.title} className="rounded-xl border border-line bg-paper-card p-4">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="rounded border border-line px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-soft">
                    {c.tag}
                  </span>
                  {c.isNew && (
                    <span className="rounded-full bg-vermilion px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-paper">
                      New
                    </span>
                  )}
                </div>
                <h4 className="mb-1 font-display text-sm font-semibold text-ink">{c.title}</h4>
                <p className="text-[13px] leading-relaxed text-ink-soft">{c.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-line bg-paper-card p-5">
              <h3 className="mb-2 font-display text-base font-semibold text-ink">Every result is receipted</h3>
              <p className="mb-3 text-sm text-ink-soft">
                <span className="font-medium text-ink">trust</span> = how many independent sources
                and platforms corroborate a place. <span className="font-medium text-ink">freshness</span>{" "}
                = how current it is (null for enduring traditions).
              </p>
              <pre className="overflow-x-auto rounded-lg border border-line bg-paper p-3 font-mono text-[11px] leading-relaxed text-ink-soft">
                {SAMPLE}
              </pre>
            </div>
            <div className="rounded-2xl border border-line bg-paper-card p-5">
              <h3 className="mb-2 font-display text-base font-semibold text-ink">Start in one request</h3>
              <ol className="mb-3 list-decimal space-y-1 pl-4 text-sm text-ink-soft">
                <li>Call it keyless to try (tight rate limit).</li>
                <li>Create a free key for higher limits + full evidence.</li>
                <li>Send it as <code className="font-mono text-xs">X-API-Key</code>.</li>
              </ol>
              <code className="block overflow-x-auto rounded-lg border border-line bg-paper px-3 py-2 font-mono text-[11px] text-ink">
                curl -H &quot;X-API-Key: khoj_…&quot; {API_BASE}/v1/places?city=jaipur
              </code>
              <div className="mt-4 flex gap-2">
                <Link href="/developers/signup" className="rounded-lg bg-ink px-3.5 py-2 text-xs font-medium text-paper transition hover:opacity-90">
                  Get a key
                </Link>
                <Link href="/developers/docs" className="rounded-lg border border-line px-3.5 py-2 text-xs font-medium text-ink transition hover:border-ink">
                  Full reference
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
