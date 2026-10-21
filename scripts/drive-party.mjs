// THE PARTY SYSTEM — BUILD 1 DRIVE (2026-10-21). Boots the
// real server in-process on a scratch DATA_DIR, then proves
// the party law end to end against the real doors:
//   §P the ledger over HTTP (the Zodiac's roads): the party
//      persists across reads; its width is the band law —
//      a Lv 1 Tender's party stands at three and the fourth
//      fill is refused whole; benching returns the creature
//      to the deck and frees the spot.
//   §H the homeland: adding from the field sets the
//      creature's follow on that ground; a march order and
//      a laid patrol road each end the membership.
//   §T the Table: a membership written over HTTP stands in
//      the seat's own payload (the same ledger, read across
//      grounds); adding a fielded Awokin by the unit's bar
//      road sets its follow and its standing in you.party;
//      a march order ends the membership and the follow.
// Run: node scripts/drive-party.mjs
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

const OUT = "/home/hatch/workspace/party-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-party-"));
process.env.PORT = "3979";
process.env.WORKSHOP_PASSWORD = ["party", "workshop", "pw"].join("-");
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3979";
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

const db = new Database(join(process.env.DATA_DIR, "app.db"));
// Fresh-DB stand-up for the known store migration-order
// defect (the greeter ALTER runs before its table exists on
// a fresh database; production untouched — the Audit
// carries the repair). Same stand-up the other drives use.
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }

function seedAwokin(ownerKey, tenderName, name, partPower = 2) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, 'root', ?, 'image/png', ?)").run(`${name} ${cat}`, cat, partPower, partPower, `party/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: partPower, toughness: partPower, element: "root" });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)").run(name, name, `party/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
async function claimWithExp(name, exp) {
  const claim = await call("claimTender", { password: "party-drive-password", tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, exp, Date.now());
  return { token: claim.token, ownerKey };
}
const partyRows = (ownerKey) => db.prepare("SELECT awakened_id FROM tender_party WHERE owner_key = ? ORDER BY awakened_id").all(ownerKey).map(r => r.awakened_id);

/* ── §P THE LEDGER OVER HTTP ────────────────────────────── */
{
  console.log("§P the party ledger — width, fill, bench, persistence");
  const T = await claimWithExp("Party Tender", 0); // Lv 1 — the band stands at three
  const A = seedAwokin(T.ownerKey, "Party Tender", "Ash");
  const B = seedAwokin(T.ownerKey, "Party Tender", "Birch");
  const C = seedAwokin(T.ownerKey, "Party Tender", "Cinder");
  const D = seedAwokin(T.ownerKey, "Party Tender", "Dune");

  const v0 = await call("getParty", {}, T.token);
  ok("a new tender's party stands empty, three wide, the whole roster in the deck",
    v0.size === 0 && v0.cap === 3 && v0.deck.length === 4, JSON.stringify(v0));

  await call("addToParty", { awakenedId: A }, T.token);
  await call("addToParty", { awakenedId: B }, T.token);
  const v3 = await call("addToParty", { awakenedId: C }, T.token);
  ok("three deck-fills stand in the party", v3.size === 3 && v3.members.map(m => m.awakenedId).join(",") === [A, B, C].join(","), JSON.stringify(v3.members));
  ok("the filled members left the deck list", v3.deck.length === 1 && v3.deck[0].awakenedId === D);

  let refused = null;
  try { await call("addToParty", { awakenedId: D }, T.token); } catch (e) { refused = e; }
  ok("the fourth fill is refused whole — the party stands full at the band's three",
    !!refused && /stands full/.test(refused.message), refused ? refused.message : "no refusal");
  const vAfter = await call("getParty", {}, T.token);
  ok("the refusal wrote nothing — the party still stands at three", vAfter.size === 3 && partyRows(T.ownerKey).length === 3);

  const vBench = await call("removeFromParty", { awakenedId: B }, T.token);
  ok("benching returns the creature to the deck and frees the spot",
    vBench.size === 2 && vBench.deck.some(d => d.awakenedId === B) && !vBench.members.some(m => m.awakenedId === B), JSON.stringify(vBench));
  const vRe = await call("getParty", {}, T.token);
  ok("the party persists across reads", vRe.size === 2 && partyRows(T.ownerKey).join(",") === [A, C].sort((x, y) => x - y).join(","));

  /* ── §H THE HOMELAND: FIELD ADD, FOLLOW, ORDERS ──────── */
  console.log("§H the homeland — add from the field; orders end membership");
  const now = Date.now();
  const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', 0, ?)");
  const t00 = Number(insTile.run(T.ownerKey, 0, 0, now).lastInsertRowid);
  const t10 = Number(insTile.run(T.ownerKey, 1, 0, now).lastInsertRowid);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 100, ?)").run(T.ownerKey, now);
  const insPlace = db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, hp) VALUES (?, ?, ?, ?, ?, 30)");
  insPlace.run(T.ownerKey, D, t00, now, now);
  insPlace.run(T.ownerKey, B, t00, now, now);

  const vField = await call("addFieldToParty", { awakenedId: D }, T.token);
  ok("adding from the field writes the membership", vField.members.some(m => m.awakenedId === D) && vField.size === 3, JSON.stringify(vField.members));
  const dFollow = db.prepare("SELECT follow FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(T.ownerKey, D);
  ok("adding from the field sets its follow on this ground", dFollow && dFollow.follow === 1, JSON.stringify(dFollow));

  await call("setMarch", { awakenedId: D, tileId: t10 }, T.token);
  ok("a march order ends the membership (homeland)",
    !partyRows(T.ownerKey).includes(D) && !(await call("getParty", {}, T.token)).members.some(m => m.awakenedId === D));

  await call("addToParty", { awakenedId: B }, T.token);
  ok("a fielded creature joins by the deck road too", partyRows(T.ownerKey).includes(B));
  await call("setPatrol", { awakenedId: B, tileIds: [t10] }, T.token);
  ok("a laid patrol road ends the membership (homeland)",
    !partyRows(T.ownerKey).includes(B));
  void t00;
}

/* ── §T THE TABLE ───────────────────────────────────────── */
const parseId = (id) => id.split(",").map(Number);
const axialDist = (a, b) => { const [aq, ar] = parseId(a), [bq, br] = parseId(b); return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs((aq + ar) - (bq + br))) / 2; };
function client(label) {
  const ws = new WebSocket("ws://127.0.0.1:3979/table/ws");
  const c = { label, ws, state: null, you: null, errors: [] };
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "state") { c.state = m.state; c.you = m.you; }
    if (m.type === "error" || m.type === "joinError") c.errors.push(m.message);
  });
  c.send = (msg) => ws.send(JSON.stringify(msg));
  c.join = (join) => new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error(`${label}: join timeout`)), 15000);
    ws.on("open", () => {
      c.send({ type: "join", ...join });
      const iv = setInterval(() => { if (c.state) { clearInterval(iv); clearTimeout(to); resolve(); } }, 100);
    });
  });
  c.waitFor = async (fn, what, timeout = 20000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) { if (c.state && fn(c)) return true; await sleep(200); }
    throw new Error(`${label}: timed out waiting for ${what}; errors: ${c.errors.join(" | ")}; tale tail: ${(c.state?.tale ?? []).slice(-3).map((t) => t.text).join(" | ")}`);
  };
  return c;
}

{
  console.log("§T the Table — the same ledger across grounds; the field add; the march");
  const T2 = await claimWithExp("Table Tender", 3800); // Lv 10 — classed, party five wide
  await call("chooseClass", { classKey: "warden" }, T2.token);
  await call("chooseWeapon", { weaponKey: "sword" }, T2.token);
  const one = seedAwokin(T2.ownerKey, "Table Tender", "Tablekin One", 3);
  const two = seedAwokin(T2.ownerKey, "Table Tender", "Tablekin Two", 3);

  const { issueTableToken } = await import("../server/dist/table.js");
  const tt = issueTableToken({ id: "disc-party", name: "Table Tender" });
  const bindCode = (await call("getTableBindCode", {}, T2.token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
  if (!bindRes.ok) throw new Error("table/bind failed: " + bindRes.status);

  // Join with NO party composed (build 2's standing pencil:
  // the ledger is empty because it was never used, so the
  // deal — and the summon below — run from the whole roster
  // exactly as before the party law; nothing auto-seeds a
  // party). The party is composed from the seat afterwards.
  const b = client("B");
  await b.join({ authToken: tt, room: "party-drive-casual" });

  const card = (b.you.hand ?? []).find((cd) => cd.name === "Tablekin One");
  ok("an uncomposed Tender is dealt from the whole roster — the hand carries the field candidate", !!card, JSON.stringify((b.you.hand ?? []).map((cd) => cd.name)));
  const anchor = b.you.landing ?? b.state.players.find((p) => p.key === b.you.key)?.hex;
  let summonedHex = null;
  const spots = b.state.map.filter((t) => !t.cursed && t.id !== "0,0" && axialDist(t.id, anchor) <= 1);
  for (const s of spots) {
    b.send({ type: "summon", cardId: card.id, hex: s.id });
    try { await b.waitFor((cc) => cc.state.field.some((u) => u.cardId === card.id), `summon onto ${s.id}`, 5000); summonedHex = s.id; break; } catch { /* next spot */ }
  }
  ok("the Awokin is summoned onto the field", !!summonedHex);
  const unit0 = b.state.field.find((u) => u.cardId === card.id);
  ok("the field unit carries its roster id", unit0 && unit0.awokenId === one, JSON.stringify(unit0 && { awokenId: unit0.awokenId }));

  // The membership written over HTTP (the Zodiac's road)
  // must stand in the Table seat's own payload — one ledger.
  // No battle stands, so the fill lands at once; a notes
  // poke makes the seat push its state again.
  await call("addToParty", { awakenedId: two }, T2.token);
  b.send({ type: "notes", text: "" });
  await b.waitFor((cc) => (cc.you.party ?? []).includes(two), "the Zodiac's write standing in the seat's payload");
  ok("the Table reads the party written in the Zodiac — one ledger across grounds",
    Array.isArray(b.you.party) && b.you.party.includes(two), JSON.stringify(b.you.party));

  b.send({ type: "addToParty", cardId: card.id });
  await b.waitFor((cc) => (cc.you.party ?? []).includes(one), "the field add standing in you.party");
  ok("adding from the field stands the membership in the seat's payload", true);
  const unit1 = b.state.field.find((u) => u.cardId === card.id);
  ok("adding from the field sets its follow at the Table", !!unit1 && unit1.follow === true, JSON.stringify(unit1 && { follow: unit1.follow }));
  ok("the ledger row stands for the Table add too", partyRows(T2.ownerKey).includes(one) && partyRows(T2.ownerKey).includes(two));

  // March it: the order ends the membership and the follow.
  const from = unit1.hex;
  const targets = b.state.map.filter((t) => t.id !== "0,0" && axialDist(from, t.id) === 2
    && b.state.field.filter((u) => u.hex === t.id).length < 4);
  let marched = false;
  for (const t of targets) {
    b.send({ type: "march", cardId: card.id, from, to: t.id });
    try { await b.waitFor((cc) => !(cc.you.party ?? []).includes(one), `the march to ${t.id} ending membership`, 5000); marched = true; break; } catch { /* next road */ }
  }
  ok("a march order ends the membership (the Table)", marched, `errors: ${b.errors.join(" | ")}`);
  const unit2 = b.state.field.find((u) => u.cardId === card.id);
  ok("the march also ended its follow", !!unit2 && unit2.follow === false);
  ok("the tale names the leaving", (b.state.tale ?? []).some((t) => /leaves .* party/.test(t.text)), (b.state.tale ?? []).slice(-4).map((t) => t.text).join(" | "));
  ok("the other member stands untouched; the ledger agrees",
    (b.you.party ?? []).includes(two) && partyRows(T2.ownerKey).join(",") === String(two));
  b.ws.close();
}

console.log(`\nPARTY DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
