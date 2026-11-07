#!/usr/bin/env bash
# Themed extraction batch runner.
#
# Sets the OpenAI LLM env (no daily cap, unlike the Gemini default in ts/.env) and
# dispatches a curated list file to the right ingester. All ingesters run the SAME
# gate + extractor, so places and cultural entities land in the graph consistently.
#
#   bash scripts/run_batch.sh wikipedia scripts/batches/cuisine_wikipedia.txt
#   bash scripts/run_batch.sh wikipedia scripts/batches/sports_wikipedia.txt
#   bash scripts/run_batch.sh blog      scripts/batches/cuisine_sports_blogs.txt
#   PODCAST_LIMIT=2 bash scripts/run_batch.sh podcast scripts/batches/cuisine_podcasts.txt
#
# Lines starting with # or blank are ignored. After ingesting, run the consolidation:
#   python scripts/resolve.py && python scripts/score.py && \
#     python scripts/hackathon_export/geocode_pois.py
set -uo pipefail

MODE="${1:?usage: run_batch.sh <wikipedia|blog|podcast> <listfile>}"
LIST="${2:?list file required}"
TS="$(cd "$(dirname "$0")/.." && pwd)"
HACK_ENV="/Users/admin/Downloads/qloo-hackathon/.env"
cd "$TS"
source .venv-mac/bin/activate 2>/dev/null || true

# LLM extraction via OpenAI (no daily cap); key never echoed.
export LLM_API_KEY="$(grep -E '^LLM_OPENAI_API_KEY=' "$HACK_ENV" | head -1 | cut -d= -f2-)"
export LLM_BASE_URL="https://api.openai.com/v1"
export LLM_MODEL="gpt-4o-mini"
export GATE_MODEL="gpt-4o-mini"

# Collect non-comment, non-blank lines into an array.
ITEMS=()
while IFS= read -r line; do
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  ITEMS+=("$line")
done < "$LIST"

echo "[batch:$MODE] ${#ITEMS[@]} items from $LIST"
[[ ${#ITEMS[@]} -eq 0 ]] && { echo "[batch:$MODE] nothing to do"; exit 0; }

case "$MODE" in
  wikipedia)
    python scripts/ingest_wikipedia.py "${ITEMS[@]}" --site wikipedia
    ;;
  blog)
    python scripts/ingest_blog.py "${ITEMS[@]}"
    ;;
  podcast)
    for rss in "${ITEMS[@]}"; do
      echo "[batch:podcast] $rss"
      python scripts/ingest_podcast.py "$rss" --limit "${PODCAST_LIMIT:-2}"
    done
    ;;
  *)
    echo "unknown mode: $MODE (expected wikipedia|blog|podcast)"; exit 2
    ;;
esac
echo "[batch:$MODE] done"
