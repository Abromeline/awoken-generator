// test46 — THE THIRD RISING'S REWARD (Nigel, 2026-10-19): the
// first-seed hold's level-3 NEWBORN is struck — births from an
// event drop the value of minted cards, and creation belongs
// to the Forge. In its place, once ever, the event lays up ONE
// pending reward: a single attunement point of a random
// element, gathered by hand into that element's pool. And the
// DRIZZLE rides along: every Fray felled has a 20% chance to
// drip +0.1 attunement into a random element's pool (expected
// one point per fifty Fray — "barely moving the bar, but at
// least it's raising"). Proven here against the real API on a
// scratch server: a fresh Tender's hold is driven up the whole
// ladder (waves settled by moving next_wave_at into the past,
// the lazy referee doing the rest), and every number is read
// from the server's own ledgers.
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
// starts empty by design). Three 3/3 pieces apiece — power 9
// before the family bonus, and four of a kind empower each
// other: the company strikes ≥48 a round, more than any wave's
// whole Fray line (wave 12 = 36 HP), so every wave clears in
// the first round and no defender ever falls. ─────────────────
const insAsset = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
const parts = [
  ["Test Mail", "body"], ["Test Arm", "arm"], ["Test Helm", "head"],
].map(([n, c]) => ({ id: Number(insAsset.run(n, c, 3, 3, "sky", `test/${n}.png`, now).lastInsertRowid), name: n, category: c }));
const composition = JSON.stringify(parts.map(p => ({
  source_id: `db:${p.id}`, name: p.name, category: p.category, rarity: "common", power: 3, toughness: 3, element: "sky",
})));
const insAwokin = db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', 'Reward Tester', ?, ?)");
const defenderIds = ["First Guard", "Second Guard", "Third Guard", "Fourth Guard"]
  .map(n => Number(insAwokin.run(n, n, `test/${n}.png`, composition, ownerKey, now).lastInsertRowid));

// ── The world is sown; the company deploys; the hold begins ──
let r = await api("ensureFirstSeed", {}, token);
check("the first seed is sown", r.status === 200 && r.data.created === true, JSON.stringify(r.data).slice(0, 120));
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 100, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = excluded.energy")
  .run(ownerKey, now);
r = await api("deployFirstSeed", { awakenedIds: defenderIds }, token);
check("the company stands on the seed's hex", r.status === 200 && r.data.ok === true, errText(r) || JSON.stringify(r.data).slice(0, 120));
r = await api("startFirstSeedHold", {}, token);
check("the hold begins", r.status === 200 && r.data.ok === true, errText(r) || JSON.stringify(r.data).slice(0, 120));

// ── Drive the ladder: twelve waves, each settled by a read ──
const FIVE = ["root", "tide", "sky", "stone", "fire"];
const pool = (el) => db.prepare("SELECT points FROM aspect_attunement WHERE owner_key = ? AND element = ?").get(ownerKey, el)?.points ?? 0;
let rewardAtNine = null;
for (let wave = 1; wave <= 12; wave++) {
  db.prepare("UPDATE first_seed_events SET next_wave_at = 1 WHERE owner_key = ?").run(ownerKey);
  r = await api("getFirstSeedEvent", {}, token);
  const ev = r.data.event;
  check(`wave ${wave} cleared`, r.status === 200 && !!ev && ev.wavesCleared === wave, `wavesCleared=${ev?.wavesCleared} state=${ev?.state}`);
  if (wave === 9) rewardAtNine = ev.reward;
}
const evFinal = r.data.event;
check("the ladder is done at twelve waves", evFinal.state === "done" && evFinal.seedLevel === 4, `state=${evFinal.state} level=${evFinal.seedLevel}`);

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
// waves 1–12; each fell could drip at most +0.1.
const before = Object.fromEntries(FIVE.map(el => [el, pool(el)]));
const totalDrip = FIVE.reduce((s, el) => s + before[el], 0);
const totalFells = 78; // 1+2+…+12 — every Fray of every wave felled
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
