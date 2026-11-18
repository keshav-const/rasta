import Link from "next/link";
import HeroBackdrop from "./_components/HeroBackdrop";
import { SiteHeader } from "./_components/site-header";
import { Reveal } from "./_components/reveal";
import { Blobs } from "./_components/blobs";
import { EntityCard } from "./_components/EntityCard";
import { getStats, listCities, listPlaces, type City, type Place } from "@/lib/khoj";
import { THEMES, pretty } from "@/lib/display";

export const dynamic = "force-dynamic";

const nf = new Intl.NumberFormat("en-IN");

export default async function Home() {
  // This site DOGFOODS the live API — everything below is fetched through it.
  const [stats, featuredRaw, citiesRaw] = await Promise.all([
    getStats(),
    listPlaces({ sort: "trust", min_sources: 2, limit: 9 }),
    listCities({ type: "city", limit: 24 }),
  ]);
  const featured = (featuredRaw ?? []) as Place[];
  const cities = ((citiesRaw ?? []) as City[]).filter((c) => c.places > 0);

  return (
    <div className="bg-paper">
      {/* ---------------- Hero ---------------- */}
      <section className="relative min-h-[88vh] overflow-hidden bg-ink text-paper">
        {/* rotating, brighter backdrop */}
        <HeroBackdrop />
        {/* Left-weighted scrim: keeps the text legible on the left while the photo stays
            bright on the right (the old full-screen dark overlay made everything murky). */}
        <div className="absolute inset-0 bg-gradient-to-r from-ink/85 via-ink/45 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/55 via-transparent to-transparent" />
        <div className="grain absolute inset-0 opacity-25" />
        <div className="opacity-50">
          <Blobs />
        </div>
        <SiteHeader onHero />

        <div className="relative z-10 mx-auto flex min-h-[88vh] max-w-6xl flex-col justify-center px-6 pb-16 pt-32">
          <Reveal>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-paper/12 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.25em] text-paper ring-1 ring-paper/25">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-vermilion" />
              A verified cultural graph · India
            </div>
          </Reveal>
          <Reveal>
            <h1 className="max-w-3xl font-display text-4xl font-semibold leading-[1.07] sm:text-5xl lg:text-[3.4rem]">
              India’s places & living culture — every claim with receipts.
            </h1>
          </Reveal>
          <Reveal>
            <p className="mt-5 max-w-2xl text-lg text-paper/80">
              {stats ? nf.format(stats.places) : "8,000+"} places and traditions — festivals, dance,
              crafts, cuisines and folk sports — each citing the independent sources behind it. No SEO
              slop, no fake reviews.
            </p>
          </Reveal>

          {/* search */}
          <Reveal>
            <form action="/search" method="get" className="mt-7 flex max-w-xl gap-2">
              <input
                name="q"
                placeholder="Search a place, dish, festival or craft…"
                className="flex-1 rounded-xl border border-paper/20 bg-paper/10 px-4 py-3 text-paper placeholder:text-paper/50 backdrop-blur focus:border-paper/60 focus:outline-none"
              />
              <button
                type="submit"
                className="shrink-0 rounded-xl bg-vermilion px-5 py-3 font-medium text-paper transition hover:opacity-90"
              >
                Search
              </button>
            </form>
          </Reveal>

          {/* stats */}
          {stats && (
            <Reveal>
              <div className="mt-10 grid max-w-2xl grid-cols-2 gap-6 border-t border-paper/15 pt-6 sm:grid-cols-4">
                {[
                  ["Places & traditions", stats.places],
                  ["Destinations", stats.cities],
                  ["Sources", stats.sources],
                  ["Sourced claims", stats.claims],
                ].map(([label, v]) => (
                  <div key={label as string}>
                    <div className="font-display text-2xl font-semibold sm:text-3xl">{nf.format(v as number)}</div>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-paper/60">{label as string}</div>
                  </div>
                ))}
              </div>
            </Reveal>
          )}
        </div>
      </section>

      {/* ---------------- Most corroborated ---------------- */}
      <section id="places" className="mx-auto max-w-6xl px-6 py-16">
        <Reveal>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-3xl font-semibold text-ink">Most corroborated</h2>
              <p className="mt-1 text-ink-soft">The best-sourced entities in the graph right now.</p>
            </div>
            <Link href="/explore" className="shrink-0 text-sm font-medium text-vermilion hover:underline">
              Explore culture →
            </Link>
          </div>
        </Reveal>
        {featured.length > 0 ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((p) => (
              <EntityCard key={p.slug + p.city} p={p} />
            ))}
          </div>
        ) : (
          <p className="mt-6 rounded-2xl border border-dashed border-line px-4 py-10 text-center text-ink-mute">
            The API is waking up — refresh in a moment.
          </p>
        )}
      </section>

      {/* ---------------- Explore by culture ---------------- */}
      <section id="explore" className="border-y border-line bg-paper-soft/40">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <Reveal>
            <h2 className="font-display text-3xl font-semibold text-ink">Explore by culture</h2>
            <p className="mt-1 text-ink-soft">Not places-only — India’s living traditions are first-class here.</p>
          </Reveal>
          <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {THEMES.map((t) => (
              <Link
                key={t.key}
                href={`/explore?type=${t.key}`}
                className="group rounded-2xl border border-line bg-paper-card p-4 text-center transition hover:border-vermilion hover:shadow-[0_18px_40px_-28px_rgba(23,20,15,.5)]"
              >
                <div className="font-display text-base font-semibold text-ink group-hover:text-vermilion">
                  {t.label}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Browse destinations ---------------- */}
      <section id="cities" className="mx-auto max-w-6xl px-6 py-16">
        <Reveal>
          <h2 className="font-display text-3xl font-semibold text-ink">Browse destinations</h2>
          <p className="mt-1 text-ink-soft">{cities.length}+ cities and regions across India.</p>
        </Reveal>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {cities.map((c) => (
            <Link
              key={c.slug}
              href={`/city/${c.slug}`}
              className="group flex items-center justify-between rounded-xl border border-line bg-paper-card px-4 py-3 transition hover:border-ink/30"
            >
              <span className="truncate font-medium text-ink group-hover:text-vermilion">{pretty(c.name)}</span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-ink-mute">{c.places}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------------- Developer CTA ---------------- */}
      <section className="border-t border-line bg-ink text-paper">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-6 py-14 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold">Everything here is an API call.</h2>
            <p className="mt-1 max-w-xl text-paper/70">
              This whole site is the live demo of the Khoj API — the same provenance-first data, for your
              own product. Keyless to try.
            </p>
          </div>
          <Link
            href="/developers"
            className="shrink-0 rounded-xl bg-vermilion px-5 py-3 font-medium text-paper transition hover:opacity-90"
          >
            Build with the API →
          </Link>
        </div>
      </section>
    </div>
  );
}
