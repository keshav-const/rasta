#!/usr/bin/env python3
"""Merge duplicate entities so their evidence (and thus trust) consolidates.

The resolver anchors entities per-destination, so the same real-world thing can end
up as several rows under different destinations (e.g. "Kaziranga National Park" under
both `guwahati` and `kaziranga`), splitting its sources/proof across duplicates.

This folds duplicates into one canonical row and re-points all their evidence onto it,
so a place's full set of independent sources counts toward one entity.

SAFE BY DESIGN — only merges when we're confident it's the same thing:
  - same normalized_name AND same entity_type, and
  - CULTURAL types (festival/cuisine/dish/sport/art_form/performing_art/craft/cultural):
    merged outright (tradition names are distinctive; a tradition is one entity), OR
  - PHYSICAL types (poi/activity): merged only when their coordinates are within
    MERGE_KM of each other (clearly the same place). Un-geocoded or far-apart
    same-name physical entities are LOGGED FOR REVIEW, never auto-merged — so
    "City Palace, Jaipur" and "City Palace, Udaipur" are never conflated.

Dry-run by default. Re-run with --apply to execute, then run scripts/score.py.
"""
from __future__ import annotations

import argparse
import math
import sys

sys.path.insert(0, "/Users/admin/Downloads/ts")
from pipeline import db  # noqa: E402

CULTURAL = {"art_form", "performing_art", "craft", "festival", "cuisine", "dish", "sport", "cultural"}
MERGE_KM = 30.0

# Generic physical names that recur as DIFFERENT real places in different cities.
# Same-name matches here are never auto-merged (coordinates can't be trusted thanks to
# geocoding errors), only flagged for review. Distinctive proper names (e.g.
# "cochin international airport", "ajanta caves") are NOT blocked.
GENERIC_NAMES = {
    "museum", "government museum", "archaeological museum", "science museum",
    "temple", "sun temple", "shiva temple", "hanuman temple", "jain temple",
    "fort", "palace", "city palace", "clock tower", "town hall", "market",
    "main market", "night market", "bus stand", "bus station", "railway station",
    "zoo", "lake", "beach", "garden", "park", "rice bowl", "kachori", "chowk",
    "government hospital", "gurudwara", "mosque", "church",
    "scooter rental", "bike rental", "car rental", "boating", "shopping",
}

# Name prefixes that signal a generic/brand place that recurs across cities.
GENERIC_PREFIXES = ("hotel ", "the hotel ", "guest house", "oyo ", "restaurant ")


def is_generic(normalized_name: str) -> bool:
    return normalized_name in GENERIC_NAMES or normalized_name.startswith(GENERIC_PREFIXES)


def haversine(lat1, lon1, lat2, lon2) -> float:
    r = 6371.0
    p = math.radians
    d = (math.sin(p(lat2 - lat1) / 2) ** 2
         + math.cos(p(lat1)) * math.cos(p(lat2)) * math.sin(p(lon2 - lon1) / 2) ** 2)
    return 2 * r * math.asin(min(1.0, math.sqrt(d)))


def cluster_by_distance(ents: list[dict]) -> list[list[dict]]:
    """Greedy-cluster geocoded entities: one joins a cluster if within MERGE_KM of any
    member. Entities without coordinates each become their own (unmergeable) cluster."""
    clusters: list[list[dict]] = []
    for e in ents:
        if e["lat"] is None or e["lng"] is None:
            clusters.append([e])  # solo — can't verify same-place
            continue
        for cl in clusters:
            if any(m["lat"] is not None and
                   haversine(e["lat"], e["lng"], m["lat"], m["lng"]) <= MERGE_KM for m in cl):
                cl.append(e)
                break
        else:
            clusters.append([e])
    return clusters


def pick_canonical(cluster: list[dict]) -> dict:
    # Most sources wins; then a geocoded one; then stable by id.
    return sorted(cluster, key=lambda e: (-e["frequency_count"], e["lat"] is None, e["id"]))[0]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="execute the merges (default: dry run)")
    args = ap.parse_args()

    merges: list[tuple[dict, list[dict]]] = []
    review: list[list[dict]] = []

    with db.connect() as conn:
        groups = conn.execute(
            """select normalized_name, entity_type, count(*) n
               from points_of_interest where is_active
               group by normalized_name, entity_type having count(*) > 1
               order by n desc"""
        ).fetchall()

        for g in groups:
            ents = [dict(r) for r in conn.execute(
                """select p.id::text, p.name, p.entity_type, p.frequency_count,
                          p.lat, p.lng, d.slug as dest
                   from points_of_interest p join destinations d on d.id = p.destination_id
                   where p.is_active and p.normalized_name = %s and p.entity_type = %s""",
                (g["normalized_name"], g["entity_type"])).fetchall()]

            if g["entity_type"] in CULTURAL:
                candidate_clusters = [ents]  # a tradition is one entity
            elif is_generic(g["normalized_name"]):
                review.extend([e] for e in ents)  # too generic to trust — review only
                continue
            else:
                candidate_clusters = cluster_by_distance(ents)

            for cl in candidate_clusters:
                if len(cl) < 2:
                    review.append(cl)  # un-mergeable solo (e.g. ungeocoded dup)
                    continue
                canonical = pick_canonical(cl)
                dups = [e for e in cl if e["id"] != canonical["id"]]
                merges.append((canonical, dups))

    # --- report ---
    print(f"=== MERGE PLAN ({'APPLY' if args.apply else 'DRY RUN'}) ===")
    for canonical, dups in merges:
        srcs = canonical["frequency_count"] + sum(d["frequency_count"] for d in dups)
        print(f"  {canonical['name'][:34]:34} [{canonical['entity_type']:9}] "
              f"keep @{canonical['dest']} <- " +
              ", ".join(f"@{d['dest']}({d['frequency_count']})" for d in dups) +
              f"  => ~{srcs} sources")
    review_dups = [cl for cl in review if len(cl) == 1]
    print(f"\n{len(merges)} groups to merge, "
          f"{sum(len(d) for _, d in merges)} duplicate rows folded in.")
    if any(len(r) for r in review):
        flagged = sum(1 for r in review if len(r) == 1)
        print(f"{flagged} same-name rows left alone (ungeocoded or >{MERGE_KM:.0f}km apart — review manually).")

    if not args.apply:
        print("\nDRY RUN — re-run with --apply to execute, then: python scripts/score.py")
        return 0

    # --- apply ---
    merged_dups = 0
    with db.connect() as conn:
        for canonical, dups in merges:
            cid = canonical["id"]
            for d in dups:
                did = d["id"]
                # Move evidence the canonical doesn't already have from that source...
                conn.execute(
                    """update entity_evidence set entity_id = %s
                       where entity_id = %s
                         and source_id not in (select source_id from entity_evidence where entity_id = %s)""",
                    (cid, did, cid))
                # ...then drop any leftover (same source already on the canonical).
                conn.execute("delete from entity_evidence where entity_id = %s", (did,))
                # Deactivate the duplicate with an audit trail (not deleted).
                conn.execute(
                    """update points_of_interest set is_active = false,
                         attributes = coalesce(attributes, '{}'::jsonb)
                                      || jsonb_build_object('merged_into', %s::text)
                       where id = %s""", (cid, did))
                merged_dups += 1
            # Refresh the canonical's source count from its (now consolidated) evidence.
            conn.execute(
                """update points_of_interest set frequency_count =
                     (select count(distinct source_id) from entity_evidence where entity_id = %s)
                   where id = %s""", (cid, cid))
        conn.commit()

    print(f"\nAPPLIED: merged {merged_dups} duplicates into {len(merges)} canonical entities.")
    print("Now run: python scripts/score.py   (to refresh scores from the consolidated evidence)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
