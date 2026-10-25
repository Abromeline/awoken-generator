// THE SUMMON SEQUENCE — VISUAL PROOF (Nigel, 2026-10-23).
// The Proving Ground's summon theatre (shards converging,
// the figure rising, flash + poof, the name answering, the
// recall's poof) ported to both live grounds. This drive
// boots the real server on a scratch DATA_DIR and the real
// built client in headless Chrome, summons with REAL piece
// art (Nigel's own pieces, uploaded through the real studio
// endpoint) on both grounds, and photographs the sequence:
// a burst triggered off the fx layer's own birth (mid-
// converge) and a settled shot after (figure standing,
// shards gone). An in-page recorder keeps the phase log —
// child counts across the sequence's life — because a
// screenshot's own latency is longer than the shards' 640 ms.
// Screenshots land in ~/workspace/summon-fx-proof/.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-summon-fx.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");
const { WebSocket } = require("ws");

const OUT = "/home/hatch/workspace/summon-fx-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-summonfx-"));
process.env.PORT = "3991";
process.env.WORKSHOP_PASSWORD = "summonfx-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3991";
const PW = "summonfx-drive-password";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

await import("../server/dist/index.js");
await sleep(2500);

async function call(action, args, token, wsToken) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}), ...(wsToken ? { "x-workshop-token": wsToken } : {}) },
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return data?.data ?? data;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up */ }

const unlockRes = await fetch(`${BASE}/api/workshop/unlock`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: PW }) });
const WS_TOKEN = (await unlockRes.json()).token;

// One real Awokin from Nigel's own pieces (his migration
// pool): a body, arms and head, uploaded whole.
const MIG = "/home/hatch/workspace/your_files/awoken-migration";
const pieceFile = (cat) => join(MIG, cat, readdirSync(join(MIG, cat)).filter(f => f.endsWith(".png")).sort()[0]);
async function wakeRealAwokin(tender, tenderName, powers) {
  const layers = [];
  for (const cat of ["body", "arms", "head"]) {
    const png = readFileSync(pieceFile(cat));
    const r = await call("uploadLayerAsset", { category: cat, imageBase64: png.toString("base64"), mimeType: "image/png" }, null, WS_TOKEN);
    await call("updateLayerAssetStats", { id: r.id, power: powers[cat], toughness: 2 }, null, WS_TOKEN);
    layers.push({ source_id: `db:${r.id}`, name: r.name, category: cat, rarity: "common", power: powers[cat], toughness: 2 });
  }
  const portrait = readFileSync(pieceFile("body"));
  const id = (await call("saveAwoken", { layers, imageBase64: portrait.toString("base64"), collection: "tender", ownerName: tenderName }, tender.token)).id;
  await call("addToParty", { awakenedId: id }, tender.token);
  return id;
}
async function claimWithExp(name, exp) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, exp, Date.now());
  return { token: claim.token, ownerKey };
}

// The in-page recorder: samples the fx layer's children and
// the figure's presence every 25 ms into window.__fxlog,
// and resolves window.__fxBorn the moment the layer first
// holds the shard ring (>= 10 children) — the burst trigger.
// A second, faster watcher FREEZES the page's clock the
// instant the ring is born (+250 ms in), holding the shards
// mid-converge while the camera works — a screenshot's own
// latency is otherwise longer than the moment it hunts.
// (Only the fx reckons by performance.now here; the flash's
// setTimeout still lands on the real clock, so the burst
// clips are taken promptly, and the clock is restored
// before the settle.)
const installRecorder = (page, figSelector) => page.evaluate((sel) => {
  window.__fxlog = [];
  window.__realNow = performance.now.bind(performance);
  const freezeIv = setInterval(() => {
    const layer = document.getElementById("summon-fx-layer");
    if (layer && layer.childElementCount >= 10) {
      clearInterval(freezeIv);
      const frozen = window.__realNow() + 250;
      performance.now = () => frozen;
      window.__fxFrozen = true;
    }
  }, 5);
  window.__fxBorn = new Promise((resolve) => {
    const t0 = performance.now();
    const iv = setInterval(() => {
      const layer = document.getElementById("summon-fx-layer");
      const n = layer ? layer.childElementCount : -1;
      const first = layer && layer.firstElementChild ? layer.firstElementChild.style.cssText : "";
      window.__fxlog.push({ t: Math.round(performance.now() - t0), fig: !!document.querySelector(sel), n, shard: /4a3b28|6e5836|rgb\(74, 59, 40\)|rgb\(110, 88, 54\)/.test(first || "") });
      if (n >= 10 && !window.__fxbornAt) { window.__fxbornAt = performance.now() - t0; resolve(true); }
      if (window.__realNow() - t0 > 90000) { clearInterval(iv); resolve(false); }
    }, 25);
  });
}, figSelector);
const thawClock = (page) => page.evaluate(() => { if (window.__fxFrozen) { performance.now = window.__realNow; window.__fxFrozen = false; } });
const awaitBorn = (page) => page.evaluate(() => window.__fxBorn);
const readLog = (page) => page.evaluate(() => window.__fxlog ?? []);
const clipAround = async (page, selector, pad) => {
  const el = await page.$(selector);
  if (!el) return null;
  const box = await el.boundingBox();
  if (!box) return null;
  return { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + pad * 2, height: box.height + pad * 2 };
};
const phasesOf = (log) => ({
  max: Math.max(0, ...log.map(e => e.n)),
  sawShards: log.some(e => e.n >= 10 && e.shard),
  // Under the held clock every phase stands in the layer
  // together — the 14 shards, the flash and poof (real-clock
  // setTimeouts at 640 ms) and the answering words (760 ms):
  // 17 at the peak. The join is the observable.
  sawJoin: Math.max(0, ...log.map(e => e.n)) >= 16,
  endsEmpty: log.length > 0 && log[log.length - 1].n <= 0,
});

/* ══ §A THE HOMELAND ══════════════════════════════════════ */
console.log("§A the homeland — the rocks come together at a landed summon");
{
  const S = await claimWithExp("Fx Stage", 3800); // Lv 10 — summoner's power +1 under the Spread
  const now = Date.now();
  db.prepare(`INSERT INTO tender_progress (owner_key, class_key, weapon_key, hp, weapon_next_at, updated_at)
    VALUES (?, 'warden', 'sword', 100, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', hp = 100`).run(S.ownerKey, now + 600000, now);
  const friend = await wakeRealAwokin(S, "Fx Stage", { body: 1, arms: 0, head: 0 }); // power 1 — a gentle DC, so the retries are few
  const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
  const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', 0, ?)");
  for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > 3) continue;
    insTile.run(S.ownerKey, q, r, now);
  }
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(S.ownerKey, now);
  const friendName = (await call("getTerritory", {}, S.token)).summoning?.company?.find(c => c.awakenedId === friend)?.name;
  if (!friendName) throw new Error("the woken friend is not in the wheel's company");
  console.log("  the friend's given name:", friendName);

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => console.log("[pageerror:fx-homeland]", String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, S.token);
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
  // The app's own first-load grant rewrites a fresh tender's
  // purse as the page boots — fill it AFTER the boot, by the
  // ledger the casts themselves debit.
  db.prepare("UPDATE tender_resources SET energy = 5000 WHERE owner_key = ?").run(S.ownerKey);
  // Zoom the camera in — the figures (and so the ring that
  // is measured against them) stand larger for the camera.
  for (let i = 0; i < 6; i++) { await page.click(".zoom-in").catch(() => {}); await sleep(120); }
  await sleep(400);

  const clickDisc = async (sel, txt) => {
    const handle = await page.evaluateHandle((q, t) => [...document.querySelectorAll(q)].find((d) => ((d.getAttribute("aria-label") || "") + " " + (d.textContent || "")).includes(t)), sel, txt);
    const el = handle.asElement();
    if (!el) throw new Error("wheel disc not found: " + txt);
    const box = await el.boundingBox();
    if (!box) throw new Error("wheel disc has no box: " + txt);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  };

  await installRecorder(page, "g[data-summon-fig]");
  let burst = null;
  for (let i = 0; i < 12 && !burst; i++) {
    const born = awaitBorn(page);
    await page.mouse.click(700, 420, { button: "right" });
    await page.waitForSelector(".gw-wheel", { timeout: 9000 });
    await clickDisc(".gw-disc.cat", "Awoken");
    await sleep(500);
    await clickDisc(".gw-disc", friendName);
    const landed = await Promise.race([born, sleep(2600).then(() => false)]);
    if (landed) burst = true;
  }
  ok("the summoned figure stands on the homeland through the real wheel, shards born with it", !!burst);
  // BURST — the page's clock stands frozen at +250 ms of the
  // sequence: the ring holds mid-converge while the camera
  // takes the close clip, a wider clip, and the full frame.
  const clip1 = await clipAround(page, "g[data-summon-fig]", 120);
  if (clip1) await page.screenshot({ path: `${OUT}/homeland-mid-converge-1-clip.png`, clip: clip1 });
  const clip2 = await clipAround(page, "g[data-summon-fig]", 230);
  if (clip2) await page.screenshot({ path: `${OUT}/homeland-mid-converge-2-clip.png`, clip: clip2 });
  await page.screenshot({ path: `${OUT}/homeland-mid-converge-1.png` });
  await thawClock(page);
  await sleep(2400);
  const log = await readLog(page);
  const ph = phasesOf(log);
  ok("the recorder saw the full ring — 14 shards in the Ground's earth browns", ph.sawShards, JSON.stringify(ph));
  ok("the flash, poof and words joined the ring (17 stood together under the held clock)", ph.sawJoin, JSON.stringify(ph));
  ok("the layer emptied once the clock ran again (the tail played out)", ph.endsEmpty, JSON.stringify(ph));
  const settledCount = await page.evaluate(() => document.getElementById("summon-fx-layer")?.childElementCount ?? -1);
  ok("the layer is empty once the sequence has run (shards gone, figure standing)", settledCount === 0, String(settledCount));
  await page.screenshot({ path: `${OUT}/homeland-settled.png` });
  const clipS = await clipAround(page, "g[data-summon-fig]", 120);
  if (clipS) await page.screenshot({ path: `${OUT}/homeland-settled-clip.png`, clip: clipS });
  await page.close();
  await browser.close();
}

/* ══ §B THE TABLE ═════════════════════════════════════════ */
console.log("§B the Table — every seat watches the rocks come together");
{
  const T = await claimWithExp("Fx Table Tender", 800);
  await call("chooseClass", { classKey: "warden" }, T.token);
  const kin = await wakeRealAwokin(T, "Fx Table Tender", { body: 1, arms: 0, head: 0 }); // power 1 — a fresh seat's purse affords the retries
  const { issueTableToken } = await import("../server/dist/table.js");
  const tt = issueTableToken({ id: "disc-summonfx", name: "Fx Table Tender" });
  const bindCode = (await call("getTableBindCode", {}, T.token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
  if (!bindRes.ok) throw new Error("table/bind failed: " + bindRes.status);
  const ROOM = "summonfx";
  const ws = new WebSocket(`ws://127.0.0.1:3991/table/ws`);
  const wstate = { state: null, you: null };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") { wstate.state = m.state; if (m.you) wstate.you = m.you; } } catch { /* torn frame */ } };
  ws.send(JSON.stringify({ type: "join", authToken: tt, room: ROOM }));
  for (let i = 0; i < 60 && !wstate.you; i++) await sleep(250);
  ok("the fx seat joined the Table", !!wstate.you);

  // The screen that watches is a SECOND seat at the same
  // Table — a browser joining on the caster's own token
  // supersedes the actor's socket, and the Table's law is
  // that EVERY seat watches the summon land.
  const W = await claimWithExp("Fx Watcher", 800);
  await call("chooseClass", { classKey: "warden" }, W.token);
  const wtt = issueTableToken({ id: "disc-summonfx-watch", name: "Fx Watcher" });
  const wBindCode = (await call("getTableBindCode", {}, W.token)).code;
  const wBindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: wtt, code: wBindCode }) });
  if (!wBindRes.ok) throw new Error("watcher table/bind failed: " + wBindRes.status);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => console.log("[pageerror:fx-table]", String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((sess) => { window.__awokenTableSession = sess; }, { authToken: wtt, room: ROOM, name: "Fx Watcher" });
  await page.goto(BASE + "/table?frame_id=drive", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".table-room", { timeout: 30000 });
  await page.waitForFunction(() => !!document.querySelector(".table-room svg polygon"), { timeout: 30000 }).catch(() => {});
  await sleep(2000);
  const seededCount = await page.evaluate(() => document.querySelectorAll("g[data-unit-key]").length);
  ok("the viewer's first snapshot holds no unit (the reckoning seeds quietly)", seededCount === 0, String(seededCount));

  await installRecorder(page, "g[data-unit-key]");
  const born = awaitBorn(page);
  let unit = null;
  for (let i = 0; i < 24 && !unit; i++) {
    ws.send(JSON.stringify({ type: "summonCast", awakenedId: kin }));
    await sleep(800);
    unit = (wstate.state?.field ?? []).find((u) => u.awokenId === kin) ?? null;
  }
  ok("the summon cast landed the unit at the Table", !!unit);
  const landed = await Promise.race([born, sleep(3000).then(() => false)]);
  ok("the watching seat saw the shard ring born with the unit", !!landed);
  // BURST — the page's clock stands frozen at +250 ms of the
  // sequence, as on the homeland.
  const clip1 = await clipAround(page, "g[data-unit-key]", 110);
  if (clip1) await page.screenshot({ path: `${OUT}/table-mid-converge-1-clip.png`, clip: clip1 });
  const clip2 = await clipAround(page, "g[data-unit-key]", 200);
  if (clip2) await page.screenshot({ path: `${OUT}/table-mid-converge-2-clip.png`, clip: clip2 });
  await page.screenshot({ path: `${OUT}/table-mid-converge-1.png` });
  await thawClock(page);
  await sleep(2400);
  const log = await readLog(page);
  const ph = phasesOf(log);
  ok("the recorder saw the full ring — 14 shards in the Ground's earth browns", ph.sawShards, JSON.stringify(ph));
  ok("the flash, poof and words joined the ring (17 stood together under the held clock)", ph.sawJoin, JSON.stringify(ph));
  ok("the layer emptied once the clock ran again (the tail played out)", ph.endsEmpty, JSON.stringify(ph));
  const settledCount = await page.evaluate(() => document.getElementById("summon-fx-layer")?.childElementCount ?? -1);
  ok("the Table's layer is empty once the sequence has run", settledCount === 0, String(settledCount));
  await page.screenshot({ path: `${OUT}/table-settled.png` });
  const clipS = await clipAround(page, "g[data-unit-key]", 110);
  if (clipS) await page.screenshot({ path: `${OUT}/table-settled-clip.png`, clip: clipS });
  ws.close();
  await page.close();
  await browser.close();
}

console.log(`\nSUMMON FX DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
