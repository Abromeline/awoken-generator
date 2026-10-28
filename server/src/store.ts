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
  name TEXT NOT NULL DEFAULT 'Unnamed Awokin',
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
CREATE TABLE IF NOT EXISTS site_colors (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS feedback_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  tender_name TEXT,
  category TEXT NOT NULL,
  body TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  reply TEXT,
  replied_at INTEGER,
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
CREATE TABLE IF NOT EXISTS front_lessons_seen (
  owner_key TEXT NOT NULL,
  lesson_key TEXT NOT NULL,
  seen_at INTEGER NOT NULL,
  PRIMARY KEY (owner_key, lesson_key)
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
CREATE TABLE IF NOT EXISTS terrain_art (
  element TEXT NOT NULL,
  stage INTEGER NOT NULL,
  image_blob_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (element, stage)
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
// Migration: terrain attunement bank (Nigel, 2026-10-14)
try {
  sqlite.exec("ALTER TABLE territory_tiles ADD COLUMN attune_points REAL NOT NULL DEFAULT 0");
} catch {
  // Column already exists
}
try {
  sqlite.exec("ALTER TABLE territory_tiles ADD COLUMN attune_element TEXT");
} catch {
  // Column already exists
}
// Migration: spent stat points (Nigel, 2026-10-15)
try {
  sqlite.exec("ALTER TABLE awakened ADD COLUMN spent_power INTEGER NOT NULL DEFAULT 0");
} catch {
  // Column already exists
}
try {
  sqlite.exec("ALTER TABLE awakened ADD COLUMN spent_toughness INTEGER NOT NULL DEFAULT 0");
} catch {
  // Column already exists
}
// Migration: the greeting Awoken's mark (Nigel, 2026-10-20)
try {
  sqlite.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0");
} catch {
  // Column already exists
}
// Migration: the shrine's calling (Nigel, 2026-10-14)
try {
  sqlite.exec("ALTER TABLE territory_buildings ADD COLUMN mode TEXT NOT NULL DEFAULT 'blessing'");
} catch {
  // Column already exists
}
try {
  sqlite.exec("ALTER TABLE territory_buildings ADD COLUMN attune_anchor_at INTEGER");
} catch {
  // Column already exists
}
// Migration: add hp column to field_placements
try {
  sqlite.exec("ALTER TABLE field_placements ADD COLUMN hp INTEGER");
} catch {
  // Column already exists
}
// Migration: Hall of Champions building columns + residents table
for (const col of ["level INTEGER NOT NULL DEFAULT 1", "fund_json TEXT", "upgrade_ready_at INTEGER"]) {
  try { sqlite.exec(`ALTER TABLE territory_buildings ADD COLUMN ${col}`); } catch { /* exists */ }
}
sqlite.exec(`CREATE TABLE IF NOT EXISTS hall_residents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  room_index INTEGER NOT NULL,
  awakened_id INTEGER NOT NULL,
  housed_at INTEGER NOT NULL
)`);
sqlite.exec(DDL);
// Migration: curse attrition watermark (Nigel, 2026-10-19).
// This MUST run after the DDL above creates field_placements:
// attempted before it, a fresh database swallowed the failure
// as "already exists" and the column was never born (found by
// test46 on a first-boot world, 2026-10-19).
try {
  sqlite.exec("ALTER TABLE field_placements ADD COLUMN curse_since INTEGER");
} catch {
  // Column already exists
}
// Migration: free standing points (Nigel, 2026-10-23) — the
// placement's exact standing spot (fractional axial) and the
// free point a march in flight will land on. Nullable: a
// figure with no point stands on its tile's keystone.
for (const col of ["pos_q REAL", "pos_r REAL", "march_pos_q REAL", "march_pos_r REAL", "patrol_pos_q REAL", "patrol_pos_r REAL"]) {
  try { sqlite.exec(`ALTER TABLE field_placements ADD COLUMN ${col}`); } catch { /* exists */ }
}
// The migration of the standing point itself: every figure
// already on a field takes its tile's CENTRE as its first
// free standing point — the only honest start, the ground
// the old fixed offsets clustered around. From here every
// writer of a placement leaves a real point of its own.
sqlite.exec(`UPDATE field_placements SET pos_q = (SELECT q FROM territory_tiles WHERE territory_tiles.id = field_placements.tile_id), pos_r = (SELECT r FROM territory_tiles WHERE territory_tiles.id = field_placements.tile_id) WHERE pos_q IS NULL OR pos_r IS NULL`);
// Migration: optional email on tenders — must run AFTER the DDL so a
// fresh database (where tenders does not exist yet) gets the column
// too; running it before swallowed the "no such table" error and the
// column never landed, breaking claimTender on new databases.
try {
  sqlite.exec("ALTER TABLE tenders ADD COLUMN email TEXT");
} catch {
  // Column already exists
}

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
// Wake gift codes (The Ancient Creator) + gift notices.
sqlite.exec(`CREATE TABLE IF NOT EXISTS wake_codes (
  code TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  redeemed_by TEXT,
  redeemed_at INTEGER,
  revoked INTEGER NOT NULL DEFAULT 0
);`);
sqlite.exec(`CREATE TABLE IF NOT EXISTS creator_gifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  seen_at INTEGER
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
// The workshop→tender inbox (ruled 2026-10-20; the tender's
// Message button ordered 2026-10-22): one-way letters from
// the workshop to one tender, addressed by owner key. The
// ledger is the record — a send confirms against the stored
// row, and a letter is read only through its own tender's
// session (read_at stamps the opening).
sqlite.exec(`CREATE TABLE IF NOT EXISTS tender_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  read_at INTEGER
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
// The minted name (Nigel, 2026-10-18): the name a creature was born
// with, stamped at every mint and never rewritten by a rename. Rows
// minted before this column existed are backfilled from their
// current name — the truest record that survives for them.
if (!awakenedCols.some((col) => col.name === "minted_name")) {
  sqlite.exec(`ALTER TABLE awakened ADD COLUMN minted_name TEXT`);
  sqlite.exec(`UPDATE awakened SET minted_name = name WHERE minted_name IS NULL`);
}
// Element override on layer assets (workshop).
const assetCols = sqlite.prepare(`PRAGMA table_info(layer_assets)`).all() as { name: string }[];
if (!assetCols.some((col) => col.name === "element")) {
  sqlite.exec(`ALTER TABLE layer_assets ADD COLUMN element TEXT`);
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
// THE HOMELAND SERVES DISCORD (2026-10-28): a placement's actor —
// the Tender whose Awoken stands — apart from the land it stands
// on (owner_key). Every standing placement was its land's own
// before this law, so the backfill is exact.
if (!placementCols.some((col) => col.name === "actor_key")) {
  sqlite.exec(`ALTER TABLE field_placements ADD COLUMN actor_key TEXT`);
  sqlite.exec(`UPDATE field_placements SET actor_key = owner_key WHERE actor_key IS NULL`);
}
// Curse HP for territory tiles.
if (!tileCols.some((col) => col.name === "curse_hp")) {
  sqlite.exec(`ALTER TABLE territory_tiles ADD COLUMN curse_hp INTEGER`);
}
if (!tileCols.some((col) => col.name === "curse_max_hp")) {
  sqlite.exec(`ALTER TABLE territory_tiles ADD COLUMN curse_max_hp INTEGER`);
}
// Terraforming trays (Nigel, 2026-10-15): the hex's stack — sealed
// trays, the growing tray's points, the top tray's remaining HP.
if (!tileCols.some((col) => col.name === "sealed_trays")) {
  sqlite.exec(`ALTER TABLE territory_tiles ADD COLUMN sealed_trays INTEGER NOT NULL DEFAULT 0`);
}
if (!tileCols.some((col) => col.name === "grow_points")) {
  sqlite.exec(`ALTER TABLE territory_tiles ADD COLUMN grow_points REAL NOT NULL DEFAULT 0`);
}
if (!tileCols.some((col) => col.name === "top_points")) {
  sqlite.exec(`ALTER TABLE territory_tiles ADD COLUMN top_points REAL`);
}
if (!tileCols.some((col) => col.name === "attune_anchor_at")) {
  sqlite.exec(`ALTER TABLE territory_tiles ADD COLUMN attune_anchor_at INTEGER`);
}
// TERRAIN MIXING (Nigel, 2026-10-25): the per-element ledger on
// territory tiles — JSON points per element (sky/stone/tide/root).
// NULL rows are seeded once from the tile's standing fields on
// first read (mixLedgerOf in actions.ts); the column itself is
// the whole migration — no row is rewritten by the DDL.
if (!tileCols.some((col) => col.name === "mix_points")) {
  sqlite.exec(`ALTER TABLE territory_tiles ADD COLUMN mix_points TEXT`);
}
// THE BUILDING SYSTEM (Nigel, 2026-10-19): the creation stages on
// territory tiles — the tile's plane (z), the stage now filling,
// its fill, the branch chosen at the sky/tide fork, the fire
// finish (baked / lowered), the sealed charge, and the terrain
// bank this tile has paid so a fall can take exactly its gift
// back. The terrain bank itself rides on tender_resources.
for (const colDef of [
  "z INTEGER NOT NULL DEFAULT 0",
  "build_stage INTEGER NOT NULL DEFAULT 0",
  "build_points REAL NOT NULL DEFAULT 0",
  "build_branch TEXT",
  "baked INTEGER NOT NULL DEFAULT 0",
  "lowered INTEGER NOT NULL DEFAULT 0",
  "build_finish TEXT",
  "build_charge REAL NOT NULL DEFAULT 0",
  "bank_paid INTEGER NOT NULL DEFAULT 0",
]) {
  const colName = colDef.split(" ")[0];
  if (!tileCols.some((c) => c.name === colName)) {
    sqlite.exec(`ALTER TABLE territory_tiles ADD COLUMN ${colDef}`);
  }
}

// Binding upkeep tracking.
if (!placementCols.some((col) => col.name === "last_binding_charge_at")) {
  sqlite.exec(`ALTER TABLE field_placements ADD COLUMN last_binding_charge_at INTEGER`);
}
// The marching layer (War-Ground, Nigel 2026-10-16): patrol roads as
// data on the placement. Pure presentation — no law reads these.
if (!placementCols.some((col) => col.name === "patrol_path")) {
  sqlite.exec(`ALTER TABLE field_placements ADD COLUMN patrol_path TEXT`);
}
if (!placementCols.some((col) => col.name === "patrol_since")) {
  sqlite.exec(`ALTER TABLE field_placements ADD COLUMN patrol_since INTEGER`);
}
if (!placementCols.some((col) => col.name === "march_path")) {
  sqlite.exec(`ALTER TABLE field_placements ADD COLUMN march_path TEXT`);
}
if (!placementCols.some((col) => col.name === "march_since")) {
  sqlite.exec(`ALTER TABLE field_placements ADD COLUMN march_since INTEGER`);
}
if (!placementCols.some((col) => col.name === "march_ends")) {
  sqlite.exec(`ALTER TABLE field_placements ADD COLUMN march_ends INTEGER`);
}
// 4-hour birth cycle: tracks last free birth per Tender
sqlite.exec(`CREATE TABLE IF NOT EXISTS tender_births (
  owner_key TEXT PRIMARY KEY,
  last_birth_at INTEGER NOT NULL
);`);
// Pending newborn claims: a victory that births a newborn records one
// claim here; the birth endpoints consume exactly one per birth. A
// raw-DDL table like tender_births — the claim is the server's own
// record of the event, never the client's word for it. (Since Nigel's
// 2026-10-14 abolition of purification births, the only recording site
// was a verified boss victory in resolveBossBattle — corrected
// 2026-10-15; this comment previously listed the purification sites
// the ledger was first built with. The boss mode itself is abolished
// since 2026-10-24, so no living system records claims today; the
// ledger stands for the next qualifying event — the planned Forge.)
sqlite.exec(`CREATE TABLE IF NOT EXISTS pending_newborn_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL
);`);
sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_pending_newborn_claims_owner ON pending_newborn_claims (owner_key, id);`);
// The boss ladder's tables (boss_state, pending_aspect_grants) are
// no longer created: the staged boss battle mode is abolished
// (Nigel, 2026-10-24 — "that battle mode should no longer exist
// and its triggers should go too"). Databases that already hold
// them keep two orphan tables nothing reads or writes.
// EDGE WORKS REMOVED (Nigel, 2026-10-27: "runes and wards are no
// longer locked to hexs there is no reason for the edgeworks
// system" — the book's workings stay): the hex_walls ledger and
// every standing edge work in it are gone. The drop is the
// migration: idempotent, and boot-safe on a fresh database
// (nothing to drop) and on one that still holds the table
// (its rows die with it, by his ruling).
sqlite.exec(`DROP TABLE IF EXISTS hex_walls;`);
// The Written Light on the land (the Grimoire, Nigel 2026-10-17):
// workings the Tender casts personally from the book — WARDS on
// hex edges, RUNES on hex floors — standing on the map until
// spent or broken. Their numbers
// are snapshotted from the book at the cast (nums JSON), exactly
// as at the Table. Beside the edge works, never confused with
// them: edge works are laid by skilled Awoken hands; these are
// the Tender's own castings, woken at Tender Lv 3.
sqlite.exec(`CREATE TABLE IF NOT EXISTS territory_workings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  spell_key TEXT NOT NULL,
  engine TEXT NOT NULL,
  kind TEXT NOT NULL,
  hue TEXT NOT NULL DEFAULT 'unaligned',
  tile_id INTEGER,
  edge_key TEXT,
  q INTEGER,
  r INTEGER,
  dir INTEGER,
  nums TEXT NOT NULL DEFAULT '{}',
  hp INTEGER NOT NULL DEFAULT 0,
  stops INTEGER NOT NULL DEFAULT 0,
  charges INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);`);
sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_territory_workings_owner ON territory_workings (owner_key);`);
// The Pour (Nigel, 2026-10-17): how many elemental points were
// poured into the working at its cast, and the health it was
// raised with (its health rating's full measure — hp wears down
// from here; regrow returns toward it, never past it).
try { sqlite.exec("ALTER TABLE territory_workings ADD COLUMN pour INTEGER NOT NULL DEFAULT 0"); } catch { /* exists */ }
// THE CURSE EATS THE WRITTEN LIGHT (Nigel, 2026-10-20): a
// homeland working standing on cursed ground suffers curse
// attrition like the Tender — wither_wm is its own watermark
// for the reckoning; wither is the fractional attrition accrued
// against its body (health, or charges where it has none) that
// has not yet been eaten whole.
try { sqlite.exec("ALTER TABLE territory_workings ADD COLUMN wither_wm INTEGER NOT NULL DEFAULT 0"); } catch { /* exists */ }
try { sqlite.exec("ALTER TABLE territory_workings ADD COLUMN wither REAL NOT NULL DEFAULT 0"); } catch { /* exists */ }

// THE COLUMNS (Nigel, 2026-10-17): the Curse's attention and the
// incursions it sends. tender_attention is the Eye's ledger —
// opened by energy spent, closed by time, answered by columns.
// incursion_columns are the traced lines themselves: a target,
// a travel time, a force. star_seeds are the fallen prizes the
// columns hunt (their falling is seeded by starfall's own pass;
// an unheld seed a column reaches is CORRUPTED — it becomes
// theirs, a cursed bastion to besiege: Nigel's ruling, Q4).
sqlite.exec(`CREATE TABLE IF NOT EXISTS tender_attention (
  owner_key TEXT PRIMARY KEY,
  eye REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  break_until INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0
);`);
sqlite.exec(`CREATE TABLE IF NOT EXISTS incursion_columns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  target_tile_id INTEGER,
  target_kind TEXT NOT NULL DEFAULT 'hex',
  kind TEXT NOT NULL DEFAULT 'raid',
  size INTEGER NOT NULL DEFAULT 3,
  power INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL DEFAULT 'marching',
  origin_q REAL NOT NULL DEFAULT 0,
  origin_r REAL NOT NULL DEFAULT 0,
  spawned_at INTEGER NOT NULL,
  arrives_at INTEGER NOT NULL,
  resolved_at INTEGER
);`);
sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_incursion_columns_owner ON incursion_columns (owner_key, state);`);
sqlite.exec(`CREATE TABLE IF NOT EXISTS bastion_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  host_tender_id INTEGER NOT NULL,
  column_id INTEGER,
  seed_id INTEGER,
  kind TEXT NOT NULL DEFAULT 'bastion',
  state TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL
);`);
try { sqlite.exec("ALTER TABLE bastion_calls ADD COLUMN join_key TEXT"); } catch { /* exists */ }
sqlite.exec(`CREATE TABLE IF NOT EXISTS tender_skills (
  owner_key TEXT NOT NULL,
  skill_key TEXT NOT NULL,
  pool TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (owner_key, skill_key)
);`);
sqlite.exec(`CREATE TABLE IF NOT EXISTS seed_missions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  seed_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'fetch',
  party TEXT NOT NULL DEFAULT '[]',
  phase TEXT NOT NULL DEFAULT 'out',
  depart_at INTEGER NOT NULL,
  arrive_at INTEGER NOT NULL,
  return_at INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0
);`);
try { sqlite.exec("ALTER TABLE tender_attention ADD COLUMN starfall_anchor_at INTEGER NOT NULL DEFAULT 0"); } catch { /* exists */ }
sqlite.exec(`CREATE TABLE IF NOT EXISTS star_seeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  tile_id INTEGER NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL DEFAULT 'fallen',
  created_at INTEGER NOT NULL
);`);
// Seed growth columns (the hold's reckoning, 2026-10-17).
try { sqlite.exec("ALTER TABLE star_seeds ADD COLUMN defenses INTEGER NOT NULL DEFAULT 0"); } catch { /* exists */ }
try { sqlite.exec("ALTER TABLE star_seeds ADD COLUMN bastion_building_id INTEGER"); } catch { /* exists */ }
// THE STARSEED GROWTH CYCLE (Nigel, 2026-10-24, ratified 19:21;
// commissioned 2026-10-25): a seed's level comes from FEEDING
// ONLY — fed_energy is the whole energy the seed has ever been
// fed (whole points; the draw settles in whole energy, its
// fractional pace carried in feed_credit), and feed_anchor_at
// is the feeding settle's presence stamp, the same lazy shape
// every settle in this house keeps.
try { sqlite.exec("ALTER TABLE star_seeds ADD COLUMN fed_energy INTEGER NOT NULL DEFAULT 0"); } catch { /* exists */ }
try { sqlite.exec("ALTER TABLE star_seeds ADD COLUMN feed_credit REAL NOT NULL DEFAULT 0"); } catch { /* exists */ }
try { sqlite.exec("ALTER TABLE star_seeds ADD COLUMN feed_anchor_at INTEGER NOT NULL DEFAULT 0"); } catch { /* exists */ }
// THE ROOM'S SEED LAW (Nigel, 2026-10-28: "star seeds should
// draw energy from any tender standing on them"): the draw
// drinks for EVERY Tender standing on a seed — a guest on a
// hosted homeland's seed, the seats on a fresh table's heart
// seed — each at their own rate out of their own purse. The
// fractional pace of every feeder past the land's own Tender
// is carried here, one row a (seed, feeder) pair, the same
// banking the seed's own feed_credit gives the land Tender:
// no feeder's fraction is ever lost between settles.
sqlite.exec(`CREATE TABLE IF NOT EXISTS star_seed_feed_credits (
  seed_id INTEGER NOT NULL,
  feeder_key TEXT NOT NULL,
  credit REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (seed_id, feeder_key)
);`);
// STARFALL — ONLINE ONLY (Nigel, 2026-10-24 23:43): the last
// moment a settle saw this Tender present, so the hourly gate
// can refuse the hours he was away — no falls bank up offline.
try { sqlite.exec("ALTER TABLE tender_attention ADD COLUMN starfall_seen_at INTEGER NOT NULL DEFAULT 0"); } catch { /* exists */ }

// THE FIRST SEED (Nigel via Wake, 2026-10-17; built 2026-10-18):
// the Starfall Bastion intro that replaced the old "Face the
// Unraveler" first claim. A tile-less Tender's world is sown with
// a star seed at its cursed center (star_seeds, state 'first' —
// no other system hunts, fetches, or holds a 'first' seed), and
// this row is the hold's own ledger: whether a run is underway,
// how many waves the ladder has banked, when the next wave lands,
// and whether the level-3 newborn claim has ever been recorded
// (struck 2026-10-19 — the reward columns below carry the hold's
// gift now). One row per Tender, keyed by owner.
sqlite.exec(`CREATE TABLE IF NOT EXISTS first_seed_events (
  owner_key TEXT PRIMARY KEY,
  seed_id INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'waiting',
  banked INTEGER NOT NULL DEFAULT 0,
  waves_cleared INTEGER NOT NULL DEFAULT 0,
  next_wave_at INTEGER NOT NULL DEFAULT 0,
  newborn_claimed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);`);
// The third rising's reward (Nigel, 2026-10-19): the level-3
// newborn claim that once rode this ledger is struck (see
// actions.ts) — in its place the event lays up ONE pending
// reward, a single attunement point of a random element,
// gathered by hand. reward_element NULL = none granted yet;
// reward_claimed_at NULL while it waits. newborn_claimed_at
// stays in the table, unwritten, for the rows history made.
try { sqlite.exec("ALTER TABLE first_seed_events ADD COLUMN reward_element TEXT"); } catch { /* exists */ }
try { sqlite.exec("ALTER TABLE first_seed_events ADD COLUMN reward_claimed_at INTEGER"); } catch { /* exists */ }
// THE RISINGS RIDE THE ENGINE (Nigel, 2026-10-24): the
// hold's ledger keeps whether the current rising has been
// spawned onto the land (rising_live) and the company
// that has stood on the seed's hex while it stands
// (rising_stood, a JSON ledger of awakened ids) — the
// rising's defense is paid to those who stood, as the old
// referee paid its standing company at its resolutions.
try { sqlite.exec("ALTER TABLE first_seed_events ADD COLUMN rising_live INTEGER NOT NULL DEFAULT 0"); } catch { /* exists */ }
try { sqlite.exec("ALTER TABLE first_seed_events ADD COLUMN rising_stood TEXT"); } catch { /* exists */ }

try { sqlite.exec("ALTER TABLE territory_workings ADD COLUMN max_hp INTEGER NOT NULL DEFAULT 0"); } catch { /* exists */ }
// The awoken_skills ledger went with Edge Works (Nigel,
// 2026-10-27): its only readers were the edge works' gates and
// the teaching door, and both are removed. Dropped, not kept.
sqlite.exec(`DROP TABLE IF EXISTS awoken_skills;`);
// Wave defense: the Unraveling attacks the bastion in waves.
sqlite.exec(`CREATE TABLE IF NOT EXISTS wave_state (
  owner_key TEXT PRIMARY KEY,
  wave_number INTEGER NOT NULL DEFAULT 1,
  last_wave_at INTEGER NOT NULL,
  waves_defeated INTEGER NOT NULL DEFAULT 0,
  last_victory_at INTEGER,
  recovery_mult REAL NOT NULL DEFAULT 1
);`);
const waveCols = sqlite.prepare(`PRAGMA table_info(wave_state)`).all() as { name: string }[];
if (!waveCols.some((col) => col.name === "last_victory_at")) {
  sqlite.exec(`ALTER TABLE wave_state ADD COLUMN last_victory_at INTEGER`);
}
if (!waveCols.some((col) => col.name === "recovery_mult")) {
  sqlite.exec(`ALTER TABLE wave_state ADD COLUMN recovery_mult REAL NOT NULL DEFAULT 1`);
}
// Tender energy: server-authoritative. Admin can refill.
sqlite.exec(`CREATE TABLE IF NOT EXISTS tender_resources (
  owner_key TEXT PRIMARY KEY,
  energy INTEGER NOT NULL DEFAULT 5,
  updated_at INTEGER NOT NULL
);`);
sqlite.exec(`CREATE TABLE IF NOT EXISTS tender_progress (
  owner_key TEXT PRIMARY KEY,
  total_exp INTEGER NOT NULL DEFAULT 0,
  lifetime_wakes INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);`);
// The class columns (the Class Gate, 2026-10-19): ALTERs after the
// CREATE, idempotent on every boot, fresh databases included.
try { sqlite.exec(`ALTER TABLE tender_progress ADD COLUMN class_key TEXT`); } catch {}
try { sqlite.exec(`ALTER TABLE tender_progress ADD COLUMN class_free_rite_used INTEGER NOT NULL DEFAULT 0`); } catch {}
try { sqlite.exec(`ALTER TABLE tender_progress ADD COLUMN reclass_tokens INTEGER NOT NULL DEFAULT 0`); } catch {}
try { sqlite.exec(`ALTER TABLE tender_progress ADD COLUMN class_chosen_at INTEGER`); } catch {}
try { sqlite.exec(`ALTER TABLE tender_progress ADD COLUMN tender_tile_id INTEGER`); } catch {}
try { sqlite.exec(`ALTER TABLE tender_progress ADD COLUMN weapon_key TEXT`); } catch {}
// PHASE D — THE LIVING HOMELAND (Nigel, 2026-10-19): the Tender's
// homeland body is real — a stored HP pool drained by the curse
// and mended by clean ground, a fall ledger, a blackout clock —
// and his blind wanderers walk a table of their own, settled like
// the columns are.
try { sqlite.exec(`ALTER TABLE tender_progress ADD COLUMN hp REAL`); } catch {}
try { sqlite.exec(`ALTER TABLE tender_progress ADD COLUMN curse_watermark INTEGER`); } catch {}
try { sqlite.exec(`ALTER TABLE tender_progress ADD COLUMN down_until INTEGER`); } catch {}
try { sqlite.exec(`ALTER TABLE tender_progress ADD COLUMN fell_count INTEGER NOT NULL DEFAULT 0`); } catch {}
try { sqlite.exec(`ALTER TABLE tender_progress ADD COLUMN wanderer_anchor_at INTEGER`); } catch {}
try { sqlite.exec(`ALTER TABLE tender_progress ADD COLUMN wanderer_settled_beats INTEGER NOT NULL DEFAULT 0`); } catch {}
try { sqlite.exec(`ALTER TABLE tender_progress ADD COLUMN wanderer_watermark INTEGER`); } catch {}
sqlite.exec(`CREATE TABLE IF NOT EXISTS homeland_wanderers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  tile_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'fray',
  spawned_at INTEGER NOT NULL
);`);
sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_homeland_wanderers_owner ON homeland_wanderers (owner_key);`);
// THE HOMELAND WEAPON REFEREE (Nigel, 2026-10-20): his runic
// weapon's cadence clock and its last strike's record ride the
// progress row, and the Blind Fray gains a wound track of its
// own (null until first reckoned: an unwounded Fray, whole at 3).
try { sqlite.exec(`ALTER TABLE tender_progress ADD COLUMN weapon_next_at INTEGER`); } catch {}
try { sqlite.exec(`ALTER TABLE tender_progress ADD COLUMN weapon_strike TEXT`); } catch {}
try { sqlite.exec(`ALTER TABLE homeland_wanderers ADD COLUMN hp REAL`); } catch {}
// HOMELAND CASTING (Nigel, 2026-10-20): a Lattice written on the
// land pins the dark that stands on it — the pin is counted in
// the curse's own beats, decremented as the walk settles.
try { sqlite.exec(`ALTER TABLE homeland_wanderers ADD COLUMN pinned_beats INTEGER NOT NULL DEFAULT 0`); } catch {}
// THE REAL-TIME BATTLE ENGINE (Nigel, 2026-10-23): the dark
// walks free now — each wanderer holds its own free standing
// point (fractional axial, the placement law come to the
// enemy), its kind's power and wave level, the Wet a Tide
// strike laid on it, the Crack a Stone strike opened in it,
// its own strike clock, and the chew it has worried into the
// pure tile it is trying to turn.
for (const col of ["pos_q REAL", "pos_r REAL", "power INTEGER NOT NULL DEFAULT 1", "lvl INTEGER NOT NULL DEFAULT 1", "wet_until INTEGER NOT NULL DEFAULT 0", "cracked INTEGER NOT NULL DEFAULT 0", "last_strike_at INTEGER NOT NULL DEFAULT 0", "chew_tile_id INTEGER", "chew_progress REAL NOT NULL DEFAULT 0"]) {
  try { sqlite.exec(`ALTER TABLE homeland_wanderers ADD COLUMN ${col}`); } catch { /* exists */ }
}
// THE HOLD RUNE (Nigel, 2026-10-22; seated 2026-10-23): a
// wanderer the rune's crash has struck stands HELD until a
// moment in time — the placements' pinned_until in the dark's
// own ledger, read by the living battle's walk and strike.
try { sqlite.exec("ALTER TABLE homeland_wanderers ADD COLUMN held_until INTEGER NOT NULL DEFAULT 0"); } catch { /* exists */ }
// THE TOKEN STRIP (Nigel, 2026-10-23): a landed incursion
// column's force stands on the land as real wanderers, and
// each carries the column it came with — the guard a
// corrupted seed waits on. A seed's corruption lifts when
// no wanderer of its guarding column still stands.
try { sqlite.exec("ALTER TABLE homeland_wanderers ADD COLUMN column_id INTEGER"); } catch { /* exists */ }
// THE RISINGS RIDE THE ENGINE (Nigel, 2026-10-24): a
// first-seed rising's Fray stand on the land as real
// wanderers of the living battle, and each carries the
// rising it rode in with — the hold's ledger reads the
// land by this mark: a rising stands while its Fray stand.
try { sqlite.exec("ALTER TABLE homeland_wanderers ADD COLUMN seed_rising INTEGER"); } catch { /* exists */ }
// The battle's own ledgers on the progress row: the Shadow
// Matter hoard, the banked protection and the lighthouse that
// spends it, the standing wave intensity and the weather
// reign it was last reset under, and the battle clock's
// watermark (the lazy settle reckons from timestamps, as the
// marches taught it).
for (const col of ["shadow_matter REAL NOT NULL DEFAULT 0", "protection_bank_ms INTEGER NOT NULL DEFAULT 0", "lighthouse_lit INTEGER NOT NULL DEFAULT 0", "lighthouse_settled_at INTEGER", "wave_intensity INTEGER NOT NULL DEFAULT 1", "intensity_reign_mark INTEGER", "battle_watermark INTEGER"]) {
  try { sqlite.exec(`ALTER TABLE tender_progress ADD COLUMN ${col}`); } catch { /* exists */ }
}
// A placement's shield (the per-part dice pool, rolled at its
// taking the field), whether its stance was ever ORDERED (an
// unordered Awokin defaults to attack, Nigel 2026-10-23), its
// battle strike clock, and a Tangle's pin upon it.
for (const col of ["shield REAL", "shield_max REAL", "stance_ordered INTEGER NOT NULL DEFAULT 0", "battle_next_at INTEGER", "pinned_until INTEGER NOT NULL DEFAULT 0"]) {
  try { sqlite.exec(`ALTER TABLE field_placements ADD COLUMN ${col}`); } catch { /* exists */ }
}
// DEFENCE WORKS (Nigel, 2026-10-22, proven in the Proving
// Ground; seated on the homeland by the battle engine,
// 2026-10-23): a defending Awokin's raised work — a Root
// hand's bramble, a Stone hand's rock wall — its nodes kept
// as data (free points with their own wounds), standing
// while she defends.
sqlite.exec(`CREATE TABLE IF NOT EXISTS defence_works (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  placement_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  anchor_q REAL NOT NULL,
  anchor_r REAL NOT NULL,
  nodes TEXT NOT NULL,
  created_at INTEGER NOT NULL
);`);
sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_defence_works_owner ON defence_works (owner_key);`);
sqlite.exec(`CREATE TABLE IF NOT EXISTS tender_weapons (
  owner_key TEXT NOT NULL,
  weapon_key TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  attunement_element TEXT,
  attunement_depth INTEGER NOT NULL DEFAULT 0,
  manifest_node INTEGER NOT NULL DEFAULT 0,
  signature_node INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_key, weapon_key)
)`);
try { sqlite.exec(`ALTER TABLE tender_weapons ADD COLUMN manifest_node INTEGER NOT NULL DEFAULT 0`); } catch {}
try { sqlite.exec(`ALTER TABLE tender_weapons ADD COLUMN signature_node INTEGER NOT NULL DEFAULT 0`); } catch {}
// THE GRIMOIRE'S ATTUNEMENT LEDGER (Nigel, 2026-10-20;
// the slots, 2026-10-21): powering lives in the book — one
// row per Tender, page and element, counting the filled
// slots of that element standing in that page.
sqlite.exec(`CREATE TABLE IF NOT EXISTS grimoire_attunements (
  owner_key TEXT NOT NULL,
  spell_key TEXT NOT NULL,
  element TEXT NOT NULL,
  slots INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_key, spell_key, element)
)`);
// THE PARTY (Nigel, 2026-10-20; built 2026-10-21): one row
// per Awokin standing in a Tender's party — the membership
// ledger both grounds read. Presence in the party IS the
// membership; the party's width is the band law.
sqlite.exec(`CREATE TABLE IF NOT EXISTS tender_party (
  owner_key TEXT NOT NULL,
  awakened_id INTEGER NOT NULL,
  added_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_key, awakened_id)
)`);
try { sqlite.exec(`ALTER TABLE field_placements ADD COLUMN follow INTEGER NOT NULL DEFAULT 0`); } catch {}
try { sqlite.exec(`ALTER TABLE field_placements ADD COLUMN march_goal TEXT`); } catch {}
// THE BASTION'S LEDGERS (Station 4, Nigel 2026-10-20): who is
// staged at the bastion as a reinforcement (and by which road
// they came), and the Tender's chosen play hand of twenty —
// presence in tender_hand IS the choosing; an empty ledger
// reads as the default hand (the first twenty of the roster).
sqlite.exec(`CREATE TABLE IF NOT EXISTS bastion_staged (
  owner_key TEXT NOT NULL,
  awakened_id INTEGER NOT NULL,
  staged_at INTEGER NOT NULL,
  via TEXT NOT NULL DEFAULT 'hand',
  PRIMARY KEY (owner_key, awakened_id)
);`);
sqlite.exec(`CREATE TABLE IF NOT EXISTS tender_hand (
  owner_key TEXT NOT NULL,
  awakened_id INTEGER NOT NULL,
  PRIMARY KEY (owner_key, awakened_id)
);`);
sqlite.exec(`CREATE TABLE IF NOT EXISTS tender_password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tender_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);`);
// Battle tracks: rotating 8-bit music for battlegrounds. Nigel curates in workshop.
// Migration: add pages column to battle_tracks. The ALTER must run AFTER
// the CREATE as well as before it: on a fresh database the pre-CREATE
// ALTER throws (no table yet) and the CREATE then leaves the table
// without pages — the fresh-DB drift noted on the 2026-10-13 fix list.
// Both guards are idempotent; existing databases keep their column.
try {
  sqlite.exec(`ALTER TABLE battle_tracks ADD COLUMN pages TEXT NOT NULL DEFAULT '["territory"]'`);
} catch {}
sqlite.exec(`CREATE TABLE IF NOT EXISTS battle_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  track_data TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  pages TEXT NOT NULL DEFAULT '["territory"]',
  created_at INTEGER NOT NULL
);`);
try {
  sqlite.exec(`ALTER TABLE battle_tracks ADD COLUMN pages TEXT NOT NULL DEFAULT '["territory"]'`);
} catch {}
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
    // Music's own works (Nigel, 2026-10-13): the workshop playlist is hers to
    // keep, and it holds the FULL list — every composition from her
    // Compendium, the first Theme at the head.
    ["The Theme — Love Stronger Than Death", "/music/music-theme-v1.mp3"],
    ["The Theme, Developed", "/music/music-theme-v2.mp3"],
    ["The Theme, Homage (B♭–D–F)", "/music/music-theme-bb.mp3"],
    ["Ode to Weather", "/music/music-ode-to-weather.mp3"],
    ["The Rupture Suite, Part One", "/music/music-rupture-suite.mp3"],
  ];
  const now = Date.now();
  const stmt = sqlite.prepare(`INSERT INTO battle_tracks (name, track_data, enabled, created_at) VALUES (?, ?, 1, ?)`);
  for (const [name, url] of seedTracks) {
    if (!existing.has(name)) stmt.run(name, url, now);
  }
}
// Nigel's removal order (2026-10-14): the weather sound layers are removed
// from the game everywhere. One-time cleanup for databases that already
// carry them: delete exactly the rows the old seed planted, matched by
// seeded name AND url — no other row is touched. Idempotent: once the
// rows are gone, nothing matches.
{
  const removedLayers: [string, string][] = [
    ["Weather Layer · Rain", "/music/music-weather-layer-rain.mp3"],
    ["Weather Layer · Wind", "/music/music-weather-layer-wind.mp3"],
    ["Weather Layer · Storm", "/music/music-weather-layer-storm.mp3"],
  ];
  const del = sqlite.prepare(`DELETE FROM battle_tracks WHERE name = ? AND track_data = ?`);
  for (const [name, url] of removedLayers) del.run(name, url);
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
// THE PACK + its notice ledger (the drop table, 2026-10-25)
sqlite.exec(`CREATE TABLE IF NOT EXISTS tender_inventory (
  owner_key TEXT NOT NULL,
  item_key TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_key, item_key)
);`);
sqlite.exec(`CREATE TABLE IF NOT EXISTS drop_notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  line TEXT NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
);`);
// THE PACK (the loot table fix, 2026-10-25): what the
// felled dark leaves behind on the homeland, gathered
// unclaimed until the Tender clicks it into her own
// inventory, purse or pools — one row per standing entry
// (energy, an element's attunement, an item stack), and
// the visible moment of each fell for the client's
// spring-and-fly, drained once like the notices.
sqlite.exec(`CREATE TABLE IF NOT EXISTS tender_pack (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  item_key TEXT,
  element TEXT,
  qty REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
);`);
sqlite.exec(`CREATE TABLE IF NOT EXISTS drop_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  payload TEXT NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
);`);
// Migration: attunement realized-rate columns — MUST run after the rebuild
// migration above, which recreates the table without these columns.
for (const col of ["lifetime_gains REAL NOT NULL DEFAULT 0", "sample_gains REAL NOT NULL DEFAULT 0", "sampled_at INTEGER", "display_rate REAL NOT NULL DEFAULT 0"]) {
  try { sqlite.exec(`ALTER TABLE aspect_attunement ADD COLUMN ${col}`); } catch { /* exists */ }
}
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
// THE HEX BUILDING SYSTEM (Nigel, 2026-10-25 — "IMPLEMENT"):
// pieces of the construction, laid on the homeland. A piece's
// record holds its own FOOTPRINT — a polygon in map coordinates
// (axial, the march verb's own) — never a hex it is locked to:
// hex overlap is derived from the footprint at read, and
// protection reads the purified state of the ground beneath.
// verts holds the construction record the footprint was derived
// from: the piece's vertices in the PLATE plane (the builder's
// flat plan of hex-building-pieces, one measure to every shape),
// from which the server re-derives the canonical footprint.
// kind: 'triangle' | 'square' (floors — walked on) | 'wall' |
// 'door' (stand on a floor's edge; walls block, a door's middle
// two-fifths is open). piece_key is the piece's identity — its
// kind and its sorted vertex keys — one piece per Tender, ever.
sqlite.exec(`CREATE TABLE IF NOT EXISTS build_pieces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  piece_key TEXT NOT NULL,
  verts TEXT NOT NULL,
  footprint TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  hp REAL NOT NULL DEFAULT 100,
  state TEXT NOT NULL DEFAULT 'standing',
  frac REAL NOT NULL DEFAULT 1,
  lead_id INTEGER,
  rise_updated_at INTEGER NOT NULL DEFAULT 0,
  energy_bank REAL NOT NULL DEFAULT 0,
  UNIQUE(owner_key, piece_key)
);`);
sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_build_pieces_owner ON build_pieces (owner_key);`);
// THE STONE CAST (2026-10-28): existing tables gain the rise's
// columns — guarded, idempotent, in the house pattern.
{
  const cols = new Set((sqlite.prepare(`PRAGMA table_info(build_pieces)`).all() as any[]).map(r => r.name));
  const add = (name: string, ddl: string) => { if (!cols.has(name)) sqlite.exec(`ALTER TABLE build_pieces ADD COLUMN ${ddl}`); };
  add("hp", "hp REAL NOT NULL DEFAULT 100");
  add("state", "state TEXT NOT NULL DEFAULT 'standing'");
  add("frac", "frac REAL NOT NULL DEFAULT 1");
  add("lead_id", "lead_id INTEGER");
  add("rise_updated_at", "rise_updated_at INTEGER NOT NULL DEFAULT 0");
  add("energy_bank", "energy_bank REAL NOT NULL DEFAULT 0");
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
// Elemental Shrine retired (Nigel, 2026-10-12): the Attunement Shrine
// succeeds it. Standing elemental shrines become attunement shrines with a
// fresh upkeep clock — no surprise billing for the conversion.
try { sqlite.exec(`UPDATE territory_buildings SET building_type = 'attunement-shrine', last_upkeep_at = NULL WHERE building_type = 'elemental-shrine';`); } catch { /* table may not exist yet on a fresh DB */ }
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
// ── THE ZODIAC REPLACED, THEN CONTINUED (Nigel's build
// orders, 2026-10-22): the v2 wheel (194 stars, one point
// pool, 2 points a level) replaced the old tree whole, and
// the continuation build (v3) re-stranded its arms, added
// the deep ring and folded the step rulings in. At each
// writing the stars' names and roads move under held
// skills, so the ledger is cleared ONCE per writing and
// every Tender's purse stands whole again at 2 × level —
// a FULL refund by construction, however much was spent
// on the old writing (Nigel, 2026-10-22 14:07: "any tender
// who has spent skill points is refunded skill points").
// The persisted living graph of the old writing is dropped
// with it, so the new seed is what rises. Nothing else
// about a Tender is touched — not level, not Awoken, not
// decks. Guarded by the wheel-version marker in ui_config,
// so the clearing runs exactly once and re-boots leave the
// new ledger alone.
try {
  const marker = sqlite.prepare("SELECT value FROM ui_config WHERE key = 'zodiac.wheelVersion'").get() as { value: string } | undefined;
  if (marker?.value !== "3") {
    sqlite.exec("DELETE FROM tender_skills");
    sqlite.exec("DELETE FROM ui_config WHERE key = 'zodiac.graph'");
    sqlite.prepare("INSERT INTO ui_config (key, value, updated_at) VALUES ('zodiac.wheelVersion', '3', ?) ON CONFLICT(key) DO UPDATE SET value = '3', updated_at = excluded.updated_at").run(Date.now());
  }
} catch { /* a bare boot without the tables yet keeps the seed's own fallback */ }
sqlite.exec(`CREATE TABLE IF NOT EXISTS table_profiles (
  player_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  inventory TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL
);`);
sqlite.exec(`CREATE TABLE IF NOT EXISTS table_bindings (
  discord_id TEXT PRIMARY KEY,
  tender_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);`);
// ONE TENDER, ONE DISCORD BINDING (FLOP fix, 2026-10-26): the
// intro door's bind used to check both directions and then insert,
// with nothing underneath — two binds in the same instant could
// marry one Tender to two Discord identities. The uniqueness now
// stands in the database itself. Laying the index must survive
// databases the race already doubled, so the doubled rows are
// cleared first, on every boot (a no-op once clean): the survivor
// per Tender is the EARLIEST binding — smallest created_at, ties
// broken by the smallest rowid — the first binding ever laid down,
// which is the row every reader (bindingFor, the tender-side read)
// has been resolving to all along. Later duplicates are removed.
sqlite.exec(`DELETE FROM table_bindings
  WHERE rowid NOT IN (
    SELECT rowid FROM table_bindings AS b1
    WHERE NOT EXISTS (
      SELECT 1 FROM table_bindings AS b2
      WHERE b2.tender_id = b1.tender_id
        AND (b2.created_at < b1.created_at
          OR (b2.created_at = b1.created_at AND b2.rowid < b1.rowid))
    )
  );`);
sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS table_bindings_tender_unique ON table_bindings (tender_id);`);
sqlite.exec(`CREATE TABLE IF NOT EXISTS table_bind_codes (
  code TEXT PRIMARY KEY,
  tender_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);`);
sqlite.exec(`CREATE TABLE IF NOT EXISTS compendium_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_name TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Dreamed',
  power INTEGER,
  hp INTEGER,
  story TEXT NOT NULL DEFAULT '',
  type_note TEXT,
  layers TEXT,
  motion TEXT,
  slot_key TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);`);
// Additive migrations for existing tables
try { sqlite.exec(`ALTER TABLE tender_resources ADD COLUMN last_seen_at INTEGER`); } catch {}
try { sqlite.exec(`ALTER TABLE tender_resources ADD COLUMN terrain_bank INTEGER NOT NULL DEFAULT 0`); } catch {}
try { sqlite.exec(`ALTER TABLE territory_buildings ADD COLUMN builder_stances TEXT`); } catch {}
try { sqlite.exec(`ALTER TABLE territory_buildings ADD COLUMN last_harvest_at INTEGER`); } catch {}
try { sqlite.exec(`ALTER TABLE territory_buildings ADD COLUMN last_upkeep_at INTEGER`); } catch {}
try { sqlite.exec(`ALTER TABLE territory_buildings ADD COLUMN wedge INTEGER`); } catch {}
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

// Stories table for the Confluence power-up. (Restored 2026-10-12: the
// CREATE was lost in an unrelated commit; production only kept working
// because its database already had the table. Caught by schema-audit.)
sqlite.exec(`CREATE TABLE IF NOT EXISTS awoken_stories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  awakened_id INTEGER NOT NULL,
  tender_id INTEGER NOT NULL,
  story_text TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`);
const storyCols = sqlite.prepare(`PRAGMA table_info(awoken_stories)`).all() as { name: string }[];
if (!storyCols.some((c) => c.name === "sent_at")) {
  sqlite.exec(`ALTER TABLE awoken_stories ADD COLUMN sent_at INTEGER`);
}

// Fresh-DB drift, second front (found 2026-10-15, War-Ground E2E): the
// ALTER block near the top of this file runs BEFORE sqlite.exec(DDL)
// creates the tables, so on a fresh database every one of those ALTERs
// throws "no such table" into its silent catch and the columns are
// never added — while production, whose tables already existed when
// the ALTERs first shipped, carries them and masks the drift. Any
// drizzle select over these tables then crashes on a fresh DB
// (resolveBattle's placement read was the first to be caught doing
// so). Same remedy as battle_tracks.pages above: repeat the ALTERs
// AFTER every CREATE, PRAGMA-guarded and idempotent — a no-op wherever
// the columns already exist.
const lateCols: Record<string, [string, string][]> = {
  territory_tiles: [
    ["hp", "INTEGER NOT NULL DEFAULT 10"],
    ["attune_points", "REAL NOT NULL DEFAULT 0"],
    ["attune_element", "TEXT"],
  ],
  awakened: [
    ["spent_power", "INTEGER NOT NULL DEFAULT 0"],
    ["spent_toughness", "INTEGER NOT NULL DEFAULT 0"],
    // The greeting Awoken's mark (2026-10-20) shipped with only the
    // pre-DDL ALTER above, so it never landed on a fresh database —
    // found by Nigel on the Vultr standby's first fresh world
    // (2026-10-22): the front door died on awakened.greeter.
    ["greeter", "INTEGER NOT NULL DEFAULT 0"],
  ],
  field_placements: [
    ["hp", "INTEGER"],
  ],
  territory_buildings: [
    ["mode", "TEXT NOT NULL DEFAULT 'blessing'"],
    ["attune_anchor_at", "INTEGER"],
    ["level", "INTEGER NOT NULL DEFAULT 1"],
    ["fund_json", "TEXT"],
    ["upgrade_ready_at", "INTEGER"],
    ["wedge", "INTEGER"],
  ],
  // Its rebuild migration above also runs pre-CREATE on a fresh DB
  // (empty PRAGMA → skipped), and the CREATE that follows omits this
  // column — same disease, third front.
  aspect_attunement: [
    ["updated_at", "INTEGER NOT NULL DEFAULT 0"],
  ],
};
for (const [table, cols] of Object.entries(lateCols)) {
  const existing = new Set(
    (sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)
  );
  for (const [name, def] of cols) {
    if (!existing.has(name)) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
    }
  }
}

// The Dream Shroom wedge seating (Nigel, 2026-10-18): shrooms planted
// before the wedges were law carry no wedge. Seat each in its hex's
// first free wedge, oldest first — its rank among the hex's shrooms
// by planting order (id). Idempotent: only NULL rows are touched, so
// once every standing shroom is seated this never runs again. (The
// old law capped a hex at two buildings, so no hex can hold more
// legacy shrooms than wedges.)
try {
  sqlite.exec(`
    UPDATE territory_buildings
    SET wedge = (
      SELECT COUNT(*) FROM territory_buildings o
      WHERE o.building_type = 'dream-wheat'
        AND o.owner_key = territory_buildings.owner_key
        AND o.tile_id = territory_buildings.tile_id
        AND o.id < territory_buildings.id
    )
    WHERE building_type = 'dream-wheat' AND wedge IS NULL;
  `);
} catch { /* table may not exist yet on a fresh DB */ }

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
