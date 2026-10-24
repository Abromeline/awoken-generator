// THE READIED SPELL STAYS READIED (Nigel, 2026-10-23 23:39:
// "readied spells are asking to be readied again after
// casting — that is not right. click cast, cast, cast."
// Corrected 23:40: "if the roll fails you can still re cast.")
//
// The law this drive proves, on the REAL pages, both grounds:
//   · ready a working ONCE; every target tap after that casts
//     it again — a standing cast leaves it readied, and a
//     FIZZLE leaves it readied too (a failed roll is still a
//     cast; the next tap casts again with no second readying).
//   · changing workings is the run's one true end: ready a
//     different working and the taps cast THAT one.
//   · an empty purse refuses that one cast ("Not enough
//     energy" / "…costs ✦…") but does NOT un-ready: on the
//     homeland the working fires again on a later tap once
//     the purse can pay, with no re-readying between; at the
//     Table the placing bar — the readied state made visible
//     — still stands after the refusal.
//
// Before this build, the homeland dropped the ready state
// on a fizzle (doCastMap's fizzle branch called
// endMapCastRun) and on a purse refusal (the catch's "Not
// enough energy" branch ended the run). The Table dropped
// it on a purse refusal (the socket error path unloaded on
// "…costs ✦…"); its fizzle "slip" stood in the tale watcher
// too, but its pattern named only the reckoning-less tale
// form while every unravel the referee writes carries its
// reckoning — so that slip never fired on a real fizzle,
// and this build's watcher reads both forms (speaking the
// fizzle with the new law's words, unloading nothing).
//
// The caster is a SAGE on both grounds on purpose: her −2 on
// every cast against DC 11 makes the fizzle the common face
// (3 casts in 5), so the hunt for a fizzle among the casts of
// ONE readying is short and honest — the dice are the server's
// own, never rigged.
//
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-readied-stays.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-readied-"));
process.env.PORT = "3951";
process.env.WORKSHOP_PASSWORD = ["drive", "pass", "9"].join("-");
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const PW = ["readied", "stays", "pw", "1"].join("-");
const BASE = "http://127.0.0.1:3951";
const OUT = "/home/hatch/workspace/readied-stays-proof";
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
console.log("§1 the land map — one readying of the Blade, then cast, cast, cast (fizzle and all)");
{
  const claim = await call("claimTender", { password: PW, tenderName: "Readied Land" });
  const token = claim.token;
  const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id}`;
  const now = Date.now();
  db.prepare(`INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at, class_key, weapon_key, hp, weapon_next_at)
    VALUES (?, 3800, 0, ?, 'sage', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET
    total_exp = 3800, class_key = 'sage', hp = 100`).run(me, now, now + 600000);
  const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, ?, ?, 0, ?)");
  for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > 3) continue;
    insTile.run(me, q, r, now);
  }
  db.prepare("INSERT INTO tender_resources (owner_key, energy, terrain_bank, updated_at) VALUES (?, 500, 200, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500, terrain_bank = 200").run(me, now);

  const grimBody = await call("getGrimoire", {}, token);
  const grim = grimBody.data ?? grimBody;
  const blade = (grim.spells ?? []).find((s) => s.engine === "blade");
  const lattice = (grim.spells ?? []).find((s) => s.engine === "lattice");
  ok("the book holds the Blade and the Lattice (two one-tap runes)", !!blade && !!lattice,
    JSON.stringify((grim.spells ?? []).map((s) => s.key)));
  const bladeForm = blade.forms?.unaligned ?? blade.name;
  const latticeForm = lattice.forms?.unaligned ?? lattice.name;

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

  // The fetch witness: every castMapWorking the page sends —
  // the spell it names, and whether the dice let it stand,
  // fizzled it, or the purse refused it.
  await page.evaluate(`(() => {
    window.__castLog = [];
    const of = window.fetch.bind(window);
    window.fetch = async (...a) => {
      const r = await of(...a);
      try {
        if (String(a[0]).includes("castMapWorking")) {
          let spellKey = null;
          try { spellKey = JSON.parse(a[1]?.body ?? "{}").spellKey ?? null; } catch {}
          const j = await r.clone().json().catch(() => null);
          const raw = JSON.stringify(j ?? {});
          window.__castLog.push({ at: Date.now(), spellKey, ok: r.ok, fizzled: raw.includes('"fizzled":true'), refused: !r.ok, note: (j && (j.error || j.message)) || raw.slice(0, 140) });
        }
      } catch { /* the witness never breaks the page */ }
      return r;
    };
  })()`);

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
  ok("every tile's hit polygon is found by its centroid", pairs.length === (terr0Data.tiles ?? []).length,
    `matched=${pairs.length} of ${(terr0Data.tiles ?? []).length}`);
  const tapOrder = pairs
    .map((p) => ({ i: p.poly, t: p, d: hexDist(p, standTile) }))
    .filter((x) => x.d >= 1 && x.d <= 5 && !x.t.cursed)
    .sort((a, b) => a.d - b.d);
  let tapIdx = 0;
  const castLog = () => page.evaluate(() => window.__castLog);
  const tapForCast = async () => {
    // One bare land tap; returns the cast it fired, or null
    // when no cast fired at all (a dead tap — under the old
    // law, the tap after a fizzle or a purse refusal).
    const before = (await castLog()).length;
    const { i, t } = tapOrder[tapIdx++];
    await page.evaluate((idx) => {
      const p = document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]')[idx];
      p?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }, i);
    const s = Date.now();
    while (Date.now() - s < 5000) {
      const log = await castLog();
      if (log.length > before) return { entry: log[log.length - 1], tile: t };
      await sleep(120);
    }
    return { entry: null, tile: t };
  };
  const hexNotice = () => page.evaluate(() => document.querySelector(".hex-notice")?.textContent ?? "");

  let readyings = 0;
  const readyViaWheel = async (formName) => {
    await page.mouse.click(420, 300, { button: "right" });
    await page.waitForSelector(".gw-wheel", { timeout: 9000 });
    await clickDisc(page, ".gw-disc.cat", "Rune");
    await sleep(500);
    await clickDisc(page, ".gw-disc", formName);
    await page.waitForFunction((fn) => (document.querySelector(".hex-notice")?.textContent ?? "").includes("readied"), { timeout: 9000 }, formName).catch(() => {});
    await sleep(300);
    readyings++;
  };

  /* ── Phase A: ONE readying, cast after cast ── */
  await readyViaWheel(bladeForm);
  ok("the Blade was readied through the wheel (readying #1)", (await hexNotice()).includes("readied"), await hexNotice());

  let casts = 0, standings = 0, fizzles = 0, postFizzleCasts = 0, deadTaps = 0, refusals = 0;
  let fizzleNotice = "";
  for (let n = 0; n < 30; n++) {
    if (casts >= 3 && fizzles >= 1 && standings >= 1 && postFizzleCasts >= 1) break;
    const hadFizzled = fizzles > 0;
    const { entry, tile } = await tapForCast();
    if (!entry) { deadTaps++; console.log(`    tap (${tile.q},${tile.r}): NO cast fired`); continue; }
    casts++;
    if (hadFizzled) postFizzleCasts++;
    if (entry.fizzled) {
      fizzles++;
      fizzleNotice = await hexNotice();
      console.log(`    tap (${tile.q},${tile.r}): the Blade FIZZLED (cast ${casts}) — notice: ${fizzleNotice.slice(0, 110)}…`);
    } else if (entry.refused) {
      refusals++;
      console.log(`    tap (${tile.q},${tile.r}): REFUSED — ${entry.note ?? ""}`);
    } else {
      standings++;
      console.log(`    tap (${tile.q},${tile.r}): the Blade stands (cast ${casts})`);
    }
    if (entry.spellKey !== "blade") { ok("every cast of the run is the readied Blade", false, JSON.stringify(entry)); break; }
  }
  console.log(`    phase A: casts=${casts} standing=${standings} fizzled=${fizzles} post-fizzle casts=${postFizzleCasts} dead taps=${deadTaps} readyings=${readyings}`);
  ok("ONE readying served at least THREE consecutive casts on the homeland", casts >= 3 && readyings === 1, `casts=${casts} readyings=${readyings}`);
  ok("no tap of the run was dead — every tap cast", deadTaps === 0 && refusals === 0, `dead=${deadTaps} refusals=${refusals}`);
  ok("a fizzle fell among the casts of the one readying", fizzles >= 1, `fizzles=${fizzles}`);
  ok("the fizzle's own notice says the working STAYS readied", fizzleNotice.includes("stays readied"), fizzleNotice.slice(0, 160));
  ok("the tap AFTER the fizzle cast again, with no second readying (the corrected law)", postFizzleCasts >= 1 && readyings === 1, `postFizzle=${postFizzleCasts}`);
  ok("a standing cast also fell in the run (success leaves it readied too — the run went on past it)", standings >= 1, `standings=${standings}`);

  /* ── Phase B: changing workings ends the run ── */
  // The click law: a right-click while readied CANCELS the
  // run; the next right-click opens the wheel. Ready the
  // Lattice — from here the taps must cast the Lattice.
  await page.mouse.click(420, 300, { button: "right" }); // cancel the Blade's run
  await sleep(400);
  await readyViaWheel(latticeForm);
  ok("the Lattice was readied in the Blade's place (readying #2 — the run's one true end)", readyings === 2, `readyings=${readyings}`);
  let latticeCasts = 0, bladeAfterChange = 0;
  for (let n = 0; n < 4 && latticeCasts < 2; n++) {
    const { entry } = await tapForCast();
    if (!entry) continue;
    if (entry.spellKey === "lattice") latticeCasts++;
    if (entry.spellKey === "blade") bladeAfterChange++;
  }
  ok("after the change, the taps cast the NEW working — the Lattice, twice", latticeCasts >= 2, `lattice=${latticeCasts}`);
  ok("no tap after the change cast the old working", bladeAfterChange === 0, `blade=${bladeAfterChange}`);

  /* ── Phase C: the empty purse refuses the cast, not the readying ── */
  db.prepare("UPDATE tender_resources SET energy = 0 WHERE owner_key = ?").run(me);
  const refusedTap = await tapForCast();
  ok("with the purse empty, a tap is REFUSED for want of energy", !!refusedTap.entry && refusedTap.entry.refused && /Not enough energy/.test(refusedTap.entry.note ?? ""),
    JSON.stringify(refusedTap.entry));
  ok("the refusal shows in the notice, in the server's own words", (await hexNotice()).includes("Not enough energy"), await hexNotice());
  db.prepare("UPDATE tender_resources SET energy = 200 WHERE owner_key = ?").run(me);
  const afterRefill = await tapForCast();
  ok("once the purse can pay, the NEXT tap casts the same readied Lattice — no re-readying after the refusal",
    !!afterRefill.entry && !afterRefill.entry.refused && afterRefill.entry.spellKey === "lattice" && readyings === 2,
    JSON.stringify(afterRefill.entry) + ` readyings=${readyings}`);
  await page.screenshot({ path: `${OUT}/territory-readied-stays.png` });
  await page.close();
}

/* ══ §2 THE TABLE ═════════════════════════════════════════ */
console.log("§2 the Table — one readying of the Blade, cast after cast; the placing bar is the readied state's witness");
{
  const claim = await call("claimTender", { password: PW, tenderName: "Readied Table" });
  const token = claim.token;
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  const now = Date.now();
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, now);
  // Three Awoken on the roster: the seat's sitting energy is
  // its roster's reckoning (10 + 6 apiece here), deep enough
  // to cast the phases through and still be drained by hand
  // for the purse phase.
  for (let k = 0; k < 3; k++) {
    const bodyId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'body', 'common', 2, 2, 'sky', ?, 'image/png', ?)").run(`Stay Body ${k}`, `stay/body${k}.png`, now).lastInsertRowid);
    const armsId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'arms', 'common', 3, 3, 'sky', ?, 'image/png', ?)").run(`Stay Arms ${k}`, `stay/arms${k}.png`, now).lastInsertRowid);
    const headId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'head', 'common', 3, 3, 'sky', ?, 'image/png', ?)").run(`Stay Head ${k}`, `stay/head${k}.png`, now).lastInsertRowid);
    const compJson = JSON.stringify([
      { source_id: `db:${bodyId}`, name: `Stay Body ${k}`, category: "body", rarity: "common", power: 2, toughness: 2, element: "sky" },
      { source_id: `db:${armsId}`, name: `Stay Arms ${k}`, category: "arms", rarity: "common", power: 3, toughness: 3, element: "sky" },
      { source_id: `db:${headId}`, name: `Stay Head ${k}`, category: "head", rarity: "common", power: 3, toughness: 3, element: "sky" },
    ]);
    db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
      .run(`Staykin ${k}`, `Staykin ${k}`, `stay/awokin${k}.png`, compJson, "Readied Table", ownerKey, now);
  }
  // NOTE the bank at 0: the terrain bank feeds the seat's
  // sitting-energy cap point for point, and the purse phase
  // must be able to drain the seat by casting alone — with
  // no bank the cap is the roster's own 10 + 6 × 3 = 28.
  db.prepare("INSERT INTO tender_resources (owner_key, energy, terrain_bank, updated_at) VALUES (?, 500, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500, terrain_bank = 0").run(ownerKey, now);
  const insTile2 = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, ?, ?, 0, ?)");
  for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > 2) continue;
    insTile2.run(ownerKey, q, r, now);
  }
  await call("getTerritory", {}, token);
  await call("chooseClass", { classKey: "sage" }, token);
  const { issueTableToken } = await import("../server/dist/table.js");
  const tt = issueTableToken({ id: "disc-readied", name: "Readied Table" });
  const bindCode = (await call("getTableBindCode", {}, token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
  if (!bindRes.ok) throw new Error("table/bind failed: " + bindRes.status);

  const grimBody = await call("getGrimoire", {}, token);
  const grim = grimBody.data ?? grimBody;
  const blade = (grim.spells ?? []).find((s) => s.engine === "blade");
  const lattice = (grim.spells ?? []).find((s) => s.engine === "lattice");
  const bladeRoot = blade.name; // the Table's wheel names a working by its root
  const latticeRoot = lattice.name;

  const wstate = { state: null };
  const wws = new WebSocket("ws://127.0.0.1:3951/table/ws");
  await new Promise((res, rej) => { wws.onopen = res; wws.onerror = rej; });
  wws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") wstate.state = m.state; } catch { /* a torn frame is no evidence */ } };
  wws.send(JSON.stringify({ type: "join", room: "readied-stays", watch: true, name: "Drive Watcher" }));
  const waitFor = async (fn, what, ms = 9000) => { const s = Date.now(); while (Date.now() - s < ms) { if (fn()) return true; await sleep(150); } throw new Error("drive wait: " + what); };
  const waitPage = async (pg, fn, what, ms = 9000) => { const s = Date.now(); while (Date.now() - s < ms) { if (await pg.evaluate(fn)) return true; await sleep(150); } throw new Error("drive wait (page): " + what); };
  const mySeat = () => wstate.state?.players.find((p) => p.name === "Readied Table") ?? null;
  const workings = () => wstate.state?.workings ?? [];
  const fizzleCount = () => (wstate.state?.tale ?? []).filter((t) => t.text.startsWith("Readied Table's ") && t.text.includes("unravels —") && t.text.includes("the roll falls short.")).length;

  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror:table]", String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((sess) => { window.__awokenTableSession = sess; },
    { authToken: tt, room: "readied-stays", name: "Readied Table" });
  await page.goto(BASE + "/table?frame_id=drive", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".table-room", { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector(".table-room svg polygon"), { timeout: 30000 });
  await waitFor(() => !!mySeat() && !!mySeat().hex, "watcher reads the seat and its hex", 20000);
  console.log(`    seat energy: ${mySeat().energy} / ${mySeat().maxEnergy}`);

  const placingArmed = async () => page.evaluate(() => !!document.querySelector(".placing-bar"));
  const placingText = async () => page.evaluate(() => document.querySelector(".placing-bar")?.textContent ?? "");
  const noticeText = async () => page.evaluate(() => document.querySelector(".notice-line")?.textContent ?? "");

  let readyings = 0;
  const readyCard = async (rootLabel) => {
    await page.mouse.click(750, 320, { button: "right" });
    await page.waitForSelector(".gw-wheel", { timeout: 9000 });
    await clickDisc(page, ".gw-disc.cat", "Rune");
    await sleep(500);
    await clickDisc(page, ".gw-disc", rootLabel);
    await sleep(400);
    readyings++;
  };
  await readyCard(bladeRoot);
  await waitPage(page, () => !!document.querySelector(".placing-bar"), "the placing stands armed");
  ok("the Blade was readied through the wheel at the Table (readying #1) — the placing bar stands", await placingArmed());

  // The tile lattice, solved as the cast-flow drive solves it.
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
  // A REAL mouse tap at the tile's centre: since the
  // no-hex-lock build the tile's click aims by the tap's
  // own POINT (stagePointOf(e.clientX, e.clientY)), so a
  // synthetic event — whose point is (0,0), a far corner —
  // would be refused by range on every tile, however near.
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
  // One tap at the Table; the cast's witness is the room
  // itself: a standing (workings grow), a fizzle (the tale
  // names the unravel), or the purse's spend (energy falls).
  const tapForCast = async (id) => {
    const w0 = workings().length, f0 = fizzleCount(), e0 = mySeat()?.energy ?? 0;
    await tapTile(id);
    const s = Date.now();
    while (Date.now() - s < 3000) {
      await sleep(150);
      const w1 = workings().length, f1 = fizzleCount(), e1 = mySeat()?.energy ?? 0;
      if (w1 > w0) return { kind: "stood", spent: e0 - e1 };
      if (f1 > f0) return { kind: "fizzled", spent: e0 - e1 };
      if (e1 < e0) return { kind: "spent", spent: e0 - e1 };
    }
    return { kind: "dead", spent: 0 };
  };
  // Nearest the seat first: range is the casting gate, and
  // the map's far rim honestly refuses a tap the drive is
  // not here to make.
  const seatTile = tiles.find((t) => t.id === mySeat().hex) ?? { q: 0, r: 0 };
  const freshTiles = () => tiles
    .filter((t) => t.id !== mySeat().hex && !workings().some((w) => w.kind === "rune" && w.hex === t.id))
    .sort((a, b) => hexDist(a, seatTile) - hexDist(b, seatTile));

  /* ── Phase A: ONE readying, cast after cast ── */
  let casts = 0, standings = 0, fizzles = 0, postFizzleCasts = 0, deadTaps = 0, barDropped = 0;
  let fizzleNotice = "", barAfterFizzle = false;
  for (const t of freshTiles()) {
    if (casts >= 3 && fizzles >= 1 && standings >= 1 && postFizzleCasts >= 1) break;
    if (casts >= 30) break;
    const hadFizzled = fizzles > 0;
    const r = await tapForCast(t.id);
    if (r.kind === "dead") { deadTaps++; console.log(`    tap ${t.id}: NO cast fired`); continue; }
    casts++;
    if (hadFizzled) postFizzleCasts++;
    if (r.kind === "fizzled") {
      fizzles++;
      await sleep(500); // the tale watcher's word reaches the notice line
      fizzleNotice = await noticeText();
      barAfterFizzle = await placingArmed();
      console.log(`    tap ${t.id}: the Blade FIZZLED (cast ${casts}) — bar stands: ${barAfterFizzle}; notice: ${fizzleNotice.slice(0, 110)}…`);
    } else {
      if (r.kind === "stood") standings++;
      console.log(`    tap ${t.id}: cast ${casts} (${r.kind}), ✦${r.spent} spent`);
    }
    if (!(await placingArmed())) barDropped++;
  }
  console.log(`    phase A: casts=${casts} standing=${standings} fizzled=${fizzles} post-fizzle casts=${postFizzleCasts} dead taps=${deadTaps} bar drops=${barDropped} readyings=${readyings}`);
  ok("ONE readying served at least THREE consecutive casts at the Table", casts >= 3 && readyings === 1, `casts=${casts} readyings=${readyings}`);
  ok("the placing bar NEVER dropped during the run — the readied state stood after every cast", barDropped === 0, `drops=${barDropped}`);
  ok("a fizzle fell among the casts of the one readying at the Table", fizzles >= 1, `fizzles=${fizzles}`);
  ok("after the fizzle the placing bar still stood (the readied state, made visible)", barAfterFizzle);
  ok("the fizzle's notice says the working STAYS readied", fizzleNotice.includes("stays readied"), fizzleNotice.slice(0, 180));
  ok("the tap AFTER the fizzle cast again at the Table, with no second readying", postFizzleCasts >= 1 && readyings === 1, `postFizzle=${postFizzleCasts}`);
  ok("a standing cast also fell in the Table run", standings >= 1, `standings=${standings}`);

  /* ── Phase B: changing workings ends the run ── */
  await page.mouse.click(750, 320, { button: "right" }); // the click law: cancel the Blade's run
  await sleep(400);
  ok("the cancel set the Blade's placing down (the player's own unload still ends a run)", !(await placingArmed()));
  await readyCard(latticeRoot);
  await waitPage(page, () => !!document.querySelector(".placing-bar"), "the Lattice placing stands armed");
  ok("the Lattice was readied in the Blade's place (readying #2)", readyings === 2 && (await placingText()).includes("Lattice"), (await placingText()).slice(0, 120));
  const bladeStandings0 = workings().filter((w) => w.engine === "blade").length;
  let latticeStood = 0, latticeAttempts = 0;
  for (const t of freshTiles()) {
    if (latticeStood >= 1 || latticeAttempts >= 8) break;
    const r = await tapForCast(t.id);
    if (r.kind === "dead") continue;
    latticeAttempts++;
    if (workings().some((w) => w.engine === "lattice")) latticeStood = 1;
  }
  ok("after the change, the taps cast the NEW working — a Lattice stands", latticeStood >= 1, `attempts=${latticeAttempts}`);
  ok("no new Blade stood after the change", workings().filter((w) => w.engine === "blade").length === bladeStandings0,
    `blade ${bladeStandings0} -> ${workings().filter((w) => w.engine === "blade").length}`);

  /* ── Phase C: drain the purse, then the refusal ── */
  let drainTaps = 0;
  for (const t of freshTiles()) {
    if ((mySeat()?.energy ?? 0) < 2 || drainTaps >= 40) break;
    const r = await tapForCast(t.id);
    if (r.kind !== "dead") drainTaps++;
  }
  console.log(`    purse drained to ✦${mySeat()?.energy} after ${drainTaps} more casts (all on the one Lattice readying)`);
  ok("the purse was drained below the Lattice's ✦2 price by casting on", (mySeat()?.energy ?? 99) < 2, `energy=${mySeat()?.energy}`);
  const eBefore = mySeat()?.energy, wBefore = workings().length;
  const refusalTile = freshTiles()[0];
  await tapTile(refusalTile.id);
  await sleep(900);
  const refusalNotice = await noticeText();
  ok("the empty purse REFUSED the cast, naming its price", /costs ✦2/.test(refusalNotice), refusalNotice.slice(0, 160));
  ok("the refusal spent nothing and stood nothing", (mySeat()?.energy ?? -1) === eBefore && workings().length === wBefore,
    `energy ${eBefore} -> ${mySeat()?.energy}, workings ${wBefore} -> ${workings().length}`);
  ok("after the purse's refusal the placing bar STILL stands — the Lattice stays readied", await placingArmed());
  ok("the whole Table run rode TWO readyings in all (Blade once, Lattice once)", readyings === 2, `readyings=${readyings}`);
  await page.screenshot({ path: `${OUT}/table-readied-stays.png` });
  await page.close();
  wws.close();
}

await browser.close();
console.log(`\nREADIED STAYS DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
