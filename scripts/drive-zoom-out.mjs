// ZOOM OUT TO 0.3 (Nigel, 2026-11-10): the homeland map's
// widest view widens — the compass zoom-out button's floor
// moves from 0.5 to 0.3, so from 1.0 the Tender taps out
// four times (0.8, 0.6, 0.4, 0.3) and sees roughly three
// times the land in each direction. Zoom-in is untouched:
// +0.2 a tap, capped at 3. This drive boots the tree's real
// server on a scratch DATA_DIR, walks the real home face in
// a browser, and proves the arithmetic through the rendered
// map itself: the camera group (g.land-cam) carries the
// live zoom in its transform, which is what this reads —
// the same number the lattice is drawn by.
//   §1 the map opens at zoom 1;
//   §2 zoom-out taps step 0.8 → 0.6 → 0.4 → 0.3;
//   §3 the floor holds: extra zoom-out taps stay at 0.3;
//   §4 zoom-in climbs back (+0.2 a tap) and caps at 3,
//      holding there under extra taps.
//   node scripts/drive-zoom-out.mjs [port]
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";

const ROOT = process.cwd();
const PORT = process.argv[2] ?? "3991";
const require = createRequire(join(ROOT, "package.json"));
const Database = require("better-sqlite3");
const puppeteer = createRequire("/home/hatch/workspace/tools-chrome/package.json")("puppeteer");

const OUT = "/home/hatch/workspace/zoom-out-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join("/home/hatch/workspace/big-tmp", "awoken-zoom-proof-"));
process.env.PORT = PORT;
process.env.WORKSHOP_PASSWORD = "zoom-proof";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};
const near = (a, b) => a != null && Math.abs(a - b) < 1e-6;

await import(join(ROOT, "server/dist/index.js"));
await sleep(2500);

async function callRaw(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
async function call(action, args, token) {
  const { status, data } = await callRaw(action, args, token);
  if (status >= 300) throw new Error(`${action} -> ${status}: ${JSON.stringify(data)}`);
  return data;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
const now = Date.now();
const claim = await call("claimTender", { password: "zoom-proof-password", tenderName: "Zoom Tender" });
const token = claim.token;
const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id}`;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 0, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800, class_key = 'warden', hp = 100").run(me, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(me, now);

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, spark, hp, sealed_trays, grow_points, height, z, mix_points, curse_hp, curse_max_hp, created_at) VALUES (?, ?, ?, ?, 0, 0, 10, 0, 0, 1, ?, NULL, NULL, NULL, ?)");
const discIds = {};
for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
  if (hexDist({ q, r }, { q: 0, r: 0 }) > 4) continue;
  discIds[`${q},${r}`] = Number(insTile.run(me, q, r, "neutral", 0, now).lastInsertRowid);
}
db.prepare("UPDATE tender_progress SET tender_tile_id = ? WHERE owner_key = ?").run(discIds["0,0"], me);
const land = await call("getTerritory", {}, token);
ok("the served land carries the seeded disc", (land.tiles ?? []).length >= 30, `tiles=${(land.tiles ?? []).length}`);

/* ═══ THE BROWSER ═══════════════════════════════════════ */
console.log("the browser");
const browser = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
await sleep(2500);
const door = await page.$(".deck-button");
if (!door) throw new Error("no .deck-button on the home face");
await door.click();
await page.waitForFunction(() => !!document.querySelector("g.land-cam"), { timeout: 30000 });
await sleep(1500);
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Skip");
  if (b) b.click();
});
await sleep(800);
for (let i = 0; i < 3; i++) {
  const stood = await page.evaluate(() => !!document.querySelector(".return-report-overlay"));
  if (!stood) break;
  await page.mouse.click(24, 24);
  await sleep(300);
}
await page.evaluate(() => {
  const p = document.querySelector(".admin-popup");
  if (p) p.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "×").forEach((b) => b.click());
});
await sleep(2000);

const readZoom = () => page.evaluate(() => {
  const g = document.querySelector("g.land-cam");
  const t = g?.getAttribute("transform") ?? "";
  const m = t.match(/scale\(([\d.eE+-]+)\)/);
  return m ? parseFloat(m[1]) : null;
});
const tap = (cls) => page.evaluate((c) => {
  // Dispatch the click in-page, as the sibling drives do:
  // puppeteer's own click waits for two stable frames at the
  // point, and the living map never gives it two.
  const b = document.querySelector(`.compass-btn.${c}`);
  if (!b) throw new Error(`no .compass-btn.${c} on the map face`);
  b.click();
}, cls);

const buttons = await page.evaluate(() => ({
  out: !!document.querySelector(".compass-btn.zoom-out"),
  in: !!document.querySelector(".compass-btn.zoom-in"),
}));
ok("the compass carries both zoom buttons", buttons.out && buttons.in, JSON.stringify(buttons));

/* §1 opens at 1 */
const z0 = await readZoom();
console.log(`ZOOM initial=${z0}`);
ok("§1 the map opens at zoom 1", near(z0, 1), `zoom=${z0}`);

/* §2 out: 0.8, 0.6, 0.4, 0.3 */
const expectOut = [0.8, 0.6, 0.4, 0.3];
for (let i = 0; i < expectOut.length; i++) {
  await tap("zoom-out");
  await sleep(450);
  const z = await readZoom();
  console.log(`ZOOM after out tap ${i + 1}: ${z}`);
  ok(`§2 zoom-out tap ${i + 1} lands at ${expectOut[i]}`, near(z, expectOut[i]), `zoom=${z}`);
}
await page.screenshot({ path: join(OUT, "zoom-0.3.png") }).catch(() => {});

/* §3 the floor holds */
for (let i = 0; i < 3; i++) {
  await tap("zoom-out");
  await sleep(450);
  const z = await readZoom();
  console.log(`ZOOM after extra out tap ${i + 1}: ${z}`);
  ok(`§3 the 0.3 floor holds under extra tap ${i + 1}`, near(z, 0.3), `zoom=${z}`);
}

/* §4 in: climbs +0.2 a tap, caps at 3 */
await tap("zoom-in");
await sleep(450);
const zIn1 = await readZoom();
console.log(`ZOOM after first in tap: ${zIn1}`);
ok("§4 zoom-in climbs from the floor by 0.2 (0.3 → 0.5)", near(zIn1, 0.5), `zoom=${zIn1}`);
for (let i = 0; i < 16; i++) { await tap("zoom-in"); await sleep(220); }
const zCap = await readZoom();
console.log(`ZOOM after climbing: ${zCap}`);
ok("§4 zoom-in caps at 3", near(zCap, 3), `zoom=${zCap}`);
for (let i = 0; i < 2; i++) { await tap("zoom-in"); await sleep(350); }
const zCap2 = await readZoom();
ok("§4 the 3 cap holds under extra taps", near(zCap2, 3), `zoom=${zCap2}`);

await browser.close();
console.log(`\nDRIVE RESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
