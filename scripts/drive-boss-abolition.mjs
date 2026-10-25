// THE ABOLITION OF THE OLD BOSS BATTLE MODE — DRIVE
// (Nigel, 2026-10-24 23:33–23:34, from his live play: "i cleared
// a tile and got the old boss fight trigger... this should be
// gone" → "that battle mode should no longer exist and its
// triggers should go too.") The staged Battleground boss MODE
// ceases to exist, triggers and all; the homeland's living
// engine is the only battle. This drive proves the negative
// against the real server on a scratch world, and proves the
// neighbours still stand:
//   §A THE FACE — Territory.tsx holds no boss door: no BOSS
//      FIGHT button, no "Boss awaits", no calls to the boss
//      endpoints; Battleground.tsx holds no VictoryAspects and
//      no claimAspectGrant; api.ts wraps none of the four.
//   §B THE DOORS ARE GONE — getBossState, getBossWave,
//      resolveBossBattle, getPendingAspectGrant and
//      claimAspectGrant have no routes at all (404).
//   §C THE WINDOW THAT NEVER OPENS — a company wins Unraveling
//      after Unraveling through the real wave road
//      (getWave → resolveBattle): at the third victory — the
//      exact count that used to arm the boss window — and past
//      it, getWave serves the next wave with no boss keys, and
//      the boss oracle (§B) stays gone.
//   §D THE BIRTH ROAD — the wave victories recorded NO newborn
//      claim and NO aspect grant: pending_newborn_claims stands
//      empty, birthNewbornToHand refuses ("No newborn is
//      waiting"), and a fresh database never creates boss_state
//      or pending_aspect_grants at all — while the claims
//      ledger itself (pending_newborn_claims) stands ready for
//      the Forge.
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-boss-abolition-"));
process.env.DATA_DIR = DATA_DIR;
process.env.PORT = "39971";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── §A the face ──────────────────────────────────────────────
console.log("§A THE FACE — no boss door on the homeland, no boss panel in the Battleground");
const territorySrc = readFileSync(join(root, "client/src/Territory.tsx"), "utf8");
const battlegroundSrc = readFileSync(join(root, "client/src/Battleground.tsx"), "utf8");
const apiSrc = readFileSync(join(root, "client/src/api.ts"), "utf8");
check("Territory holds no BOSS FIGHT button", !territorySrc.includes("BOSS FIGHT"));
check("Territory holds no 'Boss awaits' banner", !territorySrc.includes("Boss awaits"));
check("Territory never calls the boss endpoints",
  !/api\.(getBossState|resolveBossBattle|getPendingAspectGrant)|api\.call\("getBossWave"/.test(territorySrc));
check("Territory keeps no boss-cycle tracking (no cycleFromDefeated, no wavesCleared state)",
  !territorySrc.includes("cycleFromDefeated") && !territorySrc.includes("[wavesCleared, setWavesCleared]"));
check("Battleground holds no VictoryAspects panel", !battlegroundSrc.includes("VictoryAspects"));
check("Battleground never claims an aspect grant", !battlegroundSrc.includes("claimAspectGrant"));
check("api.ts wraps none of the boss actions",
  !/getBossState|resolveBossBattle|getPendingAspectGrant|claimAspectGrant/.test(apiSrc));
check("the wave door itself still stands (handleDefend + the target map are the wave loop's, untouched)",
  territorySrc.includes("const handleDefend") && territorySrc.includes("showTargetMap"));

await import("../server/dist/index.js");
await sleep(2500);

const db = new Database(join(DATA_DIR, "app.db"));
const now = Date.now();

async function api(action, args, token) {
  const res = await fetch(`http://127.0.0.1:39971/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
const errText = (r) => String(r.data?.error ?? r.data?.message ?? "");

// ── §B the doors are gone ────────────────────────────────────
console.log("§B THE DOORS ARE GONE — the boss endpoints have no routes");
for (const action of ["getBossState", "getBossWave", "resolveBossBattle", "getPendingAspectGrant", "claimAspectGrant"]) {
  const r = await api(action, {}, undefined);
  check(`POST /api/${action} is refused (404 — no route stands)`, r.status === 404, `status=${r.status}`);
}

// ── A tender and a stout company (test46's seeding shape) ────
const claim = await api("claimTender", { password: "test-password-1", tenderName: "Abolition Tester" });
check("tender claimed", claim.status === 200 && !!claim.data.token, JSON.stringify(claim.data).slice(0, 120));
const token = claim.data.token;
const tenderId = db.prepare("SELECT id FROM tenders WHERE tender_name = 'Abolition Tester'").get().id;
const ownerKey = `tender:${tenderId}`;

const insAsset = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
const parts = [
  ["Test Mail", "body"], ["Test Arm", "arm"], ["Test Helm", "head"],
].map(([n, c]) => ({ id: Number(insAsset.run(n, c, 3, 9, "sky", `test/${n}.png`, now).lastInsertRowid), name: n, category: c }));
const composition = JSON.stringify(parts.map(p => ({
  source_id: `db:${p.id}`, name: p.name, category: p.category, rarity: "common", power: 3, toughness: 9, element: "sky",
})));
const insAwokin = db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', 'Abolition Tester', ?, ?)");
const defenderIds = ["First Guard", "Second Guard", "Third Guard", "Fourth Guard"]
  .map(n => Number(insAwokin.run(n, n, `test/${n}.png`, composition, ownerKey, now).lastInsertRowid));

let r = await api("chooseClass", { classKey: "warden" }, token);
check("the class binds", r.status === 200 && r.data.classKey === "warden", errText(r));
r = await api("chooseWeapon", { weaponKey: "sword" }, token);
check("the runic weapon binds", r.status === 200 && r.data.weaponKey === "sword", errText(r));
r = await api("ensureFirstSeed", {}, token);
check("the first seed is sown (the world stands)", r.status === 200 && r.data.created === true, JSON.stringify(r.data).slice(0, 120));
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 100, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = excluded.energy")
  .run(ownerKey, now);
r = await api("deployFirstSeed", { awakenedIds: defenderIds }, token);
check("the company stands on the field", r.status === 200 && r.data.ok === true, errText(r) || JSON.stringify(r.data).slice(0, 120));
db.prepare("UPDATE field_placements SET stance = 'attack' WHERE owner_key = ?").run(ownerKey);
await api("getTerritory", {}, token);

// ── §C the window that never opens ───────────────────────────
console.log("§C THE WINDOW THAT NEVER OPENS — victories past the third arm nothing");
const windBackRecovery = () =>
  db.prepare("UPDATE wave_state SET last_victory_at = ? WHERE owner_key = ?")
    .run(new Date(Date.now() - 3 * 3600 * 1000).toISOString(), ownerKey);
for (let wave = 1; wave <= 4; wave++) {
  const w = await api("getWave", {}, token);
  check(`wave ${wave} is served by the ladder`, w.status === 200 && w.data.waveNumber === wave,
    `status=${w.status} waveNumber=${w.data?.waveNumber}`);
  check(`wave ${wave}'s serving carries no boss keys`,
    !("eligible" in w.data) && !("nextBossLevel" in w.data) && !("bossesDefeated" in w.data) && !("isBoss" in w.data),
    JSON.stringify(Object.keys(w.data ?? {})));
  const res = await api("resolveBattle", { victory: true, waveNumber: wave, survivorIds: defenderIds }, token);
  check(`wave ${wave} victory resolves on the wave road`, res.status === 200 && res.data.ok === true,
    `status=${res.status} ${errText(res)}`);
  windBackRecovery();
  if (wave === 3) {
    const after = await api("getWave", {}, token);
    check("at the third victory the ladder stands at wave 4, wavesDefeated 3 — and nothing armed",
      after.status === 200 && after.data.waveNumber === 4 && after.data.wavesDefeated === 3,
      `waveNumber=${after.data?.waveNumber} wavesDefeated=${after.data?.wavesDefeated}`);
    const oracle = await api("getBossState", {}, token);
    check("at the very count that used to open the boss window, the boss oracle is still gone (404)",
      oracle.status === 404, `status=${oracle.status}`);
  }
}
const finalWave = await api("getWave", {}, token);
check("past the third victory the ladder still turns (wave 5 served, wavesDefeated 4)",
  finalWave.status === 200 && finalWave.data.waveNumber === 5 && finalWave.data.wavesDefeated === 4,
  `waveNumber=${finalWave.data?.waveNumber} wavesDefeated=${finalWave.data?.wavesDefeated}`);

// ── §D the birth road ────────────────────────────────────────
console.log("§D THE BIRTH ROAD — no claim was recorded; the ledger stands for the Forge");
const claims = db.prepare("SELECT COUNT(*) AS n FROM pending_newborn_claims WHERE owner_key = ?").get(ownerKey).n;
check("four wave victories recorded NO newborn claim", claims === 0, `claims=${claims}`);
const birth = await api("birthNewbornToHand", { liberatorNames: [] }, token);
check("birthNewbornToHand refuses — no newborn is waiting",
  birth.status === 400 && /No newborn is waiting/.test(errText(birth)), `status=${birth.status} ${errText(birth)}`);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(t => t.name);
check("a fresh database never creates boss_state", !tables.includes("boss_state"));
check("a fresh database never creates pending_aspect_grants", !tables.includes("pending_aspect_grants"));
check("the claims ledger (pending_newborn_claims) still stands", tables.includes("pending_newborn_claims"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
