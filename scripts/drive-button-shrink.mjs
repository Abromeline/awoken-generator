// drive-button-shrink — THE TERRAIN MAP / RETURN BUTTON
// HALVED (Nigel, 2026-10-27). One button, two stands: on the
// front face it reads "Terrain Map"; while the homeland is
// open it reads "RETURN". Nigel ruled: halve that button —
// every part of its box (mark, label, gap, padding), in the
// desktop stand and the phone stand, the corner anchor
// unmoved, the hit area shrinking with the visual.
//
// Proves in a real browser, against the real server:
//   §M the deck button's measured box (button rect, mark
//      rect, label font-size, and its distances from the
//      viewport's right and bottom edges) in both stands.
// Run MODE=before on the unmodified tree and MODE=after on
// the halved tree; the after run reads the before run's
// measures and asserts every size stands at half (±3%),
// the anchor distances stand unchanged, the labels still
// read Terrain Map / RETURN, and a tap still opens the
// homeland and a tap on RETURN still comes back.
// Screenshots land in ~/workspace/button-shrink-proof/.
// Run after `npm run build`:
//   PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache MODE=before node scripts/drive-button-shrink.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

const MODE = process.env.MODE || "after";
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-button-shrink-"));
process.env.PORT = "39977";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39977";
const PW = "button-shrink-drive-password";
const PROOF = join(process.env.HOME, "workspace/button-shrink-proof");
mkdirSync(PROOF, { recursive: true });
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
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up, as the other drives do */ }
const now = Date.now();

/* ══ THE WORLD: a fresh Tender ══════════════════════════ */
const claim = await call("claimTender", { password: PW, tenderName: "Button Shrink Tender" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
const token = claim.token;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, protection_bank_ms, shadow_matter, lighthouse_lit, wave_intensity, updated_at) VALUES (?, 3800, 3, 'warden', 'sword', 100, 1800000, 10, 0, 3, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', total_exp = 3800, hp = 100, protection_bank_ms = 1800000, shadow_matter = 10, lighthouse_lit = 0, wave_intensity = 3").run(ownerKey, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 500, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500").run(ownerKey, now);
await call("getTerritory", {}, token);

/* ══ OPEN THE FACE ═════════════════════════════════════ */
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:button-shrink]", String(e).slice(0, 200)));
await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
await page.goto(BASE, { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector(".deck-button", { timeout: 30000 });
await sleep(1500);

const measure = () => page.evaluate(() => {
  const btn = document.querySelector(".deck-button");
  const img = btn?.querySelector("img");
  const span = btn?.querySelector("span");
  const r = btn?.getBoundingClientRect();
  const ir = img?.getBoundingClientRect();
  const cs = span ? getComputedStyle(span) : null;
  const vw = window.innerWidth, vh = window.innerHeight;
  return {
    label: span?.textContent ?? null,
    btnW: r?.width ?? 0, btnH: r?.height ?? 0,
    fromRight: r ? vw - r.right : -1,
    fromBottom: r ? vh - r.bottom : -1,
    imgW: ir?.width ?? 0, imgH: ir?.height ?? 0,
    fontPx: cs ? parseFloat(cs.fontSize) : 0,
  };
});

console.log(`§M the front face — the Terrain Map stand (${MODE})`);
const front = await measure();
console.log("   front:", JSON.stringify(front));
ok("the front-face stand reads Terrain Map", front.label === "Terrain Map", front.label ?? "none");
await page.screenshot({ path: join(PROOF, `${MODE}-front.png`) });

/* ══ INTO THE HOMELAND — the RETURN stand ══════════════ */
await page.click(".deck-button");
await sleep(3500);
const home = await measure();
console.log("   homeland:", JSON.stringify(home));
ok("the homeland stand reads RETURN", home.label === "RETURN", home.label ?? "none");
await page.screenshot({ path: join(PROOF, `${MODE}-homeland.png`) });

if (MODE === "before") {
  writeFileSync(join(PROOF, "before-measures.json"), JSON.stringify({ front, home }, null, 2));
} else {
  const b = JSON.parse(readFileSync(join(PROOF, "before-measures.json"), "utf8"));
  const half = (name, after, before) =>
    ok(`${name} stands at half (${before} -> ${after})`,
      before > 0 && Math.abs(after / before - 0.5) <= 0.03, `ratio=${before ? (after / before).toFixed(3) : "n/a"}`);
  for (const [stand, a, bf] of [["front", front, b.front], ["homeland", home, b.home]]) {
    half(`${stand} mark width`, a.imgW, bf.imgW);
    half(`${stand} mark height`, a.imgH, bf.imgH);
    half(`${stand} label font-size`, a.fontPx, bf.fontPx);
    half(`${stand} button width`, a.btnW, bf.btnW);
    half(`${stand} button height`, a.btnH, bf.btnH);
    ok(`${stand} anchor unmoved — distance from the right edge (${bf.fromRight} -> ${a.fromRight})`,
      Math.abs(a.fromRight - bf.fromRight) <= 1.5);
    ok(`${stand} anchor unmoved — distance from the bottom edge (${bf.fromBottom} -> ${a.fromBottom})`,
      Math.abs(a.fromBottom - bf.fromBottom) <= 1.5);
  }
  /* the way back still works: RETURN closes the homeland */
  await page.click(".deck-button");
  await sleep(2500);
  const back = await measure();
  ok("a tap on RETURN still comes back to the front face", back.label === "Terrain Map", back.label ?? "none");
}

await browser.close();
console.log(`\nBUTTON-SHRINK DRIVE (${MODE}): ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
