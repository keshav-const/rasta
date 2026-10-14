"""Stage 6: Entity Resolution.

Match each Stage-5 extracted mention to a canonical point_of_interest:
exact -> alias -> fuzzy, else create new (if confident) or queue for review.
Writes entity_evidence, logs every decision, and recounts POI frequency.

Google Places verification (spec Step 4) is deferred until GOOGLE_PLACES_API_KEY
is set; for now unmatched-but-confident entities become AI-extracted candidates.

Spec: pipeline-spec.md > STAGE 6.
"""
from __future__ import annotations

from collections import Counter
from typing import Any

import psycopg

from .. import db
from ..normalize import canonical_destination, normalize, similarity, slugify

FUZZY_AUTO = 0.85       # >= auto-link as fuzzy match
FUZZY_REVIEW = 0.70     # >= queue with suggestion; below = treat as no match
NEW_MIN_CONF = 0.70     # extraction_confidence >= to auto-create a new POI

_VALID_STANCES = {"recommended", "mentioned", "warned_against", "mixed"}
_POI_TYPES = {"poi", "activity"}


def _clean_stance(s: Any) -> str:
    s = str(s or "").strip().lower()
    return s if s in _VALID_STANCES else "mentioned"


def _write_evidence_and_log(
    conn, *, entity_id, source_id, entity, match_type, confidence, source_meta, notes=""
):
    """Attach this source's evidence to the canonical POI and log the decision."""
    db.upsert_evidence(conn, {
        "entity_id": entity_id,
        "source_id": source_id,
        "stance": _clean_stance(entity.get("stance")),
        "recommendation_strength": entity.get("recommendation_strength"),
        "extraction_confidence": entity.get("extraction_confidence"),
        "claims": entity.get("claims") or [],
        "views": source_meta.get("view_count"),
        "upload_date": source_meta.get("upload_date"),
    })
    db.recount_poi_frequency(conn, entity_id)
    db.insert_resolution_log(conn, {
        "source_id": source_id,
        "raw_name": (entity.get("raw_name") or "")[:300],
        "normalized_name": normalize(entity.get("normalized_name") or entity.get("raw_name") or ""),
        "canonical_entity_id": entity_id,
        "match_type": match_type,
        "match_confidence": confidence,
        "resolved_by": "auto",
        "notes": notes or None,
    })


def _queue_review(conn, *, source_id, entity, suggested_id, confidence, reason):
    db.insert_review_queue(conn, {
        "source_id": source_id,
        "raw_extraction": entity,
        "suggested_match_id": suggested_id,
        "suggested_confidence": confidence,
        "status": "pending",
    })
    db.insert_resolution_log(conn, {
        "source_id": source_id,
        "raw_name": (entity.get("raw_name") or "")[:300],
        "normalized_name": normalize(entity.get("normalized_name") or entity.get("raw_name") or ""),
        "canonical_entity_id": suggested_id,
        "match_type": "review",
        "match_confidence": confidence,
        "resolved_by": "auto",
        "notes": reason,
    })


def resolve_entity(
    conn: psycopg.Connection, source_id: str, entity: dict[str, Any], source_meta: dict[str, Any]
) -> str:
    """Resolve a single extracted entity. Returns the outcome label."""
    entity_type = str(entity.get("entity_type") or "poi").lower()
    if entity_type not in _POI_TYPES:
        _queue_review(conn, source_id=source_id, entity=entity, suggested_id=None,
                      confidence=None, reason=f"out_of_scope_type:{entity_type}")
        return "review:type"

    raw = entity.get("normalized_name") or entity.get("raw_name") or ""
    norm = normalize(raw)
    if not norm:
        _queue_review(conn, source_id=source_id, entity=entity, suggested_id=None,
                      confidence=None, reason="empty_name")
        return "review:empty"

    loc = entity.get("location") or {}
    dest_slug = canonical_destination(loc.get("destination"))
    if not dest_slug:
        _queue_review(conn, source_id=source_id, entity=entity, suggested_id=None,
                      confidence=None, reason=f"unmapped_destination:{loc.get('destination')}")
        return "review:destination"
    dest_id = db.get_destination_id(conn, dest_slug)

    area_id = None
    if loc.get("area"):
        area_id = db.get_area_id(conn, dest_id, slugify(loc["area"]))

    # --- match: exact -> alias -> fuzzy ---
    match_id: str | None = None
    match_type = ""
    confidence = 0.0

    ex = db.find_poi_exact(conn, dest_id, norm)
    if ex:
        match_id, match_type, confidence = ex["id"], "exact", 0.97
    else:
        al = db.find_alias(conn, norm)
        if al:
            match_id, match_type, confidence = al["canonical_entity_id"], "alias", 0.9
        else:
            best, best_sim = None, 0.0
            for poi in db.list_pois_for_destination(conn, dest_id):
                sim = similarity(norm, poi["normalized_name"] or "")
                if sim > best_sim:
                    best, best_sim = poi, sim
            if best and best_sim >= FUZZY_AUTO:
                match_id, match_type, confidence = best["id"], "fuzzy", round(best_sim, 2)
            elif best and best_sim >= FUZZY_REVIEW:
                _queue_review(conn, source_id=source_id, entity=entity,
                              suggested_id=best["id"], confidence=round(best_sim, 2),
                              reason=f"fuzzy_ambiguous:{round(best_sim, 2)}")
                return "review:fuzzy"

    # --- no match: create new (if confident) or queue ---
    if match_id is None:
        ext_conf = float(entity.get("extraction_confidence") or 0.0)
        if ext_conf < NEW_MIN_CONF:
            _queue_review(conn, source_id=source_id, entity=entity, suggested_id=None,
                          confidence=ext_conf, reason=f"low_confidence_new:{ext_conf}")
            return "review:lowconf"
        display = raw.strip() or norm
        match_id = db.insert_poi(conn, {
            "destination_id": dest_id,
            "area_id": area_id,
            "name": display,
            "name_local": entity.get("raw_name_local"),
            "slug": slugify(display) or norm.replace(" ", "-"),
            "normalized_name": norm,
            "entity_type": entity_type,
            "poi_category": entity.get("poi_category"),
            "attributes": entity.get("attributes") or {},
        })
        match_type, confidence = "new", round(ext_conf, 2)

    _write_evidence_and_log(
        conn, entity_id=match_id, source_id=source_id, entity=entity,
        match_type=match_type, confidence=confidence, source_meta=source_meta,
    )
    return match_type


def resolve_source(conn: psycopg.Connection, source: dict[str, Any]) -> Counter:
    """Resolve all entities in one extracted source. Returns outcome counts."""
    data = source["raw_extraction"] or {}
    stats: Counter = Counter()
    meta = {"view_count": source.get("view_count"), "upload_date": source.get("upload_date")}
    for entity in data.get("entities", []) or []:
        stats[resolve_entity(conn, source["id"], entity, meta)] += 1
    return stats
