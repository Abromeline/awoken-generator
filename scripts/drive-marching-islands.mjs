// MARCHING ISLANDS (Nigel, 2026-11-09 19:53): "any lvl of
// air over lvl 3 may issue march orders to a floating tile
// but very very slowly. the number of tiles connected and
// the lvl of the awoken and that awokens air attunement all
// factor into the movement of a tile. base movement rate of
// a tile is 1 hex per 10 minutes. the move is gradual and
// tracked with a thin tracing, dotted line."
//
// Boots the tree's real server on a scratch DATA_DIR and
// proves the law through the real actions (quote / order /
// recall island march, read inside getTerritory) and through
// the real map in a browser (the drifted render, the dotted
// tracing, the shadow under the drift). The rate formula
// under proof (the worked proposal of 2026-11-09, as Nigel
// ruled it the same evening, 20:44 — "Slower overall",
// every proposed time doubled, the shape untouched):
//   minutes per hex = 20 × √(tiles) ÷ strength,
//   strength = (level + Air) ÷ 5, capped at 3.
// Screenshots land in ~/workspace/marching-islands-proof/.
//   node scripts/drive-marching-islands.mjs [port]
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

const ROOT = process.cwd();
const PORT = process.argv[2] ?? "3978";
const require = createRequire(join(ROOT, "package.json"));
const Database = require("better-sqlite3");
const puppeteer = createRequire("/home/hatch/workspace/tools-chrome/package.json")("puppeteer");

const OUT = "/home/hatch/workspace/marching-islands-proof";
mkdirSync(OUT, { recursive: true });
process.env.PUPPETEER_CACHE_DIR = process.env.PUPPETEER_CACHE_DIR ?? "/home/hatch/workspace/tools-chrome/.cache";
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-islands-proof-"));
process.env.PORT = PORT;
process.env.WORKSHOP_PASSWORD = "islandproof";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

await import(join(ROOT, "server/dist/index.js"));
await sleep(2500);

async function callRaw(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
async function call(action, args, token) {
  const { status, data } = await callRaw(action, args, token);
  if (status >= 300) throw new Error(`${action} -> ${status}: ${JSON.stringify(data)}`);
  return data;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
const now = Date.now();
{
  const bytes = readFileSync(join(ROOT, "client/src/assets/tenders/warden-01.png"));
  const objectId = createHash("sha256").update(bytes).digest("hex");
  const dir = join(process.env.DATA_DIR, "blobs", "objects", objectId.slice(0, 2));
  mkdirSync(dir, { recursive: true });
  const path = join(dir, objectId);
  if (!existsSync(path)) writeFileSync(path, bytes);
  const insBlob = db.prepare("INSERT INTO blob_index (key, object_id, content_type, size_bytes, created_at_ms) VALUES (?, ?, 'image/png', ?, ?) ON CONFLICT(key) DO UPDATE SET object_id = excluded.object_id");
  for (const key of ["island-walker/Sky Body.png", "island-walker/Stone Body.png", "island-walker/Stone Arms.png", "island-walker/Stone Crown.png", "island-walker/walker.png"]) {
    insBlob.run(key, objectId, bytes.length, now);
  }
}
const claim = await call("claimTender", { password: "island-proof-password", tenderName: "March Tender" });
const token = claim.token;
const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id}`;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 0, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800, class_key = 'warden', hp = 100").run(me, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(me, now);

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, spark, hp, sealed_trays, grow_points, height, z, mix_points, curse_hp, curse_max_hp, created_at) VALUES (?, ?, ?, ?, ?, 0, 10, ?, 0, ?, ?, ?, ?, ?, ?)");
function wipeWorld() {
  db.prepare("DELETE FROM territory_tiles WHERE owner_key = ?").run(me);
  db.prepare("DELETE FROM star_seeds WHERE owner_key = ?").run(me);
  db.prepare("DELETE FROM field_placements WHERE owner_key = ?").run(me);
  db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(me);
  db.prepare("DELETE FROM island_marches WHERE owner_key = ?").run(me);
}
function disc(radius, element = "neutral") {
  const ids = {};
  for (let q = -radius; q <= radius; q++) for (let r = -radius; r <= radius; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > radius) continue;
    ids[`${q},${r}`] = Number(insTile.run(me, q, r, element, 0, 0, 1, 0, null, null, null, now).lastInsertRowid);
  }
  return ids;
}
function rowAt(q, r, z) {
  return db.prepare("SELECT * FROM territory_tiles WHERE owner_key = ? AND q = ? AND r = ? AND z = ?").get(me, q, r, z);
}
function addRow(q, r, z, { element = "neutral", cursed = 0, mix = null, height = 1, sealed = 0 } = {}) {
  return Number(insTile.run(me, q, r, element, cursed, sealed, height, z, mix ? JSON.stringify(mix) : null, cursed ? 10 : null, cursed ? 10 : null, now).lastInsertRowid);
}
/** A floating tile with its cursed ground standing beneath —
 *  the shape the lift law leaves behind (the disc's plain
 *  rows at the hex give way to the cursed planes). */
function floater(q, r) {
  db.prepare("DELETE FROM territory_tiles WHERE owner_key = ? AND q = ? AND r = ? AND z IN (0, 1)").run(me, q, r);
  addRow(q, r, 0, { cursed: 1 });
  addRow(q, r, 1, { cursed: 1 });
  return addRow(q, r, 2, { element: "root", mix: { sky: 4, stone: 6, tide: 5, root: 8 } });
}
const setStand = (tileId) => db.prepare("UPDATE tender_progress SET tender_tile_id = ? WHERE owner_key = ?").run(tileId, me);
const energy = () => db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(me).energy;

/* Awoken fixtures. Level by experience: Lv 3 = 900, Lv 4 =
 * 1600, Lv 10 = 10000 (awokenLevelOf: sqrt(exp / 100)). Air
 * by the sum of the parts: plain parts count 1, an aspect
 * part counts its level. */
const insA = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
function part(name, category, element, extra = {}) {
  const id = Number(insA.run(name, category, 3, 3, element, `island-walker/${name}.png`, now).lastInsertRowid);
  return { source_id: `db:${id}`, name, category, rarity: "common", power: 3, toughness: 3, element, ...extra };
}
const skyParts = (air) => air <= 1
  ? [part("Sky Body", "body", "sky"), part("Stone Arms", "arms", "stone"), part("Stone Crown", "head", "stone")]
  : [part("Sky Body", "body", "sky"), part("Stone Arms", "arms", "stone"), part("Stone Crown", "head", "stone"),
     { source_id: "aspect:sky", name: "Sky Aspect", category: "aspect", rarity: "common", power: 3, toughness: 3, element: "sky", aspectLevel: air - 1 }];
const stoneParts = () => [part("Stone Body", "body", "stone"), part("Stone Arms", "arms", "stone"), part("Stone Crown", "head", "stone")];
function mkAwoken(name, exp, parts) {
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at, experience) VALUES (?, ?, 'island-walker/walker.png', ?, 'tender', 'March Tender', ?, ?, ?)")
    .run(name, name, JSON.stringify(parts), me, now, exp).lastInsertRowid);
}
const fieldOn = (awId, tile) => db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
  VALUES (?, ?, ?, ?, ?, 'defense', 0, 99, ?, ?, NULL, NULL, 0)`).run(me, awId, tile.id, now, now, tile.q, tile.r);
const unfield = (awId) => db.prepare("DELETE FROM field_placements WHERE awakened_id = ?").run(awId);
const placementOf = (awId) => db.prepare("SELECT * FROM field_placements WHERE awakened_id = ?").get(awId);
const tileById = (id) => db.prepare("SELECT * FROM territory_tiles WHERE id = ?").get(id);
const islandRows = () => db.prepare("SELECT * FROM island_marches WHERE owner_key = ?").all(me);

/* The world: a radius-4 disc; a LONE island at (-3, 2); a
 * joined PAIR at (3,-2)+(3,-1); the bastion seated at (4, 0),
 * outside the disc, its ring reaching (3, 0). */
wipeWorld();
disc(4);
const LONE = floater(-3, 2);
const PAIR_A = floater(3, -2);
const PAIR_B = floater(3, -1);
const bastionTileId = addRow(4, 1, 0, { element: "neutral" });
db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at, defenses, fed_energy) VALUES (?, ?, 3, 'fallen', ?, 0, 0)").run(me, bastionTileId, now);
setStand(rowAt(0, 0, 0).id);

const lv3Air = mkAwoken("Young Zephyr", 900, skyParts(1));
const lv4Stone = mkAwoken("Plain Golem", 1600, stoneParts());
const lv4Air = mkAwoken("First Zephyr", 1600, skyParts(1));
const lv10Air6 = mkAwoken("Island Master", 10000, skyParts(6));

/* ═══ §1 THE GATE ═══════════════════════════════════════════ */
console.log("§1 the gate");
fieldOn(lv3Air, tileById(LONE));
const gateLv3 = await callRaw("quoteIslandMarch", { awakenedId: lv3Air, tileId: rowAt(-1, 2, 0).id }, token);
ok("a level 3 Air Awokin is refused — the gate is level ABOVE 3",
  gateLv3.status >= 300 && JSON.stringify(gateLv3.data).includes("past level 3"), JSON.stringify(gateLv3.data).slice(0, 200));
unfield(lv3Air);
fieldOn(lv4Stone, tileById(LONE));
const gateStone = await callRaw("quoteIslandMarch", { awakenedId: lv4Stone, tileId: rowAt(-1, 2, 0).id }, token);
ok("a level 4 Awokin with NO Air is refused — the island answers only to Air",
  gateStone.status >= 300 && JSON.stringify(gateStone.data).includes("no Air in its parts"), JSON.stringify(gateStone.data).slice(0, 200));
unfield(lv4Stone);
fieldOn(lv4Air, tileById(LONE));
const gateOk = await call("quoteIslandMarch", { awakenedId: lv4Air, tileId: rowAt(-1, 2, 0).id }, token);
ok("a level 4 Awokin with Air 1 qualifies", gateOk.ok === true && gateOk.groupSize === 1, JSON.stringify(gateOk).slice(0, 200));

/* ═══ §2 THE QUOTE — THE THREE FACTORS ══════════════════════ */
console.log("§2 the quote — mass, level, Air");
ok("the reference island (1 tile, Lv 4 / Air 1) quotes the ruled base: a hex per 20 minutes",
  gateOk.minutesPerHex === 20 && gateOk.steps === 2 && gateOk.totalMinutes === 40, JSON.stringify(gateOk));
unfield(lv4Air);
fieldOn(lv4Air, tileById(PAIR_A));
const pairQuote = await call("quoteIslandMarch", { awakenedId: lv4Air, tileId: rowAt(1, -2, 0).id }, token);
ok("MASS: the joined pair quotes SLOWER than the lone tile for the same Awokin (√2 → 28.3 min/hex)",
  pairQuote.groupSize === 2 && pairQuote.minutesPerHex === 28.3 && pairQuote.minutesPerHex > gateOk.minutesPerHex, JSON.stringify(pairQuote));
unfield(lv4Air);
fieldOn(lv10Air6, tileById(PAIR_A));
const masterPairQuote = await call("quoteIslandMarch", { awakenedId: lv10Air6, tileId: rowAt(1, -2, 0).id }, token);
ok("LEVEL + AIR: a Lv 10 / Air 6 Awokin quotes the same pair FASTER (strength 3 → 9.4 min/hex)",
  masterPairQuote.minutesPerHex === 9.4 && masterPairQuote.minutesPerHex < pairQuote.minutesPerHex, JSON.stringify(masterPairQuote));
unfield(lv10Air6);
fieldOn(lv10Air6, tileById(LONE));
const masterLoneQuote = await call("quoteIslandMarch", { awakenedId: lv10Air6, tileId: rowAt(-1, 2, 0).id }, token);
ok("the same master quotes the lone tile at 6.7 min/hex — the strength cap's floor, mass and strength composing",
  masterLoneQuote.minutesPerHex === 6.7, JSON.stringify(masterLoneQuote));
unfield(lv10Air6);

/* ═══ §3 THE DESTINATION MUST HOLD THE SHAPE ════════════════ */
console.log("§3 destination refusals");
fieldOn(lv4Air, tileById(LONE));
const overlapTry = await callRaw("quoteIslandMarch", { awakenedId: lv4Air, tileId: rowAt(3, -2, 0).id }, token);
ok("a destination over another island is refused in plain words",
  overlapTry.status >= 300 && JSON.stringify(overlapTry.data).includes("Another island floats there"), JSON.stringify(overlapTry.data).slice(0, 200));
const ringTry = await callRaw("quoteIslandMarch", { awakenedId: lv4Air, tileId: rowAt(3, 1, 0).id }, token);
ok("a bastion-ring destination is refused in plain words",
  ringTry.status >= 300 && JSON.stringify(ringTry.data).includes("locked to the bastion"), JSON.stringify(ringTry.data).slice(0, 200));
unfield(lv4Air);
fieldOn(lv10Air6, tileById(PAIR_A));
const offLandTry = await callRaw("quoteIslandMarch", { awakenedId: lv10Air6, tileId: rowAt(0, 4, 0).id }, token);
ok("a destination whose shape would leave the land is refused in plain words",
  offLandTry.status >= 300 && JSON.stringify(offLandTry.data).includes("runs off your land"), JSON.stringify(offLandTry.data).slice(0, 200));
unfield(lv10Air6);
fieldOn(lv4Air, tileById(LONE));

/* ═══ §4 THE ORDER, THE DRIFT, THE RIDE ═════════════════════ */
console.log("§4 order + gradual drift");
const energyBefore = energy();
const order = await call("orderIslandMarch", { awakenedId: lv4Air, tileId: rowAt(-1, 2, 0).id }, token);
ok("the order is given: 2 hexes at the ruled base rate, 40 minutes on the road",
  order.ok === true && order.steps === 2 && order.minutesPerHex === 20 && order.totalMinutes === 40, JSON.stringify(order));
ok("the price was taken at the order, exactly the quoted energy",
  energyBefore - energy() === order.energy && order.energy === gateOk.energy,
  `before=${energyBefore} after=${energy()} order=${order.energy} quote=${gateOk.energy}`);
ok("one island order stands, the group snapshotted whole",
  islandRows().length === 1 && JSON.parse(islandRows()[0].tile_ids).length === 1 && Number(islandRows()[0].awakened_id) === lv4Air);
const marchTry = await callRaw("setMarch", { awakenedId: lv4Air, tileId: rowAt(0, 0, 0).id }, token);
ok("the ordering Awokin takes no other orders while its island marches",
  marchTry.status >= 300 && JSON.stringify(marchTry.data).includes("marching its island"), JSON.stringify(marchTry.data).slice(0, 200));
// Age the order ten minutes: a quarter of its road — the
// island must stand BETWEEN hexes, a half-hex along.
db.prepare("UPDATE island_marches SET since = since - 600000, ends = ends - 600000").run();
const midLand = await call("getTerritory", {}, token);
const midMarch = (midLand.islandMarches ?? [])[0];
ok("mid-march the served island stands BETWEEN hexes (fractional anchor)",
  !!midMarch && Math.abs(midMarch.anchorQ - -2.5) < 0.06 && Math.abs(midMarch.anchorR - 2) < 0.06,
  JSON.stringify(midMarch ?? null));
ok("mid-march the member tile still holds its settled hex (the drift is the read, not the row)",
  tileById(LONE).q === -3 && tileById(LONE).r === 2 && tileById(LONE).z === 2, JSON.stringify(tileById(LONE)));

/* ═══ §5 ARRIVAL ════════════════════════════════════════════ */
console.log("§5 arrival");
db.prepare("UPDATE island_marches SET ends = ?").run(Date.now() - 1000);
const landedLand = await call("getTerritory", {}, token);
ok("at its hour the order is gone", (landedLand.islandMarches ?? []).length === 0);
const loneAfter = tileById(LONE);
ok("the island stands on the destination hexes at the same z",
  loneAfter.q === -1 && loneAfter.r === 2 && loneAfter.z === 2, JSON.stringify(loneAfter));
ok("the ordering Awokin still stands on top of its tile",
  placementOf(lv4Air)?.tile_id === LONE && placementOf(lv4Air)?.pos_q === -1 && placementOf(lv4Air)?.pos_r === 2,
  JSON.stringify(placementOf(lv4Air)));
ok("the vacated hex holds only its cursed ground rows — the leftover, not carried",
  !rowAt(-3, 2, 2) && !!rowAt(-3, 2, 0)?.cursed && !!rowAt(-3, 2, 1)?.cursed,
  JSON.stringify(db.prepare("SELECT z, cursed FROM territory_tiles WHERE owner_key = ? AND q = -3 AND r = 2 ORDER BY z").all(me)));
unfield(lv4Air);

/* ═══ §6 RECALL — THE ISLAND TURNS AT THE LAST HEX GAINED ════ */
console.log("§6 recall");
fieldOn(lv10Air6, tileById(PAIR_A));
const rider = mkAwoken("Pair Rider", 1600, stoneParts());
fieldOn(rider, tileById(PAIR_B));
const pairOrder = await call("orderIslandMarch", { awakenedId: lv10Air6, tileId: rowAt(0, -2, 0).id }, token);
ok("the pair is ordered: 3 hexes at 9.4 min/hex (28.2 minutes)",
  pairOrder.ok === true && pairOrder.steps === 3 && pairOrder.totalMinutes === 28.2, JSON.stringify(pairOrder));
// Twelve minutes in: just past one hex drifted (1.28 of
// the road) — one hex truly gained, the second not yet.
db.prepare("UPDATE island_marches SET since = since - 720000, ends = ends - 720000").run();
const recall = await call("recallIslandMarch", { awakenedId: lv10Air6 }, token);
ok("the recall turns the island at the last hex truly gained (1 hex home)",
  recall.ok === true && recall.stepsHome === 1, JSON.stringify(recall));
const pairNowA = tileById(PAIR_A), pairNowB = tileById(PAIR_B);
ok("the pair settled whole at the gained hex, membership unbroken",
  pairNowA.q === 2 && pairNowA.r === -2 && pairNowB.q === 2 && pairNowB.r === -1,
  JSON.stringify([pairNowA, pairNowB].map(t => [t.q, t.r])));
ok("the rider rode with its tile", placementOf(rider)?.tile_id === PAIR_B && placementOf(rider)?.pos_q === 2 && placementOf(rider)?.pos_r === -1,
  JSON.stringify(placementOf(rider)));
db.prepare("UPDATE island_marches SET ends = ?").run(Date.now() - 1000);
await call("getTerritory", {}, token);
const pairHomeA = tileById(PAIR_A), pairHomeB = tileById(PAIR_B);
ok("the recalled island arrives home on its own hexes",
  pairHomeA.q === 3 && pairHomeA.r === -2 && pairHomeB.q === 3 && pairHomeB.r === -1 && islandRows().length === 0,
  JSON.stringify([pairHomeA, pairHomeB].map(t => [t.q, t.r])));

/* ═══ §7 THE BROWSER: TRACE, DRIFT, SHADOW, ARRIVAL ═════════ */
console.log("§7 the browser");
// A fresh pair order for the camera: the master orders the
// pair west three hexes; the clock is then aged twelve
// minutes so the island stands mid-drift, past one hex
// along its 28.2-minute road.
const camOrder = await call("orderIslandMarch", { awakenedId: lv10Air6, tileId: rowAt(0, -2, 0).id }, token);
ok("the camera order is given", camOrder.ok === true, JSON.stringify(camOrder));
db.prepare("UPDATE island_marches SET since = since - 720000, ends = ends - 720000").run();

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
async function closeWhispers() {
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "×").forEach((b) => b.click());
  });
  await sleep(400);
}
async function openLand() {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2500);
  const door = await page.$(".deck-button");
  if (!door) throw new Error("no .deck-button on the home face");
  await door.click();
  await page.waitForFunction(() => !!window.__tenderJump && !!window.__tenderJump.pos(), { timeout: 30000 }).catch(() => {});
  await sleep(1500);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Skip");
    if (b) b.click();
  });
  await sleep(800);
  for (let i = 0; i < 3; i++) {
    const stood = await page.evaluate(() => !!document.querySelector(".return-report-overlay"));
    if (!stood) break;
    await page.mouse.click(24, 24);
    await sleep(300);
  }
  await page.evaluate(() => {
    const p = document.querySelector(".admin-popup");
    if (p) p.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await closeWhispers();
  await sleep(3500);
}
async function dataFaces() {
  return page.evaluate(() => [...document.querySelectorAll("image")].map((i) => {
    const r = i.getBoundingClientRect();
    const href = i.getAttribute("href") ?? "";
    return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2, data: href.startsWith("data:image") };
  }).filter((b) => b.w > 30 && b.data));
}
async function shadowBoxes() {
  return page.evaluate(() => [...document.querySelectorAll("ellipse")]
    .filter((e) => e.getAttribute("fill") === "rgba(0,0,0,0.32)")
    .map((e) => { const r = e.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: r.width }; }));
}

await openLand();
const traceInfo = await page.evaluate(() => {
  const g = document.querySelector(".island-trace");
  const line = g?.querySelector("polyline");
  const flag = g?.querySelector("text");
  return {
    present: !!g,
    dotted: !!line && (line.getAttribute("stroke-dasharray") ?? "").length > 0,
    thin: !!line && parseFloat(line.getAttribute("stroke-width") ?? "9") <= 2,
    flag: flag?.textContent ?? "",
    points: line?.getAttribute("points") ?? "",
  };
});
ok("the marching island's road is traced on the map — thin, dotted, to its flag",
  traceInfo.present && traceInfo.dotted && traceInfo.thin && traceInfo.flag === "⚑",
  JSON.stringify(traceInfo));
// The pair's faces mid-drift: the two EASTERNMOST blended
// faces (the lone island rides far west of them), standing
// west of their settled home and short of their destination
// — between hexes on screen.
const facesMid = await dataFaces();
const pairFacesMid = [...facesMid].sort((a, b) => b.cx - a.cx).slice(0, 2).sort((a, b) => a.cx - b.cx);
ok("the pair renders mid-drift (its two blended faces found)",
  facesMid.length >= 3 && pairFacesMid.length === 2, JSON.stringify(facesMid.map((f) => [Math.round(f.cx), Math.round(f.cy)])));
const shadowsMid = await shadowBoxes();
ok("a shadow travels under each drifting tile",
  pairFacesMid.length === 2 && pairFacesMid.every((f) => shadowsMid.some((s) => Math.abs(s.cx - f.cx) < 60)),
  JSON.stringify({ shadows: shadowsMid.map((s) => Math.round(s.cx)), faces: pairFacesMid.map((f) => Math.round(f.cx)) }));
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 2 });
await sleep(1000);
await page.screenshot({ path: join(OUT, "island-mid-drift.png") });
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });

/* (a) THE QUOTE, through the real wheel: recall the camera
 * order home through the API, settle it, then drive the
 * Tender's own road — figure → Abilities → Island March →
 * tap the destination → the quote bar with its tracing. */
db.prepare("DELETE FROM island_marches WHERE owner_key = ?").run(me);
db.prepare("UPDATE territory_tiles SET q = 3, r = -2 WHERE id = ?").run(PAIR_A);
db.prepare("UPDATE territory_tiles SET q = 3, r = -1 WHERE id = ?").run(PAIR_B);
db.prepare("UPDATE field_placements SET tile_id = ?, pos_q = 3, pos_r = -2 WHERE awakened_id = ?").run(PAIR_A, lv10Air6);
db.prepare("UPDATE field_placements SET tile_id = ?, pos_q = 3, pos_r = -1 WHERE awakened_id = ?").run(PAIR_B, rider);
await openLand();
let quoteShown = false;
try {
  // Click the master's figure (the walker art standing on
  // the pair) to open its orders wheel. An SVG image takes
  // a click only on its painted pixels, so the point is
  // hunted: sample the figure's box for a spot where the
  // topmost element is the figure's own art.
  const fig = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll("image")].filter((i) => (i.getAttribute("href") ?? "").includes("aXNsYW5kLXdhbGtl"));
    if (!imgs.length) return null;
    const boxes = imgs.map((i) => i.getBoundingClientRect()).sort((a, b) => a.y - b.y);
    const r = boxes[0];
    for (let fy = 0.15; fy <= 0.95; fy += 0.08) {
      for (let fx = 0.2; fx <= 0.85; fx += 0.08) {
        const x = r.x + r.width * fx, y = r.y + r.height * fy;
        const top = document.elementFromPoint(x, y);
        if (top && (top.getAttribute("href") ?? "").includes("aXNsYW5kLXdhbGtl")) return { x, y };
      }
    }
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!fig) throw new Error("no walker figure on the map");
  await page.mouse.click(fig.x, fig.y);
  // The wheel's entries are divs named by aria-label.
  await page.waitForFunction(() => !!document.querySelector("[aria-label='Abilities']"), { timeout: 8000 })
    .catch(() => { throw new Error("no Abilities door on the wheel"); });
  const abilitiesBtn = await page.evaluate(() => {
    const b = document.querySelector("[aria-label='Abilities']");
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!abilitiesBtn) throw new Error("no Abilities door on the wheel");
  await page.mouse.click(abilitiesBtn.x, abilitiesBtn.y);
  await sleep(1200);
  const islandEntry = await page.$("[data-ability='island-march']");
  if (!islandEntry) throw new Error("no Island March row in the ability tab");
  // The row is clicked by DOM dispatch: the wheel can still
  // overlay the panel for a coordinate click, and the proof
  // is of the order flow, not of the overlay's stacking.
  const armed = await page.evaluate(() => {
    const b = document.querySelector("[data-ability='island-march']");
    if (!b) return false;
    b.click();
    return true;
  });
  if (!armed) throw new Error("the Island March row would not take its click");
  await sleep(800);
  const armNotice = await page.evaluate(() => {
    const els = [...document.querySelectorAll("div, span, p")].filter((e) => (e.textContent ?? "").includes("tap the land") && (e.textContent ?? "").includes("drift to"));
    return els.length ? els[els.length - 1].textContent : null;
  });
  console.log("  wheel route: the order armed —", armNotice ? "notice spoken" : "NO ARM NOTICE");
  // Tap the destination hex (0,-2): aim at the plain face
  // nearest the point three hex-steps west of the pair's
  // faces (one step ≈ (245, 89) at this zoom, from the
  // lattice's own measure in the float proofs).
  const destPts = await page.evaluate(() => {
    const all = [...document.querySelectorAll("image")]
      .map((i) => { const r = i.getBoundingClientRect(); return { w: r.width, cx: r.x + r.width / 2, cy: r.y + r.height / 2, href: i.getAttribute("href") ?? "" }; })
      .filter((b) => b.w > 30);
    const pair = all.filter((b) => b.href.startsWith("data:image")).sort((a, b) => b.cx - a.cx).slice(0, 2);
    if (pair.length < 2) return [];
    const pcx = (pair[0].cx + pair[1].cx) / 2, pcy = (pair[0].cy + pair[1].cy) / 2;
    const tx = pcx - 735, ty = pcy - 267;
    const faces = all.filter((b) => !b.href.startsWith("data:image"));
    faces.sort((a, b) => Math.hypot(a.cx - tx, a.cy - ty) - Math.hypot(b.cx - tx, b.cy - ty));
    return faces.slice(0, 6).map((f) => ({ x: f.cx, y: f.cy }));
  });
  if (!destPts.length) throw new Error("no destination face found");
  // A refused quote speaks and leaves the order armed, so
  // the hunt walks the candidates until the bar stands.
  let tapNo = 0;
  for (const pt of destPts) {
    tapNo++;
    await page.mouse.click(pt.x, pt.y);
    await sleep(1300);
    quoteShown = await page.evaluate(() => !!document.querySelector(".island-quote-bar"));
    if (quoteShown) { console.log(`  wheel route: the quote stood on tap ${tapNo}`); break; }
    if (tapNo === 1) {
      const said = await page.evaluate(() => {
        const els = [...document.querySelectorAll("div, span, p")].filter((e) => (e.textContent ?? "").length < 300 && /island|locked|floats|Air|land/i.test(e.textContent ?? ""));
        return els.length ? els[els.length - 1].textContent : "(nothing)";
      });
      console.log("  wheel route: after the first tap the land said:", said);
    }
    // A stray wheel (a figure tapped instead of ground)
    // must not swallow the next tap.
    await page.keyboard.press("Escape");
    await sleep(300);
  }
  if (!quoteShown) {
    const notice = await page.evaluate(() => {
      const els = [...document.querySelectorAll("div, span, p")].filter((e) => /island|locked|floats|level 3|Air/i.test(e.textContent ?? "") && (e.textContent ?? "").length < 300);
      return els.length ? els[els.length - 1].textContent : "(no island words on screen)";
    });
    console.log("  quote hunt exhausted; the land last said:", notice);
  }
  if (quoteShown) {
    const qTrace = await page.evaluate(() => !!document.querySelector(".island-trace"));
    ok("the quote state draws the tracing line to the flag before confirming", qTrace);
    await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 2 });
    await sleep(600);
    await page.screenshot({ path: join(OUT, "island-quote.png") });
    await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
  }
} catch (e) {
  console.log("  quote-via-wheel route:", String(e).slice(0, 160));
}
ok("the quote stands in the march bar through the real wheel (figure → Abilities → Island March → tap)", quoteShown);

/* (c) ARRIVAL on camera: give the order through the API,
 * age it past its hour, and read the pair standing over its
 * new ground. */
if (quoteShown) {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll(".island-quote-bar button")].find((x) => x.textContent.includes("Cancel"));
    if (b) b.click();
  });
  await sleep(500);
}
const finalOrder = await call("orderIslandMarch", { awakenedId: lv10Air6, tileId: rowAt(0, -2, 0).id }, token);
db.prepare("UPDATE island_marches SET ends = ? WHERE owner_key = ?").run(Date.now() - 1000, me);
await openLand();
const arrivedLand = await call("getTerritory", {}, token);
ok("the pair stands arrived over its new ground (served)",
  tileById(PAIR_A).q === 0 && tileById(PAIR_A).r === -2 && tileById(PAIR_B).q === 0 && tileById(PAIR_B).r === -1 &&
  (arrivedLand.islandMarches ?? []).length === 0,
  JSON.stringify([tileById(PAIR_A), tileById(PAIR_B)].map((t) => [t.q, t.r])));
const facesArrived = await dataFaces();
const pairArrived = [...facesArrived].sort((a, b) => b.cx - a.cx).slice(0, 2);
const pairMidCx = pairFacesMid.reduce((s, f) => s + f.cx, 0);
ok("the arrived pair renders over its new ground, west of where it drifted",
  pairArrived.length === 2 && pairArrived.reduce((s, f) => s + f.cx, 0) < pairMidCx - 150,
  JSON.stringify({ mid: pairFacesMid.map((f) => Math.round(f.cx)), arrived: pairArrived.map((f) => Math.round(f.cx)) }));
await closeWhispers();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 2 });
await sleep(1000);
await page.screenshot({ path: join(OUT, "island-arrived.png") });

await browser.close();
console.log(`\ndrive-marching-islands: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
