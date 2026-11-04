#!/usr/bin/env python3
"""Enrich state/region destinations with official tourist-visit statistics.

Source: data.gov.in "State/UT-wise Number of Tourist Visitors" (2020-2024),
Ministry of Tourism. These are authoritative, current numbers that make a strong
API field ("verified annual visitors") at the state level — distinct from the
creator-sourced POI graph. Writes into destinations.stats JSON, e.g.

    {"tourist_visits": {"2020": ..., "2024": ...},
     "tourist_visits_source": "data.gov.in / Ministry of Tourism",
     "tourist_visits_updated": "2025-..."}

Needs DATA_GOV_IN_API_KEY in the environment / .env. Idempotent (re-run to refresh).
"""
from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline import config, db
from pipeline.normalize import normalize

RESOURCE = "d38be1f4-a2a4-4240-8b76-ef6f46566fc7"  # State/UT-wise Tourist Visitors 2020-2024
YEARS = ["_2020", "_2021", "_2022", "_2023", "_2024"]


def fetch_state_stats(api_key: str) -> dict[str, dict]:
    url = "https://api.data.gov.in/resource/" + RESOURCE + "?" + urllib.parse.urlencode(
        {"api-key": api_key, "format": "json", "limit": 100})
    req = urllib.request.Request(url, headers={"User-Agent": "RastaBot/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.load(r)
    out: dict[str, dict] = {}
    for rec in data.get("records", []):
        state = (rec.get("state_ut") or "").strip()
        if not state:
            continue
        visits = {}
        for y in YEARS:
            v = rec.get(y)
            try:
                visits[y.lstrip("_")] = int(v)
            except (TypeError, ValueError):
                pass
        if visits:
            out[normalize(state)] = {"name": state, "visits": visits}
    return out


def main() -> int:
    api_key = config.get("DATA_GOV_IN_API_KEY")
    if not api_key:
        print("DATA_GOV_IN_API_KEY not set", file=sys.stderr)
        return 1
    stats = fetch_state_stats(api_key)
    print(f"[stats] fetched {len(stats)} states from data.gov.in")

    # Match against our region destinations by normalized name.
    with db.connect() as c:
        regions = [dict(r) for r in c.execute(
            "select id, name from destinations where type = 'region'").fetchall()]

    matched = 0
    for d in regions:
        key = normalize(d["name"])
        rec = stats.get(key)
        if not rec:
            continue
        blob = {
            "tourist_visits": rec["visits"],
            "tourist_visits_source": "data.gov.in / Ministry of Tourism",
        }
        with db.connect() as c:
            c.execute(
                "update destinations set stats = stats || %s::jsonb, updated_at = now() where id = %s",
                (json.dumps(blob), d["id"]),
            )
            c.commit()
        matched += 1
        latest = rec["visits"].get("2024") or list(rec["visits"].values())[-1]
        print(f"[stats] {d['name']:20} 2024≈{latest:,}")
    print(f"[stats] enriched {matched}/{len(regions)} region destinations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
