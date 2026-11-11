"use client";

import { useEffect, useState } from "react";

// Interactive, no-signup demo: calls the LIVE API from the browser (CORS * allows it)
// and renders real results with their trust + freshness — the two things that make Khoj
// different. It also shows the exact request URL + curl, so the explorer doubles as docs.

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "https://khoj-ibli.onrender.com";

// Well-covered city slugs (verified to return corroborated results). Note: it's
// `bangalore`, not `bengaluru`, in the graph.
const CHIPS = ["delhi", "leh", "varanasi", "kutch", "bangalore", "guwahati", "mumbai", "goa"];
const MIN_SOURCES = 2; // showcase only corroborated places — the whole point of Khoj

type Trust = { sources: number; platforms: number; score: number };
type Freshness = { label: string; age_days: number | null } | null;
type Place = {
  slug: string;
  name: string;
  category: string | null;
  city: string;
  sources: number;
  score: number;
  trust: Trust;
  freshness: Freshness;
};

const pretty = (s: string | null) =>
  (s ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function FreshnessPill({ f }: { f: Freshness }) {
  if (!f || f.label === "unknown") return null;
  const tone =
    f.label === "fresh"
      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
      : f.label === "aging"
        ? "text-amber-700 bg-amber-50 border-amber-200"
        : "text-ink-mute bg-paper border-line";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${tone}`}>
      {f.label}
    </span>
  );
}

function PlaceCard({ p }: { p: Place }) {
  const pct = Math.round((p.trust?.score ?? 0) * 100);
  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium text-ink">{p.name}</div>
          <div className="text-xs text-ink-mute">
            {pretty(p.category) || "Place"} · {p.city}
          </div>
        </div>
        <FreshnessPill f={p.freshness} />
      </div>
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[11px] text-ink-soft">
          <span>Trust</span>
          <span className="font-mono text-ink">{(p.trust?.score ?? 0).toFixed(2)}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-vermilion" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1.5 text-[11px] text-ink-mute">
          {p.trust?.sources ?? p.sources} source{(p.trust?.sources ?? p.sources) === 1 ? "" : "s"} ·{" "}
          {p.trust?.platforms ?? 1} platform{(p.trust?.platforms ?? 1) === 1 ? "" : "s"}
        </div>
      </div>
    </div>
  );
}

export default function LiveExplorer() {
  const [city, setCity] = useState("delhi");
  const [input, setInput] = useState("delhi");
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [raw, setRaw] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);

  const path = `/v1/places?city=${encodeURIComponent(city)}&sort=trust&min_sources=${MIN_SOURCES}&limit=6`;
  const url = API_BASE + path;
  const curl = `curl "${url}"`;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => {
        if (!alive) return;
        setRaw(j);
        setPlaces(Array.isArray(j.data) ? j.data : []);
      })
      .catch((e) => alive && setError(String(e.message || e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [url]);

  return (
    <div className="rounded-2xl border border-line bg-paper-card p-5 sm:p-6">
      <div className="mb-1 flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-vermilion" />
        <span className="text-[11px] uppercase tracking-[0.18em] text-ink-mute">
          Live · talking to the real API
        </span>
      </div>
      <h3 className="font-display text-lg font-semibold text-ink">
        Try it — explore any Indian city
      </h3>
      <p className="mb-4 text-xs text-ink-soft">
        Showing places with <span className="font-medium text-ink">{MIN_SOURCES}+ independent sources</span>, ranked by trust.
      </p>

      {/* Query bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const v = input.trim().toLowerCase();
          if (v) setCity(v);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="city, e.g. leh"
          className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-ink focus:outline-none"
        />
        <button
          type="submit"
          className="shrink-0 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:opacity-90"
        >
          Explore
        </button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {CHIPS.map((c) => (
          <button
            key={c}
            onClick={() => {
              setInput(c);
              setCity(c);
            }}
            className={`rounded-full border px-2.5 py-1 text-xs capitalize transition ${
              c === city
                ? "border-vermilion bg-vermilion/10 text-vermilion"
                : "border-line text-ink-soft hover:border-ink hover:text-ink"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* The request — the explorer doubles as docs */}
      <div className="mt-4 flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded-lg border border-line bg-paper px-3 py-2 font-mono text-[11px] text-ink-soft">
          GET {path}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(curl).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1400);
              },
              () => {},
            );
          }}
          className="shrink-0 rounded-lg border border-line px-3 py-2 text-xs text-ink-soft transition hover:border-ink hover:text-ink"
        >
          {copied ? "Copied" : "Copy curl"}
        </button>
      </div>

      {/* Results */}
      <div className="mt-4 min-h-[8rem]">
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl border border-line bg-paper" />
            ))}
          </div>
        ) : error ? (
          <p className="rounded-lg border border-line bg-paper px-3 py-6 text-center text-sm text-ink-soft">
            Couldn’t reach the API ({error}). It may be waking from sleep — try again in a few seconds.
          </p>
        ) : places.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-sm text-ink-mute">
            No corroborated places for “{city}” yet. Try delhi, leh, kutch or varanasi.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {places.map((p) => (
              <PlaceCard key={p.slug + p.city} p={p} />
            ))}
          </div>
        )}
      </div>

      {/* Raw JSON toggle */}
      {!loading && !error && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowJson((s) => !s)}
            className="text-xs font-medium text-ink-soft underline underline-offset-4 hover:text-ink"
          >
            {showJson ? "Hide" : "Show"} raw JSON response
          </button>
          {showJson && (
            <pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-line bg-paper p-3 font-mono text-[11px] leading-relaxed text-ink-soft">
              {JSON.stringify(raw, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
