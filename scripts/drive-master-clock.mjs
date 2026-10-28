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
   server lighting reckoning instead of FIGHTING (2); lit
   means NO enemies at all — while the beacon burns, no dark
   is born anywhere on the land and the standing dark is
   driven off. A struck hex still flashes FAINT at the
   witness — the projectiles lighting up the dark — and it
   belongs to fights, which happen while doused.

   THE EDGE RETALIATION IS STRUCK (Nigel, 2026-10-28
   17:10): "edge mark? i dont think that necessary if he
   beacon is on there are no enemies if its of they can
   attakc thats it" — the retaliation first built from the
   15:10 words above (border-ring births while lit, marked
   and spared by the pushback) is struck whole: no edge
   mark, no retaliation summoning, no spared class. THE
   LAW AS IT STANDS, and the law this drive asserts:
   beacon lit → NO enemies; beacon doused → they can
   attack. That is all of it.

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

   THE TWO GEARS (Nigel, 2026-10-28 16:29, correcting the
   build above): "i want attacks ands and movement to be
   reconcileed life [live]. not counted every 60 seconds.
   attunement was the only thing i wanted tracked at 60
   seconds .. i want the world clock to be a realtime clock
   lick [like] realtime strategy." The clock now turns on
   two gears: the SLOW gear (the tick, 60 s — his number
   for attunement; feeding, upkeep and rises ride it) and
   the REALTIME gear (500 ms, the battle engine's own
   sub-step grain — turned to 200 ms in this drive), which
   reconciles attacks and movement live for every land
   whose war is live, and idles over quiet and away lands.
   §R below proves the gears apart: a SECOND server whose
   slow hand is set an hour wide (it never turns inside
   the drive) fights a whole battle on the realtime gear
   alone — the watermark advancing in small live steps,
   never one lump — while its attunement cursor does not
   move at all (attunement is the slow gear's alone), and
   a read in the middle of it settles nothing
   twice — then, the beacon lit on the same gear, the
   pushback drives the standing dark off and not one dark
   is born (the 17:10 law, proven on the gear alone). The face reads at the same grain: while a battle
   stands, the homeland map's read loop polls at 500 ms
   and relaxes to the 2.8 s battle beat when none does
   (Territory.tsx, HOMELAND_REALTIME_READ_MS).
   ════════════════════════════════════════════════════════════════ */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";
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
process.env.MASTER_CLOCK_REALTIME_MS = "200"; // the shipped default is 500 — the realtime gear, turned fast to match
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
const chewId = Number(db.prepare("INSERT INTO homeland_wanderers (owner_key, kind, tile_id, hp, pos_q, pos_r, last_strike_at, lvl, spawned_at) VALUES (?, 'fray', ?, 3, ?, ?, 0, 1, ?)")
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

/* ── §L ONLINE + LIT = NO ENEMIES ────────────────────────────
   The Tender returns; the beacon burns. THE LAW (Nigel,
   2026-10-28 17:10): while the beacon is on there are no
   enemies — the pushback drives the interior dark off and
   NOT ONE dark is born anywhere on the land, across slow
   ticks and realtime beats alike; no ground may be gained
   either. The fight, and the strikes that light up the
   dark, belong to the doused hours (§D, §R). */
console.log("§L online + lit — no enemies under a burning beacon");
{
  const nowL = Date.now();
  db.prepare("UPDATE tender_resources SET last_seen_at = ? WHERE owner_key = ?").run(nowL, ownerKey);
  db.prepare("UPDATE tender_progress SET lighthouse_lit = 1, lighthouse_settled_at = ?, tender_tile_id = ?, battle_watermark = ?, wanderer_anchor_at = ?, wanderer_settled_beats = 0 WHERE owner_key = ?")
    .run(nowL, heartId, nowL - 3000, nowL - 200_000, ownerKey);
  await sleep(1700); // ≥ 2 ticks: the protection's pushback walks, on both gears
  // Read FIRST, while the reckoning is fresh — the database
  // witnesses below keep either way.
  const land = await callOk("getTerritory", {}, token);
  const p = prog(), w = wanderers();
  ok("under the burning beacon there are NO enemies: the pushback drove the interior dark off and not one dark was born in its place",
    w.length === 0 && !w.some(x => Number(x.id) === chewId),
    JSON.stringify(w.map(x => x.id)));
  ok("the protection settled on the tick (its stamp advanced with no read to call it)",
    Number(p.lighthouse_settled_at) > nowL - 500, `${p.lighthouse_settled_at}`);
  ok("no ground was gained under the light: the calm's tile keeps its full curse still",
    Number(tileRow(calmTile.q, calmTile.r).curse_max_hp) === 22);
  const byId = new Map(land.tiles.map(t => [t.id, t]));
  ok("the beacon burns FIGHTING at the heart while lit", byId.get(heartId)?.light === 2, `light ${byId.get(heartId)?.light}`);
  ok("…and no fight happened under the light: the witness holds no placement strikes struck since the beacon lit",
    (land.strikes ?? []).filter(s => s.kind === "placement" && Number(s.at) >= nowL - 250).length === 0,
    JSON.stringify((land.strikes ?? []).slice(0, 3)));
  const atk = fighters.find(f => f.q === 2 && f.r === 0);
  const hpBefore = Number(tileRow(3, 0).curse_hp);
  const refused = await call("attackTile", { awakenedId: atk.aw, tileId: T(3, 0) }, token);
  ok("a curse strike under the burning beacon is refused in plain words — douse to gain ground",
    refused.status === 400 && /Douse the beacon/.test(JSON.stringify(refused.raw)), `${refused.status} ${JSON.stringify(refused.raw).slice(0, 160)}`);
  ok("…and the refusal itself spent nothing on the curse: its hp stands whole (the purse moves only by the tick's peaceful draws)",
    Number(tileRow(3, 0).curse_hp) === hpBefore, `curse ${tileRow(3, 0).curse_hp} vs ${hpBefore}`);
}

/* ── §D ONLINE + DOUSED = FAINT, AND GROUND CAN BE GAINED ────
   First a silent window — no reads — proving the clock walks
   the whole order on its own (sky/starfall → curse → battle →
   body → feeding → press/accrual → upkeep → rises; since the
   two-gears amendment the battle walks on the realtime gear
   and the rest on the slow tick — the order's proofs below
   read the same stamps either way); then the doused light
   reads FAINT and a strike lands. */
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

/* ── §R THE TWO GEARS — the war reconciled LIVE ──────────────
   A second server, booted as a child: its SLOW hand is set
   an hour wide, so inside this section it never turns at
   all; its realtime hand turns at 200 ms, as server A's
   does. One land, online and doused: a dark stands against
   a fighter, the battle watermark pinned three seconds
   back, and a binder two hours into its span. No reads
   happen inside the proof windows — whatever the war does,
   the realtime gear did it; whatever attunement does not
   do proves the gears apart. */
console.log("§R the two gears — attacks and movement live; attunement keeps the slow gear");
let child = null, dbB = null;
{
  const dirB = join(ROOT, `run-b-${stamp}`);
  mkdirSync(dirB, { recursive: true });
  const BASE_B = "http://127.0.0.1:39952";
  const logFd = openSync(join(ROOT, "server-b.log"), "a");
  child = spawn(process.execPath, [new URL("../server/dist/index.js", import.meta.url).pathname], {
    env: { ...process.env, DATA_DIR: dirB, PORT: "39952", MASTER_CLOCK_TICK_MS: "3600000", MASTER_CLOCK_REALTIME_MS: "200" },
    stdio: ["ignore", logFd, logFd],
  });
  // However this drive ends — a thrown fixture, a failed
  // boot — the child never outlives it: an orphaned server
  // on this port would hold the next run's name and land.
  const childPid = child.pid;
  process.once("exit", () => { try { process.kill(childPid, "SIGKILL"); } catch { /* already gone */ } });
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try { const r = await fetch(`${BASE_B}/api/getTerritory`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); if (r.status) up = true; }
    catch { await sleep(250); }
  }
  ok("the second server stands (its slow hand an hour wide — it never turns in this section)", up);
  const callB = async (action, args = {}, tok) => {
    const res = await fetch(`${BASE_B}/api/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(tok ? { "x-tender-token": tok } : {}) },
      body: JSON.stringify(args),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, body: data?.data ?? data, raw: data };
  };
  const callOkB = async (action, args, tok) => {
    const r = await callB(action, args, tok);
    if (r.status !== 200) throw new Error(`B ${action} -> ${r.status}: ${JSON.stringify(r.raw).slice(0, 240)}`);
    return r.body;
  };
  dbB = new Database(join(dirB, "app.db"));
  try { dbB.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up */ }
  const claimB = await callOkB("claimTender", { password: PW, tenderName: "Realtime Tender" });
  const tenderIdB = dbB.prepare("SELECT id FROM tenders WHERE code = ?").get(claimB.tender.code).id;
  const keyB = `tender:${tenderIdB}`;
  const tokenB = claimB.token;
  const insAssetB = dbB.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
  const TB = Date.now();
  const makeAwB = (name, parts) => {
    const comp = parts.map(([n, c, p, t, el]) => {
      const id = Number(insAssetB.run(n, c, p, t, el, `rt/${n}.png`, TB).lastInsertRowid);
      return { source_id: `db:${id}`, name: n, category: c, rarity: "common", power: p, toughness: t, element: el };
    });
    return Number(dbB.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', 'Realtime Tender', ?, ?)")
      .run(name, name, `rt/${name}.png`, JSON.stringify(comp), keyB, TB).lastInsertRowid);
  };
  makeAwB("Realtime Wake One", [["R1 Body", "body", 3, 3, "root"], ["R1 Arms", "arms", 3, 3, "root"], ["R1 Crown", "head", 3, 3, "neutral"]]);
  makeAwB("Realtime Wake Two", [["R2 Body", "body", 3, 3, "tide"], ["R2 Arms", "arms", 3, 3, "tide"], ["R2 Crown", "head", 3, 3, "neutral"]]);
  makeAwB("Realtime Wake Three", [["R3 Body", "body", 3, 3, "stone"], ["R3 Arms", "arms", 3, 3, "stone"], ["R3 Crown", "head", 3, 3, "neutral"]]);
  await callOkB("chooseClass", { classKey: "warden" }, tokenB);
  // The land: a shaped disc first (rings 0–2 purified,
  // ring 3 cursed — the fixture's own ground), then ONE
  // read, taken while no placement or dark exists for a
  // settle to reckon with: the frontier buffer law mints
  // its cursed buffer five rings beyond the purified rim
  // on reads, so after that read the land stands at its
  // true standing shape — its edge ring 7 — and does not
  // grow again inside this section (nothing here purifies
  // new ground). (Server A's §L never needed this: its
  // proofs turn on the shaped disc's own ground, while
  // this section proves the gears on the land as it
  // truly stands.)
  const bornB = Date.now();
  dbB.prepare("INSERT INTO tender_attention (owner_key, starfall_anchor_at, starfall_seen_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(owner_key) DO NOTHING")
    .run(keyB, bornB, bornB, bornB);
  dbB.prepare("INSERT INTO tender_resources (owner_key, energy, last_seen_at, updated_at) VALUES (?, 100000, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 100000, last_seen_at = excluded.last_seen_at")
    .run(keyB, bornB, bornB);
  const insTileB = dbB.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, curse_hp, curse_max_hp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  for (const h of hexes) {
    const ring = ringOf(h.q, h.r);
    const cursed = ring === 3 ? 1 : 0;
    insTileB.run(keyB, h.q, h.r, "root", cursed, cursed ? 22 : 0, cursed ? 22 : 0, TB);
  }
  await callOkB("getTerritory", {}, tokenB); // the buffer grows; nothing else stands to settle
  const tileIdB = new Map();
  for (const t of dbB.prepare("SELECT id, q, r FROM territory_tiles WHERE owner_key = ?").all(keyB)) tileIdB.set(`${t.q},${t.r}`, t.id);
  const TBq = (q, r) => tileIdB.get(`${q},${r}`);
  const mapRingB = Math.max(...[...tileIdB.keys()].map(k => { const [q, r] = k.split(",").map(Number); return ringOf(q, r); }));
  ok("the second land stands complete: frontier buffer grown, its edge is ring 7",
    mapRingB === 7 && tileIdB.size >= 169, `ring ${mapRingB}, tiles ${tileIdB.size}`);
  const insPlaceB = dbB.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, hp, pos_q, pos_r, bind_paid_at, press_paid_at, battle_next_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 1)`);
  const binderB = makeAwB("Realtime Rootbinder", [["RRB Body", "body", 3, 3, "root"], ["RRB Arms", "arms", 3, 3, "root"], ["RRB Crown", "head", 3, 3, "root"]]);
  insPlaceB.run(keyB, binderB, TBq(1, 0), TB - 2 * 3600_000, TB - 2 * 3600_000, "binding", 60, 1, 0);
  const fighterB = makeAwB("Realtime Fighter", [["RF Body", "body", 10, 60, "root"], ["RF Arms", "arms", 10, 60, "root"], ["RF Crown", "head", 10, 60, "root"]]);
  insPlaceB.run(keyB, fighterB, TBq(2, 0), TB, TB, "attack", 60, 2, 0);
  const darkB = Number(dbB.prepare("INSERT INTO homeland_wanderers (owner_key, kind, tile_id, hp, pos_q, pos_r, last_strike_at, lvl, spawned_at) VALUES (?, 'fray', ?, 3, 3, 0, 0, 1, ?)")
    .run(keyB, TBq(3, 0), TB).lastInsertRowid);
  // A second, long fight across the land — a dark too
  // deep to fell inside this section, against its own
  // fighter — so the war is still live while the
  // watermark is sampled and the reads are taken: the
  // gear must keep reconciling, not finish and idle.
  const fighterB2 = makeAwB("Realtime Long Fighter", [["RLF Body", "body", 10, 60, "root"], ["RLF Arms", "arms", 10, 60, "root"], ["RLF Crown", "head", 10, 60, "root"]]);
  insPlaceB.run(keyB, fighterB2, TBq(-2, 0), TB, TB, "attack", 60, -2, 0);
  const darkFatB = Number(dbB.prepare("INSERT INTO homeland_wanderers (owner_key, kind, tile_id, hp, pos_q, pos_r, last_strike_at, lvl, spawned_at) VALUES (?, 'fray', ?, 100000, -3, 0, 0, 1, ?)")
    .run(keyB, TBq(-3, 0), TB).lastInsertRowid);
  void darkFatB;
  // The pins land LAST, in one breath: presence fresh, the
  // beacon doused, the watermark three seconds behind the
  // world, the cradle's anchor fresh (no births owed). The
  // bank and the hoard ride the conflict clause by name —
  // a fixture lesson (2026-10-28): this statement's first
  // shape carried them only in its VALUES, and the row
  // already stood (the setup read had made it), so the
  // land kept an empty hoard; when §R later lit the
  // beacon on that land, the first protection settle
  // lawfully guttered the fuelless light inside a breath
  // and the cradle spent the rewound beats on a land the
  // drive believed lit. The server was never wrong; the
  // pin had not built the land it described.
  const pinB = Date.now();
  dbB.prepare(`INSERT INTO tender_progress (owner_key, tender_tile_id, hp, curse_watermark, lighthouse_lit, shadow_matter, protection_bank_ms, lighthouse_settled_at, battle_watermark, wanderer_anchor_at, wanderer_settled_beats, wave_intensity, updated_at)
    VALUES (?, ?, 100, ?, 0, 500, 3600000, ?, ?, ?, 0, 1, ?)
    ON CONFLICT(owner_key) DO UPDATE SET tender_tile_id = excluded.tender_tile_id, hp = 100, curse_watermark = excluded.curse_watermark, lighthouse_lit = 0, shadow_matter = excluded.shadow_matter, protection_bank_ms = excluded.protection_bank_ms, battle_watermark = excluded.battle_watermark, wanderer_anchor_at = excluded.wanderer_anchor_at, wanderer_settled_beats = 0, wave_intensity = 1`)
    .run(keyB, TBq(0, 0), pinB, pinB, pinB - 3000, pinB, pinB);
  dbB.prepare("INSERT INTO tender_resources (owner_key, energy, last_seen_at, updated_at) VALUES (?, 100000, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 100000, last_seen_at = excluded.last_seen_at")
    .run(keyB, pinB, pinB);
  const progB = () => dbB.prepare("SELECT * FROM tender_progress WHERE owner_key = ?").get(keyB);
  const binderRowB = () => dbB.prepare("SELECT * FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(keyB, binderB);
  const poolB = el => dbB.prepare("SELECT points FROM aspect_attunement WHERE owner_key = ? AND element = ?").get(keyB, el)?.points ?? 0;

  // R1 — the watermark advances in small live steps, never
  // one 60-second lump (and the slow hand cannot have moved
  // it: its interval is an hour). The long fight across the
  // land keeps the war live through the whole sampling.
  const marks = [];
  for (let i = 0; i < 5; i++) { marks.push(Number(progB().battle_watermark)); await sleep(300); }
  const distinct = new Set(marks).size;
  ok("the battle watermark advances LIVE — several small steps across 1.5 s, none a lump, none past the moment",
    distinct >= 3 && marks.every((m, i) => i === 0 || m >= marks[i - 1]) && marks[marks.length - 1] <= Date.now() + 50,
    JSON.stringify(marks));

  // R2 — the thin dark is fought and felled by the gear
  // alone (its deep fellow across the land fights on).
  let felled = false;
  for (let i = 0; i < 28 && !felled; i++) {
    felled = dbB.prepare("SELECT COUNT(*) AS n FROM homeland_wanderers WHERE owner_key = ? AND id = ?").get(keyB, darkB).n === 0;
    if (!felled) await sleep(250);
  }
  ok("the standing dark was felled with no read ever made — the realtime gear fought the whole fight", felled);

  // R3 — the gears stay apart: two hours of binding stand
  // UNSETTLED by the war's gear; attunement is the slow
  // gear's alone, and the slow hand never turned.
  ok("attunement was NOT settled by the realtime gear: the binder's cursor never moved and its pool stands empty",
    binderRowB().bind_paid_at === null && poolB("root") === 0,
    `cursor ${binderRowB().bind_paid_at}, pool ${poolB("root")}`);

  // R4 — the first read now only WITNESSES what the gear
  // already settled; a second read settles nothing again.
  // The long fight still stands, so the gear may strike
  // live between the two reads — any such strike is struck
  // AFTER the first read began (its own moment proves it
  // was not a re-walked span), and the pool moves ~nothing.
  const readStartB = Date.now();
  const landB1 = await callOkB("getTerritory", {}, tokenB);
  // The FELL's witness is the law's object (gate fix,
  // 2026-10-28): the first strike ON the dark may be another
  // placement's miss — the binder standing beside the
  // fighter answers too, and its blow can land in the record
  // first and miss. This predicate once read that first
  // strike and failed on a witnessed fell that stood two
  // records down the same list; it names the felling blow
  // itself now, which is what the law below asserts.
  const fellWitness = (landB1.strikes ?? []).find(s => s.kind === "placement" && Number(s.wandererId) === darkB && s.felled === true);
  ok("the first read witnesses the fell the gear already made: a placement strike on the dark, struck home",
    !!fellWitness && fellWitness.hit === true, JSON.stringify((landB1.strikes ?? []).slice(0, 3)));
  // The strikes LIGHT UP THE DARK (Nigel, 2026-10-28
  // 15:10 — and standing after the 17:10 strike, because
  // the flash belongs to fights, and this fight is a
  // doused one): the hex the latest struck-home blow
  // landed on reads FAINT in the served reckoning — the
  // witness's five-second flash, still burning when the
  // read lands. This land holds no light of its own (no
  // beacon, no seed, no working stands on it), so a FAINT
  // hex beside the fight can only be the flash.
  const tilesB = new Map(landB1.tiles.map(t => [t.id, t]));
  const litHit = [...(landB1.strikes ?? [])].reverse().find(s => s.kind === "placement" && s.hit === true);
  ok("the strikes light up the dark: the hex the latest struck-home blow landed on reads FAINT in the served reckoning",
    !!litHit && tilesB.get(litHit.tileId)?.light === 1,
    litHit ? `tile ${litHit.tileId} light ${tilesB.get(litHit.tileId)?.light}` : "no hit strike witnessed");
  const maxStrike1 = Math.max(0, ...(landB1.strikes ?? []).map(s => s.id));
  const poolB1 = poolB("root");
  const landB2 = await callOkB("getTerritory", {}, tokenB);
  const freshB = (landB2.strikes ?? []).filter(s => s.id > maxStrike1);
  ok("a read mid-reconciliation settles nothing twice: any strike the second read adds was struck live after the first read began, and the pool moves ~nothing",
    freshB.every(s => Number(s.at) > readStartB) && Math.abs(poolB("root") - poolB1) < 0.01,
    `fresh ${JSON.stringify(freshB.map(s => [s.id, s.at]))} vs read start ${readStartB}, pool delta ${poolB("root") - poolB1}`);

  // R5 — LIT MEANS NO ENEMIES, ON THE REALTIME GEAR
  // (Nigel, 2026-10-28 17:10: "if he beacon is on there
  // are no enemies if its of they can attakc thats it"):
  // light the beacon, rewind the cradle's anchor so spawn
  // beats stand owed, and with the slow hand still dormant
  // the gear alone must hold the law — the pushback drives
  // the long fight's dark off the land, and NOT ONE dark
  // is born across the beats that follow.
  const nowR = Date.now();
  dbB.prepare("UPDATE tender_progress SET lighthouse_lit = 1, wanderer_anchor_at = ?, wanderer_settled_beats = 0 WHERE owner_key = ?")
    .run(nowR - 200_000, keyB);
  dbB.prepare("UPDATE tender_resources SET last_seen_at = ? WHERE owner_key = ?").run(nowR, keyB);
  await sleep(1400); // several realtime beats, no reads
  const standingR = dbB.prepare("SELECT id FROM homeland_wanderers WHERE owner_key = ?").all(keyB);
  ok("lit + online ON THE REALTIME GEAR: no enemies — the pushback drove the standing dark off and not one dark was born across the beats, the slow hand never having turned",
    standingR.length === 0, JSON.stringify(standingR.map(x => x.id)));
}

console.log(`\nMASTER CLOCK: ${pass} passed, ${fail} failed`);
try { child?.kill(); } catch { /* already gone */ }
try { dbB?.close(); } catch { /* already closed */ }
db.close();
process.exit(fail ? 1 : 0);
