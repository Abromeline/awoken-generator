// THE MARCH ORDERS — THE FIX BUILD'S DRIVE (2026-10-22).
// Boots the real server on a scratch DATA_DIR and the real
// built client in headless Chrome, and proves the
// marching-orders spec (~/workspace/marching-orders-spec-
// 2026-10-22.md) on the real surfaces:
//   §A THE HOMELAND (browser): clicking a fielded Awokin
//      opens ITS OWN orders wheel; Follow there is an
//      ORDER — a marched Awokin (whose march order ended
//      its following, server-side) is returned to following
//      by the wheel's Follow pick. A drag-chosen company
//      gets ONE group wheel (March · Attack · Defend ·
//      Follow); March + a tap on the land OBEYS AT ONCE —
//      no quote, no confirm stands anywhere in the flow.
//      A right-dragged line (March armed — the right hand
//      draws it by the click law, Nigel 2026-10-23) spreads
//      the selection EVENLY along it — the march
//      destinations are asserted from the server's read.
//   §B THE TABLE (browser): a tap on my Awokin's ground
//      opens its orders wheel (the unit bar is gone);
//      March + a tile tap marches it with no confirm; a
//      drag beginning on my own Awokin chooses the company
//      and opens the company wheel (March · Follow).
// Screenshots land in ~/workspace/orders-proof/.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-orders.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

const OUT = "/home/hatch/workspace/orders-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-orders-"));
process.env.PORT = "3985";
process.env.WORKSHOP_PASSWORD = "orders-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3985";
const PW = "orders-drive-password";
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
      .run(`${name} ${cat}`, cat, partPower, partPower, `orders/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: partPower, toughness: partPower, element: "root" });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `orders/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
async function claimWithExp(name, exp) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, exp, Date.now());
  return { token: claim.token, ownerKey };
}
const placementOf = async (token, id) => {
  const t = await call("getTerritory", {}, token);
  return (t.placements ?? []).find((p) => p.awakenedId === id) ?? null;
};
const waitFor = async (fn, what, ms = 30000) => {
  const s = Date.now();
  while (Date.now() - s < ms) { if (await fn()) return true; await sleep(400); }
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

/* ══ §A THE HOMELAND ORDERS ═══════════════════════════════ */
console.log("§A the homeland orders — the wheel on the figure, the company wheel, the line");
{
  const T = await claimWithExp("Orders Tender", 3800);
  const now = Date.now();
  db.prepare(`INSERT INTO tender_progress (owner_key, class_key, weapon_key, hp, weapon_next_at, updated_at)
    VALUES (?, 'warden', 'sword', 100, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', hp = 100`).run(T.ownerKey, now + 600000, now);
  const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', 0, ?)");
  const tileId = new Map();
  for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > 4) continue;
    tileId.set(`${q},${r}`, Number(insTile.run(T.ownerKey, q, r, now).lastInsertRowid));
  }
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?)").run(T.ownerKey, now);
  const insPlace = db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, follow, hp) VALUES (?, ?, ?, ?, ?, ?, 30)");
  const seedAt = (name, q, r, follow = 0) => {
    const id = seedAwokin(T.ownerKey, "Orders Tender", name, 2);
    insPlace.run(T.ownerKey, id, tileId.get(`${q},${r}`), now, now, follow);
    return id;
  };
  const bandA = seedAt("Band One", -2, 0);
  const bandB = seedAt("Band Two", -2, 1);
  const lineA = seedAt("Line One", -1, -2);
  const lineB = seedAt("Line Two", 0, -2);
  const lineC = seedAt("Line Three", 1, -2);
  // The Walker seeds INSIDE the Tender's ring (1,0): a
  // follower beyond the ring would already be on the
  // muster's road home before the drive's order is given.
  const fol = seedAt("Walker", 1, 0, 1);

  // The Walker starts FOLLOWING; a march order must end
  // the follow (the server half of the spec's law), and
  // the march is one hex so its arrival is quick.
  ok("the Walker stands following before any order", (await placementOf(T.token, fol))?.follow === 1);
  await call("setMarch", { awakenedId: fol, tileId: tileId.get("2,0") }, T.token);
  // (one hex east, from its ring post at (1,0))
  const afterOrder = await placementOf(T.token, fol);
  ok("a march order ends the follow — the Awokin leaves following to carry it out",
    !!afterOrder && afterOrder.follow === 0 && !!afterOrder.marchPath,
    JSON.stringify(afterOrder && { follow: afterOrder.follow, marching: !!afterOrder.marchPath }));
  await waitFor(async () => { const p = await placementOf(T.token, fol); return p && !p.marchPath && p.tileId === tileId.get("2,0"); }, "the Walker's one-hex march arrives", 120000);

  // Open the land map.
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror:orders]", String(e).slice(0, 200)));
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

  // The tile lattice, solved from the hit polygons (the
  // cast-flow/wheel-law drives' proven method).
  const terr = await call("getTerritory", {}, T.token);
  const tilesArg = (terr.tiles ?? []).map((t) => ({ id: t.id, q: t.q, r: t.r }));
  const solveLattice = async () => page.evaluate((tiles) => {
    const polys = [...document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]')];
    const cents = polys.map((p) => {
      const pts = (p.getAttribute("points") ?? "").trim().split(/\s+/).map((s) => s.split(",").map(Number));
      return { x: pts.reduce((a, pt) => a + pt[0], 0) / pts.length, y: pts.reduce((a, pt) => a + pt[1], 0) / pts.length };
    });
    // The territory's own iso basis at HEX_BASE_SIZE 54
    // (ISO_E/ISO_SE over ISO_DEN 796), origin fitted by
    // scoring — the wheel-law drive's proven solver.
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
    // Client points go through the svg's own CTM (the
    // app's svgPoint math): the element letterboxes its
    // 500x340 viewBox (preserveAspectRatio meet), so a
    // naive rect proportion misplaces the outer tiles by
    // more than a band's margin. Pan is {0,0} at solve
    // time and no gesture before the band pans, so the
    // CTM projection is the painted truth for §A.
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
  const svgOf = (q, r) => lattice.points[tileId.get(`${q},${r}`)].svg;

  // The return report (an Awokin speaks upon your
  // return) can stand over the map after the long march
  // waits above — its backdrop dismisses on a click, and
  // it must be gone before any gesture is aimed at the
  // land, or the gesture lands on the report instead.
  const clearReturnReport = async () => {
    for (let i = 0; i < 3; i++) {
      const stood = await page.evaluate(() => !!document.querySelector(".return-report-overlay"));
      if (!stood) return;
      await page.mouse.click(24, 24);
      await sleep(300);
    }
  };
  await clearReturnReport();

  // Click the Walker → ITS orders wheel. The figure
  // stands at its keystone in the hex's heart — not on
  // the tile's centre — and drifts on its own rhythm, so
  // the tap aims at the figure AS PAINTED: the painted
  // box centre of the figure group nearest the tile.
  const folPt = clientOf(2, 0);
  const figPt = await page.evaluate((near) => {
    let bestPt = null, bestD = Infinity;
    for (const g of document.querySelectorAll("g.field-drifter, g.field-patroller")) {
      const r = g.getBoundingClientRect();
      if (!r.width) continue;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const d = Math.hypot(cx - near.x, cy - near.y);
      if (d < bestD) { bestD = d; bestPt = { x: cx, y: cy }; }
    }
    return bestPt;
  }, folPt);
  ok("the Walker's figure is found as painted, near its tile", !!figPt && Math.hypot(figPt.x - folPt.x, figPt.y - folPt.y) < 120, JSON.stringify(figPt));
  await page.mouse.click((figPt ?? folPt).x, (figPt ?? folPt).y);
  await page.waitForSelector(".gw-wheel", { timeout: 9000 });
  const singleFaces = await page.evaluate(() => [...document.querySelectorAll(".gw-disc")].map((d) => d.textContent ?? ""));
  ok("clicking a fielded Awokin opens ITS OWN orders wheel (March · Attack · Defend · Binding · Follow · Patrol)",
    ["March", "Attack", "Defend", "Follow"].every((w) => singleFaces.some((t) => t.includes(w))),
    JSON.stringify(singleFaces));
  await page.screenshot({ path: `${OUT}/orders-single-wheel.png` });
  // Follow, as an order inside the wheel.
  await clickDisc(page, ".gw-disc", "Follow");
  await waitFor(async () => (await placementOf(T.token, fol))?.follow === 1, "the Follow order lands", 15000);
  ok("the wheel's Follow order returns the marched Awokin to following", true);

  // Pan the land east with the MIDDLE hand (the button
  // law, Nigel 2026-10-23: the left hand chooses, the
  // middle moves the screen, the right only clicks) —
  // then solve the lattice again on the panned land.
  // (The pan takes the drag's measure in MAP units, so
  // a ~125px drag moves the painted land ~350px.)
  await page.mouse.move(600, 760);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(725, 760, { steps: 12 });
  await page.mouse.up({ button: "middle" });
  await sleep(600);
  lattice = await solveLattice();

  // Band-select the western pair with the LEFT hand —
  // no gate stands before the choosing drag any more.
  const dragBand = async (ids) => {
    const pts = ids.map((id) => lattice.points[id].svg);
    const x0 = Math.min(...pts.map((p) => p.x)) - 18, x1 = Math.max(...pts.map((p) => p.x)) + 18;
    const y0 = Math.min(...pts.map((p) => p.y)) - 18, y1 = Math.max(...pts.map((p) => p.y)) + 18;
    const toClient = ({ x, y }) => page.evaluate(({ x, y }) => {
      const svg = document.querySelector("svg.territory-svg");
      const pt = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
      return { x: pt.x, y: pt.y };
    }, { x, y });
    // The press and release must land on the land
    // itself — the top HUD, the battle trigger and the
    // hand tray all sit above the map. Nudge a corner
    // onto svg ground rather than trusting it blind.
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
    const c0 = await ground(await toClient({ x: x0, y: y0 }));
    const c1 = await ground(await toClient({ x: x1, y: y1 }));
    await page.mouse.move(c0.x, c0.y);
    await page.mouse.down();
    await page.mouse.move(c1.x, c1.y, { steps: 14 });
    await page.mouse.up();
    await sleep(700);
  };

  await clearReturnReport();
  await dragBand([tileId.get("-2,0"), tileId.get("-2,1")]);
  await page.waitForSelector(".gw-wheel", { timeout: 9000 });
  const groupFaces = await page.evaluate(() => [...document.querySelectorAll(".gw-disc")].map((d) => d.textContent ?? ""));
  ok("the drag-chosen company gets ONE group wheel — March · Attack · Defend · Follow",
    ["March", "Attack", "Defend", "Follow"].every((w) => groupFaces.some((t) => t.includes(w))),
    JSON.stringify(groupFaces));
  await page.screenshot({ path: `${OUT}/orders-group-wheel.png` });
  await clickDisc(page, ".gw-disc", "March");
  await sleep(300);
  // The tap on the land IS the order: no confirm may stand.
  const targetPt = clientOf(0, 2);
  await page.mouse.click(targetPt.x, targetPt.y);
  await sleep(1200);
  const confirmStood = await page.evaluate(() =>
    !!document.querySelector(".hex-confirm")
    || [...document.querySelectorAll("button")].some((b) => (b.textContent ?? "").includes("✓ March")));
  ok("the group march obeyed with NO confirm step anywhere", !confirmStood);
  const bandDests = await waitFor(async () => {
    const a = await placementOf(T.token, bandA);
    const b = await placementOf(T.token, bandB);
    return a?.marchPath && b?.marchPath ? [a, b] : null;
  }, "both band marches are on the road", 20000).then(() => Promise.all([placementOf(T.token, bandA), placementOf(T.token, bandB)]));
  const destOf = (p) => { if (!p?.marchPath) return null; const road = JSON.parse(p.marchPath); return road[road.length - 1]; };
  const tileByIdMap = new Map((terr.tiles ?? []).map((t) => [t.id, t]));
  ok("the company marches to the tapped ground — destinations on or beside the tap",
    bandDests.every((p) => hexDist(tileByIdMap.get(destOf(p)), { q: 0, r: 2 }) <= 1),
    JSON.stringify(bandDests.map((p) => destOf(p))));

  // THE LINE: the northern trio — the page has never
  // lost sight of their posts (unlike an API re-seat,
  // whose marches the page never sees). Band them,
  // arm March, and drag the line along their row,
  // EAST to WEST: the members take their slots in
  // placement order, so the reversed draw keeps every
  // figure off its own standing (a figure already on
  // its point of the line simply stays, by the law).
  await clearReturnReport();
  await dragBand([tileId.get("-1,-2"), tileId.get("0,-2"), tileId.get("1,-2")]);
  await page.waitForSelector(".gw-wheel", { timeout: 9000 });
  await clickDisc(page, ".gw-disc", "March");
  await sleep(300);
  // The line is drawn along the row BELOW the trio,
  // half a step off their standings: with three slots
  // at the segment's ends and middle, a line through
  // the trio's own row would set the middle slot
  // exactly on the middle figure's post (and it would
  // lawfully stay). Drawn from (1,-1) to just south of
  // (-2,-1), the slots' nearest tiles are (1,-1),
  // (0,-1), (-2,-1) — none of them a standing post.
  const l0 = clientOf(1, -1);
  const l1raw = clientOf(-2, -1);
  const l1 = { x: l1raw.x, y: l1raw.y + 56 };
  // The drag's own ends must start and finish on the
  // land — reuse the band's ground-nudge.
  const lineGround = async (pt) => page.evaluate(({ x, y }) => {
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
  const gl0 = await lineGround(l0), gl1 = await lineGround(l1);
  await page.mouse.move(gl0.x, gl0.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(gl1.x, gl1.y, { steps: 16 });
  await page.mouse.up({ button: "right" });
  await sleep(1500);
  const linePs = await Promise.all([placementOf(T.token, lineA), placementOf(T.token, lineB), placementOf(T.token, lineC)]);
  ok("the right-dragged line marched all three — no tap, no confirm",
    linePs.every((p) => !!p?.marchPath), JSON.stringify(linePs.map((p) => !!p?.marchPath)));
  const lineDests = linePs.map((p) => tileByIdMap.get(destOf(p)));
  const destSet = new Set(lineDests.map((t) => t?.id));
  ok("the selection spreads EVENLY along the line — three distinct standings",
    destSet.size === 3, JSON.stringify(lineDests.map((t) => t && [t.q, t.r])));
  ok("the standings lie along the drawn line (its row, a tile's grace either way)",
    lineDests.every((t) => t && Math.abs(t.r - (-1)) <= 1), JSON.stringify(lineDests.map((t) => t && [t.q, t.r])));
  const qs = lineDests.filter(Boolean).map((t) => t.q).sort((a, b) => a - b);
  ok("the spread covers the line — its span runs at least three hexes",
    qs[2] - qs[0] >= 3, JSON.stringify(qs));
  await sleep(400);
  await page.screenshot({ path: `${OUT}/orders-line-formation.png` });
  await page.close();
}

/* ══ §B THE TABLE ORDERS ══════════════════════════════════ */
console.log("§B the Table orders — the wheel on the unit's tap; March obeyed; the company band");
{
  const { issueTableToken } = await import("../server/dist/table.js");
  const claim = await call("claimTender", { password: PW, tenderName: "Orders Table" });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, Date.now());
  await call("chooseClass", { classKey: "warden" }, claim.token);
  const tt = issueTableToken({ id: "disc-orders", name: "Orders Table" });
  const bindCode = (await call("getTableBindCode", {}, claim.token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
  if (!bindRes.ok) throw new Error("table/bind failed: " + bindRes.status);
  // The three are seeded at part-power 1 (card power 3):
  // their casts cost ✦3 against DC 13 with +4 summoner's
  // power (a 60% land), so the seat's purse — 10 + the
  // roster's cap bonuses — carries the proof's dice
  // without a starvation tail. The bench is seeded fat
  // (card power 9, +6 cap each) purely to widen the cap.
  const u1 = seedAwokin(ownerKey, "Orders Table", "Table One", 1);
  const u2 = seedAwokin(ownerKey, "Orders Table", "Table Two", 1);
  const u3 = seedAwokin(ownerKey, "Orders Table", "Table Three", 1);
  await call("addToParty", { awakenedId: u1 }, claim.token);
  await call("addToParty", { awakenedId: u2 }, claim.token);
  await call("addToParty", { awakenedId: u3 }, claim.token);
  for (let i = 0; i < 10; i++) seedAwokin(ownerKey, "Orders Table", `Table Bench ${i + 1}`, 3);

  const ROOM = "orders-table";
  let wstate = { state: null, you: null };
  const ws = new WebSocket("ws://127.0.0.1:3985/table/ws");
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") { wstate.state = m.state; if (m.you) wstate.you = m.you; } } catch { /* torn frame */ } };
  ws.send(JSON.stringify({ type: "join", authToken: tt, room: ROOM }));
  const sendWs = (o) => ws.send(JSON.stringify(o));
  await waitFor(() => !!wstate.you, "the seat joins", 15000);
  const myKey = wstate.you.key;
  const myUnits = () => (wstate.state?.field ?? []).filter((u) => u.ownerKey === myKey);
  const castHexless = async (id) => {
    for (let i = 0; i < 20; i++) {
      sendWs({ type: "summonCast", awakenedId: id });
      await sleep(900);
      if (myUnits().some((u) => u.awokenId === id)) return true;
    }
    return false;
  };
  ok("all three Awokin are summoned hexless for the Table orders proof", (await castHexless(u1)) && (await castHexless(u2)) && (await castHexless(u3)));
  const seatHex = wstate.state.players.find((p) => p.key === myKey)?.hex;

  // Walk Two one hex off the shared standing ground
  // (by socket, while this socket still holds the seat),
  // so the company band later has ground to sweep
  // between the two.
  const two0 = myUnits().find((u) => u.awokenId === u2);
  const three0 = myUnits().find((u) => u.awokenId === u3);
  const apartTile = (wstate.state?.map ?? []).find((t) => {
    if (t.id === "0,0" || t.id === three0.hex) return false;
    const [aq, ar] = two0.hex.split(",").map(Number);
    const [bq, br] = t.id.split(",").map(Number);
    return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(aq + ar - bq - br)) === 1;
  });
  sendWs({ type: "march", cardId: two0.cardId, from: two0.hex, to: apartTile.id });
  await waitFor(() => { const u = myUnits().find((x) => x.awokenId === u2); return !!u && u.hex === apartTile.id && !u.moving; }, "Two walks one hex apart", 60000);

  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror:orders-table]", String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((sess) => { window.__awokenTableSession = sess; },
    { authToken: tt, room: ROOM, name: "Orders Table" });
  await page.goto(BASE + "/table?frame_id=drive", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".table-room", { timeout: 30000 });
  await page.waitForFunction(() => !!document.querySelector(".table-room svg polygon"), { timeout: 30000 });
  await sleep(1500);

  // Locate tiles by their polygon centres against the
  // watcher's map, solving the iso lattice in-page.
  const tableLattice = await page.evaluate((tiles) => {
    const polys = [...document.querySelectorAll('.table-room svg polygon[fill="transparent"]')];
    const cents = polys.map((p) => {
      const pts = (p.getAttribute("points") ?? "").trim().split(/\s+/).map((s) => s.split(",").map(Number));
      return { x: pts.reduce((a, pt) => a + pt[0], 0) / pts.length, y: pts.reduce((a, pt) => a + pt[1], 0) / pts.length };
    });
    const size = 40;
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
    const svg = document.querySelector(".table-room svg");
    const rect = svg.getBoundingClientRect();
    // Client points go through a polygon's own CTM —
    // the full local→viewport transform, g pan/zoom and
    // viewBox letterboxing included. (A naive viewBox
    // proportion drifts tiles at the board's west edge
    // by more than a band's press gate forgives.)
    const ctm = polys[0].getCTM();
    const out = {};
    for (const t of tiles) {
      const sx = best.ox + t.q * U[0] + t.r * V[0], sy = best.oy + t.q * U[1] + t.r * V[1];
      const pt = new DOMPoint(sx, sy).matrixTransform(ctm);
      out[t.id] = { x: rect.left + pt.x, y: rect.top + pt.y };
    }
    return { points: out, hits: best.hits, total: tiles.length };
  }, (wstate.state?.map ?? []).map((t) => ({ id: t.id, q: t.q, r: t.r })));
  ok("the Table lattice is solved", tableLattice.hits >= tableLattice.total - 2, JSON.stringify({ hits: tableLattice.hits, total: tableLattice.total }));
  // The page's join took the seat ("their seat was
  // held") — the first socket's stream freezes at the
  // takeover, so the reading rebinds to a watcher of
  // the same room, whose state keeps flowing.
  const watchState = { state: null, you: null };
  const wsWatch = new WebSocket("ws://127.0.0.1:3985/table/ws");
  await new Promise((res, rej) => { wsWatch.onopen = res; wsWatch.onerror = rej; });
  wsWatch.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") { watchState.state = m.state; } } catch { /* torn frame */ } };
  wsWatch.send(JSON.stringify({ type: "join", watch: true, room: ROOM, name: "Orders Watcher" }));
  await waitFor(() => !!watchState.state, "the watcher's state flows", 15000);
  wstate = watchState;
  const tPt = (hexId) => tableLattice.points[hexId];

  // Tap my Awokin's own ground — its orders wheel opens.
  const one = myUnits().find((u) => u.awokenId === u1);
  const onePt = tPt(one.hex);
  await page.mouse.click(onePt.x, onePt.y);
  await page.waitForSelector(".gw-wheel", { timeout: 9000 });
  const unitFaces = await page.evaluate(() => [...document.querySelectorAll(".gw-disc")].map((d) => d.textContent ?? ""));
  ok("a tap on my Awokin's ground opens ITS orders wheel at the Table (March · Heal · Follow · Recall)",
    ["March", "Follow", "Recall"].every((w) => unitFaces.some((t) => t.includes(w))), JSON.stringify(unitFaces));
  const unitBarGone = await page.evaluate(() => ![...document.querySelectorAll(".placing-bar")].some((b) => (b.textContent ?? "").includes("tap a tile to march")));
  ok("the old unit bar stands nowhere — its text is gone from the page", unitBarGone);
  await page.screenshot({ path: `${OUT}/orders-table-unit-wheel.png` });
  await clickDisc(page, ".gw-disc", "March");
  await sleep(300);
  // Tap a tile two rings off — the march obeys, no
  // confirm. (The referee bars only the star-seed's own
  // tile (0,0) as a march's end; cursed ground is
  // marchable — and on this casual map nearly every
  // tile wears the curse, the tender's hex and the
  // seed alone standing pure.)
  const destTile = (wstate.state?.map ?? []).find((t) => {
    const [aq, ar] = one.hex.split(",").map(Number);
    const [bq, br] = t.id.split(",").map(Number);
    return t.id !== "0,0" && Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(aq + ar - bq - br)) === 2;
  });
  const destPt = tPt(destTile.id);
  await page.mouse.click(destPt.x, destPt.y);
  // The march is a glide at the figure's own pace — the
  // proof waits for the road to show (under way, or
  // arrived), not for a fixed breath.
  await waitFor(() => {
    const u = myUnits().find((x) => x.awokenId === u1);
    return !!u && (u.moving === true || (u.tgt && u.hex !== destTile.id) || u.hex === destTile.id);
  }, "the tapped march is under way", 30000);
  const oneAfter = myUnits().find((u) => u.awokenId === u1);
  ok("March + a tile tap marches the Awokin at once — no confirm (it is moving, or stands ordered to the tapped ground)",
    !!oneAfter && (oneAfter.moving === true || !!oneAfter.tgt || oneAfter.hex === destTile.id),
    JSON.stringify(oneAfter && { moving: oneAfter.moving, tgt: !!oneAfter.tgt, hex: oneAfter.hex }));

  const two = myUnits().find((u) => u.awokenId === u2);
  const three = myUnits().find((u) => u.awokenId === u3);
  const p2 = tPt(two.hex), p3 = tPt(three.hex);
  // The drag wears a small pad beyond each centre: a
  // press exactly ON a centre can, through the two
  // client↔stage conversions' rounding, leave that
  // centre a hair outside the band it started.
  await page.mouse.move(p2.x - 14, p2.y - 10);
  await page.mouse.down();
  await page.mouse.move(p3.x + 14, p3.y + 10, { steps: 14 });
  await sleep(400); // the band's state settles before the release reads it
  await page.mouse.up();
  await page.waitForSelector(".gw-wheel", { timeout: 9000 });
  const groupFacesT = await page.evaluate(() => [...document.querySelectorAll(".gw-disc")].map((d) => d.textContent ?? ""));
  ok("the drag-chosen company gets ONE group wheel at the Table — March · Follow",
    ["March", "Follow"].every((w) => groupFacesT.some((t) => t.includes(w))), JSON.stringify(groupFacesT));
  await page.screenshot({ path: `${OUT}/orders-table-group-wheel.png` });
  await clickDisc(page, ".gw-disc", "Follow");
  await waitFor(() => {
    const us = myUnits().filter((u) => u.awokenId === u2 || u.awokenId === u3);
    return us.length === 2 && us.every((u) => u.follow === true);
  }, "the company's Follow order lands on both", 15000);
  ok("the group wheel's Follow is an order — both Awokin follow, set from the one pick", true);
  void seatHex;
  await page.close();
  ws.close();
  wsWatch.close();
}

await browser.close();
console.log(`\nORDERS DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
