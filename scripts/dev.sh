#!/usr/bin/env bash
# Run the API and the web app together. Ctrl+C stops both.
#   API_PORT=8000 WEB_PORT=3000 ./scripts/dev.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-3000}"

if [ -t 1 ]; then B=$'\e[1m'; C=$'\e[36m'; M=$'\e[35m'; R=$'\e[31m'; N=$'\e[0m'; else B= C= M= R= N=; fi

[ -x "$ROOT/backend/.venv/bin/uvicorn" ] && [ -f "$ROOT/backend/.env" ] && [ -d "$ROOT/frontend/node_modules" ] ||
  { echo "${R}Not set up yet. Run ./scripts/setup.sh first.${N}"; exit 1; }

port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
for p in "$API_PORT" "$WEB_PORT"; do
  if port_busy "$p"; then echo "${R}Port $p is already in use. Stop whatever is using it or set API_PORT / WEB_PORT.${N}"; exit 1; fi
done

pids=()
cleanup() { trap - INT TERM EXIT; kill "${pids[@]}" 2>/dev/null || true; wait 2>/dev/null || true; }
trap cleanup INT TERM EXIT

prefix() { local tag="$1"; while IFS= read -r line; do printf '%s %s\n' "$tag" "$line"; done; }

(cd "$ROOT/backend" && exec .venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port "$API_PORT" 2>&1) | prefix "${C}[api]${N}" &
pids+=($!)
(cd "$ROOT/frontend" && API_ORIGIN="http://127.0.0.1:$API_PORT" exec npx next dev -p "$WEB_PORT" 2>&1) | prefix "${M}[web]${N}" &
pids+=($!)

for _ in $(seq 1 60); do
  curl -sf "http://127.0.0.1:$API_PORT/health" >/dev/null 2>&1 && curl -sf -o /dev/null "http://127.0.0.1:$WEB_PORT/login" 2>/dev/null && break
  sleep 1
done
printf '\n%s\n\n' "${B}Gymmy is running → http://localhost:$WEB_PORT   (API docs: http://127.0.0.1:$API_PORT/docs)   Ctrl+C to stop${N}"
wait -n "${pids[@]}" 2>/dev/null || wait
