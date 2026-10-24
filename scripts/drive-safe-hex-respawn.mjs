// THE SAFE HEX'S OFFICE: RESPAWN — DRIVE
// (Nigel, 2026-10-23 23:26: "The Tender respawns there if
// there is no bastion." — and 2026-10-23 23:25: the
// rebuilding ground is ONE SAFE HEX, not "square"; the map
// is hexes.)
// The office as the player lives it: you wake at your
// bastion; with no bastion, on your safe hex — and there
// is always a safe hex.
// Boots the real server in-process on a scratch DATA_DIR
// and proves the respawn's reading of ground at its three
// honest joints, each against the real territory read
// (getTerritory — the homeland read where a fallen
// Tender's wake is settled, settleTenderBody →
// bastionAnchorTileId):
//   §B A STANDING BASTION FIRST: a fallen Tender whose
//      bastion stands on pure ground wakes ON the
//      bastion's hex — though the heart also stands pure
//      beside it, the bastion's reading wins, and he wakes
//      half-healed with the blackout lifted.
//   §H NO BASTION — THE SAFE HEX: a fallen Tender with no
//      bastion and a cursed heart wakes on the safe hex —
//      the guarantee's own address: the nearest pure
//      ground to the heart BY THE RING LAW (the measure
//      ensureOneSafeSquare walks). The stage is built to
//      discriminate: pure hex A at (2,-2) stands at ring 2
//      (|q|+|r| = 4) and pure hex B at (3,0) at ring 3
//      (|q|+|r| = 3) — the pre-office reading, reckoned by
//      |q|+|r|, would have woken him on B; the office
//      wakes him on A, the hex the guarantee names.
//   §G THE GROUNDLESS — THE BACKFILL AND THE OFFICE AS
//      ONE: a bastionless Tender stripped of ALL standing
//      ground, lying fallen, reads his territory — piece
//      7's guarantee fires FIRST in the read and restores
//      his safe hex (the heart), and the respawn in the
//      SAME read wakes him on that very hex: the hex the
//      guarantee restored is the hex the respawn reads.
// The fall itself is fixtured at its settled state (hp 0,
// fell_count 1, blackout already run out) — this drive
// proves the respawn's READING of ground, not the fall's
// price or timing, which this build does not touch.
// Run: node scripts/drive-safe-hex-respawn.mjs
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-safe-hex-respawn-"));
process.env.PORT = "3996";
process.env.WORKSHOP_PASSWORD = "safe-hex-respawn-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3996";
const PW = "safe-hex-respawn-drive-password";
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

const db = new Database(join(process.env.DATA_DIR, "app.db"));
const tileRows = (ownerKey) => db.prepare("SELECT * FROM territory_tiles WHERE owner_key = ? ORDER BY id").all(ownerKey);
const pureTiles = (ownerKey) => tileRows(ownerKey).filter(t => !t.cursed);
const ring = (t) => Math.max(Math.abs(t.q), Math.abs(t.r), Math.abs(t.q + t.r));

async function claimBare(name) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, Date.now());
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 500, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500").run(ownerKey, Date.now());
  db.prepare("UPDATE tender_progress SET class_key = 'warden' WHERE owner_key = ?").run(ownerKey);
  return { token: claim.token, ownerKey };
}
// A small cursed world: the heart and its first ring, every
// tile cursed — a Tender stripped of every safe hex.
function seedCursedWorld(ownerKey) {
  const now = Date.now();
  const ins = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, curse_hp, curse_max_hp, created_at) VALUES (?, ?, ?, 'root', 1, 10, 10, ?)");
  const ids = new Map();
  for (const [q, r] of [[0, 0], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) {
    ids.set(`${q},${r}`, Number(ins.run(ownerKey, q, r, now).lastInsertRowid));
  }
  return ids;
}
// A tile standing purified, in the standing shape.
function addPureTile(ownerKey, q, r) {
  return Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, curse_hp, curse_max_hp, height, created_at) VALUES (?, ?, ?, 'stone', 0, NULL, NULL, 1, ?)")
    .run(ownerKey, q, r, Date.now()).lastInsertRowid);
}
function purifyInPlace(tileId) {
  db.prepare("UPDATE territory_tiles SET cursed = 0, element = 'neutral', curse_hp = NULL, curse_max_hp = NULL, height = 1 WHERE id = ?").run(tileId);
}
// The fall, at its settled state: the pool emptied, the
// fall entered in the ledger, the blackout already run
// out — the next read is the wake itself.
function layFallen(ownerKey, tileId) {
  db.prepare("UPDATE tender_progress SET hp = 0, curse_watermark = NULL, down_until = ?, fell_count = 1, tender_tile_id = ? WHERE owner_key = ?")
    .run(Date.now() - 1000, tileId, ownerKey);
}

/* ── §B A STANDING BASTION FIRST ─────────────────────── */
console.log("§B a fallen Tender with a standing bastion wakes at the bastion");
{
  const B = await claimBare("Bastion Wake");
  const ids = seedCursedWorld(B.ownerKey);
  const heartId = ids.get("0,0");
  const bastionTileId = ids.get("1,0");
  // Both the heart and the bastion's hex stand pure: if
  // the reading fell through to the safe hex, he would
  // wake on the heart — the bastion must win outright.
  purifyInPlace(heartId);
  purifyInPlace(bastionTileId);
  const now = Date.now();
  const buildingId = Number(db.prepare("INSERT INTO territory_buildings (owner_key, tile_id, building_type, status, placed_at) VALUES (?, ?, 'bastion', 'active', ?)").run(B.ownerKey, bastionTileId, now).lastInsertRowid);
  db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, bastion_building_id, created_at) VALUES (?, ?, 3, 'held', ?, ?)").run(B.ownerKey, bastionTileId, buildingId, now);
  layFallen(B.ownerKey, ids.get("0,1"));
  const terr = await call("getTerritory", {}, B.token);
  ok("he wakes ON the bastion's hex — a standing bastion is read first",
    terr.tender && terr.tender.tileId === bastionTileId,
    JSON.stringify(terr.tender && { tileId: terr.tender.tileId }));
  ok("not on the heart, though the heart stands pure — the bastion's reading is not the fallback's",
    terr.tender && terr.tender.tileId !== heartId);
  ok("he wakes half-healed with the blackout lifted — the fall's standing price, unchanged",
    terr.tender && terr.tender.down === false && terr.tender.hp === terr.tender.maxHp / 2 && terr.tender.fellCount === 1,
    JSON.stringify(terr.tender && { hp: terr.tender.hp, maxHp: terr.tender.maxHp, down: terr.tender.down, fellCount: terr.tender.fellCount }));
  const row = db.prepare("SELECT tender_tile_id AS tileId FROM tender_progress WHERE owner_key = ?").get(B.ownerKey);
  ok("the wake is written down: his stand IS the bastion's hex in the ledger",
    row && row.tileId === bastionTileId, JSON.stringify(row));
}

/* ── §H NO BASTION — THE SAFE HEX ────────────────────── */
console.log("§H a fallen Tender with no bastion wakes on the safe hex — the guarantee's own address");
{
  const H = await claimBare("Safe Hex Wake");
  const ids = seedCursedWorld(H.ownerKey);
  const aId = addPureTile(H.ownerKey, 2, -2); // ring 2, |q|+|r| 4
  const bId = addPureTile(H.ownerKey, 3, 0);  // ring 3, |q|+|r| 3
  const pure = pureTiles(H.ownerKey);
  const byOldMeasure = [...pure].sort((x, y) => (Math.abs(x.q) + Math.abs(x.r)) - (Math.abs(y.q) + Math.abs(y.r)) || x.id - y.id)[0];
  const byRingLaw = [...pure].sort((x, y) => ring(x) - ring(y) || x.id - y.id)[0];
  ok("the stage discriminates: the old |q|+|r| reading names hex B, the ring law names hex A",
    byOldMeasure && byOldMeasure.id === bId && byRingLaw && byRingLaw.id === aId,
    JSON.stringify({ old: byOldMeasure && byOldMeasure.id, ring: byRingLaw && byRingLaw.id, aId, bId }));
  ok("the heart stands CURSED — the safe hex here is not the heart but the nearest pure ground to it",
    (() => { const h = tileRows(H.ownerKey).find(t => t.id === ids.get("0,0")); return h && h.cursed === 1; })());
  layFallen(H.ownerKey, ids.get("1,0"));
  const terr = await call("getTerritory", {}, H.token);
  ok("he wakes on hex A — the safe hex by the guarantee's ring law, not the pre-office measure's hex B",
    terr.tender && terr.tender.tileId === aId,
    JSON.stringify(terr.tender && { tileId: terr.tender.tileId }));
  ok("he wakes half-healed with the blackout lifted — the fall's standing price, unchanged",
    terr.tender && terr.tender.down === false && terr.tender.hp === terr.tender.maxHp / 2 && terr.tender.fellCount === 1,
    JSON.stringify(terr.tender && { hp: terr.tender.hp, maxHp: terr.tender.maxHp, down: terr.tender.down, fellCount: terr.tender.fellCount }));
}

/* ── §G THE GROUNDLESS — BACKFILL AND OFFICE AS ONE ──── */
console.log("§G a bastionless Tender stripped of all ground wakes on the hex the guarantee restored");
{
  const G = await claimBare("Groundless Wake");
  const ids = seedCursedWorld(G.ownerKey);
  layFallen(G.ownerKey, ids.get("1,0"));
  ok("the stage stands: seven tiles, every one cursed, no bastion, no safe hex anywhere",
    tileRows(G.ownerKey).length === 7 && pureTiles(G.ownerKey).length === 0);
  const terr = await call("getTerritory", {}, G.token);
  const pure = pureTiles(G.ownerKey);
  ok("the read restored exactly one safe hex — the heart, the guarantee's own address",
    pure.length === 1 && pure[0].id === ids.get("0,0"),
    JSON.stringify(pure.map(t => [t.q, t.r])));
  ok("he wakes ON that restored hex in the SAME read — the guarantee fired before the respawn was placed",
    terr.tender && terr.tender.tileId === ids.get("0,0"),
    JSON.stringify(terr.tender && { tileId: terr.tender.tileId }));
  ok("he wakes half-healed with the blackout lifted — the fall's standing price, unchanged",
    terr.tender && terr.tender.down === false && terr.tender.hp === terr.tender.maxHp / 2 && terr.tender.fellCount === 1,
    JSON.stringify(terr.tender && { hp: terr.tender.hp, maxHp: terr.tender.maxHp, down: terr.tender.down, fellCount: terr.tender.fellCount }));
}

console.log(`\nSAFE HEX RESPAWN DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
