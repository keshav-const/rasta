# Rasta — a verified cultural travel graph of India

Rasta turns travel & culture media into a **ranked, structured knowledge graph** where
**every place and tradition cites its sources.** Real places, real art forms, sourced
claims — no SEO slop, no fake reviews.

It started as an NCR (Delhi/Gurgaon) travel aggregator and has grown into an
India-wide, multi-source **cultural graph**: not just *places*, but the art forms,
crafts, folk festivals, dances and cuisines that are anchored to those places.

> **Status:** data pipeline + graph are live and growing, and the monetised Go REST API
> over this graph now ships — API-key auth + plans, Redis rate-limiting, a developer portal,
> and a Razorpay paywall are all built (see [Roadmap](#roadmap)).

---

## The graph at a glance

| metric | value |
|---|---|
| active entities | **8,136** |
| — cultural entities | **~1,800** (art forms, crafts, festivals, cuisines, dances, folk sports, traditions) |
| destinations (cities + regions) | **870** |
| geocoded (physical places) | **~93%** |
| sources | **1,454** across **4** platforms — Wikipedia 751 · YouTube 409 · blogs 267 · podcasts 27 |
| sourced claims | **~10,000** |
| state destinations w/ official tourist-visit stats | 24 |

*(numbers are live — query the DB for exact counts)*

---

## What makes it a **cultural** graph

Most travel data is places-only. Rasta models culture as a first-class citizen.
Every entity is one of these `entity_type`s, each anchored to a region/destination:

| kind | `entity_type` | anchored to | examples |
|---|---|---|---|
| physical place | `poi`, `activity` | exact lat/lng | temples, cafés, markets, viewpoints |
| visual art | `art_form` | region | Gond, Phad, Pattachitra, Madhubani |
| performing art | `performing_art` | region | Chhau, Theyyam, Kathakali, Kuchipudi |
| craft | `craft` | craft village / region | Channapatna toys, Bidriware, Pashmina |
| festival | `festival` | place + season | Bihu, Bastar Dussehra, Thrissur Pooram |
| food | `cuisine`, `dish` | region | regional cuisines & signature dishes |
| tradition (generic) | `cultural` | region | tribes, communities, unlabelled traditions |

Cultural entities carry the same sourced claims as places (origin region, materials,
UNESCO/GI status, season, where to experience) and dedupe/score the same way — they
just anchor to their region's (geocoded) destination instead of a pin.

---

## Sources

All non-video sources run through one shared backbone (`pipeline/ingest.py →
ingest_text_source`), so they reuse the **same gate + extractor** as videos.

| source | adapter | notes |
|---|---|---|
| **YouTube** | `scripts/run.py <url>` | transcript via `youtube-transcript-api`; self-paced to avoid IP blocks |
| **Wikipedia / Wikivoyage** | `scripts/ingest_wikipedia.py` | by title / `--category` / `--search`; authoritative, culture-dense |
| **Blogs / articles** | `scripts/ingest_blog.py` | listicles & guides |
| **Podcasts** | `scripts/ingest_podcast.py` | audio shows, transcribed **locally** with faster-whisper (no API cost) |
| **Open gov (data.gov.in)** | `scripts/enrich_tourist_stats.py` | official state tourist-visit stats → `destinations.stats` |

---

## Pipeline

```
stage1 input → stage2 metadata → stage3 travel/culture gate → stage4 transcript
→ stage5 AI extraction → stage6 entity resolution → stage7 enrichment (Google Places, dormant)
→ stage8 scoring
```

- **Gate (stage3):** scores both named places *and* region-anchored culture as extractable.
- **Extraction (stage5):** `gpt-4o-mini`, one call per source; places + cultural entities with claims + evidence.
- **Resolution (stage6):** exact → alias → fuzzy match into canonical entities; auto-seeds new destinations.
- **Scoring (stage8):** `0.30·frequency + 0.20·recency + 0.20·sentiment + 0.15·authority + 0.15·depth`.

### Running it

```bash
# ingest (any mix of sources)
python scripts/run.py "https://youtu.be/..."
python scripts/ingest_wikipedia.py "Gond painting" "Kalaripayattu" --site wikipedia
python scripts/ingest_blog.py "https://.../best-folk-festivals-india"
python scripts/ingest_podcast.py "<rss-url>" --limit 2

# consolidate (fold new sources into the graph)
python scripts/resolve.py            # resolve extracted sources → canonical entities
python scripts/score.py              # recompute recommendation scores
python scripts/hackathon_export/geocode_pois.py   # add coordinates (multi-provider)

# one-off enrichment
python scripts/enrich_tourist_stats.py            # official state visitor stats
```

---

## Engineering highlights

Recent work focused on making the consolidation flow fast and robust at scale:

- **Bulk scoring — ~37 min → ~42 s (≈50×).** `score.py` reconnected to the DB twice
  *per POI* (~7,400 round-trips). Scoring is pure computation, so it now fetches all
  POIs + evidence in two queries over one connection, scores in memory, and writes
  back with one batched update.
- **Concurrent multi-provider geocoding — ~93% coverage.** Free geocoders cap
  throughput and ban parallel hits to a single service, so `geocode_pois.py` runs
  **Photon · Nominatim · LocationIQ · Geoapify** concurrently (one worker each,
  throttled to its own limit), retries misses on a *different* provider, and marks
  permanent failures so they're never re-tried. Keyless out of the box; faster with keys.
  Those lat/lng power the API's radius (`near`+`radius_km`) and bounding-box (`bbox`) map queries.
- **Transcript pacing + hands-off auto-retry.** A global min-interval throttle keeps
  YouTube transcript pulls under the per-IP rate limit; `auto_retry_blocked.sh`
  recovers IP-blocked videos automatically, backing off during blocks.
- **Free podcast transcription.** Swapped a paid per-minute Whisper API for local
  `faster-whisper` (CPU) after it proved too costly.

---

## Stack

- **Pipeline:** Python 3.9, `psycopg` (Supabase Postgres, session pooler), OpenAI-compatible
  LLM client (`gpt-4o-mini` for extraction), `faster-whisper` + `ffmpeg` for podcast audio.
- **Data:** Supabase Postgres — canonical entities, evidence, destinations, sources,
  resolution/review tables.
- **Geocoding:** Photon · Nominatim (keyless) + LocationIQ · Geoapify (free tiers).
- **Web:** Next.js app in `web/` (public site + admin console).

Secrets live in a gitignored `.env` (DB URL, LLM key, optional geocoder + data.gov.in keys).

---

## Roadmap

**Rasta API** — a scalable, monetised Go REST API serving this verified graph as a
developer data product — is now built (`chi` + `pgx`/`sqlc` + `go-redis`):

- ✅ **Go API core** — `/v1/places`, `/v1/entities?type=festival`, `/v1/cities`, `/v1/stats`,
  cursor pagination, plus radius (`near`+`radius_km`) and bounding-box (`bbox`) map queries.
- ✅ **Scalable layer** — API-key auth → plans, Redis rate-limiting + anti-scraping,
  ETag/304 caching, tests + GitHub Actions CI.
- ✅ **Developer portal** — Supabase-Auth signup/login, a dashboard that creates/revokes
  API keys and shows per-key usage, Scalar-rendered docs.
- ✅ **Razorpay paywall** — Free / Pro / Enterprise plans, subscription + webhook → plan
  flip (functionality complete; live Razorpay keys to be added to activate).
- ⏳ Still pending: the consumer site (M5) and final polish (M6).

See [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md) and [`pipeline-spec.md`](./pipeline-spec.md)
for the architectural source-of-truth.
