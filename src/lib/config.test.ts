import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let base: string;

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), "ssm-config-"));
  process.env.SSM_AGENT_ROOT = path.join(base, "home");
  process.env.SSM_DATA_DIR = path.join(base, "data");
});
afterEach(() => {
  delete process.env.SSM_AGENT_ROOT;
  delete process.env.SSM_DATA_DIR;
  fs.rmSync(base, { recursive: true, force: true });
});

async function cfg() {
  return import("./config");
}

describe("saveConfig coalesces undefined patch fields", () => {
  it("a partial patch does NOT wipe existing overrides / ignoredAgents", async () => {
    const { saveConfig, loadConfig } = await cfg();

    // Seed real per-agent overrides + ignored agents.
    saveConfig({
      overrides: { gemini: { linkMode: "copy" } },
      ignoredAgents: ["kimi"],
    });

    // A patch that touches only theme, leaving the other keys undefined
    // (this is the exact shape the generic POST fall-through produces).
    saveConfig({ theme: "light", overrides: undefined });

    const after = loadConfig();
    expect(after.theme).toBe("light");
    expect(after.overrides).toEqual({ gemini: { linkMode: "copy" } });
    expect(after.ignoredAgents).toEqual(["kimi"]);
  });

  it("persists the surviving values to disk (not just in-memory)", async () => {
    const { saveConfig } = await cfg();
    saveConfig({ overrides: { codex: { linkMode: "copy" } } });
    saveConfig({ theme: "light" });

    const onDisk = JSON.parse(
      fs.readFileSync(path.join(base, "data", "config.json"), "utf8")
    );
    expect(onDisk.overrides).toEqual({ codex: { linkMode: "copy" } });
    expect(onDisk.theme).toBe("light");
  });

  it("an explicit value still overrides the previous one", async () => {
    const { saveConfig, loadConfig } = await cfg();
    saveConfig({ overrides: { gemini: { linkMode: "copy" } } });
    saveConfig({ overrides: { gemini: { linkMode: "symlink" } } });
    expect(loadConfig().overrides).toEqual({ gemini: { linkMode: "symlink" } });
  });
});
