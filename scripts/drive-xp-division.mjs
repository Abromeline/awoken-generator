// XP DIVISION — DRIVE (Nigel, 2026-10-24 21:35–21:40:
// "xp gets split between all involved on friend join" →
// "the exp is divided though not both parties receiving
// the same — also when awoken gain from battle they also
// split exp divided" → the Keeper's reading, adopted by
// "yes build it": divided BY INVOLVEMENT, the greater
// share to those who did more of the fighting in that act).
// Proven against the real engine on a scratch server, with
// the dice stubbed at their half (Math.random = 0.5, this
// process only — the server runs in it) so every figure is
// exact: homelandDN gives d20 = 11, d4 = 3, d6 = 4. A Sky
// hand (d4 parts) with part power p rolls raw 3×(3+p);
// against a Fray (AC 11) at level 1 the mitigation pays
// round(raw × 50/61): power 1 → 10 a hit, power 0 → 7.
//   §1 THE FELL DIVIDES: two Sky hands fell one Fray —
//      the heavier (10 a hit) and the lighter (7). The
//      felling window's ledger stands 20 to 7, so the
//      standing 10 XP pot divides 8 / 2 — the sum exact,
//      the heavier hitter the larger share, and the hand
//      that never struck the fell still paid for fighting.
//   §2 A SOLO FELL PAYS WHOLE: one hand, one Fray (18 HP,
//      two of her blows), an unbeatable hide so no defence
//      pot muddies the count — her delta is exactly the
//      pot, 10, as battle XP was always paid.
//   §3 A DEFENCE STOOD DIVIDES: a Fray bites the weaker of
//      two defenders all window (deep body — it never
//      falls, so no fell pot); both answer it, 40 and 28
//      of damage. The ONE pot of 10 divides 6 / 4 — not
//      10 to the victim and 0 to her sister (the old law),
//      and not 10 apiece (no second pot exists).
//   §4 THE FALLBACK: a Tangle (AC 15) bites a Stone victim
//      while both Stone hands whiff every answer (their
//      12 never reaches 15) — no Awoken damaged the
//      assailant all window, so the stood Awoken, the only
//      one involved, takes the pot whole: 10, her sister 0.
//   §5 THE DIVIDER ITSELF, at the unit level: exact sums
//      over swept pots and weights, the remainder to the
//      largest shareholder, a lone shareholder whole, an
//      empty table paying nothing, a feather-weight
//      shareholder floored to nothing beside a giant.
//   §6 TENDER SHARES RIDE THE SAME DIVIDER: divided by
//      owner, two Tenders' portions of one pot are the sums
//      of their own Awoken's shares — 6 / 4 across the
//      seam, the whole pot to one Tender when every hand
//      is theirs. (The homeland today seats one Tender; the
//      multi-Tender division is proven here at the divider,
//      as the brief names it — no hosted-land build is
//      pretended.)
// Run: node scripts/drive-xp-division.mjs
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-xpdiv-"));
process.env.PORT = "3997";
process.env.WORKSHOP_PASSWORD = ["xpdiv", "drive", "password"].join("-");
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;
process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3997";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

await import("../server/dist/index.js");
await sleep(2500);
const { divideXpPot, divideXpPotByOwner } = await import("../server/dist/actions.js");

async function call(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }

// Still the ambient cradle for the drive's whole life, as
// the watering drive does — no unscripted dark joins a scene.
setInterval(() => {
  try { db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ?, wanderer_settled_beats = 0").run(Date.now()); } catch { /* ending */ }
}, 3000);

async function claim(name) {
  const c = await call("claimTender", { password: "xpdiv-drive-password", tenderName: name });
  const id = db.prepare("SELECT id FROM tenders WHERE code = ?").get(c.tender.code).id;
  const ownerKey = `tender:${id}`;
  const now = Date.now();
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, now);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(ownerKey, now);
  // The class is set by hand, as the watering drive sets
  // hers: the choosing gate wants three wakes first, and the
  // Warden's +4 company AC is part of these scenes' reckoning.
  db.prepare(`INSERT INTO tender_progress (owner_key, class_key, weapon_key, hp, updated_at)
    VALUES (?, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', hp = 100`).run(ownerKey, now);
  return { token: c.token, ownerKey };
}
function seedTile(ownerKey, q, r, cursed, element = "root") {
  return Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(ownerKey, q, r, element, cursed, Date.now()).lastInsertRowid);
}
function seedLand(ownerKey, cursed = 1) {
  const ids = new Map();
  for (let q = -3; q <= 4; q++) for (let r = -3; r <= 3; r++) {
    if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) > 4) continue;
    ids.set(`${q},${r}`, seedTile(ownerKey, q, r, cursed));
  }
  return ids;
}
function seedAwokin(ownerKey, tenderName, name, element, power = 3, toughness = 3) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, power, toughness, element, `xpdiv/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power, toughness, element });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `xpdiv/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
function placeAwokin(ownerKey, awakenedId, tileId, q, r, opts = {}) {
  return Number(db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0)`).run(
    ownerKey, awakenedId, tileId, Date.now(), Date.now(),
    opts.stance ?? "attack", opts.hp ?? 99, q, r,
    opts.shield ?? null, opts.shield ?? null).lastInsertRowid);
}
function seedDark(ownerKey, tileId, kind, q, r, opts = {}) {
  return Number(db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
    ownerKey, tileId, kind, Date.now(), opts.hp ?? 3, q, r, opts.power ?? 1, opts.lvl ?? 1).lastInsertRowid);
}
const xpOf = (id) => db.prepare("SELECT experience FROM awakened WHERE id = ?").get(id)?.experience ?? 0;
const darkRow = (id) => db.prepare("SELECT * FROM homeland_wanderers WHERE id = ?").get(id);
const placementOf = (id) => db.prepare("SELECT * FROM field_placements WHERE id = ?").get(id);
async function prime(token) { await call("getTerritory", {}, token); }
async function advance(ownerKey, token, ms) {
  db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now() - ms, ownerKey);
  return call("getTerritory", {}, token);
}

const realRandom = Math.random;
/** Fight one scripted window with every die at its half. */
async function fightWindow(ownerKey, token, ms) {
  Math.random = () => 0.5;
  try { return await advance(ownerKey, token, ms); }
  finally { Math.random = realRandom; }
}

/* ══ §1 THE FELL DIVIDES ═══════════════════════════════ */
console.log("§1 two hands fell one Fray; the pot divides by the damage each dealt");
{
  const G = await claim("Division Fell");
  const T = seedLand(G.ownerKey);
  const heavy = seedAwokin(G.ownerKey, "Division Fell", "Heavy Hand", "sky", 1, 40);
  const light = seedAwokin(G.ownerKey, "Division Fell", "Light Hand", "sky", 0, 40);
  placeAwokin(G.ownerKey, heavy, T.get("2,0"), 2, 0, { hp: 999 });
  placeAwokin(G.ownerKey, light, T.get("2,-1"), 2, -1, { hp: 999 });
  const dark = seedDark(G.ownerKey, T.get("3,0"), "fray", 3, 0, { hp: 18 });
  await prime(G.token);
  const x0 = [xpOf(heavy), xpOf(light)];
  await fightWindow(G.ownerKey, G.token, 10000);
  const d = [xpOf(heavy) - x0[0], xpOf(light) - x0[1]];
  ok("the Fray fell to the two hands together", !darkRow(dark));
  ok("the fell's pot divided by involvement: the heavier hand (20 of the fight's damage) takes 8, the lighter (7) takes 2",
    d[0] === 8 && d[1] === 2, `deltas=${d.join(",")}`);
  ok("the shares sum EXACTLY to the standing pot of 10", d[0] + d[1] === 10, `sum=${d[0] + d[1]}`);
  ok("the heavier hitter takes the larger share, and the hand that struck no felling blow is still paid",
    d[0] > d[1] && d[1] > 0, `deltas=${d.join(",")}`);
}

/* ══ §2 A SOLO FELL PAYS WHOLE ═════════════════════════ */
console.log("§2 one hand fells alone; the pot is hers entire, as it always was");
{
  const G = await claim("Division Solo");
  const T = seedLand(G.ownerKey);
  const solo = seedAwokin(G.ownerKey, "Division Solo", "Lone Hand", "sky", 1, 40);
  placeAwokin(G.ownerKey, solo, T.get("2,0"), 2, 0, { hp: 999 });
  const dark = seedDark(G.ownerKey, T.get("3,0"), "fray", 3, 0, { hp: 18 });
  await prime(G.token);
  const x0 = xpOf(solo);
  await fightWindow(G.ownerKey, G.token, 10000);
  ok("the lone hand felled her Fray", !darkRow(dark));
  ok("her delta is exactly the whole pot (10) — no defence pot rode in (her hide was never pierced)",
    xpOf(solo) - x0 === 10, `delta=${xpOf(solo) - x0}`);
}

/* ══ §3 A DEFENCE STOOD DIVIDES ════════════════════════ */
console.log("§3 a Fray bites one defender all window; both answer it; the one pot divides");
{
  const G = await claim("Division Defence");
  const T = seedLand(G.ownerKey);
  const victim = seedAwokin(G.ownerKey, "Division Defence", "Stood Hand", "sky", 1, 2);
  const sister = seedAwokin(G.ownerKey, "Division Defence", "Answering Hand", "sky", 0, 40);
  const vPl = placeAwokin(G.ownerKey, victim, T.get("2,0"), 2, 0, { hp: 6, shield: 500 });
  placeAwokin(G.ownerKey, sister, T.get("2,-1"), 2, -1, { hp: 999 });
  const dark = seedDark(G.ownerKey, T.get("3,0"), "fray", 3, 0, { hp: 500 });
  await prime(G.token);
  const x0 = [xpOf(victim), xpOf(sister)];
  await fightWindow(G.ownerKey, G.token, 10000);
  const d = [xpOf(victim) - x0[0], xpOf(sister) - x0[1]];
  ok("the assailant still stands (no fell pot in this scene) and the victim's shield drank its bites",
    !!darkRow(dark) && (placementOf(vPl).shield ?? 500) < 500,
    `dark=${!!darkRow(dark)} shield=${placementOf(vPl).shield}`);
  ok("the defence pot divided by the damage each dealt the assailant (40 and 28): 6 to the stood hand, 4 to her sister",
    d[0] === 6 && d[1] === 4, `deltas=${d.join(",")}`);
  ok("ONE pot only: the shares sum to 10 — not the old sole pay (10/0), not a pot apiece (10/10)",
    d[0] + d[1] === 10, `sum=${d[0] + d[1]}`);
}

/* ══ §4 THE FALLBACK — NOBODY ANSWERED ═════════════════ */
console.log("§4 the assailant is never damaged; the stood Awoken takes the pot whole");
{
  const G = await claim("Division Fallback");
  const T = seedLand(G.ownerKey);
  const victim = seedAwokin(G.ownerKey, "Division Fallback", "Bitten Hand", "stone", 3, 2);
  const sister = seedAwokin(G.ownerKey, "Division Fallback", "Whiffing Hand", "stone", 3, 40);
  const vPl = placeAwokin(G.ownerKey, victim, T.get("2,0"), 2, 0, { hp: 6, shield: 500 });
  placeAwokin(G.ownerKey, sister, T.get("2,-1"), 2, -1, { hp: 999 });
  const dark = seedDark(G.ownerKey, T.get("3,0"), "tangle", 3, 0, { hp: 500 });
  await prime(G.token);
  const x0 = [xpOf(victim), xpOf(sister)];
  await fightWindow(G.ownerKey, G.token, 10000);
  const d = [xpOf(victim) - x0[0], xpOf(sister) - x0[1]];
  ok("the Tangle's bites landed (the victim's shield drank them) while every Stone answer whiffed on its AC 15",
    (placementOf(vPl).shield ?? 500) < 500, `shield=${placementOf(vPl).shield}`);
  ok("with no hand's damage on the assailant, the stood Awoken takes the whole pot (10) and her sister nothing",
    d[0] === 10 && d[1] === 0, `deltas=${d.join(",")}`);
}

/* ══ §5 THE DIVIDER ITSELF ══════════════════════════════ */
console.log("§5 the divider's arithmetic, swept clean");
{
  const m = (o) => new Map(Object.entries(o).map(([k, v]) => [Number(k), v]));
  const sum = (s) => [...s.values()].reduce((a, b) => a + b, 0);
  let s = divideXpPot(10, m({ 1: 10, 2: 7 }));
  ok("10 over weights 10/7 divides 6/4 (floors 5/4, the leftover point to the largest)",
    s.get(1) === 6 && s.get(2) === 4 && sum(s) === 10, JSON.stringify([...s]));
  s = divideXpPot(10, m({ 1: 5 }));
  ok("a lone shareholder takes the pot whole", s.get(1) === 10 && s.size === 1, JSON.stringify([...s]));
  s = divideXpPot(10, new Map());
  ok("an empty table pays nothing", s.size === 0, JSON.stringify([...s]));
  s = divideXpPot(10, m({ 1: 0, 2: 0 }));
  ok("a table of zero weights pays nothing", s.size === 0, JSON.stringify([...s]));
  s = divideXpPot(2, m({ 1: 2, 2: 1 }));
  ok("the seed's pot of 2 over weights 2/1: the heavier takes both, the lighter's share floors to nothing",
    s.get(1) === 2 && s.get(2) === 0 && sum(s) === 2, JSON.stringify([...s]));
  s = divideXpPot(2, m({ 1: 1, 2: 1 }));
  ok("an even fight splits the pot of 2 evenly, 1 and 1", s.get(1) === 1 && s.get(2) === 1, JSON.stringify([...s]));
  let sweepOk = true, monoOk = true;
  let rng = 1234567;
  const rnd = (n) => { rng = (rng * 1103515245 + 12345) % 2147483648; return rng % n; };
  for (let trial = 0; trial < 500; trial++) {
    const pot = 1 + rnd(60);
    const n = 1 + rnd(6);
    const w = new Map();
    for (let i = 0; i < n; i++) w.set(100 + i, 1 + rnd(40));
    const sh = divideXpPot(pot, w);
    if (sum(sh) !== pot) sweepOk = false;
    const wMax = Math.max(...w.values()), wMin = Math.min(...w.values());
    const idMax = [...w.entries()].find(([, v]) => v === wMax)[0];
    const idMin = [...w.entries()].find(([, v]) => v === wMin)[0];
    if ((sh.get(idMax) ?? 0) < (sh.get(idMin) ?? 0)) monoOk = false;
    if ([...sh.values()].some((v) => v < 0)) sweepOk = false;
  }
  ok("500 swept pots: every division sums EXACTLY to its pot, no share negative", sweepOk);
  ok("500 swept pots: the greatest weight never takes less than the least weight", monoOk);
}

/* ══ §6 TENDER SHARES RIDE THE SAME DIVIDER ════════════ */
console.log("§6 divided by owner, the portions are the Awoken shares summed — one law, no second mechanism");
{
  const ownerOf = (id) => (id === 1 ? "tender:one" : id === 2 ? "tender:two" : null);
  const byOwner = divideXpPotByOwner(10, new Map([[1, 10], [2, 7]]), ownerOf);
  ok("two Tenders in one act: their portions are 6 and 4 — their own hands' shares, summed",
    byOwner.get("tender:one") === 6 && byOwner.get("tender:two") === 4,
    JSON.stringify([...byOwner]));
  const one = divideXpPotByOwner(10, new Map([[1, 10], [2, 7]]), () => "tender:one");
  ok("one Tender whose hands did all the fighting takes the whole pot — the homeland's standing case",
    one.get("tender:one") === 10 && one.size === 1, JSON.stringify([...one]));
  const mixed = divideXpPotByOwner(50, new Map([[1, 30], [2, 10], [3, 10]]),
    (id) => (id === 3 ? "tender:two" : "tender:one"));
  const awokenSide = divideXpPot(50, new Map([[1, 30], [2, 10], [3, 10]]));
  ok("a three-hand act across two Tenders: the owner portions sum to the pot and match the Awoken division exactly",
    [...mixed.values()].reduce((a, b) => a + b, 0) === 50
      && mixed.get("tender:one") === (awokenSide.get(1) + awokenSide.get(2))
      && mixed.get("tender:two") === awokenSide.get(3),
    JSON.stringify([...mixed]));
}

console.log(`\nXP DIVISION DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
