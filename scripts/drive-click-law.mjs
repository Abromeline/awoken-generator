// THE CLICK LAW — THIS BUILD'S DRIVE (2026-10-23).
// Boots the real server on a scratch DATA_DIR and the real
// built client in headless Chrome, and proves Nigel's
// completed mouse map (07:40–07:55) clause by clause:
//   Run order note: the drag sections go FIRST, while the
//   seeded world is quiet — casting on the land raises the
//   Curse's Eye, and an unraveling's arrival moves the
//   camera and shuts the War-Grounds, which would bend
//   the drag geometry for reasons outside this law.
//   §A THE HOMELAND DRAGS: a left-drag draws the band and
//      its release raises the company's orders wheel, the
//      camera unmoved; a plain right-drag is spent (no
//      band, no pan, no wheel); a middle-drag pans — and
//      still pans, drawing no band, with the War-Grounds
//      open; a touch-drag still pans.
//   §B THE BOX GATHERS AWOKEN ALONE (Nigel, 2026-10-23
//      07:55): a box drawn over one Awoken, a building and
//      the Tender himself selects the Awoken alone — its
//      single orders wheel, with the single's own faces.
//   §C THE LINE AND THE ROAD: with a March armed, a right-
//      drag draws the line and its BLIPS (one per targeted
//      Awokin, one at each end) live in the page; on
//      release both march (their targets the tiles nearest
//      the blips — since the placement build of 2026-10-23
//      the blips themselves are the standing points, proven
//      whole by drive-free-stand). And the road DARES: a
//      lone Awokin lined across a cursed tile marches
//      THROUGH it — the short way, at the curse's prices
//      (Nigel, 2026-10-23: no curse refusal stands in a
//      march; before that ruling this section proved the
//      road bent around the curse, and the bend is dead).
//   §D THE HOMELAND CAST ROAD: right-click (unarmed) opens
//      the wheel; a LEFT tap looses the readied Blade; a
//      RIGHT click while the run stands armed CANCELS it —
//      no cast fires, no wheel opens — and the NEXT right
//      click reopens the wheel.
//   §E THE TABLE: a middle-drag pans the stage, a left-
//      drag from empty ground does not; right-click arms
//      through the wheel, a right-click while the placing
//      stands CANCELS it (no wheel), the next reopens it.
// Screenshots land in ~/workspace/click-law-proof/.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-click-law.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

const OUT = "/home/hatch/workspace/click-law-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-clicklaw-"));
process.env.PORT = "3991";
process.env.WORKSHOP_PASSWORD = "<MASKED_SECRET_001>";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3991";
const PW = "clicklaw-drive-password";
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
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up */ }

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

function seedAwokin(ownerKey, tenderName, name, partPower = 2) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, 'root', ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, partPower, partPower, `clicklaw/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: partPower, toughness: partPower, element: "root" });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `clicklaw/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
async function claimWithExp(name, exp) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, exp, Date.now());
  return { token: claim.token, ownerKey };
}
const waitFor = async (fn, what, ms = 30000) => {
  const s = Date.now();
  while (Date.now() - s < ms) { if (await fn()) return true; await sleep(300); }
  throw new Error("drive wait: " + what);
};

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const clickDisc = async (pg, sel, txt) => {
  const handle = await pg.evaluateHandle((q, t) => [...document.querySelectorAll(q)].find((d) => ((d.getAttribute("aria-label") || "") + " " + (d.textContent || "")).includes(t)), sel, txt);
  const el = handle.asElement();
  if (!el) throw new Error("wheel disc not found: " + txt);
  const box = await el.boundingBox();
  if (!box) throw new Error("wheel disc has no box: " + txt);
  await pg.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

/* ══ THE HOMELAND WORLD ═══════════════════════════════════ */
const T = await claimWithExp("Click Tender", 3800);
const now = Date.now();
db.prepare(`INSERT INTO tender_progress (owner_key, class_key, weapon_key, hp, weapon_next_at, updated_at)
  VALUES (?, 'runewright', 'sword', 100, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'runewright', hp = 100`).run(T.ownerKey, now + 600000, now);
const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', ?, ?)");
const tileId = new Map();
for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
  if (hexDist({ q, r }, { q: 0, r: 0 }) > 4) continue;
  const cursed = (q === 0 && r === 2) ? 1 : 0; // THE OBSTACLE: one cursed hex on the path line's road
  tileId.set(`${q},${r}`, Number(insTile.run(T.ownerKey, q, r, cursed, now).lastInsertRowid));
}
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?)").run(T.ownerKey, now);
const insPlace = db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, follow, hp) VALUES (?, ?, ?, ?, ?, 0, 30)");
const seedAt = (name, q, r) => {
  const id = seedAwokin(T.ownerKey, "Click Tender", name, 2);
  insPlace.run(T.ownerKey, id, tileId.get(`${q},${r}`), now, now);
  return id;
};
const bandA = seedAt("Band One", -2, 0);
const bandB = seedAt("Band Two", -2, 1);
const pathOne = seedAt("Path One", -1, 2);
const terr0 = await call("getTerritory", {}, T.token);
const standId = terr0.tender?.tileId;
const standTile = (terr0.tiles ?? []).find((t) => t.id === standId);
if (!standTile) throw new Error("no tender stand in the seeded world");
const solo = seedAt("Solo One", standTile.q + 1, standTile.r);
// The building beside the stand, and one on the stand's
// neighbour the other way — the mixed box will cover the
// Solo, a building and the Tender himself.
db.prepare("INSERT INTO territory_buildings (owner_key, tile_id, building_type, status, placed_at) VALUES (?, ?, 'watchtower', 'active', ?)")
  .run(T.ownerKey, tileId.get(`${standTile.q - 1},${standTile.r}`), now);
const placementOf = async (id) => {
  const t = await call("getTerritory", {}, T.token);
  return (t.placements ?? []).find((p) => p.awakenedId === id) ?? null;
};
const workingsCount = async () => (await call("getTerritory", {}, T.token)).workings?.length ?? 0;

/* ══ OPEN THE LAND ════════════════════════════════════════ */
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:clicklaw]", String(e).slice(0, 200)));
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
let lattice = await solveLattice();
ok("the land lattice is solved for the gestures", !lattice.error && lattice.count === tilesArg.length, JSON.stringify(lattice.error ?? lattice.count));
const clientOf = (q, r) => lattice.points[tileId.get(`${q},${r}`)].client;
const ground = async (pt) => page.evaluate(({ x, y }) => {
  const svg = document.querySelector("svg.territory-svg");
  const r = svg.getBoundingClientRect();
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const cx = clamp(x, r.left + 6, r.right - 6), cy = clamp(y, r.top + 6, Math.min(r.bottom - 6, 940));
  for (const [dx, dy] of [[0, 0], [80, 0], [160, 0], [-80, 0], [-160, 0], [240, 0], [0, 60], [0, -60], [80, 60], [-80, 60]]) {
    const qx = clamp(cx + dx, r.left + 6, r.right - 6), qy = clamp(cy + dy, r.top + 6, Math.min(r.bottom - 6, 940));
    const el = document.elementFromPoint(qx, qy);
    if (el?.closest?.("svg.territory-svg")) return { x: qx, y: qy };
  }
  return { x: cx, y: cy };
}, pt);
const bandRectShown = () => page.evaluate(() => [...document.querySelectorAll('svg.territory-svg rect')]
  .some((r) => r.getAttribute("fill") === "rgba(255,215,0,0.10)" && Number(r.getAttribute("width")) > 10));
const wheelShown = () => page.evaluate(() => !!document.querySelector(".gw-wheel"));
const clearReturnReport = async () => {
  for (let i = 0; i < 3; i++) {
    const stood = await page.evaluate(() => !!document.querySelector(".return-report-overlay"));
    if (!stood) return;
    await page.mouse.click(24, 24);
    await sleep(300);
  }
};
await clearReturnReport();
// A bare tile tap raises the tile's own panel (.admin-
// popup) over the map; a click on it sets it down. Drag
// geometry must start from a clear map, as a player's
// would.
const clearTilePanel = async () => {
  const stood = await page.evaluate(() => {
    const p = document.querySelector(".admin-popup");
    if (!p) return false;
    p.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return true;
  });
  if (stood) await sleep(300);
};
await clearTilePanel();
const dragBox = async (qrList, yMargin = 18) => {
  lattice = await solveLattice(); // the camera may have travelled since the last solve
  const pts = qrList.map(([q, r]) => lattice.points[tileId.get(`${q},${r}`)].svg);
  const x0 = Math.min(...pts.map((p) => p.x)) - 18, x1 = Math.max(...pts.map((p) => p.x)) + 18;
  const y0 = Math.min(...pts.map((p) => p.y)) - yMargin, y1 = Math.max(...pts.map((p) => p.y)) + yMargin;
  const toClient = ({ x, y }) => page.evaluate(({ x, y }) => {
    const svg = document.querySelector("svg.territory-svg");
    const pt = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
    return { x: pt.x, y: pt.y };
  }, { x, y });
  const c0 = await ground(await toClient({ x: x0, y: y0 }));
  const c1 = await ground(await toClient({ x: x1, y: y1 }));
  await page.mouse.move(c0.x, c0.y);
  await page.mouse.down();
  await page.mouse.move(c1.x, c1.y, { steps: 14 });
  const midBand = await bandRectShown();
  await page.mouse.up();
  // Instant witness: did the wheel bloom on the release
  // itself, before any trailing click could close it?
  const atRelease = await page.evaluate(() => !!document.querySelector(".gw-wheel"));
  if (!atRelease) console.log(`    [band-diag] no wheel at release; box client (${Math.round(c0.x)},${Math.round(c0.y)}) -> (${Math.round(c1.x)},${Math.round(c1.y)})`);
  await sleep(700);
  return midBand;
};

/* ══ §A THE DRAGS — left chooses, middle moves, right is spent ══ */
console.log("§A the drags — left chooses, the middle moves, a right drag is spent");
{
  await clearTilePanel();
  const before = clientOf(2, 2);
  const midBand = await dragBox([[-2, 0], [-2, 1]]);
  ok("a left-drag draws the selection box while the hand is down", midBand);
  const bandOpened = await page.waitForSelector(".gw-wheel", { timeout: 9000 }).then(() => true).catch(() => false);
  if (!bandOpened) {
    const diag = await page.evaluate(() => ({
      notice: document.querySelector(".hex-notice")?.textContent ?? null,
      figures: [...document.querySelectorAll("g.field-drifter, g.field-patroller")].map((g) => {
        const r = g.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      }),
      discs: document.querySelectorAll(".gw-disc").length,
    })).catch(() => ({}));
    await page.screenshot({ path: `${OUT}/diag-band-empty.png` }).catch(() => {});
    throw new Error("§A: the band's release raised no orders wheel — " + JSON.stringify(diag));
  }
  const faces = await page.evaluate(() => [...document.querySelectorAll(".gw-disc")].map((d) => d.textContent ?? ""));
  ok("the band's release raises the company's orders wheel (March · Attack · Defend · Follow)",
    ["March", "Attack", "Defend", "Follow"].every((w) => faces.some((t) => t.includes(w))), JSON.stringify(faces));
  const afterBand = (await solveLattice()).points[tileId.get("2,2")].client;
  ok("the choosing drag never moved the camera", Math.hypot(afterBand.x - before.x, afterBand.y - before.y) < 2,
    `shift=${Math.hypot(afterBand.x - before.x, afterBand.y - before.y)}`);
  await page.keyboard.press("Escape");
  await sleep(400);

  // A plain right-drag: no band, no pan, no wheel.
  const rd0 = await ground({ x: 620, y: 430 });
  await page.mouse.move(rd0.x, rd0.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(rd0.x + 170, rd0.y + 40, { steps: 12 });
  const rdBand = await bandRectShown();
  await page.mouse.up({ button: "right" });
  await sleep(600);
  const afterRight = (await solveLattice()).points[tileId.get("2,2")].client;
  ok("a right-drag draws no band", !rdBand);
  ok("a right-drag never pans and opens no wheel on release",
    Math.hypot(afterRight.x - before.x, afterRight.y - before.y) < 2 && !(await wheelShown()),
    `shift=${Math.hypot(afterRight.x - before.x, afterRight.y - before.y)} wheel=${await wheelShown()}`);

  // A middle-drag pans.
  const md0 = await ground({ x: 620, y: 430 });
  await page.mouse.move(md0.x, md0.y);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(md0.x + 160, md0.y, { steps: 12 });
  const mdBand = await bandRectShown();
  await page.mouse.up({ button: "middle" });
  await sleep(600);
  lattice = await solveLattice();
  const afterMid = lattice.points[tileId.get("2,2")].client;
  ok("a middle-drag PANS the screen (and draws no band)", Math.hypot(afterMid.x - before.x, afterMid.y - before.y) > 40 && !mdBand,
    `shift=${Math.hypot(afterMid.x - before.x, afterMid.y - before.y)} band=${mdBand}`);
  ok("no wheel stands after the middle-drag", !(await wheelShown()));

  // With the War-Grounds open, the middle still pans and
  // still draws no band (no tab gates the split).
  await page.click(".wg-toggle");
  await sleep(600);
  const pre2 = lattice.points[tileId.get("2,2")].client;
  const md1 = await ground({ x: 900, y: 500 });
  await page.mouse.move(md1.x, md1.y);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(md1.x - 140, md1.y, { steps: 12 });
  const mdBand2 = await bandRectShown();
  await page.mouse.up({ button: "middle" });
  await sleep(600);
  lattice = await solveLattice();
  const afterMid2 = lattice.points[tileId.get("2,2")].client;
  ok("War-Grounds open: a middle-drag still pans and draws NO selection box",
    Math.hypot(afterMid2.x - pre2.x, afterMid2.y - pre2.y) > 40 && !mdBand2,
    `shift=${Math.hypot(afterMid2.x - pre2.x, afterMid2.y - pre2.y)} band=${mdBand2}`);
  await page.click(".wg-toggle");
  await sleep(500);
  await page.screenshot({ path: `${OUT}/homeland-drags.png` });

  // A touch-drag still pans (the finger's road, untouched).
  const preT = lattice.points[tileId.get("2,2")].client;
  if (typeof page.touchscreen?.touchStart === "function") {
    await page.touchscreen.touchStart(700, 500);
    for (let i = 1; i <= 6; i++) await page.touchscreen.touchMove(700 + i * 22, 500);
    await page.touchscreen.touchEnd();
  } else {
    await page.evaluate(() => {
      const el = document.querySelector(".territory-map");
      const opts = (x, y) => ({ bubbles: true, cancelable: true, pointerId: 71, pointerType: "touch", button: 0, buttons: 1, clientX: x, clientY: y });
      el.dispatchEvent(new PointerEvent("pointerdown", opts(700, 500)));
      el.dispatchEvent(new PointerEvent("pointermove", opts(790, 500)));
      el.dispatchEvent(new PointerEvent("pointermove", opts(840, 500)));
      el.dispatchEvent(new PointerEvent("pointerup", { ...opts(840, 500), buttons: 0 }));
    });
  }
  await sleep(700);
  lattice = await solveLattice();
  const afterT = lattice.points[tileId.get("2,2")].client;
  ok("a touch-drag still pans the screen", Math.hypot(afterT.x - preT.x, afterT.y - preT.y) > 25,
    `shift=${Math.hypot(afterT.x - preT.x, afterT.y - preT.y)}`);
}

/* ══ §B THE BOX GATHERS AWOKEN ALONE ══════════════════════ */
console.log("§B the mixed box — an Awoken, a building and the Tender walk into a box");
{
  await clearReturnReport();
  await clearTilePanel();
  const midBand = await dragBox([[standTile.q + 1, standTile.r], [standTile.q - 1, standTile.r], [standTile.q, standTile.r]], 48);
  ok("the mixed box is drawn", midBand);
  const mixedOpened = await page.waitForSelector(".gw-wheel", { timeout: 9000 }).then(() => true).catch(() => false);
  if (!mixedOpened) {
    const diag = await page.evaluate(() => ({
      notice: document.querySelector(".hex-notice")?.textContent ?? null,
      figures: [...document.querySelectorAll("g.field-drifter, g.field-patroller")].map((g) => {
        const r = g.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      }),
      discs: document.querySelectorAll(".gw-disc").length,
    })).catch(() => ({}));
    await page.screenshot({ path: `${OUT}/diag-mixed-empty.png` }).catch(() => {});
    const hs = [[1, 0], [0, 0], [-1, 0]].map(([q, r]) => (terr0.tiles ?? []).find((t) => t.id === tileId.get(`${q},${r}`))?.height ?? "?");
    throw new Error("§B: the mixed box raised no wheel — " + JSON.stringify(diag) + ` stand=${standTile.q},${standTile.r} heights(E,S,W)=${JSON.stringify(hs)} soloClient=${JSON.stringify(clientOf(1, 0))}`);
  }
  const faces = await page.evaluate(() => [...document.querySelectorAll(".gw-disc")].map((d) => d.textContent ?? ""));
  // The single's wheel carries the single's own faces
  // (Patrol among them); a company wheel never does. One
  // Awoken chosen out of the three standings proves the
  // box swept in neither the building nor the Tender.
  ok("the box selected the Awoken ALONE — the single's own wheel (Patrol among its faces)",
    faces.some((t) => t.includes("Patrol")) && faces.some((t) => t.includes("March")),
    JSON.stringify(faces));
  await page.screenshot({ path: `${OUT}/homeland-mixed-box.png` });
  await page.keyboard.press("Escape");
  await sleep(400);
}

/* ══ §C THE LINE, ITS BLIPS, AND THE DARING ROAD ═══════════ */
console.log("§C the line and the road — blips on the drag, and a march that dares the curse");
{
  // The pair again: band them, arm March, right-drag the
  // line — the blips must stand on it while the hand is
  // down, one per Awokin, one at each end.
  await clearTilePanel();
  const entryProbe = await page.evaluate(() => {
    const el = document.elementFromPoint(585, 283);
    const chain = [];
    let n = el;
    while (n && chain.length < 5) { chain.push(n.tagName + "." + (n.getAttribute?.("class") ?? "")); n = n.parentElement; }
    return {
      wheel: !!document.querySelector(".gw-wheel"),
      popup: !!document.querySelector(".admin-popup"),
      confirm: !!document.querySelector(".hex-confirm"),
      notice: document.querySelector(".hex-notice")?.textContent ?? null,
      atPress: chain.join(" < "),
    };
  }).catch(() => ({}));
  console.log("    [§C-entry]", JSON.stringify(entryProbe));
  // Bisect: §B left Solo SELECTED (its wheel's parting
  // gift). Clear the standing selection the player's way
  // — a bare click on empty land — and set the tile panel
  // down, then band again.
  const barePt = await ground(clientOf(3, -3));
  await page.mouse.click(barePt.x, barePt.y);
  await sleep(400);
  await clearTilePanel();
  const pairMidBand = await dragBox([[-2, 0], [-2, 1]]);
  console.log("    [pair-diag] midBand after clearing the standing selection:", pairMidBand);
  const pairOpened = await page.waitForSelector(".gw-wheel", { timeout: 9000 }).then(() => true).catch(() => false);
  if (!pairOpened) {
    await page.screenshot({ path: `${OUT}/diag-pair-empty.png` }).catch(() => {});
    console.log("    [pair-diag] midBand drawn:", pairMidBand);
    const hs = [[-2, 0], [-2, 1]].map(([q, r]) => (terr0.tiles ?? []).find((t) => t.id === tileId.get(`${q},${r}`))?.height ?? "?");
    const figs = await page.evaluate(() => [...document.querySelectorAll("g.field-drifter, g.field-patroller")].map((g) => {
      const r = g.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })).catch(() => []);
    throw new Error(`§C: the pair's band raised no wheel — heights=${JSON.stringify(hs)} centres=${JSON.stringify([clientOf(-2, 0), clientOf(-2, 1)])} figures=${JSON.stringify(figs)}`);
  }
  await clickDisc(page, ".gw-disc", "March");
  await sleep(300);
  const armProbe = await page.evaluate(() => ({
    notice: document.querySelector(".hex-notice")?.textContent ?? null,
    wheel: !!document.querySelector(".gw-wheel"),
  })).catch(() => ({}));
  console.log("    [arm-diag]", JSON.stringify(armProbe));
  lattice = await solveLattice();
  // The line is drawn across open mid-map: the tile row
  // r=-2 runs under the compass cluster at the top-right,
  // and a drag path that crosses those HTML buttons leaves
  // the svg — its mouseleave lawfully sets the line down.
  // The pair's blips owe no particular tiles; open ground
  // proves the gesture.
  const l0 = await ground({ x: 350, y: 300 });
  const l1 = await ground({ x: 800, y: 420 });
  await page.mouse.move(l0.x, l0.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(l0.x + (l1.x - l0.x) / 4, l0.y + (l1.y - l0.y) / 4, { steps: 4 });
  const pressProbe = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    const chain = [];
    let n = el;
    while (n && chain.length < 5) { chain.push(n.tagName + "." + (n.getAttribute?.("class") ?? "")); n = n.parentElement; }
    return {
      atPress: chain.join(" < "),
      lines: [...document.querySelectorAll("svg.territory-svg line")].map((l) => l.getAttribute("stroke-dasharray")),
      notice: document.querySelector(".hex-notice")?.textContent ?? null,
    };
  }, l0).catch(() => ({}));
  console.log("    [press-diag]", JSON.stringify(pressProbe), "l0=", JSON.stringify(l0), "l1=", JSON.stringify(l1));
  await page.mouse.move(l1.x, l1.y, { steps: 10 });
  const blips = await page.evaluate(() => {
    const line = [...document.querySelectorAll("svg.territory-svg line")].find((l) => l.getAttribute("stroke-dasharray") === "6 4");
    if (!line) return { found: false, n: 0 };
    const g = line.parentElement;
    const cs = [...g.querySelectorAll("circle")].map((c) => ({ x: Number(c.getAttribute("cx")), y: Number(c.getAttribute("cy")) }));
    return { found: true, n: cs.length, cs, x0: Number(line.getAttribute("x1")), y0: Number(line.getAttribute("y1")), x1: Number(line.getAttribute("x2")), y1: Number(line.getAttribute("y2")) };
  });
  ok("the right-drag draws the line with a BLIP for each targeted Awokin (two, one at each end)",
    blips.found && blips.n === 2
      && Math.hypot(blips.cs[0].x - blips.x0, blips.cs[0].y - blips.y0) < 2
      && Math.hypot(blips.cs[1].x - blips.x1, blips.cs[1].y - blips.y1) < 2,
    JSON.stringify(blips));
  await page.screenshot({ path: `${OUT}/homeland-line-blips.png` });
  await page.mouse.up({ button: "right" });
  await sleep(1200);
  const pa = await placementOf(bandA), pb = await placementOf(bandB);
  ok("on release the line commits — both of the pair are on the road", !!pa?.marchPath && !!pb?.marchPath,
    JSON.stringify({ a: !!pa?.marchPath, b: !!pb?.marchPath }));
  // Let them arrive before the lone run (roads clear).
  await waitFor(async () => { const a = await placementOf(bandA), b = await placementOf(bandB); return a && b && !a.marchPath && !b.marchPath; }, "the pair arrive", 90000);

  // THE DARING ROAD: Path One alone, lined across the
  // cursed (0,2). Its road runs straight through the
  // curse — the short way, at the curse's prices — and
  // arrives at (1,2) all the same. First bring the row on screen:
  // the §A pans have carried the land south-east until
  // (1,2)'s centre sits off the viewport's edge, and a
  // line dragged to a clamped corner proves nothing.
  // Middle-drags walk the camera back (the pan takes the
  // drag's measure in map units, ~2.8×, so step gently
  // and re-measure).
  for (let i = 0; i < 8; i++) {
    lattice = await solveLattice();
    const a = clientOf(-1, 2), b = clientOf(1, 2);
    if (a.x > 120 && b.x < 1180 && a.y > 120 && b.y < 760) break;
    const dx = Math.max(-240, Math.min(240, (640 - (a.x + b.x) / 2) / 2.8));
    const dy = Math.max(-240, Math.min(240, (430 - (a.y + b.y) / 2) / 2.8));
    await page.mouse.move(700, 450);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(700 + dx, 450 + dy, { steps: 10 });
    await page.mouse.up({ button: "middle" });
    await sleep(500);
  }
  lattice = await solveLattice();
  console.log("    [lone-geometry] (-1,2)=", JSON.stringify(clientOf(-1, 2)), " (1,2)=", JSON.stringify(clientOf(1, 2)));
  await dragBox([[-1, 2]]);
  await page.waitForSelector(".gw-wheel", { timeout: 9000 });
  await clickDisc(page, ".gw-disc", "March");
  await sleep(300);
  const loneArm = await page.evaluate(() => document.querySelector(".hex-notice")?.textContent ?? null).catch(() => null);
  console.log("    [lone-arm-diag]", JSON.stringify(loneArm));
  lattice = await solveLattice();
  const p0 = await ground(clientOf(-1, 2));
  const p1 = await ground(clientOf(1, 2));
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(p0.x + (p1.x - p0.x) / 2, p0.y + (p1.y - p0.y) / 2, { steps: 7 });
  const lonePress = await page.evaluate(() => ({
    lines: [...document.querySelectorAll("svg.territory-svg line")].map((l) => l.getAttribute("stroke-dasharray")),
  })).catch(() => ({}));
  console.log("    [lone-press-diag]", JSON.stringify(lonePress), "p0=", JSON.stringify(p0), "p1=", JSON.stringify(p1));
  await page.mouse.move(p1.x, p1.y, { steps: 7 });
  await page.mouse.up({ button: "right" });
  await sleep(800);
  const loneNotice = await page.evaluate(() => document.querySelector(".hex-notice")?.textContent ?? null).catch(() => null);
  console.log("    [lone-release-diag] notice:", JSON.stringify(loneNotice));
  const pm = await placementOf(pathOne);
  const road = pm?.marchPath ? JSON.parse(pm.marchPath) : [];
  const cursedId = tileId.get("0,2"), destId = tileId.get("1,2");
  ok("the lone line-march is on the road to the far side of the curse", road.length > 0 && road[road.length - 1] === destId,
    JSON.stringify(road));
  ok("its road DARES the cursed hex — straight through it, the short way (3 hexes, not 4)",
    road.length === 3 && road[1] === cursedId, JSON.stringify(road));
  await waitFor(async () => { const p = await placementOf(pathOne); return p && !p.marchPath && p.tileId === destId; }, "Path One arrives across the bend", 90000);
  ok("Path One ARRIVED at its blip's hex, through the curse", true);
  await page.screenshot({ path: `${OUT}/homeland-bent-road.png` });
}
/* ══ §D THE CAST ROAD — left looses, right cancels ════════ */
console.log("§D the cast road — left looses, right cancels, the next right reopens");
{
  const grim = await call("getGrimoire", {}, T.token);
  const blade = (grim.spells ?? []).find((s) => s.engine === "blade");
  const formName = blade.forms?.unaligned ?? blade.name;
  const readyBlade = async () => {
    await page.mouse.click(420, 300, { button: "right" });
    // Under the click law a right-click while a run stands
    // armed is the CANCEL, not the menu — if the wheel did
    // not bloom, the run was armed: click again to open it.
    const opened = await page.waitForSelector(".gw-wheel", { timeout: 2500 }).then(() => true).catch(() => false);
    if (!opened) {
      await page.mouse.click(420, 300, { button: "right" });
      const opened2 = await page.waitForSelector(".gw-wheel", { timeout: 9000 }).then(() => true).catch(() => false);
      if (!opened2) {
        const diag = await page.evaluate(() => ({
          notice: document.querySelector(".hex-notice")?.textContent ?? null,
          popup: !!document.querySelector(".admin-popup"),
          confirm: !!document.querySelector(".hex-confirm"),
          wheel: !!document.querySelector(".gw-wheel"),
          radialBtns: document.querySelectorAll(".gw-disc").length,
          bodyHasReadied: document.body.innerText.includes("readied"),
        })).catch(() => ({}));
        await page.screenshot({ path: `${OUT}/diag-wheel-stuck.png` }).catch(() => {});
        throw new Error("readyBlade: the wheel never opened — " + JSON.stringify(diag));
      }
    }
    await clickDisc(page, ".gw-disc.cat", "Rune");
    await sleep(500);
    await clickDisc(page, ".gw-disc", formName);
    await page.waitForFunction((fn) => (document.querySelector(".hex-notice")?.textContent ?? "").includes("readied") || (document.querySelector(".hex-notice")?.textContent ?? "").includes(fn), { timeout: 9000 }, formName).catch(() => {});
    await sleep(300);
  };
  lattice = await solveLattice();
  await clearTilePanel();
  await readyBlade();
  ok("right-click (unarmed) opened the wheel and the Rune branch readied the Blade", true);

  // Loose it with LEFT taps on clean ground near the stand
  // until one stands (a fizzle unarms — re-ready and walk
  // on, the cast-flow drive's own road). The taps are
  // ground()-checked and kept inside the viewport: §C's
  // recentring left the far-north tiles off the top edge,
  // where a blind centre click lands on the HUD, not land.
  const tapTiles = [[1, 0], [0, 1], [-1, 1], [1, -1], [0, -1], [-1, 0], [2, -1], [2, 0], [1, 1], [-1, -1]]
    .filter(([q, r]) => tileId.has(`${q},${r}`))
    .filter(([q, r]) => { const c = clientOf(q, r); return c.x > 90 && c.x < 1290 && c.y > 110 && c.y < 840; });
  console.log("    [§D-taps] tiles in reach:", JSON.stringify(tapTiles));
  let stoodAt = -1;
  const w0 = await workingsCount();
  for (let i = 0; i < tapTiles.length; i++) {
    const [q, r] = tapTiles[i];
    const pt = await ground(clientOf(q, r));
    await page.mouse.click(pt.x, pt.y);
    await sleep(700);
    if ((await workingsCount()) > w0) { stoodAt = i; break; }
    if (i < tapTiles.length - 1) await readyBlade();
  }
  ok("a LEFT tap loosed the readied working — it stands on the land", stoodAt >= 0, `workings=${await workingsCount()} base=${w0}`);

  // The run stands armed (the sticky road). RIGHT-click:
  // no cast, no wheel — the run is set down.
  const wArmed = await workingsCount();
  await page.mouse.click(420, 300, { button: "right" });
  await sleep(600);
  ok("the cancelling right-click fired NO cast", (await workingsCount()) === wArmed);
  ok("the cancelling right-click opened NO wheel", !(await wheelShown()));
  const [nq, nr] = tapTiles[(stoodAt + 3) % tapTiles.length];
  const npt = await ground(clientOf(nq, nr));
  // The NEXT right-click reopens the wheel — which is
  // itself the proof the run is down: had it still stood,
  // this click would have been another cancel and no
  // wheel would stand. (It must come before any tile tap:
  // a tap raises the tile's own panel, and a standing
  // panel lawfully bars the wheel — the older gate.)
  await page.mouse.click(420, 300, { button: "right" });
  await page.waitForSelector(".gw-wheel", { timeout: 9000 });
  ok("the second right-click reopened the wheel — the run was truly set down", true);
  await page.keyboard.press("Escape");
  await sleep(400);
  // And a left tap on fresh ground looses nothing now.
  await page.mouse.click(npt.x, npt.y);
  await sleep(700);
  ok("after the cancel, a left tap looses nothing either", (await workingsCount()) === wArmed);
  await page.screenshot({ path: `${OUT}/homeland-cancel-road.png` });
}

await page.close();

/* ══ §E THE TABLE ═════════════════════════════════════════ */
console.log("§E the Table — the middle pans, the left from empty ground does not; right cancels, then opens");
{
  const claim = await call("claimTender", { password: PW, tenderName: "Clicklaw Table" });
  const token2 = claim.token;
  const tenderId2 = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey2 = `tender:${tenderId2}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey2, Date.now());
  const insTile2 = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, ?, ?, 0, ?)");
  for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > 2) continue;
    insTile2.run(ownerKey2, q, r, Date.now());
  }
  await call("getTerritory", {}, token2);
  await call("chooseClass", { classKey: "runewright" }, token2);
  const { issueTableToken } = await import("../server/dist/table.js");
  const tt = issueTableToken({ id: "disc-clicklaw", name: "Clicklaw Table" });
  const bindCode = (await call("getTableBindCode", {}, token2)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
  if (!bindRes.ok) throw new Error("table/bind failed: " + bindRes.status);
  const grim2 = await call("getGrimoire", {}, token2);
  const blade2 = (grim2.spells ?? []).find((s) => s.engine === "blade");
  const bladeLabel = blade2.root ?? blade2.name;

  const wstate = { state: null };
  const wws = new WebSocket(`ws://127.0.0.1:3991/table/ws`);
  await new Promise((res, rej) => { wws.onopen = res; wws.onerror = rej; });
  wws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") wstate.state = m.state; } catch { /* a torn frame is no evidence */ } };
  wws.send(JSON.stringify({ type: "join", room: "click-law", watch: true, name: "Drive Watcher" }));

  const tpage = await browser.newPage();
  await tpage.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
  tpage.on("pageerror", (e) => console.log("[pageerror:clicklaw-table]", String(e).slice(0, 200)));
  await tpage.evaluateOnNewDocument((sess) => { window.__awokenTableSession = sess; },
    { authToken: tt, room: "click-law", name: "Clicklaw Table" });
  await tpage.goto(BASE + "/table?frame_id=drive", { waitUntil: "domcontentloaded", timeout: 60000 });
  await tpage.waitForSelector(".table-room", { timeout: 30000 });
  await tpage.waitForFunction(() => !!document.querySelector(".table-room svg polygon"), { timeout: 30000 });
  await sleep(1500);
  // The seat exists only once the page has joined — the
  // watcher reads it after the page stands (cast-flow's
  // order; waiting before the page opens deadlocks).
  await waitFor(() => !!(wstate.state?.players ?? []).find((p) => p.name === "Clicklaw Table")?.hex, "the watcher reads the seat and its hex", 20000);

  const polyCentre = () => tpage.evaluate(() => {
    const polys = [...document.querySelectorAll(".table-room svg polygon")];
    const p = polys[Math.floor(polys.length / 2)];
    if (!p) return null;
    const r = p.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  // A LEFT drag from empty ground must not pan now.
  const c0 = await polyCentre();
  await tpage.mouse.move(600, 700);
  await tpage.mouse.down();
  await tpage.mouse.move(760, 700, { steps: 12 });
  await tpage.mouse.up();
  await sleep(600);
  const c1 = await polyCentre();
  ok("at the Table a LEFT drag from empty ground no longer pans", Math.hypot(c1.x - c0.x, c1.y - c0.y) < 3,
    `shift=${Math.hypot(c1.x - c0.x, c1.y - c0.y)}`);
  // A MIDDLE drag pans.
  await tpage.mouse.move(600, 700);
  await tpage.mouse.down({ button: "middle" });
  await tpage.mouse.move(760, 700, { steps: 12 });
  await tpage.mouse.up({ button: "middle" });
  await sleep(600);
  const c2 = await polyCentre();
  ok("at the Table a MIDDLE drag pans the stage", Math.hypot(c2.x - c1.x, c2.y - c1.y) > 20,
    `shift=${Math.hypot(c2.x - c1.x, c2.y - c1.y)}`);

  // The cancel road: arm the Blade, right-click cancels
  // (placing bar falls, no wheel), the next right-click
  // opens the wheel.
  const placingArmed = async () => tpage.evaluate(() => !!document.querySelector(".placing-bar"));
  await tpage.mouse.click(750, 320, { button: "right" });
  await tpage.waitForSelector(".gw-wheel", { timeout: 9000 });
  await clickDisc(tpage, ".gw-disc.cat", "Rune");
  await sleep(500);
  await clickDisc(tpage, ".gw-disc", bladeLabel);
  await sleep(500);
  ok("at the Table the wheel readied the Blade — the placing bar stands", await placingArmed());
  await tpage.mouse.click(750, 320, { button: "right" });
  await sleep(700);
  ok("at the Table a right-click while the placing stands CANCELS it — and opens no wheel",
    !(await placingArmed()) && !(await tpage.evaluate(() => !!document.querySelector(".gw-wheel"))));
  await tpage.mouse.click(750, 320, { button: "right" });
  await tpage.waitForSelector(".gw-wheel", { timeout: 9000 });
  ok("at the Table the second right-click reopens the wheel", true);
  await tpage.screenshot({ path: `${OUT}/table-cancel-road.png` });
  await tpage.close();
  wws.close();
}

await browser.close();
console.log(`\nCLICK-LAW DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
