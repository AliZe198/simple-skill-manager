import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { libraryDir, ensureDataDir } from "./config";
import { hashDir } from "./hash";
import {
  allSkills,
  upsertSkill,
  deleteSkill,
  targetsFor,
  deleteTarget,
} from "./db";
import type { Provenance } from "./types";

/**
 * GitHub backup & cross-machine sync.
 *
 * The git repo root is the LIBRARY dir (not the data dir) — so ssm.db (which
 * holds machine-specific `targets`) and config.json live OUTSIDE the repo and
 * never sync. A defensive .gitignore inside the library is a second guard.
 *
 * What syncs: the skill files + manifest.json (portable metadata: contentHash,
 * name, description, provenance, gitUrl, tags, favorited). What does NOT sync:
 * which agent has which skill (targets) — that's decided per machine.
 *
 * contentHash must be identical across Mac/Windows for identity to hold, so we
 * force eol=lf via .gitattributes and treat manifest.contentHash as a canary
 * (recompute locally on import; warn on mismatch).
 */

const GITATTRIBUTES = "* text=auto eol=lf\n";
const LIB_GITIGNORE = [
  "# never back up secrets or local DB into the skills repo",
  ".env",
  ".env.*",
  "*.key",
  "*.pem",
  "*.secret",
  "*.db",
  ".DS_Store",
  "node_modules/",
  "",
].join("\n");
const MANIFEST = "manifest.json";
const GIT_ID = ["-c", "user.name=Skill Manager", "-c", "user.email=ssm@local"];

function git(args: string[], opts: { allowFail?: boolean } = {}): string {
  try {
    return execFileSync("git", [...GIT_ID, ...args], {
      cwd: libraryDir(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120000,
    }).trim();
  } catch (e) {
    if (opts.allowFail) return "";
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("Git isn't installed (or isn't on PATH). Install Git and try again.");
    }
    const err = e as { stderr?: Buffer | string; message?: string };
    const msg = err.stderr ? err.stderr.toString() : err.message ?? "git failed";
    throw new Error(msg.trim());
  }
}

function gh(args: string[], opts: { allowFail?: boolean } = {}): string {
  try {
    return execFileSync("gh", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120000,
    }).trim();
  } catch (e) {
    if (opts.allowFail) return "";
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        "The GitHub CLI (gh) isn't installed. Install it from https://cli.github.com to use GitHub backup."
      );
    }
    const err = e as { stderr?: Buffer | string; message?: string };
    const msg = err.stderr ? err.stderr.toString() : err.message ?? "gh failed";
    throw new Error(msg.trim());
  }
}

function ghAuthed(): boolean {
  return gh(["auth", "status"], { allowFail: true }) !== "";
}

/* --- OAuth-like browser login via `gh auth login --web` --------------- *
 *
 * `gh` is itself a registered GitHub OAuth app, so we get the full device
 * flow for free with zero infrastructure to own. We spawn it, scrape the
 * one-time code + verification URL it prints, surface those in the UI, and
 * let the user authorize in their browser. gh keeps polling in the
 * background; we detect success by re-checking `gh auth status` (the real
 * goal state) — not by the child's exit code.
 *
 * The server is a single long-lived `next start` process, so a module-level
 * singleton holds the running child across the start→poll→finish requests.
 */

interface GhLogin {
  child: ChildProcess;
  code: string | null;
  verificationUrl: string;
  status: "pending" | "success" | "error";
  error?: string;
  startedAt: number;
}

let _ghLogin: GhLogin | null = null;

const DEVICE_URL = "https://github.com/login/device";
const CODE_RE = /one-time code:\s*([A-Z0-9-]{6,})/i;

export interface GhLoginState {
  code: string | null;
  verificationUrl: string;
  status: "pending" | "success" | "error";
  error?: string;
  ghReady: boolean;
}

/** Kill any running login child (new attempt, or explicit cancel). */
function killGhLogin(): void {
  if (_ghLogin && _ghLogin.status === "pending") {
    try {
      _ghLogin.child.kill();
    } catch {
      /* already gone */
    }
  }
}

/**
 * Start the browser login. Spawns gh, waits until it prints the one-time
 * code (or a short timeout), and returns the code + URL for the UI to show.
 */
export function ghLoginStart(): Promise<GhLoginState> {
  if (ghAuthed()) {
    return Promise.resolve({
      code: null,
      verificationUrl: DEVICE_URL,
      status: "success",
      ghReady: true,
    });
  }
  killGhLogin();

  const child = spawn(
    "gh",
    ["auth", "login", "--web", "--git-protocol", "https", "--hostname", "github.com"],
    { stdio: ["pipe", "pipe", "pipe"], env: process.env }
  );
  // gh may wait on a stdin prompt; sending a newline lets it proceed without a TTY.
  try {
    child.stdin?.write("\n");
  } catch {
    /* ignore */
  }
  const session: GhLogin = {
    child,
    code: null,
    verificationUrl: DEVICE_URL,
    status: "pending",
    startedAt: Date.now(),
  };
  _ghLogin = session;

  // The code is printed on either stdout or stderr depending on gh's TTY
  // detection — listen to both.
  const onData = (buf: Buffer) => {
    const text = buf.toString();
    const m = text.match(CODE_RE);
    if (m && !session.code) session.code = m[1].toUpperCase();
  };
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);

  child.on("error", (e) => {
    session.status = "error";
    session.error = (e as Error).message;
  });
  child.on("exit", () => {
    // Don't trust the exit code — re-check the real goal state.
    if (session.status === "pending")
      session.status = ghAuthed() ? "success" : "error";
    if (session.status === "error" && !session.error)
      session.error = "GitHub login didn't finish or has expired. Please try again.";
  });

  // Resolve once we have the code, or after a short grace period.
  return new Promise<GhLoginState>((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (session.code || session.status !== "pending" || Date.now() - started > 8000) {
        resolve(ghLoginStatus());
        return;
      }
      setTimeout(tick, 150);
    };
    tick();
  });
}

/** Poll the in-progress login. Flips to success once a token exists. */
export function ghLoginStatus(): GhLoginState {
  const s = _ghLogin;
  if (!s) {
    const ready = ghAuthed();
    return {
      code: null,
      verificationUrl: DEVICE_URL,
      status: ready ? "success" : "error",
      ghReady: ready,
    };
  }
  // The token may land before the child object notices; check the goal state.
  if (s.status === "pending" && ghAuthed()) s.status = "success";
  return {
    code: s.code,
    verificationUrl: s.verificationUrl,
    status: s.status,
    error: s.error,
    ghReady: ghAuthed(),
  };
}

/** User abandoned the flow — stop the background gh process. */
export function ghLoginCancel(): GhLoginState {
  killGhLogin();
  _ghLogin = null;
  return ghLoginStatus();
}

function isGitRepo(): boolean {
  return fs.existsSync(path.join(libraryDir(), ".git"));
}

function remoteUrl(): string | null {
  if (!isGitRepo()) return null;
  const url = git(["remote", "get-url", "origin"], { allowFail: true });
  return url || null;
}

function lastCommitIso(): string | null {
  if (!isGitRepo()) return null;
  const v = git(["log", "-1", "--format=%cI"], { allowFail: true });
  return v || null;
}

/** Skill dirs in the library (excludes manifest, dotfiles). */
function librarySkillDirs(): string[] {
  ensureDataDir();
  try {
    return fs
      .readdirSync(libraryDir(), { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name);
  } catch {
    return [];
  }
}

export interface SyncStatus {
  connected: boolean;
  remoteUrl: string | null;
  lastSync: string | null;
  skillCount: number;
  ghReady: boolean;
}

export function syncStatus(): SyncStatus {
  const ghReady = ghAuthed();
  return {
    connected: isGitRepo() && !!remoteUrl(),
    remoteUrl: remoteUrl(),
    lastSync: lastCommitIso(),
    skillCount: librarySkillDirs().length,
    ghReady,
  };
}

/* --- manifest --------------------------------------------------------- */

interface ManifestEntry {
  dir: string;
  contentHash: string;
  name: string;
  description: string;
  provenance: Provenance;
  gitUrl?: string;
  tags: string[];
  /** Legacy (pre-cleanup manifests carry it); ignored on import. */
  favorited?: boolean;
}

function writeManifest(): void {
  const skills = allSkills().filter((s) => s.central_path);
  const entries: ManifestEntry[] = skills.map((s) => ({
    dir: path.basename(s.central_path as string),
    contentHash: s.content_hash,
    name: s.name,
    description: s.description,
    provenance: s.provenance,
    gitUrl: s.git_url ?? undefined,
    tags: safeTags(s.tags),
  }));
  fs.writeFileSync(
    path.join(libraryDir(), MANIFEST),
    JSON.stringify({ version: 1, skills: entries }, null, 2)
  );
}

function safeTags(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Import manifest metadata into the local DB after a pull/clone. */
export function importManifest(): { imported: number; mismatches: string[] } {
  const p = path.join(libraryDir(), MANIFEST);
  if (!fs.existsSync(p)) return { imported: 0, mismatches: [] };
  let parsed: { skills?: ManifestEntry[] };
  try {
    parsed = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return { imported: 0, mismatches: [] };
  }
  const mismatches: string[] = [];
  let imported = 0;
  for (const e of parsed.skills ?? []) {
    const dir = path.join(libraryDir(), e.dir);
    if (!fs.existsSync(dir)) continue;
    const localHash = hashDir(dir); // recompute — the trusted key
    if (localHash !== e.contentHash) mismatches.push(e.dir); // canary
    upsertSkill({
      contentHash: localHash,
      name: e.name,
      description: e.description,
      centralPath: dir,
      provenance: e.provenance,
      gitUrl: e.gitUrl ?? null,
      tags: e.tags,
    });
    imported++;
  }
  reconcileDeleted();
  return { imported, mismatches };
}

/**
 * Drop DB rows for skills whose library dir no longer exists — the other half
 * of a sync. Manifests only add/update, so a skill deleted on another machine
 * would otherwise linger after pull/restore as a "ghost": a DB row with no
 * files that resurfaces in Discover as 未导入, plus dangling agent symlinks
 * pointing at the removed library dir. Deleting the row is safe: the recorded
 * target paths are OURS by construction (we wrote them), and the pre-sync
 * snapshot/commit already preserves the removed files in git history.
 */
function reconcileDeleted(): { removed: number } {
  const lib = path.resolve(libraryDir());
  let removed = 0;
  for (const s of allSkills()) {
    if (!s.central_path) continue;
    const cp = path.resolve(s.central_path);
    // Only reconcile rows that live inside THIS library (paranoia guard).
    if (cp !== lib && !cp.startsWith(lib + path.sep)) continue;
    if (fs.existsSync(cp)) continue;
    for (const t of targetsFor(s.content_hash)) {
      try {
        // lstat, not exists: a dangling symlink "exists" as a link but not as
        // a path — exactly the artifact we're here to clean up.
        fs.lstatSync(t.target_path);
        fs.rmSync(t.target_path, { recursive: true, force: true });
      } catch {
        /* already gone */
      }
      deleteTarget(s.content_hash, t.agent_id);
    }
    deleteSkill(s.content_hash);
    removed++;
  }
  return { removed };
}

/* --- repo bootstrap helpers ------------------------------------------- */

function ensureRepoFiles(): void {
  fs.writeFileSync(path.join(libraryDir(), ".gitattributes"), GITATTRIBUTES);
  fs.writeFileSync(path.join(libraryDir(), ".gitignore"), LIB_GITIGNORE);
  writeManifest();
}

function ensureInitialCommit(branch = "main"): void {
  if (!isGitRepo()) git(["init", "-b", branch]);
  ensureRepoFiles();
  git(["add", "-A"]);
  // Commit only if there's something staged.
  const staged = git(["diff", "--cached", "--name-only"], { allowFail: true });
  if (staged) git(["commit", "-m", "Skill library snapshot"]);
}

/**
 * Commit the current library to git as a LOCAL restore point — our "back up
 * before every destructive op" insurance. Local commit only; no network/push.
 *
 * If the library isn't a git repo yet we initialize one here (with the
 * defensive .gitignore first, so secrets/db can never be staged). This makes
 * the safety net universal: a user who never connected GitHub still gets a
 * local restore point before a destructive update — `git -C <library> reset
 * --hard HEAD~1` brings the pre-update files back.
 *
 * Strictly best-effort: it must never throw, so callers can wrap a destructive
 * operation without any risk of the snapshot itself blocking or failing it.
 */
export function snapshotLibrary(label: string): void {
  try {
    if (!isGitRepo()) {
      git(["init", "-b", "main"]);
      ensureRepoFiles(); // .gitignore guard + manifest, before the first add -A
    }
    git(["add", "-A"]);
    const staged = git(["diff", "--cached", "--name-only"], { allowFail: true });
    if (staged) git(["commit", "-m", `Snapshot: ${label}`], { allowFail: true });
  } catch {
    /* insurance only — never block the caller */
  }
}

/* --- existing-repo detection + parsing -------------------------------- */

/** Parse owner/repo, https URL, or git@ SSH form → { owner, repo, repoFull }. */
export function parseRepo(input: string): {
  owner: string;
  repo: string;
  repoFull: string;
} | null {
  const s = input.trim();
  if (!s) return null;
  let m =
    s.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i) ||
    s.match(/^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?$/);
  if (!m) return null;
  const owner = m[1];
  const repo = m[2];
  if (!owner || !repo) return null;
  return { owner, repo, repoFull: `${owner}/${repo}` };
}

interface RemoteInfo {
  exists: boolean;
  isPrivate: boolean;
  hasCommits: boolean;
  defaultBranch: string;
  cloneUrl: string;
}

function inspectRemote(repoFull: string): RemoteInfo {
  const json = gh(
    ["repo", "view", repoFull, "--json", "isPrivate,defaultBranchRef,url"],
    { allowFail: true }
  );
  const cloneUrl = `https://github.com/${repoFull}.git`;
  if (!json) {
    return {
      exists: false,
      isPrivate: true,
      hasCommits: false,
      defaultBranch: "main",
      cloneUrl,
    };
  }
  let parsed: {
    isPrivate?: boolean;
    defaultBranchRef?: { name?: string } | null;
  } = {};
  try {
    parsed = JSON.parse(json);
  } catch {
    /* ignore */
  }
  const defaultBranch = parsed.defaultBranchRef?.name || "";
  // An empty repo has no defaultBranchRef / no commits.
  const hasCommits = !!defaultBranch;
  return {
    exists: true,
    isPrivate: parsed.isPrivate !== false,
    hasCommits,
    defaultBranch: defaultBranch || "main",
    cloneUrl,
  };
}

/**
 * Pure-git connect (no gh) so it's testable against a local bare remote.
 * Handles: clone (local empty + remote has commits), push-to-empty, and the
 * unrelated-histories MERGE (both have skills) with abort-on-conflict.
 */
export function connectToRemote(
  cloneUrl: string,
  opts: {
    localHasContent: boolean;
    remoteHasCommits: boolean;
    defaultBranch: string;
  }
): { flow: "cloned" | "pushToEmpty" | "merge"; imported: number; mismatches: string[] } {
  const { localHasContent, remoteHasCommits, defaultBranch } = opts;
  ensureDataDir();

  // Case: local empty + remote has commits → adopt the remote state wholesale.
  // NOT `git clone`: a skill-less library often isn't an empty DIR — any prior
  // snapshotLibrary() (e.g. before an update) leaves .git/.gitignore/manifest
  // behind, and clone refuses a non-empty destination. init+fetch+checkout -f
  // lands on the same state and tolerates leftover metadata files.
  if (!localHasContent && remoteHasCommits) {
    if (!isGitRepo()) git(["init", "-b", defaultBranch]);
    git(["remote", "remove", "origin"], { allowFail: true });
    git(["remote", "add", "origin", cloneUrl]);
    git(["fetch", "origin"]);
    git(["checkout", "-f", "-B", defaultBranch, `origin/${defaultBranch}`]);
    git(
      ["branch", `--set-upstream-to=origin/${defaultBranch}`, defaultBranch],
      { allowFail: true }
    );
    const r = importManifest();
    return { flow: "cloned", ...r };
  }

  // Otherwise we init locally, add the remote, and either push or merge.
  ensureInitialCommit(defaultBranch);
  git(["remote", "remove", "origin"], { allowFail: true });
  git(["remote", "add", "origin", cloneUrl]);

  if (!remoteHasCommits) {
    git(["push", "-u", "origin", `HEAD:${defaultBranch}`]);
    return { flow: "pushToEmpty", imported: 0, mismatches: [] };
  }

  // Both sides have history → merge unrelated histories.
  git(["fetch", "origin"]);
  try {
    git([
      "merge",
      "--allow-unrelated-histories",
      "-m",
      "Merge cloud skills",
      `origin/${defaultBranch}`,
    ]);
  } catch {
    // manifest.json differs whenever skill sets differ — that's expected, not a
    // real conflict. Auto-resolve a manifest-ONLY conflict by unioning entries;
    // abort only when actual skill files collide.
    const conflicted = git(["diff", "--name-only", "--diff-filter=U"], {
      allowFail: true,
    })
      .split("\n")
      .filter(Boolean);
    const onlyManifest =
      conflicted.length > 0 && conflicted.every((f) => f === MANIFEST);
    if (!onlyManifest) {
      git(["merge", "--abort"], { allowFail: true });
      git(["remote", "remove", "origin"], { allowFail: true }); // retryable
      throw new Error(
        "The cloud and local skill files conflict, so the merge was aborted to protect your local files. Resolve it manually before connecting, or use an empty repo."
      );
    }
    resolveManifestUnion();
    git(["add", MANIFEST]);
    git(["commit", "--no-edit"]);
  }
  git(["push", "-u", "origin", `HEAD:${defaultBranch}`]);
  const r = importManifest();
  return { flow: "merge", ...r };
}

/** On a manifest-only merge conflict, union both sides' entries (by dir). */
function resolveManifestUnion(): void {
  const read = (stage: string) => {
    try {
      const raw = git(["show", `${stage}:${MANIFEST}`], { allowFail: true });
      const parsed = JSON.parse(raw || "{}");
      return Array.isArray(parsed.skills) ? parsed.skills : [];
    } catch {
      return [];
    }
  };
  const ours = read(":2"); // local
  const theirs = read(":3"); // remote
  const byDir = new Map<string, unknown>();
  for (const e of theirs) byDir.set((e as { dir: string }).dir, e);
  for (const e of ours) byDir.set((e as { dir: string }).dir, e); // local wins ties
  fs.writeFileSync(
    path.join(libraryDir(), MANIFEST),
    JSON.stringify({ version: 1, skills: [...byDir.values()] }, null, 2)
  );
}

function ghLogin(): string {
  const login = gh(["api", "user", "--jq", ".login"]);
  if (!login) throw new Error("Couldn't get your GitHub username. Run `gh auth login` first.");
  return login;
}

/* --- public operations ------------------------------------------------ */

export type ConnectFlow =
  | "cloned"
  | "pushToEmpty"
  | "merge"
  | "created"
  | "error";

export interface ConnectOpts {
  repoUrl?: string; // existing repo: owner/repo or URL (primary)
  create?: boolean; // create-new fallback (secondary)
  repoName?: string; // name for create-new (default my-skills)
  repoPrivate?: boolean; // visibility for create-new (default private)
}

export interface ConnectPreview {
  ghReady: boolean;
  repoFull: string | null;
  remoteExists: boolean;
  remoteHasCommits: boolean;
  isPublic: boolean;
  skillCount: number;
  flow: ConnectFlow;
  message?: string;
}

const NO_GH: ConnectPreview = {
  ghReady: false,
  repoFull: null,
  remoteExists: false,
  remoteHasCommits: false,
  isPublic: false,
  skillCount: 0,
  flow: "error",
};

/** Dry run for the confirm dialog: what WILL happen, touching nothing. */
export function connectPreview(opts: ConnectOpts = {}): ConnectPreview {
  ensureDataDir();
  if (!ghAuthed()) return NO_GH;
  const skillCount = librarySkillDirs().length;
  const hasContent = skillCount > 0;

  // Create-new fallback.
  if (opts.create) {
    const repoFull = `${ghLogin()}/${opts.repoName || "my-skills"}`;
    return {
      ghReady: true,
      repoFull,
      remoteExists: false,
      remoteHasCommits: false,
      isPublic: opts.repoPrivate === false,
      skillCount,
      flow: "created",
    };
  }

  // Primary: connect to an existing repo.
  const parsed = parseRepo(opts.repoUrl ?? "");
  if (!parsed)
    return {
      ...NO_GH,
      ghReady: true,
      flow: "error",
      message: "Enter a valid owner/repo or repository URL.",
    };
  const info = inspectRemote(parsed.repoFull);
  let flow: ConnectFlow;
  if (!info.exists) flow = "error";
  else if (!info.hasCommits) flow = "pushToEmpty";
  else if (!hasContent) flow = "cloned";
  else flow = "merge";
  return {
    ghReady: true,
    repoFull: parsed.repoFull,
    remoteExists: info.exists,
    remoteHasCommits: info.hasCommits,
    isPublic: info.exists && !info.isPrivate,
    skillCount,
    flow,
    message:
      flow === "error"
        ? `Repository ${parsed.repoFull} not found. Check the name, or use "Create a private repo" instead.`
        : undefined,
  };
}

export interface ConnectResult extends SyncStatus {
  flow: ConnectFlow;
  imported?: number;
  mismatches?: string[];
  message?: string;
}

/**
 * Primary path: connect to an EXISTING repo (clone / push-to-empty / merge).
 * Fallback: create a new private repo. See connectToRemote for the git flows.
 */
export function connect(opts: ConnectOpts = {}): ConnectResult {
  ensureDataDir();
  if (!ghAuthed()) {
    throw new Error('Not signed in to GitHub. Click "Sign in to GitHub with your browser" first.');
  }
  if (isGitRepo() && remoteUrl()) {
    return { ...syncStatus(), flow: "created", message: "Connected" };
  }
  const hasContent = librarySkillDirs().length > 0;

  // Fallback: create a new repo (private by default).
  if (opts.create) {
    const repoName = opts.repoName || "my-skills";
    ensureInitialCommit();
    gh([
      "repo",
      "create",
      repoName,
      opts.repoPrivate === false ? "--public" : "--private",
      "--source",
      libraryDir(),
      "--remote",
      "origin",
      "--push",
    ]);
    return { ...syncStatus(), flow: "created" };
  }

  // Primary: connect to an existing repo.
  const parsed = parseRepo(opts.repoUrl ?? "");
  if (!parsed) throw new Error("Enter a valid owner/repo or repository URL.");
  const info = inspectRemote(parsed.repoFull);
  if (!info.exists) {
    throw new Error(
      `Repository ${parsed.repoFull} not found. Check the name, or use "Create a private repo" instead.`
    );
  }
  const { flow, imported, mismatches } = connectToRemote(info.cloneUrl, {
    localHasContent: hasContent,
    remoteHasCommits: info.hasCommits,
    defaultBranch: info.defaultBranch,
  });
  return { ...syncStatus(), flow, imported, mismatches };
}

export function backup(): SyncStatus & { pushed: boolean } {
  if (!isGitRepo() || !remoteUrl())
    throw new Error("Not connected to GitHub yet. Connect first.");
  ensureRepoFiles();
  git(["add", "-A"]);
  const staged = git(["diff", "--cached", "--name-only"], { allowFail: true });
  if (staged) git(["commit", "-m", `Backup ${new Date().toISOString()}`]);
  // Push is safe by construction: no --force, so a diverged remote is REJECTED
  // rather than overwritten, and nothing local is ever deleted or reset. Turn
  // that one rough edge (a raw non-fast-forward git error) into a clear,
  // reassuring, actionable message.
  try {
    git(["push", "origin", "HEAD"]);
  } catch (e) {
    const msg = (e as Error).message;
    if (/non-fast-forward|fetch first|rejected|\bbehind\b/i.test(msg))
      throw new Error(
        "The cloud has changes this machine doesn't (maybe backed up from another machine). Use \"Sync from cloud\" to merge first, then \"Back up now\". None of your local files were changed."
      );
    throw e;
  }
  return { ...syncStatus(), pushed: !!staged };
}

export function pull(): SyncStatus & {
  imported: number;
  mismatches: string[];
} {
  if (!isGitRepo() || !remoteUrl())
    throw new Error("Not connected to GitHub yet. Connect first.");
  // Auto-commit any local changes first so nothing is lost in the merge.
  ensureRepoFiles();
  git(["add", "-A"]);
  const staged = git(["diff", "--cached", "--name-only"], { allowFail: true });
  if (staged) git(["commit", "-m", "Local changes before sync"]);
  // Pull the CURRENT branch — backup pushes `HEAD` (current branch), so pulling
  // the remote's default branch (`origin HEAD`) would be asymmetric whenever
  // the two names diverge.
  const branch =
    git(["rev-parse", "--abbrev-ref", "HEAD"], { allowFail: true }) || "main";
  try {
    git(["pull", "--no-rebase", "origin", branch]);
  } catch (e) {
    const msg = (e as Error).message;
    if (/conflict/i.test(msg)) {
      git(["merge", "--abort"], { allowFail: true });
      throw new Error(
        "The cloud and local versions conflict, so this was aborted to protect your local files. Resolve it manually, then sync again."
      );
    }
    throw e;
  }
  const { imported, mismatches } = importManifest();
  return { ...syncStatus(), imported, mismatches };
}

/**
 * Restore the library to the EXACT cloud (origin) state — the "把东西拉回来"
 * rollback. This is deliberately separate from pull():
 *
 *   pull() MERGES, and auto-commits local changes first — so the branch can
 *   only ever move *forward*. If a local change clobbered a skill, pull() sees
 *   local as ahead of origin and fast-forwards to nothing, so it can never undo
 *   the damage. (That's the bug behind "我从云端同步了但东西没拉回来".)
 *
 * restoreFromCloud() instead hard-resets onto origin. We first snapshot local
 * (incl. untracked files) and stash the pre-restore tip under refs/ssm/pre-
 * restore, so the discard is itself fully reversible.
 */
export function restoreFromCloud(): SyncStatus & {
  restoredTo: string;
  imported: number;
  mismatches: string[];
} {
  if (!isGitRepo() || !remoteUrl())
    throw new Error("Not connected to GitHub yet. Connect first.");
  // Commit everything first so the about-to-be-discarded state is preserved,
  // then record that tip under a private ref for an easy manual undo:
  //   git -C <library> reset --hard refs/ssm/pre-restore
  snapshotLibrary("local state before restore");
  const tip = git(["rev-parse", "HEAD"], { allowFail: true });
  if (tip) git(["update-ref", "refs/ssm/pre-restore", tip], { allowFail: true });
  const branch =
    git(["rev-parse", "--abbrev-ref", "HEAD"], { allowFail: true }) || "main";
  git(["fetch", "origin"]);
  git(["reset", "--hard", `origin/${branch}`]);
  const { imported, mismatches } = importManifest();
  return { ...syncStatus(), restoredTo: `origin/${branch}`, imported, mismatches };
}

export interface SyncCheck {
  connected: boolean;
  dirty: boolean; // working tree differs from the last commit
  changedCount: number; // # of changed/added/removed paths
  changedSample: string[]; // a few names for display
  ahead: number; // local commits not yet pushed
  behind: number; // cloud commits not yet pulled
  needsBackup: boolean; // dirty || ahead > 0
}

/**
 * "Do I have anything to back up?" — compare the local library against the
 * cloud. Regenerates manifest.json first so a metadata-only change (tags,
 * favorites) still counts, then fetches origin to report ahead/behind. Read-
 * only intent; the only write is the (idempotent) manifest/repo files.
 */
export function syncCheck(): SyncCheck {
  const idle: SyncCheck = {
    connected: false,
    dirty: false,
    changedCount: 0,
    changedSample: [],
    ahead: 0,
    behind: 0,
    needsBackup: false,
  };
  if (!isGitRepo() || !remoteUrl()) return idle;

  // Reflect current DB metadata into the manifest so tag/favorite-only changes
  // show up as "needs backup".
  ensureRepoFiles();

  const lines = git(["status", "--porcelain"], { allowFail: true })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const changedSample = lines.slice(0, 8).map((l) => l.replace(/^\S+\s+/, ""));

  // Compare against the latest cloud tip.
  git(["fetch", "origin"], { allowFail: true });
  const branch =
    git(["rev-parse", "--abbrev-ref", "HEAD"], { allowFail: true }) || "main";
  const counts = git(
    ["rev-list", "--left-right", "--count", `origin/${branch}...HEAD`],
    { allowFail: true }
  );
  const [behindStr = "0", aheadStr = "0"] = counts.split(/\s+/);
  const behind = Number(behindStr) || 0;
  const ahead = Number(aheadStr) || 0;

  return {
    connected: true,
    dirty: lines.length > 0,
    changedCount: lines.length,
    changedSample,
    ahead,
    behind,
    needsBackup: lines.length > 0 || ahead > 0,
  };
}

export function disconnect(): SyncStatus {
  if (isGitRepo()) git(["remote", "remove", "origin"], { allowFail: true });
  return syncStatus();
}
