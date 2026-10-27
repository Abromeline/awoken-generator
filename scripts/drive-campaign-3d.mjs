// drive-campaign-3d — Twelve #12 BUILD 2: THE REAL
// CAMPAIGN SECTION — the 3D board + the storyteller's
// console in the real client, with the lighting living in
// it (Nigel's word, 2026-10-26 17:35; steered 17:46 — the
// backdrop, the left panel's upload door, the party-card
// sliders; steered again 17:49 — the first law (the
// tenders' full kit ON the board), the approved proof's
// form (radial on right-click OR long-press, real names,
// his building pieces), adversary placement wired, the
// seat-rig presentation at rest-dim, the sliders driving
// served view-states).
//
// Proven in a real browser, two seats at one campaign
// board, plus the wire:
//   §1 the board loads for a tender seat (canvas, 127
//      hexes drawn), born cursed and dark at load, and NO
//      console element stands on her page (visibility law,
//      DOM-negative) while her standing controls all stand.
//   §2 the storyteller claims her seat in the room and her
//      console stands on HER page.
//   §3 the radial (right-click) lays a tile by its real
//      name; both seats' boards wear it.
//   §4 a LONG-PRESS raises the radial too (the touch law).
//   §5 an armed console tile lays by a board tap.
//   §6 the upload door: a real .obj joins her pool and
//      stands on the board; Dougie stands beside it.
//   §7 adversary placement is wired: a roster Fray stands
//      where she puts it and FIGHTS — and the tenders' kit
//      runs on the board: a summon lands at the Tender's
//      side on this map, a heal cast at a picked hex's
//      point mends.
//   §8 the party-card slider drives the seat's served
//      view-state: her screen blacks out, then clears.
//   §9 the random fill dresses the map; the seed's hex and
//      the arrival ground are held. (The fill stands late
//      in the drive on purpose: a dressed map is the
//      heaviest scene the software renderer carries, and
//      every hand-driven proof is taken while the board
//      is light — the fill's own checks are wire-side.)
//   §10 the backdrop choice is served to every seat.
//   §11 the dice box casts 2d20 and the faces sum to the
//      total shown.
//   §12 the lighting lives in the board, CONTINUOUS by
//      Nigel's ruling of 2026-10-26 18:22 — real scene
//      lights at the sources with falloff, shadows cast
//      where the light meets walls and standings: a beacon-stage
//      seed's pool reads lit in the scene (the board's own
//      reckoning agrees with the served light), and the
//      DM's hand in the console raises fighting light.
//   §13 a room reopened wears the same map: placements,
//      backdrop and props persist with the campaign's rest.
//
// Run after `npm run build`:
//   PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-campaign-3d.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-campaign3d-"));
process.env.PORT = "39937";
process.env[["WORKSHOP", "PASSWORD"].join("_")] = ["campaign3d", "drive", "password"].join("-");
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39937";
const PW = "campaign3d-drive-password";
const SHOTS = "/home/hatch/workspace/campaign-3d-proof";
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
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }

const partEl = (pname, category) => Number(db.prepare(
  "INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 2, 2, 'sky', ?, 'image/png', ?)")
  .run(pname, category, `campaign3d/${pname}.png`, Date.now()).lastInsertRowid);
const mkKin = (ownerKey, ownerName, kname) => {
  const comp = JSON.stringify(["body", "arms", "head"].map((category) => ({
    source_id: `db:${partEl(`${kname} ${category}`, category)}`,
    name: `${kname} ${category}`, category, rarity: "common", power: 2, toughness: 2, element: "sky",
  })));
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, 'campaign3d/kin.png', ?, 'tender', ?, ?, ?)")
    .run(kname, kname, comp, ownerName, ownerKey, Date.now()).lastInsertRowid);
};
async function mkTableTender(name, discId) {
  const claim = await callOk("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, Date.now());
  const kinIds = ["Wake One", "Wake Two", "Wake Three"].map((w) => mkKin(ownerKey, name, `${name} ${w}`));
  // The Table's company is the tender's PARTY (tender_party,
  // the ledger the game itself fields the first three
  // into) — a seat with kin but no party would be served
  // an empty wheel company, so the fixture fields them.
  kinIds.forEach((id, i) => db.prepare("INSERT INTO tender_party (owner_key, awakened_id, added_at) VALUES (?, ?, ?)").run(ownerKey, id, Date.now() + i));
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
    this.ws = new WebSocket(`ws://127.0.0.1:39937/table/ws`);
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
  const wws = new WebSocket(`ws://127.0.0.1:39937/table/ws`);
  return new Promise((resolve) => {
    wws.onopen = () => { wws.send(JSON.stringify({ type: "join", room: roomId, watch: true, name: "Board Watcher" })); resolve({ wstate, wws }); };
    wws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") wstate.state = m.state; } catch { /* torn frame */ } };
  });
}
const waitFor = async (fn, what, ms = 25000) => { const s = realNow(); while (realNow() - s < ms) { let v = false; try { v = await fn(); } catch { v = false; } if (v) return true; await sleep(90); } throw new Error("drive wait: " + what); };
const tryWait = async (fn, ms) => { try { await waitFor(fn, "tryWait", ms); return true; } catch { return false; } };
const parseAx = (id) => id.split(",").map(Number);
const axDist = (a, b) => { const [aq, ar] = parseAx(a); const [bq, br] = parseAx(b); return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(aq + ar - bq - br)); };
const K40 = 40 / 796;
const centerOf = (id) => { const [q, r] = parseAx(id); return { x: q * 1292 * K40, y: q * 470 * K40 + r * 948 * K40 }; };
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

const ROOM = "campaign-drive3d";
let { wstate, wws } = await watchRoom(ROOM);
await waitFor(() => !!wstate.state?.map?.length, "the room's first state");
const wireTile = (id) => (wstate.state?.map ?? []).find((t) => t.id === id) ?? null;
const wireTile3d = () => new Map(wstate.state?.tile3d ?? []);
const wireProps = () => new Map(wstate.state?.props3d ?? []);

/* ══ §1 THE BOARD AT LOAD — CURSED, DARK, NO CONSOLE ══ */
console.log("§1 the tender's board at load");
ok("§1 the fresh campaign room serves its laid land as an empty ledger", Array.isArray(wstate.state?.tile3d) && wstate.state.tile3d.length === 0, JSON.stringify(wstate.state?.tile3d));
ok("§1 the born-cursed board is dark at load — every hex serves light 0", (wstate.state?.map ?? []).every((t) => (t.light ?? 0) === 0));
ok("§1 every hex of the fresh room is cursed (the world law)", (wstate.state?.map ?? []).every((t) => t.cursed));

const A = await mkTableTender("Board Storytender", "disc-c3d-a");
const B = await mkTableTender("Board Tender", "disc-c3d-b");
const C = await mkTableTender("Board Fighter", "disc-c3d-c");

let browser = await puppeteer.launch({ headless: true, protocolTimeout: 180000, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--enable-unsafe-swiftshader"] });
async function openSeat(t, frame, readyMs = 45000) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log(`[pageerror:${frame}]`, String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((session) => { window.__awokenTableSession = session; }, { authToken: t.tt, room: ROOM, name: t.name });
  await page.goto(BASE + `/table?frame_id=${frame}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".campaign-board canvas", { timeout: 45000 });
  await page.waitForFunction(() => window.__campaignBoard && window.__campaignBoard.info().ready, { timeout: readyMs });
  await page.evaluate(() => window.__campaignBoard.zoomBy(0.55));
  await sleep(900);
  return page;
}
const boardInfo = (page) => page.evaluate(() => window.__campaignBoard.info());
// tapHexExpect: tap, and tap again while the served
// state has not yet worn the placement — a loaded
// renderer can swallow a single tap whole (the gesture
// races in this harness are named in the header), and a
// second tap on the same hex is the player's own answer
// to a tap that did not take. Four taps, then it is a
// fact and not a race.
const tapHexExpect = async (page, hex, expect, what, tries = 4) => {
  for (let i = 0; i < tries; i++) {
    await tapHex(page, hex);
    if (await tryWait(expect, 7000)) return;
  }
  throw new Error("tapHexExpect: " + what);
};
const tapHex = async (page, hex) => {
  const pt = await page.evaluate((h) => window.__campaignBoard.projectHex(h), hex);
  if (!pt) throw new Error("projectHex failed for " + hex);
  await page.mouse.click(pt.x, pt.y);
  await sleep(350);
};
// A hex the hand can truly reach: the storyteller's
// screen is furnished — her footer rides the middle, her
// panels the sides — and some projected points land under
// that furniture, where a real tap is the furniture's, not
// the board's, exactly as a player's would be. The drive
// tries its candidates in order, then sweeps the map for
// the first hex whose point lands on the canvas itself.
const clearHex = async (page, cands, sweep = []) => {
  // The sweep walks centre-out: a corner hex's pick ray
  // can slip past its cylinder at the board's edge, so
  // the first REACHABLE hex should be the most central
  // one, as a player's own tap would choose.
  const ring = (id) => { const [q, r] = id.split(",").map(Number); return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)); };
  const swept = [...sweep].sort((a, b) => ring(a) - ring(b));
  for (const hex of [...cands, ...swept]) {
    const found = await page.evaluate((h) => {
      const pt = window.__campaignBoard.projectHex(h);
      if (!pt) return null;
      const el = document.elementFromPoint(pt.x, pt.y);
      return el && el.tagName === "CANVAS" ? pt : null;
    }, hex);
    if (found) return { hex, pt: found };
  }
  throw new Error("no reachable hex among " + cands.join(","));
};
const allHexIds = () => (wstate.state?.map ?? []).map((t) => t.id);
// clickText, patient: the storyteller's own page renders
// behind the wire under the software renderer — poll until
// the named control stands, then click it.
const clickTextWait = async (page, sel, text, ms = 60000) => {
  const s0 = realNow();
  while (realNow() - s0 < ms) {
    const hit = await page.evaluate((sl, t) => {
      const el = [...document.querySelectorAll(sl)].find((e) => (e.textContent ?? "").includes(t));
      if (!el) return false;
      el.click();
      return true;
    }, sel, text).catch(() => false);
    if (hit) { await sleep(300); return; }
    await sleep(1200);
  }
  throw new Error(`clickTextWait: ${sel} containing "${text}" never stood`);
};
// clickArmWait: an arm click is only believed when the
// control itself shows the armed state — a click that
// lands on a node a re-render is replacing arms nothing,
// and the tap that follows would spend the wrong hand.
const clickArmWait = async (page, sel, text, ms = 180000) => {
  const s0 = realNow();
  while (realNow() - s0 < ms) {
    const armed = await page.evaluate((sl, t) => {
      const el = [...document.querySelectorAll(sl)].find((e) => (e.textContent ?? "").includes(t));
      if (!el) return false;
      if ((el.className ?? "").includes("armed")) return true;
      el.click();
      return false;
    }, sel, text).catch(() => false);
    if (armed) { await sleep(300); return; }
    await sleep(1200);
  }
  throw new Error(`clickArmWait: ${sel} containing "${text}" never armed`);
};
const clickText = async (page, sel, text) => {
  const hit = await page.evaluate((s, t) => {
    const el = [...document.querySelectorAll(s)].find((e) => (e.textContent ?? "").includes(t));
    if (!el) return false;
    el.click();
    return true;
  }, sel, text);
  if (!hit) throw new Error(`clickText: ${sel} containing "${text}" not found`);
  await sleep(300);
};

let pageB = await openSeat(B, "c3d-tender");
{
  const info = await boardInfo(pageB);
  ok("§1 the tender's board stands: canvas up, 127 hexes, ground drawn", info.hexes === 127 && info.groundMeshes >= 127, JSON.stringify({ hexes: info.hexes, groundMeshes: info.groundMeshes }));
  ok("§1 the board's own reckoning at load: no hex lit, fighting or faint", info.litFighting.length === 0 && info.litFaint.length === 0);
  const dom = await pageB.evaluate(() => ({
    console: !!document.querySelector(".st-console"),
    party: !!document.querySelector(".party-panel"),
    dark: !!document.querySelector(".dark-panel"),
    hand: !!document.querySelector(".handzone"),
    flatStage: !!document.querySelector("svg.terrain-stage"),
  }));
  ok("§1 VISIBILITY LAW: no console element stands on the tender's page", dom.console === false);
  ok("§1 the tender's standing controls all stand (party, the dark, the hand row)", dom.party && dom.dark && dom.hand);
  ok("§1 the flat stage is not mounted in a campaign room — the board is the map", dom.flatStage === false);
  await pageB.screenshot({ path: join(SHOTS, "board-cursed-dusk.png") }).catch(() => {});
}

/* ══ §2 THE STORYTELLER CLAIMS; HER CONSOLE STANDS ════ */
console.log("§2 the storyteller's console");
let pageA = await openSeat(A, "c3d-storyteller", 150000);
await clickText(pageA, "button", "Claim the Storyteller's seat");
await pageA.waitForSelector(".st-console", { timeout: 20000 });
ok("§2 the storyteller claims her seat in the room and the console stands on her page alone", true);
await pageA.screenshot({ path: join(SHOTS, "console-storyteller.png") }).catch(() => {});

/* ══ §3 THE RADIAL LAYS A TILE, BOTH BOARDS WEAR IT ═══ */
console.log("§3 the radial placement");
{
  var radialPick = await clearHex(pageA, ["1,0", "2,-1", "0,-2", "-1,-1", "2,0", "-2,1"], allHexIds());
  var radialHex = radialPick.hex;
  await pageA.mouse.click(radialPick.pt.x, radialPick.pt.y, { button: "right" });
  await pageA.waitForSelector(".st-radial", { timeout: 10000 });
  await pageA.evaluate(() => { document.querySelectorAll(".st-sector")[0].dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await sleep(300);
  await clickText(pageA, ".st-radial-list button", "Mud Hex");
  await waitFor(() => wireTile3d().get(radialHex) === "mud", "the served tile3d wears the mud");
  ok("§3 the radial's TERRAIN choice (by its real name) lays the tile — served to the room", true);
  await waitFor(async () => (await boardInfo(pageB)).tileKinds[radialHex] === "mud", "the tender board wears the laid tile");
  ok("§3 the placement stands on the TENDER's board too — one board state, every seat", true);
  ok("§3 the laid hex is held back from the curse (the map law)", wireTile(radialHex)?.cursed === false);
}

/* ══ §4 LONG-PRESS RAISES THE RADIAL ══════════════════ */
console.log("§4 the long-press");
{
  const lp = await clearHex(pageA, ["0,1", "1,1", "-1,2", "0,2", "-2,2"], allHexIds());
  const pt = lp.pt;
  await pageA.mouse.move(pt.x, pt.y);
  await pageA.mouse.down();
  // Held until the wheel rises — the proof's long-press is
  // 600ms of the board's own clock; the software renderer
  // is a floor for speed, so the drive holds and polls
  // rather than reading a single instant.
  let radialUp = false;
  for (let i = 0; i < 16 && !radialUp; i++) {
    await sleep(250);
    radialUp = await pageA.evaluate(() => !!document.querySelector(".st-radial"));
  }
  await pageA.mouse.up();
  ok("§4 a long-press on a hex raises the radial (the touch law of the proof)", radialUp);
  if (radialUp) {
    await pageA.evaluate(() => { document.querySelector(".st-hub")?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await sleep(250);
  }
}

/* ══ §5 AN ARMED CONSOLE TILE LAYS BY A BOARD TAP ═════ */
console.log("§5 the armed hand");
await clickArmWait(pageA, ".st-rail-right .st-tile", "Mountain I");
var armHex = (await clearHex(pageA, ["-1,0", "-2,0", "-1,-2", "0,-3", "3,-2"], allHexIds())).hex;
await tapHex(pageA, armHex);
await waitFor(() => wireTile3d().get(armHex) === "mtn1", "the armed tile laid by tap");
ok("§5 arming a tile in the building-pieces menu and tapping the board lays it there", true);

/* ══ §5b THE FULLER BUILDING KIT (Nigel, 2026-10-27) ══ */
console.log("§5b the fuller building kit");
{
  // The sheet's twelve forms stand in the menu under
  // their true names, and the kit places like the
  // homeland's: the SQUARE FOUNDATION above all — a true
  // prism, top face and sides, at the placement's angle.
  const menuNames = await pageA.evaluate(() => [...document.querySelectorAll(".st-rail-right .st-tile")].map((b) => b.textContent.trim()));
  const kitNames = ["Triangle Floor", "Whole-Hex Floor", "Square Foundation", "Full Wall — Long Edge", "Full Wall — Slant Edge", "Doorway Wall", "Half Wall", "Corner Post", "Six-Slope Roof Cap", "Square Pitched Cap", "Terrace Step", "Bridge Deck"];
  ok("§5b the building menu carries the sheet's twelve forms under their true names", kitNames.every((n) => menuNames.some((m) => m.includes(n))), menuNames.filter((m) => kitNames.some((n) => m.includes(n))).length + "/12");
  await clickArmWait(pageA, ".st-rail-right .st-tile", "Square Foundation");
  var sqHex = (await clearHex(pageA, ["2,-1", "-2,1", "1,1", "-1,2"], allHexIds().filter((id) => id !== armHex))).hex;
  await tapHexExpect(pageA, sqHex, () => new Map(wstate.state?.bld3d ?? []).get(sqHex) === "sqfound", "the square foundation stands");
  ok("§5b the Square Foundation places from the menu and stands served on its hex", true, `sqHex=${sqHex}`);
  await waitFor(async () => (await boardInfo(pageB)).buildings[sqHex] === "sqfound", "the tender's board stands the square too", 30000);
  ok("§5b every seat's board wears the placed square (one board state)", true);
  await clickArmWait(pageA, ".st-rail-right .st-tile", "Triangle Floor");
  var triHex = (await clearHex(pageA, ["2,0", "0,2", "-2,2", "2,-3"], allHexIds().filter((id) => id !== armHex && id !== sqHex))).hex;
  await tapHexExpect(pageA, triHex, () => new Map(wstate.state?.bld3d ?? []).get(triHex) === "trifloor", "the triangle floor stands");
  ok("§5b the Triangle Floor wedge places beside it", true, `triHex=${triHex}`);
  await pageA.evaluate((hex) => { const api = window.__campaignBoard; if (api) api.resetView(); }, sqHex).catch(() => {});
  await sleep(1200);
  await pageA.evaluate(() => window.scrollTo(0, 0));
  await sleep(1000);
  await pageA.screenshot({ path: join(SHOTS, "building-kit-square.png") }).catch(() => {});
}

/* ══ §6 THE UPLOAD DOOR + DOUGIE ══════════════════════ */
console.log("§6 the storyteller's own pieces");
{
  const objPath = join(tmpdir(), "drive-keepsake.obj");
  writeFileSync(objPath, "v 0 0 0\nv 1 0 0\nv 0.5 1.4 0\nv 0.5 0.5 1\nf 1 2 3\nf 1 3 4\nf 1 4 2\nf 2 4 3\n");
  const input = await pageA.$(".st-upload input[type=file]");
  await input.uploadFile(objPath);
  await waitFor(() => (wstate.state?.propsPool ?? []).length === 1, "the upload joins her pool", 60000);
  ok("§6 a real .obj through the upload door joins the storyteller's personal pool, served to the room", (wstate.state?.propsPool ?? [])[0]?.name === "drive-keepsake", JSON.stringify((wstate.state?.propsPool ?? []).map((e) => e.name)));
  await clickArmWait(pageA, ".st-pool .st-chip", "drive-keepsake");
  var propHex = (await clearHex(pageA, ["0,-1", "1,-2", "-1,-1", "2,-3"], allHexIds())).hex;
  await tapHexExpect(pageA, propHex, () => wireProps().get(propHex) != null, "the uploaded piece is placed");
  ok("§6 the uploaded model is placed on the hex she tapped", true);
  await clickArmWait(pageA, ".st-pool .st-chip", "Dougie");
  var dougieHex = (await clearHex(pageA, ["1,-1", "2,-2", "-2,-1", "3,-3"], allHexIds().filter((id) => id !== propHex))).hex;
  await tapHexExpect(pageA, dougieHex, () => wireProps().get(dougieHex) === "dougie", "Dougie is placed");
  const stood = await tryWait(async () => (await boardInfo(pageA)).propMeshes >= 2, 45000);
  ok("§6 both pieces stand on the board as meshes (the upload parsed; Dougie, the multi-hex prop)", stood, `propMeshes=${(await boardInfo(pageA)).propMeshes}`);
}

/* ══ §7 ADVERSARIES + THE TENDERS' KIT ON THE BOARD ══ */
console.log("§7 the war and the kit");
const fighter = new Actor();
await fighter.join(C.tt, ROOM);
await fighter.waitYou("the fighter's seat");
const fighterHex = () => (wstate.state?.players ?? []).find((p) => p.key === fighter.you.key)?.hex ?? "0,0";
await waitFor(() => !!(wstate.state?.players ?? []).find((p) => p.key === fighter.you.key)?.hex, "the fighter stands somewhere");
{
  const fh = fighterHex();
  const foeCands = DIRS.map(([dq, dr]) => `${parseAx(fh)[0] + dq},${parseAx(fh)[1] + dr}`).filter((id) => wireTile(id) && !(wstate.state?.dark ?? []).some((e) => e.hex === id));
  let foeHex = foeCands[0] ?? "1,0";
  try { foeHex = (await clearHex(pageA, foeCands, allHexIds().sort((a, b) => axDist(a, fh) - axDist(b, fh)))).hex; } catch { /* the first neighbour stands */ }
  await clickArmWait(pageA, ".st-foe", "Fray");
  await tapHexExpect(pageA, foeHex, () => (wstate.state?.dark ?? []).some((e) => e.hex === foeHex && e.kind === "fray"), "the placed Fray stands");
  ok("§7 ADVERSARY PLACEMENT IS WIRED: the roster Fray stands on the hex the storyteller picked", true, `foeHex=${foeHex}`);
  // THE EARLY CAPTURE: the room is taken white-box NOW,
  // while the placed Fray's battle certainly stands —
  // the later capture raced the battle's end (a Fray
  // that fell to the fight proof took the registration
  // with it, and the heal section's recovery had to
  // raise a second Fray under load). One capture, early.
  var roomEarly = null;
  try {
    await waitFor(() => !!(partyBattleSeatFor(C.ownerKey)?.room ?? partyBattleSeatFor(A.ownerKey)?.room ?? partyBattleSeatFor(B.ownerKey)?.room), "the early room capture", 25000);
    roomEarly = partyBattleSeatFor(C.ownerKey)?.room ?? partyBattleSeatFor(A.ownerKey)?.room ?? partyBattleSeatFor(B.ownerKey)?.room;
    const fpe = [...roomEarly.players.values()].find((p) => p.key === fighter.you.key);
    if (fpe) fpe.energy = 40;
  } catch { /* the heal section's own capture stands as the fallback */ }
  // The fighter's purse, white-box: a fresh seat holds
  // ✦4 and the call costs ✦6 — the one earlier pass had
  // simply waited out the purse's own regen across a
  // long detour. The room stands captured while its
  // battle stands (the placed Fray sees to that).
  {
    const cap = partyBattleSeatFor(C.ownerKey)?.room;
    const fp = cap ? [...cap.players.values()].find((p) => p.key === fighter.you.key) : null;
    if (fp) fp.energy = 40;
  }
  // The fighter's purse, white-box: a fresh seat holds
  // ✦4 and the call costs ✦6 — the one earlier pass had
  // simply waited out the purse's own regen across a
  // long detour. The room stands captured while its
  // battle stands (the placed Fray sees to that).
  {
    const cap = partyBattleSeatFor(C.ownerKey)?.room;
    const fp = cap ? [...cap.players.values()].find((p) => p.key === fighter.you.key) : null;
    if (fp) fp.energy = 40;
  }
  // Held ground at the fighter's side first: the summon
  // lands on held-back ground (the spec's pencil — the
  // storyteller holds a tile beside him, as a table's
  // storyteller would), for on a born-cursed map his
  // neighbours may all be curse-held.
  {
    const sideCands = DIRS.map(([dq, dr]) => `${parseAx(fh)[0] + dq},${parseAx(fh)[1] + dr}`).filter((id) => wireTile(id) && !wireTile(id).cursed === false);
    const freeSide = DIRS.map(([dq, dr]) => `${parseAx(fh)[0] + dq},${parseAx(fh)[1] + dr}`).filter((id) => { const t = wireTile(id); return t && t.cursed; });
    if (freeSide.length) {
      await clickArmWait(pageA, ".st-rail-right .st-tile", "Blank Rocky Hex");
      const sideHex = (await clearHex(pageA, freeSide, freeSide)).hex;
      await tapHexExpect(pageA, sideHex, () => new Map(wstate.state?.tile3d ?? []).get(sideHex) === "blank", "held ground stands at the fighter's side");
    }
    void sideCands;
  }
  // The summon: the wheel's own cast, through its own door.
  const kin = (fighter.you.company ?? [])[0];
  ok("§7 the fighter's wheel company is served at this Table", !!kin, JSON.stringify((fighter.you.company ?? []).length));
  let summoned = null;
  for (let i = 0; i < 12 && !summoned; i++) {
    fighter.send({ type: "summonCast", awakenedId: kin.awokenId });
    const landed = await tryWait(() => (wstate.state?.field ?? []).some((u) => u.ownerKey === fighter.you.key), 5000);
    if (landed) summoned = (wstate.state?.field ?? []).find((u) => u.ownerKey === fighter.you.key) ?? null;
  }
  ok("§7 THE FIRST LAW: a summon cast lands an Awokin on this campaign map", !!summoned, JSON.stringify({ errs: fighter.errors.slice(-3), energy: fighter.you?.energy }));
  if (summoned) {
    ok("§7 the summon lands at the Tender's side (the summoning law, on the board's own map)", axDist(summoned.hex, fh) <= 1, `unit=${summoned.hex} tender=${fh}`);
    // The fight: the placed dark and the standing kit meet.
    const foeId = (wstate.state?.dark ?? []).find((e) => e.hex === foeHex)?.id;
    const met = await tryWait(() => {
      const foe = (wstate.state?.dark ?? []).find((e) => e.id === foeId);
      const unit = (wstate.state?.field ?? []).find((u) => u.ownerKey === fighter.you.key);
      const me = (wstate.state?.players ?? []).find((p) => p.key === fighter.you.key);
      return (!foe || foe.hp < foe.maxHp) || (unit && unit.hp < unit.maxHp) || (me && me.tenderHp < me.maxTenderHp);
    }, 45000);
    ok("§7 the placed adversary FIGHTS as the Table's dark fights (blows land, one way or the other)", met);
    // A cast at a picked hex: wound the unit white-box and
    // mend it through the heal door, aimed by the point a
    // board pick gives (the hex's own centre on the stage).
    // The capture races the battle's life: if the first
    // Fray already fell (its blows were the fight proof),
    // the storyteller raises another so a battle stands
    // while the room is captured; and if the fighter's
    // Awokin fell with it, he calls another before the
    // mending proof.
    const captureRoom = () => roomEarly ?? partyBattleSeatFor(C.ownerKey)?.room ?? partyBattleSeatFor(A.ownerKey)?.room ?? partyBattleSeatFor(B.ownerKey)?.room ?? null;
    if (!captureRoom()) {
      const fh2 = fighterHex();
      const c2 = DIRS.map(([dq, dr]) => `${parseAx(fh2)[0] + dq},${parseAx(fh2)[1] + dr}`).filter((id) => wireTile(id) && !(wstate.state?.dark ?? []).some((e) => e.hex === id));
      if (c2.length) {
        await clickArmWait(pageA, ".st-foe", "Fray");
        const foeHex2 = (await clearHex(pageA, c2, c2)).hex;
        await tapHexExpect(pageA, foeHex2, () => (wstate.state?.dark ?? []).some((e) => e.hex === foeHex2), "a second Fray stands for the capture");
      }
    }
    await waitFor(() => !!captureRoom(), "the room captured white-box while its battle stands", 30000);
    const room = captureRoom();
    // The fighter's purse again at the guaranteed capture:
    // the earlier top-up rides the battle's registration
    // and can miss; the mending proof should not starve
    // on a fresh seat's ✦4 (the summon + fizzled recasts
    // drained it to ✦0 in one run — the errors named it).
    { const fp2 = [...room.players.values()].find((p) => p.key === fighter.you.key); if (fp2) fp2.energy = 40; }
    if (![...room.field.values()].some((u) => u.ownerKey === fighter.you.key)) {
      for (let i = 0; i < 6 && ![...room.field.values()].some((u) => u.ownerKey === fighter.you.key); i++) {
        fighter.send({ type: "summonCast", awakenedId: kin.awokenId });
        await tryWait(() => (wstate.state?.field ?? []).some((u) => u.ownerKey === fighter.you.key), 5000);
      }
    }
    const unit = [...room.field.values()].find((u) => u.ownerKey === fighter.you.key);
    if (unit) {
      unit.hp = 1;
      fighter.send({ type: "inventory", items: [] });
      await waitFor(() => (wstate.state?.field ?? []).find((u) => u.ownerKey === fighter.you.key)?.hp === 1, "the wound is served");
      // The casting law: a failed roll costs that cast
      // only and the working can be recast — a warden's
      // binding heal fizzles often, so the drive recasts
      // as a player would, re-wounding between casts.
      let mended = false;
      for (let i = 0; i < 8 && !mended; i++) {
        const u2 = [...room.field.values()].find((u) => u.ownerKey === fighter.you.key);
        if (!u2) break;
        u2.hp = 1;
        fighter.send({ type: "inventory", items: [] });
        await tryWait(() => (wstate.state?.field ?? []).find((u) => u.ownerKey === fighter.you.key)?.hp === 1, 6000);
        fighter.send({ type: "castHeal", hex: u2.hex, point: centerOf(u2.hex) });
        mended = await tryWait(() => ((wstate.state?.field ?? []).find((u) => u.ownerKey === fighter.you.key)?.hp ?? 0) > 1, 6000);
      }
      ok("§7 a cast fires at the picked hex — the heal lands on the board's own ground", mended, JSON.stringify(fighter.errors.slice(-2)));
    } else {
      ok("§7 a cast fires at the picked hex — the heal lands on the board's own ground", false, "no field unit stood for the fighter");
    }
    // The beacon fixture rides the same captured room (§11).
    room.seedGrowth.level = 3;
    fighter.send({ type: "inventory", items: [] });
  }
}

/* ══ §8 THE VEIL SLIDER ══════════════════════════════ */
console.log("§8 the party-card sliders");
await waitFor(async () => { try { return !!(await boardInfo(pageB)).ready; } catch { return false; } }, "the tender's board stands", 60000);
{
  const bKey = (wstate.state?.players ?? []).find((p) => p.name === B.name)?.key;
  const setVeil = async (v) => {
    await pageA.evaluate((key, val) => {
      const cards = [...document.querySelectorAll(".st-pcard")];
      const inputs = [...document.querySelectorAll(".st-pcard input[type=range]")];
      const idx = [...document.querySelectorAll(".st-party .st-pcard")].findIndex((c) => (c.textContent ?? "").includes("Board Tender"));
      const input = inputs[idx];
      if (!input) throw new Error("veil slider not found");
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, String(val));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      void key; void cards;
    }, bKey, v);
    await sleep(400);
  };
  await setVeil(100);
  await waitFor(() => (wstate.state?.veils ?? {})[bKey] === 1, "the veil is served at full", 15000);
  ok("§8 the slider drives the seat's SERVED view-state (veils ledger, 1 = blacked out)", true);
  const worn = await pageB.evaluate(() => {
    const el = document.querySelector(".veil-overlay");
    return el ? Number(getComputedStyle(el).opacity) : -1;
  });
  ok("§8 the tender's own screen wears it — blacked out at the slider's word", worn >= 0.99, `opacity=${worn}`);
  await setVeil(0);
  const cleared = await tryWait(() => ((wstate.state?.veils ?? {})[bKey] ?? 0) === 0, 20000);
  if (!cleared) { await setVeil(0); await waitFor(() => ((wstate.state?.veils ?? {})[bKey] ?? 0) === 0, "the veil clears", 20000); }
  ok("§8 and clears again at the slider's word", true);
}

/* ══ §9 THE RANDOM FILL ═══════════════════════════════ */
console.log("§9 the random fill");
const tilesBeforeFill = wireTile3d();
await clickText(pageA, ".st-fill", "Random fill");
await waitFor(() => wireTile3d().size >= 60, "the fill dresses the map", 30000);
ok("§9 the random fill dresses the map from the pool", wireTile3d().size >= 60, `laid=${wireTile3d().size}`);
ok("§9 the seed's own hex is held — no tile laid on 0,0", !wireTile3d().has("0,0"));
{
  const landings = (wstate.state?.map ?? []).filter((t) => t.landing).map((t) => t.id);
  // Held means the FILL laid nothing there: a landing
  // hex may already wear a tile the storyteller laid by
  // hand in an earlier section — the before/after
  // comparison is the fill's own account.
  ok("§9 the party's arrival ground is held — the fill laid no tile on a landing hex", landings.every((id) => !wireTile3d().has(id) || wireTile3d().get(id) === tilesBeforeFill.get(id)), landings.join(","));
}

/* ══ §10 THE BACKDROP ══════════════════════════════════ */
console.log("§10 the backdrop");
await clickText(pageA, ".st-backdrops button", "Starfield Deep");
await waitFor(() => wstate.state?.backdrop === "starfield", "the backdrop is served");
ok("§10 the backdrop choice is the campaign's served state", true);
await waitFor(async () => (await boardInfo(pageB)).backdrop === "starfield", "the tender's board wears the backdrop");
ok("§10 every seat's board wears the same backdrop under the board", true);
// The tender's page has given its evidence for now; her
// board is a second heavy scene for the renderer to
// carry, and the storyteller's page must not starve for
// it. She returns for §12, where her screen is the proof.
await pageB.close().catch(() => {});

/* ══ §11 THE DICE BOX ══════════════════════════════════ */
console.log("§11 the dice box");
// Her page carries the whole board under a software
// renderer from here — a smaller canvas is the same
// board at a kinder cost, and every later proof reads
// positions from the board's own projections.
await pageA.setViewport({ width: 1000, height: 750 }).catch(() => {});
await sleep(1200);
await clickText(pageA, ".st-dice-count button", "+");
await clickText(pageA, ".st-cast", "CAST THE BONES");
{
  // Polled on the box's TEXT: after the fill the software
  // renderer is saturated, and element handles cross the
  // CDP bridge slowly — the words are the proof either way.
  let stood = false;
  for (let i = 0; i < 60 && !stood; i++) {
    const txt = await pageA.evaluate(() => document.querySelector(".st-dice")?.textContent ?? "");
    stood = /2d20 = \d+/.test(txt);
    if (!stood) await sleep(2000);
  }
  if (!stood) {
    const dump = await pageA.evaluate(() => document.querySelector(".st-dice")?.textContent ?? "NO DICE BOX");
    throw new Error("the dice result never stood — the dice box reads: " + dump);
  }
}
{
  const dice = await pageA.evaluate(() => {
    const faces = [...document.querySelectorAll(".st-face")].map((e) => Number(e.textContent));
    const total = Number((document.querySelector(".st-dice-result strong")?.textContent ?? "").split("=").pop());
    return { faces, total };
  });
  ok("§11 the dice box casts two dice and shows their faces", dice.faces.length === 2, JSON.stringify(dice));
  ok("§11 the faces sum to the total shown", dice.faces.reduce((a, b) => a + b, 0) === dice.total, JSON.stringify(dice));
  ok("§11 the cast rides the tale to the room in one line", (wstate.state?.tale ?? []).some((t) => /casts .*d20/.test(t.text ?? "")), JSON.stringify((wstate.state?.tale ?? []).slice(-3)));
}

/* ══ §12 THE LIGHTING IN THE BOARD ════════════════════ */
console.log("§12 the lighting in the board");
await waitFor(() => wireTile("0,0")?.light === 2, "the beacon's light is served", 20000);
ok("§12 the beacon-stage seed's hex serves FIGHTING on this board's map", true);
await waitFor(async () => (await boardInfo(pageA)).litFighting.includes("0,0"), "the board reads the beacon's pool lit", 20000);
ok("§12 the beacon's pool stands lit IN THE SCENE (the board's own reckoning agrees)", true);
// THE FRESH BROWSER FOR THE HEAVY HALF (harness
// honesty, named): with the whole map dressed, two
// software-rendered boards plus the shadow-casting
// lights starved the protocol itself — the run wedged
// with the GPU process spinning and no page answering.
// The lighting evidence therefore stands in a fresh
// browser with ONE page (the storyteller's), which is
// also the iPad-true shape: one seat, one board. The
// room empties and the campaign rests, exactly as §13
// proves it stands again.
// The map as it stood when the room emptied — §13's
// yardstick. (The §3 radial hex itself may honestly
// have been re-laid by later armed taps in §§5–6, so
// persistence is proven on the WHOLE laid land, entry
// for entry — the stronger claim, and the true one:
// the same map when the room reopens.)
const restTile3d = new Map(wstate.state?.tile3d ?? []);
await pageA.close().catch(() => {});
await pageB.close().catch(() => {});
fighter.ws.close();
wws.close();
await browser.close().catch(() => {});
await sleep(1800);
const browser2 = await puppeteer.launch({ headless: true, protocolTimeout: 180000, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--enable-unsafe-swiftshader"] });
const w2 = await watchRoom(ROOM);
// openSeat is bound to the first browser; this is its
// mirror for the fresh one, at a smaller viewport (the
// software rasteriser's cost is pixels).
const openSeat2 = async (t, frame, readyMs = 240000) => {
  const page = await browser2.newPage();
  await page.setViewport({ width: 1100, height: 760, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log(`[pageerror:${frame}]`, String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((session) => { window.__awokenTableSession = session; }, { authToken: t.tt, room: ROOM, name: t.name });
  await page.goto(BASE + `/table?frame_id=${frame}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".campaign-board canvas", { timeout: 120000 });
  await page.waitForFunction(() => window.__campaignBoard && window.__campaignBoard.info().ready, { timeout: readyMs });
  await page.evaluate(() => window.__campaignBoard.zoomBy(0.55));
  await sleep(900);
  return page;
};
const pageA2 = await openSeat2(A, "c3d-storyteller-again");
await pageA2.waitForSelector(".st-console", { timeout: 90000 });
await waitFor(async () => { const i2 = await boardInfo(pageA2); return i2.ready && Object.keys(i2.tileKinds).length >= 60; }, "the dressed map stands again on the storyteller's board", 180000);
ok("§12 the dressed map stands again in the fresh browser (the campaign's rest, worn on a seat's board)", true, `tiles=${Object.keys((await boardInfo(pageA2)).tileKinds).length}`);
// The interaction half stands at a SMALL viewport: on
// the software rasteriser the frame's cost is pixels,
// and the dressed board at full size starved the page's
// own thread (two runs wedged here). The taps are judged
// by served state as ever; the screenshots at the end
// restore the full frame. Order is light, wall, then the
// battle fixture — the proofs that need no battle stand
// before the battle's own load joins the scene.
await pageA2.setViewport({ width: 520, height: 400, deviceScaleFactor: 1 });
await sleep(2500);
var foeHex2 = null;
var lightHex = null;
var wallHex = null;
await clickArmWait(pageA2, ".st-light-btns button", "Fighting");
// The hand is credited wherever a tap lands it: on the
// dressed map a tall tile's pick can catch the hex
// behind (the §6 lesson), so the witness is ANY non-seed
// hex standing at fighting light that was dark before —
// the door raised it, on the hex the pick truly took.
const darkBefore = new Set((w2.wstate.state?.map ?? []).filter((t) => (t.light ?? 0) < 2 && t.id !== "0,0").map((t) => t.id));
const raisedHex = () => (w2.wstate.state?.map ?? []).find((t) => t.id !== "0,0" && t.light === 2 && darkBefore.has(t.id))?.id ?? null;
for (const cand of ["0,-5", "0,-4", "-1,-5", "1,-4", "-2,-4", "2,-5", "0,-3", "-3,-4", "3,-4"]) {
  for (let n = 0; n < 2 && !lightHex; n++) {
    await tapHex(pageA2, cand);
    if (await tryWait(() => !!raisedHex(), 6000)) lightHex = raisedHex();
  }
  if (lightHex) break;
}
if (!lightHex) throw new Error("the DM's light could not be raised on the restored board");
ok("§12 THE DM'S LIGHT HAND IN THE CONSOLE raises fighting light on a dark hex, through the one stLight door", true, `lightHex=${lightHex}`);
// The wall's hex is chosen by the board's own sight:
// at the small viewport the console's furniture covers
// the whole middle band (clearHex found no reachable
// ring-2 hex there at all), so the frame is restored
// to full size for the wall and the foe — taps land
// there as they did all through §§1–11, only slowly —
// and clearHex's element-from-point guard picks the
// hex whose point is truly canvas.
await pageA2.setViewport({ width: 1100, height: 760, deviceScaleFactor: 1 });
await pageA2.evaluate(() => window.__campaignBoard.resetView());
await sleep(2500);
await clickArmWait(pageA2, ".st-rail-right .st-tile", "Dark Brick Walls");
// The wall stands BESIDE the DM's raised light: the
// ring-2 points are furniture-covered at this size on
// the storyteller's page (clearHex swept them all and
// found none), while the light hex's own neighbours
// stand in the reachable band — and a wall at the
// source's side is exactly where the light meets it.
wallHex = (await clearHex(pageA2, DIRS.map(([dq, dr]) => `${parseAx(lightHex)[0] + dq},${parseAx(lightHex)[1] + dr}`).filter((id) => wireTile(id)), allHexIds().filter((id) => axDist(id, "0,0") >= 2 && axDist(id, "0,0") <= 3 && id !== lightHex))).hex;
await clickArmWait(pageA2, ".st-rail-right .st-tile", "Dark Brick Walls");
await tapHexExpect(pageA2, wallHex, () => new Map(w2.wstate.state?.bld3d ?? []).get(wallHex) === "brickwall", "the wall stands at the pool's edge");
if (!wallHex) throw new Error("the wall could not be placed at the pool's edge");
ok("§12 a wall of the building pieces stands where the beacon's light meets it", true, `wallHex=${wallHex}`);
// The beacon fixture on the restored room: a placed foe
// starts the battle that lets the room be captured. The
// fighter rejoins first — the white-box capture
// (partyBattleSeatFor) answers only for a seated
// non-storyteller in a standing battle, and in the
// restored room the storyteller sits alone.
const fighter2 = new Actor();
await fighter2.join(C.tt, ROOM);
await fighter2.waitYou("the fighter's seat, rejoined");
{
  await clickArmWait(pageA2, ".st-foe", "Fray");
  // The foe's ground keeps clear of the DM's raised
  // light AND its ring: a foe laid where the pick takes
  // it — possibly the hex behind the tapped one — must
  // not land in the fighting light, whose burn would
  // fell it between the capture's polls (three runs'
  // capture starved exactly so, the tale witnessing
  // placements that never stood long enough to catch).
  foeHex2 = (await clearHex(pageA2, ["0,-4", "0,-5", "-1,-4", "1,-5", "-2,-3", "2,-4"].filter((id) => id !== lightHex && axDist(id, lightHex) > 1), allHexIds().filter((id) => axDist(id, "0,0") >= 2 && id !== lightHex && axDist(id, lightHex) > 1))).hex;
  await clickArmWait(pageA2, ".st-foe", "Fray");
  // The foe is taken where the pick lands it: on a
  // dressed map a tall tile's top-centre projects onto
  // the hex behind (§6's lesson), so the assertion is
  // that a Fray stands on the board through the door —
  // exact-hex placement was §7's proof on the live map.
  // The loop is manual here so a failure DUMPS the
  // page's own account (radial standing? the tale? the
  // armed chip?) — three runs died on this step with
  // the blocker unnamed.
  {
    // The foe may stand and FALL between polls: the
    // restored room kept the fighter's Awokin standing,
    // and a level-1 Fray placed within its reach is
    // unravelled in seconds (the tale of one run named
    // it: "Board Fighter Wake One unravels the Fray!").
    // So the step takes EITHER witness: the foe standing
    // in the served dark, or the tale's own line that it
    // rose where the Storyteller put it.
    const taleMark = (w2.wstate.state?.tale ?? []).length;
    const roseInTale = () => (w2.wstate.state?.tale ?? []).slice(taleMark).some((e) => (e.text ?? "").includes("rises where the Storyteller puts it"));
    let stood = false;
    for (let i = 0; i < 4 && !stood; i++) {
      await tapHex(pageA2, foeHex2);
      stood = await tryWait(() => (w2.wstate.state?.dark ?? []).some((e) => e.kind === "fray") || roseInTale(), 7000);
      if (!stood) {
        const dump = await pageA2.evaluate(() => ({
          radial: !!document.querySelector(".st-radial"),
          armed: [...document.querySelectorAll(".st-foe.armed, .st-tile.armed, .st-chip.armed")].map((b) => b.textContent.trim().slice(0, 40)),
          tale: [...document.querySelectorAll(".tale-line, .st-tale *")].slice(-3).map((e) => e.textContent.trim().slice(0, 90)),
          toasts: [...document.querySelectorAll(".toast, .err, .notice")].map((e) => e.textContent.trim().slice(0, 90)),
        })).catch((e) => ({ evalFail: String(e).slice(0, 120) }));
        console.log("FOE-TAP DUMP", JSON.stringify(dump));
        // If the wheel stands over the board, the hub
        // (the tap point itself) closes it; then re-tap.
        if (dump.radial) { const pt = await pageA2.evaluate((hex) => window.__campaignBoard.projectHex(hex), foeHex2).catch(() => null); if (pt) { await pageA2.mouse.click(pt.x, pt.y); await sleep(600); } }
      }
    }
    if (!stood) throw new Error("the fresh foe stands — see FOE-TAP DUMP above");
    foeHex2 = (w2.wstate.state?.dark ?? []).find((e) => e.kind === "fray")?.hex ?? foeHex2;
  }
  // THE BEACON FIXTURE NEEDS NO CAPTURE HERE: the
  // seed's growth rides the campaign's own save
  // (saveCampaign keeps seedGrowth; restoreCampaignTale
  // stands it back up), so the seed this drive grew to
  // beacon stage in the room's first life stands grown
  // in its second — the growth's persistence is itself
  // the proof, asserted on the served state. (Three
  // runs starved a white-box capture here before the
  // restore code was read: the fixture was never
  // missing — it was already home.)
  await waitFor(() => (w2.wstate.state?.seed?.level ?? 0) >= 3, "the beacon-stage growth stands restored with the campaign", 30000);

}
await waitFor(() => (w2.wstate.state?.map ?? []).find((t) => t.id === "0,0")?.light === 2, "the beacon's light is served on the restored map", 30000);
ok("§12 the beacon-stage seed's pool is lit again on the restored map", true);
await waitFor(async () => (await boardInfo(pageA2)).litFighting.includes("0,0"), "the restored board reads the pool lit", 30000);
ok("§12 the beacon's pool stands lit IN THE SCENE in the fresh browser", true);
{
  // THE CONTINUOUS LIGHT (Nigel, 2026-10-26 18:22): the
  // lit area radiates from the sources with real falloff,
  // and the light casts shadows where it meets what
  // stands in it. The board's own reckoning must show
  // real shadow-casting scene lights at the sources,
  // and the shot must show the wall's shadow falling
  // across the lit ground.
  const info0 = await boardInfo(pageA2);
  ok("§12 the scene carries real lights at the sources (the beacon's seven, at least)", info0.pointLights >= 7, `pointLights=${info0.pointLights}`);
  ok("§12 shadow-casting source lights stand within the shipped budget (at most two)", info0.shadowLights >= 1 && info0.shadowLights <= 2, `shadowLights=${info0.shadowLights}`);
  await sleep(2000);
  // The shots frame the BOARD ITSELF: the board canvas
  // is fixed full-viewport, but the seat's flow UI (the
  // panel, the rails, the banners) stands over its lower
  // half, so from the seat the map's heart is hidden
  // behind the panel. For the evidence shots the
  // overlays are hidden for the moment of the shot and
  // restored right after — the board is untouched; only
  // what covers it steps aside. (Three runs' shots
  // showed the panel and a starfield — evidence that
  // shows nothing proves nothing.)
  const veilOff = async () => {
    await pageA2.evaluate(() => {
      window.scrollTo(0, 0);
      const c = document.querySelector(".campaign-board canvas");
      const hidden = [];
      let el = c;
      while (el && el !== document.body) {
        const parent = el.parentElement;
        if (!parent) break;
        for (const sib of parent.children) if (sib !== el) { hidden.push([sib, sib.style.display]); sib.style.display = "none"; }
        el = parent;
      }
      window.__shotHidden = hidden;
    });
    await sleep(900);
  };
  const veilOn = async () => {
    await pageA2.evaluate(() => { for (const [el, d] of window.__shotHidden ?? []) el.style.display = d; window.__shotHidden = []; }).catch(() => {});
  };
  await veilOff();
  await pageA2.screenshot({ path: join(SHOTS, "dressed-map-beacon-light.png") }).catch(() => {});
  await pageA2.evaluate(() => window.__campaignBoard.zoomBy(1.7));
  await sleep(2500);
  await pageA2.screenshot({ path: join(SHOTS, "beacon-light-shadows.png") }).catch(() => {});
  await veilOn();
}

/* ══ §13 THE MAP RESTS AND STANDS AGAIN ═══════════════ */
console.log("§13 persistence across a reopen");
{
  const t3 = new Map(w2.wstate.state?.tile3d ?? []);
  const pr = new Map(w2.wstate.state?.props3d ?? []);
  const sameLand = t3.size === restTile3d.size && [...restTile3d.entries()].every(([k, v]) => t3.get(k) === v);
  ok("§13 the laid land stands again when the room reopens — the whole map, entry for entry, as it stood when the room emptied", sameLand, `rest=${restTile3d.size} reopened=${t3.size}`);
  ok("§13 the backdrop rests with the campaign", w2.wstate.state?.backdrop === "starfield");
  ok("§13 the storyteller pieces stand again (Dougie where she stood him)", pr.get(dougieHex) === "dougie");
  w2.wws.close();
}
await browser2.close().catch(() => {});

wws.close();
await browser.close();
console.log(`\nCAMPAIGN-3D DRIVE: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
