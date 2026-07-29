#!/usr/bin/env bash
# Build a double-clickable macOS app that launches Simple Skill Manager.
#
#   bash scripts/make-mac-app.sh [target-dir]     # default: ~/Applications
#
# This builds a REAL stay-open AppleScript applet (osacompile -s), not a shell
# script in an .app wrapper. That distinction is the whole point: a script-only
# bundle never registers with the window server, so it gets no Dock icon and
# Cmd+Q does nothing — leaving the server running with no obvious way to stop it.
# An applet shows up in the Dock and Cmd+Tab, and its `on quit` handler shuts the
# server down, so quitting works the way it does in any other Mac app.
#
# The app itself holds no application code — it starts `next start` against the
# build already in this folder. It never runs a build in the background; if none
# exists it says so, so a first build can't silently eat the machine.
#
# The repo path is baked in, so re-run this after moving or renaming the folder.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${1:-$HOME/Applications}"
APP_NAME="Simple Skill Manager"
APP="$TARGET_DIR/$APP_NAME.app"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$TARGET_DIR"

# ---------------------------------------------------------------- AppleScript
# Kept deliberately thin: it owns the app lifecycle (run / reopen / quit) and
# delegates the actual work to two shell scripts in Contents/Resources, so the
# logic stays readable and testable outside AppleScript's quoting rules.
cat > "$WORK/app.applescript" <<'APPLESCRIPT'
property serverPort : 0

on run
	startIt()
end run

-- Clicking the Dock icon again should bring the UI back, not start a 2nd server.
on reopen
	if serverPort > 0 then
		do shell script "/usr/bin/open http://127.0.0.1:" & serverPort
	else
		startIt()
	end if
end reopen

on idle
	return 30
end idle

on quit
	if serverPort > 0 then
		try
			do shell script quoted form of (POSIX path of (path to resource "stop.sh")) & " " & serverPort
		end try
	end if
	continue quit
end quit

on startIt()
	set starter to quoted form of (POSIX path of (path to resource "start.sh"))
	try
		-- start.sh waits for the server to answer, so allow more than the
		-- default Apple Event timeout.
		with timeout of 180 seconds
			set out to do shell script starter
		end timeout
	on error errMsg
		display dialog errMsg with title "Simple Skill Manager" buttons {"OK"} default button 1 with icon caution
		quit
		return
	end try
	set serverPort to out as integer
end startIt
APPLESCRIPT

rm -rf "$APP"
osacompile -s -o "$APP" "$WORK/app.applescript"

# ------------------------------------------------------------------- start.sh
cat > "$WORK/start.sh" <<'STARTSH'
#!/bin/bash
# Prints the port on success; prints a human message to stderr and exits 1 on
# failure (AppleScript surfaces stderr as the error dialog).
set -u
REPO="__REPO__"
PORT_LO=3000
PORT_HI=3019

# GUI processes get a bare PATH, so Node usually isn't on it. Cover the usual
# install locations plus the common version managers.
for d in /opt/homebrew/bin /usr/local/bin "$HOME/.volta/bin" "$HOME/.bun/bin" \
         "$HOME/.local/share/mise/shims"; do
  [ -x "$d/node" ] && PATH="$d:$PATH"
done
for base in "$HOME/.nvm/versions/node" "$HOME/.local/share/fnm/node-versions" \
            "$HOME/.asdf/installs/nodejs"; do
  [ -d "$base" ] || continue
  nb="$(ls -d "$base"/*/bin "$base"/*/installation/bin 2>/dev/null | sort -V | tail -1)"
  [ -n "${nb:-}" ] && PATH="$nb:$PATH"
done
export PATH

fail() { echo "$1" >&2; exit 1; }

command -v node >/dev/null 2>&1 || \
  fail "Node.js not found.

Install it from nodejs.org, then open this app again."

cd "$REPO" 2>/dev/null || \
  fail "Can't find the app folder:
$REPO

If you moved or renamed it, re-run scripts/make-mac-app.sh."

# Guard both halves of "can this actually run". Without node_modules, npx would
# try to fetch Next over the network with nowhere to show progress.
[ -d node_modules/next ] || \
  fail "Dependencies aren't installed.

Open Terminal and run:
cd $REPO
npm install && npm run build

Then open this app again."

[ -d .next ] || \
  fail "No build yet.

Open Terminal and run:
cd $REPO
npm run build

Then open this app again."

# Already serving? Reuse it rather than starting a second copy.
for p in $(seq "$PORT_LO" "$PORT_HI"); do
  if curl -fsS --max-time 2 "http://127.0.0.1:$p/api/agents" >/dev/null 2>&1; then
    /usr/bin/open "http://127.0.0.1:$p"
    echo "$p"
    exit 0
  fi
done

# A busy port that isn't ours belongs to another app — skip it, don't claim it.
PORT=""
for p in $(seq "$PORT_LO" "$PORT_HI"); do
  /usr/sbin/lsof -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1 || { PORT="$p"; break; }
done
[ -n "$PORT" ] || \
  fail "Ports $PORT_LO-$PORT_HI are all in use, so there's nowhere to start.

Close whatever is using them and try again."

nohup npx next start -H 127.0.0.1 -p "$PORT" >/dev/null 2>&1 &

# Wait until it actually answers before opening the browser, so nobody lands on
# a dead page. 60s covers a cold start.
for _ in $(seq 1 240); do
  if curl -fsS --max-time 1 "http://127.0.0.1:$PORT" >/dev/null 2>&1; then
    /usr/bin/open "http://127.0.0.1:$PORT"
    echo "$PORT"
    exit 0
  fi
  sleep 0.25
done

fail "The server didn't start.

Open Terminal and run:
cd $REPO
npm start

to see what went wrong."
STARTSH

# -------------------------------------------------------------------- stop.sh
cat > "$WORK/stop.sh" <<'STOPSH'
#!/bin/bash
# Stop whatever we started on this port. Kills the listener AND the npm/npx
# wrapper that spawned it, so nothing is left holding the port.
PORT="${1:-}"
[ -n "$PORT" ] || exit 0
pids="$(/usr/sbin/lsof -ti tcp:"$PORT" 2>/dev/null)"
[ -n "$pids" ] && kill $pids 2>/dev/null
pkill -f "next start -H 127.0.0.1 -p $PORT" 2>/dev/null
exit 0
STOPSH

# Bake the repo path in (| as delimiter — the path contains slashes).
sed "s|__REPO__|$REPO_ROOT|" "$WORK/start.sh" > "$APP/Contents/Resources/start.sh"
cp "$WORK/stop.sh" "$APP/Contents/Resources/stop.sh"
chmod +x "$APP/Contents/Resources/start.sh" "$APP/Contents/Resources/stop.sh"

# ----------------------------------------------------------------- app icon
# Built here rather than committed as a binary .icns: sips and iconutil ship
# with macOS, so one 1024px source covers every size the Dock and Finder ask for.
ICON_SRC="$REPO_ROOT/assets/mac-app-icon.png"
if [ -f "$ICON_SRC" ]; then
  ICONSET="$WORK/icon.iconset"
  mkdir -p "$ICONSET"
  for s in 16 32 128 256 512; do
    sips -z "$s" "$s" "$ICON_SRC" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null 2>&1
    sips -z "$((s * 2))" "$((s * 2))" "$ICON_SRC" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null 2>&1
  done
  iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/applet.icns"
  # osacompile ships an Assets.car holding the stock applet icon, and
  # CFBundleIconName points into it — on modern macOS that asset catalog wins
  # over applet.icns, so the custom icon never shows. Drop both and the system
  # falls back to CFBundleIconFile → our icns.
  rm -f "$APP/Contents/Resources/Assets.car"
  /usr/libexec/PlistBuddy -c "Delete :CFBundleIconName" "$APP/Contents/Info.plist" 2>/dev/null || true
  # Nudge Finder/Dock so they drop the cached old icon.
  touch "$APP"
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP" 2>/dev/null || true
fi

echo "✅ Built: $APP"
echo "   Double-click it in Finder, or drag it to your Dock."
echo "   Quit it like any Mac app — Cmd+Q, or right-click the Dock icon → Quit."
echo "   Repo baked in: $REPO_ROOT"
