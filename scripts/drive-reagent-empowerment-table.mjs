// REAGENT EMPOWERMENT — THE TABLE HALF (Nigel's law,
// 2026-10-25 10:22; the Table half ruled 2026-10-26,
// Fork A, in his words: "Table: empower from my own
// pouch"): the homeland build wired the empowerment into
// the homeland cast door and flagged the Table fork
// loudly; this drive proves the Table half at the real
// Table, through the real cast doors (castHeal / castWard
// / castRune), against the caster's OWN tender_inventory
// — the pouch Table claims land in — never the room's
// shared Pack.
//   §0 the reckoning read off the built modules: the sets
//      of record, the ceil halving, Heal and the Coil
//      holding no set, and the unbound stand — a seat with
//      no Tender behind it (expKey null) counts NOTHING,
//      while a bound pouch full of a set counts active.
//   §A the ward door: a bound Warden with Bulwark's full
//      set casts at ceil-half (8 → 4), the set leaves HER
//      OWN pouch by exactly its line per attempt (a surplus
//      stands untouched), a bound roommate's pouch and the
//      room's shared Pack do not move a hair.
//   §B the rune door + the +2: one Lv 3 Warden casts Shard
//      Rain plain (pouch empty: 5 an attempt, mod as the
//      tale names it), then empowered (full set: ceil-half
//      5 → 3 an attempt, the set consumed per attempt,
//      fizzle attempts included) — and the empowered
//      unravel tale's mod stands exactly +2 over the plain
//      one's, the DC unmoved.
//   §C a partial set changes nothing: full price, nothing
//      consumed.
//   §D the unbound seat: a Discord guest with no bind
//      meets the same Lv 3 ward refusal it has always met,
//      and no pouch in the room and no Pack entry moves.
//   §E refusals spend nothing: a ward aimed at a non-edge,
//      a rune cast naming no hex, and a purse that cannot
//      pay the empowered price each leave the pouch and
//      the purse exactly as they stood.
//   §F the Witch at the Table: her company price reckons
//      first and the empowerment halves THAT (the homeland
//      composition), and when her empowered cast unravels,
//      her miscast mercy's return is half the EMPOWERED
//      charge — the tale names it — never half the sticker.
// Run: node scripts/drive-reagent-empowerment-table.mjs
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-reagent-table-"));
process.env.PORT = "3995";
process.env.WORKSHOP_PASSWORD = "reagent-table-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3995";
const PW = "reagent-table-drive-password";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return data?.data ?? data;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up */ }

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
const parseHex = (id) => { const [q, r] = String(id).split(",").map(Number); return { q, r }; };
const DIRS6 = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

function seedAwokin(ownerKey, tenderName, name, element, power = 1) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, power, power, element, `reptable/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power, toughness: power, element });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `reptable/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}

async function claim(name, exp, classKey) {
  const c = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(c.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  const now = Date.now();
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, exp, now);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(ownerKey, now);
  seedAwokin(ownerKey, name, `${name} Wake One`, "root");
  seedAwokin(ownerKey, name, `${name} Wake Two`, "root");
  seedAwokin(ownerKey, name, `${name} Wake Three`, "root");
  if (classKey) await call("chooseClass", { classKey }, c.token);
  return { token: c.token, ownerKey, tenderId, name };
}

const { issueTableToken } = await import("../server/dist/table.js");
async function mkTableTender(name, exp, discId, classKey, bench = 0) {
  const t = await claim(name, exp, classKey);
  for (let i = 0; i < bench; i++) seedAwokin(t.ownerKey, name, `${name} Bench ${i + 1}`, "root");
  const tt = issueTableToken({ id: discId, name });
  const bindCode = (await call("getTableBindCode", {}, t.token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
  if (!bindRes.ok) throw new Error("table/bind failed for " + name + ": " + bindRes.status);
  return { ...t, tt };
}

const invOf = (ownerKey, itemKey) => db.prepare("SELECT qty FROM tender_inventory WHERE owner_key = ? AND item_key = ?").get(ownerKey, itemKey)?.qty ?? 0;
const setInv = db.prepare("INSERT INTO tender_inventory (owner_key, item_key, qty, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(owner_key, item_key) DO UPDATE SET qty = excluded.qty, updated_at = excluded.updated_at");
const stock = (ownerKey, itemKey, qty) => setInv.run(ownerKey, itemKey, qty, Date.now());

class Actor {
  constructor() { this.state = null; this.you = null; this.errors = []; }
  async join(token, room) {
    this.ws = new WebSocket(`ws://127.0.0.1:3995/table/ws`);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data));
        if (m.type === "state") { this.state = m.state; this.you = m.you; }
        else if (m.type === "error") this.errors.push(String(m.message ?? ""));
      } catch { /* torn frame */ }
    };
    this.send({ type: "join", authToken: token, room });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
}
const waitFor = async (fn, what, ms = 20000) => {
  const s = Date.now();
  while (Date.now() - s < ms) { if (fn()) return true; await sleep(150); }
  throw new Error("drive wait: " + what);
};
const myPlayer = (actor, name) => (actor.state?.players ?? []).find((p) => p.name === name);
const packJson = (actor) => JSON.stringify(actor.state?.pack ?? null);
const taleTexts = (actor) => (actor.state?.tale ?? []).map((t) => (typeof t === "string" ? t : t?.text ?? ""));
function neighbourToward(state, fromId, toId) {
  const from = parseHex(fromId), to = parseHex(toId);
  const ids = new Set((state?.map ?? []).map((t) => t.id));
  let best = null, bestD = Infinity;
  for (const [dq, dr] of DIRS6) {
    const id = `${from.q + dq},${from.r + dr}`;
    if (!ids.has(id)) continue;
    const d = hexDist(parseHex(id), to);
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}
/** One cast attempt: send, then wait for the seat's energy
 * to move (charged — stood or unravelled alike) or for a
 * refusal to land in the error line. */
async function castOnce(actor, name, msg, what) {
  const e0 = myPlayer(actor, name)?.energy;
  const err0 = actor.errors.length;
  actor.send(msg);
  let outcome = "timeout";
  try {
    await waitFor(() => {
      const e = myPlayer(actor, name)?.energy;
      if (e != null && e0 != null && e !== e0) { outcome = "charged"; return true; }
      if (actor.errors.length > err0) { outcome = "refused"; return true; }
      return false;
    }, what, 5000);
  } catch { /* outcome stays timeout */ }
  const e1 = myPlayer(actor, name)?.energy;
  return { outcome, delta: e0 != null && e1 != null ? e0 - e1 : null, error: actor.errors[actor.errors.length - 1] ?? "" };
}
const unravelOf = (actor, spellName) => {
  const re = new RegExp(`${spellName} unravels — rolled (\\d+) ([+\\u2212-])(\\d+) against DC (\\d+)`);
  const hits = taleTexts(actor).map((t) => t.match(re)).filter(Boolean);
  return hits.map((m) => ({ roll: Number(m[1]), mod: (m[2] === "+" ? 1 : -1) * Number(m[3]), dc: Number(m[4]) }));
};

/* ══ §0 THE RECKONING, READ OFF THE BUILT MODULES ══ */
console.log("§0 the sets, the halving, and the unbound stand — read off the built modules");
{
  const rs = await import("../server/dist/reagentSets.js");
  const tbl = await import("../server/dist/table.js");
  ok("Bulwark's line of record stands: Stone Dust ×2, Ember Ash ×1",
    JSON.stringify(rs.REAGENT_SETS.bulwark) === JSON.stringify([{ reagent: "stone-dust", qty: 2 }, { reagent: "ember-ash", qty: 1 }]),
    JSON.stringify(rs.REAGENT_SETS.bulwark));
  ok("Shard Rain's line stands: Sky Salt ×2, Rune Shard ×1, Star Seed ×1",
    JSON.stringify(rs.REAGENT_SETS.shardrain) === JSON.stringify([{ reagent: "sky-salt", qty: 2 }, { reagent: "rune-shard", qty: 1 }, { reagent: "star-seed", qty: 1 }]),
    JSON.stringify(rs.REAGENT_SETS.shardrain));
  ok("Heal carries no line, and the Coil line stands unspent (no set on the coil's key)",
    rs.REAGENT_SETS.heal === undefined && rs.REAGENT_SETS.coil === undefined);
  ok("the empowerment's gift on the roll is +2, and the halving rounds UP (8→4, 5→3, 7→4; unempowered passes through)",
    rs.REAGENT_EMPOWERMENT_BONUS === 2
    && rs.empoweredCastPrice({ active: true }, 8) === 4
    && rs.empoweredCastPrice({ active: true }, 5) === 3
    && rs.empoweredCastPrice({ active: true }, 7) === 4
    && rs.empoweredCastPrice({ active: false }, 7) === 7);
  ok("an UNBOUND seat (no Tender behind it) counts nothing at the Table's reckoning",
    tbl.castEmpowermentFor({ expKey: null }, "bulwark").active === false);
  stock("tender:424242", "reagent:stone-dust", 2);
  stock("tender:424242", "reagent:ember-ash", 1);
  const bound = tbl.castEmpowermentFor({ expKey: "tender:424242" }, "bulwark");
  ok("a bound pouch holding the full set counts ACTIVE through the Table's own door",
    bound.active === true && bound.lines.length === 2, JSON.stringify(bound));
  stock("tender:424242", "reagent:ember-ash", 0);
  ok("the same pouch one reagent short counts inactive — a partial set is no set",
    tbl.castEmpowermentFor({ expKey: "tender:424242" }, "bulwark").active === false);
}

/* ══ §A THE WARD DOOR — EMPOWERED, FROM HER OWN POUCH ══ */
console.log("§A castWard: Bulwark empowered from the caster's own pouch; the Pack and a roommate's pouch untouched");
const wardRoom = "empowerment-ward";
const W = await mkTableTender("Emp Ward", 3800, "disc-emp-ward", "warden", 30);
const R = await mkTableTender("Emp Roommate", 3800, "disc-emp-room", "warden", 0);
stock(W.ownerKey, "reagent:stone-dust", 23); // ten sets + a surplus of 3
stock(W.ownerKey, "reagent:ember-ash", 10);
stock(R.ownerKey, "reagent:stone-dust", 20);
stock(R.ownerKey, "reagent:ember-ash", 10);
const aW = new Actor();
await aW.join(W.tt, wardRoom);
const aR = new Actor();
await aR.join(R.tt, wardRoom);
await waitFor(() => !!myPlayer(aW, W.name)?.hex && !!myPlayer(aW, R.name), "both bound seats stand in the ward room");
{
  const myHex = myPlayer(aW, W.name).hex;
  const hexB = neighbourToward(aW.state, myHex, "0,0") ?? neighbourToward(aW.state, myHex, myHex);
  const packBefore = packJson(aW);
  let charged = 0;
  const deltas = [];
  for (let i = 0; i < 3; i++) {
    const r = await castOnce(aW, W.name, { type: "castWard", root: "bulwark", hexA: myHex, hexB }, "ward cast attempt");
    if (r.outcome === "charged") { charged++; deltas.push(r.delta); }
  }
  ok("three Bulwark attempts through castWard all charged", charged === 3, `charged=${charged}`);
  ok("each attempt charged the empowered price — ✦4, half the ward's ✦8",
    deltas.length === 3 && deltas.every((d) => d === 4), JSON.stringify(deltas));
  ok("the set left HER OWN pouch by exactly its line per attempt (Stone Dust −2, Ember Ash −1; the surplus stands)",
    invOf(W.ownerKey, "reagent:stone-dust") === 23 - 2 * charged && invOf(W.ownerKey, "reagent:ember-ash") === 10 - charged,
    `stone=${invOf(W.ownerKey, "reagent:stone-dust")} ember=${invOf(W.ownerKey, "reagent:ember-ash")}`);
  ok("the bound roommate's pouch did not move a hair",
    invOf(R.ownerKey, "reagent:stone-dust") === 20 && invOf(R.ownerKey, "reagent:ember-ash") === 10);
  ok("the room's shared Pack is exactly as it stood — the cast never read it and never spent it",
    packJson(aW) === packBefore, `before=${packBefore} after=${packJson(aW)}`);
}

/* ══ §B THE RUNE DOOR — PLAIN, THEN EMPOWERED; THE +2 IN THE TALE ══ */
console.log("§B castRune: Shard Rain plain then empowered — price, consumption, and the +2 the tale names");
const T = await mkTableTender("Emp Tale", 150, "disc-emp-tale", "warden", 30);
const aT = new Actor();
await aT.join(T.tt, "empowerment-rune");
await waitFor(() => !!myPlayer(aT, T.name)?.hex, "the Lv 3 tale seat stands");
{
  const myHex = myPlayer(aT, T.name).hex;
  const from = parseHex(myHex);
  const hexPool = (aT.state?.map ?? []).map((t) => t.id)
    .filter((id) => id !== "0,0" && hexDist(from, parseHex(id)) <= 2);
  const used = new Set();
  const nextHex = () => hexPool.find((h) => !used.has(h));
  const packBefore = packJson(aT);
  // — plain: the pouch stands empty
  ok("the tale caster's pouch stands empty for the plain phase",
    invOf(T.ownerKey, "reagent:sky-salt") === 0 && invOf(T.ownerKey, "rune-shard") === 0 && invOf(T.ownerKey, "reagent:star-seed") === 0);
  let plain = null;
  for (let i = 0; i < 14 && !plain; i++) {
    const hx = nextHex(); if (!hx) break;
    const before = unravelOf(aT, "Shard Rain").length;
    const r = await castOnce(aT, T.name, { type: "castRune", root: "shardrain", hexes: [hx] }, "plain rain attempt");
    if (r.outcome !== "charged") continue;
    used.add(hx);
    ok("a plain Shard Rain attempt charges the full ✦5", r.delta === 5, `delta=${r.delta}`);
    const now = unravelOf(aT, "Shard Rain");
    if (now.length > before) plain = now[now.length - 1];
  }
  ok("a plain unravel came — its reckoning stands in the tale to compare", !!plain, JSON.stringify(unravelOf(aT, "Shard Rain")));
  // — empowered: the pouch stocked with forty sets
  stock(T.ownerKey, "reagent:sky-salt", 80);
  stock(T.ownerKey, "rune-shard", 40);
  stock(T.ownerKey, "reagent:star-seed", 40);
  let emp = null, empAttempts = 0, empDeltasOk = true, empPouchOk = true;
  for (let i = 0; i < 14 && !emp; i++) {
    const hx = nextHex(); if (!hx) break;
    const before = unravelOf(aT, "Shard Rain").length;
    const r = await castOnce(aT, T.name, { type: "castRune", root: "shardrain", hexes: [hx] }, "empowered rain attempt");
    if (r.outcome !== "charged") continue;
    used.add(hx);
    empAttempts++;
    if (r.delta !== 3) empDeltasOk = false;
    if (invOf(T.ownerKey, "reagent:sky-salt") !== 80 - 2 * empAttempts
      || invOf(T.ownerKey, "rune-shard") !== 40 - empAttempts
      || invOf(T.ownerKey, "reagent:star-seed") !== 40 - empAttempts) empPouchOk = false;
    const now = unravelOf(aT, "Shard Rain");
    if (now.length > before) emp = now[now.length - 1];
  }
  ok("empowered attempts charged ✦3 — the odd ✦5 halved and rounded UP, every time",
    empAttempts > 0 && empDeltasOk, `attempts=${empAttempts}`);
  ok("every empowered attempt — the unravelled one included — consumed exactly its set (Sky Salt −2, Rune Shard −1, Star Seed −1)",
    empAttempts > 0 && empPouchOk, `attempts=${empAttempts}`);
  ok("an empowered unravel came", !!emp);
  ok("the empowered mod stands exactly +2 over the plain mod, the DC unmoved — the law's gift, in the tale's own figures",
    !!plain && !!emp && emp.mod - plain.mod === 2 && emp.dc === plain.dc,
    `plain=${JSON.stringify(plain)} emp=${JSON.stringify(emp)}`);
  ok("the rune room's shared Pack never moved through either phase", packJson(aT) === packBefore);
}

/* ══ §C A PARTIAL SET CHANGES NOTHING ══ */
console.log("§C a partial set: full price, nothing consumed");
const P = await mkTableTender("Emp Partial", 3800, "disc-emp-partial", "warden", 30);
stock(P.ownerKey, "reagent:stone-dust", 2); // Bulwark's stone, but no Ember Ash at all
const aP = new Actor();
await aP.join(P.tt, "empowerment-partial");
await waitFor(() => !!myPlayer(aP, P.name)?.hex, "the partial seat stands");
{
  const myHex = myPlayer(aP, P.name).hex;
  const hexB = neighbourToward(aP.state, myHex, "0,0") ?? neighbourToward(aP.state, myHex, myHex);
  const deltas = [];
  for (let i = 0; i < 2; i++) {
    const r = await castOnce(aP, P.name, { type: "castWard", root: "bulwark", hexA: myHex, hexB }, "partial cast attempt");
    if (r.outcome === "charged") deltas.push(r.delta);
  }
  ok("both partial-set attempts charged the FULL ✦8 — reagents never gate, and never half-empower",
    deltas.length === 2 && deltas.every((d) => d === 8), JSON.stringify(deltas));
  ok("nothing was consumed: the Stone Dust stands at 2, the Ember Ash at none",
    invOf(P.ownerKey, "reagent:stone-dust") === 2 && invOf(P.ownerKey, "reagent:ember-ash") === 0);
}

/* ══ §D THE UNBOUND SEAT ══ */
console.log("§D an unbound guest: the standing refusal, and nothing counted anywhere");
{
  const guestToken = issueTableToken({ id: "disc-emp-guest", name: "Emp Guest" });
  const aG = new Actor();
  await aG.join(guestToken, wardRoom);
  await waitFor(() => !!myPlayer(aG, "Emp Guest"), "the unbound guest stands in the ward room");
  const wStone = invOf(W.ownerKey, "reagent:stone-dust"), wEmber = invOf(W.ownerKey, "reagent:ember-ash");
  const packBefore = packJson(aG);
  const myHex = myPlayer(aG, "Emp Guest").hex;
  const hexB = myHex ? (neighbourToward(aG.state, myHex, "0,0") ?? myHex) : "0,0";
  aG.send({ type: "castWard", root: "bulwark", hexA: myHex ?? "0,0", hexB });
  await waitFor(() => aG.errors.length > 0, "the guest's refusal lands", 6000).catch(() => {});
  ok("the unbound guest meets the standing Lv 3 ward refusal — its casts stand exactly as they always have",
    aG.errors.some((e) => /Wards wake at Tender Lv 3/.test(e)), JSON.stringify(aG.errors));
  ok("the guest's energy stands untouched at its flat portion — nothing was charged",
    myPlayer(aG, "Emp Guest")?.energy === 12, `energy=${myPlayer(aG, "Emp Guest")?.energy}`);
  ok("no pouch in the room moved for the guest's cast, and the Pack stands as it stood",
    invOf(W.ownerKey, "reagent:stone-dust") === wStone && invOf(W.ownerKey, "reagent:ember-ash") === wEmber && packJson(aG) === packBefore);
  aG.ws.close();
}

/* ══ §E REFUSALS SPEND NOTHING ══ */
console.log("§E refused casts — geometry, an unnamed hex, an empty purse — consume nothing");
{
  // (i) the ward door's geometry refusal, with a full set held
  stock(W.ownerKey, "reagent:stone-dust", 20);
  stock(W.ownerKey, "reagent:ember-ash", 10);
  const myHex = myPlayer(aW, W.name).hex;
  const farTile = (aW.state?.map ?? []).map((t) => t.id).find((id) => hexDist(parseHex(myHex), parseHex(id)) >= 3);
  const e0 = myPlayer(aW, W.name).energy;
  const r1 = await castOnce(aW, W.name, { type: "castWard", root: "bulwark", hexA: myHex, hexB: farTile }, "geometry refusal");
  ok("a ward aimed at a non-edge is refused before any charge",
    r1.outcome === "refused" && /That edge does not exist/.test(r1.error), JSON.stringify(r1));
  ok("the geometry refusal spent no energy and no reagents",
    myPlayer(aW, W.name).energy === e0 && invOf(W.ownerKey, "reagent:stone-dust") === 20 && invOf(W.ownerKey, "reagent:ember-ash") === 10);
  // (ii) the rune door refused before its charge — a cast naming no hex
  stock(T.ownerKey, "rune-shard", 10);
  stock(T.ownerKey, "reagent:stone-dust", 5);
  const eT = myPlayer(aT, T.name).energy;
  const r2 = await castOnce(aT, T.name, { type: "castRune", root: "holdrune", hexes: [] }, "unnamed-hex refusal");
  ok("a rune cast naming no hex is refused before any charge",
    r2.outcome === "refused" && /written on one hex/.test(r2.error), JSON.stringify(r2));
  ok("the rune refusal spent no energy and none of the Hold Rune's set",
    myPlayer(aT, T.name).energy === eT && invOf(T.ownerKey, "rune-shard") === 10 && invOf(T.ownerKey, "reagent:stone-dust") === 5);
}
{
  // (iii) the purse refusal: a lean tender (three wakes and
  // nothing more — her seat holds ✦16) drains at the
  // empowered ✦4 until the purse cannot pay, and the
  // refused attempt spends nothing.
  const L = await mkTableTender("Emp Lean", 3800, "disc-emp-lean", "warden", 0);
  stock(L.ownerKey, "reagent:stone-dust", 40);
  stock(L.ownerKey, "reagent:ember-ash", 20);
  const aL = new Actor();
  await aL.join(L.tt, "empowerment-lean");
  await waitFor(() => !!myPlayer(aL, L.name)?.hex, "the lean seat stands");
  const myHex = myPlayer(aL, L.name).hex;
  const hexB = neighbourToward(aL.state, myHex, "0,0") ?? neighbourToward(aL.state, myHex, myHex);
  let charged = 0, refused = null, stoneAtRefusal = null, emberAtRefusal = null, energyAtRefusal = null;
  for (let i = 0; i < 10 && !refused; i++) {
    const sBefore = invOf(L.ownerKey, "reagent:stone-dust"), eBefore = invOf(L.ownerKey, "reagent:ember-ash");
    const enBefore = myPlayer(aL, L.name).energy;
    const r = await castOnce(aL, L.name, { type: "castWard", root: "bulwark", hexA: myHex, hexB }, "lean drain attempt");
    if (r.outcome === "charged") {
      charged++;
      if (r.delta !== 4) ok(`lean attempt ${i + 1} charged the empowered ✦4`, false, `delta=${r.delta}`);
    } else if (r.outcome === "refused") {
      refused = r; stoneAtRefusal = sBefore; emberAtRefusal = eBefore; energyAtRefusal = enBefore;
    }
  }
  ok("the lean purse drained at the empowered ✦4 and then refused a cast it could not pay",
    !!refused && charged >= 1 && /costs ✦4/.test(refused.error ?? ""),
    `charged=${charged} error=${refused?.error}`);
  ok("the purse-refused attempt consumed nothing — pouch and purse exactly as they stood",
    refused !== null
    && invOf(L.ownerKey, "reagent:stone-dust") === stoneAtRefusal
    && invOf(L.ownerKey, "reagent:ember-ash") === emberAtRefusal
    && myPlayer(aL, L.name).energy === energyAtRefusal,
    `stone=${invOf(L.ownerKey, "reagent:stone-dust")} vs ${stoneAtRefusal}`);
  ok("everything the lean caster ever spent was the charged attempts' sets, no more",
    invOf(L.ownerKey, "reagent:stone-dust") === 40 - 2 * charged && invOf(L.ownerKey, "reagent:ember-ash") === 20 - charged,
    `charged=${charged} stone=${invOf(L.ownerKey, "reagent:stone-dust")} ember=${invOf(L.ownerKey, "reagent:ember-ash")}`);
  aL.ws.close();
}

/* ══ §F THE WITCH AT THE TABLE — COMPANY FIRST, MERCY ON THE CHARGED FIGURE ══ */
console.log("§F the Witch: the company price reckons first, the halving reads off it, and her mercy returns half the EMPOWERED charge");
const WC = await mkTableTender("Emp Witch", 3800, "disc-emp-witch", "witch", 30);
stock(WC.ownerKey, "reagent:stone-dust", 24);
stock(WC.ownerKey, "reagent:ember-ash", 12);
const aWC = new Actor();
await aWC.join(WC.tt, "empowerment-witch");
await waitFor(() => !!myPlayer(aWC, WC.name)?.hex, "the witch seat stands");
{
  // Best effort: stand one of her own Awokin beside her, so
  // her company price may engage — the proof reads the
  // charged figure either way and names which stood.
  const hand = aWC.you?.hand ?? [];
  if (hand.length) {
    aWC.send({ type: "summon", hex: myPlayer(aWC, WC.name).hex, cardId: hand[0].id });
    await sleep(2500);
  }
  const myHex = myPlayer(aWC, WC.name).hex;
  const hexB = neighbourToward(aWC.state, myHex, "0,0") ?? neighbourToward(aWC.state, myHex, myHex);
  let charged = 0, gross = null, consistent = true, mercySeen = null;
  for (let i = 0; i < 8 && (charged < 3 || mercySeen === null); i++) {
    const talesBefore = taleTexts(aWC).length;
    const r = await castOnce(aWC, WC.name, { type: "castWard", root: "bulwark", hexA: myHex, hexB }, "witch cast attempt");
    if (r.outcome !== "charged") { continue; }
    charged++;
    const newTales = taleTexts(aWC).slice(talesBefore);
    const mercy = newTales.map((t) => t.match(/Witch's mercy returns ✦(\d+)/)).find(Boolean);
    let thisGross = r.delta;
    if (mercy) { mercySeen = Number(mercy[1]); thisGross = r.delta + mercySeen; }
    if (gross === null) gross = thisGross;
    else if (thisGross !== gross) consistent = false;
  }
  console.log(`  · the witch's gross empowered charge stood at ✦${gross} (mercy return seen: ${mercySeen === null ? "none" : "✦" + mercySeen}; attempts charged: ${charged})`);
  ok("the witch's empowered attempts all charged one consistent figure", charged >= 1 && gross !== null && consistent,
    `charged=${charged} gross=${gross}`);
  ok("that figure is the empowerment of her FINAL price — ✦2 (company ✦4 halved) or ✦4 (the plain ✦8 halved), never ✦8",
    gross === 2 || gross === 4, `gross=${gross}`);
  ok("each witch attempt consumed exactly one Bulwark set from her own pouch",
    invOf(WC.ownerKey, "reagent:stone-dust") === 24 - 2 * charged && invOf(WC.ownerKey, "reagent:ember-ash") === 12 - charged,
    `charged=${charged} stone=${invOf(WC.ownerKey, "reagent:stone-dust")} ember=${invOf(WC.ownerKey, "reagent:ember-ash")}`);
  ok("when her empowered cast unravelled, her mercy returned half the EMPOWERED charge — the tale names the figure",
    mercySeen !== null && gross !== null && mercySeen === Math.floor(gross / 2),
    `mercy=${mercySeen} gross=${gross}`);
}

console.log(`\ndrive-reagent-empowerment-table: ${pass} passed, ${fail} failed`);
for (const a of [aW, aR, aT, aP, aWC]) { try { a.ws?.close(); } catch { /* already closed */ } }
try { db.close(); } catch { /* already closed */ }
await sleep(300);
process.exit(fail ? 1 : 0);
