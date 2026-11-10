// THE CURSED LAND'S RELIEF FROM THE DUSK (Nigel, 2026-11-10 —
// from his play: chunks of the homeland read as empty black
// tiles). The cursed face is near-black deep-red ink; the
// flat 0.44 dusk crushed it to a void. The fix lays the
// dusk's mask at a grey over cursed cells only, so the veil
// over cursed ground falls to a quarter (0.25) and the ink
// reads as dark living land. Clean land's dusk does not
// move; the light sources' holes still rule near a beacon;
// the server's light reckoning is untouched.
//
// This drive boots the tree's real server on a scratch
// DATA_DIR, lays a test land — a cursed patch far from any
// light, cursed ground beside a beacon, a floating cursed
// tile, and clean neighbours — and reads the REAL rendered
// map's pixels (screenshot decoded in-page):
//   §A far cursed centres: red channel, mean and median,
//      before vs after (the drive is run against the
//      pre-fix tree and this tree; both runs' numbers are
//      printed side by side by the wrapper log compare —
//      here each run prints its own table and the runner
//      asserts the AFTER table against the stored BEFORE).
//   §B a clean neighbour beside the patch: unchanged.
//   §C the beacon's heart vs the relieved cursed ground
//      beside it: the lit ring still reads brighter.
//   §D the floating cursed tile: its risen face relieved,
//      and the cursed newborn it left behind relieved too.
//   §E mask structure: the dusk mask holds one grey relief
//      polygon per cursed tile, and no other tile wears one.
// Screenshots land in ~/workspace/cursed-light-proof/.
//   node scripts/drive-cursed-light.mjs [port] [tag]
// The BEFORE run passes tag=before on the pre-fix tree (it
// writes cursed-light-before.json); the AFTER run (default
// tag=after) reads it and asserts the lift.
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";

const ROOT = process.cwd();
const PORT = process.argv[2] ?? "3989";
const TAG = process.argv[3] ?? "after";
const require = createRequire(join(ROOT, "package.json"));
const Database = require("better-sqlite3");
const puppeteer = createRequire("/home/hatch/workspace/tools-chrome/package.json")("puppeteer");

const OUT = "/home/hatch/workspace/cursed-light-proof";
mkdirSync(OUT, { recursive: true });
const BEFORE_JSON = join(OUT, "cursed-light-before.json");
process.env.DATA_DIR = mkdtempSync(join("/home/hatch/workspace/big-tmp", "awoken-cursed-proof-"));
process.env.PORT = PORT;
process.env.WORKSHOP_PASSWORD = "cursed-proof-password";
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
const claim = await call("claimTender", { password: "cursed-proof-password", tenderName: "Cursed Tender" });
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
}
function addRow(q, r, z, { element = "neutral", cursed = 0, mix = null, height = 1, sealed = 0 } = {}) {
  return Number(insTile.run(me, q, r, element, cursed, sealed, height, z, mix ? JSON.stringify(mix) : null, cursed ? 10 : null, cursed ? 10 : null, now).lastInsertRowid);
}
const setStand = (tileId) => db.prepare("UPDATE tender_progress SET tender_tile_id = ? WHERE owner_key = ?").run(tileId, me);

/* The test land (radius-5 clean disc, then the actors):
 * - THE FAR PATCH: a 7-hex cursed flower centred (-4,-1),
 *   five hex-steps from the beacon — outside its glow hole,
 *   under the plain dusk.
 * - THE BEACON at (3,1) (a fallen level-3 seed, bastion
 *   stage), with cursed ground at (2,0) and (4,2) beside it.
 * - THE FLOATER at (-1,-4): cursed rows at z0/z1 with a
 *   cursed z2 row above them.
 * - THE TENDER stands at (0,0), clean ground. */
wipeWorld();
const discIds = {};
for (let q = -5; q <= 5; q++) for (let r = -5; r <= 5; r++) {
  if (hexDist({ q, r }, { q: 0, r: 0 }) > 5) continue;
  discIds[`${q},${r}`] = addRow(q, r, 0, { element: "neutral" });
}
db.prepare("DELETE FROM territory_tiles WHERE owner_key = ? AND q = 3 AND r = 1").run(me);
const beaconTileId = addRow(3, 1, 0, { element: "neutral" });
db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at, defenses, fed_energy) VALUES (?, ?, 3, 'fallen', ?, 0, 0)").run(me, beaconTileId, now);
const cursedAt = (q, r, z = 0) => {
  db.prepare("DELETE FROM territory_tiles WHERE owner_key = ? AND q = ? AND r = ? AND z = ?").run(me, q, r, z);
  return addRow(q, r, z, { element: "neutral", cursed: 1 });
};
const patchCoords = [[-4, -1], [-5, -1], [-3, -1], [-4, -2], [-4, 0], [-5, 0], [-3, -2]];
for (const [q, r] of patchCoords) cursedAt(q, r);
const nearBeacon = [[2, 0], [4, 2]];
for (const [q, r] of nearBeacon) cursedAt(q, r);
cursedAt(-1, -4, 0); cursedAt(-1, -4, 1); cursedAt(-1, -4, 2);
setStand(discIds["0,0"]);

const land = await call("getTerritory", {}, token);
const servedCursed = (land.tiles ?? []).filter(t => t.cursed);
// The settle fills the homeland to its standing radius (the
// frontier comes in cursed), so the served cursed count is
// the 12 laid tiles plus the frontier fill — the checks
// below key on the served count itself, never a fixed 12.
ok("the served land carries the cursed patch, the beacon pair, and the floating stack",
  servedCursed.length >= 12, `cursed=${servedCursed.length}`);
ok("the floating cursed tile is served at z 2",
  servedCursed.some(t => t.q === -1 && t.r === -4 && (t.z ?? 0) === 2));

/* ═══ THE BROWSER ═══════════════════════════════════════ */
console.log("the browser");
const browser = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
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
  [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "×").forEach((b) => b.click());
});
await sleep(3500);

/* Frame the whole land: the homeland fills to radius 10,
 * which at zoom 1 overflows a 1400×950 frame with every
 * actor off-screen. Widen the frame and ride the map's own
 * zoom-out to its floor (0.5) so the patch, the beacon and
 * the floating stack all stand in one shot. */
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
await sleep(1200);
for (let i = 0; i < 3; i++) {
  // Dispatch the click in-page: puppeteer's own click waits
  // for two stable frames at the point, and the living map
  // never gives it two — the wait starved whole runs.
  await page.evaluate(() => {
    const b = document.querySelector(".compass-btn.zoom-out");
    if (b) b.click();
  }).catch(() => {});
  await sleep(500);
}
await sleep(2500);

/* Locate every cursed face on screen and the clean sample
 * cells, from the DOM's own geometry: a cursed face image
 * (cursed-v3) seats its painted face centre — source
 * (960, 790) of 1920×1510 — on the tile's lattice point,
 * and the map's tile size reads off the image's own width
 * (drawn at 2.41·s). Face-centre sample discs are kept
 * inside the painted face (radius 0.30·s, clear of the
 * ♥/🌵 readouts, which live at the face's south). */
const geo = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll("image")];
  const boxes = imgs.map((i) => {
    const r = i.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, href: i.getAttribute("href") ?? "" };
  }).filter((b) => b.w > 30);
  const cursed = boxes.filter((b) => b.href.includes("cursed-v3"))
    .map((b) => ({ cx: b.x + b.w * (960 / 1920), cy: b.y + b.h * (790 / 1510), s: b.w / 2.41, w: b.w }));
  // Neighbour lattice steps from the cursed centres
  // themselves: the smallest centre distance is one step.
  let step = null;
  for (let i = 0; i < cursed.length; i++) for (let j = i + 1; j < cursed.length; j++) {
    const d = Math.hypot(cursed[i].cx - cursed[j].cx, cursed[i].cy - cursed[j].cy);
    if (d > 10 && (!step || d < step.d)) step = { d, dx: Math.abs(cursed[i].cx - cursed[j].cx), dy: Math.abs(cursed[i].cy - cursed[j].cy) };
  }
  // The beacon's glow heart: the core glow ellipse.
  const core = document.querySelector('ellipse[data-glow="core"]');
  let beacon = null;
  if (core) { const r = core.getBoundingClientRect(); beacon = { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; }
  // Relief polygons inside the dusk mask.
  const mask = document.querySelector("#land-dusk-mask");
  const relief = mask ? [...mask.querySelectorAll("polygon")].filter((p) => p.getAttribute("fill") === "#919191").length : -1;
  return { cursed, step, beacon, relief, sRef: cursed[0]?.s ?? null, vw: window.innerWidth, vh: window.innerHeight };
});
console.log(`GEO[${TAG}] faces=${geo.cursed.length} s=${geo.sRef?.toFixed(1)} step=${geo.step?.d?.toFixed(1)} beacon=${geo.beacon ? `(${geo.beacon.cx.toFixed(0)},${geo.beacon.cy.toFixed(0)})` : "none"} viewport=${geo.vw}x${geo.vh} firstFace=${geo.cursed[0] ? `(${geo.cursed[0].cx.toFixed(0)},${geo.cursed[0].cy.toFixed(0)})` : "none"}`);
ok("the map draws the cursed faces", geo.cursed.length >= 8, `faces=${geo.cursed.length}`);
if (TAG === "after") {
  ok("§E the dusk mask holds one relief polygon per served cursed tile",
    geo.relief === servedCursed.length, `relief=${geo.relief} served=${servedCursed.length}`);
} else {
  ok("§E (before) the dusk mask holds no relief polygons", geo.relief === 0, `relief=${geo.relief}`);
}

/* Split the cursed faces into FAR (away from the beacon's
 * glow — no glow hole within reach) and the rest by their
 * distance from the beacon heart, in hex-step units. */
const s = geo.sRef ?? 150;
const rad = s * 0.30;
// The lattice step, defined by the ground itself: the
// beacon's own cursed neighbours stand exactly one step
// from its heart, and no other cursed face stands closer —
// so the nearest cursed face to the glow heart is one step
// away by construction. (Nearest-neighbour distances
// between faces mix the projection's axes and the stack's
// lift spacing; the beacon's ring does not.)
const stepLen = geo.beacon
  ? Math.min(...geo.cursed.map((c) => Math.hypot(c.cx - geo.beacon.cx, c.cy - geo.beacon.cy)))
  : s * 1.63;
const faces = geo.cursed.map((c) => ({
  ...c,
  beaconSteps: geo.beacon ? Math.hypot(c.cx - geo.beacon.cx, c.cy - geo.beacon.cy) / stepLen : 99,
}));
const farAll = faces.filter((c) => c.beaconSteps > 3.4);
const near = faces.filter((c) => c.beaconSteps <= 1.6);
ok("the far patch reads clear of the beacon's glow (≥3 faces)", farAll.length >= 3, `far=${farAll.length} near=${near.length}`);
// Sample a spread of the far faces (the whole frontier
// qualifies — it is cursed ground under plain dusk, the
// very thing Nigel's complaint names), never all of them:
// one screenshot, decoded once, serves every disc below.
// Only faces whose centres fall inside the viewport can be
// sampled — the radius-10 land overflows the frame.
const onScreen = (c) => c.cx > rad && c.cx < geo.vw - rad && c.cy > rad && c.cy < geo.vh - rad;
const farSorted = farAll.filter(onScreen).sort((a, b) => a.cx - b.cx || a.cy - b.cy);
const far = farSorted.filter((_, i) => i % Math.max(1, Math.floor(farSorted.length / 6)) === 0).slice(0, 6);
// The CLEAN control: a point on clean interior ground —
// from the beacon heart toward the land's centroid (the
// clean disc's heart), far enough from the glow and from
// every cursed face that only the plain dusk speaks there.
// Both runs derive it the same way, so the before/after
// comparison reads the same kind of ground.
let cleanPt = null;
if (geo.beacon && faces.length) {
  const cen = faces.reduce((a, c) => ({ x: a.x + c.cx / faces.length, y: a.y + c.cy / faces.length }), { x: 0, y: 0 });
  const dx = cen.x - geo.beacon.cx, dy = cen.y - geo.beacon.cy;
  const dl = Math.hypot(dx, dy) || 1;
  for (const steps of [2.6, 3.0, 2.2, 3.4]) {
    const px = geo.beacon.cx + (dx / dl) * stepLen * steps;
    const py = geo.beacon.cy + (dy / dl) * stepLen * steps;
    const clear = faces.every((c) => Math.hypot(c.cx - px, c.cy - py) > stepLen * 1.3);
    if (clear) { cleanPt = { cx: px, cy: py }; break; }
  }
}
console.log(`SAMPLE[${TAG}] stepLen=${stepLen.toFixed(1)} far on-screen=${farSorted.length} chosen=${far.length} near=${near.length} cleanPt=${cleanPt ? `(${cleanPt.cx.toFixed(0)},${cleanPt.cy.toFixed(0)})` : "none"}`);

/* Disc statistics from ONE full screenshot, decoded once
 * in a BLANK page of the same browser: the map page's own
 * main thread never sits still (its clock keeps the land
 * re-rendering), and decoding there starves behind it. A
 * blank page's thread is idle and answers at once. */
async function discStatsMany(points) {
  const shot = await page.screenshot({ encoding: "base64" });
  const blank = await browser.newPage();
  try {
    return await blank.evaluate(async (b64, pts) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = "data:image/png;base64," + b64; });
    const cv = document.createElement("canvas");
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const ctx = cv.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
    return pts.map(({ cx, cy, r }) => {
      const rs = [];
      let sr = 0, sg = 0, sb = 0, n = 0;
      const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(cv.width - 1, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(cv.height - 1, Math.ceil(cy + r));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (Math.hypot(x - cx, y - cy) > r) continue;
        const i = (y * cv.width + x) * 4;
        sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; n++;
        rs.push(data[i]);
      }
      rs.sort((a, b) => a - b);
      return n ? { rMean: sr / n, rMed: rs[Math.floor(rs.length / 2)], gMean: sg / n, bMean: sb / n, n } : null;
    });
    }, shot, points);
  } finally {
    await blank.close().catch(() => {});
  }
}

// The floating stack, located BEFORE sampling so its faces
// ride the same single screenshot and decode as every other
// disc: three cursed faces share one column (the z2 face
// risen highest, then z1, then z0), and the tightest
// vertical trio in one column is that stack — its span is
// the lift spacing, a fraction of the lattice step. (The
// game's seating co-seats the z0/z1 rows, so the trio can
// hold two entries at one centre; the distinct centres are
// what get sampled.)
const byX = faces.filter(onScreen).sort((a, b) => a.cx - b.cx || a.cy - b.cy);
let trio = null, trioSpan = Infinity;
for (let i = 0; i < byX.length; i++) {
  const col = byX.filter((c) => Math.abs(c.cx - byX[i].cx) < 8).sort((a, b) => a.cy - b.cy);
  if (col.length >= 3) {
    const span = col[2].cy - col[0].cy;
    if (span < trioSpan) { trioSpan = span; trio = col.slice(0, 3); }
  }
}
console.log("  floating stack trio span:", trio ? trioSpan.toFixed(0) + "px" : "none", "vs lattice step", stepLen.toFixed(0) + "px");
console.log("  floating stack faces (top→bottom):", trio ? trio.map((c) => `(${c.cx.toFixed(0)},${c.cy.toFixed(0)})`).join(" ") : "not found");
const trioCentres = trio ? trio.filter((c, i) => trio.findIndex((d) => Math.hypot(d.cx - c.cx, d.cy - c.cy) < 4) === i) : [];

const sampleReq = [];
const sampleIx = { far: [], near: [], clean: -1, beacon: -1, trio: [] };
for (const c of far) { sampleIx.far.push(sampleReq.length); sampleReq.push({ cx: c.cx, cy: c.cy, r: rad }); }
for (const c of near.filter(onScreen)) { sampleIx.near.push(sampleReq.length); sampleReq.push({ cx: c.cx, cy: c.cy, r: rad }); }
if (geo.beacon) { sampleIx.beacon = sampleReq.length; sampleReq.push({ cx: geo.beacon.cx, cy: geo.beacon.cy, r: rad * 0.8 }); }
if (cleanPt) { sampleIx.clean = sampleReq.length; sampleReq.push({ cx: cleanPt.cx, cy: cleanPt.cy, r: rad }); }
for (const c of trioCentres) { sampleIx.trio.push(sampleReq.length); sampleReq.push({ cx: c.cx, cy: c.cy, r: rad }); }
const sampled = await discStatsMany(sampleReq);
const stats = { far: [], near: [], clean: null, beacon: null, trio: [], s, stepLen };
for (const i of sampleIx.far) if (sampled[i]) stats.far.push(sampled[i]);
for (const i of sampleIx.near) if (sampled[i]) stats.near.push(sampled[i]);
if (sampleIx.beacon >= 0) stats.beacon = sampled[sampleIx.beacon];
if (sampleIx.clean >= 0) stats.clean = sampled[sampleIx.clean];
for (const i of sampleIx.trio) if (sampled[i]) stats.trio.push(sampled[i]);
const agg = (arr) => arr.length ? {
  rMean: arr.reduce((a, b) => a + b.rMean, 0) / arr.length,
  rMed: arr.reduce((a, b) => a + b.rMed, 0) / arr.length,
  gMean: arr.reduce((a, b) => a + b.gMean, 0) / arr.length,
  bMean: arr.reduce((a, b) => a + b.bMean, 0) / arr.length,
} : null;
const table = { far: agg(stats.far), near: agg(stats.near), clean: stats.clean, beacon: stats.beacon };
console.log(`PIXELS[${TAG}] far cursed:`, JSON.stringify(table.far));
console.log(`PIXELS[${TAG}] near-beacon cursed:`, JSON.stringify(table.near));
console.log(`PIXELS[${TAG}] clean control:`, JSON.stringify(table.clean && { rMean: table.clean.rMean, rMed: table.clean.rMed, gMean: table.clean.gMean, bMean: table.clean.bMean }));
console.log(`PIXELS[${TAG}] beacon heart:`, JSON.stringify(table.beacon && { rMean: table.beacon.rMean, rMed: table.beacon.rMed }));

await page.screenshot({ path: join(OUT, `cursed-light-${TAG}.png`) });

if (TAG === "before") {
  writeFileSync(BEFORE_JSON, JSON.stringify(table, null, 2));
  ok("the before table is stored for the after run", existsSync(BEFORE_JSON));
} else {
  const before = JSON.parse(readFileSync(BEFORE_JSON, "utf8"));
  const bf = before.far, af = table.far;
  // The face's own arithmetic bounds the lift: under the
  // 0.44 veil the face's red survives at 56%, under 0.25 at
  // 75% — a ratio of 1.34 on face-dominated pixels, less
  // where the sample disc crosses clear canvas (the veil
  // colour alone moves 8.3 → 8.75). The drive asserts the
  // measured lift against that bound with margin, and the
  // screenshots carry the visual verdict.
  // The measured lift is asserted against the envelope the
  // arithmetic allows: 1.34× is the bound for a disc filled
  // ENTIRELY by face pixels; these discs (radius 0.30·s at
  // the face centre) also cross the face's clear canvas,
  // where the veil's own red barely moves (3.9 → 5.25), so a
  // mixed disc lands lower. ≥1.10× is a clear, material lift
  // — the clean control's run-to-run drift is 0.01 — and the
  // exact measured ratio prints either way.
  ok("the far cursed ground's red channel lifted by the veil change (mean, ≥1.10×)",
    af && bf && af.rMean >= bf.rMean * 1.10, `before=${bf?.rMean?.toFixed(1)} after=${af?.rMean?.toFixed(1)} ratio=${bf && af ? (af.rMean / bf.rMean).toFixed(2) : "?"}`);
  ok("the far cursed ground's red channel lifted (median)",
    af && bf && af.rMed > bf.rMed, `before med=${bf?.rMed} after med=${af?.rMed}`);
  ok("the relieved ground reads as red-brown ink, not grey wash (R clearly above G and B)",
    af && af.rMean > af.gMean * 1.8 && af.rMean > af.bMean, `R=${af?.rMean?.toFixed(1)} G=${af?.gMean?.toFixed(1)} B=${af?.bMean?.toFixed(1)}`);
  const bc = before.clean, ac = table.clean;
  ok("the clean neighbour's dusk reading is unchanged within noise (±20%)",
    bc && ac && Math.abs(ac.rMean - bc.rMean) <= Math.max(2, bc.rMean * 0.2) && Math.abs(ac.bMean - bc.bMean) <= Math.max(2, bc.bMean * 0.2),
    `clean before R=${bc?.rMean?.toFixed(1)} B=${bc?.bMean?.toFixed(1)} after R=${ac?.rMean?.toFixed(1)} B=${ac?.bMean?.toFixed(1)}`);
  ok("the beacon's lit heart still reads brighter than the relieved cursed ground beside it",
    table.beacon && table.near && table.beacon.rMean > table.near.rMean * 1.3,
    `beacon R=${table.beacon?.rMean?.toFixed(1)} near-cursed R=${table.near?.rMean?.toFixed(1)}`);
  // The floating stack (located and sampled with the main
  // pass above): read its distinct seats against the before
  // run's far-patch average — the risen face and the rows it
  // stands on ride the same relieved veil.
  if (trio && bf) {
    const trioStats = stats.trio;
    console.log("  floating stack red means:", trioStats.map((x) => x.rMean.toFixed(1)).join(", "), "vs before far average", bf.rMean.toFixed(1));
    ok("the floating cursed tile and the cursed rows beneath it are relieved too",
      trioStats.length >= 2 && trioStats.every((x) => x.rMean > bf.rMean * 1.1),
      `stack=${trioStats.map((x) => x.rMean.toFixed(1)).join(",")} beforeFar=${bf.rMean.toFixed(1)}`);
  } else {
    ok("the floating cursed stack was found on screen", false, "no vertical trio of cursed faces");
  }
}

await browser.close();
console.log(`drive-cursed-light[${TAG}]: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
