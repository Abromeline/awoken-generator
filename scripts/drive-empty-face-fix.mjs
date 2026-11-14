// THE EMPTY-FACE DEFECT (found by the lighter-tile-faces
// builder, 2026-11-13; Nigel's ruling the same day: "fix the
// empty-face defect as its own build").
//
// On a cold first load, the game's blend cache could catch a
// mixed tile before its layer textures finished loading and
// cache an EMPTY face for the whole session — the specials
// stood as dark hexes, matching the dark tiles in Nigel's own
// play screenshots. The mechanism, in client/src/terrainArt.ts:
// ensureLayerImages() records each layer Image in its table
// the moment the load STARTS; a second (re-entrant) call while
// the loads were still in flight found every image already in
// the table, counted nothing as pending, and declared the
// textures ready mid-flight. blendedMixFace() then composited
// over images that had not arrived (its draw loop skips any
// image not yet complete) and cached the empty canvas under
// the mix's signature — forever. The fix: readiness means the
// loads have SETTLED (a started-guard makes re-entrant calls
// change nothing), and blendedMixFace never caches a composite
// while a layer the mix calls for is still in flight.
//
// This drive forces the race deterministically: Puppeteer's
// request interception HOLDS every terrain-layer texture
// request while the homeland cold-loads and the map re-renders
// (zooming, ticks), then releases them with their real bytes.
//   node scripts/drive-empty-face-fix.mjs fixed   <port>
//   node scripts/drive-empty-face-fix.mjs control <port>
// Run "control" from an unmodified tree (origin/main) and
// "fixed" from the build tree; both seed the IDENTICAL land
// (a neutral disc; the mixed tile at (2,0) wearing sky 4 ·
// stone 7 · tide 3 · root 10; one tile of each element face,
// which also wear blended faces; a cursed tile).
//   control §1 during the hold, an EMPTY blended face stands
//              in the land (the race, caught and cached);
//          §2 after the textures are released and land, an
//              empty blended face STILL stands (the cache
//              holds it for the session). In this fixture
//              every mix is first rendered during the hold,
//              so all five faces stand empty — the assertion
//              asks only that the poisoned faces persist;
//              an earlier wording also demanded an unpoisoned
//              neighbour, which this fixture never produces
//              (repaired 2026-11-13 after the first run read
//              empty=5, nonEmpty=0 — the defect, whole).
//   fixed   §1 during the hold, NO empty blended face stands
//              (no composite is made from unloaded textures;
//              the four-image fallback stands in instead);
//          §2 after release, every blended face stands
//              NON-EMPTY, pixel-measured;
//          §3 the mixed tile's face pixel-matches a
//              recomposite of the four arrived textures at
//              their ledger opacities — the true face arrived,
//              unchanged in look.
// "control" exits 0 when the defect is DEMONSTRATED (§1+§2),
// "fixed" exits 0 when the fix holds (§1+§2+§3); either way
// the final line is the tally read from this log.
// The server is booted from the tree the drive runs in; the
// fixture database lives on /tmp (tmpfs), never under
// ~/workspace (the btrfs writeback stall wedges it there).
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";

process.env.PUPPETEER_CACHE_DIR ??= "/home/hatch/workspace/tools-chrome/.cache";

const MODE = process.argv[2];
const PORT = process.argv[3] ?? "3996";
if (MODE !== "fixed" && MODE !== "control") {
  console.error("usage: drive-empty-face-fix.mjs <fixed|control> [port]");
  process.exit(2);
}
const ROOT = process.cwd();
const require = createRequire(join(ROOT, "package.json"));
const Database = require("better-sqlite3");
const puppeteer = createRequire("/home/hatch/workspace/tools-chrome/package.json")("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-emptyface-"));
process.env.PORT = PORT;
process.env.WORKSHOP_PASSWORD = "emptyface-workshop-fixture";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Watchdog: a wedged page step must never hold the drive (and
 * its port) hostage — bail out hard at 9 minutes with whatever
 * the log already holds. */
setTimeout(() => { console.log("WATCHDOG: hard exit"); process.exit(3); }, 9 * 60 * 1000).unref();

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

/* ═══ THE FIXTURE — the lighter drive's land, verbatim ═══ */
const db = new Database(join(process.env.DATA_DIR, "app.db"));
const now = Date.now();
const claim = await call("claimTender", { password: "emptyface-proof-password", tenderName: "Emptyface Tender" });
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
function addRow(q, r, z, { element = "neutral", cursed = 0, mix = null } = {}) {
  return Number(insTile.run(me, q, r, element, cursed, 0, 0, 1, z, mix, cursed ? 10 : null, cursed ? 10 : null, now).lastInsertRowid);
}
const setStand = (tileId) => db.prepare("UPDATE tender_progress SET tender_tile_id = ? WHERE owner_key = ?").run(tileId, me);

wipeWorld();
const ids = {};
for (let q = -5; q <= 5; q++) for (let r = -5; r <= 5; r++) {
  if (hexDist({ q, r }, { q: 0, r: 0 }) > 5) continue;
  ids[`${q},${r}`] = addRow(q, r, 0, { element: "neutral" });
}
const replace = (q, r, opts) => {
  db.prepare("DELETE FROM territory_tiles WHERE owner_key = ? AND q = ? AND r = ? AND z = 0").run(me, q, r);
  return addRow(q, r, 0, opts);
};
const mixedId = replace(2, 0, { element: "root", mix: JSON.stringify({ sky: 4, stone: 7, tide: 3, root: 10 }) });
replace(-2, 0, { element: "sky" });
replace(0, -2, { element: "stone" });
replace(-1, -1, { element: "tide" });
replace(3, -1, { element: "root" });
replace(2, 1, { element: "neutral", cursed: 1 });
setStand(ids["0,0"]);

const land = await call("getTerritory", {}, token);
const servedMixed = (land.tiles ?? []).find((t) => t.id === mixedId);
ok("the served land carries the mixed tile with its ledger standing",
  !!servedMixed && !!servedMixed.mix && servedMixed.mix.root === 10 && servedMixed.mix.sky === 4,
  `mix=${JSON.stringify(servedMixed?.mix)}`);

/* ═══ THE BROWSER — layer textures HELD at the network ═══ */
console.log("the browser (layer textures held)");
const browser = await puppeteer.launch({ headless: true, protocolTimeout: 120000, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));

const LAYER_RE = /terrain-layer-(air|rock|water|root)-[A-Za-z0-9_-]+\.png/;
const held = [];
const heldUrls = new Set();
await page.setRequestInterception(true);
page.on("request", (req) => {
  const url = req.url();
  if (LAYER_RE.test(url)) { held.push(req); heldUrls.add(url); return; }
  req.continue().catch(() => {});
});

await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
const zoomBtn = async (sign) => {
  const sel = sign === "-" ? "button.compass-btn.zoom-out" : "button.compass-btn.zoom-in";
  const el = await page.$(sel);
  if (!el) return null;
  const box = await el.boundingBox();
  return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
};
const tileScreenW = async () => page.evaluate(() => {
  const im = [...document.querySelectorAll("svg image")].find((i) => /neutral-v3/.test(i.getAttribute("href") ?? ""));
  return im ? im.getBoundingClientRect().width : 0;
});

/* Enter the land (the lighter drive's door flow), then zoom
 * out to the floor so every tile stands and renders — the
 * renders during the hold are what force the race. */
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
await page.waitForFunction(() => document.querySelectorAll("svg image").length > 40, { timeout: 30000 }).catch(() => {});
await sleep(1000);
let compassReady = false;
for (let i = 0; i < 20 && !compassReady; i++) {
  compassReady = !!(await zoomBtn("-"));
  if (!compassReady) await sleep(1000);
}
let lastW = await tileScreenW();
for (let i = 0; i < 8; i++) {
  const p = await zoomBtn("-");
  if (!p) break;
  await page.mouse.click(p.x, p.y);
  await sleep(450);
  const w = await tileScreenW();
  if (Math.abs(w - lastW) < 1) break;
  lastW = w;
}
console.log(`entered the land; zoom floor reached (tile width ${lastW.toFixed(0)}); held layer requests so far: ${held.length}`);

/* The census: every blended face (a 1920×1280 data-URL image)
 * standing in the land, PIXEL-MEASURED — the fraction of
 * sampled pixels whose alpha stands above 8. An empty face
 * measures ~0; a true composite measures well above 0.05. */
async function census(label) {
  const c = await page.evaluate(async () => {
    const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const faces = [];
    let layerImgs = 0, dataOther = 0;
    for (const im of document.querySelectorAll("svg image")) {
      const href = im.getAttribute("href") ?? "";
      if (/terrain-layer-/.test(href)) layerImgs++;
      if (!href.startsWith("data:image/")) continue;
      const pic = await load(href).catch(() => null);
      if (!pic) continue;
      if (pic.naturalWidth !== 1920 || pic.naturalHeight !== 1280) { dataOther++; continue; }
      const cvs = document.createElement("canvas"); cvs.width = 1920; cvs.height = 1280;
      const x = cvs.getContext("2d"); x.drawImage(pic, 0, 0);
      const d = x.getImageData(0, 0, 1920, 1280).data;
      let opaque = 0, n = 0;
      for (let yy = 8; yy < 1280; yy += 8) for (let xx = 8; xx < 1920; xx += 8) {
        if (d[(yy * 1920 + xx) * 4 + 3] > 8) opaque++;
        n++;
      }
      faces.push({ len: href.length, opaqueFrac: Number((opaque / n).toFixed(4)) });
    }
    return { faces, layerImgs, dataOther };
  });
  console.log(`CENSUS (${label})`, JSON.stringify(c));
  return c;
}

/* THE HOLD — the land renders and re-renders (ticks, the
 * zoom's own repaints) while no layer texture can arrive. */
let holdCensus = null;
for (let i = 0; i < 4; i++) {
  await sleep(2500);
  holdCensus = await census(`hold ${(i + 1) * 2.5}s, held=${held.length}`);
}
ok("the hold truly held the layer textures (the game's four loads were intercepted)",
  heldUrls.size >= 4, `heldUrls=${heldUrls.size} heldRequests=${held.length}`);

const holdEmpty = (holdCensus?.faces ?? []).filter((f) => f.opaqueFrac <= 0.01);
const holdNonEmpty = (holdCensus?.faces ?? []).filter((f) => f.opaqueFrac > 0.05);
if (MODE === "control") {
  ok("§1 CONTROL: during the hold an EMPTY blended face stands in the land — the race caught the mix before its textures landed and cached the empty canvas",
    holdEmpty.length >= 1,
    `faces=${JSON.stringify(holdCensus?.faces)}`);
} else {
  ok("§1 FIXED: during the hold NO empty blended face stands in the land — no composite is made from textures that have not arrived",
    holdEmpty.length === 0,
    `faces=${JSON.stringify(holdCensus?.faces)}`);
  ok("§1 FIXED: while the textures are held the four-image fallback stands in (the map never waits on art)",
    (holdCensus?.layerImgs ?? 0) >= 4,
    `layerImgs=${holdCensus?.layerImgs}`);
}

/* RELEASE — answer every held request with its real bytes. */
const bytesByUrl = new Map();
async function releaseHeld() {
  const list = held.splice(0, held.length);
  for (const req of list) {
    try {
      const url = req.url();
      if (!bytesByUrl.has(url)) {
        const r = await fetch(url);
        bytesByUrl.set(url, Buffer.from(await r.arrayBuffer()));
      }
      await req.respond({ status: 200, contentType: "image/png", body: bytesByUrl.get(url) });
    } catch { /* the request died with a re-render — nothing left to answer */ }
  }
  return list.length;
}
const released = await releaseHeld();
console.log(`released ${released} held requests (${bytesByUrl.size} distinct layer textures)`);

/* SETTLE — poll until the face census stands still (or 40s). */
let finalCensus = null, lastKey = "";
for (let i = 0; i < 20; i++) {
  await sleep(2000);
  finalCensus = await census(`after release ${(i + 1) * 2}s`);
  const key = JSON.stringify((finalCensus?.faces ?? []).map((f) => f.len).sort());
  if (key === lastKey && i >= 3) break;
  lastKey = key;
}
/* Any straggler requests the release itself provoked get one
 * more answer, then a last look. */
const extra = await releaseHeld();
if (extra > 0) { await sleep(3000); finalCensus = await census("final, after stragglers answered"); }

const finalEmpty = (finalCensus?.faces ?? []).filter((f) => f.opaqueFrac <= 0.01);
const finalNonEmpty = (finalCensus?.faces ?? []).filter((f) => f.opaqueFrac > 0.05);
if (MODE === "control") {
  ok("§2 CONTROL: after the textures have landed, empty blended faces STILL stand — the poisoned cache holds them for the session",
    finalEmpty.length >= 1,
    `empty=${finalEmpty.length} nonEmpty=${finalNonEmpty.length} faces=${JSON.stringify(finalCensus?.faces)}`);
} else {
  ok("§2 FIXED: after the textures land, blended faces stand for the mixed land and EVERY one measures non-empty",
    (finalCensus?.faces.length ?? 0) >= 1 && finalEmpty.length === 0 && finalNonEmpty.length === (finalCensus?.faces.length ?? 0),
    `faces=${JSON.stringify(finalCensus?.faces)}`);

  /* §3 — the mixed tile's true face: recomposite the four
   * arrived textures with the game's own blend geometry
   * (terrainArt: MIX_FACE 1920×1280, fw = W × 1730/1920,
   * TERRAIN_LAYER_ART hPerW/seatDy, order sky→stone→tide→root,
   * alpha = ledger opacity) and match the standing faces
   * against it, pixel by pixel (the lighter drive's method). */
  const layerUrlByGameEl = {};
  for (const url of heldUrls) {
    const m = url.match(/terrain-layer-(air|rock|water|root)-/);
    if (m) layerUrlByGameEl[{ air: "sky", rock: "stone", water: "tide", root: "root" }[m[1]]] = url;
  }
  const match = await page.evaluate(async (urls) => {
    const W = 1920, H = 1280, fw = W * (1730 / 1920);
    const ART = { sky: { h: 1123 / 1681, dy: 0 }, stone: { h: 957 / 1701, dy: 0 }, tide: { h: 843 / 1268, dy: 0 }, root: { h: 1347 / 1732, dy: 0.15 } };
    const OP = { sky: 0.4, stone: 0.7, tide: 0.3, root: 1.0 };
    const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const cvs = document.createElement("canvas"); cvs.width = W; cvs.height = H;
    const ctx = cvs.getContext("2d");
    for (const el of ["sky", "stone", "tide", "root"]) {
      if (!urls[el]) return { error: `no arrived texture for ${el}` };
      const img = await load(urls[el]);
      const w = fw, h = w * ART[el].h;
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = OP[el];
      ctx.drawImage(img, W / 2 - w / 2, H / 2 - h / 2 + ART[el].dy * h, w, h);
    }
    ctx.globalAlpha = 1;
    const expected = ctx.getImageData(0, 0, W, H).data;
    let best = null;
    for (const im of document.querySelectorAll("svg image")) {
      const href = im.getAttribute("href") ?? "";
      if (!href.startsWith("data:image/")) continue;
      const pic = await load(href).catch(() => null);
      if (!pic || pic.naturalWidth !== W || pic.naturalHeight !== H) continue;
      const c2 = document.createElement("canvas"); c2.width = W; c2.height = H;
      const x2 = c2.getContext("2d"); x2.drawImage(pic, 0, 0);
      const got = x2.getImageData(0, 0, W, H).data;
      let tot = 0, n = 0;
      for (let y = 32; y < H; y += 32) for (let x = 32; x < W; x += 32) {
        const i = (y * W + x) * 4;
        tot += Math.max(Math.abs(got[i] - expected[i]), Math.abs(got[i + 1] - expected[i + 1]),
          Math.abs(got[i + 2] - expected[i + 2]), Math.abs(got[i + 3] - expected[i + 3]));
        n++;
      }
      const mean = tot / n;
      if (!best || mean < best.mean) best = { mean: Number(mean.toFixed(3)) };
    }
    return best ?? { error: "no blended face stands in the land" };
  }, layerUrlByGameEl);
  console.log("RECOMPOSITE MATCH", JSON.stringify(match));
  ok("§3 FIXED: the mixed tile's standing face pixel-matches the recomposite of the four arrived textures at their ledger opacities (sky .4 · stone .7 · tide .3 · root 1) — the true face arrived, unchanged in look",
    !!match && !match.error && match.mean <= 2,
    match?.error ?? `mean|diff|=${match?.mean}`);
}

await Promise.race([browser.close().catch(() => {}), sleep(15000)]);
console.log(`\nEMPTY-FACE DRIVE (${MODE}): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
