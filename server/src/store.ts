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

// Migration: add hp column to territory_tiles
try {
  sqlite.exec("ALTER TABLE territory_tiles ADD COLUMN hp INTEGER NOT NULL DEFAULT 10");
} catch {
  // Column already exists
}
// Migration: add hp column to field_placements
try {
  sqlite.exec("ALTER TABLE field_placements ADD COLUMN hp INTEGER");
} catch {
  // Column already exists
}
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
// Confluence sessions.
sqlite.exec(`CREATE TABLE IF NOT EXISTS confluence_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  host_key TEXT NOT NULL,
  guest_key TEXT,
  status TEXT NOT NULL DEFAULT 'waiting',
  wave_power INTEGER NOT NULL DEFAULT 10,
  created_at INTEGER NOT NULL
);`);
sqlite.exec(`CREATE TABLE IF NOT EXISTS confluence_roster (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  owner_key TEXT NOT NULL,
  awakened_id INTEGER NOT NULL
);`);
// Champion and legends tables.
sqlite.exec(`CREATE TABLE IF NOT EXISTS tender_champions (
  owner_key TEXT PRIMARY KEY,
  awakened_id INTEGER NOT NULL
);`);
sqlite.exec(`CREATE TABLE IF NOT EXISTS awoken_legends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  awakened_id INTEGER NOT NULL,
  owner_key TEXT NOT NULL,
  deed TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);`);
// Referral codes.
sqlite.exec(`CREATE TABLE IF NOT EXISTS referral_codes (
  code TEXT PRIMARY KEY,
  inviter_key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);`);
// Conceived confluence twins.
sqlite.exec(`CREATE TABLE IF NOT EXISTS confluence_twins (
  session_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  image_blob_key TEXT NOT NULL,
  composition_json TEXT NOT NULL,
  flavor_text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);`);

// Friendships and messages.
sqlite.exec(`CREATE TABLE IF NOT EXISTS friendships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_key TEXT NOT NULL,
  addressee_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);`);
sqlite.exec(`CREATE TABLE IF NOT EXISTS friend_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_key TEXT NOT NULL,
  receiver_key TEXT NOT NULL,
  text TEXT NOT NULL,
  read_at INTEGER,
  created_at INTEGER NOT NULL
);`);
// Experience system.
if (!awakenedCols.some((col) => col.name === "experience")) {
  sqlite.exec(`ALTER TABLE awakened ADD COLUMN experience INTEGER NOT NULL DEFAULT 0`);
}
if (!awakenedCols.some((col) => col.name === "stat_points")) {
  sqlite.exec(`ALTER TABLE awakened ADD COLUMN stat_points INTEGER NOT NULL DEFAULT 0`);
}
if (!awakenedCols.some((col) => col.name === "bonus_power")) {
  sqlite.exec(`ALTER TABLE awakened ADD COLUMN bonus_power INTEGER NOT NULL DEFAULT 0`);
}
if (!awakenedCols.some((col) => col.name === "bonus_toughness")) {
  sqlite.exec(`ALTER TABLE awakened ADD COLUMN bonus_toughness INTEGER NOT NULL DEFAULT 0`);
}
// 48h passive purification timer on territory tiles.
const tileCols = sqlite.prepare(`PRAGMA table_info(territory_tiles)`).all() as { name: string }[];
if (!tileCols.some((col) => col.name === "last_passive_at")) {
  sqlite.exec(`ALTER TABLE territory_tiles ADD COLUMN last_passive_at INTEGER`);
}
if (!tileCols.some((col) => col.name === "spark")) {
  sqlite.exec(`ALTER TABLE territory_tiles ADD COLUMN spark INTEGER NOT NULL DEFAULT 0`);
}
// Stance for field placements: attack | defense | binding.
const placementCols = sqlite.prepare(`PRAGMA table_info(field_placements)`).all() as { name: string }[];
if (!placementCols.some((col) => col.name === "stance")) {
  sqlite.exec(`ALTER TABLE field_placements ADD COLUMN stance TEXT NOT NULL DEFAULT 'defense'`);
}
// Curse HP for territory tiles.
if (!tileCols.some((col) => col.name === "curse_hp")) {
  sqlite.exec(`ALTER TABLE territory_tiles ADD COLUMN curse_hp INTEGER`);
}
if (!tileCols.some((col) => col.name === "curse_max_hp")) {
  sqlite.exec(`ALTER TABLE territory_tiles ADD COLUMN curse_max_hp INTEGER`);
}
// Binding upkeep tracking.
if (!placementCols.some((col) => col.name === "last_binding_charge_at")) {
  sqlite.exec(`ALTER TABLE field_placements ADD COLUMN last_binding_charge_at INTEGER`);
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
// Tender energy: server-authoritative. Admin can refill.
sqlite.exec(`CREATE TABLE IF NOT EXISTS tender_resources (
  owner_key TEXT PRIMARY KEY,
  energy INTEGER NOT NULL DEFAULT 5,
  updated_at INTEGER NOT NULL
);`);
// Battle tracks: rotating 8-bit music for battlegrounds. Nigel curates in workshop.
// Migration: add pages column to battle_tracks
try {
  sqlite.exec(`ALTER TABLE battle_tracks ADD COLUMN pages TEXT NOT NULL DEFAULT '["territory"]'`);
} catch {}
sqlite.exec(`CREATE TABLE IF NOT EXISTS battle_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  track_data TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);`);
// Seed the built-in music library. Idempotent: only adds tracks not already present.
{
  const existing = new Set(
    (sqlite.prepare(`SELECT name FROM battle_tracks`).all() as { name: string }[]).map(r => r.name)
  );
  const seedTracks: [string, string][] = [
    ["Aurora", "/music/aurora.mp3"],
    ["Balefire", "/music/balefire.mp3"],
    ["Born of the Sky", "/music/born-of-the-sky.mp3"],
    ["Goliath", "/music/goliath.mp3"],
    ["Hymn to the Dawn", "/music/hymn-to-the-dawn.mp3"],
    ["Into the Wilds", "/music/into-the-wilds.mp3"],
    ["Legacy", "/music/legacy.mp3"],
    ["Phoenix", "/music/phoenix.mp3"],
    ["Reverie", "/music/reverie.mp3"],
    ["Sentinel", "/music/sentinel.mp3"],
    ["Song of the Forge", "/music/song-of-the-forge.mp3"],
    ["Uprising", "/music/uprising.mp3"],
    ["Vanguard", "/music/vanguard.mp3"],
    ["Call to Adventure (FF-style)", "/music/ff-call-to-adventure.mp3"],
    ["At Launch (FF-style)", "/music/ff-at-launch.mp3"],
    ["Alchemists Tower (FF-style)", "/music/ff-alchemists-tower.mp3"],
    ["Five Armies (FF-style)", "/music/ff-five-armies.mp3"],
    ["Crusade (FF-style)", "/music/ff-crusade.mp3"],
  ];
  const now = Date.now();
  const stmt = sqlite.prepare(`INSERT INTO battle_tracks (name, track_data, enabled, created_at) VALUES (?, ?, 1, ?)`);
  for (const [name, url] of seedTracks) {
    if (!existing.has(name)) stmt.run(name, url, now);
  }
}
// Aspect inventory: earned aspects waiting to be equipped at level 3
sqlite.exec(`CREATE TABLE IF NOT EXISTS aspect_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  aspect_asset_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);`);
// Aspect attunement: binding Awoken channel elements here. Fills → aspect born.
// Migration: aspect_attunement points -> REAL, add updated_at
try {
  const cols = sqlite.prepare(`PRAGMA table_info(aspect_attunement)`).all() as { name: string; type: string }[];
  const hasUpdatedAt = cols.some(col => col.name === "updated_at");
  const pointsCol = cols.find(col => col.name === "points");
  if (cols.length > 0 && (!hasUpdatedAt || pointsCol?.type === "INTEGER")) {
    sqlite.exec(`ALTER TABLE aspect_attunement RENAME TO aspect_attunement_old`);
    sqlite.exec(`CREATE TABLE aspect_attunement (
      owner_key TEXT NOT NULL,
      element TEXT NOT NULL,
      points REAL NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (owner_key, element)
    )`);
    const now = Date.now();
    sqlite.exec(`INSERT INTO aspect_attunement (owner_key, element, points, updated_at)
      SELECT owner_key, element, CAST(points AS REAL), ${now} FROM aspect_attunement_old`);
    sqlite.exec(`DROP TABLE aspect_attunement_old`);
  }
} catch {}
sqlite.exec(`CREATE TABLE IF NOT EXISTS aspect_attunement (
  owner_key TEXT NOT NULL,
  element TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_key, element)
);`);
// Glyph library
sqlite.exec(`CREATE TABLE IF NOT EXISTS glyphs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  svg_data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);`);
// Seed the 4 canonical element glyphs
{
  const existing = sqlite.prepare(`SELECT COUNT(*) as n FROM glyphs WHERE category = 'element'`).get() as { n: number };
  if (existing.n === 0) {
    const now = Date.now();
    const glyphs: [string, string, string][] = [
      ["tide", "Tide", `<svg viewBox="0 0 60 24"><path d="M2,12 Q10,4 18,12 T34,12 T50,12" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.9"/><path d="M2,17 Q10,9 18,17 T34,17 T50,17" fill="none" stroke="currentColor" stroke-width="1" opacity="0.5"/><path d="M50,12 L60,12" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="50" cy="12" r="2" fill="currentColor" opacity="0.8"/></svg>`],
      ["sky", "Sky", `<svg viewBox="0 0 60 24"><path d="M28,12 m-8,0 a8,8 0 1,1 8,8 a6,6 0 1,0 -6,-6 a4,4 0 1,1 4,4" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.9"/><path d="M36,12 Q44,12 50,12 L60,12" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="36" cy="12" r="1.5" fill="currentColor" opacity="0.8"/></svg>`],
      ["stone", "Stone", `<svg viewBox="0 0 60 24"><path d="M6,18 L18,4 L26,12" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.9"/><path d="M18,4 L18,14 M12,11 L24,11" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.5"/><path d="M26,12 Q36,12 44,12 L60,12" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M26,12 L32,18" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4"/></svg>`],
      ["root", "Root", `<svg viewBox="0 0 60 24"><path d="M10,18 Q10,6 22,6 Q34,6 34,14" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.9"/><path d="M34,14 Q38,14 42,14 L60,14" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M22,6 Q26,2 30,4" fill="none" stroke="currentColor" stroke-width="1" opacity="0.6"/><ellipse cx="30" cy="4" rx="3" ry="1.5" fill="currentColor" opacity="0.35" transform="rotate(-25 30 4)"/><path d="M14,14 Q18,12 20,14" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.4"/></svg>`],
    ];
    const stmt = sqlite.prepare(`INSERT INTO glyphs (category, name, svg_data, created_at) VALUES ('element', ?, ?, ?)`);
    for (const [name, label, svg] of glyphs) {
      stmt.run(label, svg, now);
    }
  }
}
// Territory buildings
sqlite.exec(`CREATE TABLE IF NOT EXISTS territory_buildings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  tile_id INTEGER NOT NULL,
  building_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'building',
  placed_at INTEGER NOT NULL,
  ready_at INTEGER,
  element TEXT,
  builder_stances TEXT,
  last_harvest_at INTEGER,
  last_upkeep_at INTEGER
);`);
// UI Workspace
sqlite.exec(`CREATE TABLE IF NOT EXISTS ui_sprites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  blob_key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);`);
sqlite.exec(`CREATE TABLE IF NOT EXISTS ui_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);`);
// Additive migrations for existing tables
try { sqlite.exec(`ALTER TABLE tender_resources ADD COLUMN last_seen_at INTEGER`); } catch {}
try { sqlite.exec(`ALTER TABLE territory_buildings ADD COLUMN builder_stances TEXT`); } catch {}
try { sqlite.exec(`ALTER TABLE territory_buildings ADD COLUMN last_harvest_at INTEGER`); } catch {}
try { sqlite.exec(`ALTER TABLE territory_buildings ADD COLUMN last_upkeep_at INTEGER`); } catch {}
try { sqlite.exec(`ALTER TABLE territory_tiles ADD COLUMN height INTEGER NOT NULL DEFAULT 0`); } catch {}

// Seed the 4 extended battle tracks (with sorrowful violin). Replaces short versions.
const trackCount = sqlite.prepare(`SELECT COUNT(*) as n FROM battle_tracks`).get() as { n: number };
const newTracks = [{"name": "Unraveling Assault", "data": {"bpm": 150, "lead": [[659.25, 1], [0, 1], [783.99, 1.5], [0, 0.5], [880.0, 2], [783.99, 1], [0, 1], [880.0, 0.5], [783.99, 0.5], [659.25, 1], [587.33, 1], [659.25, 1], [1046.5, 1], [987.77, 0.5], [880.0, 0.5], [783.99, 1], [659.25, 1], [880.0, 1], [783.99, 1], [659.25, 1], [587.33, 1], [587.33, 1.5], [523.25, 0.5], [493.88, 1], [440.0, 1], [1318.51, 1], [1174.66, 0.5], [1046.5, 0.5], [987.77, 1], [880.0, 1], [783.99, 1], [880.0, 1], [987.77, 1], [1046.5, 1], [1174.66, 1], [1318.51, 1], [1174.66, 0.5], [1046.5, 0.5], [987.77, 1], [880.0, 2], [783.99, 1], [659.25, 1], [440.0, 1], [0, 1], [392.0, 1], [329.63, 1], [349.23, 1.5], [329.63, 0.5], [293.66, 1], [329.63, 1], [880.0, 0.5], [987.77, 0.5], [783.99, 0.5], [659.25, 1], [587.33, 1.5], [1046.5, 0.5], [987.77, 0.5], [880.0, 1], [783.99, 1], [659.25, 1], [880.0, 1], [783.99, 0.5], [659.25, 0.5], [587.33, 1], [523.25, 1], [587.33, 1], [523.25, 1], [493.88, 1], [440.0, 1], [880.0, 2], [783.99, 1], [659.25, 1], [587.33, 2], [440.0, 2]], "bass": [[110.0, 1], [0, 1], [110.0, 1], [0, 1], [110.0, 2], [110.0, 1], [0, 1], [110.0, 1], [110.0, 1], [110.0, 1], [110.0, 1], [174.61, 1], [174.61, 1], [174.61, 1], [174.61, 1], [196.0, 1], [196.0, 1], [196.0, 1], [196.0, 1], [164.81, 1], [164.81, 1], [164.81, 1], [164.81, 1], [110.0, 1], [110.0, 1], [110.0, 1], [110.0, 1], [174.61, 1], [174.61, 1], [174.61, 1], [174.61, 1], [130.81, 1], [130.81, 1], [130.81, 1], [130.81, 1], [196.0, 1], [196.0, 1], [196.0, 1], [196.0, 1], [146.83, 2], [146.83, 2], [164.81, 2], [164.81, 2], [110.0, 1], [110.0, 1], [220.0, 1], [110.0, 1], [174.61, 1], [174.61, 1], [220.0, 1], [174.61, 1], [196.0, 1], [196.0, 1], [196.0, 1], [196.0, 1], [164.81, 1], [164.81, 1], [196.0, 1], [164.81, 1], [110.0, 2], [196.0, 1], [174.61, 1], [164.81, 2], [110.0, 2]], "drums": "kick-hat-kick-hat-snare-hat-kick-hat", "violin": [[440.0, 3], [0, 1], [392.0, 4], [329.63, 4], [293.66, 4], [261.63, 4], [246.94, 4], [392.0, 2], [440.0, 2], [493.88, 2], [523.25, 2], [493.88, 2], [440.0, 2], [392.0, 2], [440.0, 2], [659.25, 3], [587.33, 2], [523.25, 3], [440.0, 4], [392.0, 4], [349.23, 4], [329.63, 4], [293.66, 2], [261.63, 2], [246.94, 2], [220.0, 2]]}}, {"name": "Bastion's Stand", "data": {"bpm": 120, "lead": [[440.0, 2], [523.25, 2], [659.25, 2], [880.0, 2], [659.25, 1.5], [587.33, 0.5], [523.25, 1], [587.33, 1], [659.25, 2], [783.99, 1], [659.25, 1], [880.0, 1.5], [783.99, 0.5], [659.25, 1], [587.33, 1], [523.25, 1], [587.33, 1], [493.88, 1], [0, 1], [880.0, 1], [1046.5, 1], [987.77, 1], [880.0, 1], [783.99, 1.5], [659.25, 0.5], [783.99, 2], [880.0, 1], [1046.5, 1], [1174.66, 1], [1046.5, 1], [987.77, 1.5], [783.99, 0.5], [880.0, 2], [659.25, 2], [587.33, 2], [523.25, 2], [493.88, 1], [440.0, 1], [659.25, 1], [698.46, 0.5], [659.25, 0.5], [587.33, 1], [523.25, 1], [587.33, 0.5], [659.25, 0.5], [783.99, 1], [880.0, 1], [783.99, 1], [880.0, 1], [783.99, 0.5], [880.0, 0.5], [1046.5, 1], [987.77, 1], [880.0, 1.5], [783.99, 0.5], [659.25, 2], [880.0, 2], [783.99, 1], [659.25, 1], [587.33, 1], [523.25, 1], [493.88, 1], [440.0, 1]], "bass": [[110.0, 2], [110.0, 2], [164.81, 2], [164.81, 2], [110.0, 1], [110.0, 1], [110.0, 1], [110.0, 1], [174.61, 1], [174.61, 1], [174.61, 1], [174.61, 1], [130.81, 1], [130.81, 1], [130.81, 1], [130.81, 1], [196.0, 1], [196.0, 1], [196.0, 1], [196.0, 1], [174.61, 1], [174.61, 1], [174.61, 1], [174.61, 1], [130.81, 1], [130.81, 1], [130.81, 1], [130.81, 1], [196.0, 1], [196.0, 1], [196.0, 1], [196.0, 1], [110.0, 1], [110.0, 1], [110.0, 1], [110.0, 1], [146.83, 2], [146.83, 2], [164.81, 2], [164.81, 2], [110.0, 1], [110.0, 1], [110.0, 1], [110.0, 1], [174.61, 1], [174.61, 1], [174.61, 1], [174.61, 1], [130.81, 1], [130.81, 1], [130.81, 1], [130.81, 1], [196.0, 1], [196.0, 1], [196.0, 1], [196.0, 1], [174.61, 2], [164.81, 1], [146.83, 1], [130.81, 1], [123.47, 1], [110.0, 2]], "drums": "kick-kick-snare-hat-kick-snare-kick-hat", "violin": [[261.63, 2], [293.66, 2], [261.63, 2], [246.94, 2], [523.25, 4], [493.88, 4], [440.0, 4], [392.0, 4], [523.25, 4], [587.33, 4], [659.25, 4], [587.33, 4], [392.0, 2], [440.0, 2], [493.88, 2], [523.25, 2], [349.23, 4], [392.0, 4], [440.0, 4], [392.0, 4], [293.66, 2], [261.63, 2], [246.94, 2], [220.0, 2]]}}, {"name": "The Hollow March", "data": {"bpm": 90, "lead": [[329.63, 2], [0, 1], [196.0, 1], [246.94, 2], [0, 2], [220.0, 1.5], [246.94, 0.5], [261.63, 2], [246.94, 1], [220.0, 1], [196.0, 1], [220.0, 1], [329.63, 2], [349.23, 2], [329.63, 2], [293.66, 1], [0, 1], [440.0, 1], [440.0, 1], [392.0, 1], [349.23, 1], [329.63, 2], [293.66, 1], [261.63, 1], [246.94, 1], [261.63, 1], [293.66, 1], [329.63, 1], [349.23, 1.5], [329.63, 1.5], [293.66, 1], [220.0, 1], [0, 0.5], [220.0, 0.5], [0, 1], [196.0, 1], [329.63, 2], [246.94, 2], [220.0, 1.5], [246.94, 0.5], [261.63, 2], [246.94, 1], [220.0, 1], [196.0, 1], [220.0, 1], [329.63, 1], [349.23, 1], [329.63, 1], [293.66, 1], [261.63, 1], [246.94, 1], [220.0, 2], [329.63, 1], [349.23, 1], [329.63, 2], [293.66, 1], [261.63, 1], [246.94, 1], [220.0, 1]], "bass": [[110.0, 4], [110.0, 4], [110.0, 2], [110.0, 2], [164.81, 2], [164.81, 2], [174.61, 2], [174.61, 2], [164.81, 2], [164.81, 2], [146.83, 1], [146.83, 1], [146.83, 1], [146.83, 1], [130.81, 1], [130.81, 1], [130.81, 1], [130.81, 1], [123.47, 1], [123.47, 1], [123.47, 1], [123.47, 1], [164.81, 1], [164.81, 1], [164.81, 1], [164.81, 1], [110.0, 4], [164.81, 4], [110.0, 2], [110.0, 2], [164.81, 2], [164.81, 2], [174.61, 2], [174.61, 2], [164.81, 2], [164.81, 2], [174.61, 2], [164.81, 2], [146.83, 2], [110.0, 2]], "drums": "kick-rest-rest-rest-snare-rest-rest-rest", "violin": [[293.66, 4], [329.63, 4], [329.63, 4], [293.66, 4], [261.63, 4], [246.94, 4], [523.25, 2], [493.88, 2], [440.0, 2], [392.0, 2], [349.23, 2], [329.63, 2], [293.66, 2], [329.63, 2], [523.25, 3], [493.88, 2], [440.0, 3], [293.66, 4], [261.63, 4], [246.94, 4], [220.0, 2], [0, 2], [392.0, 4], [349.23, 2], [329.63, 2]]}}, {"name": "Victory's Dawn", "data": {"bpm": 140, "lead": [[523.25, 1], [659.25, 1], [783.99, 1], [1046.5, 2], [783.99, 1], [659.25, 1], [0, 1], [659.25, 1], [783.99, 1], [880.0, 1], [783.99, 1], [659.25, 1.5], [587.33, 0.5], [523.25, 2], [587.33, 1], [659.25, 1], [698.46, 1], [659.25, 1], [587.33, 1.5], [523.25, 1.5], [0, 1], [1046.5, 1], [987.77, 0.5], [880.0, 0.5], [783.99, 1], [880.0, 1], [1046.5, 2], [783.99, 2], [880.0, 1], [783.99, 1], [698.46, 1], [659.25, 1], [587.33, 1], [659.25, 1], [523.25, 2], [659.25, 2], [587.33, 2], [523.25, 1.5], [493.88, 0.5], [523.25, 2], [659.25, 0.5], [783.99, 0.5], [880.0, 1], [783.99, 0.5], [659.25, 0.5], [587.33, 1], [659.25, 1], [698.46, 0.5], [659.25, 0.5], [587.33, 1], [523.25, 1], [587.33, 1], [659.25, 0.5], [783.99, 0.5], [880.0, 1], [783.99, 1], [659.25, 1.5], [587.33, 0.5], [523.25, 2], [659.25, 1], [587.33, 1], [523.25, 2], [392.0, 1], [523.25, 3]], "bass": [[130.81, 2], [196.0, 2], [130.81, 2], [130.81, 2], [130.81, 1], [130.81, 1], [130.81, 1], [130.81, 1], [174.61, 1], [174.61, 1], [174.61, 1], [174.61, 1], [196.0, 1], [196.0, 1], [196.0, 1], [196.0, 1], [130.81, 1], [130.81, 1], [130.81, 1], [130.81, 1], [174.61, 1], [174.61, 1], [174.61, 1], [174.61, 1], [196.0, 1], [196.0, 1], [196.0, 1], [196.0, 1], [130.81, 1], [130.81, 1], [130.81, 1], [130.81, 1], [130.81, 1], [130.81, 1], [130.81, 1], [130.81, 1], [110.0, 2], [174.61, 2], [196.0, 2], [196.0, 2], [130.81, 1], [130.81, 1], [130.81, 1], [130.81, 1], [174.61, 1], [174.61, 1], [174.61, 1], [174.61, 1], [196.0, 1], [196.0, 1], [196.0, 1], [196.0, 1], [130.81, 1], [130.81, 1], [130.81, 1], [130.81, 1], [174.61, 1], [196.0, 1], [130.81, 2], [130.81, 4]], "drums": "kick-hat-snare-hat-kick-hat-snare-hat", "violin": [[392.0, 2], [440.0, 2], [493.88, 2], [523.25, 2], [440.0, 4], [392.0, 4], [349.23, 4], [329.63, 4], [659.25, 4], [587.33, 4], [523.25, 4], [493.88, 4], [523.25, 2], [493.88, 2], [440.0, 2], [392.0, 2], [261.63, 4], [293.66, 4], [329.63, 4], [349.23, 4], [349.23, 2], [329.63, 2], [293.66, 2], [329.63, 2]]}}];
const now = Date.now();
if (trackCount.n === 0) {
  const stmt = sqlite.prepare(`INSERT INTO battle_tracks (name, track_data, enabled, created_at) VALUES (?, ?, 1, ?)`);
  for (const t of newTracks) {
    stmt.run(t.name, JSON.stringify(t.data), now);
  }
} else {
  // Update existing tracks with the extended versions (replaces short loops)
  const upd = sqlite.prepare(`UPDATE battle_tracks SET track_data = ? WHERE name = ?`);
  for (const t of newTracks) {
    upd.run(JSON.stringify(t.data), t.name);
  }
}

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
