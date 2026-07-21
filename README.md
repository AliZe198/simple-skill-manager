**English** | [中文](README.zh-CN.md)

# Simple Skill Manager

A local web app that gathers the **skills** scattered across your AI coding agents (Claude Code, Codex, Gemini CLI, OpenClaw, Kimi, and more — 13 agents auto-detected) into **one deduplicated, source-classified library**, and lets you decide which agent gets which skill with a single click. It also gives you a **read-only overview of your MCP configs**.

Runs entirely on your machine. No cloud, no account.

## Quick start

Requires **Node.js 18+**. No clone, no build:

```bash
npx simple-skill-manager             # run against your real home dir (port 3000)
npx simple-skill-manager --port 4000 # pick a port
```

Then open http://localhost:3000. The server listens on `127.0.0.1` only, so it's never reachable from your network. Stop it with Ctrl+C.

The first launch does a **read-only scan and changes nothing** — you get a deduplicated list before anything is moved.

### Windows

`npx simple-skill-manager` works the same in PowerShell or cmd.

> **Symlinks on Windows** require Developer Mode (Settings → Privacy & security → For developers) or an admin terminal. Don't want either? Switch agents to **copy mode** in Settings — no special permissions needed.

### macOS: a double-clickable app

Prefer an icon in your Dock over a terminal command? You build it once, on your own machine:

```bash
git clone https://github.com/AliZe198/simple-skill-manager.git
cd simple-skill-manager
npm install
npm run build
bash scripts/make-mac-app.sh          # → ~/Applications/Simple Skill Manager.app
```

Double-click it in Finder or drag it to your Dock. It starts the server and opens your browser; Cmd+Q quits the app and shuts the server down, like any other Mac app.

macOS only. The clone's path is baked into the app, so re-run the last command if you move or rename the folder.

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

## Contributing

Want to hack on the app itself? See [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits

The visual design is based on / inspired by [animal-island-ui](https://github.com/guokaigdg/animal-island-ui) by [@guokaigdg](https://github.com/guokaigdg). Thank you!

## License

[MIT](LICENSE)
