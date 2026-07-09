import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { libraryDir, assertWritable, agentRoot, loadConfig, saveConfig } from "./config";
import { detectAgents, getAgent } from "./agents";
import { scanAll, groupByHash } from "./scan";
import { readSkillLock, sourceForNames, repoSlugFromGitUrl } from "./sources";
import { hashDir, shortHash } from "./hash";
import { readSkillMeta, writeSkillName } from "./skillmeta";
import {
  allSkills,
  getSkill,
  upsertSkill,
  setSkillFields,
  deleteSkill,
  rekeySkill,
  targetsFor,
  allTargets,
  upsertTarget,
  deleteTarget,
} from "./db";
import type {
  AgentConfig,
  AppConfig,
  DetectedAgent,
  McpFormat,
  Occurrence,
  Provenance,
  SkillRow,
  TargetMode,
} from "./types";

/* --------------------------------------------------------------------- *
 *  OVERVIEW  (read-only: scan ⊕ DB → deduped rows, PRD §4.3/§4.6)
 * --------------------------------------------------------------------- */

export function buildOverview(): SkillRow[] {
  const grouped = groupByHash(scanAll());
  const byHash = new Map(grouped.map((g) => [g.hash, g]));
  const dbSkills = allSkills();
  const dbByHash = new Map(dbSkills.map((s) => [s.content_hash, s]));
  const lock = readSkillLock();

  const hashes = new Set<string>([
    ...byHash.keys(),
    ...dbByHash.keys(),
  ]);

  const rows: SkillRow[] = [];
  for (const hash of hashes) {
    const g = byHash.get(hash);
    const rec = dbByHash.get(hash);
    const occurrences: Occurrence[] = g?.occurrences ?? [];

    // Reconcile DB against the filesystem: a target whose link/copy was
    // deleted out-of-band must NOT show as active, and a skill whose library
    // copy is gone is no longer "adopted".
    const targets = targetsFor(hash).filter((t) => fs.existsSync(t.target_path));
    const activeAgentIds = targets.map((t) => t.agent_id);
    const adopted = !!(rec?.central_path && fs.existsSync(rec.central_path));

    // Local-change detection: the row is keyed by the hash recorded at adopt/
    // update time. Re-hash the library copy now — if it differs, the user edited
    // the skill in place, so copy-mode agents still hold the old bytes and the
    // DB hash is stale. Surface it so the card can offer a manual re-sync.
    const localChanged =
      adopted && hashDir(rec!.central_path as string) !== hash;

    // Provenance: DB is authoritative for adopted skills (PRD §4.4);
    // for discovered-only skills, bundled is derivable, else unknown.
    let provenance: Provenance;
    if (rec) provenance = rec.provenance;
    else if (g?.allBundled) provenance = "bundled";
    else provenance = "unknown";

    // Install source: match the lock file against every name this skill goes
    // by — meta name, occurrence dir basenames, library dir basename. Skills
    // the lock doesn't know (pre-lock imports, marketplace installs) fall back
    // to their recorded git_url, so backfilling git_url also groups them.
    const src = sourceForNames(lock, [
      rec?.name ?? "",
      g?.name ?? "",
      ...occurrences.map((o) => path.basename(o.foundPath)),
      rec?.central_path ? path.basename(rec.central_path) : "",
    ]);
    const source = src?.source ?? repoSlugFromGitUrl(rec?.git_url);

    rows.push({
      id: hash,
      name: rec?.name || g?.name || hash.slice(0, 8),
      description: rec?.description || g?.description || "",
      contentHash: hash,
      centralPath: rec?.central_path ?? null,
      provenance,
      gitUrl: rec?.git_url ?? src?.sourceUrl,
      source,
      tags: rec ? safeJson(rec.tags) : [],
      occurrences,
      activeAgentIds,
      parked: adopted && activeAgentIds.length === 0,
      adopted,
      localChanged,
    });
  }

  // Stable order: adopted first, then by name.
  rows.sort((a, b) => {
    if (a.adopted !== b.adopted) return a.adopted ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return rows;
}

function safeJson(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/* --------------------------------------------------------------------- *
 *  PATH HELPERS
 * --------------------------------------------------------------------- */

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/\.{2,}/g, ".") // collapse ".." so it can never traverse up
      .replace(/^[.\-]+|[.\-]+$/g, "") // no leading/trailing dot or dash
      .slice(0, 80) || "skill"
  );
}

/** Pick a non-colliding directory name in the library for a content hash. */
export function libraryDestFor(name: string, hash: string): string {
  const base = slugify(name);
  let dest = path.join(libraryDir(), base);
  if (fs.existsSync(dest)) {
    // Same content already there? reuse. Else suffix with short hash.
    try {
      if (fs.statSync(dest).isDirectory() && hashDir(dest) === hash) return dest;
    } catch {
      /* fall through */
    }
    dest = path.join(libraryDir(), `${base}-${shortHash(hash)}`);
  }
  return dest;
}

function agentPrimarySkillsDir(agent: DetectedAgent): string {
  if (agent.resolvedSkillsDirs[0]) return agent.resolvedSkillsDirs[0];
  return path.join(agentRoot(), agent.skillsDirs[0]);
}

function rmAny(p: string): void {
  assertWritable(p);
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/** Does anything (incl. a dangling symlink) exist at this path? */
function pathExists(p: string): boolean {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Is the thing currently at `targetPath` safe for us to replace? Only if it is
 * one of OUR artifacts: a symlink resolving into the library, or a path we have
 * already recorded as this skill's target for this agent. A real, unmanaged
 * directory (e.g. the user's own hand-written skill of the same name) is NOT
 * ours — replacing it would silently destroy their work.
 */
function existingTargetIsOurs(
  targetPath: string,
  hash: string,
  agentId: string
): boolean {
  if (!pathExists(targetPath)) return true; // nothing there → safe to create
  const rec = targetsFor(hash).find(
    (t) =>
      t.agent_id === agentId &&
      path.resolve(t.target_path) === path.resolve(targetPath)
  );
  if (rec) return true; // we wrote this exact target before
  try {
    if (fs.lstatSync(targetPath).isSymbolicLink()) {
      const real = fs.realpathSync(targetPath);
      const lib = path.resolve(libraryDir());
      return real === lib || real.startsWith(lib + path.sep);
    }
  } catch {
    return true;
  }
  return false; // real, unmanaged dir/file → refuse
}

/* --------------------------------------------------------------------- *
 *  TARGETS  (enable / disable a skill for one agent, PRD §4.2)
 * --------------------------------------------------------------------- */

export function createTarget(
  hash: string,
  agentId: string
): { targetPath: string; mode: "symlink" | "copy" } {
  const rec = getSkill(hash);
  if (!rec?.central_path) {
    throw new Error("Skill is not adopted into the library yet.");
  }
  const agent = getAgent(agentId);
  if (!agent) throw new Error(`Unknown agent: ${agentId}`);

  const skillsDir = agentPrimarySkillsDir(agent);
  fs.mkdirSync(skillsDir, { recursive: true });
  const targetPath = path.join(skillsDir, path.basename(rec.central_path));

  // Refuse to clobber an unmanaged skill that happens to share this name.
  if (!existingTargetIsOurs(targetPath, hash, agentId)) {
    throw new Error(
      `目标已存在且不是本工具管理的，已中止以保护你的文件：\n${targetPath}\n` +
        `请先手动处理同名技能。`
    );
  }
  // Clear our own stale link / copy, then write fresh.
  if (pathExists(targetPath)) rmAny(targetPath);
  assertWritable(targetPath);

  if (agent.linkMode === "symlink") {
    fs.symlinkSync(rec.central_path, targetPath, "dir");
  } else {
    fs.cpSync(rec.central_path, targetPath, { recursive: true });
  }

  upsertTarget({
    contentHash: hash,
    agentId,
    targetPath,
    mode: agent.linkMode,
    sourceHash: agent.linkMode === "copy" ? hash : undefined,
    status: "ok",
  });
  return { targetPath, mode: agent.linkMode };
}

export function removeTarget(hash: string, agentId: string): void {
  const existing = targetsFor(hash).find((t) => t.agent_id === agentId);
  if (existing) rmAny(existing.target_path);
  deleteTarget(hash, agentId);
}

/**
 * Re-sync a skill that was edited in place in the library (NOT pulled from
 * upstream — that is updateSkill). Re-hashes the library copy, re-keys the DB to
 * the new hash, and re-materializes every copy-mode target so each agent gets
 * the new bytes. Symlink targets already follow the library, so they only need
 * the DB re-key (done by rekeySkill). No-op when nothing changed.
 */
export function syncLocalChange(
  hash: string
): { synced: boolean; newHash?: string } {
  const rec = getSkill(hash);
  if (!rec?.central_path) throw new Error("技能不在库中。");
  const newHash = hashDir(rec.central_path);
  if (newHash === hash) return { synced: false };
  rekeySkill(hash, newHash);
  for (const t of targetsFor(newHash)) {
    if (t.mode === "copy") createTarget(newHash, t.agent_id);
  }
  return { synced: true, newHash };
}

/* --------------------------------------------------------------------- *
 *  ADOPT  (move discovered skill → library, replace occurrences, PRD §4.3)
 * --------------------------------------------------------------------- */

export function adopt(
  hash: string,
  opts: { provenance?: Provenance } = {}
): SkillRow {
  const grouped = groupByHash(scanAll()).find((g) => g.hash === hash);
  if (!grouped) throw new Error(`No discovered skill with hash ${hash}`);
  if (getSkill(hash)?.central_path) {
    return findRow(hash); // already adopted
  }

  // Choose a source occurrence to seed the library copy. Prefer a real dir.
  const src =
    grouped.occurrences.find((o) => o.kind === "real-dir") ??
    grouped.occurrences[0];
  const srcRealPath =
    src.kind === "real-dir" ? src.foundPath : src.linkTarget || src.foundPath;

  const dest = libraryDestFor(grouped.name, hash);
  assertWritable(dest);
  if (!fs.existsSync(dest)) {
    // Copy into a temp sibling first, then atomically rename into place, so an
    // interrupted copy can never leave a partial dir that we'd treat as canonical.
    const tmp = `${dest}.tmp-${shortHash(hash)}`;
    assertWritable(tmp);
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.cpSync(srcRealPath, tmp, { recursive: true });
    fs.renameSync(tmp, dest);
  }
  // CRITICAL: never delete the originals unless the library copy is verified
  // complete (content hash matches). Protects against a corrupt/partial dest.
  if (hashDir(dest) !== hash) {
    throw new Error(
      `库副本校验失败（内容哈希不匹配），已中止并保留原文件：\n${dest}`
    );
  }

  // Install source from the skills-CLI lock file → recorded as git_url, which
  // makes the skill update-eligible (checkAllUpdates) right from adoption.
  const lockSrc = sourceForNames(readSkillLock(), [
    grouped.name,
    ...grouped.occurrences.map((o) => path.basename(o.foundPath)),
  ]);

  // Default provenance per PRD §4.4/§12: adopting an existing skill ⇒ downloaded.
  upsertSkill({
    contentHash: hash,
    name: grouped.name,
    description: grouped.description,
    centralPath: dest,
    provenance: opts.provenance ?? "downloaded",
    gitUrl:
      lockSrc?.sourceUrl ??
      (lockSrc ? `https://github.com/${lockSrc.source}` : null),
    enabled: true,
  });

  // Replace every (non-bundled) occurrence with a target into the library.
  for (const occ of grouped.occurrences) {
    if (occ.bundled) continue; // leave bundled originals untouched (PRD §11)
    const agent = getAgent(occ.agentId);
    if (!agent) continue;
    rmAny(occ.foundPath);
    createTarget(hash, occ.agentId);
  }

  return findRow(hash);
}

/* --------------------------------------------------------------------- *
 *  PROMOTE  (copy a bundled skill into the library, keep original, §4.4)
 * --------------------------------------------------------------------- */

export function promote(hash: string): SkillRow {
  // Idempotent: once adopted, re-importing must not clobber state — in
  // particular it must never revert a moveToLibrary() (bundled → downloaded)
  // back to "bundled". (The library copy is invisible to scanAll, so a repeat
  // import still routes here.) Mirrors the guard in adopt().
  if (getSkill(hash)?.central_path) return findRow(hash);
  const grouped = groupByHash(scanAll()).find((g) => g.hash === hash);
  if (!grouped) throw new Error(`No discovered skill with hash ${hash}`);
  const src = grouped.occurrences[0];
  const srcRealPath =
    src.kind.startsWith("symlink") && src.linkTarget
      ? src.linkTarget
      : src.foundPath;

  const dest = libraryDestFor(grouped.name, hash);
  assertWritable(dest);
  if (!fs.existsSync(dest)) {
    fs.cpSync(srcRealPath, dest, { recursive: true }); // copy only, no delete
  }
  upsertSkill({
    contentHash: hash,
    name: grouped.name,
    description: grouped.description,
    centralPath: dest,
    // Keep the bundled identity: imported bundled skills go to the "Agent 内置"
    // zone of My Library, quarantined from distribution. moveToLibrary() turns
    // one into a first-class, distributable skill (provenance → downloaded).
    provenance: "bundled",
    enabled: true,
  });
  return findRow(hash); // lands in parking lot (no targets yet)
}

/**
 * Promote an imported BUNDLED skill into a first-class library skill: flips
 * provenance bundled → downloaded so it leaves the "Agent 内置" zone and gains
 * per-agent distribution. The original bundled copy in the agent is untouched.
 */
export function moveToLibrary(hash: string): SkillRow {
  const rec = getSkill(hash);
  if (!rec?.central_path)
    throw new Error("Skill is not in the library yet — import it first.");
  setSkillFields(hash, { provenance: "downloaded" });
  return findRow(hash);
}

/* --------------------------------------------------------------------- *
 *  IMPORT  (unified entry: discovered → adopt, bundled → promote)
 * --------------------------------------------------------------------- */

/**
 * One verb for the UI: "导入 / Import". The tool picks the right mechanism —
 * a skill that exists only as bundled (agent's built-in) is COPIED (original
 * kept); anything with a real, non-bundled occurrence is ADOPTED (moved in).
 */
export function importSkill(
  hash: string,
  opts: { provenance?: Provenance } = {}
): SkillRow {
  const grouped = groupByHash(scanAll()).find((g) => g.hash === hash);
  if (!grouped) throw new Error(`No discovered skill with hash ${hash}`);
  const allBundled = grouped.occurrences.every((o) => o.bundled);
  return allBundled ? promote(hash) : adopt(hash, opts);
}

export function importMany(hashes: string[]): {
  imported: number;
  failed: { hash: string; error: string }[];
} {
  const failed: { hash: string; error: string }[] = [];
  let imported = 0;
  for (const h of hashes) {
    try {
      importSkill(h);
      imported++;
    } catch (e) {
      failed.push({ hash: h, error: (e as Error).message });
    }
  }
  return { imported, failed };
}

/**
 * 移出我的库 (Remove from Library) — reversible. Un-manages the skill but
 * KEEPS the files: every agent that was using it gets a real copy left in
 * place (symlink → real dir), then the central library copy + DB record go.
 * Re-importing later re-adopts it. Distinct from 彻底删除 (remove()).
 */
export function removeFromLibrary(hash: string): void {
  const rec = getSkill(hash);
  if (!rec?.central_path) {
    deleteSkill(hash);
    return;
  }
  for (const t of targetsFor(hash)) {
    if (fs.existsSync(t.target_path)) {
      assertWritable(t.target_path);
      const tmp = `${t.target_path}.ssm-restore`;
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.cpSync(rec.central_path, tmp, { recursive: true }); // materialize content
      rmAny(t.target_path); // drop the symlink/copy
      fs.renameSync(tmp, t.target_path); // leave a real, unmanaged copy
    }
    deleteTarget(hash, t.agent_id);
  }
  rmAny(rec.central_path);
  deleteSkill(hash);
}

/* --------------------------------------------------------------------- *
 *  PARK / UNPARK / DELETE / NEW
 * --------------------------------------------------------------------- */

/** Park: remove every target but keep the skill in the library (PRD §4.5). */
export function park(hash: string): SkillRow {
  for (const t of targetsFor(hash)) removeTarget(hash, t.agent_id);
  return findRow(hash);
}

/** Delete a skill: remove targets, library copy, and any un-adopted originals. */
export function remove(hash: string): void {
  const rec = getSkill(hash);
  for (const t of targetsFor(hash)) removeTarget(hash, t.agent_id);
  if (rec?.central_path) rmAny(rec.central_path);
  else {
    // Un-adopted: best-effort delete of the real (non-bundled) originals.
    const grouped = groupByHash(scanAll()).find((g) => g.hash === hash);
    for (const occ of grouped?.occurrences ?? []) {
      if (!occ.bundled) rmAny(occ.foundPath);
    }
  }
  deleteSkill(hash);
}

/* --------------------------------------------------------------------- *
 *  DEDUPE  (same-named, different-content copies that piled up because
 *  divergent versions existed across agents at import time)
 * --------------------------------------------------------------------- */

export interface DupCopy {
  hash: string;
  dir: string;
  path: string; // absolute library path, for "open in Finder"
  fileCount: number;
  sizeKb: number;
  createdAt: number;
  agentIds: string[];
}
export interface DupGroup {
  name: string;
  copies: DupCopy[];
}

function dirStats(dir: string): { fileCount: number; sizeKb: number } {
  let fileCount = 0;
  let bytes = 0;
  const walk = (d: string, depth: number) => {
    if (depth > 6) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === ".git" || e.name === "node_modules") continue;
      const abs = path.join(d, e.name);
      if (e.isDirectory()) walk(abs, depth + 1);
      else if (e.isFile()) {
        fileCount++;
        try {
          bytes += fs.statSync(abs).size;
        } catch {
          /* ignore */
        }
      }
    }
  };
  walk(dir, 0);
  return { fileCount, sizeKb: Math.round(bytes / 1024) };
}

/** Adopted skills that share a name (≥2 copies) — the dedupe candidates. */
export function duplicateGroups(): DupGroup[] {
  const adopted = allSkills().filter(
    (s) => s.central_path && fs.existsSync(s.central_path)
  );
  const byName = new Map<string, typeof adopted>();
  for (const s of adopted) {
    const arr = byName.get(s.name) ?? [];
    arr.push(s);
    byName.set(s.name, arr);
  }
  const groups: DupGroup[] = [];
  for (const [name, copies] of byName) {
    if (copies.length < 2) continue;
    groups.push({
      name,
      copies: copies
        .map((s) => {
          const dir = s.central_path as string;
          const { fileCount, sizeKb } = dirStats(dir);
          return {
            hash: s.content_hash,
            dir: path.basename(dir),
            path: dir,
            fileCount,
            sizeKb,
            createdAt: s.created_at,
            agentIds: targetsFor(s.content_hash)
              .filter((t) => fs.existsSync(t.target_path))
              .map((t) => t.agent_id),
          };
        })
        // Most complete first (more files), as a default-keep hint.
        .sort((a, b) => b.fileCount - a.fileCount || b.sizeKb - a.sizeKb),
    });
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Merge a duplicate group: keep one copy, re-point every agent using a dropped
 * copy to the kept one, then delete the dropped copies. Reversible per-agent
 * (re-pointing writes our managed target; remove() cleans the dropped library
 * copy).
 */
export function mergeDuplicates(keepHash: string, dropHashes: string[]): SkillRow {
  const keep = getSkill(keepHash);
  if (!keep?.central_path) throw new Error("保留的技能不在库中。");
  for (const dropHash of dropHashes) {
    if (dropHash === keepHash) continue;
    const agentIds = targetsFor(dropHash)
      .filter((t) => fs.existsSync(t.target_path))
      .map((t) => t.agent_id);
    for (const agentId of agentIds) {
      removeTarget(dropHash, agentId); // drop the old-version symlink/copy
      createTarget(keepHash, agentId); // re-point this agent at the kept version
    }
    remove(dropHash); // delete the dropped library copy + DB row
  }
  return findRow(keepHash);
}

/** Open a skill's library folder in the OS file manager (Finder on macOS). */
export function revealInFinder(hash: string): { path: string } {
  const rec = getSkill(hash);
  if (!rec?.central_path) throw new Error("技能不在库中。");
  if (!fs.existsSync(rec.central_path)) throw new Error("目录不存在。");
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "explorer"
        : "xdg-open";
  try {
    execFileSync(cmd, [rec.central_path], { timeout: 5000, stdio: "ignore" });
  } catch {
    // explorer/xdg-open can exit non-zero even on success — ignore.
  }
  return { path: rec.central_path };
}

/** Create a brand-new, self-authored skill in the library (parked). */
export function createSkill(input: {
  name: string;
  description?: string;
}): SkillRow {
  const slug = slugify(input.name);
  let dest = path.join(libraryDir(), slug);
  let n = 2;
  while (fs.existsSync(dest)) dest = path.join(libraryDir(), `${slug}-${n++}`);
  assertWritable(dest);
  fs.mkdirSync(dest, { recursive: true });
  const desc = input.description ?? "";
  const md = `---\nname: ${input.name}\ndescription: ${desc}\n---\n\n# ${input.name}\n\n${desc}\n`;
  fs.writeFileSync(path.join(dest, "SKILL.md"), md);

  const hash = hashDir(dest);
  upsertSkill({
    contentHash: hash,
    name: input.name,
    description: desc,
    centralPath: dest,
    provenance: "self-authored",
    enabled: true,
  });
  return findRow(hash);
}

export function setProvenance(hash: string, provenance: Provenance): SkillRow {
  setSkillFields(hash, { provenance });
  return findRow(hash);
}

export function setTags(hash: string, tags: string[]): SkillRow {
  const clean = [...new Set(tags.map((s) => s.trim()).filter(Boolean))].slice(0, 20);
  const rec = getSkill(hash);
  if (rec) {
    upsertSkill({
      contentHash: hash,
      name: rec.name,
      description: rec.description,
      tags: clean,
    });
  }
  return findRow(hash);
}

/**
 * Rename a skill SAFELY (vs. renaming the Finder folder, which breaks
 * central_path and dangles every agent symlink). Updates the SKILL.md `name:`,
 * moves the library folder to the clean new slug, re-keys the DB to the new
 * content hash, and re-points every agent that uses it.
 */
export function renameSkill(hash: string, newNameRaw: string): SkillRow {
  const rec = getSkill(hash);
  if (!rec?.central_path) throw new Error("技能不在库中。");
  const newName = newNameRaw.trim();
  if (!newName) throw new Error("名字不能为空。");
  const oldDir = rec.central_path;
  const metaName = readSkillMeta(oldDir).name;

  // No-op: already this name and the folder is already the clean slug.
  if (
    newName === rec.name &&
    newName === metaName &&
    path.basename(oldDir) === slugify(newName)
  ) {
    return findRow(hash);
  }

  // Detach every agent first — its link path is keyed on the OLD folder name.
  const agentIds = targetsFor(hash)
    .filter((t) => fs.existsSync(t.target_path))
    .map((t) => t.agent_id);
  for (const agentId of agentIds) removeTarget(hash, agentId);

  // Update the source of truth, then recompute identity.
  if (newName !== metaName) writeSkillName(oldDir, newName);
  const newHash = hashDir(oldDir);

  // Move the folder to the clean slug (libraryDestFor suffixes only on a real
  // collision with a *different* skill).
  const dest = libraryDestFor(newName, newHash);
  if (path.resolve(dest) !== path.resolve(oldDir)) {
    assertWritable(dest);
    fs.renameSync(oldDir, dest);
  }

  if (newHash !== hash) rekeySkill(hash, newHash);
  setSkillFields(newHash, { name: newName, centralPath: dest });

  // Re-attach every agent at the new folder name.
  for (const agentId of agentIds) createTarget(newHash, agentId);

  return findRow(newHash);
}

/* --------------------------------------------------------------------- *
 *  TAGS  (global management: usage list + rename/delete across all skills)
 * --------------------------------------------------------------------- */

export interface TagUsage {
  tag: string;
  count: number;
  skills: string[]; // names of skills carrying this tag (for the 查看 expand)
}

/**
 * Every tag, with the skills that carry it. Includes tags the user created in
 * the manager but hasn't applied yet (config.knownTags), shown with count 0.
 */
export function tagUsage(): TagUsage[] {
  const map = new Map<string, string[]>();
  for (const t of loadConfig().knownTags) map.set(t, []);
  for (const s of allSkills())
    for (const tg of safeJson(s.tags)) {
      const arr = map.get(tg) ?? [];
      arr.push(s.name);
      map.set(tg, arr);
    }
  return [...map.entries()]
    .map(([tag, skills]) => ({
      tag,
      count: skills.length,
      skills: skills.sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Register a tag without putting it on a skill yet (top-of-manager 新建标签). */
export function createTag(tag: string): { created: boolean } {
  const t = tag.trim();
  if (!t) return { created: false };
  const cfg = loadConfig();
  const onSkill = allSkills().some((s) => safeJson(s.tags).includes(t));
  if (cfg.knownTags.includes(t) || onSkill) return { created: false };
  saveConfig({ knownTags: [...cfg.knownTags, t] });
  return { created: true };
}

/** Drop a tag from the created-tags registry + the manual order (after rename/delete). */
function forgetKnownTag(...tags: string[]): void {
  const cfg = loadConfig();
  const drop = new Set(tags.map((t) => t.trim()));
  const patch: Partial<AppConfig> = {};
  const nextKnown = cfg.knownTags.filter((t) => !drop.has(t));
  if (nextKnown.length !== cfg.knownTags.length) patch.knownTags = nextKnown;
  const nextOrder = cfg.tagOrder.filter((t) => !drop.has(t));
  if (nextOrder.length !== cfg.tagOrder.length) patch.tagOrder = nextOrder;
  if (Object.keys(patch).length) saveConfig(patch);
}

/**
 * Persist the user's manual tag order (drives the manager's 自定义 sort and the
 * order of suggestions in the add-tag popup). Deduped + trimmed; stale entries
 * (tags that no longer exist) are simply ignored when ordering.
 */
export function setTagOrder(order: string[]): { order: string[] } {
  const clean = [...new Set(order.map((t) => t.trim()).filter(Boolean))];
  saveConfig({ tagOrder: clean });
  return { order: clean };
}

/**
 * Rename a tag across every skill that uses it (deduping if it merges into an
 * existing one). Also powers "合并到…" — merging A into B is just rename(A → B).
 */
export function renameTag(oldTag: string, newTag: string): { affected: number } {
  const o = oldTag.trim();
  const n = newTag.trim();
  if (!o || !n || o === n) return { affected: 0 };
  let affected = 0;
  for (const s of allSkills()) {
    const tags = safeJson(s.tags);
    if (!tags.includes(o)) continue;
    const next = [...new Set(tags.map((x) => (x === o ? n : x)))];
    upsertSkill({
      contentHash: s.content_hash,
      name: s.name,
      description: s.description,
      tags: next,
    });
    affected++;
  }
  // Keep config consistent: old name is gone; a renamed tag keeps its slot under
  // the new name. For the manual order, renaming in place preserves position —
  // but if n is ALREADY ordered (a merge A→B), drop A and keep B's slot.
  const cfg = loadConfig();
  const patch: Partial<AppConfig> = {};
  if (cfg.knownTags.includes(o)) {
    patch.knownTags = [...new Set(cfg.knownTags.filter((t) => t !== o).concat(n))];
  }
  if (cfg.tagOrder.includes(o)) {
    patch.tagOrder = cfg.tagOrder.includes(n)
      ? cfg.tagOrder.filter((t) => t !== o)
      : cfg.tagOrder.map((t) => (t === o ? n : t));
  }
  if (Object.keys(patch).length) saveConfig(patch);
  return { affected };
}

/** Remove a tag from every skill that has it (and from the registry). */
export function deleteTag(tag: string): { affected: number } {
  const tg = tag.trim();
  if (!tg) return { affected: 0 };
  let affected = 0;
  for (const s of allSkills()) {
    const tags = safeJson(s.tags);
    if (!tags.includes(tg)) continue;
    upsertSkill({
      contentHash: s.content_hash,
      name: s.name,
      description: s.description,
      tags: tags.filter((x) => x !== tg),
    });
    affected++;
  }
  forgetKnownTag(tg);
  return { affected };
}

/** Batch-delete tags (the toolbar 批量删除). */
export function deleteTags(tags: string[]): { affected: number } {
  let affected = 0;
  for (const t of tags) affected += deleteTag(t).affected;
  return { affected };
}

/* --------------------------------------------------------------------- *
 *  DETAIL  (read-only preview: SKILL.md content + file list, PRD §1 非目标
 *  excludes an EDITOR, not a viewer)
 * --------------------------------------------------------------------- */

export interface SkillDetail {
  name: string;
  description: string;
  provenance: Provenance;
  path: string | null;
  adopted: boolean;
  tags: string[];
  readme: string | null;
  readmeFile: string | null;
  files: { rel: string; size: number }[];
  occurrences: Occurrence[];
}

const DETAIL_IGNORE = new Set([".git", "node_modules", ".DS_Store"]);

function listFilesShallow(
  dir: string,
  rel = "",
  out: { rel: string; size: number }[] = [],
  depth = 0
): { rel: string; size: number }[] {
  if (out.length >= 300 || depth > 6) return out;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const d of entries) {
    if (DETAIL_IGNORE.has(d.name) || d.isSymbolicLink()) continue;
    const abs = path.join(dir, d.name);
    const childRel = rel ? `${rel}/${d.name}` : d.name;
    if (d.isDirectory()) {
      listFilesShallow(abs, childRel, out, depth + 1);
    } else if (d.isFile()) {
      let size = 0;
      try {
        size = fs.statSync(abs).size;
      } catch {
        /* ignore */
      }
      out.push({ rel: childRel, size });
    }
    if (out.length >= 300) break;
  }
  return out;
}

function readReadme(dir: string): { readme: string | null; readmeFile: string | null } {
  for (const f of ["SKILL.md", "skill.md", "README.md", "readme.md"]) {
    const p = path.join(dir, f);
    try {
      if (fs.statSync(p).isFile()) {
        const raw = fs.readFileSync(p, "utf8");
        return { readme: raw.slice(0, 60000), readmeFile: f };
      }
    } catch {
      /* keep looking */
    }
  }
  return { readme: null, readmeFile: null };
}

export function getSkillDetail(hash: string): SkillDetail {
  const row = buildOverview().find((r) => r.contentHash === hash);
  if (!row) throw new Error(`Skill ${hash} not found`);
  let realPath = row.centralPath;
  if (!realPath) {
    const occ = row.occurrences[0];
    realPath =
      occ?.kind.startsWith("symlink") && occ.linkTarget
        ? occ.linkTarget
        : occ?.foundPath ?? null;
  }
  const { readme, readmeFile } = realPath
    ? readReadme(realPath)
    : { readme: null, readmeFile: null };
  return {
    name: row.name,
    description: row.description,
    provenance: row.provenance,
    path: realPath,
    adopted: row.adopted,
    tags: row.tags,
    readme,
    readmeFile,
    files: realPath ? listFilesShallow(realPath) : [],
    occurrences: row.occurrences,
  };
}

/**
 * Set an agent's link mode (symlink/copy) override and re-materialize its
 * existing targets in the new mode — otherwise a copy-mode target would stay a
 * stale copy after switching to symlink. This is a manual OVERRIDE, not a probe:
 * confirming whether the agent's loader honors symlinks requires running it.
 */
export function setAgentLinkMode(agentId: string, mode: TargetMode): void {
  const cfg = loadConfig();
  const overrides = {
    ...cfg.overrides,
    [agentId]: { ...(cfg.overrides[agentId] ?? {}), linkMode: mode },
  };
  saveConfig({ overrides });
  // Rewrite every existing target for this agent that isn't already in the mode.
  for (const t of allTargets()) {
    if (t.agent_id === agentId && t.mode !== mode) {
      createTarget(t.content_hash, agentId); // reads the new mode via overrides
    }
  }
}

/**
 * Manually re-point an agent at a different skills dir (path RELATIVE to the
 * agent root). Fixes auto-detection that landed on the wrong place — e.g. Kimi
 * Code now keeps skills under ~/.kimi-code/skills, not the legacy ~/.kimi/skills.
 * An empty `dir` clears the override and reverts to the built-in default.
 *
 * This only re-points detection + where future skills are written. Skills
 * already distributed into the OLD dir are not moved — re-distribute from the
 * agent's workspace if you want them in the new location.
 */
export function setAgentSkillsDir(agentId: string, dir: string): void {
  const cfg = loadConfig();
  // Normalize to a clean, forward-slashed, relative path.
  const clean = dir
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+|\/+$/g, "");
  const prev = cfg.overrides[agentId] ?? {};
  let nextForAgent: Partial<AgentConfig>;
  if (clean) {
    nextForAgent = { ...prev, skillsDirs: [clean] };
  } else {
    // Clear only the skillsDirs override; keep any other (e.g. linkMode).
    const rest = { ...prev };
    delete rest.skillsDirs;
    nextForAgent = rest;
  }
  const overrides = { ...cfg.overrides, [agentId]: nextForAgent };
  // Drop the key entirely if nothing is left, to keep config.json tidy.
  if (Object.keys(nextForAgent).length === 0) delete overrides[agentId];
  saveConfig({ overrides });
}

/** The MCP config shapes we can parse — keep in sync with mcp.ts. */
const MCP_FORMATS: McpFormat[] = [
  "json-claude",
  "toml-codex",
  "json-gemini",
  "json-kimi",
  "json-openclaw-mcporter",
  "yaml-hermes",
];

/**
 * Manually re-point an agent's MCP config file (path RELATIVE to the agent root)
 * and pick which parser to use. Fixes auto-detection that pointed at the wrong
 * file — e.g. Kimi Code keeps MCP in ~/.kimi-code/config.toml, not the legacy
 * ~/.kimi/mcp.json. An empty `configPath` clears the override (reverts default).
 *
 * The MCP view is read-only, so this only changes WHERE we read from; it never
 * writes the agent's config.
 */
export function setAgentMcpConfig(
  agentId: string,
  configPath: string,
  format: string
): void {
  const cfg = loadConfig();
  const clean = configPath
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+|\/+$/g, "");
  const prev = cfg.overrides[agentId] ?? {};
  let nextForAgent: Partial<AgentConfig>;
  if (clean) {
    if (!MCP_FORMATS.includes(format as McpFormat))
      throw new Error(`Unknown MCP format: ${format}`);
    nextForAgent = {
      ...prev,
      mcpConfigPath: clean,
      mcpConfigFormat: format as McpFormat,
    };
  } else {
    const rest = { ...prev };
    delete rest.mcpConfigPath;
    delete rest.mcpConfigFormat;
    nextForAgent = rest;
  }
  const overrides = { ...cfg.overrides, [agentId]: nextForAgent };
  if (Object.keys(nextForAgent).length === 0) delete overrides[agentId];
  saveConfig({ overrides });
}

/**
 * Hide an agent (e.g. its app was uninstalled but a leftover skills dir keeps
 * it "detected"). Persisted in config; the UI filters ignored agents out of the
 * sidebar, the per-skill 用在 row, and distribution. Reversible via unignore.
 *
 * With cleanup: also remove the skills already distributed to it — our
 * symlinks/copies in its (now-dead) dir. Safe and reversible (re-distribute
 * after unignoring).
 */
export function ignoreAgent(
  agentId: string,
  opts: { cleanup?: boolean } = {}
): void {
  if (opts.cleanup) {
    for (const t of allTargets().filter((x) => x.agent_id === agentId))
      removeTarget(t.content_hash, agentId);
  }
  const cfg = loadConfig();
  if (!cfg.ignoredAgents.includes(agentId))
    saveConfig({ ignoredAgents: [...cfg.ignoredAgents, agentId] });
}

/** Un-hide an agent so it shows again (if its dir still exists). */
export function unignoreAgent(agentId: string): void {
  const cfg = loadConfig();
  saveConfig({
    ignoredAgents: cfg.ignoredAgents.filter((id) => id !== agentId),
  });
}

function findRow(hash: string): SkillRow {
  const row = buildOverview().find((r) => r.contentHash === hash);
  if (!row) throw new Error(`Skill ${hash} not found after operation`);
  return row;
}

export { detectAgents };
