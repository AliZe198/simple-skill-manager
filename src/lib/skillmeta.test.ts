import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { readSkillMeta } from "./skillmeta";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ssm-meta-"));
}

describe("readSkillMeta frontmatter parsing", () => {
  it("reads name + description from LF frontmatter", () => {
    const d = tmpDir();
    fs.writeFileSync(
      path.join(d, "SKILL.md"),
      "---\nname: alpha\ndescription: does alpha things\n---\n\n# body\n"
    );
    expect(readSkillMeta(d)).toEqual({
      name: "alpha",
      description: "does alpha things",
    });
  });

  it("reads CRLF frontmatter (Windows line endings) without falling back to the dir name", () => {
    const d = tmpDir();
    fs.writeFileSync(
      path.join(d, "SKILL.md"),
      "---\r\nname: beta\r\ndescription: does beta things\r\n---\r\n\r\n# body\r\n"
    );
    expect(readSkillMeta(d)).toEqual({
      name: "beta",
      description: "does beta things",
    });
  });

  it("falls back to the directory name when there is no SKILL.md", () => {
    const d = tmpDir();
    const named = path.join(d, "gamma");
    fs.mkdirSync(named);
    expect(readSkillMeta(named).name).toBe("gamma");
  });
});
