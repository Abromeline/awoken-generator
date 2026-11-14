// BRICK — THE DRIVE (Nigel, ruled 2026-10-27; amended
// 2026-11-10; restated 2026-11-13: "any awoken that can
// build should be able to cast brick").
// Boots the real server on a scratch DATA_DIR (on tmpfs —
// the workspace volume's writeback stall wedges fixture
// databases, Push 88's lesson) and proves the whole loop:
//   §1 THE GATE: an Awoken under two Rock is refused in
//      plain words; capacity is the Rock sum itself (+1
//      brick per point of Rock: a three-Rock Awoken's stand
//      holds three).
//   §2 THE RAISE: bricks rise one every three seconds at
//      one energy apiece, settled lazily — the purse drops
//      by exactly one per completed brick, and the stand
//      fills to capacity and stops.
//   §3 THE LOOSE: a click on an enemy looses EVERY raised
//      brick in four tiles at the AREA — the clicked dark
//      and its neighbours take the whole harm the referee
//      dealt (each brick 1d6 through the fate reckoning),
//      a dark outside the area is untouched, the stand is
//      spent, and each flight is witnessed wearing the
//      brick mark.
//   §4 THE REACH: bricks aloft but beyond four tiles are
//      refused in plain words and nothing is spent.
//   §5 THE WALL'S PULL: a wall rising within four tiles
//      claims the hovering bricks — the stand empties and
//      the wall's rise advances by the bricks' worth.
//   §6 THE DEFAULT ANSWER: in the living battle, a raised
//      brick is the qualifying Awoken's first answer —
//      the brick flies (witnessed, brick-marked) before
//      any elemental strike, and the stand spends it.
// The wheel itself is the registry's own door — the same
// qualifiedAbilities reckoning that offers Island March —
// and §1 proves its server half: the door the wheel opens
// refuses and accepts by the same table (raiseBricks
// judges abilityQualifies(brick.requires) exactly as the
// wheel reads it).
// Run: node scripts/drive-brick.mjs
import { join } from "node:path";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const OUT = "/home/hatch/workspace/brick-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-brick-"));
process.env.PORT = "3996";
process.env.WORKSHOP_PASSWORD = "<MASKED_SECRET_002>";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const ROOT = process.cwd();
const BASE = "http://127.0.0.1:3996";
const PW = "brick-drive-password";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

await import("../server/dist/index.js");
await sleep(2500);

async function callRaw(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
async function call(action, args, token) {
  const { status, data } = await callRaw(action, args, token);
  if (status >= 300) throw new Error(`${action} -> ${status}: ${JSON.stringify(data)}`);
  return data?.data ?? data;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
const now = Date.now();
{ // image blobs for the seeded parts (the marching drive's way)
  const bytes = readFileSync(join(ROOT, "client/src/assets/tenders/warden-01.png"));
  const objectId = createHash("sha256").update(bytes).digest("hex");
  const dir = join(process.env.DATA_DIR, "blobs", "objects", objectId.slice(0, 2));
  mkdirSync(dir, { recursive: true });
  const path = join(dir, objectId);
  if (!existsSync(path)) writeFileSync(path, bytes);
  const insBlob = db.prepare("INSERT INTO blob_index (key, object_id, content_type, size_bytes, created_at_ms) VALUES (?, ?, 'image/png', ?, ?) ON CONFLICT(key) DO UPDATE SET object_id = excluded.object_id");
  for (const key of ["brick-drive/Stone Body.png", "brick-drive/Stone Arms.png", "brick-drive/Stone Crown.png", "brick-drive/Root Body.png", "brick-drive/Root Arms.png", "brick-drive/Root Crown.png", "brick-drive/walker.png"]) {
    insBlob.run(key, objectId, bytes.length, now);
  }
}

const claim = await call("claimTender", { password: PW, tenderName: "Brick Tender" });
const token = claim.token;
const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id}`;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 0, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800, class_key = 'warden', hp = 100").run(me, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(me, now);
const energy = () => db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(me).energy;

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, spark, hp, sealed_trays, grow_points, height, z, mix_points, curse_hp, curse_max_hp, created_at) VALUES (?, ?, ?, ?, ?, 0, 10, ?, 0, ?, ?, ?, ?, ?, ?)");
const tileId = new Map();
for (let q = -7; q <= 7; q++) for (let r = -7; r <= 7; r++) {
  if (hexDist({ q, r }, { q: 0, r: 0 }) > 7) continue;
  tileId.set(`${q},${r}`, Number(insTile.run(me, q, r, "neutral", 0, 0, 1, 0, null, null, null, now).lastInsertRowid));
}
db.prepare("UPDATE tender_progress SET tender_tile_id = ? WHERE owner_key = ?").run(tileId.get("0,0"), me);

const insA = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
function part(name, category, element) {
  const id = Number(insA.run(name, category, 3, 3, element, `brick-drive/${name}.png`, now).lastInsertRowid);
  return { source_id: `db:${id}`, name, category, rarity: "common", power: 3, toughness: 3, element };
}
function mkAwoken(name, exp, parts) {
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at, experience) VALUES (?, ?, 'brick-drive/walker.png', ?, 'tender', 'Brick Tender', ?, ?, ?)")
    .run(name, name, JSON.stringify(parts), me, now, exp).lastInsertRowid);
}
const fieldOn = (awId, q, r) => db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
  VALUES (?, ?, ?, ?, ?, 'defense', 0, 99, ?, ?, NULL, NULL, 0)`).run(me, awId, tileId.get(`${q},${r}`), now, now, q, r);
const seedDark = (q, r, hp = 40) => Number(db.prepare(
  `INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
   VALUES (?, ?, 'fray', ?, ?, ?, ?, 3, 1, 0)`)
  .run(me, tileId.get(`${q},${r}`), Date.now(), hp, q, r).lastInsertRowid);
const darkHp = (id) => db.prepare("SELECT hp FROM homeland_wanderers WHERE id = ?").get(id)?.hp;
const brickRow = (awId) => db.prepare("SELECT hovering, next_at AS nextAt FROM raised_bricks WHERE owner_key = ? AND awakened_id = ?").get(me, awId);

// The cast of Awoken: Q1 holds two Rock (stone body, stone
// arms, root crown) — capacity two. Q3 holds three Rock —
// capacity three. NQ holds none — refused at the door.
const Q1 = mkAwoken("Two Rock", 10000, [part("Stone Body", "body", "stone"), part("Stone Arms", "arms", "stone"), part("Root Crown", "head", "root")]);
const Q3 = mkAwoken("Three Rock", 10000, [part("Stone Body", "body", "stone"), part("Stone Arms", "arms", "stone"), part("Stone Crown", "head", "stone")]);
const NQ = mkAwoken("No Rock", 10000, [part("Root Body", "body", "root"), part("Root Arms", "arms", "root"), part("Root Crown", "head", "root")]);
fieldOn(Q1, 0, 2);
fieldOn(Q3, 3, -3);
fieldOn(NQ, -3, -2);

/* ══ §1 THE GATE ═══════════════════════════════════════ */
console.log("§1 the gate — Rock judges who may raise");
const refused = await callRaw("raiseBricks", { awakenedId: NQ }, token);
ok("an Awoken with no Rock is refused in plain words naming the gate",
  refused.status === 400 && /two or more Rock/.test(JSON.stringify(refused.data)), `${refused.status} ${JSON.stringify(refused.data)}`);
const q3 = await call("raiseBricks", { awakenedId: Q3 }, token);
ok("capacity is the Rock sum itself — three Rock holds three bricks (+1 per Rock)",
  q3?.brick?.capacity === 3 && q3?.brick?.raising === true, JSON.stringify(q3?.brick));
// Q3's part in the drive ends here: clear its stand so its
// rising brick never settles into the purse reckonings below.
db.prepare("DELETE FROM raised_bricks WHERE owner_key = ? AND awakened_id = ?").run(me, Q3);
db.prepare("DELETE FROM field_placements WHERE awakened_id = ?").run(Q3);
db.prepare("UPDATE tender_resources SET energy = 5000 WHERE owner_key = ?").run(me);

/* ══ §2 THE RAISE ══════════════════════════════════════ */
console.log("§2 the raise — three seconds and one energy apiece, to capacity");
const raise1 = await call("raiseBricks", { awakenedId: Q1 }, token);
ok("the raise begins: nothing hovering yet, one rising, capacity two",
  raise1?.brick?.hovering === 0 && raise1?.brick?.raising === true && raise1?.brick?.capacity === 2, JSON.stringify(raise1?.brick));
ok("no energy is drawn before a brick completes", energy() === 5000, `energy=${energy()}`);
// The brick's three seconds run out (the fixture turns the
// stand's own clock, as every drive turns its clocks).
db.prepare("UPDATE raised_bricks SET next_at = ? WHERE owner_key = ? AND awakened_id = ?").run(Date.now() - 1000, me, Q1);
const raise2 = await call("raiseBricks", { awakenedId: Q1 }, token);
ok("the first brick completes and the next begins rising",
  raise2?.brick?.hovering === 1 && raise2?.brick?.raising === true, JSON.stringify(raise2?.brick));
ok("exactly one energy was drawn for the completed brick", energy() === 4999, `energy=${energy()}`);
db.prepare("UPDATE raised_bricks SET next_at = ? WHERE owner_key = ? AND awakened_id = ?").run(Date.now() - 1000, me, Q1);
const land = await call("getTerritory", {}, token);
const stand = (land.bricks ?? []).find((s) => s.awakenedId === Q1);
ok("the land serves the filled stand: two hovering, capacity two, nothing rising",
  !!stand && stand.hovering === 2 && stand.capacity === 2 && stand.raising === false, JSON.stringify(land.bricks));
ok("the second brick drew its one energy too — the purse stands at 4998", energy() === 4998, `energy=${energy()}`);

/* ══ §3 THE LOOSE ══════════════════════════════════════ */
console.log("§3 the loose — every raised brick flies at the area");
const dA = seedDark(1, 2);   // the clicked dark — one tile from Q1
const dB = seedDark(2, 2);   // its neighbour — inside the area
const dC = seedDark(-4, 2);  // far outside the area
const t0 = Date.now();
const loose = await call("looseBricks", { wandererId: dA }, token);
const t1 = Date.now();
ok("the loose answers as a loose, naming its one thrower",
  loose?.loosed === true && Array.isArray(loose.throws) && loose.throws.length === 1 && loose.throws[0].awakenedId === Q1,
  JSON.stringify(loose));
ok("ALL of the thrower's bricks flew — both of them",
  loose?.throws?.[0]?.bricks === 2, JSON.stringify(loose?.throws));
ok("the stand is spent — no bricks hover over Q1", brickRow(Q1)?.hovering === 0, JSON.stringify(brickRow(Q1)));
ok("the area took exactly the harm the referee dealt (each brick judged, 1d6 through the reckoning)",
  (40 - (darkHp(dA) ?? 0)) + (40 - (darkHp(dB) ?? 0)) === loose.harm,
  `harm=${loose.harm} dA=${darkHp(dA)} dB=${darkHp(dB)}`);
ok("a dark outside the area is untouched by the loose", darkHp(dC) === 40, `dC=${darkHp(dC)}`);
const land2 = await call("getTerritory", {}, token);
const brickStrikes = (land2.strikes ?? []).filter((s) => s.brick === true && s.awakenedId === Q1 && s.at >= t0 - 500 && s.at <= t1 + 500);
ok("each flight was witnessed wearing the brick mark, on stone's road",
  brickStrikes.length === 2 && brickStrikes.every((s) => s.element === "stone"), JSON.stringify(brickStrikes.map((s) => ({ brick: s.brick, element: s.element }))));

/* ══ §4 THE REACH ══════════════════════════════════════ */
console.log("§4 the reach — four tiles, no further");
db.prepare("UPDATE raised_bricks SET hovering = 2, next_at = NULL WHERE owner_key = ? AND awakened_id = ?").run(me, Q1);
const dF = seedDark(0, -3); // five tiles from Q1 at (0,2)
const far = await callRaw("looseBricks", { wandererId: dF }, token);
ok("a loose beyond four tiles is refused in plain words naming the reach",
  far.status === 400 && /four tiles/.test(JSON.stringify(far.data)), `${far.status} ${JSON.stringify(far.data)}`);
ok("the refusal spent nothing — both bricks still hover", brickRow(Q1)?.hovering === 2, JSON.stringify(brickRow(Q1)));

/* ══ §5 THE WALL'S PULL ════════════════════════════════ */
console.log("§5 the wall's pull — loose bricks are drawn into a wall being built");
// The field is cleared of darks first: with no mark to
// answer, the battle cannot spend the bricks before the
// wall claims them — the pull is judged alone.
db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(me);
// A wall stands on a floor's edge (restsOn's law): a
// standing square founds it, and the wall — an edge piece,
// two points — rises on the square's first edge. A bare
// square footprint wearing the name "wall" rests on
// nothing and settles at the first read (the drive's own
// first §5 learned this; the fixture now wears the true
// shapes, as drive-lighting-face seeds its walls).
db.prepare(`INSERT INTO build_pieces (owner_key, kind, piece_key, verts, footprint, created_at, hp, state, frac, lead_id, rise_updated_at, energy_bank)
  VALUES (?, 'square', 'square#brick-drive', ?, ?, ?, 100, 'standing', 1, ?, ?, 0)`)
  .run(me, JSON.stringify([[0.6, 0.6], [1.4, 0.6], [1.4, 1.4], [0.6, 1.4]]), JSON.stringify([[0.6, 0.6], [1.4, 0.6], [1.4, 1.4], [0.6, 1.4]]), Date.now(), Q1, Date.now());
const wallId = Number(db.prepare(`INSERT INTO build_pieces (owner_key, kind, piece_key, verts, footprint, created_at, hp, state, frac, lead_id, rise_updated_at, energy_bank)
  VALUES (?, 'wall', 'wall#brick-drive', ?, ?, ?, 100, 'rising', 0, ?, ?, 0)`)
  .run(me, JSON.stringify([[0.6, 0.6], [1.4, 0.6]]), JSON.stringify([[0.6, 0.6], [1.4, 0.6]]), Date.now(), Q1, Date.now()).lastInsertRowid);
await call("getTerritory", {}, token);
const wallFrac = db.prepare("SELECT frac FROM build_pieces WHERE id = ?").get(wallId)?.frac;
ok("the rising wall claimed both hovering bricks — the stand is empty",
  brickRow(Q1)?.hovering === 0, JSON.stringify(brickRow(Q1)));
ok("the wall's rise advanced by the bricks' worth (each brick the rise-work of its one energy: 2 × 2/36 ≈ 0.111)",
  typeof wallFrac === "number" && wallFrac >= 0.09 && wallFrac < 0.25, `frac=${wallFrac}`);
// The wall stands finished now, so §6's brick is not claimed.
db.prepare("UPDATE build_pieces SET frac = 1, state = 'standing' WHERE id = ?").run(wallId);

/* ══ §6 THE DEFAULT ANSWER ═════════════════════════════ */
console.log("§6 the default answer — a raised brick answers first in battle");
db.prepare("UPDATE raised_bricks SET hovering = 1, next_at = NULL WHERE owner_key = ? AND awakened_id = ?").run(me, Q1);
db.prepare("UPDATE field_placements SET battle_next_at = 0 WHERE awakened_id = ?").run(Q1);
// The battle settles by beats from the land's watermark
// (drive-battle's own fixture law): five seconds of beats
// stand ready, and the witness is judged only inside this
// read's window — §3's loose strikes still ride the served
// list and must not be mistaken for the battle's answer.
db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now() - 5000, me);
const dD = seedDark(0, 3); // one tile from Q1
const bt0 = Date.now();
const land3 = await call("getTerritory", {}, token);
const bt1 = Date.now();
const answer = (land3.strikes ?? []).filter((s) => s.brick === true && s.awakenedId === Q1 && s.at >= bt0 - 500 && s.at <= bt1 + 500);
ok("the battle's witness shows the brick flying from Q1 — the default answer, before any elemental strike",
  answer.length >= 1, JSON.stringify((land3.strikes ?? []).map((s) => ({ aw: s.awakenedId, brick: s.brick, element: s.element, at: s.at }))));
ok("the thrown brick was spent from the stand", brickRow(Q1)?.hovering === 0, JSON.stringify(brickRow(Q1)));
void dD;

console.log(`\nBRICK DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
