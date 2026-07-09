#!/usr/bin/env bash
# Simple Skill Manager — one-command launcher (production build).
#
# Usage:
#   ./start.sh             # build + run against your REAL $HOME on :3000
#   ./start.sh --sandbox   # build + run against a throwaway sandbox tree on :3210
#   PORT=4000 ./start.sh   # pick a port
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

echo "🔨 Building…"
npm run build

if [ "$MODE" = "sandbox" ]; then
  echo "🛟 Sandbox mode — building fake agent tree (real files untouched)"
  node scripts/build-sandbox.mjs
  export SSM_AGENT_ROOT="$PWD/.ssm-sandbox/home"
  export SSM_DATA_DIR="$PWD/.ssm-sandbox/data"
  echo "🏝️  http://localhost:$PORT   (SANDBOX / fake data)"
else
  echo "🏝️  http://localhost:$PORT   (REAL machine: $HOME)"
  echo "    First open does a read-only scan and changes nothing."
fi

# Record the port so stop.sh knows what to shut down.
echo "$PORT" > .ssm-run-port

exec npx next start -p "$PORT" -H 127.0.0.1
