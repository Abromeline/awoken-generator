// THE TABLE PICK-CAST — THE FIX BUILD'S DRIVE (2026-10-22).
// Boots the real server on a scratch DATA_DIR and proves
// the target step is struck from the Table's summoning
// (Nigel: "awoken just summon near the tender when summoned
// they dont need a target"):
//   §A A summonCast naming NO hex casts at once: the
//      referee lands the Awokin on the Tender's own hex or
//      a free beside-hex; every attempt — lands or falters —
//      spends exactly the price before its roll.
//   §B THE SERVER CHOOSES past a full tile: with the
//      Tender's own hex standing full (four), a hexless
//      cast lands BESIDE it instead of refusing.
//   §C §G CONTROL: a seat with no party stars and no
//      summon skills casts at the base arithmetic its
//      level grants — the tale names DC 10 + power and the
//      levels grant alone.
//   §D A named hex is still judged by the old law (the
//      referee demands nothing, but a player who names
//      ground beyond the ring is refused) — and spells keep
//      their targets untouched (the ward door still wants
//      its ground; not this drive's proof — the cast-flow
//      and wheel-law drives carry it).
//   §E THE NEW WORKINGS AT THE TABLE (Nigel, 2026-10-22;
//      seated 2026-10-23 — ported whole from the Proving
//      Ground): Bats, the Hold Rune and Rune Shatter ride
//      the Table's own castRune door in a Witch's seat —
//      the swarm stands as a living working (kind "spell")
//      and bites 1d4 past all armor (the tale speaks it),
//      the Hold Rune's hold BEGINS at its crash (~4 s on,
//      read off the dark's own pinnedUntil), and Rune
//      Shatter's tap looses its pieces while a HELD cast
//      stands a stream that drinks 1✦ a second. (This
//      proof lives here, not in test63: test63 dies in its
//      Room A at HEAD a95d9ce — the Warden's hand comes up
//      empty — a breakage that predates this build and is
//      flagged with it.)
// Run: node scripts/drive-table-pickcast.mjs
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

const OUT = "/home/hatch/workspace/summon-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-pickcast-"));
process.env.PORT = "3983";
process.env.WORKSHOP_PASSWORD = "pickcast-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3983";
const PW = "pickcast-drive-password";
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
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return data?.data ?? data;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up */ }

const part = (name, category, power, toughness) => Number(db.prepare(
  "INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, 'sky', ?, 'image/png', ?)")
  .run(name, category, power, toughness, `pick/${name}.png`, Date.now()).lastInsertRowid);
const mkAwokin = (ownerKey, ownerName, name, bodyPower) => {
  const now = Date.now();
  const comp = JSON.stringify([
    { source_id: `db:${part(name + " Body", "body", bodyPower, bodyPower)}`, name: name + " Body", category: "body", rarity: "common", power: bodyPower, toughness: bodyPower, element: "sky" },
    { source_id: `db:${part(name + " Arms", "arms", 0, 0)}`, name: name + " Arms", category: "arms", rarity: "common", power: 0, toughness: 0, element: "sky" },
    { source_id: `db:${part(name + " Head", "head", 0, 0)}`, name: name + " Head", category: "head", rarity: "common", power: 0, toughness: 0, element: "sky" },
  ]);
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, "pick/awokin.png", comp, ownerName, ownerKey, now).lastInsertRowid);
};
const { issueTableToken } = await import("../server/dist/table.js");
async function mkTender(name, exp, classKey, discId) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, exp, Date.now());
  if (classKey) await call("chooseClass", { classKey }, claim.token);
  const tt = issueTableToken({ id: discId, name });
  const bindCode = (await call("getTableBindCode", {}, claim.token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
  if (!bindRes.ok) throw new Error("table/bind failed for " + name + ": " + bindRes.status);
  return { token: claim.token, ownerKey, tt, name };
}
const fillers = (t, n, tag) => { for (let i = 0; i < n; i++) mkAwokin(t.ownerKey, t.name, `${tag} ${i + 1}`, 2); };

// The stack tender: Lv 6 Warden, party widened to 6 by the
// same lawful stars drive-table-summon holds (the Wide
// Heart unlocked, the Company Standard's row written —
// the width's own proof lives there; here it only seats
// five members for the stack).
const A = await mkTender("Pickcast Warden", 800, "warden", "disc-pick-a");
for (const k of ["h1", "h2", "h3", "h4", "h5"]) await call("unlockSkill", { key: k }, A.token);
db.prepare("INSERT INTO tender_skills (owner_key, skill_key, pool, created_at) VALUES (?, 'w_b2', 'tree', ?)").run(A.ownerKey, Date.now());
const members = [];
for (const nm of ["One", "Two", "Three", "Four", "Five"]) {
  const id = mkAwokin(A.ownerKey, A.name, nm, 2);
  members.push(id);
  await call("addToParty", { awakenedId: id }, A.token);
}
fillers(A, 30, "ABench");
// The control tender: Lv 3, no stars at all.
const C = await mkTender("Pickcast Plain", 150, "warden", "disc-pick-c");
const cKin = mkAwokin(C.ownerKey, C.name, "Plainkin", 2);
await call("addToParty", { awakenedId: cKin }, C.token);
fillers(C, 6, "CBench");

const ROOM = "pickcast";
const wstate = { state: null };
const wws = new WebSocket("ws://127.0.0.1:3983/table/ws");
await new Promise((res, rej) => { wws.onopen = res; wws.onerror = rej; });
wws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") wstate.state = m.state; } catch { /* torn frame */ } };
wws.send(JSON.stringify({ type: "join", room: ROOM, watch: true, name: "Pickcast Watcher" }));

class Actor {
  constructor() { this.state = null; this.you = null; this.errors = []; this.taleSeen = 0; }
  async join(tt, room) {
    this.ws = new WebSocket("ws://127.0.0.1:3983/table/ws");
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data));
        if (m.type === "state") { this.state = m.state; this.you = m.you; }
        else if (m.type === "error") this.errors.push(String(m.message ?? ""));
      } catch { /* torn frame */ }
    };
    this.send({ type: "join", authToken: tt, room });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  get tale() { return (this.state?.tale ?? []).map((t) => (typeof t === "string" ? t : t?.text ?? "")); }
  newTales() { const t = this.tale; if (t.length < this.taleSeen) this.taleSeen = 0; const out = t.slice(this.taleSeen); this.taleSeen = t.length; return out; }
  async waitYou(what, ms = 12000) { const s = Date.now(); while (Date.now() - s < ms) { if (this.you) return; await sleep(120); } throw new Error("actor wait: " + what); }
}
const waitFor = async (fn, what, ms = 15000) => { const s = Date.now(); while (Date.now() - s < ms) { if (fn()) return true; await sleep(150); } throw new Error("drive wait: " + what); };
const seatOf = (name) => wstate.state?.players.find((p) => p.name === name) ?? null;
const fieldOf = (name) => (wstate.state?.field ?? []).filter((u) => u.ownerKey === seatOf(name)?.key);
const parseAx = (id) => id.split(",").map(Number);
const axDist = (a, b) => { const [aq, ar] = parseAx(a); const [bq, br] = parseAx(b); return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(aq + ar - bq - br)); };

// One HEXLESS cast, honestly retried: the message names no
// hex at all — the referee must choose the landing.
async function castHexless(actor, payload, price, what, maxTries = 24) {
  let attempts = 0, falters = 0;
  while (attempts < maxTries) {
    const before = actor.you.energy;
    actor.newTales();
    actor.send({ type: "summonCast", ...payload });
    attempts++;
    let tale = null;
    const s = Date.now();
    while (Date.now() - s < 6000) {
      const hit = actor.newTales().find((t) => /the call (lands|falters)/.test(t));
      if (hit) { tale = hit; break; }
      await sleep(120);
    }
    if (!tale) throw new Error("no summon tale for " + what + " | errors: " + JSON.stringify(actor.errors.slice(-3)));
    const spent = before - actor.you.energy;
    if (spent !== price) throw new Error(`${what}: attempt ${attempts} spent ✦${spent}, expected exactly ✦${price}`);
    if (/the call lands/.test(tale)) return { attempts, falters, tale };
    falters++;
  }
  throw new Error(what + ": never landed in " + maxTries + " hexless casts");
}

/* ══ §A + §B HEXLESS CASTS AND THE FULL TILE ══════════════ */
console.log("§A/§B the Table pick-cast — no hex named; the server lands them; a full tile spills beside");
{
  const a = new Actor(); await a.join(A.tt, ROOM); await a.waitYou("A's seat");
  await waitFor(() => !!seatOf(A.name)?.hex, "the watcher reads A's landing");
  const aHex = seatOf(A.name).hex;

  const first = await castHexless(a, { awakenedId: members[0] }, 2, "One's hexless summon");
  const one = fieldOf(A.name).find((u) => u.name === "One");
  ok("a summonCast naming NO hex casts at once — the Awokin stands", !!one, JSON.stringify(first));
  ok("the landing is the Tender's own hex or a free beside-hex — chosen by the server",
    !!one && axDist(one.hex, aHex) <= 1, `one=${one?.hex} seat=${aHex}`);

  for (let i = 1; i < 4; i++) {
    await castHexless(a, { awakenedId: members[i] }, 2, `member ${i + 1}'s hexless summon`);
  }
  const onSeat = fieldOf(A.name).filter((u) => u.hex === aHex);
  ok("four hexless casts fill the Tender's own hex first (the server's choice runs own-hex first)",
    onSeat.length === 4, `on seat hex: ${onSeat.map((u) => u.name).join(",")}`);

  const fifth = await castHexless(a, { awakenedId: members[4] }, 2, "Five's hexless summon past the full tile");
  const five = fieldOf(A.name).find((u) => u.name === "Five");
  ok("with the Tender's hex full, the hexless cast lands BESIDE it — no refusal, no target",
    !!five && five.hex !== aHex && axDist(five.hex, aHex) === 1, `five=${five?.hex} seat=${aHex} ${JSON.stringify(fifth)}`);
  a.ws.close();
}

/* ══ §C THE CONTROL ═══════════════════════════════════════ */
console.log("§C the control — no stars, no summon skills: the base arithmetic alone");
{
  const c = new Actor(); await c.join(C.tt, ROOM); await c.waitYou("C's seat");
  ok("the control seat carries only the levels grant (+2 at Lv 3)", c.you.summonersPower === 2, String(c.you.summonersPower));
  const run = await castHexless(c, { awakenedId: cKin }, 2, "Plainkin's hexless summon");
  ok("the tale names the base arithmetic — DC 12 (10 + power 2), the levels grant +2, nothing else",
    /against DC 12/.test(run.tale) && /summoner's power \+2/.test(run.tale), run.tale);
  const kin = fieldOf(C.name).find((u) => u.name === "Plainkin");
  ok("the control's hexless cast lands at its Tender's side too",
    !!kin && axDist(kin.hex, seatOf(C.name).hex) <= 1, `kin=${kin?.hex}`);
  c.ws.close();
}

/* ══ §D A NAMED HEX IS STILL JUDGED ═══════════════════════ */
console.log("§D a named hex far beyond the ring is refused — the referee demands nothing, but judges what is named");
{
  const a2 = new Actor(); await a2.join(A.tt, ROOM); await a2.waitYou("A's seat again");
  const aHex = seatOf(A.name).hex;
  const farTile = wstate.state.map.find((t) => axDist(aHex, t.id) >= 3);
  const extra = mkAwokin(A.ownerKey, A.name, "Six", 2);
  await call("addToParty", { awakenedId: extra }, A.token);
  // The seat payload refreshes on the next state push; poke it.
  a2.send({ type: "notes", text: "" });
  await waitFor(() => (a2.you.company ?? []).some((cd) => cd.name === "Six"), "the sixth member stands in the company");
  a2.errors.length = 0;
  const purse = a2.you.energy;
  a2.send({ type: "summonCast", awakenedId: extra, hex: farTile.id });
  await waitFor(() => a2.errors.some((e) => e.includes("at your side")), "the named-far-hex refusal");
  ok("a named hex beyond the ring is refused ('at your side') — and nothing was spent",
    a2.you.energy === purse, `${purse} -> ${a2.you.energy}`);
  a2.ws.close();
}

/* ══ §E THE NEW WORKINGS AT THE TABLE ═════════════════════ */
console.log("§E the new workings at the Table — bats, the hold rune, rune shatter (a Witch's seat)");
{
  const W = await mkTender("Pickcast Witch", 800, "witch", "disc-pick-w");
  fillers(W, 30, "WBench");
  // §E sits in its OWN room: §A–§D's fielded Awokin share
  // the main room's field, and a standing company clears
  // the fragile first wave — and draws the dark to itself —
  // faster than the Hold Rune's crash can land or Shatter's
  // reach can be met (found in this section's first runnings).
  const w = new Actor(); await w.join(W.tt, "pickcast-e"); await w.waitYou("W's seat");
  await waitFor(() => !!(w.state?.players ?? []).find((p) => p.name === W.name)?.hex, "W's seat stands in her own room");
  // No Awokin is fielded in this section: a fighter clears
  // the fragile first wave faster than the Hold Rune's
  // 4-second crash can land (found in the first running of
  // this section — the wave broke under the proof). The
  // dark march on the Tender herself, and she bears it.
  const wWorkings = () => w.state?.workings ?? [];
  const wDark = () => w.state?.dark ?? [];
  const wTaleHas = (re) => (w.state?.tale ?? []).some((t) => re.test(typeof t === "string" ? t : t?.text ?? ""));
  const ensureWave = async () => {
    if (w.state?.battle?.active && wDark().length > 0) return true;
    w.send({ type: "startWave" });
    try { await waitFor(() => (w.state?.battle?.active && wDark().length > 0), "the wave is dealt (startWave)", 8000); return true; }
    catch { w.send({ type: "begin" }); await waitFor(() => (w.state?.battle?.active && wDark().length > 0), "the wave is dealt (begin)", 25000); return true; }
  };
  ok("the Witch's wave is dealt", await ensureWave(), `dark=${wDark().length}`);

  /** Cast one of the new workings through the rune door
   *  until it stands (a fizzle is an honest face — cast
   *  again, the hex read fresh each try). */
  const castNewUntil = async (root, engine, hexOf, extra = {}, tries = 12) => {
    for (let i = 0; i < tries; i++) {
      const hex = hexOf();
      if (!hex) { await sleep(600); continue; }
      w.send({ type: "castRune", root, hue: "unaligned", hexes: [hex], pour: 0, ...extra });
      try { await waitFor(() => wWorkings().some((x) => x.engine === engine), `${root} stands`, 2500); return true; }
      catch { /* fizzled or refused — cast again */ }
    }
    return false;
  };

  // HOLD RUNE first — the hold begins at the crash. (The
  // Witch rolls runes cross-school at −3, so the fizzle is
  // the common face; the loop casts on, as a player would.
  // The crash needs its shade alive for ~4 s, so the rune
  // goes before the swarm is loosed to bite.)
  let holdStood = false, pinSeen = false;
  for (let attempt = 0; attempt < 5 && !pinSeen; attempt++) {
    if (!(await ensureWave())) break;
    const d = [...wDark()].sort((a, b) => b.hp - a.hp)[0];
    if (!d) break;
    holdStood = await castNewUntil("holdrune", "holdrune", () => wDark().find((x) => x.id === d.id)?.hex, {}, 8);
    if (!holdStood) continue;
    try {
      await waitFor(() => { const dd = wDark().find((x) => x.id === d.id); return !!dd && (dd.pinnedUntil ?? 0) > Date.now(); },
        "the crash lands and the hold begins (pinnedUntil on the dark)", 25000);
      pinSeen = true;
    } catch { /* the shade fell first — try the next */ }
  }
  ok("hold rune @Table: cast over a standing shade, its crash lands ~4 s on and the HOLD BEGINS — the dark's own pinnedUntil carries it",
    holdStood && pinSeen, `errors=${JSON.stringify(w.errors.slice(-2))}`);

  // BATS — the swarm stands, flies, and bites.
  await ensureWave();
  const batsStood = await castNewUntil("bats", "bats", () => wDark()[0]?.hex);
  ok("bats @Table: the cast stands a living swarm working (kind spell) through the rune door",
    batsStood && wWorkings().some((x) => x.engine === "bats" && x.kind === "spell"),
    `errors=${JSON.stringify(w.errors.slice(-2))}`);
  let biteSeen = false;
  try { await waitFor(() => wTaleHas(/Bats — bite \d of 3: 1d4 = \d, past all armor/), "the swarm's first bite in the tale", 60000); biteSeen = true; } catch { /* never landed */ }
  ok("bats @Table: the swarm BITES the dark — 1d4 past all armor, AC never consulted (the tale speaks it)", biteSeen);

  // RUNE SHATTER — the volley, then the held stream.
  await ensureWave();
  const myHex = () => (w.state?.players ?? []).find((p) => p.name === W.name)?.hex;
  const nearDark = () => wDark().filter((x) => myHex() && axDist(myHex(), x.hex) <= 2).sort((a, b) => b.hp - a.hp)[0];
  let volleySeen = false;
  const fliesCount = () => (w.state?.tale ?? []).filter((t) => /Rune Shatter — a piece flies/.test(typeof t === "string" ? t : t?.text ?? "")).length;
  const vStart = Date.now();
  while (Date.now() - vStart < 90000 && !volleySeen) {
    const d = nearDark();
    if (d) {
      // The volley's signature, counted over the whole tale
      // before and after the tap (the tale is a rolling
      // window — a length-slice races its trimming; a count
      // of the piece reports does not).
      const before = fliesCount();
      w.send({ type: "castRune", root: "shatter", hue: "unaligned", hexes: [d.hex], pour: 0 });
      try {
        await waitFor(() => fliesCount() > before || wTaleHas(/Shatter.*unravels|unravels/), "the volley speaks (or fizzles)", 6000);
        volleySeen = fliesCount() > before;
      } catch { /* cast again */ }
    }
    if (!volleySeen) await sleep(700);
  }
  ok("shatter @Table: the tap looses its pieces in reach — each piece its own shot in the tale (d20 + bonus − 2 vs AC)", volleySeen,
    `errors=${JSON.stringify(w.errors.slice(-2))}`);
  let streamStood = false;
  for (let attempt = 0; attempt < 6 && !streamStood; attempt++) {
    await ensureWave();
    streamStood = await castNewUntil("shatter", "shatter", () => nearDark()?.hex, { heldMs: 4000 }, 4);
    if (!streamStood) await sleep(1200);
  }
  ok("shatter @Table: a HELD cast stands the stream as a working", streamStood, `errors=${JSON.stringify(w.errors.slice(-2))}`);
  let drankSeen = false;
  if (streamStood) {
    try { await waitFor(() => wTaleHas(/the held stream drinks 1 ✦/), "the stream drinks its first second", 20000); drankSeen = true; } catch { /* never drank */ }
  }
  ok("shatter @Table: the held stream DRINKS 1✦ for its second, as the spec holds", drankSeen);
  w.ws.close();
}

wws.close();
console.log(`\nTABLE PICK-CAST DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
