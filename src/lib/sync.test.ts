import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { buildFixtureTree } from "./__fixtures__/tree";

function raw(cwd: string, args: string[]) {
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], {
    cwd,
    stdio: "pipe",
  });
}

afterEach(() => {
  delete process.env.SSM_AGENT_ROOT;
  delete process.env.SSM_DATA_DIR;
});

function initBare(): string {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "ssm-bare-"));
  const bare = path.join(base, "r.git");
  execFileSync("git", ["init", "--bare", "-b", "main", bare], { stdio: "pipe" });
  return bare;
}

/** Seed a bare remote by importing a skill on a throwaway "machine" and pushing. */
async function seedRemote(bare: string, skillName: string) {
  const A = buildFixtureTree();
  process.env.SSM_AGENT_ROOT = A.root;
  process.env.SSM_DATA_DIR = A.dataDir;
  const { importSkill, buildOverview } = await import("./library");
  importSkill(buildOverview().find((r) => r.name === skillName)!.contentHash);
  const libA = path.join(A.dataDir, "library");
  raw(libA, ["init", "-b", "main"]);
  raw(libA, ["remote", "add", "origin", bare]);
  const { backup } = await import("./sync");
  await backup();
}

describe("parseRepo", () => {
  it("parses owner/repo, https, and ssh forms", async () => {
    const { parseRepo } = await import("./sync");
    expect(parseRepo("octo/skills")?.repoFull).toBe("octo/skills");
    expect(parseRepo("https://github.com/octo/skills.git")?.repoFull).toBe("octo/skills");
    expect(parseRepo("git@github.com:octo/skills.git")?.repoFull).toBe("octo/skills");
    expect(parseRepo("not a repo at all")).toBeNull();
  });
});

describe("connectToRemote (existing-repo flows)", () => {
  it("clone: local empty + remote has commits", async () => {
    const bare = initBare();
    await seedRemote(bare, "impeccable");

    const Bbase = fs.mkdtempSync(path.join(os.tmpdir(), "ssm-clone-"));
    process.env.SSM_AGENT_ROOT = path.join(Bbase, "home");
    process.env.SSM_DATA_DIR = path.join(Bbase, "data");
    fs.mkdirSync(process.env.SSM_AGENT_ROOT, { recursive: true });

    const { connectToRemote } = await import("./sync");
    const { hashDir } = await import("./hash");
    const res = await connectToRemote(bare, {
      localHasContent: false,
      remoteHasCommits: true,
      defaultBranch: "main",
    });
    const libB = path.join(process.env.SSM_DATA_DIR, "library");
    expect(res.flow).toBe("cloned");
    expect(fs.existsSync(path.join(libB, "impeccable"))).toBe(true);
    expect(hashDir(path.join(libB, "impeccable"))).toBeTruthy();
    expect(res.imported).toBeGreaterThan(0);
  });

  it("pushToEmpty: local has content + remote empty", async () => {
    const bare = initBare();
    // remove the initial branch so it's truly empty (no commits)
    const A = buildFixtureTree();
    process.env.SSM_AGENT_ROOT = A.root;
    process.env.SSM_DATA_DIR = A.dataDir;
    const { importSkill, buildOverview } = await import("./library");
    importSkill(buildOverview().find((r) => r.name === "impeccable")!.contentHash);

    const { connectToRemote } = await import("./sync");
    const res = await connectToRemote(bare, {
      localHasContent: true,
      remoteHasCommits: false,
      defaultBranch: "main",
    });
    expect(res.flow).toBe("pushToEmpty");
    const refs = execFileSync("git", ["ls-remote", bare], { encoding: "utf8" });
    expect(refs).toContain("refs/heads/main");
  });

  it("merge: both have skills, manifest auto-unions, both survive", async () => {
    const bare = initBare();
    await seedRemote(bare, "impeccable"); // remote has impeccable

    const B = buildFixtureTree();
    process.env.SSM_AGENT_ROOT = B.root;
    process.env.SSM_DATA_DIR = B.dataDir;
    const { importSkill, buildOverview } = await import("./library");
    const ov = buildOverview();
    importSkill(ov.find((r) => r.name === "impeccable")!.contentHash); // same as remote
    importSkill(ov.find((r) => r.name === "google-flights")!.contentHash); // local-only

    const { connectToRemote } = await import("./sync");
    const res = await connectToRemote(bare, {
      localHasContent: true,
      remoteHasCommits: true,
      defaultBranch: "main",
    });
    const libB = path.join(B.dataDir, "library");
    expect(res.flow).toBe("merge");
    expect(fs.existsSync(path.join(libB, "impeccable"))).toBe(true);
    expect(fs.existsSync(path.join(libB, "google-flights"))).toBe(true);
    // manifest union has both; no conflict markers left
    const man = fs.readFileSync(path.join(libB, "manifest.json"), "utf8");
    expect(man).not.toContain("<<<<<<<");
    expect(man).toContain("impeccable");
    expect(man).toContain("google-flights");
  });

  it("conflict-abort: divergent same-path file → abort, local intact, origin removed", async () => {
    const bare = initBare();
    // Seed remote with a skill dir 'shared' containing AAA via a throwaway repo.
    const seedDir = fs.mkdtempSync(path.join(os.tmpdir(), "ssm-seed-"));
    fs.mkdirSync(path.join(seedDir, "shared"), { recursive: true });
    fs.writeFileSync(path.join(seedDir, "shared", "SKILL.md"), "AAA");
    fs.writeFileSync(path.join(seedDir, "manifest.json"), '{"version":1,"skills":[]}');
    raw(seedDir, ["init", "-b", "main"]);
    raw(seedDir, ["add", "-A"]);
    raw(seedDir, ["commit", "-m", "seed"]);
    raw(seedDir, ["remote", "add", "origin", bare]);
    raw(seedDir, ["push", "-u", "origin", "main"]);

    // Local machine B: same 'shared' path with DIFFERENT content.
    const B = buildFixtureTree();
    process.env.SSM_AGENT_ROOT = B.root;
    process.env.SSM_DATA_DIR = B.dataDir;
    const libB = path.join(B.dataDir, "library");
    fs.mkdirSync(path.join(libB, "shared"), { recursive: true });
    fs.writeFileSync(path.join(libB, "shared", "SKILL.md"), "BBB");

    const { connectToRemote } = await import("./sync");
    await expect(
      connectToRemote(bare, {
        localHasContent: true,
        remoteHasCommits: true,
        defaultBranch: "main",
      })
    ).rejects.toThrow(/冲突|conflict/i);
    // local file intact
    expect(fs.readFileSync(path.join(libB, "shared", "SKILL.md"), "utf8")).toBe("BBB");
    // origin removed → retryable
    const remotes = execFileSync("git", ["remote"], { cwd: libB, encoding: "utf8" });
    expect(remotes).not.toContain("origin");
  });
});

describe("GitHub sync (local bare remote, two-machine sim)", () => {
  it("pushes from A, clones to B, hashes match, ssm.db never syncs", async () => {
    const bareBase = fs.mkdtempSync(path.join(os.tmpdir(), "ssm-remote-"));
    const bare = path.join(bareBase, "remote.git");
    execFileSync("git", ["init", "--bare", bare], { stdio: "pipe" });

    // --- Machine A: import a skill, init repo, add bare remote, backup() ---
    const A = buildFixtureTree();
    process.env.SSM_AGENT_ROOT = A.root;
    process.env.SSM_DATA_DIR = A.dataDir;
    const { importSkill } = await import("./library");
    const { hashDir } = await import("./hash");
    const overview = (await import("./library")).buildOverview();
    const imp = overview.find((r) => r.name === "impeccable")!;
    importSkill(imp.contentHash);

    const libA = path.join(A.dataDir, "library");
    raw(libA, ["init", "-b", "main"]);
    raw(libA, ["remote", "add", "origin", bare]);

    const { backup } = await import("./sync");
    await backup();

    const hashA = hashDir(path.join(libA, "impeccable"));
    expect(fs.existsSync(path.join(libA, "manifest.json"))).toBe(true);

    // --- Machine B: fresh dirs, clone the bare, import manifest ---
    const Bbase = fs.mkdtempSync(path.join(os.tmpdir(), "ssm-B-"));
    const Broot = path.join(Bbase, "home");
    const Bdata = path.join(Bbase, "data");
    fs.mkdirSync(Broot, { recursive: true });
    fs.mkdirSync(Bdata, { recursive: true });
    const libB = path.join(Bdata, "library");
    execFileSync("git", ["clone", bare, libB], { stdio: "pipe" });

    process.env.SSM_AGENT_ROOT = Broot;
    process.env.SSM_DATA_DIR = Bdata;
    const { importManifest } = await import("./sync");
    const res = importManifest();

    // keystone 1: content hash identical across "machines"
    expect(fs.existsSync(path.join(libB, "impeccable"))).toBe(true);
    expect(hashDir(path.join(libB, "impeccable"))).toBe(hashA);
    expect(res.mismatches).toEqual([]); // canary: no eol/corruption drift

    // keystone 2: ssm.db (targets) never entered the repo
    expect(fs.existsSync(path.join(libB, "ssm.db"))).toBe(false);

    // metadata imported → skill shows up adopted on machine B
    const bOverview = (await import("./library")).buildOverview();
    const row = bOverview.find((r) => r.name === "impeccable");
    expect(row?.adopted).toBe(true);
    // ...but with NO targets here (agent assignments are per-machine)
    expect(row?.activeAgentIds.length).toBe(0);
  });

  it(".gitignore blocks secrets/db inside the library", async () => {
    const A = buildFixtureTree();
    process.env.SSM_AGENT_ROOT = A.root;
    process.env.SSM_DATA_DIR = A.dataDir;
    const { importSkill, buildOverview } = await import("./library");
    importSkill(buildOverview().find((r) => r.name === "impeccable")!.contentHash);

    const libA = path.join(A.dataDir, "library");
    raw(libA, ["init", "-b", "main"]);
    const bareBase = fs.mkdtempSync(path.join(os.tmpdir(), "ssm-remote2-"));
    const bare = path.join(bareBase, "r.git");
    execFileSync("git", ["init", "--bare", bare], { stdio: "pipe" });
    raw(libA, ["remote", "add", "origin", bare]);
    // plant a secret + db in the library
    fs.writeFileSync(path.join(libA, ".env"), "SECRET=xyz");
    fs.writeFileSync(path.join(libA, "ssm.db"), "fake");

    const { backup } = await import("./sync");
    await backup();

    const tracked = execFileSync("git", ["ls-files"], {
      cwd: libA,
      encoding: "utf8",
    });
    expect(tracked).not.toContain(".env");
    expect(tracked).not.toContain("ssm.db");
    expect(tracked).toContain("manifest.json");
  });
});

describe("restoreFromCloud (rollback to cloud — Bug B)", () => {
  it("undoes a local clobber that pull() cannot, and keeps an undo ref", async () => {
    const bare = initBare();
    await seedRemote(bare, "impeccable"); // env now points at machine A; lib pushed
    const libA = path.join(process.env.SSM_DATA_DIR!, "library");
    const skillMd = path.join(libA, "impeccable", "SKILL.md");
    const original = fs.readFileSync(skillMd, "utf8");

    // Reproduce the failure: a bad update clobbers the file, and the auto-commit
    // pull() makes ("Local changes before sync") leaves local sitting AHEAD of
    // origin with the clobbered content committed.
    fs.writeFileSync(skillMd, "CLOBBERED BY A BUGGY UPDATE");
    raw(libA, ["add", "-A"]);
    raw(libA, ["commit", "-m", "Local changes before sync"]);

    const { pull, restoreFromCloud } = await import("./sync");

    // pull() can't help: local is ahead, so the merge is a no-op and the
    // clobbered content survives. THIS is the bug.
    await pull();
    expect(fs.readFileSync(skillMd, "utf8")).toBe("CLOBBERED BY A BUGGY UPDATE");

    // restoreFromCloud() hard-resets onto origin → the cloud content is back.
    const res = await restoreFromCloud();
    expect(res.restoredTo).toBe("origin/main");
    expect(fs.readFileSync(skillMd, "utf8")).toBe(original);

    // ...and the discarded local state is itself recoverable via the undo ref.
    const undo = execFileSync("git", ["rev-parse", "refs/ssm/pre-restore"], {
      cwd: libA,
      encoding: "utf8",
    }).trim();
    expect(undo).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe("reconcile after sync (cloud-side deletions)", () => {
  it("pull removes skills deleted on the other machine — no ghost row, no dangling link", async () => {
    const bare = initBare();

    // Machine A: two skills, pushed.
    const A = buildFixtureTree();
    process.env.SSM_AGENT_ROOT = A.root;
    process.env.SSM_DATA_DIR = A.dataDir;
    const libA = path.join(A.dataDir, "library");
    {
      const { importSkill, buildOverview } = await import("./library");
      const rows = buildOverview();
      importSkill(rows.find((r) => r.name === "impeccable")!.contentHash);
      importSkill(
        rows.find((r) => r.name === "better-auth-best-practices")!.contentHash
      );
      raw(libA, ["init", "-b", "main"]);
      raw(libA, ["remote", "add", "origin", bare]);
      const { backup } = await import("./sync");
      await backup();
    }

    // Machine B: connect (clone flow) + enable impeccable for claude-code.
    const Bbase = fs.mkdtempSync(path.join(os.tmpdir(), "ssm-recon-"));
    const Bhome = path.join(Bbase, "home");
    process.env.SSM_AGENT_ROOT = Bhome;
    process.env.SSM_DATA_DIR = path.join(Bbase, "data");
    fs.mkdirSync(Bhome, { recursive: true });
    const { connectToRemote, pull } = await import("./sync");
    await connectToRemote(bare, {
      localHasContent: false,
      remoteHasCommits: true,
      defaultBranch: "main",
    });
    const { buildOverview, createTarget } = await import("./library");
    const impB = buildOverview().find((r) => r.name === "impeccable")!;
    createTarget(impB.contentHash, "claude-code");
    const linkB = path.join(Bhome, ".claude/skills/impeccable");
    expect(fs.lstatSync(linkB).isSymbolicLink()).toBe(true);

    // Machine A: delete impeccable and back the deletion up.
    process.env.SSM_AGENT_ROOT = A.root;
    process.env.SSM_DATA_DIR = A.dataDir;
    {
      const { buildOverview: boA, remove } = await import("./library");
      remove(boA().find((r) => r.name === "impeccable")!.contentHash);
      const { backup } = await import("./sync");
      await backup();
    }

    // Machine B: pull → the deletion must fully propagate.
    process.env.SSM_AGENT_ROOT = Bhome;
    process.env.SSM_DATA_DIR = path.join(Bbase, "data");
    await pull();
    const rowsB = buildOverview();
    // No ghost "未导入" row left behind…
    expect(rowsB.find((r) => r.name === "impeccable")).toBeUndefined();
    // …the survivor is untouched…
    expect(
      rowsB.find((r) => r.name === "better-auth-best-practices")?.adopted
    ).toBe(true);
    // …and the dangling agent symlink is gone (lstat: even as a dead link).
    expect(() => fs.lstatSync(linkB)).toThrow();
  });
});

describe("connect with leftover snapshot metadata", () => {
  it("clone flow succeeds when the library already has .git/.gitignore/manifest", async () => {
    const bare = initBare();
    await seedRemote(bare, "impeccable");

    const Bbase = fs.mkdtempSync(path.join(os.tmpdir(), "ssm-meta-"));
    process.env.SSM_AGENT_ROOT = path.join(Bbase, "home");
    process.env.SSM_DATA_DIR = path.join(Bbase, "data");
    fs.mkdirSync(process.env.SSM_AGENT_ROOT, { recursive: true });

    const { snapshotLibrary, connectToRemote } = await import("./sync");
    // A prior destructive op snapshotted the (skill-less) library → it now has
    // .git, .gitignore, manifest.json. `git clone` would refuse this dir.
    snapshotLibrary("先有一次快照");

    const res = await connectToRemote(bare, {
      localHasContent: false,
      remoteHasCommits: true,
      defaultBranch: "main",
    });
    const libB = path.join(process.env.SSM_DATA_DIR!, "library");
    expect(res.flow).toBe("cloned");
    expect(fs.existsSync(path.join(libB, "impeccable"))).toBe(true);
    expect(res.imported).toBeGreaterThan(0);
  });
});

describe("syncCheck (检查改动)", () => {
  it("reports needsBackup on a local change, clean again after backup", async () => {
    const bare = initBare();
    await seedRemote(bare, "impeccable"); // env → machine A, lib pushed
    const libA = path.join(process.env.SSM_DATA_DIR!, "library");
    const { syncCheck, backup } = await import("./sync");

    expect((await syncCheck()).connected).toBe(true);

    // A local edit → dirty + needs backup.
    fs.writeFileSync(path.join(libA, "impeccable", "SKILL.md"), "CHANGED");
    const dirty = await syncCheck();
    expect(dirty.dirty).toBe(true);
    expect(dirty.needsBackup).toBe(true);
    expect(dirty.changedCount).toBeGreaterThan(0);

    // After backup → clean, nothing ahead.
    await backup();
    const clean = await syncCheck();
    expect(clean.needsBackup).toBe(false);
    expect(clean.ahead).toBe(0);
    expect(clean.behind).toBe(0);
  });
});
