#!/usr/bin/env bash
# Hands-off recovery of transcript-blocked YouTube sources.
#
# Loops: probe the YouTube transcript endpoint; while still IP-blocked, wait and
# re-probe; once clear, drain a capped, paced batch of blocked sources, then pause
# and repeat until the queue is empty. Pacing between pulls is enforced in stage4
# (TRANSCRIPT_MIN_INTERVAL_SEC); this script adds the wait-for-unblock loop, a
# per-round cap, and long sleeps so we never hammer a blocked IP.
#
# Run in the background:   nohup bash scripts/auto_retry_blocked.sh >> /tmp/rasta_retry.log 2>&1 &
# Or from cron (hourly):   0 * * * * cd /path/to/ts && bash scripts/auto_retry_blocked.sh --once >> /tmp/rasta_retry.log 2>&1
set -uo pipefail

TS="$(cd "$(dirname "$0")/.." && pwd)"
HACK_ENV="/Users/admin/Downloads/qloo-hackathon/.env"
cd "$TS"
source .venv-mac/bin/activate 2>/dev/null || true

# LLM extraction via OpenAI (no daily cap); never echoed.
export LLM_API_KEY="$(grep -E '^LLM_OPENAI_API_KEY=' "$HACK_ENV" | head -1 | cut -d= -f2-)"
export LLM_BASE_URL="https://api.openai.com/v1"
export LLM_MODEL="gpt-4o-mini"
export GATE_MODEL="gpt-4o-mini"
export LLM_FALLBACK_API_KEY=""
# Pace transcript pulls: one every ~10s (+jitter) keeps us well under the throttle.
export TRANSCRIPT_MIN_INTERVAL_SEC="${TRANSCRIPT_MIN_INTERVAL_SEC:-10}"

MAX_PER_ROUND="${MAX_PER_ROUND:-30}"   # cap sources recovered per drain round
BLOCK_WAIT="${BLOCK_WAIT:-1800}"       # sleep 30m when still blocked
ROUND_PAUSE="${ROUND_PAUSE:-120}"      # pause 2m between drain rounds
ONCE=0; [ "${1:-}" = "--once" ] && ONCE=1

while true; do
  remaining="$(python scripts/retry_blocked.py --count 2>/dev/null | tail -1)"
  if [ "${remaining:-0}" = "0" ]; then
    echo "[auto-retry] $(date '+%F %T') queue empty — done"
    break
  fi
  if python scripts/retry_blocked.py --probe >/dev/null 2>&1; then
    echo "[auto-retry] $(date '+%F %T') CLEAR — draining up to $MAX_PER_ROUND (of $remaining)"
    python scripts/retry_blocked.py --max "$MAX_PER_ROUND"
    [ "$ONCE" = "1" ] && break
    sleep "$ROUND_PAUSE"
  else
    echo "[auto-retry] $(date '+%F %T') still BLOCKED ($remaining queued) — sleeping ${BLOCK_WAIT}s"
    [ "$ONCE" = "1" ] && break
    sleep "$BLOCK_WAIT"
  fi
done
