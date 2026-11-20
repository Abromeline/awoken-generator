// Drive: THE AWAY-CHANGE, TENDRILS AND THE ROOT (Dark
// Builds, Build 1 — Nigel 2026-11-20). Proves the
// away-settle end to end on a scratch fixture DB:
//   (a) a simulated 5-hour absence resolves in one pass:
//       a Root is raised on the deepest cursed ring, its
//       tendril grows toward the purified edge and stops
//       there pressing (never entering purified ground),
//       the Root summons dark ones at the tendril's far
//       end, and frontier cursed tiles thicken, capped;
//   (b) the edge-only law: no purified tile is ever
//       re-cursed, at any step, and deep non-frontier
//       cursed ground does not thicken;
//   (c) breaking the Root with real strikes stops the
//       summoning at once, withers the whole tendril, and
//       pays the big take into the Pack; the withered
//       tiles die on their span and pay where they fell;
//   (d) a second absence raises a new Root (never two at
//       once) and regrows the tendril; cutting a tendril
//       tile with real strikes severs the chain — the far
//       side withers and dies paying its take, the stump's
//       Root stands on;
//   (e) the online creep: with the Root's anchors aged by
//       fixture, one present read regrows the tendril and
//       summons again on the slow hour / ten minutes.
// Absence is simulated on the settle's own watermark
// (away_change_state.seen_at is the settle's record of
// when it last saw the Tender — ageing it IS the tender
// having been gone), and withers/creep are aged on their
// own deadlines/anchors the same way. Fixture wounding
// (a Root or tendril tile's hp set low) only shortens the
// striking; every blow that fells is a real battle strike
// through settleHomelandBattle. The strikers are stone
// Awoken (reach 1.35) stood beside exactly one structure,
// so the nearest-target law can spend their strikes on
// nothing else. Server-side behaviour — the face's
// drawing is proven by the client build and the served
// darkGrowth state asserted here; this rig produces no
// screenshot.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-away-change-"));
process.env.PORT = "39991";
// The slow gear at 3s: the away-settle's clock road is
// exercised between reads, as in play.
process.env.MASTER_CLOCK_TICK_MS = "3000";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

const BASE = "http://127.0.0.1:39991";
let failures = 0, checks = 0;
function check(name, cond, extra = "") {
  checks++;
  if (cond) console.log(`  PASS ${name}`);
  else { failures++; console.log(`  FAIL ${name} ${extra}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

await import("../server/dist/index.js");
let up = false;
for (let i = 0; i < 90 && !up; i++) {
  try { const r = await fetch(BASE + "/api/health"); up = r.ok; } catch {}
  if (!up) await sleep(1000);
}
if (!up) { console.log("SERVER DID NOT BOOT"); process.exit(2); }
console.log("server up");

let token = null;
async function callOk(action, params = {}, note = "") {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const r = await fetch(`${BASE}/api/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
        body: JSON.stringify(params),
      });
      const raw = await r.json().catch(() => ({}));
      if (r.status === 200) return raw?.data ?? raw;
      const msg = JSON.stringify(raw).slice(0, 220);
      if (!/SQLITE_IOERR|ECONNRESET/.test(msg) || attempt === 5) throw new Error(`${action} ${note} -> ${r.status} ${msg}`);
    } catch (e) {
      if (!/ECONNRESET|fetch failed/.test(String(e)) || attempt === 5) throw e;
    }
    await sleep(700);
  }
}

const claim = await callOk("claimTender", { password: "away-change-drive-password", tenderName: "Away Tender" });
token = claim.token;
const req = createRequire(join(process.cwd(), "package.json"));
const Database = req("better-sqlite3");
const db = new Database(join(process.env.DATA_DIR, "app.db"));
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
db.pragma("busy_timeout = 5000");
const now0 = Date.now();
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 3, 'runewright', 'arrow', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'runewright', total_exp = 3800, hp = 100").run(ownerKey, now0);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 900, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 900").run(ownerKey, now0);

// ── §1 The fixture land: a purified heart (ring ≤ 1) in
// a cursed sea, every cursed tile at its full standing
// thickness (4 + 6·ring). The seed world already stands
// at its own radius; the clone pass only guarantees the
// sea reaches at least ring 4.
await callOk("ensureFirstSeed", {}, "first seed");
// The first-seed hold is closed by fixture: its risings
// are the intro's own war, not this drive's subject.
db.prepare("UPDATE first_seed_events SET state = 'done', rising_live = 0 WHERE owner_key = ?").run(ownerKey);
const ringOf = (t) => Math.max(Math.abs(t.q), Math.abs(t.r), Math.abs(t.q + t.r));
const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
{
  const rows = db.prepare("SELECT * FROM territory_tiles WHERE owner_key = ?").all(ownerKey);
  const sample = rows[0];
  const present = new Set(rows.map(t => `${t.q},${t.r},${t.z}`));
  const cols = Object.keys(sample).filter(c => c !== "id");
  const ins = db.prepare(`INSERT INTO territory_tiles (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`);
  for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
    if (ringOf({ q, r }) > 4 || present.has(`${q},${r},${sample.z}`)) continue;
    ins.run(...cols.map(c => c === "q" ? q : c === "r" ? r : sample[c]));
  }
  const setCursed = db.prepare("UPDATE territory_tiles SET cursed = 1, curse_hp = ?, curse_max_hp = ? WHERE id = ?");
  const setPure = db.prepare("UPDATE territory_tiles SET cursed = 0, curse_hp = NULL, curse_max_hp = NULL WHERE id = ?");
  for (const t of db.prepare("SELECT id, q, r FROM territory_tiles WHERE owner_key = ?").all(ownerKey)) {
    const rg = ringOf(t);
    if (rg <= 1) setPure.run(t.id);
    else setCursed.run(4 + 6 * rg, 4 + 6 * rg, t.id);
  }
}
const tileRow = (id) => db.prepare("SELECT id, q, r, z, cursed, curse_hp AS curseHp, curse_max_hp AS curseMaxHp, element FROM territory_tiles WHERE id = ?").get(id);
const allTiles = () => db.prepare("SELECT id, q, r, z, cursed, curse_hp AS curseHp, curse_max_hp AS curseMaxHp FROM territory_tiles WHERE owner_key = ?").all(ownerKey);
const roots = () => db.prepare("SELECT id, tile_id AS tileId, hp, max_hp AS maxHp FROM dark_roots WHERE owner_key = ?").all(ownerKey);
const tendrils = () => db.prepare("SELECT id, tile_id AS tileId, ord, hp, wither_at AS witherAt FROM dark_tendrils WHERE owner_key = ? ORDER BY ord").all(ownerKey);
const wanderersOn = (tileIds) => tileIds.length
  ? db.prepare(`SELECT COUNT(*) AS n FROM homeland_wanderers WHERE owner_key = ? AND tile_id IN (${tileIds.map(() => "?").join(",")})`).get(ownerKey, ...tileIds).n
  : 0;
const packEnergy = () => db.prepare("SELECT COALESCE(SUM(qty), 0) AS q FROM tender_pack WHERE owner_key = ? AND kind = 'energy'").get(ownerKey).q;
// One frontier tile stands wounded (3 below its cap) for
// the thickening proof.
const wounded = allTiles().filter(t => ringOf(t) === 2).sort((a, b) => a.id - b.id)[0];
db.prepare("UPDATE territory_tiles SET curse_hp = ? WHERE id = ?").run(wounded.curseMaxHp - 3, wounded.id);

await callOk("getTerritory", {}, "settle-in read");
// The land's true deepest ring is only known once the
// settle-in read has run: the frontier buffer mints the
// outer sea there. One deepest tile stands watched for
// the no-thickening proof (the Root takes the lowest id
// on its ring, so the watch takes the highest).
const deepestRing = Math.max(...allTiles().filter(t => t.cursed).map(t => ringOf(t)));
const deepWatch = allTiles().filter(t => ringOf(t) === deepestRing).sort((a, b) => b.id - a.id)[0];
const tendrilLen = deepestRing - 2; // steps from the deepest ring down to beside the heart
check("the fixture land stands whole", allTiles().length >= 61, `tiles=${allTiles().length}`);
check("the away-settle's watermark is laid by the first read", !!db.prepare("SELECT owner_key FROM away_change_state WHERE owner_key = ?").get(ownerKey));
check("no Root stands before any absence", roots().length === 0);
const purifiedSnapshot = new Set(allTiles().filter(t => !t.cursed).map(t => t.id));
check("the purified heart stands", purifiedSnapshot.size >= 7, `pure=${purifiedSnapshot.size}`);
const purifiedIntact = () => [...purifiedSnapshot].every(id => { const t = tileRow(id); return t && !t.cursed; });
// Starfall is online-only by law and no part of this
// drive: park its anchor at now so no hourly gate can
// fall a star mid-proof.
try { db.prepare("UPDATE tender_attention SET starfall_anchor_at = ?, starfall_seen_at = ? WHERE owner_key = ?").run(Date.now(), Date.now(), ownerKey); } catch {}

function makeAwoken(name, element, power) {
  const insA = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
  const parts = ["body", "arms", "head"].map(cat => {
    const id = Number(insA.run(`${name}-${cat}`, cat, power, power, element, `away-change-drive/${name}-${cat}.png`, now0).lastInsertRowid);
    return { id, name: `${name}-${cat}`, category: cat, element };
  });
  const composition = JSON.stringify(parts.map(p => ({ source_id: `db:${p.id}`, name: p.name, category: p.category, rarity: "common", power, toughness: power, element: p.element })));
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, 'away-change-drive/one.png', ?, 'tender', 'Away Tender', ?, ?)").run(name, name, composition, ownerKey, now0).lastInsertRowid);
}
function placeAwoken(awId, tile, placedAt = Date.now()) {
  db.prepare("DELETE FROM field_placements WHERE owner_key = ? AND awakened_id = ?").run(ownerKey, awId);
  const pid = Number(db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
    VALUES (?, ?, ?, ?, ?, 'defense', 0, 99, ?, ?, NULL, NULL, 0)`).run(ownerKey, awId, tile.id, placedAt, placedAt, tile.q, tile.r).lastInsertRowid);
  db.prepare("UPDATE field_placements SET grass_paid_at = ?, press_paid_at = ?, bind_paid_at = ? WHERE id = ?")
    .run(placedAt, Date.now(), Date.now(), pid);
}
// A stone Awoken: her reach is a tile and a breath
// (1 + 0.35), so stood beside one structure she can
// spend her strikes on nothing else.
const striker = makeAwoken("Stone Striker", "stone", 5);
// A tile beside `target` that is beside nothing else
// watched: not a tendril tile, not the Root's tile, and
// at distance ≥ 2 from every tile in `avoid`.
function flankTile(target, avoid) {
  const tiles = allTiles();
  const tendrilIds = new Set(tendrils().map(t => t.tileId));
  const rootIds = new Set(roots().map(t => t.tileId));
  return tiles.filter(t => hexDist(t, target) === 1 && !tendrilIds.has(t.id) && !rootIds.has(t.id)
    && avoid.every(a => hexDist(t, a) >= 2)).sort((a, b) => a.id - b.id)[0] ?? null;
}

// ── §2 The absence: five hours gone, resolved in one
// pass at the return.
console.log("§2 the away-settle at the return");
db.prepare("UPDATE away_change_state SET seen_at = seen_at - ? WHERE owner_key = ?").run(5 * 3600 * 1000, ownerKey);
const land2 = await callOk("getTerritory", {}, "the return read");
const rootRows = roots();
check("one Root is raised by the absence", rootRows.length === 1, `roots=${rootRows.length}`);
const rootTile = rootRows.length ? tileRow(rootRows[0].tileId) : null;
check("the Root stands on the deepest cursed ring", !!rootTile && rootTile.cursed === 1 && ringOf(rootTile) === deepestRing, `ring=${rootTile && ringOf(rootTile)} deepest=${deepestRing}`);
const tn2 = tendrils();
check("the tendril grew to the purified edge and presses", tn2.length === tendrilLen, `tendrils=${tn2.length} want=${tendrilLen}`);
const farTile = tn2.length ? tileRow(tn2[tn2.length - 1].tileId) : null;
check("the tendril's far end stands beside purified ground, never on it",
  !!farTile && farTile.cursed === 1 && allTiles().some(t => !t.cursed && hexDist(farTile, t) === 1));
check("every tendril tile stands on cursed ground", tn2.every(t => { const tr = tileRow(t.tileId); return tr && tr.cursed === 1; }));
check("the Root summoned dark ones at the tendril's far end", !!farTile && wanderersOn([farTile.id]) >= 1, `born=${farTile ? wanderersOn([farTile.id]) : 0}`);
check("the field cap binds the calling", db.prepare("SELECT COUNT(*) AS n FROM homeland_wanderers WHERE owner_key = ?").get(ownerKey).n <= 8);
const woundedAfter = tileRow(wounded.id);
check("the wounded frontier tile thickened to its cap", woundedAfter.curseHp === woundedAfter.curseMaxHp, `hp=${woundedAfter.curseHp} max=${woundedAfter.curseMaxHp}`);
check("no cursed tile thickened past its cap", allTiles().every(t => t.curseHp == null || t.curseMaxHp == null || t.curseHp <= t.curseMaxHp));
check("deep non-frontier ground did not thicken", tileRow(deepWatch.id).curseHp === deepWatch.curseMaxHp);
check("edge-only law: no purified tile was re-cursed", purifiedIntact());
check("the served state carries the Root and the tendril",
  !!land2.darkGrowth && land2.darkGrowth.root && land2.darkGrowth.root.tileId === rootRows[0].tileId && (land2.darkGrowth.tendrils ?? []).length === tendrilLen,
  `served=${JSON.stringify(land2.darkGrowth ?? null).slice(0, 160)}`);

// ── §3 Breaking the Root: real strikes, the calling
// stops, the whole tendril withers and pays.
console.log("§3 breaking the Root");
db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(ownerKey);
const rootFlank = flankTile(rootTile, []);
check("a flank stands beside the Root alone", !!rootFlank);
placeAwoken(striker, rootFlank);
db.prepare("UPDATE dark_roots SET hp = 12 WHERE owner_key = ?").run(ownerKey);
const packBeforeBreak = packEnergy();
let broke = false;
for (let i = 0; i < 45 && !broke; i++) {
  await callOk("getTerritory", {}, "break polling");
  broke = roots().length === 0;
  if (!broke) await sleep(2000);
}
check("the fielded Awoken's strikes broke the Root", broke);
const tnAfterBreak = tendrils();
check("the whole tendril is withering at the Root's fall", tnAfterBreak.length === tendrilLen && tnAfterBreak.every(t => t.witherAt != null), `rows=${tnAfterBreak.length} want=${tendrilLen}`);
check("the Root paid the big take into the Pack", packEnergy() - packBeforeBreak >= 12, `delta=${packEnergy() - packBeforeBreak}`);
check("the Pack's ledger speaks the Root's fell", db.prepare("SELECT COUNT(*) AS n FROM drop_notices WHERE owner_key = ? AND line LIKE '%Root%'").get(ownerKey).n >= 1);
const heartTiles = allTiles().filter(t => ringOf(t) <= 2).map(t => t.id);
check("the summoning stopped with the Root (no births at the heart)", wanderersOn(heartTiles) === 0, `heart=${wanderersOn(heartTiles)}`);
const packBeforeWither = packEnergy();
db.prepare("UPDATE dark_tendrils SET wither_at = 1000 WHERE owner_key = ?").run(ownerKey);
await callOk("getTerritory", {}, "wither read");
check("the withered tendril died on its span", tendrils().length === 0, `left=${tendrils().length}`);
check("the withered tiles paid their takes where they fell", packEnergy() - packBeforeWither >= 3 * tendrilLen, `delta=${packEnergy() - packBeforeWither}`);
check("edge-only law still holds after the Root's fall", purifiedIntact());

// ── §4 A second absence: a new Root, a regrown tendril,
// and the sever.
console.log("§4 the sever");
db.prepare("UPDATE away_change_state SET seen_at = seen_at - ? WHERE owner_key = ?").run(5 * 3600 * 1000, ownerKey);
await callOk("getTerritory", {}, "the second return");
check("a new Root stands after the second absence — and still only one", roots().length === 1, `roots=${roots().length}`);
check("the tendril regrew to the edge", tendrils().length === tendrilLen, `tendrils=${tendrils().length}`);
db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(ownerKey);
const ord1 = tendrils().find(t => t.ord === 1);
const ord1Tile = tileRow(ord1.tileId);
const rootTile4 = tileRow(roots()[0].tileId);
const ord2Tile = tileRow(tendrils().find(t => t.ord === 2).tileId);
const severFlank = flankTile(ord1Tile, [rootTile4, ord2Tile]);
check("a flank stands beside the first tendril tile alone", !!severFlank);
placeAwoken(striker, severFlank);
db.prepare("UPDATE dark_tendrils SET hp = 8 WHERE id = ?").run(ord1.id);
const packBeforeSever = packEnergy();
let severed = false;
for (let i = 0; i < 45 && !severed; i++) {
  await callOk("getTerritory", {}, "sever polling");
  severed = !tendrils().some(t => t.ord === 1);
  if (!severed) await sleep(2000);
}
check("the fielded Awoken's strikes cut the tendril tile", severed);
const beyondRows = tendrils().filter(t => t.ord > 1);
check("everything beyond the cut is withering", beyondRows.length === tendrilLen - 1 && beyondRows.every(t => t.witherAt != null), `beyond=${beyondRows.length}`);
check("the stump's Root stands on after the sever", roots().length === 1);
check("the cut tile paid its take where it fell", packEnergy() - packBeforeSever >= 3, `delta=${packEnergy() - packBeforeSever}`);
const packBeforeWither2 = packEnergy();
db.prepare("UPDATE dark_tendrils SET wither_at = 1000 WHERE owner_key = ?").run(ownerKey);
await callOk("getTerritory", {}, "sever wither read");
check("the far side died on its wither span", tendrils().length === 0, `left=${tendrils().length}`);
check("the withered far side paid its takes", packEnergy() - packBeforeWither2 >= 3 * (tendrilLen - 1), `delta=${packEnergy() - packBeforeWither2}`);

// ── §5 The online creep: the Root's anchors aged, one
// present read regrows and summons on the slow measures.
console.log("§5 the online creep");
db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(ownerKey);
db.prepare("UPDATE dark_roots SET growth_anchor_at = ?, summon_anchor_at = ? WHERE owner_key = ?")
  .run(Date.now() - (tendrilLen + 2) * 3600 * 1000, Date.now() - 25 * 60 * 1000, ownerKey);
const land5 = await callOk("getTerritory", {}, "creep read");
const tn5 = tendrils();
check("the creep regrew the tendril to the edge", tn5.length === tendrilLen, `tendrils=${tn5.length} want=${tendrilLen}`);
const far5 = tn5.length ? tileRow(tn5[tn5.length - 1].tileId) : null;
check("the creep summoned at the far end", !!far5 && wanderersOn([far5.id]) >= 1, `born=${far5 ? wanderersOn([far5.id]) : 0}`);
check("the served state carries the regrown tendril", (land5.darkGrowth?.tendrils ?? []).length === tendrilLen);
check("edge-only law holds at the drive's end", purifiedIntact());

console.log(`\nAWAY-CHANGE DRIVE: ${checks - failures}/${checks} checks passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
