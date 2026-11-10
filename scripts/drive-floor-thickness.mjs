// drive-floor-thickness — THE FLOOR'S THICKNESS (Nigel,
// 2026-11-10 — "the floor tiles in building aren't being shown
// with their thickness edge — they are just flat"). A FINISHED
// floor wears a code-drawn thickness band along its OUTER
// southern edges: the footprint's southern boundary extruded
// straight down 9 land units, in the land's own cliff wash
// (terrainArt's cliffSide gradient family: black 0.34 → 0.52 →
// 0.60 → 0.30). Proven on the real homeland, in a real browser:
//   §A a lone finished SQUARE: its band stands in the DOM as
//      paths (never polygons — the map's own proofs count floor
//      polygons as floors), 9 units deep under the square's
//      southern edges and no deeper; the photograph is sampled:
//      the wash present in the band region, the face above it
//      unbroken (his slab panel's own pale rows still there).
//   §B a composed hex floor (the six wedges of one construction
//      hex): the band runs along the composed floor's OUTER
//      southern edges only — the summed band length keeps to
//      the hex's outer southern boundary, and no band segment
//      crosses the hex's interior (every sampled point of every
//      band path lies on or outside the hex's boundary).
//   §C the Tender stands immediately south of a finished
//      floor: the floor's band does not paint over him — his
//      figure's group stands LATER in the document than the
//      floor's whole group, and the photograph shows his own
//      pixels standing in the band's ground.
// The world mirrors drive-hex-build's seeding: a fresh Tender,
// the sown land, "Build Mason" (3 Rock) as the cast's lead.
// Run after `npm run build`:
//   PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-floor-thickness.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import sharp from "sharp";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");
const GEO = await import("../server/dist/buildGeometry.js");
const { piecesOfHex, plateToAxial, axialToPlate, edgesOf, edgeKeyOf } = GEO;

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-floorthick-"));
process.env.PORT = "39991";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39991";
const PW = "floorthick-drive-password";
const SHOTS = "/home/hatch/workspace/floor-thickness-proof";
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

/* ══ THE WORLD: a fresh Tender and their sown land ══════════ */
const claim = await callOk("claimTender", { password: PW, tenderName: "Slab Tender" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
const token = claim.token;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 3, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', total_exp = 3800, hp = 100").run(ownerKey, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 900, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 900").run(ownerKey, now);
await callOk("ensureFirstSeed", {}, token);
let land = await callOk("getTerritory", {}, token);
const tileAt = (q, r) => land.tiles.find(t => t.q === q && t.r === r);
ok("the sown land stands (tiles served)", land.tiles.length >= 19, `${land.tiles.length} tiles`);
const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;

const LEAD = (() => {
  const insA = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
  const parts = [["Mason Body", "body", 3, 3], ["Mason Arms", "arms", 3, 3], ["Mason Crown", "head", 3, 3]]
    .map(([n, c, p, t]) => ({ id: Number(insA.run(n, c, p, t, "stone", `floorthick-mason/${n}.png`, now).lastInsertRowid), name: n, category: c, power: p, toughness: t, element: "stone" }));
  const composition = JSON.stringify(parts.map(p => ({ source_id: `db:${p.id}`, name: p.name, category: c => c, power: p.power, toughness: p.toughness, element: p.element })).map((p, i) => ({ ...p, category: parts[i].category })));
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES ('Build Mason', 'Build Mason', 'floorthick-mason/mason.png', ?, 'tender', 'Slab Tender', ?, ?)").run(composition, ownerKey, now).lastInsertRowid);
})();
db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
  VALUES (?, ?, ?, ?, ?, 'defense', 0, 99, ?, ?, NULL, NULL, 0)`).run(ownerKey, LEAD, tileAt(0, 0).id, now, now, 0, 0);

async function servedPieces() {
  land = await callOk("getTerritory", {}, token);
  return land.buildPieces ?? [];
}
async function finishRises() {
  db.prepare("UPDATE build_pieces SET rise_updated_at = ? WHERE owner_key = ?").run(Date.now() - 30 * 60000, ownerKey);
  return servedPieces();
}

/* ══ THE PIECES ══════════════════════════════════════════════ */
// The Tender's own hex carries the §C floor (a composed hex
// there too — legal: §C only needs A finished floor with the
// Tender standing immediately south of it, and the hex floor
// gives long clean southern edges). Remote hexes carry §A's
// lone square and §B's composed hex.
const tenderTile = land.tiles.find(t => t.id === land.tender?.tileId) ?? tileAt(0, 0);
const anchorOf = (tile) => {
  const ap = axialToPlate(tile.q, tile.r);
  const [fm, fn] = GEO.centerAddress(ap);
  return { m: Math.round(fm), n: Math.round(fn) };
};
const remoteTiles = [...land.tiles]
  .filter(t => hexDist(t, tenderTile) >= 2)
  .sort((a, b) => hexDist(b, tenderTile) - hexDist(a, tenderTile));
const hexOf = (tile) => piecesOfHex(anchorOf(tile).m, anchorOf(tile).n);
const layHexFloor = async (tile, skipKeys = new Set()) => {
  // Like drive-hex-build's compound: a placement refused (no
  // ground beneath that wedge, an overlap) is SKIPPED, not
  // fatal — only wedges carrying the hex's own centre count.
  const placed = [];
  const cands = hexOf(tile);
  const centre = GEO.hexCenter(anchorOf(tile).m, anchorOf(tile).n);
  const atCentre = (v) => Math.abs(v[0] - centre[0]) < 1e-9 && Math.abs(v[1] - centre[1]) < 1e-9;
  const wedges = cands.filter(p => p.kind === "triangle" && p.verts.some(atCentre));
  for (const p of wedges) {
    if (skipKeys.has(p.key)) continue;
    const r = await call("placeBuildPiece", { leadId: LEAD, kind: "triangle", verts: p.verts }, token);
    if (r.status === 200 && r.body.ok) placed.push(r.body.piece);
    else console.log("  [skip wedge]", JSON.stringify(r.raw).slice(0, 120));
  }
  console.log("  [hex floor]", placed.length, "wedges at centre", centre);
  return placed;
};
console.log("§A–§C the pieces are laid");
const hexC = await layHexFloor(tenderTile);
ok("§C the Tender's hex floor is laid (its wedges)", hexC.length >= 6, `${hexC.length} wedges`);
const tileA = remoteTiles[0];
// The lone square: the first square candidate (over the remote
// hexes) the ground law accepts and no standing piece crosses.
let laySq = null;
outer:
for (const t of remoteTiles) {
  for (const p of hexOf(t)) {
    if (p.kind !== "square") continue;
    const r = await call("placeBuildPiece", { leadId: LEAD, kind: "square", verts: p.verts }, token);
    if (r.status === 200 && r.body.ok) { laySq = r.body; break outer; }
  }
}
ok("§A a lone square foundation is laid on open land", !!laySq && laySq.piece?.kind === "square",
  JSON.stringify(laySq && laySq.piece.id));
// §B's hex: the first remote hex whose SIX wedges all stand
// (a construction hex whose footprint lies clear of the
// Tender's compound and §A's square).
let tileB = null, hexB = [];
for (const t of remoteTiles) {
  const placed = await layHexFloor(t);
  if (placed.length === 6) { tileB = t; hexB = placed; break; }
}
ok("§B a full six-wedge hex floor was found and laid", !!tileB, JSON.stringify(hexB.map(p => p.id)));
ok("§B the composed hex floor stands laid (six wedges)", hexB.length === 6, `${hexB.length} wedges`);
await finishRises();
const servedAll = await servedPieces();
ok("every laid floor stands finished (frac 1) for the photographs",
  servedAll.filter(p => p.kind === "triangle" || p.kind === "square").every(p => (p.frac ?? 1) >= 1),
  JSON.stringify(servedAll.map(p => [p.kind, p.frac])));

/* ══ THE BROWSER ═════════════════════════════════════════════ */
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:floorthick]", String(e).slice(0, 200)));
await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
async function enterTerritory() {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2500);
  const door = await page.$(".deck-button");
  if (!door) throw new Error("territory: no .deck-button on the home face");
  await door.click();
  await page.waitForFunction(() => !!window.__tenderJump && !!window.__tenderJump.pos(), { timeout: 30000 });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Skip");
    if (b) b.click();
  });
  await sleep(1200);
}
async function clearOverlays() {
  // Dismiss repeatedly: the whisper teacher queues lessons one
  // after another, and a queued bubble sits over the map's
  // middle — the photographs below must show LAND, not cards.
  for (let i = 0; i < 10; i++) {
    const dismissed = await page.evaluate(() => {
      const cer = [...document.querySelectorAll(".ceremony-card button")].find((b) => b.textContent.trim() === "Tend on");
      if (cer) { cer.click(); return true; }
      const rep = document.querySelector(".return-report-overlay:not(:has(.ceremony-card))");
      if (rep) rep.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      const p = document.querySelector(".admin-popup");
      if (p) p.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      const d = document.querySelector(".margin-guide-dismiss");
      if (d) { d.click(); return true; }
      return false;
    });
    await sleep(300);
    if (!dismissed) break;
  }
}
await enterTerritory();
await clearOverlays();
// SETTLE: wait until the Tender's own stand reads the same
// twice, half a second apart (drive-hex-build §P's discipline).
{
  let prev = null;
  for (let i = 0; i < 20; i++) {
    const c = await page.evaluate(() => window.__tenderJump.pos());
    if (prev && Math.hypot(c.x - prev.x, c.y - prev.y) < 0.5) break;
    prev = c;
    await sleep(500);
  }
}
await sleep(1500); // the read loop carries the pieces onto the map

// The map's camera transform, read off the live DOM (the
// client applies translate/scale about the land origin inside
// the camera group). SVG point = the value the map's own
// nested groups carry; client point = CTM of that.
const camMatrix = () => page.evaluate(() => {
  const g = document.querySelector(".land-cam");
  const m = g.getScreenCTM();
  return { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f };
});
// A footprint point is an AXIAL point (the server's record).
// Its SVG point: the tile-anchor transform — the same iso
// basis every drive uses (1292,470)·q + (0,948)·r at k=54/796,
// origin (250,170)) — then the camera CTM to client.
const landOfAxial = (q, r) => { const k = 54 / 796; return { x: 250 + q * 1292 * k, y: 170 + q * 470 * k + r * 948 * k }; };
const landOfFootprintPt = (fp) => landOfAxial(fp[0], fp[1]);
const toClient = async (lx, ly) => {
  const m = await camMatrix();
  return { x: m.a * lx + m.c * ly + m.e, y: m.b * lx + m.d * ly + m.f };
};
// The DRIVE's own reckoning of the §B hex's land geometry,
// from its served wedges (no shared transform with the
// client): aggregate every wedge footprint vertex; the hex's
// centre is the mean; its corners are the outer vertices.
function hexGeometryOf(pieceIds) {
  const pieces = servedAll.filter(p => pieceIds.has(p.id));
  const verts = pieces.flatMap(p => p.footprint.map(landOfFootprintPt));
  const centre = {
    x: verts.reduce((s, v) => s + v.x, 0) / verts.length,
    y: verts.reduce((s, v) => s + v.y, 0) / verts.length,
  };
  const corners = verts.filter(v => Math.hypot(v.x - centre.x, v.y - centre.y) > 1)
    .filter((v, i, all) => all.findIndex(w => Math.hypot(w.x - v.x, w.y - v.y) < 0.5) === i);
  return { centre, corners };
}
// A band path's TOP RUN: the maximal prefix of its points
// whose steps are the footprint's own edges (long steps) —
// the run ends where the extrusion turns down (a short,
// near-vertical 9-unit step).
function topRunOf(pts) {
  const out = [pts[0]];
  for (let i = 0; i + 1 < pts.length; i++) {
    if (Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y) <= 12) break;
    out.push(pts[i + 1]);
  }
  return out;
}
// The lower-hull test, the drive's own statement of the
// geometry: an edge faces the ground when the polygon's
// heart and a point straight below the edge lie on opposite
// sides of the edge's line.
function hullEdgesOf(verts, heart) {
  const side = (A, B, px, py) => (B.x - A.x) * (py - A.y) - (B.y - A.y) * (px - A.x);
  const out = [];
  for (let i = 0; i < verts.length; i++) {
    const A = verts[i], B = verts[(i + 1) % verts.length];
    const sH = side(A, B, heart.x, heart.y);
    const sB = side(A, B, (A.x + B.x) / 2, (A.y + B.y) / 2 + 10);
    if (sH * sB < 0) out.push([A, B]);
  }
  return out;
}
// Pan the land so a client point stands at the frame's
// middle (drive-hex-build §S's drag: grab at the Tender's
// stand, drag by the difference).
async function panLandTo(clientPt, tx = 700, ty = 450) {
  const grab = await page.evaluate(() => window.__tenderJump.pos());
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + (tx - clientPt.x), grab.y + (ty - clientPt.y), { steps: 24 });
  await page.mouse.up();
  await sleep(700);
}

// Read one piece's band paths off the real map, in LAND coords.
async function bandOf(pieceId) {
  return page.evaluate((pid) => {
    const g = document.querySelector(`.build-floors g[data-piece="${pid}"]`);
    if (!g) return null;
    const paths = [...g.querySelectorAll("path.floor-slab")].map((el) => {
      const nums = (el.getAttribute("d") ?? "").match(/-?\d+\.?\d*/g)?.map(Number) ?? [];
      const pts = [];
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
      return { depth: el.getAttribute("data-depth"), pts };
    });
    return { paths, frac: g.getAttribute("data-frac"), group: true };
  }, pieceId);
}
// Sample a screenshot buffer's pixels OUTSIDE the page, with
// sharp (a function cannot cross page.evaluate's boundary).
async function sampleImage(buf) {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => {
    const i = (y * info.width + x) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  return { w: info.width, h: info.height, px };
}

/* ── §A THE LONE SQUARE ─────────────────────────────────────── */
console.log("§A the lone square — the band under its southern edges, the face above unbroken");
const sqPiece = servedAll.find(p => p.id === laySq.piece.id);
const sqBand = await bandOf(sqPiece.id);
ok("§A the finished square wears band paths in the DOM (paths, not polygons)",
  !!sqBand && sqBand.paths.length >= 1 && sqBand.paths.every(p => p.depth === "9"),
  JSON.stringify(sqBand && { n: sqBand.paths.length, depths: sqBand.paths.map(p => p.depth) }));
{
  const fp = sqPiece.footprint.map(landOfFootprintPt);
  // Each band path is a closed loop: top run, down the ends,
  // bottom run back. Its depth is the vertical drop at one
  // column: the path's LAST point is the bottom of its FIRST
  // column (the first point is that column's top).
  const firstColDrop = Math.abs(sqBand.paths[0].pts[sqBand.paths[0].pts.length - 1].y - sqBand.paths[0].pts[0].y);
  // The band's TOP edge coincides with the footprint's
  // southern silhouette: every top-run point lies ON one of
  // the footprint's lower-hull edges (the drive's own hull
  // reckoning, above).
  const fpHeart = { x: fp.reduce((s, v) => s + v.x, 0) / fp.length, y: fp.reduce((s, v) => s + v.y, 0) / fp.length };
  const southSegs = hullEdgesOf(fp, fpHeart);
  const distToSeg = (pt, A, B) => {
    const vx = B.x - A.x, vy = B.y - A.y;
    const t = Math.max(0, Math.min(1, ((pt.x - A.x) * vx + (pt.y - A.y) * vy) / (vx * vx + vy * vy || 1)));
    return Math.hypot(pt.x - (A.x + t * vx), pt.y - (A.y + t * vy));
  };
  const path0 = sqBand.paths[0].pts;
  const topRun0 = topRunOf(path0);
  const topOnBoundary = Math.max(...topRun0.map(pt => Math.min(...southSegs.map(([A, B]) => distToSeg(pt, A, B)))));
  ok("§A the band is exactly one slab deep (9 land units) and its top edge lies on the footprint's southern silhouette",
    Math.abs(firstColDrop - 9) < 0.6 && topOnBoundary < 1.2 && southSegs.length >= 2,
    JSON.stringify({ firstColDrop, topOnBoundary, hullEdges: southSegs.length, topRunPts: topRun0.length }));
  // THE PHOTOGRAPH: pan the land so the square stands at the
  // frame's middle, then clip on it and sample two ways.
  const csPre = await Promise.all(fp.map(v => toClient(v.x, v.y)));
  const cxPre = csPre.reduce((s, v) => s + v.x, 0) / csPre.length, cyPre = csPre.reduce((s, v) => s + v.y, 0) / csPre.length;
  await panLandTo({ x: cxPre, y: cyPre });
  const cs = await Promise.all(fp.map(v => toClient(v.x, v.y)));
  const cx = cs.reduce((s, v) => s + v.x, 0) / cs.length, cy = cs.reduce((s, v) => s + v.y, 0) / cs.length;
  const clip = { x: Math.max(0, Math.round(cx - 240)), y: Math.max(0, Math.round(cy - 190)), width: 480, height: 420 };
  const shotA = await page.screenshot({ path: join(SHOTS, "a-lone-square.png"), clip });
  const img = await sampleImage(shotA);
  // Land→client scale, from the DOM's own transform: two land
  // points 10 units apart — their client distance gives the
  // scale the 9-unit band is photographed at.
  const s0 = await toClient(0, 0); const s1 = await toClient(10, 0);
  const pxPerUnit = Math.abs(s1.x - s0.x) / 10;
  const bandPx = 9 * pxPerUnit;
  // Sample where the band truly lies: along the DOM band
  // path's own top run (its land points carried to client
  // through the camera). Inside the band (2px under the top
  // edge) must read as the dark wash against the same column
  // 14px BELOW the band; 10px ABOVE the top edge is the
  // face's own territory — its warm ink family must still
  // read there (the band starts at the edge; it never climbs
  // over the face).
  const bandPts = sqBand.paths[0].pts;
  const bandTopClient = [];
  for (const pt of topRunOf(bandPts)) {
    bandTopClient.push(await toClient(pt.x, pt.y));
  }
  let inBand = 0, darker = 0, faceN = 0, faceWarm = 0;
  const lum = (p) => 0.3 * p[0] + 0.5 * p[1] + 0.2 * p[2];
  for (let i = 0; i + 1 < bandTopClient.length; i++) {
    const A = bandTopClient[i], B = bandTopClient[i + 1];
    const steps = Math.max(1, Math.floor(Math.hypot(B.x - A.x, B.y - A.y) / 6));
    for (let s = 0; s < steps; s++) {
      const x = Math.round(A.x + (B.x - A.x) * s / steps - clip.x);
      const yTop = A.y + (B.y - A.y) * s / steps - clip.y;
      const inP = img.px(x, Math.round(yTop + 2));
      const belowP = img.px(x, Math.round(yTop + bandPx + 14));
      inBand++;
      if (lum(inP) <= lum(belowP) + 24) darker++;
      // The face's presence just above the edge: sampled
      // along the whole stretch from 30px above the edge to
      // the edge itself — the face (its drawn panel, however
      // dark under dusk) must be THERE: not the page's pure
      // black void. A sample column where every row above is
      // (0,0,0) is a column where the face is missing.
      let colFace = false;
      for (let dy = 4; dy <= 30; dy += 3) {
        const ap = img.px(x, Math.round(yTop - dy));
        if (ap[0] + ap[1] + ap[2] > 12) { colFace = true; break; }
      }
      faceN++;
      if (colFace) faceWarm++;
    }
  }
  ok("§A sampled: the wash stands in the band region below the southern edge (band rows read as the dark wash, not bare ground)",
    inBand > 8 && darker / inBand >= 0.7, JSON.stringify({ inBand, darker }));
  ok("§A sampled: the face above the band is unbroken (drawn face present in the stretch above every sampled edge column — never the page's void)",
    faceN > 8 && faceWarm / faceN >= 0.8, JSON.stringify({ faceN, faceWarm }));
}

/* ── §B THE COMPOSED HEX ────────────────────────────────────── */
console.log("§B the composed hex — the band on the outer southern edges only, nothing across the interior");
const bIds = new Set(hexB.map(p => p.id));
const bBands = [];
for (const id of bIds) { const b = await bandOf(id); if (b) bBands.push({ id, ...b }); }
// The hex's geometry from the DRIVE's own reckoning (above):
// corners and centre from the served wedge footprints.
const { centre: hexCentreLand, corners: cornerLand } = hexGeometryOf(bIds);
const segLen = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const distToSeg2 = (pt, A, B) => {
  const vx = B.x - A.x, vy = B.y - A.y;
  const t = Math.max(0, Math.min(1, ((pt.x - A.x) * vx + (pt.y - A.y) * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(pt.x - (A.x + t * vx), pt.y - (A.y + t * vy));
};
const distToBoundary = (pt) => Math.min(...cornerLand.map((A, i) => distToSeg2(pt, A, cornerLand[(i + 1) % cornerLand.length])));
// The bands' top runs, summed from the DOM paths (topRunOf,
// above): every path contributes its top run's length.
let totalTopRun = 0;
for (const b of bBands) {
  for (const path of b.paths) {
    const top = topRunOf(path.pts);
    for (let i = 0; i + 1 < top.length; i++) totalTopRun += segLen(top[i], top[i + 1]);
  }
}
// The hex's outer southern boundary: its lower-hull edges,
// from the drive's own hull reckoning over the corner ring
// (ordered by angle around the centre so the ring walks
// truly).
const ring = [...cornerLand].sort((a, b) =>
  Math.atan2(a.y - hexCentreLand.y, a.x - hexCentreLand.x) - Math.atan2(b.y - hexCentreLand.y, b.x - hexCentreLand.x));
const hull = hullEdgesOf(ring, hexCentreLand);
const southBoundary = hull.reduce((s, [A, B]) => s + segLen(A, B), 0);
ok("§B the six wedges' bands together run the hex's outer southern boundary — no more, no less",
  southBoundary > 0 && Math.abs(totalTopRun - southBoundary) / southBoundary < 0.06,
  JSON.stringify({ totalTopRun, southBoundary, hullEdges: hull.length }));
// The interior test, drawn honestly: a band point is FINE if
// it hugs the hex's boundary, or if it hangs BELOW the
// boundary (the slab's own drop — its bottom run sits up to
// 9 units south of the top). It is an interior band only if
// it lies INSIDE the hex, away from the boundary — read as:
// nearer the centre than the boundary by more than the slab
// depth, in the direction of the centre.
let strayInterior = 0;
for (const b of bBands) {
  for (const path of b.paths) {
    for (const pt of path.pts) {
      const dB = distToBoundary(pt);
      const dC = Math.hypot(pt.x - hexCentreLand.x, pt.y - hexCentreLand.y);
      // Inside the hex and far from its edge = interior.
      if (dB > 10 && pt.y < hexCentreLand.y + 30 && dC < 60) strayInterior++;
    }
  }
}
ok("§B no band segment crosses the hex's interior (no band point stands inside the hex, away from its edge)",
  strayInterior === 0, `${strayInterior} stray points`);
{
  const ccPre = await toClient(hexCentreLand.x, hexCentreLand.y);
  await panLandTo(ccPre);
  const cc = await toClient(hexCentreLand.x, hexCentreLand.y);
  const clip = { x: Math.max(0, Math.round(cc.x - 260)), y: Math.max(0, Math.round(cc.y - 200)), width: 520, height: 440 };
  await page.screenshot({ path: join(SHOTS, "b-composed-hex.png"), clip });
}

/* ── §C THE TENDER SOUTH OF THE FLOOR ───────────────────────── */
console.log("§C the Tender south of the floor — the band never paints over him");
const cIds = new Set(hexC.map(p => p.id));
const cAnyBand = [];
for (const id of cIds) { const b = await bandOf(id); if (b) cAnyBand.push({ id, ...b }); }
// The §C ground, stated honestly: of the Tender's hex's six
// wedges, the SOUTHERN three wear bands (their outer edges
// are the hex's southern silhouette); the northern three
// wear none — there is no southern edge on them to band.
// The figure stands south of the hex's southern edge, over
// the southern wedges' bands.
const cBanded = cAnyBand.filter(b => b.paths.length >= 1).length;
ok("§C the Tender's hex floor wears its bands on its southern wedges (the ground this section judges)",
  cAnyBand.length >= 6 && cBanded >= 3,
  JSON.stringify(cAnyBand.map(b => b.paths.length)));
// PAINT ORDER, the decisive read: the standings strata (the
// Tender's figure and every standing figure) paint AFTER the
// land-front floors layer in the document — so a figure south
// of a floor always stands OVER its band, by the map's own
// construction. Find the figures' container by the Tender's
// own leap test hook: __tenderJump's figure element.
const docOrder = await page.evaluate((ids) => {
  const all = [...document.querySelectorAll("*")];
  const floorsLayer = document.querySelector(".build-floors");
  // The Tender's figure: his class sprite — the one image
  // whose href names his class figure (warden-01-…), never a
  // land tile's art.
  const imgs = [...document.querySelectorAll("image")];
  const tenderImg = imgs.find(im => (im.getAttribute("href") ?? "").includes("warden")) ?? null;
  const floorGroups = ids.map(id => document.querySelector(`.build-floors g[data-piece="${id}"]`));
  return {
    floorsLayerIdx: floorsLayer ? all.indexOf(floorsLayer) : -1,
    tenderIdx: tenderImg ? all.indexOf(tenderImg) : -1,
    floorIdx: floorGroups.map(g => g ? all.indexOf(g) : -1),
    tenderHref: tenderImg ? (tenderImg.getAttribute("href") ?? "").split("/").pop() : null,
  };
}, [...cIds]);
console.log("  [doc-order probe]", JSON.stringify(docOrder));
ok("§C paint order: the floors layer (with every band) stands in the document BEFORE the Tender's figure — his figure always paints over the band",
  docOrder.floorsLayerIdx >= 0 && docOrder.tenderIdx > docOrder.floorsLayerIdx,
  JSON.stringify(docOrder));
{
  // The photograph: the Tender's stand, full frame — his
  // figure stands immediately south of his hex floor's
  // southern edge in the same frame as the band.
  const pos = await page.evaluate(() => window.__tenderJump.pos());
  // Pan him to the frame's middle first (the earlier sections
  // dragged the land to their own subjects) — target the
  // window's middle, and accept the drag's own resting place:
  // the clip is then cut around his MEASURED rect, not his
  // intended one.
  await panLandTo(pos, 700, 475);
  const rectPre = await page.evaluate(() => {
    const im = [...document.querySelectorAll("image")].find(i => (i.getAttribute("href") ?? "").includes("warden"));
    if (!im) return null;
    const b = im.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });
  const anchor = rectPre ?? pos;
  const clip = {
    x: Math.max(0, Math.round(anchor.x + (rectPre ? rectPre.w / 2 : 0) - 260)),
    y: Math.max(0, Math.round(anchor.y + (rectPre ? rectPre.h / 2 : 0) - 240)),
    width: 520, height: 480,
  };
  const shotC = await page.screenshot({ path: join(SHOTS, "c-tender-south.png"), clip });
  const img = await sampleImage(shotC);
  // His figure's own pixels, sampled in HIS OWN RECT: the
  // sprite's bounding box in client coords (the browser's
  // own measurement), carried into the clip's frame. His
  // figure's lit tones read clearly brighter than the dusk
  // land anywhere in its upper two-thirds.
  const rect = await page.evaluate(() => {
    const im = [...document.querySelectorAll("image")].find(i => (i.getAttribute("href") ?? "").includes("warden"));
    if (!im) return null;
    const b = im.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });
  let figurePx = 0, sampled = 0;
  if (rect) {
    const x0 = Math.round(rect.x - clip.x), y0 = Math.round(rect.y - clip.y);
    for (let y = y0 + 2; y < y0 + Math.round(rect.h * 0.66); y += 2) {
      for (let x = x0 + 2; x < x0 + Math.round(rect.w) - 2; x += 2) {
        if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
        const [r, g, b] = img.px(x, y);
        sampled++;
        if (Math.max(r, g, b) > 95) figurePx++;
      }
    }
  }
  ok("§C sampled: the Tender's figure reads in his own rect, immediately south of his floor (his bright pixels stand in the frame — the band does not cover him)",
    !!rect && sampled > 20 && figurePx >= 4, JSON.stringify({ figurePx, sampled, rect }));
}

await browser.close();
console.log(`\ndrive-floor-thickness: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
