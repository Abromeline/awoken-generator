// THE SUMMON GATE — THE FOLLOWING, NOT THE PARTY
// (Nigel, 2026-10-24 15:48 + 15:51 + 15:52). Boots the
// real server on a scratch DATA_DIR and proves the gate
// law at the API:
//   §A THE FOLLOWING GATE: any Awokin of the deck can be
//      summoned (membership is never asked); a landed
//      summon follows by default and is enrolled in the
//      party by the cast (following means in party); the
//      party count caps the FOLLOWING — at cap, a summon
//      is refused whole and spends nothing; giving orders
//      to a follower (a march) ends its follow and its
//      membership and frees the spot, and the next summon
//      lands; Awoken standing on the field under orders
//      never count as party (the field can hold more than
//      the party does).
//   §B THE LANDING TALLY: a summon cannot land on a hex
//      already holding four or more NON-PARTY Awoken —
//      it lands on a clear beside-hex instead; when every
//      hex at the Tender's side stands so crowded, the
//      call is refused whole and spends nothing; the
//      refused hex still accepts a walker afterward
//      (the tally caps the landing only). Awoken IN the
//      party (the following) never weigh on the tally: a
//      hex holding four followers accepts a summon
//      landing on it.
// Run: node scripts/drive-summon-gate.mjs
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-sgate-"));
process.env.PORT = "3987";
process.env.WORKSHOP_PASSWORD = "sgate-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3987";
const PW = "sgate-drive-password";
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
async function callRaw(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data: data?.data ?? data };
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up, as the other drives do */ }

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

function seedAwokin(ownerKey, tenderName, name, partPower = 2) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, 'root', ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, partPower, partPower, `sgate/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: partPower, toughness: partPower, element: "root" });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `sgate/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
async function claimWithExp(name, exp) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, exp, Date.now());
  db.prepare("UPDATE tender_progress SET class_key = 'warden' WHERE owner_key = ?").run(ownerKey);
  return { token: claim.token, ownerKey };
}
function seedPatch(ownerKey, radius) {
  const now = Date.now();
  const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', 0, ?)");
  for (let q = -radius; q <= radius; q++) for (let r = -radius; r <= radius; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > radius) continue;
    insTile.run(ownerKey, q, r, now);
  }
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 100000, ?)").run(ownerKey, now);
}
function placeDirect(ownerKey, awakenedId, tile, follow, ordered) {
  db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
    VALUES (?, ?, ?, ?, ?, 'attack', ?, 10, ?, ?, 0, 0, ?)`).run(
    ownerKey, awakenedId, tile.id, Date.now(), Date.now(), follow, tile.q, tile.r, ordered ? 1 : 0);
  if (follow) db.prepare("INSERT INTO tender_party (owner_key, awakened_id, added_at) VALUES (?, ?, ?)").run(ownerKey, awakenedId, Date.now());
}
const energyOf = (ownerKey) => db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(ownerKey).energy;
const placedOf = (ownerKey, id) => db.prepare("SELECT COUNT(*) AS n FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(ownerKey, id).n;
const fieldCount = (ownerKey) => db.prepare("SELECT COUNT(*) AS n FROM field_placements WHERE owner_key = ?").get(ownerKey).n;
const followingOf = (ownerKey) => db.prepare("SELECT COUNT(*) AS n FROM field_placements WHERE owner_key = ? AND follow = 1").get(ownerKey).n;
const inParty = (ownerKey, id) => db.prepare("SELECT COUNT(*) AS n FROM tender_party WHERE owner_key = ? AND awakened_id = ?").get(ownerKey, id).n;
async function summonUntil(token, id, tries = 24) {
  for (let i = 0; i < tries; i++) {
    const r = await call("summonAwoken", { awakenedId: id }, token);
    if (r.summoned) return r;
  }
  return null;
}

/* ══ §A THE FOLLOWING GATE ═══════════════════════════════ */
console.log("§A the following gate — the deck summons, the count caps the following, orders free the spot");
{
  const A = await claimWithExp("Gate Keeper", 3800); // Lv 10 — the party width stays the base 3 (no party stars)
  seedPatch(A.ownerKey, 3);
  const deck = [];
  for (let i = 1; i <= 5; i++) deck.push(seedAwokin(A.ownerKey, "Gate Keeper", `Gate Deck ${i}`, 2)); // power 6, cost 6
  const party0 = await call("getParty", {}, A.token);
  ok("the party width reads 3 — no party stars held", party0.cap === 3 && party0.size === 0, JSON.stringify({ cap: party0.cap, size: party0.size }));

  // (a) A deck Awokin in no party is summoned outright.
  const land1 = await summonUntil(A.token, deck[0]);
  ok("a deck Awokin in no party is summoned outright — the cast, never a membership refusal", !!land1 && placedOf(A.ownerKey, deck[0]) === 1);
  const row1 = db.prepare("SELECT follow FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(A.ownerKey, deck[0]);
  ok("the landed summon follows by default, and the cast enrolled it in the party — following means in party",
    row1?.follow === 1 && inParty(A.ownerKey, deck[0]) === 1, JSON.stringify({ follow: row1?.follow, inParty: inParty(A.ownerKey, deck[0]) }));

  const land2 = await summonUntil(A.token, deck[1]);
  const land3 = await summonUntil(A.token, deck[2]);
  ok("two more deck summons land — the following stands at the cap of 3",
    !!land2 && !!land3 && followingOf(A.ownerKey) === 3, `following=${followingOf(A.ownerKey)}`);

  // (a′) At a full following, the next summon is refused whole.
  const eFull = energyOf(A.ownerKey);
  const refused = await callRaw("summonAwoken", { awakenedId: deck[3] }, A.token);
  ok("at a full following the next summon is refused — the gate speaks of the following, and the way past is orders",
    refused.status === 400 && /following stands full/.test(refused.data?.error ?? ""), JSON.stringify(refused.data));
  ok("the refusal spent nothing, fielded nothing, and the following never exceeded the cap",
    energyOf(A.ownerKey) === eFull && placedOf(A.ownerKey, deck[3]) === 0 && followingOf(A.ownerKey) === 3);

  // (c) Orders free the spot: march the first follower away.
  const terr = await call("getTerritory", {}, A.token);
  const tileById = new Map((terr.tiles ?? []).map(t => [t.id, t]));
  const firstTile = tileById.get(db.prepare("SELECT tile_id AS id FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(A.ownerKey, deck[0]).id);
  const dest = (terr.tiles ?? []).find(t => hexDist(t, firstTile) === 2);
  const march = await call("setMarch", { awakenedId: deck[0], tileId: dest.id }, A.token);
  ok("the march order is given to a follower", march.ok === true, JSON.stringify(march));
  const rowM = db.prepare("SELECT follow FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(A.ownerKey, deck[0]);
  ok("the order ended the follow and the membership — and the Awokin still stands on the field",
    rowM?.follow === 0 && inParty(A.ownerKey, deck[0]) === 0 && placedOf(A.ownerKey, deck[0]) === 1
    && followingOf(A.ownerKey) === 2 && fieldCount(A.ownerKey) === 3,
    JSON.stringify({ follow: rowM?.follow, inParty: inParty(A.ownerKey, deck[0]), following: followingOf(A.ownerKey), field: fieldCount(A.ownerKey) }));

  // (c′) The freed spot takes the next summon.
  const land4 = await summonUntil(A.token, deck[3]);
  ok("with the spot freed by orders, the once-refused summon lands and follows",
    !!land4 && placedOf(A.ownerKey, deck[3]) === 1 && followingOf(A.ownerKey) === 3 && inParty(A.ownerKey, deck[3]) === 1);

  // (d) The field now holds FOUR Awoken; the party holds three.
  const partyEnd = await call("getParty", {}, A.token);
  ok("the field holds 4 while the party holds 3 — field Awoken under orders never count as party",
    fieldCount(A.ownerKey) === 4 && partyEnd.size === 3 && followingOf(A.ownerKey) === 3,
    JSON.stringify({ field: fieldCount(A.ownerKey), party: partyEnd.size, following: followingOf(A.ownerKey) }));
}

/* ══ §B THE LANDING TALLY ════════════════════════════════ */
console.log("§B the landing tally — followers never crowd a landing out; four non-party standing refuse it");
{
  // B1: a hex holding four FOLLOWERS accepts a summon landing.
  const B = await claimWithExp("Crowd Friend", 3800);
  for (const star of ["w_b2", "w_b7", "w_b10"]) {
    db.prepare("INSERT INTO tender_skills (owner_key, skill_key, pool, created_at) VALUES (?, ?, 'zodiac', ?)").run(B.ownerKey, star, Date.now());
  }
  seedPatch(B.ownerKey, 2);
  const partyB = await call("getParty", {}, B.token);
  ok("three second-arm party stars widen the width past five", partyB.cap >= 5, `cap=${partyB.cap}`);
  const terrB = await call("getTerritory", {}, B.token);
  const standB = (terrB.tiles ?? []).find(t => t.id === terrB.tender?.tileId);
  const bDeck = [];
  for (let i = 1; i <= 6; i++) bDeck.push(seedAwokin(B.ownerKey, "Crowd Friend", `Crowd Deck ${i}`, 2));
  for (let i = 0; i < 4; i++) placeDirect(B.ownerKey, bDeck[i], standB, 1, false);
  ok("four followers stand on the Tender's own hex, and the following (4) stands under the widened cap",
    followingOf(B.ownerKey) === 4, `following=${followingOf(B.ownerKey)}`);
  const landB = await summonUntil(B.token, bDeck[4]);
  ok("the summon LANDS on the hex holding four followers — their standing never weighs on the tally",
    !!landB && landB.tileId === standB.id, JSON.stringify({ landed: landB?.tileId, stand: standB.id }));

  // B2: four NON-PARTY standing refuse the landing there —
  // the summon takes a clear beside-hex instead.
  const C = await claimWithExp("Crowd Warden", 3800);
  seedPatch(C.ownerKey, 2);
  const terrC = await call("getTerritory", {}, C.token);
  const standC = (terrC.tiles ?? []).find(t => t.id === terrC.tender?.tileId);
  const tilesC = terrC.tiles ?? [];
  const ringC = tilesC.filter(t => hexDist(t, standC) === 1);
  const outerC = tilesC.find(t => hexDist(t, standC) === 2);
  const cDeck = [];
  for (let i = 1; i <= 34; i++) cDeck.push(seedAwokin(C.ownerKey, "Crowd Warden", `Warden Deck ${i}`, 2));
  let ci = 0;
  for (let i = 0; i < 4; i++) placeDirect(C.ownerKey, cDeck[ci++], standC, 0, true);
  const firstTarget = cDeck[ci++];
  const landC = await summonUntil(C.token, firstTarget);
  const landedTileC = tilesC.find(t => t.id === landC?.tileId);
  ok("with four non-party standing on the Tender's hex, the summon lands on a clear beside-hex instead",
    !!landC && landC.tileId !== standC.id && !!landedTileC && hexDist(landedTileC, standC) === 1,
    JSON.stringify({ landed: landC?.tileId, stand: standC.id }));
  const target2 = cDeck[ci++];

  // B3: crowd every beside-hex the same way — the call is
  // refused whole, and spends nothing.
  for (const tile of ringC) for (let i = 0; i < 4; i++) placeDirect(C.ownerKey, cDeck[ci++], tile, 0, true);
  const eCrowd = energyOf(C.ownerKey);
  const refusedC = await callRaw("summonAwoken", { awakenedId: target2 }, C.token);
  ok("with every hex at the Tender's side holding four or more non-party, the summon is refused whole",
    refusedC.status === 400 && /four or more/.test(refusedC.data?.error ?? ""), JSON.stringify(refusedC.data));
  ok("the crowded refusal spent nothing and fielded nothing",
    energyOf(C.ownerKey) === eCrowd && placedOf(C.ownerKey, target2) === 0);

  // B4: the refused hex still accepts a walker afterward —
  // the tally caps the landing only, never the walking.
  const walker = cDeck[ci++];
  placeDirect(C.ownerKey, walker, outerC, 0, true);
  const marchC = await call("setMarch", { awakenedId: walker, tileId: standC.id }, C.token);
  const marchRow = db.prepare("SELECT march_path FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(C.ownerKey, walker);
  const road = marchRow?.march_path ? JSON.parse(marchRow.march_path) : [];
  ok("a walker is marched onto the overcrowded hex all the same — the road is accepted and runs there",
    marchC.ok === true && Array.isArray(road) && road[road.length - 1] === standC.id,
    JSON.stringify({ march: marchC, road }));
}

console.log(`\nSUMMON GATE DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
