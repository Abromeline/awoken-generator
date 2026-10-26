// THE DOOR SEATS THE TENDER — THE TABLE DOOR BUILD'S DRIVE
// (2026-10-25). Boots the real server on a scratch DATA_DIR
// with Discord CONFIGURED (dummy keys — the production shape:
// no dev door) and proves the door in a real browser:
//   §A A BEACON-HOLDING TENDER AT ?land=homeland is offered
//      the homeland seat and, taking it, lands SEATED (not
//      watching) in the casual room standing on HER homeland
//      (hosted source = homeland, her 127 tiles dealt, her
//      seat keyed web:<her id> and bound to her name).
//   §B ?land=new SEATS HER AT A FRESH-LAND TABLE (hosted
//      source = tableland) after her homeland is folded away.
//   §C A BEACON-LESS TENDER AT ?land=homeland MEETS THE
//      GATE'S WORDS (Push 18's reckoning, App.tsx's words)
//      and is NOT seated — the room does not move for her.
//   §D THE PLAIN DOOR IS UNCHANGED: no token, /table, the
//      Discord explanation stands and Watch still watches.
//   §E THE REVEALED BINDING CODE CARRIES ITS PURPOSE on the
//      revealed line itself.
//   §F THE SOCKET ROADS: a faded/bogus session token is
//      refused in words; a classless Tender meets the class
//      gate's own words; a web seat's you-payload is her real
//      bound seat (her key, her name, her party dealt); and a
//      password-kept land asks a web-seated GUEST for the
//      word, refuses the wrong one, seats the right one.
// Run AFTER `npm run build`: node scripts/drive-table-door-seat.mjs
import { join } from "node:path";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

process.env.PUPPETEER_CACHE_DIR = "/home/hatch/workspace/tools-chrome/.cache";
const require2 = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require2("puppeteer");

const OUT = "/home/hatch/workspace/door-seat-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-door-seat-"));
process.env.PORT = "39683";
// Discord CONFIGURED (dummy keys): the door stands in its
// production shape — the dev door is shut, and only a proven
// name (Discord) or the game's own session (the web seat) can
// seat anyone. Nothing here ever calls Discord: the browser
// arrives outside any Discord frame, as Nigel's did.
process.env.DISCORD_CLIENT_ID = "door-seat-drive-dummy";
process.env.DISCORD_CLIENT_SECRET = "door-seat-drive-dummy";
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39683";
const PW = "door-seat-drive-password";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const realNow = Date.now;

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

/* ── §S SOURCE SEAMS ──────────────────────────────────── */
console.log("§S the seams in the sources");
const tableSrv = readFileSync("server/src/table.ts", "utf8");
const tableCli = readFileSync("client/src/Table.tsx", "utf8");
ok("§S the join reads the game's session token through tenderFromToken",
  tableSrv.includes("tenderFromToken(msg.tenderToken)") && tableSrv.includes("web:${tender.id}"));
ok("§S the class gate stands at the join in getTableBindCode's own words",
  tableSrv.includes("The Table seats only Tenders who have chosen a class — the choosing waits on your character sheet, at Lv 3 and beyond."));
ok("§S the bound road keys off the named Tender, not the door she came by",
  tableSrv.includes("seatTenderId ?? (key.startsWith(\"discord:\")"));
ok("§S the door offers the homeland seat and the fresh-land seat in plain words",
  tableCli.includes("Take your seat — the Table stands on your homeland")
  && tableCli.includes("Take your seat — a fresh land for the hunt"));
ok("§S the door carries the gate's words for a beacon-less homeland arrival",
  tableCli.includes("You must light the beacon first! Wake the Awokin, go to the cursed lands!"));
ok("§S the revealed binding code states its purpose on its own line",
  tableCli.includes("this code ties your Discord name to this Tender")
  && tableCli.includes("bind strip in your satchel at the Table in Discord")
  && tableCli.includes("the Table seats your real Tender"));
ok("§S the plain door's standing words are untouched",
  tableCli.includes("Open the Table from the voice channel in Discord to be named and take a seat.")
  && tableCli.includes("Watch the Table"));

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
  .run(name, category, power, toughness, element, `door/${name}.png`, Date.now()).lastInsertRowid);
const mkKin = (ownerKey, ownerName, name, parts) => {
  const comp = JSON.stringify(parts.map(([category, element, power, toughness]) => ({
    source_id: `db:${partEl(`${name} ${category}`, category, power, toughness, element)}`,
    name: `${name} ${category}`, category, rarity: "common", power, toughness, element,
  })));
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, "door/awokin.png", comp, ownerName, ownerKey, Date.now()).lastInsertRowid);
};
const stdParts = (el, power, toughness) => [["body", el, power, toughness], ["arms", el, power, toughness], ["head", el, power, toughness]];
const ringOf = (q, r) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));

async function makeTender(name, { classKey = "warden", beacon = false, homeland = false } = {}) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, hp, updated_at) VALUES (?, 3800, 12, ?, 100, ?)")
    .run(ownerKey, classKey, Date.now());
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 500, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500")
    .run(ownerKey, Date.now());
  const kinIds = [];
  for (const w of ["Wake One", "Wake Two", "Wake Three"]) kinIds.push(mkKin(ownerKey, name, `${name} ${w}`, stdParts("sky", 2, 2)));
  await call("addToParty", { awakenedId: kinIds[0] }, claim.token);
  await call("ensureFirstSeed", {}, claim.token);
  if (homeland) {
    await call("getTerritory", {}, claim.token);
    // The window completed in the frontier's own shape (the
    // homeland-port drive's named sculpt): the whole radius-6
    // disc stands in her record by the time a seed is grown.
    const have = new Set(db.prepare("SELECT q, r FROM territory_tiles WHERE owner_key = ? AND COALESCE(z, 0) = 0").all(ownerKey).map(t => `${t.q},${t.r}`));
    const ins = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, curse_hp, curse_max_hp, created_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)");
    const els = ["root", "tide", "sky", "stone", "fire"];
    for (let q = -6; q <= 6; q++) for (let r = -6; r <= 6; r++) {
      if (ringOf(q, r) > 6 || have.has(`${q},${r}`)) continue;
      const hp = 10 + ringOf(q, r) * 2;
      ins.run(ownerKey, q, r, els[Math.abs(q * 7 + r * 3) % 5], hp, hp, Date.now());
    }
    db.prepare("UPDATE territory_tiles SET cursed = 0, element = 'sky', curse_hp = NULL, curse_max_hp = NULL WHERE owner_key = ? AND q = 0 AND r = 0 AND COALESCE(z, 0) = 0").run(ownerKey);
  }
  if (beacon) {
    const seed = db.prepare("SELECT s.id FROM star_seeds s JOIN first_seed_events e ON e.seed_id = s.id WHERE e.owner_key = ?").get(ownerKey);
    db.prepare("UPDATE star_seeds SET level = 3, fed_energy = 47 WHERE id = ?").run(seed.id);
    db.prepare("UPDATE first_seed_events SET state = 'done' WHERE owner_key = ?").run(ownerKey);
  }
  const check = await call("getFirstSeedEvent", {}, claim.token);
  return { token: claim.token, tenderId, ownerKey, name, hasBeacon: check.hasBeacon };
}

console.log("§FIX the tenders — sown by the real road, sculpted in the open");
const A = await makeTender("Door Host", { beacon: true, homeland: true });
ok("§FIX Door Host holds a standing beacon (Push 18's reckoning, read back)", A.hasBeacon === true);
const B = await makeTender("Door Beaconless", { beacon: false });
ok("§FIX Door Beaconless holds none", B.hasBeacon === false);
const C = await makeTender("Door Classless", { classKey: null, beacon: true });
const D = await makeTender("Door Guest", { beacon: false });

/* ── SOCKET HELPERS ───────────────────────────────────── */
class Actor {
  constructor() { this.state = null; this.you = null; this.joinErrors = []; }
  async join(join, room = "the-table") {
    this.ws = new WebSocket("ws://127.0.0.1:39683/table/ws");
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data));
        if (m.type === "state") { this.state = m.state; if (m.you) this.you = m.you; }
        else if (m.type === "joinError") this.joinErrors.push(m);
      } catch { /* torn frame */ }
    };
    this.send({ type: "join", room, ...join });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  close() { try { this.ws.close(); } catch { /* already gone */ } }
}
async function joinProbe(join, room = "the-table", ms = 9000) {
  const a = new Actor();
  await a.join(join, room);
  const s = realNow();
  while (realNow() - s < ms) {
    if (a.you) return { actor: a, you: a.you };
    if (a.joinErrors.length) return { actor: a, joinError: a.joinErrors[0] };
    await sleep(120);
  }
  return { actor: a, timeout: true };
}
async function waitFor(what, cond, ms = 15000) {
  const s = realNow();
  while (realNow() - s < ms) { if (cond()) return true; await sleep(150); }
  console.log("  .. waited out:", what);
  return false;
}

// The drive's own watcher: the room's shared truth, read off
// an independent socket, never the seated page's word.
const W = new Actor();
await W.join({ watch: true, name: "Drive Watcher" });
await waitFor("the watcher sees the room", () => !!W.state);
ok("§FIX the room stands on the instanced world before anyone opens a land", !!W.state && W.state.hosted === null && W.state.map.length === 127,
  W.state ? `hosted=${JSON.stringify(W.state.hosted)} map=${W.state.map.length}` : "no state");

/* ── BROWSER HELPERS ──────────────────────────────────── */
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
async function doorPage(token, url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror:door-seat]", String(e).slice(0, 200)));
  if (token) await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
  await page.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".table-door", { timeout: 30000 });
  return page;
}
const doorText = (page) => page.$eval(".table-door", (el) => el.textContent || "");
async function clickButtonWith(page, fragment) {
  return page.evaluate((frag) => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").includes(frag));
    if (b) { b.click(); return true; }
    return false;
  }, fragment);
}

/* ── §A THE HOMELAND ARRIVAL ──────────────────────────── */
console.log("§A ?land=homeland — the beacon-holder is offered her seat and lands on her own ground");
{
  const page = await doorPage(A.token, "/table?land=homeland");
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => (b.textContent || "").includes("Take your seat — the Table stands on your homeland")), { timeout: 20000 }).catch(() => {});
  const text = await doorText(page);
  ok("§A the door offers the homeland seat in plain words", text.includes("Take your seat — the Table stands on your homeland"), text.slice(0, 200));
  ok("§A the gate's words are NOT spoken to a beacon-holder", !text.includes("You must light the beacon first!"));
  await page.screenshot({ path: `${OUT}/a-homeland-door.png` });
  const clicked = await clickButtonWith(page, "Take your seat — the Table stands on your homeland");
  ok("§A the seat button takes her tap", clicked);
  const hosted = await waitFor("the room stands on her homeland", () => W.state?.hosted?.source === "homeland");
  ok("§A the room stands on HER HOMELAND (hosted source = homeland)", hosted, JSON.stringify(W.state?.hosted));
  ok("§A the host is named as herself", W.state?.hosted?.hostName === A.name, JSON.stringify(W.state?.hosted));
  ok("§A her ground is dealt — 127 tiles stand in the room", W.state?.map.length === 127, `map=${W.state?.map.length}`);
  ok("§A her seat stands in the room keyed web:<her id>", (W.state?.players ?? []).some((p) => p.key === `web:${A.tenderId}` && p.name === A.name),
    JSON.stringify((W.state?.players ?? []).map((p) => `${p.key}:${p.name}`)));
  const pageText = await page.evaluate(() => document.body.innerText);
  ok("§A she is SEATED, not watching — no watcher line, the door is gone",
    !pageText.includes("You are watching the Table") && !(await page.$(".table-door")));
  await page.screenshot({ path: `${OUT}/a-seated-homeland.png` });
  await page.close();
}

/* ── FOLD (choreography): her homeland folds away ─────── */
{
  const fold = await joinProbe({ tenderToken: A.token });
  ok("§FOLD her own web seat answers a raw join (the takeover road)", !!fold.you, JSON.stringify(fold.joinError ?? fold.timeout ?? ""));
  fold.actor.send({ type: "beaconClose" });
  const folded = await waitFor("the land folds away", () => W.state?.hosted === null);
  ok("§FOLD the room stands on the instanced world again", folded, JSON.stringify(W.state?.hosted));
  fold.actor.close();
}

/* ── §B THE FRESH-LAND ARRIVAL ────────────────────────── */
console.log("§B ?land=new — the hunt seats her at a fresh-land Table");
{
  const page = await doorPage(A.token, "/table?land=new");
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => (b.textContent || "").includes("Take your seat — a fresh land for the hunt")), { timeout: 20000 }).catch(() => {});
  const text = await doorText(page);
  ok("§B the door offers the fresh-land seat in plain words", text.includes("Take your seat — a fresh land for the hunt"), text.slice(0, 200));
  const clicked = await clickButtonWith(page, "Take your seat — a fresh land for the hunt");
  ok("§B the seat button takes her tap", clicked);
  const hosted = await waitFor("the room stands on a fresh land", () => W.state?.hosted?.source === "tableland");
  ok("§B the room stands on a FRESH LAND (hosted source = tableland)", hosted, JSON.stringify(W.state?.hosted));
  ok("§B the fresh land is dealt — 127 tiles", W.state?.map.length === 127, `map=${W.state?.map.length}`);
  ok("§B her seat stands in the room", (W.state?.players ?? []).some((p) => p.key === `web:${A.tenderId}`));
  const pageText = await page.evaluate(() => document.body.innerText);
  ok("§B she is seated, not watching", !pageText.includes("You are watching the Table") && !(await page.$(".table-door")));
  await page.close();
}

/* ── §C THE BEACON-LESS ARRIVAL ───────────────────────── */
console.log("§C ?land=homeland with no beacon — the gate's words, and no seat");
{
  const page = await doorPage(B.token, "/table?land=homeland");
  await page.waitForFunction(() => (document.querySelector(".table-door")?.textContent || "").includes("You must light the beacon first!"), { timeout: 20000 }).catch(() => {});
  const text = await doorText(page);
  ok("§C the gate's words meet her, whole", text.includes("🌠 A starseed, not yet a beacon") && text.includes("You must light the beacon first! Wake the Awokin, go to the cursed lands!"), text.slice(0, 240));
  ok("§C no homeland seat is offered to her", !text.includes("Take your seat — the Table stands on your homeland"));
  await sleep(600);
  ok("§C she holds no seat in the room", !(W.state?.players ?? []).some((p) => p.key === `web:${B.tenderId}`));
  ok("§C the room did not move for her — the fresh land still stands", W.state?.hosted?.source === "tableland", JSON.stringify(W.state?.hosted));
  await page.close();
}

/* ── §D THE PLAIN DOOR, UNCHANGED ─────────────────────── */
console.log("§D a plain /table arrival — today's door, and watch still watches");
{
  const page = await doorPage(null, "/table");
  const text = await doorText(page);
  ok("§D the Discord explanation stands as it stood", text.includes("Open the Table from the voice channel in Discord to be named and take a seat."), text.slice(0, 200));
  ok("§D no land panel haunts a plain arrival", !text.includes("Take your seat —") && !text.includes("You must light the beacon first!"));
  const clicked = await clickButtonWith(page, "Watch the Table");
  ok("§D Watch the Table takes her tap", clicked);
  await page.waitForFunction(() => document.body.innerText.includes("You are watching the Table"), { timeout: 20000 }).catch(() => {});
  const pageText = await page.evaluate(() => document.body.innerText);
  ok("§D watch still watches the default room", pageText.includes("You are watching the Table"));
  ok("§D the room counts a watcher", (W.state?.watcherCount ?? 0) >= 1, `watcherCount=${W.state?.watcherCount}`);
  await page.close();
}

/* ── §E THE BINDING CODE, EXPLAINED AT ITS REVEAL ─────── */
console.log("§E the revealed binding code states what it does");
{
  const page = await doorPage(A.token, "/table");
  const clicked = await clickButtonWith(page, "Show my binding code");
  ok("§E the code's button takes her tap", clicked);
  await page.waitForSelector(".bind-code-shown", { timeout: 20000 }).catch(() => {});
  const shown = await page.$eval(".bind-code-shown", (el) => el.textContent || "").catch(() => "");
  ok("§E the revealed line ties the Discord name to this Tender", shown.includes("this code ties your Discord name to this Tender"), shown.slice(0, 200));
  ok("§E the revealed line names the next step — the bind strip in her satchel at the Table in Discord", shown.includes("Spend it in the bind strip in your satchel at the Table in Discord"), shown.slice(0, 200));
  ok("§E the revealed line says what follows — the Table seats her real Tender", shown.includes("the Table seats your real Tender"), shown.slice(0, 200));
  await page.close();
}

/* ── §F THE SOCKET ROADS ──────────────────────────────── */
console.log("§F the web seat's own roads, spoken over the wire");
{
  const bogus = await joinProbe({ tenderToken: "f".repeat(64) });
  ok("§F a faded session token is refused in words, and seats no one",
    !!bogus.joinError && String(bogus.joinError.message || "").includes("sign-in has faded"), JSON.stringify(bogus.joinError ?? bogus.timeout ?? ""));
  bogus.actor.close();

  const classless = await joinProbe({ tenderToken: C.token });
  ok("§F a classless Tender meets the class gate's own words at the join",
    !!classless.joinError && String(classless.joinError.message || "").includes("The Table seats only Tenders who have chosen a class"), JSON.stringify(classless.joinError ?? ""));
  classless.actor.close();

  const host = await joinProbe({ tenderToken: A.token });
  ok("§F the web seat's payload is her real bound seat — her key, her name, her party dealt",
    !!host.you && host.you.key === `web:${A.tenderId}` && host.you.name === A.name && (host.you.company ?? []).length >= 1,
    JSON.stringify(host.you && { key: host.you.key, name: host.you.name, company: (host.you.company ?? []).length }));
  ok("§F she stands as the fresh land's host in her own payload", host.you?.landHost === true, JSON.stringify(host.you?.landHost));

  host.actor.send({ type: "beaconDoor", privacy: "password", password: "door-word-1" });
  const kept = await waitFor("the land's door is kept by a word", () => W.state?.hosted?.privacy === "password");
  ok("§F the host keeps her land's door by a word", kept, JSON.stringify(W.state?.hosted));

  const noWord = await joinProbe({ tenderToken: D.token });
  ok("§F a web-seated guest with no word is asked for it", !!noWord.joinError && noWord.joinError.needsPassword === true, JSON.stringify(noWord.joinError ?? ""));
  noWord.actor.close();
  const wrongWord = await joinProbe({ tenderToken: D.token, tablePassword: "not-the-word" });
  ok("§F the wrong word is refused, still asking", !!wrongWord.joinError && wrongWord.joinError.needsPassword === true, JSON.stringify(wrongWord.joinError ?? ""));
  wrongWord.actor.close();
  const guest = await joinProbe({ tenderToken: D.token, tablePassword: "door-word-1" });
  ok("§F the right word seats the guest — as her own Tender, by the web road",
    !!guest.you && guest.you.key === `web:${D.tenderId}`, JSON.stringify(guest.you?.key ?? guest.joinError ?? ""));
  guest.actor.close();
  host.actor.close();
}

await browser.close().catch(() => {});
W.close();
console.log(`\nDOOR-SEAT DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
