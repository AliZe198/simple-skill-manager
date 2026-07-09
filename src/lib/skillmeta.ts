import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

/**
 * Set the `name:` field in a skill dir's SKILL.md frontmatter, preserving the
 * rest of the file byte-for-byte (so a rename changes the content hash as
 * little as possible). Replaces just the `name:` line; adds one if the
 * frontmatter lacks it; creates frontmatter (or a whole SKILL.md) if missing.
 */
export function writeSkillName(dir: string, newName: string): void {
  const quoted = `"${newName.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const mdPath = findSkillMd(dir);
  if (!mdPath) {
    fs.writeFileSync(
      path.join(dir, "SKILL.md"),
      `---\nname: ${quoted}\ndescription: ""\n---\n\n# ${newName}\n`
    );
    return;
  }
  const content = fs.readFileSync(mdPath, "utf8");
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  let next: string;
  if (fm) {
    const body = /^name:.*$/m.test(fm[1])
      ? fm[1].replace(/^name:.*$/m, `name: ${quoted}`)
      : `name: ${quoted}\n${fm[1]}`;
    next = `---\n${body}\n---` + content.slice(fm[0].length);
  } else {
    next = `---\nname: ${quoted}\n---\n\n${content}`;
  }
  fs.writeFileSync(mdPath, next);
}

/** Read name + description for a skill dir, from SKILL.md frontmatter if present. */
export function readSkillMeta(dir: string): {
  name: string;
  description: string;
} {
  const fallbackName = path.basename(dir);
  const mdPath = findSkillMd(dir);
  if (!mdPath) return { name: fallbackName, description: "" };

  let content = "";
  try {
    content = fs.readFileSync(mdPath, "utf8");
  } catch {
    return { name: fallbackName, description: "" };
  }

  const fm = parseFrontmatter(content);
  const name =
    (typeof fm.name === "string" && fm.name.trim()) || fallbackName;
  const description =
    (typeof fm.description === "string" && fm.description.trim()) ||
    firstHeadingOrLine(content);
  return { name, description };
}

function findSkillMd(dir: string): string | null {
  for (const candidate of ["SKILL.md", "skill.md", "README.md"]) {
    const p = path.join(dir, candidate);
    try {
      if (fs.statSync(p).isFile()) return p;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

function parseFrontmatter(content: string): Record<string, unknown> {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  try {
    const parsed = YAML.parse(m[1]);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function firstHeadingOrLine(content: string): string {
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, "");
  for (const line of body.split("\n")) {
    const t = line.replace(/^#+\s*/, "").trim();
    if (t) return t.slice(0, 200);
  }
  return "";
}
