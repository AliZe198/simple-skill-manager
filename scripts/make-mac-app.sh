#!/usr/bin/env bash
# Build a double-clickable macOS app that launches Simple Skill Manager.
#
#   bash scripts/make-mac-app.sh [target-dir]     # default: ~/Applications
#
# The generated app is a thin launcher around the production server: it starts
# `next start` against the build already in this folder and opens your browser.
# It deliberately never kicks off a from-scratch build in the background — if no
# build exists it says so, so a first build can never silently eat the machine.
#
# The repo path is baked into the app, so re-run this script if you move the
# folder (or after renaming it).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${1:-$HOME/Applications}"
APP_NAME="Simple Skill Manager"
APP="$TARGET_DIR/$APP_NAME.app"

mkdir -p "$APP/Contents/MacOS"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${APP_NAME}</string>
  <key>CFBundleDisplayName</key><string>${APP_NAME}</string>
  <key>CFBundleIdentifier</key><string>com.simpleskillmanager.launcher</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>launcher</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

# First heredoc is unquoted so the repo path is baked in; the rest is quoted so
# nothing else gets expanded at build time.
cat > "$APP/Contents/MacOS/launcher" <<LAUNCHER_HEAD
#!/bin/bash
REPO="${REPO_ROOT}"
LAUNCHER_HEAD

cat >> "$APP/Contents/MacOS/launcher" <<'LAUNCHER_BODY'
set -u

# Finder hands GUI apps a bare PATH, so Node usually isn't on it. Add the
# places it actually gets installed.
for d in /opt/homebrew/bin /usr/local/bin "$HOME/.volta/bin" "$HOME/.bun/bin"; do
  [ -x "$d/node" ] && PATH="$d:$PATH"
done
if [ -d "$HOME/.nvm/versions/node" ]; then
  nvm_bin="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)"
  [ -n "${nvm_bin:-}" ] && PATH="$nvm_bin:$PATH"
fi
export PATH

die() {
  /usr/bin/osascript -e "display dialog \"$1\" with title \"Simple Skill Manager\" buttons {\"OK\"} default button 1 with icon caution" >/dev/null 2>&1
  exit 1
}

command -v node >/dev/null 2>&1 || \
  die "Node.js not found.\n\nInstall it from nodejs.org, then open this app again."

cd "$REPO" 2>/dev/null || \
  die "Can't find the app folder:\n$REPO\n\nIf you moved or renamed it, re-run scripts/make-mac-app.sh."

[ -d ".next" ] || \
  die "No build yet.\n\nOpen Terminal and run:\n\ncd $REPO\nnpm install && npm run build\n\nThen open this app again."

# First free port from 3000 up.
PORT=3000
while [ "$PORT" -lt 3020 ] && /usr/sbin/lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

# Quitting the app stops the server too.
trap 'kill 0' EXIT INT TERM

npx next start -H 127.0.0.1 -p "$PORT" &
SERVER=$!

# Give the server a moment to answer before opening the browser.
for _ in $(seq 1 40); do
  /usr/bin/curl -fsS "http://127.0.0.1:$PORT" >/dev/null 2>&1 && break
  sleep 0.25
done
/usr/bin/open "http://127.0.0.1:$PORT"

wait "$SERVER"
LAUNCHER_BODY

chmod +x "$APP/Contents/MacOS/launcher"

echo "✅ Built: $APP"
echo "   Double-click it in Finder, or drag it to your Dock."
echo "   Repo baked in: $REPO_ROOT"
