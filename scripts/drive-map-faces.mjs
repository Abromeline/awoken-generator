// drive-map-faces — TWO SMALL FACES OF THE HOMELAND MAP
// (Nigel, 2026-10-25; branch build/map-faces, worktree only).
//
// §CALM (09:42, from his live screenshot: "what i dont want
//   to see are the yellow doted lines"): the seed-calm layer
//   no longer draws its gold dashed hex outlines. The
//   "curse Lv N" labels STAY — he named the lines only.
//   Proven on the rendered map: no polygon anywhere wears
//   the calm gold stroke (#f0d68c — that colour exists in
//   Territory.tsx only on the calm layer), and cursed tiles
//   under a seed's calm still print their "curse Lv N".
//
// §SEEDS (10:35: "stars are still standing in the place
//   where the meteor ui should be for the star seed. that
//   is supposed to be in the faces pass"): an unrisen seed —
//   fallen, held, or corrupted in the dark's violet ring —
//   wears the METEOR (his own meteor-rain asset, the face
//   the first seed already wears), never the ⭐ glyph.
//   Proven on the rendered map: meteor images stand at the
//   first, fallen, held and corrupted seeds; no ⭐ text
//   stands anywhere; the rings and the "held through" /
//   "held by the dark" labels are unchanged.
//
// Staging is by hand in SQL, as the other drives do: the
// first seed is sown and guarded through the real actions;
// a fallen, a held and a corrupted seed are then laid on
// far cursed tiles (the corrupted one with its siege guard
// standing, so the settle keeps it corrupted).
// Run after `npm run build`:
//   PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-map-faces.mjs [calm|seeds|all]
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

const SECTION = process.argv[2] ?? "all";
const wantCalm = SECTION === "all" || SECTION === "calm";
const wantSeeds = SECTION === "all" || SECTION === "seeds";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-map-faces-"));
process.env.PORT = "39987";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39987";
const PW = "map-faces-drive-password";
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
   guarded through the real actions ═════════════════════ */
const claim = await call("claimTender", { password: PW, tenderName: "Faces Tender" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
const token = claim.token;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 3, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', total_exp = 3800, hp = 100").run(ownerKey, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 500, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500").run(ownerKey, now);

const insAsset = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
function seedCompany(names) {
  const parts = [["Sky Cloth", "body", 3, 3], ["Sky Cord", "arms", 3, 3], ["Sky Crown", "head", 3, 3]]
    .map(([n, c, p, t]) => ({ id: Number(insAsset.run(n, c, p, t, "sky", `faces/${n}.png`, now).lastInsertRowid), name: n, category: c, power: p, toughness: t, element: "sky" }));
  const composition = JSON.stringify(parts.map(p => ({ source_id: `db:${p.id}`, name: p.name, category: p.category, rarity: "common", power: p.power, toughness: p.toughness, element: p.element })));
  const ins = db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', 'Faces Tender', ?, ?)");
  return names.map(n => Number(ins.run(n, n, `faces/${n}.png`, composition, ownerKey, now).lastInsertRowid));
}
const company = seedCompany(["Faces Guard", "Faces Second", "Faces Third"]);
await call("setChampion", { awakenedId: company[1] }, token);
await call("ensureFirstSeed", {}, token);
const dep = await call("deployFirstSeed", { awakenedIds: [company[0]] }, token);
ok("staging: the guard stands on the first seed's hex", dep.ok === true, JSON.stringify(dep).slice(0, 120));
await call("getTerritory", {}, token);

/* ── Stage the unrisen seeds by hand: one fallen, one
   held (2 stands, part-fed), one corrupted with its siege
   guard standing — on far cursed tiles, clear of the
   first seed's calm and of each other. ─────────────────── */
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

/* ══ OPEN THE LAND ═════════════════════════════════════ */
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:map-faces]", String(e).slice(0, 200)));
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
await page.evaluate(() => {
  const btn = [...document.querySelectorAll(".ceremony-card button")].find((b) => b.textContent.trim() === "Tend on");
  if (btn) btn.click();
});
await sleep(1500);

const snapshot = () => page.evaluate(() => {
  const texts = [...document.querySelectorAll("text")].map(t => t.textContent ?? "");
  return {
    calmLabels: texts.filter(s => /^curse Lv \d+$/.test(s.trim())).length,
    goldStrokePolygons: [...document.querySelectorAll("polygon")]
      .filter(p => (p.getAttribute("stroke") || "").toLowerCase() === "#f0d68c").length,
    starTexts: texts.filter(s => s.includes("⭐")).length,
    meteorImages: [...document.querySelectorAll("image")]
      .filter(im => (im.getAttribute("href") || "").includes("meteor")).length,
    heldLabel: texts.some(s => s.includes("held through 2 stands")),
    darkLabel: texts.some(s => s.includes("held by the dark")),
    violetRings: [...document.querySelectorAll("circle")]
      .filter(c => (c.getAttribute("stroke") || "").toLowerCase() === "#b04df0").length,
  };
});
const snap = await snapshot();
console.log("  rendered:", JSON.stringify(snap));

if (wantCalm) {
  console.log("§CALM the yellow dotted lines are gone; the curse levels still speak");
  ok("§CALM cursed tiles under a seed's calm still name their reckoned level ('curse Lv N' labels stand)",
    snap.calmLabels >= 1, `labels=${snap.calmLabels}`);
  ok("§CALM no gold dashed hex outline stands on the map (no polygon wears the calm gold stroke)",
    snap.goldStrokePolygons === 0, `polygons=${snap.goldStrokePolygons}`);
}
if (wantSeeds) {
  console.log("§SEEDS the star seed wears the meteor");
  ok("§SEEDS the meteor stands at the first, fallen, held and corrupted seeds (4 meteor images)",
    snap.meteorImages >= 4, `meteors=${snap.meteorImages}`);
  ok("§SEEDS no ⭐ glyph stands anywhere on the map",
    snap.starTexts === 0, `stars=${snap.starTexts}`);
  ok("§SEEDS the held seed keeps its 'held through 2 stands' label",
    snap.heldLabel, `darkLabel=${snap.darkLabel}`);
  ok("§SEEDS the corrupted seed still stands in the dark's violet ring, 'held by the dark'",
    snap.darkLabel && snap.violetRings >= 1, `violetRings=${snap.violetRings} darkLabel=${snap.darkLabel}`);
}

await browser.close();
console.log(`\ndrive-map-faces [${SECTION}]: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
