// THE TABLE ENTRY + WAVE-BREAK FIX — ITS DRIVE (2026-10-25).
// Boots the real server on a scratch DATA_DIR and proves
// Nigel's three rulings of 2026-10-25 09:03–09:08 on the
// real Table surface (WebSocket rooms, the real referee,
// the real DB):
//   §1 THE DOOR IS GONE: the client carries no Begin
//      button and no startWave word at all, and a startWave
//      message sent anyway deals nothing — no wave, no
//      tale, no refusal: silence, as for any unbuilt word.
//   §2 THE DARK ENTERS ON ITS OWN AT INTENSITY ONE —
//      ONCE THE CURSE IS STRUCK (Nigel, 2026-10-25 10:41:
//      "they dont start doing that until the tenders start
//      attacking the curse"): a casual room with a Tender
//      seated and a hand standing stands QUIET across a
//      watched window — no entry on an opening or a clock;
//      after the first curse strike, foes appear over
//      time, every one at its base body (filed power and
//      health, level one), and the standing dark climbs
//      to the homeland cradle's intensity-one cap (eight)
//      and no higher, beat by ~45 s beat (the drive steps
//      Date.now as the port drive does).
//   §3 EVERY DOOR DEALS ONLY ON THE FURTHEST CURSED RING:
//      the entry's first foes (§2), a Storytender's deal,
//      and a bastion column all stand on ring-6 ground and
//      nowhere else.
//   §4 THE HELD DEAL: a Storytender's deal of six onto a
//      sculpted map with only three cursed tiles — all of
//      them on the furthest ring — places three and HOLDS
//      three; as the first foe walks inward off the ring,
//      a held foe takes its tile; when a ring foe falls,
//      another held foe enters. None is ever placed
//      deeper, none is dropped.
//   §5 A BROKEN FIELD SWEEPS NO ONE: in a casual room and
//      at a campaign wave break, clearing all dark leaves
//      a fielded NON-PARTY Awokin standing — no
//      dissipation, no re-coalescence timer laid. (The
//      unit is made non-party white-box, by striking its
//      tender_party row after the summon enrols it — the
//      standing the battle-end law judges.)
//   §6 THE LIGHT STILL HOLDS: on hosted land whose curse
//      has been struck (the entry live), once the beacon
//      stands lit and the field is cleared, NO dark enters
//      across a watched window; doused, the dark enters
//      again on its own — no button was pressed at any
//      point. (The held entry beat's anchor is reset
//      white-box before the douse — a named fixture; the
//      law under proof is the light's hold and its
//      release, not the beat's phase.)
// Fixture sculpts are named where they stand, in the
// house manner; the referee, the picker, the fell door
// and the endings under proof are production code.
// Run: node scripts/drive-table-entry.mjs
import { join } from "node:path";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

const OUT = "/home/hatch/workspace/summon-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-entry-"));
process.env.PORT = "3953";
process.env.WORKSHOP_PASSWORD = ["entry", "drive", "pass"].join("-");
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3953";
const PW = "entry-drive-password";
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
  .run(name, category, power, toughness, element, `entry/${name}.png`, Date.now()).lastInsertRowid);
const mkKin = (ownerKey, ownerName, name, parts) => {
  const comp = JSON.stringify(parts.map(([category, element, power, toughness]) => ({
    source_id: `db:${partEl(`${name} ${category}`, category, power, toughness, element)}`,
    name: `${name} ${category}`, category, rarity: "common", power, toughness, element,
  })));
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, "entry/awokin.png", comp, ownerName, ownerKey, Date.now()).lastInsertRowid);
};
const stdParts = (el, power, toughness) => [["body", el, power, toughness], ["arms", el, power, toughness], ["head", el, power, toughness]];
const bodyParts = (el, power, toughness) => [["body", el, power, toughness], ["arms", el, 0, toughness], ["head", el, 0, toughness]];

const { issueTableToken, partyBattleSeatFor } = await import("../server/dist/table.js");
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
  return { token: claim.token, ownerKey, tt, name, tenderId };
}
const fillers = (t, n, tag) => { for (let i = 0; i < n; i++) mkKin(t.ownerKey, t.name, `${tag} ${i + 1}`, bodyParts("sky", 2, 2)); };

class Actor {
  constructor() { this.state = null; this.you = null; this.errors = []; this.joinErrors = []; }
  async join(tt, room, extra = {}) {
    this.ws = new WebSocket("ws://127.0.0.1:3953/table/ws");
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
/** A dev-named seat (test39's road): a stand-in company,
 *  no bound Tender — the Storytender's chair for §3b/§4/§5b. */
class DevSeat {
  constructor() { this.state = null; this.you = null; this.errors = []; }
  async join(name, room) {
    this.ws = new WebSocket("ws://127.0.0.1:3953/table/ws");
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data));
        if (m.type === "state") { this.state = m.state; if (m.you) this.you = m.you; }
        else if (m.type === "error") this.errors.push(String(m.message ?? ""));
      } catch { /* torn frame */ }
    };
    this.send({ type: "join", devName: name, room });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  get tale() { return (this.state?.tale ?? []).map((t) => (typeof t === "string" ? t : t?.text ?? "")); }
  async waitYou(what, ms = 12000) { const s = realNow(); while (realNow() - s < ms) { if (this.you) return; await sleep(120); } throw new Error("dev seat wait: " + what); }
}
function watchRoom(roomId) {
  const wstate = { state: null };
  const wws = new WebSocket("ws://127.0.0.1:3953/table/ws");
  return new Promise((resolve) => {
    wws.onopen = () => { wws.send(JSON.stringify({ type: "join", room: roomId, watch: true, name: "Entry Watcher" })); resolve({ wstate, wws }); };
    wws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") wstate.state = m.state; } catch { /* torn frame */ } };
  });
}
const waitFor = async (fn, what, ms = 20000) => { const s = realNow(); while (realNow() - s < ms) { let v = false; try { v = fn(); } catch { v = false; } if (v) return true; await sleep(120); } throw new Error("drive wait: " + what); };
const tryWait = async (fn, ms) => { try { await waitFor(fn, "tryWait", ms); return true; } catch { return false; } };
const parseAx = (id) => id.split(",").map(Number);
const axDist = (a, b) => { const [aq, ar] = parseAx(a); const [bq, br] = parseAx(b); return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(aq + ar - bq - br)); };
const ringOfHex = (id) => axDist(id, "0,0");
const roomOf = (ownerKey) => partyBattleSeatFor(ownerKey)?.room ?? null;
const seatOf = (wstate, name) => wstate.state?.players.find((p) => p.name === name) ?? null;
const BASE_BODY = { fray: { power: 1, hp: 3 }, hollow: { power: 0, hp: 5 }, tangle: { power: 3, hp: 8 }, unraveler: { power: 4, hp: 6 } };

async function summonStanding(actor, wstate, ownerName, awakenedId, unitName, tries = 20) {
  for (let i = 0; i < tries; i++) {
    actor.send({ type: "summonCast", awakenedId });
    const stood = await tryWait(() => (wstate.state?.field ?? []).some(u => u.name === unitName && u.ownerName === ownerName), 3500);
    if (stood) return wstate.state.field.find(u => u.name === unitName && u.ownerName === ownerName);
    await sleep(300);
  }
  throw new Error("summon never landed: " + unitName + " | seat errors: " + JSON.stringify(actor.errors.slice(-3)) + " | energy: " + actor.you?.energy);
}

/* Strike the curse once with a standing hand — the act
 * the dark answers (Nigel, 2026-10-25 10:41: the entry
 * does not begin until the Tenders start attacking the
 * curse). The target is a cursed tile within the hand's
 * element reach, read off the served map; the seed tile
 * is never a target (the handler refuses it). */
const REACH = { stone: 1, root: 2, fire: 2, tide: 3, sky: 4 };
async function strikeCurse(actor, wstate, ownerName) {
  const unit = (wstate.state?.field ?? []).find(u => u.ownerName === ownerName);
  if (!unit) throw new Error("strikeCurse: no standing hand for " + ownerName);
  const reach = REACH[unit.element] ?? 2;
  const target = (wstate.state?.map ?? []).find(t => t.cursed && t.id !== "0,0" && axDist(t.id, unit.hex) <= reach);
  if (!target) throw new Error("strikeCurse: no cursed tile in reach of " + unit.hex);
  actor.send({ type: "strikeCurse", cardId: unit.cardId, hex: unit.hex, target: target.id });
  await sleep(400);
  return target.id;
}

/* ══ §1 THE DOOR IS GONE ══════════════════════════════════ */
console.log("§1 the beginning-of-waves door is removed — no button on the client, and the word deals nothing on the wire");
{
  const clientSrc = readFileSync(new URL("../client/src/Table.tsx", import.meta.url), "utf8");
  ok("the client carries NO Begin-the-Unraveling button", !clientSrc.includes("Begin the Unraveling"));
  ok("the client sends NO startWave word anywhere", !clientSrc.includes("startWave"));
  const A1 = await mkTender("Door Keeper", 150, "warden", "disc-entry-a1");
  const kinId = mkKin(A1.ownerKey, A1.name, "Doorhand", bodyParts("sky", 2, 2));
  await call("addToParty", { awakenedId: kinId }, A1.token);
  const { wstate } = await watchRoom("entry-a");
  const a = new Actor(); await a.join(A1.tt, "entry-a"); await a.waitYou("the keeper's seat");
  await waitFor(() => !!seatOf(wstate, A1.name)?.hex, "the keeper's landing");
  const hand1 = await summonStanding(a, wstate, A1.name, kinId, "Doorhand");
  await strikeCurse(a, wstate, A1.name); // the dark answers a struck curse (10:41) — §2 proves the quiet before it
  // The hand is ordered to BINDING (the wire's own word):
  // a binding hand spends her cadence mending, not
  // striking, and with no wounded ally in reach she simply
  // waits — the count read below must move for no cause
  // but the word under proof; a hand on attack (or
  // defence, which still strikes) would fell the entered
  // dark inside the window and muddy the reading.
  a.send({ type: "setStance", cardId: hand1.cardId, stance: "binding" });
  await sleep(300);
  ok("the dark stands in the room (dealt by the field's own entry once the curse was struck, §2's proof in full)",
    await tryWait(() => (wstate.state?.dark ?? []).length > 0 && wstate.state?.battle?.active, 25000),
    `dark=${(wstate.state?.dark ?? []).length}`);
  const n0 = (wstate.state?.dark ?? []).length;
  const err0 = a.errors.length;
  a.send({ type: "startWave" });
  await sleep(1500);
  ok("a startWave message deals NOTHING — the dark stands exactly as it stood, and no 'begins the Unraveling' is ever told",
    (wstate.state?.dark ?? []).length === n0 && !a.tale.some(t => /begins the Unraveling/.test(t)),
    `dark ${n0} -> ${(wstate.state?.dark ?? []).length}`);
  ok("the dead word meets SILENCE — no refusal, no error names it (it is simply not a road)",
    a.errors.length === err0, JSON.stringify(a.errors.slice(-2)));
  a.ws.close();
}

/* ══ §2 ENTRY AT INTENSITY ONE, CAPPED AS THE CRADLE CAPS ═ */
console.log("§2 the free field's dark enters on its own — only once the curse is struck: quiet before the blow, then base bodies, level one, climbing beat by beat to the cradle's cap of eight and no higher");
let firstDark = [];
{
  const B = await mkTender("Quiet Sitter", 800, "warden", "disc-entry-b");
  const kinId = mkKin(B.ownerKey, B.name, "Cursehand", bodyParts("sky", 2, 6));
  await call("addToParty", { awakenedId: kinId }, B.token);
  const { wstate } = await watchRoom("entry-b");
  const b = new Actor(); await b.join(B.tt, "entry-b"); await b.waitYou("the sitter's seat");
  await waitFor(() => !!seatOf(wstate, B.name)?.hex, "the sitter's landing");
  const hand = await summonStanding(b, wstate, B.name, kinId, "Cursehand");
  // THE QUIET (Nigel, 2026-10-25 10:41): with a Tender
  // seated and a hand standing — gathering, summoning,
  // preparing, exactly the acts the ruling names — the
  // room is watched, and NO dark may enter: the entry
  // does not begin on an opening or on a clock.
  let quietHeld = true;
  for (let i = 0; i < 10; i++) {
    await sleep(500);
    if ((wstate.state?.dark ?? []).length !== 0 || wstate.state?.battle?.active === true) { quietHeld = false; break; }
  }
  ok("before the curse is struck the room stands QUIET — a seated Tender and a standing hand, watched across five seconds: no dark enters, no battle joins",
    quietHeld && (wstate.state?.dark ?? []).length === 0, `dark=${(wstate.state?.dark ?? []).length} active=${wstate.state?.battle?.active}`);
  // The blow the dark answers. The hand is then ordered
  // to BINDING (a production order, the wire's own word:
  // a binding hand spends her cadence mending, not
  // striking, and with no wounded ally she waits) so the
  // climb below is read on the entry alone — no hand
  // fighting the standing count down.
  await strikeCurse(b, wstate, B.name);
  b.send({ type: "setStance", cardId: hand.cardId, stance: "binding" });
  const appeared = await tryWait(() => (wstate.state?.dark ?? []).length > 0, 25000);
  firstDark = (wstate.state?.dark ?? []).map(e => ({ ...e }));
  ok("once the curse is STRUCK, the dark APPEARS with no hand on any door — the field's own entry dealt it",
    appeared && firstDark.length >= 1 && wstate.state?.battle?.active === true,
    `dark=${firstDark.length}`);
  ok("every entered foe stands at its BASE, intensity-one body — filed power, filed health, level one, no ladder riding on it",
    firstDark.every(e => BASE_BODY[e.kind] && e.lvl === 1 && e.power === BASE_BODY[e.kind].power && e.hp === BASE_BODY[e.kind].hp && e.maxHp === BASE_BODY[e.kind].hp),
    JSON.stringify(firstDark.map(e => `${e.kind}:p${e.power}/hp${e.hp}/lv${e.lvl}`)));
  // The climb: step the clock a beat at a time (the port
  // drive's own stub). Each ~45 s beat may add its trickle
  // (two) until the cradle's intensity-one cap — eight —
  // stands; one beat more adds nothing.
  let stubOff = 0;
  Date.now = () => realNow() + stubOff;
  try {
    let guard = 0;
    while ((wstate.state?.dark ?? []).length < 8 && guard++ < 7) {
      stubOff += 46 * 1000;
      await tryWait(() => false, 900); // a few pulses at the stepped clock
      await sleep(150);
    }
  } finally { Date.now = realNow; }
  ok("beat by beat the standing dark CLIMBS TO EIGHT — the homeland cradle's cap read at intensity one (8 + 2×(1−1))",
    (wstate.state?.dark ?? []).length === 8, `dark=${(wstate.state?.dark ?? []).length}`);
  Date.now = () => realNow() + stubOff;
  try {
    stubOff += 46 * 1000;
    await tryWait(() => false, 1200);
    await sleep(150);
  } finally { Date.now = realNow; }
  ok("one beat more adds NOTHING — the cap holds however long the field stands",
    (wstate.state?.dark ?? []).length === 8, `dark=${(wstate.state?.dark ?? []).length}`);
  b.ws.close();
}

/* ══ §3 EVERY DOOR, THE FURTHEST RING ONLY ════════════════ */
console.log("§3 every door deals only onto the furthest ring of the curse — the entry (§2's first foes), the Storytender, the column");
ok("§3a the entry's first foes stand on the FURTHEST RING (ring 6 of the fresh field) — nowhere deeper, though every tile inward is cursed too",
  firstDark.length >= 1 && firstDark.every(e => ringOfHex(e.hex) === 6),
  JSON.stringify(firstDark.map(e => e.hex)));
{
  // §3b THE STORYTENDER'S DEAL.
  const { wstate } = await watchRoom("campaign-entry-c");
  const st = new DevSeat(); await st.join("Entry Storytender", "campaign-entry-c"); await st.waitYou("the storytender's seat");
  st.send({ type: "claimStoryteller" });
  await waitFor(() => !!st.you?.storytender, "the storytender claims her seat");
  st.send({ type: "stAdd", kind: "fray" });
  st.send({ type: "stAdd", kind: "fray" });
  st.send({ type: "stAdd", kind: "fray" });
  await waitFor(() => (st.you?.storytender?.reserve?.length ?? 0) === 3, "the reserve of three");
  st.send({ type: "stDeal" });
  const dealt = await tryWait(() => (wstate.state?.dark ?? []).length === 3, 12000);
  const hexes = (wstate.state?.dark ?? []).map(e => e.hex);
  ok("§3b the Storytender's deal stands ONLY on the furthest ring — three dealt, three on ring 6",
    dealt && hexes.every(h => ringOfHex(h) === 6), JSON.stringify(hexes));
  st.ws.close();
}
{
  // §3c THE BASTION COLUMN. The call is a fixture (rows
  // laid white-box, as the land would lay them); the
  // claim, the begin and the deal ride the wire whole.
  const HD = await mkTender("Column Host", 800, "warden", "disc-entry-hd");
  fillers(HD, 10, "HDBench");
  const nowMs = Date.now();
  const colId = Number(db.prepare("INSERT INTO incursion_columns (owner_key, target_tile_id, state, size, power, spawned_at, arrives_at) VALUES (?, NULL, 'marching', 10, 1, ?, ?)").run(HD.ownerKey, nowMs, nowMs).lastInsertRowid);
  const callId = Number(db.prepare("INSERT INTO bastion_calls (owner_key, host_tender_id, column_id, seed_id, kind, state, created_at, join_key) VALUES (?, ?, ?, NULL, 'siege', 'open', ?, NULL)").run(HD.ownerKey, HD.tenderId, colId, nowMs).lastInsertRowid);
  const { wstate } = await watchRoom("entry-d");
  const h = new Actor(); await h.join(HD.tt, "entry-d"); await h.waitYou("the host's seat");
  await waitFor(() => !!seatOf(wstate, HD.name)?.hex, "the host's landing");
  h.send({ type: "claimBastion", callId });
  await waitFor(() => !!wstate.state?.bastion, "the call claimed");
  // The field's own entry will have dealt its trickle and
  // joined a battle by now (its §2 nature) — and a bastion
  // begin refuses a joined battle, as it always has. The
  // trickle is lifted white-box (a named sculpt) and the
  // broken field ends on the referee's own tick; from the
  // claim on, the room is the call's, and no entry deals
  // into it (the bastion guard in the entry's own law).
  {
    const room = roomOf(HD.ownerKey);
    if (room) for (const id of [...room.dark.keys()]) room.dark.delete(id);
  }
  await tryWait(() => wstate.state?.battle?.active !== true, 8000);
  h.send({ type: "startBastion" });
  const dealtAll = await tryWait(() => (wstate.state?.dark ?? []).length === 10, 15000);
  const columnDark = (wstate.state?.dark ?? []);
  ok("§3c the column is dealt WHOLE — ten of the dark by the roster's numbers",
    dealtAll && columnDark.length === 10, `dealt=${columnDark.length} errors=${JSON.stringify(h.errors.slice(-2))}`);
  ok("§3c every one of the column stands on the FURTHEST RING — the call's dark enters at the curse's edge, like every door's",
    columnDark.length === 10 && columnDark.every(e => ringOfHex(e.hex) === 6),
    JSON.stringify(columnDark.map(e => e.hex)));
  h.ws.close();
}

/* ══ §4 THE HELD DEAL ═════════════════════════════════════ */
console.log("§4 a deal that can't fit is HELD — dealt in as the first foes move inward and free the ring, never deeper, never dropped");
{
  const P = await mkTender("Held Witness", 800, "warden", "disc-entry-p");
  const { wstate } = await watchRoom("campaign-entry-e");
  const st = new DevSeat(); await st.join("Held Storytender", "campaign-entry-e"); await st.waitYou("the storytender's seat");
  st.send({ type: "claimStoryteller" });
  await waitFor(() => !!st.you?.storytender, "the storytender claims her seat");
  const p = new Actor(); await p.join(P.tt, "campaign-entry-e"); await p.waitYou("the witness's seat");
  await waitFor(() => !!seatOf(wstate, P.name)?.hex, "the witness's landing");
  // A first, honest deal raises the room's battle so the
  // drive's hand can reach the room object at all
  // (partyBattleSeatFor's standing law); the sculpt then
  // works in one synchronous pass, as the port drive's
  // §D2 sculpt did.
  st.send({ type: "stAdd", kind: "fray" });
  st.send({ type: "stDeal" });
  await waitFor(() => (wstate.state?.dark ?? []).length === 1 && !!roomOf(P.ownerKey), "the raising deal stands");
  const room = roomOf(P.ownerKey);
  const chosen = [...room.map.values()].filter(t => ringOfHex(t.id) === 6).slice(0, 3).map(t => t.id);
  // THE SCULPT (named): every tile of the field is
  // purified but three — all of them on the furthest
  // ring, which keeps its curse at full measure. The
  // furthest cursed ring IS ring 6 here, and it holds
  // exactly three tiles of ground.
  for (const id of [...room.dark.keys()]) room.dark.delete(id);
  for (const t of room.map.values()) {
    t.cursed = chosen.includes(t.id);
    if (t.cursed) t.curseHp = t.curseMaxHp;
  }
  // The bank is stocked deep on the room's own object
  // (a named fixture): the dealt dark will gate at the
  // seed and bleed it while this proof runs, and the
  // assault's fall is another law's section, not this
  // one's window to die in.
  room.campaign.bank = 100000;
  await tryWait(() => wstate.state?.battle?.active !== true, 8000); // the emptied battle ends on the referee's own tick
  // THE TRACKER: every foe's FIRST-SEEN hex, sampled on a
  // fast poll from before the deal. A dealt foe cannot
  // cross a tile in a poll's span (a tile is ~2.8 s of
  // walking), so a first-seen hex is the ground it was
  // dealt onto — the placement itself, not where it
  // later walked to.
  const firstSeen = new Map();
  let tracking = true;
  const trackLoop = (async () => {
    while (tracking) {
      for (const e of wstate.state?.dark ?? []) if (!firstSeen.has(e.id)) firstSeen.set(e.id, e.hex);
      await sleep(100);
    }
  })();
  for (let i = 0; i < 6; i++) st.send({ type: "stAdd", kind: "fray" });
  await waitFor(() => (st.you?.storytender?.reserve?.length ?? 0) === 6, "the reserve of six");
  st.send({ type: "stDeal" });
  const placed3 = await tryWait(() => (wstate.state?.dark ?? []).length === 3, 12000);
  const standingHexes = (wstate.state?.dark ?? []).map(e => e.hex);
  ok("the deal of six places only what the ring holds — THREE stand, every one on a chosen furthest-ring tile",
    placed3 && standingHexes.length === 3 && standingHexes.every(hx => chosen.includes(hx)),
    `standing=${JSON.stringify(standingHexes)} chosen=${JSON.stringify(chosen)}`);
  ok("the other THREE are HELD — the room's pending deal carries them whole (not in her hand, not on deeper ground, not gone)",
    (room.pendingDark ?? []).length === 3, `pending=${(room.pendingDark ?? []).length}`);
  // A fall frees the ring while it is still full: one of
  // the three standing is struck from the room's dark by
  // the drive's hand (a fall in fixture — the fell door
  // is other sections' proof), and the held deal must
  // send the next onto the freed tile.
  const idsBeforeFall = new Set(firstSeen.keys());
  {
    const ringFoe = [...room.dark.values()].find(e => chosen.includes(e.hex));
    if (ringFoe) room.dark.delete(ringFoe.id);
  }
  const fallDealtIn = await tryWait(() =>
    [...firstSeen.entries()].some(([id, hx]) => !idsBeforeFall.has(id) && chosen.includes(hx))
    && (room.pendingDark ?? []).length < 3, 12000);
  ok("when a ring foe FALLS, the held deal sends the next — a new foe's first ground is the freed ring tile, and the held count drops",
    fallDealtIn, `firstSeen=${JSON.stringify([...firstSeen.values()])} pending=${(room.pendingDark ?? []).length}`);
  // And the rest arrive as the first foes MOVE INWARD:
  // the whole deal stands in time, every entrance at the
  // ring, the held deal empty at the end — nothing was
  // placed deeper to make room, and nothing was dropped.
  const allIn = await tryWait(() => firstSeen.size >= 6 && (room.pendingDark ?? []).length === 0, 25000);
  tracking = false;
  await trackLoop;
  ok("the deal arrives WHOLE as the first foes move inward — six distinct foes stood, every one's first ground a furthest-ring tile, the held deal empty",
    allIn && firstSeen.size === 6 && [...firstSeen.values()].every(hx => chosen.includes(hx)),
    `seen=${firstSeen.size} firstHexes=${JSON.stringify([...firstSeen.values()])} pending=${(room.pendingDark ?? []).length}`);
  st.ws.close();
  p.ws.close();
}

/* ══ §5 A BROKEN FIELD SWEEPS NO ONE ══════════════════════ */
console.log("§5 clearing all dark dissipates NO ONE — not in a casual room, not at a campaign wave break: only a fall dissipates in battle");
async function breakProof({ roomId, campaign }) {
  const T = await mkTender(campaign ? "Break Witness Campaign" : "Break Witness", 800, "warden", campaign ? "disc-entry-t5b" : "disc-entry-t5a");
  fillers(T, 10, "T5Bench");
  const kinId = mkKin(T.ownerKey, T.name, "Fieldstand", bodyParts("sky", 2, 6));
  await call("addToParty", { awakenedId: kinId }, T.token);
  const { wstate } = await watchRoom(roomId);
  let st = null;
  if (campaign) {
    st = new DevSeat(); await st.join("Break Storytender", roomId); await st.waitYou("the storytender's seat");
    st.send({ type: "claimStoryteller" });
    await waitFor(() => !!st.you?.storytender, "the storytender claims her seat");
  }
  const t = new Actor(); await t.join(T.tt, roomId); await t.waitYou("the witness's seat");
  await waitFor(() => !!seatOf(wstate, T.name)?.hex, "the witness's landing");
  if (campaign) {
    st.send({ type: "stAdd", kind: "fray" });
    st.send({ type: "stAdd", kind: "fray" });
    st.send({ type: "stDeal" });
    await waitFor(() => (wstate.state?.dark ?? []).length === 2, "the storytender's deal stands");
    await summonStanding(t, wstate, T.name, kinId, "Fieldstand");
  } else {
    // The casual field's dark is the entry's — and the
    // entry begins only once the curse is struck (10:41):
    // the witness's hand stands first and strikes it.
    await summonStanding(t, wstate, T.name, kinId, "Fieldstand");
    await strikeCurse(t, wstate, T.name);
    await waitFor(() => (wstate.state?.dark ?? []).length > 0 && wstate.state?.battle?.active, "the field's own dark stands");
  }
  // THE SCULPT (named): the summon enrols its follower in
  // the party in the same act (the standing law) — the
  // drive strikes the enrolment, so the standing unit is
  // FIELDED NON-PARTY: exactly the standing the old
  // wave-break sweep used to judge and take.
  db.prepare("DELETE FROM tender_party WHERE owner_key = ? AND awakened_id = ?").run(T.ownerKey, kinId);
  const room = roomOf(T.ownerKey);
  // The casual room's entry beat is set to this moment
  // white-box (a named fixture — the beat's phase is not
  // under proof here): no fresh trickle may re-join the
  // battle inside the break's own window.
  if (!campaign && room) room.entryAt = Date.now();
  for (const id of [...room.dark.keys()]) room.dark.delete(id);
  const broke = await tryWait(() => t.tale.some(x => campaign ? /The Unraveling is broken/.test(x) : /The dark is broken/.test(x)), 10000);
  await sleep(600); // any sweep would have spoken and struck inside the ending's own act
  const unitAfter = (wstate.state?.field ?? []).find(u => u.name === "Fieldstand" && u.ownerName === T.name);
  const dispersed = db.prepare("SELECT dispersed_until FROM awakened WHERE id = ?").get(kinId)?.dispersed_until ?? null;
  ok(`${campaign ? "a campaign WAVE BREAK" : "a casual field BROKEN"} leaves the fielded non-party Awokin STANDING — she is on the field still`,
    broke && !!unitAfter, `broke=${broke} unit=${JSON.stringify(unitAfter ?? null)} tale=${t.tale.slice(-3).join(" | ")}`);
  ok("no re-coalescence timer was laid on her — her awakened row carries no dispersed_until, and no 'truly dissipates' was told",
    dispersed == null && !t.tale.some(x => /truly dissipates/.test(x)),
    `dispersed_until=${dispersed}`);
  t.ws.close();
  if (st) st.ws.close();
}
await breakProof({ roomId: "entry-f", campaign: false });
await breakProof({ roomId: "campaign-entry-g", campaign: true });

/* ══ §6 THE LIGHT STILL HOLDS ═════════════════════════════ */
console.log("§6 on hosted land the lit beacon holds ALL entry — and doused, the dark finds its own way back in");
{
  const H6 = await mkTender("Light Keeper Entry", 800, "warden", "disc-entry-h6");
  fillers(H6, 10, "H6Bench");
  const kinId = mkKin(H6.ownerKey, H6.name, "Keeperhand", bodyParts("sky", 2, 6));
  await call("addToParty", { awakenedId: kinId }, H6.token);
  const { wstate } = await watchRoom("entry-h");
  const h = new Actor(); await h.join(H6.tt, "entry-h"); await h.waitYou("the keeper's seat");
  await waitFor(() => !!seatOf(wstate, H6.name)?.hex, "the keeper's landing");
  h.send({ type: "beaconOpen", privacy: "public" });
  await tryWait(() => wstate.state?.hosted?.hostName === H6.name, 8000);
  // The room's curse is struck BEFORE the lighting (the
  // 10:41 provoke): the entry is live in this room, so
  // the hold proven below is the light's — against an
  // entry that would otherwise be dealing — and the
  // douse's release is read against the same live entry.
  await summonStanding(h, wstate, H6.name, kinId, "Keeperhand");
  await strikeCurse(h, wstate, H6.name);
  await tryWait(() => (wstate.state?.dark ?? []).length > 0, 15000);
  // The bank is stocked white-box (the banking road is
  // the hosted drive's §A proof); the light is lit whole.
  db.prepare("UPDATE tender_progress SET protection_bank_ms = 600000, shadow_matter = 10 WHERE owner_key = ?").run(H6.ownerKey);
  await sleep(500);
  h.send({ type: "beaconLight", lit: true });
  ok("the beacon lights and STANDS over the land",
    await tryWait(() => wstate.state?.hosted?.beacon?.lit === true && wstate.state?.hosted?.beacon?.standing === true, 8000),
    JSON.stringify(wstate.state?.hosted?.beacon ?? null));
  // Whatever entered before the lighting is lifted by the
  // drive's hand (a named sculpt) — from the lit moment,
  // the proof watches the DEALING, which is the light's
  // law: no dark may be dealt onto lit ground, by any door.
  const room = roomOf(H6.ownerKey);
  if (room) for (const id of [...room.dark.keys()]) room.dark.delete(id);
  await tryWait(() => wstate.state?.battle?.active !== true, 8000);
  let heldClean = true;
  for (let i = 0; i < 12; i++) {
    await sleep(500);
    if ((wstate.state?.dark ?? []).length !== 0 || wstate.state?.battle?.active === true) { heldClean = false; break; }
  }
  ok("while the light burns, NO DARK ENTERS — across a watched window the field stays empty and no battle is joined",
    heldClean, `dark=${(wstate.state?.dark ?? []).length} active=${wstate.state?.battle?.active}`);
  // The beat's anchor is the fixture's to set (named in
  // the header): the release under proof is the douse's,
  // not the beat's phase.
  if (room) room.entryAt = undefined;
  h.send({ type: "beaconLight", lit: false });
  ok("doused, the dark ENTERS AGAIN ON ITS OWN — no button exists to press, and none was pressed",
    await tryWait(() => (wstate.state?.dark ?? []).length > 0, 20000),
    `dark=${(wstate.state?.dark ?? []).length}`);
  h.ws.close();
}

console.log(`\nTABLE ENTRY DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
