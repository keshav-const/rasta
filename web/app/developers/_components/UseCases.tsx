"use client";

import { useEffect, useState } from "react";

// Self-playing "use case" clips. Each slide is a short, looping PRODUCT DEMO — an app
// window where a real integration scenario animates step by step (a map drops trusted
// pins, a chatbot streams a cited answer, a recommender ranks cards, …). It reads like a
// screencast but is pure CSS/SVG motion: no video files, fast, offline-safe. Framed the
// way TasteTrail plugged this graph into a Qloo-style product at the hackathon.

const SLIDE_MS = 9000;

/* ----------------------------- shared window chrome ----------------------------- */
function Win({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-paper shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-line bg-paper-card px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 truncate rounded bg-paper px-2 py-0.5 font-mono text-[10px] text-ink-mute">
          {url}
        </span>
        <span className="ml-auto flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-vermilion">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-vermilion" />
          Rec
        </span>
      </div>
      <div className="relative h-[14rem] overflow-hidden p-3">{children}</div>
    </div>
  );
}

const GRID_BG: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(rgba(128,128,128,.16) 1px,transparent 1px),linear-gradient(90deg,rgba(128,128,128,.16) 1px,transparent 1px)",
  backgroundSize: "22px 22px",
};

/* --------------------------------- the 5 scenes --------------------------------- */

function MapScene() {
  // query point sits at ~50%,54%; pins fall inside the radius ring around it.
  const pins = [
    { n: "Chaat", s: "✓ 3 src", x: 38, y: 44, d: 2.0 },
    { n: "Nihari", s: "✓ 4 src", x: 61, y: 46, d: 2.5 },
    { n: "Vada Pav", s: "✓ 2 src", x: 44, y: 68, d: 3.0 },
    { n: "Paratha", s: "✓ 5 src", x: 60, y: 66, d: 3.5 },
  ];
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* hand-drawn city map, slowly panning (ken-burns) for a video feel */}
      <svg
        className="uc-pan absolute inset-0 h-full w-full"
        viewBox="0 0 400 260"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <rect width="400" height="260" fill="rgba(128,128,128,.04)" />
        {/* river */}
        <path
          d="M330,-10 C318,50 352,100 330,150 C312,196 346,236 330,270 L420,270 L420,-10 Z"
          fill="rgba(70,130,180,.16)"
        />
        <path d="M330,-10 C318,50 352,100 330,150 C312,196 346,236 330,270" stroke="rgba(70,130,180,.3)" strokeWidth="1.5" fill="none" />
        {/* parks */}
        <rect x="34" y="36" width="78" height="52" rx="9" fill="rgba(60,160,90,.15)" />
        <rect x="150" y="186" width="92" height="56" rx="9" fill="rgba(60,160,90,.15)" />
        {/* minor street grid (subtle) */}
        <g stroke="rgba(128,128,128,.14)" strokeWidth="1">
          {[40, 80, 120, 160, 200, 240, 280].map((y) => (
            <line key={`h${y}`} x1="0" y1={y} x2="330" y2={y} />
          ))}
          {[40, 90, 140, 190, 240, 290].map((x) => (
            <line key={`v${x}`} x1={x} y1="0" x2={x} y2="260" />
          ))}
        </g>
        {/* arterial roads (casing + fill so they read as highways, not grid) */}
        <g fill="none" strokeLinecap="round">
          <path d="M-10,96 C120,84 240,108 340,86" stroke="rgba(128,128,128,.28)" strokeWidth="8" />
          <path d="M-10,96 C120,84 240,108 340,86" stroke="rgba(255,255,255,.55)" strokeWidth="3" />
          <path d="M165,-10 C176,110 150,170 176,270" stroke="rgba(128,128,128,.28)" strokeWidth="8" />
          <path d="M165,-10 C176,110 150,170 176,270" stroke="rgba(255,255,255,.55)" strokeWidth="3" />
          <path d="M10,250 C130,180 230,150 345,70" stroke="rgba(128,128,128,.22)" strokeWidth="6" />
        </g>
        {/* faint district labels */}
        <g fill="rgba(128,128,128,.4)" fontSize="9" fontStyle="italic">
          <text x="46" y="66">Old City</text>
          <text x="300" y="130">Riverside</text>
          <text x="166" y="214">City Park</text>
        </g>
      </svg>

      {/* search bar */}
      <div className="uc-pop absolute left-3 right-3 top-3 z-20 flex items-center gap-2 rounded-lg border border-line bg-paper/95 px-2.5 py-1.5 shadow-sm backdrop-blur-sm">
        <span className="text-ink-mute">⌕</span>
        <span className="text-[11px] text-ink-soft">trusted street food near me</span>
        <span className="ml-auto rounded bg-vermilion px-1.5 py-0.5 font-mono text-[9px] font-medium text-paper">
          near 28.61, 77.21
        </span>
      </div>

      {/* expanding search radius (near + radius_km) */}
      <div
        className="uc-radius absolute left-1/2 top-[54%] z-10 h-40 w-40 rounded-full border-2 border-vermilion/60 bg-vermilion/5"
        style={{ animationDelay: "0.9s" }}
      />
      <span
        className="uc-fade absolute left-[calc(50%+2.6rem)] top-[calc(54%-3.1rem)] z-10 rounded bg-vermilion px-1.5 py-0.5 text-[9px] font-medium text-paper"
        style={{ animationDelay: "1.6s" }}
      >
        r = 3 km
      </span>
      {/* query point */}
      <div className="absolute left-1/2 top-[54%] z-10 -translate-x-1/2 -translate-y-1/2">
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ink/40" />
          <span className="relative h-3 w-3 rounded-full border-2 border-paper bg-ink shadow" />
        </span>
      </div>

      {/* trusted pins drop inside the radius */}
      {pins.map((p) => (
        <div
          key={p.n}
          className="uc-drop absolute z-20 -translate-x-1/2"
          style={{ left: `${p.x}%`, top: `${p.y}%`, animationDelay: `${p.d}s` }}
        >
          <div className="flex flex-col items-center">
            <span className="h-3.5 w-3.5 rounded-full border-2 border-paper bg-vermilion shadow" />
            <span className="mt-1 whitespace-nowrap rounded bg-ink/85 px-1.5 py-0.5 text-[9px] font-medium text-paper">
              {p.n} · {p.s}
            </span>
          </div>
        </div>
      ))}

      {/* result card slides up */}
      <div
        className="uc-slideup absolute bottom-3 left-3 right-3 z-20 flex items-center gap-2 rounded-lg border border-line bg-paper/95 px-3 py-2 shadow backdrop-blur-sm"
        style={{ animationDelay: "4.2s" }}
      >
        <span className="grid h-7 w-7 place-items-center rounded bg-vermilion/10 text-vermilion">📍</span>
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-ink">Chaat — 0.4 km away</div>
          <div className="text-[10px] text-ink-mute">4 trusted spots in radius · nearest-first · each cites its sources</div>
        </div>
      </div>
    </div>
  );
}

function ChatScene() {
  return (
    <div className="absolute inset-0 flex flex-col gap-2 p-1">
      {/* user bubble */}
      <div className="uc-slidein self-end rounded-xl rounded-br-sm bg-ink px-3 py-1.5 text-[11px] text-paper" style={{ animationDelay: "0.3s" }}>
        Is Dal Lake worth visiting?
      </div>
      {/* typing dots */}
      <div className="uc-typing self-start" style={{ animationDelay: "1.1s" }}>
        <div className="flex items-center gap-1 rounded-xl rounded-bl-sm border border-line bg-paper px-3 py-2">
          <span className="uc-dot h-1.5 w-1.5 rounded-full bg-ink-mute" />
          <span className="uc-dot h-1.5 w-1.5 rounded-full bg-ink-mute" style={{ animationDelay: ".2s" }} />
          <span className="uc-dot h-1.5 w-1.5 rounded-full bg-ink-mute" style={{ animationDelay: ".4s" }} />
        </div>
      </div>
      {/* assistant answer */}
      <div className="uc-fade self-start rounded-xl rounded-bl-sm border border-line bg-paper px-3 py-2 text-[11px] leading-relaxed text-ink" style={{ animationDelay: "2.6s" }}>
        Yes — Dal Lake is a high-trust highlight of Srinagar. Shikara rides and the floating
        gardens are corroborated across <span className="font-medium text-vermilion">6 sources on 3 platforms</span>.
      </div>
      {/* source chips */}
      <div className="uc-fade flex flex-wrap gap-1.5 self-start" style={{ animationDelay: "3.6s" }}>
        {["YouTube · vlog", "Wikipedia", "Travel blog"].map((c, i) => (
          <span
            key={c}
            className="uc-pop rounded-full border border-vermilion/30 bg-vermilion/5 px-2 py-0.5 text-[9px] font-medium text-vermilion"
            style={{ animationDelay: `${3.8 + i * 0.25}s` }}
          >
            ⛓ {c}
          </span>
        ))}
      </div>
      <p className="uc-fade mt-auto text-[10px] text-ink-mute" style={{ animationDelay: "4.6s" }}>
        grounded on /v1/places/&#123;slug&#125; evidence — zero hallucinated citations
      </p>
    </div>
  );
}

function RecoScene() {
  const items = [
    { n: "Kathakali", m: "performing art · Kerala", t: 95 },
    { n: "Hampi Bazaar", m: "heritage · Karnataka", t: 90 },
    { n: "Yakshagana", m: "folk theatre · Karnataka", t: 82 },
    { n: "Cheriyal Scrolls", m: "craft · Telangana", t: 76 },
  ];
  return (
    <div className="absolute inset-0 flex flex-col gap-2 p-1">
      <div className="uc-fade text-[11px] text-ink-soft" style={{ animationDelay: "0.2s" }}>
        Because you loved <span className="font-medium text-ink">Hampi</span> → culturally-adjacent, trust-ranked:
      </div>
      {items.map((it, i) => (
        <div
          key={it.n}
          className="uc-slidein rounded-lg border border-line bg-paper px-3 py-1.5"
          style={{ animationDelay: `${0.7 + i * 0.5}s` }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-ink">{it.n}</span>
            <span className="font-mono text-[10px] text-ink">{(it.t / 100).toFixed(2)}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className="uc-grow h-full rounded-full bg-vermilion"
              style={{ ["--w" as string]: `${it.t}%`, animationDelay: `${1 + i * 0.5}s` }}
            />
          </div>
          <div className="mt-0.5 text-[9px] text-ink-mute">{it.m}</div>
        </div>
      ))}
    </div>
  );
}

function DiscoverScene() {
  // three "pages" crossfade in sequence, each with its filter tab active
  const pages = [
    { tab: "Festivals", items: ["Thrissur Pooram", "Chhath Puja", "Hornbill", "Bihu", "Rann Utsav"] },
    { tab: "Dance", items: ["Kathakali", "Kalbelia", "Chhau", "Sattriya", "Perini"] },
    { tab: "Crafts", items: ["Cheriyal Scrolls", "Banarasi", "Pochampally", "Dhokra", "Pattachitra"] },
  ];
  const tabs = ["Festivals", "Dance", "Crafts"];
  return (
    <div className="absolute inset-0 flex flex-col gap-2 p-1">
      <div className="flex gap-1.5">
        {tabs.map((t, i) => (
          <span
            key={t}
            className="uc-tab rounded-full border px-2.5 py-1 text-[10px] font-medium"
            style={{ animationDelay: `${i * 3}s` }}
          >
            {t}
          </span>
        ))}
      </div>
      <div className="relative flex-1">
        {pages.map((pg, i) => (
          <div
            key={pg.tab}
            className="uc-page absolute inset-0 flex flex-wrap content-start gap-1.5"
            style={{ animationDelay: `${i * 3}s` }}
          >
            {pg.items.map((it, j) => (
              <span
                key={it}
                className="uc-pop rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[11px] text-ink-soft"
                style={{ animationDelay: `${i * 3 + 0.1 + j * 0.12}s` }}
              >
                {it}
              </span>
            ))}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-ink-mute">one filter switch → a whole new slice of the culture graph</p>
    </div>
  );
}

function VerifyScene() {
  const rows = [
    { n: "Amber Fort is 16th-c. Rajput", ok: true, meta: "3 platforms", d: 0.4 },
    { n: "“secret 5th gate” (1 blog)", ok: false, meta: "1 source", d: 1.0 },
    { n: "Hawa Mahal — 953 windows", ok: true, meta: "3 platforms", d: 1.6 },
    { n: "“haunted at night” (1 reel)", ok: false, meta: "1 source", d: 2.2 },
  ];
  return (
    <div className="absolute inset-0 flex flex-col gap-2 p-1">
      <div className="uc-fade text-[11px] text-ink-soft" style={{ animationDelay: "0.1s" }}>
        Incoming claims about <span className="font-medium text-ink">Jaipur</span> → require 2+ platforms:
      </div>
      {rows.map((r) => (
        <div
          key={r.n}
          className={`flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-1.5 ${
            r.ok ? "uc-slidein" : "uc-reject"
          }`}
          style={{ animationDelay: `${r.d}s` }}
        >
          <span
            className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] ${
              r.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
            }`}
          >
            {r.ok ? "✓" : "✕"}
          </span>
          <span className="truncate text-[11px] text-ink">{r.n}</span>
          <span className={`ml-auto shrink-0 text-[9px] ${r.ok ? "text-emerald-700" : "text-red-500"}`}>
            {r.meta}
          </span>
        </div>
      ))}
      <p className="uc-fade mt-auto text-[10px] text-ink-mute" style={{ animationDelay: "3.2s" }}>
        4 claims in → 2 verified shipped. single-source noise dropped automatically.
      </p>
    </div>
  );
}

/* --------------------------------- the reel --------------------------------- */

type UC = {
  id: string;
  audience: string;
  title: string;
  ship: string;
  url: string;
  path: string;
  Scene: () => React.JSX.Element;
};

const USE_CASES: UC[] = [
  {
    id: "reco",
    audience: "Recommendation apps",
    title: "Ground a culture recommender in verified data",
    ship: "picks backed by independent sources, not SEO slop — the TasteTrail × Qloo pattern.",
    url: "tastetrail.app/for-you",
    path: "/v1/places?type=cultural&min_sources=2&sort=trust",
    Scene: RecoScene,
  },
  {
    id: "map",
    audience: "Travel & maps",
    title: "Drop trusted pins on a map, near a point",
    ship: "a map where every pin is a fact with receipts — distance_km, nearest first.",
    url: "wandr.app/near-me",
    path: "/v1/places?near=28.61,77.21&radius_km=3&type=dish&sort=trust",
    Scene: MapScene,
  },
  {
    id: "rag",
    audience: "AI assistants",
    title: "Cite real sources in an LLM assistant",
    ship: "a chatbot that answers with linkable, sourced claims instead of hallucinations.",
    url: "chat.yourtravelbot.ai",
    path: "/v1/places/dal-lake",
    Scene: ChatScene,
  },
  {
    id: "discover",
    audience: "Discovery & edu",
    title: "Browse India's living culture by type",
    ship: "a culture explorer: festivals, dance, crafts, cuisines — each with receipts.",
    url: "bharat.guide/explore",
    path: "/v1/entities?type=festival",
    Scene: DiscoverScene,
  },
  {
    id: "verify",
    audience: "Trust & content layers",
    title: "Show only facts corroborated across platforms",
    ship: "a layer that drops single-source and unverified claims before they ship.",
    url: "cms.yoursite.com/review",
    path: "/v1/places?city=jaipur&min_platforms=2&sort=trust",
    Scene: VerifyScene,
  },
];

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://khoj-ibli.onrender.com";

export default function UseCases() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const uc = USE_CASES[active];
  const Scene = uc.Scene;

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % USE_CASES.length), SLIDE_MS);
    return () => clearTimeout(t);
  }, [active, paused]);

  return (
    <div
      className="rounded-2xl border border-line bg-paper-card p-5 sm:p-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-ink-mute">
        Built with Khoj · product demos
      </div>
      <h3 className="font-display text-lg font-semibold text-ink">
        What you can ship on top of the API
      </h3>
      <p className="mb-4 text-xs text-ink-soft">
        Short clips of five real integrations — the way TasteTrail fed this graph into a Qloo-style
        product at the hackathon. Hover to pause.
      </p>

      {/* tabs with a play-progress bar on the active one */}
      <div className="mb-4 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
        {USE_CASES.map((c, i) => (
          <button
            key={c.id}
            onClick={() => setActive(i)}
            className={`relative overflow-hidden rounded-lg border px-2.5 py-2 text-left transition ${
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

      <div className="grid gap-5 md:grid-cols-5">
        {/* the animated clip (remounts per slide → replays) */}
        <div className="md:col-span-3">
          <div key={active} className="relative">
            <Win url={uc.url}>
              <Scene />
            </Win>
            {/* scrubber under the window, like a video timeline */}
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-line">
              {!paused && (
                <div
                  key={active}
                  className="h-full bg-vermilion/70"
                  style={{ animation: `ucbar ${SLIDE_MS}ms linear forwards` }}
                />
              )}
            </div>
          </div>
        </div>

        {/* caption */}
        <div className="flex flex-col md:col-span-2">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-vermilion">
            For {uc.audience}
          </div>
          <h4 className="font-display text-xl font-semibold text-ink">{uc.title}</h4>
          <div className="mt-3 flex items-start gap-2">
            <span className="mt-0.5 text-vermilion">➜</span>
            <p className="text-sm text-ink">
              <span className="font-medium">You ship:</span> {uc.ship}
            </p>
          </div>
          <code className="mt-3 block overflow-x-auto rounded-lg border border-line bg-paper px-3 py-2 font-mono text-[11px] text-ink-soft">
            GET {uc.path}
          </code>
          <a
            href={`${API_BASE}${uc.path}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 font-mono text-[11px] text-ink-soft underline underline-offset-4 hover:text-ink"
          >
            Try this request →
          </a>
        </div>
      </div>

      {/* dots */}
      <div className="mt-4 flex justify-center gap-1.5">
        {USE_CASES.map((c, i) => (
          <button
            key={c.id}
            aria-label={`Go to clip ${i + 1}`}
            onClick={() => setActive(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === active ? "w-6 bg-vermilion" : "w-1.5 bg-line hover:bg-ink-mute"
            }`}
          />
        ))}
      </div>

      <style>{`
        @keyframes ucbar{from{width:0}to{width:100%}}
        @keyframes ucDrop{0%{opacity:0;transform:translate(-50%,-18px)}60%{transform:translate(-50%,2px)}100%{opacity:1;transform:translate(-50%,0)}}
        @keyframes ucSlideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes ucSlideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
        @keyframes ucFade{from{opacity:0}to{opacity:1}}
        @keyframes ucPop{0%{opacity:0;transform:scale(.8)}60%{transform:scale(1.06)}100%{opacity:1;transform:scale(1)}}
        @keyframes ucGrow{from{width:0}to{width:var(--w)}}
        @keyframes ucDotBlink{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-2px)}}
        @keyframes ucTyping{0%{opacity:0}8%{opacity:1}72%{opacity:1}100%{opacity:0}}
        @keyframes ucPage{0%{opacity:0}6%{opacity:1}30%{opacity:1}39%{opacity:0}100%{opacity:0}}
        @keyframes ucTab{0%,100%{border-color:var(--color-line,#e7e1d6);background:transparent;color:inherit}3%,30%{border-color:#e4572e;background:rgba(228,87,46,.08);color:#e4572e}}
        @keyframes ucReject{0%{opacity:0;transform:translateX(20px)}18%{opacity:1;transform:translateX(0)}60%{opacity:1;text-decoration:none}80%,100%{opacity:.3;transform:translateX(-10px);text-decoration:line-through}}
        @keyframes ucPan{from{transform:scale(1.05) translate(0,0)}to{transform:scale(1.13) translate(-2.5%,-3%)}}
        @keyframes ucRadius{0%{opacity:0;transform:translate(-50%,-50%) scale(0)}55%{opacity:1}100%{opacity:1;transform:translate(-50%,-50%) scale(1)}}
        .uc-drop{opacity:0;animation:ucDrop .7s cubic-bezier(.2,.7,.3,1) both}
        .uc-slideup{opacity:0;animation:ucSlideUp .6s ease-out both}
        .uc-slidein{opacity:0;animation:ucSlideIn .5s ease-out both}
        .uc-fade{opacity:0;animation:ucFade .6s ease-out both}
        .uc-pop{opacity:0;animation:ucPop .5s ease-out both}
        .uc-grow{animation:ucGrow .9s ease-out both}
        .uc-typing{opacity:0;animation:ucTyping 1.6s ease-out both}
        .uc-dot{animation:ucDotBlink 1s infinite ease-in-out}
        .uc-page{opacity:0;animation:ucPage 9s ease-in-out both}
        .uc-tab{animation:ucTab 9s ease-in-out both}
        .uc-reject{opacity:0;animation:ucReject 3.6s ease-out both}
        .uc-pan{transform-origin:center;animation:ucPan 9s ease-out both}
        .uc-radius{transform:translate(-50%,-50%) scale(0);animation:ucRadius 1.5s cubic-bezier(.2,.7,.3,1) both}
        @media (prefers-reduced-motion: reduce){
          .uc-drop,.uc-slideup,.uc-slidein,.uc-fade,.uc-pop,.uc-grow,.uc-typing,.uc-page,.uc-tab,.uc-reject,.uc-radius{animation-duration:.01ms!important;opacity:1!important}
          .uc-pan{animation:none!important}
          .uc-dot{animation:none!important}
        }
      `}</style>
    </div>
  );
}
