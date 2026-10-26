// drive-depth-pillars — DEPTH BY BASE LINE + PILLAR COLLISION
// (Nigel, 2026-10-26: "in matters of perspective can we make a
// character walk behind a building at this point but in front
// if they are in front of the base? consider beacons and
// towers as pillars on the map with collision?").
// Proven on the real work, both grounds:
//   §A THE REGISTRY, at the server's own exports: a landing
//      point on a pillar's heart is set to its rim; a step
//      through a pillar's base is barred, a step passing
//      wide is not; the door's gap still stands open in the
//      shipped geometry and a plain wall still bars (slice
//      1's law unbroken at the unit level).
//   §B PILLAR COLLISION, server-settled on the homeland:
//      a march ordered onto a watchtower's own hex, its free
//      point named as the hex's heart, lands the figure
//      BESIDE the tower (on the hex, at the rim, never
//      within); the dark's walk halts at the tower's base
//      and walks on once the tower is gone.
//   §C THE FACE, in a real browser on the homeland: the
//      Tender's stride crosses the first seed's heart freely
//      while it lies a Starseed (control); once grown to a
//      Beacon the same stride rounds its base at the rim
//      and still arrives; a field figure standing behind a
//      watchtower's base line is DRAWN BEFORE the tower and
//      the same figure in front is drawn after it; the same
//      pair against the Beacon. Screenshots keep the pairs.
//   §D THE TABLE: a hosted land whose seed stands grown
//      (its record sculpted to level 3, a named fixture) —
//      a guest gliding at the seed's heart is set out to the
//      rim and still stands on the seed's hex (the feeding
//      ground is kept); in the room's own face, a tender
//      behind the Beacon's base is drawn before it and a
//      tender in front is drawn after it.
// Run after `npm run build`:
//   PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-depth-pillars.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

// The env must stand BEFORE any dist import: the store
// reads DATA_DIR at module init.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-depth-"));
process.env.PORT = "39955";
process.env.WORKSHOP_PASSWORD = "depth-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const GEO = await import("../server/dist/buildGeometry.js");
const { segmentsCrossProper, collisionSegments } = GEO;
const ACT = await import("../server/dist/actions.js");
const { standingPillars, stepCrossesPillar, pillarFreePoint, PILLAR_RADIUS_TOWER, PILLAR_RADIUS_BEACON } = ACT;
const BASE = "http://127.0.0.1:39955";
const PW = "depth-drive-password";
const SHOTS = "/home/hatch/workspace/depth-pillars-proof";
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
  if (r.status !== 200) throw new Error(`${action} -> ${r.status}: ${JSON.stringify(r.raw).slice(0, 200)}`);
  return r.body;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up, as the other drives do */ }
const now = Date.now();
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

/* ══ THE WORLD: a fresh Tender and their sown land ══════════ */
const claim = await callOk("claimTender", { password: PW, tenderName: "Depth Tender" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
const token = claim.token;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 3, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', total_exp = 3800, hp = 100").run(ownerKey, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 900, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 900").run(ownerKey, now);
await callOk("ensureFirstSeed", {}, token);
let land = await callOk("getTerritory", {}, token);
const tileAt = (q, r) => land.tiles.find(t => t.q === q && t.r === r);
ok("the sown land stands (tiles served)", land.tiles.length >= 19, `${land.tiles.length} tiles`);
const seedRow = db.prepare("SELECT id, tile_id AS tileId FROM star_seeds WHERE owner_key = ? ORDER BY id LIMIT 1").get(ownerKey);
const seedTile = land.tiles.find(t => t.id === seedRow?.tileId);
ok("the first seed stands on the land", !!seedTile, JSON.stringify(seedRow));

/* ══ §A THE REGISTRY ════════════════════════════════════════ */
console.log("§A the registry — rim, barred steps, and the door's gap unbroken");
{
  const pillars = [{ q: 0, r: 0, radius: PILLAR_RADIUS_TOWER, kind: "tower" }];
  const heart = pillarFreePoint(pillars, 0, 0);
  ok("§A a landing on the pillar's heart is set to its rim", Math.abs(Math.hypot(heart.q, heart.r) - PILLAR_RADIUS_TOWER) < 1e-9, JSON.stringify(heart));
  const inside = pillarFreePoint(pillars, 0.05, 0.02);
  ok("§A a landing inside the base is set out to the rim, on its own ray", Math.abs(Math.hypot(inside.q, inside.r) - PILLAR_RADIUS_TOWER) < 1e-9, JSON.stringify(inside));
  const wide = pillarFreePoint(pillars, 0.6, 0);
  ok("§A a landing beyond the base is untouched", wide.q === 0.6 && wide.r === 0, JSON.stringify(wide));
  ok("§A a step through the pillar's heart is barred", stepCrossesPillar(pillars, -0.6, 0, 0.6, 0));
  ok("§A a step passing half a hex wide is not barred", !stepCrossesPillar(pillars, -0.6, 0.5, 0.6, 0.5));
  ok("§A the beacon's radius is the wider pencil", PILLAR_RADIUS_BEACON > PILLAR_RADIUS_TOWER, `${PILLAR_RADIUS_BEACON} vs ${PILLAR_RADIUS_TOWER}`);
  // Slice 1's door law, in the shipped geometry (as drive-hex-build §G):
  const a = [0, 0], b = [1, 0];
  const doorSegs = collisionSegments("door", [a, b]);
  const midStep = [[0.5, -0.4], [0.5, 0.4]];
  const partStep = [[0.15, -0.4], [0.15, 0.4]];
  ok("§A a step through a door's open middle still crosses no collision segment",
    !doorSegs.some(([s, t]) => segmentsCrossProper(midStep[0], midStep[1], s, t)));
  ok("§A the same step at the door's standing part is still barred",
    doorSegs.some(([s, t]) => segmentsCrossProper(partStep[0], partStep[1], s, t)));
  const wallSegs = collisionSegments("wall", [a, b]);
  ok("§A a plain wall still bars the middle step",
    wallSegs.some(([s, t]) => segmentsCrossProper(midStep[0], midStep[1], s, t)));
}

/* ══ THE TOWER ══════════════════════════════════════════════ */
// The tower stands where §B's walk needs it: on the middle
// tile of a straight run — cursed → mid → pure, the pure
// tile the dark's nearest. The run is found first and the
// tower placed on it (a mid of purified ground preferred,
// the seed's own tile never).
let walkRun = null;
{
  const candidates = [];
  for (const t of land.tiles) {
    if (!t.cursed) continue;
    for (const [dq, dr] of DIRS) {
      const m = tileAt(t.q + dq, t.r + dr), b = tileAt(t.q + 2 * dq, t.r + 2 * dr);
      if (!m || !b || b.cursed) continue;
      if (seedTile && m.id === seedTile.id) continue;
      const nearest = Math.min(...land.tiles.filter(x => !x.cursed).map(x => hexDist(t, x)));
      if (hexDist(t, b) === nearest) candidates.push({ from: t, mid: m, to: b });
    }
  }
  candidates.sort((a, b) => (a.mid.cursed ? 1 : 0) - (b.mid.cursed ? 1 : 0));
  walkRun = candidates[0] ?? null;
}
ok("a cursed tile runs in a straight line to its nearest pure ground (the dark's walk for §B)", !!walkRun,
  JSON.stringify(land.tiles.map(t => [t.q, t.r, t.cursed])));
const towerTile = walkRun?.mid ?? [...land.tiles]
  .filter(t => !t.cursed && seedTile && hexDist(t, seedTile) === 1)
  .sort((a, b) => a.id - b.id)[0];
ok("the tower's tile stands chosen (the walk's middle tile)", !!towerTile, JSON.stringify(towerTile));
const towerIns = db.prepare("INSERT INTO territory_buildings (owner_key, tile_id, building_type, status, placed_at, ready_at) VALUES (?, ?, 'watchtower', 'active', ?, ?)")
  .run(ownerKey, towerTile.id, now - 3600000, now - 3600000);
const towerId = Number(towerIns.lastInsertRowid);
{
  const pillars = standingPillars(ownerKey);
  ok("§A the registry reads the tower as a pillar at its tile's heart",
    pillars.some(p => p.kind === "tower" && p.q === towerTile.q && p.r === towerTile.r && Math.abs(p.radius - PILLAR_RADIUS_TOWER) < 1e-9),
    JSON.stringify(pillars));
  ok("§A the ungrown seed pillars nothing yet", !pillars.some(p => p.kind === "beacon" || p.kind === "sapling"), JSON.stringify(pillars));
}

/* ══ THE COMPANY ════════════════════════════════════════════ */
const insAsset = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
function seedCompany(names) {
  const parts = [["Sky Cloth", "body", 3, 3], ["Sky Cord", "arms", 3, 3], ["Sky Crown", "head", 3, 3]]
    .map(([n, c, p, t]) => ({ id: Number(insAsset.run(n, c, p, t, "sky", `depthprobe/${n}.png`, now).lastInsertRowid), name: n, category: c, power: p, toughness: t, element: "sky" }));
  const composition = JSON.stringify(parts.map(p => ({ source_id: `db:${p.id}`, name: p.name, category: p.category, rarity: "common", power: p.power, toughness: p.toughness, element: p.element })));
  const ins = db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', 'Depth Tender', ?, ?)");
  return names.map(n => Number(ins.run(n, n, `depthprobe/${n}.png`, composition, ownerKey, now).lastInsertRowid));
}
const company = seedCompany(["Depth Guard", "Depth Second", "Depth Third"]);
await callOk("deployFirstSeed", { awakenedIds: [company[0]] }, token);
land = await callOk("getTerritory", {}, token);
const guard = land.placements.find(p => p.awakenedId === company[0]);
ok("the guard stands on the field", !!guard, JSON.stringify(guard));

/* ══ §B1 THE MARCH LANDING ══════════════════════════════════ */
console.log("§B pillar collision — the march landing and the dark's walk");
if (guard) {
  // March the guard OFF the tower's hex first if it stands there.
  const awayTile = [...land.tiles].filter(t => t.id !== towerTile.id && seedTile && hexDist(t, seedTile) === 2).sort((a, b) => a.id - b.id)[0];
  const settleTo = async (tileId, pos) => {
    await callOk("setMarch", { awakenedId: company[0], tileId, ...(pos ? { posQ: pos[0], posR: pos[1] } : {}) }, token);
    db.prepare("UPDATE field_placements SET march_ends = ? WHERE owner_key = ? AND awakened_id = ?").run(Date.now() - 1000, ownerKey, company[0]);
    land = await callOk("getTerritory", {}, token);
    return land.placements.find(p => p.awakenedId === company[0]);
  };
  let g = guard;
  if (g.tileId === towerTile.id && awayTile) g = await settleTo(awayTile.id, null);
  // The march onto the tower's hex, its free point named as
  // the hex's very heart — the pillar's centre itself.
  g = await settleTo(towerTile.id, [towerTile.q, towerTile.r]);
  const dHeart = Math.hypot((g?.posQ ?? 0) - towerTile.q, (g?.posR ?? 0) - towerTile.r);
  ok("§B the march lands ON the tower's hex (the hex is not barred — the pillar is)",
    !!g && g.tileId === towerTile.id, JSON.stringify(g));
  ok("§B …but BESIDE the tower: its point stands at the rim, never within the base",
    !!g && dHeart >= PILLAR_RADIUS_TOWER - 1e-6 && dHeart <= PILLAR_RADIUS_TOWER + 0.05,
    `dist ${dHeart.toFixed(3)} pos ${g?.posQ},${g?.posR}`);
  // The guard marches home before §B's walk: a company
  // member standing at the tower would ENGAGE the dark and
  // stop its walk for the wrong reason.
  if (seedTile) await settleTo(seedTile.id, null);
}

/* ══ §B2 THE DARK'S WALK AT THE TOWER ═══════════════════════ */
{
  // The run found above: cursed → the tower's tile → pure
  // (the choreography of drive-hex-build §D, the tower
  // standing where its wall stood).
  const run = walkRun;
  ok("§B the run passes through the tower's tile", !!run && run.mid.id === towerTile.id,
    `tower at ${towerTile.q},${towerTile.r}`);
  if (run) {
    const distToGoal = (p) => Math.hypot(p[0] - run.to.q, p[1] - run.to.r);
    const distToTower = (p) => Math.hypot(p[0] - towerTile.q, p[1] - towerTile.r);
    const ins = db.prepare("INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, pos_q, pos_r, hp, lvl, power) VALUES (?, ?, 'unraveler', ?, ?, ?, 40, 5, 1)")
      .run(ownerKey, run.from.id, now, run.from.q, run.from.r);
    const darkId = Number(ins.lastInsertRowid);
    db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now() - 55000, ownerKey);
    await callOk("getTerritory", {}, token);
    let row = db.prepare("SELECT pos_q AS q, pos_r AS r FROM homeland_wanderers WHERE id = ?").get(darkId);
    ok("§B the dark walked — and halted at the tower's base, never through it, never reaching the pure ground",
      !!row
      && Math.hypot(row.q - run.from.q, row.r - run.from.r) > 0.05
      && distToTower([row.q, row.r]) >= 0.12
      && distToTower([row.q, row.r]) <= 0.5
      && distToGoal([row.q, row.r]) > 0.8,
      JSON.stringify({ row, from: [run.from.q, run.from.r], to: [run.to.q, run.to.r], tower: [towerTile.q, towerTile.r] }));
    // Take the tower away: the same dark walks on.
    db.prepare("DELETE FROM territory_buildings WHERE id = ?").run(towerId);
    db.prepare("UPDATE homeland_wanderers SET pos_q = ?, pos_r = ?, tile_id = ? WHERE id = ?").run(run.from.q, run.from.r, run.from.id, darkId);
    db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now() - 55000, ownerKey);
    await callOk("getTerritory", {}, token);
    row = db.prepare("SELECT pos_q AS q, pos_r AS r FROM homeland_wanderers WHERE id = ?").get(darkId);
    ok("§B with the tower gone, the same dark walks on toward the pure ground",
      !!row && distToGoal([row.q, row.r]) < distToGoal([run.from.q, run.from.r]) - 0.5,
      JSON.stringify(row));
    db.prepare("DELETE FROM homeland_wanderers WHERE id = ?").run(darkId);
    // The tower stands again for the face proofs.
    db.prepare("INSERT INTO territory_buildings (id, owner_key, tile_id, building_type, status, placed_at, ready_at) VALUES (?, ?, ?, 'watchtower', 'active', ?, ?)")
      .run(towerId, ownerKey, towerTile.id, now - 3600000, now - 3600000);
  }
}

/* ══ §C THE FACE — HOMELAND ═════════════════════════════════ */
console.log("§C the face — stride and draw order on the real homeland");
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:depth]", String(e).slice(0, 200)));
await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
// The app re-frames itself in the breaths after a load
// (its own session/world handshakes); a detached frame is
// a race to out-wait, never a verdict. Every read of the
// page goes through this retry.
async function evalRetry(fn, tries = 4) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try { return await page.evaluate(fn); }
    catch (e) {
      lastErr = e;
      if (!/detached Frame|Execution context was destroyed|Cannot find context/i.test(String(e))) throw e;
      await sleep(1000);
    }
  }
  throw lastErr;
}
async function enterTerritory() {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2500);
  const door = await page.$(".deck-button");
  if (!door) throw new Error("territory: no .deck-button on the home face");
  await door.click();
  await page.waitForFunction(() => !!window.__tenderJump && !!window.__tenderJump.pos(), { timeout: 30000 });
  await sleep(1500);
  await evalRetry(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Skip");
    if (b) b.click();
  });
  await sleep(1200);
}
async function clearOverlays() {
  await evalRetry(() => {
    const cer = [...document.querySelectorAll(".ceremony-card button")].find((b) => b.textContent.trim() === "Tend on");
    if (cer) cer.click();
    const rep = document.querySelector(".return-report-overlay:not(:has(.ceremony-card))");
    if (rep) rep.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    const p = document.querySelector(".admin-popup");
    if (p) p.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    document.querySelector(".margin-guide-dismiss")?.click();
  });
  await sleep(500);
}
// Land ↔ screen through the land's own transform (the
// drive-hex-build pattern) for the taps; the Tender's
// position is read in the svg's OWN user units
// (__tenderJump.pos()), and distances along a straight run
// are measured in that space against the run's endpoints —
// no camera constant is assumed: the run's two end stands
// are read where he actually stood, and the seed's heart
// is their midpoint, the run being symmetric about it.
const landClient = async (lx, ly) => {
  let lastErr = null;
  for (let i = 0; i < 4; i++) {
    try {
      return await page.evaluate((x, y) => {
        const g = document.querySelector(".land-cam");
        const p = new DOMPoint(x, y).matrixTransform(g.getScreenCTM());
        return { x: p.x, y: p.y };
      }, lx, ly);
    } catch (e) {
      lastErr = e;
      if (!/detached Frame|Execution context was destroyed|Cannot find context/i.test(String(e))) throw e;
      await sleep(1000);
    }
  }
  throw lastErr;
};
const landOfTile = (q, r) => ({ x: 250 + q * 1292 * (54 / 796) + r * 0, y: 170 + q * 470 * (54 / 796) + r * 948 * (54 / 796) });
async function tapTile(q, r) {
  const lp = landOfTile(q, r);
  const sp = await landClient(lp.x, lp.y);
  await page.mouse.click(sp.x, sp.y);
}
const tenderPos = () => evalRetry(() => window.__tenderJump.pos());
const tenderAnchor = () => evalRetry(() => window.__tenderJump.anchor());
async function glideTo(tile, ms = 22000) {
  await tapTile(tile.q, tile.r);
  const t0 = Date.now();
  let retapped = false;
  while (Date.now() - t0 < ms) {
    if ((await tenderAnchor()) === tile.id) { await sleep(350); return true; }
    if (!retapped && Date.now() - t0 > 8000) { retapped = true; await tapTile(tile.q, tile.r); }
    await sleep(150);
  }
  return (await tenderAnchor()) === tile.id;
}
// Glide from tile S to tile N across the seed's heart,
// sampling his user-unit positions; returns the closest
// approach to the heart in AXIAL units (the S→N span is
// hexDist(S, N) axial units long, and the heart is the
// span's midpoint, S and N standing symmetric about it).
async function crossSampling(S, N) {
  const arrivedS = await glideTo(S);
  const pS = await tenderPos();
  await tapTile(N.q, N.r);
  const samples = [];
  const t0 = Date.now();
  let arrived = false;
  while (Date.now() - t0 < 30000) {
    const p = await tenderPos();
    if (p) samples.push(p);
    if ((await tenderAnchor()) === N.id) { arrived = true; break; }
    await sleep(100);
  }
  await sleep(350);
  const pN = await tenderPos();
  const span = pS && pN ? Math.hypot(pN.x - pS.x, pN.y - pS.y) : 0;
  const mid = pS && pN ? { x: (pS.x + pN.x) / 2, y: (pS.y + pN.y) / 2 } : null;
  const axialSpan = hexDist(S, N);
  let min = Infinity;
  if (mid && span > 0) for (const p of samples) min = Math.min(min, Math.hypot(p.x - mid.x, p.y - mid.y) / span * axialSpan);
  return { min, arrived, arrivedS, samples: samples.length };
}

await enterTerritory();
await clearOverlays();
const tileSouth2 = tileAt(seedTile.q, seedTile.r + 2);
const tileNorth2 = tileAt(seedTile.q, seedTile.r - 2);
ok("the seed's run stands — tiles two steps south and north of it", !!tileSouth2 && !!tileNorth2,
  `seed at ${seedTile?.q},${seedTile?.r}`);
// §C1 CONTROL: the seed lies a Starseed — the stride crosses
// its heart on the straight road south→north.
if (tileSouth2 && tileNorth2) {
  const run = await crossSampling(tileSouth2, tileNorth2);
  ok("§C control — a Starseed pillars nothing: the stride crosses its heart (min distance < 0.15)",
    run.min < 0.15, `min ${run.min.toFixed(3)} over ${run.samples} samples`);
  ok("§C control — he arrives at the northern tile", run.arrived, `arrivedS=${run.arrivedS}`);
}
// Grow the seed to a Beacon (level 3) in the record — the
// growth the feeding road would have written.
db.prepare("UPDATE star_seeds SET level = 3, fed_energy = 30, state = 'held' WHERE id = ?").run(seedRow.id);
{
  const pillars = standingPillars(ownerKey);
  ok("§C the registry now reads the grown seed as the beacon pillar",
    pillars.some(p => p.kind === "beacon" && Math.abs(p.radius - PILLAR_RADIUS_BEACON) < 1e-9), JSON.stringify(pillars));
}
await enterTerritory();
await clearOverlays();
// §C2 THE PILLAR ON THE STRIDE: south, then north again —
// the road now rounds the Beacon's base.
if (tileSouth2 && tileNorth2) {
  const run = await crossSampling(tileSouth2, tileNorth2);
  ok("§C the Beacon is a pillar: the stride never enters its base (min distance ≥ the rim, less slack)",
    run.min >= PILLAR_RADIUS_BEACON - 0.045, `min ${run.min.toFixed(3)} rim ${PILLAR_RADIUS_BEACON} over ${run.samples} samples`);
  ok("§C …and he still ARRIVES north — he walked around the post, not into a wall",
    run.arrived, `arrivedS=${run.arrivedS}`);
}
// §C3/§C4 DRAW ORDER: the guard behind/in front of the tower,
// then the same pair against the Beacon. The figure's place
// is set in the record; the page is re-read between places.
const domOrder = () => evalRetry(() => {
  const svg = document.querySelector(".territory-svg");
  if (!svg) return null;
  const imgs = [...svg.querySelectorAll("image")];
  const href = (el) => el?.getAttribute("href") ?? "";
  const tower = imgs.find(i => href(i).includes("watchtower"));
  const beacon = imgs.find(i => href(i).includes("beacon"));
  // The field figure's own group — the only Awoken standing
  // on this field (class field-drifter at rest).
  const fig = svg.querySelector("g.field-drifter") ?? svg.querySelector("g.field-patroller");
  if (!tower || !beacon || !fig) return { tower: !!tower, beacon: !!beacon, fig: !!fig };
  const FOL = Node.DOCUMENT_POSITION_FOLLOWING;
  return {
    tower: true, beacon: true, fig: true,
    figBeforeTower: (fig.compareDocumentPosition(tower) & FOL) !== 0,
    figBeforeBeacon: (fig.compareDocumentPosition(beacon) & FOL) !== 0,
  };
});
async function setGuardPlace(tileId, q, r) {
  db.prepare("UPDATE field_placements SET tile_id = ?, pos_q = ?, pos_r = ?, march_path = NULL, march_pos_q = NULL, march_pos_r = NULL, march_since = NULL, march_ends = NULL WHERE owner_key = ? AND awakened_id = ?")
    .run(tileId, q, r, ownerKey, company[0]);
  await enterTerritory();
  await clearOverlays();
}
const shotStage = async (name) => {
  try {
    const svg = await page.$(".territory-svg");
    if (svg) await svg.screenshot({ path: join(SHOTS, name) });
  } catch { /* a re-frame during the shot — the DOM proofs carry the section */ }
};
// The buildings fetch can land a breath after the world
// snapshot; a draw-order read polls until the tower, the
// beacon and the figure all stand drawn (or ~12 s pass).
const domOrderSettled = async () => {
  let ord = await domOrder();
  const t0 = Date.now();
  while ((!ord || !ord.tower || !ord.beacon || !ord.fig) && Date.now() - t0 < 12000) {
    await sleep(600);
    ord = await domOrder();
  }
  return ord;
};
{
  await setGuardPlace(towerTile.id, towerTile.q, towerTile.r - 0.62);
  let ord = await domOrderSettled();
  ok("§C the tower and the figure both stand drawn", !!ord && ord.tower && ord.fig, JSON.stringify(ord));
  ok("§C BEHIND the tower's base line, the figure is drawn BEFORE the tower (the tower covers him)",
    !!ord && ord.figBeforeTower === true, JSON.stringify(ord));
  await shotStage("homeland-figure-behind-tower.png");
  await setGuardPlace(towerTile.id, towerTile.q, towerTile.r + 0.62);
  ord = await domOrderSettled();
  ok("§C IN FRONT of the tower's base, the figure is drawn AFTER the tower (he covers its foot)",
    !!ord && ord.figBeforeTower === false, JSON.stringify(ord));
  await shotStage("homeland-figure-before-tower.png");
  await setGuardPlace(seedTile.id, seedTile.q, seedTile.r - 0.62);
  ord = await domOrderSettled();
  ok("§C the Beacon stands drawn, and BEHIND its base the figure is drawn BEFORE it",
    !!ord && ord.beacon && ord.figBeforeBeacon === true, JSON.stringify(ord));
  await shotStage("homeland-figure-behind-beacon.png");
  await setGuardPlace(seedTile.id, seedTile.q, seedTile.r + 0.62);
  ord = await domOrderSettled();
  ok("§C IN FRONT of the Beacon's base, the figure is drawn AFTER it",
    !!ord && ord.figBeforeBeacon === false, JSON.stringify(ord));
  await shotStage("homeland-figure-before-beacon.png");
}
await browser.close();

/* ══ §D THE TABLE ═══════════════════════════════════════════ */
console.log("§D the Table — the grown seed as pillar, and the draw pair in the room's face");
const { issueTableToken } = await import("../server/dist/table.js");
async function mkTableTender(name, discId) {
  const c = await callOk("claimTender", { password: PW, tenderName: name });
  const tid = db.prepare("SELECT id FROM tenders WHERE code = ?").get(c.tender.code).id;
  const ok2 = `tender:${tid}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ok2, Date.now());
  const insA = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
  const mkKin = (nm) => {
    const parts = [["body", "sky", 2, 2], ["arms", "sky", 2, 2], ["head", "sky", 2, 2]].map(([cat, el, p, t]) => ({
      source_id: `db:${Number(insA.run(`${nm} ${cat}`, cat, p, t, el, `depthtable/${nm} ${cat}.png`, Date.now()).lastInsertRowid)}`,
      name: `${nm} ${cat}`, category: cat, rarity: "common", power: p, toughness: t, element: el,
    }));
    return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
      .run(nm, nm, "depthtable/awokin.png", JSON.stringify(parts), name, ok2, Date.now()).lastInsertRowid);
  };
  for (const w of ["Wake One", "Wake Two", "Wake Three"]) mkKin(`${name} ${w}`);
  await callOk("chooseClass", { classKey: "warden" }, c.token);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 900, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 900").run(ok2, Date.now());
  const tt = issueTableToken({ id: discId, name });
  const bindCode = (await callOk("getTableBindCode", {}, c.token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
  if (!bindRes.ok) throw new Error("table/bind failed for " + name);
  return { token: c.token, ownerKey: ok2, tt, name };
}
class Actor {
  constructor() { this.state = null; this.you = null; this.errors = []; this.joinErrors = []; }
  async join(tt, room, extra = {}) {
    this.ws = new WebSocket("ws://127.0.0.1:39955/table/ws");
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data));
        if (m.type === "state") { this.state = m.state; if (m.you) this.you = m.you; }
        else if (m.type === "error") this.errors.push(String(m.message ?? ""));
        else if (m.type === "joinError") this.joinErrors.push(m);
      } catch { /* torn frame */ }
    };
    this.send({ type: "join", authToken: tt, room, ...extra });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  async waitYou(what, ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { if (this.you) return; await sleep(120); } throw new Error("actor wait: " + what); }
}
const waitFor = async (fn, what, ms = 25000) => { const s = Date.now(); while (Date.now() - s < ms) { let v = false; try { v = fn(); } catch { v = false; } if (v) return true; await sleep(120); } throw new Error("drive wait: " + what); };
const KF = 40 / 796;
const centerOfF = (id) => { const [q, r] = id.split(",").map(Number); return { x: q * 1292 * KF, y: q * 470 * KF + r * 948 * KF }; };

const H = await mkTableTender("Depth Host", "depth-host-1");
const GN = await mkTableTender("Depth North", "depth-north-1");
const GS = await mkTableTender("Depth South", "depth-south-1");
const W = await mkTableTender("Depth Watcher", "depth-watcher-1");
const ROOM = "depth-pillars-room";
const host = new Actor();
await host.join(H.tt, ROOM, { name: H.name });
await host.waitYou("host seated");
host.send({ type: "beaconOpen", privacy: "public" });
await waitFor(() => host.state?.hosted?.hostName === H.name, "the hosted land opens");
host.send({ type: "beaconClose" });
await waitFor(() => !host.state?.hosted, "the hosted land folds");
// The land's record, sculpted: its seed stands grown to the
// Beacon (the growth the feeding road would have written).
{
  const key = `table.hosted.${H.ownerKey}`;
  const row = db.prepare("SELECT value FROM ui_config WHERE key = ?").get(key);
  ok("§D the hosted land's record stands in ui_config", !!row, key);
  const rec = JSON.parse(row.value);
  rec.seedGrowth = { level: 3, fedEnergy: 30 };
  db.prepare("UPDATE ui_config SET value = ? WHERE key = ?").run(JSON.stringify(rec), key);
}
host.send({ type: "beaconOpen", privacy: "public" });
await waitFor(() => host.state?.hosted?.hostName === H.name && host.state?.shared?.seed?.stage === "beacon", "the room's seed stands grown (a Beacon)");
ok("§D the room's seed stands grown — a Beacon stands in the room", true);

const gN = new Actor();
await gN.join(GN.tt, ROOM, { name: GN.name });
await gN.waitYou("north guest seated");
const gS = new Actor();
await gS.join(GS.tt, ROOM, { name: GS.name });
await gS.waitYou("south guest seated");

// §D1: the north guest glides at the seed's very heart.
{
  const meOf = (st) => st?.players?.find(p => p.key === GN.ownerKey);
  let min = Infinity, last = null;
  gN.send({ type: "glide", tx: 0, ty: 0 });
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    const me = meOf(gN.state);
    if (me?.pos) { last = me; min = Math.min(min, Math.hypot(me.pos.x, me.pos.y)); }
    if (me && !me.moving && Math.hypot(me.pos.x, me.pos.y) < 34) break;
    await sleep(150);
  }
  ok("§D gliding at the Beacon's heart, the guest never stands inside its base (min ≥ the rim, less slack)",
    min >= 18, `min ${min.toFixed(1)} rim 20`);
  ok("§D …he stands AT the rim — beside the trunk, not stopped far off",
    !!last && Math.hypot(last.pos.x, last.pos.y) <= 30, JSON.stringify(last?.pos));
  ok("§D …and still stands ON the seed's hex — the feeding ground is kept",
    !!last && last.hex === "0,0", `hex ${last?.hex}`);
}
// §D2: the draw pair — north guest behind the base line,
// south guest in front of it, read in the room's own face.
{
  const cN = centerOfF("0,-1"), cS = centerOfF("0,1");
  gN.send({ type: "glide", tx: cN.x, ty: cN.y });
  gS.send({ type: "glide", tx: cS.x, ty: cS.y });
  const settled = (st, key, c) => {
    const me = st?.players?.find(p => p.key === key);
    return !!me?.pos && !me.moving && Math.hypot(me.pos.x - c.x, me.pos.y - c.y) < 8;
  };
  await waitFor(() => settled(gN.state, GN.ownerKey, cN) && settled(gS.state, GS.ownerKey, cS), "both guests stand at their posts", 30000);
  const browser2 = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
  const tpage = await browser2.newPage();
  await tpage.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
  tpage.on("pageerror", (e) => console.log("[pageerror:depth-table]", String(e).slice(0, 200)));
  await tpage.evaluateOnNewDocument((s) => { window.__awokenTableSession = s; }, { authToken: W.tt, room: ROOM, name: W.name });
  await tpage.goto(BASE + "/table?frame_id=depth-drive", { waitUntil: "domcontentloaded", timeout: 60000 });
  await tpage.waitForSelector(".table-room", { timeout: 30000 });
  await tpage.waitForFunction(() => (document.body.textContent ?? "").includes("Depth North"), { timeout: 25000 });
  await sleep(1500);
  const ord = await tpage.evaluate(() => {
    const imgs = [...document.querySelectorAll("svg image")];
    const seed = imgs.find(i => (i.getAttribute("href") ?? "").includes("beacon"));
    const nameEl = (nm) => [...document.querySelectorAll("text")].find(t => (t.textContent ?? "").trim() === nm);
    const north = nameEl("Depth North"), south = nameEl("Depth South");
    if (!seed || !north || !south) return { seed: !!seed, north: !!north, south: !!south };
    const FOL = Node.DOCUMENT_POSITION_FOLLOWING;
    return {
      seed: true, north: true, south: true,
      northBeforeSeed: (north.compareDocumentPosition(seed) & FOL) !== 0,
      seedBeforeSouth: (seed.compareDocumentPosition(south) & FOL) !== 0,
    };
  });
  ok("§D the room's face draws the Beacon and both tenders", !!ord && ord.seed && ord.north && ord.south, JSON.stringify(ord));
  ok("§D BEHIND the Beacon's base, the north tender is drawn BEFORE it (it covers him)",
    !!ord && ord.northBeforeSeed === true, JSON.stringify(ord));
  ok("§D IN FRONT of the Beacon's base, the south tender is drawn AFTER it (he covers its foot)",
    !!ord && ord.seedBeforeSouth === true, JSON.stringify(ord));
  await tpage.screenshot({ path: join(SHOTS, "table-beacon-draw-pair.png") });
  const { existsSync } = await import("node:fs");
  if (!existsSync(join(SHOTS, "table-beacon-draw-pair.png"))) {
    await sleep(800);
    await tpage.screenshot({ path: join(SHOTS, "table-beacon-draw-pair.png") });
  }
  ok("§D the room's photograph is kept for the eye", existsSync(join(SHOTS, "table-beacon-draw-pair.png")));
  await browser2.close();
}
try { host.ws.close(); gN.ws.close(); gS.ws.close(); } catch { /* already shut */ }

console.log(`\ndrive-depth-pillars: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
