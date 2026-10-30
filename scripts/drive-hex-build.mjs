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
//   §X FREE PLACEMENT + THE FOUNDATION CALCULATION (Nigel,
//      2026-10-26): a floor at a seat that is NOT on the tiling
//      stands there; a neighbour laid flush on its edge shares
//      the full edge; a wall and a door stand on the free
//      floors' edges (the door's gap passing); an overlapping
//      placement refuses in plain words; protection reads the
//      free footprint's own ground (pure → protected, part-
//      cursed → unprotected); a building laid on the old tiling
//      still stands and takes a snapped neighbour; a wall with
//      no floor under its edge refuses (no foundation); and
//      removing a free floor fells the wall it alone founded
//      while the joined neighbour stands.
//   §M THE TWO MODES, BY TAP, in a real browser: the pieces
//      menu's placing-mode switch stands (the switch lived in
//      the build bar until the bar was struck, 2026-10-28 — the
//      menu is its home now, and since the Stone Cast that home
//      is the ability tab); in FREE PLACE a floor lands
//      exactly where the tap puts it — even within snap's reach
//      of a standing edge, it does NOT snap; back in SNAP mode
//      the same reach joins a floor flush to its neighbour.
//   §D THE DARK'S WALK: a wanderer walking a straight line to
//      pure ground is stopped by a build wall across its path —
//      and walks on once the wall is taken away.
//   §C THE MARCH ROAD: an Awokin's road bends around a build
//      wall (no step of the stored road crosses it) where the
//      unwalled road ran straight.
//   §G the door's gap, in the shipped geometry: a step threaded
//      through the middle two-fifths crosses no collision
//      segment; the same step at the wall's standing part does.
//   §E THE FACE, in a real browser: the construction's door
//      is the building ability tab on a Stone Awoken's wheel
//      (the toggle and bar struck whole, 2026-10-28 — Nigel:
//      "we allready ahda build menue"; the tab since the Stone
//      Cast, same day — the free-standing pieces seat in the
//      building panel is closed, one door, and the door is the
//      Awoken; since the Abilities redesign, 2026-10-29, the
//      tab opens on the registry's list and Building's row is
//      tapped before the menu seats); its pieces menu carries the piece choices as
//      buttons made from the pieces' own drawn faces; taps on
//      the map's own scaffolding lay a square and a triangle
//      and raise a wall on the square's edge; the compound around
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
//   §P EVERY WALL PERSPECTIVE (Nigel's correction, 2026-10-26):
//      two fresh construction hexes are ringed — one with six
//      WALLS, one with six DOORS, one piece on every outer edge —
//      and every ring piece is read back off the real map: the
//      drawing that stands on the edge (its cut PNG's name), the
//      stance the node names (data-perspective), and the seat's
//      translate point and turn, checked against the seating law
//      reckoned here from the drawings' own measured base lines
//      (the south-end law: a slanted face's lower base end meets
//      the edge's southern end; a level face stands upright with
//      its left toward the west). Screenshots ring by ring.
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

/* THE STONE CAST, RESTATED (2026-10-28): every cast in this
 * drive names its LEAD BUILDER — a fielded Awoken holding 3
 * Rock, "Build Mason" — because the cast's one door is now
 * that Awoken's building ability tab (Nigel's rulings of
 * 2026-10-27 20:23–21:00), and the server's gate refuses a
 * cast with no qualified lead. Pieces laid here BEGIN RISING;
 * they do not appear. Where a witness below is the law of
 * STANDING work (above all the removal cascade, which fells
 * standing pieces and only marks rising ones to settle), the
 * drive walks the rise's clock forward first (finishRises) —
 * the same time-travel the battle drives walk with their
 * watermarks; drive-stone-cast proves the rise itself. */
const LEAD = (() => {
  const insA = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
  const parts = [["Mason Body", "body", 3, 3], ["Mason Arms", "arms", 3, 3], ["Mason Crown", "head", 3, 3]]
    .map(([n, c, p, t]) => ({ id: Number(insA.run(n, c, p, t, "stone", `hexbuild-mason/${n}.png`, now).lastInsertRowid), name: n, category: c, power: p, toughness: t, element: "stone" }));
  const composition = JSON.stringify(parts.map(p => ({ source_id: `db:${p.id}`, name: p.name, category: p.category, rarity: "common", power: p.power, toughness: p.toughness, element: p.element })));
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES ('Build Mason', 'Build Mason', 'hexbuild-mason/mason.png', ?, 'tender', 'Build Tender', ?, ?)").run(composition, ownerKey, now).lastInsertRowid);
})();
// The mason's standing, as a pair of hands the sections use:
// §D walks a dark across an empty land (as this drive always
// did — a fielded Awoken on its road makes it stop and fight),
// so the mason steps off the field for that walk and back on
// after; and before the browser sections he moves off the seed
// tile, where the seed company stands with him — two figures
// on one heart cannot be told apart by a tap, and the ability
// tab's door is his wheel.
const fieldMason = (tile) => db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
  VALUES (?, ?, ?, ?, ?, 'defense', 0, 99, ?, ?, NULL, NULL, 0)`).run(ownerKey, LEAD, tile.id, now, now, tile.q, tile.r);
const unfieldMason = () => db.prepare("DELETE FROM field_placements WHERE awakened_id = ?").run(LEAD);
fieldMason(tileAt(0, 0));

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
// Walk every standing rise to its top (see the Stone Cast note
// above the mason's seeding): backdate the rises' clocks; the
// server's own settle reckons them standing on the next read.
async function finishRises() {
  db.prepare("UPDATE build_pieces SET rise_updated_at = ? WHERE owner_key = ?").run(Date.now() - 30 * 60000, ownerKey);
  return servedPieces();
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
const layW = await callOk("placeBuildPiece", { leadId: LEAD, kind: "triangle", verts: wedge0.verts }, token);
ok("§B a triangle floor (a wedge of the origin hex) is laid", layW.ok === true && layW.piece.kind === "triangle");
const wantFoot = wedge0.verts.map(v => plateToAxial(v));
ok("§B its footprint is the piece's own polygon in AXIAL map coordinates (derived server-side through the slant)",
  JSON.stringify(layW.piece.footprint) === JSON.stringify(wantFoot),
  JSON.stringify(layW.piece.footprint));
const layS = await callOk("placeBuildPiece", { leadId: LEAD, kind: "square", verts: square0.verts }, token);
ok("§B a square foundation is laid on the hex's edge (its footprint crosses the hex border — no hex-lock)", layS.ok === true && layS.piece.kind === "square");
const layT = await callOk("placeBuildPiece", { leadId: LEAD, kind: "triangle", verts: shoulder1.verts }, token);
ok("§B a shoulder triangle brokers the seam beside the square", layT.ok === true);
const dup = await call("placeBuildPiece", { leadId: LEAD, kind: "square", verts: square0.verts }, token);
ok("§B the same piece twice refuses", dup.status >= 400, `status ${dup.status}`);
const bogus = await call("placeBuildPiece", { leadId: LEAD, kind: "triangle", verts: [[0, 0], [2, 0], [1, 1]] }, token);
ok("§B an invented shape (no tiling piece) refuses — the server re-derives, never trusts", bogus.status >= 400, `status ${bogus.status}`);
const stray = await call("placeBuildPiece", { leadId: LEAD, kind: "wall", verts: [[9, 9], [10, 9]] }, token);
ok("§B a wall on no floor's edge refuses", stray.status >= 400, `status ${stray.status}`);
// A wall on the square's FAR edge — carried by the square alone.
const sqEdges = edgesOf(square0.verts);
const farEdge = sqEdges[2];
const layWall = await callOk("placeBuildPiece", { leadId: LEAD, kind: "wall", verts: farEdge }, token);
ok("§B a wall stands on the square's far edge", layWall.ok === true && layWall.piece.kind === "wall");
const wall2 = await call("placeBuildPiece", { leadId: LEAD, kind: "door", verts: farEdge }, token);
ok("§B a second wall on the same edge refuses (one wall per edge)", wall2.status >= 400, `status ${wall2.status}`);
let served = await servedPieces();
ok("§B the read serves all four pieces with their footprints",
  served.length === 4 && served.every(p => Array.isArray(p.footprint) && p.footprint.length >= 2), `${served.length} pieces`);
ok("§B every served protection flag matches the ground beneath the footprint, re-reckoned here from the served land",
  served.every(p => p.protected === expectedProtection(p.footprint, land.tiles)),
  JSON.stringify(served.map(p => [p.kind, p.protected])));
// The cascade below is the law of STANDING work — the rises
// are walked to their tops first (the Stone Cast note above).
await finishRises();
const rmS = await callOk("removeBuildPiece", { id: layS.piece.id }, token);
ok("§B removing the square takes down the wall it alone carried (both ids named)",
  rmS.removed.includes(layS.piece.id) && rmS.removed.includes(layWall.piece.id) && rmS.removed.length === 2,
  JSON.stringify(rmS.removed));
served = await servedPieces();
ok("§B after the taking-away, the wedge and the shoulder stand; the square and its wall are gone",
  served.length === 2 && served.every(p => p.kind === "triangle"), `${served.length} pieces`);

/* ── §X FREE PLACEMENT + THE FOUNDATION CALCULATION ──────── */
console.log("§X free placement — floors land where the tap puts them; the foundation calculation judges the structure");
const { freePieceAt, pieceOnEdge, polygonsOverlap, matchCandidate } = GEO;
const centroidOf = (verts) => [verts.reduce((s, v) => s + v[0], 0) / verts.length, verts.reduce((s, v) => s + v[1], 0) / verts.length];
const nearPt2 = (a, b, tol) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;
const sharedEdgeKeys = (v1, v2) => {
  const s2 = new Set(edgesOf(v2).map(e => edgeKeyOf(e[0], e[1])));
  return edgesOf(v1).map(e => edgeKeyOf(e[0], e[1])).filter(k => s2.has(k));
};
// A free seat for a floor of `kind`: its centre over a tile's
// plate point nudged off every lattice line, the footprint's
// protection reading as asked, clear of everything standing,
// and provably NOT a tiling piece.
async function freeSeat(kind, wantProtected) {
  const floors = (await servedPieces()).filter(p => p.kind === "triangle" || p.kind === "square");
  for (const t of land.tiles) {
    if (wantProtected && t.cursed) continue;
    if (!wantProtected && !t.cursed) continue;
    const c = axialToPlate(t.q, t.r);
    for (const off of [[0.37, 0.41], [-0.43, 0.29], [0.31, -0.47], [-0.29, -0.39], [0.53, 0.13]]) {
      const seat = [c[0] + off[0], c[1] + off[1]];
      const verts = freePieceAt(kind, seat);
      if (floors.some(p => polygonsOverlap(verts, p.verts))) continue;
      const fp = verts.map(v => plateToAxial(v));
      if (!footprintHexes(fp).some(h => land.tiles.some(tt => tt.q === h.q && tt.r === h.r))) continue;
      if (expectedProtection(fp, land.tiles) !== wantProtected) continue;
      if (matchCandidate(kind, verts)) continue;
      return { seat, verts };
    }
  }
  return null;
}
// Fixture ground: a purified patch on open land, so a free
// footprint CAN lie wholly over pure ground (the sown land is
// mostly curse). The server's derivation still judges every
// flag from these tiles, and §B's re-reckoning stands over it.
{
  const disc = [[2, 0], [2, -1], [1, 0], [1, 1]];
  const un = db.prepare("UPDATE territory_tiles SET cursed = 0 WHERE owner_key = ? AND q = ? AND r = ?");
  for (const [q, r] of disc) un.run(ownerKey, q, r);
  land = await callOk("getTerritory", {}, token);
}
const seatA = await freeSeat("triangle", true);
ok("§X a seat stands open: off the tiling, over pure ground, clear of the standing work", !!seatA);
let freeTri = null, snapTri = null, wallXId = null, doorXId = null, sqXId = null, unpXId = null, joinedXId = null;
if (seatA) {
  const lay = await callOk("placeBuildPiece", { leadId: LEAD, kind: "triangle", verts: seatA.verts }, token);
  freeTri = lay.piece;
  ok("§X (a) a triangle floor placed at a spot that is NOT on the old tiling stands there",
    lay.ok === true && nearPt2(centroidOf(lay.piece.verts), seatA.seat, 0.01)
    && matchCandidate("triangle", lay.piece.verts) === null,
    JSON.stringify(lay.piece?.verts));
  ok("§X (e) its protection reads the ground beneath the free footprint: pure ground, protected",
    lay.piece.protected === true && lay.piece.protected === expectedProtection(lay.piece.footprint, land.tiles));
  // (b) the join: a second triangle flush on the first's edge.
  const e0 = edgesOf(seatA.verts)[0];
  const snapVerts = pieceOnEdge("triangle", e0[0], e0[1], seatA.seat);
  const laySnap = await callOk("placeBuildPiece", { leadId: LEAD, kind: "triangle", verts: snapVerts }, token);
  snapTri = laySnap.piece;
  ok("§X (b) a second floor laid flush on the free floor's edge shares the FULL edge — no gap, no overlap",
    sharedEdgeKeys(laySnap.piece.verts, seatA.verts).length === 1
    && !polygonsOverlap(laySnap.piece.verts, seatA.verts));
  // (c) a wall on the free floor's edge; a door on the joined
  // floor's edge, its gap passing.
  const layWallX = await callOk("placeBuildPiece", { leadId: LEAD, kind: "wall", verts: edgesOf(seatA.verts)[1] }, token);
  wallXId = layWallX.piece.id;
  ok("§X (c) a wall stands on the free floor's edge", layWallX.ok === true && layWallX.piece.kind === "wall");
  const sharedK = sharedEdgeKeys(laySnap.piece.verts, seatA.verts)[0];
  const doorEdge = edgesOf(laySnap.piece.verts).find(e => edgeKeyOf(e[0], e[1]) !== sharedK);
  const layDoorX = await callOk("placeBuildPiece", { leadId: LEAD, kind: "door", verts: doorEdge }, token);
  doorXId = layDoorX.piece.id;
  const dSegs = collisionSegments("door", layDoorX.piece.footprint);
  const [da, db] = layDoorX.piece.footprint;
  const dMid = [(da[0] + db[0]) / 2, (da[1] + db[1]) / 2];
  const throughMid = [[dMid[0], dMid[1] - 0.4], [dMid[0], dMid[1] + 0.4]];
  const atPart = [da[0] + (db[0] - da[0]) * 0.15, da[1] + (db[1] - da[1]) * 0.15];
  const throughPart = [[atPart[0], atPart[1] - 0.4], [atPart[0], atPart[1] + 0.4]];
  ok("§X (c) a doorway stands on the joined floor's edge — its open middle crosses no collision segment",
    layDoorX.ok === true && !dSegs.some(([s, t]) => segmentsCrossProper(throughMid[0], throughMid[1], s, t)));
  ok("§X (c) the same step at the doorway's standing part IS barred",
    dSegs.some(([s, t]) => segmentsCrossProper(throughPart[0], throughPart[1], s, t)));
  // (d) an overlapping placement refuses, in plain words.
  const overlapVerts = seatA.verts.map(v => [v[0] + 0.2, v[1] + 0.1]);
  const ov = await call("placeBuildPiece", { leadId: LEAD, kind: "triangle", verts: overlapVerts }, token);
  ok("§X (d) a floor laid across a standing piece refuses — and the refusal speaks of overlap",
    ov.status >= 400 && JSON.stringify(ov.raw).includes("overlap"),
    `status ${ov.status} ${JSON.stringify(ov.raw).slice(0, 160)}`);
  // A turned shape is no kit piece, free seat or not.
  const turned = await call("placeBuildPiece", { leadId: LEAD, kind: "triangle", verts: freePieceAt("triangle", seatA.seat)
    .map(v => { const dx = v[0] - seatA.seat[0], dy = v[1] - seatA.seat[1]; const c15 = Math.cos(0.26), s15 = Math.sin(0.26); return [seatA.seat[0] + dx * c15 - dy * s15, seatA.seat[1] + dx * s15 + dy * c15]; }) }, token);
  ok("§X a floor turned off the kit's grain refuses (no arbitrary angles, free or not)",
    turned.status >= 400, `status ${turned.status}`);
}
// A square foundation lands free too.
const seatSq = await freeSeat("square", true);
ok("§X a seat for a free square stands open", !!seatSq);
if (seatSq) {
  const laySq = await callOk("placeBuildPiece", { leadId: LEAD, kind: "square", verts: seatSq.verts }, token);
  sqXId = laySq.piece.id;
  ok("§X a square foundation placed off the tiling stands at the tap's own seat",
    laySq.ok === true && nearPt2(centroidOf(laySq.piece.verts), seatSq.seat, 0.01)
    && matchCandidate("square", laySq.piece.verts) === null);
}
// (e) the unprotected reading over part-cursed ground.
const seatU = await freeSeat("triangle", false);
ok("§X a seat over cursed ground stands open for the unprotected reading", !!seatU);
if (seatU) {
  const layU = await callOk("placeBuildPiece", { leadId: LEAD, kind: "triangle", verts: seatU.verts }, token);
  unpXId = layU.piece.id;
  ok("§X (e) a free floor over part-cursed ground stands UNPROTECTED — protection reads its own footprint's ground",
    layU.piece.protected === false && layU.piece.protected === expectedProtection(layU.piece.footprint, land.tiles));
}
// The foundation calculation at the door.
const noFloor = await call("placeBuildPiece", { leadId: LEAD, kind: "wall", verts: [[7.3, 8.1], [8.3, 8.1]] }, token);
ok("§X the foundation calculation: a wall with no floor under its edge refuses — it has no foundation",
  noFloor.status >= 400, `status ${noFloor.status}`);
// (f) a building laid on the old tiling takes a snapped neighbour.
{
  const floorsNow = (await servedPieces()).filter(p => p.kind === "triangle" || p.kind === "square");
  const cnt = new Map();
  for (const p of floorsNow) for (const e of edgesOf(p.verts)) { const k = edgeKeyOf(e[0], e[1]); cnt.set(k, (cnt.get(k) ?? 0) + 1); }
  let joined = null;
  for (const p of floorsNow) {
    if (!matchCandidate(p.kind, p.verts)) continue; // only the tiling-laid buildings of old
    for (const e of edgesOf(p.verts)) {
      if ((cnt.get(edgeKeyOf(e[0], e[1])) ?? 0) !== 1) continue;
      const candVerts = pieceOnEdge("triangle", e[0], e[1], centroidOf(p.verts));
      if (floorsNow.some(q => polygonsOverlap(candVerts, q.verts))) continue;
      const r = await call("placeBuildPiece", { leadId: LEAD, kind: "triangle", verts: candVerts }, token);
      if (r.status === 200) { joined = { piece: r.body.piece, host: p }; break; }
    }
    if (joined) break;
  }
  ok("§X (f) a building laid on the old tiling still stands and takes a snapped neighbour on its free edge",
    !!joined && sharedEdgeKeys(joined.piece.verts, joined.host.verts).length === 1,
    joined ? "" : "no tiling host with a clear free edge was found");
  joinedXId = joined?.piece.id ?? null;
}
// The foundation calculation on the taking-away.
if (freeTri && snapTri && wallXId) {
  await finishRises(); // the cascade below is standing-work law (the Stone Cast note above)
  const rmFree = await callOk("removeBuildPiece", { id: freeTri.id }, token);
  const after = await servedPieces();
  ok("§X the foundation calculation on removal: the free floor's wall comes down with it; the joined neighbour stands",
    rmFree.removed.includes(freeTri.id) && rmFree.removed.includes(wallXId)
    && after.some(p => p.id === snapTri.id) && !after.some(p => p.id === wallXId),
    JSON.stringify(rmFree.removed));
}
// §X tidies its own ground: the cluster comes down (the door
// falls with its floor, by the same reckoning), the purified
// fixture patch returns to curse, and the land is left as §B
// left it — the later sections walk their own landscapes.
{
  if (snapTri) {
    const rmSnap = await callOk("removeBuildPiece", { id: snapTri.id }, token);
    ok("§X taking the joined floor away fells its doorway too — the reckoning names both",
      rmSnap.removed.includes(snapTri.id) && (doorXId === null || rmSnap.removed.includes(doorXId)),
      JSON.stringify(rmSnap.removed));
  }
  for (const id of [joinedXId, sqXId, unpXId]) {
    if (id) await callOk("removeBuildPiece", { id }, token);
  }
  const curse = db.prepare("UPDATE territory_tiles SET cursed = 1 WHERE owner_key = ? AND q = ? AND r = ?");
  for (const [q, r] of [[2, 0], [2, -1], [1, 0], [1, 1]]) curse.run(ownerKey, q, r);
  const left = await servedPieces();
  ok("§X the land is left as §B left it (the wedge and the shoulder stand; the §X work is cleared)",
    left.length === 2 && left.every(p => p.kind === "triangle"), `${left.length} pieces`);
}

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
    const r = await call("placeBuildPiece", { leadId: LEAD, kind: c.kind, verts: c.verts }, token);
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
    const w = await callOk("placeBuildPiece", { leadId: LEAD, kind: "wall", verts: across.edge }, token);
    // The walk itself runs on an empty land, as it always did:
    // the mason steps off (his wall, already cast, holds its
    // rise with no crew to raise it — the Stone Cast's law).
    unfieldMason();
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
  fieldMason(tileAt(0, 0)); // the mason steps back onto the field
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
    await callOk("placeBuildPiece", { leadId: LEAD, kind: "wall", verts: across.edge }, token);
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
    const r = await call("placeBuildPiece", { leadId: LEAD, kind: p.kind, verts: p.verts }, token);
    if (r.status === 200) keys.add(p.key);
  }
  const sq = hexPieces.filter(p => p.kind === "square")
    .sort((a, b) => {
      const cen = (p) => [p.verts.reduce((s, v) => s + v[0], 0) / 4, p.verts.reduce((s, v) => s + v[1], 0) / 4];
      return Math.hypot(cen(a)[0] - aPlate[0], cen(a)[1] - aPlate[1]) - Math.hypot(cen(b)[0] - aPlate[0], cen(b)[1] - aPlate[1]);
    })[0];
  if (sq && !keys.has(sq.key)) {
    const r = await call("placeBuildPiece", { leadId: LEAD, kind: "square", verts: sq.verts }, token);
    if (r.status === 200) keys.add(sq.key);
  }
  if (sq) {
    const sqE = edgesOf(sq.verts);
    const farCorners = [sqE[2][0], sqE[2][1]];
    const nearPlates = candidatesNear(farCorners[0]).concat(candidatesNear(farCorners[1]));
    for (const fc of farCorners) {
      const tri = nearPlates.find(c => c.kind === "triangle" && !keys.has(c.key)
        && c.verts.some(v => edgeKeyOf(v, v) === edgeKeyOf(fc, fc)));
      if (tri) { const r = await call("placeBuildPiece", { leadId: LEAD, kind: "triangle", verts: tri.verts }, token); if (r.status === 200) keys.add(tri.key); }
    }
    const walledNow = new Set((await servedPieces()).filter(p => p.kind === "wall" || p.kind === "door").map(p => edgeKeyOf(p.verts[0], p.verts[1])));
    const wedgeEdge = edgesOf(hexPieces.find(p => p.kind === "triangle" && p.verts.some(v => edgeKeyOf(v, v) === edgeKeyOf(centre, centre))).verts)[1];
    if (!walledNow.has(edgeKeyOf(wedgeEdge[0], wedgeEdge[1]))) await call("placeBuildPiece", { leadId: LEAD, kind: "wall", verts: wedgeEdge }, token);
    const farE = edgesOf(sq.verts)[2];
    if (!walledNow.has(edgeKeyOf(farE[0], farE[1]))) await call("placeBuildPiece", { leadId: LEAD, kind: "door", verts: farE }, token);
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
// The mason moves off the seed tile for the browser sections,
// to a tile NO ONE stands on: the seed company stands on the
// seed with him (and its second stands on the (1,0) heart —
// proven by the debug taps: two figures on one heart cannot
// be told apart by a tap, the topmost takes every press), and
// the ability tab's door is his wheel (see the seeding note).
land = await callOk("getTerritory", {}, token);
const occupiedTiles = new Set((land.placements ?? []).map(p => p.tileId));
const masonTile = land.tiles.find(t => Math.max(Math.abs(t.q), Math.abs(t.r), Math.abs(t.q + t.r)) === 1 && !occupiedTiles.has(t.id))
  ?? land.tiles.find(t => !occupiedTiles.has(t.id));
db.prepare("UPDATE field_placements SET tile_id = ?, pos_q = ?, pos_r = ? WHERE awakened_id = ?")
  .run(masonTile.id, masonTile.q, masonTile.r, LEAD);
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
// THE DOOR, RESTATED AGAIN (2026-10-28, THE STONE CAST —
// Nigel's rulings of 2026-10-27 20:23–21:00): the construction's
// one door is the BUILDING ABILITY TAB on a Stone Awoken's
// wheel. Nigel struck the construction toggle and the build
// bar whole ("i also never asked for the triangle and square
// button,, we allready ahda build menue..."), then ruled the
// pieces be reached through the fielded Awoken holding at
// least 2 Rock ("give it one door and but keep the pieces menu
// but use my artwork for the pieces ui") — so the pieces menu
// stands in the ability tab on the mason's wheel, and the
// free-standing pieces seat in the building panel is closed.
// Every door interaction in this drive walks that road: tap
// the mason's figure, tap the wheel's Abilities door, pick in
// the tab. The tab stays open while the piece is laid (the
// map's presses beside it belong to the laying).
// RESTATED FOR THE ABILITIES SECTION (Nigel, 2026-10-29):
// the tab now opens on the registry's LIST, and the pieces
// menu seats only once Building's row is tapped and its cast
// begun — every road that reads the menu walks that list step
// first (beginBuildingCast below), and §E speaks the list
// aloud before it taps the row, as §S8 does in
// drive-stone-cast.
const openAbilityTab = async () => {
  const open = await page.evaluate(() => !!document.querySelector(".ability-side-panel"));
  if (open) return;
  // On a heavy first entry the figures can take a while to
  // stand on the land — wait for them before sweeping.
  await page.waitForFunction(() => document.querySelectorAll("g.field-drifter, g.field-patroller").length > 0, { timeout: 25000 }).catch(() => {});
  for (let sweep = 0; sweep < 3; sweep++) {
    // The return report's ceremony card can land over the map
    // a breath after entry and swallow every tap (proven by
    // probe: elementFromPoint at a figure's heart returned the
    // overlay) — clear overlays inside the sweep, not only
    // before it.
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

      if (s.wheel && s.caption.includes("Build Mason")) {
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
// THE LIST STEP (the Abilities redesign, Nigel 2026-10-29):
// with the tab standing on the registry's list, tap
// Building's row to begin its cast — only then does the
// pieces menu seat. A menu already seated (the cast already
// begun) is left as it stands.
const beginBuildingCast = async () => {
  const seated = await page.evaluate(() => !!document.querySelector(".ability-side-panel .pieces-menu"));
  if (seated) return;
  await page.evaluate(() => { document.querySelector('.ability-side-panel .ability-entry[data-ability="building"]')?.click(); });
  await sleep(800);
};
const pickPiece = async (tool) => {
  await openAbilityTab();
  await beginBuildingCast();
  await page.evaluate((t) => { document.querySelector(`.ability-side-panel .pieces-menu .piece-choice[data-tool="${t}"]`)?.click(); }, tool);
  await sleep(300);
};
const clickMenuDone = async () => {
  await openAbilityTab();
  await beginBuildingCast();
  await page.evaluate(() => { document.querySelector(".ability-side-panel .pieces-menu .done")?.click(); });
  await sleep(300);
};
const buildDoorStands = () => page.evaluate(() => !!document.querySelector("[data-build-capture]"));
await enterTerritory();
await clearOverlays();
const domCounts = () => page.evaluate(() => ({
  floors: document.querySelectorAll(".build-floors polygon").length,
  // The walls' raised faces: drawn as his cut faces (an <image>
  // per wall) since the faces build (2026-10-26); before that
  // they were placeholder polygons. Count what stands drawn.
  wallFaces: document.querySelectorAll(".build-walls image").length,
  floorFaces: document.querySelectorAll(".build-floors image").length,
}));
const before = await domCounts();
const apiCount = (await servedPieces()).length;
ok("§E the map draws the construction: every served floor is a polygon on the land",
  before.floors === (land.buildPieces ?? []).filter(p => p.kind === "triangle" || p.kind === "square").length && before.floors > 0,
  JSON.stringify({ dom: before, api: apiCount }));
ok("§E the walls stand drawn as raised faces", before.wallFaces >= 2, JSON.stringify(before));
const tilingTris = (land.buildPieces ?? []).filter(p => p.kind === "triangle" && matchCandidate("triangle", p.verts)).length;
ok("§E the tiling-laid triangle floors wear his drawn faces (one seated image per tiling triangle; free-laid floors wear the standing geometry until their faces' turn)",
  before.floorFaces >= tilingTris && tilingTris > 0 && before.floorFaces > 0,
  JSON.stringify({ ...before, tilingTris, allTris: (land.buildPieces ?? []).filter(p => p.kind === "triangle").length }));
ok("§E the struck door is gone: no construction toggle and no build bar stands on the map (struck whole on Nigel's word, 2026-10-27)",
  await page.evaluate(() => !document.querySelector(".buildmode-toggle") && !document.querySelector(".build-bar")));
await openAbilityTab();
// THE ABILITIES SECTION (2026-10-29): the tab opens on the
// registry's LIST — Building's row stands, the pieces menu
// not yet seated; tapping the row begins the cast and seats
// the menu (the same walk §S8 makes in drive-stone-cast).
const listState = await page.evaluate(() => {
  const panel = document.querySelector(".ability-side-panel");
  return {
    tab: !!panel,
    row: !!panel?.querySelector('.ability-entry[data-ability="building"]'),
    rowText: panel?.querySelector('.ability-entry[data-ability="building"]')?.textContent ?? "",
    menu: !!panel?.querySelector(".pieces-menu"),
  };
});
ok("§E the ability tab opens on the registry's list — Building's row stands (2 Rock spoken), the menu not yet seated",
  listState.tab && listState.row && listState.rowText.includes("2 Rock") && !listState.menu, JSON.stringify(listState));
await page.evaluate(() => {
  document.querySelector('.ability-side-panel .ability-entry[data-ability="building"]')?.click();
});
await sleep(800);
const menu = await page.evaluate(() => {
  const el = document.querySelector(".ability-side-panel .pieces-menu");
  if (!el) return null;
  return {
    choices: [...el.querySelectorAll(".piece-choice")].map(b => ({ tool: b.getAttribute("data-tool"), img: !!b.querySelector("img"), label: b.textContent.trim() })),
    modeSwitch: !!el.querySelector(".place-mode"),
  };
});
ok("§E the Stone Awoken's ability tab seats the pieces menu — the construction's one door since the Stone Cast: six piece choices, each a button made from the piece's own drawn face, take away beside them, and the placing switch in the menu",
  !!menu && ["triangle", "square", "wall", "door", "halfwall", "narrow"].every(t => menu.choices.some(c => c.tool === t && c.img))
  && menu.choices.some(c => c.tool === "remove") && menu.modeSwitch,
  JSON.stringify(menu));
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
await pickPiece("square");
ok("§E build mode raises its own click scaffolding over the map", await buildDoorStands());
const sqClick = await findBuildClick([[130, 35], [-150, -20], [60, 110], [-60, 110], [170, -40], [-190, 60]]);
ok("§E open land the scaffolding owns stands near the Tender (for the square tap)", !!sqClick);
if (sqClick) { await page.mouse.click(sqClick.x, sqClick.y); await sleep(700); }
const afterSquare = await domCounts();
ok("§E a tap with the square in hand lays a square foundation (the map and the ledger agree)",
  afterSquare.floors === floorsBefore + 1 && (await servedPieces()).some(p => p.kind === "square"),
  JSON.stringify({ before: floorsBefore, after: afterSquare.floors }));
await pickPiece("triangle");
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
await pickPiece("wall");
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
await clickMenuDone();
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
    const wallPiece = await callOk("placeBuildPiece", { leadId: LEAD, kind: "wall", verts: acrossT.edge }, token);
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

/* ── §P EVERY WALL PERSPECTIVE ─────────────────────────────── */
console.log("§P every wall perspective — two hexes ringed, every stance read off the real map");
// The drawings' base lines, measured off the cut PNGs (the same
// numbers the perspective table in buildingFaces.ts is built on —
// kept here as the independent record the seat is checked against).
const DRAWING_BASES = {
  "wall-long-edge": [3, 440, 344, 440], "doorway-long-edge": [3, 439, 344, 439],
  "wall-slant-down-right": [3, 421, 176, 615], "doorway-slant-down-right": [3, 421, 189, 615],
  "wall-slant-down-left": [23, 615, 199, 419], "doorway-slant-down-left": [15, 630, 195, 425],
};
const landPtOfAxial = (q, r) => { const k = 54 / 796; return { x: 250 + q * 1292 * k, y: 170 + q * 470 * k + r * 948 * k }; };
// The stance a line presents, and the drawing that is its true
// perspective (the perspective table, restated for the proof).
function expectedPerspective(kind, A, B) {
  let line = Math.atan2(B.y - A.y, B.x - A.x) * 180 / Math.PI;
  if (line > 90) line -= 180;
  if (line <= -90) line += 180;
  const door = kind === "door";
  if (Math.abs(line) <= 10) return { stance: "long (back and front edges)", drawing: door ? "doorway-long-edge" : "wall-long-edge", line };
  if (line > 35 && line < 65) return { stance: "slant descending right", drawing: door ? "doorway-slant-down-right" : "wall-slant-down-right", line };
  if (line < -35 && line > -65) return { stance: "slant ascending right", drawing: door ? "doorway-slant-down-left" : "wall-slant-down-left", line };
  return { stance: "?", drawing: "?", line };
}
// The seating law, reckoned from the drawing's own base line: the
// point the base START lands on, and the seat's turn.
function expectedSeat(drawing, A, B) {
  const [x1, y1, x2, y2] = DRAWING_BASES[drawing];
  const baseAng = Math.atan2(y2 - y1, x2 - x1);
  let P, Q;
  if (Math.abs(y2 - y1) > 0.05 * Math.abs(x2 - x1)) {
    const startAtA = (y1 > y2) === (A.y > B.y); // the drawing's lower end meets the southern end
    P = startAtA ? A : B; Q = startAtA ? B : A;
  } else {
    const flip = Math.cos(Math.atan2(B.y - A.y, B.x - A.x) - baseAng) < 0;
    P = flip ? B : A; Q = flip ? A : B;
  }
  let deg = (Math.atan2(Q.y - P.y, Q.x - P.x) - baseAng) * 180 / Math.PI;
  while (deg > 180) deg -= 360;
  while (deg < -180) deg += 360;
  return { P, deg, southEnd: P === A || Q === A ? (A.y > B.y ? A : B) : null, startAt: P };
}
// Two ring anchors: land tiles whose construction hexes can
// take a full ring (see ringable below) and whose centres fall
// inside the entry frame — because the photographs are taken in
// that framing: the drive's later battles raise a Hold panel
// over the land and camera drags under it cannot be trusted, so
// the rings stand where the settled camera already looks
// instead of being dragged to.
// §P works in ONE framing throughout: a fresh entry whose
// camera is waited out until it settles (two readings of the
// Tender's own stand, half a second apart, agreeing). The ring
// anchors are measured in this framing, the rings are placed
// and read in it, and the photographs are taken in it — no
// second entry, no drag (the drive's later battles raise a
// Hold panel the drags cannot be trusted under).
await enterTerritory();
await clearOverlays();
const centreClientP = (lx, ly) => page.evaluate((x, y) => {
  const g = document.querySelector(".land-cam");
  const p = new DOMPoint(x, y).matrixTransform(g.getScreenCTM());
  return { x: p.x, y: p.y };
}, lx, ly);
{
  let prev = null;
  for (let i = 0; i < 20; i++) {
    const c = await centreClientP(tenderLand.x, tenderLand.y);
    if (prev && Math.hypot(c.x - prev.x, c.y - prev.y) < 2) break;
    prev = c;
    await sleep(500);
  }
}
const standingKeys = new Set((await servedPieces()).map(p => p.pieceKey));
const ringCandidates = land.tiles
  .filter(t => t.id !== tenderTile.id && t.id !== westTile.id)
  .map(t => {
    const ap = axialToPlate(t.q, t.r);
    const [fm, fn] = GEO.centerAddress(ap);
    const m = Math.round(fm), n = Math.round(fn);
    const hexPieces = piecesOfHex(m, n);
    // Two tiles can name the SAME construction hex, and two
    // neighbouring hexes share an outer edge — either way the
    // second ring would find its edges already walled. The
    // anchors are therefore chosen as hexes, not tiles: distinct
    // centres, at least two lattice steps apart.
    return { t, hexPieces, m, n, overlap: hexPieces.filter(p => standingKeys.has(p.key)).length, clear: Math.min(hexDist(t, tenderTile), hexDist(t, westTile)), distT: hexDist(t, tenderTile) };
  })
  .sort((a, b) => a.overlap - b.overlap || b.clear - a.clear);
// The pool is measured, not reckoned: each clear candidate's
// hex centre is carried to client coordinates through the land's
// own transform in §P's settled framing, and only candidates
// whose centres fall inside the safe window are eligible.
const landPtOfPlate = (plate) => { const ax = plateToAxial(plate); return landPtOfAxial(ax[0], ax[1]); };
for (const c of ringCandidates) {
  const [fm, fn] = GEO.centerAddress(axialToPlate(c.t.q, c.t.r));
  const centreLand = landPtOfPlate(GEO.hexCenter(Math.round(fm), Math.round(fn)));
  c.client = await centreClientP(centreLand.x, centreLand.y).catch(() => null);
}
const inFrame = (c) => !!c.client && c.client.x > 320 && c.client.x < 1080 && c.client.y > 180 && c.client.y < 720;
// A hex is RINGABLE when every one of its wedges either already
// stands or has clear ground to stand on, and no wall or door
// yet stands on any of its six outer edges. (Neighbouring
// construction hexes SHARE pieces — a compound's shoulders are
// its neighbours' wedges — so a bare piece-overlap count is the
// wrong test; this is the test the ring itself will meet.)
const floorsStanding = (await servedPieces()).filter(p => p.kind === "triangle" || p.kind === "square");
const walledKeysStanding = new Set((await servedPieces()).filter(p => p.kind === "wall" || p.kind === "door").map(p => edgeKeyOf(p.verts[0], p.verts[1])));
function ringable(c) {
  const [fm, fn] = GEO.centerAddress(axialToPlate(c.t.q, c.t.r));
  const centre = GEO.hexCenter(Math.round(fm), Math.round(fn));
  const atCentre = (v) => Math.abs(v[0] - centre[0]) < 1e-9 && Math.abs(v[1] - centre[1]) < 1e-9;
  const wedges = c.hexPieces.filter(p => p.kind === "triangle" && p.verts.some(atCentre));
  if (wedges.length !== 6) return false;
  for (const w of wedges) {
    if (!standingKeys.has(w.key) && floorsStanding.some(f => polygonsOverlap(f.verts, w.verts))) return false;
    const outer = edgesOf(w.verts).find(e => !e.some(atCentre));
    if (!outer || walledKeysStanding.has(edgeKeyOf(outer[0], outer[1]))) return false;
  }
  return true;
}
const ringPool = ringCandidates.filter(c => inFrame(c) && ringable(c))
  .sort((a, b) => Math.hypot(a.client.x - 700, a.client.y - 475) - Math.hypot(b.client.x - 700, b.client.y - 475));
const apartFromA = (c) => c !== ringA && (c.m !== ringA.m || c.n !== ringA.n) && hexDist({ q: c.m, r: c.n }, { q: ringA.m, r: ringA.n }) >= 2;
// Fallbacks walk the candidates by measured centrality (nearest
// the frame's middle first) — never by clearance, which walks
// them off the land's far edge.
const byCentrality = [...ringCandidates].sort((a, b) =>
  Math.hypot((a.client?.x ?? 1e9) - 700, (a.client?.y ?? 1e9) - 475) - Math.hypot((b.client?.x ?? 1e9) - 700, (b.client?.y ?? 1e9) - 475));
const ringA = ringPool[0] ?? byCentrality.find(c => ringable(c)) ?? ringCandidates[0];
const ringB = ringPool.find(c => apartFromA(c) && Math.hypot(c.client.x - ringA.client.x, c.client.y - ringA.client.y) >= 200)
  ?? ringPool.find(c => apartFromA(c))
  ?? byCentrality.find(c => apartFromA(c) && ringable(c)) ?? byCentrality.find(c => apartFromA(c)) ?? ringCandidates[1];
ok("§P two ring anchors stand clear of the compounds, inside the frame", !!ringA && !!ringB && ringA !== ringB,
  JSON.stringify({ pool: ringPool.length, a: ringA && [ringA.t.q, ringA.t.r], b: ringB && [ringB.t.q, ringB.t.r] }));
const ringPieces = []; // {label, kind, edgePlate, edgeAx}
for (const [ring, kind] of [[ringA, "wall"], [ringB, "door"]]) {
  if (!ring) continue;
  const [rfm, rfn] = GEO.centerAddress(axialToPlate(ring.t.q, ring.t.r));
  const centre = GEO.hexCenter(Math.round(rfm), Math.round(rfn));
  for (const p of ring.hexPieces) if (p.kind === "triangle") await call("placeBuildPiece", { leadId: LEAD, kind: "triangle", verts: p.verts }, token);
  // The hex's own wedges only: the triangles carrying the centre
  // (the shoulders of piecesOfHex carry a corner, not the centre).
  const wedges = ring.hexPieces.filter(p => p.kind === "triangle"
    && p.verts.some(v => Math.abs(v[0] - centre[0]) < 1e-9 && Math.abs(v[1] - centre[1]) < 1e-9));
  for (const w of wedges) {
    const outer = edgesOf(w.verts).find(e => !e.some(v => Math.abs(v[0] - centre[0]) < 1e-9 && Math.abs(v[1] - centre[1]) < 1e-9));
    if (!outer) continue;
    const r = await call("placeBuildPiece", { leadId: LEAD, kind, verts: outer }, token);
    if (r.status === 200) ringPieces.push({ label: kind === "wall" ? "walls" : "doors", kind, edgePlate: outer, edgeAx: outer.map(v => plateToAxial(v)) });
  }
}
ok("§P both hexes stand ringed — six walls on one, six doors on the other", ringPieces.length === 12, `${ringPieces.length} ring pieces`);
await finishRises(); // the rings are photographed standing, at their full height (the Stone Cast note above)
await sleep(3500); // the read loop carries the rings onto the map
const domWalls = await page.evaluate(() => [...document.querySelectorAll(".build-wall-piece")].map(g => {
  const img = g.querySelector("image");
  const line = g.querySelector("line");
  const tr = img?.closest("g")?.getAttribute("transform") ?? "";
  const m = tr.match(/translate\(([-\d.]+)[ ,]+([-\d.]+)\)\s*rotate\(([-\d.]+)\)/);
  return {
    stance: g.getAttribute("data-perspective"), kind: g.getAttribute("data-kind"),
    href: img?.getAttribute("href") ?? "",
    ax: line ? +line.getAttribute("x1") : NaN, ay: line ? +line.getAttribute("y1") : NaN,
    bx: line ? +line.getAttribute("x2") : NaN, by: line ? +line.getAttribute("y2") : NaN,
    px: m ? +m[1] : NaN, py: m ? +m[2] : NaN, deg: m ? +m[3] : NaN,
  };
}));
let ringFound = 0;
for (const rp of ringPieces) {
  const A = landPtOfAxial(rp.edgeAx[0][0], rp.edgeAx[0][1]);
  const B = landPtOfAxial(rp.edgeAx[1][0], rp.edgeAx[1][1]);
  const exp = expectedPerspective(rp.kind, A, B);
  if (!DRAWING_BASES[exp.drawing]) {
    ok(`§P ${rp.label} ring, line ${exp.line.toFixed(1)}°: a stance the ring hexes never present`, false, JSON.stringify({ edgeAx: rp.edgeAx }));
    continue;
  }
  const seat = expectedSeat(exp.drawing, A, B);
  const node = domWalls.find(d => d.kind === rp.kind
    && ((Math.hypot(d.ax - A.x, d.ay - A.y) < 1.5 && Math.hypot(d.bx - B.x, d.by - B.y) < 1.5)
      || (Math.hypot(d.ax - B.x, d.ay - B.y) < 1.5 && Math.hypot(d.bx - A.x, d.by - A.y) < 1.5)));
  if (node) ringFound++;
  const seatOk = !!node && Math.hypot(node.px - seat.P.x, node.py - seat.P.y) < 0.75 && Math.abs(node.deg - seat.deg) < 0.75;
  const south = A.y > B.y ? "first end" : "second end";
  ok(`§P ${rp.label} ring, line ${exp.line.toFixed(1)}°: ${exp.drawing} stands for "${exp.stance}", its base start seated at the edge's ${seat.P === A ? "first" : "second"} end (the southern end is the ${south})`,
    !!node && node.href.includes(exp.drawing) && node.stance === exp.stance && seatOk,
    JSON.stringify({ node: node && { href: node.href.split("/").pop(), stance: node.stance, px: node.px, py: node.py, deg: node.deg }, exp, seatP: seat.P }));
}
ok("§P every ring piece was found standing on the map", ringFound === 12, `${ringFound}/12`);
// The rings photographed in §P's settled framing — the same
// framing the anchors were measured in; no second entry, no
// camera drag (the drive's later battles raise a Hold panel
// over the land, and drags begun under it select text or fling
// the land into the void — §S's own photograph suffers it in
// this run). Each ring's portrait is a clip centred on the
// ring; the full frame is kept too.
let pOpenedBuild = false;
if (!(await buildDoorStands())) {
  await pickPiece("triangle");
  pOpenedBuild = await buildDoorStands();
}
await page.screenshot({ path: join(SHOTS, "11-perspectives-frame.png") });
for (const [ring, shot, label] of [[ringA, "09-perspectives-walls.png", "walls"], [ringB, "10-perspectives-doors.png", "doors"]]) {
  if (!ring) continue;
  const cLand = landPtOfAxial(ring.t.q, ring.t.r);
  const c = await centreClientP(cLand.x, cLand.y);
  ok(`§P the ${label} ring stands inside the entry frame for its photograph`,
    c.x > 80 && c.x < 1320 && c.y > 60 && c.y < 890, JSON.stringify(c));
  const clip = {
    x: Math.max(0, Math.min(1400 - 820, Math.round(c.x - 410))),
    y: Math.max(0, Math.min(950 - 640, Math.round(c.y - 320))),
    width: 820, height: 640,
  };
  await page.screenshot({ path: join(SHOTS, shot), clip });
}
if (pOpenedBuild) {
  await clickMenuDone();
}

/* ── §S THE PHOTOGRAPH ─────────────────────────────────────── */
console.log("§S the photograph — the far compound, panned to the middle of the frame");
{
  if (!(await buildDoorStands())) { await pickPiece("triangle"); await sleep(200); }
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

/* ── §M THE TWO MODES, BY TAP ──────────────────────────────── */
console.log("§M the two modes — free place lands exactly; snap joins; the switch is the player's");
// §S left build mode open. The helpers: a plate point carried
// to the screen through the land's own transform, as §E's taps.
const plateToClient = async (plate) => {
  const ax = plateToAxial(plate);
  const k = 54 / 796;
  return landClient(250 + ax[0] * 1292 * k, 170 + ax[0] * 470 * k + ax[1] * 948 * k);
};
const tapPlate = async (plate) => {
  const pt = await plateToClient(plate);
  if (!pt.onScaffold) return false;
  await page.mouse.click(pt.x, pt.y);
  await sleep(700);
  return true;
};
const modeBtn = async () => {
  await openAbilityTab();
  await beginBuildingCast();
  return page.evaluate(() => {
    const b = document.querySelector(".pieces-menu .place-mode");
    return b ? { text: b.textContent.trim(), pressed: b.getAttribute("aria-pressed") } : null;
  });
};
const clickModeBtn = async () => {
  await openAbilityTab();
  await beginBuildingCast();
  await page.evaluate(() => { document.querySelector(".pieces-menu .place-mode")?.click(); });
  await sleep(200);
};
const floorsServed = async () => (await servedPieces()).filter(p => p.kind === "triangle" || p.kind === "square");
// A standing floor's free edge, with room on its far side: the
// tap point `dist` out from the edge's midpoint, and the free
// seat the tap would take there (for the mode witnesses).
const roomDiag = { freeEdges: 0, overlap: 0, snapOverlap: 0, noLand: 0, offScaffold: 0, clear: 0 };
async function freeEdgeRoom(dist, needSnap = false) {
  Object.keys(roomDiag).forEach(k => { roomDiag[k] = 0; });
  const floors = await floorsServed();
  const cnt = new Map();
  for (const p of floors) for (const e of edgesOf(p.verts)) { const k2 = edgeKeyOf(e[0], e[1]); cnt.set(k2, (cnt.get(k2) ?? 0) + 1); }
  // Every workable seat is gathered; the witness taken is the
  // one nearest the frame's centre — a seat off the frame or
  // under the rails is no tap at all, however lawful its ground.
  const found = [];
  for (const p of floors) {
    for (const e of edgesOf(p.verts)) {
      if ((cnt.get(edgeKeyOf(e[0], e[1])) ?? 0) !== 1) continue;
      roomDiag.freeEdges++;
      const heart = centroidOf(p.verts);
      const mx = (e[0][0] + e[1][0]) / 2, my = (e[0][1] + e[1][1]) / 2;
      let nx = -(e[1][1] - e[0][1]), ny = e[1][0] - e[0][0];
      const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
      if ((mx + nx - heart[0]) ** 2 + (my + ny - heart[1]) ** 2 < (mx - nx - heart[0]) ** 2 + (my - ny - heart[1]) ** 2) { nx = -nx; ny = -ny; }
      const tap = [mx + nx * dist, my + ny * dist];
      const freeVerts = freePieceAt("triangle", tap);
      if (floors.some(q => polygonsOverlap(freeVerts, q.verts))) { roomDiag.overlap++; continue; }
      if (needSnap) {
        const snapVerts = pieceOnEdge("triangle", e[0], e[1], heart);
        if (floors.some(q => polygonsOverlap(snapVerts, q.verts))) { roomDiag.snapOverlap++; continue; }
      }
      const fpHexes = footprintHexes(freeVerts.map(v => plateToAxial(v)));
      if (!fpHexes.some(h => land.tiles.some(tt => tt.q === h.q && tt.r === h.r))) { roomDiag.noLand++; continue; }
      const pt = await plateToClient(tap);
      if (!pt.onScaffold) { roomDiag.offScaffold++; continue; }
      roomDiag.clear++;
      found.push({ host: p, edge: e, tap, freeVerts, dc: Math.hypot(pt.x - 700, pt.y - 475) });
    }
  }
  found.sort((a, b) => a.dc - b.dc);
  return found[0] ?? null;
}
// §M begins on a FRESH entry: the camera §S dragged is not
// ground this section's taps can be measured on — a fresh
// entry stands the land centred, as §F's photograph shows.
await enterTerritory();
await clearOverlays();
if (!(await buildDoorStands())) {
  await pickPiece("triangle");
}
let mAnchor = null; // the §M work's own seat, for its photograph
const mode0 = await modeBtn();
ok("§M the pieces menu carries the placing-mode switch, standing at Snap together",
  !!mode0 && mode0.text.includes("Snap together") && mode0.pressed === "false", JSON.stringify(mode0));
// FREE PLACE: a tap within snap's own reach of a standing edge
// lands EXACTLY there — it does not snap together.
const roomFree = await freeEdgeRoom(0.68);
ok("§M a standing edge with room beyond it stands on the land (for the free-place tap)", !!roomFree, JSON.stringify(roomDiag));
if (roomFree) {
  await clickModeBtn();
  await sleep(300);
  const mode1 = await modeBtn();
  ok("§M the switch turns: the menu now stands at Free place",
    !!mode1 && mode1.text.includes("Free place") && mode1.pressed === "true", JSON.stringify(mode1));
  const beforeIds = new Set((await floorsServed()).map(p => p.id));
  const tapped = await tapPlate(roomFree.tap);
  const laid = (await floorsServed()).filter(p => !beforeIds.has(p.id));
  if (laid.length === 1) mAnchor = plateToAxial(centroidOf(laid[0].verts));
  ok("§M in free place, the tap lays the floor exactly where it fell — no snap to the neighbour's edge",
    tapped && laid.length === 1 && nearPt2(centroidOf(laid[0].verts), roomFree.tap, 0.06)
    && sharedEdgeKeys(laid[0].verts, roomFree.host.verts).length === 0,
    JSON.stringify({ laid: laid.map(p => centroidOf(p.verts)), tap: roomFree.tap }));
  await clickModeBtn();
  await sleep(300);
  const mode2 = await modeBtn();
  ok("§M the switch turns back: Snap together again",
    !!mode2 && mode2.text.includes("Snap together") && mode2.pressed === "false", JSON.stringify(mode2));
  // SNAP MODE: the same reach now JOINS the piece to its
  // neighbour, flush on the full edge.
  const roomSnap = await freeEdgeRoom(0.45, true);
  ok("§M another standing edge with room stands for the snap tap", !!roomSnap, JSON.stringify(roomDiag));
  if (roomSnap) {
    const beforeIds2 = new Set((await floorsServed()).map(p => p.id));
    const tapped2 = await tapPlate(roomSnap.tap);
    const laid2 = (await floorsServed()).filter(p => !beforeIds2.has(p.id));
    if (laid2.length === 1) mAnchor = plateToAxial(centroidOf(laid2[0].verts));
    ok("§M in snap mode, a tap within reach of a free edge joins the floor flush to its neighbour",
      tapped2 && laid2.length === 1 && sharedEdgeKeys(laid2[0].verts, roomSnap.host.verts).length === 1,
      JSON.stringify({ laid: laid2.map(p => centroidOf(p.verts)), tap: roomSnap.tap }));
  }
}
// The photograph of the free work: a FRESH entry frames the
// land centred (the camera drags this drive attempted left
// the land off-frame twice — the fresh entry's own framing,
// proven by §F's photograph, is the honest camera). §M's
// pieces stand at the compound, in that frame.
{
  await enterTerritory();
  await clearOverlays();
  if (!(await buildDoorStands())) {
    await pickPiece("triangle");
  }
  await sleep(600);
  await page.screenshot({ path: join(SHOTS, "08-free-placement.png") });
  ok("§M the free-built work stands drawn for its photograph",
    (await domCounts()).floors > 0, JSON.stringify(await domCounts()));
}

await browser.close();
console.log(`\ndrive-hex-build: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
