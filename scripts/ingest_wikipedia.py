#!/usr/bin/env python3
"""Wikipedia / Wikivoyage ingestion adapter.

Authoritative, structured, and NOT IP-rate-limited like YouTube — a dense source
of exactly the cultural entities the graph now models (every art form, festival,
craft and monument has a well-formed article anchored to a place). Fetches article
plain-text via the MediaWiki Action API and runs it through the SAME gate-skipping
extractor the blog adapter uses.

Usage:
  # explicit article titles
  python scripts/ingest_wikipedia.py "Chhau dance" "Theyyam" "Madhubani art"

  # every page in a category (great for breadth)
  python scripts/ingest_wikipedia.py --category "Folk dances of India" [--limit 40]

  # free-text search -> top matching articles
  python scripts/ingest_wikipedia.py --search "tribal festivals India" [--limit 20]

  # pull from Wikivoyage instead of Wikipedia (travel-focused)
  python scripts/ingest_wikipedia.py --site wikivoyage "Hampi" "Jaisalmer"

Then run scripts/resolve.py + scripts/score.py (+ geocode) as usual.
"""
from __future__ import annotations

import argparse
import hashlib
import socket
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

# Hard floor on every network read so a slow/stalled MediaWiki response can never
# hang the batch indefinitely (explicit per-call timeouts don't always fire).
socket.setdefaulttimeout(45)

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from pipeline.ingest import ingest_text_source  # noqa: E402

UA = {"User-Agent": "RastaBot/1.0 (travel-culture graph; contact via github.com/keshav-const/rasta)"}
SITES = {
    "wikipedia": "https://en.wikipedia.org/w/api.php",
    "wikivoyage": "https://en.wikivoyage.org/w/api.php",
}
MAX_CHARS = 18000  # cap article length to keep extraction chunking sane


def _api(endpoint: str, params: dict) -> dict:
    params = {**params, "format": "json"}
    url = f"{endpoint}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        import json
        return json.load(r)


def category_titles(endpoint: str, category: str, limit: int) -> list[str]:
    """Titles of pages (not sub-categories) in a category."""
    cat = category if category.lower().startswith("category:") else f"Category:{category}"
    out: list[str] = []
    cont: dict = {}
    while len(out) < limit:
        data = _api(endpoint, {
            "action": "query", "list": "categorymembers", "cmtitle": cat,
            "cmlimit": min(500, limit - len(out)), "cmtype": "page", **cont,
        })
        out += [m["title"] for m in data.get("query", {}).get("categorymembers", [])]
        cont = data.get("continue", {})
        if not cont:
            break
        time.sleep(0.2)
    return out[:limit]


def search_titles(endpoint: str, query: str, limit: int) -> list[str]:
    data = _api(endpoint, {"action": "query", "list": "search", "srsearch": query, "srlimit": limit})
    return [s["title"] for s in data.get("query", {}).get("search", [])]


def fetch_extract(endpoint: str, title: str) -> tuple[str, str]:
    """Return (canonical_title, plain_text) for an article, following redirects."""
    data = _api(endpoint, {
        "action": "query", "prop": "extracts", "explaintext": 1, "redirects": 1,
        "titles": title,
    })
    pages = data.get("query", {}).get("pages", {})
    for _, p in pages.items():
        if "missing" in p:
            return title, ""
        return p.get("title", title), (p.get("extract") or "")
    return title, ""


def ingest_title(endpoint: str, site: str, title: str) -> None:
    try:
        canon, text = fetch_extract(endpoint, title)
    except Exception as e:  # noqa: BLE001
        print(f"[wiki] FETCH FAIL {title}: {e}")
        return
    text = text[:MAX_CHARS]
    if len(text) < 200:
        print(f"[wiki] skip {title}: too short ({len(text)} chars)")
        return
    url = f"https://en.{site}.org/wiki/{urllib.parse.quote(canon.replace(' ', '_'))}"
    key = f"{site}_" + hashlib.sha1(url.encode()).hexdigest()[:12]
    print(f"[wiki] {site} | \"{canon[:60]}\" | {len(text)} chars")
    res = ingest_text_source(
        platform=site, source_key=key, url=url, title=canon,
        text=text, creator_name=f"{site}.org", trust_source=True,
        content_type="encyclopedia",
    )
    if res["ok"]:
        print(f"[wiki] ok - {res['entities']} entities, {res['claims']} claims")
    else:
        print(f"[wiki] skipped - {res.get('reason')} {res.get('detail') or res.get('error') or ''}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("titles", nargs="*", help="article titles to ingest")
    ap.add_argument("--category", help="ingest all pages in this category")
    ap.add_argument("--search", help="ingest top articles matching this query")
    ap.add_argument("--site", choices=list(SITES), default="wikipedia")
    ap.add_argument("--limit", type=int, default=40, help="cap for --category/--search")
    args = ap.parse_args()

    endpoint = SITES[args.site]
    titles = list(args.titles)
    if args.category:
        titles += category_titles(endpoint, args.category, args.limit)
    if args.search:
        titles += search_titles(endpoint, args.search, args.limit)
    if not titles:
        ap.error("give article titles, --category, or --search")

    # de-dupe, preserve order
    seen, ordered = set(), []
    for t in titles:
        if t not in seen:
            seen.add(t); ordered.append(t)
    print(f"[wiki] ingesting {len(ordered)} {args.site} articles")
    for t in ordered:
        ingest_title(endpoint, args.site, t)
        time.sleep(0.4)  # be polite to the API
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
