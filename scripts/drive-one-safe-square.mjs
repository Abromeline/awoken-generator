// ONE SAFE SQUARE, ALWAYS — FRONT-INTRO PIECE 7 DRIVE
// (Nigel, 2026-10-23 22:40: "The map at default needs to
// have one safe square at least, for the tender to rebuild
// from. My uncle is currently stuck and I'll bet other
// tenders are too.")
// Boots the real server in-process on a scratch DATA_DIR
// and proves the guarantee at its two honest joints — the
// sowing (ensureFirstSeed) and the ordinary territory read
// (getTerritory):
//   §F A FRESH MAP STARTS WITH ITS SQUARE: a brand-new
//      Tender's world is sown — the seed's hex stays CURSED
//      (the hold's ruled state untouched: event waiting,
//      unbanked, waves 0, seed 'first'), and exactly ONE
//      other tile stands purified — the nearest ground
//      beside the seed (ring 1) — neutral, curse HP gone,
//      born at height 1: purified, standable, buildable
//      ground in the territory the read serves.
//   §G THE GROUNDLESS ARE GIVEN ONE BACK: a classed Tender
//      whose EVERY tile stands cursed reads his territory —
//      the heart (0,0), the anchor chain's own address, is
//      purified in the standing shape; every other tile is
//      byte-identical; he STANDS on the square in the same
//      read (tenderStand could give him no stand before);
//      and the square is buildable (placeBuilding's own
//      gate answers on it).
//   §I IDEMPOTENT: a second read changes no tile further.
//   §U WITH SAFE GROUND, UNTOUCHED: a Tender holding a
//      purified tile of his own passes two reads with every
//      tile byte-for-byte identical — the guarantee never
//      re-purifies, moves or mints anything for him.
//   §B THE BASTION ANCHOR WINS: a groundless Tender whose
//      bastion building stands on a cursed non-heart tile
//      is given THAT tile back, not the heart — the anchor
//      chain's first choice, purified in place.
// Run: node scripts/drive-one-safe-square.mjs
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-safe-square-"));
process.env.PORT = "3998";
process.env.WORKSHOP_PASSWORD = "safe-square-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3998";
const PW = "safe-square-drive-password";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

await import("../server/dist/index.js");
await sleep(2500);

async function call(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}
async function callRaw(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
const tileRows = (ownerKey) => db.prepare("SELECT * FROM territory_tiles WHERE owner_key = ? ORDER BY id").all(ownerKey);
const tileBytes = (ownerKey) => JSON.stringify(tileRows(ownerKey));
const pureTiles = (ownerKey) => tileRows(ownerKey).filter(t => !t.cursed);
const ring = (t) => Math.max(Math.abs(t.q), Math.abs(t.r), Math.abs(t.q + t.r));

async function claimBare(name) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, Date.now());
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 500, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500").run(ownerKey, Date.now());
  return { token: claim.token, ownerKey };
}
// A small cursed world: the heart and its first ring, every
// tile cursed with its curse HP standing — a Tender stripped
// of every safe tile. (Rings 0–1 only, so the byte proofs
// below measure this law alone: the standing read re-reckons
// outer cursed tiles' HP by the ring law, its own business.)
function seedCursedWorld(ownerKey) {
  const now = Date.now();
  const ins = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, curse_hp, curse_max_hp, created_at) VALUES (?, ?, ?, 'root', 1, 10, 10, ?)");
  const ids = new Map();
  for (const [q, r] of [[0, 0], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) {
    ids.set(`${q},${r}`, Number(ins.run(ownerKey, q, r, now).lastInsertRowid));
  }
  return ids;
}
// The bytes of a fixed set of tile ids (the frontier buffer
// law mints NEW tiles around purified ground on reads where
// it stands — its own standing work, not this guarantee's;
// the byte proofs therefore hold the tiles that stood).
const tileBytesByIds = (ownerKey, ids) => JSON.stringify(tileRows(ownerKey).filter(t => ids.includes(t.id)));

/* ── §F A FRESH MAP STARTS WITH ITS SQUARE ────────────── */
console.log("§F a fresh map — sown with its safe square standing, the seed's hex left to its hold");
{
  const F = await claimBare("Fresh Map");
  const sown = await call("ensureFirstSeed", {}, F.token);
  ok("the first seed is sown", sown.created === true, JSON.stringify(sown).slice(0, 120));
  const rows = tileRows(F.ownerKey);
  const pure = pureTiles(F.ownerKey);
  ok("the sown world holds exactly ONE purified tile — the safe square",
    pure.length === 1, `${pure.length} purified of ${rows.length}`);
  const seedRow = db.prepare("SELECT tile_id AS tileId FROM star_seeds WHERE owner_key = ?").get(F.ownerKey);
  const seedTile = rows.find(t => t.id === seedRow.tileId);
  ok("the seed's hex (the heart) stays CURSED — the hold's ruled state untouched by the guarantee",
    !!seedTile && seedTile.cursed === 1 && seedTile.q === 0 && seedTile.r === 0,
    JSON.stringify(seedTile && { q: seedTile.q, r: seedTile.r, cursed: seedTile.cursed }));
  ok("the safe square stands on the nearest ground beside the seed — ring 1",
    pure.length === 1 && ring(pure[0]) === 1, JSON.stringify(pure[0] && { q: pure[0].q, r: pure[0].r }));
  ok("the square wears the standing purification shape: neutral, no curse HP, born clean at height 1",
    pure.length === 1 && pure[0].element === "neutral" && pure[0].curse_hp == null && pure[0].curse_max_hp == null
    && pure[0].height === 1 && (pure[0].sealed_trays ?? 0) === 0 && (pure[0].attune_points ?? 0) === 0,
    JSON.stringify(pure[0]));
  const ev = db.prepare("SELECT state, banked, waves_cleared FROM first_seed_events WHERE owner_key = ?").get(F.ownerKey);
  const seedState = db.prepare("SELECT state FROM star_seeds WHERE owner_key = ?").get(F.ownerKey)?.state;
  ok("the seed's ledger stands exactly as sown: event waiting and unbanked, no waves, the seed 'first'",
    ev && ev.state === "waiting" && ev.banked === 0 && ev.waves_cleared === 0 && seedState === "first",
    JSON.stringify({ ev, seedState }));
  const terr = await call("getTerritory", {}, F.token);
  const servedPure = (terr.tiles ?? []).filter(t => !t.cursed);
  ok("the territory read serves the square purified — and the read adds no second square",
    servedPure.length === 1 && pure.length === 1 && servedPure[0].id === pure[0].id,
    `served ${servedPure.length}`);
}

/* ── §G + §I THE GROUNDLESS ARE GIVEN ONE BACK ────────── */
console.log("§G a Tender stripped of every safe tile is given his heart back on the ordinary read");
{
  const G = await claimBare("Groundless");
  db.prepare("UPDATE tender_progress SET class_key = 'warden' WHERE owner_key = ?").run(G.ownerKey);
  const ids = seedCursedWorld(G.ownerKey);
  const before = tileBytes(G.ownerKey);
  ok("the stage stands: seven tiles, every one cursed, no safe ground anywhere",
    tileRows(G.ownerKey).length === 7 && pureTiles(G.ownerKey).length === 0);
  const terr = await call("getTerritory", {}, G.token);
  const rowsAfter = tileRows(G.ownerKey);
  const pure = pureTiles(G.ownerKey);
  ok("exactly one tile was purified by the read — the square",
    pure.length === 1, `${pure.length} purified`);
  ok("the square is the HEART (0,0) — the anchor chain's own address, purified in place",
    pure.length === 1 && pure[0].q === 0 && pure[0].r === 0 && pure[0].id === ids.get("0,0"),
    JSON.stringify(pure[0] && { q: pure[0].q, r: pure[0].r }));
  ok("the square wears the standing purification shape: neutral, no curse HP, born clean at height 1",
    pure.length === 1 && pure[0].element === "neutral" && pure[0].curse_hp == null && pure[0].height === 1,
    JSON.stringify(pure[0]));
  const changed = rowsAfter.filter((t, i) => JSON.stringify(t) !== JSON.stringify(JSON.parse(before)[i]));
  ok("every other tile of his world stands byte-identical — only the heart changed",
    changed.length === 1 && changed[0].id === ids.get("0,0"),
    `changed: ${changed.map(t => t.id).join(",")}`);
  const served = (terr.tiles ?? []).find(t => t.id === ids.get("0,0"));
  ok("the read itself serves the heart purified — the square is in this read, not a later one",
    !!served && !served.cursed, JSON.stringify(served && { cursed: served.cursed }));
  ok("he STANDS on the square in the same read — the stand the groundless Tender could never be given before",
    terr.tender && terr.tender.tileId === ids.get("0,0"),
    JSON.stringify(terr.tender && { tileId: terr.tender.tileId }));
  // Buildable: placeBuilding's own standing gate (a building
  // rises only on purified ground) answers on the square.
  const built = await callRaw("placeBuilding", { tileId: ids.get("0,0"), buildingType: "tree" }, G.token);
  ok("the square is BUILDABLE — a building rises on it through the standing door",
    built.status === 200 && built.data && built.data.ok !== false,
    `${built.status}: ${JSON.stringify(built.data).slice(0, 160)}`);

  console.log("§I the second read changes nothing further");
  const standingIds = tileRows(G.ownerKey).map(t => t.id);
  const settled = tileBytesByIds(G.ownerKey, standingIds);
  await call("getTerritory", {}, G.token);
  ok("a second territory read leaves every standing tile byte-identical — the guarantee sleeps once a square stands",
    tileBytesByIds(G.ownerKey, standingIds) === settled);
  ok("and still exactly one purified tile stands — no second square, ever",
    pureTiles(G.ownerKey).length === 1);
}

/* ── §U WITH SAFE GROUND, UNTOUCHED ──────────────────── */
console.log("§U a Tender holding safe ground of his own is never touched");
{
  const U = await claimBare("Safe Holder");
  db.prepare("UPDATE tender_progress SET class_key = 'warden' WHERE owner_key = ?").run(U.ownerKey);
  seedCursedWorld(U.ownerKey);
  // His own square, won his own way: a ring-1 tile purified
  // in the standing shape, with a tray already growing on it.
  const his = db.prepare("SELECT id FROM territory_tiles WHERE owner_key = ? AND q = 1 AND r = 0").get(U.ownerKey).id;
  db.prepare("UPDATE territory_tiles SET cursed = 0, element = 'stone', curse_hp = NULL, curse_max_hp = NULL, height = 1, grow_points = 7 WHERE id = ?").run(his);
  const standingIds = tileRows(U.ownerKey).map(t => t.id);
  const before = tileBytesByIds(U.ownerKey, standingIds);
  await call("getTerritory", {}, U.token);
  await call("getTerritory", {}, U.token);
  ok("two reads leave every standing tile byte-for-byte identical — nothing re-purified, moved or reset (frontier minting of NEW tiles around his ground is the buffer law's own standing work, untouched here)",
    tileBytesByIds(U.ownerKey, standingIds) === before);
  ok("the purified set is exactly his own square after both reads — the guarantee made no second square for him",
    pureTiles(U.ownerKey).length === 1 && pureTiles(U.ownerKey)[0].id === his,
    JSON.stringify(pureTiles(U.ownerKey).map(t => t.id)));
  ok("his square keeps its own element and its growing tray — the guarantee did not 'improve' it",
    (() => { const t = tileRows(U.ownerKey).find(x => x.id === his); return t && t.element === "stone" && t.grow_points === 7; })());
}

/* ── §B THE BASTION ANCHOR WINS ───────────────────────── */
console.log("§B the bastion's tile is the anchor chain's first choice — it, not the heart, is given back");
{
  const B = await claimBare("Bastion Keeper");
  db.prepare("UPDATE tender_progress SET class_key = 'warden' WHERE owner_key = ?").run(B.ownerKey);
  const ids = seedCursedWorld(B.ownerKey);
  const bastionTileId = ids.get("1,0");
  const now = Date.now();
  const buildingId = Number(db.prepare("INSERT INTO territory_buildings (owner_key, tile_id, building_type, status, placed_at) VALUES (?, ?, 'bastion', 'active', ?)").run(B.ownerKey, bastionTileId, now).lastInsertRowid);
  db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, bastion_building_id, created_at) VALUES (?, ?, 3, 'held', ?, ?)").run(B.ownerKey, bastionTileId, buildingId, now);
  await call("getTerritory", {}, B.token);
  const pure = pureTiles(B.ownerKey);
  ok("the bastion's own tile is the square given back — purified in place",
    pure.length === 1 && pure[0].id === bastionTileId,
    JSON.stringify(pure.map(t => [t.q, t.r])));
  ok("the heart stays cursed — the chain's first choice stood, no second square was made",
    (() => { const h = tileRows(B.ownerKey).find(t => t.id === ids.get("0,0")); return h && h.cursed === 1; })());
}

console.log(`\nONE SAFE SQUARE DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
