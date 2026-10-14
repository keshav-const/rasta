"""Stage 1: Input & Validation.

Security gate. Accept ONLY known YouTube URL shapes, extract video_id,
check for duplicates. No network calls - zero cost.

Spec: pipeline-spec.md > STAGE 1.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse

import psycopg

from .. import db

# YouTube video IDs are exactly 11 chars from this alphabet.
_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")

# Hosts we accept. Anything else is rejected (prevents SSRF / arbitrary fetch).
_ALLOWED_HOSTS = {
    "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com",
    "youtu.be",
}


@dataclass
class ValidationResult:
    is_valid: bool
    video_id: str | None = None
    platform: str = "youtube"
    reason: str = ""


def validate_url(raw_url: str) -> ValidationResult:
    """Validate a raw URL string and extract its YouTube video_id.

    Accepts: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID
    (with www./m./music. subdomains, http or https). Rejects everything else.
    """
    if not raw_url or not raw_url.strip():
        return ValidationResult(False, reason="empty_url")

    url = raw_url.strip()
    parsed = urlparse(url)

    if parsed.scheme not in ("http", "https"):
        return ValidationResult(False, reason="bad_scheme")

    host = (parsed.hostname or "").lower()
    if host not in _ALLOWED_HOSTS:
        return ValidationResult(False, reason="host_not_allowed")

    video_id: str | None = None

    if host == "youtu.be":
        # youtu.be/<id>
        video_id = parsed.path.lstrip("/").split("/")[0]
    else:
        path = parsed.path.rstrip("/")
        if path == "/watch":
            # /watch?v=<id>
            qs = parse_qs(parsed.query)
            vals = qs.get("v")
            video_id = vals[0] if vals else None
        elif path.startswith("/shorts/"):
            video_id = path[len("/shorts/"):].split("/")[0]
        elif path.startswith("/live/"):
            video_id = path[len("/live/"):].split("/")[0]
        else:
            return ValidationResult(False, reason="unsupported_path")

    if not video_id or not _VIDEO_ID_RE.match(video_id):
        return ValidationResult(False, reason="invalid_video_id")

    return ValidationResult(True, video_id=video_id)


def check_duplicate(conn: psycopg.Connection, video_id: str) -> dict | None:
    """Return the existing source row if this video was already processed, else None."""
    return db.find_source_by_video_id(conn, video_id)
