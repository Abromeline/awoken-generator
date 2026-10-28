// drive-pieces-faces — THE NEW-PIECES FACES WIRING (2026-10-28,
// Nigel's rulings of 2026-10-27 20:06–21:00). Proven on the real
// homeland:
//   §F1 THE NEW KINDS AT THE API: the half wall and the narrow
//      wall are first-class pieces — they stand on a floor's
//      edge, refuse a second wall on the same edge and a seat
//      on no edge, carry the whole edge as their collision
//      segment (walkers stopped; the leap that crosses every
//      wall crosses them — the one crossing law the field
//      knows, as the draw sheet names it), and their
//      protection reads the ground beneath, like every piece.
//   §F2 THE FACES, IN A REAL BROWSER: the struck door is gone
//      from the DOM and from the source (no construction
//      toggle, no build bar); the pieces menu seats in the
//      BUILDING ABILITY TAB on a Stone Awoken's wheel — the
//      one door since the Stone Cast (2026-10-28, Nigel's
//      rulings of 2026-10-27 20:23–21:00), the free-standing
//      pieces seat in the building panel closed — and its six
//      choices are buttons made from
//      the pieces' own drawn faces (the shipped assets are
//      matched byte for byte); the laid square wears HIS SLAB
//      (Build 1.psd L19) — the served image is that very file;
//      a half wall and a narrow wall stand wearing their
//      faces; and a wall on a square's SHALLOW side edge — a
//      stance he has not drawn — seats TRUE by the affine law:
//      its base ends meet the edge's ends exactly and its
//      jambs stand vertical (a rigid turn of the frontal
//      picture, the old seat, would lean them ~20°), with the
//      node naming the stance NOT DRAWN.
//   §F3 DESTROY FROM THE MENU: take away, chosen in the menu,
//      fells the narrow wall by a tap; tapping the square
//      takes the half wall it alone carried down with it —
//      one tap, no confirmation, the cascade by the support
//      law.
// Screenshots land in ~/workspace/faces-proof/.
// Run after `npm run build`:
//   PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-pieces-faces.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");
const GEO = await import("../server/dist/buildGeometry.js");
const { piecesOfHex, plateToAxial, edgesOf, edgeKeyOf, collisionSegments, pointInPolygon } = GEO;

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-piecesfaces-"));
process.env.PORT = "39984";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39984";
const PW = "piecesfaces-drive-password";
const SHOTS = "/home/hatch/workspace/faces-proof";
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
const claim = await callOk("claimTender", { password: PW, tenderName: "Faces Tender" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
const token = claim.token;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 3, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', total_exp = 3800, hp = 100").run(ownerKey, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 900, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 900").run(ownerKey, now);
await callOk("ensureFirstSeed", {}, token);
let land = await callOk("getTerritory", {}, token);
ok("the sown land stands (tiles served)", land.tiles.length >= 19, `${land.tiles.length} tiles`);
async function servedPieces() {
  land = await callOk("getTerritory", {}, token);
  return land.buildPieces ?? [];
}
/* THE STONE CAST, RESTATED (2026-10-28): every cast in this
 * drive names its LEAD BUILDER — a fielded Awoken holding 3
 * Rock, "Faces Mason" — because the cast's gate refuses a
 * cast with no qualified lead, and the pieces menu's one door
 * is now that Awoken's building ability tab (Nigel's rulings
 * of 2026-10-27 20:23–21:00). Pieces laid here BEGIN RISING;
 * finishRises walks their clocks to the top where a witness
 * is the law of standing work (the faces' portraits, the
 * taking-away cascade) — drive-stone-cast proves the rise. */
const LEAD = (() => {
  const insA = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
  const parts = [["Mason Body", "body", 3, 3], ["Mason Arms", "arms", 3, 3], ["Mason Crown", "head", 3, 3]]
    .map(([n, c, p, t]) => ({ id: Number(insA.run(n, c, p, t, "stone", `faces-mason/${n}.png`, now).lastInsertRowid), name: n, category: c, power: p, toughness: t, element: "stone" }));
  const composition = JSON.stringify(parts.map(p => ({ source_id: `db:${p.id}`, name: p.name, category: p.category, rarity: "common", power: p.power, toughness: p.toughness, element: p.element })));
  const id = Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES ('Faces Mason', 'Faces Mason', 'faces-mason/mason.png', ?, 'tender', 'Faces Tender', ?, ?)").run(composition, ownerKey, now).lastInsertRowid);
  const t00 = land.tiles.find(t => t.q === 0 && t.r === 0);
  db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
    VALUES (?, ?, ?, ?, ?, 'defense', 0, 99, ?, ?, NULL, NULL, 0)`).run(ownerKey, id, t00.id, now, now, t00.q, t00.r);
  return id;
})();
async function finishRises() {
  db.prepare("UPDATE build_pieces SET rise_updated_at = ? WHERE owner_key = ?").run(Date.now() - 30 * 60000, ownerKey);
  return servedPieces();
}

/* ── protection re-reckoning (the same witness §B keeps) ──── */
function axialRound(q, r) {
  const x = q, z = r, y = -x - z;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
  return { q: rx, r: rz };
}
function footprintHexes(footprint) {
  const seen = new Map();
  const put = (q, r) => seen.set(`${q},${r}`, { q, r });
  for (const v of footprint) { const h = axialRound(v[0], v[1]); put(h.q, h.r); }
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i], b = footprint[(i + 1) % footprint.length];
    const h = axialRound((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); put(h.q, h.r);
  }
  const c = [footprint.reduce((s, v) => s + v[0], 0) / footprint.length, footprint.reduce((s, v) => s + v[1], 0) / footprint.length];
  const hc = axialRound(c[0], c[1]); put(hc.q, hc.r);
  let minQ = Infinity, maxQ = -Infinity, minR = Infinity, maxR = -Infinity;
  for (const v of footprint) { minQ = Math.min(minQ, v[0]); maxQ = Math.max(maxQ, v[0]); minR = Math.min(minR, v[1]); maxR = Math.max(maxR, v[1]); }
  for (let q = Math.floor(minQ); q <= Math.ceil(maxQ); q++)
    for (let r = Math.floor(minR); r <= Math.ceil(maxR); r++)
      if (pointInPolygon([q, r], footprint)) put(q, r);
  return [...seen.values()];
}
function expectedProtection(footprint, tiles) {
  const byKey = new Map(tiles.map(t => [`${t.q},${t.r}`, t]));
  const hexes = footprintHexes(footprint);
  if (!hexes.length) return false;
  return hexes.every(h => { const t = byKey.get(`${h.q},${h.r}`); return !!t && !t.cursed; });
}

/* ── §F1 THE NEW KINDS AT THE API ──────────────────────────── */
console.log("§F1 the new kinds — the half wall and the narrow wall stand as pieces");
const hex00 = piecesOfHex(0, 0);
const sqEdgesOf = (sq) => edgesOf(sq.verts);
/* The square's edges by their measured screen lines (the
 * tiling record's vertex order is the server's, not assumed):
 * the host square is the one standing on a LONG edge of the
 * hex; the half wall takes its far long edge, so it wears its
 * frontal face; the narrow wall takes a side edge. */
const HEX_HEART0 = [0.5, Math.sqrt(3) / 6];
const screenOfAxial0 = ([q, r]) => { const k = 54 / 796; return [250 + q * 1292 * k, 170 + q * 470 * k + r * 948 * k]; };
const lineAngle0 = (e) => {
  const A = screenOfAxial0(plateToAxial(e[0])), B = screenOfAxial0(plateToAxial(e[1]));
  let a = (Math.atan2(B[1] - A[1], B[0] - A[0]) * 180) / Math.PI;
  if (a > 90) a -= 180; if (a <= -90) a += 180;
  return a;
};
const edgeDistToHeart = (e) => Math.hypot((e[0][0] + e[1][0]) / 2 - HEX_HEART0[0], (e[0][1] + e[1][1]) / 2 - HEX_HEART0[1]);
const seamOf = (sq) => [...sqEdgesOf(sq)].sort((a, b) => edgeDistToHeart(a) - edgeDistToHeart(b))[0];
const square0 = hex00.filter(p => p.kind === "square").find(sq => Math.abs(lineAngle0(seamOf(sq))) <= 10);
const layS = await callOk("placeBuildPiece", { leadId: LEAD, kind: "square", verts: square0.verts }, token);
ok("§F1 a square foundation is laid", layS.ok === true && layS.piece.kind === "square");
const sqEdges = sqEdgesOf(square0);
const longEdge = sqEdges.filter(e => Math.abs(lineAngle0(e)) <= 10).sort((a, b) => edgeDistToHeart(b) - edgeDistToHeart(a))[0];
const seamEdge = seamOf(square0);
const sideEdge = sqEdges.find(e => e !== longEdge && e !== seamEdge);
const layHalf = await callOk("placeBuildPiece", { leadId: LEAD, kind: "halfwall", verts: longEdge }, token);
ok("§F1 a half wall stands on the square's far edge", layHalf.ok === true && layHalf.piece.kind === "halfwall");
const halfSegs = collisionSegments("halfwall", layHalf.piece.footprint);
ok("§F1 the half wall's collision is its whole edge, one segment end to end (walkers stopped; a leap crosses it as it crosses every wall)",
  halfSegs.length === 1 && JSON.stringify(halfSegs[0]) === JSON.stringify(layHalf.piece.footprint),
  JSON.stringify(halfSegs));
const layNarrow = await callOk("placeBuildPiece", { leadId: LEAD, kind: "narrow", verts: sideEdge }, token);
ok("§F1 a narrow wall stands on the square's side edge, its own piece beside the full wall", layNarrow.ok === true && layNarrow.piece.kind === "narrow");
const narrowSegs = collisionSegments("narrow", layNarrow.piece.footprint);
ok("§F1 the narrow wall's collision is its whole edge, one segment end to end",
  narrowSegs.length === 1 && JSON.stringify(narrowSegs[0]) === JSON.stringify(layNarrow.piece.footprint),
  JSON.stringify(narrowSegs));
const dupHalf = await call("placeBuildPiece", { leadId: LEAD, kind: "halfwall", verts: longEdge }, token);
ok("§F1 a second half wall on the same edge refuses", dupHalf.status >= 400, `status ${dupHalf.status}`);
const crossKind = await call("placeBuildPiece", { leadId: LEAD, kind: "wall", verts: longEdge }, token);
ok("§F1 a full wall on the half wall's edge refuses too (one wall of any kind per edge)", crossKind.status >= 400, `status ${crossKind.status}`);
const strayHalf = await call("placeBuildPiece", { leadId: LEAD, kind: "halfwall", verts: [[9, 9], [10, 9]] }, token);
ok("§F1 a half wall on no floor's edge refuses", strayHalf.status >= 400, `status ${strayHalf.status}`);
{
  const served = await servedPieces();
  const mine = served.filter(p => [layS.piece.id, layHalf.piece.id, layNarrow.piece.id].includes(p.id));
  ok("§F1 the new pieces' protection flags match the ground beneath their footprints, re-reckoned here",
    mine.length === 3 && mine.every(p => p.protected === expectedProtection(p.footprint, land.tiles)),
    JSON.stringify(mine.map(p => [p.kind, p.protected])));
}

/* The true-seating stage: a second square on a SLANT edge of
 * the origin hex, and a wall on one of its shallow side edges. */
const HEX_HEART = [0.5, Math.sqrt(3) / 6];
const screenOfAxial = ([q, r]) => { const k = 54 / 796; return [250 + q * 1292 * k, 170 + q * 470 * k + r * 948 * k]; };
const lineAngle = (e) => {
  const A = screenOfAxial(plateToAxial(e[0])), B = screenOfAxial(plateToAxial(e[1]));
  let a = (Math.atan2(B[1] - A[1], B[0] - A[0]) * 180) / Math.PI;
  if (a > 90) a -= 180; if (a <= -90) a += 180;
  return a;
};
let slantSquare = null, shallowEdge = null;
for (const cand of hex00.filter(p => p.kind === "square")) {
  if (JSON.stringify(cand.verts) === JSON.stringify(square0.verts)) continue;
  const es = edgesOf(cand.verts);
  const shared = es.map((e, i) => ({
    i, e,
    d: Math.hypot((e[0][0] + e[1][0]) / 2 - HEX_HEART[0], (e[0][1] + e[1][1]) / 2 - HEX_HEART[1]),
  })).sort((a, b) => a.d - b.d)[0];
  const ang = Math.abs(lineAngle(shared.e));
  if (ang < 35 || ang > 60) continue; // the shared edge is a slant line
  const side = es[(shared.i + 1) % 4];
  const sideAng = Math.abs(lineAngle(side));
  if (sideAng < 12 || sideAng > 30) continue; // its side runs shallow
  slantSquare = cand; shallowEdge = side; break;
}
ok("§F1 a square standing on a slant edge, with a shallow side edge, stands in the tiling", !!slantSquare && !!shallowEdge);
let layWallShallow = null;
if (slantSquare) {
  await callOk("placeBuildPiece", { leadId: LEAD, kind: "square", verts: slantSquare.verts }, token);
  layWallShallow = await callOk("placeBuildPiece", { leadId: LEAD, kind: "wall", verts: shallowEdge }, token);
  ok("§F1 a wall stands on the square's shallow side edge", layWallShallow.ok === true && layWallShallow.piece.kind === "wall");
}

/* ── §F2 THE FACES, IN A REAL BROWSER ──────────────────────── */
await finishRises(); // the faces are photographed standing, at full height (the Stone Cast note above)
console.log("§F2 the faces — the menu is the door; the square wears his slab; the shallow wall seats true");
const territorySrc = readFileSync("client/src/Territory.tsx", "utf8");
const themeSrc = readFileSync("client/src/theme.css", "utf8");
ok("§F2 the struck door is gone from the source: no buildmode-toggle, build-bar or build-tool stands in Territory.tsx or theme.css",
  !/buildmode-toggle|build-bar|build-tool/.test(territorySrc) && !/buildmode-toggle|build-bar|build-tool/.test(themeSrc));
// The shipped assets, matched byte for byte against his cuts.
const distAssets = readdirSync("client/dist/assets");
const assetNameFor = (srcName) => {
  const bytes = readFileSync(join("client/src/assets/building-faces", srcName));
  return distAssets.find(f => f.endsWith(".png") && readFileSync(join("client/dist/assets", f)).equals(bytes)) ?? null;
};
const squareAsset = assetNameFor("square-foundation.png");
const halfAsset = assetNameFor("half-wall-long-edge.png");
const narrowAsset = assetNameFor("wall-narrow.png");
ok("§F2 the built bundle carries his three new faces byte for byte (the square's slab, the frontal half wall, the narrow wall)",
  !!squareAsset && !!halfAsset && !!narrowAsset, JSON.stringify({ squareAsset, halfAsset, narrowAsset }));

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:piecesfaces]", String(e).slice(0, 200)));
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
  await page.evaluate(() => {
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
// THE DOOR, RESTATED (2026-10-28, THE STONE CAST): the
// pieces menu stands in the building ability tab on the
// mason's wheel — tap his figure, tap the wheel's Abilities
// door, pick in the tab. The tab stays open while the piece
// is worked (the map's presses beside it belong to the work).
const openAbilityTab = async () => {
  const open = await page.evaluate(() => !!document.querySelector(".ability-side-panel"));
  if (open) return;
  // On a heavy first entry the figures can take a while to
  // stand on the land — wait for them before sweeping.
  await page.waitForFunction(() => document.querySelectorAll("g.field-drifter, g.field-patroller").length > 0, { timeout: 25000 }).catch(() => {});
  for (let sweep = 0; sweep < 3; sweep++) {
    // The return report's ceremony card can land over the map
    // a breath after entry and swallow every tap — clear
    // overlays inside the sweep, not only before it.
    await clearOverlays();
    const figs = await page.evaluate(() => {
      const out = [];
      for (const g of document.querySelectorAll("g.field-drifter, g.field-patroller")) {
        const r = g.getBoundingClientRect();
        if (r.width) out.push({ cx: r.left + r.width / 2, cy: r.top + r.height / 2 });
      }
      return out;
    });
    for (const f of figs) {
      await page.touchscreen.tap(f.cx, f.cy);
      await sleep(700);
      const s = await page.evaluate(() => ({
        wheel: !!document.querySelector(".gw-wheel"),
        caption: document.querySelector(".gw-caption")?.textContent ?? "",
      }));
      if (s.wheel && s.caption.includes("Faces Mason")) {
        const box = await page.evaluate(() => {
          const d = [...document.querySelectorAll(".gw-disc")].find((x) => (x.textContent ?? "").includes("Abilities"));
          if (!d) return null;
          const r = d.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });
        if (box) { await page.touchscreen.tap(box.x, box.y); await sleep(800); }
        return;
      }
      if (s.wheel) { await page.touchscreen.tap(1350, 40); await sleep(500); }
    }
    await sleep(500);
  }
};
const pickPiece = async (tool) => {
  await openAbilityTab();
  await page.evaluate((t) => { document.querySelector(`.ability-side-panel .pieces-menu .piece-choice[data-tool="${t}"]`)?.click(); }, tool);
  await sleep(300);
};
await enterTerritory();
await clearOverlays();

ok("§F2 no construction toggle and no build bar stands on the map",
  await page.evaluate(() => !document.querySelector(".buildmode-toggle") && !document.querySelector(".build-bar")));
const floorImgs = await page.evaluate(() => [...document.querySelectorAll(".build-floors image")].map(i => i.getAttribute("href") ?? ""));
ok("§F2 the laid square wears HIS SLAB: a floor image on the land is the square-foundation cut itself",
  !!squareAsset && floorImgs.some(h => h.endsWith(squareAsset)), JSON.stringify(floorImgs.map(h => h.split("/").pop())));
const wallNodes = await page.evaluate(() => [...document.querySelectorAll(".build-wall-piece")].map(n => ({
  kind: n.getAttribute("data-kind"),
  perspective: n.getAttribute("data-perspective"),
  img: n.querySelector("image")?.getAttribute("href") ?? "",
})));
ok("§F2 the half wall stands wearing its frontal face",
  wallNodes.some(n => n.kind === "halfwall" && !!halfAsset && n.img.endsWith(halfAsset)), JSON.stringify(wallNodes));
ok("§F2 the narrow wall stands wearing its own face",
  wallNodes.some(n => n.kind === "narrow" && !!narrowAsset && n.img.endsWith(narrowAsset)), JSON.stringify(wallNodes));

/* TRUE SEATING: the wall on the square's shallow side edge. */
const shallow = await page.evaluate(() => {
  const n = [...document.querySelectorAll(".build-wall-piece")].find(x => x.getAttribute("data-kind") === "wall" && (x.getAttribute("data-perspective") ?? "").startsWith("shallow"));
  if (!n) return null;
  const g = n.querySelector("g");
  const line = n.querySelector("line");
  const m = /matrix\(([^)]+)\)/.exec(g?.getAttribute("transform") ?? "");
  const nums = m ? m[1].split(/[\s,]+/).filter(Boolean).map(Number) : null;
  // the transform applied to the frontal face's base start (3,440)
  const apply = (x, y) => nums ? { x: nums[0] * x + nums[2] * y + nums[4], y: nums[1] * x + nums[3] * y + nums[5] } : null;
  return {
    perspective: n.getAttribute("data-perspective"),
    nums,
    baseStartLands: apply(3, 440),
    baseEndLands: apply(344, 440),
    line: line ? { x1: +line.getAttribute("x1"), y1: +line.getAttribute("y1"), x2: +line.getAttribute("x2"), y2: +line.getAttribute("y2") } : null,
  };
});
ok("§F2 the wall on the square's shallow side names its stance as not drawn", !!shallow && shallow.perspective === "shallow side line — NOT DRAWN", JSON.stringify(shallow?.perspective));
if (shallow && shallow.nums && shallow.line) {
  const [a, b, c, d] = shallow.nums;
  const scaleY = Math.hypot(c, d);
  const lean = Math.abs(c) / scaleY; // sin of the jambs' tilt from vertical; a rigid ~20° turn would read ≈0.34
  const dStart = Math.hypot(shallow.baseStartLands.x - shallow.line.x1, shallow.baseStartLands.y - shallow.line.y1);
  const dEnd = Math.hypot(shallow.baseEndLands.x - shallow.line.x2, shallow.baseEndLands.y - shallow.line.y2);
  ok("§F2 the shallow wall seats TRUE: its base ends meet the edge's ends (flush), and its jambs stand vertical — no borrowed rotation",
    dStart <= 2.5 && dEnd <= 2.5 && lean <= 0.03 && d > 0,
    JSON.stringify({ dStart, dEnd, lean }));
} else {
  ok("§F2 the shallow wall seats TRUE: its base ends meet the edge's ends (flush), and its jambs stand vertical — no borrowed rotation", false, "the shallow node or its transform was not found");
}

/* The menu, photographed wearing his artwork: the menu seats
 * in the Stone Awoken's ability tab (the Stone Cast,
 * 2026-10-28) — open the tab on the mason's wheel and take
 * the menu's own portrait. */
await openAbilityTab();
await page.evaluate(() => document.querySelector(".ability-side-panel .pieces-menu")?.scrollIntoView({ block: "center" }));
await sleep(400);
const panelRect = await page.evaluate(() => {
  const r = document.querySelector(".pieces-menu")?.getBoundingClientRect();
  return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
});
if (panelRect) {
  await page.screenshot({
    path: join(SHOTS, "01-pieces-menu.png"),
    clip: {
      x: Math.max(0, panelRect.x - 6), y: Math.max(0, panelRect.y - 6),
      width: Math.min(1400 - Math.max(0, panelRect.x - 6), panelRect.width + 12),
      height: Math.min(950 - Math.max(0, panelRect.y - 6), panelRect.height + 12),
    },
  });
}
ok("§F2 the pieces menu stands in the Stone Awoken's ability tab for its photograph", !!panelRect);
const menuImgs = await page.evaluate(() => [...document.querySelectorAll(".ability-side-panel .pieces-menu .piece-choice")].map(b => ({
  tool: b.getAttribute("data-tool"), img: b.querySelector("img")?.getAttribute("src") ?? "",
})));
ok("§F2 every piece choice in the menu is a button made from the piece's own drawn face",
  ["triangle", "square", "wall", "door", "halfwall", "narrow"].every(t => menuImgs.some(m => m.tool === t && m.img.length > 0))
  && menuImgs.some(m => m.tool === "square" && !!squareAsset && m.img.endsWith(squareAsset)),
  JSON.stringify(menuImgs.map(m => [m.tool, m.img.split("/").pop()])));

/* The square's portrait, and the shallow wall's. */
{
  const r = await page.evaluate((asset) => {
    const imgs = [...document.querySelectorAll(".build-floors image")].filter(i => (i.getAttribute("href") ?? "").endsWith(asset));
    const img = imgs[imgs.length - 1]; // the slant square's slab — the barest of the two squares
    if (!img) return null;
    const b = img.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  }, squareAsset ?? " ");
  if (r) {
    await page.screenshot({
      path: join(SHOTS, "03-square-wears-his-slab.png"),
      clip: {
        x: Math.max(0, r.x - 30), y: Math.max(0, r.y - 30),
        width: Math.min(1400 - Math.max(0, r.x - 30), r.width + 60),
        height: Math.min(950 - Math.max(0, r.y - 30), r.height + 60),
      },
    });
  }
  ok("§F2 the square's portrait is taken", !!r);
}
{
  const r = await page.evaluate(() => {
    const n = [...document.querySelectorAll(".build-wall-piece")].find(x => x.getAttribute("data-kind") === "wall" && (x.getAttribute("data-perspective") ?? "").startsWith("shallow"));
    if (!n) return null;
    const b = n.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  });
  if (r) {
    await page.screenshot({
      path: join(SHOTS, "02-wall-true-on-square-edge.png"),
      clip: {
        x: Math.max(0, r.x - 60), y: Math.max(0, r.y - 60),
        width: Math.min(1400 - Math.max(0, r.x - 60), r.width + 120),
        height: Math.min(950 - Math.max(0, r.y - 60), r.height + 120),
      },
    });
  }
  ok("§F2 the shallow wall's portrait is taken", !!r);
}

/* ── §F3 DESTROY FROM THE MENU ─────────────────────────────── */
console.log("§F3 destroy from the menu — one tap, and the cascade by the support law");
const landClient = (lx, ly) => page.evaluate((x, y) => {
  const g = document.querySelector(".land-cam");
  const p = new DOMPoint(x, y).matrixTransform(g.getScreenCTM());
  const el = document.elementFromPoint(p.x, p.y);
  return { x: p.x, y: p.y, onScaffold: !!el && el.hasAttribute && el.hasAttribute("data-build-capture") };
}, lx, ly);
const tapAxial = async ([q, r]) => {
  const pt = await landClient(250 + q * 1292 * (54 / 796), 170 + q * 470 * (54 / 796) + r * 948 * (54 / 796));
  if (!pt.onScaffold) return false;
  await page.mouse.click(pt.x, pt.y);
  await sleep(700);
  return true;
};
await pickPiece("remove");
const narrowMid = [
  (layNarrow.piece.footprint[0][0] + layNarrow.piece.footprint[1][0]) / 2,
  (layNarrow.piece.footprint[0][1] + layNarrow.piece.footprint[1][1]) / 2,
];
const tappedNarrow = await tapAxial(narrowMid);
let served = await servedPieces();
ok("§F3 take away, chosen in the menu, fells the narrow wall with one tap",
  tappedNarrow && !served.some(p => p.id === layNarrow.piece.id),
  JSON.stringify({ tappedNarrow, kinds: served.map(p => p.kind) }));
const sqCentre = [
  layS.piece.footprint.reduce((s, v) => s + v[0], 0) / layS.piece.footprint.length,
  layS.piece.footprint.reduce((s, v) => s + v[1], 0) / layS.piece.footprint.length,
];
const tappedSquare = await tapAxial(sqCentre);
served = await servedPieces();
ok("§F3 tapping the square away takes the half wall it alone carried down with it (the cascade)",
  tappedSquare && !served.some(p => p.id === layS.piece.id) && !served.some(p => p.id === layHalf.piece.id),
  JSON.stringify({ tappedSquare, kinds: served.map(p => p.kind) }));
ok("§F3 the felled pieces leave the map's drawing too",
  await page.evaluate(() => ![...document.querySelectorAll(".build-wall-piece")].some(n => n.getAttribute("data-kind") === "halfwall")));

await browser.close();
console.log(`\ndrive-pieces-faces: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
