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

console.log(`\nROOM SEAT DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
