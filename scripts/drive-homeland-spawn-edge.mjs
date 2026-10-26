// THE HOMELAND'S EDGE — DRIVE (Nigel, 2026-10-25 23:41:
// "enemies are spawning all over the cursed lands not
// starting on the outside and marching in"; the Table's
// law of 2026-10-25 09:06 — enemies spawn ONLY at the
// furthest cursed ring and slowly make their way in —
// carried home to the homeland's cursed lands).
// Boots the real server in-process on a scratch DATA_DIR
// and proves, against the server's own ledgers:
//   §W SOURCE — the cradle (settleWanderers) deals births
//      on the furthest cursed ring only (the edgeRing
//      reckoning stands; the old stand-view rings are
//      gone), and the Table's picker (darkGround) still
//      stands on the furthest ring with its held deal.
//   §1 THE EDGE — a prepared Tender at the heart of a
//      homeland cursed on rings 3–7: across a wound
//      cradle clock, EVERY newborn stands on ring 7, the
//      furthest cursed ring; none on rings 3–6; the cap
//      fills exactly, each on its own tile. A second
//      serving under the same pressure obeys the same law.
//   §2 THE EDGE IS READ, NOT FIXED — a wider homeland,
//      cursed on rings 3–9: every newborn stands on
//      ring 9. The picker reads the land's own outermost
//      cursed ring wherever it lies (§1's ring was 7) —
//      under the old law both worlds would have birthed
//      at rings 3–6 of the stand.
//   §3 OVERFLOW COMES SHORT, NEVER DEEPER — a sparse
//      cursed wild whose furthest ring holds only FIVE
//      tiles while rings 5–6 stand fully cursed beneath
//      it and the cap stands at 8: beat after beat,
//      births stop at the ring's five — the spawn comes
//      short — and not one foe ever stands deeper.
//   §4 THE BEACON'S LIGHT STILL BARS THE RING — a Beacon
//      seed standing on the furthest ring of a sparse
//      wild: no birth lands within its light (its own
//      tile or a neighbour), though that ground is
//      cursed and on the edge; births stand on the
//      ring's far tiles only, and none deeper.
// Fixture shape, labelled: Tenders are claimed for real,
// then their ledgers are set by hand in the standing
// drives' own way (the early-entry drive's pattern):
// prepared Tenders (Lv 3, twenty held) so the standing
// intensity reads 1 and only PLACEMENT is on trial;
// hand-seeded hex maps; the cradle's clock wound forward
// by hand (wanderer_anchor_at). THE FRONTIER is part of
// the fixture's honesty: getTerritory mints a five-ring
// cursed buffer beyond the purified rim on every read
// (ensureFrontierBuffer), so §1–§2 seed discs wide enough
// to hold the buffer inside them (nothing is minted),
// and §3–§4 seed fully-cursed sparse wilds — with no
// purified tile standing, the buffer mints nothing, and
// the land stands exactly as seeded. Every assertion
// reads the DB ledgers after a real getTerritory read —
// the settle itself is the server's own, unmodified. A
// newborn's tile is read from homeland_wanderers at the
// read that birthed it (the battle window between reads
// is real milliseconds; a birth tile cannot drift a cell
// in it).
// Run after `npm run build` (server + client) so the
// drive boots this source's server.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-spawn-edge-"));
process.env.PORT = "39991";
process.env.WORKSHOP_PASSWORD = "spawn-edge-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;
process.chdir(root);
const BASE = "http://127.0.0.1:39991";
const PW = "spawn-edge-drive-password";
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

const ringOf = (q, r) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

let awSeq = 0;
function seedAwokin(ownerKey, tenderName) {
  const nowT = Date.now();
  const name = `Held ${++awSeq}`;
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 3, 3, 'root', ?, 'image/png', ?)").run(`${name} ${cat}`, cat, `spawnedge/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: 3, toughness: 3, element: "root" });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)").run(name, name, `spawnedge/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}

/** A hand-seeded disc world: the hex disc to `radius`
 *  of the heart; cursedFn(q, r, ring) decides each
 *  tile's curse. Returns the tile ledger. */
function seedDisc(ownerKey, radius, cursedFn) {
  const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', ?, ?)");
  const tiles = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      if (ringOf(q, r) > radius) continue;
      const cursed = cursedFn(q, r, ringOf(q, r)) ? 1 : 0;
      const id = Number(insTile.run(ownerKey, q, r, cursed, Date.now()).lastInsertRowid);
      tiles.push({ id, q, r, ring: ringOf(q, r), cursed: !!cursed });
    }
  }
  return tiles;
}

/** A hand-seeded sparse wild: only the listed hexes
 *  stand at all. Returns the tile ledger. */
function seedSparse(ownerKey, hexes) {
  const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', ?, ?)");
  return hexes.map(([q, r, cursed]) => {
    const id = Number(insTile.run(ownerKey, q, r, cursed ? 1 : 0, Date.now()).lastInsertRowid);
    return { id, q, r, ring: ringOf(q, r), cursed: !!cursed };
  });
}

/** Claim a prepared Tender (Lv 3, twenty held, warden)
 *  and stand him on the heart of the seeded land. */
async function makeTender(name, seedFn) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 150, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, Date.now());
  db.prepare("UPDATE tender_progress SET class_key = 'warden' WHERE owner_key = ?").run(ownerKey);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 500, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500").run(ownerKey, Date.now());
  for (let i = 0; i < 20; i++) seedAwokin(ownerKey, name);
  const tiles = seedFn(ownerKey);
  const stand = tiles.find(t => t.q === 0 && t.r === 0);
  db.prepare("UPDATE tender_progress SET tender_tile_id = ? WHERE owner_key = ?").run(stand.id, ownerKey);
  return { token: claim.token, ownerKey, tiles };
}

const darkRows = (ownerKey) => db.prepare(
  `SELECT w.id, w.tile_id AS tileId, t.q AS q, t.r AS r FROM homeland_wanderers w JOIN territory_tiles t ON t.id = w.tile_id WHERE w.owner_key = ? ORDER BY w.id`
).all(ownerKey);
const ringsOf = (rows) => rows.map(w => ringOf(w.q, w.r));

function wind(T) {
  db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ?, wanderer_settled_beats = 0 WHERE owner_key = ?").run(Date.now() - 45000 * 30, T.ownerKey);
}

/** Prime (the first standing read arms the cradle's
 *  anchor, birthing nothing), then wind the cradle's
 *  clock forward and read again: the births that read
 *  makes are the subject. */
async function spawnRead(T) {
  await call("getTerritory", {}, T.token);
  wind(T);
  await call("getTerritory", {}, T.token);
  return darkRows(T.ownerKey);
}

/** Wind-and-read cycles until `want` foes stand or the
 *  cycles run out — each cycle settles up to four beats,
 *  so a ring tile that can birth has rolled many times.
 *  Returns every row that EVER stood, cycle by cycle
 *  folded in, so a deeper birth in any cycle is caught. */
async function spawnCycles(T, want, cycles = 12) {
  await call("getTerritory", {}, T.token);
  const ever = new Map();
  for (let i = 0; i < cycles; i++) {
    wind(T);
    await call("getTerritory", {}, T.token);
    const rows = darkRows(T.ownerKey);
    for (const w of rows) ever.set(w.id, w);
    if (rows.length >= want) break;
  }
  return { standing: darkRows(T.ownerKey), ever: [...ever.values()] };
}

/* ── §W SOURCE — THE PICKER'S SHAPE, READ AS WRITTEN ── */
console.log("§W the edge stands in the cradle's picker; the Table's picker still stands on its ring");
{
  const actions = readFileSync(join(root, "server/src/actions.ts"), "utf8");
  const table = readFileSync(join(root, "server/src/table.ts"), "utf8");
  const at = actions.indexOf("async settleWanderers(");
  const end = at >= 0 ? actions.indexOf("async settleHomelandWeapon(", at) : -1;
  const span = at >= 0 && end > at ? actions.slice(at, end) : "";
  ok("settleWanderers is found, and the edge reckoning stands inside it",
    !!span && span.includes("THE EDGE OF THE CURSE (Nigel, 2026-10-25)") && span.includes("edgeRing"));
  ok("births are dealt from the edge ring's tiles only (the filter reads ringOfTile(t) === edgeRing)",
    span.includes("ringOfTile(t) === edgeRing"));
  ok("the old stand-view birth rings are gone from the cradle (no BIRTH_RING, no VIEW_RING)",
    !!span && !span.includes("BIRTH_RING") && !span.includes("VIEW_RING"));
  const dgAt = table.indexOf("function darkGround(");
  const dgEnd = dgAt >= 0 ? table.indexOf("function placeDark(", dgAt) : -1;
  const dg = dgAt >= 0 && dgEnd > dgAt ? table.slice(dgAt, dgEnd) : "";
  ok("the Table's darkGround still stands: the furthest ring of the curse, and nowhere else",
    !!dg && dg.includes("Math.max(...cursed.map(t => ringOf(t.id)))") && dg.includes("ringOf(t.id) === rim"));
  ok("the Table's held deal still stands (a deal that outruns the ring is held, never spilled inward)",
    table.includes("room.pendingDark"));
}

/* ── §1 THE EDGE ─────────────────────────────────────── */
console.log("§1 a homeland cursed on rings 3–7 births only on ring 7, the furthest cursed ring");
const A = await makeTender("Edge Tender", (k) => seedDisc(k, 7, (q, r, ring) => ring >= 3));
{
  const expA = await call("getTenderExp", {}, A.token);
  ok("the fixture stands as named: a prepared Tender (level 3, twenty held), so placement alone is on trial",
    expA.level === 3 && expA.awokenCount === 20, JSON.stringify({ level: expA.level, n: expA.awokenCount }));
  const rows = await spawnRead(A);
  ok("§1: the cradle filled to the standing cap — exactly 8 standing dark",
    rows.length === 8, `born ${rows.length}: ${JSON.stringify(ringsOf(rows))}`);
  ok("§1: EVERY newborn stands on ring 7, the furthest cursed ring",
    rows.length > 0 && ringsOf(rows).every(r => r === 7), JSON.stringify(ringsOf(rows)));
  ok("§1: no newborn stands deeper — rings 3–6 hold none",
    ringsOf(rows).every(r => r >= 7), JSON.stringify(ringsOf(rows)));
  ok("§1: each newborn holds its own tile (the ring's occupied ground is never doubled)",
    new Set(rows.map(w => w.tileId)).size === rows.length);
  // A second serving under the same pressure: clear the
  // field and wind again — the new births obey the same law.
  db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(A.ownerKey);
  const rows2 = await spawnRead(A);
  ok("§1: a second serving births on ring 7 again, never deeper",
    rows2.length === 8 && ringsOf(rows2).every(r => r === 7),
    `born ${rows2.length}: ${JSON.stringify(ringsOf(rows2))}`);
}

/* ── §2 THE EDGE IS READ, NOT FIXED ──────────────────── */
console.log("§2 a wider homeland, cursed on rings 3–9, births on ring 9 — the picker reads the land's own edge");
const W = await makeTender("Wide Edge", (k) => seedDisc(k, 9, (q, r, ring) => ring >= 3));
{
  const rows = await spawnRead(W);
  ok("§2: the cradle filled to the cap — exactly 8 standing dark",
    rows.length === 8, `born ${rows.length}: ${JSON.stringify(ringsOf(rows))}`);
  ok("§2: EVERY newborn stands on ring 9, this land's furthest cursed ring (not §1's ring, not a fixed ring)",
    rows.length > 0 && ringsOf(rows).every(r => r === 9), JSON.stringify(ringsOf(rows)));
  ok("§2: none stands deeper — rings 3–8 hold none",
    ringsOf(rows).every(r => r >= 9), JSON.stringify(ringsOf(rows)));
}

/* ── §3 OVERFLOW COMES SHORT, NEVER DEEPER ───────────── */
console.log("§3 a furthest ring of five tiles, a cap of eight, deep cursed ground beneath: births stop at five");
const RING7_KEEP = ["7,0", "-7,0", "0,7", "0,-7", "7,-7"];
const SPARSE3 = (() => {
  const hexes = [[0, 0, true]];
  for (let q = -6; q <= 6; q++) for (let r = -6; r <= 6; r++) {
    const ring = ringOf(q, r);
    if ((ring === 5 || ring === 6) && !(q === 0 && r === 0)) hexes.push([q, r, true]);
  }
  for (const key of RING7_KEEP) { const [q, r] = key.split(",").map(Number); hexes.push([q, r, true]); }
  return hexes;
})();
const B = await makeTender("Short Ring", (k) => seedSparse(k, SPARSE3));
{
  const cursedTiles = B.tiles.filter(t => t.cursed);
  ok("the fixture stands as named: rings 5–6 fully cursed (66 tiles), ring 7 standing on five tiles only, no purified tile anywhere (the frontier mints nothing)",
    cursedTiles.filter(t => t.ring === 5 || t.ring === 6).length === 66
    && cursedTiles.filter(t => t.ring === 7).length === 5
    && B.tiles.every(t => t.cursed),
    JSON.stringify({ deep: cursedTiles.filter(t => t.ring < 7).length, ring: cursedTiles.filter(t => t.ring === 7).length, total: B.tiles.length }));
  const { standing, ever } = await spawnCycles(B, 5, 12);
  ok("§3: births stopped at the ring's five — the spawn came short of the cap of 8",
    standing.length === 5, `standing ${standing.length}: ${JSON.stringify(ringsOf(standing))}`);
  ok("§3: every foe that ever stood, in every cycle, stood on one of the ring's five tiles",
    ever.length > 0 && ever.every(w => RING7_KEEP.includes(`${w.q},${w.r}`)),
    JSON.stringify(ever.map(w => `${w.q},${w.r}`)));
  ok("§3: NO foe ever stood deeper — the 66 cursed tiles of rings 5–6 held none, beat after beat",
    ever.every(w => ringOf(w.q, w.r) === 7), JSON.stringify(ringsOf(ever)));
}

/* ── §4 THE BEACON'S LIGHT STILL BARS THE RING ───────── */
console.log("§4 a Beacon seed standing on the furthest ring bars births within its light");
const BEACON_TILE = { q: 7, r: 0 };
const FAR_RING = ["-7,0", "0,7", "0,-7"];
const SPARSE4 = [
  [0, 0, true],                       // the heart — the stand, cursed ground
  [7, 0, true], [7, -1, true], [6, 1, true], [6, 0, true], // the Beacon's patch: its tile and neighbours
  [-7, 0, true], [0, 7, true], [0, -7, true],              // the ring's far tiles
  [5, 0, true], [5, 1, true], [4, 0, true],                // deeper cursed ground, as witness
];
const C = await makeTender("Beacon Ring", (k) => seedSparse(k, SPARSE4));
{
  const beaconTile = C.tiles.find(t => t.q === BEACON_TILE.q && t.r === BEACON_TILE.r);
  db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at) VALUES (?, ?, 3, 'fallen', ?)")
    .run(C.ownerKey, beaconTile.id, Date.now());
  const barred = C.tiles.filter(t => t.cursed && hexDist(t, BEACON_TILE) <= 1);
  ok("the fixture stands as named: cursed ground within the Beacon's light, three far ring tiles beyond it, deeper cursed ground as witness",
    barred.length === 4 && C.tiles.filter(t => t.cursed && FAR_RING.includes(`${t.q},${t.r}`)).length === 3,
    JSON.stringify({ barred: barred.length }));
  const { standing, ever } = await spawnCycles(C, 3, 12);
  ok("§4: births stand on the ring's far tiles — all three filled",
    standing.length === 3 && standing.every(w => FAR_RING.includes(`${w.q},${w.r}`)),
    JSON.stringify(standing.map(w => `${w.q},${w.r}`)));
  ok("§4: NO birth ever landed within the Beacon's light, though its ground is cursed and on the furthest ring",
    ever.every(w => hexDist(w, BEACON_TILE) > 1),
    JSON.stringify(ever.map(w => `${w.q},${w.r}`)));
  ok("§4: and none ever stood on the deeper witness ground (rings 4–6)",
    ever.every(w => ringOf(w.q, w.r) === 7), JSON.stringify(ringsOf(ever)));
}

console.log(`\nHOMELAND SPAWN EDGE DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
