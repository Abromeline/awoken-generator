// HOMELAND SUMMONING — THE NAMES — drive (Nigel, 2026-10-21:
// on the homeland the Awoken tabs "just say an awoken instead
// of the names of each awokin"; he prefers the Table's
// summoning, whose cards carry each creature's name baked in
// by the server). Boots the real server on a scratch DATA_DIR,
// seeds one tender with three named Awokin — Handkin in hand,
// Fieldkin standing on his homeland field, Stagekin staged at
// his bastion — and proves:
//   §A AT THE SOURCE: getTerritory's placement for Fieldkin
//      carries her GIVEN name on the record itself (the join
//      happens once, server-side), and the elsewhere read
//      names Fieldkin (fielded) and Stagekin (staged) with
//      their posts and her dominant element — Handkin, who
//      stands in hand, is named nowhere in it.
//   §B THE CONTROL: a tender with nothing fielded and
//      nothing staged is served no placements and an empty
//      elsewhere — no row can rise for him.
//   §C THE DRIVEN PAGE (the client check, chosen over a bare
//      bundle grep): the real homeland page, driven logged-in
//      as the seeded tender, renders the hand's elsewhere row
//      naming Fieldkin at her field post and Stagekin at the
//      bastion — and the words "An Awokin" appear NOWHERE on
//      the page. (The wheel's labels read the same placement
//      name §A proves; the built client carries no "An
//      Awokin" string at all — checked beside this drive.)
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-homeland-names.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

const OUT = "/home/hatch/workspace/homeland-names-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(OUT, "data-"));
process.env.PORT = "3963";
process.env.WORKSHOP_PASSWORD = "homeland-names-drive";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3963";
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
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
// Fresh-DB migration-order defect (carried by the Audit):
// stand the greeter column up so drizzle selects do not throw.
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }
const now = Date.now();

// ── Seed the tender (the Table summon drive's recipe) ─────
const claim = await call("claimTender", { password: "homeland-names-password", tenderName: "Names Tender" });
const token = claim.token;
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const me = `tender:${tenderId}`;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(me, now);
const bodyId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES ('Names Body', 'body', 'common', 2, 2, 'sky', 'names/body.png', 'image/png', ?)").run(now).lastInsertRowid);
const armsId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES ('Names Arms', 'arms', 'common', 3, 3, 'sky', 'names/arms.png', 'image/png', ?)").run(now).lastInsertRowid);
const headId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES ('Names Head', 'head', 'common', 3, 3, 'sky', 'names/head.png', 'image/png', ?)").run(now).lastInsertRowid);
const compJson = JSON.stringify([
  { source_id: `db:${bodyId}`, name: "Names Body", category: "body", rarity: "common", power: 2, toughness: 2, element: "sky" },
  { source_id: `db:${armsId}`, name: "Names Arms", category: "arms", rarity: "common", power: 3, toughness: 3, element: "sky" },
  { source_id: `db:${headId}`, name: "Names Head", category: "head", rarity: "common", power: 3, toughness: 3, element: "sky" },
]);
const mkAwokin = (name) => Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, 'names/awokin.png', ?, 'tender', 'Names Tender', ?, ?)")
  .run(name, name, compJson, me, now).lastInsertRowid);
const handId = mkAwokin("Handkin");
const fieldId = mkAwokin("Fieldkin");
const stageId = mkAwokin("Stagekin");
void handId; void stageId;
// A settled homeland disc; Fieldkin stands at (1,0).
const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, ?, ?, ?, ?)");
const tileIds = {};
for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) {
  const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
  if (ring > 3) continue;
  tileIds[`${q},${r}`] = Number(insTile.run(me, q, r, ring <= 2 ? 0 : 1, now).lastInsertRowid);
}
db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, hp) VALUES (?, ?, ?, ?, ?, 30)")
  .run(me, fieldId, tileIds["1,0"], now, now);
// Stagekin waits at the bastion.
db.prepare("INSERT INTO bastion_staged (owner_key, awakened_id, staged_at, via) VALUES (?, ?, ?, 'hand')").run(me, stageId, now);
await call("chooseClass", { classKey: "warden" }, token);
console.log("seeded: Names Tender (Lv ~10) — Handkin in hand, Fieldkin on the homeland field, Stagekin staged");

// ═══ §A. The name at the source ═══
const terr = await call("getTerritory", {}, token);
const placements = terr.placements ?? [];
ok("the territory read serves exactly the one fielded placement", placements.length === 1, `placements=${placements.length}`);
const fp = placements.find((p) => p.awakenedId === fieldId);
ok("the placement is Fieldkin's (by her creature id)", !!fp, JSON.stringify(placements.map((p) => p.awakenedId)));
ok("the placement record carries her GIVEN name", fp?.name === "Fieldkin", `name=${JSON.stringify(fp?.name)}`);
const elsewhere = terr.elsewhere ?? [];
ok("the elsewhere read names exactly the two kept back", elsewhere.length === 2, JSON.stringify(elsewhere));
const ewField = elsewhere.find((e) => e.name === "Fieldkin");
const ewStage = elsewhere.find((e) => e.name === "Stagekin");
ok("Fieldkin is named at her post: the homeland field", ewField?.where === "fielded", JSON.stringify(ewField));
ok("Stagekin is named at his post: the bastion", ewStage?.where === "staged", JSON.stringify(ewStage));
ok("the fielded entry wears her dominant element (all-sky parts -> sky)", ewField?.element === "sky", `element=${ewField?.element}`);
ok("Handkin, who stands in hand, is named nowhere in the elsewhere read", !elsewhere.some((e) => e.name === "Handkin"), JSON.stringify(elsewhere.map((e) => e.name)));

// ═══ §B. The control — nothing fielded, nothing staged ═══
const claim2 = await call("claimTender", { password: "homeland-names-password", tenderName: "Quiet Tender" });
const terr2 = await call("getTerritory", {}, claim2.token);
ok("the control tender is served no placements", (terr2.placements ?? []).length === 0, `placements=${(terr2.placements ?? []).length}`);
ok("the control tender's elsewhere read is empty — no row can rise for him", Array.isArray(terr2.elsewhere) && terr2.elsewhere.length === 0, JSON.stringify(terr2.elsewhere));

// ═══ §C. The driven page ═══
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror:homeland]", String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2500);
  const door = await page.$(".deck-button");
  ok("the home face offers the road to the land", !!door);
  await door.click();
  await page.waitForFunction(() => !!document.querySelector(".hand-elsewhere"), { timeout: 30000 }).catch(() => {});
  await sleep(800);
  const rowText = await page.evaluate(() => document.querySelector(".hand-elsewhere")?.textContent ?? "");
  ok("the hand's elsewhere row stands on the homeland page", rowText.length > 0, "no .hand-elsewhere in the DOM");
  ok("the row opens with the Table's words: 'Not in hand — one body stands in one place'",
    rowText.includes("Not in hand") && rowText.includes("one body stands in one place"), rowText.slice(0, 120));
  ok("the row names Fieldkin at her post: 'Fieldkin · 🏠 on your homeland field'",
    rowText.includes("Fieldkin") && rowText.includes("on your homeland field"), rowText.slice(0, 200));
  ok("the row names Stagekin at his post: 'Stagekin · 🏯 staged at your bastion'",
    rowText.includes("Stagekin") && rowText.includes("staged at your bastion"), rowText.slice(0, 200));
  const bodyText = await page.evaluate(() => document.body.textContent ?? "");
  ok("the words 'An Awokin' appear NOWHERE on the homeland page", !bodyText.includes("An Awokin"));
  await page.screenshot({ path: join(OUT, "homeland-elsewhere-row.png") }).catch(() => {});
} finally {
  await browser.close();
}

console.log(`\nDRIVE (homeland summoning — the names): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
