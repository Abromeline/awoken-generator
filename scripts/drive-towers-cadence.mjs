// drive-towers-cadence — THE TOWERS TAKE THE FIELD + THE
// CADENCE RE-BASE (Nigel, 2026-10-24: "towers fire once
// every 8 seconds. awoken base rate is once every 4
// seconds. speed bonus reduces this by .5% per lvl" —
// clarified the same hour: "make base 3 seconds — for
// awoken").
// Proven here against the real API on a scratch server:
//   §S the seams, read from the source as written: the
//      cadence table stands doubled (Sky 2000 · Tide 2500 ·
//      Root 3000 · Stone 3500), the trim stands in the
//      interval, the tower's beat and its +2 stand in the
//      settlement.
//   §A THE VOLLEY: an active watchtower looses its 3 damage
//      at a dark in its guard on the 8-second beat of
//      settled battle time — not a moment early — and
//      keeps the beat; a dormant tower fires nothing; a
//      volley fell banks exactly the Fray's protection
//      minute, as any unattributed engine fell pays.
//   §B THE +2 POWER: two identical Sky strikers, one
//      standing on the tower's tile, one far away — the
//      towered striker's witnessed blows land measurably
//      harder (the +2 standing in her raw harm), the far
//      one's do not move.
//   §C THE RE-BASED CADENCE + THE TRIM: strike intervals
//      read off the strike witness's own timestamps — a
//      level-1 Root strikes ~1500 ms apart, a level-1
//      Stone ~1750, and a level-11 Root's interval carries
//      the 5% trim (~1425), never the untrimmed 1500.
//      (RESTATED 2026-10-27: Nigel's battle-feel ruling of
//      2026-10-25 — Awoken fire twice as often — halved the
//      table this drive was written against; every cadence
//      figure below stands at the halved measure.)
// The ambient cradle is stilled by hand on every poll (its
// anchor wound to now), as in the other battle drives: its
// weather is not this proof's.
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-towers-"));
process.env.DATA_DIR = DATA_DIR;
process.env.PORT = "39972";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
process.chdir(root);

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

await import("../server/dist/index.js");
await sleep(2500);

const db = new Database(join(DATA_DIR, "app.db"));
const now0 = Date.now();

async function api(action, args, token) {
  const res = await fetch(`http://127.0.0.1:39972/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
const errText = (r) => String(r.data?.error ?? r.data?.message ?? "");

/* ── Fixtures (the battle drives' own vocabulary) ─────── */
function seedTile(ownerKey, q, r, cursed, element = "root") {
  return Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(ownerKey, q, r, element, cursed, Date.now()).lastInsertRowid);
}
function seedAwokin(ownerKey, tenderName, name, element, power = 3, toughness = 9, exp = 0) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)").run(`${name} ${cat}`, cat, power, toughness, element, `towers/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power, toughness, element });
  }
  const id = Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)").run(name, name, `towers/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
  if (exp) db.prepare("UPDATE awakened SET experience = ? WHERE id = ?").run(exp, id);
  return id;
}
function placeAwokin(ownerKey, awakenedId, tileId, q, r, opts = {}) {
  const info = db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`).run(
    ownerKey, awakenedId, tileId, Date.now(), Date.now(),
    opts.stance ?? "defense", opts.hp ?? 9999, q, r,
    opts.shield ?? null, opts.shield ?? null, opts.ordered ? 1 : 0);
  return Number(info.lastInsertRowid);
}
function seedDark(ownerKey, tileId, kind, q, r, opts = {}) {
  const info = db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at, pinned_beats)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`).run(
    ownerKey, tileId, kind, Date.now(), opts.hp ?? 3, q, r, opts.power ?? 1, opts.lvl ?? 1, opts.pinned ?? 0);
  return Number(info.lastInsertRowid);
}
function seedTower(ownerKey, tileId, status = "active") {
  return Number(db.prepare("INSERT INTO territory_buildings (owner_key, tile_id, building_type, status, placed_at, last_upkeep_at) VALUES (?, ?, 'watchtower', ?, ?, ?)").run(ownerKey, tileId, status, Date.now(), Date.now()).lastInsertRowid);
}
async function claimTender(name) {
  const claim = await api("claimTender", { password: "drive-password-1", tenderName: name });
  if (claim.status !== 200 || !claim.data.token) throw new Error(`claim ${name}: ${JSON.stringify(claim.data).slice(0, 160)}`);
  const tenderId = db.prepare("SELECT id FROM tenders WHERE tender_name = ?").get(name).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = excluded.energy").run(ownerKey, Date.now());
  // The Tender stands FAR from every fixture (his own tile,
  // set by hand before the first read): his weapon referee
  // and his body's hungers never touch the proof's ground.
  const standTile = seedTile(ownerKey, 30, 0, 0);
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at, tender_tile_id) VALUES (?, 0, 0, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET tender_tile_id = excluded.tender_tile_id").run(ownerKey, Date.now(), standTile);
  // The choosing opens only after three wakes, and the
  // whole homeland settlement rides on the Tender's stand,
  // which a classless Tender does not have — so three
  // companions are woken and the class is chosen here, as
  // every battle drive does (they muster at his far stand
  // and never touch the proof's ground).
  seedAwokin(ownerKey, name, "First Companion", "sky");
  seedAwokin(ownerKey, name, "Second Companion", "sky");
  seedAwokin(ownerKey, name, "Third Companion", "sky");
  const cc = await api("chooseClass", { classKey: "warden" }, claim.data.token);
  if (cc.status !== 200) throw new Error(`chooseClass ${name}: ${errText(cc)}`);
  return { token: claim.data.token, ownerKey };
}
const stillCradle = (ownerKey) => db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ? WHERE owner_key = ?").run(Date.now(), ownerKey);
const darkRow = (id) => db.prepare("SELECT * FROM homeland_wanderers WHERE id = ?").get(id);
const progOf = (ownerKey) => db.prepare("SELECT * FROM tender_progress WHERE owner_key = ?").get(ownerKey);
async function prime(ownerKey, token) { stillCradle(ownerKey); await api("getTerritory", {}, token); }
async function advance(ownerKey, token, ms) {
  stillCradle(ownerKey);
  db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now() - ms, ownerKey);
  return api("getTerritory", {}, token);
}

/* ── §S THE SEAMS, READ FROM THE SOURCE ───────────────── */
console.log("§S the seams — the doubled table, the trim, the tower's beat and bonus, read from the source");
{
  const actions = readFileSync(join(root, "server/src/actions.ts"), "utf8");
  check("the cadence table stands at the twice-doubled measure of Nigel's 2026-10-25 ruling (Sky 1000 · Tide 1250 · Root 1500 · Stone 1750 · Fire 1500 · Neutral 1500)",
    actions.includes("sky: 1000, tide: 1250, root: 1500, stone: 1750, fire: 1500, neutral: 1500"));
  check("the superseded table stands nowhere in the settlement's keeping",
    !actions.includes("sky: 2000, tide: 2500, root: 3000, stone: 3500"));
  check("the SPEED BONUS trim stands in the answer pass's interval (0.5% a level above 1, the crowding tax on the trimmed measure)",
    actions.includes("(AWOKEN_STRIKE_MS[f.dominant] ?? 3000) * (1 - 0.005 * Math.max(0, f.level - 1))") &&
    actions.includes("const interval = baseMs * crowdTax(crowdOf(f.tileId));"));
  check("the tower's beat is the ruled 8 seconds, a named constant",
    actions.includes("export const TOWER_VOLLEY_MS = 8000"));
  const battleAt = actions.indexOf("async function settleHomelandBattle");
  const towerLoadAt = actions.indexOf("building_type = 'watchtower' AND status = 'active'", battleAt);
  const volleyAt = actions.indexOf("THE WATCHTOWERS VOLLEY", battleAt);
  const bonusAt = actions.indexOf("if (f.towerGuard) raw += towerPowerBonus;", battleAt);
  check("the settlement loads ACTIVE watchtowers, looses their volley in the step loop, and stands the +2 in a guarded striker's raw harm",
    battleAt > 0 && towerLoadAt > battleAt && volleyAt > towerLoadAt && bonusAt > battleAt);
}

/* ── §A THE VOLLEY ────────────────────────────────────── */
console.log("§A the volley — 3 damage on the 8-second beat, never early; dormant towers silent; a volley fell pays the land's bounty");
{
  const V = await claimTender("Volley Keeper");
  const tHeart = seedTile(V.ownerKey, 0, 0, 0);
  const tDark = seedTile(V.ownerKey, 1, 0, 1, "fire");
  const tFar = seedTile(V.ownerKey, 20, 20, 1, "fire");
  const tower = seedTower(V.ownerKey, tHeart);
  const dark = seedDark(V.ownerKey, tDark, "fray", 1, 0, { hp: 300, pinned: 100000 });
  await prime(V.ownerKey, V.token);
  check("the fixture stands: tower active, the dark whole at 300 in its guard", darkRow(dark)?.hp === 300, JSON.stringify(darkRow(dark)));
  await advance(V.ownerKey, V.token, 7000);
  check("seven seconds of battle: NO volley yet — the beat is 8, and it does not fire early",
    darkRow(dark)?.hp === 300, `hp=${darkRow(dark)?.hp}`);
  await advance(V.ownerKey, V.token, 2000);
  check("at nine seconds the first volley has landed: exactly 3 damage",
    darkRow(dark)?.hp === 297, `hp=${darkRow(dark)?.hp}`);
  await advance(V.ownerKey, V.token, 16000);
  check("sixteen more seconds: two more volleys on the beat (291)",
    darkRow(dark)?.hp === 291, `hp=${darkRow(dark)?.hp}`);
  db.prepare("UPDATE territory_buildings SET status = 'dormant' WHERE id = ?").run(tower);
  await advance(V.ownerKey, V.token, 16000);
  check("a DORMANT tower fires nothing across two beats (still 291)",
    darkRow(dark)?.hp === 291, `hp=${darkRow(dark)?.hp}`);
  db.prepare("UPDATE territory_buildings SET status = 'active' WHERE id = ?").run(tower);
  // The first dark steps out of the guard; a frail one stands
  // ON the tower's tile — the volley's fell pays the bounty.
  db.prepare("UPDATE homeland_wanderers SET pos_q = 20, pos_r = 20, tile_id = ? WHERE id = ?").run(tFar, dark);
  const dark2 = seedDark(V.ownerKey, tHeart, "fray", 0, 0, { hp: 3, pinned: 100000 });
  const bank0 = Number(progOf(V.ownerKey).protection_bank_ms ?? 0);
  await advance(V.ownerKey, V.token, 9000);
  check("the volley fells the frail dark standing on the tower's tile", !darkRow(dark2));
  const bank1 = Number(progOf(V.ownerKey).protection_bank_ms ?? 0);
  check("its fell banks exactly the Fray's bounty — one protection minute, as any unattributed engine fell pays",
    bank1 - bank0 === 60000, `${bank0} -> ${bank1}`);
}

/* ── §B THE +2 POWER ──────────────────────────────────── */
console.log("§B the tower's +2 — identical Sky strikers, one in the guard, one far away; the witnessed harm tells them apart");
{
  const B = await claimTender("Aura Keeper");
  const tHeart = seedTile(B.ownerKey, 0, 0, 0);
  const tDarkA = seedTile(B.ownerKey, 1, 0, 1, "fire");
  const tB = seedTile(B.ownerKey, 10, 0, 0);
  const tDarkB = seedTile(B.ownerKey, 11, 0, 1, "fire");
  seedTower(B.ownerKey, tHeart);
  const awA = seedAwokin(B.ownerKey, "Aura Keeper", "Towered Fang", "sky", 3, 9, 100);
  const awB = seedAwokin(B.ownerKey, "Aura Keeper", "Distant Fang", "sky", 3, 9, 100);
  placeAwokin(B.ownerKey, awA, tHeart, 0, 0);   // ON the tower's tile
  placeAwokin(B.ownerKey, awB, tB, 10, 0);       // ten hexes from any tower
  seedDark(B.ownerKey, tDarkA, "fray", 1, 0, { hp: 100000, pinned: 100000 });
  seedDark(B.ownerKey, tDarkB, "fray", 11, 0, { hp: 100000, pinned: 100000 });
  await prime(B.ownerKey, B.token);
  // Each read is a full 60-second window; the strikers'
  // persisted strike clocks are rewound to 0 before it
  // (the fixture's lever, as the watermark is) so each
  // window is fought whole instead of only its tail past
  // the last clock's edge.
  const seen = new Map();
  for (let i = 0; i < 3; i++) {
    db.prepare("UPDATE field_placements SET battle_next_at = 0 WHERE owner_key = ?").run(B.ownerKey);
    const r = await advance(B.ownerKey, B.token, 60000);
    for (const s of (r.data.strikes ?? [])) if (!seen.has(s.id)) seen.set(s.id, s);
  }
  const hitsOf = (awId) => [...seen.values()].filter(s => s.awakenedId === awId && s.hit);
  const hitsA = hitsOf(awA), hitsB = hitsOf(awB);
  const mean = (xs) => xs.reduce((a, s) => a + s.dmg, 0) / Math.max(1, xs.length);
  const meanA = mean(hitsA), meanB = mean(hitsB);
  console.log(`  witnessed hits: towered ${hitsA.length} (mean ${meanA.toFixed(2)}), distant ${hitsB.length} (mean ${meanB.toFixed(2)})`);
  check("both strikers fought and were witnessed (45+ blows each)", hitsA.length >= 45 && hitsB.length >= 45,
    `A=${hitsA.length} B=${hitsB.length}`);
  check("the towered striker's blows land harder by the tower's +2 through the AC-ratio (mean gap ≈ 1.6, read in [0.9, 2.4])",
    meanA - meanB >= 0.9 && meanA - meanB <= 2.4, `gap=${(meanA - meanB).toFixed(2)}`);
}

/* ── §C THE CADENCE AND THE TRIM ──────────────────────── */
console.log("§C the re-based cadence — strike intervals off the witness's own timestamps");
async function strikeDiffs(name, element, exp) {
  const T = await claimTender(name);
  const tPure = seedTile(T.ownerKey, 0, 0, 0);
  const tCursed = seedTile(T.ownerKey, 1, 0, 1, "fire");
  const aw = seedAwokin(T.ownerKey, name, `${name} Striker`, element, 3, 9, exp);
  placeAwokin(T.ownerKey, aw, tPure, 0, 0);
  seedDark(T.ownerKey, tCursed, "fray", 1, 0, { hp: 100000, pinned: 100000 });
  await prime(T.ownerKey, T.token);
  // ONE full watermark window is the measure: a second
  // wound-back window replays the same simulated hour and
  // its timestamps would fold into the first's.
  const seen = new Map();
  {
    const r = await advance(T.ownerKey, T.token, 60000);
    for (const s of (r.data.strikes ?? [])) if (s.awakenedId === aw && !seen.has(s.id)) seen.set(s.id, s);
  }
  const ats = [...seen.values()].map(s => s.at).sort((a, b) => a - b);
  const diffs = ats.slice(1).map((a, i) => a - ats[i]);
  return { count: ats.length, diffs, mean: diffs.reduce((a, b) => a + b, 0) / Math.max(1, diffs.length) };
}
{
  const root1 = await strikeDiffs("Root Novice", "root", 100);
  console.log(`  root L1: ${root1.count} strikes, mean interval ${root1.mean.toFixed(0)} ms`);
  check("a level-1 Root strikes on the halved 1.5-second base (mean in [1400, 1600], every gap in [1250, 1750])",
    root1.count >= 15 && root1.mean >= 1400 && root1.mean <= 1600 && root1.diffs.every(d => d >= 1250 && d <= 1750),
    `count=${root1.count} mean=${root1.mean.toFixed(0)} diffs=${root1.diffs.slice(0, 8).join(",")}`);
  const stone1 = await strikeDiffs("Stone Novice", "stone", 100);
  console.log(`  stone L1: ${stone1.count} strikes, mean interval ${stone1.mean.toFixed(0)} ms`);
  check("a level-1 Stone strikes on its 1.75-second seat of the spread (mean in [1650, 1850])",
    stone1.count >= 14 && stone1.mean >= 1650 && stone1.mean <= 1850,
    `count=${stone1.count} mean=${stone1.mean.toFixed(0)}`);
  const root11 = await strikeDiffs("Root Adept", "root", 12100);
  console.log(`  root L11: ${root11.count} strikes, mean interval ${root11.mean.toFixed(0)} ms`);
  check("a level-11 Root carries the 5% SPEED BONUS trim: mean in [1350, 1485] — measurably under the untrimmed 1500",
    root11.count >= 15 && root11.mean >= 1350 && root11.mean <= 1485 && root11.mean < root1.mean - 40,
    `count=${root11.count} mean=${root11.mean.toFixed(0)} vs L1 ${root1.mean.toFixed(0)}`);
}

console.log(`\ndrive-towers-cadence: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
