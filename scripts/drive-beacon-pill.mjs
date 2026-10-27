// drive-beacon-pill — THE LIGHTHOUSE STRAIGHTENED + THE
// LIGHT-THE-BEACON PILL RE-SEATED (Nigel, 2026-10-27:
// "move light the beacon over to the button after moving
// it up above the inventory bag and rotating it so that
// the lighthouse is straight up and down").
//
// Proves in a real browser, against the real server:
//   §P the beacon switch pill's seat against its whole
//      bottom-right cluster (the Terrain/Return deck
//      button, the inventory bag, the champion button)
//      in the homeland, on desktop and phone stands:
//      the pill covers none of them, stands above the
//      deck button's box on desktop (sharing its right
//      anchor) and above the bag on both, and its
//      refusal note never falls across the cluster.
//   §F the pill still works: a tap lights the beacon
//      (its word changes, or its note speaks).
// The lighthouse's straightening is proven on the asset
// itself (before copy + close crop in the proof folder);
// this drive screenshots the button's mark as rendered.
// Run MODE=before on the unmodified tree, MODE=after on
// the re-seated tree; screenshots land in
// ~/workspace/beacon-pill-proof/.
// Run after `npm run build`:
//   PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache MODE=before node scripts/drive-beacon-pill.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

const MODE = process.env.MODE || "after";
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-beacon-pill-"));
process.env.PORT = "39979";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39979";
const PW = "beacon-pill-drive-password";
const PROOF = join(process.env.HOME, "workspace/beacon-pill-proof");
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

/* ══ THE WORLD: a fresh Tender with a standing battle ══ */
const claim = await call("claimTender", { password: PW, tenderName: "Beacon Pill Tender" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
const token = claim.token;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, protection_bank_ms, shadow_matter, lighthouse_lit, wave_intensity, updated_at) VALUES (?, 3800, 3, 'warden', 'sword', 100, 1800000, 10, 0, 3, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', total_exp = 3800, hp = 100, protection_bank_ms = 1800000, shadow_matter = 10, lighthouse_lit = 0, wave_intensity = 3").run(ownerKey, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 500, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500").run(ownerKey, now);
await call("getTerritory", {}, token);

/* ══ OPEN THE FACE ═════════════════════════════════════ */
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("[pageerror:beacon-pill]", String(e).slice(0, 200)));
await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);

const measure = () => page.evaluate(() => {
  const rect = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  };
  const pill = document.querySelector(".beacon-switch");
  return {
    pillText: pill?.textContent?.trim() ?? null,
    pillLit: pill?.classList.contains("lit") ?? false,
    pill: rect(".beacon-switch"),
    note: rect(".beacon-switch-note"),
    deck: rect(".deck-button"),
    bag: rect(".bag-btn"),
    champion: rect(".champion-fab"),
  };
});
const overlaps = (a, b) => !!(a && b && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1);

async function shoot(viewport, tag) {
  await page.setViewport(viewport);
  await page.goto(BASE, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector(".deck-button", { timeout: 30000 });
  try { await page.waitForSelector(".beacon-switch", { timeout: 15000 }); } catch { console.log("   (the pill did not appear)"); }
  await sleep(1500);
  const front = await measure();
  console.log(`   ${tag} front:`, JSON.stringify(front));
  ok(`${tag}: the pill stands on the front face`, !!front.pill);
  await page.screenshot({ path: join(PROOF, `${MODE}-${tag}-front.png`) });
  if (tag === "desktop") {
    const mark = await page.$(".deck-button");
    if (mark) await mark.screenshot({ path: join(PROOF, `${MODE}-rendered-mark.png`) });
  }
  await page.click(".deck-button");
  await sleep(3500);
  /* the First Seed story panel can cover the phone homeland — tend it away */
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Tend on");
    if (b) b.click();
  });
  await sleep(1200);
  const home = await measure();
  console.log(`   ${tag} homeland:`, JSON.stringify(home));
  ok(`${tag}: the pill, the bag and the champion all stand in the homeland`, !!(home.pill && home.bag && home.champion));
  await page.screenshot({ path: join(PROOF, `${MODE}-${tag}-homeland.png`) });
  return home;
}

console.log(`§P the cluster, desktop stand (${MODE})`);
const desk = await shoot({ width: 1400, height: 950, deviceScaleFactor: 1 }, "desktop");

console.log(`§P the cluster, phone stand (${MODE})`);
const phone = await shoot({ width: 390, height: 844, deviceScaleFactor: 1 }, "phone");

if (MODE === "before") {
  writeFileSync(join(PROOF, "before-measures.json"), JSON.stringify({ desk, phone }, null, 2));
} else {
  const clearAbove = (name, above, below, min) =>
    ok(`${name} — clear air of ${(above && below) ? (below.top - above.bottom).toFixed(1) : "?"}px`,
      !!(above && below) && below.top - above.bottom >= min);
  /* desktop: the pill caps the deck button's box, right anchors aligned */
  ok("desktop: the pill's right edge stands on the deck button's right anchor",
    Math.abs(desk.pill.right - desk.deck.right) <= 2, `pill.right=${desk.pill?.right} deck.right=${desk.deck?.right}`);
  clearAbove("desktop: the pill stands above the deck button's box", desk.pill, desk.deck, 6);
  clearAbove("desktop: the pill stands above the inventory bag", desk.pill, desk.bag, 6);
  ok("desktop: the pill covers neither deck button, bag nor champion",
    !overlaps(desk.pill, desk.deck) && !overlaps(desk.pill, desk.bag) && !overlaps(desk.pill, desk.champion));
  /* phone: the pill caps the cluster in the bag's column, above the bag */
  clearAbove("phone: the pill stands above the inventory bag", phone.pill, phone.bag, 6);
  ok("phone: the pill covers neither deck button, bag nor champion",
    !overlaps(phone.pill, phone.deck) && !overlaps(phone.pill, phone.bag) && !overlaps(phone.pill, phone.champion));

  /* §F the pill still works: tap it on the desktop homeland */
  await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
  await page.goto(BASE, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector(".deck-button", { timeout: 30000 });
  await page.click(".deck-button");
  await sleep(3000);
  try { await page.waitForSelector(".beacon-switch", { timeout: 15000 }); } catch { console.log("   (the pill did not reappear)"); }
  const beforeTap = await measure();
  const hit = await page.evaluate(() => {
    const el = document.querySelector(".beacon-switch");
    if (!el) return "no pill";
    const r = el.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return `disabled=${el.disabled} atPoint=${at ? (at.className || at.tagName) : "none"} same=${at === el || el.contains(at)}`;
  });
  console.log("   hit-test:", hit);
  await page.evaluate(() => document.querySelector(".beacon-switch")?.click());
  let answered = true;
  try {
    await page.waitForFunction(() => {
      const p = document.querySelector(".beacon-switch");
      return (p && (p.textContent.includes("Douse") || p.classList.contains("lit"))) || !!document.querySelector(".beacon-switch-note");
    }, { timeout: 9000 });
  } catch { answered = false; }
  const afterTap = await measure();
  console.log("   after tap:", JSON.stringify(afterTap));
  ok("a tap on the pill answers — its word changes, it lights, or its note speaks",
    answered && (afterTap.pillText !== beforeTap.pillText || afterTap.pillLit !== beforeTap.pillLit || !!afterTap.note),
    `text ${beforeTap.pillText} -> ${afterTap.pillText}`);
  if (afterTap.pillLit) await page.screenshot({ path: join(PROOF, `${MODE}-lit.png`) });
  if (afterTap.note) {
    ok("the pill's note covers neither deck button, bag nor pill",
      !overlaps(afterTap.note, afterTap.deck) && !overlaps(afterTap.note, afterTap.bag) && !overlaps(afterTap.note, afterTap.pill));
    await page.screenshot({ path: join(PROOF, `${MODE}-note.png`) });
  }
}

await browser.close();
console.log(`\nBEACON-PILL DRIVE (${MODE}): ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
