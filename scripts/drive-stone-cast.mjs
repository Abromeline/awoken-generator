// drive-stone-cast — THE STONE CAST (2026-10-28; commissioned
// by Nigel 2026-10-26, pulled forward 2026-10-27 20:15, access
// and gate ruled 2026-10-27 20:28–21:00; the smaller menu
// examples amended by Nigel 2026-10-28 09:53). Proven on the
// real homeland:
//   §S1 THE GATE: the cast names its lead builder. A lead who
//      is not fielded, or fielded without 2 Rock in its element
//      sum, is refused; a fielded ≥2-Rock Awoken's cast begins.
//      The served placements carry the Rock sums the gate reads.
//   §S2 THE RISE, ITS PACE AND ITS PRICE: a begun piece is
//      RISING at frac 0 — it does not appear. With a crew of
//      Stone 5 between two builders, 6 minutes raise it 5/6 of
//      the way (minutes ≈ 36 / crew Stone power — the anchor:
//      a lone 3-power builder needs 12) and the purse pays
//      exactly 12 energy: 1 per builder per minute. The whole
//      rise costs the crew 14 (2 builders × 7.2 minutes).
//   §S3 THE HOLD: with no qualified Awoken on the field, a rise
//      HOLDS its height — no advance, no charge — and resumes
//      when a builder returns (a lone 3-power builder finishes
//      it in exactly the anchor's 12 minutes for 12 energy).
//   §S4 THE PARTWAY STOP: a wall stopped at 30% with its floor
//      beneath it CEMENTS there — final, unmoved by later time.
//   §S5 THE SETTLING LAW: a wall still rising when its floor is
//      struck down does not fall — it SETTLES, and given time
//      it sinks back into the ground and is gone. A settling
//      piece refuses the stop. Taking a floor away marks its
//      rising wall to settle the same way.
//   §S6 STRIKE THE WORK: pieces have 100 HP. A hand without
//      Stone damages (100 → 70 by a 30-power blow); a Stone
//      hand REPAIRS by its power (70 → 97 → 100, capped); a
//      piece struck to 0 FALLS, and the cemented wall it alone
//      carried comes down with it (the cascade).
//   §S7 BUILDING RIDES THE TILE: a tile's lift price is 10 Air
//      plus 1 for each building piece riding it — one Air
//      short of the price it stays, at the price it rises,
//      and the piece standing on it is served on the risen
//      plane (z 1).
//   §S8 THE DOOR, IN A REAL BROWSER: the building panel's
//      free-standing pieces seat is CLOSED (no pieces menu
//      there); a ≥2-Rock Awoken's wheel carries the Abilities
//      door and a <2-Rock Awoken's does not; the tab opens on
//      the registry's LIST (THE ABILITIES SECTION, 2026-10-29)
//      and tapping Building's row begins the cast and seats
//      the pieces menu, with Nigel's SMALLER examples (his
//      amendment of 2026-10-28 09:53 — the same faces, thumb-
//      nail scale); a piece mid-rise stands on the map at its
//      served height, riding its lifted tile.
// Screenshots land in ~/workspace/stonecast-proof/.
// Run after `npm run build`:
//   PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-stone-cast.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");
const GEO = await import("../server/dist/buildGeometry.js");
const { piecesOfHex, edgesOf, pointInPolygon, axialToPlate, centerAddress, edgeKeyOf } = GEO;
/** The kit pieces of the hex at AXIAL (q, r): piecesOfHex is
 *  addressed in the plate plane's centre addresses, so the
 *  hex's axial coords convert first (drive-hex-build's road). */
const hexPiecesAt = (q, r) => {
  const [m, n] = centerAddress(axialToPlate(q, r));
  return piecesOfHex(Math.round(m), Math.round(n));
};

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-stonecast-"));
process.env.PORT = "39986";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39986";
const PW = "stonecast-drive-password";
const SHOTS = "/home/hatch/workspace/stonecast-proof";
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

/* ══ THE WORLD: a fresh Tender, their sown land, and a crew ══ */
const claim = await callOk("claimTender", { password: PW, tenderName: "Stone Tender" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
const token = claim.token;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 3, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', total_exp = 3800, hp = 100").run(ownerKey, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 1000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 1000").run(ownerKey, now);
await callOk("ensureFirstSeed", {}, token);
let land = await callOk("getTerritory", {}, token);
ok("the sown land stands (tiles served)", land.tiles.length >= 19, `${land.tiles.length} tiles`);
const tileAt = (q, r) => land.tiles.find(t => t.q === q && t.r === r && (t.z ?? 0) === 0);

const insAsset = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
function seedAwoken(name, parts) {
  const comp = parts.map(([n, c, p, t, el]) => {
    const id = Number(insAsset.run(n, c, p, t, el, `stonecast/${n}.png`, now).lastInsertRowid);
    return { source_id: `db:${id}`, name: n, category: c, rarity: "common", power: p, toughness: t, element: el };
  });
  const ins = db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', 'Stone Tender', ?, ?)");
  return Number(ins.run(name, name, `stonecast/${name}.png`, JSON.stringify(comp), ownerKey, now).lastInsertRowid);
}
// Stonewright: 3 Stone parts (Rock sum 3, power 27) — the anchor builder.
// Pebblehand: 2 Stone + 1 Sky (Rock sum 2, power 15) — crew at the gate's edge.
// Skyhand: no Stone at all (Rock sum 0, power 30) — the damaging hand.
// Deckhand: 3 Stone parts but NEVER FIELDED — the gate must refuse it.
const stonewright = seedAwoken("Stonewright", [["Granite Body", "body", 9, 9, "stone"], ["Granite Arms", "arms", 9, 9, "stone"], ["Granite Crown", "head", 9, 9, "stone"]]);
const pebblehand = seedAwoken("Pebblehand", [["Pebble Body", "body", 5, 5, "stone"], ["Pebble Arms", "arms", 5, 5, "stone"], ["Zephyr Crown", "head", 5, 5, "sky"]]);
const skyhand = seedAwoken("Skyhand", [["Gale Body", "body", 10, 10, "sky"], ["Gale Arms", "arms", 10, 10, "sky"], ["Gale Crown", "head", 10, 10, "sky"]]);
const deckhand = seedAwoken("Deckhand", [["Slate Body", "body", 4, 4, "stone"], ["Slate Arms", "arms", 4, 4, "stone"], ["Slate Crown", "head", 4, 4, "stone"]]);

await callOk("deployFirstSeed", { awakenedIds: [stonewright] }, token);
const place = (awakenedId, tile) => db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
  VALUES (?, ?, ?, ?, ?, 'defense', 0, 99, ?, ?, NULL, NULL, 0)`).run(ownerKey, awakenedId, tile.id, now, now, tile.q, tile.r);
place(pebblehand, tileAt(1, 0));
place(skyhand, tileAt(0, 1));
land = await callOk("getTerritory", {}, token);

const energy = () => db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(ownerKey).energy;
async function servedPieces() {
  land = await callOk("getTerritory", {}, token);
  return land.buildPieces ?? [];
}
const pieceById = (pieces, id) => pieces.find(p => p.id === id);
/** Move a piece's rise clock back — the drive's time travel,
 *  the same road the battle drives walk with their watermarks:
 *  the server's own settle does all the reckoning. */
const backdate = (id, minutes) =>
  db.prepare("UPDATE build_pieces SET rise_updated_at = ? WHERE id = ?").run(Date.now() - minutes * 60000, id);

/* ── footprint hexes (the faces drive's witness copy) ─────── */
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

/* ── §S1 THE GATE ──────────────────────────────────────────── */
console.log("§S1 the gate — the cast names its lead builder");
{
  const sums = new Map(land.placements.map(p => [p.awakenedId, p.stone]));
  ok("the field is served with its Rock sums (3 · 2 · 0)",
    sums.get(stonewright) === 3 && sums.get(pebblehand) === 2 && sums.get(skyhand) === 0,
    JSON.stringify([...sums]));
  const hex00 = hexPiecesAt(0, 0);
  const square0 = hex00.find(p => p.kind === "square");
  const noLead = await call("placeBuildPiece", { kind: "square", verts: square0.verts }, token);
  ok("a cast naming no lead builder is refused — the old door is closed", noLead.status !== 200, `${noLead.status}`);
  const deckLead = await call("placeBuildPiece", { kind: "square", verts: square0.verts, leadId: deckhand }, token);
  ok("a ≥2-Rock Awoken NOT on the field cannot lead — it must be available", deckLead.status !== 200, `${deckLead.status}`);
  const skyLead = await call("placeBuildPiece", { kind: "square", verts: square0.verts, leadId: skyhand }, token);
  ok("a fielded Awoken without 2 Rock cannot lead", skyLead.status !== 200, `${skyLead.status}`);
  const lay = await callOk("placeBuildPiece", { kind: "square", verts: square0.verts, leadId: stonewright }, token);
  ok("the qualified lead's cast begins — the piece is RISING at frac 0, not appeared",
    lay.piece.state === "rising" && lay.piece.frac === 0 && lay.piece.hp === 100,
    JSON.stringify(lay.piece));
  var S1 = lay.piece;
}

/* ── §S2 THE RISE — PACE AND PRICE ─────────────────────────── */
console.log("§S2 the rise — pace from the crew's Stone, energy per builder-minute");
{
  const e0 = energy();
  backdate(S1.id, 6);
  let pieces = await servedPieces();
  const p = pieceById(pieces, S1.id);
  ok("6 minutes under a crew of Stone 5 raise the piece 5/6 of the way (36/5 = 7.2 minutes for the whole)",
    !!p && p.state === "rising" && Math.abs(p.frac - 5 / 6) < 0.03, JSON.stringify(p));
  ok("the purse paid exactly 12 — 1 energy per builder per minute, two builders on the crew",
    energy() === e0 - 12, `${e0} -> ${energy()}`);
  backdate(S1.id, 6);
  pieces = await servedPieces();
  const done = pieceById(pieces, S1.id);
  ok("the rise completes and the piece SNAPS IN — standing at frac 1",
    !!done && done.state === "standing" && done.frac === 1, JSON.stringify(done));
  ok("the whole rise cost 14 — 2 builders × 7.2 minutes (adding a builder raised the price and cut the time)",
    energy() === e0 - 14, `${e0} -> ${energy()}`);
}

/* ── §S3 THE HOLD ──────────────────────────────────────────── */
console.log("§S3 the hold — no available builder, no rising");
let T1;
{
  const tri = hexPiecesAt(0, 0).find(p => p.kind === "triangle");
  const lay = await callOk("placeBuildPiece", { kind: "triangle", verts: tri.verts, leadId: stonewright }, token);
  T1 = lay.piece;
  db.prepare("DELETE FROM field_placements WHERE owner_key = ? AND awakened_id IN (?, ?)").run(ownerKey, stonewright, pebblehand);
  const e0 = energy();
  backdate(T1.id, 10);
  let pieces = await servedPieces();
  const held = pieceById(pieces, T1.id);
  ok("with no qualified Awoken on the field the rise HOLDS — same height, still rising",
    !!held && held.state === "rising" && held.frac === 0, JSON.stringify(held));
  ok("the hold charged nothing", energy() === e0, `${e0} -> ${energy()}`);
  place(stonewright, tileAt(0, 0));
  backdate(T1.id, 12);
  pieces = await servedPieces();
  const done = pieceById(pieces, T1.id);
  ok("a builder's return resumes it — the lone 3-power anchor finishes in exactly 12 minutes",
    !!done && done.state === "standing" && done.frac === 1, JSON.stringify(done));
  ok("the anchor's price: exactly 12 energy for the lone builder's 12 minutes",
    energy() === e0 - 12, `${e0} -> ${energy()}`);
}

/* ── §S4 THE PARTWAY STOP — CEMENTING ──────────────────────── */
console.log("§S4 the partway stop — cemented where it stands");
let W1;
{
  // An edge of the square that the (0,0) wedge does NOT also
  // carry — the wall must rest on the square alone, so the
  // §S6 cascade witness is honest.
  const t1Edges = new Set(edgesOf(T1.verts).map(e => edgeKeyOf(e[0], e[1])));
  const edge = edgesOf(S1.verts).find(e => !t1Edges.has(edgeKeyOf(e[0], e[1])));
  const lay = await callOk("placeBuildPiece", { kind: "wall", verts: edge, leadId: stonewright }, token);
  W1 = lay.piece;
  backdate(W1.id, 3.6); // 3.6 min × 3 Stone / 36 = 0.30 of the rise
  let pieces = await servedPieces();
  const mid = pieceById(pieces, W1.id);
  ok("the wall is mid-rise at 30%", !!mid && mid.state === "rising" && Math.abs(mid.frac - 0.3) < 0.02, JSON.stringify(mid));
  const stopped = await callOk("stopBuildPiece", { id: W1.id }, token);
  ok("stopped with its floor beneath it, the wall CEMENTS at its partway height",
    stopped.cemented === true && stopped.piece.state === "cemented" && Math.abs(stopped.piece.frac - 0.3) < 0.02,
    JSON.stringify(stopped.piece));
  const e0 = energy();
  backdate(W1.id, 30);
  pieces = await servedPieces();
  const later = pieceById(pieces, W1.id);
  ok("cementing is final — half an hour later it stands at the same 30%, and no energy moved",
    !!later && later.state === "cemented" && Math.abs(later.frac - 0.3) < 0.02 && energy() === e0,
    JSON.stringify(later));
}

/* ── §S5 THE SETTLING LAW ──────────────────────────────────── */
console.log("§S5 the settling law — a rise whose foundation falls does not fall; it settles");
{
  const tri = hexPiecesAt(1, 0).find(p => p.kind === "triangle");
  const floor = (await callOk("placeBuildPiece", { kind: "triangle", verts: tri.verts, leadId: stonewright }, token)).piece;
  const edge = edgesOf(floor.verts)[0];
  const wall = (await callOk("placeBuildPiece", { kind: "wall", verts: edge, leadId: stonewright }, token)).piece;
  // Let the wall climb halfway first (6 of the anchor's 12
  // minutes) — a wall struck down at a hair's height would
  // finish settling inside a single read and prove nothing.
  backdate(wall.id, 6);
  await servedPieces();
  let strike = null;
  for (let i = 0; i < 4; i++) strike = await callOk("strikeBuildPiece", { awakenedId: skyhand, pieceId: floor.id }, token);
  ok("four 30-power blows from a hand without Stone fell the floor (100 HP)",
    !!strike && strike.fell === true, JSON.stringify(strike));
  ok("the wall still rising on it was NOT felled — it is marked to settle",
    !!strike && strike.settling.includes(wall.id) && !strike.removed.includes(wall.id), JSON.stringify(strike));
  let pieces = await servedPieces();
  const settling = pieceById(pieces, wall.id);
  ok("the wall stands in the settling state", !!settling && settling.state === "settling", JSON.stringify(settling));
  const stopTry = await call("stopBuildPiece", { id: wall.id }, token);
  ok("a settling piece refuses the stop — it has nothing to cement to", stopTry.status !== 200, `${stopTry.status}`);
  backdate(wall.id, 13);
  pieces = await servedPieces();
  ok("given its settling time, the wall has sunk back into the ground and is gone",
    !pieceById(pieces, wall.id), JSON.stringify(pieces.map(p => p.kind)));
  // The same law through taking-away: a floor taken from under
  // a rising wall marks the wall to settle, and fells nothing.
  const tri3 = hexPiecesAt(0, 1).find(p => p.kind === "triangle");
  const floor3 = (await callOk("placeBuildPiece", { kind: "triangle", verts: tri3.verts, leadId: stonewright }, token)).piece;
  const wall3 = (await callOk("placeBuildPiece", { kind: "wall", verts: edgesOf(floor3.verts)[0], leadId: stonewright }, token)).piece;
  const away = await callOk("removeBuildPiece", { id: floor3.id }, token);
  ok("taking the floor away fells nothing standing and marks its rising wall to settle",
    away.removed.length === 1 && away.settling.includes(wall3.id), JSON.stringify(away));
}

/* ── §S6 STRIKE THE WORK — DAMAGE, REPAIR, THE CASCADE ─────── */
console.log("§S6 strike the work — damage, Stone repair, and the fall at 0 HP");
{
  const hit = await callOk("strikeBuildPiece", { awakenedId: skyhand, pieceId: S1.id }, token);
  ok("a blow from a hand without Stone damages the piece by its power (100 → 70)",
    hit.repaired === false && hit.hp === 70 && hit.fell === false, JSON.stringify(hit));
  const mend1 = await callOk("strikeBuildPiece", { awakenedId: stonewright, pieceId: S1.id }, token);
  ok("a Stone Awoken's attack REPAIRS instead — by its power (70 → 97)",
    mend1.repaired === true && mend1.hp === 97, JSON.stringify(mend1));
  const mend2 = await callOk("strikeBuildPiece", { awakenedId: stonewright, pieceId: S1.id }, token);
  ok("repair caps at the piece's 100 HP", mend2.repaired === true && mend2.hp === 100, JSON.stringify(mend2));
  let last = null;
  for (let i = 0; i < 4; i++) last = await callOk("strikeBuildPiece", { awakenedId: skyhand, pieceId: S1.id }, token);
  ok("struck to 0 HP the foundation FALLS", !!last && last.fell === true && last.removed.includes(S1.id), JSON.stringify(last));
  ok("the cemented wall it alone carried comes down with it — the cascade",
    !!last && last.removed.includes(W1.id), JSON.stringify(last?.removed));
  const pieces = await servedPieces();
  ok("the fallen work leaves the served land", !pieceById(pieces, S1.id) && !pieceById(pieces, W1.id));
}

/* ── §S7 BUILDING RIDES THE TILE ───────────────────────────── */
console.log("§S7 building rides the tile — each piece on it adds 1 Air to the lift");
{
  // The construction's tiling drifts from the land's (the
  // plate's own law): a piece's home land hex is the hex its
  // footprint's heart falls in — the server's own reckoning
  // (pieceTopZ). So the witness piece is placed first, and its
  // tile is read off its served footprint.
  const centroidHex = (p) => axialRound(
    p.footprint.reduce((s, v) => s + v[0], 0) / p.footprint.length,
    p.footprint.reduce((s, v) => s + v[1], 0) / p.footprint.length);
  const stoodTiles = new Set(land.placements.map(p => p.tileId));
  let chosen = null;
  for (const [q, r] of [[0, 0], [1, 0], [0, 1], [1, -1], [-1, 0], [0, -1], [-1, 1], [2, -1], [-2, 1], [1, 1], [-1, -1]]) {
    const cand = hexPiecesAt(q, r).filter(p => p.kind === "triangle")[1]
      ?? hexPiecesAt(q, r).find(p => p.kind === "triangle");
    if (!cand) continue;
    const lay = await call("placeBuildPiece", { kind: "triangle", verts: cand.verts, leadId: stonewright }, token);
    if (lay.status !== 200) continue;
    const piece = lay.body.piece;
    const H = centroidHex(piece);
    const tileH = land.tiles.find(t => t.q === H.q && t.r === H.r && (t.z ?? 0) === 0);
    if (!tileH || tileH.cursed || stoodTiles.has(tileH.id)) {
      await callOk("removeBuildPiece", { id: piece.id }, token);
      continue;
    }
    chosen = { piece, tileH, H };
    break;
  }
  ok("a witness piece stands with its heart on a clean tile of ours", !!chosen, "");
  if (chosen) {
    const { piece, tileH, H } = chosen;
    backdate(piece.id, 12);
    const pieces = await servedPieces();
    const standing = pieceById(pieces, piece.id);
    ok("the piece stands on its tile (served z 0)", !!standing && standing.state === "standing" && standing.z === 0, JSON.stringify(standing));
    // The server's count, replicated: pieces whose heart is
    // this hex and whose footprint covers it.
    const count = pieces.filter(p => {
      const ph = centroidHex(p);
      return ph.q === H.q && ph.r === H.r && footprintHexes(p.footprint).some(h => h.q === H.q && h.r === H.r);
    }).length;
    ok("the tile carries at least the witness piece", count >= 1, `count ${count}`);
    const cost = 10 + count;
    db.prepare("UPDATE territory_tiles SET mix_points = ? WHERE id = ?")
      .run(JSON.stringify({ sky: cost - 2, stone: 0, tide: 0, root: 0 }), tileH.id);
    db.prepare("INSERT INTO aspect_attunement (owner_key, element, points, updated_at) VALUES (?, 'sky', 5, ?)").run(ownerKey, now);
    await callOk("setTenderTile", { tileId: tileH.id }, token);
    await callOk("attuneTile", { element: "sky", tileId: tileH.id }, token);
    land = await callOk("getTerritory", {}, token);
    const afterFirst = land.tiles.filter(t => t.q === H.q && t.r === H.r);
    ok(`at ${cost - 1} Air the tile does NOT lift — the ${count} piece(s) riding it make the price ${cost}`,
      afterFirst.every(t => (t.z ?? 0) === 0), JSON.stringify(afterFirst.map(t => t.z)));
    await callOk("attuneTile", { element: "sky", tileId: tileH.id }, token);
    land = await callOk("getTerritory", {}, token);
    const liftedTile = land.tiles.find(t => t.q === H.q && t.r === H.r && (t.z ?? 0) === 1);
    const served = pieceById(land.buildPieces ?? [], piece.id);
    ok(`at ${cost} Air the tile rises — and the piece rides it, served on the risen plane (z 1)`,
      !!liftedTile && !!served && served.z === 1, JSON.stringify({ lifted: !!liftedTile, z: served?.z }));
    var rideHost = tileH;
    var ridePieceId = piece.id;
  }
}

/* ── §S8 THE DOOR, IN A REAL BROWSER ───────────────────────── */
console.log("§S8 the door in a real browser — the closed seat, the tab, the small examples, a piece mid-rise");
{
  // A piece caught mid-rise for the photograph: a wall on the
  // ridden piece's edge, backdated to half its rise (the lone
  // 3-power crew: 6 of 12 minutes).
  const hostPiece = (await servedPieces()).find(p => p.id === ridePieceId);
  const midWall = (await callOk("placeBuildPiece", { kind: "wall", verts: edgesOf(hostPiece.verts)[0], leadId: stonewright }, token)).piece;
  backdate(midWall.id, 6);
  // Stand the Tender on a far ring-2 tile before the page
  // opens: on a ring tile his tall figure overlaps the
  // Awoken's figures, and a tap meant for an Awoken can land
  // on him instead (his wheel answers to a different caption).
  land = await callOk("getTerritory", {}, token);
  const farTile = land.tiles.find(t => t.q === 2 && t.r === -2 && (t.z ?? 0) === 0)
    ?? land.tiles.find(t => t.q === -2 && t.r === 2 && (t.z ?? 0) === 0);
  if (farTile) await callOk("setTenderTile", { tileId: farTile.id }, token);

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
  const enterTerritory = async () => {
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
  };
  const clearOverlays = async () => {
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
  };
  await enterTerritory();
  await clearOverlays();

  // The building panel: buildings keep their road; the pieces
  // seat that stood there is closed.
  await page.evaluate(() => document.querySelector(".castle-toggle")?.click());
  await sleep(600);
  const panelState = await page.evaluate(() => ({
    panel: !!document.querySelector(".building-side-panel"),
    menu: !!document.querySelector(".building-side-panel .pieces-menu"),
    closedLine: !!document.querySelector(".pieces-seat-closed"),
  }));
  ok("the building panel stands, its free-standing pieces seat CLOSED — no pieces menu there",
    panelState.panel && !panelState.menu && panelState.closedLine, JSON.stringify(panelState));
  await page.evaluate(() => document.querySelector(".castle-toggle")?.click());
  await sleep(400);

  // The wheels: tap each figure until the caption names the
  // Awoken whose door we are trying.
  const figBoxes = async () => page.evaluate(() => {
    const out = [];
    for (const g of document.querySelectorAll("g.field-drifter, g.field-patroller")) {
      const r = g.getBoundingClientRect();
      if (r.width) out.push({ cx: r.left + r.width / 2, cy: r.top + r.height / 2 });
    }
    return out;
  });
  const wheelState = async () => page.evaluate(() => ({
    wheel: !!document.querySelector(".gw-wheel"),
    discs: [...document.querySelectorAll(".gw-disc")].map((d) => d.textContent ?? ""),
    caption: document.querySelector(".gw-caption")?.textContent ?? "",
  }));
  const openWheelOf = async (name) => {
    // On a heavy first entry the figures can take a while to
    // stand on the land — wait for them before sweeping.
    await page.waitForFunction(() => document.querySelectorAll("g.field-drifter, g.field-patroller").length > 0, { timeout: 25000 }).catch(() => {});
    for (let sweep = 0; sweep < 3; sweep++) {
      // The return report's ceremony card can land over the
      // map a breath after entry and swallow every tap (the
      // hex-build drive's probe proved it) — clear overlays
      // inside the sweep, not only before it.
      await clearOverlays();
      for (const f of await figBoxes()) {
        await page.touchscreen.tap(f.cx, f.cy);
        await sleep(700);
        const s = await wheelState();
        if (s.wheel && s.caption.includes(name)) return s;
        if (s.wheel) { await page.touchscreen.tap(1350, 40); await sleep(500); }
      }
      await sleep(600);
    }
    return null;
  };
  const skyWheel = await openWheelOf("Skyhand");
  ok("a fielded Awoken WITHOUT 2 Rock has no Abilities door on its wheel",
    !!skyWheel && !skyWheel.discs.some(d => d.includes("Abilities")), JSON.stringify(skyWheel?.discs));
  if (skyWheel) { await page.touchscreen.tap(1350, 40); await sleep(500); }
  const stoneWheel = await openWheelOf("Stonewright");
  ok("the ≥2-Rock Awoken's wheel carries the Abilities door",
    !!stoneWheel && stoneWheel.discs.some(d => d.includes("Abilities")), JSON.stringify(stoneWheel?.discs));
  if (stoneWheel) {
    const box = await page.evaluate(() => {
      const d = [...document.querySelectorAll(".gw-disc")].find((x) => (x.textContent ?? "").includes("Abilities"));
      if (!d) return null;
      const r = d.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.touchscreen.tap(box.x, box.y);
    await sleep(800);
  }
  // THE ABILITIES SECTION (2026-10-29): the tab opens on the
  // registry's LIST — Building's row stands, the pieces menu
  // not yet seated; tapping the row begins the cast.
  const listState = await page.evaluate(() => {
    const panel = document.querySelector(".ability-side-panel");
    return {
      tab: !!panel,
      row: !!panel?.querySelector('.ability-entry[data-ability="building"]'),
      rowText: panel?.querySelector('.ability-entry[data-ability="building"]')?.textContent ?? "",
      menu: !!panel?.querySelector(".pieces-menu"),
    };
  });
  ok("the tab opens on the registry's list — Building's row stands (2 Rock spoken), the menu not yet seated",
    listState.tab && listState.row && listState.rowText.includes("2 Rock") && !listState.menu, JSON.stringify(listState));
  await page.evaluate(() => {
    document.querySelector('.ability-side-panel .ability-entry[data-ability="building"]')?.click();
  });
  await sleep(800);
  const tabState = await page.evaluate(() => {
    const panel = document.querySelector(".ability-side-panel");
    const img = panel?.querySelector(".pieces-menu .piece-choice img");
    const ir = img?.getBoundingClientRect();
    return {
      tab: !!panel,
      lead: panel?.getAttribute("data-lead"),
      menu: !!panel?.querySelector(".pieces-menu"),
      choices: panel ? panel.querySelectorAll(".pieces-menu .piece-choice[data-tool]").length : 0,
      imgH: ir ? ir.height : 0,
      crew: panel?.querySelector(".ability-crew")?.textContent ?? "",
      work: [...(panel?.querySelectorAll(".ability-work-row") ?? [])].map(r => r.textContent ?? "").join(" | "),
    };
  });
  ok("the ability tab stands on the lead builder, the pieces menu seated inside it",
    tabState.tab && tabState.menu && Number(tabState.lead) === stonewright, JSON.stringify(tabState));
  ok("the menu's examples are SMALL — the same faces at thumbnail scale (Nigel's amendment, 2026-10-28 09:53)",
    tabState.imgH > 0 && tabState.imgH <= 40, `img height ${tabState.imgH}`);
  ok("the tab speaks the crew and the work in progress (the mid-rise wall, with its Stop)",
    tabState.crew.includes("Stonewright") && tabState.work.includes("rising"), JSON.stringify(tabState));
  {
    const r = await page.evaluate(() => {
      const el = document.querySelector(".ability-side-panel");
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    });
    if (r) await page.screenshot({ path: join(SHOTS, "01-ability-tab-pieces-menu.png"),
      clip: { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(1400 - Math.max(0, r.x), r.width), height: Math.min(950 - Math.max(0, r.y), r.height) } });
    ok("the ability tab's portrait is taken", !!r);
  }
  // Close the tab and photograph the piece mid-rise on the map.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll(".ability-side-panel button")].find((x) => x.textContent.trim() === "✕");
    if (b) b.click();
  });
  await sleep(600);
  // The wall keeps rising in real time while the browser
  // walks (the Abilities tab's list step, 2026-10-29, spends
  // some of the old ±0.06 window), so the drawn height is
  // judged against the SERVED height at the same breath —
  // the assertion's substance stands: the map draws the
  // piece at its true rise, mid-way, state rising.
  const servedMid = pieceById(await servedPieces(), midWall.id);
  const wallDom = await page.evaluate(() => {
    const n = [...document.querySelectorAll(".build-wall-piece")].map(x => ({
      state: x.getAttribute("data-state"), frac: Number(x.getAttribute("data-frac")),
    }));
    return n;
  });
  ok("a piece stands on the map MID-RISE — drawn at its served height, state rising",
    !!servedMid && servedMid.frac > 0.25 && servedMid.frac < 0.75
      && wallDom.some(w => w.state === "rising" && Math.abs(w.frac - servedMid.frac) < 0.03),
    JSON.stringify({ served: servedMid?.frac, dom: wallDom }));
  await page.screenshot({ path: join(SHOTS, "02-piece-mid-rise.png") });
  await browser.close();
}

console.log(`\ndrive-stone-cast: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
