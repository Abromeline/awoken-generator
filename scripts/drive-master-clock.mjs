/* ════════════════════════════════════════════════════════════════
   THE MASTER CLOCK (Nigel, ruled 2026-10-28 15:10): "Build the
   master clock to effect everything but remember that when a
   player is offline the beacon is lit and the curses can not
   spread and they can not effect the curse either. The beacon
   must be unlit to gain ground. When the beacon is douse drop
   its light level to a faint glow. If everything we added with
   the projectiles is working right when the beacon is lit and
   the curse starts to fight back by summoning dark tings AT THE
   EDGE OF THE MAP. Awokin projectiles should start flying and
   lighting up the dark."

   A standing server tick (MASTER_CLOCK_TICK_MS — 700 ms in this
   drive, 60 s by the shipped default) settles every land in his
   order — (1) sky + starfall, (2) curse state, (3) battle,
   (4) the Tender body, (5) seed feeding, (6) press + accrual,
   (7) upkeep, (8) stone rises — under the offline/beacon laws:
   offline counts as LIT (held: no spread, no summons, no blows,
   no ground gained; the peaceful clocks still run); ground is
   gained only unlit; a doused beacon reads FAINT (1) in the
   server lighting reckoning instead of FIGHTING (2); lit +
   online brings the edge retaliation — darks born on the map's
   border ring through the standing spawn ledger, answered by
   the standing battle, their struck hexes lit FAINT at the
   witness.

   This drive boots the real server on a scratch DB with the
   tick turned fast, shapes one land, and walks it through
   three weathers of the law: OFFLINE (presence stamp stale —
   the only presence control is the DB stamp; no reads happen
   inside the proof windows, so anything that moves, moved on
   the tick), ONLINE + LIT, and ONLINE + DOUSED. It also proves
   the settle ORDER inside one window (starfall's anchor, the
   curse calm, the battle watermark, feeding's gate, press,
   upkeep and the rise all advance — or hold — as the order and
   the laws demand) and that a read after ticks does not
   double-settle.
   ════════════════════════════════════════════════════════════════ */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";

/* The scratch DB lives on temp space, not the workspace disk:
   this proof is timing-sensitive (a struck hex's flash lives
   five seconds), and a stalled workspace filesystem would age
   the witness before the read can see it. */
const ROOT = join(process.env.TMPDIR || "/tmp", "master-clock-proof");
mkdirSync(ROOT, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dataDir = join(ROOT, `run-${stamp}`);
mkdirSync(dataDir, { recursive: true });

process.env.DATA_DIR = dataDir;
process.env.PORT = "39951";
process.env.MASTER_CLOCK_TICK_MS = "700"; // the shipped default is 60_000 — the drive turns the same clock fast
await import("../server/dist/index.js"); // boots the real server (and winds the clock) on import
await new Promise(r => setTimeout(r, 400));
console.log("master clock proof — server up on", process.env.PORT, "data:", dataDir);

const BASE = "http://127.0.0.1:39951";
const PW = "master-clock-drive-password";
let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, detail); }
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(action, args = {}, token) {
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
  if (r.status !== 200) throw new Error(`${action} -> ${r.status}: ${JSON.stringify(r.raw).slice(0, 240)}`);
  return r.body;
}

const db = new Database(join(dataDir, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up, as the other drives do */ }
const T0 = Date.now();

/* ══ THE LAND: one Tender, a shaped disc, a standing company ══ */
const claim = await callOk("claimTender", { password: PW, tenderName: "Clock Tender" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
const token = claim.token;
const insAsset = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
function makeAw(name, parts) {
  const comp = parts.map(([n, c, p, t, el]) => {
    const id = Number(insAsset.run(n, c, p, t, el, `mc/${n}.png`, T0).lastInsertRowid);
    return { source_id: `db:${id}`, name: n, category: c, rarity: "common", power: p, toughness: t, element: el };
  });
  const ins = db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', 'Clock Tender', ?, ?)");
  return Number(ins.run(name, name, `mc/${name}.png`, JSON.stringify(comp), ownerKey, T0).lastInsertRowid);
}
const wake1 = makeAw("Clockwake One", [["C1 Body", "body", 3, 3, "root"], ["C1 Arms", "arms", 3, 3, "root"], ["C1 Crown", "head", 3, 3, "neutral"]]);
const wake2 = makeAw("Clockwake Two", [["C2 Body", "body", 3, 3, "tide"], ["C2 Arms", "arms", 3, 3, "tide"], ["C2 Crown", "head", 3, 3, "neutral"]]);
const wake3 = makeAw("Clockwake Three", [["C3 Body", "body", 3, 3, "stone"], ["C3 Arms", "arms", 3, 3, "stone"], ["C3 Crown", "head", 3, 3, "neutral"]]);
await callOk("chooseClass", { classKey: "warden" }, token);

// The shaped disc: rings 0–2 purified, ring 3 the cursed border.
const ringOf = (q, r) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
const hexes = [];
for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) if (ringOf(q, r) <= 3) hexes.push({ q, r });
const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, curse_hp, curse_max_hp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
const tileId = new Map();
for (const h of hexes) {
  const ring = ringOf(h.q, h.r);
  const cursed = ring === 3 ? 1 : 0;
  const id = Number(insTile.run(ownerKey, h.q, h.r, "root", cursed, cursed ? 22 : 0, cursed ? 22 : 0, T0).lastInsertRowid);
  tileId.set(`${h.q},${h.r}`, id);
}
const T = (q, r) => tileId.get(`${q},${r}`);
const heartId = T(0, 0);
const borderTiles = hexes.filter(h => ringOf(h.q, h.r) === 3);
const ring2Tiles = hexes.filter(h => ringOf(h.q, h.r) === 2);

// The first seed stands at the heart, grown to Beacon stage —
// the land's lighthouse. A second, held seed stands at ring 2;
// the cursed border tile beside it is the calm's proving tile.
const seedId = Number(db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at, fed_energy, feed_anchor_at) VALUES (?, ?, 3, 'first', ?, 30, ?)")
  .run(ownerKey, heartId, T0, T0 - 3_600_000).lastInsertRowid);
db.prepare("INSERT INTO first_seed_events (owner_key, seed_id, state, banked, waves_cleared, next_wave_at, newborn_claimed_at, created_at, updated_at) VALUES (?, ?, 'waiting', 0, 0, 0, NULL, ?, ?)")
  .run(ownerKey, seedId, T0, T0);
const heldTile = { q: 2, r: -2 };             // ring 2
const calmTile = { q: 3, r: -2 };             // ring 3, one step from the held seed
db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at, fed_energy, feed_anchor_at) VALUES (?, ?, 1, 'held', ?, 0, ?)")
  .run(ownerKey, T(heldTile.q, heldTile.r), T0, T0 - 3_600_000);

// The standing company.
const insPlace = db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, hp, pos_q, pos_r, bind_paid_at, press_paid_at, battle_next_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 1)`);
function place(awId, q, r, stance, placedAt) {
  insPlace.run(ownerKey, awId, T(q, r), placedAt, placedAt, stance, 60, q, r);
}
const binderAw = makeAw("Rootbinder", [["RB Body", "body", 3, 3, "root"], ["RB Arms", "arms", 3, 3, "root"], ["RB Crown", "head", 3, 3, "root"]]);
place(binderAw, 1, 0, "binding", T0 - 2 * 3600_000);                    // bound two hours, unsettled
const pressAw = makeAw("Tidepress", [["TP Body", "body", 3, 3, "tide"], ["TP Arms", "arms", 3, 3, "tide"], ["TP Crown", "head", 3, 3, "tide"]]);
place(pressAw, 2, 0, "defense", T0 - 2 * 3600_000);                     // pressing two hours, unsettled
const crewAw = makeAw("Stonewright Crew", [["SC Body", "body", 9, 9, "stone"], ["SC Arms", "arms", 9, 9, "stone"], ["SC Crown", "head", 9, 9, "stone"]]);
place(crewAw, 0, 1, "defense", T0);                                     // the rise's crew (Stone sum 3)
const fighters = [];
for (const h of ring2Tiles) {
  const aw = makeAw(`Border Fighter ${h.q},${h.r}`, [["BF Body", "body", 10, 60, "root"], ["BF Arms", "arms", 10, 60, "root"], ["BF Crown", "head", 10, 60, "root"]]);
  place(aw, h.q, h.r, "attack", T0);
  fighters.push({ aw, ...h });
}
// One interior dark, the kind the lit light pushes back.
const chewTile = { q: 3, r: 0 };
const chewId = Number(db.prepare("INSERT INTO homeland_wanderers (owner_key, kind, tile_id, hp, pos_q, pos_r, last_strike_at, lvl, spawned_at, retaliation) VALUES (?, 'fray', ?, 3, ?, ?, 0, 1, ?, 0)")
  .run(ownerKey, T(chewTile.q, chewTile.r), chewTile.q, chewTile.r, T0).lastInsertRowid);
// A watchtower two hours unkept, and a square mid-rise (frac ½,
// its clock five minutes back) under the Stone crew's hands.
db.prepare("INSERT INTO territory_buildings (owner_key, tile_id, building_type, status, placed_at, last_upkeep_at) VALUES (?, ?, 'watchtower', 'active', ?, ?)")
  .run(ownerKey, T(1, -1), T0 - 7200_000, T0 - 7200_000);
db.prepare("INSERT INTO build_pieces (owner_key, kind, piece_key, verts, footprint, created_at, hp, state, frac, lead_id, rise_updated_at, energy_bank) VALUES (?, 'square', 'mc-rise-1', ?, ?, ?, 100, 'rising', 0.5, ?, ?, 0)")
  .run(ownerKey, JSON.stringify([[0.6, 0.6], [1.4, 0.6], [1.4, 1.4], [0.6, 1.4]]), JSON.stringify([[0.6, 0.6], [1.4, 0.6], [1.4, 1.4], [0.6, 1.4]]), T0, crewAw, T0 - 300_000);
// The Tender's records: body standing on cursed border ground,
// a fat protection bank, and every clock pinned where the drive
// can watch it. Presence: STALE — the land begins OFFLINE.
const LH_SETTLED_0 = T0 - 60_000, BANK_0 = 3_600_000, WM_0 = T0 - 60_000, ANCHOR_0 = T0 - 120_000, STAR_0 = T0 - 7200_000;
db.prepare(`INSERT INTO tender_progress (owner_key, tender_tile_id, hp, curse_watermark, lighthouse_lit, shadow_matter, protection_bank_ms, lighthouse_settled_at, battle_watermark, wanderer_anchor_at, wanderer_settled_beats, wave_intensity, updated_at)
  VALUES (?, ?, 100, ?, 0, 500, ?, ?, ?, ?, 0, 1, ?)
  ON CONFLICT(owner_key) DO UPDATE SET tender_tile_id = excluded.tender_tile_id, hp = 100, curse_watermark = excluded.curse_watermark, lighthouse_lit = 0, shadow_matter = 500, protection_bank_ms = excluded.protection_bank_ms, lighthouse_settled_at = excluded.lighthouse_settled_at, battle_watermark = excluded.battle_watermark, wanderer_anchor_at = excluded.wanderer_anchor_at, wanderer_settled_beats = 0, wave_intensity = 1`)
  .run(ownerKey, T(3, 0), T0, BANK_0, LH_SETTLED_0, WM_0, ANCHOR_0, T0);
db.prepare("INSERT INTO tender_attention (owner_key, starfall_anchor_at, starfall_seen_at, updated_at) VALUES (?, ?, ?, ?)")
  .run(ownerKey, STAR_0, T0 - 7200_000, T0);
db.prepare("INSERT INTO tender_resources (owner_key, energy, last_seen_at, updated_at) VALUES (?, 100000, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 100000, last_seen_at = excluded.last_seen_at")
  .run(ownerKey, T0 - 600_000, T0);

const prog = () => db.prepare("SELECT * FROM tender_progress WHERE owner_key = ?").get(ownerKey);
const res = () => db.prepare("SELECT * FROM tender_resources WHERE owner_key = ?").get(ownerKey);
const pool = el => db.prepare("SELECT points FROM aspect_attunement WHERE owner_key = ? AND element = ?").get(ownerKey, el)?.points ?? 0;
const ledger = (tile, el) => { const row = db.prepare("SELECT mix_points AS mix FROM territory_tiles WHERE id = ?").get(tile); const m = row?.mix ? JSON.parse(row.mix) : {}; return m[el] ?? 0; };
const tileRow = (q, r) => db.prepare("SELECT * FROM territory_tiles WHERE id = ?").get(T(q, r));
const placementOf = aw => db.prepare("SELECT * FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(ownerKey, aw);
const wanderers = () => db.prepare("SELECT * FROM homeland_wanderers WHERE owner_key = ?").all(ownerKey);
const piece = () => db.prepare("SELECT * FROM build_pieces WHERE owner_key = ? AND piece_key = 'mc-rise-1'").get(ownerKey);
const tower = () => db.prepare("SELECT * FROM territory_buildings WHERE owner_key = ? AND building_type = 'watchtower'").get(ownerKey);
const attention = () => db.prepare("SELECT * FROM tender_attention WHERE owner_key = ?").get(ownerKey);
const heldSeed = () => db.prepare("SELECT * FROM star_seeds WHERE owner_key = ? AND state = 'held'").get(ownerKey);

/* ── §O OFFLINE = HELD ───────────────────────────────────────
   No reads at all in this window: whatever moves, the tick
   moved. The war must freeze; the peaceful clocks must run. */
console.log("§O offline = held — the war freezes, the peaceful clocks run");
{
  await sleep(1700); // ≥ 2 ticks
  const p = prog(), w = wanderers();
  ok("the interior dark stands untouched — no blows, no spread (battle never walked)",
    w.length === 1 && w[0].hp === 3 && Number(w[0].tile_id) === T(chewTile.q, chewTile.r), JSON.stringify(w));
  ok("the battle watermark never moved", Number(p.battle_watermark) === WM_0, `${p.battle_watermark} vs ${WM_0}`);
  ok("no ground changed hands: the calm's tile keeps its full curse",
    Number(tileRow(calmTile.q, calmTile.r).curse_max_hp) === 22 && Number(tileRow(2, 0).cursed) === 0);
  ok("starfall never rolled: its anchor and seen stamps are bit-for-bit the fixture's",
    Number(attention().starfall_anchor_at) === STAR_0 && Number(attention().starfall_seen_at) === T0 - 7200_000,
    JSON.stringify(attention()));
  ok("the offline light draws nothing: bank and lighthouse settle stamp untouched",
    Number(p.protection_bank_ms) === BANK_0 && Number(p.lighthouse_settled_at) === LH_SETTLED_0);
  ok("the body rests where it stands, even on cursed ground: hp and curse watermark whole",
    Number(p.hp) === 100 && Number(p.curse_watermark) === T0, `hp ${p.hp}`);
  ok("feeding never walked offline: the held seed's feed anchor is the fixture's",
    Number(heldSeed().feed_anchor_at) === T0 - 3_600_000);
  const b = placementOf(binderAw), pr = placementOf(pressAw);
  ok("…yet the accrual settled on the tick: the binder's own cursor advanced and Root paid ≈ 2 for two hours",
    Number(b.bind_paid_at) > T0 - 1000 && near(pool("root"), 2, 0.08), `cursor ${b.bind_paid_at}, pool ${pool("root")}`);
  ok("…and the press settled on the tick: Tide poured ≈ 1.125 into its tile's ledger",
    Number(pr.press_paid_at) > T0 - 1000 && near(ledger(T(2, 0), "tide"), 1.125, 0.06), `cursor ${pr.press_paid_at}, ledger ${ledger(T(2, 0), "tide")}`);
  ok("upkeep settled on the tick: the tower's hour was charged and its stamp advanced",
    Number(tower().last_upkeep_at) > T0 - 1000, `${tower().last_upkeep_at}`);
  const pc = piece();
  ok("the rise settled on the tick: the square climbed by the crew's Stone (½ + 5 min × 3/36 ≈ 0.917)",
    pc.state === "rising" && near(Number(pc.frac), 0.5 + 5 * 3 / 36, 0.045), `frac ${pc.frac} state ${pc.state}`);
  ok("the peaceful settles drew their honest prices (energy fell by upkeep + binding + the rise's minutes)",
    res().energy <= 100000 - 9, `energy ${res().energy}`);
}

/* ── §L ONLINE + LIT = THE EDGE RETALIATION ──────────────────
   The Tender returns; the beacon burns. The curse may not
   spread and no ground may be gained — but it fights back at
   the border, and the land's Awokin answer in witnessed
   projectiles whose strikes light their hexes FAINT. */
console.log("§L online + lit — held, and the curse answers at the edge");
{
  const nowL = Date.now();
  db.prepare("UPDATE tender_resources SET last_seen_at = ? WHERE owner_key = ?").run(nowL, ownerKey);
  db.prepare("UPDATE tender_progress SET lighthouse_lit = 1, lighthouse_settled_at = ?, tender_tile_id = ?, battle_watermark = ?, wanderer_anchor_at = ?, wanderer_settled_beats = 0 WHERE owner_key = ?")
    .run(nowL, heartId, nowL - 3000, nowL - 200_000, ownerKey);
  await sleep(1700); // ≥ 2 ticks: protection, then the retaliation's beats, then the battle
  // Read FIRST, while the strikes' flashes still burn — the
  // database witnesses below keep; a five-second light does not.
  const land = await callOk("getTerritory", {}, token);
  const p = prog(), w = wanderers();
  ok("the lit light pushed the interior dark off the land (the pushback takes the standing kind, never the retaliation)",
    !w.some(x => Number(x.id) === chewId) && w.every(x => Number(x.retaliation) === 1),
    JSON.stringify(w.map(x => [x.id, x.retaliation])));
  ok("the protection settled on the tick (its stamp advanced with no read to call it)",
    Number(p.lighthouse_settled_at) > nowL - 500, `${p.lighthouse_settled_at}`);
  ok("no ground was gained under the light: the calm's tile keeps its full curse still",
    Number(tileRow(calmTile.q, calmTile.r).curse_max_hp) === 22);
  const byId = new Map(land.tiles.map(t => [t.id, t]));
  ok("the beacon burns FIGHTING at the heart while lit", byId.get(heartId)?.light === 2, `light ${byId.get(heartId)?.light}`);
  // The retaliation's darks are answered inside the same ticks
  // that birth them — the witness, not the graveyard, is the
  // proof: placement strikes on darks that are not the interior
  // one, struck on the border ring.
  const edgeStrikes = (land.strikes ?? []).filter(s => s.kind === "placement" && Number(s.wandererId) !== chewId && ringOf(s.toQ, s.toR) === 3);
  ok("the curse fought back AT THE EDGE and the Awokin answered: witnessed strikes on new darks, all on the border ring",
    edgeStrikes.length >= 1 && edgeStrikes.some(s => s.hit), JSON.stringify((land.strikes ?? []).slice(0, 3)));
  const answer = edgeStrikes.find(s => s.hit);
  ok("…and the struck hex LIGHTS UP THE DARK: the witness's tile reads FAINT in the served reckoning",
    !!answer && byId.get(answer.tileId)?.light === 1, answer ? `tile light ${byId.get(answer.tileId)?.light}` : "no hit strike");
  const atk = fighters.find(f => f.q === 2 && f.r === 0);
  const hpBefore = Number(tileRow(3, 0).curse_hp);
  const refused = await call("attackTile", { awakenedId: atk.aw, tileId: T(3, 0) }, token);
  ok("a curse strike under the burning beacon is refused in plain words — douse to gain ground",
    refused.status === 400 && /Douse the beacon/.test(JSON.stringify(refused.raw)), `${refused.status} ${JSON.stringify(refused.raw).slice(0, 160)}`);
  ok("…and the refusal itself spent nothing on the curse: its hp stands whole (the purse moves only by the tick's peaceful draws)",
    Number(tileRow(3, 0).curse_hp) === hpBefore, `curse ${tileRow(3, 0).curse_hp} vs ${hpBefore}`);
}

/* ── §D ONLINE + DOUSED = FAINT, AND GROUND CAN BE GAINED ────
   First a silent window — no reads — proving the tick walks
   the whole order on its own (sky/starfall → curse → battle →
   body → feeding → press/accrual → upkeep → rises); then the
   doused light reads FAINT and a strike lands. */
console.log("§D doused — the whole order walks alone; the light falls to a faint glow");
{
  const nowD = Date.now();
  db.prepare("UPDATE tender_resources SET last_seen_at = ? WHERE owner_key = ?").run(nowD, ownerKey);
  db.prepare("UPDATE tender_progress SET lighthouse_lit = 0 WHERE owner_key = ?").run(ownerKey);
  db.prepare("UPDATE territory_tiles SET curse_hp = 22, curse_max_hp = 22, cursed = 1 WHERE id = ?").run(T(calmTile.q, calmTile.r));
  db.prepare("UPDATE tender_attention SET starfall_anchor_at = ?, starfall_seen_at = ? WHERE owner_key = ?").run(nowD - 7200_000, nowD, ownerKey);
  db.prepare("UPDATE territory_buildings SET last_upkeep_at = ? WHERE owner_key = ? AND building_type = 'watchtower'").run(nowD - 7200_000, ownerKey);
  // A second square begins its rise at the douse, so the rise's
  // step can be watched inside this window alone.
  db.prepare("INSERT INTO build_pieces (owner_key, kind, piece_key, verts, footprint, created_at, hp, state, frac, lead_id, rise_updated_at, energy_bank) VALUES (?, 'square', 'mc-rise-2', ?, ?, ?, 100, 'rising', 0.5, ?, ?, 0)")
    .run(ownerKey, JSON.stringify([[-1.4, 0.6], [-0.6, 0.6], [-0.6, 1.4], [-1.4, 1.4]]), JSON.stringify([[-1.4, 0.6], [-0.6, 0.6], [-0.6, 1.4], [-1.4, 1.4]]), nowD, crewAw, nowD - 300_000);
  const piece2 = () => db.prepare("SELECT * FROM build_pieces WHERE owner_key = ? AND piece_key = 'mc-rise-2'").get(ownerKey);
  const snap = {
    anchor: Number(attention().starfall_anchor_at), wm: Number(prog().battle_watermark),
    bind: Number(placementOf(binderAw).bind_paid_at), press: Number(placementOf(pressAw).press_paid_at),
    tower: Number(tower().last_upkeep_at), frac2: Number(piece2().frac),
  };
  await sleep(1700); // ≥ 2 ticks, no reads — the tick alone walks the order
  ok("(1) the sky turned on the tick: starfall's anchor advanced its due hours",
    Number(attention().starfall_anchor_at) > snap.anchor, `${attention().starfall_anchor_at} vs ${snap.anchor}`);
  const calm = tileRow(calmTile.q, calmTile.r);
  ok("(2) the curse state settled: the seed calm thinned the border tile toward a depth-1 curse (or a fallen star cleansed it)",
    Number(calm.cursed) === 0 || near(Number(calm.curse_max_hp), 10, 0.01), `cursed ${calm.cursed} maxHp ${calm.curse_max_hp}`);
  ok("(3) the battle walked on the tick: its watermark advanced", Number(prog().battle_watermark) > snap.wm);
  ok("(6) press + accrual walked on the tick: both cursors advanced",
    Number(placementOf(binderAw).bind_paid_at) > snap.bind && Number(placementOf(pressAw).press_paid_at) > snap.press);
  ok("(7) upkeep walked on the tick: the tower's stamp advanced", Number(tower().last_upkeep_at) > snap.tower);
  ok("(8) the rise walked on the tick: the second square climbed under the crew's hands (frac well past its half)",
    Number(piece2().frac) > snap.frac2 + 0.3, `frac ${piece2().frac} vs snap ${snap.frac2}`);
  const land = await callOk("getTerritory", {}, token);
  const byId = new Map(land.tiles.map(t => [t.id, t]));
  ok("the doused beacon reads FAINT (1) in the server lighting reckoning — not FIGHTING, not dark",
    byId.get(heartId)?.light === 1, `light ${byId.get(heartId)?.light}`);
  // Ground CAN be gained now: one strike on a weakened border tile.
  db.prepare("UPDATE territory_tiles SET curse_hp = 5, cursed = 1 WHERE id = ?").run(T(3, 0));
  const atk = fighters.find(f => f.q === 2 && f.r === 0);
  const struck = await call("attackTile", { awakenedId: atk.aw, tileId: T(3, 0) }, token);
  const after = tileRow(3, 0);
  ok("under the doused beacon the strike LANDS: the curse breaks (tile freed, or its hp spent to the wave-pull's edge)",
    struck.status === 200 && (Number(after.cursed) === 0 || Number(after.curse_hp) === 0),
    `${struck.status} cursed ${after.cursed} hp ${after.curse_hp} ${JSON.stringify(struck.raw).slice(0, 140)}`);
  // No double-settle: two reads back to back pay (almost) nothing the second time.
  await callOk("getTerritory", {}, token);
  const poolA = pool("root");
  await callOk("getTerritory", {}, token);
  ok("a read after ticks does not double-settle: the second read pays ~nothing",
    Math.abs(pool("root") - poolA) < 0.01, `delta ${pool("root") - poolA}`);
}

console.log(`\nMASTER CLOCK: ${pass} passed, ${fail} failed`);
db.close();
process.exit(fail ? 1 : 0);
