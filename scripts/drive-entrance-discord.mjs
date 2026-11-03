// drive-entrance-discord — ENTRANCE BUILD 3: THE DISCORD DOOR.
// Nigel's rulings of 2026-11-01 ("the same entrance applies on
// the homeland and in Discord"); the programme's third build.
//
//   §S SOURCE SEAMS: the Table's cast gates read the door's
//      grant; the seat carries it and the wheel offers it;
//      TableIntro claims with the entrance ask and walks the
//      door's own actions, with the old road kept beside it.
//   §A THE DOOR, LIVED AT THE API (a Discord-shaped claim):
//      the mark, the order enforced (wake-before-choose and
//      weapon-before-spell refused in the door's own words),
//      the spell restricted to the three, the trio FREE (no
//      ledger rows, no wake XP, pool 20), the greeter first.
//   §B THE CAST-GATE GAP, CLOSED: the same account seated at
//      the Table (a raw-socket bound seat) — its chosen Shard
//      Rain CASTS at Lv 1 (a working stands, or the roll
//      honestly unravels — never the Lv 3 refusal), while a
//      non-chosen rune AND a non-chosen ward are refused in
//      the standing Lv 3 words. The seat's payload carries
//      the grant (startingSpellKey) beside wardRuneUnlocked.
//   §C ONE ACCOUNT, ONE DOOR: after the Discord walk, the
//      homeland reading shows the door DONE — no second trio
//      can be woken, no second grant laid.
//   §D THE DOOR IN A REAL BROWSER (screenshots →
//      entrance-discord-proof/; the plain-ceremony shots →
//      entrance-ceremony-proof/): RoomSeat's intro — the
//      Discord door's class, spell and weapon steps, the
//      wake step standing PLAIN (its button alone), the
//      PLAIN MIRRORED CEREMONY (the standing ceremony,
//      three cards instead of one — three whispers, no
//      text of its own), the party gathered, the seating
//      in the room — and the ledger agreeing. (The Test
//      Ground tab's door keeps the old face whole; the
//      standing intro drive walks that one.)
//   §E THE OLD ROAD AT THIS DOOR: a pre-entrance Tender
//      binding by the login road walks NO door steps and
//      seats bound as she always did; and a claim carrying
//      an already-welcomed soft visitor is NOT marked even
//      asking for the entrance (it routes to the old road).
//
// The Discord OAuth exchange itself stands on its production
// use (as in drive-discord-intro-door): seat tokens are minted
// with the server's own issueTableToken, downstream of it.
//
// Run after `npm run build`:
//   PUPPETEER_CACHE_DIR=$HOME/workspace/tools-chrome/.cache node scripts/drive-entrance-discord.mjs
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
const OUT = "/home/hatch/workspace/entrance-discord-proof";
mkdirSync(OUT, { recursive: true });
const PLAIN_OUT = "/home/hatch/workspace/entrance-ceremony-proof";
mkdirSync(PLAIN_OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-entrance-discord-"));
process.env.PORT = "3973";
// Discord CONFIGURED (dummy keys) — the production door shape;
// seat tokens are minted by the server's own issueTableToken.
process.env.DISCORD_CLIENT_ID = "entrance-discord-drive-dummy";
process.env.DISCORD_CLIENT_SECRET = "entrance-discord-drive-secret";
delete process.env.RESEND_API_KEY;
process.chdir(root);
const BASE = "http://127.0.0.1:3973";
const PW = "entrance-discord-password";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const realNow = Date.now;

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};
const errText = (r) => String(r.data?.error ?? r.data?.message ?? "");

/* ── §S SOURCE SEAMS ──────────────────────────────────── */
console.log("§S the seams in the sources");
const tableSrv = readFileSync(join(root, "server/src/table.ts"), "utf8");
const tableCli = readFileSync(join(root, "client/src/Table.tsx"), "utf8");
const introCli = readFileSync(join(root, "client/src/TableIntro.tsx"), "utf8");
ok("§S the Table's cast gates read the door's grant (both doors: def.key !== caster.startingSpellKey)",
  (tableSrv.match(/def\.key !== caster\.startingSpellKey/g) ?? []).length === 2);
ok("§S the seat is made carrying the grant (entranceSpellKeyFor read at the seat's making)",
  tableSrv.includes("boundDoorSpellKey = entranceSpellKeyFor(expKey)")
  && tableSrv.includes("startingSpellKey: player.startingSpellKey ?? null"));
ok("§S the Table wheel offers the granted spell below Lv 3 (the castLocked reading)",
  tableCli.includes("key !== (you?.startingSpellKey ?? null)") && tableCli.includes("startingSpellKey?: string | null"));
ok("§S TableIntro claims WITH the entrance ask and walks the door's own actions",
  introCli.includes("entrance: true") && introCli.includes("api.entranceChooseClass")
  && introCli.includes("api.entranceChooseSpell") && introCli.includes("api.entranceWakeThree"));
ok("§S the routing reads the server's truth (getEntranceStatus decides door vs old road)",
  introCli.includes("routeAfterBind") && introCli.includes("api.getEntranceStatus()"));
ok("§S the old road stands beside the door (seedWelcome + the real ClassChoosing, for the unmarked)",
  introCli.includes("seedWelcome") && introCli.includes('from "./ClassChoosing"'));

/* ── BOOT + FIXTURES ──────────────────────────────────── */
await import("../server/dist/index.js");
await sleep(2500);
const { issueTableToken } = await import("../server/dist/table.js");
const { blobs } = await import("../server/dist/store.js");
const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up, as the other drives do */ }

async function api(action, args, token, visitorId) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}), ...(visitorId ? { "x-visitor-id": visitorId } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
async function pathRaw(path, args, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

const pngFor = (r, g, b) => sharp({ create: { width: 750, height: 971, channels: 4, background: { r, g, b, alpha: 1 } } }).png().toBuffer();
const fixtureAssets = [];
{
  const pieces = [
    ["Discord Backdrop", "background", null, null, "root", 40, 34, 28],
    ["Discord Body", "body", 3, 3, "root", 90, 120, 70],
    ["Discord Arms", "arms", 2, 2, "sky", 90, 110, 150],
    ["Discord Head", "head", 2, 3, "stone", 150, 120, 80],
  ];
  for (const [name, category, power, toughness, element, r, g, b] of pieces) {
    const key = `entrance-discord-fixtures/${name}.png`;
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

/* ── SOCKET HELPERS ───────────────────────────────────── */
class Actor {
  constructor() { this.state = null; this.you = null; this.joinErrors = []; this.errors = []; }
  async join(join, room) {
    this.ws = new WebSocket("ws://127.0.0.1:3973/table/ws");
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data));
        if (m.type === "state") { this.state = m.state; if (m.you) this.you = m.you; }
        else if (m.type === "joinError") this.joinErrors.push(m);
        else if (m.type === "error") this.errors.push(String(m.message ?? ""));
      } catch { /* torn frame */ }
    };
    this.send({ type: "join", room, ...join });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  close() { try { this.ws.close(); } catch { /* already gone */ } }
}
async function waitFor(what, cond, ms = 25000) {
  const s = realNow();
  while (realNow() - s < ms) { let v = false; try { v = cond(); } catch { v = false; } if (v) return true; await sleep(150); }
  console.log("  .. waited out:", what);
  return false;
}

/* ── §A THE DOOR, LIVED AT THE API ────────────────────── */
console.log("§A a Discord-shaped claim walks the entrance in order");
const claim = await api("claimTender", { password: PW, tenderName: "Discord Door Tender", entrance: true }, null, "disc-visitor-a");
ok("§A the claim asking for the entrance is marked (entrance: true rides the answer)",
  claim.status === 200 && claim.data.entrance === true, JSON.stringify(claim.data).slice(0, 140));
const token = claim.data.token;
const doorId = db.prepare("SELECT id FROM tenders WHERE tender_name = ?").get("Discord Door Tender").id;
const doorKey = `tender:${doorId}`;

const earlyWake = await api("entranceWakeThree", { items: await trioItems() }, token);
ok("§A WAKE-BEFORE-CHOOSE REFUSED at the class step, in the door's words",
  earlyWake.status === 400 && errText(earlyWake).includes("class, spell, and weapon come before the waking"),
  `status ${earlyWake.status} ${errText(earlyWake)}`);
const cls = await api("entranceChooseClass", { classKey: "runewright" }, token);
ok("§A the class step lands through the door's own action", cls.status === 200 && cls.data.classKey === "runewright",
  `status ${cls.status} ${JSON.stringify(cls.data).slice(0, 120)}`);
const weaponEarly = await api("chooseWeapon", { weaponKey: "sword" }, token);
ok("§A WEAPON-BEFORE-SPELL REFUSED inside the standing chooseWeapon (the door's order)",
  weaponEarly.status === 400 && errText(weaponEarly).includes("choose your spell first"),
  `status ${weaponEarly.status} ${errText(weaponEarly)}`);
const badSpell = await api("entranceChooseSpell", { spellKey: "seal" }, token);
ok("§A the spell is restricted to Nigel's three (a fourth is refused, naming them)",
  badSpell.status === 400 && errText(badSpell).includes("Bats, Shard Rain, or Rune Hold"),
  `status ${badSpell.status} ${errText(badSpell)}`);
const spell = await api("entranceChooseSpell", { spellKey: "shardrain" }, token);
ok("§A the spell step lands: Shard Rain, by the door's name for it",
  spell.status === 200 && spell.data.spellKey === "shardrain" && spell.data.name === "Shard Rain",
  `status ${spell.status} ${JSON.stringify(spell.data).slice(0, 120)}`);
const weapon = await api("chooseWeapon", { weaponKey: "arrow" }, token);
ok("§A the weapon step lands through the standing chooseWeapon", weapon.status === 200 && weapon.data.weaponKey === "arrow",
  `status ${weapon.status} ${JSON.stringify(weapon.data).slice(0, 120)}`);
const woke = await api("entranceWakeThree", { items: await trioItems() }, token);
ok("§A the three wake at once", woke.status === 200 && (woke.data.awakened ?? []).length === 3,
  `status ${woke.status} ${JSON.stringify(woke.data).slice(0, 140)}`);
const trioIds = (woke.data.awakened ?? []).map((a) => a.id);
const expA = await api("getTenderExp", {}, token);
const stA = await api("getEntranceStatus", {}, token);
ok("§A the trio are FREE: no wake XP, still Lv 1, the pool reads 20 with 0 spendable, the door is done",
  expA.data.totalExp === 0 && expA.data.level === 1 && stA.data.step === "done"
  && stA.data.awardPool === 20 && stA.data.spendableCredits === 0 && expA.data.startingSpellKey === "shardrain",
  JSON.stringify({ exp: expA.data, st: stA.data }).slice(0, 260));
const ledgerA = db.prepare("SELECT delta FROM credit_ledger WHERE user_id = ?").all(doorKey);
ok("§A the credit ledger holds NO rows for the entrance account — no grant, no spend",
  ledgerA.length === 0, JSON.stringify(ledgerA));
const greeterA = db.prepare("SELECT id, greeter FROM awakened WHERE owner_key = ? ORDER BY id").all(doorKey);
ok("§A the greeter mark stands on the FIRST of the three, and no other",
  greeterA.length === 3 && greeterA[0].greeter === 1 && greeterA[1].greeter === 0 && greeterA[2].greeter === 0
  && greeterA[0].id === trioIds[0], JSON.stringify(greeterA));
for (const id of trioIds) await api("addToParty", { awakenedId: id }, token);

/* ── §B THE TABLE CAST — THE GAP, CLOSED ──────────────── */
console.log("§B the chosen spell casts at the Table at Lv 1; the unchosen still wake at Lv 3");
const DISC_X = "disc-entrance-x";
{
  const bindRes = await fetch(`${BASE}/api/table/bind-intro`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: issueTableToken({ id: DISC_X, name: "Entrance X on Discord" }), tenderToken: token }),
  });
  ok("§B the binding takes (both proofs)", bindRes.status === 200, `status ${bindRes.status}`);
}
const seat = new Actor();
await seat.join({ authToken: issueTableToken({ id: DISC_X, name: "Entrance X on Discord" }) }, "entrance-cast-room");
ok("§B the seat stands BOUND to the door Tender", await waitFor("the bound seat", () => seat.you?.bound === "Discord Door Tender"),
  JSON.stringify(seat.you?.bound ?? seat.joinErrors));
ok("§B the seat's payload carries the grant: startingSpellKey = shardrain, wardRuneUnlocked false, Lv 1",
  seat.you?.startingSpellKey === "shardrain" && seat.you?.wardRuneUnlocked === false && seat.you?.tenderLevel === 1,
  JSON.stringify({ ss: seat.you?.startingSpellKey, wru: seat.you?.wardRuneUnlocked, lv: seat.you?.tenderLevel }));
const myHex = await waitFor("my stand on the board", () => {
  const me = (seat.state?.players ?? []).find((p) => p.key === seat.you?.key);
  return me?.hex ? me.hex : null;
}).then(async () => (seat.state?.players ?? []).find((p) => p.key === seat.you?.key)?.hex ?? null);
ok("§B the seat stands on the board (a hex of its own)", typeof myHex === "string" && myHex.length > 0, String(myHex));

seat.errors.length = 0;
seat.send({ type: "castRune", root: "shatter", hexes: [myHex] });
ok("§B a NON-CHOSEN rune is refused at the Table in the standing words (Runes wake at Lv 3)",
  await waitFor("the shatter refusal", () => seat.errors.some((e) => e.includes("Runes wake at Tender Lv 3 — you stand at Lv 1"))),
  JSON.stringify(seat.errors));
seat.errors.length = 0;
seat.send({ type: "castWard", root: "bulwark" });
ok("§B a NON-CHOSEN ward is refused at the Table in the standing words (Wards wake at Lv 3)",
  await waitFor("the bulwark refusal", () => seat.errors.some((e) => e.includes("Wards wake at Tender Lv 3 — you stand at Lv 1"))),
  JSON.stringify(seat.errors));
seat.errors.length = 0;
seat.send({ type: "castRune", root: "shardrain", hexes: [myHex] });
const castLanded = await waitFor("the Shard Rain cast resolves (working stands, or the roll unravels)",
  () => (seat.state?.workings ?? []).some((w) => w.root === "shardrain")
    || (seat.state?.tale ?? []).some((t) => String(t.text ?? "").includes("Shard Rain unravels")), 30000);
ok("§B THE CHOSEN SPELL CASTS AT LV 1 AT THE TABLE (never the Lv 3 refusal)",
  castLanded && !seat.errors.some((e) => e.includes("Lv 3")),
  JSON.stringify({ errors: seat.errors, workings: (seat.state?.workings ?? []).map((w) => w.root) }));
seat.close();

/* ── §C ONE ACCOUNT, ONE DOOR ─────────────────────────── */
console.log("§C the homeland reads the Discord walk as the door, done");
const stC = await api("getEntranceStatus", {}, token);
ok("§C the entrance status reads done — the homeland door will not re-run",
  stC.data.entrance === true && stC.data.step === "done" && stC.data.spellKey === "shardrain",
  JSON.stringify(stC.data).slice(0, 160));
const wokeAgain = await api("entranceWakeThree", { items: await trioItems() }, token);
ok("§C a second trio is refused (the door wakes them once — the step guard or the standing-three guard answers)",
  wokeAgain.status === 400
  && (errText(wokeAgain).includes("already stand") || errText(wokeAgain).includes("come before the waking"))
  && db.prepare("SELECT COUNT(*) AS n FROM awakened WHERE owner_key = ?").get(doorKey).n === 3,
  `status ${wokeAgain.status} ${errText(wokeAgain)}`);
const ledgerC = db.prepare("SELECT delta FROM credit_ledger WHERE user_id = ?").all(doorKey);
ok("§C still no credit rows — no second grant was laid by either face", ledgerC.length === 0, JSON.stringify(ledgerC));

/* ── BROWSER HELPERS ──────────────────────────────────── */
// The Discord-shaped arrival lands on the shell's Room tab —
// RoomSeat — whose doors ARE this build's face (the Test
// Ground tab keeps the old Table door whole; the standing
// intro drive walks that face). A prepared session with no
// Tender token on this browser stands RoomSeat at the intro
// directly. Each walk gets its OWN browser context: RoomSeat
// reads this browser's Tender token, and one walk's sign-in
// must never stand in for another's.
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio"] });
async function doorPage(session) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror:entrance-discord]", String(e).slice(0, 240)));
  await page.evaluateOnNewDocument((s) => { window.__awokenTableSession = s; }, session);
  await page.goto(`${BASE}/table?frame_id=entrance-discord-drive`, { waitUntil: "domcontentloaded", timeout: 60000 });
  return page;
}
const pageText = (page) => page.evaluate(() => document.body.innerText);
async function clickButtonWithText(page, text, ms = 25000) {
  const found = await page.waitForFunction(
    (t) => [...document.querySelectorAll("button")].some((b) => (b.textContent || "").includes(t) && !b.disabled),
    { timeout: ms }, text).then(() => true).catch(() => false);
  if (!found) return false;
  return page.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").includes(t) && !x.disabled);
    if (b) { b.click(); return true; }
    return false;
  }, text);
}
async function clickButtonExactText(page, text, ms = 25000) {
  const found = await page.waitForFunction(
    (t) => [...document.querySelectorAll("button")].some((b) => (b.textContent || "").trim() === t && !b.disabled),
    { timeout: ms }, text).then(() => true).catch(() => false);
  if (!found) return false;
  return page.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim() === t && !x.disabled);
    if (b) { b.click(); return true; }
    return false;
  }, text);
}
async function waitText(page, text, ms = 25000) {
  return page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: ms }, text)
    .then(() => true).catch(() => false);
}
const seatFor = (id, name, bound, tenderName = null, room = "entrance-discord-room") => ({
  authToken: issueTableToken({ id, name }), room, name, bound, tenderName,
});

/* ── §D THE DOOR IN A REAL BROWSER ────────────────────── */
console.log("§D the Discord door, walked in the browser (screenshots → entrance-discord-proof/)");
{
  const page = await doorPage(seatFor("disc-entrance-d", "Entrance D on Discord", false));
  // The prepared session stands RoomSeat at the intro: the
  // claim form itself is the first thing the visitor meets.
  await page.waitForSelector("#intro-name", { timeout: 30000 });
  ok("§D the claim form stands at the Discord door (name + password before anything)",
    (await pageText(page)).includes("Choose your name and a password"));
  await page.type("#intro-name", "Browser Door Tender");
  await page.type("#intro-password", PW);
  await page.type("#intro-confirm", PW);
  ok("§D the claim is spoken (Begin as a Tender)", await clickButtonWithText(page, "Begin as a Tender"));
  ok("§D THE DOOR OPENS AT ITS CLASS STEP (choosing BEFORE any waking)",
    await waitText(page, "First — what manner of tender are you?"));
  const classText = await pageText(page);
  ok("§D no waking stands before the choosing (the old order is gone from this door)",
    !classText.includes("Wake your first three Awokin") && classText.includes("Choose the Warden"),
    classText.slice(0, 300));
  await page.screenshot({ path: `${OUT}/01-class-step.png` });
  ok("§D a class is chosen (the Warden)", await clickButtonWithText(page, "Choose the Warden"));
  ok("§D the SPELL STEP follows the class", await waitText(page, "Now — choose your spell"));
  const spellText = await pageText(page);
  ok("§D the spell step shows exactly Nigel's three (Bats, Shard Rain, Rune Hold)",
    spellText.includes("Choose Bats") && spellText.includes("Choose Shard Rain") && spellText.includes("Choose Rune Hold"),
    spellText.slice(0, 300));
  await page.screenshot({ path: `${OUT}/02-spell-step.png` });
  ok("§D the spell is chosen (Bats)", await clickButtonWithText(page, "Choose Bats"));
  ok("§D the WEAPON STEP follows the spell", await waitText(page, "And your favourite weapon"));
  await page.screenshot({ path: `${OUT}/03-weapon-step.png` });
  ok("§D the weapon is named (the Spear)", await clickButtonExactText(page, "Take the Spear"));
  ok("§D the WAKE STEP follows", await waitText(page, "Wake the three"));
  const wakeStepText = await page.$eval(".table-intro", (el) => el.innerText).catch(() => "");
  ok("§D the wake step stands PLAIN — its button alone, none of the struck text (no heading, no pool speech, no BOOM)",
    wakeStepText.includes("Wake the three") && !wakeStepText.includes("The waking")
      && !wakeStepText.includes("award pool") && !wakeStepText.includes("BOOM"),
    wakeStepText.slice(0, 300));
  await page.screenshot({ path: `${OUT}/04-wake-step.png` });
  await page.screenshot({ path: `${PLAIN_OUT}/discord-wake-step.png` });
  ok("§D the waking is spoken (Wake the three)", await clickButtonWithText(page, "Wake the three"));
  const ceremonyShown = await page.waitForFunction(
    () => !!document.querySelector(".entrance-ceremony")
      && document.querySelectorAll(".entrance-trio-one").length === 3,
    { timeout: 60000 }).then(() => true).catch(() => false);
  ok("§D THE PLAIN CEREMONY: three cards stand TOGETHER at the Discord door — the standing ceremony, three cards instead of one",
    ceremonyShown, (await pageText(page)).slice(0, 300));
  const ceremonyText = await page.$eval(".entrance-ceremony", (el) => el.innerText).catch(() => "");
  ok("§D the ceremony carries NO text of its own around the cards (no BOOM, no heading — the cards and their whispers are the whole of it)",
    !ceremonyText.includes("BOOM") && !ceremonyText.includes("Three wake at once"),
    ceremonyText.slice(0, 300));
  await sleep(1200);
  await page.screenshot({ path: `${OUT}/05-three-card-ceremony.png` });
  for (const [label, needle] of [
    ["whisper 1 (held by attention) lands under the first card", "scattered matter, held together by your attention"],
    ["whisper 2 (its element — Root, by the fixtures) lands under the second", "Root runs through me"],
    ["whisper 3 (eyes to the beacon) lands under the third", "A starseed waits there"],
  ]) {
    const spoken = await page.waitForFunction(
      (n) => [...document.querySelectorAll(".entrance-whisper")].some((el) => (el.textContent || "").includes(n)),
      { timeout: 25000 }, needle).then(() => true).catch(() => false);
    ok(`§D ${label}`, spoken);
  }
  await page.screenshot({ path: `${PLAIN_OUT}/discord-ceremony.png` });
  ok("§D the ceremony's end gathers the party", await clickButtonWithText(page, "Gather your party"));
  // RoomSeat's completion is the seating itself: the intro
  // hands back to the carried door, and the room opens on
  // her own land with her party standing in its panel.
  const seatedShown = await page.waitForSelector(".room-seat", { timeout: 40000 }).then(() => true).catch(() => false);
  ok("§D SHE IS SEATED IN THE ROOM (the intro's completion — the room opens on her land)",
    seatedShown && await waitText(page, "The party at this Table", 20000),
    (await pageText(page)).slice(0, 300));
  await page.screenshot({ path: `${OUT}/06-seated-in-the-room.png` });
  const tenderD = db.prepare("SELECT * FROM tenders WHERE tender_name = ?").get("Browser Door Tender");
  const kinD = db.prepare("SELECT * FROM awakened WHERE owner_key = ? ORDER BY id").all(`tender:${tenderD.id}`);
  const visitorD = db.prepare("SELECT entrance, entrance_step, entrance_spell, entrance_award_pool FROM visitors WHERE visitor_id = ?").get(`tender:${tenderD.id}`);
  ok("§D the ledger agrees: marked at claim, step done, Bats recorded, pool 20",
    visitorD?.entrance === 1 && visitorD?.entrance_step === "done" && visitorD?.entrance_spell === "bats"
    && visitorD?.entrance_award_pool === 20, JSON.stringify(visitorD));
  ok("§D the trio stand woken by the door (the first the greeter), and as her party",
    kinD.length === 3 && kinD[0].greeter === 1
    && db.prepare("SELECT awakened_id FROM tender_party WHERE owner_key = ? ORDER BY awakened_id").all(`tender:${tenderD.id}`)
      .map((r) => r.awakened_id).join(",") === kinD.map((k) => k.id).join(","),
    JSON.stringify(kinD.map((k) => k.greeter)));
  const bindD = db.prepare("SELECT * FROM table_bindings WHERE discord_id = ?").get("disc-entrance-d");
  ok("§D the binding row ties this Discord identity to the door Tender", !!bindD && bindD.tender_id === tenderD.id,
    JSON.stringify(bindD));
  await page.close();
}

/* ── §E THE OLD ROAD AT THIS DOOR ─────────────────────── */
console.log("§E legacy arrivals keep the old road, whole");
{
  // A pre-entrance Tender, completed by the game's own roads.
  const claimE = await api("claimTender", { password: PW, tenderName: "Old Road Tender" });
  const img = await fixtureImage();
  const seedE = await pathRaw("/api/welcome/seed", { layers: fixtureRefs(), imageBase64: img }, claimE.data.token);
  ok("§E the stage: her greeting seeds by the welcome road", seedE.status === 200, JSON.stringify(seedE.data).slice(0, 120));
  for (let i = 0; i < 2; i++) {
    await api("saveAwoken", { layers: fixtureRefs(), imageBase64: img, collection: "tender", ownerName: "Old Road Tender" }, claimE.data.token);
  }
  await api("chooseClass", { classKey: "warden" }, claimE.data.token);
  await api("chooseWeapon", { weaponKey: "spear" }, claimE.data.token);
  const stE = await api("getEntranceStatus", {}, claimE.data.token);
  ok("§E she carries NO mark (entrance: false) — the door is not hers to walk",
    stE.data.entrance === false, JSON.stringify(stE.data).slice(0, 120));

  const page = await doorPage(seatFor("disc-entrance-e", "Entrance E on Discord", false, null, "entrance-discord-room-e"));
  await page.waitForSelector("#intro-name", { timeout: 30000 });
  ok("§E the form's own toggle opens the sign-in", await clickButtonWithText(page, "I already have a Tender"));
  await page.waitForSelector("#intro-identity", { timeout: 20000 });
  await page.type("#intro-identity", "Old Road Tender");
  await page.type("#intro-login-password", PW);
  ok("§E the sign-in is spoken", await clickButtonWithText(page, "Bind my Tender and continue"));
  const seatedE = await page.waitForSelector(".room-seat", { timeout: 40000 }).then(() => true).catch(() => false);
  const textE = await pageText(page);
  ok("§E she SEATS with NO door steps walked (the beginning was already hers — no class, spell or wake step stood)",
    seatedE && !textE.includes("Now — choose your spell") && !textE.includes("Wake the three"),
    textE.slice(0, 300));
  const bindE = db.prepare("SELECT * FROM table_bindings WHERE discord_id = ?").get("disc-entrance-e");
  const tenderE = db.prepare("SELECT id FROM tenders WHERE tender_name = ?").get("Old Road Tender");
  ok("§E the binding row ties her Discord identity to the pre-entrance Tender",
    !!bindE && bindE.tender_id === tenderE.id, JSON.stringify(bindE));
  await page.close();

  // A claim carrying an already-welcomed soft visitor, asking
  // for the entrance: NOT marked — it routes to the old road.
  db.prepare("INSERT INTO visitors (visitor_id, created_at, welcome_wakes_granted, welcome_claimed, last_free_wake_at) VALUES (?, ?, 1, 1, ?)").run("welcomed-visitor-e", Date.now(), Date.now());
  const adopt = await api("claimTender", { password: PW, tenderName: "Welcomed Claim Tender", entrance: true }, null, "welcomed-visitor-e");
  ok("§E the welcomed-past claim is NOT marked, even asking (the routing reads this same status)",
    adopt.status === 200 && !adopt.data.entrance, JSON.stringify(adopt.data).slice(0, 140));
  const stAdopt = await api("getEntranceStatus", {}, adopt.data.token);
  ok("§E its entrance status reads the old road (entrance: false)", stAdopt.data.entrance === false,
    JSON.stringify(stAdopt.data).slice(0, 120));
}

await browser.close().catch(() => {});
console.log(`\ndrive-entrance-discord: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
