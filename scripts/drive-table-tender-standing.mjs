// drive-table-tender-standing — THE TENDER'S OWN STANDING
// FEEDS THE SEED, AT THE TABLE (the both-grounds half of
// Nigel's ruling, 2026-10-25 11:34: standing on the tile
// of a starseed with your Tender begins feeding it).
//
// The Table's growth settlement (settleTableSeedFeeding,
// on the room's pulse) once drank while a seat's COMPANY
// stood within two rings of the room's seed. This build
// first added the seat's own figure as a feeder, and then
// — Nigel's ruling of 2026-10-25 12:19, "Feeding is only
// the Tender on the hex — strike the company draw" —
// struck the company's draw whole: a seat whose Tender's
// hex IS the seed tile feeds it from her own purse at HER
// OWN RATE — five a minute (11:42) plus the summoning
// step (11:51) — and no Awoken's presence feeds anything.
// FEEDING IS ONLINE ONLY (12:18): a pulse window spanning
// an absence banks nothing (§D). (The room
// below is a campaign room only because the drive's
// room-handle capture rides the Storytender's deal, the
// entry drive's road; the campaign is never seeded, so
// purseOf's precedence pays from her own purse — the
// exact purse arithmetic in §A is the verification. The
// campaign-bank precedence downstream of the same test
// is the port's untouched code.)
//
//   §A HER STANDING FEEDS: with NO company fielded at
//      all, she crosses the seed's tile and is stopped ON
//      it (the real glide + glideStop roads; the glide
//      law's refusal of the seed tile as a glide's END is
//      untouched — she is stopped mid-crossing, where she
//      stands). With the clock stepped in TWELVE-SECOND
//      strides (the battle-port drive's own technique) —
//      twelve seconds at her ruled rate of five a minute
//      (Nigel, 2026-10-25 11:42) is exactly one whole
//      energy a stride — the seed climbs three whole
//      energy and her purse falls by exactly three.
//   §B THE CONTROL: she glides off to a tile three rings
//      out; the same stepped span feeds nothing and the
//      purse does not move.
//   §D THE ABSENCE (online only): with her standing ON
//      the tile, the clock is stepped TEN minutes in one
//      stride — a window spanning far past the room's
//      five-minute presence gap — and the seed banks
//      nothing; a ten-second stride inside the law feeds
//      again.
//   THE ARRIVAL PURIFICATION (Nigel, 2026-10-25 11:48:
//   "instant purification on seed hex when a tender
//   joins so he can feed the seed without dying to the
//   curse"): the room's seed hex is sculpted cursed
//   white-box before her crossing, on the room handle
//   the entry drive's capture road provides (in live
//   play the curse's own advance is what re-takes a
//   seed's ground); §A asserts the hex
//   reads purified on the wire in the same pulse-span
//   that begins her feed; §B re-sculpts it cursed with
//   her three rings away and asserts it stands cursed
//   still. (The company-alone clause of the control is
//   proven on the homeland drive; here the one seat
//   fields no company at all.)
//
// White-box note: the served room state carries the
// seed's fedEnergy and each seat's hex and purse — every
// assertion reads the wire, as the port drive's §D does.
// Run: node scripts/drive-table-tender-standing.mjs
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

mkdirSync("/home/hatch/workspace/summon-proof", { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-tstanding-"));
process.env.PORT = "3953";
process.env.WORKSHOP_PASSWORD = "tstanding-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3953";
const PW = "tstanding-drive-password";
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
  .run(name, category, power, toughness, element, `tstanding/${name}.png`, Date.now()).lastInsertRowid);
const mkKin = (ownerKey, ownerName, name, parts) => {
  const comp = JSON.stringify(parts.map(([category, element, power, toughness]) => ({
    source_id: `db:${partEl(`${name} ${category}`, category, power, toughness, element)}`,
    name: `${name} ${category}`, category, rarity: "common", power, toughness, element,
  })));
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, "tstanding/awokin.png", comp, ownerName, ownerKey, Date.now()).lastInsertRowid);
};
const stdParts = (el, power, toughness) => [["body", el, power, toughness], ["arms", el, power, toughness], ["head", el, power, toughness]];

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
/** Bench Awokin raise the seat's max energy by 2 apiece —
 *  the purse she feeds from. */
const fillers = (t, n, tag) => { for (let i = 0; i < n; i++) mkKin(t.ownerKey, t.name, `${tag} ${i + 1}`, stdParts("sky", 2, 2)); };

class Actor {
  constructor() { this.state = null; this.you = null; this.errors = []; }
  async join(tt, room) {
    this.ws = new WebSocket("ws://127.0.0.1:3953/table/ws");
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
const parseAx = (id) => id.split(",").map(Number);
const axDist = (a, b) => { const [aq, ar] = parseAx(a); const [bq, br] = parseAx(b); return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(aq + ar - bq - br)); };
function watchRoom(roomId) {
  const wstate = { state: null };
  const wws = new WebSocket("ws://127.0.0.1:3953/table/ws");
  return new Promise((resolve) => {
    wws.onopen = () => { wws.send(JSON.stringify({ type: "join", room: roomId, watch: true, name: "Standing Watcher" })); resolve({ wstate, wws }); };
    wws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") wstate.state = m.state; } catch { /* torn frame */ } };
  });
}
const seatOf = (wstate, name) => wstate.state?.players.find((p) => p.name === name) ?? null;
const fieldOf = (wstate, name) => (wstate.state?.field ?? []).filter((u) => u.ownerName === name);

/* Tile centres in the room's own pixel space — the
 * Table's iso basis exactly as server and client draw it
 * (ISO_E (1292,470), ISO_SE (0,948), over ISO_DEN 796,
 * at TILE_SIZE 40): centre(q,r) = q·E + r·SE, scaled. */
const K = 40 / 796;
const centerOf = (id) => { const [q, r] = parseAx(id); return { x: q * 1292 * K, y: q * 470 * K + r * 948 * K }; };
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const { partyBattleSeatFor } = await import("../server/dist/table.js");
const roomOf = (ownerKey) => partyBattleSeatFor(ownerKey)?.room ?? null;
const wireSeedTile = () => (wstate.state?.map ?? []).find(t => t.id === "0,0") ?? null;
/** THE ROOM OBJECT, captured once (the entry drive's
 *  road): partyBattleSeatFor only reaches into a room
 *  whose battle stands, so a Storytender's single deal
 *  raises this room's battle long enough to take the
 *  room's handle; the dealt dark is deleted in the same
 *  pass and the battle ends before any baseline is read.
 *  Every sculpt after rides the captured handle. */
let room = null;
const sculptSeedCursed = () => {
  const t = room?.map.get("0,0");
  if (t) { t.cursed = true; t.curseHp = t.curseMaxHp || 4; }
  return t;
};
const roomSeedCursed = () => room?.map.get("0,0")?.cursed;

/** A dev Storytender seat (the entry drive's DevSeat) —
 *  joins on a name alone and works the storytender's
 *  roads, which is how the room's battle is raised for
 *  the capture above. It never feeds (the settlement
 *  skips storytenders) and never fields company. */
class DevSeat {
  constructor() { this.state = null; this.you = null; this.errors = []; }
  async join(name, roomId) {
    this.ws = new WebSocket("ws://127.0.0.1:3953/table/ws");
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

/* ══ §A HER STANDING FEEDS ════════════════════════════ */
console.log("§A the Tender's own standing feeds the room's seed — no company fielded at all");
const S = await mkTender("Standing Feeder", 800, "warden", "disc-tstanding");
fillers(S, 10, "SBench");
const { wstate } = await watchRoom("campaign-standing");
const st = new DevSeat(); await st.join("Standing Storytender", "campaign-standing"); await st.waitYou("the storytender's seat");
st.send({ type: "claimStoryteller" });
await waitFor(() => !!st.you?.storytender, "the storytender claims her seat");
const a = new Actor(); await a.join(S.tt, "campaign-standing"); await a.waitYou("S's seat");
await waitFor(() => !!seatOf(wstate, S.name)?.hex, "S's landing");
// RAISE, CAPTURE, CLEAR (the entry drive's road, named
// in the helpers above): one dealt Fray stands the
// battle up; the room's handle is taken; the dark is
// deleted in the same pass, before it can walk or chew;
// the battle's ending reckons before any baseline below
// is read, and the room plays empty from here — the
// campaign the storytender's claim opened is never
// seeded, so the feed draws her own purse (purseOf's
// precedence), as §A's exact purse arithmetic verifies.
st.send({ type: "stAdd", kind: "fray" });
st.send({ type: "stDeal" });
await waitFor(() => (wstate.state?.dark ?? []).length === 1 && !!roomOf(S.ownerKey), "the raising deal stands");
room = roomOf(S.ownerKey);
for (const id of [...room.dark.keys()]) room.dark.delete(id);
await tryWait(() => room.battle.active === false, 6000);
await sleep(600);
const landing = seatOf(wstate, S.name).hex;
ok("§A she lands seated, off the seed's tile, with no company fielded",
  landing !== "0,0" && fieldOf(wstate, S.name).length === 0, `landing=${landing} field=${fieldOf(wstate, S.name).length}`);
// This room's own dealing leaves the seed's hex CURSED
// (a campaign room's ground — read on the wire before
// any hand of the drive's touches it). The sculpt below
// then stands as the guarantee, not the source: the
// ground her arrival must answer is cursed ground either
// way (in live play it is the curse's own advance that
// re-takes a seed's hex).
ok("§A the room's seed hex stands CURSED before she takes the stand — the ground her arrival must answer",
  wireSeedTile() != null && wireSeedTile().cursed === true, `cursed=${wireSeedTile()?.cursed}`);
sculptSeedCursed();
ok("§A the sculpt stands: the seed's hex lies cursed in the room's own record",
  roomSeedCursed() === true, `cursed=${roomSeedCursed()}`);

// Walk her onto the seed's ground: first to the seed's
// nearest neighbour on her side, then across the seed
// toward the opposite neighbour — and stop her
// mid-crossing, where her hex is the seed's own.
const glideTo = (id) => { const c = centerOf(id); a.send({ type: "glide", tx: c.x, ty: c.y }); };
const [lq, lr] = parseAx(landing);
const near = DIRS.map(([dq, dr]) => `${dq},${dr}`)
  .sort((x, y) => axDist(x, landing) - axDist(y, landing))[0];
const [nq, nr] = parseAx(near);
const opp = `${-nq},${-nr}`;
glideTo(near);
await waitFor(() => seatOf(wstate, S.name)?.hex === near, "her arrival at the seed's neighbour", 30000);
glideTo(opp);
let stoppedOnSeed = false;
{
  const s0 = realNow();
  while (realNow() - s0 < 20000) {
    const me = (a.state?.players ?? []).find(p => p.name === S.name) ?? seatOf(wstate, S.name);
    if (me?.hex === "0,0") { a.send({ type: "glideStop" }); stoppedOnSeed = true; break; }
    await sleep(40);
  }
}
await sleep(800);
const standHex = seatOf(wstate, S.name)?.hex;
ok("§A STOPPED ON THE SEED'S TILE: her hex reads the seed's own ground and holds there",
  stoppedOnSeed && standHex === "0,0", `hex=${standHex}`);
// THE ARRIVAL PURIFICATION (Nigel, 2026-10-25 11:48): the
// cursed hex she just took the stand on must already read
// purified on the wire — the pulse that reckons her
// standing turns the ground in the same breath.
const purifiedOnWire = await tryWait(() => wireSeedTile()?.cursed === false, 8000);
ok("§A THE GROUND ANSWERED IN THE SAME PULSE: the seed's hex reads PURIFIED on the wire — instant, no wearing-down",
  purifiedOnWire && roomSeedCursed() === false,
  `wire=${wireSeedTile()?.cursed} room=${roomSeedCursed()}`);
const fed0 = wstate.state?.seed?.fedEnergy ?? 0;
const energy0 = seatOf(wstate, S.name)?.energy ?? 0;
let stubOff = 0;
Date.now = () => realNow() + stubOff;
let fedOk = true;
try {
  for (let stepN = 1; stepN <= 3; stepN++) {
    stubOff += 12 * 1000; // twelve seconds at 5/min = exactly one whole energy
    const rose = await tryWait(() => (wstate.state?.seed?.fedEnergy ?? 0) >= fed0 + stepN, 8000);
    if (!rose) { fedOk = false; break; }
  }
} finally { Date.now = realNow; }
ok("§A THE SEED DRANK FROM HER STANDING ALONE AT HER RATE: three twelve-second spans, three whole energy — her 5/min measure exactly",
  fedOk && (wstate.state?.seed?.fedEnergy ?? 0) === fed0 + 3, `fed=${wstate.state?.seed?.fedEnergy} from=${fed0}`);
ok("§A her purse paid exactly the drinking — and still no company of hers stands on the field",
  (seatOf(wstate, S.name)?.energy ?? -1) === energy0 - 3 && fieldOf(wstate, S.name).length === 0,
  `energy=${seatOf(wstate, S.name)?.energy} from=${energy0} field=${fieldOf(wstate, S.name).length}`);

/* ══ §B THE CONTROL ═══════════════════════════════════ */
console.log("§B the control — she stands three rings out: the seed does not drink");
{
  const away = `${3 * nq},${3 * nr}`;
  glideTo(away);
  await waitFor(() => seatOf(wstate, S.name)?.hex === away, "her arrival three rings out", 30000);
  // Lay the curse on the seed's hex again, now that she
  // stands three rings away: nothing may answer it.
  sculptSeedCursed();
  const fedB = wstate.state?.seed?.fedEnergy ?? 0;
  const energyB = seatOf(wstate, S.name)?.energy ?? 0;
  stubOff = 0;
  Date.now = () => realNow() + stubOff;
  try {
    stubOff += 4 * 60 * 1000; await sleep(1500);
    stubOff += 4 * 60 * 1000; await sleep(1500);
  } finally { Date.now = realNow; }
  ok("§B THE CONTROL: two stepped spans with the Tender elsewhere feed nothing; the purse is unmoved",
    (wstate.state?.seed?.fedEnergy ?? -1) === fedB && (seatOf(wstate, S.name)?.energy ?? -1) === energyB,
    `fed=${wstate.state?.seed?.fedEnergy} (was ${fedB}) energy=${seatOf(wstate, S.name)?.energy} (was ${energyB})`);
  ok("§B AND THE CURSE STANDS UNANSWERED: the seed's hex stays cursed while she stands elsewhere — the purification is her arrival's, no one else's",
    roomSeedCursed() === true,
    `cursed=${roomSeedCursed()}`);
}

/* ══ §C THE SUMMONING STEP (proof 8) ══════════════════ */
console.log("§C summoning power quickens her standing feed at the Table — exactly half a point per point");
{
  // Grant her a Summoner's Power star by the record's
  // own road (a held zodiac skill — r_b1 carries the
  // "summoner" clause at +2 in the live fx, the same sum
  // her summon cast at this Table reads). Her measure is
  // then EXACTLY 2: the clause's 2, no level step (her
  // 800 EXP stands at level 6 of 7), no Sage grant
  // (Warden). Her standing rate becomes 5 + 0.5 × 2 = 6
  // a minute — TEN stepped seconds pay exactly one whole
  // energy, where §A's zero-power rate needed twelve.
  db.prepare("INSERT INTO tender_skills (owner_key, skill_key, pool, created_at) VALUES (?, 'r_b1', 'tree', ?)").run(S.ownerKey, Date.now());
  glideTo(near);
  await waitFor(() => seatOf(wstate, S.name)?.hex === near, "her return to the seed's neighbour", 30000);
  glideTo(opp);
  let stoppedAgain = false;
  const s0 = realNow();
  while (realNow() - s0 < 20000) {
    const me = (a.state?.players ?? []).find(p => p.name === S.name) ?? seatOf(wstate, S.name);
    if (me?.hex === "0,0") { a.send({ type: "glideStop" }); stoppedAgain = true; break; }
    await sleep(40);
  }
  await sleep(800);
  ok("§C she stands on the seed's tile again — and the hex her §B absence left cursed is purified by her return",
    stoppedAgain && seatOf(wstate, S.name)?.hex === "0,0" && roomSeedCursed() === false,
    `hex=${seatOf(wstate, S.name)?.hex} cursed=${roomSeedCursed()}`);
  const fedC = wstate.state?.seed?.fedEnergy ?? 0;
  const energyC = seatOf(wstate, S.name)?.energy ?? 0;
  stubOff = 0;
  Date.now = () => realNow() + stubOff;
  let fedOkC = true;
  try {
    for (let stepN = 1; stepN <= 2; stepN++) {
      stubOff += 10 * 1000; // ten seconds at 6/min = exactly one whole energy
      const rose = await tryWait(() => (wstate.state?.seed?.fedEnergy ?? 0) >= fedC + stepN, 8000);
      if (!rose) { fedOkC = false; break; }
    }
  } finally { Date.now = realNow; }
  ok("§C THE STEPPED RATE, EXACT: at summoning power 2, two ten-second spans pay two whole energy off her purse (5 + 0.5×2 = 6/min)",
    fedOkC && (wstate.state?.seed?.fedEnergy ?? 0) === fedC + 2 && (seatOf(wstate, S.name)?.energy ?? -1) === energyC - 2,
    `fed=${wstate.state?.seed?.fedEnergy} from=${fedC} energy=${seatOf(wstate, S.name)?.energy} from=${energyC}`);
}

/* ══ §D THE ABSENCE — ONLINE ONLY ═════════════════════ */
console.log("§D the absence — a pulse window spanning an offline gap banks no feeding");
{
  // She still stands on the seed's tile (§C). One stride
  // of TEN minutes — twice the room's five-minute
  // presence gap — is stepped under the stubbed clock:
  // a window spanning an absence. Her feed is an active
  // online act (Nigel, 2026-10-25 12:18): the pulse must
  // bank nothing across it, feet on the hex or not.
  const fedD = wstate.state?.seed?.fedEnergy ?? 0;
  const energyD = seatOf(wstate, S.name)?.energy ?? 0;
  stubOff = 0;
  Date.now = () => realNow() + stubOff;
  try {
    stubOff += 10 * 60 * 1000;
    await sleep(1600);
  } finally { Date.now = realNow; }
  ok("§D THE ABSENCE BANKS NOTHING AT THE TABLE: across a ten-minute window the seed gained no energy and her purse did not move, though her figure stands on its hex",
    (wstate.state?.seed?.fedEnergy ?? -1) === fedD && (seatOf(wstate, S.name)?.energy ?? -1) === energyD,
    `fed=${wstate.state?.seed?.fedEnergy} (was ${fedD}) energy=${seatOf(wstate, S.name)?.energy} (was ${energyD})`);
  stubOff = 0;
  Date.now = () => realNow() + stubOff;
  let roseD = false;
  try {
    stubOff += 10 * 1000; // ten seconds at 6/min = one whole energy
    roseD = await tryWait(() => (wstate.state?.seed?.fedEnergy ?? 0) === fedD + 1, 8000);
  } finally { Date.now = realNow; }
  ok("§D AND THE DRAW LIVES AGAIN INSIDE THE LAW: a ten-second stride on the tile feeds one at her stepped rate",
    roseD && (seatOf(wstate, S.name)?.energy ?? -1) === energyD - 1,
    `fed=${wstate.state?.seed?.fedEnergy} from=${fedD} energy=${seatOf(wstate, S.name)?.energy} from=${energyD}`);
}

console.log(`\ndrive-table-tender-standing: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
