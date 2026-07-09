import fs from "node:fs";
import path from "node:path";
import { agentRoot } from "./config";

/**
 * Install-source detection via the `skills` CLI lock file (`npx skills add
 * owner/repo` writes ~/.agents/.skill-lock.json). It records, per installed
 * skill, which repo it came from — the authoritative answer to "这是哪里下的",
 * and the basis for grouping a multi-skill repo (e.g. heygen-com/hyperframes,
 * 19 skills) into one 套件 in Discover instead of 19 loose rows.
 *
 * Read-only: we never write this file; the `skills` CLI owns it.
 */

export interface SkillSourceInfo {
  /** Repo slug, e.g. "heygen-com/hyperframes". */
  source: string;
  /** Clone URL — same shape resolveSource()/withClone() already accept. */
  sourceUrl?: string;
}

interface LockFile {
  skills?: Record<
    string,
    { source?: unknown; sourceType?: unknown; sourceUrl?: unknown }
  >;
}

function lockPath(): string {
  return path.join(agentRoot(), ".agents", ".skill-lock.json");
}

/** name → source info from the lock file. Empty map when absent/unparsable. */
export function readSkillLock(): Map<string, SkillSourceInfo> {
  const out = new Map<string, SkillSourceInfo>();
  let parsed: LockFile;
  try {
    parsed = JSON.parse(fs.readFileSync(lockPath(), "utf8")) as LockFile;
  } catch {
    return out;
  }
  for (const [name, info] of Object.entries(parsed.skills ?? {})) {
    if (!info || typeof info !== "object") continue;
    const source = typeof info.source === "string" ? info.source.trim() : "";
    if (!source) continue;
    out.set(name, {
      source,
      sourceUrl:
        typeof info.sourceUrl === "string" && info.sourceUrl
          ? info.sourceUrl
          : undefined,
    });
  }
  return out;
}

/**
 * owner/repo slug from a recorded git_url — the source fallback for skills
 * that predate the lock file or were installed via the marketplace. Mirrors
 * marketplace.resolveSource()'s parsing.
 */
export function repoSlugFromGitUrl(gitUrl: string | null | undefined): string | undefined {
  if (!gitUrl) return undefined;
  const m = gitUrl.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  return m ? `${m[1]}/${m[2]}` : undefined;
}

/**
 * Look up a skill's install source by any of its known names (meta name,
 * occurrence dir basenames, library dir basename). Lock keys are the skill's
 * canonical name, while on-disk dirs sometimes carry a dedup suffix
 * (web-access-316c91bd), so a hash-suffix-stripped variant is tried too.
 */
export function sourceForNames(
  lock: Map<string, SkillSourceInfo>,
  names: Iterable<string>
): SkillSourceInfo | undefined {
  if (lock.size === 0) return undefined;
  for (const raw of names) {
    const n = (raw || "").trim();
    if (!n) continue;
    const hit = lock.get(n) ?? lock.get(n.replace(/-[0-9a-f]{8}$/, ""));
    if (hit) return hit;
  }
  return undefined;
}
