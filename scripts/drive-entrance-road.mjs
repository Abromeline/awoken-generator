// drive-entrance-road — ENTRANCE BUILD 2: THE AWARD ROAD +
// THE PLAY-ALONG (homeland). Nigel's build word 2026-11-01
// ("Build the entrance now"); the design: five-minute-
// entrance-spec-2026-10-31.md + the RULINGS of 2026-11-01.
//
//   §S SOURCE SEAMS: the road's two tables stand in schema +
//      DDL; the witnesses stand at the standing actions'
//      chokepoints; the room refusal and the old-order
//      supersede stand in index.ts; the panel stands in App.
//   §A THE ROAD, LIVED (API): an entrance account walks all
//      four sections — pay lands ONLY after the verified
//      acts: §1 pays at the seventh door, not the sixth;
//      §2 pays only with orders to all three AND a battle
//      fought (the battle, and §3's doused fight, arrive via
//      the standing cradle — the drive ages the wanderer
//      anchor exactly as drive-battle does, so the game's
//      own spawn machinery births the dark; nothing is
//      inserted); §3 refuses pay after dousing without
//      fighting, stays incomplete on a relight before
//      fighting, pays only at the relight after the fight;
//      §4 pays on a landed cast of the door's spell.
//      Pool and credits read 0 → +5 per section → 20 total,
//      pool 20 → 0; a double completion pays once (four
//      ledger rows, distinct references); spending a paid
//      credit through Wake One pays wake XP (10 on the road
//      to Lv 3).
//   §B LEGACY: no sections, no pool, no events recorded, the
//      supersede does not touch the legacy seen set.
//   §C THE ROAD IN A REAL BROWSER: the door walked in the
//      UI, the road panel where the player looks, the doors
//      opened by real clicks (fabs, the Pack, Find my Tender,
//      a field figure's wheel), the §1 payout whisper on the
//      map, and the old-order "early" lesson never spoken.
//      Screenshots land in ~/workspace/entrance-road-proof/.
//
// Run after `npm run build`:
//   PUPPETEER_CACHE_DIR=$HOME/workspace/tools-chrome/.cache node scripts/drive-entrance-road.mjs
import { join, dirname } from "node:path";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import sharp from "sharp";

process.env.PUPPETEER_CACHE_DIR = "/home/hatch/workspace/tools-chrome/.cache";
const require2 = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require2("puppeteer");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "/home/hatch/workspace/entrance-road-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-road-"));
process.env.PORT = "39972";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
process.chdir(root);
const BASE = "http://127.0.0.1:39972";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
const errText = (r) => String(r.data?.error ?? r.data?.message ?? "");

/* ── §S SOURCE SEAMS ──────────────────────────────────── */
console.log("\n§S the seams in the sources");
const schemaSrc = readFileSync(join(root, "server/src/schema.ts"), "utf8");
const storeSrc = readFileSync(join(root, "server/src/store.ts"), "utf8");
const roadSrc = readFileSync(join(root, "server/src/entranceRoad.ts"), "utf8");
const actionsSrc = readFileSync(join(root, "server/src/actions.ts"), "utf8");
const indexSrc = readFileSync(join(root, "server/src/index.ts"), "utf8");
const appSrc = readFileSync(join(root, "client/src/App.tsx"), "utf8");
check("the road's tables stand in the schema AND the DDL",
  schemaSrc.includes('sqliteTable("entrance_road_sections"') && schemaSrc.includes('sqliteTable("entrance_road_events"')
  && storeSrc.includes("CREATE TABLE IF NOT EXISTS entrance_road_sections") && storeSrc.includes("CREATE TABLE IF NOT EXISTS entrance_road_events"));
check("the payment is reference-guarded (alreadyCredited) and pool-paired",
  roadSrc.includes("alreadyCredited(reference)") && roadSrc.includes("entrance_award_pool = MAX(0, entrance_award_pool - ?)"));
check("the witnesses stand at the standing chokepoints (switch, orders, the battle write-back, the cast paths)",
  actionsSrc.includes('recordRoadEvent(ownerKey, "lit")') && actionsSrc.includes('recordRoadEvent(ownerKey, "doused")')
  && actionsSrc.includes("recordRoadEvent(actorKeyFor(ctx), \"order\"") && actionsSrc.includes('recordRoadEvent(ownerKey, "battle")')
  && actionsSrc.includes('recordRoadEvent(ownerKey, "cast", spell.key)'));
check("the navigation ping is room-refused, beside the Door's own refusals",
  indexSrc.includes('"entranceNavOpened",'));
check("the old order is superseded for entrance accounts in the lesson routes",
  indexSrc.includes('ENTRANCE_SUPERSEDED_LESSONS = ["choose", "twenty", "early", "warning", "seed"]'));
check("the road panel stands in the pool note's seat on the tender face",
  appSrc.includes("<EntranceRoadPanel />") && appSrc.includes("<EntranceNavWatcher />"));
check("the claiming session's own whisper is guarded too (the front touch turns the old-order keys aside)",
  appSrc.includes('key === "choose" || key === "twenty" || key === "early"'));

/* ── BOOT + FIXTURES ──────────────────────────────────── */
await import("../server/dist/index.js");
await sleep(2500);
const { blobs } = await import("../server/dist/store.js");
const db = new Database(join(process.env.DATA_DIR, "app.db"));

async function api(action, args, token, visitorId) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}), ...(visitorId ? { "x-visitor-id": visitorId } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
async function lessonsGet(token) {
  const res = await fetch(`${BASE}/api/front-lessons`, { headers: { ...(token ? { "x-tender-token": token } : {}) } });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

const pngFor = (r, g, b) => sharp({ create: { width: 750, height: 971, channels: 4, background: { r, g, b, alpha: 1 } } }).png().toBuffer();
const fixtureAssets = [];
{
  const pieces = [
    ["Road Backdrop", "background", null, null, "root", 40, 34, 28],
    ["Road Body", "body", 3, 3, "root", 90, 120, 70],
    ["Road Arms", "arms", 2, 2, "sky", 90, 110, 150],
    ["Road Head", "head", 2, 3, "stone", 150, 120, 80],
  ];
  for (const [name, category, power, toughness, element, r, g, b] of pieces) {
    const key = `road-fixtures/${name}.png`;
    blobs.put(key, await pngFor(r, g, b), "image/png");
    const id = Number(db.prepare(
      "INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)")
      .run(name, category, power, toughness, element, key, Date.now()).lastInsertRowid);
    fixtureAssets.push({ id, name, category, power, toughness });
  }
}
const fixtureRefs = () => fixtureAssets.map((a) => ({ source_id: `db:${a.id}`, name: a.name, category: a.category, rarity: "common", power: a.power, toughness: a.toughness }));
const fixtureImage = async () => (await pngFor(120, 100, 80)).toString("base64");
const trioItems = async () => {
  const img = await fixtureImage();
  return [0, 1, 2].map(() => ({ layers: fixtureRefs(), imageBase64: img }));
};
const tenderIdOf = (claim) => db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.data.tender.code).id;
const seedEnergy = (key) => db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 500, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500").run(key, Date.now());
const ageAnchor = (key, beats = 30) => db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ?, wanderer_settled_beats = 0 WHERE owner_key = ?").run(Date.now() - 45000 * beats, key);
const bankOf = (key) => Number(db.prepare("SELECT protection_bank_ms AS b FROM tender_progress WHERE owner_key = ?").get(key)?.b ?? 0);
const battleEvents = (key) => db.prepare("SELECT COUNT(*) AS n FROM entrance_road_events WHERE owner_key = ? AND kind = 'battle'").get(key).n;
const roadOf = async (token) => (await api("getEntranceRoad", {}, token)).data;
const sectionOf = (road, n) => road.sections.find((s) => s.n === n);

/** Walk one account through the Door (Build 1's road) with
 *  a chosen spell; returns { token, key, trioIds }. */
async function walkDoor(name, spellKey) {
  const claim = await api("claimTender", { password: "road-password-1", tenderName: name, entrance: true });
  const token = claim.data.token;
  const key = `tender:${tenderIdOf(claim)}`;
  await api("entranceChooseClass", { classKey: "witch" }, token);
  await api("entranceChooseSpell", { spellKey }, token);
  await api("chooseWeapon", { weaponKey: "sword" }, token);
  const woke = await api("entranceWakeThree", { items: await trioItems() }, token);
  return { token, key, trioIds: (woke.data.awakened ?? []).map((a) => a.id) };
}

/* ── §A THE ROAD, LIVED ───────────────────────────────── */
console.log("\n§A the road walked in order against the real API");
const acct = await walkDoor("Road Tender", "bats");
const { token, key: roadKey } = acct;
let road = await roadOf(token);
check("after the Door: the road stands open — §1 active, pool 20, 0 spendable, nothing done",
  road.entrance === true && road.begun === true && road.finished === false
  && road.awardPool === 20 && road.spendableCredits === 0
  && road.sections.every((s) => !s.done) && sectionOf(road, 1).active === true,
  JSON.stringify(road).slice(0, 240));

const seenRes = await lessonsGet(token);
check("THE SUPERSEDE: the entrance Tender's served set already holds the old-order lessons (choose, twenty, early, warning, seed) — they can never fire",
  ["choose", "twenty", "early", "warning", "seed"].every((k) => seenRes.data.seen?.includes(k)),
  JSON.stringify(seenRes.data.seen));

/* §1 — the doors */
const bogus = await api("entranceNavOpened", { surface: "dungeon" }, token);
check("§1 a surface that is not one of the road's doors is refused (400)", bogus.status === 400, `status ${bogus.status}`);
for (const surface of ["map", "deck", "zodiac", "aspects", "pack", "find"]) {
  road = (await api("entranceNavOpened", { surface }, token)).data;
}
check("§1 six doors opened: the section stands NOT done and nothing has paid",
  sectionOf(road, 1).done === false && road.spendableCredits === 0 && road.awardPool === 20
  && (sectionOf(road, 1).progress.navOpened ?? []).length === 6,
  JSON.stringify(sectionOf(road, 1)));
road = (await api("entranceNavOpened", { surface: "wheel" }, token)).data;
check("§1 the seventh door completes it — +5 spendable, pool 20 → 15, §2 stands active",
  sectionOf(road, 1).done === true && road.spendableCredits === 5 && road.awardPool === 15 && sectionOf(road, 2).active === true,
  JSON.stringify({ credits: road.spendableCredits, pool: road.awardPool }));
road = await roadOf(token);
check("§1 a re-read pays nothing twice (still 5 spendable, pool 15)",
  road.spendableCredits === 5 && road.awardPool === 15, JSON.stringify({ c: road.spendableCredits, p: road.awardPool }));
const st1 = await api("getEntranceStatus", {}, token);
check("the Door's own status agrees: spendableCredits 5, awardPool 15",
  st1.data.spendableCredits === 5 && st1.data.awardPool === 15, JSON.stringify(st1.data).slice(0, 160));

/* Field the three, then §2 — orders first */
seedEnergy(roadKey);
await api("ensureFirstSeed", {}, token);
let terr = await api("getTerritory", {}, token);
const placedIds = (terr.data.placements ?? []).map((p) => p.awakenedId).sort((a, b) => a - b);
check("the three stand fielded beside the Tender (fieldFirstThreeParty)",
  JSON.stringify(placedIds) === JSON.stringify([...acct.trioIds].sort((a, b) => a - b)), JSON.stringify(placedIds));
const [t0, t1, t2] = acct.trioIds;
const stance1 = await api("setStance", { awakenedId: t0, stance: "attack", maxEnergy: 100000 }, token);
const stance2 = await api("setStance", { awakenedId: t1, stance: "defense", maxEnergy: 100000 }, token);
check("two stance orders land through the standing action", stance1.status === 200 && stance2.status === 200,
  `${stance1.status} ${errText(stance1)} / ${stance2.status} ${errText(stance2)}`);
road = await roadOf(token);
check("§2 with two of three ordered (and no battle yet): NOT done, nothing more paid",
  sectionOf(road, 2).done === false && sectionOf(road, 2).progress.ordersGiven === 2 && road.spendableCredits === 5,
  JSON.stringify(sectionOf(road, 2)));
const tiles = terr.data.tiles ?? [];
const homeTile = tiles.find((t) => t.id === (terr.data.placements.find((p) => p.awakenedId === t2)?.tileId));
const marchTarget = tiles.find((t) => t.id !== homeTile?.id && Math.max(Math.abs(t.q - homeTile.q), Math.abs(t.r - homeTile.r), Math.abs((t.q + t.r) - (homeTile.q + homeTile.r))) === 1);
const march = await api("setMarch", { awakenedId: t2, tileId: marchTarget.id }, token);
check("the third order — a march — lands through the standing action", march.status === 200, `${march.status} ${errText(march)}`);
road = await roadOf(token);
check("§2 orders complete (3 of 3) but the battle unwitnessed: still NOT done, still 5 spendable",
  sectionOf(road, 2).done === false && sectionOf(road, 2).progress.ordersGiven === 3
  && sectionOf(road, 2).progress.battleFought === false && road.spendableCredits === 5,
  JSON.stringify(sectionOf(road, 2)));

/* §2's battle — the standing cradle births it (anchor aged,
   as drive-battle stages time; no dark is inserted). */
console.log("  …waiting for the cradle's dark to reach the company (standing machinery, usual pace)");
ageAnchor(roadKey, 30);
let fought2 = false;
for (let i = 0; i < 90 && !fought2; i++) {
  terr = await api("getTerritory", {}, token);
  if (i % 3 === 2) {
    road = await roadOf(token);
    fought2 = sectionOf(road, 2).progress.battleFought === true;
  }
  if (!fought2) await sleep(600);
}
road = await roadOf(token);
check("§2 THE FIRST FIGHT WAS FOUGHT in the living battle (the cradle's dark, met by the company) — §2 pays: 10 spendable, pool 10",
  fought2 && sectionOf(road, 2).done === true && road.spendableCredits === 10 && road.awardPool === 10,
  JSON.stringify({ fought2, s2: sectionOf(road, 2), credits: road.spendableCredits, pool: road.awardPool }));
check("the battle stands in the road's own ledger (a 'battle' event, written by the settle)",
  battleEvents(roadKey) >= 1, `${battleEvents(roadKey)} battle events`);
for (let i = 0; i < 40 && bankOf(roadKey) <= 0; i++) { await api("getTerritory", {}, token); await sleep(500); }
check("the fight banked protection (kills buy the light — §3's first lighting is earnable)",
  bankOf(roadKey) > 0, `bank ${bankOf(roadKey)}`);

/* §3 — the beacon lesson, in its order, with its refusals */
const lit1 = await api("setLighthouse", { lit: true }, token);
road = await roadOf(token);
check("§3 lit by the Tender's own hand: the stage stands at to-douse, the section not done",
  lit1.status === 200 && sectionOf(road, 3).progress.beaconStage === "to-douse" && sectionOf(road, 3).done === false,
  `${lit1.status} ${JSON.stringify(sectionOf(road, 3))}`);
const douse1 = await api("setLighthouse", { lit: false }, token);
road = await roadOf(token);
check("§3 DOUSED, NOT FOUGHT: the claim (the road's read) pays NOTHING — still 10 spendable, stage to-fight",
  douse1.status === 200 && sectionOf(road, 3).done === false && road.spendableCredits === 10
  && sectionOf(road, 3).progress.beaconStage === "to-fight",
  JSON.stringify({ s3: sectionOf(road, 3), credits: road.spendableCredits }));
const relightEarly = await api("setLighthouse", { lit: true }, token);
road = await roadOf(token);
check("§3 RELIGHT BEFORE FIGHTING: the section stands INCOMPLETE (the window closed unlearned; stage to-douse again)",
  relightEarly.status === 200 && sectionOf(road, 3).done === false && road.spendableCredits === 10
  && sectionOf(road, 3).progress.beaconStage === "to-douse",
  `${relightEarly.status} ${JSON.stringify(sectionOf(road, 3))}`);
const douseAt = Date.now();
await api("setLighthouse", { lit: false }, token);
const battlesBefore = battleEvents(roadKey);
const wanderersAtDouse = new Map(db.prepare("SELECT id, hp, spawned_at FROM homeland_wanderers WHERE owner_key = ?").all(roadKey).map((w) => [w.id, w]));
console.log("  …doused again; waiting for the dark the doused beacon brings (standing machinery, usual pace)");
ageAnchor(roadKey, 30);
let stageNow = "";
let bornInWindow = false;
let hpFellInWindow = false;
for (let i = 0; i < 110 && stageNow !== "to-relight"; i++) {
  terr = await api("getTerritory", {}, token);
  const nowRows = db.prepare("SELECT id, hp, spawned_at FROM homeland_wanderers WHERE owner_key = ?").all(roadKey);
  if (nowRows.some((w) => w.spawned_at >= douseAt)) bornInWindow = true;
  const hpNow = nowRows.reduce((sum, w) => sum + Number(w.hp), 0);
  const hpThen = [...wanderersAtDouse.values()].reduce((sum, w) => sum + Number(w.hp), 0);
  if (nowRows.length < wanderersAtDouse.size || hpNow < hpThen) hpFellInWindow = true;
  if (i % 3 === 2) {
    road = await roadOf(token);
    stageNow = sectionOf(road, 3).progress.beaconStage;
  }
  if (stageNow !== "to-relight") await sleep(600);
}
road = await roadOf(token);
check("§3 FOUGHT WHILE DOUSED: the stage stands at to-relight — and the section STILL has not paid (the relight is the lesson's last act)",
  stageNow === "to-relight" && sectionOf(road, 3).done === false && road.spendableCredits === 10,
  JSON.stringify({ stageNow, s3: sectionOf(road, 3), credits: road.spendableCredits }));
check("§3 the fight arrived via the STANDING machinery: a battle event landed inside the doused window",
  battleEvents(roadKey) > battlesBefore, `${battlesBefore} → ${battleEvents(roadKey)}`);
check("§3 the dark in that window was the cradle's own (born after the douse, or a standing shade's hp fell / a shade died in the window)",
  bornInWindow || hpFellInWindow, `born ${bornInWindow}, hpFell ${hpFellInWindow}`);
for (let i = 0; i < 40 && bankOf(roadKey) <= 0; i++) { await api("getTerritory", {}, token); await sleep(500); }
const relight = await api("setLighthouse", { lit: true }, token);
road = await roadOf(token);
check("§3 RELIT after the fight: the beacon lesson completes — 15 spendable, pool 5, §4 stands active",
  relight.status === 200 && sectionOf(road, 3).done === true && road.spendableCredits === 15 && road.awardPool === 5
  && sectionOf(road, 4).active === true,
  `${relight.status} ${errText(relight)} ${JSON.stringify({ s3: sectionOf(road, 3), credits: road.spendableCredits, pool: road.awardPool })}`);

/* §4 — the first casting of the door's spell */
const standTileId = terr.data.tender?.tileId ?? tiles[0]?.id;
let castOk = null;
for (let attempt = 0; attempt < 10 && !castOk; attempt++) {
  seedEnergy(roadKey);
  const cast = await api("castMapWorking", { spellKey: "bats", tileId: standTileId }, token);
  if (cast.status === 200 && cast.data.ok === true && !cast.data.fizzled) castOk = cast;
  else await sleep(300);
}
check("§4 Bats — the door's spell — cast TRUE through castMapWorking (a landed cast, not a fizzle)",
  !!castOk, castOk ? "" : "no landed cast in 10 attempts");
road = await roadOf(token);
check("§4 pays the last five: the road stands FINISHED — 20 spendable, pool 0",
  sectionOf(road, 4).done === true && road.finished === true && road.spendableCredits === 20 && road.awardPool === 0,
  JSON.stringify({ s4: sectionOf(road, 4), credits: road.spendableCredits, pool: road.awardPool }));
road = await roadOf(token);
const ledger = db.prepare("SELECT delta, reason, reference FROM credit_ledger WHERE user_id = ? AND reason = 'entrance-road' ORDER BY id").all(roadKey);
check("DOUBLE COMPLETION PAYS ONCE: re-reads leave 20 spendable; the ledger holds exactly four +5 grants, one per section reference",
  road.spendableCredits === 20 && ledger.length === 4 && ledger.every((r) => r.delta === 5)
  && new Set(ledger.map((r) => r.reference)).size === 4,
  JSON.stringify(ledger));
const poolRow = db.prepare("SELECT entrance_award_pool AS p FROM visitors WHERE visitor_id = ?").get(roadKey);
check("the visitors record agrees: entrance_award_pool stands at 0", poolRow.p === 0, JSON.stringify(poolRow));

/* Spending the paid credits pays wake XP (the Lv 3 road) */
const spend = await api("saveAwoken", { layers: fixtureRefs(), imageBase64: await fixtureImage(), collection: "tender", ownerName: "Road Tender" }, token);
const expAfter = await api("getTenderExp", {}, token);
const studioAfter = await api("getStudio", {}, token);
check("SPENDING a paid credit through Wake One works and PAYS WAKE XP (10 EXP — the first credit wake on the exact 150-XP road to Lv 3)",
  spend.status === 200 && expAfter.data.lifetimeWakes === 1 && expAfter.data.totalExp === 10 && studioAfter.data.credits?.balance === 19,
  `spend ${spend.status} ${JSON.stringify({ exp: expAfter.data.totalExp, wakes: expAfter.data.lifetimeWakes, credits: studioAfter.data.credits })}`);

/* ── §B LEGACY ────────────────────────────────────────── */
console.log("\n§B the old road, whole, for accounts without the mark");
const legacy = await api("claimTender", { password: "legacy-password-1", tenderName: "Legacy Road Tender" });
const lToken = legacy.data.token;
const lKey = `tender:${tenderIdOf(legacy)}`;
const lRoad = await roadOf(lToken);
check("a legacy account reads NO road: entrance false, no sections, no pool",
  lRoad.entrance === false && lRoad.sections.length === 0 && lRoad.awardPool === 0 && lRoad.spendableCredits === 0,
  JSON.stringify(lRoad).slice(0, 160));
const lNav = await api("entranceNavOpened", { surface: "map" }, lToken);
const lEvents = db.prepare("SELECT COUNT(*) AS n FROM entrance_road_events WHERE owner_key = ?").get(lKey).n;
const lSections = db.prepare("SELECT COUNT(*) AS n FROM entrance_road_sections WHERE owner_key = ?").get(lKey).n;
check("a legacy navigation ping records NOTHING (no events, no sections, the answer reads the old road)",
  lNav.data.entrance === false && lEvents === 0 && lSections === 0, `events ${lEvents}, sections ${lSections}`);
const lSeen = await lessonsGet(lToken);
check("the supersede does NOT touch a legacy seen set (no old-order keys pre-served for them)",
  !(lSeen.data.seen ?? []).some((k) => ["choose", "twenty", "early", "warning", "seed"].includes(k)),
  JSON.stringify(lSeen.data.seen));

/* ── §C THE ROAD IN A REAL BROWSER ────────────────────── */
console.log("\n§C the road in a real browser (screenshots → entrance-road-proof/)");
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio"] });
async function clickButtonWithText(page, text, ms = 30000) {
  const found = await page.waitForFunction(
    (t) => [...document.querySelectorAll("button")].some((b) => (b.textContent || "").includes(t) && !b.disabled),
    { timeout: ms }, text).then(() => true).catch(() => false);
  if (!found) return false;
  await page.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").includes(t) && !x.disabled);
    b?.click();
  }, text);
  return true;
}
const pageText = (page) => page.evaluate(() => document.body.innerText);
const clickAria = async (page, label) => page.evaluate((l) => {
  const b = [...document.querySelectorAll("button")].find((x) => (x.getAttribute("aria-label") || "") === l && !x.disabled);
  if (!b) return false;
  b.click();
  return true;
}, label);

const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:road]", String(e).slice(0, 200)));
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector('input[autocomplete="username"]', { timeout: 30000 });
await page.type('input[autocomplete="username"]', "Browser Road Tender");
const pwFields = await page.$$('input[autocomplete="new-password"]');
await pwFields[0].type("browser-road-password-1");
await pwFields[1].type("browser-road-password-1");
await clickButtonWithText(page, "Begin");
await page.waitForFunction(() => document.body.innerText.includes("First — what manner of tender are you?"), { timeout: 30000 });
await clickButtonWithText(page, "Choose the Witch");
await page.waitForFunction(() => document.body.innerText.includes("Now — choose your spell"), { timeout: 30000 });
await clickButtonWithText(page, "Choose Bats");
await page.waitForFunction(() => document.body.innerText.includes("And your favourite weapon"), { timeout: 30000 });
await clickButtonWithText(page, "Take the Sword");
await page.waitForFunction(() => document.body.innerText.includes("Wake the three"), { timeout: 30000 });
await clickButtonWithText(page, "Wake the three");
await page.waitForFunction(
  () => document.body.innerText.includes("Three wake at once") && document.querySelectorAll(".entrance-trio-one").length === 3,
  { timeout: 60000 });
await clickButtonWithText(page, "To the field — light the beacon");
const mapOpen = await page.waitForFunction(
  () => (document.querySelector(".deck-button span")?.textContent || "") === "RETURN", { timeout: 30000 }).then(() => true).catch(() => false);
check("the door's end opens the map (Territory stands — the map door of §1 is pinged by its mounting)", mapOpen);
await sleep(3000);
const earlySpoken = await page.evaluate(() => !!document.querySelector('[data-front-lesson="early"]'));
check("the old-order EARLY warning is never spoken to the entrance Tender on their first entry", earlySpoken === false);
await clickButtonWithText(page, "RETURN");
/** Poll by hand (evaluate + sleep): the animated faces starve
 *  rAF-driven waitForFunction on this VM; the state is what
 *  matters, not the frame it lands in. */
async function pollFor(fn, tries = 60) {
  for (let i = 0; i < tries; i++) {
    if (await page.evaluate(fn)) return true;
    await sleep(1000);
  }
  return false;
}
let panelShown = false;
for (let i = 0; i < 60 && !panelShown; i++) {
  // NB: the eyebrow is styled uppercase — innerText carries
  // the transform, so the words are matched case-folded.
  panelShown = await page.evaluate(() => !!document.querySelector(".entrance-road")
    && document.body.innerText.toLowerCase().includes("the award road"));
  if (!panelShown) await sleep(1000);
}
check("THE ROAD PANEL stands where the player already looks (the tender face, the pool note's seat)", panelShown, (await pageText(page)).slice(0, 200));
const panelText = await pageText(page);
check("the panel names all four sections and the pool (20 to earn)",
  ["Learn the doors", "Orders, and a first fight", "The beacon lesson", "Cast your spell"].every((t) => panelText.includes(t))
  && panelText.includes("20 wakes"), panelText.slice(0, 400));
await page.screenshot({ path: `${OUT}/01-road-panel.png` });

/* §1 by real clicks: the face's doors, then the map's own. */
await clickAria(page, "My Deck — your awakened collection");
await sleep(700);
await clickAria(page, "My Deck — your awakened collection");
await sleep(400);
await clickAria(page, "The Skill Zodiac");
await sleep(700);
await page.keyboard.press("Escape");
await page.evaluate(() => { document.querySelector(".zodiac-close")?.click(); });
await sleep(400);
await clickAria(page, "Aspect Attunement");
await sleep(700);
await clickAria(page, "Aspect Attunement");
await sleep(400);
await clickButtonWithText(page, "Terrain Map");
await page.waitForFunction(() => (document.querySelector(".deck-button span")?.textContent || "") === "RETURN", { timeout: 30000 }).catch(() => false);
await sleep(2500);
await clickAria(page, "The Pack");
await sleep(700);
await clickAria(page, "Close the Pack");
await sleep(400);
await clickAria(page, "Find my Tender");
await sleep(700);
const wheelOpened = await page.evaluate(() => {
  const g = document.querySelector("g.field-drifter, g.field-patroller");
  if (!g) return false;
  const r = g.getBoundingClientRect();
  g.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
  return true;
});
check("a field figure was tapped — its orders wheel opens (the seventh door)", wheelOpened);
/* The whispers speak ONE AT A TIME, each dismissible — the
   lessons of the first visit (the party, the way back, the
   safe hex, the wheel itself) stand ahead of the road's in
   the queue, exactly as a player's would. The drive reads
   the queue the way a player does: dismiss, and the next
   speaks — until §1's completion line stands. The First
   Seed's ceremony card, if it stands, is tended on first. */
let payout = false;
for (let i = 0; i < 100 && !payout; i++) {
  payout = await page.evaluate(() => !!document.querySelector('[data-homeland-lesson="road1done"]'));
  if (payout) break;
  await page.evaluate(() => {
    const tend = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "Tend on");
    if (tend) { tend.click(); return; }
    document.querySelector(".homeland-whisper .margin-guide-dismiss")?.click();
  });
  await sleep(700);
}
check("THE PAYOUT MOMENT: §1's completion whisper speaks on the map as the seventh door pays (road1done)", payout,
  (await pageText(page)).slice(0, 300));
await sleep(600);
await page.screenshot({ path: `${OUT}/02-payout-whisper.png` });
const bId = db.prepare("SELECT id FROM tenders WHERE tender_name = 'Browser Road Tender'").get().id;
const bKey = `tender:${bId}`;
const bLedger = db.prepare("SELECT delta, reference FROM credit_ledger WHERE user_id = ? AND reason = 'entrance-road'").all(bKey);
check("the browser account's §1 paid exactly once (+5, the section-1 reference)",
  bLedger.length === 1 && bLedger[0].delta === 5 && bLedger[0].reference.endsWith("section:1"), JSON.stringify(bLedger));
await clickButtonWithText(page, "RETURN");
await pollFor(() => document.querySelector('[data-road-section="1"]')?.getAttribute("data-road-done") === "true");
const afterText = await pageText(page);
check("back home, the panel shows §1 lived and 5 spendable",
  afterText.includes("Spendable now:") && afterText.includes("5"), afterText.slice(0, 300));
await page.screenshot({ path: `${OUT}/03-road-after-section1.png` });
await browser.close();

console.log(`\ndrive-entrance-road: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
