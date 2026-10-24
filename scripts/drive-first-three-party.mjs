// THE FIRST THREE ARE THE PARTY — FRONT-INTRO PIECE 4
// DRIVE (Nigel, 2026-10-23 22:26: the Tender's first three
// Awoken "must BE the party when the Tender first goes to
// the field — following along outside in the party as they
// should be to help defend and fight that first battle to
// defend the starseed").
// Boots the real server in-process on a scratch DATA_DIR
// and proves the wiring at its honest joint — the first
// getTerritory read on which a Tender stands on his land:
//   §A THE FIRST ENTRY: a classed Tender (the ruled flow:
//      claim, wake three, choose) holding FOUR Awoken and an
//      EMPTY party ledger reads his territory — his first
//      three, in hatch order, stand in the party ledger
//      (tender_party, read back in the ledger's own order
//      and through getParty), the fourth stands in the deck
//      only; the three stand FIELDED beside him (his tile
//      or its ring), follow 1, whole HP, shield rolled; and
//      the arrival spent no energy.
//   §I IDEMPOTENT: a second entry changes nothing — the
//      party rows stand byte-for-byte as the first entry
//      left them, and the placements stand exactly in
//      every standing field (the living battle's own
//      strike clock, battle_next_at, apart — any settle
//      arms it for any figure that stands).
//   §B THE PARTY ANSWERS IN THE ENGINE: a dark is seeded
//      beside the stand and the battle clock is advanced —
//      in the real settleHomelandBattle settle inside the
//      next getTerritory, the first three's strikes are
//      witnessed in the read's strike record (the engine's
//      own HomelandStrike log), and the dark's blows land
//      on the party (a shield burns or a body is wounded —
//      they stood as the dark's victims, defending).
//   §C AN EXISTING PARTY IS NEVER TOUCHED: a Tender whose
//      party he made himself (two members, neither of them
//      his first Awoken, in his own order) and a fielded
//      non-member under his own orders pass through two
//      first-entry reads with party rows byte-for-byte
//      unchanged and the placement unchanged in every
//      standing field — nothing entered, removed,
//      re-ordered, topped up or fielded.
//   §D FEWER THAN THREE WAITS: a Tender holding two
//      Awoken reads his territory twice — no party row,
//      no placement, nothing invented; when his third
//      Awoken exists, the next standing read completes
//      the wiring whole: the three, in hatch order, in
//      the ledger and on the field following.
// Run: node scripts/drive-first-three-party.mjs
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-first-three-"));
process.env.PORT = "3997";
process.env.WORKSHOP_PASSWORD = "first-three-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3997";
const PW = "first-three-drive-password";
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
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

function seedAwokin(ownerKey, tenderName, name, partPower = 3, createdAt = null) {
  const nowT = createdAt ?? Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, 'root', ?, 'image/png', ?)").run(`${name} ${cat}`, cat, partPower, partPower, `firstthree/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: partPower, toughness: partPower, element: "root" });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)").run(name, name, `firstthree/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
async function claimBare(name, exp = 3800) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, exp, Date.now());
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 500, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500").run(ownerKey, Date.now());
  return { token: claim.token, ownerKey };
}
function seedLand(ownerKey) {
  const now = Date.now();
  const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', ?, ?)");
  const tiles = new Map();
  for (const [q, r] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, -1], [-1, 1]]) {
    tiles.set(`${q},${r}`, Number(insTile.run(ownerKey, q, r, 0, now).lastInsertRowid));
  }
  tiles.set("2,0", Number(insTile.run(ownerKey, 2, 0, 1, now).lastInsertRowid));
  return tiles;
}
const partyLedger = (ownerKey) => db.prepare("SELECT owner_key, awakened_id, added_at FROM tender_party WHERE owner_key = ? ORDER BY added_at ASC, awakened_id ASC").all(ownerKey);
const placementRows = (ownerKey) => db.prepare("SELECT * FROM field_placements WHERE owner_key = ? ORDER BY id").all(ownerKey);
// A placement's STANDING fields — everything the wiring
// itself could write or move. (battle_next_at stands
// apart: the living battle's own strike clock, armed by
// any settle that runs, for any placement that stands —
// the token strip's fighters carry it too; it is the
// engine's bookkeeping, not the wiring's touch.)
const placedStanding = (ownerKey) => JSON.stringify(placementRows(ownerKey).map(r => [
  r.id, r.awakened_id, r.tile_id, r.stance, r.follow, r.hp, r.pos_q, r.pos_r,
  r.shield, r.shield_max, r.stance_ordered, r.march_path, r.patrol_path,
]));
const energyOf = (ownerKey) => db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(ownerKey).energy;

/* ── §A + §I THE FIRST ENTRY, AND THE SECOND ──────────── */
console.log("§A the first entry — the first three are the party, fielded and following");
const A = await claimBare("First Entry");
const base = Date.now() - 10000;
const a1 = seedAwokin(A.ownerKey, "First Entry", "Ash First", 3, base + 1);
const a2 = seedAwokin(A.ownerKey, "First Entry", "Birch Second", 3, base + 2);
const a3 = seedAwokin(A.ownerKey, "First Entry", "Cinder Third", 3, base + 3);
// The ruled flow (piece 3): the choosing comes after the
// first three wakes, through the standing door.
await call("chooseClass", { classKey: "warden" }, A.token);
const a4 = seedAwokin(A.ownerKey, "First Entry", "Dune Fourth", 3, base + 4);
const aTiles = seedLand(A.ownerKey);
ok("before the entry: the ledger stands empty and nothing is fielded",
  partyLedger(A.ownerKey).length === 0 && placementRows(A.ownerKey).length === 0);
const energyBefore = energyOf(A.ownerKey);
const terrA = await call("getTerritory", {}, A.token);
{
  const ledger = partyLedger(A.ownerKey);
  ok("the first three stand in the party ledger, in hatch order",
    ledger.map(r => r.awakened_id).join(",") === [a1, a2, a3].join(","), JSON.stringify(ledger));
  const party = await call("getParty", {}, A.token);
  ok("getParty reads the same three as the party — the fourth stands in the deck",
    party.members.map(m => m.awakenedId).join(",") === [a1, a2, a3].join(",")
    && party.deck.some(d => d.awakenedId === a4),
    JSON.stringify({ members: party.members.map(m => m.awakenedId), deck: party.deck.map(d => d.awakenedId) }));
  const rows = placementRows(A.ownerKey);
  ok("exactly the first three stand fielded — the fourth was not fielded",
    rows.length === 3 && rows.map(r => r.awakened_id).sort((x, y) => x - y).join(",") === [a1, a2, a3].sort((x, y) => x - y).join(","),
    JSON.stringify(rows.map(r => r.awakened_id)));
  ok("every fielded one follows its Tender (follow 1)",
    rows.every(r => r.follow === 1), JSON.stringify(rows.map(r => r.follow)));
  const standId = terrA.tender?.tileId;
  const tileById = new Map((terrA.tiles ?? []).map(t => [t.id, t]));
  const stand = tileById.get(standId);
  ok("they stand at the Tender's side — his own tile or one beside it",
    !!stand && rows.every(r => { const t = tileById.get(r.tile_id); return t && hexDist(t, stand) <= 1; }),
    JSON.stringify({ stand: stand && [stand.q, stand.r], at: rows.map(r => { const t = tileById.get(r.tile_id); return t && [t.q, t.r]; }) }));
  ok("they stand whole, with their shield rolled as a figure taking the field rolls it",
    rows.every(r => r.hp > 0 && r.shield != null && r.shield > 0 && r.shield === r.shield_max),
    JSON.stringify(rows.map(r => [r.hp, r.shield, r.shield_max])));
  ok("the territory read itself serves the three placements",
    (terrA.placements ?? []).length === 3
    && [a1, a2, a3].every(id => (terrA.placements ?? []).some(p => p.awakenedId === id)),
    JSON.stringify((terrA.placements ?? []).map(p => p.awakenedId)));
  ok("the arrival spent no energy — it is no cast and no summon",
    energyOf(A.ownerKey) === energyBefore, `${energyBefore} -> ${energyOf(A.ownerKey)}`);
  void aTiles;
}

console.log("§I the second entry changes nothing");
{
  const partyBefore = JSON.stringify(partyLedger(A.ownerKey));
  const placedBefore = placedStanding(A.ownerKey);
  await call("getTerritory", {}, A.token);
  ok("the party rows stand byte-for-byte as the first entry left them",
    JSON.stringify(partyLedger(A.ownerKey)) === partyBefore);
  ok("the placements stand exactly as the first entry left them — every standing field (the battle's own strike clock apart)",
    placedStanding(A.ownerKey) === placedBefore);
}

/* ── §B THE PARTY ANSWERS IN THE ENGINE ───────────────── */
console.log("§B the party answers — strikes witnessed in the cadence engine, and the dark's blows land on them");
{
  const darkTile = aTiles.get("2,0");
  const dark = Number(db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
    VALUES (?, ?, 'fray', ?, 2000, 2, 0, 1, 1, 0)`).run(A.ownerKey, darkTile, Date.now()).lastInsertRowid);
  const shieldBefore = placementRows(A.ownerKey).reduce((s, r) => s + (r.shield ?? 0), 0);
  const hpBefore = placementRows(A.ownerKey).reduce((s, r) => s + (r.hp ?? 0), 0);
  // The §I read's own settle armed the fighters' strike
  // clocks a breath ahead of its tiny window (the engine's
  // bookkeeping, above) — the battle proof starts their
  // clocks fresh, as the token strip's prime read leaves
  // its fighters, and advances the battle clock by hand.
  db.prepare("UPDATE field_placements SET battle_next_at = NULL WHERE owner_key = ?").run(A.ownerKey);
  db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now() - 30000, A.ownerKey);
  const st = await call("getTerritory", {}, A.token);
  const mine = (st.strikes ?? []).filter(s => [a1, a2, a3].includes(s.awakenedId) && s.wandererId === dark);
  ok("the first three's strikes were struck inside the settle and witnessed in its strike record",
    mine.length >= 1, `got ${mine.length} of ${st.strikes?.length ?? 0}`);
  ok("the witnessed strikes carry the engine's record shape (kind placement, hit, dmg, felled, from/to points)",
    mine.length >= 1 && mine.every(s => s.kind === "placement" && typeof s.hit === "boolean" && typeof s.dmg === "number" && typeof s.felled === "boolean"),
    JSON.stringify(mine[0]));
  const rowsAfter = placementRows(A.ownerKey);
  const shieldAfter = rowsAfter.reduce((s, r) => s + (r.shield ?? 0), 0);
  const hpAfter = rowsAfter.reduce((s, r) => s + (r.hp ?? 0), 0);
  ok("the dark's blows landed on the party — a shield burned, a body was wounded, or one fell defending",
    rowsAfter.length < 3 || shieldAfter < shieldBefore || hpAfter < hpBefore,
    `rows ${rowsAfter.length}, shield ${shieldBefore} -> ${shieldAfter}, hp ${hpBefore} -> ${hpAfter}`);
  ok("the dark still stands to be fought (the witness is a battle, not a scripted fell)",
    !!db.prepare("SELECT id FROM homeland_wanderers WHERE id = ?").get(dark));
}

/* ── §C AN EXISTING PARTY IS NEVER TOUCHED ────────────── */
console.log("§C a party the Tender made himself stands exactly as he made it");
{
  const C = await claimBare("Own Party");
  db.prepare("UPDATE tender_progress SET class_key = 'warden' WHERE owner_key = ?").run(C.ownerKey);
  const c1 = seedAwokin(C.ownerKey, "Own Party", "His First", 3, base + 1);
  const c2 = seedAwokin(C.ownerKey, "Own Party", "His Second", 3, base + 2);
  const c3 = seedAwokin(C.ownerKey, "Own Party", "His Third", 3, base + 3);
  const c4 = seedAwokin(C.ownerKey, "Own Party", "His Fourth", 3, base + 4);
  seedLand(C.ownerKey);
  // His own party: the third and the second — neither the
  // first three as a set, nor in hatch order as a pair he
  // is owed — made through the standing door.
  await call("addToParty", { awakenedId: c3 }, C.token);
  await call("addToParty", { awakenedId: c2 }, C.token);
  // A fielded non-member under his own orders: the pass
  // must not lift, move, follow or re-stance it either.
  const heartTile = db.prepare("SELECT id FROM territory_tiles WHERE owner_key = ? AND q = 0 AND r = 0").get(C.ownerKey).id;
  db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, stance_ordered)
    VALUES (?, ?, ?, ?, ?, 'attack', 0, 30, 1)`).run(C.ownerKey, c1, heartTile, Date.now(), Date.now());
  ok("the stage stands: his party of two, his fielded non-member, his fourth in the deck",
    partyLedger(C.ownerKey).length === 2 && placementRows(C.ownerKey).length === 1);
  const partyBefore = JSON.stringify(partyLedger(C.ownerKey));
  const placedBefore = placedStanding(C.ownerKey);
  await call("getTerritory", {}, C.token);
  await call("getTerritory", {}, C.token);
  ok("two first-entry reads entered nothing, removed nothing and re-ordered nothing in his ledger",
    JSON.stringify(partyLedger(C.ownerKey)) === partyBefore,
    `${partyBefore} -> ${JSON.stringify(partyLedger(C.ownerKey))}`);
  ok("his placement stands untouched in every standing field — nothing fielded, lifted, moved or followed (the battle's own strike clock apart)",
    placedStanding(C.ownerKey) === placedBefore,
    `${placedBefore} -> ${placedStanding(C.ownerKey)}`);
  ok("his first Awoken was not conscripted into the party, and his fourth was not topped up into it",
    !partyLedger(C.ownerKey).some(r => r.awakened_id === c1) && !partyLedger(C.ownerKey).some(r => r.awakened_id === c4));
}

/* ── §D FEWER THAN THREE WAITS ────────────────────────── */
console.log("§D a Tender with fewer than three gets nothing invented — the wiring waits for the third");
{
  const D = await claimBare("Two Only");
  db.prepare("UPDATE tender_progress SET class_key = 'warden' WHERE owner_key = ?").run(D.ownerKey);
  const d1 = seedAwokin(D.ownerKey, "Two Only", "Only First", 3, base + 1);
  const d2 = seedAwokin(D.ownerKey, "Two Only", "Only Second", 3, base + 2);
  seedLand(D.ownerKey);
  await call("getTerritory", {}, D.token);
  await call("getTerritory", {}, D.token);
  ok("with two Awoken, two standing reads wrote no party row",
    partyLedger(D.ownerKey).length === 0, JSON.stringify(partyLedger(D.ownerKey)));
  ok("with two Awoken, nothing was fielded for him either",
    placementRows(D.ownerKey).length === 0);
  const d3 = seedAwokin(D.ownerKey, "Two Only", "Late Third", 3, base + 3);
  await call("getTerritory", {}, D.token);
  ok("when the third exists, the next standing read completes the wiring — the three, in hatch order",
    partyLedger(D.ownerKey).map(r => r.awakened_id).join(",") === [d1, d2, d3].join(","),
    JSON.stringify(partyLedger(D.ownerKey)));
  ok("and the three stand fielded, following, from that read",
    placementRows(D.ownerKey).length === 3 && placementRows(D.ownerKey).every(r => r.follow === 1),
    JSON.stringify(placementRows(D.ownerKey).map(r => [r.awakened_id, r.follow])));
}

console.log(`\nFIRST-THREE PARTY DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
