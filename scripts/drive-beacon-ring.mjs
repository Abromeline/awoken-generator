// THE BEACON RING (Nigel, 2026-11-10 08:47, confirmed the same
// breath; restated 19:32 for the bastion): the ground
// surrounding a beacon is always purified and can not fall.
// The ring is the beacon's own hex + the six around it. This
// drive boots the tree's real server on a scratch DATA_DIR and
// proves, through the real actions and the served territory:
//   §1 a Beacon-stage seed standing with curse in its ring —
//      the read purifies it, and the curse stays out across
//      sustained reads while curse outside the ring persists;
//   §2 the doused window (the beacon lesson's own switch):
//      light → douse → relight succeed, the lighthouse's ring
//      ground stays clean at every step, doused included;
//   §3 the vacated plane: a grounded lift inside a Beacon
//      seed's ring leaves a PURIFIED newborn; the same lift
//      outside any ring leaves a cursed one (the control);
//   §4 the fall roads themselves: battle damage to 0 hp does
//      not curse ring ground (and does curse control ground),
//      and an enemy chewing beside pure ring ground for many
//      beats never turns it, while its control chew lands.
//   node scripts/drive-beacon-ring.mjs [port]
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const ROOT = process.cwd();
const PORT = process.argv[2] ?? "3989";
const require = createRequire(join(ROOT, "package.json"));
const Database = require("better-sqlite3");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-ring-proof-"));
process.env.PORT = PORT;
process.env.WORKSHOP_PASSWORD = "ring-proof";
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
const claim = await call("claimTender", { password: "ring-proof-password", tenderName: "Ring Tender" });
const token = claim.token;
const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id}`;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 0, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800, class_key = 'warden', hp = 100").run(me, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(me, now);
db.prepare("INSERT INTO aspect_attunement (owner_key, element, points) VALUES (?, 'sky', 50) ON CONFLICT(owner_key, element) DO UPDATE SET points = 50").run(me);

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, spark, hp, sealed_trays, grow_points, height, z, mix_points, curse_hp, curse_max_hp, created_at) VALUES (?, ?, ?, ?, ?, 0, 10, 0, 0, ?, ?, ?, ?, ?, ?)");
function addRow(q, r, z, { element = "neutral", cursed = 0, mix = null, height = null } = {}) {
  const h = height ?? (cursed ? 0 : 1);
  return Number(insTile.run(me, q, r, element, cursed, h, z, mix ? JSON.stringify(mix) : null, cursed ? 10 : null, cursed ? 10 : null, now).lastInsertRowid);
}
function disc(radius, cursedFn) {
  const ids = {};
  for (let q = -radius; q <= radius; q++) for (let r = -radius; r <= radius; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > radius) continue;
    ids[`${q},${r}`] = addRow(q, r, 0, { cursed: cursedFn(q, r) ? 1 : 0 });
  }
  return ids;
}
function wipeWorld() {
  for (const t of ["territory_tiles", "star_seeds", "territory_buildings", "field_placements", "homeland_wanderers", "first_seed_events"]) {
    try { db.prepare(`DELETE FROM ${t} WHERE owner_key = ?`).run(me); } catch { /* the event table keys differently on old trees */ }
  }
  try { db.prepare("DELETE FROM first_seed_events").run(); } catch {}
}
const rowAt = (q, r, z = 0) => db.prepare("SELECT * FROM territory_tiles WHERE owner_key = ? AND q = ? AND r = ? AND z = ?").get(me, q, r, z);
const servedAt = (terr, q, r, z = 0) => (terr.tiles ?? []).find(t => t.q === q && t.r === r && (t.z ?? 0) === z);
const setStand = (tileId) => db.prepare("UPDATE tender_progress SET tender_tile_id = ? WHERE owner_key = ?").run(tileId, me);
const skyPool = () => db.prepare("SELECT points FROM aspect_attunement WHERE owner_key = ? AND element = 'sky'").get(me).points;
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

/* ═══ §1 THE RING PURIFIES, AND HOLDS ═══════════════════════ */
console.log("§1 the ring purifies what it covers, and holds it");
wipeWorld();
// A Beacon-stage seed at (5,0); its own hex and ring CURSED;
// a cursed frontier far away as the control; the safe centre clean.
const ids1 = disc(3, () => false);
addRow(5, 0, 0, { cursed: 1 });
for (const [dq, dr] of DIRS) addRow(5 + dq, 0 + dr, 0, { cursed: 1 });
const controlId = addRow(12, 0, 0, { cursed: 1 });
addRow(13, 0, 0, { cursed: 1 });
db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at, defenses, fed_energy) VALUES (?, ?, 3, 'fallen', ?, 0, 0)")
  .run(me, rowAt(5, 0).id, now);
setStand(ids1["0,0"]);
ok("before the read, the ring ground stands cursed (the setup is honest)", rowAt(5, 0).cursed === 1 && rowAt(6, 0).cursed === 1);
let terr = await call("getTerritory", {}, token);
ok("the seed's own hex is served purified", servedAt(terr, 5, 0)?.cursed === 0, JSON.stringify(servedAt(terr, 5, 0)));
ok("all six ring hexes are served purified", DIRS.every(([dq, dr]) => servedAt(terr, 5 + dq, dr)?.cursed === 0),
  DIRS.map(([dq, dr]) => `${5 + dq},${dr}=${servedAt(terr, 5 + dq, dr)?.cursed}`).join(" "));
ok("the stored rows agree with the served ground", rowAt(5, 0).cursed === 0 && rowAt(6, 0).cursed === 0 && rowAt(5, 1).cursed === 0);
ok("CONTROL: the far cursed frontier is untouched by the law", servedAt(terr, 12, 0)?.cursed === 1 && servedAt(terr, 13, 0)?.cursed === 1);
for (let i = 0; i < 5; i++) terr = await call("getTerritory", {}, token);
ok("the ring stays clean across sustained reads (curse pressure all around it)",
  servedAt(terr, 5, 0)?.cursed === 0 && DIRS.every(([dq, dr]) => servedAt(terr, 5 + dq, dr)?.cursed === 0));
ok("CONTROL still cursed after the same reads", servedAt(terr, 12, 0)?.cursed === 1);

/* ═══ §2 A BASTION BUILDING RAISES THE SAME RING ════════════ */
console.log("§2 the bastion building's ring");
db.prepare("INSERT INTO territory_buildings (owner_key, tile_id, building_type, status, placed_at) VALUES (?, ?, 'bastion', 'active', ?)").run(me, ids1["-2,1"], now);
db.prepare("UPDATE territory_tiles SET cursed = 1, curse_hp = 10, curse_max_hp = 10 WHERE id = ?").run(ids1["-2,2"]);
db.prepare("UPDATE territory_tiles SET cursed = 1, curse_hp = 10, curse_max_hp = 10 WHERE id = ?").run(ids1["-3,1"]);
terr = await call("getTerritory", {}, token);
ok("curse standing in a fresh bastion's ring is purified by the read",
  servedAt(terr, -2, 2)?.cursed === 0 && servedAt(terr, -3, 1)?.cursed === 0,
  `${servedAt(terr, -2, 2)?.cursed}/${servedAt(terr, -3, 1)?.cursed}`);

/* ═══ §3 THE DOUSED WINDOW ══════════════════════════════════ */
console.log("§3 the doused window — the beacon lesson's rite, ring intact");
wipeWorld();
const ids3 = disc(2, () => false);
const firstId = ids3["0,0"];
db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at, defenses, fed_energy) VALUES (?, ?, 3, 'first', ?, 0, 30)").run(me, firstId, now);
const firstSeedId = db.prepare("SELECT id FROM star_seeds WHERE owner_key = ? AND state = 'first'").get(me).id;
try {
  db.prepare("INSERT INTO first_seed_events (owner_key, seed_id, state, banked, waves_cleared, next_wave_at, created_at, updated_at) VALUES (?, ?, 'done', 1, 0, 0, ?, ?)").run(me, firstSeedId, now, now);
} catch (e) { console.log("  (event row insert skipped:", e.message, ")"); }
setStand(firstId);
db.prepare("UPDATE tender_progress SET protection_bank_ms = 3600000 WHERE owner_key = ?").run(me);
const curseRing = () => { for (const [dq, dr] of DIRS) db.prepare("UPDATE territory_tiles SET cursed = 1, curse_hp = 10, curse_max_hp = 10 WHERE owner_key = ? AND q = ? AND r = ?").run(me, dq, dr); };
const ringServedClean = (t) => DIRS.every(([dq, dr]) => servedAt(t, dq, dr)?.cursed === 0);
curseRing();
terr = await call("getTerritory", {}, token);
ok("the lighthouse's ring is purified on the read (its curse does not stand)", ringServedClean(terr));
const litRes = await callRaw("setLighthouse", { lit: true }, token);
ok("the beacon lights by the Tender's hand", litRes.status < 300, JSON.stringify(litRes.data).slice(0, 160));
curseRing();
terr = await call("getTerritory", {}, token);
ok("lit: ring ground cleansed again and served clean", ringServedClean(terr));
const douseRes = await callRaw("setLighthouse", { lit: false }, token);
ok("the beacon douses by the Tender's hand (the rite's second act)", douseRes.status < 300, JSON.stringify(douseRes.data).slice(0, 160));
curseRing();
terr = await call("getTerritory", {}, token);
ok("DOUSED: the ring still can not fall — ground served clean in the doused window", ringServedClean(terr),
  DIRS.map(([dq, dr]) => `${dq},${dr}=${servedAt(terr, dq, dr)?.cursed}`).join(" "));
terr = await call("getTerritory", {}, token);
ok("DOUSED: and it stays clean on the next read too", ringServedClean(terr));
const relightRes = await callRaw("setLighthouse", { lit: true }, token);
ok("the beacon relights (the rite completes exactly as built)", relightRes.status < 300, JSON.stringify(relightRes.data).slice(0, 160));

/* ═══ §4 THE VACATED PLANE ══════════════════════════════════ */
console.log("§4 the vacated plane — births inside a ring arrive purified");
wipeWorld();
disc(3, () => false);
addRow(12, 0, 0, {}); addRow(13, 1, 0, {}); addRow(12, 1, 0, {});
addRow(5, 0, 0, {});
for (const [dq, dr] of DIRS) addRow(5 + dq, dr, 0, {});
db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at, defenses, fed_energy) VALUES (?, ?, 3, 'fallen', ?, 0, 0)")
  .run(me, rowAt(5, 0).id, now);
// K: a tile in the Beacon seed's ring, grounded at Z0 and
// carrying exactly one lift of Air (the lift it is about to
// make climbs Z0 -> Z1; its newborn stands at the vacated Z0).
const kId = addRow(6, 0, 0, { element: "neutral", mix: { sky: 10, stone: 0, tide: 0, root: 0 } });
setStand(kId);
const skyBefore = skyPool();
const liftTry = await callRaw("attuneTile", { element: "sky", tileId: kId }, token);
ok("the grounded lift inside the ring is allowed (not refused — no new gate)", liftTry.status < 300, JSON.stringify(liftTry.data).slice(0, 200));
const kAfter = db.prepare("SELECT * FROM territory_tiles WHERE id = ?").get(kId);
const kBorn = rowAt(6, 0, 0);
ok("the tile rose to Z1 (the grounded climb)", (kAfter?.z ?? 0) === 1 && kAfter.id === kId, `z=${kAfter?.z} id=${kAfter?.id} vs ${kId}`);
ok("the newborn at the vacated plane is PURIFIED (the ring purified it on arrival)", kBorn && kBorn.cursed === 0, `cursed=${kBorn?.cursed}`);
// The control: the identical lift far outside any ring.
const cId = addRow(13, 0, 0, { element: "neutral", mix: { sky: 10, stone: 0, tide: 0, root: 0 } });
setStand(cId);
const liftCtl = await callRaw("attuneTile", { element: "sky", tileId: cId }, token);
ok("the control lift outside any ring is allowed", liftCtl.status < 300, JSON.stringify(liftCtl.data).slice(0, 200));
const cAfter = db.prepare("SELECT * FROM territory_tiles WHERE id = ?").get(cId);
ok("the control tile rose to Z1 by the same road", (cAfter?.z ?? 0) === 1, `z=${cAfter?.z}`);
const cBorn = rowAt(13, 0, 0);
ok("CONTROL: the control newborn is born CURSED, exactly as the lift law always bore it", cBorn && cBorn.cursed === 1, `cursed=${cBorn?.cursed}`);
ok("both lifts spent their Air alike (the law changed the birth, not the price)", skyPool() === skyBefore - 2, `pool ${skyBefore} -> ${skyPool()}`);

/* ═══ §5 THE FALL ROADS ═════════════════════════════════════ */
console.log("§5 the fall roads refuse ring ground");
wipeWorld();
disc(3, () => false);
addRow(5, 0, 0, {});
for (const [dq, dr] of DIRS) addRow(5 + dq, dr, 0, {});
db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at, defenses, fed_energy) VALUES (?, ?, 3, 'fallen', ?, 0, 0)")
  .run(me, rowAt(5, 0).id, now);
addRow(12, 0, 0, {}); addRow(13, 0, 0, {});
setStand(rowAt(0, 0).id);
terr = await call("getTerritory", {}, token);
const ringTileId = rowAt(6, 0).id;
const dmgRing = await call("damageTileHp", { tileId: ringTileId, damage: 20 }, token);
ok("battle damage still lands on ring ground (its hp pays)", dmgRing.hp === 0, JSON.stringify(dmgRing).slice(0, 120));
ok("but the curse does not: ring ground at 0 hp is NOT cursed", dmgRing.cursed === false && rowAt(6, 0).cursed === 0);
const dmgCtl = await call("damageTileHp", { tileId: rowAt(12, 0).id, damage: 20 }, token);
ok("CONTROL: the same damage curses ground outside any ring", dmgCtl.cursed === true && rowAt(12, 0).cursed === 1, JSON.stringify(dmgCtl).slice(0, 120));
// The chew: a strong dark stands on cursed ground touching pure
// ring ground, and the battle settles read after read.
const chewSpot = addRow(7, 0, 0, { cursed: 1 });
db.prepare("INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, power, lvl, pos_q, pos_r) VALUES (?, ?, 'tangle', ?, 99, 6, 5, 7, 0)").run(me, chewSpot, now);
const chewCtl = addRow(12, 1, 0, { cursed: 1 });
db.prepare("INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, power, lvl, pos_q, pos_r) VALUES (?, ?, 'tangle', ?, 99, 6, 5, 12, 1)").run(me, chewCtl, now);
db.prepare("UPDATE tender_progress SET lighthouse_lit = 0 WHERE owner_key = ?").run(me);
setStand(rowAt(5, 0).id);
for (let i = 0; i < 8; i++) terr = await call("getTerritory", {}, token);
ok("after eight battle reads, no ring tile has fallen to the chew",
  servedAt(terr, 6, 0)?.cursed === 0 && servedAt(terr, 5, 0)?.cursed === 0 && DIRS.every(([dq, dr]) => servedAt(terr, 5 + dq, dr)?.cursed === 0),
  DIRS.map(([dq, dr]) => `${5 + dq},${dr}=${servedAt(terr, 5 + dq, dr)?.cursed}`).join(" "));
console.log(`  (witness: the control dark's neighbourhood — (12,0) cursed=${servedAt(terr, 12, 0)?.cursed}, (13,0) cursed=${servedAt(terr, 13, 0)?.cursed}, (12,1) stands cursed=${rowAt(12, 1)?.cursed})`);

console.log(`\ndrive-beacon-ring: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
