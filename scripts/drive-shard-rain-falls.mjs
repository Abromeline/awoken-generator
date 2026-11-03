// SHARD RAIN MUST FALL — AND ONLY ON THE DARK (Nigel's
// play report, 2026-11-03: "Shard rain is not casting when
// clicked as it should, summoning the png flip book, it is
// just saying that it cast an effect the dark even if
// there is no enemy"). Boots the real server on a scratch
// DATA_DIR and proves, over the real doors:
//   §A THE FALL, WITNESSED (API): a rain cast over a foe
//      springs at the cast, the foe takes the whole pool —
//      and getTerritory now serves the fall itself in
//      rainFalls: one record, the covered ground named,
//      the pool it rolled, the one foe it fell on.
//   §B NO PHANTOM ON CURSED GROUND (API): a rain cast on a
//      cursed hex with NO enemy under it does NOT spring:
//      the cast stands and is paid for, but sprung reads
//      false, nothing is ground, the curse's own numbers
//      are untouched, the writing still stands waiting,
//      and no fall is served. (Before the fix the rain
//      sprang on the curse alone and the cast spoke of
//      the dark taking harm with no dark there.)
//   §C NO PHANTOM ON CLEAN GROUND (API): the same on
//      clean empty ground — written, waiting, no fall.
//   §D THE SETTLE-TIME FALL (API): a writing laid on
//      empty ground springs when the dark later stands
//      under it — the foe is harmed, the writing spent,
//      and the fall is served by the very read that
//      settled it.
//   §E THE FALL ON THE MAP (browser): with the map open
//      and watching, a cast over a foe puts the rain on
//      the map AS THE SPELL'S OWN PROVING GROUND PLAYS
//      IT — the demo of 2026-10-17 (your_files/
//      shard-rain-demo.html; Nigel's correction,
//      2026-11-03: "Shard rain plays the correct file in
//      the proving grounds"): ONE image of the drawn
//      rain (shard-rain.gif), 16:9, screen-blended, over
//      the covered ground, standing for the gif's full
//      play — still falling at ~2.5 s, past the 1800 ms
//      cut the first pass shipped — then clearing; and
//      a cast on cursed empty ground puts NOTHING there.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-shard-rain-falls.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-rain-falls-"));
process.env.PORT = "3991";
process.env.WORKSHOP_PASSWORD = "drive-rain-falls";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3991";
const PW = ["rain", "falls", "pw", "1"].join("-");
const OUT = "/home/hatch/workspace/shard-rain-proof";
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
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return data?.data ?? data;
}
async function castUntilStandsApi(token, args) {
  for (let i = 0; i < 30; i++) {
    const res = await call("castMapWorking", args, token);
    if (!res.fizzled) return res;
  }
  throw new Error("cast never stood: " + JSON.stringify(args));
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up */ }

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

function seedAwokinRow(ownerKey, tenderName, name) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 3, 3, 'root', ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, `rain-falls/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: 3, toughness: 3, element: "root" });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `rain-falls/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}

async function claimAt(name) {
  const c = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(c.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  const now = Date.now();
  // Lv 3 (150 XP, as the split drive stages it): rain reach
  // 0 — the rain covers its own hex only.
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 150, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, now);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(ownerKey, now);
  seedAwokinRow(ownerKey, name, `${name} Wake One`);
  seedAwokinRow(ownerKey, name, `${name} Wake Two`);
  seedAwokinRow(ownerKey, name, `${name} Wake Three`);
  await call("chooseClass", { classKey: "runewright" }, c.token);
  const tiles = new Map();
  const ins = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, ?, ?, 0, ?)");
  for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > 3) continue;
    tiles.set(`${q},${r}`, Number(ins.run(ownerKey, q, r, now).lastInsertRowid));
  }
  await call("getTerritory", {}, c.token);
  return { token: c.token, ownerKey, tiles };
}

const FOE_HP = 100000;
function seedFoe(ownerKey, tileId, q, r) {
  return Number(db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
    VALUES (?, ?, 'fray', ?, ?, ?, ?, 1, 1, 0)`).run(ownerKey, tileId, Date.now(), FOE_HP, q, r).lastInsertRowid);
}
const harmOf = (id) => {
  const row = db.prepare("SELECT hp FROM homeland_wanderers WHERE id = ?").get(id);
  return row ? FOE_HP - row.hp : FOE_HP;
};
const fallsOf = async (token) => (await call("getTerritory", {}, token)).rainFalls ?? [];
const rainStanding = (ownerKey) => db.prepare("SELECT id FROM territory_workings WHERE owner_key = ? AND engine = 'shardrain'").get(ownerKey);

/* ══ §A THE FALL, WITNESSED ═══════════════════════════════ */
console.log("§A a rain over a foe falls — and the fall is served");
{
  const T = await claimAt("Falls One");
  const tileId = T.tiles.get("0,-2");
  const foe = seedFoe(T.ownerKey, tileId, 0, -2);
  const res = await castUntilStandsApi(T.token, { spellKey: "shardrain", tileId, pointQ: 0, pointR: -2 });
  const harm = harmOf(foe);
  ok("the rain sprang at the cast and the writing is spent", res.sprung === true && !rainStanding(T.ownerKey),
    `sprung=${res.sprung}`);
  ok("the foe took the whole pool (2d6: 2..12)", harm >= 2 && harm <= 12, `harm=${harm}`);
  const falls = await fallsOf(T.token);
  ok("getTerritory serves exactly one fall for the cast", falls.length === 1, `falls=${JSON.stringify(falls)}`);
  const f = falls[0] ?? {};
  ok("the fall names the covered ground — the writing's own hex", Array.isArray(f.tileIds) && f.tileIds.includes(tileId),
    `tileIds=${JSON.stringify(f.tileIds)} want ${tileId}`);
  ok("the fall's pool is the harm the foe took, over one foe", f.pool === harm && f.foes === 1,
    `pool=${f.pool} harm=${harm} foes=${f.foes}`);
}

/* ══ §B NO PHANTOM ON CURSED GROUND ═══════════════════════ */
console.log("§B a rain on cursed ground with NO enemy does not spring");
{
  const T = await claimAt("Falls Two");
  const tileId = T.tiles.get("0,-2");
  db.prepare("UPDATE territory_tiles SET cursed = 1 WHERE id = ?").run(tileId);
  const before = db.prepare("SELECT cursed, curse_hp AS curseHp, curse_max_hp AS curseMaxHp FROM territory_tiles WHERE id = ?").get(tileId);
  const energyBefore = db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(T.ownerKey).energy;
  const res = await castUntilStandsApi(T.token, { spellKey: "shardrain", tileId, pointQ: 0, pointR: -2 });
  ok("the cast stands and its price is the page's (5)", res.cost === 5, `cost=${res.cost}`);
  ok("the cast did NOT spring — sprung reads false", res.sprung === false, `sprung=${res.sprung}`);
  ok("nothing was ground — ground reads 0, nothing purified", (res.ground ?? 0) === 0 && !res.purified,
    `ground=${res.ground} purified=${res.purified}`);
  ok("the writing still stands on the ground, waiting", !!rainStanding(T.ownerKey));
  const after = db.prepare("SELECT cursed, curse_hp AS curseHp, curse_max_hp AS curseMaxHp FROM territory_tiles WHERE id = ?").get(tileId);
  ok("the curse is untouched — still cursed, its HP numbers unmoved",
    after.cursed === 1 && after.curseHp === before.curseHp && after.curseMaxHp === before.curseMaxHp,
    `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  const energyAfter = db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(T.ownerKey).energy;
  ok("the purse paid for the cast (and any fizzle retries) — energy fell by whole casts of 5",
    energyBefore - energyAfter >= 5 && (energyBefore - energyAfter) % 5 === 0,
    `before=${energyBefore} after=${energyAfter}`);
  // A later read settles the land again — still no spring,
  // still no fall served.
  const falls = await fallsOf(T.token);
  ok("no fall is served for the empty cast", falls.length === 0, `falls=${JSON.stringify(falls)}`);
  ok("the writing still stands after the settling read", !!rainStanding(T.ownerKey));
}

/* ══ §C NO PHANTOM ON CLEAN GROUND ════════════════════════ */
console.log("§C a rain on clean empty ground is written, and waits");
{
  const T = await claimAt("Falls Three");
  const tileId = T.tiles.get("0,-2");
  const res = await castUntilStandsApi(T.token, { spellKey: "shardrain", tileId, pointQ: 0, pointR: -2 });
  ok("the cast did not spring on empty ground", res.sprung === false, `sprung=${res.sprung}`);
  ok("the writing stands, waiting for the dark", !!rainStanding(T.ownerKey));
  const falls = await fallsOf(T.token);
  ok("no fall is served", falls.length === 0, `falls=${JSON.stringify(falls)}`);
}

/* ══ §D THE SETTLE-TIME FALL ══════════════════════════════ */
console.log("§D a writing laid on empty ground falls when the dark stands under it");
{
  const T = await claimAt("Falls Four");
  const tileId = T.tiles.get("0,-2");
  const res = await castUntilStandsApi(T.token, { spellKey: "shardrain", tileId, pointQ: 0, pointR: -2 });
  ok("laid on empty ground, the rain waits (no spring at the cast)", res.sprung === false && !!rainStanding(T.ownerKey),
    `sprung=${res.sprung}`);
  const foe = seedFoe(T.ownerKey, tileId, 0, -2);
  const terr = await call("getTerritory", {}, T.token); // the read settles the written ground
  const falls = terr.rainFalls ?? [];
  ok("the settling read serves the fall", falls.length === 1, `falls=${JSON.stringify(falls)}`);
  const f = falls[0] ?? {};
  ok("the fall names the writing's hex and the one foe", Array.isArray(f.tileIds) && f.tileIds.includes(tileId) && f.foes === 1,
    `tileIds=${JSON.stringify(f.tileIds)} foes=${f.foes}`);
  ok("the foe was harmed by at least the fall's pool", harmOf(foe) >= (f.pool ?? 0) && (f.pool ?? 0) >= 2,
    `harm=${harmOf(foe)} pool=${f.pool}`);
  ok("the writing is spent", !rainStanding(T.ownerKey));
}

/* ══ §E THE FLIPBOOK ON THE MAP (browser) ═════════════════ */
console.log("§E the map draws the rain when it falls — and nothing on empty ground");
{
  const claim = await call("claimTender", { password: PW, tenderName: "Falls Five" });
  const token = claim.token;
  const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id}`;
  const now = Date.now();
  db.prepare(`INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at, class_key, weapon_key, hp, weapon_next_at)
    VALUES (?, 150, 0, ?, 'runewright', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET
    total_exp = 150, class_key = 'runewright', hp = 100`).run(me, now, now + 600000);
  const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, ?, ?, 0, ?)");
  const tileIds = new Map();
  for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > 3) continue;
    tileIds.set(`${q},${r}`, Number(insTile.run(me, q, r, now).lastInsertRowid));
  }
  db.prepare("INSERT INTO tender_resources (owner_key, energy, terrain_bank, updated_at) VALUES (?, 500, 200, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500, terrain_bank = 200").run(me, now);

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => console.log("[pageerror:territory]", String(e).slice(0, 200)));
    await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
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
    await sleep(1500); // the first snapshots land; the rain watermark is set
    // The fall watcher: count every rain-fall element that
    // ever stands in the DOM from here on, and stamp the
    // fall's own DOM lifetime (first appearance → gone) on
    // the page's clock, so the duration checks below
    // measure the element itself, not this script's
    // polling lag.
    await page.evaluate(`(() => {
      window.__rainSeen = 0;
      window.__rainFirstAt = 0;
      window.__rainGoneAt = 0;
      window.__rainLateCount = -1;
      const sample = () => {
        const n = document.querySelectorAll("[data-rain-fall]").length;
        window.__rainSeen = Math.max(window.__rainSeen, n);
        if (n > 0 && !window.__rainFirstAt) window.__rainFirstAt = performance.now();
        if (window.__rainFirstAt && window.__rainLateCount < 0 && performance.now() - window.__rainFirstAt >= 2500) window.__rainLateCount = n;
        if (n === 0 && window.__rainFirstAt && !window.__rainGoneAt) window.__rainGoneAt = performance.now();
      };
      new MutationObserver(sample).observe(document.body, { childList: true, subtree: true });
      setInterval(sample, 100);
    })()`);

    // — the fall over a foe —
    const foeTile = tileIds.get("0,-2");
    seedFoe(me, foeTile, 0, -2);
    const castRes = await castUntilStandsApi(token, { spellKey: "shardrain", tileId: foeTile, pointQ: 0, pointR: -2 });
    ok("the browser section's cast sprang on its foe", castRes.sprung === true, `sprung=${castRes.sprung}`);
    let fallEl = null;
    let fallFoundAt = 0;
    for (let i = 0; i < 90 && !fallEl; i++) {
      fallEl = await page.evaluate(() => {
        const els = document.querySelectorAll("[data-rain-fall]");
        const el = els[0];
        return el ? {
          count: els.length,
          href: el.getAttribute("href") || el.getAttribute("src") || "",
          w: Number(el.getAttribute("width")), h: Number(el.getAttribute("height")),
          blend: el.style.mixBlendMode || "",
        } : null;
      });
      if (!fallEl) await sleep(100); else fallFoundAt = Date.now();
    }
    ok("the rain's image stands in the DOM over the covered ground during the fall", !!fallEl, JSON.stringify(fallEl));
    ok("the image is the spell's own drawn rain (shard-rain asset)", !!fallEl && String(fallEl.href).includes("shard-rain"),
      `href=${fallEl?.href}`);
    ok("ONE image carries the whole fall, as the proving ground plays it — not a copy per hex", !!fallEl && fallEl.count === 1,
      `count=${fallEl?.count}`);
    ok("the image keeps the proving ground's shape and way: 16:9, screen-blended", !!fallEl && Math.abs(fallEl.w / fallEl.h - 16 / 9) < 0.05 && fallEl.blend === "screen",
      `w=${fallEl?.w} h=${fallEl?.h} blend=${fallEl?.blend}`);
    if (fallEl) {
      await sleep(500);
      await page.screenshot({ path: `${OUT}/04-fall-correct-file.png` });
      // The proving ground stands the rain for the gif's
      // full play (3700 ms): it must STILL be falling well
      // past the 1800 ms cut the first pass shipped. The
      // page's own sampler records the count standing at
      // the fall's 2.5 s mark (__rainLateCount), so this
      // check reads the element's life on the page's
      // clock, untouched by this script's round-trips.
      const pageNow = () => page.evaluate(() => performance.now());
      const firstAt = await page.evaluate(() => window.__rainFirstAt);
      const untilLateShot = firstAt + 2900 - (await pageNow());
      if (untilLateShot > 0) await sleep(untilLateShot);
      await page.screenshot({ path: `${OUT}/05-fall-correct-file-later-frame.png` });
      const untilGone = firstAt + 5600 - (await pageNow());
      if (untilGone > 0) await sleep(untilGone);
    }
    const goneInfo = await page.evaluate(() => ({
      standing: document.querySelectorAll("[data-rain-fall]").length,
      lateCount: window.__rainLateCount,
      stoodMs: window.__rainFirstAt && window.__rainGoneAt ? Math.round(window.__rainGoneAt - window.__rainFirstAt) : -1,
    }));
    ok("the rain still falls at the fall's 2.5 s mark — the whole gif plays, not the old 1800 ms cut", goneInfo.lateCount === 1,
      `lateCount=${goneInfo.lateCount}`);
    ok("the fall clears when its moment ends", goneInfo.standing === 0, `standing=${goneInfo.standing}`);
    ok("the fall stood for the gif's full play (its DOM lifetime ≥ 3.0 s; the proving ground's window is 3.7 s)", goneInfo.stoodMs >= 3000,
      `stoodMs=${goneInfo.stoodMs}`);

    // — nothing on cursed empty ground —
    const seenBefore = await page.evaluate(() => window.__rainSeen);
    const emptyTile = tileIds.get("1,-2");
    db.prepare("UPDATE territory_tiles SET cursed = 1 WHERE id = ?").run(emptyTile);
    const emptyRes = await castUntilStandsApi(token, { spellKey: "shardrain", tileId: emptyTile, pointQ: 1, pointR: -2 });
    ok("the empty cursed cast did not spring", emptyRes.sprung === false, `sprung=${emptyRes.sprung}`);
    await sleep(3500); // several map reads settle and serve — no fall may appear
    const seenAfter = await page.evaluate(() => window.__rainSeen);
    ok("no rain ever stood in the DOM for the empty cast", seenAfter === seenBefore,
      `seen before=${seenBefore} after=${seenAfter}`);
    await page.screenshot({ path: `${OUT}/03-empty-cursed-no-fall.png` });
  } finally {
    await browser.close();
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
