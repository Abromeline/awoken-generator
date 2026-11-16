// MARCH IS THE DEFAULT — THIS BUILD'S DRIVE (2026-11-15).
// Boots the real server on a scratch DATA_DIR and the real
// built client in headless Chrome, and proves Nigel's
// ruling (2026-11-15 22:30) clause by clause: with an
// Awoken chosen, a RIGHT-CLICK on the land is its march
// order — fired on the release, no wheel, no orders bar,
// no confirm — while the standing precedence and the
// wheel's own march flow keep their shapes.
//   §A NOTHING CHOSEN: a right-click opens the Tender's
//      wheel, as it always has, and no figure marches.
//   §B THE CAST KEEPS ITS PRECEDENCE: with a working
//      readied AND an Awoken chosen, the right-click
//      CANCELS the run (Push 58's law — the more specific
//      state) and starts NO march; a left tap afterwards
//      looses nothing, proving the run is truly down.
//   §C THE DEFAULT MARCH: choose an Awoken, right-click a
//      reachable tile — its march record stands from the
//      release, the road ending on the clicked tile, the
//      notice the march's own ("On the road…"), never the
//      orders bar's arming words; no wheel opens.
//   §D THE FALLBACK: right-click a CURSED tile — the order
//      lands on the closest own ground the roads reach
//      (the cursed tile's nearest open neighbour), not on
//      the curse itself.
//   §E THE ISLANDED REFUSAL: an Awoken standing on a
//      detached cursed island, right-clicked toward the
//      mainland, is refused in plain words ("No road runs
//      there…") and does not march.
//   §G THE WHOLE SELECTION (Nigel's amendment, 2026-11-15
//      22:43 — "if multiple awokin are selected all of
//      those awokin begin moving at the same time"): five
//      Awoken banded as one company, ONE right-click on a
//      reachable point — every one holds a march from that
//      same release; the point fills to its standing
//      capacity (four, counting whoever already holds
//      it) and the rest spread to the nearest ground
//      around it. (§C is the single case: one chosen,
//      one march, no one else ordered.)
//   §F THE WHEEL'S OWN MARCH STANDS: the orders wheel's
//      March entry still arms the order and the tap still
//      obeys at once, exactly as before.
// Screenshots land in ~/workspace/march-default-proof/.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-march-default-right-click.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

const OUT = "/home/hatch/workspace/march-default-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-marchdefault-"));
process.env.PORT = "4001";
process.env.WORKSHOP_PASSWORD = "<MASKED_SECRET_002>";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:4001";
const PW = "marchdefault-drive-password";
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
db.pragma("busy_timeout = 8000"); // the server writes constantly; a drive-side write must wait its turn, not bounce off
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up */ }

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

function seedAwokin(ownerKey, tenderName, name, partPower = 2) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, 'root', ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, partPower, partPower, `marchdefault/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: partPower, toughness: partPower, element: "root" });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `marchdefault/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
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

/* ══ THE WORLD ════════════════════════════════════════════ */
const T = await claimWithExp("March Tender", 3800);
const now = Date.now();
db.prepare(`INSERT INTO tender_progress (owner_key, class_key, weapon_key, hp, weapon_next_at, updated_at)
  VALUES (?, 'runewright', 'sword', 100, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'runewright', hp = 100`).run(T.ownerKey, now + 600000, now);
const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', ?, ?)");
const tileId = new Map();
for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
  if (hexDist({ q, r }, { q: 0, r: 0 }) > 4) continue;
  const cursed = (q === -1 && r === 0) ? 1 : 0; // THE FALLBACK'S CURSE: one cursed hex west of centre
  tileId.set(`${q},${r}`, Number(insTile.run(T.ownerKey, q, r, cursed, now).lastInsertRowid));
}
// THE ISLAND: a detached blob of cursed ground FAR east —
// outside the radius-9 disc the server fills with cursed
// wilderness around every homeland (the first run's
// lesson: an "island" inside the disc is no island at
// all, for the wilderness joins it to the mainland and
// the roads dare the curse the whole way). A bare hex of
// nothing at distance 10 stands between this blob and
// the disc's edge — no road runs to it, ever.
for (const [q, r] of [[11, 0], [12, 0], [11, 1], [12, -1]]) {
  tileId.set(`${q},${r}`, Number(insTile.run(T.ownerKey, q, r, 1, now).lastInsertRowid));
}
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?)").run(T.ownerKey, now);
const insPlace = db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, follow, hp) VALUES (?, ?, ?, ?, ?, 0, 30)");
const seedAt = (name, q, r) => {
  const id = seedAwokin(T.ownerKey, "March Tender", name, 2);
  insPlace.run(T.ownerKey, id, tileId.get(`${q},${r}`), now, now);
  return id;
};
const walkerOne = seedAt("Walker One", 2, -2);   // §B's chosen, §C's direct marcher
const walkerTwo = seedAt("Walker Two", -3, 0);   // §D's fallback marcher
const walkerThree = seedAt("Walker Three", 0, -3); // §F's wheel-march marcher
const walkerFour = seedAt("Walker Four", 12, 0); // §E's islanded one
// §G's COMPANY (the 22:43 amendment): five Awoken standing
// together in the south, banded as one selection.
const company = [
  seedAt("Company One", 0, 2),
  seedAt("Company Two", 1, 2),
  seedAt("Company Three", 2, 2),
  seedAt("Company Four", 0, 3),
  seedAt("Company Five", 1, 3),
];
const terr0 = await call("getTerritory", {}, T.token);
const placementOf = async (id) => {
  const t = await call("getTerritory", {}, T.token);
  return (t.placements ?? []).find((p) => p.awakenedId === id) ?? null;
};
const anyMarching = async () => {
  const t = await call("getTerritory", {}, T.token);
  return (t.placements ?? []).some((p) => !!p.marchPath);
};
const workingsCount = async () => (await call("getTerritory", {}, T.token)).workings?.length ?? 0;
// The purse is small by law (10 + a bonus per Awoken
// held, clamped at the settle) — a drive that orders
// march after march must refill it between sections, or
// later orders starve and refuse for want of energy,
// wearing a refusal that is not the section's subject.
const topUpEnergy = () => {
  try {
    db.prepare("UPDATE tender_resources SET energy = 5000 WHERE owner_key = ?").run(T.ownerKey);
    const row = db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(T.ownerKey);
    console.log(`  · purse refilled (reads ${row?.energy}; the settle clamps it to the tender's cap)`);
  } catch (e) { console.log("  · purse refill FAILED:", String(e).slice(0, 120)); }
};
const roadEnd = (p) => {
  if (!p?.marchPath) return null;
  try { const r = JSON.parse(p.marchPath); return r.length ? r[r.length - 1] : null; } catch { return null; }
};

/* ══ OPEN THE LAND ════════════════════════════════════════ */
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:marchdefault]", String(e).slice(0, 200)));
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
const wheelShown = () => page.evaluate(() => !!document.querySelector(".gw-wheel"));
const noticeText = () => page.evaluate(() => document.querySelector(".hex-notice")?.textContent ?? "");
// Poll the notice line for a fragment (the notice is
// written a breath after the march record lands, and it
// does not stand forever) — returns the last text read.
const noticeIncludes = async (frag, ms = 5000) => {
  const s = Date.now();
  let last = "";
  while (Date.now() - s < ms) { last = await noticeText(); if (last.includes(frag)) return last; await sleep(250); }
  return last;
};
const clearReturnReport = async () => {
  for (let i = 0; i < 3; i++) {
    const stood = await page.evaluate(() => !!document.querySelector(".return-report-overlay"));
    if (!stood) return;
    await page.mouse.click(24, 24);
    await sleep(300);
  }
};
await clearReturnReport();
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
  await page.mouse.up();
  await sleep(700);
};
// Walk the camera with middle-drags until a tile stands in
// the open middle of the window (the click-law drive's own
// recentring, kept whole).
const centreOn = async (q, r) => {
  // The window is kept tight around the middle on
  // purpose: a tile merely "in view" can still leave its
  // neighbours hanging off the window's edge, where a
  // band box over them is clamped short (the §G lesson —
  // the company's southern row stood below the fold and
  // the band caught only the northern figures).
  for (let i = 0; i < 24; i++) {
    lattice = await solveLattice();
    const c = lattice.points[tileId.get(`${q},${r}`)].client;
    if (c.x > 300 && c.x < 1100 && c.y > 280 && c.y < 670) return true;
    const dx = Math.max(-240, Math.min(240, (700 - c.x) / 2.8));
    const dy = Math.max(-240, Math.min(240, (450 - c.y) / 2.8));
    await page.mouse.move(700, 450);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(700 + dx, 450 + dy, { steps: 10 });
    await page.mouse.up({ button: "middle" });
    await sleep(500);
  }
  lattice = await solveLattice();
  const c = lattice.points[tileId.get(`${q},${r}`)].client;
  return c.x > 200 && c.x < 1200 && c.y > 200 && c.y < 750;
};
// A click point PROVEN to land on the intended tile: the
// camera opens zoomed on the Tender, so rim tiles stand
// off-view and a blindly clamped point silently lands on
// a neighbour (the first run's §C lesson). A point counts
// only when it stands over the map AND its nearest tile
// heart — the client's own reckoning, mirrored on the
// hit polygons — is the intended tile's.
const pointLandsOn = async (pt, q, r) => {
  const want = lattice.points[tileId.get(`${q},${r}`)].svg;
  return page.evaluate(({ x, y, sx, sy }) => {
    const el = document.elementFromPoint(x, y);
    if (!el?.closest?.("svg.territory-svg")) return false;
    const svg = document.querySelector("svg.territory-svg");
    const ctm = svg.getScreenCTM();
    if (!ctm) return false;
    const sp = new DOMPoint(x, y).matrixTransform(ctm.inverse());
    const wantD = Math.hypot(sp.x - sx, sp.y - sy);
    if (wantD > 34) return false;
    let bestD = Infinity;
    for (const p of document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]')) {
      const pts = (p.getAttribute("points") ?? "").trim().split(/\s+/).map((s) => s.split(",").map(Number));
      const cx = pts.reduce((a, pt) => a + pt[0], 0) / pts.length, cy = pts.reduce((a, pt) => a + pt[1], 0) / pts.length;
      bestD = Math.min(bestD, Math.hypot(cx - sp.x, cy - sp.y));
    }
    return wantD <= bestD + 1;
  }, { x: pt.x, y: pt.y, sx: want.x, sy: want.y });
};
const verifiedPoint = async (q, r) => {
  lattice = await solveLattice();
  const c = clientOf(q, r);
  const tries = [[0, 0], [26, 0], [-26, 0], [0, 26], [0, -26], [26, 26], [-26, 26], [26, -26], [-26, -26], [52, 0], [-52, 0], [0, 52], [0, -52]];
  for (const [dx, dy] of tries) {
    const raw = { x: c.x + dx, y: c.y + dy };
    const pt = dx === 0 && dy === 0 ? await ground(raw) : raw;
    if (await pointLandsOn(pt, q, r)) return pt;
  }
  throw new Error(`verifiedPoint: no point lands on ${q},${r} — is the tile in view? (centreOn first)`);
};
const rightClickTile = async (q, r) => {
  const pt = await verifiedPoint(q, r);
  await page.mouse.click(pt.x, pt.y, { button: "right" });
  await sleep(500);
};
const leftClickTile = async (q, r) => {
  const pt = await verifiedPoint(q, r);
  await page.mouse.click(pt.x, pt.y);
  await sleep(500);
};
const bandSelect = async (q, r, label) => {
  await dragBox([[q, r]]);
  const opened = await page.waitForSelector(".gw-wheel", { timeout: 9000 }).then(() => true).catch(() => false);
  if (!opened) throw new Error(`bandSelect: no orders wheel for ${label} at ${q},${r}`);
};

/* ══ §A NOTHING CHOSEN — the wheel, and no march ═══════════ */
console.log("§A nothing chosen — the right hand opens the wheel, and no figure marches");
{
  await centreOn(2, 2);
  await rightClickTile(2, 2);
  ok("with nothing chosen, a right-click opens the wheel", await wheelShown());
  ok("with nothing chosen, no figure is on the road", !(await anyMarching()));
  await page.keyboard.press("Escape");
  await sleep(400);
  await page.screenshot({ path: `${OUT}/nothing-chosen-wheel.png` });
}

/* ══ §B THE CAST KEEPS ITS PRECEDENCE ══════════════════════ */
console.log("§B the cast keeps its precedence — a readied run is cancelled, never marched over");
{
  const grim = await call("getGrimoire", {}, T.token);
  const blade = (grim.spells ?? []).find((s) => s.engine === "blade");
  const formName = blade.forms?.unaligned ?? blade.name;
  const w0 = await workingsCount();
  // Ready the Blade the standing way (nothing chosen: the
  // right hand opens the Tender's wheel).
  await page.mouse.click(420, 300, { button: "right" });
  const opened = await page.waitForSelector(".gw-wheel", { timeout: 2500 }).then(() => true).catch(() => false);
  if (!opened) {
    await page.mouse.click(420, 300, { button: "right" });
    await page.waitForSelector(".gw-wheel", { timeout: 9000 });
  }
  await clickDisc(page, ".gw-disc.cat", "Rune");
  await sleep(500);
  await clickDisc(page, ".gw-disc", formName);
  await page.waitForFunction((fn) => (document.querySelector(".hex-notice")?.textContent ?? "").includes("readied") || (document.querySelector(".hex-notice")?.textContent ?? "").includes(fn), { timeout: 9000 }, formName).catch(() => {});
  await sleep(300);
  ok("the Blade stands readied", true);
  // Choose Walker One by the band — its orders wheel opens
  // over the readied run. (No Escape: Escape would set the
  // run down itself and prove nothing.)
  await centreOn(2, -2);
  await bandSelect(2, -2, "Walker One");
  ok("Walker One is chosen — its orders wheel stands over the readied run", await wheelShown());
  // THE RIGHT-CLICK, far from the wheel: the readied run
  // is the more specific state — it must be CANCELLED,
  // and the chosen one must NOT march.
  const far = await ground({ x: 250, y: 760 });
  await page.mouse.click(far.x, far.y, { button: "right" });
  await sleep(700);
  ok("the right-click over a readied run started NO march", !(await placementOf(walkerOne))?.marchPath && !(await anyMarching()));
  // And the run is truly down: a left tap looses nothing.
  await leftClickTile(0, 1);
  await sleep(200);
  ok("after the cancelling right-click, a left tap looses nothing — the run was set down", (await workingsCount()) === w0,
    `workings=${await workingsCount()} base=${w0}`);
  await page.screenshot({ path: `${OUT}/cast-precedence.png` });
  // Set the table for §C: Escape shuts the orders wheel;
  // a bare click on empty land sets the choosing down.
  await page.keyboard.press("Escape");
  await sleep(400);
  const bare = await ground(clientOf(3, -3));
  await page.mouse.click(bare.x, bare.y);
  await sleep(400);
  await clearTilePanel();
}

/* ══ §C THE DEFAULT MARCH ══════════════════════════════════ */
console.log("§C the default march — chosen, right-clicked, on the road from the release");
{
  await centreOn(2, -2);
  await bandSelect(2, -2, "Walker One");
  await page.keyboard.press("Escape"); // the wheel shuts; the choosing stands (Escape never clears it)
  await sleep(400);
  ok("the wheel is shut and the choosing stands", !(await wheelShown()));
  await centreOn(2, 1);
  await rightClickTile(2, 1);
  const onRoad = await waitFor(async () => roadEnd(await placementOf(walkerOne)) === tileId.get("2,1"), "Walker One's march record, from the release", 60000).catch(() => false);
  ok("the right-click's release put Walker One on the road to the clicked tile — no orders bar involved", onRoad,
    `roadEnd=${roadEnd(await placementOf(walkerOne))} want=${tileId.get("2,1")}`);
  ok("no wheel opened on the march's release", !(await wheelShown()));
  const n = await noticeIncludes("On the road");
  ok("the notice is the march's own words, not the orders bar's arming words", n.includes("On the road"), JSON.stringify(n));
  await page.screenshot({ path: `${OUT}/default-march.png` });
}

/* ══ §D THE FALLBACK ════════════════════════════════════════ */
console.log("§D the fallback — a cursed click lands on the closest own ground the roads reach");
{
  topUpEnergy();
  await centreOn(-3, 0);
  await bandSelect(-3, 0, "Walker Two");
  await page.keyboard.press("Escape");
  await sleep(400);
  await centreOn(-1, 0);
  await rightClickTile(-1, 0); // the cursed hex itself
  const landed = await waitFor(async () => roadEnd(await placementOf(walkerTwo)) === tileId.get("-2,0"), "Walker Two's road to the curse's nearest open neighbour", 60000).catch(() => false);
  ok("right-clicking the cursed hex marched Walker Two to its nearest open neighbour (-2,0)", landed,
    `roadEnd=${roadEnd(await placementOf(walkerTwo))} want=${tileId.get("-2,0")} not=${tileId.get("-1,0")}`);
  await page.screenshot({ path: `${OUT}/fallback-march.png` });
}

/* ══ §E THE ISLANDED REFUSAL ════════════════════════════════ */
console.log("§E the islanded refusal — no road runs there, in plain words");
{
  topUpEnergy();
  ok("the camera walked to the island", await centreOn(12, 0));
  await bandSelect(12, 0, "Walker Four");
  await page.keyboard.press("Escape");
  await sleep(400);
  ok("the camera walked back to the mainland", await centreOn(0, 0));
  const ptE = await verifiedPoint(0, 2);
  await page.mouse.click(ptE.x, ptE.y, { button: "right" });
  // The refusal is spoken at the release — poll for its
  // words from that breath. The land's own notices (a
  // felled Fray's loot, a wave's turn) overwrite the line
  // as they come, and one late read can miss the refusal
  // entirely (a later run's lesson, learned when the
  // loot spoke over it).
  const n = await noticeIncludes("No road runs there", 20000);
  ok("the islanded order was refused in plain words", n.includes("No road runs there"), JSON.stringify(n));
  ok("Walker Four did not march", !(await placementOf(walkerFour))?.marchPath);
  await page.screenshot({ path: `${OUT}/islanded-refusal.png` });
}

/* ══ §G THE WHOLE SELECTION (the 22:43 amendment) ═════════ */
console.log("§G the whole selection — one right-click, the whole company on the road from the one release");
{
  topUpEnergy();
  await centreOn(1, 2); // the company's middle row at the window's heart — every figure clear of the edges
  await dragBox([[0, 2], [2, 2], [0, 3], [1, 3]]);
  const wheelUp = await page.waitForSelector(".gw-wheel", { timeout: 9000 }).then(() => true).catch(() => false);
  if (!wheelUp) throw new Error("§G: the company's band raised no orders wheel");
  ok("the band chose the company — its orders wheel stands", wheelUp);
  const wheelInfo = await page.evaluate(() => {
    const w = document.querySelector(".gw-wheel");
    return w ? [...w.querySelectorAll(".gw-disc")].map((d) => (d.getAttribute("aria-label") || d.textContent || "").trim().slice(0, 40)) : [];
  });
  console.log("  · the wheel the band raised carries:", JSON.stringify(wheelInfo));
  await page.screenshot({ path: `${OUT}/group-wheel.png` });
  await page.keyboard.press("Escape"); // the wheel shuts; the company stays chosen
  await sleep(400);
  await centreOn(1, 0);
  // One territory snapshot per poll, LATCHED: five
  // separate reads apiece were slower than the marches
  // themselves on a busy machine, and the first run read
  // straight past them (the marches stand ~3.2 s a hex at
  // this pace — a fast walker can arrive between two slow
  // snapshots). A member counts as ordered if it is EVER
  // seen on the road, or ends standing on ground it did
  // not start on.
  const snapshot = async () => {
    const t = await call("getTerritory", {}, T.token);
    return new Map((t.placements ?? []).map((p) => [p.awakenedId, p]));
  };
  const before = await snapshot();
  const startTiles = new Map(company.map((id) => [id, before.get(id)?.tileId ?? null]));
  await rightClickTile(1, 0); // THE one release for all five
  const noticeP = noticeIncludes("On the road", 90000); // polled alongside the latch — the notice does not stand for a minute
  const roadSeen = new Map();
  let standing = new Map();
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const byId = await snapshot();
    standing = new Map(company.map((id) => [id, byId.get(id)?.tileId ?? null]));
    for (const id of company) {
      const p = byId.get(id);
      if (p?.marchPath) { try { const r = JSON.parse(p.marchPath); if (r.length) roadSeen.set(id, r[r.length - 1]); } catch { /* a torn read retries */ } }
    }
    if (company.every((id) => roadSeen.has(id) || (standing.get(id) !== null && standing.get(id) !== startTiles.get(id)))) break;
    await sleep(1000);
  }
  const orderedCount = company.filter((id) => roadSeen.has(id) || (standing.get(id) !== null && standing.get(id) !== startTiles.get(id))).length;
  ok("every chosen one holds a march from the same release", orderedCount === company.length, `ordered=${orderedCount}/${company.length}`);
  const ends = company.map((id) => roadSeen.get(id) ?? standing.get(id));
  // The point's lawful fill, judged AT REST: who holds
  // the point can change between any snapshot and the
  // click itself (the land's own settles move figures —
  // in this world Walker One comes to stand on (1,0)
  // from its §C march, on the land's schedule, not the
  // drive's), so the split is not read off a raced
  // snapshot. The law the amendment states is the
  // settled one: once every march has landed, the point
  // holds exactly its capacity — four figures in all,
  // the company's and whoever the land already held
  // there together — and the company's overflow stands
  // on the nearest ground around the point.
  let rest = null;
  const restDeadline = Date.now() + 120000;
  while (Date.now() < restDeadline) {
    rest = await snapshot();
    if (company.every((id) => !rest.get(id)?.marchPath)) break;
    await sleep(1000);
  }
  const pointTile = tileId.get("1,0");
  const spreadTile = tileId.get("0,0");
  const companyTiles = company.map((id) => rest.get(id)?.tileId ?? null);
  const pointTotal = [...rest.values()].filter((p) => p && p.tileId === pointTile).length;
  ok("once landed, the order point holds exactly its standing capacity — four figures in all", pointTotal === 4,
    `pointTotal=${pointTotal} companyTiles=${JSON.stringify(companyTiles)} ends=${JSON.stringify(ends)}`);
  ok("every one of the company stands on the point or on the nearest ground around it — (0,0)",
    companyTiles.every((t) => t === pointTile || t === spreadTile), `companyTiles=${JSON.stringify(companyTiles)}`);
  ok("the overflow spread — some of the company stands on the nearest ground, not the point",
    companyTiles.some((t) => t === spreadTile), `companyTiles=${JSON.stringify(companyTiles)}`);
  ok("no one outside the company was ordered", !(await placementOf(walkerFour))?.marchPath);
  const n = await noticeP;
  ok("the notice is the march's own words", n.includes("On the road"), JSON.stringify(n));
  await page.screenshot({ path: `${OUT}/group-march.png` });
}

/* ══ §F THE WHEEL'S OWN MARCH STANDS ═══════════════════════ */
console.log("§F the wheel's own march — March arms, the tap obeys, as before");
{
  topUpEnergy();
  await centreOn(0, -3);
  await bandSelect(0, -3, "Walker Three");
  await clickDisc(page, ".gw-disc", "March");
  await sleep(400);
  const armNotice = await noticeText();
  ok("the wheel's March entry armed the order (its arming words stand)", armNotice.includes("March — tap the ground"), JSON.stringify(armNotice));
  await centreOn(0, 3);
  await leftClickTile(0, 3);
  const onRoad = await waitFor(async () => roadEnd(await placementOf(walkerThree)) === tileId.get("0,3"), "Walker Three's wheel-ordered march", 60000).catch(() => false);
  ok("the tap obeyed the armed order — Walker Three is on the road to (0,3)", onRoad,
    `roadEnd=${roadEnd(await placementOf(walkerThree))} want=${tileId.get("0,3")}`);
  await page.screenshot({ path: `${OUT}/wheel-march.png` });
}

await page.close();
await browser.close();
console.log(`\nMARCH-DEFAULT DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
