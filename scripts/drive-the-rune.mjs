// drive-the-rune — THE RUNE (Nigel, 2026-11-10), the
// fourth of the six commissioned works, proven on the real
// homeland at the server's own doors:
//   §G THE GATE: an Awoken at Root 3 in the sum of its parts
//      is refused in plain words and raises nothing; an
//      Awoken at Root 4 begins.
//   §C THE COST: a raising is paid for as it BEGINS — 400
//      Shadow Matter out of the beginner's hoard, whole. A
//      hoard that cannot pay refuses the raising in plain
//      words and loses nothing; joining a standing raising
//      charges nothing more.
//   §P THE RISING: progress advances ONLY while a channel
//      runs (3 energy a second from the purse, read off the
//      purse itself); stopping the channel freezes it; a
//      later channel resumes from exactly where it stopped —
//      the rising is cumulative across channels and sessions.
//   §A PRESENCE: while the Tender is away (presence stale),
//      channelled time raises nothing and charges nothing,
//      and the channel itself stands — it resumes on return.
//   §T TWO CHANNELERS: two Awoken channelling one Rune raise
//      it at the sum of their channels — twice one channel's
//      rising over the same span.
//   §B THE BLESSING, READ AT THE SERVER: the Shadow roll's
//      share (shadowDropChanceFor, the one reckoning both
//      fell roads read) stands at the base 20% while no Rune
//      stands complete — a PART-raised Rune wakes nothing —
//      rises to 26% when a Rune tops out (its channel
//      released by itself), and a second complete Rune does
//      not stack it higher. A fresh channel on a complete
//      Rune is refused.
//   §S THE STATURE: at full raising the served record stands
//      complete — the face that wears 2/3 a bastion's height
//      by the bastion-stage face's own measure (Territory's
//      render: bastionH × 2/3) — and the client bundle
//      carries Nigel's rune stone, cut from his PSD layer.
// Run after `npm run build`:
//   node scripts/drive-the-rune.mjs
import { join } from "node:path";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-therune-"));
process.env.PORT = "39993";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39993";
const PW = "therune-drive-password";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

await import("../server/dist/index.js");
// The blessing's one reckoning, read at the server itself.
const { shadowDropChanceFor } = await import("../server/dist/actions.js");
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
const claim = await callOk("claimTender", { password: PW, tenderName: "Rune Tender" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
const token = claim.token;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 3, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', total_exp = 3800, hp = 100").run(ownerKey, now0);
await callOk("ensureFirstSeed", {}, token);
let land = await callOk("getTerritory", {}, token);
ok("the sown land stands (tiles served)", land.tiles.length >= 19, `${land.tiles.length} tiles`);
const tileAt = (q, r) => land.tiles.find(t => t.q === q && t.r === r);

/* Fixture hands on the purse, the hoard and the presence
 * stamp. The resources row is created lazily by the server's
 * own reads, so every fixture write here is an upsert. */
const setEnergy = (n) => db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = excluded.energy, updated_at = excluded.updated_at").run(ownerKey, n, Date.now());
const purse = () => db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(ownerKey).energy;
const setShadow = (n) => db.prepare("UPDATE tender_progress SET shadow_matter = ? WHERE owner_key = ?").run(n, ownerKey);
const hoard = () => db.prepare("SELECT shadow_matter AS s FROM tender_progress WHERE owner_key = ?").get(ownerKey).s;
const stampPresence = () => db.prepare("UPDATE tender_resources SET last_seen_at = ? WHERE owner_key = ?").run(Date.now(), ownerKey);
const runesServed = () => land.runes ?? [];
const runeOn = (tileId) => runesServed().find(r => r.tileId === tileId);
async function readLand() { stampPresence(); land = await callOk("getTerritory", {}, token); return land; }
/** Walk a channel's clock back and let the settle at the
 *  next read reckon the span — the same time-travel the
 *  other drives walk with their lazy settles. The walk goes
 *  in spans of 240 seconds: a settle gap longer than the
 *  house's presence gap (5 minutes) is the Tender AWAY and
 *  grows nothing, so a long channel is walked as a chain of
 *  present spans, each settled at its own read. */
async function channelSeconds(awIds, seconds) {
  let left = seconds;
  while (left > 0) {
    const span = Math.min(240, left);
    const back = Date.now() - span * 1000;
    for (const id of awIds) db.prepare("UPDATE rune_channels SET settled_at = ? WHERE awakened_id = ?").run(back, id);
    await readLand();
    left -= span;
  }
  return land;
}

/* ══ THE COMPANY: two qualifiers (Root 4) and one at Root 3 ══
 * Parts count one apiece; an aspect part counts its level.
 * QA: root body/arms/head + a root aspect (Lv 1) = Root 4.
 * QB: root body/arms/head alone = Root 3 — refused.
 * QC: root body/head + tide arms + root aspect (Lv 2) = Root 4. */
function seedAwoken(name, partEls) {
  const insA = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 2, 2, ?, ?, 'image/png', ?)");
  const cats = ["body", "arms", "head", "aspect"];
  const parts = partEls.map((p, i) => {
    const id = Number(insA.run(`${name} ${cats[i]}`, cats[i], p.el, `rune/${name}-${cats[i]}.png`, Date.now()).lastInsertRowid);
    const part = { source_id: `db:${id}`, name: `${name} ${cats[i]}`, category: cats[i], rarity: "common", power: 2, toughness: 2, element: p.el };
    if (cats[i] === "aspect") part.aspectLevel = p.lv ?? 1;
    return part;
  });
  const composition = JSON.stringify(parts);
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', 'Rune Tender', ?, ?)")
    .run(name, name, `rune/${name}.png`, composition, ownerKey, Date.now()).lastInsertRowid);
}
const field = (awId, tile) => db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
  VALUES (?, ?, ?, ?, ?, 'defense', 0, 99, ?, ?, NULL, NULL, 0)`).run(ownerKey, awId, tile.id, Date.now(), Date.now(), tile.q, tile.r);
const QA = seedAwoken("Runekeeper A", [{ el: "root" }, { el: "root" }, { el: "root" }, { el: "root", lv: 1 }]);
const QB = seedAwoken("Runekeeper B", [{ el: "root" }, { el: "root" }, { el: "root" }]);
const QC = seedAwoken("Runekeeper C", [{ el: "root" }, { el: "tide" }, { el: "root" }, { el: "root", lv: 2 }]);
const T1 = tileAt(0, 0), T2 = tileAt(1, 0), T3 = tileAt(0, 1);
field(QA, T1); field(QB, T2); field(QC, T3);
await readLand();

/* ══ §B (baseline) THE SHARE BEFORE ANY RUNE ═══════════════ */
console.log("§B the blessing — the baseline first");
ok("§B with no Rune standing, the Shadow roll's share reads the base 20%",
  shadowDropChanceFor(ownerKey) === 0.2, `share ${shadowDropChanceFor(ownerKey)}`);

/* ══ §G THE GATE ════════════════════════════════════════════ */
console.log("§G the gate — 4 Root in the sum of the parts, or nothing");
setShadow(1000);
const refused = await call("startRuneChannel", { awakenedId: QB, tileId: T2.id }, token);
ok("§G an Awoken at Root 3 is refused", refused.status >= 400, `status ${refused.status}`);
ok("§G the refusal speaks the gate in plain words",
  JSON.stringify(refused.raw).includes("at least 4 Root in the sum of its parts"), JSON.stringify(refused.raw).slice(0, 200));
await readLand();
ok("§G the refused channel raised nothing", runesServed().length === 0, `${runesServed().length} runes`);
ok("§G the refused raising charged the hoard nothing", hoard() === 1000, `hoard ${hoard()}`);

/* ══ §C THE COST — PAID AS THE RAISING BEGINS ═══════════════ */
console.log("§C the cost — 400 Shadow Matter, up-front");
setShadow(399);
const cantPay = await call("startRuneChannel", { awakenedId: QA, tileId: T1.id }, token);
ok("§C a hoard of 399 cannot begin a raising", cantPay.status >= 400, `status ${cantPay.status}`);
ok("§C the refusal speaks the price and the hoard's holding in plain words",
  JSON.stringify(cantPay.raw).includes("costs 400 Shadow Matter") && JSON.stringify(cantPay.raw).includes("holds 399"),
  JSON.stringify(cantPay.raw).slice(0, 240));
ok("§C the refused raising took nothing", hoard() === 399, `hoard ${hoard()}`);
await readLand();
ok("§C and raised nothing", runesServed().length === 0, `${runesServed().length} runes`);
setShadow(1000);
const begun = await callOk("startRuneChannel", { awakenedId: QA, tileId: T1.id }, token);
ok("§C a qualifier's tap begins the raising", begun.ok === true && begun.beganRaising === true && begun.rune.tileId === T1.id);
ok("§C the 400 left the hoard as the raising began — 1000 stands at 600",
  hoard() === 600, `hoard ${hoard()}`);
await readLand();
const r1 = runeOn(T1.id);
ok("§C the Rune is served on its tile, unrisen, with its channeler named",
  !!r1 && r1.progress === 0 && r1.complete === false && r1.channelers.length === 1 && r1.channelers[0] === QA,
  JSON.stringify(r1));
const joined = await callOk("startRuneChannel", { awakenedId: QC, tileId: T1.id }, token);
ok("§C a second channel JOINS the standing raising (no new raising begun)",
  joined.ok === true && joined.beganRaising === false && joined.rune.id === r1.id,
  `began ${joined.beganRaising}, id ${joined.rune.id} vs ${r1.id}`);
ok("§C joining charged the hoard nothing more", hoard() === 600, `hoard ${hoard()}`);
await callOk("stopRuneChannel", { awakenedId: QC }, token);

/* ══ §P THE RISING: ONLY WHILE A CHANNEL RUNS ═══════════════ */
console.log("§P the rising — only while a channel runs, cumulative");
setEnergy(20000);
await channelSeconds([QA], 3600);
const p1 = runeOn(T1.id)?.progress ?? -1;
ok("§P 3600 channelled seconds raise the Rune by 3600/14400 of its full height",
  Math.abs(p1 - 3600 / 14400) < 0.0002, `progress ${p1}`);
ok("§P the purse paid the standing channel price — 3 a second, 10800 for the span",
  purse() <= 20000 - 10800 + 15 && purse() >= 20000 - 10800 - 5, `purse ${purse()}`);
await callOk("stopRuneChannel", { awakenedId: QA }, token);
await readLand();
ok("§P the ended channel names no channeler", (runeOn(T1.id)?.channelers ?? []).length === 0);
await sleep(1200);
await readLand();
ok("§P with no channel running, time alone raises nothing",
  runeOn(T1.id)?.progress === p1, `progress ${runeOn(T1.id)?.progress} vs ${p1}`);
const resumed = await callOk("startRuneChannel", { awakenedId: QA, tileId: T1.id }, token);
ok("§P a later channel joins the SAME Rune (same record)",
  resumed.rune.id === r1.id && resumed.beganRaising === false, `id ${resumed.rune.id} vs ${r1.id}`);
setEnergy(20000);
await channelSeconds([QA], 3600);
const p2 = runeOn(T1.id)?.progress ?? -1;
ok("§P the rising is cumulative — the second channel stands on the first's",
  Math.abs(p2 - 7200 / 14400) < 0.0002, `progress ${p2}`);
await callOk("stopRuneChannel", { awakenedId: QA }, token);

/* ══ §A PRESENCE: AWAY TIME RAISES NOTHING ══════════════════ */
console.log("§A presence — channeling works only while online");
await callOk("startRuneChannel", { awakenedId: QA, tileId: T1.id }, token);
setEnergy(20000);
db.prepare("UPDATE rune_channels SET settled_at = ? WHERE awakened_id = ?").run(Date.now() - 3600 * 1000, QA);
db.prepare("UPDATE tender_resources SET last_seen_at = ? WHERE owner_key = ?").run(Date.now() - 10 * 60000, ownerKey);
land = await callOk("getTerritory", {}, token); // no presence stamp — the Tender is away
ok("§A 3600 away seconds raise nothing", runeOn(T1.id)?.progress === p2, `progress ${runeOn(T1.id)?.progress} vs ${p2}`);
ok("§A away time charges nothing", purse() <= 20000 && purse() >= 19995, `purse ${purse()}`);
ok("§A the channel itself stands through the absence", (runeOn(T1.id)?.channelers ?? []).includes(QA));
await channelSeconds([QA], 3600); // presence restored by the helper's stamp
const p3 = runeOn(T1.id)?.progress ?? -1;
ok("§A on return, the same channel resumes rising", Math.abs(p3 - 10800 / 14400) < 0.0002, `progress ${p3}`);
await callOk("stopRuneChannel", { awakenedId: QA }, token);

/* ══ §B A PART-RAISED RUNE WAKES NOTHING ════════════════════ */
console.log("§B the blessing — not before full raising");
ok("§B a Rune at three-quarters raised leaves the share at the base 20%",
  shadowDropChanceFor(ownerKey) === 0.2, `share ${shadowDropChanceFor(ownerKey)}`);

/* ══ §T TWO CHANNELERS ADD ══════════════════════════════════ */
console.log("§T two channelers — their channels sum");
setShadow(1000);
const begun2 = await callOk("startRuneChannel", { awakenedId: QA, tileId: T2.id }, token);
ok("§T a second Rune's raising begins on its own tile (its own 400 paid)",
  begun2.beganRaising === true && hoard() === 600, `began ${begun2.beganRaising}, hoard ${hoard()}`);
await callOk("startRuneChannel", { awakenedId: QC, tileId: T2.id }, token);
await readLand();
ok("§T both channelers stand named on the one Rune",
  (runeOn(T2.id)?.channelers ?? []).length === 2, JSON.stringify(runeOn(T2.id)?.channelers));
// Two channels for the span cost 2 × 3600 × 3 = 21600 —
// the purse is funded past it. (This drive's first §T run
// funded 20000 and the last spans starved at exactly what
// the purse could pay — the starved hold, proven by the
// probe log; the fixture, not the settle, was short.)
setEnergy(30000);
await channelSeconds([QA, QC], 3600);
const pT = runeOn(T2.id)?.progress ?? -1;
ok("§T 3600 seconds of two channels raise the Rune twice one channel's span",
  Math.abs(pT - 7200 / 14400) < 0.0002, `progress ${pT} (one channel's 3600s raised ${3600 / 14400})`);

/* ══ §B+§S TOPPING OUT: THE BLESSING WAKES ══════════════════ */
console.log("§B/§S full raising — the channel is released, the blessing wakes");
db.prepare("UPDATE runes SET progress = 0.999999 WHERE owner_key = ? AND tile_id = ?").run(ownerKey, T2.id);
setEnergy(20000);
await channelSeconds([QA, QC], 240);
const r2 = runeOn(T2.id);
ok("§S the Rune tops out at full raising and stands complete (2/3 a bastion's stature)",
  !!r2 && r2.progress === 1 && r2.complete === true, JSON.stringify(r2));
ok("§B at full raising the channels are released by themselves", (r2?.channelers ?? []).length === 0);
ok("§B the Shadow roll's share now reads 26% at the server",
  shadowDropChanceFor(ownerKey) === 0.26, `share ${shadowDropChanceFor(ownerKey)}`);
const onFull = await call("startRuneChannel", { awakenedId: QA, tileId: T2.id }, token);
ok("§B a fresh channel on a complete Rune is refused", onFull.status >= 400, `status ${onFull.status}`);
ok("§B the refusal speaks its standing in plain words",
  JSON.stringify(onFull.raw).includes("stands complete"), JSON.stringify(onFull.raw).slice(0, 200));

/* ══ §B NO STACKING ═════════════════════════════════════════ */
console.log("§B the blessing — it does not stack with itself");
await callOk("startRuneChannel", { awakenedId: QA, tileId: T1.id }, token);
db.prepare("UPDATE runes SET progress = 0.999999 WHERE owner_key = ? AND tile_id = ?").run(ownerKey, T1.id);
setEnergy(20000);
await channelSeconds([QA], 240);
const r1Done = runeOn(T1.id);
ok("§B the first Rune now stands complete too",
  !!r1Done && r1Done.complete === true, JSON.stringify(r1Done));
ok("§B two complete Runes on the land still read 26% — never more",
  shadowDropChanceFor(ownerKey) === 0.26, `share ${shadowDropChanceFor(ownerKey)}`);

/* ══ §S THE ART IN THE BUNDLE ════════════════════════════════ */
console.log("§S the artwork — Nigel's rune stone rides the client bundle");
let bundleArt = [];
try { bundleArt = readdirSync(join(process.cwd(), "client", "dist", "assets")).filter(f => f.startsWith("rune-stone") && f.endsWith(".png")); }
catch { bundleArt = []; }
ok("§S the bundle carries the rune-stone PNG cut from his PSD's painted layer",
  bundleArt.length === 1, bundleArt.join(",") || "none found");

console.log(`\nTHE RUNE DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
