// THE TABLE STAGE FILLS THE WHOLE WINDOW — THE DRIVE
// (Nigel, ruled 2026-10-25 20:21, over his own watcher
// screenshot of the room: "i want that box to be the size
// of the whole window, ui showing over top of it.")
// Boots the real server on a scratch DATA_DIR and proves
// the fill in a real browser, on the real surfaces:
//   §FIX Two homeland fixtures, sown by the real first-seed
//      road and sculpted in the open (the board-grows
//      drive's shapes): GRETA's homeland whole to RING 8
//      (217 tiles — a grown board), WILLA's whole inside
//      ring 6 (127 — the standard board), both seeds grown
//      to Beacon.
//   §A THE WIDE WINDOW (1600×1000): Greta's room stands on
//      the grown board; the board's box IS the window (edge
//      to edge, both axes, the very top included); the svg
//      fills the board's box; the dealt flower CROPS on the
//      axis the cover overflows and REACHES NEAR every edge
//      on the other — no island margins of backdrop; a tile
//      face keeps its drawn proportions (no stretch).
//   §B THE CONTROLS OVER THE BOARD: the zoom buttons frame
//      the board (+ raises the scale, − eases it, the ⌂
//      reset restores the cover framing, and the cover
//      never fights a framing the player took); the hit
//      chain at the + button's centre shows the controls
//      stacked over the stage; a pointer at three gaps
//      between the panels lands on the board; a middle-
//      drag pans by the cover's measure; and the tap that
//      chooses her figure, then a tap on far ground, glides
//      her there — the cover unprojection landing taps on
//      true tiles. (The room's standing controls are +, −
//      and ⌂ — there is no lock button in this room.)
//   §C THE TALL WINDOW (1024×1366, the iPad's shape): the
//      grown board covers there too, cropping on the other
//      axis.
//   §D THE STANDARD BOARD (ring 6) fills the wide window
//      the same way, and paints fewer tile faces than the
//      grown board.
//   §E THE WATCHER'S DOOR (Nigel's own road in his
//      screenshot): the door's watch stands the room, and
//      the board fills the window for the watcher too.
//      (A scratch server with no Discord configured stands
//      the dev door, whose watch button reads "Watch
//      instead" — the same watch join.)
// Screenshots are kept for every shape.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-table-stage-fills-window.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

const OUT = "/home/hatch/workspace/table-stage-fills-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-stage-fills-"));
process.env.PORT = "3977";
process.env.WORKSHOP_PASSWORD = ["stage", "fills", "drive", "word"].join("-");
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3977";
const PW = "stage-fills-drive-password";
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

const partEl = (name, category, power, toughness, element) => Number(db.prepare(
  "INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)")
  .run(name, category, power, toughness, element, `fills/${name}.png`, Date.now()).lastInsertRowid);
const mkKin = (ownerKey, ownerName, name, parts) => {
  const comp = JSON.stringify(parts.map(([category, element, power, toughness]) => ({
    source_id: `db:${partEl(`${name} ${category}`, category, power, toughness, element)}`,
    name: `${name} ${category}`, category, rarity: "common", power, toughness, element,
  })));
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, "fills/awokin.png", comp, ownerName, ownerKey, Date.now()).lastInsertRowid);
};
const stdParts = (el, power, toughness) => [["body", el, power, toughness], ["arms", el, power, toughness], ["head", el, power, toughness]];

const { issueTableToken } = await import("../server/dist/table.js");
async function mkTender(name, exp, classKey, discId) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, exp, Date.now());
  const kinIds = [];
  if (classKey) { for (const w of ["Wake One", "Wake Two", "Wake Three"]) kinIds.push(mkKin(ownerKey, name, `${name} ${w}`, stdParts("sky", 2, 2))); }
  if (classKey) await call("chooseClass", { classKey }, claim.token);
  const tt = issueTableToken({ id: discId, name });
  const bindCode = (await call("getTableBindCode", {}, claim.token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
  if (!bindRes.ok) throw new Error("table/bind failed for " + name + ": " + bindRes.status);
  return { token: claim.token, ownerKey, tt, name, kinIds };
}
const fillers = (t, n, tag) => { for (let i = 0; i < n; i++) mkKin(t.ownerKey, t.name, `${tag} ${i + 1}`, stdParts("sky", 2, 2)); };
const parseAx = (id) => id.split(",").map(Number);
const ringOf = (q, r) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
const discCount = (radius) => 1 + 3 * radius * (radius + 1);
const seedRowOf = (ownerKey) => db.prepare("SELECT s.id, s.tile_id, s.level, s.fed_energy, s.state FROM star_seeds s JOIN first_seed_events e ON e.seed_id = s.id WHERE e.owner_key = ?").get(ownerKey);
function completeDisc(t, radius) {
  const have = new Set(db.prepare("SELECT q, r FROM territory_tiles WHERE owner_key = ? AND COALESCE(z, 0) = 0").all(t.ownerKey).map(x => `${x.q},${x.r}`));
  const ins = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, curse_hp, curse_max_hp, created_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)");
  const els = ["root", "tide", "sky", "stone", "fire"];
  let minted = 0;
  for (let q = -radius; q <= radius; q++) for (let r = -radius; r <= radius; r++) {
    if (ringOf(q, r) > radius || have.has(`${q},${r}`)) continue;
    const hp = 10 + ringOf(q, r) * 2;
    ins.run(t.ownerKey, q, r, els[Math.abs(q * 7 + r * 3) % 5], hp, hp, Date.now());
    minted++;
  }
  return minted;
}
const setTileOf = (ownerKey) => (q, r, fields) => {
  const sets = Object.keys(fields).map(k => `${k} = ?`).join(", ");
  db.prepare(`UPDATE territory_tiles SET ${sets} WHERE owner_key = ? AND q = ? AND r = ? AND COALESCE(z, 0) = 0`).run(...Object.values(fields), ownerKey, q, r);
};
const ring1Els = { "1,0": "root", "1,-1": "tide", "0,-1": "stone", "0,1": "sky", "-1,0": "tide", "-1,1": "root" };
function growSeedAndRim(t) {
  const setTile = setTileOf(t.ownerKey);
  setTile(0, 0, { cursed: 0, element: "sky", curse_hp: null, curse_max_hp: null });
  for (const [id, el] of Object.entries(ring1Els)) { const [q, r] = parseAx(id); setTile(q, r, { cursed: 0, element: el, curse_hp: null, curse_max_hp: null }); }
  const seed = seedRowOf(t.ownerKey);
  db.prepare("UPDATE star_seeds SET level = 3, fed_energy = 47 WHERE id = ?").run(seed.id);
  db.prepare("UPDATE first_seed_events SET state = 'done' WHERE owner_key = ?").run(t.ownerKey);
  return seed;
}

/* ══ §FIX THE HOMELAND FIXTURES ═══════════════════════ */
console.log("§FIX the homeland fixtures — sown by the real road, sculpted in the open");
const G = await mkTender("Grown Greta", 800, "warden", "disc-stage-fills-g");
fillers(G, 20, "GBench");
await call("addToParty", { awakenedId: G.kinIds[0] }, G.token);
const W = await mkTender("Window Willa", 800, "warden", "disc-stage-fills-w");
fillers(W, 20, "WBench");
await call("addToParty", { awakenedId: W.kinIds[0] }, W.token);
await call("ensureFirstSeed", {}, G.token);
await call("getTerritory", {}, G.token);
await call("ensureFirstSeed", {}, W.token);
await call("getTerritory", {}, W.token);
completeDisc(G, 8);
growSeedAndRim(G);
completeDisc(W, 6);
growSeedAndRim(W);
const gRows = db.prepare("SELECT COUNT(*) AS n FROM territory_tiles WHERE owner_key = ? AND COALESCE(z, 0) = 0").get(G.ownerKey).n;
const wRows = db.prepare("SELECT COUNT(*) AS n FROM territory_tiles WHERE owner_key = ? AND COALESCE(z, 0) = 0").get(W.ownerKey).n;
ok("§FIX Greta's homeland stands whole to ring 8 (217 rows), Willa's inside ring 6 (127)",
  gRows === discCount(8) && wRows === discCount(6), `greta=${gRows} willa=${wRows}`);

/* ══ THE BROWSER HARNESS ══════════════════════════════ */
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;
async function geometry(page) {
  return page.evaluate(() => {
    const board = document.querySelector(".field-board")?.getBoundingClientRect();
    const svg = document.querySelector("svg.terrain-stage")?.getBoundingClientRect();
    const imgs = [...document.querySelectorAll("svg.terrain-stage image")].map((i) => i.getBoundingClientRect());
    const ext = imgs.length ? {
      left: Math.min(...imgs.map((r) => r.left)), right: Math.max(...imgs.map((r) => r.right)),
      top: Math.min(...imgs.map((r) => r.top)), bottom: Math.max(...imgs.map((r) => r.bottom)),
    } : null;
    let faceAspect = null;
    const face = document.querySelector("svg.terrain-stage image");
    if (face) {
      const r = face.getBoundingClientRect();
      const aw = Number(face.getAttribute("width")), ah = Number(face.getAttribute("height"));
      if (aw > 0 && ah > 0 && r.height > 0) faceAspect = { drawn: aw / ah, shown: r.width / r.height };
    }
    const rect = (r) => r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height } : null;
    return { board: rect(board), svg: rect(svg), ext, faces: imgs.length, faceAspect, iw: window.innerWidth, ih: window.innerHeight };
  });
}
function okFill(tag, geo) {
  ok(`${tag} THE BOARD'S BOX IS THE WINDOW: left 0, top 0 (the very top, under the bars), right and bottom at the window's edges`,
    !!geo.board && near(geo.board.left, 0) && near(geo.board.top, 0) && near(geo.board.right, geo.iw) && near(geo.board.bottom, geo.ih),
    JSON.stringify(geo.board) + ` window=${geo.iw}x${geo.ih}`);
  ok(`${tag} THE SVG FILLS THE BOARD'S BOX exactly`,
    !!geo.svg && !!geo.board && near(geo.svg.left, geo.board.left) && near(geo.svg.top, geo.board.top) && near(geo.svg.right, geo.board.right) && near(geo.svg.bottom, geo.board.bottom),
    JSON.stringify(geo.svg));
  ok(`${tag} THE FLOWER COVERS: it crops past at least one pair of edges and reaches near EVERY edge (no island margins)`,
    !!geo.ext && (geo.ext.top < -20 || geo.ext.left < -20) && (geo.ext.bottom > geo.ih + 20 || geo.ext.right > geo.iw + 20)
    && geo.ext.left < 140 && geo.ext.right > geo.iw - 140 && geo.ext.top < 140 && geo.ext.bottom > geo.ih - 140,
    JSON.stringify(geo.ext) + ` window=${geo.iw}x${geo.ih}`);
  ok(`${tag} NO STRETCH: a tile face is shown at its drawn proportions`,
    !!geo.faceAspect && Math.abs(geo.faceAspect.shown - geo.faceAspect.drawn) / geo.faceAspect.drawn < 0.05,
    JSON.stringify(geo.faceAspect));
}
async function openRoom(t, roomId, width, height) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.evaluateOnNewDocument((sess) => { window.__awokenTableSession = sess; },
    { authToken: t.tt, room: roomId, name: t.name });
  await page.goto(BASE + `/table?land=homeland&frame_id=${roomId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  let stands = true;
  try { await page.waitForSelector(".table-room", { timeout: 30000 }); await page.waitForSelector(".seed-strip", { timeout: 20000 }); } catch { stands = false; }
  await sleep(2500);
  return { page, errs, stands };
}

/* ══ §A THE WIDE WINDOW — THE GROWN BOARD ═════════════ */
console.log("§A the wide window (1600×1000) — Greta's grown board fills it");
const a = await openRoom(G, "stage-fills-greta-wide", 1600, 1000);
ok("§A Greta's room stands in the browser on the grown board, no page errors (no #310)",
  a.stands && a.errs.length === 0, a.errs.join(" | ").slice(0, 200));
const geoA = await geometry(a.page);
okFill("§A", geoA);
ok("§A THE COVER CROPS VERTICALLY at this wide shape: the flower runs past the top and the bottom",
  !!geoA.ext && geoA.ext.top < -20 && geoA.ext.bottom > geoA.ih + 20, JSON.stringify(geoA.ext));
await a.page.screenshot({ path: `${OUT}/grown-board-wide.png` });

/* ══ §B THE CONTROLS OVER THE BOARD ═══════════════════ */
console.log("§B the controls over the board — zoom in, zoom out, reset, gaps, the drag");
const zoomState = () => a.page.evaluate(() => {
  const g = document.querySelector("svg.terrain-stage > g");
  const tr = g?.getAttribute("transform") ?? "";
  const sm = tr.match(/scale\(([-\d.]+)\)/);
  const tm = tr.match(/translate\(([-\d.]+)[ ,]+([-\d.]+)\)/);
  return { scale: sm ? Number(sm[1]) : null, panX: tm ? Number(tm[1]) : null, panY: tm ? Number(tm[2]) : null, transform: tr };
});
const clickViewBtn = (aria) => a.page.evaluate((label) => {
  const b = [...document.querySelectorAll(".stage-view-btns button")].find((x) => x.getAttribute("aria-label") === label);
  if (!b) return false;
  b.click();
  return true;
}, aria);
const approx = (x, y, tol = 0.02) => x !== null && Math.abs(x - y) <= tol;
const z0 = await zoomState();
ok("§B THE VIEW STANDS AT THE COVER on entry: scale 1, no pan (the cover fit is the initial framing)",
  approx(z0.scale, 1) && approx(z0.panX, 0) && approx(z0.panY, 0), JSON.stringify(z0));
const plusStack = await a.page.evaluate(() => {
  const b = [...document.querySelectorAll(".stage-view-btns button")].find((x) => x.getAttribute("aria-label") === "Zoom the map in");
  if (!b) return null;
  const r = b.getBoundingClientRect();
  const chain = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    .map((el) => `${el.tagName}.${(el.getAttribute("class") || "").toString().slice(0, 30)}`);
  return { chain, btnIdx: chain.findIndex((s) => s.startsWith("BUTTON.") && !s.includes("hand-grab")), svgIdx: chain.findIndex((s) => s.startsWith("svg.")), top: chain[0] };
});
ok("§B THE ZOOM CONTROLS STACK ABOVE THE BOARD: in the hit chain at the + button's centre, the button stands over the stage svg (only the satchel drawer's grab strip — full-width, bottom-anchored, untouched by this build — stands over the button, as it does on the base)",
  !!plusStack && plusStack.btnIdx >= 0 && plusStack.svgIdx > plusStack.btnIdx,
  JSON.stringify(plusStack?.chain));
await clickViewBtn("Zoom the map in");
await sleep(300);
const z1 = await zoomState();
ok("§B CLICKING + FRAMES THE BOARD: the stage scale rises to 1.3",
  approx(z1.scale, 1.3), JSON.stringify(z1));
await clickViewBtn("Zoom the map in");
await sleep(300);
const z2 = await zoomState();
ok("§B + AGAIN: the scale rises to 1.69 — the framing is the player's, the cover does not fight it",
  approx(z2.scale, 1.69), JSON.stringify(z2));
await clickViewBtn("Zoom the map out");
await sleep(300);
const z3 = await zoomState();
ok("§B CLICKING − EASES BACK to 1.3", approx(z3.scale, 1.3), JSON.stringify(z3));
await clickViewBtn("Reset the map view");
await sleep(300);
const z4 = await zoomState();
ok("§B THE RESET (⌂) RESTORES THE COVER FRAMING: scale 1, no pan",
  approx(z4.scale, 1) && approx(z4.panX, 0) && approx(z4.panY, 0), JSON.stringify(z4));
const gaps = await a.page.evaluate(() => {
  const pts = [[800, 300], [250, 500], [1350, 500]];
  return pts.map(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return { x, y, inBoard: !!el?.closest(".field-board"), tag: el?.tagName ?? "none" };
  });
});
ok("§B THE BOARD TAKES THE CLICKS THAT MISS THE PANELS: a pointer at three gaps between the rails lands inside the board",
  gaps.every((g) => g.inBoard), JSON.stringify(gaps));
// THE PAN (the click law: on a mouse the MIDDLE hand drags
// the screen; the cover scale is the pan's measure — the
// code this build re-derived).
const panBefore = await zoomState();
await a.page.mouse.move(800, 560);
await a.page.mouse.down({ button: "middle" });
await a.page.mouse.move(920, 620, { steps: 12 });
await sleep(250);
const panDuring = await zoomState();
ok("§B A MIDDLE-DRAG PANS THE BOARD: the view's pan follows the hand across the full-bleed stage",
  panDuring.panX !== null && panBefore.panX !== null && Math.abs(panDuring.panX - panBefore.panX) > 5,
  JSON.stringify({ before: panBefore.transform, during: panDuring.transform }));
await a.page.screenshot({ path: `${OUT}/grown-board-wide-drag.png` });
await a.page.mouse.up({ button: "middle" });
await sleep(200);
await clickViewBtn("Reset the map view");
await sleep(300);
// THE TAP THAT GLIDES (the click law: tap your own
// figure, then tap a tile and you glide there — the tap
// unprojects through the cover mapping this build
// re-derived, so her arriving proves the mapping true).
const figAt = () => a.page.evaluate(() => {
  const t = [...document.querySelectorAll("svg.terrain-stage text.ts-name.tender")].find((x) => x.textContent.includes("Grown Greta"));
  if (!t) return null;
  const tr = t.getBoundingClientRect();
  const disc = [...document.querySelectorAll('svg.terrain-stage circle[fill="transparent"]')]
    .map((c) => c.getBoundingClientRect())
    .find((r) => Math.abs((r.left + r.width / 2) - (tr.left + tr.width / 2)) < 130 && Math.abs((r.top + r.height / 2) - tr.top) < 130);
  if (!disc) return null;
  return { x: disc.left + disc.width / 2, y: disc.top + disc.height / 2, labelX: tr.left + tr.width / 2, labelY: tr.top + tr.height / 2 };
});
const fig0 = await figAt();
ok("§B GRETA'S OWN FIGURE STANDS ON THE BOARD (the tap that chooses her has somewhere true to land)",
  !!fig0, JSON.stringify(fig0));
if (fig0) {
  await a.page.mouse.click(fig0.x, fig0.y);
  await sleep(400);
  const chosen = await a.page.evaluate(() => !!document.querySelector(".placing-bar.unit-bar"));
  ok("§B TAPPING HER FIGURE CHOOSES HER (the tender bar stands: 'tap a tile and you glide there')",
    chosen);
  await a.page.mouse.click(fig0.x + 260, fig0.y + 30);
  let moved = 0;
  for (let i = 0; i < 26 && moved <= 50; i++) {
    await sleep(300);
    const f = await figAt();
    if (f) moved = Math.hypot(f.labelX - fig0.labelX, f.labelY - fig0.labelY);
    if (i === 3) await a.page.screenshot({ path: `${OUT}/grown-board-wide-glide.png` });
  }
  ok("§B THE TAP GLIDES HER: her figure crossed the board toward the tapped tile (the cover unprojection lands taps on true ground)",
    moved > 50, `moved=${Math.round(moved)}px`);
}
await a.page.close();

/* ══ §C THE TALL WINDOW — THE IPAD'S SHAPE ════════════ */
console.log("§C the tall window (1024×1366) — the grown board covers there too");
const c = await openRoom(G, "stage-fills-greta-tall", 1024, 1366);
ok("§C Greta's room stands in the tall window, no page errors", c.stands && c.errs.length === 0, c.errs.join(" | ").slice(0, 200));
const geoC = await geometry(c.page);
okFill("§C", geoC);
ok("§C THE COVER CROPS HORIZONTALLY at this tall shape: the flower runs past the left and the right",
  !!geoC.ext && geoC.ext.left < -20 && geoC.ext.right > geoC.iw + 20, JSON.stringify(geoC.ext));
await c.page.screenshot({ path: `${OUT}/grown-board-tall.png` });
await c.page.close();

/* ══ §D THE STANDARD BOARD FILLS TOO ══════════════════ */
console.log("§D the standard board (ring 6) in the wide window");
const d = await openRoom(W, "stage-fills-willa-wide", 1600, 1000);
ok("§D Willa's room stands on the standard board, no page errors", d.stands && d.errs.length === 0, d.errs.join(" | ").slice(0, 200));
const geoD = await geometry(d.page);
okFill("§D", geoD);
ok("§D THE GROWN BOARD PAINTS MORE GROUND than the standard (the fill is the frame's, not a board size)",
  geoA.faces > geoD.faces, `grown faces=${geoA.faces} standard faces=${geoD.faces}`);
await d.page.screenshot({ path: `${OUT}/standard-board-wide.png` });
await d.page.close();

/* ══ §E THE WATCHER'S DOOR ════════════════════════════ */
console.log("§E the watcher's road — the plain door, as in Nigel's screenshot");
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(BASE + "/table", { waitUntil: "domcontentloaded", timeout: 60000 });
  let doorText = "";
  try { await page.waitForSelector(".table-door", { timeout: 30000 }); } catch { /* named below */ }
  doorText = await page.evaluate(() => document.body.innerText.slice(0, 300)).catch(() => "");
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Watch the Table") || x.textContent.trim() === "Watch instead");
    if (!b) return false;
    b.click();
    return true;
  });
  ok("§E THE DOOR OFFERS THE WATCH, and the watch is taken (this scratch server stands the dev door — its watch button reads 'Watch instead'; the watch join is the same)",
    clicked, doorText.replace(/\n/g, " · ").slice(0, 220));
  let stands = true;
  try { await page.waitForSelector(".table-room", { timeout: 30000 }); } catch { stands = false; }
  await sleep(2500);
  ok("§E THE WATCHER'S ROOM STANDS, no page errors", stands && errs.length === 0, errs.join(" | ").slice(0, 200));
  const geoE = await geometry(page);
  okFill("§E", geoE);
  await page.screenshot({ path: `${OUT}/watcher-wide.png` });
  await page.close();
}
await browser.close();

console.log(`\nTABLE STAGE FILLS THE WINDOW DRIVE: ${pass} passed, ${fail} failed`);
console.log(`  .. screenshots kept: ${OUT}/grown-board-wide.png · grown-board-wide-drag.png · grown-board-wide-glide.png · grown-board-tall.png · standard-board-wide.png · watcher-wide.png`);
process.exit(fail ? 1 : 0);
