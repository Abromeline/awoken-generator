// THE FLICKER DRIVE — THE CAMERA BUILD'S PROOF (2026-10-23).
// Nigel: "is there a way to get the map to stop flickering when
// its being moved?" The fix carries pan and zoom as ONE transform
// on the camera groups (g.land-cam) around the land, drawn once in
// stable land coordinates, so a move slides the finished picture
// instead of repainting every tile at a new place each frame.
// This drive makes the absence measurable, not vibes:
//   §A THE CAMERA EXISTS: exactly two land-cam groups (tile art
//      behind the hit layer, the rest of the land in front of it),
//      carrying ONE identical transform.
//   §B THE LATTICE SOLVES on the hit polygons' points, as the
//      click-law and free-stand drives solve it — the geometry
//      the restructure had to keep exact.
//   §C DURING A MIDDLE-DRAG PAN the groups' transform changes
//      continuously (sampled at every step of the drag, the two
//      groups agreeing at every sample), and screenshots at
//      three mid-drag offsets show the land whole.
//   §D THE CENSUS: a MutationObserver over the whole map during
//      the drag records ZERO mutations inside the camera groups
//      — no land child replaced, re-created, or re-attributed,
//      no per-tile transform churn — while the groups' own
//      transform attribute and the screen-space hit polygons'
//      points (which re-solve exactly, by design) do change.
//      Node identity is read back object-for-object: every land
//      node present before the drag is the same node, in the
//      same order, after it.
//   §E THE LATTICE STILL SOLVES after the pan.
//   §F ZOOM rides the same transform: two zoom-in clicks take
//      the scale to 1.4 on both groups, identity unbroken, and
//      NOTHING inside the land is created or removed (zero
//      childList mutations across the whole drive). A zoom click
//      is a discrete step, not a move: the land's screen-constant
//      insets (label sizes, stroke widths, the tiles' lift) take
//      their new values once at the click — that single settling
//      is what keeps them the same size on screen at every zoom,
//      and it is counted and named, not hidden.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-flicker.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

const OUT = "/home/hatch/workspace/flicker-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-flicker-"));
process.env.PORT = "3995";
process.env.WORKSHOP_PASSWORD = "<MASKED_SECRET_003>";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3995";
const PW = "flicker-drive-password";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return data?.data ?? data;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up, as the other drives do */ }

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

function seedAwokin(ownerKey, tenderName, name, partPower = 2) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, 'root', ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, partPower, partPower, `flicker/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: partPower, toughness: partPower, element: "root" });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `flicker/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
async function claimWithExp(name, exp) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, exp, Date.now());
  return { token: claim.token, ownerKey };
}

/* ══ A QUIET HOMELAND: standing figures, no roads, no columns —
   nothing on the map's own clocks, so every DOM change during
   the drag is the drag's own doing. ══════════════════════════ */
const T = await claimWithExp("Flicker Tender", 3800);
const now = Date.now();
db.prepare(`INSERT INTO tender_progress (owner_key, class_key, weapon_key, hp, weapon_next_at, updated_at)
  VALUES (?, 'runewright', 'sword', 100, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'runewright', hp = 100`).run(T.ownerKey, now + 600000, now);
const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', ?, ?)");
const tileId = new Map();
for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
  if (hexDist({ q, r }, { q: 0, r: 0 }) > 4) continue;
  const cursed = (q === 0 && r === 2) ? 1 : 0;
  tileId.set(`${q},${r}`, Number(insTile.run(T.ownerKey, q, r, cursed, now).lastInsertRowid));
}
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?)").run(T.ownerKey, now);
const insPlace = db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, follow, hp) VALUES (?, ?, ?, ?, ?, 0, 30)");
const seedAt = (name, q, r) => {
  const id = seedAwokin(T.ownerKey, "Flicker Tender", name, 2);
  insPlace.run(T.ownerKey, id, tileId.get(`${q},${r}`), now, now);
  return id;
};
seedAt("Still One", -2, 0);
seedAt("Still Two", -1, 2);
seedAt("Still Three", 2, -1);
const terr0 = await call("getTerritory", {}, T.token);
const standId = terr0.tender?.tileId;
const standTile = (terr0.tiles ?? []).find((t) => t.id === standId);
if (!standTile) throw new Error("no tender stand in the seeded world");

/* ══ OPEN THE LAND ════════════════════════════════════════ */
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:flicker]", String(e).slice(0, 200)));
await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, T.token);
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
await sleep(2500);
const door = await page.$(".deck-button");
if (!door) throw new Error("territory: no .deck-button on the home face");
await door.click();
await page.waitForFunction(() => !!window.__tenderJump && !!window.__tenderJump.pos(), { timeout: 30000 });
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Skip");
  if (b) b.click();
});
await sleep(1000);
for (let i = 0; i < 3; i++) {
  const stood = await page.evaluate(() => !!document.querySelector(".return-report-overlay"));
  if (!stood) break;
  await page.mouse.click(24, 24);
  await sleep(300);
}
await page.evaluate(() => {
  const p = document.querySelector(".admin-popup");
  if (p) p.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
});
await sleep(300);

const tilesArg = (terr0.tiles ?? []).map((t) => ({ id: t.id, q: t.q, r: t.r }));
const solveLattice = async () => page.evaluate((tiles) => {
  const polys = [...document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]')];
  const cents = polys.map((p) => {
    const pts = (p.getAttribute("points") ?? "").trim().split(/\s+/).map((s) => s.split(",").map(Number));
    return { x: pts.reduce((a, pt) => a + pt[0], 0) / pts.length, y: pts.reduce((a, pt) => a + pt[1], 0) / pts.length };
  });
  const size = 54;
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
  if (!best || best.hits < tiles.length) return { error: `lattice fit: ${best?.hits}/${tiles.length}` };
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
  return { points: out, count: tiles.length };
}, tilesArg);

const camTransforms = () => page.evaluate(() =>
  [...document.querySelectorAll("g.land-cam")].map((g) => g.getAttribute("transform")));

/* ══ §A + §B ══════════════════════════════════════════════ */
const restCam = await camTransforms();
ok("§A exactly two camera groups wrap the land", restCam.length === 2, JSON.stringify(restCam));
ok("§A both groups carry one identical transform at rest", restCam.length === 2 && restCam[0] === restCam[1], restCam.join(" | "));
ok("§A the resting transform is a pure pan at scale 1", restCam.length === 2 && /scale\(1\)/.test(restCam[0] ?? ""), restCam[0] ?? "none");
let lattice = await solveLattice();
ok("§B the lattice solves whole on the hit polygons' points", !lattice.error && lattice.count === tilesArg.length, JSON.stringify(lattice.error ?? lattice.count));

/* ══ THE PROBE: census + identity, installed before the drag ══ */
const probe0 = await page.evaluate(() => {
  const svg = document.querySelector("svg.territory-svg");
  const groups = [...document.querySelectorAll("g.land-cam")];
  const census = { camTransform: 0, insideLand: 0, insideChildList: 0, insideSamples: [], hitPoints: 0, other: 0 };
  const isHit = (n) => n.nodeName === "polygon" && n.getAttribute("fill") === "rgba(0,0,0,0)";
  const obs = new MutationObserver((recs) => {
    for (const r of recs) {
      const t = r.target;
      if (groups.includes(t)) {
        if (r.attributeName === "transform") census.camTransform++;
        else census.other++;
      } else if (groups.some((g) => g.contains(t))) {
        census.insideLand++;
        if (r.type === "childList") census.insideChildList++;
        if (census.insideSamples.length < 12) census.insideSamples.push(r.type + ":" + t.nodeName + ":" + (r.attributeName || ""));
      } else if (isHit(t)) {
        if (r.attributeName === "points") census.hitPoints++;
        else census.other++;
      } else census.other++;
    }
  });
  obs.observe(svg, { subtree: true, childList: true, attributes: true });
  window.__flickerCensus = census;
  window.__flickerObs = obs;
  window.__landNodes = groups.flatMap((g) => [g, ...g.querySelectorAll("*")]);
  window.__hitNodes = [...document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]')];
  return { landNodes: window.__landNodes.length, hitNodes: window.__hitNodes.length };
});
ok("the probe holds the land's nodes", probe0.landNodes > 100 && probe0.hitNodes === tilesArg.length, JSON.stringify(probe0));
const readIdentity = () => page.evaluate(() => {
  const groups = [...document.querySelectorAll("g.land-cam")];
  const fresh = groups.flatMap((g) => [g, ...g.querySelectorAll("*")]);
  const old = window.__landNodes;
  let sameOrder = fresh.length === old.length;
  if (sameOrder) for (let i = 0; i < old.length; i++) if (fresh[i] !== old[i]) { sameOrder = false; break; }
  const hitsNow = [...document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]')];
  const hitSame = window.__hitNodes.length === hitsNow.length && window.__hitNodes.every((n, i) => n === hitsNow[i]);
  return {
    census: window.__flickerCensus,
    sameOrder, allConnected: old.every((n) => n.isConnected), hitSame,
    freshCount: fresh.length, oldCount: old.length,
  };
});

/* ══ §C + §D: THE DRAG ════════════════════════════════════ */
const startPt = lattice.points[standId].client;
await page.screenshot({ path: join(OUT, "pan-rest.png") });
const samples = [restCam[0]];
await page.mouse.move(startPt.x, startPt.y);
await page.mouse.down({ button: "middle" });
const STEPS = 6;
for (let i = 1; i <= STEPS; i++) {
  await page.mouse.move(startPt.x + (170 * i) / STEPS, startPt.y + (70 * i) / STEPS);
  await sleep(90);
  const t = await camTransforms();
  samples.push(t[0]);
  if (i === 2 || i === 4 || i === 6) {
    await page.screenshot({ path: join(OUT, `pan-offset-${i}.png`) });
    ok(`§C at drag step ${i} the two groups still agree`, t.length === 2 && t[0] === t[1], t.join(" | "));
  }
}
await page.mouse.up({ button: "middle" });
await sleep(400);
await page.screenshot({ path: join(OUT, "pan-end.png") });
const distinct = new Set(samples.filter(Boolean));
ok("§C the camera transform changed continuously through the drag", distinct.size >= 5, `${distinct.size} distinct of ${samples.length} samples`);
const after1 = await readIdentity();
ok("§D zero mutations inside the camera groups during the pan", after1.census.insideLand === 0, JSON.stringify(after1.census.insideSamples));
ok("§D the groups' own transform attribute carried the motion", after1.census.camTransform >= 6, `camTransform=${after1.census.camTransform}`);
ok("§D the hit polygons' points re-solved as the pan moved (screen-exact by design)", after1.census.hitPoints > 0, `hitPoints=${after1.census.hitPoints}`);
ok("§D every land node is the same node, in the same order, after the drag", after1.sameOrder && after1.allConnected, `fresh=${after1.freshCount} old=${after1.oldCount}`);
ok("§D every hit polygon is the same node after the drag", after1.hitSame);

/* ══ §E: GEOMETRY AFTER THE PAN ═══════════════════════════ */
lattice = await solveLattice();
ok("§E the lattice still solves whole after the pan", !lattice.error && lattice.count === tilesArg.length, JSON.stringify(lattice.error ?? lattice.count));

/* ══ §F: ZOOM RIDES THE SAME TRANSFORM ═══════════════════ */
await page.click(".zoom-in");
await sleep(350);
await page.click(".zoom-in");
await sleep(500);
const zoomCam = await camTransforms();
const scaleOf = (s) => { const m = /scale\(([\d.]+)\)/.exec(s ?? ""); return m ? Number(m[1]) : NaN; };
ok("§F both groups agree at zoom", zoomCam.length === 2 && zoomCam[0] === zoomCam[1], zoomCam.join(" | "));
ok("§F the transform's scale is 1.4 after two zoom-in clicks", Math.abs(scaleOf(zoomCam[0]) - 1.4) < 1e-9, zoomCam[0] ?? "none");
await page.screenshot({ path: join(OUT, "zoom-1.4.png") });
const after2 = await readIdentity();
ok("§F zoom replaced no land node either", after2.sameOrder && after2.allConnected && after2.hitSame, `fresh=${after2.freshCount} old=${after2.oldCount}`);
ok("§F nothing inside the land was created or removed across the whole drive", after2.census.insideChildList === 0, `insideChildList=${after2.census.insideChildList}`);
ok("§F the zoom clicks' only land churn is the screen-constant insets taking their new values (attributes, never structure)",
  after2.census.insideLand > 0 && after2.census.insideChildList === 0,
  `insideLand=${after2.census.insideLand} samples=${JSON.stringify(after2.census.insideSamples.slice(0, 4))}`);
await page.evaluate(() => { window.__flickerObs?.disconnect(); });

console.log(`\nFLICKER DRIVE: ${pass} ok, ${fail} FAIL`);
console.log(`census: ${JSON.stringify(after2.census)}`);
await browser.close();
try { db.close(); } catch { /* already closed */ }
process.exit(fail ? 1 : 0);
