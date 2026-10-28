// SHARD RAIN'S POOL SPLIT AT HOME (N50 split — parity
// closing programme, 2026-10-28: the Table's split is the
// true behaviour). Boots the real server on a scratch
// DATA_DIR and proves, over the real cast door at home:
//   §A a rain over ONE foe deals it the WHOLE pool — its
//      harm is a full 2d6 pool (2..12, the bare rain's dice:
//      diceBase 2, rainLevel 0), not a share of one.
//   §B a rain over THIRTEEN foes divides that same pool:
//      the share floors to 0, so no foe takes more than the
//      remainder's one point, the harmed foes are exactly a
//      prefix of the line (the remainder walks down it one
//      point at a time, as at the Table), and the TOTAL harm
//      is one pool (2..12) — never thirteen pools.
//   §C a rain over THREE foes deals each its divided share:
//      the shares differ by at most one (floor + remainder),
//      the total is one pool, and no foe takes the whole
//      pool while others stand under the same rain.
// Run: node scripts/drive-shard-rain-split.mjs
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-rain-split-"));
process.env.PORT = "3986";
process.env.WORKSHOP_PASSWORD = "drive-rain-split";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3986";
const PW = ["rain", "split", "pw", "1"].join("-");
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
async function castUntilStandsApi(token, args) {
  for (let i = 0; i < 30; i++) {
    const res = await call("castMapWorking", args, token);
    if (!res.fizzled) return res;
  }
  throw new Error("cast never stood: " + JSON.stringify(args));
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up */ }

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

function seedAwokinRow(ownerKey, tenderName, name) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 3, 3, 'root', ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, `rain-split/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: 3, toughness: 3, element: "root" });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `rain-split/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}

async function claimAt(name) {
  const c = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(c.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  const now = Date.now();
  // Lv 3 (150 XP, as the target-profiles drive stages it):
  // rain reach 0 — the rain covers its own hex only, so every
  // foe staged on that hex is under it and no other is.
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 150, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, now);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(ownerKey, now);
  seedAwokinRow(ownerKey, name, `${name} Wake One`);
  seedAwokinRow(ownerKey, name, `${name} Wake Two`);
  seedAwokinRow(ownerKey, name, `${name} Wake Three`);
  await call("chooseClass", { classKey: "runewright" }, c.token);
  const tiles = new Map();
  const ins = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, ?, ?, 0, ?)");
  for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > 3) continue;
    tiles.set(`${q},${r}`, Number(ins.run(ownerKey, q, r, now).lastInsertRowid));
  }
  await call("getTerritory", {}, c.token);
  return { token: c.token, ownerKey, tiles };
}

const FOE_HP = 100000;
function seedFoes(ownerKey, tileId, q, r, n) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    ids.push(Number(db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
      VALUES (?, ?, 'fray', ?, ?, ?, ?, 1, 1, 0)`).run(ownerKey, tileId, Date.now(), FOE_HP, q, r).lastInsertRowid));
  }
  return ids;
}
const harmsOf = (ids) => ids.map((id) => {
  const row = db.prepare("SELECT hp FROM homeland_wanderers WHERE id = ?").get(id);
  return row ? FOE_HP - row.hp : FOE_HP; // a felled foe paid its whole staged body — never staged here (shares are far below it)
});

async function rainOver(name, foeCount) {
  const T = await claimAt(name);
  const tileId = T.tiles.get("0,-2");
  const ids = seedFoes(T.ownerKey, tileId, 0, -2, foeCount);
  const res = await castUntilStandsApi(T.token, { spellKey: "shardrain", tileId, pointQ: 0, pointR: -2 });
  const standing = db.prepare("SELECT id FROM territory_workings WHERE owner_key = ? AND engine = 'shardrain'").get(T.ownerKey);
  return { res, harms: harmsOf(ids), standing };
}

/* ══ §A ONE FOE — THE WHOLE POOL ══════════════════════════ */
console.log("§A a rain over one foe deals it the whole pool");
{
  const { res, harms, standing } = await rainOver("Rain One", 1);
  const total = harms.reduce((a, b) => a + b, 0);
  ok("the rain sprang at the cast and the writing is spent", res.sprung === true && !standing,
    `sprung=${res.sprung} standing=${!!standing}`);
  ok("the lone foe's harm is a whole 2d6 pool (2..12)", harms.length === 1 && total >= 2 && total <= 12,
    `harms=${JSON.stringify(harms)}`);
}

/* ══ §B THIRTEEN FOES — THE POOL DIVIDES TO SINGLE POINTS ═ */
console.log("§B a rain over thirteen foes divides the pool among them");
{
  const { harms } = await rainOver("Rain Thirteen", 13);
  const total = harms.reduce((a, b) => a + b, 0);
  const harmed = harms.filter((h) => h > 0).length;
  ok("no foe takes more than one point (share = floor(pool/13) = 0; only the remainder's points land)",
    harms.every((h) => h === 0 || h === 1), `harms=${JSON.stringify(harms)}`);
  ok("the total harm is ONE pool (2..12), not thirteen pools", total >= 2 && total <= 12,
    `total=${total} harms=${JSON.stringify(harms)}`);
  ok("exactly the pool's worth of foes are harmed, one point each (harmed count = total harm)",
    harmed === total, `harmed=${harmed} total=${total}`);
  ok("the remainder walks down the line: the harmed foes are a prefix of the foes as they stand",
    harms.every((h, i) => h === (i < total ? 1 : 0)), `harms=${JSON.stringify(harms)}`);
}

/* ══ §C THREE FOES — FLOOR SHARES, REMAINDER DOWN THE LINE ═ */
console.log("§C a rain over three foes deals each its divided share");
{
  const { harms } = await rainOver("Rain Three", 3);
  const total = harms.reduce((a, b) => a + b, 0);
  ok("the total harm is one pool (2..12)", total >= 2 && total <= 12, `harms=${JSON.stringify(harms)}`);
  ok("the shares differ by at most one (floor share, remainder one point at a time)",
    Math.max(...harms) - Math.min(...harms) <= 1, `harms=${JSON.stringify(harms)}`);
  ok("no foe takes the whole pool while the others stand under the same rain",
    harms.every((h) => h < total), `harms=${JSON.stringify(harms)}`);
  ok("the earlier foes in the line take no less than the later (remainder first)",
    harms[0] >= harms[1] && harms[1] >= harms[2], `harms=${JSON.stringify(harms)}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
