#!/usr/bin/env bash
# Simple Skill Manager — stop the running server.
#
# Usage:
#   ./stop.sh            # stop the server started by ./start.sh
#   PORT=4000 ./stop.sh  # stop a server on a specific port
set -euo pipefail
cd "$(dirname "$0")"

# Figure out which port to stop: explicit $PORT > the one start.sh recorded > 3000.
if [ -n "${PORT:-}" ]; then
  TARGET="$PORT"
elif [ -f .ssm-run-port ]; then
  TARGET="$(cat .ssm-run-port)"
else
  TARGET="3000"
fi

# Find the process(es) listening on that port.
PIDS="$(lsof -ti "tcp:$TARGET" 2>/dev/null || true)"

if [ -z "$PIDS" ]; then
  echo "ℹ️  Nothing is running on port $TARGET."
  rm -f .ssm-run-port
  exit 0
fi

echo "🛑 Stopping Simple Skill Manager on port $TARGET (PID: $PIDS)…"
# Ask nicely first.
kill $PIDS 2>/dev/null || true

# Give it a moment, then force-kill anything still alive.
for _ in 1 2 3 4 5; do
  sleep 1
  STILL="$(lsof -ti "tcp:$TARGET" 2>/dev/null || true)"
  [ -z "$STILL" ] && break
done
STILL="$(lsof -ti "tcp:$TARGET" 2>/dev/null || true)"
if [ -n "$STILL" ]; then
  echo "   …still up, forcing."
  kill -9 $STILL 2>/dev/null || true
fi

rm -f .ssm-run-port
echo "✅ Stopped."
