"""Stage 8: Scoring.

Compute a 0-1 recommendation_score per POI from its aggregated evidence, and
roll claims up into display fields (specialities, tips, warnings, best_time...).

recommendation_score =
    0.30*frequency + 0.20*recency + 0.20*sentiment + 0.15*authority + 0.15*depth

Spec: pipeline-spec.md > STAGE 8.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from datetime import date
from typing import Any

FREQUENCY_CAP = 50            # 50+ distinct sources -> max frequency score
_SPECIALITY_FIELDS = {"speciality", "must_try_item"}
_PRICE_WORDS = {"budget", "moderate", "expensive", "luxury"}


@dataclass
class Scored:
    recommendation_score: float
    specialities: list[str] = field(default_factory=list)
    tips: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    best_time: str | None = None
    price_level: str | None = None
    average_cost_inr: int | None = None
    crowd_info: str | None = None

    def as_fields(self) -> dict[str, Any]:
        return {
            "recommendation_score": round(self.recommendation_score, 4),
            "specialities": self.specialities or None,
            "tips": self.tips or None,
            "warnings": self.warnings or None,
            "best_time": self.best_time,
            "price_level": self.price_level,
            "average_cost_inr": self.average_cost_inr,
            "crowd_info": self.crowd_info,
        }


def _recency_weight(upload: date | None, today: date) -> float:
    if not upload:
        return 0.2  # unknown age -> mild
    months = (today - upload).days / 30.44
    if months < 3:
        return 1.0
    if months < 6:
        return 0.7
    if months < 12:
        return 0.4
    if months < 24:
        return 0.2
    return 0.05


def _authority(views: Any) -> float:
    try:
        v = int(views or 0)
    except (TypeError, ValueError):
        v = 0
    return max(0.0, min(1.0, math.log10(v + 1) / 8))


def _first_int(text: str) -> int | None:
    m = re.search(r"\d[\d,]*", str(text))
    return int(m.group().replace(",", "")) if m else None


def score_poi(evidence: list[dict[str, Any]], today: date | None = None) -> Scored:
    today = today or date.today()
    if not evidence:
        return Scored(recommendation_score=0.0)

    # --- frequency ---
    n = len(evidence)
    frequency = min(n / FREQUENCY_CAP, 1.0)

    # --- recency (mean of per-source weights) ---
    recency = sum(_recency_weight(e.get("source_upload_date"), today) for e in evidence) / n

    # --- sentiment ---
    svals: list[float] = []
    for e in evidence:
        stance = (e.get("stance") or "mentioned").lower()
        rs = e.get("recommendation_strength")
        rs = float(rs) if rs is not None else 0.5
        if stance == "recommended":
            svals.append(rs)
        elif stance == "warned_against":
            svals.append(-rs)
        elif stance == "mixed":
            svals.append(0.3)
        else:
            svals.append(0.5)
    raw_sentiment = sum(svals) / len(svals)
    sentiment = (raw_sentiment + 1) / 2      # normalize -1..1 -> 0..1

    # --- authority (mean over sources) ---
    authority = sum(_authority(e.get("source_views_at_extraction")) for e in evidence) / n

    # --- depth + claim aggregation ---
    specialities: list[str] = []
    tips: list[str] = []
    warnings: list[str] = []
    best_time = price_level = crowd_info = None
    avg_cost: int | None = None
    all_claims = 0
    fields_seen: set[str] = set()

    for e in evidence:
        for c in e.get("claims") or []:
            f = str(c.get("field") or "").lower()
            val = str(c.get("value") or "").strip()
            if not val:
                continue
            all_claims += 1
            fields_seen.add(f)
            if f in _SPECIALITY_FIELDS and val not in specialities:
                specialities.append(val)
            elif f == "tip" and val not in tips:
                tips.append(val)
            elif f in ("warning",) and val not in warnings:
                warnings.append(val)
            elif f == "best_time" and not best_time:
                best_time = val
            elif f == "crowd_level" and not crowd_info:
                crowd_info = val
            elif f == "price_level" and not price_level:
                price_level = val.lower() if val.lower() in _PRICE_WORDS else val
            elif f in ("average_cost",) and avg_cost is None:
                avg_cost = _first_int(val)

    depth = min((all_claims / 10) * 0.5 + (len(fields_seen) / 8) * 0.5, 1.0)

    score = (
        0.30 * frequency
        + 0.20 * recency
        + 0.20 * sentiment
        + 0.15 * authority
        + 0.15 * depth
    )

    return Scored(
        recommendation_score=score,
        specialities=specialities,
        tips=tips,
        warnings=warnings,
        best_time=best_time,
        price_level=price_level,
        average_cost_inr=avg_cost,
        crowd_info=crowd_info,
    )
