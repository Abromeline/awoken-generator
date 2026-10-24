// test46 — THE THIRD RISING'S REWARD (Nigel, 2026-10-19): the
// first-seed hold's level-3 NEWBORN is struck — births from an
// event drop the value of minted cards, and creation belongs
// to the Forge. In its place, once ever, the event lays up ONE
// pending reward: a single attunement point of a random
// element, gathered by hand into that element's pool. And the
// DRIZZLE rides along: every Fray felled has a 20% chance to
// drip +0.1 attunement into a random element's pool (expected
// one point per fifty Fray — "barely moving the bar, but at
// least it's raising").
//
// REWORKED ONTO ENGINE TIME (2026-10-24 — the risings ride
// the engine, Nigel: "The risings ride the engine"): the hold
// no longer resolves its waves as instant arithmetic on read.
// Each rising now SPAWNS as real wanderers on the land
// (homeland_wanderers, marked with their rising's number),
// is FOUGHT by the living cadence battle across real reads,
// and the ladder is judged from the land. This drive climbs
// the whole ladder in that time: for every rising it winds
// the arrival clock forward by hand (next_wave_at into the
// past — the standing fixture trick), watches the rising
// stand on the land in the server's own ledger, then polls
// the territory read at a real cadence until the rising is
// beaten. EVERY NUMBER CHECK OF THE OLD DRIVE STANDS: bank
// at 3, reward at 9, done at 12, seed level 4, no newborn,
// the drizzle's tenths and bounds, the claim by hand. The
// fixture company is stouter than the old drive's (toughness
// 9 a piece — AC 27, so a Fray's bite lands only on a natural
// twenty; power 3 a piece — power 9, one landed blow fells a
// 3-HP Fray): the old arithmetic needed a company that could
// not fall in one resolution; engine time needs one that
// cannot fall across twelve real fights. The ambient cradle
// is stilled by hand (its anchor wound to now on every poll)
// so the ladder's numbers are the hold's own — the cradle is
// another system's weather, and the old drive's reads never
// woke it either.
import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-test46-"));
process.env.DATA_DIR = DATA_DIR;
process.env.PORT = "39963";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

await import("../server/dist/index.js");
await sleep(2500);

const db = new Database(join(DATA_DIR, "app.db"));
const now = Date.now();

async function api(action, args, token) {
  const res = await fetch(`http://127.0.0.1:39963/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
const errText = (r) => String(r.data?.error ?? r.data?.message ?? "");

// ── A tender ─────────────────────────────────────────────────
const claim = await api("claimTender", { password: "test-password-1", tenderName: "Reward Tester" });
check("tender claimed", claim.status === 200 && !!claim.data.token, JSON.stringify(claim.data).slice(0, 120));
const token = claim.data.token;
const tenderId = db.prepare("SELECT id FROM tenders WHERE tender_name = 'Reward Tester'").get().id;
const ownerKey = `tender:${tenderId}`;

// ── Four stout defenders (direct seed; the scratch world
// starts empty by design). Three pieces apiece at power 3 /
// toughness 9, sky throughout: power 9 (one landed blow
// fells a 3-HP Fray), toughness 27 (a Fray's bite lands only
// on a natural twenty) — the company cannot fall across
// twelve engine-time fights. ─────────────────────────────────
const insAsset = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
const parts = [
  ["Test Mail", "body"], ["Test Arm", "arm"], ["Test Helm", "head"],
].map(([n, c]) => ({ id: Number(insAsset.run(n, c, 3, 9, "sky", `test/${n}.png`, now).lastInsertRowid), name: n, category: c }));
const composition = JSON.stringify(parts.map(p => ({
  source_id: `db:${p.id}`, name: p.name, category: p.category, rarity: "common", power: 3, toughness: 9, element: "sky",
})));
const insAwokin = db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', 'Reward Tester', ?, ?)");
const defenderIds = ["First Guard", "Second Guard", "Third Guard", "Fourth Guard"]
  .map(n => Number(insAwokin.run(n, n, `test/${n}.png`, composition, ownerKey, now).lastInsertRowid));

// The choosing (four held ≥ three): the class gives the
// Tender his stand, without which no territory read settles
// a battle at all — the engine's ground rule, proved by the
// Uncle Run drive. The weapon is the choosing's second gift.
let r = await api("chooseClass", { classKey: "warden" }, token);
check("the class binds (the stand's ground)", r.status === 200 && r.data.classKey === "warden", errText(r) || JSON.stringify(r.data).slice(0, 120));
r = await api("chooseWeapon", { weaponKey: "sword" }, token);
check("the runic weapon binds", r.status === 200 && r.data.weaponKey === "sword", errText(r) || JSON.stringify(r.data).slice(0, 120));

// ── The world is sown; the company deploys; the hold begins ──
r = await api("ensureFirstSeed", {}, token);
check("the first seed is sown", r.status === 200 && r.data.created === true, JSON.stringify(r.data).slice(0, 120));
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 100, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = excluded.energy")
  .run(ownerKey, now);
r = await api("deployFirstSeed", { awakenedIds: defenderIds }, token);
check("the company stands on the seed's hex", r.status === 200 && r.data.ok === true, errText(r) || JSON.stringify(r.data).slice(0, 120));
r = await api("startFirstSeedHold", {}, token);
check("the hold begins", r.status === 200 && r.data.ok === true, errText(r) || JSON.stringify(r.data).slice(0, 120));

// ── Drive the ladder in engine time: twelve risings, each
// spawned onto the land and fought there. The cradle is
// stilled on every poll (its anchor wound to now) so no
// ambient dark joins or leaves the hold's accounting. ──────
const FIVE = ["root", "tide", "sky", "stone", "fire"];
const pool = (el) => db.prepare("SELECT points FROM aspect_attunement WHERE owner_key = ? AND element = ?").get(ownerKey, el)?.points ?? 0;
const seedFrayStanding = (wave) => db.prepare("SELECT COUNT(*) AS n FROM homeland_wanderers WHERE owner_key = ? AND seed_rising = ?").get(ownerKey, wave).n;
const stillCradle = () => db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ? WHERE owner_key = ?").run(Date.now(), ownerKey);
let rewardAtNine = null;
let evFinal = null;
for (let wave = 1; wave <= 12; wave++) {
  db.prepare("UPDATE first_seed_events SET next_wave_at = 1 WHERE owner_key = ?").run(ownerKey);
  // The rising lands: poll the territory read until its Fray
  // stand on the land, marked with the rising's number.
  let spawned = 0;
  for (let i = 0; i < 40 && spawned !== wave; i++) {
    stillCradle();
    await api("getTerritory", {}, token);
    spawned = seedFrayStanding(wave);
    if (spawned !== wave) await sleep(400);
  }
  check(`rising ${wave} stands on the land as ${wave} real Fray`, spawned === wave, `standing=${spawned}`);
  // The fight: poll at a real cadence until the judgement
  // reads the rising beaten. The battle settles real
  // elapsed time between reads, so the polls sleep.
  let ev = null;
  for (let i = 0; i < 200; i++) {
    stillCradle();
    await api("getTerritory", {}, token);
    const rr = await api("getFirstSeedEvent", {}, token);
    ev = rr.data.event;
    if (ev && ev.wavesCleared === wave) break;
    await sleep(700);
  }
  check(`rising ${wave} beaten in engine time`, !!ev && ev.wavesCleared === wave, `wavesCleared=${ev?.wavesCleared} state=${ev?.state}`);
  if (wave === 3) {
    const center = db.prepare("SELECT cursed FROM territory_tiles WHERE owner_key = ? AND q = 0 AND r = 0").get(ownerKey);
    check("the bank at rising 3: the center stands purified", !!ev && ev.banked === true && center && center.cursed === 0,
      `banked=${ev?.banked} cursed=${center?.cursed}`);
  }
  if (wave === 9) rewardAtNine = ev.reward;
  evFinal = ev;
}
check("the ladder is done at twelve risings", !!evFinal && evFinal.state === "done" && evFinal.seedLevel === 4, `state=${evFinal?.state} level=${evFinal?.seedLevel}`);

// ── The birth is struck ──────────────────────────────────────
const claims = db.prepare("SELECT COUNT(*) AS n FROM pending_newborn_claims WHERE owner_key = ?").get(ownerKey).n;
check("NO newborn claim was recorded — the birth is struck", claims === 0, `claims=${claims}`);

// ── The reward waits, one point of one of the five ───────────
check("a reward is pending after the third rising", !!rewardAtNine && FIVE.includes(rewardAtNine.element), JSON.stringify(rewardAtNine));
check("the reward still waits at the ladder's end", !!evFinal.reward && evFinal.reward.element === rewardAtNine.element, JSON.stringify(evFinal.reward));
const rewardElement = evFinal.reward.element;

// ── The drizzle: fractional, bounded, real ───────────────────
// BEFORE the claim: the five pools hold ONLY what the felled
// dripped (a fresh owner starts at zero). 78 Fray fell across
// risings 1–12; each fell could drip at most +0.1.
const before = Object.fromEntries(FIVE.map(el => [el, pool(el)]));
const totalDrip = FIVE.reduce((s, el) => s + before[el], 0);
const totalFells = 78; // 1+2+…+12 — every Fray of every rising felled
check("every pool's drip is a whole number of tenths", FIVE.every(el => Math.abs(before[el] * 10 - Math.round(before[el] * 10)) < 1e-6),
  FIVE.map(el => `${el}=${before[el]}`).join(" "));
check("the drizzle raised the pools (> 0)", totalDrip > 0, `total=${totalDrip}`);
check("the drizzle never overpaid (<= 0.1 x fells)", totalDrip <= 0.1 * totalFells + 1e-9, `total=${totalDrip} fells=${totalFells}`);

// ── Gather it by hand ────────────────────────────────────────
r = await api("claimFirstSeedReward", {}, token);
check("the claim answers with the reward's own element", r.status === 200 && r.data.ok === true && r.data.element === rewardElement, JSON.stringify(r.data).slice(0, 140));
check("no aspect was born of one point on a shallow pool", r.data.aspectSpawned === false, JSON.stringify(r.data).slice(0, 140));
check("the pool rose by exactly the one point", Math.abs(pool(rewardElement) - (before[rewardElement] + 1)) < 1e-9,
  `${rewardElement}: ${before[rewardElement]} -> ${pool(rewardElement)}`);
check("the other pools kept only their drizzle", FIVE.every(el => el === rewardElement || Math.abs(pool(el) - before[el]) < 1e-9));

r = await api("getFirstSeedEvent", {}, token);
check("the reward is gathered — the DTO shows none waiting", r.data.event && r.data.event.reward === null, JSON.stringify(r.data.event?.reward));

r = await api("claimFirstSeedReward", {}, token);
check("a second claim is refused", r.status === 400, `status=${r.status} ${errText(r)}`);
check("the refused claim paid nothing", Math.abs(pool(rewardElement) - (before[rewardElement] + 1)) < 1e-9,
  `${rewardElement}=${pool(rewardElement)}`);

console.log(`\ntest46: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
