import type { Metadata } from "next";
import { SiteHeader } from "@/app/_components/site-header";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { PageTexture } from "@/app/_components/PageTexture";
import { Reveal } from "@/app/_components/reveal";
import { EntityCard } from "@/app/_components/EntityCard";
import { searchPlaces, type Place } from "@/lib/khoj";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Search — Khoj" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const query = q.trim();
  const results = query ? ((await searchPlaces(query, 36)) as Place[] | null) ?? [] : [];

  return (
    <div className="min-h-screen">
      <PageTexture />
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 pb-20 pt-28">
        <Reveal>
          <h1 className="font-display text-4xl font-semibold text-ink">Search the graph</h1>
          <p className="mt-2 text-ink-soft">
            Typo-tolerant search across every place and tradition — try a dish, a festival, a craft or a city.
          </p>
          <form action="/search" method="get" className="mt-6 flex gap-2">
            <input
              name="q"
              defaultValue={query}
              autoFocus
              placeholder="e.g. kathak, biryani, hampi, pashmina…"
              className="flex-1 rounded-xl border border-line bg-paper-card px-4 py-3 text-ink placeholder:text-ink-mute focus:border-ink focus:outline-none"
            />
            <button
              type="submit"
              className="shrink-0 rounded-xl bg-ink px-5 py-3 font-medium text-paper transition hover:opacity-90"
            >
              Search
            </button>
          </form>
        </Reveal>

        {query && (
          <Reveal>
            <p className="mt-8 text-sm text-ink-soft">
              {results.length > 0 ? (
                <>
                  <span className="font-medium text-ink">{results.length}</span> result
                  {results.length === 1 ? "" : "s"} for “{query}”
                </>
              ) : (
                <>No matches for “{query}”. Try a shorter or different term.</>
              )}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((p) => (
                <EntityCard key={p.slug + p.city} p={p} />
              ))}
            </div>
          </Reveal>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
