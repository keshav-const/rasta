#!/usr/bin/env python3
"""Free, keyless geocoding pass for POIs missing coordinates.

Primary geocoder = Photon (photon.komoot.io, OSM-based, no key, bulk-friendly) — far better
hit rate than Nominatim for Indian landmarks AND it doesn't hard-throttle bulk runs. Nominatim
is kept as a fallback. Results are sanity-checked against the India bounding box so a stray
global match never lands. Writes lat/lng back into points_of_interest. Idempotent: lat IS NULL only.
"""
from __future__ import annotations

import re
import sys
import time
import urllib.parse
import urllib.request
import json as _json

sys.path.insert(0, "/Users/admin/Downloads/ts")
from pipeline import db  # noqa: E402

UA = {"User-Agent": "TasteTrail/1.0 (hackathon POI geocoder; contact keshav)"}
PHOTON = "https://photon.komoot.io/api/"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
# India bounding box (incl. Ladakh to ~37.5N, Andamans dropped to avoid false far-east hits).
IN_BBOX = (6.0, 68.0, 37.6, 97.5)  # (lat_min, lon_min, lat_max, lon_max)


def _in_india(lat: float, lon: float) -> bool:
    la0, lo0, la1, lo1 = IN_BBOX
    return la0 <= lat <= la1 and lo0 <= lon <= lo1


def _clean(name: str) -> str:
    """Strip things that confuse geocoders: parentheticals, and '&'/'and'/',' tails.
    'Red Fort (Lal Qila)' -> 'Red Fort'; 'India Gate & Kartavya Path' -> 'India Gate'."""
    n = re.sub(r"\([^)]*\)", "", name)          # drop (...) aliases
    n = re.split(r"\s+&\s+|\s+and\s+|,\s*", n)[0]  # take first entity
    return n.strip(" -–—") or name


def _photon(q: str) -> tuple[float, float] | None:
    u = PHOTON + "?" + urllib.parse.urlencode({"q": q, "limit": 1, "lang": "en"})
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=20) as r:
            d = _json.load(r)
    except Exception as e:
        print(f"  [photon err] {q[:40]}: {type(e).__name__}")
        return None
    feats = d.get("features") or []
    if feats:
        lon, lat = feats[0]["geometry"]["coordinates"]  # GeoJSON = [lon, lat]
        if _in_india(lat, lon):
            return float(lat), float(lon)
    return None


def _nominatim(q: str) -> tuple[float, float] | None:
    params = urllib.parse.urlencode({"q": q, "format": "json", "limit": 1, "countrycodes": "in"})
    try:
        with urllib.request.urlopen(urllib.request.Request(f"{NOMINATIM}?{params}", headers=UA), timeout=20) as r:
            data = _json.load(r)
    except Exception:
        return None
    if data:
        lat, lon = float(data[0]["lat"]), float(data[0]["lon"])
        if _in_india(lat, lon):
            return lat, lon
    return None


def geocode(name: str, city: str) -> tuple[float, float] | None:
    clean = _clean(name)
    queries = [f"{name}, {city}, India"]
    if clean.lower() != name.lower():
        queries.append(f"{clean}, {city}, India")   # retry without alias/suffix
    queries.append(f"{clean}, India")
    # Photon first (better + bulk-safe), Nominatim fallback.
    for q in queries:
        hit = _photon(q)
        time.sleep(0.7)  # be polite to the shared Photon instance
        if hit:
            return hit
    for q in queries[:2]:
        hit = _nominatim(q)
        time.sleep(1.1)
        if hit:
            return hit
    return None


def main():
    # Fetch the work list in a short-lived connection, then CLOSE it — never hold a DB connection
    # open across the (slow) geocoder network calls, or the Supabase pooler drops it mid-run.
    with db.connect() as c:
        rows = [dict(r) for r in c.execute(
            """select p.id, p.name, d.slug as city
               from points_of_interest p join destinations d on d.id = p.destination_id
               where p.is_active = true and p.lat is null
               order by p.recommendation_score desc nulls last"""
        ).fetchall()]
    print(f"[geocode] {len(rows)} POIs need coordinates")
    ok = 0
    for i, row in enumerate(rows, 1):
        res = geocode(row["name"], row["city"])  # no DB connection held here
        if res:
            # one short connection per write — cheap and pooler-safe
            with db.connect() as c:
                c.execute("update points_of_interest set lat=%s, lng=%s where id=%s", (res[0], res[1], row["id"]))
                c.commit()
            ok += 1
        if i % 20 == 0:
            print(f"  ...{i}/{len(rows)} done ({ok} located)")
    print(f"[geocode] DONE: {ok}/{len(rows)} located")


if __name__ == "__main__":
    main()
