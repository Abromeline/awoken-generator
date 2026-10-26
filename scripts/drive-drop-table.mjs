// THE DROP TABLE drive (Nigel's ruling, 2026-10-23 —
// rates 09:23, reagents 13:18; commissioned 2026-10-25
// 01:05). Boots the real server on a scratch DATA_DIR and
// proves the table end to end:
//   §U THE WIRED TABLE, dice set (the loot table fix,
//      2026-10-25, rate set B) — the built drops module
//      called with Math.random held: energy by kind
//      (Fray 3 · Hollow 5 · Unraveler 8 · Tangle 12); the
//      guaranteed reagents are the kind's AC bonus over
//      10 (Fray 1 · Hollow 2 · Unraveler 3 · Tangle 5),
//      each an independent draw on THE TWELVE of record;
//      at 0.99 no percentage class fires; at 0 every class
//      fires on the one table (shards 10 · items 35 ·
//      relics 5 · bonus reagent 10 — today's rates, kept).
//      The campaign road (rollFellDrops) pays the same
//      table straight to the pack, as it always did.
//   §N CONVERSION + NOTICES ON THE REAL ROAD — seeded
//      invented stacks (Shoal Salt, Rainwater Vial,
//      Nightcap Spore) convert to the twelve, counts
//      whole, Ember Ash surviving as itself; wanderers
//      felled in live settlement gather in her Pack
//      (energy 18 for six Fray among it) and a click
//      claims the take home; notices speak once.
//   §C THE CLASSES IN THE WILD (variance-bound, honestly):
//      120 Fray felled on the real road — the Pack gathers
//      at least 360 energy (ambient fells only add);
//      claiming company by company lands the guaranteed
//      reagents plus the percentage classes' share,
//      shards and at least one relic among them; the
//      pack never breaks its caps (fifteen kinds, 100 a
//      stack — the standing shelf law); the older bounty
//      (protection minutes) still banks.
//   §K THE FULL HAND — the DROP is never refused: it
//      gathers in the Pack. The CLAIM is what a full
//      stack (or a brimming energy purse) refuses,
//      spoken plainly, the entry waiting where it lay.
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
const reagentTotal = (ownerKey) => invRows(ownerKey).filter(r => r.key.startsWith("reagent:")).reduce((a, r) => a + r.qty, 0);
const qtyOf = (ownerKey, key) => (db.prepare("SELECT qty FROM tender_inventory WHERE owner_key = ? AND item_key = ?").get(ownerKey, key)?.qty) ?? 0;
const packRows = (ownerKey) => db.prepare("SELECT id, kind, item_key AS itemKey, element, qty FROM tender_pack WHERE owner_key = ?").all(ownerKey);
const TWELVE_SUFFIXES = ["dream-shroom", "ember-ash", "fray-ash", "hollow-silk", "moon-petal", "root-sap", "shadow-matter", "sky-salt", "star-seed", "stone-dust", "tidewater"];
const claimAll = async (token) => {
  const t = await call("getTerritory", {}, token);
  for (const e of t.loot ?? []) await call("claimPackDrop", { entryId: e.id }, token);
  return t;
};

/* ── §U THE WIRED TABLE, dice set ─────────────────────── */
{
  console.log("§U the drop table's wiring, proven with the dice held");
  const realRandom = Math.random;
  const sumKey = (items, key) => items.filter(i => i.key === key).reduce((a, i) => a + i.qty, 0);
  const energyOf = (take) => take.find(d => d.kind === "energy")?.qty ?? 0;
  const itemsOf = (take) => take.filter(d => d.kind === "item").map(d => ({ key: d.itemKey, qty: d.qty }));
  Math.random = () => 0.99; // no percentage class fires (all rates ≤ 0.35); the draw = the table's last good
  const take = drops.rollFellTake("tangle", "stone");
  ok("a Tangle's take names its energy — 12", energyOf(take) === 12, `energy ${energyOf(take)}`);
  ok("a Tangle pays exactly 5 guaranteed reagents (its AC bonus over 10)", itemsOf(take).reduce((a, i) => a + i.qty, 0) === 5, `items ${JSON.stringify(itemsOf(take))}`);
  ok("each reagent an independent draw on the twelve (dice held: all the last good, Tidewater)", itemsOf(take).every(i => i.key === "reagent:tidewater"));
  ok("no drip, shard or relic rides at these dice", !take.some(d => d.kind === "attunement") && !itemsOf(take).some(i => i.key === "rune-shard" || i.key.startsWith("relic:")));
  ok("the take speaks plainly", drops.describeDrops(take) === "12 energy, Tidewater ×5", drops.describeDrops(take));
  ok("energy by kind: Fray 3 · Hollow 5 · Unraveler 8", energyOf(drops.rollFellTake("fray", "root")) === 3 && energyOf(drops.rollFellTake("hollow", "root")) === 5 && energyOf(drops.rollFellTake("unraveler", "root")) === 8);
  ok("guaranteed reagents by kind: Fray 1 · Hollow 2 · Unraveler 3", itemsOf(drops.rollFellTake("fray", "root")).reduce((a, i) => a + i.qty, 0) === 1 && drops.rollItemDrops("hollow").reduce((a, i) => a + i.qty, 0) === 2 && drops.rollItemDrops("unraveler").reduce((a, i) => a + i.qty, 0) === 3);

  Math.random = () => 0; // every class fires; the draw = the first good; relic = first relic
  const take0 = drops.rollFellTake("fray", "root");
  Math.random = realRandom;
  const drip0 = take0.find(d => d.kind === "attunement");
  ok("at open dice the drip pays — a tenth of the ground's element (root)", drip0?.element === "root" && Math.abs(drip0.qty - 0.1) < 1e-9, JSON.stringify(drip0));
  ok("one Fray pays 3 Dream Shroom (guaranteed + items + bonus reagent on the one table)", sumKey(itemsOf(take0), "reagent:dream-shroom") === 3, JSON.stringify(itemsOf(take0)));
  ok("the shard class pays exactly one rune shard", sumKey(itemsOf(take0), "rune-shard") === 1);
  ok("the relic class pays exactly one relic, named for the wheel effect it carries", sumKey(itemsOf(take0), "relic:tenderHp") === 1);

  // The campaign road pays the same table straight to
  // the pack, as it always did (its silent settlement).
  const me = "tender:unit-drops";
  Math.random = () => 0.99;
  drops.rollFellDrops(me, "tangle");
  ok("the campaign road pays its 5 guaranteed reagents straight in", reagentTotal(me) === 5 && qtyOf(me, "reagent:tidewater") === 5, `reagents ${reagentTotal(me)}`);
  const lines = drops.drainDropNotices(me);
  ok("the campaign notice speaks the take", lines.length === 1 && lines[0].includes("Tidewater ×5"), JSON.stringify(lines[0]));
  ok("the ledger drains once", drops.drainDropNotices(me).length === 0);
  const me2 = "tender:unit-drops-all";
  Math.random = () => 0;
  drops.rollFellDrops(me2, "fray");
  Math.random = realRandom;
  ok("on the campaign road one Fray at open dice pays 3 Dream Shroom, 1 shard, 1 relic", qtyOf(me2, "reagent:dream-shroom") === 3 && qtyOf(me2, "rune-shard") === 1 && qtyOf(me2, "relic:tenderHp") === 1, JSON.stringify(invRows(me2)));

  // The invented seven can never be paid, by any road.
  const allowed = new Set([...TWELVE_SUFFIXES.map(s => `reagent:${s}`), "rune-shard"]);
  let bad = null;
  for (let i = 0; i < 3000 && !bad; i++) {
    for (const it of drops.rollItemDrops(["fray", "hollow", "unraveler", "tangle"][i % 4])) {
      if (!allowed.has(it.itemKey) && !it.itemKey.startsWith("relic:")) bad = it.itemKey;
    }
  }
  ok("no fell of any kind can pay an invented good", bad === null, String(bad));
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

/* ── §N CONVERSION + NOTICES ON THE REAL ROAD ─────────── */
{
  console.log("§N conversion, and the real road gathers in her Pack");
  const f = await makeFeller("Notice Tender");
  // Her shelves as the old table left them: three
  // invented goods, and one true good wearing its old
  // pantry: spelling.
  for (const [k, q] of [["pantry:shoal-salt", 7], ["pantry:rainwater-vial", 3], ["pantry:nightcap-spore", 4], ["pantry:ember-ash", 5]]) {
    db.prepare("INSERT INTO tender_inventory (owner_key, item_key, qty, updated_at) VALUES (?, ?, ?, ?)").run(f.me, k, q, Date.now());
  }
  const conv = drops.convertInventedStacks();
  ok("the conversion turned her four standing stacks", conv.length === 4, JSON.stringify(conv));
  ok("Shoal Salt 7 + Rainwater Vial 3 stand as Tidewater 10 (counts whole)", qtyOf(f.me, "reagent:tidewater") === 10, `tidewater ${qtyOf(f.me, "reagent:tidewater")}`);
  ok("Nightcap Spore 4 stands as Dream Shroom 4", qtyOf(f.me, "reagent:dream-shroom") === 4);
  ok("Ember Ash survives as itself — 5 standing, only its spelling mended", qtyOf(f.me, "reagent:ember-ash") === 5 && qtyOf(f.me, "pantry:ember-ash") === 0);
  ok("no invented stack remains on her shelves", invRows(f.me).every(r => !r.key.startsWith("pantry:")), JSON.stringify(invRows(f.me)));
  ok("the conversion is idempotent", drops.convertInventedStacks().length === 0);

  f.seedWanderers(6, "fray");
  const seen = [];
  const done = await f.fellAll(seen);
  ok("every seeded Fray was felled on the battle's road", done, `${f.left()} left`);
  const lines = seen.flatMap(t => t.dropNotices ?? []);
  ok("the territory reads spoke the leavings", lines.length >= 1 && lines.every(l => l.includes("leaves behind") && l.includes("gathered in your Pack")), JSON.stringify(lines.slice(0, 2)));
  const packNow = packRows(f.me);
  const energyRow = packNow.find(r => r.kind === "energy");
  ok("the six Fray's energy waits in her Pack — 18 in one orb", energyRow?.qty === 18, JSON.stringify(packNow));
  ok("the Pack holds at least the guaranteed reagents (6 Fray = 6)", packNow.filter(r => r.kind === "item").reduce((a, r) => a + r.qty, 0) >= 6, JSON.stringify(packNow));
  ok("nothing reached her shelves silently (only the converted 19 stand)", reagentTotal(f.me) === 19, `reagents ${reagentTotal(f.me)}`);
  // Her purse emptied by hand so the orb's landing reads
  // clean, and the orb claimed FIRST — before any read
  // can refill her by regen: the claim lands the orb up
  // to her purse's cap (this fixture's cap is 16, the
  // standing purse law — the orb's remaining 2 are the
  // cap's, and the report names that behaviour).
  db.prepare("UPDATE tender_resources SET energy = 0 WHERE owner_key = ?").run(f.me);
  await call("claimPackDrop", { entryId: energyRow.id }, f.token);
  const energy = db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(f.me)?.energy ?? -1;
  ok("claiming lands the orb — her purse fills from empty toward the 18", energy >= 15 && energy <= 18, `energy ${energy}`);
  await claimAll(f.token);
  ok("claiming lands the reagents too", reagentTotal(f.me) >= 20, `reagents ${reagentTotal(f.me)}`);
  ok("the Pack stands empty once all is claimed", packRows(f.me).length === 0, JSON.stringify(packRows(f.me)));
  const again = await call("getTerritory", {}, f.token);
  ok("a later read speaks no drop line twice (drained)", (again.dropNotices ?? []).length === 0, JSON.stringify(again.dropNotices));
  ok("the read serves her inventory's face", Array.isArray(again.pack?.stacks) && again.pack.stacks.length >= 1);
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
  // Each company's take is claimed before the next is
  // seeded, and her shelves emptied between companies —
  // the shelf holds fifteen kinds (the game's standing
  // law), and the tallies below are what the claims
  // landed. The Pack-side tallies (orb, goods) are read
  // BEFORE each claiming, so they measure the fells
  // themselves. Ambient dark born during the long fight
  // fall to the same guard and pay in too — every bound
  // below is a floor the seeded 120 guarantee, never an
  // exact count.
  let orbSeen = 0, goodsSeen = 0, claimedReagents = 0, claimedRelics = 0, claimedShards = 0, capsHeld = true;
  for (let batch = 0; batch < 20; batch++) {
    f.seedWanderers(6, "fray");
    if (!(await f.fellAll(null))) { allFelled = false; break; }
    const packNow = packRows(f.me);
    orbSeen += packNow.find(r => r.kind === "energy")?.qty ?? 0;
    goodsSeen += packNow.filter(r => r.kind === "item").reduce((a, r) => a + r.qty, 0);
    db.prepare("UPDATE tender_resources SET energy = 0 WHERE owner_key = ?").run(f.me);
    const t = await call("getTerritory", {}, f.token);
    for (const e of t.loot ?? []) { try { await call("claimPackDrop", { entryId: e.id }, f.token); } catch { /* a refused claim waits in the Pack; the tallies read what landed */ } }
    claimedReagents += reagentTotal(f.me);
    claimedRelics += invRows(f.me).filter(r => r.key.startsWith("relic:")).reduce((a, r) => a + r.qty, 0);
    claimedShards += qtyOf(f.me, "rune-shard");
    const rowsNow = invRows(f.me);
    if (!(rowsNow.length <= 15 && rowsNow.every(r => r.qty <= 100))) capsHeld = false;
    db.prepare("DELETE FROM tender_inventory WHERE owner_key = ?").run(f.me);
  }
  ok("all 120 Fray felled (twenty companies of six)", allFelled, `${f.left()} left in the last company`);
  ok("the Pack gathered at least 360 energy (120 Fray × 3 — ambient fells only add)", orbSeen >= 360, `orb ${orbSeen}`);
  ok("the Pack gathered at least the 120 guaranteed reagents", goodsSeen >= 120, `gathered ${goodsSeen}`);
  // Guaranteed: 120 reagents. Items (35%) + bonus reagent (10%) add ~54 ± 5.4;
  // the bound below stands more than seven sigmas under the mean.
  ok("claiming lands the reagents plus the items/bonus classes' share", claimedReagents >= 135, `reagents ${claimedReagents}`);
  ok("rune shards landed on the real road", claimedShards >= 1, `shards ${claimedShards}`);
  ok("at least one relic landed on the real road", claimedRelics >= 1, `relics ${claimedRelics}`);
  ok("the pack never breaks its caps (≤15 stacks, ≤100 each)", capsHeld);
  const bank = db.prepare("SELECT protection_bank_ms AS bank FROM tender_progress WHERE owner_key = ?").get(f.me)?.bank ?? 0;
  ok("the older bounty still banks (protection minutes from the same kills)", bank > 0, `bank ${bank}`);
}

/* ── §K THE FULL HAND ─────────────────────────────────── */
{
  console.log("§K a full hand refuses the claim, never the drop");
  const f = await makeFeller("Full Tender");
  f.seedWanderers(5, "fray");
  const seen = [];
  const done = await f.fellAll(seen);
  ok("the Fray still fall before a full hand", done, `${f.left()} left`);
  const lines = seen.flatMap(t => t.dropNotices ?? []);
  ok("the spoken line names the gathering, not a refusal", lines.length >= 1 && lines.every(l => l.includes("gathered in your Pack")), JSON.stringify(lines.slice(0, 2)));
  const t0 = await call("getTerritory", {}, f.token);
  const loot = t0.loot ?? [];
  const itemEntry = loot.find(e => e.kind === "item" && e.itemKey && e.itemKey !== "rune-shard");
  ok("the drops gathered in her Pack all the same (≥5 guaranteed goods)", loot.filter(e => e.kind === "item").reduce((a, e) => a + e.qty, 0) >= 5 && !!itemEntry, JSON.stringify(loot));
  // Fill the very stack her first waiting good belongs
  // to, then click it: the claim must refuse, spoken,
  // and nothing may move.
  db.prepare("INSERT INTO tender_inventory (owner_key, item_key, qty, updated_at) VALUES (?, ?, 100, ?) ON CONFLICT(owner_key, item_key) DO UPDATE SET qty = 100").run(f.me, itemEntry.itemKey, Date.now());
  const before = invRows(f.me).reduce((a, r) => a + r.qty, 0);
  let refusal = "";
  try { await call("claimPackDrop", { entryId: itemEntry.id }, f.token); } catch (e) { refusal = String(e); }
  ok("the claim of a full stack is refused, spoken plainly", refusal.includes("cannot carry"), refusal);
  const after = invRows(f.me).reduce((a, r) => a + r.qty, 0);
  ok("nothing moved — totals unchanged, the entry still waiting", after === before && packRows(f.me).some(r => r.id === itemEntry.id), `${before} -> ${after}`);
  // A brimming purse refuses the orb the same way.
  const orbE = loot.find(e => e.kind === "energy");
  db.prepare("UPDATE tender_resources SET energy = 100000 WHERE owner_key = ?").run(f.me);
  let orbRefusal = "";
  try { await call("claimPackDrop", { entryId: orbE.id }, f.token); } catch (e) { orbRefusal = String(e); }
  ok("a brimming purse refuses the orb, and the orb waits", orbRefusal.includes("stands full") && packRows(f.me).some(r => r.id === orbE.id), orbRefusal);
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
