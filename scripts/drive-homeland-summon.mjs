// THE HOMELAND WHEEL SUMMON — THE FIX BUILD'S DRIVE
// (2026-10-22). Boots the real server on a scratch DATA_DIR
// and the real built client in headless Chrome, and proves
// Nigel's summoning law on the homeland:
//   §A THE CAST (API): the wheel's company is served with
//      the field (the party, minus fielded/staged/re-
//      coalescing); the pick is a cast with NO tile named —
//      the server lands the Awokin on the Tender's tile or
//      a free beside-tile; the purse is charged BEFORE the
//      roll (a forced falter spends the full price and
//      stands nothing); standing in cursed land the cast
//      carries the −3 in its reckoning; a non-party Awokin
//      cannot be summoned; the retired hand road fields
//      nothing (deployAwoken is gone; deployBattle refuses
//      quiet ground and keeps only its assault on cursed
//      ground). §G CONTROL: a Lv 1 Tender with no party
//      stars and no summon skills casts at the base
//      arithmetic — summoner's power 0, DC = 10 + power.
//   §B THE WHEEL ITSELF (browser): right-click → the
//      Awoken branch lists the party with its ✦ cost (and
//      the curse note while the Tender stands in curse);
//      picking the entry casts — the figure stands beside
//      the Tender with no ground tap anywhere. Screenshots
//      land in ~/workspace/summon-proof/.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-homeland-summon.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

const OUT = "/home/hatch/workspace/summon-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-hsummon-"));
process.env.PORT = "3981";
process.env.WORKSHOP_PASSWORD = "hs ummon-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3981";
const PW = "hsummon-drive-password";
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
async function callRaw(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data: data?.data ?? data };
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up, as the other drives do */ }

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

function seedAwokin(ownerKey, tenderName, name, partPower = 2) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, 'root', ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, partPower, partPower, `hsummon/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: partPower, toughness: partPower, element: "root" });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `hsummon/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
async function claimWithExp(name, exp) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, exp, Date.now());
  return { token: claim.token, ownerKey };
}
const energyOf = (ownerKey) => db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(ownerKey).energy;
const placedOf = (ownerKey, id) => db.prepare("SELECT COUNT(*) AS n FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(ownerKey, id).n;

/* ══ §A THE CAST, AT THE API ══════════════════════════════ */
console.log("§A the homeland cast — no target, purse before roll, the curse's −3, the party gate");
{
  // §G CONTROL: Lv 1, no stars of any kind — base arithmetic.
  const G = await claimWithExp("Plain Summoner", 0);
  // The class is written directly (classes wake at Lv 3 by
  // the choosing door; this control tender stays Lv 1 on
  // purpose — its class grants no summon gift and its
  // level grants no summoner's power either way).
  db.prepare("UPDATE tender_progress SET class_key = 'warden' WHERE owner_key = ?").run(G.ownerKey);
  const plain = seedAwokin(G.ownerKey, "Plain Summoner", "Plain Member", 2);   // power 6
  const giant = seedAwokin(G.ownerKey, "Plain Summoner", "Giant Member", 30);  // power 90 — DC 100: only a natural 20 lands
  const third = seedAwokin(G.ownerKey, "Plain Summoner", "Third Member", 2);   // power 6
  const outsider = seedAwokin(G.ownerKey, "Plain Summoner", "No Member", 2);
  for (const id of [plain, giant, third]) await call("addToParty", { awakenedId: id }, G.token);
  const now = Date.now();
  const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', ?, ?)");
  const heart = Number(insTile.run(G.ownerKey, 0, 0, 0, now).lastInsertRowid);
  const east = Number(insTile.run(G.ownerKey, 1, 0, 0, now).lastInsertRowid);
  const cursedEast = Number(insTile.run(G.ownerKey, 2, 0, 1, now).lastInsertRowid);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 100000, ?)").run(G.ownerKey, now);

  const terr = await call("getTerritory", {}, G.token);
  ok("the field serves the wheel's company — the party, in party order",
    JSON.stringify((terr.summoning?.company ?? []).map(c => c.awakenedId)) === JSON.stringify([plain, giant, third]),
    JSON.stringify(terr.summoning?.company?.map(c => c.name)));
  ok("the company carries each member's summon price (power, in ✦)",
    terr.summoning.company.find(c => c.awakenedId === plain)?.cost === 6
    && terr.summoning.company.find(c => c.awakenedId === giant)?.cost === 90,
    JSON.stringify(terr.summoning.company.map(c => [c.name, c.cost])));
  ok("§G control: the seat carries summoner's power 0 — no stars, no levels, no Sage",
    terr.summoning.summonersPower === 0, String(terr.summoning.summonersPower));
  ok("the Tender stands on clean ground — no curse term stands",
    terr.summoning.standCursed === false && terr.tender?.tileId === heart,
    JSON.stringify({ standCursed: terr.summoning.standCursed, stand: terr.tender?.tileId, heart }));

  // A non-party Awokin cannot be summoned.
  const e0 = energyOf(G.ownerKey);
  const noMember = await callRaw("summonAwoken", { awakenedId: outsider }, G.token);
  ok("a non-party Awokin cannot be summoned — the party's plain voice refuses",
    noMember.status === 400 && /is not in your party/.test(noMember.data?.error ?? ""), JSON.stringify(noMember.data));
  ok("the refusal spent nothing and fielded nothing", energyOf(G.ownerKey) === e0 && placedOf(G.ownerKey, outsider) === 0);

  // THE FORCED FALTER: the Giant's DC is 100 — every cast
  // but a natural 20 falters; each attempt must spend the
  // full ✦90 BEFORE its roll and stand nothing.
  let falter = null, falterSpend = 0;
  for (let i = 0; i < 40 && !falter; i++) {
    const before = energyOf(G.ownerKey);
    const r = await call("summonAwoken", { awakenedId: giant }, G.token);
    if (r.faltered) { falter = r; falterSpend = before - energyOf(G.ownerKey); }
    else break; // a natural 20 landed it — astronomically against us; stop and let the check speak
  }
  ok("a falter spends the price and stands nothing",
    !!falter && falterSpend === 90 && placedOf(G.ownerKey, giant) === (falter ? 0 : 1),
    falter ? `spent ${falterSpend}` : "the Giant landed on a natural 20 before any falter");
  ok("the falter's reckoning is whole — roll, DC 100 (10 + power 90), cost 90, no curse term",
    !!falter && falter.dc === 100 && falter.cost === 90 && falter.curse === 0 && falter.summonersPower === 0,
    JSON.stringify(falter));

  // The plain member lands — no tile named anywhere; the
  // server chooses the Tender's own tile or a free beside it.
  let landed = null;
  for (let i = 0; i < 16 && !landed; i++) {
    const r = await call("summonAwoken", { awakenedId: plain }, G.token);
    if (r.summoned) landed = r;
  }
  ok("the member is summoned by the cast — it stands fielded", !!landed && placedOf(G.ownerKey, plain) === 1);
  ok("§G control: the cast's arithmetic is the base — DC 16 (10 + power 6), summoner's power 0, no gift, no curse",
    !!landed && landed.dc === 16 && landed.summonersPower === 0 && landed.gift === 0 && landed.curse === 0,
    JSON.stringify(landed));
  const landTile = db.prepare("SELECT q, r FROM territory_tiles WHERE id = ?").get(landed.tileId);
  ok("the landing is the Tender's own tile or a free beside-tile (dist ≤ 1), chosen by the server",
    !!landTile && hexDist(landTile, { q: 0, r: 0 }) <= 1, JSON.stringify(landTile));

  // THE CURSE'S −3: the Tender walks east onto cursed ground
  // (his stand moves by the standing verb), and the cast's
  // reckoning carries −3 on every attempt.
  await call("setTenderTile", { tileId: cursedEast }, G.token);
  const terr2 = await call("getTerritory", {}, G.token);
  ok("standing in cursed land, the served company read carries the curse",
    terr2.summoning.standCursed === true && terr2.tender?.tileId === cursedEast,
    JSON.stringify({ standCursed: terr2.summoning.standCursed, stand: terr2.tender?.tileId }));
  let cursedLand = null, cursedTerms = 0, cursedTries = 0;
  for (let i = 0; i < 45 && !cursedLand; i++) {
    const r = await call("summonAwoken", { awakenedId: third }, G.token);
    cursedTries++;
    if (r.curse === -3) cursedTerms++;
    if (r.summoned) cursedLand = r;
  }
  ok("every cast from cursed ground carries the −3 in its reckoning",
    cursedTries > 0 && cursedTerms === cursedTries, `${cursedTerms}/${cursedTries}`);
  ok("the third member lands all the same, beside the Tender's cursed stand",
    !!cursedLand && placedOf(G.ownerKey, third) === 1);
  void east;

  // THE HAND ROAD FIELDS NOTHING.
  const gone = await callRaw("deployAwoken", { awakenedId: outsider, tileId: heart }, G.token);
  ok("the retired deployAwoken no longer answers at all", gone.status >= 400, JSON.stringify(gone.data).slice(0, 120));
  const quiet = await callRaw("deployBattle", { awakenedIds: [third], tileId: heart }, G.token);
  ok("the readied company fields nothing on quiet ground — the wheel word answers",
    quiet.status === 400 && /Quiet ground takes no assault/.test(quiet.data?.error ?? ""), JSON.stringify(quiet.data));
  const assault = await callRaw("deployBattle", { awakenedIds: [giant], tileId: cursedEast }, G.token);
  ok("on cursed ground the assault road still answers as battle entry — never with the quiet-ground word",
    !/Quiet ground takes no assault/.test(assault.data?.error ?? ""),
    JSON.stringify(assault.data).slice(0, 160));
}

/* ══ §B THE WHEEL ITSELF, IN THE BROWSER ══════════════════ */
console.log("§B the wheel itself — the branch lists the party; the pick casts; the figure stands at the Tender's side");
{
  const S = await claimWithExp("Summon Stage", 3800); // Lv 10
  const now = Date.now();
  db.prepare(`INSERT INTO tender_progress (owner_key, class_key, weapon_key, hp, weapon_next_at, updated_at)
    VALUES (?, 'warden', 'sword', 100, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', hp = 100`).run(S.ownerKey, now + 600000, now);
  const friend = seedAwokin(S.ownerKey, "Summon Stage", "Stage Friend", 2); // power 6, cost 6, DC 16, SP +6 at Lv 10
  await call("addToParty", { awakenedId: friend }, S.token);
  const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', 0, ?)");
  for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > 3) continue;
    insTile.run(S.ownerKey, q, r, now);
  }
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?)").run(S.ownerKey, now);

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror:summon]", String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, S.token);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2500);
  const door = await page.$(".deck-button");
  if (!door) throw new Error("territory: no .deck-button on the home face");
  await door.click();
  await page.waitForFunction(() => !!window.__tenderJump && !!window.__tenderJump.pos(), { timeout: 30000 });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Skip");
    if (b) b.click();
  });
  await sleep(800);

  const clickDisc = async (sel, txt) => {
    const handle = await page.evaluateHandle((q, t) => [...document.querySelectorAll(q)].find((d) => ((d.getAttribute("aria-label") || "") + " " + (d.textContent || "")).includes(t)), sel, txt);
    const el = handle.asElement();
    if (!el) throw new Error("wheel disc not found: " + txt);
    const box = await el.boundingBox();
    if (!box) throw new Error("wheel disc has no box: " + txt);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  };
  const pickFriend = async () => {
    await page.mouse.click(420, 300, { button: "right" });
    await page.waitForSelector(".gw-wheel", { timeout: 9000 });
    await clickDisc(".gw-disc.cat", "Awoken");
    await sleep(600);
  };

  await pickFriend();
  const branchFaces = await page.evaluate(() => [...document.querySelectorAll(".gw-disc")].map((d) => d.textContent ?? ""));
  ok("the homeland wheel's Awoken branch lists the party member with its ✦ cost and the summoner's power",
    branchFaces.some((t) => t.includes("Stage Friend") && t.includes("✦6") && t.includes("summoner's power")),
    JSON.stringify(branchFaces));
  await page.screenshot({ path: `${OUT}/homeland-wheel-party-branch.png` });

  // The pick IS the cast — no ground tap follows; on a
  // falter the wheel is simply opened and picked again.
  let stood = false;
  for (let i = 0; i < 10 && !stood; i++) {
    if (i > 0) await pickFriend();
    await clickDisc(".gw-disc", "Stage Friend");
    await sleep(1200);
    const terrNow = await call("getTerritory", {}, S.token);
    stood = (terrNow.placements ?? []).some((p) => p.awakenedId === friend);
  }
  ok("picking the entry cast the summon through the real page — the figure stands, no ground tap anywhere", stood);
  const terrEnd = await call("getTerritory", {}, S.token);
  const standTile = (terrEnd.tiles ?? []).find((t) => t.id === terrEnd.tender?.tileId);
  const friendTile = (terrEnd.tiles ?? []).find((t) => t.id === (terrEnd.placements ?? []).find((p) => p.awakenedId === friend)?.tileId);
  ok("the summoned figure stands on the Tender's tile or beside it",
    !!standTile && !!friendTile && hexDist(standTile, friendTile) <= 1,
    JSON.stringify({ stand: standTile && [standTile.q, standTile.r], friend: friendTile && [friendTile.q, friendTile.r] }));
  await sleep(600);
  await page.screenshot({ path: `${OUT}/summoned-beside-tender.png` });
  await page.close();
  await browser.close();
}

console.log(`\nHOMELAND SUMMON DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
