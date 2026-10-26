// drive-lighthouse-button — THE LIGHTHOUSE PANEL STRUCK; THE
// BEACON SWITCH BESIDE THE TERRAIN/RETURN BUTTON (Nigel,
// 2026-10-26: "notice the lighthoue button is stuck there? .
// we need that to go away. pleasae remove that and just add
// the douse light hte beacon and douse the beacon button
// next tothe terrain/return button.").
//
// Proves in a real browser, against the real server:
//   §S the seams in the sources: the panel struck from
//      Territory.tsx and theme.css whole; the beacon switch
//      and Nigel's dictated labels standing in App.tsx.
//   §A THE MAIN PAGE (the Terrain Map stand): no panel
//      anywhere; the switch stands beside the deck button,
//      reads "Light the beacon"; one tap lights the light
//      through the standing setLighthouse act (the server's
//      own battle read flips), the label turns to "Douse
//      the beacon".
//   §B THE TERRAIN VIEW (the RETURN stand): no panel; the
//      switch beside RETURN, still lit; a tap douses (the
//      server's read flips back); a tap lights again. Rects
//      measured against the corner's neighbours (the bag
//      button, the champion button) — no new covering.
//   §C THE GRIMOIRE OPEN (from the terrain view, the very
//      seat of the stuck-card report): no lighthouse card
//      anywhere over the open book.
//   §D THE REFUSAL IN WORDS: with the bank emptied, a tap
//      on "Light the beacon" answers in the server's own
//      refusal words beside the button, and nothing lights.
//   §E THE NARROW SCREEN: no panel; the switch in view
//      beside the deck button at phone width, its overlaps
//      measured against the corner's standing neighbours.
// Screenshots land in ~/workspace/lighthouse-button-proof/.
// Run after `npm run build`:
//   PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-lighthouse-button.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-beacon-switch-"));
process.env.PORT = "39982";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39982";
const PW = "beacon-switch-drive-password";
const PROOF = join(process.env.HOME, "workspace/lighthouse-button-proof");
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

/* ── §S THE SEAMS IN THE SOURCES ──────────────────────── */
console.log("§S the seams — the panel struck, the switch standing");
{
  const terr = readFileSync(join(process.cwd(), "client/src/Territory.tsx"), "utf8");
  const app = readFileSync(join(process.cwd(), "client/src/App.tsx"), "utf8");
  const css = readFileSync(join(process.cwd(), "client/src/theme.css"), "utf8");
  ok("§S the panel is struck from Territory.tsx whole (no panel class, no panel head, no panel switch left)",
    !terr.includes("lighthouse-panel") && !terr.includes("The Lighthouse</div>") && !terr.includes("Light the lighthouse"));
  ok("§S Territory's dead battle state went with the panel (no battle useState, no setBattle read)",
    !terr.includes("setBattle") && !/const \[battle,/.test(terr));
  ok("§S the panel's CSS is struck from theme.css whole (no .lighthouse-panel rule stands)",
    !css.includes(".lighthouse-panel"));
  ok("§S App.tsx carries the beacon switch on the standing act, wearing Nigel's dictated labels",
    app.includes("beacon-switch") && app.includes("api.setLighthouse") && app.includes("Light the beacon") && app.includes("Douse the beacon"));
  ok("§S the switch's seat stands in the CSS beside the deck button, the lit stand in gold",
    /\.beacon-switch\{\s*position:fixed;right:430px/.test(css) && css.includes(".beacon-switch.lit"));
}

/* ══ THE WORLD: a fresh Tender with banked protection ══ */
const claim = await call("claimTender", { password: PW, tenderName: "Beacon Switch Tender" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
const token = claim.token;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, protection_bank_ms, shadow_matter, lighthouse_lit, wave_intensity, updated_at) VALUES (?, 3800, 3, 'warden', 'sword', 100, 1800000, 10, 0, 3, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', total_exp = 3800, hp = 100, protection_bank_ms = 1800000, shadow_matter = 10, lighthouse_lit = 0, wave_intensity = 3").run(ownerKey, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 500, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500").run(ownerKey, now);
await call("getTerritory", {}, token);
const battle0 = (await call("getTerritory", {}, token)).battle;
ok("the world stands as seeded — banked 30 min, unlit, intensity 3",
  !!battle0 && battle0.lighthouseLit === false && battle0.protectionBankMs >= 1790000, JSON.stringify(battle0));

/* ══ OPEN THE FACE ═════════════════════════════════════ */
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:beacon-switch]", String(e).slice(0, 200)));
await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);

const rects = () => page.evaluate(() => {
  const g = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height };
  };
  return {
    panel: !!document.querySelector(".lighthouse-panel"),
    sw: g(".beacon-switch"),
    deck: g(".deck-button"),
    deckImg: g(".deck-button img"),
    bag: g(".bag-btn"),
    fab: g(".champion-fab"),
    ode: g(".ode-toggle"),
    swText: document.querySelector(".beacon-switch")?.textContent?.trim() ?? null,
    note: document.querySelector(".beacon-switch-note")?.textContent?.trim() ?? null,
  };
});
const overlap = (a, b) => !!a && !!b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

async function enterTerritory() {
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
  await sleep(1200);
  for (let i = 0; i < 3; i++) {
    const stood = await page.evaluate(() => !!document.querySelector(".return-report-overlay:not(:has(.ceremony-card))"));
    if (!stood) break;
    await page.mouse.click(24, 24);
    await sleep(300);
  }
  await page.evaluate(() => {
    const c = [...document.querySelectorAll(".ceremony-card button")].find((b) => b.textContent.trim() === "Tend on");
    if (c) c.click();
    const p = document.querySelector(".admin-popup");
    if (p) p.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await sleep(400);
}

/* ── §A THE MAIN PAGE — THE TERRAIN MAP STAND ─────────── */
console.log("§A the main page — no panel; the switch beside Terrain Map; one tap lights");
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector(".beacon-switch", { timeout: 20000 });
await sleep(800);
const a1 = await rects();
ok("§A no lighthouse panel anywhere on the main page", a1.panel === false);
ok("§A the switch stands in view beside the Terrain Map button (a small gap at its left hand)",
  !!a1.sw && !!a1.deck && a1.sw.left >= 0 && a1.sw.top >= 0 && a1.sw.bottom <= 950
    && (a1.deck.left - a1.sw.right) >= 0 && (a1.deck.left - a1.sw.right) <= 40, JSON.stringify(a1));
ok("§A unlit, the switch reads Nigel's words: Light the beacon",
  !!a1.swText && a1.swText.includes("Light the beacon"), JSON.stringify(a1.swText));
await page.screenshot({ path: join(PROOF, "main-page-unlit.png") });
await page.click(".beacon-switch");
await page.waitForFunction(() => document.querySelector(".beacon-switch")?.textContent?.includes("Douse the beacon"), { timeout: 15000 });
const battleA = (await call("getTerritory", {}, token)).battle;
ok("§A one tap lit the light through the standing act (the server's read flips, intensity reset to 1 under the light)",
  !!battleA && battleA.lighthouseLit === true && battleA.waveIntensity === 1, JSON.stringify(battleA));
const a2 = await rects();
ok("§A lit, the switch reads: Douse the beacon — and the panel is still nowhere",
  !!a2.swText && a2.swText.includes("Douse the beacon") && a2.panel === false, JSON.stringify(a2.swText));

/* ── §B THE TERRAIN VIEW — THE RETURN STAND ───────────── */
console.log("§B the terrain view — no panel; the switch beside RETURN; douse and light by hand");
await enterTerritory();
await page.waitForSelector(".beacon-switch", { timeout: 20000 });
await sleep(600);
const b1 = await rects();
ok("§B no lighthouse panel anywhere in the terrain view", b1.panel === false);
ok("§B the switch stands beside the RETURN button, still reading Douse the beacon",
  !!b1.sw && !!b1.deck && (b1.deck.left - b1.sw.right) >= 0 && (b1.deck.left - b1.sw.right) <= 40
    && !!b1.swText && b1.swText.includes("Douse the beacon"), JSON.stringify(b1));
ok("§B the switch covers none of the corner's standing neighbours (the bag button, the champion button)",
  !overlap(b1.sw, b1.bag) && !overlap(b1.sw, b1.fab), JSON.stringify({ sw: b1.sw, bag: b1.bag, fab: b1.fab }));
await page.screenshot({ path: join(PROOF, "terrain-lit.png") });
await page.click(".beacon-switch");
await page.waitForFunction(() => document.querySelector(".beacon-switch")?.textContent?.includes("Light the beacon"), { timeout: 15000 });
const battleB = (await call("getTerritory", {}, token)).battle;
ok("§B one tap doused the light (the server's read flips back)",
  !!battleB && battleB.lighthouseLit === false, JSON.stringify(battleB));
await page.screenshot({ path: join(PROOF, "terrain-unlit.png") });
await page.click(".beacon-switch");
await page.waitForFunction(() => document.querySelector(".beacon-switch")?.textContent?.includes("Douse the beacon"), { timeout: 15000 });
const battleB2 = (await call("getTerritory", {}, token)).battle;
ok("§B and it lights again by the same hand (the bank still behind it)",
  !!battleB2 && battleB2.lighthouseLit === true, JSON.stringify(battleB2));

/* ── §C THE GRIMOIRE OPEN — NO CARD ANYWHERE ──────────── */
console.log("§C the Grimoire open over the terrain — the stuck card is gone");
await page.evaluate(() => { document.querySelector(".tree-fab")?.click(); });
await sleep(1500);
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Grimoire");
  if (b) b.click();
});
await sleep(1500);
const c1 = await page.evaluate(() => ({
  panel: !!document.querySelector(".lighthouse-panel"),
  book: !!document.querySelector(".book"),
}));
ok("§C with the Grimoire open there is no lighthouse card anywhere on the screen",
  c1.panel === false && c1.book === true, JSON.stringify(c1));
await page.screenshot({ path: join(PROOF, "grimoire-open.png") });
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.getAttribute("aria-label")?.includes("Close") || x.textContent.trim() === "✕");
  if (b) b.click();
});
await sleep(600);

/* ── §D THE REFUSAL IN WORDS ──────────────────────────── */
console.log("§D the bank emptied — the refusal comes back in the server's words");
await enterTerritory(); // a clean stand (the zodiac overlay's closing is not this drive's subject); the light's state is the server's
await page.waitForSelector(".beacon-switch", { timeout: 20000 });
await sleep(600);
await page.click(".beacon-switch"); // douse first
await page.waitForFunction(() => document.querySelector(".beacon-switch")?.textContent?.includes("Light the beacon"), { timeout: 15000 });
db.prepare("UPDATE tender_progress SET protection_bank_ms = 0 WHERE owner_key = ?").run(ownerKey);
await page.click(".beacon-switch");
await page.waitForFunction(() => !!document.querySelector(".beacon-switch-note"), { timeout: 15000 });
await sleep(300);
const d1 = await rects();
const battleD = (await call("getTerritory", {}, token)).battle;
ok("§D the refusal stands beside the button in the server's own words, and nothing lit",
  !!d1.note && d1.note.includes("stands dark for want of banked protection")
    && !!d1.swText && d1.swText.includes("Light the beacon")
    && !!battleD && battleD.lighthouseLit === false,
  JSON.stringify({ note: d1.note, battle: battleD }));

/* ── §E THE NARROW SCREEN ─────────────────────────────── */
console.log("§E the narrow screen — no panel; the switch beside the deck button, overlaps measured");
await page.setViewport({ width: 500, height: 800, deviceScaleFactor: 1 });
await enterTerritory();
await page.waitForSelector(".beacon-switch", { timeout: 20000 });
await sleep(600);
const e1 = await rects();
console.log("  rects@500x800:", JSON.stringify(e1));
ok("§E no lighthouse panel at phone width", e1.panel === false);
ok("§E the switch stands in view at the deck MARK's left hand (the label-wide phone box and the spoken-for foot leave no other honest seat): a short gap from the mark, their centres on one line",
  !!e1.sw && !!e1.deckImg && e1.sw.left >= 0 && e1.sw.top >= 0 && e1.sw.right <= 500 && e1.sw.bottom <= 800
    && (e1.deckImg.left - e1.sw.right) >= 0 && (e1.deckImg.left - e1.sw.right) <= 64
    && Math.abs((e1.sw.top + e1.sw.bottom) / 2 - (e1.deckImg.top + e1.deckImg.bottom) / 2) <= 24, JSON.stringify(e1));
ok("§E the switch covers none of the corner's standing neighbours at phone width (the deck mark, the bag button, the champion button, the music bar)",
  !overlap(e1.sw, e1.deckImg) && !overlap(e1.sw, e1.bag) && !overlap(e1.sw, e1.fab) && !overlap(e1.sw, e1.ode),
  JSON.stringify({ sw: e1.sw, img: e1.deckImg, bag: e1.bag, fab: e1.fab, ode: e1.ode }));
const eHit = await page.evaluate(() => {
  const hit = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return at ? (at.closest(".beacon-switch") ? "switch" : (at.closest(".deck-button") ? "deck" : (at.closest(".ode-toggle") ? "ode" : "other"))) : null;
  };
  return { atDeckMark: hit(document.querySelector(".deck-button img")), atSwitch: hit(document.querySelector(".beacon-switch")) };
});
ok("§E hit-tests: the deck mark's centre answers for the deck button, and the switch's own centre answers for the switch (neither sits on the other, nor under the music bar)",
  eHit.atDeckMark === "deck" && eHit.atSwitch === "switch", JSON.stringify(eHit));
await page.screenshot({ path: join(PROOF, "terrain-narrow.png") });

await browser.close();
console.log(`\ndrive-lighthouse-button: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
