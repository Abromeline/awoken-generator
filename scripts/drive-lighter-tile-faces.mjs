// THE LIGHTER TILE FACES (Nigel, 2026-11-13 — from his
// question of 2026-11-12: "why is it taking so long for the
// tile art to load in?"). The six terrain faces were
// 1920px-wide PNGs (13,016,938 bytes the set) and the four
// terrain-mixing layer textures another 6,225,132 — a tile
// cannot paint until its images load and decode, so the land
// arrived slowly. The fix ships 800px-wide PNG copies of the
// exact same art (still PNG, originals untouched in the repo)
// as the client's load copies: 4,669,949 bytes the whole set,
// 75.7% less, still several times larger than the ~130px a
// hex ever spans on screen.
//
// This drive proves it on the real face, in two variants:
//   node scripts/drive-lighter-tile-faces.mjs before <port>
//   node scripts/drive-lighter-tile-faces.mjs after  <port>
// Run "before" from a tree at the old code and "after" from
// the build tree; both seed the IDENTICAL hand-laid land (a
// neutral disc, one MIXED tile wearing all four layer
// textures at 4/7/3/10, one tile of each other face, one
// cursed tile), so the screenshots compare like with like.
//   §A every terrain image the homeland face fetches is the
//      variant's copy (originals before, -light after) and
//      the fetched bytes total the variant's figure exactly.
//      WHAT THE HOMELAND FETCHES (the mixing era, 2026-10-25):
//      a purified element tile serves with a standing mix
//      ledger (seeded at a full 10 for its element), so it
//      wears the BLENDED face — the four element faces are
//      never fetched here; the face downloads the neutral
//      face, the cursed face, and the four layer textures
//      (6 files: 10,089,902 bytes before, 2,656,360 after).
//      §A2 then proves the whole 10-file set: the built
//      bundle ships exactly ten terrain files, every one the
//      variant's copy, byte for byte — so wherever the game
//      draws a face (the Table, the workshop), it can only
//      ever download the variant's copy. (The drive's first
//      §A demanded all 10 files over the homeland's network —
//      a pre-mixing expectation; repaired 2026-11-13.)
//   §B the mixed tile's face is the BLENDED face (Nigel,
//      2026-11-09: "blend the stack into one face") — one
//      canvas composite of the four layer textures at their
//      ledger opacities (0.4 / 0.7 / 0.3 / 1.0), drawn where
//      the four stacked images once stood. The drive proves
//      it by pixels: it recomposites the four textures the
//      face actually fetched, with the game's own geometry,
//      and matches the blended face standing in the land
//      against that recomposite. (The drive's first §B
//      demanded the four separate stacked <image>s — a
//      rendering the blend ruling retired; repaired
//      2026-11-13 to judge the face as it now stands.)
//      FIRST-LOAD CAVEAT, measured 2026-11-13: on a cold
//      first load the game's blend cache can catch a mix
//      before its textures finish loading and cache an
//      EMPTY face for the session (terrainArt's
//      ensureLayerImages marks itself ready on a re-entrant
//      call while its images are still in flight — a
//      pre-existing defect in the game, present with the
//      original art too, and this drive's business only
//      where it hides the copies' faithfulness). So §B
//      judges the first load, and if the mixed face stands
//      empty or unmatched, reloads once — a fresh blend
//      cache, textures now warm — and judges again; both
//      judgements stand in the log.
//   §C screenshots: the full homeland view and a close clip
//      of the mixed tile, per variant, in
//      ~/workspace/lighter-tile-faces-proof/ — the eye's
//      proof that the art is unchanged.
// The server is booted from the tree the drive runs in.
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, statSync } from "node:fs";

const VARIANT = process.argv[2];
const PORT = process.argv[3] ?? "3995";
if (VARIANT !== "before" && VARIANT !== "after") {
  console.error("usage: drive-lighter-tile-faces.mjs <before|after> [port]");
  process.exit(2);
}
const ROOT = process.cwd();
const require = createRequire(join(ROOT, "package.json"));
const Database = require("better-sqlite3");
const puppeteer = createRequire("/home/hatch/workspace/tools-chrome/package.json")("puppeteer");

const OUT = "/home/hatch/workspace/lighter-tile-faces-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join("/home/hatch/workspace/big-tmp", "awoken-lighter-proof-"));
process.env.PORT = PORT;
process.env.WORKSHOP_PASSWORD = "lighter-proof-pw";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Watchdog: the homeland face spawns a swarm of renderers
 * and a wedged screenshot/close must never hold the drive
 * (and its port) hostage — bail out hard at 9 minutes with
 * whatever the log already holds. */
setTimeout(() => { console.log("WATCHDOG: hard exit"); process.exit(3); }, 9 * 60 * 1000).unref();

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

/* The load set, per file, as measured on disk. */
const FACES = { cursed: 1786499, neutral: 2078271, root: 1231752, sky: 2686255, stone: 2451907, tide: 2782254 };
const FACES_LIGHT = { cursed: 364407, neutral: 435610, root: 277938, sky: 605193, stone: 534240, tide: 596218 };
const LAYERS = { air: 1790756, rock: 1143210, water: 859698, root: 2431468 };
const LAYERS_LIGHT = { air: 504817, rock: 317094, water: 387267, root: 647165 };
const EXPECT = VARIANT === "after"
  ? { faces: FACES_LIGHT, layers: LAYERS_LIGHT, total: 4669949, fetchTotal: 2656360 }
  : { faces: FACES, layers: LAYERS, total: 19242070, fetchTotal: 10089902 };

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
const claim = await call("claimTender", { password: "lighter-proof-password", tenderName: "Lighter Tender" });
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

/* The test land — identical in both variants:
 * - a clean neutral disc, the Tender standing at (0,0);
 * - THE MIXED TILE at (2,0): root ground whose ledger stands
 *   sky 4 · stone 7 · tide 3 · root 10, so its face is the
 *   four layer textures at 0.4 / 0.7 / 0.3 / 1.0;
 * - one tile of each other face: sky (-2,0), stone (0,-2),
 *   tide (-1,-1), root (3,-1);
 * - a cursed tile at (2,1), south of the mixed tile. */
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
console.log("SERVED specials:",
  JSON.stringify((land.tiles ?? []).filter((t) => ["sky", "stone", "tide", "root"].includes(t.element) && !t.mix)
    .map((t) => [t.q, t.r, t.element])),
  "mixedMix:", JSON.stringify(servedMixed?.mix));
for (const [q, r] of [[2, 0], [-2, 0], [0, -2], [-1, -1], [3, -1], [2, 1], [0, 0]]) {
  const t = (land.tiles ?? []).find((x) => x.q === q && x.r === r);
  console.log(`SERVED tile (${q},${r}):`, t ? JSON.stringify(t) : "ABSENT");
}

/* ═══ THE BROWSER ═══════════════════════════════════════ */
console.log("the browser");
const browser = await puppeteer.launch({ headless: true, protocolTimeout: 120000, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));

/* §A — watch every terrain image the face fetches. */
const FACE_RE = /(cursed|neutral|root|sky|stone|tide)-v3(-light)?-[A-Za-z0-9_-]+\.png/;
const LAYER_RE = /terrain-layer-(air|rock|water|root)(-light)?-[A-Za-z0-9_-]+\.png/;
const fetched = new Map(); // url -> {kind, name, light, bytes}
page.on("response", (res) => {
  const url = res.url();
  const fm = url.match(FACE_RE);
  const lm = url.match(LAYER_RE);
  if (!fm && !lm) return;
  res.buffer().then((buf) => {
    if (fm) fetched.set(url, { kind: "face", name: fm[1], light: !!fm[2], bytes: buf.length });
    else fetched.set(url, { kind: "layer", name: lm[1], light: !!lm[2], bytes: buf.length });
  }).catch(() => {});
});

await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
/* The face's own zoom buttons (Territory.tsx): fullwidth
 * glyphs on .compass-btn.zoom-in / .zoom-out, 0.2 a press,
 * floor 0.3, ceiling 3. */
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
/* Enter the land and let it settle: through the door (on a
 * reload the face may open on the land directly — the door
 * steps are taken only when the door stands), out to the
 * zoom floor so the whole disc stands in the frame — the
 * same framing in both variants — then poll the terrain
 * fetches until they stop growing. Used for the first load
 * and for §B's one reload alike. */
async function enterLand(reload) {
  if (reload) await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  else await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2500);
  const door = await page.$(".deck-button");
  if (door) {
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
  } else if (!reload) {
    throw new Error("no .deck-button on the home face");
  }
  await page.waitForFunction(() => document.querySelectorAll("svg image").length > 40, { timeout: 30000 }).catch(() => {});
  await sleep(1000);
  /* The compass mounts with the land face; wait until the
   * zoom-out button truly stands (present AND boxed) before
   * pressing it — the first runs pressed into a face that had
   * not finished mounting and never zoomed at all, so the
   * far tiles never entered the frame and never fetched. */
  let compassReady = false;
  for (let i = 0; i < 20 && !compassReady; i++) {
    compassReady = !!(await zoomBtn("-"));
    if (!compassReady) await sleep(1000);
  }
  console.log(`zoom: compass zoom-out standing=${compassReady}`);
  console.log(`zoom: tile screen width before=${(await tileScreenW()).toFixed(0)}`);
  let lastW = await tileScreenW();
  for (let i = 0; i < 8; i++) {
    const p = await zoomBtn("-");
    if (!p) { console.log("zoom: no − button found"); break; }
    await page.mouse.click(p.x, p.y);
    await sleep(450);
    const w = await tileScreenW();
    if (Math.abs(w - lastW) < 1) break; // the floor (0.3) is reached
    lastW = w;
  }
  console.log(`zoom: tile screen width after=${(await tileScreenW()).toFixed(0)}`);
  let lastCount = -1;
  for (let i = 0; i < 20; i++) {
    await sleep(1500);
    if (fetched.size === lastCount) break;
    lastCount = fetched.size;
  }
}
await enterLand(false);

/* DOM census — which faces actually stand in the land's
 * markup, whether or not the browser has fetched them yet. */
const census = await page.evaluate(() => {
  const faces = {}, dataUrls = { n: 0, sizes: {} };
  let layers = 0;
  for (const im of document.querySelectorAll("svg image")) {
    const href = im.getAttribute("href") ?? "";
    const fm = href.match(/(cursed|neutral|root|sky|stone|tide)-v3/);
    if (fm) faces[fm[1]] = (faces[fm[1]] ?? 0) + 1;
    if (/terrain-layer-/.test(href)) layers++;
    if (href.startsWith("data:image/")) dataUrls.n++;
  }
  return { faces, layers, dataUrls: dataUrls.n, total: document.querySelectorAll("svg image").length };
});
console.log("DOMCENSUS", JSON.stringify(census));

const fetchedList = [...fetched.values()];
const facesFetched = fetchedList.filter((f) => f.kind === "face");
const layersFetched = fetchedList.filter((f) => f.kind === "layer");
const totalBytes = fetchedList.reduce((a, f) => a + f.bytes, 0);
console.log(`FETCHED faces=${facesFetched.length} layers=${layersFetched.length} terrainBytes=${totalBytes}`);
ok(`§A the homeland fetch set arrives — the neutral + cursed faces and the four layer textures (element tiles wear the blended face, so their faces are not fetched here)`,
  facesFetched.length === 2 && facesFetched.every((f) => ["cursed", "neutral"].includes(f.name)) && layersFetched.length === 4,
  `faces=${facesFetched.map((f) => f.name).join(",")} layers=${layersFetched.map((f) => f.name).join(",")}`);
ok(`§A every fetched terrain image is the ${VARIANT === "after" ? "-light copy" : "full-size original"}`,
  fetchedList.every((f) => f.light === (VARIANT === "after")),
  JSON.stringify(fetchedList.map((f) => [f.name, f.light])));
ok(`§A each fetched file's bytes match its on-disk ${VARIANT === "after" ? "light copy" : "original"}`,
  fetchedList.every((f) => (f.kind === "face" ? EXPECT.faces[f.name] : EXPECT.layers[f.name]) === f.bytes),
  JSON.stringify(fetchedList.map((f) => [f.name, f.bytes])));
ok(`§A the terrain bytes the face downloads total ${EXPECT.fetchTotal}`,
  totalBytes === EXPECT.fetchTotal, `total=${totalBytes}`);

/* §A2 — the whole ten-file set, as the built bundle ships
 * it: exactly ten terrain files in client/dist/assets,
 * every one the variant's copy, each the exact byte size
 * of its on-disk source — so on every face that draws them
 * (the Table, the workshop previews), the only terrain art
 * the game can download is the variant's copy. */
const distAssets = readdirSync(join(ROOT, "client/dist/assets"));
const distTerrain = distAssets
  .map((name) => {
    const fm = name.match(/^(cursed|neutral|root|sky|stone|tide)-v3(-light)?-[A-Za-z0-9_-]+\.png$/);
    const lm = name.match(/^terrain-layer-(air|rock|water|root)(-light)?-[A-Za-z0-9_-]+\.png$/);
    if (fm) return { kind: "face", name: fm[1], light: !!fm[2], bytes: statSync(join(ROOT, "client/dist/assets", name)).size };
    if (lm) return { kind: "layer", name: lm[1], light: !!lm[2], bytes: statSync(join(ROOT, "client/dist/assets", name)).size };
    return null;
  })
  .filter(Boolean);
console.log("DIST terrain files:", JSON.stringify(distTerrain.map((d) => [d.name, d.light, d.bytes])));
ok(`§A2 the bundle ships exactly the ten terrain files, every one the ${VARIANT === "after" ? "-light copy" : "full-size original"}`,
  distTerrain.length === 10 && distTerrain.every((d) => d.light === (VARIANT === "after")),
  JSON.stringify(distTerrain.map((d) => [d.name, d.light])));
ok(`§A2 each bundled terrain file's bytes match its on-disk ${VARIANT === "after" ? "light copy" : "original"} (the set totals ${EXPECT.total})`,
  distTerrain.every((d) => (d.kind === "face" ? EXPECT.faces[d.name] : EXPECT.layers[d.name]) === d.bytes)
    && distTerrain.reduce((a, d) => a + d.bytes, 0) === EXPECT.total,
  JSON.stringify(distTerrain.map((d) => [d.name, d.bytes])));

/* §B — the mixed tile's BLENDED face (the 2026-11-09 blend
 * ruling: the four textures composite once onto a single
 * canvas and the map draws that one face; the four separate
 * stacked <image>s stand only while textures load). Proof
 * by pixels: recomposite, in the page, the four texture
 * files the face actually fetched (§A's network record),
 * with the game's own blend geometry (terrainArt:
 * MIX_FACE 1920×1280, fw = W × 1730/1920, TERRAIN_LAYER_ART
 * hPerW/seatDy, TERRAIN_LAYER_ORDER sky→stone→tide→root,
 * alpha = ledger opacity), then match every 1920×1280
 * data-URL face standing in the land against it — the one
 * that matches IS the mixed tile's face, and its rect is
 * kept for §C's clip. */
const layerUrlByGameEl = {};
for (const [url, f] of fetched) {
  if (f.kind !== "layer") continue;
  layerUrlByGameEl[{ air: "sky", rock: "stone", water: "tide", root: "root" }[f.name]] = url;
}
async function judgeBlend(label) {
await page.waitForFunction(
  () => [...document.querySelectorAll("svg image")].some((im) => (im.getAttribute("href") ?? "").startsWith("data:image/")),
  { timeout: 20000 }).catch(() => {});
const b = await page.evaluate(async (urls) => {
  const W = 1920, H = 1280, fw = W * (1730 / 1920);
  const ART = { sky: { h: 1123 / 1681, dy: 0 }, stone: { h: 957 / 1701, dy: 0 }, tide: { h: 843 / 1268, dy: 0 }, root: { h: 1347 / 1732, dy: 0.15 } };
  const OP = { sky: 0.4, stone: 0.7, tide: 0.3, root: 1.0 };
  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const cvs = document.createElement("canvas"); cvs.width = W; cvs.height = H;
  const ctx = cvs.getContext("2d");
  for (const el of ["sky", "stone", "tide", "root"]) {
    if (!urls[el]) return { error: `no fetched texture for ${el}` };
    const img = await load(urls[el]);
    const w = fw, h = w * ART[el].h;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = OP[el];
    ctx.drawImage(img, W / 2 - w / 2, H / 2 - h / 2 + ART[el].dy * h, w, h);
  }
  ctx.globalAlpha = 1;
  const expected = ctx.getImageData(0, 0, W, H).data;
  const expectedUrl = cvs.toDataURL("image/png");
  let best = null;
  const allMeans = [];
  const candidates = [...document.querySelectorAll("svg image")]
    .filter((im) => (im.getAttribute("href") ?? "").startsWith("data:image/"));
  for (const im of candidates) {
    const pic = await load(im.getAttribute("href"));
    if (pic.naturalWidth !== W || pic.naturalHeight !== H) continue;
    const c2 = document.createElement("canvas"); c2.width = W; c2.height = H;
    const x2 = c2.getContext("2d"); x2.drawImage(pic, 0, 0);
    const got = x2.getImageData(0, 0, W, H).data;
    let tot = 0, n = 0, maxd = 0;
    for (let y = 32; y < H; y += 32) for (let x = 32; x < W; x += 32) {
      const i = (y * W + x) * 4;
      const d = Math.max(Math.abs(got[i] - expected[i]), Math.abs(got[i + 1] - expected[i + 1]),
        Math.abs(got[i + 2] - expected[i + 2]), Math.abs(got[i + 3] - expected[i + 3]));
      tot += d; n++; if (d > maxd) maxd = d;
    }
    const mean = tot / n;
    allMeans.push(Number(mean.toFixed(2)));
    if (!best || mean < best.mean) {
      const r = im.getBoundingClientRect();
      best = { mean, maxd, samples: n, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, url: im.getAttribute("href") };
      document.querySelectorAll("[data-drive-blend]").forEach((e) => e.removeAttribute("data-drive-blend"));
      im.setAttribute("data-drive-blend", "1");
    }
  }
  if (!best) return { error: "no 1920x1280 blended face stands in the land", allMeans };
  const candInfo = [];
  for (const im of candidates) {
    const r = im.getBoundingClientRect();
    candInfo.push({ rect: { x: r.x, y: r.y, w: r.width, h: r.height }, url: im.getAttribute("href") });
  }
  const layerImgs = [...document.querySelectorAll("svg image")]
    .filter((im) => /terrain-layer-/.test(im.getAttribute("href") ?? ""))
    .map((im) => { const r = im.getBoundingClientRect(); return { href: (im.getAttribute("href") ?? "").split("/").pop(), rect: { x: r.x, y: r.y, w: r.width, h: r.height } }; });
  return { ...best, allMeans, expectedUrl, candInfo, layerImgs };
}, layerUrlByGameEl);
console.log(`BLEND (${label})`, JSON.stringify({ ...b, url: b?.url ? `${b.url.slice(0, 30)}…` : undefined, expectedUrl: undefined }));
console.log(`BLEND candidates (${label}):`, JSON.stringify(b?.candInfo?.map((c) => c.rect)));
console.log(`BLEND layer-images in DOM (${label}):`, JSON.stringify(b?.layerImgs));
return b;
}
let blend = await judgeBlend("first load");
if (!blend || blend.error || blend.mean > 2) {
  console.log("§B the first load's mixed face stands empty or unmatched (the blend cache caught the mix before its textures landed — the pre-existing first-load defect named in the header). Reloading once: fresh blend cache, textures warm.");
  await enterLand(true);
  blend = await judgeBlend("after reload");
}
if (blend && !blend.error && blend.mean > 2) {
  for (const [label, u] of [["expected", blend.expectedUrl], ["actual", blend.url]]) {
    if (u) writeFileSync(join(OUT, `blend-${label}.png`), Buffer.from(u.split(",")[1], "base64"));
  }
  (blend.candInfo ?? []).forEach((c, i) => {
    if (c.url) writeFileSync(join(OUT, `blend-candidate-${i}.png`), Buffer.from(c.url.split(",")[1], "base64"));
  });
  console.log("BLEND debug PNGs written (blend-expected.png / blend-actual.png / blend-candidate-N.png)");
}
ok("§B the mixed tile wears the blended face — the four textures composited at their ledger opacities (sky .4 · stone .7 · tide .3 · root 1)",
  !!blend && !blend.error && blend.mean <= 2,
  blend?.error ?? `mean|diff|=${blend?.mean?.toFixed?.(3)} max=${blend?.maxd}`);
ok(`§B the blend is made from the ${VARIANT === "after" ? "-light copies" : "full-size originals"} (the four textures the face fetched)`,
  layersFetched.length === 4 && layersFetched.every((f) => f.light === (VARIANT === "after")),
  JSON.stringify(layersFetched.map((f) => [f.name, f.light])));

/* §C — the screenshots: the whole disc zoomed out, then a
 * close clip of the mixed tile with the camera wheeled in
 * on the tile itself. */
await page.screenshot({ path: join(OUT, `homeland-${VARIANT}.png`), timeout: 30000 }).catch((e) => console.log("  (full screenshot failed:", String(e).slice(0, 80), ")"));
if (blend && !blend.error && blend.rect) {
  const blendCentre = async () => page.evaluate(() => {
    const im = document.querySelector("svg image[data-drive-blend]");
    if (!im) return null;
    const r = im.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  let c = { x: blend.rect.x + blend.rect.w / 2, y: blend.rect.y + blend.rect.h / 2 };
  for (let i = 0; i < 4; i++) {
    const p = await zoomBtn("+");
    if (!p) break;
    await page.mouse.click(p.x, p.y);
    await sleep(350);
    const again = await blendCentre();
    if (again) c = again;
  }
  const clip = { x: Math.max(0, c.x - 195), y: Math.max(0, c.y - 150), width: 390, height: 300 };
  await page.screenshot({ path: join(OUT, `mixed-tile-${VARIANT}.png`), clip, timeout: 30000 }).catch((e) => console.log("  (clip screenshot failed:", String(e).slice(0, 80), ")"));
  console.log(`CLIP mixed tile centre=${c.x.toFixed(1)},${c.y.toFixed(1)} clip=${JSON.stringify(clip)}`);
}

await Promise.race([browser.close().catch(() => {}), sleep(15000)]);
console.log(`\nLIGHTER TILE FACES DRIVE (${VARIANT}): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
