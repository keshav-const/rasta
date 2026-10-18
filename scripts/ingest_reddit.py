"""Reddit ingestion adapter — treat Reddit travel threads as a creator source.

Reuses the SAME pipeline as videos (gate -> extract), just swapping the fetch step: instead of a
YouTube transcript, the "text" is a Reddit thread (post + top comments). The subreddit is the
"creator". We store only extracted FACTS + attribution + the permalink, never the raw prose.

Usage:
    python scripts/ingest_reddit.py --query "best places to visit in Sikkim" --sub IndiaTravel --limit 3
    python scripts/ingest_reddit.py "https://www.reddit.com/r/IndiaTravel/comments/abc123/..."

Then run scripts/resolve.py + scripts/score.py to fold results into the graph.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from pipeline import config, db, llm  # noqa: E402
from pipeline.stages import stage3_gate, stage5_extract  # noqa: E402

UA = {"User-Agent": "TasteTrail/1.0 (research; contact: keshav-const on github)"}


def _get_json(url: str) -> dict | list:
    r = requests.get(url, headers=UA, timeout=20)
    r.raise_for_status()
    return r.json()


def search_threads(query: str, sub: str | None, limit: int) -> list[str]:
    """Return permalinks of top travel threads matching the query."""
    base = f"https://www.reddit.com/r/{sub}/search.json" if sub else "https://www.reddit.com/search.json"
    params = {"q": query, "sort": "relevance", "t": "all", "limit": str(limit), "type": "link"}
    if sub:
        params["restrict_sr"] = "1"
    url = base + "?" + "&".join(f"{k}={requests.utils.quote(v)}" for k, v in params.items())
    data = _get_json(url)
    out = []
    for c in (data.get("data", {}).get("children", []) if isinstance(data, dict) else []):
        d = c.get("data", {})
        if d.get("permalink"):
            out.append("https://www.reddit.com" + d["permalink"])
    return out[:limit]


def fetch_thread(url: str) -> dict | None:
    """Fetch a thread -> {thread_id, subreddit, title, text, author, permalink, created, ups}."""
    jurl = url.split("?")[0].rstrip("/") + "/.json?limit=200&sort=top"
    data = _get_json(jurl)
    if not isinstance(data, list) or len(data) < 2:
        return None
    post = data[0]["data"]["children"][0]["data"]
    parts = [post.get("title", ""), post.get("selftext", "")]
    n = 0
    for c in data[1]["data"]["children"]:
        d = c.get("data", {})
        body = d.get("body")
        if body and d.get("kind") != "more":
            parts.append(body)
            n += 1
        if n >= 60:
            break
    text = "\n\n".join(p for p in parts if p).strip()
    return {
        "thread_id": post.get("id", ""),
        "subreddit": post.get("subreddit", ""),
        "title": post.get("title", ""),
        "text": text,
        "author": post.get("author", ""),
        "permalink": "https://www.reddit.com" + post.get("permalink", ""),
        "created": post.get("created_utc"),
        "ups": post.get("ups", 0),
        "num_comments": post.get("num_comments", 0),
    }


def ingest_one(url: str) -> int:
    th = fetch_thread(url)
    if not th or len(th["text"]) < 200:
        print(f"[reddit] SKIP - too little text: {url}")
        return 0
    print(f"[reddit] r/{th['subreddit']} | \"{th['title'][:70]}\" | {len(th['text'])} chars | {th['num_comments']} comments")

    import datetime
    upload = None
    if th.get("created"):
        upload = datetime.datetime.utcfromtimestamp(int(th["created"])).date().isoformat()

    meta = {
        "platform": "reddit",
        "url": th["permalink"],
        "video_id": f"reddit_{th['thread_id']}",
        "title": th["title"],
        "description": th["text"][:600],
        "creator_name": f"r/{th['subreddit']}",
        "creator_channel_id": None,
        "creator_subscribers": None,
        "duration_seconds": 0,
        "upload_date": upload,
        "view_count": th.get("ups") or 0,
        "like_count": th.get("ups") or 0,
        "default_language": "en",
        "tags": [],
    }
    with db.connect() as conn:
        source_id = db.upsert_source_metadata(conn, meta)["id"]

    # --- Gate (same travel classifier as videos) ---
    try:
        gate = stage3_gate.classify(meta)
    except llm.LLMError as e:
        with db.connect() as conn:
            db.mark_failed(conn, source_id, f"gate_error: {e}"[:300])
        print(f"[gate] FAIL - {e}")
        return 1
    print(f"[gate] score={gate.travel_score:.2f} type={gate.content_type} dests={gate.primary_destinations}")
    if not gate.accepted:
        with db.connect() as conn:
            db.update_source_gate(conn, source_id, status="failed",
                                  failure_reason=f"gate_reject: {gate.reject_reason}", **gate.as_db_fields())
        print(f"[gate] REJECT - {gate.reject_reason}")
        return 0
    with db.connect() as conn:
        db.update_source_gate(conn, source_id, status="gated", failure_reason=None, **gate.as_db_fields())
        db.update_source_transcript(conn, source_id, transcript=th["text"],
                                    transcript_source="reddit", transcript_language="en")

    # --- Extract (same extractor as videos) ---
    try:
        ext = stage5_extract.extract_auto(
            video_id=meta["video_id"], title=th["title"], channel=f"r/{th['subreddit']}",
            upload_date=upload, content_type=gate.content_type,
            destinations=gate.primary_destinations, language="en", transcript=th["text"],
        )
    except llm.LLMError as e:
        with db.connect() as conn:
            db.mark_failed(conn, source_id, f"extraction_error: {e}"[:300])
        print(f"[extract] FAIL - {e}")
        return 1
    with db.connect() as conn:
        db.update_source_extraction(conn, source_id, raw_extraction=ext.data,
                                    extraction_model=ext.model, extraction_confidence=ext.confidence)
    print(f"[extract] ok - {ext.entity_count} entities, {ext.claim_count} claims -> status=extracted")
    return 0


def main() -> None:
    ap = argparse.ArgumentParser(description="Ingest Reddit travel threads into the evidence graph")
    ap.add_argument("url", nargs="?", help="a Reddit thread URL")
    ap.add_argument("--query", help="search query (instead of a direct URL)")
    ap.add_argument("--sub", help="restrict search to this subreddit")
    ap.add_argument("--limit", type=int, default=3)
    args = ap.parse_args()

    urls: list[str] = []
    if args.url:
        urls = [args.url]
    elif args.query:
        urls = search_threads(args.query, args.sub, args.limit)
        print(f"[reddit] found {len(urls)} threads for \"{args.query}\"" + (f" in r/{args.sub}" if args.sub else ""))
    else:
        ap.error("provide a thread URL or --query")

    for u in urls:
        try:
            ingest_one(u)
        except requests.HTTPError as e:
            print(f"[reddit] HTTP error for {u}: {e}")
        time.sleep(2)  # be polite to Reddit


if __name__ == "__main__":
    main()
