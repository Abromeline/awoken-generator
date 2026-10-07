import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "./schema.js";

export const DATA_DIR = resolve(process.env.DATA_DIR ?? join(process.cwd(), "data"));
const BLOBS_DIR = join(DATA_DIR, "blobs", "objects");

const DDL = `
CREATE TABLE IF NOT EXISTS layer_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  rarity TEXT NOT NULL,
  power INTEGER,
  toughness INTEGER,
  image_blob_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS awakened (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT 'Unnamed Awoken',
  image_blob_key TEXT NOT NULL,
  composition_json TEXT NOT NULL DEFAULT '[]',
  collection TEXT NOT NULL DEFAULT 'workshop',
  owner_name TEXT NOT NULL DEFAULT 'Nigel',
  identity_key TEXT NOT NULL DEFAULT 'legacy',
  iteration INTEGER NOT NULL DEFAULT 0,
  flavor_text TEXT NOT NULL DEFAULT 'Every form begins as scattered matter.',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS blob_index (
  key TEXT PRIMARY KEY NOT NULL,
  object_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS credit_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT 'tender',
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  reference TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`;

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(BLOBS_DIR, { recursive: true });

const sqlite = new Database(join(DATA_DIR, "app.db"));
sqlite.exec(DDL);

export const db: BetterSQLite3Database<typeof schema> = drizzle(sqlite, { schema });

function objectPath(objectId: string) {
  return join(BLOBS_DIR, objectId.slice(0, 2), objectId);
}

export const blobs = {
  /** Content-addressed put: stores bytes once, maps the logical key to them. */
  put(key: string, bytes: Buffer, contentType: string): void {
    const objectId = createHash("sha256").update(bytes).digest("hex");
    const path = objectPath(objectId);
    if (!existsSync(path)) {
      mkdirSync(join(BLOBS_DIR, objectId.slice(0, 2)), { recursive: true });
      writeFileSync(path, bytes);
    }
    sqlite
      .prepare(
        `INSERT INTO blob_index (key, object_id, content_type, size_bytes, created_at_ms)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET object_id=excluded.object_id, content_type=excluded.content_type, size_bytes=excluded.size_bytes`
      )
      .run(key, objectId, contentType, bytes.length, Date.now());
  },
  get(key: string): { bytes: Buffer; contentType: string } | null {
    const row = sqlite.prepare(`SELECT object_id, content_type FROM blob_index WHERE key = ?`).get(key) as
      | { object_id: string; content_type: string }
      | undefined;
    if (!row) return null;
    const path = objectPath(row.object_id);
    if (!existsSync(path)) return null;
    return { bytes: readFileSync(path), contentType: row.content_type };
  },
  delete(key: string): void {
    sqlite.prepare(`DELETE FROM blob_index WHERE key = ?`).run(key);
  },
};

export { eq, schema };
