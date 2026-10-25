"""Provider-agnostic LLM client (OpenAI-compatible /chat/completions).

Works with ANY provider that speaks the OpenAI chat API: Agnes, OpenAI,
DeepSeek, Groq, OpenRouter, local (Ollama/LM Studio). Swap providers by
changing LLM_BASE_URL / LLM_MODEL / LLM_API_KEY in .env - no code changes.

Resilience built in:
  - retries with backoff on network errors, 429, and 5xx
  - tolerant JSON extraction (handles ```json fences and prose wrappers)
  - clear errors instead of raw tracebacks
"""
from __future__ import annotations

import json
import re
import time
from typing import Any

import requests

from . import config

_TRANSIENT_STATUS = {408, 409, 425, 429, 500, 502, 503, 504}

# Optional global pacing between LLM calls (env LLM_MIN_INTERVAL_MS). Keeps rate-limited
# free tiers (e.g. Gemini ~15 RPM) under their limit when batching. 0 = disabled (default).
_last_call_ts: float = 0.0

# Count HTTP requests sent per provider base (every POST, including retries), so a batch
# runner can watch how much of a daily free-tier budget it has spent. Printed via env flag.
_request_counts: dict[str, int] = {}


def _pace() -> None:
    global _last_call_ts
    try:
        min_interval = float(config.get("LLM_MIN_INTERVAL_MS") or 0) / 1000.0
    except ValueError:
        min_interval = 0.0
    if min_interval <= 0:
        return
    wait = _last_call_ts + min_interval - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    _last_call_ts = time.monotonic()


class LLMError(RuntimeError):
    """Raised when the LLM call fails or returns unusable output."""


def _extract_json(text: str) -> dict[str, Any]:
    """Parse a JSON object from model output, tolerating fences / prose."""
    if not text or not text.strip():
        raise LLMError("empty LLM response")
    t = text.strip()

    # 1) direct parse
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        pass

    # 2) strip ```json ... ``` or ``` ... ``` fences
    fence = re.search(r"```(?:json)?\s*(.*?)```", t, re.DOTALL)
    if fence:
        try:
            return json.loads(fence.group(1).strip())
        except json.JSONDecodeError:
            pass

    # 3) grab the outermost { ... } span
    start, end = t.find("{"), t.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(t[start : end + 1])
        except json.JSONDecodeError:
            pass

    raise LLMError(f"could not parse JSON from response: {t[:200]}")


def _request_once(
    base: str, key: str, model: str, system: str, user: str,
    max_tokens: int, temperature: float, max_retries: int, timeout: int,
) -> str:
    """One provider's request loop. Raises LLMError on failure (so chat() can fall back)."""
    url = f"{base}/chat/completions"
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    last_err: str = ""
    for attempt in range(1, max_retries + 1):
        _pace()  # keep calls spaced under the provider's rate limit (if LLM_MIN_INTERVAL_MS set)
        _request_counts[base] = _request_counts.get(base, 0) + 1
        if config.get("LLM_COUNT_REQUESTS"):
            print(f"[llm] request #{_request_counts[base]} -> {base}")
        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
        except requests.RequestException as e:
            last_err = f"network error: {e}"
        else:
            if resp.status_code == 200:
                try:
                    data = resp.json()
                    choice = data["choices"][0]
                    content = choice["message"]["content"]
                except (ValueError, KeyError, IndexError) as e:
                    raise LLMError(f"unexpected response shape: {e} | {resp.text[:200]}")
                if choice.get("finish_reason") == "length":
                    raise LLMError(
                        "response truncated (finish_reason=length) - "
                        "raise max_tokens or chunk the transcript"
                    )
                return content
            last_err = f"HTTP {resp.status_code}: {resp.text[:200]}"
            if resp.status_code not in _TRANSIENT_STATUS:
                raise LLMError(last_err)  # non-transient (bad key, bad model) - fail fast
            # A *daily* quota 429 (e.g. Gemini free tier RPD) won't reset for hours - retrying
            # just burns more of the daily budget. Fail fast so chat() falls back immediately.
            if resp.status_code == 429 and any(
                m in resp.text for m in ("PerDay", "free_tier_requests", "GenerateRequestsPerDay")
            ):
                raise LLMError(f"daily quota exhausted - {last_err}")
        if attempt < max_retries:
            time.sleep(2 ** attempt)  # 2s, 4s backoff
    raise LLMError(f"LLM call failed after {max_retries} attempts - {last_err}")


def chat(
    system: str,
    user: str,
    *,
    model: str | None = None,
    max_tokens: int = 1024,
    temperature: float = 0.0,
    max_retries: int = 3,
    timeout: int = 60,
) -> str:
    """Call the chat endpoint, return the raw assistant text.

    Tries the primary provider, then a fallback (LLM_FALLBACK_* — e.g. Groq, which has a
    separate daily quota) if the primary is rate-limited/exhausted. The model override only
    applies to the primary; the fallback uses its own model. Raises LLMError if all fail.
    """
    providers: list[tuple[str, str, str]] = [
        (config.llm_base_url(), config.llm_api_key(), model or config.llm_model()),
    ]
    fb_key = config.get("LLM_FALLBACK_API_KEY")
    if fb_key:
        providers.append((
            config.get("LLM_FALLBACK_BASE_URL") or "https://api.groq.com/openai/v1",
            fb_key,
            config.get("LLM_FALLBACK_MODEL") or "openai/gpt-oss-120b",
        ))

    last_err: LLMError | None = None
    for i, (base, key, mdl) in enumerate(providers):
        if not key:
            continue
        try:
            return _request_once(base, key, mdl, system, user, max_tokens, temperature, max_retries, timeout)
        except LLMError as e:
            last_err = e
            if i < len(providers) - 1:
                print(f"[llm] provider {i + 1} failed ({str(e)[:90]}) - falling back")
            continue
    raise last_err or LLMError("no LLM provider configured")


def chat_json(system: str, user: str, **kwargs: Any) -> dict[str, Any]:
    """chat() + tolerant JSON parse. Returns a dict."""
    return _extract_json(chat(system, user, **kwargs))
