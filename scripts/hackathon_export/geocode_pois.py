#!/usr/bin/env python3
"""Free, keyless geocoding pass (OpenStreetMap Nominatim) for POIs missing coordinates.

Writes lat/lng back into points_of_interest so every future snapshot export carries them -
enabling keyless Leaflet/OSM maps in the app. Respects Nominatim policy: >=1s between calls,
descriptive User-Agent. Idempotent: only geocodes rows where lat IS NULL.
"""
from __future__ import annotations

import sys
import time
import urllib.parse
import urllib.request
import json as _json

sys.path.insert(0, "/Users/admin/Downloads/ts")
from pipeline import db  # noqa: E402

UA = {"User-Agent": "TasteTrail/1.0 (hackathon POI geocoder; contact keshav)"}
NOMINATIM = "https://nominatim.openstreetmap.org/search"


import re


def _clean(name: str) -> str:
    """Strip things that confuse Nominatim: parentheticals, and '&'/'and'/',' tails.
    'Red Fort (Lal Qila)' -> 'Red Fort'; 'India Gate & Kartavya Path' -> 'India Gate'."""
    n = re.sub(r"\([^)]*\)", "", name)          # drop (...) aliases
    n = re.split(r"\s+&\s+|\s+and\s+|,\s*", n)[0]  # take first entity
    return n.strip(" -–—") or name


def geocode(name: str, city: str) -> tuple[float, float] | None:
    clean = _clean(name)
    queries = [f"{name}, {city}, India"]
    if clean.lower() != name.lower():
        queries.append(f"{clean}, {city}, India")   # retry without alias/suffix
    queries.append(f"{clean}, India")
    for q in queries:
        params = urllib.parse.urlencode({"q": q, "format": "json", "limit": 1, "countrycodes": "in"})
        req = urllib.request.Request(f"{NOMINATIM}?{params}", headers=UA)
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                data = _json.load(r)
        except Exception as e:
            print(f"  [err] {name}: {type(e).__name__}")
            data = []
        time.sleep(1.1)  # Nominatim: max 1 req/sec
        if data:
            return float(data[0]["lat"]), float(data[0]["lon"])
    return None


def main():
    with db.connect() as c:
        cur = c.cursor()
        cur.execute(
            """select p.id, p.name, d.slug as city
               from points_of_interest p join destinations d on d.id = p.destination_id
               where p.is_active = true and p.lat is null
               order by p.recommendation_score desc nulls last"""
        )
        rows = [dict(r) for r in cur.fetchall()]
        print(f"[geocode] {len(rows)} POIs need coordinates")
        ok = 0
        for i, row in enumerate(rows, 1):
            res = geocode(row["name"], row["city"])
            if res:
                cur.execute(
                    "update points_of_interest set lat=%s, lng=%s where id=%s",
                    (res[0], res[1], row["id"]),
                )
                c.commit()
                ok += 1
            if i % 20 == 0:
                print(f"  ...{i}/{len(rows)} done ({ok} located)")
        print(f"[geocode] DONE: {ok}/{len(rows)} located")


if __name__ == "__main__":
    main()
