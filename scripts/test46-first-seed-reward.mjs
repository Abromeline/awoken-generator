// test46 — THE FIRST SEED'S REWARD (Nigel, 2026-10-19): the
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
// Each rising SPAWNS as real wanderers on the land, is FOUGHT
// by the living cadence battle across real reads, and the
// hold is judged from the land.
//
// RESTATED BY THE GROWTH CYCLE (Nigel, 2026-10-24 18:32,
// ratified 19:21; built 2026-10-25): THE LADDER IS DEAD —
// "forget the waves survied, it will be by energy fed." This
// drive once climbed twelve risings to the reward (reward at
// the ninth, done at the twelfth, seed level 4); every one of
// those numbers was the ladder's, and they are struck. What
// stands: the bank at the third rising (proven here in engine
// time, risings 1–3), NO newborn (proven), the drizzle's
// tenths and bounds (proven over the risings' fells), and THE
// REWARD AT THE FEEDING RISE TO LEVEL 3 — the seed fed to 30
// by the passive draw while the company stands (its anchor
// wound four minutes back per read, the §H shape of the
// risings drive), the Sapling at 15 with NO reward yet, the
// Beacon at 30 with the reward laid up and the event done,
// claimed by hand for exactly one point, a second claim
// refused. The ambient cradle is stilled by hand on every
// poll, as before.
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
// real engine-time fights. ─────────────────────────────────
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

// ── Risings 1–3 in engine time: the bank stands, and the
// defence stands while the seed feeds. The cradle is stilled
// on every poll (its anchor wound to now) so no ambient dark
// joins or leaves the hold's accounting. ───────────────────
const FIVE = ["root", "tide", "sky", "stone", "fire"];
const pool = (el) => db.prepare("SELECT points FROM aspect_attunement WHERE owner_key = ? AND element = ?").get(ownerKey, el)?.points ?? 0;
const seedFrayStanding = (wave) => db.prepare("SELECT COUNT(*) AS n FROM homeland_wanderers WHERE owner_key = ? AND seed_rising = ?").get(ownerKey, wave).n;
const stillCradle = () => db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ? WHERE owner_key = ?").run(Date.now(), ownerKey);
for (let wave = 1; wave <= 3; wave++) {
  db.prepare("UPDATE first_seed_events SET next_wave_at = 1 WHERE owner_key = ?").run(ownerKey);
  let spawned = 0;
  for (let i = 0; i < 40 && spawned !== wave; i++) {
    stillCradle();
    await api("getTerritory", {}, token);
    spawned = seedFrayStanding(wave);
    if (spawned !== wave) await sleep(400);
  }
  check(`rising ${wave} stands on the land as ${wave} real Fray`, spawned === wave, `standing=${spawned}`);
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
    check("three risings beaten and NO reward, NO level: the ladder that once paid at the ninth rising is struck — the seed stands level 1, its reward unlaid",
      !!ev && ev.state === "holding" && ev.seedLevel === 1 && ev.reward === null,
      `state=${ev?.state} level=${ev?.seedLevel} reward=${JSON.stringify(ev?.reward)}`);
  }
}

// ── FEEDING climbs the seed now: the risings frozen by hand
// (their next hour wound far out before every read), the
// draw wound four minutes a read — one whole energy at the
// ruled upkeep rate, the company standing on the seed's hex
// the whole while. ──────────────────────────────────────────
const seedRow = db.prepare("SELECT id FROM star_seeds WHERE owner_key = ? AND state = 'first'").get(ownerKey);
db.prepare("UPDATE tender_resources SET energy = 100 WHERE owner_key = ?").run(ownerKey); // the bank filled only to the cap; the feeding needs thirty whole in reach
const feed = async (n) => {
  for (let i = 0; i < n; i++) {
    db.prepare("UPDATE first_seed_events SET next_wave_at = ? WHERE owner_key = ?").run(Date.now() + 3600000, ownerKey);
    stillCradle();
    db.prepare("UPDATE star_seeds SET feed_anchor_at = ? WHERE id = ?").run(Date.now() - 240000, seedRow.id);
    await api("getTerritory", {}, token);
  }
};
await feed(15);
let evFed = (await api("getFirstSeedEvent", {}, token)).data.event;
check("FIFTEEN FED: the Sapling stands (level 2) — and still NO reward: the reward waits for the Beacon, not for any rising count",
  !!evFed && evFed.seedLevel === 2 && evFed.seedStage === "sapling" && evFed.reward === null && evFed.state === "holding",
  `level=${evFed?.seedLevel} stage=${evFed?.seedStage} reward=${JSON.stringify(evFed?.reward)} state=${evFed?.state}`);
await feed(15);
evFed = (await api("getFirstSeedEvent", {}, token)).data.event;
check("THIRTY FED — A FULL LIGHTHOUSE: level 3, the Beacon's stage, and the event rests DONE at the feeding rise",
  !!evFed && evFed.seedLevel === 3 && evFed.seedStage === "beacon" && evFed.state === "done",
  `level=${evFed?.seedLevel} stage=${evFed?.seedStage} state=${evFed?.state}`);
const evFinal = evFed;

// ── The birth is struck ──────────────────────────────────────
const claims = db.prepare("SELECT COUNT(*) AS n FROM pending_newborn_claims WHERE owner_key = ?").get(ownerKey).n;
check("NO newborn claim was recorded — the birth is struck", claims === 0, `claims=${claims}`);

// ── The reward waits, one point of one of the five ───────────
check("a reward is pending at the Beacon: one attunement point of one of the five elements",
  !!evFinal.reward && FIVE.includes(evFinal.reward.element), JSON.stringify(evFinal.reward));
const rewardElement = evFinal.reward.element;

// ── The drizzle: fractional, bounded, real ───────────────────
// BEFORE the claim: the five pools hold ONLY what the felled
// dripped (a fresh owner starts at zero). Six Fray fell across
// risings 1–3; each fell could drip at most +0.1. (With six
// fells the drizzle may honestly drip nothing — its TENTHS
// and its BOUND are what is proven here; its existence rides
// every fell in the risings drive's seams.)
const before = Object.fromEntries(FIVE.map(el => [el, pool(el)]));
const totalDrip = FIVE.reduce((s, el) => s + before[el], 0);
const totalFells = 6; // 1+2+3 — every Fray of the three risings felled
check("every pool's drip is a whole number of tenths", FIVE.every(el => Math.abs(before[el] * 10 - Math.round(before[el] * 10)) < 1e-6),
  FIVE.map(el => `${el}=${before[el]}`).join(" "));
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
