// SPELL POINTS FROM SHADOW MATTER — THE GRIMOIRE'S
// CONDENSING VIAL (Nigel, 2026-11-03).
// Boots the real server on a scratch DATA_DIR and proves:
//   §S the seams in the sources (the ladder in
//      spellPoints.ts, the gates at both grounds' cast
//      doors, the door's exemption untouched);
//   §A a FRESH Tender's book — every page locked, the free
//      first point standing ready, an unlocked page still
//      held by the Lv 3 waking until the level stands;
//   §B a LEGACY Tender (Lv 4 — Nigel's shape: cast freely
//      before, spent nothing) — no rows before the first
//      reading; the free point materialises with its one
//      ledger record; the book locks to the ledger; the
//      free point spends on one page (it casts; a second
//      page refuses; a second unlock refuses); the vial —
//      partial feed persists and shows its standing, the
//      stock decremented by exactly the fed amounts,
//      completing 500 banks point 2 exactly once, and the
//      ladder reads free/500/1000/2000 for points 1–4 from
//      the server's own answers;
//   §C THE DOOR'S SPELL stands outside — an entrance
//      account casts Shard Rain at Lv 1 with zero unlocks
//      and its free point unspent, while another working
//      still refuses in the standing Lv 3 words;
//   §D THE TABLE — the wheel's payload carries the ledger;
//      castRune/castWard/castHeal refuse an un-unlocked
//      page in the same words; after the unlock the rune
//      stands;
//   §E THE BROWSER — the gold button + vial in the real
//      Grimoire: empty, part-full (fed by a real click),
//      the milestone banked by a real click; a locked
//      page's unlock block, clicked through to its orbs.
//      Screenshots land in ~/workspace/spell-points-proof/.
// Run: PUPPETEER_CACHE_DIR=$HOME/workspace/tools-chrome/.cache node scripts/drive-spell-points.mjs
import { join, dirname } from "node:path";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";
import sharp from "sharp";

process.env.PUPPETEER_CACHE_DIR = "/home/hatch/workspace/tools-chrome/.cache";
const require2 = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require2("puppeteer");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "/home/hatch/workspace/spell-points-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-spellpoints-"));
process.env.PORT = "39977";
process.env.WORKSHOP_PASSWORD = "spell-points-drive";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;
process.chdir(root);
const BASE = "http://127.0.0.1:39977";
const PW = "spell-points-password";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
const errText = (r) => String(r.data?.error ?? r.data?.message ?? "");
async function api(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data: data?.data ?? data };
}

/* ── §S SOURCE SEAMS ──────────────────────────────────── */
console.log("\n§S the seams in the sources");
const spSrc = readFileSync(join(root, "server/src/spellPoints.ts"), "utf8");
const actionsSrc = readFileSync(join(root, "server/src/actions.ts"), "utf8");
const tableSrc = readFileSync(join(root, "server/src/table.ts"), "utf8");
check("the ladder stands in spellPoints.ts — free, 500, 1000, 2000, 5000, 7000, 10000, 13000, 16000, then +3000 a rung",
  spSrc.includes("2: 500") && spSrc.includes("3: 1000") && spSrc.includes("4: 2000") && spSrc.includes("5: 5000")
  && spSrc.includes("6: 7000") && spSrc.includes("7: 10000") && spSrc.includes("8: 13000") && spSrc.includes("9: 16000")
  && spSrc.includes("16000 + 3000 * (n - 9)"));
check("the homeland cast door judges the unlock behind the Lv 3 waking (gateSpellUnlock at the general gate, the heal branch and the springleaf branch)",
  (actionsSrc.match(/gateSpellUnlock\(actorKeyFor\(ctx\), spell, doorSpellKey\)/g) ?? []).length === 3);
check("the Table's three cast doors judge the same ledger (castHeal, castWard, castRune)",
  (tableSrc.match(/spellUnlockedSync\(/g) ?? []).length === 3);
check("the door's grant is exempted by its key at both grounds, never by an unlock",
  actionsSrc.includes("if (spell.key === doorSpellKey) return;")
  && tableSrc.includes("def.key !== entranceSpellKeyFor(caster.expKey)"));

await import("../server/dist/index.js");
await sleep(2500);
const { blobs } = await import("../server/dist/store.js");
const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up */ }

const tenderIdOf = (claimData) => db.prepare("SELECT id FROM tenders WHERE code = ?").get(claimData.tender.code).id;
function seedProgress(ownerKey, exp, shadowMatter = 0) {
  const now = Date.now();
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, shadow_matter, updated_at) VALUES (?, ?, 0, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp, shadow_matter = excluded.shadow_matter")
    .run(ownerKey, exp, shadowMatter, now);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(ownerKey, now);
}
function setShadowMatter(ownerKey, amount) {
  db.prepare("UPDATE tender_progress SET shadow_matter = ? WHERE owner_key = ?").run(amount, ownerKey);
}
function seedAwokin(ownerKey, tenderName, name, partPower = 2) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, 'root', ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, partPower, partPower, `sp/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: partPower, toughness: partPower, element: "root" });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `sp/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
async function claimLegacy(name, exp, classKey) {
  const c = await api("claimTender", { password: PW, tenderName: name });
  if (c.status !== 200) throw new Error(`claim ${name} failed: ${JSON.stringify(c.data).slice(0, 160)}`);
  const ownerKey = `tender:${tenderIdOf(c.data)}`;
  seedProgress(ownerKey, exp);
  for (let i = 0; i < 3; i++) seedAwokin(ownerKey, name, `${name} Friend ${i + 1}`);
  if (classKey) {
    const cc = await api("chooseClass", { classKey }, c.data.token);
    if (cc.status !== 200) throw new Error(`chooseClass ${name} failed: ${JSON.stringify(cc.data).slice(0, 160)}`);
  }
  return { token: c.data.token, ownerKey };
}
async function standTileOf(token) {
  await api("ensureFirstSeed", {}, token);
  const terr = await api("getTerritory", {}, token);
  return terr.data.tender?.tileId ?? terr.data.tiles?.[0]?.id;
}

/* ── §A A FRESH TENDER'S BOOK ─────────────────────────── */
console.log("\n§A a fresh Tender's book — every page locked, the free point standing ready");
const fresh = await api("claimTender", { password: PW, tenderName: "Fresh Book Tender" });
const freshKey = `tender:${tenderIdOf(fresh.data)}`;
let sp = await api("getSpellPoints", {}, fresh.data.token);
check("the first reading grants the free first point: earned 1, available 1, spent 0",
  sp.status === 200 && sp.data.earned === 1 && sp.data.available === 1 && sp.data.spent === 0, JSON.stringify(sp.data).slice(0, 160));
check("nothing stands unlocked; the vial stands empty toward point 2 at 500",
  Array.isArray(sp.data.unlocked) && sp.data.unlocked.length === 0 && sp.data.vialFed === 0 && sp.data.nextPrice === 500 && sp.data.nextPoint === 2,
  JSON.stringify(sp.data).slice(0, 160));
const book = await api("getGrimoire", {}, fresh.data.token);
const bookKeys = (book.data.spells ?? []).map((s) => s.key);
check("EVERY page of the book is locked for the fresh Tender (the unlock list is empty against the book's whole roll)",
  bookKeys.length > 5 && bookKeys.every((k) => !sp.data.unlocked.includes(k)), `pages=${bookKeys.length}`);
const expFresh = await api("getTenderExp", {}, fresh.data.token);
check("the progress reading carries the same standing (spellPoints 1, unlockedSpells [])",
  expFresh.data.spellPoints === 1 && Array.isArray(expFresh.data.unlockedSpells) && expFresh.data.unlockedSpells.length === 0,
  JSON.stringify(expFresh.data).slice(0, 160));
const healTryFresh = await api("castMapWorking", { spellKey: "heal" }, fresh.data.token);
check("Heal's page refuses locked at the cast door, in the standing words",
  healTryFresh.status === 400 && errText(healTryFresh).includes("Heal") && errText(healTryFresh).includes("is locked — its page wakes for a spell point"), `status ${healTryFresh.status} ${errText(healTryFresh)}`);
const unlockBats = await api("unlockGrimoireSpell", { spellKey: "bats" }, fresh.data.token);
check("the free point spends: Bats unlocks, available falls to 0",
  unlockBats.status === 200 && unlockBats.data.available === 0 && JSON.stringify(unlockBats.data.unlocked) === JSON.stringify(["bats"]),
  `status ${unlockBats.status} ${JSON.stringify(unlockBats.data).slice(0, 160)}`);
const castBatsFresh = await api("castMapWorking", { spellKey: "bats" }, fresh.data.token);
check("an UNLOCKED page is no longer refused by the lock — the standing gates ahead of it (here the choosing) answer instead, in their own words",
  castBatsFresh.status === 400 && !errText(castBatsFresh).includes("is locked") && errText(castBatsFresh).includes("No class, no school"), `status ${castBatsFresh.status} ${errText(castBatsFresh)}`);
const unlockSecond = await api("unlockGrimoireSpell", { spellKey: "seal" }, fresh.data.token);
check("a second unlock with no point ready refuses whole",
  unlockSecond.status === 400 && errText(unlockSecond).includes("No spell point stands ready"), `status ${unlockSecond.status} ${errText(unlockSecond)}`);
const unlockDoorPage = await api("unlockGrimoireSpell", { spellKey: "notapage" }, fresh.data.token);
check("a page not in the book is refused as such", unlockDoorPage.status === 400 && errText(unlockDoorPage).includes("not in the book"), `status ${unlockDoorPage.status}`);

/* ── §B THE LEGACY TENDER + THE VIAL ──────────────────── */
console.log("\n§B the legacy Tender (Lv 4, cast freely before, spent nothing) and the condensing vial");
const L = await claimLegacy("Legacy Tender", 300, "runewright");
const unlockRowsBefore = db.prepare("SELECT COUNT(*) AS n FROM spell_unlocks WHERE owner_key = ?").get(L.ownerKey).n;
const ledgerKindsBefore = db.prepare("SELECT kind FROM spell_point_ledger WHERE owner_key = ?").all(L.ownerKey).map((r) => r.kind);
check("the legacy account has spent NOTHING and unlocked NOTHING — at most the free grant stands written for it (no grandfathered unlocks, no phantom spends)",
  unlockRowsBefore === 0 && ledgerKindsBefore.length <= 1 && ledgerKindsBefore.every((k) => k === "free"),
  `unlocks=${unlockRowsBefore} ledger=${JSON.stringify(ledgerKindsBefore)}`);
sp = await api("getSpellPoints", {}, L.token);
check("the first opening lays the free point: earned 1, available 1, every page still locked (no grandfathered unlocks)",
  sp.data.earned === 1 && sp.data.available === 1 && sp.data.unlocked.length === 0, JSON.stringify(sp.data).slice(0, 160));
const freeRows = db.prepare("SELECT kind FROM spell_point_ledger WHERE owner_key = ?").all(L.ownerKey);
check("the ledger holds exactly the one free-grant record", freeRows.length === 1 && freeRows[0].kind === "free", JSON.stringify(freeRows));
const LTile = await standTileOf(L.token);
const castSealLocked = await api("castMapWorking", { spellKey: "seal", tileId: LTile, dir: 0 }, L.token);
check("a page he cast freely before now refuses LOCKED (the Lv 3 gate already stands passed at Lv 4 — the refusal is the lock's words)",
  castSealLocked.status === 400 && errText(castSealLocked).includes("is locked — its page wakes for a spell point"),
  `status ${castSealLocked.status} ${errText(castSealLocked)}`);
const unlockSeal = await api("unlockGrimoireSpell", { spellKey: "seal" }, L.token);
check("the free point spends on the Seal: available 0, unlocked [seal]",
  unlockSeal.status === 200 && unlockSeal.data.available === 0 && JSON.stringify(unlockSeal.data.unlocked) === JSON.stringify(["seal"]),
  `status ${unlockSeal.status} ${JSON.stringify(unlockSeal.data).slice(0, 160)}`);
const unlockSealAgain = await api("unlockGrimoireSpell", { spellKey: "seal" }, L.token);
check("re-unlocking a woken page answers as it stands and charges nothing (already, available still 0)",
  unlockSealAgain.status === 200 && unlockSealAgain.data.already === true && unlockSealAgain.data.available === 0,
  `status ${unlockSealAgain.status} ${JSON.stringify(unlockSealAgain.data).slice(0, 140)}`);
const castSeal = await api("castMapWorking", { spellKey: "seal", tileId: LTile, dir: 0 }, L.token);
check("the unlocked Seal CASTS (a cast outcome — landed or fizzled — never the refusal)",
  castSeal.status === 200 && castSeal.data.ok === true, `status ${castSeal.status} ${JSON.stringify(castSeal.data).slice(0, 160)}`);
const castBladeLocked = await api("castMapWorking", { spellKey: "blade", tileId: LTile }, L.token);
check("a second page (Single Blade) refuses until point 2 is earned",
  castBladeLocked.status === 400 && errText(castBladeLocked).includes("is locked — its page wakes for a spell point"), `status ${castBladeLocked.status} ${errText(castBladeLocked)}`);
const unlockBladeEarly = await api("unlockGrimoireSpell", { spellKey: "blade" }, L.token);
check("unlocking it with no point ready refuses", unlockBladeEarly.status === 400, `status ${unlockBladeEarly.status}`);
setShadowMatter(L.ownerKey, 300);
let feed = await api("feedSpellVial", {}, L.token);
check("a click feeds as much as the stock holds when the stock is the lesser: fed 300 of 500, no condense, stock now 0",
  feed.status === 200 && feed.data.fed === 300 && feed.data.condensed === false && feed.data.vialFed === 300 && feed.data.shadowMatter === 0 && feed.data.available === 0,
  `status ${feed.status} ${JSON.stringify(feed.data).slice(0, 200)}`);
const feedEmpty = await api("feedSpellVial", {}, L.token);
check("feeding from an empty stock refuses in the book's words, and nothing moves",
  feedEmpty.status === 400 && errText(feedEmpty).includes("Shadow Matter stands empty"), `status ${feedEmpty.status} ${errText(feedEmpty)}`);
sp = await api("getSpellPoints", {}, L.token);
check("the partial feed PERSISTS across readings (vialFed still 300, earned still 1)",
  sp.data.vialFed === 300 && sp.data.earned === 1 && sp.data.nextPrice === 500, JSON.stringify(sp.data).slice(0, 160));
setShadowMatter(L.ownerKey, 500);
feed = await api("feedSpellVial", {}, L.token);
check("the completing click feeds only what the vial still needs: fed 200, CONDENSED, point 2 banked (available 1), vial emptied, 300 stock left standing",
  feed.status === 200 && feed.data.fed === 200 && feed.data.condensed === true && feed.data.earned === 2 && feed.data.available === 1 && feed.data.vialFed === 0 && feed.data.shadowMatter === 300,
  `status ${feed.status} ${JSON.stringify(feed.data).slice(0, 200)}`);
const condenseRows = db.prepare("SELECT kind, shadow_matter FROM spell_point_ledger WHERE owner_key = ? AND kind = 'condense'").all(L.ownerKey);
check("exactly ONE condensing record stands for the milestone, naming its 500 price (double-click/re-read safe)",
  condenseRows.length === 1 && condenseRows[0].shadow_matter === 500, JSON.stringify(condenseRows));
const stockDb = db.prepare("SELECT shadow_matter FROM tender_progress WHERE owner_key = ?").get(L.ownerKey).shadow_matter;
check("the stock was decremented by exactly the fed amounts (300 + 200 of the 800 seeded; 300 stands)",
  stockDb === 300, `stock=${stockDb}`);
sp = await api("getSpellPoints", {}, L.token);
check("the ladder serves point 3's price from the server's table: next 1000 toward point 3",
  sp.data.earned === 2 && sp.data.nextPrice === 1000 && sp.data.nextPoint === 3, JSON.stringify(sp.data).slice(0, 160));
const unlockBlade = await api("unlockGrimoireSpell", { spellKey: "blade" }, L.token);
check("point 2 spends on Single Blade: unlocked [seal, blade], available 0",
  unlockBlade.status === 200 && unlockBlade.data.available === 0 && JSON.stringify(unlockBlade.data.unlocked) === JSON.stringify(["seal", "blade"]),
  `status ${unlockBlade.status} ${JSON.stringify(unlockBlade.data).slice(0, 160)}`);
setShadowMatter(L.ownerKey, 1000);
feed = await api("feedSpellVial", {}, L.token);
check("point 3 condenses at its rung (1000): earned 3, and the ladder now serves point 4 at 2000 — points 1–4 read free/500/1000/2000 from the server's own answers",
  feed.status === 200 && feed.data.condensed === true && feed.data.earned === 3 && feed.data.nextPrice === 2000 && feed.data.nextPoint === 4,
  `status ${feed.status} ${JSON.stringify(feed.data).slice(0, 200)}`);
const healLockedL = await api("castMapWorking", { spellKey: "heal" }, L.token);
check("Heal refuses locked for the legacy Tender too, until its page is woken",
  healLockedL.status === 400 && errText(healLockedL).includes("Heal") && errText(healLockedL).includes("is locked — its page wakes for a spell point"), `status ${healLockedL.status} ${errText(healLockedL)}`);
const unlockHeal = await api("unlockGrimoireSpell", { spellKey: "heal" }, L.token);
const healOpen = await api("castMapWorking", { spellKey: "heal" }, L.token);
check("once Heal's page is woken for a point, the cast door passes the lock (it now asks for its standing Awokin, as Heal always did)",
  unlockHeal.status === 200 && healOpen.status === 400 && errText(healOpen).includes("name it") && !errText(healOpen).includes("is locked"),
  `unlock ${unlockHeal.status}; cast ${healOpen.status} ${errText(healOpen)}`);

/* ── §C THE DOOR'S SPELL STANDS OUTSIDE ───────────────── */
console.log("\n§C the door's granted spell — castable by its own record, no unlock, no point");
const pngFor = (r, g, b) => sharp({ create: { width: 750, height: 971, channels: 4, background: { r, g, b, alpha: 1 } } }).png().toBuffer();
const fixtureAssets = [];
{
  const pieces = [
    ["Vial Backdrop", "background", null, null, "root", 40, 34, 28],
    ["Vial Body", "body", 3, 3, "root", 90, 120, 70],
    ["Vial Arms", "arms", 2, 2, "sky", 90, 110, 150],
    ["Vial Head", "head", 2, 3, "stone", 150, 120, 80],
  ];
  for (const [name, category, power, toughness, element, r, g, b] of pieces) {
    const key = `vial-fixtures/${name}.png`;
    blobs.put(key, await pngFor(r, g, b), "image/png");
    const id = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)")
      .run(name, category, power, toughness, element, key, Date.now()).lastInsertRowid);
    fixtureAssets.push({ id, name, category, power, toughness });
  }
}
const fixtureRefs = () => fixtureAssets.map((a) => ({ source_id: `db:${a.id}`, name: a.name, category: a.category, rarity: "common", power: a.power, toughness: a.toughness }));
const trioItems = async () => {
  const img = (await pngFor(120, 100, 80)).toString("base64");
  return [0, 1, 2].map(() => ({ layers: fixtureRefs(), imageBase64: img }));
};
const door = await api("claimTender", { password: PW, tenderName: "Vial Door Tender", entrance: true });
check("the entrance claim is marked", door.status === 200 && door.data.entrance === true, `status ${door.status}`);
const doorToken = door.data.token;
await api("entranceChooseClass", { classKey: "witch" }, doorToken);
await api("entranceChooseSpell", { spellKey: "shardrain" }, doorToken);
await api("chooseWeapon", { weaponKey: "sword" }, doorToken);
const woke = await api("entranceWakeThree", { items: await trioItems() }, doorToken);
check("the three wake at the door", woke.status === 200 && woke.data.awakened?.length === 3, `status ${woke.status}`);
const doorKey = `tender:${tenderIdOf(door.data)}`;
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 500, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500").run(doorKey, Date.now());
const doorTile = await standTileOf(doorToken);
const doorSpBefore = await api("getSpellPoints", {}, doorToken);
const castDoor = await api("castMapWorking", { spellKey: "shardrain", tileId: doorTile }, doorToken);
check("Shard Rain CASTS at Lv 1 by the door's grant (a cast outcome, never a refusal)",
  castDoor.status === 200 && castDoor.data.ok === true, `status ${castDoor.status} ${JSON.stringify(castDoor.data).slice(0, 160)}`);
const doorSpAfter = await api("getSpellPoints", {}, doorToken);
check("the grant consumed NOTHING: no unlock written, the free point still stands unspent, the ladder untouched",
  doorSpBefore.data.unlocked.length === 0 && doorSpAfter.data.unlocked.length === 0 && doorSpAfter.data.available === 1 && doorSpAfter.data.earned === 1,
  `before ${JSON.stringify(doorSpBefore.data).slice(0, 120)} after ${JSON.stringify(doorSpAfter.data).slice(0, 120)}`);
const castOtherDoor = await api("castMapWorking", { spellKey: "seal", tileId: doorTile, dir: 0 }, doorToken);
check("another working still refuses for the door Tender in the standing Lv 3 words (Push 54's assertion stands whole)",
  castOtherDoor.status === 400 && errText(castOtherDoor).includes("wake at Tender Lv 3"), `status ${castOtherDoor.status} ${errText(castOtherDoor)}`);
const unlockDoorSpell = await api("unlockGrimoireSpell", { spellKey: "shardrain" }, doorToken);
check("the book refuses to sell the door's grant back to its holder (no point can be spent on it)",
  unlockDoorSpell.status === 400 && errText(unlockDoorSpell).includes("granted at the door"), `status ${unlockDoorSpell.status} ${errText(unlockDoorSpell)}`);

/* ── §D THE TABLE ─────────────────────────────────────── */
console.log("\n§D the Table — one unlock state, both grounds");
const TT = await claimLegacy("Vial Table Tender", 3800, "runewright");
for (let i = 0; i < 22; i++) seedAwokin(TT.ownerKey, "Vial Table Tender", `Table Bench ${i + 1}`, 2);
const { issueTableToken } = await import("../server/dist/table.js");
const tt = issueTableToken({ id: "disc-vial-table", name: "Vial Table Tender" });
const bindCode = (await api("getTableBindCode", {}, TT.token)).data.code;
const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
check("the Table seat binds", bindRes.ok, `status ${bindRes.status}`);
class Actor {
  constructor() { this.state = null; this.you = null; this.errors = []; }
  async join(token, room) {
    this.ws = new WebSocket(`ws://127.0.0.1:39977/table/ws`);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data));
        if (m.type === "state") { this.state = m.state; this.you = m.you; }
        else if (m.type === "error") this.errors.push(String(m.message ?? ""));
      } catch { /* torn frame */ }
    };
    this.ws.send(JSON.stringify({ type: "join", authToken: token, room }));
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
}
const waitFor = async (fn, what, ms = 25000) => {
  const s = Date.now();
  while (Date.now() - s < ms) { if (fn()) return true; await sleep(150); }
  throw new Error("drive wait: " + what);
};
const actor = new Actor();
await actor.join(tt, "spell-points");
await waitFor(() => !!actor.you, "the Table seat");
check("the seat's payload carries the ledger: unlockedSpells an (empty) array, startingSpellKey null on the old road",
  Array.isArray(actor.you.unlockedSpells) && actor.you.unlockedSpells.length === 0 && actor.you.startingSpellKey === null,
  JSON.stringify({ u: actor.you.unlockedSpells, s: actor.you.startingSpellKey }));
actor.send({ type: "startWave" });
await sleep(600);
// The cast doors judge before any target is read, so the
// locked refusals are proven against plain board hexes;
// the unlocked writing is proven on the hexes nearest the
// board's heart, inside the caster's ring.
const boardHexes = (actor.state?.map ?? [])
  .slice()
  .sort((a, b) => (Math.abs(a.q) + Math.abs(a.r)) - (Math.abs(b.q) + Math.abs(b.r)))
  .map((t) => t.id);
check("the board stands with hexes to write on", boardHexes.length > 10, `hexes=${boardHexes.length}`);
const aHex = boardHexes[0];
actor.errors.length = 0;
actor.send({ type: "castRune", root: "blade", hexes: [aHex] });
await waitFor(() => actor.errors.some((e) => e.includes("is locked")), "the locked rune refusal");
check("castRune refuses the un-unlocked Blade at the Table, in the book's words",
  actor.errors.some((e) => e.includes("is locked — its page wakes for a spell point")),
  JSON.stringify(actor.errors.slice(-2)));
actor.errors.length = 0;
actor.send({ type: "castHeal", hex: aHex });
await waitFor(() => actor.errors.some((e) => e.includes("is locked")), "the locked heal refusal");
check("castHeal refuses the un-unlocked Heal at the Table",
  actor.errors.some((e) => e.includes("Heal") && e.includes("is locked")), JSON.stringify(actor.errors.slice(-2)));
actor.errors.length = 0;
actor.send({ type: "castWard", root: "seal", hexA: boardHexes[0], hexB: boardHexes[1] });
await waitFor(() => actor.errors.some((e) => e.includes("is locked")), "the locked ward refusal");
check("castWard refuses the un-unlocked Seal at the Table",
  actor.errors.some((e) => e.includes("is locked — its page wakes for a spell point")), JSON.stringify(actor.errors.slice(-2)));
const unlockBladeTable = await api("unlockGrimoireSpell", { spellKey: "blade" }, TT.token);
check("the free point unlocks the Blade from the book (the homeland door serves the Table seat's Tender)",
  unlockBladeTable.status === 200 && unlockBladeTable.data.available === 0, `status ${unlockBladeTable.status}`);
let bladeW = null;
for (let i = 0; i < 40 && !bladeW; i++) {
  const hex = boardHexes[i % boardHexes.length];
  actor.send({ type: "castRune", root: "blade", hexes: [hex] });
  const s = Date.now();
  while (Date.now() - s < 1200) {
    const w = (actor.state?.workings ?? []).find((x) => x.root === "blade" && x.ownerKey === actor.you.key);
    if (w) { bladeW = w; break; }
    await sleep(120);
  }
}
check("once unlocked, the Blade WRITES at the Table (fizzles honestly retried)", !!bladeW, JSON.stringify(actor.errors.slice(-2)));
actor.ws.close();

/* ── §E THE BROWSER — THE GOLD BUTTON + VIAL ──────────── */
console.log("\n§E the browser — the gold button and the vial in the real book");
const B = await claimLegacy("Vial Browser Tender", 300, "runewright");
await standTileOf(B.token);
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, B.token);
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
await sleep(3000);
const domClick = async (find) => {
  const done = await page.evaluate((f) => {
    const b = f.kind === "text"
      ? [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === f.text)
      : document.querySelector(f.selector);
    if (!b) return false;
    b.click();
    return true;
  }, find);
  if (!done) throw new Error(`no clickable ${JSON.stringify(find)}`);
};
const clickText = async (text) => domClick({ kind: "text", text });
await page.waitForSelector(".deck-button", { timeout: 30000 });
await page.click(".deck-button");
await sleep(2500);
// The First Seed's story panel stands over the map on a
// first opening — tend on past it, as a player does.
await domClick({ kind: "text", text: "Tend on" }).catch(() => {});
await sleep(800);
await page.waitForSelector('button[aria-label="The Skill Zodiac"]', { timeout: 30000 });
await domClick({ kind: "css", selector: 'button[aria-label="The Skill Zodiac"]' });
await page.waitForSelector(".zodiac-overlay", { timeout: 30000 });
await clickText("Grimoire");
await page.waitForSelector(".book", { timeout: 30000 });
await clickText("Spells");
await page.waitForSelector(".spell-point-bar", { timeout: 30000 });
const barText1 = await page.$eval(".spell-point-bar", (el) => el.textContent.replace(/\s+/g, " ").trim());
check("the gold button counts the free point and the vial stands EMPTY toward point 2 at 500",
  barText1.includes("1 spell point") && barText1.includes("0 / 500"), barText1);
// The First Seed's story panel stands over the map on a
// first opening and outlives the book's opening — tend on
// past it before each shot, as a player does, so the book
// is what the screenshots show.
const clearStage = async () => {
  for (let i = 0; i < 4; i++) {
    const left = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Tend on");
      if (!b) return false;
      b.click();
      return true;
    });
    if (!left) break;
    await sleep(700);
  }
};
const shot = async (el, name) => { await clearStage(); await el.screenshot({ path: join(OUT, name) }); };
await shot(await page.$(".zodiac-overlay"), "01-vial-empty.png");
setShadowMatter(B.ownerKey, 300);
await domClick({ kind: "css", selector: ".spell-vial" });
await page.waitForFunction(() => document.querySelector(".spell-vial-words")?.textContent.includes("300 / 500"), { timeout: 30000 });
const barText2 = await page.$eval(".spell-point-bar", (el) => el.textContent.replace(/\s+/g, " ").trim());
check("a real CLICK on the vial fed it the whole stock (300 of 500 — the vial stands part-full)",
  barText2.includes("300 / 500") && barText2.includes("you hold 0"), barText2);
await shot(await page.$(".zodiac-overlay"), "02-vial-part-full.png");
setShadowMatter(B.ownerKey, 500);
await domClick({ kind: "css", selector: ".spell-vial" });
await page.waitForFunction(() => document.querySelector(".spell-point-count")?.textContent.includes("2 spell points"), { timeout: 30000 });
const barText3 = await page.$eval(".spell-point-bar", (el) => el.textContent.replace(/\s+/g, " ").trim());
check("the completing click banked point 2: the gold button reads 2 and the vial stands empty toward point 3 at 1000",
  barText3.includes("2 spell points") && barText3.includes("0 / 1000"), barText3);
await shot(await page.$(".zodiac-overlay"), "03-milestone-banked.png");
const spB = await api("getSpellPoints", {}, B.token);
check("the browser's clicks and the server's ledger agree (earned 2, vialFed 0, stock 300)",
  spB.data.earned === 2 && spB.data.vialFed === 0 && spB.data.shadowMatter === 300, JSON.stringify(spB.data).slice(0, 160));
// A locked page's face: turn from the index to the first page.
await page.evaluate(() => { document.querySelector(".book-index-row")?.click(); });
await page.waitForFunction(() => document.querySelector(".book-page")?.textContent.includes("Locked — this page wakes for 1 spell point"), { timeout: 30000 });
await shot(await page.$(".zodiac-overlay"), "04-page-locked.png");
await page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Unlock this page"))?.click(); });
await page.waitForFunction(() => !!document.querySelector(".book-page .attune-orbs"), { timeout: 30000 });
const countAfterUnlock = await page.$eval(".spell-point-count", (el) => el.textContent.trim());
check("clicking the page's unlock spent the point in the real book (orbs stand where the lock stood; the button falls to 1)",
  countAfterUnlock.includes("1 spell point"), countAfterUnlock);
await shot(await page.$(".zodiac-overlay"), "05-page-unlocked.png");
await browser.close();

console.log(`\n══ SPELL POINTS DRIVE: ${pass} passed, ${fail} failed ══`);
process.exit(fail ? 1 : 0);
