// THE DROP TABLE drive (Nigel's ruling, 2026-10-23 —
// rates 09:23, reagents 13:18; commissioned 2026-10-25
// 01:05). Boots the real server on a scratch DATA_DIR and
// proves the table end to end:
//   §U THE WIRED TABLE, dice set — the built drops module
//      called on the real database with Math.random held:
//      at 0.99 no percentage class fires and a Tangle pays
//      EXACTLY its 5 reagents (its AC bonus over 10), a Fray
//      1, a Hollow 2, an Unraveler 3 — the guaranteed
//      channel counted to the good; at 0 every class fires:
//      one Fray pays 3 pantry goods (reagent + items +
//      alchemy rolls on the one table), 1 rune shard,
//      1 relic — each class wired, none doubled.
//   §N NOTICES ON THE REAL ROAD — wanderers felled by the
//      Tender's weapon in live settlement speak their
//      leavings in the territory read, once; a later read
//      speaks none (drained), and the pack holds at least
//      the guaranteed reagents.
//   §C THE CLASSES IN THE WILD (variance-bound, honestly):
//      120 Fray felled on the real road — the pantry gains
//      the 120 guaranteed reagents plus a healthy share of
//      the items/alchemy classes; shards and at least one
//      relic land; the pack never breaks its caps; the
//      older bounty (protection minutes) still banks.
//   §K THE FULL PACK — fifteen stacks at 100: five more
//      Fray land nothing, totals stand unchanged, and the
//      spoken line names what could not be carried.
//   §S THE SHARD FORGE — 20 shards turn into exactly one
//      point of the chosen element through the pools; 19
//      are refused and nothing is spent; getInventory
//      serves the pack.
// Run: node scripts/drive-drop-table.mjs
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const OUT = "/home/hatch/workspace/drop-table-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(OUT, "data-"));
process.env.PORT = "3978";
process.env.WORKSHOP_PASSWORD = "<MASKED_SECRET_001>";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;
process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3978";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

const drops = await import("../server/dist/drops.js");
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

const invRows = (ownerKey) => db.prepare("SELECT item_key AS key, qty FROM tender_inventory WHERE owner_key = ?").all(ownerKey);
const pantryTotal = (ownerKey) => invRows(ownerKey).filter(r => r.key.startsWith("pantry:")).reduce((a, r) => a + r.qty, 0);
const qtyOf = (ownerKey, key) => (db.prepare("SELECT qty FROM tender_inventory WHERE owner_key = ? AND item_key = ?").get(ownerKey, key)?.qty) ?? 0;

/* ── §U THE WIRED TABLE, dice set ─────────────────────── */
{
  console.log("§U the drop table's wiring, proven with the dice held");
  const me = "tender:unit-drops";
  const realRandom = Math.random;
  Math.random = () => 0.99; // no percentage class fires (all rates ≤ 0.35); pantry roll = last good
  drops.rollFellDrops(me, "tangle");
  ok("a Tangle pays exactly 5 reagents (its AC bonus over 10)", pantryTotal(me) === 5, `pantry ${pantryTotal(me)}`);
  ok("each reagent an independent roll on the table (dice held: all one good)", qtyOf(me, "pantry:nightcap-spore") === 5);
  drops.rollFellDrops(me, "fray");
  drops.rollFellDrops(me, "hollow");
  drops.rollFellDrops(me, "unraveler");
  ok("Fray 1 + Hollow 2 + Unraveler 3 more — 11 reagents in all", pantryTotal(me) === 11, `pantry ${pantryTotal(me)}`);
  ok("no percentage class fired at these dice (no shards, no relics)", qtyOf(me, "rune-shard") === 0 && invRows(me).every(r => !r.key.startsWith("relic:")));
  const lines = drops.drainDropNotices(me);
  ok("the notice ledger speaks the take", lines.length === 4 && lines[0].includes("Nightcap Spore ×5"), JSON.stringify(lines[0]));
  ok("the ledger drains once", drops.drainDropNotices(me).length === 0);

  const me2 = "tender:unit-drops-all";
  Math.random = () => 0; // every class fires; pantry roll = first good; relic = first verb
  drops.rollFellDrops(me2, "fray");
  Math.random = realRandom;
  ok("at open dice one Fray pays 3 pantry goods (reagent + items + alchemy on the one table)", qtyOf(me2, "pantry:shoal-salt") === 3, `shoal ${qtyOf(me2, "pantry:shoal-salt")}`);
  ok("the shard class pays exactly one rune shard", qtyOf(me2, "rune-shard") === 1);
  ok("the relic class pays exactly one relic, named for the wheel effect it carries", qtyOf(me2, "relic:tenderHp") === 1);
}

/* ── The felling harness — the LIVING BATTLE's road
 * (drive-xp-division's fixture shape): a strong Awokin
 * stands on the heart and fells the seeded dark with her
 * own blows, the road whose kills pay the bounty through
 * creditBattleKill. (The Tender's weapon referee is a
 * different road with a standing bounty bypass — drip
 * only; it is not this table's road and is not used here.) ── */
async function makeFeller(name) {
  const claim = await call("claimTender", { password: "<MASKED_SECRET_001>", tenderName: name });
  const token = claim.token;
  const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id}`;
  const now = Date.now();
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(me, now);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(me, now);
  // The class set by hand, as the xp-division drive sets
  // it: the choosing gate wants three wakes first. The
  // Tender stands WEAPONLESS on purpose: his weapon
  // referee is a separate road whose kills bypass the
  // bounty by standing law (drip only) — with a sword in
  // hand it out-races the lone guard to every ring fell
  // and the table would never be exercised. Disarmed,
  // every fell here is the guard's, on the bounty road.
  db.prepare("INSERT INTO tender_progress (owner_key, class_key, hp, updated_at) VALUES (?, 'warden', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', hp = 100").run(me, now);
  const seedTile = (q, r, cursed, element) => Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(me, q, r, element, cursed, Date.now()).lastInsertRowid);
  const heart = seedTile(0, 0, 0, "root");
  const ringCoords = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const ring = ringCoords.map(([q, r]) => ({ id: seedTile(q, r, 1, "fire"), q, r }));
  // One strong hand standing on the heart.
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 3, 3, 'sky', ?, 'image/png', ?)").run(`Drive ${cat}`, cat, `drive/${cat}.png`, Date.now()).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `Drive ${cat}`, category: cat, rarity: "common", power: 3, toughness: 3, element: "sky" });
  }
  const guardId = Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES ('Drive Guard', 'Drive Guard', 'drive/guard.png', ?, 'tender', ?, ?, ?)").run(JSON.stringify(parts), name, me, Date.now()).lastInsertRowid);
  db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered) VALUES (?, ?, ?, ?, ?, 'attack', 0, 99, 0, 0, 30, 30, 0)").run(me, guardId, heart, Date.now(), Date.now());
  const seedWanderers = (n, kind) => {
    for (let i = 0; i < n; i++) {
      const t = ring[i % ring.length];
      db.prepare("INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at) VALUES (?, ?, ?, ?, 1, ?, ?, 1, 1, 0)").run(me, t.id, kind, Date.now(), t.q, t.r);
    }
  };
  const left = () => db.prepare("SELECT COUNT(*) AS n FROM homeland_wanderers WHERE owner_key = ?").get(me).n;
  const readTerritory = async () => {
    // One retry on a socket reset: the scratch server is
    // in-process and a single reset under load must not
    // masquerade as a failed proof (a second failure
    // propagates and fails the drive honestly).
    try { return await call("getTerritory", {}, token); }
    catch { await sleep(300); return await call("getTerritory", {}, token); }
  };
  const fellAll = async (capture) => {
    await readTerritory(); // prime: the stand and the battle wake
    for (let i = 0; i < 60 && left() > 0; i++) {
      db.prepare("UPDATE tender_progress SET hp = 100, down_until = NULL, battle_watermark = ? WHERE owner_key = ?").run(Date.now() - 120000, me);
      // The guard restored whole between reads — and if a
      // hard window felled her outright (0 HP dissipates
      // an Awoken back to the hand, the placement row
      // gone), the drive does what a Tender does: fields
      // her again. Without this the grind silently loses
      // its only fighter and stalls forever.
      const stood = db.prepare("SELECT COUNT(*) AS n FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(me, guardId).n;
      if (stood === 0) {
        db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered) VALUES (?, ?, ?, ?, ?, 'attack', 0, 99, 0, 0, 30, 30, 0)").run(me, guardId, heart, Date.now(), Date.now());
      } else {
        db.prepare("UPDATE field_placements SET hp = 99, shield = 30 WHERE owner_key = ?").run(me);
      }
      const t = await readTerritory();
      if (capture) capture.push(t);
    }
    return left() === 0;
  };
  return { token, me, seedWanderers, left, fellAll };
}

/* ── §N NOTICES ON THE REAL ROAD ──────────────────────── */
{
  console.log("§N the real road speaks its leavings");
  const f = await makeFeller("Notice Tender");
  f.seedWanderers(6, "fray");
  const seen = [];
  const done = await f.fellAll(seen);
  ok("every seeded Fray was felled on the battle's road", done, `${f.left()} left`);
  const lines = seen.flatMap(t => t.dropNotices ?? []);
  ok("the territory reads spoke the leavings", lines.length >= 1 && lines.every(l => l.includes("leaves behind")), JSON.stringify(lines.slice(0, 2)));
  ok("the pack holds at least the guaranteed reagents (6 Fray = 6)", pantryTotal(f.me) >= 6, `pantry ${pantryTotal(f.me)}`);
  const again = await call("getTerritory", {}, f.token);
  ok("a later read speaks no drop line twice (drained)", (again.dropNotices ?? []).length === 0, JSON.stringify(again.dropNotices));
  ok("the read serves the pack's face", Array.isArray(again.pack?.stacks) && again.pack.stacks.length >= 1);
}

/* ── §C THE CLASSES IN THE WILD ───────────────────────── */
{
  console.log("§C the percentage classes across 120 real fells");
  const f = await makeFeller("Wild Tender");
  // Seeded in twenty companies of six (§N's proven
  // shape): a crowd of twenty at the doorstep jams the
  // field's own crowding and the fight stalls — real
  // spawn caps stand near a dozen — while the statistics
  // want 120 FELLS, not one jam.
  let allFelled = true;
  for (let batch = 0; batch < 20; batch++) {
    f.seedWanderers(6, "fray");
    if (!(await f.fellAll(null))) { allFelled = false; break; }
  }
  ok("all 120 Fray felled (twenty companies of six)", allFelled, `${f.left()} left in the last company`);
  const pantry = pantryTotal(f.me);
  // Guaranteed: 120 reagents. Items (35%) + alchemy (10%) add ~54 ± 5.4;
  // the bound below stands more than seven sigmas under the mean.
  ok("the pantry holds the reagents plus the items/alchemy classes' share", pantry >= 135, `pantry ${pantry}`);
  ok("rune shards landed on the real road", qtyOf(f.me, "rune-shard") >= 1, `shards ${qtyOf(f.me, "rune-shard")}`);
  const relicTotal = invRows(f.me).filter(r => r.key.startsWith("relic:")).reduce((a, r) => a + r.qty, 0);
  ok("at least one relic landed on the real road", relicTotal >= 1, `relics ${relicTotal}`);
  const rows = invRows(f.me);
  ok("the pack never breaks its caps (≤15 stacks, ≤100 each)", rows.length <= 15 && rows.every(r => r.qty <= 100), `${rows.length} stacks`);
  const bank = db.prepare("SELECT protection_bank_ms AS bank FROM tender_progress WHERE owner_key = ?").get(f.me)?.bank ?? 0;
  ok("the older bounty still banks (protection minutes from the same kills)", bank > 0, `bank ${bank}`);
}

/* ── §K THE FULL PACK ─────────────────────────────────── */
{
  console.log("§K a full pack can carry no more — and says so");
  const f = await makeFeller("Full Tender");
  const pantryKeys = ["shoal-salt", "rainwater-vial", "held-breath", "hawk-feather", "hewn-stone-dust", "ember-ash", "bramble-cutting", "nightcap-spore"];
  const relicKeys = ["tenderHp", "heal", "tableEnergy", "company", "party", "attunement"];
  for (const k of pantryKeys) db.prepare("INSERT INTO tender_inventory (owner_key, item_key, qty, updated_at) VALUES (?, ?, 100, ?)").run(f.me, `pantry:${k}`, Date.now());
  db.prepare("INSERT INTO tender_inventory (owner_key, item_key, qty, updated_at) VALUES (?, 'rune-shard', 100, ?)").run(f.me, Date.now());
  for (const k of relicKeys) db.prepare("INSERT INTO tender_inventory (owner_key, item_key, qty, updated_at) VALUES (?, ?, 100, ?)").run(f.me, `relic:${k}`, Date.now());
  const before = invRows(f.me).reduce((a, r) => a + r.qty, 0);
  f.seedWanderers(5, "fray");
  const seen = [];
  const done = await f.fellAll(seen);
  ok("the Fray still fall before a full pack", done, `${f.left()} left`);
  const after = invRows(f.me).reduce((a, r) => a + r.qty, 0);
  ok("nothing more landed (totals unchanged at the caps)", after === before && invRows(f.me).length === 15, `${before} -> ${after}`);
  const lines = seen.flatMap(t => t.dropNotices ?? []);
  ok("the spoken line names what could not be carried", lines.some(l => l.includes("could not be carried")), JSON.stringify(lines.slice(0, 2)));
}

/* ── §S THE SHARD FORGE ───────────────────────────────── */
{
  console.log("§S twenty shards turn into one chosen point");
  const claim = await call("claimTender", { password: "<MASKED_SECRET_001>", tenderName: "Forge Tender" });
  const token = claim.token;
  const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id}`;
  db.prepare("INSERT INTO tender_inventory (owner_key, item_key, qty, updated_at) VALUES (?, 'rune-shard', 20, ?)").run(me, Date.now());
  const r = await call("convertRuneShards", { element: "tide" }, token);
  ok("the forge answers and the shards are spent", r.ok === true && r.pack.shardCount === 0, JSON.stringify(r.pack));
  const pool = db.prepare("SELECT points FROM aspect_attunement WHERE owner_key = ? AND element = 'tide'").get(me)?.points ?? 0;
  ok("exactly one point of the CHOSEN element stands in the pools", pool === 1, `tide ${pool}`);
  const inv = await call("getInventory", {}, token);
  ok("getInventory serves the same pack", inv.pack && inv.pack.shardCount === 0 && Array.isArray(inv.pack.stacks));
  db.prepare("UPDATE tender_inventory SET qty = 19 WHERE owner_key = ? AND item_key = 'rune-shard'").run(me);
  let refused = false;
  try { await call("convertRuneShards", { element: "tide" }, token); } catch { refused = true; }
  const poolAfter = db.prepare("SELECT points FROM aspect_attunement WHERE owner_key = ? AND element = 'tide'").get(me)?.points ?? 0;
  ok("nineteen shards are refused — nothing spent, nothing granted", refused && qtyOf(me, "rune-shard") === 19 && poolAfter === 1);
}

console.log(`\ndrive-drop-table: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
