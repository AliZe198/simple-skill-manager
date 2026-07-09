import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Content hash of a skill directory (PRD §4.6 — the dedup primary key).
 *
 * Deterministic: walk the tree in sorted order, hashing each file's relative
 * path + bytes. Two directories with identical content hash to the same value
 * regardless of where they live or what the top dir is named.
 *
 * Noise dirs (.git, node_modules) are excluded so a cloned skill and a copied
 * one still match.
 */
const IGNORE = new Set([".git", "node_modules", ".DS_Store", ".next"]);

export function hashDir(dir: string): string {
  const h = crypto.createHash("sha256");
  const entries = collect(dir, "");
  entries.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  for (const e of entries) {
    h.update(e.rel);
    h.update("\0");
    h.update(e.data);
    h.update("\0");
  }
  return h.digest("hex");
}

/** Short, display-friendly form of a content hash. */
export function shortHash(hash: string): string {
  return hash.slice(0, 8);
}

function collect(
  abs: string,
  rel: string
): { rel: string; data: Buffer }[] {
  const out: { rel: string; data: Buffer }[] = [];
  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const d of dirents) {
    if (IGNORE.has(d.name)) continue;
    // Skip nested symlinks entirely: following them risks symlink cycles
    // (infinite recursion → app hangs on every scan) and pulling in huge
    // external trees. The top-level skill dir may itself be a symlink — that
    // is handled by readdirSync above, which follows the top link only.
    if (d.isSymbolicLink()) continue;
    const childAbs = path.join(abs, d.name);
    const childRel = rel ? `${rel}/${d.name}` : d.name;
    if (d.isDirectory()) {
      out.push(...collect(childAbs, childRel));
    } else if (d.isFile()) {
      try {
        out.push({ rel: childRel, data: fs.readFileSync(childAbs) });
      } catch {
        /* unreadable file — skip */
      }
    }
  }
  return out;
}

export function hashString(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}
