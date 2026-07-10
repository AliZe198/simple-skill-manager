import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { db } from "./db";

let base: string;

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), "ssm-db-"));
  process.env.SSM_DATA_DIR = path.join(base, "data");
});
afterEach(() => {
  delete process.env.SSM_DATA_DIR;
  fs.rmSync(base, { recursive: true, force: true });
});

describe("schema versioning", () => {
  it("stamps user_version on a fresh DB and creates the tables", () => {
    const d = db();
    expect(d.pragma("user_version", { simple: true })).toBeGreaterThanOrEqual(1);
    const tables = (
      d.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
        name: string;
      }[]
    ).map((r) => r.name);
    expect(tables).toEqual(expect.arrayContaining(["skills", "targets", "favorites"]));
  });

  it("upgrades a pre-versioning DB (user_version 0, tables already present) without data loss", () => {
    const dir = path.join(base, "data");
    fs.mkdirSync(dir, { recursive: true });
    // Simulate an old DB: v1 tables exist but user_version was never set.
    const p = path.join(dir, "ssm.db");
    const raw = new Database(p);
    raw.exec(
      `CREATE TABLE skills (content_hash TEXT PRIMARY KEY, name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '', central_path TEXT,
        provenance TEXT NOT NULL DEFAULT 'unknown', git_url TEXT,
        enabled INTEGER NOT NULL DEFAULT 1, tags TEXT NOT NULL DEFAULT '[]',
        favorited INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL);
       CREATE TABLE targets (content_hash TEXT NOT NULL, agent_id TEXT NOT NULL,
        target_path TEXT NOT NULL, mode TEXT NOT NULL, synced_at INTEGER,
        source_hash TEXT, status TEXT NOT NULL DEFAULT 'ok',
        PRIMARY KEY (content_hash, agent_id));
       CREATE TABLE favorites (market_id TEXT PRIMARY KEY, added_at INTEGER NOT NULL);`
    );
    raw.prepare(
      "INSERT INTO skills (content_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?)"
    ).run("abc", "keep-me", 1, 1);
    expect(raw.pragma("user_version", { simple: true })).toBe(0);
    raw.close();

    const d = db();
    expect(d.pragma("user_version", { simple: true })).toBeGreaterThanOrEqual(1);
    const row = d.prepare("SELECT name FROM skills WHERE content_hash = ?").get("abc") as
      | { name: string }
      | undefined;
    expect(row?.name).toBe("keep-me");
  });
});
