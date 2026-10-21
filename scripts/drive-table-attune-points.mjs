// ATTUNE ADDS ELEMENT POINTS TO A HEX TILE — drive
// (Nigel, 2026-10-20: "make the attune ability add element
// points to a hex tile"). Boots the real server on a scratch
// DATA_DIR, seats two bound Tenders in one room over raw
// WebSocket, and proves against the room's own served state
// (and the aspect_attunement ledger in the DB):
//   A. A landing born of the light holds its element by
//      birthright with NO points resting yet; cursed ground
//      holds neither (the control).
//   B. Attune spends REST on the tile: deepening the held
//      element accumulates (the old "already holds" refusal
//      is gone), a rival element accumulates beside it, a
//      tie leaves the standing element, and the tile turns
//      only when the rival OUT-points the holder.
//   C. Bare neutral ground (a Tender whose Awokin's pieces
//      are filed neutral, so his landing is born neutral) is
//      claimed by the first point spent on it.
//   D. Refusals, each spending nothing: cursed ground
//      within reach, ground beyond the reach (the Attune
//      Ability build, 2026-10-21: the tender's hex and its
//      ring, plus the zodiac's attunement-reach bonus —
//      the reader stands now, no stars carry it yet, and
//      the old "his own ground only" law is superseded),
//      an empty pool.
//   E. The reach is measured from where he STANDS: glide
//      one tile into the curse, and his own landing — now
//      one tile away — takes a point; his ring moved with
//      him.
//   F. The storyteller's join: the same far tile refused
//      to a Tender lands for the seated Storyteller
//      (unbounded reach, their existing purse), and the
//      reach reader reads 0 until the stars arrive.
// Run: node scripts/drive-table-attune-points.mjs
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import WebSocket from "ws";

const OUT = "/home/hatch/workspace/attune-points-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(OUT, "data-"));
process.env.PORT = "3947";
process.env.WORKSHOP_PASSWORD = "attune-drive";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const PW = ["attune", "password", "1"].join("-");
const BASE = "http://127.0.0.1:3947";
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
// Fresh-DB migration-order defect (named in earlier drives):
// stand the greeter column up so drizzle selects do not throw.
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }
const now = Date.now();

const { issueTableToken } = await import("../server/dist/table.js");

async function makeBoundTender({ name, discordId, withAwokin, pools }) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const token = claim.token;
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, now);
  await call("chooseClass", { classKey: "warden" }, token);
  if (withAwokin) {
    const piece = (el, cat) => Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 2, 2, ?, ?, 'image/png', ?)").run(`${name} ${cat}`, cat, el, `att/${cat}.png`, now).lastInsertRowid);
    // Two root pieces and one tide: the landing's light is root.
    const layers = [
      { id: piece("root", "body"), name: `${name} Body`, category: "body", element: "root" },
      { id: piece("root", "arms"), name: `${name} Arms`, category: "arms", element: "root" },
      { id: piece("tide", "head"), name: `${name} Head`, category: "head", element: "tide" },
    ];
    const compJson = JSON.stringify(layers.map((l) => ({ source_id: `db:${l.id}`, name: l.name, category: l.category, rarity: "common", power: 2, toughness: 2, element: l.element })));
    const awokenId = Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
      .run(`${name} Kin`, `${name} Kin`, "att/awokin.png", compJson, name, ownerKey, now).lastInsertRowid);
    // The wheel law (264c1ef): the landing's light is the
    // COMPANY's first member, and the company is the party
    // — so the Kin stands in the party, or the landing is
    // born neutral (the drive's D section proves that road
    // with a party-less neutral company of its own).
    db.prepare("INSERT INTO tender_party (owner_key, awakened_id, added_at) VALUES (?, ?, ?)").run(ownerKey, awokenId, now);
  }
  for (const [el, pts] of Object.entries(pools)) {
    db.prepare("INSERT INTO aspect_attunement (owner_key, element, points, updated_at) VALUES (?, ?, ?, ?)").run(ownerKey, el, pts, now);
  }
  const tt = issueTableToken({ id: discordId, name });
  const bindCode = (await call("getTableBindCode", {}, token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
  if (!bindRes.ok) throw new Error("table/bind failed: " + bindRes.status);
  return { ownerKey, authToken: tt };
}

function client(label) {
  const ws = new WebSocket(`ws://127.0.0.1:3947/table/ws`);
  const c = { label, ws, state: null, you: null, errors: [] };
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "state") { c.state = m.state; c.you = m.you; }
    if (m.type === "error" || m.type === "joinError") c.errors.push(m.message);
  });
  c.send = (msg) => ws.send(JSON.stringify(msg));
  c.join = (join) => new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error(`${label}: join timeout`)), 10000);
    ws.on("open", () => {
      c.send({ type: "join", ...join });
      const iv = setInterval(() => {
        if (c.state && c.you) { clearInterval(iv); clearTimeout(to); resolve(); }
      }, 100);
    });
  });
  c.waitFor = async (fn, what, timeout = 15000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (c.state && fn(c)) return true;
      await sleep(150);
    }
    throw new Error(`${label}: timed out waiting for ${what}`);
  };
  return c;
}

const tileOf = (c, id) => c.state.map.find((t) => t.id === id);
const pts = (t) => JSON.stringify(t?.points ?? null);
const axDist = (a, b) => {
  const [aq, ar] = a.split(",").map(Number);
  const [bq, br] = b.split(",").map(Number);
  return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs((aq + ar) - (bq + br))) / 2;
};
// A glide by socket (the helper drive-table-summon proved):
// the Table's glide is a TARGET POINT in the server's own
// iso pixels, and the referee walks the Tender there.
async function glideTo(actor, targetHex, ms = 45000) {
  const [tq, tr] = targetHex.split(",").map(Number);
  const k = 40 / 796;
  actor.send({ type: "glide", tx: tq * 1292 * k, ty: tq * 470 * k + tr * 948 * k });
  const s = Date.now();
  while (Date.now() - s < ms) {
    const me = actor.state?.players.find((p) => p.key === actor.you.key);
    if (me?.hex === targetHex) return true;
    await sleep(200);
  }
  return false;
}

// ═══ Seat A (root landing, pools root 5 / tide 5) ═══
const A = await makeBoundTender({ name: "Attune Ann", discordId: "disc-attune-a", withAwokin: true, pools: { root: 5, tide: 5 } });
const a = client("A");
await a.join({ authToken: A.authToken, room: "attune-room" });
const landingA = a.you.landing;
ok("A is seated bound, standing on her landing", !!landingA && a.state.players.find((p) => p.key === a.you.key)?.hex === landingA, `landing=${landingA}`);

// A. Birth state of the ledgers: the turned tile's element is
// the turning light's by birthright, and NO points rest yet —
// points are laid only by Attune spends.
const bornA = tileOf(a, landingA);
ok("A's landing is born holding root (her Awokin's light)", bornA.element === "root", `element=${bornA.element}`);
ok("A's landing is born BARE — no points rest on it yet", pts(bornA) === "{}", pts(bornA));
const cursedTile = a.state.map.find((t) => t.cursed);
ok("control: cursed ground holds no points and no element", !!cursedTile && pts(cursedTile) === "{}" && cursedTile.element === null, cursedTile && `${cursedTile.id} ${pts(cursedTile)} el=${cursedTile.element}`);
ok("A's pools ride her seat (root 5, tide 5)", a.you.pools?.root === 5 && a.you.pools?.tide === 5, JSON.stringify(a.you.pools));

// B. Spends rest on the tile.
// B1: lay a point of the held element — the old law refused
// this outright ("already holds"); now it rests and counts.
a.send({ type: "attuneTile", hex: landingA, element: "root" });
await a.waitFor((c) => pts(tileOf(c, landingA)) === JSON.stringify({ root: 1 }), "a root point rests");
ok("the spend RESTS: one root point lies on the tile", pts(tileOf(a, landingA)) === JSON.stringify({ root: 1 }), pts(tileOf(a, landingA)));
ok("the ground still holds root, and no error was spoken", tileOf(a, landingA).element === "root" && a.errors.length === 0, a.errors.join(" | "));
ok("A's root pool paid exactly 1 (5 → 4)", a.you.pools?.root === 4, JSON.stringify(a.you.pools));
ok("the tale tells the resting point", a.state.tale.some((t) => t.text.includes("attunes the ground") && t.text.includes("rests on it now (1 root in all)")), a.state.tale.slice(-2).map((t) => t.text).join(" | "));

// B2: a rival point rests beside it — tied at 1–1, ties hold.
a.send({ type: "attuneTile", hex: landingA, element: "tide" });
await a.waitFor((c) => (tileOf(c, landingA).points?.tide ?? 0) === 1, "a tide point rests");
ok("a rival tide point rests beside the root (root 1, tide 1)", pts(tileOf(a, landingA)) === JSON.stringify({ root: 1, tide: 1 }), pts(tileOf(a, landingA)));
ok("tied, the ground STILL holds root (ties hold)", tileOf(a, landingA).element === "root", tileOf(a, landingA).element);

// B3: the rival out-points the laid root — the tile turns.
a.send({ type: "attuneTile", hex: landingA, element: "tide" });
await a.waitFor((c) => tileOf(c, landingA).element === "tide", "the tile turns to tide");
ok("at tide 2 over root 1, the ground holds tide", tileOf(a, landingA).element === "tide" && pts(tileOf(a, landingA)) === JSON.stringify({ root: 1, tide: 2 }), `${tileOf(a, landingA).element} ${pts(tileOf(a, landingA))}`);
ok("A's tide pool paid exactly 2 (5 → 3)", a.you.pools?.tide === 3, JSON.stringify(a.you.pools));

// B4: root answers — tied at 2–2 again, and the tie now
// holds TIDE: the standing element is the one that stands.
a.send({ type: "attuneTile", hex: landingA, element: "root" });
await a.waitFor((c) => (tileOf(c, landingA).points?.root ?? 0) === 2, "root ties at 2");
ok("tied at 2–2 from the other side, the ground STILL holds tide", tileOf(a, landingA).element === "tide" && pts(tileOf(a, landingA)) === JSON.stringify({ root: 2, tide: 2 }), `${tileOf(a, landingA).element} ${pts(tileOf(a, landingA))}`);
ok("A's root pool paid exactly 2 in all (5 → 3)", a.you.pools?.root === 3, JSON.stringify(a.you.pools));

// ═══ Seat C in the same room: a second bound seat, whose
// landing the refusal section's bookkeeping watches (it
// must stay untouched by everything A sends). C holds no
// Awokin and no party, so his company is empty and his
// landing is born neutral; the bare-ground claim is proven
// properly with D, below, whose Kin's pieces are all filed
// neutral. ═══
const C = await makeBoundTender({ name: "Attune Cato", discordId: "disc-attune-c", withAwokin: false, pools: { root: 3 } });
const cSeat = client("C");
await cSeat.join({ authToken: C.authToken, room: "attune-room" });
const landingC = cSeat.you.landing;
ok("C is seated bound with a landing of his own", !!landingC && landingC !== landingA, `landingC=${landingC}`);
const ptsCBefore = pts(tileOf(cSeat, landingC));

// ═══ D. Refusals — each spends nothing ═══
const poolRow = (ownerKey, el) => db.prepare("SELECT points FROM aspect_attunement WHERE owner_key = ? AND element = ?").get(ownerKey, el)?.points;
const beforeA = { root: poolRow(A.ownerKey, "root"), tide: poolRow(A.ownerKey, "tide") };
const ptsABefore = pts(tileOf(a, landingA));

// D1: cursed ground WITHIN the reach (a cursed neighbour
// of A's hex — the reach lets the tap land, and the curse
// itself refuses it).
const cursedNear = a.state.map.find((t) => t.cursed && axDist(landingA, t.id) === 1);
ok("a cursed tile stands within A's ring (the reach setup)", !!cursedNear, landingA);
const errCount = a.errors.length;
a.send({ type: "attuneTile", hex: cursedNear.id, element: "root" });
await a.waitFor((c) => c.errors.length > errCount, "the cursed refusal lands");
ok("cursed ground is refused plainly", a.errors[a.errors.length - 1].includes("still cursed"), a.errors[a.errors.length - 1]);

// D2: ground beyond the reach (the Attune Ability build's
// range law: the tender's hex and its ring + skill bonus —
// no stars carry the bonus yet, so ring 2 refuses). The
// old "another's ground" refusal is superseded: the tile
// named here is an ordinary ring-2 tile, and what refuses
// it is distance, not ownership.
const farTile = a.state.map.find((t) => t.id !== "0,0" && axDist(landingA, t.id) === 2);
ok("a ring-2 tile stands beyond A's ring (the reach setup)", !!farTile, landingA);
a.send({ type: "attuneTile", hex: farTile.id, element: "root" });
await a.waitFor((c) => c.errors.length > errCount + 1, "the reach refusal lands");
ok("ground beyond the reach is refused in plain words", a.errors[a.errors.length - 1].includes("beyond your attuning reach"), a.errors[a.errors.length - 1]);

// D3: an empty pool (A holds no sky at all).
a.send({ type: "attuneTile", hex: landingA, element: "sky" });
await a.waitFor((c) => c.errors.length > errCount + 2, "the empty-pool refusal lands");
ok("an empty pool is refused, naming what the pool holds", a.errors[a.errors.length - 1].includes("your sky pool holds 0"), a.errors[a.errors.length - 1]);

await sleep(400);
ok("the three refusals spent NOTHING from A's pools (DB ledger)", poolRow(A.ownerKey, "root") === beforeA.root && poolRow(A.ownerKey, "tide") === beforeA.tide, `root ${beforeA.root}→${poolRow(A.ownerKey, "root")}, tide ${beforeA.tide}→${poolRow(A.ownerKey, "tide")}`);
ok("the three refusals laid NOTHING on A's tile", pts(tileOf(a, landingA)) === ptsABefore, `${ptsABefore} → ${pts(tileOf(a, landingA))}`);
ok("C's tile was untouched by everything A sent (the far tile may BE his landing — a refused spend lays nothing)", pts(tileOf(a, landingC)) === ptsCBefore, `${ptsCBefore} → ${pts(tileOf(a, landingC))}`);
ok("control at the end: the cursed tile still holds no points", pts(tileOf(a, cursedTile.id)) === "{}" && tileOf(a, cursedTile.id).element === null, pts(tileOf(a, cursedTile.id)));

// DB ledger totals for room one.
ok("DB ledger: A root 5→3, tide 5→3 across all spends", poolRow(A.ownerKey, "root") === 3 && poolRow(A.ownerKey, "tide") === 3, `root=${poolRow(A.ownerKey, "root")} tide=${poolRow(A.ownerKey, "tide")}`);
ok("DB ledger: C never spent — his root pool stands at 3", poolRow(C.ownerKey, "root") === 3, `root=${poolRow(C.ownerKey, "root")}`);

// ═══ E. The reach is measured from where he STANDS ═══
// A glides one tile into the curse. His landing is now one
// tile away from him — inside the ring the law gives him —
// and the same spend that was distance 0 a moment ago now
// lands at distance 1. The ring moved with him; the ring-2
// refusal above is this law's other side.
const errE = a.errors.length;
ok("A glides one tile into the curse", await glideTo(a, cursedNear.id), a.state.players.find((p) => p.key === a.you.key)?.hex);
a.send({ type: "attuneTile", hex: landingA, element: "root" });
await a.waitFor((c) => (tileOf(c, landingA).points?.root ?? 0) === 3, "the landing takes a point at ring 1 from his new stand");
ok("one tile away from his stand, his own landing takes the point (root 2 → 3 resting)", pts(tileOf(a, landingA)) === JSON.stringify({ root: 3, tide: 2 }), pts(tileOf(a, landingA)));
ok("the in-ring spend spoke no error", a.errors.length === errE, a.errors.slice(errE).join(" | "));
ok("DB ledger: the in-ring spend paid exactly 1 more root (3 → 2)", poolRow(A.ownerKey, "root") === 2, `root=${poolRow(A.ownerKey, "root")}`);

a.ws.close(); cSeat.ws.close();

// ═══ C (the claim): D, in his own room, whose Awokin's pieces
// are all filed NEUTRAL — so his landing is born neutral and
// bare, and the first point spent must claim it. ═══
const mkNeutral = async () => {
  const claim = await call("claimTender", { password: PW, tenderName: "Attune Dain" });
  const token = claim.token;
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, now);
  await call("chooseClass", { classKey: "warden" }, token);
  const piece = (cat) => Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 2, 2, 'neutral', ?, 'image/png', ?)").run(`Dain ${cat}`, cat, `att/${cat}.png`, now).lastInsertRowid);
  const compJson = JSON.stringify(["body", "arms", "head"].map((cat) => ({ source_id: `db:${piece(cat)}`, name: `Dain ${cat}`, category: cat, rarity: "common", power: 2, toughness: 2, element: "neutral" })));
  db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run("Dain Kin", "Dain Kin", "att/awokin.png", compJson, "Attune Dain", ownerKey, now);
  db.prepare("INSERT INTO aspect_attunement (owner_key, element, points, updated_at) VALUES (?, 'root', 3, ?)").run(ownerKey, now);
  const tt = issueTableToken({ id: "disc-attune-d", name: "Attune Dain" });
  const bindCode = (await call("getTableBindCode", {}, token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
  if (!bindRes.ok) throw new Error("table/bind failed: " + bindRes.status);
  return { ownerKey, authToken: tt };
};
const D = await mkNeutral();
const d = client("D");
await d.join({ authToken: D.authToken, room: "attune-room-2" });
const landingD = d.you.landing;
const bornD = tileOf(d, landingD);
ok("D's landing is born NEUTRAL and bare — no points rest on it", bornD.element === "neutral" && pts(bornD) === "{}", `${bornD.element} ${pts(bornD)}`);
d.send({ type: "attuneTile", hex: landingD, element: "root" });
await d.waitFor((c) => tileOf(c, landingD).element === "root", "the first point claims the ground");
ok("one root point on bare ground: the ground holds root", pts(tileOf(d, landingD)) === JSON.stringify({ root: 1 }) && tileOf(d, landingD).element === "root", `${pts(tileOf(d, landingD))} ${tileOf(d, landingD).element}`);
d.send({ type: "attuneTile", hex: landingD, element: "root" });
await d.waitFor((c) => (tileOf(c, landingD).points?.root ?? 0) === 2, "the second point deepens");
ok("a second spend accumulates (root 2), pool 3 → 1", pts(tileOf(d, landingD)) === JSON.stringify({ root: 2 }) && d.you.pools?.root === 1, `${pts(tileOf(d, landingD))} pool=${d.you.pools?.root}`);
ok("DB ledger: D root 3→1 across his two spends", poolRow(D.ownerKey, "root") === 1, `root=${poolRow(D.ownerKey, "root")}`);
d.ws.close();

// ═══ F. The reach reader, and the storyteller's join ═══
// The reach bonus is a zodiac clause like any other —
// fxSum over the stars' "attuneReach" clauses — and no
// stars carry it yet: the reader stands and returns 0.
const { attuneReachFor } = await import("../server/dist/skills.js");
ok("the reach reader returns 0 for no owner at all", attuneReachFor(null) === 0 && attuneReachFor(undefined) === 0 && attuneReachFor("tender:99999") === 0);
ok("the reach reader returns 0 for bound Tenders (no stars carry the clause yet)", attuneReachFor(A.ownerKey) === 0 && attuneReachFor(D.ownerKey) === 0);
ok("the seats are SERVED the reach the referee will enforce (0 today)", a.you.attuneReach === 0 && d.you.attuneReach === 0, `A=${a.you.attuneReach} D=${d.you.attuneReach}`);

// A campaign room: S and T land on a born-cursed map. The
// far tile is T's landing; if S stands within a ring of
// it, S first glides clear (≥3 rings off) — while still a
// Tender — and is refused there in plain words. Then S
// claims the Storyteller's seat, and the SAME send lands:
// unbounded reach, S's own purse, the point resting on
// T's landing.
const S = await makeBoundTender({ name: "Attune Story", discordId: "disc-attune-s", withAwokin: true, pools: { root: 4 } });
const T = await makeBoundTender({ name: "Attune Tess", discordId: "disc-attune-t", withAwokin: true, pools: { root: 2 } });
const s = client("S");
await s.join({ authToken: S.authToken, room: "campaign-attune-join" });
const t2 = client("T");
await t2.join({ authToken: T.authToken, room: "campaign-attune-join" });
const landingS = s.you.landing;
const landingT = t2.you.landing;
ok("the campaign seats land on the born-cursed map (landings purified on arrival)", !!landingS && !!landingT && landingS !== landingT, `S=${landingS} T=${landingT}`);
const sHex = () => s.state.players.find((p) => p.key === s.you.key)?.hex;
if (axDist(sHex(), landingT) <= 1) {
  const far = s.state.map.find((x) => x.cursed && axDist(x.id, landingT) >= 3);
  ok("a far cursed tile exists for S to walk to", !!far, landingT);
  ok("S glides clear of T's landing before claiming", await glideTo(s, far.id) && axDist(sHex(), landingT) >= 3, `hex=${sHex()}`);
}
const errS = s.errors.length;
s.send({ type: "attuneTile", hex: landingT, element: "root" });
await s.waitFor((c) => c.errors.length > errS, "the tender reach refusal for S");
ok("as a Tender, S is refused on T's far landing — beyond the ring", s.errors[s.errors.length - 1].includes("beyond your attuning reach"), s.errors[s.errors.length - 1]);
ok("the refusal spent nothing of S's purse (root still 4 in the DB)", poolRow(S.ownerKey, "root") === 4, `root=${poolRow(S.ownerKey, "root")}`);
s.send({ type: "claimStoryteller" });
await s.waitFor((c) => c.state.campaign?.storytellerKey === c.you.key, "S's claim to land");
ok("S holds the Storyteller's seat", !!s.you.storytender && s.state.campaign.storytenderName === "Attune Story");
s.send({ type: "attuneTile", hex: landingT, element: "root" });
await s.waitFor((c) => (tileOf(c, landingT).points?.root ?? 0) === 1, "the storyteller's point rests on the far landing");
ok("as Storyteller, the same far ground takes the point — unbounded reach", (tileOf(s, landingT).points?.root ?? 0) === 1, pts(tileOf(s, landingT)));
ok("the storyteller's own purse paid exactly 1 (4 → 3 in the DB)", poolRow(S.ownerKey, "root") === 3, `root=${poolRow(S.ownerKey, "root")}`);
ok("T's purse was never touched", poolRow(T.ownerKey, "root") === 2, `root=${poolRow(T.ownerKey, "root")}`);
s.ws.close(); t2.ws.close();
console.log(`\nDRIVE (attune points): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
