// drive-tender-standing-feeds — THE TENDER'S OWN STANDING
// FEEDS THE SEED (Nigel, 2026-10-25 11:34: "standing on
// the tile of a starseed with your tender begins feeding
// it your energy. to begin leveling it.").
//
// The growth cycle's draw (settleSeedFeeding, settled on
// the territory read) drank only while the Tender's
// COMPANY stood within the seed's field. This build adds
// the Tender herself as a feeder: while she stands ON a
// living seed's own tile — her standing tile read from the
// server's own record (tender_progress.tender_tile_id,
// the tile the validated setTenderTile road last seated
// her on) — that seed drinks from her purse at HER OWN
// RATE, five energy a minute (Nigel, 2026-10-25 11:42:
// "tenders feed rate is 5 energy per min"), under the
// same whole-energy and five-minute presence laws and
// the same exclusions. Her company's draw (0.25/min)
// stands unchanged, and the two STACK into the one
// credit ledger when both stand near.
//
//   §1 THE TENDER ON THE TILE: a fallen seed with NO
//      company anywhere near it gains exactly FIVE whole
//      energy per wound one-minute settle while the
//      Tender stands on its tile, paid from her purse —
//      her 5/min measure, not the company's pace.
//   §2 THE CONTROL: the same seed, the Tender standing
//      elsewhere and no company near, gains NOTHING over
//      the same wound span.
//   §3 THE COMPANY ROAD STILL FEEDS: with the Tender
//      beside the seed (not on it) and her summoned Awokin
//      standing within the field, the seed drinks as it
//      always has.
//   §4 THE CURSE'S SEED DOES NOT DRINK: a corrupted seed
//      under the Tender's own feet gains nothing and the
//      purse does not move.
//   §5 THE STACK: with her company still standing within
//      the field, the Tender steps onto the tile herself —
//      one wound minute pays five whole energy AND leaves
//      the quarter-point residue (5.25 a minute leaves
//      0.25 of credit in a minute) that neither feeder
//      leaves alone: the two rates pour into one ledger.
//   THE ARRIVAL PURIFICATION (Nigel, 2026-10-25 11:48:
//   "instant purification on seed hex when a tender joins
//   so he can feed the seed without dying to the
//   curse"): §1 asserts the seed's cursed hex stands
//   purified in the very settle that first feeds it; §2
//   asserts no purification while she stands elsewhere;
//   §3 asserts company presence alone does not purify
//   (the second seed drinks, its hex stays cursed); §6
//   asserts already-purified ground is unchanged by the
//   stand. A corrupted seed's ground is never touched —
//   §4's span leaves it exactly as staged.
//   THE SUMMONING STEP (Nigel, 2026-10-25 11:51): §7
//   grants her a Summoner's Power star (the live fx
//   clause at +2; her level and class add nothing), and
//   asserts the wound minute then takes exactly six —
//   5 + 0.5 × 2 — where §1's zero-power minutes took
//   exactly five.
//
// The draw is wound by hand exactly as drive-first-seed-
// risings §H winds it: the seed's feed anchor set four
// minutes back before a read = one whole energy at the
// ruled rate. Seeds are staged by hand in SQL, as the
// other drives stage them (a fallen seed on far cursed
// ground; a corrupted seed with its siege guard standing,
// so the settle keeps it corrupted). The Tender's feet
// move only through the real setTenderTile action; the
// company stands through the real summonAwoken action.
// Run after `npm run build`:
//   node scripts/drive-tender-standing-feeds.mjs
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-standing-"));
process.env.PORT = "39983";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39983";
const PW = "standing-drive-password";
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
  if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return data?.data ?? data;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up, as the other drives do */ }
const now = Date.now();

/* ══ THE WORLD: a fresh Tender, her purse full, the
   first seed sown (the map's making), its risings frozen
   and the wanderer cradle stilled, as §H stills them ══ */
const claim = await call("claimTender", { password: PW, tenderName: "Standing Tender" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
const token = claim.token;
// Her EXP is set at 800 on purpose: tender level 6 —
// BELOW the summoning spread's first step (one point per
// 7 levels), class Warden (no Sage grant), no zodiac
// stars held. Her summoning power is therefore EXACTLY
// ZERO through §1–§6, so the base-rate proofs read the
// bare five a minute; §7 grants her a known measure and
// asserts the stepped rate.
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 800, 3, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', total_exp = 800, hp = 100").run(ownerKey, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 500, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500").run(ownerKey, now);

// Her company-to-be: three low-power kin (a summon's roll
// is priced and DC'd by power — a power-3 hand is the
// drive's honest friend), seeded as the growth drive seeds.
const insAsset = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
const parts = [["Sky Cloth", "body", 1, 3], ["Sky Cord", "arms", 1, 3], ["Sky Crown", "head", 1, 3]]
  .map(([n, c, p, t]) => ({ id: Number(insAsset.run(n, c, p, t, "sky", `standing/${n}.png`, now).lastInsertRowid), name: n, category: c, power: p, toughness: t, element: "sky" }));
const composition = JSON.stringify(parts.map(p => ({ source_id: `db:${p.id}`, name: p.name, category: p.category, rarity: "common", power: p.power, toughness: p.toughness, element: p.element })));
const kinId = Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', 'Standing Tender', ?, ?)")
  .run("Standing Kin", "Standing Kin", "standing/kin.png", composition, ownerKey, now).lastInsertRowid);

await call("ensureFirstSeed", {}, token);
const stillCradle = () => db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ? WHERE owner_key = ?").run(Date.now(), ownerKey);
const freezeRisings = () => db.prepare("UPDATE first_seed_events SET next_wave_at = ? WHERE owner_key = ?").run(Date.now() + 3600000, ownerKey);
const read = async () => { freezeRisings(); stillCradle(); await call("getTerritory", {}, token); };
await read(); // the priming read: anchors walk to now, the Tender's stand materializes

/* ══ STAGE THE SEEDS: one fallen, one corrupted (its
   siege guard standing), on far cursed tiles ══════════ */
const firstSeed = db.prepare("SELECT tile_id FROM star_seeds WHERE owner_key = ? AND state = 'first'").get(ownerKey);
const tiles = db.prepare("SELECT id, q, r, cursed FROM territory_tiles WHERE owner_key = ?").all(ownerKey);
const firstTile = tiles.find(t => t.id === firstSeed.tile_id);
const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
const far = tiles.filter(t => t.cursed && t.id !== firstSeed.tile_id && dist(t, firstTile) >= 5)
  .sort((a, b) => dist(b, firstTile) - dist(a, firstTile));
const fallenTile = far[0];
// A SECOND fallen seed, two rings from the first — close
// enough that one company standing can be within both
// seeds' fields while the Tender stands on neither tile
// (the §3/§6-proof ground: company alone must not purify).
const fallen2Tile = far.find(t => t.id !== fallenTile.id && dist(t, fallenTile) === 2);
const corruptedTile = far[far.length - 1];
const insSeed = db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, defenses, fed_energy, created_at) VALUES (?, ?, 1, ?, 0, 0, ?)");
const fallenSeedId = Number(insSeed.run(ownerKey, fallenTile.id, "fallen", now).lastInsertRowid);
const fallen2SeedId = Number(insSeed.run(ownerKey, fallen2Tile.id, "fallen", now).lastInsertRowid);
const corruptedSeedId = Number(insSeed.run(ownerKey, corruptedTile.id, "corrupted", now).lastInsertRowid);
const colId = Number(db.prepare("INSERT INTO incursion_columns (owner_key, target_tile_id, target_kind, kind, size, power, state, origin_q, origin_r, spawned_at, arrives_at) VALUES (?, ?, 'hex', 'siege', 1, 1, 'arrived', 0, 0, ?, ?)")
  .run(ownerKey, corruptedTile.id, now, now).lastInsertRowid);
db.prepare("INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, column_id) VALUES (?, ?, 'fray', ?, ?)").run(ownerKey, corruptedTile.id, now, colId);
console.log(`  staged: fallen seed ${fallenSeedId} @tile ${fallenTile.id}, fallen seed ${fallen2SeedId} @tile ${fallen2Tile.id}, corrupted seed ${corruptedSeedId} @tile ${corruptedTile.id} (guard column ${colId})`);

const seedRow = (id) => db.prepare("SELECT fed_energy, feed_credit FROM star_seeds WHERE id = ?").get(id);
const purse = () => db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(ownerKey)?.energy ?? 0;
const tenderTileId = () => db.prepare("SELECT tender_tile_id AS t FROM tender_progress WHERE owner_key = ?").get(ownerKey)?.t;
const wind = () => { // four minutes back on the staged seeds: a company's whole energy — or twenty at the Tender's rate, if any may drink
  db.prepare("UPDATE star_seeds SET feed_anchor_at = ? WHERE id IN (?, ?, ?)").run(Date.now() - 240000, fallenSeedId, fallen2SeedId, corruptedSeedId);
};
const windMinute = () => { // one minute back: exactly five whole energy at the Tender's rate; a quarter-point at the company's
  db.prepare("UPDATE star_seeds SET feed_anchor_at = ? WHERE id IN (?, ?, ?)").run(Date.now() - 60000, fallenSeedId, fallen2SeedId, corruptedSeedId);
};
const tileCursed = (tileId) => db.prepare("SELECT cursed FROM territory_tiles WHERE id = ?").get(tileId)?.cursed;
await read(); // prime the staged seeds' anchors

/* ── §2 THE CONTROL (read first, while her feet are
   still at her own stand, far from both seeds) ────── */
console.log("§2 the control — the Tender elsewhere, no company near: the seed does not drink");
{
  ok("§2 staging sanity: no company stands anywhere on her field",
    db.prepare("SELECT COUNT(*) AS n FROM field_placements WHERE owner_key = ?").get(ownerKey).n === 0);
  ok("§2 staging sanity: the Tender's recorded stand is neither seed's tile",
    tenderTileId() !== fallenTile.id && tenderTileId() !== corruptedTile.id, `stand=${tenderTileId()}`);
  wind();
  await read();
  ok("§2 THE CONTROL: over a wound four minutes the fallen seed gained nothing and the purse did not move",
    seedRow(fallenSeedId).fed_energy === 0 && purse() === 500,
    `fed=${seedRow(fallenSeedId).fed_energy} purse=${purse()}`);
  ok("§2 AND NO PURIFICATION WITHOUT HER STAND: both fallen seeds' hexes stay cursed while she stands elsewhere (the arrival law's control)",
    tileCursed(fallenTile.id) === 1 && tileCursed(fallen2Tile.id) === 1 && seedRow(fallen2SeedId).fed_energy === 0,
    `cursed=${tileCursed(fallenTile.id)}/${tileCursed(fallen2Tile.id)} fed2=${seedRow(fallen2SeedId).fed_energy}`);
}

/* ── §1 THE TENDER ON THE TILE ──────────────────────── */
console.log("§1 the Tender stands on the fallen seed's tile — her own standing feeds it, at her rate");
{
  const mv = await call("setTenderTile", { tileId: fallenTile.id }, token);
  ok("§1 the movement road seats her on the seed's tile (the server's own record of her stand)",
    mv.ok === true && tenderTileId() === fallenTile.id, `stand=${tenderTileId()}`);
  windMinute();
  await read();
  ok("§1 THE MEASURE: one wound minute on the tile pays exactly FIVE whole energy — her 5/min rate, not the company's one-per-four-minutes",
    seedRow(fallenSeedId).fed_energy === 5, `fed=${seedRow(fallenSeedId).fed_energy}`);
  ok("§1 THE GROUND ANSWERED IN THE SAME SETTLE (Nigel, 11:48): the seed's cursed hex stands PURIFIED in the very read that first fed it — instant, no wearing-down",
    tileCursed(fallenTile.id) === 0, `cursed=${tileCursed(fallenTile.id)}`);
  windMinute();
  await read();
  ok("§1 THE SEED DRANK FROM HER STANDING ALONE: the second wound minute pays five more",
    seedRow(fallenSeedId).fed_energy === 10, `fed=${seedRow(fallenSeedId).fed_energy}`);
  ok("§1 the purse paid exactly the drinking (500 → 490) — her energy, no other hand",
    purse() === 490, `purse=${purse()}`);
  ok("§1 the corrupted seed drank nothing while she stood across the map",
    seedRow(corruptedSeedId).fed_energy === 0, `fed=${seedRow(corruptedSeedId).fed_energy}`);
}

/* ── §4 THE CURSE'S SEED DOES NOT DRINK ─────────────── */
console.log("§4 the Tender stands on the corrupted seed — it does not drink");
{
  await call("setTenderTile", { tileId: corruptedTile.id }, token);
  ok("§4 her stand is now the corrupted seed's tile", tenderTileId() === corruptedTile.id, `stand=${tenderTileId()}`);
  wind();
  await read();
  ok("§4 THE CORRUPTED SEED DOES NOT DRINK, even under her own feet (a drinking seed would have taken twenty at her rate): its ledger and the purse are unmoved",
    seedRow(corruptedSeedId).fed_energy === 0 && purse() === 490,
    `fed=${seedRow(corruptedSeedId).fed_energy} purse=${purse()}`);
  ok("§4 and the fallen seed, left behind with no company, drank nothing in the same span",
    seedRow(fallenSeedId).fed_energy === 10, `fed=${seedRow(fallenSeedId).fed_energy}`);
  ok("§4 THE BOUNDARY OF THE ARRIVAL LAW: the corrupted seed's hex stays CURSED under her feet — the purification answers only a living seed's stand, and a corrupted seed is not one",
    tileCursed(corruptedTile.id) === 1, `cursed=${tileCursed(corruptedTile.id)}`);
}

/* ── §3 THE COMPANY ROAD STILL FEEDS ────────────────── */
console.log("§3 the company road — her Awokin within the field feeds it as it always has");
{
  // She stands on the common neighbour of BOTH fallen
  // seeds (two rings apart, they share neighbours) — her
  // summon lands within a ring of her, so within two
  // rings of both seeds at once.
  const beside = tiles.find(t => dist(t, fallenTile) === 1 && dist(t, fallen2Tile) === 1);
  await call("setTenderTile", { tileId: beside.id }, token);
  let placed = null;
  for (let i = 0; i < 25 && !placed; i++) {
    await call("summonAwoken", { awakenedId: kinId }, token).catch(() => {});
    placed = db.prepare("SELECT tile_id FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(ownerKey, kinId) ?? null;
  }
  const placedTile = placed ? tiles.find(t => t.id === placed.tile_id) : null;
  ok("§3 her summoned Awokin stands within BOTH seeds' fields (within two rings of each), placed by the real summon",
    !!placedTile && dist(placedTile, fallenTile) <= 2 && dist(placedTile, fallen2Tile) <= 2, `placed=${placed?.tile_id}`);
  ok("§3 and the Tender herself is NOT on the seed's tile this span — the company alone can feed it",
    tenderTileId() === beside.id && beside.id !== fallenTile.id, `stand=${tenderTileId()}`);
  const purseBefore = purse();
  wind();
  await read();
  ok("§3 THE COMPANY ROAD STILL FEEDS AT ITS OWN RATE: one wound four-minute settle, one more energy in EACH seed's ledger, two off the purse (one per seed)",
    seedRow(fallenSeedId).fed_energy === 11 && seedRow(fallen2SeedId).fed_energy === 1 && purse() === purseBefore - 2,
    `fed=${seedRow(fallenSeedId).fed_energy}/${seedRow(fallen2SeedId).fed_energy} purse=${purse()} before=${purseBefore}`);
  ok("§3 COMPANY PRESENCE ALONE DOES NOT PURIFY: the second seed drank from her company, yet its hex stands CURSED still — the purification answers the Tender's own stand, nothing less",
    tileCursed(fallen2Tile.id) === 1, `cursed=${tileCursed(fallen2Tile.id)}`);
  const served = (await call("getSeeds", {}, token)).seeds ?? [];
  const fallenServed = served.find(s => s.id === fallenSeedId);
  ok("§3 the map's own serving agrees: the fallen seed reads fed 11",
    !!fallenServed && fallenServed.fedEnergy === 11, JSON.stringify(fallenServed && { fed: fallenServed.fedEnergy }));
}

/* ── §5 THE STACK ───────────────────────────────────── */
console.log("§5 the stack — her company in the field AND the Tender on the tile: both rates, one ledger");
{
  await call("setTenderTile", { tileId: fallenTile.id }, token);
  const placed = db.prepare("SELECT tile_id FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(ownerKey, kinId);
  const placedTile = placed ? tiles.find(t => t.id === placed.tile_id) : null;
  ok("§5 staging: the Tender stands on the seed's tile and her company still stands within its field",
    tenderTileId() === fallenTile.id && !!placedTile && dist(placedTile, fallenTile) <= 2,
    `stand=${tenderTileId()} placed=${placed?.tile_id}`);
  const purseBefore = purse();
  windMinute();
  await read();
  const row = seedRow(fallenSeedId);
  ok("§5 THE STACK PAYS: one wound minute with both feeders pays five whole energy off the purse",
    row.fed_energy === 16 && purse() === purseBefore - 5,
    `fed=${row.fed_energy} purse=${purse()} before=${purseBefore}`);
  ok("§5 AND LEAVES THE STACK'S FINGERPRINT: a quarter-point of credit stands in the ledger (5.25/min leaves 0.25 in a minute — her rate alone leaves ~0, the company's takes nothing whole in a minute)",
    row.feed_credit > 0.2 && row.feed_credit < 0.35, `credit=${row.feed_credit}`);
}

/* ── §6 CLEAN GROUND IS UNCHANGED BY THE STAND ──────── */
console.log("§6 the fallen seed's hex again — ground her arrival already purified in §1");
{
  // The ground §1's arrival purified: the whole tile row
  // is read before and after a fresh stand on it. (The
  // first seed's own hex was tried for this proof and
  // found CURSED in the staged world — her stand there
  // purified it, the arrival law working on the first
  // seed as on any living seed; that ground cannot prove
  // "unchanged", so the proof stands here, on ground the
  // drive itself watched turn.)
  const groundBefore = db.prepare("SELECT cursed, element, curse_hp AS curseHp, curse_max_hp AS curseMaxHp FROM territory_tiles WHERE id = ?").get(fallenTile.id);
  const fedBefore = seedRow(fallenSeedId).fed_energy;
  const purseBefore = purse();
  await call("setTenderTile", { tileId: fallenTile.id }, token);
  windMinute();
  await read();
  const groundAfter = db.prepare("SELECT cursed, element, curse_hp AS curseHp, curse_max_hp AS curseMaxHp FROM territory_tiles WHERE id = ?").get(fallenTile.id);
  ok("§6 ALREADY-PURIFIED GROUND IS UNCHANGED BY HER STAND: the hex reads exactly as it read before she stepped back onto it",
    groundBefore.cursed === 0 && JSON.stringify(groundAfter) === JSON.stringify(groundBefore),
    `before=${JSON.stringify(groundBefore)} after=${JSON.stringify(groundAfter)}`);
  ok("§6 and the seed feeds on from the clean ground (one wound minute, her company still in the field: five whole energy more)",
    seedRow(fallenSeedId).fed_energy === fedBefore + 5 && purse() === purseBefore - 5,
    `fed=${seedRow(fallenSeedId).fed_energy} before=${fedBefore} purse=${purse()} before=${purseBefore}`);
}

/* ── §7 THE SUMMONING STEP (proof 8) ────────────────── */
console.log("§7 summoning power quickens her standing feed — exactly half a point per point of power");
{
  // Grant her a Summoner's Power star by the record's
  // own road (a held zodiac skill; the star r_b1 carries
  // the "summoner" clause at +2 in the live fx). Her
  // measure is then EXACTLY 2: the clause's 2, no level
  // step (level 6 of 7), no Sage grant (Warden). Her
  // standing rate becomes 5 + 0.5 × 2 = 6 a minute; with
  // her company still in the field the stack pours 6.25
  // a minute — a wound minute takes SIX whole energy,
  // where the unstepped stack took five (§5/§6).
  db.prepare("INSERT INTO tender_skills (owner_key, skill_key, pool, created_at) VALUES (?, 'r_b1', 'tree', ?)").run(ownerKey, Date.now());
  const fedBefore = seedRow(fallenSeedId).fed_energy;
  const purseBefore = purse();
  windMinute();
  await read();
  ok("§7 THE STEPPED RATE, EXACT: at summoning power 2 her wound minute on the tile takes SIX whole energy off the purse (5 + 0.5×2, the company's quarter riding the same minute)",
    seedRow(fallenSeedId).fed_energy === fedBefore + 6 && purse() === purseBefore - 6,
    `fed=${seedRow(fallenSeedId).fed_energy} before=${fedBefore} purse=${purse()} before=${purseBefore}`);
}

console.log(`\ndrive-tender-standing-feeds: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
