#!/usr/bin/env python3
"""Throttled recovery of transcript-blocked YouTube sources.

YouTube IP-blocks bulk transcript pulls (sources end up status='failed' with a
failure_reason mentioning IpBlocked). The block self-lifts in hours. This script:

  1. PROBES whether the block has lifted (one real transcript fetch).
  2. If clear, re-runs a CAPPED, PACED batch of blocked sources via run.py --force.
     Pacing between pulls lives in stage4 (TRANSCRIPT_MIN_INTERVAL_SEC); this adds a
     per-run cap and STOPS EARLY if the IP gets blocked again, so an outer loop can
     retry later without hammering.

Usage:
  python scripts/retry_blocked.py --probe      # exit 0 if clear, 2 if still blocked
  python scripts/retry_blocked.py [--max N]    # drain up to N blocked sources (default 40)
  python scripts/retry_blocked.py --count      # print how many are still blocked, exit

LLM extraction env (LLM_API_KEY/BASE_URL/MODEL) must be set by the caller
(see scripts/auto_retry_blocked.sh).
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline import db
from pipeline.stages import stage4_transcript as s4

# A video that reliably has captions — used only to test block status.
PROBE_VIDEO = "dQw4w9WgXcQ"


def is_blocked() -> bool:
    """True if the transcript endpoint is currently IP-blocked for us."""
    try:
        s4.fetch_transcript(PROBE_VIDEO)
        return False
    except s4.TranscriptError as e:
        return "blocked" in str(e).lower()
    except Exception:
        return False  # other errors aren't a block signal


def blocked_sources(limit: int) -> list[dict]:
    with db.connect() as c:
        # NB: this query is parameterized (limit %s), so the literal % in the
        # ILIKE pattern must be doubled (%%) or psycopg reads %I as a placeholder.
        return [dict(r) for r in c.execute(
            """select id, url, video_id from sources
               where status = 'failed' and failure_reason ilike '%%IpBlocked%%'
               order by updated_at asc
               limit %s""",
            (limit,),
        ).fetchall()]


def count_blocked() -> int:
    with db.connect() as c:
        return c.execute(
            "select count(*) as n from sources "
            "where status='failed' and failure_reason ilike '%IpBlocked%'"
        ).fetchone()["n"]


def drain(max_n: int) -> int:
    """Re-run up to max_n blocked sources. Returns count recovered. Stops early
    if the IP re-blocks (3 consecutive block signals)."""
    rows = blocked_sources(max_n)
    if not rows:
        print("[retry] nothing blocked — queue empty")
        return 0
    print(f"[retry] draining {len(rows)} blocked sources (of {count_blocked()} total)")
    recovered = 0
    consecutive_block = 0
    for i, row in enumerate(rows, 1):
        url = row["url"] or f"https://youtu.be/{row['video_id']}"
        r = subprocess.run(
            [sys.executable, "scripts/run.py", url, "--force"],
            capture_output=True, text=True,
        )
        out = (r.stdout + r.stderr)
        if "extracted" in out and "stage5] ok" in out:
            recovered += 1
            consecutive_block = 0
            tag = "OK"
        elif "blocked" in out.lower() or "ipblocked" in out.lower():
            consecutive_block += 1
            tag = "BLOCKED"
        else:
            consecutive_block = 0
            tag = "skip"  # no captions / disabled / other — not a block
        print(f"[retry] [{i}/{len(rows)}] {tag}: {url}")
        if consecutive_block >= 3:
            print("[retry] re-blocked (3 in a row) — stopping; outer loop will retry later")
            break
    print(f"[retry] recovered {recovered}; {count_blocked()} still blocked")
    return recovered


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="store_true", help="test block status only")
    ap.add_argument("--count", action="store_true", help="print blocked count only")
    ap.add_argument("--max", type=int, default=40, help="max sources to drain this run")
    args = ap.parse_args()

    if args.count:
        print(count_blocked())
        return 0
    if args.probe:
        blocked = is_blocked()
        print("BLOCKED" if blocked else "CLEAR")
        return 2 if blocked else 0

    if is_blocked():
        print("[retry] still IP-blocked — try again later")
        return 2
    drain(args.max)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
