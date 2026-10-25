// drive-table-seed-growth-casual — THE TABLE'S STARSEED
// GROWTH IN THE REGULAR CASUAL DISCORD ROOM (Nigel's
// correction, 2026-10-25 15:52: "we have been working on
// the regular discord room not the campaign room...
// campaign room is the once with the story screen and
// the 3d ui").
//
// The campaign drive (drive-table-seed-growth) proved
// the machinery in a campaign room. That proof does not
// transfer by assertion: THIS drive seats the same loop
// in a room whose id does not begin "campaign" — wire
// mode "casual", campaign null, no Storytender, no
// story screen, no campaign bank — and proves:
//
//   §A BASELINE: the casual room's seed stands at level
//      1, fed 0; in a real browser seat the standing
//      strip stands uncovered in the casual room naming
//      the Starseed, and the tile wears no stage face.
//   §B THE STAND: the feeder crosses the seed's tile and
//      is stopped ON it by the real glide + glideStop
//      roads. The seed hex is laid cursed white-box
//      before the crossing (the setup, named), and her
//      arrival purifies it in the same pulse-span.
//   §C THE CLIMB: with the fed measure set near each
//      threshold white-box (14, then 29 — the setup,
//      named), the REAL room pulse carries it over each
//      line on her standing alone, paid from her OWN
//      energy purse (a casual room has no bank): twelve
//      stepped seconds at her ruled 5/min pays exactly
//      one whole energy. 15 fed → the Sapling (wire,
//      ring purified, tile face, strip); 30 fed → the
//      Beacon (the same, the strip at its height).
//   §D THE BEACON'S RING: the map is laid white-box with
//      ONE cursed tile — ring-1 beside the Beacon — and
//      the casual field's OWN entry (settleCasualEntry,
//      provoked by the curse strike of the setup and
//      re-armed here white-box) is the dealing road: at
//      level 3 it deals NO dark (the only cursed ground
//      is the guarded ring); at level 2 the same ground
//      takes the dark on that very tile. No Storytender
//      action is used anywhere in this drive.
//
// THE ROOM HANDLE: partyBattleSeatFor reaches a room
// only while its battle stands, so the setup raises the
// casual field's own entry honestly — a summoned hand
// strikes the curse (the 10:41 provoke), the field's
// dark enters and the battle stands — takes the handle,
// then deletes the entered dark white-box, waits out
// the field break, and disarms the entry (curseStruck
// cleared white-box) so no ambient beat can muddy the
// feeding measures. The hand is ordered to BINDING so
// it never strikes during the capture. Every later
// measure is read after that settling, on the wire.
//
// Screenshots land in ~/workspace/table-seed-strip-proof/
// under casual- names, beside (never over) the campaign
// drive's pair.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-table-seed-growth-casual.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

mkdirSync("/home/hatch/workspace/table-seed-strip-proof", { recursive: true });
const OUT = "/home/hatch/workspace/table-seed-strip-proof";
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-seedgrowth-"));
process.env.PORT = "3964";
process.env.WORKSHOP_PASSWORD = "casual-seedgrowth-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3964";
const PW = "casual-seedgrowth-drive-password";
const ROOM_ID = "casual-seed-growth";
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
  if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return data?.data ?? data;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up */ }

const partEl = (name, category, power, toughness, element) => Number(db.prepare(
  "INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)")
  .run(name, category, power, toughness, element, `seedgrowth/${name}.png`, Date.now()).lastInsertRowid);
const mkKin = (ownerKey, ownerName, name, parts) => {
  const comp = JSON.stringify(parts.map(([category, element, power, toughness]) => ({
    source_id: `db:${partEl(`${name} ${category}`, category, power, toughness, element)}`,
    name: `${name} ${category}`, category, rarity: "common", power, toughness, element,
  })));
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, "seedgrowth/awokin.png", comp, ownerName, ownerKey, Date.now()).lastInsertRowid);
};
const stdParts = (el, power, toughness) => [["body", el, power, toughness], ["arms", el, power, toughness], ["head", el, power, toughness]];
const bodyParts = (el, power, toughness) => [["body", el, power, toughness], ["arms", el, 0, toughness], ["head", el, 0, toughness]];

const { issueTableToken } = await import("../server/dist/table.js");
async function mkTender(name, exp, classKey, discId) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, exp, Date.now());
  if (classKey) { for (const w of ["Wake One", "Wake Two", "Wake Three"]) mkKin(ownerKey, name, `${name} ${w}`, stdParts("sky", 2, 2)); }
  if (classKey) await call("chooseClass", { classKey }, claim.token);
  const tt = issueTableToken({ id: discId, name });
  const bindCode = (await call("getTableBindCode", {}, claim.token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
  if (!bindRes.ok) throw new Error("table/bind failed for " + name + ": " + bindRes.status);
  return { token: claim.token, ownerKey, tt, name };
}
const fillers = (t, n, tag) => { for (let i = 0; i < n; i++) mkKin(t.ownerKey, t.name, `${tag} ${i + 1}`, stdParts("sky", 2, 2)); };

class Actor {
  constructor() { this.state = null; this.you = null; this.errors = []; }
  async join(tt, room) {
    this.ws = new WebSocket("ws://127.0.0.1:3964/table/ws");
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
const waitFor = async (fn, what, ms = 20000) => { const s = realNow(); while (realNow() - s < ms) { let v = false; try { v = fn(); } catch { v = false; } if (v) return true; await sleep(60); } throw new Error("drive wait: " + what); };
const tryWait = async (fn, ms) => { try { await waitFor(fn, "tryWait", ms); return true; } catch { return false; } };
function watchRoom(roomId) {
  const wstate = { state: null };
  const wws = new WebSocket("ws://127.0.0.1:3964/table/ws");
  return new Promise((resolve) => {
    wws.onopen = () => { wws.send(JSON.stringify({ type: "join", room: roomId, watch: true, name: "Growth Watcher" })); resolve({ wstate, wws }); };
    wws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") wstate.state = m.state; } catch { /* torn frame */ } };
  });
}
const seatOf = (wstate, name) => wstate.state?.players.find((p) => p.name === name) ?? null;
const parseAx = (id) => id.split(",").map(Number);
const axDist = (a, b) => { const [aq, ar] = parseAx(a); const [bq, br] = parseAx(b); return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(aq + ar - bq - br)); };
const K = 40 / 796;
const centerOf = (id) => { const [q, r] = parseAx(id); return { x: q * 1292 * K, y: q * 470 * K + r * 948 * K }; };
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const RING1 = DIRS.map(([dq, dr]) => `${dq},${dr}`);
const { partyBattleSeatFor } = await import("../server/dist/table.js");
const roomOf = (ownerKey) => partyBattleSeatFor(ownerKey)?.room ?? null;
const wireTile = (id) => (wstate.state?.map ?? []).find(t => t.id === id) ?? null;
const wireSeed = () => wstate.state?.seed ?? null;

/** Summon a standing hand (the entry drive's road): the
 *  casual field's own entry is provoked by a curse strike
 *  from a standing hand, and the standing battle is what
 *  lets partyBattleSeatFor hand this drive the room. */
async function summonStanding(actor, ownerName, awakenedId, unitName, tries = 20) {
  for (let i = 0; i < tries; i++) {
    actor.send({ type: "summonCast", awakenedId });
    const stood = await tryWait(() => (wstate.state?.field ?? []).some(u => u.name === unitName && u.ownerName === ownerName), 3500);
    if (stood) return wstate.state.field.find(u => u.name === unitName && u.ownerName === ownerName);
    await sleep(300);
  }
  throw new Error("summon never landed: " + unitName + " | seat errors: " + JSON.stringify(actor.errors.slice(-3)) + " | energy: " + actor.you?.energy);
}
const REACH = { stone: 1, root: 2, fire: 2, tide: 3, sky: 4 };
async function strikeCurse(actor, ownerName) {
  const unit = (wstate.state?.field ?? []).find(u => u.ownerName === ownerName);
  if (!unit) throw new Error("strikeCurse: no standing hand for " + ownerName);
  const reach = REACH[unit.element] ?? 2;
  const target = (wstate.state?.map ?? []).find(t => t.cursed && t.id !== "0,0" && axDist(t.id, unit.hex) <= reach);
  if (!target) throw new Error("strikeCurse: no cursed tile in reach of " + unit.hex);
  actor.send({ type: "strikeCurse", cardId: unit.cardId, hex: unit.hex, target: target.id });
  await sleep(400);
  return target.id;
}

/* ══ SETUP — the casual room, raised and captured ═════ */
const F = await mkTender("Casual Growth Feeder", 800, "warden", "disc-casual-seedgrowth-f");
const captureId = mkKin(F.ownerKey, F.name, "Casual Capturehand", bodyParts("sky", 2, 6));
await call("addToParty", { awakenedId: captureId }, F.token);
fillers(F, 20, "CFBench");
const A = await mkTender("Casual Growth Witness", 800, "warden", "disc-casual-seedgrowth-a");
fillers(A, 5, "CABench");
const { wstate } = await watchRoom(ROOM_ID);
const feeder = new Actor(); await feeder.join(F.tt, ROOM_ID); await feeder.waitYou("the feeder's seat");
await waitFor(() => !!seatOf(wstate, F.name)?.hex, "the feeder's landing");
// RAISE, CAPTURE, CLEAR — the casual field's own road:
// a summoned hand strikes the curse (the 10:41 provoke),
// the field's dark enters on its own and the battle
// stands; the room's handle is taken; the entered dark
// is deleted white-box in the same pass and the field
// break is waited out; the entry is then disarmed
// (curseStruck cleared, the beat re-anchored — both
// white-box, named here) so no ambient beat can muddy
// the measures below. The hand is ordered to BINDING
// before the strike's answer can be fought over: a
// binding hand spends her cadence mending, and with no
// wounded ally in reach she simply waits.
const captureHand = await summonStanding(feeder, F.name, captureId, "Casual Capturehand");
feeder.send({ type: "setStance", cardId: captureHand.cardId, stance: "binding" });
await strikeCurse(feeder, F.name);
await waitFor(() => (wstate.state?.dark ?? []).length > 0 && wstate.state?.battle?.active === true && !!roomOf(F.ownerKey), "the casual field's own entry stands the battle", 25000);
const room = roomOf(F.ownerKey);
room.curseStruck = false;
room.entryAt = Date.now();
for (const id of [...room.dark.keys()]) room.dark.delete(id);
await tryWait(() => room.battle.active === false, 8000);
await sleep(600);

/* ══ §A BASELINE ══════════════════════════════════════ */
console.log("§A baseline — the casual room's seed stands unfed, and its growth machinery is read on the wire");
ok("§A THIS IS THE REGULAR ROOM: the wire reads mode \"casual\" and campaign null — no campaign state rides this room at all",
  wstate.state?.mode === "casual" && wstate.state?.campaign === null,
  `mode=${wstate.state?.mode} campaign=${JSON.stringify(wstate.state?.campaign)}`);
ok("§A the room's own record agrees — mode casual, campaign null, and the room id carries no campaign mark",
  room.mode === "casual" && room.campaign === null && !room.id.startsWith("campaign"), `room=${room.id} mode=${room.mode}`);
ok("§A the wire carries the room's seed at level 1, fed 0, next stage at 15",
  wireSeed()?.level === 1 && wireSeed()?.fedEnergy === 0 && wireSeed()?.nextStageAt === 15,
  JSON.stringify(wireSeed()));
ok("§A the seed's stage on the wire is the Starseed", wireSeed()?.stage === "starseed", `stage=${wireSeed()?.stage}`);
const energyStart = seatOf(wstate, F.name)?.energy ?? 0;
ok("§A the feeder's purse stands deep enough to pay the climb's two crossings", energyStart >= 2, `energy=${energyStart}`);

/* ══ §A2 THE STRIP, IN A REAL SEAT ════════════════════ */
console.log("§A2 the standing strip in a real browser seat — Starseed, fed 0");
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
const consoleLines = [];
page.on("console", (msg) => { consoleLines.push(msg.text()); });
page.on("pageerror", (err) => consoleLines.push(String(err)));
await page.evaluateOnNewDocument((sess) => { window.__awokenTableSession = sess; },
  { authToken: A.tt, room: ROOM_ID, name: A.name });
await page.goto(BASE + "/table?frame_id=seed-growth", { waitUntil: "domcontentloaded", timeout: 60000 });
let roomStands = true;
try { await page.waitForSelector(".table-room", { timeout: 30000 }); } catch { roomStands = false; }
ok("§A2 the room STANDS for the witness's seat", roomStands);
let stripStands = true;
try { await page.waitForSelector(".seed-strip", { timeout: 15000 }); } catch { stripStands = false; }
ok("§A2 THE STRIP STANDS in the standing room", stripStands);
const stripRead = () => page.evaluate(() => {
  const strip = document.querySelector(".seed-strip");
  const fill = document.querySelector(".seed-strip-fill");
  const nowStep = document.querySelector(".seed-strip-step.now");
  const stageImages = [...document.querySelectorAll("svg image")].map(i => i.getAttribute("href") ?? "");
  return {
    text: strip?.textContent?.replace(/\s+/g, " ").trim() ?? "",
    fillWidth: fill ? fill.style.width : null,
    nowStep: nowStep?.textContent?.replace(/\s+/g, " ").trim() ?? "",
    hasSaplingFace: stageImages.some(h => h.includes("sapling")),
    hasBeaconFace: stageImages.some(h => h.includes("beacon")),
    meteors: document.querySelectorAll(".table-meteor").length,
    skyText: document.querySelector(".sky-round")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
    stageOverlay: !!document.querySelector(".stage-overlay"),
    campaignBank: !!document.querySelector(".bank-chip"),
  };
}).catch(() => ({ text: "", fillWidth: null, nowStep: "", hasSaplingFace: false, hasBeaconFace: false, meteors: 0, skyText: "", stageOverlay: false, campaignBank: false }));
const stripA = await stripRead();
ok("§A2 THE BROWSER'S ROOM IS THE CASUAL ROOM TOO: its skybar names a casual room, and NO campaign furniture stands in it — no Storytender stage screen, no campaign bank chip",
  stripA.skyText.includes("casual room") && !stripA.stageOverlay && !stripA.campaignBank,
  `sky=${stripA.skyText} stage=${stripA.stageOverlay} bank=${stripA.campaignBank}`);
ok("§A2 the strip names the Starseed at the foot of the climb, fed 0 of 15, the Starseed's step lit",
  stripA.text.includes("The star-seed stands a Starseed") && stripA.text.includes("fed 0 of 15 toward the Sapling") && stripA.nowStep.includes("Starseed"),
  stripA.text.slice(0, 200));
ok("§A2 the strip carries the one feeding line — it feeds while a Tender stands on its hex",
  stripA.text.includes("It feeds while a Tender stands on its hex."), stripA.text.slice(0, 200));
ok("§A2 the meter stands at the foot (0%) and the seed's tile wears NO stage face yet",
  stripA.fillWidth === "0%" && !stripA.hasSaplingFace && !stripA.hasBeaconFace,
  `fill=${stripA.fillWidth} sapling=${stripA.hasSaplingFace} beacon=${stripA.hasBeaconFace}`);
const placement = await page.evaluate(() => {
  const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }; };
  const stripEl = document.querySelector(".seed-strip");
  const strip = r(".seed-strip"), sky = r(".skybar"), main = r(".table-main"), party = r(".party-panel"), pin = r(".beacon-pin"), grab = r(".hand-grab");
  const overlap = (a, b) => !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  // THE COVER TEST (the lesson of this build's first
  // screenshots: a strip can stand complete in the DOM
  // and still be painted over — the satchel drawer owned
  // the bottom edge): the point at the strip's own centre
  // must hit the strip itself, not a covering drawer.
  let uncovered = false;
  if (stripEl) {
    const b = stripEl.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
    uncovered = !!hit && (hit === stripEl || stripEl.contains(hit));
  }
  return { strip, sky, main, uncovered, overlapsParty: overlap(strip, party), overlapsPin: overlap(strip, pin), overlapsGrab: overlap(strip, grab) };
}).catch(() => null);
ok("§A2 THE STRIP DISTURBS NOTHING AND IS NOT COVERED: it stands between the skybar and the room's main, clear of the party rail, the beacon pin and the satchel's handle — and its own centre answers a hit test",
  !!placement?.strip && !!placement?.sky && !!placement?.main
    && placement.strip.top >= placement.sky.bottom - 1 && placement.strip.bottom <= placement.main.top + 1
    && placement.uncovered && !placement.overlapsParty && !placement.overlapsPin && !placement.overlapsGrab,
  JSON.stringify(placement));
await page.screenshot({ path: `${OUT}/casual-seed-strip-starseed.png` });
ok("§A2 the Starseed room is photographed — strip standing, meteors falling", stripA.meteors === 6, `meteors=${stripA.meteors}`);

/* ══ §B THE STAND ═════════════════════════════════════ */
console.log("§B the feeder takes the stand on the seed's tile");
{ // THE SETUP (named): the seed's hex is laid cursed
  // white-box, so the purification her arrival must work
  // is guaranteed to stand in front of her.
  const seedTileRoom = room.map.get("0,0");
  if (seedTileRoom) { seedTileRoom.cursed = true; seedTileRoom.curseHp = seedTileRoom.curseMaxHp || 4; }
  ok("§B the setup stands: the seed's hex lies cursed in the room's own record before she crosses",
    room.map.get("0,0")?.cursed === true, `cursed=${room.map.get("0,0")?.cursed}`);
}
const landing = seatOf(wstate, F.name).hex;
const glideTo = (id) => { const c = centerOf(id); feeder.send({ type: "glide", tx: c.x, ty: c.y }); };
const near = RING1.slice().sort((x, y) => axDist(x, landing) - axDist(y, landing))[0];
const [nq, nr] = parseAx(near);
const opp = `${-nq},${-nr}`;
glideTo(near);
await waitFor(() => seatOf(wstate, F.name)?.hex === near, "her arrival at the seed's neighbour", 30000);
glideTo(opp);
let stoppedOnSeed = false;
{
  const s0 = realNow();
  while (realNow() - s0 < 20000) {
    const me = (feeder.state?.players ?? []).find(p => p.name === F.name) ?? seatOf(wstate, F.name);
    if (me?.hex === "0,0") { feeder.send({ type: "glideStop" }); stoppedOnSeed = true; break; }
    await sleep(40);
  }
}
await sleep(800);
ok("§B she stands ON the seed's tile, stopped mid-crossing by the real roads",
  stoppedOnSeed && seatOf(wstate, F.name)?.hex === "0,0", `hex=${seatOf(wstate, F.name)?.hex}`);
const purified = await tryWait(() => wireTile("0,0")?.cursed === false, 8000);
ok("§B the seed's hex reads purified on the wire under her standing", purified, `cursed=${wireTile("0,0")?.cursed}`);

/** One stepped stride: the clock steps twelve seconds —
 *  at her ruled rate (5/min, summoning power 0) exactly
 *  one whole energy — and the real pulse must bank it.
 *  The stub is HELD across the wait (the standing drive's
 *  own technique): the settle anchors her feed on the
 *  clock it reads, so restoring the clock mid-stride
 *  would leave the anchor standing in the stubbed future
 *  and the next stride's span would read near zero. After
 *  each stride the clock restores and a few real pulses
 *  pass, so the anchor heals back onto real time before
 *  the next stride steps it again. */
async function steppedStride(expectFed) {
  let off = 0;
  Date.now = () => realNow() + off;
  let rose = false;
  try {
    await sleep(400); // pulses re-anchor her feed onto the (real) stubbed clock
    off += 12 * 1000;
    rose = await tryWait(() => (wireSeed()?.fedEnergy ?? 0) >= expectFed, 8000);
  } finally { Date.now = realNow; }
  await sleep(700); // the anchor heals onto real time
  return rose;
}

/* ══ §C1 THE FIRST CROSSING — 15 FED, THE SAPLING ═════ */
console.log("§C1 the first crossing — set at 14 fed white-box, the pulse carries her over");
room.seedGrowth.fedEnergy = 14;
const energyC1 = seatOf(wstate, F.name)?.energy ?? 0;
const fedRose1 = await steppedStride(15);
const saplingRose = fedRose1 && await tryWait(() => wireSeed()?.level === 2, 8000);
ok("§C1 THE PULSE CARRIED IT OVER: the wire reads level 2 at 15 fed, stage sapling",
  saplingRose && wireSeed()?.fedEnergy === 15 && wireSeed()?.stage === "sapling" && wireSeed()?.nextStageAt === 30,
  JSON.stringify(wireSeed()));
ok("§C1 her purse paid exactly the one energy the span drank",
  (seatOf(wstate, F.name)?.energy ?? -1) === energyC1 - 1, `energy=${seatOf(wstate, F.name)?.energy} from=${energyC1}`);
ok("§C1 THE SAPLING'S BIRTHRIGHT: the seed's six neighbouring tiles stand purified on the wire",
  RING1.every(id => wireTile(id)?.cursed === false),
  RING1.map(id => `${id}:${wireTile(id)?.cursed}`).join(" "));

/* ══ §C1s THE STRIP AND THE TILE WEAR THE SAPLING ═════ */
{
  let stripSaw = false;
  try { await page.waitForFunction(() => (document.querySelector(".seed-strip")?.textContent ?? "").includes("Sapling of Light"), { timeout: 15000 }); stripSaw = true; } catch { /* stays false */ }
  const stripC1 = await stripRead();
  ok("§C1s THE STRIP CLIMBS: it names the Sapling of Light, the Sapling's step lit, fed 15 of 30 toward the Beacon, the new span's meter at its foot",
    stripSaw && stripC1.text.includes("fed 15 of 30 toward the Beacon") && stripC1.nowStep.includes("Sapling") && stripC1.fillWidth === "0%",
    stripC1.text.slice(0, 200));
  ok("§C1s THE TILE WEARS THE SAPLING'S FACE", stripC1.hasSaplingFace && !stripC1.hasBeaconFace,
    `sapling=${stripC1.hasSaplingFace} beacon=${stripC1.hasBeaconFace}`);
}

/* ══ §C2 THE SECOND CROSSING — 30 FED, THE BEACON ════ */
console.log("§C2 the second crossing — set at 29 fed white-box, the pulse carries her over");
room.seedGrowth.fedEnergy = 29;
const energyC2 = seatOf(wstate, F.name)?.energy ?? 0;
const fedRose2 = await steppedStride(30);
const beaconRose = fedRose2 && await tryWait(() => wireSeed()?.level === 3, 8000);
ok("§C2 THE PULSE CARRIED IT OVER: the wire reads level 3 at 30 fed, stage beacon, no next stage stands",
  beaconRose && wireSeed()?.fedEnergy === 30 && wireSeed()?.stage === "beacon" && wireSeed()?.nextStageAt === null,
  JSON.stringify(wireSeed()));
ok("§C2 her purse paid exactly the one energy the span drank",
  (seatOf(wstate, F.name)?.energy ?? -1) === energyC2 - 1, `energy=${seatOf(wstate, F.name)?.energy} from=${energyC2}`);

/* ══ §C2s THE STRIP AND THE TILE WEAR THE BEACON ══════ */
{
  let stripSaw = false;
  try { await page.waitForFunction(() => (document.querySelector(".seed-strip")?.textContent ?? "").includes("Beacon of Light"), { timeout: 15000 }); stripSaw = true; } catch { /* stays false */ }
  const stripC2 = await stripRead();
  ok("§C2s THE STRIP STANDS AT THE HEIGHT: it names the Beacon of Light, the Beacon's step lit, the meter full, the words saying it stands at its height",
    stripSaw && stripC2.text.includes("it stands at its height") && stripC2.nowStep.includes("Beacon") && stripC2.fillWidth === "100%",
    stripC2.text.slice(0, 220));
  ok("§C2s THE TILE WEARS THE BEACON'S FACE, and his meteors still fall over the still nebula",
    stripC2.hasBeaconFace && stripC2.meteors === 6,
    `beacon=${stripC2.hasBeaconFace} meteors=${stripC2.meteors}`);
  await page.screenshot({ path: `${OUT}/casual-seed-strip-beacon.png` });
  ok("§C2s the Beacon room is photographed — strip at its height, the climb behind it", true);
  const fault = await page.evaluate(() => !!document.querySelector(".room-fault")).catch(() => false);
  const hooksFall = consoleLines.some((l) => /Rendered more hooks|#310|room hit a fault/.test(l));
  ok("§C2s no fault card, no hooks fall in the witness's room across the whole climb", !fault && !hooksFall,
    consoleLines.filter((l) => /hook|310|fault/i.test(l)).join(" | ").slice(0, 200));
  await browser.close();
}

/* ══ §D THE BEACON'S RING ═════════════════════════════ */
console.log("§D the Beacon's ring — the casual field's own entry can birth no dark within one ring of a level-3 seed");
{
  // THE STRONG FORM: the whole map is purified white-box
  // but for ONE ring-1 tile left cursed and free — so the
  // furthest cursed ring IS the seed's ring, and only
  // the Beacon's guard can bar the birth. (The room is
  // discarded after this section; nothing downstream
  // reads its ground.) The dealing road is the casual
  // field's OWN entry — settleCasualEntry on the room
  // pulse, re-armed here white-box (the provoke restored,
  // the beat laid a full beat in the past): no
  // Storytender action exists in this room to deal with.
  for (const t of room.map.values()) { if (t.id !== "1,0") { t.cursed = false; t.curseHp = null; } }
  const t10 = room.map.get("1,0");
  if (t10) { t10.cursed = true; t10.curseHp = t10.curseMaxHp || 4; }
  ok("§D the white-box ground stands: the only cursed ground on the map is ring tile 1,0, beside the Beacon",
    room.map.get("1,0")?.cursed === true && [...room.map.values()].filter(t => t.cursed).length === 1);
  room.pendingDark = [];
  for (const id of [...room.dark.keys()]) room.dark.delete(id);
  room.curseStruck = true;
  room.entryAt = realNow() - 45000;
  await sleep(2500);
  const darkWhileGuarded = [...(wstate.state?.dark ?? [])];
  ok("§D THE GUARD BARS THE BIRTH: with the seed's ring the only cursed ground, the casual entry deals NO dark anywhere across ten pulses — the ground itself is refused",
    darkWhileGuarded.length === 0 && room.dark.size === 0, `dark=${darkWhileGuarded.map(d => d.hex).join(" ")}`);
  // THE CONTRAST: the same ground with the seed standing
  // at level 2 — the guard is level 3's alone — must take
  // the entry's dark onto that very tile on the room's
  // pulse. (The seed's own feeding, later in the same
  // pulse, will raise the level back to 3 off the banked
  // 30 fed — the birth is read on the wire before any
  // later pulse can be mistaken for its cause.)
  room.seedGrowth.level = 2;
  room.entryAt = realNow() - 45000;
  const dealtUnguarded = await tryWait(() => (wstate.state?.dark ?? []).some(d => d.hex === "1,0"), 10000);
  ok("§D AND WITHOUT THE GUARD THE SAME GROUND TAKES THE DARK: the casual entry deals onto 1,0 once the seed stands below level 3",
    dealtUnguarded, `dark=${(wstate.state?.dark ?? []).map(d => d.hex).join(" ")}`);
  room.curseStruck = false;
  room.seedGrowth.level = 3;
  for (const id of [...room.dark.keys()]) room.dark.delete(id);
  await tryWait(() => room.battle.active === false, 6000);
}

console.log(`\ndrive-table-seed-growth-casual: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
