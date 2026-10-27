// THE TOKEN STRIP — DRIVE (Nigel, 2026-10-23: "Get rid of all
// the letters and skull UI. They have been stuck on my map for
// days." + "I have never seen the true face of the Fray since I
// added the animated one anywhere. Is that going to come in
// now?" + the diagnosis's constructive half).
// Boots the real server on a scratch DATA_DIR and proves:
//   §S THE STRIP, at the source: no battle-mirror unit chips
//      (battleUnits / simUnits) render anywhere in Territory,
//      no letter chips for an arrived column, no 💀 anywhere in
//      Territory, the mirror's doors and machinery are gone.
//   §F THE FRAY'S FACE: the homeland SVG face resolves to the
//      walking cycle outright; the workshop upload still wins
//      on the HTML surfaces (FrayFaceImg) and in frayFaceSrc.
//   §L THE READ LOOP stands in Territory on the battle's own
//      beat (2800 ms) and reads through refreshTerritory.
//   §A THE STUCK STATE CLEARS: an 'arrived' column (the stuck
//      shape on Nigel's live map) LANDS — its roster stands as
//      real wanderers on the cursed hexes beside its target,
//      its open call closes; a corrupted seed whose guard
//      stands stays corrupted, and frees to 'fallen' when the
//      guard is gone; a guardless corrupted seed frees on the
//      same read; a marching column is untouched.
//   §C STRIKE WITNESS: getTerritory serves placement strikes
//      in the weaponStrike record's shape, struck by the one
//      real fight inside the read.
//   §T THE THORNS: a Thorn Wall building's bite fells a
//      dark that enters its hex inside settleHomelandBattle.
//      (The edge-Thorns half — Edge Works' thorns holding a
//      crossing dark for a beat — went with that system,
//      removed whole, Nigel 2026-10-27.)
//   §M THE MID-MUSTER LAW: a follower a read has just
//      mustered onto a march ANSWERS from her ground in that
//      same battle settle — her strikes are witnessed — while
//      her march still stands.
// Run: node scripts/drive-token-strip.mjs  (server dist built)
import { join } from "node:path";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const OUT = "/home/hatch/workspace/token-strip-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(OUT, "data-"));
process.env.PORT = "3994";
process.env.WORKSHOP_PASSWORD = "strip-harness";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;
process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3994";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

/* ══ §S + §F + §L — THE SOURCE PROOFS ═══════════════════════ */
console.log("§S the strip, at the source");
const terr = readFileSync("client/src/Territory.tsx", "utf8");
const face = readFileSync("client/src/EnemyFace.tsx", "utf8");
const art = readFileSync("client/src/enemyArt.ts", "utf8");
ok("no battleUnits are rendered or held", !/battleUnits\.map|setBattleUnits|useState<typeof simUnits>/.test(terr));
ok("no simUnits are rendered or held", !/simUnits\.map|setSimUnits/.test(terr));
ok("no skull stands anywhere in Territory", !terr.includes("💀"));
ok("no letter chips for a column's kinds", !/=== "fray" \? "F"/.test(terr) && !/"U" : m\.k/.test(terr));
ok("the mirror's doors are gone (no startBattle / startSim / looseSimBlade)",
  !/const startBattle|const startSim|looseSimBlade|const doInitiativePhase|const onWaveCleared/.test(terr));
ok("the mirror's resolution write-back is gone from this face (no resolveBattle call in Territory's wave path)",
  !/onWaveCleared|onBattleLost/.test(terr));
ok("the corrupted seed is drawn as a seed in the dark's violet ring, not a skull",
  terr.includes('stroke="#b04df0"') && terr.includes("held by the dark"));
console.log("§F the Fray's animated face");
{
  const svgFn = face.slice(face.indexOf("export function FrayFaceSvgImage"), face.indexOf("export function FrayFaceSvgImage") + 900);
  ok("the homeland SVG face IS the walking cycle", svgFn.includes("FRAY_WALK_FRAMES[frayWalkFrameAt(Date.now())]"), svgFn.slice(0, 200));
  ok("the homeland SVG face never consults the live upload", !svgFn.includes("liveUrl") && !svgFn.includes("frayFaceSrc"), svgFn.slice(0, 200));
  const imgFn = face.slice(face.indexOf("export function FrayFaceImg"), face.indexOf("export function FrayFaceImg") + 500);
  ok("the HTML face still lets the workshop upload win", imgFn.includes("liveUrl ?? FRAY_WALK_FRAMES"), imgFn.slice(0, 200));
  const resolver = art.slice(art.indexOf("export function frayFaceSrc"), art.indexOf("export function frayFaceSrc") + 300);
  ok("frayFaceSrc still resolves upload-first for the surfaces that ask it", resolver.includes('art?.["fray"]?.url') && resolver.indexOf("if (live) return live") > 0);
  ok("the five frames of the cycle are the bundle's own", art.includes("fray-walk/fray-walk-5.png"));
}
console.log("§L the read loop");
ok("the loop stands on the battle's own beat", terr.includes("const HOMELAND_BATTLE_BEAT_MS = 2800"));
ok("the loop reads through refreshTerritory and starts no fight of its own",
  terr.includes("readLoopBusyRef") && terr.includes("}, HOMELAND_BATTLE_BEAT_MS);"));
ok("placement strikes are noted on every read", terr.includes("notePlacementStrikes(refreshed.strikes, refreshed.tiles)")
  && terr.includes("notePlacementStrikes(t.strikes, t.tiles)"));

/* ══ server boot + fixtures ════════════════════════════════ */
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

async function claim(name) {
  const c = await call("claimTender", { password: "strip-drive-password", tenderName: name });
  const id = db.prepare("SELECT id FROM tenders WHERE code = ?").get(c.tender.code).id;
  const ownerKey = `tender:${id}`;
  const now = Date.now();
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, now);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(ownerKey, now);
  // The choosing opens after the first three wakes (the
  // claim-first build at HEAD) — wake three before choosing.
  for (let i = 0; i < 3; i++) seedAwokin(ownerKey, name, `${name} Wake ${i + 1}`, "root", 1, 1);
  await call("chooseClass", { classKey: "warden" }, c.token);
  return { token: c.token, ownerKey };
}
function seedTile(ownerKey, q, r, cursed, element = "root") {
  return Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(ownerKey, q, r, element, cursed, Date.now()).lastInsertRowid);
}
function seedAwokin(ownerKey, tenderName, name, element, power = 3, toughness = 3) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)").run(`${name} ${cat}`, cat, power, toughness, element, `strip/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power, toughness, element });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)").run(name, name, `strip/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
function placeAwokin(ownerKey, awakenedId, tileId, q, r, opts = {}) {
  const info = db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    ownerKey, awakenedId, tileId, Date.now(), Date.now(),
    opts.stance ?? "defense", opts.follow ? 1 : 0, opts.hp ?? 99, q, r,
    opts.shield ?? 99, opts.shield ?? 99, opts.ordered ? 1 : 0);
  return Number(info.lastInsertRowid);
}
function seedDark(ownerKey, tileId, kind, q, r, opts = {}) {
  const info = db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    ownerKey, tileId, kind, Date.now(), opts.hp ?? 3, q, r, opts.power ?? 1, opts.lvl ?? 1, 0);
  return Number(info.lastInsertRowid);
}
const darkRow = (id) => db.prepare("SELECT * FROM homeland_wanderers WHERE id = ?").get(id);
async function prime(ownerKey, token) { await call("getTerritory", {}, token); }
async function advance(ownerKey, token, ms) {
  db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now() - ms, ownerKey);
  return call("getTerritory", {}, token);
}

/* ══ §A THE STUCK STATE CLEARS ═════════════════════════════ */
console.log("§A an arrived column lands as real wanderers; the corrupted seed's exit");
{
  const G = await claim("Stuck Map");
  seedTile(G.ownerKey, 0, 0, 0);
  seedTile(G.ownerKey, 2, 0, 1); seedTile(G.ownerKey, 4, 0, 1);
  seedTile(G.ownerKey, 3, 1, 1); seedTile(G.ownerKey, 3, -1, 1);
  const target = seedTile(G.ownerKey, 3, 0, 0);
  const now = Date.now();
  const colId = Number(db.prepare(`INSERT INTO incursion_columns (owner_key, target_tile_id, target_kind, kind, size, power, state, origin_q, origin_r, spawned_at, arrives_at)
    VALUES (?, ?, 'hex', 'raid', 6, 1, 'arrived', 12, 0, ?, ?)`).run(G.ownerKey, target, now - 86400000, now - 86400000).lastInsertRowid);
  const callId = Number(db.prepare(`INSERT INTO bastion_calls (owner_key, host_tender_id, column_id, seed_id, kind, state, created_at, join_key)
    VALUES (?, ?, ?, NULL, 'bastion', 'open', ?, 'KEYAAA')`).run(G.ownerKey, Number(G.ownerKey.replace("tender:", "")), colId, now).lastInsertRowid);
  // The siege: a corrupted seed and its arrived guard column.
  const seedTileId = seedTile(G.ownerKey, -3, 0, 1);
  seedTile(G.ownerKey, -2, 0, 1); seedTile(G.ownerKey, -4, 0, 1);
  seedTile(G.ownerKey, -3, 1, 1); seedTile(G.ownerKey, -3, -1, 1);
  const seedId = Number(db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at) VALUES (?, ?, 1, 'corrupted', ?)").run(G.ownerKey, seedTileId, now - 86400000).lastInsertRowid);
  const siegeId = Number(db.prepare(`INSERT INTO incursion_columns (owner_key, target_tile_id, target_kind, kind, size, power, state, origin_q, origin_r, spawned_at, arrives_at)
    VALUES (?, ?, 'seed', 'siege', 4, 1, 'arrived', -12, 0, ?, ?)`).run(G.ownerKey, seedTileId, now - 86400000, now - 86400000).lastInsertRowid);
  // A guardless corrupted seed — its column died at the Table long ago.
  const orphanTile = seedTile(G.ownerKey, -6, 3, 1);
  const orphanSeedId = Number(db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at) VALUES (?, ?, 1, 'corrupted', ?)").run(G.ownerKey, orphanTile, now - 86400000).lastInsertRowid);
  // A marching column, not yet due — must be left exactly as it stands.
  const marchId = Number(db.prepare(`INSERT INTO incursion_columns (owner_key, target_tile_id, target_kind, kind, size, power, state, origin_q, origin_r, spawned_at, arrives_at)
    VALUES (?, ?, 'hex', 'raid', 5, 1, 'marching', 12, 3, ?, ?)`).run(G.ownerKey, target, now, now + 3600000).lastInsertRowid);

  const st = await call("getTerritory", {}, G.token);
  const col = db.prepare("SELECT * FROM incursion_columns WHERE id = ?").get(colId);
  ok("the stuck 'arrived' column has landed", col.state === "landed", col.state);
  const landed = db.prepare("SELECT * FROM homeland_wanderers WHERE owner_key = ? AND column_id = ?").all(G.ownerKey, colId);
  ok("its roster stands as real wanderers (6 of the roster's kinds)", landed.length === 6, `got ${landed.length}`);
  const hostTiles = new Set([target, ...db.prepare("SELECT id FROM territory_tiles WHERE owner_key = ? AND cursed = 1 AND ((q = 2 AND r = 0) OR (q = 4 AND r = 0) OR (q = 3 AND r = 1) OR (q = 3 AND r = -1))").all(G.ownerKey).map(r => r.id)]);
  ok("they stand on the cursed hexes beside the target (the chips' own hexes)",
    landed.every(w => hostTiles.has(w.tile_id)), JSON.stringify(landed.map(w => w.tile_id)));
  const kinds = landed.map(w => w.kind).sort().join(",");
  ok("the roster's kinds came through whole (3 fray, 1 tangle, 2 unraveler)", kinds === "fray,fray,fray,tangle,unraveler,unraveler", kinds);
  ok("the map serves them as wanderers with drawn faces' data", st.wanderers.some(w => landed.some(l => l.id === w.id)));
  const callRow = db.prepare("SELECT * FROM bastion_calls WHERE id = ?").get(callId);
  ok("the open call against the landed column is closed", callRow.state === "landed", callRow.state);

  const siege = db.prepare("SELECT * FROM incursion_columns WHERE id = ?").get(siegeId);
  const guard = db.prepare("SELECT * FROM homeland_wanderers WHERE owner_key = ? AND column_id = ?").all(G.ownerKey, siegeId);
  ok("the siege column landed too, its guard standing", siege.state === "landed" && guard.length === 4, `${siege.state} / ${guard.length}`);
  let seed = db.prepare("SELECT * FROM star_seeds WHERE id = ?").get(seedId);
  ok("the corrupted seed stays corrupted while its guard stands", seed.state === "corrupted", seed.state);
  const orphan = db.prepare("SELECT * FROM star_seeds WHERE id = ?").get(orphanSeedId);
  ok("the guardless corrupted seed has already exited to fallen", orphan.state === "fallen", orphan.state);
  const march = db.prepare("SELECT * FROM incursion_columns WHERE id = ?").get(marchId);
  ok("the marching column is untouched", march.state === "marching"
    && db.prepare("SELECT COUNT(*) AS n FROM homeland_wanderers WHERE column_id = ?").get(marchId).n === 0, march.state);

  // The guard falls (the living battle's work, proven in
  // drive-battle; here the ledger is emptied by hand to reach
  // the exit itself) — the seed must free on the next read.
  db.prepare("DELETE FROM homeland_wanderers WHERE column_id = ?").run(siegeId);
  await call("getTerritory", {}, G.token);
  seed = db.prepare("SELECT * FROM star_seeds WHERE id = ?").get(seedId);
  ok("with its guard gone, the corrupted seed exits to fallen", seed.state === "fallen", seed.state);
}

/* ══ §C THE STRIKE WITNESS ═════════════════════════════════ */
console.log("§C placement strikes are witnessed from the one real fight");
{
  const G = await claim("Strike Witness");
  seedTile(G.ownerKey, 0, 0, 0);
  const t = seedTile(G.ownerKey, 2, 0, 1);
  const aw = seedAwokin(G.ownerKey, "Strike Witness", "Root Hand", "root", 3, 3);
  placeAwokin(G.ownerKey, aw, t, 2, 0, { hp: 99 });
  const dark = seedDark(G.ownerKey, t, "fray", 2, 0, { hp: 500, power: 1 });
  await prime(G.ownerKey, G.token);
  const st = await advance(G.ownerKey, G.token, 20000);
  ok("getTerritory serves a strikes witness", Array.isArray(st.strikes), typeof st.strikes);
  const mine = (st.strikes ?? []).filter(s => s.awakenedId === aw && s.wandererId === dark);
  ok("the placement's strikes were struck inside the read and witnessed", mine.length >= 1, `got ${mine.length} of ${st.strikes?.length ?? 0}`);
  ok("the record carries the weaponStrike shape, extended (from/to free points, hit, dmg, felled)",
    mine.length >= 1 && mine.every(s => s.kind === "placement" && typeof s.hit === "boolean" && typeof s.dmg === "number"
      && typeof s.felled === "boolean" && s.fromTileId === t && typeof s.fromQ === "number" && typeof s.toQ === "number"),
    JSON.stringify(mine[0]));
  ok("the Tender's own weaponStrike record rides the same read, as ever", "weaponStrike" in st);
}

/* ══ §T THE THORNS, RE-HOMED ═══════════════════════════════ */
console.log("§T the Thorn Wall's bite and the edge-Thorns' skip cost, inside settleHomelandBattle");
{
  const G = await claim("Thorn Wall Bite");
  seedTile(G.ownerKey, 0, 0, 0);
  const tB = seedTile(G.ownerKey, 1, 0, 1);
  const tC = seedTile(G.ownerKey, 2, 0, 1);
  const aw = seedAwokin(G.ownerKey, "Thorn Wall Bite", "Quiet Binder", "root", 3, 3);
  placeAwokin(G.ownerKey, aw, db.prepare("SELECT id FROM territory_tiles WHERE owner_key = ? AND q = 0 AND r = 0").get(G.ownerKey).id, 0, 0, { stance: "binding", ordered: true, hp: 99 });
  db.prepare("INSERT INTO territory_buildings (owner_key, tile_id, building_type, status, placed_at) VALUES (?, ?, 'thorn-wall', 'active', ?)").run(G.ownerKey, tB, Date.now());
  const dark = seedDark(G.ownerKey, tC, "fray", 2, 0, { hp: 1, power: 1 });
  await prime(G.ownerKey, G.token);
  ok("the dark stands whole before the window", !!darkRow(dark));
  await advance(G.ownerKey, G.token, 10000);
  ok("entering the Thorn Wall's hex felled it — the bite fires in the living battle", !darkRow(dark));
}
/* The "Edge Thorns Skip" section stood here: Edge Works'
   thorns holding a crossing dark for one beat in the living
   battle. The system is removed whole (Nigel, 2026-10-27)
   and the hold with it — the Thorn Wall building's bite
   above is the thorn law that remains. */

/* ══ §M THE MID-MUSTER LAW ═════════════════════════════════ */
console.log("§M a follower mustered by a read answers in that battle — she is not disarmed");
{
  const G = await claim("Mid Muster");
  for (const [q, r] of [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [0, 1], [0, -1], [-1, 0], [1, -1], [-1, 1]]) seedTile(G.ownerKey, q, r, 0);
  const t5 = db.prepare("SELECT id FROM territory_tiles WHERE owner_key = ? AND q = 5 AND r = 0").get(G.ownerKey).id;
  const aw = seedAwokin(G.ownerKey, "Mid Muster", "Following Root", "root", 3, 3);
  const pl = placeAwokin(G.ownerKey, aw, t5, 5, 0, { follow: true, hp: 99 });
  const dark = seedDark(G.ownerKey, t5, "fray", 5, 0, { hp: 500, power: 1 });
  await prime(G.ownerKey, G.token);
  const p0 = db.prepare("SELECT * FROM field_placements WHERE id = ?").get(pl);
  ok("the prime read mustered her onto a march", !!p0.march_path, "no march_path");
  const st = await advance(G.ownerKey, G.token, 20000);
  const mine = (st.strikes ?? []).filter(s => s.awakenedId === aw && s.wandererId === dark);
  ok("mid-muster, her strikes are witnessed — she answers while she walks", mine.length >= 1, `got ${mine.length}`);
  const p1 = db.prepare("SELECT * FROM field_placements WHERE id = ?").get(pl);
  ok("her march still stands (the battle did not land or drop it)", !!p1.march_path);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
