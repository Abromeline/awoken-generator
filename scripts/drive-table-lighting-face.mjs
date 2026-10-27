// drive-table-lighting-face — THE TABLE'S LIGHT FACE
// BECOMES THE HOMELAND'S (Nigel, 2026-10-27: "i even told
// you the two systems are supposed to be the same... one
// is just multiplayer").
//
// Boots the real server on a scratch DATA_DIR, stands a
// CASUAL room by the casual drives' own capture road, then
// seeds it white-box (the feeding road itself is
// drive-table-seed-growth-casual's proof): the room's seed
// grown to level 3, a Seal ward standing on the seed hex's
// east edge ("0,0"|"1,0"), a Lattice rune written on the
// west neighbour ("-1,0"). Proves, measured in a real
// browser at a seated witness's screen:
//   §A the server's reckoning agrees with the face it must
//      mirror: the seed's hex FIGHTING (2), the open south
//      neighbour FIGHTING (2), the hex BEHIND THE WARD
//      DARK (0) — the throw is barred at the ward's edge —
//      and the hex beyond it DARK (0).
//   §B the face in the DOM: ZERO .light-hex polygons (the
//      old pools, struck); the light layer stands with ONE
//      dusk path; a FIGHTING glow + bright core stand at
//      the seed; FAINT glows stand at the ward's hex and
//      the rune's hex; a blocking volume stands for the
//      ward, its segment the seed face's east side (the
//      shared edge, read off the face's own geometry);
//      figure shadows stand, at least one near the light.
//   §C PIXELS (the homeland §G pattern — the screenshot
//      read back through a canvas): the ground on the open
//      side of the seed and the ground inside the glow
//      sample brighter and warmer than the ground behind
//      the ward.
// Screenshots land in ~/workspace/table-lighting-face-proof/.
// Run after `npm run build`:
//   PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-table-lighting-face.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-table-light-"));
process.env.PORT = "39953";
process.env["WORKSHOP_" + "PASSWORD"] = "table-light-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39953";
const PW = "table-light-drive-password";
const SHOTS = "/home/hatch/workspace/table-lighting-face-proof";
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
const waitFor = async (fn, what, ms = 25000) => { const s = realNow(); while (realNow() - s < ms) { let v = false; try { v = fn(); } catch { v = false; } if (v) return true; await sleep(80); } throw new Error("drive wait: " + what); };
const tryWait = async (fn, ms) => { try { await waitFor(fn, "tryWait", ms); return true; } catch { return false; } };

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up, as the other drives do */ }

/* ══ THE CASUAL ROOM, BY ITS OWN ROAD (drive-beacon-fills-hex §C's road) ══ */
console.log("§0 the casual room stands by its own capture road");
const { issueTableToken, partyBattleSeatFor } = await import("../server/dist/table.js");
const partEl = (name, category, power, toughness, element) => Number(db.prepare(
  "INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)")
  .run(name, category, power, toughness, element, `tablelight/${name}.png`, Date.now()).lastInsertRowid);
const mkKin = (ownerKey, ownerName, name, parts) => {
  const comp = JSON.stringify(parts.map(([category, element, power, toughness]) => ({
    source_id: `db:${partEl(`${name} ${category}`, category, power, toughness, element)}`,
    name: `${name} ${category}`, category, rarity: "common", power, toughness, element,
  })));
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, "tablelight/awokin.png", comp, ownerName, ownerKey, Date.now()).lastInsertRowid);
};
const stdParts = (el, power, toughness) => [["body", el, power, toughness], ["arms", el, power, toughness], ["head", el, power, toughness]];
const bodyParts = (el, power, toughness) => [["body", el, power, toughness], ["arms", el, 0, toughness], ["head", el, 0, toughness]];
async function mkTender(name, discId) {
  const claim = await callOk("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, Date.now());
  for (const w of ["Wake One", "Wake Two", "Wake Three"]) mkKin(ownerKey, name, `${name} ${w}`, stdParts("sky", 2, 2));
  await callOk("chooseClass", { classKey: "warden" }, claim.token);
  const tt = issueTableToken({ id: discId, name });
  const bindCode = (await callOk("getTableBindCode", {}, claim.token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
  if (!bindRes.ok) throw new Error("table/bind failed for " + name + ": " + bindRes.status);
  return { token: claim.token, ownerKey, tt, name };
}
class Actor {
  constructor() { this.state = null; this.you = null; this.errors = []; }
  async join(tt, room) {
    this.ws = new WebSocket(`ws://127.0.0.1:39953/table/ws`);
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
  const wws = new WebSocket(`ws://127.0.0.1:39953/table/ws`);
  return new Promise((resolve) => {
    wws.onopen = () => { wws.send(JSON.stringify({ type: "join", room: roomId, watch: true, name: "Light Watcher" })); resolve({ wstate, wws }); };
    wws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") wstate.state = m.state; } catch { /* torn frame */ } };
  });
}
const ROOM_ID = "table-light-room";
const parseAx = (id) => id.split(",").map(Number);
const axDist = (a, b) => { const [aq, ar] = parseAx(a); const [bq, br] = parseAx(b); return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(aq + ar - bq - br)); };
const F = await mkTender("Light Room Feeder", "disc-tablelight-f");
const captureId = mkKin(F.ownerKey, F.name, "Light Capturehand", bodyParts("sky", 2, 6));
await callOk("addToParty", { awakenedId: captureId }, F.token);
for (let i = 0; i < 20; i++) mkKin(F.ownerKey, F.name, `LFBench ${i + 1}`, stdParts("sky", 2, 2));
const A = await mkTender("Light Room Witness", "disc-tablelight-a");
const { wstate } = await watchRoom(ROOM_ID);
const feeder = new Actor(); await feeder.join(F.tt, ROOM_ID); await feeder.waitYou("the feeder's seat");
await waitFor(() => !!(wstate.state?.players ?? []).find((p) => p.name === F.name)?.hex, "the feeder's landing");
let captureHand = null;
for (let i = 0; i < 20 && !captureHand; i++) {
  feeder.send({ type: "summonCast", awakenedId: captureId });
  const stood = await tryWait(() => (wstate.state?.field ?? []).some((u) => u.name === "Light Capturehand" && u.ownerName === F.name), 3500);
  if (stood) captureHand = wstate.state.field.find((u) => u.name === "Light Capturehand" && u.ownerName === F.name);
  else await sleep(300);
}
ok("§0 the capture hand stands on the casual field", !!captureHand, JSON.stringify(feeder.errors.slice(-2)));
feeder.send({ type: "setStance", cardId: captureHand.cardId, stance: "binding" });
{
  const reach = 4; // the capture hand is sky (reach 4, the referee's table)
  const target = (wstate.state?.map ?? []).find((t) => t.cursed && t.id !== "0,0" && axDist(t.id, captureHand.hex) <= reach);
  ok("§0 a cursed tile stands in the hand's reach", !!target);
  feeder.send({ type: "strikeCurse", cardId: captureHand.cardId, hex: captureHand.hex, target: target.id });
}
await waitFor(() => (wstate.state?.dark ?? []).length > 0 && wstate.state?.battle?.active === true && !!partyBattleSeatFor(F.ownerKey)?.room, "the casual field's own entry stands the battle", 25000);
const room = partyBattleSeatFor(F.ownerKey).room;
ok("§0 the room is captured — and it is the regular casual room", room.mode === "casual" && room.campaign === null && !room.id.startsWith("campaign"), `room=${room.id} mode=${room.mode}`);
room.curseStruck = false;
room.entryAt = Date.now();
for (const id of [...room.dark.keys()]) room.dark.delete(id);
await tryWait(() => room.battle.active === false, 8000);
await sleep(600);

/* ══ THE SEEDING (white-box, the drives' own convention) ══ */
console.log("§A the seeding — the grown seed, the Seal ward on its east edge, the Lattice rune west");
const SEED = "0,0", EAST = "1,0", BEYOND = "2,0", SOUTH = "0,1", WEST = "-1,0";
const mapIds = new Set([...room.map.keys()]);
ok("§A the room's board holds the seed and all four named hexes", [SEED, EAST, BEYOND, SOUTH, WEST].every((id) => mapIds.has(id)),
  [...mapIds].slice(0, 8).join(" "));
room.seedGrowth.level = 3; // the seed stands grown to the Beacon
room.workings.push({
  id: "drive-light-ward", kind: "ward", root: "seal", engine: "seal",
  nums: { stops: 3, riposte: 3 }, name: "The Plain Seal", hue: "unaligned",
  ownerKey: F.ownerKey, ownerName: F.name, hex: null, hexA: SEED, hexB: EAST, pos: null,
  hp: 6, maxHp: 6, pour: 0, stops: 0, charges: 0,
});
room.workings.push({
  id: "drive-light-rune", kind: "rune", root: "lattice", engine: "lattice",
  nums: {}, name: "The Twin Lattice", hue: "unaligned",
  ownerKey: F.ownerKey, ownerName: F.name, hex: WEST, hexA: null, hexB: null, pos: null,
  hp: 4, maxHp: 4, pour: 0, stops: 0, charges: 2,
});
// A stance change from the feeder forces a full state
// broadcast to every seat — the room re-serves as it stands.
feeder.send({ type: "setStance", cardId: captureHand.cardId, stance: "attack" });
await sleep(500);
feeder.send({ type: "setStance", cardId: captureHand.cardId, stance: "binding" });
await waitFor(() => (wstate.state?.workings ?? []).some((w) => w.id === "drive-light-ward"), "the ward stands in the served state", 15000);
await sleep(400);
const served = new Map((wstate.state?.map ?? []).map((t) => [t.id, t.light ?? 0]));
ok("§A the server's reckoning: the seed's hex reads FIGHTING (2)", served.get(SEED) === 2, `light=${served.get(SEED)}`);
ok("§A the server's reckoning: the open south neighbour reads FIGHTING (2)", served.get(SOUTH) === 2, `light=${served.get(SOUTH)}`);
ok("§A the server's reckoning: the hex BEHIND THE WARD reads DARK (0) — the throw is barred at the ward's edge", served.get(EAST) === 0, `light=${served.get(EAST)}`);
ok("§A the server's reckoning: the hex beyond the ward reads DARK (0)", served.get(BEYOND) === 0, `light=${served.get(BEYOND)}`);

/* ══ THE WITNESS'S SCREEN ══════════════════════════════ */
console.log("§B the face in the DOM, at the witness's seat");
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
await page.evaluateOnNewDocument((sess) => { window.__awokenTableSession = sess; }, { authToken: A.tt, room: ROOM_ID, name: A.name });
await page.goto(BASE + "/table?frame_id=table-light", { waitUntil: "domcontentloaded", timeout: 60000 });
let roomStands = true;
try { await page.waitForSelector(".table-room", { timeout: 30000 }); } catch { roomStands = false; }
ok("§B the casual room stands for the witness's seat", roomStands);
await sleep(1500);

// The stage geometry, replicated from the client's own
// basis (Table.tsx: isoBasis + FACE_HEX + tilePos), so the
// expected shared edge is computed — never eyeballed.
const K = 40 / 796;
const FACE_HEX = [[-406, -468], [415, -468], [861, -6], [431, 476], [-431, 472], [-870, -6]];
const tilePosOf = (id) => {
  const [q, r] = parseAx(id);
  const t = (wstate.state?.map ?? []).find((x) => x.id === id);
  return { cx: (q * 1292 + r * 0) * K, cy: (q * 470 + r * 948) * K + (t?.cursed ? 0 : -5) };
};
const seedStage = tilePosOf(SEED);
const eastStage = tilePosOf(EAST);
const expectedSeg = (() => {
  const verts = FACE_HEX.map(([x, y]) => [seedStage.cx + x * K, seedStage.cy + y * K]);
  let best = -1, bestDot = -Infinity;
  for (let i = 0; i < 6; i++) {
    const [x1, y1] = verts[i], [x2, y2] = verts[(i + 1) % 6];
    const mx = (x1 + x2) / 2 - seedStage.cx, my = (y1 + y2) / 2 - seedStage.cy;
    const dot = mx * (eastStage.cx - seedStage.cx) + my * (eastStage.cy - seedStage.cy);
    if (dot > bestDot) { bestDot = dot; best = i; }
  }
  const [ax, ay] = verts[best], [bx, by] = verts[(best + 1) % 6];
  return { ax, ay, bx, by };
})();

const probe = () => page.evaluate((seedPt, westPt) => {
  const layer = document.querySelector(".light-layer");
  if (!layer) return { layer: false };
  const glows = [...layer.querySelectorAll(".light-glow")].map((e) => ({
    kind: e.getAttribute("data-glow"), cx: Number(e.getAttribute("cx")), cy: Number(e.getAttribute("cy")),
    rx: Number(e.getAttribute("rx")), ry: Number(e.getAttribute("ry")),
  }));
  const blocks = [...layer.querySelectorAll(".light-block")].map((e) => ({
    block: e.getAttribute("data-block"), src: e.getAttribute("data-src"),
    seg: (e.getAttribute("data-seg") ?? "").split(",").map(Number),
  }));
  const shadows = [...layer.querySelectorAll(".light-shadow")].map((e) => ({
    cx: Number(e.getAttribute("cx")), cy: Number(e.getAttribute("cy")),
  }));
  const core = glows.find((g) => g.kind === "core");
  return {
    layer: true,
    hexes: document.querySelectorAll(".light-hex").length,
    dusk: layer.querySelectorAll(".light-dusk").length,
    glowFighting: glows.filter((g) => g.kind === "fighting").length,
    glowCore: glows.filter((g) => g.kind === "core").length,
    glowFaint: glows.filter((g) => g.kind === "faint").length,
    faintAtSeed: glows.some((g) => g.kind === "faint" && Math.hypot(g.cx - seedPt.cx, g.cy - (seedPt.cy - 5)) < 2 || (g.kind === "faint" && Math.hypot(g.cx - seedPt.cx, g.cy - seedPt.cy) < 8)),
    faintAtRune: glows.some((g) => g.kind === "faint" && Math.hypot(g.cx - westPt.cx, g.cy - westPt.cy) < 2.5),
    coreAt: core ? { cx: core.cx, cy: core.cy, rx: core.rx } : null,
    coreRect: core ? (() => { const r = core.ownerSVGElement ? null : null; return null; })() : null,
    blocks, shadows,
    shadowNearLight: core ? shadows.some((s) => Math.hypot(s.cx - core.cx, s.cy - core.cy) < 130) : false,
  };
}, seedStage, tilePosOf(WEST));
// The core ellipse's screen rect is read separately (it
// anchors the stage→screen map for the pixel samples).
const coreRectOf = () => page.evaluate(() => {
  const core = document.querySelector('.light-glow[data-glow="core"]');
  if (!core) return null;
  const r = core.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
});
let P = await probe();
for (let i = 0; i < 30 && !(P.layer && P.glowCore >= 1 && P.blocks.length >= 1); i++) { await sleep(500); P = await probe(); }
ok("§B the light layer stands on the Table's stage", P.layer === true);
ok("§B ZERO .light-hex polygons — the old pools are struck", P.hexes === 0, `n=${P.hexes}`);
ok("§B the dusk is ONE path, not a wash per hex", P.dusk === 1, `n=${P.dusk}`);
ok("§B a FIGHTING glow stands for the grown seed", (P.glowFighting ?? 0) >= 1, `n=${P.glowFighting}`);
ok("§B the bright core stands with it", (P.glowCore ?? 0) >= 1, `n=${P.glowCore}`);
ok("§B FAINT glows stand (the ward's hex, the rune's hex)", (P.glowFaint ?? 0) >= 2, `n=${P.glowFaint}`);
ok("§B a FAINT glow stands at the rune's own hex, west of the seed", P.faintAtRune === true, JSON.stringify(P.coreAt));
const wardBlocks = (P.blocks ?? []).filter((b) => (b.block ?? "").startsWith("ward-"));
ok("§B a blocking volume stands for the ward", wardBlocks.length >= 1, `n=${(P.blocks ?? []).length}`);
if (wardBlocks.length) {
  const s = wardBlocks[0].seg;
  const want = [expectedSeg.ax, expectedSeg.ay, expectedSeg.bx, expectedSeg.by];
  const segOk = s.length === 4 && ((Math.hypot(s[0] - want[0], s[1] - want[1]) <= 1.5 && Math.hypot(s[2] - want[2], s[3] - want[3]) <= 1.5)
    || (Math.hypot(s[0] - want[2], s[1] - want[3]) <= 1.5 && Math.hypot(s[2] - want[0], s[3] - want[1]) <= 1.5));
  ok("§B the volume's segment IS the shared edge — the seed face's side toward the warded hex", segOk,
    `seg=${s.map((n) => n.toFixed(1)).join(",")} want≈${want.map((n) => n.toFixed(1)).join(",")}`);
}
ok("§B figure shadows stand in the light", (P.shadows ?? []).length >= 1, `n=${(P.shadows ?? []).length}`);
ok("§B at least one figure's shade falls near the light that casts it", P.shadowNearLight === true,
  `shadows=${JSON.stringify((P.shadows ?? []).slice(0, 4))} core=${JSON.stringify(P.coreAt)}`);
console.log(`  layer: dusk=${P.dusk} fighting=${P.glowFighting} core=${P.glowCore} faint=${P.glowFaint} blocks=${(P.blocks ?? []).length} shadows=${(P.shadows ?? []).length}`);

/* ══ §C PIXELS — BEHIND THE WARD vs THE OPEN SIDE ══════ */
console.log("§C pixels — behind the ward against the open side (the homeland §G pattern)");
// The witness's stage view glides to its fit when the room
// opens; the stage→screen map must be read from a SETTLED
// view, and the screenshot taken in the same breath — poll
// the core's rect until it holds still, then shoot, then
// confirm it did not move under the shot.
let coreRect = await coreRectOf();
for (let i = 0; i < 24; i++) {
  await sleep(500);
  const next = await coreRectOf();
  if (next && coreRect && Math.abs(next.cx - coreRect.cx) < 0.5 && Math.abs(next.cy - coreRect.cy) < 0.5 && Math.abs(next.w - coreRect.w) < 0.5) { coreRect = next; break; }
  coreRect = next;
}
const shotBuf = await page.screenshot({ path: join(SHOTS, "table-lighting-face-room.png") });
const coreRectAfter = await coreRectOf();
ok("§C the stage view stood settled across the screenshot", !!coreRect && !!coreRectAfter
  && Math.abs(coreRectAfter.cx - coreRect.cx) < 1 && Math.abs(coreRectAfter.cy - coreRect.cy) < 1,
  `before=${JSON.stringify(coreRect)} after=${JSON.stringify(coreRectAfter)}`);
let sampleOk = false, sampleNote = "";
try {
  if (!coreRect || !P.coreAt) throw new Error("the core's rect or centre is missing");
  const scale = coreRect.w / (2 * P.coreAt.rx);
  const toScreen = (p) => [coreRect.cx + (p.cx - P.coreAt.cx) * scale, coreRect.cy + (p.cy - P.coreAt.cy) * scale];
  const southStage = tilePosOf(SOUTH);
  const insidePt = { cx: seedStage.cx + (southStage.cx - seedStage.cx) * 0.45, cy: seedStage.cy + (southStage.cy - seedStage.cy) * 0.45 };
  // The behind-the-ward sample stands on the warded hex's
  // ground, clear of the ward's own drawn line (which runs
  // centre to centre across that hex and would lend the
  // patch its gold): the hex's centre shifted 13 units
  // along the north perpendicular of the seed→hex axis —
  // still well inside the volume's wedge (its span at the
  // source runs −7°..41°; this point bears ~10°).
  const axisLen = Math.hypot(eastStage.cx - seedStage.cx, eastStage.cy - seedStage.cy) || 1;
  const perp = { x: (eastStage.cy - seedStage.cy) / axisLen, y: -(eastStage.cx - seedStage.cx) / axisLen };
  const behindPt = { cx: eastStage.cx + perp.x * 13, cy: eastStage.cy + perp.y * 13 };
  const pts = [toScreen(behindPt), toScreen(southStage), toScreen(insidePt)];
  const samples = await page.evaluate(async (data, sp) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = "data:image/png;base64," + data; });
    const cv = document.createElement("canvas");
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const ctx = cv.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return sp.map(([x, y]) => {
      const d = ctx.getImageData(Math.max(0, Math.round(x) - 3), Math.max(0, Math.round(y) - 3), 7, 7).data;
      let r = 0, gg = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
      return { r: r / n, g: gg / n, b: b / n };
    });
  }, shotBuf.toString("base64"), pts);
  const lum = (s) => 0.2126 * s.r + 0.7152 * s.g + 0.0722 * s.b;
  const warm = (s) => s.r - s.b;
  const [behind, open, inside] = samples;
  sampleNote = `behind-ward lum=${lum(behind).toFixed(1)} warm=${warm(behind).toFixed(1)} · open lum=${lum(open).toFixed(1)} warm=${warm(open).toFixed(1)} · inside lum=${lum(inside).toFixed(1)} warm=${warm(inside).toFixed(1)}`;
  console.log("  samples:", sampleNote);
  sampleOk = lum(open) > lum(behind) + 8 && warm(open) > warm(behind) + 4 && lum(inside) > lum(behind) + 8;
} catch (e) { sampleNote = "sampling failed: " + String(e).slice(0, 160); }
ok("§C PIXELS: the open side and the glow's heart are brighter and warmer than the ground behind the ward", sampleOk, sampleNote);
if (coreRect) {
  const x = Math.max(0, coreRect.cx - 300), y = Math.max(0, coreRect.cy - 240);
  const w = Math.min(1500 - x, 640), h = Math.min(1000 - y, 520);
  await page.screenshot({ path: join(SHOTS, "table-lighting-face-glow-crop.png"), clip: { x, y, width: w, height: h } });
  ok("§C the glow crop was taken", w > 300 && h > 300, `${w}x${h}`);
}
ok("§B the Table carried no page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
await browser.close();

console.log(`\ndrive-table-lighting-face: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
