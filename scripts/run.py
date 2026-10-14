"""Pipeline runner - Stages 1-2 (input validation + metadata fetch).

Usage:
    python scripts/run.py "https://www.youtube.com/watch?v=VIDEOID"
    python scripts/run.py --force "https://youtu.be/VIDEOID"   # refetch even if duplicate

More stages (gate, transcript, extraction...) get chained here as they land.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow running as a plain script: put project root on the import path.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Windows consoles default to cp1252 and crash on Devanagari/emoji in titles.
# Force UTF-8 output (replace anything unencodable rather than crash).
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from pipeline import config, db, llm                     # noqa: E402
from pipeline.stages import (  # noqa: E402
    stage1_input,
    stage2_metadata,
    stage3_gate,
    stage4_transcript,
    stage5_extract,
)


def run(url: str, force: bool = False) -> int:
    # DB connections are opened per-operation (short-lived). Never hold a
    # connection open across a network/LLM call - the pooler drops idle conns.

    # --- Stage 1: validate + dup check ---
    res = stage1_input.validate_url(url)
    if not res.is_valid:
        print(f"[stage1] REJECT - {res.reason}: {url}")
        return 1
    print(f"[stage1] valid - video_id={res.video_id}")

    with db.connect() as conn:
        existing = stage1_input.check_duplicate(conn, res.video_id)
    if existing and not force:
        print(
            f"[stage1] DUPLICATE - already processed "
            f"(id={existing['id']}, status={existing['status']}). Use --force to refetch."
        )
        return 0
    if existing and force:
        print(f"[stage1] duplicate found (status={existing['status']}); --force -> refetching")

    # --- Stage 2: metadata ---
    if not config.get("YOUTUBE_API_KEY"):
        print("[stage2] SKIP - YOUTUBE_API_KEY not set in .env (Stage 1 + dup-check OK)")
        return 0
    try:
        meta = stage2_metadata.fetch_metadata(res.video_id, url)
    except stage2_metadata.MetadataError as e:
        print(f"[stage2] FAIL - {e}")
        return 1
    print(
        f"[stage2] ok - \"{meta['title']}\" by {meta['creator_name']} "
        f"| {meta['duration_seconds']}s | {meta['view_count']} views | uploaded {meta['upload_date']}"
    )
    with db.connect() as conn:
        source_id = db.upsert_source_metadata(conn, meta)["id"]
    print(f"[db] stored - source id={source_id} status=metadata_fetched")

    # --- Stage 3: travel gate ---
    if not config.llm_configured():
        print("[stage3] SKIP - LLM_API_KEY/LLM_BASE_URL/LLM_MODEL not set in .env")
        return 0
    try:
        gate = stage3_gate.classify(meta)
    except llm.LLMError as e:
        with db.connect() as conn:
            db.update_source_gate(
                conn, source_id, travel_score=0.0, content_type="other",
                estimated_entities=0, status="failed", failure_reason=f"gate_error: {e}"[:300],
            )
        print(f"[stage3] FAIL - {e} -> status=failed")
        return 1

    flags = f" flags={gate.flags}" if gate.flags else ""
    print(
        f"[stage3] score={gate.travel_score:.2f} type={gate.content_type} "
        f"est_entities={gate.estimated_entities} dests={gate.primary_destinations}{flags}"
    )
    if not gate.accepted:
        with db.connect() as conn:
            db.update_source_gate(
                conn, source_id, status="failed",
                failure_reason=f"gate_reject: {gate.reject_reason}", **gate.as_db_fields(),
            )
        print(f"[stage3] REJECT - {gate.reject_reason} ({gate.reasoning})")
        return 0
    with db.connect() as conn:
        db.update_source_gate(
            conn, source_id, status="gated", failure_reason=None, **gate.as_db_fields(),
        )
    print(f"[stage3] ACCEPT -> status=gated ({gate.reasoning})")

    # --- Stage 4: transcript retrieval ---
    try:
        tr = stage4_transcript.fetch_transcript(
            res.video_id, default_language=meta.get("default_language")
        )
    except stage4_transcript.TranscriptError as e:
        with db.connect() as conn:
            db.mark_failed(conn, source_id, f"no_transcript: {e}")
        print(f"[stage4] FAIL - {e} -> status=failed")
        return 0
    with db.connect() as conn:
        db.update_source_transcript(
            conn, source_id,
            transcript=tr.text, transcript_source=tr.source, transcript_language=tr.language,
        )
    print(
        f"[stage4] ok - {tr.source} track, lang={tr.language}, "
        f"{tr.segment_count} segments, {len(tr.text)} chars -> status=transcript_fetched"
    )

    # --- Stage 5: AI extraction ---
    try:
        ext = stage5_extract.extract_auto(
            video_id=res.video_id,
            title=meta.get("title") or "",
            channel=meta.get("creator_name") or "",
            upload_date=meta.get("upload_date"),
            content_type=gate.content_type,
            destinations=gate.primary_destinations,
            language=tr.language,
            transcript=tr.text,
        )
    except llm.LLMError as e:
        with db.connect() as conn:
            db.mark_failed(conn, source_id, f"extraction_error: {e}")
        print(f"[stage5] FAIL - {e} -> status=failed")
        return 1
    with db.connect() as conn:
        db.update_source_extraction(
            conn, source_id,
            raw_extraction=ext.data, extraction_model=ext.model,
            extraction_confidence=ext.confidence,
        )
    chunk_note = f" ({ext.chunks} chunks)" if ext.chunks > 1 else ""
    print(
        f"[stage5] ok - {ext.entity_count} entities, {ext.claim_count} claims, "
        f"confidence={ext.confidence:.2f}{chunk_note} -> status=extracted"
    )

    return 0


def main() -> None:
    ap = argparse.ArgumentParser(description="Travel Intelligence pipeline (Stages 1-2)")
    ap.add_argument("url", help="YouTube video URL")
    ap.add_argument("--force", action="store_true", help="refetch even if already processed")
    args = ap.parse_args()
    sys.exit(run(args.url, force=args.force))


if __name__ == "__main__":
    main()
