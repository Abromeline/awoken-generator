// STANDING ATTUNES TILES AT THE TABLE — drive (Nigel,
// 2026-10-21: "awoken still attune tiles by standing on
// the[m], creating elemental attunement points"). Boots the
// real server on a scratch DATA_DIR, seats a bound Tender
// over raw WebSocket, summons her Awokin onto her landing,
// and proves against the room's own served state:
//   A. A tile with nobody standing on it gains NOTHING —
//      the control landing across the room and the seed
//      stay bare the whole drive (no presence, no accrual).
//   B. A standing Awokin lays its OWN element slowly: no
//      whole point inside the first half-minute (the rate
//      is one point per twenty beats — 56 seconds), then
//      the point rests in the tile's ledger.
//   C. A second Awokin of another element standing on the
//      same tile lays ITS element beside the first — each
//      presence accrues its own, and the tile's held
//      element follows the same plurality law the spends
//      use (the leader holds; the ledger shows both).
//   D. Once the tile is VACATED the ledger freezes: a full
//      rate-period later it reads exactly as it did when
//      the last Awokin stepped off.
// The waits are the proof's cost: the rate is slow by
// design (the homeland's spirit), so this drive runs about
// four minutes. Run: node scripts/drive-table-standing-attune.mjs
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import WebSocket from "ws";

const OUT = "/home/hatch/workspace/standing-attune-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(OUT, "data-"));
process.env.PORT = "3951";
process.env.WORKSHOP_PASSWORD = "standing-drive";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const PW = ["standing", "password", "1"].join("-");
const BASE = "http://127.0.0.1:3951";
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

async function makeBoundTender({ name, discordId, kins }) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const token = claim.token;
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, now);
  await call("chooseClass", { classKey: "warden" }, token);
  for (const el of kins) {
    const piece = (cat) => Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 2, 2, ?, ?, 'image/png', ?)").run(`${name} ${el} ${cat}`, cat, el, `stand/${el}-${cat}.png`, now).lastInsertRowid);
    const compJson = JSON.stringify(["body", "arms", "head"].map((cat) => ({ source_id: `db:${piece(cat)}`, name: `${name} ${el} ${cat}`, category: cat, rarity: "common", power: 2, toughness: 2, element: el })));
    db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
      .run(`${name} ${el} Kin`, `${name} ${el} Kin`, "stand/awokin.png", compJson, name, ownerKey, now);
  }
  const tt = issueTableToken({ id: discordId, name });
  const bindCode = (await call("getTableBindCode", {}, token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
  if (!bindRes.ok) throw new Error("table/bind failed: " + bindRes.status);
  return { ownerKey, authToken: tt };
}

function client(label) {
  const ws = new WebSocket(`ws://127.0.0.1:3951/table/ws`);
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
const myField = (c) => c.state.field.filter((u) => u.ownerKey === c.you.key);

// ═══ Seat A with two Awokin — one all-root, one all-tide ═══
const A = await makeBoundTender({ name: "Standing Sue", discordId: "disc-stand-a", kins: ["root", "tide"] });
const a = client("A");
await a.join({ authToken: A.authToken, room: "standing-room" });
const landingA = a.you.landing;
ok("A is seated bound, standing on her landing", !!landingA && a.state.players.find((p) => p.key === a.you.key)?.hex === landingA, `landing=${landingA}`);
const hand = a.you.hand;
ok("A's hand holds two Awokin of different elements", hand.length === 2 && hand[0].element !== hand[1].element, JSON.stringify(hand.map((c) => c.element)));
const [card1, card2] = hand;
const el1 = card1.element, el2 = card2.element;
ok("A's landing is born bare — no points rest on it yet", pts(tileOf(a, landingA)) === "{}", pts(tileOf(a, landingA)));
ok("A's landing is born holding the first card's element", tileOf(a, landingA).element === el1, `${tileOf(a, landingA).element} vs ${el1}`);

// ═══ The control: seat C in the same room, who never
// summons — her landing must stay bare the whole drive. ═══
const C = await makeBoundTender({ name: "Standing Control", discordId: "disc-stand-c", kins: [] });
const cSeat = client("C");
await cSeat.join({ authToken: C.authToken, room: "standing-room" });
const landingC = cSeat.you.landing;
ok("the control seat has a landing of her own, bare", !!landingC && landingC !== landingA && pts(tileOf(cSeat, landingC)) === "{}", `landingC=${landingC}`);
const seedTile = a.state.map.find((t) => t.id === "0,0");
ok("the seed tile starts bare too", !!seedTile && pts(seedTile) === "{}", pts(seedTile));

// ═══ B. The first Awokin stands — slowly, its own element ═══
a.send({ type: "summon", hex: landingA, cardId: card1.id });
await a.waitFor((c) => myField(c).some((u) => u.cardId === card1.id && u.hex === landingA && !u.moving), "the first Awokin stands on the landing");
ok(`the ${el1} Awokin stands on the landing`, true);
await sleep(30000);
ok("after 30 seconds standing, NO whole point has landed yet (the rate is slow)", pts(tileOf(a, landingA)) === "{}", pts(tileOf(a, landingA)));
await a.waitFor((c) => (tileOf(c, landingA).points?.[el1] ?? 0) === 1, `one ${el1} point rests`, 60000);
ok(`one ${el1} point rests on the tile — laid by standing, in the Awokin's own element`, pts(tileOf(a, landingA)) === JSON.stringify({ [el1]: 1 }), pts(tileOf(a, landingA)));
ok("the tile still holds its element, and no Attune spend was made (A holds no pools at all)", tileOf(a, landingA).element === el1 && (a.you.pools?.[el1] ?? 0) === 0, `pools=${JSON.stringify(a.you.pools)}`);

// ═══ C. A second Awokin of another element stands beside ═══
a.send({ type: "summon", hex: landingA, cardId: card2.id });
await a.waitFor((c) => myField(c).some((u) => u.cardId === card2.id && u.hex === landingA && !u.moving), "the second Awokin stands on the landing");
ok(`the ${el2} Awokin stands on the same tile`, true);
await a.waitFor((c) => (tileOf(c, landingA).points?.[el2] ?? 0) === 1, `one ${el2} point rests beside the first`, 100000);
const bothPts = tileOf(a, landingA).points;
ok(`each presence laid its own element (${el1} and ${el2} both rest)`, (bothPts[el1] ?? 0) >= 2 && bothPts[el2] === 1, JSON.stringify(bothPts));
ok(`the tile holds ${el1} — the leader of the ledger, by the plurality law`, tileOf(a, landingA).element === el1, tileOf(a, landingA).element);

// ═══ D. Vacated, the ledger freezes ═══
a.send({ type: "recall", hex: landingA, cardId: card1.id });
a.send({ type: "recall", hex: landingA, cardId: card2.id });
await a.waitFor((c) => myField(c).length === 0, "both Awokin step off the field");
const frozen = pts(tileOf(a, landingA));
ok("both Awokin are recalled — the tile stands empty", myField(a).length === 0, `${myField(a).length} left`);
await sleep(65000);
ok("a full rate-period after vacating, the ledger reads EXACTLY as it did", pts(tileOf(a, landingA)) === frozen, `${frozen} -> ${pts(tileOf(a, landingA))}`);

// ═══ A. The controls, at the end ═══
ok("control: the landing nobody stood on gained nothing, start to finish", pts(tileOf(a, landingC)) === "{}", pts(tileOf(a, landingC)));
ok("control: the seed tile gained nothing either", pts(tileOf(a, "0,0")) === "{}", pts(tileOf(a, "0,0")));
ok("no errors were spoken the whole drive", a.errors.length === 0 && cSeat.errors.length === 0, [...a.errors, ...cSeat.errors].join(" | "));

a.ws.close(); cSeat.ws.close();
console.log(`\nDRIVE (standing attunement at the Table): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
