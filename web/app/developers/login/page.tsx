import Link from "next/link";
import { login } from "../actions";

export const dynamic = "force-dynamic";

export default async function DevLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="grid min-h-screen place-items-center bg-paper px-6">
      <div className="grain pointer-events-none absolute inset-0" />
      <form
        action={login}
        className="relative z-10 w-full max-w-sm rounded-2xl border border-line bg-paper-card p-8 shadow-sm"
      >
        <Link href="/developers" className="mb-6 flex items-center gap-3">
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

        <h1 className="mb-1 font-display text-xl font-semibold text-ink">Sign in</h1>
        <p className="mb-6 text-sm text-ink-soft">Access your API keys and usage.</p>

        <label htmlFor="email" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-mute">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          className="mb-4 w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-ink"
        />

        <label htmlFor="password" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-mute">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mb-4 w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-ink"
        />

        {error ? (
          <p className="mb-4 text-sm text-vermilion">Invalid email or password.</p>
        ) : null}

        <button
          type="submit"
          className="w-full rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-paper transition hover:opacity-90"
        >
          Sign in
        </button>

        <p className="mt-5 text-center text-sm text-ink-soft">
          No account?{" "}
          <Link href="/developers/signup" className="font-medium text-ink underline underline-offset-4">
            Create one
          </Link>
        </p>
      </form>
    </div>
  );
}
