// drive-joined-floors-one-rim — JOINED FLOORS WEAR ONE RIM,
// AND FLOORS PAINT BACK TO FRONT (Nigel, 2026-11-13 — "tiles
// are not lining up correctly, edges that shouldn't be showing
// are and such"). Proven on the real homeland, in a real
// browser, against the client's own DOM:
//   §A a composed hex floor (the six wedges of one hex): NO
//      rim segment runs along any edge two floors share — the
//      join between two floors carries no stroke at all. The
//      drive reckons shared/exterior from the SERVED
//      footprints with the client's own edge-key law.
//   §B the outer rim is COMPLETE: every exterior edge of every
//      floor wears exactly one rim segment — a lone square
//      keeps all four of its edges, each wedge of the hex its
//      one outer edge; segments per piece == exterior edges
//      per piece, no more, no less. The footprint polygon
//      itself carries no stroke any more (fill alone).
//   §C the colour law stands for the edges that remain: a
//      protected piece's rim segments stroke the bright gold
//      #e8c766; an unprotected piece's stroke #97753f — read
//      segment by segment against the served protected flag.
//      BOTH arms are exercised: the fixture first lifts the
//      curse off the whole sown land (protection derives only
//      when EVERY hex beneath a footprint is the Tender's own
//      and clean — a wedge's corners touch its neighbours), so
//      every piece stands protected and gold; then, late in
//      the run, the tile beneath the lone square is cursed
//      again in the DB and the square's rim is watched turning
//      umber in the live DOM.
//   §D paint order: three floors on three hexes in one
//      north–south column, LAID SOUTH FIRST (placement order
//      the reverse of the ground's order), stand in the
//      document NORTH, MIDDLE, SOUTH — the floors paint back
//      to front in the ground's own dressing order, never in
//      placement order.
// SHOTS_DIR picks where the photographs land, so a before run
// (the unmodified base tree) and an after run file side by
// side. On the before tree §A–§D fail by construction (the
// polygon itself is stroked; the groups stand in placement
// order) — the photographs are the point of that run.
// Run after `npm run build`:
//   PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-joined-floors-one-rim.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import sharp from "sharp";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");
const GEO = await import("../server/dist/buildGeometry.js");
const { piecesOfHex, axialToPlate } = GEO;

mkdirSync("/home/hatch/workspace/big-tmp", { recursive: true });
process.env.DATA_DIR = mkdtempSync(join("/home/hatch/workspace/big-tmp", "awoken-drive-joinedrim-"));
process.env.PORT = "39993";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39993";
const PW = "joinedrim-drive-password";
const SHOTS = process.env.SHOTS_DIR || "/home/hatch/workspace/joined-floors-proof/after";
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
  // The sandbox loopback intermittently resets a connection
  // mid-read (ECONNRESET, control-proven environmental). The
  // actions driven through callOk are reads / idempotent
  // ensures, so a thrown fetch is retried before it is believed.
  let lastErr = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const r = await call(action, args, token);
      if (r.status === 200) return r.body;
      const msg = `${action} -> ${r.status}: ${JSON.stringify(r.raw).slice(0, 200)}`;
      // A 500 carrying a disk I/O complaint is the sandbox's
      // storage layer stalling mid-settle (SQLITE_IOERR_WRITE,
      // observed repeatedly in this environment), not the
      // action's verdict: wait and read again.
      if (r.status >= 500 && /disk I\/O|SQLITE_IOERR|readonly database/i.test(JSON.stringify(r.raw))) {
        lastErr = new Error(msg);
        await sleep(6000);
        continue;
      }
      throw new Error(msg);
    } catch (e) {
      lastErr = e;
      if (!/fetch failed|ECONNRESET/i.test(String(e && e.message || e))) throw e;
      await sleep(900);
    }
  }
  throw lastErr;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up, as the other drives do */ }
const now = Date.now();

/* ══ THE WORLD: a fresh Tender and their sown land ══════════ */
const claim = await callOk("claimTender", { password: PW, tenderName: "Rim Tender" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
const token = claim.token;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 3, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', total_exp = 3800, hp = 100").run(ownerKey, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 900, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 900").run(ownerKey, now);
await callOk("ensureFirstSeed", {}, token);
let land = await callOk("getTerritory", {}, token);
const tileAt = (q, r) => land.tiles.find(t => t.q === q && t.r === r);
ok("the sown land stands (tiles served)", land.tiles.length >= 19, `${land.tiles.length} tiles`);
// THE FIXTURE'S GROUND: the curse lifted off the whole sown
// land, in the DB — the drives' own licence, the same hand
// that finishes rises. Without it no floor in a fresh land is
// "protected" (every footprint touches a cursed neighbour),
// and §C's gold arm could never stand in the scene.
{
  // The land GROWS between reads (frontier minting): a fresh
  // Tender's first read serves only part of the homeland, and
  // the next read mints the rest — still cursed (a first drive
  // run un-cursed only the first read's tiles and found 240
  // still cursed on the second). This DB is the drive's own
  // fresh world — only this Tender's land exists in it — so
  // uncurse the WHOLE table, re-read, and repeat until a read
  // mints nothing new and serves every tile uncursed (the
  // growth completes within a read or two: the full homeland
  // is ~271 tiles). A final whole-table uncurse catches any
  // tile the last read minted at the far frontier — beyond
  // every floor's neighbourhood, so no derivation in this
  // drive can see it cursed — and the assertion is judged on
  // the DB itself, the fixture's ground truth.
  for (let i = 0; i < 6; i++) {
    db.prepare("UPDATE territory_tiles SET cursed = 0").run();
    const before = land.tiles.length;
    land = await callOk("getTerritory", {}, token);
    if (land.tiles.length === before && land.tiles.every(t => !t.cursed)) break;
  }
  db.prepare("UPDATE territory_tiles SET cursed = 0").run();
}
ok("the sown land stands cleansed for the fixture (every tile uncursed)",
  db.prepare("SELECT COUNT(*) AS c FROM territory_tiles WHERE cursed = 1").get().c === 0,
  `${db.prepare("SELECT COUNT(*) AS c FROM territory_tiles WHERE cursed = 1").get().c} still cursed in the DB`);
const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;

const LEAD = (() => {
  const insA = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
  const parts = [["Mason Body", "body", 3, 3], ["Mason Arms", "arms", 3, 3], ["Mason Crown", "head", 3, 3]]
    .map(([n, c, p, t]) => ({ id: Number(insA.run(n, c, p, t, "stone", `joinedrim-mason/${n}.png`, now).lastInsertRowid), name: n, category: c, power: p, toughness: t, element: "stone" }));
  const composition = JSON.stringify(parts.map((p, i) => ({ source_id: `db:${p.id}`, name: p.name, category: parts[i].category, power: p.power, toughness: p.toughness, element: p.element })));
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES ('Build Mason', 'Build Mason', 'joinedrim-mason/mason.png', ?, 'tender', 'Rim Tender', ?, ?)").run(composition, ownerKey, now).lastInsertRowid);
})();
const tenderTile = land.tiles.find(t => t.id === land.tender?.tileId) ?? tileAt(0, 0);
db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
  VALUES (?, ?, ?, ?, ?, 'defense', 0, 99, ?, ?, NULL, NULL, 0)`).run(ownerKey, LEAD, tenderTile.id, now, now, tenderTile.q, tenderTile.r);

async function servedPieces() {
  land = await callOk("getTerritory", {}, token);
  return land.buildPieces ?? [];
}
async function finishRises() {
  db.prepare("UPDATE build_pieces SET rise_updated_at = ? WHERE owner_key = ?").run(Date.now() - 30 * 60000, ownerKey);
  return servedPieces();
}

/* ══ THE PIECES ══════════════════════════════════════════════ */
const anchorOf = (tile) => {
  const ap = axialToPlate(tile.q, tile.r);
  const [fm, fn] = GEO.centerAddress(ap);
  return { m: Math.round(fm), n: Math.round(fn) };
};
const hexOf = (tile) => piecesOfHex(anchorOf(tile).m, anchorOf(tile).n);
const centreOf = (tile) => GEO.hexCenter(anchorOf(tile).m, anchorOf(tile).n);
const centreWedgesOf = (tile) => {
  const centre = centreOf(tile);
  const atCentre = (v) => Math.abs(v[0] - centre[0]) < 1e-9 && Math.abs(v[1] - centre[1]) < 1e-9;
  return hexOf(tile).filter(p => p.kind === "triangle" && p.verts.some(atCentre));
};
async function layOneWedge(tile) {
  for (const p of centreWedgesOf(tile)) {
    const r = await call("placeBuildPiece", { leadId: LEAD, kind: "triangle", verts: p.verts }, token);
    if (r.status === 200 && r.body.ok) return r.body.piece;
  }
  return null;
}
async function layHexFloor(tile) {
  const placed = [];
  for (const p of centreWedgesOf(tile)) {
    const r = await call("placeBuildPiece", { leadId: LEAD, kind: "triangle", verts: p.verts }, token);
    if (r.status === 200 && r.body.ok) placed.push(r.body.piece);
    else console.log("  [skip wedge]", JSON.stringify(r.raw).slice(0, 120));
  }
  return placed;
}

/* ── §D FIRST: the north–south column, laid south first ───── */
console.log("§D the column is chosen and laid (south, north, middle)");
let colTiles = null;
outerCol:
for (let q = -3; q <= 3 && !colTiles; q++) {
  for (let r = -3; r <= 1; r++) {
    const t0 = tileAt(q, r), t1 = tileAt(q, r + 1), t2 = tileAt(q, r + 2);
    if (!t0 || !t1 || !t2) continue;
    if ([t0, t1, t2].some(t => t.cursed)) continue;
    if ([t0, t1, t2].some(t => t.id === tenderTile.id)) continue;
    colTiles = [t0, t1, t2]; // north, middle, south
    break outerCol;
  }
}
ok("§D a column of three uncursed hexes stands (north, middle, south)", !!colTiles,
  colTiles ? JSON.stringify(colTiles.map(t => [t.q, t.r])) : "no column found");
let dNorth = null, dMid = null, dSouth = null;
if (colTiles) {
  dSouth = await layOneWedge(colTiles[2]);
  dNorth = await layOneWedge(colTiles[0]);
  dMid = await layOneWedge(colTiles[1]);
}
ok("§D one floor stands on each hex of the column (laid south, north, middle)",
  !!(dNorth && dMid && dSouth), JSON.stringify({ n: dNorth?.id, m: dMid?.id, s: dSouth?.id }));
const dIds = new Set([dNorth?.id, dMid?.id, dSouth?.id].filter(Boolean));
const colTileIds = new Set((colTiles ?? []).map(t => t.id));

/* ── §A/§C: the composed hex + the Tender's own hex floor ──── */
console.log("§A/§C the composed hexes are laid");
const remoteTiles = [...land.tiles]
  .filter(t => hexDist(t, tenderTile) >= 2 && !colTileIds.has(t.id))
  .sort((a, b) => hexDist(b, tenderTile) - hexDist(a, tenderTile));
let tileB = null, hexB = [];
for (const t of remoteTiles) {
  const placed = await layHexFloor(t);
  if (placed.length === 6) { tileB = t; hexB = placed; break; }
}
ok("§A a full six-wedge hex floor was found and laid", !!tileB, JSON.stringify(hexB.map(p => p.id)));
const hexC = await layHexFloor(tenderTile);
ok("§C the Tender's own hex floor is laid (protected ground)", hexC.length >= 6, `${hexC.length} wedges`);

/* ── §B: the lone square on open land ───────────────────────── */
let laySq = null;
outerSq:
for (const t of remoteTiles) {
  if (tileB && t.id === tileB.id) continue;
  for (const p of hexOf(t)) {
    if (p.kind !== "square") continue;
    const r = await call("placeBuildPiece", { leadId: LEAD, kind: "square", verts: p.verts }, token);
    if (r.status === 200 && r.body.ok) { laySq = r.body; break outerSq; }
  }
}
ok("§B a lone square foundation is laid on open land", !!laySq && laySq.piece?.kind === "square",
  JSON.stringify(laySq && laySq.piece.id));

await finishRises();
let servedAll = await servedPieces();
ok("every laid floor stands finished (frac 1) for the photographs",
  servedAll.filter(p => p.kind === "triangle" || p.kind === "square").every(p => (p.frac ?? 1) >= 1),
  JSON.stringify(servedAll.map(p => [p.kind, p.frac])));

/* ══ THE DRIVE'S OWN EDGE RECKONING (the client's law) ═══════ */
// An edge's key: its two footprint ends, rounded to the
// thousandth, order-free — exactly the client's formula. An
// edge with two users is SHARED (interior); one user, EXTERIOR.
const edgeKeyOfFp = (a, b) => [a, b].map(v => `${Math.round(v[0] * 1000)},${Math.round(v[1] * 1000)}`).sort().join("|");
const edgeUsers = new Map();
for (const fp of servedAll.filter(p => p.kind === "triangle" || p.kind === "square")) {
  const n = fp.footprint.length;
  for (let i = 0; i < n; i++) {
    const key = edgeKeyOfFp(fp.footprint[i], fp.footprint[(i + 1) % n]);
    edgeUsers.set(key, (edgeUsers.get(key) ?? 0) + 1);
  }
}
const landOfAxial = (q, r) => { const k = 54 / 796; return { x: 250 + q * 1292 * k, y: 170 + q * 470 * k + r * 948 * k }; };
const landOfFp = (fp) => landOfAxial(fp[0], fp[1]);
const edgesOfPiece = (piece) => {
  const n = piece.footprint.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = piece.footprint[i], b = piece.footprint[(i + 1) % n];
    out.push({ A: landOfFp(a), B: landOfFp(b), shared: (edgeUsers.get(edgeKeyOfFp(a, b)) ?? 0) > 1 });
  }
  return out;
};
const segMatchesEdge = (seg, e) => {
  const d = (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2);
  const tol = 2.0;
  return (d(seg.x1, seg.y1, e.A.x, e.A.y) < tol && d(seg.x2, seg.y2, e.B.x, e.B.y) < tol)
      || (d(seg.x1, seg.y1, e.B.x, e.B.y) < tol && d(seg.x2, seg.y2, e.A.x, e.A.y) < tol);
};

/* ══ THE BROWSER ═════════════════════════════════════════════ */
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:joinedrim]", String(e).slice(0, 200)));
await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
async function enterTerritory() {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  // The server rides in this same process, and the sandbox's
  // storage layer can stall its reads for minutes at a time
  // (btrfs writeback waits, control-proven environmental):
  // the waits below are sized for that weather, not for the
  // client's own speed.
  const door = await page.waitForSelector(".deck-button", { timeout: 120000 }).catch(() => null);
  if (!door) throw new Error("territory: no .deck-button on the home face");
  await door.click();
  await page.waitForFunction(() => !!window.__tenderJump && !!window.__tenderJump.pos(), { timeout: 180000 });
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
  console.log("  [enterTerritory retry after]", String(e).slice(0, 120));
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
await sleep(1500);

const camMatrix = () => page.evaluate(() => {
  const g = document.querySelector(".land-cam");
  const m = g.getScreenCTM();
  return { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f };
});
const toClient = async (lx, ly) => {
  const m = await camMatrix();
  return { x: m.a * lx + m.c * ly + m.e, y: m.b * lx + m.d * ly + m.f };
};
async function panLandTo(clientPt, tx = 700, ty = 450) {
  const grab = await page.evaluate(() => window.__tenderJump.pos());
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + (tx - clientPt.x), grab.y + (ty - clientPt.y), { steps: 24 });
  await page.mouse.up();
  await sleep(700);
}
// One piece's rim segments off the real map, in LAND coords.
async function rimOf(pieceId) {
  return page.evaluate((pid) => {
    const g = document.querySelector(`.build-floors g[data-piece="${pid}"]`);
    if (!g) return null;
    const segs = [...g.querySelectorAll("line.floor-rim")].map((el) => ({
      x1: parseFloat(el.getAttribute("x1")), y1: parseFloat(el.getAttribute("y1")),
      x2: parseFloat(el.getAttribute("x2")), y2: parseFloat(el.getAttribute("y2")),
      stroke: el.getAttribute("stroke"),
    }));
    const poly = g.querySelector("polygon");
    return { segs, polyStroke: poly ? poly.getAttribute("stroke") : null, frac: g.getAttribute("data-frac") };
  }, pieceId);
}
async function shotAt(landPt, name, w = 520, h = 440) {
  const pre = await toClient(landPt.x, landPt.y);
  await panLandTo(pre);
  const c = await toClient(landPt.x, landPt.y);
  const clip = { x: Math.max(0, Math.round(c.x - w / 2)), y: Math.max(0, Math.round(c.y - h / 2)), width: w, height: h };
  await page.screenshot({ path: join(SHOTS, name), clip });
}
const centreLandOf = (pieceIds) => {
  const pieces = servedAll.filter(p => pieceIds.has(p.id));
  const verts = pieces.flatMap(p => p.footprint.map(landOfFp));
  return {
    x: verts.reduce((s, v) => s + v.x, 0) / verts.length,
    y: verts.reduce((s, v) => s + v.y, 0) / verts.length,
  };
};

/* ── §A NO STROKE ON A SHARED EDGE; §B THE OUTER RIM WHOLE ── */
console.log("§A/§B the composed hex — joins bare, the outside rim complete");
const judgedIds = new Set([...hexB.map(p => p.id), ...hexC.map(p => p.id), ...(laySq ? [laySq.piece.id] : [])]);
let sharedStroked = 0, sharedEdges = 0, exteriorMissing = 0, segCountBad = [], polyStroked = 0, groupsMissing = 0;
for (const id of judgedIds) {
  const piece = servedAll.find(p => p.id === id);
  const rim = await rimOf(id);
  if (!rim) { groupsMissing++; continue; }
  if (rim.polyStroke && rim.polyStroke !== "none") polyStroked++;
  const edges = edgesOfPiece(piece);
  const exterior = edges.filter(e => !e.shared);
  for (const e of edges) {
    if (e.shared) {
      sharedEdges++;
      if (rim.segs.some(s => segMatchesEdge(s, e))) sharedStroked++;
    } else if (!rim.segs.some(s => segMatchesEdge(s, e))) exteriorMissing++;
  }
  if (rim.segs.length !== exterior.length) segCountBad.push([id, rim.segs.length, exterior.length]);
}
ok("§A every judged floor group stands on the map", groupsMissing === 0, `${groupsMissing} missing`);
ok("§A no rim segment runs along any shared edge (the join between two floors carries no stroke)",
  sharedEdges > 0 && sharedStroked === 0, JSON.stringify({ sharedEdges, sharedStroked }));
ok("§B every exterior edge wears a rim segment (the outer rim is complete)",
  exteriorMissing === 0, `${exteriorMissing} exterior edges bare`);
ok("§B rim segments per piece == exterior edges per piece (no extras, no duplicates)",
  segCountBad.length === 0, JSON.stringify(segCountBad));
ok("§B the footprint polygon itself carries no stroke any more (fill alone)",
  polyStroked === 0, `${polyStroked} polygons still stroked`);
if (tileB) await shotAt(centreLandOf(new Set(hexB.map(p => p.id))), "joined-hex.png");
if (laySq) {
  const sq = servedAll.find(p => p.id === laySq.piece.id);
  await shotAt(centreLandOf(new Set([sq.id])), "lone-square.png", 480, 420);
}

/* ── §C THE COLOUR LAW ON THE EDGES THAT REMAIN ─────────────── */
console.log("§C protected gold, unprotected umber — segment by segment");
let lawBad = [], goldSegs = 0, umberSegs = 0;
for (const id of judgedIds) {
  const piece = servedAll.find(p => p.id === id);
  const rim = await rimOf(id);
  if (!rim) continue;
  const want = piece.protected ? "#e8c766" : "#97753f";
  for (const s of rim.segs) {
    if (s.stroke !== want) lawBad.push([id, s.stroke, want]);
    if (s.stroke === "#e8c766") goldSegs++; else if (s.stroke === "#97753f") umberSegs++;
  }
}
ok("§C every rim segment wears its piece's colour (protected #e8c766 / unprotected #97753f)",
  lawBad.length === 0, JSON.stringify(lawBad.slice(0, 4)));
ok("§C protected pieces stand in the scene wearing the bright gold on their outer edges",
  goldSegs > 0, JSON.stringify({ goldSegs, umberSegs }));

/* ── §D PAINT ORDER: BACK TO FRONT, NOT PLACEMENT ORDER ─────── */
console.log("§D the column's floors stand in the document north, middle, south");
if (dNorth && dMid && dSouth) {
  const servedOrder = servedAll.map(p => p.id).filter(id => dIds.has(id));
  console.log("  [served order of the column's floors]", JSON.stringify(servedOrder),
    "(laid: south", dSouth.id, "· north", dNorth.id, "· middle", dMid.id + ")");
  const domOrder = await page.evaluate((ids) => {
    const groups = [...document.querySelectorAll(".build-floors > g[data-piece]")];
    return ids.map(id => groups.findIndex(g => g.getAttribute("data-piece") === String(id)));
  }, [dNorth.id, dMid.id, dSouth.id]);
  ok("§D the three floors stand in the document in ground order (north < middle < south), though they were laid south first",
    domOrder.every(i => i >= 0) && domOrder[0] < domOrder[1] && domOrder[1] < domOrder[2],
    JSON.stringify(domOrder));
  // The whole layer, not just the column: every floor group in
  // the document must stand no earlier than any floor whose
  // ground stands further north — judged by each group's own
  // footprint heart against the document sequence.
  const allOrder = await page.evaluate(() => {
    return [...document.querySelectorAll(".build-floors > g[data-piece]")]
      .map(g => g.getAttribute("data-piece"));
  });
  const heartY = (piece) => {
    const vs = piece.footprint.map(landOfFp);
    return vs.reduce((s, v) => s + v.y, 0) / vs.length;
  };
  let inversions = 0;
  const seq = allOrder.map(id => servedAll.find(p => p.id === Number(id))).filter(Boolean);
  for (let i = 0; i + 1 < seq.length; i++) {
    // A later group whose heart stands clearly NORTH of an
    // earlier group's heart (beyond one hex's own depth, so
    // the wedges of one hex may dress among themselves) is an
    // inversion of the ground's order.
    if (heartY(seq[i + 1]) < heartY(seq[i]) - 100) inversions++;
  }
  ok("§D the whole floors layer dresses back to front (no floor stands a full hex-depth out of order)",
    inversions === 0, `${inversions} inversions`);
  await shotAt(centreLandOf(dIds), "ns-stack.png", 560, 640);
}

/* ── §C SECOND ARM: the square's ground cursed again ───────── */
console.log("§C second arm — the lone square's tile cursed in the DB; its rim must turn umber");
if (laySq) {
  const sqId = laySq.piece.id;
  const sqServed = () => servedAll.find(p => p.id === sqId);
  // The tile beneath the square's heart, by the drive's own
  // axial rounding of the served footprint.
  const fp = sqServed().footprint;
  const hq = fp.reduce((s, v) => s + v[0], 0) / fp.length;
  const hr = fp.reduce((s, v) => s + v[1], 0) / fp.length;
  const axialRound = (q, r) => {
    const y = -q - r;
    let rq = Math.round(q), ry = Math.round(y), rr = Math.round(r);
    const dq = Math.abs(rq - q), dy = Math.abs(ry - y), dr = Math.abs(rr - r);
    if (dq > dy && dq > dr) rq = -ry - rr; else if (dy > dr) ry = -rq - rr; else rr = -rq - ry;
    return { q: rq, r: rr };
  };
  const h = axialRound(hq, hr);
  const sqTile = tileAt(h.q, h.r);
  ok("§C the square's standing tile is found for the re-curse", !!sqTile, JSON.stringify(h));
  if (sqTile) {
    db.prepare("UPDATE territory_tiles SET cursed = 1 WHERE id = ?").run(sqTile.id);
    servedAll = await servedPieces();
    if (sqServed().protected) {
      // The footprint may touch further hexes: curse the ring
      // around the heart tile too, then read once more.
      const ring = land.tiles.filter(t => hexDist(t, sqTile) <= 1).map(t => t.id);
      db.prepare(`UPDATE territory_tiles SET cursed = 1 WHERE id IN (${ring.join(",")})`).run();
      servedAll = await servedPieces();
    }
    ok("§C the server now reads the square unprotected (a cursed hex beneath it)",
      sqServed().protected === false, JSON.stringify({ protected: sqServed().protected }));
    // The client's read loop carries the new derivation onto
    // the map: watch the square's rim segments turn umber.
    let turned = null;
    for (let i = 0; i < 16 && !turned; i++) {
      const rim = await rimOf(sqId);
      if (rim && rim.segs.length > 0 && rim.segs.every(s => s.stroke === "#97753f")) turned = rim;
      else await sleep(1000);
    }
    ok("§C the square's rim turns umber in the live DOM once its ground is cursed (the colour follows the derivation, not the placement)",
      !!turned, turned ? "" : "rim still gold after 16s");
  }
}

await browser.close();
console.log(`\ndrive-joined-floors-one-rim: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
