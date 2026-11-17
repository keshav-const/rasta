#!/usr/bin/env python3
"""Merge near-duplicate entities that are the SAME thing under a slightly different name.

Conservative by design. Within one destination, two active entities are merged ONLY when
their names are identical after stripping a trailing *event-suffix* word — e.g.
"Bohag Bihu" ≡ "Bohag Bihu festival", "Durga Puja" ≡ "Durga Puja Utsav". It does NOT strip
form words like "dance", "geet", "music", "painting", so genuinely distinct entities
("Bihu dance" vs "Bihu Geet" vs "Magh Bihu") are left untouched.

Merge = repoint the loser's evidence to the keeper (skipping sources the keeper already has),
delete the loser's leftover evidence, deactivate the loser, and recount the keeper's sources.
Dry-run by default; --apply to execute, then run scripts/score.py.
"""
from __future__ import annotations

import argparse
import re
import sys
from collections import defaultdict

sys.path.insert(0, "/Users/admin/Downloads/ts")
from pipeline import db  # noqa: E402

# Trailing words that mean "...the event/celebration of X" — safe to fold into the bare form.
EVENT_SUFFIX = {
    "festival", "festivals", "fest", "celebration", "celebrations", "utsav", "utsavam",
    "mela", "mahotsav", "mahotsava", "parv", "parva", "puja", "pooja", "jatra", "yatra",
}


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]", " ", (s or "").lower()).strip()


def base_name(name: str) -> str:
    """Normalized name with a single trailing event-suffix word removed (if any)."""
    words = norm(name).split()
    if len(words) >= 2 and words[-1] in EVENT_SUFFIX:
        words = words[:-1]
    return " ".join(words)


def pick_keeper(rows: list[dict]) -> dict:
    # Prefer: most sources, then the bare (shorter, no-suffix) name, then lexical.
    return sorted(
        rows,
        key=lambda r: (-(r["frequency_count"] or 0), len(norm(r["name"])), r["name"].lower()),
    )[0]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="execute (default: dry run)")
    args = ap.parse_args()

    with db.connect() as conn:
        rows = [
            dict(r)
            for r in conn.execute(
                """select p.id::text id, p.name, p.entity_type, p.frequency_count,
                          p.destination_id::text dest
                   from points_of_interest p
                   where p.is_active and p.destination_id is not null
                     and p.entity_type <> 'poi'"""  # never fold a festival into a place
            ).fetchall()
        ]

    # group by (destination, base-name); only groups with >1 DISTINCT name are candidates
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for r in rows:
        groups[(r["dest"], base_name(r["name"]))].append(r)

    merges = []  # (keeper, [losers])
    for (_dest, base), members in groups.items():
        if len(members) < 2 or not base:
            continue
        names = {norm(m["name"]) for m in members}
        # require that at least one member actually differs only by the suffix (or exact dup)
        if len(names) < 2 and len(members) < 2:
            continue
        keeper = pick_keeper(members)
        losers = [m for m in members if m["id"] != keeper["id"]]
        if losers:
            merges.append((keeper, losers))

    total_losers = sum(len(l) for _, l in merges)
    print(f"=== ENTITY DEDUP ({'APPLY' if args.apply else 'DRY RUN'}) ===")
    print(f"scanned {len(rows)} active entities; {len(merges)} merge groups, "
          f"{total_losers} duplicates to fold in\n")
    for keeper, losers in sorted(merges, key=lambda kl: -len(kl[1]))[:60]:
        print(f"  keep: {keeper['name']}  (fc={keeper['frequency_count']})")
        for l in losers:
            print(f"      ← {l['name']}  (fc={l['frequency_count']})")
    if len(merges) > 60:
        print(f"  … and {len(merges) - 60} more groups")

    if not args.apply:
        print("\nDRY RUN — re-run with --apply, then: python scripts/score.py")
        return 0

    moved = deactivated = 0
    with db.connect() as conn:
        for keeper, losers in merges:
            for l in losers:
                # move evidence the keeper doesn't already have, then drop the rest
                conn.execute(
                    """update entity_evidence ee set entity_id = %s
                       where ee.entity_id = %s
                         and ee.source_id not in (
                             select source_id from entity_evidence where entity_id = %s)""",
                    (keeper["id"], l["id"], keeper["id"]),
                )
                conn.execute("delete from entity_evidence where entity_id = %s", (l["id"],))
                conn.execute(
                    "update points_of_interest set is_active = false, updated_at = now() where id = %s",
                    (l["id"],),
                )
                deactivated += 1
            # recount keeper's corroboration
            conn.execute(
                """update points_of_interest p
                   set frequency_count = (select count(distinct source_id)
                                          from entity_evidence where entity_id = %s),
                       updated_at = now()
                   where p.id = %s""",
                (keeper["id"], keeper["id"]),
            )
            moved += 1
        conn.commit()
    print(f"\nAPPLIED: {moved} keepers updated, {deactivated} duplicates deactivated.")
    print("Now run: python scripts/score.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
