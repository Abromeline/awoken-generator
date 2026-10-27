// NO HEX-LOCK — RANGE IS THE CASTING GATE (Nigel,
// 2026-10-23 23:04: "make sure no spell or working is hex
// locked — range is the casting gate for spells"), built
// 2026-10-24 (the both-grounds rule of 2026-10-22 22:58):
// every Grimoire working's cast is aimed by the POINT the
// player tapped and gated by the DISTANCE from where the
// caster stands, in the working's own reach reckoning —
// nothing else.
//
// THE READINGS THIS DRIVE PROVES, ground by ground:
//   HOMELAND (castMapWorking, pointQ/pointR):
//     §H1 the Single Blade is written at the tapped
//         POINT — its row carries aimQ/aimR exactly as
//         tapped (a non-hex-centre point), on the tile
//         the point falls in;
//     §H2 a writing laid at a point SPRINGS for the dark
//         standing on that point (springblade — the
//         point-widened spring; its filed tile could
//         never have sprung it);
//     §H3 the Single Blade's LOOSE answers by the
//         distance from its written point — a dark thing
//         the HEX reckoning would refuse (three hexes
//         from the rune's tile) is loosed when it stands
//         within two hexes' ground of the point, while
//         a dark thing beyond the point's two-hex reach
//         is refused in plain words and the blade stays
//         armed (the HEX-road blade, cast the old way,
//         refuses the same dark — the control);
//     §H4 a point beyond the six-hex casting ring is
//         refused by RANGE alone, before any charge —
//         nothing written, nothing charged;
//     §H5 the LINE family: a ward cast at a tapped point
//         takes the edge its point names (the direction
//         derived, not named);
//     §H6 the AREA family: the Springleaf's burst is
//         judged from the tapped point — ground in the
//         tile reckoning but outside the point's glow is
//         NOT mended, and ground inside the point's glow
//         IS — while the grove row carries the point;
//     §H7 the Black Gate reads its facing from a tapped
//         point (no facing named), standing as a facing
//         cast's does.
//   THE TABLE (castRune/castWard/castHeal, point/points):
//     §T1 the Single Blade is written where the player
//         tapped (non-centre point, kept exactly), not
//         snapped to a hex's heart;
//     §T2 a point beyond the casting ring is refused by
//         RANGE alone, before any charge;
//     §T3 the LINE family: Bulwark's line stands across
//         the two tapped points (its shields centred on
//         their midpoint);
//     §T4 a ward aimed past the ring is refused by RANGE
//         alone — before any edge reckoning;
//     §T5 the AREA family: the Springleaf's grove takes
//         root at the tapped point, radius intact;
//     §T6 the point-written Blade looses at a dark thing
//         in its point's reach in battle.
// Run: node scripts/drive-nohexlock.mjs
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-nohexlock-"));
process.env.PORT = "3997";
process.env.WORKSHOP_PASSWORD = "nohexlock-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3997";
const PW = "nohexlock-drive-password";
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

// Fractional-axial copies of the server's own reckoning.
const axialDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
const axialRound = (q, r) => {
  const x = q, z = r, y = -x - z;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
};
const near = (a, b, tol = 0.01) => a != null && Math.abs(a - b) <= tol;

async function claim(name, exp, classKey = "warden") {
  const c = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(c.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  const now = Date.now();
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, exp, now);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(ownerKey, now);
  // The choosing opens after the first three wakes.
  if (classKey) { seedAwokin(ownerKey, name, `${name} Wake One`, "root"); seedAwokin(ownerKey, name, `${name} Wake Two`, "root"); seedAwokin(ownerKey, name, `${name} Wake Three`, "root"); }
  if (classKey) await call("chooseClass", { classKey }, c.token);
  return { token: c.token, ownerKey, tenderId, name };
}
function seedTiles(ownerKey, radius = 8) {
  const ids = new Map();
  const ins = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', 0, ?)");
  const now = Date.now();
  for (let q = -radius; q <= radius; q++) for (let r = -radius; r <= radius; r++) {
    if (axialDist({ q, r }, { q: 0, r: 0 }) > radius) continue;
    ids.set(`${q},${r}`, Number(ins.run(ownerKey, q, r, now).lastInsertRowid));
  }
  return ids;
}
function seedAwokin(ownerKey, tenderName, name, element, power = 3, toughness = 3) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, power, toughness, element, `nohexlock/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power, toughness, element });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `nohexlock/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
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
const bladeRow = (ownerKey) => db.prepare("SELECT * FROM territory_workings WHERE owner_key = ? AND engine = 'blade' ORDER BY id DESC").get(ownerKey);
async function castMapUntilStands(token, args, tries = 24) {
  let attempts = 0;
  for (let i = 0; i < tries; i++) {
    attempts++;
    const res = await call("castMapWorking", args, token);
    if (!res.fizzled) return { res, attempts };
  }
  throw new Error(`cast ${args.spellKey} never stood in ${tries} casts`);
}
async function prime(token) { await call("getTerritory", {}, token); }

/* ══ §H THE HOMELAND — THE POINT AIM ═══════════════════════ */
console.log("§H the homeland — points aim the cast, range gates it");
const HL = await claim("Range Homeland", 3800); // Lv 10
const hTiles = seedTiles(HL.ownerKey);
await prime(HL.token);
{
  const st = await call("getTerritory", {}, HL.token);
  ok("the homeland caster stands on the heart (0,0) — the point every reach below is measured from",
    !!st.tender && st.tender.tileId === hTiles.get("0,0"), JSON.stringify(st.tender));
}
// §H1 — the Single Blade is written at the tapped point.
console.log("§H1 the Single Blade is written where the player tapped");
{
  const e0 = energyOf(HL.ownerKey);
  const A = { q: 2.35, r: 0.42 }; // a non-centre point, within the ring
  const { res, attempts } = await castMapUntilStands(HL.token, { spellKey: "blade", pointQ: A.q, pointR: A.r });
  const cell = axialRound(A.q, A.r);
  const row = bladeRow(HL.ownerKey);
  const nums = JSON.parse(row?.nums ?? "{}");
  ok("the blade's row names the tile its point falls in",
    res.tileId === hTiles.get(`${cell.q},${cell.r}`) && Number(row?.tile_id) === hTiles.get(`${cell.q},${cell.r}`),
    `tileId=${res.tileId} cell=${cell.q},${cell.r}`);
  ok("the writing CARRIES the tapped point exactly — aimQ/aimR as tapped, a non-hex-centre point",
    near(nums.aimQ, A.q, 1e-9) && near(nums.aimR, A.r, 1e-9) && (A.q % 1 !== 0 || A.r % 1 !== 0),
    `aim=(${nums.aimQ}, ${nums.aimR})`);
  ok("the point cast charged the book's price an attempt (2 energy)",
    energyOf(HL.ownerKey) === e0 - 2 * attempts, `delta=${e0 - energyOf(HL.ownerKey)} attempts=${attempts}`);
}
// §H2 — the point-widened spring.
console.log("§H2 a writing at a point springs for the dark standing on that point");
{
  const D1 = seedDark(HL.ownerKey, hTiles.get("5,0"), "fray", 3.62, 0.31, { hp: 50 });
  const A = { q: 3.55, r: 0.28 }; // within half a hex of the dark's free point; its tile (4,0) is NOT the dark's filed tile (5,0)
  const { res } = await castMapUntilStands(HL.token, { spellKey: "springblade", pointQ: A.q, pointR: A.r });
  const after = darkRow(D1);
  ok("the springblade sprang on the dark standing at the tapped point — its filed tile (5,0) could never have sprung the writing's tile (4,0)",
    res.sprung === true && after && Number(after.hp) === 44, `sprung=${res.sprung} hp=${after?.hp}`);
}
// §H3 — the loose answers by the point's distance. (Its
// own tender: §H1's blade still stands armed on HL's land,
// and one writing per hex is the law.)
console.log("§H3 the Single Blade looses by the distance from its written point");
{
  const LH = await claim("Range Loose", 3800);
  const lTiles = seedTiles(LH.ownerKey);
  await prime(LH.token);
  // A blade aim A and a dark pos D with: dist(A,D) ≤ 1.95
  // (inside the Blade's two-hex answering) while the
  // CELLS stand 3 apart (the hex reckoning would refuse).
  let A = null, D = null;
  outer: for (let aq = 1.5; aq <= 3.0 && !A; aq += 0.04) {
    for (let ar = 0.8; ar <= 1.7 && !A; ar += 0.04) {
      const cellA = axialRound(aq, ar);
      for (let dq = 3.2; dq <= 4.6 && !A; dq += 0.04) {
        for (let dr = 1.1; dr <= 2.3 && !A; dr += 0.04) {
          const d = axialDist({ q: aq, r: ar }, { q: dq, r: dr });
          const cellD = axialRound(dq, dr);
          if (d >= 1.5 && d <= 1.95 && axialDist(cellA, cellD) === 3) { A = { q: aq, r: ar }; D = { q: dq, r: dr }; }
        }
      }
    }
  }
  ok("the drive found its fixture: a point pair inside two hexes' ground whose cells stand three hexes apart",
    !!A && !!D, `A=${JSON.stringify(A)} D=${JSON.stringify(D)}`);
  const cellD = axialRound(D.q, D.r);
  const darkNear = seedDark(LH.ownerKey, lTiles.get(`${cellD.q},${cellD.r}`), "fray", D.q, D.r, { hp: 50 });
  const darkFar = seedDark(LH.ownerKey, lTiles.get("6,0"), "fray", 6.2, 0.1, { hp: 50 }); // well beyond two hexes of point-ground from A
  ok("the far dark stands beyond the point's two-hex answering",
    axialDist(A, { q: 6.2, r: 0.1 }) > 2.6, String(axialDist(A, { q: 6.2, r: 0.1 }).toFixed(2)));
  await castMapUntilStands(LH.token, { spellKey: "blade", pointQ: A.q, pointR: A.r });
  const hpBefore = Number(darkRow(darkNear).hp);
  const loose = await call("looseBlade", { wandererId: darkNear }, LH.token);
  const hpAfter = darkRow(darkNear) ? Number(darkRow(darkNear).hp) : 0;
  ok("the Blade LOOSED at the dark three hexes from its tile — the point's distance (under two hexes of ground) is what answered",
    loose.felled === false && hpAfter === hpBefore - 6, `hp ${hpBefore} -> ${hpAfter}`);
  const rowAfter = bladeRow(LH.ownerKey);
  ok("the loose spent one of the Blade's charges (2 → 1) — and the Blade stands armed still",
    Number(rowAfter?.charges) === 1, `charges=${rowAfter?.charges}`);
  let farRefused = "";
  try { await call("looseBlade", { wandererId: darkFar }, LH.token); } catch (e) { farRefused = String(e.message); }
  ok("the dark beyond the point's two-hex reach is REFUSED in plain words — and the Blade keeps its last charge",
    /within two hexes of its writing/.test(farRefused) && Number(bladeRow(LH.ownerKey)?.charges) === 1,
    farRefused);
}
// §H3 control — the HEX-road blade refuses the same geometry.
{
  const HX = await claim("Range Hex Control", 3800);
  const xTiles = seedTiles(HX.ownerKey);
  await prime(HX.token);
  const A = { q: 2.35, r: 0.42 };
  const cellA = axialRound(A.q, A.r);
  const D = { q: 4.9, r: 0.5 }; // axialDist(A,D) ≈ 2.6 — outside; its cell stands 3 from cellA
  const cellD = axialRound(D.q, D.r);
  ok("control fixture: the dark's cell stands three hexes from the blade's tile",
    axialDist(cellA, cellD) === 3, `cellA=${cellA.q},${cellA.r} cellD=${cellD.q},${cellD.r}`);
  const dark = seedDark(HX.ownerKey, xTiles.get(`${cellD.q},${cellD.r}`), "fray", D.q, D.r, { hp: 50 });
  await castMapUntilStands(HX.token, { spellKey: "blade", tileId: xTiles.get(`${cellA.q},${cellA.r}`) });
  let refused = "";
  try { await call("looseBlade", { wandererId: dark }, HX.token); } catch (e) { refused = String(e.message); }
  ok("CONTROL — a blade written on the HEX road still answers by hexes: the same far dark is refused, and it stays armed",
    /within two hexes of its writing/.test(refused) && Number(bladeRow(HX.ownerKey)?.charges) === 2,
    refused);
}
// §H4 — beyond the ring, the homeland refuses by range alone.
console.log("§H4 a point beyond the casting ring is refused by range alone");
{
  const e0 = energyOf(HL.ownerKey);
  const before = db.prepare("SELECT COUNT(*) AS n FROM territory_workings WHERE owner_key = ? AND engine = 'blade'").get(HL.ownerKey).n;
  let refusal = "";
  try { await call("castMapWorking", { spellKey: "blade", pointQ: 7.4, pointR: 0.2 }, HL.token); } catch (e) { refusal = String(e.message); }
  const after = db.prepare("SELECT COUNT(*) AS n FROM territory_workings WHERE owner_key = ? AND engine = 'blade'").get(HL.ownerKey).n;
  ok("a blade point at 7.6 hexes of ground is refused — \"beyond your casting reach\" — ring 6 of where you stand",
    /beyond your casting reach/.test(refusal), refusal);
  ok("the refusal charged nothing and wrote nothing",
    energyOf(HL.ownerKey) === e0 && after === before, `energy ${e0} -> ${energyOf(HL.ownerKey)}, blades ${before} -> ${after}`);
}
// §H5 — the line family: a ward takes the edge its point names.
console.log("§H5 a ward cast at a point takes the edge the point names");
{
  const { res } = await castMapUntilStands(HL.token, { spellKey: "seal", tileId: hTiles.get("1,0"), pointQ: 1.45, pointR: 0.08 });
  ok("the Seal stands on the edge between (1,0) and (2,0) — edge \"1,0,2\" — its direction DERIVED from the point nearest that edge's midpoint, no dir named",
    res.edgeKey === "1,0,2", `edgeKey=${res.edgeKey}`);
}
// §H6 — the area family: the Springleaf's burst, judged from the point.
// RESTATED 2026-10-27 (Nigel's ruling: the Grove's reach
// quarters to 25%, fractionally — the grove mends part-way
// into the next hexes): at Lv 3 the radius is 0.75 of a
// hex, so this section's fixture is re-laid inside it —
// the inside friend stands at the point (2.75, 0.35) on
// the tile (3,0): 0.5 of ground from the planted point
// (inside the point's glow) while his TILE stands a full
// hex from the planted tile (2,0) — outside any
// tile-membership reckoning at this radius. The point
// still judges, at the quartered reach.
console.log("§H6 the Springleaf's burst is judged from the tapped point");
{
  const GV = await claim("Range Grove", 150); // Lv 3 — grove radius 0.75 hexes (quartered 2026-10-27)
  const gTiles = seedTiles(GV.ownerKey, 6);
  await prime(GV.token);
  const inAwo = seedAwokin(GV.ownerKey, GV.name, "Glow Friend", "root", 3, 3);
  const inPl = placeAwokin(GV.ownerKey, inAwo, gTiles.get("3,0"), 2.75, 0.35, { hp: 1 });
  const outAwo = seedAwokin(GV.ownerKey, GV.name, "Far Friend", "root", 3, 3);
  const outPl = placeAwokin(GV.ownerKey, outAwo, gTiles.get("5,1"), 5, 1, { hp: 1 });
  const P = { q: 2.3, r: 0.4 }; // the grove's point: the inside friend's point is 0.5 of ground away (in the glow); (5,1) is 3.3 (far outside the quartered glow)
  const { res } = await castMapUntilStands(GV.token, { spellKey: "springleaf", pointQ: P.q, pointR: P.r });
  const inHp = db.prepare("SELECT hp FROM field_placements WHERE id = ?").get(inPl)?.hp;
  const outHp = db.prepare("SELECT hp FROM field_placements WHERE id = ?").get(outPl)?.hp;
  const grove = db.prepare("SELECT * FROM territory_workings WHERE owner_key = ? AND engine = 'springleaf'").get(GV.ownerKey);
  const gNums = JSON.parse(grove?.nums ?? "{}");
  ok("the friend INSIDE the point's glow was mended by the raising burst (1 HP → more) — his point is 0.5 from the planted point though his tile stands a full hex away",
    Number(inHp) > 1, `hp=${inHp} burst=${res.burst}`);
  ok("the friend outside the POINT's glow was NOT mended — the burst is judged from where the player pointed",
    Number(outHp) === 1, `hp=${outHp}`);
  ok("the grove's row carries the planted point (aimQ/aimR) and its QUARTERED radius (Lv 3: floor((66+36)×2.75/80) = 3, × 0.25 = 0.75)",
    near(gNums.aimQ, P.q, 1e-9) && near(gNums.aimR, P.r, 1e-9) && Number(gNums.radiusHexes) === 0.75,
    `nums=${JSON.stringify({ aimQ: gNums.aimQ, aimR: gNums.aimR, radiusHexes: gNums.radiusHexes })}`);
}
// §H7 — the Black Gate reads its facing from the point.
console.log("§H7 the Black Gate's facing is read from a tapped point");
{
  let res = null;
  for (let i = 0; i < 24 && !res; i++) {
    const r = await call("castMapWorking", { spellKey: "blackgate", pointQ: 0.3, pointR: 1.4 }, HL.token);
    if (!r.fizzled) res = r;
  }
  ok("a Gate cast naming NO facing but a point due south stands facing S, its wall at (0, 1) — the point aimed it",
    !!res && res.facing === "S" && near(res.wallQ, 0, 1e-9) && near(res.wallR, 1, 1e-9),
    JSON.stringify(res && { facing: res.facing, wallQ: res.wallQ, wallR: res.wallR }));
}

/* ══ §T THE TABLE — THE POINT AIM ══════════════════════════ */
console.log("§T the Table — points aim the cast, range gates it");
const { issueTableToken } = await import("../server/dist/table.js");
const part = (name, category, power, toughness) => Number(db.prepare(
  "INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, 'sky', ?, 'image/png', ?)")
  .run(name, category, power, toughness, `nohexlock/${name}.png`, Date.now()).lastInsertRowid);
const mkAwokin = (ownerKey, ownerName, name, bodyPower) => {
  const now = Date.now();
  const comp = JSON.stringify([
    { source_id: `db:${part(name + " Body", "body", bodyPower, bodyPower)}`, name: name + " Body", category: "body", rarity: "common", power: bodyPower, toughness: bodyPower, element: "sky" },
    { source_id: `db:${part(name + " Arms", "arms", 0, 0)}`, name: name + " Arms", category: "arms", rarity: "common", power: 0, toughness: 0, element: "sky" },
    { source_id: `db:${part(name + " Head", "head", 0, 0)}`, name: name + " Head", category: "head", rarity: "common", power: 0, toughness: 0, element: "sky" },
  ]);
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, "nohexlock/awokin.png", comp, ownerName, ownerKey, now).lastInsertRowid);
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
    this.ws = new WebSocket(`ws://127.0.0.1:3997/table/ws`);
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
const centreOfHex = (id) => {
  const { q, r } = parseHex(id);
  const k = 40 / 796;
  return { x: q * 1292 * k, y: q * 470 * k + r * 948 * k };
};
function neighbourToward(state, fromId, toId) {
  const from = parseHex(fromId), to = parseHex(toId);
  const ids = new Set((state?.map ?? []).map((t) => t.id));
  let best = null, bestD = Infinity;
  for (const [dq, dr] of DIRS6) {
    const id = `${from.q + dq},${from.r + dr}`;
    if (!ids.has(id)) continue;
    const d = axialDist(parseHex(id), to);
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}
const myPlayer = (actor, name) => (actor.state?.players ?? []).find((p) => p.name === name);
const TL = await mkTableTender("Range Table", 3800, "disc-nohexlock-t");
const a = new Actor();
await a.join(TL.tt, "nohexlock-table");
await waitFor(() => !!myPlayer(a, TL.name)?.hex, "the Table seat stands");
const me = () => myPlayer(a, TL.name);
const myHex = me().hex;
const cPt = me().pos ?? centreOfHex(myHex);
const bladeWorking = () => (a.state?.workings ?? []).find((w) => w.engine === "blade");
// §T1 — the blade written where the player tapped.
console.log("§T1 the Single Blade at the Table is written at the tapped point");
const bladeAim = { x: cPt.x + 26, y: cPt.y + 14 };
{
  const e0 = me()?.energy;
  let attempts = 0, stood = false;
  for (let i = 0; i < 24 && !stood; i++) {
    attempts++;
    a.send({ type: "castRune", root: "blade", points: [bladeAim] });
    try { await waitFor(() => !!bladeWorking(), "the blade stands", 1200); stood = true; } catch { /* fizzle — cast again */ }
  }
  const w = bladeWorking();
  const centres = (a.state?.map ?? []).map((t) => centreOfHex(t.id));
  const minCentreD = w?.pos ? Math.min(...centres.map((c) => Math.hypot(c.x - w.pos.x, c.y - w.pos.y))) : 0;
  ok("the point cast stands the Blade at the Table (castRune, points only — no hex named)",
    stood && !!w, `errors=${JSON.stringify(a.errors.slice(-2))}`);
  ok("the writing stands AT the tapped point (within 1.5px) — not snapped to a hex's heart (every tile heart stands farther than 5px from it)",
    !!w?.pos && Math.hypot(w.pos.x - bladeAim.x, w.pos.y - bladeAim.y) <= 1.5 && minCentreD > 5,
    `pos=${JSON.stringify(w?.pos)} aim=${JSON.stringify(bladeAim)} minCentreD=${minCentreD.toFixed(1)}`);
  const e1 = me()?.energy;
  ok("the point cast charged the book's price an attempt (2 energy)",
    e0 != null && e1 != null && e0 - e1 === 2 * attempts, `delta=${e0 - e1} attempts=${attempts}`);
}
// §T2 — beyond the ring at the Table.
console.log("§T2 a Table point beyond the ring is refused by range alone");
{
  const e0 = me()?.energy;
  const errBefore = a.errors.length;
  a.send({ type: "castRune", root: "blade", points: [{ x: cPt.x + 500, y: cPt.y }] });
  await waitFor(() => a.errors.length > errBefore && /Beyond reach/.test(a.errors[a.errors.length - 1] ?? ""), "the range refusal speaks", 8000);
  await sleep(400);
  ok("a blade point 500px out (7+ hexes of ground) is refused — \"gated by range alone\" — in plain words",
    a.errors.some((m) => /Beyond reach/.test(m) && /gated by range alone/.test(m)), JSON.stringify(a.errors.slice(-2)));
  ok("the refusal charged nothing and wrote nothing new",
    me()?.energy === e0 && (a.state?.workings ?? []).filter((w) => w.engine === "blade").length === 1,
    `energy ${e0} -> ${me()?.energy}`);
}
// §T3 — the line family at the Table: Bulwark across two points.
console.log("§T3 Bulwark's line stands across the two tapped points");
{
  const hexB = neighbourToward(a.state, myHex, "0,0");
  const ptA = centreOfHex(myHex);
  const bc = centreOfHex(hexB);
  const ptB = { x: bc.x + 9, y: bc.y - 4 };
  let stood = false;
  for (let i = 0; i < 24 && !stood; i++) {
    a.send({ type: "castWard", root: "bulwark", pointA: ptA, pointB: ptB });
    try { await waitFor(() => !!(a.state?.workings ?? []).find((w) => w.engine === "bulwark"), "the line stands", 1200); stood = true; } catch { /* fizzle */ }
  }
  const w = (a.state?.workings ?? []).find((w) => w.engine === "bulwark");
  const shields = w?.shields ?? [];
  const cen = shields.length ? { x: shields.reduce((s, x) => s + x.x, 0) / shields.length, y: shields.reduce((s, x) => s + x.y, 0) / shields.length } : null;
  const mid = { x: (ptA.x + ptB.x) / 2, y: (ptA.y + ptB.y) / 2 };
  ok("the Bulwark cast by POINTS stands its line (5 shields at Lv 10)",
    stood && shields.length === 5, `errors=${JSON.stringify(a.errors.slice(-2))}`);
  ok("the line is centred on the two points' midpoint (within 25px) — the points aimed it, not the hexes' hearts",
    !!cen && Math.hypot(cen.x - mid.x, cen.y - mid.y) <= 25, `centroid=${JSON.stringify(cen)} mid=${JSON.stringify(mid)}`);
}
// §T4 — a ward aimed past the ring.
console.log("§T4 a ward aimed past the ring meets the range refusal first");
{
  const e0 = me()?.energy;
  const errBefore = a.errors.length;
  a.send({ type: "castWard", root: "seal", pointA: cPt, pointB: { x: cPt.x + 500, y: cPt.y } });
  await waitFor(() => a.errors.length > errBefore, "the ward refusal speaks", 8000);
  await sleep(400);
  ok("the refusal is RANGE's — \"Beyond reach\" — not an edge refusal: the range gate stands before the edge is ever read",
    /Beyond reach/.test(a.errors[a.errors.length - 1] ?? "") && me()?.energy === e0,
    `last=${a.errors[a.errors.length - 1]} energy ${e0} -> ${me()?.energy}`);
}
// §T5 — the area family at the Table: the grove at the point.
console.log("§T5 the Springleaf's grove takes root at the tapped point");
{
  const aim = { x: cPt.x + 60, y: cPt.y + 20 };
  let stood = false;
  for (let i = 0; i < 24 && !stood; i++) {
    a.send({ type: "castWard", root: "springleaf", pointA: cPt, pointB: aim });
    try { await waitFor(() => !!(a.state?.workings ?? []).find((w) => w.kind === "grove"), "the grove stands", 1200); stood = true; } catch { /* fizzle */ }
  }
  const g = (a.state?.workings ?? []).find((w) => w.kind === "grove");
  ok("the grove stands where the player pointed (within 1.5px), its radius intact",
    stood && !!g?.pos && Math.hypot(g.pos.x - aim.x, g.pos.y - aim.y) <= 1.5 && (g.radiusPx ?? 0) > 100,
    `pos=${JSON.stringify(g?.pos)} radius=${g?.radiusPx}`);
}
// §T6 — the point-written Blade looses in battle.
console.log("§T6 the point-written Blade looses at a dark thing in its point's reach");
{
  // Take the road toward the seed's ring, where the dark converge.
  const ringHex = neighbourToward(a.state, myHex, "0,0");
  const rc = centreOfHex(ringHex);
  a.send({ type: "glide", tx: rc.x, ty: rc.y });
  await waitFor(() => { const p = me(); return !!p?.pos && Math.hypot(p.pos.x - rc.x, p.pos.y - rc.y) < 30; }, "the caster glides to the seed's ring", 15000).catch(() => {});
  const stand = me()?.pos ?? rc;
  const aim = { x: stand.x + 30, y: stand.y + 10 };
  let stood = false;
  for (let i = 0; i < 24 && !stood; i++) {
    a.send({ type: "castRune", root: "blade", points: [aim] });
    try { await waitFor(() => (a.state?.workings ?? []).filter((w) => w.engine === "blade").length >= 2, "the road blade stands", 1200); stood = true; } catch { /* fizzle */ }
  }
  ok("a second Blade is written at a point on the dark's road", stood, `errors=${JSON.stringify(a.errors.slice(-2))}`);
  let wave = false;
  for (let i = 0; i < 3 && !wave; i++) {
    a.send({ type: "startWave" });
    try { await waitFor(() => a.state?.battle?.active && (a.state?.dark ?? []).length > 0, "the wave is dealt", 8000); wave = true; } catch { /* deal again */ }
  }
  ok("the battle wave is dealt", wave && (a.state?.dark ?? []).length > 0, "");
  let loosed = false, judgedBy = "";
  const t0 = Date.now();
  while (Date.now() - t0 < 150000 && !loosed) {
    await sleep(300);
    const dark = (a.state?.dark ?? []).find((d) => Math.hypot(d.pos.x - aim.x, d.pos.y - aim.y) <= 138);
    if (!dark) continue;
    const hp0 = dark.hp;
    judgedBy = `dark at ${Math.round(Math.hypot(dark.pos.x - aim.x, dark.pos.y - aim.y))}px of the written point`;
    a.send({ type: "looseBlade", enemyId: dark.id });
    await sleep(900);
    const now = (a.state?.dark ?? []).find((d) => d.id === dark.id);
    const tale = (a.state?.tale ?? []).some((t) => /LOOSED/.test(typeof t === "string" ? t : t?.text ?? ""));
    if (!now || now.hp < hp0 || tale) loosed = true;
  }
  ok("the Blade LOOSED at the dark thing standing in its written point's reach — its harm landed",
    loosed, judgedBy);
  a.ws.close();
}

console.log(`\nNO HEX-LOCK DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
