// THE SINGLE BLADE LIES FLAT (Nigel, 2026-11-03): the
// armed Blade falls on the ground like the rune it is —
// pointing away from the caster, fixed at the cast; no
// blade is locked to a tile; and one click launches EVERY
// blade within two hexes of the clicked enemy.
// Boots the real server on a scratch DATA_DIR and proves:
//   §A THE HOMELAND, the referee's records (actions.ts):
//      (a) three blades stand as armed records, TWO of them
//          written on the SAME tile at distinct points —
//          no per-tile lock, each lying where it fell;
//      (b) each blade's stored facing (nums.faceQ/faceR)
//          points away from where the caster stood at ITS
//          cast — casts from two different stands give
//          facings that differ as the stands do; a cast at
//          the caster's own feet takes the cast-carried
//          facing, and with none carried, the map's east.
//   §B THE HOMELAND, in a real browser — the drawn blade:
//      (c) each blade's element on the page lies IN THE
//          GROUND PLANE (its frame's axes meet at the iso
//          basis' own angle, never a billboard's right
//          angle), its tip axis aligned with its stored
//          facing's screen direction; an east-pointing
//          blade draws wider than tall. Screenshots stand
//          as the visible proof.
//      (d) THE VOLLEY, by real clicks on the dark's loose
//          circle: two blades sharing a tile BOTH loose on
//          one click (each spends a charge, the harm is
//          the pair's 12); a second click spends their
//          last charges and they are gone; a blade planted
//          beyond two hexes of the same enemy never moved.
//   §C THE TABLE, over its real websocket (table.ts):
//      the cast stores the same facing in the writing's
//      numbers; two blades share one hex at distinct
//      points; one looseBlade order looses BOTH of them
//      (two flights served, both charges spent).
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-single-blade-flat.mjs
// The homeland PAGE in §B is served by vite's DEV server (its
// proxy in client/vite.config.ts points /api and /table/ws at
// this drive's own server on :3000): the page is the same
// source and components, and the dev route avoids a production
// dist build — this box was refusing bulk dist writes (EPERM)
// under memory pressure on 2026-11-03.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, openSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

const OUT = "/home/hatch/workspace/single-blade-proof";
mkdirSync(OUT, { recursive: true });
// The scratch DB lives under the workspace, not /tmp: this
// box's tmpfs write path has been refusing writes all day
// (the prepush boot smoke failed there twice, 2026-11-03).
process.env.DATA_DIR = mkdtempSync(join("/home/hatch/workspace", "blade-flat-data-"));
process.env.PORT = "3000";
process.env.WORKSHOP_PASSWORD = "<MASKED_SECRET_002>";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3000";
const PAGE = "http://127.0.0.1:5173";
const PW = "blade-flat-password";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

await import("../server/dist/index.js");
await sleep(2500);

async function call(action, args, token) {
  // Connection-level resets on this box's loopback (seen
  // 2026-11-03 under load) are retried a few times; a landed
  // request retried would show up in the drive's own counts.
  let lastErr = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(`${BASE}/api/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
        body: JSON.stringify(args ?? {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
      return data?.data ?? data;
    } catch (e) {
      if (e instanceof Error && / -> \d+: /.test(e.message)) throw e; // a real refusal is an answer
      lastErr = e;
      await sleep(700);
    }
  }
  throw lastErr;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up */ }

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
const axialRound = (q, r) => {
  const x = q, z = r, y = -x - z;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
};
const axialLen = (q, r) => Math.sqrt(q * q + q * r + r * r);
const angleBetween = (a, b) => {
  const dot = (a.q * b.q + (a.q * b.r + a.r * b.q) / 2 + a.r * b.r) / (axialLen(a.q, a.r) * axialLen(b.q, b.r));
  return Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
};

async function claim(name, exp, classKey, bench = 0) {
  const c = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(c.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  const now = Date.now();
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, exp, now);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(ownerKey, now);
  // The choosing opens after the first three wakes — the old
  // road's own order (chooseClass's standing gate): the bench
  // is woken BEFORE the class is chosen, never after.
  const benchIds = [];
  for (let i = 0; i < bench; i++) benchIds.push(seedAwokin(ownerKey, name, `${name} Bench ${i + 1}`, 2));
  if (classKey) await call("chooseClass", { classKey }, c.token);
  return { token: c.token, ownerKey, tenderId, benchIds };
}
function seedAwokin(ownerKey, tenderName, name, partPower = 2) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, 'root', ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, partPower, partPower, `blade-flat/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: partPower, toughness: partPower, element: "root" });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `blade-flat/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}

/* ══ §A THE HOMELAND — THE RECORDS ═══════════════════════ */
console.log("§A the homeland — placement, facings, fallbacks (the referee's records)");
const T = await claim("Flatblade Tender", 3800, "runewright", 3);
const tileId = new Map();
{
  const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', 0, ?)");
  const now = Date.now();
  for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > 4) continue;
    tileId.set(`${q},${r}`, Number(insTile.run(T.ownerKey, q, r, now).lastInsertRowid));
  }
}
// The cradle stilled: no dark is born on this land mid-proof.
const stillIv = setInterval(() => {
  try { db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ?, wanderer_settled_beats = 0 WHERE owner_key = ?").run(Date.now(), T.ownerKey); } catch { /* ending */ }
}, 4000);
const setStand = async (q, r) => {
  db.prepare("UPDATE tender_progress SET tender_tile_id = ? WHERE owner_key = ?").run(tileId.get(`${q},${r}`), T.ownerKey);
  const t = await call("getTerritory", {}, T.token);
  if (t.tender?.tileId !== tileId.get(`${q},${r}`)) throw new Error(`stand did not settle at (${q},${r})`);
};
await setStand(0, 0);

async function castBladeAt(pq, pr, extra = {}) {
  const cell = axialRound(pq, pr);
  for (let i = 0; i < 16; i++) {
    const res = await call("castMapWorking", { spellKey: "blade", tileId: tileId.get(`${cell.q},${cell.r}`), pointQ: pq, pointR: pr, ...extra }, T.token);
    if (!res.fizzled) return res;
  }
  throw new Error(`blade cast at (${pq},${pr}) never stood in 16 casts`);
}
const bladeRows = async () => {
  const t = await call("getTerritory", {}, T.token);
  return (t.workings ?? []).filter((w) => w.engine === "blade");
};

// Two blades written on the SAME tile, at distinct points.
const castD = await castBladeAt(1.8, 0.15);
const castE = await castBladeAt(2.25, -0.3);
let rows = await bladeRows();
const rowD = rows.find((w) => w.id === castD.id), rowE = rows.find((w) => w.id === castE.id);
ok("(a) two blades stand written on the SAME tile — no per-tile lock",
  !!rowD && !!rowE && rowD.tileId === tileId.get("2,0") && rowE.tileId === tileId.get("2,0"),
  `D tile=${rowD?.tileId} E tile=${rowE?.tileId} want=${tileId.get("2,0")}`);
ok("(a) each lies where it fell — distinct written points on the shared tile",
  rowD?.nums?.aimQ === 1.8 && rowD?.nums?.aimR === 0.15 && rowE?.nums?.aimQ === 2.25 && rowE?.nums?.aimR === -0.3,
  `D=(${rowD?.nums?.aimQ},${rowD?.nums?.aimR}) E=(${rowE?.nums?.aimQ},${rowE?.nums?.aimR})`);
ok("(a) both stand armed at the book's two charges",
  rowD?.charges === 2 && rowE?.charges === 2, `D=${rowD?.charges} E=${rowE?.charges}`);

// (b) Their facings point away from the stand they were cast from (0,0).
const faceOf = (w) => ({ q: w.nums.faceQ, r: w.nums.faceR });
ok("(b) blade D's stored facing points away from the caster's stand, along its cast direction",
  typeof rowD?.nums?.faceQ === "number" && angleBetween(faceOf(rowD), { q: 1.8, r: 0.15 }) < 3 && Math.abs(axialLen(rowD.nums.faceQ, rowD.nums.faceR) - 1) < 0.01,
  `face=(${rowD?.nums?.faceQ},${rowD?.nums?.faceR}) angle=${rowD ? angleBetween(faceOf(rowD), { q: 1.8, r: 0.15 }).toFixed(2) : "—"}°`);
ok("(b) blade E's stored facing likewise — and differs from D's, as their cast directions differ",
  typeof rowE?.nums?.faceQ === "number" && angleBetween(faceOf(rowE), { q: 2.25, r: -0.3 }) < 3 && angleBetween(faceOf(rowD), faceOf(rowE)) > 3,
  `face=(${rowE?.nums?.faceQ},${rowE?.nums?.faceR}) angle=${rowE ? angleBetween(faceOf(rowE), { q: 2.25, r: -0.3 }).toFixed(2) : "—"}° apart=${rowD && rowE ? angleBetween(faceOf(rowD), faceOf(rowE)).toFixed(2) : "—"}°`);

// Cast from a SECOND stand, toward the other side of the land.
await setStand(2, 2);
const castC = await castBladeAt(-1.7, 2.2);
rows = await bladeRows();
const rowC = rows.find((w) => w.id === castC.id);
ok("(b) cast from a second stand, blade C's facing points away from THAT stand — the facings differ as the stands do",
  !!rowC && angleBetween(faceOf(rowC), { q: -1.7 - 2, r: 2.2 - 2 }) < 3 && angleBetween(faceOf(rowC), faceOf(rowD)) > 60,
  `face=(${rowC?.nums?.faceQ},${rowC?.nums?.faceR}) angle=${rowC ? angleBetween(faceOf(rowC), { q: -3.7, r: 0.2 }).toFixed(2) : "—"}° from D=${rowC && rowD ? angleBetween(faceOf(rowC), faceOf(rowD)).toFixed(2) : "—"}°`);

// The feet casts: no caster→ground direction exists.
await setStand(0, 0);
const castF1 = await castBladeAt(0, 0, { facing: "S" });
const castF2 = await castBladeAt(0, 0);
rows = await bladeRows();
const rowF1 = rows.find((w) => w.id === castF1.id), rowF2 = rows.find((w) => w.id === castF2.id);
ok("(b) a blade written at the caster's own feet, the cast carrying his facing, takes THAT facing (the Black Gate's road)",
  !!rowF1 && angleBetween(faceOf(rowF1), { q: 0, r: 1 }) < 3,
  `face=(${rowF1?.nums?.faceQ},${rowF1?.nums?.faceR})`);
const eastLen = Math.sqrt(0.75);
ok("(b) …and with no facing carried, the feet-written blade takes the map's east",
  !!rowF2 && angleBetween(faceOf(rowF2), { q: 1 / eastLen, r: -0.5 / eastLen }) < 3,
  `face=(${rowF2?.nums?.faceQ},${rowF2?.nums?.faceR})`);
ok("(a) five blades stand on the land in all — two sharing one tile, two sharing the heart, none refused",
  rows.length === 5, `rows=${rows.length}`);

// The dark the volley will answer is seeded LATE (in §B,
// moments before the clicks): standing within the Tender's
// weapon reach, the war gear deals with a seeded dark long
// before a slow browser section could click it — two runs
// watched the row die during §B's warm-up. It stands within
// two hexes of the shared tile's blades, far from blade C.
let darkId = null;
const seedDark = () => {
  // (2.6, 0.9), distances in HEXES (the cube metric the
  // referee reckons in): 1.55 from D and 1.55 from E — well
  // inside their two-hex answer — 3.5 from the heart blades
  // and 4.3 from blade C, well outside theirs. Its tile is
  // CURSED first: the dark stands on cursed ground by the
  // land's law. It is seeded HELD (held_until — the Hold
  // Rune's own state) so it stands for the clicking instead
  // of walking into the heart while the page turns.
  db.prepare("UPDATE territory_tiles SET cursed = 1 WHERE id = ?").run(tileId.get("3,1"));
  darkId = Number(db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at, held_until)
    VALUES (?, ?, 'tangle', ?, 100, 2.6, 0.9, 1, 1, 0, ?)`).run(T.ownerKey, tileId.get("3,1"), Date.now(), Date.now() + 600000).lastInsertRowid);
};
const darkHp = () => db.prepare("SELECT hp FROM homeland_wanderers WHERE id = ?").get(darkId)?.hp;
const chargesOf = (id) => db.prepare("SELECT charges FROM territory_workings WHERE id = ?").get(id)?.charges;

/* ══ §B THE HOMELAND — THE DRAWN BLADE, IN A REAL BROWSER ═ */
console.log("§B the homeland — the blade lies flat on the page, and the volley flies at a click");
// The page comes up through vite's dev server (header note).
// (The bin path is absolute: the child's cwd is client/, and a
// relative script path would resolve under it and die unseen.)
const viteLogFd = openSync(join(OUT, "vite-dev.log"), "w");
const viteDev = spawn("node", [join(process.cwd(), "node_modules", "vite", "bin", "vite.js"), "--port", "5173", "--strictPort", "--host", "127.0.0.1"], { cwd: "client", stdio: ["ignore", viteLogFd, viteLogFd] });
process.on("exit", () => { try { viteDev.kill("SIGKILL"); } catch { /* already down */ } });
{
  const s = Date.now();
  let warm = false;
  while (Date.now() - s < 120000 && !warm) {
    try { const r = await fetch(PAGE + "/"); warm = r.ok; } catch { /* still starting */ }
    if (!warm) await sleep(1000);
  }
  if (!warm) throw new Error("the vite dev server never answered on :5173");
  // Pre-warm the entry module so the browser's first load is
  // not spent inside the transform of the whole app.
  await fetch(PAGE + "/src/main.tsx").catch(() => null);
}
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:territory]", String(e).slice(0, 200)));
await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, T.token);
await page.goto(PAGE + "/", { waitUntil: "domcontentloaded", timeout: 180000 });
// The dev server transforms modules as they are asked for —
// the home face can take a while to stand up on a loaded box,
// so the drive WAITS for the door instead of sleeping fixed.
await page.waitForSelector(".deck-button", { timeout: 120000 });
const doorBtn = await page.$(".deck-button");
if (!doorBtn) throw new Error("territory: no .deck-button on the home face");
await doorBtn.click();
await page.waitForFunction(() => !!window.__tenderJump && !!window.__tenderJump.pos(), { timeout: 30000 });
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
});
await sleep(300);
// The fetch witness: every loose the page sends, and the
// referee's own answer (how many blades, how much harm).
await page.evaluate(`(() => {
  window.__looseLog = [];
  const of = window.fetch.bind(window);
  window.fetch = async (...a) => {
    const r = await of(...a);
    try {
      if (String(a[0]).includes("looseBlade")) {
        const j = await r.clone().json().catch(() => null);
        const d = j && j.data ? j.data : j;
        window.__looseLog.push({ ok: r.ok, harm: d?.harm ?? null, loosed: d?.loosedBlades?.length ?? null, err: d?.error ?? null });
      }
    } catch { /* the witness never breaks the page */ }
    return r;
  };
})()`);
await page.waitForFunction((n) => document.querySelectorAll("g[data-blade]").length >= n, { timeout: 30000 }, 5);

// (c) THE GEOMETRY OF THE LIE, measured on the page itself.
const geom = await page.evaluate(() => {
  // The lattice basis, measured off the land's own hit
  // polygons: a heart polygon and its neighbours.
  const polys = [...document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]')];
  const cents = polys.map((p) => {
    const pts = (p.getAttribute("points") ?? "").trim().split(/\s+/).map((s) => s.split(",").map(Number));
    return { x: pts.reduce((a, pt) => a + pt[0], 0) / pts.length, y: pts.reduce((a, pt) => a + pt[1], 0) / pts.length };
  });
  const mid = { x: innerWidth / 2, y: innerHeight / 2 };
  const c0 = cents.reduce((a, c) => (Math.hypot(c.x - mid.x, c.y - mid.y) < Math.hypot(a.x - mid.x, a.y - mid.y) ? c : a), cents[0]);
  const diffs = cents.map((c) => ({ x: c.x - c0.x, y: c.y - c0.y })).filter((d) => Math.hypot(d.x, d.y) > 20)
    .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y)).slice(0, 6);
  const u = diffs.filter((d) => d.y > 0).sort((a, b) => b.x - a.x)[0];
  const v = diffs.filter((d) => d.y > 0).sort((a, b) => Math.abs(a.x) - Math.abs(b.x))[0];
  const blades = [...document.querySelectorAll("g[data-blade]")].map((g) => {
    const inner = g.querySelector("g");
    const img = g.querySelector("image");
    const m = /matrix\(([^)]+)\)/.exec(inner?.getAttribute("transform") ?? "");
    const nums = m ? m[1].split(/[\s,]+/).map(Number) : null;
    const rect = img ? img.getBoundingClientRect() : null;
    return {
      id: g.getAttribute("data-blade"),
      fq: Number(g.getAttribute("data-face-q")), fr: Number(g.getAttribute("data-face-r")),
      a: nums?.[0], b: nums?.[1], c: nums?.[2], d: nums?.[3],
      w: rect?.width ?? 0, h: rect?.height ?? 0,
    };
  });
  return { u, v, blades };
});
ok("(c) the page draws all five blades as lying-blade elements", geom.blades.length === 5, `found=${geom.blades.length}`);
const screenAngle = (x1, y1, x2, y2) => Math.acos(Math.max(-1, Math.min(1, (x1 * x2 + y1 * y2) / (Math.hypot(x1, y1) * Math.hypot(x2, y2))))) * 180 / Math.PI;
for (const b of geom.blades) {
  const sx = geom.u.x * b.fq + geom.v.x * b.fr, sy = geom.u.y * b.fq + geom.v.y * b.fr;
  const tipAngle = screenAngle(b.c, b.d, sx, sy);
  // The width axis must follow the facing's ground-plane
  // PERPENDICULAR, read through the same basis — the
  // direction-independent mark of a thing lying IN the
  // ground plane (the raw frame angle legitimately passes
  // near 90° for some facings in iso projection).
  const pq = (-b.fq - 2 * b.fr) / Math.sqrt(3), pr = (2 * b.fq + b.fr) / Math.sqrt(3);
  const wx = geom.u.x * pq + geom.v.x * pr, wy = geom.u.y * pq + geom.v.y * pr;
  const widthAngle = screenAngle(b.a, b.b, wx, wy);
  ok(`(c) blade ${b.id} lies IN THE GROUND PLANE — its width axis follows its facing's ground perpendicular (${widthAngle.toFixed(1)}° off)`,
    widthAngle < 4, `width=${widthAngle.toFixed(1)}°`);
  ok(`(c) blade ${b.id}'s tip axis follows its stored facing on screen (${tipAngle.toFixed(1)}° off)`,
    tipAngle < 4, `tip=${tipAngle.toFixed(1)}° face=(${b.fq},${b.fr})`);
}
const drawnD = geom.blades.find((b) => Number(b.id) === castD.id);
ok("(c) the east-pointing blade draws WIDER THAN TALL, as a thing lying on the ground does",
  !!drawnD && drawnD.w > drawnD.h * 1.15, `w=${drawnD?.w.toFixed(1)} h=${drawnD?.h.toFixed(1)}`);
// Bring the shared tile close for the keepsake frame: the
// map's own zoom-in button, four presses, so the lying
// blades read at a human glance, not only in the geometry
// above.
for (let i = 0; i < 4; i++) {
  const zb = await page.$(".compass-btn.zoom-in");
  if (!zb) break;
  await zb.click();
  await sleep(250);
}
await sleep(600);
await page.screenshot({ path: join(OUT, "01-blades-lying-flat.png") });

// (d) THE VOLLEY, by real clicks on the dark's loose circle.
// The bench three are stood down first: the land fields a
// Tender's first three Awoken as a standing party on every
// read (fieldFirstThreeParty), and left standing they shoot
// any dark that walks in dead within seconds — watched in a
// probe, 2026-11-03 (placement strikes of 9–15 a beat). The
// choosing they were woken for is long done; the volley's
// ground is the blades' alone.
db.prepare("DELETE FROM field_placements WHERE owner_key = ?").run(T.ownerKey);
db.prepare("DELETE FROM awakened WHERE owner_key = ?").run(T.ownerKey);
seedDark();
// The page learns of the dark on its own refresh — wait
// until its loose circle stands on the map before clicking.
await page.waitForFunction(() => [...document.querySelectorAll("circle")].some((el) => (el.querySelector("title")?.textContent ?? "").includes("Loose the Single Blade")), { timeout: 90000 });
ok("(d) the seeded dark stands on the referee's land when the clicking starts",
  darkHp() != null, `hp=${darkHp()}`);
const hpAtFirstClick = darkHp();
// The land's own risings may have birthed other darks on it
// (the first seed's rising stands on every new land) — the
// click must name THIS dark, so the others are cleared and
// the page is waited on until exactly its circle stands.
const purgeOtherDarks = () => db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ? AND id != ?").run(T.ownerKey, darkId);
purgeOtherDarks();
await page.waitForFunction(() => [...document.querySelectorAll("circle")].filter((el) => (el.querySelector("title")?.textContent ?? "").includes("Loose the Single Blade")).length === 1, { timeout: 60000 });
const clickLoose = async () => {
  const before = await page.evaluate(() => window.__looseLog.length);
  const clicked = await page.evaluate(() => {
    const c = [...document.querySelectorAll("circle")].find((el) => (el.querySelector("title")?.textContent ?? "").includes("Loose the Single Blade"));
    if (!c) {
      window.__looseDiag = [...document.querySelectorAll("circle title")].map((t) => t.textContent).slice(0, 12);
      return false;
    }
    const r = c.getBoundingClientRect();
    c.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: Math.round(r.x + r.width / 2), clientY: Math.round(r.y + r.height / 2) }));
    return true;
  });
  if (!clicked) {
    const diag = await page.evaluate(() => window.__looseDiag ?? null).catch(() => null);
    throw new Error("the loose's hit circle is not on the map; circle titles seen: " + JSON.stringify(diag));
  }
  await sleep(2200);
  const log = await page.evaluate(() => window.__looseLog);
  return log.slice(before);
};
const volley1 = await clickLoose();
ok("(d) ONE click loosed the volley — the referee answers for exactly the two blades sharing the tile",
  volley1.length === 1 && volley1[0].ok && volley1[0].loosed === 2, JSON.stringify(volley1));
ok("(d) the volley's harm is the pair's — flat 6 and flat 6, no die",
  volley1[0]?.harm === 12 && darkHp() === hpAtFirstClick - 12, `harm=${volley1[0]?.harm} hp=${hpAtFirstClick}->${darkHp()}`);
ok("(d) both shared-tile blades spent ONE charge each and still stand armed; the far blade never moved",
  chargesOf(castD.id) === 1 && chargesOf(castE.id) === 1 && chargesOf(castC.id) === 2 && chargesOf(castF1.id) === 2 && chargesOf(castF2.id) === 2,
  `D=${chargesOf(castD.id)} E=${chargesOf(castE.id)} C=${chargesOf(castC.id)} F1=${chargesOf(castF1.id)} F2=${chargesOf(castF2.id)}`);
purgeOtherDarks();
const volley2 = await clickLoose();
ok("(d) a second click looses the same pair again — their last charges",
  volley2.length === 1 && volley2[0].loosed === 2 && volley2[0].harm === 12 && darkHp() === hpAtFirstClick - 24,
  `log=${JSON.stringify(volley2)} hp=${hpAtFirstClick}->${darkHp()}`);
ok("(d) spent, the two blades are gone from the shared tile; every other blade still stands armed",
  chargesOf(castD.id) === undefined && chargesOf(castE.id) === undefined && chargesOf(castC.id) === 2 && chargesOf(castF1.id) === 2 && chargesOf(castF2.id) === 2,
  `C=${chargesOf(castC.id)} F1=${chargesOf(castF1.id)} F2=${chargesOf(castF2.id)}`);
await sleep(1200);
await page.screenshot({ path: join(OUT, "02-after-the-volley.png") });
await browser.close();
viteDev.kill("SIGTERM");
clearInterval(stillIv);

/* ══ §C THE TABLE ════════════════════════════════════════ */
console.log("§C the Table — the same facing, the same sharing, the same volley");
const TT = await claim("Flatblade Table Tender", 3800, "runewright", 25);
const { issueTableToken } = await import("../server/dist/table.js");
const tt = issueTableToken({ id: "disc-blade-flat", name: "Flatblade Table Tender" });
const bindCode = (await call("getTableBindCode", {}, TT.token)).code;
const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
if (!bindRes.ok) throw new Error("table/bind failed: " + bindRes.status);

class Actor {
  constructor() { this.state = null; this.you = null; this.errors = []; }
  async join(token, room) {
    this.ws = new WebSocket(`ws://127.0.0.1:3000/table/ws`);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data));
        if (m.type === "state") { this.state = m.state; this.you = m.you; }
        else if (m.type === "error") this.errors.push(String(m.message ?? ""));
      } catch { /* torn frame */ }
    };
    this.send({ type: "join", authToken: token, room });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
}
const waitFor = async (fn, what, ms = 20000) => {
  const s = Date.now();
  while (Date.now() - s < ms) { if (fn()) return true; await sleep(150); }
  throw new Error("drive wait: " + what);
};
const actor = new Actor();
await actor.join(tt, "blade-flat");
await waitFor(() => !!actor.you, "the Table seat");
// THE PROVOKE (Nigel, 2026-10-25): the Table's dark does
// not enter until the curse is struck — the startWave door
// was removed that day, and a startWave message meets
// silence. Field a hand, strike the curse, and the dark
// answers on its own (settleCasualEntry).
await call("addToParty", { awakenedId: TT.benchIds[0] }, TT.token);
let unit = null;
for (let i = 0; i < 25 && !unit; i++) {
  actor.send({ type: "summonCast", awakenedId: TT.benchIds[0] });
  await sleep(600);
  unit = (actor.state?.field ?? []).find((u) => u.ownerKey === actor.you.key) ?? null;
}
ok("a hand stands on the Table's field to strike the curse", !!unit, JSON.stringify(actor.errors.slice(-2)));
const axDist = (a, b) => { const [aq, ar] = a.split(",").map(Number); const [bq, br] = b.split(",").map(Number); return (Math.abs(aq - bq) + Math.abs(aq + ar - bq - br) + Math.abs(ar - br)) / 2; };
if (unit) {
  actor.send({ type: "setStance", cardId: unit.cardId, stance: "binding" });
  await sleep(300);
  const tgt = (actor.state?.map ?? []).filter((t) => t.cursed && t.id !== "0,0")
    .sort((a, b) => axDist(a.id, unit.hex) - axDist(b.id, unit.hex))[0];
  if (tgt && axDist(tgt.id, unit.hex) > 2) {
    // March the hand to a hex within root reach (2) of it.
    const step = (actor.state?.map ?? []).filter((t) => t.id !== unit.hex && axDist(t.id, tgt.id) <= 2)
      .sort((a, b) => axDist(a.id, unit.hex) - axDist(b.id, unit.hex))[0];
    if (step) {
      actor.send({ type: "march", from: unit.hex, to: step.id, cardId: unit.cardId });
      await waitFor(() => {
        const u = (actor.state?.field ?? []).find((x) => x.cardId === unit.cardId);
        return u && !u.moving && axDist(tgt.id, u.hex) <= 2;
      }, "the hand marches within reach of the curse", 30000).catch(() => false);
      unit = (actor.state?.field ?? []).find((x) => x.cardId === unit.cardId) ?? unit;
    }
  }
  if (tgt) actor.send({ type: "strikeCurse", cardId: unit.cardId, hex: unit.hex, target: tgt.id });
}
await waitFor(() => (actor.state?.dark ?? []).length >= 1, "the dark answers the struck curse and takes the field", 90000);
await waitFor(() => {
  const p = (actor.state?.players ?? []).find((x) => x.key === actor.you.key);
  return p && p.pos && !p.moving;
}, "the caster stands still, her point served", 15000).catch(() => false);
const myPos = () => (actor.state?.players ?? []).find((x) => x.key === actor.you.key)?.pos ?? null;
const tableBlades = () => (actor.state?.workings ?? []).filter((x) => x.root === "blade" && x.ownerKey === actor.you.key);
const darkNow = () => (actor.state?.dark ?? [])[0];

// Close with the dark before writing: the caster glides to
// its ground (the Table's own road for a Tender's feet),
// so the writing is laid from within the book's reach.
{
  const d0 = darkNow();
  if (d0) {
    actor.send({ type: "glide", tx: d0.pos.x, ty: d0.pos.y });
    await waitFor(() => {
      const p = myPos();
      const d = darkNow();
      return !!p && !!d && Math.hypot(p.x - d.pos.x, p.y - d.pos.y) < 170;
    }, "the caster closes with the dark", 30000).catch(() => false);
  }
}

// Cast blade 1 at the dark's own point; its facing is read
// against the caster's point at the sending.
const dark1 = darkNow();
const casterAtCast = myPos();
let w1 = null;
for (let i = 0; i < 30 && !w1; i++) {
  const d = darkNow();
  if (!d) break;
  actor.send({ type: "castRune", root: "blade", hexes: [d.hex], points: [{ x: d.pos.x, y: d.pos.y }] });
  const s = Date.now();
  while (Date.now() - s < 1200) {
    w1 = tableBlades()[0] ?? null;
    if (w1) break;
    await sleep(120);
  }
}
ok("the Blade was written at the Table (through its cast door, fizzles honestly retried)", !!w1, JSON.stringify(actor.errors.slice(-2)));
ok("the Table's writing carries the cast facing in its numbers, as the homeland's does",
  typeof w1?.nums?.faceQ === "number" && typeof w1?.nums?.faceR === "number" && Math.abs(axialLen(w1.nums.faceQ, w1.nums.faceR) - 1) < 0.01,
  `nums=${JSON.stringify(w1?.nums)}`);
if (w1 && casterAtCast && dark1) {
  // The pixel delta the cast carried, in axial terms (the
  // iso basis' inverse at the Table's TILE_SIZE of 40).
  const k = 40 / 796;
  const dq = (dark1.pos.x - casterAtCast.x) / (1292 * k);
  const dr = ((dark1.pos.y - casterAtCast.y) - 470 * k * dq) / (948 * k);
  const ang = angleBetween({ q: w1.nums.faceQ, r: w1.nums.faceR }, { q: dq, r: dr });
  ok("the Table facing points away from where the caster stood (pixel delta read in axial terms)",
    ang < 10, `angle=${ang.toFixed(2)}°`);
}
// Cast blade 2 onto the SAME hex, at its own point.
let w2 = null;
for (let i = 0; i < 30 && !w2; i++) {
  actor.send({ type: "castRune", root: "blade", hexes: [w1.hex], points: [{ x: w1.pos.x + 14, y: w1.pos.y + 4 }] });
  const s = Date.now();
  while (Date.now() - s < 1200) {
    const bs = tableBlades();
    if (bs.length >= 2) { w2 = bs.find((x) => x.id !== w1.id); break; }
    await sleep(120);
  }
}
ok("a second blade shares the first's hex — no per-hex lock at the Table either",
  !!w2 && w2.hex === w1.hex, `w1 hex=${w1?.hex} w2 hex=${w2?.hex}`);
ok("each lies at its own point on the shared hex",
  !!w2 && Math.hypot(w2.pos.x - w1.pos.x, w2.pos.y - w1.pos.y) > 5,
  `w1 pos=${JSON.stringify(w1?.pos)} w2 pos=${JSON.stringify(w2?.pos)}`);
ok("the second writing carries its own facing too",
  typeof w2?.nums?.faceQ === "number" && typeof w2?.nums?.faceR === "number",
  `nums=${JSON.stringify(w2?.nums)}`);

// The volley at the Table: one order, both blades answer.
const darkForLoose = (actor.state?.dark ?? []).find((e) => e.id === dark1.id) ?? darkNow();
const hpBeforeLoose = darkForLoose?.hp;
actor.send({ type: "looseBlade", enemyId: darkForLoose.id });
await waitFor(() => {
  const bs = tableBlades();
  return bs.length >= 2 && bs.every((x) => x.charges === 1);
}, "the Table volley spends both blades' charges");
ok("ONE loose order at the Table loosed BOTH blades on the shared hex — each spent one charge",
  tableBlades().every((x) => x.charges === 1), JSON.stringify(tableBlades().map((x) => x.charges)));
ok("two flights were served for the volley — one from each blade's ground",
  (actor.state?.bladeFlights ?? []).filter((f) => f.fromHex === w1.hex).length >= 2,
  `flights=${JSON.stringify((actor.state?.bladeFlights ?? []).map((f) => f.fromHex))}`);
const darkAfterLoose = (actor.state?.dark ?? []).find((e) => e.id === darkForLoose.id);
ok("the dark took the pair's harm — flat 6 and flat 6 (or fell to the volley outright)",
  darkAfterLoose ? (hpBeforeLoose - darkAfterLoose.hp) >= 12 : hpBeforeLoose != null,
  `before=${hpBeforeLoose} after=${darkAfterLoose?.hp ?? "felled"}`);
actor.ws.close();

console.log(`\nSINGLE-BLADE-FLAT DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
