#!/usr/bin/env bash
# Simple Skill Manager — dev launcher (hot-reload, no build step).
#
# Usage:
#   ./dev.sh             # run against your REAL $HOME on :3000, auto-reloads on edits
#   ./dev.sh --sandbox   # run against a throwaway sandbox tree on :3210
#   PORT=4000 ./dev.sh   # pick a port
set -euo pipefail
cd "$(dirname "$0")"

MODE="real"
PORT="${PORT:-3000}"
for arg in "$@"; do
  case "$arg" in
    --sandbox) MODE="sandbox"; PORT="${PORT:-3210}" ;;
  esac
done

if [ ! -d node_modules ]; then
  echo "📦 Installing dependencies…"
  npm install
fi

if [ "$MODE" = "sandbox" ]; then
  echo "🛟 Sandbox mode — building fake agent tree (real files untouched)"
  node scripts/build-sandbox.mjs
  export SSM_AGENT_ROOT="$PWD/.ssm-sandbox/home"
  export SSM_DATA_DIR="$PWD/.ssm-sandbox/data"
  echo "🏝️  http://localhost:$PORT   (DEV / SANDBOX / fake data)"
else
  echo "🏝️  http://localhost:$PORT   (DEV / REAL machine: $HOME)"
  echo "    Hot-reload on; first open does a read-only scan and changes nothing."
fi

# Record the port so stop.sh knows what to shut down.
echo "$PORT" > .ssm-run-port

exec npx next dev -p "$PORT"
