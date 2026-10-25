// THE TABLE BOARD GROWS TO FIT THE HEARTLAND — THE DRIVE
// (Nigel, ruled 2026-10-25 18:23: "if necessary the table
// board grows to fit the heartland"; build word 18:28:
// "yes, let the board grow!").
// Boots the real server on a scratch DATA_DIR and proves
// the growth end to end, on the real surfaces (the HTTP
// actions, the WebSocket rooms, the real referee, the real
// DB, and a real browser for the Table):
//   §FIX Two homeland fixtures, sown by the real first-seed
//      road, then sculpted in the open: GRETA's homeland
//      stands whole out to RING 8 (217 tiles — the disc a
//      grown board must deal), her seed grown to Beacon
//      (level 3, fed 47, the event done); a purified tile at
//      ring 7 holds a tide bank of 5, and a cursed tile at
//      ring 8 stands at 12 of 12. WILLA's homeland stands
//      whole inside ring 6 (127 tiles), her seed likewise
//      grown — the shape the window has always opened.
//   §A THE BOARD GROWS: Greta opens her homeland at a
//      casual Table (beaconOpen, source "homeland" — the
//      very act the beacon button sends). The wire names the
//      ground a homeland; the tale speaks the growth; the
//      room's map holds ALL 217 homeland tiles, tile for
//      tile against her rows — nothing counted outside,
//      nothing cropped; the ring-7 bank rests as its pile;
//      the ring-8 tile stands at its 12; the room's seed is
//      her seed's own growth; and her seat is landed.
//   §B THE RIM PLAYS: the host glides her own figure out to
//      the ring-7 tile by the real glide roads, summons her
//      kin at her side on the grown board, and her hand
//      strikes the ring-8 tile's curse — the homeland row
//      itself thins at the act, in step with the room. The
//      grown board is not a picture: its far ground works.
//   §C THE FOLD RESTORES THE STANDARD BOARD: Greta folds
//      the land away and the room stands on the instanced
//      world again — 127 tiles, the standard disc.
//   §D NO GROWTH WHERE NONE IS NEEDED: Willa opens her
//      homeland in a second room. The wire map is exactly
//      the 127 tiles of today, tile for tile against her
//      rows; the tale speaks NO growth; the seed is hers.
//      A homeland within ring 6 opens exactly as it ever did.
//   §E THE MID-GROWTH RIM OPENS: a third homeland stands
//      caught mid-growth — its window whole, five tiles sown
//      at ring 7 and the rim nowhere near a disc. It opens
//      grown like the rest: the wholeness the port's refusal
//      guards is the window's, and her outer ground is dealt
//      exactly as it stands (132 tiles, bank and all).
//   §F THE TABLE IN A REAL BROWSER: the door page opened
//      with ?land=homeland stands Greta's room on the grown
//      board and Willa's on the standard one; both stand
//      whole with no page errors, the grown board paints
//      more tile faces than the standard, and screenshots
//      of both boards are kept.
// Fixture sculpts are named where they stand; the loader,
// the growth, the write-back, the referee and the records
// under proof are production code throughout.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-table-board-grows.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

const OUT = "/home/hatch/workspace/table-board-grows-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-board-grows-"));
process.env.PORT = "3974";
const DRIVE_WORD = ["board", "grows", "drive", "word"].join("-");
process.env.WORKSHOP_PASSWORD = DRIVE_WORD;
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3974";
const PW = "board-grows-drive-password";
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
  .run(name, category, power, toughness, element, `grows/${name}.png`, Date.now()).lastInsertRowid);
const mkKin = (ownerKey, ownerName, name, parts) => {
  const comp = JSON.stringify(parts.map(([category, element, power, toughness]) => ({
    source_id: `db:${partEl(`${name} ${category}`, category, power, toughness, element)}`,
    name: `${name} ${category}`, category, rarity: "common", power, toughness, element,
  })));
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, "grows/awokin.png", comp, ownerName, ownerKey, Date.now()).lastInsertRowid);
};
const stdParts = (el, power, toughness) => [["body", el, power, toughness], ["arms", el, power, toughness], ["head", el, power, toughness]];

const { issueTableToken, partyBattleSeatFor } = await import("../server/dist/table.js");
async function mkTender(name, exp, classKey, discId) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, exp, Date.now());
  const kinIds = [];
  if (classKey) { for (const w of ["Wake One", "Wake Two", "Wake Three"]) kinIds.push(mkKin(ownerKey, name, `${name} ${w}`, stdParts("sky", 2, 2))); }
  if (classKey) await call("chooseClass", { classKey }, claim.token);
  const tt = issueTableToken({ id: discId, name });
  const bindCode = (await call("getTableBindCode", {}, claim.token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
  if (!bindRes.ok) throw new Error("table/bind failed for " + name + ": " + bindRes.status);
  return { token: claim.token, ownerKey, tt, name, kinIds };
}
const fillers = (t, n, tag) => { for (let i = 0; i < n; i++) mkKin(t.ownerKey, t.name, `${tag} ${i + 1}`, stdParts("sky", 2, 2)); };

class Actor {
  constructor() { this.state = null; this.you = null; this.errors = []; this.joinErrors = []; }
  async join(tt, room, extra = {}) {
    this.ws = new WebSocket("ws://127.0.0.1:3974/table/ws");
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
async function watchRoom(roomId) {
  const wstate = { state: null };
  const wws = new WebSocket("ws://127.0.0.1:3974/table/ws");
  return new Promise((resolve) => {
    wws.onopen = () => { wws.send(JSON.stringify({ type: "join", room: roomId, watch: true, name: "Growth Watcher" })); resolve({ wstate, wws }); };
    wws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") wstate.state = m.state; } catch { /* torn frame */ } };
  });
}
const waitFor = async (fn, what, ms = 20000) => { const s = realNow(); while (realNow() - s < ms) { let v = false; try { v = fn(); } catch { v = false; } if (v) return true; await sleep(120); } throw new Error("drive wait: " + what); };
const tryWait = async (fn, ms) => { try { await waitFor(fn, "tryWait", ms); return true; } catch { return false; } };
const parseAx = (id) => id.split(",").map(Number);
const ringOf = (q, r) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
const K = 40 / 796;
const centerOf = (id) => { const [q, r] = parseAx(id); return { x: q * 1292 * K, y: q * 470 * K + r * 948 * K }; };
const seatOf = (wstate, name) => (wstate.state?.players ?? []).find((p) => p.name === name) ?? null;
const wireTile = (wstate, id) => (wstate.state?.map ?? []).find(t => t.id === id) ?? null;
const discCount = (radius) => 1 + 3 * radius * (radius + 1);
async function summonStanding(actor, wstate, ownerName, awakenedId, unitName, tries = 20) {
  for (let i = 0; i < tries; i++) {
    actor.send({ type: "summonCast", awakenedId });
    const stood = await tryWait(() => (wstate.state?.field ?? []).some(u => u.name === unitName && u.ownerName === ownerName), 3500);
    if (stood) return wstate.state.field.find(u => u.name === unitName && u.ownerName === ownerName);
    await sleep(300);
  }
  throw new Error("summon never landed: " + unitName + " | seat errors: " + JSON.stringify(actor.errors.slice(-3)) + " | energy: " + actor.you?.energy);
}
async function glideSeatTo(actor, wstate, name, targetId, ms = 30000) {
  const c = centerOf(targetId);
  actor.send({ type: "glide", tx: c.x, ty: c.y });
  const s = realNow();
  while (realNow() - s < ms) {
    if (seatOf(wstate, name)?.hex === targetId) { actor.send({ type: "glideStop" }); await sleep(400); return seatOf(wstate, name)?.hex === targetId; }
    await sleep(60);
  }
  return false;
}

/* ══ §FIX THE HOMELAND FIXTURES ═══════════════════════ */
console.log("§FIX the homeland fixtures — sown by the real road, sculpted in the open");
const G = await mkTender("Grown Greta", 800, "warden", "disc-board-grows-g");
fillers(G, 20, "GBench");
await call("addToParty", { awakenedId: G.kinIds[0] }, G.token);
const W = await mkTender("Window Willa", 800, "warden", "disc-board-grows-w");
fillers(W, 20, "WBench");
await call("addToParty", { awakenedId: W.kinIds[0] }, W.token);

// Sow both homelands by the real road: the first-seed
// action lands the seed, and the territory read generates
// its world around it.
await call("ensureFirstSeed", {}, G.token);
await call("getTerritory", {}, G.token);
await call("ensureFirstSeed", {}, W.token);
await call("getTerritory", {}, W.token);
const seedRowOf = (ownerKey) => db.prepare("SELECT s.id, s.tile_id, s.level, s.fed_energy, s.state FROM star_seeds s JOIN first_seed_events e ON e.seed_id = s.id WHERE e.owner_key = ?").get(ownerKey);
const tileRowOf = (ownerKey) => (q, r) => db.prepare("SELECT * FROM territory_tiles WHERE owner_key = ? AND q = ? AND r = ? AND COALESCE(z, 0) = 0").get(ownerKey, q, r);
const allRowsOf = (ownerKey) => db.prepare("SELECT q, r, element, cursed, curse_hp, curse_max_hp, attune_points, attune_element FROM territory_tiles WHERE owner_key = ? AND COALESCE(z, 0) = 0 ORDER BY q, r").all(ownerKey);

// Complete a homeland's disc in the frontier's own shape
// (the port drive's named sculpt): rows real play would
// have minted are inserted and counted, never silently
// assumed.
function completeDisc(t, radius) {
  const have = new Set(db.prepare("SELECT q, r FROM territory_tiles WHERE owner_key = ? AND COALESCE(z, 0) = 0").all(t.ownerKey).map(x => `${x.q},${x.r}`));
  const ins = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, curse_hp, curse_max_hp, created_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)");
  const els = ["root", "tide", "sky", "stone", "fire"];
  let minted = 0;
  for (let q = -radius; q <= radius; q++) for (let r = -radius; r <= radius; r++) {
    if (ringOf(q, r) > radius || have.has(`${q},${r}`)) continue;
    const hp = 10 + ringOf(q, r) * 2;
    ins.run(t.ownerKey, q, r, els[Math.abs(q * 7 + r * 3) % 5], hp, hp, Date.now());
    minted++;
  }
  return minted;
}
const setTileOf = (ownerKey) => (q, r, fields) => {
  const sets = Object.keys(fields).map(k => `${k} = ?`).join(", ");
  db.prepare(`UPDATE territory_tiles SET ${sets} WHERE owner_key = ? AND q = ? AND r = ? AND COALESCE(z, 0) = 0`).run(...Object.values(fields), ownerKey, q, r);
};
const ring1Els = { "1,0": "root", "1,-1": "tide", "0,-1": "stone", "0,1": "sky", "-1,0": "tide", "-1,1": "root" };
function growSeedAndRim(t) {
  const setTile = setTileOf(t.ownerKey);
  setTile(0, 0, { cursed: 0, element: "sky", curse_hp: null, curse_max_hp: null });
  for (const [id, el] of Object.entries(ring1Els)) { const [q, r] = parseAx(id); setTile(q, r, { cursed: 0, element: el, curse_hp: null, curse_max_hp: null }); }
  const seed = seedRowOf(t.ownerKey);
  db.prepare("UPDATE star_seeds SET level = 3, fed_energy = 47 WHERE id = ?").run(seed.id);
  db.prepare("UPDATE first_seed_events SET state = 'done' WHERE owner_key = ?").run(t.ownerKey);
  return seed;
}

// GRETA — the disc completed out to RING 8 (217 tiles).
const gMinted = completeDisc(G, 8);
const gSeed = growSeedAndRim(G);
{
  const setTile = setTileOf(G.ownerKey);
  setTile(1, 0, { cursed: 0, element: "root", curse_hp: null, curse_max_hp: null, attune_points: 6, attune_element: "tide" }); // a mid tile, banked as the port drive's tile A
  setTile(7, 0, { cursed: 0, element: "root", curse_hp: null, curse_max_hp: null, attune_points: 5, attune_element: "tide" }); // THE STEPPING TILE: purified at ring 7, holding a tide bank of 5
  setTile(8, 0, { cursed: 1, element: "stone", curse_hp: 12, curse_max_hp: 12 }); // THE RIM TILE: cursed at ring 8, standing at 12 of 12
}
const gRows = allRowsOf(G.ownerKey);
const gTileRow = tileRowOf(G.ownerKey);
ok("§FIX Greta's homeland stands whole to ring 8: 217 ground-plane rows, the widest at ring 8",
  gRows.length === discCount(8) && Math.max(...gRows.map(t => ringOf(t.q, t.r))) === 8,
  `rows=${gRows.length} minted=${gMinted}`);
ok("§FIX Greta's seed stands grown to Beacon (level 3, fed 47, the event done), the rim tile at 12 of 12, the stepping tile banked tide 5",
  seedRowOf(G.ownerKey).level === 3 && seedRowOf(G.ownerKey).fed_energy === 47
  && gTileRow(8, 0).curse_hp === 12 && gTileRow(8, 0).cursed === 1
  && gTileRow(7, 0).attune_points === 5 && gTileRow(7, 0).attune_element === "tide",
  JSON.stringify({ rim: gTileRow(8, 0).curse_hp, step: gTileRow(7, 0).attune_points }));

// WILLA — the disc completed only to RING 6 (127 tiles),
// the shape the window has always opened.
const wMinted = completeDisc(W, 6);
const wSeed = growSeedAndRim(W);
const wRows = allRowsOf(W.ownerKey);
ok("§FIX Willa's homeland stands whole inside ring 6: 127 ground-plane rows, none beyond ring 6",
  wRows.length === discCount(6) && Math.max(...wRows.map(t => ringOf(t.q, t.r))) === 6,
  `rows=${wRows.length} minted=${wMinted}`);

/* ══ §A THE BOARD GROWS ═══════════════════════════════ */
console.log("§A Greta opens her ring-8 homeland — the board grows to fit it");
const ROOM_G = "board-grows-greta";
const { wstate: wg } = await watchRoom(ROOM_G);
const greta = new Actor(); await greta.join(G.tt, ROOM_G); await greta.waitYou("Greta's seat");
greta.send({ type: "beaconOpen", source: "homeland" });
await waitFor(() => wg.state?.hosted?.source === "homeland", "Greta's room standing on her homeland", 15000);
ok("§A THE WIRE NAMES THE GROUND A HOMELAND, and the host is Greta",
  wg.state?.hosted?.source === "homeland" && wg.state?.hosted?.hostName === G.name, JSON.stringify(wg.state?.hosted));
ok("§A THE TALE SPEAKS THE GROWTH: the board grows to fit the heartland, all 217 tiles of it standing here",
  greta.tale.some(t => t.includes("opens their HOMELAND") && t.includes("the board grows to fit the heartland") && t.includes("217")),
  JSON.stringify(greta.tale.slice(-3)));
{
  // The room map, tile for tile against the homeland rows —
  // EVERY row, out to ring 8: the growth's whole claim.
  const rows = new Map(gRows.map(t => [`${t.q},${t.r}`, t]));
  let mismatch = "";
  if ((wg.state.map ?? []).length !== rows.size) mismatch = `wire holds ${wg.state.map?.length} tiles, the homeland record holds ${rows.size}`;
  for (const wt of wg.state.map ?? []) {
    if (mismatch) break;
    const row = rows.get(wt.id);
    if (!row) { mismatch = `wire tile ${wt.id} has no homeland row`; break; }
    const pts = row.attune_element && row.attune_points > 0 ? { [row.attune_element]: row.attune_points } : {};
    if (wt.cursed !== !!row.cursed || wt.element !== row.element
      || wt.curseHp !== (row.cursed ? row.curse_hp : 0) || wt.curseMaxHp !== (row.cursed ? row.curse_max_hp : 0)
      || JSON.stringify(wt.points ?? {}) !== JSON.stringify(pts)) {
      mismatch = `${wt.id}: wire ${JSON.stringify({ c: wt.cursed, e: wt.element, hp: wt.curseHp, pts: wt.points })} vs home ${JSON.stringify({ c: !!row.cursed, e: row.element, hp: row.curse_hp, pts })}`;
    }
  }
  ok("§A NOTHING IS CROPPED: all 217 homeland tiles stand on the board, tile for tile — cursed, element, curse HP and resting points, out to ring 8",
    !mismatch, mismatch);
  ok("§A the stepping tile's bank rests on the grown board as its pile: (7,0) holds {tide: 5}",
    JSON.stringify(wireTile(wg, "7,0")?.points ?? {}) === JSON.stringify({ tide: 5 }), JSON.stringify(wireTile(wg, "7,0")?.points));
  ok("§A the rim tile stands on the board at its full curse: (8,0) cursed at 12 of 12",
    wireTile(wg, "8,0")?.cursed === true && wireTile(wg, "8,0")?.curseHp === 12 && wireTile(wg, "8,0")?.curseMaxHp === 12,
    JSON.stringify(wireTile(wg, "8,0")));
  ok("§A THE ROOM'S SEED IS GRETA'S SEED'S OWN GROWTH: level 3, stage beacon, fed 47",
    wg.state?.seed?.level === 3 && wg.state?.seed?.stage === "beacon" && wg.state?.seed?.fedEnergy === 47,
    JSON.stringify(wg.state?.seed));
}
ok("§A Greta's seat is landed on the grown board (a landing was assigned from its ground)",
  !!seatOf(wg, G.name)?.hex, `hex=${seatOf(wg, G.name)?.hex}`);

/* ══ §B THE RIM PLAYS ═════════════════════════════════ */
console.log("§B the rim plays — glide, summon and strike at rings 7 and 8");
{
  const stood = await glideSeatTo(greta, wg, G.name, "7,0");
  ok("§B the host's figure stands on the ring-7 tile (7,0) by the real glide roads", stood, `hex=${seatOf(wg, G.name)?.hex}`);
  const gUnit = await summonStanding(greta, wg, G.name, G.kinIds[0], `${G.name} Wake One`);
  greta.send({ type: "setStance", cardId: gUnit.cardId, stance: "binding" });
  ok("§B her kin stands summoned at her side on the grown board",
    !!gUnit && ringOf(...parseAx(gUnit.hex)) >= 6, `unit hex=${gUnit?.hex}`);
  const rimBefore = gTileRow(8, 0).curse_hp;
  greta.send({ type: "strikeCurse", cardId: gUnit.cardId, hex: gUnit.hex, target: "8,0" });
  const thinned = await tryWait(() => gTileRow(8, 0).curse_hp < rimBefore, 10000);
  ok("§B THE RIM FIGHTS AND IT COUNTS BACK HOME: the ring-8 tile's curse thins from 12 in territory_tiles at her hand's act, in step with the room",
    thinned && gTileRow(8, 0).curse_hp === wireTile(wg, "8,0")?.curseHp,
    JSON.stringify({ hp: gTileRow(8, 0).curse_hp, wire: wireTile(wg, "8,0")?.curseHp, errs: greta.errors.slice(-2) }));
}

/* ══ §C THE FOLD RESTORES THE STANDARD BOARD ══════════ */
console.log("§C Greta folds the land away — the standard board returns");
greta.send({ type: "beaconClose" });
let folded = await tryWait(() => !wg.state?.hosted, 6000);
if (!folded) {
  // The strike provoked the field's entry (the 10:41 law):
  // dark stands and a land cannot fold mid-battle. The
  // drive dismisses the entered dark white-box — the casual
  // drives' own named move — waits the battle out, asks again.
  const seat = partyBattleSeatFor(G.ownerKey);
  if (seat) {
    const room = seat.room;
    for (const id of [...room.dark.keys()]) room.dark.delete(id);
    room.curseStruck = false;
    room.entryAt = Date.now();
    await tryWait(() => room.battle.active === false, 10000);
  }
  greta.send({ type: "beaconClose" });
  folded = await tryWait(() => !wg.state?.hosted, 10000);
}
ok("§C the host folds the homeland away (the wire hosted stands null)",
  folded && wg.state?.hosted === null, JSON.stringify(greta.errors.slice(-2)));
ok("§C THE ROOM STANDS ON THE INSTANCED WORLD AGAIN: 127 tiles — the standard disc, the grown board folded with the land",
  (wg.state?.map ?? []).length === discCount(6), `tiles=${wg.state?.map?.length}`);
ok("§C the rim tile keeps the fight's mark back home: (8,0) still thinned below its 12 after the fold",
  gTileRow(8, 0).curse_hp < 12, `hp=${gTileRow(8, 0).curse_hp}`);

/* ══ §D NO GROWTH WHERE NONE IS NEEDED ════════════════ */
console.log("§D Willa opens her ring-6 homeland — exactly as it ever did");
const ROOM_W = "board-grows-willa";
const { wstate: ww } = await watchRoom(ROOM_W);
const willa = new Actor(); await willa.join(W.tt, ROOM_W); await willa.waitYou("Willa's seat");
willa.send({ type: "beaconOpen", source: "homeland" });
await waitFor(() => ww.state?.hosted?.source === "homeland", "Willa's room standing on her homeland", 15000);
ok("§D THE WIRE NAMES THE GROUND A HOMELAND, and the host is Willa",
  ww.state?.hosted?.source === "homeland" && ww.state?.hosted?.hostName === W.name, JSON.stringify(ww.state?.hosted));
ok("§D THE TALE SPEAKS NO GROWTH: a homeland inside ring 6 opens with the window's own words, as before",
  willa.tale.some(t => t.includes("opens their HOMELAND")) && !willa.tale.some(t => t.includes("board grows")),
  JSON.stringify(willa.tale.slice(-3)));
{
  const rows = new Map(wRows.map(t => [`${t.q},${t.r}`, t]));
  let mismatch = "";
  if ((ww.state.map ?? []).length !== rows.size) mismatch = `wire holds ${ww.state.map?.length} tiles, the homeland record holds ${rows.size}`;
  for (const wt of ww.state.map ?? []) {
    if (mismatch) break;
    const row = rows.get(wt.id);
    if (!row) { mismatch = `wire tile ${wt.id} has no homeland row`; break; }
    const pts = row.attune_element && row.attune_points > 0 ? { [row.attune_element]: row.attune_points } : {};
    if (wt.cursed !== !!row.cursed || wt.element !== row.element
      || wt.curseHp !== (row.cursed ? row.curse_hp : 0) || wt.curseMaxHp !== (row.cursed ? row.curse_max_hp : 0)
      || JSON.stringify(wt.points ?? {}) !== JSON.stringify(pts)) {
      mismatch = `${wt.id}: wire vs home differ`;
    }
  }
  ok("§D THE ROOM MAP IS TODAY'S WINDOW, TILE FOR TILE: all 127 tiles carry their rows' cursed, element, curse HP and resting points",
    !mismatch, mismatch);
  ok("§D THE ROOM'S SEED IS WILLA'S SEED'S OWN GROWTH: level 3, stage beacon, fed 47",
    ww.state?.seed?.level === 3 && ww.state?.seed?.stage === "beacon" && ww.state?.seed?.fedEnergy === 47,
    JSON.stringify(ww.state?.seed));
}
ok("§D Willa's seat is landed on the standard board",
  !!seatOf(ww, W.name)?.hex, `hex=${seatOf(ww, W.name)?.hex}`);
willa.send({ type: "beaconClose" });
await tryWait(() => !ww.state?.hosted, 8000);

/* ══ §E THE MID-GROWTH RIM OPENS ══════════════════════ */
console.log("§E Petra's homeland, caught mid-growth — a whole window, a partial outer rim");
const P = await mkTender("Partial Petra", 800, "warden", "disc-board-grows-p");
fillers(P, 20, "PBench");
await call("addToParty", { awakenedId: P.kinIds[0] }, P.token);
await call("ensureFirstSeed", {}, P.token);
await call("getTerritory", {}, P.token);
completeDisc(P, 6);
growSeedAndRim(P);
{
  // The growth's own shape: five ring-7 tiles sown, the rim
  // nowhere near a whole disc — one of them already
  // purified at home, holding a sky bank of 4.
  const ins = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, curse_hp, curse_max_hp, created_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)");
  for (const [q, r] of [[7, 0], [7, -1], [6, 1], [0, 7], [-7, 7]]) ins.run(P.ownerKey, q, r, "stone", 24, 24, Date.now());
  setTileOf(P.ownerKey)(7, 0, { cursed: 0, element: "root", curse_hp: null, curse_max_hp: null, attune_points: 4, attune_element: "sky" });
}
const pRows = allRowsOf(P.ownerKey);
ok("§E Petra's record stands mid-growth: 132 rows — the 127 of the window plus 5 sown at ring 7",
  pRows.length === 132 && Math.max(...pRows.map(t => ringOf(t.q, t.r))) === 7, `rows=${pRows.length}`);
const ROOM_P = "board-grows-petra";
const { wstate: wp } = await watchRoom(ROOM_P);
const petra = new Actor(); await petra.join(P.tt, ROOM_P); await petra.waitYou("Petra's seat");
petra.send({ type: "beaconOpen", source: "homeland" });
await waitFor(() => wp.state?.hosted?.source === "homeland", "Petra's room standing on her homeland", 15000);
ok("§E THE MID-GROWTH HOMELAND OPENS — the partial rim refuses nothing (the wholeness the refusal guards is the window's)",
  wp.state?.hosted?.source === "homeland" && petra.errors.length === 0, JSON.stringify(petra.errors.slice(-2)));
ok("§E THE TALE SPEAKS THE GROWTH over her 132 tiles",
  petra.tale.some(t => t.includes("the board grows to fit the heartland") && t.includes("132")),
  JSON.stringify(petra.tale.slice(-3)));
{
  const rows = new Map(pRows.map(t => [`${t.q},${t.r}`, t]));
  let mismatch = "";
  if ((wp.state.map ?? []).length !== rows.size) mismatch = `wire holds ${wp.state.map?.length} tiles, the homeland record holds ${rows.size}`;
  for (const wt of wp.state.map ?? []) {
    if (mismatch) break;
    const row = rows.get(wt.id);
    if (!row) { mismatch = `wire tile ${wt.id} has no homeland row`; break; }
    const pts = row.attune_element && row.attune_points > 0 ? { [row.attune_element]: row.attune_points } : {};
    if (wt.cursed !== !!row.cursed || wt.element !== row.element
      || wt.curseHp !== (row.cursed ? row.curse_hp : 0) || wt.curseMaxHp !== (row.cursed ? row.curse_max_hp : 0)
      || JSON.stringify(wt.points ?? {}) !== JSON.stringify(pts)) {
      mismatch = `${wt.id}: wire vs home differ`;
    }
  }
  ok("§E EVERY TILE SHE HAS STANDS ON THE BOARD: all 132, tile for tile — the sown rim dealt exactly as it stands",
    !mismatch, mismatch);
  ok("§E the rim's banked tile rests as its pile at ring 7: (7,0) holds {sky: 4}",
    JSON.stringify(wireTile(wp, "7,0")?.points ?? {}) === JSON.stringify({ sky: 4 }), JSON.stringify(wireTile(wp, "7,0")?.points));
  ok("§E THE ROOM'S SEED IS PETRA'S SEED'S OWN GROWTH: level 3, stage beacon, fed 47",
    wp.state?.seed?.level === 3 && wp.state?.seed?.stage === "beacon" && wp.state?.seed?.fedEnergy === 47,
    JSON.stringify(wp.state?.seed));
}

/* ══ §F THE TABLE IN A REAL BROWSER ═══════════════════ */
console.log("§F the Table in a real browser — the grown board and the standard, side by side");
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
async function tableShot(t, roomId, file) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.evaluateOnNewDocument((sess) => { window.__awokenTableSession = sess; },
    { authToken: t.tt, room: roomId, name: t.name });
  await page.goto(BASE + `/table?land=homeland&frame_id=${roomId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  let stands = true;
  try { await page.waitForSelector(".table-room", { timeout: 30000 }); await page.waitForSelector(".seed-strip", { timeout: 20000 }); } catch { stands = false; }
  await sleep(2500); // the dealt faces settle before the count and the portrait
  const faces = await page.evaluate(() => document.querySelectorAll("svg image").length).catch(() => 0);
  await page.screenshot({ path: `${OUT}/${file}` });
  await page.close();
  return { stands, errs, faces };
}
{
  const grown = await tableShot(G, "board-grows-browser-greta", "grown-board-ring-8.png");
  ok("§F Greta's room stands in the browser on the grown board, no page errors (no #310)",
    grown.stands && grown.errs.length === 0, grown.errs.join(" | ").slice(0, 200));
  const standard = await tableShot(W, "board-grows-browser-willa", "standard-board-ring-6.png");
  ok("§F Willa's room stands in the browser on the standard board, no page errors (no #310)",
    standard.stands && standard.errs.length === 0, standard.errs.join(" | ").slice(0, 200));
  ok("§F THE GROWN BOARD PAINTS MORE GROUND: the ring-8 board's tile faces outnumber the standard board's (the whole flower fitted to the frame by the dealt extents)",
    grown.faces > standard.faces, `grown faces=${grown.faces} standard faces=${standard.faces}`);
  console.log(`  .. screenshots kept: ${OUT}/grown-board-ring-8.png · ${OUT}/standard-board-ring-6.png`);
}
await browser.close();

console.log(`\nTABLE BOARD GROWS DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
