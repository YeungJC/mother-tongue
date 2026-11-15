#!/usr/bin/env bash
# Starts Mother Tongue: gateway (voices, interviews), indexer, director and viewer. Ctrl-C stops
# everything.
#   ./start.sh              a fast live island: the Solana program run in-process (LiteSVM), paced
#                           for watching (a fresh island every start; logs in chain/client/data/live/)
#   ./start.sh --recorded   no chain, no keys: replay the recorded island (data/demo; TONGUE_DATA=… for another)
#   ./start.sh --devnet     the real cluster: the director plays lifetimes on devnet (resumes where it stopped)
#   ./start.sh --watch      devnet, watch only (no director)
# Live market rule: FLEX=0.5 (lenient) … 0 (strict), the chance a maker takes a bid it didn't ask for.
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(pwd)"
MODE="${1:-}"
[[ "$MODE" == "--watch" ]] && MODE="--devnet-watch"
FLEX="${FLEX:-0}"
VIEWER_PORT="${VIEWER_PORT:-5173}"
TSX="$ROOT/chain/client/node_modules/.bin/tsx"

case "$MODE" in
  --devnet|--devnet-watch) LOGS="$ROOT/chain/client/data/devnet" ;;
  --recorded) LOGS="$ROOT/chain/client/data/${TONGUE_DATA:-demo}" ;;
  "") LOGS="$ROOT/chain/client/data/live" ;;
  *) echo "unknown mode $MODE (try --recorded, --devnet, --watch)"; exit 1 ;;
esac
mkdir -p "$LOGS"

pids=()
cleanup() { echo; echo "stopping…"; for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

start() { # name, dir, command…
  local name="$1" dir="$2"; shift 2
  (cd "$dir" && exec "$@" >>"$LOGS/$name.log" 2>&1) &
  pids+=("$!")
  echo "  $name (pid $!) → $LOGS/$name.log"
}
free() { # port: stop whatever of ours is listening there (a previous start)
  local pid; pid="$(lsof -ti tcp:"$1" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pid" ]]; then echo "  port $1 busy (pid $pid): stopping it"; kill $pid 2>/dev/null || true; sleep 1; fi
}

echo "Mother Tongue: starting"
if curl -s localhost:8402/health >/dev/null 2>&1; then echo "  gateway already running on :8402"; else start gateway "$ROOT/chain/client" "$TSX" server/gateway.ts; fi
case "$MODE" in
  --recorded)
    free 8412
    start indexer "$ROOT/chain/client" env TONGUE_DATA="${TONGUE_DATA:-demo}" INDEXER_PORT=8412 "$TSX" server/indexer.ts
    INDEXER_URL="http://localhost:8412" ;;
  --devnet|--devnet-watch)
    free 8410
    start indexer "$ROOT/chain/client" "$TSX" server/indexer.ts
    INDEXER_URL="http://localhost:8410"
    until curl -s localhost:8402/health >/dev/null 2>&1; do sleep 1; done
    if [[ "$MODE" == "--devnet" ]]; then start director "$ROOT/chain/client" "$TSX" server/tongue.ts; fi ;;
  "")
    free 8412
    start director "$ROOT/chain/client" "$TSX" server/tongue.ts --litesvm --live --data live --flex "$FLEX"
    sleep 2 # the director wipes data/live/tongue before the indexer looks at it
    start indexer "$ROOT/chain/client" env TONGUE_DATA=live INDEXER_PORT=8412 "$TSX" server/indexer.ts
    INDEXER_URL="http://localhost:8412" ;;
esac
if lsof -ti tcp:"$VIEWER_PORT" -sTCP:LISTEN >/dev/null 2>&1; then echo "  viewer already running on :$VIEWER_PORT"; else start viewer "$ROOT" "$ROOT/node_modules/.bin/vite" --port "$VIEWER_PORT" --strictPort; fi
echo
echo "  open  http://localhost:$VIEWER_PORT/?indexer=$INDEXER_URL"
echo
wait
