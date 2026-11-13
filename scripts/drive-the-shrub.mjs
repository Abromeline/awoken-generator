// drive-the-shrub — THE SHRUB (Nigel, 2026-11-10), the
// fifth of the six commissioned works, proven on the real
// homeland at the server's own doors:
//   §G THE GATE + THE REACH AT THE DOOR: an Awoken holding
//      less than 3 Root in the sum of its parts is refused
//      in plain words and sprouts nothing; a qualifier
//      standing more than two tiles from the ground is
//      refused in plain words; within two tiles the
//      channel opens.
//   §C THE CHANNEL: growth advances only while a channel
//      runs (3 energy a second, 180 channel-seconds to
//      full); stopping freezes it; resuming continues from
//      exactly where it stopped; at full growth the
//      channel releases itself and a fresh channel on the
//      full-grown shrub is refused.
//   §R THE REACH, HELD: a channeler who steps beyond two
//      tiles pauses the growth and the charge — the
//      channel stands — and stepping back resumes it.
//   §A PRESENCE: away time grows nothing and charges
//      nothing; the channel stands and resumes on return.
//   §T CURSED GROUND: the shrub grows in a cursed tile and
//      WILTS there at 0.3 health a minute; wilted to
//      nothing, it dies and is gone.
//   §H WATERING: a Tide hand with no dark in reach waters
//      the shrub — it stands WATERED and sprouts BRAMBLE
//      NODES of its own; watered, it REGENS at 0.6 health
//      a minute; and a dark standing on one of its nodes
//      is thorned by the standing bramble behaviour.
//   §K COLLISION: an advancing Fray is STOPPED by the
//      shrub's body, hacks it at the walls' measure while
//      held, fells it at 0 health — and then walks on.
// Run after `npm run build`:
//   node scripts/drive-the-shrub.mjs
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-shrub-"));
process.env.PORT = "39996";
process.env.WORKSHOP_PASSWORD = "shrub-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39996";
const PW = "shrub-drive-password";
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
  return { status: res.status, body: data?.data ?? data, raw: data };
}
async function callOk(action, args, token) {
  const r = await call(action, args, token);
  if (r.status !== 200) throw new Error(`${action} -> ${r.status}: ${JSON.stringify(r.raw).slice(0, 300)}`);
  return r.body;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
const axial = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

/* ══ FIXTURES (drive-battle's own shapes) ═══════════════ */
async function claim(name) {
  const c = await callOk("claimTender", { password: PW, tenderName: name });
  const id = db.prepare("SELECT id FROM tenders WHERE code = ?").get(c.tender.code).id;
  const ownerKey = `tender:${id}`;
  const now = Date.now();
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 3, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800, class_key = 'warden', hp = 100").run(ownerKey, now);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(ownerKey, now);
  return { token: c.token, ownerKey };
}
function seedTile(ownerKey, q, r, cursed, element = "root") {
  return Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(ownerKey, q, r, element, cursed, Date.now()).lastInsertRowid);
}
function seedAwokin(ownerKey, tenderName, name, spec) {
  const nowT = Date.now();
  const parts = [];
  ["body", "arms", "head"].forEach((cat, i) => {
    const s = spec[i];
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)").run(`${name} ${cat}`, cat, s.power, s.toughness, s.element, `shrub/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: s.power, toughness: s.toughness, element: s.element });
  });
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)").run(name, name, `shrub/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
function placeAwokin(ownerKey, awakenedId, tileId, q, r, opts = {}) {
  const info = db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`).run(
    ownerKey, awakenedId, tileId, Date.now(), Date.now(),
    opts.stance ?? "defense", opts.hp ?? 99, q, r,
    opts.shield ?? null, opts.shield ?? null, opts.ordered ? 1 : 0);
  return Number(info.lastInsertRowid);
}
function seedDark(ownerKey, tileId, kind, q, r, opts = {}) {
  const info = db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    ownerKey, tileId, kind, Date.now(), opts.hp ?? 3, q, r, opts.power ?? 1, opts.lvl ?? 1, 0);
  return Number(info.lastInsertRowid);
}
const P2 = (element) => ({ element, power: 2, toughness: 2 });
const darkRow = (id) => db.prepare("SELECT * FROM homeland_wanderers WHERE id = ?").get(id);
const shrubRows = (ownerKey) => db.prepare("SELECT * FROM shrubs WHERE owner_key = ?").all(ownerKey);
async function advance(ownerKey, token, ms) {
  db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now() - ms, ownerKey);
  return callOk("getTerritory", {}, token);
}
async function prime(ownerKey, token) { await callOk("getTerritory", {}, token); }

/* Per-claim helpers: the purse, the presence stamp, the
 * served land, and the channel time-travel the lazy
 * settles are proven with (the Moon Shroom drive's own). */
function harness(G) {
  const setEnergy = (n) => db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = excluded.energy, updated_at = excluded.updated_at").run(G.ownerKey, n, Date.now());
  const purse = () => db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(G.ownerKey).energy;
  const stampPresence = () => db.prepare("UPDATE tender_resources SET last_seen_at = ? WHERE owner_key = ?").run(Date.now(), G.ownerKey);
  let land = null;
  const readLand = async () => { stampPresence(); land = await callOk("getTerritory", {}, G.token); return land; };
  const shrubOn = (tileId) => (land?.shrubs ?? []).find(s => s.tileId === tileId);
  const channelSeconds = async (awIds, seconds) => {
    const back = Date.now() - seconds * 1000;
    for (const id of awIds) db.prepare("UPDATE shrub_channels SET settled_at = ? WHERE awakened_id = ?").run(back, id);
    return readLand();
  };
  return { setEnergy, purse, stampPresence, readLand, shrubOn, channelSeconds, get land() { return land; } };
}

/* ══ §G + §C + §R + §A — THE CHANNEL, ITS GATE AND REACH ═ */
console.log("§G the gate and the reach at the door");
const A = await claim("Shrub Keeper");
const hA = harness(A);
const tA = {};
for (const q of [-1, 0, 1, 2, 3]) tA[q] = seedTile(A.ownerKey, q, 0, 0);
const QA = seedAwokin(A.ownerKey, "Shrub Keeper", "Deep Root", [P2("root"), P2("root"), P2("root")]);   // Root 3 — qualifies
const QB = seedAwokin(A.ownerKey, "Shrub Keeper", "Shallow Root", [P2("root"), P2("root"), P2("tide")]); // Root 2 — refused
placeAwokin(A.ownerKey, QA, tA[0], 0, 0);
placeAwokin(A.ownerKey, QB, tA[0], 0, 0);
{
  const refused = await call("startShrubChannel", { awakenedId: QB, tileId: tA[1] }, A.token);
  ok("§G an Awoken holding only 2 Root in its parts is refused", refused.status >= 400, `status ${refused.status}`);
  ok("§G the refusal speaks the gate in plain words",
    JSON.stringify(refused.raw).includes("at least 3 Root"), JSON.stringify(refused.raw).slice(0, 200));
  await hA.readLand();
  ok("§G the refused channel sprouted nothing", (hA.land.shrubs ?? []).length === 0, `${(hA.land.shrubs ?? []).length} shrubs`);
  const tooFar = await call("startShrubChannel", { awakenedId: QA, tileId: tA[3] }, A.token);
  ok("§R a channel begun three tiles away is refused at the door", tooFar.status >= 400, `status ${tooFar.status}`);
  ok("§R the refusal speaks the reach in plain words",
    JSON.stringify(tooFar.raw).includes("within two tiles"), JSON.stringify(tooFar.raw).slice(0, 200));
  const started = await callOk("startShrubChannel", { awakenedId: QA, tileId: tA[1] }, A.token);
  ok("§G a qualifier within two tiles opens the channel", started.ok === true && started.shrub.tileId === tA[1]);
  await hA.readLand();
  const s = hA.shrubOn(tA[1]);
  ok("§G the shrub is served on its tile, ungrown, at its full 15 health, its channeler named",
    !!s && s.growth === 0 && s.hp === 15 && s.channelers.length === 1 && s.channelers[0] === QA, JSON.stringify(s));
}

console.log("§C the channel — growth only while it runs, three minutes to full");
{
  hA.setEnergy(1000);
  await hA.channelSeconds([QA], 90);
  const g1 = hA.shrubOn(tA[1])?.growth ?? -1;
  ok("§C 90 channelled seconds grow the shrub halfway (90 of the ruled 180)",
    Math.abs(g1 - 0.5) < 0.01, `growth ${g1}`);
  ok("§C the purse paid the standing channel price — 3 a second, 270 for the span",
    hA.purse() <= 740 && hA.purse() >= 720, `purse ${hA.purse()}`);
  await callOk("stopShrubChannel", { awakenedId: QA }, A.token);
  await hA.readLand();
  ok("§C the ended channel names no channeler", (hA.shrubOn(tA[1])?.channelers ?? []).length === 0);
  await sleep(1200);
  await hA.readLand();
  ok("§C with no channel running, time alone grows nothing",
    hA.shrubOn(tA[1])?.growth === g1, `growth ${hA.shrubOn(tA[1])?.growth} vs ${g1}`);
  const resumed = await callOk("startShrubChannel", { awakenedId: QA, tileId: tA[1] }, A.token);
  ok("§C a later channel joins the SAME shrub", resumed.shrub.id === hA.shrubOn(tA[1])?.id, `id ${resumed.shrub.id}`);
  hA.setEnergy(1000);
  await hA.channelSeconds([QA], 90);
  const full = hA.shrubOn(tA[1]);
  ok("§C the growth is cumulative — the second 90 seconds top it out at full growth",
    !!full && full.growth === 1 && full.fullGrown === true, JSON.stringify(full));
  ok("§C at full growth the channel is released by itself", (full?.channelers ?? []).length === 0);
  const onFull = await call("startShrubChannel", { awakenedId: QA, tileId: tA[1] }, A.token);
  ok("§C a fresh channel on a full-grown shrub is refused", onFull.status >= 400, `status ${onFull.status}`);
  ok("§C the refusal speaks plainly", JSON.stringify(onFull.raw).includes("full-grown"), JSON.stringify(onFull.raw).slice(0, 200));
}

console.log("§R the reach, held — stepping away pauses, returning resumes");
{
  await callOk("startShrubChannel", { awakenedId: QA, tileId: tA[2] }, A.token);
  hA.setEnergy(1000);
  await hA.channelSeconds([QA], 30);
  const gR = hA.shrubOn(tA[2])?.growth ?? -1;
  ok("§R 30 in-reach seconds grow the second shrub by 30/180", Math.abs(gR - 30 / 180) < 0.01, `growth ${gR}`);
  // The channeler steps to the far tile — three tiles off.
  db.prepare("UPDATE field_placements SET tile_id = ?, pos_q = -1, pos_r = 0 WHERE awakened_id = ?").run(tA[-1], QA);
  hA.setEnergy(1000);
  await hA.channelSeconds([QA], 60);
  ok("§R 60 out-of-reach seconds grow NOTHING", Math.abs((hA.shrubOn(tA[2])?.growth ?? -1) - gR) < 0.001,
    `growth ${hA.shrubOn(tA[2])?.growth} vs ${gR}`);
  ok("§R out-of-reach time charges nothing", hA.purse() <= 1005 && hA.purse() >= 990, `purse ${hA.purse()}`);
  ok("§R the channel itself stands through the absence of reach",
    (hA.shrubOn(tA[2])?.channelers ?? []).includes(QA));
  db.prepare("UPDATE field_placements SET tile_id = ?, pos_q = 0, pos_r = 0 WHERE awakened_id = ?").run(tA[0], QA);
  await hA.channelSeconds([QA], 30);
  ok("§R stepping back in reach resumes the same channel",
    Math.abs((hA.shrubOn(tA[2])?.growth ?? -1) - 60 / 180) < 0.01, `growth ${hA.shrubOn(tA[2])?.growth}`);
}

console.log("§A presence — channeling works only while online");
{
  db.prepare("UPDATE shrub_channels SET settled_at = ? WHERE awakened_id = ?").run(Date.now() - 240 * 1000, QA);
  db.prepare("UPDATE tender_resources SET last_seen_at = ? WHERE owner_key = ?").run(Date.now() - 10 * 60000, A.ownerKey);
  const awayLand = await callOk("getTerritory", {}, A.token); // no presence stamp — the Tender is away
  const awayShrub = (awayLand.shrubs ?? []).find(s => s.tileId === tA[2]);
  ok("§A 240 away seconds grow nothing", Math.abs((awayShrub?.growth ?? -1) - 60 / 180) < 0.001, `growth ${awayShrub?.growth}`);
  ok("§A the channel stands through the absence", (awayShrub?.channelers ?? []).includes(QA));
  await hA.channelSeconds([QA], 60); // the helper's stamp is the return
  ok("§A on return, the same channel resumes growing",
    Math.abs((hA.shrubOn(tA[2])?.growth ?? -1) - 120 / 180) < 0.01, `growth ${hA.shrubOn(tA[2])?.growth}`);
  await callOk("stopShrubChannel", { awakenedId: QA }, A.token);
}

/* ══ §T CURSED GROUND — IT GROWS THERE, AND WILTS THERE ══ */
console.log("§T cursed ground — growth in the curse, the wilt at its ruled rate");
const B = await claim("Shrub Warder");
const hB = harness(B);
const tB0 = seedTile(B.ownerKey, 0, 0, 0);
const tBC = seedTile(B.ownerKey, 1, 0, 1, "fire");
const QB1 = seedAwokin(B.ownerKey, "Shrub Warder", "Curse Root", [P2("root"), P2("root"), P2("root")]);
placeAwokin(B.ownerKey, QB1, tB0, 0, 0);
{
  const started = await callOk("startShrubChannel", { awakenedId: QB1, tileId: tBC }, B.token);
  ok("§T the channel opens on CURSED ground — the shrub may grow there", started.ok === true && started.shrub.tileId === tBC);
  hB.setEnergy(2000);
  await hB.channelSeconds([QB1], 60);
  const s = hB.shrubOn(tBC);
  ok("§T it grows in the curse — 60 channelled seconds stand at 60/180",
    !!s && Math.abs(s.growth - 60 / 180) < 0.01, JSON.stringify(s));
  await callOk("stopShrubChannel", { awakenedId: QB1 }, B.token);
  // Walk the shrub's own clock back ten minutes: the curse
  // has been chewing it, unwatched, the whole span.
  db.prepare("UPDATE shrubs SET settled_at = ? WHERE owner_key = ?").run(Date.now() - 10 * 60000, B.ownerKey);
  await hB.readLand();
  const wilted = hB.shrubOn(tBC);
  ok("§T ten cursed minutes wilt it by exactly the ruled rate — 15 − 0.3×10 = 12",
    !!wilted && Math.abs(wilted.hp - 12) < 0.15, `hp ${wilted?.hp}`);
  db.prepare("UPDATE shrubs SET settled_at = ? WHERE owner_key = ?").run(Date.now() - 100 * 60000, B.ownerKey);
  await hB.readLand();
  ok("§T wilted past nothing, the shrub dies and is gone from the serving",
    !hB.shrubOn(tBC), JSON.stringify(hB.land.shrubs));
  ok("§T its record leaves the land with it", shrubRows(B.ownerKey).length === 0, `${shrubRows(B.ownerKey).length} rows`);
}

/* ══ §H WATERING — THE WET FEEDS IT, NODES SPROUT, IT DRINKS ═ */
console.log("§H watering — the Wet act waters the shrub");
const C = await claim("Shrub Tender");
const tC0 = seedTile(C.ownerKey, 0, 0, 0);
const tC1 = seedTile(C.ownerKey, 1, 0, 0);
const tC2 = seedTile(C.ownerKey, 2, 0, 0);
const tideHand = seedAwokin(C.ownerKey, "Shrub Tender", "Tide Hand", [P2("tide"), P2("tide"), P2("tide")]);
placeAwokin(C.ownerKey, tideHand, tC1, 1, 0, { hp: 99 });
{
  const nowC = Date.now();
  db.prepare("INSERT INTO shrubs (owner_key, tile_id, growth, hp, water_bank, watered_until, nodes, created_at, updated_at, settled_at) VALUES (?, ?, 1, 15, 0, 0, '[]', ?, ?, ?)")
    .run(C.ownerKey, tC1, nowC, nowC, nowC);
  await prime(C.ownerKey, C.token);
  // No dark stands anywhere: her answers can only tend.
  const st = await advance(C.ownerKey, C.token, 60000);
  const served = (st.shrubs ?? []).find(s => s.tileId === tC1);
  const row = shrubRows(C.ownerKey)[0];
  const nodes = JSON.parse(row?.nodes ?? "[]");
  ok("§H her watering set the shrub WATERED (its watering runs past this moment)",
    !!row && row.watered_until > Date.now() - 5000, `watered_until ${row?.watered_until} vs now ${Date.now()}`);
  ok("§H the served shrub reads watered, with living bramble nodes of its own",
    !!served && served.watered === true && served.nodes >= 1, JSON.stringify(served));
  // The first node is the watering's own sprout at the
  // shrub's fringe; later strikes tend the shrub's motes
  // through the standing watering, and the creep chains
  // from them at the thicket's spread step — one list, the
  // standing behaviour whole.
  ok("§H the nodes stand in the shrub's own list — the first at its fringe, the creep chained from it",
    nodes.filter(n => n.mote && n.hp > 0).length >= 1 &&
    nodes.every(n => n.mote && n.hp === 15 && n.maxHp === 15) &&
    nodes.some(n => Math.abs(Math.hypot(n.q - 1, n.r - 0) - 0.5) < 0.02),
    JSON.stringify(nodes).slice(0, 600));
  // THE DRINK: wounded to 10, watered for the span, five
  // minutes pass on its own clock — 10 + 0.6×5 = 13.
  db.prepare("UPDATE shrubs SET hp = 10, settled_at = ?, watered_until = ? WHERE owner_key = ?")
    .run(Date.now() - 5 * 60000, Date.now() + 10 * 60000, C.ownerKey);
  const st2 = await callOk("getTerritory", {}, C.token);
  const served2 = (st2.shrubs ?? []).find(s => s.tileId === tC1);
  ok("§H watered, it regens at the ruled rate — 10 + 0.6×5 = 13 over five minutes",
    !!served2 && Math.abs(served2.hp - 13) < 0.15, `hp ${served2?.hp}`);
  // THE THORNS: a dark stands ON one of her nodes; the
  // Tide hand is held silent — only the thicket can bite.
  // The bait's tile is keyed CURSED (its position stands on
  // the node): on pure ground the LIGHT TAKES ITS OWN harm
  // from any dark standing there — standing law that would
  // drown the thorn's single point in this window, as the
  // battle drive's own bait scene keys its tile the same
  // way.
  const tCX = seedTile(C.ownerKey, 3, 0, 1, "fire");
  const node = JSON.parse(shrubRows(C.ownerKey)[0].nodes).find(n => n.mote && n.hp > 0);
  const plRow = db.prepare("SELECT id FROM field_placements WHERE awakened_id = ?").get(tideHand);
  db.prepare("UPDATE field_placements SET battle_next_at = ? WHERE id = ?").run(Date.now() + 600000, plRow.id);
  const bait = seedDark(C.ownerKey, tCX, "fray", node.q, node.r, { hp: 200 });
  db.prepare("UPDATE homeland_wanderers SET pos_q = ?, pos_r = ? WHERE id = ?").run(node.q, node.r, bait);
  await advance(C.ownerKey, C.token, 3000);
  const baitRow = darkRow(bait);
  const baitHp = baitRow?.hp ?? 0;
  console.log(`  bait: hp ${baitHp}, wet_until ${baitRow?.wet_until}, pos (${baitRow?.pos_q}, ${baitRow?.pos_r}); fighter nextAt ${db.prepare("SELECT battle_next_at FROM field_placements WHERE id = ?").get(plRow.id)?.battle_next_at} vs now ${Date.now()}`);
  ok("§H a dark standing on the shrub's node is THORNED by the standing bramble behaviour",
    baitHp < 200 && baitHp >= 195, `hp ${baitHp}`);
}

/* ══ §K COLLISION — IT BARS THE DARK, IS HACKED, FALLS, OPENS ═ */
console.log("§K collision — the shrub bars the advancing dark");
const D = await claim("Shrub Warden");
const tD = {};
for (const q of [0, 1, 2, 3, 4]) tD[q] = seedTile(D.ownerKey, q, 0, 0);
const goal = seedAwokin(D.ownerKey, "Shrub Warden", "Goalpost", [P2("root"), P2("root"), P2("root")]);
const goalPl = placeAwokin(D.ownerKey, goal, tD[0], 0, 0, { hp: 999 });
{
  const nowD = Date.now();
  db.prepare("INSERT INTO shrubs (owner_key, tile_id, growth, hp, water_bank, watered_until, nodes, created_at, updated_at, settled_at) VALUES (?, ?, 1, 15, 0, 0, '[]', ?, ?, ?)")
    .run(D.ownerKey, tD[2], nowD, nowD, nowD);
  // The goalpost never answers — the Fray's road is measured
  // against the shrub alone.
  db.prepare("UPDATE field_placements SET battle_next_at = ? WHERE id = ?").run(Date.now() + 600000, goalPl);
  const fray = seedDark(D.ownerKey, tD[4], "fray", 4, 0, { hp: 500, power: 1 });
  await prime(D.ownerKey, D.token);
  await advance(D.ownerKey, D.token, 12000);
  const d1 = darkRow(fray);
  const dist1 = axial({ q: d1.pos_q, r: d1.pos_r }, { q: 2, r: 0 });
  console.log(`  fray after 12s: (${d1.pos_q.toFixed(2)}, ${d1.pos_r.toFixed(2)}) — ${dist1.toFixed(2)} from the shrub`);
  ok("§K the advancing Fray is STOPPED by the shrub's body (held outside its heart)",
    dist1 > 0.55 && dist1 < 1.1, `distance ${dist1}`);
  const rowMid = shrubRows(D.ownerKey)[0];
  ok("§K the shrub still stands at its post", !!rowMid && rowMid.hp > 0, `hp ${rowMid?.hp}`);
  // The dark's strike cadence runs on the real clock (the
  // watermark walks only its feet): walk its last strike
  // back so the blow is due — one hack lands in the settle,
  // as one hack lands per cadence in the living game.
  db.prepare("UPDATE homeland_wanderers SET last_strike_at = ? WHERE id = ?").run(Date.now() - 60000, fray);
  await advance(D.ownerKey, D.token, 10000);
  const rowHacked = shrubRows(D.ownerKey)[0];
  ok("§K held at its face, the dark HACKS the shrub (its health falls at the walls' measure)",
    !!rowHacked && rowHacked.hp < 15 && rowHacked.hp > 0, `hp ${rowHacked?.hp}`);
  db.prepare("UPDATE shrubs SET hp = 1 WHERE owner_key = ?").run(D.ownerKey);
  db.prepare("UPDATE homeland_wanderers SET last_strike_at = ? WHERE id = ?").run(Date.now() - 60000, fray);
  await advance(D.ownerKey, D.token, 10000);
  ok("§K hacked to nothing, the shrub dies and is gone", shrubRows(D.ownerKey).length === 0,
    `${shrubRows(D.ownerKey).length} rows`);
  await advance(D.ownerKey, D.token, 30000);
  const d2 = darkRow(fray);
  ok("§K with the shrub fallen, the road opens — the Fray walks on to the goalpost's teeth",
    !!d2 && d2.pos_q < 1.6, `pos_q ${d2?.pos_q}`);
}

console.log(`\nTHE SHRUB DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
