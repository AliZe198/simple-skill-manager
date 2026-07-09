import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildFixtureTree } from "./__fixtures__/tree";

beforeEach(() => {
  const t = buildFixtureTree();
  process.env.SSM_AGENT_ROOT = t.root;
  process.env.SSM_DATA_DIR = t.dataDir;
});
afterEach(() => {
  delete process.env.SSM_AGENT_ROOT;
  delete process.env.SSM_DATA_DIR;
});

describe("MCP multi-format parsing", () => {
  it("parses all six config shapes", async () => {
    const { readAllMcp } = await import("./mcp");
    const all = readAllMcp();
    const byId = Object.fromEntries(all.map((a) => [a.agentId, a]));

    expect(byId["claude-code"].servers[0].name).toBe("notion");
    expect(byId["claude-code"].servers[0].command).toBe("npx");

    expect(byId["codex"].servers[0].name).toBe("github");
    expect(byId["codex"].servers[0].env.GITHUB_TOKEN).toContain("ghp_");

    expect(byId["hermes"].servers[0].name).toBe("slack");
    expect(byId["hermes"].servers[0].args).toEqual(["--port", "3000"]);

    expect(byId["openclaw"].servers[0].name).toBe("linear");
    expect(byId["gemini"].servers[0].name).toBe("fs");
    expect(byId["kimi"].servers[0].name).toBe("weather");
  });

  it("masks secret env values", async () => {
    const { maskValue, maskServer } = await import("./mcp");
    expect(maskValue("secret_abcdefghijklmnop")).not.toContain("abcdefgh");
    expect(maskValue("secret_abcdefghijklmnop")).toMatch(/••••/);
    const masked = maskServer({
      name: "x",
      args: [],
      env: { K: "ghp_supersecrettoken123" },
      agentId: "a",
      configPath: "p",
      enabled: true,
    });
    expect(masked.env.K).not.toContain("supersecret");
  });
});
