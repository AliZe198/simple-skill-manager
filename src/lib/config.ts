import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type { AppConfig } from "./types";

/**
 * SAFETY FOUNDATION (see advisor note + PRD §12).
 *
 * Every agent path resolves from this config. Two env vars make it possible
 * to point the entire app at a sandbox fixture tree instead of the user's
 * real $HOME — this is what makes automated testing of mutating flows safe:
 *
 *   SSM_AGENT_ROOT  → root under which agent dirs (.claude, .codex, …) live.
 *                     Defaults to the real home dir.
 *   SSM_DATA_DIR    → where our own central library + DB + config live.
 *                     Defaults to ~/.simple-skill-manager.
 *
 * Nothing in this app writes outside SSM_AGENT_ROOT / SSM_DATA_DIR.
 */

export function agentRoot(): string {
  return process.env.SSM_AGENT_ROOT || os.homedir();
}

export function dataDir(): string {
  return (
    process.env.SSM_DATA_DIR ||
    path.join(os.homedir(), ".simple-skill-manager")
  );
}

export function libraryDir(): string {
  return path.join(dataDir(), "library");
}

export function dbPath(): string {
  return path.join(dataDir(), "ssm.db");
}

export function configPath(): string {
  return path.join(dataDir(), "config.json");
}

/** Resolve a path that lives under the agent root. */
export function underAgentRoot(...segments: string[]): string {
  return path.join(agentRoot(), ...segments);
}

/**
 * Resolve a path to its real on-disk location, following symlinks on the
 * existing portion. The target itself may not exist yet, so we realpath the
 * nearest existing ancestor and re-append the not-yet-created suffix.
 */
function realPathSafe(p: string): string {
  let cur = path.resolve(p);
  const tail: string[] = [];
  while (!fs.existsSync(cur)) {
    tail.unshift(path.basename(cur));
    const parent = path.dirname(cur);
    if (parent === cur) return path.resolve(p);
    cur = parent;
  }
  let base: string;
  try {
    base = fs.realpathSync(cur);
  } catch {
    base = cur;
  }
  return tail.length ? path.join(base, ...tail) : base;
}

/**
 * Guard: throw if a path escapes the directories we are allowed to touch.
 * Compares REAL paths (symlinks resolved) so a symlinked managed root — e.g.
 * ~/.claude -> ~/dotfiles/claude — cannot be used to write outside the root.
 */
export function assertWritable(target: string): void {
  const real = realPathSafe(target);
  const roots = [realPathSafe(agentRoot()), realPathSafe(dataDir())];
  const ok = roots.some(
    (root) => real === root || real.startsWith(root + path.sep)
  );
  if (!ok) {
    throw new Error(
      `Refusing to write outside managed roots: ${real}\n` +
        `(allowed: ${roots.join(", ")})`
    );
  }
}

export function ensureDataDir(): void {
  fs.mkdirSync(libraryDir(), { recursive: true });
}

const DEFAULT_OVERRIDES: AppConfig["overrides"] = {};

export function loadConfig(): AppConfig {
  ensureDataDir();
  let stored: Partial<AppConfig> = {};
  try {
    stored = JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch {
    // No config yet — first run.
  }
  return {
    agentRoot: agentRoot(),
    dataDir: dataDir(),
    libraryDir: libraryDir(),
    isRealHome: path.resolve(agentRoot()) === path.resolve(os.homedir()),
    overrides: stored.overrides ?? DEFAULT_OVERRIDES,
    ignoredAgents: Array.isArray(stored.ignoredAgents)
      ? stored.ignoredAgents
      : [],
    knownTags: Array.isArray(stored.knownTags) ? stored.knownTags : [],
    tagOrder: Array.isArray(stored.tagOrder) ? stored.tagOrder : [],
    theme: stored.theme ?? "dark",
  };
}

export function saveConfig(patch: Partial<AppConfig>): AppConfig {
  ensureDataDir();
  const current = loadConfig();
  // Coalesce each patch field against the current value: an explicit
  // `undefined` in the patch must NOT wipe an existing setting. (A spread
  // would let `overrides: undefined` overwrite — and then drop — the key.)
  const next: AppConfig = {
    ...current,
    overrides: patch.overrides ?? current.overrides,
    ignoredAgents: patch.ignoredAgents ?? current.ignoredAgents,
    knownTags: patch.knownTags ?? current.knownTags,
    tagOrder: patch.tagOrder ?? current.tagOrder,
    theme: patch.theme ?? current.theme,
  };
  // Only persist the user-tunable bits, not the derived paths.
  fs.writeFileSync(
    configPath(),
    JSON.stringify(
      {
        overrides: next.overrides,
        ignoredAgents: next.ignoredAgents,
        knownTags: next.knownTags,
        tagOrder: next.tagOrder,
        theme: next.theme,
      },
      null,
      2
    )
  );
  return next;
}
