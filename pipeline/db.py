"""Thin Postgres access layer over the Supabase session pooler (psycopg3)."""
from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from . import config


@contextmanager
def connect() -> Iterator[psycopg.Connection]:
    """Yield a connection with dict rows. Commits on clean exit, rolls back on error."""
    conn = psycopg.connect(config.db_url(), row_factory=dict_row)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def find_source_by_video_id(conn: psycopg.Connection, video_id: str) -> dict[str, Any] | None:
    """Return existing source row for this video_id, or None."""
    cur = conn.execute(
        "select id, video_id, status, title, created_at from sources where video_id = %s",
        (video_id,),
    )
    return cur.fetchone()


def upsert_source_metadata(conn: psycopg.Connection, data: dict[str, Any]) -> dict[str, Any]:
    """Insert a source row with Stage 2 metadata, or update it if the video_id exists.

    Returns the stored row (id + status).
    """
    cur = conn.execute(
        """
        insert into sources (
            platform, url, video_id,
            title, description, creator_name, creator_channel_id,
            creator_subscribers, duration_seconds, upload_date,
            view_count, like_count, default_language, tags,
            status
        ) values (
            %(platform)s, %(url)s, %(video_id)s,
            %(title)s, %(description)s, %(creator_name)s, %(creator_channel_id)s,
            %(creator_subscribers)s, %(duration_seconds)s, %(upload_date)s,
            %(view_count)s, %(like_count)s, %(default_language)s, %(tags)s,
            'metadata_fetched'
        )
        on conflict (video_id) do update set
            title = excluded.title,
            description = excluded.description,
            creator_name = excluded.creator_name,
            creator_channel_id = excluded.creator_channel_id,
            creator_subscribers = excluded.creator_subscribers,
            duration_seconds = excluded.duration_seconds,
            upload_date = excluded.upload_date,
            view_count = excluded.view_count,
            like_count = excluded.like_count,
            default_language = excluded.default_language,
            tags = excluded.tags,
            status = 'metadata_fetched',
            updated_at = now()
        returning id, video_id, status;
        """,
        data,
    )
    return cur.fetchone()


def update_source_gate(
    conn: psycopg.Connection,
    source_id: str,
    *,
    travel_score: float,
    content_type: str,
    estimated_entities: int,
    status: str,
    failure_reason: str | None = None,
) -> None:
    """Persist Stage 3 gate results. status = 'gated' (passed) or 'failed' (rejected)."""
    conn.execute(
        """
        update sources set
            travel_score = %(travel_score)s,
            content_type = %(content_type)s,
            estimated_entities = %(estimated_entities)s,
            status = %(status)s,
            failure_reason = %(failure_reason)s,
            updated_at = now()
        where id = %(id)s
        """,
        {
            "id": source_id,
            "travel_score": travel_score,
            "content_type": content_type,
            "estimated_entities": estimated_entities,
            "status": status,
            "failure_reason": failure_reason,
        },
    )


def update_source_transcript(
    conn: psycopg.Connection,
    source_id: str,
    *,
    transcript: str,
    transcript_source: str,
    transcript_language: str,
    status: str = "transcript_fetched",
) -> None:
    """Persist Stage 4 transcript."""
    conn.execute(
        """
        update sources set
            transcript = %(transcript)s,
            transcript_source = %(transcript_source)s,
            transcript_language = %(transcript_language)s,
            status = %(status)s,
            updated_at = now()
        where id = %(id)s
        """,
        {
            "id": source_id,
            "transcript": transcript,
            "transcript_source": transcript_source,
            "transcript_language": transcript_language,
            "status": status,
        },
    )


def update_source_extraction(
    conn: psycopg.Connection,
    source_id: str,
    *,
    raw_extraction: dict[str, Any],
    extraction_model: str,
    extraction_confidence: float,
    status: str = "extracted",
) -> None:
    """Persist Stage 5 raw extraction JSON (immutable archive)."""
    conn.execute(
        """
        update sources set
            raw_extraction = %(raw)s,
            extraction_model = %(model)s,
            extraction_confidence = %(conf)s,
            extraction_timestamp = now(),
            status = %(status)s,
            updated_at = now()
        where id = %(id)s
        """,
        {
            "id": source_id,
            "raw": Jsonb(raw_extraction),
            "model": extraction_model,
            "conf": extraction_confidence,
            "status": status,
        },
    )


def mark_failed(conn: psycopg.Connection, source_id: str, reason: str) -> None:
    """Set status=failed with a reason (truncated)."""
    conn.execute(
        "update sources set status='failed', failure_reason=%s, updated_at=now() where id=%s",
        (reason[:300], source_id),
    )


# ---------------------------------------------------------------------------
# Stage 6: Entity Resolution
# ---------------------------------------------------------------------------

def list_extracted_sources(conn: psycopg.Connection) -> list[dict[str, Any]]:
    """Sources with a raw extraction ready to resolve."""
    return conn.execute(
        "select id, video_id, raw_extraction, view_count, upload_date "
        "from sources where status='extracted' and raw_extraction is not null "
        "order by created_at"
    ).fetchall()


def get_destination_id(conn: psycopg.Connection, slug: str) -> str | None:
    row = conn.execute("select id from destinations where slug=%s", (slug,)).fetchone()
    return row["id"] if row else None


def get_area_id(conn: psycopg.Connection, destination_id: str, area_slug: str) -> str | None:
    row = conn.execute(
        "select id from areas where destination_id=%s and slug=%s",
        (destination_id, area_slug),
    ).fetchone()
    return row["id"] if row else None


def find_poi_exact(
    conn: psycopg.Connection, destination_id: str, normalized_name: str
) -> dict[str, Any] | None:
    return conn.execute(
        "select id, name, normalized_name, area_id from points_of_interest "
        "where destination_id=%s and normalized_name=%s",
        (destination_id, normalized_name),
    ).fetchone()


def list_pois_for_destination(
    conn: psycopg.Connection, destination_id: str
) -> list[dict[str, Any]]:
    """All POIs in a destination (for in-Python fuzzy matching; dataset is small)."""
    return conn.execute(
        "select id, name, normalized_name, area_id from points_of_interest "
        "where destination_id=%s",
        (destination_id,),
    ).fetchall()


def find_alias(conn: psycopg.Connection, normalized_alias: str) -> dict[str, Any] | None:
    return conn.execute(
        "select canonical_entity_id from entity_aliases where normalized_alias=%s",
        (normalized_alias,),
    ).fetchone()


def insert_poi(conn: psycopg.Connection, data: dict[str, Any]) -> str:
    """Create a canonical POI. Returns its id."""
    row = conn.execute(
        """
        insert into points_of_interest (
            destination_id, area_id, name, name_local, slug, normalized_name,
            entity_type, poi_category, attributes, verification_status
        ) values (
            %(destination_id)s, %(area_id)s, %(name)s, %(name_local)s, %(slug)s,
            %(normalized_name)s, %(entity_type)s, %(poi_category)s,
            %(attributes)s, 'ai_extracted'
        )
        returning id
        """,
        {**data, "attributes": Jsonb(data.get("attributes") or {})},
    ).fetchone()
    return row["id"]


def upsert_evidence(conn: psycopg.Connection, data: dict[str, Any]) -> bool:
    """Insert one evidence record (entity+source). Returns True if newly inserted."""
    row = conn.execute(
        """
        insert into entity_evidence (
            entity_id, source_id, stance, recommendation_strength,
            extraction_confidence, claims, source_views_at_extraction, source_upload_date
        ) values (
            %(entity_id)s, %(source_id)s, %(stance)s, %(recommendation_strength)s,
            %(extraction_confidence)s, %(claims)s, %(views)s, %(upload_date)s
        )
        on conflict (entity_id, source_id) do update set
            stance = excluded.stance,
            recommendation_strength = excluded.recommendation_strength,
            extraction_confidence = excluded.extraction_confidence,
            claims = excluded.claims
        returning (xmax = 0) as inserted
        """,
        {**data, "claims": Jsonb(data.get("claims") or [])},
    ).fetchone()
    return bool(row["inserted"])


def recount_poi_frequency(conn: psycopg.Connection, entity_id: str) -> int:
    """Set frequency_count = distinct sources with evidence for this POI."""
    row = conn.execute(
        """
        update points_of_interest set
            frequency_count = (select count(*) from entity_evidence where entity_id=%s),
            updated_at = now()
        where id=%s
        returning frequency_count
        """,
        (entity_id, entity_id),
    ).fetchone()
    return row["frequency_count"]


def insert_resolution_log(conn: psycopg.Connection, data: dict[str, Any]) -> None:
    conn.execute(
        """
        insert into entity_resolution_log (
            source_id, raw_name, normalized_name, canonical_entity_id,
            match_type, match_confidence, resolved_by, resolution_notes
        ) values (
            %(source_id)s, %(raw_name)s, %(normalized_name)s, %(canonical_entity_id)s,
            %(match_type)s, %(match_confidence)s, %(resolved_by)s, %(notes)s
        )
        """,
        data,
    )


def insert_review_queue(conn: psycopg.Connection, data: dict[str, Any]) -> None:
    conn.execute(
        """
        insert into resolution_review_queue (
            source_id, raw_extraction, suggested_match_id, suggested_confidence, status
        ) values (
            %(source_id)s, %(raw_extraction)s, %(suggested_match_id)s,
            %(suggested_confidence)s, %(status)s
        )
        """,
        {**data, "raw_extraction": Jsonb(data.get("raw_extraction") or {})},
    )


def mark_resolved(conn: psycopg.Connection, source_id: str) -> None:
    conn.execute(
        "update sources set status='resolved', updated_at=now() where id=%s", (source_id,)
    )


# ---------------------------------------------------------------------------
# Stage 7: Enrichment (Google Places)
# ---------------------------------------------------------------------------

def list_pois_for_enrichment(
    conn: psycopg.Connection, *, force: bool = False
) -> list[dict[str, Any]]:
    """POIs to enrich, with area + destination names for building the search query.

    By default only POIs never enriched (google_place_id is null); force=True
    re-fetches every active POI.
    """
    where = "p.is_active = true"
    if not force:
        where += " and p.google_place_id is null"
    return conn.execute(
        f"""
        select
            p.id, p.name, p.normalized_name, p.price_level,
            a.name as area_name, d.name as destination_name
        from points_of_interest p
        join destinations d on d.id = p.destination_id
        left join areas a on a.id = p.area_id
        where {where}
        order by p.recommendation_score desc nulls last
        """
    ).fetchall()


def update_poi_google_enrichment(
    conn: psycopg.Connection, entity_id: str, data: dict[str, Any]
) -> None:
    """Write Google Places fields onto a POI. Never touches AI-extracted claim columns."""
    conn.execute(
        """
        update points_of_interest set
            google_place_id = %(google_place_id)s,
            google_rating = %(google_rating)s,
            google_total_ratings = %(google_total_ratings)s,
            google_opening_hours = %(google_opening_hours)s,
            google_phone = %(google_phone)s,
            google_website = %(google_website)s,
            google_photos = %(google_photos)s,
            google_business_status = %(google_business_status)s,
            google_enriched_at = now(),
            verification_status = %(verification_status)s,
            updated_at = now()
        where id = %(id)s
        """,
        {
            **data,
            "id": entity_id,
            "google_opening_hours": Jsonb(data.get("google_opening_hours") or {}),
        },
    )


def upsert_verification_data(conn: psycopg.Connection, data: dict[str, Any]) -> None:
    """Record one field-level check (AI value vs. Google value) with conflict flag."""
    conn.execute(
        """
        insert into verification_data (
            entity_id, field_name, ai_value, verified_value,
            verification_source, conflict_exists, conflict_note
        ) values (
            %(entity_id)s, %(field_name)s, %(ai_value)s, %(verified_value)s,
            %(verification_source)s, %(conflict_exists)s, %(conflict_note)s
        )
        on conflict (entity_id, field_name, verification_source) do update set
            ai_value = excluded.ai_value,
            verified_value = excluded.verified_value,
            conflict_exists = excluded.conflict_exists,
            conflict_note = excluded.conflict_note,
            verified_at = now()
        """,
        data,
    )


# ---------------------------------------------------------------------------
# Stage 8: Scoring
# ---------------------------------------------------------------------------

def list_pois(conn: psycopg.Connection) -> list[dict[str, Any]]:
    return conn.execute("select id, name from points_of_interest").fetchall()


def get_evidence_for_poi(conn: psycopg.Connection, entity_id: str) -> list[dict[str, Any]]:
    return conn.execute(
        "select stance, recommendation_strength, extraction_confidence, claims, "
        "source_views_at_extraction, source_upload_date "
        "from entity_evidence where entity_id=%s",
        (entity_id,),
    ).fetchall()


def update_poi_scoring(conn: psycopg.Connection, entity_id: str, fields: dict[str, Any]) -> None:
    conn.execute(
        """
        update points_of_interest set
            recommendation_score = %(recommendation_score)s,
            specialities = %(specialities)s,
            tips = %(tips)s,
            warnings = %(warnings)s,
            best_time = %(best_time)s,
            price_level = %(price_level)s,
            average_cost_inr = %(average_cost_inr)s,
            crowd_info = %(crowd_info)s,
            updated_at = now()
        where id = %(id)s
        """,
        {**fields, "id": entity_id},
    )
