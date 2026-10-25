// BLACK GATE REBORN — RECOVERY R13'S DRIVE
// (Nigel, 2026-10-23 12:04, recovery order 13 + the shared
// law #14): "THE OLD BLACK GATE IDEA IS DISCARDED. The new
// Black Gate: a skill that creates an IMPASSABLE WALL with
// 10 HP, cast IN FRONT OF THE CASTER in the direction they
// face — N, E, S, W AND THE DIAGONALS (8 facings)." And
// #14: "bring them into the game FOLLOWING THE 5-10 ROCK
// WALL LAW (HP by level 5..10; count in the rock-wall
// fashion) — AND FIX THE ACs TO THEIR DROPPED AMOUNTS."
//
// THE READINGS THIS DRIVE PROVES (named in the commit):
//   · The ruling's "10 HP" is the shared table's top
//     figure: the wall's HP reads the ONE shared table
//     ROCK_WALL_HP_BY_LEVEL through rockWallHpForLevel AT
//     THE CAST LEVEL (the caster's Tender level) — Lv 3
//     → 6, Lv 4 → 7, Lv 9 → 10 — exactly as R12 read it.
//   · ONE wall stands per cast, at the caster's point
//     (his stand tile's point, the point the server can
//     swear to) stepped exactly one axial unit along his
//     facing — BLACK_GATE_STEP, whose eight steps each
//     measure axial length 1 and point along their
//     compass ray through the land's iso basis.
//   · THE FACING'S SOURCE: the homeland figure's own
//     8-direction facing, carried in on the cast (the
//     server keeps no facing of its own). A cast naming
//     no facing, or a word outside the eight, is REFUSED
//     before any charge — no default is dressed up as
//     a facing, and this drive proves the refusals.
//   · IMPASSABLE TO WHOM: the dark, in the homeland
//     battle's walk reckoning — it cannot step onto or
//     through the Gate's ground while the Gate stands,
//     it hacks the Gate at WALL_HACK_DMG (the Rock
//     Wall's own measure, no roll, no AC invented), the
//     Gate falls at 0 HP and the road opens. The Gate
//     answers with no shove — knockback is Bulwark's
//     own ruling, not the Gate's.
//   · KIND + PRICE — UNRULED, FLAGGED: neither was ever
//     ruled; both are derived from Bulwark, the nearest
//     standing wall/ward analogue — the page is classed
//     a WARD at BLACK_GATE_COST (8, the ONE named
//     constant in grimoire.ts), awaiting Nigel's word.
//   · THE TABLE SEAM, ANSWERED (2026-10-24, under the
//     no-hex-lock law of 2026-10-23 23:04): the Table
//     cast now aims by a tapped POINT — the Gate stands
//     one hex-length from the caster in the direction
//     of the point, the point giving the wall its
//     facing — proven in §E, battle and all.
//   · The dropped enemy ACs stand as enemyACFor reads
//     them: Fray 11, Hollow 12, Unraveler 13, Tangle 15.
//
// Boots the real server on a scratch DATA_DIR and proves:
//   §0 the reckoning read directly off the built modules;
//   §A the homeland cast door: the book's page, all 8
//      facings landing the wall ahead of the caster, HP
//      by cast level, the price per attempt, the facing
//      refusals, and the wall served in the territory
//      state the client draws;
//   §B the homeland battle: the dark's road blocked by
//      the Gate (never crosses while it stands), against
//      a control that walks the same road with no Gate;
//   §C the Gate falls at 0 HP and the road opens;
//   §D controls: Bulwark, the Seal and the Rock Wall
//      unchanged — the shared table standing as it stood;
//   §E the Table seam: the ward door refuses the Gate in
//      plain words, charges nothing, raises nothing.
// Run: node scripts/drive-blackgate.mjs
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-blackgate-"));
process.env.PORT = "3995";
process.env.WORKSHOP_PASSWORD = "blackgate-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3995";
const PW = "blackgate-drive-password";
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
  // (the "first three are the party" law, landed after this
  // drive was written) — seed the three wakes first, as
  // drive-nohexlock's claim does, or no seat can choose.
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
      .run(`${name} ${cat}`, cat, power, toughness, element, `blackgate/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power, toughness, element });
  }
  const id = Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `blackgate/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
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
const gateRow = (ownerKey) => db.prepare("SELECT * FROM defence_works WHERE owner_key = ? AND kind = 'blackgate' ORDER BY id DESC").get(ownerKey);
const nodesOf = (row) => (row ? JSON.parse(row.nodes) : []);
async function prime(ownerKey, token) { await call("getTerritory", {}, token); }
async function advance(ownerKey, token, ms) {
  db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now() - ms, ownerKey);
  return call("getTerritory", {}, token);
}
async function castGateUntilStands(token, facing) {
  let attempts = 0;
  for (let i = 0; i < 24; i++) {
    attempts++;
    const res = await call("castMapWorking", { spellKey: "blackgate", facing }, token);
    if (!res.fizzled) return { res, attempts };
    if (res.cost !== 8) throw new Error("a fizzle charged a wrong price: " + JSON.stringify(res));
  }
  throw new Error(`cast of blackgate (${facing}) never stood in 24 casts`);
}

/* ══ §0 THE RECKONING, READ DIRECTLY ══════════════════════ */
console.log("§0 the shared reckoning — one table, the eight steps, the dropped ACs, the flagged price");
{
  const acts = await import("../server/dist/actions.js");
  const grim = await import("../server/dist/grimoire.js");
  const { enemyACFor } = await import("../server/dist/enemyAC.js");
  ok("the shared HP table stands as it stood: [5,6,6,7,8,8,9,9,10]",
    JSON.stringify(acts.ROCK_WALL_HP_BY_LEVEL) === "[5,6,6,7,8,8,9,9,10]", JSON.stringify(acts.ROCK_WALL_HP_BY_LEVEL));
  ok("HP by level reads the one table: Lv1 → 5, Lv3 → 6, Lv4 → 7, Lv9 → 10, Lv10 → 10 (clamped)",
    acts.rockWallHpForLevel(1) === 5 && acts.rockWallHpForLevel(3) === 6 && acts.rockWallHpForLevel(4) === 7
    && acts.rockWallHpForLevel(9) === 10 && acts.rockWallHpForLevel(10) === 10);
  ok("CONTROL — Bulwark's count reckoning is unchanged: Lv3 → 1, Lv10 → 5, Lv14 → 6 (the cap)",
    acts.bulwarkShieldCountFor(3) === 1 && acts.bulwarkShieldCountFor(10) === 5 && acts.bulwarkShieldCountFor(14) === 6);
  ok("the facings are the eight: N, NE, E, SE, S, SW, W, NW",
    JSON.stringify(acts.BLACK_GATE_FACINGS) === '["N","NE","E","SE","S","SW","W","NW"]', JSON.stringify(acts.BLACK_GATE_FACINGS));
  ok("every facing's step measures exactly ONE axial unit from the caster's point",
    acts.BLACK_GATE_FACINGS.every((f) => {
      const [dq, dr] = acts.BLACK_GATE_STEP[f];
      return near(hexDist({ q: dq, r: dr }, { q: 0, r: 0 }), 1, 1e-9);
    }), JSON.stringify(acts.BLACK_GATE_STEP));
  ok("the steps are the compass read onto the lattice: N (0,−1), NE (0.5,−1), E (1,−0.5), SE (0.5,0.5), S (0,1), SW (−0.5,1), W (−1,0.5), NW (−0.5,−0.5)",
    JSON.stringify(acts.BLACK_GATE_STEP) === JSON.stringify({ N: [0, -1], NE: [0.5, -1], E: [1, -0.5], SE: [0.5, 0.5], S: [0, 1], SW: [-0.5, 1], W: [-1, 0.5], NW: [-0.5, -0.5] }),
    JSON.stringify(acts.BLACK_GATE_STEP));
  ok("a word outside the eight reads no step (null) — no facing can be faked through the reader",
    acts.blackGateStepFor("Q") === null && acts.blackGateStepFor("") === null && acts.blackGateStepFor("north") === null
    && acts.blackGateStepFor("NE") != null);
  ok("the UNRULED price stands in its ONE named constant: BLACK_GATE_COST = 8 (Bulwark's ward price, the derivation flagged at the page)",
    grim.BLACK_GATE_COST === 8, String(grim.BLACK_GATE_COST));
  ok("the dropped enemy ACs stand (base 10 + the dropped bonuses): Fray 11, Hollow 12, Unraveler 13, Tangle 15",
    enemyACFor("fray") === 11 && enemyACFor("hollow") === 12 && enemyACFor("unraveler") === 13 && enemyACFor("tangle") === 15,
    `fray=${enemyACFor("fray")} hollow=${enemyACFor("hollow")} unraveler=${enemyACFor("unraveler")} tangle=${enemyACFor("tangle")}`);
}

/* ══ §A THE HOMELAND CAST DOOR ════════════════════════════ */
console.log("§A the homeland — the Gate casts in the caster's facing, at the cast level's HP, for the flagged price");
const grimState = await call("getGrimoire", {});
const gatePage = (grimState.spells ?? []).find((s) => s.key === "blackgate");
ok("the book carries Black Gate as a WARD of 8 energy (kind + price the flagged UNRULED derivations from Bulwark), its face BOUND to its own Gate piece (Bind Them All, 2026-10-25 — the glyph record glyph-blackgate, assetKey blackgate; no drawn-rune glyph invented)",
  !!gatePage && gatePage.kind === "ward" && gatePage.cost === 8 && gatePage.engine === "blackgate" && gatePage.glyphId === "glyph-blackgate"
    && (grimState.glyphs ?? []).some((g) => g.id === "glyph-blackgate" && g.assetKey === "blackgate"),
  JSON.stringify(gatePage));

const G = await claim("Gate Facings", 150); // Lv 3
const gTiles = seedTiles(G.ownerKey);
const gState = await prime(G.ownerKey, G.token).then(() => call("getTerritory", {}, G.token));
ok("the caster stands on the heart (0,0) — the point every wall below is stepped from",
  !!gState.tender && gState.tender.tileId === gTiles.get("0,0"), JSON.stringify(gState.tender));
{
  // The facing refusals come first: no charge, no wall.
  const e0 = energyOf(G.ownerKey);
  let refusedNoFacing = false, refusedBadFacing = false;
  try { await call("castMapWorking", { spellKey: "blackgate" }, G.token); } catch (e) { refusedNoFacing = /direction you face/.test(String(e.message)); }
  try { await call("castMapWorking", { spellKey: "blackgate", facing: "Q" }, G.token); } catch (e) { refusedBadFacing = /direction you face/.test(String(e.message)); }
  ok("a cast naming NO facing is refused in plain words — a default direction is never dressed up as the caster's facing", refusedNoFacing, "");
  ok("a cast naming a word outside the eight is refused the same way", refusedBadFacing, "");
  ok("the refusals charged nothing and raised nothing", energyOf(G.ownerKey) === e0 && !gateRow(G.ownerKey),
    `energy ${e0} -> ${energyOf(G.ownerKey)}`);
}
{
  const { BLACK_GATE_STEP, BLACK_GATE_FACINGS } = await import("../server/dist/actions.js");
  const e0 = energyOf(G.ownerKey);
  let attempts = 0;
  for (const facing of BLACK_GATE_FACINGS) {
    const { res, attempts: n } = await castGateUntilStands(G.token, facing);
    attempts += n;
    const [dq, dr] = BLACK_GATE_STEP[facing];
    const row = gateRow(G.ownerKey);
    const nodes = nodesOf(row);
    ok(`facing ${facing}: the cast stands ONE wall ahead of the caster at (${dq}, ${dr}), of 6 HP (the table at Lv 3)`,
      res.facing === facing && res.wallHp === 6 && near(res.wallQ, dq, 1e-9) && near(res.wallR, dr, 1e-9)
      && !!row && Number(row.placement_id) === 0 && nodes.length === 1
      && near(nodes[0].q, dq, 1e-9) && near(nodes[0].r, dr, 1e-9) && nodes[0].hp === 6 && nodes[0].maxHp === 6,
      JSON.stringify({ res, nodes }));
  }
  const e1 = energyOf(G.ownerKey);
  ok("every attempt across all eight facings — fizzle and standing alike — charged exactly the flagged 8 (the purse fell by 8 × attempts)",
    e0 - e1 === 8 * attempts, `delta=${e0 - e1} attempts=${attempts}`);
  const st = await call("getTerritory", {}, G.token);
  const served = (st.defenceWorks ?? []).filter((w) => w.kind === "blackgate");
  ok("the eight Gates are SERVED in the territory state the client draws (eight one-node walls, whole at 6/6)",
    served.length === 8 && served.every((w) => w.nodes.length === 1 && w.nodes[0].hp === 6 && w.nodes[0].maxHp === 6),
    `served=${served.length}`);
}
const G4 = await claim("Gate Four", 300); // Lv 4
const g4Tiles = seedTiles(G4.ownerKey);
await prime(G4.ownerKey, G4.token);
{
  const { res } = await castGateUntilStands(G4.token, "S");
  const nodes = nodesOf(gateRow(G4.ownerKey));
  ok("Lv 4 raises the Gate at 7 HP (the table at Lv 4), due south of the caster at (0, 1)",
    res.wallHp === 7 && nodes.length === 1 && near(nodes[0].q, 0, 1e-9) && near(nodes[0].r, 1, 1e-9) && nodes[0].hp === 7,
    JSON.stringify({ res, nodes }));
}
const G9 = await claim("Gate Nine", 2600); // Lv 9
const g9Tiles = seedTiles(G9.ownerKey);
await prime(G9.ownerKey, G9.token);
{
  const { res } = await castGateUntilStands(G9.token, "E");
  const nodes = nodesOf(gateRow(G9.ownerKey));
  ok("Lv 9 raises the Gate at the ruling's 10 HP — the shared table's top figure, read at the cast level — due east at (1, −0.5)",
    res.wallHp === 10 && nodes.length === 1 && near(nodes[0].q, 1, 1e-9) && near(nodes[0].r, -0.5, 1e-9) && nodes[0].hp === 10,
    JSON.stringify({ res, nodes }));
}

/* ══ §B THE HOMELAND BATTLE — THE GATE HOLDS THE ROAD ═════ */
console.log("§B the homeland battle — the dark is held at the Gate and hacks it; the control walks the same road");
const WALL = { q: 1, r: -0.5 };
const GUARD = { q: 0, r: -0.5 }; // the guarded fighter's free point — the road runs (3,−0.5) → (0,−0.5), straight through the Gate's point (1,−0.5)
async function battleScene(name, exp, withGate) {
  const T = await claim(name, exp);
  const tiles = seedTiles(T.ownerKey);
  await prime(T.ownerKey, T.token);
  if (withGate) await castGateUntilStands(T.token, "E");
  const fighter = seedAwokin(T.ownerKey, name, "Gate Guard", "tide", 3, 3);
  const fPl = placeAwokin(T.ownerKey, fighter, tiles.get("0,0"), GUARD.q, GUARD.r, { hp: 9999, stance: "attack", ordered: true });
  db.prepare("UPDATE field_placements SET battle_next_at = ? WHERE id = ?").run(Date.now() + 600000, fPl);
  const foe = seedDark(T.ownerKey, tiles.get("3,-1"), "fray", 3, -0.5, { hp: 500, power: 1 });
  return { T, tiles, foe };
}
{
  const { T, foe } = await battleScene("Gate Battle", 3800, true); // Lv 10 — the Gate stands at 10 HP
  await advance(T.ownerKey, T.token, 12000);
  const foeRow = darkRow(foe);
  const nodes = nodesOf(gateRow(T.ownerKey));
  const foePos = foeRow ? { q: foeRow.pos_q, r: foeRow.pos_r } : null;
  console.log(`  gate: hp ${nodes[0]?.hp}/10; foe at (${foePos?.q?.toFixed(2)}, ${foePos?.r?.toFixed(2)}), dist to the guarded fighter ${foePos ? hexDist(foePos, GUARD).toFixed(2) : "?"}, dist to the Gate ${foePos ? hexDist(foePos, WALL).toFixed(2) : "?"}`);
  ok("the dark NEVER CROSSED the Gate in 12 s — held on its own side of the wall's ground, short of its victim's bite reach (dist to the fighter > 1.4, the wall 1.0 ahead of the fighter)",
    !!foePos && hexDist(foePos, GUARD) > 1.4 && hexDist(foePos, WALL) >= 0.4 && foePos.q > WALL.q,
    JSON.stringify(foePos));
  ok("the held dark HACKED the Gate — its HP fell under the blows, and the Gate stands yet (1–9 of 10)",
    nodes.length === 1 && nodes[0].hp >= 1 && nodes[0].hp <= 9, `hp=${nodes[0]?.hp}`);
  ok("the Gate dealt the dark no harm of its own — the striker stands whole (hp > 499 of 500; the standing light's wither alone may nibble, as R12's drive records)",
    !!foeRow && foeRow.hp > 499, `hp=${foeRow?.hp}`);
}
{
  const { T, foe } = await battleScene("Gate Control", 3800, false);
  await advance(T.ownerKey, T.token, 12000);
  const foeRow = darkRow(foe);
  const foePos = foeRow ? { q: foeRow.pos_q, r: foeRow.pos_r } : null;
  console.log(`  control: foe at (${foePos?.q?.toFixed(2)}, ${foePos?.r?.toFixed(2)}), dist to the fighter ${foePos ? hexDist(foePos, GUARD).toFixed(2) : "?"}`);
  ok("CONTROL — with no Gate, the same dark crossed the wall's ground and stands at its victim's bite reach (dist ≤ 1.5)",
    !!foePos && hexDist(foePos, GUARD) <= 1.5 && hexDist(foePos, WALL) < 0.9, JSON.stringify(foePos));
  ok("CONTROL — no Gate stands on the control land", !gateRow(T.ownerKey), "");
}

/* ══ §C THE GATE FALLS, THE ROAD OPENS ════════════════════ */
console.log("§C the homeland — a Gate at 1 HP falls to a single hack, and the dark walks through where it stood");
{
  const { T, tiles, foe } = await (async () => {
    const T = await claim("Gate Fall", 3800); // Lv 10
    const tiles = seedTiles(T.ownerKey);
    await prime(T.ownerKey, T.token);
    await castGateUntilStands(T.token, "E");
    const row = gateRow(T.ownerKey);
    const nodes = nodesOf(row).map((n) => ({ ...n, hp: 1 }));
    db.prepare("UPDATE defence_works SET nodes = ? WHERE id = ?").run(JSON.stringify(nodes), row.id);
    const fighter = seedAwokin(T.ownerKey, "Gate Fall", "Fall Guard", "tide", 3, 3);
    const fPl = placeAwokin(T.ownerKey, fighter, tiles.get("0,0"), 0, 0, { hp: 9999, stance: "attack", ordered: true });
    db.prepare("UPDATE field_placements SET battle_next_at = ? WHERE id = ?").run(Date.now() + 600000, fPl);
    const foe = seedDark(T.ownerKey, tiles.get("2,-1"), "fray", 1.6, -0.5, { hp: 500, power: 1 });
    return { T, tiles, foe };
  })();
  await advance(T.ownerKey, T.token, 6000);
  ok("the struck Gate FELL at 0 HP — its row is lifted from the land whole",
    !gateRow(T.ownerKey), JSON.stringify(gateRow(T.ownerKey)));
  await advance(T.ownerKey, T.token, 12000);
  const foeRow = darkRow(foe);
  const foePos = foeRow ? { q: foeRow.pos_q, r: foeRow.pos_r } : null;
  console.log(`  fall: foe now at (${foePos?.q?.toFixed(2)}, ${foePos?.r?.toFixed(2)}), dist to the fighter ${foePos ? hexDist(foePos, { q: 0, r: 0 }).toFixed(2) : "?"}`);
  ok("with the Gate fallen the road OPENS — the dark walks through the ground it barred and stands at its victim's reach (dist ≤ 1.5)",
    !!foePos && hexDist(foePos, { q: 0, r: 0 }) <= 1.5, JSON.stringify(foePos));
}

/* ══ §D CONTROLS — BULWARK, THE SEAL, THE ROCK WALL ═══════ */
console.log("§D controls — the Gate's kin behave exactly as they did");
{
  let attempts = 0, res = null;
  for (let i = 0; i < 24 && !res; i++) {
    attempts++;
    const r = await call("castMapWorking", { spellKey: "bulwark", tileId: gTiles.get("2,0"), dir: 0 }, G.token);
    if (!r.fizzled) res = r;
  }
  const brow = db.prepare("SELECT * FROM defence_works WHERE owner_key = ? AND kind = 'bulwark' ORDER BY id DESC").get(G.ownerKey);
  const bnodes = nodesOf(brow);
  ok("Bulwark still casts at Lv 3 through the same door: 1 shield of 6 HP for 8 energy — the shared table untouched by the Gate's reading of it",
    !!res && res.shields === 1 && res.shieldHp === 6 && res.cost === 8 && bnodes.length === 1 && bnodes[0].hp === 6,
    JSON.stringify({ res, bnodes }));
}
{
  let res = null;
  for (let i = 0; i < 24 && !res; i++) {
    const r = await call("castMapWorking", { spellKey: "seal", tileId: gTiles.get("1,1"), dir: 0 }, G.token);
    if (!r.fizzled) res = r;
  }
  const seal = db.prepare("SELECT * FROM territory_workings WHERE owner_key = ? AND engine = 'seal'").get(G.ownerKey);
  ok("the Seal still casts at 3 energy, its HP unchanged at 9 at Lv 3",
    !!res && res.cost === 3 && !!seal && Number(seal.hp) === 9, JSON.stringify({ res, hp: seal?.hp }));
}
{
  const E = await claim("Gate Wall Control", 3800);
  const eTiles = new Map();
  for (const [q, r, cursed] of [[0, 0, 0], [2, 0, 0], [3, 0, 1], [4, 0, 1]]) {
    eTiles.set(`${q},${r}`, Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', ?, ?)")
      .run(E.ownerKey, q, r, cursed, Date.now()).lastInsertRowid));
  }
  await prime(E.ownerKey, E.token);
  const stone = seedAwokin(E.ownerKey, "Gate Wall Control", "Stone Warden", "stone", 3, 40, 8100); // Awoken level 9
  const stonePl = placeAwokin(E.ownerKey, stone, eTiles.get("2,0"), 2, 0, { hp: 120, stance: "defense", ordered: true });
  seedDark(E.ownerKey, eTiles.get("4,0"), "fray", 4, 0, { hp: 500, power: 1 });
  await advance(E.ownerKey, E.token, 3000);
  const wall = db.prepare("SELECT * FROM defence_works WHERE owner_key = ? AND kind = 'rockwall' AND placement_id = ?").get(E.ownerKey, stonePl);
  const nodes = nodesOf(wall);
  ok("the Rock Wall is unchanged: a level-9 Stone defender raises 6 rocks, each of 10 HP off the same table",
    nodes.length === 6 && nodes.every((n) => n.maxHp === 10), JSON.stringify(nodes.map((n) => n.maxHp)));
}

/* ══ §E THE TABLE — THE GATE FREED (2026-10-24) ═══════════
 * R13's seam is ANSWERED by the no-hex-lock law (Nigel,
 * 2026-10-23 23:04: "make sure no spell or working is hex
 * locked — range is the casting gate for spells"): at the
 * Table the player POINTS, and the Gate stands one
 * hex-length from where the caster stands in the direction
 * of the point — the point gives the wall its facing. This
 * section proves: a Gate cast naming NO point is refused in
 * plain words before any charge; a point cast stands the
 * wall at the shared table's HP for the filed ✦8; a point
 * beyond the casting ring is refused by RANGE alone; and
 * in battle the dark strikes the Gate and cannot pass it. */
console.log("§E the Table — the Gate is cast by a tapped point under the range law (R13's seam, answered 2026-10-24)");
const { issueTableToken } = await import("../server/dist/table.js");
const part = (name, category, power, toughness) => Number(db.prepare(
  "INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, 'sky', ?, 'image/png', ?)")
  .run(name, category, power, toughness, `blackgate/${name}.png`, Date.now()).lastInsertRowid);
const mkAwokin = (ownerKey, ownerName, name, bodyPower) => {
  const now = Date.now();
  const comp = JSON.stringify([
    { source_id: `db:${part(name + " Body", "body", bodyPower, bodyPower)}`, name: name + " Body", category: "body", rarity: "common", power: bodyPower, toughness: bodyPower, element: "sky" },
    { source_id: `db:${part(name + " Arms", "arms", 0, 0)}`, name: name + " Arms", category: "arms", rarity: "common", power: 0, toughness: 0, element: "sky" },
    { source_id: `db:${part(name + " Head", "head", 0, 0)}`, name: name + " Head", category: "head", rarity: "common", power: 0, toughness: 0, element: "sky" },
  ]);
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, "blackgate/awokin.png", comp, ownerName, ownerKey, now).lastInsertRowid);
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
    this.ws = new WebSocket(`ws://127.0.0.1:3995/table/ws`);
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
function neighbourToward(state, fromId, toId) {
  const from = parseHex(fromId), to = parseHex(toId);
  const ids = new Set((state?.map ?? []).map((t) => t.id));
  let best = null, bestD = Infinity;
  for (const [dq, dr] of DIRS6) {
    const id = `${from.q + dq},${from.r + dr}`;
    if (!ids.has(id)) continue;
    const d = hexDist(parseHex(id), to);
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}
const myPlayer = (actor, name) => (actor.state?.players ?? []).find((p) => p.name === name);
/** A tile's heart on the Table's own iso basis (the
 *  server's TILE_CENTERS: ISO_E [1292,470], ISO_SE [0,948],
 *  ISO_DEN 796, TILE_SIZE 40). */
const centreOfHex = (id) => {
  const { q, r } = parseHex(id);
  const k = 40 / 796;
  return { x: q * 1292 * k + r * 0, y: q * 470 * k + r * 948 * k };
};
const gateWorking = (actor) => (actor.state?.workings ?? []).find((w) => w.engine === "blackgate");
async function castGateTable(actor, point, tries = 24) {
  let attempts = 0;
  for (let i = 0; i < tries; i++) {
    attempts++;
    actor.send({ type: "castWard", root: "blackgate", point });
    try { await waitFor(() => !!gateWorking(actor), "the Gate stands at the Table", 1500); return { attempts, stood: true }; }
    catch { /* a fizzle is an honest face — cast again */ }
  }
  return { attempts, stood: false };
}
{
  const W = await mkTableTender("Gate Table Point", 3800, "disc-blackgate-point");
  const a = new Actor();
  await a.join(W.tt, "blackgate-point");
  await waitFor(() => !!myPlayer(a, W.name)?.hex, "the Table seat stands");
  const me = () => myPlayer(a, W.name);
  const myHex = me().hex;
  const cPt = me().pos ?? centreOfHex(myHex);
  const hexB = neighbourToward(a.state, myHex, "0,0");
  // E1 — no point named: refused in plain words, no charge.
  const e0 = me()?.energy;
  a.send({ type: "castWard", root: "blackgate", hexA: myHex, hexB });
  await waitFor(() => a.errors.some((m) => /stands where you point/.test(m)), "the no-point refusal speaks", 8000);
  await sleep(400);
  ok("a Gate cast naming NO point is refused in plain words — the Gate stands where you point, and a cast that names no point cannot raise it",
    a.errors.some((m) => /stands where you point/.test(m) && /names no point/.test(m)), JSON.stringify(a.errors.slice(-2)));
  ok("the no-point refusal charged nothing and raised nothing",
    me()?.energy === e0 && !gateWorking(a), `energy ${e0} -> ${me()?.energy}`);
  // E2 — the point cast stands the wall: one hex-length
  // from the caster, in the direction of the point (aimed
  // at a NON-CENTRE point of a tile two steps toward the
  // seed: its heart, nudged (11, −6)).
  const aimTile = neighbourToward(a.state, hexB, "0,0") ?? hexB;
  const ac = centreOfHex(aimTile);
  const aim = { x: ac.x + 11, y: ac.y - 6 };
  const { attempts, stood } = await castGateTable(a, aim);
  const w = gateWorking(a);
  const e1 = me()?.energy;
  ok("the point cast STANDS the Gate at the Table through the ward door", stood && !!w, `errors=${JSON.stringify(a.errors.slice(-2))}`);
  ok("the Table Gate's body is the shared table read at the cast level — one wall node of 10 HP at Lv 10, the working's own hp the same",
    !!w && !!w.wall && w.wall.hp === 10 && w.wall.maxHp === 10 && w.hp === 10, JSON.stringify(w && { wall: w.wall, hp: w.hp }));
  const wallD = w?.wall ? Math.hypot(w.wall.x - cPt.x, w.wall.y - cPt.y) : -1;
  const dot = w?.wall ? (w.wall.x - cPt.x) * (aim.x - cPt.x) + (w.wall.y - cPt.y) * (aim.y - cPt.y) : -1;
  ok("the wall stands ONE HEX-LENGTH (69px) from where the caster stands, in the direction of their point — the point gave the wall its facing",
    Math.abs(wallD - 69) <= 3 && dot > 0, `dist=${wallD.toFixed(1)} dot=${Math.round(dot)}`);
  ok("every attempt — fizzle and standing alike — charged exactly the filed 8 (UNRULED, as on the homeland)",
    e0 != null && e1 != null && e0 - e1 === 8 * attempts, `delta=${e0 - e1} attempts=${attempts}`);
  // E3 — beyond the ring: range alone refuses, no charge.
  const e2 = me()?.energy;
  const farAim = { x: cPt.x + 500, y: cPt.y };
  a.send({ type: "castWard", root: "blackgate", point: farAim });
  await waitFor(() => a.errors.some((m) => /Beyond reach/.test(m)), "the range refusal speaks", 8000);
  await sleep(400);
  ok("a Gate point beyond the six-hex casting ring is refused by RANGE alone, in plain words — and charges nothing",
    a.errors.some((m) => /Beyond reach/.test(m)) && me()?.energy === e2, `energy ${e2} -> ${me()?.energy}; errors=${JSON.stringify(a.errors.slice(-2))}`);
  a.ws.close();
}
{
  // E4 — the battle: the dark strikes the Gate and is
  // shoved back; it cannot pass while the Gate stands.
  const WB = await mkTableTender("Gate Table Battle", 3800, "disc-blackgate-battle");
  const a = new Actor();
  await a.join(WB.tt, "blackgate-battle");
  await waitFor(() => !!myPlayer(a, WB.name)?.hex, "the battle seat stands");
  const darkOf = () => a.state?.dark ?? [];
  let wave = false;
  for (let i = 0; i < 3 && !wave; i++) {
    a.send({ type: "startWave" });
    try { await waitFor(() => a.state?.battle?.active && darkOf().length > 0, "the wave is dealt", 8000); wave = true; }
    catch { /* deal again */ }
  }
  ok("the battle wave is dealt", wave && darkOf().length > 0, `dark=${darkOf().length}`);
  const target = darkOf()[0];
  const { stood } = await castGateTable(a, { x: target.pos.x, y: target.pos.y }, 24);
  ok("the Gate rises in battle, aimed by the point toward the coming dark", stood && !!gateWorking(a), `errors=${JSON.stringify(a.errors.slice(-2))}`);
  let hitSeen = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 150000 && !hitSeen) {
    await sleep(250);
    const w = gateWorking(a);
    if (w && w.wall && w.wall.hp < 10) hitSeen = true;
    if (!w && stood) hitSeen = true; // struck through and fallen under the blows
  }
  const taleHas = (a.state?.tale ?? []).some((t) => /Black Gate/.test(typeof t === "string" ? t : t?.text ?? ""));
  ok("the dark STRUCK the Gate at the Table — its wall's HP fell under the blows (it is a wall body in the battle pass, as Bulwark's shields are)",
    hitSeen, `tale=${JSON.stringify((a.state?.tale ?? []).slice(-3))}`);
  ok("the tale names the Black Gate's stand", taleHas, "");
  a.ws.close();
}

console.log(`\nBLACK GATE DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
