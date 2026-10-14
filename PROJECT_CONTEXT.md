# Travel Intelligence Engine — Project Context & Handoff

**Working name:** Rasta
**Scope:** Delhi + Gurgaon (NCR) MVP
**Last updated:** 2026-07-21
**Purpose of this file:** Full context so work can resume on a new device (or a fresh Claude session) without re-deriving anything. The architectural source-of-truth is [`pipeline-spec.md`](./pipeline-spec.md); this file records what has actually been *built* and what's next.

---

## 1. What this is

A pipeline + web product that turns YouTube travel/food videos into a **ranked, structured travel knowledge graph**. It ingests a video, checks it's travel content, pulls the transcript, extracts every named place with claims + evidence, resolves those mentions to canonical Points of Interest, scores them, and presents the aggregate as a public site ("what the graph knows about a place") plus an admin console.

Framing note: it is a **travel-graph aggregator**, not "creator recommendations." Public copy uses "aggregated / backed by N sources / the verdict," never "creators say."

---

## 2. Current status at a glance

| Layer | State |
|-------|-------|
| Supabase schema (cloud) | ✅ applied (12 tables + seed) |
| Pipeline Stage 1 — Input/validation | ✅ built |
| Stage 2 — Metadata (YouTube API) | ✅ built |
| Stage 3 — Travel gate (LLM) | ✅ built |
| Stage 4 — Transcript retrieval | ✅ built |
| Stage 5 — AI extraction (+ chunking) | ✅ built |
| Stage 6 — Entity resolution | ✅ built (Google Places verify deferred) |
| Stage 7 — Enrichment (Google Places) | ✅ built — **dormant until `GOOGLE_PLACES_API_KEY` is set** (runner no-ops without it) |
| Stage 8 — Scoring | ✅ built |
| Web — public site | ✅ built (design-polished) |
| Web — admin console | ✅ built + **password-gated auth** (see §12) |

**Data as of 2026-07-29:** 12 sources — 10 resolved, 2 failed. 117 canonical POIs, 121 evidence records, 23 review-queue items (15 pending). Numbers are live — query the DB for exact.

- **2026-07-29 batch:** added 6 Delhi/Gurgaon food videos. 5 extracted+resolved (Old Delhi/Food Ranger, Sarojini/CP/Kamla-Nagar attempts by Delhi Food Walks, Gurgaon/Veggie Wander 28 entities, Hauz Khas/DLRV). Graph grew 66→117 POIs.
- **2 failed sources:** the original captions-disabled video, and `OgWEsKVIC6g` (Kamla Nagar) which **fails Stage 5 JSON parsing on both normal and `--force` runs** — a persistent malformed-extraction bug worth investigating in `llm.py` tolerant-parse / chunk-merge (the Gurgaon video hit the same error once but passed on retry, so it's partly non-deterministic).

---

## 3. Repository layout (`C:\ts`)

```
C:\ts\
  pipeline-spec.md          # architecture spec (source of truth)
  PROJECT_CONTEXT.md        # this file
  .env                      # SECRETS (gitignored) — see §8
  .env.example              # template
  .gitignore
  requirements.txt          # python deps
  .venv/                    # python virtualenv (local, not portable)

  supabase/
    config.toml             # local stack config (analytics disabled for Windows)
    seed.sql                # delhi + gurgaon destinations + 16 areas (idempotent)
    README.md
    migrations/
      20260630120000_init_schema.sql       # 12 tables, indexes, checks, triggers
      20260701120000_extend_match_type.sql # adds 'new','review' to match_type check

  pipeline/                 # python package
    config.py               # env loader (reads C:\ts\.env)
    db.py                   # psycopg3 access layer (all DB helpers)
    llm.py                  # provider-agnostic OpenAI-compatible LLM client
    normalize.py            # name normalization, slug, levenshtein, dest mapping
    stages/
      stage1_input.py       # URL validate + video_id + duplicate check
      stage2_metadata.py    # YouTube Data API v3
      stage3_gate.py        # travel-gate classifier (cheap LLM)
      stage4_transcript.py  # youtube-transcript-api (manual->auto, hi+en)
      stage5_extract.py     # extraction prompt + chunking + merge
      stage6_resolve.py     # exact/alias/fuzzy match -> POI + evidence
      stage7_enrich.py      # Google Places (New) v1 searchText -> google_* cols + verification_data
      stage8_score.py       # recommendation_score + claim rollups
  scripts/
    run.py                  # runs Stages 1–5 for one URL:  python scripts/run.py <url> [--force]
    resolve.py              # runs Stage 6 over all extracted sources
    enrich.py               # runs Stage 7 over POIs (no-op without GOOGLE_PLACES_API_KEY; --force re-fetches)
    score.py                # runs Stage 8 over all POIs

  web/                      # Next.js 16 app (public + admin)
    package.json            # scripts: dev(4321), admin(4322), build, start
    next.config.ts          # distDir = env NEXT_DISTDIR (lets 2 servers coexist)
    middleware.ts           # 404s /admin unless ADMIN_ENABLED=true; else requires valid session cookie (redirects to /admin/login)
    .env.local              # SECRETS for web (gitignored)
    lib/
      supabase.ts           # server-only admin client (service_role)
      normalize.ts          # TS mirror of normalize.py (admin POI creation)
      types.ts              # Poi type
      auth.ts               # HMAC session token + password check (runtime-agnostic: edge + node)
      session.ts            # server-only isAuthenticated() (reads cookie via next/headers)
    app/
      layout.tsx            # root: fonts + SVG liquid-glass filter def
      globals.css           # design tokens, fonts, grain, glass, animations
      page.tsx              # PUBLIC home (hero + carousel + paginated grid + areas)
      poi/[slug]/page.tsx   # PUBLIC poi detail (verdict + details + sources)
      actions.ts            # server actions (verify POI, review queue decisions)
      admin/
        layout.tsx          # admin sidebar shell (short-circuits to bare login when unauth'd; logout button)
        page.tsx            # dashboard
        sources/page.tsx
        pois/page.tsx       # list + verify
        review/page.tsx     # work the review queue (merge/create/reject)
        login/
          page.tsx          # password login form
          actions.ts        # login() / logout() server actions (set/clear session cookie)
      _components/
        ui.tsx              # PageHeader, Stat, Badge, Table
        nav.tsx             # admin NavLink (active state)
        site-header.tsx     # public liquid-glass navbar (adaptive)
        GlassSurface.tsx    # React Bits liquid-glass (RGB displacement)
        GlassSurface.css
        reveal.tsx          # motion scroll reveals
        blobs.tsx           # animated hero orbs
        photo.tsx           # procedural category tile (real photos = Stage 7)
        poi-card.tsx        # equal-height card, hover zoom
        carousel.tsx        # featured carousel (client)
        paginated-grid.tsx  # explore grid pagination (client)
    public/
      fonts/                # clash-display.woff2, general-sans.woff2 (+italic)
      hero/                 # india-gate / humayun / jama-masjid / qutub .jpg
```

---

## 4. Supabase (cloud)

- **Project ref:** `dpiyjrqltasladvprjjp`  · **Region:** ap-south-1 (Mumbai)
- **URL:** `https://dpiyjrqltasladvprjjp.supabase.co`
- **Dashboard:** https://supabase.com/dashboard/project/dpiyjrqltasladvprjjp
- **DB connection (for psql / pipeline):** use the **Session pooler (IPv4)**:
  `postgresql://postgres.dpiyjrqltasladvprjjp:<DB_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`
  ⚠️ The **direct** endpoint `db.<ref>.supabase.co:5432` is **IPv6-only** and unreachable from most local/Docker networks — always use the pooler.
- **Schema:** 12 tables — `sources, destinations, areas, points_of_interest, entity_evidence, verification_data, users, user_entities, user_submissions, entity_aliases, entity_resolution_log, resolution_review_queue`. Applied to cloud via psql; recorded in `supabase_migrations.schema_migrations`.
- ⚠️ **Free-tier projects auto-pause after ~7 days idle.** Symptom: `<ref>.supabase.co` won't resolve (NXDOMAIN) and the pooler returns "Tenant not found." Fix: open the dashboard and click **Restore/Resume**. Schema + data survive pausing.

---

## 5. Pipeline (Python)

- **Python 3.14**, venv at `C:\ts\.venv`. Deps in `requirements.txt` (python-dotenv, psycopg[binary], requests, youtube-transcript-api).
- **DB access:** psycopg3 straight to the pooler (not supabase-py). Connections must be **short-lived** — never hold one open across an LLM/network call (the pooler drops idle connections).
- **LLM is provider-agnostic** (OpenAI-compatible `/chat/completions`). Swap providers by editing 3 env vars only (`LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`). Currently using **Agnes AI** — `agnes-2.0-flash`, base `https://apihub.agnes-ai.com/v1`. `llm.py` has retries/backoff, tolerant JSON parsing, and truncation detection (`finish_reason=length`).
- **Stage 5 chunking:** transcripts > 13k chars are split into ~5-min windows (30s overlap), extracted per chunk, then merged (dedupe by name + compatible area, union claims). `extract_auto()` also falls back to chunking if a single call truncates.
- **Status flow** on `sources.status`: `pending → metadata_fetched → gated → transcript_fetched → extracted → resolved`; failures set `failed` + `failure_reason`.

**Run the pipeline:**
```bash
cd /c/ts
./.venv/Scripts/python.exe scripts/run.py "https://youtu.be/VIDEOID"   # Stages 1–5
./.venv/Scripts/python.exe scripts/resolve.py                          # Stage 6 (batch)
./.venv/Scripts/python.exe scripts/score.py                            # Stage 8 (batch)
```
Windows console note: prefix inline scripts with `PYTHONUTF8=1` (cp1252 crashes on Devanagari/emoji; `scripts/run.py` already reconfigures stdout).

---

## 6. Web app (Next.js 16)

- **Stack:** Next 16 (App Router, Turbopack) · Tailwind v4 · `@supabase/supabase-js` · `motion` (framer) · `cross-env`.
- **Two sites, one codebase:**
  - **Public** — `npm run dev` → http://localhost:4321 (no admin; middleware 404s `/admin`).
  - **Admin** — `npm run admin` → http://localhost:4322/admin (`ADMIN_ENABLED=true` + `NEXT_DISTDIR=.next-admin`). Separate build dir so both dev servers run simultaneously without clashing on `.next`.
- **Admin data access** uses the **service_role** key via `lib/supabase.ts` — **server-only** (never exposed to the browser). Mutations are server actions in `app/actions.ts`.
- **Public data** uses the anon key (server-side fetches here too, via the same admin client for simplicity in MVP).
- **Design system ("Rasta", editorial "field notes"):**
  - Self-hosted variable fonts (`public/fonts`): **Clash Display** (display) + **General Sans** (UI). Not `next/font/google` (its build-time fetch is flaky offline).
  - Palette tokens in `@theme` (globals.css): `ink #17140F`, `paper #F4EEE3`, `vermilion #EA4E1B`, `teal #0E5C55`. Use `bg-ink`, `text-vermilion`, etc.
  - Utilities: `.grain`, `.glass`/`.glass-dark`, `.liquid-glass`, `.lift`, `.kenburns`, `.no-scrollbar`.
  - **Liquid-glass navbar:** React Bits `GlassSurface` (per-RGB-channel `feDisplacementMap` refraction) with an adaptive backing so it stays visible on both dark hero and light content. Chrome only partially supports `backdrop-filter: url()`, so it falls back to frosted glass there; Firefox shows full refraction.
  - Hero uses a real licensed Delhi photo (`public/hero/india-gate.jpg`, from Wikimedia Commons) via `next/image` with a slow ken-burns zoom.

---

## 7. Prerequisites on a new device

1. **Python 3.14+**, **Node 20+** (dev used Node 24), **git**.
2. **Docker Desktop** — only needed for the *local* Supabase stack (`supabase start`); not required to work against the cloud project.
3. **Supabase CLI** — was installed as a standalone binary at `~/.local/bin/supabase.exe` (not on PATH; not in winget). Install via `scoop install supabase` or download from GitHub releases. Only needed for local stack / migrations tooling — cloud can be hit directly with psql.
4. Bootstrap:
   ```bash
   cd /c/ts
   py -m venv .venv
   ./.venv/Scripts/python.exe -m pip install -r requirements.txt
   cd web && npm install
   ```
5. Recreate the two secret files (see §8), then run pipeline / web as above.

---

## 8. Secrets (recreate `.env` files — NOT committed)

These live in `C:\ts\.env` and `C:\ts\web\.env.local` on the current device. They are gitignored, so **copy them across manually or recreate from the dashboards.** Do not paste real secret values into this doc or any committed file.

**`C:\ts\.env`:**
```
SUPABASE_URL=https://dpiyjrqltasladvprjjp.supabase.co
SUPABASE_REF=dpiyjrqltasladvprjjp
SUPABASE_ANON_KEY=<from dashboard: Settings > API>
SUPABASE_SERVICE_ROLE_KEY=<secret: Settings > API>
SUPABASE_DB_URL=postgresql://postgres.dpiyjrqltasladvprjjp:<DB_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres
YOUTUBE_API_KEY=<Google Cloud: YouTube Data API v3>
GOOGLE_PLACES_API_KEY=<not set yet — needed for Stage 7>
LLM_API_KEY=<Agnes AI key>
LLM_BASE_URL=https://apihub.agnes-ai.com/v1
LLM_MODEL=agnes-2.0-flash
LLM_GATE_MODEL=            # optional; defaults to LLM_MODEL
```

**`web/.env.local`:**
```
SUPABASE_URL=https://dpiyjrqltasladvprjjp.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<secret>
NEXT_PUBLIC_SUPABASE_URL=https://dpiyjrqltasladvprjjp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>
ADMIN_PASSWORD=<admin console password — change from the dev default>
ADMIN_SESSION_SECRET=<random 32+ byte hex, e.g. `openssl rand -hex 32`; changing it logs everyone out>
```
Dev default password currently set locally: `rasta-admin-2026` — **change before deploying.**

---

## 9. What's next (roadmap)

**Immediate / high-value**
1. **Stage 7 — Enrichment (Google Places).** ✅ *Code built* (`stage7_enrich.py` + `scripts/enrich.py`, Places API New v1 `searchText`). **Still needs `GOOGLE_PLACES_API_KEY`** to actually run — the runner no-ops without it. Once the key is set: `python scripts/enrich.py` fills lat/lng-less google_* columns (rating, hours, phone, website, photos, business status) + logs price_level conflicts to `verification_data`. Never overwrites AI claims. ~$17/1k lookups; ~$1–2 for current POIs. **NB:** searchText does not populate lat/lng into a column yet — location comes back in the API response but there are no `lat`/`lng` columns on the POI table (only in spec). Add columns if map display is needed.
2. **Real POI photos** on cards / POI hero (from Places `google_photos` refs at Stage 7 — needs a Places photo-media fetch/proxy — or an Unsplash key). Currently procedural category tiles. Web display does not yet read the `google_*` columns.
3. **Process more videos** to grow the graph and make the frequency signal meaningful. (Batch of 6 Delhi/Gurgaon food videos added 2026-07-29 — see §2.)

**Before any deploy**
4. **Admin authentication.** ✅ *Done* — signed-cookie password gate (§12). Still single shared credential; upgrade to Supabase Auth if multiple admins / audit trail needed.
5. **Deploy** (Vercel). Decide: two projects (public/admin) or one with env-gated routes. Set `ADMIN_ENABLED`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` on the admin deployment.

**Quality / correctness**
6. Entity-resolution improvements: alias learning from manual reviews, better fuzzy/cross-video merging, drop generic listicle entries ("Water Parks in Delhi NCR"), geo-proximity matching.
7. Verify the scoring weights once there's more data; tune `FREQUENCY_CAP`.

**Design polish (optional)**
8. Per-city hero rotation (4 Delhi images already downloaded), guaranteed Chrome glass refraction via canvas/WebGL if the fallback isn't enough, more micro-interactions.

**Deferred per spec (Phase 2+)**
9. Transportation layer, seasonality, activity entity type, blog/article ingestion, community verification, credit system, end-user auth.

---

## 10. Gotchas / lessons (so we don't relearn them)

- **Supabase free project auto-pauses (~7 days idle)** → restore in dashboard; DNS NXDOMAIN + "tenant not found" is the tell.
- **Use the IPv4 session pooler**, not the IPv6-only direct DB endpoint.
- **Never hold a DB connection open across an LLM call** — pooler drops it (`server closed the connection unexpectedly`). Open connections per-operation.
- **Windows console is cp1252** → force UTF-8 (`PYTHONUTF8=1`; `run.py` reconfigures stdout) or Devanagari/emoji crash prints.
- **`TaskStop` on `npm run dev` leaves an orphan node** holding the port → next start = `EADDRINUSE`. Kill by port: PowerShell `Get-NetTCPConnection -LocalPort 4321 | Stop-Process`.
- **Two dev servers need separate `NEXT_DISTDIR`** or they clash on `.next`.
- **Extraction truncates on many-entity videos** (output token cap) → chunking handles it (`extract_auto`).
- **Gate prompt must score by *entity extractability*** (food/place reviews = high), else the model wrongly rejects food videos as "not travel."
- **Chrome `backdrop-filter: url()` support is partial** → liquid glass falls back to frosted; full refraction shows in Firefox.
- **Public site must never link to admin** (it doesn't); admin is now password-gated (§12).
- **macOS vs Windows (project moved to `/Users/admin/Downloads/ts`):** the committed `.venv/` (Windows `Scripts/` layout) and `web/node_modules/` (Windows `@next/swc-win32` binary) are **not portable**. On mac: make a fresh venv (`python3 -m venv .venv-mac`) and re-run `npm install` in `web/` (swaps in `@next/swc-darwin-*`). Copied `node_modules` also carries `com.apple.quarantine` xattrs that block execution (`bad interpreter: Operation not permitted`) — `xattr -dr com.apple.quarantine node_modules` or just reinstall. Only Python 3.9 is on this mac (spec wants 3.14); pipeline runs on 3.9 because every module uses `from __future__ import annotations`.
- **Kill a stuck dev server by port on mac:** `lsof -ti tcp:4322 | xargs kill -9` (the Windows `Get-NetTCPConnection` equivalent).

---

## 11. Quick resume checklist

```bash
# 0. If the Supabase project is paused, restore it in the dashboard first.
# 1. Bootstrap (new device only)
cd /c/ts && py -m venv .venv && ./.venv/Scripts/python.exe -m pip install -r requirements.txt
cd web && npm install && cd ..
# 2. Recreate .env and web/.env.local (see §8)
# 3. Run the web apps
cd web
npm run dev     # public  -> http://localhost:4321
npm run admin   # admin   -> http://localhost:4322/admin
# 4. Run the pipeline on a new video
./.venv/Scripts/python.exe scripts/run.py "<youtube url>"
./.venv/Scripts/python.exe scripts/resolve.py
./.venv/Scripts/python.exe scripts/score.py
# 5. (optional) enrich with Google Places — only runs if GOOGLE_PLACES_API_KEY is set
./.venv/Scripts/python.exe scripts/enrich.py
```

**macOS equivalent** (this device — see §10): use `python3 -m venv .venv-mac` then
`./.venv-mac/bin/python scripts/run.py ...`; `cd web && npm install` to swap in the
darwin SWC binary; kill dev servers with `lsof -ti tcp:4322 | xargs kill -9`.

---

## 12. Admin auth (password gate)

The admin console (`:4322`) is gated by a **signed, expiring session cookie** —
chosen over Supabase Auth because the console uses the `service_role` key and
bypasses RLS entirely, so auth here is purely a login gate (RLS isn't in play).
Single shared credential; upgrade to Supabase Auth if you need multiple admins,
per-user audit trail, or to reuse it for Phase-2 end-user auth.

- **Two gates on `/admin`** (`web/middleware.ts`): (1) port gate — 404 unless
  `ADMIN_ENABLED=true` (so the public `:4321` server never exposes admin); (2)
  auth gate — every `/admin/*` route except `/admin/login` needs a valid session
  cookie, else redirect to `/admin/login`.
- **`web/lib/auth.ts`** — runtime-agnostic (Web Crypto HMAC-SHA256 + base64url,
  no `next/headers`), so it works in BOTH the Edge middleware and Node server
  actions. `createSessionToken()` (7-day expiry), `verifySessionToken()` (fails
  closed on bad sig / expiry / garbage), `verifyPassword()` (constant-time-ish vs
  `ADMIN_PASSWORD`, fails closed if unset).
- **`web/lib/session.ts`** — server-only `isAuthenticated()` reading the cookie
  via `next/headers`; used by `admin/layout.tsx` to render the login page bare
  (no sidebar / no DB counts) when signed out. Defense-in-depth behind middleware.
- **`web/app/admin/login/`** — `page.tsx` (password form) + `actions.ts`
  (`login()` sets the httpOnly cookie then redirects to `/admin`; `logout()`
  clears it). Sign-out button lives in the admin sidebar.
- **Env** (`web/.env.local`, §8): `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`.
  Rotating the secret invalidates all existing sessions.
- **Verified 2026-07-29:** unauth'd `/admin` + `/admin/pois` → 307 `/admin/login`;
  login page → 200; token sign/verify + password logic unit-tested (7/7 incl.
  tampered/expired/empty rejection). Note: server actions can't be driven by a
  plain curl POST (they need the RSC action protocol) — test login end-to-end in
  a browser.
