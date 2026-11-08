// THE MISSCAST'S FACE (Nigel, 2026-11-03): a failed cast
// speaks no sentence — instead of the full text box reading
// about the spell failing, the word MISSCAST in glowing red
// pops up beside the target click, flashes twice, and
// disappears. This drive proves that face on BOTH grounds,
// through the real UI cast paths, on honest dice (a
// Runewright at +2 against DC 11 fizzles ~40% of casts — the
// drive taps until the dice give it both outcomes):
//   §A THE HOMELAND — the Blade readied through the wheel;
//      hex taps cast. On a fizzle (the fetch witness's
//      fizzled:true): a .miscast-pop stands with the exact
//      word MISSCAST, its computed animation is miscast-flash,
//      its sampled opacity pulses bright-dim-bright (two
//      flashes), it stands beside the tapped hex's centroid,
//      and it is gone within ~1.8 s — while the .hex-notice
//      NEVER carries the old failure sentence. On standing
//      casts, no pop appears. After the fizzle, a bare tap
//      casts again (the working stayed readied).
//   §B THE TABLE — the same: the Blade readied through the
//      wheel, real mouse taps on tiles; the fizzle arrives by
//      the room's tale (the watcher socket reads it — the
//      tale keeps the referee's line, the room's record), and
//      my screen answers with the pop beside the tapped tile,
//      while .notice-line NEVER carries the failure sentence.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-miscast-popup.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-miscast-"));
process.env.PORT = "3951";
process.env.WORKSHOP_PASSWORD = "miscast-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname); // the server resolves client/dist from CWD
const PW = ["miscast", "drive", "pw", "1"].join("-");
const BASE = "http://127.0.0.1:3951";
const OUT = "/home/hatch/workspace/miscast-proof";
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

// The pop recorder, installed on a page before any casting:
// samples every .miscast-pop's opacity / animation / place
// every 30 ms, and every word the old failure faces (the
// homeland's .hex-notice, the Table's .notice-line) ever
// carry — the failure sentence must never stand in either.
const RECORDER = `(() => {
  window.__popSamples = [];
  window.__noticeSeen = [];
  const scan = () => {
    const t = Date.now();
    for (const el of document.querySelectorAll(".miscast-pop")) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      window.__popSamples.push({ t, opacity: parseFloat(cs.opacity), anim: cs.animationName, text: el.textContent, cx: r.x + r.width / 2, cy: r.y + r.height / 2 });
    }
    for (const sel of [".hex-notice", ".notice-line"]) {
      const n = document.querySelector(sel);
      if (n && n.textContent && n.textContent.trim()) window.__noticeSeen.push({ t, sel, text: n.textContent });
    }
  };
  setInterval(scan, 30);
  scan();
})()`;

// Two flashes in the samples: at least two bright peaks with
// a dim valley between them, inside the pop's window.
const twoFlashes = (samples) => {
  let peaks = 0, bright = false, dipped = true;
  for (const s of samples) {
    if (s.opacity > 0.75 && !bright && dipped) { peaks++; bright = true; dipped = false; }
    if (s.opacity < 0.35) { bright = false; dipped = true; }
  }
  return peaks;
};

const clickDisc = async (pg, sel, txt) => {
  const handle = await pg.evaluateHandle((q, t) => [...document.querySelectorAll(q)].find((d) => ((d.getAttribute("aria-label") || "") + " " + (d.textContent || "")).includes(t)), sel, txt);
  const el = handle.asElement();
  if (!el) throw new Error("wheel disc not found: " + txt);
  const box = await el.boundingBox();
  if (!box) throw new Error("wheel disc has no box: " + txt);
  await pg.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });

/* ══ §A THE HOMELAND ══════════════════════════════════════ */
console.log("§A the homeland — a fizzle pops MISSCAST beside the click; no text box reads it");
{
  const claim = await call("claimTender", { password: PW, tenderName: "Miscast Land" });
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

  await page.evaluate(`(() => {
    window.__castLog = [];
    const of = window.fetch.bind(window);
    window.fetch = async (...a) => {
      const r = await of(...a);
      try {
        if (String(a[0]).includes("castMapWorking")) {
          const j = await r.clone().json().catch(() => null);
          const raw = JSON.stringify(j ?? {});
          window.__castLog.push({ at: Date.now(), ok: r.ok, fizzled: raw.includes('"fizzled":true'), refused: !r.ok });
        }
      } catch { /* the witness never breaks the page */ }
      return r;
    };
  })()`);
  await page.evaluate(RECORDER);

  // Ready the Blade the lawful way: right-click, Rune branch, its disc.
  await page.mouse.click(420, 300, { button: "right" });
  await page.waitForSelector(".gw-wheel", { timeout: 9000 });
  await clickDisc(page, ".gw-disc.cat", "Rune");
  await sleep(500);
  await clickDisc(page, ".gw-disc", formName);
  await sleep(400);

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
      if (bd < 12) out.push({ id: t.id, q: t.q, r: t.r, cursed: t.cursed ? 1 : 0, poly: bi });
    }
    return out;
  }, (terr0Data.tiles ?? []).map((t) => ({ id: t.id, q: t.q, r: t.r, cursed: t.cursed })));
  ok("every tile's hit polygon is found by its centroid", pairs.length === (terr0Data.tiles ?? []).length, `matched=${pairs.length}`);

  const tapOrder = pairs
    .map((p) => ({ i: p.poly, t: p, d: hexDist(p, standTile) }))
    .filter((x) => x.d >= 1 && x.d <= 5 && !x.t.cursed)
    .sort((a, b) => a.d - b.d)
    .slice(0, 40);

  let fizzleWin = null;   // { samples, tapCx, tapCy, firstAt, lastAt, gone }
  let standWindows = [];  // sample counts during standing casts
  let castsAfterFizzle = 0;
  let taps = 0;
  for (const { i: idx } of tapOrder) {
    if (fizzleWin && castsAfterFizzle >= 1 && standWindows.length >= 1) break;
    if (taps >= 36) break;
    const before = await page.evaluate(() => window.__castLog.length);
    const samplesBefore = await page.evaluate(() => window.__popSamples.length);
    const tapPt = await page.evaluate((i) => {
      const p = document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]')[i];
      if (!p) return null;
      const r = p.getBoundingClientRect();
      return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    }, idx);
    // A REAL mouse tap at the hex's centre: the cast aims by
    // the tap's own point, so a synthetic event (whose point
    // is (0,0), a far corner) would put the cast's aim — and
    // the miscast's pop, which stands beside the aim — in the
    // corner instead of beside the click. The real tap is
    // the honest witness for a face that answers the click.
    if (!tapPt) continue;
    await page.mouse.click(tapPt.cx, tapPt.cy);
    taps++;
    // Watch this tap's outcome; on a fizzle, keep watching
    // (and shooting) until the pop has lived and died.
    const tapAt = Date.now();
    let outcome = null;
    let shotTaken = 0;
    while (Date.now() - tapAt < 3200) {
      const log = await page.evaluate(() => window.__castLog);
      if (log.length > before && !outcome) {
        const last = log[log.length - 1];
        outcome = last.fizzled ? "fizzle" : last.refused ? "refused" : "stood";
        if (outcome !== "fizzle") break;
      }
      if (outcome === "fizzle") {
        const cur = await page.evaluate(() => {
          const el = document.querySelector(".miscast-pop");
          if (!el) return null;
          const cs = getComputedStyle(el);
          return { opacity: parseFloat(cs.opacity) };
        });
        if (cur && cur.opacity > 0.6 && shotTaken < 2) {
          shotTaken++;
          await page.screenshot({ path: `${OUT}/homeland-miscast-flash-${shotTaken}.png` });
        }
        const present = await page.evaluate(() => !!document.querySelector(".miscast-pop"));
        if (!present && Date.now() - tapAt > 1500) break;
      }
      await sleep(55);
    }
    const samples = await page.evaluate((a, b) => window.__popSamples.slice(a), samplesBefore, 0);
    if (outcome === "fizzle" && !fizzleWin) {
      const snaps = await page.evaluate(() => window.__popSamples);
      const win = snaps.filter((s) => s.t >= tapAt - 100);
      fizzleWin = { samples: win, tapCx: tapPt?.cx, tapCy: tapPt?.cy };
      console.log(`    tap ${taps}: FIZZLE — pop samples=${win.length}`);
    } else if (outcome === "stood") {
      standWindows.push(samples.length);
      console.log(`    tap ${taps}: stood — pop samples in window=${samples.length}`);
      if (fizzleWin) castsAfterFizzle++;
    } else if (outcome === "fizzle") {
      if (fizzleWin) castsAfterFizzle++;
      console.log(`    tap ${taps}: fizzle again (the run taps on)`);
    } else {
      console.log(`    tap ${taps}: outcome=${outcome ?? "none"}`);
    }
  }

  ok("the dice gave the drive a fizzle through the real cast path", !!fizzleWin, `taps=${taps}`);
  if (fizzleWin) {
    const s = fizzleWin.samples;
    ok("a .miscast-pop stood on the fizzle, worded exactly MISSCAST", s.length > 0 && s.every((x) => x.text === "MISSCAST"), `samples=${s.length} texts=${JSON.stringify([...new Set(s.map((x) => x.text))])}`);
    ok("its animation is the miscast-flash (the two-flash clock)", s.length > 0 && s.every((x) => x.anim === "miscast-flash"), JSON.stringify([...new Set(s.map((x) => x.anim))]));
    ok("the pop flashed twice (two bright pulses, a dim valley between)", twoFlashes(s) >= 2, `peaks=${twoFlashes(s)} opacities=${s.map((x) => x.opacity.toFixed(2)).join(",")}`);
    const life = s.length ? s[s.length - 1].t - s[0].t : 0;
    const lastSeen = await page.evaluate(() => !!document.querySelector(".miscast-pop"));
    ok("the pop is gone after its flash (lived ~1.2 s, forgotten by ~1.8 s)", !lastSeen && life <= 1900, `life=${life} stillPresent=${lastSeen}`);
    const dx = Math.abs((s[0]?.cx ?? 0) - (fizzleWin.tapCx ?? 0));
    const dy = (fizzleWin.tapCy ?? 0) - (s[0]?.cy ?? 0);
    ok("the pop stands beside the target click (over the tapped hex, above its centre)", dx < 110 && dy > -10 && dy < 130, `dx=${dx.toFixed(0)} dy=${dy.toFixed(0)}`);
  }
  ok("no pop appeared on any standing cast", standWindows.length >= 1 && standWindows.every((n) => n === 0), JSON.stringify(standWindows));
  ok("after the fizzle a bare tap cast again — the working stayed readied", castsAfterFizzle >= 1, `castsAfterFizzle=${castsAfterFizzle}`);
  const notices = await page.evaluate(() => window.__noticeSeen);
  const badNotices = notices.filter((n) => n.text.includes("unravels") || n.text.includes("roll falls short") || n.text.includes("stays readied in your hand"));
  ok("the .hex-notice NEVER read the failure (no unravels sentence at any sampled moment)", badNotices.length === 0, JSON.stringify(badNotices).slice(0, 200));
  await page.screenshot({ path: `${OUT}/homeland-after.png` });
  await page.close();
}

/* ══ §B THE TABLE ════════════════════════════════════════ */
console.log("§B the Table — a fizzle pops MISSCAST beside the tapped tile; the notice line stays silent");
{
  const claim = await call("claimTender", { password: PW, tenderName: "Miscast Table" });
  const token = claim.token;
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  const now = Date.now();
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, now);
  const bodyId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'body', 'common', 2, 2, 'sky', ?, 'image/png', ?)").run("Miscast Body", "miscast/body.png", now).lastInsertRowid);
  const armsId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'arms', 'common', 3, 3, 'sky', ?, 'image/png', ?)").run("Miscast Arms", "miscast/arms.png", now).lastInsertRowid);
  const headId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'head', 'common', 3, 3, 'sky', ?, 'image/png', ?)").run("Miscast Head", "miscast/head.png", now).lastInsertRowid);
  const compJson = JSON.stringify([
    { source_id: `db:${bodyId}`, name: "Miscast Body", category: "body", rarity: "common", power: 2, toughness: 2, element: "sky" },
    { source_id: `db:${armsId}`, name: "Miscast Arms", category: "arms", rarity: "common", power: 3, toughness: 3, element: "sky" },
    { source_id: `db:${headId}`, name: "Miscast Head", category: "head", rarity: "common", power: 3, toughness: 3, element: "sky" },
  ]);
  for (let k = 0; k < 3; k++) {
    db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
      .run(k === 0 ? "Miscastkin" : `Miscastkin ${k}`, k === 0 ? "Miscastkin" : `Miscastkin ${k}`, "miscast/awokin.png", compJson, "Miscast Table", ownerKey, now);
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
  const tt = issueTableToken({ id: "disc-miscast", name: "Miscast Table" });
  const bindCode = (await call("getTableBindCode", {}, token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
  if (!bindRes.ok) throw new Error("table/bind failed: " + bindRes.status);

  const grimBody = await call("getGrimoire", {}, token);
  const grim = grimBody.data ?? grimBody;
  const blade = (grim.spells ?? []).find((s) => s.engine === "blade");
  const bladeLabel = blade.root ?? blade.name ?? (blade.forms?.unaligned ?? blade.name);

  const wstate = { state: null };
  const wws = new WebSocket("ws://127.0.0.1:3951/table/ws");
  await new Promise((res, rej) => { wws.onopen = res; wws.onerror = rej; });
  wws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") wstate.state = m.state; } catch { /* a torn frame is no evidence */ } };
  wws.send(JSON.stringify({ type: "join", room: "miscast", watch: true, name: "Drive Watcher" }));
  const waitFor = async (fn, what, ms = 9000) => { const s = Date.now(); while (Date.now() - s < ms) { if (fn()) return true; await sleep(150); } throw new Error("drive wait: " + what); };
  const mySeat = () => wstate.state?.players.find((p) => p.name === "Miscast Table") ?? null;
  const workings = () => wstate.state?.workings ?? [];
  const taleKeys = () => new Set((wstate.state?.tale ?? []).map((t) => `${t.at}|${t.text}`));
  const myFizzleTale = () => (wstate.state?.tale ?? []).some((t) => t.text.startsWith("Miscast Table's ") && t.text.includes("unravels —") && t.text.includes("the roll falls short."));

  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror:table]", String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((sess) => { window.__awokenTableSession = sess; },
    { authToken: tt, room: "miscast", name: "Miscast Table" });
  await page.goto(BASE + "/table?frame_id=drive", { waitUntil: "domcontentloaded", timeout: 60000 });
  // The tabbed shell (Push 48) opens on the Room; the old
  // Table page — this section's ground — stands in the Test
  // Ground tab. Its boot takes the prepared session waiting
  // on the window (takeTableSession reads, never clears).
  await page.waitForSelector('.table-tabs button[data-tab="test"]', { timeout: 30000 });
  await page.evaluate(() => { document.querySelector('[data-tab="test"]')?.click(); });
  await page.waitForSelector(".table-room", { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector(".table-room svg polygon"), { timeout: 30000 });
  await waitFor(() => !!mySeat() && !!mySeat().hex, "watcher reads the seat and its hex", 20000);
  await page.evaluate(RECORDER);

  // Ready the Blade through the wheel; the placing bar is the witness.
  const placingArmed = async () => page.evaluate(() => !!document.querySelector(".placing-bar"));
  await page.mouse.click(750, 320, { button: "right" });
  await page.waitForSelector(".gw-wheel", { timeout: 9000 });
  await clickDisc(page, ".gw-disc.cat", "Rune");
  await sleep(500);
  await clickDisc(page, ".gw-disc", bladeLabel);
  await sleep(400);
  ok("the Blade stands readied at the Table (placing bar armed)", await placingArmed());

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
    return box;
  };

  let tableFizzle = null; // { samples, tapCx, tapCy }
  let tableStands = 0;
  let tableStandPops = 0;
  let taps = 0;
  for (const t of tiles) {
    if (tableFizzle && tableStands >= 1) break;
    if (taps >= 36) break;
    if (workings().some((w) => w.kind === "rune" && w.hex === t.id)) continue;
    if (t.id === mySeat().hex) continue;
    const taleBefore = taleKeys();
    const workBefore = workings().length;
    const samplesBefore = await page.evaluate(() => window.__popSamples.length);
    const tapAt = Date.now();
    const box = await tapTile(t.id);
    taps++;
    // The outcome arrives by state: a working lands (stood)
    // or my fizzle line joins the tale.
    let outcome = null;
    let shotTaken = 0;
    while (Date.now() - tapAt < 3600) {
      const freshTale = [...taleKeys()].filter((k) => !taleBefore.has(k));
      const fizzLine = freshTale.some((k) => k.includes("Miscast Table's ") && k.includes("unravels —") && k.includes("the roll falls short."));
      if (fizzLine) outcome = "fizzle";
      else if (workings().length > workBefore) outcome = "stood";
      if (outcome === "fizzle") {
        const cur = await page.evaluate(() => {
          const el = document.querySelector(".miscast-pop");
          if (!el) return null;
          return { opacity: parseFloat(getComputedStyle(el).opacity) };
        });
        if (cur && cur.opacity > 0.6 && shotTaken < 2) {
          shotTaken++;
          await page.screenshot({ path: `${OUT}/table-miscast-flash-${shotTaken}.png` });
        }
        const present = await page.evaluate(() => !!document.querySelector(".miscast-pop"));
        if (!present && Date.now() - tapAt > 1800) break;
      } else if (outcome) break;
      await sleep(55);
    }
    const winSamples = await page.evaluate((a) => window.__popSamples.slice(a), samplesBefore);
    if (outcome === "fizzle" && !tableFizzle) {
      const snaps = await page.evaluate(() => window.__popSamples);
      tableFizzle = { samples: snaps.filter((s) => s.t >= tapAt - 100), tapCx: box.x, tapCy: box.y };
      console.log(`    table tap ${taps}: FIZZLE — pop samples=${tableFizzle.samples.length}`);
    } else if (outcome === "stood") {
      tableStands++;
      tableStandPops += winSamples.length;
      console.log(`    table tap ${taps}: stood — pop samples in window=${winSamples.length}`);
    } else {
      console.log(`    table tap ${taps}: outcome=${outcome ?? "none"}`);
    }
    if (!(await placingArmed())) {
      // No cast outcome unloads the placing; if it ever
      // stands down, re-ready so the drive can tap on.
      await page.mouse.click(750, 320, { button: "right" });
      await page.waitForSelector(".gw-wheel", { timeout: 9000 });
      await clickDisc(page, ".gw-disc.cat", "Rune");
      await sleep(500);
      await clickDisc(page, ".gw-disc", bladeLabel);
      await sleep(400);
    }
  }

  ok("the dice gave the drive a fizzle at the Table (its line stands in the room's tale)", !!tableFizzle && myFizzleTale(), `taps=${taps} taleHas=${myFizzleTale()}`);
  if (tableFizzle) {
    const s = tableFizzle.samples;
    ok("a .miscast-pop stood on the Table fizzle, worded exactly MISSCAST", s.length > 0 && s.every((x) => x.text === "MISSCAST"), `samples=${s.length}`);
    ok("its animation is the miscast-flash (the same one class as the homeland)", s.length > 0 && s.every((x) => x.anim === "miscast-flash"), JSON.stringify([...new Set(s.map((x) => x.anim))]));
    ok("the Table pop flashed twice", twoFlashes(s) >= 2, `peaks=${twoFlashes(s)} opacities=${s.map((x) => x.opacity.toFixed(2)).join(",")}`);
    const lastSeen = await page.evaluate(() => !!document.querySelector(".miscast-pop"));
    ok("the Table pop is gone after its flash", !lastSeen, `stillPresent=${lastSeen}`);
    const dx = Math.abs((s[0]?.cx ?? 0) - tableFizzle.tapCx);
    const dy = tableFizzle.tapCy - (s[0]?.cy ?? 0);
    ok("the Table pop stands beside the tapped tile (over it, above its centre)", dx < 120 && dy > -10 && dy < 140, `dx=${dx.toFixed(0)} dy=${dy.toFixed(0)}`);
  }
  ok("no pop appeared on a standing Table cast", tableStands >= 1 && tableStandPops === 0, `stands=${tableStands} pops=${tableStandPops}`);
  const notices = await page.evaluate(() => window.__noticeSeen);
  const badNotices = notices.filter((n) => n.text.includes("unravels") || n.text.includes("roll falls short") || n.text.includes("stays readied in your hand"));
  ok("the .notice-line NEVER read the failure at the Table", badNotices.length === 0, JSON.stringify(badNotices).slice(0, 200));
  await page.screenshot({ path: `${OUT}/table-after.png` });
  await page.close();
  wws.close();
}

await browser.close();
console.log(`\nMISCAST POPUP DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
