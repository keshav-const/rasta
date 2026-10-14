"""Stage 5: AI Extraction - the core.

Transform an unstructured (often Hindi-English) transcript into structured
entity data: places, stances, claims with evidence + timestamps, confidence.

Output is stored raw in sources.raw_extraction (immutable). Canonical entities
are created later at Stage 6 (resolution). This stage only extracts + stores.

Spec: pipeline-spec.md > STAGE 5.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from .. import config, llm

_SYSTEM = (
    "You are a travel intelligence extraction system. You analyze YouTube video "
    "transcripts about travel/food content and extract every actionable piece of "
    "travel knowledge into a structured format. You respond with ONLY valid JSON - "
    "no markdown, no explanation, no preamble."
)

_USER = """CONTEXT:
- Video Title: {title}
- Creator: {channel}
- Upload Date: {upload_date}
- Video Type: {content_type}
- Primary Location: {destinations}
- Transcript Language: {language}

CRITICAL RULES:
1. Extract EVERY distinct place, restaurant, cafe, attraction, hotel, or notable
   location mentioned by name.
2. For each entity capture the creator's STANCE: recommended | mentioned |
   warned_against | mixed. "skip this" / "overrated" = warned_against.
3. Every factual claim (hours, prices, specialities, tips) MUST include the exact
   evidence quote from the transcript and the approximate timestamp_seconds. The
   transcript lines are prefixed with [seconds]. Claims without evidence are useless.
4. The transcript may be Hindi-English code-switched and auto-captions may garble
   proper nouns. If you can infer the likely correct name, put it in normalized_name
   and add "name_uncertain" to flags. Provide raw_name_local in Devanagari if you can.
5. If a place is only mentioned with no opinion, stance="mentioned" and
   recommendation_strength 0.1-0.3.
6. Do NOT extract generic references ("this city", "the market") unless resolvable
   to a specific named place.
7. Do NOT hallucinate. Only extract what the creator actually said.
8. Capture destination/area-level tips in general_tips; routes in routes_mentioned.

CONFIDENCE: 0.9-1.0 named+recommended+details; 0.7-0.89 named+opinion; 0.5-0.69
named but thin; 0.3-0.49 possibly garbled/brief; below 0.3 do not include.

ENTITY TYPES: poi (physical place) | activity (something you DO) | destination
(city/large area) | area (neighborhood).
POI CATEGORIES: restaurant, cafe, bar, street_food, bakery, sweet_shop, attraction,
monument, market, hotel, hostel, shop, park, temple, mosque, gurudwara, museum,
viewpoint, mall, coworking, salon, other.
CLAIM FIELDS: speciality, must_try_item, price_level, average_cost, opening_hours,
closing_hours, best_time, worst_time, crowd_level, waiting_time, parking,
accessibility, tip, warning, seasonal_note, dress_code, reservation_needed,
payment_modes, contact, website.

Respond with ONLY valid JSON matching this schema:
{{
  "schema_version": "1.0",
  "source_video_id": "{video_id}",
  "extraction_metadata": {{
    "transcript_language": "{language}",
    "transcript_quality": "good|fair|poor",
    "overall_extraction_confidence": 0.0-1.0
  }},
  "video_context": {{
    "is_travel": true,
    "content_type": "{content_type}",
    "creator_intent": "guide|review|experience|comparison|listicle|vlog",
    "primary_destinations": [{{"name": "Delhi", "type": "city", "areas_covered": []}}],
    "video_summary": "1-2 line summary"
  }},
  "entities": [{{
    "temp_id": "e1",
    "raw_name": "as heard",
    "raw_name_local": "Devanagari or null",
    "normalized_name": "clean name",
    "entity_type": "poi",
    "poi_category": "restaurant",
    "activity_type": null,
    "location": {{"destination": "Delhi", "area": "...", "geo_hints": [], "address_if_mentioned": null}},
    "stance": "recommended",
    "recommendation_strength": 0.0-1.0,
    "extraction_confidence": 0.0-1.0,
    "claims": [{{"field": "speciality", "value": "...", "evidence": "exact quote", "timestamp_seconds": 0, "confidence": 0.0-1.0}}],
    "attributes": {{"cuisine": [], "dietary_info": [], "ambiance": [], "payment": null}},
    "flags": [],
    "flag_reasons": []
  }}],
  "routes_mentioned": [{{"description": "...", "waypoints": ["e1","e2"], "transport_mode": "walking", "approximate_duration": "..."}}],
  "general_tips": [{{"applies_to": "...", "tip": "...", "evidence": "...", "timestamp_seconds": 0}}]
}}

TRANSCRIPT:
---
{transcript}
---"""


@dataclass
class ExtractionResult:
    data: dict[str, Any]
    entity_count: int
    claim_count: int
    confidence: float
    model: str
    chunks: int = 1

# Videos longer/denser than this (transcript chars) are chunked up front to
# avoid output-token truncation on many-entity listicles.
CHUNK_TRIGGER_CHARS = 13000
CHUNK_WINDOW_SECONDS = 300   # ~5 min per chunk
CHUNK_OVERLAP_SECONDS = 30   # carry 30s of context between chunks


def _primary_dest_names(meta_gate_dests: Any) -> str:
    if isinstance(meta_gate_dests, list):
        return ", ".join(str(d) for d in meta_gate_dests)
    return str(meta_gate_dests or "")


def _call_extract(video_id, title, channel, upload_date, content_type,
                  destinations, language, transcript, max_tokens) -> dict[str, Any]:
    """One LLM extraction call over `transcript`. Returns parsed dict."""
    user = _USER.format(
        title=title or "",
        channel=channel or "",
        upload_date=upload_date or "",
        content_type=content_type or "other",
        destinations=_primary_dest_names(destinations),
        language=language or "",
        video_id=video_id,
        transcript=transcript,
    )
    data = llm.chat_json(
        _SYSTEM, user, model=config.llm_model(), max_tokens=max_tokens, timeout=180
    )
    if not isinstance(data.get("entities"), list):
        raise llm.LLMError("extraction output missing 'entities' list")
    return data


def _result(data: dict[str, Any], chunks: int) -> ExtractionResult:
    entities = data.get("entities", [])
    meta = data.get("extraction_metadata", {}) or {}
    try:
        confidence = float(meta.get("overall_extraction_confidence") or 0.0)
    except (TypeError, ValueError):
        confidence = 0.0
    meta["model_used"] = config.llm_model()
    if chunks > 1:
        meta["chunked"] = True
        meta["chunk_count"] = chunks
    data["extraction_metadata"] = meta
    return ExtractionResult(
        data=data,
        entity_count=len(entities),
        claim_count=sum(len(e.get("claims", []) or []) for e in entities),
        confidence=confidence,
        model=config.llm_model(),
        chunks=chunks,
    )


def extract(*, video_id, title, channel, upload_date, content_type,
            destinations, language, transcript, max_tokens: int = 16000) -> ExtractionResult:
    """Single-call extraction. Raises llm.LLMError (incl. truncation) on failure."""
    data = _call_extract(video_id, title, channel, upload_date, content_type,
                         destinations, language, transcript, max_tokens)
    return _result(data, chunks=1)


# --- Chunking (spec: STAGE 5 > Handling Long Transcripts) ---------------------

def _parse_lines(transcript: str) -> list[tuple[int, str]]:
    """Parse timestamped transcript lines '[<sec>] text' -> [(sec, text)]."""
    out: list[tuple[int, str]] = []
    for line in transcript.splitlines():
        line = line.strip()
        if not line.startswith("["):
            continue
        close = line.find("]")
        if close == -1:
            continue
        try:
            sec = int(line[1:close])
        except ValueError:
            continue
        out.append((sec, line[close + 1:].strip()))
    return out


def _chunk_transcript(
    transcript: str,
    window: int = CHUNK_WINDOW_SECONDS,
    overlap: int = CHUNK_OVERLAP_SECONDS,
) -> list[str]:
    """Split a timestamped transcript into ~`window`-second chunks with overlap."""
    lines = _parse_lines(transcript)
    if not lines:
        return [transcript]
    end = lines[-1][0]
    step = max(window - overlap, 60)
    chunks: list[str] = []
    w = 0
    while w <= end:
        seg = [f"[{s}] {t}" for s, t in lines if w <= s < w + window and t]
        if seg:
            chunks.append("\n".join(seg))
        w += step
    return chunks or [transcript]


_WILDCARD_AREAS = {"", "unknown", "various", "multiple", "multiple locations", "n/a", "implied"}


def _norm_area(area: str) -> str:
    """Lowercase, drop punctuation, collapse whitespace - for area comparison."""
    return re.sub(r"[^a-z0-9 ]", "", (area or "").lower()).strip()


def _area_compatible(a1: str, a2: str) -> bool:
    """Same place across chunks: equal normalized areas, or one is a wildcard."""
    n1, n2 = _norm_area(a1), _norm_area(a2)
    if n1 == n2:
        return True
    return n1 in _WILDCARD_AREAS or n2 in _WILDCARD_AREAS


def _merge(results: list[dict[str, Any]]) -> dict[str, Any]:
    """Merge per-chunk extractions: dedupe entities by normalized_name +
    compatible area, union their claims, and combine context/tips/routes.

    (Name-variant and cross-source dedup is Stage 6's job; this handles the
    obvious within-video duplicates created by chunk overlap.)"""
    merged: dict[str, Any] = {}
    by_name: dict[str, list[dict[str, Any]]] = {}
    tips: list[dict[str, Any]] = []
    routes: list[dict[str, Any]] = []
    dests: dict[str, dict[str, Any]] = {}
    summary = ""
    confidences: list[float] = []

    for data in results:
        ctx = data.get("video_context", {}) or {}
        summary = summary or ctx.get("video_summary", "")
        for d in ctx.get("primary_destinations", []) or []:
            if isinstance(d, dict) and d.get("name"):
                dests.setdefault(d["name"], d)
        m = data.get("extraction_metadata", {}) or {}
        try:
            confidences.append(float(m.get("overall_extraction_confidence") or 0))
        except (TypeError, ValueError):
            pass

        for e in data.get("entities", []) or []:
            name = (e.get("normalized_name") or e.get("raw_name") or "").strip().lower()
            if not name:
                continue
            area = ((e.get("location") or {}).get("area") or "")
            bucket = by_name.setdefault(name, [])
            for existing in bucket:
                ex_area = ((existing.get("location") or {}).get("area") or "")
                if _area_compatible(area, ex_area):
                    _merge_entity(existing, e)
                    # prefer a concrete area over a wildcard one
                    if _norm_area(ex_area) in _WILDCARD_AREAS and _norm_area(area) not in _WILDCARD_AREAS:
                        existing.setdefault("location", {})["area"] = area
                    break
            else:
                bucket.append(e)

        for t in data.get("general_tips", []) or []:
            if t.get("tip") and t["tip"] not in {x.get("tip") for x in tips}:
                tips.append(t)
        routes.extend(data.get("routes_mentioned", []) or [])

    entities = [e for bucket in by_name.values() for e in bucket]
    for i, e in enumerate(entities, 1):
        e["temp_id"] = f"e{i}"

    merged["schema_version"] = "1.0"
    merged["video_context"] = {
        "is_travel": True,
        "primary_destinations": list(dests.values()),
        "video_summary": summary,
    }
    merged["entities"] = entities
    merged["general_tips"] = tips
    merged["routes_mentioned"] = routes
    merged["extraction_metadata"] = {
        "overall_extraction_confidence": round(sum(confidences) / len(confidences), 3)
        if confidences else 0.0,
    }
    return merged


def _merge_entity(base: dict[str, Any], other: dict[str, Any]) -> None:
    """Fold `other` into `base`: union claims (by field+value), keep max confidence."""
    seen = {
        (c.get("field", "").lower(), str(c.get("value", "")).strip().lower())
        for c in base.get("claims", []) or []
    }
    for c in other.get("claims", []) or []:
        k = (c.get("field", "").lower(), str(c.get("value", "")).strip().lower())
        if k not in seen:
            base.setdefault("claims", []).append(c)
            seen.add(k)
    base["extraction_confidence"] = max(
        base.get("extraction_confidence", 0) or 0,
        other.get("extraction_confidence", 0) or 0,
    )
    for fl in other.get("flags", []) or []:
        if fl not in base.setdefault("flags", []):
            base["flags"].append(fl)


def extract_chunked(*, video_id, title, channel, upload_date, content_type,
                    destinations, language, transcript,
                    max_tokens: int = 16000) -> ExtractionResult:
    """Chunk the transcript, extract each chunk, merge results."""
    chunks = _chunk_transcript(transcript)
    results: list[dict[str, Any]] = []
    for i, chunk in enumerate(chunks, 1):
        data = _call_extract(video_id, title, channel, upload_date, content_type,
                             destinations, language, chunk, max_tokens)
        results.append(data)
    return _result(_merge(results), chunks=len(chunks))


def extract_auto(*, video_id, title, channel, upload_date, content_type,
                 destinations, language, transcript,
                 max_tokens: int = 16000) -> ExtractionResult:
    """Pick single-call vs chunked by transcript size; fall back to chunking on truncation."""
    if len(transcript) > CHUNK_TRIGGER_CHARS:
        return extract_chunked(
            video_id=video_id, title=title, channel=channel, upload_date=upload_date,
            content_type=content_type, destinations=destinations, language=language,
            transcript=transcript, max_tokens=max_tokens,
        )
    try:
        return extract(
            video_id=video_id, title=title, channel=channel, upload_date=upload_date,
            content_type=content_type, destinations=destinations, language=language,
            transcript=transcript, max_tokens=max_tokens,
        )
    except llm.LLMError as e:
        if "truncated" in str(e).lower():
            return extract_chunked(
                video_id=video_id, title=title, channel=channel, upload_date=upload_date,
                content_type=content_type, destinations=destinations, language=language,
                transcript=transcript, max_tokens=max_tokens,
            )
        raise
