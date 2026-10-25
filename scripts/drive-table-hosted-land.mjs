// HOSTED LAND — TWELVE #2'S DRIVE (2026-10-25).
// Boots the real server on a scratch DATA_DIR and proves
// hosted land at the Table, on the real Table surface
// (WebSocket rooms, the real referee, the real DB):
//   §A A HOST OPENS A PUBLIC LAND; A GUEST SEATS WITH NO
//      WORD, FIGHTS THE HOST'S DARK WITH THEIR OWN COMPANY,
//      AND THEIR FELL PAYS THEM — the guest's Pack grows,
//      the host's Pack and Shadow do not move, and the fell
//      banks its protection minute into the HOST's
//      lighthouse purse (the land's bounty, whoever's hand).
//      A curse-strike's thinning is written through at once.
//   §B THE LAND KEEPS EVERY CHANGE: the persisted record
//      (ui_config) holds the purified tile and the thinned
//      curse after the guest leaves; the host folds the
//      land away and opens it again, and the ground comes
//      back exactly as it was left.
//   §C XP DIVIDES BY OWNER: host and guest hands strike the
//      same dark on the host's land; the 10-XP pot splits
//      by their owners — five and five.
//   §D THE LIGHTHOUSE IS THE WHOLE HOMELAND MECHANISM: the
//      host lights it from the banked minutes, the light
//      HOLDS spawns (no dark is dealt while it burns — the
//      dealing door at a free table is now the field's own
//      entry, the entry law of 2026-10-25, and the light
//      holds it whole), a guest's hand cannot tend it,
//      four minutes of burn cost exactly 1 Shadow of
//      upkeep, the douse releases the ground to the entry
//      again — and an empty bank refuses the lighting in
//      the homeland's own words.
//   §E THE DOOR IS THE HOST'S SETTING: a password land
//      refuses a guest with no word and with a wrong word
//      (the room's own spoken refusal, naming the host), and
//      seats the guest who speaks the right one.
//   §F THE SEED ON HOSTED LAND FEEDS FROM THE GUEST'S
//      PURSE by the port's road: whole energy walks from
//      the guest's seat into the host's seed; the host's
//      purse is untouched; the record keeps the growth.
//   §G THE MEETING POINTS: a guest cannot open a land over
//      the host's, and no land opens in a campaign room.
// White-box reads ride partyBattleSeatFor and direct DB
// reads (the land record, the purses) where the wire cannot
// carry them; the behaviour asserted is always the server's.
// Fixture sculpts are named where they stand (the port
// drive's choreography: pinned dice, a thinned wave, a
// pinned dark) — the referee, the fell door, the bank and
// the record under proof are production code throughout.
// Run: node scripts/drive-table-hosted-land.mjs
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

const OUT = "/home/hatch/workspace/summon-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-hosted-"));
process.env.PORT = "3952";
process.env.WORKSHOP_PASSWORD = ["hosted", "drive", "pass"].join("-"); // the scratch server's workshop word (any value; the drive never uses it)
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3952";
const PW = "hosted-drive-password";
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
  .run(name, category, power, toughness, element, `hosted/${name}.png`, Date.now()).lastInsertRowid);
const mkKin = (ownerKey, ownerName, name, parts) => {
  const comp = JSON.stringify(parts.map(([category, element, power, toughness]) => ({
    source_id: `db:${partEl(`${name} ${category}`, category, power, toughness, element)}`,
    name: `${name} ${category}`, category, rarity: "common", power, toughness, element,
  })));
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, "hosted/awokin.png", comp, ownerName, ownerKey, Date.now()).lastInsertRowid);
};
const stdParts = (el, power, toughness) => [["body", el, power, toughness], ["arms", el, power, toughness], ["head", el, power, toughness]];
const bodyParts = (el, power, toughness) => [["body", el, power, toughness], ["arms", el, 0, toughness], ["head", el, 0, toughness]];

const { issueTableToken, partyBattleSeatFor } = await import("../server/dist/table.js");
const { summonersPowerFor } = await import("../server/dist/skills.js");
const { levelForExp } = await import("../server/dist/tenderExp.js");
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
const fillers = (t, n, tag) => { for (let i = 0; i < n; i++) mkKin(t.ownerKey, t.name, `${tag} ${i + 1}`, bodyParts("sky", 2, 2)); };

class Actor {
  constructor() { this.state = null; this.you = null; this.errors = []; this.joinErrors = []; }
  async join(tt, room, extra = {}) {
    this.ws = new WebSocket("ws://127.0.0.1:3952/table/ws");
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
/** Join expecting the door's answer: resolves with
 *  { seated: true } or { joinError } once either lands. */
async function joinProbe(tt, room, extra = {}, ms = 8000) {
  const a = new Actor();
  await a.join(tt, room, extra);
  const s = realNow();
  while (realNow() - s < ms) {
    if (a.you) { a.ws.close(); return { seated: true, actor: a }; }
    if (a.joinErrors.length) { const e = a.joinErrors[0]; try { a.ws.close(); } catch { /* already shut */ } return { seated: false, joinError: e }; }
    await sleep(120);
  }
  try { a.ws.close(); } catch { /* already shut */ }
  return { seated: false, joinError: null };
}
const waitFor = async (fn, what, ms = 20000) => { const s = realNow(); while (realNow() - s < ms) { let v = false; try { v = fn(); } catch { v = false; } if (v) return true; await sleep(120); } throw new Error("drive wait: " + what); };
const tryWait = async (fn, ms) => { try { await waitFor(fn, "tryWait", ms); return true; } catch { return false; } };
const parseAx = (id) => id.split(",").map(Number);
const axDist = (a, b) => { const [aq, ar] = parseAx(a); const [bq, br] = parseAx(b); return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(aq + ar - bq - br)); };
const roomOf = (ownerKey) => partyBattleSeatFor(ownerKey)?.room ?? null;

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

async function ensureBattle(actor, wstate, what, ownerName, opts = {}) {
  if (wstate.state?.battle?.active && (wstate.state?.dark ?? []).length > 0) return;
  // THE ENTRY LAW (2026-10-25): no word raises a battle at
  // a free table any more — the beginning-of-waves door is
  // removed, and the field's own entry deals the dark on
  // its 45-second beat — but only once the curse has been
  // struck (the 10:41 provoke). Raising a battle here is
  // striking the curse with a standing hand, then WAITING
  // for that beat: the wait spans a full beat and more,
  // and returns the moment dark stands. (The staged hands
  // of a section can fell an early trickle before this is
  // called; the next beat is the battle it waits for.)
  // A section whose own choreography already struck the
  // curse (opts.provoke === false — §A's thinning strike
  // IS host-a's provoke, struck before any battle) passes
  // it: the helper must not lay a second strike onto the
  // ground a section is measuring.
  if (ownerName && opts.provoke !== false) await provokeEntry(actor, wstate, ownerName);
  const dealt = await tryWait(() => wstate.state?.battle?.active && (wstate.state?.dark ?? []).length > 0, 60000);
  if (!dealt) throw new Error("no battle dealt for " + what + " | errors: " + JSON.stringify(actor.errors.slice(-3)));
}
function watchRoom(roomId) {
  const wstate = { state: null };
  const wws = new WebSocket("ws://127.0.0.1:3952/table/ws");
  return new Promise((resolve) => {
    wws.onopen = () => { wws.send(JSON.stringify({ type: "join", room: roomId, watch: true, name: "Hosted Watcher" })); resolve({ wstate, wws }); };
    wws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") wstate.state = m.state; } catch { /* torn frame */ } };
  });
}
const seatOf = (wstate, name) => wstate.state?.players.find((p) => p.name === name) ?? null;
const fieldOf = (wstate, name) => (wstate.state?.field ?? []).filter((u) => u.ownerName === name);
const landRecord = (ownerKey) => {
  const row = db.prepare("SELECT value FROM ui_config WHERE key = ?").get(`table.hosted.${ownerKey}`);
  return row ? JSON.parse(row.value) : null;
};
const progressOf = (ownerKey) => db.prepare("SELECT shadow_matter, protection_bank_ms, lighthouse_lit FROM tender_progress WHERE owner_key = ?").get(ownerKey);
const invOf = (ownerKey) => db.prepare("SELECT item_key, qty FROM tender_inventory WHERE owner_key = ? ORDER BY item_key").all(ownerKey);
const invQty = (ownerKey) => invOf(ownerKey).reduce((s, r) => s + r.qty, 0);

/* ══ §A THE PUBLIC LAND ═══════════════════════════════════ */
console.log("§A a host opens a public land — a guest seats, fights the host's dark with their own company, and is paid their own take");
const H = await mkTender("Land Host", 800, "warden", "disc-host-h");
const G = await mkTender("Land Guest", 800, "warden", "disc-host-g");
fillers(H, 12, "HBench");
fillers(G, 12, "GBench");
const hostHandId = mkKin(H.ownerKey, H.name, "Hosthand", stdParts("sky", 0, 6));
const guestHandId = mkKin(G.ownerKey, G.name, "Guesthand", bodyParts("sky", 2, 6));
await call("addToParty", { awakenedId: hostHandId }, H.token);
await call("addToParty", { awakenedId: guestHandId }, G.token);
const { wstate } = await watchRoom("host-a");
const h = new Actor(); await h.join(H.tt, "host-a"); await h.waitYou("the host's seat");
await waitFor(() => !!seatOf(wstate, H.name)?.hex, "the host's landing");
h.send({ type: "beaconOpen", privacy: "public" });
ok("the host opens their land — the room stands on it, named in the shared state",
  await tryWait(() => wstate.state?.hosted?.hostName === H.name && wstate.state?.hosted?.privacy === "public", 8000),
  JSON.stringify(wstate.state?.hosted ?? null));
ok("the opening is TOLD in the room's tale — the land counts changes for real",
  h.tale.some(t => /opens their land/.test(t)), h.tale.slice(-3).join(" | "));
ok("the keeper's own payload names them the land's host (landHost), and their door rides it",
  h.you?.landHost === true && h.you?.landDoor?.privacy === "public", JSON.stringify({ landHost: h.you?.landHost, landDoor: h.you?.landDoor }));

const g = new Actor(); await g.join(G.tt, "host-a"); await g.waitYou("the guest's seat");
ok("a guest seats at a PUBLIC land with no word spoken — their own Tender, their own seat",
  !!seatOf(wstate, G.name) && g.you?.landHost === false, JSON.stringify(g.joinErrors));
await waitFor(() => !!seatOf(wstate, G.name)?.hex, "the guest's landing on the host's land");

const guestUnit = await summonStanding(g, wstate, G.name, guestHandId, "Guesthand");
ok("the guest's own Awokin stands on the host's land", !!guestUnit, JSON.stringify(g.errors.slice(-2)));

// The thinning comes FIRST, before any battle is called —
// a curse-strike needs no battle, and striking first keeps
// the referee's own first blow from racing the proof. The
// expected thinning is read off the tile itself (its own
// curse measure, less her power of 2), not assumed.
let thinTile = null, thinHp0 = 0;
{
  const t = (wstate.state?.map ?? []).find(t => t.cursed && t.id !== "0,0" && axDist(guestUnit.hex, t.id) <= 4);
  thinTile = t?.id ?? null;
  thinHp0 = t?.curseHp ?? 0;
  if (thinTile) g.send({ type: "strikeCurse", hex: guestUnit.hex, target: thinTile, cardId: guestUnit.cardId });
}
ok("the guest's curse-strike THINS the host's curse — by exactly her power (the tile's measure, less 2, is served)",
  !!thinTile && await tryWait(() => (wstate.state?.map ?? []).find(t => t.id === thinTile)?.curseHp === thinHp0 - 2, 10000),
  `thinTile=${thinTile} hp0=${thinHp0} hp=${(wstate.state?.map ?? []).find(t => t.id === thinTile)?.curseHp}`);

// The fight: the guest's company fells the host's dark.
// (Fixture sculpt, named — the port drive's choreography:
// the wave is thinned to one Fray of 5 health, pinned at a
// point within the guest hand's reach; the referee's own
// strikes fell her, at dice pinned to 0.5.)
const hostProg0 = progressOf(H.ownerKey);
const guestProg0 = progressOf(G.ownerKey);
const hostInv0 = JSON.stringify(invOf(H.ownerKey));
const guestInvQty0 = invQty(G.ownerKey);
Math.random = () => 0.5;
await ensureBattle(g, wstate, "§A's wave on the host's land", G.name, { provoke: false }); // §A's thinning strike above is this room's provoke — no second strike onto measured ground
let darkHex = null;
{
  const room = roomOf(G.ownerKey);
  const darks = [...room.dark.values()];
  const keep = darks[0];
  for (const e of darks) if (e !== keep) room.dark.delete(e.id);
  keep.kind = "fray"; keep.label = "Fray"; keep.power = 1; keep.hp = 5; keep.maxHp = 5;
  const gu = [...room.field.values()].find(u => u.card.name === "Guesthand");
  const dx = 0 - gu.pos.x, dy = 0 - gu.pos.y;
  const len = Math.hypot(dx, dy) || 1;
  keep.pos = { x: gu.pos.x + (dx / len) * 130, y: gu.pos.y + (dy / len) * 130 };
  keep.target = null; keep.pinnedUntil = Date.now() + 600000;
}
// The dark's ground is read off the SERVED dark once the
// sculpt settles — the ground a fell purifies is the ground
// the dark stands on, and the sculpt moved where she stands.
await sleep(700);
darkHex = (wstate.state?.dark ?? [])[0]?.hex ?? null;
ok("the fell lands — the guest's hand fells the host's dark (the dark is gone from the field)",
  await tryWait(() => (wstate.state?.dark ?? []).length === 0, 40000),
  `dark=${(wstate.state?.dark ?? []).length} errors=${JSON.stringify(g.errors.slice(-2))}`);
Math.random = realRandom;
await sleep(1500); // the fell door's async hands (XP, notices) land
ok("the felled dark's tile stands PURIFIED on the host's land",
  (wstate.state?.map ?? []).find(t => t.id === darkHex)?.cursed === false,
  `tile=${darkHex} cursed=${(wstate.state?.map ?? []).find(t => t.id === darkHex)?.cursed}`);
const hostProg1 = progressOf(H.ownerKey);
const guestProg1 = progressOf(G.ownerKey);
ok("the guest's fell pays the GUEST's Pack — the guaranteed take lands in the guest's inventory",
  invQty(G.ownerKey) > guestInvQty0, `guest inv qty ${guestInvQty0} -> ${invQty(G.ownerKey)}`);
ok("NO HOST CUT: the host's Pack is exactly as it was, and the host's Shadow does not move",
  JSON.stringify(invOf(H.ownerKey)) === hostInv0 && hostProg1.shadow_matter === hostProg0.shadow_matter,
  `hostInv same=${JSON.stringify(invOf(H.ownerKey)) === hostInv0} shadow ${hostProg0.shadow_matter} -> ${hostProg1.shadow_matter}`);
ok("the guest's own Shadow take, if the 20% roll fired, is the guest's — never minded here; the LAND's bounty is protection: the host's lighthouse bank gains the Fray's minute exactly (+60000 ms)",
  hostProg1.protection_bank_ms === hostProg0.protection_bank_ms + 60000,
  `bank ${hostProg0.protection_bank_ms} -> ${hostProg1.protection_bank_ms}`);

/* ══ §B THE LAND KEEPS EVERY CHANGE ═══════════════════════ */
console.log("§B the land keeps every change — the record holds them after the guest leaves, and the reopened land is the land that was left");
{
  const rec = landRecord(H.ownerKey);
  const recTile = rec?.tiles.find(t => t.id === darkHex);
  const recThin = rec?.tiles.find(t => t.id === thinTile);
  ok("the persisted record holds the guest-purified tile PURIFIED (write-through, not at close)",
    !!rec && recTile?.cursed === false, `rec tile=${JSON.stringify(recTile ?? null)}`);
  ok("the persisted record holds the thinned curse at its thinned measure — losses and wear are kept too",
    !!rec && recThin?.curseHp === thinHp0 - 2, `rec thin=${JSON.stringify(recThin ?? null)} expected=${thinHp0 - 2}`);
  g.ws.close();
  await sleep(600);
  h.send({ type: "beaconClose" });
  ok("the host folds the land away — the room stands on the instanced world again",
    await tryWait(() => wstate.state?.hosted === null, 8000), JSON.stringify(wstate.state?.hosted ?? "still hosted"));
  h.send({ type: "beaconOpen", privacy: "public" });
  await tryWait(() => wstate.state?.hosted?.hostName === H.name, 8000);
  ok("reopened, the land is the land that was left — the guest's purified tile stands purified, the thinned curse stands thinned",
    (wstate.state?.map ?? []).find(t => t.id === darkHex)?.cursed === false
      && (wstate.state?.map ?? []).find(t => t.id === thinTile)?.curseHp === thinHp0 - 2,
    `tile cursed=${(wstate.state?.map ?? []).find(t => t.id === darkHex)?.cursed} thin hp=${(wstate.state?.map ?? []).find(t => t.id === thinTile)?.curseHp} expected=${thinHp0 - 2}`);
}

/* ══ §C XP DIVIDES BY OWNER ═══════════════════════════════ */
console.log("§C the felling pot divides BY OWNER — host and guest hands share one dark on the host's land");
{
  // The guest's §C hand is a power-0 sky hand, the port's
  // §C2 fixture exactly: a strike's worth is its dice alone
  // (the §A hand carries power 2 for her curse-strike, and
  // power rides a strike's damage — she would skew the
  // ledger the division reads).
  const guestHand2Id = mkKin(G.ownerKey, G.name, "Guesthand Two", stdParts("sky", 0, 6));
  await call("addToParty", { awakenedId: guestHand2Id }, G.token);
  const g2 = new Actor(); await g2.join(G.tt, "host-a"); await g2.waitYou("the guest returns");
  await waitFor(() => !!seatOf(wstate, G.name)?.hex, "the guest's landing again");
  await summonStanding(h, wstate, H.name, hostHandId, "Hosthand");
  await summonStanding(g2, wstate, G.name, guestHand2Id, "Guesthand Two");
  const xpOf = (id) => db.prepare("SELECT experience FROM awakened WHERE id = ?").get(id)?.experience ?? 0;
  const xpH0 = xpOf(hostHandId), xpG0 = xpOf(guestHand2Id);
  Math.random = () => 0.5;
  await ensureBattle(h, wstate, "§C's wave", H.name, { provoke: false }); // host-a's curse was struck in §A — its entry is already live; the helper only waits
  {
    // THE STAGE (a fixture sculpt, named — the port's §C2
    // choreography, across two seats): the wave is stood
    // down to ONE Tangle of 8 health; both hands are set
    // standing on the host's landing tile (white-box
    // standings — where they stand is the fixture; the
    // strikes are the referee's), their cadences aligned,
    // and the Tangle pinned 130px seed-ward of them. At the
    // pinned dice each sky hand's strike is worth 7 through
    // a Tangle's armour: the first strike bloodies her
    // (8 → 1), the second hand's fells her — both owners on
    // the ledger, the pot of 10 split five and five.
    const room = roomOf(H.ownerKey);
    const darks = [...room.dark.values()];
    const keep = darks[0];
    for (const e of darks) if (e !== keep) room.dark.delete(e.id);
    keep.kind = "tangle"; keep.label = "Tangle"; keep.power = 3; keep.hp = 8; keep.maxHp = 8;
    const hands = [...room.field.values()].filter(u => ["Hosthand", "Guesthand Two"].includes(u.card.name));
    const anchor = hands[0].pos;
    const dx = 0 - anchor.x, dy = 0 - anchor.y;
    const len = Math.hypot(dx, dy) || 1;
    keep.pos = { x: anchor.x + (dx / len) * 130, y: anchor.y + (dy / len) * 130 };
    keep.target = null; keep.pinnedUntil = Date.now() + 600000;
    for (const u of hands) {
      u.pos = { x: anchor.x + (u.card.name === "Guesthand Two" ? 18 : -18), y: anchor.y };
      u.hex = hands[0].hex;
      u.target = null;
      u.nextStrike = Date.now();
    }
  }
  const settled = await tryWait(() => (xpOf(hostHandId) - xpH0) + (xpOf(guestHand2Id) - xpG0) >= 10, 60000);
  await sleep(1500);
  Math.random = realRandom;
  const gainH = xpOf(hostHandId) - xpH0, gainG = xpOf(guestHand2Id) - xpG0;
  ok("the pot divides BY OWNER — the host's hand and the guest's hand each drink 5 of the shared fell's 10",
    settled && gainH === 5 && gainG === 5, `settled=${settled} gains host=${gainH} guest=${gainG}`);
  g2.ws.close();
}

/* ══ §D THE LIGHTHOUSE ════════════════════════════════════ */
console.log("§D the lighthouse at the Table is the whole homeland mechanism — bank, light, held spawns, Shadow upkeep");
{
  // The bank §A's fell stocked (one minute) is real but
  // short; stock it white-box for the burn reckoning (the
  // banking road itself was proven by the fell in §A), and
  // give the keeper Shadow to pay upkeep with.
  db.prepare("UPDATE tender_progress SET protection_bank_ms = 600000, shadow_matter = 10 WHERE owner_key = ?").run(H.ownerKey);
  await sleep(400); // a pulse refresh reads the purse fresh
  const g3 = new Actor(); await g3.join(G.tt, "host-a"); await g3.waitYou("the guest at the lighting");
  g3.send({ type: "beaconLight", lit: true });
  ok("a GUEST's hand cannot tend the host's light — the refusal names whose hand it is",
    await tryWait(() => g3.errors.some(e => /'s to tend/.test(e)), 6000), JSON.stringify(g3.errors.slice(-2)));
  h.send({ type: "beaconLight", lit: true });
  ok("the host lights the beacon FROM THE BANK — lit and standing in the served state, the keeper's purse served with it",
    await tryWait(() => wstate.state?.hosted?.beacon?.lit === true && wstate.state?.hosted?.beacon?.standing === true, 8000),
    JSON.stringify(wstate.state?.hosted?.beacon ?? null));
  // THE HOLD, RESTATED TO THE ENTRY LAW (2026-10-25): the
  // beginning-of-waves button is gone — no startWave word
  // exists to refuse. The dealing door at a free table is
  // now the field's own entry, and the light's law is what
  // it always was: NO DARK IS DEALT onto lit ground, by
  // any door. Whatever the entry dealt before the lighting
  // is lifted by the drive's hand (a named sculpt — the
  // light bars deals, it does not unmake standing dark);
  // from the lit moment the window is watched: nothing
  // enters, and no battle is joined.
  let roomD = roomOf(H.ownerKey);
  if (roomD) for (const id of [...roomD.dark.keys()]) roomD.dark.delete(id);
  await tryWait(() => wstate.state?.battle?.active !== true, 8000);
  let heldClean = true;
  for (let i = 0; i < 8; i++) {
    await sleep(500);
    if ((wstate.state?.dark ?? []).length !== 0 || wstate.state?.battle?.active === true) { heldClean = false; break; }
  }
  ok("while the light burns, NO DARK IS DEALT — the field's own entry is held whole: the field stays empty and no battle is joined",
    heldClean && (wstate.state?.dark ?? []).length === 0 && wstate.state?.battle?.active !== true,
    `dark=${(wstate.state?.dark ?? []).length} active=${wstate.state?.battle?.active}`);
  // Four minutes of burn, reckoned by the pulse's own
  // settle: the settled stamp is set back four minutes
  // (white-box — the minutes themselves are the fixture;
  // the burn, the cap and the upkeep are production law).
  db.prepare("UPDATE tender_progress SET lighthouse_settled_at = ? WHERE owner_key = ?").run(Date.now() - 4 * 60 * 1000, H.ownerKey);
  const burned = await tryWait(() => progressOf(H.ownerKey).shadow_matter === 9, 8000);
  const progAfterBurn = progressOf(H.ownerKey);
  ok("the upkeep is the homeland's — 1 Shadow per 4 minutes: four minutes of light cost exactly 1 Shadow",
    burned && progAfterBurn.shadow_matter === 9, `shadow=${progAfterBurn.shadow_matter}`);
  ok("the burn drank from the BANK — ten banked minutes stand near six after four minutes of light",
    progAfterBurn.protection_bank_ms > 340000 && progAfterBurn.protection_bank_ms < 380000,
    `bank=${progAfterBurn.protection_bank_ms}`);
  h.send({ type: "beaconLight", lit: false });
  ok("the douse lands — the light goes out and its unburned minutes stay banked",
    await tryWait(() => wstate.state?.hosted?.beacon?.lit === false && progressOf(H.ownerKey).protection_bank_ms > 300000, 8000),
    `lit=${wstate.state?.hosted?.beacon?.lit} bank=${progressOf(H.ownerKey).protection_bank_ms}`);
  // With the light out, the field's own entry deals again
  // on its own beat, unpressed and untouched by any
  // fixture: the wait spans a full beat and more (the
  // beat's phase at the douse is the field's own, not
  // this section's to set).
  ok("doused, the ground is dealt again — the field's own entry returns with no hand on any door: the hold was the light's, and it is released",
    await tryWait(() => (wstate.state?.dark ?? []).length > 0, 60000), `dark=${(wstate.state?.dark ?? []).length}`);
  g3.ws.close();
  h.ws.close();
}
{
  // An empty bank refuses the lighting in the homeland's
  // own words (setLighthouse's refusal, verbatim).
  const H2 = await mkTender("Dark Keeper", 150, "warden", "disc-host-h2");
  const { wstate: wstate2 } = await watchRoom("host-d2");
  const h2 = new Actor(); await h2.join(H2.tt, "host-d2"); await h2.waitYou("the dark keeper's seat");
  await waitFor(() => !!seatOf(wstate2, H2.name)?.hex, "the dark keeper's landing");
  h2.send({ type: "beaconOpen", privacy: "public" });
  await tryWait(() => wstate2.state?.hosted?.hostName === H2.name, 8000);
  h2.send({ type: "beaconLight", lit: true });
  ok("an empty bank refuses the lighting in the homeland's own words — 'stands dark for want of banked protection'",
    await tryWait(() => h2.errors.some(e => /stands dark for want of banked protection/.test(e)), 6000),
    JSON.stringify(h2.errors.slice(-2)));
  h2.ws.close();
}

/* ══ §E THE PASSWORD DOOR ═════════════════════════════════ */
console.log("§E the door is the host's setting — a kept land checks the word when a guest sits, ours, never Discord's");
{
  const H3 = await mkTender("Word Keeper", 150, "warden", "disc-host-h3");
  const G3 = await mkTender("Word Guest", 150, "warden", "disc-host-g3");
  const { wstate: wstate3 } = await watchRoom("host-b");
  const h3 = new Actor(); await h3.join(H3.tt, "host-b"); await h3.waitYou("the word keeper's seat");
  await waitFor(() => !!seatOf(wstate3, H3.name)?.hex, "the word keeper's landing");
  h3.send({ type: "beaconOpen", privacy: "password", password: "uncle-word" });
  ok("the host opens a land KEPT BY A WORD — the shared state names its door",
    await tryWait(() => wstate3.state?.hosted?.hostName === H3.name && wstate3.state?.hosted?.privacy === "password", 8000),
    JSON.stringify(wstate3.state?.hosted ?? null));
  const noWord = await joinProbe(G3.tt, "host-b");
  ok("a guest with NO word is refused at the door — joinError asks for the word, in the room's own spoken refusal naming the host",
    noWord.seated === false && noWord.joinError?.needsPassword === true && /Word Keeper's land/.test(noWord.joinError?.message ?? "") && !seatOf(wstate3, G3.name),
    JSON.stringify(noWord.joinError ?? null));
  const wrongWord = await joinProbe(G3.tt, "host-b", { tablePassword: "a-guessed-word" });
  ok("a WRONG word is refused the same way — 'that is not the word', and no seat is made",
    wrongWord.seated === false && wrongWord.joinError?.needsPassword === true && /not the word/.test(wrongWord.joinError?.message ?? "") && !seatOf(wstate3, G3.name),
    JSON.stringify(wrongWord.joinError ?? null));
  const g3 = new Actor(); await g3.join(G3.tt, "host-b", { tablePassword: "uncle-word" }); await g3.waitYou("the guest seats by the word");
  ok("the RIGHT word seats the guest on the kept land — their own Tender, on the host's real ground",
    !!seatOf(wstate3, G3.name) && wstate3.state?.hosted?.hostName === H3.name, JSON.stringify(g3.joinErrors));
  g3.ws.close();
  h3.ws.close();
}

/* ══ §F THE GUEST FEEDS THE HOST'S SEED ═══════════════════ */
console.log("§F a seed on hosted land feeds from the GUEST's purse, by the port's road — and the growth is the host land's");
{
  const H4 = await mkTender("Seed Host", 800, "warden", "disc-host-h4");
  const G4 = await mkTender("Seed Guest", 800, "warden", "disc-host-g4");
  fillers(H4, 20, "H4Bench");
  fillers(G4, 20, "G4Bench");
  const { wstate: wstate4 } = await watchRoom("host-f");
  const h4 = new Actor(); await h4.join(H4.tt, "host-f"); await h4.waitYou("the seed host's seat");
  await waitFor(() => !!seatOf(wstate4, H4.name)?.hex, "the seed host's landing");
  h4.send({ type: "beaconOpen", privacy: "public" });
  await tryWait(() => wstate4.state?.hosted?.hostName === H4.name, 8000);
  const g4 = new Actor(); await g4.join(G4.tt, "host-f"); await g4.waitYou("the seed guest's seat");
  await waitFor(() => !!seatOf(wstate4, G4.name)?.hex, "the seed guest's landing");
  // THE ROOM IS HELD EMPTY BY THE LIGHT (the entry law of
  // 2026-10-25, as in the port drive's §D): the field's own
  // entry deals into every free room, and a joined battle
  // would pay its own economy into the purses this section
  // reads. The host lights her beacon — while it stands,
  // no dark is dealt by any door, and the climb is read on
  // the feeding road alone. The bank and Shadow the burn
  // drinks are stocked white-box (named fixtures, §D's
  // manner); the lighting and the hold are production code.
  db.prepare("UPDATE tender_progress SET protection_bank_ms = 3600000, shadow_matter = 50 WHERE owner_key = ?").run(H4.ownerKey);
  h4.send({ type: "beaconLight", lit: true });
  await waitFor(() => wstate4.state?.hosted?.beacon?.lit === true && wstate4.state?.hosted?.beacon?.standing === true, "the beacon lit over the feeding room");
  // The light bars DEALS; it does not unmake standing
  // dark. What the entry dealt before the lighting is
  // lifted once, by the drive's hand, in one synchronous
  // pass (no ending reckoned, no fell struck) — from here
  // the room stays empty by the light's law alone.
  {
    const room = roomOf(G4.ownerKey);
    if (room) {
      for (const id of [...room.dark.keys()]) room.dark.delete(id);
      if (room.battle.timer) { clearInterval(room.battle.timer); room.battle.timer = null; }
      room.battle.active = false;
    }
  }
  // The purse baselines are read HERE — after the room is
  // held empty: until the lift, the guest's hand was
  // fighting the entry's dark on its own law, and a fell
  // struck in that window pays its economy into the very
  // purses this section reads. From the lift on, only the
  // feeding road and the room's slow regen can move them.
  // THE FEEDER IS THE GUEST'S OWN FIGURE, ON THE HEX
  // (Nigel, 2026-10-25: feeding is the Tender on the hex
  // alone — the company draw this section once rode was
  // struck 12:19). She takes the stand by the real glide
  // road: to the seed's neighbour, then toward the far
  // side, stopped mid-crossing (glideStop) on the seed's
  // own tile — the glide law's refusal of the seed tile
  // as a glide's END untouched. Centres are the analytic
  // ones the tender-standing drive derives: centre(q,r)
  // = q·ISO_E + r·ISO_SE on the Table's iso basis.
  const KF = 40 / 796;
  const centerOfF = (id) => { const [q, r] = parseAx(id); return { x: q * 1292 * KF, y: q * 470 * KF + r * 948 * KF }; };
  const DIRS6 = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const guestPos = () => (g4.state?.players ?? []).find(p => p.name === G4.name)?.pos ?? (wstate4.state?.players ?? []).find(p => p.name === G4.name)?.pos;
  const nearF = DIRS6.map(([dq, dr]) => `${dq},${dr}`).sort((a, b) => {
    const pa = guestPos() ?? { x: 0, y: 0 };
    return Math.hypot(centerOfF(a).x - pa.x, centerOfF(a).y - pa.y) - Math.hypot(centerOfF(b).x - pa.x, centerOfF(b).y - pa.y);
  })[0];
  const [nqF, nrF] = parseAx(nearF);
  const oppF = `${-nqF},${-nrF}`;
  g4.send({ type: "glide", tx: centerOfF(nearF).x, ty: centerOfF(nearF).y });
  await waitFor(() => seatOf(wstate4, G4.name)?.hex === nearF, "the guest's arrival at the seed's neighbour", 30000);
  g4.send({ type: "glide", tx: centerOfF(oppF).x, ty: centerOfF(oppF).y });
  let stoppedF = false;
  {
    const s0 = realNow();
    while (realNow() - s0 < 20000) {
      const me = (g4.state?.players ?? []).find(p => p.name === G4.name) ?? seatOf(wstate4, G4.name);
      if (me?.hex === "0,0") { g4.send({ type: "glideStop" }); stoppedF = true; break; }
      await sleep(40);
    }
    await sleep(800);
  }
  ok("the GUEST's own figure stands ON the host's seed tile — the only feeding stand there is",
    stoppedF && seatOf(wstate4, G4.name)?.hex === "0,0", `hex=${seatOf(wstate4, G4.name)?.hex}`);
  const guestEnergy0 = seatOf(wstate4, G4.name)?.energy ?? 0;
  const hostEnergy0 = seatOf(wstate4, H4.name)?.energy ?? 0;
  ok("the guest's purse holds the feed and more", guestEnergy0 >= 8, `energy=${guestEnergy0}`);
  // Step the clock at the GUEST's own standing rate (read
  // off the live summoning measure, as the port's §D
  // reads it): each stride is one whole energy of credit
  // from the purse of the Tender who stands on the hex —
  // here, the GUEST's.
  const strideF = Math.round(60000 / (5 + 0.5 * summonersPowerFor(G4.ownerKey, levelForExp(800), "warden"))) + 40;
  let stubOff = 0;
  Date.now = () => realNow() + stubOff;
  let fedOk = true;
  try {
    for (let stepN = 1; stepN <= 6; stepN++) {
      stubOff += strideF;
      // No hand is needed in the loop: the lit beacon
      // holds the room empty by law (above), so no battle
      // can pay its economy into the purses this section
      // reads — the feeding road under proof is the
      // purse's, and it is not read through a battle.
      const rose = await tryWait(() => (wstate4.state?.seed?.fedEnergy ?? 0) >= stepN, 8000);
      if (!rose) { fedOk = false; break; }
    }
  } finally { Date.now = realNow; }
  ok("the host's seed GREW on the guest's feeding — six whole energy walked the port's road",
    fedOk && (wstate4.state?.seed?.fedEnergy ?? 0) === 6, `fed=${wstate4.state?.seed?.fedEnergy}`);
  const guestEnergy1 = seatOf(wstate4, G4.name)?.energy ?? 0;
  const hostEnergy1 = seatOf(wstate4, H4.name)?.energy ?? 0;
  ok("the GUEST's purse paid what the seed drank (a point of slack for the room's slow regen)",
    guestEnergy0 - guestEnergy1 >= 4, `${guestEnergy0} -> ${guestEnergy1}`);
  ok("the HOST's purse paid nothing — feeding on hosted land draws on the feeder's own purse",
    hostEnergy1 >= hostEnergy0, `${hostEnergy0} -> ${hostEnergy1}`);
  ok("the growth is WRITTEN INTO THE HOST'S LAND RECORD — the seed's fed measure stands in the persisted land",
    (landRecord(H4.ownerKey)?.seedGrowth?.fedEnergy ?? 0) === 6,
    `record fed=${landRecord(H4.ownerKey)?.seedGrowth?.fedEnergy}`);
  g4.ws.close();
  h4.ws.close();
}

/* ══ §G THE MEETING POINTS ════════════════════════════════ */
console.log("§G the meeting points — no land over another's, and no land in a campaign room");
{
  const H5 = await mkTender("First Host", 150, "warden", "disc-host-h5");
  const G5 = await mkTender("Second Claimant", 150, "warden", "disc-host-g5");
  const { wstate: wstate5 } = await watchRoom("host-g");
  const h5 = new Actor(); await h5.join(H5.tt, "host-g"); await h5.waitYou("the first host's seat");
  await waitFor(() => !!seatOf(wstate5, H5.name)?.hex, "the first host's landing");
  h5.send({ type: "beaconOpen", privacy: "public" });
  await tryWait(() => wstate5.state?.hosted?.hostName === H5.name, 8000);
  const g5 = new Actor(); await g5.join(G5.tt, "host-g"); await g5.waitYou("the claimant's seat");
  g5.send({ type: "beaconOpen", privacy: "public" });
  ok("a guest cannot open a land OVER the host's — the refusal names the standing land",
    await tryWait(() => g5.errors.some(e => /already stands on First Host's land/.test(e)), 6000),
    JSON.stringify(g5.errors.slice(-2)));
  g5.ws.close();
  h5.ws.close();

  const C = await mkTender("Campaign Tender", 150, "warden", "disc-host-c");
  const { wstate: wstate6 } = await watchRoom("campaign-host-z");
  const c = new Actor(); await c.join(C.tt, "campaign-host-z"); await c.waitYou("the campaign seat");
  c.send({ type: "beaconOpen", privacy: "public" });
  ok("no land opens in a CAMPAIGN room — the campaign keeps its own ground, and the refusal says so",
    await tryWait(() => c.errors.some(e => /campaign room keeps its own ground/.test(e)), 6000),
    JSON.stringify(c.errors.slice(-2)));
  c.ws.close();
}

console.log(`\nHOSTED LAND DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
