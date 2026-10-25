// THE TABLE BATTLE PORT — TWELVE #1'S DRIVE (2026-10-25).
// Boots the real server on a scratch DATA_DIR and proves
// the ported homeland battle at the Table, on the real
// Table surface (WebSocket rooms, the real referee):
//   §A THE ENGINE: the dark is dealt, WALKS, is STOPPED
//      (claw halt at a standing light), Awokin strikes land
//      and are witnessed, and a summoned Awokin's shield
//      lies inside its sum-of-the-parts dice bounds and
//      burns before HP.
//   §B THE ORDERS: setStance rides the room — defence on a
//      Stone hand raises a ROCKWALL (3 stones at Lv 1, the
//      homeland's level health) that HALTS the dark's walk;
//      defence on a Root hand raises a BRAMBLE (one true
//      node per worn part, three motes to a node); leaving
//      the order prunes the work in the same act; BINDING
//      mends the most-wounded of the binder's own company
//      in reach instead of striking.
//   §F WATERING: a Tide hand with no dark in reach spends
//      her strike on the nearest mote — the harm banks
//      (exact, under pinned dice) and the bank past 10
//      spreads a new mote, the homeland's numbers.
//   §C THE FELL DOOR: one door pays every felling — a
//      swarm-felled Fray pays the DROP TABLE whole (the
//      guaranteed reagent + items + alchemy under pinned
//      dice, a rune shard, a relic, Shadow +1 for the
//      Fray's AC bonus, the SPOKEN TAKE in the tale); two
//      strikers sharing a fell divide the 10-XP pot by
//      their damage (the sum is exact, both drink).
//   §D THE GROWTH CYCLE: the room's seed grows BY FEEDING
//      ONLY — whole energy walks from the purse into the
//      seed at the homeland's pace (Date.now stepped
//      forward in the drive's own process; the room is held
//      battle-free under the host's lit beacon — the entry
//      law's held door — so the climb is read on the
//      pulse's settling alone, and the purse on feeding
//      alone); level 2 purifies the seed's six neighbours;
//      level 3 stands.
//      §D2 THE BEACON'S BIRTH-BAR: with the map sculpted
//      (white-box tile flags — the furthest cursed ring
//      made to BE the seed's own ring, the only ground a
//      deal may take under the entry law of 2026-10-25) a
//      level-3 seed's deal births NOTHING within its
//      footprint — the dealt dark waits held, unborn —
//      and the level-1 control deal stands on that ring.
//   §E THE DEFENCE ROAD IS OUT: three beaten columns at a
//      held seed tally three stands and change NOTHING
//      else — the seed's level stands, the cursed neighbour
//      stands cursed. Feeding is the only ladder.
// White-box reads ride partyBattleSeatFor (the exported
// seat lookup) for the room's own objects (workings'
// banks, the fell ledger) where the wire cannot carry
// them; the behaviour asserted is always the server's.
// Fixture note: bound tenders are seeded with three wakes
// before chooseClass — the repaired pattern of
// drive-table-pickcast (2026-10-24): the choosing opens
// only after the first three wakes.
// Run: node scripts/drive-table-battle-port.mjs
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

const OUT = "/home/hatch/workspace/summon-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-port-"));
process.env.PORT = "3951";
process.env.WORKSHOP_PASSWORD = "port-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3951";
const PW = "port-drive-password";
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
  .run(name, category, power, toughness, element, `port/${name}.png`, Date.now()).lastInsertRowid);
/** parts: [[category, element, power, toughness], ...] */
const mkKin = (ownerKey, ownerName, name, parts) => {
  const comp = JSON.stringify(parts.map(([category, element, power, toughness]) => ({
    source_id: `db:${partEl(`${name} ${category}`, category, power, toughness, element)}`,
    name: `${name} ${category}`, category, rarity: "common", power, toughness, element,
  })));
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, "port/awokin.png", comp, ownerName, ownerKey, Date.now()).lastInsertRowid);
};
const stdParts = (el, power, toughness) => [["body", el, power, toughness], ["arms", el, power, toughness], ["head", el, power, toughness]];
/** Power carried on the body alone (a card's price is its
 *  whole power — a part-by-part power prices a summon out
 *  of a fresh purse, fizzle by fizzle). */
const bodyParts = (el, power, toughness) => [["body", el, power, toughness], ["arms", el, 0, toughness], ["head", el, 0, toughness]];

const { issueTableToken, partyBattleSeatFor } = await import("../server/dist/table.js");
const { rockWallHpForLevel } = await import("../server/dist/actions.js");
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
const widen = async (t) => {
  for (const k of ["h1", "h2", "h3", "h4", "h5"]) await call("unlockSkill", { key: k }, t.token);
  db.prepare("INSERT INTO tender_skills (owner_key, skill_key, pool, created_at) VALUES (?, 'w_b2', 'tree', ?)").run(t.ownerKey, Date.now());
};
/** Bench Awokin: each owned Awokin of power ≥ 1 raises the
 *  seat's max energy by 2 (calculateMaxEnergy's law) — the
 *  purse a fixture seat joins with is set by its bench. */
const fillers = (t, n, tag) => { for (let i = 0; i < n; i++) mkKin(t.ownerKey, t.name, `${tag} ${i + 1}`, bodyParts("sky", 2, 2)); };

class Actor {
  constructor() { this.state = null; this.you = null; this.errors = []; }
  async join(tt, room) {
    this.ws = new WebSocket("ws://127.0.0.1:3951/table/ws");
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
  get tale() { return (this.state?.tale ?? []).map((t) => (typeof t === "string" ? t : t?.text ?? "")); }
  async waitYou(what, ms = 12000) { const s = realNow(); while (realNow() - s < ms) { if (this.you) return; await sleep(120); } throw new Error("actor wait: " + what); }
}
const waitFor = async (fn, what, ms = 20000) => { const s = realNow(); while (realNow() - s < ms) { let v = false; try { v = fn(); } catch { v = false; } if (v) return true; await sleep(120); } throw new Error("drive wait: " + what); };
const tryWait = async (fn, ms) => { try { await waitFor(fn, "tryWait", ms); return true; } catch { return false; } };
const parseAx = (id) => id.split(",").map(Number);
const axDist = (a, b) => { const [aq, ar] = parseAx(a); const [bq, br] = parseAx(b); return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(aq + ar - bq - br)); };
const distPx = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const roomOf = (ownerKey) => partyBattleSeatFor(ownerKey)?.room ?? null;

/** Summon by the wheel's cast until the unit stands (a
 *  fizzle is an honest face — cast again, as a player
 *  would). Returns the standing field unit view. */
async function summonStanding(actor, wstate, ownerName, awakenedId, unitName, tries = 20) {
  for (let i = 0; i < tries; i++) {
    actor.send({ type: "summonCast", awakenedId });
    const stood = await tryWait(() => (wstate.state?.field ?? []).some(u => u.name === unitName && u.ownerName === ownerName), 3500);
    if (stood) return wstate.state.field.find(u => u.name === unitName && u.ownerName === ownerName);
    await sleep(300);
  }
  throw new Error("summon never landed: " + unitName + " | seat errors: " + JSON.stringify(actor.errors.slice(-3)) + " | energy: " + actor.you?.energy);
}
/* Strike the curse once with the actor's standing hand —
 * the act the dark answers (Nigel, 2026-10-25 10:41: the
 * field's entry does not begin until the Tenders start
 * attacking the curse). Best-effort: with no hand standing
 * there is nothing to strike with, and the wait in
 * ensureBattle is the section's own to fail loudly. */
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

async function ensureBattle(actor, wstate, what, ownerName) {
  if (wstate.state?.battle?.active && (wstate.state?.dark ?? []).length > 0) return;
  // THE ENTRY LAW (2026-10-25): no word raises a battle at
  // a free table any more — the beginning-of-waves door is
  // removed (the startWave and begin sends this helper once
  // made are dead words now), and the field's own entry
  // deals the dark on its 45-second beat — but only once
  // the curse has been struck (the 10:41 provoke). Raising
  // a battle here is striking the curse with a standing
  // hand, then WAITING for that beat: the wait spans a
  // full beat and more, and returns the moment dark stands.
  if (ownerName) await provokeEntry(actor, wstate, ownerName);
  await waitFor(() => wstate.state?.battle?.active && (wstate.state?.dark ?? []).length > 0, what, 60000);
}

function watchRoom(roomId) {
  const wstate = { state: null };
  const wws = new WebSocket("ws://127.0.0.1:3951/table/ws");
  return new Promise((resolve) => {
    wws.onopen = () => { wws.send(JSON.stringify({ type: "join", room: roomId, watch: true, name: "Port Watcher" })); resolve({ wstate, wws }); };
    wws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") wstate.state = m.state; } catch { /* torn frame */ } };
  });
}
const seatOf = (wstate, name) => wstate.state?.players.find((p) => p.name === name) ?? null;
const fieldOf = (wstate, name) => (wstate.state?.field ?? []).filter((u) => u.ownerName === name);

/* ══ §A THE ENGINE ════════════════════════════════════════ */
console.log("§A the engine at the Table — the dark walks, is stopped, is struck; shields are the sum of the parts");
{
  const A = await mkTender("Port Warden", 800, "warden", "disc-port-a");
  await widen(A);
  fillers(A, 10, "ABench");
  const kinId = mkKin(A.ownerKey, A.name, "Stoneblade", bodyParts("stone", 2, 2));
  await call("addToParty", { awakenedId: kinId }, A.token);
  const { wstate } = await watchRoom("port-a");
  const a = new Actor(); await a.join(A.tt, "port-a"); await a.waitYou("A's seat");
  await waitFor(() => !!seatOf(wstate, A.name)?.hex, "A's landing");
  // A STONE hand (reach one hex): the dark must walk the
  // whole field to reach her — a Sky hand's four-hex reach
  // sniped it at the rim before its walk could be read.
  const unit = await summonStanding(a, wstate, A.name, kinId, "Stoneblade");
  ok("a summon lands — and its shield lies inside the sum-of-the-parts bounds (3 stone parts: three d12, 3–36)",
    unit.shield >= 3 && unit.shield <= 36 && unit.maxShield === unit.shield, `shield=${unit.shield}/${unit.maxShield}`);
  await ensureBattle(a, wstate, "§A's wave", A.name);
  const d0 = wstate.state.dark[0];
  const p0 = { ...d0.pos };
  await sleep(1300);
  const d0Now = wstate.state.dark.find(e => e.id === d0.id);
  ok("the dark WALKS — its standing point moves under the referee's clock",
    !!d0Now && distPx(p0, d0Now.pos) > 3, d0Now ? `${JSON.stringify(p0)} -> ${JSON.stringify(d0Now.pos)}` : "the first dark fell before it could walk");
  // THE MEETING (a fixture sculpt, named): the wave is
  // thinned to one dark, made a Fray of 30 health, and set
  // 130px from Stoneblade — she walks the rest on her own
  // law (to the nearest light, or the seed past it) and
  // the fight happens where she stops. Marching Stoneblade
  // out to a moving dark (the earlier choreography) read
  // clean only when the marches happened to meet her; the
  // walk, the stop and the strikes under proof are the
  // referee's own either way.
  {
    const room = roomOf(A.ownerKey);
    if (room) {
      // The field's entry beat is pinned an hour out for
      // this section (a named fixture): the duel under
      // proof is one dark against one hand, and a second
      // foe wandering in mid-duel is weather, not engine —
      // the entry's own law is drive-table-entry's whole
      // subject, proven there.
      room.entryAt = Date.now() + 3600000;
      const keep = [...room.dark.values()][0];
      const blade = [...room.field.values()].find(u => u.card.name === "Stoneblade");
      if (keep && blade) {
        for (const e of [...room.dark.values()]) if (e !== keep) room.dark.delete(e.id);
        keep.kind = "fray"; keep.label = "Fray"; keep.power = 1; keep.hp = 200; keep.maxHp = 200;
        // Set beyond Stoneblade on the ray from the seed
        // through her — the light is nearer to the dark
        // than the seed is, so the walk comes to her.
        const rx = blade.pos.x - 0, ry = blade.pos.y - 0;
        const rl = Math.hypot(rx, ry) || 1;
        keep.pos = { x: blade.pos.x + (rx / rl) * 130, y: blade.pos.y + (ry / rl) * 130 };
        keep.target = null; keep.pinnedUntil = 0;
      }
    }
  }
  ok("Awokin strikes LAND and are witnessed — a dark's health falls, the strike ledger carries the light's blows",
    await tryWait(() => (wstate.state?.strikes ?? []).some(s => s.side === "light" && s.hit) && (wstate.state?.dark ?? []).some(e => e.hp < e.maxHp || (wstate.state?.dark ?? []).length < 3), 25000),
    `strikes=${(wstate.state?.strikes ?? []).length} dark=${JSON.stringify((wstate.state?.dark ?? []).map(e => e.hp))}`);
  // The stop: a dark in claw reach of the standing unit holds
  // its ground across two samples.
  let stopped = false;
  {
    const s = realNow();
    while (realNow() - s < 30000 && !stopped) {
      const snap = new Map((wstate.state?.dark ?? []).map(e => [e.id, { ...e.pos }]));
      await sleep(500);
      const units = fieldOf(wstate, A.name);
      for (const e of wstate.state?.dark ?? []) {
        const was = snap.get(e.id);
        if (!was) continue;
        const nearUnit = units.some(u => distPx(e.pos, u.pos) <= 71);
        if (nearUnit && distPx(was, e.pos) < 0.6) { stopped = true; break; }
      }
    }
  }
  ok("the dark is STOPPED — come within claw reach of the standing light, it holds its ground and fights there", stopped);
  const burned = await tryWait(() => { const u = fieldOf(wstate, A.name)[0]; return !!u && ((u.shield ?? 0) < (u.maxShield ?? 0) || u.hp < u.maxHp); }, 30000);
  const uEnd = fieldOf(wstate, A.name)[0];
  const dEnd = (wstate.state?.dark ?? [])[0];
  ok("the shield BURNS BEFORE HP — harm taken shows on the shield, never as HP lost behind a full shield",
    burned && !!uEnd && !(uEnd.hp < uEnd.maxHp && (uEnd.shield ?? 0) >= (uEnd.maxShield ?? 0)),
    `unit=${JSON.stringify(uEnd ?? null)} darkDist=${uEnd && dEnd ? distPx(uEnd.pos, dEnd.pos).toFixed(0) : "n/a"} darkHp=${dEnd?.hp ?? "gone"}`);
  a.ws.close();
}

/* ══ §B THE ORDERS + §F WATERING ══════════════════════════ */
console.log("§B the orders at the Table — defence raises the works, leaving the order prunes them");
{
  const B = await mkTender("Port Defender", 800, "warden", "disc-port-b");
  await widen(B);
  fillers(B, 12, "BBench"); // a slow scene must never starve the purse the summons draw on
  const wallId = mkKin(B.ownerKey, B.name, "Wallbearer", bodyParts("stone", 1, 6));
  const thornId = mkKin(B.ownerKey, B.name, "Thornbearer", bodyParts("root", 1, 6));
  const tideId = mkKin(B.ownerKey, B.name, "Tidehand", bodyParts("tide", 0, 6));
  for (const id of [wallId, thornId, tideId]) await call("addToParty", { awakenedId: id }, B.token);
  const { wstate } = await watchRoom("port-b");
  const b = new Actor(); await b.join(B.tt, "port-b"); await b.waitYou("B's seat");
  await waitFor(() => !!seatOf(wstate, B.name)?.hex, "B's landing");
  // Wallbearer stands ALONE for the wall scenes: ranged
  // company would shoot the dark down on its approach,
  // before the wall could ever halt it.
  await summonStanding(b, wstate, B.name, wallId, "Wallbearer");
  await ensureBattle(b, wstate, "§B's wave", B.name);
  const wallUnit = () => fieldOf(wstate, B.name).find(u => u.name === "Wallbearer");
  const thornUnit = () => fieldOf(wstate, B.name).find(u => u.name === "Thornbearer");

  b.send({ type: "setStance", cardId: wallUnit().cardId, stance: "defense" });
  ok("the defence order rides the room — the state serves her stance",
    await tryWait(() => wallUnit()?.stance === "defense", 6000), JSON.stringify(wallUnit() ?? null));
  const rockStood = await tryWait(() => (wstate.state?.workings ?? []).some(w => w.engine === "rockwall"), 40000);
  const rock = (wstate.state?.workings ?? []).find(w => w.engine === "rockwall");
  ok("a Stone hand in defence RAISES A ROCKWALL — 3 stones at Lv 1, each raised at the homeland's level health (maxHp — a standing stone may already be hacked)",
    rockStood && !!rock && (rock.nodes ?? []).length === 3 && (rock.nodes ?? []).every(n => n.maxHp === rockWallHpForLevel(1)),
    JSON.stringify(rock?.nodes ?? null));
  // THE STAGE for the halt (a fixture sculpt, named): the
  // wave is thinned to ONE dark, made too tough to fall to
  // the Wallbearer's own strikes during the proof, and set
  // walking in from just beyond the wall's face — a full
  // wave crowds in from every side at once, and a wall
  // faces only one way, so the halt can never be read
  // cleanly off it.
  {
    const room = roomOf(B.ownerKey);
    const wall = (wstate.state?.workings ?? []).find(w => w.engine === "rockwall");
    if (room && wall?.nodes?.length) {
      const keep = [...room.dark.values()][0];
      if (keep) {
        for (const e of [...room.dark.values()]) if (e !== keep) room.dark.delete(e.id);
        keep.hp = 60; keep.maxHp = 60;
        const cx = wall.nodes.reduce((a, n) => a + n.x, 0) / wall.nodes.length;
        const cy = wall.nodes.reduce((a, n) => a + n.y, 0) / wall.nodes.length;
        // The dark steers for the nearest light — the
        // Tender's own figure included — so she is set on
        // the ray from the TENDER through the wall's centre:
        // every road she can take (to the Tender, to the
        // Wallbearer beside her, to the seed beyond) crosses
        // the wall's face. Set from the Wallbearer alone
        // (the earlier stage), her road to the Tender could
        // slip past the wall's end and the halt never came.
        const seat = [...room.players.values()].find(p => p.name === B.name);
        const ox = seat?.pos?.x ?? wallUnit()?.pos.x ?? cx, oy = seat?.pos?.y ?? wallUnit()?.pos.y ?? cy;
        const dx = cx - ox, dy = cy - oy;
        const len = Math.hypot(dx, dy) || 1;
        keep.pos = { x: cx + (dx / len) * 130, y: cy + (dy / len) * 130 };
        keep.target = null; keep.pinnedUntil = 0;
      }
    }
  }
  // The wall halts the walk: a dark come up against a living
  // stone holds its ground across two samples.
  let wallHalt = false;
  let haltDiag = "";
  {
    const s = realNow();
    let minNodeD = Infinity, minUnitD = Infinity, lastDarkHp = null;
    while (realNow() - s < 45000 && !wallHalt) {
      const nodes = ((wstate.state?.workings ?? []).find(w => w.engine === "rockwall")?.nodes ?? []).filter(n => n.hp > 0);
      const snap = new Map((wstate.state?.dark ?? []).map(e => [e.id, { ...e.pos }]));
      await sleep(500);
      const wu = wallUnit();
      for (const e of wstate.state?.dark ?? []) {
        const was = snap.get(e.id);
        if (!was) continue;
        if (nodes.length) minNodeD = Math.min(minNodeD, ...nodes.map(n => distPx(e.pos, n)));
        if (wu) minUnitD = Math.min(minUnitD, distPx(e.pos, wu.pos));
        lastDarkHp = e.hp;
        if (nodes.some(n => distPx(e.pos, n) <= 45) && distPx(was, e.pos) < 0.6) { wallHalt = true; break; }
      }
      if (!(wstate.state?.workings ?? []).some(w => w.engine === "rockwall")) { haltDiag = "wall fell mid-window"; break; }
    }
    if (!wallHalt && !haltDiag) haltDiag = `minNodeD=${minNodeD.toFixed(0)} minUnitD=${minUnitD.toFixed(0)} darkHp=${lastDarkHp} darks=${(wstate.state?.dark ?? []).length}`;
  }
  ok("the rockwall HALTS the dark's walk — against a living stone, it goes no farther", wallHalt, haltDiag);

  await summonStanding(b, wstate, B.name, thornId, "Thornbearer");
  await summonStanding(b, wstate, B.name, tideId, "Tidehand");
  await ensureBattle(b, wstate, "§B's wave stands", B.name);
  b.send({ type: "setStance", cardId: thornUnit().cardId, stance: "defense" });
  const brambleStood = await tryWait(() => (wstate.state?.workings ?? []).some(w => w.engine === "bramble"), 40000);
  const bramble = (wstate.state?.workings ?? []).find(w => w.engine === "bramble");
  const trueNodes = (bramble?.nodes ?? []).filter(n => !n.mote);
  const motes = (bramble?.nodes ?? []).filter(n => n.mote);
  ok("a Root hand in defence RAISES A BRAMBLE — one true node per worn part (3), three motes to a node (9)",
    brambleStood && trueNodes.length === 3 && motes.length === 9,
    `true=${trueNodes.length} motes=${motes.length}`);

  const rockBeforePrune = (wstate.state?.workings ?? []).some(w => w.engine === "rockwall");
  b.send({ type: "setStance", cardId: wallUnit().cardId, stance: "attack" });
  ok("leaving the defence order PRUNES her work in the same act — the rockwall comes down",
    rockBeforePrune && await tryWait(() => !(wstate.state?.workings ?? []).some(w => w.engine === "rockwall"), 6000),
    `rockwall stood before the order changed: ${rockBeforePrune}`);

  /* §F WATERING — the bramble stands (Thornbearer holds her
   * order). Tidehand must stand where the motes are in her
   * reach (3 hexes) but the dark fighting at the bramble
   * is NOT: she marches two tiles seed-ward of Thornbearer
   * — the motes cluster on the dark's side of the thicket,
   * so at two tiles the near fringe stands ~150px off (in
   * reach), and the dark held beyond the thicket ~420px
   * off (out of reach). Dice are pinned at 0.5: her three
   * tide parts roll d8 = 5 each, raw 15 — the bank takes
   * 15, the spread takes 10, 5 remains, and a tenth mote
   * stands. */
  console.log("§F watering at the Table — a Tide hand's strike banks on a mote and spreads it");
  {
    const tide = fieldOf(wstate, B.name).find(u => u.name === "Tidehand");
    const thornHex = thornUnit()?.hex;
    if (tide && thornHex) {
      const ringOfSeed = (id) => axDist(id, "0,0");
      const cands = (wstate.state?.map ?? []).filter(t => axDist(t.id, thornHex) === 2 && t.id !== "0,0");
      cands.sort((x, y) => ringOfSeed(x.id) - ringOfSeed(y.id));
      const dest = cands[0]?.id;
      if (dest && dest !== tide.hex) {
        b.send({ type: "march", from: tide.hex, to: dest, cardId: tide.cardId });
        await tryWait(() => fieldOf(wstate, B.name).find(u => u.name === "Tidehand")?.hex === dest, 12000);
      }
    }
  }
  // THE STAGE (a fixture sculpt, named as such): the wave
  // is thinned to ONE dark, made too tough to fall during
  // the proof, and set walking in from beyond the bramble
  // on Thornbearer's far side — so the battle stands, the
  // bramble raises, and the only question on the field is
  // the watering itself. A full wave crowds every reach
  // at once and the window can never be read cleanly. The
  // bramble's own books are also reset to the raised
  // thicket's first numbers (nine motes, every bank empty):
  // Tidehand stood beside the thicket through all of §B
  // with no dark in her reach, and her unpinned watering
  // in those minutes is real but unreadable — the pinned
  // proof starts from the thicket as raised.
  let keepId = null;
  {
    if (!wstate.state?.battle?.active) await ensureBattle(b, wstate, "§F's wave", B.name);
    const room = roomOf(B.ownerKey);
    if (room && room.dark.size > 0) {
      const keep = [...room.dark.values()][0];
      keepId = keep.id;
      for (const e of [...room.dark.values()]) if (e !== keep) room.dark.delete(e.id);
      keep.hp = 500; keep.maxHp = 500;
      const thorn = [...room.field.values()].find(u => u.card.name === "Thornbearer");
      const tide = [...room.field.values()].find(u => u.card.name === "Tidehand");
      if (thorn && tide) {
        const dx = thorn.pos.x - tide.pos.x, dy = thorn.pos.y - tide.pos.y;
        const len = Math.hypot(dx, dy) || 1;
        keep.pos = { x: thorn.pos.x + (dx / len) * 290, y: thorn.pos.y + (dy / len) * 290 };
        keep.target = null;
      }
      const work = room.workings.find(w => w.engine === "bramble");
      if (work?.nodes) {
        const trues = work.nodes.filter(n => !n.mote);
        const motes = work.nodes.filter(n => n.mote).slice(0, 9);
        for (const m of motes) m.bank = 0;
        work.nodes = [...trues, ...motes];
        work.hp = work.nodes.reduce((a, n) => a + n.hp, 0);
      }
    }
  }
  Math.random = () => 0.5;
  let watered = null;
  const pairsSeen = new Set();
  {
    const s = realNow();
    while (realNow() - s < 60000 && !watered) {
      const room = roomOf(B.ownerKey);
      // The kept dark is HELD where it stands (the Table's
      // own pin, re-laid by the drive's hand each pass) —
      // it can neither close on the company nor be clawed
      // into the watering reach; the bramble stays raised
      // on its engage and the battle stands on its one dark.
      if (room && keepId) { const e = room.dark.get(keepId); if (e) e.pinnedUntil = Date.now() + 60000; }
      const work = room?.workings.find(w => w.engine === "bramble");
      if (work?.nodes) {
        const living = work.nodes.filter(n => n.mote && n.hp > 0);
        const banked = work.nodes.find(n => n.mote && (n.bank ?? 0) > 0);
        if (banked) pairsSeen.add(`${living.length}/${banked.bank}`);
        if (living.length === 10 && banked) watered = { motes: living.length, bank: banked.bank };
      }
      if (!watered) await sleep(60);
    }
  }
  Math.random = realRandom;
  ok("watering BANKS AND SPREADS at the homeland's numbers — raw 15 in, 10 spent on a new mote (9 → 10 living), 5 left in the bank",
    !!watered && watered.motes === 10 && watered.bank === 5, JSON.stringify(watered) + " pairs=" + [...pairsSeen].join(","));
  b.ws.close();
}

console.log("§B2 binding — the binder mends the most-wounded of her own company in reach");
{
  const P = await mkTender("Port Plain", 150, "warden", "disc-port-p");
  fillers(P, 12, "PBench");
  const binderId = mkKin(P.ownerKey, P.name, "Skybinder", bodyParts("sky", 1, 6));
  const lambId = mkKin(P.ownerKey, P.name, "Lamb", stdParts("sky", 0, 8));
  for (const id of [binderId, lambId]) await call("addToParty", { awakenedId: id }, P.token);
  const { wstate } = await watchRoom("port-bind");
  const p = new Actor(); await p.join(P.tt, "port-bind"); await p.waitYou("P's seat");
  await waitFor(() => !!seatOf(wstate, P.name)?.hex, "P's landing");
  const binderUnit = await summonStanding(p, wstate, P.name, binderId, "Skybinder");
  const lambUnit = await summonStanding(p, wstate, P.name, lambId, "Lamb");
  // Both hold the binding order from the start: in attack
  // the binder would strike, and striking is the one thing
  // this proof must see her NOT do. Under binding with no
  // wounded ally, both simply wait.
  p.send({ type: "setStance", cardId: binderUnit.cardId, stance: "binding" });
  p.send({ type: "setStance", cardId: lambUnit.cardId, stance: "binding" });
  await tryWait(() => fieldOf(wstate, P.name).find(u => u.name === "Skybinder")?.stance === "binding", 6000);
  await ensureBattle(p, wstate, "§B2's wave", P.name);
  // THE STAGE (a fixture sculpt, named): the wave is
  // thinned to one dark, made too tough to fall and PINNED
  // where it stands far off (the Table's own pin) — the
  // battle stands on it, and it can neither wound nor be
  // wounded. The lamb's wound is laid by the drive's hand
  // (her shield spent, her health halved): earlier runs
  // marched her to the claws and the claws either never
  // reached her or felled her whole between samples — the
  // wound's arrival is staging; the mend under proof is
  // the binder's own road, run by the referee.
  let darkHp0 = null, hpAtWound = null;
  {
    const room = roomOf(P.ownerKey);
    if (room) {
      const keep = [...room.dark.values()][0];
      if (keep) {
        for (const e of [...room.dark.values()]) if (e !== keep) room.dark.delete(e.id);
        keep.hp = 500; keep.maxHp = 500; keep.pinnedUntil = Date.now() + 300000;
        darkHp0 = keep.hp;
      }
      const lamb = [...room.field.values()].find(u => u.card.name === "Lamb");
      if (lamb) { lamb.shield = 0; lamb.hp = Math.floor(lamb.maxHp / 2); hpAtWound = lamb.hp; }
    }
  }
  const lamb = () => fieldOf(wstate, P.name).find(u => u.name === "Lamb");
  const rose = hpAtWound != null && await tryWait(() => { const l = lamb(); return !!l && l.hp > hpAtWound; }, 20000);
  const roomEnd = roomOf(P.ownerKey);
  const darkUntouched = darkHp0 != null && roomEnd && [...roomEnd.dark.values()].every(e => e.hp === darkHp0);
  const stanceServed = fieldOf(wstate, P.name).find(u => u.name === "Skybinder")?.stance === "binding";
  ok("BINDING mends — under the binding order the wounded lamb's health RISES and the binder's hands deal no harm (no other mend stands in this room: no grove, no Heal cast, a starless Tender)",
    rose && stanceServed && darkUntouched === true,
    `hpAtWound=${hpAtWound} rose=${rose} stance=${stanceServed} darkUntouched=${darkUntouched}`);
  p.ws.close();
}

/* ══ §C THE FELL DOOR ═════════════════════════════════════ */
console.log("§C the fell door — one door pays every felling: the drop table whole, Shadow, the spoken take, Awokin XP divided by damage");
{
  const W = await mkTender("Port Witch", 800, "witch", "disc-port-w");
  let provokerId = 0;
  for (let i = 0; i < 30; i++) { const id = mkKin(W.ownerKey, W.name, `WBench ${i + 1}`, stdParts("sky", 2, 2)); if (i === 0) provokerId = id; }
  const { wstate } = await watchRoom("port-c");
  const w = new Actor(); await w.join(W.tt, "port-c"); await w.waitYou("W's seat");
  await waitFor(() => !!seatOf(wstate, W.name)?.hex, "W's landing");
  const shadowBefore = db.prepare("SELECT shadow_matter FROM tender_progress WHERE owner_key = ?").get(W.ownerKey)?.shadow_matter ?? 0;
  // A hand must stand to strike the curse (the 10:41
  // provoke ensureBattle opens with): the bench's first
  // hand is summoned for the blow. She stands through the
  // section — the staged fell's take is the door's, by
  // whichever of the witch's hands it is struck.
  await summonStanding(w, wstate, W.name, provokerId, "WBench 1");
  await ensureBattle(w, wstate, "§C's wave", W.name);
  // THE STAGE (a fixture sculpt, named): the swarm hunts
  // the strongest standing, so the wave is stood down to
  // ONE dark and that dark is made a Fray of 3 health —
  // three 1-damage bites fell exactly her, the fell under
  // proof is the swarm's own, and the take that follows it
  // is the door's, at the Fray's own numbers. (Earlier runs
  // set every dark to 3 health and the swarm lawfully took
  // the strongest — an Unraveler — whose take is a
  // different, also-correct set of numbers.) The battle
  // stands active, so the room lookup finds the seat.
  {
    const room = roomOf(W.ownerKey);
    if (room) {
      // The field's entry beat is pinned an hour out for
      // this section (a named fixture): the fell under
      // proof is struck on a known field, and dark
      // wandering in mid-scene would take strikes meant
      // for the staged foes — the entry's own law is
      // drive-table-entry's whole subject, proven there.
      room.entryAt = Date.now() + 3600000;
      const keep = [...room.dark.values()][0];
      for (const e of [...room.dark.values()]) if (e !== keep) room.dark.delete(e.id);
      if (keep) { keep.kind = "fray"; keep.label = "Fray"; keep.power = 1; keep.hp = 3; keep.maxHp = 3; }
    }
  }
  // Scene 1: the swarm fells a Fray. Cast at pinned 0.99
  // (the cast's own roll lands), then pin 0 before the
  // bites: every bite rolls its d4 = 1, three bites fell
  // the Fray (hp 3), and at the fell every drop die reads
  // 0 — every class fires, the guaranteed reagent is the
  // pantry's first good, Shadow's 20% fires. At pin 0 the
  // Tender's own weapon rolls a 1 and cannot steal the
  // fell. The attempt loops: if the swarm's quarry is
  // somehow lost, cast again, as a player would.
  const packFull = () => {
    const rows = db.prepare("SELECT item_key, qty FROM tender_inventory WHERE owner_key = ?").all(W.ownerKey);
    const of = (k) => rows.find(r => r.item_key === k)?.qty ?? 0;
    return of("pantry:shoal-salt") === 3 && of("rune-shard") === 1 && rows.some(r => r.item_key.startsWith("relic:"));
  };
  let swarmStood = false, takeTold = false;
  for (let attempt = 0; attempt < 4 && !takeTold; attempt++) {
    Math.random = () => 0.99;
    swarmStood = false;
    for (let i = 0; i < 14 && !swarmStood; i++) {
      const d = (wstate.state?.dark ?? [])[0];
      if (!d) { await ensureBattle(w, wstate, "§C's wave stands", W.name); continue; }
      w.send({ type: "castRune", root: "bats", hue: "unaligned", hexes: [d.hex], pour: 0 });
      swarmStood = await tryWait(() => (wstate.state?.workings ?? []).some(x => x.engine === "bats"), 2500);
    }
    if (!swarmStood) break;
    Math.random = () => 0;
    takeTold = await tryWait(() => packFull() && w.tale.some(t => /leaves behind/.test(t)), 40000);
  }
  Math.random = realRandom;
  ok("the swarm stands over the wave (cast at pinned dice)", swarmStood, JSON.stringify(w.errors.slice(-2)));
  const inv = db.prepare("SELECT item_key, qty FROM tender_inventory WHERE owner_key = ?").all(W.ownerKey);
  const invOf = (k) => inv.find(r => r.item_key === k)?.qty ?? 0;
  const shadowAfter = db.prepare("SELECT shadow_matter FROM tender_progress WHERE owner_key = ?").get(W.ownerKey)?.shadow_matter ?? 0;
  ok("the SPOKEN TAKE is told in the room's tale — 'leaves behind'", takeTold, w.tale.slice(-3).join(" | "));
  ok("the drop table pays WHOLE at the Table — guaranteed reagent + items + alchemy all land on the pantry's first good (Shoal Salt ×3 under the pin)",
    invOf("pantry:shoal-salt") === 3, JSON.stringify(inv));
  ok("a RUNE SHARD falls (10% class, pinned open) and a RELIC falls (5% class, pinned open)",
    invOf("rune-shard") === 1 && inv.some(r => r.item_key.startsWith("relic:") && r.qty === 1), JSON.stringify(inv));
  ok("SHADOW pays the homeland's road — the Fray's AC bonus over 10 (1), on its 20% roll (pinned open)",
    shadowAfter === shadowBefore + 1, `${shadowBefore} -> ${shadowAfter}`);
  w.ws.close();

  // Scene 2: two strikers, one pot. A fresh room, a plain
  // seat, two Lv 1 Sky hands at pinned 0.5 (every d20 = 11
  // — a hit, never a crit; every d4 = 3 — a strike is worth
  // exactly 7 through a Tangle's armor). The fell ledger
  // (read white-box off the room) names the dark both
  // hands have bloodied; the pot snapshot rides it.
  const S = await mkTender("Port Striker", 150, "warden", "disc-port-s");
  const firstId = mkKin(S.ownerKey, S.name, "First", stdParts("sky", 0, 6));
  const secondId = mkKin(S.ownerKey, S.name, "Second", stdParts("sky", 0, 6));
  for (const id of [firstId, secondId]) await call("addToParty", { awakenedId: id }, S.token);
  fillers(S, 12, "SBench");
  const { wstate: wstate2 } = await watchRoom("port-c2");
  const s2 = new Actor(); await s2.join(S.tt, "port-c2"); await s2.waitYou("S's seat");
  await waitFor(() => !!seatOf(wstate2, S.name)?.hex, "S's landing");
  await summonStanding(s2, wstate2, S.name, firstId, "First");
  await summonStanding(s2, wstate2, S.name, secondId, "Second");
  const xpOf = (id) => db.prepare("SELECT experience FROM awakened WHERE id = ?").get(id)?.experience ?? 0;
  const xp0a = xpOf(firstId), xp0b = xpOf(secondId);
  Math.random = () => 0.5;
  // THE STAGE (a fixture sculpt, named): the dealt wave is
  // stood down to TWO dark, both made Tangles of 8 health,
  // set standing together on one tile within both hands'
  // reach, and PINNED there (the Table's own pin) so no
  // claw ever interrupts the reckoning. At the pinned dice
  // every strike is worth exactly 7 (three sky d4 at 3,
  // through any dealt armor), so a Tangle falls to two
  // strikes — and the strike law's own tie-break (nearest,
  // then lowest health) walks both hands onto the same
  // quarry: the first strike bloodies her (8 → 1), the
  // second hand's strike, later in the same referee pass,
  // fells her with both names on the ledger. Each Tangle's
  // pot of 10 therefore divides exactly 5 and 5; two
  // Tangles pay each hand exactly 10. (The earlier garden
  // — lifting Frays out of live waves — drowned in the
  // deals' random kinds and later waves' growing counts;
  // the division under proof is the referee's, and it is
  // the same referee here.)
  await ensureBattle(s2, wstate2, "§C2's wave", S.name);
  {
    const room = roomOf(S.ownerKey);
    if (room) {
      const darks = [...room.dark.values()];
      const hands = [...room.field.values()];
      const anchor = hands[0]?.pos ?? { x: 0, y: 0 };
      // Both Tangles stand together at one point two hexes
      // seed-ward of the first hand — inside sky reach, at
      // exactly the same distance from both hands, so the
      // strike law's tie-break is the only chooser.
      const dx = 0 - anchor.x, dy = 0 - anchor.y;
      const len = Math.hypot(dx, dy) || 1;
      const spot = { x: anchor.x + (dx / len) * 130, y: anchor.y + (dy / len) * 130 };
      darks.forEach((e, i) => {
        if (i < 2) {
          e.kind = "tangle"; e.label = "Tangle"; e.power = 3; e.hp = 8; e.maxHp = 8;
          e.pos = { ...spot }; e.target = null; e.pinnedUntil = Date.now() + 600000;
        } else room.dark.delete(e.id);
      });
    }
  }
  const settled = await tryWait(() => (xpOf(firstId) - xp0a) + (xpOf(secondId) - xp0b) >= 20, 90000);
  await sleep(1500); // the pot is granted on the referee's async hand — let it land
  Math.random = realRandom;
  const gainA = xpOf(firstId) - xp0a, gainB = xpOf(secondId) - xp0b;
  ok("the felling pot DIVIDES BY DAMAGE — two Tangles shared by two strikers pay twenty XP in all, five and five twice over (no solo reading of either hand's gain exists)",
    settled && gainA === 10 && gainB === 10,
    `settled=${settled} gains=${gainA}+${gainB}`);
  s2.ws.close();
}

/* ══ §D THE GROWTH CYCLE ══════════════════════════════════ */
console.log("§D the seed at the Table grows BY FEEDING ONLY — the purse walks into the seed at the homeland's pace");
{
  const D = await mkTender("Port Feeder", 800, "warden", "disc-port-d");
  await widen(D);
  fillers(D, 20, "DBench"); // the bench feeds the purse: 10 + 20×2 = 50 max energy at the join
  const kinId = mkKin(D.ownerKey, D.name, "Nearhand", bodyParts("sky", 2, 6));
  await call("addToParty", { awakenedId: kinId }, D.token);
  const { wstate } = await watchRoom("port-d");
  const d = new Actor(); await d.join(D.tt, "port-d"); await d.waitYou("D's seat");
  await waitFor(() => !!seatOf(wstate, D.name)?.hex, "D's landing");
  // THE ROOM IS HELD EMPTY BY THE LIGHT (the entry law of
  // 2026-10-25 ended the era of naturally empty free
  // rooms: the field's own entry deals its trickle into
  // every free room, and a joined battle pays its own
  // economy into the purse this section reads — a broken
  // field pays the standing, a fell drips — so the climb
  // can no longer be read in an open room). The host
  // opens her land and lights its beacon BEFORE any
  // company is summoned: opening a land swaps the room's
  // ground whole and dismisses what stood on the old
  // ground, so the opening must come first (the hosted
  // drive's own order). While the light stands, no dark
  // is dealt by any door (Twelve #2's law, proven again
  // in drive-table-entry §6), and the room is battle-free
  // BY LAW, as this section's premise has always
  // required. The bank and the Shadow the burn drinks
  // are stocked white-box for the climb's whole stepped
  // span (named fixtures, the hosted drive's manner —
  // the banking road itself is proven by fells
  // elsewhere); the opening, the lighting, the hold and
  // the burn are production code.
  db.prepare("UPDATE tender_progress SET protection_bank_ms = 14400000, shadow_matter = 100 WHERE owner_key = ?").run(D.ownerKey);
  d.send({ type: "beaconOpen", privacy: "public" });
  await tryWait(() => wstate.state?.hosted?.hostName === D.name, 8000);
  d.send({ type: "beaconLight", lit: true });
  await waitFor(() => wstate.state?.hosted?.beacon?.lit === true && wstate.state?.hosted?.beacon?.standing === true, "the beacon lit over the climb's room");
  await summonStanding(d, wstate, D.name, kinId, "Nearhand");
  const unitHex = fieldOf(wstate, D.name)[0]?.hex;
  ok("her company stands within the feeding reach (two rings of the seed)",
    !!unitHex && axDist(unitHex, "0,0") <= 2, `unit=${unitHex}`);
  const energy0 = seatOf(wstate, D.name)?.energy ?? 0;
  ok("the purse she feeds from holds the seed's whole climb and more (bench-fed max energy)",
    energy0 >= 35, `energy=${energy0}`);
  // Step the clock: each +4 minutes of presence near the
  // seed gathers exactly one whole energy of credit
  // (4 × 0.25/min) — thirty steps carry the seed to the
  // Beacon. No fell is struck in this room at all (the
  // entered dark is barred by the light, never fought):
  // nothing but feeding can raise it here.
  let stubOff = 0;
  Date.now = () => realNow() + stubOff;
  let fedOk = true, stage15 = null, stage30 = null;
  try {
    for (let stepN = 1; stepN <= 30; stepN++) {
      stubOff += 4 * 60 * 1000;
      const rose = await tryWait(() => (wstate.state?.seed?.fedEnergy ?? 0) >= stepN, 8000);
      if (!rose) { fedOk = false; break; }
      if (stepN === 15) stage15 = { ...(wstate.state?.seed ?? {}) };
      if (stepN === 30) stage30 = { ...(wstate.state?.seed ?? {}) };
    }
  } finally { Date.now = realNow; }
  // If the climb stalled, say WHERE (run 6 stalled at zero
  // with the purse untouched, against every isolated
  // reading of the road). The seat lookup of the old diag
  // rode a standing battle, and under the light there is
  // none to ride — the diag reads what the wire carries:
  // the served seed and the served purse.
  let diag = "";
  if (!fedOk) {
    diag = ` [diag: ws=${d.ws.readyState} servedSeed=${JSON.stringify(wstate.state?.seed ?? null)} servedEnergy=${seatOf(wstate, D.name)?.energy} beacon=${JSON.stringify(wstate.state?.hosted?.beacon ?? null)}]`;
  }
  ok("feeding walks WHOLE energy from the purse into the seed, a point a step at the homeland's pace (0.25 a minute of near presence)",
    fedOk && (wstate.state?.seed?.fedEnergy ?? 0) === 30, `fed=${wstate.state?.seed?.fedEnergy}${diag}`);
  ok("at 15 fed the seed stands a SAPLING (level 2) — and its six neighbours stand PURIFIED by the rise",
    !!stage15 && stage15.level === 2 && stage15.stage === "sapling"
      && (wstate.state?.map ?? []).filter(t => axDist(t.id, "0,0") === 1).every(t => !t.cursed),
    JSON.stringify(stage15));
  ok("at 30 fed the seed stands a BEACON (level 3) — raised by feeding alone, no battle fought in this room",
    !!stage30 && stage30.level === 3 && stage30.stage === "beacon", JSON.stringify(stage30));
  const energy1 = seatOf(wstate, D.name)?.energy ?? 0;
  ok("the purse paid what the seed drank — 30 energy gone from it (a point of slack for the room's slow regen)",
    energy0 - energy1 >= 28, `${energy0} -> ${energy1}`);
  d.ws.close();
}

console.log("§D2 the Beacon's birth-bar — no dark is born within one ring of a level-3 seed");
{
  // RESTATED TO THE ENTRY LAW (2026-10-25): the wave door
  // this section once dealt by is removed, and the ground
  // law itself has changed — dark is dealt ONLY onto the
  // furthest cursed ring, on all tables, at every door.
  // The bar's proof therefore moves to the Storytender's
  // deal (a door that deals on demand) on ground sculpted
  // so the furthest cursed ring IS the seed's own ring:
  // every tile purified but the seed's six neighbours.
  // The stage is sculpted white-box (tile curse flags and
  // the seed's level on the room's own objects), as it was
  // before: on an unsculpted map the picker would offer
  // the rim, and a deal there can never show whether the
  // bar stands. The sculpt lands between two real deals:
  // a first deal raises the room's battle (its standing
  // battle is what lets the drive's hand reach the room at
  // all), its dark are lifted in one synchronous pass,
  // the map and the seed's level are set, and the second
  // deal is struck by the production referee onto the
  // sculpted ground. The code under proof — darkGround's
  // picker, its Beacon filter, and placeDark — is the
  // production code. A dev-named seat holds the
  // Storytender's chair; the bound Tender sits as the
  // participant whose seat the drive's hand reads.
  const devJoin = async (name, roomId) => {
    const c = { state: null, you: null, errors: [] };
    c.ws = new WebSocket("ws://127.0.0.1:3951/table/ws");
    await new Promise((res, rej) => { c.ws.onopen = res; c.ws.onerror = rej; });
    c.ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data));
        if (m.type === "state") { c.state = m.state; if (m.you) c.you = m.you; }
        else if (m.type === "error") c.errors.push(String(m.message ?? ""));
      } catch { /* torn frame */ }
    };
    c.send = (o) => c.ws.send(JSON.stringify(o));
    c.send({ type: "join", devName: name, room: roomId });
    const s = realNow();
    while (realNow() - s < 12000 && !c.you) await sleep(120);
    return c;
  };
  const sculpt = async (tender, roomId, level) => {
    const { wstate } = await watchRoom(roomId);
    const g = new Actor(); await g.join(tender.tt, roomId); await g.waitYou("seat in " + roomId);
    await waitFor(() => !!seatOf(wstate, tender.name)?.hex, "landing in " + roomId);
    const st = await devJoin("Port Storytender " + level, roomId);
    st.send({ type: "claimStoryteller" });
    await waitFor(() => !!st.you?.storytender, "the storytender's claim in " + roomId);
    st.send({ type: "stAdd", kind: "fray" });
    st.send({ type: "stDeal" });
    await waitFor(() => !!roomOf(tender.ownerKey), "the standing battle in " + roomId, 20000);
    const room = roomOf(tender.ownerKey);
    // One synchronous pass — no referee tick interleaves.
    for (const id of [...room.dark.keys()]) room.dark.delete(id);
    for (const t of room.map.values()) {
      t.cursed = axDist(t.id, "0,0") === 1;
      if (t.cursed) t.curseHp = t.curseMaxHp;
    }
    room.seedGrowth.level = level;
    // The emptied battle ends on the referee's own tick;
    // the second deal is struck onto the sculpted ground.
    await tryWait(() => !wstate.state?.battle?.active, 8000);
    for (let i = 0; i < 4; i++) st.send({ type: "stAdd", kind: "fray" });
    await waitFor(() => (st.you?.storytender?.reserve?.length ?? 0) === 4, "the reserve of four in " + roomId);
    st.send({ type: "stDeal" });
    await tryWait(() => (wstate.state?.dark ?? []).length > 0 || (room.pendingDark ?? []).length > 0, 12000);
    await sleep(400);
    const dealt = (wstate.state?.dark ?? []).map(e => e.hex);
    const held = (room.pendingDark ?? []).length;
    st.ws.close();
    g.ws.close();
    return { dealt, held };
  };
  const G = await mkTender("Port Guard", 150, "warden", "disc-port-g");
  const guardedDeal = await sculpt(G, "campaign-port-g3", 3);
  ok("at a level-3 seed the deal NEVER lands within one ring — the furthest cursed ring is the seed's own ring, wholly inside the Beacon's footprint, so no dark is born at all: four dealt, four held unborn",
    guardedDeal.dealt.length === 0 && guardedDeal.held === 4, JSON.stringify(guardedDeal));
  // The control room gets its OWN tender: a seat lookup by
  // owner key cannot tell two rooms' seats apart.
  const G2 = await mkTender("Port Guard Two", 150, "warden", "disc-port-g2");
  const openDeal = await sculpt(G2, "campaign-port-g1", 1);
  ok("the control: at a level-1 seed the same deal stands all four on the seed's own ring — the ground was lawful all along; the bar is the Beacon's, not the map's",
    openDeal.dealt.length === 4 && openDeal.dealt.every(h => axDist(h, "0,0") === 1) && openDeal.held === 0, JSON.stringify(openDeal));
}

/* ══ §E THE DEFENCE ROAD IS OUT ═══════════════════════════ */
console.log("§E the held-seed defence road is abolished — stands tally, nothing grows, nothing is banked");
{
  const E = await mkTender("Port Holder", 150, "warden", "disc-port-e");
  const nowE = Date.now();
  const seedTileId = Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, 0, 0, 'neutral', 0, ?)").run(E.ownerKey, nowE).lastInsertRowid);
  db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, 1, 0, 'neutral', 1, ?)").run(E.ownerKey, nowE);
  db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at, defenses) VALUES (?, ?, 2, 'held', ?, 0)").run(E.ownerKey, seedTileId, nowE);
  for (let i = 0; i < 3; i++) {
    const colId = Number(db.prepare("INSERT INTO incursion_columns (owner_key, target_tile_id, state, size, power, spawned_at, arrives_at) VALUES (?, ?, 'marching', 3, 1, ?, ?)").run(E.ownerKey, seedTileId, nowE, nowE).lastInsertRowid);
    await call("defeatIncursion", { columnId: colId }, E.token);
  }
  const seedRow = db.prepare("SELECT level, defenses FROM star_seeds WHERE owner_key = ?").get(E.ownerKey);
  const neighbour = db.prepare("SELECT cursed FROM territory_tiles WHERE owner_key = ? AND q = 1 AND r = 0").get(E.ownerKey);
  ok("three beaten columns at a held seed tally THREE STANDS — and the seed's level does not move (feeding is the only ladder)",
    seedRow.defenses === 3 && seedRow.level === 2, JSON.stringify(seedRow));
  ok("no neighbour tile is banked by the stands — the cursed neighbour stands cursed still",
    neighbour.cursed === 1, JSON.stringify(neighbour));
}

console.log(`\nTABLE BATTLE PORT DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
