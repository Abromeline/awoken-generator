// drive-moon-shroom — THE MOON SHROOM (Nigel, 2026-11-10),
// the third of the six commissioned works, proven on the real
// homeland at the server's own doors:
//   §G THE GATE: an Awoken missing any one of Root 1 / Tide 1
//      / Air 1 in the sum of its parts is refused in plain
//      words and sprouts nothing; a qualifier's channel opens.
//   §C THE CHANNEL: growth advances ONLY while a channel runs
//      (3 energy a second from the purse, read off the purse
//      itself); stopping the channel freezes the growth; a
//      later channel resumes from exactly where it stopped —
//      the growth is cumulative across channels and sessions.
//   §A PRESENCE: while the Tender is away (presence stale),
//      channelled time grows nothing and charges nothing, and
//      the channel itself stands — it resumes on return.
//   §T TWO CHANNELERS: two Awoken channelling one shroom grow
//      it at the sum of their channels — twice one channel's
//      growth over the same span.
//   §M MAX GROWTH: at full growth (twice a bastion's height)
//      the channel is RELEASED by itself, and a fresh channel
//      on the full-grown shroom is refused.
//   §R THE REGEN GIFT, READ FROM THE SERVER: with no shroom
//      standing, 12 minutes of presence regens 3 energy
//      (the standing 4-minute interval); with three shrooms
//      standing it regens 12 (each shroom a minute off the
//      interval, to the one-minute floor).
//   §H THE HARVEST: cutting a shroom pays its growth's share
//      of the full-growth yield into the cutter's purse, ends
//      its channels (the freed Awoken may channel again at
//      once), and takes the shroom off the land.
// Run after `npm run build`:
//   node scripts/drive-moon-shroom.mjs
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-moonshroom-"));
process.env.PORT = "39991";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39991";
const PW = "moonshroom-drive-password";
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
  return { status: res.status, body: data?.data ?? data, raw: data };
}
async function callOk(action, args, token) {
  const r = await call(action, args, token);
  if (r.status !== 200) throw new Error(`${action} -> ${r.status}: ${JSON.stringify(r.raw).slice(0, 300)}`);
  return r.body;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
const now0 = Date.now();

/* ══ THE WORLD: a fresh Tender and their sown land ══════════ */
const claim = await callOk("claimTender", { password: PW, tenderName: "Moon Tender" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
const token = claim.token;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 3, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', total_exp = 3800, hp = 100").run(ownerKey, now0);
await callOk("ensureFirstSeed", {}, token);
let land = await callOk("getTerritory", {}, token);
ok("the sown land stands (tiles served)", land.tiles.length >= 19, `${land.tiles.length} tiles`);
const tileAt = (q, r) => land.tiles.find(t => t.q === q && t.r === r);

/* Fixture hands on the purse and the presence stamp. The
 * resources row is created lazily by the server's own reads,
 * so every fixture write here is an upsert. */
const setEnergy = (n) => db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = excluded.energy, updated_at = excluded.updated_at").run(ownerKey, n, Date.now());
const purse = () => db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(ownerKey).energy;
const stampPresence = () => db.prepare("UPDATE tender_resources SET last_seen_at = ? WHERE owner_key = ?").run(Date.now(), ownerKey);
const shroomsServed = () => land.moonShrooms ?? [];
const shroomOn = (tileId) => shroomsServed().find(s => s.tileId === tileId);
async function readLand() { stampPresence(); land = await callOk("getTerritory", {}, token); return land; }
/** Walk a channel's clock back `seconds` and let the settle
 *  at the next read reckon them — the same time-travel the
 *  other drives walk with their lazy settles. */
async function channelSeconds(awIds, seconds) {
  const back = Date.now() - seconds * 1000;
  for (const id of awIds) db.prepare("UPDATE moon_shroom_channels SET settled_at = ? WHERE awakened_id = ?").run(back, id);
  return readLand();
}

/* ══ §R (baseline) THE REGEN WITH NO SHROOM STANDING ═══════ */
console.log("§R the regen gift — baseline first");
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at, last_seen_at) VALUES (?, 0, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 0, updated_at = excluded.updated_at, last_seen_at = excluded.last_seen_at")
  .run(ownerKey, Date.now() - 12 * 60000, Date.now());
const baseEnergy = await callOk("getEnergy", {}, token);
ok("§R no shroom standing: 12 present minutes regen 3 energy (the 4-minute interval)",
  baseEnergy.energy === 3, `energy ${baseEnergy.energy}, max ${baseEnergy.maxEnergy}`);

/* ══ THE COMPANY: two qualifiers and one who lacks Air ═════ */
function seedAwoken(name, partEls) {
  const insA = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 2, 2, ?, ?, 'image/png', ?)");
  const cats = ["body", "arms", "head"];
  const parts = partEls.map((el, i) => {
    const id = Number(insA.run(`${name} ${cats[i]}`, cats[i], el, `moon/${name}-${cats[i]}.png`, Date.now()).lastInsertRowid);
    return { source_id: `db:${id}`, name: `${name} ${cats[i]}`, category: cats[i], rarity: "common", power: 2, toughness: 2, element: el };
  });
  const composition = JSON.stringify(parts);
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', 'Moon Tender', ?, ?)")
    .run(name, name, `moon/${name}.png`, composition, ownerKey, Date.now()).lastInsertRowid);
}
const field = (awId, tile) => db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
  VALUES (?, ?, ?, ?, ?, 'defense', 0, 99, ?, ?, NULL, NULL, 0)`).run(ownerKey, awId, tile.id, Date.now(), Date.now(), tile.q, tile.r);
const QA = seedAwoken("Moonchanter A", ["root", "tide", "sky"]);   // Root 1 · Tide 1 · Air 1 — qualifies
const QB = seedAwoken("Moonchanter B", ["root", "tide", "stone"]); // no Air — refused
const QC = seedAwoken("Moonchanter C", ["sky", "root", "tide"]);   // qualifies
const T1 = tileAt(0, 0), T2 = tileAt(1, 0), T3 = tileAt(0, 1);
field(QA, T1); field(QB, T2); field(QC, T3);
await readLand();

/* ══ §G THE GATE ════════════════════════════════════════════ */
console.log("§G the gate — the mix met in full, or nothing");
const refused = await call("startMoonShroomChannel", { awakenedId: QB, tileId: T2.id }, token);
ok("§G an Awoken missing Air (Root 1 · Tide 1 · Rock 1) is refused", refused.status >= 400, `status ${refused.status}`);
ok("§G the refusal speaks the gate in plain words",
  JSON.stringify(refused.raw).includes("1 Root, 1 Tide and 1 Air"), JSON.stringify(refused.raw).slice(0, 200));
await readLand();
ok("§G the refused channel sprouted nothing", shroomsServed().length === 0, `${shroomsServed().length} shrooms`);
const started = await callOk("startMoonShroomChannel", { awakenedId: QA, tileId: T1.id }, token);
ok("§G a qualifier's channel opens", started.ok === true && started.shroom.tileId === T1.id);
ok("§G the sprouted variant is one of Nigel's three artworks", [1, 2, 3].includes(started.shroom.variant), `variant ${started.shroom.variant}`);
await readLand();
const s1 = shroomOn(T1.id);
ok("§G the shroom is served on its tile with its channeler named",
  !!s1 && s1.channelers.length === 1 && s1.channelers[0] === QA && s1.growth === 0,
  JSON.stringify(s1));

/* ══ §C THE CHANNEL: GROWTH ONLY WHILE IT RUNS ══════════════ */
console.log("§C the channel — growth only while it runs, cumulative");
setEnergy(1000);
await channelSeconds([QA], 240);
const g1 = shroomOn(T1.id)?.growth ?? -1;
ok("§C 240 channelled seconds grow the shroom by 240/172800 of its full height",
  Math.abs(g1 - 240 / 172800) < 0.0002, `growth ${g1}`);
ok("§C the purse paid the standing channel price — 3 a second, 720 for the span",
  purse() <= 280 && purse() >= 275, `purse ${purse()}`);
await callOk("stopMoonShroomChannel", { awakenedId: QA }, token);
await readLand();
ok("§C the ended channel names no channeler", (shroomOn(T1.id)?.channelers ?? []).length === 0);
await sleep(1200);
await readLand();
ok("§C with no channel running, time alone grows nothing",
  shroomOn(T1.id)?.growth === g1, `growth ${shroomOn(T1.id)?.growth} vs ${g1}`);
const resumed = await callOk("startMoonShroomChannel", { awakenedId: QA, tileId: T1.id }, token);
ok("§C a later channel joins the SAME shroom (same record, same artwork)",
  resumed.shroom.id === s1.id && resumed.shroom.variant === s1.variant,
  `id ${resumed.shroom.id} vs ${s1.id}, variant ${resumed.shroom.variant} vs ${s1.variant}`);
setEnergy(1000);
await channelSeconds([QA], 240);
const g2 = shroomOn(T1.id)?.growth ?? -1;
ok("§C the growth is cumulative — the second channel stands on the first's",
  Math.abs(g2 - 480 / 172800) < 0.0002, `growth ${g2}`);
await callOk("stopMoonShroomChannel", { awakenedId: QA }, token);

/* ══ §A PRESENCE: AWAY TIME GROWS NOTHING ═══════════════════ */
console.log("§A presence — channeling works only while online");
await callOk("startMoonShroomChannel", { awakenedId: QA, tileId: T1.id }, token);
setEnergy(1000);
db.prepare("UPDATE moon_shroom_channels SET settled_at = ? WHERE awakened_id = ?").run(Date.now() - 240 * 1000, QA);
db.prepare("UPDATE tender_resources SET last_seen_at = ? WHERE owner_key = ?").run(Date.now() - 10 * 60000, ownerKey);
land = await callOk("getTerritory", {}, token); // no presence stamp — the Tender is away
ok("§A 240 away seconds grow nothing", shroomOn(T1.id)?.growth === g2, `growth ${shroomOn(T1.id)?.growth} vs ${g2}`);
ok("§A away time charges nothing", purse() <= 1000 && purse() >= 995, `purse ${purse()}`);
ok("§A the channel itself stands through the absence", (shroomOn(T1.id)?.channelers ?? []).includes(QA));
await channelSeconds([QA], 240); // presence restored by the helper's stamp
const g3 = shroomOn(T1.id)?.growth ?? -1;
ok("§A on return, the same channel resumes growing", Math.abs(g3 - 720 / 172800) < 0.0002, `growth ${g3}`);
await callOk("stopMoonShroomChannel", { awakenedId: QA }, token);

/* ══ §T TWO CHANNELERS ADD ══════════════════════════════════ */
console.log("§T two channelers — their channels sum");
await callOk("startMoonShroomChannel", { awakenedId: QA, tileId: T2.id }, token);
await callOk("startMoonShroomChannel", { awakenedId: QC, tileId: T2.id }, token);
await readLand();
ok("§T both channelers stand named on the one shroom",
  (shroomOn(T2.id)?.channelers ?? []).length === 2, JSON.stringify(shroomOn(T2.id)?.channelers));
setEnergy(2000);
await channelSeconds([QA, QC], 240);
const gT = shroomOn(T2.id)?.growth ?? -1;
ok("§T 240 seconds of two channels grow the shroom twice one channel's span",
  Math.abs(gT - 480 / 172800) < 0.0002, `growth ${gT} (one channel's 240s grew ${240 / 172800})`);
await callOk("stopMoonShroomChannel", { awakenedId: QA }, token);
// QC keeps channelling T2 a while longer, so its cutting below
// has a living channel to end and a yield above zero. (The
// purse is refilled before each span: three spans cost 2160,
// and a short purse pays only what it holds — the starved
// hold, proven by the first run of this drive.)
setEnergy(2000);
await channelSeconds([QC], 240);
setEnergy(2000);
await channelSeconds([QC], 240);
setEnergy(2000);
await channelSeconds([QC], 240);
const gT2 = shroomOn(T2.id)?.growth ?? -1;
ok("§T the lone remaining channel keeps the growth cumulative",
  Math.abs(gT2 - 1200 / 172800) < 0.0003, `growth ${gT2}`);

/* ══ §M MAX GROWTH RELEASES THE CHANNEL ═════════════════════ */
console.log("§M max growth — the channel is released");
await callOk("startMoonShroomChannel", { awakenedId: QA, tileId: T3.id }, token);
db.prepare("UPDATE moon_shrooms SET growth = 0.999999 WHERE owner_key = ? AND tile_id = ?").run(ownerKey, T3.id);
setEnergy(1000);
await channelSeconds([QA], 240);
const s3 = shroomOn(T3.id);
ok("§M the shroom tops out at full growth (twice a bastion's height)",
  !!s3 && s3.growth === 1 && s3.fullGrown === true, JSON.stringify(s3));
ok("§M at full growth the channel is released by itself", (s3?.channelers ?? []).length === 0);
const onFull = await call("startMoonShroomChannel", { awakenedId: QA, tileId: T3.id }, token);
ok("§M a fresh channel on a full-grown shroom is refused", onFull.status >= 400, `status ${onFull.status}`);

/* ══ §R THE REGEN GIFT, READ FROM THE SERVER ════════════════ */
console.log("§R the regen gift — three shrooms standing");
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at, last_seen_at) VALUES (?, 0, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 0, updated_at = excluded.updated_at, last_seen_at = excluded.last_seen_at")
  .run(ownerKey, Date.now() - 12 * 60000, Date.now());
const gifted = await callOk("getEnergy", {}, token);
ok("§R three shrooms standing: 12 present minutes regen 12 energy (interval at its one-minute floor)",
  gifted.energy === 12, `energy ${gifted.energy}`);

/* ══ §H THE HARVEST ═════════════════════════════════════════ */
console.log("§H the harvest — cut for energy");
const shroomT2 = shroomOn(T2.id);
const yieldT2 = Math.floor(gT2 * 240);
ok("§H the served harvest yield is the growth's share of the full measure",
  shroomT2?.harvestYield === yieldT2 && yieldT2 > 0, `served ${shroomT2?.harvestYield}, reckoned ${yieldT2}`);
setEnergy(5);
const cut2 = await callOk("harvestMoonShroom", { shroomId: shroomT2.id }, token);
ok("§H the cutting pays its yield into the cutter's purse",
  cut2.yield === yieldT2 && purse() === 5 + yieldT2, `yield ${cut2.yield}, purse ${purse()}`);
await readLand();
ok("§H the cut shroom is off the land", !shroomOn(T2.id));
const freed = await callOk("startMoonShroomChannel", { awakenedId: QC, tileId: T1.id }, token);
ok("§H the harvest ended its channels — the freed Awoken channels again at once",
  freed.ok === true && freed.shroom.tileId === T1.id);
await callOk("stopMoonShroomChannel", { awakenedId: QC }, token);
const maxBefore = (await callOk("getEnergy", {}, token)).maxEnergy;
setEnergy(5);
const cut3 = await callOk("harvestMoonShroom", { shroomId: s3.id }, token);
ok("§H a full-grown shroom yields the full measure, capped only by the purse's own max",
  cut3.yield === 240 && purse() === Math.min(5 + 240, maxBefore), `yield ${cut3.yield}, purse ${purse()}, max ${maxBefore}`);
const cutGone = await call("harvestMoonShroom", { shroomId: s3.id }, token);
ok("§H cutting what no longer stands is refused", cutGone.status >= 400, `status ${cutGone.status}`);

console.log(`\nMOON SHROOM DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
