// THE SPARK CLAIM MARKER RIDES ON TOP (Nigel, 2026-11-12 —
// from his play, with a screenshot of his first fire aspect:
// "ive found my first fire aspect but the button to claim it
// is behind so many things i cant click it").
//
// The marker (a tile with spark === 1: the Fire aspect image
// or 🔥, over the words "SPARK — tap to claim") used to be
// painted INSIDE its own tile's group, in the middle of the
// per-tile pass. In SVG the topmost shape at a point takes
// the click, and everything painted after the marker covered
// it: the rest of that tile's dressing, every later-painted
// (southern) tile, the screen-space hit layer, the buildings
// and standing figures, the effects, and the light layer.
// The tap landed on anything but the marker.
//
// The fix hoists the marker into a dedicated overlay — the
// last camera group of the map, above every layer — anchored
// at the tile's drawn position, same face, same words, same
// claim. Only the marker's own image and words take clicks;
// no hit area is laid over the map.
//
// This drive proves it on the real face:
//   §A the marker stands in the scene, in the map's LAST
//      camera group — not inside its tile's group.
//   §B hemmed in the way Nigel's screenshot shows it (cursed
//      tiles painted after it to the south, their glow over
//      it, a fallen seed standing on the next tile, a beacon's
//      light across the scene), the topmost element at the
//      marker's own points is the marker itself.
//   §C a real mouse click on the marker fires the claim:
//      the claimSpark call goes out, the "Fire found!"
//      animation starts, the spark is spent in the ledger
//      and the fire attunement stands at 1 — and the marker
//      is gone from the refreshed land.
//   §D no blanket: a point on the same tile, below the
//      marker's words, is NOT the marker — map taps elsewhere
//      are untouched.
// Screenshots land in ~/workspace/spark-claim-proof/.
//   node scripts/drive-spark-claim-on-top.mjs [port]
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";

const ROOT = process.cwd();
const PORT = process.argv[2] ?? "3993";
const require = createRequire(join(ROOT, "package.json"));
const Database = require("better-sqlite3");
const puppeteer = createRequire("/home/hatch/workspace/tools-chrome/package.json")("puppeteer");

const OUT = "/home/hatch/workspace/spark-claim-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join("/home/hatch/workspace/big-tmp", "awoken-spark-proof-"));
process.env.PORT = PORT;
process.env.WORKSHOP_PASSWORD = "spark-proof-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

await import(join(ROOT, "server/dist/index.js"));
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
const now = Date.now();
const claim = await call("claimTender", { password: "spark-proof-password", tenderName: "Spark Tender" });
const token = claim.token;
const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id}`;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 0, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800, class_key = 'warden', hp = 100").run(me, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(me, now);

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, spark, hp, sealed_trays, grow_points, height, z, mix_points, curse_hp, curse_max_hp, created_at) VALUES (?, ?, ?, ?, ?, ?, 10, ?, 0, ?, ?, ?, ?, ?, ?)");
function wipeWorld() {
  db.prepare("DELETE FROM territory_tiles WHERE owner_key = ?").run(me);
  db.prepare("DELETE FROM star_seeds WHERE owner_key = ?").run(me);
  db.prepare("DELETE FROM field_placements WHERE owner_key = ?").run(me);
  db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(me);
}
function addRow(q, r, z, { element = "neutral", cursed = 0, spark = 0, height = 1, sealed = 0 } = {}) {
  return Number(insTile.run(me, q, r, element, cursed, spark, sealed, height, z, null, cursed ? 10 : null, cursed ? 10 : null, now).lastInsertRowid);
}
const setStand = (tileId) => db.prepare("UPDATE tender_progress SET tender_tile_id = ? WHERE owner_key = ?").run(tileId, me);

/* The test land, laid to match Nigel's screenshot:
 * - a clean disc, the Tender standing at (0,0);
 * - THE SPARK at (1,1): a freshly purified tile carrying the
 *   unclaimed fire aspect (spark = 1);
 * - cursed tiles at (2,1), (0,2), (2,2), (1,3), (0,3) —
 *   painted AFTER the spark tile (the southern rows), their
 *   faces and corruption glow spilling over its lower half,
 *   where the claim words sit;
 * - a fallen seed standing at (1,2), the tile directly south
 *   of the spark — a standing shape over the marker's words;
 * - a level-3 beacon seed at (-2,0), so the light layer's
 *   glow crosses the scene (its ring reaches only its own
 *   neighbours, two or more steps from every cursed fixture,
 *   so the ring law leaves the cursed ground standing). */
wipeWorld();
const discIds = {};
for (let q = -5; q <= 5; q++) for (let r = -5; r <= 5; r++) {
  if (hexDist({ q, r }, { q: 0, r: 0 }) > 5) continue;
  discIds[`${q},${r}`] = addRow(q, r, 0, { element: "neutral" });
}
const cursedAt = (q, r) => {
  db.prepare("DELETE FROM territory_tiles WHERE owner_key = ? AND q = ? AND r = ? AND z = 0").run(me, q, r);
  return addRow(q, r, 0, { element: "neutral", cursed: 1 });
};
for (const [q, r] of [[2, 1], [0, 2], [2, 2], [1, 3], [0, 3]]) cursedAt(q, r);
db.prepare("DELETE FROM territory_tiles WHERE owner_key = ? AND q = -2 AND r = 0 AND z = 0").run(me);
const beaconTileId = addRow(-2, 0, 0, { element: "neutral" });
db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at, defenses, fed_energy) VALUES (?, ?, 3, 'fallen', ?, 0, 0)").run(me, beaconTileId, now);
const seedTileId = discIds["1,2"];
db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at, defenses, fed_energy) VALUES (?, ?, 1, 'fallen', ?, 0, 0)").run(me, seedTileId, now);
db.prepare("DELETE FROM territory_tiles WHERE owner_key = ? AND q = 1 AND r = 1 AND z = 0").run(me);
const sparkTileId = addRow(1, 1, 0, { element: "neutral", spark: 1 });
setStand(discIds["0,0"]);

const land = await call("getTerritory", {}, token);
const servedSpark = (land.tiles ?? []).find(t => t.id === sparkTileId);
ok("the served land carries the spark tile, still unclaimed", !!servedSpark && servedSpark.spark === 1,
  `spark=${servedSpark?.spark}`);
const servedCursedSouth = (land.tiles ?? []).filter(t => t.cursed && t.r >= 2).length;
ok("the cursed tiles south of the spark stand in the served land", servedCursedSouth >= 4,
  `cursedSouth=${servedCursedSouth}`);

/* ═══ THE BROWSER ═══════════════════════════════════════ */
console.log("the browser");
const browser = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
const claimCalls = [];
page.on("request", (req) => {
  if (req.url().includes("claimSpark")) claimCalls.push(req.url());
});
await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
await sleep(2500);
const door = await page.$(".deck-button");
if (!door) throw new Error("no .deck-button on the home face");
await door.click();
await page.waitForFunction(() => !!window.__tenderJump && !!window.__tenderJump.pos(), { timeout: 30000 }).catch(() => {});
await sleep(1500);
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Skip");
  if (b) b.click();
});
await sleep(800);
for (let i = 0; i < 3; i++) {
  const stood = await page.evaluate(() => !!document.querySelector(".return-report-overlay"));
  if (!stood) break;
  await page.mouse.click(24, 24);
  await sleep(300);
}
await page.evaluate(() => {
  const p = document.querySelector(".admin-popup");
  if (p) p.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "×").forEach((b) => b.click());
});
await sleep(3500);

/* §A — the marker stands, in the topmost camera group. */
const seat = await page.evaluate((tileId) => {
  const marker = document.querySelector(`.spark-claim-marker[data-tile-id="${tileId}"]`);
  if (!marker) return { found: false };
  const cams = [...document.querySelectorAll("svg g.land-cam")];
  const itsCam = marker.closest("g.land-cam");
  const words = [...marker.querySelectorAll("text")].map((t) => t.textContent.trim());
  return {
    found: true,
    words,
    camCount: cams.length,
    isLastCam: !!itsCam && cams[cams.length - 1] === itsCam,
    markerCount: document.querySelectorAll(".spark-claim-marker").length,
  };
}, sparkTileId);
console.log(`SEAT found=${seat.found} cams=${seat.camCount} lastCam=${seat.isLastCam} words=${JSON.stringify(seat.words)}`);
ok("§A the spark claim marker stands on the map", seat.found);
ok("§A it carries the claim words, unchanged", (seat.words ?? []).some(w => w.includes("SPARK — tap to claim")),
  `words=${JSON.stringify(seat.words)}`);
ok("§A it stands in the map's LAST camera group — above the land, the figures and the light",
  seat.isLastCam, `cams=${seat.camCount}`);
ok("§A exactly one marker stands (one per spark tile)", seat.markerCount === 1, `count=${seat.markerCount}`);

/* §B — hemmed in, the marker is the topmost thing at its own
 * points. The words are glyphs, so a single centre point can
 * fall between letters: scan along the words' middle line
 * and the face's box for a point the marker itself owns,
 * and require one to exist for each. */
const probe = await page.evaluate((tileId) => {
  const marker = document.querySelector(`.spark-claim-marker[data-tile-id="${tileId}"]`);
  if (!marker) return { found: false };
  const owns = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return !!el && (el === marker || marker.contains(el));
  };
  const scan = (rect, stepPx) => {
    const y = rect.y + rect.height / 2;
    for (let x = rect.x + 1; x < rect.x + rect.width - 1; x += stepPx) {
      if (owns(x, y)) return { x, y };
    }
    return null;
  };
  const texts = [...marker.querySelectorAll("text")];
  const wordsEl = texts.find((t) => (t.textContent ?? "").includes("SPARK"));
  const faceEl = marker.querySelector("image") ?? texts.find((t) => !((t.textContent ?? "").includes("SPARK")));
  const wordsRect = wordsEl ? wordsEl.getBoundingClientRect() : null;
  const faceRect = faceEl ? faceEl.getBoundingClientRect() : null;
  const wordsHit = wordsRect ? scan(wordsRect, 2) : null;
  const faceHit = faceRect ? scan(faceRect, 3) : null;
  // What actually owns the words' centre, for the record.
  let centreOwner = null;
  if (wordsRect) {
    const el = document.elementFromPoint(wordsRect.x + wordsRect.width / 2, wordsRect.y + wordsRect.height / 2);
    centreOwner = el ? (el.getAttribute("class") ?? el.tagName) : null;
  }
  return {
    found: true,
    wordsRect: wordsRect ? { x: wordsRect.x, y: wordsRect.y, w: wordsRect.width, h: wordsRect.height } : null,
    faceRect: faceRect ? { x: faceRect.x, y: faceRect.y, w: faceRect.width, h: faceRect.height } : null,
    wordsHit, faceHit, centreOwner,
  };
}, sparkTileId);
console.log(`PROBE wordsRect=${JSON.stringify(probe.wordsRect)} wordsHit=${JSON.stringify(probe.wordsHit)} faceHit=${JSON.stringify(probe.faceHit)} centreOwner=${probe.centreOwner}`);
ok("§B the marker's words are on screen", !!probe.wordsRect && probe.wordsRect.w > 10,
  `rect=${JSON.stringify(probe.wordsRect)}`);
ok("§B the topmost element at the claim words is the marker itself — not a cursed face, not the hit layer, not the light",
  !!probe.wordsHit, `centreOwner=${probe.centreOwner}`);
ok("§B the topmost element at the fire face is the marker itself", !!probe.faceHit);

// The screenshots are evidence, not assertions: on a loaded
// box a starved capture must not kill the run's spine, so a
// failed shot is noted and the drive walks on.
await page.screenshot({ path: join(OUT, "spark-on-top.png") }).catch((e) => console.log("  (full screenshot failed:", String(e).slice(0, 80), ")"));
if (probe.wordsRect) {
  const r = probe.wordsRect;
  const clip = {
    x: Math.max(0, r.x - 190), y: Math.max(0, r.y - 190),
    width: Math.min(1400 - Math.max(0, r.x - 190), r.w + 380),
    height: Math.min(950 - Math.max(0, r.y - 190), r.h + 300),
  };
  await page.screenshot({ path: join(OUT, "spark-on-top-close.png"), clip }).catch((e) => console.log("  (close screenshot failed:", String(e).slice(0, 80), ")"));
}

/* §D — no blanket: below the words, on the same tile, the
 * topmost thing is NOT the marker. (Proven before the click,
 * while the marker still stands.) */
const below = await page.evaluate((tileId) => {
  const marker = document.querySelector(`.spark-claim-marker[data-tile-id="${tileId}"]`);
  if (!marker) return { found: false };
  const wordsEl = [...marker.querySelectorAll("text")].find((t) => (t.textContent ?? "").includes("SPARK"));
  const r = wordsEl.getBoundingClientRect();
  const x = r.x + r.width / 2, y = r.y + r.height + 55;
  const el = document.elementFromPoint(x, y);
  return { found: true, insideMarker: !!el && (el === marker || marker.contains(el)), owner: el ? (el.getAttribute("class") ?? el.tagName) : null };
}, sparkTileId);
console.log(`BELOW insideMarker=${below.insideMarker} owner=${below.owner}`);
ok("§D a point on the same tile below the marker is not the marker — no hit blanket over the map",
  below.found && !below.insideMarker, `owner=${below.owner}`);

/* §C — the click claims. Sleep past the band guard's window
 * first (a band closed within 300 ms swallows the claim by
 * the standing law — the drive stays clear of it). */
await sleep(700);
const clickPoint = probe.wordsHit ?? probe.faceHit;
ok("§C a clickable point on the marker was found", !!clickPoint);
if (clickPoint) {
  await page.mouse.click(clickPoint.x, clickPoint.y);
  // The animation is set when the claim's answer returns and
  // lives three seconds — poll for it rather than guessing
  // the round trip's length on a loaded box.
  let anim = null;
  for (let i = 0; i < 16 && !anim; i++) {
    await sleep(300);
    anim = await page.evaluate(() => {
      const el = document.querySelector(".spark-animation");
      return el ? (el.textContent ?? "").trim() : null;
    });
  }
  if (anim) await page.screenshot({ path: join(OUT, "spark-animation.png") }).catch(() => {});
  console.log(`CLAIM calls=${claimCalls.length} animation=${JSON.stringify(anim)}`);
  ok("§C clicking the marker sent the claimSpark call", claimCalls.length >= 1, `calls=${claimCalls.length}`);
  ok("§C the 'Fire found!' animation started", !!anim && anim.includes("Fire found"), `anim=${JSON.stringify(anim)}`);
  await sleep(2500);
  const dbAfter = {
    spark: db.prepare("SELECT spark FROM territory_tiles WHERE id = ?").get(sparkTileId)?.spark,
    fire: db.prepare("SELECT points FROM aspect_attunement WHERE owner_key = ? AND element = 'fire'").get(me)?.points,
  };
  console.log(`AFTER spark=${dbAfter.spark} firePoints=${dbAfter.fire}`);
  ok("§C the spark is spent in the ledger", dbAfter.spark === 0, `spark=${dbAfter.spark}`);
  ok("§C the fire attunement stands at 1", dbAfter.fire === 1, `fire=${dbAfter.fire}`);
  const markerGone = await page.evaluate((tileId) =>
    !document.querySelector(`.spark-claim-marker[data-tile-id="${tileId}"]`), sparkTileId);
  ok("§C the marker is gone from the refreshed land", markerGone);
  await page.screenshot({ path: join(OUT, "spark-claimed.png") }).catch(() => {});
}

await browser.close();
console.log(`drive-spark-claim-on-top: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
