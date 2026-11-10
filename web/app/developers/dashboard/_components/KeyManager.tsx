"use client";

import { useActionState, useState } from "react";
import { createKey, revokeKey, type CreateKeyResult } from "../../actions";

export type KeyRow = {
  id: string;
  name: string;
  prefix: string;
  plan: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "https://khoj-ibli.onrender.com";

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** One-time reveal of a freshly minted key. Shown until dismissed; the raw key
 *  lives only in this client component's memory and is never refetchable. */
function KeyReveal({ rawKey }: { rawKey: string }) {
  const [copied, setCopied] = useState(false);
  const curl = `curl -H "X-API-Key: ${rawKey}" ${API_BASE}/v1/places?limit=3`;
  return (
    <div className="mb-6 rounded-2xl border border-vermilion/40 bg-vermilion/5 p-5">
      <p className="mb-2 text-sm font-semibold text-ink">Your new API key</p>
      <p className="mb-3 text-xs text-ink-soft">
        Copy it now — for your security it is <strong>never shown again</strong>.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded-lg border border-line bg-paper px-3 py-2 font-mono text-xs text-ink">
          {rawKey}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(rawKey).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              },
              () => {},
            );
          }}
          className="shrink-0 rounded-lg bg-vermilion px-3 py-2 text-xs font-medium text-paper transition hover:opacity-90"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-3 mb-1 text-[11px] uppercase tracking-[0.18em] text-ink-mute">
        Try it
      </p>
      <code className="block overflow-x-auto rounded-lg border border-line bg-paper px-3 py-2 font-mono text-[11px] text-ink-soft">
        {curl}
      </code>
    </div>
  );
}

export default function KeyManager({ keys }: { keys: KeyRow[] }) {
  const [state, formAction, pending] = useActionState<CreateKeyResult | null, FormData>(
    createKey,
    null,
  );
  const active = keys.filter((k) => !k.revokedAt);

  return (
    <div className="rounded-2xl border border-line bg-paper-card p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">API keys</h2>
          <p className="text-sm text-ink-soft">
            Authenticate requests with <code className="font-mono text-xs">X-API-Key</code>.
          </p>
        </div>
      </div>

      {state?.ok && <KeyReveal rawKey={state.rawKey} />}
      {state && !state.ok && (
        <p className="mb-4 rounded-lg border border-vermilion/40 bg-vermilion/5 px-3 py-2 text-sm text-ink">
          {state.error}
        </p>
      )}

      {/* Create */}
      <form action={formAction} className="mb-6 flex items-center gap-2">
        <input
          name="name"
          placeholder="Key name (e.g. local-dev)"
          maxLength={60}
          className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-ink focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create key"}
        </button>
      </form>

      {/* List */}
      {active.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-sm text-ink-mute">
          No active keys yet. Create one to start calling the API.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {active.map((k) => (
            <li key={k.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink">{k.name}</span>
                  <span className="rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-soft">
                    {k.plan}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-mute">
                  <code className="font-mono">{k.prefix}…</code>
                  <span>created {fmtDate(k.createdAt)}</span>
                  <span>last used {fmtDate(k.lastUsedAt)}</span>
                </div>
              </div>
              <form action={revokeKey}>
                <input type="hidden" name="id" value={k.id} />
                <button
                  type="submit"
                  className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs text-ink-soft transition hover:border-vermilion hover:text-vermilion"
                >
                  Revoke
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
