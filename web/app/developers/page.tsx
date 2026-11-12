import Link from "next/link";
import { readDevSession } from "@/lib/devauth";
import LiveExplorer from "./_components/LiveExplorer";

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
  "trust":     { "sources": 6, "platforms": 3, "score": 0.9 },
  "freshness": { "label": "unknown", "age_days": null }
}`;

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
            Thousands of places and traditions — each citing the independent sources behind it.
            Query by city, geography, or name; every result carries a trust score and, where it
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

        {/* Features + response shape */}
        <section className="mx-auto max-w-5xl px-6 pb-16">
          <div className="grid gap-4 sm:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-line bg-paper-card p-5">
                <h3 className="mb-2 font-display text-base font-semibold text-ink">{f.title}</h3>
                <p className="text-sm text-ink-soft">{f.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
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
