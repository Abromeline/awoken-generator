// drive-entrance-door — ENTRANCE BUILD 1: THE DOOR (homeland).
// Nigel's build word 2026-11-01 ("Build the entrance now"), on
// the spec of 2026-10-31 + his seven rulings of 2026-11-01.
//
//   §S SOURCE SEAMS: the general chooseClass gate stands
//      unloosened; WakeRitual's single-card path is untouched;
//      the banner carries its entrance guard; the door's spell
//      list is exactly Nigel's three names.
//   §A THE DOOR, LIVED (API): a fresh entrance claim walks the
//      door in order — wake-before-choose refused on every
//      road; the spell restricted to Bats / Shard Rain / Rune
//      Hold; the weapon refused before the spell; the trio
//      FREE (credits untouched, award pool 20 locked / 0
//      spendable, no wake XP); the greeter mark on the first;
//      the three fielded beside the Tender at the first
//      territory read (the standing fieldFirstThreeParty);
//      the chosen spell castable at Lv 1 while another
//      working still wakes at Lv 3.
//   §B LEGACY REGRESSION (API): a claim without the entrance
//      ask — and a claim adopting an already-welcomed soft
//      visitor, even WITH the ask — keep the old road whole:
//      no mark, 20 spendable credits, the greeting seeds and
//      joins, credit wakes spend and pay XP, choosing at 3.
//   §C THE DOOR IN A REAL BROWSER: the gate claim, the class
//      step, the spell step, the weapon step, the wake step,
//      the THREE-CARD CEREMONY (three cards together, three
//      whispers), the pool note where the player looks — and
//      the patrol banner: never for the entrance account
//      (even at 20 held), standing for a legacy account at 20.
//      Screenshots land in ~/workspace/entrance-door-proof/.
//
// Run after `npm run build`:
//   PUPPETEER_CACHE_DIR=$HOME/workspace/tools-chrome/.cache node scripts/drive-entrance-door.mjs
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
const OUT = "/home/hatch/workspace/entrance-door-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-entrance-"));
process.env.PORT = "39971";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
process.chdir(root);
const BASE = "http://127.0.0.1:39971";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
const errText = (r) => String(r.data?.error ?? r.data?.message ?? "");

/* ── §S SOURCE SEAMS ──────────────────────────────────── */
console.log("\n§S the seams in the sources");
const actionsSrc = readFileSync(join(root, "server/src/actions.ts"), "utf8");
const appSrc = readFileSync(join(root, "client/src/App.tsx"), "utf8");
const entranceSrc = readFileSync(join(root, "server/src/entrance.ts"), "utf8");
const tendersSrc = readFileSync(join(root, "server/src/tenders.ts"), "utf8");
check("the general chooseClass gate stands UNLOOSENED (a first class below 3 held is refused, in the standing words)",
  actionsSrc.includes("if (!progress.classKey && progress.awokenCount < 3) badRequest(\"The choosing comes after your first three wakes"));
check("the door's spell list is exactly Nigel's three, by his names and the book's keys",
  entranceSrc.includes('export const ENTRANCE_SPELL_KEYS = ["bats", "shardrain", "holdrune"] as const')
  && entranceSrc.includes('bats: "Bats"') && entranceSrc.includes('shardrain: "Shard Rain"') && entranceSrc.includes('holdrune: "Rune Hold"'));
check("the mark is laid at claim time only when the claim asks AND nothing was granted or adopted",
  tendersSrc.includes("const isEntranceClaim = parsed.data.entrance === true && !granted && !adoptedState"));
check("an entrance claim is granted NO spendable welcome credits — markEntranceClaim stands where the grant stood",
  tendersSrc.includes("if (isEntranceClaim) {\n      markEntranceClaim(ownerKey);"));
check("the patrol banner carries its entrance guard in App.tsx",
  appSrc.includes("const showPatrolBanner = !entranceQ.data?.entrance && tenderItems.length >= 20"));
check("WakeRitual's single-card path is untouched by the door (no entrance word inside it)",
  !appSrc.slice(appSrc.indexOf("function WakeRitual("), appSrc.indexOf("function WelcomeSection(")).includes("entrance"));
check("the trio's waking pays no wake XP and spends no credit (entranceWakeThree names neither)",
  (() => { const s = actionsSrc.slice(actionsSrc.indexOf("async entranceWakeThree("), actionsSrc.indexOf("async entranceWakeThree(") + 3200); return !s.includes("awardWakeExp") && !s.includes("spendWakeCredit") && !s.includes("grantBirthEnergy"); })());

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
async function welcomePath(path, args, token, visitorId) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}), ...(visitorId ? { "x-visitor-id": visitorId } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
async function welcomeGet(token) {
  const res = await fetch(`${BASE}/api/welcome`, {
    method: "GET",
    headers: { ...(token ? { "x-tender-token": token } : {}) },
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

const pngFor = (r, g, b) => sharp({ create: { width: 750, height: 971, channels: 4, background: { r, g, b, alpha: 1 } } }).png().toBuffer();
const fixtureAssets = [];
{
  const pieces = [
    ["Door Backdrop", "background", null, null, "root", 40, 34, 28],
    ["Door Body", "body", 3, 3, "root", 90, 120, 70],
    ["Door Arms", "arms", 2, 2, "sky", 90, 110, 150],
    ["Door Head", "head", 2, 3, "stone", 150, 120, 80],
  ];
  for (const [name, category, power, toughness, element, r, g, b] of pieces) {
    const key = `door-fixtures/${name}.png`;
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

/* ── §A THE DOOR, LIVED ───────────────────────────────── */
console.log("\n§A the door walked in order against the real API");
const claim = await api("claimTender", { password: "door-password-1", tenderName: "Door Tender", entrance: true });
check("a fresh claim asking for the entrance is marked (the claim answers entrance: true)",
  claim.status === 200 && !!claim.data.token && claim.data.entrance === true, JSON.stringify(claim.data).slice(0, 140));
const token = claim.data.token;
const doorId = tenderIdOf(claim);
const doorKey = `tender:${doorId}`;

let st = await api("getEntranceStatus", {}, token);
check("the door stands at its CLASS step, the pool recorded: 20 locked, 0 spendable",
  st.data.entrance === true && st.data.step === "class" && st.data.awardPool === 20 && st.data.spendableCredits === 0,
  JSON.stringify(st.data).slice(0, 200));
check("the spell choice is exactly the three, in Nigel's names, with the book's words riding",
  JSON.stringify(st.data.spellChoices?.map((c) => c.key)) === JSON.stringify(["bats", "shardrain", "holdrune"])
  && JSON.stringify(st.data.spellChoices?.map((c) => c.name)) === JSON.stringify(["Bats", "Shard Rain", "Rune Hold"])
  && st.data.spellChoices.every((c) => typeof c.blurb === "string" && c.blurb.length > 10),
  JSON.stringify(st.data.spellChoices).slice(0, 200));
let studio = await api("getStudio", {}, token);
check("the tender face's credit balance reads 0 — the pool is NOT credits",
  studio.data.credits?.balance === 0, JSON.stringify(studio.data.credits));

const earlyWake = await api("entranceWakeThree", { items: await trioItems() }, token);
check("WAKE-BEFORE-CHOOSE REFUSED: the door's waking at the class step is refused (400)",
  earlyWake.status === 400 && errText(earlyWake).includes("class, spell, and weapon come before the waking"), `status ${earlyWake.status} ${errText(earlyWake)}`);
const earlyCredit = await api("saveAwoken", { layers: fixtureRefs(), imageBase64: await fixtureImage(), collection: "tender", ownerName: "Door Tender" }, token);
check("WAKE-BEFORE-CHOOSE REFUSED: a credit Wake One ahead of the door is refused (403, the door's own words)",
  earlyCredit.status === 403 && errText(earlyCredit).includes("The door first"), `status ${earlyCredit.status} ${errText(earlyCredit)}`);
const generalClass = await api("chooseClass", { classKey: "witch" }, token);
check("the GENERAL chooseClass still refuses this Tender at 0 held — the gate was not loosened for the door",
  generalClass.status === 400 && errText(generalClass).includes("first three wakes"), `status ${generalClass.status} ${errText(generalClass)}`);
const earlySpell = await api("entranceChooseSpell", { spellKey: "bats" }, token);
check("SPELL-BEFORE-CLASS REFUSED: the spell step at the class step is refused (400)",
  earlySpell.status === 400, `status ${earlySpell.status} ${errText(earlySpell)}`);
const earlyWeapon = await api("chooseWeapon", { weaponKey: "sword" }, token);
check("WEAPON-BEFORE-CLASS REFUSED: the standing weapon door refuses a classless Tender (400)",
  earlyWeapon.status === 400, `status ${earlyWeapon.status} ${errText(earlyWeapon)}`);
const seedTry = await welcomePath("/api/welcome/seed", { layers: fixtureRefs(), imageBase64: await fixtureImage() }, token);
check("no greeting seeds for an entrance account (400 — the greeter folds into the three)",
  seedTry.status === 400 && errText(seedTry).includes("door's three"), `status ${seedTry.status} ${errText(seedTry)}`);

const cls = await api("entranceChooseClass", { classKey: "witch" }, token);
check("THE CLASS STEP lands through the door's own action (via the door)",
  cls.status === 200 && cls.data.classKey === "witch" && cls.data.via === "the door", `status ${cls.status} ${JSON.stringify(cls.data).slice(0, 120)}`);
st = await api("getEntranceStatus", {}, token);
check("the door now stands at its SPELL step", st.data.step === "spell", JSON.stringify(st.data).slice(0, 120));
const weaponEarly = await api("chooseWeapon", { weaponKey: "sword" }, token);
check("WEAPON-AFTER-CLASS-BUT-BEFORE-SPELL REFUSED: the door's order holds inside chooseWeapon (400)",
  weaponEarly.status === 400 && errText(weaponEarly).includes("choose your spell first"), `status ${weaponEarly.status} ${errText(weaponEarly)}`);
const badSpell = await api("entranceChooseSpell", { spellKey: "seal" }, token);
check("THE SPELL IS RESTRICTED TO THE THREE: a working outside Nigel's three is refused (400)",
  badSpell.status === 400 && errText(badSpell).includes("Bats, Shard Rain, or Rune Hold"), `status ${badSpell.status} ${errText(badSpell)}`);
const spell = await api("entranceChooseSpell", { spellKey: "shardrain" }, token);
check("THE SPELL STEP lands: Shard Rain chosen, spoken back by Nigel's door name",
  spell.status === 200 && spell.data.spellKey === "shardrain" && spell.data.name === "Shard Rain", `status ${spell.status} ${JSON.stringify(spell.data).slice(0, 120)}`);
let exp = await api("getTenderExp", {}, token);
check("the progress reading carries the grant: startingSpellKey = shardrain, at Lv 1, nothing woken yet",
  exp.data.startingSpellKey === "shardrain" && exp.data.level === 1 && exp.data.awokenCount === 0 && exp.data.wardRuneUnlocked === false,
  JSON.stringify(exp.data).slice(0, 200));
const spellAgain = await api("entranceChooseSpell", { spellKey: "bats" }, token);
check("the spell step does not repeat once walked (400)", spellAgain.status === 400, `status ${spellAgain.status}`);
const wakeEarly2 = await api("entranceWakeThree", { items: await trioItems() }, token);
check("WAKE-BEFORE-WEAPON REFUSED (400)", wakeEarly2.status === 400, `status ${wakeEarly2.status} ${errText(wakeEarly2)}`);

const weapon = await api("chooseWeapon", { weaponKey: "sword" }, token);
check("THE WEAPON STEP lands through the STANDING chooseWeapon (via the choosing)",
  weapon.status === 200 && weapon.data.weaponKey === "sword" && weapon.data.via === "the choosing", `status ${weapon.status} ${JSON.stringify(weapon.data).slice(0, 120)}`);
st = await api("getEntranceStatus", {}, token);
check("the door now stands at its WAKE step", st.data.step === "wake", JSON.stringify(st.data).slice(0, 120));
const twoOnly = await api("entranceWakeThree", { items: (await trioItems()).slice(0, 2) }, token);
check("the waking wakes exactly three — two is refused (400)", twoOnly.status === 400, `status ${twoOnly.status}`);

const woke = await api("entranceWakeThree", { items: await trioItems() }, token);
check("BOOM: the three wake at once — three payloads returned together",
  woke.status === 200 && Array.isArray(woke.data.awakened) && woke.data.awakened.length === 3,
  `status ${woke.status} ${JSON.stringify(woke.data).slice(0, 160)}`);
const trioIds = (woke.data.awakened ?? []).map((a) => a.id);
exp = await api("getTenderExp", {}, token);
check("THE TRIO ARE FREE: no wake XP (totalExp 0, lifetimeWakes 0, still Lv 1) — the 150-XP road is untouched",
  exp.data.totalExp === 0 && exp.data.lifetimeWakes === 0 && exp.data.level === 1 && exp.data.awokenCount === 3,
  JSON.stringify(exp.data).slice(0, 200));
studio = await api("getStudio", {}, token);
st = await api("getEntranceStatus", {}, token);
check("THE TRIO ARE FREE: credits still 0 spent and 0 held; the pool still reads 20 locked / 0 spendable; the door is done",
  studio.data.credits?.balance === 0 && st.data.awardPool === 20 && st.data.spendableCredits === 0 && st.data.step === "done",
  JSON.stringify({ credits: studio.data.credits, st: st.data }).slice(0, 220));
const ledgerRows = db.prepare("SELECT delta, reason FROM credit_ledger WHERE user_id = ?").all(doorKey);
check("the credit ledger holds NO rows at all for the entrance account — no grant, no spend",
  ledgerRows.length === 0, JSON.stringify(ledgerRows));
const greeterRows = db.prepare("SELECT id, greeter FROM awakened WHERE owner_key = ? ORDER BY id ASC").all(doorKey);
check("THE GREETER MARK stands on the FIRST of the three, and on no other",
  greeterRows.length === 3 && greeterRows[0].greeter === 1 && greeterRows[1].greeter === 0 && greeterRows[2].greeter === 0
  && greeterRows[0].id === trioIds[0], JSON.stringify(greeterRows));
const welcome = await welcomeGet(token);
check("the welcome status names the first of the three as the greeter (MarginGuide's teacher) and never asks for a seed",
  welcome.status === 200 && welcome.data.greeterId === trioIds[0] && welcome.data.needsSeed === false,
  JSON.stringify(welcome.data).slice(0, 200));
const wokeAgain = await api("entranceWakeThree", { items: await trioItems() }, token);
check("the door wakes the three ONCE — a second waking is refused (400)", wokeAgain.status === 400, `status ${wokeAgain.status}`);

db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 500, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500").run(doorKey, Date.now());
const sow = await api("ensureFirstSeed", {}, token);
check("the land sows on the standing road (ensureFirstSeed)", sow.status === 200, `status ${sow.status} ${JSON.stringify(sow.data).slice(0, 100)}`);
const terr = await api("getTerritory", {}, token);
const placedIds = (terr.data.placements ?? []).map((p) => p.awakenedId).sort((a, b) => a - b);
check("THE THREE FIELD BESIDE THE TENDER at the first territory read (fieldFirstThreeParty, reused whole)",
  JSON.stringify(placedIds) === JSON.stringify([...trioIds].sort((a, b) => a - b)),
  JSON.stringify(terr.data.placements?.map((p) => p.awakenedId)));
const partyRows = db.prepare("SELECT awakened_id FROM tender_party WHERE owner_key = ? ORDER BY added_at ASC").all(doorKey).map((r) => r.awakened_id);
check("the party ledger holds the trio in hatch order — no fourth first-three road was added",
  JSON.stringify(partyRows) === JSON.stringify(trioIds), JSON.stringify(partyRows));
const standTileId = terr.data.tender?.tileId ?? terr.data.tiles?.[0]?.id;
const castOther = await api("castMapWorking", { spellKey: "seal", tileId: standTileId, dir: 0 }, token);
check("another working still wakes at Lv 3 for the door Tender (the Seal is refused, in the standing words)",
  castOther.status === 400 && errText(castOther).includes("wake at Tender Lv 3"), `status ${castOther.status} ${errText(castOther)}`);
const castMine = await api("castMapWorking", { spellKey: "shardrain", tileId: standTileId }, token);
check("THE CHOSEN SPELL IS CASTABLE FROM THE START at Lv 1 (a cast outcome — landed or fizzled — never the Lv 3 refusal)",
  castMine.status === 200 && (castMine.data.ok === true),
  `status ${castMine.status} ${JSON.stringify(castMine.data).slice(0, 200)}`);

/* ── §B LEGACY REGRESSION ─────────────────────────────── */
console.log("\n§B the old road, whole, for accounts without the mark");
const legacy = await api("claimTender", { password: "legacy-password-1", tenderName: "Legacy Tender" });
check("a claim WITHOUT the entrance ask is unmarked (no entrance in the answer)",
  legacy.status === 200 && !legacy.data.entrance, JSON.stringify(legacy.data).slice(0, 120));
const lToken = legacy.data.token;
const lst = await api("getEntranceStatus", {}, lToken);
check("its entrance status reads the old road (entrance: false, no step, no pool)",
  lst.data.entrance === false && lst.data.step === null && lst.data.awardPool === 0, JSON.stringify(lst.data).slice(0, 140));
let lstudio = await api("getStudio", {}, lToken);
check("its welcome grant stands as it stood: 20 SPENDABLE credits",
  lstudio.data.credits?.balance === 20, JSON.stringify(lstudio.data.credits));
const lWelcome = await welcomeGet(lToken);
check("the greeting still waits to seed for a legacy Tender (needsSeed: true)",
  lWelcome.status === 200 && lWelcome.data.needsSeed === true, JSON.stringify(lWelcome.data).slice(0, 140));
const lSeed = await welcomePath("/api/welcome/seed", { layers: fixtureRefs(), imageBase64: await fixtureImage() }, lToken);
check("the greeting seeds and joins on the old road (200, a payload, the greeter)",
  lSeed.status === 200 && !!lSeed.data.awakened, `status ${lSeed.status} ${JSON.stringify(lSeed.data).slice(0, 120)}`);
const lDoorClass = await api("entranceChooseClass", { classKey: "sage" }, lToken);
check("the door's class action refuses a legacy account — its road is the choosing at three (400)",
  lDoorClass.status === 400, `status ${lDoorClass.status} ${errText(lDoorClass)}`);
for (let i = 1; i <= 2; i++) {
  const w = await api("saveAwoken", { layers: fixtureRefs(), imageBase64: await fixtureImage(), collection: "tender", ownerName: "Legacy Tender" }, lToken);
  check(`legacy credit wake ${i} of 2 spends through the standing Wake One`, w.status === 200 && typeof w.data.id === "number", `status ${w.status}`);
}
lstudio = await api("getStudio", {}, lToken);
check("the two wakes spent exactly two credits (20 → 18)", lstudio.data.credits?.balance === 18, JSON.stringify(lstudio.data.credits));
let lexp = await api("getTenderExp", {}, lToken);
check("the greeting + two credit wakes hold three; the credit wakes paid their XP (20 EXP, lifetimeWakes 2)",
  lexp.data.awokenCount === 3 && lexp.data.totalExp === 20 && lexp.data.lifetimeWakes === 2 && lexp.data.startingSpellKey === null,
  JSON.stringify(lexp.data).slice(0, 200));
const lEarly = await api("chooseClass", { classKey: "warden" }, lToken);
check("CHOOSING AT THREE, LIVED on the old road: the standing chooseClass lands at three held",
  lEarly.status === 200 && lEarly.data.classKey === "warden" && lEarly.data.via === "the calling", `status ${lEarly.status} ${JSON.stringify(lEarly.data).slice(0, 120)}`);

// A claim that ADOPTS an already-welcomed soft visitor keeps
// the old road even when it asks for the entrance.
db.prepare("INSERT INTO visitors (visitor_id, created_at, welcome_wakes_granted, welcome_claimed, last_free_wake_at) VALUES (?, ?, 1, 1, ?)").run("granddad42", Date.now(), Date.now());
const adoptClaim = await api("claimTender", { password: "adopt-password-1", tenderName: "Adopted Tender", entrance: true }, null, "granddad42");
check("a claim carrying an already-welcomed soft visitor is NOT marked, even asking for the entrance",
  adoptClaim.status === 200 && !adoptClaim.data.entrance, JSON.stringify(adoptClaim.data).slice(0, 140));
const ast = await api("getEntranceStatus", {}, adoptClaim.data.token);
check("its entrance status reads the old road (entrance: false)", ast.data.entrance === false, JSON.stringify(ast.data).slice(0, 120));

/* ── §C THE DOOR IN A REAL BROWSER ────────────────────── */
console.log("\n§C the door in a real browser (screenshots → entrance-door-proof/)");
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

const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:door]", String(e).slice(0, 200)));
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
const gateShown = await page.waitForSelector('input[autocomplete="username"]', { timeout: 30000 }).then(() => true).catch(() => false);
check("the gate stands for a brand-new visitor (name + password first, as the design orders)", gateShown);
await page.type('input[autocomplete="username"]', "Browser Tender");
const pwFields = await page.$$('input[autocomplete="new-password"]');
check("the gate asks a password, twice", pwFields.length === 2, `found ${pwFields.length}`);
await pwFields[0].type("browser-password-1");
await pwFields[1].type("browser-password-1");
await clickButtonWithText(page, "Begin");
const classStep = await page.waitForFunction(
  () => document.body.innerText.includes("First — what manner of tender are you?"), { timeout: 30000 }).then(() => true).catch(() => false);
check("after the claim, THE DOOR opens at its class step", classStep, (await pageText(page)).slice(0, 200));
await page.screenshot({ path: `${OUT}/01-class-step.png` });
check("the class step offers the five classes", (await pageText(page)).includes("Choose the Witch"));
await clickButtonWithText(page, "Choose the Witch");
const spellStep = await page.waitForFunction(
  () => document.body.innerText.includes("Now — choose your spell"), { timeout: 30000 }).then(() => true).catch(() => false);
check("the spell step follows the class step", spellStep);
await page.screenshot({ path: `${OUT}/02-spell-step.png` });
const spellText = await pageText(page);
check("the spell step shows exactly Nigel's three (Bats, Shard Rain, Rune Hold buttons)",
  spellText.includes("Choose Bats") && spellText.includes("Choose Shard Rain") && spellText.includes("Choose Rune Hold"), spellText.slice(0, 300));
await clickButtonWithText(page, "Choose Shard Rain");
const weaponStep = await page.waitForFunction(
  () => document.body.innerText.includes("And your favourite weapon"), { timeout: 30000 }).then(() => true).catch(() => false);
check("the weapon step follows the spell step", weaponStep);
await page.screenshot({ path: `${OUT}/03-weapon-step.png` });
await clickButtonWithText(page, "Take the Sword");
const wakeStep = await page.waitForFunction(
  () => document.body.innerText.includes("Wake the three"), { timeout: 30000 }).then(() => true).catch(() => false);
check("the wake step follows the weapon step — and speaks the award pool before the waking",
  wakeStep && (await pageText(page)).includes("award pool: 20 wakes"), (await pageText(page)).slice(0, 300));
await page.screenshot({ path: `${OUT}/04-wake-step.png` });
await clickButtonWithText(page, "Wake the three");
const ceremonyShown = await page.waitForFunction(
  () => document.body.innerText.includes("Three wake at once")
    && document.querySelectorAll(".entrance-trio-one").length === 3,
  { timeout: 60000 }).then(() => true).catch(() => false);
check("THE THREE-CARD CEREMONY: three cards stand TOGETHER (three .entrance-trio-one at once)",
  ceremonyShown, (await pageText(page)).slice(0, 300));
await sleep(1200);
await page.screenshot({ path: `${OUT}/05-three-card-ceremony.png` });
const whisperTexts = async () => page.evaluate(
  () => [...document.querySelectorAll(".entrance-whisper")].map((el) => el.textContent || ""));
for (const [label, needle] of [
  ["whisper 1 (what an Awoken is / held by attention) is spoken under the first card", "scattered matter, held together by your attention"],
  ["whisper 2 (its element, in plain words) is spoken under the second card", "Root runs through me"],
  ["whisper 3 (eyes to the beacon) is spoken under the third card", "A starseed waits there"],
]) {
  const spoken = await page.waitForFunction(
    (n) => [...document.querySelectorAll(".entrance-whisper")].some((el) => (el.textContent || "").includes(n)),
    { timeout: 20000 }, needle).then(() => true).catch(() => false);
  check(label, spoken, JSON.stringify(await whisperTexts()));
}
await clickButtonWithText(page, "To the field — light the beacon");
const fieldShown = await page.waitForFunction(
  () => (document.querySelector(".deck-button span")?.textContent || "") === "RETURN",
  { timeout: 30000 }).then(() => true).catch(() => false);
check("the ceremony's end TAKES THE PLAYER TO THEIR LAND (the map opens, the deck button turns to RETURN)",
  fieldShown, (await pageText(page)).slice(0, 200));
await sleep(2500);
await page.screenshot({ path: `${OUT}/06-after-the-door.png` });
await clickButtonWithText(page, "RETURN");
// Build 2 grew the pool note into THE AWARD ROAD, standing in the
// same seat (the note itself remains the panel's loading fallback):
// the pool line now names what each section pays.
let poolShown = false;
for (let i = 0; i < 30 && !poolShown; i++) {
  poolShown = await page.evaluate(() => !!document.querySelector(".entrance-road")
    && document.body.innerText.includes("Award pool:") && document.body.innerText.includes("still to earn"));
  if (!poolShown) await sleep(1000);
}
check("back on the tender face, the AWARD ROAD stands where the pool note stood (above Wake One) — Build 2's road in the note's seat",
  poolShown, (await pageText(page)).slice(0, 300));
await page.screenshot({ path: `${OUT}/06b-award-pool-note.png` });

// The banner: never for the entrance account — even at 20 held.
const bId = db.prepare("SELECT id FROM tenders WHERE tender_name = 'Browser Tender'").get().id;
const bKey = `tender:${bId}`;
const insB = db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, '[]', 'tender', 'Browser Tender', ?, ?)");
for (let i = 0; i < 17; i++) insB.run(`Held ${i}`, `Held ${i}`, `door-drive/held-${i}.png`, bKey, Date.now());
await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => document.body.innerText.includes("Award pool:"), { timeout: 30000 }).catch(() => false);
await sleep(2500);
const entranceBanner = await page.evaluate(() => !!document.querySelector(".patrol-banner"));
check("THE PATROL BANNER NEVER SHOWS for the entrance account — not even at 20 held",
  entranceBanner === false);
await page.screenshot({ path: `${OUT}/07-entrance-at-twenty-no-banner.png` });

// The banner: standing for a legacy account at 20 held.
const lId = tenderIdOf(legacy);
const lKey = `tender:${lId}`;
const insL = db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, '[]', 'tender', 'Legacy Tender', ?, ?)");
for (let i = 0; i < 17; i++) insL.run(`Legacy Held ${i}`, `Legacy Held ${i}`, `door-drive/legacy-${i}.png`, lKey, Date.now());
const page2 = await browser.newPage();
await page2.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
await page2.evaluateOnNewDocument((tok) => { try { window.localStorage.setItem("awoken-tender-token", tok); } catch { /* storage denied */ } }, legacy.data.token);
await page2.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
const legacyBanner = await page2.waitForSelector(".patrol-banner", { timeout: 30000 }).then(() => true).catch(() => false);
check("THE PATROL BANNER STANDS for a legacy account at 20 held, as it always has", legacyBanner);
await page2.screenshot({ path: `${OUT}/08-legacy-at-twenty-banner.png` });
await browser.close();

console.log(`\ndrive-entrance-door: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
