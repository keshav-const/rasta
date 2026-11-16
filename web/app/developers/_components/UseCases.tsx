"use client";

import { useEffect, useRef, useState } from "react";

// Self-playing "use case" reel: each slide is a REAL product integration you could
// ship on top of Khoj — framed the way TasteTrail used the graph at the Qloo hackathon.
// It types out the actual API request, then shows a representative result and what you'd
// build with it. Auto-advances; pause on hover; click a tab to jump. No external assets —
// it reads like a short screencast but is plain, fast, offline-safe React.

const SLIDE_MS = 7000;

type Source = { sources: number; platforms: number };
type Row = { name: string; meta: string; trust: number };
type Pin = { name: string; x: number; y: number; coord: string };

type UseCase = {
  id: string;
  audience: string; // who ships it
  title: string;
  blurb: string;
  method: string;
  path: string;
  ship: string; // the product outcome
  kind: "rank" | "map" | "rag" | "grid" | "verify";
  rows?: Row[];
  pins?: Pin[];
  chips?: string[];
  answer?: string;
  cited?: string[];
};

const USE_CASES: UseCase[] = [
  {
    id: "reco",
    audience: "Recommendation & taste apps",
    title: "Ground a culture recommender in verified data",
    blurb:
      "A user loves Hampi's ruins. Pull culturally-adjacent, well-corroborated entities and rank them by trust — the way TasteTrail fed the graph into Qloo-style recommendations, minus the SEO slop.",
    method: "GET",
    path: "/v1/places?type=cultural&min_sources=2&sort=trust",
    ship: "A recommendation engine whose picks are backed by independent sources, not vibes.",
    kind: "rank",
    rows: [
      { name: "Kathakali", meta: "performing art · Kerala", trust: 0.95 },
      { name: "Hampi Bazaar", meta: "heritage · Karnataka", trust: 0.9 },
      { name: "Yakshagana", meta: "folk theatre · Karnataka", trust: 0.82 },
      { name: "Cheriyal Scrolls", meta: "craft · Telangana", trust: 0.76 },
    ],
  },
  {
    id: "map",
    audience: "Travel & maps products",
    title: "Drop trusted pins on a map — near a point",
    blurb:
      "Physical places are ~93% geocoded, so you can query by radius or map viewport. Ask for the best-corroborated food near a location and render pins that each cite their sources.",
    method: "GET",
    path: "/v1/places?near=28.61,77.21&radius_km=3&type=dish&sort=trust",
    ship: "A map UI where every pin is a fact with receipts — plus distance_km, nearest first.",
    kind: "map",
    pins: [
      { name: "Chaat", x: 38, y: 44, coord: "28.65, 77.23" },
      { name: "Butter Chicken", x: 60, y: 32, coord: "28.63, 77.22" },
      { name: "Nihari", x: 52, y: 62, coord: "28.64, 77.24" },
      { name: "Paratha", x: 72, y: 54, coord: "28.66, 77.20" },
    ],
  },
  {
    id: "rag",
    audience: "AI assistants & agents",
    title: "Cite real sources in an LLM travel assistant",
    blurb:
      "Fetch one entity with all its evidence — platform, title, url, creator, date and the raw claims. Feed that to your model so answers are grounded and citable instead of hallucinated.",
    method: "GET",
    path: "/v1/places/dal-lake",
    ship: "A chatbot that answers “is Dal Lake worth it?” with sourced claims it can link to.",
    kind: "rag",
    answer:
      "Dal Lake (Srinagar) — a high-trust spot: shikara rides and the floating markets are corroborated across 6 sources on 3 platforms.",
    cited: ["YouTube · creator vlog", "Wikipedia · Dal Lake", "Travel blog · Kashmir guide"],
  },
  {
    id: "discover",
    audience: "Discovery & education apps",
    title: "Browse India's living culture by type & region",
    blurb:
      "The graph isn't places-only: festivals, dance, folk theatre, crafts, cuisines and traditional sports are first-class entity types — queryable per region for a culture explorer.",
    method: "GET",
    path: "/v1/entities?type=festival",
    ship: "An India-culture explorer: filter by festival, craft, dance or cuisine — each with receipts.",
    kind: "grid",
    chips: [
      "Thrissur Pooram",
      "Chhath Puja",
      "Hornbill Festival",
      "Bihu",
      "Rann Utsav",
      "Ziro Music",
      "Bonalu",
      "Hemis",
    ],
  },
  {
    id: "verify",
    audience: "Content & trust layers",
    title: "Show only facts corroborated across platforms",
    blurb:
      "Trust is a first-class, filterable signal. Require 2+ independent platforms (not just 2 of the same) so a single viral video can't pass as verified. Every result carries its counts.",
    method: "GET",
    path: "/v1/places?city=jaipur&min_platforms=2&sort=trust",
    ship: "A content layer that quietly drops single-source and unverified claims before they ship.",
    kind: "verify",
    rows: [
      { name: "Amber Fort", meta: "12 sources · 3 platforms", trust: 1 },
      { name: "Hawa Mahal", meta: "9 sources · 3 platforms", trust: 0.92 },
      { name: "City Palace", meta: "7 sources · 2 platforms", trust: 0.84 },
    ],
  },
];

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://khoj-ibli.onrender.com";

function TrustBar({ v }: { v: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div className="h-full rounded-full bg-vermilion" style={{ width: `${Math.round(v * 100)}%` }} />
    </div>
  );
}

function Preview({ uc, typed }: { uc: UseCase; typed: boolean }) {
  if (uc.kind === "map") {
    return (
      <div className="relative h-full min-h-[11rem] overflow-hidden rounded-xl border border-line bg-paper">
        {/* faint grid "map" */}
        <div
          className="absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage:
              "linear-gradient(var(--tw-grid,#e7e1d6) 1px,transparent 1px),linear-gradient(90deg,var(--tw-grid,#e7e1d6) 1px,transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        {uc.pins?.map((p, i) => (
          <div
            key={p.name}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          >
            <span className="relative flex h-3 w-3">
              {i === 0 && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-vermilion opacity-60" />
              )}
              <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-paper bg-vermilion shadow" />
            </span>
            <span className="mt-1 block whitespace-nowrap rounded bg-ink/85 px-1.5 py-0.5 text-[9px] font-medium text-paper">
              {p.name}
            </span>
          </div>
        ))}
        <div className="absolute bottom-2 right-2 rounded bg-paper/90 px-2 py-1 font-mono text-[10px] text-ink-soft">
          📍 near 28.61, 77.21 · r=3km
        </div>
      </div>
    );
  }

  if (uc.kind === "rag") {
    return (
      <div className="flex h-full flex-col gap-2">
        <div className="rounded-xl rounded-bl-sm border border-line bg-paper px-3 py-2 text-sm text-ink">
          {uc.answer}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {uc.cited?.map((c) => (
            <span
              key={c}
              className="rounded-full border border-vermilion/30 bg-vermilion/5 px-2 py-0.5 text-[10px] font-medium text-vermilion"
            >
              ⛓ {c}
            </span>
          ))}
        </div>
        <p className="mt-auto text-[11px] text-ink-mute">
          Grounded on <span className="font-mono text-ink-soft">/v1/places/&#123;slug&#125;</span> evidence —
          no hallucinated sources.
        </p>
      </div>
    );
  }

  if (uc.kind === "grid") {
    return (
      <div className="flex h-full flex-wrap content-start gap-2">
        {uc.chips?.map((c, i) => (
          <span
            key={c}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
              i % 3 === 0
                ? "border-vermilion/30 bg-vermilion/5 text-vermilion"
                : "border-line bg-paper text-ink-soft"
            }`}
          >
            {c}
          </span>
        ))}
      </div>
    );
  }

  // rank + verify: a list of rows with trust bars
  return (
    <div className="flex h-full flex-col justify-center gap-2.5">
      {uc.rows?.map((r) => (
        <div key={r.name} className="rounded-lg border border-line bg-paper px-3 py-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-ink">{r.name}</span>
            {uc.kind === "verify" ? (
              <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">
                ✓ corroborated
              </span>
            ) : (
              <span className="shrink-0 font-mono text-[11px] text-ink">{r.trust.toFixed(2)}</span>
            )}
          </div>
          <TrustBar v={r.trust} />
          <div className="mt-1 text-[10px] text-ink-mute">{r.meta}</div>
        </div>
      ))}
    </div>
  );
}

export default function UseCases() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [typed, setTyped] = useState("");
  const uc = USE_CASES[active];
  const fullReq = `${uc.method} ${uc.path}`;

  // auto-advance
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % USE_CASES.length), SLIDE_MS);
    return () => clearTimeout(t);
  }, [active, paused]);

  // "typing" effect for the request line on each slide
  useEffect(() => {
    setTyped("");
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      setTyped(fullReq.slice(0, i));
      if (i >= fullReq.length) clearInterval(id);
    }, 18);
    return () => clearInterval(id);
  }, [fullReq]);

  return (
    <div
      className="rounded-2xl border border-line bg-paper-card p-5 sm:p-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.18em] text-ink-mute">
          Built with Khoj · real use cases
        </span>
      </div>
      <h3 className="font-display text-lg font-semibold text-ink">
        What you can ship on top of the API
      </h3>
      <p className="mb-4 text-xs text-ink-soft">
        Five real product integrations — the same way TasteTrail plugged this graph into a
        Qloo-style recommender at the hackathon. Hover to pause.
      </p>

      {/* tabs with a play-progress bar on the active one */}
      <div className="mb-4 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
        {USE_CASES.map((c, i) => (
          <button
            key={c.id}
            onClick={() => setActive(i)}
            className={`group relative overflow-hidden rounded-lg border px-2.5 py-2 text-left transition ${
              i === active
                ? "border-ink bg-ink text-paper"
                : "border-line text-ink-soft hover:border-ink hover:text-ink"
            }`}
          >
            <span className="block text-[10px] uppercase tracking-wide opacity-70">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="block text-[11px] font-medium leading-tight">{c.audience}</span>
            {i === active && !paused && (
              <span
                key={active}
                className="absolute bottom-0 left-0 h-0.5 bg-vermilion"
                style={{ animation: `ucbar ${SLIDE_MS}ms linear forwards` }}
              />
            )}
          </button>
        ))}
      </div>

      {/* the active card */}
      <div className="grid gap-5 md:grid-cols-2">
        <div className="flex flex-col">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-vermilion">
            For {uc.audience}
          </div>
          <h4 className="font-display text-xl font-semibold text-ink">{uc.title}</h4>
          <p className="mt-2 text-sm text-ink-soft">{uc.blurb}</p>

          <div className="mt-3 rounded-lg border border-line bg-paper px-3 py-2 font-mono text-[11px] text-ink">
            <span className="text-vermilion">{typed.split(" ")[0]}</span>{" "}
            <span className="text-ink-soft">{typed.split(" ").slice(1).join(" ")}</span>
            <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-ink/60 align-middle" />
          </div>

          <div className="mt-3 flex items-start gap-2 rounded-lg bg-paper px-3 py-2">
            <span className="mt-0.5 text-vermilion">➜</span>
            <p className="text-sm text-ink">
              <span className="font-medium">You ship:</span> {uc.ship}
            </p>
          </div>
        </div>

        <div className="min-h-[12rem] rounded-xl border border-line bg-paper-card p-3">
          <Preview uc={uc} typed={typed.length >= fullReq.length} />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <a
          href={`${API_BASE}${uc.path}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[11px] text-ink-soft underline underline-offset-4 hover:text-ink"
        >
          Try this request →
        </a>
        <div className="flex gap-1.5">
          {USE_CASES.map((c, i) => (
            <button
              key={c.id}
              aria-label={`Go to use case ${i + 1}`}
              onClick={() => setActive(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === active ? "w-6 bg-vermilion" : "w-1.5 bg-line hover:bg-ink-mute"
              }`}
            />
          ))}
        </div>
      </div>

      <style>{`@keyframes ucbar{from{width:0}to{width:100%}}`}</style>
    </div>
  );
}
