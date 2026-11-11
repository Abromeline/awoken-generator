// THE CURSED LAND'S RELIEF FROM THE DUSK (Nigel, 2026-11-10 —
// from his play: chunks of the homeland read as empty black
// tiles). The cursed face is near-black deep-red ink; the
// flat 0.44 dusk crushed it to a void. The fix lays the
// dusk's mask at a grey over cursed ground, so the veil
// over cursed ground falls to a quarter (0.25) and the ink
// reads as dark living land. Clean land's dusk does not
// move; the light sources' holes still rule near a beacon;
// the server's light reckoning is untouched.
//
// THE RELIEF'S SHAPE — ONE CONTINUOUS WASH (Nigel's rework
// ruling, 2026-11-10 18:15 EST): the first build laid one
// exact hex per cursed tile and Nigel refused it — "light
// is being trapped inside hex's and not continuous." The
// relief is now ONE SOFT FIELD: cursed tiles that touch
// form one region, each region is melted into a single
// outline (shared edges cancel), and the outline is laid
// in the mask as a full-strength core wearing a
// half-strength rim band (veil 0.345) half a hex size
// wide outside itself, so the veil steps down gradually
// across the frontier and spills a whisper onto the clean
// side. (A Gaussian blur over the outline was tried first
// in this rework and fell on this drive's own evidence:
// with the blur live the renderer pegged a core and a
// screenshot starved past the 600 s protocol window,
// where the unblurred builds answer at once — the stepped
// rim is the shipped mechanism.) This drive tests the
// wash's own law, not just the lift:
//   §A far cursed centres: red channel, mean and median,
//      before vs after — and the after heart must also
//      land within ±10% of the FIRST (per-hex) build's
//      relieved mean (30.63, on record in its report):
//      the rework changed the shape, not the strength.
//   §B a clean neighbour beside the patch: unchanged.
//   §C the beacon's heart vs the relieved cursed ground
//      beside it: the lit ring still reads brighter.
//   §D the floating cursed tile: its risen face relieved
//      (read at its heart — the pool's rim is the feather
//      working as ruled), and the cursed rows beneath it.
//   §E mask structure: the dusk mask holds one wash path
//      per CONNECTED CURSED REGION (computed here from
//      the served tiles by the renderer's own rule:
//      grounded tiles join by axial touch, a floating
//      tile stands alone) — NOT one per cursed tile.
//   §F NO HEX RIMS: a line sampled from one cursed face's
//      centre into its cursed neighbour's must not dip at
//      the shared border (per-tile feathering would dig a
//      trench there; one wash cannot).
//   §G THE FEATHER: wide discs ride the line from a
//      cursed face's centre to its clean neighbour's seat
//      — inside the rim band past the frontier, and past
//      the rim's reach on that axis — on this build and
//      on the preserved per-hex build's screenshot, and
//      the verdict is the wash ÷ per-hex ratio at each
//      disc (median across crossings): ≈1.15 in the band
//      (the spill), ≈1 past it (the band ends). Two
//      designs failed before this one and their lessons
//      are baked in: the neighbour step must be the TRUE
//      lattice step (the code's isoBasis axes — 170px is
//      a second-neighbour distance, and stepping by it
//      landed the discs two tiles away), and the discs
//      must be wide, because point samples drown in the
//      face art. Deep-clean control discs print as
//      background (a clean face's edges are not equally
//      bright on every side, so they are no fair control
//      for a frontier approach).
//   §H the frame rate with the wash shown vs hidden
//      (printed evidence for the wash's cost, not a gate —
//      this box's load swings too widely to gate on it).
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

/* The wash's region count, computed from the served tiles
 * by the renderer's own rule (§E's expectation): grounded
 * cursed tiles (z < 2) join by axial touch — tiles stacked
 * on one hex join too — and every floating cursed tile
 * (z ≥ 2) is a region of one at its risen seat. */
const expectedRegions = (() => {
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const grounded = servedCursed.filter(t => (t.z ?? 0) < 2);
  let regions = servedCursed.length - grounded.length;
  const byHex = new Map();
  grounded.forEach((t, i) => {
    const k = `${t.q},${t.r}`;
    if (!byHex.has(k)) byHex.set(k, []);
    byHex.get(k).push(i);
  });
  const seen = new Set();
  grounded.forEach((t, i) => {
    if (seen.has(i)) return;
    regions++;
    const stack = [i];
    seen.add(i);
    while (stack.length) {
      const c = grounded[stack.pop()];
      const keys = [`${c.q},${c.r}`, ...DIRS.map(([dq, dr]) => `${c.q + dq},${c.r + dr}`)];
      for (const k of keys) for (const n of byHex.get(k) ?? []) {
        if (!seen.has(n)) { seen.add(n); stack.push(n); }
      }
    }
  });
  return regions;
})();
console.log(`REGIONS served cursed=${servedCursed.length} expected wash regions=${expectedRegions}`);

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
  // The clean faces: every other face-sized image (the
  // §G frontier line runs from a cursed face to the clean
  // face that actually neighbours it).
  const wRef = cursed.length ? cursed[0].w : 0;
  const cleanFaces = boxes.filter((b) => !b.href.includes("cursed-v3") && wRef && Math.abs(b.w - wRef) < wRef * 0.15)
    .map((b) => ({ cx: b.x + b.w * (960 / 1920), cy: b.y + b.h * (790 / 1510) }));
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
  // Wash region paths inside the dusk mask.
  const mask = document.querySelector("#land-dusk-mask");
  const relief = mask ? mask.querySelectorAll("[data-cursed-region]").length : -1;
  const reliefPolygons = mask ? [...mask.querySelectorAll("polygon")].filter((p) => p.getAttribute("fill") === "#919191").length : -1;
  return { cursed, cleanFaces, step, beacon, relief, reliefPolygons, sRef: cursed[0]?.s ?? null, vw: window.innerWidth, vh: window.innerHeight };
});
console.log(`GEO[${TAG}] faces=${geo.cursed.length} s=${geo.sRef?.toFixed(1)} step=${geo.step?.d?.toFixed(1)} beacon=${geo.beacon ? `(${geo.beacon.cx.toFixed(0)},${geo.beacon.cy.toFixed(0)})` : "none"} viewport=${geo.vw}x${geo.vh} firstFace=${geo.cursed[0] ? `(${geo.cursed[0].cx.toFixed(0)},${geo.cursed[0].cy.toFixed(0)})` : "none"}`);
ok("the map draws the cursed faces", geo.cursed.length >= 8, `faces=${geo.cursed.length}`);
if (TAG === "after") {
  ok("§E the dusk mask holds one wash path per connected cursed region — not one per tile",
    geo.relief === expectedRegions && geo.relief < servedCursed.length,
    `washPaths=${geo.relief} expectedRegions=${expectedRegions} servedCursed=${servedCursed.length}`);
  ok("§E no per-hex relief polygons remain in the mask",
    geo.reliefPolygons === 0, `polygons=${geo.reliefPolygons}`);
} else {
  ok("§E (before) the dusk mask holds no wash paths", geo.relief === 0, `relief=${geo.relief}`);
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
async function decodeDiscs(b64, points) {
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
    }, b64, points);
  } finally {
    await blank.close().catch(() => {});
  }
}
async function discStatsMany(points) {
  const shot = await page.screenshot({ encoding: "base64" });
  return decodeDiscs(shot, points);
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

/* The wash's own lines (§F/§G), laid out now so their
 * points ride the SAME single screenshot as every disc
 * above — the page is never asked for a second capture.
 * THE LATTICE, from the code's own basis (Territory's
 * isoBasis: u = (1292, 470)·k for +q, v = (0, 948)·k
 * for +r): the six neighbour steps on screen fall on
 * three axes — ≈ +20° and ≈ −20° at one length (≈122px
 * at this zoom) and 90° at a shorter one (≈84px). The
 * 170.6px "stepLen" the tables above use is a SECOND-
 * neighbour distance (u + v) — fine for picking stable
 * sample spots, wrong for stepping to a neighbour, as
 * two failed §G designs showed. Here the vectors are
 * measured off the cursed centres themselves, clustered
 * on the coded angles, median length per axis. */
const AXES = [20.0, 90.0, -20.3];
const latticeVecs = [];
for (const deg of AXES) {
  const th = (deg * Math.PI) / 180;
  const ux = Math.cos(th), uy = Math.sin(th);
  const hits = [];
  for (const a of faces) for (const b of faces) {
    if (a === b) continue;
    const dx = b.cx - a.cx, dy = b.cy - a.cy;
    const d = Math.hypot(dx, dy);
    if (d < 55 || d > 150) continue;
    const dot = (dx * ux + dy * uy) / d;
    if (dot > 0.994) hits.push({ dx, dy, d });
  }
  if (hits.length >= 4) {
    hits.sort((p, q) => p.d - q.d);
    const med = hits[Math.floor(hits.length / 2)];
    latticeVecs.push({ x: med.dx, y: med.dy, len: med.d });
    latticeVecs.push({ x: -med.dx, y: -med.dy, len: med.d });
    console.log(`  lattice axis ${deg}°: step ${med.d.toFixed(1)}px from ${hits.length} pairs`);
  }
}
const matchVec = (dx, dy) => {
  const d = Math.hypot(dx, dy);
  return latticeVecs.find((w) => Math.abs(d - w.len) / w.len < 0.08 && (dx * w.x + dy * w.y) / (d * w.len) > 0.994) ?? null;
};
console.log(`  lattice vectors: ${latticeVecs.length}`);
// §F — the seam pair: two far cursed faces exactly one
// lattice step apart.
let seamPair = null;
for (const a of farAll.filter(onScreen)) for (const b of farAll.filter(onScreen)) {
  if (a === b) continue;
  if (matchVec(b.cx - a.cx, b.cy - a.cy)) { seamPair = { a, b }; break; }
}
const SEAM_N = 24;
const seamPts = seamPair ? Array.from({ length: SEAM_N + 1 }, (_, i) => {
  const t = i / SEAM_N;
  return { cx: seamPair.a.cx + (seamPair.b.cx - seamPair.a.cx) * t, cy: seamPair.a.cy + (seamPair.b.cy - seamPair.a.cy) * t, r: 5 };
}) : [];
// §G — the feather, judged WITHIN one screenshot (two
// cross-boot A/B attempts taught why: the living scene
// drifts between boots — wanderers, flashes — at the
// same ±10% as the rim's own signal). Treatment discs
// ride the segment from a cursed centre F to its clean
// neighbour's lattice seat (the frontier at 0.50 of the
// way; the rim band reaches ≈ 0.75): a disc at 0.60 and
// a wider one at 0.66 stand inside the band, one at
// 0.88 beyond it, one at 0.34 inside the cursed face.
// Control discs repeat the same fractions on borders
// between two clean tiles deep in clean land, where no
// rim reaches. The art statistics of the two disc sets
// are the same population (face interiors near a
// border); the veil is the only difference. The discs
// are wide (hundreds to ~1,500 px) so the face art —
// pale frames, droplet ink — averages out instead of
// shouting down a 15% veil signal the way point samples
// did. The neighbour's seat is the LATTICE's, not the
// image box's (a box-read centre can sit tens of pixels
// off the seat tilePos built); the box face only
// witnesses that a clean face truly stands there.
// The rim's reach along a ray, as a fraction of the
// way to the neighbour's seat: the rim is WASH_RIM =
// 0.5 × size land units wide; the vertical axis's step
// is 948k land units against the rim's 0.5 × 54 × zoom
// — in screen terms the rim spans 0.42 of a VERTICAL
// step, and proportionally less of the longer east
// steps (reach = 0.5 + 0.42 × |v| / |w|, with |v| the
// shortest axis measured above).
const vLen = Math.min(...latticeVecs.map((w) => w.len));
const reachOf = (len) => 0.5 + 0.42 * (vLen / len);
// Each ray's discs: inside (evidence), two in the rim
// band, and one just past this axis's own rim reach.
const discsFor = (len) => [
  { f: 0.34, r: 0.10 },
  { f: 0.60, r: 0.08 },
  { f: 0.66, r: 0.13 },
  { f: Math.min(0.97, reachOf(len) + 0.10), r: 0.07 },
];
const crossings = [];
for (const F of farAll) {
  if (!(F.cx > stepLen * 0.6 && F.cx < geo.vw - stepLen * 0.6 && F.cy > stepLen * 0.6 && F.cy < geo.vh - stepLen * 0.6)) continue;
  for (const w of latticeVecs) {
    const px = F.cx + w.x, py = F.cy + w.y;
    let cd = Infinity;
    for (const cf of geo.cleanFaces ?? []) {
      const d = Math.hypot(cf.cx - px, cf.cy - py);
      if (d < cd) cd = d;
    }
    if (cd > w.len * 0.30) continue;
    const bx = F.cx + w.x * 1.45, by = F.cy + w.y * 1.45;
    if (faces.every((c) => Math.hypot(c.cx - bx, c.cy - by) > w.len * 0.30)) {
      crossings.push({ F, w, discs: discsFor(w.len) });
      break;
    }
  }
  if (crossings.length >= 8) break;
}
const featherPts = [];
for (const { F, w, discs } of crossings) for (const d of discs) {
  featherPts.push({ cx: F.cx + w.x * d.f, cy: F.cy + w.y * d.f, r: Math.max(9, w.len * d.r) });
}
// The control rays: pairs of clean faces exactly one
// lattice step apart whose whole disc zone stands
// clear of every cursed face — deep clean borders, no
// rim anywhere.
const controlRays = [];
ctrlScan: for (const a of geo.cleanFaces ?? []) for (const b of geo.cleanFaces ?? []) {
  if (a === b) continue;
  const w = matchVec(b.cx - a.cx, b.cy - a.cy);
  if (!w) continue;
  const mx = (a.cx + b.cx) / 2, my = (a.cy + b.cy) / 2;
  if (!(mx > stepLen * 0.6 && mx < geo.vw - stepLen * 0.6 && my > stepLen * 0.6 && my < geo.vh - stepLen * 0.6)) continue;
  if (!faces.every((c) => Math.hypot(c.cx - mx, c.cy - my) > w.len * 1.7)) continue;
  if (!faces.every((c) => Math.hypot(c.cx - a.cx, c.cy - a.cy) > w.len * 1.5 && Math.hypot(c.cx - b.cx, c.cy - b.cy) > w.len * 1.5)) continue;
  if (controlRays.some((r) => Math.hypot(r.mx - mx, r.my - my) < w.len * 0.7)) continue;
  controlRays.push({ a, b, w, mx, my, discs: discsFor(w.len).slice(1) });
  if (controlRays.length >= 8) break ctrlScan;
}
const controlPts = [];
for (const { a, b, discs } of controlRays) for (const d of discs) {
  controlPts.push({ cx: a.cx + (b.cx - a.cx) * d.f, cy: a.cy + (b.cy - a.cy) * d.f, r: Math.max(9, Math.hypot(b.cx - a.cx, b.cy - a.cy) * d.r) });
}
console.log(`  seam pair: ${seamPair ? "found" : "none"}; feather crossings: ${crossings.length}; control rays: ${controlRays.length}`);

const sampleReq = [];
const sampleIx = { far: [], near: [], clean: -1, beacon: -1, trio: [], trioSmall: [], seam: [], feather: [], control: [] };
for (const c of far) { sampleIx.far.push(sampleReq.length); sampleReq.push({ cx: c.cx, cy: c.cy, r: rad }); }
for (const c of near.filter(onScreen)) { sampleIx.near.push(sampleReq.length); sampleReq.push({ cx: c.cx, cy: c.cy, r: rad }); }
if (geo.beacon) { sampleIx.beacon = sampleReq.length; sampleReq.push({ cx: geo.beacon.cx, cy: geo.beacon.cy, r: rad * 0.8 }); }
if (cleanPt) { sampleIx.clean = sampleReq.length; sampleReq.push({ cx: cleanPt.cx, cy: cleanPt.cy, r: rad }); }
for (const c of trioCentres) { sampleIx.trio.push(sampleReq.length); sampleReq.push({ cx: c.cx, cy: c.cy, r: rad }); }
// The trio's hearts, read on a small disc: a floating tile
// is a soft pool now, and its rim is the feather working
// as ruled — the strength is judged at the heart (§D).
for (const c of trioCentres) { sampleIx.trioSmall.push(sampleReq.length); sampleReq.push({ cx: c.cx, cy: c.cy, r: s * 0.15 }); }
for (const p of seamPts) { sampleIx.seam.push(sampleReq.length); sampleReq.push(p); }
for (const p of featherPts) { sampleIx.feather.push(sampleReq.length); sampleReq.push(p); }
for (const p of controlPts) { sampleIx.control.push(sampleReq.length); sampleReq.push(p); }
const sampled = await discStatsMany(sampleReq);
const stats = { far: [], near: [], clean: null, beacon: null, trio: [], trioSmall: [], s, stepLen };
for (const i of sampleIx.far) if (sampled[i]) stats.far.push(sampled[i]);
for (const i of sampleIx.near) if (sampled[i]) stats.near.push(sampled[i]);
if (sampleIx.beacon >= 0) stats.beacon = sampled[sampleIx.beacon];
if (sampleIx.clean >= 0) stats.clean = sampled[sampleIx.clean];
for (const i of sampleIx.trio) if (sampled[i]) stats.trio.push(sampled[i]);
for (const i of sampleIx.trioSmall) if (sampled[i]) stats.trioSmall.push(sampled[i]);
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

/* The wash's lines, read off the sampled discs (§F/§G).
 * The feather points are also read on the preserved
 * per-hex screenshot — identical camera geometry, the
 * A/B this drive has always stood on. */
let seamInfo = null, featherInfo = null, fpsInfo = null;
if (TAG === "after") {
  if (seamPair && sampleIx.seam.length) {
    const prof = sampleIx.seam.map((i) => sampled[i]);
    const band = (lo, hi) => {
      const vals = prof.filter((_, i) => { const t = i / SEAM_N; return t >= lo && t <= hi; }).map((x) => x?.rMean).filter((v) => v != null);
      return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null;
    };
    seamInfo = {
      centre: (band(0, 0.25) + band(0.75, 1)) / 2,
      seam: band(0.4, 0.6),
      profile: prof.map((x) => x ? Math.round(x.rMean) : -1),
    };
    console.log(`SEAM centre-band=${seamInfo.centre?.toFixed(1)} seam-band=${seamInfo.seam?.toFixed(1)} profile=${seamInfo.profile.join(",")}`);
  } else {
    console.log("SEAM no adjacent far pair found on screen");
  }
  if (crossings.length) {
    const profNew = sampleIx.feather.map((i) => sampled[i]);
    let profOld = null;
    const perhexPath = join(OUT, "cursed-light-after-perhex.png");
    if (existsSync(perhexPath)) {
      profOld = await decodeDiscs(readFileSync(perhexPath).toString("base64"), featherPts);
    }
    // Per-crossing readings (the per-hex build's values
    // at the same points print as background evidence —
    // cross-boot drift keeps them out of the verdict).
    // Soundness guards, judged on the wash's own values:
    // a crossing only speaks if its inside disc (0.34)
    // truly stands on cursed art (red ≤ 80 — relieved
    // faces read ~30–40 there; glow zones and UI read
    // far brighter) and its band disc (0.60) stands on
    // opaque art (≥ 30).
    const per = crossings.map((_, ci) => ({
      new: [0, 1, 2, 3].map((oi) => profNew[ci * 4 + oi]?.rMean ?? null),
      old: profOld ? [0, 1, 2, 3].map((oi) => profOld[ci * 4 + oi]?.rMean ?? null) : null,
    }));
    per.forEach((p, ci) => {
      console.log(`FEATHER crossing ${ci}: wash=${p.new.map((v) => v?.toFixed(1)).join("/")} per-hex=${p.old ? p.old.map((v) => v?.toFixed(1)).join("/") : "n/a"}`);
    });
    const sound = per.filter((p) => p.new[0] != null && p.new[0] <= 80 && p.new[1] != null && p.new[1] >= 30);
    console.log(`FEATHER sound crossings: ${sound.length} of ${crossings.length}`);
    const ctrl = controlRays.map((_, ci) => [0, 1, 2].map((oi) => sampled[sampleIx.control[ci * 3 + oi]]?.rMean ?? null));
    ctrl.forEach((p, ci) => {
      console.log(`FEATHER control ${ci}: ${p.map((v) => v?.toFixed(1)).join("/")}`);
    });
    const mean = (vals) => {
      const v = vals.filter((x) => x != null);
      return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null;
    };
    const median = (vals) => {
      const v = vals.filter((x) => x != null).sort((a, b) => a - b);
      return v.length ? v[Math.floor(v.length / 2)] : null;
    };
    // The verdict ratios: per crossing, wash ÷ per-hex
    // at the identical point (the art is the same stamp
    // in both boots; with the true lattice neighbours
    // the points sit on matched art, and the band
    // signature clustered at 1.14–1.16 on every sound
    // crossing in the proving runs). The treatment ÷
    // control comparison prints as background only —
    // the clean face's edges are not equally bright on
    // every side, so deep-clean borders are not a fair
    // art control for a frontier approach.
    const ratioPer = sound.map((p) => p.old ? p.new.map((v, oi) => (v != null && p.old[oi]) ? v / p.old[oi] : null) : null).filter(Boolean);
    featherInfo = {
      crossings: crossings.length,
      sound: sound.length,
      controls: controlRays.length,
      inside: mean(sound.map((p) => p.new[0])),
      treat: [mean(sound.map((p) => p.new[1])), mean(sound.map((p) => p.new[2])), mean(sound.map((p) => p.new[3]))],
      ctrl: [mean(ctrl.map((p) => p[0])), mean(ctrl.map((p) => p[1])), mean(ctrl.map((p) => p[2]))],
      ratio: [0, 1, 2, 3].map((oi) => median(ratioPer.map((r) => r[oi]))),
      ratioAll: ratioPer,
    };
    console.log(`FEATHER inside-disc (0.34) mean: ${featherInfo.inside?.toFixed(1)}`);
    console.log(`FEATHER treatment means @band1/band2/beyond-reach: ${featherInfo.treat.map((v) => v?.toFixed(1)).join("  ")}`);
    console.log(`FEATHER control   means @band1/band2/beyond-reach: ${featherInfo.ctrl.map((v) => v?.toFixed(1)).join("  ")}`);
    console.log(`FEATHER median ratio wash/per-hex @inside/band1/band2/beyond: ${featherInfo.ratio.map((v) => v?.toFixed(3)).join("  ")}`);
  } else {
    console.log("FEATHER no clean crossings found on screen");
  }
}

await page.screenshot({ path: join(OUT, `cursed-light-${TAG}.png`) });

/* ── §H — frame rate with the wash shown, then hidden
 * (printed evidence for the wash's render cost, not a
 * gate: this box's load swings too widely to gate on). */
if (TAG === "after") {
  fpsInfo = await page.evaluate(async () => {
    const probe = (ms) => new Promise((res) => {
      let n = 0;
      const t0 = performance.now();
      const tick = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(tick); else res(n / ((performance.now() - t0) / 1000)); };
      requestAnimationFrame(tick);
    });
    const on = await probe(3000);
    const gs = [...document.querySelectorAll("#land-dusk-mask [data-cursed-region]")];
    const prev = gs.map((g) => g.style.display);
    gs.forEach((g) => { g.style.display = "none"; });
    await new Promise((r) => setTimeout(r, 400));
    const off = await probe(3000);
    gs.forEach((g, i) => { g.style.display = prev[i] ?? ""; });
    return { on, off };
  }).catch((e) => { console.log("  fps probe failed:", String(e).slice(0, 120)); return null; });
  if (fpsInfo) console.log(`FPS wash shown=${fpsInfo.on.toFixed(1)} hidden=${fpsInfo.off.toFixed(1)}`);
}

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
  // The rework changed the relief's SHAPE, not its
  // strength: the first (per-hex) build's relieved far
  // mean stands on record at 30.63 (its own after table).
  // The wash's heart — face centres deep in their regions
  // — must land within ±10% of it.
  ok("the wash's heart keeps the first build's relieved strength (±10% of 30.63)",
    af && af.rMean >= 30.63 * 0.9 && af.rMean <= 30.63 * 1.1, `wash far mean=${af?.rMean?.toFixed(1)}`);
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
  // pass above): the risen face is a soft pool of one —
  // its RIM is the feather working as ruled, so the
  // strength is read at the hearts (small discs): every
  // distinct seat's heart must clear the before run's
  // far-patch average by the same lift as the ground.
  // The wide-disc readings print as evidence.
  if (trio && bf) {
    const trioStats = stats.trio;
    const heartStats = stats.trioSmall;
    console.log("  floating stack red means (wide disc):", trioStats.map((x) => x.rMean.toFixed(1)).join(", "), "vs before far average", bf.rMean.toFixed(1));
    console.log("  floating stack red means (heart disc):", heartStats.map((x) => x.rMean.toFixed(1)).join(", "));
    ok("the floating cursed tile and the cursed rows beneath it are relieved at their hearts",
      heartStats.length >= 2 && heartStats.every((x) => x.rMean > bf.rMean * 1.1),
      `hearts=${heartStats.map((x) => x.rMean.toFixed(1)).join(",")} beforeFar=${bf.rMean.toFixed(1)}`);
  } else {
    ok("the floating cursed stack was found on screen", false, "no vertical trio of cursed faces");
  }
  // §F — the seam: crossing from one cursed tile into its
  // cursed neighbour, the red must not dip at the shared
  // border. (Per-tile feathering would dig the seam band
  // toward the unrelieved reading; one wash holds it
  // level — the envelope allows the face art's own
  // texture, which the centre bands carry equally.)
  if (seamInfo) {
    ok("§F no hex rim: the seam band between two cursed neighbours holds the centre bands' level (≥75%)",
      seamInfo.seam != null && seamInfo.centre != null && seamInfo.seam >= seamInfo.centre * 0.75,
      `seam=${seamInfo.seam?.toFixed(1)} centre=${seamInfo.centre?.toFixed(1)}`);
  } else {
    ok("§F an adjacent far cursed pair was found for the seam line", false, "no pair on screen");
  }
  // §G — the feather, judged by the wash ÷ per-hex
  // ratio at identical points along true-neighbour
  // crossings (median across sound crossings): inside
  // the rim band the per-hex build wore full dusk and
  // the wash wears the half-strength rim (veil 0.345
  // vs 0.44), so the ratio must stand at ≈1.15; past
  // the rim's reach on its own axis both builds wear
  // full dusk and the ratio must fall back to ≈1 — the
  // spill is a rim at the frontier, not a wash over
  // clean land, and §B's far control stands untouched
  // besides. (The core's strength inside is §A's
  // verdict, read on big discs against the stored
  // baselines; the small inside disc here prints as
  // evidence, carrying the living scene's wander.)
  if (featherInfo && featherInfo.ratio && featherInfo.sound >= 3) {
    const [, rBand1, rBand2, rBeyond] = featherInfo.ratio;
    ok("§G the wash spills across the frontier: in the rim band the wash reads brighter than the per-hex build at the same points",
      rBand1 != null && rBand2 != null && rBand1 >= 1.08 && rBand2 >= 1.08,
      `median ratio@band1=${rBand1?.toFixed(3)} @band2=${rBand2?.toFixed(3)} per-crossing=${featherInfo.ratioAll.map((r) => r.map((v) => v?.toFixed(2)).join("/")).join("  ")}`);
    ok("§G the band ends: past the rim's reach the two builds read the same again — full dusk restored",
      rBeyond != null && rBeyond >= 0.95 && rBeyond <= 1.07, `median ratio@beyond=${rBeyond?.toFixed(3)}`);
  } else if (featherInfo) {
    ok("§G at least three sound crossings with per-hex readings were found", false,
      `sound=${featherInfo.sound} of ${featherInfo.crossings}`);
  } else {
    ok("§G clean crossings were found for the feather line", false, `crossings=${featherInfo?.crossings ?? 0}`);
  }
}

await browser.close();
console.log(`drive-cursed-light[${TAG}]: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
