import fs from "node:fs";
import path from "node:path";
import { agentRoot, loadConfig } from "./config";
import type { AgentConfig, DetectedAgent } from "./types";

/**
 * Built-in agent definitions (PRD §3). Paths are relative to the agent root
 * so the whole set re-points at a sandbox via SSM_AGENT_ROOT.
 *
 * linkMode defaults follow the PRD: symlink everywhere except Kimi, which is
 * suspected not to honor symlinks (the real probe is a manual, awake-user
 * action — see PRD §4.2).
 */
export const BUILTIN_AGENTS: AgentConfig[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    skillsDirs: [".claude/skills"],
    bundledDirs: [],
    linkMode: "symlink",
    mcpConfigPath: ".claude.json",
    mcpConfigFormat: "json-claude",
  },
  {
    id: "codex",
    label: "Codex",
    skillsDirs: [".codex/skills"],
    bundledDirs: [".codex/vendor_imports/skills"],
    linkMode: "symlink",
    mcpConfigPath: ".codex/config.toml",
    mcpConfigFormat: "toml-codex",
  },
  {
    id: "gemini",
    label: "Gemini",
    skillsDirs: [".gemini/skills"],
    bundledDirs: [],
    linkMode: "symlink",
    mcpConfigPath: ".gemini/settings.json",
    mcpConfigFormat: "json-gemini",
  },
  {
    id: "openclaw",
    label: "OpenClaw",
    skillsDirs: [".openclaw/skills"],
    bundledDirs: [".openclaw/workspace-companion/skills"],
    linkMode: "symlink",
    mcpConfigPath: ".openclaw/openclaw.json",
    mcpConfigFormat: "json-openclaw-mcporter",
  },
  {
    id: "hermes",
    label: "Hermes",
    skillsDirs: [".hermes/skills"],
    bundledDirs: [".hermes/hermes-agent/skills"],
    // Active Hermes skills are real copies under .hermes/skills. Match their
    // names against what hermes-agent ships (skills + optional-skills) to mark
    // them bundled — the co-located .bundled_manifest is stale and undercounts.
    bundledNameDirs: [
      ".hermes/hermes-agent/skills",
      ".hermes/hermes-agent/optional-skills",
    ],
    bundledManifest: ".hermes/skills/.bundled_manifest",
    linkMode: "symlink",
    mcpConfigPath: ".hermes/config.yaml",
    mcpConfigFormat: "yaml-hermes",
  },
  {
    id: "kimi",
    label: "Kimi Code",
    // Kimi rebranded to "Kimi Code" and moved its home to ~/.kimi-code. Keep the
    // legacy ~/.kimi as a fallback so users who haven't migrated are still found.
    // (id stays "kimi" so existing per-agent overrides/DB rows keep working.)
    skillsDirs: [".kimi-code/skills", ".kimi/skills"],
    bundledDirs: [],
    // ⚠️ PRD §3: Kimi shows no symlinks in the wild → default copy mode.
    linkMode: "copy",
    // Kimi Code keeps MCP servers in ~/.kimi-code/mcp.json (same JSON shape as
    // the legacy ~/.kimi/mcp.json) — NOT in config.toml.
    mcpConfigPath: ".kimi-code/mcp.json",
    mcpConfigFormat: "json-kimi",
  },
];

/** Extra candidate dirs to auto-detect (PRD §3 "其他"). */
const EXTRA_CANDIDATES: { id: string; label: string; dir: string }[] = [
  { id: "copilot", label: "Copilot", dir: ".copilot/skills" },
  { id: "kiro", label: "Kiro", dir: ".kiro/skills" },
  { id: "pi", label: "Pi", dir: ".pi/skills" },
  { id: "agents", label: "Agents", dir: ".agents/skills" },
  { id: "craft-agent", label: "Craft Agent", dir: ".craft-agent/skills" },
  { id: "opencode", label: "OpenCode", dir: ".config/opencode/skills" },
  { id: "workbuddy", label: "WorkBuddy", dir: ".workbuddy/skills" },
];

function applyOverrides(base: AgentConfig): AgentConfig {
  const { overrides } = loadConfig();
  const ov = overrides[base.id];
  return ov ? { ...base, ...ov } : base;
}

function dirExists(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Detect all agents: built-ins (always listed) + auto-detected extras. */
export function detectAgents(): DetectedAgent[] {
  const root = agentRoot();
  const cfg0 = loadConfig();
  const ignored = new Set(cfg0.ignoredAgents);
  const result: DetectedAgent[] = [];

  for (const builtin of BUILTIN_AGENTS) {
    const cfg = applyOverrides(builtin);
    const resolved = cfg.skillsDirs
      .map((d) => path.join(root, d))
      .filter(dirExists);
    result.push({
      ...cfg,
      detected: resolved.length > 0,
      ignored: ignored.has(cfg.id),
      resolvedSkillsDirs: resolved,
    });
  }

  for (const extra of EXTRA_CANDIDATES) {
    const cfg = applyOverrides({
      id: extra.id,
      label: extra.label,
      skillsDirs: [extra.dir],
      bundledDirs: [],
      linkMode: "symlink",
    });
    const resolved = cfg.skillsDirs
      .map((d) => path.join(root, d))
      .filter(dirExists);
    // Auto-detected extras only appear once their dir exists; a manual dir
    // override (saved before the dir was created) keeps them listed too.
    if (resolved.length > 0 || cfg.id in cfg0.overrides) {
      result.push({
        ...cfg,
        detected: resolved.length > 0,
        ignored: ignored.has(cfg.id),
        resolvedSkillsDirs: resolved,
      });
    }
  }

  return result;
}

/**
 * Resolve a candidate path (relative to the agent root) so the settings UI can
 * show "does this exist, and is it a dir or a file?" before the user saves it.
 * Used both for the skills dir (wants a directory) and the MCP config (a file).
 */
export function checkAgentPath(rel: string): {
  relative: string;
  absolute: string;
  isDir: boolean;
  isFile: boolean;
} {
  const relative = rel
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+|\/+$/g, "");
  const absolute = path.join(agentRoot(), relative);
  let isDir = false;
  let isFile = false;
  if (relative) {
    try {
      const st = fs.statSync(absolute);
      isDir = st.isDirectory();
      isFile = st.isFile();
    } catch {
      /* doesn't exist */
    }
  }
  return { relative, absolute, isDir, isFile };
}

export function getAgent(agentId: string): DetectedAgent | undefined {
  return detectAgents().find((a) => a.id === agentId);
}
