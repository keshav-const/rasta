import { login } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
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
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-vermilion font-display text-lg font-semibold text-paper">
            R
          </span>
          <span className="leading-tight">
            <span className="block font-display text-base font-semibold text-ink">Rasta</span>
            <span className="block text-[11px] uppercase tracking-[0.2em] text-ink-mute">
              Console
            </span>
          </span>
        </div>

        <h1 className="mb-1 font-display text-xl font-semibold text-ink">Sign in</h1>
        <p className="mb-6 text-sm text-ink-soft">Enter the admin password to continue.</p>

        <label htmlFor="password" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-mute">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          className="mb-4 w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-ink"
        />

        {error ? (
          <p className="mb-4 text-sm text-vermilion">Incorrect password. Try again.</p>
        ) : null}

        <button
          type="submit"
          className="w-full rounded-xl bg-ink px-3.5 py-2.5 text-sm font-medium text-paper transition hover:bg-vermilion"
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
