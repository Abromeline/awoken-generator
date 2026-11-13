// BIRTHS SPREAD AROUND THE WHOLE RING — DRIVE (Nigel,
// 2026-11-12, answering the traced cause of "why are Fray
// always attacking from the same side": "Fix it: births
// spread around the whole ring.").
// The cause, traced at Push 77: the homeland cradle
// (settleWanderers) rolled its births down the furthest
// cursed ring IN THE LAND'S STORED ORDER — 20% a tile,
// in tile order, until the standing cap filled — so
// births filled from the same end of the ring every
// beat, the same arc, and a born dark one beelines to
// the nearest Awoken: they attacked from the side they
// were born on. The build rolls the ring in a FRESH
// SHUFFLE for each beat's pass, restoring the standing
// law (Nigel, 2026-10-25): randomness chooses WHERE on
// the ring a foe enters.
// Boots the real server in-process on a scratch DATA_DIR
// and proves, against the server's own ledgers:
//   §W SOURCE — the cradle rolls a freshly shuffled ring
//      (ringRoll) each beat; the beat, the 20% chance,
//      the cap and the furthest-ring filter stand as
//      they stood; the Table's picker is untouched.
//   §1 THE SPREAD — a prepared Tender at the heart of a
//      homeland cursed on rings 3–7 (a 42-tile furthest
//      ring against a cap of 8): across 24 birth
//      servings, EVERY serving fills the cap exactly,
//      EVERY birth stands on ring 7, and the births land
//      around the WHOLE ring — every one of the six
//      sectors receives births, every third of the
//      ring's stored order receives its share, the tail
//      of the stored order (which the old roll reached
//      only when the head had declined, serving after
//      serving) receives births, and the union of birth
//      tiles covers most of the ring. Under the old
//      fixed order the same servings filled from the
//      head of the order and the far tiles stood
//      effectively unvisited.
//   §2 THE SPREAD AT A SECOND EDGE — a wider homeland,
//      cursed on rings 3–9 (a 54-tile ring): the same
//      spread, the same cap, every birth on ring 9.
//   §3 OVERFLOW COMES SHORT, NEVER DEEPER — a furthest
//      ring of five tiles against a cap of eight, over
//      deep cursed ground: births stop at five, beat
//      after beat, and none ever stands deeper.
//   §4 THE BEACON'S LIGHT STILL BARS BIRTHS — a Beacon
//      seed standing on the furthest ring of a sparse
//      wild. Since Push 76 the beacon's ring purifies
//      on every read and the frontier then mints its
//      buffer beyond the cleansed ground, so the land's
//      edge as it stands moves outward past the seed:
//      serving after serving births fill the standing
//      cap on that edge — every birth on the land's
//      furthest cursed ring as the reads leave it, NONE
//      within the Beacon's light, none on any seeded
//      tile, and the patch the light holds stands
//      purified.
//   §5 FIGHTING-LIT GROUND STILL BARS BIRTHS — a Bastion
//      building whose FIGHTING light (radius 1) covers
//      three tiles of the furthest ring: the same shape
//      as §4 — no birth ever lands on the lit tiles
//      (cleansed by the ring on read, with the cradle's
//      own light bar behind it in the source, §W), and
//      births fill the cap on the land's edge as it
//      stands, never on seeded ground.
// Fixture shape, labelled: Tenders are claimed for real,
// then their ledgers are set by hand in the standing
// drives' own way (the spawn-edge drive's pattern):
// prepared Tenders (Lv 3, twenty held) so the standing
// intensity reads 1 and only PLACEMENT is on trial;
// hand-seeded hex maps; the cradle's clock wound forward
// by hand (wanderer_anchor_at). THE FRONTIER is part of
// the fixture's honesty: getTerritory mints a five-ring
// cursed buffer beyond the purified rim on every read
// (ensureFrontierBuffer), so §1–§2 seed discs wide
// enough to hold the buffer inside them (nothing is
// minted); §3 seeds a sparse wild with no purified
// tile at all (the buffer mints nothing); §4–§5 seed
// sparse wilds where a beacon-class light purifies its
// ring on the priming read and the buffer mints beyond
// it — those sections read the land's edge back from
// the ledger as it stands, and judge each serving's
// births at the read that made them (a standing foe
// walks, and the battle re-seats it to its new tile as
// reads accumulate — the drive judges births, not
// walks). Every assertion reads the DB ledgers
// after a real getTerritory read — the settle itself is
// the server's own, unmodified. A newborn's tile is
// taken from the BIRTH LOG (below): a drive-side trigger
// on the scratch ledger records every wanderer INSERT —
// its tile, its point, its spawn stamp — at the instant
// the cradle deals it. The standing rows cannot judge a
// birth: the realtime battle marches a foe from the
// very read that birthed it (its first window is the
// wall-clock since the priming read) and on every war
// tick after, re-seating its tile as it walks — a Fray
// covers ~0.23 hexes a second, so under load every
// newborn stands a ring inward of its birth tile before
// any read-back, and how far it stands is sandbox load,
// not law. The log is the only record that stands at
// the birth instant; the trigger only observes the
// server's own writes, in the drive's own scratch
// ledger, and is dropped with it. PLACEMENT is what is
// on trial — the cradle's beat, chance, cap, filters
// and shuffle all run for real on every serving; the
// march is the battle's own system, judged elsewhere.
// Run after `npm run build` (server + client) so the
// drive boots this source's server.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-births-spread-"));
process.env.PORT = "39992";
process.env.WORKSHOP_PASSWORD = "<MASKED_SECRET_001>";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;
process.chdir(root);
const BASE = "http://127.0.0.1:39992";
const PW = "births-spread-drive-password";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

await import("../server/dist/index.js");
await sleep(2500);

async function call(action, args, token) {
  // TRANSPORT ONLY: the sandbox's loopback resets fetches
  // under load (the known environment fault — it kills
  // whole runs in the wide sections, where a single read
  // runs seconds). A reset request is re-issued, bounded;
  // no assertion in this drive reads anything a retry
  // could shade: the reads are the server's own settles,
  // and a birth read whose response was reset has either
  // dealt its serving whole (the cradle stamps its beats
  // settled, so the re-issued read deals no second one)
  // or not at all (the re-issued read deals it). Retries
  // are announced in the drive's output.
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${BASE}/api/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
        body: JSON.stringify(args ?? {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
      return data;
    } catch (e) {
      const reset = e?.name === "TypeError" && /fetch failed/.test(String(e?.message ?? e));
      if (!reset || attempt >= 5) throw e;
      console.log(`  (transport: ${action} reset by the sandbox loopback — re-issuing, attempt ${attempt + 1})`);
      await sleep(1500);
    }
  }
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }
// THE BIRTH LOG: every wanderer the server inserts, recorded
// at the insert itself (see the header): the dealt tile is
// judged from here, never from the marched standing rows.
db.exec(`CREATE TABLE drive_birth_log (wanderer_id INTEGER, tile_id INTEGER, pos_q REAL, pos_r REAL, spawned_at INTEGER);
CREATE TRIGGER drive_log_birth AFTER INSERT ON homeland_wanderers
BEGIN INSERT INTO drive_birth_log VALUES (NEW.id, NEW.tile_id, NEW.pos_q, NEW.pos_r, NEW.spawned_at); END;`);

const ringOf = (q, r) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
/** Which of the ring's six wedges a tile stands in,
 *  by its bearing from the heart. */
const sectorOf = (q, r) => {
  const x = q + r / 2, y = (Math.sqrt(3) / 2) * r;
  return Math.floor(((Math.atan2(y, x) + Math.PI) / (2 * Math.PI)) * 6) % 6;
};

let awSeq = 0;
function seedAwokin(ownerKey, tenderName) {
  const nowT = Date.now();
  const name = `Held ${++awSeq}`;
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 3, 3, 'root', ?, 'image/png', ?)").run(`${name} ${cat}`, cat, `birthspread/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: 3, toughness: 3, element: "root" });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)").run(name, name, `birthspread/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}

/** A hand-seeded disc world: the hex disc to `radius`
 *  of the heart; cursedFn(q, r, ring) decides each
 *  tile's curse. Returns the tile ledger, in the
 *  land's stored (insertion) order. */
function seedDisc(ownerKey, radius, cursedFn) {
  const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', ?, ?)");
  const tiles = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      if (ringOf(q, r) > radius) continue;
      const cursed = cursedFn(q, r, ringOf(q, r)) ? 1 : 0;
      const id = Number(insTile.run(ownerKey, q, r, cursed, Date.now()).lastInsertRowid);
      tiles.push({ id, q, r, ring: ringOf(q, r), cursed: !!cursed });
    }
  }
  return tiles;
}

/** A hand-seeded sparse wild: only the listed hexes
 *  stand at all. Returns the tile ledger. */
function seedSparse(ownerKey, hexes) {
  const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', ?, ?)");
  return hexes.map(([q, r, cursed]) => {
    const id = Number(insTile.run(ownerKey, q, r, cursed ? 1 : 0, Date.now()).lastInsertRowid);
    return { id, q, r, ring: ringOf(q, r), cursed: !!cursed };
  });
}

/** Claim a prepared Tender (Lv 3, twenty held, warden)
 *  and stand him on the heart of the seeded land. */
async function makeTender(name, seedFn) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 150, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, Date.now());
  db.prepare("UPDATE tender_progress SET class_key = 'warden' WHERE owner_key = ?").run(ownerKey);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 500, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500").run(ownerKey, Date.now());
  for (let i = 0; i < 20; i++) seedAwokin(ownerKey, name);
  const tiles = seedFn(ownerKey);
  const stand = tiles.find(t => t.q === 0 && t.r === 0);
  db.prepare("UPDATE tender_progress SET tender_tile_id = ? WHERE owner_key = ?").run(stand.id, ownerKey);
  return { token: claim.token, ownerKey, tiles };
}

/** The births one serving dealt, from the birth log:
 *  the INSERT record of each newborn — its dealt tile
 *  and the tile's own coordinates. */
const birthRows = (ownerKey) => db.prepare(
  `SELECT l.wanderer_id AS id, l.tile_id AS tileId, t.q AS q, t.r AS r FROM drive_birth_log l JOIN territory_tiles t ON t.id = l.tile_id WHERE t.owner_key = ? ORDER BY l.wanderer_id`
).all(ownerKey);
const ringsOf = (rows) => rows.map(w => ringOf(w.q, w.r));

function wind(T) {
  db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ?, wanderer_settled_beats = 0 WHERE owner_key = ?").run(Date.now() - 45000 * 30, T.ownerKey);
}

/** Prime (the first standing read arms the cradle's
 *  anchor, birthing nothing), then wind the cradle's
 *  clock forward and read again: the births that read
 *  makes are the subject. The birth log is cleared
 *  between the wind and the birth read, so the serving
 *  is judged on exactly the births that read dealt. */
async function spawnRead(T) {
  await call("getTerritory", {}, T.token);
  wind(T);
  db.prepare("DELETE FROM drive_birth_log").run();
  await call("getTerritory", {}, T.token);
  return birthRows(T.ownerKey);
}

/** The land's furthest cursed ring AS IT STANDS in
 *  the ledger right now — read back, never assumed:
 *  on lands where a beacon's ring has purified ground
 *  and the frontier has minted beyond it, the edge
 *  sits further out than the seeded shape's own rim. */
function edgeRingNow(ownerKey) {
  return db.prepare("SELECT q, r, cursed FROM territory_tiles WHERE owner_key = ?").all(ownerKey)
    .filter(t => Number(t.cursed) === 1).reduce((m, t) => Math.max(m, ringOf(t.q, t.r)), -1);
}

/** Run `servings` independent birth servings on a
 *  sparse land (the field cleared between servings)
 *  and return every serving's newborn rows from the
 *  birth log — the INSERT record of the read that
 *  birthed them. Births are judged at their insert on
 *  purpose: a standing foe walks and is re-seated to
 *  its new tile by the battle as reads accumulate, so
 *  the standing rows of a long train of reads would
 *  judge walks, not births. */
async function birthServings(T, servings) {
  await call("getTerritory", {}, T.token);
  const all = [];
  for (let i = 0; i < servings; i++) {
    db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(T.ownerKey);
    all.push(await spawnRead(T));
  }
  return all;
}

/** Run `trials` independent birth servings on a land
 *  (the field cleared between servings) and fold every
 *  birth into one reckoning: per-serving counts, the
 *  union of birth tiles, per-sector and per-stored-band
 *  tallies, and every ring a birth ever stood on. */
async function spreadTrials(T, ringTiles, trials) {
  const orderIndex = new Map(ringTiles.map((t, i) => [t.id, i]));
  const bandOf = (id) => Math.min(2, Math.floor((orderIndex.get(id) * 3) / ringTiles.length));
  const union = new Set(), sectors = new Set(), bands = [0, 0, 0];
  const perTrial = [], allRings = [];
  let total = 0, tailBirths = 0, pastHeadBirths = 0;
  const tailIds = new Set(ringTiles.slice(-6).map(t => t.id));
  for (let i = 0; i < trials; i++) {
    db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(T.ownerKey);
    const rows = await spawnRead(T);
    perTrial.push(rows.length);
    for (const w of rows) {
      total++;
      union.add(w.tileId);
      sectors.add(sectorOf(w.q, w.r));
      bands[bandOf(w.tileId)]++;
      allRings.push(ringOf(w.q, w.r));
      if (tailIds.has(w.tileId)) tailBirths++;
      if (orderIndex.get(w.tileId) >= 8) pastHeadBirths++;
    }
  }
  return { perTrial, union, sectors, bands, total, tailBirths, pastHeadBirths, allRings };
}

/* ── §W SOURCE — THE SHUFFLE STANDS IN THE CRADLE ────── */
console.log("§W the cradle rolls a freshly shuffled ring; the beat, the chance, the cap and the Table stand untouched");
{
  const actions = readFileSync(join(root, "server/src/actions.ts"), "utf8");
  const table = readFileSync(join(root, "server/src/table.ts"), "utf8");
  const at = actions.indexOf("async settleWanderers(");
  const end = at >= 0 ? actions.indexOf("async settleHomelandWeapon(", at) : -1;
  const span = at >= 0 && end > at ? actions.slice(at, end) : "";
  ok("settleWanderers is found, and the beat, the 20% chance and the catch-up cap stand as they stood",
    !!span && span.includes("SPAWN_BEAT_MS = 45000, SPAWN_CHANCE = 0.20, CATCHUP_BEATS = 4"));
  ok("the standing cap stands (8 + 2 a step) and births are dealt from the furthest ring's tiles only",
    span.includes("const cap = 8 + 2 * (intensity - 1)") && span.includes("ringOfTile(t) === edgeRing"));
  ok("the ring is rolled in a FRESH SHUFFLE for each beat's pass (ringRoll, Fisher–Yates on Math.random)",
    span.includes("BIRTHS SPREAD AROUND THE WHOLE RING (Nigel,") && span.includes("const ringRoll = [...view]") && span.includes("for (const t of ringRoll)"));
  ok("the cradle's own bars stand in the roll's filter: beacon protection and FIGHTING-lit ground are excluded",
    span.includes("!beaconTiles.some(b => hexDist(t, b) <= 1)") && span.includes("!== LIGHT_FIGHTING"));
  const dgAt = table.indexOf("function darkGround(");
  const dgEnd = dgAt >= 0 ? table.indexOf("function placeDark(", dgAt) : -1;
  const dg = dgAt >= 0 && dgEnd > dgAt ? table.slice(dgAt, dgEnd) : "";
  ok("the Table's darkGround still stands untouched: the furthest ring of the curse, and nowhere else",
    !!dg && dg.includes("Math.max(...cursed.map(t => ringOf(t.id)))") && dg.includes("ringOf(t.id) === rim"));
}

/* ── §1 THE SPREAD ───────────────────────────────────── */
console.log("§1 a homeland cursed on rings 3–7: births spread around the whole 42-tile ring, against a cap of 8");
const A = await makeTender("Spread Tender", (k) => seedDisc(k, 7, (q, r, ring) => ring >= 3));
{
  const expA = await call("getTenderExp", {}, A.token);
  ok("the fixture stands as named: a prepared Tender (level 3, twenty held), so placement alone is on trial",
    expA.level === 3 && expA.awokenCount === 20, JSON.stringify({ level: expA.level, n: expA.awokenCount }));
  const ringTiles = A.tiles.filter(t => t.cursed && t.ring === 7);
  ok("the fixture's furthest ring holds 42 cursed tiles against a standing cap of 8",
    ringTiles.length === 42, `ring tiles ${ringTiles.length}`);
  const S = await spreadTrials(A, ringTiles, 24);
  ok("§1: EVERY one of the 24 servings filled the standing cap exactly — 8 standing dark, no serving short, none over",
    S.perTrial.every(c => c === 8), JSON.stringify(S.perTrial));
  ok("§1: EVERY birth, in every serving, stood on ring 7, the furthest cursed ring — none deeper",
    S.total > 0 && S.allRings.every(r => r === 7), JSON.stringify({ total: S.total }));
  ok("§1: the births covered most of the ring — at least 30 of its 42 tiles received a birth across the servings",
    S.union.size >= 30, `covered ${S.union.size}/42`);
  ok("§1: every one of the ring's six sectors received births — the dark now comes from all around",
    S.sectors.size === 6, `sectors hit ${S.sectors.size}/6`);
  ok("§1: every third of the ring's stored order received its share (each band at least 15% of all births)",
    S.bands.every(b => b >= S.total * 0.15), JSON.stringify(S.bands));
  ok("§1: births landed on the LAST SIX tiles of the stored order — the tail the old fixed roll reached only when the head had declined",
    S.tailBirths > 0, `tail births ${S.tailBirths}`);
  ok("§1: births landed beyond the first eight tiles of the stored order (the old roll's whole world, when the cap filled early)",
    S.pastHeadBirths > 0, `past-head births ${S.pastHeadBirths}`);
}

/* ── §2 THE SPREAD AT A SECOND EDGE ──────────────────── */
console.log("§2 a wider homeland, cursed on rings 3–9: the same spread on a 54-tile ring, every birth on ring 9");
const W = await makeTender("Wide Spread", (k) => seedDisc(k, 9, (q, r, ring) => ring >= 3));
{
  const ringTiles = W.tiles.filter(t => t.cursed && t.ring === 9);
  ok("the fixture's furthest ring holds 54 cursed tiles",
    ringTiles.length === 54, `ring tiles ${ringTiles.length}`);
  const S = await spreadTrials(W, ringTiles, 12);
  ok("§2: every serving filled the cap exactly — 8 standing dark",
    S.perTrial.every(c => c === 8), JSON.stringify(S.perTrial));
  ok("§2: EVERY birth stood on ring 9, this land's furthest cursed ring — none deeper",
    S.total > 0 && S.allRings.every(r => r === 9), JSON.stringify({ total: S.total }));
  ok("§2: the births ranged wide over this ring too — at least 38 of its 54 tiles across twelve servings (an honest roll's expectation is ~45)",
    S.union.size >= 38, `covered ${S.union.size}/54`);
  ok("§2: every one of the ring's six sectors received births",
    S.sectors.size === 6, `sectors hit ${S.sectors.size}/6`);
}

/* ── §3 OVERFLOW COMES SHORT, NEVER DEEPER ───────────── */
console.log("§3 a furthest ring of five tiles, a cap of eight, deep cursed ground beneath: births stop at five");
const RING7_KEEP = ["7,0", "-7,0", "0,7", "0,-7", "7,-7"];
const SPARSE3 = (() => {
  const hexes = [[0, 0, true]];
  for (let q = -6; q <= 6; q++) for (let r = -6; r <= 6; r++) {
    const ring = ringOf(q, r);
    if ((ring === 5 || ring === 6) && !(q === 0 && r === 0)) hexes.push([q, r, true]);
  }
  for (const key of RING7_KEEP) { const [q, r] = key.split(",").map(Number); hexes.push([q, r, true]); }
  return hexes;
})();
const B = await makeTender("Short Ring", (k) => seedSparse(k, SPARSE3));
{
  const cursedTiles = B.tiles.filter(t => t.cursed);
  ok("the fixture stands as named: rings 5–6 fully cursed (66 tiles), ring 7 standing on five tiles only, no purified tile anywhere (the frontier mints nothing)",
    cursedTiles.filter(t => t.ring === 5 || t.ring === 6).length === 66
    && cursedTiles.filter(t => t.ring === 7).length === 5
    && B.tiles.every(t => t.cursed),
    JSON.stringify({ deep: cursedTiles.filter(t => t.ring < 7).length, ring: cursedTiles.filter(t => t.ring === 7).length, total: B.tiles.length }));
  const servings = await birthServings(B, 10);
  const born = servings.flat();
  ok("§3: NO serving ever stood over the ring's five — the spawn comes short of the cap of 8 on this ring, beat after beat (the cap is a ceiling the ring cannot reach, not a quota a serving fills)",
    servings.every(rows => rows.length <= 5), JSON.stringify(servings.map(r => r.length)));
  ok("§3: across the servings, EVERY one of the ring's five tiles received births — the pressure returns to the whole ring, and only to the ring",
    new Set(born.map(w => `${w.q},${w.r}`)).size === 5,
    JSON.stringify([...new Set(born.map(w => `${w.q},${w.r}`))]));
  ok("§3: every newborn, in every serving, stood on one of the ring's five tiles",
    born.length > 0 && born.every(w => RING7_KEEP.includes(`${w.q},${w.r}`)),
    JSON.stringify(born.map(w => `${w.q},${w.r}`)));
  ok("§3: NO newborn ever stood deeper — the 66 cursed tiles of rings 5–6 held none",
    born.every(w => ringOf(w.q, w.r) === 7), JSON.stringify(ringsOf(born)));
}

/* ── §4 THE BEACON'S LIGHT STILL BARS BIRTHS ─────────── */
console.log("§4 a Beacon seed on the furthest ring: its light bars births, and the land's edge as it stands takes the cap");
const BEACON_TILE = { q: 7, r: 0 };
const FAR_RING = ["-7,0", "0,7", "0,-7"];
const SPARSE4 = [
  [0, 0, true],                       // the heart — the stand, cursed ground
  [7, 0, true], [7, -1, true], [6, 1, true], [6, 0, true], // the Beacon's patch: its tile and neighbours
  [-7, 0, true], [0, 7, true], [0, -7, true],              // the ring's far tiles
  [5, 0, true], [5, 1, true], [4, 0, true],                // deeper cursed ground, as witness
];
const C = await makeTender("Beacon Ring", (k) => seedSparse(k, SPARSE4));
{
  const beaconTile = C.tiles.find(t => t.q === BEACON_TILE.q && t.r === BEACON_TILE.r);
  db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at) VALUES (?, ?, 3, 'fallen', ?)")
    .run(C.ownerKey, beaconTile.id, Date.now());
  const barred = C.tiles.filter(t => t.cursed && hexDist(t, BEACON_TILE) <= 1);
  ok("the fixture stands as named: cursed ground within the Beacon's light, three far ring tiles beyond it, deeper cursed ground as witness",
    barred.length === 4 && C.tiles.filter(t => t.cursed && FAR_RING.includes(`${t.q},${t.r}`)).length === 3,
    JSON.stringify({ barred: barred.length }));
  const servings = await birthServings(C, 4);
  const born = servings.flat();
  // The land as the reads leave it: the beacon's ring
  // purifies on read (Push 76) and the frontier mints
  // its buffer beyond the cleansed ground, so the
  // furthest cursed ring of the land AS IT STANDS is
  // read back from the ledger, not assumed. The mint
  // completes at the priming read, before any serving's
  // births, so this edge is the edge every serving faced.
  const edgeNow = edgeRingNow(C.ownerKey);
  const seededIds = new Set(C.tiles.map(t => t.id));
  ok("§4: the cap held as a ceiling on the minted edge — no serving stood over 8, every serving pressed toward it (5–8 a serving, at least 26 across four)",
    servings.every(rows => rows.length >= 5 && rows.length <= 8) && born.length >= 26,
    JSON.stringify(servings.map(r => r.length)));
  ok("§4: EVERY birth stood on the land's furthest cursed ring as it stands — the edge the Beacon's own cleansing pushed outward, never a deeper tile",
    born.length > 0 && born.every(w => ringOf(w.q, w.r) === edgeNow),
    JSON.stringify({ edgeNow, rings: ringsOf(born) }));
  ok("§4: NO birth ever landed on seeded ground — not the ring's far tiles, not the deeper witnesses: the cradle dealt only at the standing edge",
    born.every(w => !seededIds.has(w.tileId)),
    JSON.stringify(born.map(w => `${w.q},${w.r}`)));
  ok("§4: NO birth ever landed within the Beacon's light, though its ground began cursed and on the furthest ring",
    born.every(w => hexDist(w, BEACON_TILE) > 1),
    JSON.stringify(born.map(w => `${w.q},${w.r}`)));
  const patchCursed = db.prepare("SELECT cursed FROM territory_tiles WHERE owner_key = ? AND id IN (?, ?, ?, ?)")
    .all(C.ownerKey, ...barred.map(t => t.id)).map(r => Number(r.cursed));
  ok("§4: the ground within the Beacon's light stands purified after the reads — the ring's cleansing (Push 76) holds it, and the cradle births nothing there",
    patchCursed.length === 4 && patchCursed.every(c => c === 0), JSON.stringify(patchCursed));
}

/* ── §5 FIGHTING-LIT GROUND STILL BARS BIRTHS ────────── */
console.log("§5 a Bastion building's FIGHTING light covers three tiles of the furthest ring: no birth ever lands there");
const BASTION_TILE = { q: 6, r: 0 };
const LIT_RING = ["7,0", "7,-1", "6,1"];
const OPEN_RING = ["-7,0", "0,7", "0,-7", "7,-7", "-7,7"];
const SPARSE5 = [
  [0, 0, true],                       // the heart — the stand, cursed ground
  [6, 0, true],                       // the Bastion building's own tile (ring 6)
  [7, 0, true], [7, -1, true], [6, 1, true],               // ring 7, inside the light
  [-7, 0, true], [0, 7, true], [0, -7, true], [7, -7, true], [-7, 7, true], // ring 7, beyond it
  [5, 0, true], [5, 1, true], [4, 0, true],                // deeper cursed ground, as witness
];
const D = await makeTender("Lit Ring", (k) => seedSparse(k, SPARSE5));
{
  const bastionTile = D.tiles.find(t => t.q === BASTION_TILE.q && t.r === BASTION_TILE.r);
  db.prepare("INSERT INTO territory_buildings (owner_key, tile_id, building_type, placed_at) VALUES (?, ?, 'bastion', ?)")
    .run(D.ownerKey, bastionTile.id, Date.now());
  const litTiles = D.tiles.filter(t => t.ring === 7 && hexDist(t, BASTION_TILE) <= 1);
  const openTiles = D.tiles.filter(t => t.ring === 7 && hexDist(t, BASTION_TILE) > 1);
  ok("the fixture stands as named: the Bastion's light (radius 1) covers three ring-7 tiles; five ring-7 tiles stand beyond it; deeper cursed ground as witness",
    litTiles.length === 3 && openTiles.length === 5
    && litTiles.every(t => LIT_RING.includes(`${t.q},${t.r}`))
    && openTiles.every(t => OPEN_RING.includes(`${t.q},${t.r}`)),
    JSON.stringify({ lit: litTiles.map(t => `${t.q},${t.r}`), open: openTiles.map(t => `${t.q},${t.r}`) }));
  const servings = await birthServings(D, 4);
  const born = servings.flat();
  // As §4: the Bastion's ring purifies on read and the
  // frontier mints beyond it — the land's furthest
  // cursed ring AS IT STANDS is read from the ledger,
  // and the mint completes at the priming read, before
  // any serving's births.
  const edgeNow = edgeRingNow(D.ownerKey);
  const seededIds = new Set(D.tiles.map(t => t.id));
  ok("§5: the cap held as a ceiling on the minted edge — no serving stood over 8, every serving pressed toward it (5–8 a serving, at least 26 across four)",
    servings.every(rows => rows.length >= 5 && rows.length <= 8) && born.length >= 26,
    JSON.stringify(servings.map(r => r.length)));
  ok("§5: EVERY birth stood on the land's furthest cursed ring as it stands — never a deeper tile",
    born.length > 0 && born.every(w => ringOf(w.q, w.r) === edgeNow),
    JSON.stringify({ edgeNow, rings: ringsOf(born) }));
  ok("§5: NO birth ever landed on seeded ground — not the ring's open tiles, not the deeper witnesses",
    born.every(w => !seededIds.has(w.tileId)),
    JSON.stringify(born.map(w => `${w.q},${w.r}`)));
  ok("§5: NO birth ever landed on the FIGHTING-lit ring tiles, serving after serving",
    born.every(w => !LIT_RING.includes(`${w.q},${w.r}`)),
    JSON.stringify(born.map(w => `${w.q},${w.r}`)));
  const litCursed = db.prepare("SELECT cursed FROM territory_tiles WHERE owner_key = ? AND id IN (?, ?, ?)")
    .all(D.ownerKey, ...litTiles.map(t => t.id)).map(r => Number(r.cursed));
  ok("§5: the lit ring tiles stand purified after the reads — the beacon ring's cleansing holds that ground in front of the cradle, whose own light bar stands behind it (§W)",
    litCursed.every(c => c === 0), JSON.stringify(litCursed));
}

console.log(`\nBIRTHS SPREAD DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
