// Build a persistent sandbox agent tree for local dev so the running app
// NEVER touches the real ~/.claude etc. Point the dev server at it via:
//   SSM_AGENT_ROOT=.ssm-sandbox/home SSM_DATA_DIR=.ssm-sandbox/data
import fs from "node:fs";
import path from "node:path";

// Optional argument overrides where the sandbox tree is built (used by bin/cli.mjs).
const base = path.resolve(process.argv[2] || ".ssm-sandbox");
fs.rmSync(base, { recursive: true, force: true });
const root = path.join(base, "home");
const dataDir = path.join(base, "data");
fs.mkdirSync(root, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

const dir = (p) => fs.mkdirSync(p, { recursive: true });
const skill = (p, name, desc) => {
  dir(p);
  fs.writeFileSync(
    path.join(p, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${desc}\n---\n\n# ${name}\n\n${desc}\n`
  );
  return p;
};

// Shared skill in .agents, symlinked from .claude
const shared = skill(
  path.join(root, ".agents/skills/google-flights"),
  "google-flights",
  "Search Google Flights for prices and schedules"
);
dir(path.join(root, ".claude/skills"));
fs.symlinkSync(shared, path.join(root, ".claude/skills/google-flights"), "dir");

skill(path.join(root, ".claude/skills/impeccable"), "impeccable", "Make a frontend interface impeccable");
skill(path.join(root, ".claude/skills/frontend-design"), "frontend-design", "Create distinctive production-grade UIs");
// duplicate content across two agents
skill(path.join(root, ".claude/skills/better-auth"), "better-auth-best-practices", "Configure Better Auth in TypeScript");
skill(path.join(root, ".codex/skills/better-auth"), "better-auth-best-practices", "Configure Better Auth in TypeScript");
skill(path.join(root, ".gemini/skills/deep-research"), "deep-research", "Fan-out web research with citations");
skill(path.join(root, ".openclaw/skills/xlsx"), "xlsx", "Create and edit spreadsheets");

// A suite: several skills installed together from one repo (`npx skills add`),
// recorded in .agents/.skill-lock.json → Discover groups them into one 套件.
const suite = {
  hyperframes: "Entry skill: route any video request",
  "hyperframes-core": "The HyperFrames composition contract",
  "hyperframes-media": "TTS, BGM, SFX and captions",
  "motion-graphics": "Short design-led motion graphics",
  "website-to-video": "Capture a website into a video",
};
for (const [n, desc] of Object.entries(suite)) {
  skill(path.join(root, `.claude/skills/${n}`), n, desc);
  skill(path.join(root, `.codex/skills/${n}`), n, desc);
}
fs.writeFileSync(
  path.join(root, ".agents/.skill-lock.json"),
  JSON.stringify({
    version: 3,
    skills: Object.fromEntries(
      [...Object.keys(suite), "google-flights"].map((n) => [
        n,
        n === "google-flights"
          ? { source: "skillhq/flight-search", sourceType: "github", sourceUrl: "https://github.com/skillhq/flight-search.git" }
          : { source: "heygen-com/hyperframes", sourceType: "github", sourceUrl: "https://github.com/heygen-com/hyperframes.git" },
      ])
    ),
  }, null, 2)
);

// bundled
skill(path.join(root, ".codex/vendor_imports/skills/codex-builtin"), "codex-builtin", "A bundled Codex skill");
for (const n of ["pptx", "pdf", "docx"])
  skill(path.join(root, `.hermes/hermes-agent/skills/${n}`), n, `Hermes bundled: ${n}`);
dir(path.join(root, ".hermes/skills"));
fs.writeFileSync(
  path.join(root, ".hermes/hermes-agent/.bundled_manifest"),
  JSON.stringify(["pptx", "pdf", "docx"])
);
// Real-world Hermes layout: active skills live as real copies under
// .hermes/skills, with a co-located `name:hash` manifest marking which are
// bundled. This is what was previously misclassified as "not imported".
const hermesActive = {
  airtable: "30f47a4b29827da14e655356c0edd8a7",
  arxiv: "06b6666b948852e77545c99ef72139db",
  "ascii-art": "3aea656d9b8fb9d054ce37565e704a04",
  "baoyu-comic": "8ff68387b01dea27ce049837ae9ecc47",
  comfyui: "7efa41ae19823ed75a05ce96d9c44e07",
};
for (const n of Object.keys(hermesActive))
  skill(path.join(root, `.hermes/skills/${n}`), n, `Hermes built-in: ${n}`);
// A genuinely user-authored skill in the same dir, NOT in the manifest →
// must stay in "not imported", proving we don't over-classify.
skill(path.join(root, ".hermes/skills/my-custom-thing"), "my-custom-thing", "A skill I wrote myself");
fs.writeFileSync(
  path.join(root, ".hermes/skills/.bundled_manifest"),
  Object.entries(hermesActive).map(([n, h]) => `${n}:${h}`).join("\n") + "\n"
);
dir(path.join(root, ".kimi/skills"));

// MCP configs (all formats)
fs.writeFileSync(
  path.join(root, ".claude.json"),
  JSON.stringify({ mcpServers: { notion: { command: "npx", args: ["-y", "@notion/mcp"], env: { NOTION_TOKEN: "secret_abcdefghijklmnop" } }, "chrome-devtools": { command: "chrome-devtools-mcp", args: [], env: {} } } }, null, 2)
);
dir(path.join(root, ".gemini"));
fs.writeFileSync(path.join(root, ".gemini/settings.json"), JSON.stringify({ mcpServers: { filesystem: { command: "mcp-fs", args: ["/tmp"], env: {} } } }, null, 2));
fs.writeFileSync(path.join(root, ".kimi/mcp.json"), JSON.stringify({ mcpServers: { weather: { command: "weather-mcp", args: [], env: { OPENWEATHER_KEY: "owm_secret_key_123" } } } }, null, 2));
dir(path.join(root, ".codex"));
fs.writeFileSync(path.join(root, ".codex/config.toml"), `[mcp_servers.github]\ncommand = "gh-mcp"\nargs = ["--stdio"]\n\n[mcp_servers.github.env]\nGITHUB_TOKEN = "ghp_supersecrettoken123"\n`);
dir(path.join(root, ".hermes"));
fs.writeFileSync(path.join(root, ".hermes/config.yaml"), `mcp_servers:\n  slack:\n    command: slack-mcp\n    args: ["--port", "3000"]\n    env:\n      SLACK_BOT_TOKEN: xoxb-1234567890abcdef\n`);
dir(path.join(root, ".openclaw"));
fs.writeFileSync(path.join(root, ".openclaw/openclaw.json"), JSON.stringify({ mcporter: { servers: { linear: { command: "linear-mcp", args: [], env: { LINEAR_API_KEY: "lin_api_secretkey" } } } } }, null, 2));

console.log("Sandbox built at", base);
console.log("  SSM_AGENT_ROOT=" + root);
console.log("  SSM_DATA_DIR=" + dataDir);
