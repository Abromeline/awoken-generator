// THE TAP IS NOT A ROAD (Nigel, 2026-11-03 08:45: "clicking
// on the map is still causing the tender to move and it
// shouldnt"). Boots the real server on a scratch DATA_DIR and
// the real built client in headless Chrome, and proves:
//   §A CONTROL (desktop page) — held keys still glide the
//      Tender and the server's stand follows (setTenderTile):
//      the movement machinery and this drive's witnesses are
//      alive, so a still body in §B cannot be a dead page
//      masquerading as the law.
//   §B THE STRIKE (desktop page) — plain clicks on five hexes
//      around the stand, each admitted only where the tile's
//      own hit polygon is the topmost element (no overlay or
//      chrome drinks a click): the figure does not move, ZERO
//      setTenderTile calls fire, the server's stand is unchanged.
//   §C THE MARCH TAP STILL FIRES (touch page — the orders
//      wheel's own proven road, as in drive-group-orders-menu:
//      its discs answer a touch press, not a desktop mouse) —
//      a tap on the fielded Awokin opens its orders wheel;
//      March armed there, the destination tap fires setMarch
//      and the server's placement takes up the road to the
//      tapped hex — and the Tender does not move for it.
//   §D CAST TARGETING STILL FIRES (touch page) — the Blade
//      readied through the Tender's wheel (controller → ✦ →
//      Rune → the Blade), a tap on open ground in range casts
//      (castMapWorking answers as a cast, not a refusal).
// Screenshots land in ~/workspace/map-click-proof/.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-map-click-no-move.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-mapclick-"));
process.env.PORT = "3967";
process.env.WORKSHOP_PASSWORD = "mapclick-workshop-pw";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname); // the server resolves client/dist from CWD
const PW = ["map", "click", "pw", "1"].join("-");
const BASE = "http://127.0.0.1:3967";
const OUT = "/home/hatch/workspace/map-click-proof";
mkdirSync(OUT, { recursive: true });
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
  return data;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB migration-order defect — stood up by hand, as the other drives do */ }

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
const moved = (a, b) => (a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0);

/* ══ SEED ════════════════════════════════════════════════ */
const claim = await call("claimTender", { password: PW, tenderName: "Mapclick Land" });
const token = claim.token;
const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id}`;
const now = Date.now();
db.prepare(`INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at, class_key, weapon_key, hp, weapon_next_at)
  VALUES (?, 3800, 0, ?, 'runewright', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET
  total_exp = 3800, class_key = 'runewright', hp = 100`).run(me, now, now + 600000);
const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, ?, ?, 0, ?)");
for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) {
  if (hexDist({ q, r }, { q: 0, r: 0 }) > 3) continue;
  insTile.run(me, q, r, now);
}
db.prepare("INSERT INTO tender_resources (owner_key, energy, terrain_bank, updated_at) VALUES (?, 500, 200, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500, terrain_bank = 200").run(me, now);

// One fielded Awokin, standing west at (-2,0) — §C's orders
// (the eastern ground at the desktop viewport slides under
// the face's right-hand tools, where no honest click lands).
const piece = (name, cat, el) => Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 3, 3, ?, ?, 'image/png', ?)").run(name, cat, el, `mapclick/${cat}.png`, now).lastInsertRowid);
const compJson = JSON.stringify([
  { source_id: `db:${piece("Click Body", "body", "sky")}`, name: "Click Body", category: "body", rarity: "common", power: 3, toughness: 3, element: "sky" },
  { source_id: `db:${piece("Click Arms", "arms", "sky")}`, name: "Click Arms", category: "arms", rarity: "common", power: 3, toughness: 3, element: "sky" },
  { source_id: `db:${piece("Click Head", "head", "sky")}`, name: "Click Head", category: "head", rarity: "common", power: 3, toughness: 3, element: "sky" },
]);
const awId = Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES ('Clickkin', 'Clickkin', 'mapclick/awokin.png', ?, 'tender', 'Mapclick Land', ?, ?)").run(compJson, me, now).lastInsertRowid);
const tileAt = (q, r) => Number(db.prepare("SELECT id FROM territory_tiles WHERE owner_key = ? AND q = ? AND r = ?").get(me, q, r).id);
db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, hp) VALUES (?, ?, ?, ?, ?, 30)").run(me, awId, tileAt(-2, 0), now, now);

const terr0 = await call("getTerritory", {}, token);
const terr0Data = terr0.data ?? terr0;
ok("the seeded Tender stands on his land", !!terr0Data.tender?.tileId, JSON.stringify(terr0Data.tender ?? {}));
ok("the seeded Awokin stands on the field", (terr0Data.placements ?? []).some((p) => p.awakenedId === awId));

const grimBody = await call("getGrimoire", {}, token);
const grim = grimBody.data ?? grimBody;
const blade = (grim.spells ?? []).find((s) => s.engine === "blade");
ok("the book holds the single Blade (a one-tap rune)", !!blade, JSON.stringify((grim.spells ?? []).map((s) => s.key)));
const formName = blade.forms?.unaligned ?? blade.name;

const standOf = async () => {
  const t = await call("getTerritory", {}, token);
  const d = t.data ?? t;
  return d.tender?.tileId ?? null;
};
const placementOf = async () => {
  const t = await call("getTerritory", {}, token);
  const d = t.data ?? t;
  return (d.placements ?? []).find((p) => p.awakenedId === awId) ?? null;
};

// The fetch witness, installed per page: every stand report,
// cast and march the page sends, the march's destination read
// off its own request body.
const WITNESS = `(() => {
  window.__standLog = []; window.__castLog = []; window.__marchLog = [];
  const of = window.fetch.bind(window);
  window.fetch = async (...a) => {
    const r = await of(...a);
    try {
      const u = String(a[0]);
      if (u.includes("setTenderTile")) window.__standLog.push({ at: Date.now(), ok: r.ok });
      if (u.includes("setMarch")) {
        let tileId = null;
        try { tileId = JSON.parse(a[1]?.body ?? "{}").tileId ?? null; } catch { /* body unread — the count still speaks */ }
        window.__marchLog.push({ at: Date.now(), ok: r.ok, tileId });
      }
      if (u.includes("castMapWorking")) {
        const j = await r.clone().json().catch(() => null);
        const raw = JSON.stringify(j ?? {});
        window.__castLog.push({ at: Date.now(), ok: r.ok, fizzled: raw.includes('"fizzled":true'), refused: !r.ok, note: (j && (j.error || j.message)) || raw.slice(0, 120) });
      }
    } catch { /* the witness never breaks the page */ }
    return r;
  };
})()`;

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });

const openFace = async (pg, tap) => {
  await pg.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
  await pg.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2500);
  const doorEl = await pg.$(".deck-button");
  if (!doorEl) throw new Error("territory: no .deck-button on the home face");
  if (tap) { const b = await doorEl.boundingBox(); await pg.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); }
  else await doorEl.click();
  await pg.waitForFunction(() => !!window.__tenderJump && !!window.__tenderJump.pos(), { timeout: 30000 });
  await pg.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Skip");
    if (b) b.click();
  });
  await sleep(800);
  // The return report stands over the whole face on arrival
  // and swallows every click until it is tended past — clear
  // it, and PROVE it is gone, or a later section's stillness
  // could be the overlay's doing and not the law's.
  for (let i = 0; i < 4; i++) {
    const stood = await pg.evaluate(() => !!document.querySelector(".return-report-overlay"));
    if (!stood) break;
    if (tap) await pg.touchscreen.tap(24, 24); else await pg.mouse.click(24, 24);
    await sleep(400);
  }
  await pg.evaluate(WITNESS);
};

/* ══ §A + §B — THE DESKTOP PAGE ══════════════════════════ */
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:territory]", String(e).slice(0, 200)));
await openFace(page, false);
ok("the return report is cleared — clicks will reach the land itself",
  !(await page.evaluate(() => !!document.querySelector(".return-report-overlay"))));

const figPos = () => page.evaluate(() => window.__tenderJump.pos());

// Solve the tile lattice: each tile's transparent hit
// polygon, matched to its hex — the casting-movement
// drive's own reckoning.
const terrNow = await call("getTerritory", {}, token);
const terrData = terrNow.data ?? terrNow;
const pairs = await page.evaluate((tilesArg) => {
  const polys = [...document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]')];
  const cents = polys.map((p) => {
    const pts = (p.getAttribute("points") ?? "").trim().split(/\s+/).map((s) => s.split(",").map(Number));
    return { x: pts.reduce((a, pt) => a + pt[0], 0) / pts.length, y: pts.reduce((a, pt) => a + pt[1], 0) / pts.length };
  });
  const k = 54 / 796, U = [1292 * k, 470 * k], V = [0, 948 * k];
  const out = [];
  for (const t of tilesArg) {
    const ex = 250 + t.q * U[0] + t.r * V[0], ey = 170 + t.q * U[1] + t.r * V[1];
    let bi = -1, bd = 1e9;
    cents.forEach((c, i) => { const d = Math.hypot(c.x - ex, c.y - ey); if (d < bd) { bd = d; bi = i; } });
    if (bd < 12) out.push({ id: t.id, q: t.q, r: t.r, cursed: t.cursed ? 1 : 0, poly: bi, bd });
  }
  return out;
}, (terrData.tiles ?? []).map((t) => ({ id: t.id, q: t.q, r: t.r, cursed: t.cursed })));
ok("the tile lattice is solved", pairs.length >= 19, `pairs=${pairs.length}`);

// A tile may be clicked only where its own hit polygon is
// the topmost element — the honesty qualifier.
const clickPointFor = async (pg, pair) => pg.evaluate((i) => {
  const p = document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]')[i];
  if (!p) return null;
  const r = p.getBoundingClientRect();
  const pt = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  const top = document.elementFromPoint(pt.x, pt.y);
  return top === p ? pt : null;
}, pair.poly);
const clickTile = async (pair) => {
  const box = await page.evaluate((i) => {
    const p = document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]')[i];
    if (!p) return null;
    const r = p.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, pair.poly);
  if (!box) throw new Error("clickTile: no polygon for tile " + pair.id);
  await page.mouse.click(box.x, box.y);
};
const standTileNow = async () => {
  const sid = await standOf();
  return (terrData.tiles ?? []).find((t) => t.id === sid) ?? { q: 0, r: 0 };
};

console.log("§A control — held keys glide the Tender, the server's stand follows");
{
  const c0 = await figPos();
  const n0 = await page.evaluate(() => window.__standLog.length);
  const sA0 = await standOf();
  // East, away from the fielded Awokin. The stride's pace
  // varies with the machine's load, so the hold lasts until
  // the glide has plainly happened (bounded at nine seconds)
  // rather than a fixed count: the anchor reports only on a
  // hex crossing, and the control must reach one.
  await page.keyboard.down("d");
  let c1 = await figPos();
  for (let i = 0; i < 18 && moved(c0, c1) <= 60; i++) { await sleep(500); c1 = await figPos(); }
  await page.keyboard.up("d");
  await sleep(900); // the final anchor report lands after the stop
  const n1 = await page.evaluate(() => window.__standLog.length);
  const sA1 = await standOf();
  ok("CONTROL: held keys glide the body", moved(c0, c1) > 60, `moved=${moved(c0, c1).toFixed(1)}`);
  ok("CONTROL: the glide writes the stand to the server (setTenderTile fired)", n1 > n0, `stands ${n0} -> ${n1}`);
  ok("CONTROL: the server's stand tile changed under the key glide", sA1 !== sA0, `stand ${sA0} -> ${sA1}`);
}

console.log("§B the strike — five plain clicks, no movement, no stand writes");
{
  const standTile = await standTileNow();
  const candidates = pairs
    .map((p) => ({ p, d: hexDist(p, standTile) }))
    .filter((x) => x.d >= 1 && x.d <= 3 && !x.p.cursed && x.p.id !== tileAt(-2, 0))
    .sort((a, b) => a.d - b.d || a.p.q - b.p.q || a.p.r - b.p.r);
  const targets = [];
  for (const c of candidates) {
    if (targets.length >= 5) break;
    if (await clickPointFor(page, c.p)) targets.push(c);
  }
  ok("five plain click targets stand around the Tender, each with its own hit polygon topmost",
    targets.length === 5, `targets=${targets.length}`);
  const p0 = await figPos();
  const s0 = await standOf();
  const n0 = await page.evaluate(() => window.__standLog.length);
  for (const t of targets) { await clickTile(t.p); await sleep(450); }
  await sleep(3000); // a tap-road glide would have arrived and reported inside this window
  const p1 = await figPos();
  const s1 = await standOf();
  const n1 = await page.evaluate(() => window.__standLog.length);
  ok("the figure did not move for plain clicks", moved(p0, p1) < 5, `moved=${moved(p0, p1).toFixed(1)}`);
  ok("ZERO setTenderTile calls fired for plain clicks", n1 === n0, `stands ${n0} -> ${n1}`);
  ok("the server's stand tile is unchanged", s1 === s0, `stand ${s0} -> ${s1}`);
  await page.screenshot({ path: `${OUT}/after-plain-clicks.png` });
}
await page.close();

/* ══ §C + §D — THE TOUCH PAGE (the wheel's own road) ════ */
const tpage = await browser.newPage();
await tpage.emulate({
  viewport: { width: 1180, height: 820, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});
tpage.on("pageerror", (e) => console.log("[pageerror:touch]", String(e).slice(0, 200)));
await openFace(tpage, true);
ok("the touch face stands clear of the return report",
  !(await tpage.evaluate(() => !!document.querySelector(".return-report-overlay"))));

// Qualifying tap points on the touch face: hit polygons whose
// own centre is the topmost element there, in CSS pixels,
// with client-space distance from a given point.
const touchPolys = async (from, minD, maxD) => tpage.evaluate(({ fx, fy, minD, maxD }) => {
  const out = [];
  document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]').forEach((p, i) => {
    const r = p.getBoundingClientRect();
    const pt = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    const top = document.elementFromPoint(pt.x, pt.y);
    if (top !== p) return;
    const d = Math.hypot(pt.x - fx, pt.y - fy);
    if (d >= minD && d <= maxD) out.push({ i, x: pt.x, y: pt.y, d });
  });
  return out.sort((a, b) => a.d - b.d);
}, { fx: from.x, fy: from.y, minD, maxD });
const tapDiscTouch = async (txt, catOnly = false) => {
  // The wheel re-renders its ring a beat after a tab tap —
  // wait for the disc to stand before reaching for it.
  await tpage.waitForFunction((t, co) => [...document.querySelectorAll(co ? ".gw-disc.cat" : ".gw-disc")]
    .some((x) => ((x.getAttribute("aria-label") || "") + " " + (x.textContent ?? "")).includes(t)), { timeout: 6000 }, txt, catOnly)
    .catch(() => { throw new Error("wheel disc never stood: " + txt); });
  const pt = await tpage.evaluate(({ t, catOnly }) => {
    const ds = [...document.querySelectorAll(catOnly ? ".gw-disc.cat" : ".gw-disc")];
    const d = ds.find((x) => ((x.getAttribute("aria-label") || "") + " " + (x.textContent ?? "")).includes(t));
    if (!d) return null;
    const r = d.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, { t: txt, catOnly });
  if (!pt) throw new Error("wheel disc not found: " + txt);
  await tpage.touchscreen.tap(pt.x, pt.y);
};

console.log("§C the march tap — the orders wheel's tap still sends the Awokin");
{
  const fig = await tpage.evaluate(() => {
    const gs = [...document.querySelectorAll("g.field-drifter, g.field-patroller")]
      .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    const g = gs[0];
    if (!g) return null;
    for (const im of g.querySelectorAll("image")) {
      const r = im.getBoundingClientRect();
      if (!r.width) continue;
      for (const fx of [0.2, 0.35, 0.5, 0.65, 0.8]) for (const fy of [0.2, 0.35, 0.5, 0.65, 0.8]) {
        const x = r.left + r.width * fx, y = r.top + r.height * fy;
        const top = document.elementFromPoint(x, y);
        if (top && g.contains(top)) return { x, y, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      }
    }
    return null;
  });
  ok("the fielded Awokin is painted on the touch face, with a point its own image tops", !!fig);
  const standsC0 = await tpage.evaluate(() => window.__standLog.length);
  await tpage.touchscreen.tap(fig.x, fig.y);
  await tpage.waitForSelector(".gw-wheel", { timeout: 9000 });
  await sleep(700); // the wheel's discs settle into their ring before they are read
  const discs = await tpage.evaluate(() => [...document.querySelectorAll(".gw-disc")].map((d) => d.textContent ?? ""));
  ok("a tap on the Awokin opens its orders wheel (March among its entries)", discs.some((t) => t.includes("March")), JSON.stringify(discs));
  await tapDiscTouch("March");
  let notice = "";
  try {
    await tpage.waitForFunction(() => {
      const t = document.querySelector(".hex-notice")?.textContent ?? "";
      return t.includes("March") || t.includes("On the road");
    }, { timeout: 9000 });
    notice = await tpage.evaluate(() => document.querySelector(".hex-notice")?.textContent ?? "");
  } catch { /* diagnosed below; the destination tap itself is the true witness */ }
  // Armed ("March — tap the ground…") or already fired ("On
  // the road…" — the word the face speaks once the order has
  // gone out): either proves the wheel's March entry engaged.
  ok("the March stands armed — tap the ground", notice.includes("March") || notice.includes("On the road"), notice.slice(0, 90));
  // Destination candidates: qualifying polygons a march away
  // from the Awokin — never its own hex (the figure's centre
  // is the inner bound) — tapped in turn until the order fires.
  const dests = await touchPolys({ x: fig.cx, y: fig.cy }, 55, 340);
  ok("march destination hexes stand ready around the Awokin", dests.length >= 2, `dests=${dests.length}`);
  const marches0 = await tpage.evaluate(() => window.__marchLog.length);
  let fired = null;
  for (const d of dests.slice(0, 6)) {
    await tpage.touchscreen.tap(d.x, d.y);
    await sleep(650);
    const log = await tpage.evaluate(() => window.__marchLog);
    if (log.length > marches0 && log[log.length - 1].ok) { fired = log[log.length - 1]; break; }
  }
  // A loaded box answers slowly: give a fired order's record
  // a long moment to land before calling the tap unfired.
  for (let i = 0; i < 20 && !fired; i++) {
    const log = await tpage.evaluate(() => window.__marchLog);
    if (log.length > marches0 && log[log.length - 1].ok) { fired = log[log.length - 1]; break; }
    await sleep(400);
  }
  ok("the destination tap fired setMarch", !!fired, JSON.stringify(await tpage.evaluate(() => window.__marchLog)));
  // The march's proof is the arrival: the placement's stand
  // becomes the tapped tile (a one-hex march can settle inside
  // a single poll, so no witness may depend on catching the
  // road mid-flight).
  let arrived = null;
  if (fired) {
    for (let i = 0; i < 40 && !arrived; i++) {
      const pl = await placementOf();
      if (pl && Number(pl.tileId) === Number(fired.tileId)) arrived = pl;
      else await sleep(500);
    }
  }
  ok("the Awokin walked the march road to the tapped hex (its stand is the tapped tile now)", !!arrived,
    JSON.stringify(await placementOf()));
  if (arrived) {
    const destRow = db.prepare("SELECT q, r FROM territory_tiles WHERE id = ?").get(Number(fired.tileId));
    const dest = destRow ? { q: destRow.q, r: destRow.r } : null;
    const near = dest && arrived.posQ != null && arrived.posR != null
      ? hexDist({ q: arrived.posQ, r: arrived.posR }, dest) <= 1.01 : false;
    ok("the march's standing point lies on the tapped hex (the free-point law)", near,
      `pos=(${arrived.posQ},${arrived.posR}) dest=${JSON.stringify(dest)}`);
  }
  const standsC1 = await tpage.evaluate(() => window.__standLog.length);
  ok("the Tender did not move for the march tap either", standsC1 === standsC0, `stands ${standsC0} -> ${standsC1}`);
  await tpage.screenshot({ path: `${OUT}/march-tap-fired.png` });
}

console.log("§D cast targeting — the readied Blade still casts on a tap");
{
  // The Tender's own tap (touch hands): a transparent circle
  // over his figure opens his controller; its ✦ opens the
  // wheel where the working is readied.
  const tapCircle = await tpage.evaluate(() => {
    // His figure: the pointer-events="none" group holding his
    // painted image. His tap circle: the transparent,
    // pointer-events="all" circle seated over that image.
    let fig = null;
    for (const g of document.querySelectorAll("svg g")) {
      if (g.getAttribute("pointer-events") !== "none") continue;
      const im = g.querySelector("image");
      if (im) { const r = im.getBoundingClientRect(); if (r.height > 30) { fig = r; break; } }
    }
    if (!fig) return null;
    for (const c of document.querySelectorAll("svg circle")) {
      if (c.getAttribute("fill") !== "transparent") continue;
      const r = c.getBoundingClientRect();
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      if (!(cx >= fig.x - 20 && cx <= fig.x + fig.width + 20 && cy >= fig.y - 30 && cy <= fig.y + fig.height + 30)) continue;
      // The face's own furniture can stand over part of the
      // circle (the beacon switch stood over its centre in
      // this drive's first runs) — tap a point of the circle
      // the face leaves bare, proven by the point's own top.
      for (let fx = 0.15; fx <= 0.86; fx += 0.12) {
        for (let fy = 0.15; fy <= 0.86; fy += 0.12) {
          const px = r.x + r.width * fx, py = r.y + r.height * fy;
          if (document.elementFromPoint(px, py) === c) return { x: px, y: py };
        }
      }
      return null;
    }
    return null;
  });
  ok("the Tender's own tap circle stands over his figure (touch form)", !!tapCircle);
  await tpage.touchscreen.tap(tapCircle.x, tapCircle.y);
  await tpage.waitForSelector(".tender-controller", { timeout: 9000 });
  const wheelBtn = await tpage.$('button[aria-label="Open the Tender\'s wheel"]');
  ok("the controller rose at his tap, its wheel button standing", !!wheelBtn);
  const wb = await wheelBtn.boundingBox();
  await tpage.touchscreen.tap(wb.x + wb.width / 2, wb.y + wb.height / 2);
  await tpage.waitForSelector(".gw-wheel", { timeout: 9000 });
  await sleep(700);
  await tapDiscTouch("Rune", true);
  // The tab tap can land while the wheel's discs still settle
  // from opening — if the form never stands, tap the chapter
  // once more before reaching for it.
  const formStood = await tpage.waitForFunction((t) => [...document.querySelectorAll(".gw-disc")]
    .some((x) => ((x.getAttribute("aria-label") || "") + " " + (x.textContent ?? "")).includes(t)), { timeout: 5000 }, formName)
    .then(() => true).catch(() => false);
  if (!formStood) await tapDiscTouch("Rune", true);
  await tapDiscTouch(formName);
  // Poll from the tap itself: the readied notice is the
  // face's word for it, and later notices (a march arriving)
  // may speak over it — catch it while it stands.
  let readied = false;
  for (let i = 0; i < 20 && !readied; i++) {
    readied = await tpage.evaluate(() => document.querySelectorAll(".tender-slot.lit").length > 0 || (document.querySelector(".hex-notice")?.textContent ?? "").includes("readied"));
    if (!readied) await sleep(200);
  }
  ok("the Blade stands readied through the wheel", readied);
  // Cast taps: qualifying polygons outward from the Tender —
  // range refusals keep the run armed, so tap in turn until
  // a cast answers as a cast.
  const targets = await touchPolys(tapCircle, 40, 420);
  ok("cast tap targets stand ready on the land", targets.length >= 3, `targets=${targets.length}`);
  const standsD0 = await tpage.evaluate(() => window.__standLog.length);
  let landed = false;
  for (const t of targets.slice(0, 10)) {
    const before = await tpage.evaluate(() => window.__castLog.length);
    await tpage.touchscreen.tap(t.x, t.y);
    await sleep(600);
    const log = await tpage.evaluate(() => window.__castLog);
    if (log.length > before && !log[log.length - 1].refused) { landed = true; break; }
  }
  ok("a tap on open ground cast the readied working (answered as a cast, not refused)", landed,
    JSON.stringify(await tpage.evaluate(() => window.__castLog)));
  const standsD1 = await tpage.evaluate(() => window.__standLog.length);
  ok("the Tender did not move for the cast taps either", standsD1 === standsD0, `stands ${standsD0} -> ${standsD1}`);
  await tpage.screenshot({ path: `${OUT}/cast-tap-fired.png` });
}

await browser.close();
console.log(`\nMAP CLICK DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
