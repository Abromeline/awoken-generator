// THE LIFT GATE — FULL ATTUNEMENT (Nigel, 2026-11-12,
// restating his ten-cap law of 2026-10-26): "make sure that
// the terrain system only allows tiles to raise that have a
// full attunement or all 4 elements at 10. a tile with 10
// air, 5 root does not raise. 10 air 10 root 10 tide and 10
// rock are the only tiles eligible for elevation raise."
// The four are the terrain ledger's four — sky, root, tide,
// stone; Fire is not counted.
//
// Boots the tree's real server on a scratch DATA_DIR and
// proves, through the real Attune act and the stored rows:
//   §1 a tile at sky 10 / root 5 / tide 10 / stone 10 does
//      NOT lift and its Air is NOT spent — spoken at the door
//      (the Tender's pool keeps its point and the tile's
//      ledger is untouched), and the wordless road agrees
//      (an attune of another element presses in, the sky
//      stays banked at the price, no lift, no newborn);
//   §2 the same tile completed to 10/10/10/10 DOES lift:
//      the price is spent, Z rises, and the vacated plane
//      bears its birth — cursed in the open, purified inside
//      a beacon ring;
//   §3 the gate judges EVERY lift in a press: while all
//      four stand full at the price, lifts repeat — a tile
//      banked with 30 Air pays three prices in one press
//      (30 -> 20 -> 10 -> 0, full at each judging); a 25-Air
//      tile pays two and holds at 5, below the next price.
//      (The gate's stop and the price's stop meet on the Air
//      line: at 20 and at 10 the tile still stands full, so
//      those lifts are lawful; below 10 no lift is judged.)
//   §4 the bastion lock still refuses a float inside the
//      bastion's seven hexes for a FULLY attuned tile —
//      and the refusal's words are the lock's own, proving
//      the gate did not swallow the lock.
//   node scripts/drive-full-attunement-lift.mjs [port]
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const ROOT = process.cwd();
const PORT = process.argv[2] ?? "3991";
const require = createRequire(join(ROOT, "package.json"));
const Database = require("better-sqlite3");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-liftgate-proof-"));
process.env.PORT = PORT;
process.env.WORKSHOP_PASSWORD = "liftgate-proof";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

await import(join(ROOT, "server/dist/index.js"));
await sleep(2500);

async function callRaw(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
async function call(action, args, token) {
  const { status, data } = await callRaw(action, args, token);
  if (status >= 300) throw new Error(`${action} -> ${status}: ${JSON.stringify(data)}`);
  return data;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
const now = Date.now();
const claim = await call("claimTender", { password: "liftgate-proof-password", tenderName: "Liftgate Tender" });
const token = claim.token;
const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id}`;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 0, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800, class_key = 'warden', hp = 100").run(me, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(me, now);
const insPool = db.prepare("INSERT INTO aspect_attunement (owner_key, element, points) VALUES (?, ?, ?) ON CONFLICT(owner_key, element) DO UPDATE SET points = ?");
for (const el of ["sky", "root", "tide", "stone"]) insPool.run(me, el, 50, 50);

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, spark, hp, sealed_trays, grow_points, height, z, mix_points, curse_hp, curse_max_hp, created_at) VALUES (?, ?, ?, ?, ?, 0, 10, 0, 0, ?, ?, ?, ?, ?, ?)");
function addRow(q, r, z, { element = "neutral", cursed = 0, mix = null, height = null } = {}) {
  const h = height ?? (cursed ? 0 : 1);
  return Number(insTile.run(me, q, r, element, cursed, h, z, mix ? JSON.stringify(mix) : null, cursed ? 10 : null, cursed ? 10 : null, now).lastInsertRowid);
}
function disc(radius) {
  const ids = {};
  for (let q = -radius; q <= radius; q++) for (let r = -radius; r <= radius; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > radius) continue;
    ids[`${q},${r}`] = addRow(q, r, 0, {});
  }
  return ids;
}
function wipeWorld() {
  for (const t of ["territory_tiles", "star_seeds", "territory_buildings", "field_placements", "homeland_wanderers"]) {
    db.prepare(`DELETE FROM ${t} WHERE owner_key = ?`).run(me);
  }
}
const rowAt = (q, r, z = 0) => db.prepare("SELECT * FROM territory_tiles WHERE owner_key = ? AND q = ? AND r = ? AND z = ?").get(me, q, r, z);
const rowOf = (id) => db.prepare("SELECT * FROM territory_tiles WHERE id = ?").get(id);
const mixOf = (id) => JSON.parse(rowOf(id).mix_points);
const setStand = (tileId) => db.prepare("UPDATE tender_progress SET tender_tile_id = ? WHERE owner_key = ?").run(tileId, me);
const pool = (el) => db.prepare("SELECT points FROM aspect_attunement WHERE owner_key = ? AND element = ?").get(me, el).points;
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

/* ═══ §1 SHORT OF FULL: NO LIFT, NO AIR SPENT ═══════════════ */
console.log("§1 a tile short of full attunement does not raise, and its Air is not spent");
wipeWorld();
const ids1 = disc(3);
// Nigel's own example: 10 air, 5 root — tide and stone full.
const s1Id = addRow(2, 1, 0, { element: "sky", mix: { sky: 10, stone: 10, tide: 10, root: 5 } });
setStand(s1Id);
const skyPoolBefore = pool("sky");
const gateTry = await callRaw("attuneTile", { element: "sky", tileId: s1Id }, token);
ok("an Air lay on the short tile is refused in plain words at the door",
  gateTry.status >= 300 && JSON.stringify(gateTry.data).includes("cannot rise yet"), JSON.stringify(gateTry.data).slice(0, 220));
ok("the refusal's words name the law: all four elements at 10 each",
  JSON.stringify(gateTry.data).includes("all four elements stand full"), JSON.stringify(gateTry.data).slice(0, 220));
ok("the Tender's sky pool keeps its point (nothing was spent)", pool("sky") === skyPoolBefore, `pool ${skyPoolBefore} -> ${pool("sky")}`);
ok("the tile did not lift", (rowOf(s1Id)?.z ?? 0) === 0, `z=${rowOf(s1Id)?.z}`);
ok("the tile's ledger is untouched — its Air stands banked at 10, root still 5",
  mixOf(s1Id).sky === 10 && mixOf(s1Id).root === 5, rowOf(s1Id).mix_points);
ok("no newborn stands at the tile's hex (the hex holds only the disc tile and the short tile itself)",
  db.prepare("SELECT COUNT(*) AS n FROM territory_tiles WHERE owner_key = ? AND q = 2 AND r = 1").get(me).n === 2);
// The wordless agreement: pressing another element in (the
// settle's and the shrine's road) lands the points, and the
// banked Air at the price still lifts nothing.
const pressTry = await call("attuneTile", { element: "tide", tileId: s1Id }, token);
ok("a tide attune on the same tile presses in freely (the press itself is no refusal's business)", pressTry.ok === true, JSON.stringify(pressTry).slice(0, 160));
ok("after the press the tile STILL has not lifted, and the banked Air is unspent",
  (rowOf(s1Id)?.z ?? 0) === 0 && mixOf(s1Id).sky === 10 && mixOf(s1Id).tide === 11,
  `z=${rowOf(s1Id)?.z} mix=${rowOf(s1Id).mix_points}`);
ok("still no newborn at the hex after the press",
  db.prepare("SELECT COUNT(*) AS n FROM territory_tiles WHERE owner_key = ? AND q = 2 AND r = 1").get(me).n === 2);

/* ═══ §2 FULL: THE LIFT, THE PRICE, THE BIRTH ═══════════════ */
console.log("§2 completed to 10/10/10/10, the tile lifts — price spent, birth as before");
wipeWorld();
const ids2 = disc(3);
const s2Id = addRow(2, 1, 0, { element: "sky", mix: { sky: 10, stone: 10, tide: 10, root: 5 } });
setStand(s2Id);
// Complete the set by Nigel's own road: five root attunes
// carry root 5 -> 10.
for (let i = 0; i < 5; i++) await call("attuneTile", { element: "root", tileId: s2Id }, token);
ok("completing the set lifts on the completing press itself — the banked Air was already at the price",
  (rowOf(s2Id)?.z ?? 0) === 1 && mixOf(s2Id).sky === 0 && mixOf(s2Id).root === 10 && mixOf(s2Id).tide === 10 && mixOf(s2Id).stone === 10,
  `z=${rowOf(s2Id)?.z} mix=${rowOf(s2Id).mix_points}`);
const sky2 = pool("sky");
const liftTry = await callRaw("attuneTile", { element: "sky", tileId: s2Id }, token);
ok("an Air lay on the full tile is allowed (no refusal)", liftTry.status < 300, JSON.stringify(liftTry.data).slice(0, 200));
ok("the Air lay banks at 1 — below the next price, so no second lift follows yet",
  (rowOf(s2Id)?.z ?? 0) === 1 && mixOf(s2Id).sky === 1, `z=${rowOf(s2Id)?.z} mix=${rowOf(s2Id).mix_points}`);
ok("the Tender's pool paid its one point", pool("sky") === sky2 - 1, `pool ${sky2} -> ${pool("sky")}`);
const hexRows2 = db.prepare("SELECT * FROM territory_tiles WHERE owner_key = ? AND q = ? AND r = ?").all(me, 2, 1);
ok("the vacated plane bears a newborn (the hex holds the disc, the birth, and the risen tile)", hexRows2.length === 3, `rows=${hexRows2.length}`);
ok("outside any ring the newborn is born CURSED, as the lift law always bore it",
  hexRows2.filter(r => r.cursed === 1).length === 1, JSON.stringify(hexRows2.map(r => ({ z: r.z, cursed: r.cursed }))));
const terr2 = await call("getTerritory", {}, token);
const servedHex2 = (terr2.tiles ?? []).filter(t => t.q === 2 && t.r === 1);
ok("served after a read: the birth still stands cursed on the open ground, the risen tile clean above it",
  servedHex2.some(t => (t.z ?? 0) === 0 && t.cursed === 1) && servedHex2.some(t => (t.z ?? 0) === 1 && t.cursed === 0),
  JSON.stringify(servedHex2.map(t => ({ z: t.z, cursed: t.cursed }))));

/* ═══ §2b THE SAME BIRTH INSIDE A BEACON RING ═══════════════ */
console.log("§2b inside a beacon ring, the eligible lift's newborn arrives purified");
wipeWorld();
disc(3);
addRow(5, 0, 0, {});
for (const [dq, dr] of DIRS) addRow(5 + dq, dr, 0, {});
db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at, defenses, fed_energy) VALUES (?, ?, 3, 'fallen', ?, 0, 0)")
  .run(me, rowAt(5, 0).id, now);
const s2bId = addRow(6, 0, 0, { element: "neutral", mix: { sky: 10, stone: 10, tide: 10, root: 10 } });
setStand(s2bId);
const lift2b = await callRaw("attuneTile", { element: "sky", tileId: s2bId }, token);
ok("the eligible lift inside the ring is allowed", lift2b.status < 300, JSON.stringify(lift2b.data).slice(0, 200));
ok("the ring tile rose one Z", (rowOf(s2bId)?.z ?? 0) === 1, `z=${rowOf(s2bId)?.z}`);
const born2b = db.prepare("SELECT * FROM territory_tiles WHERE owner_key = ? AND q = ? AND r = ? AND z = ? AND id != ?").get(me, 6, 0, 0, s2bId);
ok("the newborn at the vacated plane is PURIFIED by the ring, as before", !!born2b && born2b.cursed === 0, `cursed=${born2b?.cursed}`);

/* ═══ §3 THE GATE, PER LIFT, INSIDE ONE PRESS ═══════════════ */
console.log("§3 the gate judges every lift in the press — lifts repeat while the four stand full");
wipeWorld();
const ids3 = disc(3);
const s3Id = addRow(2, 1, 0, { element: "sky", mix: { sky: 30, stone: 10, tide: 10, root: 10 } });
setStand(s3Id);
await call("attuneTile", { element: "tide", tileId: s3Id }, token);
ok("a 30-Air full tile lifts at every measure in one press — 30 -> 20 -> 10 -> 0, the gate passing each lift while all four stand full",
  (rowOf(s3Id)?.z ?? 0) === 3 && mixOf(s3Id).sky === 0,
  `z=${rowOf(s3Id)?.z} mix=${rowOf(s3Id).mix_points}`);
const s3bId = addRow(-2, -1, 0, { element: "sky", mix: { sky: 25, stone: 10, tide: 10, root: 10 } });
setStand(s3bId);
await call("attuneTile", { element: "tide", tileId: s3bId }, token);
ok("a 25-Air full tile lifts twice in one press and holds at 5, below the next price",
  (rowOf(s3bId)?.z ?? 0) === 2 && mixOf(s3bId).sky === 5,
  `z=${rowOf(s3bId)?.z} mix=${rowOf(s3bId).mix_points}`);

/* ═══ §4 THE BASTION LOCK, ON FULLY ATTUNED GROUND ══════════ */
console.log("§4 the bastion lock still refuses a float for an eligible tile");
wipeWorld();
disc(3);
const bastionTileId = addRow(3, 1, 0, { element: "neutral" });
db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at, defenses, fed_energy) VALUES (?, ?, 3, 'fallen', ?, 0, 0)").run(me, bastionTileId, now);
// A Z-1 tile inside the ring, FULLY attuned, one point short
// of the price: the lay would carry it to Z 2 — a float.
const s4Id = addRow(3, 0, 1, { element: "sky", mix: { sky: 9, stone: 10, tide: 10, root: 10 } });
setStand(s4Id);
const sky4 = pool("sky");
const lockTry = await callRaw("attuneTile", { element: "sky", tileId: s4Id }, token);
ok("the float inside the bastion's ring is refused", lockTry.status >= 300, JSON.stringify(lockTry.data).slice(0, 200));
ok("and the refusal's words are the LOCK's own — the gate passed this tile, the lock stopped it",
  JSON.stringify(lockTry.data).includes("locked to the bastion"), JSON.stringify(lockTry.data).slice(0, 220));
ok("the refusal spends no Air point", pool("sky") === sky4, `pool ${sky4} -> ${pool("sky")}`);
ok("the locked tile did not lift and its ledger is untouched",
  (rowOf(s4Id)?.z ?? 0) === 1 && mixOf(s4Id).sky === 9, `z=${rowOf(s4Id)?.z} mix=${rowOf(s4Id).mix_points}`);

console.log(`\ndrive-full-attunement-lift: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
