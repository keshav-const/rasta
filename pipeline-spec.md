# Travel Intelligence Engine — Extraction Pipeline Specification

**Version:** 0.1-MVP  
**Scope:** Delhi + Gurgaon (NCR region)  
**Date:** June 2026

---

## Pipeline Overview

```
User shares YouTube URL (or founder seeds URL during test phase)
                    │
                    ▼
        ┌─── STAGE 1: INPUT & VALIDATION ───┐
        │  • URL validation (youtube.com/youtu.be only)
        │  • Extract video_id
        │  • Duplicate check (already processed?)
        └──────────────┬─────────────────────┘
                       ▼
        ┌─── STAGE 2: METADATA FETCH ────────┐
        │  • Title, description, duration
        │  • Views, likes, channel info
        │  • Upload date, language hints
        └──────────────┬─────────────────────┘
                       ▼
        ┌─── STAGE 3: TRAVEL GATE (cheap model) ─┐
        │  • Is this travel/food content?          │
        │  • Travel score (0-1)                    │
        │  • If < 0.3 → REJECT, save credits       │
        │  • Estimated entity density               │
        └──────────────┬─────────────────────────┘
                       ▼
        ┌─── STAGE 4: TRANSCRIPT RETRIEVAL ──┐
        │  • Prefer manual captions           │
        │  • Fallback to auto-generated       │
        │  • Language detection                │
        │  • If no transcript → REJECT        │
        └──────────────┬─────────────────────┘
                       ▼
        ┌─── STAGE 5: AI EXTRACTION (main model) ──┐
        │  • Structured entity extraction             │
        │  • Claims with evidence + timestamps        │
        │  • Stance detection (recommend/warn)        │
        │  • Confidence scoring                       │
        └──────────────┬──────────────────────────┘
                       ▼
        ┌─── STAGE 6: ENTITY RESOLUTION ─────┐
        │  • Normalize names                   │
        │  • Match against existing canonical  │
        │  • Fuzzy match + geo-proximity       │
        │  • Google Places API verification    │
        │  • Create / merge / flag for review  │
        └──────────────┬─────────────────────┘
                       ▼
        ┌─── STAGE 7: ENRICHMENT ────────────┐
        │  • Google Places: hours, rating,     │
        │    photos, address, phone            │
        │  • Geocoding: lat/lng                │
        │  • Fill verification layer           │
        └──────────────┬─────────────────────┘
                       ▼
        ┌─── STAGE 8: STORAGE & SCORING ─────┐
        │  • Store raw extraction (never delete)│
        │  • Update canonical entities          │
        │  • Recalculate recommendation scores  │
        │  • Update evidence layer              │
        └──────────────────────────────────────┘
```

---

## STAGE 1: Input & Validation

**Purpose:** Security gate. Accept only known-safe URLs.

```
Input:  Raw URL string from user
Output: { video_id, platform, is_valid, is_duplicate }
```

**Rules:**
- Allow ONLY: `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`
- Extract `video_id` via regex
- Check `sources` table: if video_id already processed, return existing data (no reprocessing)
- Reject everything else (no arbitrary URLs — prevents SSRF)

**Cost:** Zero (no API calls)

---

## STAGE 2: Metadata Fetch

**Purpose:** Get video context before spending on extraction.

```
Input:  video_id
Output: {
  title, description, channel_name, channel_subscribers,
  duration_seconds, view_count, like_count,
  upload_date, default_language, tags[]
}
```

**Implementation:** YouTube Data API v3 (`videos.list` with `snippet,statistics,contentDetails`)
- Free tier: 10,000 units/day (each videos.list call = ~3 units)
- That's ~3,000 video lookups/day on free tier — plenty for MVP

**Store immediately in `sources` table** — even if we reject the video later, metadata is useful.

---

## STAGE 3: Travel Gate (Cheap Model)

**Purpose:** Don't waste extraction credits on non-travel content.

```
Input:  { title, description, tags, channel_name, duration }
Output: { is_travel: bool, travel_score: 0.0-1.0, content_type: string, estimated_entities: int }
```

**Model:** Use the cheapest available model (GPT-4o-mini, Haiku, etc.)

**Prompt (short, fast, cheap):**

```
Analyze this YouTube video metadata and determine if it contains
extractable travel, food, or local experience information.

Title: {title}
Description: {description (first 500 chars)}
Channel: {channel_name}
Tags: {tags}
Duration: {duration_seconds}s

Respond in JSON only:
{
  "is_travel": true/false,
  "travel_score": 0.0-1.0,
  "content_type": "food_guide|travel_vlog|city_guide|hotel_review|attraction_review|listicle|other",
  "estimated_entities": <number>,
  "primary_destinations": ["city/area names detected"],
  "reasoning": "one line"
}
```

**Gate logic:**
- travel_score < 0.3 → REJECT (not travel content)
- travel_score 0.3-0.5 → ACCEPT but flag as low-yield
- travel_score > 0.5 → ACCEPT
- duration < 15 seconds → REJECT (too short for meaningful extraction)
- duration > 3600 seconds → FLAG (may need chunking)

**Cost:** ~$0.001 per video (cheap model, tiny prompt)

---

## STAGE 4: Transcript Retrieval

**Purpose:** Get the actual text content for extraction.

```
Input:  video_id, default_language
Output: { transcript_text, transcript_source, language, has_timestamps }
```

**Implementation:** `youtube-transcript-api` (Python library)
- Try manual captions first (higher quality)
- Fallback to auto-generated
- For Hindi videos: try both Hindi and English tracks (many Indian creators have both)
- Store raw transcript in `sources.transcript`

**Language handling for Delhi/Gurgaon:**
- Expect heavy Hindi-English code-switching ("yeh place bohot amazing hai")
- Auto-captions will mangle Hindi proper nouns — the extraction prompt must account for this
- Store detected language for downstream prompt tuning

**If no transcript available → STOP** (can't extract without text)

---

## STAGE 5: AI Extraction — THE CORE PROMPT

**Purpose:** Transform unstructured transcript into structured entity data.

**Model:** Best available model (GPT-4o or equivalent) — this is where quality matters.

### Extraction Output Schema (v1.0)

```json
{
  "schema_version": "1.0",
  "source_video_id": "string",
  "extraction_metadata": {
    "model_used": "string",
    "extraction_timestamp": "ISO-8601",
    "transcript_language": "string",
    "transcript_quality": "good|fair|poor",
    "overall_extraction_confidence": 0.0-1.0
  },
  "video_context": {
    "is_travel": true,
    "travel_score": 0.0-1.0,
    "content_type": "food_guide|travel_vlog|city_guide|listicle|review|vlog|other",
    "creator_intent": "guide|review|experience|comparison|listicle|vlog",
    "primary_destinations": [
      {
        "name": "Delhi",
        "type": "city",
        "areas_covered": ["Chandni Chowk", "Connaught Place"]
      }
    ],
    "video_summary": "Brief 1-2 line summary of what this video covers"
  },
  "entities": [
    {
      "temp_id": "e1",
      "raw_name": "Karim's",
      "raw_name_local": "करीम",
      "normalized_name": "Karims",
      "entity_type": "poi",
      "poi_category": "restaurant|cafe|bar|street_food|attraction|monument|market|hotel|hostel|shop|park|temple|mosque|museum|viewpoint|other",
      "activity_type": null,

      "location": {
        "destination": "Delhi",
        "area": "Jama Masjid",
        "geo_hints": ["near Jama Masjid gate 1", "Matia Mahal road"],
        "address_if_mentioned": null
      },

      "stance": "recommended|mentioned|warned_against|mixed",
      "recommendation_strength": 0.0-1.0,
      "extraction_confidence": 0.0-1.0,

      "claims": [
        {
          "field": "speciality",
          "value": "mutton burra kebab",
          "evidence": "you HAVE to try their mutton burra, it's the best in old delhi",
          "timestamp_seconds": 245,
          "confidence": 0.95
        },
        {
          "field": "price_level",
          "value": "budget",
          "evidence": "a full plate is like 250-300 rupees only",
          "timestamp_seconds": 260,
          "confidence": 0.9
        },
        {
          "field": "best_time",
          "value": "afternoon",
          "evidence": "go for lunch, they close by 9-10 at night",
          "timestamp_seconds": 270,
          "confidence": 0.7
        },
        {
          "field": "closing_hours",
          "value": "21:00-22:00",
          "evidence": "they close by 9-10 at night",
          "timestamp_seconds": 270,
          "confidence": 0.6
        },
        {
          "field": "crowd_level",
          "value": "very crowded",
          "evidence": "there's always a huge line, especially on weekends",
          "timestamp_seconds": 290,
          "confidence": 0.85
        },
        {
          "field": "tip",
          "value": "sit upstairs for better experience",
          "evidence": "pro tip, go upstairs, less crowded and AC section",
          "timestamp_seconds": 310,
          "confidence": 0.8
        }
      ],

      "attributes": {
        "cuisine": ["mughlai", "kebabs"],
        "dietary_info": ["non-veg"],
        "ambiance": ["busy", "historic"],
        "payment": null
      },

      "flags": [],
      "flag_reasons": []
    }
  ],

  "routes_mentioned": [
    {
      "description": "Walking route through Chandni Chowk food lane",
      "waypoints": ["e1", "e2", "e3"],
      "transport_mode": "walking",
      "approximate_duration": "2-3 hours"
    }
  ],

  "general_tips": [
    {
      "applies_to": "Chandni Chowk",
      "tip": "Visit on weekday mornings to avoid crowds",
      "evidence": "weekends mein bohot bheed hoti hai, weekday jao",
      "timestamp_seconds": 890
    }
  ]
}
```

### The Extraction Prompt

```
You are a travel intelligence extraction system. Your job is to analyze
a YouTube video transcript about travel/food content and extract every
actionable piece of travel knowledge into a structured format.

CONTEXT:
- Video Title: {title}
- Creator: {channel_name}
- Upload Date: {upload_date}
- Video Type: {content_type} (from Stage 3)
- Primary Location: {primary_destinations} (from Stage 3)
- Transcript Language: {language}

CRITICAL RULES:
1. Extract EVERY distinct place, restaurant, cafe, attraction, hotel, 
   or notable location mentioned by name.
2. For each entity, capture the creator's STANCE — are they recommending 
   it, just mentioning it, or warning against it? A creator saying 
   "skip this place" or "it's overrated" is a warned_against stance.
3. Every factual claim (hours, prices, specialties, tips) MUST include 
   the exact evidence quote from the transcript and the approximate 
   timestamp in seconds. This is non-negotiable — claims without 
   evidence are useless.
4. This transcript may contain Hindi-English code-switching. Proper 
   nouns may be transliterated inconsistently or garbled by auto-captions. 
   If you can infer the likely correct name, provide it in normalized_name 
   and note the uncertainty in flags. If the name in the transcript is:
   - "cream" but context suggests a restaurant near Jama Masjid → 
     likely "Karim's", flag as name_uncertain
   - "paranthe wali gali" → this IS the name (Paratha Wali Gali), 
     not a garbled version
5. If a creator mentions a place exists but gives no recommendation 
   (e.g., "you'll also see X on this street"), stance = "mentioned" 
   and recommendation_strength should be low (0.1-0.3).
6. For Hindi text, provide raw_name_local in Devanagari if you can 
   reconstruct it. This helps with deduplication.
7. Do NOT extract generic location references like "this city" or 
   "the market" unless you can resolve them to a specific named place.
8. Do NOT hallucinate details not present in the transcript. If hours 
   aren't mentioned, don't guess them. Only extract what the creator 
   actually said.
9. Capture general area/destination-level tips separately in 
   general_tips — these are valuable even when not tied to a specific POI.
10. If the creator describes a walking/driving route connecting 
    multiple places, capture it in routes_mentioned.

CONFIDENCE SCORING GUIDE:
- 0.9-1.0: Creator explicitly names and recommends with specific details
- 0.7-0.89: Creator names and gives opinion but fewer details
- 0.5-0.69: Place is named but context is thin or ambiguous
- 0.3-0.49: Name might be garbled, or reference is very brief
- Below 0.3: Don't include — too uncertain to be useful

ENTITY TYPES:
- poi: A specific physical location (restaurant, cafe, monument, etc.)
- activity: Something you DO, not a place (paragliding, street food walk, etc.)
- destination: A city or large area (only if video discusses travel TO there)
- area: A neighborhood or district within a city

POI CATEGORIES (for entity_type=poi):
restaurant, cafe, bar, street_food, bakery, sweet_shop, attraction,
monument, market, hotel, hostel, shop, park, temple, mosque, gurudwara,
museum, viewpoint, mall, coworking, salon, other

CLAIM FIELDS (use these consistently):
speciality, must_try_item, price_level, average_cost, opening_hours,
closing_hours, best_time, worst_time, crowd_level, waiting_time,
parking, accessibility, tip, warning, seasonal_note, dress_code,
reservation_needed, payment_modes, contact, website

TRANSCRIPT:
---
{transcript_text}
---

Respond with ONLY valid JSON matching the schema. No markdown, no 
explanation, no preamble.
```

### Handling Long Transcripts

For videos > 15 minutes (~3000+ words), the transcript may exceed 
comfortable context windows. Strategy:

1. **Chunk by topic segments** — use timestamps to split into 
   ~5 minute segments with 30-second overlap
2. **Extract per chunk** — run the prompt on each chunk
3. **Merge results** — deduplicate entities across chunks by 
   normalized_name + area, merge their claims
4. **Cost control** — a 30-minute video split into 6 chunks costs 
   6x a single call. Factor this into credit estimation.

---

## STAGE 6: Entity Resolution

**Purpose:** Match extracted mentions to canonical entities. This is the 
hardest and most important stage.

```
Input:  Extracted entity from Stage 5
Output: { canonical_entity_id, match_type, match_confidence }
```

### Resolution Flow

```
For each extracted entity:
    │
    ├─ Step 1: EXACT MATCH
    │   Query canonical entities where:
    │     normalized_name = entity.normalized_name
    │     AND destination = entity.location.destination
    │     AND (area = entity.location.area OR area is close)
    │   If found → MATCH (confidence: 0.95+)
    │
    ├─ Step 2: FUZZY MATCH
    │   If no exact match, search where:
    │     levenshtein(normalized_name, entity.normalized_name) <= 2
    │     AND same destination
    │     AND (same area OR adjacent area)
    │   If found with high similarity → MATCH (confidence: 0.7-0.9)
    │   If found with low similarity → CANDIDATE (needs review)
    │
    ├─ Step 3: ALIAS MATCH
    │   Check entity_aliases table:
    │     "CP" → "Connaught Place"
    │     "HKV" → "Hauz Khas Village"  
    │     "Old Delhi" → "Chandni Chowk" (area-level)
    │     "Paranthe Wali Gali" → "Parantha Wali Gali"
    │   This table grows over time from manual reviews.
    │   If alias found → MATCH (confidence: 0.85+)
    │
    ├─ Step 4: GOOGLE PLACES VERIFICATION
    │   If no match found above:
    │     Search Google Places API: "{entity.normalized_name} {entity.location.area} {entity.location.destination}"
    │     If Places returns a result:
    │       - Create new canonical entity WITH Places data
    │       - Match confidence based on name similarity to Places result
    │     If Places returns nothing:
    │       - Flag for manual review
    │       - If extraction_confidence > 0.7, create as unverified candidate
    │       - If extraction_confidence <= 0.7, discard
    │
    └─ Step 5: RECORD DECISION
        Store in entity_resolution_log:
        { raw_name, normalized_name, canonical_id, match_type, 
          match_confidence, resolved_by: "auto|manual", timestamp }
```

### Name Normalization Rules

Apply before any matching:

```
function normalize(name):
    1. Lowercase
    2. Remove common suffixes: "restaurant", "hotel", "cafe", "the"
    3. Remove punctuation: apostrophes, hyphens, dots
    4. Transliterate Hindi to Latin (if Devanagari detected)
    5. Collapse whitespace
    6. Common Delhi substitutions:
       - "wali" ↔ "vali" ↔ "waali"
       - "chowk" ↔ "chauk"  
       - "nagar" at end: keep (it's part of area names)
       - "'s" → "s" (Karim's → Karims)
    
    Examples:
    "Karim's Restaurant" → "karims"
    "The Karim Hotel" → "karim"  (different from karims!)
    "करीम" → "karim"
    "Paranthe Wali Gali" → "paranthe wali gali"
    "Parantha Waali Gali" → "parantha waali gali"
    → fuzzy match catches these (levenshtein = 3)
```

### MVP Entity Resolution — Practical Approach

For the Delhi test (few hundred videos), do NOT over-automate:

1. **Auto-resolve** exact matches and high-confidence fuzzy matches (>0.85)
2. **Queue everything else** for your manual review
3. **Learn from your reviews** — every manual resolution becomes an alias entry
4. After the test: analyze the review queue to see what patterns recur, 
   and automate those specific patterns

Expected distribution (estimate):
- ~50% will exact-match (popular places mentioned the same way)
- ~20% will fuzzy-match correctly
- ~15% will need alias resolution
- ~15% will be genuinely new entities or garbage

### Schema: Entity Resolution Tables

```sql
-- Aliases learned from manual resolution
CREATE TABLE entity_aliases (
    id UUID PRIMARY KEY,
    alias TEXT NOT NULL,             -- the variant name
    canonical_entity_id UUID NOT NULL REFERENCES points_of_interest(id),
    source TEXT DEFAULT 'manual',    -- manual | auto_learned
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Log of every resolution decision (audit trail)
CREATE TABLE entity_resolution_log (
    id UUID PRIMARY KEY,
    source_id UUID REFERENCES sources(id),
    raw_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    canonical_entity_id UUID REFERENCES points_of_interest(id),
    match_type TEXT NOT NULL,        -- exact | fuzzy | alias | places_api | manual | discarded
    match_confidence FLOAT,
    resolved_by TEXT DEFAULT 'auto', -- auto | manual
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Review queue for uncertain matches
CREATE TABLE resolution_review_queue (
    id UUID PRIMARY KEY,
    source_id UUID REFERENCES sources(id),
    raw_extraction JSONB NOT NULL,   -- the full extracted entity
    suggested_match_id UUID REFERENCES points_of_interest(id),
    suggested_confidence FLOAT,
    status TEXT DEFAULT 'pending',   -- pending | approved | rejected | merged | new_entity
    reviewed_at TIMESTAMPTZ,
    reviewer_notes TEXT
);
```

---

## STAGE 7: Enrichment

**Purpose:** Fill gaps that transcripts can't reliably provide. 
Make the data actually useful at display time.

### Google Places API Enrichment

For every newly created or updated canonical entity, fetch:

```json
{
  "google_place_id": "ChIJ...",
  "verified_name": "Karim's",
  "formatted_address": "16, Gali Kababian, Jama Masjid, Old Delhi, Delhi 110006",
  "lat": 28.6506,
  "lng": 77.2334,
  "google_rating": 4.1,
  "total_ratings": 42850,
  "price_level": 1,
  "opening_hours": {
    "monday": "12:00-22:30",
    "tuesday": "12:00-22:30"
  },
  "phone": "+91-11-2326...",
  "website": null,
  "photos": ["photo_reference_1", "photo_reference_2"],
  "types": ["restaurant", "food", "point_of_interest"],
  "business_status": "OPERATIONAL"
}
```

### Enrichment Rules

1. **Never overwrite AI-extracted claims** — store Google data separately 
   in the verification layer
2. **Always prefer Google for:** lat/lng, formatted_address, phone, website, 
   opening_hours (more reliable than transcript mentions)
3. **Always prefer AI-extracted for:** speciality items, tips, crowd info, 
   best_time (Google doesn't have these — this is YOUR unique value)
4. **Flag conflicts:** If AI says "closes at 11pm" and Google says "closes 
   at 10:30pm", store both with sources. Display Google's but note 
   "creators mention it may stay open later"
5. **Cache aggressively:** Google Places API costs money. Cache place_id 
   lookups. Re-verify hours monthly, not per-extraction.

### Cost Control

- Google Places API: ~$17 per 1000 Place Details requests
- For 500 unique entities in Delhi: ~$8.50 one-time
- Re-enrichment monthly: only re-fetch entities with new evidence
- Use Places Text Search for initial matching (~$32 per 1000 requests)
- Total MVP enrichment budget: ~$50-100

---

## STAGE 8: Scoring & Storage

### Recommendation Score Calculation

Recalculated whenever new evidence is added for an entity.

```
recommendation_score = 
    (0.30 × frequency_score)
  + (0.20 × recency_score)  
  + (0.20 × sentiment_score)
  + (0.15 × authority_score)
  + (0.15 × depth_score)
```

**frequency_score** (0-1):
```
raw_frequency = count of distinct sources mentioning this entity
frequency_score = min(raw_frequency / FREQUENCY_CAP, 1.0)

FREQUENCY_CAP = 50 (for MVP — adjust based on data distribution)
  meaning: 50+ mentions = max frequency score
```

**recency_score** (0-1):
```
For each source mentioning this entity:
  if uploaded within 3 months: weight = 1.0
  if 3-6 months: weight = 0.7
  if 6-12 months: weight = 0.4
  if 12-24 months: weight = 0.2
  if 24+ months: weight = 0.05

recency_score = weighted_average(weights) across all mentions

NOTE: Use video upload_date, not extraction_date
```

**sentiment_score** (0-1):
```
For each source mentioning this entity:
  if stance = "recommended": sentiment = recommendation_strength (0-1)
  if stance = "mentioned": sentiment = 0.5
  if stance = "warned_against": sentiment = -(recommendation_strength)
  if stance = "mixed": sentiment = 0.3

raw_sentiment = average(sentiment values)
sentiment_score = (raw_sentiment + 1) / 2    // normalize to 0-1 range
```

**authority_score** (0-1):
```
For each source mentioning this entity:
  source_authority = log10(view_count + 1) / 8  // 100M views → ~1.0
  
  Alternative with subscriber awareness:
  source_authority = 0.6 * log10(views+1)/8 + 0.4 * log10(subs+1)/7

authority_score = weighted_average(source_authority) across mentions
```

**depth_score** (0-1):
```
claims_count = number of distinct claims for this entity from all sources
unique_fields = number of distinct claim fields covered

depth_score = min((claims_count / 10) * 0.5 + (unique_fields / 8) * 0.5, 1.0)

meaning: entity with 10+ claims covering 8+ different fields = max depth
```

### What Gets Displayed to Users

For each POI on the shareable site:

```
┌──────────────────────────────────────────────────────┐
│ ★ Karim's                                     #1    │
│ Mughlai • Street Food • ₹ Budget                     │
│ Jama Masjid, Old Delhi                               │
│                                                      │
│ 📊 Mentioned by 67 creators                          │
│ 🔥 Recommendation Score: 94/100                      │
│                                                      │
│ What creators say:                                   │
│ • Must try: Mutton Burra Kebab, Mutton Biryani       │
│ • Best time: Lunch / Afternoon                       │
│ • Expect: Long queues, especially weekends           │
│ • Pro tip: Go upstairs for AC section                │
│                                                      │
│ Practical info:                                      │
│ ⏰ 12:00 PM - 10:30 PM (Google Maps)                │
│    "Creators say it may stay open till 11 PM"        │
│ 📍 Gali Kababian, Jama Masjid                       │
│ ⭐ 4.1 on Google (42,850 reviews)                    │
│                                                      │
│ Sources: [Video 1] [Video 2] [Video 3] +64 more     │
└──────────────────────────────────────────────────────┘
```

The unique value a user sees compared to Google Maps:
1. **"What creators say"** — not in Google
2. **Must-try items** — not in Google  
3. **Crowd and timing intelligence** — not in Google
4. **Frequency signal** — "67 creators recommend this" builds trust differently than "4.1 stars"
5. **Evidence links** — watch the actual videos that led to this recommendation

---

## COMPLETE DATABASE SCHEMA (MVP)

### Layer 1: Sources

```sql
CREATE TABLE sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform TEXT NOT NULL DEFAULT 'youtube',
    url TEXT NOT NULL,
    video_id TEXT NOT NULL UNIQUE,
    
    -- Metadata (Stage 2)
    title TEXT,
    description TEXT,
    creator_name TEXT,
    creator_channel_id TEXT,
    creator_subscribers INT,
    duration_seconds INT,
    upload_date DATE,
    view_count BIGINT,
    like_count BIGINT,
    default_language TEXT,
    tags TEXT[],
    
    -- Travel Gate (Stage 3)
    travel_score FLOAT,
    content_type TEXT,
    estimated_entities INT,
    
    -- Transcript (Stage 4)
    transcript TEXT,
    transcript_source TEXT,            -- manual | auto_generated
    transcript_language TEXT,
    
    -- Extraction (Stage 5)
    raw_extraction JSONB,              -- full extraction JSON, immutable
    extraction_model TEXT,
    extraction_timestamp TIMESTAMPTZ,
    extraction_confidence FLOAT,
    
    -- Processing status
    status TEXT DEFAULT 'pending',     -- pending | metadata_fetched | gated | transcript_fetched | extracted | resolved | failed
    failure_reason TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sources_video_id ON sources(video_id);
CREATE INDEX idx_sources_status ON sources(status);
CREATE INDEX idx_sources_platform ON sources(platform);
```

### Layer 2: Destinations

```sql
CREATE TABLE destinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    name_local TEXT,                    -- Devanagari/local script
    slug TEXT NOT NULL UNIQUE,          -- URL-friendly: "delhi", "gurgaon"
    type TEXT NOT NULL,                 -- country | state | city | region
    parent_destination_id UUID REFERENCES destinations(id),
    
    description TEXT,
    lat FLOAT,
    lng FLOAT,
    
    -- Aggregated stats (recalculated)
    total_pois INT DEFAULT 0,
    total_sources INT DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Layer 3: Areas

```sql
CREATE TABLE areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    destination_id UUID NOT NULL REFERENCES destinations(id),
    name TEXT NOT NULL,
    name_local TEXT,
    slug TEXT NOT NULL,                 -- "chandni-chowk", "connaught-place"
    description TEXT,
    
    lat FLOAT,
    lng FLOAT,
    boundary_geojson JSONB,            -- optional: area polygon for geo-queries
    
    -- Aggregated stats
    total_pois INT DEFAULT 0,
    total_sources INT DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(destination_id, slug)
);
```

### Layer 4: Points of Interest (Canonical Entities)

```sql
CREATE TABLE points_of_interest (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    destination_id UUID NOT NULL REFERENCES destinations(id),
    area_id UUID REFERENCES areas(id),
    
    -- Identity
    name TEXT NOT NULL,
    name_local TEXT,
    slug TEXT NOT NULL,
    normalized_name TEXT NOT NULL,      -- for matching: "karims"
    
    -- Classification
    entity_type TEXT NOT NULL,          -- poi | activity
    poi_category TEXT,                  -- restaurant | cafe | attraction | ...
    
    -- Location
    lat FLOAT,
    lng FLOAT,
    formatted_address TEXT,
    
    -- Creator-sourced intelligence (aggregated from claims)
    specialities TEXT[],               -- ["mutton burra kebab", "biryani"]
    best_time TEXT,
    price_level TEXT,                   -- budget | moderate | expensive | luxury
    average_cost_inr INT,
    crowd_info TEXT,
    tips TEXT[],                        -- ["go upstairs for AC", "visit on weekday"]
    warnings TEXT[],                    -- ["closes early", "cash only"]
    
    -- Attributes (flexible JSONB for category-specific data)
    attributes JSONB DEFAULT '{}',
    
    -- Scores (recalculated)
    frequency_count INT DEFAULT 0,
    recommendation_score FLOAT DEFAULT 0,
    
    -- Google Places enrichment
    google_place_id TEXT,
    google_rating FLOAT,
    google_total_ratings INT,
    google_opening_hours JSONB,
    google_phone TEXT,
    google_website TEXT,
    google_photos TEXT[],              -- photo references
    google_business_status TEXT,
    google_enriched_at TIMESTAMPTZ,
    
    -- Status
    verification_status TEXT DEFAULT 'ai_extracted',  -- ai_extracted | google_verified | community_verified
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(destination_id, slug)
);

CREATE INDEX idx_poi_destination ON points_of_interest(destination_id);
CREATE INDEX idx_poi_area ON points_of_interest(area_id);
CREATE INDEX idx_poi_normalized ON points_of_interest(normalized_name, destination_id);
CREATE INDEX idx_poi_score ON points_of_interest(recommendation_score DESC);
CREATE INDEX idx_poi_category ON points_of_interest(poi_category);
```

### Layer 5: Evidence (The Moat)

```sql
CREATE TABLE entity_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES points_of_interest(id),
    source_id UUID NOT NULL REFERENCES sources(id),
    
    -- What was said
    stance TEXT NOT NULL,              -- recommended | mentioned | warned_against | mixed
    recommendation_strength FLOAT,
    extraction_confidence FLOAT,
    
    -- Structured claims from this source
    claims JSONB NOT NULL DEFAULT '[]',
    -- Each claim: { field, value, evidence, timestamp_seconds, confidence }
    
    -- Source context at time of extraction
    source_views_at_extraction BIGINT,
    source_upload_date DATE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(entity_id, source_id)       -- one evidence record per entity per source
);

CREATE INDEX idx_evidence_entity ON entity_evidence(entity_id);
CREATE INDEX idx_evidence_source ON entity_evidence(source_id);
```

### Layer 6: Verification

```sql
CREATE TABLE verification_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES points_of_interest(id),
    
    field_name TEXT NOT NULL,           -- opening_hours | price_level | etc.
    ai_value TEXT,                      -- what creators say
    verified_value TEXT,                -- what Google/manual check says  
    verification_source TEXT,           -- google_places | manual | community
    
    conflict_exists BOOLEAN DEFAULT false,
    conflict_note TEXT,                 -- "Creators say 11PM, Google says 10:30PM"
    
    verified_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(entity_id, field_name, verification_source)
);
```

### Layer 7: User Layer (for the shareable site / future app)

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE,
    name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    entity_id UUID NOT NULL REFERENCES points_of_interest(id),
    
    status TEXT DEFAULT 'saved',       -- saved | wishlist | planned | visited
    notes TEXT,
    rating INT,                        -- user's personal rating (1-5)
    visited_at DATE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, entity_id)
);

-- Track which videos a user has submitted
CREATE TABLE user_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id), -- nullable for anonymous submissions
    source_id UUID NOT NULL REFERENCES sources(id),
    submitted_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Resolution Tables (from Stage 6)

```sql
CREATE TABLE entity_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alias TEXT NOT NULL,
    normalized_alias TEXT NOT NULL,
    canonical_entity_id UUID NOT NULL REFERENCES points_of_interest(id),
    source TEXT DEFAULT 'manual',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alias_normalized ON entity_aliases(normalized_alias);

CREATE TABLE entity_resolution_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES sources(id),
    raw_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    canonical_entity_id UUID REFERENCES points_of_interest(id),
    match_type TEXT NOT NULL,
    match_confidence FLOAT,
    resolved_by TEXT DEFAULT 'auto',
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE resolution_review_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES sources(id),
    raw_extraction JSONB NOT NULL,
    suggested_match_id UUID REFERENCES points_of_interest(id),
    suggested_confidence FLOAT,
    status TEXT DEFAULT 'pending',
    reviewed_at TIMESTAMPTZ,
    reviewer_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_review_status ON resolution_review_queue(status);
```

---

## COST ESTIMATES (Delhi MVP Test)

### One-time Seeding (200-300 videos for Delhi + Gurgaon)

| Stage | Cost per video | 300 videos |
|-------|---------------|------------|
| YouTube Data API | Free | $0 |
| Travel Gate (cheap model) | ~$0.001 | $0.30 |
| Transcript fetch | Free (library) | $0 |
| AI Extraction (main model) | ~$0.02-0.05 | $6-15 |
| Google Places (new entities) | ~$0.032 | ~$10 (300 unique POIs) |
| **TOTAL** | | **~$16-25** |

### Ongoing (per user-submitted video)

| Stage | Cost |
|-------|------|
| Travel gate | $0.001 |
| Extraction | $0.02-0.05 |
| Resolution (if new entity) | $0.032 (Places API) |
| Resolution (if existing entity) | $0 (database match) |
| **TOTAL per video** | **$0.02-0.08** |

As the knowledge graph grows, more entities resolve via database match 
(free) rather than Places API (paid), so cost per video decreases over time.

---

## WHAT'S INTENTIONALLY DEFERRED

These are NOT in the MVP. The schema supports adding them later 
without migration:

1. **Transportation layer** — transcripts rarely contain reliable 
   transport info. Add when you have a source that does.
2. **Seasonality** — need 12+ months of data to detect patterns. 
   The evidence layer's timestamps enable this calculation later.
3. **Activity entity type** — focus on POIs first. Activities 
   (paragliding, trekking) are Phase 2.
4. **Blog/article ingestion** — schema is source-agnostic via 
   `sources.platform`. Just add a new ingestion pipeline later.
5. **Community verification** — add after you have community. 
   The verification layer schema already supports it.
6. **Credit system** — premature. Figure out pricing after you know 
   real costs per video.
7. **User authentication** — for the shareable test site, anonymous 
   or email-only is fine.

---

## NEXT STEPS (in order)

1. Set up Supabase project, run the SQL schema above
2. Write the extraction pipeline as a Node.js/Python script 
   (not the full app — just the pipeline)
3. Seed 10 Delhi food videos manually, inspect extraction quality
4. Tune the extraction prompt based on what you see
5. Run entity resolution on those 10, inspect the review queue
6. If quality is acceptable: process 200-300 videos for Delhi + Gurgaon
7. Build the shareable site showing aggregated results per area
8. Share with 20-50 people, measure if it beats Google for trip planning
