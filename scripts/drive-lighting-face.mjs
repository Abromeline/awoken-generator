// THE LIGHTING FACE (2026-10-27) — the homeland's light
// drawn as dynamic light, proven in a real browser.
//
// Nigel rejected the per-hex pools of the first lighting
// build ("whatever they are i dont like em") and named
// the light he wants: the dynamic lighting of the 3D OBJ
// example — continuous areas radiating from sources,
// brightest at the source, fading with distance, shadows
// where the light meets towers, walls and figures. This
// drive seeds one land with every named fixture and reads
// the DOM + takes the screenshots:
//
//   §F1 the seeded land: a beacon-stage seed (FIGHTING
//       source), a Bastion building (a second FIGHTING
//       source, its glow overlapping the seed's), a
//       watchtower standing in the light, a run of edge
//       walls, a standing Awoken, the Tender, a Dream
//       Shroom (FAINT source), and one LIFTED lit hex
//       (z = 1 over the cursed hex it vacated).
//   §F2 the face in the DOM: zero .light-hex polygons
//       (the pools, and with them the lifted hex's double
//       draw, are dead); the dusk is ONE path; glow
//       ellipses stand for both strong sources and the
//       shroom; shadow shapes stand for the tower, the
//       walls and the figures; the server payload still
//       reads the seed's hex FIGHTING and the shroom's
//       FAINT (the mechanics did not move).
//   §F3 screenshots at play zoom in
//       ~/workspace/lighting-face-proof/: (a) the lit
//       patch, (b) the same land with the sources struck
//       (no glow, no shadows, no pale hexes — only the
//       dusk), (c) close crops on the tower's shadow and
//       the wall run's shadow falling away from the light.
//   §F4 the dark land's DOM: zero glow ellipses, zero
//       shadow shapes, zero .light-hex, the dusk path
//       still standing.
//   §G  THE AMENDMENT (Nigel, 2026-10-27): the beacon's
//       heart and the glow's reach grew (asserted as
//       ratios against the hex face width in §F2), and
//       the walls block the light itself — a second land
//       wears a wall run with a doorway at its middle:
//       the server's throw is barred behind the solid
//       wall and threads the archway; the face answers
//       with blocking volumes for the five solid edges
//       and for the door's two standing parts only — no
//       volume spans the open middle — and the pixels
//       behind the arch sample brighter and warmer than
//       the pixels behind the wall.
//
// Run after `npm run build`:
//   PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-lighting-face.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-lighting-face-"));
process.env.PORT = "39941";
process.env.WORKSHOP_PASSWORD = ["lighting", "face", "drive", "password"].join("-");
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39941";
const PW = "lighting-face-drive-password";
const SHOTS = "/home/hatch/workspace/lighting-face-proof";
mkdirSync(SHOTS, { recursive: true });
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
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, body: data?.data ?? data, raw: data };
}
async function callOk(action, args, token) {
  const r = await call(action, args, token);
  if (r.status !== 200) throw new Error(`${action} -> ${r.status}: ${JSON.stringify(r.raw).slice(0, 240)}`);
  return r.body;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up, as the other drives do */ }
const now = Date.now();
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

/* ══ §F1 THE SEEDED LAND ══════════════════════════════ */
console.log("§F1 the seeded land — beacon, bastion, tower, walls, figures, shroom, lifted hex");
const claim = await callOk("claimTender", { password: PW, tenderName: "Glow Tender" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 3, 'warden', NULL, 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', weapon_key = NULL, total_exp = 3800, hp = 100")
  .run(ownerKey, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 900, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 900").run(ownerKey, now);
await callOk("ensureFirstSeed", {}, claim.token);
const T = { token: claim.token, ownerKey };
const freezeBattle = () => db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now(), ownerKey);
const tilesOf = async () => (await callOk("getTerritory", {}, T.token)).tiles;
const tileAt = (tiles, q, r) => tiles.find((x) => x.q === q && x.r === r) ?? null;
const purify = (t) => db.prepare("UPDATE territory_tiles SET cursed = 0, element = 'root' WHERE id = ?").run(t.id);

// The seed grown to the Beacon: a FIGHTING source.
db.prepare("UPDATE star_seeds SET level = 3 WHERE owner_key = ?").run(ownerKey);
freezeBattle();
let tiles = await tilesOf();
const seedTileId = db.prepare("SELECT tile_id AS id FROM star_seeds WHERE owner_key = ?").get(ownerKey).id;
const seedTile = tiles.find((t) => t.id === seedTileId);
ok("§F1 the beacon seed stands on the land", !!seedTile);
ok("§F1 the server's payload reads the seed's hex FIGHTING (2) — the mechanics' truth", seedTile?.light === 2, `light=${seedTile?.light}`);
const S = { q: seedTile.q, r: seedTile.r };

// The watchtower on the ring east of the beacon, in its light.
const towerTile = tileAt(tiles, S.q + 1, S.r);
ok("§F1 a ring tile east of the beacon stands for the tower", !!towerTile);
purify(towerTile);
db.prepare("INSERT INTO territory_buildings (owner_key, tile_id, building_type, placed_at) VALUES (?, ?, 'watchtower', ?)").run(ownerKey, towerTile.id, now);

// A Bastion building two hexes east: the second FIGHTING source.
const bastionTile = tileAt(tiles, S.q + 2, S.r);
ok("§F1 a tile two hexes east stands for the Bastion building", !!bastionTile);
purify(bastionTile);
db.prepare("INSERT INTO territory_buildings (owner_key, tile_id, building_type, placed_at) VALUES (?, ?, 'bastion', ?)").run(ownerKey, bastionTile.id, now);

// A wall run: three edges of the west ring hex.
const westTile = tileAt(tiles, S.q - 1, S.r);
ok("§F1 the west ring tile stands for the wall run and the Tender", !!westTile);
purify(westTile);
for (const dir of [2, 3, 4]) {
  db.prepare("INSERT INTO hex_walls (owner_key, edge_key, q, r, dir, hp, max_hp, kind, level, rune_kind, style, created_at) VALUES (?, ?, ?, ?, ?, 10, 10, 'wall', 1, NULL, 'stone', ?)")
    .run(ownerKey, `${westTile.q},${westTile.r},${dir}`, westTile.q, westTile.r, dir, now);
}
// The Tender stands on the west hex, the beacon at his back's east.
db.prepare("UPDATE tender_progress SET tender_tile_id = ? WHERE owner_key = ?").run(westTile.id, ownerKey);

// A standing Awoken on the south-east ring hex.
const figTile = tileAt(tiles, S.q + 1, S.r - 1);
ok("§F1 the south-east ring tile stands for the Awoken", !!figTile);
const partEl = (nm, cat) => Number(db.prepare(
  "INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 2, 2, 'sky', ?, 'image/png', ?)")
  .run(nm, cat, `lighting-face/${nm}.png`, now).lastInsertRowid);
const comp = JSON.stringify([["body", "sky"], ["arms", "sky"], ["head", "sky"]].map(([cat, el]) => ({
  source_id: `db:${partEl(`Glowkin ${cat}`, cat)}`, name: `Glowkin ${cat}`, category: cat, rarity: "common", power: 2, toughness: 2, element: el,
})));
const kinId = Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES ('Glowkin', 'Glowkin', 'lighting-face/kin.png', ?, 'tender', 'Glow Tender', ?, ?)")
  .run(comp, ownerKey, now).lastInsertRowid);
db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, stance, placed_at, last_moved_at) VALUES (?, ?, ?, 'defense', ?, ?)")
  .run(ownerKey, kinId, figTile.id, now, now);

// A Dream Shroom two hexes south-west: the FAINT source.
const shroomTile = tileAt(tiles, S.q - 1, S.r + 2) ?? tiles.find((t) => hexDist(t, seedTile) === 2);
ok("§F1 a tile two hexes out stands for the Dream Shroom", !!shroomTile);
purify(shroomTile);
db.prepare("INSERT INTO territory_buildings (owner_key, tile_id, building_type, placed_at) VALUES (?, ?, 'dream-wheat', ?)").run(ownerKey, shroomTile.id, now);

// One LIFTED lit hex: the north ring hex rises to z=1 and a
// cursed hex is born on the ground it vacated (the lift's
// own birth, mirrored from liftTileByAir).
const liftTile = tileAt(tiles, S.q, S.r - 1);
ok("§F1 the north ring tile stands for the lift", !!liftTile);
purify(liftTile);
db.prepare("UPDATE territory_tiles SET z = 1 WHERE id = ?").run(liftTile.id);
db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, spark, created_at, z, curse_hp, curse_max_hp) VALUES (?, ?, ?, 'neutral', 1, 0, ?, 0, 40, 40)")
  .run(ownerKey, liftTile.q, liftTile.r, now);
freezeBattle();
tiles = await tilesOf();
const shroomServed = tiles.find((t) => t.id === shroomTile.id);
ok("§F1 the server's payload reads the Dream Shroom's hex FAINT (1)", shroomServed?.light === 1, `light=${shroomServed?.light}`);
const liftedServed = tiles.filter((t) => t.q === liftTile.q && t.r === liftTile.r);
ok("§F1 the lifted hex and its newborn cursed hex both stand on the land (two records, one (q,r))",
  liftedServed.length === 2 && liftedServed.some((t) => (t.z ?? 0) === 1) && liftedServed.some((t) => (t.z ?? 0) === 0 && t.cursed),
  `rows=${liftedServed.map((t) => `z${t.z ?? 0}${t.cursed ? "c" : ""}`).join(",")}`);

/* ══ §F2/§F3 THE FACE, LIT — DOM + SCREENSHOTS ═════════ */
console.log("§F2 the face in the DOM — continuous glow, one dusk, shadows, no hex light");
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:lighting-face]", String(e).slice(0, 200)));
await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, T.token);
const makeEvalRetry = (pg) => async (fn, tries = 4) => {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try { return await pg.evaluate(fn); }
    catch (e) { lastErr = e; if (!/detached Frame|Execution context was destroyed|Cannot find context/i.test(String(e))) throw e; await sleep(1000); }
  }
  throw lastErr;
};
const evalRetry = makeEvalRetry(page);
async function enterHomelandOn(pg, retry) {
  await pg.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2500);
  const door = await pg.$(".deck-button");
  if (door) await door.click();
  await pg.waitForSelector(".light-layer", { timeout: 30000 }).catch(() => {});
  await sleep(600);
  // Dismiss the ceremony and the lessons until they stop
  // coming — the First Seed's tale ("Tend on") rises a few
  // seconds after a grown seed is first seen, over the map.
  for (let i = 0; i < 12; i++) {
    const acted = await retry(() => {
      let hit = false;
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Skip");
      if (b) { b.click(); hit = true; }
      const cer = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Tend on");
      if (cer) { cer.click(); hit = true; }
      const mg = document.querySelector(".margin-guide-dismiss");
      if (mg) { mg.click(); hit = true; }
      return hit;
    }).catch(() => false);
    await sleep(700);
    if (!acted) break;
  }
  await sleep(600);
  // Play zoom: two wheel-ins over the map's heart.
  await pg.mouse.move(700, 475);
  await pg.mouse.wheel({ deltaY: -900 });
  await sleep(500);
  await pg.mouse.wheel({ deltaY: -900 });
  await sleep(900);
}
const enterHomeland = () => enterHomelandOn(page, evalRetry);
const probeLayerOn = (retry) => retry(() => {
  const layer = document.querySelector(".light-layer");
  if (!layer) return { layer: false };
  const rectOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; };
  const duskD = layer.querySelector(".light-dusk")?.getAttribute("d") ?? "";
  const subpaths = duskD.split("M").map((s) => s.trim()).filter(Boolean).map((s) => {
    const pts = [];
    const re = /(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g;
    let m;
    while ((m = re.exec(s)) !== null) pts.push([Number(m[1]), Number(m[2])]);
    return pts;
  }).filter((pts) => pts.length >= 6);
  const centroids = subpaths.map((pts) => ({
    x: pts.reduce((a, p) => a + p[0], 0) / pts.length,
    y: pts.reduce((a, p) => a + p[1], 0) / pts.length,
  }));
  const faceW = subpaths.length ? Math.max(...subpaths[0].map((p) => p[0])) - Math.min(...subpaths[0].map((p) => p[0])) : 0;
  const coreEls = [...layer.querySelectorAll('.light-glow[data-glow="core"]')];
  const doorG = document.querySelector('.build-wall-piece[data-kind="door"]');
  const doorLineEl = doorG ? doorG.querySelector("line") : null;
  return {
    layer: true,
    hexes: layer.querySelectorAll(".light-hex").length,
    dataLight: layer.querySelectorAll("[data-light]").length,
    dusk: layer.querySelectorAll(".light-dusk").length,
    glowFighting: layer.querySelectorAll('.light-glow[data-glow="fighting"]').length,
    glowCore: layer.querySelectorAll('.light-glow[data-glow="core"]').length,
    glowFaint: layer.querySelectorAll('.light-glow[data-glow="faint"]').length,
    glowRx: [...layer.querySelectorAll('.light-glow[data-glow="fighting"]')].map((e) => Number(e.getAttribute("rx"))),
    coreRx: coreEls.map((e) => Number(e.getAttribute("rx"))),
    coreLand: coreEls.map((e) => ({ x: Number(e.getAttribute("cx")), y: Number(e.getAttribute("cy")) })),
    shadows: layer.querySelectorAll(".light-shadow").length,
    shadowEllipses: layer.querySelectorAll("ellipse.light-shadow").length,
    shadowPolys: layer.querySelectorAll("polygon.light-shadow").length,
    blocks: [...layer.querySelectorAll(".light-block")].map((e) => ({
      block: e.getAttribute("data-block"), src: e.getAttribute("data-src"),
      seg: (e.getAttribute("data-seg") ?? "").split(",").map(Number),
    })),
    doorLine: doorLineEl ? { x1: Number(doorLineEl.getAttribute("x1")), y1: Number(doorLineEl.getAttribute("y1")), x2: Number(doorLineEl.getAttribute("x2")), y2: Number(doorLineEl.getAttribute("y2")) } : null,
    centroids,
    faceW,
    nodes: layer.querySelectorAll("*").length,
    cores: coreEls.map(rectOf),
    shadowRects: [...layer.querySelectorAll(".light-shadow")].map(rectOf),
  };
});
const probeLayer = () => probeLayerOn(evalRetry);

await enterHomeland();
const lit = await probeLayer();
console.log("  lit probe:", JSON.stringify({ ...lit, cores: undefined, shadowRects: undefined }));
ok("§F2 the light layer stands in the homeland DOM", lit.layer === true);
ok("§F2 ZERO hex-shaped light polygons remain (.light-hex)", lit.hexes === 0, `n=${lit.hexes}`);
ok("§F2 no per-tile light shapes remain ([data-light] nodes)", lit.dataLight === 0, `n=${lit.dataLight}`);
ok("§F2 the dusk is ONE continuous wash (a single .light-dusk path)", lit.dusk === 1, `n=${lit.dusk}`);
ok("§F2 both FIGHTING sources draw their glow (seed + Bastion building = 2 wide glows)", lit.glowFighting === 2, `n=${lit.glowFighting}`);
ok("§F2 both FIGHTING sources draw their bright core", lit.glowCore === 2, `n=${lit.glowCore}`);
const glowRatio = lit.faceW && lit.glowRx?.[0] ? lit.glowRx[0] / lit.faceW : 0;
const coreRatio = lit.faceW && lit.coreRx?.[0] ? lit.coreRx[0] / lit.faceW : 0;
ok("§F2 AMENDED MEASURE (Nigel, 2026-10-27): the FIGHTING glow's rim stands ~3 hex widths out — rx is 1.32–1.48 × the hex face width (the first face reached ~2 widths, 0.99×)",
  glowRatio >= 1.32 && glowRatio <= 1.48, `ratio=${glowRatio.toFixed(3)} rx=${lit.glowRx?.[0]} faceW=${lit.faceW?.toFixed(1)}`);
ok("§F2 AMENDED MEASURE: the beacon's heart — the bright core — spans ~1.45 hex measures, rx 0.60–0.73 × the face width (it was ~0.95 measures, 0.44×)",
  coreRatio >= 0.60 && coreRatio <= 0.73, `ratio=${coreRatio.toFixed(3)} rx=${lit.coreRx?.[0]}`);
ok("§F2 the Dream Shroom draws its small faint glow", (lit.glowFaint ?? 0) >= 1, `n=${lit.glowFaint}`);
ok("§F2 shadows stand for what the light meets (tower, walls, figures — at least 3 shapes)", (lit.shadows ?? 0) >= 3, `n=${lit.shadows} (ellipses=${lit.shadowEllipses}, sweeps=${lit.shadowPolys})`);
console.log(`  layer node count (lit land): ${lit.nodes}`);

await page.screenshot({ path: join(SHOTS, "a-lit-patch.png") });
// (c) close crops: the tower's shadow (an ellipse east of the
// seed's core) and the wall run's shadow (a sweep west of it).
if (lit.cores?.length && lit.shadowRects?.length) {
  const core = lit.cores[0];
  const towerShadow = lit.shadowRects
    .filter((r) => r.cx > core.cx)
    .sort((a, b) => (a.cx - core.cx) - (b.cx - core.cx))[0];
  if (towerShadow) {
    const x = Math.max(0, Math.min(core.x, towerShadow.x) - 50);
    const y = Math.max(0, Math.min(core.y, towerShadow.y) - 60);
    const w = Math.min(1400 - x, Math.max(core.x + core.w, towerShadow.x + towerShadow.w) + 50 - x);
    const h = Math.min(950 - y, Math.max(core.y + core.h, towerShadow.y + towerShadow.h) + 60 - y);
    await page.screenshot({ path: join(SHOTS, "c-tower-shadow.png"), clip: { x, y, width: w, height: h } });
    console.log(`  crop c (tower): ${JSON.stringify({ x, y, w, h })}`);
  } else console.log("  FAIL - §F3 no tower shadow rect east of the seed's core to crop");
  const wallShadow = lit.shadowRects
    .filter((r) => r.cx < core.cx)
    .sort((a, b) => (core.cx - a.cx) - (core.cx - b.cx))[0];
  if (wallShadow) {
    const x = Math.max(0, Math.min(core.x, wallShadow.x) - 50);
    const y = Math.max(0, Math.min(core.y, wallShadow.y) - 60);
    const w = Math.min(1400 - x, Math.max(core.x + core.w, wallShadow.x + wallShadow.w) + 50 - x);
    const h = Math.min(950 - y, Math.max(core.y + core.h, wallShadow.y + wallShadow.h) + 60 - y);
    await page.screenshot({ path: join(SHOTS, "c2-wall-shadow.png"), clip: { x, y, width: w, height: h } });
    console.log(`  crop c2 (walls): ${JSON.stringify({ x, y, w, h })}`);
  } else console.log("  FAIL - §F3 no wall shadow rect west of the seed's core to crop");
  ok("§F3 the shadow crops were taken (tower east, walls west of the beacon's core)", !!towerShadow && !!wallShadow);
}

/* ══ §G THE WALL-AND-ARCHWAY LAND (Nigel's example) ═══
   A second land arranged for the picture he asked to
   see: a beacon-stage seed; down its east side, a wall
   run of five solid edges with a DOOR PIECE at the run's
   middle (on the beacon's lower-east edge); a watchtower
   and a standing Awoken on the lit side. The server's
   reckoning must agree with the face: the hex behind the
   solid wall reads DARK (its throw is barred), the hex
   behind the archway reads FIGHTING (the throw threads
   the gap at the edge's midpoint — the standing parts
   flank [0, 0.3] and [0.7, 1] of the edge). */
console.log("§G the wall-and-archway land — a run across the glow, a doorway at its middle");
const claim2 = await callOk("claimTender", { password: PW, tenderName: "Arch Tender" });
const tenderId2 = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim2.tender.code).id;
const ownerKey2 = `tender:${tenderId2}`;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 3, 'warden', NULL, 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', weapon_key = NULL, total_exp = 3800, hp = 100")
  .run(ownerKey2, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 900, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 900").run(ownerKey2, now);
await callOk("ensureFirstSeed", {}, claim2.token);
const T2 = { token: claim2.token, ownerKey: ownerKey2 };
const freeze2 = () => db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now(), ownerKey2);
const tilesOf2 = async () => (await callOk("getTerritory", {}, T2.token)).tiles;
db.prepare("UPDATE star_seeds SET level = 3 WHERE owner_key = ?").run(ownerKey2);
freeze2();
let tiles2 = await tilesOf2();
const seedTile2 = tiles2.find((t) => t.id === db.prepare("SELECT tile_id AS id FROM star_seeds WHERE owner_key = ?").get(ownerKey2).id);
ok("§G the beacon seed stands on the second land", !!seedTile2);
const S2 = { q: seedTile2.q, r: seedTile2.r };
// The run's own hexes are purified (the walls stand on
// clean ground); the land beyond the run stays cursed.
for (const [dq, dr] of [[0, -1], [0, 0], [0, 1], [-1, 0]]) {
  const t = tileAt(tiles2, S2.q + dq, S2.r + dr);
  if (t) purify(t);
}
// Five solid edges down the beacon's east side, under
// their canonical keys (the server's bar reads the key;
// the client draws the stored row's own edge).
const WD6 = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];
const WOPP6 = [3, 4, 5, 0, 1, 2];
const insWall2 = (q, r, dir) => {
  const nq = q + WD6[dir][0], nr = r + WD6[dir][1];
  const flip = nq < q || (nq === q && nr < r);
  const row = flip ? { q: nq, r: nr, dir: WOPP6[dir] } : { q, r, dir };
  db.prepare("INSERT INTO hex_walls (owner_key, edge_key, q, r, dir, hp, max_hp, kind, level, rune_kind, style, created_at) VALUES (?, ?, ?, ?, ?, 10, 10, 'wall', 1, NULL, 'stone', ?)")
    .run(ownerKey2, `${row.q},${row.r},${row.dir}`, row.q, row.r, row.dir, now);
};
insWall2(S2.q, S2.r - 1, 1); insWall2(S2.q, S2.r - 1, 2);
insWall2(S2.q, S2.r, 1);
insWall2(S2.q, S2.r + 1, 1); insWall2(S2.q, S2.r + 1, 2);
// THE ARCHWAY at the run's middle: a door piece on the
// beacon's lower-east edge — vertex R (2/3, −1/3) to
// vertex BR (1/3, 1/3), in axial fractions.
const SQ3 = Math.sqrt(3);
const axialToPlate2 = ([q, r]) => [3 * q / 2, -SQ3 * r - (SQ3 / 2) * q];
const doorA = [S2.q + 2 / 3, S2.r - 1 / 3], doorB = [S2.q + 1 / 3, S2.r + 1 / 3];
const doorId = Number(db.prepare("INSERT INTO build_pieces (owner_key, kind, piece_key, verts, footprint, created_at) VALUES (?, 'door', 'door#seeded-arch', ?, ?, ?)")
  .run(ownerKey2, JSON.stringify([axialToPlate2(doorA), axialToPlate2(doorB)]), JSON.stringify([doorA, doorB]), now).lastInsertRowid);
ok("§G the archway piece stands in the run (a build_pieces door row)", doorId > 0, `id=${doorId}`);
// A watchtower on the lit side, south of the beacon and
// west of the run; a standing Awoken to the west.
const towerTile2 = tileAt(tiles2, S2.q, S2.r + 1);
db.prepare("INSERT INTO territory_buildings (owner_key, tile_id, building_type, placed_at) VALUES (?, ?, 'watchtower', ?)").run(ownerKey2, towerTile2.id, now);
const figTile2 = tileAt(tiles2, S2.q - 1, S2.r);
const partEl2 = (nm, cat) => Number(db.prepare(
  "INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 2, 2, 'sky', ?, 'image/png', ?)")
  .run(nm, cat, `lighting-face/${nm}.png`, now).lastInsertRowid);
const comp2 = JSON.stringify([["body", "sky"], ["arms", "sky"], ["head", "sky"]].map(([cat, el]) => ({
  source_id: `db:${partEl2(`Archkin ${cat}`, cat)}`, name: `Archkin ${cat}`, category: cat, rarity: "common", power: 2, toughness: 2, element: el,
})));
const kinId2 = Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES ('Archkin', 'Archkin', 'lighting-face/kin2.png', ?, 'tender', 'Arch Tender', ?, ?)")
  .run(comp2, ownerKey2, now).lastInsertRowid);
db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, stance, placed_at, last_moved_at) VALUES (?, ?, ?, 'defense', ?, ?)")
  .run(ownerKey2, kinId2, figTile2.id, now, now);
db.prepare("UPDATE tender_progress SET tender_tile_id = ? WHERE owner_key = ?").run(figTile2.id, ownerKey2);
freeze2();
tiles2 = await tilesOf2();
const behindWallT = tileAt(tiles2, S2.q + 1, S2.r - 1);
const behindArchT = tileAt(tiles2, S2.q + 1, S2.r);
ok("§G the server's reckoning AGREES: the hex behind the solid wall reads DARK (0) — the throw is barred at the wall",
  behindWallT?.light === 0, `light=${behindWallT?.light}`);
ok("§G the server's reckoning AGREES: the hex behind the ARCHWAY reads FIGHTING (2) — the throw threads the open middle",
  behindArchT?.light === 2, `light=${behindArchT?.light}`);

const page2 = await browser.newPage();
await page2.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page2.on("pageerror", (e) => console.log("[pageerror:lighting-face-G]", String(e).slice(0, 200)));
await page2.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, T2.token);
const retry2 = makeEvalRetry(page2);
await enterHomelandOn(page2, retry2);
const g = await probeLayerOn(retry2);
console.log("  G probe:", JSON.stringify({ blocks: g.blocks?.length, doorLine: g.doorLine, nodes: g.nodes, centroids: g.centroids?.length }));
ok("§G the light layer stands on the wall-and-archway land", g.layer === true);
const edgeBlocks = (g.blocks ?? []).filter((b) => (b.block ?? "").startsWith("edgewall-"));
const doorBlocks = (g.blocks ?? []).filter((b) => (b.block ?? "").startsWith(`piece-${doorId}:`));
ok("§G blocking volumes stand for the run's five solid edges", edgeBlocks.length >= 5, `n=${edgeBlocks.length} of ${g.blocks?.length} volumes`);
ok("§G the archway blocks by its TWO standing parts only — one volume per part", doorBlocks.length === 2, `n=${doorBlocks.length}`);
// Geometry, read off the emitted shapes themselves: the
// door volumes' segments must be the standing parts
// [0, 0.3] and [0.7, 1] of the door's own edge (its drawn
// ground line), and neither may cover the open middle.
let doorGeomOk = false;
if (g.doorLine && doorBlocks.length === 2) {
  const A = [g.doorLine.x1, g.doorLine.y1], B = [g.doorLine.x2, g.doorLine.y2];
  const lerp = (t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
  const near = (p, q2, tol = 3) => Math.hypot(p[0] - q2[0], p[1] - q2[1]) <= tol;
  const parts = [[A, lerp(0.3)], [lerp(0.7), B]];
  const matched = parts.map(([pa, pb]) => doorBlocks.some((bl) => {
    const s = bl.seg;
    return (near([s[0], s[1]], pa) && near([s[2], s[3]], pb)) || (near([s[0], s[1]], pb) && near([s[2], s[3]], pa));
  }));
  const M = lerp(0.5);
  const coversMid = doorBlocks.some((bl) => {
    const [ax, ay, bx, by] = bl.seg;
    const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1;
    const t = ((M[0] - ax) * vx + (M[1] - ay) * vy) / L2;
    const px = ax + vx * t, py = ay + vy * t;
    return t > 0.02 && t < 0.98 && Math.hypot(M[0] - px, M[1] - py) < 3;
  });
  doorGeomOk = matched.every(Boolean) && !coversMid;
}
ok("§G NO blocking volume spans the archway's open middle — the volumes' segments are exactly the door's standing parts", doorGeomOk);
const shotBuf = await page2.screenshot({ path: join(SHOTS, "d-wall-archway.png") });
// Pixel sampling: the ground behind a wall segment
// against the ground behind the arch, from the shot
// itself (the screenshot drawn into a canvas in-page).
let sampleOk = false, sampleNote = "";
try {
  const coreRect = g.cores?.[0], coreLand = g.coreLand?.[0];
  if (coreRect && coreLand && g.faceW && g.centroids?.length && g.coreRx?.[0]) {
    const scale = coreRect.w / (2 * g.coreRx[0]);
    const toScreen = (p) => [coreRect.cx + (p.x - coreLand.x) * scale, coreRect.cy + (p.y - coreLand.y) * scale];
    const nearestC = (p) => g.centroids.reduce((best, c) => (Math.hypot(c.x - p.x, c.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? c : best), g.centroids[0]);
    const seedC = nearestC(coreLand);
    const fw = g.faceW;
    const wallC = nearestC({ x: seedC.x + 0.7464 * fw, y: seedC.y - 0.2762 * fw });
    const archC = nearestC({ x: seedC.x + 0.7464 * fw, y: seedC.y + 0.2716 * fw });
    const pts = [toScreen(wallC), toScreen(archC)];
    const samples = await page2.evaluate(async (data, sp) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = "data:image/png;base64," + data; });
      const cv = document.createElement("canvas");
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const ctx = cv.getContext("2d");
      ctx.drawImage(img, 0, 0);
      return sp.map(([x, y]) => {
        const d = ctx.getImageData(Math.max(0, Math.round(x) - 3), Math.max(0, Math.round(y) - 3), 7, 7).data;
        let r = 0, gg = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
        return { r: r / n, g: gg / n, b: b / n };
      });
    }, shotBuf.toString("base64"), pts);
    const lum = (s) => 0.2126 * s.r + 0.7152 * s.g + 0.0722 * s.b;
    const warm = (s) => s.r - s.b;
    sampleNote = `wall rgb=${samples[0].r.toFixed(0)},${samples[0].g.toFixed(0)},${samples[0].b.toFixed(0)} lum=${lum(samples[0]).toFixed(1)} warm=${warm(samples[0]).toFixed(1)} · arch rgb=${samples[1].r.toFixed(0)},${samples[1].g.toFixed(0)},${samples[1].b.toFixed(0)} lum=${lum(samples[1]).toFixed(1)} warm=${warm(samples[1]).toFixed(1)}`;
    console.log("  samples:", sampleNote);
    sampleOk = lum(samples[1]) > lum(samples[0]) + 8 && warm(samples[1]) > warm(samples[0]) + 4;
  } else sampleNote = "probe geometry missing (core/centroids)";
} catch (e) { sampleNote = "sampling failed: " + String(e).slice(0, 140); }
ok("§G PIXELS: the ground behind the arch is brighter and warmer than the ground behind the solid wall", sampleOk, sampleNote);
if (g.cores?.[0] && g.doorLine) {
  const core = g.cores[0];
  const xs = [core.x, core.x + core.w, g.doorLine.x1, g.doorLine.x2];
  const ys = [core.y, core.y + core.h, g.doorLine.y1, g.doorLine.y2];
  const x = Math.max(0, Math.min(...xs) - 90), y = Math.max(0, Math.min(...ys) - 110);
  const w = Math.min(1400 - x, Math.max(...xs) + 300 - x), h = Math.min(950 - y, Math.max(...ys) + 150 - y);
  await page2.screenshot({ path: join(SHOTS, "d2-wall-archway-crop.png"), clip: { x, y, width: w, height: h } });
  console.log(`  crop d2 (archway): ${JSON.stringify({ x, y, w, h })}`);
  ok("§G the archway crop was taken", w > 200 && h > 200);
}
console.log(`  layer node count (wall-and-archway land): ${g.nodes}`);
await page2.close();

/* ══ §F4 THE SAME LAND, SOURCES STRUCK ════════════════ */
console.log("§F4 the same land with the light sources struck — no glow, no shadows, no pale hexes");
db.prepare("UPDATE star_seeds SET level = 1 WHERE owner_key = ?").run(ownerKey);
db.prepare("DELETE FROM territory_buildings WHERE owner_key = ? AND building_type IN ('bastion', 'dream-wheat')").run(ownerKey);
freezeBattle();
await enterHomeland();
const dark = await probeLayer();
console.log("  dark probe:", JSON.stringify({ ...dark, cores: undefined, shadowRects: undefined }));
ok("§F4 the light layer still stands (the dusk remains)", dark.layer === true && dark.dusk === 1, `dusk=${dark.dusk}`);
ok("§F4 ZERO glow ellipses with the sources struck", (dark.glowFighting ?? -1) === 0 && (dark.glowCore ?? -1) === 0 && (dark.glowFaint ?? -1) === 0,
  `fighting=${dark.glowFighting} core=${dark.glowCore} faint=${dark.glowFaint}`);
ok("§F4 ZERO shadow shapes with no strong source to cast them", dark.shadows === 0, `n=${dark.shadows}`);
ok("§F4 still ZERO hex-shaped light (.light-hex)", dark.hexes === 0, `n=${dark.hexes}`);
console.log(`  layer node count (dark land): ${dark.nodes}`);
await page.screenshot({ path: join(SHOTS, "b-no-sources.png") });
await browser.close();

console.log(`\nDRIVE LIGHTING-FACE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
