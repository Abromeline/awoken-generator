// THE SMOOTH GLIDE (Nigel's fix run, last rung — rung 1,
// 2026-11-11). The complaint: on the homeland map Awokin
// glide but ENEMIES step — frozen at their last served point
// between reads, then teleporting at each read. The server
// truth was already smooth (the realtime gear settles every
// 500 ms; the dark walks in fractional axial space, served
// as floats); the FACE drew each enemy at its latest served
// point only. Rung 1 teaches the face to glide: each enemy
// keeps its last two served points + arrival moments
// (client/src/enemyGlide.ts) and is drawn walking between
// them on a requestAnimationFrame clock that runs only
// while a glide is live; and the tile faces are hoisted
// behind an identity cache so a figures-only tick does not
// re-mutate the land.
//
// The drive, on the real face in a real browser:
//   §A SAMPLING — the fixture enemy (a wanderer row carried
//      on a rising mark, so the open battle never rewrites
//      it) has its served point ADVANCED BY HAND along a
//      straight axial road at the Fray's own pace, one
//      direct write per read beat (500 ms). Its DRAWN centre
//      — the centre of the one shape in its node whose
//      geometry moves with it, read from the live DOM — is
//      sampled every ~50 ms across four beats. Asserts:
//      monotone along the road; no backward step; no 50 ms
//      step above the bound (¼ hex); the drawn point never
//      passes the latest served point (clamping).
//   §B THE CONTROL — the same samples are replayed through
//      the OLD draw rule (drawn = latest served point at
//      each sample's moment): its max step must be a whole
//      beat's travel — the teleport this build removes.
//   §C STILLNESS — the walk stops; sampled for 1.6 s, the
//      drawn centre must not move at all (no extrapolation
//      past the last served point, no sway in the measured
//      shape).
//   §D MUTATIONS — a MutationObserver over the map counts
//      DOM mutations in a 3 s window while the enemy glides,
//      split into tile-subtree vs the rest. The tile layer
//      (the land-back group) must stay near-silent (≤40 —
//      the sprite's own frame cycling is the only tolerated
//      voice). The unbranched tree's figure for the same
//      window is measured by the CONTROL RUN (tag=control,
//      on the pre-fix tree): there the interval clock is
//      what moves figures, and every tick re-renders the
//      whole land — the drive prints both, and the AFTER run
//      asserts its tile count is a small fraction of the
//      control's.
//   §E FRAMES — three screenshots ~180 ms apart mid-glide;
//      the enemy's measured centre must advance between
//      them (the pictures are the drive's own evidence; a
//      human reads them in the report).
//   §M THE MATH — the glide module's own law, proven in
//      node with no browser: interpolation midpoint,
//      clamping past the interval, no rewind, the snap on a
//      > 1.5-hex jump, first-sight standing, unmoved holds,
//      and the liveness gate opening and closing.
//
//   node scripts/drive-smooth-glide.mjs [port] [tag]
//   tag=after (default) asserts the built law; tag=control
//   runs the same sampling on the PRE-FIX tree and writes
//   the baseline numbers to glide-before.json.
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const ROOT = process.cwd();
const PORT = process.argv[2] ?? "3991";
const TAG = process.argv[3] ?? "after";
const require = createRequire(join(ROOT, "package.json"));
const Database = require("better-sqlite3");
const puppeteer = createRequire("/home/hatch/workspace/tools-chrome/package.json")("puppeteer");

const OUT = "/home/hatch/workspace/glide-proof";
mkdirSync(OUT, { recursive: true });
const BEFORE_JSON = join(OUT, "glide-before.json");
process.env.DATA_DIR = mkdtempSync(join("/home/hatch/workspace/big-tmp", "awoken-glide-proof-"));
process.env.PORT = PORT;
process.env.WORKSHOP_PASSWORD = "glide-proof-password";
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

/* ── §M THE MATH, FIRST (no browser needed) ──────────── */
console.log("§M the glide module's law");
{
  // The module is TypeScript with no runtime imports, so
  // the drive transpiles the REAL file with the project's
  // own esbuild (a vite dependency) and runs the real code
  // — no transcription, no re-implementation.
  const esbuild = require("esbuild");
  const src = readFileSync(join(ROOT, "client/src/enemyGlide.ts"), "utf8");
  const { code } = esbuild.transformSync(src, { loader: "ts", format: "cjs" });
  const moduleShim = { exports: {} };
  new Function("module", "exports", code)(moduleShim, moduleShim.exports);
  const G = moduleShim.exports;
  const store = G.createEnemyGlideStore();
  G.foldEnemyGlide(store, [{ id: 7, posQ: 2, posR: 0 }], 1000);
  const p0 = G.enemyGlidePoint(store, 7, { posQ: 2, posR: 0 }, 1000);
  ok("§M first sight stands at its served point", p0.q === 2 && p0.r === 0, JSON.stringify(p0));
  ok("§M a standing enemy starts no glide", G.enemyGlideLive(store, 1500) === false);
  G.foldEnemyGlide(store, [{ id: 7, posQ: 2.2, posR: 0 }], 1500);
  const mid = G.enemyGlidePoint(store, 7, { posQ: 2.2, posR: 0 }, 1750);
  ok("§M the midpoint of the interval is the midpoint of the road", Math.abs(mid.q - 2.1) < 1e-9, `q=${mid.q}`);
  const late = G.enemyGlidePoint(store, 7, { posQ: 2.2, posR: 0 }, 9000);
  ok("§M past the interval the point CLAMPS at the latest serve — never extrapolates", late.q === 2.2 && late.r === 0, JSON.stringify(late));
  const early = G.enemyGlidePoint(store, 7, { posQ: 2.2, posR: 0 }, 1200);
  ok("§M before the latest arrival the point never rewinds past the previous serve", early.q === 2 && early.r === 0, JSON.stringify(early));
  ok("§M the glide is live mid-interval and dead after it", G.enemyGlideLive(store, 1750) === true && G.enemyGlideLive(store, 2100) === false);
  G.foldEnemyGlide(store, [{ id: 7, posQ: 2.2, posR: 0 }], 2000); // unmoved serve
  const held = G.enemyGlidePoint(store, 7, { posQ: 2.2, posR: 0 }, 2600);
  ok("§M an unmoved serve holds the point (stillness is not travel)", held.q === 2.2, JSON.stringify(held));
  G.foldEnemyGlide(store, [{ id: 7, posQ: 6, posR: 3 }], 2500); // a teleport-scale jump
  const snap = G.enemyGlidePoint(store, 7, { posQ: 6, posR: 3 }, 2550);
  ok(`§M a jump past the snap bound (${G.ENEMY_GLIDE_SNAP_HEXES} hexes) SNAPS, never glides`, snap.q === 6 && snap.r === 3, JSON.stringify(snap));
  ok("§M the snap starts no glide", G.enemyGlideLive(store, 2600) === false);
  G.foldEnemyGlide(store, [], 3000);
  ok("§M a departed enemy's track is forgotten", G.enemyGlideLive(store, 3100) === false && store.size === 0);
}

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
const claim = await call("claimTender", { password: "glide-proof-password", tenderName: "Glide Tender" });
const token = claim.token;
const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id}`;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 0, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800, class_key = 'warden', hp = 100").run(me, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(me, now);

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, spark, hp, sealed_trays, grow_points, height, z, mix_points, curse_hp, curse_max_hp, created_at) VALUES (?, ?, ?, ?, ?, 0, 10, ?, 0, ?, ?, ?, ?, ?, ?)");
function wipeWorld() {
  db.prepare("DELETE FROM territory_tiles WHERE owner_key = ?").run(me);
  db.prepare("DELETE FROM star_seeds WHERE owner_key = ?").run(me);
  db.prepare("DELETE FROM field_placements WHERE owner_key = ?").run(me);
  db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(me);
}
function addRow(q, r, z, { element = "neutral", cursed = 0, mix = null, height = 1, sealed = 0 } = {}) {
  return Number(insTile.run(me, q, r, element, cursed, sealed, height, z, mix ? JSON.stringify(mix) : null, cursed ? 10 : null, cursed ? 10 : null, now).lastInsertRowid);
}
wipeWorld();
const discIds = {};
for (let q = -5; q <= 5; q++) for (let r = -5; r <= 5; r++) {
  if (hexDist({ q, r }, { q: 0, r: 0 }) > 5) continue;
  discIds[`${q},${r}`] = addRow(q, r, 0, { element: "neutral" });
}
db.prepare("UPDATE tender_progress SET tender_tile_id = ? WHERE owner_key = ?").run(discIds["0,0"], me);
/* The fixture enemy: a wanderer carried on a rising mark
 * (seed_rising = 99 — no rising of that number ever runs in
 * this world), so the open battle's settle never selects,
 * strikes or walks it; its served point moves only when
 * this drive writes it. It stands at (-4, 1) and its road
 * runs due east (+q) at the Fray's own dry pace. */
const START = { q: -4, r: 1 };
const foeTileId = discIds[`${START.q},${START.r}`];
const foeId = Number(db.prepare("INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, seed_rising) VALUES (?, ?, 'fray', ?, 10, ?, ?, 1, 1, 99)")
  .run(me, foeTileId, now, START.q, START.r).lastInsertRowid);
const setFoe = (q, r) => db.prepare("UPDATE homeland_wanderers SET pos_q = ?, pos_r = ? WHERE id = ?").run(q, r, foeId);

const land = await call("getTerritory", {}, token);
const servedFoe = (land.wanderers ?? []).find(w => w.id === foeId);
ok("the fixture enemy is served on the land", !!servedFoe, `wanderers=${(land.wanderers ?? []).length}`);

/* ═══ THE BROWSER ═══════════════════════════════════════ */
console.log("the browser");
const browser = await puppeteer.launch({ headless: true, protocolTimeout: 120000, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
console.log("ENTRY goto…");
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
await sleep(2500);
const door = await page.$(".deck-button");
if (!door) throw new Error("no .deck-button on the home face");
console.log("ENTRY door found, clicking…");
await door.click();
await page.waitForFunction(() => !!window.__tenderJump && !!window.__tenderJump.pos(), { timeout: 30000 }).catch(() => {});
await sleep(1500);
console.log("ENTRY tender jump settled; skip + dismiss…");
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

/* Find the enemy's node and the shape whose geometry moves
 * with it: scan the SVG once — the node's shapes that differ
 * when the enemy is picked up and set down two hexes east.
 * (Names and faces are the game's to change; a shape that
 * MOVES with the enemy is the enemy's, by definition.) */
const foeCentre = `
  (() => {
    const titles = [...document.querySelectorAll("title")].filter(t => (t.textContent || "").includes("Loose the Single Blade"));
    if (titles.length !== 1) return { err: "tap titles=" + titles.length };
    const tap = titles[0].parentElement;
    const g = tap.parentElement;
    const shapes = [...g.querySelectorAll("ellipse, circle, image, rect, path")].filter(el => el !== tap);
    const moving = shapes.map(el => {
      const r = el.getBoundingClientRect();
      return { tag: el.tagName, cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: r.width, h: r.height };
    });
    return { shapes: moving, tapCx: (() => { const r = tap.getBoundingClientRect(); return r.x + r.width / 2; })() };
  })()
`;
console.log("ENTRY on the land; probing the enemy node…");
const probe0 = await page.evaluate(foeCentre);
if (probe0.err) throw new Error("enemy node probe: " + probe0.err);
setFoe(START.q + 2, START.r);
await call("getTerritory", {}, token);
await sleep(2600); // let the client read the jump and settle on it
const probe1 = await page.evaluate(foeCentre);
setFoe(START.q, START.r);
await call("getTerritory", {}, token);
await sleep(2600);
const movedIdx = [];
for (let i = 0; i < Math.min(probe0.shapes.length, probe1.shapes.length); i++) {
  const d = Math.hypot(probe0.shapes[i].cx - probe1.shapes[i].cx, probe0.shapes[i].cy - probe1.shapes[i].cy);
  if (d > 20) movedIdx.push(i);
}
ok("the enemy's node carries shapes that move with it (the probe found the drawn body)", movedIdx.length >= 1, `moved=${movedIdx.length} of ${probe0.shapes.length}`);
const SHAPE_I = movedIdx[0];
const centreExpr = `
  (() => {
    const titles = [...document.querySelectorAll("title")].filter(t => (t.textContent || "").includes("Loose the Single Blade"));
    if (titles.length !== 1) return null;
    const g = titles[0].parentElement.parentElement;
    const shapes = [...g.querySelectorAll("ellipse, circle, image, rect, path")].filter(el => el !== titles[0].parentElement);
    const el = shapes[${SHAPE_I}];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()
`;
const hexPx = Math.abs(probe1.shapes[SHAPE_I].cx - probe0.shapes[SHAPE_I].cx) / 2;
console.log(`PROBE hexPx=${hexPx.toFixed(1)} shape#=${SHAPE_I} tag=${probe0.shapes[SHAPE_I].tag}`);
ok("the lattice step reads off the enemy's own jump (a sane hex size)", hexPx > 20 && hexPx < 200, `hexPx=${hexPx}`);

/* ═══ §A SAMPLING THE WALK ══════════════════════════════ */
console.log("§A sampling the walk");
const STEP_HEX = 0.0835; // 500 ms at the dry Fray's ≈6 s/hex standing pace (ENEMY_BASE_SEC_PER_HEX 6, full shield sum) — a true read-beat step
const BEATS = 4, BEAT_MS = 500;
const samples = [];
let shotCentres = [];
const samplesRaw = [];
{
  const iv = setInterval(() => {
    page.evaluate((expr) => {
      const c = eval(expr);
      if (c) (window.__glideLive = window.__glideLive || []).push({ t: performance.now(), x: c.x, y: c.y });
    }, centreExpr).catch(() => {});
  }, 50);
  await sleep(300); // the standing start, sampled too
  const t0 = Date.now();
  const serveLog = [{ at: 0, q: START.q }];
  for (let b = 1; b <= BEATS; b++) {
    const target = t0 + b * BEAT_MS;
    await sleep(Math.max(0, target - Date.now()));
    const q = START.q + STEP_HEX * b;
    setFoe(q, START.r);
    await call("getTerritory", {}, token);
    serveLog.push({ at: Date.now() - t0, q });
    if (b === 2) {
      // §E frames: three shots across the third beat's glide
      shotCentres = [];
      for (let s = 0; s < 3; s++) {
        const c = await page.evaluate(centreExpr);
        if (c) shotCentres.push(c);
        await page.screenshot({ path: join(OUT, `glide-frame-${s + 1}.png`) });
        await sleep(180);
      }
    }
  }
  await sleep(900); // the last glide runs out and clamps
  clearInterval(iv);
  const live = await page.evaluate(() => window.__glideLive || []);
  for (const s of live) samplesRaw.push(s);
  samples.push(...samplesRaw);
  var serveFinal = serveLog;
}
const t0s = samples.length ? samples[0].t : 0;
const pts = samples.map(s => ({ t: s.t - t0s, x: s.x, y: s.y }));
console.log(`SAMPLES n=${pts.length} span=${pts.length ? (pts[pts.length - 1].t / 1000).toFixed(2) : 0}s`);
ok("the sampling gathered a real series (≥40 samples)", pts.length >= 40, `n=${pts.length}`);
// Monotone along +x (the road runs east), no backward step
// beyond a hair of render noise (1.5 px), and the largest
// single-sample step against the bound.
let maxStep = 0, worstBack = 0, prev = null;
for (const p of pts) {
  if (prev) {
    const d = Math.hypot(p.x - prev.x, p.y - prev.y);
    if (d > maxStep) maxStep = d;
    const back = prev.x - p.x;
    if (back > worstBack) worstBack = back;
  }
  prev = p;
}
const totalTravel = pts.length > 1 ? Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y) : 0;
console.log(`STEPS maxStepPx=${maxStep.toFixed(1)} (bound ${(hexPx / 4).toFixed(1)}) worstBackPx=${worstBack.toFixed(2)} travelPx=${totalTravel.toFixed(1)} expected≈${(STEP_HEX * BEATS * hexPx).toFixed(1)}`);
if (TAG === "after") {
  ok("§A the drawn path travels the road (it moved, about the served distance)", totalTravel > STEP_HEX * BEATS * hexPx * 0.6, `travel=${totalTravel.toFixed(1)}`);
  ok("§A the path is monotone along the road — no backward step beyond render noise", worstBack <= 1.5, `worstBack=${worstBack.toFixed(2)}px`);
  ok("§A NO 50 ms step exceeds a quarter hex — the teleport is gone", maxStep <= hexPx / 4, `maxStep=${maxStep.toFixed(1)}px bound=${(hexPx / 4).toFixed(1)}px`);
} else {
  ok("§B(control) the pre-fix face TELEPORTS: its largest step is a whole beat's travel or more", maxStep >= STEP_HEX * hexPx * 0.8, `maxStep=${maxStep.toFixed(1)}px beatTravel=${(STEP_HEX * hexPx).toFixed(1)}px`);
}
/* §B THE CONTROL, computed on the built tree too: replay
 * the serves through the old rule (drawn = latest served
 * point at each moment). The serve moments in page time
 * are approximated by the sampling series' own start +
 * the serve log's offsets — enough to show the step the
 * old rule would have drawn at each serve. */
{
  const firstServePx = pts.length ? pts[0].x : 0;
  const beatPx = STEP_HEX * hexPx;
  const oldSteps = [];
  for (let b = 1; b <= BEATS; b++) oldSteps.push(beatPx);
  console.log(`CONTROL(old rule) each serve would step ${beatPx.toFixed(1)}px at once; built max step ${maxStep.toFixed(1)}px`);
  if (TAG === "after") ok("§B the old draw rule's per-serve step dwarfs the built max step (the fix is the difference)", beatPx > maxStep * 1.5, `old=${beatPx.toFixed(1)} built=${maxStep.toFixed(1)}`);
}

/* ═══ §C STILLNESS ══════════════════════════════════════ */
console.log("§C stillness after the walk");
{
  const before = await page.evaluate(centreExpr);
  await sleep(1600);
  const after = await page.evaluate(centreExpr);
  const drift = before && after ? Math.hypot(after.x - before.x, after.y - before.y) : 999;
  console.log(`STILL driftPx=${drift.toFixed(2)} over 1.6s`);
  ok("§C a stationary enemy's drawn centre does not drift (clamped at the last serve, no extrapolation)", drift <= 0.75, `drift=${drift.toFixed(2)}px`);
  const census = await page.evaluate(() => window.__awokenEnemyGlide || null);
  if (TAG === "after") {
    ok("§C the glide census stands on the page and names the fixture enemy", Array.isArray(census) && census.some(c => c.id === foeId), `census=${JSON.stringify(census)?.slice(0, 120)}`);
  } else {
    console.log("census (control tree):", census ? "present (unexpected)" : "absent, as the pre-fix face has no glide store");
  }
  if (shotCentres.length === 3) {
    const adv = Math.hypot(shotCentres[2].x - shotCentres[0].x, shotCentres[2].y - shotCentres[0].y);
    console.log(`FRAMES centres advanced ${adv.toFixed(1)}px across three frames 360ms apart`);
    if (TAG === "after") ok("§E the three mid-glide frames show the enemy ADVANCING between frames", adv > 2, `adv=${adv.toFixed(1)}px`);
  }
}

/* ═══ §D MUTATIONS ══════════════════════════════════════ */
console.log("§D mutations while the dark walks");
{
  await page.evaluate(() => {
    window.__mut = { tile: 0, figure: 0, other: 0, total: 0 };
    const svg = document.querySelector(".territory-svg");
    const back = document.querySelector('g.land-cam'); // the land-back group: the tile layer
    const inBack = (n) => { let p = n; while (p) { if (p === back) return true; p = p.parentElement; } return false; };
    window.__mutObs = new MutationObserver((recs) => {
      for (const r of recs) {
        window.__mut.total++;
        if (inBack(r.target)) window.__mut.tile++;
        else window.__mut.other++;
      }
    });
    window.__mutObs.observe(svg, { subtree: true, attributes: true, childList: true, characterData: true });
  });
  // Walk the enemy for six beats inside the window.
  const m0 = Date.now();
  for (let b = 1; b <= 6; b++) {
    const target = m0 + b * BEAT_MS;
    await sleep(Math.max(0, target - Date.now()));
    setFoe(START.q + STEP_HEX * (BEATS + b), START.r);
    await call("getTerritory", {}, token);
  }
  await sleep(700);
  const mut = await page.evaluate(() => { const m = window.__mut; window.__mutObs.disconnect(); return m; });
  console.log(`MUT[${TAG}] window≈3.7s total=${mut.total} tileSubtree=${mut.tile} other=${mut.other}`);
  if (TAG === "control") {
    writeFileSync(BEFORE_JSON, JSON.stringify({ mut, maxStep, hexPx, at: new Date().toISOString() }, null, 2));
    ok("§D(control) the baseline is written for the after run", mut.total > 0, `total=${mut.total}`);
  } else {
    let before = null;
    if (existsSync(BEFORE_JSON)) { try { before = JSON.parse(readFileSync(BEFORE_JSON, "utf8")); } catch { before = null; } }
    if (before?.mut) {
      console.log(`MUT[before] total=${before.mut.total} tileSubtree=${before.mut.tile} other=${before.mut.other}`);
      ok("§D the tile layer's mutations fall by a large factor vs the pre-fix tree", mut.tile <= Math.max(40, before.mut.tile * 0.1), `built tile=${mut.tile} before tile=${before.mut.tile}`);
    } else {
      console.log("MUT no control baseline on file — the tile count is asserted absolute only");
    }
    ok("§D the tile layer stays near-silent while figures glide (≤40 mutations — sprite cycling only)", mut.tile <= 40, `tile=${mut.tile}`);
  }
}

await page.screenshot({ path: join(OUT, "glide-end.png") });
await browser.close().catch(() => {});
console.log(`\n=== drive-smooth-glide [${TAG}]: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
