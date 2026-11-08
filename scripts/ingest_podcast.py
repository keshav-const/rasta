#!/usr/bin/env python3
"""Podcast ingestion adapter — audio travel/culture shows that aren't on YouTube.

For each episode in an RSS feed: download the audio, downsample it to mono 16 kHz,
transcribe it LOCALLY with faster-whisper (CPU, zero per-minute cost), and run the
transcript through the SAME extractor as every other source. A genuinely new stream
(audio-only shows), with no YouTube IP-block exposure and no paid transcription API.

Requires: ffmpeg on PATH, feedparser, faster-whisper. Transcription runs on the CPU
and is slow (roughly real-time-ish with the 'base' model) — keep --limit small.
Only the text EXTRACTION step uses the LLM (gpt-4o-mini, cents); audio never leaves
the machine.

Env:
  WHISPER_MODEL        faster-whisper model size (default 'base'; 'tiny' = ~2-3x faster,
                       'small' = better/slower)
  WHISPER_CPU_THREADS  CPU threads for transcription (default: all cores)
  PODCAST_MAX_MINUTES  cap decoded audio length so one long episode can't run for hours
                       (default 40; 0 = no cap)
  LLM_API_KEY/...      the usual extractor LLM config

Speed/robustness: already-ingested episodes are skipped BEFORE download/transcribe
(dedup by audio URL); transcription is greedy (beam_size=1) with silence skipped
(VAD) and length-capped, so a single podcast costs minutes, not hours.

Usage:
  python scripts/ingest_podcast.py <rss_url> [<rss_url> ...] [--limit 2]

Then run scripts/resolve.py + scripts/score.py (+ geocode).
"""
from __future__ import annotations

import argparse
import hashlib
import os
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

import feedparser

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline import db  # noqa: E402
from pipeline.ingest import ingest_text_source  # noqa: E402

UA = {"User-Agent": "RastaBot/1.0 (github.com/keshav-const/rasta)"}

_MODEL = None  # lazily-loaded faster-whisper model, reused across episodes


def _get_model():
    """Load the faster-whisper model once (int8 on CPU for speed/memory)."""
    global _MODEL
    if _MODEL is None:
        from faster_whisper import WhisperModel
        name = os.getenv("WHISPER_MODEL", "base")
        try:
            threads = int(os.getenv("WHISPER_CPU_THREADS", "") or (os.cpu_count() or 4))
        except ValueError:
            threads = os.cpu_count() or 4
        print(f"[podcast] loading faster-whisper model '{name}' ({threads} threads; "
              f"first run downloads it)…")
        _MODEL = WhisperModel(name, device="cpu", compute_type="int8", cpu_threads=threads)
    return _MODEL


def _max_minutes() -> int:
    try:
        return max(0, int(os.getenv("PODCAST_MAX_MINUTES", "40")))
    except ValueError:
        return 40


def _already_ingested(key_id: str) -> bool:
    """True if this episode is already extracted/resolved — so we can skip the
    expensive download + transcribe + extract entirely on a re-run."""
    try:
        with db.connect() as c:
            row = c.execute("select status from sources where video_id=%s", (key_id,)).fetchone()
        return bool(row and row["status"] in ("extracted", "resolved"))
    except Exception:  # noqa: BLE001 — never let a dedup check block ingestion
        return False


def _episode_key(audio_url: str, title: str) -> str:
    return "podcast_" + hashlib.sha1((audio_url or title).encode()).hexdigest()[:12]


def _download(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        while chunk := r.read(1 << 16):
            f.write(chunk)


def _to_wav16k(src: Path, dest: Path, max_seconds: int) -> None:
    """Decode to mono 16 kHz WAV — the format whisper wants. max_seconds>0 caps the
    duration (ffmpeg -t) so a 2-hour episode can't become a 2-hour transcription."""
    cmd = ["ffmpeg", "-y", "-i", str(src), "-ac", "1", "-ar", "16000"]
    if max_seconds > 0:
        cmd += ["-t", str(max_seconds)]
    cmd.append(str(dest))
    subprocess.run(cmd, check=True, capture_output=True)


def transcribe(audio: Path, workdir: Path) -> str:
    wav = workdir / "audio16k.wav"
    _to_wav16k(audio, wav, _max_minutes() * 60)
    model = _get_model()
    # Greedy (beam_size=1) + VAD (skip silence) + no cross-segment conditioning:
    # several times faster on CPU than the beam-5 default, and avoids repetition loops.
    segments, _info = model.transcribe(
        str(wav),
        vad_filter=True,
        beam_size=1,
        condition_on_previous_text=False,
    )
    return " ".join(seg.text.strip() for seg in segments).strip()


def ingest_episode(feed_title: str, entry) -> None:
    audio_url = None
    for link in entry.get("links", []):
        if link.get("rel") == "enclosure" and "audio" in (link.get("type") or ""):
            audio_url = link.get("href")
            break
    audio_url = audio_url or next((e.get("href") for e in entry.get("enclosures", [])), None)
    title = entry.get("title", "untitled")
    if not audio_url:
        print(f"[podcast] skip (no audio): {title[:60]}")
        return

    key_id = _episode_key(audio_url, title)
    if _already_ingested(key_id):
        print(f"[podcast] skip (already ingested): {title[:55]}")
        return

    with tempfile.TemporaryDirectory() as td:
        tdp = Path(td)
        raw = tdp / "raw_audio"
        try:
            print(f"[podcast] {feed_title} | \"{title[:55]}\" — downloading + transcribing…")
            _download(audio_url, raw)
            text = transcribe(raw, tdp)
        except (subprocess.CalledProcessError, OSError, Exception) as e:  # noqa: BLE001
            print(f"[podcast] FAIL {title[:50]}: {type(e).__name__} {str(e)[:80]}")
            return

    if len(text) < 200:
        print(f"[podcast] skip (transcript too short): {title[:50]}")
        return
    url = entry.get("link") or audio_url
    print(f"[podcast]   transcript {len(text)} chars — extracting…")
    res = ingest_text_source(
        platform="podcast", source_key=key_id, url=url, title=title,
        text=text[:18000], creator_name=feed_title, trust_source=True,
        content_type="podcast",
    )
    if res["ok"]:
        print(f"[podcast]   ok - {res['entities']} entities, {res['claims']} claims")
    else:
        print(f"[podcast]   skipped - {res.get('reason')}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("feeds", nargs="+", help="podcast RSS feed URLs")
    ap.add_argument("--limit", type=int, default=2, help="episodes per feed")
    args = ap.parse_args()

    for feed_url in args.feeds:
        parsed = feedparser.parse(feed_url)
        feed_title = parsed.feed.get("title", feed_url)
        entries = parsed.entries[: args.limit]
        print(f"[podcast] {feed_title}: {len(entries)} episodes")
        for entry in entries:
            ingest_episode(feed_title, entry)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
