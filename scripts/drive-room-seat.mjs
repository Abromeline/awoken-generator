// THE HOMELAND SERVES DISCORD — THE ROOM SEAT DRIVE
// (2026-10-28). Boots the real server on a scratch DATA_DIR
// and proves the room layer end to end, at the API level the
// room face itself speaks:
//   §1 HOST HOMELAND: a Tender opens their own homeland as a
//      room; the seat stands on THEIR land (one record).
//   §2 A GUEST JOINS the room by its code; both seats show in
//      the room's party (state), each with its figure stand.
//   §3 THE GUEST ACTS, THE HOST'S LAND CHANGES: the guest
//      summons THEIR OWN Awoken onto the host's land — the
//      placement stands on the host's rows (owner) under the
//      guest's name (actor), the host's own solo read serves
//      it back with its creature payload, and the guest's own
//      homeland gains nothing.
//   §4 ONE SHARED FIGHT: a Fray beside the guest's placement;
//      the battle watermark is backdated once, the GUEST's
//      room read settles it, and the HOST's solo read serves
//      the identical settled state — one fight, one ledger.
//   §5 SEARCH FOR A STARSEED: the door deals a fresh table —
//      127 tiles under a room land key, a seed at its heart,
//      played under the homeland's rules (the read serves it).
//   §6 THE DOOR'S WORD: the host sets a password; a guest
//      without it is refused in plain words, the wrong word
//      is refused, the right word seats.
//   §7 THE STONE CAST IN A ROOM: the guest's fielded ≥2-Rock
//      Awoken leads a cast on the host's land — the piece
//      rises on the HOST's rows.
//   §8 A WATCHER reads the land and may not act.
//   §9 THE ROOM GUARD: solo-only roads refuse room calls.
//   §10 A DISCORD-SHAPED ARRIVAL binds (the Push 36 intro
//      door's road) and then seats in the room.
//   §11 SOLO SPOT-CHECKS: without a seat, the homeland is
//      exactly itself (host summons at home; guest reads
//      their own land, not the host's).
//   §12 GUESTS TAKE DAMAGE (THE ROOM'S BODY LAW, Nigel
//      2026-10-28 12:54: "Guests should take damage"): a
//      seated guest's figure is bitten by the curse's dark
//      (the wound on the GUEST's own record, the host's body
//      untouched), withers on cursed ground by the homeland's
//      attrition, falls (blackout on their own ledger, their
//      homeland stand never written), may not walk while
//      fallen, and wakes half-healed with their SEAT standing
//      at the host land's safe hex.
//   §13 STAR SEEDS DRAW FROM ANY TENDER STANDING ON THEM
//      (THE ROOM'S SEED LAW, Nigel 2026-10-28 12:54): a guest
//      standing on the host's seed feeds it at the guest's
//      own rate out of the guest's own purse (the host's
//      purse untouched); two seats standing on a fresh
//      table's heart seed feed it together, each from their
//      own purse; and a seat's body settles on an instance
//      land too (attrition under a guest's feet there).
// Run AFTER `npm run build`: node scripts/drive-room-seat.mjs
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-room-seat-"));
process.env.PORT = "39871";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;
process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39871";
const PW = "room-seat-drive-password";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

await import("../server/dist/index.js");
const { issueTableToken } = await import("../server/dist/table.js");
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
  .run(name, category, power, toughness, element, `roomseat/${name}.png`, now).lastInsertRowid);
const mkKin = (ownerKey, ownerName, name, parts) => {
  const comp = JSON.stringify(parts.map(([category, element, power, toughness]) => ({
    source_id: `db:${partEl(`${name} ${category}`, category, power, toughness, element)}`,
    name: `${name} ${category}`, category, rarity: "common", power, toughness, element,
  })));
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, "roomseat/awokin.png", comp, ownerName, ownerKey, now).lastInsertRowid);
};
const skyParts = () => [["body", "sky", 2, 2], ["arms", "sky", 2, 2], ["head", "sky", 2, 2]];
const smallParts = () => [["body", "sky", 1, 1], ["arms", "sky", 1, 1], ["head", "sky", 1, 1]];
const stoneParts = () => [["body", "stone", 9, 9], ["arms", "stone", 9, 9], ["head", "stone", 9, 9]];
const ringOf = (q, r) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));

async function makeTender(name, { homeland = false } = {}) {
  const claim = await callOk("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 12, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', total_exp = 3800, hp = 100")
    .run(ownerKey, now);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000")
    .run(ownerKey, now);
  const kin = [];
  for (const w of ["Wake One", "Wake Two"]) kin.push(mkKin(ownerKey, name, `${name} ${w}`, skyParts()));
  await callOk("ensureFirstSeed", {}, claim.token);
  if (homeland) {
    await callOk("getTerritory", {}, claim.token);
    const have = new Set(db.prepare("SELECT q, r FROM territory_tiles WHERE owner_key = ? AND COALESCE(z, 0) = 0").all(ownerKey).map(t => `${t.q},${t.r}`));
    const ins = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, curse_hp, curse_max_hp, created_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)");
    const els = ["root", "tide", "sky", "stone", "fire"];
    for (let q = -6; q <= 6; q++) for (let r = -6; r <= 6; r++) {
      if (ringOf(q, r) > 6 || have.has(`${q},${r}`)) continue;
      const hp = 10 + ringOf(q, r) * 2;
      ins.run(ownerKey, q, r, els[Math.abs(q * 7 + r * 3) % 5], hp, hp, now);
    }
    db.prepare("UPDATE territory_tiles SET cursed = 0, element = 'sky', curse_hp = NULL, curse_max_hp = NULL WHERE owner_key = ? AND q = 0 AND r = 0 AND COALESCE(z, 0) = 0").run(ownerKey);
  }
  return { token: claim.token, tenderId, ownerKey, name, kin };
}

console.log("§FIX the tenders — a host with a homeland, a guest with a stonewright");
const H = await makeTender("Room Host", { homeland: true });
const G = await makeTender("Room Guest");
const guestStone = mkKin(G.ownerKey, G.name, "Guest Stonewright", stoneParts());
const guestSmall = mkKin(G.ownerKey, G.name, "Guest Smallwing", smallParts());
await callOk("addToParty", { awakenedId: guestStone }, G.token);
await callOk("addToParty", { awakenedId: guestSmall }, G.token);
const hostTilesBefore = db.prepare("SELECT COUNT(*) AS n FROM territory_tiles WHERE owner_key = ?").get(H.ownerKey).n;
ok("§FIX the host's homeland stands", hostTilesBefore >= 127, `${hostTilesBefore}`);

/* ── §1 HOST HOMELAND ─────────────────────────────────── */
console.log("§1 the host opens their homeland as a room");
const hostEnter = await room("enter", { door: "homeland" }, H.token);
ok("§1 the homeland door seats the host", hostEnter.status === 200 && hostEnter.body.door === "homeland", JSON.stringify(hostEnter.body).slice(0, 200));
ok("§1 the room's code names the homeland", hostEnter.body.code === `homeland-${H.tenderId}`, hostEnter.body.code);
const hostSeat = hostEnter.body.seatToken;

/* ── §2 THE GUEST JOINS ───────────────────────────────── */
console.log("§2 the guest joins by the room's code");
const guestEnter = await room("enter", { door: "join", room: hostEnter.body.code }, G.token);
ok("§2 the guest seats in the host's room", guestEnter.status === 200 && guestEnter.body.isHost === false, JSON.stringify(guestEnter.body).slice(0, 200));
const guestSeat = guestEnter.body.seatToken;
const state2 = await room("state", undefined, G.token, guestSeat);
ok("§2 the room's party shows both seats, with stands", state2.body.seats?.length === 2
  && state2.body.seats.every(s => s.tileId != null), JSON.stringify(state2.body.seats).slice(0, 300));
ok("§2 the seed's climb strip rides the room state", !!state2.body.seed && typeof state2.body.seed.level === "number", JSON.stringify(state2.body.seed));

/* ── §3 THE GUEST ACTS; THE HOST'S LAND CHANGES ───────── */
console.log("§3 the guest's company stands and summons on the host's land");
const guestStandTile = guestEnter.body.you.tileId;
// The stonewright is FIELDED on the host's land as a landed
// summon leaves it (the homeland's summon roll cannot carry a
// power-27 Awoken — DC 10+27 — so crews are fielded and then
// act; the stone-cast drive fields its crew the same way).
// The state is exactly a landed summon's: the host's land,
// the guest's name.
db.prepare(`INSERT INTO field_placements (owner_key, actor_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
  SELECT ?, ?, ?, id, ?, ?, 'defense', 0, 99, q, r, NULL, NULL, 0 FROM territory_tiles WHERE id = ?`)
  .run(H.ownerKey, G.ownerKey, guestStone, now, now, guestStandTile);
const placementRow = db.prepare("SELECT * FROM field_placements WHERE awakened_id = ?").get(guestStone);
ok("§3 the guest's placement stands on the HOST's land under the GUEST's name",
  !!placementRow && placementRow.owner_key === H.ownerKey && placementRow.actor_key === G.ownerKey,
  JSON.stringify(placementRow ?? null));
// And a summon by the handler's own road, in the room: a small
// kin, recast as the casting law allows (a failed roll costs
// that cast only) until the call lands.
let summon = null;
for (let i = 0; i < 25 && !(summon?.body?.summoned === true); i++) {
  summon = await call("summonAwoken", { awakenedId: guestSmall, tileId: guestStandTile }, G.token, guestSeat);
  if (summon.status !== 200) break;
}
ok("§3 the guest's summon lands in the room (recast until it lands)",
  summon?.status === 200 && summon.body.summoned === true, JSON.stringify(summon?.raw ?? {}).slice(0, 300));
const smallRow = db.prepare("SELECT * FROM field_placements WHERE awakened_id = ?").get(guestSmall);
ok("§3 the summoned placement is the handler's own writing: host's land, guest's name",
  !!smallRow && smallRow.owner_key === H.ownerKey && smallRow.actor_key === G.ownerKey,
  JSON.stringify(smallRow ?? null));
const hostRead = await callOk("getTerritory", {}, H.token);
const servedPlacement = (hostRead.placements ?? []).find(p => p.awakenedId === guestStone);
ok("§3 the host's own solo read serves the guest's placement, named",
  !!servedPlacement && servedPlacement.name === "Guest Stonewright", JSON.stringify(servedPlacement ?? null).slice(0, 200));
ok("§3 the host's read carries the guest's creature payload (the map can draw it)",
  (hostRead.guestAwoken ?? []).some(a => a.id === guestStone), `${(hostRead.guestAwoken ?? []).length} guest payloads`);
const guestOwnLand = await callOk("getTerritory", {}, G.token);
ok("§3 the guest's own homeland gained no placement from the room act",
  !(guestOwnLand.placements ?? []).some(p => p.awakenedId === guestStone));

/* ── §4 ONE SHARED FIGHT ──────────────────────────────── */
console.log("§4 one fight, settled once, read the same by both seats");
await callOk("setStance", { awakenedId: guestStone, stance: "attack", maxEnergy: 100 }, G.token, guestSeat);
const pTile = db.prepare("SELECT tile_id AS tileId FROM field_placements WHERE awakened_id = ?").get(guestStone).tileId;
const pTileRow = db.prepare("SELECT q, r FROM territory_tiles WHERE id = ?").get(pTile);
const frayId = Number(db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
  VALUES (?, ?, 'fray', ?, 30, ?, ?, 3, 1, ?)`).run(H.ownerKey, pTile, now, pTileRow.q, pTileRow.r, now).lastInsertRowid);
await callOk("getTerritory", {}, H.token); // prime the battle watermark
const guestWatermarkBefore = db.prepare("SELECT battle_watermark AS w FROM tender_progress WHERE owner_key = ?").get(G.ownerKey)?.w ?? null;
db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now() - 30000, H.ownerKey);
const guestRead = await callOk("getTerritory", {}, G.token, guestSeat);
const hostRead2 = await callOk("getTerritory", {}, H.token);
const hpOf = (read) => (read.placements ?? []).find(p => p.awakenedId === guestStone)?.hp;
const frayOf = (read) => (read.wanderers ?? []).find(w => w.id === frayId);
ok("§4 the fight moved under the settle (the Fray was struck or fell)",
  frayOf(guestRead) === undefined || frayOf(guestRead).hp < 30, JSON.stringify(frayOf(guestRead)));
const frayDbHp = db.prepare("SELECT hp FROM homeland_wanderers WHERE id = ?").get(frayId)?.hp;
// The Fray's hp is a continuous decay in the homeland's
// reckoning: two reads at neighbouring instants read the SAME
// curve a breath apart (here ~4 ten-thousandths), and the
// host's read matches the ledger's own row to the last digit —
// one state, read twice; not two reckonings.
ok("§4 both seats read the ONE settled state (placement hp identical; the Fray's hp the ledger's own curve)",
  hpOf(guestRead) === hpOf(hostRead2)
  && Math.abs((frayOf(guestRead)?.hp ?? 0) - (frayOf(hostRead2)?.hp ?? 0)) < 0.01
  && (frayOf(hostRead2)?.hp ?? null) === (frayDbHp ?? null),
  `placement hp guest ${hpOf(guestRead)} vs host ${hpOf(hostRead2)}; fray hp guest ${frayOf(guestRead)?.hp} vs host ${frayOf(hostRead2)?.hp} vs db ${frayDbHp}`);
const hostWatermark = db.prepare("SELECT battle_watermark AS w FROM tender_progress WHERE owner_key = ?").get(H.ownerKey)?.w;
ok("§4 the settle wrote the LAND's one watermark (the host's row)",
  typeof hostWatermark === "number" && hostWatermark > Date.now() - 30000);
const guestWatermarkAfter = db.prepare("SELECT battle_watermark AS w FROM tender_progress WHERE owner_key = ?").get(G.ownerKey)?.w ?? null;
ok("§4 no second reckoning was written to the guest's own land rows",
  guestWatermarkAfter === guestWatermarkBefore, `${guestWatermarkBefore} -> ${guestWatermarkAfter}`);

/* ── §5 SEARCH FOR A STARSEED ─────────────────────────── */
console.log("§5 the starseed door deals a fresh table");
const seedEnter = await room("enter", { door: "starseed" }, G.token);
ok("§5 the hunt seats the hunter at a new table", seedEnter.status === 200 && seedEnter.body.door === "instance", JSON.stringify(seedEnter.body).slice(0, 200));
const seedLandKey = `roomland:${seedEnter.body.code}`;
const seedTiles = db.prepare("SELECT COUNT(*) AS n FROM territory_tiles WHERE owner_key = ?").get(seedLandKey).n;
ok("§5 the fresh table stands at 127 tiles (radius 6)", seedTiles === 127, `${seedTiles}`);
const seedRow = db.prepare("SELECT * FROM star_seeds WHERE owner_key = ?").get(seedLandKey);
ok("§5 a starseed stands at the fresh land's heart", !!seedRow && seedRow.level === 1, JSON.stringify(seedRow));
const seedRead = await callOk("getTerritory", {}, G.token, seedEnter.body.seatToken);
ok("§5 the fresh land reads under the homeland's rules (its tiles served)",
  (seedRead.tiles ?? []).length >= 127, `${(seedRead.tiles ?? []).length}`);

/* ── §6 THE DOOR'S WORD ──────────────────────────────── */
console.log("§6 the host's word keeps the door");
const doorSet = await room("door", { privacy: "password", password: "opensesame" }, H.token, hostSeat);
ok("§6 the host sets the word on their homeland's door", doorSet.status === 200 && doorSet.body.privacy === "password", JSON.stringify(doorSet.body));
const T3 = await makeTender("Room Third");
const noWord = await room("enter", { door: "join", room: hostEnter.body.code }, T3.token);
ok("§6 a guest without the word is refused in plain words",
  noWord.status === 403 && /kept by a word/.test(noWord.body.error ?? ""), JSON.stringify(noWord.body));
const wrongWord = await room("enter", { door: "join", room: hostEnter.body.code, password: "wrongword" }, T3.token);
ok("§6 the wrong word is refused", wrongWord.status === 403, JSON.stringify(wrongWord.body));
const rightWord = await room("enter", { door: "join", room: hostEnter.body.code, password: "opensesame" }, T3.token);
ok("§6 the right word seats the guest", rightWord.status === 200, JSON.stringify(rightWord.body).slice(0, 160));
await room("door", { privacy: "public" }, H.token, hostSeat);

/* ── §7 THE STONE CAST IN A ROOM ──────────────────────── */
console.log("§7 Awoken building in the room (the Stone Cast's seat)");
// The kit is the shared hex geometry's own reckoning (the
// hex-build drives read it from the same shipped module):
// hex (0,0) of the host's land holds a square in its kit.
const GEO = await import("../server/dist/buildGeometry.js");
const [cm, cn] = GEO.centerAddress(GEO.axialToPlate(0, 0));
const square = GEO.piecesOfHex(Math.round(cm), Math.round(cn)).find(p => p.kind === "square");
ok("§7 the host land's heart hex holds a square in its kit", !!square, "piecesOfHex(0,0)");
const cast = await call("placeBuildPiece", { kind: "square", verts: square.verts, leadId: guestStone }, G.token, guestSeat);
ok("§7 the guest's fielded Stonewright leads the cast in the room", cast.status === 200, JSON.stringify(cast.raw).slice(0, 300));
const pieceRow = db.prepare("SELECT * FROM build_pieces WHERE owner_key = ? ORDER BY id DESC LIMIT 1").get(H.ownerKey);
ok("§7 the piece rises on the HOST's land rows", !!pieceRow && cast.body.piece?.state === "rising",
  JSON.stringify({ pieceRow: pieceRow?.id, state: cast.body.piece?.state }));

/* ── §8 THE WATCHER ───────────────────────────────────── */
console.log("§8 a watcher reads, and may not act");
const watchEnter = await room("enter", { door: "join", room: hostEnter.body.code, watch: true, name: "Drive Watcher" }, null);
ok("§8 the watcher takes the rail without a Tender session", watchEnter.status === 200 && watchEnter.body.you.watcher === true, JSON.stringify(watchEnter.body).slice(0, 200));
const watchRead = await call("getTerritory", {}, null, watchEnter.body.seatToken);
ok("§8 the watcher reads the land", watchRead.status === 200 && (watchRead.body.tiles ?? []).length >= 127, `${watchRead.status}`);
const watchAct = await call("summonAwoken", { awakenedId: G.kin[1], tileId: guestStandTile }, null, watchEnter.body.seatToken);
ok("§8 the watcher's act is refused in plain words", watchAct.status === 403 && /Watchers may look/.test(watchAct.raw.error ?? ""), JSON.stringify(watchAct.raw).slice(0, 200));

/* ── §9 THE ROOM GUARD ────────────────────────────────── */
console.log("§9 solo-only roads refuse room calls");
const guardWalk = await call("setTenderTile", { tileId: guestStandTile }, G.token, guestSeat);
ok("§9 the solo figure-walk refuses a room call (the seat walks by standing)",
  guardWalk.status === 400 && /belongs to a Tender alone/.test(guardWalk.raw.error ?? ""), JSON.stringify(guardWalk.raw).slice(0, 200));
const guardSeed = await call("claimFirstSeedReward", {}, G.token, guestSeat);
ok("§9 the first-seed bookkeeping refuses a room call", guardSeed.status === 400, JSON.stringify(guardSeed.raw).slice(0, 160));

/* ── §10 A DISCORD-SHAPED ARRIVAL ─────────────────────── */
console.log("§10 the intro door's road binds a Discord name, and the room seats her");
const D = await makeTender("Discord Arrival");
const tableToken = issueTableToken({ id: "disc-room-drive", name: "Discord Arrival" });
const bindRes = await fetch(`${BASE}/api/table/bind-intro`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ token: tableToken, tenderToken: D.token }),
});
const bindBody = await bindRes.json().catch(() => ({}));
ok("§10 bind-intro binds the Discord name to the Tender (both proofs)",
  bindRes.status === 200 && bindBody.bound === true, JSON.stringify(bindBody).slice(0, 200));
const bindingRow = db.prepare("SELECT * FROM table_bindings WHERE discord_id = ?").get("disc-room-drive");
ok("§10 the binding stands in the one ledger", !!bindingRow && bindingRow.tender_id === D.tenderId, JSON.stringify(bindingRow));
const dEnter = await room("enter", { door: "join", room: hostEnter.body.code }, D.token);
ok("§10 the bound Tender seats in the room", dEnter.status === 200, JSON.stringify(dEnter.body).slice(0, 160));

/* ── §11 SOLO SPOT-CHECKS ─────────────────────────────── */
console.log("§11 the solo homeland remains exactly itself");
await callOk("addToParty", { awakenedId: H.kin[0] }, H.token);
const hostSoloSummon = await call("summonAwoken", { awakenedId: H.kin[0], tileId: guestStandTile }, H.token);
ok("§11 the host summons on their own land with no seat at all", hostSoloSummon.status === 200, JSON.stringify(hostSoloSummon.raw).slice(0, 200));
const guestSoloRead = await callOk("getTerritory", {}, G.token);
ok("§11 the guest's solo read is their own land, not the host's room land",
  !(guestSoloRead.placements ?? []).some(p => p.awakenedId === guestStone)
  && (guestSoloRead.tiles ?? []).length !== 127 || (guestSoloRead.placements ?? []).length === 0,
  `${(guestSoloRead.tiles ?? []).length} tiles, ${(guestSoloRead.placements ?? []).length} placements`);

console.log("§12 guests take damage");
const { tenderStandingFeedRateFor } = await import("../server/dist/actions.js");
const { levelForExp } = await import("../server/dist/tenderExp.js");
const guestProg = () => db.prepare(`SELECT * FROM tender_progress WHERE owner_key = ?`).get(G.ownerKey);
const hostProg = () => db.prepare(`SELECT * FROM tender_progress WHERE owner_key = ?`).get(H.ownerKey);
const purseOf = (k) => db.prepare(`SELECT energy FROM tender_resources WHERE owner_key = ?`).get(k).energy;
const state12 = await room("state", undefined, G.token, guestSeat);
const guestSeatView = (state12.body.seats || []).find(s => s.tenderId === G.tenderId);
ok("§12 the party panel serves each seat's own body (guest standing, pool open)",
  !!guestSeatView && guestSeatView.body && guestSeatView.body.maxHp > 0 && guestSeatView.body.hp > 0 && guestSeatView.body.down === false,
  JSON.stringify(guestSeatView?.body));
// The arena: a cursed z=0 tile at ring 5 of the host's
// land, far from every fighter (the §3/§11 companies stand
// at the heart) and from the host's own figure.
const arena = db.prepare(`SELECT id, q, r FROM territory_tiles
  WHERE owner_key = ? AND cursed = 1 AND COALESCE(z,0) = 0 AND MAX(ABS(q), ABS(r), ABS(q + r)) = 5
  ORDER BY id ASC LIMIT 1`).get(H.ownerKey);
ok("§12 a cursed arena tile stands at ring 5 of the host's land", !!arena, arena && `${arena.q},${arena.r}`);
const nbrTiles = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]
  .map(([dq, dr]) => db.prepare(`SELECT id, q, r FROM territory_tiles WHERE owner_key = ? AND q = ? AND r = ? AND COALESCE(z,0) = 0`).get(H.ownerKey, arena.q + dq, arena.r + dr))
  .filter(Boolean);
ok("§12 the arena's six neighbouring tiles stand", nbrTiles.length === 6, String(nbrTiles.length));
const standArena = await room("stand", { tileId: arena.id }, G.token, guestSeat);
ok("§12 the guest takes their stand on cursed ground in the host's room",
  standArena.status === 200, `${standArena.status} ${JSON.stringify(standArena.body).slice(0, 120)}`);

// — the curse's blow at the guest's body: four Frays ring
// the guest (one on their own tile), the body watermark
// fresh (no attrition in this window), the battle
// watermark 1.2 s stale: the only wound this read can
// deal the guest is a bite, and the host's figure — five
// hexes away at the heart — is out of every dark's reach.
const guestStandBefore = guestProg().tender_tile_id;
const hostHpBeforeBite = hostProg().hp;
const guestHpBeforeBite = guestProg().hp;
db.prepare(`UPDATE tender_progress SET curse_watermark = ? WHERE owner_key = ?`).run(Date.now(), G.ownerKey);
const insFray = db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
  VALUES (?, ?, 'fray', ?, 30, ?, ?, 3, 1, ?)`);
insFray.run(H.ownerKey, arena.id, Date.now(), arena.q, arena.r, Date.now() - 10000);
for (const t of nbrTiles.slice(0, 3)) insFray.run(H.ownerKey, t.id, Date.now(), t.q, t.r, Date.now() - 10000);
db.prepare(`UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?`).run(Date.now() - 1200, H.ownerKey);
const biteRead = await call("getTerritory", {}, G.token, guestSeat);
ok("§12 the guest's room read settles", biteRead.status === 200, `${biteRead.status}`);
const guestHpAfterBite = guestProg().hp;
ok("§12 THE CURSE BIT THE GUEST'S FIGURE — the wound is on the guest's own record",
  guestHpAfterBite < guestHpBeforeBite - 0.001, `guest hp ${guestHpBeforeBite} → ${guestHpAfterBite}`);
ok("§12 the host's body took nothing from the arena (out of reach, the bite was the guest's)",
  Math.abs(hostProg().hp - hostHpBeforeBite) < 0.001, `host hp ${hostHpBeforeBite} → ${hostProg().hp}`);
ok("§12 the guest did not fall to the bites (wounds, not a fall)",
  guestProg().fell_count === 0 && guestProg().hp > 0, `hp ${guestProg().hp} fell ${guestProg().fell_count}`);

// — the attrition: five stale seconds on cursed ground at
// ring 5 wither the guest by the homeland's own measure.
const guestHpBeforeRot = guestProg().hp;
db.prepare(`UPDATE tender_progress SET curse_watermark = ? WHERE owner_key = ?`).run(Date.now() - 5000, G.ownerKey);
await callOk("getTerritory", {}, G.token, guestSeat);
const guestHpAfterRot = guestProg().hp;
ok("§12 cursed ground WITHERS the guest's figure (attrition on their own ledger)",
  guestHpAfterRot < guestHpBeforeRot - 0.5 && guestHpAfterRot > 0, `guest hp ${guestHpBeforeRot} → ${guestHpAfterRot}`);

// — the fall: one hit point left and a stale minute of
// curse — the guest falls on THEIR record; their own
// homeland stand is never written with the host's ground.
db.prepare(`UPDATE tender_progress SET hp = 1, curse_watermark = ? WHERE owner_key = ?`).run(Date.now() - 60000, G.ownerKey);
await callOk("getTerritory", {}, G.token, guestSeat);
const fell = guestProg();
ok("§12 THE GUEST FALLS — blackout and fell-count on the guest's own record",
  fell.fell_count === 1 && fell.hp === 0 && Number(fell.down_until) > Date.now(),
  `fell ${fell.fell_count} hp ${fell.hp} down_until ${fell.down_until}`);
ok("§12 the fallen guest's homeland stand record was never written with host ground",
  fell.tender_tile_id === guestStandBefore, `stand ${fell.tender_tile_id} (was ${guestStandBefore})`);
const standWhileDown = await room("stand", { tileId: arena.id }, G.token, guestSeat);
ok("§12 a fallen guest may not walk the room (the homeland's own words refuse)",
  standWhileDown.status === 400 && /fallen/.test(JSON.stringify(standWhileDown.body)),
  `${standWhileDown.status} ${JSON.stringify(standWhileDown.body).slice(0, 120)}`);

// — the wake: blackout spent, the guest wakes half-healed
// and their SEAT stands at the host land's safe hex (the
// bastion anchor: the purified heart here) — their
// homeland record still untouched.
const anchorRow = db.prepare(`SELECT id FROM territory_tiles WHERE owner_key = ? AND q = 0 AND r = 0 AND cursed = 0 ORDER BY id ASC LIMIT 1`).get(H.ownerKey);
db.prepare(`UPDATE tender_progress SET down_until = ? WHERE owner_key = ?`).run(Date.now() - 1000, G.ownerKey);
await callOk("getTerritory", {}, G.token, guestSeat);
const woken = guestProg();
const maxHpGuest = guestSeatView.body.maxHp;
ok("§12 THE GUEST WAKES half-healed on their own record, blackout lifted",
  Math.abs(woken.hp - maxHpGuest / 2) < 0.01 && !woken.down_until,
  `hp ${woken.hp} of max ${maxHpGuest}, down_until ${woken.down_until}`);
ok("§12 the wake wrote nothing to the guest's homeland stand record",
  woken.tender_tile_id === guestStandBefore, `stand ${woken.tender_tile_id}`);
const stateAfterWake = await room("state", undefined, G.token, guestSeat);
const guestSeatWoken = (stateAfterWake.body.seats || []).find(s => s.tenderId === G.tenderId);
ok("§12 the woken guest's SEAT stands at the host land's safe hex",
  guestSeatWoken && guestSeatWoken.tileId === anchorRow.id, `seat tile ${guestSeatWoken?.tileId} anchor ${anchorRow.id}`);

console.log("§13 star seeds draw from any tender standing on them");
const guestRate = tenderStandingFeedRateFor(G.ownerKey, levelForExp(3800), "warden");
ok("§13 the guest's standing feed rate is reckoned from their own key", guestRate > 5, `rate ${guestRate}`);
// — the hosted homeland's seed: the host steps OFF it,
// the guest stands ON it, one stale minute settles.
const hostSeed = db.prepare(`SELECT id, tile_id, fed_energy FROM star_seeds WHERE owner_key = ? ORDER BY id ASC LIMIT 1`).get(H.ownerKey);
const awayTile = db.prepare(`SELECT id FROM territory_tiles WHERE owner_key = ? AND cursed = 1 AND COALESCE(z,0) = 0 AND id != ? ORDER BY id ASC LIMIT 1`).get(H.ownerKey, hostSeed.tile_id);
const hostStepsOff = await room("stand", { tileId: awayTile.id }, H.token, hostSeat);
ok("§13 the host steps off their own seed", hostStepsOff.status === 200, `${hostStepsOff.status}`);
// Every OTHER seat stands at the heart too (the opening
// stand is the seed's hex) — the law feeds from any of
// them, so the measure seats them away first: §6's third
// Tender and §10's Discord arrival step off beside the
// host, leaving the guest the seed's only stander.
const t3StepsOff = await room("stand", { tileId: awayTile.id }, T3.token, rightWord.body.seatToken);
ok("§13 the third Tender steps off the host's seed", t3StepsOff.status === 200, `${t3StepsOff.status}`);
const dStepsOff = await room("stand", { tileId: awayTile.id }, D.token, dEnter.body.seatToken);
ok("§13 the Discord arrival steps off the host's seed", dStepsOff.status === 200, `${dStepsOff.status}`);
const guestOnSeed = await room("stand", { tileId: hostSeed.tile_id }, G.token, guestSeat);
ok("§13 the guest stands on the host's seed", guestOnSeed.status === 200, `${guestOnSeed.status}`);
db.prepare(`UPDATE star_seeds SET feed_anchor_at = ? WHERE id = ?`).run(Date.now() - 60000, hostSeed.id);
const fedBefore = db.prepare(`SELECT fed_energy FROM star_seeds WHERE id = ?`).get(hostSeed.id).fed_energy;
const guestPurseBefore = purseOf(G.ownerKey);
const hostPurseBefore = purseOf(H.ownerKey);
await callOk("getTerritory", {}, G.token, guestSeat);
const fedAfter = db.prepare(`SELECT fed_energy FROM star_seeds WHERE id = ?`).get(hostSeed.id).fed_energy;
const guestPurseAfter = purseOf(G.ownerKey);
const hostPurseAfter = purseOf(H.ownerKey);
const fedDelta = fedAfter - fedBefore;
ok("§13 THE HOST'S SEED DRANK FROM THE GUEST standing on it (a stale minute at the guest's own rate)",
  fedDelta >= Math.floor(guestRate) && fedDelta <= Math.ceil(guestRate) + 1,
  `fed ${fedBefore} → ${fedAfter} (guest rate ${guestRate}/min)`);
ok("§13 the draught came out of the GUEST's purse, point for point",
  guestPurseBefore - guestPurseAfter === fedDelta, `guest purse ${guestPurseBefore} → ${guestPurseAfter}, fed delta ${fedDelta}`);
ok("§13 the host's purse was not touched by the guest's feeding",
  hostPurseAfter === hostPurseBefore, `host purse ${hostPurseBefore} → ${hostPurseAfter}`);
const creditRow = db.prepare(`SELECT credit FROM star_seed_feed_credits WHERE seed_id = ? AND feeder_key = ?`).get(hostSeed.id, G.ownerKey);
ok("§13 the guest's fractional pace is banked on the seed's own ledger row", !!creditRow, JSON.stringify(creditRow));

// — the fresh table's heart seed: TWO seats stand on it
// (the stand machinery seats several figures on one hex)
// and it drinks from both at once. (D is §10's Discord
// arrival; joining this room leaves their host-room seat,
// which no later section needs.)
const seedEnterD = await room("enter", { door: "join", room: seedEnter.body.code }, D.token);
ok("§13 a second Tender takes a seat at the instance table", seedEnterD.status === 200, `${seedEnterD.status} ${JSON.stringify(seedEnterD.body).slice(0, 140)}`);
const instSeatD = seedEnterD.body.seatToken;
const instSeed = db.prepare(`SELECT id, tile_id, fed_energy FROM star_seeds WHERE owner_key = ? ORDER BY id ASC LIMIT 1`).get(seedLandKey);
const stateInst = await room("state", undefined, G.token, seedEnter.body.seatToken);
const gInstSeat = (stateInst.body.seats || []).find(s => s.tenderId === G.tenderId);
const dInstSeat = (stateInst.body.seats || []).find(s => s.tenderId === D.tenderId);
ok("§13 both instance seats stand on the heart seed's hex (several standers, one hex)",
  gInstSeat && dInstSeat && gInstSeat.tileId === instSeed.tile_id && dInstSeat.tileId === instSeed.tile_id,
  `G ${gInstSeat?.tileId} D ${dInstSeat?.tileId} seed tile ${instSeed.tile_id}`);
const dRate = tenderStandingFeedRateFor(D.ownerKey, levelForExp(3800), "warden");
db.prepare(`UPDATE star_seeds SET feed_anchor_at = ? WHERE id = ?`).run(Date.now() - 60000, instSeed.id);
const instFedBefore = db.prepare(`SELECT fed_energy FROM star_seeds WHERE id = ?`).get(instSeed.id).fed_energy;
const gPurseI0 = purseOf(G.ownerKey);
const dPurseI0 = purseOf(D.ownerKey);
const instRead = await call("getTerritory", {}, D.token, instSeatD);
ok("§13 the instance land reads for its second seat", instRead.status === 200, `${instRead.status}`);
const instFedAfter = db.prepare(`SELECT fed_energy FROM star_seeds WHERE id = ?`).get(instSeed.id).fed_energy;
const gPurseI1 = purseOf(G.ownerKey);
const dPurseI1 = purseOf(D.ownerKey);
const instFedDelta = instFedAfter - instFedBefore;
ok("§13 THE TABLE'S HEART SEED DRANK FROM BOTH SEATS standing on it",
  instFedDelta >= Math.floor(guestRate) + Math.floor(dRate) && instFedDelta <= Math.ceil(guestRate) + Math.ceil(dRate) + 2,
  `fed ${instFedBefore} → ${instFedAfter} (rates G ${guestRate} + D ${dRate} per minute)`);
ok("§13 each seat's purse paid its own draught (the two deltas sum to the seed's gain)",
  (gPurseI0 - gPurseI1) + (dPurseI0 - dPurseI1) === instFedDelta && (gPurseI0 - gPurseI1) >= Math.floor(guestRate) && (dPurseI0 - dPurseI1) >= Math.floor(dRate),
  `G paid ${gPurseI0 - gPurseI1}, D paid ${dPurseI0 - dPurseI1}, seed gained ${instFedDelta}`);

// — a seat's body settles on an instance land too: the
// guest steps onto instance curse and withers there.
const instCursed = db.prepare(`SELECT id FROM territory_tiles WHERE owner_key = ? AND cursed = 1 ORDER BY id ASC LIMIT 1`).get(seedLandKey);
const gOnCursed = await room("stand", { tileId: instCursed.id }, G.token, seedEnter.body.seatToken);
ok("§13 the guest steps onto the instance land's curse", gOnCursed.status === 200, `${gOnCursed.status}`);
const gHpI0 = guestProg().hp;
db.prepare(`UPDATE tender_progress SET curse_watermark = ? WHERE owner_key = ?`).run(Date.now() - 30000, G.ownerKey);
await callOk("getTerritory", {}, D.token, instSeatD);
ok("§13 the guest's figure WITHERS on instance curse under another seat's read (bodies settle on instance lands)",
  guestProg().hp < gHpI0 - 0.5, `guest hp ${gHpI0} → ${guestProg().hp}`);

console.log(`\nROOM SEAT DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
