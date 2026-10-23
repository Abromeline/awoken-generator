// THE FREE STAND — THE PLACEMENT BUILD'S DRIVE (2026-10-23).
// Boots the real server on a scratch DATA_DIR and the real
// built client in headless Chrome, and proves Nigel's
// placement rulings whole:
//   §M THE MIGRATION: rows born before the standing point
//      existed (pos NULL) wake from a restart standing on
//      their tile's centre point — the only honest start —
//      and no figure anywhere rests on a keystone offset.
//   §A SUMMON + FOLLOW + MUSTER POINT (API): a summoned
//      Awokin is born follow=1 on a real free point; when
//      the Tender walks away it musters after him and
//      lands on the free point the muster dealt it near
//      the Tender — read back byte-identical through the
//      settle, and stable across further reads (NO DRIFT).
//   §S HELD POSITIONS (API): a standing figure's stored
//      point is identical across repeated reads, other
//      figures' marches and settles, and the Tender's own
//      moves — a held position, never a wandering one.
//   §B FREE POINTS + THE CURSE DARED (API): a march may
//      name its standing point and lands exactly on it;
//      a plain march lands on its destination's centre; a
//      march ONTO cursed ground is answered, and a march
//      THROUGH cursed ground takes the short road at the
//      curse's prices (the cursed step at twice the time).
//   §C THE CROWDING GATE (API): a tile holding 5 refuses
//      no march — the pace is taxed ×6/4 against a ≤4
//      control at the walker's own gait (root: 3.2 s/hex,
//      read off the stored march hours in milliseconds) —
//      and a summon onto a fully crowded ring still lands.
//   §B2 THE LINE, IN THE BROWSER: two figures line-march
//      onto drawn blips; their served march points equal
//      the drawn blip points (not centres, not keystones),
//      and they come to rest standing on them. A second,
//      short line inside one hex lands both figures on
//      that hex at two distinct spots of their own.
//   §D NO DRAWING CAP: six figures standing on one tile
//      ALL render in the real page.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-free-stand.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

const OUT = "/home/hatch/workspace/free-stand-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-freestand-"));
process.env.PORT = "3993";
process.env.WORKSHOP_PASSWORD = "<MASKED_SECRET_002>";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3993";
const PW = "freestand-drive-password";
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
  if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return data?.data ?? data;
}
async function callRaw(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data: data?.data ?? data };
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up, as the other drives do */ }

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
const KEYSTONES = [[0, 0.28], [-0.30, 0.14], [0.30, 0.14], [0, -0.24]];
const onKeystone = (dq, dr) => KEYSTONES.some(([kq, kr]) => Math.abs(dq - kq) < 1e-9 && Math.abs(dr - kr) < 1e-9);

function seedAwokin(ownerKey, tenderName, name, partPower = 2) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, 'root', ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, partPower, partPower, `freestand/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: partPower, toughness: partPower, element: "root" });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `freestand/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
async function claimWithExp(name, exp) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, exp, Date.now());
  return { token: claim.token, ownerKey };
}
function seedWorld(ownerKey, radius, cursedAt = []) {
  const nowT = Date.now();
  const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', ?, ?)");
  const tileId = new Map();
  for (let q = -radius; q <= radius; q++) for (let r = -radius; r <= radius; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > radius) continue;
    const cursed = cursedAt.some(([cq, cr]) => cq === q && cr === r) ? 1 : 0;
    tileId.set(`${q},${r}`, Number(insTile.run(ownerKey, q, r, cursed, nowT).lastInsertRowid));
  }
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 100000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 100000").run(ownerKey, nowT);
  return tileId;
}
const insPlacePos = db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, follow, hp, pos_q, pos_r) VALUES (?, ?, ?, ?, ?, ?, 1000, ?, ?)");
const placeAt = (ownerKey, id, tileId, q, r, follow = 0) => insPlacePos.run(ownerKey, id, tileId, Date.now(), Date.now(), follow, q, r);
const ff = (id) => db.prepare("UPDATE field_placements SET march_ends = 1 WHERE awakened_id = ?").run(id);
const marchMs = (id) => {
  const row = db.prepare("SELECT march_since AS s, march_ends AS e FROM field_placements WHERE awakened_id = ?").get(id);
  return row && row.s != null && row.e != null ? row.e - row.s : null;
};
const placementOf = async (token, id) => {
  const t = await call("getTerritory", {}, token);
  return (t.placements ?? []).find((p) => p.awakenedId === id) ?? null;
};
const tileOf = async (token, tileId) => {
  const t = await call("getTerritory", {}, token);
  return (t.tiles ?? []).find((x) => x.id === tileId) ?? null;
};

/* ══ §M THE MIGRATION — OLD ROWS WAKE ON THEIR CENTRES ════ */
console.log("§M the migration — rows with no standing point wake on their tile's centre, on no keystone");
{
  const M = await claimWithExp("Free Migration", 0);
  const tiles = seedWorld(M.ownerKey, 2);
  const nowT = Date.now();
  const insBare = db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, follow, hp) VALUES (?, ?, ?, ?, ?, 0, 1000)");
  const m1 = seedAwokin(M.ownerKey, "Free Migration", "Old Row One");
  const m2 = seedAwokin(M.ownerKey, "Free Migration", "Old Row Two");
  insBare.run(M.ownerKey, m1, tiles.get("0,0"), nowT, nowT);
  insBare.run(M.ownerKey, m2, tiles.get("1,1"), nowT, nowT);
  const before = db.prepare("SELECT pos_q AS q, pos_r AS r FROM field_placements WHERE awakened_id = ?").get(m1);
  ok("the seeded old rows truly hold no standing point before the restart", before && before.q === null && before.r === null, JSON.stringify(before));
  // THE RESTART: a fresh process imports the store module
  // alone — the very boot path the server walks — against
  // the same DATA_DIR, and its migration runs again.
  execFileSync("node", ["--input-type=module", "-e", `await import("file:///home/hatch/workspace/awoken-standalone/server/dist/store.js");`],
    { env: { ...process.env, DATA_DIR: process.env.DATA_DIR }, stdio: "pipe" });
  const p1 = await placementOf(M.token, m1);
  const p2 = await placementOf(M.token, m2);
  ok("after the restart both old rows stand on a real point — their own tile's centre",
    !!p1 && p1.posQ === 0 && p1.posR === 0 && !!p2 && p2.posQ === 1 && p2.posR === 1,
    JSON.stringify({ p1: [p1?.posQ, p1?.posR], p2: [p2?.posQ, p2?.posR] }));
  ok("neither rests on a keystone offset", !!p1 && !!p2 && !onKeystone(p1.posQ - 0, p1.posR - 0) && !onKeystone(p2.posQ - 1, p2.posR - 1));
}

/* ══ §A SUMMON → FOLLOW → THE MUSTER'S FREE POINT ════════ */
console.log("§A the summon — born following, born on a point; the muster deals a free point near the Tender");
{
  const A = await claimWithExp("Free Muster", 3800);
  const nowT = Date.now();
  db.prepare(`INSERT INTO tender_progress (owner_key, class_key, weapon_key, hp, weapon_next_at, updated_at)
    VALUES (?, 'warden', 'sword', 100, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', hp = 100`).run(A.ownerKey, nowT + 600000, nowT);
  const tiles = seedWorld(A.ownerKey, 4);
  // Four quiet squatters crowd the tile the Tender will
  // walk to, so the muster's dealing is pushed off his own
  // hex onto the ring — where the dealt point's spread can
  // be read in full.
  for (let i = 0; i < 4; i++) {
    const sq = seedAwokin(A.ownerKey, "Free Muster", `Squatter ${i}`);
    placeAt(A.ownerKey, sq, tiles.get("3,0"), 3, 0, 0);
  }
  const member = seedAwokin(A.ownerKey, "Free Muster", "Loyal One");
  await call("addToParty", { awakenedId: member }, A.token);
  let landed = null;
  for (let i = 0; i < 40 && !landed; i++) {
    const r = await call("summonAwoken", { awakenedId: member }, A.token);
    if (r.summoned) landed = r;
  }
  ok("the party member is summoned by the cast", !!landed);
  const born = await placementOf(A.token, member);
  const bornTile = await tileOf(A.token, born?.tileId);
  ok("the summoned figure is born FOLLOWING (follow=1 in the served state)", !!born && born.follow === 1, JSON.stringify(born?.follow));
  ok("it is born standing on a real free point — its landing tile's centre",
    !!born && !!bornTile && born.posQ === bornTile.q && born.posR === bornTile.r,
    JSON.stringify({ pos: [born?.posQ, born?.posR], tile: bornTile && [bornTile.q, bornTile.r] }));

  // The Tender walks away; the next read musters the follower.
  await call("setTenderTile", { tileId: tiles.get("3,0") }, A.token);
  const mustering = await placementOf(A.token, member);
  ok("the follower is on the muster road after the Tender walks away", !!mustering && !!mustering.marchPath);
  ok("the muster dealt it a free standing point (marchPos is served, not null)",
    !!mustering && mustering.marchPosQ != null && mustering.marchPosR != null,
    JSON.stringify({ q: mustering?.marchPosQ, r: mustering?.marchPosR }));
  const road = mustering?.marchPath ? JSON.parse(mustering.marchPath) : [];
  const slotTile = await tileOf(A.token, road[road.length - 1]);
  // The muster's dealing, recomputed from its own law:
  // first follower — depth 0.45, lateral −0.18.
  const dq = (slotTile?.q ?? 0) - 3, dr2 = (slotTile?.r ?? 0) - 0;
  const expQ = 3 + dq * 0.45 + (-dr2) * -0.18;
  const expR = 0 + dr2 * 0.45 + (dq + dr2) * -0.18;
  ok("the dealt point is the muster's own — near the Tender, spread off the ring slot's centre",
    !!mustering && Math.abs(mustering.marchPosQ - expQ) < 1e-9 && Math.abs(mustering.marchPosR - expR) < 1e-9
      && hexDist({ q: mustering.marchPosQ, r: mustering.marchPosR }, { q: 3, r: 0 }) <= 1,
    JSON.stringify({ dealt: [mustering?.marchPosQ, mustering?.marchPosR], expected: [expQ, expR], slot: slotTile && [slotTile.q, slotTile.r] }));

  ff(member);
  const settled = await placementOf(A.token, member);
  ok("it lands on the muster slot's tile, standing on the very point it was dealt",
    !!settled && !settled.marchPath && settled.tileId === road[road.length - 1]
      && settled.posQ === mustering.marchPosQ && settled.posR === mustering.marchPosR,
    JSON.stringify({ tile: settled?.tileId, pos: [settled?.posQ, settled?.posR] }));
  ok("its standing offset from its tile is no keystone's",
    !!settled && !!slotTile && !onKeystone(settled.posQ - slotTile.q, settled.posR - slotTile.r),
    JSON.stringify({ off: settled && slotTile && [settled.posQ - slotTile.q, settled.posR - slotTile.r] }));
  // NO DRIFT: further reads — each running the full settle
  // and muster machinery — move nothing.
  const again1 = await placementOf(A.token, member);
  const again2 = await placementOf(A.token, member);
  ok("NO DRIFT — the landed point is byte-identical across repeated settled reads",
    !!settled && !!again1 && !!again2
      && again1.posQ === settled.posQ && again1.posR === settled.posR
      && again2.posQ === settled.posQ && again2.posR === settled.posR
      && !again1.marchPath && !again2.marchPath);
}

/* ══ §S HELD POSITIONS ═══════════════════════════════════ */
console.log("§S held positions — a stored point does not wander while the world moves around it");
{
  const S = await claimWithExp("Free Stand", 0);
  stageProgress(S.ownerKey); // a class chosen — the Tender shows on his land
  const tiles = seedWorld(S.ownerKey, 4);
  const standfast = seedAwokin(S.ownerKey, "Free Stand", "Standfast");
  placeAt(S.ownerKey, standfast, tiles.get("0,0"), 0.35, -0.2, 0);
  const mover = seedAwokin(S.ownerKey, "Free Stand", "Mover");
  placeAt(S.ownerKey, mover, tiles.get("-2,0"), -2, 0, 0);
  const r1 = await placementOf(S.token, standfast);
  ok("the stored free point reads back exactly", !!r1 && r1.posQ === 0.35 && r1.posR === -0.2, JSON.stringify([r1?.posQ, r1?.posR]));
  await call("setMarch", { awakenedId: mover, tileId: tiles.get("0,1") }, S.token);
  ff(mover);
  await call("getTerritory", {}, S.token);
  await call("setTenderTile", { tileId: tiles.get("2,2") }, S.token);
  await call("getTerritory", {}, S.token);
  const r2 = await placementOf(S.token, standfast);
  const r3 = await placementOf(S.token, standfast);
  ok("NO DRIFT — identical after another figure's march and settle and the Tender's own move",
    !!r2 && !!r3 && r2.posQ === 0.35 && r2.posR === -0.2 && r3.posQ === 0.35 && r3.posR === -0.2,
    JSON.stringify({ r2: [r2?.posQ, r2?.posR], r3: [r3?.posQ, r3?.posR] }));
  ok("the held point is no keystone offset of its tile", !onKeystone(0.35, -0.2));
}

/* ══ §B FREE POINTS, AND THE CURSE DARED ═════════════════ */
console.log("§B free standing points — a march lands where it was pointed; the curse is priced, never barred");
{
  const B = await claimWithExp("Free March", 0);
  const tiles = seedWorld(B.ownerKey, 4, [[1, 0]]);
  const walker = seedAwokin(B.ownerKey, "Free March", "Pointed Walker");
  placeAt(B.ownerKey, walker, tiles.get("0,0"), 0, 0, 0);

  // THE POINTED MARCH: destination (2,−1), point (2.35,−1.2).
  const res = await call("setMarch", { awakenedId: walker, tileId: tiles.get("2,-1"), posQ: 2.35, posR: -1.2 }, B.token);
  ok("a march may name its free standing point", res.ok === true, JSON.stringify(res));
  const inFlight = await placementOf(B.token, walker);
  ok("the point rides the march in flight, served whole",
    !!inFlight && Math.abs(inFlight.marchPosQ - 2.35) < 1e-9 && Math.abs(inFlight.marchPosR - (-1.2)) < 1e-9,
    JSON.stringify([inFlight?.marchPosQ, inFlight?.marchPosR]));
  ff(walker);
  const landedP = await placementOf(B.token, walker);
  ok("it lands on the destination tile, standing on the very point it was given",
    !!landedP && landedP.tileId === tiles.get("2,-1") && Math.abs(landedP.posQ - 2.35) < 1e-9 && Math.abs(landedP.posR - (-1.2)) < 1e-9,
    JSON.stringify({ tile: landedP?.tileId, pos: [landedP?.posQ, landedP?.posR] }));
  ok("the resting point is neither the tile's centre nor a keystone",
    !!landedP && hexDist({ q: landedP.posQ, r: landedP.posR }, { q: 2, r: -1 }) > 0.1 && !onKeystone(landedP.posQ - 2, landedP.posR - (-1)));

  // THE CONTROL: a plain march rests on its destination's centre.
  const plain = seedAwokin(B.ownerKey, "Free March", "Plain Walker");
  placeAt(B.ownerKey, plain, tiles.get("-1,0"), -1, 0, 0);
  await call("setMarch", { awakenedId: plain, tileId: tiles.get("0,1") }, B.token);
  ff(plain);
  const plainLanded = await placementOf(B.token, plain);
  ok("control: a plain march rests on its destination's centre point, no point carried",
    !!plainLanded && plainLanded.tileId === tiles.get("0,1") && plainLanded.posQ === 0 && plainLanded.posR === 1 && plainLanded.marchPosQ == null,
    JSON.stringify({ pos: [plainLanded?.posQ, plainLanded?.posR], mp: plainLanded?.marchPosQ }));

  // ONTO THE CURSE: (0,0) → the cursed (1,0) is ANSWERED,
  // at twice the step (root gait 3.2 s → 6400 ms stored).
  const darer = seedAwokin(B.ownerKey, "Free March", "Curse Darer");
  placeAt(B.ownerKey, darer, tiles.get("0,0"), 0, 0, 0);
  const onto = await callRaw("setMarch", { awakenedId: darer, tileId: tiles.get("1,0") }, B.token);
  ok("a march ONTO cursed ground is answered, not refused", onto.status === 200 && onto.data?.ok === true, JSON.stringify(onto.data));
  ok("the cursed step is priced at twice the time (6400 ms for the root gait)",
    Math.abs((marchMs(darer) ?? -1) - 6400) <= 3, String(marchMs(darer)));
  ff(darer);
  const darerLanded = await placementOf(B.token, darer);
  ok("the darer stands on the cursed tile, on its centre point",
    !!darerLanded && darerLanded.tileId === tiles.get("1,0") && darerLanded.posQ === 1 && darerLanded.posR === 0);

  // THROUGH THE CURSE: (0,0) → (2,0) takes the SHORT road
  // through the cursed hex (2 steps: 6.4 s + 3.2 s), not
  // the clean detour (3 steps) the dead refusal forced.
  const through = seedAwokin(B.ownerKey, "Free March", "Through Darer");
  placeAt(B.ownerKey, through, tiles.get("0,0"), 0, 0, 0);
  const thru = await callRaw("setMarch", { awakenedId: through, tileId: tiles.get("2,0") }, B.token);
  ok("a march THROUGH cursed ground is answered, not refused", thru.status === 200 && thru.data?.ok === true, JSON.stringify(thru.data));
  const thruP = await placementOf(B.token, through);
  const thruRoad = thruP?.marchPath ? JSON.parse(thruP.marchPath) : [];
  ok("its road is the short one — two steps, through the cursed hex",
    thruRoad.length === 3 && thruRoad[1] === tiles.get("1,0") && thruRoad[2] === tiles.get("2,0"), JSON.stringify(thruRoad));
  ok("its hours carry the curse's price once (9600 ms: a doubled step and a plain one)",
    Math.abs((marchMs(through) ?? -1) - 9600) <= 3, String(marchMs(through)));
}

/* ══ §C THE CROWDING GATE ════════════════════════════════ */
console.log("§C the crowding gate — numbers tax the pace, they refuse nothing");
{
  const C = await claimWithExp("Free Crowd", 0);
  const nowT = Date.now();
  db.prepare(`INSERT INTO tender_progress (owner_key, class_key, weapon_key, hp, weapon_next_at, updated_at)
    VALUES (?, 'warden', 'sword', 100, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', hp = 100`).run(C.ownerKey, nowT + 600000, nowT);
  const tiles = seedWorld(C.ownerKey, 4);
  const jitters = [[0, 0], [0.2, 0.1], [-0.2, 0.15], [0.1, -0.2], [-0.12, -0.14]];
  for (let i = 0; i < 5; i++) {
    const s = seedAwokin(C.ownerKey, "Free Crowd", `X Stander ${i}`);
    placeAt(C.ownerKey, s, tiles.get("3,-1"), 3 + jitters[i][0], -1 + jitters[i][1], 0);
  }
  for (let i = 0; i < 3; i++) {
    const s = seedAwokin(C.ownerKey, "Free Crowd", `Y Stander ${i}`);
    placeAt(C.ownerKey, s, tiles.get("3,0"), 3, 0, 0);
  }
  const cw = seedAwokin(C.ownerKey, "Free Crowd", "Crowd Walker");
  placeAt(C.ownerKey, cw, tiles.get("1,-1"), 1, -1, 0);

  await call("setMarch", { awakenedId: cw, tileId: tiles.get("2,-1") }, C.token);
  ok("control step onto open ground: the walker's plain gait (3200 ms)",
    Math.abs((marchMs(cw) ?? -1) - 3200) <= 3, String(marchMs(cw)));
  ff(cw);
  await call("getTerritory", {}, C.token);
  const gated = await callRaw("setMarch", { awakenedId: cw, tileId: tiles.get("3,-1") }, C.token);
  ok("a march onto a tile holding five is NOT refused", gated.status === 200 && gated.data?.ok === true, JSON.stringify(gated.data));
  ok("its pace is the gated pace — ×6/4 (4800 ms against the 3200 control)",
    Math.abs((marchMs(cw) ?? -1) - 4800) <= 3, String(marchMs(cw)));
  ff(cw);
  await call("getTerritory", {}, C.token);
  await call("setMarch", { awakenedId: cw, tileId: tiles.get("3,0") }, C.token);
  ok("a step onto ground at the comfort count (3 standing + the walker) runs at full pace again (3200 ms)",
    Math.abs((marchMs(cw) ?? -1) - 3200) <= 3, String(marchMs(cw)));

  // THE SUMMON ONTO A FULL RING: every tile at the Tender's
  // side already holds four; the cast still lands.
  const ring = [[0, 0], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  for (const [q, r] of ring) for (let i = 0; i < 4; i++) {
    const s = seedAwokin(C.ownerKey, "Free Crowd", `Ring ${q},${r} #${i}`);
    placeAt(C.ownerKey, s, tiles.get(`${q},${r}`), q, r, 0);
  }
  const newcomer = seedAwokin(C.ownerKey, "Free Crowd", "Late Caller");
  await call("addToParty", { awakenedId: newcomer }, C.token);
  let fullRefusal = null, summoned = null;
  for (let i = 0; i < 60 && !summoned; i++) {
    const r = await callRaw("summonAwoken", { awakenedId: newcomer }, C.token);
    if (r.status >= 400) { fullRefusal = r.data?.error ?? JSON.stringify(r.data); break; }
    if (r.data?.summoned) summoned = r.data;
  }
  ok("a summon onto a fully crowded ring is never refused for numbers", !fullRefusal && !!summoned, String(fullRefusal ?? ""));
  const newP = await placementOf(C.token, newcomer);
  const standCount = db.prepare("SELECT COUNT(*) AS n FROM field_placements WHERE owner_key = ? AND tile_id = ?").get(C.ownerKey, tiles.get("0,0")).n;
  ok("it lands on the Tender's own crowded tile — five standing where four was the dead law's limit",
    !!newP && newP.tileId === tiles.get("0,0") && standCount === 5 && !!newP && newP.follow === 1,
    JSON.stringify({ tile: newP?.tileId, count: standCount, follow: newP?.follow }));
}

/* ══ THE BROWSER WORLD ═══════════════════════════════════ */
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const clickDisc = async (pg, sel, txt) => {
  const handle = await pg.evaluateHandle((q, t) => [...document.querySelectorAll(q)].find((d) => ((d.getAttribute("aria-label") || "") + " " + (d.textContent || "")).includes(t)), sel, txt);
  const el = handle.asElement();
  if (!el) throw new Error("wheel disc not found: " + txt);
  const box = await el.boundingBox();
  if (!box) throw new Error("wheel disc has no box: " + txt);
  await pg.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};
async function openField(token) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror:freestand]", String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
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
  await sleep(1000);
  // A return report or a tile panel standing over the map
  // swallows the first drag whole (the click-law drive's
  // own lesson) — set both down, as a player's hand would.
  for (let i = 0; i < 3; i++) {
    const stood = await page.evaluate(() => !!document.querySelector(".return-report-overlay"));
    if (!stood) break;
    await page.mouse.click(24, 24);
    await sleep(300);
  }
  await page.evaluate(() => {
    const p = document.querySelector(".admin-popup");
    if (p) p.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await sleep(300);
  return page;
}
function stageProgress(ownerKey) {
  const nowT = Date.now();
  db.prepare(`INSERT INTO tender_progress (owner_key, class_key, weapon_key, hp, weapon_next_at, updated_at)
    VALUES (?, 'runewright', 'sword', 100, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'runewright', hp = 100`).run(ownerKey, nowT + 600000, nowT);
}

/* ══ §B2 THE LINE, DRAWN IN THE BROWSER ══════════════════ */
console.log("§B2 the drawn line — blips become standing points, whole");
{
  const T5 = await claimWithExp("Free Stage", 3800);
  stageProgress(T5.ownerKey);
  const tiles = seedWorld(T5.ownerKey, 4);
  const figA = seedAwokin(T5.ownerKey, "Free Stage", "Line One");
  const figB = seedAwokin(T5.ownerKey, "Free Stage", "Line Two");
  placeAt(T5.ownerKey, figA, tiles.get("-2,0"), -2, 0, 0);
  placeAt(T5.ownerKey, figB, tiles.get("-2,1"), -2, 1, 0);
  // THE PURSE'S CAP (standing law, calculateMaxEnergy): the
  // page's getEnergy polls clamp the purse to 10 + each
  // owned Awokin's power share — a fat seeded purse alone
  // would be clamped away mid-drive and the marches would
  // starve. A deep bench of owned Awokin raises the cap
  // lawfully past everything the lines below will spend.
  for (let i = 0; i < 10; i++) seedAwokin(T5.ownerKey, "Free Stage", `Bench ${i}`);
  const terr0 = await call("getTerritory", {}, T5.token);
  let page = await openField(T5.token);

  const tilesArg = (terr0.tiles ?? []).map((t) => ({ id: t.id, q: t.q, r: t.r }));
  const solveLattice = async () => page.evaluate((tilesL) => {
    const polys = [...document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]')];
    const cents = polys.map((p) => {
      const pts = (p.getAttribute("points") ?? "").trim().split(/\s+/).map((s) => s.split(",").map(Number));
      return { x: pts.reduce((a, pt) => a + pt[0], 0) / pts.length, y: pts.reduce((a, pt) => a + pt[1], 0) / pts.length };
    });
    const size = 54;
    const U = [1292 * size / 796, 470 * size / 796], V = [0, 948 * size / 796];
    const score = (ox, oy) => {
      let h = 0;
      for (const t of tilesL) {
        const ex = ox + t.q * U[0] + t.r * V[0], ey = oy + t.q * U[1] + t.r * V[1];
        if (cents.some((o) => Math.abs(o.x - ex) < 3 && Math.abs(o.y - ey) < 3)) h++;
      }
      return h;
    };
    let best = null;
    for (const c of cents) { const h = score(c.x, c.y); if (!best || h > best.hits) best = { ox: c.x, oy: c.y, hits: h }; }
    for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) {
      if (!a && !b) continue;
      const ox = best.ox + a * U[0] + b * V[0], oy = best.oy + a * U[1] + b * V[1];
      const h = score(ox, oy);
      if (h > best.hits) best = { ox, oy, hits: h };
    }
    if (!best || best.hits < tilesL.length) return { error: `lattice fit: ${best?.hits}/${tilesL.length}` };
    const svg = document.querySelector("svg.territory-svg");
    const ctm = svg.getScreenCTM();
    const toClient = (sx, sy) => {
      const pt = new DOMPoint(sx, sy).matrixTransform(ctm);
      return { x: pt.x, y: pt.y };
    };
    const out = {};
    for (const t of tilesL) {
      const sx = best.ox + t.q * U[0] + t.r * V[0], sy = best.oy + t.q * U[1] + t.r * V[1];
      out[t.id] = { svg: { x: sx, y: sy }, client: toClient(sx, sy) };
    }
    return { points: out, count: tilesL.length, origin: out[tilesL.find((t) => t.q === 0 && t.r === 0).id], U: [1292 * 54 / 796, 470 * 54 / 796], V: [0, 948 * 54 / 796] };
  }, tilesArg);
  let lattice = await solveLattice();
  ok("the land lattice is solved for the gestures", !lattice.error && lattice.count === tilesArg.length, JSON.stringify(lattice.error ?? lattice.count));
  const clientOf = (q, r) => lattice.points[tiles.get(`${q},${r}`)].client;
  const ground = async (pt) => page.evaluate(({ x, y }) => {
    const svg = document.querySelector("svg.territory-svg");
    const r = svg.getBoundingClientRect();
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const cx = clamp(x, r.left + 6, r.right - 6), cy = clamp(y, r.top + 6, Math.min(r.bottom - 6, 940));
    for (const [dx, dy] of [[0, 0], [80, 0], [160, 0], [-80, 0], [-160, 0], [240, 0], [0, 60], [0, -60], [80, 60], [-80, 60]]) {
      const qx = clamp(cx + dx, r.left + 6, r.right - 6), qy = clamp(cy + dy, r.top + 6, Math.min(r.bottom - 6, 940));
      const el = document.elementFromPoint(qx, qy);
      if (el?.closest?.("svg.territory-svg")) return { x: qx, y: qy };
    }
    return { x: cx, y: cy };
  }, pt);
  const dragBox = async (qrList, yMargin = 18) => {
    lattice = await solveLattice();
    const pts = qrList.map(([q, r]) => lattice.points[tiles.get(`${q},${r}`)].svg);
    const x0 = Math.min(...pts.map((p) => p.x)) - 18, x1 = Math.max(...pts.map((p) => p.x)) + 18;
    const y0 = Math.min(...pts.map((p) => p.y)) - yMargin, y1 = Math.max(...pts.map((p) => p.y)) + yMargin;
    const toClient = ({ x, y }) => page.evaluate(({ x, y }) => {
      const svg = document.querySelector("svg.territory-svg");
      const pt = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
      return { x: pt.x, y: pt.y };
    }, { x, y });
    const c0 = await ground(await toClient({ x: x0, y: y0 }));
    const c1 = await ground(await toClient({ x: x1, y: y1 }));
    await page.mouse.move(c0.x, c0.y);
    await page.mouse.down();
    await page.mouse.move(c1.x, c1.y, { steps: 14 });
    await page.mouse.up();
    await sleep(700);
  };
  const svgToAxial = (sx, sy) => {
    const { U, V } = lattice;
    const dx = sx - lattice.origin.svg.x, dy = sy - lattice.origin.svg.y;
    const det = U[0] * V[1] - V[0] * U[1];
    return { q: (dx * V[1] - dy * V[0]) / det, r: (U[0] * dy - U[1] * dx) / det };
  };
  const lerpPt = (p, q2, t) => ({ x: p.x + (q2.x - p.x) * t, y: p.y + (q2.y - p.y) * t });
  const drawLine = async (a, b) => {
    const ga = await ground(a), gb = await ground(b);
    await page.mouse.move(ga.x, ga.y);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(ga.x + (gb.x - ga.x) / 2, ga.y + (gb.y - ga.y) / 2, { steps: 7 });
    await page.mouse.move(gb.x, gb.y, { steps: 7 });
    await sleep(200);
    const blips = await page.evaluate(() => {
      const line = [...document.querySelectorAll("svg.territory-svg line")].find((l) => l.getAttribute("stroke-dasharray") === "6 4");
      if (!line) return { found: false, cs: [] };
      const g = line.parentElement;
      const cs = [...g.querySelectorAll("circle")].map((c) => ({ x: Number(c.getAttribute("cx")), y: Number(c.getAttribute("cy")) }));
      return { found: true, cs };
    });
    await page.mouse.up({ button: "right" });
    await sleep(1200);
    return blips;
  };

  // THE LONG LINE: blips at axial (0.62,−1) and (2.62,−1).
  await dragBox([[-2, 0], [-2, 1]]);
  const wheelUp = await page.waitForSelector(".gw-wheel", { timeout: 9000 }).then(() => true).catch(() => false);
  ok("the pair's band raises the orders wheel", wheelUp);
  await clickDisc(page, ".gw-disc", "March");
  await sleep(300);
  lattice = await solveLattice();
  const a1 = lerpPt(clientOf(0, -1), clientOf(1, -1), 0.62);
  const b1 = lerpPt(clientOf(2, -1), clientOf(3, -1), 0.62);
  const blips1 = await drawLine(a1, b1);
  ok("the drawn line carries its two blips", blips1.found && blips1.cs.length === 2, JSON.stringify(blips1));
  const blipAx = blips1.cs.map((c) => svgToAxial(c.x, c.y));
  const pa = await placementOf(T5.token, figA), pb = await placementOf(T5.token, figB);
  const served = [pa, pb].filter(Boolean).map((p) => ({ q: p.marchPosQ, r: p.marchPosR }));
  const matchSet = (xs, ys, tol) => xs.length === ys.length && xs.every((x) => ys.some((y) => Math.abs(x.q - y.q) < tol && Math.abs(x.r - y.r) < tol));
  ok("both figures are on the road, carrying the DRAWN points whole (set-matched to the blips)",
    served.length === 2 && served.every((s) => s.q != null) && matchSet(served, blipAx, 0.06),
    JSON.stringify({ served, blipAx }));
  const destTilesOf = [pa, pb].filter(Boolean).map((p) => { const r = JSON.parse(p.marchPath); return r[r.length - 1]; }).sort();
  ok("their roads run to the blips' own hexes — (1,−1) and (3,−1)",
    JSON.stringify(destTilesOf) === JSON.stringify([tiles.get("1,-1"), tiles.get("3,-1")].sort()), JSON.stringify(destTilesOf));
  ok("each carried point stands well off its destination's centre (never snapped)",
    served.every((s) => {
      const t = [pa, pb].find((p) => p.marchPosQ === s.q);
      const road = JSON.parse(t.marchPath); const dt = terr0.tiles.find((x) => x.id === road[road.length - 1]);
      return hexDist(s, dt) > 0.25;
    }));
  ff(figA); ff(figB);
  const restA = await placementOf(T5.token, figA), restB = await placementOf(T5.token, figB);
  ok("they come to rest standing on the drawn points (read back through the settle, exact)",
    !!restA && !!restB && restA.posQ === pa.marchPosQ && restA.posR === pa.marchPosR && restB.posQ === pb.marchPosQ && restB.posR === pb.marchPosR,
    JSON.stringify({ a: [restA?.posQ, restA?.posR], b: [restB?.posQ, restB?.posR] }));
  await page.screenshot({ path: `${OUT}/line-rest-on-blips.png` });

  // THE SHORT LINE: both figures onto ONE hex, (2,0), at
  // two distinct spots of it (axial ≈ (2.18,0) and (1.82,0)).
  // The page is reopened first, so the band gathers the
  // figures from their settled standings, freshly served.
  await page.close();
  page = await openField(T5.token);
  // The reopened camera sits where it wills — walk it with
  // middle-drags (the click-law drive's own road) until
  // the whole stage of the short line is comfortably in
  // view, or the band's corners clamp against the screen
  // edge and shave a figure off the choosing.
  for (let i = 0; i < 8; i++) {
    lattice = await solveLattice();
    const a = clientOf(0, -1), b = clientOf(3, 0);
    if (a.x > 120 && b.x < 1180 && a.y > 120 && b.y < 760) break;
    const dx = Math.max(-240, Math.min(240, (640 - (a.x + b.x) / 2) / 2.8));
    const dy = Math.max(-240, Math.min(240, (430 - (a.y + b.y) / 2) / 2.8));
    await page.mouse.move(700, 450);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(700 + dx, 450 + dy, { steps: 10 });
    await page.mouse.up({ button: "middle" });
    await sleep(500);
  }
  lattice = await solveLattice();
  await dragBox([[0, -1], [3, -1]]);
  const wheelUp2 = await page.waitForSelector(".gw-wheel", { timeout: 9000 }).then(() => true).catch(() => false);
  ok("the pair bands again from their blip standings", wheelUp2);
  const faces2 = await page.evaluate(() => [...document.querySelectorAll(".gw-disc")].map((d) => d.textContent ?? ""));
  console.log("    [short-line wheel faces]", JSON.stringify(faces2));
  const figRects = await page.evaluate(() => [...document.querySelectorAll("g.field-drifter, g.field-patroller")].map((g) => {
    const r = g.getBoundingClientRect();
    return { cls: g.getAttribute("class"), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  }));
  console.log("    [short-line figures]", JSON.stringify(figRects));
  await clickDisc(page, ".gw-disc", "March");
  await sleep(300);
  const armProbe2 = await page.evaluate(() => ({
    notice: document.querySelector(".hex-notice")?.textContent ?? null,
    wheel: !!document.querySelector(".gw-wheel"),
  })).catch(() => ({}));
  console.log("    [short-line arm]", JSON.stringify(armProbe2));
  lattice = await solveLattice();
  const a2 = lerpPt(clientOf(2, 0), clientOf(3, 0), 0.18);
  const b2 = lerpPt(clientOf(2, 0), clientOf(1, 0), 0.18);
  const blips2 = await drawLine(a2, b2);
  if (!blips2.found) {
    const probe = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      const chain = [];
      let n = el;
      while (n && chain.length < 5) { chain.push(n.tagName + "." + (n.getAttribute?.("class") ?? "")); n = n.parentElement; }
      return { atA: chain.join(" < "), notice: document.querySelector(".hex-notice")?.textContent ?? null };
    }, await ground(a2)).catch(() => ({}));
    console.log("    [short-line diag]", JSON.stringify(probe), "a2=", JSON.stringify(a2), "b2=", JSON.stringify(b2));
  }
  {
    const notice2 = await page.evaluate(() => document.querySelector(".hex-notice")?.textContent ?? null).catch(() => null);
    console.log("    [short-line release]", JSON.stringify({ notice: notice2, blipAx: blips2.cs.map((c) => svgToAxial(c.x, c.y)) }));
  }
  ok("the short line carries its two blips", blips2.found && blips2.cs.length === 2, JSON.stringify(blips2));
  const qa = await placementOf(T5.token, figA), qb = await placementOf(T5.token, figB);
  const roadEnd = (p) => { try { const r = JSON.parse(p?.marchPath ?? "[]"); return Array.isArray(r) && r.length ? r[r.length - 1] : null; } catch { return null; } };
  ok("both march to the SAME hex (2,0) — a shared tile refuses neither",
    !!qa && !!qb && roadEnd(qa) === tiles.get("2,0") && roadEnd(qb) === tiles.get("2,0"),
    JSON.stringify({ a: roadEnd(qa), b: roadEnd(qb) }));
  ff(figA); ff(figB);
  const sameA = await placementOf(T5.token, figA), sameB = await placementOf(T5.token, figB);
  ok("they rest on that one hex at two DISTINCT spots of their own, neither the centre",
    !!sameA && !!sameB && sameA.tileId === tiles.get("2,0") && sameB.tileId === tiles.get("2,0")
      && hexDist({ q: sameA.posQ, r: sameA.posR }, { q: sameB.posQ, r: sameB.posR }) > 0.2
      && hexDist({ q: sameA.posQ, r: sameA.posR }, { q: 2, r: 0 }) > 0.1
      && hexDist({ q: sameB.posQ, r: sameB.posR }, { q: 2, r: 0 }) > 0.1,
    JSON.stringify({ a: [sameA?.posQ, sameA?.posR], b: [sameB?.posQ, sameB?.posR] }));
  await page.screenshot({ path: `${OUT}/same-hex-two-spots.png` });
  await page.close();
}

/* ══ §D NO DRAWING CAP ═══════════════════════════════════ */
console.log("§D no drawing cap — six figures on one tile, all six in the page");
{
  const T6 = await claimWithExp("Free Render", 3800);
  stageProgress(T6.ownerKey);
  const tiles = seedWorld(T6.ownerKey, 3);
  const offsets = [[0, 0], [0.3, 0.1], [-0.28, 0.12], [0.12, -0.25], [-0.15, -0.2], [0.33, -0.18]];
  for (let i = 0; i < 6; i++) {
    const f = seedAwokin(T6.ownerKey, "Free Render", `Crowd Figure ${i}`);
    placeAt(T6.ownerKey, f, tiles.get("1,1"), 1 + offsets[i][0], 1 + offsets[i][1], 0);
  }
  const page = await openField(T6.token);
  await sleep(800);
  const count = await page.evaluate(() => document.querySelectorAll("g.field-drifter").length);
  ok("all six figures on the one tile render (the drawing cap is gone)", count === 6, `count=${count}`);
  const centres = await page.evaluate(() => [...document.querySelectorAll("g.field-drifter")].map((g) => {
    const r = g.getBoundingClientRect();
    return `${Math.round(r.left + r.width / 2)},${Math.round(r.top + r.height / 2)}`;
  }));
  ok("they stand at six distinct places on the screen, not stacked on one spot",
    new Set(centres).size === 6, JSON.stringify(centres));
  await page.screenshot({ path: `${OUT}/six-on-one-tile.png` });
  await page.close();
}

await browser.close();
console.log(`\nFREE STAND DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
