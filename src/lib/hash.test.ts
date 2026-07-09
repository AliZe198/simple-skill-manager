import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { hashDir, shortHash } from "./hash";

function mkdir(...parts: string[]): string {
  const p = path.join(os.tmpdir(), "ssm-hash-" + Math.random().toString(36).slice(2), ...parts);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

describe("hashDir", () => {
  it("is deterministic and content-addressed", () => {
    const a = mkdir("a");
    fs.writeFileSync(path.join(a, "SKILL.md"), "hello world");
    const b = mkdir("b");
    fs.writeFileSync(path.join(b, "SKILL.md"), "hello world");
    expect(hashDir(a)).toBe(hashDir(b));
  });

  it("differs when content differs", () => {
    const a = mkdir("a");
    fs.writeFileSync(path.join(a, "SKILL.md"), "one");
    const b = mkdir("b");
    fs.writeFileSync(path.join(b, "SKILL.md"), "two");
    expect(hashDir(a)).not.toBe(hashDir(b));
  });

  it("ignores .git and .DS_Store noise", () => {
    const a = mkdir("a");
    fs.writeFileSync(path.join(a, "SKILL.md"), "x");
    const b = mkdir("b");
    fs.writeFileSync(path.join(b, "SKILL.md"), "x");
    fs.mkdirSync(path.join(b, ".git"));
    fs.writeFileSync(path.join(b, ".git", "HEAD"), "ref: refs/heads/main");
    fs.writeFileSync(path.join(b, ".DS_Store"), "junk");
    expect(hashDir(a)).toBe(hashDir(b));
  });

  it("shortHash is 8 chars", () => {
    expect(shortHash("abcdef1234567890")).toHaveLength(8);
  });
});
