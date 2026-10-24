// THE REAL-TIME BATTLE ENGINE — DRIVE (Nigel, 2026-10-23).
// Boots the real server on a scratch DATA_DIR and proves the
// living loop against the served state and the DB ledgers:
//   §A the dark WALKS — free points change across reads, at a
//      pace slower than an Awokin's march; the lighthouse
//      stands dark by default.
//   §B TEETH + SHIELD + CLAWS — an adjacent Fray bites an
//      unordered Awokin: the shield burns before HP; the
//      Awokin (no orders = attack) kills it; the kill banks
//      exactly its bonus in protection minutes; a batch of
//      kills pays Shadow Matter in exact bonus-sized steps.
//   §C THE LIGHTHOUSE — lit by hand only; while lit no dark
//      spawns under forced beats; banked minutes burn across
//      present hours and the shadow upkeep drains with them;
//      a long silence burns NOTHING (the pause).
//   §D ESCALATION — weather changes step the intensity while
//      unlit; spawns stand at the intensity's level and body;
//      lighting the light resets it to 1 and pushes the dark
//      off the land.
//   §E CROWDING taxes cadence: a Sky striker on a crowded
//      tile deals measurably less total harm over a fixed
//      window than the same striker standing alone.
//   §F THE ARSENAL — a Stone defender's ROCK WALL stands and
//      is hacked while the dark cannot cross it; a Root
//      defender's BRAMBLE kills the dark standing in it;
//      Tide leaves a foe WET, Sky SHOVES it, Stone CRACKS it.
// Run: node scripts/drive-battle.mjs
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const OUT = "/home/hatch/workspace/battle-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(OUT, "data-"));
process.env.PORT = "3991";
process.env.WORKSHOP_PASSWORD = "battle-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;
process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3991";
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
  return data;
}
async function callRaw(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }

const axial = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

async function claim(name) {
  const c = await call("claimTender", { password: "battle-drive-password", tenderName: name });
  const id = db.prepare("SELECT id FROM tenders WHERE code = ?").get(c.tender.code).id;
  const ownerKey = `tender:${id}`;
  const now = Date.now();
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, now);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(ownerKey, now);
  // A classless Tender has no stand, and the whole homeland
  // settlement rides on his stand — choose, as every drive does.
  await call("chooseClass", { classKey: "warden" }, c.token);
  return { token: c.token, ownerKey };
}
function seedTile(ownerKey, q, r, cursed, element = "root") {
  return Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(ownerKey, q, r, element, cursed, Date.now()).lastInsertRowid);
}
function seedAwokin(ownerKey, tenderName, name, element, power = 3, toughness = 3, exp = 0) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)").run(`${name} ${cat}`, cat, power, toughness, element, `battle/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power, toughness, element });
  }
  const id = Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)").run(name, name, `battle/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    ownerKey, tileId, kind, Date.now(), opts.hp ?? 3, q, r, opts.power ?? 1, opts.lvl ?? 1, 0);
  return Number(info.lastInsertRowid);
}
function seedAwokinParts(ownerKey, tenderName, name, spec, exp = 0) {
  const nowT = Date.now();
  const parts = [];
  ["body", "arms", "head"].forEach((cat, i) => {
    const s = spec[i];
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)").run(`${name} ${cat}`, cat, s.power, s.toughness, s.element, `battle/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: s.power, toughness: s.toughness, element: s.element });
  });
  const id = Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)").run(name, name, `battle/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
  if (exp) db.prepare("UPDATE awakened SET experience = ? WHERE id = ?").run(exp, id);
  return id;
}
const darkRow = (id) => db.prepare("SELECT * FROM homeland_wanderers WHERE id = ?").get(id);
const darkOf = (ownerKey) => db.prepare("SELECT * FROM homeland_wanderers WHERE owner_key = ? ORDER BY id").all(ownerKey);
const progOf = (ownerKey) => db.prepare("SELECT * FROM tender_progress WHERE owner_key = ?").get(ownerKey);
const placementOf = (id) => db.prepare("SELECT * FROM field_placements WHERE id = ?").get(id);
async function advance(ownerKey, token, ms) {
  db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now() - ms, ownerKey);
  return call("getTerritory", {}, token);
}
async function prime(ownerKey, token) {
  await call("getTerritory", {}, token); // first read sets the battle watermark
}

/* ══ §A THE WALK ══════════════════════════════════════════ */
console.log("§A the dark walks free, slower than an Awokin; the light stands dark by default");
{
  const G = await claim("Battle Walker");
  seedTile(G.ownerKey, 0, 0, 0);
  seedTile(G.ownerKey, 2, 0, 0);
  const t5 = seedTile(G.ownerKey, 5, 0, 1, "fire");
  const aw = seedAwokin(G.ownerKey, "Battle Walker", "Walker Friend", "root", 3, 3);
  const t2 = db.prepare("SELECT id FROM territory_tiles WHERE owner_key = ? AND q = 2 AND r = 0").get(G.ownerKey).id;
  placeAwokin(G.ownerKey, aw, t2, 2, 0, { hp: 9 });
  const dark = seedDark(G.ownerKey, t5, "fray", 5, 0, { hp: 3 });
  await prime(G.ownerKey, G.token);
  const st0 = await call("getTerritory", {}, G.token);
  ok("the lighthouse is OFF by default and the bank stands at zero",
    st0.battle && st0.battle.lighthouseLit === false && st0.battle.protectionBankMs === 0, JSON.stringify(st0.battle));
  ok("the wanderer is served at its own free point", st0.wanderers.length === 1 && Math.abs(st0.wanderers[0].posQ - 5) < 0.35 && st0.wanderers[0].posR === 0, JSON.stringify(st0.wanderers));
  const before = darkRow(dark);
  const st1 = await advance(G.ownerKey, G.token, 6000);
  const after = darkRow(dark);
  const moved = Math.abs(after.pos_q - before.pos_q) + Math.abs(after.pos_r - before.pos_r);
  const disp = axial({ q: after.pos_q, r: after.pos_r }, { q: 5, r: 0 });
  console.log(`  walk: (${before.pos_q},${before.pos_r}) -> (${after.pos_q},${after.pos_r}) in a 6s window`);
  ok("its position changed across the reads — it walks", moved > 0.5, `moved ${moved}`);
  ok("it walks TOWARD the Awokin", after.pos_q < before.pos_q, `${after.pos_q} !< ${before.pos_q}`);
  ok("its pace is slower than an Awokin's march (6s of neutral march = 2 hexes; the Fray's 6s ≈ 1.4)",
    disp > 0.8 && disp < 1.9, `displacement ${disp}`);
  ok("the served view carries the walked point", Math.abs((st1.wanderers[0]?.posQ ?? 0) - after.pos_q) < 1e-9, JSON.stringify(st1.wanderers[0]));
}

/* ══ §B TEETH, SHIELD, CLAWS, BOUNTY ══════════════════════ */
console.log("§B an adjacent Fray bites through the shield first; the unordered Awokin kills it; the bounty is exact");
{
  const G = await claim("Battle Biter");
  seedTile(G.ownerKey, 0, 0, 0);
  const tC = seedTile(G.ownerKey, 3, 0, 1, "fire");
  const tP = seedTile(G.ownerKey, 2, 0, 0);
  const aw = seedAwokin(G.ownerKey, "Battle Biter", "Sky Fang", "sky", 9, 1, 10000); // Lv 10, toughness 3 (AC 3), power 27
  const pl = placeAwokin(G.ownerKey, aw, tP, 2, 0, { hp: 3, shield: 8 }); // unordered → attack
  const dark = seedDark(G.ownerKey, tC, "fray", 3, 0, { hp: 200 }); // deep-bodied: it lives long enough to bite twice
  await prime(G.ownerKey, G.token);
  // The Fray bites on its 2s cadence; her shield eats the blows.
  await advance(G.ownerKey, G.token, 5000);
  let p = placementOf(pl);
  ok("the shield burned before the body (shield fell, HP whole or shield spent first)",
    (p.shield ?? 8) < 8 && (p.hp === 3 || (p.shield ?? 0) === 0), JSON.stringify({ shield: p.shield, hp: p.hp }));
  // The drive wounds the fixture to the edge of death; she finishes it.
  db.prepare("UPDATE field_placements SET hp = 30 WHERE id = ?").run(pl);
  db.prepare("UPDATE homeland_wanderers SET hp = 2 WHERE id = ?").run(dark);
  const bank0 = progOf(G.ownerKey).protection_bank_ms;
  let dead = false;
  for (let i = 0; i < 12 && !dead; i++) { await advance(G.ownerKey, G.token, 10000); dead = !darkRow(dark); }
  ok("the unordered Awokin killed the Fray — no orders defaults to ATTACK", dead);
  const bank1 = progOf(G.ownerKey).protection_bank_ms;
  ok("the kill banked exactly the Fray's bounty: 1 minute of protection", bank1 - bank0 === 60000, `${bank0} -> ${bank1}`);
  const xp = db.prepare("SELECT experience FROM awakened WHERE id = ?").get(aw).experience;
  ok("the killer earned its attack event XP", xp > 10000, `xp ${xp}`);
  // Shadow batch: a fresh reaper whose hide the Fray can never
  // pierce (AC 120) fells Frays until the hoard moves; every
  // step is exactly the bonus (1).
  db.prepare("DELETE FROM field_placements WHERE owner_key = ?").run(G.ownerKey);
  const reaper = seedAwokin(G.ownerKey, "Battle Biter", "Shadow Reaper", "sky", 9, 40, 10000);
  placeAwokin(G.ownerKey, reaper, tP, 2, 0, { hp: 120 });
  let shadow = progOf(G.ownerKey).shadow_matter;
  let stepsOk = true, landed = false;
  for (let batch = 0; batch < 30 && !landed; batch++) {
    const d2 = seedDark(G.ownerKey, tC, "fray", 3, 0, { hp: 1 });
    for (let i = 0; i < 10 && darkRow(d2); i++) await advance(G.ownerKey, G.token, 10000);
    const s2 = progOf(G.ownerKey).shadow_matter;
    const delta = s2 - shadow;
    if (!(delta === 0 || delta === 1)) stepsOk = false;
    if (delta === 1) landed = true;
    shadow = s2;
  }
  ok("Shadow Matter pays in exact bonus-sized steps (0 or 1 per Fray kill)", stepsOk);
  ok("a 20% shadow drop landed within 30 kills (a silent batch is a <0.2% accident)", landed, `shadow ${shadow}`);
}

/* ══ §C + §D THE LIGHTHOUSE AND THE WAVES ═════════════════ */
console.log("§C/§D the light is lit by hand; it gates spawning, burns in presence, pauses in absence; the waves escalate unlit");
{
  const G = await claim("Battle Light");
  seedTile(G.ownerKey, 0, 0, 0);
  // cursed view ring for spawns (rings 3–6 of the stand)
  const viewTiles = [];
  for (const [q, r] of [[3, 0], [4, 0], [5, 0], [3, 1], [4, -1], [5, -2], [6, -3], [3, -2]]) viewTiles.push(seedTile(G.ownerKey, q, r, 1, "fire"));
  await prime(G.ownerKey, G.token);
  // Bank two minutes by hand (the §B proof covers earning; here the bank is the fixture).
  db.prepare("UPDATE tender_progress SET protection_bank_ms = 600000, shadow_matter = 10 WHERE owner_key = ?").run(G.ownerKey);
  const reigns0 = Number(JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'weather_reign_count'").get()?.value ?? "0"));
  // Escalation first: two weather changes while unlit.
  db.prepare("INSERT INTO settings (key, value) VALUES ('weather_reign_count', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(reigns0 + 2));
  let st = await call("getTerritory", {}, G.token);
  ok("two weather changes unlit stepped the wave intensity 1 -> 3", st.battle.waveIntensity === 3, JSON.stringify(st.battle));
  // Forced spawn beats at intensity 3: the born stand at level 3 with deepened bodies.
  db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ?, wanderer_settled_beats = 0 WHERE owner_key = ?").run(Date.now() - 45000 * 30, G.ownerKey);
  st = await call("getTerritory", {}, G.token);
  const born = darkOf(G.ownerKey);
  ok("the unlit world spawns under forced beats", born.length > 0, `${born.length} born`);
  ok("the spawned stand at the intensity's level, bodies deepened (Fray hp 3 + 2)",
    born.every(w => w.lvl === 3) && born.some(w => w.kind !== "fray" || w.hp >= 5), JSON.stringify(born.map(w => [w.kind, w.lvl, w.hp])));
  // Light the light by hand.
  const litRes = await call("setLighthouse", { lit: true }, G.token);
  ok("the lighthouse lights by the Tender's own hand", litRes.battle.lighthouseLit === true, JSON.stringify(litRes.battle));
  st = await call("getTerritory", {}, G.token);
  ok("lighting pushed the standing dark off the land and reset the intensity to 1",
    darkOf(G.ownerKey).length === 0 && st.battle.waveIntensity === 1, `dark ${darkOf(G.ownerKey).length}, intensity ${st.battle.waveIntensity}`);
  // While lit, forced beats birth nothing.
  db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ?, wanderer_settled_beats = 0 WHERE owner_key = ?").run(Date.now() - 45000 * 30, G.ownerKey);
  st = await call("getTerritory", {}, G.token);
  ok("while lit, no dark spawns under forced beats", darkOf(G.ownerKey).length === 0, `${darkOf(G.ownerKey).length}`);
  // Burn in presence: 30 present seconds burn ~30s of bank and ~0.125 shadow of upkeep (1 per 4 min, Nigel 2026-10-24).
  const bankA = progOf(G.ownerKey).protection_bank_ms, shadowA = progOf(G.ownerKey).shadow_matter;
  db.prepare("UPDATE tender_progress SET lighthouse_settled_at = ? WHERE owner_key = ?").run(Date.now() - 30000, G.ownerKey);
  st = await call("getTerritory", {}, G.token);
  const bankB = progOf(G.ownerKey).protection_bank_ms, shadowB = progOf(G.ownerKey).shadow_matter;
  console.log(`  burn: bank ${bankA} -> ${bankB}; shadow ${shadowA} -> ${shadowB}`);
  ok("30 present seconds burned ~30s of banked protection", bankA - bankB >= 28000 && bankA - bankB <= 32000, `${bankA - bankB}`);
  ok("the shadow upkeep drained with the burn (30s at 1 per 4 min = 0.125)", Math.abs((shadowA - shadowB) - 0.125) < 0.08, `${shadowA - shadowB}`);
  // The pause: a 10-minute silence burns nothing and the light stays lit.
  db.prepare("UPDATE tender_progress SET lighthouse_settled_at = ? WHERE owner_key = ?").run(Date.now() - 600000, G.ownerKey);
  st = await call("getTerritory", {}, G.token);
  const bankC = progOf(G.ownerKey).protection_bank_ms;
  ok("a 10-minute absence burned NOTHING — the timer pauses away from the homeland",
    Math.abs(bankC - bankB) <= 1000 && st.battle.lighthouseLit === true, `bank ${bankB} -> ${bankC}, lit ${st.battle.lighthouseLit}`);
  // An empty bank cannot be lit by a fresh tender.
  const H = await claim("Battle Dark");
  seedTile(H.ownerKey, 0, 0, 0);
  const refused = await callRaw("setLighthouse", { lit: true }, H.token);
  ok("a light with no banked minutes refuses, in its own words", refused.status === 400 && /kills buy the light/.test(refused.data?.error ?? ""), JSON.stringify(refused.data).slice(0, 140));
  const douse = await call("setLighthouse", { lit: false }, G.token);
  ok("the light douses by hand", douse.battle.lighthouseLit === false);
}

/* ══ §E CROWDING TAXES CADENCE ════════════════════════════ */
console.log("§E crowding taxes an attacker's cadence — same striker, same window, crowded tile deals less");
{
  const runTrial = async (crowded) => {
    const G = await claim(crowded ? "Battle Crowd" : "Battle Lone");
    seedTile(G.ownerKey, 0, 0, 0);
    const tC = seedTile(G.ownerKey, 3, 0, 1, "fire");
    const tP = seedTile(G.ownerKey, 2, 0, 0);
    // A whisper of Sky (her shove floors to nothing) over a
    // Stone body: heavy blows, a 1750ms cadence, AC 120 — the
    // Fray's teeth never land, so the window measures cadence alone.
    const sky = seedAwokinParts(G.ownerKey, crowded ? "Battle Crowd" : "Battle Lone", "Sky Lance", [
      { element: "sky", power: 1, toughness: 0 }, { element: "stone", power: 30, toughness: 60 }, { element: "stone", power: 30, toughness: 60 },
    ], 10000);
    placeAwokin(G.ownerKey, sky, tP, 2, 0, { hp: 120 });
    if (crowded) {
      for (let i = 0; i < 5; i++) {
        const binder = seedAwokin(G.ownerKey, crowded ? "Battle Crowd" : "Battle Lone", `Crowd Binder ${i}`, "root", 1, 40);
        placeAwokin(G.ownerKey, binder, tP, 2, 0, { hp: 120, stance: "binding", ordered: true });
      }
    }
    const dark = seedDark(G.ownerKey, tC, "fray", 3, 0, { hp: 1000000, power: 1 });
    await prime(G.ownerKey, G.token);
    await advance(G.ownerKey, G.token, 60000);
    return 1000000 - (darkRow(dark)?.hp ?? 0);
  };
  const lone = await runTrial(false);
  const crowdedDmg = await runTrial(true);
  console.log(`  window harm: lone ${Math.round(lone)}, crowded ${Math.round(crowdedDmg)}`);
  ok("the lone striker dealt real harm over the window", lone > 1000, `${lone}`);
  ok("the crowded striker (6 on her tile, cadence x 6/4) dealt measurably less — the tax is in the cadence",
    crowdedDmg > 0 && crowdedDmg < lone * 0.85, `lone ${Math.round(lone)} vs crowded ${Math.round(crowdedDmg)}`);
}

/* ══ §F THE ARSENAL ═══════════════════════════════════════ */
console.log("§F defence works stand and bite; tide wets, sky shoves, stone cracks");
{
  const G = await claim("Battle Arsenal");
  seedTile(G.ownerKey, 0, 0, 0);
  const tP = seedTile(G.ownerKey, 2, 0, 0);
  const tC3 = seedTile(G.ownerKey, 3, 0, 1, "fire");
  const tC4 = seedTile(G.ownerKey, 4, 0, 1, "fire");
  // ROCK WALL — a Stone defender, level 9: six rocks of 10 HP.
  const stone = seedAwokin(G.ownerKey, "Battle Arsenal", "Stone Warden", "stone", 3, 40, 8100);
  const stonePl = placeAwokin(G.ownerKey, stone, tP, 2, 0, { hp: 120, stance: "defense", ordered: true });
  const foe = seedDark(G.ownerKey, tC4, "fray", 4, 0, { hp: 500 });
  await prime(G.ownerKey, G.token);
  await advance(G.ownerKey, G.token, 3000);
  let works = db.prepare("SELECT * FROM defence_works WHERE owner_key = ?").all(G.ownerKey);
  const wall = works.find(w => w.kind === "rockwall" && w.placement_id === stonePl);
  ok("the Stone defender raised her ROCK WALL (6 rocks at level 9)", !!wall && JSON.parse(wall.nodes).length === 6, JSON.stringify(works.map(w => w.kind)));
  ok("each rock carries its level's HP (10 at level 9)", !!wall && JSON.parse(wall.nodes).every(n => n.maxHp === 10), wall ? JSON.stringify(JSON.parse(wall.nodes).map(n => n.maxHp)) : "no wall");
  await advance(G.ownerKey, G.token, 12000);
  const foeRow = darkRow(foe);
  const wallNow = wall ? db.prepare("SELECT * FROM defence_works WHERE id = ?").get(wall.id) : null;
  const rockHp = wallNow ? Math.min(...JSON.parse(wallNow.nodes).map(n => n.hp)) : 0;
  console.log(`  wall: foe at q=${foeRow?.pos_q}; best rock hp ${rockHp}`);
  ok("the dark could not cross the wall in 12s (held at the line)", foeRow && foeRow.pos_q >= 3.2, `q ${foeRow?.pos_q}`);
  ok("the held dark HACKED at the rock (a rock's HP fell, none yet fallen)", rockHp < 10 && rockHp > 0, `rock hp ${rockHp}`);
  // BRAMBLE — retire the wall scene, raise a Root defender; a Fray standing in her thicket dies by thorns.
  db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(G.ownerKey);
  db.prepare("DELETE FROM defence_works WHERE owner_key = ?").run(G.ownerKey);
  db.prepare("DELETE FROM field_placements WHERE owner_key = ?").run(G.ownerKey);
  const root = seedAwokin(G.ownerKey, "Battle Arsenal", "Root Warden", "root", 3, 40, 8100);
  const rootPl = placeAwokin(G.ownerKey, root, tP, 2, 0, { hp: 120, stance: "defense", ordered: true });
  // A work is raised when the dark comes near: a deep-bodied
  // Fray stands at her thicket's edge for the raising (it
  // survives her answers; the thorn trial wounds it after).
  seedDark(G.ownerKey, tC3, "fray", 3, 0, { hp: 200 });
  await advance(G.ownerKey, G.token, 3000);
  works = db.prepare("SELECT * FROM defence_works WHERE owner_key = ?").all(G.ownerKey);
  const bramble = works.find(w => w.kind === "bramble" && w.placement_id === rootPl);
  ok("the Root defender grew her BRAMBLE (one node per part of her body; since WATERING, 2026-10-24, her nodes bear their motes — three a node, in the same list)", !!bramble && JSON.parse(bramble.nodes).filter(n => !n.mote).length === 3 && JSON.parse(bramble.nodes).filter(n => n.mote && n.hp > 0).length === 9, JSON.stringify(works.map(w => w.kind)));
  // Stand the raising Fray ON a bramble node and hold the
  // defender's next answer a minute out (her own battle
  // clock, set as openly as the watermark): in this window
  // ONLY the thicket's thorns can wound it — 1 a beat.
  if (bramble) {
    const node = JSON.parse(bramble.nodes).find(n => n.hp > 0);
    const bait = darkOf(G.ownerKey)[0]?.id;
    db.prepare("UPDATE homeland_wanderers SET pos_q = ?, pos_r = ?, tile_id = ?, hp = 200 WHERE id = ?").run(node.q, node.r, tC3, bait);
    db.prepare("UPDATE field_placements SET battle_next_at = ? WHERE id = ?").run(Date.now() + 60000, rootPl);
    await advance(G.ownerKey, G.token, 10000);
    const hpAfterThorns = darkRow(bait)?.hp ?? 0;
    console.log(`  bramble thorns alone: hp 200 -> ${hpAfterThorns} in a 10s window`);
    ok("the bramble's thorns wound on their own beat (1 per 2.8s: a few points, never a claw's dozen)",
      hpAfterThorns < 200 && hpAfterThorns >= 195, `hp ${hpAfterThorns}`);
    // Now let her answer again and wound the bait to the edge:
    // the defence position finishes it, and the kill banks.
    db.prepare("UPDATE field_placements SET battle_next_at = ? WHERE id = ?").run(Date.now(), rootPl);
    db.prepare("UPDATE homeland_wanderers SET hp = 3 WHERE id = ?").run(bait);
    const bankB0 = progOf(G.ownerKey).protection_bank_ms;
    for (let i = 0; i < 8 && darkRow(bait); i++) await advance(G.ownerKey, G.token, 10000);
    ok("the dark standing in the bramble died on the defence", !darkRow(bait));
    ok("the bramble kill banked the bounty like any kill", progOf(G.ownerKey).protection_bank_ms - bankB0 === 60000, `${progOf(G.ownerKey).protection_bank_ms - bankB0}`);
  }
  // FLAVOURS — one tough Fray, three strikers.
  db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(G.ownerKey);
  db.prepare("DELETE FROM defence_works WHERE owner_key = ?").run(G.ownerKey);
  db.prepare("DELETE FROM field_placements WHERE owner_key = ?").run(G.ownerKey);
  const tide = seedAwokin(G.ownerKey, "Battle Arsenal", "Tide Hand", "tide", 9, 40, 10000);
  // Sky through and through (sum 9 → a shove of 3 tiles).
  const skyH = seedAwokin(G.ownerKey, "Battle Arsenal", "Sky Hand", "sky", 3, 40, 10000);
  const stoneH = seedAwokin(G.ownerKey, "Battle Arsenal", "Stone Hand", "stone", 9, 40, 10000);
  placeAwokin(G.ownerKey, tide, tP, 2, 0, { hp: 120 });
  placeAwokin(G.ownerKey, skyH, tP, 2, 0, { hp: 120 });
  placeAwokin(G.ownerKey, stoneH, tP, 2, 0, { hp: 120 });
  const dummy = seedDark(G.ownerKey, tC3, "fray", 3, 0, { hp: 1000000, power: 1 });
  db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now() - 1000, G.ownerKey);
  let wet = false, cracked = false, shoved = false; const startQ = 3;
  for (let i = 0; i < 14 && !(wet && cracked && shoved); i++) {
    await advance(G.ownerKey, G.token, 8000);
    const d = darkRow(dummy);
    if (!d) break;
    if (d.wet_until > Date.now()) wet = true;
    if (d.cracked >= 1) cracked = true;
    if (Math.abs(d.pos_q - startQ) > 0.9 || Math.abs(d.pos_r) > 0.9) shoved = true;
  }
  const dEnd = darkRow(dummy);
  console.log(`  flavours: wet ${wet}, cracked ${dEnd?.cracked}, end pos (${dEnd?.pos_q?.toFixed(2)}, ${dEnd?.pos_r?.toFixed(2)})`);
  ok("a Tide strike left the foe WET", wet);
  ok("a Stone strike CRACKED the foe (its AC stands opened)", cracked, `cracked ${dEnd?.cracked}`);
  ok("a Sky strike SHOVED the foe off its ground", shoved, `pos (${dEnd?.pos_q}, ${dEnd?.pos_r})`);
}

console.log(`\nDRIVE-BATTLE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
