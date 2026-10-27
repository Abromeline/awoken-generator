// drive-lighting — THE LIGHTING SYSTEM (Nigel's word,
// 2026-10-26 16:42; the Table carried in the same build,
// 16:48; the DM's hand on a campaign's light, 16:48; the
// source law corrected 17:01 — only the things MADE OF
// LIGHT give light: the beacon-class and the glowing
// mushrooms; not the Tender, not her Awoken, not her
// ordinary buildings).
//
// Proven from the served payload and the settled record,
// on both grounds:
//   §H1 a beacon-stage seed's 7 hexes read FIGHTING (2) in
//       the homeland payload; far ground reads DARK (0).
//   §H2 a build WALL on the shared edge darkens the hex
//       behind it; a DOORWAY in that same edge lights it
//       again (the centre throw threads the door's gap);
//       a cast WARD of the book on another shared edge
//       bars its throw too (its hex reads no FIGHTING —
//       FAINT at most, from the ward's own glow).
//   §H4 spawns across trials never land on FIGHTING
//       ground (a bastion building's throw over the
//       furthest cursed ring), and do land on unlit ring
//       ground — the bar is selective, not a shutdown.
//   §H6 the FAINT sources and the non-sources: a rune's
//       hex reads FAINT and a Fray standing on it loses
//       nothing across a settle; a Dream Shroom's hex
//       reads FAINT; a watchtower's hex reads DARK; the
//       Tender's own standing hex reads DARK and a Fray
//       sharing it burns nothing; a lone standing Awoken's
//       hex reads DARK; an ungrown seed's hex reads DARK.
//   §H3 the burn: a Fray on FIGHTING ground loses HP in
//       d10-per-second steps across a settle (5 settled
//       seconds cost between 5 and 50), and a second Fray
//       fells across a longer settle — credited as a
//       land-defence fell (the protection bank rises by
//       the Fray's own measure, creditBattleKill's road).
//   §H5 a wandering dark's settle never steps onto
//       FIGHTING ground (it halts outside the beacon's
//       ring), and with the seed struck back to a Starseed
//       the same walk reaches the goal hex — the light
//       was the bar.
//   §H7 the face, in a real browser (THE LIGHTING FACE,
//       2026-10-27): the light layer stands in the homeland
//       DOM with the beacon's light drawn as CONTINUOUS
//       glow from its source — no hex-shaped light polygons
//       anywhere (the per-hex pools were struck at Nigel's
//       word) — and the dusk as ONE continuous wash, below
//       the standings; the book's rune stands drawn on
//       its hex; a wanderer's figure wears no darkening (no
//       filter, no wash in its group).
//   §T1 a campaign Table room whose seed stands grown to
//       the Beacon (white-box level, named here) serves
//       the seed's 7 hexes at FIGHTING in its state.
//   §T2 a dark dealt walking for the seed is never seen
//       standing on a FIGHTING hex, and it does close in.
//   §T3 a dark standing on a beacon-lit hex burns across
//       the room's own settles and fells through the one
//       door with no slayer named in the tale.
//   §T4 the DM's hand: a guest seat's stLight is refused;
//       the Storytender darkens a beacon-lit hex and the
//       burn on it stops, clears her setting and the light
//       and the burn return; she raises fighting light
//       under a pinned dark on dark ground and it burns.
//   §T5 a casual room serves lightOverrides null, and an
//       stLight attempt there changes nothing.
//   §T6 the Table's face, in a real browser: the light
//       layer stands with the seed's glow, and the seed's
//       bulb wears its lit read at the Beacon stage.
//       (Restated 2026-10-27 for the Lighting Face
//       reunification: the per-hex pools this section was
//       born reading are struck — the Table's face is the
//       homeland's now, one dusk path and the sources'
//       glow.)
//
// Run after `npm run build`:
//   PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-lighting.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-lighting-"));
process.env.PORT = "39931";
process.env.WORKSHOP_PASSWORD = ["lighting", "drive", "password"].join("-");
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39931";
const PW = "lighting-drive-password";
const SHOTS = "/home/hatch/workspace/lighting-proof";
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const realNow = Date.now;

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

await import("../server/dist/index.js");
await sleep(2500);

const GEO = await import("../server/dist/buildGeometry.js");
const { plateToAxial, axialToPlate, candidatesNear, edgesOf, edgeKeyOf, segmentsCrossProper } = GEO;
const { partyBattleSeatFor, issueTableToken } = await import("../server/dist/table.js");

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
  if (r.status !== 200) throw new Error(`${action} -> ${r.status}: ${JSON.stringify(r.raw).slice(0, 240)}`);
  return r.body;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up, as the other drives do */ }
const now = Date.now();
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
const ringOf = (t) => Math.max(Math.abs(t.q), Math.abs(t.r), Math.abs(t.q + t.r));

/* ══ HOMELAND FIXTURES ════════════════════════════════ */
async function mkHomelandTender(name) {
  const claim = await callOk("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  // A classed Tender whose weapon was never chosen: the
  // homeland weapon referee idles (it reads weapon_key),
  // so no strike but the light's can touch a test dark.
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 3, 'warden', NULL, 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', weapon_key = NULL, total_exp = 3800, hp = 100")
    .run(ownerKey, now);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 900, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 900").run(ownerKey, now);
  await callOk("ensureFirstSeed", {}, claim.token);
  return { token: claim.token, ownerKey, name };
}
const tilesOf = async (t) => (await callOk("getTerritory", {}, t.token)).tiles;
const tileAt = (tiles, q, r) => tiles.find((x) => x.q === q && x.r === r) ?? null;
const freezeBattle = (ownerKey) => db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now(), ownerKey);
const placeFray = (ownerKey, tile, hp) => Number(db.prepare(
  "INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, pos_q, pos_r, hp, lvl, power) VALUES (?, ?, 'fray', ?, ?, ?, ?, 1, 1)")
  .run(ownerKey, tile.id, Date.now(), tile.q, tile.r, hp).lastInsertRowid);
const frayRow = (id) => db.prepare("SELECT id, tile_id AS tileId, hp, pos_q AS q, pos_r AS r FROM homeland_wanderers WHERE id = ?").get(id);

/* ══ §H1 THE BEACON'S SEVEN HEXES ═════════════════════ */
console.log("§H1 the beacon's throw in the served payload");
const A = await mkHomelandTender("Light Tender");
db.prepare("UPDATE star_seeds SET level = 3 WHERE owner_key = ?").run(A.ownerKey);
freezeBattle(A.ownerKey);
let tiles = await tilesOf(A);
const seedTileId = db.prepare("SELECT tile_id AS id FROM star_seeds WHERE owner_key = ?").get(A.ownerKey).id;
const seedTile = tiles.find((t) => t.id === seedTileId);
ok("§H1 the seed's tile stands on the land", !!seedTile);
const ring1 = DIRS.map(([dq, dr]) => tileAt(tiles, seedTile.q + dq, seedTile.r + dr)).filter(Boolean);
ok("§H1 the seed's own hex reads FIGHTING (2)", seedTile.light === 2, `light=${seedTile.light}`);
ok("§H1 all six hexes around the beacon read FIGHTING (2)", ring1.length === 6 && ring1.every((t) => t.light === 2),
  ring1.map((t) => `${t.q},${t.r}:${t.light}`).join(" "));
const farTile = tiles.find((t) => hexDist(t, seedTile) >= 3);
ok("§H1 ground three rings out reads DARK (0)", !!farTile && farTile.light === 0, `light=${farTile?.light}`);

/* ══ §H2 THE WALL AND THE DOORWAY ═════════════════════ */
console.log("§H2 a wall darkens the hex behind it; a doorway in it lights the hex again");
const X = ring1[0];
// The throw's line, seed-heart to ring-heart, and the floor
// edge it crosses nearest its middle — the shared border's
// own edge stands among the construction's candidates.
async function wallAcrossThrow(fromAx, toAx) {
  const mid = [(fromAx[0] + toAx[0]) / 2, (fromAx[1] + toAx[1]) / 2];
  const plateMid = axialToPlate(mid[0], mid[1]);
  const cands = candidatesNear(plateMid).filter((c) => c.kind === "square" || c.kind === "triangle");
  const served = (await callOk("getTerritory", {}, A.token)).buildPieces ?? [];
  const placedKeys = new Set(served.map((p) => p.pieceKey));
  const floors = [];
  for (const c of cands) {
    const centroid = [c.verts.reduce((s, v) => s + v[0], 0) / c.verts.length, c.verts.reduce((s, v) => s + v[1], 0) / c.verts.length];
    if (Math.hypot(centroid[0] - plateMid[0], centroid[1] - plateMid[1]) > 1.6) continue;
    if (placedKeys.has(c.key)) { floors.push({ cand: c }); continue; }
    const r = await call("placeBuildPiece", { kind: c.kind, verts: c.verts }, A.token);
    if (r.status === 200) floors.push({ cand: c });
  }
  let best = null;
  for (const f of floors) {
    for (const e of edgesOf(f.cand.verts)) {
      const ea = plateToAxial(e[0]), eb = plateToAxial(e[1]);
      if (!segmentsCrossProper(fromAx, toAx, ea, eb)) continue;
      // Where along the edge the throw crosses: the crossing
      // point's parameter — the door's gap is the middle
      // two-fifths, so the truest test edge crosses near ½.
      const dx = eb[0] - ea[0], dy = eb[1] - ea[1];
      const len2 = dx * dx + dy * dy || 1;
      // Crossing point of the two segments (proper crossing
      // is already proven): solve fromAx + s·(toAx−fromAx).
      const ux = toAx[0] - fromAx[0], uy = toAx[1] - fromAx[1];
      const den = ux * dy - uy * dx || 1e-9;
      const s = ((ea[0] - fromAx[0]) * dy - (ea[1] - fromAx[1]) * dx) / den;
      const cxp = fromAx[0] + ux * s, cyp = fromAx[1] + uy * s;
      const tPar = ((cxp - ea[0]) * dx + (cyp - ea[1]) * dy) / len2;
      const score = Math.abs(tPar - 0.5);
      if (!best || score < best.score) best = { edge: e, tPar, score };
    }
  }
  return best;
}
const across = await wallAcrossThrow([seedTile.q, seedTile.r], [X.q, X.r]);
ok("§H2 floors stand along the throw and one of their edges crosses it near its middle",
  !!across && across.tPar > 0.3 && across.tPar < 0.7, across ? `t=${across.tPar}` : "no edge");
if (across) {
  const wallPiece = await callOk("placeBuildPiece", { kind: "wall", verts: across.edge }, A.token);
  freezeBattle(A.ownerKey);
  tiles = await tilesOf(A);
  const xWalled = tiles.find((t) => t.id === X.id);
  ok("§H2 with the WALL standing on the shared edge, the hex behind it reads DARK (0)", xWalled.light === 0, `light=${xWalled.light}`);
  const othersLit = ring1.filter((t) => t.id !== X.id).every((rt) => (tiles.find((t) => t.id === rt.id)?.light ?? -1) === 2);
  ok("§H2 the beacon's other five hexes stay FIGHTING behind no wall", othersLit);
  await callOk("removeBuildPiece", { id: wallPiece.piece.id }, A.token);
  await callOk("placeBuildPiece", { kind: "door", verts: across.edge }, A.token);
  freezeBattle(A.ownerKey);
  tiles = await tilesOf(A);
  const xDoored = tiles.find((t) => t.id === X.id);
  ok("§H2 with a DOORWAY in that same edge, the hex reads FIGHTING (2) again — the throw threads the gap", xDoored.light === 2, `light=${xDoored.light}`);
}
// The book's cast wards bar a throw the same way: a ward
// standing on the shared edge between the seed and Y.
// (Edge Works' edge walls barred throws here too, until
// the system was removed whole — Nigel, 2026-10-27.)
const Y = ring1[1];
const WALL_DIRS = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];
const WALL_OPP = [3, 4, 5, 0, 1, 2];
{
  // The edge between the seed tile and Y, in canonical form.
  const d = WALL_DIRS.findIndex(([dq, dr]) => seedTile.q + dq === Y.q && seedTile.r + dr === Y.r);
  const flip = Y.q < seedTile.q || (Y.q === seedTile.q && Y.r < seedTile.r);
  const cq = flip ? Y.q : seedTile.q, cr = flip ? Y.r : seedTile.r, cdir = flip ? WALL_OPP[d] : d;
  const edgeKey = `${cq},${cr},${cdir}`;
  db.prepare("INSERT INTO territory_workings (owner_key, spell_key, engine, kind, hue, tile_id, edge_key, q, r, dir, nums, hp, created_at) VALUES (?, 'seal', 'seal', 'ward', 'unaligned', ?, ?, ?, ?, ?, '{}', 15, ?)")
    .run(A.ownerKey, seedTile.id, edgeKey, cq, cr, cdir, Date.now());
  freezeBattle(A.ownerKey);
  tiles = await tilesOf(A);
  const yWarded = tiles.find((t) => t.id === Y.id);
  // The throw is barred — Y reads no FIGHTING. The ward is
  // itself made of light, faintly: if its own canonical hex
  // is Y, Y wears that FAINT glow and nothing more.
  const wardHexIsY = cq === Y.q && cr === Y.r;
  ok("§H2 a cast WARD on the shared edge bars the throw — its hex reads no FIGHTING",
    yWarded.light === (wardHexIsY ? 1 : 0), `light=${yWarded.light}`);
  db.prepare("DELETE FROM territory_workings WHERE owner_key = ? AND edge_key = ?").run(A.ownerKey, edgeKey);
}

/* ══ §H4 THE SPAWN BAR ════════════════════════════════ */
console.log("§H4 births never land on FIGHTING ground");
freezeBattle(A.ownerKey);
tiles = await tilesOf(A);
const maxRing = Math.max(...tiles.filter((t) => t.cursed).map(ringOf));
// A bastion building on purified ground beside the furthest
// cursed ring — its throw reaches onto the ring itself.
// (Ground the survey finds unpurified is purified white-box
// for the fixture, named here: the bastion needs a purified
// hex to stand on, as the game's own law requires of the
// seed it holds.)
let bastionTile = null;
for (const cand of tiles) {
  if (cand.id === seedTile.id) continue;
  const nearRing = tiles.some((t) => t.cursed && ringOf(t) === maxRing && hexDist(t, cand) === 1);
  if (!nearRing) continue;
  if (cand.cursed) db.prepare("UPDATE territory_tiles SET cursed = 0, element = 'root' WHERE id = ?").run(cand.id);
  db.prepare("INSERT INTO territory_buildings (owner_key, tile_id, building_type, placed_at) VALUES (?, ?, 'bastion', ?)")
    .run(A.ownerKey, cand.id, Date.now());
  freezeBattle(A.ownerKey);
  const t2 = await tilesOf(A);
  const litRing = t2.filter((t) => t.cursed && ringOf(t) === maxRing && t.light === 2);
  if (litRing.length) { bastionTile = cand; tiles = t2; break; }
  db.prepare("DELETE FROM territory_buildings WHERE owner_key = ? AND building_type = 'bastion'").run(A.ownerKey);
}
ok("§H4 a bastion building stands beside the furthest cursed ring and its throw lights ring ground FIGHTING",
  !!bastionTile, `ring=${maxRing}`);
if (bastionTile) {
  ok("§H4 the bastion's own hex reads FIGHTING (2)", (tiles.find((t) => t.id === bastionTile.id)?.light ?? -1) === 2);
  const standCursed = tiles.filter((t) => t.cursed && ringOf(t) === maxRing)[0];
  let totalSpawned = 0, spawnedOnLit = 0, spawnedOnUnlitRing = 0;
  for (let trial = 0; trial < 10; trial++) {
    db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(A.ownerKey);
    db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ?, wanderer_settled_beats = 0, battle_watermark = ?, tender_tile_id = ? WHERE owner_key = ?")
      .run(Date.now() - 185000, Date.now(), standCursed.id, A.ownerKey);
    const payload = await callOk("getTerritory", {}, A.token);
    const lightByTile = new Map(payload.tiles.map((t) => [t.id, t.light ?? 0]));
    for (const w of payload.wanderers) {
      totalSpawned++;
      if ((lightByTile.get(w.tileId) ?? 0) === 2) spawnedOnLit++;
      else spawnedOnUnlitRing++;
    }
  }
  ok("§H4 across 10 cradle trials the dark was dealt at all", totalSpawned >= 3, `spawned=${totalSpawned}`);
  ok("§H4 no birth ever landed on a FIGHTING-lit hex", spawnedOnLit === 0, `onLit=${spawnedOnLit} of ${totalSpawned}`);
  ok("§H4 births did land on unlit ring ground — the bar is selective", spawnedOnUnlitRing >= 1, `unlit=${spawnedOnUnlitRing}`);
  db.prepare("UPDATE tender_progress SET tender_tile_id = NULL WHERE owner_key = ?").run(A.ownerKey);
  db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(A.ownerKey);
}

/* ══ §H6 FAINT SOURCES AND NON-SOURCES ════════════════ */
console.log("§H6 faint light glows and does not burn; what is not made of light is dark");
freezeBattle(A.ownerKey);
tiles = await tilesOf(A);
// A plain tile far from every source, for the rune.
const R = tiles.find((t) => hexDist(t, seedTile) >= 3 && t.id !== bastionTile?.id && hexDist(t, bastionTile ?? seedTile) >= 2);
ok("§H6 a plain tile stands clear of every source for the rune", !!R);
if (R) {
  // A rune of the book on R's own floor — the Grimoire's
  // Lattice (territory_workings). The book's runes are the
  // field's only runes since Edge Works' removal (Nigel,
  // 2026-10-27).
  db.prepare("INSERT INTO territory_workings (owner_key, spell_key, engine, kind, hue, tile_id, edge_key, q, r, dir, nums, hp, created_at) VALUES (?, 'lattice', 'lattice', 'rune', 'unaligned', ?, NULL, ?, ?, NULL, '{}', 6, ?)")
    .run(A.ownerKey, R.id, R.q, R.r, Date.now());
  freezeBattle(A.ownerKey);
  tiles = await tilesOf(A);
  const rLit = tiles.find((t) => t.id === R.id);
  ok("§H6 the rune's hex reads FAINT (1)", rLit.light === 1, `light=${rLit.light}`);
  // A Dream Shroom on its own hex (the code's building
  // name for the mushroom is 'dream-wheat').
  const M = tiles.find((t) => t.id !== R.id && hexDist(t, seedTile) >= 3 && t.id !== bastionTile?.id && hexDist(t, bastionTile ?? seedTile) >= 2);
  db.prepare("INSERT INTO territory_buildings (owner_key, tile_id, building_type, placed_at) VALUES (?, ?, 'dream-wheat', ?)")
    .run(A.ownerKey, M.id, Date.now());
  const W = tiles.find((t) => t.id !== R.id && t.id !== M.id && hexDist(t, seedTile) >= 3 && t.id !== bastionTile?.id && hexDist(t, bastionTile ?? seedTile) >= 2);
  db.prepare("INSERT INTO territory_buildings (owner_key, tile_id, building_type, placed_at) VALUES (?, ?, 'watchtower', ?)")
    .run(A.ownerKey, W.id, Date.now());
  freezeBattle(A.ownerKey);
  tiles = await tilesOf(A);
  ok("§H6 the Dream Shroom's hex reads FAINT (1) — the glowing mushroom gives its faint light",
    (tiles.find((t) => t.id === M.id)?.light ?? -1) === 1, `light=${tiles.find((t) => t.id === M.id)?.light}`);
  ok("§H6 the watchtower's hex reads DARK (0) — an ordinary building gives no light",
    (tiles.find((t) => t.id === W.id)?.light ?? -1) === 0, `light=${tiles.find((t) => t.id === W.id)?.light}`);
  // An ungrown seed on the ground: no light.
  const U = tiles.find((t) => t.id !== R.id && t.id !== M.id && t.id !== W.id && hexDist(t, seedTile) >= 3 && t.id !== bastionTile?.id && hexDist(t, bastionTile ?? seedTile) >= 2);
  db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at) VALUES (?, ?, 1, 'fallen', ?)")
    .run(A.ownerKey, U.id, Date.now());
  freezeBattle(A.ownerKey);
  tiles = await tilesOf(A);
  ok("§H6 an ungrown starseed's hex reads DARK (0)", (tiles.find((t) => t.id === U.id)?.light ?? -1) === 0,
    `light=${tiles.find((t) => t.id === U.id)?.light}`);
  // A lone standing Awoken: no light. (The awakened row is
  // a fixture in the drives' own pattern — layer pieces and
  // a composition, minted straight into the record.)
  const partEl = (nm, cat) => Number(db.prepare(
    "INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 2, 2, 'sky', ?, 'image/png', ?)")
    .run(nm, cat, `lighting/${nm}.png`, Date.now()).lastInsertRowid);
  const comp = JSON.stringify([["body", "sky"], ["arms", "sky"], ["head", "sky"]].map(([cat, el]) => ({
    source_id: `db:${partEl(`Lampkin ${cat}`, cat)}`, name: `Lampkin ${cat}`, category: cat, rarity: "common", power: 2, toughness: 2, element: el,
  })));
  const kinId = Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES ('Lampkin', 'Lampkin', 'lighting/kin.png', ?, 'tender', 'Light Tender', ?, ?)")
    .run(comp, A.ownerKey, Date.now()).lastInsertRowid);
  const A2 = tiles.find((t) => ![R.id, M.id, W.id, U.id].includes(t.id) && hexDist(t, seedTile) >= 3 && t.id !== bastionTile?.id && hexDist(t, bastionTile ?? seedTile) >= 2);
  db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, stance, placed_at, last_moved_at) VALUES (?, ?, ?, 'defense', ?, ?)")
    .run(A.ownerKey, kinId, A2.id, Date.now(), Date.now());
  freezeBattle(A.ownerKey);
  tiles = await tilesOf(A);
  ok("§H6 a lone standing Awoken's hex reads DARK (0) — she gives no light",
    (tiles.find((t) => t.id === A2.id)?.light ?? -1) === 0, `light=${tiles.find((t) => t.id === A2.id)?.light}`);
  // The Tender's own standing hex: dark, and a Fray
  // sharing it burns nothing. FAINT ground burns nothing
  // either — a second Fray stands on the rune's hex.
  const S2 = tiles.find((t) => ![R.id, M.id, W.id, U.id, A2.id].includes(t.id) && hexDist(t, seedTile) >= 3 && t.id !== bastionTile?.id && hexDist(t, bastionTile ?? seedTile) >= 2);
  if (S2.cursed) db.prepare("UPDATE territory_tiles SET cursed = 0, element = 'root' WHERE id = ?").run(S2.id);
  db.prepare("UPDATE tender_progress SET tender_tile_id = ? WHERE owner_key = ?").run(S2.id, A.ownerKey);
  const frayOnRune = placeFray(A.ownerKey, R, 50);
  const frayOnTender = placeFray(A.ownerKey, S2, 50);
  db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now() - 10000, A.ownerKey);
  const settled = await callOk("getTerritory", {}, A.token);
  const s2Lit = settled.tiles.find((t) => t.id === S2.id);
  ok("§H6 the Tender's own standing hex reads DARK (0) — she does not glow", s2Lit.light === 0, `light=${s2Lit.light}`);
  ok("§H6 a Fray standing on FAINT ground (the rune's hex) loses nothing across a 10 s settle",
    frayRow(frayOnRune)?.hp === 50, `hp=${frayRow(frayOnRune)?.hp}`);
  // Her presence is no light: a burn would cost whole d10
  // steps — at least 10 HP across this window, never a
  // fraction. (A dark sharing the Tender's own hex can
  // take a fractional nibble from the standing body/company
  // machinery on that hex; that is not light, and it is
  // bounded here under 5 HP against the burn's floor of 10.)
  ok("§H6 a Fray sharing the Tender's hex takes no burn across the settle — her presence is no light",
    frayRow(frayOnTender) != null && (frayRow(frayOnTender)?.hp ?? 0) > 45, `hp=${frayRow(frayOnTender)?.hp}`);
  db.prepare("UPDATE tender_progress SET tender_tile_id = NULL WHERE owner_key = ?").run(A.ownerKey);
  db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(A.ownerKey);
}

/* ══ §H3 THE BURN AND THE LAND-DEFENCE FELL ═══════════ */
console.log("§H3 the burn — d10 per settled second, and the fell the light makes");
const B = await mkHomelandTender("Burn Tender");
db.prepare("UPDATE star_seeds SET level = 3 WHERE owner_key = ?").run(B.ownerKey);
freezeBattle(B.ownerKey);
let bTiles = await tilesOf(B);
const bSeedId = db.prepare("SELECT tile_id AS id FROM star_seeds WHERE owner_key = ?").get(B.ownerKey).id;
const bSeed = bTiles.find((t) => t.id === bSeedId);
// The beacon's ground stands purified for the fixture, so
// a dark placed on it has nowhere it would rather stand:
// its own hex is its goal, and the burn is all that moves.
// (Purified by the surveyed ring, tile by tile.)
db.prepare("UPDATE territory_tiles SET cursed = 1 WHERE owner_key = ?").run(B.ownerKey);
for (const t of bTiles) if (hexDist(t, bSeed) <= 1) db.prepare("UPDATE territory_tiles SET cursed = 0, element = 'root' WHERE id = ?").run(t.id);
freezeBattle(B.ownerKey);
bTiles = await tilesOf(B);
const bRing = DIRS.map(([dq, dr]) => tileAt(bTiles, bSeed.q + dq, bSeed.r + dr)).filter(Boolean);
ok("§H3 the beacon's ring stands purified for the burn fixture", bRing.length === 6 && bRing.every((t) => t.light === 2),
  bRing.map((t) => t.light).join(","));
const burnFray = placeFray(B.ownerKey, bRing[0], 500);
// 60 HP: the first window's burn (at most 50) cannot fell
// it; the second window's (at least 30, at most 300) must.
const fellFray = placeFray(B.ownerKey, bRing[1], 60);
const bankBefore = db.prepare("SELECT protection_bank_ms AS bank FROM tender_progress WHERE owner_key = ?").get(B.ownerKey)?.bank ?? 0;
db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now() - 5000, B.ownerKey);
await callOk("getTerritory", {}, B.token);
const burnAfter5 = frayRow(burnFray)?.hp;
ok("§H3 across 5 settled seconds on FIGHTING ground the Fray lost between 5 and 50 HP — d10 steps, one per second",
  burnAfter5 != null && burnAfter5 < 500 && burnAfter5 >= 450, `hp=${burnAfter5}`);
ok("§H3 the 60-HP Fray survives the first window — the burn is per-second, not a wipe",
  !!frayRow(fellFray) && (frayRow(fellFray)?.hp ?? 0) >= 10, `hp=${frayRow(fellFray)?.hp}`);
db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now() - 30000, B.ownerKey);
await callOk("getTerritory", {}, B.token);
ok("§H3 across 30 more settled seconds the Fray on FIGHTING ground is felled by the light",
  !frayRow(fellFray), `row=${JSON.stringify(frayRow(fellFray))}`);
const bankAfter = db.prepare("SELECT protection_bank_ms AS bank FROM tender_progress WHERE owner_key = ?").get(B.ownerKey)?.bank ?? 0;
ok("§H3 the light's fell is credited as a land-defence fell — the protection bank rose by the Fray's measure (60000 ms)",
  bankAfter - bankBefore === 60000, `bank ${bankBefore} -> ${bankAfter}`);
ok("§H3 the 500-HP Fray still stands (it burned, it did not fall)", !!frayRow(burnFray), `hp=${frayRow(burnFray)?.hp}`);

/* ══ §H5 THE WALK BARRED ══════════════════════════════ */
console.log("§H5 the dark's settle step never lands on FIGHTING ground");
db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(B.ownerKey);
// The seed's hex alone stands pure: it is the walk's goal.
db.prepare("UPDATE territory_tiles SET cursed = 1 WHERE owner_key = ? AND id != ?").run(B.ownerKey, bSeed.id);
db.prepare("UPDATE territory_tiles SET cursed = 0, element = 'root' WHERE id = ?").run(bSeed.id);
freezeBattle(B.ownerKey);
bTiles = await tilesOf(B);
const startTile = bTiles.find((t) => hexDist(t, bSeed) === 3);
ok("§H5 a cursed tile three rings from the beacon stands for the walk", !!startTile);
if (startTile) {
  const walker = placeFray(B.ownerKey, startTile, 60);
  db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now() - 30000, B.ownerKey);
  const walked = await callOk("getTerritory", {}, B.token);
  const wRow = frayRow(walker);
  const wTile = walked.tiles.find((t) => t.id === wRow?.tileId);
  ok("§H5 after a 30 s settle the walker still stands — halted, not felled", !!wRow && (wRow?.hp ?? 0) > 0, `hp=${wRow?.hp}`);
  ok("§H5 the walker never stood on FIGHTING ground — it halts outside the beacon's ring (dist ≥ 2)",
    !!wTile && hexDist(wTile, bSeed) >= 2 && (wTile.light ?? 0) !== 2,
    `tile=${wTile?.q},${wTile?.r} dist=${wTile ? hexDist(wTile, bSeed) : "?"} light=${wTile?.light}`);
  // The control: strike the seed back to a Starseed — no
  // light at all — and the same walk reaches the goal.
  db.prepare("UPDATE star_seeds SET level = 1 WHERE owner_key = ?").run(B.ownerKey);
  db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(B.ownerKey);
  const walker2 = placeFray(B.ownerKey, startTile, 60);
  db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now() - 30000, B.ownerKey);
  const walked2 = await callOk("getTerritory", {}, B.token);
  const w2Row = frayRow(walker2);
  const w2Tile = walked2.tiles.find((t) => t.id === w2Row?.tileId);
  ok("§H5 with the light gone the same walk reaches the goal's ring (dist ≤ 1) — the light was the bar",
    !!w2Tile && hexDist(w2Tile, bSeed) <= 1, `tile=${w2Tile?.q},${w2Tile?.r} dist=${w2Tile ? hexDist(w2Tile, bSeed) : "?"}`);
  db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(B.ownerKey);
}

/* ══ §H7 THE FACE (homeland, real browser) ════════════ */
console.log("§H7 the homeland's face — the light layer in the DOM");
{
  // A wanderer on far dark ground for the figure check —
  // clear of the beacon's throw AND of the field company's
  // ground (a company strikes darks near its own standing;
  // the figure must live to be looked at).
  freezeBattle(A.ownerKey);
  const domTiles = await tilesOf(A);
  const companyTileId = db.prepare("SELECT tile_id AS id FROM field_placements WHERE owner_key = ? LIMIT 1").get(A.ownerKey)?.id;
  const companyTile = domTiles.find((t) => t.id === companyTileId) ?? seedTile;
  const darkHex = domTiles.find((t) => t.cursed && (t.light ?? 0) === 0 && hexDist(t, seedTile) >= 3 && hexDist(t, companyTile) >= 3);
  ok("§H7 a far dark hex stands for the figure check", !!darkHex);
  if (darkHex) placeFray(A.ownerKey, darkHex, 40);
  freezeBattle(A.ownerKey);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror:lighting]", String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, A.token);
  const evalRetry = async (fn, tries = 4) => {
    let lastErr = null;
    for (let i = 0; i < tries; i++) {
      try { return await page.evaluate(fn); }
      catch (e) { lastErr = e; if (!/detached Frame|Execution context was destroyed|Cannot find context/i.test(String(e))) throw e; await sleep(1000); }
    }
    throw lastErr;
  };
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2500);
  const door = await page.$(".deck-button");
  ok("§H7 the home face offers the deck door", !!door);
  if (door) {
    await door.click();
    await page.waitForFunction(() => !!window.__tenderJump && !!window.__tenderJump.pos(), { timeout: 30000 }).catch(() => {});
    await page.waitForSelector(".light-layer", { timeout: 30000 }).catch(() => {});
    await sleep(600);
    await evalRetry(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Skip");
      if (b) b.click();
      const cer = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Tend on");
      if (cer) cer.click();
      document.querySelector(".margin-guide-dismiss")?.click();
    }).catch(() => {});
    await sleep(800);
    const dom = await evalRetry(() => {
      const layer = document.querySelector(".light-layer");
      if (!layer) return { layer: false };
      const titles = [...document.querySelectorAll("title")];
      const wt = titles.find((t) => (t.textContent ?? "").startsWith("Loose the Single Blade"));
      const wg = wt ? wt.closest("g") : null;
      const wimg = wg ? wg.querySelector("image") : null;
      return {
        layer: true,
        glowFighting: layer.querySelectorAll('.light-glow[data-glow="fighting"]').length,
        hexes: layer.querySelectorAll(".light-hex").length,
        dusk: layer.querySelectorAll(".light-dusk").length,
        // The book's rune (§H6's Lattice) stands drawn:
        // its figure's title rides the workings layer.
        // (The .edge-light-glow line this once read was an
        // Edge Works drawing — that system is removed
        // whole, Nigel 2026-10-27.)
        runeDrawn: titles.some((t) => (t.textContent ?? "").includes("— rune")),
        wanderer: !!wg,
        wandererFilter: wimg ? (wimg.style.filter ?? "") : null,
        wandererWash: wg ? (wg.innerHTML.includes("7,9,22") || wg.innerHTML.includes("7, 9, 22")) : null,
        order: wg ? (layer.compareDocumentPosition(wg) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 : null,
        titlesSeen: titles.map((t) => (t.textContent ?? "").slice(0, 40)).slice(0, 24),
      };
    });
    ok("§H7 the light layer stands in the homeland DOM", dom.layer === true);
    ok("§H7 the beacon's light is drawn as continuous glow from its source (.light-glow[data-glow=fighting] ellipses)", (dom.glowFighting ?? 0) > 0, `n=${dom.glowFighting}`);
    ok("§H7 NO hex-shaped light remains — zero .light-hex polygons in the layer", dom.hexes === 0, `n=${dom.hexes}`);
    ok("§H7 the dusk stands as ONE continuous wash (a single .light-dusk path), not per-hex shapes", dom.dusk === 1, `n=${dom.dusk}`);
    ok("§H7 the book's rune stands drawn on its hex (its figure in the workings layer)", dom.runeDrawn === true);
    ok("§H7 a wanderer figure stands on the dark ground", dom.wanderer === true,
      dom.wanderer === true ? "" : `titles: ${JSON.stringify(dom.titlesSeen ?? [])}`);
    ok("§H7 the wanderer's figure is NOT darkened — no filter on its face, no dusk wash in its group",
      dom.wanderer === true && dom.wandererFilter === "" && dom.wandererWash === false,
      `filter=${dom.wandererFilter} wash=${dom.wandererWash}`);
    ok("§H7 the light layer sits BELOW the standings in DOM order (figures paint after it)", dom.order === true);
    await page.screenshot({ path: join(SHOTS, "homeland-lighting.png") }).catch(() => {});
  }
  await browser.close();
}

/* ══ THE TABLE — seats and the wire ═══════════════════ */
class DevSeat {
  constructor() { this.state = null; this.you = null; this.errors = []; }
  async join(name, roomId) {
    this.ws = new WebSocket(`ws://127.0.0.1:39931/table/ws`);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data));
        if (m.type === "state") { this.state = m.state; if (m.you) this.you = m.you; }
        else if (m.type === "error") this.errors.push(String(m.message ?? ""));
      } catch { /* torn frame */ }
    };
    this.send({ type: "join", devName: name, room: roomId });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  async waitYou(what, ms = 12000) { const s = realNow(); while (realNow() - s < ms) { if (this.you) return; await sleep(120); } throw new Error("dev seat wait: " + what); }
}
class Actor {
  constructor() { this.state = null; this.you = null; this.errors = []; }
  async join(tt, room) {
    this.ws = new WebSocket(`ws://127.0.0.1:39931/table/ws`);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data));
        if (m.type === "state") { this.state = m.state; if (m.you) this.you = m.you; }
        else if (m.type === "error") this.errors.push(String(m.message ?? ""));
      } catch { /* torn frame */ }
    };
    this.send({ type: "join", authToken: tt, room });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  async waitYou(what, ms = 12000) { const s = realNow(); while (realNow() - s < ms) { if (this.you) return; await sleep(120); } throw new Error("actor wait: " + what); }
}
function watchRoom(roomId) {
  const wstate = { state: null };
  const wws = new WebSocket(`ws://127.0.0.1:39931/table/ws`);
  return new Promise((resolve) => {
    wws.onopen = () => { wws.send(JSON.stringify({ type: "join", room: roomId, watch: true, name: "Light Watcher" })); resolve({ wstate, wws }); };
    wws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") wstate.state = m.state; } catch { /* torn frame */ } };
  });
}
const waitFor = async (fn, what, ms = 25000) => { const s = realNow(); while (realNow() - s < ms) { let v = false; try { v = fn(); } catch { v = false; } if (v) return true; await sleep(80); } throw new Error("drive wait: " + what); };
const tryWait = async (fn, ms) => { try { await waitFor(fn, "tryWait", ms); return true; } catch { return false; } };
const parseAx = (id) => id.split(",").map(Number);
const axDist = (a, b) => { const [aq, ar] = parseAx(a); const [bq, br] = parseAx(b); return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(aq + ar - bq - br)); };
const K40 = 40 / 796;
const centerOf = (id) => { const [q, r] = parseAx(id); return { x: q * 1292 * K40, y: q * 470 * K40 + r * 948 * K40 }; };
const RING1_IDS = DIRS.map(([dq, dr]) => `${dq},${dr}`);

const tablePartEl = (pname, category) => Number(db.prepare(
  "INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 2, 2, 'sky', ?, 'image/png', ?)")
  .run(pname, category, `lighting-table/${pname}.png`, Date.now()).lastInsertRowid);
const mkTableKin = (ownerKey, ownerName, kname) => {
  const comp = JSON.stringify(["body", "arms", "head"].map((category) => ({
    source_id: `db:${tablePartEl(`${kname} ${category}`, category)}`,
    name: `${kname} ${category}`, category, rarity: "common", power: 2, toughness: 2, element: "sky",
  })));
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, 'lighting-table/kin.png', ?, 'tender', ?, ?, ?)")
    .run(kname, kname, comp, ownerName, ownerKey, Date.now()).lastInsertRowid);
};
async function mkTableTender(name, discId) {
  const claim = await callOk("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, Date.now());
  // The choosing opens after the first three wakes — three
  // kin stand woken for her (the drives' own fixture road).
  for (const w of ["Wake One", "Wake Two", "Wake Three"]) mkTableKin(ownerKey, name, `${name} ${w}`);
  await callOk("chooseClass", { classKey: "warden" }, claim.token); // the Table seats only classed Tenders
  const tt = issueTableToken({ id: discId, name });
  const bindCode = (await callOk("getTableBindCode", {}, claim.token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
  if (!bindRes.ok) throw new Error("table/bind failed for " + name + ": " + bindRes.status);
  return { token: claim.token, ownerKey, tt, name };
}

const CAMPAIGN_ROOM = "campaign-lighting";
const { wstate } = await watchRoom(CAMPAIGN_ROOM);
const st = new DevSeat(); await st.join("Light Storytender", CAMPAIGN_ROOM); await st.waitYou("the storytender's seat");
st.send({ type: "claimStoryteller" });
await waitFor(() => !!st.you?.storytender, "the storytender claims her seat");
const Kpr = await mkTableTender("Light Keeper", "disc-lighting-k");
const keeper = new Actor(); await keeper.join(Kpr.tt, CAMPAIGN_ROOM); await keeper.waitYou("the keeper's seat");
// The white-box door (partyBattleSeatFor) opens only while
// a battle stands in the room — so a first deal is struck
// now, at the seed's ungrown stage; the light fixtures are
// laid in the same breath as the seed is raised (§T1), long
// before any dealt dark could burn out and end the battle.
st.send({ type: "stAdd", kind: "fray" });
st.send({ type: "stAdd", kind: "fray" });
st.send({ type: "stDeal" });
await waitFor(() => !!partyBattleSeatFor(Kpr.ownerKey)?.room, "the room captured once its battle stands");
const room = partyBattleSeatFor(Kpr.ownerKey).room;
ok("the campaign room stands captured white-box for its fixtures (the drives' own road)", !!room);
const wireTile = (id) => (wstate.state?.map ?? []).find((t) => t.id === id) ?? null;
const wireDark = (id) => (wstate.state?.dark ?? []).find((e) => e.id === id) ?? null;
const pokeState = () => st.send({ type: "stNarrate", text: "The light is reckoned." });
const placeTableDark = (id, hex, hp, extra = {}) => {
  room.dark.set(id, {
    id, hex, kind: "fray", label: "Fray", art: null, power: 1, hp, maxHp: hp,
    pinnedUntil: 0, pos: { ...centerOf(hex) }, target: null, lastTile: hex,
    armor: 11, lvl: 1, speedGauge: 0, ...extra,
  });
};

/* ══ §T1 THE TABLE'S BEACON, SERVED ═══════════════════ */
console.log("§T1 the Table beacon's seven hexes in the served state");
room.seedGrowth.level = 3; // white-box: the seed stands grown to the Beacon (the feeding road is drive-table-seed-growth's proof)
pokeState();
await waitFor(() => wireTile("0,0")?.light === 2, "the served beacon light");
ok("§T1 the seed's hex serves FIGHTING (2)", wireTile("0,0")?.light === 2, `light=${wireTile("0,0")?.light}`);
ok("§T1 all six hexes around the Table's beacon serve FIGHTING (2)",
  RING1_IDS.every((id) => wireTile(id)?.light === 2), RING1_IDS.map((id) => `${id}:${wireTile(id)?.light}`).join(" "));
const farTableTile = (wstate.state?.map ?? []).find((t) => axDist(t.id, "0,0") === 3);
ok("§T1 a hex three rings out serves DARK (0)", !!farTableTile && farTableTile.light === 0, `light=${farTableTile?.light}`);
ok("§T1 the campaign room serves its override ledger (an array, empty before any hand is laid)",
  Array.isArray(wstate.state?.lightOverrides) && wstate.state.lightOverrides.length === 0,
  JSON.stringify(wstate.state?.lightOverrides));

/* ══ §T2 THE WALK BARRED AT THE TABLE ═════════════════ */
console.log("§T2 a dealt dark never stands on FIGHTING ground");
const walkStart = (wstate.state?.map ?? []).find((t) => axDist(t.id, "0,0") === 4 && t.cursed) ?? (wstate.state?.map ?? []).find((t) => axDist(t.id, "0,0") === 4);
placeTableDark("light-walk-1", walkStart.id, 60); // the battle clock already runs from §T1's first deal; the fixture dark walks by the same referee
await waitFor(() => room.battle.active === true, "the battle stands joined");
{
  const seen = [];
  const s0 = realNow();
  while (realNow() - s0 < 20000) {
    const e = wireDark("light-walk-1");
    if (e) seen.push({ hex: e.hex, light: wireTile(e.hex)?.light ?? 0, ring: axDist(e.hex, "0,0") });
    if (seen.length > 10 && Math.min(...seen.map((x) => x.ring)) <= 2) break;
    await sleep(300);
  }
  ok("§T2 the walking dark was watched on its road in", seen.length >= 5, `samples=${seen.length}`);
  ok("§T2 it never stood on a FIGHTING hex across the whole walk", seen.every((x) => x.light !== 2),
    seen.map((x) => `${x.hex}:${x.light}`).join(" "));
  ok("§T2 it closed in toward the seed (reached ring 2, the light's edge)", Math.min(...seen.map((x) => x.ring)) <= 2,
    `minRing=${Math.min(...seen.map((x) => x.ring))}`);
}

/* ══ §T3 THE BURN AT THE TABLE ════════════════════════ */
console.log("§T3 a dark on beacon-lit ground burns and fells through the one door");
placeTableDark("light-burn-1", RING1_IDS[0], 40);
pokeState();
await waitFor(() => !!wireDark("light-burn-1"), "the burn dark stands served");
{
  const samples = [];
  const s0 = realNow();
  while (realNow() - s0 < 8000) {
    const e = wireDark("light-burn-1");
    if (e) samples.push(e.hp);
    if (samples.length >= 4 && samples[0] - samples[samples.length - 1] >= 4) break;
    await sleep(500);
  }
  ok("§T3 the dark on FIGHTING ground loses HP across the room's settles (d10 a second, accruing)",
    samples.length >= 2 && samples[samples.length - 1] < samples[0], samples.join(" -> "));
  const low = room.dark.get("light-burn-1");
  if (low) low.hp = 6; // white-box: the last of its body, so the fell itself is watched, not waited out
  const felled = await tryWait(() => !wireDark("light-burn-1"), 9000);
  ok("§T3 the burning dark fells", felled);
  ok("§T3 the tale names no slayer for the light's fell — \"The Fray unravels!\"",
    (wstate.state?.tale ?? []).some((t) => t.text === "The Fray unravels!"),
    JSON.stringify((wstate.state?.tale ?? []).slice(-3)));
}

/* ══ §T4 THE DM'S HAND ════════════════════════════════ */
console.log("§T4 the campaign hand — refused to guests, obeyed by the mechanics");
const guest = new DevSeat(); await guest.join("Light Guest", CAMPAIGN_ROOM); await guest.waitYou("the guest's seat");
guest.send({ type: "stLight", hex: "0,0", level: 0 });
await waitFor(() => guest.errors.some((e) => e.includes("Only the Storytender holds that instrument")), "the guest's refusal");
ok("§T4 a guest seat's stLight is refused with the standing words", true);
ok("§T4 the refusal changed nothing — no override stands", (wstate.state?.lightOverrides ?? []).length === 0,
  JSON.stringify(wstate.state?.lightOverrides));
// A dark burning under the beacon on a second ring hex.
const H2 = RING1_IDS[1];
placeTableDark("light-dm-1", H2, 300);
pokeState();
await waitFor(() => !!wireDark("light-dm-1"), "the dm dark stands served");
{
  const hpA = wireDark("light-dm-1")?.hp ?? 0;
  await sleep(2500);
  const hpB = wireDark("light-dm-1")?.hp ?? 0;
  ok("§T4 before her hand is laid, the dark on beacon ground burns", hpB < hpA, `${hpA} -> ${hpB}`);
  st.send({ type: "stLight", hex: H2, level: 0 });
  await waitFor(() => wireTile(H2)?.light === 0 && (wstate.state?.lightOverrides ?? []).some(([h, l]) => h === H2 && l === 0),
    "the darkened hex serves dark with its override standing");
  ok("§T4 the Storytender's hand darkens a beacon-lit hex — it serves DARK (0) and the override stands with the campaign", true);
  const hpC = wireDark("light-dm-1")?.hp ?? 0;
  await sleep(3000);
  const hpD = wireDark("light-dm-1")?.hp ?? 0;
  ok("§T4 with the hex darkened the burn stops cold (HP unmoved across 3 s)", hpC === hpD && hpC > 0, `${hpC} -> ${hpD}`);
  st.send({ type: "stLight", hex: H2, level: null });
  await waitFor(() => wireTile(H2)?.light === 2, "the cleared override lets the beacon's light return");
  ok("§T4 clearing her setting lets the beacon's light return (FIGHTING, 2)", true);
  const hpE = wireDark("light-dm-1")?.hp ?? 0;
  await sleep(2500);
  const hpF = wireDark("light-dm-1")?.hp ?? 0;
  ok("§T4 and the burn resumes on the returned light", hpF < hpE, `${hpE} -> ${hpF}`);
}
// Her raised light burns where no beacon stands.
const H4 = (wstate.state?.map ?? []).find((t) => axDist(t.id, "0,0") === 4 && t.id !== walkStart.id)?.id ?? "4,0";
placeTableDark("light-dm-2", H4, 300, { pinnedUntil: Date.now() + 120000 }); // pinned, so only the light can move its HP
pokeState();
await waitFor(() => !!wireDark("light-dm-2"), "the pinned dark stands served");
ok("§T4 the far hex serves DARK (0) before she raises light there", wireTile(H4)?.light === 0, `light=${wireTile(H4)?.light}`);
{
  const hpA = wireDark("light-dm-2")?.hp ?? 0;
  await sleep(2000);
  const hpB = wireDark("light-dm-2")?.hp ?? 0;
  ok("§T4 on dark ground the pinned dark loses nothing", hpA === hpB, `${hpA} -> ${hpB}`);
  st.send({ type: "stLight", hex: H4, level: 2 });
  await waitFor(() => wireTile(H4)?.light === 2, "her fighting light serves");
  const hpC = wireDark("light-dm-2")?.hp ?? 0;
  await sleep(3000);
  const hpD = wireDark("light-dm-2")?.hp ?? 0;
  ok("§T4 the DM-raised fighting light burns exactly like a beacon's", hpD < hpC, `${hpC} -> ${hpD}`);
}

/* ══ §T5 THE CASUAL ROOM ══════════════════════════════ */
console.log("§T5 a casual room exposes no hand at all");
const carl = new DevSeat(); await carl.join("Casual Carl", "casual-lighting"); await carl.waitYou("the casual seat");
ok("§T5 the casual room serves lightOverrides null — no ledger, no hand", carl.state?.lightOverrides === null,
  JSON.stringify(carl.state?.lightOverrides));
{
  const before = (carl.state?.map ?? []).find((t) => t.id === "0,0")?.light ?? 0;
  carl.send({ type: "stLight", hex: "0,0", level: 2 });
  await sleep(1500);
  const after = (carl.state?.map ?? []).find((t) => t.id === "0,0")?.light ?? 0;
  ok("§T5 an stLight attempt in a casual room changes nothing", carl.state?.lightOverrides === null && after === before,
    `before=${before} after=${after}`);
}

/* ══ §T6 THE TABLE'S FACE ═════════════════════════════ */
console.log("§T6 the Table's face — the light layer and the lit seed");
{
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror:table-lighting]", String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((session) => { window.__awokenTableSession = session; }, { authToken: Kpr.tt, room: CAMPAIGN_ROOM, name: Kpr.name });
  await page.goto(BASE + "/table?frame_id=lighting-drive", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".light-layer", { timeout: 30000 });
  await sleep(1500);
  const dom = await page.evaluate(() => {
    const layer = document.querySelector(".light-layer");
    const bulb = document.querySelector(".seed-bulb");
    const glyph = document.querySelector(".workings-layer");
    return {
      glowFighting: layer ? layer.querySelectorAll('[data-glow="fighting"]').length : 0,
      duskPaths: layer ? layer.querySelectorAll('.light-dusk').length : 0,
      hexPools: layer ? layer.querySelectorAll('.light-hex').length : 0,
      bulbLit: bulb ? bulb.classList.contains("lit") : false,
      order: layer && glyph ? (layer.compareDocumentPosition(glyph) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 : null,
    };
  });
  ok("§T6 the Table's light layer stands with a FIGHTING glow for the lit seed (the reunified face)", dom.glowFighting > 0, `n=${dom.glowFighting}`);
  ok("§T6 the Table's dusk stands as ONE path — and ZERO hex pools remain", dom.duskPaths === 1 && dom.hexPools === 0, `dusk=${dom.duskPaths} pools=${dom.hexPools}`);
  ok("§T6 the seed's bulb wears its lit read at the Beacon stage", dom.bulbLit === true);
  await page.screenshot({ path: join(SHOTS, "table-lighting.png") }).catch(() => {});
  await browser.close();
}

console.log(`\nLIGHTING DRIVE: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
