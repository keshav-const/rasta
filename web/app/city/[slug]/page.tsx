import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SiteHeader } from "@/app/_components/site-header";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { PageTexture } from "@/app/_components/PageTexture";
import { Reveal } from "@/app/_components/reveal";
import { EntityCard } from "@/app/_components/EntityCard";
import { listPlaces, type Place } from "@/lib/khoj";
import { pretty, THEMES } from "@/lib/display";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "", label: "All" },
  { key: "poi", label: "Places" },
  ...THEMES,
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `${pretty(slug)} — Khoj`, description: `Verified places & culture in ${pretty(slug)}.` };
}

export default async function CityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { slug } = await params;
  const { type = "" } = await searchParams;

  const places = (await listPlaces({ city: slug, type: type || undefined, sort: "trust", limit: 60 })) as
    | Place[]
    | null;

  // A city with zero entities at all (any type) → 404. An empty *filter* just shows a note.
  if (places === null || (places.length === 0 && !type)) notFound();

  return (
    <div className="min-h-screen">
      <PageTexture />
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 pb-20 pt-28">
        <Reveal>
          <Link href="/#cities" className="text-sm text-ink-soft transition hover:text-ink">
            ← All destinations
          </Link>
          <h1 className="mt-3 font-display text-4xl font-semibold text-ink sm:text-5xl">{pretty(slug)}</h1>
          <p className="mt-2 text-ink-soft">
            Verified places and living culture — each result cites its independent sources.
          </p>
        </Reveal>

        {/* filters */}
        <Reveal>
          <div className="mt-6 flex flex-wrap gap-1.5">
            {FILTERS.map((f) => {
              const active = f.key === type;
              const href = f.key ? `/city/${slug}?type=${f.key}` : `/city/${slug}`;
              return (
                <Link
                  key={f.key || "all"}
                  href={href}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "border-vermilion bg-vermilion/10 text-vermilion"
                      : "border-line text-ink-soft hover:border-ink hover:text-ink"
                  }`}
                >
                  {f.label}
                </Link>
              );
            })}
          </div>
        </Reveal>

        {/* grid */}
        {places.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-dashed border-line px-4 py-10 text-center text-ink-mute">
            Nothing of this kind in {pretty(slug)} yet — try another filter.
          </p>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {places.map((p) => (
              <EntityCard key={p.slug} p={p} showCity={false} />
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
