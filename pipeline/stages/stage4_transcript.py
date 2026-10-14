"""Stage 4: Transcript Retrieval.

Get the actual spoken text for extraction. Prefer manual captions, fall back
to auto-generated. For Delhi/Gurgaon content, try both English and Hindi tracks
(heavy Hindi-English code-switching is expected downstream).

Spec: pipeline-spec.md > STAGE 4.
"""
from __future__ import annotations

from dataclasses import dataclass

from youtube_transcript_api import (
    YouTubeTranscriptApi,
    NoTranscriptFound,
    TranscriptsDisabled,
    VideoUnavailable,
    CouldNotRetrieveTranscript,
)

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
    api = YouTubeTranscriptApi()
    try:
        tlist = api.list(video_id)
    except (TranscriptsDisabled, NoTranscriptFound, VideoUnavailable) as e:
        raise TranscriptError(f"no transcript available ({type(e).__name__})")
    except CouldNotRetrieveTranscript as e:
        # covers IpBlocked / RequestBlocked / PoTokenRequired etc.
        raise TranscriptError(f"transcript fetch blocked: {type(e).__name__}")

    transcript_obj, source = _pick_transcript(tlist, _lang_priority(default_language))
    if transcript_obj is None:
        raise TranscriptError("no transcript tracks found")

    try:
        raw = transcript_obj.fetch().to_raw_data()  # [{text, start, duration}, ...]
    except CouldNotRetrieveTranscript as e:
        raise TranscriptError(f"transcript fetch failed: {type(e).__name__}")

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
