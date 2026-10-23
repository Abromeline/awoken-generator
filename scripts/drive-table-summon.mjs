// THE WHEEL SUMMONING DRIVE (2026-10-21 — rewritten whole
// for Nigel's wheel law, replacing the hand-era drive of the
// same name; its elsewhere/attune proofs moved out with the
// machinery they proved):
//   Tenders are the only way to summon Awokin at the Table.
//   The deck hand is REMOVED; summoning is a CAST through the
//   action wheel: d20 + gift + SUMMONER'S POWER − 3 (when the
//   caster stands in the curse) vs DC 10 + the Awokin's power.
//   The purse follows the Table spell doors: the price is
//   charged BEFORE the roll — a faltering call spends it.
// Proved here, against watcher truth and the actors' own
// states:
//   §0 the Summoner's Power reader: zodiac clause sum (0
//      today — no stars carry it) + 2 × ⌊level/3⌋ + 3 for the
//      Sage, read straight from the built server;
//   §A held ground: the company lists the party alone; a
//      non-member is refused; an out-of-ring tile is refused;
//      the summon lands at the Tender's side with its terms
//      named in the tale (+4 at Lv 6, DC 18 for power 8, no
//      curse term); every attempt — land or falter — spends
//      exactly the price; an already-fielded member is
//      refused; the fifth body on one tile meets the stack
//      cap; the retired "summon" message no longer answers;
//   §B the Sage: a Lv 6 Sage's tale carries +7 against the
//      same power — the +3 over a same-level Warden's +4;
//   §C a Lv 3 tender's tale carries +2 — the levels grant's
//      first step (the reader in §0 pins Lv 1–2 at +0; no
//      tender under Lv 3 can sit at the Table to roll);
//   §D cursed ground: the Tender glides into the curse and
//      summons there — the tale names "−3 the curse presses"
//      beside the summoner's power, and the call lands;
//   §E the curse term on the spell doors: a ward cast from
//      cursed ground that unravels names "(the curse presses
//      −3)" in its reckoning; the same hunt from held ground
//      produces a reckoning with no curse in it;
//   §F the wheel itself (browser): no hand cards stand in the
//      satchel; the Awoken branch lists the member with its
//      price and "+4 summoner's power"; choosing it and
//      tapping ground at the Tender's side lands the summon.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-table-summon.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-wheel-"));
process.env.PORT = "3941";
process.env.WORKSHOP_PASSWORD = "<redacted>";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const PW = ["fix", "password", "1"].join("-");
const BASE = "http://127.0.0.1:3941";
const OUT = "/home/hatch/workspace/wheel-summon-proof";
mkdirSync(OUT, { recursive: true });
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
  return data;
}

// ── Seed helpers ──────────────────────────────────────────
const db = new Database(join(process.env.DATA_DIR, "app.db"));
// STORE MIGRATION-ORDER DEFECT (named by the Audit and by
// this drive's predecessor, 2026-10-20 — not this build's
// change): on a FRESH database store.ts's ALTER for
// awakened.greeter runs before the table exists and its catch
// swallows the failure, so the column is never created.
// Until store.ts is repaired, the drive stands it up itself.
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }
const now = Date.now();
const part = (name, category, power, toughness) => Number(db.prepare(
  "INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, 'sky', ?, 'image/png', ?)")
  .run(name, category, power, toughness, `fix/${name}.png`, now).lastInsertRowid);
const mkAwokin = (ownerKey, ownerName, name, power) => {
  const comp = JSON.stringify([
    { source_id: `db:${part(name + " Body", "body", power, 5)}`, name: name + " Body", category: "body", rarity: "common", power, toughness: 5, element: "sky" },
    { source_id: `db:${part(name + " Arms", "arms", 0, 0)}`, name: name + " Arms", category: "arms", rarity: "common", power: 0, toughness: 0, element: "sky" },
    { source_id: `db:${part(name + " Head", "head", 0, 0)}`, name: name + " Head", category: "head", rarity: "common", power: 0, toughness: 0, element: "sky" },
  ]);
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, "fix/awokin.png", comp, ownerName, ownerKey, now).lastInsertRowid);
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

// A: the Lv 6 Warden — five members (the party is widened
// past five by the party stars, Nigel 2026-10-22: each
// party star is a spot — the Wide Heart's +1, bought
// lawfully up the Heart's ring, and the Company
// Standard's +2: cap 3 + 1 + 2 = 6) and one owned Awokin
// who is NOT of the party.
const A = await mkTender("Wheel Warden", 800, "warden", "disc-wheel-a");
for (const k of ["h1", "h2", "h3", "h4", "h5"]) await call("unlockSkill", { key: k }, A.token);
// The Company Standard (w_b2, +2) stands at the end of an
// 18-point road — h1–h7, the Warden's first arm, across
// the rings to the Sage's keystone, s_b1, s_b2, then the
// ring star itself — longer than a Lv 6 life's 12 points,
// so this drive writes its ledger row directly, as
// drive-party-table's §L once wrote the Escort's: the
// wheel's reaching law is proven by the zodiac drive, and
// the seam under proof here is the width a HELD party
// star grants under party.ts's reckoning.
db.prepare("INSERT INTO tender_skills (owner_key, skill_key, pool, created_at) VALUES (?, 'w_b2', 'tree', ?)").run(A.ownerKey, Date.now());
const aAlpha = mkAwokin(A.ownerKey, A.name, "Alpha", 8);
const aBeta = mkAwokin(A.ownerKey, A.name, "Beta", 2);
const aGamma = mkAwokin(A.ownerKey, A.name, "Gamma", 2);
const aDelta = mkAwokin(A.ownerKey, A.name, "Delta", 2);
const aEpsilon = mkAwokin(A.ownerKey, A.name, "Epsilon", 2);
const aOutsider = mkAwokin(A.ownerKey, A.name, "Outsider", 2);
for (const id of [aAlpha, aBeta, aGamma, aDelta, aEpsilon]) await call("addToParty", { awakenedId: id }, A.token);
// The seat's purse is roster-fed (calculateMaxEnergy: base
// 10 + a share per owned Awokin), and the cast retries below
// spend honestly — so each tender also holds a bench of
// owned fillers who are nobody's party members.
const fillers = (t, n, tag) => { for (let i = 0; i < n; i++) mkAwokin(t.ownerKey, t.name, `${tag} ${i + 1}`, 2); };
// A's bench is deep: Alpha's cast (DC 18, ✦8 a try) lands
// at 35%, and §A spends from this purse all section long.
fillers(A, 30, "ABench");
// B: the Lv 6 Sage — the same exp, the same power of Awokin.
const B = await mkTender("Wheel Sage", 800, "sage", "disc-wheel-b");
const bSagekin = mkAwokin(B.ownerKey, B.name, "Sagekin", 8);
await call("addToParty", { awakenedId: bSagekin }, B.token);
// The Sage's gift runs −2 (the summon gift's pencil), so
// her cast against DC 18 lands at 40% — her bench is deep
// so the retry purse cannot starve mid-proof.
fillers(B, 40, "BBench");
// C: the Lv 3 Warden — the lowest seat the Table takes
// (classes wake at Lv 3), carrying the levels grant's first
// step, +2. The +0 of Lv 1–2 is pinned at the reader in §0 —
// no Lv 2 tender can sit at the Table to roll it.
const C = await mkTender("Wheel Low", 150, "warden", "disc-wheel-c");
const cLowkin = mkAwokin(C.ownerKey, C.name, "Lowkin", 2);
await call("addToParty", { awakenedId: cLowkin }, C.token);
fillers(C, 4, "CBench");
// E: the Lv 10 Warden — a deep purse for the ward hunts.
const E = await mkTender("Wheel Warder", 3800, "warden", "disc-wheel-e");
// Her bench is deep: the ward hunts below cast until a
// fizzle shows its reckoning — from held ground her cast
// modifier (+5) fizzles only one cast in four, and every
// attempt, standing or unravelling, spends the price.
fillers(E, 40, "EBench");
// D: the Lv 6 Warden of the browser coda.
const D = await mkTender("Wheel Page", 800, "warden", "disc-wheel-d");
const dPagekin = mkAwokin(D.ownerKey, D.name, "Pagekin", 2);
await call("addToParty", { awakenedId: dPagekin }, D.token);
fillers(D, 4, "DBench");
console.log("seeded: Lv6 Warden (5 members + an outsider + bench), Lv6 Sage, Lv3 Warden, Lv10 Warder, Lv6 Page tender");

// ── §G. THE WIDTH ITSELF — effect against control ─────────
// Nigel, 2026-10-22: "each party star is a spot: +1,
// second-arm stars +2." A tender holding NO party stars
// caps at exactly 3 and is refused a fourth member; A,
// holding the Wide Heart (+1) and the Company Standard
// (+2), caps at 3 + 1 + 2 = 6.
{
  const F = await mkTender("Wheel Plain", 150, "warden", "disc-wheel-f");
  const fIds = [1, 2, 3, 4].map((i) => mkAwokin(F.ownerKey, F.name, `Plain ${i}`, 2));
  const vF0 = await call("getParty", {}, F.token);
  ok("the control: no party stars held — the party caps at exactly 3",
    vF0.cap === 3 && vF0.partyLevel === 0 && vF0.musterBonus === 0, JSON.stringify({ cap: vF0.cap, partyLevel: vF0.partyLevel, musterBonus: vF0.musterBonus }));
  for (const id of fIds.slice(0, 3)) await call("addToParty", { awakenedId: id }, F.token);
  let fRefused = null;
  try { await call("addToParty", { awakenedId: fIds[3] }, F.token); } catch (e) { fRefused = e; }
  ok("the control: the fourth member is refused whole — the party stands full at 3",
    !!fRefused && /stands full/.test(fRefused.message), fRefused ? fRefused.message : "no refusal");
  const vA0 = await call("getParty", {}, A.token);
  ok("the effect: A's two party stars widen the party to 6 — 3 + 1 (the Wide Heart) + 2 (the Company Standard)",
    vA0.cap === 6 && vA0.partyLevel === 2 && vA0.levelBonus === 0 && vA0.musterBonus === 3,
    JSON.stringify({ cap: vA0.cap, partyLevel: vA0.partyLevel, levelBonus: vA0.levelBonus, musterBonus: vA0.musterBonus }));
}

// ── §0. THE SUMMONER'S POWER READER ───────────────────────
const { summonersPowerFor } = await import("../server/dist/table.js");
ok("the reader answers 0 at Lv 1 (no clause stars, no levels, no Sage)", summonersPowerFor(A.ownerKey, 1, "warden") === 0, String(summonersPowerFor(A.ownerKey, 1, "warden")));
ok("the reader answers 0 at Lv 2", summonersPowerFor(A.ownerKey, 2, "warden") === 0);
ok("the levels grant answers +2 at Lv 3", summonersPowerFor(A.ownerKey, 3, "warden") === 2);
ok("the levels grant answers +4 at Lv 6", summonersPowerFor(A.ownerKey, 6, "warden") === 4);
ok("the Sage's grant answers +7 at Lv 6 (4 levels + 3 Sage)", summonersPowerFor(A.ownerKey, 6, "sage") === 7);
ok("the reader answers +9 at Lv 9 for a Sage (6 levels + 3 Sage)", summonersPowerFor(A.ownerKey, 9, "sage") === 9);
ok("another class at Lv 10 answers +6 (levels only)", summonersPowerFor(A.ownerKey, 10, "runewright") === 6);

// ── Sockets: a watcher for room truth, actors for the casts ─
const ROOM = "wheel-summon";
const wstate = { state: null };
const wws = new WebSocket("ws://127.0.0.1:3941/table/ws");
await new Promise((res, rej) => { wws.onopen = res; wws.onerror = rej; });
wws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") wstate.state = m.state; } catch { /* torn frame */ } };
wws.send(JSON.stringify({ type: "join", room: ROOM, watch: true, name: "Wheel Watcher" }));

class Actor {
  constructor() { this.state = null; this.you = null; this.errors = []; this.taleSeen = 0; }
  async join(tt, room) {
    this.ws = new WebSocket("ws://127.0.0.1:3941/table/ws");
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
const tileById = (id) => wstate.state?.map.find((t) => t.id === id) ?? null;
const parseAx = (id) => id.split(",").map(Number);
const axDist = (a, b) => { const [aq, ar] = parseAx(a); const [bq, br] = parseAx(b); return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(aq + ar - bq - br)); };
const neighbours = (id) => { const [q, r] = parseAx(id); return [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([dq, dr]) => `${q + dq},${r + dr}`).filter((t) => tileById(t)); };

// One summon cast, honestly retried: every attempt must
// spend exactly the price (the spell doors' purse law), and
// the helper returns the attempt count and the final tale.
async function castUntil(actor, payload, price, what, maxTries = 24) {
  let attempts = 0, falters = 0, lastTale = "";
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
    if (!tale) throw new Error("no summon tale for " + what + " | errors: " + JSON.stringify(actor.errors.slice(-3)) + " | tale tail: " + JSON.stringify(actor.tale.slice(-4)) + " | you: " + JSON.stringify(actor.you && { energy: actor.you.energy, company: actor.you.company.map((x) => [x.name, x.id, x.awokenId]) }));
    if (/costs ✦\d+ — you hold/.test(actor.errors[actor.errors.length - 1] ?? "") && actor.you.energy < price) throw new Error(what + ": the purse starved mid-proof at ✦" + actor.you.energy);
    lastTale = tale;
    const spent = before - actor.you.energy;
    if (spent !== price) throw new Error(`${what}: attempt ${attempts} spent ✦${spent}, expected exactly ✦${price} (purse ${before} -> ${actor.you.energy})`);
    if (/the call lands/.test(tale)) return { attempts, falters, tale };
    falters++;
  }
  throw new Error(what + ": never landed in " + maxTries + " casts");
}
// A glide by socket: the Table's glide is a TARGET POINT,
// not a velocity — one message naming the tile's centre in
// the server's own iso pixels (isoOffset at TILE_SIZE 40:
// x = q·1292·40/796, y = q·470·40/796 + r·948·40/796), and
// the referee walks the Tender there at 30 px a second.
// (An earlier shape of this helper sent {dx, dy}, which the
// door silently ignores — the runs that "passed" §D then
// were the ones where the curse itself spread onto the
// Tender's tile during long retry sections.)
async function glideTo(actor, name, targetHex, ms = 45000) {
  const [tq, tr] = parseAx(targetHex);
  const k = 40 / 796;
  actor.send({ type: "glide", tx: tq * 1292 * k + tr * 0, ty: tq * 470 * k + tr * 948 * k });
  const s = Date.now();
  while (Date.now() - s < ms) {
    if (seatOf(name)?.hex === targetHex) return true;
    await sleep(200);
  }
  return seatOf(name)?.hex === targetHex;
}

// ── §A. HELD GROUND — the company, the refusals, the cast ──
const a = new Actor(); await a.join(A.tt, ROOM); await a.waitYou("A's seat");
await waitFor(() => !!seatOf(A.name)?.hex, "the watcher reads A's landing");
const aHex = seatOf(A.name).hex;
ok("A's company at the wheel lists the five party members", ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"].every((n) => a.you.company.some((c) => c.name === n)), JSON.stringify(a.you.company.map((c) => c.name)));
ok("the company does NOT list the owned non-member", !a.you.company.some((c) => c.name === "Outsider"));
ok("A's seat carries summoner's power +4 to show the wheel (Lv 6 Warden)", a.you.summonersPower === 4, String(a.you.summonersPower));
ok("no hand rides A's seat any more", a.you.hand === undefined);

a.errors.length = 0; const aPurse0 = a.you.energy;
a.send({ type: "summonCast", awakenedId: aOutsider, hex: aHex });
await waitFor(() => a.errors.some((e) => e.includes("not in your party")), "the non-member refusal");
ok("a non-member summon is refused in plain words", true);
ok("the refusal spent nothing", a.you.energy === aPurse0, `${aPurse0} -> ${a.you.energy}`);

const farTile = wstate.state.map.find((t) => axDist(aHex, t.id) >= 3);
a.errors.length = 0;
a.send({ type: "summonCast", awakenedId: aBeta, hex: farTile.id });
await waitFor(() => a.errors.some((e) => e.includes("at your side")), "the out-of-ring refusal");
ok("a landing out of the ring is refused ('at your side')", true);
ok("the ring refusal spent nothing", a.you.energy === aPurse0);

a.errors.length = 0;
a.send({ type: "summon", cardId: "roster-" + aBeta, hex: aHex });
await waitFor(() => a.errors.some((e) => e.includes("no longer answers")), "the retired road's refusal");
ok("the retired hand-era 'summon' message no longer answers", true);

const alphaRun = await castUntil(a, { awakenedId: aAlpha, hex: aHex }, 8, "Alpha's summon");
ok("Alpha lands on held ground at the Tender's side", fieldOf(A.name).some((u) => u.name === "Alpha" && u.hex === aHex));
ok("the tale names the summoner's power (+4 at Lv 6)", /summoner's power \+4/.test(alphaRun.tale), alphaRun.tale);
ok("the tale names the DC (10 + power 8 = 18)", /against DC 18/.test(alphaRun.tale), alphaRun.tale);
ok("no curse term rides a held-ground cast", !/curse presses/.test(alphaRun.tale), alphaRun.tale);
console.log(`    (Alpha took ${alphaRun.attempts} cast(s), ${alphaRun.falters} falter(s) — every one charged ✦8 before its roll)`);

a.errors.length = 0; const aPurse1 = a.you.energy;
a.send({ type: "summonCast", awakenedId: aAlpha, hex: aHex });
await waitFor(() => a.errors.length > 0, "the already-fielded refusal");
ok("an already-fielded member is refused plainly (the company no longer lists it — it stands)", /not in your party|already standing/.test(a.errors[0]), a.errors[0]);
ok("the fielded refusal spent nothing and doubled nothing", a.you.energy === aPurse1 && fieldOf(A.name).filter((u) => u.name === "Alpha").length === 1);

for (const [id, nm] of [[aBeta, "Beta"], [aGamma, "Gamma"], [aDelta, "Delta"]]) {
  await castUntil(a, { awakenedId: id, hex: aHex }, 2, nm + "'s summon");
}
ok("four of A's company stand on the Tender's own tile", fieldOf(A.name).filter((u) => u.hex === aHex).length === 4);
a.errors.length = 0; const aPurse2 = a.you.energy;
a.send({ type: "summonCast", awakenedId: aEpsilon, hex: aHex });
await waitFor(() => a.errors.some((e) => e.includes("That tile stands full")), "the stack-cap refusal");
ok("the fifth body on one tile meets the stack cap, refused before any charge", a.you.energy === aPurse2, `${aPurse2} -> ${a.you.energy}`);

// ── §B. THE SAGE'S +3 ─────────────────────────────────────
const b = new Actor(); await b.join(B.tt, ROOM); await b.waitYou("B's seat");
ok("the Sage's seat carries summoner's power +7 to show the wheel", b.you.summonersPower === 7, String(b.you.summonersPower));
const sageRun = await castUntil(b, { awakenedId: bSagekin, hex: seatOf(B.name).hex }, 8, "Sagekin's summon");
ok("the Sage's tale carries +7 against the same DC 18 — +3 over the Warden's +4", /summoner's power \+7/.test(sageRun.tale) && /against DC 18/.test(sageRun.tale), sageRun.tale);

// ── §C. LEVEL THREE — the grant's first step ──────────────
const c = new Actor(); await c.join(C.tt, ROOM); await c.waitYou("C's seat");
ok("the Lv 3 seat carries summoner's power +2", c.you.summonersPower === 2, String(c.you.summonersPower));
const lowRun = await castUntil(c, { awakenedId: cLowkin, hex: seatOf(C.name).hex }, 2, "Lowkin's summon");
ok("the Lv 3 tale names the grant's first step, +2", /summoner's power \+2/.test(lowRun.tale), lowRun.tale);
ok("Lowkin stands fielded all the same", fieldOf(C.name).some((u) => u.name === "Lowkin"));

// ── §D. CURSED GROUND — the summon at −3 ──────────────────
const cursedTiles = wstate.state.map.filter((t) => t.cursed);
ok("the map carries cursed ground to stand in", cursedTiles.length > 0);
const aCursed = cursedTiles.sort((x, y) => axDist(aHex, x.id) - axDist(aHex, y.id))[0];
ok("A glides into the curse", await glideTo(a, A.name, aCursed.id), seatOf(A.name)?.hex);
ok("A stands on a cursed tile", tileById(seatOf(A.name).hex)?.cursed === true, seatOf(A.name).hex);
const cursedLanding = neighbours(aCursed.id).find((t) => tileById(t)?.cursed) ?? neighbours(aCursed.id)[0];
const epsRun = await castUntil(a, { awakenedId: aEpsilon, hex: cursedLanding }, 2, "Epsilon's cursed summon");
ok("Epsilon's call LANDS from cursed ground", fieldOf(A.name).some((u) => u.name === "Epsilon"));
ok("the tale names the curse's −3", /−3 the curse presses/.test(epsRun.tale), epsRun.tale);
ok("the tale still names the summoner's power beside it", /summoner's power \+4/.test(epsRun.tale), epsRun.tale);

// ── §E. THE SPELL DOORS AT −3 ─────────────────────────────
const grim = await (await fetch(`${BASE}/api/getGrimoire`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).json();
const wardDef = (grim.spells ?? []).filter((s) => s.kind === "ward").sort((x, y) => x.cost - y.cost)[0];
ok("the Grimoire offers a ward for the hunt", !!wardDef, JSON.stringify((grim.spells ?? []).map((s) => s.key)));
const e = new Actor(); await e.join(E.tt, ROOM); await e.waitYou("E's seat");
await waitFor(() => !!seatOf(E.name)?.hex, "the watcher reads E's landing");
const eHome = seatOf(E.name).hex;
const eCursed = wstate.state.map.filter((t) => t.cursed).sort((x, y) => axDist(eHome, x.id) - axDist(eHome, y.id))[0];
ok("E glides into the curse", await glideTo(e, E.name, eCursed.id), seatOf(E.name)?.hex);
// The fizzle hunt: cast the ward on rotating edges until a
// cast unravels; its reckoning is the evidence. Successes
// stand as wards and the hunt walks to a fresh edge.
async function fizzleHunt(actor, anchorHex, maxCasts) {
  const around = [anchorHex, ...neighbours(anchorHex)];
  for (let i = 0; i < maxCasts; i++) {
    const hexA = around[i % around.length];
    const hexB = neighbours(hexA)[Math.floor(i / around.length) % neighbours(hexA).length];
    actor.newTales();
    actor.send({ type: "castWard", root: wardDef.key, hexA, hexB });
    const s = Date.now();
    while (Date.now() - s < 5000) {
      const hit = actor.newTales().find((t) => /unravels/.test(t));
      if (hit) return hit;
      await sleep(120);
    }
  }
  return null;
}
const cursedFizzle = await fizzleHunt(e, eCursed.id, 16);
ok("a ward cast from cursed ground unravelled within the hunt", !!cursedFizzle);
ok("its reckoning names the curse's −3", !!cursedFizzle && /\(the curse presses −3\)/.test(cursedFizzle), cursedFizzle ?? "");
const eHeld = wstate.state.map.filter((t) => !t.cursed).sort((x, y) => axDist(eCursed.id, x.id) - axDist(eCursed.id, y.id))[0];
ok("E glides back to held ground", await glideTo(e, E.name, eHeld.id), seatOf(E.name)?.hex);
const heldFizzle = await fizzleHunt(e, eHeld.id, 22);
ok("a ward cast from held ground unravelled within the hunt", !!heldFizzle);
ok("its reckoning carries NO curse term", !!heldFizzle && !/curse presses/.test(heldFizzle), heldFizzle ?? "");

// ── §F. THE WHEEL ITSELF (browser) ────────────────────────
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
page.on("pageerror", (err) => console.log("[pageerror]", String(err).slice(0, 240)));
await page.evaluateOnNewDocument((sess) => { window.__awokenTableSession = sess; },
  { authToken: D.tt, room: ROOM + "-page", name: D.name });
await page.goto(BASE + "/table?frame_id=wheel-drive", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector(".table-room", { timeout: 30000 });
await page.waitForFunction(() => document.querySelector(".table-room svg polygon"), { timeout: 30000 });
const waitPage = async (fn, what, ms = 12000) => { const s = Date.now(); while (Date.now() - s < ms) { if (await page.evaluate(fn)) return true; await sleep(150); } throw new Error("page wait: " + what); };
await waitPage(() => document.body.textContent.includes("Wheel Page"), "D's seat renders");
// The satchel: no hand cards stand; the party standing shows.
await page.evaluate(() => { const g = document.querySelector(".hand-grab"); if (g?.getAttribute("aria-expanded") !== "true") g?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); });
await sleep(400);
const satchel = await page.evaluate(() => ({
  cards: document.querySelectorAll(".tcard").length,
  text: document.querySelector("footer")?.textContent ?? "",
}));
ok("the satchel holds NO hand cards — the hand is gone", satchel.cards === 0);
ok("the satchel's Awokin tab shows the party standing, Pagekin ready at the wheel", /ready at the wheel/.test(satchel.text) && satchel.text.includes("Pagekin"), satchel.text.slice(0, 200));
// Open the wheel the way a player does — a right-click on
// the stage (the wheel opens at the cursor) — and walk the
// Awoken branch.
const stageBox = await page.evaluate(() => {
  const r = document.querySelector(".terrain-stage")?.getBoundingClientRect();
  return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
});
await page.mouse.click(stageBox.x, stageBox.y, { button: "right" });
await waitPage(() => !!document.querySelector('.gw-disc[aria-label="Awoken"]'), "the wheel's Awoken branch stands");
// The wheel's discs act on a press (pointerdown, then the
// release) — a bare click event is not their gesture. The
// helper presses with the real mouse at the disc's centre.
const pressDisc = async (find) => {
  const pt = await page.evaluate(find);
  if (!pt) throw new Error("disc not found");
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  await sleep(60);
  await page.mouse.up();
};
await pressDisc(() => { const d = document.querySelector('.gw-disc[aria-label="Awoken"]'); if (!d) return null; const r = d.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await waitPage(() => [...document.querySelectorAll(".gw-disc")].some((d) => (d.getAttribute("aria-label") ?? "").includes("Pagekin")), "the company lists Pagekin");
const memberLabel = await page.evaluate(() => [...document.querySelectorAll(".gw-disc")].map((d) => d.getAttribute("aria-label")).find((l) => l?.includes("Pagekin")) ?? "");
ok("the wheel's listing names the price in ✦", memberLabel.includes("✦2"), memberLabel);
ok("the wheel's listing shows the cast's shape: +4 summoner's power", memberLabel.includes("+4 summoner's power"), memberLabel);
await pressDisc(() => { const d = [...document.querySelectorAll(".gw-disc")].find((x) => (x.getAttribute("aria-label") ?? "").includes("Pagekin")); if (!d) return null; const r = d.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await waitPage(() => (document.body.textContent ?? "").includes("Calling") && (document.body.textContent ?? "").includes("Pagekin"), "the call stands readied in the bar");
// Tap ground at D's side (the tile lattice, solved as the
// older drives solve it) until Pagekin stands — a faltering
// call keeps the member readied, so the tap simply repeats.
const dSeatHex = () => (wstate.state?.players.find((p) => p.name === D.name)?.hex) ?? null;
// D sits in her own room; read her landing from her own page
// state through the watcher of that room instead:
const w2 = { state: null };
const wws2 = new WebSocket("ws://127.0.0.1:3941/table/ws");
await new Promise((res, rej) => { wws2.onopen = res; wws2.onerror = rej; });
wws2.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") w2.state = m.state; } catch { /* torn frame */ } };
wws2.send(JSON.stringify({ type: "join", room: ROOM + "-page", watch: true, name: "Page Watcher" }));
await waitFor(() => !!w2.state?.players.find((p) => p.name === D.name)?.hex, "the page watcher reads D's landing");
const dHex = w2.state.players.find((p) => p.name === D.name).hex;
// The tap identifies the tile's own hit polygon by
// geometry: the polygons' points live in the stage's local
// iso coordinates (the server's isoOffset at size 40), so
// the polygon whose centroid sits on the tile's centre IS
// the tile — no lattice to solve and no screen mapping to
// drift (the stage pans and zooms above these coords).
// The tap is D's own hex: whether it lands on the tile or
// is routed from D's figure standing on it, the Table
// attempts the readied summon on that ground.
const tapTile = async (id) => page.evaluate((hexId) => {
  const [q, r] = hexId.split(",").map(Number);
  const k = 40 / 796;
  const tx = q * 1292 * k + r * 0, ty = q * 470 * k + r * 948 * k;
  let best = null, bd = 1e9;
  for (const p of document.querySelectorAll('.table-room svg polygon[fill="transparent"]')) {
    const pts = (p.getAttribute("points") ?? "").trim().split(/\s+/).map((s) => s.split(",").map(Number));
    if (!pts.length) continue;
    const cx = pts.reduce((a2, pt) => a2 + pt[0], 0) / pts.length, cy = pts.reduce((a2, pt) => a2 + pt[1], 0) / pts.length;
    const d = Math.hypot(cx - tx, cy - ty);
    if (d < bd) { bd = d; best = p; }
  }
  if (best && bd < 8) { best.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); return bd; }
  return -1;
}, id);
let pageLanded = false;
for (let i = 0; i < 6 && !pageLanded; i++) {
  const bd = await tapTile(dHex);
  await sleep(900);
  pageLanded = (w2.state?.field ?? []).some((u) => u.name === "Pagekin");
  if (process.env.WHEEL_DEBUG) {
    const diag = await page.evaluate(() => ({
      caption: document.querySelector(".gw-caption")?.textContent ?? null,
      wheelOpen: !!document.querySelector(".gw-wheel"),
      notice: document.querySelector(".notice-line")?.textContent ?? document.querySelector(".error-line")?.textContent ?? null,
      placing: document.querySelector(".placing-bar")?.textContent?.slice(0, 120) ?? null,
    }));
    console.log(`    [tap ${i}] bd=${bd} landed=${pageLanded} diag=${JSON.stringify(diag)} tales=${JSON.stringify((w2.state?.tale ?? []).slice(-3).map((t) => t.text))}`);
  }
}
ok("the wheel flow lands Pagekin on the tapped ground", pageLanded);
await page.screenshot({ path: `${OUT}/wheel-summon.png` });
await browser.close();

console.log(`\nWHEEL SUMMON DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
