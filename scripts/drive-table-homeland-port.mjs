// THE HOMELAND PORT — THE BEACON BUTTON'S DRIVE (2026-10-25).
// Boots the real server on a scratch DATA_DIR and proves the
// commissioned build end to end, on the real surfaces (the
// HTTP actions, the WebSocket rooms, the real referee, the
// real DB, and a real browser for the main page and the
// Table):
//   §FIX A homeland fixture, sown by the real first-seed
//      road (getTerritory), then sculpted in the open where
//      the drive says so: the seed stands grown to Beacon
//      (level 3, fed 47, the first-seed event done — the
//      gate's own record), the radius-6 window stands whole
//      (rows the frontier law would have minted are inserted
//      in its shape and COUNTED), and known tiles are set:
//      a purified tile holding a tide bank of 6, a cursed
//      tile at 9 of 9, a cursed tile at 4 of 10 holding a
//      sky bank of 3, ring 1 purified as a stage rise leaves
//      it. A second Tender's seed stands ungrown (level 1).
//   §A THE GATE'S DATA: getFirstSeedEvent — the record the
//      main page reads — reports Beacon/done for the host
//      and Starseed for the second Tender.
//   §B THE HOMELAND OPENS: the host speaks the very act the
//      Table client sends for the carried choice
//      (beaconOpen, source "homeland") in a casual room; the
//      wire names the ground a homeland, the room map matches
//      the fixture's homeland rows tile for tile (cursed,
//      element, points, curse HP), and the room's seed is
//      the homeland seed's own growth (level 3, fed 47).
//   §C ATTUNEMENT WRITES BACK: the host attunes the banked
//      tile with a real attuneTile act (a seeded aspect pool
//      pays); the Table's law turns the tile to the resting
//      pile's element, and the homeland records the turn in
//      its own post-turn shape (element turned, bank bared).
//   §D FEEDING WRITES BACK: the host stands her own figure
//      on the seed's hex by the real glide roads; whole
//      energy walks from her purse into the room's seed,
//      and the star_seeds row itself gains the fed energy.
//   §E GUESTS FIGHT, AND IT COUNTS BACK HOME: a guest seats
//      with no word (public door), summons HER OWN kin, and
//      her curse-strike thins the homeland tile from its 9 in
//      territory_tiles at the act itself. The host's own
//      hand then purifies the 4-of-10 tile, and its homeland
//      row stands purified in the homeland's own shape
//      (curse HP cleared, bank bared, height 1).
//   §F THE FOLD KEEPS EVERYTHING: the host folds the land
//      away; every change above stands in the homeland
//      tables, and NO table-land record was ever written
//      for her (ui_config holds no table.hosted row) — the
//      port wrote home, not into the other ground's book.
//   §G THE HUNT DEALS FRESH AND TOUCHES NOTHING HOME: the
//      host opens with the hunt's act (source "tableland",
//      fresh) in a new room; the wire names a table land,
//      its seed stands at level 1 fed 0, a table-land record
//      now exists — and every homeland row stands exactly as
//      §F left it.
//   §H THE SHORT RECORD OPENS, ITS HOLES FILLED AT HOME
//      (restated to Nigel's 2026-10-25 ruling "remove the
//      limit holes can just be filled" — this section once
//      proved the ring-6 window refusal, which he struck):
//      a Tender whose record stands short of its disc opens
//      anyway, the holes minted into her own record by the
//      loader, and the room stands on the filled disc; an
//      unbound seat is still refused in words.
//   §I THE MAIN PAGE, IN A REAL BROWSER: the locked Tender
//      sees the beacon button beside The Table wearing the
//      METEOR face; clicking it speaks Nigel's exact line
//      and offers no choices. The unlocked Tender sees the
//      fully grown BEACON sprite; clicking opens the two
//      choices, each explained in plain words.
//   §J THE TABLE STANDING ON THE HOMELAND, IN A REAL
//      BROWSER: the door page opened with ?land=homeland
//      seats the host and the room stands on her homeland —
//      its seed wears the Beacon face (level 3, the homeland
//      seed's own growth, not a fresh deal's Starseed).
// Fixture sculpts are named where they stand; the loader,
// the write-back, the referee and the records under proof
// are production code throughout.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-table-homeland-port.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

const OUT = "/home/hatch/workspace/homeland-port-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-homeland-port-"));
process.env.PORT = "3971";
process.env.WORKSHOP_PASSWORD = "homeland-port-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3971";
const PW = "homeland-port-drive-password";
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
  .run(name, category, power, toughness, element, `port/${name}.png`, Date.now()).lastInsertRowid);
const mkKin = (ownerKey, ownerName, name, parts) => {
  const comp = JSON.stringify(parts.map(([category, element, power, toughness]) => ({
    source_id: `db:${partEl(`${name} ${category}`, category, power, toughness, element)}`,
    name: `${name} ${category}`, category, rarity: "common", power, toughness, element,
  })));
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, "port/awokin.png", comp, ownerName, ownerKey, Date.now()).lastInsertRowid);
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
    this.ws = new WebSocket("ws://127.0.0.1:3971/table/ws");
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
  async joinDev(name, room) {
    this.ws = new WebSocket("ws://127.0.0.1:3971/table/ws");
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data));
        if (m.type === "state") { this.state = m.state; if (m.you) this.you = m.you; }
        else if (m.type === "error") this.errors.push(String(m.message ?? ""));
        else if (m.type === "joinError") this.joinErrors.push(m);
      } catch { /* torn frame */ }
    };
    this.send({ type: "join", devName: name, room });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  get tale() { return (this.state?.tale ?? []).map((t) => (typeof t === "string" ? t : t?.text ?? "")); }
  async waitYou(what, ms = 12000) { const s = realNow(); while (realNow() - s < ms) { if (this.you) return; await sleep(120); } throw new Error("actor wait: " + what); }
}
async function watchRoom(roomId) {
  const wstate = { state: null };
  const wws = new WebSocket("ws://127.0.0.1:3971/table/ws");
  return new Promise((resolve) => {
    wws.onopen = () => { wws.send(JSON.stringify({ type: "join", room: roomId, watch: true, name: "Port Watcher" })); resolve({ wstate, wws }); };
    wws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") wstate.state = m.state; } catch { /* torn frame */ } };
  });
}
const waitFor = async (fn, what, ms = 20000) => { const s = realNow(); while (realNow() - s < ms) { let v = false; try { v = fn(); } catch { v = false; } if (v) return true; await sleep(120); } throw new Error("drive wait: " + what); };
const tryWait = async (fn, ms) => { try { await waitFor(fn, "tryWait", ms); return true; } catch { return false; } };
const parseAx = (id) => id.split(",").map(Number);
const axDist = (a, b) => { const [aq, ar] = parseAx(a); const [bq, br] = parseAx(b); return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(aq + ar - bq - br)); };
const ringOf = (q, r) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
const K = 40 / 796;
const centerOf = (id) => { const [q, r] = parseAx(id); return { x: q * 1292 * K, y: q * 470 * K + r * 948 * K }; };
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const seatOf = (wstate, name) => (wstate.state?.players ?? []).find((p) => p.name === name) ?? null;
const wireTile = (wstate, id) => (wstate.state?.map ?? []).find(t => t.id === id) ?? null;
const REACH = { stone: 1, root: 2, fire: 2, tide: 3, sky: 4 };
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

/* ══ §FIX THE HOMELAND FIXTURE ═══════════════════════ */
console.log("§FIX the homeland fixture — sown by the real road, sculpted in the open");
const H = await mkTender("Homeland Hazel", 800, "warden", "disc-homeland-port-h");
fillers(H, 20, "HBench");
await call("addToParty", { awakenedId: H.kinIds[0] }, H.token);
const G = await mkTender("Guest Gus", 800, "warden", "disc-homeland-port-g");
fillers(G, 20, "GBench");
await call("addToParty", { awakenedId: G.kinIds[0] }, G.token);
const L = await mkTender("Locked Lorna", 800, "warden", "disc-homeland-port-l");

// Sow both homelands by the real road: the first-seed
// action lands the seed, and the territory read generates
// its world around it.
await call("ensureFirstSeed", {}, H.token);
await call("getTerritory", {}, H.token);
await call("ensureFirstSeed", {}, L.token);
await call("getTerritory", {}, L.token);
const hSeedRow = () => db.prepare("SELECT s.id, s.tile_id, s.level, s.fed_energy, s.state FROM star_seeds s JOIN first_seed_events e ON e.seed_id = s.id WHERE e.owner_key = ?").get(H.ownerKey);
const hSeed = hSeedRow();
ok("§FIX the real road sowed Hazel's first seed and its event", !!hSeed, JSON.stringify(hSeed));
const seedTileRow = db.prepare("SELECT id, q, r FROM territory_tiles WHERE id = ?").get(hSeed.tile_id);
ok("§FIX the first seed stands at the homeland's centre (0,0)", seedTileRow.q === 0 && seedTileRow.r === 0, JSON.stringify(seedTileRow));

// THE WINDOW, COMPLETED IN THE FRONTIER'S OWN SHAPE (named
// sculpt): real play mints every tile within five rings of
// purified ground on each territory read; by the time a
// first seed stands grown to Beacon, ring 1 stands purified
// and the whole radius-6 disc exists. The fixture inserts
// the missing rows in that shape and counts them, rather
// than playing the weeks the growth would take.
let minted = 0;
{
  const have = new Set(db.prepare("SELECT q, r FROM territory_tiles WHERE owner_key = ? AND COALESCE(z, 0) = 0").all(H.ownerKey).map(t => `${t.q},${t.r}`));
  const ins = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, curse_hp, curse_max_hp, created_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)");
  const els = ["root", "tide", "sky", "stone", "fire"];
  for (let q = -6; q <= 6; q++) for (let r = -6; r <= 6; r++) {
    if (ringOf(q, r) > 6) continue;
    if (have.has(`${q},${r}`)) continue;
    const hp = 10 + ringOf(q, r) * 2;
    ins.run(H.ownerKey, q, r, els[Math.abs(q * 7 + r * 3) % 5], hp, hp, Date.now());
    minted++;
  }
}
const hTileCount = db.prepare("SELECT COUNT(*) AS n FROM territory_tiles WHERE owner_key = ? AND COALESCE(z, 0) = 0").get(H.ownerKey).n;
const hMaxRing = db.prepare("SELECT MAX(MAX(ABS(q), ABS(r), ABS(q + r))) AS m FROM territory_tiles WHERE owner_key = ? AND COALESCE(z, 0) = 0").get(H.ownerKey).m;
console.log(`  .. window completion minted ${minted} rows; Hazel's ground-plane record stands at ${hTileCount} tiles, max ring ${hMaxRing}`);

// THE KNOWN TILES + THE GROWN SEED (named sculpt): the seed
// stands grown to Beacon as a fed seed stands — level 3,
// fed 47, the event done; ring 1 purified as its rise
// leaves it; three tiles carry the proof's known state.
const setTile = (q, r, fields) => {
  const sets = Object.keys(fields).map(k => `${k} = ?`).join(", ");
  db.prepare(`UPDATE territory_tiles SET ${sets} WHERE owner_key = ? AND q = ? AND r = ? AND COALESCE(z, 0) = 0`).run(...Object.values(fields), H.ownerKey, q, r);
};
setTile(0, 0, { cursed: 0, element: "sky", curse_hp: null, curse_max_hp: null });
const ring1Els = { "1,0": "root", "1,-1": "tide", "0,-1": "stone", "0,1": "sky", "-1,0": "tide", "-1,1": "root" };
for (const [id, el] of Object.entries(ring1Els)) { const [q, r] = parseAx(id); setTile(q, r, { cursed: 0, element: el, curse_hp: null, curse_max_hp: null }); }
setTile(1, 0, { cursed: 0, element: "root", curse_hp: null, curse_max_hp: null, attune_points: 6, attune_element: "tide" }); // TILE A: the banked tile
setTile(2, 0, { cursed: 1, element: "stone", curse_hp: 9, curse_max_hp: 9 }); // TILE B: the thinning tile
setTile(0, 2, { cursed: 1, element: "tide", curse_hp: 4, curse_max_hp: 10, attune_points: 3, attune_element: "sky" }); // TILE C: the purification tile
db.prepare("UPDATE star_seeds SET level = 3, fed_energy = 47 WHERE id = ?").run(hSeed.id);
db.prepare("UPDATE first_seed_events SET state = 'done' WHERE owner_key = ?").run(H.ownerKey);
db.prepare("INSERT INTO aspect_attunement (owner_key, element, points, updated_at) VALUES (?, 'tide', 3, ?) ON CONFLICT(owner_key, element) DO UPDATE SET points = 3").run(H.ownerKey, Date.now());
const tileRow = (q, r) => db.prepare("SELECT * FROM territory_tiles WHERE owner_key = ? AND q = ? AND r = ? AND COALESCE(z, 0) = 0").get(H.ownerKey, q, r);
const windowRows = () => db.prepare("SELECT q, r, element, cursed, curse_hp, curse_max_hp, attune_points, attune_element FROM territory_tiles WHERE owner_key = ? AND COALESCE(z, 0) = 0 AND MAX(ABS(q), ABS(r), ABS(q + r)) <= 6 ORDER BY q, r").all(H.ownerKey);
ok("§FIX the fixture stands: seed level 3 fed 47, tile A banked tide 6, tile B at 9 of 9, tile C at 4 of 10 banked sky 3",
  hSeedRow().level === 3 && hSeedRow().fed_energy === 47
  && tileRow(1, 0).attune_points === 6 && tileRow(1, 0).attune_element === "tide"
  && tileRow(2, 0).curse_hp === 9 && tileRow(0, 2).curse_hp === 4 && tileRow(0, 2).attune_points === 3);

/* ══ §A THE GATE'S DATA ════════════════════════════════ */
console.log("§A the gate's data — the first-seed event the main page reads");
const hEv = (await call("getFirstSeedEvent", {}, H.token)).event;
const lEv = (await call("getFirstSeedEvent", {}, L.token)).event;
ok("§A Hazel's first-seed record reads Beacon: seedLevel 3, stage beacon, the event done — the button's unlocked standing",
  !!hEv && hEv.seedLevel === 3 && hEv.seedStage === "beacon" && hEv.state === "done", JSON.stringify(hEv && { l: hEv.seedLevel, s: hEv.seedStage, st: hEv.state }));
ok("§A Lorna's record reads an ungrown seed: level 1, stage starseed — the button's locked standing",
  !!lEv && lEv.seedLevel === 1 && lEv.seedStage === "starseed", JSON.stringify(lEv && { l: lEv.seedLevel, s: lEv.seedStage }));

/* ══ §B THE HOMELAND OPENS ════════════════════════════ */
console.log("§B the homeland opens at a casual Table");
const ROOM_ID = "homeland-port";
const { wstate } = await watchRoom(ROOM_ID);
const host = new Actor(); await host.join(H.tt, ROOM_ID); await host.waitYou("the host's seat");
const guest = new Actor(); await guest.join(G.tt, ROOM_ID); await guest.waitYou("the guest's seat");
host.send({ type: "beaconOpen", source: "homeland" });
await waitFor(() => wstate.state?.hosted?.source === "homeland", "the room standing on the homeland", 15000);
ok("§B THE WIRE NAMES THE GROUND A HOMELAND: hosted.source is 'homeland' and the host is Hazel",
  wstate.state?.hosted?.source === "homeland" && wstate.state?.hosted?.hostName === H.name, JSON.stringify(wstate.state?.hosted));
ok("§B the tale tells the room it stands on her homeland, counting back home",
  host.tale.some(t => t.includes("opens their HOMELAND")) || guest.tale.some(t => t.includes("opens their HOMELAND")),
  JSON.stringify((host.tale ?? []).slice(-3)));
{
  // The room map, tile for tile against the homeland rows.
  const rows = new Map(windowRows().map(t => [`${t.q},${t.r}`, t]));
  let mismatch = "";
  for (const wt of wstate.state.map) {
    const row = rows.get(wt.id);
    if (!row) { mismatch = `wire tile ${wt.id} has no homeland row`; break; }
    const pts = row.attune_element && row.attune_points > 0 ? { [row.attune_element]: row.attune_points } : {};
    if (wt.cursed !== !!row.cursed || wt.element !== row.element
      || wt.curseHp !== (row.cursed ? row.curse_hp : 0) || wt.curseMaxHp !== (row.cursed ? row.curse_max_hp : 0)
      || JSON.stringify(wt.points ?? {}) !== JSON.stringify(pts)) {
      mismatch = `${wt.id}: wire ${JSON.stringify({ c: wt.cursed, e: wt.element, hp: wt.curseHp, pts: wt.points })} vs home ${JSON.stringify({ c: !!row.cursed, e: row.element, hp: row.curse_hp, pts })}`;
      break;
    }
  }
  ok("§B THE ROOM MAP MATCHES THE HOMELAND: all 127 window tiles carry their rows' cursed, element, curse HP and resting points",
    wstate.state.map.length === 127 && !mismatch, mismatch);
  ok("§B the banked tile's bank rests on the board as its pile: tile A (1,0) holds {tide: 6}",
    JSON.stringify(wireTile(wstate, "1,0")?.points ?? {}) === JSON.stringify({ tide: 6 }), JSON.stringify(wireTile(wstate, "1,0")?.points));
  ok("§B THE ROOM'S SEED IS THE HOMELAND SEED'S OWN GROWTH: level 3, stage beacon, fed 47",
    wstate.state?.seed?.level === 3 && wstate.state?.seed?.stage === "beacon" && wstate.state?.seed?.fedEnergy === 47,
    JSON.stringify(wstate.state?.seed));
}
ok("§B the guest seated on the homeland with no word spoken (the door stands public)",
  !!guest.you && !!seatOf(wstate, G.name)?.hex, `guest hex=${seatOf(wstate, G.name)?.hex}`);
console.log(`  .. purses at the open: host ✦${host.you?.energy}/${host.you?.maxEnergy ?? "?"} guest ✦${guest.you?.energy}/${guest.you?.maxEnergy ?? "?"}`);

/* ══ §C THE BANK WRITES BACK ══════════════════════════ */
console.log("§C attunement writes back — a real Attune on the banked tile");
{
  const stood = await glideSeatTo(host, wstate, H.name, "1,0");
  ok("§C the host's figure stands on the banked tile (1,0) by the real glide roads", stood, `hex=${seatOf(wstate, H.name)?.hex}`);
  host.send({ type: "attuneTile", hex: "1,0", element: "tide" });
  // THE TRANSLATION, NAMED: the board holds the element
  // with the most points resting on it — the projected bank
  // (tide 6 resting on root ground) already outweighed the
  // standing element, so the Table's own law turns the tile
  // to tide the moment a point is laid, and the homeland
  // records the turn in its own post-turn shape: the new
  // element stands, the bank is bared. (The homeland's own
  // road would have staged the turn through neutral across
  // two 10-point beats; the port records the Table's
  // outcome, whole — nothing the sitting did evaporates.)
  const wrote = await tryWait(() => tileRow(1, 0).element === "tide", 8000);
  ok("§C THE TURN COUNTS BACK HOME: after the Attune, the homeland row holds tide — the turn the Table's law made — with its bank bared (0, no pressing element)",
    wrote && tileRow(1, 0).attune_points === 0 && tileRow(1, 0).attune_element === null && tileRow(1, 0).cursed === 0,
    JSON.stringify({ p: tileRow(1, 0).attune_points, e: tileRow(1, 0).attune_element, el: tileRow(1, 0).element }));
  ok("§C the wire agrees: tile A holds tide and rests {tide: 7}",
    wireTile(wstate, "1,0")?.element === "tide" && JSON.stringify(wireTile(wstate, "1,0")?.points ?? {}) === JSON.stringify({ tide: 7 }),
    JSON.stringify({ el: wireTile(wstate, "1,0")?.element, pts: wireTile(wstate, "1,0")?.points }));
}

/* ══ §D FEEDING WRITES BACK ═══════════════════════════ */
console.log("§D feeding writes back — the Tender stands on her seed's hex");
{
  const fedBefore = hSeedRow().fed_energy;
  // The crossing road (the casual growth drive's own): a
  // glide aimed at the centre does not rest her there — she
  // is carried across it on the way to the far ring, and the
  // stop is spoken mid-crossing, while her hex reads 0,0.
  const opp = centerOf("-1,0");
  host.send({ type: "glide", tx: opp.x, ty: opp.y });
  let stoppedOnSeed = false;
  {
    const s0 = realNow();
    while (realNow() - s0 < 25000) {
      if (seatOf(wstate, H.name)?.hex === "0,0") { host.send({ type: "glideStop" }); stoppedOnSeed = true; break; }
      await sleep(40);
    }
  }
  await sleep(600);
  ok("§D the host's figure stands ON the seed's hex (0,0), stopped mid-crossing by the real roads",
    stoppedOnSeed && seatOf(wstate, H.name)?.hex === "0,0", `hex=${seatOf(wstate, H.name)?.hex}`);
  const grew = await tryWait(() => (wstate.state?.seed?.fedEnergy ?? 0) > fedBefore, 45000);
  ok("§D THE SEED DRINKS AT THE TABLE: the room's fed energy climbs past its homeland standing (47)",
    grew, `wire fed=${wstate.state?.seed?.fedEnergy}`);
  const wroteBack = await tryWait(() => hSeedRow().fed_energy > fedBefore, 15000);
  ok("§D THE FEEDING IS THE HOMELAND SEED'S OWN: star_seeds.fed_energy itself climbs past 47, its level still 3",
    wroteBack && hSeedRow().level === 3, JSON.stringify(hSeedRow()));
}

/* ══ §E GUESTS FIGHT, AND IT COUNTS BACK HOME ═════════ */
console.log("§E guests fight on the homeland, and it counts back home");
{
  const gUnit = await summonStanding(guest, wstate, G.name, G.kinIds[0], `${G.name} Wake One`);
  guest.send({ type: "setStance", cardId: gUnit.cardId, stance: "binding" });
  console.log(`  .. purses at the fight: host ✦${host.you?.energy} guest ✦${guest.you?.energy}`);
  const hUnit = await summonStanding(host, wstate, H.name, H.kinIds[0], `${H.name} Wake One`);
  host.send({ type: "setStance", cardId: hUnit.cardId, stance: "binding" });
  ok("§E both hands stand: the guest's own kin and the host's, summoned from their own decks",
    !!gUnit && !!hUnit, `guest=${gUnit?.hex} host=${hUnit?.hex}`);
  // The guest thins tile B (2,0) from its 9: her blow is
  // power 2, and the standing hands keep fighting the curse
  // on their own cadence — so the proof reads the WRITE-
  // BACK, not a frozen number: the homeland row's curse
  // moves the moment her hand strikes, and keeps moving
  // with the room's own record of the tile.
  const bBefore = tileRow(2, 0).curse_hp;
  guest.send({ type: "strikeCurse", cardId: gUnit.cardId, hex: gUnit.hex, target: "2,0" });
  const thinned = await tryWait(() => tileRow(2, 0).curse_hp < bBefore, 8000);
  ok("§E THE GUEST'S BLOW COUNTS BACK HOME AT THE ACT ITSELF: territory_tiles tile B's curse thins from 9 the moment her hand strikes, in step with the room",
    thinned && tileRow(2, 0).curse_hp === wireTile(wstate, "2,0")?.curseHp,
    JSON.stringify({ hp: tileRow(2, 0).curse_hp, wire: wireTile(wstate, "2,0")?.curseHp }));
  // The host's hand fells tile C (0,2): power 2 against 4 —
  // two blows, struck as her cadence comes round.
  host.send({ type: "strikeCurse", cardId: hUnit.cardId, hex: hUnit.hex, target: "0,2" });
  await tryWait(() => tileRow(0, 2).curse_hp === 2, 8000);
  {
    const s0 = realNow();
    while (realNow() - s0 < 30000 && tileRow(0, 2).cursed !== 0) {
      host.send({ type: "strikeCurse", cardId: hUnit.cardId, hex: hUnit.hex, target: "0,2" });
      await sleep(1500);
    }
  }
  const purified = await tryWait(() => tileRow(0, 2).cursed === 0, 8000);
  const cRow = tileRow(0, 2);
  ok("§E THE PURIFICATION COUNTS BACK HOME IN THE HOMELAND'S OWN SHAPE: tile C stands purified, curse HP cleared, its sky bank bared, height 1",
    purified && cRow.curse_hp === null && cRow.curse_max_hp === null && cRow.attune_points === 0 && cRow.attune_element === null && cRow.height === 1,
    JSON.stringify({ c: cRow.cursed, hp: cRow.curse_hp, ap: cRow.attune_points, ae: cRow.attune_element, h: cRow.height }));
  ok("§E tile C's new element is the striking hand's own (sky, from her parts)",
    cRow.element === "sky", `element=${cRow.element}`);
}

/* ══ §F THE FOLD KEEPS EVERYTHING ════════════════════ */
console.log("§F the fold keeps everything — and no table-land record was written");
const homeAfterPort = () => JSON.stringify({ tiles: windowRows(), seed: hSeedRow() });
host.send({ type: "beaconClose" });
let folded = await tryWait(() => !wstate.state?.hosted, 6000);
if (!folded) {
  // The strikes provoked the field's entry (the 10:41 law):
  // dark stands and the battle is joined, and a land cannot
  // fold mid-battle. The drive dismisses the entered dark
  // white-box — the casual drives' own named move — waits
  // the battle out, and asks again.
  const seat = partyBattleSeatFor(H.ownerKey);
  if (seat) {
    const room = seat.room;
    for (const id of [...room.dark.keys()]) room.dark.delete(id);
    room.curseStruck = false;
    room.entryAt = Date.now();
    await tryWait(() => room.battle.active === false, 10000);
  }
  host.send({ type: "beaconClose" });
  folded = await tryWait(() => !wstate.state?.hosted, 10000);
}
ok("§F the host folds the homeland away (the room's wire hosted stands null)",
  folded && wstate.state?.hosted === null, JSON.stringify(host.errors.slice(-2)));
{
  const a = tileRow(1, 0), b = tileRow(2, 0), c = tileRow(0, 2), s = hSeedRow();
  ok("§F AFTER THE FOLD, THE HOMELAND TABLES KEEP EVERY CHANGE: tile A turned to tide with its bank bared, tile B thinned from its 9 (or felled outright by the standing hands), tile C purified, the seed fed past 47",
    a.element === "tide" && a.attune_points === 0 && (b.cursed === 0 || (b.curse_hp !== null && b.curse_hp < 9)) && c.cursed === 0 && s.fed_energy > 47,
    JSON.stringify({ a: a.element, ap: a.attune_points, b: b.curse_hp, bc: b.cursed, c: c.cursed, fed: s.fed_energy }));
  const rec = db.prepare("SELECT value FROM ui_config WHERE key = ?").get(`table.hosted.${H.ownerKey}`);
  ok("§F NO TABLE-LAND RECORD EXISTS FOR THE HOST: the port wrote into the homeland's own tables, never the other ground's book",
    !rec, rec ? String(rec.value).slice(0, 80) : "");
  ok("§F the room stands on the instanced world again (hosted null on the wire)", wstate.state?.hosted === null);
}
const HOME_SNAPSHOT = homeAfterPort();

/* ══ §G THE HUNT DEALS FRESH ══════════════════════════ */
console.log("§G the hunt deals fresh — and touches nothing home");
{
  const ROOM2 = "homeland-port-hunt";
  const { wstate: w2 } = await watchRoom(ROOM2);
  const hunter = new Actor(); await hunter.join(H.tt, ROOM2); await hunter.waitYou("the hunter's seat");
  hunter.send({ type: "beaconOpen", source: "tableland", fresh: true });
  await waitFor(() => w2.state?.hosted?.source === "tableland", "the hunt's fresh table land standing", 15000);
  ok("§G THE WIRE NAMES THE HUNT'S GROUND A TABLE LAND, not the homeland",
    w2.state?.hosted?.source === "tableland", JSON.stringify(w2.state?.hosted));
  ok("§G THE HUNT'S SEED IS A FRESH DEAL: level 1, fed 0 — not the homeland seed's growth",
    w2.state?.seed?.level === 1 && w2.state?.seed?.fedEnergy === 0, JSON.stringify(w2.state?.seed));
  const rec = db.prepare("SELECT value FROM ui_config WHERE key = ?").get(`table.hosted.${H.ownerKey}`);
  ok("§G a table-land record now stands for the host (the hunt dealt it)", !!rec);
  ok("§G THE HUNT TOUCHED NOTHING HOME: every homeland row and the seed stand exactly as the fold left them",
    homeAfterPort() === HOME_SNAPSHOT);
  hunter.send({ type: "beaconClose" });
  await tryWait(() => !w2.state?.hosted, 10000);
  ok("§G AND CLOSING THE HUNT STILL TOUCHES NOTHING HOME", homeAfterPort() === HOME_SNAPSHOT);
}

/* ══ §H THE SHORT RECORD OPENS, HOLES FILLED ══════════ */
console.log("§H the short record opens — its holes filled at home; the unbound seat still refused");
{
  const ROOM3 = "homeland-port-refusal";
  const { wstate: w3 } = await watchRoom(ROOM3);
  // Lorna's record as the real road left it: her seed sown,
  // her world short of the disc — the standing the struck
  // gate once refused. Count it before the open.
  const lSeedTileId = db.prepare("SELECT s.tile_id FROM star_seeds s JOIN first_seed_events e ON e.seed_id = s.id WHERE e.owner_key = ?").get(L.ownerKey).tile_id;
  const lSeedTile = db.prepare("SELECT q, r FROM territory_tiles WHERE id = ?").get(lSeedTileId);
  const lRowsOf = () => db.prepare("SELECT q, r, element, cursed, curse_hp, curse_max_hp FROM territory_tiles WHERE owner_key = ? AND COALESCE(z, 0) = 0").all(L.ownerKey);
  const lBefore = lRowsOf();
  const lBeforeKeys = new Set(lBefore.map(t => `${t.q},${t.r}`));
  const lMaxRing = Math.max(...lBefore.map(t => ringOf(t.q - lSeedTile.q, t.r - lSeedTile.r)));
  const lRadius = Math.max(6, lMaxRing);
  const lDisc = 1 + 3 * lRadius * (lRadius + 1);
  const lorna = new Actor(); await lorna.join(L.tt, ROOM3); await lorna.waitYou("Lorna's seat");
  lorna.send({ type: "beaconOpen", source: "homeland" });
  await waitFor(() => w3.state?.hosted?.source === "homeland", "Lorna's room standing on her filled homeland", 15000);
  ok("§H THE SHORT RECORD OPENS — no rim refusal stands (the gate Nigel struck speaks nowhere)",
    w3.state?.hosted?.source === "homeland" && !lorna.errors.some(e => /not all been sown/.test(e)),
    JSON.stringify(lorna.errors.slice(-2)));
  const lAfter = lRowsOf();
  const lFilled = lAfter.filter(t => !lBeforeKeys.has(`${t.q},${t.r}`));
  ok("§H THE HOLES WERE FILLED IN HER OWN RECORD: her ground-plane rows grew from short of the disc to the whole disc, every filled tile fresh cursed ground in the frontier's birth shape",
    lBefore.length < lDisc && lAfter.length === lDisc && lFilled.length === lDisc - lBefore.length
    && lFilled.every(t => t.cursed === 1 && ["tide", "sky", "stone", "root", "neutral"].includes(t.element)
      && t.curse_hp === 4 + 6 * ringOf(t.q - lSeedTile.q, t.r - lSeedTile.r) && t.curse_max_hp === t.curse_hp),
    `before=${lBefore.length} after=${lAfter.length} disc=${lDisc} filled=${lFilled.length}`);
  ok("§H THE ROOM STANDS ON THE FILLED DISC: the wire map holds every tile of it",
    (w3.state?.map ?? []).length === lDisc, `wire=${w3.state?.map?.length} disc=${lDisc}`);
  lorna.send({ type: "beaconClose" });
  await tryWait(() => !w3.state?.hosted, 10000);
  const anon = new Actor(); await anon.joinDev("Nameless Drifter", ROOM3); await anon.waitYou("the drifter's seat");
  anon.send({ type: "beaconOpen", source: "homeland" });
  const refusedAnon = await tryWait(() => anon.errors.some(e => e.includes("A land is a Tender's record")), 10000);
  ok("§H AN UNBOUND SEAT IS REFUSED IN WORDS — a land is a Tender's record",
    refusedAnon && !w3.state?.hosted, JSON.stringify(anon.errors.slice(-2)));
}

/* ══ §I THE MAIN PAGE, IN A REAL BROWSER ══════════════ */
console.log("§I the main page — the gate's two faces, in a real browser");
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
async function mainPageFor(token) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate((t) => { window.localStorage.setItem("awoken-tender-token", t); }, token);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".beacon-dock", { timeout: 30000 });
  return { page, errs };
}
const dockRead = (page) => page.evaluate(() => {
  const face = document.querySelector(".beacon-dock .beacon-dock-face");
  const beacon = document.querySelector(".beacon-dock");
  const table = document.querySelector(".side-dock.right:not(.beacon-dock)");
  const bb = beacon?.getBoundingClientRect(), tb = table?.getBoundingClientRect();
  return {
    faceSrc: face?.getAttribute("src") ?? "",
    beside: !!bb && !!tb && Math.abs(bb.right - tb.right) <= 2 && bb.bottom <= tb.top + 4,
    boxes: { beacon: bb && { top: Math.round(bb.top), bottom: Math.round(bb.bottom) }, table: tb && { top: Math.round(tb.top), bottom: Math.round(tb.bottom) } },
    gateText: document.querySelector(".beacon-gate-panel")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
    choices: [...document.querySelectorAll(".beacon-choice")].map(c => c.textContent?.replace(/\s+/g, " ").trim() ?? ""),
  };
});
{
  const { page, errs } = await mainPageFor(L.token);
  const before = await dockRead(page);
  ok("§I LOCKED: the beacon button stands beside The Table (same right edge, stacked above it)",
    before.beside, JSON.stringify(before));
  ok("§I LOCKED: the button wears the METEOR face — the unrisen starseed's own image, not the Beacon sprite",
    before.faceSrc.includes("meteor-rain"), before.faceSrc);
  await page.click(".beacon-dock");
  await page.waitForSelector(".beacon-gate-panel", { timeout: 10000 });
  const after = await dockRead(page);
  ok("§I LOCKED: clicking speaks Nigel's exact line — “You must light the beacon first! Wake the Awokin, go to the cursed lands!”",
    after.gateText.includes("You must light the beacon first! Wake the Awokin, go to the cursed lands!"), after.gateText.slice(0, 160));
  ok("§I LOCKED: no choices are offered behind the gate", after.choices.length === 0, JSON.stringify(after.choices));
  await page.screenshot({ path: `${OUT}/mainpage-locked-gate.png` });
  ok("§I LOCKED: no page errors on the main page", errs.length === 0, errs.join(" | ").slice(0, 200));
  await page.close();
}
{
  const { page, errs } = await mainPageFor(H.token);
  const before = await dockRead(page);
  ok("§I UNLOCKED: the button wears the fully grown BEACON sprite (the game's own starseed beacon art)",
    before.faceSrc.includes("beacon") && !before.faceSrc.includes("meteor"), before.faceSrc);
  await page.screenshot({ path: `${OUT}/mainpage-beacon-button.png` });
  await page.click(".beacon-dock");
  await page.waitForSelector(".beacon-choice-panel", { timeout: 10000 });
  const after = await dockRead(page);
  ok("§I UNLOCKED: the two choices stand, each explained in plain words — the homeland counting back home, the hunt dealing fresh and letting the kept table land go",
    after.choices.length === 2
    && after.choices[0].includes("Open my homeland") && after.choices[0].includes("counts back home")
    && after.choices[1].includes("Hunt a new starseed") && after.choices[1].includes("the table land you kept before is let go"),
    JSON.stringify(after.choices).slice(0, 300));
  ok("§I UNLOCKED: no gate line stands over the choices", after.gateText === "", after.gateText.slice(0, 80));
  await page.screenshot({ path: `${OUT}/mainpage-beacon-choices.png` });
  ok("§I UNLOCKED: no page errors on the main page", errs.length === 0, errs.join(" | ").slice(0, 200));
  await page.close();
}

/* ══ §J THE TABLE STANDING ON THE HOMELAND ════════════ */
console.log("§J the Table standing on the homeland — the carried choice, in a real browser");
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.evaluateOnNewDocument((sess) => { window.__awokenTableSession = sess; },
    { authToken: H.tt, room: "homeland-port-browser", name: H.name });
  await page.goto(BASE + "/table?land=homeland&frame_id=port", { waitUntil: "domcontentloaded", timeout: 60000 });
  let stands = true;
  try { await page.waitForSelector(".table-room", { timeout: 30000 }); await page.waitForSelector(".seed-strip", { timeout: 20000 }); } catch { stands = false; }
  ok("§J the room stands for the browser seat, entered by the beacon button's own road (?land=homeland)", stands);
  const read = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll("svg image")].map(i => i.getAttribute("href") ?? "");
    return {
      strip: document.querySelector(".seed-strip")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      beaconFace: imgs.some(h => h.includes("beacon")),
    };
  }).catch(() => ({ strip: "", beaconFace: false }));
  ok("§J THE ROOM STANDS ON HER HOMELAND: its seed wears the BEACON face and the strip names the Beacon — the homeland seed's own level 3, not a fresh deal's Starseed",
    read.beaconFace && read.strip.includes("Beacon"), JSON.stringify(read).slice(0, 220));
  await page.screenshot({ path: `${OUT}/table-on-homeland.png` });
  ok("§J no page errors in the room (no #310)", errs.length === 0, errs.join(" | ").slice(0, 200));
  await page.close();
}
await browser.close();

console.log(`\nHOMELAND PORT DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
