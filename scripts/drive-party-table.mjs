// THE PARTY SYSTEM — BUILD 2 DRIVE (2026-10-21). Boots the
// real server in-process on a scratch DATA_DIR (with the
// reinforcements road shortened to 3 s by the server's own
// env measure, TABLE_REINFORCEMENT_MS — the four minutes
// are Nigel's number in the code; the drive drives the
// clock, it does not sleep it) and proves the party's
// meeting with the Table:
//   §D THE DEAL — a composed party is the hand: members are
//      dealt; a member on the homeland field and a member
//      staged at the bastion are named in the elsewhere row
//      and NOT dealt; a non-member is not dealt at all. The
//      control (the strict law, Nigel 2026-10-21): a Tender
//      who never composed a party is dealt an EMPTY hand —
//      yet the seat stands bound, party display and all, so
//      the reinforcements road can find the unprepared.
//   §S THE SUMMON LAW (Nigel, 2026-10-21: "the party is the
//      ONLY Awoken a Tender can summon") — a card dealt
//      while its creature stood in the party goes stale
//      when the creature is benched, and the summon door
//      itself refuses it; a member's card summons as always.
//   §B THE IN-HAND BONUS (Nigel, 2026-10-21: "party size
//      'in hand' on the zodiac wheel raises your total
//      energy. when they are summoned, they no longer
//      provide that bonus") — the seat's maximum drops by
//      exactly a member's band share when it is summoned
//      (clamping the current energy where the summon price
//      was less than the share), and is restored when the
//      member stands in hand again — without the energy
//      filling to meet it. A campaign seat reckons the
//      same way.
//   §R THE REINFORCEMENTS ROAD — chosen on the deck screen
//      (the Zodiac's addToParty door) while a battle stands:
//      the spot is reserved and shown on the road at the
//      Table and in the Zodiac; the road charges the Awokin's
//      summon price (max(1, power) ✦) from the seat purse at
//      the choosing; a purse that cannot pay refuses plainly
//      and starts no road; membership and hand card land
//      together when the timer completes; benching from the
//      Zodiac mid-battle is refused in plain words.
//   §E THE END — a battle ending first closes the road: no
//      membership, and the ✦ returns whole (through the
//      campaign bank, the purse this battle drew on). At the
//      campaign's end, a fielded Awokin put outside the
//      party by a march order truly dissipates with a fall's
//      re-coalescence (dispersed_until ≈ +4 h) and the tale
//      names it; a fielded member stands untouched.
//   §L THE PARTY LEVEL (Nigel's fold-in, 2026-10-21 11:41,
//      corrected 11:42) — the Party skill stands on the wheel
//      as a type of its own; untrained the party starts at 3;
//      every 3 party levels add a spot; the Muster stars'
//      bonus stands on top: cap = 3 + ⌊partyLevel/3⌋ + Muster.
// Run: node scripts/drive-party-table.mjs
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

const OUT = "/home/hatch/workspace/party-table-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-party-table-"));
process.env.PORT = "3981";
process.env.TABLE_REINFORCEMENT_MS = "3000";
process.env.WORKSHOP_PASSWORD = ["party", "table", "pw"].join("-");
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3981";
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

const db = new Database(join(process.env.DATA_DIR, "app.db"));
// Fresh-DB stand-up for the known store migration-order
// defect (production untouched — the Audit carries it).
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }

function seedAwokin(ownerKey, tenderName, name, partPower = 1) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, 'root', ?, 'image/png', ?)").run(`${name} ${cat}`, cat, partPower, partPower, `ptable/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: partPower, toughness: partPower, element: "root" });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)").run(name, name, `ptable/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
async function claimBound(name, discordId) {
  const claim = await call("claimTender", { password: "party-table-password", tenderName: name });
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
  return { token, ownerKey, tt };
}
const partyRows = (ownerKey) => db.prepare("SELECT awakened_id FROM tender_party WHERE owner_key = ? ORDER BY awakened_id").all(ownerKey).map(r => r.awakened_id);
const dispersedOf = (id) => (db.prepare("SELECT dispersed_until FROM awakened WHERE id = ?").get(id) ?? {}).dispersed_until ?? null;

const parseId = (id) => id.split(",").map(Number);
const axialDist = (a, b) => { const [aq, ar] = parseId(a), [bq, br] = parseId(b); return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs((aq + ar) - (bq + br))) / 2; };
function client(label) {
  const ws = new WebSocket("ws://127.0.0.1:3981/table/ws");
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
async function summonOnto(c, cardId, nearId) {
  const spots = c.state.map.filter((t) => !t.cursed && t.id !== "0,0" && axialDist(t.id, nearId) <= 1);
  for (const s of spots) {
    c.send({ type: "summon", cardId, hex: s.id });
    try { await c.waitFor((cc) => cc.state.field.some((u) => u.cardId === cardId), `summon onto ${s.id}`, 4000); return s.id; } catch { /* next spot */ }
  }
  throw new Error("no summonable pure neighbour of " + nearId);
}

/* ── §D THE DEAL ────────────────────────────────────────── */
{
  console.log("§D the deal — a composed party is the hand; the strict control");
  const P = await claimBound("Deal Tender", "pt-d");
  // The width now comes from the Party skill (the fold-in):
  // three Party levels bought on the wheel make the party
  // four wide — room for the four members below.
  await call("unlockSkill", { key: "c_hp1" }, P.token);
  for (const k of ["party_1", "party_2", "party_3"]) await call("unlockSkill", { key: k }, P.token);
  const vP = await call("getParty", {}, P.token);
  ok("the Party skill widens this party to four before it is composed",
    vP.partyLevel === 3 && vP.levelBonus === 1 && vP.musterBonus === 0 && vP.cap === 4, JSON.stringify(vP));
  const P1 = seedAwokin(P.ownerKey, "Deal Tender", "Party One");
  const P2 = seedAwokin(P.ownerKey, "Deal Tender", "Party Two");
  const P3 = seedAwokin(P.ownerKey, "Deal Tender", "Deck Three");
  const P4 = seedAwokin(P.ownerKey, "Deal Tender", "Post Four");
  const P5 = seedAwokin(P.ownerKey, "Deal Tender", "Staged Five");
  for (const id of [P1, P2, P4, P5]) await call("addToParty", { awakenedId: id }, P.token);
  ok("the party is composed over HTTP before the seat is taken", partyRows(P.ownerKey).join(",") === [P1, P2, P4, P5].join(","));

  const now = Date.now();
  const tileId = Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, 0, 0, 'root', 0, ?)").run(P.ownerKey, now).lastInsertRowid);
  db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, hp) VALUES (?, ?, ?, ?, ?, 30)").run(P.ownerKey, P4, tileId, now, now);
  db.prepare("INSERT INTO bastion_staged (owner_key, awakened_id, staged_at, via) VALUES (?, ?, ?, 'hand')").run(P.ownerKey, P5, now);

  const b = client("D");
  await b.join({ authToken: P.tt, room: "party-table-deal" });
  const handIds = (b.you.hand ?? []).map((cd) => cd.awokenId).sort((x, y) => x - y);
  ok("the hand is dealt from the party — exactly the two members who can take this field",
    handIds.join(",") === [P1, P2].join(","), JSON.stringify((b.you.hand ?? []).map((cd) => cd.name)));
  const elseNames = (b.you.elsewhere ?? []).map((e) => `${e.name}:${e.where}`).sort();
  ok("the kept-back members are named in the elsewhere row, exactly the two of them",
    elseNames.join("|") === "Post Four:fielded|Staged Five:staged",
    JSON.stringify(b.you.elsewhere));
  ok("the homeland member is named as fielded, the bastion member as staged",
    (b.you.elsewhere ?? []).some((e) => e.name === "Post Four" && e.where === "fielded")
    && (b.you.elsewhere ?? []).some((e) => e.name === "Staged Five" && e.where === "staged"),
    JSON.stringify(b.you.elsewhere));
  ok("the non-member is nowhere — not dealt, not named elsewhere",
    !handIds.includes(P3) && !(b.you.elsewhere ?? []).some((e) => e.name === "Deck Three"));
  const pv = b.you.partyView;
  ok("the seat's party display lists all four members with their standings",
    !!pv && pv.members.length === 4
    && pv.members.find((m) => m.awakenedId === P1)?.standing === "hand"
    && pv.members.find((m) => m.awakenedId === P4)?.standing === "post"
    && pv.members.find((m) => m.awakenedId === P5)?.standing === "post"
    && pv.openSpots === 0 && (pv.incoming ?? []).length === 0,
    JSON.stringify(pv));
  b.ws.close();

  const Q = await claimBound("Roster Tender", "pt-q");
  seedAwokin(Q.ownerKey, "Roster Tender", "Roster One");
  seedAwokin(Q.ownerKey, "Roster Tender", "Roster Two");
  const qc = client("Q");
  await qc.join({ authToken: Q.tt, room: "party-table-roster" });
  ok("the strict control: a Tender who never composed a party is dealt an EMPTY hand — nothing summonable",
    Array.isArray(qc.you.hand) && qc.you.hand.length === 0,
    JSON.stringify((qc.you.hand ?? []).map((cd) => cd.name)));
  ok("the strict control: the empty-handed seat still stands bound to its Tender, with its energy",
    !!qc.you.bound && qc.you.maxEnergy > 0, JSON.stringify({ bound: qc.you.bound, maxEnergy: qc.you.maxEnergy }));
  ok("the strict control: the party display stands for the empty ledger — three open spots, the road's door",
    !!qc.you.partyView && qc.you.partyView.members.length === 0 && qc.you.partyView.cap === 3 && qc.you.partyView.openSpots === 3,
    JSON.stringify(qc.you.partyView));
  qc.ws.close();
}

/* ── §S THE SUMMON LAW ──────────────────────────────────── */
{
  console.log("§S the summon law — the party alone can be summoned, struck at the door itself");
  const W = await claimBound("Gate Tender", "pt-w");
  const W1 = seedAwokin(W.ownerKey, "Gate Tender", "Gate Member");
  const W2 = seedAwokin(W.ownerKey, "Gate Tender", "Gate Outsider");
  // The party is composed BEFORE the sitting (the strict
  // deal): both members are dealt; nothing else is.
  await call("addToParty", { awakenedId: W1 }, W.token);
  await call("addToParty", { awakenedId: W2 }, W.token);
  const b = client("W");
  await b.join({ authToken: W.tt, room: "party-table-gate" });
  const cardW1 = (b.you.hand ?? []).find((cd) => cd.awokenId === W1);
  const cardW2 = (b.you.hand ?? []).find((cd) => cd.awokenId === W2);
  ok("the composed party is the hand — both members are dealt", !!cardW1 && !!cardW2,
    JSON.stringify((b.you.hand ?? []).map((cd) => cd.name)));
  // Bench Gate Outsider mid-sitting — no battle stands, so
  // the bench is free. Its dealt card stays in the seat,
  // stale — and the summon DOOR is what must refuse it.
  await call("removeFromParty", { awakenedId: W2 }, W.token);
  ok("the bench stands in the ledger", partyRows(W.ownerKey).join(",") === String(W1),
    partyRows(W.ownerKey).join(","));
  const anchor = b.you.landing ?? b.state.players.find((p) => p.key === b.you.key)?.hex;
  const spot = b.state.map.find((t) => !t.cursed && t.id !== "0,0" && axialDist(t.id, anchor) <= 1);
  const errBefore = b.errors.length;
  b.send({ type: "summon", cardId: cardW2.id, hex: spot.id });
  await sleep(700);
  ok("the summon road refuses a non-member, in plain words",
    b.errors.slice(errBefore).some((e) => /not in your party/.test(e)), JSON.stringify(b.errors.slice(errBefore)));
  ok("the non-member never took the field", !b.state.field.some((u) => u.awokenId === W2));
  await summonOnto(b, cardW1.id, anchor);
  ok("the member summons as always", b.state.field.some((u) => u.awokenId === W1));
  b.ws.close();
}

/* ── §R THE REINFORCEMENTS ROAD ─────────────────────────── */
{
  console.log("§R the reinforcements road — reserve, price, refusal, landing");
  const U = await claimBound("Road Tender", "pt-u");
  // Six Party levels on the wheel: the party stands five
  // wide (3 + ⌊6/3⌋), as the checks below reckon.
  await call("unlockSkill", { key: "c_hp1" }, U.token);
  for (const k of ["party_1", "party_2", "party_3", "party_4", "party_5", "party_6"]) await call("unlockSkill", { key: k }, U.token);
  const M1 = seedAwokin(U.ownerKey, "Road Tender", "Member One", 1);   // power 3
  const R1 = seedAwokin(U.ownerKey, "Road Tender", "Road One", 1);     // power 3
  const R4 = seedAwokin(U.ownerKey, "Road Tender", "Road Pricey", 3);  // power 9
  await call("addToParty", { awakenedId: M1 }, U.token);

  const b = client("U");
  await b.join({ authToken: U.tt, room: "party-table-road" });
  const cardM1 = (b.you.hand ?? []).find((cd) => cd.awokenId === M1);
  ok("the seat's hand holds only the composed member", !!cardM1 && (b.you.hand ?? []).length === 1,
    JSON.stringify((b.you.hand ?? []).map((cd) => cd.name)));
  const anchor = b.you.landing ?? b.state.players.find((p) => p.key === b.you.key)?.hex;
  await summonOnto(b, cardM1.id, anchor);
  b.send({ type: "startWave" });
  await b.waitFor((cc) => cc.state.battle.active && cc.state.dark.length > 0, "the wave stands", 15000);
  ok("the battle stands", true);
  await b.poke();
  ok("the seat's party display shows the member on the field and the open spots",
    b.you.partyView?.members.find((m) => m.awakenedId === M1)?.standing === "field" && b.you.partyView?.openSpots === 4,
    JSON.stringify(b.you.partyView));

  const e0 = b.you.energy;
  const r1 = await call("addToParty", { awakenedId: R1 }, U.token);
  ok("the deck-screen fill starts a road instead of landing (mid-battle)",
    !!r1.reinforcement && r1.reinforcement.awakenedId === R1, JSON.stringify(r1.reinforcement ?? r1));
  ok("the road's price is the Awokin's summon price — max(1, power) ✦",
    r1.reinforcement.cost === Math.max(1, r1.deck.find((d) => d.awakenedId === R1)?.power ?? -1),
    `cost ${r1.reinforcement.cost}, deck face ${JSON.stringify(r1.deck.find((d) => d.awakenedId === R1))}`);
  ok("the Zodiac's view names the road and its price; the ledger does not yet hold the creature",
    (r1.incoming ?? []).some((i) => i.awakenedId === R1 && i.cost === r1.reinforcement.cost)
    && !partyRows(U.ownerKey).includes(R1) && partyRows(U.ownerKey).includes(M1),
    JSON.stringify(r1.incoming));
  await b.poke();
  ok("the price left the seat purse at the choosing", b.you.energy === e0 - r1.reinforcement.cost,
    `energy ${e0} -> ${b.you.energy}, cost ${r1.reinforcement.cost}`);
  ok("the Table shows the incoming creature on its way",
    (b.you.partyView?.incoming ?? []).some((i) => i.awakenedId === R1 && i.arrivesAt > Date.now()),
    JSON.stringify(b.you.partyView?.incoming));

  // Drain the purse with Manifest copies (✦4 a cast, flat)
  // until the pricey road cannot be paid.
  for (let i = 0; i < 6 && b.you.energy >= 9; i++) {
    b.send({ type: "manifest" });
    await sleep(400);
  }
  await b.poke();
  ok("the purse is drained below the pricey road's price", b.you.energy < 9, `energy ${b.you.energy}`);
  const holdAtRefusal = b.you.energy;
  let refusal = null;
  try { await call("addToParty", { awakenedId: R4 }, U.token); } catch (e) { refusal = e; }
  ok("a purse that cannot pay refuses the fill plainly, and starts no road",
    !!refusal && new RegExp(`road costs ✦9 — you hold ✦${holdAtRefusal}`).test(refusal.message) && /no road is started/.test(refusal.message),
    refusal ? refusal.message : "no refusal");
  const vRef = await call("getParty", {}, U.token);
  ok("the refused fill reserved nothing and wrote nothing",
    !(vRef.incoming ?? []).some((i) => i.awakenedId === R4) && !partyRows(U.ownerKey).includes(R4),
    JSON.stringify(vRef.incoming));

  // Benching mid-battle is refused in plain words.
  let benchRefusal = null;
  try { await call("removeFromParty", { awakenedId: M1 }, U.token); } catch (e) { benchRefusal = e; }
  ok("benching from the Zodiac mid-battle is refused in plain words, and the membership stands",
    !!benchRefusal && /running battle/.test(benchRefusal.message) && partyRows(U.ownerKey).includes(M1),
    benchRefusal ? benchRefusal.message : "no refusal");

  // The road lands: membership and card together.
  await b.waitFor((cc) => (cc.you.party ?? []).includes(R1), "the road landing in the seat's payload", 25000);
  ok("the membership landed when the road completed", partyRows(U.ownerKey).includes(R1));
  ok("the hand card landed with it — the creature stands in the hand, ready to summon",
    (b.you.hand ?? []).some((cd) => cd.awokenId === R1), JSON.stringify((b.you.hand ?? []).map((cd) => cd.name)));
  const vLand = await call("getParty", {}, U.token);
  ok("the road is spent — no incoming remains, and the member stands in the Zodiac's party",
    (vLand.incoming ?? []).length === 0 && vLand.members.some((m) => m.awakenedId === R1), JSON.stringify(vLand.incoming));
  b.ws.close();
}

/* ── §B THE IN-HAND BONUS ───────────────────────────────── */
{
  console.log("§B the in-hand bonus — the seat's maximum is a living reckoning");
  // A slim Awokin built by hand: one part of power 1, the
  // rest 0 — filed power 1, so its band share is +2 (the
  // 1–3 band) while its summon price is max(1, 1) = 1. The
  // one creature whose price is LESS than its share — the
  // case that makes the energy clamp visible.
  const seedSlim = (ownerKey, tenderName, name) => {
    const nowT = Date.now();
    const parts = [];
    ["body", "arms", "head"].forEach((cat, i) => {
      const power = i === 0 ? 1 : 0;
      const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, 1, 'root', ?, 'image/png', ?)").run(`${name} ${cat}`, cat, power, `ptable/${name}-${cat}.png`, nowT).lastInsertRowid);
      parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power, toughness: 1, element: "root" });
    });
    return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)").run(name, name, `ptable/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
  };
  const G = await claimBound("Bonus Tender", "pt-g");
  const S1 = seedSlim(G.ownerKey, "Bonus Tender", "Slim One");              // power 1 — share +2, price 1
  const H1 = seedAwokin(G.ownerKey, "Bonus Tender", "Heavy One", 2);       // power 6 — share +4, price 6
  await call("addToParty", { awakenedId: S1 }, G.token);
  await call("addToParty", { awakenedId: H1 }, G.token);
  const b = client("G");
  await b.join({ authToken: G.tt, room: "party-table-bonus" });
  // The standing reckoning: 10 + 2 (Slim) + 4 (Heavy) = 16.
  ok("with the whole party in hand, the seat's maximum is the standing reckoning",
    b.you.maxEnergy === 16 && b.you.energy === 16, `max ${b.you.maxEnergy}, energy ${b.you.energy}`);
  const cardS = (b.you.hand ?? []).find((cd) => cd.awokenId === S1);
  const cardH = (b.you.hand ?? []).find((cd) => cd.awokenId === H1);
  const anchor = b.you.landing ?? b.state.players.find((p) => p.key === b.you.key)?.hex;
  await summonOnto(b, cardS.id, anchor);
  // Price 1 paid: energy 15 against a maximum of 16 — then
  // the share leaves with the summon: maximum 14, and the
  // energy CLAMPS to it.
  ok("summoning the slim member drops the maximum by exactly its share — and the energy clamps to it",
    b.you.maxEnergy === 14 && b.you.energy === 14, `max ${b.you.maxEnergy}, energy ${b.you.energy}`);
  await summonOnto(b, cardH.id, anchor);
  // Price 6 paid: energy 8; the +4 share leaves: maximum 10.
  ok("summoning the heavy member drops the maximum by exactly its share",
    b.you.maxEnergy === 10 && b.you.energy === 8, `max ${b.you.maxEnergy}, energy ${b.you.energy}`);
  // Recall the heavy one: the maximum is restored; the
  // energy does NOT fill to meet it.
  const unitH = b.state.field.find((u) => u.awokenId === H1);
  b.send({ type: "recall", hex: unitH.hex, cardId: cardH.id });
  await b.waitFor((cc) => !cc.state.field.some((u) => u.awokenId === H1), "the heavy member recalled to hand");
  await b.poke();
  ok("a member back in hand restores the maximum — and the energy does not fill to meet it",
    b.you.maxEnergy === 14 && b.you.energy === 8, `max ${b.you.maxEnergy}, energy ${b.you.energy}`);
  b.ws.close();

  // The campaign seat reckons the same way (the spot-check):
  // one member, power 3 — share +2, price 3.
  const G2 = await claimBound("Campaign Bonus Tender", "pt-g2");
  const CS = seedAwokin(G2.ownerKey, "Campaign Bonus Tender", "Campaign Slim", 1);
  await call("addToParty", { awakenedId: CS }, G2.token);
  const roomC = "campaign-party-table-bonus";
  const stc = client("ST-B");
  await stc.join({ devName: "Bonus Storytender", room: roomC });
  // The seat is claimed in the room now (Campaign Build 1) —
  // the door no longer confers it.
  stc.send({ type: "claimStoryteller" });
  await stc.waitFor((c2) => !!c2.you?.storytender, "the bonus storytender's claim", 15000);
  const b2 = client("G2");
  await b2.join({ authToken: G2.tt, room: roomC });
  ok("the campaign seat opens at the standing reckoning too",
    b2.you.maxEnergy === 12 && b2.you.energy === 12, `max ${b2.you.maxEnergy}, energy ${b2.you.energy}`);
  const cardCS = (b2.you.hand ?? []).find((cd) => cd.awokenId === CS);
  const anchor2 = b2.you.landing ?? b2.state.players.find((p) => p.key === b2.you.key)?.hex;
  await summonOnto(b2, cardCS.id, anchor2);
  ok("a campaign seat reckons the same way — the maximum drops by the member's share on the summon",
    b2.you.maxEnergy === 10 && b2.you.energy === 9, `max ${b2.you.maxEnergy}, energy ${b2.you.energy}`);
  b2.ws.close(); stc.ws.close();
}

/* ── §L THE PARTY LEVEL ─────────────────────────────────── */
{
  console.log("§L the party level — a skill of its own type; the Muster bonus on top");
  const L = await claimBound("Level Tender", "pt-l");
  const v0 = await call("getParty", {}, L.token);
  ok("untrained, the party starts at 3 spots (Nigel's confirmed number)",
    v0.cap === 3 && v0.partyLevel === 0 && v0.levelBonus === 0 && v0.musterBonus === 0,
    JSON.stringify({ cap: v0.cap, partyLevel: v0.partyLevel, levelBonus: v0.levelBonus, musterBonus: v0.musterBonus }));
  const tree = await call("getSkillTree", {}, L.token);
  ok("the wheel carries nine Party stars as a type (sector) of their own",
    tree.nodes.filter((n) => n.sector === "party").length === 9,
    `party-sector nodes: ${tree.nodes.filter((n) => n.sector === "party").length} of ${tree.nodes.length}`);
  await call("unlockSkill", { key: "c_hp1" }, L.token);
  await call("unlockSkill", { key: "party_1" }, L.token);
  await call("unlockSkill", { key: "party_2" }, L.token);
  const v2 = await call("getParty", {}, L.token);
  ok("two party levels, bought with ordinary skill points — the count holds at 3 (a spot lands every 3 levels)",
    v2.partyLevel === 2 && v2.levelBonus === 0 && v2.cap === 3, JSON.stringify({ partyLevel: v2.partyLevel, cap: v2.cap }));
  await call("unlockSkill", { key: "party_3" }, L.token);
  const v3 = await call("getParty", {}, L.token);
  ok("the third party level widens the party to 4",
    v3.partyLevel === 3 && v3.levelBonus === 1 && v3.cap === 4, JSON.stringify({ partyLevel: v3.partyLevel, cap: v3.cap }));
  // The Muster term: the Escort's ledger row is written
  // directly — its road across the wheel is long, and the
  // wheel's reaching law is proven elsewhere; the seam under
  // proof here is that a HELD Muster star adds its clause on
  // top of the party level's count, as it already stood.
  db.prepare("INSERT INTO tender_skills (owner_key, skill_key, pool, created_at) VALUES (?, 'w_escort', 'tree', ?)").run(L.ownerKey, Date.now());
  const v4 = await call("getParty", {}, L.token);
  ok("the Muster bonus stands on top of the levels' count — the Escort's +2 makes 6",
    v4.musterBonus === 2 && v4.cap === 6, JSON.stringify({ musterBonus: v4.musterBonus, cap: v4.cap }));
  for (const k of ["party_4", "party_5", "party_6"]) await call("unlockSkill", { key: k }, L.token);
  const v6 = await call("getParty", {}, L.token);
  ok("the whole formula in one count: 3 to start + 2 from six party levels + 2 from the Muster = 7 spots",
    v6.partyLevel === 6 && v6.levelBonus === 2 && v6.musterBonus === 2 && v6.cap === 7,
    JSON.stringify({ partyLevel: v6.partyLevel, levelBonus: v6.levelBonus, musterBonus: v6.musterBonus, cap: v6.cap }));
}

/* ── §E THE END ─────────────────────────────────────────── */
{
  console.log("§E the end — the closed road refunds whole; the non-member dissipates, the member stands");
  const V = await claimBound("Verdant Tender", "pt-v");
  const A = seedAwokin(V.ownerKey, "Verdant Tender", "Verdant A", 1);
  const B = seedAwokin(V.ownerKey, "Verdant Tender", "Verdant B", 1);
  const C = seedAwokin(V.ownerKey, "Verdant Tender", "Verdant C", 1);
  // The party is composed BEFORE the sitting (the strict
  // deal): Verdant A and Verdant B are members — the only
  // two who can be summoned at all. Verdant C never is; it
  // is the reinforcement the road will carry.
  await call("addToParty", { awakenedId: A }, V.token);
  await call("addToParty", { awakenedId: B }, V.token);

  const room = "campaign-party-table-end";
  const st = client("ST-E");
  await st.join({ devName: "End Storytender", room });
  st.send({ type: "claimStoryteller" });
  await st.waitFor((c2) => !!c2.you?.storytender, "the end storytender's claim", 15000);
  const b = client("V");
  await b.join({ authToken: V.tt, room });
  const anchor = b.you.landing ?? b.state.players.find((p) => p.key === b.you.key)?.hex;
  const handV = b.you.hand ?? [];
  ok("the deal brought the party — both members in hand, the reinforcement nowhere",
    !!handV.find((cd) => cd.awokenId === A) && !!handV.find((cd) => cd.awokenId === B) && !handV.find((cd) => cd.awokenId === C),
    JSON.stringify(handV.map((cd) => cd.name)));
  await summonOnto(b, handV.find((cd) => cd.awokenId === A).id, anchor);
  await summonOnto(b, handV.find((cd) => cd.awokenId === B).id, anchor);
  ok("two members stand on the campaign field before the battle", b.state.field.filter((u) => u.ownerKey === b.you.key).length === 2);
  ok("the party stands at two in the ledger", partyRows(V.ownerKey).join(",") === [A, B].join(","), partyRows(V.ownerKey).join(","));
  const ePre = b.you.energy;

  st.send({ type: "stAdd", kind: "fray" });
  await st.waitFor((c2) => (c2.you?.storytender?.reserve.length ?? 0) >= 1, "the fray held in reserve", 15000);
  st.send({ type: "stDeal" });
  await b.waitFor((cc) => cc.state.battle.active, "the campaign battle stands", 15000);
  ok("the campaign battle stands — the stakes stand in one bank", b.you.energy === ePre,
    `energy ${b.you.energy} vs pre-battle ${ePre}`);

  const rc = await call("addToParty", { awakenedId: C }, V.token);
  ok("the mid-battle fill starts its road", !!rc.reinforcement && rc.reinforcement.awakenedId === C, JSON.stringify(rc.reinforcement ?? rc));
  await b.poke();
  ok("the road's price left the bank at the choosing", b.you.energy === ePre - rc.reinforcement.cost,
    `bank ${b.you.energy} vs ${ePre} - ${rc.reinforcement.cost}`);
  ok("the ledger still holds only the two members — the road has written nothing",
    partyRows(V.ownerKey).join(",") === [A, B].join(","));
  // C was never dealt (the strict deal), so the road's
  // never landing is proven by the hand standing EXACTLY as
  // it stood before the end — nothing arrived by it.
  const handBeforeEnd = (b.you.hand ?? []).map((cd) => cd.awokenId).sort((x, y) => x - y).join(",");

  // Verdant B takes a march order while the battle stands:
  // the order ends its membership (the standing law), so at
  // the end B stands FIELDED AND OUTSIDE the party — the
  // dissipation's true shape. The march's price leaves the
  // bank like any order's; the bank is read again after it.
  const unitB = b.state.field.find((u) => u.awokenId === B);
  const fromB = unitB.hex;
  const marchTargets = b.state.map.filter((t) => t.id !== "0,0" && axialDist(fromB, t.id) === 2
    && b.state.field.filter((u) => u.hex === t.id).length < 4);
  let marched = false;
  for (const t of marchTargets) {
    b.send({ type: "march", cardId: unitB.cardId, from: fromB, to: t.id });
    try { await b.waitFor((cc) => !(cc.you.party ?? []).includes(B), `the march to ${t.id} ending B's membership`, 5000); marched = true; break; } catch { /* next road */ }
  }
  ok("a march order ends the fielded member's membership mid-battle", marched, `errors: ${b.errors.join(" | ")}`);
  ok("the ledger agrees — B stands outside the party, still on the field",
    partyRows(V.ownerKey).join(",") === String(A) && b.state.field.some((u) => u.awokenId === B));
  const bankBeforeEnd = b.you.energy;

  st.send({ type: "stEnd" });
  await b.waitFor((cc) => !!cc.state.campaign?.over, "the campaign's end", 15000);
  ok("the campaign ended by the Storytender's word", true);
  ok("the road never landed — no membership was written by it, and no card arrived by it",
    partyRows(V.ownerKey).join(",") === String(A)
    && (b.you.hand ?? []).map((cd) => cd.awokenId).sort((x, y) => x - y).join(",") === handBeforeEnd);
  ok("the road's price returned whole — the bank grew by exactly the price across the end",
    b.you.energy === bankBeforeEnd + rc.reinforcement.cost,
    `energy ${b.you.energy} vs ${bankBeforeEnd} + ${rc.reinforcement.cost}`);
  ok("the tale names the closed road and the returned price",
    (b.state.tale ?? []).some((t) => /Verdant C was on the road/.test(t.text) && /returned whole/.test(t.text)),
    (b.state.tale ?? []).slice(-6).map((t) => t.text).join(" | "));
  ok("the fielded non-member is gone from the field", !b.state.field.some((u) => u.awokenId === B));
  const dB = dispersedOf(B);
  ok("the non-member truly dissipated — a fall's re-coalescence stands on its row (≈ +4 h)",
    !!dB && dB > Date.now() + 3.5 * 3600_000 && dB < Date.now() + 4.5 * 3600_000, `dispersed_until ${dB}`);
  ok("the tale names what was lost, by name",
    (b.state.tale ?? []).some((t) => /Verdant B stood outside/.test(t.text) && /truly dissipates/.test(t.text)),
    (b.state.tale ?? []).slice(-6).map((t) => t.text).join(" | "));
  ok("the fielded member stands untouched — on the field, and no re-coalescence on its row",
    b.state.field.some((u) => u.awokenId === A) && !dispersedOf(A));
  ok("the creature whose road closed is unharmed — no re-coalescence on its row either", !dispersedOf(C));
  b.ws.close(); st.ws.close();
}

console.log(`\nPARTY TABLE DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
