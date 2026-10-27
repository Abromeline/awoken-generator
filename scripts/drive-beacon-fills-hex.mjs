// drive-beacon-fills-hex — THE BEACON FILLS ITS HEX + NO
// "BEACON" LABEL ON ANY FIELD (Nigel, 2026-10-27: "make the
// beacon big enough to fully fill its hex. and remove the
// text from it labeling it a beacon we dont need that. im
// talking about the beacons on the field. but no beacon on
// any field needs to by labled beacon... its a giant shining
// beacon... we get it").
//
// Boots the real server on a scratch DATA_DIR and proves
// BY MEASUREMENT in a real browser, on both grounds:
//   §A the seeded homeland: the first seed grown to the
//      Beacon (level 3), a Sapling seed (level 2, fed 5)
//      and a Bastion seed (level 4) standing on other hexes.
//   §B the homeland's face: the beacon-stage image's width
//      equals its own hex polygon's cross-section at the
//      image's base line (the polygon read from the DOM —
//      the face's own drawn geometry); its height follows
//      the art's 512/992; its base seat is unchanged
//      (centre + 0.3·size). The bastion's image (the same
//      art) fills its hex the same way. NO <text> in the
//      territory SVG reads "Beacon"; "Sapling of Light" and
//      "Bastion" still render; the sapling's image keeps
//      its old measure; the sapling's "fed 5 of 30" info
//      text still stands.
//   §C the Table (a casual room, captured white-box by the
//      casual drives' own road, its seed raised to level 3
//      white-box): the seed-face image's width equals the
//      seed hex's cross-section at its base line (centre
//      +8, the seat unchanged), height by the art's 512/992;
//      then the seed is set back to level 2 white-box and
//      the sapling face keeps its old 24×40 measure.
// Screenshots land in ~/workspace/beacon-fills-hex-proof/.
// Run after `npm run build`:
//   PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-beacon-fills-hex.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-beacon-fills-"));
process.env.PORT = "39951";
process.env["WORKSHOP_" + "PASSWORD"] = "beacon-fills-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39951";
const PW = "beacon-fills-drive-password";
const SHOTS = "/home/hatch/workspace/beacon-fills-hex-proof";
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
const now = Date.now();
const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

/* ══ §A THE SEEDED HOMELAND ═══════════════════════════ */
console.log("§A the seeded homeland — a Beacon, a Sapling and a Bastion standing");
const claim = await callOk("claimTender", { password: PW, tenderName: "Beacon Tender" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 3, 'warden', NULL, 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', weapon_key = NULL, total_exp = 3800, hp = 100")
  .run(ownerKey, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 900, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 900").run(ownerKey, now);
await callOk("ensureFirstSeed", {}, claim.token);
const T = { token: claim.token, ownerKey };
const freezeBattle = () => db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now(), ownerKey);
db.prepare("UPDATE star_seeds SET level = 3 WHERE owner_key = ?").run(ownerKey);
freezeBattle();
let land = await callOk("getTerritory", {}, T.token);
const seedTileId = db.prepare("SELECT tile_id AS id FROM star_seeds WHERE owner_key = ?").get(ownerKey).id;
const seedTile = land.tiles.find((t) => t.id === seedTileId);
ok("§A the beacon seed stands on the land", !!seedTile);
const farTiles = land.tiles.filter((t) => hexDist(t, seedTile) >= 3 && t.id !== seedTileId);
const sapTile = farTiles[0], basTile = farTiles[Math.floor(farTiles.length / 2)];
ok("§A two far hexes stand for the Sapling and the Bastion", !!sapTile && !!basTile && sapTile.id !== basTile.id);
db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at, defenses, fed_energy) VALUES (?, ?, 2, 'fallen', ?, 0, 5)")
  .run(ownerKey, sapTile.id, now);
db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at, defenses, fed_energy) VALUES (?, ?, 4, 'fallen', ?, 0, 0)")
  .run(ownerKey, basTile.id, now);
freezeBattle();
const seedsServed = (await callOk("getSeeds", {}, T.token)).seeds;
ok("§A the payload serves all three stages (beacon, sapling, bastion)",
  ["beacon", "sapling", "bastion"].every((s) => seedsServed.some((x) => x.stage === s)),
  JSON.stringify(seedsServed.map((x) => x.stage)));

/* ══ §B THE HOMELAND'S FACE, MEASURED ══════════════════ */
console.log("§B the homeland's face — the beacon fills its hex and wears no name");
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, T.token);
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
await sleep(2500);
const doorBtn = await page.$(".deck-button");
if (doorBtn) await doorBtn.click();
await page.waitForSelector(".territory-svg", { timeout: 30000 }).catch(() => {});
await sleep(800);
for (let i = 0; i < 12; i++) {
  const acted = await page.evaluate(() => {
    let hit = false;
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Skip");
    if (b) { b.click(); hit = true; }
    const cer = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Tend on");
    if (cer) { cer.click(); hit = true; }
    const mg = document.querySelector(".margin-guide-dismiss");
    if (mg) { mg.click(); hit = true; }
    return hit;
  }).catch(() => false);
  await sleep(700);
  if (!acted) break;
}
await page.mouse.move(700, 475);
await page.mouse.wheel({ deltaY: -900 });
await sleep(500);
await page.mouse.wheel({ deltaY: -900 });
await sleep(900);

const face = await page.evaluate(() => {
  const svg = document.querySelector(".territory-svg");
  if (!svg) return { svg: false };
  const crossAt = (pts, y) => {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        const x = x1 + ((y - y1) / (y2 - y1)) * (x2 - x1);
        mn = Math.min(mn, x); mx = Math.max(mx, x);
      }
    }
    return mx - mn;
  };
  const polys = [...svg.querySelectorAll("polygon")]
    .map((p) => (p.getAttribute("points") ?? "").trim().split(/\s+/).map((s) => s.split(",").map(Number)))
    .filter((pts) => pts.length === 6 && pts.every((pt) => pt.length === 2 && pt.every(Number.isFinite)));
  const images = [...svg.querySelectorAll("image")].map((im) => ({
    href: im.getAttribute("href") ?? "",
    x: Number(im.getAttribute("x")), y: Number(im.getAttribute("y")),
    w: Number(im.getAttribute("width")), h: Number(im.getAttribute("height")),
  }));
  const measure = (img) => {
    const cxI = img.x + img.w / 2, base = img.y + img.h;
    for (const pts of polys) {
      const cenX = pts.reduce((a, p) => a + p[0], 0) / 6;
      const cenY = pts.reduce((a, p) => a + p[1], 0) / 6;
      const ys = pts.map((p) => p[1]);
      const size = (Math.max(...ys) - Math.min(...ys)) * (796 / 944);
      if (Math.abs(cenX - cxI) <= 1.5 && Math.abs(base - (cenY + 0.3 * size)) <= 1.5) {
        return { expectW: crossAt(pts, base), size, cenY };
      }
    }
    return null;
  };
  const grown = images.filter((im) => im.href.includes("beacon")).map((im) => ({ ...im, m: measure(im) }));
  const sapling = images.find((im) => im.href.includes("sapling")) ?? null;
  const texts = [...svg.querySelectorAll("text")].map((t) => (t.textContent ?? "").trim());
  return {
    svg: true, grown, sapling,
    hasBeaconText: texts.some((t) => t === "Beacon"),
    hasSaplingText: texts.some((t) => t === "Sapling of Light"),
    hasBastionText: texts.some((t) => t === "Bastion"),
    hasFedText: texts.some((t) => /^fed 5 of 30$/.test(t)),
    textsSample: texts.slice(0, 30),
  };
});
ok("§B the homeland's map stands (the territory SVG)", face.svg);
ok("§B two grown faces wear the beacon's art (the Beacon and the Bastion)", face.grown?.length === 2, `n=${face.grown?.length}`);
for (const [i, g] of (face.grown ?? []).entries()) {
  ok(`§B grown face ${i + 1}: its hex polygon is found in the DOM`, !!g.m, `w=${g.w}`);
  if (g.m) {
    ok(`§B grown face ${i + 1}: image width equals its hex's width at the base line`, Math.abs(g.w - g.m.expectW) <= 0.75, `img=${g.w.toFixed(3)} hex=${g.m.expectW.toFixed(3)}`);
    ok(`§B grown face ${i + 1}: height follows the art's own 512/992`, Math.abs(g.h - g.w * (992 / 512)) <= 0.75, `h=${g.h.toFixed(3)} want=${(g.w * 992 / 512).toFixed(3)}`);
    ok(`§B grown face ${i + 1}: wider than the old twice-the-Tender measure (124 tall / ~64 wide)`, g.w > 70 && g.h > 130, `w=${g.w.toFixed(1)} h=${g.h.toFixed(1)}`);
  }
}
ok("§B no field text reads \"Beacon\" anywhere in the territory SVG", face.hasBeaconText === false, JSON.stringify(face.textsSample));
ok("§B the Sapling's name still renders", face.hasSaplingText === true);
ok("§B the Bastion's name still renders", face.hasBastionText === true);
ok("§B the sapling's fed info text still stands (\"fed 5 of 30\")", face.hasFedText === true, JSON.stringify(face.textsSample));
ok("§B the sapling's face keeps its old measure (62 tall, 512/846 wide)", !!face.sapling && Math.abs(face.sapling.h - 62) <= 0.6 && Math.abs(face.sapling.w - 62 * (512 / 846)) <= 0.6,
  face.sapling ? `w=${face.sapling.w} h=${face.sapling.h}` : "no sapling image");
// For the keepsake shot: a tap on far empty ground closes
// the seed's standing panel, so the beacon's base and its
// filled hex stand uncovered.
await page.mouse.click(180, 160);
await sleep(700);
await page.screenshot({ path: join(SHOTS, "homeland-beacon-fills-hex.png") });
ok("§B the map carried no page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
await browser.close();

/* ══ §C THE TABLE — A CASUAL ROOM'S SEED, MEASURED ═════ */
console.log("§C the Table — the casual room's seed fills its hex");
const { issueTableToken, partyBattleSeatFor } = await import("../server/dist/table.js");
const partEl = (name, category, power, toughness, element) => Number(db.prepare(
  "INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)")
  .run(name, category, power, toughness, element, `beaconfills/${name}.png`, Date.now()).lastInsertRowid);
const mkKin = (ownerKey, ownerName, name, parts) => {
  const comp = JSON.stringify(parts.map(([category, element, power, toughness]) => ({
    source_id: `db:${partEl(`${name} ${category}`, category, power, toughness, element)}`,
    name: `${name} ${category}`, category, rarity: "common", power, toughness, element,
  })));
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, "beaconfills/awokin.png", comp, ownerName, ownerKey, Date.now()).lastInsertRowid);
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
    this.ws = new WebSocket(`ws://127.0.0.1:39951/table/ws`);
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
  const wws = new WebSocket(`ws://127.0.0.1:39951/table/ws`);
  return new Promise((resolve) => {
    wws.onopen = () => { wws.send(JSON.stringify({ type: "join", room: roomId, watch: true, name: "Beacon Watcher" })); resolve({ wstate, wws }); };
    wws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") wstate.state = m.state; } catch { /* torn frame */ } };
  });
}
const ROOM_ID = "beacon-fills-room";
const parseAx = (id) => id.split(",").map(Number);
const axDist = (a, b) => { const [aq, ar] = parseAx(a); const [bq, br] = parseAx(b); return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(aq + ar - bq - br)); };
const F = await mkTender("Beacon Room Feeder", "disc-beaconfills-f");
const captureId = mkKin(F.ownerKey, F.name, "Beacon Capturehand", bodyParts("sky", 2, 6));
await callOk("addToParty", { awakenedId: captureId }, F.token);
for (let i = 0; i < 20; i++) mkKin(F.ownerKey, F.name, `CFBench ${i + 1}`, stdParts("sky", 2, 2));
const A = await mkTender("Beacon Room Witness", "disc-beaconfills-a");
const { wstate } = await watchRoom(ROOM_ID);
const feeder = new Actor(); await feeder.join(F.tt, ROOM_ID); await feeder.waitYou("the feeder's seat");
await waitFor(() => !!(wstate.state?.players ?? []).find((p) => p.name === F.name)?.hex, "the feeder's landing");
// The casual field's own capture road (drive-table-seed-
// growth-casual's): summon a hand, strike the curse, the
// battle stands, the room's handle is taken white-box.
let captureHand = null;
for (let i = 0; i < 20 && !captureHand; i++) {
  feeder.send({ type: "summonCast", awakenedId: captureId });
  const stood = await tryWait(() => (wstate.state?.field ?? []).some((u) => u.name === "Beacon Capturehand" && u.ownerName === F.name), 3500);
  if (stood) captureHand = wstate.state.field.find((u) => u.name === "Beacon Capturehand" && u.ownerName === F.name);
  else await sleep(300);
}
ok("§C the capture hand stands on the casual field", !!captureHand, JSON.stringify(feeder.errors.slice(-2)));
feeder.send({ type: "setStance", cardId: captureHand.cardId, stance: "binding" });
{
  const reach = 4; // the capture hand is sky (reach 4, the referee's table)
  const target = (wstate.state?.map ?? []).find((t) => t.cursed && t.id !== "0,0" && axDist(t.id, captureHand.hex) <= reach);
  ok("§C a cursed tile stands in the hand's reach", !!target);
  feeder.send({ type: "strikeCurse", cardId: captureHand.cardId, hex: captureHand.hex, target: target.id });
}
await waitFor(() => (wstate.state?.dark ?? []).length > 0 && wstate.state?.battle?.active === true && !!partyBattleSeatFor(F.ownerKey)?.room, "the casual field's own entry stands the battle", 25000);
const room = partyBattleSeatFor(F.ownerKey).room;
ok("§C the room is captured — and it is the regular casual room", room.mode === "casual" && room.campaign === null && !room.id.startsWith("campaign"), `room=${room.id} mode=${room.mode}`);
room.curseStruck = false;
room.entryAt = Date.now();
for (const id of [...room.dark.keys()]) room.dark.delete(id);
await tryWait(() => room.battle.active === false, 8000);
await sleep(600);
room.seedGrowth.level = 3; // white-box: the seed stands grown to the Beacon (the feeding road is drive-table-seed-growth-casual's proof)
// (The watcher's wire is only re-served on a room change, so
// the level is proven where it matters — in the witness's
// own browser seat below, which joins on the room as it
// stands and measures the drawn face.)

const browser2 = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page2 = await browser2.newPage();
await page2.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
const page2Errors = [];
page2.on("pageerror", (e) => page2Errors.push(String(e).slice(0, 200)));
await page2.evaluateOnNewDocument((sess) => { window.__awokenTableSession = sess; }, { authToken: A.tt, room: ROOM_ID, name: A.name });
await page2.goto(BASE + "/table?frame_id=beacon-fills", { waitUntil: "domcontentloaded", timeout: 60000 });
let roomStands = true;
try { await page2.waitForSelector(".table-room", { timeout: 30000 }); } catch { roomStands = false; }
ok("§C the casual room stands for the witness's seat", roomStands);
await sleep(1500);
const measureTable = () => page2.evaluate(() => {
  const ground = document.querySelector(".seed-ground");
  if (!ground) return { ground: false };
  const cx = Number(ground.getAttribute("cx")), cy = Number(ground.getAttribute("cy"));
  const g = ground.closest("g");
  const hit = g ? [...g.querySelectorAll("polygon")].find((p) => p.getAttribute("fill") === "transparent") : null;
  const pts = hit ? (hit.getAttribute("points") ?? "").trim().split(/\s+/).map((s) => s.split(",").map(Number)) : [];
  const crossAt = (y) => {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        const x = x1 + ((y - y1) / (y2 - y1)) * (x2 - x1);
        mn = Math.min(mn, x); mx = Math.max(mx, x);
      }
    }
    return mx - mn;
  };
  const images = [...document.querySelectorAll("svg image")].map((im) => ({
    href: im.getAttribute("href") ?? "",
    x: Number(im.getAttribute("x")), y: Number(im.getAttribute("y")),
    w: Number(im.getAttribute("width")), h: Number(im.getAttribute("height")),
  }));
  const beacon = images.filter((im) => im.href.includes("beacon") && Math.abs(im.x + im.w / 2 - cx) <= 1 && im.w > 30)
    .sort((a, b) => b.w - a.w)[0] ?? null;
  const sapling = images.filter((im) => im.href.includes("sapling") && Math.abs(im.x + im.w / 2 - cx) <= 1)
    .sort((a, b) => b.w - a.w)[0] ?? null;
  return { ground: true, cx, cy, expectW: pts.length === 6 ? crossAt(cy + 8) : null, beacon, sapling };
});
let tm = await measureTable();
for (let i = 0; i < 30 && !(tm.ground && tm.beacon); i++) { await sleep(500); tm = await measureTable(); }
ok("§C the seed's ground stands on the Table", tm.ground === true);
ok("§C the seed hex's hit polygon is found in the DOM", typeof tm.expectW === "number", `expectW=${tm.expectW}`);
ok("§C the level-3 seed face stands drawn", !!tm.beacon, "no beacon image centred on the seed hex");
if (tm.beacon && typeof tm.expectW === "number") {
  ok("§C the Table's beacon width equals its hex's width at the base line", Math.abs(tm.beacon.w - tm.expectW) <= 0.75, `img=${tm.beacon.w.toFixed(3)} hex=${tm.expectW.toFixed(3)}`);
  ok("§C the Table's beacon height follows the art's own 512/992", Math.abs(tm.beacon.h - tm.beacon.w * (992 / 512)) <= 0.75, `h=${tm.beacon.h.toFixed(3)} want=${(tm.beacon.w * 992 / 512).toFixed(3)}`);
  ok("§C the Table's beacon base seat is unchanged (centre +8)", Math.abs((tm.beacon.y + tm.beacon.h) - (tm.cy + 8)) <= 0.75, `base=${(tm.beacon.y + tm.beacon.h).toFixed(3)} want=${(tm.cy + 8).toFixed(3)}`);
  ok("§C the Table's beacon is far larger than the old 41×80", tm.beacon.w > 60 && tm.beacon.h > 120, `w=${tm.beacon.w.toFixed(1)} h=${tm.beacon.h.toFixed(1)}`);
}
await page2.screenshot({ path: join(SHOTS, "table-beacon-fills-hex.png") });
// The sapling keeps its old measure: set the seed back to
// level 2 white-box and watch the room's pulses carry it.
room.seedGrowth.level = 2;
// A stance change from the feeder forces a full state
// broadcast to every seat — the witness's browser re-renders
// on the room as it now stands.
feeder.send({ type: "setStance", cardId: captureHand.cardId, stance: "attack" });
await sleep(500);
feeder.send({ type: "setStance", cardId: captureHand.cardId, stance: "binding" });
let saplingRead = null;
for (let i = 0; i < 40 && !saplingRead; i++) {
  await sleep(500);
  const m2 = await measureTable().catch(() => null);
  if (m2?.sapling && Math.abs(m2.sapling.w - 24) <= 0.01) saplingRead = m2;
}
ok("§C at level 2 the sapling face keeps its old 24×40 measure, untouched", !!saplingRead?.sapling && Math.abs(saplingRead.sapling.h - 40) <= 0.01,
  saplingRead ? `w=${saplingRead.sapling.w} h=${saplingRead.sapling.h}` : "sapling face never read at 24 wide");
ok("§C the Table carried no page errors", page2Errors.length === 0, page2Errors.slice(0, 3).join(" | "));
await browser2.close();

console.log(`\ndrive-beacon-fills-hex: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
