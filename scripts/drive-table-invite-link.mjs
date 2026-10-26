// THE TABLE INVITE LINK — THE DRIVE (2026-10-26).
// Nigel's word: "Build the invite link next." A seated
// Tender copies a link naming the room she stands in; its
// opener is seated in THAT room. This drive walks the real
// door in real browsers:
//   §A THE HOST IN A NAMED ROOM: she arrives by
//      ?room=invite-den&land=homeland, takes her seat, her
//      carried choice stands the room on her homeland IN
//      THE NAMED ROOM — and her beacon popup's invite
//      control mints a link naming that room, exactly.
//   §B THE COLD ARRIVAL: a second browser, cold, opens the
//      link as read off the host's own popup and is seated
//      in the named room — sees the host and her standing
//      ground — NOT in "the-table" (a watcher on the-table
//      sees no such ground, the whole while).
//   §C ROOM + LAND COMPOSE, AND THE RIDER: a third Tender
//      opens the link with &land=homeland — her choice
//      fires IN THAT ROOM, is refused at the host's land,
//      re-fires when the host folds, and lands her on her
//      own homeland — and the stale refusal line is GONE
//      from her page when it lands (the rider: the proof
//      photograph's wart, cured).
//   §D NO CODE, NO CHANGE: a linkless arrival watches the
//      shared room exactly as today and never sees the
//      named room's company.
//   §E THE LINK OPENS NO GATE: a room standing on a
//      word-kept land asks a LINK ARRIVAL for the word at
//      her seat, exactly as any arrival — and speaking it
//      seats her. The link named the room; it unlocked
//      nothing.
// Run AFTER `npm run build`:
//   PUPPETEER_CACHE_DIR=$HOME/workspace/tools-chrome/.cache node scripts/drive-table-invite-link.mjs
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

process.env.PUPPETEER_CACHE_DIR = "/home/hatch/workspace/tools-chrome/.cache";
const require2 = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require2("puppeteer");

const OUT = "/home/hatch/workspace/table-invite-link-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-invite-link-"));
process.env.PORT = "3963";
// Discord CONFIGURED (dummy keys), as the door drives: the
// browser door stands in its production shape. Nothing here
// ever calls Discord — arrivals are outside any Discord
// frame, and seats are taken by the game's session token.
process.env.DISCORD_CLIENT_ID = "invite-link-drive-dummy";
process.env.DISCORD_CLIENT_SECRET = "invite-link-drive-secret";
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3963";
const PW = "invite-link-drive-password";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const realNow = Date.now;

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

/* ── §S SOURCE SEAMS ──────────────────────────────────── */
console.log("§S the seams in the sources");
const tableCli = readFileSync("client/src/Table.tsx", "utf8");
const sdkPkg = JSON.parse(readFileSync("node_modules/@discord/embedded-app-sdk/package.json", "utf8"));
const sdkTypes = readFileSync("node_modules/@discord/embedded-app-sdk/output/commands/shareLink.d.ts", "utf8");
ok("§S the door reads ?room= into ROOM_INTENT, cleaned as the server cleans, campaign names refused to default",
  tableCli.includes("const ROOM_INTENT") && tableCli.includes('clean.startsWith("campaign-")') && tableCli.includes('raw.replace(/[^a-zA-Z0-9_-]/g, "")'));
ok("§S the web seat is taken in the carried room (ROOM_INTENT ?? \"the-table\")",
  tableCli.includes('connect({ tenderToken: token, room: ROOM_INTENT ?? "the-table" })'));
ok("§S the invite control stands in the beacon popup, plainly named",
  tableCli.includes("Copy invite link") && tableCli.includes("copyInviteLink"));
ok("§S the link is minted from the seat's own room (roomCode, /table?room=)",
  tableCli.includes("/table?room=${encodeURIComponent(roomCode"));
ok("§S Discord's share is the pinned SDK's own: @discord/embedded-app-sdk 2.5.0 offers commands.shareLink, and the control calls it",
  sdkPkg.version === "2.5.0" && sdkTypes.includes("shareLink") && tableCli.includes("sdk.commands.shareLink"));
ok("§S the rider stands: a satisfied choice clears the notice at the satisfying",
  tableCli.includes('if (!landIntentSatisfiedRef.current) setNotice("");'));

/* ── BOOT + FIXTURES ──────────────────────────────────── */
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

const partEl = (name, category, power, toughness, element) => Number(db.prepare(
  "INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)")
  .run(name, category, power, toughness, element, `invitelink/${name}.png`, Date.now()).lastInsertRowid);
const mkKin = (ownerKey, ownerName, name, parts) => {
  const comp = JSON.stringify(parts.map(([category, element, power, toughness]) => ({
    source_id: `db:${partEl(`${name} ${category}`, category, power, toughness, element)}`,
    name: `${name} ${category}`, category, rarity: "common", power, toughness, element,
  })));
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, "invitelink/awokin.png", comp, ownerName, ownerKey, Date.now()).lastInsertRowid);
};
const stdParts = (el, power, toughness) => [["body", el, power, toughness], ["arms", el, power, toughness], ["head", el, power, toughness]];
const ringOf = (q, r) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));

/* The door drives' fixture, carried whole: a Tender sown
 * by the real road (claim, ensureFirstSeed), her homeland's
 * radius-6 disc completed in the frontier's own shape, her
 * seed grown to Beacon so the door offers her homeland seat. */
async function makeTender(name) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, hp, updated_at) VALUES (?, 3800, 12, 'warden', 100, ?)")
    .run(ownerKey, Date.now());
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 500, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500")
    .run(ownerKey, Date.now());
  const kinIds = [];
  for (const w of ["Wake One", "Wake Two", "Wake Three"]) kinIds.push(mkKin(ownerKey, name, `${name} ${w}`, stdParts("sky", 2, 2)));
  await call("addToParty", { awakenedId: kinIds[0] }, claim.token);
  await call("ensureFirstSeed", {}, claim.token);
  await call("getTerritory", {}, claim.token);
  const have = new Set(db.prepare("SELECT q, r FROM territory_tiles WHERE owner_key = ? AND COALESCE(z, 0) = 0").all(ownerKey).map(t => `${t.q},${t.r}`));
  const ins = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, curse_hp, curse_max_hp, created_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)");
  const els = ["root", "tide", "sky", "stone", "fire"];
  for (let q = -6; q <= 6; q++) for (let r = -6; r <= 6; r++) {
    if (ringOf(q, r) > 6 || have.has(`${q},${r}`)) continue;
    const hp = 10 + ringOf(q, r) * 2;
    ins.run(ownerKey, q, r, els[Math.abs(q * 7 + r * 3) % 5], hp, hp, Date.now());
  }
  db.prepare("UPDATE territory_tiles SET cursed = 0, element = 'sky', curse_hp = NULL, curse_max_hp = NULL WHERE owner_key = ? AND q = 0 AND r = 0 AND COALESCE(z, 0) = 0").run(ownerKey);
  const seed = db.prepare("SELECT s.id FROM star_seeds s JOIN first_seed_events e ON e.seed_id = s.id WHERE e.owner_key = ?").get(ownerKey);
  db.prepare("UPDATE star_seeds SET level = 3, fed_energy = 47 WHERE id = ?").run(seed.id);
  db.prepare("UPDATE first_seed_events SET state = 'done' WHERE owner_key = ?").run(ownerKey);
  const check = await call("getFirstSeedEvent", {}, claim.token);
  return { token: claim.token, tenderId, ownerKey, name, hasBeacon: check.hasBeacon };
}

console.log("§FIX the tenders — sown by the real road, beacons standing");
const HOST = await makeTender("Invite Host");
const GUEST = await makeTender("Link Guest");
const SECOND = await makeTender("Second Guest");
ok("§FIX all three hold standing beacons (the door will offer their homeland seats)",
  HOST.hasBeacon === true && GUEST.hasBeacon === true && SECOND.hasBeacon === true,
  JSON.stringify({ HOST: HOST.hasBeacon, GUEST: GUEST.hasBeacon, SECOND: SECOND.hasBeacon }));

/* ── SOCKET HELPERS ───────────────────────────────────── */
class Actor {
  constructor() { this.state = null; this.you = null; this.errors = []; this.joinErrors = []; }
  async join(join, room) {
    this.ws = new WebSocket("ws://127.0.0.1:3963/table/ws");
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data));
        if (m.type === "state") { this.state = m.state; if (m.you) this.you = m.you; }
        else if (m.type === "error") this.errors.push(String(m.message ?? ""));
        else if (m.type === "joinError") this.joinErrors.push(m);
      } catch { /* torn frame */ }
    };
    this.send({ type: "join", room, ...join });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  close() { try { this.ws.close(); } catch { /* already gone */ } }
}
async function seat(tender, room) {
  const a = new Actor();
  await a.join({ tenderToken: tender.token }, room);
  await waitFor(`the seat of ${tender.name} in ${room}`, () => !!a.you);
  return a;
}
async function watchRoom(roomId) {
  const w = new Actor();
  await w.join({ watch: true, name: "Invite Watcher" }, roomId);
  await waitFor(`the watcher sees ${roomId}`, () => !!w.state);
  return w;
}
async function waitFor(what, cond, ms = 20000) {
  const s = realNow();
  while (realNow() - s < ms) { let v = false; try { v = cond(); } catch { v = false; } if (v) return true; await sleep(150); }
  console.log("  .. waited out:", what);
  return false;
}

/* ── BROWSER HELPERS ──────────────────────────────────── */
async function openPage(browser, token, url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror:invite-link]", String(e).slice(0, 200)));
  if (token) await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  return page;
}
async function clickButtonWithText(page, text, ms = 25000) {
  const found = await page.waitForFunction(
    (t) => [...document.querySelectorAll("button")].some((b) => (b.textContent || "").includes(t)),
    { timeout: ms }, text).then(() => true).catch(() => false);
  if (!found) return false;
  return page.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").includes(t));
    if (b) { b.click(); return true; }
    return false;
  }, text);
}
const pageText = (page) => page.evaluate(() => document.body.innerText);

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio"] });

/* ── §A THE HOST IN A NAMED ROOM ──────────────────────── */
console.log("§A the host arrives by room + land, and her popup mints the link");
const denWatch = await watchRoom("invite-den");
const tableWatch = await watchRoom("the-table");
let inviteLink = "";
{
  const page = await openPage(browser, HOST.token, `${BASE}/table?room=invite-den&land=homeland`);
  await page.waitForSelector(".table-door", { timeout: 30000 });
  ok("§A the door offered the host her homeland seat (a room + land arrival, as any)",
    await clickButtonWithText(page, "Take your seat — the Table stands on your homeland"));
  ok("§A her carried choice stood the NAMED room on her homeland",
    await waitFor("invite-den on the host's homeland", () => denWatch.state?.hosted?.source === "homeland" && denWatch.state?.hosted?.hostName === HOST.name),
    JSON.stringify(denWatch.state?.hosted));
  ok("§A the shared room 'the-table' holds no such ground meanwhile",
    tableWatch.state?.hosted === null, JSON.stringify(tableWatch.state?.hosted));
  // The invite control, in the beacon popup.
  await page.click(".beacon-pin");
  await page.waitForSelector(".beacon-pop", { timeout: 15000 });
  ok("§A the beacon popup carries the invite control, plainly named",
    await clickButtonWithText(page, "Copy invite link", 10000));
  const linkShown = await page.waitForSelector(".invite-link-line code", { timeout: 15000 }).then(() => true).catch(() => false);
  inviteLink = linkShown ? await page.evaluate(() => document.querySelector(".invite-link-line code")?.textContent ?? "") : "";
  ok("§A the minted link names THIS room — and the room alone",
    inviteLink === `${BASE}/table?room=invite-den`, inviteLink);
  await page.screenshot({ path: `${OUT}/a-invite-control-in-place.png` });
  // Keep the host's page open: §C folds her land from it.
  var hostPage = page;
}

/* ── §B THE COLD ARRIVAL BY THE LINK ──────────────────── */
console.log("§B a cold browser opens the link and sits at the host's Table");
{
  const page = await openPage(browser, GUEST.token, inviteLink);
  await page.waitForSelector(".table-door", { timeout: 30000 });
  ok("§B the link's door is the ordinary door (the watch choice, no new step)",
    await clickButtonWithText(page, "Watch the Table"));
  const sees = await page.waitForFunction(
    (hostName) => document.body.innerText.includes(hostName) && document.body.innerText.includes("HOMELAND"),
    { timeout: 25000 }, HOST.name).then(() => true).catch(() => false);
  const text = await pageText(page);
  ok("§B the cold arrival is IN the named room — the host sits there, her homeland stands there",
    sees && text.includes(HOST.name), text.slice(0, 300));
  ok("§B and not in 'the-table' — the shared room never gained the host's ground",
    tableWatch.state?.hosted === null && !(tableWatch.state?.players ?? []).some(p => p.name === HOST.name),
    JSON.stringify(tableWatch.state?.hosted));
  await page.screenshot({ path: `${OUT}/b-cold-arrival-at-the-hosts-table.png` });
  await page.close();
}

/* ── §C ROOM + LAND COMPOSE — AND THE RIDER ───────────── */
console.log("§C the link with a carried choice fires in that room; a satisfied choice wears no stale refusal");
{
  const page = await openPage(browser, SECOND.token, `${inviteLink}&land=homeland`);
  await page.waitForSelector(".table-door", { timeout: 30000 });
  ok("§C the door offered the second guest her homeland seat, in the named room",
    await clickButtonWithText(page, "Take your seat — the Table stands on your homeland"));
  const refused = await page.waitForFunction(
    (hostName) => document.body.innerText.includes(`already stands on ${hostName}'s land`),
    { timeout: 25000 }, HOST.name).then(() => true).catch(() => false);
  ok("§C her carried choice fired IN THAT ROOM and was refused at the host's standing land",
    refused && denWatch.state?.hosted?.hostName === HOST.name);
  const noticeAtRefusal = await page.evaluate(() => document.querySelector(".notice-line")?.textContent ?? "");
  ok("§C the refusal stands on her notice line at this moment (the wart, before the cure)",
    noticeAtRefusal.includes("already stands on"), noticeAtRefusal);
  // The host folds her land away, from her own page (§A's).
  await hostPage.click(".beacon-pin").catch(() => {});
  const folded = await clickButtonWithText(hostPage, "Fold my land away");
  ok("§C the host folds her land from her own popup", folded);
  ok("§C the refused choice re-fires on the change and the room stands on the SECOND guest's homeland",
    await waitFor("invite-den on the second guest's homeland", () => denWatch.state?.hosted?.source === "homeland" && denWatch.state?.hosted?.hostName === SECOND.name, 25000),
    JSON.stringify(denWatch.state?.hosted));
  const noticeCleared = await page.waitForFunction(
    () => { const n = document.querySelector(".notice-line"); return !n || !(n.textContent || "").includes("already stands on"); },
    { timeout: 20000 }).then(() => true).catch(() => false);
  ok("§C THE RIDER: landed on her own ground, her notice line wears NO stale refusal",
    noticeCleared, await page.evaluate(() => document.querySelector(".notice-line")?.textContent ?? "(no notice line)"));
  await page.screenshot({ path: `${OUT}/c-landed-no-stale-refusal.png` });
  await page.close();
  await hostPage.close();
}

/* ── §D NO CODE, NO CHANGE ────────────────────────────── */
console.log("§D a linkless arrival behaves exactly as today");
{
  const page = await openPage(browser, GUEST.token, `${BASE}/table`);
  await page.waitForSelector(".table-door", { timeout: 30000 });
  await clickButtonWithText(page, "Watch the Table");
  await sleep(2500);
  const text = await pageText(page);
  ok("§D the linkless watcher lands in 'the-table' and never sees the named room's company",
    !text.includes(SECOND.name) && tableWatch.state?.hosted === null, text.slice(0, 200));
  await page.close();
}

/* ── §E THE LINK OPENS NO GATE ────────────────────────── */
console.log("§E a word-kept land asks a link arrival for the word, as any arrival");
{
  const w = await watchRoom("invite-pwd");
  const h = await seat(HOST, "invite-pwd");
  h.send({ type: "beaconOpen", source: "homeland" });
  await waitFor("the host's homeland standing in invite-pwd", () => w.state?.hosted?.source === "homeland" && w.state?.hosted?.hostName === HOST.name);
  h.send({ type: "beaconDoor", privacy: "password", password: "invite-word" });
  ok("§E the room's land now stands kept by a word",
    await waitFor("invite-pwd privacy = password", () => w.state?.hosted?.privacy === "password"),
    JSON.stringify(w.state?.hosted));
  const page = await openPage(browser, GUEST.token, `${BASE}/table?room=invite-pwd&land=homeland`);
  await page.waitForSelector(".table-door", { timeout: 30000 });
  await clickButtonWithText(page, "Take your seat — the Table stands on your homeland");
  const asked = await page.waitForSelector("#land-word", { timeout: 25000 }).then(() => true).catch(() => false);
  ok("§E the LINK ARRIVAL meets the word at her seat — the link unlocked nothing", asked);
  if (asked) {
    await page.type("#land-word", "invite-word");
    await clickButtonWithText(page, "Speak the word and take your seat");
    const seatedIn = await page.waitForFunction(
      () => !document.querySelector(".table-door") && document.body.innerText.includes("The Party"),
      { timeout: 25000 }).then(() => true).catch(() => false);
    ok("§E speaking the word seats her in THAT room, on the host's ground",
      seatedIn && (await pageText(page)).includes(HOST.name));
  }
  await page.close();
  h.close(); w.close();
}

await browser.close().catch(() => {});
denWatch.close(); tableWatch.close();
console.log(`\ndrive-table-invite-link: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
