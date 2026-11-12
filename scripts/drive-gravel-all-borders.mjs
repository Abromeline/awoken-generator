// drive-gravel-all-borders — THE GRAVEL AT EVERY VISIBLE
// BORDER (Nigel, 2026-11-12 — "i want the gravel effect to
// render at all boarders of the piece that are visible
// following that boarder"). Until now a rising FLOOR churned
// only along its southern edge; its other exposed edges rose
// bare. Now the churn runs along EVERY exposed border of the
// footprint, following each border — an edge no sibling floor
// stands across (the thickness band's own reckoning: a shared
// edge is interior; an edge a WALL stands on stays exposed).
// Proven on the real homeland, in a real browser:
//   §1 a LONE TRIANGLE floor, mid-rise: three churns, one on
//      each of its three borders.
//   §2 a LONE SQUARE floor, mid-rise: four churns, one on
//      each of its four borders.
//   §3 two JOINED wedges (they share a spoke edge): two
//      churns each, on their exposed borders — and NO churn
//      seated on the shared edge, on either piece.
//   §4 a WALL on the square's own edge: the wall carries
//      exactly ONE churn (unchanged), and the square still
//      churns on all four borders (a wall does not make an
//      edge interior).
//   §5 THE WHOLE LAND SWEEP: every floor served satisfies
//      churn-count == its exposed-edge count, every churn
//      seat lies on one of the piece's own footprint borders,
//      and no seat lies on a shared edge.
//   §6 THE CHURN STILL LIVES BY THE PIECE'S MOTION: while
//      the pieces move, their churns run (data-moving, gravel
//      in the air); once they stand, every churn rests —
//      mound and six cracks standing, no gravel thrown.
// Seats are read off the DOM: each churn carries data-seat
// (its seam's ends, land coords) and each floor's polygon
// carries its footprint's borders in the same coords, in
// stored order — footprint edge i IS polygon edge i.
// Screenshots land in ~/workspace/gravel-borders-proof/.
// Run after `npm run build`:
//   PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-gravel-all-borders.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");
const GEO = await import("../server/dist/buildGeometry.js");
const { piecesOfHex, edgesOf, axialToPlate, centerAddress, hexCenter } = GEO;

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-gravelborders-"));
process.env.PORT = "39993";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39993";
const PW = "gravelborders-drive-password";
const SHOTS = "/home/hatch/workspace/gravel-borders-proof";
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
const claim = await callOk("claimTender", { password: PW, tenderName: "Gravel Tender" });
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
// in 12 minutes; backdating a piece's rise clock by 6 minutes
// stands it at frac 0.5.
const insAsset = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
const masonParts = [["Granite Body", "body", 9, 9, "stone"], ["Granite Arms", "arms", 9, 9, "stone"], ["Granite Crown", "head", 9, 9, "stone"]]
  .map(([n, c, p, t, el]) => {
    const id = Number(insAsset.run(n, c, p, t, el, `gravel-mason/${n}.png`, now).lastInsertRowid);
    return { source_id: `db:${id}`, name: n, category: c, rarity: "common", power: p, toughness: t, element: el };
  });
const LEAD = Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES ('Gravel Mason', 'Gravel Mason', 'gravel-mason/mason.png', ?, 'tender', 'Gravel Tender', ?, ?)")
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
// The living world spends the Tender's energy as it runs (the
// war, the seed) — a fresh purse stocked at claim time can be
// gone by the time the rises are judged, and a starved rise
// HOLDS (the standing law). So the purse is re-stocked right
// before each moment the drive leans on the rises advancing.
const restock = () =>
  db.prepare("UPDATE tender_resources SET energy = 5000 WHERE owner_key = ?").run(ownerKey);

/* ══ THE PIECES ═════════════════════════════════════════════ */
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

console.log("the pieces are laid");
// ISOLATION: the tiling is continuous — pieces of one
// construction hex share edges with that hex's other pieces
// (a wedge's outer edge is its hex's square's inner edge),
// and a failed pair attempt can leave a stray wedge standing.
// So each fixture takes a hex far from every hex already used
// (three tiles clear), and any hex a piece lands on is marked
// used at once, strays included.
const usedTiles = [];
const farFromUsed = (t) => usedTiles.every(u => hexDist(t, u) >= 3);
// §1 — a lone wedge on its own remote hex.
let triPiece = null;
for (const t of remoteTiles) {
  if (!farFromUsed(t)) continue;
  for (const w of wedgesOf(t)) {
    triPiece = await tryLay("triangle", w.verts);
    if (triPiece) { usedTiles.push(t); break; }
  }
  if (triPiece) break;
}
ok("§1 a lone triangle floor is laid", !!triPiece, JSON.stringify(triPiece && triPiece.id));
// §2 — a lone square on a far, unused hex.
let sqCand = null, sqPiece = null;
outer2:
for (const t of remoteTiles) {
  if (!farFromUsed(t)) continue;
  for (const p of hexOf(t)) {
    if (p.kind !== "square") continue;
    const laid = await tryLay("square", p.verts);
    if (laid) { sqCand = p; sqPiece = laid; usedTiles.push(t); break outer2; }
  }
}
ok("§2 a lone square floor is laid", !!sqPiece, JSON.stringify(sqPiece && sqPiece.id));
// §3 — two adjacent wedges of one hex: wedge k and wedge k+1
// share the spoke edge from the hex's heart to corner k+1.
let pairA = null, pairB = null;
outer3:
for (const t of remoteTiles) {
  if (!farFromUsed(t)) continue;
  const ws = wedgesOf(t);
  if (ws.length !== 6) continue;
  for (let k = 0; k < 6; k++) {
    const a = await tryLay("triangle", ws[k].verts);
    if (!a) continue;
    usedTiles.push(t); // a stray may stand here now — quarantine the hex
    const b = await tryLay("triangle", ws[(k + 1) % 6].verts);
    if (b) { pairA = a; pairB = b; break outer3; }
  }
}
ok("§3 two joined wedges are laid on one hex", !!pairA && !!pairB,
  JSON.stringify([pairA && pairA.id, pairB && pairB.id]));

// THE DRIVE'S OWN EXPOSURE RECKONING — the client's law
// restated from the served record: an undirected edge key over
// every floor's footprint; an edge used by two floors is
// interior, an edge used by one is exposed.
const edgeKey = (a, b) => [a, b].map(v => `${Math.round(v[0] * 1000)},${Math.round(v[1] * 1000)}`).sort().join("|");
function exposureOf(pieces) {
  const floors = pieces.filter(p => p.kind === "triangle" || p.kind === "square");
  const users = new Map();
  for (const p of floors) {
    const n = p.footprint.length;
    for (let i = 0; i < n; i++) {
      const k = edgeKey(p.footprint[i], p.footprint[(i + 1) % n]);
      users.set(k, (users.get(k) ?? 0) + 1);
    }
  }
  const per = new Map();
  for (const p of floors) {
    const n = p.footprint.length;
    const exposed = [], shared = [];
    for (let i = 0; i < n; i++) {
      const k = edgeKey(p.footprint[i], p.footprint[(i + 1) % n]);
      (users.get(k) > 1 ? shared : exposed).push(i);
    }
    per.set(p.id, { exposed, shared });
  }
  return per;
}
let served = await servedPieces();
let exposure = exposureOf(served);
const servedById = (id) => served.find(p => p.id === id);
ok("§1 the lone triangle shares no edge with any floor (3 exposed borders)",
  !!triPiece && exposure.get(triPiece.id)?.exposed.length === 3,
  JSON.stringify(triPiece && exposure.get(triPiece.id)));
ok("§2 the lone square shares no edge with any floor (4 exposed borders)",
  !!sqPiece && exposure.get(sqPiece.id)?.exposed.length === 4,
  JSON.stringify(sqPiece && exposure.get(sqPiece.id)));
ok("§3 the joined wedges share exactly one edge (2 exposed borders each)",
  !!pairA && !!pairB &&
  exposure.get(pairA.id)?.shared.length === 1 && exposure.get(pairA.id)?.exposed.length === 2 &&
  exposure.get(pairB.id)?.shared.length === 1 && exposure.get(pairB.id)?.exposed.length === 2,
  JSON.stringify([pairA && exposure.get(pairA.id), pairB && exposure.get(pairB.id)]));

/* ── THE RISE: every floor to mid-rise (frac ≈ 0.5) ──────── */
restock();
for (const p of served.filter(p => p.kind === "triangle" || p.kind === "square")) backdate(p.id, 6);
served = await servedPieces();
const midFracs = served.filter(p => p.kind === "triangle" || p.kind === "square").map(p => p.frac ?? 0);
ok("the floors stand mid-rise (served frac in 0.3..0.7, state rising)",
  midFracs.length >= 4 && midFracs.every(f => f > 0.3 && f < 0.7) &&
  served.filter(p => p.kind === "triangle" || p.kind === "square").every(p => p.state === "rising"),
  JSON.stringify(midFracs));

/* ══ THE BROWSER ════════════════════════════════════════════ */
let browser, page;
async function launchBrowser() {
  browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
  page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror:gravelborders]", String(e).slice(0, 200)));
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

// The map's camera + the land basis (the same iso basis every
// drive uses) — for panning and photographs only; the seat
// assertions below are DOM-to-DOM and need no basis at all.
const camMatrix = () => page.evaluate(() => {
  const g = document.querySelector(".land-cam");
  const m = g.getScreenCTM();
  return { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f };
});
const landOfAxial = (q, r) => { const k = 54 / 796; return { x: 250 + q * 1292 * k, y: 170 + q * 470 * k + r * 948 * k }; };
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
async function shootPiece(piece, name) {
  const fp = piece.footprint.map(([q, r]) => landOfAxial(q, r));
  const csPre = await Promise.all(fp.map(v => toClient(v.x, v.y)));
  const cxPre = csPre.reduce((s, v) => s + v.x, 0) / csPre.length, cyPre = csPre.reduce((s, v) => s + v.y, 0) / csPre.length;
  await panLandTo({ x: cxPre, y: cyPre });
  const cs = await Promise.all(fp.map(v => toClient(v.x, v.y)));
  const xs = cs.map(v => v.x), ys = cs.map(v => v.y);
  const clip = {
    x: Math.max(0, Math.round(Math.min(...xs) - 130)), y: Math.max(0, Math.round(Math.min(...ys) - 120)),
    width: Math.round(Math.max(...xs) - Math.min(...xs) + 260), height: Math.round(Math.max(...ys) - Math.min(...ys) + 240),
  };
  await page.screenshot({ path: join(SHOTS, name), clip });
  return clip;
}

// Read one floor's DOM witness: its polygon borders (land
// coords, stored order) and every churn seated in its group
// (seat ends, motion state, gravel in the air, cracks, mound).
async function floorDom(pieceId) {
  return page.evaluate((pid) => {
    const g = document.querySelector(`.build-floors g[data-piece="${pid}"]`);
    if (!g) return null;
    const poly = g.querySelector("polygon");
    const verts = (poly?.getAttribute("points") ?? "").trim().split(/\s+/).map(s => {
      const [x, y] = s.split(",").map(Number);
      return { x, y };
    });
    const churns = [...g.querySelectorAll(".rise-churn")].map(c => {
      const seat = (c.getAttribute("data-seat") ?? "").split(",").map(Number);
      return {
        for: c.getAttribute("data-for"),
        seat: seat.length === 4 ? { ax: seat[0], ay: seat[1], bx: seat[2], by: seat[3] } : null,
        moving: c.getAttribute("data-moving"),
        stonesAttr: Number(c.getAttribute("data-stones")),
        stoneEls: c.querySelectorAll(".rise-stone").length,
        cracks: c.querySelectorAll(".rise-crack").length,
        mound: !!c.querySelector(".rise-mound"),
      };
    });
    return { frac: g.getAttribute("data-frac"), state: g.getAttribute("data-state"), verts, churns };
  }, pieceId);
}
// Which polygon edges (by index) carry a churn seat? A seat
// matches an edge when its ends are the edge's ends, in either
// order, to a hair (both sides round to 0.1 land units).
function seatEdges(dom) {
  const n = dom.verts.length;
  const hit = new Set();
  for (const c of dom.churns) {
    if (!c.seat) continue;
    for (let i = 0; i < n; i++) {
      const A = dom.verts[i], B = dom.verts[(i + 1) % n];
      const fwd = Math.abs(c.seat.ax - A.x) < 0.6 && Math.abs(c.seat.ay - A.y) < 0.6 &&
                  Math.abs(c.seat.bx - B.x) < 0.6 && Math.abs(c.seat.by - B.y) < 0.6;
      const rev = Math.abs(c.seat.ax - B.x) < 0.6 && Math.abs(c.seat.ay - B.y) < 0.6 &&
                  Math.abs(c.seat.bx - A.x) < 0.6 && Math.abs(c.seat.by - A.y) < 0.6;
      if (fwd || rev) hit.add(i);
    }
  }
  return hit;
}
const sameSet = (a, b) => a.size === b.length && b.every(x => a.has(x));

// Wait until the mid-rise floors stand on the map.
let triDom = null;
for (let i = 0; i < 30 && !triDom; i++) {
  const d = await floorDom(triPiece.id);
  if (d && d.churns.length > 0) triDom = d;
  else await sleep(1000);
}
ok("the lone triangle stands on the map with its churns", !!triDom, triDom ? `${triDom.churns.length} churns` : "no group");

/* ── §1 + §2: the lone pieces churn on EVERY border ──────── */
console.log("§1/§2 the lone pieces — a churn on every border");
{
  const d = triDom;
  const exp = exposure.get(triPiece.id);
  ok("§1 the lone triangle carries THREE churns", !!d && d.churns.length === 3,
    d ? `${d.churns.length}` : "none");
  ok("§1 every churn follows one of the triangle's own borders, and together they cover all three",
    !!d && sameSet(seatEdges(d), exp.exposed) && seatEdges(d).size === d.churns.length,
    d ? JSON.stringify([...seatEdges(d)]) : "none");
  await shootPiece(servedById(triPiece.id), "rising-triangle-all-borders.png");
}
{
  const d = await floorDom(sqPiece.id);
  const exp = exposure.get(sqPiece.id);
  ok("§2 the lone square carries FOUR churns", !!d && d.churns.length === 4,
    d ? `${d.churns.length}` : "none");
  ok("§2 every churn follows one of the square's own borders, and together they cover all four",
    !!d && sameSet(seatEdges(d), exp.exposed) && seatEdges(d).size === d.churns.length,
    d ? JSON.stringify([...seatEdges(d)]) : "none");
  await shootPiece(servedById(sqPiece.id), "rising-square-all-borders.png");
}

/* ── §3: the joined pair — none on the shared edge ───────── */
console.log("§3 the joined wedges — the shared edge churns on neither");
for (const [label, piece] of [["A", pairA], ["B", pairB]]) {
  const d = await floorDom(piece.id);
  const exp = exposure.get(piece.id);
  const hits = d ? seatEdges(d) : new Set();
  ok(`§3 wedge ${label} carries TWO churns, on its exposed borders only`,
    !!d && d.churns.length === 2 && sameSet(hits, exp.exposed),
    d ? `churns=${d.churns.length} seats=${JSON.stringify([...hits])} exposed=${JSON.stringify(exp.exposed)}` : "none");
  ok(`§3 wedge ${label}'s shared edge (edge ${exp.shared[0]}) carries NO churn`,
    !!d && !hits.has(exp.shared[0]),
    d ? JSON.stringify([...hits]) : "none");
}
await shootPiece(servedById(pairA.id), "joined-wedges-shared-edge.png");

/* ── §5: the whole-land sweep ────────────────────────────── */
console.log("§5 every floor on the land — churns == exposed borders, none shared");
{
  const floors = served.filter(p => p.kind === "triangle" || p.kind === "square");
  let allOk = true; const detail = [];
  for (const p of floors) {
    const d = await floorDom(p.id);
    const exp = exposure.get(p.id);
    const good = !!d && d.churns.length === exp.exposed.length &&
      sameSet(seatEdges(d), exp.exposed) && seatEdges(d).size === d.churns.length;
    if (!good) { allOk = false; detail.push({ id: p.id, churns: d?.churns.length, exposed: exp.exposed }); }
  }
  ok(`§5 all ${floors.length} floors: churn count == exposed borders, every seat on an exposed border`,
    allOk, JSON.stringify(detail));
}

/* ── §6a: while they move, the churns run ────────────────── */
console.log("§6 while the pieces move, the churn runs; once they stand, it rests");
{
  restock(); // the rises must still be advancing while we watch
  let sawMoving = false, maxStones = 0;
  for (let i = 0; i < 40 && !(sawMoving && maxStones > 0); i++) {
    for (const pid of [triPiece.id, sqPiece.id]) {
      const d = await floorDom(pid);
      if (!d) continue;
      if (d.churns.some(c => c.moving === "1")) sawMoving = true;
      maxStones = Math.max(maxStones, ...d.churns.map(c => Math.max(c.stonesAttr, c.stoneEls)));
    }
    if (!(sawMoving && maxStones > 0)) await sleep(750);
  }
  ok("§6 while the floors move, their churns run — gravel in the air at their borders",
    sawMoving && maxStones > 0, JSON.stringify({ sawMoving, maxStones }));
}

/* ── §4: a wall on the square's edge ─────────────────────── */
console.log("§4 the wall — one churn, as ever; the square keeps all four borders");
let wallPiece = null;
{
  const edge = edgesOf(sqCand.verts)[0];
  wallPiece = await tryLay("wall", edge);
  ok("§4 a wall is laid on the square's own edge", !!wallPiece, JSON.stringify(wallPiece && wallPiece.id));
  if (wallPiece) {
    let wallChurns = 0;
    for (let i = 0; i < 20 && wallChurns === 0; i++) {
      wallChurns = await page.evaluate((pid) =>
        document.querySelectorAll(`.build-wall-piece[data-piece="${pid}"] .rise-churn`).length, wallPiece.id);
      if (wallChurns === 0) await sleep(750);
    }
    ok("§4 the wall carries exactly ONE churn (unchanged)", wallChurns === 1, `${wallChurns}`);
    const d = await floorDom(sqPiece.id);
    ok("§4 the square still churns on all four borders with a wall standing on one",
      !!d && d.churns.length === 4 && sameSet(seatEdges(d), exposure.get(sqPiece.id).exposed),
      d ? `${d.churns.length}` : "none");
  }
}

/* ── §6b: they stand — every churn rests ─────────────────── */
{
  const all = await servedPieces();
  // Stock, backdate, settle — repeated until every piece tops
  // out (a starved rise holds its height by law, so the purse
  // is kept full across the settles).
  for (let i = 0; i < 12; i++) {
    restock();
    for (const p of all) backdate(p.id, 40);
    served = await servedPieces();
    if (served.every(p => (p.frac ?? 1) >= 1)) break;
    await sleep(300);
  }
  ok("every piece stands finished (frac 1)",
    served.every(p => (p.frac ?? 1) >= 1), JSON.stringify(served.map(p => [p.id, p.frac])));
  let stood = false;
  for (let i = 0; i < 30 && !stood; i++) {
    const d = await floorDom(triPiece.id);
    if (d && Number(d.frac) >= 1) stood = true;
    else await sleep(1000);
  }
  ok("the map serves the triangle standing", stood);
  await sleep(4500); // thrown gravel lives out its arc and dies; the dust tail settles
  const d = await floorDom(triPiece.id);
  const resting = !!d && d.churns.length === 3 && d.churns.every(c =>
    c.moving === "0" && c.cracks === 6 && c.stoneEls === 0 && c.stonesAttr === 0 && c.mound);
  ok("§6 standing, every churn RESTS: mound and six cracks at each border, no gravel thrown, nothing moving",
    resting, JSON.stringify(d?.churns));
  await shootPiece(servedById(triPiece.id), "standing-triangle-rubble-borders.png");
}

await browser.close();
console.log(`\ndrive-gravel-all-borders: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
