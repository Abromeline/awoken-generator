// THE CURSED GLOW IS THE HEX'S OWN SHAPE — THIS BUILD'S DRIVE
// (Nigel, 2026-11-15: the cursed glow he asked for long ago was
// built as "a flowing translucent oval over them" — the halo
// ellipse and the drifting mist-wisp ovals. "I meant for the
// glow from the hexed tile to be the full shape of the hex as
// if the hex is glowing and it fades vertically." Amendment,
// same night: "slight bleed past the rim for the cursed glow
// is ok. but slightly, and fading.")
//
// Boots the real server on a scratch DATA_DIR and the real
// built client in headless Chrome, on a seeded land (a
// radius-5 clean disc, a 7-hex cursed flower centred (-4,-1),
// a fallen seed at (3,1), the Tender standing at (0,0)). It
// proves the glow's shape by DIFFERENTIAL pixel measurement:
// one screenshot with the glow standing, one with every
// .corruption-glow group hidden — the per-point red-channel
// lift between them is the glow itself, with the land, the
// dusk and its relief cancelling out.
//   §1 every served cursed tile wears exactly one
//      gradient-filled fitted cell + two bleed rings in its
//      corruption-glow group, and no halo/wisp oval remains
//      anywhere on the face.
//   §2 the glow covers the hex's full footprint, corners
//      included (points at 88% of the way to each vertex).
//   §3 along the hex's centre column the lift falls
//      monotonically from base to top, and the top sample is
//      a whisper of the base sample.
//   §4 two cursed neighbours agree: the agreement is
//      proven in TILE SPACE (each tile's centre column at
//      matched heights — the same art at the same relative
//      place, so the art cannot speak for one tile against
//      the other) and by construction (congruent polygons,
//      the one gradient). A rim-side pixel comparison is
//      NOT honest evidence here: the red lift reads
//      alpha × (glow red − art red), and the cursed face's
//      own ink is bright red at some rims and dark at
//      others, so two mirrored rim points can read far
//      apart under identical glow. The first run of this
//      drive measured exactly that artefact and it is
//      recorded in the build report.
//   §5 the bleed: outside the rim, over the clean
//      neighbour's grey face (where the art cannot
//      confound), the spill is present in the first ring,
//      weaker in the second, and zero beyond its reach
//      (the rings end at the cell's 1.08 scaling — 8% of
//      the centre-to-rim distance past the rim); that it
//      is weaker than the glow inside at the same height
//      is proven by construction — the rings wear the same
//      gradient at half and quarter strength (the DOM
//      opacities), never the full strength of the cell.
// Screenshots land in ~/workspace/cursed-glow-proof/.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-cursed-glow.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";

const ROOT = process.cwd();
const PORT = "3993";
const require = createRequire(join(ROOT, "package.json"));
const Database = require("better-sqlite3");
const puppeteer = createRequire("/home/hatch/workspace/tools-chrome/package.json")("puppeteer");

const OUT = "/home/hatch/workspace/cursed-glow-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-cursed-glow-"));
process.env.PORT = PORT;
process.env.WORKSHOP_PASSWORD = "cursed-glow-password";
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

async function call(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return data?.data ?? data;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
const now = Date.now();
const claim = await call("claimTender", { password: "cursed-glow-password", tenderName: "Glow Tender" });
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
db.prepare("DELETE FROM territory_tiles WHERE owner_key = ? AND q = 3 AND r = 1").run(me);
const beaconTileId = addRow(3, 1, 0, { element: "neutral" });
db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at, defenses, fed_energy) VALUES (?, ?, 3, 'fallen', ?, 0, 0)").run(me, beaconTileId, now);
const cursedAt = (q, r, z = 0) => {
  db.prepare("DELETE FROM territory_tiles WHERE owner_key = ? AND q = ? AND r = ? AND z = ?").run(me, q, r, z);
  return addRow(q, r, z, { element: "neutral", cursed: 1 });
};
const FLOWER = [[-4, -1], [-5, -1], [-3, -1], [-4, -2], [-4, 0], [-5, 0], [-3, -2]];
for (const [q, r] of FLOWER) cursedAt(q, r);
db.prepare("UPDATE tender_progress SET tender_tile_id = ? WHERE owner_key = ?").run(discIds["0,0"], me);

const served = await call("getTerritory", {}, token);
const servedCursed = (served.tiles ?? []).filter((t) => t.cursed);
ok("the served land carries the cursed flower", servedCursed.length >= 7, `cursed=${servedCursed.length}`);

/* ══ OPEN THE LAND ════════════════════════════════════════ */
const browser = await puppeteer.launch({ headless: true, protocolTimeout: 300000, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:cursed-glow]", String(e).slice(0, 200)));
await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
await sleep(2500);
/* Clicks are dispatched in-page throughout this drive:
 * puppeteer's own click waits on the browser's input queue,
 * and on this shared machine that queue starves (the
 * cursed-light drive's lesson, learned the same way). */
const doorStood = await page.evaluate(() => {
  const d = document.querySelector(".deck-button");
  if (!d) return false;
  d.click();
  return true;
});
if (!doorStood) throw new Error("no .deck-button on the home face");
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
  await page.evaluate(() => {
    const el = document.elementFromPoint(24, 24);
    if (el) el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }).catch(() => {});
  await sleep(300);
}
await page.evaluate(() => {
  const p = document.querySelector(".admin-popup");
  if (p) p.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "×").forEach((b) => b.click());
});
await sleep(3500);
/* Framing is settled adaptively below, once the lattice is
 * solved: the land opens at zoom 1, and the drive only rides
 * the map's own zoom-out if the flower does not stand whole
 * in the frame at that size. */
await sleep(1500);

/* ══ THE LATTICE (the click-info drive's solver, verbatim
 * in method): served tiles → screen centres, read off the
 * hit polygons' own geometry. ════════════════════════════ */
const tilesArg = (served.tiles ?? []).map((t) => ({ id: t.id, q: t.q, r: t.r, cursed: !!t.cursed }));
const tileIdByQR = new Map((served.tiles ?? []).map((t) => [`${t.q},${t.r},${t.z ?? 0}`, t.id]));
const solveLattice = async () => page.evaluate((tiles) => {
  const polys = [...document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]')];
  const cents = polys.map((p) => {
    const pts = (p.getAttribute("points") ?? "").trim().split(/\s+/).map((s) => s.split(",").map(Number));
    return { x: pts.reduce((a, pt) => a + pt[0], 0) / pts.length, y: pts.reduce((a, pt) => a + pt[1], 0) / pts.length };
  });
  if (!cents.length) return { error: "no hit polygons on the face" };
  /* The hit layer's spacing scales with the camera zoom, so
   * the basis size is estimated from the centroids
   * themselves: the shortest lattice step is |V| = 948·54/796
   * at zoom 1, and the median nearest-neighbour distance
   * among the centroids reads it at the standing zoom. A few
   * refinement sizes around the estimate settle the fit. */
  const stepV = 948 * 54 / 796;
  const mins = cents.slice(0, 60).map((c) => {
    let m = Infinity;
    for (const o of cents) {
      if (o === c) continue;
      const d = Math.hypot(o.x - c.x, o.y - c.y);
      if (d > 5 && d < m) m = d;
    }
    return m;
  }).filter((m) => isFinite(m)).sort((a, b) => a - b);
  const zoomEst = mins.length ? mins[Math.floor(mins.length / 2)] / stepV : 1;
  const fit = (size) => {
    const U = [1292 * size / 796, 470 * size / 796], V = [0, 948 * size / 796];
    const score = (ox, oy) => {
      let h = 0;
      for (const t of tiles) {
        const ex = ox + t.q * U[0] + t.r * V[0], ey = oy + t.q * U[1] + t.r * V[1];
        if (cents.some((o) => Math.abs(o.x - ex) < 3 && Math.abs(o.y - ey) < 3)) h++;
      }
      return h;
    };
    let best = null;
    for (const c of cents) { const h = score(c.x, c.y); if (!best || h > best.hits) best = { ox: c.x, oy: c.y, hits: h }; }
    for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) {
      if (!a && !b) continue;
      const ox = best.ox + a * U[0] + b * V[0], oy = best.oy + a * U[1] + b * V[1];
      const h = score(ox, oy);
      if (h > best.hits) best = { ox, oy, hits: h };
    }
    if (!best || best.hits < tiles.length) return { hits: best?.hits ?? 0 };
    const svg = document.querySelector("svg.territory-svg");
    const ctm = svg.getScreenCTM();
    const toClient = (sx, sy) => {
      const pt = new DOMPoint(sx, sy).matrixTransform(ctm);
      return { x: pt.x, y: pt.y };
    };
    const out = {};
    for (const t of tiles) {
      const sx = best.ox + t.q * U[0] + t.r * V[0], sy = best.oy + t.q * U[1] + t.r * V[1];
      out[t.id] = { svg: { x: sx, y: sy }, client: toClient(sx, sy) };
    }
    return { hits: best.hits, points: out, count: tiles.length };
  };
  let solved = null;
  for (const f of [1, 0.97, 1.03, 0.94, 1.06, 0.9, 1.1]) {
    const r = fit(54 * zoomEst * f);
    if (!solved || (r.hits ?? 0) > (solved.hits ?? 0)) solved = r;
    if (r.points) break;
  }
  if (!solved?.points) return { error: `lattice fit: ${solved?.hits ?? 0}/${tiles.length} (zoomEst ${zoomEst.toFixed(3)})` };
  return { points: solved.points, count: solved.count };
}, tilesArg);
let lattice = await solveLattice();
ok("the land lattice is solved", !lattice.error && lattice.count === tilesArg.length, JSON.stringify(lattice.error ?? lattice.count));
const centreOf = (q, r) => lattice.points[tileIdByQR.get(`${q},${r},0`)].client;

/* ══ THE GLOW'S OWN GEOMETRY, FROM THE DOM ════════════════
 * Each .corruption-glow polygon's screen vertices (its own
 * getScreenCTM carries every camera transform), matched to
 * its tile by nearest lattice centre. */
const readGlowGeo = () => page.evaluate(() => {
  const groups = [...document.querySelectorAll("svg.territory-svg .corruption-glow")];
  const ovals = [...document.querySelectorAll("svg.territory-svg ellipse")]
    .filter((e) => e.getAttribute("fill") === "url(#corruptionHalo)" || e.classList.contains("mist-wisp")).length;
  const tiles = groups.map((g) => {
    const poly = g.querySelector("polygon");
    const rings = g.querySelectorAll("path").length;
    if (!poly) return { rings, verts: null, centroid: null };
    const m = poly.getScreenCTM();
    const verts = [];
    for (let i = 0; i < poly.points.numberOfItems; i++) {
      const p = poly.points.getItem(i);
      const sp = new DOMPoint(p.x, p.y).matrixTransform(m);
      verts.push({ x: sp.x, y: sp.y });
    }
    const centroid = verts.reduce((a, v) => ({ x: a.x + v.x / verts.length, y: a.y + v.y / verts.length }), { x: 0, y: 0 });
    return { rings, fill: poly.getAttribute("fill"), verts, centroid };
  });
  return { groups: groups.length, ovals, tiles, vw: window.innerWidth, vh: window.innerHeight };
});
const matchIn = (geo, q, r) => {
  const c = centreOf(q, r);
  let bestG = null, bestD = Infinity;
  for (const g of geo.tiles) {
    if (!g.centroid) continue;
    const d = Math.hypot(g.centroid.x - c.x, g.centroid.y - c.y);
    if (d < bestD) { bestD = d; bestG = g; }
  }
  return { g: bestG, d: bestD, centre: c };
};
/* Framing: accept the first framing (zoom 1, then one
 * zoom-out at a time) where the flower's heart and its
 * eastern neighbour stand whole in the frame with the hex
 * at a size the pixel stations can read (radius ≥ 40px). */
let glowGeo = null, centreTile = null, eastTile = null, bleedTile = null;
for (let clicks = 0; clicks <= 3; clicks++) {
  if (lattice.error) break;
  glowGeo = await readGlowGeo();
  centreTile = matchIn(glowGeo, -4, -1);
  eastTile = matchIn(glowGeo, -3, -1);
  bleedTile = eastTile;
  const rad = centreTile.g?.verts
    ? Math.max(...centreTile.g.verts.map((v) => Math.hypot(v.x - centreTile.g.centroid.x, v.y - centreTile.g.centroid.y)))
    : 0;
  const fits = (m) => !!m.g && m.d < 6
    && m.g.centroid.x > rad * 1.4 && m.g.centroid.x < glowGeo.vw - rad * 1.4
    && m.g.centroid.y > rad * 1.4 && m.g.centroid.y < glowGeo.vh - rad * 1.4;
  console.log(`FRAME clicks=${clicks} radius=${rad.toFixed(1)}px centre=(${centreTile.g?.centroid.x.toFixed(0)},${centreTile.g?.centroid.y.toFixed(0)})`);
  if (rad >= 40 && fits(centreTile) && fits(eastTile)) break;
  if (clicks === 3) break;
  await page.evaluate(() => {
    const b = document.querySelector(".compass-btn.zoom-out");
    if (b) b.click();
  }).catch(() => {});
  await sleep(1500);
  lattice = await solveLattice();
}
if (!glowGeo || !centreTile?.g || !eastTile?.g) {
  console.log(`drive-cursed-glow: ${pass} passed, ${fail + 1} failed (framing failed)`);
  await browser.close();
  process.exit(1);
}
console.log(`GLOW groups=${glowGeo.groups} ovals=${glowGeo.ovals} centreMatch=${centreTile.d?.toFixed(1)}px`);
ok("§1 every served cursed tile wears a corruption-glow group",
  glowGeo.groups === servedCursed.length, `groups=${glowGeo.groups} cursed=${servedCursed.length}`);
ok("§1 each glow group is one gradient-filled fitted cell + two bleed rings",
  glowGeo.tiles.every((g) => g.fill === "url(#cursedGlowFade)" && g.rings === 2 && g.verts?.length === 6),
  JSON.stringify(glowGeo.tiles.slice(0, 3).map((g) => ({ fill: g.fill, rings: g.rings, verts: g.verts?.length }))));
ok("§1 no halo ellipse and no mist wisp remains anywhere on the face",
  glowGeo.ovals === 0, `ovals=${glowGeo.ovals}`);
ok("the flower's tiles are matched to their glow polygons",
  centreTile.d < 6 && eastTile.d < 6, `centre=${centreTile.d?.toFixed(1)} east=${eastTile.d?.toFixed(1)}`);

/* ══ TWO SCREENSHOTS: GLOW STANDING, GLOW HIDDEN ══════════
 * The differential pair. The pulse animation is uniform
 * across groups (no per-tile delay), so one instant reads
 * every hex at the same strength; the hidden shot is the
 * control, where the phase cannot speak at all. */
/* The lesson popups that stand over the land are set down
 * before the pair (they would otherwise cover the flower
 * in the screenshot kept for Nigel's eye). */
await page.evaluate(() => {
  [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "×").forEach((b) => b.click());
});
await sleep(400);
/* Let the camera come fully to rest before the pair: the
 * differential is only honest if nothing but the glow
 * changes between the two shots. */
await sleep(1500);
await page.screenshot({ path: join(OUT, "cursed-glow-full-2026-11-15.png") });
{
  const box = centreTile.g.verts.reduce((a, v) => ({
    minX: Math.min(a.minX, v.x), maxX: Math.max(a.maxX, v.x),
    minY: Math.min(a.minY, v.y), maxY: Math.max(a.maxY, v.y),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const step = Math.hypot(centreOf(-3, -1).x - centreOf(-4, -1).x, centreOf(-3, -1).y - centreOf(-4, -1).y);
  const clip = {
    x: Math.max(0, box.minX - step * 1.7), y: Math.max(0, box.minY - step * 1.2),
    width: step * 3.4, height: step * 2.6,
  };
  await page.screenshot({ path: join(OUT, "cursed-glow-hex-shape-2026-11-15.png"), clip });
}
const shotOn = await page.screenshot({ encoding: "base64" });
await page.evaluate(() => {
  document.querySelectorAll("svg.territory-svg .corruption-glow")
    .forEach((g) => g.setAttribute("style", "display:none"));
});
await sleep(200);
const shotOff = await page.screenshot({ encoding: "base64" });
await page.evaluate(() => {
  document.querySelectorAll("svg.territory-svg .corruption-glow")
    .forEach((g) => g.removeAttribute("style"));
});

/* Point sampling across both shots, decoded once in a blank
 * page (the map's own thread never sits still). The signal
 * is the RED lift: the one curse colour #940e34 speaks
 * loudest in red, and the dusk, the relief and the land
 * cancel in the difference. */
async function samplePoints(points) {
  const blank = await browser.newPage();
  try {
    return await blank.evaluate(async (on, off, pts) => {
      const load = (b64) => new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = "data:image/png;base64," + b64;
      });
      const [imgOn, imgOff] = [await load(on), await load(off)];
      const grab = (img) => {
        const cv = document.createElement("canvas");
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const ctx = cv.getContext("2d");
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, cv.width, cv.height);
      };
      const dOn = grab(imgOn), dOff = grab(imgOff);
      const at = (d, x, y) => {
        // a 3×3 mean steadies antialiasing and the pulse grain
        let r = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.round(x + dx), yy = Math.round(y + dy);
          if (xx < 0 || yy < 0 || xx >= d.width || yy >= d.height) continue;
          r += d.data[(yy * d.width + xx) * 4]; n++;
        }
        return n ? r / n : 0;
      };
      return pts.map((p) => ({ name: p.name, lift: at(dOn, p.x, p.y) - at(dOff, p.x, p.y) }));
    }, shotOn, shotOff, points);
  } finally {
    await blank.close().catch(() => {});
  }
}
const V = centreTile.g.verts;
const C = centreTile.g.centroid;
const topY = Math.min(...V.map((v) => v.y)), baseY = Math.max(...V.map((v) => v.y));
const rDist = Math.max(...V.map((v) => Math.hypot(v.x - C.x, v.y - C.y)));
console.log(`HEX centre=(${C.x.toFixed(0)},${C.y.toFixed(0)}) height=${(baseY - topY).toFixed(1)}px centreToVertex=${rDist.toFixed(1)}px`);

/* §2 — the footprint, corners included. The fitted face's
 * vertices run TL, TR, R, BR, BL, L: the side and bottom
 * corners must carry the glow (that is the hex shape the
 * oval never had), and the two top corners must carry the
 * fade's top — a whisper — because the same shape dies at
 * the top (that is the vertical fade a flat hex fill would
 * fail). */
const cornerPts = V.map((v, i) => ({
  name: `corner${i}`,
  x: C.x + (v.x - C.x) * 0.88, y: C.y + (v.y - C.y) * 0.88,
}));
const cornerRes = await samplePoints([...cornerPts, { name: "centre", x: C.x, y: C.y }]);
const cLift = (i) => cornerRes.find((p) => p.name === `corner${i}`).lift;
const lowerMin = Math.min(cLift(2), cLift(3), cLift(4), cLift(5));
const topMax = Math.max(cLift(0), cLift(1));
console.log("  §2 lifts:", cornerRes.map((p) => `${p.name}=${p.lift.toFixed(1)}`).join(" "));
ok("§2 the glow stands across the whole footprint — the side and bottom corners and the centre carry it",
  lowerMin >= 5 && cornerRes.find((p) => p.name === "centre").lift >= 5,
  `lowerMin=${lowerMin.toFixed(1)}`);
ok("§2 the top corners carry only the fade's whisper (the shape dies at the top, as ruled)",
  topMax <= Math.max(3.5, 0.3 * Math.min(cLift(3), cLift(4))),
  `topMax=${topMax.toFixed(1)} bottom=${Math.min(cLift(3), cLift(4)).toFixed(1)}`);

/* §3 — the vertical fade along the centre column */
const heights = [0.06, 0.2, 0.34, 0.5, 0.66, 0.8, 0.93];
const colRes = await samplePoints(heights.map((h) => ({
  name: `h${h}`, x: C.x, y: baseY - h * (baseY - topY),
})));
const colLifts = colRes.map((p) => p.lift);
let monotone = true;
for (let i = 1; i < colLifts.length; i++) if (colLifts[i] > colLifts[i - 1] + 3) monotone = false;
console.log("  §3 lifts base→top:", colLifts.map((l) => l.toFixed(1)).join(" → "));
ok("§3 the lift falls monotonically from the hex's base to its top",
  monotone && colLifts[0] >= 10, JSON.stringify(colLifts.map((l) => +l.toFixed(1))));
ok("§3 at the top the glow has faded to a whisper of its base",
  colLifts[colLifts.length - 1] <= 0.3 * colLifts[0],
  `top=${colLifts[colLifts.length - 1].toFixed(1)} base=${colLifts[0].toFixed(1)}`);

/* §4 — the eastern neighbour: agreement by construction
 * and in tile space. Construction: the two glow polygons
 * are congruent (the neighbour's vertices are this tile's,
 * stepped by the lattice step between their centres), wear
 * the one gradient, and the gradient is read in each hex's
 * own bounding space — so at any height the two hexes'
 * glow alpha is the same number, on both sides of their
 * shared edge, by the way the thing is built. Tile space:
 * each tile's centre column at matched heights must then
 * read the same lift, the art being the same art at the
 * same relative place on both tiles. */
const sharedVerts = [];
for (const v of V) for (const w of eastTile.g.verts) {
  if (Math.hypot(v.x - w.x, v.y - w.y) < 3) sharedVerts.push(v);
}
ok("§4 the two glow polygons share an edge (two common vertices)",
  sharedVerts.length === 2, `shared=${sharedVerts.length}`);
{
  const step = { x: eastTile.g.centroid.x - C.x, y: eastTile.g.centroid.y - C.y };
  const congruent = V.every((v) => eastTile.g.verts.some((w) =>
    Math.hypot(w.x - (v.x + step.x), w.y - (v.y + step.y)) < 1.5));
  const grad = await page.evaluate(() => {
    const g = document.querySelector("#cursedGlowFade");
    if (!g) return null;
    return {
      units: g.getAttribute("gradientUnits") ?? "objectBoundingBox",
      stops: [...g.querySelectorAll("stop")].map((s) => s.getAttribute("stop-opacity")),
    };
  });
  ok("§4 the neighbour's glow polygon is this tile's, stepped whole (congruent), under the one gradient",
    congruent && centreTile.g.fill === "url(#cursedGlowFade)" && eastTile.g.fill === "url(#cursedGlowFade)",
    `congruent=${congruent}`);
  ok("§4 the gradient is read in each hex's own bounding space, one stop set for every hex (0.34 at the base → 0 at the top)",
    !!grad && grad.units === "objectBoundingBox" && JSON.stringify(grad.stops) === JSON.stringify(["0.34", "0.19", "0.07", "0"]),
    JSON.stringify(grad));
  const eTopY = Math.min(...eastTile.g.verts.map((v) => v.y)), eBaseY = Math.max(...eastTile.g.verts.map((v) => v.y));
  /* The agreement heights stand clear of the base row:
   * at the very base the SOUTHERN neighbour's face art
   * paints over the tile (the painter's law of this map),
   * and the two tiles here have different southern
   * neighbours — a cursed one under the centre tile, a
   * clean one under the eastern — so the base row compares
   * the neighbours' art, not the tiles' glow. The three
   * stations span the fade's body. */
  const agreeHeights = [0.3, 0.5, 0.7];
  const agreePts = [];
  agreeHeights.forEach((h, i) => {
    agreePts.push({ name: `c${i}`, x: C.x, y: baseY - h * (baseY - topY) });
    agreePts.push({ name: `e${i}`, x: eastTile.g.centroid.x, y: eBaseY - h * (eBaseY - eTopY) });
  });
  const agreeRes = await samplePoints(agreePts);
  const agree = agreeHeights.map((h, i) => {
    const a = agreeRes.find((p) => p.name === `c${i}`).lift;
    const b = agreeRes.find((p) => p.name === `e${i}`).lift;
    return { h, a, b, d: Math.abs(a - b), tol: Math.max(5, 0.3 * ((a + b) / 2)) };
  });
  console.log("  §4 column lifts at matched heights (centre|neighbour):",
    agree.map((s) => `${s.a.toFixed(1)}|${s.b.toFixed(1)}`).join("  "));
  ok("§4 the two hexes read the same glow at the same heights (tile-space columns)",
    agree.every((s) => s.d <= s.tol), JSON.stringify(agree));
  /* §4b — the seam, observed: in the bleed strip on this
   * side of the shared edge, the neighbour's spill paints
   * over this hex's glow, so a bounded brightening may
   * stand there. It is measured against this tile's own
   * glow 10px clear of the strip and bounded — named in
   * the build report, never hidden. (The pixel reading is
   * indicative only; the strip's art is the face's rim
   * ink, which speaks in the lift as §4's note records.) */
  if (sharedVerts.length === 2) {
    const [A, B] = sharedVerts;
    const eLen = Math.hypot(B.x - A.x, B.y - A.y);
    const eU = { x: (B.x - A.x) / eLen, y: (B.y - A.y) / eLen };
    let n = { x: -eU.y, y: eU.x };
    if ((eastTile.g.centroid.x - C.x) * n.x + (eastTile.g.centroid.y - C.y) * n.y < 0) n = { x: -n.x, y: -n.y };
    const midSt = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    const seamRes = await samplePoints([
      { name: "strip", x: midSt.x - n.x * 3, y: midSt.y - n.y * 3 },
      { name: "clear", x: midSt.x - n.x * 10, y: midSt.y - n.y * 10 },
    ]);
    const seamLift = seamRes.find((p) => p.name === "strip").lift - seamRes.find((p) => p.name === "clear").lift;
    console.log(`  §4b seam brightening in the bleed strip (mid-edge): ${seamLift.toFixed(1)} red units`);
    ok("§4b the bleed's seam in the shared strip is bounded (≤ 18 red units)",
      seamLift <= 18, `seam=${seamLift.toFixed(1)}`);
  }
}

/* §5 — the bleed past the rim, on the edge facing the clean
 * neighbour (-2,-2): that neighbour was painted earlier, so
 * the spill reads on top of it, as the eye meets it. */
{
  const T = bleedTile.g;
  const nCentre = centreOf(-2, -2);
  const dir = { x: nCentre.x - T.centroid.x, y: nCentre.y - T.centroid.y };
  const dl = Math.hypot(dir.x, dir.y); dir.x /= dl; dir.y /= dl;
  let edge = null, bestDot = -Infinity;
  for (let i = 0; i < 6; i++) {
    const a = T.verts[i], b = T.verts[(i + 1) % 6];
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const mv = { x: m.x - T.centroid.x, y: m.y - T.centroid.y };
    const ml = Math.hypot(mv.x, mv.y);
    const dot = (mv.x / ml) * dir.x + (mv.y / ml) * dir.y;
    if (dot > bestDot) {
      const el = Math.hypot(b.x - a.x, b.y - a.y);
      bestDot = dot;
      edge = { m, n: { x: mv.x / ml, y: mv.y / ml }, rim: ml, e: { x: (b.x - a.x) / el, y: (b.y - a.y) / el } };
    }
  }
  const bleedPx = 0.08 * rDist;
  /* The stations stand OUTSIDE the rim, over the clean
   * neighbour's grey face, where the art cannot confound
   * the lift (inside the rim the face's own red ink speaks
   * in the reading, as §4's note records). Each station is
   * a five-point segment parallel to the edge, averaged:
   * the across-rim distances here are a few pixels, and a
   * segment mean keeps antialiasing and any residual
   * camera grain from speaking for the glow. */
  const seg = (name, across) => [-6, -3, 0, 3, 6].map((along, j) => ({
    name: `${name}_${j}`,
    x: edge.m.x + edge.n.x * across + edge.e.x * along,
    y: edge.m.y + edge.n.y * across + edge.e.y * along,
  }));
  const pts = [
    ...seg("ring1", bleedPx * 0.35),
    ...seg("ring2", bleedPx * 0.75),
    ...seg("beyond", bleedPx + Math.max(5, bleedPx * 0.6)),
  ];
  const bleedRes = await samplePoints(pts);
  const mean = (name) => [0, 1, 2, 3, 4].reduce((s, j) => s + bleedRes.find((p) => p.name === `${name}_${j}`).lift, 0) / 5;
  const L = { ring1: mean("ring1"), ring2: mean("ring2"), beyond: mean("beyond") };
  console.log(`  §5 bleed reach=${bleedPx.toFixed(1)}px lifts outside the rim: ring1=${L.ring1.toFixed(1)} ring2=${L.ring2.toFixed(1)} beyond=${L.beyond.toFixed(1)}`);
  ok("§5 the spill stands outside the rim in the first ring (over the clean face), clear of the noise floor the outer stations read",
    L.ring1 >= 1.0 && L.ring1 - L.ring2 >= 1.5 && L.ring1 - L.beyond >= 1.2, JSON.stringify(L));
  ok("§5 the spill is a whisper by the second ring, dying as it goes",
    L.ring2 <= L.ring1 + 1 && L.ring2 <= 1.2, JSON.stringify(L));
  ok("§5 beyond the bleed's reach (past the 1.08 scaling) the glow is zero",
    Math.abs(L.beyond) <= 2.5, JSON.stringify(L));
  /* Weaker than inside, by construction: every glow
   * group's two ring paths wear the one gradient at
   * quarter (outer ring) and half (inner ring) strength —
   * the DOM opacities — while the cell itself wears it
   * whole. At any height the spill's alpha is therefore a
   * fraction of the glow's alpha inside at that height. */
  const ringOps = await page.evaluate(() =>
    [...document.querySelectorAll("svg.territory-svg .corruption-glow")].map((g) =>
      [...g.querySelectorAll("path")].map((p) => p.getAttribute("opacity"))));
  ok("§5 every bleed ring wears the gradient at a fraction of the cell's strength (opacities 0.25 outer, 0.5 inner)",
    ringOps.length > 0 && ringOps.every((ops) => JSON.stringify(ops) === JSON.stringify(["0.25", "0.5"])),
    JSON.stringify(ringOps.slice(0, 3)));
}

console.log(`drive-cursed-glow: ${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
