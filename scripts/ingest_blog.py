"""Travel-blog ingestion adapter — treat a blog post + its author/site as a creator source.

Fetches an article, reduces it to readable text, and runs the SAME gate + extractor as videos.
Stores extracted FACTS + attribution (site as creator) + the article link only.

Usage:
    python scripts/ingest_blog.py "https://someblog.com/best-places-in-sikkim" [more urls...]

Then run scripts/resolve.py + scripts/score.py.
"""
from __future__ import annotations

import hashlib
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from pipeline.ingest import ingest_text_source  # noqa: E402

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                     "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"}


def html_to_text(html: str) -> tuple[str, str]:
    """Return (title, body_text) from raw HTML — crude readability, no deps."""
    title = ""
    m = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
    if m:
        title = re.sub(r"\s+", " ", m.group(1)).strip()
    # Drop non-content blocks, then strip tags.
    html = re.sub(r"<(script|style|nav|footer|header|form|aside|noscript)[^>]*>.*?</\1>", " ", html, flags=re.I | re.S)
    html = re.sub(r"<!--.*?-->", " ", html, flags=re.S)
    html = re.sub(r"<br\s*/?>", "\n", html, flags=re.I)
    html = re.sub(r"</(p|div|h[1-6]|li|tr)>", "\n", html, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"&[a-z]+;", " ", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text).strip()
    return title, text


def ingest_url(url: str) -> None:
    try:
        r = requests.get(url, headers=UA, timeout=25)
        r.raise_for_status()
    except requests.RequestException as e:
        print(f"[blog] FETCH FAIL {url}: {e}")
        return
    title, text = html_to_text(r.text)
    # Articles can be long; cap to keep extraction chunking sane.
    text = text[:18000]
    site = urlparse(url).netloc.replace("www.", "")
    print(f"[blog] {site} | \"{title[:70]}\" | {len(text)} chars")
    key = "blog_" + hashlib.sha1(url.encode()).hexdigest()[:12]
    res = ingest_text_source(
        platform="blog", source_key=key, url=url,
        title=title or site, text=text, creator_name=site, trust_source=True,
    )
    if res["ok"]:
        print(f"[blog] ok - {res['entities']} entities, {res['claims']} claims, dests={res['destinations']}")
    else:
        print(f"[blog] skipped - {res.get('reason')} {res.get('detail') or res.get('error') or ''}")


def main() -> None:
    urls = sys.argv[1:]
    if not urls:
        print("usage: python scripts/ingest_blog.py <url> [url...]")
        sys.exit(1)
    for u in urls:
        ingest_url(u)
        time.sleep(1)


if __name__ == "__main__":
    main()
