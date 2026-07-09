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

function writeLock(skills: Record<string, unknown>): void {
  fs.mkdirSync(path.join(root, ".agents"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".agents", ".skill-lock.json"),
    JSON.stringify({ version: 3, skills })
  );
}

function mkSkill(rel: string, name: string, description: string): void {
  const dir = path.join(root, rel);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`
  );
}

const LOCK = {
  "google-flights": {
    source: "skillhq/flight-search",
    sourceType: "github",
    sourceUrl: "https://github.com/skillhq/flight-search.git",
  },
  "suite-a": {
    source: "acme/toolkit",
    sourceType: "github",
    sourceUrl: "https://github.com/acme/toolkit.git",
  },
  "suite-b": {
    source: "acme/toolkit",
    sourceType: "github",
    sourceUrl: "https://github.com/acme/toolkit.git",
  },
  "web-access": {
    source: "eze-is/web-access",
    sourceType: "github",
    sourceUrl: "https://github.com/eze-is/web-access.git",
  },
};

describe("skill-lock reading", () => {
  it("parses the lock file into a name → source map", async () => {
    writeLock(LOCK);
    const { readSkillLock } = await import("./sources");
    const lock = readSkillLock();
    expect(lock.get("suite-a")).toEqual({
      source: "acme/toolkit",
      sourceUrl: "https://github.com/acme/toolkit.git",
    });
    expect(lock.size).toBe(4);
  });

  it("returns an empty map when the lock file is absent or garbage", async () => {
    const { readSkillLock } = await import("./sources");
    expect(readSkillLock().size).toBe(0);
    fs.mkdirSync(path.join(root, ".agents"), { recursive: true });
    fs.writeFileSync(path.join(root, ".agents", ".skill-lock.json"), "not json");
    expect(readSkillLock().size).toBe(0);
  });

  it("matches a dir name carrying a dedup hash suffix (web-access-316c91bd)", async () => {
    writeLock(LOCK);
    const { readSkillLock, sourceForNames } = await import("./sources");
    const hit = sourceForNames(readSkillLock(), ["web-access-316c91bd"]);
    expect(hit?.source).toBe("eze-is/web-access");
  });
});

describe("repoSlugFromGitUrl", () => {
  it("parses owner/repo out of the git_url shapes we record", async () => {
    const { repoSlugFromGitUrl } = await import("./sources");
    expect(repoSlugFromGitUrl("https://github.com/obra/superpowers")).toBe("obra/superpowers");
    expect(repoSlugFromGitUrl("https://github.com/acme/toolkit.git")).toBe("acme/toolkit");
    expect(repoSlugFromGitUrl("git@github.com:acme/toolkit.git")).toBe("acme/toolkit");
    expect(repoSlugFromGitUrl(null)).toBeUndefined();
    expect(repoSlugFromGitUrl("https://gitlab.com/a/b")).toBeUndefined();
  });

  it("rows without a lock entry fall back to their recorded git_url", async () => {
    mkSkill(".claude/skills/backfilled", "backfilled", "pre-lock import");
    const { buildOverview, adopt } = await import("./library");
    const { setSkillFields } = await import("./db");
    const row = buildOverview().find((r) => r.name === "backfilled");
    adopt(row!.contentHash);
    // Simulate the git_url backfill (no lock entry for this skill).
    setSkillFields(row!.contentHash, {});
    const { db } = await import("./db");
    db()
      .prepare("UPDATE skills SET git_url = ? WHERE content_hash = ?")
      .run("https://github.com/obra/superpowers", row!.contentHash);
    const after = buildOverview().find((r) => r.name === "backfilled");
    expect(after?.source).toBe("obra/superpowers");
  });
});

describe("source in overview + adopt", () => {
  it("attaches source to discovered rows so the UI can group suites", async () => {
    writeLock(LOCK);
    mkSkill(".claude/skills/suite-a", "suite-a", "part of a suite");
    mkSkill(".claude/skills/suite-b", "suite-b", "part of a suite");
    const { buildOverview } = await import("./library");
    const rows = buildOverview();
    const a = rows.find((r) => r.name === "suite-a");
    const b = rows.find((r) => r.name === "suite-b");
    expect(a?.source).toBe("acme/toolkit");
    expect(b?.source).toBe("acme/toolkit");
    // The fixture's google-flights (in .agents + .claude) gets one too.
    expect(rows.find((r) => r.name === "google-flights")?.source).toBe(
      "skillhq/flight-search"
    );
    // A skill the lock doesn't know stays source-less.
    expect(rows.find((r) => r.name === "impeccable")?.source).toBeUndefined();
  });

  it("adopt records the lock's sourceUrl as git_url (update-eligible)", async () => {
    writeLock(LOCK);
    mkSkill(".claude/skills/suite-a", "suite-a", "part of a suite");
    const { buildOverview, adopt } = await import("./library");
    const row = buildOverview().find((r) => r.name === "suite-a");
    const adopted = adopt(row!.contentHash);
    expect(adopted.gitUrl).toBe("https://github.com/acme/toolkit.git");
  });
});
