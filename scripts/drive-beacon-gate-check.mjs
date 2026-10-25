// drive-beacon-gate-check — THE BEACON GATE MUST CHECK
// FOR A REAL BEACON (Nigel, 2026-10-25 19:44: "it need
// to actually check if a player has a beacon before
// telling me i cant take my land to the disc. i have two
// beacons").
//
// The fault this build cures: the main page's Beacon
// button gate (and its face) read ONLY the first-seed
// EVENT's reported seedLevel — never the Tender's actual
// seeds. A Tender whose beacons stand (a later seed grown
// to Beacon, two of them) was told "You must light the
// beacon first!" and shown the meteor face. The gate now
// reads the server's hasBeacon, carried on the
// getFirstSeedEvent payload and reckoned from star_seeds
// by the standing test the battle settle already reads
// for a Beacon's protection: level >= 3 with state
// fallen, held or first. Fetched and corrupted seeds do
// not stand and do not count.
//
//   §S THE SEAMS: the gate in App.tsx reads hasBeacon;
//      the server reckons it from star_seeds with the
//      standing states; the 16:11 gate words stand word
//      for word.
//   §A NIGEL'S CASE: the first-seed event reports level 1,
//      but TWO further seeds stand at level 3 (held +
//      fallen) → hasBeacon true; in a real browser the
//      button wears the Beacon art and its click opens
//      the choice panel — no refusal. And with the event
//      row gone entirely, the read still answers
//      hasBeacon true beside event: null.
//   §B THE TRULY BEACON-LESS: a fresh Tender's first seed
//      at level 1 and nothing else standing → hasBeacon
//      false; in the browser the button wears the meteor
//      and its click speaks the gate's exact words.
//   §C FETCHED AND CORRUPTED DO NOT COUNT: level-3 seeds
//      in state fetched and corrupted only → hasBeacon
//      false.
//   §D THE EVENT FLOW UNDISTURBED: the payload still
//      carries the event whole (seed, level, state,
//      defenders) for the first-seed panel's own reads.
// Run after `npm run build`:
//   PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-beacon-gate-check.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-beacon-gate-"));
process.env.PORT = "39677";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39677";
const PW = "beacon-gate-drive-password";
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

async function makeTender(name) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 3, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', total_exp = 3800, hp = 100").run(ownerKey, now);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 500, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500").run(ownerKey, now);
  await call("ensureFirstSeed", {}, claim.token);
  return { token: claim.token, ownerKey };
}

function sowSeed(ownerKey, level, state) {
  const tile = db.prepare("SELECT id FROM territory_tiles WHERE owner_key = ? ORDER BY id LIMIT 1 OFFSET ?")
    .get(ownerKey, Math.floor(Math.random() * 5));
  const anyTile = tile ?? db.prepare("SELECT id FROM territory_tiles WHERE owner_key = ? ORDER BY id LIMIT 1").get(ownerKey);
  return Number(db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(ownerKey, anyTile.id, level, state, now).lastInsertRowid);
}

/* ── §S THE SEAMS IN THE SOURCES ──────────────────────── */
console.log("§S the seams — the gate reads hasBeacon; the words stand");
{
  const app = readFileSync(join(process.cwd(), "client/src/App.tsx"), "utf8");
  const actions = readFileSync(join(process.cwd(), "server/src/actions.ts"), "utf8");
  ok("§S the client gate reads the server's hasBeacon fact",
    app.includes("const firstBeaconLit = !!firstSeedQ.data?.hasBeacon;"));
  ok("§S the client gate no longer reads the first-seed event's level",
    !app.includes("firstSeedEv.seedLevel >= 3"));
  ok("§S the server reckons hasBeacon from star_seeds by the standing test (level >= 3, fallen/held/first)",
    actions.includes("level >= 3 AND state IN ('fallen','held','first')") && actions.includes("const hasBeacon"));
  ok("§S the 16:11 gate words stand word for word",
    app.includes("You must light the beacon first! Wake the Awokin, go to the cursed lands!"));
}

/* ── §A NIGEL'S CASE — TWO BEACONS STAND, THE EVENT SAYS 1 ── */
console.log("§A a Tender with two standing Beacons and a level-1 first-seed event");
const a = await makeTender("Two Beacons Tender");
sowSeed(a.ownerKey, 3, "held");
sowSeed(a.ownerKey, 3, "fallen");
{
  const r = await call("getFirstSeedEvent", {}, a.token);
  ok("§A the first-seed event still reports its own level (1)", r.event?.seedLevel === 1, JSON.stringify(r).slice(0, 160));
  ok("§A hasBeacon is TRUE — her standing Beacons are seen", r.hasBeacon === true, JSON.stringify(r).slice(0, 160));
  ok("§D the event payload stands whole beside the fact (seed, state, defenders)",
    !!r.event && typeof r.event.seedId === "number" && typeof r.event.state === "string" && Array.isArray(r.event.defenders));
  // The event row gone entirely: the fact must still ride.
  db.prepare("DELETE FROM first_seed_events WHERE owner_key = ?").run(a.ownerKey);
  const r2 = await call("getFirstSeedEvent", {}, a.token);
  ok("§A with no event row left, event is null and hasBeacon still TRUE", r2.event === null && r2.hasBeacon === true, JSON.stringify(r2).slice(0, 160));
}

/* ── §B THE TRULY BEACON-LESS ─────────────────────────── */
console.log("§B a Tender with no Beacon standing");
const b = await makeTender("Beaconless Tender");
{
  const r = await call("getFirstSeedEvent", {}, b.token);
  ok("§B hasBeacon is FALSE — nothing stands at Beacon stage", r.hasBeacon === false, JSON.stringify(r).slice(0, 160));
  ok("§B the first seed event reports level 1 as before", r.event?.seedLevel === 1);
}

/* ── §C FETCHED AND CORRUPTED DO NOT COUNT ────────────── */
console.log("§C fetched and corrupted seeds do not stand");
const c = await makeTender("Fetched Corrupted Tender");
sowSeed(c.ownerKey, 3, "fetched");
sowSeed(c.ownerKey, 3, "corrupted");
{
  const r = await call("getFirstSeedEvent", {}, c.token);
  ok("§C hasBeacon is FALSE — fetched and corrupted seeds do not count", r.hasBeacon === false, JSON.stringify(r).slice(0, 160));
}

/* ── THE FACE IN A REAL BROWSER ───────────────────────── */
console.log("§A/§B the button's face and doors in a real browser");
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
async function faceAndClick(token) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror:beacon-gate]", String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".beacon-dock", { timeout: 30000 });
  // The face settles once the first-seed read lands: the
  // beacon art names itself, the meteor names itself.
  await page.waitForFunction(() => {
    const img = document.querySelector(".beacon-dock .beacon-dock-face");
    return !!img && (img.getAttribute("src") || "").length > 0;
  }, { timeout: 30000 });
  await sleep(2500);
  const src = await page.$eval(".beacon-dock .beacon-dock-face", (el) => el.getAttribute("src") || "");
  await page.click(".beacon-dock");
  await sleep(1200);
  const choice = await page.$(".beacon-choice-panel");
  const gate = await page.$(".beacon-gate-panel");
  const gateText = gate ? await page.$eval(".beacon-gate-panel", (el) => el.textContent || "") : "";
  const choiceText = choice ? await page.$eval(".beacon-choice-panel", (el) => el.textContent || "") : "";
  await page.close();
  return { src, choice: !!choice, gate: !!gate, gateText, choiceText };
}
{
  const fa = await faceAndClick(a.token);
  ok("§A the button wears the BEACON art, not the meteor", fa.src.includes("beacon") && !fa.src.includes("meteor"), fa.src);
  ok("§A the click opens the choice panel (Open my homeland reachable)", fa.choice && fa.choiceText.includes("Open my homeland"), fa.choiceText.slice(0, 120));
  ok("§A no refusal is spoken", !fa.gate, fa.gateText.slice(0, 120));
}
{
  const fb = await faceAndClick(b.token);
  ok("§B the button wears the METEOR face", fb.src.includes("meteor"), fb.src);
  ok("§B the click speaks the gate's exact words", fb.gate && fb.gateText.includes("You must light the beacon first! Wake the Awokin, go to the cursed lands!"), fb.gateText.slice(0, 160));
  ok("§B the choice panel stays shut", !fb.choice);
}
await browser.close();

console.log(`\ndrive-beacon-gate-check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
