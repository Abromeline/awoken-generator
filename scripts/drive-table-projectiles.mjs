// THE TABLE FIX PASS — projectile clearing drive (2026-10-20).
// Boots the real server in-process on a scratch DATA_DIR,
// seeds a bound tender with two Awokin in hand, summons both
// onto his own hex through the real page, begins the
// Unraveling, and orders curse-strikes across a full minute
// while sampling the page's shots layer every 200 ms.
// The defect this proves dead (Nigel's photo: shots frozen
// mid-field): a shot's 1500 ms removal timer once lived in a
// state-keyed effect whose cleanup every push (~250 ms)
// cancelled, so mid-battle a shot could essentially never be
// removed — they piled to the cap and froze at endpoints.
// The proof: every shot element the layer ever shows is
// tagged at first sight; no tagged shot may live past
// ~2.3 s (1500 ms of life + sampling slack) while the room
// pushes state all around it.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-table-projectiles.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-proj-"));
process.env.PORT = "3942";
process.env.WORKSHOP_PASSWORD = "<redacted>";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const PW = ["fix", "password", "1"].join("-");
const BASE = "http://127.0.0.1:3942";
const OUT = "/home/hatch/workspace/table-fix-proof";
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
// See drive-table-summon.mjs: store.ts's greeter ALTER (:181)
// runs before its base DDL (:213), so a fresh database never
// gains awakened.greeter and the Table's deal throws. The
// drive stands the column up itself; the defect is named in
// the fix pass's report for repair in store.ts.
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }
const claim = await call("claimTender", { password: PW, tenderName: "Bolt Tender" });
const token = claim.token;
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, Date.now());
const now = Date.now();
const bodyId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'body', 'common', 2, 2, 'sky', ?, 'image/png', ?)").run("Bolt Body", "fix/body.png", now).lastInsertRowid);
const armsId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'arms', 'common', 3, 3, 'sky', ?, 'image/png', ?)").run("Bolt Arms", "fix/arms.png", now).lastInsertRowid);
const headId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'head', 'common', 3, 3, 'sky', ?, 'image/png', ?)").run("Bolt Head", "fix/head.png", now).lastInsertRowid);
const compJson = JSON.stringify([
  { source_id: `db:${bodyId}`, name: "Bolt Body", category: "body", rarity: "common", power: 2, toughness: 2, element: "sky" },
  { source_id: `db:${armsId}`, name: "Bolt Arms", category: "arms", rarity: "common", power: 3, toughness: 3, element: "sky" },
  { source_id: `db:${headId}`, name: "Bolt Head", category: "head", rarity: "common", power: 3, toughness: 3, element: "sky" },
]);
for (const name of ["Boltkin", "Brightkin"]) {
  db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, "fix/awokin.png", compJson, "Bolt Tender", ownerKey, now);
}
await call("chooseClass", { classKey: "warden" }, token);
const { issueTableToken } = await import("../server/dist/table.js");
const tt = issueTableToken({ id: "disc-bolt", name: "Bolt Tender" });
const bindCode = (await call("getTableBindCode", {}, token)).code;
const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
if (!bindRes.ok) throw new Error("table/bind failed: " + bindRes.status);
console.log("seeded: bound Lv10 tender — Boltkin and Brightkin in hand");

const wstate = { state: null };
const wws = new WebSocket("ws://127.0.0.1:3942/table/ws");
await new Promise((res, rej) => { wws.onopen = res; wws.onerror = rej; });
wws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") wstate.state = m.state; } catch { /* a torn frame is no evidence */ } };
wws.send(JSON.stringify({ type: "join", room: "fix-projectiles", watch: true, name: "Drive Watcher" }));
const waitFor = async (fn, what, ms = 9000) => { const s = Date.now(); while (Date.now() - s < ms) { if (fn()) return true; await sleep(150); } throw new Error("drive wait: " + what); };
const waitPage = async (pg, fn, what, ms = 9000) => { const s = Date.now(); while (Date.now() - s < ms) { if (await pg.evaluate(fn)) return true; await sleep(150); } throw new Error("drive wait (page): " + what); };
const mySeat = () => wstate.state?.players.find((p) => p.name === "Bolt Tender") ?? null;
const myField = () => (wstate.state?.field ?? []).filter((u) => u.ownerKey === mySeat()?.key);
const axDist = (a, b) => { const [aq, ar] = a.split(",").map(Number); const [bq, br] = b.split(",").map(Number); const dq = aq - bq, dr = ar - br; return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)); };

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 240)));
await page.evaluateOnNewDocument((sess) => { window.__awokenTableSession = sess; },
  { authToken: tt, room: "fix-projectiles", name: "Bolt Tender" });
await page.goto(BASE + "/table?frame_id=drive", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector(".table-room", { timeout: 30000 });
await page.waitForFunction(() => document.querySelector(".table-room svg polygon"), { timeout: 30000 });
await waitFor(() => !!mySeat() && !!mySeat().hex, "watcher reads the seat and its hex");
await waitPage(page, () => [...document.querySelectorAll(".tcard")].length >= 2, "both cards stand in hand");
const landing = mySeat().hex;

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
const permRes = await buildPerm(page, '.table-room svg polygon[fill="transparent"]', (wstate.state?.map ?? []).map((t) => ({ id: t.id, q: t.q, r: t.r })), 40);
const perm = permRes.perm;
ok("the stage's tile lattice is solved", permRes.matched === (wstate.state?.map ?? []).length && permRes.worst < 20, JSON.stringify(permRes));
const tapTile = async (id) => {
  await page.evaluate((pi) => {
    const polys = [...document.querySelectorAll('.table-room svg polygon[fill="transparent"]')];
    polys[pi]?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }, perm[id]);
};
const tapFigure = async (r) => {
  await page.evaluate((rr) => {
    const c = [...document.querySelectorAll('.table-room svg circle')].find((x) => x.getAttribute("r") === String(rr) && x.getAttribute("fill") === "transparent");
    c?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }, r);
};
const clickText = async (sel, text) => page.evaluate(({ sel, text }) => {
  const el = [...document.querySelectorAll(sel)].find((b) => b.textContent.trim() === text || b.textContent.includes(text));
  if (el) { el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); return true; }
  return false;
}, { sel, text });
const clickCard = async (name) => page.evaluate((n) => {
  const el = [...document.querySelectorAll(".tcard")].find((c) => c.textContent.includes(n));
  if (el) { el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); return true; }
  return false;
}, name);

// ═══ SUMMON BOTH onto his own hex, through the figure ═══
await clickText(".hand-grab", "your hand");
await sleep(300);
for (const [i, name] of ["Boltkin", "Brightkin"].entries()) {
  await clickCard(name);
  await waitPage(page, () => !!document.querySelector(".tcard.selected"), `${name} readied`);
  await tapFigure(24);
  await waitFor(() => myField().length === i + 1, `${name} stands on the field`, 9000);
}
ok("both Awokin stand summoned on his hex", myField().length === 2 && myField().every((u) => u.hex === landing), JSON.stringify(myField().map((u) => u.hex)));

// ═══ BEGIN THE UNRAVELING ═══
await clickText("button", "Begin the Unraveling");
await waitFor(() => wstate.state?.battle?.active === true, "the battle joins", 9000);
ok("the Unraveling runs — state pushes fly at the battle's pace", true);

// Choose one of the standing pair for the strike orders.
await tapFigure(20);
await waitPage(page, () => !!document.querySelector(".unit-bar"), "the unit bar opens");
const unitHex = myField()[0].hex;

// ═══ SAMPLE THE SHOTS LAYER for a minute, striking as we go ═══
let totalFresh = 0, worstAge = 0, maxConcurrent = 0, samples = 0;
const sample = async () => {
  const s = await page.evaluate(() => {
    const now = performance.now();
    const imgs = [...document.querySelectorAll(".shots-layer image")];
    let maxAge = 0, fresh = 0;
    for (const im of imgs) {
      if (!im.dataset.born) { im.dataset.born = String(now); fresh++; }
      maxAge = Math.max(maxAge, now - Number(im.dataset.born));
    }
    return { count: imgs.length, maxAge, fresh };
  });
  samples++;
  totalFresh += s.fresh;
  worstAge = Math.max(worstAge, s.maxAge);
  maxConcurrent = Math.max(maxConcurrent, s.count);
  return s;
};
const started = Date.now();
let strikesOrdered = 0;
while (Date.now() - started < 60000) {
  await sample();
  if (strikesOrdered < 6 && Date.now() - started > 3000 + strikesOrdered * 9500) {
    // A fresh curse-strike: the nearest thin cursed tile in
    // the standing unit's sky reach (4) — each strike looses
    // exactly one shot, on the room's own witness ledger.
    const unit = myField()[0];
    const target = (wstate.state?.map ?? [])
      .filter((t) => t.cursed && unit && axDist(unit.hex, t.id) <= 4)
      .sort((a, b) => (a.curseHp - b.curseHp))[0];
    if (target && unit) {
      const strikesBefore = (wstate.state?.strikes ?? []).length;
      await tapTile(target.id);
      strikesOrdered++;
      console.log(`  strike ${strikesOrdered} ordered at ${target.id} (curse ${Math.ceil(target.curseHp)}) — strikes on the ledger before: ${strikesBefore}`);
    }
  }
  await sleep(200);
}
console.log(`  sampled ${samples} times over ${Math.round((Date.now() - started) / 1000)}s — shots seen: ${totalFresh}, worst age: ${Math.round(worstAge)}ms, most at once: ${maxConcurrent}`);
ok("shots FLEW on the field (the layer lived)", totalFresh >= 4, `saw ${totalFresh}`);
ok("ordered curse-strikes were loosed across the minute", strikesOrdered >= 4, `${strikesOrdered}`);
ok("NO shot outlived its 1500 ms by more than sampling slack (worst ≤ 2300 ms)", worstAge <= 2300, `worst ${Math.round(worstAge)}ms`);
ok("the layer never piled toward the cap (max concurrent < 20)", maxConcurrent < 20, `${maxConcurrent}`);
await page.screenshot({ path: `${OUT}/projectiles-clearing.png` });

await browser.close();
wws.close();
console.log(`\nDRIVE (projectile clearing): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
