// THE CAST FLOW, WITH NO WINDOW IN IT (Nigel, 2026-10-20
// 23:21: "remove the pour popup window for all windows. just
// click drag equip tap cast tap cast tap cast").
// The cast-time pour menu was struck from both clients in
// ccc18f8; this drive proves the flow that stands today, on
// the REAL pages, end to end:
//   §1 THE LAND MAP — ready the Blade in the hand's Spells
//      face, then tap hex after hex: every tap fires a cast
//      (the fetch log is the witness), standing casts land
//      back to back on bare taps alone, and a MutationObserver
//      watching for any dialog / popup / modal element sees
//      NOTHING appear between taps.
//   §2 THE TABLE — the same law through the satchel: ready
//      the Blade's card, tap hex after hex, the room's own
//      state (a watcher socket) counts the workings as they
//      land, back to back, no window between taps.
// A fizzle is honest dice (Runewright, +2 in his school,
// against DC 11): it ends the run by the shipped law, so the
// drive re-readies with one click — as a player does — and
// taps on. The run it swears by is three STANDING casts in a
// row with nothing but hex taps between them.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-cast-flow.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-castflow-"));
process.env.PORT = "3947";
process.env.WORKSHOP_PASSWORD = ["drive", "pass", "9"].join("-");
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname); // the server resolves client/dist from CWD
const PW = ["cast", "flow", "pw", "1"].join("-");
const BASE = "http://127.0.0.1:3947";
const OUT = "/home/hatch/workspace/cast-flow-proof";
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

// The popup watcher, installed on a page before any casting:
// it records EVERY appearance of a dialog / popup / modal
// element (the pour window's own classes among them) from
// the moment it is installed. An empty log at the end of a
// cast sequence is the proof no window stood between taps.
const INSTRUMENT = `(() => {
  window.__popupLog = [];
  const SEL = '[role="dialog"], .dice-overlay, .dice-pop, .hex-confirm, .admin-popup, .champion-picker-overlay, .return-report-overlay, .target-map-modal, .aspect-picker, .name-popup, .pour-row, .pour-label, .placing-pour, .hue-chip, .gw-wheel';
  const seen = new WeakSet();
  const scan = () => {
    for (const el of document.querySelectorAll(SEL)) {
      if (seen.has(el)) continue;
      seen.add(el);
      if (el.getClientRects().length > 0) window.__popupLog.push({ at: Date.now(), cls: String(el.className).slice(0, 80), role: el.getAttribute("role") });
    }
  };
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
  setInterval(scan, 120);
  scan();
})()`;

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });

/* ══ §1 THE LAND MAP ══════════════════════════════════════ */
console.log("§1 the land map — ready the Blade, tap hexes, casts land back to back");
{
  const claim = await call("claimTender", { password: PW, tenderName: "Castflow Land" });
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
  // Energy is clamped to his true max on every read — the
  // bank is what makes the purse deep (10 base + the bank,
  // point for point), so the bank is seeded, not just coins.
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

  // The fetch witness: every castMapWorking the page sends,
  // and whether the dice let it stand.
  await page.evaluate(`(() => {
    window.__castLog = [];
    const of = window.fetch.bind(window);
    window.fetch = async (...a) => {
      const r = await of(...a);
      try {
        if (String(a[0]).includes("castMapWorking")) {
          const j = await r.clone().json().catch(() => null);
          const raw = JSON.stringify(j ?? {});
          window.__castLog.push({ at: Date.now(), ok: r.ok, fizzled: raw.includes('"fizzled":true'), refused: !r.ok, note: (j && (j.error || j.message)) || raw.slice(0, 120) });
        }
      } catch { /* the witness never breaks the page */ }
      return r;
    };
  })()`);
  await page.evaluate(INSTRUMENT);

  // Ready the Blade: the hand's Spells face, then the page.
  const tabHit = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button[role="tab"]')].find((x) => x.textContent.includes("Spells"));
    if (b) { b.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); return true; }
    return false;
  });
  ok("the hand's Spells face opens", tabHit);
  await sleep(400);
  const readySpell = async () => page.evaluate((fn) => {
    const b = [...document.querySelectorAll(".dock-spells button")].find((x) => x.textContent.includes(fn));
    if (b) { b.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); return true; }
    return false;
  }, formName);
  ok("the Blade is readied from the book's face", await readySpell());
  await sleep(400);

  const polyCount = await page.evaluate(() => document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]').length);
  ok("the land's hexes stand ready to be tapped", polyCount >= 20, `polygons=${polyCount}`);
  // The hit polygons stand one per tile, in the same order
  // the server serves the tiles (proven in the diagnostic:
  // 217 polygons, 217 tiles) — so the drive can tap NEAREST
  // the Tender's stand first and never meet the reach refusal
  // (ring 6 of his stand) that a far tile honestly earns.
  const terr0 = await call("getTerritory", {}, token);
  const terr0Data = terr0.data ?? terr0;
  const standTile = (terr0Data.tiles ?? []).find((t) => t.id === terr0Data.tender?.tileId) ?? { q: 0, r: 0 };
  // Polygon order is NOT tile order (the map paints back to
  // front) — so the drive maps each hit polygon to its tile
  // by CENTROID, against the client's own lattice (origin
  // 250,170; basis at HEX_BASE_SIZE 54). Proven in the
  // diagnostic: 217 of 217 matched, worst error 0.03 units.
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
  ok("every tile's hit polygon is found by its centroid", pairs.length === (terr0Data.tiles ?? []).length,
    `matched=${pairs.length} of ${(terr0Data.tiles ?? []).length}`);
  // Clean ground only, never the stand tile itself, nearest
  // first: a Blade written on cursed ground springs at the
  // cast (the spell is the hammer) and leaves nothing
  // standing to count — clean ground keeps the proof honest.
  const tapOrder = pairs
    .map((p) => ({ i: p.poly, t: p, d: hexDist(p, standTile) }))
    .filter((x) => x.d >= 1 && x.d <= 5 && !x.t.cursed)
    .sort((a, b) => a.d - b.d)
    .slice(0, 40);
  // The hand's own words say whether the working still
  // stands readied — the spell button TOGGLES, so the drive
  // only ever clicks it when the hand is truly empty.
  const isArmed = async () => page.evaluate(() =>
    (document.querySelector(".dock-spells")?.textContent ?? "").includes("Tap a hex"));
  // Re-readying after a fizzle goes through the hand's own
  // doors, as a player's does: the Spells tab (which raises
  // cast mode) and then the page (which chooses the working)
  // — the dock's spell button alone sets the key, not the mode.
  const reReady = async () => {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button[role="tab"]')].find((x) => x.textContent.includes("Spells"));
      if (b) b.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await sleep(250);
    await readySpell();
    await sleep(350);
  };

  let casts = 0, standings = 0, fizzles = 0, run = 0, bestRun = 0, deadTaps = 0, taps = 0, reReadies = 0;
  for (const { i: idx, t } of tapOrder) {
    if (bestRun >= 3) break;
    const before = await page.evaluate(() => window.__castLog.length);
    await page.evaluate((i) => {
      const p = document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]')[i];
      p?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }, idx);
    taps++;
    await sleep(550);
    const log = await page.evaluate(() => window.__castLog);
    if (log.length > before) {
      const last = log[log.length - 1];
      casts++;
      if (last.fizzled) {
        fizzles++; run = 0;
        console.log(`    tap (${t.q},${t.r}): the roll fell short — the working slips from the hand`);
        if (!(await isArmed())) { await reReady(); reReadies++; }
      } else if (last.refused) {
        run = 0;
        console.log(`    tap (${t.q},${t.r}): REFUSED — ${last.note ?? ""}`);
      } else {
        standings++; run++; bestRun = Math.max(bestRun, run);
        console.log(`    tap (${t.q},${t.r}): the Blade stands (run ${run})`);
      }
    } else {
      deadTaps++;
      console.log(`    tap (${t.q},${t.r}): no cast fired (armed=${await isArmed()})`);
      if (!(await isArmed())) { await reReady(); reReadies++; }
    }
  }
  console.log(`    taps=${taps} casts fired=${casts} standing=${standings} fizzled=${fizzles} re-readies=${reReadies} dead taps=${deadTaps} best back-to-back run=${bestRun}`);
  ok("every standing cast fired on a bare hex tap (≥3 casts)", casts >= 3, `casts=${casts}`);
  ok("three casts stood BACK TO BACK — tap cast, tap cast, tap cast", bestRun >= 3, `bestRun=${bestRun}`);
  const terr = await call("getTerritory", {}, token);
  const terrData = terr.data ?? terr;
  ok("the room of the land agrees: the workings stand on it", (terrData.workings ?? []).length === standings,
    `server workings=${(terrData.workings ?? []).length} page standings=${standings}`);
  const popups = await page.evaluate(() => window.__popupLog);
  ok("NO popup, dialog or modal appeared on the land map at any point", popups.length === 0, JSON.stringify(popups).slice(0, 300));
  const pourMarkup = await page.evaluate(() => {
    const h = document.body.innerHTML;
    return ["pour-row", "placing-pour", "hue-chip"].filter((s) => h.includes(s));
  });
  ok("no pour-window markup exists in the land page's DOM", pourMarkup.length === 0, JSON.stringify(pourMarkup));
  await page.screenshot({ path: `${OUT}/territory-tap-cast.png` });
  await page.close();
}

/* ══ §2 THE TABLE ═════════════════════════════════════════ */
console.log("§2 the Table — ready the Blade's card, tap hexes, workings land back to back");
{
  const claim = await call("claimTender", { password: PW, tenderName: "Castflow Table" });
  const token = claim.token;
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  const now = Date.now();
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, now);
  const bodyId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'body', 'common', 2, 2, 'sky', ?, 'image/png', ?)").run("Flow Body", "flow/body.png", now).lastInsertRowid);
  const armsId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'arms', 'common', 3, 3, 'sky', ?, 'image/png', ?)").run("Flow Arms", "flow/arms.png", now).lastInsertRowid);
  const headId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'head', 'common', 3, 3, 'sky', ?, 'image/png', ?)").run("Flow Head", "flow/head.png", now).lastInsertRowid);
  const compJson = JSON.stringify([
    { source_id: `db:${bodyId}`, name: "Flow Body", category: "body", rarity: "common", power: 2, toughness: 2, element: "sky" },
    { source_id: `db:${armsId}`, name: "Flow Arms", category: "arms", rarity: "common", power: 3, toughness: 3, element: "sky" },
    { source_id: `db:${headId}`, name: "Flow Head", category: "head", rarity: "common", power: 3, toughness: 3, element: "sky" },
  ]);
  db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run("Flowkin", "Flowkin", "flow/awokin.png", compJson, "Castflow Table", ownerKey, now);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, terrain_bank, updated_at) VALUES (?, 500, 200, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500, terrain_bank = 200").run(ownerKey, now);
  // His homeland disc + a first read, so his stand exists
  // before the Table seats him (the seat's hex is his stand).
  const insTile2 = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, ?, ?, 0, ?)");
  for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > 2) continue;
    insTile2.run(ownerKey, q, r, now);
  }
  await call("getTerritory", {}, token);
  await call("chooseClass", { classKey: "runewright" }, token);
  const { issueTableToken } = await import("../server/dist/table.js");
  const tt = issueTableToken({ id: "disc-castflow", name: "Castflow Table" });
  const bindCode = (await call("getTableBindCode", {}, token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
  if (!bindRes.ok) throw new Error("table/bind failed: " + bindRes.status);

  const grimBody = await call("getGrimoire", {}, token);
  const grim = grimBody.data ?? grimBody;
  const blade = (grim.spells ?? []).find((s) => s.engine === "blade");
  const formName = blade.forms?.unaligned ?? blade.name;

  const wstate = { state: null };
  const wws = new WebSocket("ws://127.0.0.1:3947/table/ws");
  await new Promise((res, rej) => { wws.onopen = res; wws.onerror = rej; });
  wws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") wstate.state = m.state; } catch { /* a torn frame is no evidence */ } };
  wws.send(JSON.stringify({ type: "join", room: "cast-flow", watch: true, name: "Drive Watcher" }));
  const waitFor = async (fn, what, ms = 9000) => { const s = Date.now(); while (Date.now() - s < ms) { if (fn()) return true; await sleep(150); } throw new Error("drive wait: " + what); };
  const waitPage = async (pg, fn, what, ms = 9000) => { const s = Date.now(); while (Date.now() - s < ms) { if (await pg.evaluate(fn)) return true; await sleep(150); } throw new Error("drive wait (page): " + what); };
  const mySeat = () => wstate.state?.players.find((p) => p.name === "Castflow Table") ?? null;
  const workings = () => wstate.state?.workings ?? [];

  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror:table]", String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((sess) => { window.__awokenTableSession = sess; },
    { authToken: tt, room: "cast-flow", name: "Castflow Table" });
  await page.goto(BASE + "/table?frame_id=drive", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".table-room", { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector(".table-room svg polygon"), { timeout: 30000 });
  try {
    await waitFor(() => !!mySeat() && !!mySeat().hex, "watcher reads the seat and its hex", 20000);
  } catch (e) {
    console.log("    [diag] watcher players:", JSON.stringify((wstate.state?.players ?? []).map((p) => ({ name: p.name, hex: p.hex }))));
    console.log("    [diag] page text:", await page.evaluate(() => (document.querySelector(".table-room")?.textContent ?? document.body.textContent).slice(0, 300)).catch(() => "?"));
    await page.screenshot({ path: `${OUT}/table-seat-diag.png` }).catch(() => {});
    throw e;
  }
  console.log(`    seat energy: ${mySeat().energy} / ${mySeat().maxEnergy}`);
  await page.evaluate(INSTRUMENT);

  // Raise the hand, open the Spells tab, ready the Blade.
  await page.evaluate(() => {
    const g = document.querySelector(".hand-grab");
    if (g && g.getAttribute("aria-expanded") !== "true") g.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await sleep(400);
  const tabHit = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.satchel-tabs button[role="tab"]')].find((x) => x.textContent.includes("Spells"));
    if (b) { b.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); return true; }
    return false;
  });
  ok("the satchel's Spells tab opens", tabHit);
  await sleep(400);
  const readyCard = async () => page.evaluate((fn) => {
    const c = [...document.querySelectorAll(".working-card")].find((x) => x.textContent.includes(fn) && x.textContent.includes("Rune"));
    if (c) { c.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); return true; }
    return false;
  }, formName);
  const cardSelected = async () => page.evaluate((fn) =>
    [...document.querySelectorAll(".working-card.selected")].some((x) => x.textContent.includes(fn)), formName);
  ok("the Blade's card stands in the satchel", await page.evaluate((fn) =>
    [...document.querySelectorAll(".working-card")].some((x) => x.textContent.includes(fn)), formName));
  await readyCard();
  await waitPage(page, () => !!document.querySelector(".placing-bar"), "the placing stands armed");
  ok("the Blade is readied — the placing bar stands, no window opened", await cardSelected());

  // The tile lattice, solved as the summon drive solves it.
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
    await page.evaluate((pi) => {
      const polys = [...document.querySelectorAll('.table-room svg polygon[fill="transparent"]')];
      polys[pi]?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }, perm[id]);
  };

  let standings = 0, run = 0, bestRun = 0, taps = 0, deadTaps = 0, reReadies = 0;
  const baseCount = workings().length;
  for (const t of tiles) {
    if (bestRun >= 3 || taps >= 40) break;
    if (workings().some((w) => w.kind === "rune" && w.hex === t.id)) continue; // one writing per hex
    if (t.id === mySeat().hex) continue;
    const before = workings().length;
    await tapTile(t.id);
    taps++;
    await sleep(650);
    const after = workings().length;
    if (after > before) {
      standings += after - before; run++; bestRun = Math.max(bestRun, run);
    } else {
      // No working landed: either the dice fizzled (the run
      // ends by law — the card leaves the hand) or the tap
      // raced a state push. Re-ready only when the card
      // truly slipped; otherwise tap on.
      if (!(await cardSelected())) {
        run = 0; reReadies++;
        await readyCard();
        await sleep(350);
      } else {
        deadTaps++;
      }
    }
  }
  console.log(`    taps=${taps} workings landed=${standings} re-readies after fizzle=${reReadies} dead taps=${deadTaps} best back-to-back run=${bestRun} seat energy now=${mySeat()?.energy}`);
  ok("workings landed on bare hex taps at the Table (≥3)", standings >= 3, `standings=${standings}`);
  ok("three casts stood BACK TO BACK at the Table — tap cast, tap cast, tap cast", bestRun >= 3, `bestRun=${bestRun}`);
  ok("the watcher counts every landed working", workings().length === baseCount + standings,
    `watcher=${workings().length} base=${baseCount} standings=${standings}`);
  const popups = await page.evaluate(() => window.__popupLog);
  ok("NO popup, dialog or modal appeared at the Table at any point", popups.length === 0, JSON.stringify(popups).slice(0, 300));
  const pourMarkup = await page.evaluate(() => {
    const h = document.body.innerHTML;
    return ["pour-row", "placing-pour", "hue-chip"].filter((s) => h.includes(s));
  });
  ok("no pour-window markup exists in the Table page's DOM", pourMarkup.length === 0, JSON.stringify(pourMarkup));
  await page.screenshot({ path: `${OUT}/table-tap-cast.png` });
  await page.close();
  wws.close();
}

await browser.close();
console.log(`\nCAST FLOW DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
