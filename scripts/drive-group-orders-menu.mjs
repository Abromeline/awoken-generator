// THE GROUP ORDERS MENU — THE FIX BUILD'S DRIVE (2026-10-24).
// Nigel (2026-10-23 23:42): "i was able to selece a group of
// awoken but the action menue did not apear so i could not
// give them orders." Boots the real server on a scratch
// DATA_DIR and the real built client in headless Chrome under
// iPad emulation (touch), and proves the fix on the homeland:
//   §0 a touch TAP on one Awokin still raises ITS single
//      orders wheel (the standing behaviour, untouched).
//   §1 a TOUCH drag-select — beginning on a standing Awokin,
//      War-Grounds dock CLOSED, the map's normal posture —
//      raises the GROUP orders menu (March · Attack · Defend
//      · Follow) for the two caught, who wear the gold of
//      choosing. Before the fix this drag only panned the
//      screen: the band armed for a finger only while the
//      fine-edit dock stood open (the wgTileId gate in
//      Territory's onPointerDown), so no group menu could
//      ever appear for a touch player.
//   §2 an order issued from the group menu (Follow) lands on
//      BOTH selected Awoken through the standing order path
//      (the server's own read says so).
//   §3 a touch drag catching ONE Awokin raises its single
//      wheel, unchanged (its name on the caption, Patrol
//      among its doors).
//   §4 the menu dismisses (its catch), and a single choosing
//      afterwards ends the company (the gold lifts).
//   §5 the MOUSE road is untouched: a mouse drag-select with
//      the dock closed raises the same group menu; Escape
//      dismisses it.
//   §6 a touch drag from EMPTY ground still pans the screen
//      and chooses no one — the finger's pan law survives.
//   §7 with the dock OPEN, a touch drag begun on the exposed
//      map whose release lands over the dock's column still
//      completes: the menu raises (before the fix the
//      release never reached the map's handlers and the
//      drawn band hung with no menu at all).
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-group-orders-menu.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

const OUT = "/home/hatch/workspace/group-orders-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-group-orders-"));
process.env.PORT = "3987";
process.env.WORKSHOP_PASSWORD = "group-orders-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3987";
const PW = "group-orders-drive-password";
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
      .run(`${name} ${cat}`, cat, partPower, partPower, `groupord/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: partPower, toughness: partPower, element: "root" });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `groupord/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
const waitFor = async (fn, what, ms = 20000) => {
  const s = Date.now();
  while (Date.now() - s < ms) { if (await fn()) return true; await sleep(400); }
  throw new Error("drive wait: " + what);
};

const claim = await call("claimTender", { password: PW, tenderName: "Group Orders Tender" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
const now = Date.now();
db.prepare(`INSERT INTO tender_progress (owner_key, class_key, weapon_key, hp, weapon_next_at, total_exp, updated_at)
  VALUES (?, 'warden', 'sword', 100, ?, 3800, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', hp = 100, total_exp = 3800`).run(ownerKey, now + 600000, now);
const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', 0, ?)");
const tileId = new Map();
for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
  if (hexDist({ q, r }, { q: 0, r: 0 }) > 4) continue;
  tileId.set(`${q},${r}`, Number(insTile.run(ownerKey, q, r, now).lastInsertRowid));
}
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?)").run(ownerKey, now);
const insPlace = db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, follow, hp) VALUES (?, ?, ?, ?, ?, ?, 30)");
const seedAt = (name, q, r) => {
  const id = seedAwokin(ownerKey, "Group Orders Tender", name, 2);
  insPlace.run(ownerKey, id, tileId.get(`${q},${r}`), now, now, 0);
  return id;
};
// The company the finger will choose: a western pair for the
// plain drags, a clear-of-overlays column pair for the single
// and over-dock drags. (Solo stands at (1,0), not farther
// east: at this viewport the fixed Terrain Map button
// (bottom:200px, right:90px, a 108px image) covers the ground
// around (2,0) — a tap there would land on the button, not
// the Awokin, in the real game too.)
const bandA = seedAt("Band One", -2, 0);
const bandB = seedAt("Band Two", -2, 1);
const solo = seedAt("Solo", 1, 0);
const eastMate = seedAt("East Mate", 1, 1);
const placementOf = async (id) => {
  const t = await call("getTerritory", {}, claim.token);
  return (t.placements ?? []).find((p) => p.awakenedId === id) ?? null;
};

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.emulate({
  viewport: { width: 1180, height: 820, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, claim.token);
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
await sleep(800);

const clearReturnReport = async () => {
  for (let i = 0; i < 4; i++) {
    const stood = await page.evaluate(() => !!document.querySelector(".return-report-overlay"));
    if (!stood) return;
    await page.mouse.click(24, 24);
    await sleep(400);
  }
};
// Painted figure boxes, read as a player's finger finds them.
const figBoxes = async () => page.evaluate(() => {
  const out = [];
  for (const g of document.querySelectorAll("g.field-drifter, g.field-patroller")) {
    const r = g.getBoundingClientRect();
    if (r.width) out.push({ cx: r.left + r.width / 2, cy: r.top + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom });
  }
  return out;
});
const westPair = (figs) => [...figs].sort((a, b) => a.cx - b.cx).slice(0, 2);
// The eastern column — Solo (1,0) over East Mate (1,1) — read
// as the two easternmost figures, so a follower walking its
// road home through the middle ground (§2 sets two walking)
// is never swept into the pair's box by a bare x-filter.
const eastPair = (figs) => [...figs].sort((a, b) => b.cx - a.cx).slice(0, 2).sort((a, b) => a.cy - b.cy); // [Solo, East Mate]
const soloFig = (figs) => eastPair(figs)[0];
const wheelState = async () => page.evaluate(() => ({
  wheel: !!document.querySelector(".gw-wheel"),
  discs: [...document.querySelectorAll(".gw-disc")].map((d) => d.textContent ?? ""),
  caption: document.querySelector(".gw-caption")?.textContent ?? "",
  chosen: document.querySelectorAll(".field-chosen").length,
}));
const waitWheel = async () => {
  await page.waitForSelector(".gw-wheel", { timeout: 9000 });
  await sleep(250);
  return wheelState();
};
const touchDrag = async (x0, y0, x1, y1, steps = 12) => {
  await page.touchscreen.touchStart(x0, y0);
  for (let i = 1; i <= steps; i++) {
    await page.touchscreen.touchMove(x0 + (x1 - x0) * (i / steps), y0 + (y1 - y0) * (i / steps));
    await sleep(45);
  }
  await page.touchscreen.touchEnd();
  await sleep(300);
};
const touchPath = async (pts, stepsPerLeg = 10) => {
  await page.touchscreen.touchStart(pts[0][0], pts[0][1]);
  for (let leg = 1; leg < pts.length; leg++) {
    const [ax, ay] = pts[leg - 1], [bx, by] = pts[leg];
    for (let i = 1; i <= stepsPerLeg; i++) {
      await page.touchscreen.touchMove(ax + (bx - ax) * (i / stepsPerLeg), ay + (by - ay) * (i / stepsPerLeg));
      await sleep(40);
    }
  }
  await page.touchscreen.touchEnd();
  await sleep(300);
};
// The company drag over the western pair: the box is built
// from the pair's combined painted extent — the finger begins
// a shade west of the TOP figure (still on its ground — the
// press test's reach is one hex) and sweeps past the lower
// figure's feet, so both standings fall inside the band.
const pairBox = (pr) => ({
  x0: Math.min(...pr.map((f) => f.cx)) - 26,
  y0: Math.min(...pr.map((f) => f.cy)) - 10,
  x1: Math.max(...pr.map((f) => f.cx)) + 30,
  y1: Math.max(...pr.map((f) => f.bottom)) + 34,
});
const dragWestPair = async () => {
  const b = pairBox(westPair(await figBoxes()));
  await touchDrag(b.x0, b.y0, b.x1, b.y1);
};
const tapDisc = async (txt) => {
  const box = await page.evaluate((t) => {
    const d = [...document.querySelectorAll(".gw-disc")].find((x) => (x.textContent ?? "").includes(t));
    if (!d) return null;
    const r = d.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, txt);
  if (!box) throw new Error("wheel disc not found: " + txt);
  await page.touchscreen.tap(box.x, box.y);
  await sleep(400);
};
const dismissWheel = async () => {
  await page.touchscreen.tap(1150, 40); // the wheel's own catch, a bare corner
  await sleep(500);
};

console.log("§0 the single tap, untouched");
{
  await clearReturnReport();
  const target = soloFig(await figBoxes());
  ok("Solo stands painted on the eastern ground", !!target, JSON.stringify(await figBoxes()));
  await page.touchscreen.tap(target.cx, target.cy);
  const s = await waitWheel();
  ok("a touch tap on one Awokin raises ITS single orders wheel", s.wheel && s.caption.includes("Solo"), JSON.stringify(s));
  await dismissWheel();
  ok("the single wheel dismisses on its catch", !(await wheelState()).wheel);
}

console.log("§1 the touch drag-select, dock closed — the group menu");
{
  await clearReturnReport();
  const figs = await figBoxes();
  ok("four Awoken stand painted on the land", figs.length === 4, JSON.stringify(figs));
  await dragWestPair();
  const s = await waitWheel();
  ok("drag-selecting TWO Awoken by touch raises the group orders menu",
    s.wheel && ["March", "Attack", "Defend", "Follow"].every((w) => s.discs.some((t) => t.includes(w))),
    JSON.stringify(s));
  ok("the menu speaks for the company", s.caption.includes("company") && s.caption.includes("2 chosen"), s.caption);
  ok("both caught Awoken wear the gold of choosing", s.chosen === 2, `chosen=${s.chosen}`);
  await page.screenshot({ path: `${OUT}/group-menu-touch.png` });
}

console.log("§2 the order from the menu lands on the selection");
{
  await tapDisc("Follow");
  await waitFor(async () => (await placementOf(bandA))?.follow === 1 && (await placementOf(bandB))?.follow === 1,
    "the company's Follow order lands on both", 15000);
  ok("the Follow order reaches BOTH selected Awoken through the standing path", true);
  ok("issuing the order closed the menu (no extra step)", !(await wheelState()).wheel);
}

console.log("§3 a touch drag catching ONE raises its single wheel, unchanged");
{
  await clearReturnReport();
  const sf = soloFig(await figBoxes());
  // Begin a shade west of Solo (on its ground), sweep a small box around it alone.
  await touchDrag(sf.cx - 25, sf.cy, sf.cx + 20, sf.bottom + 26);
  const s = await waitWheel();
  ok("one caught by the band gets ITS OWN wheel (its name on the caption)",
    s.wheel && s.caption.includes("Solo"), JSON.stringify(s));
  ok("the single wheel keeps its own doors (Patrol among them)",
    ["March", "Attack", "Defend", "Follow", "Patrol"].every((w) => s.discs.some((t) => t.includes(w))),
    JSON.stringify(s.discs));
  await dismissWheel();
}

console.log("§4 dismissal — the menu closes and a new choosing ends the company");
{
  // The eastern pair stands un-ordered (the western pair is
  // away following §2's order, walking its road — a band's
  // press test reads standings, and a marching figure is
  // chosen by its road, not by a fresh press on its tile).
  const eb = pairBox(eastPair(await figBoxes()));
  await touchDrag(eb.x0, eb.y0, eb.x1, eb.y1);
  const s1 = await waitWheel();
  ok("the group menu raises again for a fresh drag-select", s1.wheel && s1.chosen >= 2, JSON.stringify(s1));
  await dismissWheel();
  ok("tapping the catch dismisses the menu", !(await wheelState()).wheel);
  const sf = soloFig(await figBoxes());
  await page.touchscreen.tap(sf.cx, sf.cy);
  const s3 = await waitWheel();
  ok("a single tap afterwards raises the single wheel and the company's gold lifts",
    s3.wheel && s3.caption.includes("Solo") && s3.chosen === 0, JSON.stringify(s3));
  await dismissWheel();
}

console.log("§5 the mouse road, untouched");
{
  await clearReturnReport();
  // The eastern pair does this run's mouse work: the western
  // pair is away following §2's order, and where a walking
  // figure stands varies with the run's timing — the mouse
  // road is proven on standings that hold still.
  const b = pairBox(eastPair(await figBoxes()));
  await page.mouse.move(b.x0 - 14, b.y0 - 40);
  await page.mouse.down();
  await page.mouse.move(b.x1 + 10, b.y1 + 2, { steps: 12 });
  await page.mouse.up();
  const s = await waitWheel();
  ok("a mouse drag-select still raises the group orders menu",
    s.wheel && ["March", "Attack", "Defend", "Follow"].every((w) => s.discs.some((t) => t.includes(w))) && s.chosen === 2,
    JSON.stringify(s));
  await page.keyboard.press("Escape");
  await sleep(500);
  ok("Escape dismisses the mouse-raised menu", !(await wheelState()).wheel);
}

console.log("§6 a touch drag from empty ground still pans");
{
  await clearReturnReport();
  // Set §5's company down first, by the standing road: a
  // single choosing ends the company (Escape alone closes a
  // menu but leaves the chosen standing, as ever).
  const sf0 = soloFig(await figBoxes());
  await page.touchscreen.tap(sf0.cx, sf0.cy);
  await waitWheel();
  await dismissWheel();
  ok("the company is set down before the pan test", (await wheelState()).chosen === 0);
  const probe = await page.evaluate(() => {
    const figs = [...document.querySelectorAll("g.field-drifter, g.field-patroller")].map((g) => {
      const r = g.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    // A hit polygon whose centroid stands well clear of every
    // figure (the press test's reach is one hex — the start
    // must be empty ground by more than that measure) AND is
    // truly the topmost thing at its point: floating buttons
    // (the eye-toggle and its kin) sit over parts of the map,
    // and a drag beginning on one is no map drag at all.
    let start = null;
    for (const p of document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]')) {
      const r = p.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (!(figs.every((f) => Math.hypot(f.x - cx, f.y - cy) > 210) && cx > 480 && cx < 1080 && cy > 130 && cy < 660)) continue;
      const el = document.elementFromPoint(cx, cy);
      if (el && el.closest && el.closest(".territory-map") && el.closest("svg.territory-svg")) { start = { x: cx, y: cy }; break; }
    }
    return { start, figs };
  });
  ok("an empty-ground start point is found", !!probe.start, JSON.stringify(probe.start));
  if (probe.start) {
    // The land's movement is read off a painted figure: under
    // a pan the whole land (and everyone on it) rides east.
    const before = soloFig(await figBoxes());
    await touchDrag(probe.start.x, probe.start.y, probe.start.x + 170, probe.start.y + 30);
    const afterFig = soloFig(await figBoxes());
    const moved = afterFig && Math.abs(afterFig.cx - before.cx) > 60;
    const s = await wheelState();
    ok("the empty-ground touch drag PANS the land and raises no menu", !!moved && !s.wheel && s.chosen === 0,
      `figFrom=${before.cx} figTo=${afterFig?.cx} wheel=${s.wheel} chosen=${s.chosen}`);
  }
}

console.log("§7 dock open — a release over the dock still completes the choosing");
{
  // Fresh land (the §6 pan is set down with the page), then the dock opens.
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2500);
  const door2 = await page.$(".deck-button");
  if (door2) await door2.click();
  await page.waitForFunction(() => !!window.__tenderJump && !!window.__tenderJump.pos(), { timeout: 30000 });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Skip");
    if (b) b.click();
  });
  await sleep(600);
  await clearReturnReport();
  await page.evaluate(() => document.querySelector(".wg-toggle")?.click());
  await sleep(900);
  const dockOpen = await page.evaluate(() => document.querySelector(".wg-toggle")?.className.includes("open"));
  ok("the War-Grounds dock stands open", !!dockOpen);
  const layout = await page.evaluate(() => {
    const wrap = document.querySelector(".wg-panel")?.parentElement?.getBoundingClientRect();
    return wrap ? { left: wrap.left, right: wrap.right, top: wrap.top, bottom: wrap.bottom } : null;
  });
  ok("the dock's column stands measured", !!layout, JSON.stringify(layout));
  const ep = eastPair(await figBoxes());
  ok("the clear pair stands clear of the dock", ep.length === 2 && ep.every((f) => f.cx > layout.right + 80), JSON.stringify({ ep, layout }));
  // Begin a shade EAST of Solo (still on its ground), run
  // DOWN the eastern column past East Mate's feet, then WEST
  // and lift the finger over the dock's column — a surface
  // outside the map's own handlers.
  const relX = Math.round(layout.left + 60), relY = Math.round(layout.bottom - 26);
  const relEl = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el ? { tag: el.tagName, inMap: !!el.closest(".territory-map") } : null;
  }, { x: relX, y: relY });
  ok("the release point lands outside the map's handlers (over the dock column)", !!relEl && !relEl.inMap, JSON.stringify(relEl));
  await touchPath([
    [ep[0].cx + 26, ep[0].cy],
    [ep[0].cx + 26, relY],
    [relX, relY],
  ]);
  const s = await waitWheel();
  ok("the menu raises even though the release landed over the dock",
    s.wheel && ["March", "Attack", "Defend", "Follow"].every((w) => s.discs.some((t) => t.includes(w))) && s.chosen === 2,
    JSON.stringify(s));
  await page.screenshot({ path: `${OUT}/group-menu-over-dock.png` });
  await dismissWheel();
}

await browser.close();
console.log(`\ndrive-group-orders-menu: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
