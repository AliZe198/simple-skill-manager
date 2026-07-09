**English** | [中文](README.zh-CN.md)

# Simple Skill Manager

A local web app that gathers the **skills** scattered across your AI coding agents (Claude Code, Codex, Gemini CLI, OpenClaw, Kimi, and more — 13 agents auto-detected) into **one deduplicated, source-classified library**, and lets you decide which agent gets which skill with a single click. It also gives you a **read-only overview of your MCP configs**.

Runs entirely on your machine. No cloud, no account.

## Features

- **Auto-detects installed agents** (13 adapters) and scans their skill directories
- **Deduplication by content hash** — same content under different names collapses into one row; same name with different content stays separate (never silently merged)
- **Central library** — adopt a skill into the library once, and each agent gets a symlink (or a copy, for agents that don't follow symlinks)
- **Per-agent enable / disable** — one click on an agent avatar
- **Idle skills** — keep a skill in the library without handing it to any agent (filter for them in My Library)
- **Duplicate merge, safe rename, tags** — rename updates the folder, the `name:` field, and every agent link at once
- **Update check** — only for skills with a recorded `git_url` origin; hand-written local skills are never touched
- **GitHub backup & multi-machine sync** — back the library up to a private repo of your own; destructive operations take an automatic local git snapshot first
- **Marketplace** — browse and install skills from skills.sh (with a built-in offline catalog)
- **MCP overview** — read-only view of MCP configs across JSON / TOML / YAML formats, secrets masked by default
- **Bilingual UI** — English by default, switch to 中文 with the toggle at the bottom of the sidebar (remembered across sessions)

## Safety model

The first launch does a **read-only scan and changes nothing**. After that, the tool only ever writes inside two roots:

| Env var            | Meaning                                                        | Default                     |
| ------------------ | -------------------------------------------------------------- | --------------------------- |
| `SSM_AGENT_ROOT` | Root under which agent dirs (`.claude`, `.codex`, …) live | your real `$HOME`         |
| `SSM_DATA_DIR`   | Central library + SQLite DB + config                           | `~/.simple-skill-manager` |

Writes outside these roots are rejected (realpath-checked, symlink escapes blocked). It also **never overwrites a same-named skill it doesn't manage** — your hand-written files are safe.

## Quick start

Requires **Node.js 18+**. The fastest way — no clone, no build:

```bash
npx simple-skill-manager             # run against your real home dir (port 3000)
npx simple-skill-manager --sandbox   # try it safely first: fake data, real files untouched
npx simple-skill-manager --port 4000 # pick a port
```

The server listens on `127.0.0.1` only, so it's never reachable from your network. Stop it with Ctrl+C.

**Recommended first step: sandbox mode.** This tool moves / symlinks / copies / deletes files inside your agent directories, so play with a fake directory tree first (`--sandbox`), then run it for real once you're comfortable.

### From a git clone (for development)

```bash
./start.sh              # production build + run against your real $HOME (port 3000)
./start.sh --sandbox    # sandbox: fake data, real files untouched (port 3210)
./dev.sh                # dev mode: no build step, hot reload
./stop.sh               # stop the running server
```

> `dev.sh` vs `start.sh`: `dev.sh` hot-reloads as you edit code; `start.sh` serves a frozen production build — after changing code you must `./stop.sh && ./start.sh` again.

## Quick start (Windows)

The `.sh` scripts are bash-only (they run under Git Bash / WSL). Native PowerShell or cmd works with plain npm commands:

```powershell
npm install     # installs native better-sqlite3 (prebuilt binaries in most cases)
npm run build
npm run start   # → http://localhost:3000 (scans your real %USERPROFILE%)
# or, for development with hot reload:  npm run dev
```

> **Symlinks on Windows** require Developer Mode (Settings → Privacy & security → For developers) or an admin terminal. Don't want either? Switch agents to **copy mode** in Settings — no special permissions needed.

## Sandbox mode, manually

```bash
node scripts/build-sandbox.mjs        # builds a fake agent tree under .ssm-sandbox/
SSM_AGENT_ROOT="$PWD/.ssm-sandbox/home" \
SSM_DATA_DIR="$PWD/.ssm-sandbox/data" \
  npx next dev -p 3210
```

## Core concepts

| Action                       | Meaning                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Import**             | Move a scattered skill into the central library; the original location becomes a symlink (or copy)                                         |
| **Enable / Disable**   | Toggle a skill for one specific agent                                                                                                      |
| **Idle**               | In the library, but handed to no agent — saved for later                                                                                  |
| **Move to My Library** | Duplicate an agent's built-in skill as your own (copy only, original untouched)                                                            |
| **Rename**             | Safe rename: updates `SKILL.md` `name:`, the folder, and every agent link (renaming the folder by hand in a file manager breaks links) |
| **Tags**               | Per-skill tags for filtering, plus global tag rename / delete in Settings                                                                  |

## GitHub backup & sync

Settings → "GitHub backup & sync" backs your **skill library** up to a **private** GitHub repo of yours and syncs it across machines (uses your logged-in `gh` CLI).

- **Backup now** (local → cloud): push only, never touches local files
- **Sync from cloud** (cloud → local): merge, keeps local changes
- **Restore cloud version** (cloud → local): overwrite — an automatic local restore point is created first
- What syncs: skill files + `manifest.json` (hashes, origins, tags). What doesn't: which agent uses which skill — each machine decides that for itself.
- Cross-platform content hashes are kept identical via `.gitattributes eol=lf` (tested macOS ↔ Windows)

## Tests

```bash
npm test          # unit + safety regression tests
npm run build     # production build
npm run typecheck # tsc --noEmit
```

## Tech stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS · better-sqlite3 · SWR · Vitest

## License

[MIT](LICENSE)
