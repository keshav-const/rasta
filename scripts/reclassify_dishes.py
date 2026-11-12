#!/usr/bin/env python3
"""Reclassify dishes that were mislabeled as restaurant/food POIs.

The extractor sometimes stores a DISH (e.g. "Butter Chicken", "Chaat") as
entity_type='poi' with poi_category='restaurant'/'street_food'. That's wrong on two
counts: it reads as a confusing "Restaurant" in the UI, and — because restaurants are a
*volatile* type — it gets a freshness label (Fresh/Stale) that makes no sense for a dish.
A real dish is enduring, so entity_type='dish' => the API returns freshness=null.

SAFE BY DESIGN: a food-category POI is reclassified ONLY when its WHOLE normalized name
exactly matches a known dish. So "Butter Chicken" -> dish, but "Paranthe Wali Gali",
"40-Year Old Mutton Pulao Shop", "Karim's", "Pista House" are left untouched (they're
places). Dry-run by default; --apply to execute, then run scripts/score.py.
"""
from __future__ import annotations

import argparse
import re
import sys

sys.path.insert(0, "/Users/admin/Downloads/ts")
from pipeline import db  # noqa: E402

CANDIDATE_CATS = {
    "restaurant", "street_food", "cafe", "sweet_shop", "bakery", "dhaba", "food", "eatery",
}

# Known Indian dishes (normalized). Whole-name exact match only — conservative on purpose.
DISHES = {
    # north
    "butter chicken", "chaat", "paratha", "parantha", "aloo paratha", "chole bhature",
    "chole", "rajma", "rajma chawal", "dal makhani", "dal", "paneer", "palak paneer",
    "shahi paneer", "kadai paneer", "matar paneer", "tandoori chicken", "chicken tikka",
    "paneer tikka", "seekh kebab", "kebab", "galouti kebab", "tunday kebab", "kakori kebab",
    "korma", "nihari", "haleem", "biryani", "hyderabadi biryani", "lucknowi biryani",
    "awadhi biryani", "pulao", "pilaf", "kachori", "pyaaz kachori", "samosa", "kadhi",
    "makki di roti", "sarson ka saag", "amritsari kulcha", "kulcha", "naan", "rogan josh",
    "kashmiri pulao", "yakhni", "wazwan", "rista", "gushtaba",
    # street / snacks
    "pani puri", "panipuri", "golgappa", "gol gappe", "bhel puri", "sev puri", "dahi puri",
    "vada pav", "pav bhaji", "misal pav", "poha", "aloo tikki", "pakora", "bhaji", "bhajji",
    "bonda", "mirchi vada", "dabeli", "kathi roll", "frankie", "momos", "momo", "thukpa",
    # south
    "dosa", "masala dosa", "neer dosa", "set dosa", "rava dosa", "idli", "medu vada", "vada",
    "uttapam", "uthappam", "sambar", "rasam", "pongal", "ven pongal", "bisi bele bath",
    "vangi bath", "curd rice", "lemon rice", "appam", "puttu", "avial", "sadya", "kori rotti",
    "pesarattu", "upma", "ragi mudde", "chettinad chicken", "fish curry", "meen curry",
    "kerala fish curry", "prawn curry", "chicken chettinad",
    # east / ne
    "litti chokha", "litti", "sattu paratha", "machher jhol", "kosha mangsho", "shukto",
    "chingri malai curry", "phuchka", "kathi kabab", "pakhala", "dalma", "chhena poda",
    # west
    "dhokla", "khaman", "thepla", "khakhra", "fafda", "jalebi", "undhiyu", "khandvi",
    "handvo", "muthia", "sev", "ganthiya", "patra", "aamras", "puran poli", "modak",
    "sabudana khichdi", "sabudana vada", "usal", "bhakarwadi", "sol kadhi", "vindaloo",
    "sorpotel", "goan fish curry", "xacuti", "cafreal",
    # sweets
    "gulab jamun", "rasgulla", "roshogolla", "rasmalai", "ladoo", "laddu", "barfi", "burfi",
    "kaju katli", "kheer", "payasam", "halwa", "gajar ka halwa", "double ka meetha",
    "mysore pak", "obbattu", "holige", "sandesh", "mishti doi", "cham cham", "pantua",
    "shrikhand", "basundi", "soan papdi", "petha", "imarti", "malpua", "ghevar",
    "peda", "sohan halwa", "bebinca", "kalakand", "rabri", "falooda", "kulfi",
    # misc staples
    "thali", "gujarati thali", "rajasthani thali", "dal baati churma", "dal bati",
    "gatte ki sabzi", "ker sangri", "laal maas", "bun maska", "maska bun", "irani chai",
    "filter coffee", "masala chai", "lassi", "thandai",
}

GENERIC_EATERY = ("restaurant", "cafe", "hotel", "dhaba", "shop", "bhavan", "bhawan",
                  "sweets", "bakery", "wala", "wali", "gali", "bazaar", "market", "mess",
                  "canteen", "stall", "corner", "point", "house", "junction", "centre",
                  "center", "palace", "darbar", "kitchen", "foods", "eatery", "tiffin")


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]", " ", (s or "").lower()).strip().replace("  ", " ")


def looks_like_eatery(name: str) -> bool:
    n = norm(name)
    return any(w in n.split() for w in GENERIC_EATERY)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="execute (default: dry run)")
    args = ap.parse_args()

    with db.connect() as conn:
        rows = [dict(r) for r in conn.execute(
            """select id::text, name, normalized_name, poi_category, frequency_count
               from points_of_interest
               where is_active and entity_type = 'poi'
                 and poi_category = any(%s)""",
            (list(CANDIDATE_CATS),)).fetchall()]

    hits = []
    for r in rows:
        nm = norm(r["normalized_name"] or r["name"])
        if nm in DISHES and not looks_like_eatery(r["name"]):
            hits.append(r)

    print(f"=== DISH RECLASSIFY ({'APPLY' if args.apply else 'DRY RUN'}) ===")
    print(f"scanned {len(rows)} food-category POIs; {len(hits)} match a known dish name\n")
    for r in sorted(hits, key=lambda x: -x["frequency_count"])[:60]:
        print(f"  poi/{r['poi_category']:12} -> dish   {r['name']}  ({r['frequency_count']} src)")
    if len(hits) > 60:
        print(f"  … and {len(hits) - 60} more")

    if not args.apply:
        print("\nDRY RUN — re-run with --apply, then: python scripts/score.py")
        return 0

    with db.connect() as conn:
        for r in hits:
            conn.execute(
                "update points_of_interest set entity_type = 'dish' where id = %s::uuid",
                (r["id"],))
        conn.commit()
    print(f"\nAPPLIED: reclassified {len(hits)} entities poi -> dish.")
    print("Now run: python scripts/score.py   (dishes are enduring -> freshness becomes null)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
