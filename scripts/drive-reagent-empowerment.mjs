// REAGENT EMPOWERMENT (Nigel, 2026-10-25 10:22; wired
// 2026-10-25 on his live report "reagents are not being
// counted towards spells or consumed") — the proof, driven
// through the REAL cast door (castMapWorking) against the
// REAL server and its scratch ledger:
//   §A THE SPELL DOOR (Shard Rain, a Warden): no set →
//      exactly today's cast (full price, the standing mod);
//      the FULL set → half price (rounded up), the set gone
//      from the pouch, the reckoning's mod +2; a PARTIAL set
//      → full price, nothing consumed, no bonus; and a
//      FIZZLE on an empowered cast still consumes the set
//      and still charges the halved price — the set powered
//      the attempt.
//   §B THE BLANK PAGES: with a pouch full of EVERYTHING,
//      Black Gate (a blank page) casts at full price with
//      its standing mod and consumes nothing; the Winged
//      Coil — named blank in the record, though a "Coil"
//      line stands in it unspent — likewise never empowers.
//   §C THE WITCH'S COMPOSITION (a Witch with a party member
//      standing): her company price computes first (5 → 3);
//      the empowerment halves THAT (3 → 2); her fizzle's
//      mercy refunds against the CHARGED 2, never the
//      book's 5.
//   §D THE SCOPE SWEEP: every other working with a line of
//      record — Seal, Twin Trees, Bulwark (the ward door),
//      Springleaf (the binding door), Bats, Hold Rune, Rune
//      Shatter (the new-workings door), Single Blade, Crown
//      Shard, Lattice (the rune/spell door) — casts
//      unempowered at its book price, then empowered at
//      ceil(price/2) with its own set consumed by exactly
//      its line's quantities, an unrelated stack untouched,
//      and its mod +2.
// Run: node scripts/drive-reagent-empowerment.mjs
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-reagent-empowerment-"));
process.env.PORT = "3989";
process.env.WORKSHOP_PASSWORD = "reagent-empowerment-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname); // the server resolves client/dist from CWD
const BASE = "http://127.0.0.1:3989";
const PW = "reagent-empowerment-drive-password";
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
  return data?.data ?? data;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up */ }

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

/* ── the fixture (drive-bulwark's pattern) ──────────── */
function seedAwokin(ownerKey, tenderName, name, element = "root") {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 3, 3, ?, ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, element, `reagent-empowerment/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: 3, toughness: 3, element });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `reagent-empowerment/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
async function claim(name, classKey) {
  const c = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(c.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  const now = Date.now();
  // exp 150 = Tender Lv 3 (drive-bulwark's measure): wards
  // and runes awake, and the casting mods stand low enough
  // for honest fizzle hunting.
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 150, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, now);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(ownerKey, now);
  const wakeIds = [1, 2, 3].map((i) => seedAwokin(ownerKey, name, `${name} Wake ${["One", "Two", "Three"][i - 1]}`));
  await call("chooseClass", { classKey }, c.token);
  return { token: c.token, ownerKey, tenderId, name, wakeIds };
}
function seedTiles(ownerKey, radius = 4) {
  const ids = new Map();
  const ins = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', 0, ?)");
  const now = Date.now();
  for (let q = -radius; q <= radius; q++) for (let r = -radius; r <= radius; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > radius) continue;
    ids.set(`${q},${r}`, Number(ins.run(ownerKey, q, r, now).lastInsertRowid));
  }
  return ids;
}
function makeTileTaker(tiles) {
  const pool = [...tiles.entries()]
    .filter(([k]) => k !== "0,0")
    .sort((a, b) => hexDist({ q: +a[0].split(",")[0], r: +a[0].split(",")[1] }, { q: 0, r: 0 }) - hexDist({ q: +b[0].split(",")[0], r: +b[0].split(",")[1] }, { q: 0, r: 0 }));
  return () => {
    const next = pool.shift();
    if (!next) throw new Error("out of tiles");
    const [q, r] = next[0].split(",").map(Number);
    return { tileId: next[1], q, r };
  };
}
function seedDark(ownerKey, tileId, q, r) {
  return Number(db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
    VALUES (?, ?, 'fray', ?, 3, ?, ?, 1, 1, 0)`).run(ownerKey, tileId, Date.now(), q, r).lastInsertRowid);
}
const energyOf = (ownerKey) => db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(ownerKey)?.energy;
const invOf = (ownerKey, itemKey) => db.prepare("SELECT qty FROM tender_inventory WHERE owner_key = ? AND item_key = ?").get(ownerKey, itemKey)?.qty ?? 0;
const setInv = (ownerKey, itemKey, qty) => db.prepare(
  "INSERT INTO tender_inventory (owner_key, item_key, qty, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(owner_key, item_key) DO UPDATE SET qty = excluded.qty, updated_at = excluded.updated_at",
).run(ownerKey, itemKey, qty, Date.now());
/** Set the pouch to exactly the given { itemKey: qty } —
 *  every other reagent stack to zero. */
const ALL_REAGENT_KEYS = ["dream-shroom", "ember-ash", "fray-ash", "hollow-silk", "moon-petal", "root-sap", "rune-shard", "shadow-matter", "sky-salt", "star-seed", "stone-dust", "tidewater"];
const itemKeyOf = (reagent) => (reagent === "rune-shard" ? "rune-shard" : `reagent:${reagent}`);
function setPouch(ownerKey, lines) {
  for (const rk of ALL_REAGENT_KEYS) setInv(ownerKey, itemKeyOf(rk), 0);
  for (const [rk, qty] of Object.entries(lines)) setInv(ownerKey, itemKeyOf(rk), qty);
}

/* ── the sets, transcribed from the list of record ──── */
const SETS = {
  shardrain: { "sky-salt": 2, "rune-shard": 1, "star-seed": 1 },
  shard: { "star-seed": 2, "rune-shard": 2 },
  bats: { "shadow-matter": 1, "hollow-silk": 1 },
  holdrune: { "rune-shard": 2, "stone-dust": 1 },
  shatter: { "rune-shard": 1, "ember-ash": 2 },
  blade: { "rune-shard": 1, "fray-ash": 1 },
  seal: { tidewater: 2, "moon-petal": 1 },
  trees: { "root-sap": 2, "moon-petal": 1 },
  lattice: { "stone-dust": 2, "rune-shard": 1 },
  springleaf: { "root-sap": 1, "dream-shroom": 2 },
  bulwark: { "stone-dust": 2, "ember-ash": 1 },
};

const grim = await call("getGrimoire", {});
const pageOf = (key) => (grim.spells ?? []).find((s) => s.key === key);
const halfUp = (n) => Math.ceil(n / 2);

/* ══ §A THE SPELL DOOR — SHARD RAIN ═══════════════════ */
console.log("§A the spell door — Shard Rain, unempowered / full set / partial set / the fizzle");
const A = await claim("Empowerment Warden", "warden");
const aTiles = seedTiles(A.ownerKey);
await call("getTerritory", {}, A.token);
await call("setTenderTile", { tileId: aTiles.get("0,0") }, A.token);
const aTake = makeTileTaker(aTiles);
const rainCost = pageOf("shardrain").cost;
// Rune Shatter's reach is 2 rings (§D): reserve the two
// nearest tiles for its pair of casts before the hunt
// spends the near ground.
const shatterTiles = [aTake(), aTake()];

let rainBaseMod;
{
  setPouch(A.ownerKey, {});
  const t = aTake();
  const res = await call("castMapWorking", { spellKey: "shardrain", tileId: t.tileId }, A.token);
  rainBaseMod = res.mod;
  ok("no set: the cast charges the book's full price", res.cost === rainCost, JSON.stringify(res));
  ok("no set: nothing about the pouch moved (it stood empty and stands empty)",
    ALL_REAGENT_KEYS.every((rk) => invOf(A.ownerKey, itemKeyOf(rk)) === 0));
}
{
  // The full set, with a surplus of Sky Salt and an
  // unrelated stack standing by: only the line's own
  // quantities may be consumed.
  setPouch(A.ownerKey, { "sky-salt": 3, "rune-shard": 1, "star-seed": 1, "ember-ash": 4 });
  const e0 = energyOf(A.ownerKey);
  const t = aTake();
  const res = await call("castMapWorking", { spellKey: "shardrain", tileId: t.tileId }, A.token);
  const e1 = energyOf(A.ownerKey);
  ok("full set: the price halves, rounded up", res.cost === halfUp(rainCost), JSON.stringify(res));
  ok("full set: the casting reckoning carries +2", res.mod === rainBaseMod + 2, `mod=${res.mod} base=${rainBaseMod}`);
  ok("full set: exactly the line is consumed — the Sky Salt surplus stands, the unrelated stack untouched",
    invOf(A.ownerKey, "reagent:sky-salt") === 1 && invOf(A.ownerKey, "rune-shard") === 0
    && invOf(A.ownerKey, "reagent:star-seed") === 0 && invOf(A.ownerKey, "reagent:ember-ash") === 4,
    `sky=${invOf(A.ownerKey, "reagent:sky-salt")} shard=${invOf(A.ownerKey, "rune-shard")} seed=${invOf(A.ownerKey, "reagent:star-seed")} ember=${invOf(A.ownerKey, "reagent:ember-ash")}`);
  ok("full set: the purse fell by the charged price alone (a Warden's fizzle refunds nothing)",
    e0 - e1 === res.cost - (res.refunded ?? 0), `delta=${e0 - e1} cost=${res.cost} refunded=${res.refunded ?? 0}`);
}
{
  // A partial set — one Sky Salt short of the line.
  setPouch(A.ownerKey, { "sky-salt": 1, "rune-shard": 5, "star-seed": 5 });
  const t = aTake();
  const res = await call("castMapWorking", { spellKey: "shardrain", tileId: t.tileId }, A.token);
  ok("partial set: the cast is unempowered — full price, standing mod",
    res.cost === rainCost && res.mod === rainBaseMod, JSON.stringify(res));
  ok("partial set: nothing is consumed",
    invOf(A.ownerKey, "reagent:sky-salt") === 1 && invOf(A.ownerKey, "rune-shard") === 5 && invOf(A.ownerKey, "reagent:star-seed") === 5);
}
{
  // The fizzle hunt: restock the exact set before every
  // cast until one unravels. Every cast — standing or
  // fizzled — must consume the set; the fizzle itself
  // must show the halved charge and the spent pouch.
  let fizzle = null;
  let standingConsumed = true;
  for (let i = 0; i < 16 && !fizzle; i++) {
    setPouch(A.ownerKey, SETS.shardrain);
    const t = aTake();
    const e0 = energyOf(A.ownerKey);
    const res = await call("castMapWorking", { spellKey: "shardrain", tileId: t.tileId }, A.token);
    const e1 = energyOf(A.ownerKey);
    const consumed = invOf(A.ownerKey, "reagent:sky-salt") === 0 && invOf(A.ownerKey, "rune-shard") === 0 && invOf(A.ownerKey, "reagent:star-seed") === 0;
    if (res.fizzled) fizzle = { res, delta: e0 - e1, consumed };
    else if (!consumed) standingConsumed = false;
  }
  ok("the hunt found a fizzle within 16 empowered casts", !!fizzle);
  if (fizzle) {
    ok("fizzle: the set is still consumed — it powered the attempt", fizzle.consumed);
    ok("fizzle: the charge was the halved price, and it stayed spent",
      fizzle.res.cost === halfUp(rainCost) && fizzle.delta === fizzle.res.cost, JSON.stringify(fizzle.res));
    ok("standing casts along the hunt consumed their sets too", standingConsumed);
  }
}

/* ══ §B THE BLANK PAGES ═══════════════════════════════ */
console.log("§B the blank pages — a full pouch empowers neither the Black Gate nor the Winged Coil");
{
  setPouch(A.ownerKey, {});
  const base = await call("castMapWorking", { spellKey: "blackgate", facing: "E" }, A.token);
  ok("Black Gate baseline: full price from an empty pouch", base.cost === pageOf("blackgate").cost, JSON.stringify(base));
  const full = Object.fromEntries(ALL_REAGENT_KEYS.map((rk) => [rk, 5]));
  setPouch(A.ownerKey, full);
  const res = await call("castMapWorking", { spellKey: "blackgate", facing: "E" }, A.token);
  ok("Black Gate with a full pouch: still full price, still its standing mod",
    res.cost === base.cost && res.mod === base.mod, JSON.stringify(res));
  ok("Black Gate consumed nothing", ALL_REAGENT_KEYS.every((rk) => invOf(A.ownerKey, itemKeyOf(rk)) === 5));
  const t = aTake();
  const coil = await call("castMapWorking", { spellKey: "coil", tileId: t.tileId }, A.token);
  ok("the Winged Coil (named blank; the 'Coil' line stands unspent): full price, nothing consumed",
    coil.cost === pageOf("coil").cost && ALL_REAGENT_KEYS.every((rk) => invOf(A.ownerKey, itemKeyOf(rk)) === 5),
    JSON.stringify(coil));
}

/* ══ §C THE WITCH'S COMPOSITION ═══════════════════════ */
console.log("§C the Witch — her company price first, the halving on the charged figure, mercy on the charge");
const W = await claim("Empowerment Witch", "witch");
const wTiles = seedTiles(W.ownerKey);
await call("getTerritory", {}, W.token);
await call("setTenderTile", { tileId: wTiles.get("0,0") }, W.token);
const wTake = makeTileTaker(wTiles);
{
  // Her company stands: a party member of hers on the
  // field (the choosing already seated her wakes in her
  // party — tender_party holds them; only the standing
  // on the land is the fixture's to add).
  const standTile = [...wTiles.entries()].find(([k]) => k === "1,0");
  db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
    VALUES (?, ?, ?, ?, ?, 'defense', 0, 99, 1, 0, NULL, NULL, 0)`).run(W.ownerKey, W.wakeIds[0], standTile[1], Date.now(), Date.now());
}
let witchBaseMod, witchPrice;
{
  setPouch(W.ownerKey, {});
  const t = wTake();
  const res = await call("castMapWorking", { spellKey: "shardrain", tileId: t.tileId }, W.token);
  witchBaseMod = res.mod;
  witchPrice = res.cost;
  ok("the Witch's company price computes first (her gift on the book's price)",
    witchPrice === halfUp(rainCost), `cost=${witchPrice} book=${rainCost}`);
}
{
  setPouch(W.ownerKey, SETS.shardrain);
  const t = wTake();
  const res = await call("castMapWorking", { spellKey: "shardrain", tileId: t.tileId }, W.token);
  ok("empowered: the halving reads off HER price, not the book's",
    res.cost === halfUp(witchPrice), `cost=${res.cost} hers=${witchPrice}`);
  ok("empowered: her reckoning carries +2, and the set is consumed",
    res.mod === witchBaseMod + 2 && invOf(W.ownerKey, "reagent:sky-salt") === 0 && invOf(W.ownerKey, "rune-shard") === 0,
    JSON.stringify(res));
}
{
  let fizzle = null;
  for (let i = 0; i < 24 && !fizzle; i++) {
    setPouch(W.ownerKey, SETS.shardrain);
    const t = wTake();
    const e0 = energyOf(W.ownerKey);
    const res = await call("castMapWorking", { spellKey: "shardrain", tileId: t.tileId }, W.token);
    const e1 = energyOf(W.ownerKey);
    if (res.fizzled) fizzle = { res, delta: e0 - e1 };
  }
  ok("the hunt found a Witch fizzle within 24 empowered casts", !!fizzle);
  if (fizzle) {
    const charged = halfUp(witchPrice);
    ok("her fizzle: the mercy refunds half the CHARGED price (never the book's)",
      fizzle.res.cost === charged && fizzle.res.refunded === Math.floor(charged / 2),
      JSON.stringify(fizzle.res));
    ok("her fizzle: the purse fell by charge minus mercy, and the set is spent",
      fizzle.delta === charged - Math.floor(charged / 2)
      && invOf(W.ownerKey, "reagent:sky-salt") === 0 && invOf(W.ownerKey, "rune-shard") === 0 && invOf(W.ownerKey, "reagent:star-seed") === 0,
      `delta=${fizzle.delta}`);
  }
}

/* ══ §D THE SCOPE SWEEP ═══════════════════════════════ */
console.log("§D the scope sweep — every other lined working, both doors of its kind");
const sweep = [
  { key: "seal", args: (t) => ({ tileId: t.tileId, dir: 0 }) },
  { key: "trees", args: (t) => ({ tileId: t.tileId, dir: 0 }) },
  { key: "bulwark", args: (t) => ({ tileId: t.tileId, dir: 0 }) },
  { key: "springleaf", args: (t) => ({ tileId: t.tileId }) },
  { key: "bats", args: () => ({}) },
  { key: "holdrune", args: (t, tk) => { seedDark(tk.ownerKey, t.tileId, t.q, t.r); return { tileId: t.tileId }; } },
  { key: "shatter", args: (t) => ({ tileId: (shatterTiles.shift() ?? t).tileId }) },
  { key: "blade", args: (t) => ({ tileId: t.tileId }) },
  { key: "shard", args: (t) => ({ tileId: t.tileId }) },
  { key: "lattice", args: (t) => ({ tileId: t.tileId }) },
];
for (const entry of sweep) {
  const page = pageOf(entry.key);
  const set = SETS[entry.key];
  const unrelated = ALL_REAGENT_KEYS.find((rk) => !(rk in set));
  setPouch(A.ownerKey, {});
  const t0 = aTake();
  const base = await call("castMapWorking", { spellKey: entry.key, ...entry.args(t0, A) }, A.token);
  ok(`${page.name}: unempowered at its book price`, base.cost === page.cost, JSON.stringify(base));
  const full = Object.fromEntries(ALL_REAGENT_KEYS.map((rk) => [rk, 5]));
  setPouch(A.ownerKey, full);
  const t1 = aTake();
  const res = await call("castMapWorking", { spellKey: entry.key, ...entry.args(t1, A) }, A.token);
  const consumedRight = Object.entries(set).every(([rk, qty]) => invOf(A.ownerKey, itemKeyOf(rk)) === 5 - qty);
  ok(`${page.name}: empowered at ceil(price/2) with +2 on the reckoning`,
    res.cost === halfUp(page.cost) && res.mod === base.mod + 2, JSON.stringify(res));
  ok(`${page.name}: its own set consumed by its line's quantities; an unrelated stack untouched`,
    consumedRight && invOf(A.ownerKey, itemKeyOf(unrelated)) === 5,
    `set=${JSON.stringify(Object.fromEntries(Object.keys(set).map((rk) => [rk, invOf(A.ownerKey, itemKeyOf(rk))])))} unrelated=${invOf(A.ownerKey, itemKeyOf(unrelated))}`);
}

console.log(`\ndrive-reagent-empowerment: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
