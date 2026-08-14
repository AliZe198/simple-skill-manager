import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildFixtureTree } from "./__fixtures__/tree";

let root: string;
let dataDir: string;

beforeEach(() => {
  const t = buildFixtureTree();
  root = t.root;
  dataDir = t.dataDir;
  process.env.SSM_AGENT_ROOT = root;
  process.env.SSM_DATA_DIR = dataDir;
});

afterEach(() => {
  delete process.env.SSM_AGENT_ROOT;
  delete process.env.SSM_DATA_DIR;
});

describe("agent detection", () => {
  it("detects agents whose skills dir exists", async () => {
    const { detectAgents } = await import("./agents");
    const agents = detectAgents();
    const byId = Object.fromEntries(agents.map((a) => [a.id, a]));
    expect(byId["claude-code"].detected).toBe(true);
    expect(byId["codex"].detected).toBe(true);
    expect(byId["antigravity"].detected).toBe(true);
    expect(byId["antigravity"].resolvedSkillsDirs).toEqual([
      `${root}/.gemini/config/skills`,
    ]);
    expect(byId["hermes"].detected).toBe(true);
    expect(byId["kimi"].detected).toBe(true);
    // Kimi defaults to copy mode.
    expect(byId["kimi"].linkMode).toBe("copy");
  });
});

describe("scan + dedup", () => {
  it("dedupes identical content across agents into one row", async () => {
    const { scanAll, groupByHash } = await import("./scan");
    const grouped = groupByHash(scanAll());
    const betterAuth = grouped.find((g) =>
      g.name.includes("better-auth")
    );
    expect(betterAuth).toBeDefined();
    // Present in both .claude and .codex → 2 occurrences, 1 row.
    expect(betterAuth!.occurrences.length).toBe(2);
  });

  it("detects symlink occurrences", async () => {
    const { scanAll, groupByHash } = await import("./scan");
    const grouped = groupByHash(scanAll());
    const gflights = grouped.find((g) => g.name === "google-flights");
    // .agents real + .claude symlink (resolves to same content) → 1 row.
    expect(gflights).toBeDefined();
    const kinds = gflights!.occurrences.map((o) => o.kind);
    expect(kinds).toContain("real-dir");
    expect(kinds.some((k) => k.startsWith("symlink"))).toBe(true);
  });

  it("scans Antigravity user skills separately from Gemini", async () => {
    const { scanAll, groupByHash } = await import("./scan");
    const grouped = groupByHash(scanAll());
    const lecture = grouped.find((g) => g.name === "lecture-notes-generator");
    expect(lecture).toBeDefined();
    expect(lecture!.occurrences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ agentId: "antigravity", kind: "real-dir" }),
      ])
    );
    expect(lecture!.occurrences.some((o) => o.agentId === "gemini")).toBe(false);
  });

  it("classifies bundled skills", async () => {
    const { scanAll, groupByHash } = await import("./scan");
    const grouped = groupByHash(scanAll());
    const codexBuiltin = grouped.find((g) => g.name === "codex-builtin");
    expect(codexBuiltin!.anyBundled).toBe(true);
    const hermesBundled = grouped.find((g) => g.name === "hermes-bundled");
    expect(hermesBundled!.anyBundled).toBe(true);
    // Real-world Hermes: active copy under .hermes/skills, marked bundled only
    // by a co-located `name:hash` manifest beside it.
    const hermesActive = grouped.find((g) => g.name === "hermes-active-bundled");
    expect(hermesActive).toBeDefined();
    expect(hermesActive!.anyBundled).toBe(true);
    expect(hermesActive!.allBundled).toBe(true);
    // In bundled SOURCE dir but absent from the (stale) manifest → still bundled.
    const sourceOnly = grouped.find((g) => g.name === "hermes-source-only");
    expect(sourceOnly).toBeDefined();
    expect(sourceOnly!.anyBundled).toBe(true);
    // User-authored, in no source dir / manifest → NOT bundled.
    const mine = grouped.find((g) => g.name === "hermes-mine");
    expect(mine).toBeDefined();
    expect(mine!.anyBundled).toBe(false);
  });

  it("filters empty (content-less) marker dirs out of the scan", async () => {
    const { scanAll, groupByHash } = await import("./scan");
    const grouped = groupByHash(scanAll());
    expect(grouped.find((g) => g.name === "codex-empty-marker")).toBeUndefined();
  });
});
