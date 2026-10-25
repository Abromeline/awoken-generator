// drive-no-cosmic-terrain — THE SPINNING IMAGES COME OFF
// THE TERRAIN MAP ONLY (Nigel, 2026-10-25 15:05: "remove
// those images from the terrain map only but keep the
// meteors").
//
// The spinning cosmic background images (the .cosmic-bg div
// and its two .cosmic-layer children, rendered by
// CosmicBackground in client/src/App.tsx) are NOT rendered
// at all while the terrain map stands open on the tender
// face (showDeck). The main page — and every other screen —
// keeps them exactly as today, spin running. The meteors
// stay: <MeteorRain /> (the .meteor-rain title-sky rain)
// renders in every view, and an unrisen star seed on the map
// still wears its meteor <image> in the territory SVG.
//
// Fixture roads are drive-map-faces' own (claim → wake →
// choose class → land; seeds staged in SQL only where that
// drive stages them): a fresh Tender, the first seed sown
// and guarded through the real actions, then a fallen, a
// held and a corrupted seed laid on far cursed tiles, so the
// rendered map carries unrisen seeds wearing meteors.
// Run after `npm run build`:
//   PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-no-cosmic-terrain.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-no-cosmic-terrain-"));
process.env.PORT = "39988";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39988";
const PW = "no-cosmic-terrain-drive-password";
const PROOF_DIR = "/home/hatch/workspace/no-cosmic-terrain-proof";
mkdirSync(PROOF_DIR, { recursive: true });
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

/* ══ THE WORLD: a fresh Tender, the first seed sown and
   guarded through the real actions (drive-map-faces' roads) ══ */
const claim = await call("claimTender", { password: PW, tenderName: "Cosmic Tender" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
const token = claim.token;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 3, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', total_exp = 3800, hp = 100").run(ownerKey, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 500, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500").run(ownerKey, now);

const insAsset = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
function seedCompany(names) {
  const parts = [["Sky Cloth", "body", 3, 3], ["Sky Cord", "arms", 3, 3], ["Sky Crown", "head", 3, 3]]
    .map(([n, c, p, t]) => ({ id: Number(insAsset.run(n, c, p, t, "sky", `cosmic/${n}.png`, now).lastInsertRowid), name: n, category: c, power: p, toughness: t, element: "sky" }));
  const composition = JSON.stringify(parts.map(p => ({ source_id: `db:${p.id}`, name: p.name, category: p.category, rarity: "common", power: p.power, toughness: p.toughness, element: p.element })));
  const ins = db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', 'Cosmic Tender', ?, ?)");
  return names.map(n => Number(ins.run(n, n, `cosmic/${n}.png`, composition, ownerKey, now).lastInsertRowid));
}
const company = seedCompany(["Cosmic Guard", "Cosmic Second", "Cosmic Third"]);
await call("setChampion", { awakenedId: company[1] }, token);
await call("ensureFirstSeed", {}, token);
const dep = await call("deployFirstSeed", { awakenedIds: [company[0]] }, token);
ok("staging: the guard stands on the first seed's hex", dep.ok === true, JSON.stringify(dep).slice(0, 120));
await call("getTerritory", {}, token);

/* ── Stage the unrisen seeds by hand, as drive-map-faces
   does: one fallen, one held, one corrupted with its siege
   guard standing — on far cursed tiles. These are the
   seeds that wear a meteor <image> on the rendered map. ── */
const firstSeed = db.prepare("SELECT tile_id FROM star_seeds WHERE owner_key = ? AND state = 'first'").get(ownerKey);
const tiles = db.prepare("SELECT id, q, r, cursed FROM territory_tiles WHERE owner_key = ?").all(ownerKey);
const firstTile = tiles.find(t => t.id === firstSeed.tile_id);
const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
const far = tiles.filter(t => t.cursed && t.id !== firstSeed.tile_id && dist(t, firstTile) >= 4)
  .sort((a, b) => dist(b, firstTile) - dist(a, firstTile));
const [fallenTile, heldTile, corruptedTile] = [far[0], far[Math.floor(far.length / 2)], far[far.length - 1]];
const insSeed = db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, defenses, fed_energy, created_at) VALUES (?, ?, 1, ?, ?, ?, ?)");
insSeed.run(ownerKey, fallenTile.id, "fallen", 0, 0, now);
insSeed.run(ownerKey, heldTile.id, "held", 2, 5, now);
insSeed.run(ownerKey, corruptedTile.id, "corrupted", 0, 0, now);
const colId = Number(db.prepare("INSERT INTO incursion_columns (owner_key, target_tile_id, target_kind, kind, size, power, state, origin_q, origin_r, spawned_at, arrives_at) VALUES (?, ?, 'hex', 'siege', 1, 1, 'arrived', 0, 0, ?, ?)")
  .run(ownerKey, corruptedTile.id, now, now).lastInsertRowid);
db.prepare("INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, column_id) VALUES (?, ?, 'fray', ?, ?)").run(ownerKey, corruptedTile.id, now, colId);
console.log(`  staged: fallen@tile ${fallenTile.id}, held@tile ${heldTile.id}, corrupted@tile ${corruptedTile.id} (guard column ${colId})`);

/* ══ OPEN THE MAIN PAGE ════════════════════════════════ */
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:no-cosmic-terrain]", String(e).slice(0, 200)));
await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);

await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector(".deck-button", { timeout: 30000 });
await sleep(2000);

const cosmicSample = () => page.evaluate(() => {
  const bg = document.querySelector(".cosmic-bg");
  const layer = document.querySelector(".cosmic-bg .cosmic-layer");
  const cs = layer ? getComputedStyle(layer) : null;
  return {
    bgPresent: !!bg,
    layerCount: bg ? bg.querySelectorAll(":scope > .cosmic-layer").length : 0,
    allLayerCount: document.querySelectorAll(".cosmic-layer").length,
    animationName: cs ? cs.animationName : "",
    transform: cs ? cs.transform : "",
    meteorRainPresent: !!document.querySelector(".meteor-rain"),
    deckLabel: document.querySelector(".deck-button span")?.textContent?.trim() ?? "",
  };
});

console.log("§MAIN PAGE the spinning images stand, and the spin is running");
const main1 = await cosmicSample();
ok("main page: .cosmic-bg exists", main1.bgPresent, JSON.stringify(main1));
ok("main page: .cosmic-bg holds exactly 2 .cosmic-layer children",
  main1.layerCount === 2, `layers=${main1.layerCount} all=${main1.allLayerCount}`);
ok("main page: a layer's computed animation-name includes cosmic-rotate (the spin is named on it)",
  main1.animationName.includes("cosmic-rotate"), `animationName=${main1.animationName}`);
await sleep(2000);
const main2 = await cosmicSample();
ok("main page: a layer's computed transform differs between two samples ~2s apart (the spin is actually turning)",
  !!main1.transform && !!main2.transform && main1.transform !== main2.transform,
  `t1=${main1.transform} t2=${main2.transform}`);
ok("main page: the header deck button reads 'Terrain Map'",
  main1.deckLabel === "Terrain Map", `label=${main1.deckLabel}`);
await page.screenshot({ path: join(PROOF_DIR, "main-page.png") });
console.log(`  screenshot: ${join(PROOF_DIR, "main-page.png")}`);

/* ══ OPEN THE TERRAIN MAP ══════════════════════════════ */
const door = await page.$(".deck-button");
if (!door) throw new Error("terrain: no .deck-button on the home face");
await door.click();
await page.waitForSelector(".territory-view", { timeout: 30000 });
await page.waitForFunction(() => !!window.__tenderJump && !!window.__tenderJump.pos(), { timeout: 30000 });
/* Clear the ceremony / return-report overlays — in a loop,
   because dismissing one card can raise the next, and a
   standing .return-report-overlay (fixed, inset 0, z-90)
   swallows every click under it, RETURN included. Both
   cards ride that one overlay: the return report ("Upon
   your return, an Awokin speaks…", .return-report) and the
   first-seed ceremony (.return-report.ceremony-card); each
   carries its own "Tend on" button, and the overlay itself
   also dismisses on click. The Skip road is drive-map-faces'
   own, kept for the card that wears it. */
async function clearCeremony() {
  for (let i = 0; i < 6; i++) {
    const clicked = await page.evaluate(() => {
      const tend = [...document.querySelectorAll(".return-report-overlay button")].find((b) => b.textContent.trim() === "Tend on");
      if (tend) { tend.click(); return "tend"; }
      const overlay = document.querySelector(".return-report-overlay");
      if (overlay) { overlay.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); return "overlay"; }
      const skip = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Skip");
      if (skip) { skip.click(); return "skip"; }
      return "";
    });
    if (!clicked) break;
    await sleep(900);
  }
}
await clearCeremony();
await sleep(1500);

const terrain = await page.evaluate(() => ({
  cosmicBgIsNull: document.querySelector(".cosmic-bg") === null,
  cosmicBgPresent: !!document.querySelector(".cosmic-bg"),
  cosmicLayerCount: document.querySelectorAll(".cosmic-layer").length,
  meteorRainPresent: !!document.querySelector(".meteor-rain"),
  territoryViewPresent: !!document.querySelector(".territory-view"),
  tilePolygons: document.querySelectorAll(".territory-svg polygon").length,
  meteorImages: [...document.querySelectorAll(".territory-svg image")]
    .filter(im => (im.getAttribute("href") || "").includes("meteor")).length,
  deckLabel: document.querySelector(".deck-button span")?.textContent?.trim() ?? "",
}));
console.log("  terrain rendered:", JSON.stringify(terrain));

console.log("§TERRAIN MAP the images are gone from the DOM; the meteors stay; the map is whole");
ok("terrain map: .territory-view stands (the map is open)",
  terrain.territoryViewPresent, JSON.stringify(terrain));
ok("terrain map: document.querySelector('.cosmic-bg') === null (the image div is gone, not hidden)",
  terrain.cosmicBgIsNull && !terrain.cosmicBgPresent, `present=${terrain.cosmicBgPresent}`);
ok("terrain map: no .cosmic-layer anywhere in the DOM",
  terrain.cosmicLayerCount === 0, `layers=${terrain.cosmicLayerCount}`);
ok("terrain map: .meteor-rain is still present in the DOM (the meteors are kept)",
  terrain.meteorRainPresent, `meteorRain=${terrain.meteorRainPresent}`);
ok("terrain map: at least one territory tile renders (the map is whole, not blank)",
  terrain.tilePolygons >= 1, `tilePolygons=${terrain.tilePolygons}`);
ok("terrain map: an unrisen seed still wears its meteor <image> in the territory SVG (the fixture sows first/fallen/held/corrupted seeds)",
  terrain.meteorImages >= 1, `meteorImages=${terrain.meteorImages}`);
ok("terrain map: the header deck button reads 'RETURN'",
  terrain.deckLabel === "RETURN", `label=${terrain.deckLabel}`);
await page.screenshot({ path: join(PROOF_DIR, "terrain-map.png") });
console.log(`  screenshot: ${join(PROOF_DIR, "terrain-map.png")}`);

/* ══ RETURN — THE IMAGES COME BACK ═════════════════════ */
await clearCeremony();
const back = await page.$(".deck-button");
if (!back) throw new Error("return: no .deck-button on the terrain face");
await back.click();
await page.waitForFunction(() => !!document.querySelector(".cosmic-bg"), { timeout: 30000 });
await sleep(800);
const home = await cosmicSample();
console.log("§RETURN the spinning images are back");
ok("return: .cosmic-bg is back", home.bgPresent, JSON.stringify(home));
ok("return: .cosmic-bg holds its 2 .cosmic-layer children again",
  home.layerCount === 2, `layers=${home.layerCount} all=${home.allLayerCount}`);
ok("return: .territory-view is gone (the map is closed)",
  await page.evaluate(() => !document.querySelector(".territory-view")), "");

await browser.close();
console.log(`\ndrive-no-cosmic-terrain: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
