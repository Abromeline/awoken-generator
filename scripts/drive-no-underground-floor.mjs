// drive-no-underground-floor — A RISING FLOOR'S UNDERGROUND
// PART MUST NEVER SHOW (Nigel, 2026-11-12 — "we should not be
// able to see the tile while its underground"). The emergence
// law (2026-10-26/29): a piece rises true-size, sunk by the
// un-emerged share of its rise, and CLIPPED at its seat, so
// the part still underground is never drawn. A WALL's rise
// clip did exactly that (the half-plane above its edge). A
// FLOOR's rise clip window was the union of TWO paths: the
// footprint AND an "apron" — the whole footprint shifted 18
// land units DOWN — so the sunk face (down by up to 30)
// rendered through the window up to 18 units below the
// floor's seat: the underground part of the tile, drawn over
// the ground in front of it. The apron served nothing: the
// thickness band it claimed to shelter draws only at
// frac >= 1, when no clip applies at all. The fix removes the
// apron path — while frac < 1 the window is the footprint
// ONLY. Proven on the real homeland, in a real browser, by
// reading the clip window out of the DOM:
//   §1 a floor mid-rise at frac ~0.25 / ~0.5 / ~0.75: its
//      clipPath holds EXACTLY ONE path; that path's points
//      are the footprint polygon's own points; the window's
//      southern reach equals the seat's (pre-fix: +18); and
//      the face still rides sunk by (1-frac)*30 inside it —
//      the leak's geometry, windowed out.
//   §2 a FINISHED floor: no clipPath at all, no data-clip,
//      its face stands whole and its thickness band
//      (.floor-slab) draws as Push 73 left it.
//   §3 a WALL mid-rise: unchanged — data-clip "ground", one
//      clip path, every point of it on or ABOVE the wall's
//      ground line (the half-plane), none below.
// Screenshots land in ~/workspace/no-underground-floor-proof/.
// Run after `npm run build`:
//   PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-no-underground-floor.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");
const GEO = await import("../server/dist/buildGeometry.js");
const { piecesOfHex, edgesOf, axialToPlate, centerAddress, hexCenter } = GEO;

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-nounderground-"));
process.env.PORT = "39994";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39994";
const PW = "nounderground-drive-password";
const SHOTS = "/home/hatch/workspace/no-underground-floor-proof";
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

/* ══ THE WORLD: a fresh Tender, their sown land, a Mason ═══ */
const claim = await callOk("claimTender", { password: PW, tenderName: "Underground Tender" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
const token = claim.token;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 3, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', total_exp = 3800, hp = 100").run(ownerKey, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(ownerKey, now);
await callOk("ensureFirstSeed", {}, token);
let land = await callOk("getTerritory", {}, token);
ok("the sown land stands (tiles served)", land.tiles.length >= 19, `${land.tiles.length} tiles`);
const tileAt = (q, r) => land.tiles.find(t => t.q === q && t.r === r && (t.z ?? 0) === 0);
const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;

// The Mason: 3 Stone parts (Rock sum 3) — the cast's lead and
// its whole crew. The rise's pace is the standing law (frac =
// minutes × crew Stone / 36), so a lone Mason raises a piece
// in 12 minutes: backdating a piece's rise clock by 3 / 6 / 9
// minutes stands it at frac ~0.25 / ~0.5 / ~0.75.
const insAsset = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
const masonParts = [["Granite Body", "body", 9, 9, "stone"], ["Granite Arms", "arms", 9, 9, "stone"], ["Granite Crown", "head", 9, 9, "stone"]]
  .map(([n, c, p, t, el]) => {
    const id = Number(insAsset.run(n, c, p, t, el, `underground-mason/${n}.png`, now).lastInsertRowid);
    return { source_id: `db:${id}`, name: n, category: c, rarity: "common", power: p, toughness: t, element: el };
  });
const LEAD = Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES ('Underground Mason', 'Underground Mason', 'underground-mason/mason.png', ?, 'tender', 'Underground Tender', ?, ?)")
  .run(JSON.stringify(masonParts), ownerKey, now).lastInsertRowid);
db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
  VALUES (?, ?, ?, ?, ?, 'defense', 0, 99, ?, ?, NULL, NULL, 0)`).run(ownerKey, LEAD, tileAt(0, 0).id, now, now, 0, 0);
land = await callOk("getTerritory", {}, token);

async function servedPieces() {
  land = await callOk("getTerritory", {}, token);
  return land.buildPieces ?? [];
}
const backdate = (id, minutes) =>
  db.prepare("UPDATE build_pieces SET rise_updated_at = ? WHERE id = ?").run(Date.now() - minutes * 60000, id);
// The living world spends the Tender's energy as it runs — a
// starved rise HOLDS (the standing law), so the purse is
// re-stocked before each moment the drive leans on the rises.
const restock = () =>
  db.prepare("UPDATE tender_resources SET energy = 5000 WHERE owner_key = ?").run(ownerKey);

/* ══ THE PIECES — each on its own far hex ═══════════════════ */
const tenderTile = land.tiles.find(t => t.id === land.tender?.tileId) ?? tileAt(0, 0);
const anchorOf = (tile) => {
  const [fm, fn] = centerAddress(axialToPlate(tile.q, tile.r));
  return { m: Math.round(fm), n: Math.round(fn) };
};
const hexOf = (tile) => piecesOfHex(anchorOf(tile).m, anchorOf(tile).n);
const remoteTiles = [...land.tiles]
  .filter(t => (t.z ?? 0) === 0 && hexDist(t, tenderTile) >= 2)
  .sort((a, b) => hexDist(b, tenderTile) - hexDist(a, tenderTile));
const tryLay = async (kind, verts) => {
  const r = await call("placeBuildPiece", { leadId: LEAD, kind, verts }, token);
  return r.status === 200 && r.body.ok ? r.body.piece : null;
};
const wedgesOf = (tile) => {
  const centre = hexCenter(anchorOf(tile).m, anchorOf(tile).n);
  const atCentre = (v) => Math.abs(v[0] - centre[0]) < 1e-9 && Math.abs(v[1] - centre[1]) < 1e-9;
  return hexOf(tile).filter(p => p.kind === "triangle" && p.verts.some(atCentre));
};
// ISOLATION: the tiling is continuous, so each fixture takes
// a hex three tiles clear of every hex already used.
const usedTiles = [];
const farFromUsed = (t) => usedTiles.every(u => hexDist(t, u) >= 3);
async function layOnFreshHex(kind, pick) {
  for (const t of remoteTiles) {
    if (!farFromUsed(t)) continue;
    for (const cand of pick(t)) {
      const laid = await tryLay(kind, cand.verts ?? cand);
      if (laid) { usedTiles.push(t); return laid; }
    }
  }
  return null;
}
console.log("the pieces are laid");
const triLow = await layOnFreshHex("triangle", (t) => wedgesOf(t));
ok("a triangle floor is laid (to stand at frac ~0.25)", !!triLow, JSON.stringify(triLow && triLow.id));
const sqMid = await layOnFreshHex("square", (t) => hexOf(t).filter(p => p.kind === "square"));
ok("a square floor is laid (to stand at frac ~0.5)", !!sqMid, JSON.stringify(sqMid && sqMid.id));
const triHigh = await layOnFreshHex("triangle", (t) => wedgesOf(t));
ok("a triangle floor is laid (to stand at frac ~0.75)", !!triHigh, JSON.stringify(triHigh && triHigh.id));
const sqDone = await layOnFreshHex("square", (t) => hexOf(t).filter(p => p.kind === "square"));
ok("a square floor is laid (to stand finished)", !!sqDone, JSON.stringify(sqDone && sqDone.id));
// A wall stands on an edge of a floor already laid (the
// foundation law at placeBuildPiece's door) — so the wall
// takes an edge of the mid-rise square's own served record.
let served = await servedPieces();
const servedById0 = (id) => served.find(p => p.id === id);
let wallMid = null;
{
  const sq = sqMid && servedById0(sqMid.id);
  if (sq) {
    for (const e of edgesOf(sq.verts)) {
      wallMid = await tryLay("wall", e);
      if (wallMid) break;
    }
  }
}
ok("a wall is laid on the square's edge (to stand mid-rise)", !!wallMid, JSON.stringify(wallMid && wallMid.id));

/* ── THE RISES: each piece to its stage ──────────────────── */
restock();
if (triLow) backdate(triLow.id, 3);    // frac ~0.25
if (sqMid) backdate(sqMid.id, 6);      // frac ~0.5
if (triHigh) backdate(triHigh.id, 9);  // frac ~0.75
if (sqDone) backdate(sqDone.id, 40);   // frac 1 — finished
if (wallMid) backdate(wallMid.id, 6);  // frac ~0.5
served = await servedPieces();
const servedById = (id) => served.find(p => p.id === id);
const stageOf = (p, lo, hi) => !!p && (p.frac ?? 0) > lo && (p.frac ?? 0) < hi;
ok("the served fracs stand at their stages (0.25 / 0.5 / 0.75 / 1 / wall 0.5)",
  stageOf(servedById(triLow?.id), 0.1, 0.45) && stageOf(servedById(sqMid?.id), 0.35, 0.65) &&
  stageOf(servedById(triHigh?.id), 0.6, 0.9) && (servedById(sqDone?.id)?.frac ?? 0) >= 1 &&
  stageOf(servedById(wallMid?.id), 0.3, 0.7),
  JSON.stringify([triLow, sqMid, triHigh, sqDone, wallMid].map(p => p && [p.id, servedById(p.id)?.frac])));

/* ══ THE BROWSER ════════════════════════════════════════════ */
let browser, page;
async function launchBrowser() {
  browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
  page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror:nounderground]", String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
}
await launchBrowser();
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
try {
  await enterTerritory();
} catch (e) {
  // The sandbox's Chrome can die under the environment (a
  // service restart took one run's browser mid-entry). Relaunch
  // once and enter again before judging anything.
  console.log("  (browser entry failed once —", String(e).slice(0, 90), "— relaunching and retrying)");
  try { await browser.close(); } catch { /* already gone */ }
  await launchBrowser();
  await enterTerritory();
}
await clearOverlays();
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

// Photography: a guessed land basis and a drag from the
// Tender both missed the remote fixture hexes. So: zoom out
// to 0.3 (Push 77's floor — the whole land stands in frame),
// drag the land BY THE PIECE ITSELF to the frame's centre
// (the floors layer takes no pointer events, so the drag
// lands on the ground under it), zoom back in, and shoot the
// piece's own rendered rect. The window assertions below are
// DOM-to-DOM and need no camera at all.
async function pieceRect(pieceId) {
  return page.evaluate((pid) => {
    const g = document.querySelector(`.build-floors g[data-piece="${pid}"]`);
    if (!g) return null;
    const r = g.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, pieceId);
}
const camScale = () => page.evaluate(() => {
  const g = document.querySelector(".land-cam");
  const m = g?.getScreenCTM();
  return m ? m.a : null;
});
async function zoomTo(z) {
  for (let i = 0; i < 8; i++) {
    const s = await camScale();
    if (s === null || Math.abs(s - z) < 0.03) break;
    await page.evaluate((c) => { document.querySelector(`.compass-btn.${c}`)?.click(); }, s > z ? "zoom-out" : "zoom-in");
    await sleep(450);
  }
}
async function centrePiece(pieceId) {
  for (let i = 0; i < 3; i++) {
    const rect = await pieceRect(pieceId);
    if (!rect) return null;
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    if (Math.abs(cx - 700) < 40 && Math.abs(cy - 450) < 40) return rect;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(700, 450, { steps: 20 });
    await page.mouse.up();
    await sleep(700);
  }
  return pieceRect(pieceId);
}
async function shootPiece(piece, name) {
  await zoomTo(0.3);
  await centrePiece(piece.id);
  await zoomTo(0.9);
  const rect = (await centrePiece(piece.id)) ?? (await pieceRect(piece.id));
  await clearOverlays();
  if (!rect) return null;
  const clip = {
    x: Math.max(0, Math.round(rect.x - 140)), y: Math.max(0, Math.round(rect.y - 130)),
    width: Math.round(rect.w + 280), height: Math.round(rect.h + 260),
  };
  await page.screenshot({ path: join(SHOTS, name), clip });
  return clip;
}

// Read one floor's DOM witness: the seat polygon (the
// footprint where the floor will stand, land coords), the
// rise clip window's paths parsed to points, the clipped
// group's transform, and the finished floor's band.
async function floorDom(pieceId) {
  return page.evaluate((pid) => {
    const g = document.querySelector(`.build-floors g[data-piece="${pid}"]`);
    if (!g) return null;
    const parsePts = (s) => (s ?? "").trim().split(/\s+/).filter(Boolean).map(t => {
      const [x, y] = t.split(",").map(Number);
      return { x, y };
    });
    const parseD = (d) => parsePts((d ?? "").replace(/[MLZ]/gi, " "));
    const poly = g.querySelector("polygon");
    const seat = parsePts(poly?.getAttribute("points"));
    const clipEl = g.querySelector("clipPath");
    const clipPaths = clipEl ? [...clipEl.querySelectorAll("path")].map(p => parseD(p.getAttribute("d"))) : [];
    const clippedG = [...g.querySelectorAll("g")].find(x => x.getAttribute("clip-path"));
    const slab = g.querySelector(".floor-slab");
    return {
      frac: Number(g.getAttribute("data-frac")), state: g.getAttribute("data-state"),
      clip: g.getAttribute("data-clip"), sink: Number(g.getAttribute("data-sink") ?? "0"),
      seat, clipPaths,
      clipRef: clippedG?.getAttribute("clip-path") ?? null,
      transform: clippedG?.getAttribute("transform") ?? null,
      hasSlab: !!slab, hasFaceImg: !!g.querySelector("image"),
    };
  }, pieceId);
}
// Points-equal as sets, to a hair (both sides round to 0.1).
const samePoints = (a, b) =>
  a.length === b.length && a.every(p => b.some(q => Math.abs(p.x - q.x) < 0.6 && Math.abs(p.y - q.y) < 0.6));
const maxY = (pts) => Math.max(...pts.map(p => p.y));

// Wait until the fixture floors stand on the map.
async function waitFloor(pid) {
  for (let i = 0; i < 30; i++) {
    const d = await floorDom(pid);
    if (d && d.seat.length >= 3) return d;
    await sleep(1000);
  }
  return null;
}

/* ── §1: the rising floors — the window is the seat ONLY ─── */
console.log("§1 rising floors — one clip path, the footprint itself, nothing below the seat");
for (const [label, piece, lo, hi] of [
  ["frac ~0.25 (triangle)", triLow, 0.1, 0.45],
  ["frac ~0.5 (square)", sqMid, 0.35, 0.65],
  ["frac ~0.75 (triangle)", triHigh, 0.6, 0.9],
]) {
  const d = await waitFloor(piece.id);
  ok(`§1 ${label}: the floor stands on the map, still rising`, !!d && d.frac > lo && d.frac < hi && d.state === "rising",
    d ? `frac=${d.frac} state=${d.state}` : "no group");
  if (!d) continue;
  ok(`§1 ${label}: the group wears the seat clip (data-clip "seat", sink = (1-frac)*30)`,
    d.clip === "seat" && Math.abs(d.sink - (1 - d.frac) * 30) < 1.6,
    `clip=${d.clip} sink=${d.sink} frac=${d.frac}`);
  ok(`§1 ${label}: the clip window holds EXACTLY ONE path (the apron is gone)`,
    d.clipPaths.length === 1, `${d.clipPaths.length} paths`);
  ok(`§1 ${label}: the window's path IS the footprint — same points as the seat polygon`,
    d.clipPaths.length === 1 && samePoints(d.clipPaths[0], d.seat),
    d.clipPaths.length === 1 ? JSON.stringify({ win: d.clipPaths[0], seat: d.seat }) : "no single path");
  ok(`§1 ${label}: the window reaches NO further south than the seat (pre-fix it reached +18)`,
    d.clipPaths.length === 1 && maxY(d.clipPaths[0]) - maxY(d.seat) <= 0.6,
    d.clipPaths.length === 1 ? `reach=${(maxY(d.clipPaths[0]) - maxY(d.seat)).toFixed(1)}` : "no single path");
  const tY = d.transform ? Number((d.transform.match(/translate\(0\s+([\d.]+)\)/) ?? [])[1]) : NaN;
  ok(`§1 ${label}: the face still rides SUNK inside the window by (1-frac)*30 — clipped, not rescaled`,
    d.clipRef === `url(#rise-clip-f${piece.id})` && Math.abs(tY - d.sink) < 1.6,
    `clipRef=${d.clipRef} translateY=${tY} sink=${d.sink}`);
}
await shootPiece(servedById(sqMid.id), "mid-rise-square-frac-half.png");
await shootPiece(servedById(triLow.id), "mid-rise-triangle-frac-quarter.png");

/* ── §2: the finished floor — whole face, band standing ──── */
console.log("§2 the finished floor — no clip at all, face whole, thickness band drawn");
{
  const d = await waitFloor(sqDone.id);
  ok("§2 the finished floor stands on the map at frac 1", !!d && d.frac >= 1 && d.state !== "rising",
    d ? `frac=${d.frac} state=${d.state}` : "no group");
  ok("§2 no clip window and no seat clip on the finished floor",
    !!d && d.clipPaths.length === 0 && d.clip === null && d.clipRef === null,
    d ? `paths=${d.clipPaths.length} clip=${d.clip} ref=${d.clipRef}` : "no group");
  ok("§2 its thickness band (.floor-slab) draws, exactly as Push 73 left it",
    !!d && d.hasSlab, d ? `slab=${d.hasSlab}` : "no group");
  ok("§2 its face stands whole (his art image seated on the footprint)",
    !!d && d.hasFaceImg, d ? `img=${d.hasFaceImg}` : "no group");
  await shootPiece(servedById(sqDone.id), "finished-square-with-band.png");
}

/* ── §3: the rising wall — the half-plane, unchanged ─────── */
console.log("§3 the rising wall — clipped flush at its ground line, as ever");
if (!wallMid) {
  ok("§3 the wall stands on the map, mid-rise", false, "the wall fixture never laid");
  ok("§3 the wall's clip is the ground half-plane: data-clip \"ground\", exactly one path", false, "no wall");
} else {
  const w = await page.evaluate((pid) => {
    const g = document.querySelector(`.build-wall-piece[data-piece="${pid}"]`);
    if (!g) return null;
    const line = g.querySelector("line");
    const clipEl = g.querySelector("clipPath");
    const paths = clipEl ? [...clipEl.querySelectorAll("path")].map(p =>
      (p.getAttribute("d") ?? "").replace(/[MLZ]/gi, " ").trim().split(/\s+/).filter(Boolean).map(t => {
        const [x, y] = t.split(",").map(Number);
        return { x, y };
      })) : [];
    return {
      frac: Number(g.getAttribute("data-frac")), clip: g.getAttribute("data-clip"),
      sink: Number(g.getAttribute("data-sink") ?? "0"),
      A: { x: Number(line?.getAttribute("x1")), y: Number(line?.getAttribute("y1")) },
      B: { x: Number(line?.getAttribute("x2")), y: Number(line?.getAttribute("y2")) },
      paths,
    };
  }, wallMid.id);
  ok("§3 the wall stands on the map, mid-rise", !!w && w.frac > 0.25 && w.frac < 0.75 && w.sink > 0,
    w ? `frac=${w.frac} sink=${w.sink}` : "no group");
  ok("§3 the wall's clip is the ground half-plane: data-clip \"ground\", exactly one path",
    !!w && w.clip === "ground" && w.paths.length === 1,
    w ? `clip=${w.clip} paths=${w.paths.length}` : "no group");
  if (w && w.paths.length === 1) {
    // Below the ground line = the side of AB that holds a
    // point straight under A. No window point may sit there.
    const cross = (P) => (w.B.x - w.A.x) * (P.y - w.A.y) - (w.B.y - w.A.y) * (P.x - w.A.x);
    const len = Math.hypot(w.B.x - w.A.x, w.B.y - w.A.y) || 1;
    const belowSign = Math.sign(cross({ x: w.A.x, y: w.A.y + 10 })) || 1;
    const worst = Math.max(...w.paths[0].map(p => belowSign * cross(p) / len));
    ok("§3 no point of the wall's window lies below its ground line (flush, unchanged)",
      worst <= 0.6, `worst below-line reach=${worst.toFixed(2)} land units`);
  }
}

await browser.close();
console.log(`\ndrive-no-underground-floor: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
