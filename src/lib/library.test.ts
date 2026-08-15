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

function hashOf(name: string, grouped: { name: string; hash: string }[]) {
  const g = grouped.find((x) => x.name === name || x.name.includes(name));
  if (!g) throw new Error(`no grouped skill ${name}`);
  return g.hash;
}

describe("overview", () => {
  it("first run is read-only and shows a deduped list", async () => {
    const { buildOverview } = await lib();
    const before = listLibraryDirs(root);
    const rows = buildOverview();
    expect(rows.length).toBeGreaterThan(0);
    // Nothing adopted yet.
    expect(rows.every((r) => !r.adopted)).toBe(true);
    // No files were moved into the library.
    expect(listLibraryDirs(root)).toEqual(before);
  });
});

describe("收入库 (adopt)", () => {
  it("moves content to library and replaces occurrences with targets", async () => {
    const { buildOverview, adopt } = await lib();
    const grouped = buildOverview().map((r) => ({ name: r.name, hash: r.contentHash }));
    const hash = hashOf("better-auth", grouped);

    const row = adopt(hash);
    expect(row.adopted).toBe(true);
    expect(row.centralPath).toBeTruthy();
    expect(fs.existsSync(row.centralPath!)).toBe(true);

    // The .claude occurrence is now a symlink into the library.
    const claudePath = path.join(root, ".claude/skills", path.basename(row.centralPath!));
    expect(fs.lstatSync(claudePath).isSymbolicLink()).toBe(true);
    expect(fs.realpathSync(claudePath)).toBe(fs.realpathSync(row.centralPath!));

    // Two agents had it → two active targets now.
    expect(row.activeAgentIds.sort()).toEqual(["claude-code", "codex"]);
  });

  it("defaults provenance to downloaded", async () => {
    const { buildOverview, adopt } = await lib();
    const grouped = buildOverview().map((r) => ({ name: r.name, hash: r.contentHash }));
    const row = adopt(hashOf("impeccable", grouped));
    expect(row.provenance).toBe("downloaded");
  });
});

describe("启用 / 停用 (targets)", () => {
  it("enables for a new agent then disables", async () => {
    const { buildOverview, adopt, createTarget, removeTarget } = await lib();
    const grouped = buildOverview().map((r) => ({ name: r.name, hash: r.contentHash }));
    const hash = hashOf("impeccable", grouped);
    adopt(hash);

    const { targetPath } = createTarget(hash, "gemini");
    expect(fs.existsSync(targetPath)).toBe(true);

    removeTarget(hash, "gemini");
    expect(fs.existsSync(targetPath)).toBe(false);
  });

  it("uses copy mode for Kimi (no symlink)", async () => {
    const { buildOverview, adopt, createTarget } = await lib();
    const grouped = buildOverview().map((r) => ({ name: r.name, hash: r.contentHash }));
    const hash = hashOf("impeccable", grouped);
    adopt(hash);
    const { targetPath, mode } = createTarget(hash, "kimi");
    expect(mode).toBe("copy");
    expect(fs.lstatSync(targetPath).isSymbolicLink()).toBe(false);
    expect(fs.statSync(targetPath).isDirectory()).toBe(true);
  });
});

describe("暂存区 (park)", () => {
  it("park removes all targets but keeps it in the library", async () => {
    const { buildOverview, adopt, park } = await lib();
    const grouped = buildOverview().map((r) => ({ name: r.name, hash: r.contentHash }));
    const hash = hashOf("impeccable", grouped);
    adopt(hash);
    const row = park(hash);
    expect(row.parked).toBe(true);
    expect(row.activeAgentIds.length).toBe(0);
    expect(fs.existsSync(row.centralPath!)).toBe(true);
  });
});

describe("复制到我的库 (promote bundled)", () => {
  it("copies a bundled skill without deleting the original", async () => {
    const { buildOverview, promote } = await lib();
    const grouped = buildOverview();
    const bundled = grouped.find((r) => r.name === "codex-builtin")!;
    const originalPath = bundled.occurrences[0].foundPath;
    const row = promote(bundled.contentHash);
    expect(row.adopted).toBe(true);
    expect(row.parked).toBe(true); // no targets yet
    expect(fs.existsSync(originalPath)).toBe(true); // original kept
  });
});

describe("新建技能 (new) + 删除 (delete)", () => {
  it("creates a self-authored skill in the library", async () => {
    const { createSkill } = await lib();
    const row = createSkill({ name: "My Cool Skill", description: "does cool" });
    expect(row.provenance).toBe("self-authored");
    expect(fs.existsSync(path.join(row.centralPath!, "SKILL.md"))).toBe(true);
  });

  it("delete removes targets + library copy", async () => {
    const { buildOverview, adopt, remove } = await lib();
    const grouped = buildOverview().map((r) => ({ name: r.name, hash: r.contentHash }));
    const hash = hashOf("impeccable", grouped);
    const row = adopt(hash);
    const central = row.centralPath!;
    remove(hash);
    expect(fs.existsSync(central)).toBe(false);
    expect(buildOverview().find((r) => r.contentHash === hash)?.adopted ?? false).toBe(false);
  });
});

describe("回收站 (recoverable delete)", () => {
  it("moves files out of agents and restores the previous agent assignments", async () => {
    const {
      buildOverview,
      adopt,
      trashSkill,
      listTrashedSkills,
      restoreTrashedSkill,
    } = await lib();
    const grouped = buildOverview().map((r) => ({ name: r.name, hash: r.contentHash }));
    const row = adopt(hashOf("better-auth", grouped));
    const previousAgents = [...row.activeAgentIds].sort();
    const central = row.centralPath!;

    trashSkill(row.contentHash);
    expect(fs.existsSync(central)).toBe(false);
    expect(listTrashedSkills()).toHaveLength(1);
    expect(
      buildOverview().find((r) => r.contentHash === row.contentHash)?.adopted ?? false
    ).toBe(false);

    const restored = restoreTrashedSkill(row.contentHash);
    expect(restored.failedAgentIds).toEqual([]);
    expect(restored.skill.activeAgentIds.sort()).toEqual(previousAgents);
    expect(fs.existsSync(restored.skill.centralPath!)).toBe(true);
    expect(listTrashedSkills()).toHaveLength(0);
  });

  it("permanently deletes only after the skill is in Trash", async () => {
    const { buildOverview, adopt, trashSkill, listTrashedSkills, purgeTrashedSkill } =
      await lib();
    const grouped = buildOverview().map((r) => ({ name: r.name, hash: r.contentHash }));
    const row = adopt(hashOf("impeccable", grouped));
    trashSkill(row.contentHash);
    const trashRoot = path.join(process.env.SSM_DATA_DIR!, "trash");
    expect(fs.readdirSync(trashRoot).length).toBe(1);

    purgeTrashedSkill(row.contentHash);
    expect(listTrashedSkills()).toHaveLength(0);
    expect(fs.readdirSync(trashRoot)).toEqual([]);
  });
});

describe("setAgentLinkMode re-materializes existing targets", () => {
  it("switching symlink→copy rewrites the live target", async () => {
    const { buildOverview, adopt, createTarget, setAgentLinkMode } = await lib();
    const grouped = buildOverview().map((r) => ({ name: r.name, hash: r.contentHash }));
    const hash = hashOf("impeccable", grouped);
    adopt(hash);
    const { targetPath } = createTarget(hash, "gemini"); // symlink by default
    expect(fs.lstatSync(targetPath).isSymbolicLink()).toBe(true);

    setAgentLinkMode("gemini", "copy");
    // Same path, but now a real copied dir, not a symlink.
    expect(fs.lstatSync(targetPath).isSymbolicLink()).toBe(false);
    expect(fs.statSync(targetPath).isDirectory()).toBe(true);
  });
});

describe("导入 (importSkill picks adopt vs promote)", () => {
  it("adopts a discovered (non-bundled) skill", async () => {
    const { buildOverview, importSkill } = await lib();
    const grouped = buildOverview().map((r) => ({ name: r.name, hash: r.contentHash }));
    const row = importSkill(hashOf("impeccable", grouped));
    expect(row.adopted).toBe(true);
    expect(row.activeAgentIds.length).toBeGreaterThan(0); // moved + targets
  });

  it("promotes a bundled skill (keeps original)", async () => {
    const { buildOverview, importSkill } = await lib();
    const bundled = buildOverview().find((r) => r.name === "codex-builtin")!;
    const originalPath = bundled.occurrences[0].foundPath;
    const row = importSkill(bundled.contentHash);
    expect(row.adopted).toBe(true);
    expect(row.parked).toBe(true); // promoted → idle (no targets)
    expect(fs.existsSync(originalPath)).toBe(true); // original kept
  });
});

describe("移出我的库 (removeFromLibrary keeps files, reversible)", () => {
  it("leaves a real copy in agents and drops the library copy", async () => {
    const { buildOverview, importSkill, removeFromLibrary } = await lib();
    const grouped = buildOverview().map((r) => ({ name: r.name, hash: r.contentHash }));
    const hash = hashOf("impeccable", grouped);
    const row = importSkill(hash);
    const central = row.centralPath!;
    const claudePath = path.join(root, ".claude/skills", path.basename(central));
    expect(fs.lstatSync(claudePath).isSymbolicLink()).toBe(true);

    removeFromLibrary(hash);
    // library copy gone, DB record gone
    expect(fs.existsSync(central)).toBe(false);
    // but the skill survives in the agent as a REAL dir (not a symlink)
    expect(fs.lstatSync(claudePath).isSymbolicLink()).toBe(false);
    expect(fs.statSync(claudePath).isDirectory()).toBe(true);
    expect(fs.existsSync(path.join(claudePath, "SKILL.md"))).toBe(true);
  });
});

describe("tags + detail", () => {
  it("setTags persists and dedupes; getSkillDetail returns readme + files", async () => {
    const { buildOverview, importSkill, setTags, getSkillDetail } = await lib();
    const grouped = buildOverview().map((r) => ({ name: r.name, hash: r.contentHash }));
    const hash = hashOf("impeccable", grouped);
    importSkill(hash);

    const row = setTags(hash, ["前端", "前端", " UI ", ""]);
    expect(row.tags.sort()).toEqual(["UI", "前端"]);

    const detail = getSkillDetail(hash);
    expect(detail.tags.sort()).toEqual(["UI", "前端"]);
    expect(detail.readme).toContain("impeccable");
    expect(detail.readmeFile).toBe("SKILL.md");
    expect(detail.files.length).toBeGreaterThan(0);
  });
});

describe("idempotent rescan", () => {
  it("rescanning does not duplicate rows", async () => {
    const { buildOverview } = await lib();
    const a = buildOverview().length;
    const b = buildOverview().length;
    expect(a).toBe(b);
  });
});

describe("rekeySkill (update re-key)", () => {
  it("moves the skill row + its targets to the new content hash", async () => {
    const { buildOverview, adopt } = await lib();
    const db = await import("./db");
    const grouped = buildOverview().map((r) => ({ name: r.name, hash: r.contentHash }));
    const oldHash = hashOf("impeccable", grouped);
    const row = adopt(oldHash);
    expect(row.activeAgentIds.length).toBeGreaterThan(0);
    const newHash = "f".repeat(64);

    db.rekeySkill(oldHash, newHash);

    expect(db.getSkill(oldHash)).toBeUndefined();
    const moved = db.getSkill(newHash);
    expect(moved?.central_path).toBe(row.centralPath);
    expect(db.targetsFor(oldHash).length).toBe(0);
    expect(db.targetsFor(newHash).length).toBe(row.activeAgentIds.length);
  });
});

describe("去重 (mergeDuplicates)", () => {
  it("groups same-named copies and merges, re-pointing dropped agents", async () => {
    const { buildOverview, adopt, duplicateGroups, mergeDuplicates } = await lib();
    // Two same-named, different-content copies (one in .claude, one in .gemini).
    const dups = buildOverview().filter((r) => r.name === "dup-demo");
    expect(dups.length).toBe(2);
    adopt(dups[0].contentHash);
    adopt(dups[1].contentHash);

    const group = duplicateGroups().find((g) => g.name === "dup-demo");
    expect(group?.copies.length).toBe(2);

    const keep = group!.copies[0].hash;
    const drop = group!.copies.find((c) => c.hash !== keep)!.hash;
    const dropAgents = group!.copies.find((c) => c.hash === drop)!.agentIds;

    mergeDuplicates(keep, [drop]);

    // No more duplicate group, dropped skill gone, kept skill now serves both.
    expect(duplicateGroups().find((g) => g.name === "dup-demo")).toBeUndefined();
    const rows = buildOverview();
    expect(rows.find((r) => r.contentHash === drop)).toBeFalsy();
    const kept = rows.find((r) => r.contentHash === keep)!;
    expect(path.basename(kept.centralPath!)).toBe("dup-demo");
    for (const a of dropAgents) expect(kept.activeAgentIds).toContain(a);
  });
});

describe("重命名 (renameSkill)", () => {
  it("renames skill + folder + SKILL.md, re-keys, and re-points agents", async () => {
    const { buildOverview, adopt, renameSkill } = await lib();
    const grouped = buildOverview().map((r) => ({ name: r.name, hash: r.contentHash }));
    const row = adopt(hashOf("better-auth", grouped));
    const oldDir = row.centralPath!;
    const oldBase = path.basename(oldDir);
    expect(row.activeAgentIds.length).toBeGreaterThan(0);

    const renamed = renameSkill(row.contentHash, "My Renamed Skill");

    expect(renamed.name).toBe("My Renamed Skill");
    expect(renamed.contentHash).not.toBe(row.contentHash); // content changed → re-keyed
    expect(fs.existsSync(oldDir)).toBe(false); // old folder moved away
    expect(path.basename(renamed.centralPath!)).toBe("my-renamed-skill"); // clean slug
    const md = fs.readFileSync(path.join(renamed.centralPath!, "SKILL.md"), "utf8");
    expect(md).toMatch(/name:\s*"?My Renamed Skill"?/);

    // Every agent that used it is re-pointed at the new folder and resolves;
    // the old link is gone (no dangling symlink at the old name).
    const newBase = path.basename(renamed.centralPath!);
    const claudeDir = path.join(root, ".claude/skills");
    expect(fs.realpathSync(path.join(claudeDir, newBase))).toBe(
      fs.realpathSync(renamed.centralPath!)
    );
    expect(fs.existsSync(path.join(claudeDir, oldBase))).toBe(false);
  });
});

describe("标签全局管理 (tagUsage / renameTag / deleteTag)", () => {
  it("counts, renames, and deletes tags across all skills", async () => {
    const { buildOverview, adopt, setTags, tagUsage, renameTag, deleteTag } =
      await lib();
    const grouped = buildOverview().map((r) => ({ name: r.name, hash: r.contentHash }));
    const h1 = adopt(hashOf("better-auth", grouped)).contentHash;
    const h2 = adopt(hashOf("impeccable", grouped)).contentHash;
    setTags(h1, ["前端", "UI"]);
    setTags(h2, ["前端"]);

    expect(tagUsage().find((u) => u.tag === "前端")?.count).toBe(2);
    expect(tagUsage().find((u) => u.tag === "UI")?.count).toBe(1);

    expect(renameTag("前端", "frontend").affected).toBe(2);
    expect(tagUsage().find((u) => u.tag === "前端")).toBeUndefined();
    expect(tagUsage().find((u) => u.tag === "frontend")?.count).toBe(2);

    expect(deleteTag("frontend").affected).toBe(2);
    expect(tagUsage().find((u) => u.tag === "frontend")).toBeUndefined();
    expect(tagUsage().find((u) => u.tag === "UI")?.count).toBe(1); // untouched
  });

  it("方案A: create empty tags, list their skills, merge, and batch-delete", async () => {
    const { buildOverview, adopt, setTags, tagUsage, createTag, deleteTags } =
      await lib();
    const grouped = buildOverview().map((r) => ({ name: r.name, hash: r.contentHash }));
    const a = adopt(hashOf("better-auth", grouped));
    const b = adopt(hashOf("impeccable", grouped));
    setTags(a.contentHash, ["x"]);
    setTags(b.contentHash, ["y"]);

    // createTag registers an empty tag (count 0); usage carries skill names.
    expect(createTag("draft").created).toBe(true);
    expect(createTag("draft").created).toBe(false); // idempotent
    const usage = tagUsage();
    expect(usage.find((u) => u.tag === "draft")?.count).toBe(0);
    expect(usage.find((u) => u.tag === "x")?.skills).toEqual([a.name]);

    // merge x → y (renameTag under the hood): x gone, y now on both.
    const { renameTag } = await lib();
    expect(renameTag("x", "y").affected).toBe(1);
    expect(tagUsage().find((u) => u.tag === "x")).toBeUndefined();
    expect(tagUsage().find((u) => u.tag === "y")?.count).toBe(2);

    // batch delete clears several at once (incl. the empty registry tag).
    expect(deleteTags(["y", "draft"]).affected).toBe(2);
    expect(tagUsage().find((u) => u.tag === "y")).toBeUndefined();
    expect(tagUsage().find((u) => u.tag === "draft")).toBeUndefined();
  });

  it("自定义顺序: persists order, collapses merge dups, prunes on delete", async () => {
    const { createTag, setTagOrder, renameTag, deleteTag } = await lib();
    const { loadConfig } = await import("./config");

    ["a", "b", "c", "d"].forEach((t) => createTag(t));
    setTagOrder(["a", "b", "c", "d"]);
    expect(loadConfig().tagOrder).toEqual(["a", "b", "c", "d"]);

    // Trim + dedupe on save.
    setTagOrder([" a ", "a", "b", "", "c", "d"]);
    expect(loadConfig().tagOrder).toEqual(["a", "b", "c", "d"]);

    // Merge a → c (c already ordered): a drops, c keeps its slot, no duplicate.
    renameTag("a", "c");
    expect(loadConfig().tagOrder).toEqual(["b", "c", "d"]);

    // Plain rename keeps the position.
    renameTag("b", "b2");
    expect(loadConfig().tagOrder).toEqual(["b2", "c", "d"]);

    // Delete prunes the renamed tag from the order.
    deleteTag("c");
    expect(loadConfig().tagOrder).toEqual(["b2", "d"]);
  });
});

describe("忽略 Agent (ignoreAgent / unignoreAgent)", () => {
  it("hides an agent, cleans its targets, and restores", async () => {
    const { buildOverview, adopt, ignoreAgent, unignoreAgent, detectAgents } =
      await lib();
    const grouped = buildOverview().map((r) => ({ name: r.name, hash: r.contentHash }));
    const row = adopt(hashOf("better-auth", grouped));
    const agentId = row.activeAgentIds[0];
    expect(agentId).toBeTruthy();

    // Ignore + cleanup → agent marked ignored, its target removed.
    ignoreAgent(agentId, { cleanup: true });
    expect(detectAgents().find((a) => a.id === agentId)?.ignored).toBe(true);
    const after = buildOverview().find((r) => r.contentHash === row.contentHash);
    expect(after?.activeAgentIds).not.toContain(agentId);

    // Restore → no longer ignored.
    unignoreAgent(agentId);
    expect(detectAgents().find((a) => a.id === agentId)?.ignored).toBe(false);
  });
});

describe("stale record pointing at a live library dir (in-place edit)", () => {
  it("is not offered as a duplicate, and dropping it keeps the real files", async () => {
    const { buildOverview, adopt, duplicateGroups, remove } = await lib();
    const { upsertSkill } = await import("./db");

    const grouped = buildOverview().map((r) => ({ name: r.name, hash: r.contentHash }));
    const hash = hashOf("better-auth", grouped);
    const row = adopt(hash);
    const dir = row.centralPath!;
    expect(fs.existsSync(dir)).toBe(true);

    // Editing a skill in place leaves exactly this behind: a row for the OLD
    // content hash still pointing at the same library dir.
    const staleHash = "0".repeat(64);
    upsertSkill({
      contentHash: staleHash,
      name: row.name,
      description: row.description,
      centralPath: dir,
    });

    // Not a real duplicate — there is only one copy on disk. Offering a merge
    // here would let the user delete the single real copy.
    expect(duplicateGroups().some((g) => g.name === row.name)).toBe(false);

    // Dropping the stale row must not take the surviving skill's files.
    remove(staleHash);
    expect(fs.existsSync(dir)).toBe(true);
    expect(buildOverview().find((r) => r.contentHash === hash)?.adopted).toBe(true);
  });
});

function listLibraryDirs(_root: string): string[] {
  const libDir = path.join(process.env.SSM_DATA_DIR!, "library");
  try {
    return fs.readdirSync(libDir).sort();
  } catch {
    return [];
  }
}
