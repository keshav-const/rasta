import Link from "next/link";
import { readDevSession } from "@/lib/devauth";

export const dynamic = "force-dynamic";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://khoj-ibli.onrender.com";

const FEATURES = [
  {
    title: "Provenance, not vibes",
    body: "Every place cites its independent sources. A trust score (breadth × platform diversity) tells you how corroborated each fact is — no SEO slop, no fake reviews.",
  },
  {
    title: "Freshness as its own axis",
    body: "Enduring traditions never “expire”; volatile things (restaurants, hotels) carry a freshness label that decays over time. You always know how current a fact is.",
  },
  {
    title: "Geo + fuzzy search",
    body: "Filter by city or country, search near a point or within a bounding box, and match names fuzzily (trigram). Built for real map and discovery UIs.",
  },
];

export default async function DevelopersLanding() {
  const session = await readDevSession();

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
            <Link
              href="/developers/docs"
              className="rounded-xl px-3 py-2 text-ink-soft transition hover:text-ink"
            >
              Docs
            </Link>
            {session ? (
              <Link
                href="/developers/dashboard"
                className="rounded-xl bg-ink px-3.5 py-2 font-medium text-paper transition hover:opacity-90"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/developers/login"
                  className="rounded-xl px-3 py-2 text-ink-soft transition hover:text-ink"
                >
                  Sign in
                </Link>
                <Link
                  href="/developers/signup"
                  className="rounded-xl bg-ink px-3.5 py-2 font-medium text-paper transition hover:opacity-90"
                >
                  Get a key
                </Link>
              </>
            )}
          </nav>
        </header>

        {/* Hero */}
        <section className="mx-auto max-w-5xl px-6 pt-10 pb-14">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.25em] text-vermilion">
            Provenance-first cultural data · India
          </p>
          <h1 className="max-w-2xl font-display text-4xl font-semibold leading-tight text-ink sm:text-5xl">
            A verified cultural graph of India, as one clean REST API.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-ink-soft">
            Thousands of places and traditions — each one citing the independent sources behind
            it. Query by city, geography, or name; every result carries a trust score and, where
            it matters, a freshness label.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={session ? "/developers/dashboard" : "/developers/signup"}
              className="rounded-xl bg-vermilion px-5 py-2.5 text-sm font-medium text-paper transition hover:opacity-90"
            >
              {session ? "Go to dashboard" : "Get an API key"}
            </Link>
            <Link
              href="/developers/docs"
              className="rounded-xl border border-line px-5 py-2.5 text-sm font-medium text-ink transition hover:border-ink"
            >
              Read the docs
            </Link>
          </div>

          {/* Quickstart */}
          <div className="mt-10 max-w-2xl rounded-2xl border border-line bg-paper-card p-5">
            <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-ink-mute">
              Quickstart — works without a key
            </p>
            <code className="block overflow-x-auto rounded-lg border border-line bg-paper px-3 py-2 font-mono text-xs text-ink">
              curl {API_BASE}/v1/places?city=jaipur&amp;limit=3
            </code>
            <p className="mt-3 text-xs text-ink-soft">
              Keyless calls are rate-limited. Create a free key for higher limits and full
              evidence — then send it as <code className="font-mono">X-API-Key</code>.
            </p>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-5xl px-6 pb-20">
          <div className="grid gap-4 sm:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-line bg-paper-card p-5">
                <h3 className="mb-2 font-display text-base font-semibold text-ink">{f.title}</h3>
                <p className="text-sm text-ink-soft">{f.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-10 text-center text-sm text-ink-mute">
            Ready?{" "}
            <Link
              href="/developers/signup"
              className="font-medium text-ink underline underline-offset-4"
            >
              Create an account
            </Link>{" "}
            and issue your first key in seconds.
          </p>
        </section>
      </div>
    </div>
  );
}
