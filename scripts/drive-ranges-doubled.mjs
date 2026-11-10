// RANGES DOUBLED + THE DISTANCE TOLL (Nigel, 2026-11-10):
// the shot reaches doubled — cast ring 6 → 12, arrow 4 → 8,
// root/fire 2 → 4, tide 3 → 6, sky 4 → 8 — while MELEE
// REACH DOES NOT DOUBLE (swordshield 1, sword 1, spear 2,
// stone 1 stand), and an Awokin's ELEMENT strike pays the
// distance toll: +1 to the target's AC for each hex beyond
// the first, the raised number serving the hit AND the
// mitigation alike (strikeTargetAcFor, enemyAC.ts).
// Boots the real server on a scratch DATA_DIR and proves
// the settlement against the server's own mouth: the
// reckoning read directly (§0), real casts (§1), the real
// weapon referee (§2), and the battle settlement's strike
// witness — which now carries the AC each blow resolved
// against (§3, §4). §5 speaks for the Table.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-ranges-doubled-"));
process.env.PORT = "39962";
process.env.WORKSHOP_PASSWORD = "ranges-doubled-harness";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
await import("../server/dist/index.js");
await new Promise(r => setTimeout(r, 2500));
const base = "http://127.0.0.1:39962";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) { pass++; console.log("  ok -", name); } else { fail++; console.log("  FAIL -", name, extra); } };
async function call(action, args, token, expectFail = false) {
  const res = await fetch(`${base}/api/${action}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) }, body: JSON.stringify(args) });
  const data = await res.json().catch(() => ({}));
  if (!expectFail && !res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return { status: res.status, data };
}
const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }
const axialRound = (q, r) => {
  const x = q, z = r, y = -x - z;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
  return { q: rx, r: rz };
};
const hexDistOf = (a, b) => { const A = axialRound(a.q, a.r), B = axialRound(b.q, b.r); return (Math.abs(A.q - B.q) + Math.abs(A.q + A.r - B.q - B.r) + Math.abs(A.r - B.r)) / 2; };

/* ── §0 THE RECKONING, READ DIRECTLY ──────────────────── */
console.log("§0 the settlement's numbers, read from the built modules");
{
  const A = await import("../server/dist/actions.js");
  const T = await import("../server/dist/table.js");
  const E = await import("../server/dist/enemyAC.js");
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  ok("the cast ring doubled: HOMELAND_CAST_RING === 12", A.HOMELAND_CAST_RING === 12, String(A.HOMELAND_CAST_RING));
  ok("the weapon table: arrow 8; swordshield 1, sword 1, spear 2 unmoved",
    eq(A.HOMELAND_WEAPON_RANGE_HEX, { swordshield: 1, sword: 1, spear: 2, arrow: 8 }), JSON.stringify(A.HOMELAND_WEAPON_RANGE_HEX));
  ok("the element table: root 4, fire 4, tide 6, sky 8; stone 1 unmoved",
    eq(A.HOMELAND_ELEMENT_REACH, { stone: 1, root: 4, fire: 4, tide: 6, sky: 8 }), JSON.stringify(A.HOMELAND_ELEMENT_REACH));
  ok("mirror: the Table's weapon table is the homeland's, cell for cell", eq(A.HOMELAND_WEAPON_RANGE_HEX, T.WEAPON_RANGE_HEX));
  ok("mirror: the Table's element table is the homeland's, cell for cell", eq(A.HOMELAND_ELEMENT_REACH, T.ELEMENT_REACH));
  ok("the weapon-attunement override reads the same element table: an attuned arrow flies at sky's 8, a stone-attuned sword still reaches only 1",
    A.homelandWeaponRangeFor("arrow", "sky", 1, false) === 8 && A.homelandWeaponRangeFor("sword", "stone", 1, false) === 1);
  ok("the toll reckoning itself: base inside the first hex; +1 a hex past it",
    E.strikeTargetAcFor(11, 0) === 11 && E.strikeTargetAcFor(11, 1) === 11 && E.strikeTargetAcFor(11, 2) === 12
    && E.strikeTargetAcFor(11, 4) === 14 && E.strikeTargetAcFor(11, 8) === 18 && E.strikeTargetAcFor(15, 8) === 22,
    [0, 1, 2, 4, 8].map(d => E.strikeTargetAcFor(11, d)).join(","));
}

/* ── shared fixtures (test60 / test61 / drive-battle shapes) ── */
async function claimTender(name, exp = 200) {
  const claim = await call("claimTender", { password: "ranges-doubled-password", tenderName: name });
  const token = claim.data.token;
  const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.data.tender.code).id}`;
  // Post-Door harness (the marching-islands drive's shape):
  // the choosing itself is gated behind the entrance's three
  // wakes, so the harness lays the class on the progress row
  // directly, as every current drive does.
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, updated_at) VALUES (?, ?, 0, 'warden', ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp, class_key = 'warden'").run(me, exp, Date.now());
  return { token, me };
}
const setWeapon = (me, key) => db.prepare("UPDATE tender_progress SET weapon_key = ? WHERE owner_key = ?").run(key, me);
const unlockSpell = (me, key) => db.prepare("INSERT INTO spell_unlocks (owner_key, spell_key, unlocked_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING").run(me, key, Date.now());
const seedTile = (me) => (q, r, cursed) => Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, ?, ?, ?, ?)").run(me, q, r, cursed, Date.now()).lastInsertRowid);
const seedWanderer = (me, tileId, hp = null) => Number(db.prepare("INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp) VALUES (?, ?, 'fray', ?, ?)").run(me, tileId, Date.now(), hp).lastInsertRowid);
const keepStanding = (me, maxHp = 50) => db.prepare("UPDATE tender_progress SET hp = ?, down_until = NULL, wanderer_watermark = NULL WHERE owner_key = ?").run(maxHp, me);
const forceWeaponDue = (me) => db.prepare("UPDATE tender_progress SET weapon_next_at = ? WHERE owner_key = ?").run(Date.now() - 1, me);
const terr = async (token) => (await call("getTerritory", {}, token)).data;
const setEnergy = (me, n) => db.prepare("INSERT INTO tender_resources (owner_key, energy, terrain_bank, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = excluded.energy").run(me, n, Date.now());
const castRaw = async (token, body) => call("castMapWorking", body, token, true);

/* ── §1 THE CAST RING, LIVE ───────────────────────────── */
console.log("§1 a cast at ring 9 and at ring 12 is answered; ring 13 is refused, the ring named");
{
  const { token, me } = await claimTender("Ring Tender", 200);
  const tile = seedTile(me);
  tile(0, 0, 0);
  const row = {};
  for (let q = 1; q <= 13; q++) row[q] = tile(q, 0, q === 13 ? 1 : 0);
  unlockSpell(me, "blade"); // the page wakes — the reach, not the lock, is this proof's subject
  setEnergy(me, 100);
  const r9 = await castRaw(token, { spellKey: "blade", hue: "unaligned", tileId: row[9] });
  ok("a cast at ring 9 — beyond the old ring 6 — is answered, not refused", r9.status === 200, `status=${r9.status} ${JSON.stringify(r9.data)}`);
  const r12 = await castRaw(token, { spellKey: "blade", hue: "unaligned", tileId: row[12] });
  ok("a cast at ring 12 — the doubled ring's very edge — is answered", r12.status === 200, `status=${r12.status} ${JSON.stringify(r12.data)}`);
  const before = db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(me)?.energy;
  const r13 = await castRaw(token, { spellKey: "blade", hue: "unaligned", tileId: row[13] });
  ok("a cast at ring 13 is refused (400)", r13.status === 400, `status=${r13.status} ${JSON.stringify(r13.data)}`);
  ok("the refusal names the ring it keeps: “ring 12 of where you stand”", JSON.stringify(r13.data).includes("ring 12"), JSON.stringify(r13.data));
  const after = db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(me)?.energy;
  ok("the refusal charged nothing", before === after, `${before} -> ${after}`);
}

/* ── §2 THE TENDER'S WEAPON: the arrow doubled, melee still ── */
console.log("§2 the arrow resolves at 6 hexes; a sword does not reach 2; a spear does not reach 3 but lands at 2");
{
  const a = await claimTender("Arrow Tender", 200);
  const at = seedTile(a.me);
  at(0, 0, 0);
  const aFar = at(6, 0, 1);
  setWeapon(a.me, "arrow");
  const aWid = seedWanderer(a.me, aFar, 100);
  keepStanding(a.me); forceWeaponDue(a.me);
  const aTerr = await terr(a.token);
  ok("the arrow's strike resolves against a dark 6 hexes off (its old reach was 4)",
    !!aTerr.weaponStrike && aTerr.weaponStrike.weaponKey === "arrow" && aTerr.weaponStrike.wandererId === aWid,
    JSON.stringify(aTerr.weaponStrike));

  const s = await claimTender("Sword Tender", 200);
  const st = seedTile(s.me);
  st(0, 0, 0);
  const sFar = st(2, 0, 1);
  setWeapon(s.me, "sword");
  const sWid = seedWanderer(s.me, sFar, 3);
  keepStanding(s.me); forceWeaponDue(s.me);
  const sTerr = await terr(s.token);
  ok("a sword does NOT reach a dark 2 hexes off — melee did not move",
    !(sTerr.weaponStrike && sTerr.weaponStrike.wandererId === sWid), JSON.stringify(sTerr.weaponStrike));
  ok("the unreached dark stands unwounded", db.prepare("SELECT hp FROM homeland_wanderers WHERE id = ?").get(sWid)?.hp === 3);

  const p = await claimTender("Spear Tender", 200);
  const pt = seedTile(p.me);
  pt(0, 0, 0);
  const pFar = pt(3, 0, 1);
  const pNear = pt(2, 0, 1);
  setWeapon(p.me, "spear");
  const pWidFar = seedWanderer(p.me, pFar, 100);
  keepStanding(p.me); forceWeaponDue(p.me);
  const pTerr1 = await terr(p.token);
  ok("a spear does NOT reach a dark 3 hexes off — the spear stays 2, as ruled",
    !(pTerr1.weaponStrike && pTerr1.weaponStrike.wandererId === pWidFar), JSON.stringify(pTerr1.weaponStrike));
  const pWidNear = seedWanderer(p.me, pNear, 100);
  keepStanding(p.me); forceWeaponDue(p.me);
  const pTerr2 = await terr(p.token);
  ok("the spear lands at 2 hexes, its own lawful reach",
    !!pTerr2.weaponStrike && pTerr2.weaponStrike.weaponKey === "spear" && pTerr2.weaponStrike.wandererId === pWidNear,
    JSON.stringify(pTerr2.weaponStrike));
}

/* ── battle fixtures (drive-battle's shapes) ── */
function seedAwokin(ownerKey, tenderName, name, element, power = 3, toughness = 3, exp = 0) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)").run(`${name} ${cat}`, cat, power, toughness, element, `ranges/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power, toughness, element });
  }
  const id = Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)").run(name, name, `ranges/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
  if (exp) db.prepare("UPDATE awakened SET experience = ? WHERE id = ?").run(exp, id);
  return id;
}
function placeAwokin(ownerKey, awakenedId, tileId, q, r, hp = 99) {
  const info = db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
    VALUES (?, ?, ?, ?, ?, 'defense', 0, ?, ?, ?, NULL, NULL, 0)`).run(ownerKey, awakenedId, tileId, Date.now(), Date.now(), hp, q, r);
  return Number(info.lastInsertRowid);
}
function seedDark(ownerKey, tileId, q, r, hp = 100000) {
  const info = db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
    VALUES (?, ?, 'fray', ?, ?, ?, ?, 1, 1, 0)`).run(ownerKey, tileId, Date.now(), hp, q, r);
  return Number(info.lastInsertRowid);
}
async function prime(ownerKey, token) { await call("getTerritory", {}, token); }
async function advance(ownerKey, token, ms) {
  db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now() - ms, ownerKey);
  return (await call("getTerritory", {}, token)).data;
}
async function claimBattle(name) {
  const c = await call("claimTender", { password: "ranges-doubled-password", tenderName: name });
  const id = db.prepare("SELECT id FROM tenders WHERE code = ?").get(c.data.tender.code).id;
  const ownerKey = `tender:${id}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, updated_at) VALUES (?, 3800, 0, 'warden', ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800, class_key = 'warden'").run(ownerKey, Date.now());
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(ownerKey, Date.now());
  return { token: c.data.token, ownerKey };
}
const tileAt = (me, q, r) => db.prepare("SELECT id FROM territory_tiles WHERE owner_key = ? AND q = ? AND r = ?").get(me, q, r)?.id;
function seedRow(me, upto, cursedFrom = 1) {
  const tile = seedTile(me);
  tile(0, 0, 0);
  for (let q = 1; q <= upto; q++) tile(q, 0, q >= cursedFrom ? 1 : 0);
}
/** Gather a striker's witnessed blows across advance windows,
 *  re-pinning her dark to its hex before each window so the
 *  distance the proof names is the distance the referee met. */
async function gatherStrikes(G, awId, darkId, pinQ, pinTileId, windows = 4) {
  const seen = new Map();
  for (let i = 0; i < windows; i++) {
    db.prepare("UPDATE homeland_wanderers SET pos_q = ?, pos_r = 0, tile_id = ?, hp = 100000 WHERE id = ?").run(pinQ, pinTileId, darkId);
    const t = await advance(G.ownerKey, G.token, 10000);
    for (const s of (t.strikes ?? [])) {
      if (s.kind === "placement" && s.awakenedId === awId) seen.set(s.id, s);
    }
    if (seen.size) break;
  }
  return [...seen.values()];
}
const tollSweep = (strikes, baseAc = 11) => strikes.every(s => s.ac === baseAc + Math.max(0, hexDistOf({ q: s.fromQ, r: s.fromR }, { q: s.toQ, r: s.toR }) - 1));

/* ── §3 STONE: reach 1 stands; inside it, no toll ── */
console.log("§3 a stone hand strikes nothing at 2 hexes; at 1 hex her blows resolve against the bare AC 11");
{
  const G = await claimBattle("Stone Proof");
  seedRow(G.ownerKey, 2);
  const t0 = tileAt(G.ownerKey, 0, 0), t1 = tileAt(G.ownerKey, 1, 0), t2 = tileAt(G.ownerKey, 2, 0);
  const aw = seedAwokin(G.ownerKey, "Stone Proof", "Stone Hand", "stone", 3, 3);
  placeAwokin(G.ownerKey, aw, t0, 0, 0);
  const darkFar = seedDark(G.ownerKey, t2, 2, 0);
  await prime(G.ownerKey, G.token);
  let t = await advance(G.ownerKey, G.token, 1200);
  t = await advance(G.ownerKey, G.token, 800);
  const early = (t.strikes ?? []).filter(s => s.kind === "placement" && s.awakenedId === aw);
  ok("no stone strike while the only dark stands 2 hexes off — stone's reach stayed 1", early.length === 0, JSON.stringify(early));
  // The far dark has walked in to biting distance by now and
  // holds the stone hand's one target slot; its part in the
  // proof is done, so it is lifted away — what remains is the
  // near dark alone, at exactly 1 hex. Her cadence stone is
  // re-wound too: the early windows already ran her strike
  // clock out against the far dark's slot, and her next blow
  // would otherwise fall due beyond this proof's windows.
  // The reach and the toll are the proof; the referee's
  // strike clock is not.
  db.prepare("DELETE FROM homeland_wanderers WHERE id = ?").run(darkFar);
  db.prepare("UPDATE field_placements SET battle_next_at = 0 WHERE awakened_id = ?").run(aw);
  const darkNear = seedDark(G.ownerKey, t1, 1, 0);
  // Stone's own cadence, waited out in one step each: the
  // first window only re-arms her clock (the strike loop's
  // arm step), and her blows then fall one to a window —
  // and the witness keeps only the freshest ~120 seconds of
  // server time while battle time runs far faster, so a
  // sweep across many windows loses its own early blows.
  // Three windows keep every blow inside the witness: the
  // arm, then blows.
  const strikes = [];
  for (let i = 0; i < 3; i++) {
    db.prepare("UPDATE homeland_wanderers SET pos_q = 1, pos_r = 0, tile_id = ?, hp = 100000 WHERE id = ?").run(t1, darkNear);
    const tt = await advance(G.ownerKey, G.token, 10000);
    for (const s of (tt.strikes ?? [])) if (s.kind === "placement" && s.awakenedId === aw && !strikes.some(o => o.id === s.id)) strikes.push(s);
  }
  ok("the stone hand strikes the dark at 1 hex", strikes.length > 0, `n=${strikes.length}`);
  // The first blow meets the Fray whole: AC 11, no toll at
  // distance 1. Later blows meet it CRACKED — her own stone
  // hand cracks the shell she strikes (the standing crack
  // law shaves the base before the toll is laid on), so the
  // witnessed numbers step down from 11, never up: no blow
  // at distance 1 ever reads above the bare base.
  ok("the first stone blow resolved against the bare AC 11 — distance 1 pays NO toll",
    strikes.length > 0 && strikes[0].ac === 11, JSON.stringify(strikes.map(s => s.ac)));
  ok("no stone blow at distance 1 ever reads above the bare base 11 — the toll adds nothing inside the first hex",
    strikes.length > 0 && strikes.every(s => s.ac <= 11), JSON.stringify(strikes.map(s => s.ac)));
  void darkFar;
}

/* ── §4 THE TOLL, IN THE REFEREE'S OWN NUMBERS ── */
console.log("§4 a root blow at 2 hexes resolves against AC 12; a sky blow at 8 hexes against AC 18 (the Fray's base is 11)");
{
  const G = await claimBattle("Root Proof");
  seedRow(G.ownerKey, 2);
  const t0 = tileAt(G.ownerKey, 0, 0), t2 = tileAt(G.ownerKey, 2, 0);
  const aw = seedAwokin(G.ownerKey, "Root Proof", "Root Hand", "root", 3, 3);
  placeAwokin(G.ownerKey, aw, t0, 0, 0);
  const dark = seedDark(G.ownerKey, t2, 2, 0);
  await prime(G.ownerKey, G.token);
  const strikes = await gatherStrikes(G, aw, dark, 2, t2);
  const at2 = strikes.filter(s => hexDistOf({ q: s.fromQ, r: s.fromR }, { q: s.toQ, r: s.toR }) === 2);
  ok("the root hand struck (her reach is 4 now — the dark at 2 is well inside it)", strikes.length > 0, `n=${strikes.length}`);
  ok("a root blow struck at exactly 2 hexes", at2.length > 0, JSON.stringify(strikes.map(s => [s.fromQ, s.fromR, s.toQ, s.toR])));
  ok("that blow resolved against AC 12 — base 11 + 1 for the second hex", at2.length > 0 && at2.every(s => s.ac === 12), JSON.stringify(at2.map(s => s.ac)));
  ok("sweep: every witnessed root blow's AC is its own distance's toll, recomputed from the witness's from/to",
    strikes.length > 0 && tollSweep(strikes), JSON.stringify(strikes.map(s => [hexDistOf({ q: s.fromQ, r: s.fromR }, { q: s.toQ, r: s.toR }), s.ac])));
}
{
  const G = await claimBattle("Sky Proof");
  seedRow(G.ownerKey, 8);
  const t0 = tileAt(G.ownerKey, 0, 0), t8 = tileAt(G.ownerKey, 8, 0);
  const aw = seedAwokin(G.ownerKey, "Sky Proof", "Sky Hand", "sky", 1, 3);
  placeAwokin(G.ownerKey, aw, t0, 0, 0);
  const dark = seedDark(G.ownerKey, t8, 8, 0);
  await prime(G.ownerKey, G.token);
  const strikes = await gatherStrikes(G, aw, dark, 8, t8);
  const at8 = strikes.filter(s => hexDistOf({ q: s.fromQ, r: s.fromR }, { q: s.toQ, r: s.toR }) === 8);
  ok("the sky hand struck across the doubled reach (her old reach was 4)", strikes.length > 0, `n=${strikes.length}`);
  ok("a sky blow struck at exactly 8 hexes", at8.length > 0, JSON.stringify(strikes.map(s => [s.fromQ, s.fromR, s.toQ, s.toR])));
  ok("that blow resolved against AC 18 — base 11 + 7 for hexes two through eight", at8.length > 0 && at8.every(s => s.ac === 18), JSON.stringify(at8.map(s => s.ac)));
  ok("sweep: every witnessed sky blow's AC is its own distance's toll, recomputed from the witness's from/to",
    strikes.length > 0 && tollSweep(strikes), JSON.stringify(strikes.map(s => [hexDistOf({ q: s.fromQ, r: s.fromR }, { q: s.toQ, r: s.toR }), s.ac])));
}

/* ── §5 THE TABLE ── */
console.log("§5 the Table: same tables (mirror, §0), same reckoning — its witness differs, and that is stated plainly");
{
  // The Table's referee is its own code (strikeOnce in
  // table.ts), NOT the homeland's loop — so the toll had to
  // be laid there too, and it was: through the SAME one
  // reckoning in enemyAC.ts. The Table's strike witness is
  // a flight record (from/to/element/hit) and carries no AC
  // field, so the numeric proof at the Table is: the shared
  // reckoning's numbers (§0), the mirror tables (§0), and
  // the built Table referee routing its one strike site
  // through that reckoning — read off the built module here.
  const built = readFileSync(new URL("../server/dist/table.js", import.meta.url), "utf8");
  const uses = (built.match(/strikeTargetAcFor/g) ?? []).length;
  ok("the built Table referee calls strikeTargetAcFor (import + its strikeOnce site)", uses >= 2, `uses=${uses}`);
  const site = built.indexOf("strikeTargetAcFor(target.armor");
  ok("the toll at the Table is laid on target.armor — the same number its hit roll and fateMitigate read",
    site >= 0, `site=${site}`);
  console.log("  note — the Table assertion differs from the homeland's by design of its witness: no AC is stamped on a Table strike record, so no witness number exists to read there. The toll's numbers are proven at the shared reckoning (§0) and in the homeland's witness (§4); the Table reads the identical function at its identical decision point, over identical tables (§0 mirror).");
}

console.log(`\ndrive-ranges-doubled: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
