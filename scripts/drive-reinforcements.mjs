// REINFORCEMENTS — RECOVERY R6 DRIVE (2026-10-23; Nigel's
// re-ruling of 2026-10-23 07:21–07:25: "the action wheel
// was meant to be able to set party members and call
// reinforcements" — on the homeland too; reinforcement
// travel time applies ONLY at the Table when NO bastion
// plays; with a bastion the air drop is INSTANT; on the
// homeland reinforcements are INSTANT; and from play,
// 2026-10-23 11:12: "i have 60 awoken in my deck that could
// be reinforcements but i see no way to access them").
// Boots the real server in-process on a scratch DATA_DIR
// with the road shortened by its own env dial
// (TABLE_REINFORCEMENT_MS — the production default stands
// at the road's four minutes) and proves:
//   §1 THE TABLE, NO BASTION — the wheel's deck is served;
//      a called deck Awoken enters `incoming`, is NOT in
//      the party and NOT on the field while the road walks,
//      its price is charged; when the road settles its
//      membership lands, it stands in the wheel's company,
//      and the summon cast fields it.
//   §4 THE REFUSALS (inside §1's sitting, while the roads
//      walk) — already-party, already-on-the-road, and
//      party-full are each refused in plain words.
//   §2 THE TABLE, WITH A BASTION — the call air-drops: the
//      membership lands at once, no road stands, nothing is
//      charged for the road, and the summon cast fields it
//      out of the bastion pool's ground.
//   §3 THE HOMELAND — the deck is served with the field;
//      the call lands at once (party view + the wheel's
//      company agree), costs nothing, and the summon cast
//      fields the called Awoken; an already-party name is
//      refused plainly.
// Run: node scripts/drive-reinforcements.mjs
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-reinforcements-"));
process.env.PORT = "3987";
process.env.WORKSHOP_PASSWORD = ["reinf", "drive", "pw"].join("-");
process.env.TABLE_REINFORCEMENT_MS = "2500"; // the road, shortened by its own dial — production keeps 240000
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3987";
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
  return data;
}
async function callRaw(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }

function seedAwokin(ownerKey, tenderName, name, partPower = 1) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, 'root', ?, 'image/png', ?)").run(`${name} ${cat}`, cat, partPower, partPower, `reinf/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: partPower, toughness: partPower, element: "root" });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)").run(name, name, `reinf/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
async function claimBound(name, discordId) {
  const claim = await call("claimTender", { password: "reinforcements-password", tenderName: name });
  const token = claim.token;
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, Date.now());
  await call("chooseClass", { classKey: "warden" }, token);
  await call("chooseWeapon", { weaponKey: "sword" }, token);
  const { issueTableToken } = await import("../server/dist/table.js");
  const tt = issueTableToken({ id: discordId, name });
  const code = (await call("getTableBindCode", {}, token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code }) });
  if (!bindRes.ok) throw new Error(`table/bind -> ${bindRes.status}`);
  return { token, ownerKey, tt, tenderId };
}
const partyRows = (ownerKey) => db.prepare("SELECT awakened_id FROM tender_party WHERE owner_key = ? ORDER BY awakened_id").all(ownerKey).map(r => r.awakened_id);

function client(label) {
  const ws = new WebSocket("ws://127.0.0.1:3987/table/ws");
  const c = { label, ws, state: null, you: null, errors: [] };
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "state") { c.state = m.state; c.you = m.you; }
    if (m.type === "error" || m.type === "joinError") c.errors.push(m.message);
  });
  c.send = (msg) => ws.send(JSON.stringify(msg));
  c.join = (joinMsg) => new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error(`${label}: join timeout`)), 15000);
    ws.on("open", () => {
      c.send({ type: "join", ...joinMsg });
      const iv = setInterval(() => { if (c.state) { clearInterval(iv); clearTimeout(to); resolve(); } }, 100);
    });
  });
  c.waitFor = async (fn, what, timeout = 20000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) { if (c.state && fn(c)) return true; await sleep(200); }
    throw new Error(`${label}: timed out waiting for ${what}; errors: ${c.errors.join(" | ")}; tale tail: ${(c.state?.tale ?? []).slice(-3).map((t) => t.text).join(" | ")}`);
  };
  c.poke = async () => { c.send({ type: "notes", text: "" }); await sleep(250); };
  return c;
}
// The summon cast by ledger id, retried across its falters
// (a falter spends the price and stands nothing).
async function summonById(c, awakenedId, tries = 14) {
  for (let i = 0; i < tries; i++) {
    c.send({ type: "summonCast", awakenedId });
    try { await c.waitFor((cc) => cc.state.field.some((u) => u.awokenId === awakenedId), `summon of ${awakenedId}`, 2200); return true; } catch { /* a falter — cast again */ }
  }
  return false;
}

/* ── §1 THE TABLE, NO BASTION — THE ROAD ────────────────── */
{
  console.log("§1 the Table without a bastion — the called reinforcement walks the road, then fields");
  const T = await claimBound("Road Caller", "rf-1");
  const M = seedAwokin(T.ownerKey, "Road Caller", "Standing Member");       // power 3
  const R1 = seedAwokin(T.ownerKey, "Road Caller", "First Reinforcement"); // power 3 — road price ✦3
  const R2 = seedAwokin(T.ownerKey, "Road Caller", "Second Reinforcement");
  const R3 = seedAwokin(T.ownerKey, "Road Caller", "Third Reinforcement");
  await call("addToParty", { awakenedId: M }, T.token);
  // The weapon rests (drive-homeland-summon's pin): a swing
  // between two energy reads would muddy the road's price.
  db.prepare("UPDATE tender_progress SET weapon_next_at = ? WHERE owner_key = ?").run(Date.now() + 3600_000, T.ownerKey);
  ok("the party starts with the one composed member — the other three stand in the deck (Nigel's 60-Awoken case, in miniature)",
    partyRows(T.ownerKey).join(",") === String(M));

  const b = client("T1");
  await b.join({ authToken: T.tt, room: "reinf-road" });
  await b.waitFor((cc) => (cc.you.reinforcements ?? []).length === 3, "the wheel's reinforcement deck served", 15000);
  ok("the wheel is served the deck it can call in — exactly the three non-party Awoken, each at its road price",
    (b.you.reinforcements ?? []).map(r => r.awakenedId).sort((x, y) => x - y).join(",") === [R1, R2, R3].join(",")
    && (b.you.reinforcements ?? []).every(r => r.cost === 3),
    JSON.stringify(b.you.reinforcements));

  b.send({ type: "startWave" });
  await b.waitFor((cc) => cc.state.battle.active && cc.state.dark.length > 0, "the wave stands", 15000);
  const e0 = b.you.energy;
  b.send({ type: "callReinforcement", awakenedId: R1 });
  await b.waitFor((cc) => (cc.you.partyView?.incoming ?? []).some(i => i.awakenedId === R1), "the first road stands in the party display", 10000);
  const inc = (b.you.partyView?.incoming ?? []).find(i => i.awakenedId === R1);
  ok("the called reinforcement enters incoming — its price on the road, its arrival ahead of now",
    !!inc && inc.cost === 3 && inc.arrivesAt > Date.now() && inc.arrivesAt <= Date.now() + 2600,
    JSON.stringify(inc));
  // The drop carries the road's ✦3 — plus, when the dealt
  // wave holds a Hollow, its ambient drain on every standing
  // purse (the Hollow's own law), so the seat's energy is
  // read as a band, never an exact figure.
  ok("the road's price was charged at the choosing", b.you.energy <= e0 - 3 && b.you.energy > e0 - 3 - 3, `energy ${e0} -> ${b.you.energy}`);
  ok("while the road walks, the reinforcement is NOT in the party and NOT on the field",
    !partyRows(T.ownerKey).includes(R1) && !b.state.field.some(u => u.awokenId === R1));
  ok("the tale names the road and its price, paid twice over as the road has always charged",
    (b.state.tale ?? []).some(t => /First Reinforcement is called/.test(t.text) && /paid twice over/.test(t.text)),
    (b.state.tale ?? []).slice(-4).map(t => t.text).join(" | "));

  /* ── §4 THE REFUSALS, WHILE THE ROADS WALK ── */
  console.log("§4 the refusals — already-party, already-on-the-road, party-full");
  const errMark = b.errors.length;
  b.send({ type: "callReinforcement", awakenedId: R1 });
  await sleep(450);
  ok("calling one already on the road is refused in plain words",
    b.errors.slice(errMark).some(e => /already on the road/.test(e)), JSON.stringify(b.errors.slice(errMark)));
  b.send({ type: "callReinforcement", awakenedId: M });
  await sleep(450);
  ok("calling a standing party member is refused — the summon cast is its door",
    b.errors.slice(errMark).some(e => /already stands in your party/.test(e)), JSON.stringify(b.errors.slice(errMark)));
  b.send({ type: "callReinforcement", awakenedId: R2 });
  await b.waitFor((cc) => (cc.you.partyView?.incoming ?? []).length === 2, "the second road stands", 10000);
  ok("a second road stands beside the first — members and roads together fill the party's width",
    (b.you.partyView?.openSpots ?? -1) === 0, JSON.stringify(b.you.partyView));
  b.send({ type: "callReinforcement", awakenedId: R3 });
  await sleep(450);
  ok("with the party's width full of members and roads, the next call is refused — the party is full",
    b.errors.slice(errMark).some(e => /party is full/.test(e)), JSON.stringify(b.errors.slice(errMark)));

  // The roads settle (2.5 s by the dial): membership lands.
  await b.waitFor((cc) => (cc.you.partyView?.incoming ?? []).length === 0
    && (cc.you.company ?? []).some(cd => cd.awokenId === R1)
    && (cc.you.company ?? []).some(cd => cd.awokenId === R2), "both roads settled into the party", 15000);
  ok("when the roads settle, both memberships land — the party holds all three, and nothing is incoming",
    partyRows(T.ownerKey).join(",") === [M, R1, R2].join(",") && (b.you.partyView?.incoming ?? []).length === 0,
    partyRows(T.ownerKey).join(","));
  ok("the landed reinforcement stands in the wheel's company, callable by the summon cast",
    (b.you.company ?? []).some(cd => cd.awokenId === R1));
  ok("the tale tells the arrival", (b.state.tale ?? []).some(t => /First Reinforcement arrives/.test(t.text)),
    (b.state.tale ?? []).slice(-5).map(t => t.text).join(" | "));
  ok("the landed reinforcement then FIELDS by the summon cast",
    await summonById(b, R1) && b.state.field.some(u => u.awokenId === R1));
  b.ws.close();
}

/* ── §2 THE TABLE, WITH A BASTION — THE AIR DROP ────────── */
{
  console.log("§2 the Table with a bastion — the call air-drops, instant");
  const H = await claimBound("Bastion Host", "rf-2");
  const HM = seedAwokin(H.ownerKey, "Bastion Host", "Host Member");
  const D = seedAwokin(H.ownerKey, "Bastion Host", "Dropped Reinforcement");
  await call("addToParty", { awakenedId: HM }, H.token);
  db.prepare("UPDATE tender_progress SET weapon_next_at = ? WHERE owner_key = ?").run(Date.now() + 3600_000, H.ownerKey);
  const now = Date.now();
  const tileId = Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, 0, 0, 'root', 0, ?)").run(H.ownerKey, now).lastInsertRowid);
  const seedId = Number(db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at) VALUES (?, ?, 1, 'fallen', ?)").run(H.ownerKey, tileId, now).lastInsertRowid);
  const callId = Number(db.prepare("INSERT INTO bastion_calls (owner_key, host_tender_id, column_id, seed_id, kind, state, created_at) VALUES (?, ?, NULL, ?, 'bastion', 'open', ?)").run(H.ownerKey, H.tenderId, seedId, now).lastInsertRowid);

  const b = client("T2");
  await b.join({ authToken: H.tt, room: "reinf-bastion" });
  await b.waitFor((cc) => (cc.you.reinforcements ?? []).some(r => r.awakenedId === D), "the deck served at the bastion table", 15000);
  b.send({ type: "claimBastion", callId });
  await b.waitFor((cc) => !!cc.state.bastion && cc.state.bastion.callId === callId, "the call claimed", 15000);
  b.send({ type: "startBastion" });
  await b.waitFor((cc) => cc.state.battle.active && cc.state.bastion?.begun, "the bastion battle joined", 15000);
  const pool0 = b.state.bastion.pool;
  b.send({ type: "callReinforcement", awakenedId: D });
  await b.waitFor((cc) => (cc.you.party ?? []).includes(D), "the air drop landed in the party", 10000);
  ok("with a bastion playing, the call lands the membership AT ONCE — the ledger holds it in this breath",
    partyRows(H.ownerKey).includes(D));
  ok("no road stands for an air drop — nothing is incoming",
    (b.you.partyView?.incoming ?? []).length === 0, JSON.stringify(b.you.partyView?.incoming));
  ok("the air drop charged the bastion pool nothing for the road",
    b.state.bastion.pool === pool0, `pool ${pool0} -> ${b.state.bastion.pool}`);
  ok("the tale names the air drop", (b.state.tale ?? []).some(t => /air-drops to/.test(t.text) && /Dropped Reinforcement/.test(t.text)),
    (b.state.tale ?? []).slice(-4).map(t => t.text).join(" | "));
  ok("the dropped reinforcement stands in the wheel's company, and FIELDS by the summon cast",
    await summonById(b, D) && b.state.field.some(u => u.awokenId === D));
  b.ws.close();
}

/* ── §3 THE HOMELAND — INSTANT ──────────────────────────── */
{
  console.log("§3 the homeland — the call lands at once");
  const claim = await call("claimTender", { password: "reinforcements-password", tenderName: "Home Caller" });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, Date.now());
  db.prepare("UPDATE tender_progress SET class_key = 'warden' WHERE owner_key = ?").run(ownerKey);
  const HM = seedAwokin(ownerKey, "Home Caller", "Home Member");
  const HD = seedAwokin(ownerKey, "Home Caller", "Home Reinforcement");
  await call("addToParty", { awakenedId: HM }, claim.token);
  const now = Date.now();
  const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', 0, ?)");
  insTile.run(ownerKey, 0, 0, now);
  insTile.run(ownerKey, 1, 0, now);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 100000, ?)").run(ownerKey, now);

  const terr = await call("getTerritory", {}, claim.token);
  ok("the homeland field serves the reinforcement deck with the company — the deck Awoken, and not the member",
    (terr.summoning?.reinforcements ?? []).some(r => r.awakenedId === HD)
    && !(terr.summoning?.reinforcements ?? []).some(r => r.awakenedId === HM),
    JSON.stringify((terr.summoning?.reinforcements ?? []).map(r => r.name)));
  const e0 = db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(ownerKey).energy;
  const r = await call("callReinforcement", { awakenedId: HD }, claim.token);
  ok("the homeland call lands AT ONCE — the answer names it instant, and the party view holds the new member",
    r.reinforcement?.instant === true && (r.members ?? []).some(m => m.awakenedId === HD) && partyRows(ownerKey).includes(HD),
    JSON.stringify(r.reinforcement ?? r));
  ok("nothing is incoming on the homeland — no road exists here", (r.incoming ?? []).length === 0, JSON.stringify(r.incoming));
  ok("the homeland call cost nothing", db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(ownerKey).energy === e0);
  const terr2 = await call("getTerritory", {}, claim.token);
  ok("the called Awoken now stands in the wheel's summon company, and has left the reinforcement deck",
    (terr2.summoning?.company ?? []).some(c => c.awakenedId === HD)
    && !(terr2.summoning?.reinforcements ?? []).some(x => x.awakenedId === HD),
    JSON.stringify((terr2.summoning?.company ?? []).map(c => c.name)));
  let landed = null;
  for (let i = 0; i < 16 && !landed; i++) {
    const s = await call("summonAwoken", { awakenedId: HD }, claim.token);
    if (s.summoned) landed = s;
  }
  ok("the called reinforcement FIELDS by the homeland summon cast", !!landed
    && db.prepare("SELECT COUNT(*) AS n FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(ownerKey, HD).n === 1);
  const again = await callRaw("callReinforcement", { awakenedId: HD }, claim.token);
  ok("calling one already in the party is refused in plain words",
    again.status === 400 && /already stands in your party/.test(again.data?.error ?? ""), JSON.stringify(again.data));
  const alien = await callRaw("callReinforcement", { awakenedId: 999999 }, claim.token);
  ok("calling an Awokin outside the deck is refused", alien.status === 400, JSON.stringify(alien.data));
}

console.log(`\nREINFORCEMENTS DRIVE (Recovery R6): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
