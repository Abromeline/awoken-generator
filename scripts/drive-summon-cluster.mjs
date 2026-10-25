// THE SUMMON CLUSTER — DIAGNOSIS + PROOF (Nigel's live play
// report, 2026-10-24 23:01): after a summon on the homeland —
//   1. the screen is very very flashy, lots of clipping;
//   2. the Tender figure VANISHES when the summoned Awoken
//      pops up, until a reload;
//   3. summoned Awoken DO NOT FOLLOW (still not after reload);
//   4. Awoken do nothing — they do not shoot enemies in reach.
// Boots the real server on a scratch DATA_DIR and the real
// built client in headless Chrome, summons through the wheel
// with real clicks, and MEASURES each symptom:
//   §A the Tender's figure in the drawing before/after summon;
//   §B the page's own getTerritory polling (a dead read loop
//      starves the lazy settlement — nothing follows, nothing
//      strikes) + render churn (mutations + image churn over
//      fixed windows, before vs after the summon);
//   §C following: the Tender's stand moves (setTenderTile) and
//      the follower musters to his ring — server record first,
//      then its drawn figure closing on the Tender's figure;
//   §D striking: a dark stands in the follower's reach and the
//      engine's strikes land on it (strikes served + its hp
//      falls), the reads driven as the page drives them.
//   §A2 churn IN a live battle (the flash measured where it
//      lives: strikes flying, the map's clock ticking);
//   §F the wake is spoken: the Tender falls in the curse and
//      wakes across the land — the notice must say so;
//   §H a follower's fall is spoken the same way;
//   §G the read loop cannot wedge: a getTerritory request is
//      held unanswered, and the loop must give it up as lost
//      and read again on its own.
// Screenshots land in ~/workspace/summon-cluster-proof/.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-summon-cluster.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

const OUT = "/home/hatch/workspace/summon-cluster-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-cluster-"));
process.env.PORT = "3993";
process.env.WORKSHOP_PASSWORD = "cluster-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3993";
const PW = "cluster-drive-password";
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
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up */ }

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

function seedAwokin(ownerKey, tenderName, name, partPower = 2, element = "root") {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, partPower, partPower, element, `cluster/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: partPower, toughness: partPower, element });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `cluster/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
async function claimWithExp(name, exp) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, exp, Date.now());
  return { token: claim.token, ownerKey };
}

/* ══ SEED ════════════════════════════════════════════════ */
const S = await claimWithExp("Cluster Tender", 3800); // Lv 10
{
  const now = Date.now();
  db.prepare(`INSERT INTO tender_progress (owner_key, class_key, weapon_key, hp, weapon_next_at, updated_at)
    VALUES (?, 'warden', 'sword', 100, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', hp = 100`).run(S.ownerKey, now + 600000, now);
}
const friend = seedAwokin(S.ownerKey, "Cluster Tender", "Cluster Friend", 3, "root"); // power 9, toughness 9 — she must outlive her own witness fight
await call("addToParty", { awakenedId: friend }, S.token);
const witness = seedAwokin(S.ownerKey, "Cluster Tender", "Cluster Witness", 3, "root"); // §H's own: summoned fresh at the woken stand, so her fall owes nothing to earlier sections
await call("addToParty", { awakenedId: witness }, S.token);
const tileIdAt = new Map();
{
  const now = Date.now();
  const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', 0, ?)");
  for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > 3) continue;
    tileIdAt.set(`${q},${r}`, Number(insTile.run(S.ownerKey, q, r, now).lastInsertRowid));
  }
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?)").run(S.ownerKey, now);
}
const terr0 = await call("getTerritory", {}, S.token);
const standTile0 = (terr0.tiles ?? []).find(t => t.id === terr0.tender?.tileId);
console.log("seed: stand at", standTile0 && [standTile0.q, standTile0.r], "company:", (terr0.summoning?.company ?? []).map(c => c.name));

/* ══ BROWSER ═════════════════════════════════════════════ */
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
const pageErrors = [];
page.on("pageerror", (e) => { pageErrors.push(String(e)); console.log("[pageerror]", String(e).slice(0, 300)); });
page.on("console", (m) => { if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 300)); });
let terrRequests = 0;
page.on("request", (r) => { if (r.url().includes("/api/getTerritory")) terrRequests++; });
page.on("response", async (r) => {
  if (r.status() >= 400 && r.url().includes("/api/")) {
    let body = "";
    try { body = (await r.text()).slice(0, 220); } catch { /* gone */ }
    console.log(`[http ${r.status()}]`, r.url().replace(BASE, ""), body);
  }
});
await page.evaluateOnNewDocument((tok) => {
  window.localStorage.setItem("awoken-tender-token", tok);
  // The churn ledger: every DOM mutation, and every image
  // added/removed, counted for whoever asks.
  window.__churn = { mutations: 0, imgAdded: 0, imgRemoved: 0, started: Date.now() };
  const obs = new MutationObserver((recs) => {
    for (const r of recs) {
      window.__churn.mutations++;
      for (const n of r.addedNodes) if (n.nodeName === "image" || n.nodeName === "IMG") window.__churn.imgAdded++;
      for (const n of r.removedNodes) if (n.nodeName === "image" || n.nodeName === "IMG") window.__churn.imgRemoved++;
    }
  });
  window.__startChurn = () => { window.__churn = { mutations: 0, imgAdded: 0, imgRemoved: 0, started: Date.now() }; obs.observe(document, { subtree: true, childList: true, attributes: true }); };
}, S.token);
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
await sleep(2500);
const door = await page.$(".deck-button");
if (!door) throw new Error("territory: no .deck-button on the home face");
await door.click();
await page.waitForFunction(() => !!window.__tenderJump && !!window.__tenderJump.pos(), { timeout: 30000 });
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Skip");
  if (b) b.click();
  window.__startChurn();
});
await sleep(800);

const tenderDrawn = () => page.evaluate(() => [...document.querySelectorAll("image")].some(i => (i.getAttribute("href") || "").includes("warden-")));
const figRect = (id) => page.evaluate((fid) => {
  const g = document.querySelector(`g[data-summon-fig="${fid}"]`);
  if (!g) return null;
  const r = g.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}, id);
const tenderRect = () => page.evaluate(() => {
  const img = [...document.querySelectorAll("image")].find(i => (i.getAttribute("href") || "").includes("warden-"));
  if (!img) return null;
  const r = img.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
const churn = () => page.evaluate(() => ({ ...window.__churn, spanMs: Date.now() - window.__churn.started }));

/* ══ §A BEFORE THE SUMMON ════════════════════════════════ */
console.log("§A before the summon — the Tender stands drawn, the page reads the land");
ok("the Tender's figure is drawn before any summon", await tenderDrawn());
await page.evaluate(() => { window.__churn = { mutations: 0, imgAdded: 0, imgRemoved: 0, started: Date.now() }; });
const reqBefore = terrRequests;
await sleep(3000);
const churnBefore = await churn();
ok("the page keeps reading the land (getTerritory polls)", terrRequests - reqBefore >= 1, `requests in 3s: ${terrRequests - reqBefore}`);
console.log("  churn before summon (3s):", JSON.stringify(churnBefore));
await page.screenshot({ path: `${OUT}/1-before-summon.png` });

/* ══ THE SUMMON, THROUGH THE WHEEL ═══════════════════════ */
console.log("§B the summon — the pick casts; what breaks when the figure pops in");
const clickDisc = async (sel, txt) => {
  const handle = await page.evaluateHandle((q, t) => [...document.querySelectorAll(q)].find((d) => ((d.getAttribute("aria-label") || "") + " " + (d.textContent || "")).includes(t)), sel, txt);
  const el = handle.asElement();
  if (!el) throw new Error("wheel disc not found: " + txt);
  // The wheel fans its discs out; wait for the box to hold
  // still across two reads before clicking its centre, so
  // the click is thrown at the disc it names.
  let box = await el.boundingBox();
  for (let i = 0; i < 12; i++) {
    await sleep(160);
    const next = await el.boundingBox();
    if (next && box && Math.abs(next.x - box.x) < 1 && Math.abs(next.y - box.y) < 1) { box = next; break; }
    box = next;
  }
  if (!box) throw new Error("wheel disc has no box: " + txt);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};
const pickFriend = async () => {
  await page.mouse.click(420, 300, { button: "right" });
  await page.waitForSelector(".gw-wheel", { timeout: 9000 });
  await clickDisc(".gw-disc.cat", "Awoken");
  await sleep(600);
};
let stood = false;
for (let i = 0; i < 10 && !stood; i++) {
  // Refill before EVERY pick: the seeded purse is clamped
  // to its cap (a few casts' worth), and a faltered cast is
  // charged like a landed one — a retry loop that does not
  // refill starves itself and every later pick is refused
  // "Not enough energy" (the flake that haunted this
  // section: the clicks were landing all along).
  db.prepare("UPDATE tender_resources SET energy = 5000 WHERE owner_key = ?").run(S.ownerKey);
  await pickFriend();
  await clickDisc(".gw-disc", "Cluster Friend");
  await sleep(1200);
  const t = await call("getTerritory", {}, S.token);
  stood = (t.placements ?? []).some((p) => p.awakenedId === friend);
}
ok("the summon lands through the real page", stood);
const prow = db.prepare("SELECT follow, tile_id, pos_q, pos_r FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(S.ownerKey, friend);
ok("the landed summon's record follows (follow = 1, the summon gate's law)", prow?.follow === 1, JSON.stringify(prow));
await sleep(2500);
ok("the summoned figure is drawn (data-summon-fig)", !!(await figRect(friend)));
await page.screenshot({ path: `${OUT}/2-after-summon.png` });

/* ══ §A/B AFTER THE SUMMON ═══════════════════════════════ */
console.log("§A/B after the summon — the Tender, the read loop, the churn");
ok("SYMPTOM 2: the Tender's figure is STILL drawn after the summon", await tenderDrawn());
const reqAfter0 = terrRequests;
await page.evaluate(() => { window.__churn = { mutations: 0, imgAdded: 0, imgRemoved: 0, started: Date.now() }; });
await sleep(3000);
const churnAfter = await churn();
const reqAfter = terrRequests - reqAfter0;
ok("the page still reads the land after the summon (the read loop lives)", reqAfter >= 1, `requests in 3s: ${reqAfter}`);
console.log("  churn after summon (3s):", JSON.stringify(churnAfter), "vs before:", JSON.stringify(churnBefore));
ok("SYMPTOM 1: render churn after the summon is sane (not a flicker storm)",
  churnAfter.mutations < Math.max(400, churnBefore.mutations * 4),
  `mutations after=${churnAfter.mutations} before=${churnBefore.mutations}`);
ok("no page errors through the summon", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 300));

/* ══ §C FOLLOWING ════════════════════════════════════════ */
console.log("§C following — the Tender's stand moves three hexes; the follower musters to his ring");
const destKey = (() => {
  // a tile 3 hexes from the current stand
  for (const [k, id] of tileIdAt) {
    const [q, r] = k.split(",").map(Number);
    if (hexDist({ q, r }, standTile0) === 3) return { q, r, id };
  }
  return null;
})();
await call("setTenderTile", { tileId: destKey.id }, S.token);
let musterSeen = false, homeSeen = false;
for (let i = 0; i < 25 && !homeSeen; i++) {
  const t = await call("getTerritory", {}, S.token);
  const p = (t.placements ?? []).find((x) => x.awakenedId === friend);
  if (p?.marchPath) musterSeen = true;
  const pt = (t.tiles ?? []).find((x) => x.id === p?.tileId);
  if (pt && hexDist(pt, destKey) <= 1) homeSeen = true;
  if (!homeSeen) await sleep(1000);
}
ok("the follower is mustered (a march is written for it)", musterSeen);
ok("SYMPTOM 3: the follower comes home to the Tender's ring (tile within 1 of the new stand)", homeSeen);
// The drawn figure closes on the Tender's drawn figure.
await sleep(1500);
const fr = await figRect(friend), tr = await tenderRect();
const drawnGap = fr && tr ? Math.hypot(fr.x - tr.x, fr.y - tr.y) : null;
ok("the follower's drawn figure stands at the Tender's side on screen", drawnGap !== null && drawnGap < 190, `gap px: ${drawnGap}`);
await page.screenshot({ path: `${OUT}/3-followed.png` });

/* ══ §D STRIKING ════════════════════════════════════════ */
console.log("§D striking — a dark stands in the follower's reach; the engine answers in real time");
// Real time, the way the page reads: no watermark hammering.
// (Hammering the watermark back manufactures hundreds of
// simulated seconds per read — the witness dark outlives
// the follower under them, and the cadence tick sits past
// every forced window's end. The engine's own cadence,
// read as the page reads it, is the honest measure.)
const prowNow = db.prepare("SELECT tile_id, pos_q, pos_r FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(S.ownerKey, friend) ?? { tile_id: tileIdAt.get("0,0"), pos_q: 0, pos_r: 0 };
const darkTileId = tileIdAt.get(`${Math.round(prowNow.pos_q) + 2},${Math.round(prowNow.pos_r)}`) ?? prowNow.tile_id;
const darkId = Number(db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
  VALUES (?, ?, 'fray', ?, 500, ?, ?, 1, 1, 0)`).run(S.ownerKey, darkTileId, Date.now(), prowNow.pos_q + 2, prowNow.pos_r).lastInsertRowid);
let struck = false, darkHurt = false;
for (let i = 0; i < 22 && !(struck && darkHurt); i++) {
  const t = await call("getTerritory", {}, S.token);
  if ((t.strikes ?? []).some((s) => s.awakenedId === friend && s.wandererId === darkId)) struck = true;
  const d = db.prepare("SELECT hp FROM homeland_wanderers WHERE id = ?").get(darkId);
  if (!d || d.hp < 498) darkHurt = true;
  console.log(`  §D[${i}] strikes by the follower:`, JSON.stringify((t.strikes ?? []).filter(s => s.awakenedId === friend).map(s => [s.wandererId, s.hit, s.dmg])), "dark hp:", d?.hp);
  if (!(struck && darkHurt)) await sleep(1500);
}
ok("SYMPTOM 4: the follower's own strike is served against the dark in her reach", struck);
ok("SYMPTOM 4: the dark's hp falls under the follower's blows", darkHurt);
// Her witness fight is done: restore her wounds drive-side,
// so the sections after this one measure state, not whether
// a low shield roll happened to run out under the dark's
// teeth (a lawful death, but not what §E/§F are measuring).
db.prepare("UPDATE field_placements SET hp = 9, shield = shield_max WHERE owner_key = ? AND awakened_id = ?").run(S.ownerKey, friend);
await page.screenshot({ path: `${OUT}/4-striking.png` });

/* ══ §A2 CHURN IN A LIVE BATTLE ══════════════════════════ */
console.log("§A2 churn in a live battle — the flash measured where it lives");
await page.evaluate(() => { window.__churn = { mutations: 0, imgAdded: 0, imgRemoved: 0, started: Date.now() }; });
await sleep(5000);
const churnBattle = await churn();
console.log("  churn in battle (5s):", JSON.stringify(churnBattle));
ok("SYMPTOM 1: battle churn is bounded (one clock, not a stack of them)",
  churnBattle.mutations < 6000, `mutations in 5s of live battle: ${churnBattle.mutations}`);
ok("SYMPTOM 1: no image churn in battle (art is not re-fetched or re-mounted)",
  churnBattle.imgAdded + churnBattle.imgRemoved < 12, `img +${churnBattle.imgAdded} -${churnBattle.imgRemoved}`);
// The witness fight is over: every dark leaves the field so
// the reload section measures state, not a siege.
db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(S.ownerKey);
await call("getTerritory", {}, S.token);
const prowAlive = db.prepare("SELECT follow FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(S.ownerKey, friend);
ok("the follower still stands, following, after her fight", prowAlive?.follow === 1, JSON.stringify(prowAlive));

/* ══ §E RELOAD — the state must hold on a fresh page ══════ */
console.log("§E reload — Nigel reloaded and things were the same; the fixed state must survive it");
db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(S.ownerKey); // the witness dark leaves before the reload
await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
await sleep(2500);
const door2 = await page.$(".deck-button");
if (door2) await door2.click();
await page.waitForFunction(() => !!window.__tenderJump && !!window.__tenderJump.pos(), { timeout: 30000 });
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Skip");
  if (b) b.click();
});
await sleep(1500);
ok("after reload the Tender's figure is drawn", await tenderDrawn());
ok("after reload the summoned figure is drawn", !!(await figRect(friend)));
const prowEnd = db.prepare("SELECT follow FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(S.ownerKey, friend);
ok("after reload the follower still follows in the record", prowEnd?.follow === 1, JSON.stringify(prowEnd));
ok("no page errors across the whole drive", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 300));

/* ══ §F THE WAKE IS SPOKEN ═══════════════════════════════ */
console.log("§F the wake is spoken — the Tender falls in the curse and wakes across the land");
{
  // The ground under the Tender's feet turns to curse and his
  // strength is spent to the edge: the curse wears him down
  // beat on beat (the page's own reads settle it), he falls,
  // and wakes at the land's safe hex — far from where he fell.
  const tNow = await call("getTerritory", {}, S.token);
  db.prepare("UPDATE territory_tiles SET cursed = 1 WHERE id = ?").run(tNow.tender.tileId);
  db.prepare("UPDATE tender_progress SET hp = 2 WHERE owner_key = ?").run(S.ownerKey);
  let wakeSpoken = false;
  try {
    await page.waitForFunction(() => document.body.innerText.includes("You fell in the curse"), { timeout: 90000 });
    wakeSpoken = true;
  } catch { /* the notice never came */ }
  ok("SYMPTOM 2: when the Tender wakes on different ground, the land says so", wakeSpoken);
  const tAfter = await call("getTerritory", {}, S.token);
  ok("the Tender indeed woke on a different tile than he fell on", tAfter.tender && tAfter.tender.tileId !== tNow.tender.tileId && !tAfter.tender.down,
    `fell on ${tNow.tender.tileId}, woke on ${tAfter.tender?.tileId} down=${tAfter.tender?.down}`);
  await page.screenshot({ path: `${OUT}/5-wake-spoken.png` });
}

/* ══ §H A FOLLOWER'S FALL IS SPOKEN ═════════════════════ */
console.log("§H a follower's fall is spoken — she is bitten down and the land says she went home");
{
  // §H's own follower, summoned fresh at the woken Tender's
  // side — her fall must owe nothing to earlier sections
  // (the first Friend may herself have been worn down by
  // the curse §F laid under the Tender's feet; that is the
  // cluster's own law at work, and §H does not borrow her).
  let landed = false;
  for (let i = 0; i < 24 && !landed; i++) {
    db.prepare("UPDATE tender_resources SET energy = 5000 WHERE owner_key = ?").run(S.ownerKey);
    const r = await call("summonAwoken", { awakenedId: witness }, S.token);
    landed = !!r.summoned;
  }
  ok("the witness summon lands at the woken Tender's side", landed);
  const tNow = await call("getTerritory", {}, S.token);
  const mine = (tNow.placements ?? []).find((p) => p.awakenedId === witness);
  ok("the witness stands placed on the field", !!mine, JSON.stringify(tNow.placements?.length));
  // Spend her shield and all but a thread of her strength,
  // and set a fray at her shoulder: one bite ends her, the
  // placement stops being served, and the notice must name
  // her fall — the silence that read as "not following,
  // doing nothing" in the live report.
  const fTile = (tNow.tiles ?? []).find((t) => t.id === mine?.tileId);
  db.prepare("UPDATE field_placements SET hp = 1, shield = 0 WHERE owner_key = ? AND awakened_id = ?").run(S.ownerKey, witness);
  if (mine) db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
    VALUES (?, ?, 'fray', ?, 500, ?, ?, 3, 1, 0)`).run(S.ownerKey, mine.tileId, Date.now(), (fTile?.q ?? 0) + 0.5, fTile?.r ?? 0);
  let fallSpoken = false;
  try {
    await page.waitForFunction(() => document.body.innerText.includes("Cluster Witness has fallen"), { timeout: 60000 });
    fallSpoken = true;
  } catch { /* the notice never came */ }
  ok("SYMPTOM 3/4: when a follower falls, the land says she went home", fallSpoken);
  const prowGone = db.prepare("SELECT id FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(S.ownerKey, witness);
  ok("the fallen follower's placement is gone (she is back in hand)", !prowGone, JSON.stringify(prowGone));
  await page.screenshot({ path: `${OUT}/6-fall-spoken.png` });
}

/* ══ §G THE READ LOOP CANNOT WEDGE ═══════════════════════ */
console.log("§G the read loop cannot wedge — a read is held unanswered; the loop must read again");
{
  await page.setRequestInterception(true);
  let held = 0, seen = 0;
  const holdHandler = (req) => {
    if (req.url().includes("/api/getTerritory")) {
      seen++;
      if (held === 0) { held++; return; } // never answered: the hung read
    }
    req.continue().catch(() => {});
  };
  page.on("request", holdHandler);
  const t0 = Date.now();
  let readAgain = false;
  while (Date.now() - t0 < 45000) {
    if (seen >= 2) { readAgain = true; break; }
    await sleep(500);
  }
  ok("SYMPTOM 3/4: the loop gives a lost read up and reads again (no reload needed)", readAgain,
    `getTerritory requests after arming: ${seen} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  page.off("request", holdHandler);
  await page.setRequestInterception(false);
}

await page.close();
await browser.close();
console.log(`\nSUMMON CLUSTER DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
