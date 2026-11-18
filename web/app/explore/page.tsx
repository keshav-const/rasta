import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/app/_components/site-header";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { PageTexture } from "@/app/_components/PageTexture";
import { Reveal } from "@/app/_components/reveal";
import { EntityCard } from "@/app/_components/EntityCard";
import { listPlaces, type Place } from "@/lib/khoj";
import { THEMES, pretty } from "@/lib/display";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Explore India's culture — Khoj" };

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type = "cultural" } = await searchParams;
  const active = THEMES.find((t) => t.key === type) ?? THEMES[0];
  const places = ((await listPlaces({ type: active.key, sort: "trust", min_sources: 2, limit: 60 })) as
    | Place[]
    | null) ?? [];

  return (
    <div className="min-h-screen">
      <PageTexture />
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 pb-20 pt-28">
        <Reveal>
          <Link href="/" className="text-sm text-ink-soft transition hover:text-ink">
            ← Home
          </Link>
          <h1 className="mt-3 font-display text-4xl font-semibold text-ink sm:text-5xl">
            Explore India’s culture
          </h1>
          <p className="mt-2 text-ink-soft">
            Festivals, dance, crafts, cuisines and folk sports from across the country — corroborated by
            2+ independent sources.
          </p>
        </Reveal>

        <Reveal>
          <div className="mt-6 flex flex-wrap gap-1.5">
            {THEMES.map((t) => (
              <Link
                key={t.key}
                href={`/explore?type=${t.key}`}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  t.key === active.key
                    ? "border-vermilion bg-vermilion/10 text-vermilion"
                    : "border-line text-ink-soft hover:border-ink hover:text-ink"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </div>
        </Reveal>

        {places.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-dashed border-line px-4 py-10 text-center text-ink-mute">
            Nothing here yet — try another theme.
          </p>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {places.map((p) => (
              <EntityCard key={p.slug + p.city} p={p} />
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
