"""Stage 6 runner - resolve all extracted sources into canonical POIs + evidence.

Usage:
    python scripts/resolve.py            # process every source with status=extracted

Idempotent: evidence is upserted (unique per entity+source), exact-match prevents
duplicate POIs, so re-running is safe.
"""
from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from pipeline import db                       # noqa: E402
from pipeline.stages import stage6_resolve    # noqa: E402


def main() -> int:
    with db.connect() as conn:
        sources = db.list_extracted_sources(conn)
    if not sources:
        print("No sources with status=extracted. Nothing to resolve.")
        return 0

    print(f"Resolving {len(sources)} source(s)...\n")
    totals: Counter = Counter()
    for s in sources:
        with db.connect() as conn:
            stats = stage6_resolve.resolve_source(conn, s)
            db.mark_resolved(conn, s["id"])
        totals.update(stats)
        summary = ", ".join(f"{k}={v}" for k, v in sorted(stats.items()))
        print(f"  {s['video_id']}: {summary or '(no entities)'}")

    print("\n=== TOTALS ===")
    for k, v in sorted(totals.items()):
        print(f"  {k}: {v}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
