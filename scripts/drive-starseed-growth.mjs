// drive-starseed-growth — THE STARSEED GROWTH CYCLE'S FACE
// (Nigel, 2026-10-24, ratified 19:21; built 2026-10-25).
// The server half of the cycle is proven by
// drive-first-seed-risings (§H feeding, §I starfall, §J the
// return law). This drive proves the cycle's FACE on the
// real map in a real browser:
//   §S the seams in the sources: the ceremony's seat and
//      its done-gate, the Beacon's ruled height in the seed
//      layer, the lighthouse panel struck from the CSS
//      (restated 2026-10-26, the lighthouse-button build).
//   §A THE CEREMONY: a fresh Tender entering the terrain
//      with the first seed's hold unfinished is served the
//      short story once — its words name the Awokin the
//      only beings who can raise a starseed, and the first
//      beacon becoming the lighthouse. Dismissed, it is
//      remembered (the registry carries it) and never
//      served again on re-entry.
//   §B THE GROWTH-LESSONS + THE STAGE FACES: the seedfeed
//      lesson speaks when a defender stands at the seed;
//      the Sapling lesson speaks at the first served
//      Sapling, the Beacon lesson at the first served
//      Beacon; the map's seed wears the falling star as a
//      Starseed, Nigel's Sapling art at the Sapling (at the
//      Tender figure's height — the stand-in measure), and
//      his Beacon art at the Beacon, standing TWICE the
//      Tender figure's height on screen.
//   §C THE LIGHTHOUSE PANEL, STRUCK (restated 2026-10-26,
//      the lighthouse-button build; Nigel, 2026-10-26:
//      "notice the lighthoue button is stuck there? . we
//      need that to go away."): the panel renders NOWHERE,
//      and the light's one switch — the beacon switch —
//      stands in view beside the Terrain/Return button, on
//      wide and narrow screens alike. (This section once
//      proved the panel's seat beside the Champions Hall
//      tab under the 2026-10-25 move-into-view ruling; the
//      2026-10-26 ruling struck the panel whole.)
// The stage changes are wound by hand in SQL (level writes)
// — the feeding that earns them is drive-first-seed-risings
// §H's proof; here the FACE answers the served stage.
// Run after `npm run build`:
//   PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-starseed-growth.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-growth-"));
process.env.PORT = "39981";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39981";
const PW = "growth-drive-password";
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
console.log("§S the seams — the ceremony's seat, the Beacon's height, the panel struck");
{
  const terr = readFileSync(join(process.cwd(), "client/src/Territory.tsx"), "utf8");
  const css = readFileSync(join(process.cwd(), "client/src/theme.css"), "utf8");
  ok("§S the ceremony is served at the first seed's claim seat, gated on the hold unfinished (a done hold never sees it)",
    terr.includes('ceremonyChecked.current = true') && terr.includes('if (firstSeedEv.state === "done") return;') && terr.includes('r.seen.includes("ceremony")'));
  ok("§S the ceremony's dismissal is remembered under its own registry key",
    terr.includes('api.markFrontLesson({ lessonKey: "ceremony" })'));
  ok("§S the Beacon stands at twice the Tender figure in the seed layer (124 to the figure's 62), the Sapling at the figure's height (the stand-in)",
    terr.includes('const figH = stage === "sapling" ? 62 : 124'));
  ok("§S the stage faces bind Nigel's delivered art (sapling + beacon assets)",
    terr.includes('from "./assets/starseed/sapling.png"') && terr.includes('from "./assets/starseed/beacon.png"'));
  ok("§S (restated 2026-10-26, the lighthouse-button build) the lighthouse panel's CSS seat is struck whole — no .lighthouse-panel rule stands anywhere in the sheet",
    !css.includes(".lighthouse-panel"));
  ok("§S (restated 2026-10-26) the beacon switch's seat stands in the CSS beside the deck button (fixed at its left hand), its lit stand wearing gold",
    /\.beacon-switch\{\s*position:fixed;right:430px/.test(css) && css.includes(".beacon-switch.lit"));
}

/* ══ THE WORLD: a fresh Tender, the first seed sown, a
   guard standing on its hex ═══════════════════════════ */
const claim = await call("claimTender", { password: PW, tenderName: "Growth Tender" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
const token = claim.token;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 3, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', total_exp = 3800, hp = 100").run(ownerKey, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 500, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500").run(ownerKey, now);

const insAsset = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
function seedCompany(names) {
  const parts = [["Sky Cloth", "body", 3, 3], ["Sky Cord", "arms", 3, 3], ["Sky Crown", "head", 3, 3]]
    .map(([n, c, p, t]) => ({ id: Number(insAsset.run(n, c, p, t, "sky", `growth/${n}.png`, now).lastInsertRowid), name: n, category: c, power: p, toughness: t, element: "sky" }));
  const composition = JSON.stringify(parts.map(p => ({ source_id: `db:${p.id}`, name: p.name, category: p.category, rarity: "common", power: p.power, toughness: p.toughness, element: p.element })));
  const ins = db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', 'Growth Tender', ?, ?)");
  return names.map(n => Number(ins.run(n, n, `growth/${n}.png`, composition, ownerKey, now).lastInsertRowid));
}
const company = seedCompany(["Growth Guard", "Growth Second", "Growth Third"]);
// A champion is named through the real action: until one
// stands, the champion-picker button shares the Hall
// toggle's exact seat and covers it (both wear
// .champion-fab's fixed seat) — with a champion named,
// the picker leaves and the Hall toggle is the hand's.
await call("setChampion", { awakenedId: company[1] }, token);
await call("ensureFirstSeed", {}, token);
const dep = await call("deployFirstSeed", { awakenedIds: [company[0]] }, token);
ok("the guard stands on the first seed's hex (the draw's first witness)", dep.ok === true, JSON.stringify(dep).slice(0, 120));
await call("getTerritory", {}, token);
db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ? WHERE owner_key = ?").run(Date.now(), ownerKey);

/* ══ OPEN THE LAND ═════════════════════════════════════ */
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:growth]", String(e).slice(0, 200)));
await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);

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
}
async function clearReturnReports() {
  for (let i = 0; i < 3; i++) {
    const stood = await page.evaluate(() => {
      const el = document.querySelector(".return-report-overlay:not(:has(.ceremony-card))");
      return !!el;
    });
    if (!stood) break;
    await page.mouse.click(24, 24);
    await sleep(300);
  }
  await page.evaluate(() => {
    const p = document.querySelector(".admin-popup");
    if (p) p.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await sleep(300);
}
const lessonNow = () => page.evaluate(() => {
  const p = document.querySelector("p[data-homeland-lesson]");
  return p ? { key: p.getAttribute("data-homeland-lesson"), text: p.textContent } : null;
});
async function dismissLesson() {
  await page.evaluate(() => { document.querySelector(".margin-guide-dismiss")?.click(); });
  await sleep(450);
}
async function lessonThrough(keyWanted, max = 10) {
  for (let i = 0; i < max; i++) {
    const l = await lessonNow();
    if (!l) return null;
    if (l.key === keyWanted) return l;
    await dismissLesson();
  }
  return null;
}
const seedImages = () => page.evaluate(() =>
  [...document.querySelectorAll("image")].map((im) => ({ href: im.getAttribute("href") || "", rect: (() => { const r = im.getBoundingClientRect(); return { w: r.width, h: r.height }; })() })));
const tenderHeight = async () => {
  const imgs = await page.evaluate(() =>
    [...document.querySelectorAll("image")].map((im) => ({ href: im.getAttribute("href") || "", h: im.getBoundingClientRect().height })));
  const t = imgs.find((i) => i.href.includes("warden-"));
  return t ? t.h : 0;
};

/* ── §A THE CEREMONY ──────────────────────────────────── */
console.log("§A the ceremony — served once at the claim, remembered, never again");
await enterTerritory();
const ceremony = await page.evaluate(() => {
  const card = document.querySelector(".ceremony-card");
  return card ? card.textContent : null;
});
ok("§A the ceremony card stands on the first entry, telling the first seed's story",
  !!ceremony && ceremony.includes("The star fell before there were names for falling"), (ceremony ?? "none").slice(0, 120));
ok("§A its words name the Awokin the only beings who can raise a starseed, and the first beacon becoming the lighthouse",
  !!ceremony && ceremony.includes("the only beings in all the world") && ceremony.includes("it becomes your lighthouse"), (ceremony ?? "none").slice(0, 200));
await page.evaluate(() => {
  const btn = [...document.querySelectorAll(".ceremony-card button")].find((b) => b.textContent.trim() === "Tend on");
  if (btn) btn.click();
});
await sleep(600);
const ceremonyGone = await page.evaluate(() => !document.querySelector(".ceremony-card"));
const ceremonySeen = db.prepare("SELECT lesson_key FROM front_lessons_seen WHERE owner_key = ? AND lesson_key = 'ceremony'").get(ownerKey);
ok("§A dismissed by its own button, and the registry remembers it", ceremonyGone && !!ceremonySeen, `gone=${ceremonyGone} seen=${JSON.stringify(ceremonySeen)}`);
await clearReturnReports();

/* ── §B THE GROWTH-LESSONS + THE STAGE FACES ──────────── */
console.log("§B the growth-lessons speak at their triggers; the seed wears its stages");
const feedLesson = await lessonThrough("seedfeed");
ok("§B the seedfeed lesson speaks with a defender standing at the seed (the draw, in its own words)",
  !!feedLesson && feedLesson.text.includes("drinks from your purse"), JSON.stringify(feedLesson));
if (feedLesson) await dismissLesson();
const imgs0 = await seedImages();
ok("§B as a Starseed the first seed wears its standing face — the falling star",
  imgs0.some((i) => i.href.includes("meteor")), imgs0.map((i) => i.href.split("/").pop()).join(",").slice(0, 200));

// THE SAPLING (the level wound by hand — feeding's proof is §H)
db.prepare("UPDATE star_seeds SET level = 2 WHERE owner_key = ? AND state = 'first'").run(ownerKey);
await enterTerritory();
await clearReturnReports();
const ceremonyAgain = await page.evaluate(() => !!document.querySelector(".ceremony-card"));
ok("§A (re-entry) the ceremony is NOT served twice", !ceremonyAgain);
const sapLesson = await lessonThrough("seedsapling");
ok("§B the Sapling lesson speaks at the first served Sapling (the widening light)",
  !!sapLesson && sapLesson.text.includes("Sapling of Light"), JSON.stringify(sapLesson));
if (sapLesson) await dismissLesson();
const imgs1 = await seedImages();
const saplingImg = imgs1.find((i) => i.href.includes("sapling"));
const tH1 = await tenderHeight();
ok("§B the Sapling wears Nigel's Sapling art on the map", !!saplingImg, imgs1.map((i) => i.href.split("/").pop()).join(",").slice(0, 200));
ok("§B the Sapling stands at the Tender figure's height (the stand-in measure, ±15%)",
  !!saplingImg && tH1 > 0 && Math.abs(saplingImg.rect.h - tH1) / tH1 <= 0.15, `sapling=${saplingImg?.rect.h} tender=${tH1}`);

// THE BEACON
db.prepare("UPDATE star_seeds SET level = 3 WHERE owner_key = ? AND state = 'first'").run(ownerKey);
await enterTerritory();
await clearReturnReports();
const beaLesson = await lessonThrough("seedbeacon");
ok("§B the Beacon lesson speaks in the moment PROTECTION arrives",
  !!beaLesson && beaLesson.text.includes("protection is yours to light"), JSON.stringify(beaLesson));
if (beaLesson) await dismissLesson();
const imgs2 = await seedImages();
const beaconImg = imgs2.find((i) => i.href.includes("beacon"));
const tH2 = await tenderHeight();
ok("§B the Beacon wears Nigel's Beacon art on the map", !!beaconImg, imgs2.map((i) => i.href.split("/").pop()).join(",").slice(0, 200));
ok("§B THE BEACON STANDS TWICE THE TENDER'S HEIGHT (the ruled measure, ±15%)",
  !!beaconImg && tH2 > 0 && Math.abs(beaconImg.rect.h - 2 * tH2) / (2 * tH2) <= 0.15, `beacon=${beaconImg?.rect.h} tender=${tH2}`);
const beaconLabel = await page.evaluate(() =>
  [...document.querySelectorAll("text")].some((t) => t.textContent.trim() === "Beacon"));
ok("§B the Beacon's stage name stands beneath its art", beaconLabel);

/* ── §C THE LIGHTHOUSE PANEL, STRUCK (restated 2026-10-26) ── */
console.log("§C the lighthouse panel — struck; the beacon switch beside the terrain button");
const seat = await page.evaluate(() => {
  const p = document.querySelector(".lighthouse-panel");
  const s = document.querySelector(".beacon-switch")?.getBoundingClientRect();
  const d = document.querySelector(".deck-button")?.getBoundingClientRect();
  return {
    panel: !!p,
    sw: s ? { left: s.left, right: s.right, top: s.top, bottom: s.bottom } : null,
    deck: d ? { left: d.left, right: d.right, top: d.top, bottom: d.bottom } : null,
  };
});
ok("§C (restated 2026-10-26) the lighthouse panel renders NOWHERE on the homeland",
  seat.panel === false, JSON.stringify(seat));
ok("§C (restated 2026-10-26) the beacon switch stands in view at the RETURN button's left hand (a small gap, both inside the viewport)",
  !!seat.sw && !!seat.deck && seat.sw.left >= 0 && seat.sw.top >= 0 && seat.sw.right <= 1400 && seat.sw.bottom <= 950
    && (seat.deck.left - seat.sw.right) >= 0 && (seat.deck.left - seat.sw.right) <= 40, JSON.stringify(seat));
// Narrow: the panel stays nowhere and the switch stands beside the deck button still.
await page.setViewport({ width: 500, height: 800, deviceScaleFactor: 1 });
await enterTerritory();
await clearReturnReports();
const narrow = await page.evaluate(() => {
  const p = document.querySelector(".lighthouse-panel");
  const s = document.querySelector(".beacon-switch")?.getBoundingClientRect();
  const d = document.querySelector(".deck-button img")?.getBoundingClientRect();
  return {
    panel: !!p,
    sw: s ? { left: s.left, right: s.right, top: s.top, bottom: s.bottom } : null,
    img: d ? { left: d.left, right: d.right, top: d.top, bottom: d.bottom } : null,
  };
});
ok("§C (restated 2026-10-26) on a narrow screen the panel is still nowhere and the beacon switch stands in view at the deck mark's left hand, covering none of it",
  !narrow.panel && !!narrow.sw && !!narrow.img && narrow.sw.left >= 0 && narrow.sw.top >= 0 && narrow.sw.right <= 500 && narrow.sw.bottom <= 800
    && (narrow.img.left - narrow.sw.right) >= 0 && (narrow.img.left - narrow.sw.right) <= 64
    && !(narrow.sw.left < narrow.img.right && narrow.img.left < narrow.sw.right && narrow.sw.top < narrow.img.bottom && narrow.img.top < narrow.sw.bottom),
  JSON.stringify(narrow));

await browser.close();
console.log(`\ndrive-starseed-growth: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
