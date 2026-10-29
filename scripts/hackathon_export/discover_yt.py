#!/usr/bin/env python3
"""Discover India travel/culture creator videos via the YouTube Data API, across regions, for breadth.

Prefers videos that HAVE captions (videoCaption=closedCaption) so the transcript stage can actually
run. Dedupes by video id and by channel (so we get many creators, not one channel 10x). Prints
youtu.be URLs to stdout; feed the ones you want to scripts/run.py.
"""
from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from pipeline import config  # noqa: E402

KEY = config.get("YOUTUBE_API_KEY")
SEARCH = "https://www.googleapis.com/youtube/v3/search"

# Region / culture queries spread across India for breadth.
QUERIES = [
    "Northeast India travel vlog Hornbill", "Meghalaya Shillong travel vlog", "Sikkim Gangtok travel vlog",
    "Kerala culture travel vlog", "Hampi Karnataka travel vlog", "Rajasthan Jaisalmer travel vlog",
    "Varanasi travel vlog culture", "Tamil Nadu temple travel vlog", "Spiti Himachal travel vlog",
    "Ladakh Leh travel vlog", "Gujarat Kutch travel vlog", "Odisha Puri Konark travel vlog",
    "Northeast Arunachal Tawang travel vlog", "Uttarakhand Rishikesh travel vlog",
    "Goa hidden places travel vlog", "Madhya Pradesh Khajuraho travel vlog",
    "Andhra Hyderabad street food travel", "Kolkata Bengal culture travel vlog",
]


def search(q: str, n: int = 3) -> list[dict]:
    params = urllib.parse.urlencode({
        "part": "snippet", "q": q, "type": "video", "videoCaption": "closedCaption",
        "videoDuration": "medium", "maxResults": n, "relevanceLanguage": "en",
        "regionCode": "IN", "order": "relevance", "key": KEY,
    })
    try:
        with urllib.request.urlopen(f"{SEARCH}?{params}", timeout=25) as r:
            return json.load(r).get("items", [])
    except Exception as e:
        print(f"# [err] {q}: {e}", file=sys.stderr)
        return []


def main() -> None:
    if not KEY:
        print("YOUTUBE_API_KEY not set", file=sys.stderr); sys.exit(1)
    seen_vid: set[str] = set()
    seen_chan: set[str] = set()
    out: list[str] = []
    for q in QUERIES:
        for it in search(q):
            vid = it.get("id", {}).get("videoId")
            chan = it.get("snippet", {}).get("channelId")
            title = it.get("snippet", {}).get("title", "")
            if not vid or vid in seen_vid:
                continue
            if chan in seen_chan:  # one video per channel → creator breadth
                continue
            seen_vid.add(vid); seen_chan.add(chan)
            out.append(vid)
            print(f"https://youtu.be/{vid}  # {title[:60]}")
        time.sleep(0.2)
    print(f"\n# {len(out)} unique videos across {len(QUERIES)} queries", file=sys.stderr)


if __name__ == "__main__":
    main()
