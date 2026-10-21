// THE HOMELAND READERS — drive (2026-10-21): the Twin
// Standard, the Beacon and the Star Engine can be RAISED on
// the homeland, and now the homeland READS them, as the Table
// reads them where its strikes are reckoned (table.ts,
// strikeOnce) and in its round's tending. Boots the real
// server on a scratch DATA_DIR and proves, against the
// server's own ledgers:
//   S. THE STANDARD AND THE BEACON at the first-seed hold's
//      referee (resolveFirstSeedWave — the homeland's own
//      company-strike reckoning): one defender of filed power
//      2 faces wave 1 (one Fray, 3 HP, power 1). Unaided, its
//      blow leaves the Fray standing at 1 HP, the Fray answers
//      once, and the defender ends the wave at 4 of 5 HP.
//      With a Standard whose edge divides the seed's hex —
//      or a Beacon whose light covers it — the blow is 3, the
//      Fray falls in the first round, no answer comes, and
//      the defender ends whole. Moved off the ground, each
//      goes silent again (the control returns).
//   E. THE STAR ENGINE on the homeland settle (getTerritory):
//      no Engine, no pay. A standing Engine's first sight
//      starts its song and pays nothing. Two beats at the
//      book's 2 per round pay exactly 4. A hundred beats of
//      backlog pay only the standing minute's 21 — the rest
//      is forgiven, the watermark left at the settle's hour,
//      not a minute into the debt. The purse is capped by the
//      standing cap law (here 10 + 5 Awoken at +8 = 50): a
//      gain that would overflow lands at the cap exactly, and
//      a purse already above the cap is never lowered by the
//      settle. While the Tender lies fallen, the Engine holds
//      its song, as at the Table.
// Run: node scripts/drive-homeland-readers.mjs
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const OUT = "/home/hatch/workspace/homeland-readers-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(OUT, "data-"));
process.env.PORT = "3971";
process.env.WORKSHOP_PASSWORD = "readers-workshop-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3971";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

await import("../server/dist/index.js");
await sleep(2500);

async function callRaw(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
async function call(action, args, token) {
  const { status, data } = await callRaw(action, args, token);
  if (status >= 300) throw new Error(`${action} -> ${status}: ${JSON.stringify(data)}`);
  return data;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
// Fresh-DB migration-order defect (named in earlier drives):
// stand the greeter column up so drizzle selects do not throw.
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }
const now = Date.now();

const insAsset = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'body', 'common', ?, ?, ?, ?, 'image/png', ?)");
const insAwokin = db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)");
/** One Awokin of exactly one piece — its filed power and
 *  toughness are the piece's own (no family stands behind it,
 *  no story rides it). Distinct pieces keep identities apart,
 *  so no empowerment creeps into the filed numbers. */
function seedAwokin(ownerKey, ownerName, label, power, toughness, element) {
  const assetId = Number(insAsset.run(`Reader Piece ${label}`, power, toughness, element, `test/reader-${label}.png`, now).lastInsertRowid);
  const composition = JSON.stringify([{ source_id: `db:${assetId}`, name: `Reader Piece ${label}`, category: "body", rarity: "common", power, toughness, element }]);
  return Number(insAwokin.run(`Reader ${label}`, `Reader ${label}`, `test/reader-${label}.png`, composition, ownerName, ownerKey, now).lastInsertRowid);
}
const setEnergy = (ownerKey, energy) =>
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = excluded.energy, updated_at = excluded.updated_at")
    .run(ownerKey, energy, now);
const energyOf = (ownerKey) => db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(ownerKey)?.energy;
const insWorking = db.prepare(`INSERT INTO territory_workings
  (owner_key, spell_key, engine, kind, hue, tile_id, edge_key, q, r, dir, nums, hp, stops, charges, pour, max_hp, created_at)
  VALUES (?, ?, ?, 'ward', 'unaligned', ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?)`);

async function claimTender(tenderName, password) {
  const claim = await call("claimTender", { password, tenderName });
  const row = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code)
    ?? db.prepare("SELECT id FROM tenders WHERE tender_name = ?").get(tenderName);
  return { token: claim.token, me: `tender:${row.id}` };
}

/* ── S. THE STANDARD AND THE BEACON AT THE SEED ─────────── */
console.log("S. the Standard and the Beacon at the first-seed hold");
{
  const { token, me } = await claimTender("Banner Tender", "readers-password-1");
  const sown = await call("ensureFirstSeed", {}, token);
  ok("the first seed is sown", sown.created === true, JSON.stringify(sown).slice(0, 120));
  const seedTileId = db.prepare("SELECT tile_id AS id FROM star_seeds WHERE owner_key = ?").get(me).id;
  // Five fresh defenders, each of filed power 2 and toughness
  // 5 — one per wave run, so no run inherits another's wounds
  // or honours.
  const defenders = ["sky", "tide", "stone", "root", "fire"].map((el, i) => seedAwokin(me, "Banner Tender", `S${i}`, 2, 5, el));
  setEnergy(me, 100);
  const deployed = await call("deployFirstSeed", { awakenedIds: [defenders[0]] }, token);
  ok("the first defender stands on the seed's hex", deployed.ok === true, JSON.stringify(deployed).slice(0, 120));
  const begun = await call("startFirstSeedHold", {}, token);
  ok("the hold begins", begun.ok === true, JSON.stringify(begun).slice(0, 120));

  const runWave = async (defenderId) => {
    db.prepare("DELETE FROM field_placements WHERE owner_key = ?").run(me);
    setEnergy(me, 100);
    await call("deployFirstSeed", { awakenedIds: [defenderId] }, token);
    db.prepare("UPDATE first_seed_events SET state = 'holding', waves_cleared = 0, next_wave_at = 1 WHERE owner_key = ?").run(me);
    const view = await call("getFirstSeedEvent", {}, token);
    const hp = db.prepare("SELECT hp FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(me, defenderId)?.hp;
    return { cleared: view.event?.wavesCleared, hp };
  };

  let r = await runWave(defenders[0]);
  ok("control: wave 1 clears", r.cleared === 1, `wavesCleared=${r.cleared}`);
  ok("control: the unaided blow (2) leaves the Fray standing — it answers once, the defender ends at 4 of 5", r.hp === 4, `hp=${r.hp}`);

  const stdId = Number(insWorking.run(me, "standard", "standard", seedTileId, "0,0,2", 0, 0, 2, JSON.stringify({ strikeBonus: 1 }), now).lastInsertRowid);
  r = await runWave(defenders[1]);
  ok("the Standard on the seed's edge: the blow is 3, the Fray falls in the first round, the defender ends whole", r.cleared === 1 && r.hp === 5, `cleared=${r.cleared} hp=${r.hp}`);
  db.prepare("UPDATE territory_workings SET q = 2, r = 0, edge_key = '2,0,2' WHERE id = ?").run(stdId);
  r = await runWave(defenders[2]);
  ok("the Standard moved off the ground: silence again — the defender ends at 4 of 5", r.cleared === 1 && r.hp === 4, `cleared=${r.cleared} hp=${r.hp}`);
  db.prepare("DELETE FROM territory_workings WHERE id = ?").run(stdId);

  // The Beacon at (1,0)-(2,0): the seed's hex stands one ring
  // from its nearer hex — inside its own light (its two hexes
  // and the ring about them).
  const bcnId = Number(insWorking.run(me, "beacon", "beacon", seedTileId, "1,0,2", 1, 0, 2, JSON.stringify({ darkBonus: 1 }), now).lastInsertRowid);
  r = await runWave(defenders[3]);
  ok("the Beacon lighting the seed's hex: the blow is 3 against the wave standing there, the defender ends whole", r.cleared === 1 && r.hp === 5, `cleared=${r.cleared} hp=${r.hp}`);
  db.prepare("UPDATE territory_workings SET q = 4, r = 0, edge_key = '4,0,2' WHERE id = ?").run(bcnId);
  r = await runWave(defenders[4]);
  ok("the Beacon moved beyond its ring: silence again — the defender ends at 4 of 5", r.cleared === 1 && r.hp === 4, `cleared=${r.cleared} hp=${r.hp}`);
}

/* ── E. THE STAR ENGINE ON THE HOMELAND SETTLE ──────────── */
console.log("E. the Star Engine sings at home");
{
  const { token, me } = await claimTender("Engine Tender", "readers-password-2");
  // A classed Tender standing on his own heart — the living
  // homeland's settle chain (where the Engine's song is
  // reckoned) runs only for a Tender with a stand.
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, hp, updated_at) VALUES (?, 3800, 0, 100, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800, hp = 100").run(me, now);
  await call("chooseClass", { classKey: "warden" }, token);
  const seedTileId = Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, 0, 0, 'root', 0, ?)").run(me, now).lastInsertRowid);
  db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, 1, 0, 'neutral', 0, ?), (?, 0, 1, 'stone', 0, ?)").run(me, now, me, now);
  // Five holders of filed power 12 raise the purse's cap by
  // the standing law: 10 + 5 × 8 = 50.
  for (let i = 0; i < 5; i++) seedAwokin(me, "Engine Tender", `E${i}`, 12, 3, ["sky", "tide", "stone", "root", "fire"][i]);

  setEnergy(me, 5);
  await call("getTerritory", {}, token);
  await call("getTerritory", {}, token);
  ok("control: no Engine standing — two reads pay nothing", energyOf(me) === 5, `energy=${energyOf(me)}`);

  const engId = Number(insWorking.run(me, "engine", "engine", seedTileId, "0,0,2", 0, 0, 2, JSON.stringify({ energyPerRound: 2 }), now).lastInsertRowid);
  const engNums = () => JSON.parse(db.prepare("SELECT nums FROM territory_workings WHERE id = ?").get(engId).nums);
  const setEngNums = (patch) => {
    const nums = { ...engNums(), ...patch };
    db.prepare("UPDATE territory_workings SET nums = ? WHERE id = ?").run(JSON.stringify(nums), engId);
  };

  setEnergy(me, 5);
  const beforeFirst = Date.now();
  await call("getTerritory", {}, token);
  const firstNums = engNums();
  ok("first sight: the song starts, nothing is paid for time before it stood", energyOf(me) === 5, `energy=${energyOf(me)}`);
  ok("first sight: the watermark stands at the settle's hour", typeof firstNums.sungAt === "number" && Math.abs(firstNums.sungAt - beforeFirst) < 10000, `sungAt=${firstNums.sungAt}`);

  setEnergy(me, 0);
  setEngNums({ sungAt: Date.now() - 5600 });
  await call("getTerritory", {}, token);
  ok("two beats at 2 per round pay exactly 4", energyOf(me) === 4, `energy=${energyOf(me)}`);

  setEnergy(me, 0);
  setEngNums({ energyPerRound: 1, sungAt: Date.now() - 280000 });
  const beforeCap = Date.now();
  await call("getTerritory", {}, token);
  ok("a hundred beats of backlog pay only the standing minute's 21", energyOf(me) === 21, `energy=${energyOf(me)}`);
  ok("the forgiven backlog leaves the watermark at the settle's hour, not a minute into the debt", engNums().sungAt >= beforeCap - 2500, `sungAt=${engNums().sungAt} beforeCap=${beforeCap}`);

  setEnergy(me, 48);
  setEngNums({ energyPerRound: 2, sungAt: Date.now() - 28000 });
  await call("getTerritory", {}, token);
  ok("a gain past the cap lands AT the cap (50), the excess ungranted", energyOf(me) === 50, `energy=${energyOf(me)}`);

  setEnergy(me, 999);
  setEngNums({ sungAt: Date.now() - 5600 });
  await call("getTerritory", {}, token);
  ok("a purse already above the cap is never lowered by the settle", energyOf(me) === 999, `energy=${energyOf(me)}`);

  setEnergy(me, 0);
  setEngNums({ sungAt: Date.now() - 28000 });
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, hp, updated_at, down_until) VALUES (?, 0, 0, 100, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET down_until = excluded.down_until")
    .run(me, now, Date.now() + 3600000);
  await call("getTerritory", {}, token);
  ok("while the Tender lies fallen, the Engine holds its song", energyOf(me) === 0, `energy=${energyOf(me)}`);
  db.prepare("UPDATE tender_progress SET down_until = NULL WHERE owner_key = ?").run(me);
}

console.log(`\ndrive-homeland-readers: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
