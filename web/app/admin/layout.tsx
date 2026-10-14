import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { isAuthenticated } from "@/lib/session";
import { logout } from "@/app/admin/login/actions";
import { NavLink } from "@/app/_components/nav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // The login page is the only route reachable while signed out (middleware
  // redirects everything else). Render it standalone — no sidebar, no DB counts.
  if (!(await isAuthenticated())) {
    return <>{children}</>;
  }

  const db = supabaseAdmin();
  const [poi, review] = await Promise.all([
    db.from("points_of_interest").select("*", { count: "exact", head: true }),
    db.from("resolution_review_queue").select("*", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  return (
    <div className="flex min-h-screen bg-paper">
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-line bg-paper-card px-5 py-7">
        <Link href="/admin" className="mb-10 flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-vermilion font-display text-lg font-semibold text-paper">
            R
          </span>
          <span className="leading-tight">
            <span className="block font-display text-base font-semibold text-ink">Rasta</span>
            <span className="block text-[11px] uppercase tracking-[0.2em] text-ink-mute">
              Console
            </span>
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-1.5">
          <NavLink href="/admin" label="Dashboard" />
          <NavLink href="/admin/sources" label="Sources" />
          <NavLink href="/admin/pois" label="Points of Interest" hint={String(poi.count ?? 0)} />
          <NavLink href="/admin/review" label="Review Queue" hint={String(review.count ?? 0)} />
        </nav>

        <Link
          href="/"
          className="mt-4 rounded-xl border border-line px-3 py-2.5 text-center text-sm text-ink-soft transition hover:border-ink hover:text-ink"
        >
          View public site ↗
        </Link>

        <form action={logout} className="mt-2">
          <button
            type="submit"
            className="w-full rounded-xl px-3 py-2.5 text-center text-sm text-ink-mute transition hover:text-vermilion"
          >
            Sign out
          </button>
        </form>
      </aside>

      <main className="relative flex-1">
        <div className="grain absolute inset-0" />
        <div className="relative z-10 px-10 py-9">{children}</div>
      </main>
    </div>
  );
}
