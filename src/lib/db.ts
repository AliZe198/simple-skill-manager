import Database from "better-sqlite3";
import { dbPath, ensureDataDir } from "./config";
import type { Provenance, TargetMode, TargetStatus } from "./types";

/**
 * SQLite is the authoritative store for things the filesystem can't tell us:
 * provenance, enabled/parked state, favorites, and the exact targets we wrote
 * (PRD §8). The scan is read-only truth about the filesystem; the DB is truth
 * about our decisions. They're merged in library.ts.
 *
 * Keyed on contentHash so re-scanning is idempotent (PRD: scan must not dupe).
 */

let _db: Database.Database | null = null;
let _dbForPath: string | null = null;

export function db(): Database.Database {
  const p = dbPath();
  // Re-open if the data dir changed (tests point SSM_DATA_DIR at temp dirs).
  if (_db && _dbForPath === p) return _db;
  if (_db) {
    try {
      _db.close();
    } catch {
      /* ignore */
    }
  }
  ensureDataDir();
  const d = new Database(p);
  d.pragma("journal_mode = WAL");
  d.pragma("foreign_keys = ON");
  migrate(d);
  _db = d;
  _dbForPath = p;
  return d;
}

/**
 * Current on-disk schema version. Bump this and append a step to `MIGRATIONS`
 * whenever the schema changes, so an existing user's ssm.db is upgraded in place
 * instead of breaking on the next query. Never renumber past steps.
 */
const SCHEMA_VERSION = 1;

// Each step's index+1 is its target version; step i runs when user_version < i+1.
const MIGRATIONS: Array<(d: Database.Database) => void> = [
  // v1 — initial schema.
  (d) => {
    d.exec(`
      CREATE TABLE IF NOT EXISTS skills (
        content_hash TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        description  TEXT NOT NULL DEFAULT '',
        central_path TEXT,
        provenance   TEXT NOT NULL DEFAULT 'unknown',
        git_url      TEXT,
        enabled      INTEGER NOT NULL DEFAULT 1,
        tags         TEXT NOT NULL DEFAULT '[]',
        favorited    INTEGER NOT NULL DEFAULT 0,
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS targets (
        content_hash TEXT NOT NULL,
        agent_id     TEXT NOT NULL,
        target_path  TEXT NOT NULL,
        mode         TEXT NOT NULL,
        synced_at    INTEGER,
        source_hash  TEXT,
        status       TEXT NOT NULL DEFAULT 'ok',
        PRIMARY KEY (content_hash, agent_id),
        FOREIGN KEY (content_hash) REFERENCES skills(content_hash) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS favorites (
        market_id  TEXT PRIMARY KEY,
        added_at   INTEGER NOT NULL
      );
    `);
  },
  // v2+ — add new migration steps here, e.g.
  // (d) => d.exec("ALTER TABLE skills ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;"),
];

function migrate(d: Database.Database): void {
  let version = (d.pragma("user_version", { simple: true }) as number) ?? 0;
  // A pre-versioning DB (created before user_version was set) already has the v1
  // tables; CREATE TABLE IF NOT EXISTS makes re-running step 1 a safe no-op.
  for (let i = version; i < MIGRATIONS.length; i++) {
    d.transaction(() => {
      MIGRATIONS[i](d);
      d.pragma(`user_version = ${i + 1}`);
    })();
  }
  version = MIGRATIONS.length;
  if (version < SCHEMA_VERSION) d.pragma(`user_version = ${SCHEMA_VERSION}`);
}

export interface SkillRecord {
  content_hash: string;
  name: string;
  description: string;
  central_path: string | null;
  provenance: Provenance;
  git_url: string | null;
  enabled: number;
  tags: string;
  favorited: number;
  created_at: number;
  updated_at: number;
}

export interface TargetRecord {
  content_hash: string;
  agent_id: string;
  target_path: string;
  mode: TargetMode;
  synced_at: number | null;
  source_hash: string | null;
  status: TargetStatus;
}

export function getSkill(hash: string): SkillRecord | undefined {
  return db()
    .prepare("SELECT * FROM skills WHERE content_hash = ?")
    .get(hash) as SkillRecord | undefined;
}

export function allSkills(): SkillRecord[] {
  return db().prepare("SELECT * FROM skills").all() as SkillRecord[];
}

export function upsertSkill(rec: {
  contentHash: string;
  name: string;
  description: string;
  centralPath?: string | null;
  provenance?: Provenance;
  gitUrl?: string | null;
  enabled?: boolean;
  favorited?: boolean;
  tags?: string[];
}): void {
  const now = nowTs();
  const existing = getSkill(rec.contentHash);
  if (existing) {
    db()
      .prepare(
        `UPDATE skills SET
           name = ?, description = ?,
           central_path = COALESCE(?, central_path),
           provenance = COALESCE(?, provenance),
           git_url = COALESCE(?, git_url),
           enabled = COALESCE(?, enabled),
           favorited = COALESCE(?, favorited),
           tags = COALESCE(?, tags),
           updated_at = ?
         WHERE content_hash = ?`
      )
      .run(
        rec.name,
        rec.description,
        rec.centralPath ?? null,
        rec.provenance ?? null,
        rec.gitUrl ?? null,
        rec.enabled === undefined ? null : rec.enabled ? 1 : 0,
        rec.favorited === undefined ? null : rec.favorited ? 1 : 0,
        rec.tags ? JSON.stringify(rec.tags) : null,
        now,
        rec.contentHash
      );
  } else {
    db()
      .prepare(
        `INSERT INTO skills
           (content_hash, name, description, central_path, provenance,
            git_url, enabled, tags, favorited, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        rec.contentHash,
        rec.name,
        rec.description,
        rec.centralPath ?? null,
        rec.provenance ?? "unknown",
        rec.gitUrl ?? null,
        rec.enabled === false ? 0 : 1,
        rec.tags ? JSON.stringify(rec.tags) : "[]",
        rec.favorited ? 1 : 0,
        now,
        now
      );
  }
}

export function setSkillFields(
  hash: string,
  fields: Partial<{
    enabled: boolean;
    favorited: boolean;
    provenance: Provenance;
    centralPath: string | null;
    description: string;
    name: string;
  }>
): void {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (fields.enabled !== undefined) {
    sets.push("enabled = ?");
    vals.push(fields.enabled ? 1 : 0);
  }
  if (fields.favorited !== undefined) {
    sets.push("favorited = ?");
    vals.push(fields.favorited ? 1 : 0);
  }
  if (fields.provenance !== undefined) {
    sets.push("provenance = ?");
    vals.push(fields.provenance);
  }
  if (fields.centralPath !== undefined) {
    sets.push("central_path = ?");
    vals.push(fields.centralPath);
  }
  if (fields.description !== undefined) {
    sets.push("description = ?");
    vals.push(fields.description);
  }
  if (fields.name !== undefined) {
    sets.push("name = ?");
    vals.push(fields.name);
  }
  if (!sets.length) return;
  sets.push("updated_at = ?");
  vals.push(nowTs());
  vals.push(hash);
  db()
    .prepare(`UPDATE skills SET ${sets.join(", ")} WHERE content_hash = ?`)
    .run(...vals);
}

export function deleteSkill(hash: string): void {
  db().prepare("DELETE FROM skills WHERE content_hash = ?").run(hash);
}

/**
 * Re-key a skill when its content changes (an update): content_hash is the PK
 * here and the FK in targets, so move the row to the new hash and re-point its
 * targets. Insert-new → repoint-children → delete-old keeps the FK satisfied at
 * every step (no ON UPDATE CASCADE in the schema).
 */
export function rekeySkill(oldHash: string, newHash: string): void {
  if (oldHash === newHash) return;
  const old = getSkill(oldHash);
  if (!old) return;
  const d = db();
  d.transaction(() => {
    d.prepare(
      `INSERT OR REPLACE INTO skills
         (content_hash, name, description, central_path, provenance,
          git_url, enabled, tags, favorited, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      newHash,
      old.name,
      old.description,
      old.central_path,
      old.provenance,
      old.git_url,
      old.enabled,
      old.tags,
      old.favorited,
      old.created_at,
      nowTs()
    );
    d.prepare(
      `UPDATE targets SET content_hash = ?,
         source_hash = CASE WHEN source_hash IS NOT NULL THEN ? ELSE source_hash END
       WHERE content_hash = ?`
    ).run(newHash, newHash, oldHash);
    d.prepare("DELETE FROM skills WHERE content_hash = ?").run(oldHash);
  })();
}

export function targetsFor(hash: string): TargetRecord[] {
  return db()
    .prepare("SELECT * FROM targets WHERE content_hash = ?")
    .all(hash) as TargetRecord[];
}

export function allTargets(): TargetRecord[] {
  return db().prepare("SELECT * FROM targets").all() as TargetRecord[];
}

export function upsertTarget(t: {
  contentHash: string;
  agentId: string;
  targetPath: string;
  mode: TargetMode;
  sourceHash?: string;
  status?: TargetStatus;
}): void {
  db()
    .prepare(
      `INSERT INTO targets
         (content_hash, agent_id, target_path, mode, synced_at, source_hash, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(content_hash, agent_id) DO UPDATE SET
         target_path = excluded.target_path,
         mode = excluded.mode,
         synced_at = excluded.synced_at,
         source_hash = excluded.source_hash,
         status = excluded.status`
    )
    .run(
      t.contentHash,
      t.agentId,
      t.targetPath,
      t.mode,
      nowTs(),
      t.sourceHash ?? null,
      t.status ?? "ok"
    );
}

export function deleteTarget(hash: string, agentId: string): void {
  db()
    .prepare("DELETE FROM targets WHERE content_hash = ? AND agent_id = ?")
    .run(hash, agentId);
}

export function listFavorites(): string[] {
  return (
    db().prepare("SELECT market_id FROM favorites").all() as {
      market_id: string;
    }[]
  ).map((r) => r.market_id);
}

export function toggleFavorite(marketId: string, on: boolean): void {
  if (on) {
    db()
      .prepare(
        "INSERT OR IGNORE INTO favorites (market_id, added_at) VALUES (?, ?)"
      )
      .run(marketId, nowTs());
  } else {
    db().prepare("DELETE FROM favorites WHERE market_id = ?").run(marketId);
  }
}

function nowTs(): number {
  return Date.now();
}
