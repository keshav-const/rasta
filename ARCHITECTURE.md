# Rasta — data pipeline & graph architecture

How the **data** behind Khoj is built: the cultural-graph model, the extraction pipeline, the
sources, and the engineering that makes it fast and robust. This is the "understand the whole data
product" narrative; [`pipeline-spec.md`](./pipeline-spec.md) is the stage-by-stage spec and
[`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md) is the living status.

> **Two repos, one product.** This repo (`rasta`/`ts`) *builds* the graph (Python, batch, offline).
> The `rasta-api` repo *serves* it (Go, always-on). They share one Supabase Postgres database.
> See `rasta-api/ARCHITECTURE.md` for the serving side.

---

## 1. What Rasta is

A **verified cultural graph of India**: real places *and* living traditions (crafts, festivals,
cuisines, folk sports, dances…), where **every claim cites its source**. The moat isn't the places
— it's that each fact is backed by a real creator/source you can inspect ("receipts"), and that
culture is modeled as a first-class citizen, not just restaurants and hotels.

Numbers today: ~4,900 active entities, ~570 destinations, 4 source platforms (YouTube, Wikipedia,
blogs, podcasts), ~96% of physical places geocoded.

---

## 2. The data model (why it's a *graph*, not a list)

Five layers in Supabase Postgres:

- **`destinations`** — anchors: country / state (`region`) / city. Everything hangs off a
  destination. Carries official stats (e.g. tourist visits) in a `jsonb` column.
- **`points_of_interest`** — the entities. One `entity_type`:
  - physical: `poi`, `activity` (have lat/lng)
  - cultural (anchored to a *region*, no pin): `art_form`, `performing_art`, `craft`, `festival`,
    `cuisine`, `dish`, `sport`, `cultural` (generic catch-all)
  - Carries aggregated intelligence (specialities, tips, price level) + scores.
- **`sources`** — one row per ingested thing (a video, article, episode, wiki page). Platform,
  url, creator, date, the raw transcript/text, and the immutable `raw_extraction` jsonb.
- **`entity_evidence`** — **the moat**: the many-to-many link between an entity and the sources
  that mention it. Each row has a `stance` (recommended/mentioned/warned_against/mixed) and a
  `claims` jsonb array — each claim is `{field, value, evidence, timestamp_seconds, confidence}`.
- **`verification_data`**, resolution/review tables — bookkeeping.

**Why a graph?** Because the valuable questions are relational: *which sources back this place, how
much do they agree, across how many platforms, how recent* — that's exactly what the API's **trust**
and **freshness** signals compute from `entity_evidence` + `sources`. A flat list of places couldn't
answer them.

**Why cultural entities anchored to a region (no lat/lng)?** Kathakali isn't a pin — it's a Kerala
tradition. Modeling it as a region-anchored entity lets it carry the same sourced claims and dedupe
the same way as a place, while being honest that it has no coordinate.

---

## 3. The pipeline — 8 stages

Every source runs through the same stages (`pipeline/stages/stage1…stage8`), orchestrated by
`scripts/run.py` (one video) or the shared text backbone (everything else):

1. **input** — identify the source (URL/id).
2. **metadata** — fetch title, creator, date, etc. (and upsert a `sources` row).
3. **gate** — an LLM classifier: *is there extractable travel/culture here?* Scores both named
   places **and** region-anchored traditions as wanted. Junk (recipes with no place, unboxings)
   scores low and stops here. Curated adapters (blogs/wiki) **skip** the gate (`trust_source=True`)
   because it's tuned for terse YouTube metadata and mis-scores messy HTML.
4. **transcript** — for video, fetch captions (`youtube-transcript-api`); for audio, local Whisper.
5. **extract** — the core LLM call (`gpt-4o-mini`): turn the text into structured entities + claims
   + evidence. One call per source. The immutable result is stored in `sources.raw_extraction`.
6. **resolve** — match each extracted entity to a canonical `points_of_interest` row (next section).
7. **enrich** — (dormant) Google Places for prices/timings; deferred on cost.
8. **score** — recompute `recommendation_score` for affected entities (section 6).

**Why a gate before extract?** The extract LLM call costs money and tokens; the gate is a cheap
filter so we only pay to extract sources that actually contain places/culture.

---

## 4. Sources — one backbone, four adapters

All non-video sources run through **one function**, `pipeline/ingest.py → ingest_text_source()`,
which does gate → extract → persist for any text. So every adapter reuses the *same* extractor and
model, and a new source type is a thin adapter, not a new pipeline.

| source | adapter | how it gets text |
|---|---|---|
| **YouTube** | `scripts/run.py <url>` | captions via `youtube-transcript-api` |
| **Wikipedia/Wikivoyage** | `scripts/ingest_wikipedia.py` | MediaWiki API (title / category / search) |
| **Blogs** | `scripts/ingest_blog.py` | fetch + crude readability HTML→text |
| **Podcasts** | `scripts/ingest_podcast.py` | download audio → ffmpeg → **local faster-whisper** |
| **Open gov** | `scripts/enrich_tourist_stats.py` | data.gov.in stats → `destinations.stats` |

**Why local Whisper for podcasts (not a paid API)?** A paid per-minute transcription API blew
through a month's budget in one test. `faster-whisper` on CPU is $0 — audio never leaves the
machine; only the text extraction uses the (cheap) LLM.

**The curated batch runner** (`scripts/run_batch.sh` + lists in `scripts/batches/`) themes
ingestion (cuisines, sports, dances, crafts, monuments, nature, pilgrimage…) and sets the OpenAI
env so extraction isn't capped. Video lists are curated with `yt-dlp ytsearch` for real IDs.

---

## 5. Resolution — turning extractions into canonical entities

Stage 6 (`scripts/resolve.py` / `stage6_resolve.py`) takes each extracted entity and either matches
it to an existing `points_of_interest` row or creates a new one, so "Golden Temple" mentioned by 9
sources becomes **one** entity with 9 evidence rows — not 9 duplicates. The match ladder:
**exact** normalized-name → **alias** → **fuzzy** (with a review queue for low-confidence /
ambiguous / unknown-destination / unknown-type cases). It also auto-seeds new destinations.

Only certain `entity_type`s are *resolvable* — the physical types plus the region-anchored cultural
types (that allow-list is how we added `sport` as a first-class type: migration + resolver
allow-list + extractor prompt).

**Why a review queue instead of auto-accepting fuzzy matches?** To keep the graph clean — a wrong
merge corrupts an entity's evidence. Borderline matches wait for a human rather than guess.

---

## 6. Scoring

`recommendation_score = 0.30·frequency + 0.20·recency + 0.20·sentiment + 0.15·authority +
0.15·depth`. It answers *how good is this place* — distinct from the API's **trust** (how
well-sourced) and **freshness** (how current), which are computed at serve time. `frequency_count`
(distinct sources) and the score are stored columns the API reads directly.

---

## 7. Geocoding

Physical places (`poi`/`activity`) get coordinates from a **concurrent, multi-provider** pass
(`scripts/hackathon_export/geocode_pois.py`): Photon · Nominatim · LocationIQ · Geoapify run **in
parallel** (one worker each, throttled to its own rate limit), misses retry on a *different*
provider, and permanent failures are marked so they're never retried. Results are bbox-checked
against India.

**Why multiple providers instead of parallelizing one?** Free geocoders ban parallel hits to a
single service; running N providers concurrently multiplies throughput *without* tripping any one's
limit. This took coverage 86% → ~97%.

---

## 8. The engineering war-stories (the senior signal)

These are the hard problems, and the kind of thing worth talking about in an interview:

- **Bulk scoring — ~37 min → ~42 s (~50×).** `score.py` originally reconnected to the DB twice
  *per POI* (~7,400 round-trips). Scoring is pure computation, so it now fetches all POIs + evidence
  in two queries over **one** connection, scores in memory, and writes back with one batched update.
- **Concurrent multi-provider geocoding** (section 7).
- **Transcript robustness.** YouTube IP-blocks bulk transcript pulls, and the library had **no
  timeout** — one dead socket once froze a whole batch for ~2 h. Fix: a timeout-enforcing HTTP
  session (connect 10s / read 20s) so a stall fails fast, **plus** a hard per-video subprocess
  timeout in the drain. Plus a global min-interval **pacing** throttle (shared across processes via
  a timestamp file) to stay under the per-IP rate limit, and a self-backoff auto-retry for blocked
  videos.
- **Podcast optimization.** Re-runs were re-downloading + re-transcribing episodes already in the
  graph (the ~1.5 h waste). Fix: **dedup before transcribe** (skip already-ingested by audio URL),
  an ffmpeg duration cap so one long episode can't run for hours, and faster greedy Whisper.

**The connection rule** (shared with the API): the Supabase **session pooler** drops idle
connections, so you must **never hold a DB connection across a network/LLM call**. `pipeline/db.py`
uses short-lived `psycopg` connections for exactly this reason — *except* `score.py`'s pure-compute
pass, which safely holds one connection because it does no network/LLM work in between.

---

## 9. How the data reaches the API

They share **one Supabase Postgres database**. The pipeline writes `points_of_interest`,
`entity_evidence`, `sources`, `destinations`; the Go API reads them. There's no sync step or API
between them — the database *is* the interface. So after any ingestion you run the consolidation —
`resolve.py → score.py → geocode_pois.py` — and the new entities are immediately queryable through
the live API (trust/freshness recomputed per request from the fresh evidence).

Schema changes live in `supabase/migrations/` (timestamped `.sql`), applied against the live DB.
Both the graph tables and the API's `api_keys` table live here.

---

## 10. Running it (quick reference)

```bash
# ingest (any mix of sources)
python scripts/run.py "https://youtu.be/..."
bash scripts/run_batch.sh wikipedia scripts/batches/<list>.txt
bash scripts/run_batch.sh blog      scripts/batches/<list>.txt
PODCAST_LIMIT=2 bash scripts/run_batch.sh podcast scripts/batches/<list>.txt
bash scripts/run_batch.sh video     scripts/batches/<list>.txt   # yt-dlp-curated IDs

# consolidate (fold new sources into the live graph)
python scripts/resolve.py && python scripts/score.py && \
  python scripts/hackathon_export/geocode_pois.py
```

Secrets (`SUPABASE_DB_URL`, the LLM key, optional geocoder/data.gov keys) live in a gitignored
`.env`. The LLM routes to OpenAI `gpt-4o-mini` for extraction (batch scripts export the OpenAI env;
the default is Gemini, which has caps).

---

## 11. One-paragraph summary

Media (YouTube, Wikipedia, blogs, podcasts) flows through one pipeline — **gate → extract →
resolve → score** — that turns it into a **graph** of places and traditions where every claim links
to its source. An LLM does the language work (gate + extract); deterministic code does the matching,
scoring, and geocoding. The whole thing is tuned for scale and robustness (50× scoring, concurrent
geocoding, hang-proof transcripts, free local audio), writes to one Supabase database, and that
same database is read live by the Go API — so the moat (sourced, verifiable culture) flows straight
from a creator's video to a developer's API call.
