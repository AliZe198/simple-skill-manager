import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildFixtureTree } from "./__fixtures__/tree";

let root: string;

beforeEach(() => {
  const t = buildFixtureTree();
  root = t.root;
  process.env.SSM_AGENT_ROOT = t.root;
  process.env.SSM_DATA_DIR = t.dataDir;
});
afterEach(() => {
  delete process.env.SSM_AGENT_ROOT;
  delete process.env.SSM_DATA_DIR;
});

async function lib() {
  return import("./library");
}
function hashOf(name: string, rows: { name: string; contentHash: string }[]) {
  return rows.find((r) => r.name.includes(name))!.contentHash;
}

describe("safety: assertWritable", () => {
  it("refuses writes outside the managed roots", async () => {
    const { assertWritable } = await import("./config");
    expect(() => assertWritable("/etc/passwd")).toThrow(/outside/i);
    expect(() => assertWritable(path.join(root, ".claude/skills/x"))).not.toThrow();
  });
});

describe("safety: createTarget never clobbers an unmanaged skill", () => {
  it("refuses when a real same-named dir already exists for the agent", async () => {
    const { buildOverview, adopt, createTarget } = await lib();
    const rows = buildOverview();
    const hash = hashOf("impeccable", rows);
    adopt(hash); // library copy now named "impeccable"

    // User has their OWN unrelated skill named "impeccable" in Gemini.
    const geminiDir = path.join(root, ".gemini/skills/impeccable");
    fs.mkdirSync(geminiDir, { recursive: true });
    fs.writeFileSync(path.join(geminiDir, "SKILL.md"), "MY OWN PRECIOUS WORK");

    expect(() => createTarget(hash, "gemini")).toThrow(/保护|管理|exist/i);
    // The user's file must be intact.
    expect(fs.readFileSync(path.join(geminiDir, "SKILL.md"), "utf8")).toContain(
      "PRECIOUS"
    );
  });
});

describe("safety: overview reconciles with the filesystem", () => {
  it("drops a target whose link was deleted out-of-band", async () => {
    const { buildOverview, adopt } = await lib();
    const rows = buildOverview();
    const hash = hashOf("better-auth", rows);
    const adopted = adopt(hash);
    expect(adopted.activeAgentIds).toContain("claude-code");

    // Simulate the user deleting the symlink themselves.
    const claudeLink = path.join(
      root,
      ".claude/skills",
      path.basename(adopted.centralPath!)
    );
    fs.unlinkSync(claudeLink); // remove the symlink itself, not its target

    const after = buildOverview().find((r) => r.contentHash === hash)!;
    expect(after.activeAgentIds).not.toContain("claude-code");
    // The library content must NOT have been deleted by removing the link.
    expect(fs.existsSync(adopted.centralPath!)).toBe(true);
  });

  it("marks a skill un-adopted if its library copy vanished", async () => {
    const { buildOverview, adopt } = await lib();
    const rows = buildOverview();
    const hash = hashOf("impeccable", rows);
    const adopted = adopt(hash);
    fs.rmSync(adopted.centralPath!, { recursive: true, force: true });
    const after = buildOverview().find((r) => r.contentHash === hash)!;
    expect(after.adopted).toBe(false);
  });
});

describe("safety: hashDir does not hang on a symlink cycle", () => {
  it("returns instead of infinite-recursing", async () => {
    const { hashDir } = await import("./hash");
    const dir = path.join(root, ".claude/skills/cyclic");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), "x");
    fs.symlinkSync(dir, path.join(dir, "loop"), "dir"); // self-cycle
    expect(() => hashDir(dir)).not.toThrow();
  });
});

describe("safety: MCP disabled detection across conventions", () => {
  it("honors both disabled:true and enabled:false", async () => {
    // claude uses disabled; write enabled:false to confirm it's respected.
    fs.writeFileSync(
      path.join(root, ".claude.json"),
      JSON.stringify({
        mcpServers: {
          a: { command: "x", args: [], env: {}, enabled: false },
          b: { command: "y", args: [], env: {}, disabled: true },
          c: { command: "z", args: [], env: {} },
        },
      })
    );
    const { readAllMcp } = await import("./mcp");
    const claude = readAllMcp().find((e) => e.agentId === "claude-code")!;
    const byName = Object.fromEntries(claude.servers.map((s) => [s.name, s]));
    expect(byName.a.enabled).toBe(false);
    expect(byName.b.enabled).toBe(false);
    expect(byName.c.enabled).toBe(true);
  });
});
