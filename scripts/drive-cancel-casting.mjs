// THE CANCEL BUILD'S DRIVE (Nigel, 2026-11-03): "That set
// the light down box is unnecessary. Just right click to
// cancel on pc and click the spell button again to cancel
// on mobile."
// Boots the real server on a scratch DATA_DIR and the real
// built client in headless Chrome, and proves:
//   §A THE HOMELAND: no "Set the light down" box exists on
//      the face; with the Blade readied, a RIGHT-CLICK
//      cancels (no castMapWorking call, no energy spent,
//      the hotbar slot's light dies) and the NEXT right-
//      click reopens the wheel (the standing use, intact);
//      tapping the readied spell's own hotbar slot again
//      cancels the same way; a cast after re-readying still
//      lands on the land.
//   §B THE TABLE: the placing bar never renders — not
//      before readying, not at the moment the Blade stands
//      readied (when it used to stand), not after; a
//      right-click cancels the placing (no cast, no energy,
//      no wheel) and the next right-click reopens the
//      wheel; a normal cast after re-readying still lands
//      and the placing stays armed (the sticky run).
//   §C THE TABLE ON A TOUCH HAND: with the Blade's slot on
//      the hotbar, a touch tap readies it and a second
//      touch tap on the SAME slot sets it down — no cast,
//      no energy, the bar never renders.
//   §D THE ONE SURVIVOR: Shard Rain's picks still gather
//      and its "Write the rain" button still stands —
//      alone now, in no panel — and still casts.
// The box's absence is proven by DOM assertions (no
// .placing-bar but the unit bar's own, no set-down text
// anywhere), which is why no screenshot is needed to show
// a thing that is not there; two screenshots land anyway
// for the eye: the readied Table with bare ground glow,
// and the lone rain button.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-cancel-casting.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

const OUT = "/home/hatch/workspace/cancel-casting-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-cancel-"));
process.env.PORT = "3995";
process.env.WORKSHOP_PASSWORD = "<MASKED_SECRET_001>";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3995";
const PW = "cancel-drive-password";
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

async function claimWithExp(name, exp) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, exp, Date.now());
  return { token: claim.token, ownerKey, tenderId };
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

/* ══ §A THE HOMELAND ══════════════════════════════════════ */
console.log("§A the homeland — no box, right-click cancels, the slot toggles, the cast still lands");
{
  const T = await claimWithExp("Cancel Land", 3800);
  const now = Date.now();
  db.prepare(`INSERT INTO tender_progress (owner_key, class_key, weapon_key, hp, weapon_next_at, updated_at)
    VALUES (?, 'runewright', 'sword', 100, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'runewright', hp = 100`).run(T.ownerKey, now + 600000, now);
  const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', 0, ?)");
  const tileId = new Map();
  for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > 4) continue;
    tileId.set(`${q},${r}`, Number(insTile.run(T.ownerKey, q, r, now).lastInsertRowid));
  }
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?)").run(T.ownerKey, now);

  const grim = await call("getGrimoire", {}, T.token);
  const blade = (grim.spells ?? []).find((s) => s.engine === "blade");
  ok("the book holds the single Blade (a one-tap ground-set rune)", !!blade, JSON.stringify((grim.spells ?? []).map((s) => s.key)));
  const formName = blade.forms?.unaligned ?? blade.name;
  const energy = () => db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(T.ownerKey)?.energy ?? 0;
  const workingsCount = async () => (await call("getTerritory", {}, T.token)).workings?.length ?? 0;

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror:homeland]", String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((tok, slotKey) => {
    window.localStorage.setItem("awoken-tender-token", tok);
    window.localStorage.setItem("awokin-hotbar-territory", JSON.stringify([slotKey]));
  }, T.token, `cast-${blade.key}`);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2500);
  const doorBtn = await page.$(".deck-button");
  if (!doorBtn) throw new Error("territory: no .deck-button on the home face");
  await doorBtn.click();
  await page.waitForFunction(() => !!window.__tenderJump && !!window.__tenderJump.pos(), { timeout: 30000 });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Skip");
    if (b) b.click();
  });
  await sleep(800);

  // The cast witness: every castMapWorking call the page makes.
  await page.evaluate(`(() => {
    window.__castLog = [];
    const of = window.fetch.bind(window);
    window.fetch = async (...a) => {
      const r = await of(...a);
      try { if (String(a[0]).includes("castMapWorking")) window.__castLog.push({ at: Date.now(), ok: r.ok }); } catch { /* the witness never breaks the page */ }
      return r;
    };
  })()`);
  const castCalls = () => page.evaluate(() => window.__castLog.length);
  // The slot's title carries the spell's FORM name in the
  // tender's hue ("The Plain Blade"), not the book name.
  const slotLit = () => page.evaluate((nm) => {
    const s = [...document.querySelectorAll(".tender-slot")].find((x) => (x.getAttribute("title") ?? "").includes(nm));
    return !!s && s.classList.contains("lit");
  }, formName);
  const clickSlot = async () => {
    // The bottom dock's hand row overlaps the hotbar's
    // lower half at this viewport height (the slot's centre
    // hit-tests to the dock), so the tap lands on the
    // slot's top quarter — the part a player's finger
    // reaches. If no point on the slot is reachable, the
    // click is dispatched on the element itself, as the
    // click-law drive dispatches on the tile panel.
    const pt = await page.evaluate((nm) => {
      const s = [...document.querySelectorAll(".tender-slot")].find((x) => (x.getAttribute("title") ?? "").includes(nm));
      if (!s) return null;
      const r = s.getBoundingClientRect();
      for (const f of [0.25, 0.15, 0.4]) {
        const x = r.x + r.width / 2, y = r.y + r.height * f;
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === s || s.contains(hit))) return { x, y, real: true };
      }
      return { dispatch: true };
    }, formName);
    if (!pt) throw new Error("the Blade's hotbar slot never rendered");
    if (pt.dispatch) {
      await page.evaluate((nm) => {
        const s = [...document.querySelectorAll(".tender-slot")].find((x) => (x.getAttribute("title") ?? "").includes(nm));
        s.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      }, formName);
    } else {
      await page.mouse.click(pt.x, pt.y);
    }
    await sleep(500);
  };
  const boxHunt = () => page.evaluate(() => ({
    setDownText: document.body.innerText.includes("Set the light down") || document.body.innerText.includes("Set the attuning down"),
    placingBars: document.querySelectorAll(".placing-bar").length,
  }));

  const hunt0 = await boxHunt();
  ok("the homeland face carries no set-down box and no set-down words", !hunt0.setDownText && hunt0.placingBars === 0, JSON.stringify(hunt0));

  // Ready the Blade the lawful way: right-click, Rune branch, its disc.
  await page.mouse.click(420, 300, { button: "right" });
  await page.waitForSelector(".gw-wheel", { timeout: 9000 });
  await clickDisc(page, ".gw-disc.cat", "Rune");
  await sleep(500);
  await clickDisc(page, ".gw-disc", formName);
  await sleep(500);
  ok("the Blade stands readied (its hotbar slot is lit)", await slotLit());
  const hunt1 = await boxHunt();
  ok("with a working readied, still no box and no set-down words", !hunt1.setDownText && hunt1.placingBars === 0, JSON.stringify(hunt1));
  const E0 = energy(), W0 = await workingsCount();

  // PC: RIGHT-CLICK cancels.
  await page.mouse.click(420, 300, { button: "right" });
  await sleep(700);
  ok("the cancelling right-click opened NO wheel", !(await page.evaluate(() => !!document.querySelector(".gw-wheel"))));
  ok("the cancelling right-click set the run down (the slot's light died)", !(await slotLit()));
  ok("the cancel wrote NO cast", (await castCalls()) === 0, `calls=${await castCalls()}`);
  ok("the cancel spent NO energy and stood NO working", energy() === E0 && (await workingsCount()) === W0, `energy ${E0}->${energy()}`);
  // The standing use survives: the NEXT right-click reopens the wheel.
  await page.mouse.click(420, 300, { button: "right" });
  await page.waitForSelector(".gw-wheel", { timeout: 9000 });
  ok("the next right-click reopens the wheel — the run was truly down", true);
  await page.keyboard.press("Escape");
  await sleep(400);

  // MOBILE'S HAND: the spell's own button again.
  await clickSlot();
  ok("tapping the Blade's slot readied it again", await slotLit());
  await clickSlot();
  ok("tapping the readied spell's own slot again CANCELLED it", !(await slotLit()));
  ok("the slot cancel wrote NO cast and spent NO energy", (await castCalls()) === 0 && energy() === E0 && (await workingsCount()) === W0,
    `calls=${await castCalls()} energy ${E0}->${energy()}`);

  // THE FLOW UNBROKEN: re-ready and cast for real.
  await clickSlot();
  ok("re-readied through the slot for the cast proof", await slotLit());
  const terr0 = await call("getTerritory", {}, T.token);
  const standTile = (terr0.tiles ?? []).find((t) => t.id === terr0.tender?.tileId) ?? { q: 0, r: 0 };
  const tapTargets = await page.evaluate((tilesArg) => {
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
      if (bd < 12) out.push({ id: t.id, q: t.q, r: t.r, poly: bi });
    }
    return out;
  }, (terr0.tiles ?? []).map((t) => ({ id: t.id, q: t.q, r: t.r })));
  const ordered = tapTargets
    .map((t) => ({ ...t, d: hexDist(t, standTile) }))
    .filter((t) => t.d >= 1 && t.d <= 3)
    .sort((a, b) => a.d - b.d);
  let landed = false;
  for (const t of ordered) {
    if (landed) break;
    const pt = await page.evaluate((i) => {
      const p = document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]')[i];
      if (!p) return null;
      const r = p.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, t.poly);
    if (!pt) continue;
    await page.mouse.click(pt.x, pt.y);
    await sleep(800);
    if ((await workingsCount()) > W0) landed = true;
  }
  ok("after the cancels, a normal cast still LANDS on the land", landed, `workings ${W0}->${await workingsCount()}`);
  ok("the landed cast spent its energy (the purse moved only for the cast)", energy() < E0, `energy ${E0}->${energy()}`);
  await page.close();
}

/* ══ THE TABLE — shared seating for §B and §D ═════════════ */
async function seatTable(tenderName, room) {
  const T = await claimWithExp(tenderName, 3800);
  const nowT = Date.now();
  const mkAsset = (name, cat, p) => Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, 'sky', ?, 'image/png', ?)").run(name, cat, p, p, `cancel/${name}.png`, nowT).lastInsertRowid);
  const comp = JSON.stringify([
    { source_id: `db:${mkAsset("Cancel Body", "body", 2)}`, name: "Cancel Body", category: "body", rarity: "common", power: 2, toughness: 2, element: "sky" },
    { source_id: `db:${mkAsset("Cancel Arms", "arms", 3)}`, name: "Cancel Arms", category: "arms", rarity: "common", power: 3, toughness: 3, element: "sky" },
    { source_id: `db:${mkAsset("Cancel Head", "head", 3)}`, name: "Cancel Head", category: "head", rarity: "common", power: 3, toughness: 3, element: "sky" },
  ]);
  for (let k = 0; k < 3; k++) {
    db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
      .run(`Cancelkin ${k}`, `Cancelkin ${k}`, "cancel/awokin.png", comp, tenderName, T.ownerKey, nowT);
  }
  const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, ?, ?, 0, ?)");
  for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > 2) continue;
    insTile.run(T.ownerKey, q, r, nowT);
  }
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(T.ownerKey, nowT);
  await call("getTerritory", {}, T.token);
  await call("chooseClass", { classKey: "runewright" }, T.token);
  const { issueTableToken } = await import("../server/dist/table.js");
  const tt = issueTableToken({ id: `disc-${room}`, name: tenderName });
  const bindCode = (await call("getTableBindCode", {}, T.token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
  if (!bindRes.ok) throw new Error("table/bind failed: " + bindRes.status);

  const wstate = { state: null };
  const wws = new WebSocket(`ws://127.0.0.1:3995/table/ws`);
  await new Promise((res, rej) => { wws.onopen = res; wws.onerror = rej; });
  wws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") wstate.state = m.state; } catch { /* a torn frame is no evidence */ } };
  wws.send(JSON.stringify({ type: "join", room, watch: true, name: "Cancel Watcher" }));
  const mySeat = () => (wstate.state?.players ?? []).find((p) => p.name === tenderName) ?? null;
  const workings = () => wstate.state?.workings ?? [];
  return { T, tt, wws, wstate, mySeat, workings };
}

// Since Push 48 the /table face opens on the Discord
// shell: The Room stands first, and the old Table page —
// the Test Ground, where the Written Light's placing flow
// lives — is its own tab. Walk the shell honestly: tabs
// first, then the Test Ground's own room.
const openTestGround = async (pg) => {
  await pg.waitForSelector(".table-shell", { timeout: 30000 });
  await pg.click('button[data-tab="test"]');
  await pg.waitForSelector(".table-room", { timeout: 30000 });
  await pg.waitForFunction(() => !!document.querySelector(".table-room svg polygon"), { timeout: 30000 });
  await sleep(1500);
};

const tableBarHunt = (pg) => pg.evaluate(() => ({
  // The placing bar is struck; the UNIT bar keeps the class
  // for its own face (chosen from the roster, never while a
  // placing stands) — the hunt names the box precisely.
  placingBars: document.querySelectorAll(".placing-bar:not(.unit-bar)").length,
  setDownText: document.body.innerText.includes("Set the light down") || document.body.innerText.includes("Set the attuning down"),
}));
const placingArmed = (pg) => pg.evaluate(() => !!document.querySelector('.table-room svg polygon[fill="#ffd977"], .table-room svg polygon[fill="#ff7a33"]'));

/* ══ §B THE TABLE — the bar never renders; right-click cancels ══ */
console.log("§B the Table — the placing bar never renders; right-click cancels; the cast still lands");
{
  const S = await seatTable("Cancel Table", "cancel-casting");
  const grim = await call("getGrimoire", {}, S.T.token);
  const blade = (grim.spells ?? []).find((s) => s.engine === "blade");
  const bladeLabel = blade.root ?? blade.name;

  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror:table]", String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((sess) => { window.__awokenTableSession = sess; },
    { authToken: S.tt, room: "cancel-casting", name: "Cancel Table" });
  await page.goto(BASE + "/table?frame_id=drive", { waitUntil: "domcontentloaded", timeout: 60000 });
  await openTestGround(page);
  await waitFor(() => !!S.mySeat()?.hex, "the watcher reads the seat and its hex", 20000);

  const hunt0 = await tableBarHunt(page);
  ok("at the Table, before any readying: no placing bar, no set-down words", hunt0.placingBars === 0 && !hunt0.setDownText, JSON.stringify(hunt0));

  const readyBlade = async () => {
    await page.mouse.click(750, 320, { button: "right" });
    await page.waitForSelector(".gw-wheel", { timeout: 9000 });
    await clickDisc(page, ".gw-disc.cat", "Rune");
    await sleep(500);
    await clickDisc(page, ".gw-disc", bladeLabel);
    await sleep(500);
  };
  await readyBlade();
  ok("the Blade stands readied at the Table — its ground glows", await placingArmed(page));
  const hunt1 = await tableBarHunt(page);
  ok("at the very moment the bar used to stand, NO box renders", hunt1.placingBars === 0 && !hunt1.setDownText, JSON.stringify(hunt1));
  await page.screenshot({ path: `${OUT}/table-readied-no-box.png` });
  const E0 = S.mySeat().energy, W0 = S.workings().length;

  // PC: RIGHT-CLICK cancels.
  await page.mouse.click(750, 320, { button: "right" });
  await sleep(700);
  ok("at the Table the cancelling right-click set the placing down", !(await placingArmed(page)));
  ok("the cancelling right-click opened NO wheel", !(await page.evaluate(() => !!document.querySelector(".gw-wheel"))));
  ok("the cancel cast NOTHING and spent NOTHING at the Table", S.workings().length === W0 && S.mySeat().energy === E0,
    `workings ${W0}->${S.workings().length} energy ${E0}->${S.mySeat().energy}`);
  await page.mouse.click(750, 320, { button: "right" });
  await page.waitForSelector(".gw-wheel", { timeout: 9000 });
  ok("the next right-click reopens the wheel — the placing was truly down", true);
  await page.keyboard.press("Escape");
  await sleep(400);

  // THE FLOW UNBROKEN: re-ready, cast for real, the run stays armed.
  await readyBlade();
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
    return { perm, matched: Object.keys(perm).length };
  }, { selector, tiles, size });
  const tiles = (S.wstate.state?.map ?? []).map((t) => ({ id: t.id, q: t.q, r: t.r }));
  const permRes = await buildPerm(page, '.table-room svg polygon[fill="transparent"]', tiles, 40);
  ok("the stage's tile lattice is solved", permRes.matched === tiles.length, JSON.stringify(permRes));
  const tapTile = async (id) => {
    const box = await page.evaluate((pi) => {
      const p = [...document.querySelectorAll('.table-room svg polygon[fill="transparent"]')][pi];
      if (!p) return null;
      const r = p.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, permRes.perm[id]);
    if (!box) throw new Error("tapTile: no polygon for " + id);
    await page.mouse.click(box.x, box.y);
  };
  const seatTile = tiles.find((t) => t.id === S.mySeat().hex) ?? { q: 0, r: 0 };
  const nearTiles = tiles.filter((t) => t.id !== S.mySeat().hex).sort((a, b) => hexDist(a, seatTile) - hexDist(b, seatTile));
  let landed = false;
  for (const t of nearTiles) {
    if (landed) break;
    await tapTile(t.id);
    await sleep(900);
    if (S.workings().length > W0) landed = true;
  }
  ok("after the cancel, a normal cast still LANDS at the Table", landed, `workings ${W0}->${S.workings().length}`);
  ok("the placing STAYS armed after the cast (the sticky run is unbroken)", await placingArmed(page));
  ok("the cast spent its energy — the purse moved only for the cast", S.mySeat().energy < E0, `energy ${E0}->${S.mySeat().energy}`);
  await page.mouse.click(750, 320, { button: "right" }); // set the run down, tidy
  await sleep(500);

  /* ── §D THE ONE SURVIVOR: the rain's own button ── */
  console.log("§D the one survivor — Shard Rain's picks and its lone button");
  const rain = (grim.spells ?? []).find((s) => s.engine === "shardrain");
  ok("the book holds Shard Rain (the multi-pick writing)", !!rain, JSON.stringify((grim.spells ?? []).map((s) => s.key)));
  const rainLabel = rain.root ?? rain.name;
  await page.mouse.click(750, 320, { button: "right" });
  await page.waitForSelector(".gw-wheel", { timeout: 9000 });
  // Shard Rain is a spell-school page (kind "spell"): its
  // disc stands under the Spell branch, though the Table
  // places it by the rune flow like every writing.
  await clickDisc(page, ".gw-disc.cat", "Spell");
  await sleep(500);
  await clickDisc(page, ".gw-disc", rainLabel);
  await sleep(500);
  ok("Shard Rain stands readied — its ground glows", await placingArmed(page));
  const hunt2 = await tableBarHunt(page);
  ok("with the rain readied, still no box", hunt2.placingBars === 0 && !hunt2.setDownText, JSON.stringify(hunt2));
  for (const t of nearTiles.slice(0, 2)) { await tapTile(t.id); await sleep(600); }
  const picksGlow = await page.evaluate(() => !!document.querySelector('.table-room svg polygon[fill="#ff7a33"]'));
  ok("two taps gathered the rain's picks (the chosen ground burns orange)", picksGlow);
  const commit = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").includes("Write the rain"));
    if (!b) return null;
    return { inBar: !!b.closest(".placing-bar"), wrapClass: b.parentElement?.className ?? "", text: b.textContent.trim() };
  });
  ok("the rain's cast button stands — ALONE, in no panel", !!commit && !commit.inBar && commit.wrapClass.includes("placing-commit"), JSON.stringify(commit));
  await page.screenshot({ path: `${OUT}/table-rain-button-alone.png` });
  const E1 = S.mySeat().energy, W1 = S.workings().length;
  const commitHandle = await page.evaluateHandle(() => [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").includes("Write the rain")));
  await commitHandle.asElement().click();
  await sleep(1200);
  const picksGone = await page.evaluate(() => !document.querySelector('.table-room svg polygon[fill="#ff7a33"]'));
  ok("the lone button CAST the rain (the picks were spent)", picksGone && (S.workings().length > W1 || S.mySeat().energy < E1),
    `picksGone=${picksGone} workings ${W1}->${S.workings().length} energy ${E1}->${S.mySeat().energy}`);
  ok("the rain's placing stays armed after its cast (the run rides on)", await placingArmed(page));
  await page.close();
  S.wws.close();
}

/* ══ §C THE TABLE ON A TOUCH HAND — the spell button again ══ */
console.log("§C the Table on a touch hand — tap the spell's slot, tap it again, it is down");
{
  const S = await seatTable("Cancel Touch", "cancel-touch");
  const grim = await call("getGrimoire", {}, S.T.token);
  const blade = (grim.spells ?? []).find((s) => s.engine === "blade");

  const page = await browser.newPage();
  await page.emulate({
    viewport: { width: 900, height: 700, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
    userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  page.on("pageerror", (e) => console.log("[pageerror:touch]", String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((sess, slotKey) => {
    window.__awokenTableSession = sess;
    window.localStorage.setItem("awokin-hotbar-table", JSON.stringify([slotKey]));
  }, { authToken: S.tt, room: "cancel-touch", name: "Cancel Touch" }, `r-${blade.key}`);
  await page.goto(BASE + "/table?frame_id=drive", { waitUntil: "domcontentloaded", timeout: 60000 });
  await openTestGround(page);
  await waitFor(() => !!S.mySeat()?.hex, "the watcher reads the touch seat and its hex", 20000);

  const slotBox = () => page.evaluate(() => {
    const s = document.querySelector(".table-slot");
    if (!s) return null;
    const r = s.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, lit: s.classList.contains("lit"), title: s.getAttribute("title") ?? "" };
  });
  const sb0 = await slotBox();
  ok("the Blade's slot stands on the touch hotbar", !!sb0, JSON.stringify(sb0));
  const E0 = S.mySeat().energy, W0 = S.workings().length;
  const tale0 = (S.wstate.state?.tale ?? []).length;

  await page.touchscreen.tap(sb0.x, sb0.y);
  await sleep(800);
  const sb1 = await slotBox();
  ok("a touch tap on the spell's slot READIED it", !!sb1?.lit && (await placingArmed(page)), `lit=${sb1?.lit}`);
  const huntT = await tableBarHunt(page);
  ok("on the touch hand, readied, still no box", huntT.placingBars === 0 && !huntT.setDownText, JSON.stringify(huntT));

  await page.touchscreen.tap(sb1.x, sb1.y);
  await sleep(800);
  const sb2 = await slotBox();
  ok("a second touch tap on the SAME slot SET IT DOWN", !!sb2 && !sb2.lit && !(await placingArmed(page)), `lit=${sb2?.lit}`);
  ok("the touch cancel cast NOTHING, spent NOTHING, and told NO tale", S.workings().length === W0 && S.mySeat().energy === E0 && (S.wstate.state?.tale ?? []).length === tale0,
    `workings ${W0}->${S.workings().length} energy ${E0}->${S.mySeat().energy} tale ${tale0}->${(S.wstate.state?.tale ?? []).length}`);
  await page.close();
  S.wws.close();
}

await browser.close();
console.log(`\nCANCEL-CASTING DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
