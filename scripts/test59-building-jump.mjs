// STATION 5 — THE JUMP COMES HOME + THE BUILDING SYSTEM
// (Nigel, 2026-10-19). The Proving Ground's per-class jump
// physics, measured on the real Territory surface through the
// game's own hooks (window.__tenderJump); the traversal law
// judged at the server's door (setTenderTile): a wall refuses
// the walk and yields to the leap, a ward refuses even the
// sky, a two-tray rise wants the leap, a floating isle wants
// the leap at its height. The building system end to end: a
// hex is founded on the void, walks coalesce → weave → the
// tide/sky branch → fire's finish on pours of 10 truly
// debited, the terrain bank pays +1 a stage (double for the
// lowering), the vessel lifts the energy cap by the bank, a
// sky raise births a neutral hex beneath the isle, lowering
// pays tide back, the presence road builds strictly slower
// than one pour, and baked land is sealed — it cannot turn
// under a foreign press, and its own company grows it twice
// as fast (the battery radiates).
// Run AFTER `npm run build` (the headless part reads the
// built client the server serves). Puppeteer's Chrome lives
// in ~/workspace/tools-chrome, as the Ground's smokes use it.
process.env.PUPPETEER_CACHE_DIR = "/home/hatch/workspace/tools-chrome/.cache";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import Database from "better-sqlite3";
const puppeteer = createRequire("/home/hatch/workspace/tools-chrome/package.json")("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-building-"));
process.env.PORT = "39959";
process.env.WORKSHOP_PASSWORD = "test59-workshop-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
await import("../server/dist/index.js");
await new Promise(r => setTimeout(r, 2500));
const base = "http://127.0.0.1:39959";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) { pass++; console.log("  ok -", name); } else { fail++; console.log("  FAIL -", name, extra); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
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
async function claimTender(name, exp = 200) {
  const claim = await call("claimTender", { password: "building-password", tenderName: name });
  const token = claim.data.token;
  const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.data.tender.code).id}`;
  if (exp) db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(me, exp, Date.now());
  return { token, me };
}
/** A buffer-satisfied world: pure heart to pureRadius, cursed
 *  rings out to radius 5 — the frontier buffer asks no more.
 *  Pure tiles stand at height 1, as every purified hex does —
 *  one tray stands under them. */
function seedWorld(me, pureRadius = 2) {
  const ins = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, height, created_at) VALUES (?, ?, ?, 'neutral', ?, ?, ?)");
  for (const { q, r } of flower(5)) {
    const pure = hexDist({ q, r }, { q: 0, r: 0 }) <= pureRadius ? 0 : 1;
    ins.run(me, q, r, pure, pure ? 0 : 1, Date.now());
  }
}
const tileAt = (me) => (q, r, z = 0) => db.prepare("SELECT * FROM territory_tiles WHERE owner_key = ? AND q = ? AND r = ? AND z = ?").get(me, q, r, z);
const seedPool = (me, element, points) =>
  db.prepare("INSERT INTO aspect_attunement (owner_key, element, points, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(owner_key, element) DO UPDATE SET points = excluded.points").run(me, element, points, Date.now());
const poolOf = (me, element) => db.prepare("SELECT points FROM aspect_attunement WHERE owner_key = ? AND element = ?").get(me, element)?.points ?? 0;
function seedAwokin(me, name, element, power) {
  const nowMs = Date.now();
  const pieceId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'body', 'common', ?, 3, ?, 'test/p.png', 'image/png', ?)").run(name, power, element, nowMs).lastInsertRowid);
  const composition = JSON.stringify([{ source_id: `db:${pieceId}`, name, category: "body", rarity: "common", power, toughness: 3, element }]);
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, 'test/a.png', ?, 'tender', 'Building', ?, ?)").run(name, name, composition, me, nowMs).lastInsertRowid);
}
const seedPlacement = (me, awakenedId, tileId) =>
  db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, hp) VALUES (?, ?, ?, ?, ?, ?)").run(me, awakenedId, tileId, Date.now(), Date.now(), 100);
/** A company whose press is its headcount: the flux counts
 *  PARTS, one point a piece — three one-part Awokin of an
 *  element press at exactly 3. */
const seedCompany = (me, name, element, tileId, n = 3) => {
  for (let i = 0; i < n; i++) seedPlacement(me, seedAwokin(me, `${name} ${i + 1}`, element, 1), tileId);
};
const backdateAnchor = (tileId, hours) =>
  db.prepare("UPDATE territory_tiles SET attune_anchor_at = ? WHERE id = ?").run(Date.now() - hours * 3600 * 1000, tileId);
const terr = async (token) => (await call("getTerritory", {}, token)).data;
const standOn = async (token, tileId, airborne) =>
  call("setTenderTile", { tileId, ...(airborne ? { airborne: true } : {}) }, token, true);

/* ── §A THE FIRST WORK: founded on the void, walked stage by
      stage on pours of 10 truly debited; the bank pays a
      point a stage; the sky branch raises an isle and births
      the hex beneath it; fire bakes it sealed. */
const A = await claimTender("Builder Tender");
seedWorld(A.me);
await call("chooseClass", { classKey: "sage" }, A.token);
for (const el of ["stone", "root", "tide", "sky"]) seedPool(A.me, el, 200);
seedPool(A.me, "fire", 300);
const energy0 = (await call("getEnergy", {}, A.token)).data.maxEnergy;
{
  const bad = await call("beginBuild", { q: 0, r: 0 }, A.token, true);
  ok("founding: an occupied hex is refused", bad.status >= 400, `status=${bad.status}`);
  const far = await call("beginBuild", { q: 12, r: 0 }, A.token, true);
  ok("founding: the void beyond the land's edge is refused", far.status >= 400, `status=${far.status}`);
  const begun = await call("beginBuild", { q: 6, r: 0 }, A.token);
  var workA = begun.data.tileId;
  const w = tileAt(A.me)(6, 0);
  ok("founding: the work stands at stage 1, stone, unrisen", !!w && w.build_stage === 1 && w.element === "stone" && w.z === 0, JSON.stringify(w && { s: w.build_stage, e: w.element, z: w.z }));
  // Pool law: the pour drinks the STAGE's element, no other.
  seedPool(A.me, "stone", 0);
  const dry = await call("pourBuild", { tileId: workA }, A.token, true);
  ok("pours: an empty stone pool refuses, though root stands full", dry.status >= 400, `status=${dry.status}`);
  seedPool(A.me, "stone", 200);
  const p1 = await call("pourBuild", { tileId: workA }, A.token);
  ok("pours: one pour is exactly 10 points in", p1.data.buildPoints === 10 && Math.abs(poolOf(A.me, "stone") - 190) < 1e-9, `points=${p1.data.buildPoints} pool=${poolOf(A.me, "stone")}`);
  // Stage 1 does not bear a walker.
  const heart = tileAt(A.me)(0, 0);
  await standOn(A.token, heart.id);
  const early = await standOn(A.token, workA);
  ok("coalesce: the Tender cannot stand on stone still gathering", early.status >= 400, `status=${early.status}`);
  await call("pourBuild", { tileId: workA }, A.token);
  const s2 = await call("pourBuild", { tileId: workA }, A.token);
  ok("coalesce seals at 30: stage 2, and the bank pays its first point", s2.data.buildStage === 2 && s2.data.terrainBank === 1, `stage=${s2.data.buildStage} bank=${s2.data.terrainBank}`);
  const rim = tileAt(A.me)(5, 0);
  await standOn(A.token, rim.id);
  const stood = await call("setTenderTile", { tileId: workA }, A.token);
  ok("weave: from stage 2 the ground bears his weight", stood.data.ok === true);
  await call("pourBuild", { tileId: workA }, A.token);
  await call("pourBuild", { tileId: workA }, A.token);
  const s3 = await call("pourBuild", { tileId: workA }, A.token);
  ok("weave seals: stage 3, the hex reads root, bank 2", s3.data.buildStage === 3 && tileAt(A.me)(6, 0).element === "root" && s3.data.terrainBank === 2, `stage=${s3.data.buildStage} bank=${s3.data.terrainBank}`);
  const noBranch = await call("pourBuild", { tileId: workA }, A.token, true);
  ok("the branch: a pour with no branch chosen is refused", noBranch.status >= 400, `status=${noBranch.status}`);
  const crown = await call("pourBuild", { tileId: workA, branch: "sky" }, A.token);
  ok("the branch: the first sky pour crowns it", crown.data.buildBranch === "sky" && crown.data.buildStage === 3, `branch=${crown.data.buildBranch}`);
  await call("pourBuild", { tileId: workA }, A.token);
  const s4 = await call("pourBuild", { tileId: workA }, A.token);
  const isle = tileAt(A.me)(6, 0, 1);
  const newborn = tileAt(A.me)(6, 0, 0);
  ok("sky seals: the tile has RISEN (z=1) into stage 4", s4.data.buildStage === 4 && !!isle && isle.id === workA, `stage=${s4.data.buildStage}`);
  ok("the born-underneath law: a new neutral hex lies beneath, pure and unbuilt",
    !!newborn && newborn.id !== workA && newborn.element === "neutral" && newborn.cursed === 0 && newborn.build_stage === 0,
    JSON.stringify(newborn && { e: newborn.element, c: newborn.cursed, s: newborn.build_stage }));
  ok("the bank pays the third point at the rising", s4.data.terrainBank === 3, `bank=${s4.data.terrainBank}`);
  const noFinish = await call("pourBuild", { tileId: workA }, A.token, true);
  ok("fire: a pour with no finish chosen is refused", noFinish.status >= 400, `status=${noFinish.status}`);
  const low = await call("pourBuild", { tileId: workA, finish: "lower" }, A.token, true);
  ok("fire: the sky cannot be lowered — fire does not unmake the sky", low.status >= 400, `status=${low.status}`);
  await call("pourBuild", { tileId: workA, finish: "bake" }, A.token);
  await call("pourBuild", { tileId: workA }, A.token);
  const s5 = await call("pourBuild", { tileId: workA }, A.token);
  const bakedTile = tileAt(A.me)(6, 0, 1);
  ok("bake seals the work: stage 5, baked, holding a charge of 120",
    s5.data.buildStage === 5 && bakedTile.baked === 1 && Math.abs(bakedTile.build_charge - 120) < 1e-9,
    `stage=${s5.data.buildStage} baked=${bakedTile.baked} charge=${bakedTile.build_charge}`);
  ok("the bank holds 4 for a baked work (one a stage)", s5.data.terrainBank === 4, `bank=${s5.data.terrainBank}`);
  const energy1 = (await call("getEnergy", {}, A.token)).data.maxEnergy;
  ok("the vessel: the energy cap rose by exactly the bank", energy1 === energy0 + 4, `max ${energy0} -> ${energy1}`);
  var isleId = workA;
}

/* ── §B THE TIDE ROAD: a lake, then fire LOWERS it — the
      yield is paid in tide, and the bank counts it double. */
{
  const begun = await call("beginBuild", { q: 6, r: -1 }, A.token);
  const workB = begun.data.tileId;
  for (let i = 0; i < 3; i++) await call("pourBuild", { tileId: workB }, A.token); // stone
  for (let i = 0; i < 3; i++) await call("pourBuild", { tileId: workB }, A.token); // root
  const tideBefore = poolOf(A.me, "tide");
  await call("pourBuild", { tileId: workB, branch: "tide" }, A.token);
  await call("pourBuild", { tileId: workB }, A.token);
  const s4 = await call("pourBuild", { tileId: workB }, A.token);
  ok("tide seals: the hex reads tide, and no tile rose", s4.data.buildStage === 4 && tileAt(A.me)(6, -1).element === "tide" && !tileAt(A.me)(6, -1, 1), `stage=${s4.data.buildStage}`);
  await call("pourBuild", { tileId: workB, finish: "lower" }, A.token);
  await call("pourBuild", { tileId: workB }, A.token);
  const s5 = await call("pourBuild", { tileId: workB }, A.token);
  const lowered = tileAt(A.me)(6, -1);
  const tideAfter = poolOf(A.me, "tide");
  ok("lowering: fire sinks the work and it stands lowered", s5.data.buildStage === 5 && lowered.lowered === 1 && lowered.baked === 0, `lowered=${lowered.lowered}`);
  ok("lowering pays its yield: the tide pool gained 10 beyond the branch's own pours",
    Math.abs(tideAfter - (tideBefore - 30 + 10)) < 1e-9, `tide ${tideBefore} -> ${tideAfter}`);
  ok("the bank counts the lowering double: 4 + (1+1+1+2) = 9", s5.data.terrainBank === 9, `bank=${s5.data.terrainBank}`);
  const energy2 = (await call("getEnergy", {}, A.token)).data.maxEnergy;
  ok("the vessel keeps the count: cap = first reading + 9", energy2 === energy0 + 9, `max=${energy2} base=${energy0}`);
}

/* ── §C THE TRAVERSAL LAW at the server's door. */
{
  const heart = tileAt(A.me)(0, 0), east = tileAt(A.me)(1, 0), south = tileAt(A.me)(0, 1);
  const rim = tileAt(A.me)(5, 0);
  // The floating isle: no road climbs to it but the leap.
  await standOn(A.token, rim.id);
  const walk = await standOn(A.token, isleId);
  ok("traversal: the isle refuses a walking stand", walk.status >= 400, `status=${walk.status}`);
  const leap = await call("setTenderTile", { tileId: isleId, airborne: true }, A.token);
  ok("traversal: the leap lands him on the isle", leap.data.ok === true);
  const far = await call("setTenderTile", { tileId: heart.id, airborne: true }, A.token, true);
  ok("traversal: even airborne, a leap crosses ONE hex — the far heart refuses", far.status >= 400, `status=${far.status}`);
  const off = await call("setTenderTile", { tileId: tileAt(A.me)(6, 0, 0).id }, A.token);
  ok("traversal: stepping off the isle onto its newborn is a walk", off.data.ok === true);
  // A WALL between heart and east (canonical edge 0,0 dir 2).
  db.prepare("INSERT INTO hex_walls (owner_key, edge_key, q, r, dir, hp, max_hp, kind, level, created_at) VALUES (?, '0,0,2', 0, 0, 2, 10, 10, 'wall', 1, ?)").run(A.me, Date.now());
  await standOn(A.token, heart.id);
  const walled = await standOn(A.token, east.id);
  ok("traversal: a wall refuses the walk", walled.status >= 400, `status=${walled.status}`);
  const over = await call("setTenderTile", { tileId: east.id, airborne: true }, A.token);
  ok("traversal: the leap crosses the wall", over.data.ok === true);
  db.prepare("DELETE FROM hex_walls WHERE owner_key = ? AND edge_key = '0,0,2'").run(A.me);
  // A WARD between heart and south (canonical edge 0,0 dir 3).
  db.prepare("INSERT INTO hex_walls (owner_key, edge_key, q, r, dir, hp, max_hp, kind, level, created_at) VALUES (?, '0,0,3', 0, 0, 3, 15, 15, 'ward', 1, ?)").run(A.me, Date.now());
  await standOn(A.token, heart.id);
  const warded = await call("setTenderTile", { tileId: south.id, airborne: true }, A.token, true);
  ok("traversal: a ward refuses even the leap — a wall the sky cannot ignore", warded.status >= 400, `status=${warded.status}`);
  db.prepare("DELETE FROM hex_walls WHERE owner_key = ? AND edge_key = '0,0,3'").run(A.me);
  // A rise of two trays.
  db.prepare("UPDATE territory_tiles SET height = 3 WHERE id = ?").run(south.id);
  const climb = await standOn(A.token, south.id);
  ok("traversal: a two-tray rise refuses the walk", climb.status >= 400, `status=${climb.status}`);
  const up = await call("setTenderTile", { tileId: south.id, airborne: true }, A.token);
  ok("traversal: the leap lands on the raised tile", up.data.ok === true);
  db.prepare("UPDATE territory_tiles SET height = 1 WHERE id = ?").run(south.id);
  await standOn(A.token, heart.id);
}

/* ── §D THE PRESENCE ROAD: a company standing on a work
      builds it for free — at the flux's own tempo, strictly
      slower than a single 10-point pour. */
{
  const C = await claimTender("Presence Tender");
  seedWorld(C.me);
  await call("chooseClass", { classKey: "warden" }, C.token);
  const begun = await call("beginBuild", { q: 6, r: 0 }, C.token);
  const work = begun.data.tileId;
  seedCompany(C.me, "Mason", "stone", work);
  backdateAnchor(work, 10);
  const t = await terr(C.token);
  const w = t.tiles.find(x => x.id === work);
  // Net press 3 ÷ (16/3) = 0.5625 a step, 10 steps = 5.625.
  ok("presence: ten hours of a small company's press filled the work by the flux rate",
    !!w && Math.abs((w.buildPoints ?? 0) - 5.625) < 0.75, `points=${w?.buildPoints}`);
  ok("presence: strictly slower than one Tender pour (10)", !!w && (w.buildPoints ?? 0) < 10 && w.buildStage === 1, `points=${w?.buildPoints} stage=${w?.buildStage}`);
  ok("presence: and it cost no pool — the road is free", poolOf(C.me, "stone") === 0, `pool=${poolOf(C.me, "stone")}`);
}

/* ── §E THE BAKED CELL: sealed against a foreign press, and
      radiating for its own — the battery pays out by growing. */
{
  const isle = tileAt(A.me)(6, 0, 1);
  const control = tileAt(A.me)(-2, 0);
  db.prepare("UPDATE territory_tiles SET element = 'sky' WHERE id = ?").run(control.id);
  // The control is a HELD tile: a nearly-sealed growing tray
  // (29 of 30) stands under it, so a day of foreign press can
  // erode and turn it without defeating its last tray at the
  // first beat — the comparison the seal must win.
  db.prepare("UPDATE territory_tiles SET grow_points = 29 WHERE id = ?").run(control.id);
  seedCompany(A.me, "Tidepress Isle", "tide", isle.id);
  seedCompany(A.me, "Tidepress Field", "tide", control.id);
  backdateAnchor(isle.id, 24);
  backdateAnchor(control.id, 24);
  await terr(A.token);
  const isleAfter = tileAt(A.me)(6, 0, 1);
  const controlAfter = tileAt(A.me)(-2, 0);
  ok("sealed: a day of foreign press cannot turn baked land",
    isleAfter.element === "sky" && (isleAfter.attune_points ?? 0) === 0,
    `isle element=${isleAfter.element} bank=${isleAfter.attune_points}`);
  ok("sealed: the same press on unbaked land moved it (control turned toward neutral, its tray eroded)",
    controlAfter.element !== "sky" || (controlAfter.attune_points ?? 0) > 0 || (controlAfter.grow_points ?? 29) < 29,
    `control element=${controlAfter.element} bank=${controlAfter.attune_points} grow=${controlAfter.grow_points}`);
  // Radiate: its own element's company grows the stack at 2×.
  db.prepare("DELETE FROM field_placements WHERE owner_key = ?").run(A.me);
  const control2 = tileAt(A.me)(-2, 1);
  db.prepare("UPDATE territory_tiles SET element = 'sky' WHERE id = ?").run(control2.id);
  seedCompany(A.me, "Skypress Isle", "sky", isle.id);
  seedCompany(A.me, "Skypress Field", "sky", control2.id);
  backdateAnchor(isle.id, 10);
  backdateAnchor(control2.id, 10);
  await terr(A.token);
  const isleGrown = tileAt(A.me)(6, 0, 1);
  const controlGrown = tileAt(A.me)(-2, 1);
  // perStep 0.5625 × 10 steps: control 5.625; baked ×2 = 11.25.
  ok("radiate: the control stack grew by the plain rate",
    Math.abs((controlGrown.grow_points ?? 0) - 5.625) < 1.5, `grow=${controlGrown.grow_points}`);
  ok("radiate: the baked stack grew at twice the rate on the same company",
    Math.abs((isleGrown.grow_points ?? 0) - 11.25) < 1.5, `grow=${isleGrown.grow_points}`);
}

/* ── §F THE JUMP ON THE REAL MAP (headless): each class leaps
      with its own arc on the Territory surface itself; the
      Witch hovers; the Runewright doubles off his rune; the
      Sage's third leap flips; and a wall that refuses the
      Binder's walk yields to his leap — stride, server, law. */
{
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--window-size=1280,860"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 860 });
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(String(e)));
  async function openTerritory(token, cls) {
    await page.goto(base + "/", { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.evaluate((tok) => { try { localStorage.setItem("awoken-tender-token", tok); } catch { /* noop */ } }, token);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".deck-button", { timeout: 45000 });
    await page.click(".deck-button");
    await page.waitForFunction((c) => window.__tenderJump && window.__tenderJump.classKey() === c && window.__tenderJump.anchor() != null, { timeout: 45000 }, cls);
  }
  async function sampleJump(watchMs, stepMs = 35) {
    const samples = [];
    const t0 = Date.now();
    while (Date.now() - t0 < watchMs) {
      samples.push(await page.evaluate(() => ({ h: window.__tenderJump.height(), air: window.__tenderJump.airborne(), fl: window.__tenderJump.flipped(), rn: window.__tenderJump.runed(), at: performance.now() })));
      if (samples.length > 8 && samples[samples.length - 1].h === 0 && !samples[samples.length - 1].air && Date.now() - t0 > 600) break;
      await sleep(stepMs);
    }
    return samples;
  }
  const classTenders = {};
  for (const cls of ["warden", "binder", "witch", "runewright", "sage"]) {
    const T = await claimTender(`Jump ${cls}`);
    seedWorld(T.me);
    await call("chooseClass", { classKey: cls }, T.token);
    classTenders[cls] = T;
  }
  // Per-class peaks (the Ground's bands, the Ground's numbers).
  for (const [cls, watch, lo, hi] of [["warden", 1200, 12, 32], ["binder", 1800, 30, 50], ["witch", 2100, 30, 46], ["runewright", 1400, 30, 46], ["sage", 1200, 32, 52]]) {
    await openTerritory(classTenders[cls].token, cls);
    await page.keyboard.press("Space");
    const s = await sampleJump(watch);
    const max = Math.max(...s.map(v => v.h), 0);
    ok(`jump/${cls}: she leaves the ground on her own arc`, s.some(v => v.h > 10 && v.air), `samples=${s.length}`);
    ok(`jump/${cls}: peak in the Ground's band (${lo}..${hi})`, max >= lo && max <= hi, `max=${max.toFixed(1)}`);
    ok(`jump/${cls}: and lands again`, s[s.length - 1].h === 0, `last=${s[s.length - 1].h}`);
    classTenders[cls].maxH = max;
  }
  ok("jump: the Warden's leap is the shortest of the five",
    classTenders.warden.maxH < classTenders.binder.maxH && classTenders.warden.maxH < classTenders.sage.maxH,
    `warden=${classTenders.warden.maxH?.toFixed(1)} binder=${classTenders.binder.maxH?.toFixed(1)} sage=${classTenders.sage.maxH?.toFixed(1)}`);
  // The Witch hovers: pinned at her peak through the hover
  // span (press+410ms to +760ms). The measure is the SPAN the
  // peak is held across, not a sample count — this box samples
  // coarsely under load, so a thin first reading is measured
  // again rather than waved through.
  {
    await openTerritory(classTenders.witch.token, "witch");
    let held = null;
    for (let attempt = 0; attempt < 2 && !held; attempt++) {
      const t0 = Date.now();
      await page.keyboard.press("Space");
      const samples = [];
      while (Date.now() - t0 < 1500) {
        samples.push({ dt: Date.now() - t0, ...(await page.evaluate(() => ({ h: window.__tenderJump.height() }))) });
        if (samples.length > 4 && samples[samples.length - 1].h === 0 && Date.now() - t0 > 1250) break;
        await sleep(35);
      }
      const pinned = samples.filter(s => s.dt >= 520 && s.dt <= 800 && s.h >= 38.5);
      if (pinned.length >= 2 && pinned[pinned.length - 1].dt - pinned[0].dt >= 150) held = pinned;
      else if (attempt === 1) held = pinned; // report the best reading either way
      await sleep(400);
    }
    ok("jump/witch: through the hover span she holds her peak, neither rising nor falling",
      !!held && held.length >= 2 && held[held.length - 1].dt - held[0].dt >= 150,
      `span=${(held ?? []).map(s => `${s.dt}:${s.h.toFixed(1)}`).join(",")}`);
  }
  // The Runewright doubles: a second press mid-air strikes the
  // rune and carries him past his single arc's ceiling (40).
  {
    await openTerritory(classTenders.runewright.token, "runewright");
    await page.keyboard.press("Space");
    await sleep(280);
    await page.keyboard.press("Space");
    const s = await sampleJump(1500);
    const max = Math.max(...s.map(v => v.h), 0);
    ok("jump/runewright: the mid-air second press strikes the rune", s.some(v => v.rn), "");
    ok("jump/runewright: the double carries him past his single arc's peak", max > 42, `max=${max.toFixed(1)}`);
  }
  // The Sage chains: three quick leaps, the third a backflip.
  {
    await openTerritory(classTenders.sage.token, "sage");
    let flipped = false;
    for (let j = 0; j < 3; j++) {
      await page.keyboard.press("Space");
      const t0 = Date.now();
      while (Date.now() - t0 < 1300) {
        const st = await page.evaluate(() => ({ h: window.__tenderJump.height(), air: window.__tenderJump.airborne(), fl: window.__tenderJump.flipped() }));
        if (j === 2 && st.fl) flipped = true;
        if (st.h === 0 && !st.air && Date.now() - t0 > 450) break;
        await sleep(35);
      }
    }
    ok("jump/sage: the third chained leap is the backflip", flipped);
  }
  // The wall, end to end: the Binder's walk is refused at the
  // stride AND the server's anchor; his leap carries him over.
  {
    const B = classTenders.binder;
    const heart = tileAt(B.me)(0, 0), east = tileAt(B.me)(1, 0);
    db.prepare("INSERT INTO hex_walls (owner_key, edge_key, q, r, dir, hp, max_hp, kind, level, created_at) VALUES (?, '0,0,2', 0, 0, 2, 10, 10, 'wall', 1, ?)").run(B.me, Date.now());
    await call("setTenderTile", { tileId: heart.id }, B.token);
    await openTerritory(B.token, "binder");
    await sleep(600);
    // The east hex's own face, found by the map's geometry: the
    // hit polygons are the fitted hex cells; the figure stands
    // on the heart, and east is the rightmost of its six
    // nearest neighbours. A fresh Tender's map wears lore
    // overlays a raw mouse tap would land on, so the tap is
    // delivered to the hex's own hit cell — the very element
    // his thumb strikes — and the real tap handler answers.
    const clickHexNear = async (pt) => page.evaluate(({ x, y }) => {
      const svg = document.querySelector(".territory-svg");
      const polys = [...svg.querySelectorAll("polygon")].map(p => {
        const pts = (p.getAttribute("points") || "").split(" ").map(s => s.split(",").map(Number));
        if (pts.length < 6) return null;
        const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length, cy = pts.reduce((a, q) => a + q[1], 0) / pts.length;
        return { p, cx, cy, d: Math.hypot(cx - x, cy - y) };
      }).filter(Boolean).sort((a, b) => a.d - b.d);
      const target = polys[0];
      target.p.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      return { cx: target.cx, cy: target.cy };
    }, pt);
    const eastCenter = await page.evaluate(() => {
      const svg = document.querySelector(".territory-svg");
      const pos = window.__tenderJump.pos();
      const polys = [...svg.querySelectorAll("polygon")].map(p => {
        const pts = (p.getAttribute("points") || "").split(" ").map(s => s.split(",").map(Number));
        if (pts.length < 6) return null;
        const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length, cy = pts.reduce((a, q) => a + q[1], 0) / pts.length;
        return { cx, cy, d: Math.hypot(cx - pos.x, cy - pos.y) };
      }).filter(Boolean).filter(c => c.d > 5).sort((a, b) => a.d - b.d);
      const east = polys.slice(0, 6).reduce((best, c) => (c.cx > best.cx ? c : best), polys[0]);
      return { x: east.cx, y: east.cy };
    });
    await clickHexNear(eastCenter);
    await sleep(1600);
    const walkedAnchor = await page.evaluate(() => window.__tenderJump.anchor());
    const walkedServer = (await terr(B.token)).tender?.tileId;
    ok("crossing: the wall refuses the walk — the figure stops, the anchor holds",
      walkedAnchor === heart.id && walkedServer === heart.id, `client=${walkedAnchor} server=${walkedServer} heart=${heart.id}`);
    await page.keyboard.press("Space");
    await sleep(180);
    await clickHexNear(eastCenter);
    let landed = null;
    for (let i = 0; i < 40 && landed !== east.id; i++) {
      await sleep(150);
      landed = await page.evaluate(() => window.__tenderJump.anchor()).catch(() => null);
    }
    const serverStand = (await terr(B.token)).tender?.tileId;
    ok("crossing: the leap carries him over the wall, and the server's stand follows",
      landed === east.id && serverStand === east.id, `client=${landed} server=${serverStand} east=${east.id}`);
  }
  ok("the map carried no page errors through the leaps", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
  await browser.close();
}

console.log(`\ntest59: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
