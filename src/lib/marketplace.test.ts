import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  findSkillDir,
  resolveSource,
  dirMatchesSkill,
  assertSafeCloneUrl,
} from "./marketplace";

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ssm-mkt-"));
}
function mk(dir: string, withMd = true) {
  fs.mkdirSync(dir, { recursive: true });
  if (withMd) fs.writeFileSync(path.join(dir, "SKILL.md"), "# x");
}

describe("findSkillDir (monorepo-aware install)", () => {
  it("single-skill repo: SKILL.md at root", () => {
    const root = tmp();
    mk(root);
    expect(findSkillDir(root, "anything")).toBe(root);
  });

  it("monorepo: picks the named subdir", () => {
    const root = tmp();
    mk(path.join(root, "pdf"));
    mk(path.join(root, "xlsx"));
    expect(findSkillDir(root, "xlsx")).toBe(path.join(root, "xlsx"));
  });

  it("monorepo under skills/: picks skills/<slug>", () => {
    const root = tmp();
    mk(path.join(root, "skills", "deep-research"));
    expect(findSkillDir(root, "deep-research")).toBe(
      path.join(root, "skills", "deep-research")
    );
  });

  it("falls back to first SKILL.md dir when slug not found", () => {
    const root = tmp();
    mk(path.join(root, "only-one"));
    const got = findSkillDir(root, "does-not-exist");
    expect(got).toBe(path.join(root, "only-one"));
  });

  it("matches a slugified frontmatter name (dir renamed upstream)", () => {
    // Repo dir is 'renamed-dir' but frontmatter says 'My Skill' → the slug
    // 'my-skill' must still find it (same criteria as dirMatchesSkill, so a
    // positive find always passes the pre-update guard).
    const root = tmp();
    mk(path.join(root, "decoy")); // sorts first — must NOT win
    const d = path.join(root, "renamed-dir");
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, "SKILL.md"), "---\nname: My Skill\n---\n# x");
    const got = findSkillDir(root, "my-skill");
    expect(got).toBe(d);
    expect(dirMatchesSkill(got, "my-skill")).toBe(true);
  });
});

describe("resolveSource (update source = recorded git_url only)", () => {
  it("parses owner/repo from a recorded github git_url", () => {
    expect(resolveSource("https://github.com/openai/skills")).toEqual({
      repoFull: "openai/skills",
      gitUrl: "https://github.com/openai/skills",
    });
    expect(resolveSource("https://github.com/owner/repo.git")?.repoFull).toBe(
      "owner/repo"
    );
  });

  it("NEVER guesses a source when git_url is missing (the clobber bug)", () => {
    // A locally-authored / source-less skill must resolve to null so it is
    // simply not update-eligible — not matched to some unrelated repo via a
    // name search and then destructively overwritten.
    expect(resolveSource(null)).toBeNull();
    expect(resolveSource("")).toBeNull();
    expect(resolveSource("yupinfang_xhs skill")).toBeNull(); // a bare name, not a url
  });
});

describe("dirMatchesSkill (updateSkill clobber guard)", () => {
  it("rejects a sibling skill's dir that merely has a SKILL.md", () => {
    // Monorepo where the skill we're updating ('gamma') is absent. findSkillDir
    // falls back to the first SKILL.md dir (a sibling), which we must NOT treat
    // as a match — overwriting from it would replace gamma with that sibling.
    const root = tmp();
    mk(path.join(root, "alpha"));
    mk(path.join(root, "beta"));
    const located = findSkillDir(root, "gamma"); // not present → sibling/fallback
    expect(dirMatchesSkill(located, "gamma")).toBe(false);
  });

  it("accepts the dir when its name matches the slug", () => {
    const root = tmp();
    mk(path.join(root, "alpha"));
    expect(dirMatchesSkill(path.join(root, "alpha"), "alpha")).toBe(true);
  });

  it("matches via the SKILL.md frontmatter name when the dir is named differently", () => {
    const root = tmp();
    const d = path.join(root, "weird-dir-name");
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, "SKILL.md"), "---\nname: alpha\n---\n# x");
    expect(dirMatchesSkill(d, "alpha")).toBe(true);
  });

  it("rejects a dir with no SKILL.md (e.g. clone root)", () => {
    const root = tmp();
    fs.mkdirSync(path.join(root, "sub"), { recursive: true });
    expect(dirMatchesSkill(root, "anything")).toBe(false);
  });
});

describe("assertSafeCloneUrl (block git RCE transports)", () => {
  it("accepts plain http(s) URLs", () => {
    expect(() => assertSafeCloneUrl("https://github.com/anthropics/skills")).not.toThrow();
    expect(() => assertSafeCloneUrl("http://example.com/x.git")).not.toThrow();
  });

  it("rejects the ext:: transport (arbitrary command execution)", () => {
    expect(() => assertSafeCloneUrl("ext::sh -c whoami")).toThrow();
  });

  it("rejects file://, ssh, git:// and leading-dash option injection", () => {
    for (const bad of [
      "file:///etc/passwd",
      "git@github.com:owner/repo.git",
      "git://example.com/x",
      "--upload-pack=touch /tmp/pwned",
      "-oProxyCommand=evil",
      "",
    ]) {
      expect(() => assertSafeCloneUrl(bad)).toThrow();
    }
  });
});
