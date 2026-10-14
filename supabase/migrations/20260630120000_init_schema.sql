-- Travel Intelligence Engine — Extraction Pipeline
-- Initial schema (MVP, Delhi + Gurgaon)
-- Spec: pipeline-spec.md v0.1-MVP
--
-- Table order follows FK dependencies:
--   sources, destinations -> areas -> points_of_interest
--   -> entity_evidence, verification_data, aliases, resolution tables
--   users -> user_entities, user_submissions

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
-- gen_random_uuid() ships with Postgres 13+ (pgcrypto).
create extension if not exists pgcrypto;

-- Auto-bump updated_at on row update. Self-defined (in public) so it resolves
-- identically on local stack, hosted project, or raw SQL Editor.
create or replace function set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

-- ===========================================================================
-- Layer 1: Sources
-- ===========================================================================
create table sources (
    id uuid primary key default gen_random_uuid(),
    platform text not null default 'youtube',
    url text not null,
    video_id text not null unique,

    -- Metadata (Stage 2)
    title text,
    description text,
    creator_name text,
    creator_channel_id text,
    creator_subscribers int,
    duration_seconds int,
    upload_date date,
    view_count bigint,
    like_count bigint,
    default_language text,
    tags text[],

    -- Travel Gate (Stage 3)
    travel_score float,
    content_type text,
    estimated_entities int,

    -- Transcript (Stage 4)
    transcript text,
    transcript_source text,            -- manual | auto_generated
    transcript_language text,

    -- Extraction (Stage 5)
    raw_extraction jsonb,              -- full extraction JSON, immutable
    extraction_model text,
    extraction_timestamp timestamptz,
    extraction_confidence float,

    -- Processing status
    status text not null default 'pending'
        check (status in ('pending','metadata_fetched','gated','transcript_fetched',
                          'extracted','resolved','failed')),
    failure_reason text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index idx_sources_video_id on sources(video_id);
create index idx_sources_status   on sources(status);
create index idx_sources_platform on sources(platform);

create trigger trg_sources_updated_at
    before update on sources
    for each row execute function set_updated_at();

-- ===========================================================================
-- Layer 2: Destinations
-- ===========================================================================
create table destinations (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    name_local text,                    -- Devanagari/local script
    slug text not null unique,          -- "delhi", "gurgaon"
    type text not null
        check (type in ('country','state','city','region')),
    parent_destination_id uuid references destinations(id),

    description text,
    lat float,
    lng float,

    -- Aggregated stats (recalculated)
    total_pois int not null default 0,
    total_sources int not null default 0,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create trigger trg_destinations_updated_at
    before update on destinations
    for each row execute function set_updated_at();

-- ===========================================================================
-- Layer 3: Areas
-- ===========================================================================
create table areas (
    id uuid primary key default gen_random_uuid(),
    destination_id uuid not null references destinations(id),
    name text not null,
    name_local text,
    slug text not null,                 -- "chandni-chowk", "connaught-place"
    description text,

    lat float,
    lng float,
    boundary_geojson jsonb,             -- optional: area polygon

    total_pois int not null default 0,
    total_sources int not null default 0,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique(destination_id, slug)
);

create index idx_areas_destination on areas(destination_id);

create trigger trg_areas_updated_at
    before update on areas
    for each row execute function set_updated_at();

-- ===========================================================================
-- Layer 4: Points of Interest (Canonical Entities)
-- ===========================================================================
create table points_of_interest (
    id uuid primary key default gen_random_uuid(),
    destination_id uuid not null references destinations(id),
    area_id uuid references areas(id),

    -- Identity
    name text not null,
    name_local text,
    slug text not null,
    normalized_name text not null,      -- for matching: "karims"

    -- Classification
    entity_type text not null
        check (entity_type in ('poi','activity')),
    poi_category text,                  -- restaurant | cafe | attraction | ...

    -- Location
    lat float,
    lng float,
    formatted_address text,

    -- Creator-sourced intelligence (aggregated from claims)
    specialities text[],
    best_time text,
    price_level text,                   -- budget | moderate | expensive | luxury
    average_cost_inr int,
    crowd_info text,
    tips text[],
    warnings text[],

    -- Flexible per-category data
    attributes jsonb not null default '{}',

    -- Scores (recalculated)
    frequency_count int not null default 0,
    recommendation_score float not null default 0,

    -- Google Places enrichment
    google_place_id text,
    google_rating float,
    google_total_ratings int,
    google_opening_hours jsonb,
    google_phone text,
    google_website text,
    google_photos text[],
    google_business_status text,
    google_enriched_at timestamptz,

    -- Status
    verification_status text not null default 'ai_extracted'
        check (verification_status in ('ai_extracted','google_verified','community_verified')),
    is_active boolean not null default true,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique(destination_id, slug)
);

create index idx_poi_destination on points_of_interest(destination_id);
create index idx_poi_area        on points_of_interest(area_id);
create index idx_poi_normalized  on points_of_interest(normalized_name, destination_id);
create index idx_poi_score       on points_of_interest(recommendation_score desc);
create index idx_poi_category    on points_of_interest(poi_category);

create trigger trg_poi_updated_at
    before update on points_of_interest
    for each row execute function set_updated_at();

-- ===========================================================================
-- Layer 5: Evidence (The Moat)
-- ===========================================================================
create table entity_evidence (
    id uuid primary key default gen_random_uuid(),
    entity_id uuid not null references points_of_interest(id),
    source_id uuid not null references sources(id),

    stance text not null
        check (stance in ('recommended','mentioned','warned_against','mixed')),
    recommendation_strength float,
    extraction_confidence float,

    -- Each claim: { field, value, evidence, timestamp_seconds, confidence }
    claims jsonb not null default '[]',

    source_views_at_extraction bigint,
    source_upload_date date,

    created_at timestamptz not null default now(),

    unique(entity_id, source_id)        -- one evidence record per entity per source
);

create index idx_evidence_entity on entity_evidence(entity_id);
create index idx_evidence_source on entity_evidence(source_id);

-- ===========================================================================
-- Layer 6: Verification
-- ===========================================================================
create table verification_data (
    id uuid primary key default gen_random_uuid(),
    entity_id uuid not null references points_of_interest(id),

    field_name text not null,           -- opening_hours | price_level | ...
    ai_value text,                      -- what creators say
    verified_value text,                -- what Google/manual says
    verification_source text,           -- google_places | manual | community

    conflict_exists boolean not null default false,
    conflict_note text,

    verified_at timestamptz not null default now(),

    unique(entity_id, field_name, verification_source)
);

create index idx_verification_entity on verification_data(entity_id);

-- ===========================================================================
-- Layer 7: User Layer
-- ===========================================================================
create table users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    name text,
    created_at timestamptz not null default now()
);

create table user_entities (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id),
    entity_id uuid not null references points_of_interest(id),

    status text not null default 'saved'
        check (status in ('saved','wishlist','planned','visited')),
    notes text,
    rating int check (rating between 1 and 5),
    visited_at date,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique(user_id, entity_id)
);

create trigger trg_user_entities_updated_at
    before update on user_entities
    for each row execute function set_updated_at();

create table user_submissions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references users(id),  -- nullable for anonymous submissions
    source_id uuid not null references sources(id),
    submitted_at timestamptz not null default now()
);

create index idx_submissions_source on user_submissions(source_id);

-- ===========================================================================
-- Resolution Tables (Stage 6)
-- ===========================================================================
create table entity_aliases (
    id uuid primary key default gen_random_uuid(),
    alias text not null,
    normalized_alias text not null,
    canonical_entity_id uuid not null references points_of_interest(id),
    source text not null default 'manual',   -- manual | auto_learned
    created_at timestamptz not null default now()
);

create index idx_alias_normalized on entity_aliases(normalized_alias);

create table entity_resolution_log (
    id uuid primary key default gen_random_uuid(),
    source_id uuid references sources(id),
    raw_name text not null,
    normalized_name text not null,
    canonical_entity_id uuid references points_of_interest(id),
    match_type text not null
        check (match_type in ('exact','fuzzy','alias','places_api','manual','discarded')),
    match_confidence float,
    resolved_by text not null default 'auto'   -- auto | manual
        check (resolved_by in ('auto','manual')),
    resolution_notes text,
    created_at timestamptz not null default now()
);

create index idx_resolution_log_source on entity_resolution_log(source_id);

create table resolution_review_queue (
    id uuid primary key default gen_random_uuid(),
    source_id uuid references sources(id),
    raw_extraction jsonb not null,
    suggested_match_id uuid references points_of_interest(id),
    suggested_confidence float,
    status text not null default 'pending'
        check (status in ('pending','approved','rejected','merged','new_entity')),
    reviewed_at timestamptz,
    reviewer_notes text,
    created_at timestamptz not null default now()
);

create index idx_review_status on resolution_review_queue(status);
