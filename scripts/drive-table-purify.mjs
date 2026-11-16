// PURIFY ON THE TEST GROUND — ITS DRIVE (2026-11-16).
// Boots the real server on a scratch DATA_DIR and proves
// the Purify correction on the real Test Ground surface
// (WebSocket rooms, the real table.ts referee, the real
// DB): the homeland's Purify law of 2026-11-15 carried to
// the old Table face.
//   §1 THE ATTACK ORDER IS GONE: the client carries no
//      ord-attack, no strikeCurse word, no "Strike the
//      curse"; the referee refuses setStance "attack" in
//      plain words; a strikeCurse message meets silence —
//      no error, no tale, no wear on the tile — and the
//      room is NOT provoked: stepped past two entry beats,
//      no dark enters and no battle joins.
//   §2 THE DRAIN AT THE RULED RATE: a purify ordered from
//      standing in reach accrues on the tile at one point
//      of curse thickness per 600 settled seconds (the
//      drive steps the referee's clock, as the entry drive
//      does); the served state names the tile's purifier
//      and the unit's purify tile, and an unordered
//      Awokin's served stance reads as standing.
//   §3 THE MARCH LEG: an out-of-reach order marches the
//      Awokin to the cursed ground's edge on the standing
//      march machinery — the road's per-hex price read off
//      the tale and matched against the purse — and the
//      drain begins by itself on arrival.
//   §4 THE PURIFIER NEVER STRIKES BACK: with a foe stood
//      beside it (a named sculpt, below) and the battle
//      joined, the dark claws the purifier — and every
//      dark stands at full health after the window: the
//      purifier answered nothing.
//   §5 THE TILE TURNS AT NOTHING: worn to a thread (a
//      named sculpt), the drained tile turns outright in
//      the purifier's dominant element and the order ends.
//   §6 PRESENCE: step away past the five-minute grace and
//      the drain banks nothing; return, and it resumes.
//   §7 THE DEFENCE: a purifying tile draws marked
//      defenders on the entry beat, one per beat toward
//      its share of the thickness, under the field cap —
//      and a stance order ends the purify and stands the
//      defence down (the marks clear).
// White-box room reads ride partyBattleSeatFor, the
// battle-port drive's own road: it resolves once a room's
// battle is active, so each section that needs the room
// object takes it after its first entry beat has joined
// the battle. Fixture sculpts are named where they stand,
// in the house manner; the referee, the order, the
// settle, the entry beat and the endings under proof are
// production code.
// Run: node scripts/drive-table-purify.mjs
import { join } from "node:path";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

const OUT = "/home/hatch/workspace/summon-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-tpurify-"));
process.env.PORT = "3954";
process.env.WORKSHOP_PASSWORD = "tpurify-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3954";
const PW = "tpurify-drive-password";
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
  .run(name, category, power, toughness, element, `tpurify/${name}.png`, Date.now()).lastInsertRowid);
const mkKin = (ownerKey, ownerName, name, parts) => {
  const comp = JSON.stringify(parts.map(([category, element, power, toughness]) => ({
    source_id: `db:${partEl(`${name} ${category}`, category, power, toughness, element)}`,
    name: `${name} ${category}`, category, rarity: "common", power, toughness, element,
  })));
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, "tpurify/awokin.png", comp, ownerName, ownerKey, Date.now()).lastInsertRowid);
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

class Actor {
  constructor() { this.state = null; this.you = null; this.errors = []; this.joinErrors = []; }
  async join(tt, room, extra = {}) {
    this.ws = new WebSocket("ws://127.0.0.1:3954/table/ws");
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
  const wstate = { state: null };
  const wws = new WebSocket("ws://127.0.0.1:3954/table/ws");
  return new Promise((resolve) => {
    wws.onopen = () => { wws.send(JSON.stringify({ type: "join", room: roomId, watch: true, name: "Purify Watcher" })); resolve({ wstate, wws }); };
    wws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") wstate.state = m.state; } catch { /* torn frame */ } };
  });
}
const waitFor = async (fn, what, ms = 20000) => { const s = realNow(); while (realNow() - s < ms) { let v = false; try { v = fn(); } catch { v = false; } if (v) return true; await sleep(120); } throw new Error("drive wait: " + what); };
const tryWait = async (fn, ms) => { try { await waitFor(fn, "tryWait", ms); return true; } catch { return false; } };
const parseAx = (id) => id.split(",").map(Number);
const axDist = (a, b) => { const [aq, ar] = parseAx(a); const [bq, br] = parseAx(b); return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(aq + ar - bq - br)); };
const roomOf = (ownerKey) => partyBattleSeatFor(ownerKey)?.room ?? null;
const seatOf = (wstate, name) => wstate.state?.players.find((p) => p.name === name) ?? null;

async function summonStanding(actor, wstate, ownerName, awakenedId, unitName, tries = 20) {
  for (let i = 0; i < tries; i++) {
    actor.send({ type: "summonCast", awakenedId });
    const stood = await tryWait(() => (wstate.state?.field ?? []).some(u => u.name === unitName && u.ownerName === ownerName), 3500);
    if (stood) {
      // Standing STILL, not merely standing: an order is
      // refused to a unit on the move, and a fresh summon
      // may still be gliding to its ground.
      await waitFor(() => { const u = (wstate.state?.field ?? []).find(x => x.name === unitName && x.ownerName === ownerName); return !!u && !u.moving; }, "the hand stands still", 15000);
      return wstate.state.field.find(u => u.name === unitName && u.ownerName === ownerName);
    }
    await sleep(300);
  }
  throw new Error("summon never landed: " + unitName + " | seat errors: " + JSON.stringify(actor.errors.slice(-3)) + " | energy: " + actor.you?.energy);
}
/* The referee's clock, stepped: a virtual now that
 * advances at the real rate plus whatever the drive
 * steps into it, installed at the first step and left
 * installed — so the referee's anchors (a purify's
 * settle anchor, the entry beat's stamp) stay consistent
 * across steps, and a step's span is the step itself.
 * (The entry drive's stub, kept whole instead of handed
 * back between steps, because this drive measures rates
 * across steps, not just counts.) */
let vnow = null, vlastReal = null;
async function stepClock(ms, holdMs = 1300) {
  if (vnow == null) {
    vnow = realNow(); vlastReal = realNow();
    Date.now = () => { const r = realNow(); vnow += (r - vlastReal); vlastReal = r; return vnow; };
  }
  vnow += ms;
  await sleep(holdMs);
}
/* A cursed tile at distance exactly one from the hand:
 * the hand stands BESIDE it on pure ground, so the
 * standing grind (which wears the tile a light stands
 * ON) cannot confound the drain's rate. */
const adjacentCursed = (wstate, hand) => (wstate.state?.map ?? []).find(t => t.cursed && t.id !== "0,0" && axDist(t.id, hand.hex) === 1);

/* ══ §1 THE ATTACK ORDER IS GONE ══════════════════════ */
console.log("§1 the Attack order is gone — no wheel entry, no stance word, no strike door");
{
  const clientSrc = readFileSync(new URL("../client/src/Table.tsx", import.meta.url), "utf8");
  ok("the client carries NO ord-attack wheel entry", !clientSrc.includes("ord-attack"));
  ok("the client sends NO strikeCurse word anywhere", !clientSrc.includes("strikeCurse"));
  ok("the client offers NO 'Strike the curse'", !clientSrc.includes("Strike the curse"));
  const A = await mkTender("Purify Witness", 800, "warden", "disc-tpurify-a");
  const kinId = mkKin(A.ownerKey, A.name, "Drainhand", bodyParts("root", 2, 8));
  await call("addToParty", { awakenedId: kinId }, A.token);
  const { wstate } = await watchRoom("tpurify-a");
  const a = new Actor(); await a.join(A.tt, "tpurify-a"); await a.waitYou("the witness's seat");
  await waitFor(() => !!seatOf(wstate, A.name)?.hex, "the witness's landing");
  const hand = await summonStanding(a, wstate, A.name, kinId, "Drainhand");
  const err0 = a.errors.length;
  a.send({ type: "setStance", cardId: hand.cardId, stance: "attack" });
  await sleep(600);
  ok("setStance 'attack' is REFUSED in plain words — there is no such order",
    a.errors.slice(err0).some(e => /No such order — defend, or bind/.test(e)), JSON.stringify(a.errors.slice(err0)));
  const target = adjacentCursed(wstate, hand);
  ok("a cursed tile stands within the hand's reach for the sections below", !!target, `hand=${hand.hex}`);
  const servedHp0 = (wstate.state?.map ?? []).find(t => t.id === target.id)?.curseHp;
  const tale0 = a.tale.length;
  const err1 = a.errors.length;
  a.send({ type: "strikeCurse", cardId: hand.cardId, hex: hand.hex, target: target.id });
  await sleep(900);
  ok("a strikeCurse message meets SILENCE — no error, no tale, no wear on the tile",
    a.errors.length === err1 && a.tale.length === tale0
      && (wstate.state?.map ?? []).find(t => t.id === target.id)?.curseHp === servedHp0,
    `errors=${a.errors.length - err1} tale=${a.tale.length - tale0}`);
  // The dead word must not provoke either: stepped past
  // two entry beats, the room stands quiet.
  await stepClock(46 * 1000, 1100);
  await stepClock(46 * 1000, 1100);
  ok("and the room is NOT provoked — past two entry beats no dark enters and no battle joins",
    (wstate.state?.dark ?? []).length === 0 && wstate.state?.battle?.active !== true,
    `dark=${(wstate.state?.dark ?? []).length} active=${wstate.state?.battle?.active}`);

  /* ══ §2 THE DRAIN AT THE RULED RATE ═══════════════════ */
  console.log("§2 the purify drains at the ruled rate — one point of thickness per 600 settled seconds");
  a.send({ type: "purifyCurse", cardId: hand.cardId, target: target.id });
  await waitFor(() => (wstate.state?.map ?? []).find(t => t.id === target.id)?.purifiers?.includes("Drainhand"), "the tile names its purifier");
  const servedUnit = (wstate.state?.field ?? []).find(u => u.name === "Drainhand");
  ok("the served state names the purifier on the tile and the tile on the unit",
    servedUnit?.purifyTile === target.id, `purifyTile=${servedUnit?.purifyTile}`);
  ok("the served stance of an unordered Awokin reads as standing", servedUnit?.stance === "standing", `stance=${servedUnit?.stance}`);
  // The first entry beat joins the battle (the order is
  // the provoke) — and with the battle active the room
  // object is the drive's to read, exactly.
  await stepClock(46 * 1000, 1200);
  await waitFor(() => wstate.state?.battle?.active === true, "the battle joins on the entry beat");
  const room = roomOf(A.ownerKey);
  ok("the room stands open to the drive's reading once its battle is joined", !!room);
  ok("the order stands written in the room", (room.purifies ?? []).some(o => o.tileId === target.id),
    `orders=${JSON.stringify(room.purifies ?? [])}`);
  const hp0 = room.map.get(target.id).curseHp;
  await stepClock(600 * 1000, 1500);
  const hp1 = room.map.get(target.id).curseHp;
  ok("600 settled seconds wear the tile by ONE point of thickness (fractional, on the tile)",
    hp0 - hp1 >= 0.9 && hp0 - hp1 <= 1.15, `wore ${hp0} -> ${hp1} (Δ ${hp0 - hp1})`);

  /* ══ §4 THE PURIFIER NEVER STRIKES BACK ═══════════════ */
  console.log("§4 the purifier never strikes back — the dark claws it, and every dark stands whole");
  const purifier = [...room.field.values()].find(u => u.card.name === "Drainhand");
  // THE SCULPT (named): a Fray is stood beside the
  // purifier by the drive's hand, built exactly as the
  // referee builds its dark — the purifier's answer, or
  // its absence, is read on this foe and on every dark
  // standing. (The dealing doors are the entry drive's
  // proof; the answer pass is this one's.)
  room.dark.set("drive-fray-1", {
    id: "drive-fray-1", hex: purifier.hex, kind: "fray", label: "Fray", art: null,
    power: 1, hp: 3, maxHp: 3, pinnedUntil: 0, pos: { x: purifier.pos.x + 30, y: purifier.pos.y }, target: null, lastTile: purifier.hex,
    armor: 11, lvl: 1, speedGauge: 0,
  });
  // The dark's acting is read on the foe itself: a Fray
  // standing 30px from the purifier, with no other light
  // in its reach, can spend its strikes on nothing else —
  // its struck flag and its advancing cadence are the
  // clawing, hit or miss (the purifier's AC and its
  // guard-works decide the blows, not this section: what
  // is under proof is that the purifier ANSWERS nothing).
  const clawed = await tryWait(() => {
    const f = room.dark.get("drive-fray-1");
    return !!f && f.struck === true;
  }, 20000);
  ok("the dark CLAWS at the purifier — the stood-beside Fray spends its strikes on the only light in its reach", clawed,
    `struck=${room.dark.get("drive-fray-1")?.struck}`);
  await sleep(5000);
  const allWhole = [...room.dark.values()].every(e => e.hp === e.maxHp);
  ok("every dark stands at FULL health — the purifying Awokin struck nothing back, though foes stood in its reach the whole window",
    allWhole, JSON.stringify([...room.dark.values()].map(e => `${e.kind}:${e.hp}/${e.maxHp}`)));
  a.ws.close();
}

/* ══ §3 + §5 THE MARCH LEG, AND THE TILE TURNS ══════════ */
console.log("§3 an out-of-reach order marches to the cursed ground's edge — and §5 the drained tile turns");
{
  const B = await mkTender("March Witness", 800, "warden", "disc-tpurify-b");
  const kinId = mkKin(B.ownerKey, B.name, "Roadhand", bodyParts("root", 2, 8));
  await call("addToParty", { awakenedId: kinId }, B.token);
  const { wstate } = await watchRoom("tpurify-b");
  const b = new Actor(); await b.join(B.tt, "tpurify-b"); await b.waitYou("the march witness's seat");
  await waitFor(() => !!seatOf(wstate, B.name)?.hex, "the march witness's landing");
  const hand = await summonStanding(b, wstate, B.name, kinId, "Roadhand");
  // A first, in-reach order: the provoke that wakes the
  // field (and joins the battle the room-reading rides).
  const near = adjacentCursed(wstate, hand);
  b.send({ type: "purifyCurse", cardId: hand.cardId, target: near.id });
  await stepClock(46 * 1000, 1200);
  await waitFor(() => wstate.state?.battle?.active === true, "the battle joins");
  const room = roomOf(B.ownerKey);
  // A far cursed tile: at least three hexes from the hand.
  const target = (wstate.state?.map ?? []).filter(t => t.cursed && t.id !== "0,0" && axDist(t.id, hand.hex) >= 3)
    .sort((x, y) => axDist(x.id, hand.hex) - axDist(y.id, hand.hex))[0];
  ok("a far cursed tile stands for the march leg", !!target, `hand=${hand.hex}`);
  // THE SCULPT (named): one tile at the target's edge is
  // freed by the drive's hand, so the road has its end —
  // the homeland's choosing needs pure ground at distance
  // one from the target, and a fresh field's deep curse
  // has none. The road, the price and the arrival are the
  // law under proof.
  const edge = (wstate.state?.map ?? []).filter(t => axDist(t.id, target.id) === 1 && t.id !== "0,0")
    .sort((x, y) => axDist(x.id, hand.hex) - axDist(y.id, hand.hex))[0];
  const edgeTile = room.map.get(edge.id);
  edgeTile.cursed = false; edgeTile.element = "root"; edgeTile.curseHp = 0;
  const energy0 = b.you?.energy;
  b.send({ type: "purifyCurse", cardId: hand.cardId, target: target.id });
  await waitFor(() => (room.purifies ?? []).some(o => o.tileId === target.id), "the purify order stands on the far tile");
  const marched = await tryWait(() => {
    const u = (wstate.state?.field ?? []).find(x => x.name === "Roadhand");
    return !!u && (u.moving || u.tgt);
  }, 5000);
  ok("the order MARCHES the Awokin — it is on the move under its own order", marched);
  const taleLine = b.tale.find(t => /marches Roadhand to the cursed ground's edge \(✦(\d+)\)/.test(t));
  const price = taleLine ? Number(taleLine.match(/\(✦(\d+)\)/)[1]) : null;
  await waitFor(() => {
    const u = (wstate.state?.field ?? []).find(x => x.name === "Roadhand");
    return !!u && !u.moving && axDist(u.hex, target.id) <= 1;
  }, "the arrival at the cursed ground's edge", 40000);
  const energy1 = b.you?.energy;
  ok("the road's price left the purse — the tale's ✦ and the purse agree",
    price != null && energy0 != null && energy1 != null && Math.round(energy0 - energy1) === price,
    `tale ✦${price}, purse ${energy0} -> ${energy1}`);
  const hp0 = room.map.get(target.id).curseHp;
  await stepClock(600 * 1000, 1500);
  const hp1 = room.map.get(target.id).curseHp;
  ok("on arrival the drain begins BY ITSELF at the ruled rate", hp0 - hp1 >= 0.9 && hp0 - hp1 <= 1.15, `wore ${hp0} -> ${hp1}`);

  /* §5 THE TILE TURNS AT NOTHING */
  // THE SCULPT (named): the tile is worn to a thread by
  // the drive's hand — the last stretch of the drain and
  // the turn are the law under proof, not the whole
  // thickness above them.
  room.map.get(target.id).curseHp = 0.4;
  await stepClock(300 * 1000, 1500);
  const tileAfter = room.map.get(target.id);
  ok("at nothing the tile TURNS outright — in the purifier's dominant element (root)",
    tileAfter.cursed === false && tileAfter.element === "root",
    `cursed=${tileAfter.cursed} element=${tileAfter.element}`);
  ok("the order ENDS with the turn", !(room.purifies ?? []).some(o => o.tileId === target.id),
    `orders=${JSON.stringify(room.purifies ?? [])}`);
  b.ws.close();
}

/* ══ §6 PRESENCE ════════════════════════════════════════ */
console.log("§6 presence — away past the grace the drain banks nothing; returned, it resumes");
{
  const C = await mkTender("Presence Witness", 800, "warden", "disc-tpurify-c");
  const kinId = mkKin(C.ownerKey, C.name, "Gracehand", bodyParts("root", 2, 8));
  await call("addToParty", { awakenedId: kinId }, C.token);
  const { wstate } = await watchRoom("tpurify-c");
  const c = new Actor(); await c.join(C.tt, "tpurify-c"); await c.waitYou("the presence witness's seat");
  await waitFor(() => !!seatOf(wstate, C.name)?.hex, "the presence witness's landing");
  const hand = await summonStanding(c, wstate, C.name, kinId, "Gracehand");
  const target = adjacentCursed(wstate, hand);
  c.send({ type: "purifyCurse", cardId: hand.cardId, target: target.id });
  await stepClock(46 * 1000, 1200);
  await waitFor(() => wstate.state?.battle?.active === true, "the battle joins");
  const room = roomOf(C.ownerKey);
  ok("the purify order stands before the seat steps away", (room.purifies ?? []).some(o => o.tileId === target.id));
  await sleep(800); // a few pulses anchor the order
  c.ws.close();
  await sleep(600); // the seat steps away (room.away)
  const hpAway0 = room.map.get(target.id).curseHp;
  // 400 stepped seconds: past the drain's five-minute
  // presence grace, inside the room's ten-minute
  // held-seat grace, so the seat itself survives the step.
  await stepClock(400 * 1000, 1500);
  const hpAway1 = room.map.get(target.id).curseHp;
  ok("away past the grace, the drain banks NOTHING — the tile stands exactly as it stood",
    Math.abs(hpAway0 - hpAway1) < 0.02, `away ${hpAway0} -> ${hpAway1}`);
  const c2 = new Actor(); await c2.join(C.tt, "tpurify-c"); await c2.waitYou("the returned seat");
  await stepClock(600 * 1000, 1500);
  const hpBack = room.map.get(target.id).curseHp;
  ok("returned, the drain RESUMES at the ruled rate", hpAway1 - hpBack >= 0.85 && hpAway1 - hpBack <= 1.15,
    `resumed ${hpAway1} -> ${hpBack} (Δ ${hpAway1 - hpBack})`);
  c2.ws.close();
}

/* ══ §7 THE DEFENCE ═════════════════════════════════════ */
console.log("§7 the defence — a purifying tile draws marked defenders toward its share, and a stance order stands them down");
{
  const D = await mkTender("Defence Witness", 800, "warden", "disc-tpurify-d");
  const kinId = mkKin(D.ownerKey, D.name, "Wardhand", bodyParts("root", 2, 8));
  await call("addToParty", { awakenedId: kinId }, D.token);
  const { wstate } = await watchRoom("tpurify-d");
  const d = new Actor(); await d.join(D.tt, "tpurify-d"); await d.waitYou("the defence witness's seat");
  await waitFor(() => !!seatOf(wstate, D.name)?.hex, "the defence witness's landing");
  const hand = await summonStanding(d, wstate, D.name, kinId, "Wardhand");
  const target = adjacentCursed(wstate, hand);
  const thickness = (wstate.state?.map ?? []).find(t => t.id === target.id)?.curseHp ?? 0;
  const share = Math.max(1, Math.round(thickness / 4));
  d.send({ type: "purifyCurse", cardId: hand.cardId, target: target.id });
  await waitFor(() => (wstate.state?.map ?? []).find(t => t.id === target.id)?.purifiers?.includes("Wardhand"), "the purify order stands");
  const marked = () => (wstate.state?.dark ?? []).filter(e => e.defendTileId === target.id);
  // The beat's anchor starts unset, so the first beat
  // fires on the room's own pulses the moment the
  // provoke stands — the drive waits for it rather than
  // stepping it, and reads the count before any second
  // beat can be due (a beat is 45 settled seconds; the
  // reading below lands within a few real seconds).
  await tryWait(() => marked().length >= 1, 10000);
  ok("the first entry beat births ONE marked defender for the purifying tile", marked().length === 1,
    `marked=${marked().length} dark=${(wstate.state?.dark ?? []).length}`);
  const first = marked()[0];
  ok("the defender is born on cursed ground within fifteen hexes of the purifying tile — never on the tile itself",
    !!first && first.hex !== target.id && (wstate.state?.map ?? []).find(t => t.id === first.hex)?.cursed === true && axDist(first.hex, target.id) <= 15,
    `born=${first?.hex} target=${target.id}`);
  await stepClock(46 * 1000, 1300);
  await stepClock(46 * 1000, 1300);
  ok("beat by beat the defence grows toward the tile's share of its thickness, under the field's cap of eight",
    marked().length >= 2 && marked().length <= share && (wstate.state?.dark ?? []).length <= 8,
    `marked=${marked().length} share=${share} (thickness ${thickness}) dark=${(wstate.state?.dark ?? []).length}`);
  d.send({ type: "setStance", cardId: hand.cardId, stance: "binding" });
  await sleep(900);
  const servedUnit = (wstate.state?.field ?? []).find(u => u.name === "Wardhand");
  ok("a stance order ENDS the purify — and the defence stands down: every mark clears",
    servedUnit?.purifyTile == null && marked().length === 0,
    `purifyTile=${servedUnit?.purifyTile} marked=${marked().length}`);
  d.ws.close();
}

console.log(`\nTABLE PURIFY DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
