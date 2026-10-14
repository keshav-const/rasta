"""Environment + settings loader. Reads C:\\ts\\.env once."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Project root = parent of this package dir.
ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


def _require(key: str) -> str:
    val = os.getenv(key, "").strip()
    if not val:
        raise RuntimeError(f"Missing required env var: {key} (set it in .env)")
    return val


def get(key: str, default: str = "") -> str:
    return os.getenv(key, default).strip()


# --- Supabase / Postgres ---
# Pooler URL (IPv4). Direct db.<ref> endpoint is IPv6-only and unreachable here.
def db_url() -> str:
    return _require("SUPABASE_DB_URL")


# --- External APIs (lazy: only required by the stage that uses them) ---
def youtube_api_key() -> str:
    return _require("YOUTUBE_API_KEY")


def google_places_api_key() -> str:
    return _require("GOOGLE_PLACES_API_KEY")


def places_configured() -> bool:
    """True if a Google Places key is present (for graceful Stage 7 skips)."""
    return bool(get("GOOGLE_PLACES_API_KEY"))


# --- LLM (provider-agnostic, OpenAI-compatible) ---
def llm_api_key() -> str:
    return _require("LLM_API_KEY")


def llm_base_url() -> str:
    # Normalize: strip trailing slash so we can append /chat/completions cleanly.
    return _require("LLM_BASE_URL").rstrip("/")


def llm_model() -> str:
    """Main/extraction model."""
    return _require("LLM_MODEL")


def llm_gate_model() -> str:
    """Cheap model for the Stage 3 gate; falls back to the main model."""
    return get("LLM_GATE_MODEL") or llm_model()


def llm_configured() -> bool:
    """True if the minimum LLM env is present (for graceful stage skips)."""
    return bool(get("LLM_API_KEY") and get("LLM_BASE_URL") and get("LLM_MODEL"))
