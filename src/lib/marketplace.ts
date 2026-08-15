import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { libraryDir, dataDir, assertWritable } from "./config";
import { hashDir } from "./hash";
import { readSkillMeta } from "./skillmeta";
import {
  upsertSkill,
  setSkillFields,
  listFavorites,
  allSkills,
  getSkill,
  targetsFor,
  rekeySkill,
} from "./db";
import { createTarget, buildOverview, libraryDestFor } from "./library";
import { snapshotLibrary } from "./sync";
import type { Provenance, SkillRow } from "./types";

const execFileP = promisify(execFile);

export interface MarketSkill {
  id: string; // owner/repo/subpath
  name: string;
  description: string;
  author: string; // owner
  source: string; // owner/repo
  installs: number;
  gitUrl: string; // repo clone url
  subpath: string; // dir within repo holding SKILL.md ("" = repo root)
  category: string;
}

/**
 * Curated starter list shown if both registries are unreachable.
 */
const STARTER: MarketSkill[] = [
  {
    id: "anthropics/skills/document-skills",
    name: "skills (anthropics)",
    description: "Anthropic's official skills (pdf, xlsx, docx, pptx, …).",
    author: "anthropics",
    source: "anthropics/skills",
    installs: 0,
    gitUrl: "https://github.com/anthropics/skills",
    subpath: "",
    category: "official",
  },
  {
    id: "obra/superpowers/brainstorming",
    name: "brainstorming",
    description: "Explore intent and requirements before building.",
    author: "obra",
    source: "obra/superpowers",
    installs: 0,
    gitUrl: "https://github.com/obra/superpowers",
    subpath: "",
    category: "tools",
  },
];

/* --- skills.sh registry (primary) ------------------------------------- *
 *
 * skills.sh exposes a PUBLIC search API (no token) that returns install
 * counts — the popularity signal GitHub code search can't give us:
 *   GET https://skills.sh/api/search?q=<query>
 *   → { skills: [{ id, skillId, name, installs, source }], count }
 */

interface ShRecord {
  id?: string;
  skillId?: string;
  name?: string;
  installs?: number;
  source?: string; // owner/repo
}

function mapShRecord(r: ShRecord): MarketSkill | null {
  const source = (r.source ?? "").trim();
  const skillId = (r.skillId ?? r.name ?? "").trim();
  if (!source || !skillId) return null;
  return {
    id: r.id ?? `${source}/${skillId}`,
    name: r.name ?? skillId,
    description: "", // search API gives no description; card falls back to source
    author: source.split("/")[0] ?? "",
    source,
    installs: Number(r.installs ?? 0),
    gitUrl: `https://github.com/${source}`,
    subpath: "", // located at install time (findSkillDir by slug, handles monorepos)
    category: "",
  };
}

async function fetchSkillsSh(q: string): Promise<MarketSkill[]> {
  const res = await fetch(
    `https://skills.sh/api/search?q=${encodeURIComponent(q)}`,
    { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) throw new Error(`skills.sh HTTP ${res.status}`);
  const data = (await res.json()) as { skills?: ShRecord[] };
  const recs = Array.isArray(data?.skills) ? data.skills : [];
  const seen = new Set<string>();
  const out: MarketSkill[] = [];
  for (const r of recs) {
    const s = mapShRecord(r);
    if (s && !seen.has(s.id)) {
      seen.add(s.id);
      out.push(s);
    }
  }
  return out.sort((a, b) => b.installs - a.installs);
}

// Default "leaderboard" view: skills.sh has no empty-query/trending endpoint,
// so we merge a few broad seed queries and rank by installs.
const POPULAR_SEEDS = ["web", "ai", "code", "git", "design"];
async function popularBoard(): Promise<MarketSkill[]> {
  const lists = await Promise.all(
    POPULAR_SEEDS.map((s) => fetchSkillsSh(s).catch(() => [] as MarketSkill[]))
  );
  const byId = new Map<string, MarketSkill>();
  for (const list of lists) for (const s of list) if (!byId.has(s.id)) byId.set(s.id, s);
  return [...byId.values()].sort((a, b) => b.installs - a.installs).slice(0, 48);
}

/* --- GitHub code search (fallback) ------------------------------------ */

interface GhCodeHit {
  path?: string;
  repository?: { nameWithOwner?: string; url?: string; isPrivate?: boolean };
}

function hitToSkill(h: GhCodeHit): MarketSkill | null {
  const nameWithOwner = h.repository?.nameWithOwner ?? "";
  const url = h.repository?.url ?? "";
  if (!nameWithOwner || !url || !h.path) return null;
  const owner = nameWithOwner.split("/")[0] ?? "";
  const repoName = nameWithOwner.split("/")[1] ?? "";
  const dir = h.path.includes("/")
    ? h.path.slice(0, h.path.lastIndexOf("/"))
    : "";
  const name = dir ? dir.slice(dir.lastIndexOf("/") + 1) : repoName;
  return {
    id: `${nameWithOwner}/${dir || "."}`,
    name,
    description: `${nameWithOwner}${dir ? " · " + dir : ""}`,
    author: owner,
    source: nameWithOwner,
    installs: 0,
    gitUrl: url,
    subpath: dir,
    category: "",
  };
}

function isRateLimit(e: unknown): boolean {
  const err = e as { stderr?: Buffer | string; message?: string };
  const msg = `${err.stderr ?? ""} ${err.message ?? ""}`;
  return /rate limit|secondary rate|too many request|HTTP 403|HTTP 429/i.test(msg);
}

function githubSearch(q: string): MarketSkill[] {
  const raw = execFileSync(
    "gh",
    [
      "search",
      "code",
      "--filename=SKILL.md",
      q,
      "--limit=40",
      "--json",
      "repository,path",
    ],
    { encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "pipe"] }
  );
  const hits = JSON.parse(raw) as GhCodeHit[];
  const seen = new Set<string>();
  const skills: MarketSkill[] = [];
  for (const h of hits) {
    if (h.repository?.isPrivate) continue;
    const s = hitToSkill(h);
    if (s && !seen.has(s.id)) {
      seen.add(s.id);
      skills.push(s);
    }
  }
  return skills;
}

/* --- browse (cached: skills.sh → gh fallback) ------------------------- */

export type MarketSource = "skillssh" | "github" | "starter" | "ratelimited";

export interface BrowseResult {
  skills: MarketSkill[];
  favorites: string[];
  source: MarketSource;
}

const cache = new Map<string, { at: number; skills: MarketSkill[]; source: MarketSource }>();
const CACHE_TTL = 10 * 60 * 1000;
const POPULAR_KEY = "__popular__";

function fresh(at: number): boolean {
  return Date.now() - at < CACHE_TTL;
}

export async function browseMarketplace(query: string): Promise<BrowseResult> {
  const q = query.trim();
  const favorites = listFavorites();

  // Default view → install-ranked leaderboard from skills.sh.
  if (q.length < 2) {
    const c = cache.get(POPULAR_KEY);
    if (c && fresh(c.at)) return { skills: c.skills, favorites, source: c.source };
    try {
      const skills = await popularBoard();
      if (skills.length) {
        cache.set(POPULAR_KEY, { at: Date.now(), skills, source: "skillssh" });
        return { skills, favorites, source: "skillssh" };
      }
    } catch {
      /* fall through to starter */
    }
    return { skills: STARTER, favorites, source: "starter" };
  }

  const key = q.toLowerCase();
  const c = cache.get(key);
  if (c && fresh(c.at)) return { skills: c.skills, favorites, source: c.source };

  // Primary: skills.sh (download counts, no rate limit).
  try {
    const skills = await fetchSkillsSh(q);
    if (skills.length) {
      cache.set(key, { at: Date.now(), skills, source: "skillssh" });
      return { skills, favorites, source: "skillssh" };
    }
  } catch {
    /* fall through to gh */
  }

  // Fallback: GitHub code search via gh.
  try {
    const skills = githubSearch(q);
    cache.set(key, { at: Date.now(), skills, source: "github" });
    return { skills, favorites, source: "github" };
  } catch (e) {
    if (c) return { skills: c.skills, favorites, source: c.source }; // serve stale
    if (isRateLimit(e)) return { skills: [], favorites, source: "ratelimited" };
    const ql = key;
    return {
      skills: STARTER.filter(
        (s) =>
          s.name.toLowerCase().includes(ql) || s.author.toLowerCase().includes(ql)
      ),
      favorites,
      source: "starter",
    };
  }
}

/* --- install: one shared finalizer for clone / git / local ------------ */

/**
 * Locate the actual skill directory inside a tree. Skills live at the root,
 * or in a named subdir (monorepo like obra/superpowers → skills/<slug>). We
 * prefer a dir matching the slug that has a SKILL.md (deterministic), then a
 * dir whose SKILL.md frontmatter name matches, then any dir with one.
 */
export function findSkillDir(cloneRoot: string, slug: string): string {
  const hasSkillMd = (d: string) =>
    fs.existsSync(path.join(d, "SKILL.md")) ||
    fs.existsSync(path.join(d, "skill.md"));

  for (const cand of [
    path.join(cloneRoot, slug),
    path.join(cloneRoot, "skills", slug),
    // Repos that ship skills as a ready-made agent dir (.claude/skills/<name>).
    // The generic walk below skips dot-dirs (it must — .git), so this well-
    // known dotted location needs an explicit candidate.
    path.join(cloneRoot, ".claude", "skills", slug),
  ]) {
    if (fs.existsSync(cand) && hasSkillMd(cand)) return cand;
  }
  if (hasSkillMd(cloneRoot)) return cloneRoot;

  // Shallow walk: prefer dir named slug, then SKILL.md whose `name:` == slug,
  // else the first dir with a SKILL.md.
  let byName: string | null = null;
  let firstWithMd: string | null = null;
  const walk = (dir: string, depth: number) => {
    if (depth > 3 || byName) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith(".") || e.name === "node_modules")
        continue;
      const abs = path.join(dir, e.name);
      if (hasSkillMd(abs)) {
        if (e.name === slug) {
          byName = abs;
          return;
        }
        if (!firstWithMd) firstWithMd = abs;
        // Slugify the frontmatter name so "My Skill" matches slug "my-skill" —
        // same criteria dirMatchesSkill uses; keeping them identical means a
        // positive find here always passes the pre-update guard.
        if (!byName && slugOf(readSkillMeta(abs).name) === slug) byName = abs;
      }
      walk(abs, depth + 1);
    }
  };
  walk(cloneRoot, 0);
  return byName ?? firstWithMd ?? cloneRoot;
}

/**
 * Is `dir` confidently THE skill identified by `slug`? findSkillDir always
 * returns *something* (a sibling skill's dir, or the clone root) even when it
 * can't actually find the skill — so before a destructive in-place update we
 * require a real identity match, not merely the presence of a SKILL.md. Uses
 * the same name/slug criteria findSkillDir uses for a positive hit.
 */
export function dirMatchesSkill(dir: string, slug: string): boolean {
  const hasMd =
    fs.existsSync(path.join(dir, "SKILL.md")) ||
    fs.existsSync(path.join(dir, "skill.md"));
  if (!hasMd) return false;
  return path.basename(dir) === slug || slugOf(readSkillMeta(dir).name) === slug;
}

/** Copy a located skill dir into the central library + register it. */
function adoptDirIntoLibrary(
  skillDir: string,
  opts: {
    nameHint?: string;
    descHint?: string;
    gitUrl?: string;
    sourceSubdir?: string;
    provenance?: Provenance;
    agentIds?: string[];
  }
): SkillRow {
  const meta = readSkillMeta(skillDir);
  const name = meta.name || opts.nameHint || path.basename(skillDir);
  const dest = libraryDestFor(name, hashDir(skillDir));
  assertWritable(dest);
  if (!fs.existsSync(dest)) {
    fs.cpSync(skillDir, dest, { recursive: true, dereference: true });
  }
  fs.rmSync(path.join(dest, ".git"), { recursive: true, force: true });

  const hash = hashDir(dest);
  upsertSkill({
    contentHash: hash,
    name,
    description: meta.description || opts.descHint || "",
    centralPath: dest,
    provenance: opts.provenance ?? "downloaded",
    gitUrl: opts.gitUrl,
    sourceSubdir: opts.sourceSubdir,
    enabled: true,
  });
  for (const agentId of opts.agentIds ?? []) createTarget(hash, agentId);

  const row = buildOverview().find((r) => r.contentHash === hash);
  if (!row) throw new Error("Installed skill not found after install");
  return row;
}

/**
 * Clone just enough of a repo to work with its skills. A naive full clone
 * breaks on media-heavy monorepos (heygen-com/hyperframes is ~330 MB — the
 * clone times out and every suite skill reports a check error), so: blobless
 * clone with no checkout (tree metadata only, a few MB), locate every
 * SKILL.md-bearing dir from the tree listing, sparse-checkout only those.
 * A repo whose skill IS the root (SKILL.md at top level) gets a full checkout
 * — its whole tree is the skill's content. Local-path remotes (tests) ignore
 * the blob filter with a warning and still work.
 */
/**
 * Only ever clone plain http(s) URLs. This rejects git's local-exec transports
 * (`ext::`, `file://`, `-`-prefixed option injection, ssh, git://) so a crafted
 * `gitUrl` from an API caller can't run arbitrary commands on the host.
 */
export function assertSafeCloneUrl(gitUrl: string): void {
  if (typeof gitUrl !== "string" || !/^https?:\/\/[^\s]+$/i.test(gitUrl)) {
    throw new Error(`Refusing to clone unsafe URL: ${gitUrl}`);
  }
}

async function withClone<T>(
  gitUrl: string,
  fn: (tmpRoot: string) => T | Promise<T>
): Promise<T> {
  assertSafeCloneUrl(gitUrl);
  const tmpRoot = path.join(
    dataDir(),
    ".clone-tmp",
    `c-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  );
  assertWritable(tmpRoot);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(tmpRoot), { recursive: true });
  // Keep bytes identical to what the library repo commits (LF), so content
  // hashes match across machines; allow long paths for deep monorepos on Windows.
  const HARDEN = [
    "-c",
    "protocol.ext.allow=never",
    "-c",
    "protocol.file.allow=never",
    "-c",
    "core.autocrlf=false",
    "-c",
    "core.longpaths=true",
  ];
  // Async: cloning/checkout hit the network and can take many seconds. Running
  // them synchronously would block Node's event loop, freezing every other
  // request (and browser tab) for the whole clone. execFileP yields instead.
  const inRepo = async (args: string[], timeout: number) =>
    (
      await execFileP("git", ["-C", tmpRoot, ...HARDEN, ...args], {
        encoding: "utf8",
        timeout,
        maxBuffer: 64 * 1024 * 1024,
      })
    ).stdout;
  try {
    await execFileP(
      "git",
      [
        ...HARDEN,
        "clone",
        "--depth",
        "1",
        "--filter=blob:none",
        "--no-checkout",
        "--",
        gitUrl,
        tmpRoot,
      ],
      { timeout: 90000, maxBuffer: 64 * 1024 * 1024 }
    );
    const paths = (await inRepo(["ls-tree", "-r", "--name-only", "HEAD"], 60000))
      .split("\n")
      .filter(Boolean);
    const rootIsSkill = paths.includes("SKILL.md") || paths.includes("skill.md");
    const skillDirs = [
      ...new Set(
        paths
          .filter((p) => /(^|\/)(SKILL|skill)\.md$/.test(p))
          .map((p) => path.dirname(p))
          .filter((d) => d !== ".")
      ),
    ];
    if (!rootIsSkill && skillDirs.length) {
      await inRepo(["sparse-checkout", "set", "--cone", ...skillDirs], 60000);
    }
    // Materialize (fetches only the needed blobs when sparse).
    await inRepo(["checkout", "HEAD"], 180000);
    return await fn(tmpRoot);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("Git isn't installed (or isn't on PATH). Install Git to install skills from a repo.");
    }
    throw e;
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

/** Install from a marketplace record (clone the repo, extract the skill). */
export function installFromMarket(
  market: MarketSkill,
  agentIds: string[]
): Promise<SkillRow> {
  const slug = slugOf(market.name);
  return withClone(market.gitUrl, (tmpRoot) => {
    let skillDir = market.subpath ? path.join(tmpRoot, market.subpath) : tmpRoot;
    if (
      !fs.existsSync(path.join(skillDir, "SKILL.md")) &&
      !fs.existsSync(path.join(skillDir, "skill.md"))
    ) {
      skillDir = findSkillDir(tmpRoot, slug);
    }
    return adoptDirIntoLibrary(skillDir, {
      nameHint: market.name,
      descHint: market.description,
      gitUrl: market.gitUrl,
      sourceSubdir: path.relative(tmpRoot, skillDir).split(path.sep).join("/"),
      agentIds,
    });
  });
}

/**
 * Git install: user pastes `owner/repo`, `owner/repo/sub/path`, or a git URL.
 * Clones and installs the skill at the subpath (or the repo's primary skill).
 */
export function installFromRef(ref: string, agentIds: string[]): Promise<SkillRow> {
  const input = ref.trim().replace(/^['"]|['"]$/g, "");
  let owner = "";
  let repo = "";
  let subpath = "";
  // Full GitHub URL, optionally .../tree|blob/<branch>/<subpath>.
  const urlM = input.match(
    /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?(?:\/(?:tree|blob)\/[^/]+\/(.+?))?\/?$/i
  );
  if (urlM) {
    owner = urlM[1];
    repo = urlM[2];
    subpath = (urlM[3] ?? "").replace(/\/+$/, "");
  } else {
    // Bare form: owner/repo or owner/repo/<subpath>.
    const segs = input.split("/").filter(Boolean);
    if (segs.length >= 2) {
      owner = segs[0];
      repo = segs[1].replace(/\.git$/, "");
      subpath = segs.slice(2).join("/");
    }
  }
  if (!owner || !repo) throw new Error("Enter a valid owner/repo or git URL.");
  const repoFull = `${owner}/${repo}`;
  const gitUrl = `https://github.com/${repoFull}`;
  const name = subpath ? path.basename(subpath) : repo;
  return installFromMarket(
    {
      id: `${repoFull}/${subpath || "."}`,
      name,
      description: "",
      author: owner,
      source: repoFull,
      installs: 0,
      gitUrl,
      subpath,
      category: "",
    },
    agentIds
  );
}

/**
 * Extract a .zip/.skill archive into `dest`, cross-platform. `unzip` isn't on
 * Windows and `tar` (bsdtar) can't read zips on GNU/Linux, so try both: unzip
 * first (Linux/macOS), then tar (Windows/macOS). Afterwards verify nothing
 * escaped `dest` (zip-slip guard), since we no longer rely on unzip's sanitizer.
 */
function extractArchive(src: string, dest: string): void {
  const attempts: Array<[string, string[]]> = [
    ["unzip", ["-q", "-o", src, "-d", dest]],
    ["tar", ["-xf", src, "-C", dest]],
  ];
  let lastErr: unknown;
  let ok = false;
  for (const [cmd, args] of attempts) {
    try {
      execFileSync(cmd, args, { timeout: 60000, stdio: "pipe" });
      ok = true;
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!ok) {
    throw new Error(
      "Couldn't extract the archive. Please install `unzip` or `tar`, or point at an unzipped folder instead."
    );
  }
  // Zip-slip guard: every extracted path must resolve to inside `dest`.
  const root = fs.realpathSync(dest);
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      const real = fs.realpathSync(p);
      if (real !== root && !real.startsWith(root + path.sep)) {
        throw new Error("Archive contains an unsafe path; extraction aborted.");
      }
      if (e.isDirectory()) walk(p);
    }
  };
  walk(root);
}

/**
 * Local install: a folder or a `.zip`/`.skill` archive on disk. With batch,
 * imports every skill dir found; otherwise just the primary one.
 */
export function installFromLocal(
  localPath: string,
  agentIds: string[],
  opts: { batch?: boolean } = {}
): { installed: number; failed: { dir: string; error: string }[] } {
  const src = expandHome(localPath.trim().replace(/^['"]|['"]$/g, ""));
  if (!src || !fs.existsSync(src)) throw new Error(`Path does not exist: ${src}`);

  const isArchive = /\.(zip|skill)$/i.test(src);
  let workRoot = src;
  let cleanup: string | null = null;
  if (isArchive) {
    const tmp = path.join(
      dataDir(),
      ".local-tmp",
      `z-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    );
    assertWritable(tmp);
    fs.mkdirSync(tmp, { recursive: true });
    extractArchive(src, tmp);
    workRoot = tmp;
    cleanup = tmp;
  } else if (!fs.statSync(src).isDirectory()) {
    throw new Error("Only a folder or a .zip / .skill file is supported.");
  }

  try {
    const dirs = collectSkillDirs(workRoot, !!opts.batch);
    if (!dirs.length) throw new Error("No skill folder containing a SKILL.md was found.");
    const failed: { dir: string; error: string }[] = [];
    let installed = 0;
    for (const d of dirs) {
      try {
        adoptDirIntoLibrary(d, { provenance: "downloaded", agentIds });
        installed++;
      } catch (e) {
        failed.push({ dir: d, error: (e as Error).message });
      }
    }
    return { installed, failed };
  } finally {
    if (cleanup) fs.rmSync(cleanup, { recursive: true, force: true });
  }
}

function collectSkillDirs(root: string, batch: boolean): string[] {
  const has = (d: string) =>
    fs.existsSync(path.join(d, "SKILL.md")) ||
    fs.existsSync(path.join(d, "skill.md"));
  if (has(root)) return [root];

  const childDirs = (d: string): string[] => {
    try {
      return fs
        .readdirSync(d, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .map((e) => path.join(d, e.name));
    } catch {
      return [];
    }
  };

  let kids = childDirs(root).filter(has);
  if (!kids.length) {
    const subs = childDirs(root);
    // Archives often wrap everything in one top folder — descend once.
    if (subs.length === 1) return collectSkillDirs(subs[0], batch);
    for (const s of subs) kids.push(...childDirs(s).filter(has));
  }
  return batch ? kids : kids.slice(0, 1);
}

function slugOf(name: string): string {
  return (name || "skill").replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
}

function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

/* --- update checking (mirror CC Switch: source repo + content-hash) ---- *
 *
 * A library skill's "source" is ONLY its recorded git_url. We do not guess a
 * source by name (see resolveSource) — that mis-attributed source-less skills
 * to unrelated repos and clobbered them. To check for an update we shallow-
 * clone the repo, locate the skill dir, hash it, and compare to the local
 * content_hash; skills with no git_url are simply not update-eligible. Updating
 * replaces the library copy in place (same dir → symlinks stay valid) and
 * re-keys the DB to the new hash, after snapshotting the library to git.
 */

export interface SkillSource {
  repoFull: string;
  gitUrl: string;
}

/**
 * A skill's update source is its EXPLICITLY recorded git_url — nothing else.
 *
 * We deliberately do NOT fall back to a skills.sh name search here. skills.sh
 * is a *semantic* search that always returns something, so a source-less or
 * locally-authored skill (git_url = null) would get matched to an unrelated
 * repo, then its content compared against that repo — producing a false "有更新"
 * badge and, if the user clicked 更新, a destructive overwrite with a totally
 * different skill's files. No recorded source ⇒ not update-eligible.
 */
export function resolveSource(gitUrl: string | null): SkillSource | null {
  if (gitUrl) {
    const m = gitUrl.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
    if (m) return { repoFull: `${m[1]}/${m[2]}`, gitUrl };
  }
  return null;
}

function normalizeSourceSubdir(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/+$/, "");
}

/** Resolve an explicitly recorded provider path, or use legacy name lookup. */
export function sourceSkillDir(
  cloneRoot: string,
  slug: string,
  sourceSubdir: string | null | undefined
): string {
  const subdir = normalizeSourceSubdir(sourceSubdir);
  let dir: string;
  if (subdir) {
    dir = path.resolve(cloneRoot, subdir);
    const rel = path.relative(path.resolve(cloneRoot), dir);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error("The source folder must stay inside its GitHub repository.");
    }
  } else {
    dir = findSkillDir(cloneRoot, slug);
  }
  if (!dirMatchesSkill(dir, slug)) {
    throw new Error(
      subdir
        ? `The recorded source folder (${subdir}) is missing or belongs to a different skill.`
        : "Couldn't locate this skill's folder in its source repo (it may have been renamed)."
    );
  }
  return dir;
}

export type UpdateStatus = "update" | "current" | "no-source" | "error";

export interface UpdateInfo {
  hash: string;
  name: string;
  source: string | null; // owner/repo we'd update from
  hasUpdate: boolean;
  status: UpdateStatus;
  error?: string;
}

/** Check every adopted skill for an upstream update. Clones each repo once. */
export async function checkAllUpdates(): Promise<UpdateInfo[]> {
  const skills = allSkills().filter(
    (s) => s.central_path && fs.existsSync(s.central_path)
  );
  const out: UpdateInfo[] = [];
  // Resolve sources, then group by repo so each repo is cloned only once.
  const byRepo = new Map<
    string,
    {
      gitUrl: string;
      items: { hash: string; name: string; slug: string; sourceSubdir: string | null }[];
    }
  >();
  for (const s of skills) {
    const src = resolveSource(s.git_url);
    if (!src) {
      out.push({
        hash: s.content_hash,
        name: s.name,
        source: null,
        hasUpdate: false,
        status: "no-source",
      });
      continue;
    }
    const g = byRepo.get(src.repoFull) ?? { gitUrl: src.gitUrl, items: [] };
    g.items.push({
      hash: s.content_hash,
      name: s.name,
      slug: slugOf(s.name),
      sourceSubdir: s.source_subdir,
    });
    byRepo.set(src.repoFull, g);
  }
  for (const [repoFull, g] of byRepo) {
    try {
      await withClone(g.gitUrl, (tmp) => {
        for (const it of g.items) {
          try {
            // Same identity guard as updateSkill: findSkillDir always returns
            // SOMETHING (a sibling skill, or the clone root), and hashing the
            // wrong dir manufactures a permanent false "有更新" badge that the
            // guarded update then refuses to apply. Not located ⇒ say so.
            const dir = sourceSkillDir(tmp, it.slug, it.sourceSubdir);
            const upstreamHash = hashDir(dir);
            const hasUpdate = upstreamHash !== it.hash;
            out.push({
              hash: it.hash,
              name: it.name,
              source: repoFull,
              hasUpdate,
              status: hasUpdate ? "update" : "current",
            });
          } catch (e) {
            out.push({
              hash: it.hash,
              name: it.name,
              source: repoFull,
              hasUpdate: false,
              status: "error",
              error: (e as Error).message,
            });
          }
        }
      });
    } catch (e) {
      for (const it of g.items)
        out.push({
          hash: it.hash,
          name: it.name,
          source: repoFull,
          hasUpdate: false,
          status: "error",
          error: (e as Error).message,
        });
    }
  }
  return out;
}

/** Verify and persist a source repo + exact provider folder for future updates. */
export async function linkSkillSource(
  hash: string,
  gitUrl: string,
  sourceSubdir = ""
): Promise<{ source: string; sourceSubdir: string; hasUpdate: boolean }> {
  const rec = getSkill(hash);
  if (!rec?.central_path) throw new Error("The skill is not in the library.");
  assertSafeCloneUrl(gitUrl);
  const src = resolveSource(gitUrl);
  if (!src) throw new Error("Enter a GitHub repository URL.");
  const normalized = normalizeSourceSubdir(sourceSubdir);
  return withClone(src.gitUrl, (tmp) => {
    const dir = sourceSkillDir(tmp, slugOf(rec.name), normalized);
    const hasUpdate = hashDir(dir) !== hashDir(rec.central_path as string);
    setSkillFields(hash, {
      gitUrl: src.gitUrl.replace(/\.git$/i, ""),
      sourceSubdir: normalized || null,
    });
    return { source: src.repoFull, sourceSubdir: normalized, hasUpdate };
  });
}

/** Pull the upstream version into the library in place (replace, re-key). */
export async function updateSkill(
  hash: string
): Promise<{ updated: boolean; newHash?: string; source?: string }> {
  const rec = getSkill(hash);
  if (!rec?.central_path) throw new Error("The skill is not in the library.");
  const src = resolveSource(rec.git_url);
  if (!src)
    throw new Error(
      "This skill has no recorded source (git_url), so it can't be updated. Link it to a GitHub repo first."
    );
  return withClone(src.gitUrl, (tmp) => {
    const slug = slugOf(rec.name);
    const dir = sourceSkillDir(tmp, slug, rec.source_subdir);
    // Safety: only overwrite when the located dir is CONFIDENTLY the skill we're
    // updating. When findSkillDir can't match by name it falls back to the first
    // SKILL.md-bearing dir (a *sibling* skill) or the clone root — overwriting
    // from either would replace this skill with a different one (the clobber
    // bug). A SKILL.md alone isn't enough (a sibling has one too).
    if (hashDir(dir) === hash) return { updated: false, source: src.repoFull };
    const dest = rec.central_path as string;
    assertWritable(dest);
    // Snapshot this skill to git before replacing its files, so a bad update is
    // always one "restore" away without capturing edits from unrelated skills.
    snapshotLibrary(`before update: ${rec.name}`, [dest]);
    // Replace contents in place — keep the dir name so symlink targets stay valid.
    for (const e of fs.readdirSync(dest)) {
      fs.rmSync(path.join(dest, e), { recursive: true, force: true });
    }
    fs.cpSync(dir, dest, { recursive: true, dereference: true });
    fs.rmSync(path.join(dest, ".git"), { recursive: true, force: true });
    const newHash = hashDir(dest);
    rekeySkill(hash, newHash);
    // Symlink targets point to the (unchanged) dir; copy-mode targets are stale.
    for (const t of targetsFor(newHash)) {
      if (t.mode === "copy") createTarget(newHash, t.agent_id);
    }
    return { updated: true, newHash, source: src.repoFull };
  });
}
