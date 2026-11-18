import Link from "next/link";

// Shared footer — gives every page a grounded end (the pages used to just stop) and
// routes people to the API. Also carries the image attribution for the Commons hero photos.
export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-paper-card/60">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-vermilion font-display text-base font-semibold text-paper">
                K
              </span>
              <span className="font-display text-lg font-semibold text-ink">Khoj</span>
            </div>
            <p className="mt-3 text-sm text-ink-soft">
              A provenance-first cultural graph of India — every place and tradition cites its
              independent sources. This whole site runs on the public Khoj API.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm">
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-ink-mute">Browse</span>
              <Link href="/explore" className="text-ink-soft transition hover:text-ink">Explore culture</Link>
              <Link href="/#cities" className="text-ink-soft transition hover:text-ink">Destinations</Link>
              <Link href="/search" className="text-ink-soft transition hover:text-ink">Search</Link>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-ink-mute">Build</span>
              <Link href="/developers" className="text-ink-soft transition hover:text-ink">Developer API</Link>
              <Link href="/developers/docs" className="text-ink-soft transition hover:text-ink">API reference</Link>
              <Link href="/developers/signup" className="text-ink-soft transition hover:text-ink">Get a key</Link>
            </div>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-line pt-5 text-[11px] text-ink-mute sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Khoj · provenance-first cultural data for India</span>
          <span>Hero imagery via Wikimedia Commons</span>
        </div>
      </div>
    </footer>
  );
}
