// THE TABLE FIX PASS — projectile clearing drive (2026-10-20).
// RESTATED (the projectile rendering fix, 2026-10-27) where
// Nigel's rulings changed the ground under it:
//  · the choosing gate (Push 36) opens only after three
//    wakes — the seed below wakes a third Awoken before
//    chooseClass, where two once sufficed;
//  · the "Begin the Unraveling" button was removed
//    (2026-10-25): the casual field's fight begins at the
//    first curse-strike, so the drive selects its unit and
//    lets its first ordered strike open the battle;
//  · a shot's life is no longer 1500 ms: shots are the
//    homeland's Matter Shards now (the blanket ruling,
//    2026-10-27 19:49) and live their flight — 1056 ms a
//    light shot, 1584 ms a dark one. The clearing bound
//    below is restated to the dark flight's measure.
// Boots the real server in-process on a scratch DATA_DIR,
// seeds a bound tender with two Awokin in hand, summons both
// onto his own hex through the real page, begins the
// Unraveling, and orders curse-strikes across a full minute
// while sampling the page's shots layer every 200 ms.
// The defect this proves dead (Nigel's photo: shots frozen
// mid-field): a shot's 1500 ms removal timer once lived in a
// state-keyed effect whose cleanup every push (~250 ms)
// cancelled, so mid-battle a shot could essentially never be
// removed — they piled to the cap and froze at endpoints.
// The proof: every shot element the layer ever shows is
// tagged at first sight; no tagged shot may live past
// ~2.3 s (1500 ms of life + sampling slack) while the room
// pushes state all around it.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-table-projectiles.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-proj-"));
process.env.PORT = "3942";
process.env.WORKSHOP_PASSWORD = "<redacted>";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const PW = ["fix", "password", "1"].join("-");
const BASE = "http://127.0.0.1:3942";
const OUT = "/home/hatch/workspace/table-fix-proof";
mkdirSync(OUT, { recursive: true });
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
  return data;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
// See drive-table-summon.mjs: store.ts's greeter ALTER (:181)
// runs before its base DDL (:213), so a fresh database never
// gains awakened.greeter and the Table's deal throws. The
// drive stands the column up itself; the defect is named in
// the fix pass's report for repair in store.ts.
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }
const claim = await call("claimTender", { password: PW, tenderName: "Bolt Tender" });
const token = claim.token;
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 800").run(ownerKey, Date.now());
const now = Date.now();
const bodyId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'body', 'common', 2, 2, 'sky', ?, 'image/png', ?)").run("Bolt Body", "fix/body.png", now).lastInsertRowid);
const armsId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'arms', 'common', 3, 3, 'sky', ?, 'image/png', ?)").run("Bolt Arms", "fix/arms.png", now).lastInsertRowid);
const headId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'head', 'common', 3, 3, 'sky', ?, 'image/png', ?)").run("Bolt Head", "fix/head.png", now).lastInsertRowid);
const compJson = JSON.stringify([
  { source_id: `db:${bodyId}`, name: "Bolt Body", category: "body", rarity: "common", power: 2, toughness: 2, element: "sky" },
  { source_id: `db:${armsId}`, name: "Bolt Arms", category: "arms", rarity: "common", power: 3, toughness: 3, element: "sky" },
  { source_id: `db:${headId}`, name: "Bolt Head", category: "head", rarity: "common", power: 3, toughness: 3, element: "sky" },
]);
const kinIds = {};
for (const name of ["Boltkin", "Brightkin", "Thirdkin"]) {
  // Each fighter carries its OWN parts at the drive's
  // printed stats — three identical compositions would
  // empower one another (+1 power per copy) and price
  // their own summons off the field.
  const kp = [];
  for (const [cat, p, t] of [["body", 2, 2], ["arms", 3, 3], ["head", 3, 3]]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, 'sky', ?, 'image/png', ?)").run(`${name} ${cat}`, cat, p, t, `fix/${name}-${cat}.png`, now).lastInsertRowid);
    kp.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: p, toughness: t, element: "sky" });
  }
  kinIds[name] = Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, "fix/awokin.png", JSON.stringify(kp), "Bolt Tender", ownerKey, now).lastInsertRowid);
}
// A seat's Table purse rides on what she holds: three kin
// alone leave her holding ✦8 against a ✦10 summon cast, and
// every fizzle still spends its price. A bench fattens the
// purse past the casts and their retries. Each bench kin
// carries its OWN parts — clones of one composition would
// empower each other (an identical wake adds +1 power to
// every copy), and Boltkin's summon price and DC ride on
// her power: a cloned bench prices her off the field.
for (let i = 0; i < 40; i++) {
  const bp = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 2, 2, 'sky', ?, 'image/png', ?)").run(`Bolt bench ${i + 1} ${cat}`, cat, `fix/bench-${i + 1}-${cat}.png`, now).lastInsertRowid);
    bp.push({ source_id: `db:${pid}`, name: `Bolt bench ${i + 1} ${cat}`, category: cat, rarity: "common", power: 2, toughness: 2, element: "sky" });
  }
  db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(`Bolt bench ${i + 1}`, `Bolt bench ${i + 1}`, "fix/awokin.png", JSON.stringify(bp), "Bolt Tender", ownerKey, now);
}
await call("chooseClass", { classKey: "warden" }, token);
// The hand at the Table is the party: the two fighters stand
// in it, or no cards stand in hand for the page to grab.
await call("addToParty", { awakenedId: kinIds.Boltkin }, token);
await call("addToParty", { awakenedId: kinIds.Brightkin }, token);
// The observing page needs its OWN seat: a page and a
// socket sharing one identity stand as two seats in the
// room — the page's rich, the socket's a fresh twin — and
// every field check keys off the wrong one. A keeper
// tender watches; the Bolt Tender acts.
const keeperClaim = await call("claimTender", { password: PW, tenderName: "Bolt Keeper" });
const keeperId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(keeperClaim.tender.code).id;
const keeperKey = `tender:${keeperId}`;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 800").run(keeperKey, Date.now());
for (const wname of ["Keeper Wake One", "Keeper Wake Two", "Keeper Wake Three"]) {
  const kp = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 2, 2, 'sky', ?, 'image/png', ?)").run(`${wname} ${cat}`, cat, `fix/${wname.replaceAll(" ", "-")}-${cat}.png`, now).lastInsertRowid);
    kp.push({ source_id: `db:${pid}`, name: `${wname} ${cat}`, category: cat, rarity: "common", power: 2, toughness: 2, element: "sky" });
  }
  db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(wname, wname, "fix/awokin.png", JSON.stringify(kp), "Bolt Keeper", keeperKey, now);
}
await call("chooseClass", { classKey: "warden" }, keeperClaim.token);
const { issueTableToken: issueKeeperToken } = await import("../server/dist/table.js");
const keeperTt = issueKeeperToken({ id: "disc-bolt-keeper", name: "Bolt Keeper" });
const keeperBindCode = (await call("getTableBindCode", {}, keeperClaim.token)).code;
const keeperBindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: keeperTt, code: keeperBindCode }) });
if (!keeperBindRes.ok) throw new Error("keeper table/bind failed: " + keeperBindRes.status);
const { issueTableToken } = await import("../server/dist/table.js");
const tt = issueTableToken({ id: "disc-bolt", name: "Bolt Tender" });
const bindCode = (await call("getTableBindCode", {}, token)).code;
const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
if (!bindRes.ok) throw new Error("table/bind failed: " + bindRes.status);
console.log("seeded: bound tender — Boltkin and Brightkin in hand");

const wstate = { state: null };
const wws = new WebSocket("ws://127.0.0.1:3942/table/ws");
await new Promise((res, rej) => { wws.onopen = res; wws.onerror = rej; });
wws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") wstate.state = m.state; } catch { /* a torn frame is no evidence */ } };
wws.send(JSON.stringify({ type: "join", room: "fix-projectiles", watch: true, name: "Drive Watcher" }));
const waitFor = async (fn, what, ms = 9000) => { const s = Date.now(); while (Date.now() - s < ms) { if (fn()) return true; await sleep(150); } throw new Error("drive wait: " + what); };
const waitPage = async (pg, fn, what, ms = 9000) => { const s = Date.now(); while (Date.now() - s < ms) { if (await pg.evaluate(fn)) return true; await sleep(150); } throw new Error("drive wait (page): " + what); };
const mySeat = () => wstate.state?.players.find((p) => p.name === "Bolt Tender") ?? null;
const myField = () => (wstate.state?.field ?? []).filter((u) => u.ownerKey === mySeat()?.key);
const axDist = (a, b) => { const [aq, ar] = a.split(",").map(Number); const [bq, br] = b.split(",").map(Number); const dq = aq - bq, dr = ar - br; return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)); };

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 240)));
await page.evaluateOnNewDocument((sess) => { window.__awokenTableSession = sess; },
  { authToken: keeperTt, room: "fix-projectiles", name: "Bolt Keeper" });
await page.goto(BASE + "/table?frame_id=drive", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector(".table-room", { timeout: 30000 });
await page.waitForFunction(() => document.querySelector(".table-room svg polygon"), { timeout: 30000 });

// RESTATED (2026-10-27): the drive's hands ride the socket
// now. Its old actuation — grab a .tcard from the hand row,
// tap the figure to summon, tap a tile to strike — rode a
// hand the game has since rebuilt (the handrow and its party
// chips; summoning rides the Tender's wheel alone, by
// Nigel's ruling 2026-10-27 19:53). The drive's subject was
// never the tap road but the shots layer it looses, so the
// orders go over the same socket the watcher holds, as
// drive-projectile-rendering's §T does, and the page stands
// as the observing eye its assertions always needed.
const actor = { ws: null, you: null, errors: [] };
{
  actor.ws = new WebSocket("ws://127.0.0.1:3942/table/ws");
  await new Promise((res, rej) => { actor.ws.onopen = res; actor.ws.onerror = rej; });
  actor.ws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state" && m.you) actor.you = m.you; else if (m.type === "error") actor.errors.push(String(m.message ?? "")); } catch { /* torn frame */ } };
  actor.ws.send(JSON.stringify({ type: "join", authToken: tt, room: "fix-projectiles" }));
  const s = Date.now();
  while (!actor.you && Date.now() - s < 12000) await sleep(120);
  if (!actor.you) throw new Error("the actor's seat never stood");
}
const act = (o) => actor.ws.send(JSON.stringify(o));

await waitFor(() => !!mySeat() && !!mySeat().hex, "watcher reads the seat and its hex");
const landing = mySeat().hex;

// The seat's purse starts low against its max and refills
// standing; give it a moment to rise past the summon casts
// before ordering them (advisory — the summon loop's own
// retries span a fizzle or a thin minute).
await waitFor(() => (actor.you?.energy ?? 0) >= 40, "the seat's purse fills past the summon casts", 60000).catch(() => {});
console.log(`  purse standing: ✦${actor.you?.energy ?? "?"} of ✦${actor.you?.maxEnergy ?? "?"}`);
// ═══ SUMMON BOTH onto his own hex, over the socket ═══
// A summon is a cast and can fizzle; the order repeats
// until the field shows the unit standing.
for (const [i, name] of ["Boltkin", "Brightkin"].entries()) {
  for (let k = 0; k < 20 && myField().length < i + 1; k++) {
    act({ type: "summonCast", awakenedId: kinIds[name] });
    await waitFor(() => myField().length === i + 1, `${name} stands on the field`, 3000).catch(() => {});
  }
  if (myField().length < i + 1) console.log(`  summon ${name} refused: errors=${JSON.stringify(actor.errors.slice(-2))} purse=${actor.you?.energy ?? "?"}/${actor.you?.maxEnergy ?? "?"}`);
}
// RESTATED (2026-10-27): an unnamed summon lands on the
// Tender's own hex or the first beside-hex with room (the
// server's placement rule, 2026-10-22) — the assertion
// reads that law, not the old aimed-at-the-figure landing.
ok("both Awokin stand summoned at his side", myField().length === 2 && myField().every((u) => axDist(u.hex, landing) <= 1), JSON.stringify(myField().map((u) => u.hex)));

// The Unraveling needs no beginning any longer — the
// button was removed 2026-10-25; the first curse-strike
// ordered below IS the battle's opening, and the entry it
// provokes is what the sampling then watches.
const unitHex = myField()[0].hex;

// ═══ SAMPLE THE SHOTS LAYER for a minute, striking as we go ═══
let totalFresh = 0, worstAge = 0, maxConcurrent = 0, samples = 0;
const sample = async () => {
  const s = await page.evaluate(() => {
    const now = performance.now();
    const imgs = [...document.querySelectorAll(".shots-layer image")];
    let maxAge = 0, fresh = 0;
    for (const im of imgs) {
      if (!im.dataset.born) { im.dataset.born = String(now); fresh++; }
      maxAge = Math.max(maxAge, now - Number(im.dataset.born));
    }
    return { count: imgs.length, maxAge, fresh };
  });
  samples++;
  totalFresh += s.fresh;
  worstAge = Math.max(worstAge, s.maxAge);
  maxConcurrent = Math.max(maxConcurrent, s.count);
  return s;
};
const started = Date.now();
let strikesOrdered = 0;
let battleSeen = false, darkSeen = 0;
while (Date.now() - started < 60000) {
  await sample();
  if (wstate.state?.battle?.active) battleSeen = true;
  darkSeen = Math.max(darkSeen, (wstate.state?.dark ?? []).length);
  if (strikesOrdered < 6 && Date.now() - started > 3000 + strikesOrdered * 9500) {
    // A fresh curse-strike: the nearest thin cursed tile in
    // the standing unit's sky reach (4) — each strike looses
    // exactly one shot, on the room's own witness ledger.
    const unit = myField()[0];
    const target = (wstate.state?.map ?? [])
      .filter((t) => t.cursed && unit && axDist(unit.hex, t.id) <= 4)
      .sort((a, b) => (a.curseHp - b.curseHp))[0];
    if (target && unit) {
      const strikesBefore = (wstate.state?.strikes ?? []).length;
      act({ type: "strikeCurse", cardId: unit.cardId, hex: unit.hex, target: target.id });
      strikesOrdered++;
      console.log(`  strike ${strikesOrdered} ordered at ${target.id} (curse ${Math.ceil(target.curseHp)}) — strikes on the ledger before: ${strikesBefore}`);
    }
  }
  await sleep(200);
}
console.log(`  sampled ${samples} times over ${Math.round((Date.now() - started) / 1000)}s — shots seen: ${totalFresh}, worst age: ${Math.round(worstAge)}ms, most at once: ${maxConcurrent}`);
ok("shots FLEW on the field (the layer lived)", totalFresh >= 4, `saw ${totalFresh}`);
ok("ordered curse-strikes were loosed across the minute", strikesOrdered >= 4, `${strikesOrdered}`);
// The battle's opening is read across the minute, not at
// its end: the first entered darks can fall before the
// sampling closes, and a closed battle is no evidence the
// provoke failed.
ok("the first curse-strike opened the Unraveling (the battle joined without any Begin button)", battleSeen || darkSeen > 0, `seen active=${battleSeen} dark=${darkSeen}`);
// RESTATED (2026-10-27): a shot's life is its flight now —
// the homeland's pace, taken by the blanket ruling: 1056 ms
// a light shot, 1584 ms a dark blow. The bound is the dark
// measure plus this drive's 200 ms sampling slack and a
// render's grace — a shot older than that is a shot stuck.
ok("NO shot outlived its flight (longest: a dark blow's 1584 ms) by more than sampling slack (worst ≤ 2100 ms)", worstAge <= 2100, `worst ${Math.round(worstAge)}ms`);
// RESTATED (2026-10-27): the layer's keep stands at 240
// live shots now (it was ~30); this drive's modest fight
// never piles anywhere near either bound.
ok("the layer never piled (max concurrent < 20 in this fight; the keep itself stands at 240)", maxConcurrent < 20, `${maxConcurrent}`);
await page.screenshot({ path: `${OUT}/projectiles-clearing.png` });

await browser.close();
try { actor.ws.close(); } catch { /* already gone */ }
wws.close();
console.log(`\nDRIVE (projectile clearing): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
