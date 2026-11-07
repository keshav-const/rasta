"""Stage 3: Travel Gate (cheap model).

Classify whether a video holds extractable travel/food/local-experience info,
so we never spend extraction credits on non-travel content.

Spec: pipeline-spec.md > STAGE 3.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .. import config, llm

# Gate thresholds (from spec).
REJECT_BELOW = 0.30       # travel_score < 0.30 -> not travel content
LOW_YIELD_BELOW = 0.50    # 0.30-0.50 -> accept but flag low-yield
MIN_DURATION = 15         # < 15s -> too short to extract
LONG_DURATION = 3600      # > 3600s -> flag for chunking

_SYSTEM = "You are a fast travel-content classifier. Respond with valid JSON only, no prose."

_PROMPT = """Analyze this YouTube video metadata and determine if it contains \
extractable travel, food, or local-CULTURE information.

Score by ENTITY EXTRACTABILITY, not by whether it is a formal "travel guide".
TWO kinds of entity are extractable and both score HIGH (0.7-1.0):
- PLACES: a video reviewing/recommending specific named places - restaurants,
  cafes, street food spots, markets, attractions, monuments, hotels, bars.
  Food reviews and "best places in <city>" count fully.
- CULTURE anchored to a region: an art form, dance, craft, folk/traditional
  festival, regional cuisine, or traditional sport/martial art/game tied to a
  PLACE or REGION - e.g. Chhau dance of Purulia, Theyyam of Kannur, Madhubani
  painting of Mithila, Bihu of Assam, Rann Utsav of Kutch, Kalaripayattu of
  Kerala, Jallikattu of Tamil Nadu. The tradition itself is the extractable
  entity; its region is the anchor. These are exactly the content we WANT.

Score LOW (<0.3) ONLY when nothing is extractable, e.g. a step-by-step recipe or
craft TUTORIAL with no cultural/geographic anchor, product unboxing, news, or a
generic talking-head with neither places nor a place-bound tradition.

Title: {title}
Description: {description}
Channel: {channel}
Tags: {tags}
Duration: {duration}s

Respond in JSON only:
{{
  "is_travel": true/false,
  "travel_score": 0.0-1.0,
  "content_type": "food_guide|travel_vlog|city_guide|hotel_review|attraction_review|listicle|art_culture|festival|craft|cuisine|sport|other",
  "estimated_entities": <number>,
  "primary_destinations": ["city/region names detected"],
  "reasoning": "one line"
}}"""


@dataclass
class GateResult:
    is_travel: bool
    travel_score: float
    content_type: str
    estimated_entities: int
    primary_destinations: list[str] = field(default_factory=list)
    reasoning: str = ""
    # decision (filled by decide())
    accepted: bool = False
    flags: list[str] = field(default_factory=list)
    reject_reason: str = ""

    def as_db_fields(self) -> dict[str, Any]:
        return {
            "travel_score": self.travel_score,
            "content_type": self.content_type,
            "estimated_entities": self.estimated_entities,
        }


def _clamp01(v: Any) -> float:
    try:
        return max(0.0, min(1.0, float(v)))
    except (TypeError, ValueError):
        return 0.0


def classify(meta: dict[str, Any]) -> GateResult:
    """Run the cheap model to score travel relevance. Then apply gate decision."""
    desc = (meta.get("description") or "")[:500]
    tags = meta.get("tags") or []
    user = _PROMPT.format(
        title=meta.get("title") or "",
        description=desc,
        channel=meta.get("creator_name") or "",
        tags=", ".join(tags[:20]),
        duration=meta.get("duration_seconds") or 0,
    )

    # Gemini flash spends "thinking" tokens before the JSON verdict, so 400 truncates (finish_reason
    # =length). 2500 leaves room for the thinking budget plus the small verdict.
    out = llm.chat_json(_SYSTEM, user, model=config.llm_gate_model(), max_tokens=2500)
    result = GateResult(
        is_travel=bool(out.get("is_travel")),
        travel_score=_clamp01(out.get("travel_score")),
        content_type=str(out.get("content_type") or "other"),
        estimated_entities=int(out.get("estimated_entities") or 0),
        primary_destinations=list(out.get("primary_destinations") or []),
        reasoning=str(out.get("reasoning") or ""),
    )
    return decide(meta, result)


def decide(meta: dict[str, Any], r: GateResult) -> GateResult:
    """Apply spec gate logic: set accepted / flags / reject_reason."""
    duration = meta.get("duration_seconds") or 0

    if duration and duration < MIN_DURATION:
        r.accepted = False
        r.reject_reason = "too_short"
        return r

    if r.travel_score < REJECT_BELOW:
        r.accepted = False
        r.reject_reason = "low_travel_score"
        return r

    r.accepted = True
    if r.travel_score < LOW_YIELD_BELOW:
        r.flags.append("low_yield")
    if duration and duration > LONG_DURATION:
        r.flags.append("long_needs_chunking")
    return r
