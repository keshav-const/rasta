#!/usr/bin/env python3
"""Open / government data ingestion adapter — authoritative heritage & culture.

Two sources of government-grade data, both folded into the SAME extractor the
other adapters use (each query/dataset becomes one 'source' row, like a listicle):

  wikidata  (default, no key) — Wikidata aggregates official designations:
            UNESCO World Heritage Sites, ASI Monuments of National Importance,
            and GI-tagged crafts/produce, each anchored to a state. Uses the
            public SPARQL endpoint with polite pacing + 429 backoff (the endpoint
            is sometimes degraded and throttles to ~1 req/min).

  datagovin (needs a free key) — data.gov.in, the Government of India open-data
            portal. Set DATA_GOV_IN_API_KEY (register at data.gov.in) and pass
            --resource <resource-id>; records are turned into text and ingested.

Usage:
  python scripts/ingest_opengov.py                      # all curated wikidata queries
  python scripts/ingest_opengov.py --query whs          # one query: whs|gi|asi
  python scripts/ingest_opengov.py --source datagovin --resource <id> [--limit 100]

Then run scripts/resolve.py + scripts/score.py (+ geocode).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from pipeline.ingest import ingest_text_source  # noqa: E402

UA = {"User-Agent": "RastaBot/1.0 (travel-culture graph; github.com/keshav-const/rasta)",
      "Accept": "application/sparql-results+json"}
WDQS = "https://query.wikidata.org/sparql"

# Curated SPARQL queries over official designations. India = Q668.
_WD_QUERIES = {
    "whs": ("UNESCO World Heritage Sites in India",
            """SELECT ?itemLabel ?stateLabel WHERE {
                 ?item wdt:P1435 wd:Q9259 ; wdt:P17 wd:Q668 .
                 OPTIONAL { ?item wdt:P131 ?state. }
                 SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
               } LIMIT 120"""),
    "asi": ("ASI Monuments of National Importance",
            """SELECT ?itemLabel ?stateLabel WHERE {
                 ?item wdt:P1435 wd:Q13550863 ; wdt:P17 wd:Q668 .
                 OPTIONAL { ?item wdt:P131 ?state. }
                 SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
               } LIMIT 200"""),
    "gi": ("GI-tagged crafts & produce of India",
           """SELECT ?itemLabel ?stateLabel WHERE {
                ?item wdt:P31 wd:Q15229207 ; wdt:P17 wd:Q668 .
                OPTIONAL { ?item wdt:P131 ?state. }
                SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
              } LIMIT 300"""),
}


def _get_json(url: str, headers: dict, tries: int = 4) -> dict:
    """GET JSON with backoff on 429 (WDQS throttles to ~1 req/min when degraded)."""
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < tries - 1:
                wait = 65
                print(f"[opengov] 429 throttled — waiting {wait}s (attempt {attempt+1}/{tries})")
                time.sleep(wait)
                continue
            raise
    return {}


def _ingest_rows(key_base: str, title: str, source_name: str, lines: list[str]) -> None:
    """Turn a list of 'Name — region' lines into one ingestible text source."""
    if len(lines) < 1:
        print(f"[opengov] {title}: no rows")
        return
    text = (f"{title}. The following are officially designated entries, each with its "
            f"location/region in India:\n\n" + "\n".join(lines))
    key = f"opengov_{key_base}_" + hashlib.sha1("\n".join(lines).encode()).hexdigest()[:10]
    url = f"https://www.wikidata.org/  ({title})"
    print(f"[opengov] {title} | {len(lines)} rows | {len(text)} chars")
    res = ingest_text_source(
        platform="opengov", source_key=key, url=url, title=title,
        text=text[:18000], creator_name=source_name, trust_source=True,
        content_type="registry",
    )
    print(f"[opengov]   -> {'ok' if res['ok'] else 'skip'}: "
          f"{res.get('entities', res.get('reason'))}")


def run_wikidata(which: list[str]) -> None:
    for i, key in enumerate(which):
        title, q = _WD_QUERIES[key]
        url = WDQS + "?" + urllib.parse.urlencode({"query": q, "format": "json"})
        try:
            data = _get_json(url, UA)
        except Exception as e:  # noqa: BLE001
            print(f"[opengov] {key} FAILED: {e}")
            continue
        rows = data.get("results", {}).get("bindings", [])
        lines = []
        for r in rows:
            name = r.get("itemLabel", {}).get("value", "").strip()
            state = r.get("stateLabel", {}).get("value", "").strip()
            if name and not name.startswith("Q"):  # skip unlabeled items
                lines.append(f"- {name}" + (f" — {state}" if state else ""))
        _ingest_rows(key, title, "wikidata.org", lines)
        if i < len(which) - 1:
            time.sleep(65)  # polite spacing for the shared endpoint


def run_datagovin(resource: str, limit: int) -> None:
    api_key = os.getenv("DATA_GOV_IN_API_KEY", "")
    if not api_key:
        print("[opengov] DATA_GOV_IN_API_KEY not set — register a free key at data.gov.in")
        return
    url = "https://api.data.gov.in/resource/" + resource + "?" + urllib.parse.urlencode(
        {"api-key": api_key, "format": "json", "limit": limit})
    data = _get_json(url, {"User-Agent": UA["User-Agent"]})
    records = data.get("records", [])
    # Heuristic: use common name/place fields present in most tourism datasets.
    lines = []
    for rec in records:
        name = rec.get("name") or rec.get("monument") or rec.get("site") or rec.get("festival")
        place = rec.get("state") or rec.get("district") or rec.get("city") or rec.get("location")
        if name:
            lines.append(f"- {name}" + (f" — {place}" if place else ""))
    _ingest_rows("datagovin", f"data.gov.in resource {resource}", "data.gov.in", lines)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", choices=["wikidata", "datagovin"], default="wikidata")
    ap.add_argument("--query", choices=list(_WD_QUERIES), help="one wikidata query (default: all)")
    ap.add_argument("--resource", help="data.gov.in resource id")
    ap.add_argument("--limit", type=int, default=100)
    args = ap.parse_args()

    if args.source == "datagovin":
        if not args.resource:
            ap.error("--source datagovin needs --resource <id>")
        run_datagovin(args.resource, args.limit)
    else:
        run_wikidata([args.query] if args.query else list(_WD_QUERIES))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
