// drive-first-seed-risings — THE RISINGS RIDE THE ENGINE
// (Nigel, 2026-10-24: "The risings ride the engine").
// The first seed's hold keeps every number it ever had —
// rising N brings N Fray, a minute apart (later sporadic),
// the bank at the third rising, fail-before-the-bank costs
// nothing — but its referee is now the homeland's living
// cadence battle, not the retired instant arithmetic.
// RESTATED BY THE GROWTH CYCLE (Nigel, 2026-10-24 18:32,
// ratified 19:21; built 2026-10-25): THE LADDER IS DEAD —
// "forget the waves survied, it will be by energy fed."
// The level-by-waves checks this drive once carried are
// re-stated as FEEDING checks (§S, §D, §H): risings raise
// nothing; a seed's level is its fed ledger alone; the
// reward is laid up at the FEEDING rise to level 3
// (30 energy fed — a full lighthouse), where the event
// completes. §I proves the starfall cap (one star on a
// map at a time) and its online-only gate; §J proves the
// RETURN LAW (a lit lighthouse resets the wave intensity
// to 1 on the terrain read; unlit, the escalation stands).
// Proven here against the real API on a scratch server:
//   §S the seams, read from the source as written: the old
//      referee is gone; the battle's fell path routes a
//      marked Fray to the hold's pay before the land's
//      bounty; the Standard/Beacon reading is spent in the
//      answer pass; the spawn pass stands AFTER the battle
//      in getTerritory; the panel says "Rising".
//   §A SPAWN ON PRESENCE: with the arrival wound past due,
//      event reads alone spawn NOTHING — one territory read
//      births the rising, whole, served in that very
//      response, marked with its rising's number.
//   §B ENGINE TIME: the rising is fought across reads —
//      strikes witnessed beat by beat in the strike record,
//      the fell never in the birthing read nor the priming
//      read after it.
//   §C THE HOLD'S NUMBERS, EXACT: one Fray, one fell —
//      +3✦ to the purse; +10 to every Awoken who stood on
//      the seed's hex, and the fell's +2 XP pot — DIVIDED
//      by involvement since XP DIVISION (Nigel, 2026-10-24):
//      one hand's blow is all the damage this 3-HP Fray ever
//      takes in its felling window, so the pot lands whole
//      on that hand (42 in sum, one 12 and three 10s); NO
//      protection banked, NO Shadow paid (the land's bounty
//      does not ride here); and the next rising stands a
//      ruled minute away.
//   §D THE BANK AT THE THIRD RISING: the center purifies,
//      the pool fills to its cap (proven by the cap's own
//      clamp: a later fell adds nothing) — and the seed
//      stands LEVEL 1 still, three risings beaten and
//      nothing fed: the risings are not the ladder.
//   §E THE FALL COSTS NOTHING: a lone defender mauled by a
//      stouter fixture dark (the Uncle Run drive's own
//      fixture shape) — the run ends 'waiting', the run's
//      rising count reset, the seed's hex still cursed, the
//      rising's Fray withdrawn with the run, the defender
//      alive in hand, the purse unfilled.
//   §H FEEDING IS THE LADDER (the growth cycle): with the
//      risings frozen by hand, the seed drinks one whole
//      energy per settled span of the TENDER's own standing
//      on its hex (the company's draw was struck by Nigel
//      2026-10-25 12:19 — feeding is the Tender on the hex
//      alone), each span wound to exactly one whole energy
//      at her rate — 15 fed stands it a Sapling and its
//      ring purifies; 30 fed stands it a Beacon, lays up
//      the level-3 reward, and the event rests DONE.
//   §I STARFALL CAPPED AND ONLINE ONLY: an absent Tender's
//      hours never roll; while a star lies on the map the
//      sky stays closed; taken up, the sky reopens — and
//      where the star lands, its tile is purified
//      (the sanctuary) and the calm thins around it.
//   §J THE RETURN LAW: a lit lighthouse pins the served
//      wave intensity to 1 on the terrain read; unlit, the
//      escalation the reigns earned stands unreset.
//   §F ONE AT A TIME: while a rising stands, its successor
//      never spawns, however past due its hour is wound.
//   §G THE BANNERS SPENT LIVE: with fixture Standard and
//      Beacon workings raised on the edge ending on the
//      seed's hex (+40 each), a witnessed blow against the
//      rising's Fray deals 60+ — arithmetically impossible
//      with either reading unspent (ceilings ~27 unaided,
//      ~59 with one).
// The ambient cradle is stilled by hand on every poll (its
// anchor wound to now), as in test46: its weather is not
// the hold's, and the hold's numbers are read clean.
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-risings-"));
process.env.DATA_DIR = DATA_DIR;
process.env.PORT = "39964";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
process.chdir(root);

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

await import("../server/dist/index.js");
const { summonersPowerFor } = await import("../server/dist/skills.js");
const { levelForExp } = await import("../server/dist/tenderExp.js");
await sleep(2500);

const db = new Database(join(DATA_DIR, "app.db"));
const now0 = Date.now();

async function api(action, args, token) {
  const res = await fetch(`http://127.0.0.1:39964/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
const errText = (r) => String(r.data?.error ?? r.data?.message ?? "");

/* ── §S THE SEAMS, READ FROM THE SOURCE ─────────────── */
console.log("§S the seams — the retired referee and the new one's joints, read from the source");
{
  const actions = readFileSync(join(root, "server/src/actions.ts"), "utf8");
  const terr = readFileSync(join(root, "client/src/Territory.tsx"), "utf8");
  check("the old instant referee is RETIRED (resolveFirstSeedWave survives only as history in a comment)",
    (actions.match(/resolveFirstSeedWave/g) ?? []).length === 1 && !actions.includes("async function resolveFirstSeedWave"));
  const fellAt = actions.indexOf("const fellDark = async");
  const seedRoute = actions.indexOf("if (d.seedRising > 0)", fellAt);
  const bounty = actions.indexOf("await creditBattleKill", fellAt);
  check("the battle's fell path routes a rising's Fray to the hold's pay BEFORE the open land's bounty",
    fellAt > 0 && seedRoute > fellAt && bounty > seedRoute);
  check("the hold's fell pay stands in the fell path (+3 capped, the +2 XP pot divided by involvement, the drizzle)",
    actions.slice(seedRoute, bounty).includes("current + 3") && actions.slice(seedRoute, bounty).includes("grantDividedXpPot(2,") && actions.slice(seedRoute, bounty).includes("payFellDrip(ownerKey)"));
  const answerAt = actions.indexOf("// ── THE AWOKEN ANSWER");
  const bannerAt = actions.indexOf("homelandBannerBonus(ownerKey, axialRound(f.q, f.r)", answerAt);
  const mitigateAt = actions.indexOf("homelandFateMitigate(raw, targetAC, f.level)", answerAt);
  check("the Standard and the Beacon are spent in the living battle's answer pass, into raw harm before mitigation",
    answerAt > 0 && bannerAt > answerAt && mitigateAt > bannerAt && actions.slice(bannerAt, mitigateAt).includes("raw += banner.std + banner.bcn"));
  const battleAt = actions.indexOf("await settleHomelandBattle(ownerKey, tiles as any[], tenderStand.tileId", actions.indexOf("async getTerritory"));
  const spawnAt = actions.indexOf("await spawnFirstSeedRising(ownerKey, tiles as any[])", actions.indexOf("async getTerritory"));
  check("the rising lands at the territory read's END — the spawn pass stands after the living battle in getTerritory",
    battleAt > 0 && spawnAt > battleAt);
  check("the hold panel speaks the ruling's word: 'Rising {N} comes in' — and no 'Wave {N} comes in' survives",
    terr.includes("Rising {ev.nextWave} comes in") && !terr.includes("Wave {ev.nextWave} comes in"));
  // THE GROWTH CYCLE'S SEAMS (2026-10-25): the ladder struck,
  // feeding standing in its place.
  check("§S THE LADDER IS STRUCK: firstSeedLevelFor stands nowhere in the server source",
    !actions.includes("function firstSeedLevelFor"));
  const ladderAt = actions.indexOf("async function settleFirstSeedLadder");
  const ladderEnd = actions.indexOf("saveFirstSeedEvent(ev);", ladderAt);
  check("§S a rising's clearing writes NO seed level and completes NO run (the clearing only schedules the next rising)",
    ladderAt > 0 && !actions.slice(ladderAt, ladderEnd).includes("UPDATE star_seeds SET level") && !actions.slice(ladderAt, ladderEnd).includes('ev.state = "done"'));
  check("§S FEEDING stands as the only ladder: the fed prices (15 / the ruled 30), the level read from fed alone, the draw settled on the territory read",
    actions.includes("export const SEED_FED_FOR_LEVEL_3 = 30") && actions.includes("export function seedLevelForFed") && actions.includes("async function settleSeedFeeding")
    && actions.slice(actions.indexOf("async getTerritory")).includes("await settleSeedFeeding(ownerKey)"));
  check("§S the Sapling's rise purifies its ring and the Beacon's rise completes the first seed's event (the stage-rise pass stands)",
    actions.includes("async function applySeedStageRise") && actions.includes("purifySeedGroundTile"));
  check("§S STARFALL: one star at a time (the sky closed while a star lies fallen or corrupted) and online only (the presence stamp walks with the settle, under the house's presence gap)",
    actions.includes("state IN ('fallen','corrupted')") && actions.includes("starfall_seen_at") && actions.slice(actions.indexOf("STARFALL (ruled 2026-10-16; re-founded"), actions.indexOf("async settleSeedCalm")).includes("PROTECTION_ONLINE_GAP_MS"));
  check("§S seeds are CURSE-IMMUNE for now: no column landing in settleIncursions writes a seed corrupted",
    !actions.slice(actions.indexOf("async function settleIncursions"), actions.indexOf("async settleSeedCalm")).includes("SET state = 'corrupted'"));
  check("§S the seed-calm reckons LIVING seeds — fallen, held, and the first (the sanctuary's thinning)",
    actions.includes("async function livingSeedHexes") && actions.includes("state IN ('fallen','held','first')"));
  check("§S the panel speaks FEEDING, not the ladder (no 'every three risings, a new level' survives on the face)",
    terr.includes("grows by FEEDING") && !terr.includes("every three risings, a new level"));
}

/* ── Fixtures ───────────────────────────────────────── */
const insAsset = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
function seedCompany(ownerKey, ownerName, pieces, names) {
  const parts = pieces.map(([n, c, p, t, el]) => ({ id: Number(insAsset.run(n, c, p, t, el, `drive/${n}.png`, now0).lastInsertRowid), name: n, category: c, power: p, toughness: t, element: el }));
  const composition = JSON.stringify(parts.map(p => ({ source_id: `db:${p.id}`, name: p.name, category: p.category, rarity: "common", power: p.power, toughness: p.toughness, element: p.element })));
  const ins = db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)");
  return names.map(n => Number(ins.run(n, n, `drive/${n}.png`, composition, ownerName, ownerKey, now0).lastInsertRowid));
}
async function claimTender(name) {
  const claim = await api("claimTender", { password: "drive-password-1", tenderName: name });
  if (claim.status !== 200 || !claim.data.token) throw new Error(`claim ${name}: ${JSON.stringify(claim.data).slice(0, 160)}`);
  const tenderId = db.prepare("SELECT id FROM tenders WHERE tender_name = ?").get(name).id;
  return { token: claim.data.token, ownerKey: `tender:${tenderId}` };
}
const stillCradle = (ownerKey) => db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ? WHERE owner_key = ?").run(Date.now(), ownerKey);
const seedFray = (ownerKey, wave) => db.prepare("SELECT * FROM homeland_wanderers WHERE owner_key = ? AND seed_rising = ?").all(ownerKey, wave);
const eventRow = (ownerKey) => db.prepare("SELECT * FROM first_seed_events WHERE owner_key = ?").get(ownerKey);
const purse = (ownerKey) => db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(ownerKey)?.energy ?? 0;
const xpOf = (id) => db.prepare("SELECT experience FROM awakened WHERE id = ?").get(id)?.experience ?? 0;

/* ── Tender One: the ladder's first risings ─────────── */
console.log("§A–§D tender one — spawn on presence, engine time, the hold's numbers, the bank");
const T1 = await claimTender("Rising Tester");
const skyPieces = [["Drive Mail", "body", 3, 9, "sky"], ["Drive Arm", "arm", 3, 9, "sky"], ["Drive Helm", "head", 3, 9, "sky"]];
const guards = seedCompany(T1.ownerKey, "Rising Tester", skyPieces, ["First Guard", "Second Guard", "Third Guard", "Fourth Guard"]);
let r = await api("chooseClass", { classKey: "warden" }, T1.token);
check("tender one: the class binds (his stand's ground)", r.status === 200, errText(r));
r = await api("ensureFirstSeed", {}, T1.token);
check("tender one: the first seed is sown", r.status === 200 && r.data.created === true, JSON.stringify(r.data).slice(0, 120));
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 100, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = excluded.energy").run(T1.ownerKey, now0);
r = await api("deployFirstSeed", { awakenedIds: guards }, T1.token);
check("tender one: the company stands on the seed's hex", r.status === 200 && r.data.ok === true, errText(r));
r = await api("startFirstSeedHold", {}, T1.token);
check("tender one: the hold begins", r.status === 200 && r.data.ok === true, errText(r));

/* §A — spawn on presence only */
db.prepare("UPDATE first_seed_events SET next_wave_at = 1 WHERE owner_key = ?").run(T1.ownerKey);
for (let i = 0; i < 3; i++) await api("getFirstSeedEvent", {}, T1.token);
check("§A event reads alone spawn NOTHING, however past due the rising stands",
  seedFray(T1.ownerKey, 1).length === 0 && Number(eventRow(T1.ownerKey).rising_live) === 0,
  `fray=${seedFray(T1.ownerKey, 1).length} live=${eventRow(T1.ownerKey).rising_live}`);
stillCradle(T1.ownerKey);
const spawnRead = await api("getTerritory", {}, T1.token);
const fray1 = seedFray(T1.ownerKey, 1);
check("§A ONE territory read births the rising: exactly one Fray, marked with rising 1, standing whole at 3 HP",
  fray1.length === 1 && Number(fray1[0].hp) === 3 && Number(eventRow(T1.ownerKey).rising_live) === 1,
  JSON.stringify(fray1.map(w => [w.id, w.hp])));
check("§A the birthing read SERVES the new Fray in its own response — the arrival is witnessed by the read that made it",
  (spawnRead.data.wanderers ?? []).some(w => w.id === fray1[0].id),
  `served=${(spawnRead.data.wanderers ?? []).length}`);
const fray1Id = fray1[0].id;

/* §B + §C — the fight in engine time, and its exact pay */
db.prepare("UPDATE tender_resources SET energy = 0 WHERE owner_key = ?").run(T1.ownerKey);
const xpBefore = guards.map(xpOf);
let witnessed = 0;
let clearedAtPoll = -1;
for (let poll = 1; poll <= 40; poll++) {
  await sleep(900);
  stillCradle(T1.ownerKey);
  const terr = await api("getTerritory", {}, T1.token);
  witnessed += (terr.data.strikes ?? []).filter(s => s.wandererId === fray1Id).length;
  const evr = await api("getFirstSeedEvent", {}, T1.token);
  if (evr.data.event && evr.data.event.wavesCleared === 1) { clearedAtPoll = poll; break; }
}
check("§B the rising was fought in ENGINE TIME: beaten, and not before the third read after its birth (birth, priming, then blows)",
  clearedAtPoll >= 2, `clearedAtPoll=${clearedAtPoll}`);
check("§B the company's strikes against the rising's Fray stand in the strike witness — the fight was seen, beat by beat",
  witnessed >= 1, `witnessed=${witnessed}`);
const xpDelta = guards.map((id, i) => xpOf(id) - xpBefore[i]);
check("§C the defense is paid the hold's way: +10 to every Awoken who stood, and the fell's +2 pot whole to the one hand that damaged the Fray (deltas: one 12, three 10s)",
  xpDelta.reduce((a, b) => a + b, 0) === 42 && xpDelta.filter(d => d === 12).length === 1 && xpDelta.filter(d => d === 10).length === 3,
  `deltas=${xpDelta.join(",")}`);
check("§C the fell pays the hold's +3✦ — the purse, emptied by hand before the rising, holds exactly 3",
  purse(T1.ownerKey) === 3, `purse=${purse(T1.ownerKey)}`);
{
  const prog = db.prepare("SELECT protection_bank_ms AS bank, shadow_matter AS shadow FROM tender_progress WHERE owner_key = ?").get(T1.ownerKey);
  check("§C the open land's bounty did NOT ride on the seed's ground: no protection banked, no Shadow paid",
    !!prog && Number(prog.bank) === 0 && Number(prog.shadow) === 0, JSON.stringify(prog));
}
{
  const ev = eventRow(T1.ownerKey);
  const gap = Number(ev.next_wave_at) - Date.now();
  check("§C the next rising stands the ruled MINUTE away (rising 2's gap, ±10s of read time)",
    Number(ev.rising_live) === 0 && gap > 50000 && gap < 75000, `gap=${gap}`);
}

/* §F lead-in + §D — risings 2 and 3, the pile-up guard, the bank */
async function fightRising(wave, token, ownerKey) {
  db.prepare("UPDATE first_seed_events SET next_wave_at = 1 WHERE owner_key = ?").run(ownerKey);
  let standing = 0;
  for (let i = 0; i < 40 && standing !== wave; i++) {
    stillCradle(ownerKey);
    await api("getTerritory", {}, token);
    standing = seedFray(ownerKey, wave).length;
    if (standing !== wave) await sleep(400);
  }
  if (standing !== wave) return { spawned: standing, cleared: false };
  for (let i = 0; i < 200; i++) {
    stillCradle(ownerKey);
    await api("getTerritory", {}, token);
    const evr = await api("getFirstSeedEvent", {}, token);
    if (evr.data.event && evr.data.event.wavesCleared === wave) return { spawned: standing, cleared: true };
    await sleep(700);
  }
  return { spawned: standing, cleared: false };
}
{
  const two = await fightRising(2, T1.token, T1.ownerKey);
  check("rising 2 stands as two real Fray and is beaten in engine time", two.spawned === 2 && two.cleared, JSON.stringify(two));
}
db.prepare("UPDATE tender_resources SET energy = 0 WHERE owner_key = ?").run(T1.ownerKey);
{
  // Rising 3 spawns; while it stands, its successor's hour
  // is wound past due (§F) — then the fight is let finish.
  db.prepare("UPDATE first_seed_events SET next_wave_at = 1 WHERE owner_key = ?").run(T1.ownerKey);
  let standing = 0;
  for (let i = 0; i < 40 && standing !== 3; i++) {
    stillCradle(T1.ownerKey);
    await api("getTerritory", {}, T1.token);
    standing = seedFray(T1.ownerKey, 3).length;
    if (standing !== 3) await sleep(400);
  }
  check("rising 3 stands as three real Fray", standing === 3, `standing=${standing}`);
  db.prepare("UPDATE first_seed_events SET next_wave_at = 1 WHERE owner_key = ?").run(T1.ownerKey);
  let piled = 0;
  for (let i = 0; i < 4; i++) {
    stillCradle(T1.ownerKey);
    await api("getTerritory", {}, T1.token);
    piled += seedFray(T1.ownerKey, 4).length;
    await sleep(300);
  }
  check("§F ONE AT A TIME: while rising 3 stands, rising 4 never spawns — risings never stack, however past due",
    piled === 0 && Number(eventRow(T1.ownerKey).rising_live) === 1, `piled=${piled}`);
  let cleared = false;
  for (let i = 0; i < 200 && !cleared; i++) {
    stillCradle(T1.ownerKey);
    await api("getTerritory", {}, T1.token);
    const evr = await api("getFirstSeedEvent", {}, T1.token);
    cleared = !!evr.data.event && evr.data.event.wavesCleared === 3;
    if (!cleared) await sleep(700);
  }
  check("rising 3 is beaten in engine time", cleared);
  const center = db.prepare("SELECT cursed FROM territory_tiles WHERE owner_key = ? AND q = 0 AND r = 0").get(T1.ownerKey);
  const ev = eventRow(T1.ownerKey);
  check("§D THE BANK at the third rising: the seed banked, the center purified, three risings on the run's count",
    Number(ev.banked) === 1 && Number(ev.waves_cleared) === 3 && center && center.cursed === 0,
    `banked=${ev.banked} cleared=${ev.waves_cleared} cursed=${center?.cursed}`);
  // THE GROWTH CYCLE'S RESTATEMENT: this check once read
  // the ladder ("the ladder at 3 and the seed still level
  // 1"). The ladder is struck — the truth it now proves is
  // feeding's: three risings beaten, the risings counted
  // and banked, and the seed stands a level-1 Starseed
  // still, because risings raise nothing. (At the growth
  // cycle's first building, the company's presence near
  // the seed also drank a little during these sections;
  // that draw was itself struck by Nigel 2026-10-25 12:19
  // — feeding is the Tender on the hex alone, and she has
  // not stood on it yet, so the ledger stands wherever
  // the risings left it, far below the Sapling's price.
  // §H feeds it in earnest and watches it climb; §S reads
  // the struck function out of the source.)
  const evServedD = (await api("getFirstSeedEvent", {}, T1.token)).data.event;
  check("§D THE LADDER IS STRUCK in fact: three risings beaten and the seed still stands a level-1 Starseed — risings are not the ladder",
    !!evServedD && evServedD.seedLevel === 1 && evServedD.seedStage === "starseed" && evServedD.fedEnergy < 15,
    JSON.stringify(evServedD && { level: evServedD.seedLevel, stage: evServedD.seedStage, fed: evServedD.fedEnergy }));
  const filled = purse(T1.ownerKey);
  const fedAtBank = evServedD ? evServedD.fedEnergy : 0;
  check("§D the pool FILLED at the bank (from empty by hand to the cap's own figure, > 0)", filled > 0, `purse=${filled}`);
  // Rising 4's first fell must add nothing: the purse
  // already stands at its cap — the clamp is the proof.
  // (The growth cycle's one amendment: the seed DRINKS
  // while the company stands — the purse may fall below
  // the fill by exactly what the seed has been fed since,
  // read off the served ledger, never by a fell's pay.)
  const four = await fightRising(4, T1.token, T1.ownerKey);
  check("rising 4 stands as four real Fray and is beaten (risings continue past the bank, on purified ground)",
    four.spawned === 4 && four.cleared, JSON.stringify(four));
  const fedAfterFour = ((await api("getFirstSeedEvent", {}, T1.token)).data.event ?? {}).fedEnergy ?? 0;
  check("§D the bank's fill WAS the cap: rising 4's fells (4 × +3✦, capped) leave the purse where the bank left it, less only the seed's own drinking since",
    purse(T1.ownerKey) === filled - (fedAfterFour - fedAtBank),
    `purse=${purse(T1.ownerKey)} filled=${filled} fedBank=${fedAtBank} fedNow=${fedAfterFour}`);
}

/* ── §E Tender Two: the fall costs nothing ──────────── */
console.log("§E tender two — the defense falls before the bank, and nothing is lost");
const T2 = await claimTender("Falling Tester");
const weakPieces = [["Sackcloth", "body", 0, 1, "stone"]];
// Three wakes (the class choosing opens at three, as
// tender one's four proved) — but the party ledger is
// named BY HAND as the guard alone, before any territory
// read: the first-entry muster would otherwise field all
// three beside the stand, ON THE SEED'S RING, and their
// lawful defense would make the fall unjudgeable. The
// fixture isolates the lone defense — the fall's shape.
const lone = seedCompany(T2.ownerKey, "Falling Tester", weakPieces, ["Lone Guard", "Hand Second", "Hand Third"]);
db.prepare("INSERT INTO tender_party (owner_key, awakened_id, added_at) VALUES (?, ?, ?)").run(T2.ownerKey, lone[0], Date.now());
r = await api("chooseClass", { classKey: "warden" }, T2.token);
check("tender two: the class binds", r.status === 200, errText(r));
r = await api("ensureFirstSeed", {}, T2.token);
check("tender two: the first seed is sown", r.status === 200 && r.data.created === true, JSON.stringify(r.data).slice(0, 120));
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 50, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = excluded.energy").run(T2.ownerKey, now0);
r = await api("deployFirstSeed", { awakenedIds: [lone[0]] }, T2.token);
check("tender two: the lone guard stands on the seed's hex", r.status === 200 && r.data.ok === true, errText(r));
r = await api("startFirstSeedHold", {}, T2.token);
check("tender two: the hold begins", r.status === 200 && r.data.ok === true, errText(r));
db.prepare("UPDATE tender_resources SET energy = 5 WHERE owner_key = ?").run(T2.ownerKey);
db.prepare("UPDATE first_seed_events SET next_wave_at = 1 WHERE owner_key = ?").run(T2.ownerKey);
{
  let standing = 0;
  for (let i = 0; i < 40 && standing !== 1; i++) {
    stillCradle(T2.ownerKey);
    await api("getTerritory", {}, T2.token);
    standing = seedFray(T2.ownerKey, 1).length;
    if (standing !== 1) await sleep(400);
  }
  check("§E the rising stands on tender two's land", standing === 1, `standing=${standing}`);
  // The fixture mauling (the Uncle Run drive's own shape):
  // the dark stands stouter AND stronger than any real
  // rising's Fray (30 HP, power 30 — one landed bite burns
  // her rolled shield and her 1 HP together), and the
  // guard stands at 1 HP — the fight's every blow after
  // this is the engine's own. (Probed: at hp 30 alone she
  // OUTLASTS it — its bites trickle past her shield while
  // her stone strikes land ~6 a blow; the fall must be
  // the dark's strength, not a race she can win.)
  db.prepare("UPDATE homeland_wanderers SET hp = 30, power = 30 WHERE owner_key = ? AND seed_rising = 1").run(T2.ownerKey);
  db.prepare("UPDATE field_placements SET hp = 1 WHERE owner_key = ? AND awakened_id = ?").run(T2.ownerKey, lone[0]);
  let fell = false;
  for (let i = 0; i < 120 && !fell; i++) {
    stillCradle(T2.ownerKey);
    await api("getTerritory", {}, T2.token);
    const evr = await api("getFirstSeedEvent", {}, T2.token);
    fell = !!evr.data.event && evr.data.event.state === "waiting";
    if (!fell) await sleep(700);
  }
  const ev = eventRow(T2.ownerKey);
  const center = db.prepare("SELECT id, cursed FROM territory_tiles WHERE owner_key = ? AND q = 0 AND r = 0").get(T2.ownerKey);
  const placed = db.prepare("SELECT COUNT(*) AS n FROM field_placements WHERE owner_key = ? AND awakened_id = ? AND tile_id = ?").get(T2.ownerKey, lone[0], center.id).n;
  const alive = db.prepare("SELECT COUNT(*) AS n FROM awakened WHERE id = ?").get(lone[0]).n;
  check("§E the run ENDS in 'waiting' — the defense fell and the seed waits, whole",
    fell && Number(ev.waves_cleared) === 0 && Number(ev.banked) === 0, `state=${ev.state} cleared=${ev.waves_cleared} banked=${ev.banked}`);
  check("§E nothing is lost: the seed's hex still cursed, the rising's Fray withdrawn with the run, the purse untouched at the 5 it stood at (no bank filled it, no fell paid it)",
    center && center.cursed === 1 && seedFray(T2.ownerKey, 1).length === 0 && purse(T2.ownerKey) === 5,
    `cursed=${center?.cursed} fray=${seedFray(T2.ownerKey, 1).length} purse=${purse(T2.ownerKey)}`);
  check("§E the fallen guard no longer holds the seed's hex — her placement there gone, her self alive",
    placed === 0 && alive === 1, `placedOnSeed=${placed} alive=${alive}`);
}

/* ── §G Tender Three: the Standard and the Beacon are spent ── */
console.log("§G tender three — the banners ride the living battle, strike by strike");
const T3 = await claimTender("Banner Tester");
const bannerGuards = seedCompany(T3.ownerKey, "Banner Tester", skyPieces, ["East Guard", "West Guard", "North Guard", "South Guard"]);
r = await api("chooseClass", { classKey: "warden" }, T3.token);
check("tender three: the class binds", r.status === 200, errText(r));
r = await api("ensureFirstSeed", {}, T3.token);
check("tender three: the first seed is sown", r.status === 200 && r.data.created === true, JSON.stringify(r.data).slice(0, 120));
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 100, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = excluded.energy").run(T3.ownerKey, now0);
r = await api("deployFirstSeed", { awakenedIds: bannerGuards }, T3.token);
check("tender three: the company stands on the seed's hex", r.status === 200 && r.data.ok === true, errText(r));
r = await api("startFirstSeedHold", {}, T3.token);
check("tender three: the hold begins", r.status === 200 && r.data.ok === true, errText(r));
// The banners, raised by hand as fixture workings on the
// one edge that ends ON the seed's hex (q -1, r 0, dir 2
// → ends (-1,0) and (0,0)): the Standard lends +40 to a
// striker standing on its ends — the company, on the seed
// — and the Beacon lends +40 against dark standing on or
// beside its ends — the rising's Fray, on the seed. In a
// real hold they are cast workings; here they are the
// reading's fixture, and the battle's spending of them is
// what is on trial.
const insWorking = db.prepare("INSERT INTO territory_workings (owner_key, spell_key, engine, kind, q, r, dir, nums, hp, created_at) VALUES (?, ?, ?, 'ward', -1, 0, 2, ?, 100, ?)");
insWorking.run(T3.ownerKey, "drive-standard", "standard", JSON.stringify({ strikeBonus: 40 }), now0);
insWorking.run(T3.ownerKey, "drive-beacon", "beacon", JSON.stringify({ darkBonus: 40 }), now0);
db.prepare("UPDATE first_seed_events SET next_wave_at = 1 WHERE owner_key = ?").run(T3.ownerKey);
{
  let frayId = null;
  for (let i = 0; i < 40 && frayId === null; i++) {
    stillCradle(T3.ownerKey);
    await api("getTerritory", {}, T3.token);
    const rows = seedFray(T3.ownerKey, 1);
    if (rows.length === 1) frayId = rows[0].id;
    else await sleep(400);
  }
  check("§G the rising stands on the bannered ground", frayId !== null);
  let maxDmg = 0;
  let cleared = false;
  for (let i = 0; i < 60 && !cleared; i++) {
    stillCradle(T3.ownerKey);
    const terr = await api("getTerritory", {}, T3.token);
    for (const s of terr.data.strikes ?? []) {
      if (s.wandererId === frayId && s.hit) maxDmg = Math.max(maxDmg, s.dmg);
    }
    const evr = await api("getFirstSeedEvent", {}, T3.token);
    cleared = !!evr.data.event && evr.data.event.wavesCleared === 1;
    if (!cleared) await sleep(700);
  }
  // The arithmetic of the proof: this company's heaviest
  // unaided blow (a natural-20's doubled dice) mitigates
  // to at most ~27; EITHER banner alone lifts the ceiling
  // to ~59; BOTH together floor every landed blow at ~75.
  // A witnessed blow of 60+ is only possible with the
  // Standard AND the Beacon both spent into it.
  check("§G a witnessed blow against the rising's Fray dealt 60+ — the Standard AND the Beacon were both spent into the living battle's raw harm",
    maxDmg >= 60, `maxDmg=${maxDmg}`);
  check("§G the bannered rising is beaten and the run's count climbs (the risings' count — feeding alone climbs the seed)", cleared);
}

/* ── §H Tender One again: FEEDING IS THE LADDER ────── */
console.log("§H tender one — the seed drinks, and feeding alone climbs it");
{
  const K = T1.ownerKey;
  // The risings are frozen by hand for the feeding's whole
  // span (their next hour wound far out before every read):
  // §H reads the DRAW clean, as §A–§G read the hold clean —
  // no fell's pay may blur the purse's arithmetic.
  const freezeRisings = () => db.prepare("UPDATE first_seed_events SET next_wave_at = ? WHERE owner_key = ?").run(Date.now() + 3600000, K);
  freezeRisings();
  stillCradle(K);
  await api("getTerritory", {}, T1.token); // the priming read: the anchor walks to now, no span is drawn across the silence
  const ev0 = (await api("getFirstSeedEvent", {}, T1.token)).data.event;
  check("§H the feeding starts where the risings left it: the seed a level-1 Starseed, its event still holding",
    !!ev0 && ev0.seedLevel === 1 && ev0.seedStage === "starseed" && ev0.state === "holding",
    JSON.stringify(ev0 && { level: ev0.seedLevel, stage: ev0.seedStage, state: ev0.state, fed: ev0.fedEnergy }));
  const fed0 = ev0.fedEnergy;
  const seedRow = db.prepare("SELECT * FROM star_seeds WHERE owner_key = ? AND state = 'first'").get(K);
  const seedTile = db.prepare("SELECT q, r FROM territory_tiles WHERE id = ?").get(seedRow.tile_id);
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const ringCursed = () => DIRS.reduce((n, [dq, dr]) => {
    const t = db.prepare("SELECT cursed FROM territory_tiles WHERE owner_key = ? AND q = ? AND r = ?").get(K, seedTile.q + dq, seedTile.r + dr);
    return n + (t && t.cursed ? 1 : 0);
  }, 0);
  const cursedBefore = ringCursed();
  check("§H the Sapling's ring stands cursed before the rise (the widening light has something to purify)", cursedBefore >= 1, `cursed=${cursedBefore}`);
  db.prepare("UPDATE tender_resources SET energy = 80 WHERE owner_key = ?").run(K);
  // THE FEEDER IS THE TENDER HERSELF, ON THE HEX (Nigel,
  // 2026-10-25: feeding is the Tender on the hex alone —
  // the company draw struck 12:19). She takes the stand
  // through the real movement road; her rate is read off
  // the live summoning measure (the same reader her
  // standing feed rides), and each wound span is sized to
  // exactly one whole energy at that rate — a hair over
  // one energy's worth of minutes, so the take is one,
  // never two, and the gathering residue stays far below
  // a whole point across the section's thirty spans.
  r = await api("setTenderTile", { tileId: seedRow.tile_id }, T1.token);
  check("§H the Tender takes the feeding stand on the first seed's own hex, by the real movement road",
    r.status === 200, errText(r));
  const progH = db.prepare("SELECT total_exp AS totalExp, class_key AS classKey FROM tender_progress WHERE owner_key = ?").get(K);
  const rateH = 5 + 0.5 * summonersPowerFor(K, levelForExp(Number(progH?.totalExp ?? 0)), progH?.classKey);
  const windH = Math.ceil(60000 / rateH) + 60;
  const feed = async (n) => {
    for (let i = 0; i < n; i++) {
      freezeRisings();
      stillCradle(K);
      db.prepare("UPDATE star_seeds SET feed_anchor_at = ? WHERE id = ?").run(Date.now() - windH, seedRow.id);
      await api("getTerritory", {}, T1.token);
    }
  };
  await feed(15);
  const ev15 = (await api("getFirstSeedEvent", {}, T1.token)).data.event;
  check("§H FIFTEEN FED: the purse fell by exactly the drinking (80 → 65), the ledger reads fifteen more than it stood",
    purse(K) === 65 && !!ev15 && ev15.fedEnergy === fed0 + 15,
    `purse=${purse(K)} fed=${ev15?.fedEnergy} fed0=${fed0}`);
  check("§H the Sapling stands: level 2, the stage served by its own name",
    !!ev15 && ev15.seedLevel === 2 && ev15.seedStage === "sapling",
    JSON.stringify(ev15 && { level: ev15.seedLevel, stage: ev15.seedStage }));
  check("§H THE WIDENING LIGHT: the seed's whole ring stands purified at the Sapling's rise",
    ringCursed() === 0, `cursed=${ringCursed()} before=${cursedBefore}`);
  await feed(15);
  const ev30 = (await api("getFirstSeedEvent", {}, T1.token)).data.event;
  check("§H THIRTY FED — A FULL LIGHTHOUSE: level 3, the Beacon's stage, the purse at 50",
    purse(K) === 50 && !!ev30 && ev30.fedEnergy === fed0 + 30 && ev30.seedLevel === 3 && ev30.seedStage === "beacon",
    `purse=${purse(K)} fed=${ev30?.fedEnergy} level=${ev30?.seedLevel} stage=${ev30?.seedStage}`);
  check("§H the hold COMPLETES at the feeding rise: the event rests done, and the level-3 reward is laid up once, shining to be gathered",
    !!ev30 && ev30.state === "done" && !!ev30.reward && typeof ev30.reward.element === "string",
    JSON.stringify(ev30 && { state: ev30.state, reward: ev30.reward }));
  const seedsServed = (await api("getSeeds", {}, T1.token)).data.seeds ?? [];
  const firstServed = seedsServed.find(s => s.state === "first");
  check("§H the map's own serving agrees: the first seed reads a Beacon, fed 30, no next stage priced",
    !!firstServed && firstServed.stage === "beacon" && firstServed.fedEnergy === fed0 + 30 && firstServed.nextStageAt === null,
    JSON.stringify(firstServed));
}

/* ── §I Tender Four: STARFALL — one star, online only ─ */
console.log("§I tender four — the sky keeps one star, and only while he watches");
const T4 = await claimTender("Starfall Tester");
{
  const K = T4.ownerKey;
  const guard = seedCompany(K, "Starfall Tester", [["Sky Cloth", "body", 3, 3, "sky"], ["Sky Cord", "arms", 3, 3, "sky"], ["Sky Crown", "head", 3, 3, "sky"]], ["Sky Guard", "Sky Second", "Sky Third"]);
  r = await api("chooseClass", { classKey: "warden" }, T4.token);
  check("tender four: the class binds (his figure stands on the land — §J's settles ride his standing)", r.status === 200, errText(r));
  r = await api("ensureFirstSeed", {}, T4.token);
  check("tender four: the first seed is sown", r.status === 200 && r.data.created === true, JSON.stringify(r.data).slice(0, 120));
  r = await api("deployFirstSeed", { awakenedIds: [guard[0]] }, T4.token);
  check("tender four: a guard stands (the fetch party to come)", r.status === 200 && r.data.ok === true, errText(r));
  stillCradle(K);
  await api("getTerritory", {}, T4.token);
  await api("getSeeds", {}, T4.token); // the starfall settle opens the sky's ledger
  const fallenCount = () => db.prepare("SELECT COUNT(*) AS n FROM star_seeds WHERE owner_key = ? AND state = 'fallen'").get(K).n;
  check("§I a fresh sky holds no fallen star (the first settle only opens the ledger)", fallenCount() === 0, `fallen=${fallenCount()}`);
  // OFFLINE: three hours banked in absence — anchor and
  // presence stamp both wound back together. The settle
  // must walk the anchor past them UNROLLED.
  const longAgo = Date.now() - 3 * 3600000;
  db.prepare("UPDATE tender_attention SET starfall_anchor_at = ?, starfall_seen_at = ? WHERE owner_key = ?").run(longAgo, longAgo, K);
  await api("getSeeds", {}, T4.token);
  const attAfter = db.prepare("SELECT starfall_anchor_at FROM tender_attention WHERE owner_key = ?").get(K);
  check("§I ONLINE ONLY: three absent hours bank NO fall — the anchor walked past them unrolled",
    fallenCount() === 0 && Number(attAfter.starfall_anchor_at) > Date.now() - 60000,
    `fallen=${fallenCount()} anchorAge=${Date.now() - Number(attAfter.starfall_anchor_at)}ms`);
  // THE CAP: a star lies on the map (placed by hand, as a
  // fall would lay it) — two present, rolled hours must
  // not add another.
  const firstSeedTile = db.prepare("SELECT tile_id FROM star_seeds WHERE owner_key = ? AND state = 'first'").get(K).tile_id;
  const freeTile = db.prepare("SELECT id FROM territory_tiles WHERE owner_key = ? AND NOT (q = 0 AND r = 0) AND id != ? LIMIT 1").get(K, firstSeedTile).id;
  const handSeed = Number(db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at) VALUES (?, ?, 1, 'fallen', ?)").run(K, freeTile, Date.now()).lastInsertRowid);
  db.prepare("UPDATE tender_attention SET starfall_anchor_at = ?, starfall_seen_at = ? WHERE owner_key = ?").run(Date.now() - 2 * 3600000, Date.now(), K);
  await api("getSeeds", {}, T4.token);
  check("§I ONE STAR AT A TIME: while a star lies on the map, present rolled hours add none — the sky stays closed",
    fallenCount() === 1, `fallen=${fallenCount()}`);
  // TAKEN UP: the fetch rides (its stamps wound, as the
  // house's drives wind arrivals) and the seed is home.
  r = await api("fetchSeed", { seedId: handSeed, awakenedIds: [guard[0]] }, T4.token);
  check("tender four: the fetch rides for the lying star", r.status === 200 && r.data.ok === true, errText(r));
  db.prepare("UPDATE seed_missions SET arrive_at = 1, return_at = 1 WHERE owner_key = ?").run(K);
  await api("getSeeds", {}, T4.token);
  await api("getSeeds", {}, T4.token);
  const handState = db.prepare("SELECT state FROM star_seeds WHERE id = ?").get(handSeed).state;
  check("§I the star is TAKEN UP (fetched home) — the sky may open again", handState === "fetched" && fallenCount() === 0, `state=${handState} fallen=${fallenCount()}`);
  // THE SKY REOPENS: present hours roll until a star falls
  // (24 rolled hours a read, three reads at most — the
  // gate's 13% makes a fourth read a 1-in-200,000 silence).
  let fell = null;
  for (let i = 0; i < 3 && !fell; i++) {
    db.prepare("UPDATE tender_attention SET starfall_anchor_at = ?, starfall_seen_at = ? WHERE owner_key = ?").run(Date.now() - 24 * 3600000, Date.now(), K);
    await api("getSeeds", {}, T4.token);
    fell = db.prepare("SELECT * FROM star_seeds WHERE owner_key = ? AND state = 'fallen'").get(K) ?? null;
  }
  check("§I the sky REOPENS once the star is taken up: a fall lands — and lands as ONE star, never a rain",
    !!fell && fallenCount() === 1, `fallen=${fallenCount()}`);
  if (fell) {
    const fellTile = db.prepare("SELECT cursed FROM territory_tiles WHERE id = ?").get(fell.tile_id);
    check("§I THE SANCTUARY: the fallen star purified the tile it landed on",
      !!fellTile && fellTile.cursed === 0, `cursed=${fellTile?.cursed}`);
    // THE CALM AROUND IT: a tile two rings from the star
    // (and outside every other seed's calm) carries its
    // curse thinned — its strength cap (curse_max_hp)
    // reads strictly below a control tile at the SAME map
    // ring that no seed's calm touches. (The calm settles
    // inside every seeds read, so both are read after it.)
    const st = db.prepare("SELECT q, r FROM territory_tiles WHERE id = ?").get(fell.tile_id);
    const firstTile = db.prepare("SELECT q, r FROM territory_tiles WHERE id = ?").get(firstSeedTile);
    const ringOf = (q, rr) => Math.max(Math.abs(q), Math.abs(rr), Math.abs(q + rr));
    const distTo = (t, c) => Math.max(Math.abs(t.q - c.q), Math.abs(t.r - c.r), Math.abs((t.q - c.q) + (t.r - c.r)));
    const allTiles = db.prepare("SELECT q, r, curse_max_hp FROM territory_tiles WHERE owner_key = ? AND cursed = 1").all(K);
    const calmed = allTiles.find(t => distTo(t, st) === 2 && ringOf(t.q, t.r) >= 3 && distTo(t, firstTile) > 2);
    const control = calmed ? allTiles.find(t => ringOf(t.q, t.r) === ringOf(calmed.q, calmed.r) && distTo(t, st) > 2 && distTo(t, firstTile) > 2) : null;
    check("§I the curse THINS for two rings around the fallen star (a ring tile's curse strength below its uncalmed twin at the same map ring)",
      !!calmed && !!control && Number(calmed.curse_max_hp) < Number(control.curse_max_hp),
      `calmed=${JSON.stringify(calmed)} control=${JSON.stringify(control)}`);
  }
}

/* ── §J Tender Four still: THE RETURN LAW ───────────── */
console.log("§J tender four — returning to the terrain: lit resets, unlit stands");
{
  const K = T4.ownerKey;
  const prog = (patch) => {
    const sets = Object.entries(patch).map(([k]) => `${k} = ?`).join(", ");
    db.prepare(`UPDATE tender_progress SET ${sets} WHERE owner_key = ?`).run(...Object.values(patch), K);
  };
  // LIT: banked minutes and fuel by hand, lit by hand.
  prog({ lighthouse_lit: 1, protection_bank_ms: 30 * 60000, lighthouse_settled_at: Date.now(), shadow_matter: 10 });
  stillCradle(K);
  const litRead = await api("getTerritory", {}, T4.token);
  check("§J LIT: whatever the reigns earned, the terrain read serves the waves pushed back — intensity 1",
    litRead.data.battle && litRead.data.battle.lighthouseLit === true && litRead.data.battle.waveIntensity === 1,
    JSON.stringify(litRead.data.battle));
  // UNLIT: the reset mark stands written by the lit settle
  // at the current reign; wound four reigns back by hand,
  // the escalation it measures must stand served, unreset.
  prog({ lighthouse_lit: 0 });
  stillCradle(K);
  await api("getTerritory", {}, T4.token); // the baseline read: the mark rests at the current reign
  const markNow = db.prepare("SELECT intensity_reign_mark FROM tender_progress WHERE owner_key = ?").get(K).intensity_reign_mark;
  prog({ intensity_reign_mark: Number(markNow) - 4 });
  stillCradle(K);
  const unlitRead = await api("getTerritory", {}, T4.token);
  check("§J UNLIT: the escalation stands unreset — four reigns past the mark, intensity 5 is served",
    unlitRead.data.battle && unlitRead.data.battle.lighthouseLit === false && unlitRead.data.battle.waveIntensity === 5,
    JSON.stringify(unlitRead.data.battle));
}

console.log(`\ndrive-first-seed-risings: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
