#!/usr/bin/env python3
"""Conservative reclassification: fold clearly-sport entities that the LLM extractor
mis-typed (as 'cultural'/'activity'/'poi') into entity_type='sport'.

Exact-name allowlist only — never fuzzy — so places (stadiums, polo grounds, academies,
'Thangka' paintings, 'Yumthang Valley', the town 'Kushtia', a diet, a magazine) are left
untouched. A sport VENUE stays a 'poi' (it is a place); only the sport/discipline/event
itself becomes 'sport'.

Usage:  python scripts/reclassify_sports.py            # dry-run
        python scripts/reclassify_sports.py --apply    # write
"""
import sys
from pipeline.db import connect

# Exact names (case-insensitive) that ARE a sport / martial art / folk game / race event.
ALLOW = {
    # martial arts & their regional schools
    "adimurai", "kai silambattam", "kalari martial art", "madhya kalari",
    "thekkan kalari", "tulunadan kalari", "vadakkan kalari", "mukna",
    "musti-yuddha", "musti yuddha", "paika akhada", "varma kalai",
    # traditional games / disciplines
    "kabaddi", "sagol kangjei", "yubi lakpi",
    # boat-race sport events
    "vallamkali", "aranmula boat race", "aranmula uthrattathi boat race",
    "champakulam moolam boat race", "indira gandhi boat race",
    "nehru trophy boat race", "the nehru trophy boat race",
    "president's trophy boat race", "women's boat race",
}


def main() -> None:
    apply = "--apply" in sys.argv
    with connect() as conn:
        cur = conn.cursor()
        cur.execute(
            "select id, name, entity_type from points_of_interest "
            "where is_active and entity_type <> 'sport'"
        )
        hits = []
        for r in cur.fetchall():
            v = r if isinstance(r, dict) else {"id": r[0], "name": r[1], "entity_type": r[2]}
            if (v["name"] or "").strip().lower() in ALLOW:
                hits.append(v)

        print(f"{'APPLYING' if apply else 'DRY-RUN'}: {len(hits)} entities -> 'sport'")
        for v in hits:
            print(f"  {v['entity_type']:10} -> sport   {v['name']}")

        if apply and hits:
            ids = [v["id"] for v in hits]
            cur.execute(
                "update points_of_interest set entity_type='sport', updated_at=now() "
                "where id = any(%s)",
                (ids,),
            )
            conn.commit()
            print(f"Updated {cur.rowcount} rows.")


if __name__ == "__main__":
    main()
