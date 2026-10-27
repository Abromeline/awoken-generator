// drive-remove-edge-works — EDGE WORKS REMOVED WHOLE
// (Nigel, 2026-10-27: "Remove Edge Works whole — the book's
// workings stay"; his reason: "runes and wards are no longer
// locked to hexs there is no reason for the edgeworks system").
//
// Boots the real server on a scratch DATA_DIR and proves:
//   §A the removal's footprint: the hex_walls and
//      awoken_skills tables do not exist after boot (the
//      drop migration ran); getTerritory serves no walls
//      and no skills; the removed doors (placeWall,
//      placeEdgeWork, strengthenEdgeWork, removeEdgeWork,
//      teachSkill) refuse.
//   §B the book's workings still place, stand and cast:
//      a Seal ward cast through castMapWorking stands on
//      its edge and is served; a Lattice rune cast the
//      same way stands on its hex; the ward's own hex
//      reads FAINT in the payload (its glow stands).
//   §C the construction still places through its own door:
//      a built wall on the beacon hex's edge is served in
//      buildPieces, and the light is barred behind it.
//   §D light threads a built door: the wall comes down
//      through removeBuildPiece, a door is laid on the
//      same edge through placeBuildPiece, and the hex
//      behind it reads FIGHTING again.
//   §E the face: the homeland loads; the War-Grounds panel
//      carries no edge-work UI (no chooser, no teaching,
//      no Warding/Runeing); the built door is drawn; a
//      screenshot keeps the homeland with the built door
//      and the book's ward standing, lit by the beacon.
// Run after `npm run build`:
//   PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-remove-edge-works.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-remove-edge-works-"));
process.env.PORT = "39943";
process.env.WORKSHOP_PASSWORD = ["remove", "edge", "works", "drive", "pass"].join("-") + "word";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39943";
const PW = "remove-edge-works-drive-password";
const SHOTS = "/home/hatch/workspace/remove-edge-works-proof";
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
const SQ3 = Math.sqrt(3);
const axialToPlate = ([q, r]) => [3 * q / 2, -SQ3 * r - (SQ3 / 2) * q];
// A hex edge's ends, as axial fractions of the hex's own
// centre (the average of the three hexes meeting at each
// vertex), in FACE order.
const VERT_FRAC = [[-1 / 3, -1 / 3], [1 / 3, -2 / 3], [2 / 3, -1 / 3], [1 / 3, 1 / 3], [-1 / 3, 2 / 3], [-2 / 3, 1 / 3]];
const WALL_DIRS = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];

/* ══ §A THE REMOVAL'S FOOTPRINT ═══════════════════════ */
console.log("§A the tables are gone, the payload is clean, the doors refuse");
const claim = await callOk("claimTender", { password: PW, tenderName: "Edge Tender" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 3, 'warden', NULL, 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', weapon_key = NULL, total_exp = 3800, hp = 100")
  .run(ownerKey, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 900, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 900").run(ownerKey, now);
await callOk("ensureFirstSeed", {}, claim.token);
const T = { token: claim.token, ownerKey };
const freezeBattle = () => db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now(), ownerKey);
freezeBattle();

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('hex_walls', 'awoken_skills')").all();
ok("§A neither hex_walls nor awoken_skills exists after boot — the drop migration ran", tables.length === 0, JSON.stringify(tables));

let land = await callOk("getTerritory", {}, T.token);
ok("§A the land loads and serves tiles", Array.isArray(land.tiles) && land.tiles.length > 0, `tiles=${land.tiles?.length}`);
ok("§A the payload serves no walls list (Edge Works' standing works)", !("walls" in land));
ok("§A the payload serves no skills list (the teaching ledger)", !("skills" in land));
for (const door of ["placeWall", "placeEdgeWork", "strengthenEdgeWork", "removeEdgeWork", "teachSkill"]) {
  const r = await call(door, { tileId: 1, dir: 0, awakenedId: 1, skill: "warding", kind: "wall" }, T.token);
  ok(`§A the removed door ${door} refuses`, r.status !== 200, `status=${r.status}`);
}

/* ══ §B THE BOOK'S WORKINGS STAND ═════════════════════ */
console.log("§B the book's workings still place, stand and cast");
const seedTileId = db.prepare("SELECT tile_id AS id FROM star_seeds WHERE owner_key = ?").get(ownerKey).id;
const seedTile = land.tiles.find((t) => t.id === seedTileId);
ok("§B the seed's hex stands on the land", !!seedTile);
// A Seal ward on the seed hex's dir-5 edge, cast through
// the book's own door until it stands (a fizzle spends
// the charge alone, so the door is knocked again).
async function castUntilStands(spellKey, args) {
  for (let i = 0; i < 24; i++) {
    const res = await call("castMapWorking", { spellKey, ...args }, T.token);
    if (res.status === 200 && !res.body?.fizzled) return res.body;
    if (res.status !== 200) throw new Error(`cast ${spellKey} -> ${res.status}: ${JSON.stringify(res.raw).slice(0, 200)}`);
  }
  throw new Error(`cast of ${spellKey} never stood in 24 casts`);
}
const wardCast = await castUntilStands("seal", { tileId: seedTile.id, dir: 5 });
ok("§B the Seal ward cast stands (castMapWorking answered with its edge)", !!wardCast?.edgeKey, JSON.stringify(wardCast).slice(0, 160));
land = await callOk("getTerritory", {}, T.token);
const ward = (land.workings ?? []).find((w) => w.kind === "ward");
ok("§B the ward stands in the served workings, on its edge", !!ward && !!ward.edgeKey, `workings=${(land.workings ?? []).length}`);
// The rune's hex stands well clear of the beacon hex and
// its dir-2 neighbour — §C/§D read that neighbour's light,
// and a rune's faint glow must not speak into it.
const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
const runeTile = land.tiles.find((t) => hexDist(t, seedTile) >= 2 && !t.cursed) ?? land.tiles.find((t) => hexDist(t, seedTile) >= 2);
await castUntilStands("lattice", { tileId: runeTile.id });
land = await callOk("getTerritory", {}, T.token);
const rune = (land.workings ?? []).find((w) => w.kind === "rune");
ok("§B the Lattice rune cast stands in the served workings", !!rune, `workings=${(land.workings ?? []).length}`);
if (ward) {
  const wardTile = land.tiles.find((t) => t.q === ward.q && t.r === ward.r);
  ok("§B the ward's own hex reads FAINT (1) — the book's ward still gives its faint light",
    !!wardTile && (wardTile.light ?? 0) >= 1, `light=${wardTile?.light}`);
}

/* ══ §C/§D THE CONSTRUCTION, AND LIGHT AT ITS WALL AND DOOR ══ */
console.log("§C/§D a built wall bars the light; a built door threads it");
db.prepare("UPDATE star_seeds SET level = 3 WHERE owner_key = ?").run(ownerKey);
freezeBattle();
land = await callOk("getTerritory", {}, T.token);
const S = land.tiles.find((t) => t.id === seedTileId);
const X = land.tiles.find((t) => t.q === S.q + WALL_DIRS[2][0] && t.r === S.r + WALL_DIRS[2][1]);
ok("§C the beacon hex and its dir-2 neighbour stand", !!S && !!X && S.light === 2, `S.light=${S?.light} X=${!!X}`);
const edgeVerts = [2, 3].map((vi) => axialToPlate([S.q + VERT_FRAC[vi][0], S.r + VERT_FRAC[vi][1]]));
// A wall stands on the edge of a floor the Tender owns —
// so the beacon hex's own wedge floor is laid first, and
// the wall and then the door stand on its outer edge.
const layFloor = await callOk("placeBuildPiece", { kind: "triangle", verts: [axialToPlate([S.q, S.r]), ...edgeVerts] }, T.token);
ok("§C a triangle floor is laid through placeBuildPiece on the beacon hex", layFloor.ok === true && layFloor.piece?.kind === "triangle");
const layWall = await callOk("placeBuildPiece", { kind: "wall", verts: edgeVerts }, T.token);
ok("§C a wall is laid through placeBuildPiece on the beacon's dir-2 edge", layWall.ok === true && layWall.piece?.kind === "wall");
freezeBattle();
land = await callOk("getTerritory", {}, T.token);
const xWalled = land.tiles.find((t) => t.id === X.id);
ok("§C the built wall stands in the served pieces", (land.buildPieces ?? []).some((p) => p.kind === "wall"));
ok("§C the hex behind the built wall reads DARK (0) — its light is barred", xWalled.light === 0, `light=${xWalled.light}`);
const rm = await callOk("removeBuildPiece", { id: layWall.piece.id }, T.token);
ok("§D the wall comes down through removeBuildPiece", rm.ok === true);
const layDoor = await callOk("placeBuildPiece", { kind: "door", verts: edgeVerts }, T.token);
ok("§D a door is laid on the same edge through placeBuildPiece", layDoor.ok === true && layDoor.piece?.kind === "door");
freezeBattle();
land = await callOk("getTerritory", {}, T.token);
const xDoored = land.tiles.find((t) => t.id === X.id);
ok("§D the hex behind the built door reads FIGHTING (2) again — the throw threads the gap", xDoored.light === 2, `light=${xDoored.light}`);

/* ══ §E THE FACE ══════════════════════════════════════ */
// A standing Awokin on the seed's hex — the War-Grounds
// open on the hex an Awokin stands on.
{
  const partEl = (nm, cat) => Number(db.prepare(
    "INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 2, 2, 'sky', ?, 'image/png', ?)")
    .run(nm, cat, `remove-edge-works/${nm}.png`, now).lastInsertRowid);
  const comp = JSON.stringify([["body", "sky"], ["arms", "sky"], ["head", "sky"]].map(([cat, el]) => ({
    source_id: `db:${partEl(`Edgekin ${cat}`, cat)}`, name: `Edgekin ${cat}`, category: cat, rarity: "common", power: 2, toughness: 2, element: el,
  })));
  const kinId = Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES ('Edgekin', 'Edgekin', 'remove-edge-works/kin.png', ?, 'tender', 'Edge Tender', ?, ?)")
    .run(comp, ownerKey, now).lastInsertRowid);
  db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, stance, placed_at, last_moved_at) VALUES (?, ?, ?, 'defense', ?, ?)")
    .run(ownerKey, kinId, seedTileId, now, now);
}
console.log("§E the face — the land loads, no edge-work UI stands, the door and the ward are drawn");
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, T.token);
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
await sleep(2500);
const doorBtn = await page.$(".deck-button");
if (doorBtn) await doorBtn.click();
await page.waitForSelector(".territory-svg", { timeout: 30000 }).catch(() => {});
await sleep(800);
for (let i = 0; i < 12; i++) {
  const acted = await page.evaluate(() => {
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
await page.mouse.move(700, 475);
await page.mouse.wheel({ deltaY: -900 });
await sleep(500);
await page.mouse.wheel({ deltaY: -900 });
await sleep(900);

const face = await page.evaluate(() => {
  const svg = document.querySelector(".territory-svg");
  return {
    svg: !!svg,
    doorPiece: !!document.querySelector('.build-wall-piece[data-kind="door"]'),
    wallPiece: !!document.querySelector('.build-wall-piece[data-kind="wall"]'),
    bodyText: document.body.innerText.slice(0, 4000),
  };
});
ok("§E the homeland's map stands (the territory SVG)", face.svg);
ok("§E the built door is drawn on the land", face.doorPiece);
ok("§E no built wall stands drawn (it came down in §D)", !face.wallPiece);

// The War-Grounds panel: open it and read it whole.
await page.evaluate(() => { document.querySelector(".wg-toggle")?.click(); });
await sleep(1200);
const panel = await page.evaluate(() => {
  const p = document.querySelector(".wg-panel");
  if (!p) return { open: false, text: "" };
  return { open: true, text: p.innerText, chooser: !!p.querySelector(".wg-chooser"), teach: /Teach (Warding|Runeing)/.test(p.innerText), badges: /· (🔷 Warding|🔶 Runeing)/.test(p.innerText) };
});
ok("§E the War-Grounds panel opens", panel.open);
ok("§E the panel carries no work chooser (no edge works to lay)", !panel.chooser);
ok("§E the panel carries no teaching rows", !panel.teach, panel.text.slice(0, 200));
ok("§E the panel's standing chips carry no Warding/Runeing skill badges", !panel.badges);
ok("§E the panel still carries its building seat", /Building seat/.test(panel.text));
await page.evaluate(() => { document.querySelector(".wg-toggle")?.click(); });
await sleep(600);
await page.screenshot({ path: join(SHOTS, "homeland-built-door-book-ward-lit.png") });
ok("§E the map carried no page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
await browser.close();

console.log(`\ndrive-remove-edge-works: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
