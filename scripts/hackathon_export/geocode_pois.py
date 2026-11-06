#!/usr/bin/env python3
"""Concurrent, multi-provider geocoding pass for POIs missing coordinates.

Free geocoders each cap throughput (Nominatim 1 req/s, Photon "be polite"), so you
can't parallelise ONE service without getting IP-banned. Instead we run SEVERAL
providers CONCURRENTLY — one worker thread each, every worker throttled to its own
provider's limit — so combined throughput ≈ the sum of all providers' rates.

Providers (a provider is used only if enabled / its key is set):
  - Photon      (keyless)           photon.komoot.io
  - Nominatim   (keyless)           nominatim.openstreetmap.org
  - LocationIQ  (LOCATIONIQ_API_KEY)  5k/day, ~2 req/s — good India coverage
  - Geoapify    (GEOAPIFY_API_KEY)    3k/day, fast

Work is distributed across providers; misses from round 1 are retried on a DIFFERENT
provider in round 2; whatever still fails is marked (attributes.geo_tried) so it's
never retried on later runs. Results sanity-checked against the India bounding box.

Usage:
  python scripts/hackathon_export/geocode_pois.py                 # new places only
  python scripts/hackathon_export/geocode_pois.py --retry-failed  # also re-try
                                                                   # previously-marked
                                                                   # failures (do this
                                                                   # once after adding keys)
"""
from __future__ import annotations

import argparse
import json as _json
import re
import socket
import sys
import threading
import time
import urllib.parse
import urllib.request

socket.setdefaulttimeout(10)  # fast-fail on a stalled read

sys.path.insert(0, "/Users/admin/Downloads/ts")
from pipeline import config, db  # noqa: E402

UA = {"User-Agent": "RastaGeocoder/1.0 (github.com/keshav-const/rasta)"}
IN_BBOX = (6.0, 68.0, 37.6, 97.5)  # lat_min, lon_min, lat_max, lon_max


def _in_india(lat: float, lon: float) -> bool:
    la0, lo0, la1, lo1 = IN_BBOX
    return la0 <= lat <= la1 and lo0 <= lon <= lo1


def _clean(name: str) -> str:
    n = re.sub(r"\([^)]*\)", "", name)
    n = re.split(r"\s+&\s+|\s+and\s+|,\s*", n)[0]
    return n.strip(" -–—") or name


def _get(url: str) -> dict | list | None:
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=10) as r:
            return _json.load(r)
    except Exception:
        return None


# --- providers: each takes a query string, returns (lat, lon) in India or None ---
def _photon(q: str, key: str = "") -> tuple[float, float] | None:
    d = _get("https://photon.komoot.io/api/?" + urllib.parse.urlencode({"q": q, "limit": 1, "lang": "en"}))
    feats = (d or {}).get("features") if isinstance(d, dict) else None
    if feats:
        lon, lat = feats[0]["geometry"]["coordinates"]
        if _in_india(lat, lon):
            return float(lat), float(lon)
    return None


def _nominatim(q: str, key: str = "") -> tuple[float, float] | None:
    d = _get("https://nominatim.openstreetmap.org/search?" +
             urllib.parse.urlencode({"q": q, "format": "json", "limit": 1, "countrycodes": "in"}))
    if isinstance(d, list) and d:
        lat, lon = float(d[0]["lat"]), float(d[0]["lon"])
        if _in_india(lat, lon):
            return lat, lon
    return None


def _locationiq(q: str, key: str) -> tuple[float, float] | None:
    d = _get("https://us1.locationiq.com/v1/search?" +
             urllib.parse.urlencode({"key": key, "q": q, "format": "json", "limit": 1, "countrycodes": "in"}))
    if isinstance(d, list) and d:
        lat, lon = float(d[0]["lat"]), float(d[0]["lon"])
        if _in_india(lat, lon):
            return lat, lon
    return None


def _geoapify(q: str, key: str) -> tuple[float, float] | None:
    d = _get("https://api.geoapify.com/v1/geocode/search?" +
             urllib.parse.urlencode({"text": q, "apiKey": key, "limit": 1, "filter": "countrycode:in"}))
    feats = (d or {}).get("features") if isinstance(d, dict) else None
    if feats:
        lon, lat = feats[0]["geometry"]["coordinates"]
        if _in_india(lat, lon):
            return float(lat), float(lon)
    return None


class Provider:
    def __init__(self, name, fn, interval, key=""):
        self.name, self.fn, self.interval, self.key = name, fn, interval, key

    def locate(self, name: str, city: str) -> tuple[float, float] | None:
        clean = _clean(name)
        queries = [f"{name}, {city}, India"]
        if clean.lower() != name.lower():
            queries.append(f"{clean}, {city}, India")
        for q in queries:
            hit = self.fn(q, self.key)
            time.sleep(self.interval)  # stay under this provider's own limit
            if hit:
                return hit
        return None


def build_providers() -> list[Provider]:
    provs = [Provider("photon", _photon, 0.6), Provider("nominatim", _nominatim, 1.1)]
    liq = config.get("LOCATIONIQ_API_KEY")
    if liq:
        provs.append(Provider("locationiq", _locationiq, 0.6, liq))
    geo = config.get("GEOAPIFY_API_KEY")
    if geo:
        provs.append(Provider("geoapify", _geoapify, 0.3, geo))
    return provs


def _write_hit(poi_id, lat, lng):
    with db.connect() as c:
        c.execute("update points_of_interest set lat=%s, lng=%s where id=%s", (lat, lng, poi_id))
        c.commit()


def _mark_tried(poi_id):
    with db.connect() as c:
        c.execute("update points_of_interest set attributes = "
                  "coalesce(attributes,'{}'::jsonb) || jsonb_build_object('geo_tried', now()::text) "
                  "where id=%s", (poi_id,))
        c.commit()


def run_round(providers: list[Provider], pois: list[dict]) -> list[dict]:
    """Distribute pois across providers, run one thread per provider in parallel.
    Returns the misses. Each worker writes its own hits."""
    buckets: list[list[dict]] = [[] for _ in providers]
    for i, p in enumerate(pois):
        buckets[i % len(providers)].append(p)
    misses: list[dict] = []
    lock = threading.Lock()

    def worker(prov: Provider, slice_: list[dict]):
        for poi in slice_:
            hit = prov.locate(poi["name"], poi["city"])
            if hit:
                _write_hit(poi["id"], hit[0], hit[1])
            else:
                with lock:
                    misses.append(poi)

    threads = [threading.Thread(target=worker, args=(pr, bk)) for pr, bk in zip(providers, buckets)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return misses


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--retry-failed", action="store_true",
                    help="also re-attempt places previously marked geo_tried")
    args = ap.parse_args()

    providers = build_providers()
    print(f"[geocode] providers: {', '.join(p.name for p in providers)}")

    where_tried = "" if args.retry_failed else "and (p.attributes ->> 'geo_tried') is null"
    with db.connect() as c:
        pois = [dict(r) for r in c.execute(
            f"""select p.id, p.name, d.slug as city
                from points_of_interest p join destinations d on d.id = p.destination_id
                where p.is_active = true and p.lat is null
                  and p.entity_type in ('poi', 'activity') {where_tried}
                order by p.recommendation_score desc nulls last"""
        ).fetchall()]
    print(f"[geocode] {len(pois)} POIs need coordinates")
    if not pois:
        return 0

    t0 = time.time()
    misses = run_round(providers, pois)
    print(f"[geocode] round 1: {len(pois) - len(misses)}/{len(pois)} located")

    # Round 2: retry misses, rotated so each lands on a DIFFERENT provider.
    if misses and len(providers) > 1:
        rotated = providers[1:] + providers[:1]
        still = run_round(rotated, misses)
        print(f"[geocode] round 2: {len(misses) - len(still)}/{len(misses)} more located")
        misses = still

    for poi in misses:
        _mark_tried(poi["id"])

    located = len(pois) - len(misses)
    print(f"[geocode] DONE: {located}/{len(pois)} located, {len(misses)} marked tried "
          f"in {time.time()-t0:.0f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
