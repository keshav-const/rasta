"""Shared ingestion core for NON-video sources (blogs, Reddit, …).

The pipeline is source-agnostic from the gate onward, so any text source can reuse the SAME
travel gate + entity extractor as YouTube. A source becomes a row in `sources` with its own
`platform` and `creator_name`; we persist only extracted FACTS + attribution + the link.
"""
from __future__ import annotations

from typing import Any

from . import db, llm
from .stages import stage3_gate, stage5_extract


def ingest_text_source(
    *,
    platform: str,          # "blog" | "reddit" | ...
    source_key: str,        # unique id stored in sources.video_id (e.g. "blog_<hash>")
    url: str,
    title: str,
    text: str,
    creator_name: str,
    upload_date: str | None = None,
    popularity: int = 0,    # stored as view_count (used later for scoring weight)
    language: str = "en",
    trust_source: bool = False,  # curated adapters (blog/reddit search) skip the YT-tuned gate
    content_type: str = "travel_guide",
) -> dict[str, Any]:
    """Run (gate ->) extract -> persist for one text source. Returns a small status dict.

    The travel gate is tuned for concise YouTube metadata and mis-scores messy blog HTML, so
    curated adapters pass trust_source=True to skip it and extract directly.
    """
    if len(text) < 200:
        return {"ok": False, "reason": "too_little_text", "chars": len(text)}

    meta = {
        "platform": platform, "url": url, "video_id": source_key,
        "title": title, "description": text[:600], "creator_name": creator_name,
        "creator_channel_id": None, "creator_subscribers": None,
        "duration_seconds": 0, "upload_date": upload_date,
        "view_count": popularity, "like_count": popularity,
        "default_language": language, "tags": [],
    }
    with db.connect() as conn:
        source_id = db.upsert_source_metadata(conn, meta)["id"]

    destinations: list[str] = []
    if not trust_source:
        # Gate — identical travel classifier used for videos.
        try:
            gate = stage3_gate.classify(meta)
        except llm.LLMError as e:
            with db.connect() as conn:
                db.mark_failed(conn, source_id, f"gate_error: {e}"[:300])
            return {"ok": False, "reason": "gate_error", "error": str(e)}
        if not gate.accepted:
            with db.connect() as conn:
                db.update_source_gate(conn, source_id, status="failed",
                                      failure_reason=f"gate_reject: {gate.reject_reason}", **gate.as_db_fields())
            return {"ok": False, "reason": "gate_reject", "detail": gate.reject_reason,
                    "score": gate.travel_score}
        content_type = gate.content_type
        destinations = gate.primary_destinations
        with db.connect() as conn:
            db.update_source_gate(conn, source_id, status="gated", failure_reason=None, **gate.as_db_fields())

    with db.connect() as conn:
        db.update_source_transcript(conn, source_id, transcript=text,
                                    transcript_source=platform, transcript_language=language)

    # Extract — identical entity extractor used for videos.
    try:
        ext = stage5_extract.extract_auto(
            video_id=source_key, title=title, channel=creator_name, upload_date=upload_date,
            content_type=content_type, destinations=destinations,
            language=language, transcript=text,
        )
    except llm.LLMError as e:
        with db.connect() as conn:
            db.mark_failed(conn, source_id, f"extraction_error: {e}"[:300])
        return {"ok": False, "reason": "extraction_error", "error": str(e)}

    with db.connect() as conn:
        db.update_source_extraction(conn, source_id, raw_extraction=ext.data,
                                    extraction_model=ext.model, extraction_confidence=ext.confidence)
    return {"ok": True, "entities": ext.entity_count, "claims": ext.claim_count,
            "content_type": content_type, "destinations": destinations}
