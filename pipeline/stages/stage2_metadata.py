"""Stage 2: Metadata Fetch.

Pull video context from the YouTube Data API v3 before spending on extraction.
Stores immediately in `sources` (useful even if the video is later rejected).

Spec: pipeline-spec.md > STAGE 2.
"""
from __future__ import annotations

import re
from typing import Any

import requests

from .. import config

_API = "https://www.googleapis.com/youtube/v3"
_DURATION_RE = re.compile(
    r"P(?:(?P<days>\d+)D)?T(?:(?P<h>\d+)H)?(?:(?P<m>\d+)M)?(?:(?P<s>\d+)S)?"
)


class MetadataError(RuntimeError):
    """Raised when metadata cannot be fetched (video missing, private, API error)."""


def _parse_iso8601_duration(text: str) -> int | None:
    """Convert an ISO-8601 duration (e.g. 'PT14M3S') to total seconds."""
    if not text:
        return None
    m = _DURATION_RE.fullmatch(text)
    if not m:
        return None
    days = int(m.group("days") or 0)
    h = int(m.group("h") or 0)
    mins = int(m.group("m") or 0)
    s = int(m.group("s") or 0)
    return ((days * 24 + h) * 60 + mins) * 60 + s


def _to_int(val: Any) -> int | None:
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def _fetch_channel_subscribers(channel_id: str, api_key: str) -> int | None:
    if not channel_id:
        return None
    try:
        resp = requests.get(
            f"{_API}/channels",
            params={"part": "statistics", "id": channel_id, "key": api_key},
            timeout=15,
        )
        resp.raise_for_status()
        items = resp.json().get("items", [])
        if not items:
            return None
        return _to_int(items[0].get("statistics", {}).get("subscriberCount"))
    except requests.RequestException:
        return None  # non-fatal: subscriber count is best-effort


def fetch_metadata(video_id: str, url: str) -> dict[str, Any]:
    """Fetch metadata for a video. Returns a dict shaped for db.upsert_source_metadata.

    Raises MetadataError if the video is unavailable.
    """
    api_key = config.youtube_api_key()
    resp = requests.get(
        f"{_API}/videos",
        params={
            "part": "snippet,statistics,contentDetails",
            "id": video_id,
            "key": api_key,
        },
        timeout=15,
    )
    if resp.status_code != 200:
        raise MetadataError(f"YouTube API HTTP {resp.status_code}: {resp.text[:200]}")

    items = resp.json().get("items", [])
    if not items:
        raise MetadataError(f"No video found for id={video_id} (private/deleted/invalid)")

    item = items[0]
    snippet = item.get("snippet", {})
    stats = item.get("statistics", {})
    content = item.get("contentDetails", {})

    channel_id = snippet.get("channelId", "")
    published_at = snippet.get("publishedAt")  # e.g. 2024-03-01T10:00:00Z
    upload_date = published_at.split("T")[0] if published_at else None

    return {
        "platform": "youtube",
        "url": url,
        "video_id": video_id,
        "title": snippet.get("title"),
        "description": snippet.get("description"),
        "creator_name": snippet.get("channelTitle"),
        "creator_channel_id": channel_id,
        "creator_subscribers": _fetch_channel_subscribers(channel_id, api_key),
        "duration_seconds": _parse_iso8601_duration(content.get("duration", "")),
        "upload_date": upload_date,
        "view_count": _to_int(stats.get("viewCount")),
        "like_count": _to_int(stats.get("likeCount")),
        "default_language": snippet.get("defaultLanguage") or snippet.get("defaultAudioLanguage"),
        "tags": snippet.get("tags") or [],
    }
