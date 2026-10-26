// EMPTY THE PACK — THE DRIVE (Nigel, ruled 2026-10-26
// 00:41: "Empty the pack = throw everything away").
// Boots the real server on a scratch DATA_DIR and proves,
// on the real Table surface (WebSocket rooms, the real
// referee, the real client for the tap):
//   §1 A CASUAL FELL STOCKS THE SHARED PACK — two sculpted
//      Frays fall to a standing hand (the hosted-land
//      drive's choreography: pinned dice, thinned wave);
//      their take — the energy orb and the guaranteed good
//      good — stands in the room's Pack, read alike by
//      the feller, a second seat, and a watcher.
//   §2 TAKE AND GIVE STAND UNREGRESSED — a GIVE lands the gathered
//      good in the second seat's own inventory; a CLAIM
//      lands the energy in her room purse; the Pack loses
//      both entries by the standing roads.
//   §3 THE PACK FILLED WITH EVERY KIND — a third fell
//      restocks energy + reagent; two further entries are
//      stood in the Pack by a NAMED FIXTURE SCULPT in the
//      room writer's own shape (an attunement drizzle and
//      a rune shard — kinds a pinned-dice fell cannot be
//      made to pay on cue); an anchor dark keeps the
//      referee ticking so the served state carries them.
//      The watcher and the unseated are then refused /
//      ignored, and the Pack stands.
//   §4 ONE TAP EMPTIES IT — a third seat, in the REAL
//      client, opens the Pack panel (screenshot), clicks
//      the "Empty the pack" button ONCE — no confirmation
//      stands in the way — and the served Pack reads
//      empty to every seat and the watcher, the room's
//      own state holds nothing, and the tale names the
//      emptier. A second emptying is refused in words.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-empty-the-pack.mjs
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

const OUT = "/home/hatch/workspace/empty-the-pack-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-empty-"));
process.env.PORT = "3993";
process.env.WORKSHOP_PASSWORD = "drive-pass-9";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;
process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3993";
const PW = "empty-pack-drive-password";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const realRandom = Math.random;
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
  .run(name, category, power, toughness, element, `empty/${name}.png`, Date.now()).lastInsertRowid);
const mkKin = (ownerKey, ownerName, name, parts) => {
  const comp = JSON.stringify(parts.map(([category, element, power, toughness]) => ({
    source_id: `db:${partEl(`${name} ${category}`, category, power, toughness, element)}`,
    name: `${name} ${category}`, category, rarity: "common", power, toughness, element,
  })));
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, "empty/awokin.png", comp, ownerName, ownerKey, Date.now()).lastInsertRowid);
};
const stdParts = (el, power, toughness) => [["body", el, power, toughness], ["arms", el, power, toughness], ["head", el, power, toughness]];
const bodyParts = (el, power, toughness) => [["body", el, power, toughness], ["arms", el, 0, toughness], ["head", el, 0, toughness]];

const { issueTableToken, partyBattleSeatFor } = await import("../server/dist/table.js");
async function mkTender(name, classKey, discId) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, Date.now());
  if (classKey) { for (const w of ["Wake One", "Wake Two", "Wake Three"]) mkKin(ownerKey, name, `${name} ${w}`, stdParts("sky", 2, 2)); }
  if (classKey) await call("chooseClass", { classKey }, claim.token);
  const tt = issueTableToken({ id: discId, name });
  const bindCode = (await call("getTableBindCode", {}, claim.token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
  if (!bindRes.ok) throw new Error("table/bind failed for " + name + ": " + bindRes.status);
  return { token: claim.token, ownerKey, tt, name };
}
const fillers = (t, n, tag) => { for (let i = 0; i < n; i++) mkKin(t.ownerKey, t.name, `${tag} ${i + 1}`, bodyParts("sky", 2, 2)); };
const invQtyOf = (ownerKey, key) => (db.prepare("SELECT qty FROM tender_inventory WHERE owner_key = ? AND item_key = ?").get(ownerKey, key)?.qty) ?? 0;

class Actor {
  constructor() { this.state = null; this.you = null; this.errors = []; this.joinErrors = []; }
  async join(tt, room, extra = {}) {
    this.ws = new WebSocket("ws://127.0.0.1:3993/table/ws");
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data));
        if (m.type === "state") { this.state = m.state; if (m.you) this.you = m.you; }
        else if (m.type === "error") this.errors.push(String(m.message ?? ""));
        else if (m.type === "joinError") this.joinErrors.push(m);
      } catch { /* torn frame */ }
    };
    this.send({ type: "join", authToken: tt, room, ...extra });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  get tale() { return (this.state?.tale ?? []).map((t) => (typeof t === "string" ? t : t?.text ?? "")); }
  async waitYou(what, ms = 12000) { const s = realNow(); while (realNow() - s < ms) { if (this.you) return; await sleep(120); } throw new Error("actor wait: " + what); }
}
function watchRoom(roomId) {
  const w = { state: null, errors: [], wws: null };
  const wws = new WebSocket("ws://127.0.0.1:3993/table/ws");
  w.wws = wws;
  return new Promise((resolve) => {
    wws.onopen = () => { wws.send(JSON.stringify({ type: "join", room: roomId, watch: true, name: "Pack Watcher" })); resolve(w); };
    wws.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data));
        if (m.type === "state") w.state = m.state;
        else if (m.type === "error") w.errors.push(String(m.message ?? ""));
      } catch { /* torn frame */ }
    };
  });
}
const waitFor = async (fn, what, ms = 20000) => { const s = realNow(); while (realNow() - s < ms) { let v = false; try { v = fn(); } catch { v = false; } if (v) return true; await sleep(120); } throw new Error("drive wait: " + what); };
const tryWait = async (fn, ms) => { try { await waitFor(fn, "tryWait", ms); return true; } catch { return false; } };
const parseAx = (id) => id.split(",").map(Number);
const axDist = (a, b) => { const [aq, ar] = parseAx(a); const [bq, br] = parseAx(b); return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(aq + ar - bq - br)); };
const roomOf = (ownerKey) => partyBattleSeatFor(ownerKey)?.room ?? null;
const packOf = (state) => state?.pack ?? [];
const packSig = (state) => packOf(state).map((e) => `${e.id}:${e.qty}`).sort().join("|");

async function summonStanding(actor, wstate, ownerName, awakenedId, unitName, tries = 20) {
  for (let i = 0; i < tries; i++) {
    actor.send({ type: "summonCast", awakenedId });
    const stood = await tryWait(() => (wstate.state?.field ?? []).some(u => u.name === unitName && u.ownerName === ownerName), 3500);
    if (stood) return wstate.state.field.find(u => u.name === unitName && u.ownerName === ownerName);
    await sleep(300);
  }
  throw new Error("summon never landed: " + unitName + " | seat errors: " + JSON.stringify(actor.errors.slice(-3)) + " | energy: " + actor.you?.energy);
}
const REACH = { stone: 1, root: 2, fire: 2, tide: 3, sky: 4 };
async function provokeEntry(actor, wstate, ownerName) {
  const unit = (wstate.state?.field ?? []).find(u => u.ownerName === ownerName);
  if (!unit) return false;
  const reach = REACH[unit.element] ?? 2;
  const target = (wstate.state?.map ?? []).find(t => t.cursed && t.id !== "0,0" && axDist(t.id, unit.hex) <= reach);
  if (!target) return false;
  actor.send({ type: "strikeCurse", cardId: unit.cardId, hex: unit.hex, target: target.id });
  await sleep(300);
  return true;
}
/** Raise a battle and thin it to the named count of 5-hp
 *  Frays standing beside the hand — the hosted drive's
 *  sculpt — plus, when keepAnchor is set, one far-corner
 *  dark left standing at great health so the referee
 *  keeps ticking (and broadcasting) through the proof. */
async function raiseThinnedBattle(actor, wstate, ownerName, handId, handName, fellCount, keepAnchor) {
  if (!(wstate.state?.field ?? []).some(u => u.ownerName === ownerName)) {
    await summonStanding(actor, wstate, ownerName, handId, handName);
  }
  if (!(wstate.state?.battle?.active && (wstate.state?.dark ?? []).length > 0)) {
    await provokeEntry(actor, wstate, ownerName);
    const dealt = await tryWait(() => wstate.state?.battle?.active && (wstate.state?.dark ?? []).length > 0, 60000);
    if (!dealt) throw new Error("no battle dealt | errors: " + JSON.stringify(actor.errors.slice(-3)));
  }
  Math.random = () => 0.5;
  await sleep(700);
  const room = roomOf(actor.ownerKey);
  if (!room) throw new Error("no room handle for the sculpt");
  const darks = [...room.dark.values()];
  const hand = [...room.field.values()].find(u => u.card.name === handName);
  const keep = darks.slice(0, fellCount);
  let anchor = null;
  for (const e of darks) {
    if (keep.includes(e)) continue;
    if (keepAnchor && !anchor) { anchor = e; continue; }
    room.dark.delete(e.id);
  }
  keep.forEach((e, i) => {
    e.kind = "fray"; e.label = "Fray"; e.power = 1; e.hp = 5; e.maxHp = 5;
    const dx = 0 - hand.pos.x, dy = 0 - hand.pos.y;
    const len = Math.hypot(dx, dy) || 1;
    const d = 120 + i * 45;
    e.pos = { x: hand.pos.x + (dx / len) * d, y: hand.pos.y + (dy / len) * d };
    e.target = null; e.pinnedUntil = Date.now() + 600000;
  });
  if (anchor) {
    anchor.kind = "fray"; anchor.label = "Fray"; anchor.power = 1; anchor.hp = 9999; anchor.maxHp = 9999;
    anchor.pos = { x: 30, y: 30 }; anchor.target = null; anchor.pinnedUntil = Date.now() + 600000;
  }
  return room;
}

/* ══ THE SEATS ═══════════════════════════════════════════ */
const A = await mkTender("Pack Keeper", "warden", "disc-pack-a");
const B = await mkTender("Pack Second", "warden", "disc-pack-b");
const C = await mkTender("Pack Lens", "warden", "disc-pack-c");
fillers(A, 12, "ABench");
const handA = mkKin(A.ownerKey, A.name, "Keeperhand", bodyParts("sky", 2, 6));
await call("addToParty", { awakenedId: handA }, A.token);

const watcher = await watchRoom("empty-pack");
const a = new Actor(); a.ownerKey = A.ownerKey; await a.join(A.tt, "empty-pack"); await a.waitYou("the keeper's seat");
const b = new Actor(); b.ownerKey = B.ownerKey; await b.join(B.tt, "empty-pack"); await b.waitYou("the second seat");
await waitFor(() => (watcher.state?.players ?? []).some(p => p.name === A.name) && (watcher.state?.players ?? []).some(p => p.name === B.name), "both seats stand in the watched room");

/* ══ §1 THE FELLS STOCK THE PACK ═════════════════════════ */
console.log("§1 two felled Frays stock the shared Pack — energy and the guaranteed reagent");
await raiseThinnedBattle(a, watcher, A.name, handA, "Keeperhand", 2, false);
const twoFells = await tryWait(() => (packOf(watcher.state).find(e => e.kind === "energy")?.qty ?? 0) >= 6, 90000);
Math.random = realRandom;
ok("two Frays fell to the standing hand — their energy waits in the Pack as one orb of 6", twoFells,
  `pack=${JSON.stringify(packOf(watcher.state))}`);
const pack1 = packOf(watcher.state);
const goodEntry = pack1.find(e => e.kind === "item");
ok("the guaranteed good stands in the Pack beside the orb (2 felled = 2 of it)",
  !!goodEntry && goodEntry.qty >= 2,
  JSON.stringify(pack1));
ok("the feller and the second seat read the same Pack the watcher reads",
  packSig(a.state) === packSig(watcher.state) && packSig(b.state) === packSig(watcher.state),
  `a=${packSig(a.state)} b=${packSig(b.state)} w=${packSig(watcher.state)}`);

/* ══ §2 TAKE AND GIVE UNREGRESSED ════════════════════════ */
console.log("§2 GIVE lands in the second seat's inventory; CLAIM lands the energy in her purse");
{
  const bKey = (watcher.state?.players ?? []).find(p => p.name === B.name)?.key;
  const before = invQtyOf(B.ownerKey, goodEntry.itemKey);
  a.send({ type: "givePack", entryId: goodEntry.id, targetKey: bKey });
  const gave = await tryWait(() => invQtyOf(B.ownerKey, goodEntry.itemKey) === before + goodEntry.qty && !packOf(watcher.state).some(e => e.id === goodEntry.id), 10000);
  ok("GIVE: the gathered good left the Pack and landed in the second seat's own inventory", gave,
    `inv ${before} -> ${invQtyOf(B.ownerKey, goodEntry.itemKey)}`);
  ok("GIVE: the tale tells it", a.tale.some(t => t.includes("gives the") && t.includes(B.name)), a.tale.slice(-3).join(" | "));
  const energyEntry = packOf(watcher.state).find(e => e.kind === "energy");
  const energyBefore = b.you?.energy ?? 0;
  b.send({ type: "claimPack", entryId: energyEntry.id });
  const claimed = await tryWait(() => !packOf(watcher.state).some(e => e.id === energyEntry.id), 10000);
  await sleep(400);
  ok("CLAIM: the orb left the Pack", claimed, JSON.stringify(packOf(watcher.state)));
  ok("CLAIM: the second seat's purse rose by the orb (to her cap)",
    (b.you?.energy ?? 0) > energyBefore || (b.you?.energy ?? 0) >= (b.you?.maxEnergy ?? Infinity) + 10,
    `energy ${energyBefore} -> ${b.you?.energy}`);
  ok("the standing roads emptied the Pack between them", packOf(watcher.state).length === 0, JSON.stringify(packOf(watcher.state)));
}

/* ══ §3 THE PACK FILLED WITH EVERY KIND ══════════════════ */
console.log("§3 a third fell restocks the Pack; a sculpt stands the kinds a pinned fell cannot pay on cue");
await raiseThinnedBattle(a, watcher, A.name, handA, "Keeperhand", 1, true);
{
  // THE NAMED SCULPT: entries stood directly in the room's
  // Pack while the referee still ticks (the anchor dark
  // keeps the battle — and its broadcasts — alive), in
  // the exact shape landRoomPack writes them — an
  // attunement drizzle and a rune shard, the two kinds
  // the pinned dice were set never to roll.
  const room = roomOf(A.ownerKey);
  room.pack.push({ id: "pack:attunement:root", kind: "attunement", itemKey: undefined, element: "root", name: "Root attunement", qty: 0.3 });
  room.pack.push({ id: "pack:item:rune-shard", kind: "item", itemKey: "rune-shard", element: undefined, name: "Rune Shard", qty: 2 });
}
const thirdFell = await tryWait(() => (packOf(watcher.state).find(e => e.kind === "energy")?.qty ?? 0) >= 3, 90000);
Math.random = realRandom;
ok("the third fell restocked the Pack — energy and the guaranteed good stand again", thirdFell && packOf(watcher.state).some(e => e.kind === "item"),
  `pack=${JSON.stringify(packOf(watcher.state))}`);
// The room's own handle, taken while its battle stands —
// §4 reads the room's state through it after the act,
// when the battle may have closed and the seat-lookup
// road (which rides a standing battle) no longer finds it.
const roomHandle = roomOf(A.ownerKey);
{
  const served = await tryWait(() => packOf(watcher.state).length >= 4, 15000);
  const kinds = new Set(packOf(watcher.state).map(e => e.kind));
  ok("the Pack, filled with every kind, is served whole to the watcher — energy, items, attunement",
    served && kinds.has("energy") && kinds.has("item") && kinds.has("attunement") && packOf(watcher.state).length >= 4,
    `pack=${JSON.stringify(packOf(watcher.state))}`);
}
const fullSig = packSig(watcher.state);
{
  const errMark = watcher.errors.length;
  watcher.wws.send(JSON.stringify({ type: "emptyPack" }));
  await sleep(1000);
  ok("a WATCHER's emptying is refused in the standing words",
    watcher.errors.slice(errMark).some(m => m.includes("Watchers hold no bag")), JSON.stringify(watcher.errors.slice(errMark)));
  ok("...and the Pack stands untouched by the refusal", packSig(watcher.state) === fullSig, packSig(watcher.state));

  const bare = new WebSocket("ws://127.0.0.1:3993/table/ws");
  await new Promise((res, rej) => { bare.onopen = res; bare.onerror = rej; });
  bare.send(JSON.stringify({ type: "emptyPack" }));
  await sleep(900);
  bare.close();
  ok("an UNSEATED caller's emptying moves nothing — the Pack stands", packSig(watcher.state) === fullSig, packSig(watcher.state));
}

/* ══ §4 ONE TAP IN THE REAL CLIENT EMPTIES IT ════════════ */
console.log("§4 the real client: one tap on 'Empty the pack' throws everything away");
{
  const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
  const puppeteer = require("puppeteer");
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => console.log("[pageerror:table]", String(e).slice(0, 200)));
    await page.evaluateOnNewDocument((sess) => { window.__awokenTableSession = sess; },
      { authToken: C.tt, room: "empty-pack", name: "Pack Lens" });
    await page.goto(BASE + "/table?frame_id=drive", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".table-room", { timeout: 30000 });
    await page.waitForFunction(() => !!document.querySelector(".bag-pin"), { timeout: 30000 });
    await page.click(".bag-pin");
    await page.waitForSelector(".bag-pop", { timeout: 15000 });
    await page.waitForFunction(() => [...document.querySelectorAll(".bag-pop button")].some(x => x.textContent.trim() === "Empty the pack"), { timeout: 15000 });
    const panel = await page.evaluate(() => ({
      rows: document.querySelectorAll(".bag-pop .bag-row").length,
      text: document.querySelector(".bag-pop")?.textContent ?? "",
    }));
    ok("the Pack panel stands open with its gatherings — and the Empty the pack button stands in it",
      panel.rows >= 4 && panel.text.includes("Empty the pack"), `rows=${panel.rows}`);
    await page.screenshot({ path: `${OUT}/pack-panel-with-empty-button.png` });
    const btn = await page.evaluateHandle(() => [...document.querySelectorAll(".bag-pop button")].find(x => x.textContent.trim() === "Empty the pack"));
    const el = btn.asElement();
    const box = await el.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const emptied = await tryWait(() => packOf(watcher.state).length === 0, 12000);
    ok("ONE tap — no confirmation — and the served Pack reads empty to the watcher", emptied,
      `pack=${JSON.stringify(packOf(watcher.state))}`);
    await sleep(600);
    ok("...and empty to both other seats at once (no ghost copies)",
      packOf(a.state).length === 0 && packOf(b.state).length === 0,
      `a=${packOf(a.state).length} b=${packOf(b.state).length}`);
    ok("the entries are GONE from the room's own state, not hidden", !!roomHandle && (roomHandle.pack ?? []).length === 0,
      `room pack=${JSON.stringify(roomHandle?.pack)}`);
    ok("the tale names the emptier and the throwing-away",
      watcher.state && a.tale.some(t => t.includes("Pack Lens empties the Pack — everything gathered in it is thrown away.")),
      a.tale.slice(-4).join(" | "));
    await page.screenshot({ path: `${OUT}/pack-panel-after-emptying.png` });
  } finally {
    await browser.close();
  }
  const errMark = b.errors.length;
  b.send({ type: "emptyPack" });
  await sleep(900);
  ok("a second emptying, of an empty Pack, is refused in plain words",
    b.errors.slice(errMark).some(m => m.includes("already stands empty")), JSON.stringify(b.errors.slice(errMark)));
  ok("...and the Pack still stands empty", packOf(watcher.state).length === 0);
}

console.log(`\ndrive-empty-the-pack: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
