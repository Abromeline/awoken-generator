// CASTING DOES NOT STILL THE BODY (Twelve #6 — Nigel,
// 2026-10-25 23:41: "casting is still causing movement to
// be locked on hommeland and map"). The casting repair's GO
// stood from 2026-10-25: movement live while a working is
// readied. The locks were client input gates only — the
// homeland's tenderInputBlockedRef counted castMode among
// the armed flows that still the body (WASD, Space and the
// controller's pad all read it), and at the Table the glide
// guard counted the readied placing (the WASD glide's send
// mouth, its keydown start, the Space leap and the pad's
// send all refused while placing stood). Neither server
// ever refused a move or a glide for a readied working, and
// both referees already reckon a cast from where the caster
// STANDS when it fires — so this drive proves the freedom
// on the real pages:
//   §1 THE LAND MAP — ready the Blade through the wheel;
//      the body glides on held keys while it stands readied
//      (the figure's own pos() is the witness, and the
//      server's stand follows by setTenderTile); a cast
//      fires WHILE the keys are held and the body keeps
//      moving through it; Space leaps while readied; the
//      working still casts truly after the move.
//   §2 THE TABLE — ready the Blade through the wheel; the
//      Tender glides on held keys while the placing stands
//      (a watcher socket reads the seat's own pos); a cast
//      lands while the glide keys are held, and the figure
//      ends the window somewhere other than it began.
// Controls stand first on both grounds: the same held keys
// move the body with NOTHING readied, so a dead road can
// never masquerade as a casting lock's absence.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-casting-movement.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-castmove-"));
process.env.PORT = "3963";
process.env.WORKSHOP_PASSWORD = "castmove-workshop-pw";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname); // the server resolves client/dist from CWD
const PW = ["cast", "move", "pw", "1"].join("-");
const BASE = "http://127.0.0.1:3963";
const OUT = "/home/hatch/workspace/casting-movement-proof";
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

// Clicks a GroundWheel disc by label text with REAL mouse
// events — the cast-flow drive's own hand.
const clickDisc = async (pg, sel, txt) => {
  const handle = await pg.evaluateHandle((q, t) => [...document.querySelectorAll(q)].find((d) => ((d.getAttribute("aria-label") || "") + " " + (d.textContent || "")).includes(t)), sel, txt);
  const el = handle.asElement();
  if (!el) throw new Error("wheel disc not found: " + txt);
  const box = await el.boundingBox();
  if (!box) throw new Error("wheel disc has no box: " + txt);
  await pg.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });

/* ══ §1 THE LAND MAP ══════════════════════════════════════ */
console.log("§1 the land map — the body moves while the Blade stands readied");
{
  const claim = await call("claimTender", { password: PW, tenderName: "Castmove Land" });
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

  const grimBody = await call("getGrimoire", {}, token);
  const grim = grimBody.data ?? grimBody;
  const blade = (grim.spells ?? []).find((s) => s.engine === "blade");
  ok("the book holds the single Blade (a one-tap rune)", !!blade, JSON.stringify((grim.spells ?? []).map((s) => s.key)));
  const formName = blade.forms?.unaligned ?? blade.name;

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror:territory]", String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
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

  // The fetch witness: every cast and every stand report
  // the page sends.
  await page.evaluate(`(() => {
    window.__castLog = []; window.__standLog = [];
    const of = window.fetch.bind(window);
    window.fetch = async (...a) => {
      const r = await of(...a);
      try {
        const u = String(a[0]);
        if (u.includes("castMapWorking")) {
          const j = await r.clone().json().catch(() => null);
          const raw = JSON.stringify(j ?? {});
          window.__castLog.push({ at: Date.now(), ok: r.ok, fizzled: raw.includes('"fizzled":true'), refused: !r.ok, note: (j && (j.error || j.message)) || raw.slice(0, 120) });
        }
        if (u.includes("setTenderTile")) window.__standLog.push({ at: Date.now(), ok: r.ok });
      } catch { /* the witness never breaks the page */ }
      return r;
    };
  })()`);

  const figPos = () => page.evaluate(() => window.__tenderJump.pos());
  const standOf = async () => {
    const t = await call("getTerritory", {}, token);
    const d = t.data ?? t;
    return d.tender?.tileId ?? null;
  };

  // CONTROL: held keys glide the body with nothing readied.
  const c0 = await figPos();
  await page.keyboard.down("d");
  await sleep(850);
  const c1 = await figPos();
  await page.keyboard.up("d");
  ok("CONTROL: held keys glide the body with nothing readied", moved(c0, c1) > 15, `moved=${moved(c0, c1).toFixed(1)}`);
  await sleep(500);

  // Ready the Blade THE LAWFUL WAY (the cast-flow road).
  await page.mouse.click(420, 300, { button: "right" });
  await page.waitForSelector(".gw-wheel", { timeout: 9000 });
  await clickDisc(page, ".gw-disc.cat", "Rune");
  await sleep(500);
  await clickDisc(page, ".gw-disc", formName);
  await page.waitForFunction((fn) => (document.querySelector(".hex-notice")?.textContent ?? "").includes(fn) || (document.querySelector(".hex-notice")?.textContent ?? "").includes("readied"), { timeout: 9000 }, formName).catch(() => {});
  await sleep(300);
  const readied = await page.evaluate(() => document.querySelectorAll(".tender-slot.lit").length > 0 || (document.querySelector(".hex-notice")?.textContent ?? "").includes("readied"));
  ok("the Blade stands readied through the wheel", readied);

  // THE MOVE WHILE READIED: hold the keys; the body must
  // answer, and the server's stand must follow. The stride
  // walks ~45px a second in the map's own space and the
  // anchor reports only on a tile crossing, so the hold
  // stands three seconds — the diagnostic's own measure
  // (anchor 19 -> 7 across it, the stand following).
  const standBefore = await standOf();
  const standsBefore = await page.evaluate(() => window.__standLog.length);
  const m0 = await figPos();
  await page.keyboard.down("a");
  await sleep(3000);
  const m1 = await figPos();
  await page.keyboard.up("a");
  await sleep(700);
  const standAfter = await standOf();
  const standsAfter = await page.evaluate(() => window.__standLog.length);
  ok("the body MOVES while the Blade stands readied (held keys)", moved(m0, m1) > 60, `moved=${moved(m0, m1).toFixed(1)}`);
  ok("the server's stand followed the readied glide (setTenderTile answered)", standsAfter > standsBefore, `stands ${standsBefore} -> ${standsAfter}`);
  ok("the server's stand tile changed under the readied glide", standAfter !== standBefore, `stand ${standBefore} -> ${standAfter}`);
  console.log(`    server stand tile: ${standBefore} -> ${standAfter}`);

  // THE LEAP WHILE READIED: Space answers too. The latch
  // rides INSIDE the page — the leap's airborne window is
  // ~400 ms, too short to poll across the wire honestly.
  await page.evaluate(`(() => {
    window.__leapt = false;
    const iv = setInterval(() => { if (window.__tenderJump.airborne()) { window.__leapt = true; clearInterval(iv); } }, 25);
    setTimeout(() => clearInterval(iv), 4000);
  })()`);
  await page.keyboard.press(" ");
  await sleep(900);
  ok("Space leaps while the Blade stands readied", await page.evaluate(() => window.__leapt));
  await sleep(600);

  // THE CAST WHILE MOVING: hold the keys, tap a hex
  // mid-glide — the cast must fire and the body must keep
  // moving through it; then keep tapping (at rest) until a
  // cast lands, proving the working still casts truly
  // after the move.
  const terr0 = await call("getTerritory", {}, token);
  const terr0Data = terr0.data ?? terr0;
  const standTile = (terr0Data.tiles ?? []).find((t) => t.id === terr0Data.tender?.tileId) ?? { q: 0, r: 0 };
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
  }, (terr0Data.tiles ?? []).map((t) => ({ id: t.id, q: t.q, r: t.r, cursed: t.cursed })));
  const tapOrder = pairs
    .map((p) => ({ i: p.poly, t: p, d: hexDist(p, standTile) }))
    .filter((x) => x.d >= 1 && x.d <= 3 && !x.t.cursed)
    .sort((a, b) => a.d - b.d)
    .slice(0, 12);
  ok("tap targets stand ready near the (moved) stand", tapOrder.length >= 3, `targets=${tapOrder.length}`);

  // The trail rides INSIDE the page (25 ms samples of the
  // figure's own pos, timestamped), so the cast's moment
  // can be read against the body's motion without the
  // wire's round-trips bending either.
  const castsBefore = await page.evaluate(() => window.__castLog.length);
  await page.evaluate(`(() => {
    window.__posTrail = [];
    const iv = setInterval(() => { const p = window.__tenderJump.pos(); if (p) window.__posTrail.push({ at: Date.now(), x: p.x, y: p.y }); }, 25);
    setTimeout(() => clearInterval(iv), 6000);
  })()`);
  await page.keyboard.down("d");
  await sleep(600);
  await page.evaluate((i) => {
    const p = document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]')[i];
    p?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }, tapOrder[0].i);
  await sleep(1800);
  await page.keyboard.up("d");
  const castLog1 = await page.evaluate(() => window.__castLog);
  const trail = await page.evaluate(() => window.__posTrail);
  ok("a cast FIRED while the movement keys were held", castLog1.length > castsBefore, `casts ${castsBefore} -> ${castLog1.length}`);
  const firedCast = castLog1[castLog1.length - 1];
  const travelAcross = (from, to) => {
    const seg = trail.filter((s) => s.at >= from && s.at <= to);
    if (seg.length < 2) return 0;
    let d = 0;
    for (let i = 1; i < seg.length; i++) d += Math.hypot(seg[i].x - seg[i - 1].x, seg[i].y - seg[i - 1].y);
    return d;
  };
  const beforeCast = firedCast ? travelAcross(firedCast.at - 600, firedCast.at) : 0;
  const afterCast = firedCast ? travelAcross(firedCast.at, firedCast.at + 1500) : 0;
  ok("the body was moving as the cast fired (travel in the 600 ms before it)", beforeCast > 5, `travel=${beforeCast.toFixed(1)}`);
  ok("the body KEPT moving through the cast (travel in the 1500 ms after it)", afterCast > 15, `travel=${afterCast.toFixed(1)}`);
  ok("the cast fired from the moved stand — answered as a cast, not refused for position", !!firedCast && !firedCast.refused, JSON.stringify(firedCast ?? {}));

  // And the run still casts truly at rest after the move.
  let landedAfter = false;
  for (const t of tapOrder.slice(1)) {
    const before = await page.evaluate(() => window.__castLog.length);
    await page.evaluate((i) => {
      const p = document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]')[i];
      p?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }, t.i);
    await sleep(550);
    const log = await page.evaluate(() => window.__castLog);
    if (log.length > before && !log[log.length - 1].refused) { landedAfter = true; break; }
  }
  ok("the working still casts truly after the move (the run stands)", landedAfter);
  await page.screenshot({ path: `${OUT}/territory-moved-while-readied.png` });
  await page.close();
}

/* ══ §2 THE TABLE ═════════════════════════════════════════ */
console.log("§2 the Table — the Tender glides while the placing stands");
{
  const claim = await call("claimTender", { password: PW, tenderName: "Castmove Table" });
  const token = claim.token;
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  const now = Date.now();
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, now);
  const bodyId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'body', 'common', 2, 2, 'sky', ?, 'image/png', ?)").run("Move Body", "move/body.png", now).lastInsertRowid);
  const armsId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'arms', 'common', 3, 3, 'sky', ?, 'image/png', ?)").run("Move Arms", "move/arms.png", now).lastInsertRowid);
  const headId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'head', 'common', 3, 3, 'sky', ?, 'image/png', ?)").run("Move Head", "move/head.png", now).lastInsertRowid);
  const compJson = JSON.stringify([
    { source_id: `db:${bodyId}`, name: "Move Body", category: "body", rarity: "common", power: 2, toughness: 2, element: "sky" },
    { source_id: `db:${armsId}`, name: "Move Arms", category: "arms", rarity: "common", power: 3, toughness: 3, element: "sky" },
    { source_id: `db:${headId}`, name: "Move Head", category: "head", rarity: "common", power: 3, toughness: 3, element: "sky" },
  ]);
  for (let k = 0; k < 3; k++) {
    db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
      .run(k === 0 ? "Movekin" : `Movekin ${k}`, k === 0 ? "Movekin" : `Movekin ${k}`, "move/awokin.png", compJson, "Castmove Table", ownerKey, now);
  }
  db.prepare("INSERT INTO tender_resources (owner_key, energy, terrain_bank, updated_at) VALUES (?, 500, 200, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500, terrain_bank = 200").run(ownerKey, now);
  const insTile2 = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, ?, ?, 0, ?)");
  for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > 2) continue;
    insTile2.run(ownerKey, q, r, now);
  }
  await call("getTerritory", {}, token);
  await call("chooseClass", { classKey: "runewright" }, token);
  const { issueTableToken } = await import("../server/dist/table.js");
  const tt = issueTableToken({ id: "disc-castmove", name: "Castmove Table" });
  const bindCode = (await call("getTableBindCode", {}, token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
  if (!bindRes.ok) throw new Error("table/bind failed: " + bindRes.status);

  const grimBody = await call("getGrimoire", {}, token);
  const grim = grimBody.data ?? grimBody;
  const blade = (grim.spells ?? []).find((s) => s.engine === "blade");
  const bladeLabel = blade.root ?? blade.name ?? (blade.forms?.unaligned ?? blade.name);

  const wstate = { state: null };
  const wws = new WebSocket("ws://127.0.0.1:3963/table/ws");
  await new Promise((res, rej) => { wws.onopen = res; wws.onerror = rej; });
  wws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") wstate.state = m.state; } catch { /* a torn frame is no evidence */ } };
  wws.send(JSON.stringify({ type: "join", room: "casting-movement", watch: true, name: "Drive Watcher" }));
  const waitFor = async (fn, what, ms = 9000) => { const s = Date.now(); while (Date.now() - s < ms) { if (fn()) return true; await sleep(150); } throw new Error("drive wait: " + what); };
  const waitPage = async (pg, fn, what, ms = 9000) => { const s = Date.now(); while (Date.now() - s < ms) { if (await pg.evaluate(fn)) return true; await sleep(150); } throw new Error("drive wait (page): " + what); };
  const mySeat = () => wstate.state?.players.find((p) => p.name === "Castmove Table") ?? null;
  const myPos = () => mySeat()?.pos ?? null;
  const workings = () => wstate.state?.workings ?? [];

  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror:table]", String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((sess) => { window.__awokenTableSession = sess; },
    { authToken: tt, room: "casting-movement", name: "Castmove Table" });
  await page.goto(BASE + "/table?frame_id=drive", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".table-room", { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector(".table-room svg polygon"), { timeout: 30000 });
  await waitFor(() => !!mySeat() && !!mySeat().hex && !!myPos(), "watcher reads the seat, its hex and its pos", 20000);

  // CONTROL: held keys glide the Tender with nothing readied.
  const c0 = myPos();
  await page.keyboard.down("d");
  await sleep(950);
  const c1 = myPos();
  await page.keyboard.up("d");
  await sleep(300);
  ok("CONTROL: held keys glide the Tender at the Table with nothing readied", moved(c0, c1) > 20, `moved=${moved(c0, c1).toFixed(1)}`);

  // Ready the Blade THE LAWFUL WAY at the Table.
  await page.mouse.click(750, 320, { button: "right" });
  await page.waitForSelector(".gw-wheel", { timeout: 9000 });
  await clickDisc(page, ".gw-disc.cat", "Rune");
  await sleep(500);
  await clickDisc(page, ".gw-disc", bladeLabel);
  await sleep(400);
  await waitPage(page, () => !!document.querySelector(".placing-bar"), "the placing stands armed");
  ok("the Blade stands readied at the Table — the placing bar stands", true);

  // THE GLIDE WHILE READIED.
  const g0 = myPos();
  await page.keyboard.down("d");
  await sleep(1000);
  const g1 = myPos();
  await page.keyboard.up("d");
  await sleep(300);
  ok("the Tender GLIDES at the Table while the Blade stands readied (held keys)", moved(g0, g1) > 20, `moved=${moved(g0, g1).toFixed(1)}`);

  // THE CAST WHILE MOVING: hold the keys the other way and
  // tap hexes until a working lands; the figure must end
  // the window somewhere other than it began.
  const buildPerm = async (pg, selector, tiles, size) => pg.evaluate(({ selector, tiles, size }) => {
    const els = [...document.querySelectorAll(selector)];
    const cents = els.map((p) => {
      const pts = (p.getAttribute("points") ?? "").trim().split(/\s+/).map((s) => s.split(",").map(Number));
      return { x: pts.reduce((a, pt) => a + pt[0], 0) / pts.length, y: pts.reduce((a, pt) => a + pt[1], 0) / pts.length };
    });
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
    const pairs = [];
    for (const t of tiles) {
      const ex = best.ox + t.q * U[0] + t.r * V[0], ey = best.oy + t.q * U[1] + t.r * V[1];
      let bi = -1, bd = 1e9;
      cents.forEach((o, i) => { const d = Math.hypot(o.x - ex, o.y - ey); if (d < bd) { bd = d; bi = i; } });
      pairs.push({ id: t.id, bi, bd });
    }
    pairs.sort((a, b) => a.bd - b.bd);
    const used = new Set(); const perm = {};
    for (const p of pairs) if (!used.has(p.bi)) { used.add(p.bi); perm[p.id] = p.bi; }
    const expected = new Map(tiles.map((t) => [t.id, { x: best.ox + t.q * U[0] + t.r * V[0], y: best.oy + t.q * U[1] + t.r * V[1] }]));
    for (const p of pairs) {
      if (perm[p.id] !== undefined) continue;
      const e = expected.get(p.id);
      let bi = -1, bd = 1e9;
      cents.forEach((o, i) => { if (used.has(i)) return; const d = Math.hypot(o.x - e.x, o.y - e.y); if (d < bd) { bd = d; bi = i; } });
      if (bi >= 0) { used.add(bi); perm[p.id] = bi; p.bd = bd; }
    }
    return { perm, hits: best.hits, worst: Math.max(...pairs.map((p) => p.bd)), matched: Object.keys(perm).length };
  }, { selector, tiles, size });
  const tiles = (wstate.state?.map ?? []).map((t) => ({ id: t.id, q: t.q, r: t.r }));
  const permRes = await buildPerm(page, '.table-room svg polygon[fill="transparent"]', tiles, 40);
  const perm = permRes.perm;
  ok("the stage's tile lattice is solved", permRes.matched === tiles.length && permRes.worst < 20, JSON.stringify(permRes));
  const tapTile = async (id) => {
    const box = await page.evaluate((pi) => {
      const p = [...document.querySelectorAll('.table-room svg polygon[fill="transparent"]')][pi];
      if (!p) return null;
      const r = p.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, perm[id]);
    if (!box) throw new Error("tapTile: no polygon for " + id);
    await page.mouse.click(box.x, box.y);
  };

  const baseWorkings = workings().length;
  const w0 = myPos();
  await page.keyboard.down("a");
  await sleep(300);
  let landed = 0;
  for (const t of tiles) {
    if (landed >= 1) break;
    if (workings().some((w) => w.kind === "rune" && w.hex === t.id)) continue;
    if (t.id === mySeat().hex) continue;
    const before = workings().length;
    await tapTile(t.id);
    await sleep(650);
    if (workings().length > before) landed += workings().length - before;
  }
  const w1 = myPos();
  await page.keyboard.up("a");
  ok("a cast LANDED at the Table while the glide keys were held", landed >= 1, `landed=${landed}`);
  ok("the figure ends the cast-while-moving window somewhere other than it began", moved(w0, w1) > 20, `moved=${moved(w0, w1).toFixed(1)}`);
  ok("the watcher counts the landed working", workings().length === baseWorkings + landed, `watcher=${workings().length} base=${baseWorkings} landed=${landed}`);
  await page.screenshot({ path: `${OUT}/table-glided-while-readied.png` });
  await page.close();
  wws.close();
}

await browser.close();
console.log(`\nCASTING MOVEMENT DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
