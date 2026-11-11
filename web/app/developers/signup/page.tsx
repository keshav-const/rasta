import Link from "next/link";
import { signup } from "../actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invalid: "Enter a valid email and a password of at least 8 characters.",
  exists: "An account with that email already exists. Try signing in.",
  failed: "Could not create the account. Please try again.",
};

export default async function DevSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="grid min-h-screen place-items-center bg-paper px-6">
      <div className="grain pointer-events-none absolute inset-0" />
      <form
        action={signup}
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

        <h1 className="mb-1 font-display text-xl font-semibold text-ink">Create account</h1>
        <p className="mb-6 text-sm text-ink-soft">Get an API key for the Khoj cultural graph.</p>

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
          minLength={8}
          autoComplete="new-password"
          className="mb-1.5 w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-ink"
        />
        <p className="mb-4 text-xs text-ink-mute">At least 8 characters.</p>

        {error ? (
          <p className="mb-4 text-sm text-vermilion">{ERRORS[error] ?? ERRORS.failed}</p>
        ) : null}

        <button
          type="submit"
          className="w-full rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-paper transition hover:opacity-90"
        >
          Create account
        </button>

        <p className="mt-5 text-center text-sm text-ink-soft">
          Already have an account?{" "}
          <Link href="/developers/login" className="font-medium text-ink underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
