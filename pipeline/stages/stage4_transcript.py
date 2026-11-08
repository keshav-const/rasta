"""Stage 4: Transcript Retrieval.

Get the actual spoken text for extraction. Prefer manual captions, fall back
to auto-generated. For Delhi/Gurgaon content, try both English and Hindi tracks
(heavy Hindi-English code-switching is expected downstream).

Spec: pipeline-spec.md > STAGE 4.
"""
from __future__ import annotations

import os
import random
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

import requests

from youtube_transcript_api import (
    YouTubeTranscriptApi,
    NoTranscriptFound,
    TranscriptsDisabled,
    VideoUnavailable,
    CouldNotRetrieveTranscript,
)
from youtube_transcript_api.proxies import GenericProxyConfig, WebshareProxyConfig

from pipeline import config


# --- Global pacing -----------------------------------------------------------
# YouTube rate-limits the timedtext endpoint per IP: bulk-pulling a few hundred
# transcripts in a short window trips an IpBlocked for hours. We self-throttle to
# a minimum interval BETWEEN fetches, enforced across separate `run.py` processes
# via a shared timestamp file, so batches stay under the radar. Tune with env
# TRANSCRIPT_MIN_INTERVAL_SEC (0 disables). A small random jitter avoids a
# perfectly periodic request signature.
_PACE_FILE = Path(tempfile.gettempdir()) / "rasta_yt_transcript_last.ts"


def _min_interval() -> float:
    try:
        return max(0.0, float(os.getenv("TRANSCRIPT_MIN_INTERVAL_SEC", "6")))
    except ValueError:
        return 6.0


def _throttle_before_fetch() -> None:
    """Block until at least _min_interval() seconds have passed since the last
    fetch recorded in the shared timestamp file. Best-effort across processes."""
    interval = _min_interval()
    if interval <= 0:
        return
    try:
        last = float(_PACE_FILE.read_text().strip()) if _PACE_FILE.exists() else 0.0
    except (ValueError, OSError):
        last = 0.0
    wait = last + interval - time.time()
    if wait > 0:
        time.sleep(wait + random.uniform(0, interval * 0.3))  # jitter
    try:
        _PACE_FILE.write_text(str(time.time()))
    except OSError:
        pass


# --- HTTP timeout ------------------------------------------------------------
# youtube-transcript-api uses requests with NO timeout by default, so a stalled
# YouTube socket can hang a fetch FOREVER — which once froze a whole retry batch
# for ~2h on a single video. We pass our own Session that injects a (connect,
# read) timeout on every request, so a dead socket fails fast instead of hanging.
# Tune with env TRANSCRIPT_HTTP_TIMEOUT_SEC (read timeout; connect is capped at 10s).
def _http_timeout() -> tuple[float, float]:
    try:
        read = max(1.0, float(os.getenv("TRANSCRIPT_HTTP_TIMEOUT_SEC", "20")))
    except ValueError:
        read = 20.0
    return (min(read, 10.0), read)  # (connect, read)


class _TimeoutSession(requests.Session):
    """requests.Session that applies a default (connect, read) timeout to every
    request unless one is passed explicitly. The transcript library never sets a
    timeout itself, so this is where we enforce it."""

    def __init__(self, timeout: tuple[float, float]):
        super().__init__()
        self._default_timeout = timeout

    def request(self, *args, **kwargs):  # noqa: D401
        kwargs.setdefault("timeout", self._default_timeout)
        return super().request(*args, **kwargs)


def _proxy_config():
    """Build a proxy_config from env so transcript fetches survive YouTube IP blocks.
    Prefers Webshare residential (rotating IPs); else a generic HTTP/HTTPS proxy; else None."""
    ws_user = config.get("WEBSHARE_PROXY_USERNAME")
    ws_pass = config.get("WEBSHARE_PROXY_PASSWORD")
    if ws_user and ws_pass:
        return WebshareProxyConfig(proxy_username=ws_user, proxy_password=ws_pass)
    http = config.get("TRANSCRIPT_PROXY_HTTP") or config.get("TRANSCRIPT_PROXY_URL")
    https = config.get("TRANSCRIPT_PROXY_HTTPS") or config.get("TRANSCRIPT_PROXY_URL")
    if http or https:
        return GenericProxyConfig(http_url=http, https_url=https)
    return None

# Language preference for NCR content: English first (auto-captions common),
# then Hindi. default_language (from metadata) is prepended at runtime.
_BASE_LANGS = ["en", "en-IN", "en-US", "hi", "hi-IN"]


class TranscriptError(RuntimeError):
    """Raised when no usable transcript can be retrieved."""


@dataclass
class TranscriptResult:
    text: str                 # timestamped lines: "[<seconds>] text"
    source: str               # manual | auto_generated
    language: str             # BCP-47 code, e.g. "en", "hi"
    has_timestamps: bool
    segment_count: int


def _lang_priority(default_language: str | None) -> list[str]:
    langs: list[str] = []
    if default_language:
        langs.append(default_language)
        # also the base form ("hi-IN" -> "hi")
        base = default_language.split("-")[0]
        if base != default_language:
            langs.append(base)
    for l in _BASE_LANGS:
        if l not in langs:
            langs.append(l)
    return langs


def _pick_transcript(tlist, langs: list[str]):
    """Manual first, then auto-generated, over the language priority; else any."""
    try:
        return tlist.find_manually_created_transcript(langs), "manual"
    except NoTranscriptFound:
        pass
    try:
        return tlist.find_generated_transcript(langs), "auto_generated"
    except NoTranscriptFound:
        pass
    # last resort: whatever exists
    for t in tlist:
        return t, ("auto_generated" if t.is_generated else "manual")
    return None, ""


def fetch_transcript(video_id: str, default_language: str | None = None) -> TranscriptResult:
    """Retrieve the best available transcript. Raises TranscriptError if none."""
    _throttle_before_fetch()
    # Pass our own timeout-enforcing session; the library still applies any
    # proxy_config onto it, so proxy support is unaffected.
    api = YouTubeTranscriptApi(
        proxy_config=_proxy_config(),
        http_client=_TimeoutSession(_http_timeout()),
    )
    try:
        tlist = api.list(video_id)
    except (TranscriptsDisabled, NoTranscriptFound, VideoUnavailable) as e:
        raise TranscriptError(f"no transcript available ({type(e).__name__})")
    except CouldNotRetrieveTranscript as e:
        # covers IpBlocked / RequestBlocked / PoTokenRequired etc.
        raise TranscriptError(f"transcript fetch blocked: {type(e).__name__}")
    except requests.exceptions.RequestException as e:
        # connect/read timeout or other network error — fail fast, never hang
        raise TranscriptError(f"transcript fetch timeout/network: {type(e).__name__}")

    transcript_obj, source = _pick_transcript(tlist, _lang_priority(default_language))
    if transcript_obj is None:
        raise TranscriptError("no transcript tracks found")

    try:
        raw = transcript_obj.fetch().to_raw_data()  # [{text, start, duration}, ...]
    except CouldNotRetrieveTranscript as e:
        raise TranscriptError(f"transcript fetch failed: {type(e).__name__}")
    except requests.exceptions.RequestException as e:
        raise TranscriptError(f"transcript fetch timeout/network: {type(e).__name__}")

    # Build timestamped text so Stage 5 can cite timestamp_seconds per claim.
    lines = [
        f"[{int(seg.get('start', 0))}] {seg.get('text', '').strip()}"
        for seg in raw
        if seg.get("text", "").strip()
    ]
    if not lines:
        raise TranscriptError("transcript empty")

    return TranscriptResult(
        text="\n".join(lines),
        source=source,
        language=getattr(transcript_obj, "language_code", "") or "",
        has_timestamps=True,
        segment_count=len(lines),
    )
