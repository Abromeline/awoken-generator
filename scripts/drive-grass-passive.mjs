// drive-grass-passive — THE GRASS PASSIVE (Nigel, 2026-11-10:
// "they can run in any order as long as they all land
// correctly"; the passive's own spec: Root ≥ 2 in the sum of
// the parts; no channel, no cast — it works by standing).
// Proven on the real homeland, against the server's own
// served rows and the client's own DOM:
//   §A a qualifying Awoken's tile grows sprigs for the spans
//      it stood (the fixture ages its garden clock three
//      hours): sprigs stand at the grown count, read from
//      the server.
//   §B ten sprigs = +1 tile HP, read from the server: the
//      tile's served hp is its pool of 10 plus exactly
//      floor(sprigs / 10) — the gift inside the pool itself.
//   §C a non-qualifier (no Root in its parts) grows nothing
//      on its tile over the same span; and the qualifier's
//      grass keeps growing — two more aged hours carry it
//      past thirty sprigs and its gift to +3.
//   §D the browser: the tile wears tufts of the grass
//      Dreams on the real face; the painted sequences are
//      the ones the cycle law deals for the hour (the bag
//      law itself — no repeat until all three have shown —
//      is proven exactly at the module in §D2, compiled from
//      the client's own grassFx, because this sandbox
//      starves the heavy page's clock to ~1 tick a second);
//      the frames play; the tile's click card speaks its
//      sprigs and its tile health.
//   §E partial damage does not thin them: a 5-damage blow
//      leaves every sprig standing (and the HP it spends is
//      the pool's own — grass gift included, as it should).
//   §F damage that breaks them ALL at once removes them: a
//      blow spending the tile's HP to zero falls the tile,
//      and its sprig count stands at 0 — the gift gone with
//      the grass.
// The fixture database lives on /tmp (tmpfs): fixture DBs on
// the workspace volume wedge in this sandbox's writeback
// stall (Push 88's pinned lesson).
// Run after `npm run build`:
//   PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-grass-passive.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

mkdirSync("/home/hatch/workspace/grass-passive-proof", { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-grass-"));
process.env.PORT = "39991";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39991";
const PW = "grass-drive-password";
const SHOTS = "/home/hatch/workspace/grass-passive-proof";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HOUR = 3600 * 1000;

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
  return { status: res.status, body: data?.data ?? data, raw: data };
}
async function callOk(action, args, token) {
  let lastErr = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const r = await call(action, args, token);
      if (r.status === 200) return r.body;
      const msg = `${action} -> ${r.status}: ${JSON.stringify(r.raw).slice(0, 200)}`;
      if (r.status >= 500 && /disk I\/O|SQLITE_IOERR|readonly database/i.test(JSON.stringify(r.raw))) {
        lastErr = new Error(msg);
        await sleep(6000);
        continue;
      }
      throw new Error(msg);
    } catch (e) {
      lastErr = e;
      if (!/fetch failed|ECONNRESET/i.test(String(e && e.message || e))) throw e;
      await sleep(900);
    }
  }
  throw lastErr;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
const now0 = Date.now();

/* ══ THE WORLD: a fresh Tender and their sown land ══════════ */
const claim = await callOk("claimTender", { password: PW, tenderName: "Grass Tender" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
const token = claim.token;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 3, 'runewright', 'arrow', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'runewright', total_exp = 3800, hp = 100").run(ownerKey, now0);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 900, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 900").run(ownerKey, now0);
await callOk("ensureFirstSeed", {}, token);
let land = await callOk("getTerritory", {}, token);
for (let i = 0; i < 6; i++) {
  db.prepare("UPDATE territory_tiles SET cursed = 0").run();
  const before = land.tiles.length;
  land = await callOk("getTerritory", {}, token);
  if (land.tiles.length === before && land.tiles.every(t => !t.cursed)) break;
}
db.prepare("UPDATE territory_tiles SET cursed = 0").run();
ok("the sown land stands cleansed for the fixture", land.tiles.length >= 19, `${land.tiles.length} tiles`);

/* ══ TWO AWOKEN: one Root-strong, one with no Root ══════════ */
function makeAwoken(name, partSpecs) {
  const insA = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 3, 3, ?, ?, 'image/png', ?)");
  const parts = partSpecs.map(([n, c, el]) => ({ id: Number(insA.run(n, c, el, `grass-drive/${n}.png`, now0).lastInsertRowid), name: n, category: c, element: el }));
  const composition = JSON.stringify(parts.map(p => ({ source_id: `db:${p.id}`, name: p.name, category: p.category, power: 3, toughness: 3, element: p.element })));
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, 'grass-drive/one.png', ?, 'tender', 'Grass Tender', ?, ?)").run(name, name, composition, ownerKey, now0).lastInsertRowid);
}
// Root 2 in the sum of the parts: THE GRASS PASSIVE's gate.
const QUALIFIER = makeAwoken("Mosswarden", [["Moss Body", "body", "root"], ["Moss Arms", "arms", "root"], ["Stone Crown", "head", "stone"]]);
// No Root at all: the gate refuses it, however long it stands.
const BYSTANDER = makeAwoken("Stonehand", [["Stone Body", "body", "stone"], ["Stone Arms", "arms", "stone"], ["Stone Crown II", "head", "stone"]]);

const ringOf = (t) => Math.max(Math.abs(t.q), Math.abs(t.r), Math.abs(t.q + t.r));
const tenderTileId = land.tender?.tileId;
const clean = land.tiles.filter(t => !t.cursed && t.id !== tenderTileId && ringOf(t) >= 2 && ringOf(t) <= 3);
const tileQ = clean[0];
const tileN = clean.find(t => Math.abs(t.q - tileQ.q) + Math.abs(t.r - tileQ.r) > 2) ?? clean[1];
ok("two clean tiles stand for the two standings", !!tileQ && !!tileN, JSON.stringify({ q: tileQ?.id, n: tileN?.id }));

function place(awId, tile, stoodMs) {
  const placedAt = Date.now() - stoodMs;
  const pid = Number(db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
    VALUES (?, ?, ?, ?, ?, 'defense', 0, 99, ?, ?, NULL, NULL, 0)`).run(ownerKey, awId, tile.id, placedAt, placedAt, tile.q, tile.r).lastInsertRowid);
  // The other standing clocks are kept current so only the
  // garden clock carries the aged span.
  db.prepare("UPDATE field_placements SET grass_paid_at = ?, press_paid_at = ?, bind_paid_at = ? WHERE id = ?")
    .run(placedAt, Date.now(), Date.now(), pid);
  return pid;
}
const pidQ = place(QUALIFIER, tileQ, 3 * HOUR);
place(BYSTANDER, tileN, 3 * HOUR);

const servedTile = (id) => land.tiles.find(t => t.id === id);

/* ══ §A + §B + §C(first half): three hours stood ════════════ */
land = await callOk("getTerritory", {}, token);
const qA = servedTile(tileQ.id);
const nA = servedTile(tileN.id);
const sprigsA = Math.floor(qA.sprigs ?? 0);
ok("§A the qualifier's tile grew sprigs for the spans stood (3h at the build's rate = 18)", sprigsA === 18, `sprigs=${qA.sprigs}`);
ok("§B ten sprigs = +1 tile HP, read from the server (hp = 10 + floor(sprigs/10))", qA.hp === 10 + Math.floor(sprigsA / 10) && qA.hp === 11, `hp=${qA.hp} sprigs=${sprigsA}`);
ok("§C a non-qualifier grows nothing over the same span", Math.floor(nA.sprigs ?? 0) === 0, `sprigs=${nA.sprigs}`);

/* ══ §C(second half): two more hours — the gift ripens ══════ */
db.prepare("UPDATE field_placements SET grass_paid_at = ? WHERE id = ?").run(Date.now() - 2 * HOUR, pidQ);
land = await callOk("getTerritory", {}, token);
const qB = servedTile(tileQ.id);
const sprigsB = Math.floor(qB.sprigs ?? 0);
ok("§C the grass keeps growing — past thirty sprigs after five hours stood", sprigsB >= 30, `sprigs=${qB.sprigs}`);
ok("§C the gift ripens with the count (hp = 10 + floor(sprigs/10))", qB.hp === 10 + Math.floor(sprigsB / 10), `hp=${qB.hp} sprigs=${sprigsB}`);

/* ══ §D2 THE CYCLE LAW, AT THE MODULE (the client's own
 * grassFx, compiled as the wheel drive compiles the registry):
 * the dealing is a bag — for every tile and every bag, the
 * three runs are the three sequences in some order, never a
 * repeat; and a tuft's frame walks its sequence in order. ══ */
{
  const { buildSync } = await import("../node_modules/esbuild/lib/main.js");
  const out = join(tmpdir(), `grassfx-${process.pid}.mjs`);
  buildSync({ entryPoints: [join(process.cwd(), "client/src/grassFx.ts")], outfile: out, bundle: true, format: "esm", platform: "node", loader: { ".png": "dataurl" }, logLevel: "silent" });
  const FX = await import(out);
  let bagsOk = true;
  for (let tile = 1; tile <= 200 && bagsOk; tile++) {
    for (let bag = 0; bag < 50; bag++) {
      const b = FX.grassBag(tile, bag);
      if (b.length !== 3 || new Set(b).size !== 3) { bagsOk = false; break; }
    }
  }
  ok("§D2 the dealing is a bag — three runs, three sequences, no repeat (200 tiles × 50 bags)", bagsOk);
  let cycleOk = true;
  for (const tile of [1, 7, 42, 1000]) {
    for (let bagNo = 0; bagNo < 100 && cycleOk; bagNo++) {
      const seqs = [0, 1, 2].map(k => FX.grassSeqAt((bagNo * 3 + k) * FX.GRASS_RUN_MS + 1, tile));
      if (new Set(seqs).size !== 3) cycleOk = false;
    }
  }
  ok("§D2 grassSeqAt deals each bag's three runs as the three sequences, tile after tile", cycleOk);
  ok("§D2 the three Dreams stand whole in the module (61 · 61 · 59 frames)", FX.GRASS_SEQS.map(s => s.frames.length).join(",") === "61,61,59", FX.GRASS_SEQS.map(s => s.frames.length).join(","));
  const f0 = FX.grassFrameAt(1000, 7, 0), f1 = FX.grassFrameAt(1000 + FX.GRASS_FRAME_MS * 3, 7, 0);
  ok("§D2 a tuft's frame walks its sequence in order as the hour passes", f1.seq === f0.seq && f1.frame === f0.frame + 3, `${f0.seq}/${f0.frame} -> ${f1.seq}/${f1.frame}`);
  globalThis.__FX = FX;
}

/* ══ §D THE BROWSER: tufts, the cycle, the card ═════════════ */
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:grass]", String(e).slice(0, 200)));
await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
async function enterTerritory() {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  const door = await page.waitForSelector(".deck-button", { timeout: 120000 }).catch(() => null);
  if (!door) throw new Error("territory: no .deck-button on the home face");
  await door.click();
  await page.waitForFunction(() => !!window.__tenderJump && !!window.__tenderJump.pos(), { timeout: 180000 });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Skip");
    if (b) b.click();
  });
  await sleep(1200);
}
async function clearOverlays() {
  for (let i = 0; i < 10; i++) {
    const dismissed = await page.evaluate(() => {
      const cer = [...document.querySelectorAll(".ceremony-card button")].find((b) => b.textContent.trim() === "Tend on");
      if (cer) { cer.click(); return true; }
      const rep = document.querySelector(".return-report-overlay:not(:has(.ceremony-card))");
      if (rep) rep.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      const p = document.querySelector(".admin-popup");
      if (p) p.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      return false;
    });
    await sleep(300);
    if (!dismissed) break;
  }
}
try { await enterTerritory(); } catch (e) {
  console.log("  [enterTerritory retry after]", String(e).slice(0, 120));
  await enterTerritory();
}
await clearOverlays();
await sleep(1500);

const grassSel = `g[data-grass-tile="${tileQ.id}"]`;
const grassDom = await page.evaluate((sel) => {
  const g = document.querySelector(sel);
  if (!g) return null;
  return { seq: g.getAttribute("data-grass-seq"), sprigs: g.getAttribute("data-grass-sprigs"), images: g.querySelectorAll("image").length };
}, grassSel).catch(() => null);
ok("§D the qualifier's tile wears grass tufts on the real face", !!grassDom && grassDom.images === Math.min(6, sprigsB), JSON.stringify(grassDom));
ok("§D the painted stand carries the server's sprig count", !!grassDom && Number(grassDom.sprigs) >= 30, JSON.stringify(grassDom));

// THE CYCLE, AS PAINTED: sample the stand's sequence and
// frame against the wall clock. This sandbox starves the
// heavy page's main thread (a 100 ms timer fires ~1×/s
// here, control-proven), so the painted stand may lag the
// wall clock by seconds — the assertions are shaped for
// that weather: every painted sequence must be one the
// module's own law deals for that hour (within a 5 s lag
// window), the samples must SHOW the cycle turning (all
// three sequences dealt, in the module's order across
// time), and the tuft's picture must change. The bag law
// itself is proven exactly at the module in §D2.
const FX = globalThis.__FX;
const samples = [];
const sampleUntil = Date.now() + 40000;
while (Date.now() < sampleUntil) {
  const s = await page.evaluate((sel) => {
    const g = document.querySelector(sel);
    if (!g) return null;
    const img = g.querySelector("image");
    return { seq: Number(g.getAttribute("data-grass-seq")), href: img ? img.getAttribute("href") : null };
  }, grassSel).catch(() => null);
  if (s) samples.push({ t: Date.now(), ...s });
  await sleep(400);
}
let agreeOk = samples.length >= 5;
for (const s of samples) {
  const dealt = new Set();
  for (let lag = 0; lag <= 5000; lag += 250) dealt.add(FX.grassSeqAt(s.t - lag, tileQ.id));
  if (!dealt.has(s.seq)) { agreeOk = false; break; }
}
ok("§D every painted sequence is the one the cycle law deals for that hour (lag-tolerant)", agreeOk, `${samples.length} samples`);
const seqStream = [];
for (const s of samples) if (seqStream[seqStream.length - 1] !== s.seq) seqStream.push(s.seq);
ok("§D the cycle turns on the face — all three Dreams show in the sampling window", new Set(seqStream).size === 3 && seqStream.length >= 3, `stream: ${seqStream.join(",")}`);
const distinctFrames = new Set(samples.map(s => s.href)).size;
ok("§D the tufts' pictures change as they sway (frames play)", distinctFrames >= 3, `${distinctFrames} distinct frames sampled`);

// Centre the grassy tile and photograph it for the record:
// if the stand sits outside the view, drag the land by it
// (the map follows a drag from any point of itself).
const grassRect = () => page.evaluate((sel) => {
  const g = document.querySelector(sel);
  if (!g) return null;
  const r = g.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
}, grassSel).catch(() => null);
let rect = await grassRect();
if (rect && (rect.x < 150 || rect.x > 1150 || rect.y < 150 || rect.y > 750)) {
  await page.mouse.move(rect.x + rect.w / 2, rect.y + rect.h / 2);
  await page.mouse.down();
  await page.mouse.move(700, 475, { steps: 12 });
  await page.mouse.up();
  await sleep(900);
  rect = await grassRect();
}
if (rect && rect.w > 0) {
  const clip = { x: Math.max(0, rect.x - 260), y: Math.max(0, rect.y - 260), width: Math.min(1400, rect.w + 520), height: Math.min(950, rect.h + 520) };
  await page.screenshot({ path: join(SHOTS, "grass-tile.png"), clip }).catch(() => null);
}
await page.screenshot({ path: join(SHOTS, "grass-face.png") }).catch(() => null);

// The tile's click card. Click the grassy hex's own
// ground: find the tile's own hit polygon in the DOM (its
// centroid nearest the stand's base, in SVG units) and
// click inside the hex, off the standing figure. Only
// this tile's card can speak of sprigs.
// REPAIR (this run, diagnosed by an instrumented probe):
// the old section clicked ONE fixed point — halfway from
// the centroid toward vertex 0 — and clicked "through"
// whatever covered it. The probe showed that point can
// land under the page's own tools UI (elementFromPoint
// named a deck-button in the tender-tools header): the
// click-through then pressed that button again and
// again, and no click ever reached the hex, so the card
// never opened and the check read an empty string. The
// repair chooses the click point the way a player does:
// from candidate points inside the hex (toward each
// vertex at two depths, the centre last), take the first
// whose topmost element is the map itself; never repeat
// a point that opened something else; and if every
// candidate is covered, drag the land to bring the tile
// to the middle of the view and choose again.
let cardText = "";
{
  await clearOverlays();
  const findClick = (tried) => page.evaluate((sel, triedPts) => {
    const g = document.querySelector(sel);
    if (!g) return null;
    const img = g.querySelector("image");
    const baseX = Number(img.getAttribute("x")) + Number(img.getAttribute("width")) / 2;
    const baseY = Number(img.getAttribute("y")) + Number(img.getAttribute("height"));
    let best = null;
    for (const p of document.querySelectorAll("svg.territory-svg polygon")) {
      const pts = (p.getAttribute("points") || "").trim().split(/\s+/).map(pair => pair.split(",").map(Number));
      if (pts.length < 5 || pts.some(q => q.length !== 2 || q.some(Number.isNaN))) continue;
      const cxp = pts.reduce((a, q) => a + q[0], 0) / pts.length;
      const cyp = pts.reduce((a, q) => a + q[1], 0) / pts.length;
      const d = Math.hypot(cxp - baseX, cyp - baseY);
      if (!best || d < best.d) best = { d, cx: cxp, cy: cyp, pts };
    }
    if (!best) return null;
    const svg = document.querySelector("svg.territory-svg");
    const m = svg.getScreenCTM();
    if (!m) return null;
    const toScreen = (x, y) => { const t = new DOMPoint(x, y).matrixTransform(m); return { x: t.x, y: t.y }; };
    const centre = toScreen(best.cx, best.cy);
    const candidates = [];
    for (const frac of [0.55, 0.35]) {
      for (const v of best.pts) candidates.push(toScreen(best.cx + (v[0] - best.cx) * frac, best.cy + (v[1] - best.cy) * frac));
    }
    candidates.push(centre);
    for (const pt of candidates) {
      if (pt.x < 4 || pt.y < 4 || pt.x > window.innerWidth - 4 || pt.y > window.innerHeight - 4) continue;
      if (triedPts.some(t => Math.hypot(t.x - pt.x, t.y - pt.y) < 6)) continue;
      const el = document.elementFromPoint(pt.x, pt.y);
      if (el && el.closest("svg.territory-svg")) return { x: pt.x, y: pt.y };
    }
    return { needDrag: true, centre };
  }, grassSel, tried).catch(() => null);
  const tried = [];
  for (let attempt = 0; attempt < 8 && !/Sprigs of grass/.test(cardText); attempt++) {
    const found = await findClick(tried);
    if (!found) break;
    if (found.needDrag) {
      await page.mouse.move(found.centre.x, found.centre.y);
      await page.mouse.down();
      await page.mouse.move(700, 475, { steps: 12 });
      await page.mouse.up();
      await sleep(900);
      continue;
    }
    tried.push({ x: found.x, y: found.y });
    await page.mouse.click(found.x, found.y);
    await sleep(900);
    cardText = await page.evaluate(() => document.querySelector(".orb-info-tilebox")?.textContent ?? "").catch(() => "");
    if (!/Sprigs of grass/.test(cardText)) {
      await page.mouse.click(24, 24);
      await sleep(300);
    }
  }
  if (/Sprigs of grass/.test(cardText)) {
    const box = await page.evaluate(() => {
      const p = document.querySelector(".orb-info-tilebox");
      if (!p) return null;
      const r = p.getBoundingClientRect();
      return { x: Math.max(0, r.x - 10), y: Math.max(0, r.y - 10), width: r.width + 20, height: r.height + 20 };
    }).catch(() => null);
    if (box) await page.screenshot({ path: join(SHOTS, "grass-card.png"), clip: box }).catch(() => null);
  }
}
ok("§D the tile's click card speaks its sprigs and its tile health", /Sprigs of grass/.test(cardText) && /Tile health/.test(cardText), cardText.slice(0, 160));
await browser.close();

/* ══ §E partial damage does not thin them ═══════════════════ */
const sprigsBeforeBlows = Math.floor(servedTile(tileQ.id).sprigs ?? 0);
const hpBeforeBlows = servedTile(tileQ.id).hp;
const partial = await callOk("damageTileHp", { tileId: tileQ.id, damage: 5 }, token);
land = await callOk("getTerritory", {}, token);
const qE = servedTile(tileQ.id);
ok("§E a partial blow spends the pool and no more (hp falls by the blow alone)", partial.hp === hpBeforeBlows - 5 && qE.hp === hpBeforeBlows - 5, `hp ${hpBeforeBlows} -> ${qE.hp}`);
ok("§E partial damage does not thin the tufts — every sprig stands", Math.floor(qE.sprigs ?? 0) === sprigsBeforeBlows, `sprigs ${sprigsBeforeBlows} -> ${qE.sprigs}`);

/* ══ §F the blow that breaks them ALL at once ═══════════════ */
const breaking = await callOk("damageTileHp", { tileId: tileQ.id, damage: 20 }, token);
const dbSprigs = db.prepare("SELECT sprigs FROM territory_tiles WHERE id = ?").get(tileQ.id).sprigs;
land = await callOk("getTerritory", {}, token);
const qF = servedTile(tileQ.id);
ok("§F the breaking blow spends the tile to zero and it falls", breaking.hp === 0 && breaking.cursed === true, JSON.stringify(breaking));
ok("§F all the tufts break at once — the count stands at 0, in the DB and served", dbSprigs === 0 && Math.floor(qF.sprigs ?? 0) === 0 && !!qF.cursed, `db=${dbSprigs} served=${qF.sprigs} cursed=${qF.cursed}`);

console.log(`\nGRASS PASSIVE DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
