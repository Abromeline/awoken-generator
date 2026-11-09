// FLOATING TILES — the reshape of the blend build (Nigel's
// rulings, 2026-11-09): a tile floats at Z 2, Z 1 stays
// grounded; floating neighbours join as one landmass whose
// OUTER edges carry the black translucent body; a shadow
// lies beneath; Awoken and enemies walk under floaters; an
// Awokin ordered to a floating tile stands on its top; the
// bastion's own hex and the six around it never float.
//
// Boots the tree's real server on a scratch DATA_DIR and
// proves the law three ways: through the real actions
// (attune / setTenderTile / moveAwoken / setMarch), through
// the served territory, and through the real map in a
// browser (DOM geometry + pixel reads on his real textures).
// Screenshots land in ~/workspace/float-tiles-proof/.
//   node scripts/drive-float-tiles.mjs [port]
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

const ROOT = process.cwd();
const PORT = process.argv[2] ?? "3977";
const require = createRequire(join(ROOT, "package.json"));
const Database = require("better-sqlite3");
const puppeteer = createRequire("/home/hatch/workspace/tools-chrome/package.json")("puppeteer");

const OUT = "/home/hatch/workspace/float-tiles-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-float-proof-"));
process.env.PORT = PORT;
process.env.WORKSHOP_PASSWORD = "floatproof";
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
/* The walkers' figure is Nigel's real art (the Warden's first
 * frame from the game's own assets), laid into the blob store
 * the way the server's own put() lays it — content-addressed
 * bytes plus the index row — so the proof's Awokin render as
 * a true figure on the field, not a broken-image glyph. */
{
  const bytes = readFileSync(join(ROOT, "client/src/assets/tenders/warden-01.png"));
  const objectId = createHash("sha256").update(bytes).digest("hex");
  const dir = join(process.env.DATA_DIR, "blobs", "objects", objectId.slice(0, 2));
  mkdirSync(dir, { recursive: true });
  const path = join(dir, objectId);
  if (!existsSync(path)) writeFileSync(path, bytes);
  const insBlob = db.prepare("INSERT INTO blob_index (key, object_id, content_type, size_bytes, created_at_ms) VALUES (?, ?, 'image/png', ?, ?) ON CONFLICT(key) DO UPDATE SET object_id = excluded.object_id");
  for (const key of ["float-walker/Walker Body.png", "float-walker/Walker Arms.png", "float-walker/Walker Crown.png", "float-walker/walker.png"]) {
    insBlob.run(key, objectId, bytes.length, now);
  }
}
const claim = await call("claimTender", { password: "float-proof-password", tenderName: "Float Tender" });
const token = claim.token;
const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id}`;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 0, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800, class_key = 'warden', hp = 100").run(me, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(me, now);
db.prepare("INSERT INTO aspect_attunement (owner_key, element, points) VALUES (?, 'sky', 50) ON CONFLICT(owner_key, element) DO UPDATE SET points = 50").run(me);

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, spark, hp, sealed_trays, grow_points, height, z, mix_points, curse_hp, curse_max_hp, created_at) VALUES (?, ?, ?, ?, ?, 0, 10, ?, 0, ?, ?, ?, ?, ?, ?)");
function wipeWorld() {
  db.prepare("DELETE FROM territory_tiles WHERE owner_key = ?").run(me);
  db.prepare("DELETE FROM star_seeds WHERE owner_key = ?").run(me);
  db.prepare("DELETE FROM field_placements WHERE owner_key = ?").run(me);
  db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(me);
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
const setStand = (tileId) => db.prepare("UPDATE tender_progress SET tender_tile_id = ? WHERE owner_key = ?").run(tileId, me);
const skyPool = () => db.prepare("SELECT points FROM aspect_attunement WHERE owner_key = ? AND element = 'sky'").get(me).points;

/* ═══ §1 THE BASTION LOCK ═══════════════════════════════════ */
console.log("§1 the bastion lock");
wipeWorld();
const discIds = disc(3);
const bastionTileId = addRow(3, 1, 0, { element: "neutral" });
db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at, defenses, fed_energy) VALUES (?, ?, 3, 'fallen', ?, 0, 0)").run(me, bastionTileId, now);
// K: a Z-1 tile inside the ring (neighbour of the bastion hex),
// one point of Air short of the lift's price.
const kId = addRow(3, 0, 1, { element: "sky", mix: { sky: 9.5, stone: 0, tide: 0, root: 0 } });
setStand(kId);
const lockTry = await callRaw("attuneTile", { element: "sky", tileId: kId }, token);
ok("a lift that would float bastion-ring ground is refused in plain words",
  lockTry.status >= 300 && JSON.stringify(lockTry.data).includes("locked to the bastion"), JSON.stringify(lockTry.data).slice(0, 200));
ok("the refusal spends no Air point", skyPool() === 50, `pool=${skyPool()}`);
const kRow = db.prepare("SELECT z, mix_points FROM territory_tiles WHERE id = ?").get(kId);
ok("the locked tile did not lift and its Air was not spent on a lift",
  kRow.z === 1 && JSON.parse(kRow.mix_points).sky === 9.5, JSON.stringify(kRow));

/* ═══ §2 A FREE TILE LIFTS — AND FLOATS ═════════════════════ */
console.log("§2 the free lift");
wipeWorld();
disc(3);
addRow(-2, -3, 0, { element: "neutral", cursed: 1 });
const fId = addRow(-2, -3, 1, { element: "sky", mix: { sky: 9.5, stone: 0, tide: 0, root: 0 } });
setStand(fId);
const liftTry = await call("attuneTile", { element: "sky", tileId: fId }, token);
ok("a tile outside the ring attunes freely", liftTry.ok === true, JSON.stringify(liftTry).slice(0, 160));
const fRow = db.prepare("SELECT z, mix_points FROM territory_tiles WHERE id = ?").get(fId);
ok("the free tile rose to Z 2 (it floats)", fRow.z === 2, `z=${fRow.z}`);
ok("the lift spent its 10 Air from the ledger", JSON.parse(fRow.mix_points).sky === 0.5, fRow.mix_points);
ok("cursed ground stands beneath the floater at Z 0 and Z 1",
  !!rowAt(-2, -3, 0)?.cursed && !!rowAt(-2, -3, 1)?.cursed,
  JSON.stringify(db.prepare("SELECT z, cursed FROM territory_tiles WHERE owner_key = ? AND q = -2 AND r = -3").all(me)));

/* ═══ §3 THE TENDER'S ROAD: Z 1 WALKS, Z 2 LEAPS ════════════ */
console.log("§3 the tender's road");
wipeWorld();
const d3 = disc(3);
const g1Id = addRow(1, 0, 1, { element: "stone" });
db.prepare("DELETE FROM territory_tiles WHERE owner_key = ? AND q = -1 AND r = 0").run(me);
addRow(-1, 0, 0, { element: "neutral", cursed: 1 });
addRow(-1, 0, 1, { element: "neutral", cursed: 1 });
const a1Id = addRow(-1, 0, 2, { element: "root", mix: { sky: 4, stone: 6, tide: 5, root: 8 } });
setStand(d3["0,0"]);
await call("setTenderTile", { tileId: g1Id }, token);
ok("the Tender walks onto a Z-1 tile with no leap", db.prepare("SELECT tender_tile_id AS t FROM tender_progress WHERE owner_key = ?").get(me).t === g1Id);
await call("setTenderTile", { tileId: d3["0,0"] }, token);
const leapTry = await callRaw("setTenderTile", { tileId: a1Id }, token);
ok("the walking road refuses a floating tile (Z 2)",
  leapTry.status >= 300 && JSON.stringify(leapTry.data).includes("floating isle"), JSON.stringify(leapTry.data).slice(0, 160));
await call("setTenderTile", { tileId: a1Id, airborne: true }, token);
ok("a leap lands the Tender on the floating tile",
  db.prepare("SELECT tender_tile_id AS t FROM tender_progress WHERE owner_key = ?").get(me).t === a1Id);
await call("setTenderTile", { tileId: d3["0,0"] }, token);

/* ═══ §4 WALK UNDER, STEP UP, MARCH TO THE TOP ══════════════ */
console.log("§4 walk under / ordered to the top");
const u0 = rowAt(-1, 0, 0), u1 = rowAt(-1, 0, 1);
const insA = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
const parts = [["Walker Body", "body", 3, 3], ["Walker Arms", "arms", 3, 3], ["Walker Crown", "head", 3, 3]]
  .map(([n, c, p, t]) => ({ id: Number(insA.run(n, c, p, t, "stone", `float-walker/${n}.png`, now).lastInsertRowid), name: n, category: c, power: p, toughness: t, element: "stone" }));
const composition = JSON.stringify(parts.map(p => ({ source_id: `db:${p.id}`, name: p.name, category: p.category, rarity: "common", power: p.power, toughness: p.toughness, element: p.element })));
const mkAwoken = (name) => Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, 'float-walker/walker.png', ?, 'tender', 'Float Tender', ?, ?)").run(name, name, composition, me, now).lastInsertRowid);
const fieldOn = (awId, tile) => db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
  VALUES (?, ?, ?, ?, ?, 'defense', 0, 99, ?, ?, NULL, NULL, 0)`).run(me, awId, tile.id, now, now, tile.q, tile.r);
const placementOf = (awId) => db.prepare("SELECT * FROM field_placements WHERE awakened_id = ?").get(awId);

const w1 = mkAwoken("Under Walker");
fieldOn(w1, rowAt(-2, 0, 0));
await call("moveAwoken", { awakenedId: w1, tileId: u0.id }, token);
ok("an Awokin steps onto the ground beneath a floating tile", placementOf(w1).tile_id === u0.id, `tile=${placementOf(w1).tile_id}`);
await call("moveAwoken", { awakenedId: w1, tileId: a1Id }, token);
ok("a single step ordered at the floater rises to its top", placementOf(w1).tile_id === a1Id, `tile=${placementOf(w1).tile_id}`);
await call("moveAwoken", { awakenedId: w1, tileId: u0.id }, token);
ok("a single step ordered at the ground beneath comes back down", placementOf(w1).tile_id === u0.id, `tile=${placementOf(w1).tile_id}`);

const w2 = mkAwoken("March Walker");
fieldOn(w2, rowAt(-3, 0, 0));
await call("setMarch", { awakenedId: w2, tileId: u0.id }, token);
db.prepare("UPDATE field_placements SET march_ends = ? WHERE awakened_id = ?").run(Date.now() - 1000, w2);
await call("getTerritory", {}, token);
ok("a march runs UNDER the floater and stands on its ground", placementOf(w2).tile_id === u0.id, `tile=${placementOf(w2).tile_id}`);
await call("setMarch", { awakenedId: w2, tileId: a1Id }, token);
const w2march = placementOf(w2);
ok("a march ordered at the floating tile carries the rise as its last step",
  !!w2march.march_path && JSON.parse(w2march.march_path).at(-1) === a1Id, String(w2march.march_path));
db.prepare("UPDATE field_placements SET march_ends = ? WHERE awakened_id = ?").run(Date.now() - 1000, w2);
await call("getTerritory", {}, token);
ok("the marched Awokin stands ON TOP of the floating tile", placementOf(w2).tile_id === a1Id, `tile=${placementOf(w2).tile_id}`);

/* ═══ §5 AN ENEMY UNDER THE FLOATER ═════════════════════════ */
console.log("§5 the enemy beneath");
const wid = Number(db.prepare("INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl) VALUES (?, ?, 'fray', ?, 500, -1, 0, 1, 1)").run(me, u0.id, now).lastInsertRowid);
const land = await call("getTerritory", {}, token);
const wView = (land.wanderers ?? []).find(w => w.id === wid);
const wTile = wView ? land.tiles.find(t => t.id === wView.tileId) : null;
ok("a wanderer stands on the ground beneath the floater (served, grounded)",
  !!wTile && (wTile.z ?? 0) < 2 && hexDist(wTile, { q: -1, r: 0 }) <= 1,
  JSON.stringify(wView ?? null));

/* ═══ §6 THE BROWSER: GEOMETRY, BODIES, SHADOWS ═════════════ */
console.log("§6 the browser");
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
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
  // Close the teaching whispers so the screenshots show the land.
  await closeWhispers();
  await sleep(3500);
}
async function closeWhispers() {
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "×").forEach((b) => b.click());
  });
  await sleep(400);
}
async function imageBoxes() {
  return page.evaluate(() => [...document.querySelectorAll("image")].map((i) => {
    const r = i.getBoundingClientRect();
    const href = i.getAttribute("href") ?? "";
    return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2,
      kind: href.startsWith("data:image") ? "data" : (href.split("/").pop() ?? href).slice(0, 44),
      href };
  }).filter((b) => b.w > 30));
}
async function shadowCount() {
  return page.evaluate(() => [...document.querySelectorAll("ellipse")].filter((e) => e.getAttribute("fill") === "rgba(0,0,0,0.32)").length);
}
async function shadowBoxes() {
  return page.evaluate(() => [...document.querySelectorAll("ellipse")]
    .filter((e) => e.getAttribute("fill") === "rgba(0,0,0,0.32)")
    .map((e) => { const r = e.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: r.width, h: r.height }; }));
}
/** Classify data images by their own pixels: the black wash
 *  (cliff / group body) is pure black at alpha through its
 *  lower half; a blended face is coloured art. */
async function classifyData() {
  return page.evaluate(async () => {
    const out = [];
    for (const i of document.querySelectorAll("image")) {
      const href = i.getAttribute("href") ?? "";
      if (!href.startsWith("data:image")) continue;
      const r = i.getBoundingClientRect();
      if (r.width < 30) continue;
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = href; });
      const cv = document.createElement("canvas");
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const ctx = cv.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, cv.width, cv.height).data;
      let wash = 0, opaque = 0, total = 0;
      for (let y = Math.floor(cv.height * 0.5); y < cv.height; y += 3) {
        for (let x = 0; x < cv.width; x += 3) {
          const o = (y * cv.width + x) * 4;
          total++;
          if (px[o + 3] > 40) { opaque++; if (px[o] < 30 && px[o + 1] < 30 && px[o + 2] < 30) wash++; }
        }
      }
      out.push({ x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2,
        washFrac: opaque ? wash / opaque : 0, href });
    }
    return out;
  });
}

/* Shot A — Z 1 grounded beside Z 2 floating */
wipeWorld();
disc(2);
db.prepare("DELETE FROM territory_tiles WHERE owner_key = ? AND ((q = 1 AND r = 0) OR (q = -1 AND r = 0))").run(me);
addRow(1, 0, 0, { cursed: 1 });
addRow(1, 0, 1, { element: "stone", height: 2, sealed: 1 });
addRow(-1, 0, 0, { cursed: 1 });
addRow(-1, 0, 1, { cursed: 1 });
const shotA2 = addRow(-1, 0, 2, { element: "root", mix: { sky: 4, stone: 6, tide: 5, root: 8 } });
setStand(rowAt(0, 0, 0).id);
await openLand();
const shadowsA = await shadowCount();
ok("shot A: exactly one shadow — the floater's; the grounded Z-1 tile casts none", shadowsA === 1, `shadows=${shadowsA}`);
const clsA = await classifyData();
const washA = clsA.filter((c) => c.washFrac > 0.2);
ok("shot A: two black-wash images — the Z-1 stack's side and the floater's body", washA.length === 2,
  JSON.stringify(clsA.map((c) => ({ w: Math.round(c.w), wash: Number(c.washFrac.toFixed(2)) }))));
const facesA = clsA.filter((c) => c.washFrac <= 0.2).sort((a, b) => a.cx - b.cx);
const faceA2 = facesA[0];
const g1Face = facesA[facesA.length - 1];
ok("shot A: the floating face stands well above the grounded stack's face",
  !!faceA2 && !!g1Face && faceA2.cy < g1Face.cy - 30,
  JSON.stringify({ a2: faceA2 && Math.round(faceA2.cy), g1: g1Face && Math.round(g1Face.cy) }));
const shadowA = (await shadowBoxes())[0];
ok("shot A: the floater's shadow lies on the ground below its face (the hover gap)",
  !!faceA2 && !!shadowA && shadowA.cy > faceA2.cy + faceA2.h * 0.25,
  JSON.stringify({ face: faceA2 && Math.round(faceA2.cy), shadow: shadowA && Math.round(shadowA.cy) }));
await closeWhispers();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 2 });
await sleep(1000);
await page.screenshot({ path: join(OUT, "z1-grounded-z2-floating.png") });
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });

/* Shot B — the joined pair + a lone floater + a unit beneath */
wipeWorld();
disc(3);
for (const [q, r] of [[-1, 0], [-2, 0], [2, 1]]) {
  db.prepare("DELETE FROM territory_tiles WHERE owner_key = ? AND q = ? AND r = ?").run(me, q, r);
  addRow(q, r, 0, { cursed: 1 });
  addRow(q, r, 1, { cursed: 1 });
}
const p1 = addRow(-1, 0, 2, { element: "root", mix: { sky: 4, stone: 6, tide: 5, root: 8 } });
const p2 = addRow(-2, 0, 2, { element: "root", mix: { sky: 4, stone: 6, tide: 5, root: 8 } });
const lone = addRow(2, 1, 2, { element: "root", mix: { sky: 4, stone: 6, tide: 5, root: 8 } });
setStand(rowAt(0, 0, 0).id);
const w3 = mkAwoken("Under Stander");
fieldOn(w3, rowAt(-2, 0, 0));
await openLand();
const shadowsB = await shadowCount();
ok("shot B: a shadow beneath each floating tile (pair + lone)", shadowsB === 3, `shadows=${shadowsB}`);
const clsB = await classifyData();
const washB = clsB.filter((c) => c.washFrac > 0.2);
ok("shot B: exactly two black bodies — one for the joined pair, one for the lone floater", washB.length === 2,
  JSON.stringify(clsB.map((c) => ({ w: Math.round(c.w), h: Math.round(c.h), wash: Number(c.washFrac.toFixed(2)) }))));
if (washB.length === 2) {
  const [wide, narrow] = [...washB].sort((a, b) => b.w - a.w);
  ok("the pair's body is one wide body, not two tile bodies", wide.w > 1.4 * narrow.w, `wide=${Math.round(wide.w)} narrow=${Math.round(narrow.w)}`);
  // THE JOIN: down the body's column at the seam between the
  // two faces, the wash runs unbroken — no notch, no gap.
  const facesB = (await imageBoxes()).filter((b) => b.kind === "data");
  facesB.sort((a, b) => a.cx - b.cx);
  const join = await page.evaluate(async ({ href, fx }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = href; });
    const cv = document.createElement("canvas");
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const ctx = cv.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const colX = Math.floor(fx * cv.width);
    let solid = 0, total = 0;
    for (let y = Math.floor(cv.height * 0.45); y < cv.height * 0.95; y += 4) {
      const o = (y * cv.width + colX) * 4;
      total++;
      if (px[o + 3] > 60) solid++;
    }
    return total ? solid / total : 0;
  }, { href: wide.href, fx: 0.5 });
  ok("down the pair's join the black wash runs unbroken (no seam, no notch)", join > 0.9, `join=${join.toFixed(2)}`);
}
/* §6b THE PAINTER'S LAW AT THE CURSED BORDER (defect fix,
 * 2026-11-09 — Nigel, from these very proof shots: "I can see
 * the corrupted hex showing above the hexes that should be
 * above it"). The cursed ground beneath the pair must end at
 * its own southern border: the grey hexes directly south of
 * it paint OVER its bottom edge. What spreads past that
 * border on the broken build is not one thing but three, all
 * riding inside the cursed tile's own drawing: the face
 * canvas's dark skirt below the painted face (source ink to
 * y ≈1475 of 1510, where an element face ends at ≈1235 of
 * 1280), the corruption halo's rim (ry 0.92·s against the
 * face's 0.60·s southern reach), and the 1.14× glow polygon.
 * The fix clips all three to the tile's own fitted cell.
 * The check reads the REAL rendered page (a clipped
 * screenshot, decoded in-page): a window over the two
 * southern neighbours' faces, just below the shared border —
 * ground no other cursed hex's face can reach (the frontier
 * hexes' own faces end at their own borders; their southern
 * row lies a full hex-step further down). On the broken
 * build the skirt band crosses the window as a hard red
 * stripe (~40% of its pixels carry the curse's red channel
 * dominance); on the fixed build the window is the grey
 * neighbours' own art (red dominance under 1%, measured).
 * MEASUREMENT CORRECTION (2026-11-09, second pass — proved
 * from the retaken proof shot's own pixels, not assumed):
 * the rectangle as first drawn also catches a wedge of the
 * EAST under-floater's OWN fitted cell. The three cells —
 * west cursed, east cursed, and the grey south-east
 * neighbour — meet at one vertex (the west cell's BR
 * corner, the east cell's L corner, the grey cell's TR
 * corner, one point), and the grey/east shared edge runs
 * from that vertex south-east across the rectangle's
 * eastern end: every window pixel east of that edge is
 * inside the east cursed hex's own cell, on its own lawful
 * face. Measured on the fixed build's retaken shot (window
 * at DSF1 (43,428) 332×26, west centre (209,333), s=151):
 * the east cell's wedge is 20.4% of the window's pixels and
 * 82% of them are red-dominant — a 16.7% contribution,
 * which is the whole of the 16.66% the uncorrected check
 * reported — while the window pixels inside the two grey
 * neighbours' own cells measure 0.5% (south-west) and 0.0%
 * (south-east) red-dominant. So the count below keeps the
 * window, the 10% threshold and the red rule exactly as
 * they were, and counts only the pixels that lie on the
 * two southern neighbours' side of their shared edge with
 * the east cursed cell (the edge's endpoints are returned
 * with the window's geometry, from the same FACE_HEX
 * measures the map is drawn with). On the broken build the
 * skirt crosses onto the grey faces themselves, west of
 * that edge, and the check still fails there. */
{
  const geo = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll("image")];
    const boxes = [];
    for (const i of imgs) {
      const r = i.getBoundingClientRect();
      if (r.width < 30) continue;
      boxes.push({ x: r.x, y: r.y, w: r.width, h: r.height, href: i.getAttribute("href") ?? "" });
    }
    const cursed = boxes.filter((b) => b.href.includes("cursed-v3"));
    const faces = boxes.filter((b) => b.href.startsWith("data:image"));
    if (cursed.length < 2 || !faces.length) return null;
    // The pair: the group's two blended faces — side by side,
    // one's centre exactly one east step (245, 89) from the
    // other's at this zoom (the lattice's own measure).
    const tilesOnly = faces.filter((f) => f.w < 500 && f.h < 320);
    let westFace = null;
    for (const f of tilesOnly) {
      if (tilesOnly.some((g) => g !== f && Math.abs(g.x - f.x - 245) < 6 && Math.abs(g.y - f.y - 89) < 6)) { westFace = f; break; }
    }
    if (!westFace) return null;
    // The cursed row beneath the pair's west floater: same
    // hex — its image centre stands within one hex-step south
    // of the face's centre (the face hovers one float-step
    // north of its ground).
    const faceCx = westFace.x + westFace.w / 2, faceCy = westFace.y + westFace.h / 2;
    const under = cursed.filter((c) => Math.abs(c.x + c.w / 2 - faceCx) < 6 && (c.y + c.h / 2) > faceCy && (c.y + c.h / 2) < faceCy + 200)
      .sort((a, b) => b.y - a.y)[0];
    if (!under) return null;
    // The cursed face's own centre: the canvas seats its face
    // centre (source 960, 790 of 1920×1510) on the tile's
    // lattice point — recover it from the image box.
    const ccx = under.x + under.w * (960 / 1920), ccy = under.y + under.h * (790 / 1510);
    const s = under.w / 2.41; // the map's tile size, from the image's own measure
    // The window: across the two southern neighbours' shared
    // width, from just below the border (the face's southern
    // vertices stand 0.60·s below its centre) to 0.80·s.
    // The grey south-east neighbour's shared edge with the
    // EAST cursed cell (see the correction above): from the
    // three-cell vertex — this cell's BR corner, FACE_HEX
    // (431, 476) at s/796 per source px — to the grey cell's
    // R corner, which is the east cell's BL corner: the grey
    // centre (one SE step, (0, 948)) plus (861, −6). Returned
    // in window-local pixels; the count keeps the grey side.
    const wx = Math.round(ccx - 1.1 * s), wy = Math.round(ccy + 0.63 * s);
    const k = s / 796;
    return {
      x: wx, y: wy,
      width: Math.round(2.2 * s), height: Math.round(0.17 * s),
      edge: {
        x1: ccx + 431 * k - wx, y1: ccy + 476 * k - wy,
        x2: ccx + 861 * k - wx, y2: ccy + 942 * k - wy,
      },
    };
  });
  let paint = null;
  if (geo && geo.x >= 0 && geo.y >= 0) {
    const shot = await page.screenshot({ clip: { x: geo.x, y: geo.y, width: geo.width, height: geo.height } });
    paint = await page.evaluate(async ({ b64, edge }) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = "data:image/png;base64," + b64; });
      const cv = document.createElement("canvas");
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const ctx = cv.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
      // Only pixels on the southern neighbours' side of the
      // grey/east shared edge are counted (the correction
      // above): the edge runs from (x1, y1) to (x2, y2); the
      // grey side is the one the south-east neighbour's own
      // centre falls on (positive cross product, measured).
      const dx = edge.x2 - edge.x1, dy = edge.y2 - edge.y1;
      let redDom = 0, total = 0, excluded = 0;
      for (let py = 0; py < cv.height; py++) {
        for (let px = 0; px < cv.width; px++) {
          const cross = dx * (py + 0.5 - edge.y1) - dy * (px + 0.5 - edge.x1);
          if (cross < 0) { excluded++; continue; }
          const o = (py * cv.width + px) * 4;
          total++;
          if (data[o] - data[o + 1] > 12) redDom++;
        }
      }
      return { redDomFrac: total ? redDom / total : 0, total, excluded };
    }, { b64: Buffer.from(shot).toString("base64"), edge: geo.edge });
    console.log("  §6b measured red fraction over the two southern neighbours:", paint ? paint.redDomFrac.toFixed(4) : "unmeasured",
      paint ? `(counted ${paint.total} px, excluded ${paint.excluded} px inside the east cursed hex's own cell)` : "");
  }
  ok("the cursed ground under the pair ends at its own southern border — no red crosses onto the grey hexes below",
    !!paint && paint.redDomFrac < 0.10,
    JSON.stringify({ geo, paint }));
}
const walkerImgs = (await imageBoxes()).filter((b) => b.href.includes("ZmxvYXQtd2Fsa2Vy"));
const facesOnlyB = clsB.filter((c) => c.washFrac <= 0.2);
const p2Face = [...facesOnlyB].sort((a, b) => a.cx - b.cx)[0];
ok("the Awokin beneath the pair stands in the open, below the floater's face",
  walkerImgs.length > 0 && !!p2Face && Math.min(...walkerImgs.map((b) => b.cy)) > p2Face.cy,
  JSON.stringify({ walker: walkerImgs.map((b) => Math.round(b.cy)), face: p2Face && Math.round(p2Face.cy) }));
await closeWhispers();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 2 });
await sleep(1000);
await page.screenshot({ path: join(OUT, "joined-pair-and-under.png") });

/* Shot C — the same Awokin, ordered to the top, standing on it */
db.prepare("UPDATE field_placements SET tile_id = ?, pos_q = -1, pos_r = 0 WHERE awakened_id = ?").run(p1, w3);
await openLand();
const walkerTop = (await imageBoxes()).filter((b) => b.href.includes("ZmxvYXQtd2Fsa2Vy"));
const clsC = await classifyData();
const facesC = clsC.filter((c) => c.washFrac <= 0.2);
const wCx = walkerTop.length ? Math.min(...walkerTop.map((b) => b.cx)) : 0;
const wCy = walkerTop.length ? Math.min(...walkerTop.map((b) => b.cy)) : 0;
const p1Face = [...facesC].sort((a, b) => Math.hypot(a.cx - wCx, a.cy - wCy) - Math.hypot(b.cx - wCx, b.cy - wCy))[0];
ok("the Awokin on top stands at the floater's own height",
  walkerTop.length > 0 && !!p1Face && Math.abs(Math.min(...walkerTop.map((b) => b.cy)) - p1Face.cy) < p1Face.h,
  JSON.stringify({ walker: walkerTop.map((b) => Math.round(b.cy)), face: p1Face && Math.round(p1Face.cy) }));
await closeWhispers();
await page.screenshot({ path: join(OUT, "on-top-of-the-floater.png") });

await browser.close();
console.log(`\ndrive-float-tiles: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
