// drive-purify — PURIFY (Nigel, 2026-11-15), the new way
// cursed ground is taken back, proven on the real homeland
// at the server's own doors:
//   §B THE BUTTON: the individual Awoken's wheel entry reads
//      Purify, and the touch confirm speaks the purify.
//   §O THE ORDER: a purify order on a cursed tile deals NO
//      instant damage and spends NO energy — the purify
//      stands, served with the land.
//   §D THE DRAIN: 600 present seconds wear off exactly 1 HP
//      of thickness; the fraction persists on the tile.
//   §A PRESENCE: while the Tender is away, the drain pauses
//      and nothing is lost; it resumes on return.
//   §2 TWO PURIFIERS: two Awoken on one tile drain at the
//      sum of their rates.
//   §M MOVE TO IT: an out-of-reach Awoken marches to the
//      closest own tile within reach, and the purify begins
//      on its arrival.
//   §W THE DEFENCE: defenders birth at the nearest legal
//      cursed tiles within 15, in proportion to the tile's
//      CURRENT thickness (share = round(thickness / 4) —
//      thickness 16 draws 4), converge on the purifier and
//      bite it — while the purifier lands NO strikes and
//      answers with NO thorns (it keeps purifying).
//   §F THE FALL: the purifier falling ends the purify, and
//      the tile keeps the thickness it had lost.
//   §E THE STRIKE STANDS: an Awoken ordered at an ENEMY
//      still strikes — enemy combat is untouched.
//   §T THE TURN, AND NO WAVE-PULL: at 0 the tile turns
//      through the standing purification path (element
//      claimed, the breaker advanced onto it) — and across
//      ten turns, no tile is EVER left in the old breaking
//      state (cursed at 0 HP, owed a wave battle): the old
//      battle trigger on the purify path is gone.
// Run after `npm run build`:
//   node scripts/drive-purify.mjs
import { join } from "node:path";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-purify-"));
process.env.PORT = "39993";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39993";
const PW = "purify-drive-password";
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
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, body: data?.data ?? data, raw: data };
}
async function callOk(action, args, token) {
  const r = await call(action, args, token);
  if (r.status !== 200) throw new Error(`${action} -> ${r.status}: ${JSON.stringify(r.raw).slice(0, 300)}`);
  return r.body;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
const now0 = Date.now();

/* ══ §B THE BUTTON (the client source, read plainly) ══════ */
console.log("§B the button reads Purify");
const terrSrc = readFileSync("client/src/Territory.tsx", "utf8");
ok("§B the individual wheel's stance entry reads Purify",
  terrSrc.includes('key: "ord-attack", sigil: "sword", label: "Purify"'));
ok("§B the touch confirm speaks the purify and confirms as Purify",
  terrSrc.includes("will purify this cursed hex") && terrSrc.includes('confirmLabel = "Purify"'));

/* ══ THE WORLD: a fresh Tender and their sown land ═══════ */
const claim = await callOk("claimTender", { password: PW, tenderName: "Purify Tender" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
const token = claim.token;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 3, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', total_exp = 3800, hp = 100").run(ownerKey, now0);
await callOk("ensureFirstSeed", {}, token);
let land = await callOk("getTerritory", {}, token);
ok("the sown land stands (tiles served)", land.tiles.length >= 19, `${land.tiles.length} tiles`);
const tileAt = (q, r) => land.tiles.find(t => t.q === q && t.r === r);
const servedTile = (id) => land.tiles.find(t => t.id === id);
const setEnergy = (n) => db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = excluded.energy, updated_at = excluded.updated_at").run(ownerKey, n, Date.now());
const purse = () => db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(ownerKey).energy;
const stampPresence = () => db.prepare("UPDATE tender_resources SET last_seen_at = ? WHERE owner_key = ?").run(Date.now(), ownerKey);
async function readLand() { stampPresence(); land = await callOk("getTerritory", {}, token); return land; }
const dbTile = (id) => db.prepare("SELECT * FROM territory_tiles WHERE id = ?").get(id);
/* A fixture curse is laid at the tile's NATURAL depth
 * (4 + 6 per ring, the standing formula): the Seed-Calm
 * law re-thickens any tile whose stored depth stands
 * shallower than its ring allows, so a thin fixture curse
 * would be restored to full before the purify could be
 * read. The thickness under test is the tile's curse_hp;
 * its depth stands at nature's. */
const curseTile = (tile, hp) => {
  const ringOf = Math.max(Math.abs(tile.q), Math.abs(tile.r), Math.abs(tile.q + tile.r));
  db.prepare("UPDATE territory_tiles SET cursed = 1, curse_hp = ?, curse_max_hp = ?, curse_drain = 0 WHERE id = ?").run(hp, 4 + 6 * ringOf, tile.id);
};
const backdatePurify = (awId, seconds) => db.prepare("UPDATE purifies SET settled_at = settled_at - ? WHERE awakened_id = ?").run(seconds * 1000, awId);
/** Walk a purify's clock forward `seconds` of PRESENT time,
 *  in strides inside the presence grace (300s), each
 *  settled by a read — the channeling drives' own pattern:
 *  a settle span longer than the grace is away time and
 *  counts nothing, so a long span is walked in strides of
 *  240s, leaving headroom for the real breath between
 *  settles inside the grace. */
async function purifySeconds(awId, seconds) {
  let left = seconds;
  while (left > 0) {
    const step = Math.min(240, left);
    backdatePurify(awId, step);
    await readLand();
    left -= step;
  }
}
const purifyOn = (tileId) => (land.purifies ?? []).find(p => p.tileId === tileId);
const placementOf = (awId) => (land.placements ?? []).find(p => p.awakenedId === awId);
const hexDist = (a, b) => { const dq = a.q - b.q, dr = a.r - b.r; return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)); };

function seedAwoken(name, partEls) {
  const insA = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 2, 2, ?, ?, 'image/png', ?)");
  const cats = ["body", "arms", "head"];
  const parts = partEls.map((el, i) => {
    const id = Number(insA.run(`${name} ${cats[i]}`, cats[i], el, `purify/${name}-${cats[i]}.png`, Date.now()).lastInsertRowid);
    return { source_id: `db:${id}`, name: `${name} ${cats[i]}`, category: cats[i], rarity: "common", power: 2, toughness: 2, element: el };
  });
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', 'Purify Tender', ?, ?)")
    .run(name, name, `purify/${name}.png`, JSON.stringify(parts), ownerKey, Date.now()).lastInsertRowid);
}
const field = (awId, tile, stance = "attack") => db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
  VALUES (?, ?, ?, ?, ?, ?, 0, 99, ?, ?, NULL, NULL, 1)`).run(ownerKey, awId, tile.id, Date.now(), Date.now(), stance, tile.q, tile.r);

/* The geography is drawn on RING-2 ground throughout:
 * ring-1 tiles neighbour the centre, and the centre's
 * beacon ring cleanses cursed ring ground at every read
 * (Push 76's law) — no cursed fixture could stand there.
 * Ring 2 lies outside the ring, under the curse's own law. */
const CENTRE = tileAt(0, 0);
const TC = tileAt(2, -1);       // the drain tile (ring 2)
const TC2 = tileAt(-2, 1);      // the march tile (ring 2)
const TC3 = tileAt(0, 2);       // the defence tile (ring 2)
const TC4 = tileAt(2, -2);      // the fall tile (ring 2)
const P1 = seedAwoken("Purifier One", ["root", "root", "sky"]);    // Root-dominant
const P2 = seedAwoken("Purifier Two", ["sky", "tide", "root"]);
const P3 = seedAwoken("Purifier Three", ["stone", "stone", "stone"]);
const P4 = seedAwoken("Purifier Four", ["root", "root", "root"]);  // Root-dominant — the thorns witness
const P5 = seedAwoken("Purifier Five", ["root", "tide", "sky"]);
field(P1, tileAt(1, 0));        // adjacent to TC
field(P2, tileAt(1, -1));       // adjacent to TC
field(P3, tileAt(2, 0));        // far from TC2 — it will march
field(P5, TC4);                 // standing ON the fall tile
setEnergy(1000);
await readLand();

/* ══ §O THE ORDER — no blow, no price ════════════════════ */
console.log("§O the order — no instant damage, no energy");
curseTile(TC, 10);
const purseBefore = purse();
const order = await call("attackTile", { awakenedId: P1, tileId: TC.id }, token);
ok("§O the order is taken as a purify", order.status === 200 && order.body.purifying === true && !order.body.marching, JSON.stringify(order.raw).slice(0, 200));
ok("§O the order deals NO instant damage (thickness still 10)", dbTile(TC.id).curse_hp === 10, `curse_hp ${dbTile(TC.id).curse_hp}`);
ok("§O the order spends NO energy", purse() === purseBefore, `purse ${purseBefore} -> ${purse()}`);
await readLand();
ok("§O the purify stands, served with the land", (purifyOn(TC.id)?.purifiers ?? []).includes(P1), JSON.stringify(land.purifies));

/* ══ §D THE DRAIN — 1 HP per 600 present seconds ═════════ */
console.log("§D the drain — slow, fractional, persistent");
await purifySeconds(P1, 600);
ok("§D 600 present seconds wear off exactly 1 HP", servedTile(TC.id).curseHp === 9, `curseHp ${servedTile(TC.id).curseHp}`);
await purifySeconds(P1, 300);
ok("§D 300 more seconds fold nothing yet — the fraction persists on the tile",
  servedTile(TC.id).curseHp === 9 && Math.abs((dbTile(TC.id).curse_drain ?? 0) - 0.5) < 0.02,
  `curseHp ${servedTile(TC.id).curseHp}, drain ${dbTile(TC.id).curse_drain}`);
await purifySeconds(P1, 300);
ok("§D the second 300 completes the next HP", servedTile(TC.id).curseHp === 8, `curseHp ${servedTile(TC.id).curseHp}`);

/* ══ §A PRESENCE — away, the drain pauses ═════════════════ */
console.log("§A presence — online only, nothing lost");
db.prepare("UPDATE tender_resources SET last_seen_at = ? WHERE owner_key = ?").run(Date.now() - 3600_000, ownerKey);
backdatePurify(P1, 3000); // a window wholly outside the presence grace
land = await callOk("getTerritory", {}, token); // no presence stamp — the Tender is away
ok("§A an absent hour drains nothing", servedTile(TC.id).curseHp === 8 && Math.abs(dbTile(TC.id).curse_drain ?? 0) < 0.02,
  `curseHp ${servedTile(TC.id).curseHp}, drain ${dbTile(TC.id).curse_drain}`);
ok("§A the purify itself stands through the absence", (purifyOn(TC.id)?.purifiers ?? []).includes(P1));
await purifySeconds(P1, 600); // the stamp returns the Tender (readLand stamps)
ok("§A on return, the drain resumes where it stopped", servedTile(TC.id).curseHp === 7, `curseHp ${servedTile(TC.id).curseHp}`);

/* ══ §2 TWO PURIFIERS — the rates add ═════════════════════ */
console.log("§2 two purifiers — twice the drain");
const order2 = await call("attackTile", { awakenedId: P2, tileId: TC.id }, token);
ok("§2 the second purify order is taken", order2.status === 200 && order2.body.purifying === true, JSON.stringify(order2.raw).slice(0, 200));
for (let i = 0; i < 3; i++) { backdatePurify(P1, 240); backdatePurify(P2, 240); await readLand(); }
ok("§2 600 shared seconds wear off 2 HP (one per purifier)", servedTile(TC.id).curseHp === 5, `curseHp ${servedTile(TC.id).curseHp}`);
ok("§2 both purifiers stand on the tile's order", (purifyOn(TC.id)?.purifiers ?? []).length === 2, JSON.stringify(land.purifies));

/* ══ §M MOVE TO IT — the march, then the purify ══════════ */
console.log("§M move to it — one tap, the Awoken goes and begins");
curseTile(TC2, 6);
const orderM = await call("attackTile", { awakenedId: P3, tileId: TC2.id }, token);
ok("§M the out-of-reach order answers marching", orderM.status === 200 && orderM.body.purifying === true && orderM.body.marching === true, JSON.stringify(orderM.raw).slice(0, 200));
const marchRow = db.prepare("SELECT march_goal AS g FROM field_placements WHERE awakened_id = ?").get(P3);
ok("§M the march carries the purify goal", marchRow?.g === `purify:${TC2.id}`, `goal ${marchRow?.g}`);
db.prepare("UPDATE field_placements SET march_since = ?, march_ends = ? WHERE awakened_id = ?").run(Date.now() - 100_000, Date.now() - 1_000, P3);
await readLand();
const p3Stand = servedTile(placementOf(P3)?.tileId ?? -1);
ok("§M the walker arrived on own ground within reach of the cursed tile", !!p3Stand && hexDist(p3Stand, TC2) === 1, `tileId ${placementOf(P3)?.tileId}`);
ok("§M the purify stands for the arrived walker", (purifyOn(TC2.id)?.purifiers ?? []).includes(P3), JSON.stringify(land.purifies));
await purifySeconds(P3, 600);
ok("§M after arrival, the drain runs (6 -> 5)", servedTile(TC2.id).curseHp === 5, `curseHp ${servedTile(TC2.id).curseHp}`);

/* ══ §W THE DEFENCE — proportional, converging, biting ═══ */
console.log("§W the defence — proportional to the thickness");
curseTile(TC3, 16); // share = round(16 / 4) = 4 defenders
curseTile(tileAt(1, 1), 8); curseTile(tileAt(-1, 2), 8); // the near birth ground (one hex off); TC and TC2, still cursed at three hexes, are the far birth ground
field(P4, TC3); // the purifier stands ON the cursed tile
const orderW = await call("attackTile", { awakenedId: P4, tileId: TC3.id }, token);
ok("§W the purify order on the defence tile is taken", orderW.status === 200 && orderW.body.purifying === true, JSON.stringify(orderW.raw).slice(0, 200));
// The earlier tiles' orders are fully proven by now; lift
// their purifiers off the field by the fixture's hand, so
// the defence is read alone — no other fighter stands to
// strike a defender or draw its walk. (Purifier Five is
// fielded again in §F, on its own tile.)
db.prepare("DELETE FROM purifies WHERE tile_id IN (?, ?)").run(TC.id, TC2.id);
db.prepare("DELETE FROM field_placements WHERE awakened_id IN (?, ?, ?, ?)").run(P1, P2, P3, P5);
// And the field itself is cleared by the fixture's hand:
// a young land's cradle and the seed's risings fill the
// standing field cap on their own, and the cap binds over
// the share (the brief's own law) — the share is read here
// against a field with room to answer.
db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(ownerKey);
// Force cradle beats — two rounds of four. The share is a
// standing reckoning, topped up beat over beat by the
// design's own words ("on each cradle beat, if the
// defenders number fewer than the share, birth another"),
// so the drive gives the cradle its beats and then reads
// the share standing whole.
for (let round = 0; round < 2; round++) {
  db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ?, wanderer_settled_beats = 1 WHERE owner_key = ?").run(Date.now() - 5 * 45000, ownerKey);
  await readLand();
}
const defenders = db.prepare("SELECT * FROM homeland_wanderers WHERE owner_key = ? AND defend_tile_id = ?").all(ownerKey, TC3.id);
ok("§W four defenders stand for a thickness of 16 (share = round(16/4))", defenders.length === 4, `${defenders.length} defenders`);
ok("§W every defender was born on cursed ground within 15 hexes",
  defenders.every(d => { const t = dbTile(d.tile_id); return t && t.cursed === 1 && hexDist(t, TC3) <= 15; }),
  defenders.map(d => `${d.tile_id}`).join(","));
const defMaxHp = new Map(defenders.map(d => [d.id, d.hp]));
// Twenty seconds of war: the defenders converge and bite;
// the purifier answers with nothing. (The dark strikes run
// on a wall-clock cadence, one pass per settle — a newborn's
// first settle only arms its clock — so the fixture rewinds
// the defenders' strike clocks between reads, the same
// time-travel the watermark backdate performs for the
// step-walked parts of the battle. Two windows only: the
// bites land hard — a rewound window is ~24 bites — and a
// third would fell the purifier outright, which is §F's
// ground, not this section's.)
let p4Strikes = 0, p4Bites = 0;
for (let i = 0; i < 2; i++) {
  db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?")
    .run(Date.now() - 10_500, ownerKey);
  db.prepare("UPDATE homeland_wanderers SET last_strike_at = 1 WHERE owner_key = ? AND defend_tile_id = ?").run(ownerKey, TC3.id);
  await readLand();
  p4Strikes += (land.strikes ?? []).filter(s => s.kind === "placement" && s.awakenedId === P4).length;
  p4Bites += (land.strikes ?? []).filter(s => s.kind === "dark" && s.awakenedId === P4).length;
}
const defendersAfter = db.prepare("SELECT * FROM homeland_wanderers WHERE owner_key = ? AND defend_tile_id = ?").all(ownerKey, TC3.id);
const p4Pos = { q: TC3.q, r: TC3.r };
ok("§W the defenders converged — all within bite reach of the purifier",
  defendersAfter.length === 4 && defendersAfter.every(d => hexDist({ q: d.pos_q, r: d.pos_r }, p4Pos) <= 1.36),
  defendersAfter.map(d => `${hexDist({ q: d.pos_q, r: d.pos_r }, p4Pos).toFixed(2)}`).join(","));
ok("§W the defenders struck at the purifier (dark strikes witnessed against it)", p4Bites > 0, `${p4Bites} bites witnessed`);
ok("§W the purifier was bitten (its HP fell)", (placementOf(P4)?.hp ?? 99) < 99, `hp ${placementOf(P4)?.hp}`);
ok("§W the purifier landed NO strikes while purifying", p4Strikes === 0, `${p4Strikes} strikes`);
ok("§W the defenders are unhurt — no strikes, no thorns from the purifier",
  defendersAfter.every(d => d.hp === defMaxHp.get(d.id)),
  defendersAfter.map(d => `${d.hp}/${defMaxHp.get(d.id)}`).join(","));

/* ══ §F THE FALL — the purify ends, the progress keeps ═══ */
console.log("§F the fall — progress kept");
curseTile(TC4, 8);
field(P5, TC4); // fielded again, standing ON the fall tile
const orderF = await call("attackTile", { awakenedId: P5, tileId: TC4.id }, token);
ok("§F the fall tile's purify order is taken", orderF.status === 200 && orderF.body.purifying === true, JSON.stringify(orderF.raw).slice(0, 200));
await purifySeconds(P5, 600);
ok("§F one HP is worn off before the fall (8 -> 7)", servedTile(TC4.id).curseHp === 7, `curseHp ${servedTile(TC4.id).curseHp}`);
db.prepare("UPDATE field_placements SET hp = 1, curse_since = ? WHERE awakened_id = ?").run(Date.now() - 60_000, P5); // a full capped minute of the curse's withering (3 HP) takes it
await readLand();
ok("§F the fallen purifier is off the field (standing dissipation)", !placementOf(P5), JSON.stringify((land.placements ?? []).map(p => p.awakenedId)));
ok("§F the purify ended with the fall", !purifyOn(TC4.id), JSON.stringify(land.purifies));
ok("§F the tile keeps the thickness it lost (still 7)", dbTile(TC4.id).curse_hp === 7, `curse_hp ${dbTile(TC4.id).curse_hp}`);

/* ══ §E THE STRIKE STANDS — enemy combat untouched ═══════ */
console.log("§E the strike stands — pointed at an enemy");
const F1 = seedAwoken("Striker One", ["sky", "sky", "sky"]);
field(F1, CENTRE);
const foeTile = tileAt(1, -1);
db.prepare("INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl) VALUES (?, ?, 'fray', ?, 60, ?, ?, 1, 1)")
  .run(ownerKey, foeTile.id, Date.now(), foeTile.q, foeTile.r);
let f1Strikes = 0;
for (let i = 0; i < 4; i++) {
  db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?")
    .run(Date.now() - 10_500, ownerKey);
  await readLand();
  f1Strikes += (land.strikes ?? []).filter(s => s.kind === "placement" && s.awakenedId === F1).length;
}
ok("§E a fielded Awoken in attack stance still strikes an enemy", f1Strikes > 0, `${f1Strikes} strikes witnessed`);

/* ══ §T THE TURN — the standing path, and no wave-pull ═══ */
console.log("§T the turn — purified whole, never left breaking");
/* Six fresh ring-2 tiles, then four of them a second time
 * (re-cursed by the fixture's hand): the old strike's roll
 * would have left a breaking tile behind ~86% of the time
 * across ten turns; the purify must leave none, ever. */
const turnTiles = [[1, -2], [0, -2], [-1, -1], [-2, 0], [2, 0], [-2, 2], [1, -2], [0, -2], [-1, -1], [-2, 0]];
field(P1, CENTRE); // fielded again — §W's cleanup lifted it; the loop below walks it tile to tile
let turnsOk = 0, breakingSeen = 0;
for (const [q, r] of turnTiles) {
  const t = tileAt(q, r);
  curseTile(t, 2);
  db.prepare("UPDATE field_placements SET tile_id = ?, pos_q = ?, pos_r = ?, stance = 'attack' WHERE awakened_id = ?").run(t.id, t.q, t.r, P1);
  const o = await call("attackTile", { awakenedId: P1, tileId: t.id }, token);
  if (o.status !== 200 || o.body.purifying !== true) { console.log(`  turn ${q},${r}: order refused`, JSON.stringify(o.raw).slice(0, 160)); continue; }
  await purifySeconds(P1, 1200);
  const st = servedTile(t.id);
  if (st && st.cursed === 0 && typeof st.element === "string" && st.element.length > 0 && placementOf(P1)?.tileId === t.id) turnsOk++;
  else console.log(`  turn ${q},${r}: cursed ${st?.cursed}, element ${st?.element}, breaker on ${placementOf(P1)?.tileId} vs ${t.id}`);
  breakingSeen += land.tiles.filter(x => x.cursed === 1 && (x.curseHp ?? 1) <= 0).length;
}
ok("§T all ten tiles turned through the standing path (element claimed, breaker advanced onto the tile)", turnsOk === 10, `${turnsOk}/10`);
ok("§T no tile was ever left breaking (cursed at 0 HP, owed the old wave battle)", breakingSeen === 0, `${breakingSeen} breaking tiles seen`);
const rwp = await call("resolveWavePull", { tileId: 999999, victory: false, survivorIds: [] }, token);
ok("§T the wave-pull door itself stands for its other road (resolveWavePull answers with its own refusal)",
  rwp.status >= 400 && JSON.stringify(rwp.raw).includes("No such cursed tile"), JSON.stringify(rwp.raw).slice(0, 160));

console.log(`\nPURIFY DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
