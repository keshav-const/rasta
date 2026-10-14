"""Stage 7 runner - enrich canonical POIs with Google Places data.

Usage:
    python scripts/enrich.py              # enrich POIs never enriched before
    python scripts/enrich.py --force      # re-fetch every active POI (re-verify)

Requires GOOGLE_PLACES_API_KEY in .env. Without it, exits cleanly (no-op) so the
rest of the pipeline is unaffected. Idempotent: google_* fields are overwritten,
verification_data is upserted; AI-extracted claim columns are never touched.
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
from pipeline.stages import stage7_enrich     # noqa: E402


def main() -> int:
    if not stage7_enrich.enrich_configured():
        print("GOOGLE_PLACES_API_KEY not set — skipping Stage 7 enrichment.")
        return 0

    force = "--force" in sys.argv
    with db.connect() as conn:
        pois = db.list_pois_for_enrichment(conn, force=force)
    if not pois:
        print("No POIs to enrich." + (" (all enriched; use --force to re-fetch)" if not force else ""))
        return 0

    print(f"Enriching {len(pois)} POI(s){' [force]' if force else ''}...\n")
    totals: Counter = Counter()
    for poi in pois:
        try:
            with db.connect() as conn:
                outcome = stage7_enrich.enrich_poi(conn, poi)
        except Exception as e:  # one bad lookup shouldn't halt the batch
            outcome = "error"
            print(f"  ! {poi['name']}: {e}")
        totals[outcome] += 1
        if outcome != "error":
            print(f"  {poi['name']}: {outcome}")

    print("\n=== TOTALS ===")
    for k, v in sorted(totals.items()):
        print(f"  {k}: {v}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
