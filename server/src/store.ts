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
CREATE TABLE IF NOT EXISTS visitors (
  visitor_id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  welcome_wakes_granted INTEGER NOT NULL DEFAULT 0,
  welcome_claimed INTEGER NOT NULL DEFAULT 0,
  last_free_wake_at INTEGER
);
CREATE TABLE IF NOT EXISTS pending_welcomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  awakened_id INTEGER NOT NULL,
  respins_used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tenders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  tender_name TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tender_sessions (
  token TEXT PRIMARY KEY NOT NULL,
  tender_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS decks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  name TEXT NOT NULL,
  face_card_id INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS deck_cards (
  deck_id INTEGER NOT NULL,
  awakened_id INTEGER NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (deck_id, awakened_id)
);
CREATE TABLE IF NOT EXISTS territory_tiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  q INTEGER NOT NULL,
  r INTEGER NOT NULL,
  element TEXT NOT NULL DEFAULT 'neutral',
  cursed INTEGER NOT NULL DEFAULT 1,
  spark INTEGER NOT NULL DEFAULT 0,
  building TEXT,
  created_at INTEGER NOT NULL,
  last_passive_at INTEGER
);
CREATE TABLE IF NOT EXISTS field_placements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  awakened_id INTEGER NOT NULL,
  tile_id INTEGER NOT NULL,
  placed_at INTEGER NOT NULL,
  last_moved_at INTEGER NOT NULL
);
`;

// (tender_births table created after sqlite init below)

// Lightweight migration: awakened.field_born for field-born marker.
// (Moved after sqlite init below.)

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(BLOBS_DIR, { recursive: true });

export const sqlite = new Database(join(DATA_DIR, "app.db"));
sqlite.exec(DDL);

// Lightweight migration: awakened.owner_key for per-Tender decks.
// (CREATE TABLE IF NOT EXISTS can't add columns to existing tables.)
const awakenedCols = sqlite.prepare(`PRAGMA table_info(awakened)`).all() as { name: string }[];
if (!awakenedCols.some((col) => col.name === "owner_key")) {
  sqlite.exec(`ALTER TABLE awakened ADD COLUMN owner_key TEXT`);
}
if (!awakenedCols.some((col) => col.name === "story_count")) {
  sqlite.exec(`ALTER TABLE awakened ADD COLUMN story_count INTEGER NOT NULL DEFAULT 0`);
}
if (!awakenedCols.some((col) => col.name === "field_born")) {
  sqlite.exec(`ALTER TABLE awakened ADD COLUMN field_born INTEGER NOT NULL DEFAULT 0`);
}
// Dispersed Awoken: vanished into time for 4h re-coalescence, then return to hand.
if (!awakenedCols.some((col) => col.name === "dispersed_until")) {
  sqlite.exec(`ALTER TABLE awakened ADD COLUMN dispersed_until INTEGER`);
}
// 48h passive purification timer on territory tiles.
const tileCols = sqlite.prepare(`PRAGMA table_info(territory_tiles)`).all() as { name: string }[];
if (!tileCols.some((col) => col.name === "last_passive_at")) {
  sqlite.exec(`ALTER TABLE territory_tiles ADD COLUMN last_passive_at INTEGER`);
}
// Stance for field placements: attack | defense | binding.
const placementCols = sqlite.prepare(`PRAGMA table_info(field_placements)`).all() as { name: string }[];
if (!placementCols.some((col) => col.name === "stance")) {
  sqlite.exec(`ALTER TABLE field_placements ADD COLUMN stance TEXT NOT NULL DEFAULT 'defense'`);
}
// 4-hour birth cycle: tracks last free birth per Tender
sqlite.exec(`CREATE TABLE IF NOT EXISTS tender_births (
  owner_key TEXT PRIMARY KEY,
  last_birth_at INTEGER NOT NULL
);`);
// Wave defense: the Unraveling attacks the bastion in waves.
sqlite.exec(`CREATE TABLE IF NOT EXISTS wave_state (
  owner_key TEXT PRIMARY KEY,
  wave_number INTEGER NOT NULL DEFAULT 1,
  last_wave_at INTEGER NOT NULL,
  waves_defeated INTEGER NOT NULL DEFAULT 0
);`);

// Stories table for the Confluence power-up.
sqlite.exec(`CREATE TABLE IF NOT EXISTS awoken_stories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  awakened_id INTEGER NOT NULL,
  tender_id INTEGER NOT NULL,
  story_text TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`);

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
