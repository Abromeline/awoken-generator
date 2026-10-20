// PHASE D — THE LIVING HOMELAND (Nigel, 2026-10-19): the cursed
// frontier deepens to three rings around the whole purified rim;
// the Blind Fray spawns on cursed ground in the Tender's view at
// 35% a beat, wanders blind on its dark, and turns hostile only
// at the purified border — his Awokin are chewed before he is,
// and no one is bitten away from the border; the Tender's own
// body answers the curse at the Awokin rate, mends on clean
// ground, falls exactly once, and wakes at the bastion
// half-healed. (test57)
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-phase-d-"));
process.env.PORT = "39957";
process.env.WORKSHOP_PASSWORD = "<MASKED_SECRET_001>";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
await import("../server/dist/index.js");
await new Promise(r => setTimeout(r, 2500));
const base = "http://127.0.0.1:39957";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) { pass++; console.log("  ok -", name); } else { fail++; console.log("  FAIL -", name, extra); } };
async function call(action, args, token, expectFail = false) {
  const res = await fetch(`${base}/api/${action}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) }, body: JSON.stringify(args) });
  const data = await res.json().catch(() => ({}));
  if (!expectFail && !res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return { status: res.status, data };
}
const db = new Database(join(process.env.DATA_DIR, "app.db"));
const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
function flower(radius) {
  const out = [];
  for (let q = -radius; q <= radius; q++)
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++)
      out.push({ q, r });
  return out;
}
async function claimTender(name, exp = 0) {
  const claim = await call("claimTender", { password: "phase-d-password", tenderName: name });
  const token = claim.data.token;
  const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.data.tender.code).id}`;
  if (exp) db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(me, exp, Date.now());
  return { token, me };
}
const seedTile = (me) => (q, r, cursed) => Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, ?, ?, ?, ?)").run(me, q, r, cursed, Date.now()).lastInsertRowid);
function seedAwokin(me, name, toughness) {
  const nowMs = Date.now();
  const pieceId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'body', 'common', 1, ?, 'root', 'test/p.png', 'image/png', ?)").run(name, toughness, nowMs).lastInsertRowid);
  const composition = JSON.stringify([{ source_id: `db:${pieceId}`, name, category: "body", rarity: "common", power: 1, toughness, element: "root" }]);
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, 'test/a.png', ?, 'tender', 'Phase D', ?, ?)").run(name, name, composition, me, nowMs).lastInsertRowid);
}
const seedPlacement = (me, awakenedId, tileId, hp) => Number(db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, hp) VALUES (?, ?, ?, ?, ?, ?)").run(me, awakenedId, tileId, Date.now(), Date.now(), hp).lastInsertRowid);
const seedWanderer = (me, tileId) => Number(db.prepare("INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at) VALUES (?, ?, 'fray', ?)").run(me, tileId, Date.now()).lastInsertRowid);
const terr = async (token) => (await call("getTerritory", {}, token)).data;

/* ── §1 THE CURSED FRONTIER: a radius-2 world grows its third
      ring around the purified rim, then stops. */
{
  const { token, me } = await claimTender("Frontier Tender");
  const tile = seedTile(me);
  for (const { q, r } of flower(2)) tile(q, r, q === 0 && r === 0 ? 0 : 1);
  let t = await terr(token);
  const at = (q, r) => t.tiles.find(x => x.q === q && x.r === r);
  ok("frontier: the third ring is minted (37 tiles stand)", t.tiles.length === 37, `tiles=${t.tiles.length}`);
  ok("frontier: the new ring is cursed dark", !!at(3, 0) && at(3, 0).cursed === 1 && !!at(-3, 3) && at(-3, 3).cursed === 1);
  t = await terr(token);
  ok("frontier: satisfied, it does not grow again", t.tiles.length === 37, `tiles=${t.tiles.length}`);
}

/* ── §2a THE BLIND FRAY — spawn rate against the 35% law.
      A rate is only measurable where the cap cannot bind, so
      the counting field is a remote cursed cluster: nine dark
      hexes around (10,0), nothing else in ring 6 of it — the
      pure heart and its frontier-minted rim stand seven hexes
      west, outside the view. 150 beats, the field cleared
      between beats so each beat is a fresh draw of nine. */
{
  const { token, me } = await claimTender("Counting Tender", 200);
  const tile = seedTile(me);
  tile(0, 0, 0); // the pure heart — the bastion-rule anchor
  const field = [{ q: 10, r: 0 }, { q: 11, r: 0 }, { q: 11, r: -1 }, { q: 10, r: -1 }, { q: 9, r: 0 }, { q: 9, r: 1 }, { q: 10, r: 1 }, { q: 12, r: 0 }, { q: 8, r: 0 }];
  const fieldIds = {};
  for (const { q, r } of field) fieldIds[`${q},${r}`] = tile(q, r, 1);
  await call("chooseClass", { classKey: "sage" }, token);
  let t = await terr(token);
  ok("spawn: no wanderers before the first beat", (t.wanderers ?? []).length === 0);
  await call("setTenderTile", { tileId: fieldIds["10,0"] }, token); // he stands in the dark field
  t = await terr(token);
  ok("spawn: the counting Tender stands on cursed ground in the field", !!t.tender && t.tender.tileId === fieldIds["10,0"]);
  let spawns = 0, capHeld = true;
  for (let beat = 0; beat < 150; beat++) {
    db.prepare("UPDATE tender_progress SET wanderer_anchor_at = wanderer_anchor_at - 45000, hp = 35, down_until = NULL WHERE owner_key = ?").run(me);
    t = await terr(token);
    const n = (t.wanderers ?? []).length;
    if (n > 12) capHeld = false;
    spawns += n;
    db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(me);
  }
  const expected = 150 * 9 * 0.35; // 472.5
  const sigma = Math.sqrt(150 * 9 * 0.35 * 0.65); // ≈17.5
  ok(`spawn: the rate is the law's 35% (${spawns} births over 150 beats × 9 hexes, expected ${expected} ±3σ=${(3 * sigma).toFixed(0)})`,
    Math.abs(spawns - expected) <= 3 * sigma, `spawns=${spawns}`);
  ok("spawn: the live cap (12) was never the binding constraint, and never broke", capHeld);
  // The storm: forty beats fall due at once over the heart's own
  // wide dark (the frontier rim stands minted by now) — the
  // catch-up is capped, the cap holds, the map fills exactly to it.
  await call("setTenderTile", { tileId: t.tiles.find(x => x.q === 0 && x.r === 0).id }, token);
  db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(me);
  db.prepare("UPDATE tender_progress SET wanderer_anchor_at = wanderer_anchor_at - 45000 * 40 WHERE owner_key = ?").run(me);
  t = await terr(token);
  ok("spawn: a 40-beat storm settles capped — exactly 12 walk", (t.wanderers ?? []).length === 12, `n=${(t.wanderers ?? []).length}`);
}

/* ── §2b THE BORDER LAW: a wanderer beside pure ground chews
      the Awokin standing there; it never wanders while hostile. */
{
  const { token, me } = await claimTender("Border Tender", 200);
  const tile = seedTile(me);
  const ids = {};
  for (const { q, r } of flower(3)) ids[`${q},${r}`] = tile(q, r, (q === 0 && r === 0) || (q === 1 && r === 0) ? 0 : 1);
  await call("chooseClass", { classKey: "sage" }, token);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 100, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = excluded.energy").run(me, Date.now());
  const guard = seedAwokin(me, "Border Guard", 60);
  await call("deployAwoken", { awakenedId: guard, tileId: ids["1,0"] }, token);
  seedWanderer(me, ids["2,0"]);
  let t = await terr(token); // watermarks are set on this read
  ok("border: the guard stands whole before the walking", t.placements.find(p => p.awakenedId === guard)?.hp === 60);
  db.prepare("UPDATE tender_progress SET wanderer_watermark = wanderer_watermark - 30000 WHERE owner_key = ?").run(me);
  t = await terr(token); // ten steps of the walk
  const gp = t.placements.find(p => p.awakenedId === guard);
  ok("border: ten hostile beats chew exactly ten bites (5% of 60)", !!gp && gp.hp === 30, `hp=${gp?.hp}`);
  const w = (t.wanderers ?? [])[0];
  ok("border: a hostile wanderer never wanders", !!w && w.tileId === ids["2,0"]);
  ok("border: the Tender behind his guard is untouched (shield law)", !!t.tender && t.tender.hp === t.tender.maxHp, `hp=${t.tender?.hp}/${t.tender?.maxHp}`);
  // The light takes its own: purify the wanderer's ground.
  db.prepare("UPDATE territory_tiles SET cursed = 0 WHERE id = ?").run(ids["2,0"]);
  t = await terr(token);
  ok("border: purified ground unmakes its wanderer", (t.wanderers ?? []).length === 0);
}

/* ── §2c THE BLIND LAW: away from the border, no one is bitten —
      a company standing deep in the curse is beneath notice,
      and the wanderer only walks. */
{
  const { token, me } = await claimTender("Blind Tender", 200);
  const tile = seedTile(me);
  const ids = {};
  for (const { q, r } of flower(3)) ids[`${q},${r}`] = tile(q, r, (q === 0 && r === 0) || (q === 1 && r === 0) ? 0 : 1);
  await call("chooseClass", { classKey: "sage" }, token);
  const deep = seedAwokin(me, "Deep Sleeper", 50);
  seedPlacement(me, deep, ids["-2,1"], 50); // stands on cursed ground, as a finished march leaves it
  const wid = seedWanderer(me, ids["-3,0"]);
  let t = await terr(token); // watermarks set
  db.prepare("UPDATE tender_progress SET wanderer_watermark = wanderer_watermark - 2800 WHERE owner_key = ?").run(me);
  t = await terr(token); // exactly one step of the walk
  const w1 = (t.wanderers ?? []).find(w => w.id === wid);
  ok("blind: one step moves the sightless walker off its hex", !!w1 && w1.tileId !== ids["-3,0"]);
  db.prepare("UPDATE tender_progress SET wanderer_watermark = wanderer_watermark - 30000 WHERE owner_key = ?").run(me);
  t = await terr(token); // ten more steps of wandering
  const dp = t.placements.find(p => p.awakenedId === deep);
  // The deep placement still withers a little by the curse's own
  // attrition over the section's real seconds (≤ ~1 HP of dust);
  // one unlawful BITE would take a full 3. The band between is
  // the proof: untouched by teeth, whatever the weather.
  ok("blind: the deep company is never bitten (its hex borders no pure ground)", !!dp && (dp.hp == null || dp.hp >= 47.5), `hp=${dp?.hp}`);
  const w2 = (t.wanderers ?? []).find(w => w.id === wid);
  const wt = w2 && t.tiles.find(x => x.id === w2.tileId);
  ok("blind: the walker still stands, and only ever on cursed ground", !!wt && wt.cursed === 1);
}

/* ── §3 TENDER ATTRITION: the curse drains him at the Awokin
      rate; clean ground mends; the fall fires once; the wake
      is at the bastion, half-healed; pure ground never fells. */
{
  const { token, me } = await claimTender("Attrition Tender", 200); // Lv 3 → maxHp 35
  const tile = seedTile(me);
  const ids = {};
  for (const { q, r } of flower(2)) ids[`${q},${r}`] = tile(q, r, (q === 0 && r === 0) || (q === 1 && r === 0) ? 0 : 1);
  await call("chooseClass", { classKey: "sage" }, token);
  const control = seedAwokin(me, "Rate Control", 40);
  seedPlacement(me, control, ids["2,-1"], 40); // cursed, ring 2 — as a finished march leaves it
  let t = await terr(token);
  ok("attrition: his body is served whole (35 at Lv 3)", !!t.tender && t.tender.hp === 35 && t.tender.maxHp === 35 && t.tender.down === false, `hp=${t.tender?.hp}`);
  await call("setTenderTile", { tileId: ids["2,0"] }, token); // cursed, ring 2
  t = await terr(token); // the watermark is set; nothing drained yet
  ok("attrition: the first cursed read only sets the watermark", !!t.tender && t.tender.hp === 35, `hp=${t.tender?.hp}`);
  db.prepare("UPDATE tender_progress SET curse_watermark = curse_watermark - 60000 WHERE owner_key = ?").run(me);
  db.prepare("UPDATE field_placements SET curse_since = curse_since - 60000 WHERE awakened_id = ?").run(control);
  t = await terr(token); // one capped minute of the curse, for both bodies
  const beats = 60000 / 2800;
  const wantT = 35 - 35 * 0.03 * beats; // ≈12.5
  const wantA = 40 - 40 * 0.03 * beats; // ≈14.29
  const ap = t.placements.find(p => p.awakenedId === control);
  ok(`attrition: the Tender drains at the ring's rate (${t.tender?.hp?.toFixed(2)} ≈ ${wantT.toFixed(2)})`,
    !!t.tender && Math.abs(t.tender.hp - wantT) <= 0.75, `hp=${t.tender?.hp}`);
  ok(`attrition: the Awokin control drains beside him (${ap?.hp?.toFixed(2)} ≈ ${wantA.toFixed(2)})`,
    !!ap && Math.abs(ap.hp - wantA) <= 0.75, `hp=${ap?.hp}`);
  ok("attrition: the two rates agree (same law, two bodies)",
    !!t.tender && !!ap && Math.abs((35 - t.tender.hp) / 35 - (40 - ap.hp) / 40) <= 0.03);
  // Clean ground mends him at the heart's share.
  await call("setTenderTile", { tileId: ids["0,0"] }, token);
  t = await terr(token);
  db.prepare("UPDATE tender_progress SET curse_watermark = curse_watermark - 60000 WHERE owner_key = ?").run(me);
  t = await terr(token);
  const wantMend = wantT + 35 * 0.01 * beats; // ≈20.0
  ok(`mending: clean ground restores him (${t.tender?.hp?.toFixed(2)} ≈ ${wantMend.toFixed(2)})`,
    !!t.tender && Math.abs(t.tender.hp - wantMend) <= 0.75, `hp=${t.tender?.hp}`);
  // THE FALL.
  db.prepare("UPDATE tender_progress SET hp = 1 WHERE owner_key = ?").run(me);
  await call("setTenderTile", { tileId: ids["2,0"] }, token);
  t = await terr(token);
  db.prepare("UPDATE tender_progress SET curse_watermark = curse_watermark - 60000 WHERE owner_key = ?").run(me);
  t = await terr(token);
  ok("the fall: at 0 he is down, held at nothing", !!t.tender && t.tender.down === true && t.tender.hp === 0, `hp=${t.tender?.hp} down=${t.tender?.down}`);
  ok("the fall: the ledger counts it once", !!t.tender && t.tender.fellCount === 1, `fell=${t.tender?.fellCount}`);
  ok("the fall: the blackout is the pencilled ~15s", !!t.tender && t.tender.downUntil > Date.now() && t.tender.downUntil <= Date.now() + 16000, `until=${t.tender?.downUntil}`);
  const mv = await call("setTenderTile", { tileId: ids["0,0"] }, token, true);
  ok("the fall: a fallen Tender does not walk", mv.status >= 400);
  t = await terr(token);
  ok("the fall: it does not fire twice while he lies there", !!t.tender && t.tender.fellCount === 1 && t.tender.down === true);
  // THE WAKE.
  db.prepare("UPDATE tender_progress SET down_until = 1 WHERE owner_key = ?").run(me);
  t = await terr(token);
  ok("the wake: he stands again, half-healed", !!t.tender && t.tender.down === false && Math.abs(t.tender.hp - 17.5) <= 0.6, `hp=${t.tender?.hp}`);
  ok("the wake: at the bastion anchor (his pure heart), never mid-curse", !!t.tender && t.tender.tileId === ids["0,0"], `tile=${t.tender?.tileId}`);
  // Pure ground never fells him, even wounded. (The wake nulled
  // the watermark — one read sets it again before it is aged.)
  db.prepare("UPDATE tender_progress SET hp = 5 WHERE owner_key = ?").run(me);
  t = await terr(token);
  db.prepare("UPDATE tender_progress SET curse_watermark = curse_watermark - 60000 WHERE owner_key = ?").run(me);
  t = await terr(token);
  ok("pure ground: the wounded mend instead of falling", !!t.tender && t.tender.down === false && t.tender.fellCount === 1 && Math.abs(t.tender.hp - 12.5) <= 0.75, `hp=${t.tender?.hp}`);
}

console.log(`\ntest57: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
