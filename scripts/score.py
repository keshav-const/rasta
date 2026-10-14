"""Stage 8 runner - recalculate scores + rollup fields for every POI.

Usage:
    python scripts/score.py            # score all POIs, print leaderboard

Idempotent: recomputes from evidence each run.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from pipeline import db                       # noqa: E402
from pipeline.stages import stage8_score      # noqa: E402


def main() -> int:
    with db.connect() as conn:
        pois = db.list_pois(conn)
    if not pois:
        print("No POIs to score.")
        return 0

    print(f"Scoring {len(pois)} POIs...")
    for p in pois:
        with db.connect() as conn:
            ev = db.get_evidence_for_poi(conn, p["id"])
            scored = stage8_score.score_poi(ev)
            db.update_poi_scoring(conn, p["id"], scored.as_fields())

    # leaderboard
    with db.connect() as conn:
        rows = conn.execute(
            "select name, poi_category, frequency_count, "
            "round((recommendation_score*100)::numeric,1) as score100, specialities "
            "from points_of_interest order by recommendation_score desc, frequency_count desc "
            "limit 15"
        ).fetchall()
    print("\n=== TOP POIs (score /100) ===")
    for r in rows:
        spec = ", ".join((r["specialities"] or [])[:3])
        print(f"  {r['score100']:>5}  {r['frequency_count']}x  {r['name']}  [{r['poi_category']}]"
              + (f"  - {spec}" if spec else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
