import fs from "node:fs";
import path from "node:path";
import { detectAgents } from "./agents";
import { hashDir } from "./hash";
import { readSkillMeta } from "./skillmeta";
import { isBundled } from "./classify";
import { libraryDir, agentRoot, isInsideRoot } from "./config";
import type { DetectedAgent, Occurrence, OccurrenceKind } from "./types";

export interface RawScan {
  hash: string;
  name: string;
  description: string;
  occurrence: Occurrence;
}

/** A skill dir is anything directly inside a skills dir that contains files. */
function listSkillDirs(skillsDir: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const d of entries) {
    if (d.name.startsWith(".")) continue;
    const abs = path.join(skillsDir, d.name);
    // Both real dirs and symlinks-to-dirs count — but an EMPTY dir is not a
    // skill (e.g. an agent's runtime marker dir), so skip content-less ones.
    try {
      if (!fs.statSync(abs).isDirectory()) continue;
      if (fs.readdirSync(abs).length === 0) continue;
      out.push(abs);
    } catch {
      /* dangling symlink — skip */
    }
  }
  return out;
}

function occurrenceKind(skillPath: string): {
  kind: OccurrenceKind;
  linkTarget?: string;
} {
  let lst: fs.Stats;
  try {
    lst = fs.lstatSync(skillPath);
  } catch {
    return { kind: "real-dir" };
  }
  if (lst.isSymbolicLink()) {
    let target = "";
    try {
      target = fs.realpathSync(skillPath);
    } catch {
      target = "";
    }
    const lib = path.resolve(libraryDir());
    const isLib = !!target && isInsideRoot(lib, target);
    return {
      kind: isLib ? "symlink-to-library" : "symlink-external",
      linkTarget: target,
    };
  }
  return { kind: "real-dir" };
}

/** Scan one agent's skills dirs + bundled dirs into raw occurrences. */
export function scanAgent(agent: DetectedAgent): RawScan[] {
  const out: RawScan[] = [];
  const dirs = new Set<string>([
    ...agent.resolvedSkillsDirs,
    ...(agent.bundledDirs ?? []).map((b) => path.join(agentRoot(), b)),
  ]);
  for (const skillsDir of dirs) {
    for (const skillPath of listSkillDirs(skillsDir)) {
      const name = path.basename(skillPath);
      const { kind, linkTarget } = occurrenceKind(skillPath);
      let hash: string;
      try {
        hash = hashDir(skillPath);
      } catch {
        continue;
      }
      const meta = readSkillMeta(skillPath);
      const bundled = isBundled(agent, skillPath, name);
      out.push({
        hash,
        name: meta.name || name,
        description: meta.description,
        occurrence: {
          agentId: agent.id,
          foundPath: skillPath,
          kind,
          linkTarget,
          bundled,
        },
      });
    }
  }
  return out;
}

/** Full scan across all detected agents. */
export function scanAll(): RawScan[] {
  const agents = detectAgents().filter((a) => a.detected);
  return agents.flatMap(scanAgent);
}

export interface GroupedSkill {
  hash: string;
  name: string;
  description: string;
  occurrences: Occurrence[];
  anyBundled: boolean;
  allBundled: boolean;
}

/** Group raw occurrences by content hash (the dedup step, PRD §4.6). */
export function groupByHash(raws: RawScan[]): GroupedSkill[] {
  const map = new Map<string, GroupedSkill>();
  for (const r of raws) {
    let g = map.get(r.hash);
    if (!g) {
      g = {
        hash: r.hash,
        name: r.name,
        description: r.description,
        occurrences: [],
        anyBundled: false,
        allBundled: true,
      };
      map.set(r.hash, g);
    }
    g.occurrences.push(r.occurrence);
    // Prefer a non-empty description / a managed-looking name.
    if (!g.description && r.description) g.description = r.description;
    g.anyBundled = g.anyBundled || r.occurrence.bundled;
    g.allBundled = g.allBundled && r.occurrence.bundled;
  }
  return [...map.values()];
}
