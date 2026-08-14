import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Build a fake agent-dir tree under a temp root so mutation flows can be
 * tested without ever touching the user's real ~/.claude etc.
 * Returns { root, dataDir } to set SSM_AGENT_ROOT / SSM_DATA_DIR.
 */
export function buildFixtureTree(baseOverride?: string): {
  root: string;
  dataDir: string;
} {
  const base = baseOverride
    ? baseOverride
    : fs.mkdtempSync(path.join(os.tmpdir(), "ssm-fixture-"));
  if (baseOverride) fs.rmSync(base, { recursive: true, force: true });
  const root = path.join(base, "home");
  const dataDir = path.join(base, "data");
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  // A real skill in .agents/skills, symlinked from .claude/skills.
  const sharedSkill = mkSkill(
    path.join(root, ".agents/skills/google-flights"),
    "google-flights",
    "Search Google Flights"
  );
  // .claude/skills: one real, one symlink to the shared one above.
  mkSkill(
    path.join(root, ".claude/skills/impeccable"),
    "impeccable",
    "Polish a frontend"
  );
  ensureDir(path.join(root, ".claude/skills"));
  fs.symlinkSync(
    sharedSkill,
    path.join(root, ".claude/skills/google-flights"),
    "dir"
  );
  // A duplicate-content skill present in two agents (same content hash).
  mkSkill(
    path.join(root, ".claude/skills/better-auth"),
    "better-auth-best-practices",
    "Configure Better Auth"
  );
  mkSkill(
    path.join(root, ".codex/skills/better-auth"),
    "better-auth-best-practices",
    "Configure Better Auth"
  );

  // Codex bundled (vendor_imports) — should classify as bundled.
  mkSkill(
    path.join(root, ".codex/vendor_imports/skills/codex-builtin"),
    "codex-builtin",
    "A bundled codex skill"
  );

  // Hermes bundled with a manifest.
  mkSkill(
    path.join(root, ".hermes/hermes-agent/skills/hermes-bundled"),
    "hermes-bundled",
    "A hermes bundled skill"
  );
  ensureDir(path.join(root, ".hermes/skills"));
  fs.writeFileSync(
    path.join(root, ".hermes/hermes-agent/.bundled_manifest"),
    JSON.stringify(["hermes-bundled"])
  );
  // Real-world Hermes layout: the active skill is a REAL copy under
  // .hermes/skills (not under hermes-agent/skills), and the only signal that
  // it's bundled is a co-located `name:hash` manifest beside it. This guards
  // both the co-located lookup and the "name:hash" line parser.
  mkSkill(
    path.join(root, ".hermes/skills/hermes-active-bundled"),
    "hermes-active-bundled",
    "A hermes skill marked bundled via co-located manifest"
  );
  fs.writeFileSync(
    path.join(root, ".hermes/skills/.bundled_manifest"),
    "hermes-active-bundled:30f47a4b29827da14e655356c0edd8a7\n"
  );
  // hermes-bundled lives in the bundled SOURCE dir but is NOT in the manifest
  // (the manifest undercounts in the wild). Its active copy must still classify
  // as bundled — by name-matching the source dir.
  mkSkill(
    path.join(root, ".hermes/skills/hermes-source-only"),
    "hermes-source-only",
    "Active copy of a skill shipped in hermes-agent but absent from manifest"
  );
  mkSkill(
    path.join(root, ".hermes/hermes-agent/skills/hermes-source-only"),
    "hermes-source-only",
    "The bundled source"
  );
  // A genuinely user-authored hermes skill — in no source dir, no manifest →
  // must stay "not imported" (guards against over-classifying by name).
  mkSkill(
    path.join(root, ".hermes/skills/hermes-mine"),
    "hermes-mine",
    "A hermes skill I wrote myself"
  );
  // An empty marker dir (no SKILL.md, no files) must be filtered from the scan.
  ensureDir(path.join(root, ".codex/skills/codex-empty-marker"));

  // Two same-named, different-content copies in different agents → after
  // adopting both, the library holds a dedupe pair (name "dup-demo").
  mkSkill(
    path.join(root, ".claude/skills/dup-demo"),
    "dup-demo",
    "version one"
  );
  mkSkill(
    path.join(root, ".gemini/skills/dup-demo"),
    "dup-demo",
    "version two — different content, more text so the hash differs"
  );

  // Antigravity keeps its user-authored skills under Gemini's config subtree,
  // separate from Gemini CLI's ~/.gemini/skills directory.
  mkSkill(
    path.join(root, ".gemini/config/skills/lecture-notes-generator"),
    "lecture-notes-generator",
    "Generate detailed lecture notes and course cheat sheets"
  );

  // Kimi Code present (copy-mode agent) with no skills yet.
  ensureDir(path.join(root, ".kimi-code/skills"));

  writeMcpConfigs(root);
  return { root, dataDir };
}

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

function mkSkill(dir: string, name: string, description: string): string {
  ensureDir(dir);
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\n${description}\n`
  );
  return dir;
}

function writeMcpConfigs(root: string): void {
  // Claude (JSON)
  ensureDir(path.join(root, ".claude"));
  fs.writeFileSync(
    path.join(root, ".claude.json"),
    JSON.stringify({
      mcpServers: {
        notion: {
          command: "npx",
          args: ["-y", "@notion/mcp"],
          env: { NOTION_TOKEN: "secret_abcdefghijklmnop" },
        },
      },
    })
  );
  // Gemini (JSON)
  ensureDir(path.join(root, ".gemini"));
  fs.writeFileSync(
    path.join(root, ".gemini/settings.json"),
    JSON.stringify({
      mcpServers: { fs: { command: "mcp-fs", args: ["/tmp"], env: {} } },
    })
  );
  // Kimi Code (JSON, ~/.kimi-code/mcp.json)
  fs.writeFileSync(
    path.join(root, ".kimi-code/mcp.json"),
    JSON.stringify({
      mcpServers: { weather: { command: "weather-mcp", args: [], env: {} } },
    })
  );
  // Codex (TOML)
  ensureDir(path.join(root, ".codex"));
  fs.writeFileSync(
    path.join(root, ".codex/config.toml"),
    `[mcp_servers.github]\ncommand = "gh-mcp"\nargs = ["--stdio"]\n\n[mcp_servers.github.env]\nGITHUB_TOKEN = "ghp_supersecrettoken123"\n`
  );
  // Hermes (YAML)
  ensureDir(path.join(root, ".hermes"));
  fs.writeFileSync(
    path.join(root, ".hermes/config.yaml"),
    `mcp_servers:\n  slack:\n    command: slack-mcp\n    args: ["--port", "3000"]\n    env:\n      SLACK_BOT_TOKEN: xoxb-1234567890\n`
  );
  // OpenClaw (non-standard mcporter)
  ensureDir(path.join(root, ".openclaw"));
  fs.writeFileSync(
    path.join(root, ".openclaw/openclaw.json"),
    JSON.stringify({
      mcporter: {
        servers: {
          linear: {
            command: "linear-mcp",
            args: [],
            env: { LINEAR_API_KEY: "lin_api_secretkey" },
          },
        },
      },
    })
  );
}
