// BULWARK SHIPS AS A WARD — RECOVERY R12'S DRIVE
// (Nigel, 2026-10-23 12:04, recovery order #12 + the shared
// law #14): "implemented in the Rock Wall's working
// fashion — a LINE OF SHIELDS with HP, classed as a WARD,
// that KNOCKS BACK enemies that hit it. WARD COST: 8
// ENERGY." And #14: "bring them into the game FOLLOWING
// THE 5-10 ROCK WALL LAW (HP by level 5..10; count in the
// rock-wall fashion) — BULWARK'S COUNT FOLLOWS THE WARDING
// CAST LEVEL: a high cast summons more shields, a low cast
// only one or 2. AND FIX THE ACs TO THEIR DROPPED AMOUNTS."
//
// THE READINGS THIS DRIVE PROVES (named in the commit):
//   · The warding cast level is the CASTER'S TENDER LEVEL
//     — the figure the cast's own roll is reckoned from.
//   · Count = ⌊cast level / 2⌋ (Nigel's own earlier pencil
//     for this line, 2026-10-21), floored at 1 and CAPPED
//     AT 6 in the rock-wall fashion: Lv 3 → 1, Lv 4 → 2,
//     Lv 10 → 5, Lv 14 → 6 (the cap binds; uncapped, 7).
//   · Each shield's HP = the ONE shared table
//     ROCK_WALL_HP_BY_LEVEL read at the cast level
//     (Lv 3 → 6, Lv 4 → 7, Lv 10 → 10) — the same helper
//     the Rock Wall reads (rockWallHpForLevel).
//   · The dropped enemy ACs stand as enemyACFor reads
//     them: Fray 11, Hollow 12, Unraveler 13, Tangle 15
//     (base 10 + bonus, the −3 of 2026-10-22 16:49 already
//     in the defaults). No reckoning in this build invents
//     an AC for a shield or uses a pre-drop figure.
//   · A shield takes the hack measure on the homeland
//     (WALL_HACK_DMG, the Rock Wall's own branch) and the
//     blow's power at the Table (the Seal's Table measure);
//     the knock back is ONE TILE on both grounds.
//
// Boots the real server on a scratch DATA_DIR and proves:
//   §0 the reckoning read directly off the built modules;
//   §A the homeland cast door: the book's page (ward, 8✦,
//      glyph owed — null), the 8✦ price per attempt, the
//      counts and HP at Lv 3 / 4 / 10 / 14, the line's
//      geometry across the named edge, and the line served
//      in the territory state the client draws;
//   §B the homeland battle: the dark meets the line, is
//      held at it, hacks a shield down point by point and
//      is shoved back — and a no-line control crosses to
//      its victim's reach on the same geometry;
//   §C a shield at 1 HP falls to one hit and the line is
//      gone; the striker stands a tile farther off;
//   §D controls: the Seal casts exactly as before (3✦,
//      HP 9 at Lv 3) and the Rock Wall still raises 6
//      rocks of 10 HP at Awoken level 9;
//   §E the Table: the cast through castWard at Lv 10 and
//      Lv 3 (counts, HP, the 8✦ price), and in a live wave
//      the dark meets the line, a shield's HP falls, the
//      striker is visibly shoved back, and a shield falls
//      out of the line.
// Run: node scripts/drive-bulwark.mjs
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-bulwark-"));
process.env.PORT = "3996";
process.env.WORKSHOP_PASSWORD = ["bulwark", "drive", "password"].join("-");
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3996";
const PW = "bulwark-drive-password";
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
  if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return data?.data ?? data;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up */ }

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
const near = (a, b, tol = 0.01) => a != null && Math.abs(a - b) <= tol;

async function claim(name, exp, classKey = "warden") {
  const c = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(c.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  const now = Date.now();
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, exp, now);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(ownerKey, now);
  // FIXTURE REPAIR (2026-10-24, the no-hex-lock build): the
  // choosing now opens only after the first three wakes
  // (landed after this drive was written) — seed them first.
  if (classKey) { seedAwokin(ownerKey, name, `${name} Wake One`, "root"); seedAwokin(ownerKey, name, `${name} Wake Two`, "root"); seedAwokin(ownerKey, name, `${name} Wake Three`, "root"); }
  if (classKey) await call("chooseClass", { classKey }, c.token);
  return { token: c.token, ownerKey, tenderId, name };
}
function seedTiles(ownerKey, radius = 4) {
  const ids = new Map();
  const ins = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', 0, ?)");
  const now = Date.now();
  for (let q = -radius; q <= radius; q++) for (let r = -radius; r <= radius; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > radius) continue;
    ids.set(`${q},${r}`, Number(ins.run(ownerKey, q, r, now).lastInsertRowid));
  }
  return ids;
}
function seedAwokin(ownerKey, tenderName, name, element, power = 3, toughness = 3, exp = 0) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, power, toughness, element, `bulwark/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power, toughness, element });
  }
  const id = Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `bulwark/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
  if (exp) db.prepare("UPDATE awakened SET experience = ? WHERE id = ?").run(exp, id);
  return id;
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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
    ownerKey, tileId, kind, Date.now(), opts.hp ?? 3, q, r, opts.power ?? 1, opts.lvl ?? 1);
  return Number(info.lastInsertRowid);
}
const darkRow = (id) => db.prepare("SELECT * FROM homeland_wanderers WHERE id = ?").get(id);
const energyOf = (ownerKey) => db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(ownerKey)?.energy;
const bulwarkRow = (ownerKey) => db.prepare("SELECT * FROM defence_works WHERE owner_key = ? AND kind = 'bulwark' ORDER BY id DESC").get(ownerKey);
const nodesOf = (row) => (row ? JSON.parse(row.nodes) : []);
async function prime(ownerKey, token) { await call("getTerritory", {}, token); }
async function advance(ownerKey, token, ms) {
  db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now() - ms, ownerKey);
  return call("getTerritory", {}, token);
}
async function castUntilStands(token, spellKey, args) {
  let attempts = 0;
  for (let i = 0; i < 24; i++) {
    attempts++;
    const res = await call("castMapWorking", { spellKey, ...args }, token);
    if (!res.fizzled) return { res, attempts };
    if (res.cost !== (spellKey === "bulwark" ? 8 : res.cost)) throw new Error("a fizzle charged a wrong price: " + JSON.stringify(res));
  }
  throw new Error(`cast of ${spellKey} never stood in 24 casts`);
}

/* ══ §0 THE RECKONING, READ DIRECTLY ══════════════════════ */
console.log("§0 the shared reckoning — one table, the count by cast level, the dropped ACs");
{
  const acts = await import("../server/dist/actions.js");
  const { enemyACFor } = await import("../server/dist/enemyAC.js");
  ok("the shared HP table stands as it stood: [5,6,6,7,8,8,9,9,10]",
    JSON.stringify(acts.ROCK_WALL_HP_BY_LEVEL) === "[5,6,6,7,8,8,9,9,10]", JSON.stringify(acts.ROCK_WALL_HP_BY_LEVEL));
  ok("HP by level reads the one table: Lv1 → 5, Lv3 → 6, Lv4 → 7, Lv9 → 10, Lv10 → 10 (clamped), Lv104 → 10",
    acts.rockWallHpForLevel(1) === 5 && acts.rockWallHpForLevel(3) === 6 && acts.rockWallHpForLevel(4) === 7
    && acts.rockWallHpForLevel(9) === 10 && acts.rockWallHpForLevel(10) === 10 && acts.rockWallHpForLevel(104) === 10);
  ok("the count follows the cast level: Lv1 → 1, Lv3 → 1, Lv4 → 2, Lv5 → 2, Lv6 → 3, Lv9 → 4, Lv10 → 5",
    acts.bulwarkShieldCountFor(1) === 1 && acts.bulwarkShieldCountFor(3) === 1 && acts.bulwarkShieldCountFor(4) === 2
    && acts.bulwarkShieldCountFor(5) === 2 && acts.bulwarkShieldCountFor(6) === 3 && acts.bulwarkShieldCountFor(9) === 4
    && acts.bulwarkShieldCountFor(10) === 5);
  ok("the count is CAPPED at 6 in the rock-wall fashion: Lv12 → 6, Lv14 → 6 (uncapped 7), Lv104 → 6",
    acts.bulwarkShieldCountFor(12) === 6 && acts.bulwarkShieldCountFor(14) === 6 && acts.bulwarkShieldCountFor(104) === 6);
  ok("the dropped enemy ACs stand (base 10 + the dropped bonuses): Fray 11, Hollow 12, Unraveler 13, Tangle 15",
    enemyACFor("fray") === 11 && enemyACFor("hollow") === 12 && enemyACFor("unraveler") === 13 && enemyACFor("tangle") === 15,
    `fray=${enemyACFor("fray")} hollow=${enemyACFor("hollow")} unraveler=${enemyACFor("unraveler")} tangle=${enemyACFor("tangle")}`);
}

/* ══ §A THE HOMELAND CAST DOOR ════════════════════════════ */
console.log("§A the homeland — Bulwark casts through the ward door, at the cast level's count and HP");
const grim = await call("getGrimoire", {});
const bulwarkPage = (grim.spells ?? []).find((s) => s.key === "bulwark");
ok("the book carries Bulwark as a WARD of 8 energy, its face BOUND to its own Shield piece (Bind Them All, 2026-10-25 — the glyph record glyph-bulwark, assetKey bulwark; no drawn-rune glyph invented)",
  !!bulwarkPage && bulwarkPage.kind === "ward" && bulwarkPage.cost === 8 && bulwarkPage.engine === "bulwark" && bulwarkPage.glyphId === "glyph-bulwark"
    && (grim.glyphs ?? []).some((g) => g.id === "glyph-bulwark" && g.assetKey === "bulwark"),
  JSON.stringify(bulwarkPage));

const A = await claim("Bulwark Low", 150); // Lv 3
const aTiles = seedTiles(A.ownerKey);
await prime(A.ownerKey, A.token);
{
  const e0 = energyOf(A.ownerKey);
  const { res, attempts } = await castUntilStands(A.token, "bulwark", { tileId: aTiles.get("2,0"), dir: 0 });
  const e1 = energyOf(A.ownerKey);
  ok("a LOW cast (Lv 3) raises exactly 1 shield, of 6 HP (the table at Lv 3)",
    res.shields === 1 && res.shieldHp === 6, JSON.stringify(res));
  ok("the standing cast names its price: 8 energy", res.cost === 8, JSON.stringify(res));
  ok("every attempt — fizzle and standing alike — charged exactly 8 (the purse fell by 8 × attempts)",
    e0 - e1 === 8 * attempts, `delta=${e0 - e1} attempts=${attempts}`);
  const row = bulwarkRow(A.ownerKey);
  const nodes = nodesOf(row);
  ok("the line lives in the defence-works ledger, placement_id 0 — no figure raises or sustains it",
    !!row && Number(row.placement_id) === 0, JSON.stringify(row && { id: row.id, placement_id: row.placement_id, kind: row.kind }));
  ok("the one shield stands on the named edge's midpoint (2, −0.5), whole at 6/6",
    nodes.length === 1 && near(nodes[0].q, 2, 0.01) && near(nodes[0].r, -0.5, 0.01) && nodes[0].hp === 6 && nodes[0].maxHp === 6,
    JSON.stringify(nodes));
}
const A4 = await claim("Bulwark Four", 300); // Lv 4
const a4Tiles = seedTiles(A4.ownerKey);
await prime(A4.ownerKey, A4.token);
{
  const { res } = await castUntilStands(A4.token, "bulwark", { tileId: a4Tiles.get("2,0"), dir: 0 });
  const nodes = nodesOf(bulwarkRow(A4.ownerKey));
  ok("Lv 4 raises exactly 2 shields, of 7 HP each (the table at Lv 4)",
    res.shields === 2 && res.shieldHp === 7 && nodes.length === 2 && nodes.every((n) => n.hp === 7 && n.maxHp === 7),
    JSON.stringify({ res, nodes }));
  ok("the two shields spread along the edge's own line at the Rock Wall's spacing (0.55): (2±0.275, −0.5)",
    nodes.length === 2 && nodes.some((n) => near(n.q, 1.725, 0.01) && near(n.r, -0.5, 0.01)) && nodes.some((n) => near(n.q, 2.275, 0.01) && near(n.r, -0.5, 0.01)),
    JSON.stringify(nodes));
}
const B = await claim("Bulwark High", 3800); // Lv 10
const bTiles = seedTiles(B.ownerKey);
await prime(B.ownerKey, B.token);
{
  const { res } = await castUntilStands(B.token, "bulwark", { tileId: bTiles.get("3,0"), dir: 5 });
  ok("a HIGH cast (Lv 10) raises 5 shields, of 10 HP each (the table's top)",
    res.shields === 5 && res.shieldHp === 10, JSON.stringify(res));
  const st = await call("getTerritory", {}, B.token);
  const served = (st.defenceWorks ?? []).find((w) => w.kind === "bulwark");
  ok("the line is SERVED in the territory state the client draws (5 shields, whole)",
    !!served && served.nodes.length === 5 && served.nodes.every((n) => n.hp === 10 && n.maxHp === 10),
    JSON.stringify(served));
}
const C14 = await claim("Bulwark Cap", 9100); // Lv 14
const cTiles = seedTiles(C14.ownerKey);
await prime(C14.ownerKey, C14.token);
{
  const { res } = await castUntilStands(C14.token, "bulwark", { tileId: cTiles.get("2,0"), dir: 0 });
  const nodes = nodesOf(bulwarkRow(C14.ownerKey));
  ok("Lv 14 raises 6 shields — the rock-wall cap binds (uncapped, ⌊14/2⌋ would be 7), each 10 HP",
    res.shields === 6 && nodes.length === 6 && nodes.every((n) => n.hp === 10), JSON.stringify({ shields: res.shields, nodes: nodes.length }));
}

/* ══ §B THE HOMELAND BATTLE — THE LINE HOLDS ══════════════ */
console.log("§B the homeland battle — the dark meets the line, hacks it, and is shoved back; the control crosses");
{
  // B's line stands at (2.5, 0) across the road from (4,0)
  // to a fighter at (1,0) whose own strike clock is held a
  // minute out — in this window only the line can answer.
  const fighter = seedAwokin(B.ownerKey, "Bulwark High", "Line Guard", "tide", 3, 3);
  const fPl = placeAwokin(B.ownerKey, fighter, bTiles.get("1,0"), 1, 0, { hp: 9999, stance: "attack", ordered: true });
  db.prepare("UPDATE field_placements SET battle_next_at = ? WHERE id = ?").run(Date.now() + 600000, fPl);
  const foe = seedDark(B.ownerKey, bTiles.get("4,0"), "fray", 4, 0, { hp: 500, power: 1 });
  await advance(B.ownerKey, B.token, 20000);
  const row = bulwarkRow(B.ownerKey);
  const nodes = nodesOf(row);
  const centre = nodes.reduce((a, n) => (Math.abs(n.r) < Math.abs(a.r) ? n : a), nodes[0]);
  const foeRow = darkRow(foe);
  console.log(`  line: centre shield hp ${centre?.hp}/10; foe at q=${foeRow?.pos_q?.toFixed(2)}`);
  ok("the dark never crossed the line in 20 s (held on its own side of the centre shield's plane, q > 2.9)",
    !!foeRow && foeRow.pos_q > 2.9, `q=${foeRow?.pos_q}`);
  ok("the held dark HACKED the centre shield — its HP fell, and the shield stands yet (5–9 of 10)",
    !!centre && centre.hp <= 9 && centre.hp >= 5, `hp=${centre?.hp}`);
  ok("the dark lives — the knock back deals no harm of its own", !!foeRow, "");
}
{
  // CONTROL: the same road with no line — the dark walks
  // to its victim's bite reach, across the plane where
  // the shields stood above (q = 2.5).
  const D = await claim("Bulwark Control", 3800);
  const dTiles = seedTiles(D.ownerKey);
  await prime(D.ownerKey, D.token);
  const fighter = seedAwokin(D.ownerKey, "Bulwark Control", "Open Guard", "tide", 3, 3);
  const fPl = placeAwokin(D.ownerKey, fighter, dTiles.get("1,0"), 1, 0, { hp: 9999, stance: "attack", ordered: true });
  db.prepare("UPDATE field_placements SET battle_next_at = ? WHERE id = ?").run(Date.now() + 600000, fPl);
  const foe = seedDark(D.ownerKey, dTiles.get("4,0"), "fray", 4, 0, { hp: 500, power: 1 });
  await advance(D.ownerKey, D.token, 12000);
  const foeRow = darkRow(foe);
  console.log(`  control: foe at q=${foeRow?.pos_q?.toFixed(2)}`);
  ok("CONTROL — with no line, the same dark crossed the plane and stands at its victim's reach (q ≈ 2.35)",
    !!foeRow && foeRow.pos_q < 2.6 && foeRow.pos_q > 1.9, `q=${foeRow?.pos_q}`);
  ok("CONTROL — no Bulwark stands on the control land", !bulwarkRow(D.ownerKey), "");
}

/* ══ §C A SHIELD FALLS, THE LINE OPENS ════════════════════ */
console.log("§C the homeland — a shield at 1 HP falls to a single hit, and its striker is shoved a tile back");
{
  // A's one shield stands at (2, −0.5) with 1 HP left. A
  // Fray stands 0.6 from it on pure ground — its own tile
  // is its goal, so it does not walk; it can only strike.
  const row = bulwarkRow(A.ownerKey);
  const nodes = nodesOf(row).map((n) => ({ ...n, hp: 1 }));
  db.prepare("UPDATE defence_works SET nodes = ? WHERE id = ?").run(JSON.stringify(nodes), row.id);
  const foe = seedDark(A.ownerKey, aTiles.get("3,-1"), "fray", 2.6, -0.5, { hp: 3, power: 1 });
  const before = hexDist({ q: 2.6, r: -0.5 }, { q: 2, r: -0.5 });
  await advance(A.ownerKey, A.token, 6000);
  const foeRow = darkRow(foe);
  const after = foeRow ? hexDist({ q: foeRow.pos_q, r: foeRow.pos_r }, { q: 2, r: -0.5 }) : null;
  console.log(`  fall: striker stood ${before.toFixed(2)} from the shield, now ${after?.toFixed(2)}; hp ${foeRow?.hp}`);
  ok("the struck shield FELL at 0 HP — with its one shield gone, the whole line is lifted from the land",
    !bulwarkRow(A.ownerKey), JSON.stringify(bulwarkRow(A.ownerKey)));
  ok("the striker was KNOCKED BACK — it stands at least 1.3 tiles from where the shield stood (it stood at 0.6)",
    after != null && after >= 1.3, `after=${after}`);
  ok("the striker lives, unharmed by the shove itself (hp > 2 of 3; the light's wither alone may nibble)",
    !!foeRow && foeRow.hp > 2, `hp=${foeRow?.hp}`);
}

/* ══ §D CONTROLS — THE SEAL AND THE ROCK WALL, UNCHANGED ══ */
console.log("§D controls — another ward and the Rock Wall behave exactly as they did");
{
  const { res } = await castUntilStands(A.token, "seal", { tileId: aTiles.get("1,1"), dir: 0 });
  const seal = db.prepare("SELECT * FROM territory_workings WHERE owner_key = ? AND engine = 'seal'").get(A.ownerKey);
  ok("the Seal still casts at 3 energy through the same door", res.cost === 3, JSON.stringify(res));
  ok("the Seal's HP is unchanged: 9 at Lv 3 (book base 6 + 1 per Tender level + 0 slots)",
    !!seal && Number(seal.hp) === 9, JSON.stringify(seal && { hp: seal.hp }));
}
{
  const E = await claim("Bulwark Wall Control", 3800);
  const eTiles = new Map();
  for (const [q, r, cursed] of [[0, 0, 0], [2, 0, 0], [3, 0, 1], [4, 0, 1]]) {
    eTiles.set(`${q},${r}`, Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', ?, ?)")
      .run(E.ownerKey, q, r, cursed, Date.now()).lastInsertRowid));
  }
  await prime(E.ownerKey, E.token);
  const stone = seedAwokin(E.ownerKey, "Bulwark Wall Control", "Stone Warden", "stone", 3, 40, 8100); // Awoken level 9
  const stonePl = placeAwokin(E.ownerKey, stone, eTiles.get("2,0"), 2, 0, { hp: 120, stance: "defense", ordered: true });
  seedDark(E.ownerKey, eTiles.get("4,0"), "fray", 4, 0, { hp: 500, power: 1 });
  await advance(E.ownerKey, E.token, 3000);
  const wall = db.prepare("SELECT * FROM defence_works WHERE owner_key = ? AND kind = 'rockwall' AND placement_id = ?").get(E.ownerKey, stonePl);
  const nodes = nodesOf(wall);
  ok("the Rock Wall is unchanged: a level-9 Stone defender raises 6 rocks, each of 10 HP off the same table",
    nodes.length === 6 && nodes.every((n) => n.maxHp === 10), JSON.stringify(nodes.map((n) => n.maxHp)));
}

/* ══ §E THE TABLE ═════════════════════════════════════════ */
console.log("§E the Table — Bulwark casts through castWard, and the line fights there");
const { issueTableToken } = await import("../server/dist/table.js");
const part = (name, category, power, toughness) => Number(db.prepare(
  "INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, 'sky', ?, 'image/png', ?)")
  .run(name, category, power, toughness, `bulwark/${name}.png`, Date.now()).lastInsertRowid);
const mkAwokin = (ownerKey, ownerName, name, bodyPower) => {
  const now = Date.now();
  const comp = JSON.stringify([
    { source_id: `db:${part(name + " Body", "body", bodyPower, bodyPower)}`, name: name + " Body", category: "body", rarity: "common", power: bodyPower, toughness: bodyPower, element: "sky" },
    { source_id: `db:${part(name + " Arms", "arms", 0, 0)}`, name: name + " Arms", category: "arms", rarity: "common", power: 0, toughness: 0, element: "sky" },
    { source_id: `db:${part(name + " Head", "head", 0, 0)}`, name: name + " Head", category: "head", rarity: "common", power: 0, toughness: 0, element: "sky" },
  ]);
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, "bulwark/awokin.png", comp, ownerName, ownerKey, now).lastInsertRowid);
};
async function mkTableTender(name, exp, discId) {
  const t = await claim(name, exp, "warden");
  for (let i = 0; i < 30; i++) mkAwokin(t.ownerKey, name, `${name} Bench ${i + 1}`, 2);
  const tt = issueTableToken({ id: discId, name });
  const bindCode = (await call("getTableBindCode", {}, t.token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
  if (!bindRes.ok) throw new Error("table/bind failed for " + name + ": " + bindRes.status);
  return { ...t, tt };
}
class Actor {
  constructor() { this.state = null; this.you = null; this.errors = []; }
  async join(token, room) {
    this.ws = new WebSocket(`ws://127.0.0.1:3996/table/ws`);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data));
        if (m.type === "state") { this.state = m.state; this.you = m.you; }
        else if (m.type === "error") this.errors.push(String(m.message ?? ""));
      } catch { /* torn frame */ }
    };
    this.send({ type: "join", authToken: token, room });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
}
const waitFor = async (fn, what, ms = 20000) => {
  const s = Date.now();
  while (Date.now() - s < ms) { if (fn()) return true; await sleep(150); }
  throw new Error("drive wait: " + what);
};
const DIRS6 = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const parseHex = (id) => { const [q, r] = String(id).split(",").map(Number); return { q, r }; };
const hexId = (q, r) => `${q},${r}`;
function neighbourToward(state, fromId, toId) {
  const from = parseHex(fromId), to = parseHex(toId);
  const ids = new Set((state?.map ?? []).map((t) => t.id));
  let best = null, bestD = Infinity;
  for (const [dq, dr] of DIRS6) {
    const id = hexId(from.q + dq, from.r + dr);
    if (!ids.has(id)) continue;
    const d = hexDist(parseHex(id), to);
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}
const myPlayer = (actor, name) => (actor.state?.players ?? []).find((p) => p.name === name);
const bulwarkWorking = (actor) => (actor.state?.workings ?? []).find((w) => w.engine === "bulwark");
async function castBulwarkTable(actor, name, hexA, hexB, tries = 16) {
  let attempts = 0;
  const e0 = myPlayer(actor, name)?.energy;
  for (let i = 0; i < tries; i++) {
    attempts++;
    actor.send({ type: "castWard", root: "bulwark", hexA, hexB });
    try { await waitFor(() => !!bulwarkWorking(actor), "bulwark stands at the Table", 1500); return { attempts, stood: true, e0 }; }
    catch { /* a fizzle is an honest face — cast again */ }
  }
  return { attempts, stood: false, e0 };
}
{
  const W = await mkTableTender("Bulwark Table High", 3800, "disc-bulwark-w10");
  const a = new Actor();
  await a.join(W.tt, "bulwark-cast");
  await waitFor(() => !!myPlayer(a, W.name)?.hex, "the Lv 10 seat stands");
  const myHex = myPlayer(a, W.name).hex;
  const hexB = neighbourToward(a.state, myHex, "0,0") ?? neighbourToward(a.state, myHex, myHex);
  const { attempts, stood, e0 } = await castBulwarkTable(a, W.name, myHex, hexB);
  const w = bulwarkWorking(a);
  const e1 = myPlayer(a, W.name)?.energy;
  ok("the Table cast stands a Bulwark through the ward door (castWard)", stood && !!w, `errors=${JSON.stringify(a.errors.slice(-2))}`);
  ok("at Lv 10 the Table line is 5 shields of 10 HP, the working's total 50 — the same reckoning as the homeland",
    !!w && (w.shields ?? []).length === 5 && w.shields.every((s) => s.hp === 10 && s.maxHp === 10) && w.hp === 50,
    JSON.stringify(w && { n: (w.shields ?? []).length, hp: w.hp }));
  ok("the Table price is the ward's 8 energy an attempt — fizzle and standing alike",
    e0 != null && e1 != null && e0 - e1 === 8 * attempts, `delta=${e0 - e1} attempts=${attempts}`);
  a.ws.close();
}
{
  const W3 = await mkTableTender("Bulwark Table Low", 150, "disc-bulwark-w3");
  const a = new Actor();
  await a.join(W3.tt, "bulwark-cast-low");
  await waitFor(() => !!myPlayer(a, W3.name)?.hex, "the Lv 3 seat stands");
  const myHex = myPlayer(a, W3.name).hex;
  const hexB = neighbourToward(a.state, myHex, "0,0") ?? neighbourToward(a.state, myHex, myHex);
  const { stood } = await castBulwarkTable(a, W3.name, myHex, hexB);
  const w = bulwarkWorking(a);
  ok("a LOW Table cast (Lv 3) raises exactly 1 shield of 6 HP — the cast level's count, on this ground too",
    stood && !!w && (w.shields ?? []).length === 1 && w.shields[0].hp === 6 && w.hp === 6,
    JSON.stringify(w && { n: (w.shields ?? []).length, hp: w.hp }));
  a.ws.close();
}
{
  const WB = await mkTableTender("Bulwark Table Battle", 3800, "disc-bulwark-wb");
  const a = new Actor();
  await a.join(WB.tt, "bulwark-battle");
  await waitFor(() => !!myPlayer(a, WB.name)?.hex, "the battle seat stands");
  const darkOf = () => a.state?.dark ?? [];
  const taleHas = (re) => (a.state?.tale ?? []).some((t) => re.test(typeof t === "string" ? t : t?.text ?? ""));
  let wave = false;
  for (let i = 0; i < 3 && !wave; i++) {
    a.send({ type: "startWave" });
    try { await waitFor(() => a.state?.battle?.active && darkOf().length > 0, "the wave is dealt", 8000); wave = true; }
    catch { a.send({ type: "begin" }); try { await waitFor(() => a.state?.battle?.active && darkOf().length > 0, "the wave is dealt (begin)", 20000); wave = true; } catch { /* try again */ } }
  }
  ok("the battle wave is dealt", wave && darkOf().length > 0, `dark=${darkOf().length}`);
  // Aim the line at a standing dark: its own hex the
  // anchor, the neighbour toward the seed its facing —
  // the shields rise across the road it must walk.
  const target = darkOf()[0];
  const hexB = neighbourToward(a.state, target.hex, "0,0");
  const { stood } = await castBulwarkTable(a, WB.name, target.hex, hexB, 20);
  ok("the battle cast stands its line across the dark's road", stood && !!bulwarkWorking(a), `errors=${JSON.stringify(a.errors.slice(-2))}`);
  // Sample the fight: a shield's HP falls (a hit landed),
  // the striker jumps back at the hit (the knock back,
  // seen as a sudden growth in its distance from the
  // shield it struck), and a shield falls out of the line.
  const shieldKey = (s) => `${Math.round(s.x)},${Math.round(s.y)}`;
  let prev = null; // { shields: Map<key, hp>, dark: Map<id, {x,y}> }
  let hitSeen = false, shoveSeen = false, fallSeen = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 150000 && !(hitSeen && shoveSeen && fallSeen)) {
    await sleep(250);
    const w = bulwarkWorking(a);
    const shields = new Map((w?.shields ?? []).map((s) => [shieldKey(s), s]));
    const dark = new Map(darkOf().map((d) => [d.id, d]));
    if (prev) {
      for (const [key, s] of shields) {
        const before = prev.shields.get(key);
        if (before && s.hp < before.hp) {
          hitSeen = true;
          // The striker: the dark nearest this shield now —
          // compare where it stood at the last sample.
          let bestId = null, bestD = Infinity;
          for (const [id, d] of dark) { const dd = Math.hypot(d.pos.x - s.x, d.pos.y - s.y); if (dd < bestD) { bestD = dd; bestId = id; } }
          const pd = bestId ? prev.dark.get(bestId) : null;
          if (pd && Math.hypot(pd.pos.x - s.x, pd.pos.y - s.y) < bestD - 30) shoveSeen = true;
        }
      }
      for (const key of prev.shields.keys()) if (!shields.has(key)) fallSeen = true;
      if (!w && prev.shields.size > 0) fallSeen = true;
    }
    prev = { shields, dark };
  }
  ok("a dark HIT a shield at the Table — the shield's HP fell under the blow", hitSeen, `tale=${JSON.stringify((a.state?.tale ?? []).slice(-3))}`);
  ok("the striker was KNOCKED BACK — its distance from the shield it struck jumped by more than 30px at the hit", shoveSeen, "");
  ok("a shield FELL at 0 HP and the line opened there (a shield gone from the working)", fallSeen, `shields=${(bulwarkWorking(a)?.shields ?? []).length}`);
  ok("the tale names the Bulwark's work", taleHas(/Bulwark/), "");
  a.ws.close();
}

console.log(`\nBULWARK DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
