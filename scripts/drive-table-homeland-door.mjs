// THE HOMELAND DOOR FIX — THE STANDING-ROOM DRIVE (2026-10-26).
// Nigel reported the Table's homeland door dead twice
// (2026-10-25 23:27, 2026-10-26 11:16): a room already
// standing on a Tender's OWN other ground refused the
// carried homeland choice with a notice telling her to fold
// it away first — and the carried choice, fired once per
// page load, could never be spoken again without a reload.
// Every earlier door drive ran in COLD rooms; this one runs
// in STANDING rooms, which is the whole point:
//   §A A room standing on the owner's OWN table land takes
//      ONE beaconOpen {source:"homeland"} and stands on her
//      HOMELAND — fold and open in one act, no beaconClose
//      spoken, no refusal — and the kept table-land record
//      still stands afterwards (proven from the scratch DB's
//      ui_config row, then by folding the homeland away and
//      reopening the table land onto the same ground).
//   §B A room standing on ANOTHER Tender's land still
//      refuses a guest's homeland act, in the standing words,
//      and the standing land is untouched.
//   §C THE SPENT INTENT, AT THE REAL DOOR (a real browser,
//      the real ?land=homeland arrival, the real seat
//      button): the guest-of-the-room's carried choice is
//      refused while another's land stands; the host folds
//      that land away over a raw socket; the SAME page —
//      never reloaded, a marker planted on it survives —
//      re-fires the intent on the state change alone and the
//      room stands on HER homeland.
//   §D COLD ROOMS STILL OPEN: a normal homeland opens cold,
//      and a Tender whose ONLY seed row stands state 'held'
//      with NO first_seed_events row (the exact shape the old
//      fallback query refused — it demanded state 'first'
//      alone) opens hers cold too, her seed's own growth on
//      the room.
// Run AFTER `npm run build`:
//   PUPPETEER_CACHE_DIR=$HOME/workspace/tools-chrome/.cache node scripts/drive-table-homeland-door.mjs
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

const OUT = "/home/hatch/workspace/table-homeland-door-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-homeland-door-"));
process.env.PORT = "3958";
// Discord CONFIGURED (dummy keys), as the door-seat drive:
// the browser door stands in its production shape. Nothing
// here ever calls Discord — the browser arrives outside any
// Discord frame, and the seats are taken by the game's own
// session token (the web-seat road).
process.env.DISCORD_CLIENT_ID = "homeland-door-drive-dummy";
process.env.DISCORD_CLIENT_SECRET = "homeland-door-drive-dummy-secret";
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3958";
const PW = "homeland-door-drive-password";
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
ok("§S the fold body stands once, as foldHostedGround, and beaconClose calls it",
  tableSrv.includes("function foldHostedGround(room: Room)") && (tableSrv.match(/foldHostedGround\(room\)/g) ?? []).length >= 2);
ok("§S the seed fallback accepts the standing states — state IN ('fallen','held','first')",
  tableSrv.includes("state IN ('fallen','held','first')"));
ok("§S the old same-owner refusal words are gone from the server",
  !tableSrv.includes("fold it away before opening the other"));
ok("§S the client re-arms on a refused signature, and only on a changed one",
  tableCli.includes("landIntentRefusedSigRef") && tableCli.includes("landIntentSatisfiedRef"));

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
  .run(name, category, power, toughness, element, `doorfix/${name}.png`, Date.now()).lastInsertRowid);
const mkKin = (ownerKey, ownerName, name, parts) => {
  const comp = JSON.stringify(parts.map(([category, element, power, toughness]) => ({
    source_id: `db:${partEl(`${name} ${category}`, category, power, toughness, element)}`,
    name: `${name} ${category}`, category, rarity: "common", power, toughness, element,
  })));
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, "doorfix/awokin.png", comp, ownerName, ownerKey, Date.now()).lastInsertRowid);
};
const stdParts = (el, power, toughness) => [["body", el, power, toughness], ["arms", el, power, toughness], ["head", el, power, toughness]];
const ringOf = (q, r) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));

/* The door-seat drive's fixture, carried whole: a Tender
 * sown by the real road (claim, ensureFirstSeed), her
 * homeland's radius-6 disc completed in the frontier's own
 * shape, her seed grown to Beacon when `beacon` is asked. */
async function makeTender(name, { beacon = false } = {}) {
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
  if (beacon) {
    const seed = db.prepare("SELECT s.id FROM star_seeds s JOIN first_seed_events e ON e.seed_id = s.id WHERE e.owner_key = ?").get(ownerKey);
    db.prepare("UPDATE star_seeds SET level = 3, fed_energy = 47 WHERE id = ?").run(seed.id);
    db.prepare("UPDATE first_seed_events SET state = 'done' WHERE owner_key = ?").run(ownerKey);
  }
  const check = await call("getFirstSeedEvent", {}, claim.token);
  return { token: claim.token, tenderId, ownerKey, name, hasBeacon: check.hasBeacon };
}

console.log("§FIX the tenders — sown by the real road, sculpted in the open");
const HA = await makeTender("Fold Host");
const HB = await makeTender("Other Host");
const GB = await makeTender("Guest Greta");
const CA = await makeTender("Blocker Host");
const CB = await makeTender("Retry Rita", { beacon: true });
ok("§FIX Retry Rita holds a standing beacon (the door will offer her homeland seat)", CB.hasBeacon === true);
const ND = await makeTender("Cold Nora");
const HD = await makeTender("Held Hilda");
/* THE HELD-SEED SHAPE (named sculpt): Hilda's only seed row
 * stands state 'held' — a bastion-held seed, bastion id and
 * all left null as a plain held row can stand — and her
 * first_seed_events row is deleted outright, so the loader's
 * EVENT road finds nothing and the FALLBACK road must carry
 * her. Her seed keeps a growth of its own (level 2, fed 11)
 * so the room's seed can be checked against it. */
{
  const evSeed = db.prepare("SELECT s.id FROM star_seeds s JOIN first_seed_events e ON e.seed_id = s.id WHERE e.owner_key = ?").get(HD.ownerKey);
  db.prepare("DELETE FROM star_seeds WHERE owner_key = ? AND id != ?").run(HD.ownerKey, evSeed.id);
  db.prepare("UPDATE star_seeds SET state = 'held', level = 2, fed_energy = 11 WHERE id = ?").run(evSeed.id);
  db.prepare("DELETE FROM first_seed_events WHERE owner_key = ?").run(HD.ownerKey);
  const rows = db.prepare("SELECT state, level, fed_energy FROM star_seeds WHERE owner_key = ?").all(HD.ownerKey);
  const evCount = db.prepare("SELECT COUNT(*) AS n FROM first_seed_events WHERE owner_key = ?").get(HD.ownerKey).n;
  ok("§FIX Hilda's record stands in the exact refused shape: one seed, state 'held', no first_seed_events row",
    rows.length === 1 && rows[0].state === "held" && rows[0].level === 2 && rows[0].fed_energy === 11 && evCount === 0,
    JSON.stringify({ rows, evCount }));
}

/* ── SOCKET HELPERS ───────────────────────────────────── */
class Actor {
  constructor() { this.state = null; this.you = null; this.errors = []; this.joinErrors = []; }
  async join(join, room) {
    this.ws = new WebSocket("ws://127.0.0.1:3958/table/ws");
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
  get tale() { return (this.state?.tale ?? []).map((t) => (typeof t === "string" ? t : t?.text ?? "")); }
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
  await w.join({ watch: true, name: "Doorfix Watcher" }, roomId);
  await waitFor(`the watcher sees ${roomId}`, () => !!w.state);
  return w;
}
async function waitFor(what, cond, ms = 20000) {
  const s = realNow();
  while (realNow() - s < ms) { let v = false; try { v = cond(); } catch { v = false; } if (v) return true; await sleep(150); }
  console.log("  .. waited out:", what);
  return false;
}
const landRecord = (ownerKey) => {
  const row = db.prepare("SELECT value FROM ui_config WHERE key = ?").get(`table.hosted.${ownerKey}`);
  return row ? JSON.parse(row.value) : null;
};

/* ── §A FOLD-AND-OPEN IN ONE ACT ──────────────────────── */
console.log("§A a room standing on her OWN table land — one homeland act, and the room stands on her homeland");
{
  const w = await watchRoom("doorfix-a");
  const h = await seat(HA, "doorfix-a");
  h.send({ type: "beaconOpen" });
  ok("§A the room first stands on her table land",
    await waitFor("her table land standing", () => w.state?.hosted?.source === "tableland" && w.state?.hosted?.hostName === HA.name),
    JSON.stringify(w.state?.hosted));
  const keptBefore = landRecord(HA.ownerKey);
  ok("§A her table land's kept record stands in ui_config before the act", !!keptBefore && Array.isArray(keptBefore.tiles) && keptBefore.tiles.length === 127,
    keptBefore ? `tiles=${keptBefore.tiles?.length}` : "no record");
  const errorsBefore = h.errors.length;
  h.send({ type: "beaconOpen", source: "homeland" });
  ok("§A ONE act — no fold spoken — and the room stands on her HOMELAND",
    await waitFor("the room on her homeland", () => w.state?.hosted?.source === "homeland" && w.state?.hosted?.hostName === HA.name),
    JSON.stringify(w.state?.hosted));
  ok("§A no refusal answered the act", h.errors.length === errorsBefore, JSON.stringify(h.errors.slice(errorsBefore)));
  ok("§A the act is TOLD whole: the fold's tale and the homeland's opening tale both stand",
    h.tale.some(t => t.includes("land folds away")) && h.tale.some(t => t.includes("opens their HOMELAND")),
    h.tale.slice(-4).join(" | "));
  ok("§A her homeland's ground is dealt — 127 tiles", w.state?.map.length === 127, `map=${w.state?.map.length}`);
  const keptAfter = landRecord(HA.ownerKey);
  ok("§A the kept table-land record STILL EXISTS after the fold-and-open (read from the scratch DB's ui_config row)",
    !!keptAfter && JSON.stringify(keptAfter.tiles) === JSON.stringify(keptBefore.tiles)
      && JSON.stringify(keptAfter.seedGrowth) === JSON.stringify(keptBefore.seedGrowth),
    keptAfter ? `tiles=${keptAfter.tiles?.length}` : "record gone");
  // And the record is not a husk: fold the homeland away and
  // open the table land again — its ground comes back.
  h.send({ type: "beaconClose" });
  await waitFor("the homeland folded away", () => w.state?.hosted === null);
  h.send({ type: "beaconOpen" });
  ok("§A reopening the table land restores its kept ground, tile for tile",
    await waitFor("her table land standing again", () => w.state?.hosted?.source === "tableland")
      && w.state.map.length === keptBefore.tiles.length
      && keptBefore.tiles.every(rt => { const wt = w.state.map.find(t => t.id === rt.id); return wt && wt.cursed === !!rt.cursed && wt.element === rt.element; }),
    JSON.stringify(w.state?.hosted));
  h.close(); w.close();
}

/* ── §B ANOTHER TENDER'S LAND STILL REFUSES ───────────── */
console.log("§B a room standing on another Tender's land — the guest's homeland act is refused, the land untouched");
{
  const w = await watchRoom("doorfix-b");
  const host = await seat(HB, "doorfix-b");
  host.send({ type: "beaconOpen" });
  await waitFor("the host's table land standing", () => w.state?.hosted?.source === "tableland" && w.state?.hosted?.hostName === HB.name);
  const guest = await seat(GB, "doorfix-b");
  const mapBefore = JSON.stringify(w.state?.map);
  guest.send({ type: "beaconOpen", source: "homeland" });
  ok("§B the refusal stands, in its standing words",
    await waitFor("the guest's refusal", () => guest.errors.some(e => e === `This room already stands on ${HB.name}'s land.`)),
    JSON.stringify(guest.errors.slice(-3)));
  await sleep(600);
  ok("§B the standing land is untouched — host, source and ground unchanged",
    w.state?.hosted?.source === "tableland" && w.state?.hosted?.hostName === HB.name && JSON.stringify(w.state?.map) === mapBefore,
    JSON.stringify(w.state?.hosted));
  guest.close(); host.close(); w.close();
}

/* ── §C THE REFUSED INTENT RE-FIRES, SAME PAGE LOAD ───── */
console.log("§C the real door: a refused homeland intent re-fires on its own when the blocker folds");
{
  const w = await watchRoom("the-table");
  const host = await seat(CA, "the-table");
  host.send({ type: "beaconOpen" });
  await waitFor("the blocker's table land standing in the-table", () => w.state?.hosted?.source === "tableland" && w.state?.hosted?.hostName === CA.name);

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror:homeland-door]", String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, CB.token);
  await page.goto(BASE + "/table?land=homeland", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".table-door", { timeout: 30000 });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => (b.textContent || "").includes("Take your seat — the Table stands on your homeland")), { timeout: 20000 }).catch(() => {});
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").includes("Take your seat — the Table stands on your homeland"));
    if (b) { b.click(); return true; }
    return false;
  });
  ok("§C the door offered Rita her homeland seat and the button took her tap", clicked);
  const refused = await page.waitForFunction(() => document.body.innerText.includes("already stands on"), { timeout: 20000 }).then(() => true).catch(() => false);
  const pageTextAtRefusal = await page.evaluate(() => document.body.innerText);
  ok("§C her carried choice was REFUSED at the standing room — the notice names the standing land",
    refused && pageTextAtRefusal.includes(`${CA.name}'s land`), pageTextAtRefusal.slice(0, 300));
  ok("§C the room still stands on the blocker's land after the refusal",
    w.state?.hosted?.source === "tableland" && w.state?.hosted?.hostName === CA.name, JSON.stringify(w.state?.hosted));
  await page.screenshot({ path: `${OUT}/c-refused-at-standing-room.png` });
  // Plant the no-reload marker, then clear the blocker the
  // honest way: the host folds his own land over a raw socket.
  await page.evaluate(() => { window.__homelandDoorMark = "same-page-load"; });
  host.send({ type: "beaconClose" });
  // The fold's broadcast and Rita's re-fired opening can land
  // between two watcher polls, so "folded" reads as: the room
  // no longer stands on the blocker's land — either folded to
  // no land, or already re-opened on hers by the re-fire.
  ok("§C the blocker folds away", await waitFor("the-table leaving the blocker's land",
    () => w.state?.hosted === null || (w.state?.hosted?.source === "homeland" && w.state?.hosted?.hostName === CB.name)),
    JSON.stringify(w.state?.hosted));
  ok("§C WITHOUT ANY RELOAD the intent re-fires on the state change and the room stands on HER HOMELAND",
    await waitFor("the room on Rita's homeland", () => w.state?.hosted?.source === "homeland" && w.state?.hosted?.hostName === CB.name, 25000),
    JSON.stringify(w.state?.hosted));
  const mark = await page.evaluate(() => window.__homelandDoorMark ?? null);
  ok("§C the page never reloaded — the planted marker survives", mark === "same-page-load", String(mark));
  const pageText = await page.evaluate(() => document.body.innerText);
  ok("§C she is seated on her own ground, not watching", !pageText.includes("You are watching the Table") && !(await page.$(".table-door")));
  await page.screenshot({ path: `${OUT}/c-refired-landed-on-homeland.png` });
  await page.close();
  await browser.close().catch(() => {});
  host.close(); w.close();
}

/* ── §D COLD ROOMS, AND THE HELD SEED ─────────────────── */
console.log("§D a cold room opens a homeland — and the held seed with no event row opens hers");
{
  const w1 = await watchRoom("doorfix-cold");
  const n = await seat(ND, "doorfix-cold");
  n.send({ type: "beaconOpen", source: "homeland" });
  ok("§D a cold-room homeland open still works (the event-row road)",
    await waitFor("Nora's homeland standing", () => w1.state?.hosted?.source === "homeland" && w1.state?.hosted?.hostName === ND.name),
    JSON.stringify(w1.state?.hosted) + " errors=" + JSON.stringify(n.errors.slice(-2)));
  n.close(); w1.close();

  const w2 = await watchRoom("doorfix-held");
  const h = await seat(HD, "doorfix-held");
  h.send({ type: "beaconOpen", source: "homeland" });
  ok("§D the held seed with NO first_seed_events row opens her homeland cold",
    await waitFor("Hilda's homeland standing", () => w2.state?.hosted?.source === "homeland" && w2.state?.hosted?.hostName === HD.name),
    JSON.stringify(w2.state?.hosted) + " errors=" + JSON.stringify(h.errors.slice(-2)));
  ok("§D no 'No first seed stands' refusal met her", !h.errors.some(e => e.includes("No first seed stands")), JSON.stringify(h.errors.slice(-2)));
  ok("§D the room's seed is HER held seed's own growth — level 2, fed 11",
    w2.state?.seed?.level === 2 && w2.state?.seed?.fedEnergy === 11, JSON.stringify(w2.state?.seed));
  ok("§D her ground is dealt whole — 127 tiles", w2.state?.map.length === 127, `map=${w2.state?.map.length}`);
  h.close(); w2.close();
}

console.log(`\nHOMELAND-DOOR DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
