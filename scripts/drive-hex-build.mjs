// drive-hex-build — THE HEX BUILDING SYSTEM, SLICE 1 (Nigel,
// 2026-10-25 — "IMPLEMENT"). The ground floor of the construction,
// proven on the real homeland:
//   §B the placement law at the API: only true tiling pieces
//      persist (their footprints re-derived server-side, in axial
//      map coordinates); duplicates and invented shapes refuse;
//      walls stand only on a floor's own edge; removing a floor
//      takes down the wall it alone carried. PROTECTION is the
//      derivation itself: for every served piece, the drive
//      re-reckons the hexes beneath its footprint from the served
//      land and checks the served flag against the ground.
//   §D THE DARK'S WALK: a wanderer walking a straight line to
//      pure ground is stopped by a build wall across its path —
//      and walks on once the wall is taken away.
//   §C THE MARCH ROAD: an Awokin's road bends around a build
//      wall (no step of the stored road crosses it) where the
//      unwalled road ran straight.
//   §G the door's gap, in the shipped geometry: a step threaded
//      through the middle two-fifths crosses no collision
//      segment; the same step at the wall's standing part does.
//   §E THE FACE, in a real browser: build mode opens from its
//      own toggle; its bar carries the five tools; taps on the
//      map's own scaffolding lay a square and a triangle and
//      raise a wall on the square's edge; the compound around
//      the Tender — a whole construction hex of six triangles,
//      a square on its edge, the shoulder triangles brokering
//      its sides, triangles at its far corners, a wall and a
//      door standing on floor edges — stands drawn at the map's
//      angle (screenshots in ~/workspace/hex-build-proof/).
//   §T THE TENDER'S STRIDE: a plain tap glides him toward a hex
//      two steps away; a build wall across the line stops him
//      on its near side; with the wall taken away, he arrives.
//   §F PERSISTENCE: after a reload the pieces stand as laid,
//      the browser's count agreeing with the server's.
// Run after `npm run build`:
//   PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-hex-build.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");
const GEO = await import("../server/dist/buildGeometry.js");
const { piecesOfHex, candidatesNear, plateToAxial, axialToPlate, edgesOf, edgeKeyOf, segmentsCrossProper, collisionSegments, pointInPolygon } = GEO;

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-hexbuild-"));
process.env.PORT = "39983";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39983";
const PW = "hexbuild-drive-password";
const SHOTS = "/home/hatch/workspace/hex-build-proof";
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
const claim = await callOk("claimTender", { password: PW, tenderName: "Build Tender" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
const token = claim.token;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 3, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', total_exp = 3800, hp = 100").run(ownerKey, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 900, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 900").run(ownerKey, now);
await callOk("ensureFirstSeed", {}, token);
let land = await callOk("getTerritory", {}, token);
const tileAt = (q, r) => land.tiles.find(t => t.q === q && t.r === r);
ok("the sown land stands (tiles served)", land.tiles.length >= 19, `${land.tiles.length} tiles`);

/* ── helpers mirroring the server's own reckonings ─────────── */
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
async function servedPieces() {
  land = await callOk("getTerritory", {}, token);
  return land.buildPieces ?? [];
}

/* ── §B THE PLACEMENT LAW ──────────────────────────────────── */
console.log("§B the placement law — true pieces only, footprints derived, protection derived");
const hex00 = piecesOfHex(0, 0);
const wedge0 = hex00.find(p => p.kind === "triangle" && p.verts.some(v => Math.abs(v[0]) < 1e-9 && Math.abs(v[1]) < 1e-9) && p.verts.some(v => Math.abs(v[0] - 1) < 1e-9 && Math.abs(v[1]) < 1e-9));
const square0 = hex00.filter(p => p.kind === "square")[0];
const shoulder1 = hex00.find(p => p.kind === "triangle" && !p.verts.some(v => Math.abs(v[0]) < 1e-9 && Math.abs(v[1]) < 1e-9));
const layW = await callOk("placeBuildPiece", { kind: "triangle", verts: wedge0.verts }, token);
ok("§B a triangle floor (a wedge of the origin hex) is laid", layW.ok === true && layW.piece.kind === "triangle");
const wantFoot = wedge0.verts.map(v => plateToAxial(v));
ok("§B its footprint is the piece's own polygon in AXIAL map coordinates (derived server-side through the slant)",
  JSON.stringify(layW.piece.footprint) === JSON.stringify(wantFoot),
  JSON.stringify(layW.piece.footprint));
const layS = await callOk("placeBuildPiece", { kind: "square", verts: square0.verts }, token);
ok("§B a square foundation is laid on the hex's edge (its footprint crosses the hex border — no hex-lock)", layS.ok === true && layS.piece.kind === "square");
const layT = await callOk("placeBuildPiece", { kind: "triangle", verts: shoulder1.verts }, token);
ok("§B a shoulder triangle brokers the seam beside the square", layT.ok === true);
const dup = await call("placeBuildPiece", { kind: "square", verts: square0.verts }, token);
ok("§B the same piece twice refuses", dup.status >= 400, `status ${dup.status}`);
const bogus = await call("placeBuildPiece", { kind: "triangle", verts: [[0, 0], [2, 0], [1, 1]] }, token);
ok("§B an invented shape (no tiling piece) refuses — the server re-derives, never trusts", bogus.status >= 400, `status ${bogus.status}`);
const stray = await call("placeBuildPiece", { kind: "wall", verts: [[9, 9], [10, 9]] }, token);
ok("§B a wall on no floor's edge refuses", stray.status >= 400, `status ${stray.status}`);
// A wall on the square's FAR edge — carried by the square alone.
const sqEdges = edgesOf(square0.verts);
const farEdge = sqEdges[2];
const layWall = await callOk("placeBuildPiece", { kind: "wall", verts: farEdge }, token);
ok("§B a wall stands on the square's far edge", layWall.ok === true && layWall.piece.kind === "wall");
const wall2 = await call("placeBuildPiece", { kind: "door", verts: farEdge }, token);
ok("§B a second wall on the same edge refuses (one wall per edge)", wall2.status >= 400, `status ${wall2.status}`);
let served = await servedPieces();
ok("§B the read serves all four pieces with their footprints",
  served.length === 4 && served.every(p => Array.isArray(p.footprint) && p.footprint.length >= 2), `${served.length} pieces`);
ok("§B every served protection flag matches the ground beneath the footprint, re-reckoned here from the served land",
  served.every(p => p.protected === expectedProtection(p.footprint, land.tiles)),
  JSON.stringify(served.map(p => [p.kind, p.protected])));
const rmS = await callOk("removeBuildPiece", { id: layS.piece.id }, token);
ok("§B removing the square takes down the wall it alone carried (both ids named)",
  rmS.removed.includes(layS.piece.id) && rmS.removed.includes(layWall.piece.id) && rmS.removed.length === 2,
  JSON.stringify(rmS.removed));
served = await servedPieces();
ok("§B after the taking-away, the wedge and the shoulder stand; the square and its wall are gone",
  served.length === 2 && served.every(p => p.kind === "triangle"), `${served.length} pieces`);

/* ── §G THE DOOR'S GAP, IN THE SHIPPED GEOMETRY ────────────── */
console.log("§G the door's gap — the middle stands open in the collision itself");
{
  const a = plateToAxial([0, 0]), b = plateToAxial([1, 0]);
  const segs = collisionSegments("door", [a, b]);
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const through = [[mid[0], mid[1] - 0.4], [mid[0], mid[1] + 0.4]];
  const atPart = [[a[0] + (b[0] - a[0]) * 0.15, a[1] + (b[1] - a[1]) * 0.15 - 0.4], [a[0] + (b[0] - a[0]) * 0.15, a[1] + (b[1] - a[1]) * 0.15 + 0.4]];
  ok("§G a step threaded through the door's open middle crosses no collision segment",
    !segs.some(([s, t]) => segmentsCrossProper(through[0], through[1], s, t)));
  ok("§G the same step at the door's standing part IS barred",
    segs.some(([s, t]) => segmentsCrossProper(atPart[0], atPart[1], s, t)));
  const wallSegs = collisionSegments("wall", [a, b]);
  ok("§G a plain wall has no gap: the middle step is barred too",
    wallSegs.some(([s, t]) => segmentsCrossProper(through[0], through[1], s, t)));
}

/* ── corridor helper (shared by §D, §C, §T): floors along a
      straight axial run, and a floor edge the run crosses ──── */
async function wallAcrossRun(fromAx, toAx) {
  const mid = [(fromAx[0] + toAx[0]) / 2, (fromAx[1] + toAx[1]) / 2];
  const plateMid = axialToPlate(mid[0], mid[1]);
  const cands = candidatesNear(plateMid).filter(c => c.kind === "square" || c.kind === "triangle");
  const placedKeys = new Set((await servedPieces()).map(p => p.pieceKey));
  const floors = [];
  for (const c of cands) {
    const centroidPlate = [c.verts.reduce((s, v) => s + v[0], 0) / c.verts.length, c.verts.reduce((s, v) => s + v[1], 0) / c.verts.length];
    if (Math.hypot(centroidPlate[0] - plateMid[0], centroidPlate[1] - plateMid[1]) > 1.6) continue;
    if (placedKeys.has(c.key)) { floors.push({ piece: (await servedPieces()).find(p => p.pieceKey === c.key), cand: c }); continue; }
    const r = await call("placeBuildPiece", { kind: c.kind, verts: c.verts }, token);
    if (r.status === 200) floors.push({ piece: r.body.piece, cand: c });
  }
  const walledEdges = new Set((await servedPieces()).filter(p => p.kind === "wall" || p.kind === "door").map(p => edgeKeyOf(p.verts[0], p.verts[1])));
  for (const f of floors) {
    for (const e of edgesOf(f.cand.verts)) {
      if (walledEdges.has(edgeKeyOf(e[0], e[1]))) continue;
      const ea = plateToAxial(e[0]), eb = plateToAxial(e[1]);
      if (segmentsCrossProper(fromAx, toAx, ea, eb)) return { edge: e, edgeAx: [ea, eb], floors };
    }
  }
  return null;
}

/* ── §D THE DARK'S WALK ────────────────────────────────────── */
console.log("§D the dark's walk — a build wall stops it; the open ground does not");
// A straight run on the land: a cursed tile with pure ground two
// steps on. The dark walks for the nearest pure tile.
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
let runD = null;
outer: for (const t of land.tiles) {
  if (!t.cursed) continue;
  for (const [dq, dr] of DIRS) {
    const m = tileAt(t.q + dq, t.r + dr), b = tileAt(t.q + 2 * dq, t.r + 2 * dr);
    if (!m || !b || b.cursed) continue;
    // The run's end must be the dark's own goal: the NEAREST pure
    // tile to its spawn, so its walk truly runs at the wall.
    const nearest = Math.min(...land.tiles.filter(x => !x.cursed).map(x => hexDist(t, x)));
    if (hexDist(t, b) === nearest) { runD = { from: t, mid: m, to: b }; break outer; }
  }
}
ok("§D a cursed tile with pure ground two steps on stands on the land", !!runD, JSON.stringify(land.tiles.slice(0, 3)));
if (runD) {
  const across = await wallAcrossRun([runD.from.q, runD.from.r], [runD.to.q, runD.to.r]);
  ok("§D floors stand along the run and one of their edges crosses it", !!across);
  if (across) {
    const w = await callOk("placeBuildPiece", { kind: "wall", verts: across.edge }, token);
    const [ea, eb] = across.edgeAx;
    const wallMid = [(ea[0] + eb[0]) / 2, (ea[1] + eb[1]) / 2];
    const distToGoal = (p) => Math.hypot(p[0] - runD.to.q, p[1] - runD.to.r);
    const ins = db.prepare("INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, pos_q, pos_r, hp, lvl, power) VALUES (?, ?, 'unraveler', ?, ?, ?, 40, 5, 1)")
      .run(ownerKey, runD.from.id, now, runD.from.q, runD.from.r);
    const darkId = Number(ins.lastInsertRowid);
    db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now() - 55000, ownerKey);
    await callOk("getTerritory", {}, token);
    let row = db.prepare("SELECT pos_q AS q, pos_r AS r FROM homeland_wanderers WHERE id = ?").get(darkId);
    // The witnesses are distances, not sides of the wall's
    // infinite line: the dark must have WALKED, must still be
    // short of the pure ground, and must never have got past
    // the wall itself on its way to that ground.
    ok("§D behind the wall, the dark walked yet never got past the wall toward its goal",
      !!row
      && Math.hypot(row.q - runD.from.q, row.r - runD.from.r) > 0.05
      && distToGoal([row.q, row.r]) > 0.8
      && distToGoal([row.q, row.r]) > distToGoal(wallMid) - 0.35,
      JSON.stringify({ row, wallMid }));
    await callOk("removeBuildPiece", { id: w.piece.id }, token);
    db.prepare("UPDATE homeland_wanderers SET pos_q = ?, pos_r = ?, tile_id = ? WHERE id = ?").run(runD.from.q, runD.from.r, runD.from.id, darkId);
    db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now() - 55000, ownerKey);
    await callOk("getTerritory", {}, token);
    row = db.prepare("SELECT pos_q AS q, pos_r AS r FROM homeland_wanderers WHERE id = ?").get(darkId);
    ok("§D with the wall taken away, the same dark walks on toward the pure ground (well past where the wall stood)",
      !!row && distToGoal([row.q, row.r]) < distToGoal([runD.from.q, runD.from.r]) - 0.5,
      JSON.stringify(row));
    db.prepare("DELETE FROM homeland_wanderers WHERE id = ?").run(darkId);
  }
}

/* ── §C THE MARCH ROAD ─────────────────────────────────────── */
console.log("§C the march road — the road bends around a build wall");
// The company: three Awokin, the first deployed to the seed's hex.
const insAsset = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
function seedCompany(names) {
  const parts = [["Sky Cloth", "body", 3, 3], ["Sky Cord", "arms", 3, 3], ["Sky Crown", "head", 3, 3]]
    .map(([n, c, p, t]) => ({ id: Number(insAsset.run(n, c, p, t, "sky", `hexbuild/${n}.png`, now).lastInsertRowid), name: n, category: c, power: p, toughness: t, element: "sky" }));
  const composition = JSON.stringify(parts.map(p => ({ source_id: `db:${p.id}`, name: p.name, category: p.category, rarity: "common", power: p.power, toughness: p.toughness, element: p.element })));
  const ins = db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', 'Build Tender', ?, ?)");
  return names.map(n => Number(ins.run(n, n, `hexbuild/${n}.png`, composition, ownerKey, now).lastInsertRowid));
}
const company = seedCompany(["Build Guard", "Build Second", "Build Third"]);
await callOk("deployFirstSeed", { awakenedIds: [company[0]] }, token);
land = await callOk("getTerritory", {}, token);
const guard = land.placements.find(p => p.awakenedId === company[0]);
const guardTile = land.tiles.find(t => t.id === guard?.tileId);
ok("§C the guard stands on the field", !!guardTile, JSON.stringify(guard));
let runC = null;
if (guardTile) {
  for (const [dq, dr] of DIRS) {
    const m = tileAt(guardTile.q + dq, guardTile.r + dr), b = tileAt(guardTile.q + 2 * dq, guardTile.r + 2 * dr);
    if (m && b) { runC = { from: guardTile, mid: m, to: b }; break; }
  }
}
ok("§C a straight two-step run stands from the guard's hex", !!runC);
const roadOf = () => {
  const row = db.prepare("SELECT march_path AS mp FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(ownerKey, company[0]);
  try { return JSON.parse(row?.mp ?? "null"); } catch { return null; }
};
const settleMarchNow = async () => {
  db.prepare("UPDATE field_placements SET march_ends = ? WHERE owner_key = ? AND awakened_id = ?").run(Date.now() - 1000, ownerKey, company[0]);
  land = await callOk("getTerritory", {}, token);
};
if (runC) {
  await callOk("setMarch", { awakenedId: company[0], tileId: runC.to.id }, token);
  const straight = roadOf();
  ok("§C unwalled, the road runs straight (two steps, through the middle hex)",
    Array.isArray(straight) && straight.length === 3 && straight[1] === runC.mid.id, JSON.stringify(straight));
  await settleMarchNow();
  const across = await wallAcrossRun([runC.to.q, runC.to.r], [runC.from.q, runC.from.r]);
  ok("§C a wall's edge stands across the road home", !!across);
  if (across) {
    await callOk("placeBuildPiece", { kind: "wall", verts: across.edge }, token);
    await callOk("setMarch", { awakenedId: company[0], tileId: runC.from.id }, token);
    const bent = roadOf();
    const byId = new Map(land.tiles.map(t => [t.id, t]));
    const [ea, eb] = across.edgeAx;
    const crosses = Array.isArray(bent) && bent.some((id, i) => {
      if (i === 0) return false;
      const a = byId.get(bent[i - 1]), b = byId.get(id);
      return a && b && segmentsCrossProper([a.q, a.r], [b.q, b.r], ea, eb);
    });
    ok("§C walled, the march still runs — and NO step of its road crosses the wall",
      Array.isArray(bent) && bent.length >= 3 && !crosses, JSON.stringify(bent));
    ok("§C the road bent (it is not the straight road walled shut)",
      Array.isArray(bent) && !(bent.length === 3 && bent[1] === runC.mid.id), JSON.stringify(bent));
    await settleMarchNow();
  }
}

/* ── compounds: a whole construction hex dressed around a
      tile — six wedges and six shoulders, a square on its
      nearest edge, triangles at the square's far corners (the
      octagon's corners), a wall and a door on floor edges ── */
async function buildCompoundAt(anchorTile) {
  const aPlate = axialToPlate(anchorTile.q, anchorTile.r);
  const [afm, afn] = GEO.centerAddress(aPlate);
  const hexPieces = piecesOfHex(Math.round(afm), Math.round(afn));
  const centre = GEO.hexCenter(Math.round(afm), Math.round(afn));
  const keys = new Set((await servedPieces()).map(p => p.pieceKey));
  for (const p of hexPieces) {
    if (p.kind === "square") continue;
    if (keys.has(p.key)) continue;
    const r = await call("placeBuildPiece", { kind: p.kind, verts: p.verts }, token);
    if (r.status === 200) keys.add(p.key);
  }
  const sq = hexPieces.filter(p => p.kind === "square")
    .sort((a, b) => {
      const cen = (p) => [p.verts.reduce((s, v) => s + v[0], 0) / 4, p.verts.reduce((s, v) => s + v[1], 0) / 4];
      return Math.hypot(cen(a)[0] - aPlate[0], cen(a)[1] - aPlate[1]) - Math.hypot(cen(b)[0] - aPlate[0], cen(b)[1] - aPlate[1]);
    })[0];
  if (sq && !keys.has(sq.key)) {
    const r = await call("placeBuildPiece", { kind: "square", verts: sq.verts }, token);
    if (r.status === 200) keys.add(sq.key);
  }
  if (sq) {
    const sqE = edgesOf(sq.verts);
    const farCorners = [sqE[2][0], sqE[2][1]];
    const nearPlates = candidatesNear(farCorners[0]).concat(candidatesNear(farCorners[1]));
    for (const fc of farCorners) {
      const tri = nearPlates.find(c => c.kind === "triangle" && !keys.has(c.key)
        && c.verts.some(v => edgeKeyOf(v, v) === edgeKeyOf(fc, fc)));
      if (tri) { const r = await call("placeBuildPiece", { kind: "triangle", verts: tri.verts }, token); if (r.status === 200) keys.add(tri.key); }
    }
    const walledNow = new Set((await servedPieces()).filter(p => p.kind === "wall" || p.kind === "door").map(p => edgeKeyOf(p.verts[0], p.verts[1])));
    const wedgeEdge = edgesOf(hexPieces.find(p => p.kind === "triangle" && p.verts.some(v => edgeKeyOf(v, v) === edgeKeyOf(centre, centre))).verts)[1];
    if (!walledNow.has(edgeKeyOf(wedgeEdge[0], wedgeEdge[1]))) await call("placeBuildPiece", { kind: "wall", verts: wedgeEdge }, token);
    const farE = edgesOf(sq.verts)[2];
    if (!walledNow.has(edgeKeyOf(farE[0], farE[1]))) await call("placeBuildPiece", { kind: "door", verts: farE }, token);
  }
  return anchorTile;
}

/* ── the compound around the Tender, for the face ──────────── */
console.log("§E (preparation) the compound around the Tender's stand");
land = await callOk("getTerritory", {}, token);
const tenderTile = land.tiles.find(t => t.id === land.tender?.tileId) ?? tileAt(0, 0);
await buildCompoundAt(tenderTile);
// A second compound on open land far from the seed, kept for a
// clean photograph (§S): the seed's own panels crowd its twin.
const westTile = [...land.tiles]
  .filter(t => hexDist(tenderTile, t) >= 3)
  .sort((a, b) => hexDist(tenderTile, b) - hexDist(tenderTile, a))[0] ?? tenderTile;
await buildCompoundAt(westTile);
served = await servedPieces();
ok("§E the compound stands around the Tender's hex (a construction hex of triangles, a square, walls and a door among them)",
  served.length >= 10, `${served.length} pieces`);

/* ── §E THE FACE ───────────────────────────────────────────── */
console.log("§E the face — build mode on the real map");
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:hexbuild]", String(e).slice(0, 200)));
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
await enterTerritory();
await clearOverlays();
const domCounts = () => page.evaluate(() => ({
  floors: document.querySelectorAll(".build-floors polygon").length,
  wallFaces: document.querySelectorAll(".build-walls polygon").length,
}));
const before = await domCounts();
const apiCount = (await servedPieces()).length;
ok("§E the map draws the construction: every served floor is a polygon on the land",
  before.floors === (land.buildPieces ?? []).filter(p => p.kind === "triangle" || p.kind === "square").length && before.floors > 0,
  JSON.stringify({ dom: before, api: apiCount }));
ok("§E the walls stand drawn as raised faces", before.wallFaces >= 2, JSON.stringify(before));
const toggle = await page.$(".buildmode-toggle");
ok("§E build mode's own toggle stands on the map", !!toggle);
await toggle.click();
await sleep(400);
const bar = await page.evaluate(() => {
  const el = document.querySelector(".build-bar");
  return el ? [...el.querySelectorAll(".build-tool")].map(b => b.textContent.trim()) : null;
});
ok("§E the build bar carries its tools: triangle, square, wall, door, take away, done",
  !!bar && ["Triangle", "Square", "Wall", "Door", "Take away", "Done"].every(w => bar.some(b => b.includes(w))),
  JSON.stringify(bar));
ok("§E build mode raises its own click scaffolding over the map",
  await page.evaluate(() => !!document.querySelector("[data-build-capture]")));
// Lay by tap: a square, then a triangle, on open land near the
// Tender. Points are LAND coordinates, carried to the screen
// through the land's own transform — no assumption about how
// the viewBox sits inside its element. The map's rails (the
// door button, the tools) cover parts of the land at this
// window size, so a tap point is only honest when the build
// scaffolding itself is what would receive it: the drive asks
// the page, point by point, and takes the first the
// scaffolding truly owns.
const landClient = (lx, ly) => page.evaluate((x, y) => {
  const g = document.querySelector(".land-cam");
  const p = new DOMPoint(x, y).matrixTransform(g.getScreenCTM());
  const el = document.elementFromPoint(p.x, p.y);
  return { x: p.x, y: p.y, onScaffold: !!el && el.hasAttribute && el.hasAttribute("data-build-capture") };
}, lx, ly);
const clickLand = async (lx, ly) => {
  const pt = await landClient(lx, ly);
  await page.mouse.click(pt.x, pt.y);
  await sleep(700);
  return pt;
};
const tenderLand = await page.evaluate((q, r) => {
  const k = 54 / 796;
  return { x: 250 + q * 1292 * k + r * 0, y: 170 + q * 470 * k + r * 948 * k };
}, tenderTile.q, tenderTile.r);
const findBuildClick = async (offsets) => {
  for (const [dx, dy] of offsets) {
    const pt = await landClient(tenderLand.x + dx, tenderLand.y + dy);
    if (pt.onScaffold) return pt;
  }
  return null;
};
// The compound, photographed at the map's angle. A drag on the
// scaffolding pans the land (build mode keeps the land's own
// drag), drawing the compound toward the middle of the frame.
{
  const c0 = await landClient(tenderLand.x, tenderLand.y);
  if (c0.onScaffold) {
    await page.mouse.move(c0.x, c0.y);
    await page.mouse.down();
    await page.mouse.move(c0.x - 170, c0.y - 30, { steps: 12 });
    await page.mouse.up();
    await sleep(400);
  }
}
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: join(SHOTS, "01-compound.png") });
const svgBox = await page.evaluate(() => {
  const r = document.querySelector(".territory-svg")?.getBoundingClientRect();
  return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
});
if (svgBox) await page.screenshot({ path: join(SHOTS, "02-compound-map.png"), clip: svgBox });
const floorsBefore = (await domCounts()).floors;
await page.evaluate(() => { [...document.querySelectorAll(".build-tool")].find(b => b.textContent.includes("Square"))?.click(); });
const sqClick = await findBuildClick([[130, 35], [-150, -20], [60, 110], [-60, 110], [170, -40], [-190, 60]]);
ok("§E open land the scaffolding owns stands near the Tender (for the square tap)", !!sqClick);
if (sqClick) { await page.mouse.click(sqClick.x, sqClick.y); await sleep(700); }
const afterSquare = await domCounts();
ok("§E a tap with the square in hand lays a square foundation (the map and the ledger agree)",
  afterSquare.floors === floorsBefore + 1 && (await servedPieces()).some(p => p.kind === "square"),
  JSON.stringify({ before: floorsBefore, after: afterSquare.floors }));
await page.evaluate(() => { [...document.querySelectorAll(".build-tool")].find(b => b.textContent.includes("Triangle"))?.click(); });
const triClick = await findBuildClick([[-130, 35], [150, -20], [-60, -110], [60, -110], [-170, -40], [190, 60]]);
ok("§E open land the scaffolding owns stands near the Tender (for the triangle tap)", !!triClick);
if (triClick) { await page.mouse.click(triClick.x, triClick.y); await sleep(700); }
const afterTri = await domCounts();
ok("§E a tap with the triangle in hand lays a triangle floor",
  afterTri.floors === afterSquare.floors + 1, JSON.stringify({ sq: afterSquare.floors, tri: afterTri.floors }));
// A wall by tap, on the new square's own edge — the edge chosen
// from the ledger (a standing floor edge carrying no wall yet),
// its midpoint carried to the screen through the land's own
// transform.
await page.evaluate(() => { [...document.querySelectorAll(".build-tool")].find(b => b.textContent.includes("Wall") && !b.textContent.includes("Door"))?.click(); });
const servedNow = await servedPieces();
const uiSquare = [...servedNow].reverse().find(p => p.kind === "square");
const walledKeys = new Set(servedNow.filter(p => p.kind === "wall" || p.kind === "door").map(p => edgeKeyOf(p.verts[0], p.verts[1])));
const freeEdge = edgesOf(uiSquare.verts).find(e => !walledKeys.has(edgeKeyOf(e[0], e[1])));
const freeEdgeAx = freeEdge.map(v => plateToAxial(v));
const edgeLand = freeEdgeAx.map(([q, r]) => {
  const k = 54 / 796;
  return [250 + q * 1292 * k, 170 + q * 470 * k + r * 948 * k];
});
let edgeClick = null;
for (const t of [0.5, 0.3, 0.7, 0.15, 0.85]) {
  const pt = await landClient(
    edgeLand[0][0] + (edgeLand[1][0] - edgeLand[0][0]) * t,
    edgeLand[0][1] + (edgeLand[1][1] - edgeLand[0][1]) * t);
  if (pt.onScaffold) { edgeClick = pt; break; }
}
ok("§E a point on the square's free edge lies where the scaffolding can be tapped", !!edgeClick);
const wallsBefore = (await domCounts()).wallFaces;
if (edgeClick) { await page.mouse.click(edgeClick.x, edgeClick.y); await sleep(700); }
const afterWall = await domCounts();
ok("§E a tap with the wall in hand, on the square's edge, raises the wall there",
  afterWall.wallFaces > wallsBefore, JSON.stringify({ before: wallsBefore, after: afterWall.wallFaces }));
await page.screenshot({ path: join(SHOTS, "03-built-by-taps.png") });

/* ── §T THE TENDER'S STRIDE ────────────────────────────────── */
console.log("§T the Tender's stride — stopped by the wall, freed by its taking-away");
await page.evaluate(() => { [...document.querySelectorAll(".build-tool")].find(b => b.textContent.trim() === "Done")?.click(); });
await sleep(300);
land = await callOk("getTerritory", {}, token);
const tTileNow = land.tiles.find(t => t.id === land.tender?.tileId) ?? tenderTile;
const landToClient = async (q, r) => page.evaluate((qq, rr) => {
  const k = 54 / 796;
  const px = qq * 1292 * k + rr * 0, py = qq * 470 * k + rr * 948 * k;
  const g = document.querySelector(".land-cam");
  const pt = new DOMPoint(250 + px, 170 + py).matrixTransform(g.getScreenCTM());
  return { x: pt.x, y: pt.y };
}, q, r);
// The run must be one the hand can truly tap: its far hex's
// centre must fall on the map itself, not under the rails.
let runT = null;
for (const [dq, dr] of DIRS) {
  const m = tileAt(tTileNow.q + dq, tTileNow.r + dr), b = tileAt(tTileNow.q + 2 * dq, tTileNow.r + 2 * dr);
  if (!m || !b) continue;
  const c = await landToClient(b.q, b.r);
  const tappable = await page.evaluate((x, y) => {
    const el = document.elementFromPoint(x, y);
    return !!el && !!el.closest("svg.territory-svg") && !el.closest("button");
  }, c.x, c.y);
  if (tappable) { runT = { from: tTileNow, mid: m, to: b }; break; }
}
ok("§T a two-step run stands from the Tender's hex, its far hex tappable on the map", !!runT);
if (runT) {
  const acrossT = await wallAcrossRun([runT.from.q, runT.from.r], [runT.to.q, runT.to.r]);
  ok("§T a wall's edge stands across the Tender's road", !!acrossT);
  if (acrossT) {
    const wallPiece = await callOk("placeBuildPiece", { kind: "wall", verts: acrossT.edge }, token);
    await sleep(3200); // the read loop carries the wall onto the map
    const toAxial = (vx, vy) => page.evaluate((x, y) => {
      // viewBox point -> axial, the screenToAxial reckoning
      const size = 54, u = [1292 * size / 796, 470 * size / 796], v = [0, 948 * size / 796];
      const det = u[0] * v[1] - v[0] * u[1];
      const px = x - 250, py = y - 170;
      return { q: (px * v[1] - py * v[0]) / det, r: (u[0] * py - u[1] * px) / det };
    }, vx, vy);
    const pos0 = await page.evaluate(() => window.__tenderJump.pos());
    const ax0 = await toAxial(pos0.x, pos0.y);
    const destClient = await landToClient(runT.to.q, runT.to.r);
    await page.mouse.click(destClient.x, destClient.y);
    await sleep(4500);
    const posA = await page.evaluate(() => window.__tenderJump.pos());
    const [ea, eb] = acrossT.edgeAx;
    const axA = await toAxial(posA.x, posA.y);
    // The witnesses: he ends on the wall's NEAR side (the side
    // he started from — no assumption about the camera), and
    // he never got past the wall along his own road: his
    // remaining distance to the tapped hex's centre is no
    // less than the wall crossing point's own distance to it,
    // less one stride step. (His anchor may honestly read the
    // far hex — this wall stands inside it, just short of its
    // centre; the anchor is not the witness, the wall is.)
    const cross = (p) => (eb[0] - ea[0]) * (p.r - ea[1]) - (eb[1] - ea[1]) * (p.q - ea[0]);
    const startCross = cross(ax0);
    const endCross = cross(axA);
    const vb = ([q, r]) => ({ x: 250 + q * 1292 * (54 / 796), y: 170 + q * 470 * (54 / 796) + r * 948 * (54 / 796) });
    const wA = vb(ea), wB = vb(eb);
    const targetVb = vb([runT.to.q, runT.to.r]);
    const segInt = (p1, p2, p3, p4) => {
      const d1 = { x: p2.x - p1.x, y: p2.y - p1.y }, d2 = { x: p4.x - p3.x, y: p4.y - p3.y };
      const den = d1.x * d2.y - d1.y * d2.x;
      const t = ((p3.x - p1.x) * d2.y - (p3.y - p1.y) * d2.x) / den;
      return { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
    };
    const crossPt = segInt(pos0, targetVb, wA, wB);
    const distEnd = Math.hypot(posA.x - targetVb.x, posA.y - targetVb.y);
    const distCross = Math.hypot(crossPt.x - targetVb.x, crossPt.y - targetVb.y);
    ok("§T walled, the gliding Tender stops at the wall — near side, never past it along his road",
      Math.sign(endCross) === Math.sign(startCross) && distEnd >= distCross - 3.5,
      JSON.stringify({ pos: posA, axial: axA, startCross, endCross, distEnd, distCross }));
    await callOk("removeBuildPiece", { id: wallPiece.piece.id }, token);
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(3200);
    const destClient2 = await landToClient(runT.to.q, runT.to.r);
    await page.mouse.click(destClient2.x, destClient2.y);
    await sleep(5000);
    const anchor = await page.evaluate(() => window.__tenderJump.anchor());
    ok("§T with the wall taken away, the same tap carries him to the far hex (his anchor lands on it)",
      anchor === runT.to.id, `anchor=${anchor} want=${runT.to.id}`);
  }
}

/* ── §F PERSISTENCE ────────────────────────────────────────── */
console.log("§F persistence — the work stands after a reload");
const countBeforeReload = (await servedPieces()).length;
await enterTerritory();
await clearOverlays();
const afterReload = await domCounts();
const apiAfter = (await servedPieces()).length;
ok("§F after a reload, the browser draws the same construction the server holds",
  afterReload.floors === (land.buildPieces ?? []).filter(p => p.kind === "triangle" || p.kind === "square").length
  && apiAfter === countBeforeReload && afterReload.floors > 0,
  JSON.stringify({ dom: afterReload, api: apiAfter, before: countBeforeReload }));
await page.screenshot({ path: join(SHOTS, "04-after-reload.png") });

/* ── §S THE PHOTOGRAPH ─────────────────────────────────────── */
console.log("§S the photograph — the far compound, panned to the middle of the frame");
{
  const tgl = await page.$(".buildmode-toggle");
  if (tgl) { await tgl.click(); await sleep(400); }
  const westLand = await page.evaluate((q, r) => {
    const k = 54 / 796;
    return { x: 250 + q * 1292 * k, y: 170 + q * 470 * k + r * 948 * k };
  }, westTile.q, westTile.r);
  const cur = await landClient(westLand.x, westLand.y);
  const grab = await landClient(tenderLand.x, tenderLand.y);
  const from = grab.onScaffold ? grab : cur;
  if (from) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + (700 - cur.x), from.y + (430 - cur.y), { steps: 24 });
    await page.mouse.up();
    await sleep(500);
  }
  await page.screenshot({ path: join(SHOTS, "05-compound-west.png") });
  await page.screenshot({ path: join(SHOTS, "06-compound-west-clip.png"), clip: { x: 130, y: 40, width: 1140, height: 780 } });
  const westFloors = await page.evaluate(() => document.querySelectorAll(".build-floors polygon").length);
  ok("§S the far compound stands drawn for its photograph", westFloors > 0, `${westFloors} floor polygons`);
}

await browser.close();
console.log(`\ndrive-hex-build: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
