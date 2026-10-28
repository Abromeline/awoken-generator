// THE ROOM'S PACK DRIVE (2026-10-28) — Nigel's ruling of
// 2026-10-28 12:54: "When people take from the pack they
// need to be able to split the amount they are taking or
// giving. And the pack should have three modes. Manual..
// as it is with the split function added, round robin,
// and dealers choice - host decides loot only."
// Boots the real server on a scratch DATA_DIR and proves,
// at the API level the room face itself speaks:
//   §1 THE ROOM OPENS; THE PACK IS SERVED: the room state
//      serves the Pack's law to every seat — Manual by
//      default, the host named, the turn at the first seat.
//   §2 THE SPLIT — GIVE: a guest gives a chosen amount of a
//      stack to the land's Pack; exactly that much moves.
//   §3 THE SPLIT — TAKE: the host claims a chosen amount
//      out of the land's Pack; the rest waits. An over-ask
//      is refused in words and nothing moves.
//   §4 THE SPLIT — ENERGY AND THE DRIZZLE: a chosen amount
//      of an energy orb lands in the guest's purse, the
//      rest waits; a drizzle splits by tenths; a full
//      purse refuses a named take whole.
//   §5 THE HOST SETS THE MODE; IT IS SERVED: the host turns
//      the Pack to round robin; a second seat's read serves
//      the new mode; a guest's hand may not set it; what
//      already rests is NOT dealt backwards.
//   §6 ROUND ROBIN — GIVES DEAL IN TURN: consecutive gifts
//      are dealt to consecutive seats in order, and the
//      turn cycles; nothing rests in the Pack.
//   §7 ROUND ROBIN — A FELL DEALS: a Fray felled on the
//      land (by the written Blade's road — the one fell
//      road with no weather in it) pays its take lot by
//      lot to the seats in turn, from the seat the served
//      state named before the fell (the dealing's own
//      ledger, drop_notices, is read in its written
//      order); the Pack's resting energy does not grow.
//   §8 DEALER'S CHOICE: a guest's take is refused in plain
//      words; a guest's GIVE still lands and rests; the
//      host assigns a chosen split amount to a chosen seat;
//      an assignment to no seat standing is refused; the
//      host's own take stands.
//   §9 A WATCHER is refused throughout (403 at the door of
//      every act: take, give, deal, set).
//   §10 AN INSTANCE ROOM'S HOST: the Tender who dealt the
//      table from a starseed hunt hosts it — they set its
//      Pack's mode; a joined seat may not.
//   §11 SOLO ROADS: off a seat, a Tender's named split
//      claim works on their OWN Pack (the same road), and
//      the room-only roads (give, set) refuse in words.
//   §12 REGRESSION SPOT-CHECKS: the solo reads stand as
//      they stood — each Tender reads their own land, and
//      their own Pack with it.
// Run AFTER `npm run build`: node scripts/drive-room-pack.mjs
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-room-pack-"));
process.env.PORT = "39873";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;
process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39873";
const PW = "room-pack-drive-password";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

await import("../server/dist/index.js");
await sleep(2500);

async function call(action, args, token, seat) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}), ...(seat ? { "x-room-seat": seat } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, body: data?.data ?? data, raw: data };
}
async function callOk(action, args, token, seat) {
  const r = await call(action, args, token, seat);
  if (r.status !== 200) throw new Error(`${action} -> ${r.status}: ${JSON.stringify(r.raw).slice(0, 300)}`);
  return r.body;
}
async function room(path, body, token, seat) {
  const res = await fetch(`${BASE}/api/room/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}), ...(seat ? { "x-room-seat": seat } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, body: data };
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up, as the other drives do */ }
const now = Date.now();

const partEl = (name, category, power, toughness, element) => Number(db.prepare(
  "INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)")
  .run(name, category, power, toughness, element, `roompack/${name}.png`, now).lastInsertRowid);
const mkKin = (ownerKey, ownerName, name, parts) => {
  const comp = JSON.stringify(parts.map(([category, element, power, toughness]) => ({
    source_id: `db:${partEl(`${name} ${category}`, category, power, toughness, element)}`,
    name: `${name} ${category}`, category, rarity: "common", power, toughness, element,
  })));
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, "roompack/awokin.png", comp, ownerName, ownerKey, now).lastInsertRowid);
};
const skyParts = () => [["body", "sky", 2, 2], ["arms", "sky", 2, 2], ["head", "sky", 2, 2]];
const stoneParts = () => [["body", "stone", 9, 9], ["arms", "stone", 9, 9], ["head", "stone", 9, 9]];
const ringOf = (q, r) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));

async function makeTender(name, { homeland = false } = {}) {
  const claim = await callOk("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 12, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', total_exp = 3800, hp = 100")
    .run(ownerKey, now);
  // A LOW purse, on purpose: the split's energy legs must
  // land inside the cap the reckoning serves, and read back
  // exactly (the room-seat drive's 5000 stands over the cap,
  // where a dealt orb could not be told from a rested one).
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5")
    .run(ownerKey, now);
  const kin = [];
  for (const w of ["Wake One", "Wake Two"]) kin.push(mkKin(ownerKey, name, `${name} ${w}`, skyParts()));
  await callOk("ensureFirstSeed", {}, claim.token);
  if (homeland) {
    await callOk("getTerritory", {}, claim.token);
    const have = new Set(db.prepare("SELECT q, r FROM territory_tiles WHERE owner_key = ? AND COALESCE(z, 0) = 0").all(ownerKey).map(t => `${t.q},${t.r}`));
    const ins = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, curse_hp, curse_max_hp, created_at) VALUES (?, ?, ?, ?, 0, NULL, NULL, ?)");
    const els = ["root", "tide", "sky", "stone", "fire"];
    for (let q = -6; q <= 6; q++) for (let r = -6; r <= 6; r++) {
      if (ringOf(q, r) > 6 || have.has(`${q},${r}`)) continue;
      ins.run(ownerKey, q, r, els[Math.abs(q * 7 + r * 3) % 5], now);
    }
  }
  return { token: claim.token, tenderId, ownerKey, name, kin };
}

/* Fixture stand-ups, in the other drives' own manner: rows
 * written directly, the acts themselves by the real roads. */
const invQty = (ownerKey, itemKey) => db.prepare("SELECT qty FROM tender_inventory WHERE owner_key = ? AND item_key = ?").get(ownerKey, itemKey)?.qty ?? 0;
const seedInv = (ownerKey, itemKey, qty) => db.prepare("INSERT INTO tender_inventory (owner_key, item_key, qty) VALUES (?, ?, ?) ON CONFLICT(owner_key, item_key) DO UPDATE SET qty = qty + excluded.qty").run(ownerKey, itemKey, qty);
const seedPack = (ownerKey, kind, itemKey, qty, element = null) => db.prepare("INSERT INTO tender_pack (owner_key, kind, item_key, qty, element) VALUES (?, ?, ?, ?, ?)").run(ownerKey, kind, itemKey, qty, element);
const purse = (ownerKey) => db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(ownerKey)?.energy ?? 0;
const setPurse = (ownerKey, energy) => db.prepare("UPDATE tender_resources SET energy = ? WHERE owner_key = ?").run(energy, ownerKey);
const packEnergy = (ownerKey) => db.prepare("SELECT COALESCE(SUM(qty), 0) AS q FROM tender_pack WHERE owner_key = ? AND kind = 'energy'").get(ownerKey).q;

console.log("§FIX the tenders — a host with a homeland, a guest, a hunter");
const H = await makeTender("Pack Host", { homeland: true });
const G = await makeTender("Pack Guest");
const H2 = await makeTender("Pack Hunter");
const guestStone = mkKin(G.ownerKey, G.name, "Guest Stonewright", stoneParts());
await callOk("addToParty", { awakenedId: guestStone }, G.token);
seedInv(G.ownerKey, "root_sap", 7);
seedInv(H.ownerKey, "root_sap", 2);
ok("§FIX the fixture stands (host land, guest's sap, low purses)",
  invQty(G.ownerKey, "root_sap") === 7 && invQty(H.ownerKey, "root_sap") === 2 && purse(G.ownerKey) === 5,
  `guest sap ${invQty(G.ownerKey, "root_sap")}, host sap ${invQty(H.ownerKey, "root_sap")}, guest purse ${purse(G.ownerKey)}`);

/* ── §1 THE ROOM OPENS; THE PACK IS SERVED ────────────── */
console.log("§1 the room opens; the Pack's law is served to every seat");
const hostEnter = await room("enter", { door: "homeland" }, H.token);
const hostSeat = hostEnter.body.seatToken;
const guestEnter = await room("enter", { door: "join", room: hostEnter.body.code }, G.token);
const guestSeat = guestEnter.body.seatToken;
ok("§1 both seats stand in the host's room", hostEnter.status === 200 && guestEnter.status === 200,
  `${hostEnter.status}/${guestEnter.status}`);
const state1 = await room("state", undefined, G.token, guestSeat);
ok("§1 the Pack is served Manual by default, its host named",
  state1.body.pack?.mode === "manual" && state1.body.pack?.hostTenderId === H.tenderId && state1.body.pack?.hostName === H.name,
  JSON.stringify(state1.body.pack));
ok("§1 the round robin's turn stands at the first seat (the host)",
  state1.body.pack?.next?.tenderId === H.tenderId, JSON.stringify(state1.body.pack?.next));
const landKey = H.ownerKey;

/* ── §2 THE SPLIT — GIVE ──────────────────────────────── */
console.log("§2 a split give moves exactly the chosen amount");
const give1 = await call("givePackDrop", { itemKey: "root_sap", amount: 3 }, G.token, guestSeat);
ok("§2 the guest's split give lands", give1.status === 200, JSON.stringify(give1.raw).slice(0, 200));
ok("§2 exactly 3 of 7 left the guest's bag, and 3 rest in the land's Pack",
  invQty(G.ownerKey, "root_sap") === 4
  && (give1.body.loot ?? []).some(e => e.itemKey === "root_sap" && e.qty === 3),
  `bag ${invQty(G.ownerKey, "root_sap")}; loot ${JSON.stringify(give1.body.loot)}`);
const giveOver = await call("givePackDrop", { itemKey: "root_sap", amount: 9 }, G.token, guestSeat);
ok("§2 a give beyond the bag is refused in words, and nothing moves",
  giveOver.status === 400 && invQty(G.ownerKey, "root_sap") === 4, `${giveOver.status}`);

/* ── §3 THE SPLIT — TAKE ──────────────────────────────── */
console.log("§3 a split take moves exactly the chosen amount; the rest waits");
const sapEntry = (give1.body.loot ?? []).find(e => e.itemKey === "root_sap");
const take1 = await call("claimPackDrop", { entryId: sapEntry.id, amount: 2 }, H.token, hostSeat);
ok("§3 the host's split take lands", take1.status === 200, JSON.stringify(take1.raw).slice(0, 200));
ok("§3 exactly 2 joined the host's bag; 1 waits in the Pack",
  invQty(H.ownerKey, "root_sap") === 4
  && (take1.body.loot ?? []).some(e => e.id === sapEntry.id && e.qty === 1),
  `bag ${invQty(H.ownerKey, "root_sap")}; loot ${JSON.stringify(take1.body.loot)}`);
const takeOver = await call("claimPackDrop", { entryId: sapEntry.id, amount: 5 }, H.token, hostSeat);
ok("§3 a take beyond the stack is refused in words, and the stack stands",
  takeOver.status === 400 && invQty(H.ownerKey, "root_sap") === 4
  && db.prepare("SELECT qty FROM tender_pack WHERE id = ?").get(sapEntry.id)?.qty === 1,
  `${takeOver.status}`);
const takeRest = await call("claimPackDrop", { entryId: sapEntry.id }, H.token, hostSeat);
ok("§3 an unnamed claim takes the whole remainder, as the Pack always stood",
  takeRest.status === 200 && invQty(H.ownerKey, "root_sap") === 5
  && !(takeRest.body.loot ?? []).some(e => e.id === sapEntry.id),
  `bag ${invQty(H.ownerKey, "root_sap")}`);

/* ── §4 THE SPLIT — ENERGY AND THE DRIZZLE ────────────── */
console.log("§4 the split reckons energy and the drizzle too");
seedPack(landKey, "energy", null, 20);
seedPack(landKey, "attunement", null, 0.3, "root");
const hostRead4 = await callOk("getTerritory", {}, H.token, hostSeat);
const energyEntry = (hostRead4.loot ?? []).find(e => e.kind === "energy");
const dripEntry = (hostRead4.loot ?? []).find(e => e.kind === "attunement");
ok("§4 the seeded lots stand in the land's Pack, read by a seat",
  !!energyEntry && energyEntry.qty === 20 && !!dripEntry && Math.abs(dripEntry.qty - 0.3) < 1e-9,
  JSON.stringify(hostRead4.loot));
const purseBefore4 = purse(G.ownerKey);
const takeEnergy = await call("claimPackDrop", { entryId: energyEntry.id, amount: 5 }, G.token, guestSeat);
ok("§4 the guest's split take of the orb lands exactly 5 in their purse; 15 wait",
  takeEnergy.status === 200 && purse(G.ownerKey) === purseBefore4 + 5
  && (takeEnergy.body.loot ?? []).some(e => e.id === energyEntry.id && e.qty === 15),
  `purse ${purseBefore4} -> ${purse(G.ownerKey)}; ${JSON.stringify(takeEnergy.raw).slice(0, 200)}`);
const takeDrip = await call("claimPackDrop", { entryId: dripEntry.id, amount: 0.2 }, G.token, guestSeat);
const dripLeft = db.prepare("SELECT qty FROM tender_pack WHERE id = ?").get(dripEntry.id)?.qty;
ok("§4 the drizzle splits by tenths: 0.2 taken, 0.1 stands",
  takeDrip.status === 200 && dripLeft != null && Math.abs(dripLeft - 0.1) < 1e-9,
  `${takeDrip.status}; left ${dripLeft}`);
setPurse(G.ownerKey, 999999);
const takeFull = await call("claimPackDrop", { entryId: energyEntry.id, amount: 1 }, G.token, guestSeat);
ok("§4 a full purse refuses a named take whole — the orb stands untouched",
  takeFull.status === 400 && db.prepare("SELECT qty FROM tender_pack WHERE id = ?").get(energyEntry.id)?.qty === 15,
  `${takeFull.status}`);
setPurse(G.ownerKey, purseBefore4 + 5);

/* ── §5 THE HOST SETS THE MODE; IT IS SERVED ──────────── */
console.log("§5 the host turns the Pack; the turn is served to a second seat");
const guestSet = await call("setRoomPackMode", { mode: "roundrobin" }, G.token, guestSeat);
ok("§5 a guest's hand may not set the Pack's mode",
  guestSet.status === 400 && /host/i.test(guestSet.raw.error ?? ""), `${guestSet.status}: ${guestSet.raw.error ?? ""}`);
const hostSet = await call("setRoomPackMode", { mode: "roundrobin" }, H.token, hostSeat);
ok("§5 the host sets round robin", hostSet.status === 200 && hostSet.body.mode === "roundrobin", JSON.stringify(hostSet.raw).slice(0, 200));
const state5 = await room("state", undefined, G.token, guestSeat);
ok("§5 the new mode is served to the second seat, and the turn is named",
  state5.body.pack?.mode === "roundrobin" && !!state5.body.pack?.next?.name,
  JSON.stringify(state5.body.pack));
const read5 = await callOk("getTerritory", {}, G.token, guestSeat);
ok("§5 what already rested is NOT dealt backwards (the orb still waits, whole)",
  (read5.loot ?? []).some(e => e.kind === "energy" && e.qty === 15), JSON.stringify(read5.loot));

/* ── §6 ROUND ROBIN — GIVES DEAL IN TURN ──────────────── */
console.log("§6 round robin deals consecutive gifts to consecutive seats, and cycles");
// The turn stands where the served state names it; follow
// it seat by seat for three gifts: A, B, A again.
const seatOf = { [H.tenderId]: { who: H, seat: hostSeat, label: "host" }, [G.tenderId]: { who: G, seat: guestSeat, label: "guest" } };
let turnState = (await room("state", undefined, H.token, hostSeat)).body;
const order = [];
for (let i = 0; i < 3; i++) {
  const nextId = turnState.pack.next.tenderId;
  const giver = nextId === H.tenderId ? seatOf[G.tenderId] : seatOf[H.tenderId];
  const getter = seatOf[nextId];
  const before = invQty(getter.who.ownerKey, "root_sap");
  const gift = await call("givePackDrop", { itemKey: "root_sap", amount: 1 }, giver.who.token, giver.seat);
  const after = invQty(getter.who.ownerKey, "root_sap");
  order.push(nextId);
  ok(`§6 gift ${i + 1} is dealt at once to the seat whose turn stands (${getter.label})`,
    gift.status === 200 && after === before + 1 && /dealt at once/.test(gift.body.line ?? ""),
    `${gift.status}; ${getter.label} sap ${before} -> ${after}; line: ${gift.body.line ?? ""}`);
  turnState = (await room("state", undefined, H.token, hostSeat)).body;
}
ok("§6 the turn cycles in seat order (A, B, A)",
  order.length === 3 && order[0] === order[2] && order[0] !== order[1], order.join(","));
const read6 = await callOk("getTerritory", {}, H.token, hostSeat);
ok("§6 nothing of the gifts rested in the Pack (no new sap entry waits)",
  !(read6.loot ?? []).some(e => e.itemKey === "root_sap"), JSON.stringify(read6.loot));

/* ── §7 ROUND ROBIN — A FELL DEALS ────────────────────── */
console.log("§7 a fell on the land deals its take to the seats in turn");
// The fell is struck by the written Blade's own road
// (looseBlade): flat power, no roll, no AC — the dark
// falls whole, and the fell pays its take through
// creditBattleKill, as every beaten creature pays. (The
// living battle's settles were tried first and are the
// wrong instrument for a dealing proof: a dark beside
// the heart dies to the seed's light — "unmade by the
// light: no blow beat it, nothing is paid" — and the
// Tender's weapon referee bypasses the take by its own
// standing law. The Blade's road has neither weather in
// it.) The Blade working itself is a fixture row, in the
// drives' manner; the loose is the player's real act,
// spoken by a seated guest on the host's land.
const heartTile = db.prepare("SELECT id, q, r FROM territory_tiles WHERE owner_key = ? AND q = 0 AND r = 0 AND COALESCE(z, 0) = 0").get(landKey);
db.prepare(`INSERT INTO territory_workings (owner_key, spell_key, engine, kind, tile_id, nums, charges, created_at)
  VALUES (?, 'single-blade', 'blade', 'rune', ?, '{"power":6}', 3, ?)`)
  .run(landKey, heartTile.id, now);
const frayId = Number(db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
  VALUES (?, ?, 'fray', ?, 1, ?, ?, 1, 1, 0)`).run(landKey, heartTile.id, now, heartTile.q, heartTile.r).lastInsertRowid);
const turnBefore7 = (await room("state", undefined, H.token, hostSeat)).body.pack.next;
const energyBefore7 = packEnergy(landKey);
const loose = await call("looseBlade", { wandererId: frayId }, G.token, guestSeat);
const frayGone = !db.prepare("SELECT id FROM homeland_wanderers WHERE id = ?").get(frayId);
ok("§7 the guest's loosed Blade fells the dark on the host's land",
  loose.status === 200 && loose.body.felled === true && frayGone,
  `${loose.status}: ${JSON.stringify(loose.raw).slice(0, 200)}`);
// The dealing's own ledger: drop_notices rows persist in
// the order they were written, one per lot dealt. A
// fell's take may hold several lots (its energy, and
// sometimes goods or shards) — every lot must fall to
// the next seat in turn, starting where the served
// state named the turn before the fell.
const dealtRows = db.prepare("SELECT owner_key, line FROM drop_notices WHERE line LIKE '%dealt%' ORDER BY id").all();
const seatOrder7 = [H, G];
const startIdx7 = seatOrder7.findIndex(t => t.tenderId === turnBefore7.tenderId);
const inTurn = dealtRows.length > 0 && dealtRows.every((row, i) => row.owner_key === seatOrder7[(startIdx7 + i) % seatOrder7.length].ownerKey);
ok("§7 every lot the fell paid was dealt in turn, from the seat the served state named",
  inTurn, `next was ${turnBefore7.name}; rows: ${JSON.stringify(dealtRows)}`);
ok("§7 the fell's energy is among the dealt lots (spoken under a seat's own key)",
  dealtRows.some(row => /energy/.test(row.line) && /dealt to you by the Pack's turn/.test(row.line)),
  JSON.stringify(dealtRows));
ok("§7 the Pack's resting energy did not grow from the fell (it was dealt, not rested)",
  packEnergy(landKey) === energyBefore7, `${energyBefore7} -> ${packEnergy(landKey)}`);

/* ── §8 DEALER'S CHOICE ───────────────────────────────── */
console.log("§8 dealer's choice — the host decides loot only");
await callOk("setRoomPackMode", { mode: "dealer" }, H.token, hostSeat);
const state8 = await room("state", undefined, G.token, guestSeat);
ok("§8 dealer's choice is served to the guest's seat", state8.body.pack?.mode === "dealer", JSON.stringify(state8.body.pack));
seedPack(landKey, "item", "root_sap", 10);
const read8 = await callOk("getTerritory", {}, G.token, guestSeat);
const dealerEntry = (read8.loot ?? []).find(e => e.itemKey === "root_sap");
const guestTake8 = await call("claimPackDrop", { entryId: dealerEntry.id, amount: 2 }, G.token, guestSeat);
ok("§8 a guest's take is refused in plain words — Dealer's choice",
  guestTake8.status === 400 && /Dealer's choice/.test(guestTake8.raw.error ?? "")
  && db.prepare("SELECT qty FROM tender_pack WHERE id = ?").get(dealerEntry.id)?.qty === 10,
  `${guestTake8.status}: ${guestTake8.raw.error ?? ""}`);
const guestGive8 = await call("givePackDrop", { itemKey: "root_sap", amount: 1 }, G.token, guestSeat);
ok("§8 a guest's give still lands in dealer's choice, and rests for the host",
  guestGive8.status === 200 && db.prepare("SELECT qty FROM tender_pack WHERE id = ?").get(dealerEntry.id)?.qty === 11,
  `${guestGive8.status}`);
const assignBad = await call("assignPackDrop", { entryId: dealerEntry.id, amount: 2, targetTenderId: H2.tenderId }, H.token, hostSeat);
ok("§8 an assignment to a Tender not seated here is refused",
  assignBad.status === 400 && db.prepare("SELECT qty FROM tender_pack WHERE id = ?").get(dealerEntry.id)?.qty === 11,
  `${assignBad.status}: ${assignBad.raw.error ?? ""}`);
const guestInvBefore8 = invQty(G.ownerKey, "root_sap");
const assign1 = await call("assignPackDrop", { entryId: dealerEntry.id, amount: 4, targetTenderId: G.tenderId }, H.token, hostSeat);
ok("§8 the host assigns a chosen split (4 of 11) to a chosen seat",
  assign1.status === 200 && invQty(G.ownerKey, "root_sap") === guestInvBefore8 + 4
  && db.prepare("SELECT qty FROM tender_pack WHERE id = ?").get(dealerEntry.id)?.qty === 7,
  `${assign1.status}; guest sap ${guestInvBefore8} -> ${invQty(G.ownerKey, "root_sap")}; ${JSON.stringify(assign1.raw).slice(0, 200)}`);
const guestAssign = await call("assignPackDrop", { entryId: dealerEntry.id, amount: 1, targetTenderId: G.tenderId }, G.token, guestSeat);
ok("§8 a guest may not deal the Pack", guestAssign.status === 400, `${guestAssign.status}`);
const hostInvBefore8 = invQty(H.ownerKey, "root_sap");
const hostTake8 = await call("claimPackDrop", { entryId: dealerEntry.id, amount: 1 }, H.token, hostSeat);
ok("§8 the host's own take from the Pack stands",
  hostTake8.status === 200 && invQty(H.ownerKey, "root_sap") === hostInvBefore8 + 1,
  `${hostTake8.status}`);

/* ── §9 A WATCHER IS REFUSED THROUGHOUT ───────────────── */
console.log("§9 a watcher may look, and nothing more");
const watchEnter = await room("enter", { door: "join", room: hostEnter.body.code, watch: true, name: "Pack Watcher" }, null);
const watchSeat = watchEnter.body.seatToken;
const wClaim = await call("claimPackDrop", { entryId: dealerEntry.id }, null, watchSeat);
const wGive = await call("givePackDrop", { itemKey: "root_sap", amount: 1 }, null, watchSeat);
const wSet = await call("setRoomPackMode", { mode: "manual" }, null, watchSeat);
const wAssign = await call("assignPackDrop", { entryId: dealerEntry.id, targetTenderId: G.tenderId }, null, watchSeat);
ok("§9 the watcher is refused at every Pack act (403, the door's own words)",
  [wClaim, wGive, wSet, wAssign].every(r => r.status === 403 && /Watchers may look/.test(r.raw.error ?? "")),
  [wClaim, wGive, wSet, wAssign].map(r => r.status).join(","));

/* ── §10 AN INSTANCE ROOM'S HOST ──────────────────────── */
console.log("§10 the Tender who dealt a fresh table hosts its Pack");
const huntEnter = await room("enter", { door: "starseed" }, H2.token);
const huntSeat = huntEnter.body.seatToken;
const huntState = await room("state", undefined, H2.token, huntSeat);
ok("§10 the hunter is the dealt table's host, served in its Pack",
  huntEnter.body.isHost === true && huntState.body.pack?.hostTenderId === H2.tenderId,
  JSON.stringify(huntState.body.pack));
const huntSet = await call("setRoomPackMode", { mode: "dealer" }, H2.token, huntSeat);
ok("§10 the hunter sets their table's Pack to dealer's choice", huntSet.status === 200, `${huntSet.status}: ${huntSet.raw.error ?? ""}`);
const joinEnter = await room("enter", { door: "join", room: huntEnter.body.code }, G.token);
const joinSet = await call("setRoomPackMode", { mode: "manual" }, G.token, joinEnter.body.seatToken);
ok("§10 a joined seat may not set the dealt table's Pack",
  joinSet.status === 400 && /host/i.test(joinSet.raw.error ?? ""), `${joinSet.status}: ${joinSet.raw.error ?? ""}`);
const joinState = await room("state", undefined, G.token, joinEnter.body.seatToken);
ok("§10 the dealt table's mode is served to the joined seat",
  joinState.body.pack?.mode === "dealer" && joinState.body.pack?.hostTenderId === H2.tenderId,
  JSON.stringify(joinState.body.pack));

/* ── §11 SOLO ROADS ───────────────────────────────────── */
console.log("§11 off a seat, the split serves a Tender's own Pack; the room roads refuse");
seedPack(H2.ownerKey, "item", "root_sap", 6);
const h2Read = await callOk("getTerritory", {}, H2.token);
const h2Entry = (h2Read.loot ?? []).find(e => e.itemKey === "root_sap");
const soloTake = await call("claimPackDrop", { entryId: h2Entry.id, amount: 4 }, H2.token);
ok("§11 a named split claim works on a Tender's own Pack, off any seat",
  soloTake.status === 200 && invQty(H2.ownerKey, "root_sap") === 4
  && db.prepare("SELECT qty FROM tender_pack WHERE id = ?").get(h2Entry.id)?.qty === 2,
  `${soloTake.status}; bag ${invQty(H2.ownerKey, "root_sap")}`);
const soloGive = await call("givePackDrop", { itemKey: "root_sap", amount: 1 }, H2.token);
ok("§11 giving is a room's road — solo, it refuses in plain words",
  soloGive.status === 400 && /room's road/.test(soloGive.raw.error ?? ""), `${soloGive.status}: ${soloGive.raw.error ?? ""}`);
const soloSet = await call("setRoomPackMode", { mode: "dealer" }, H2.token);
ok("§11 the modes belong to a room — solo, setting refuses in plain words",
  soloSet.status === 400, `${soloSet.status}: ${soloSet.raw.error ?? ""}`);

/* ── §12 REGRESSION SPOT-CHECKS ───────────────────────── */
console.log("§12 the solo homeland stands as it stood");
const hostSolo = await callOk("getTerritory", {}, H.token);
const guestSolo = await callOk("getTerritory", {}, G.token);
ok("§12 the host's solo read is their own land (127 tiles, their own Pack served)",
  (hostSolo.tiles ?? []).length >= 127 && Array.isArray(hostSolo.loot), `${(hostSolo.tiles ?? []).length}`);
ok("§12 the guest's solo read is the guest's own land, not the host's",
  !(guestSolo.placements ?? []).some(p => p.awakenedId === guestStone)
  && !(guestSolo.loot ?? []).some(e => e.itemKey === "root_sap"),
  "");

console.log(`\nROOM-PACK DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
