// Drive: THE GRASS PROGRAMME (personality foundation,
// Nigel 2026-11-17). Proves the life record + profile and
// the drift-with-work engine on a scratch fixture DB:
//   (a) an idle grass-able Awokin relocates itself to a
//       below-mark tile, paying the standing march price,
//       and sprigs grow there under the garden clock; when
//       the tile reaches the mark it moves to the next;
//   (b) a non-qualifier (Root sum < 2) never joins — no
//       claim, no march, no growth under it;
//   (c) one tile below the mark holds the stage; every
//       eligible tile at the mark raises it 10 → 20 and
//       the work continues toward 20;
//   (d) a player order takes a participant out of the
//       programme at once (claim released at the next
//       settle) and it rejoins after the order completes;
//   (e) with the purse at the commons line (half the
//       purse's standing measure) no programme travel is
//       paid — the Awokin tends where it stands instead;
//   (f) presence off: the slow gear settles no programme
//       movement, no claim, no spend; presence restored,
//       the programme acts again.
// Server-side behaviour only — this build changes no
// surface, so there is no browser section. Run after
// `npm run build` (the drive boots server/dist).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-grass-programme-"));
process.env.PORT = "39993";
// The slow gear at 3s so §F can watch whole clock ticks
// pass with the Tender absent.
process.env.MASTER_CLOCK_TICK_MS = "3000";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

const BASE = "http://127.0.0.1:39993";
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

const claim = await callOk("claimTender", { password: "grass-programme-drive-password", tenderName: "Programme Tender" });
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

const land0 = await callOk("ensureFirstSeed", {}, "first seed");
for (let i = 0; i < 6; i++) {
  db.prepare("UPDATE territory_tiles SET cursed = 0 WHERE owner_key = ?").run(ownerKey);
  const land = await callOk("getTerritory", {}, "cleanse");
  const rows = db.prepare("SELECT COUNT(*) AS n, SUM(cursed) AS c FROM territory_tiles WHERE owner_key = ?").get(ownerKey);
  if (land.tiles.length >= 19 && Number(rows.c) === 0) break;
}
db.prepare("UPDATE territory_tiles SET cursed = 0 WHERE owner_key = ?").run(ownerKey);
db.prepare("UPDATE tender_resources SET energy = 900 WHERE owner_key = ?").run(ownerKey);
const land = await callOk("getTerritory", {}, "cleansed land");
const tiles = land.tiles;
check("the cleansed land stands whole", tiles.length >= 19, `tiles=${tiles.length}`);

// ── Fixture helpers ─────────────────────────────────────
const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
const ringOf = (t) => Math.max(Math.abs(t.q), Math.abs(t.r), Math.abs(t.q + t.r));
const tenderTileId = land.tender?.tileId;
const ground = tiles.filter(t => t.id !== tenderTileId);
const A = ground.filter(t => ringOf(t) === 2).sort((x, y) => x.id - y.id)[0] ?? ground[0]; // the participant's standing
const B = ground.filter(t => dist(A, t) === 2).sort((x, y) => x.id - y.id)[0]; // §A's first work
const C = ground.filter(t => t.id !== B.id && dist(A, t) >= 3).sort((x, y) => dist(B, x) - dist(B, y) || x.id - y.id)[0] ?? ground.filter(t => t.id !== B.id && dist(A, t) === 2).sort((x, y) => x.id - y.id)[0];
const D = ground.filter(t => ringOf(t) === 3).sort((x, y) => dist(A, y) - dist(A, x) || x.id - y.id)[0]
  ?? ground.reduce((best, t) => dist(A, t) > dist(A, best) ? t : best, ground[0]); // the bystander's interior tile
check("fixture tiles chosen", !!(A && B && C && D && B.id !== C.id), `A=${A?.id} B=${B?.id} C=${C?.id} D=${D?.id}`);

function makeAwoken(name, partSpecs) {
  const insA = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 3, 3, ?, ?, 'image/png', ?)");
  const parts = partSpecs.map(([n, c, el]) => ({ id: Number(insA.run(n, c, el, `grass-programme-drive/${n}.png`, now0).lastInsertRowid), name: n, category: c, element: el }));
  const composition = JSON.stringify(parts.map(p => ({ source_id: `db:${p.id}`, name: p.name, category: p.category, rarity: "common", power: 3, toughness: 3, element: p.element })));
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, 'grass-programme-drive/one.png', ?, 'tender', 'Programme Tender', ?, ?)").run(name, name, composition, ownerKey, now0).lastInsertRowid);
}
function placeAwoken(awId, tile, placedAt = Date.now()) {
  db.prepare("DELETE FROM field_placements WHERE owner_key = ? AND awakened_id = ?").run(ownerKey, awId);
  const pid = Number(db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
    VALUES (?, ?, ?, ?, ?, 'defense', 0, 99, ?, ?, NULL, NULL, 0)`).run(ownerKey, awId, tile.id, placedAt, placedAt, tile.q, tile.r).lastInsertRowid);
  db.prepare("UPDATE field_placements SET grass_paid_at = ?, press_paid_at = ?, bind_paid_at = ? WHERE id = ?")
    .run(placedAt, Date.now(), Date.now(), pid);
}
const energyNow = () => db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(ownerKey).energy;
const markNow = () => (db.prepare("SELECT mark FROM grass_programme_state WHERE owner_key = ?").get(ownerKey) ?? {}).mark ?? null;
const recordOf = (awId) => db.prepare("SELECT profile_json AS profileJson, grass_tile_id AS grassTileId FROM awokin_life_records WHERE owner_key = ? AND awakened_id = ?").get(ownerKey, awId) ?? null;
const placementOf = (awId) => db.prepare("SELECT tile_id AS tileId, march_path AS marchPath FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(ownerKey, awId) ?? null;
const sprigsOf = (tileId) => db.prepare("SELECT sprigs FROM territory_tiles WHERE id = ?").get(tileId).sprigs;
const setSprigs = (tileId, v) => db.prepare("UPDATE territory_tiles SET sprigs = ? WHERE id = ?").run(v, tileId);
const setAllSprigs = (v) => db.prepare("UPDATE territory_tiles SET sprigs = ? WHERE owner_key = ?").run(v, ownerKey);
const clearClaims = () => db.prepare("UPDATE awokin_life_records SET grass_tile_id = NULL WHERE owner_key = ?").run(ownerKey);

const QUALIFIER = makeAwoken("Mosswarden", [["Moss Body", "body", "root"], ["Moss Arms", "arms", "root"], ["Stone Crown", "head", "stone"]]); // Root sum 2 — grass-able
const BYSTANDER = makeAwoken("Standfast", [["Stone Body", "body", "stone"], ["Stone Arms", "arms", "stone"], ["Stone Crown II", "head", "stone"]]); // Root sum 0 — never joins
placeAwoken(QUALIFIER, A);

// ── §A — relocation, the march's price, growth, moving on
console.log("§A — the programme relocates an idle grass-able Awokin");
setAllSprigs(10); setSprigs(B.id, 0); setSprigs(C.id, 5);
const energyBefore = energyNow();
await callOk("getTerritory", {}, "programme beat one");
const recA = recordOf(QUALIFIER);
check("the life record stands, profile read off the parts", !!recA && JSON.parse(recA.profileJson).grassAble === true && JSON.parse(recA.profileJson).sums.root >= 2,
  recA ? recA.profileJson : "no record");
check("the claim is the nearest below-mark tile", recA && recA.grassTileId === B.id, `claim=${recA?.grassTileId} B=${B.id}`);
const plA = placementOf(QUALIFIER);
const roadA = plA && plA.marchPath ? JSON.parse(plA.marchPath) : null;
check("the participant marches by the road law to its claim", !!roadA && roadA[roadA.length - 1] === B.id, `march=${plA?.marchPath}`);
const stepsA = roadA ? roadA.length - 1 : 0;
check("the travel paid the standing per-hex march price (3/hex at power 9)", energyBefore - energyNow() === stepsA * 3,
  `delta=${energyBefore - energyNow()} steps=${stepsA}`);
db.prepare("UPDATE field_placements SET march_ends = 1 WHERE owner_key = ? AND awakened_id = ?").run(ownerKey, QUALIFIER);
await callOk("getTerritory", {}, "the march lands");
const plA2 = placementOf(QUALIFIER);
check("the march lands it on its claim", plA2 && plA2.tileId === B.id && !plA2.marchPath, `tile=${plA2?.tileId}`);
const twoHoursAgo = Date.now() - 2 * 3_600_000;
db.prepare("UPDATE field_placements SET placed_at = ?, grass_paid_at = ? WHERE owner_key = ? AND awakened_id = ?")
  .run(twoHoursAgo, twoHoursAgo, ownerKey, QUALIFIER);
const landA = await callOk("getTerritory", {}, "the garden clock carries the standing");
const tileB = landA.tiles.find(t => t.id === B.id);
check("sprigs grow on the tended tile under the standing garden clock", Math.floor(tileB.sprigs) >= 10, `sprigs=${tileB.sprigs}`);
await callOk("getTerritory", {}, "the tile at the mark releases its tender");
const recA2 = recordOf(QUALIFIER);
const plA3 = placementOf(QUALIFIER);
const roadA2 = plA3 && plA3.marchPath ? JSON.parse(plA3.marchPath) : null;
check("at the mark it moves to the next below-mark tile", recA2 && recA2.grassTileId === C.id && !!roadA2 && roadA2[roadA2.length - 1] === C.id,
  `claim=${recA2?.grassTileId} C=${C.id} march=${plA3?.marchPath}`);

// ── §B — a non-qualifier never joins ────────────────────
console.log("§B — Root below 2 never joins");
placeAwoken(BYSTANDER, D);
setSprigs(D.id, 0);
await callOk("getTerritory", {}, "bystander beat one");
await callOk("getTerritory", {}, "bystander beat two");
const recB = recordOf(BYSTANDER);
const plB = placementOf(BYSTANDER);
check("the bystander's record stands and reads not grass-able", !!recB && JSON.parse(recB.profileJson).grassAble === false, recB?.profileJson ?? "no record");
check("the bystander holds no claim and never marches", recB && recB.grassTileId === null && plB && !plB.marchPath && plB.tileId === D.id,
  `claim=${recB?.grassTileId} march=${plB?.marchPath}`);
check("no grass grows under a non-qualifier", Math.floor(sprigsOf(D.id)) === 0, `sprigs=${sprigsOf(D.id)}`);

// ── §C — the stage mark rises ───────────────────────────
console.log("§C — the stage mark");
db.prepare("UPDATE field_placements SET march_path = NULL, march_since = NULL, march_ends = NULL WHERE owner_key = ? AND awakened_id = ?").run(ownerKey, QUALIFIER);
placeAwoken(QUALIFIER, A);
clearClaims();
setAllSprigs(10); setSprigs(B.id, 9);
await callOk("getTerritory", {}, "one tile below the mark");
check("one tile below the mark holds the stage at 10", markNow() === 10, `mark=${markNow()}`);
setSprigs(B.id, 10);
let roseTo = markNow();
for (let i = 0; i < 3 && roseTo !== 20; i++) {
  setAllSprigs(10);
  await callOk("getTerritory", {}, "every eligible tile at the mark");
  roseTo = markNow();
}
check("every eligible tile at the mark raises the stage to 20", roseTo === 20, `mark=${roseTo}`);
const recC = recordOf(QUALIFIER);
check("the work continues toward the new mark (a claim stands)", recC && recC.grassTileId !== null, `claim=${recC?.grassTileId}`);

// ── §D — orders outrank; the programme resumes after ────
console.log("§D — orders outrank the programme");
// One piece of work only: tile F below the stage, all else above it.
const F = C;
setAllSprigs(25); setSprigs(F.id, 0);
clearClaims();
placeAwoken(QUALIFIER, A);
await callOk("getTerritory", {}, "the claim is taken");
db.prepare("UPDATE field_placements SET march_ends = 1 WHERE owner_key = ? AND awakened_id = ?").run(ownerKey, QUALIFIER);
await callOk("getTerritory", {}, "the programme march lands");
const recD0 = recordOf(QUALIFIER);
const plD0 = placementOf(QUALIFIER);
check("the participant stands tending its claim", recD0 && recD0.grassTileId === F.id && plD0 && plD0.tileId === F.id,
  `claim=${recD0?.grassTileId} tile=${plD0?.tileId} F=${F.id}`);
const G = B;
await callOk("setMarch", { awakenedId: QUALIFIER, tileId: G.id }, "the Tender orders a march");
await callOk("getTerritory", {}, "the order settles");
const recD1 = recordOf(QUALIFIER);
const plD1 = placementOf(QUALIFIER);
const roadD = plD1 && plD1.marchPath ? JSON.parse(plD1.marchPath) : null;
check("the order takes it out of the programme at once — claim released, the player's march stands",
  recD1 && recD1.grassTileId === null && !!roadD && roadD[roadD.length - 1] === G.id,
  `claim=${recD1?.grassTileId} march=${plD1?.marchPath}`);
db.prepare("UPDATE field_placements SET march_ends = 1 WHERE owner_key = ? AND awakened_id = ?").run(ownerKey, QUALIFIER);
// The ground it lands on is the only work left, so whenever
// the landing settles against the programme's beat, the
// rejoining claim is the ground under its feet.
setSprigs(F.id, 25); setSprigs(G.id, 0);
await callOk("getTerritory", {}, "the ordered march lands");
await callOk("getTerritory", {}, "idle again");
const recD2 = recordOf(QUALIFIER);
check("after the order completes it rejoins — tending where it stands", recD2 && recD2.grassTileId === G.id,
  `claim=${recD2?.grassTileId} G=${G.id}`);

// ── §E — the commons line ───────────────────────────────
console.log("§E — the commons");
// The purse's standing measure, served by the energy door.
const purse = await callOk("getEnergy", {}, "the measure");
const maxEnergy = purse.maxEnergy;
check("the energy door serves the purse's standing measure", typeof maxEnergy === "number" && maxEnergy > 0, `max=${maxEnergy}`);
const line = Math.ceil(maxEnergy / 2);
db.prepare("UPDATE tender_resources SET energy = ? WHERE owner_key = ?").run(line, ownerKey);
const H = A, I = C;
setAllSprigs(25); setSprigs(I.id, 0);
clearClaims();
placeAwoken(QUALIFIER, H);
const energyAtLine = energyNow();
await callOk("getTerritory", {}, "at the commons line");
const recE = recordOf(QUALIFIER);
const plE = placementOf(QUALIFIER);
check("at the line no programme travel is paid and none is marched", plE && !plE.marchPath && energyNow() === energyAtLine && recE && recE.grassTileId === null,
  `march=${plE?.marchPath} energy ${energyAtLine}->${energyNow()} claim=${recE?.grassTileId}`);
// The drift-and-do fallback: standing on the work itself,
// it takes the claim and tends in place — still no spend.
placeAwoken(QUALIFIER, I);
await callOk("getTerritory", {}, "standing on the work");
const recE2 = recordOf(QUALIFIER);
const plE2 = placementOf(QUALIFIER);
check("it tends where it stands — the claim is its own tile, nothing spent",
  recE2 && recE2.grassTileId === I.id && plE2 && !plE2.marchPath && energyNow() === energyAtLine,
  `claim=${recE2?.grassTileId} march=${plE2?.marchPath} energy=${energyNow()}`);

// ── §F — presence ───────────────────────────────────────
console.log("§F — presence rests the programme");
db.prepare("UPDATE tender_resources SET energy = 900 WHERE owner_key = ?").run(ownerKey);
const K = D;
setAllSprigs(25); setSprigs(K.id, 0);
clearClaims();
placeAwoken(QUALIFIER, A);
db.prepare("UPDATE tender_resources SET last_seen_at = ? WHERE owner_key = ?").run(Date.now() - 10 * 60_000, ownerKey);
await sleep(8000); // whole slow-gear ticks pass, Tender absent; no API calls (they would stamp presence)
const recF = recordOf(QUALIFIER);
const plF = placementOf(QUALIFIER);
check("absent: no claim, no march, no spend is settled", recF && recF.grassTileId === null && plF && !plF.marchPath && energyNow() === 900,
  `claim=${recF?.grassTileId} march=${plF?.marchPath} energy=${energyNow()}`);
db.prepare("UPDATE tender_resources SET last_seen_at = ? WHERE owner_key = ?").run(Date.now(), ownerKey);
await callOk("getTerritory", {}, "present again");
const recF2 = recordOf(QUALIFIER);
const plF2 = placementOf(QUALIFIER);
const roadF = plF2 && plF2.marchPath ? JSON.parse(plF2.marchPath) : null;
check("present again: the programme takes up the work", recF2 && recF2.grassTileId === K.id && !!roadF && roadF[roadF.length - 1] === K.id,
  `claim=${recF2?.grassTileId} march=${plF2?.marchPath} K=${K.id}`);

console.log(`\nGRASS PROGRAMME DRIVE: ${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
