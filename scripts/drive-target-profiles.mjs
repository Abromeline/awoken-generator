// TARGET PROFILES + THE BLADE'S FIRST CLICK + THE WARD'S
// T + THE SIZE OF A WORK (Nigel, 2026-10-24 22:19–22:37).
// Boots the real server on a scratch DATA_DIR and proves:
//   §A THE HOMELAND, in a real browser — the click router:
//      (a) Rune Shatter readied + a Blade planted in reach
//          → the first enemy clicks spring the Blade (one
//          charge a click, the book's two charges), and
//          once it is spent the next enemy click CASTS the
//          readied Shatter at that dark;
//      (b) Shatter readied, NO blade standing → the enemy
//          click casts it outright, no loose is attempted,
//          and no refusal speaks the Blade's name;
//      (c) Heal readied + enemy click → the refusal names
//          Heal and an ally target, and nothing casts;
//          then an ALLY click (the wounded Binder's own
//          figure) casts Heal on her by name;
//      (d) GROUND and AREA workings cast on ground clicks
//          exactly as before (the Lattice written, Shard
//          Rain cast) with workings readied.
//   §B THE RECKONING, read directly off the built modules:
//      the size functions' numbers (the ward line's count
//      and length, the rune diameter, the rain's reach,
//      the binding radius) and the crossbar geometry + the
//      line ward's blow test.
//   §C THE T AND THE SIZES, over the real API at Lv 6
//      (ward count 3, diameter 3, rain reach 1):
//      the Black Gate and Bulwark raise crossbar node sets
//      centred on the cast point, perpendicular to the
//      caster→point axis; a point-less Bulwark keeps the
//      edge road whole; a Seal cast by point stands with a
//      LINE (edge_key NULL, the geometry in its numbers)
//      while a Seal cast by edge stands as it always has;
//      a Lattice's stored diameter springs a dark standing
//      within its radius but OFF its hex — and the same
//      staging at Lv 3 (diameter 1) does not; Shard Rain's
//      stored reach lets its fall harm a dark on the ring
//      — and at Lv 3 (reach 0) it does not; the
//      Springleaf's radius reads the binding function.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-target-profiles.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-profiles-"));
process.env.PORT = "3997";
process.env.WORKSHOP_PASSWORD = "drive-profiles";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3997";
const PW = ["target", "profiles", "pw", "1"].join("-");
const OUT = "/home/hatch/workspace/target-profiles-proof";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};
const near = (a, b, tol = 0.011) => a != null && Math.abs(a - b) <= tol;

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

/* ══ §B THE RECKONING, READ DIRECTLY ══════════════════════ */
console.log("§B the reckoning — the size functions and the crossbar geometry");
{
  const acts = await import("../server/dist/actions.js");
  ok("the ward line's count follows the warding cast level (⌊lvl/2⌋, 1..6)",
    acts.wardLineCountFor(3) === 1 && acts.wardLineCountFor(4) === 2 && acts.wardLineCountFor(6) === 3 && acts.wardLineCountFor(12) === 6 && acts.wardLineCountFor(30) === 6,
    `3→${acts.wardLineCountFor(3)} 4→${acts.wardLineCountFor(4)} 6→${acts.wardLineCountFor(6)} 12→${acts.wardLineCountFor(12)}`);
  ok("the ward line's length is (count − 1) × 0.55", near(acts.wardLineLengthFor(6), 1.1, 1e-9) && near(acts.wardLineLengthFor(12), 2.75, 1e-9),
    `6→${acts.wardLineLengthFor(6)} 12→${acts.wardLineLengthFor(12)}`);
  ok("a rune's diameter follows the runecasting level on the same count",
    acts.runeDiameterFor(3) === 1 && acts.runeDiameterFor(6) === 3 && acts.runeDiameterFor(12) === 6,
    `3→${acts.runeDiameterFor(3)} 6→${acts.runeDiameterFor(6)} 12→${acts.runeDiameterFor(12)}`);
  ok("Shard Rain's reach steps slower (0 through Lv 5, 1 at Lv 6–9, 2 at Lv 10+)",
    acts.shardRainReachFor(5) === 0 && acts.shardRainReachFor(6) === 1 && acts.shardRainReachFor(10) === 2,
    `5→${acts.shardRainReachFor(5)} 6→${acts.shardRainReachFor(6)} 10→${acts.shardRainReachFor(10)}`);
  ok("the binding radius is the grove's own formula, named — QUARTERED and fractional since Nigel's 2026-10-27 ruling (Lv 6 → 1, Lv 3 → 0.75)",
    acts.bindingRadiusFor(6) === 1 && acts.bindingRadiusFor(3) === 0.75,
    `6→${acts.bindingRadiusFor(6)} 3→${acts.bindingRadiusFor(3)}`);
  const cb = acts.wardCrossbarFor({ q: 0, r: 0 }, { q: 2, r: 0 }, 6);
  ok("the crossbar runs perpendicular to the caster→point axis (east aim → the line runs in r)",
    near(cb.px, 0, 1e-9) && near(cb.pr, 1, 1e-9) && cb.count === 3 && near(cb.length, 1.1, 1e-9), JSON.stringify(cb));
  const nodes = acts.wardLineNodesFor(2, 0, cb.px, cb.pr, 6, 8);
  ok("the crossbar's nodes are laid evenly, centred on the cast point",
    nodes.length === 3 && near(nodes[0].q, 2) && near(nodes[0].r, -0.55) && near(nodes[1].q, 2) && near(nodes[1].r, 0) && near(nodes[2].r, 0.55) && nodes.every((n) => n.hp === 8),
    JSON.stringify(nodes));
  const ward = { nums: { linePx: 0, linePr: 1, lineLen: 1.1, aimQ: 1.5, aimR: 0 } };
  ok("a blow struck ACROSS the crossbar is turned (the dark at (2,0) striking the victim at (1,0))",
    acts.lineWardTurnsBlow(ward, { q: 2, r: 0 }, { q: 1, r: 0 }) === true);
  ok("a blow struck on the SAME side is not the ward's to turn",
    acts.lineWardTurnsBlow(ward, { q: 2, r: 0 }, { q: 1.8, r: 0.4 }) === false);
  ok("a blow whose road runs beside the line's end is not turned",
    acts.lineWardTurnsBlow(ward, { q: 2, r: 2 }, { q: 1, r: 2 }) === false);
}

/* ══ §A THE HOMELAND, IN A REAL BROWSER ═══════════════════ */
console.log("§A the homeland — the click router, in a real browser");
const claim = await call("claimTender", { password: PW, tenderName: "Profile Tender" });
const token = claim.token;
const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id}`;
const now0 = Date.now();
// Lv 10 (3800 XP on the tender thresholds) — wards and
// runes long awake; three wakes seeded so the choosing
// opens, as the intro law now requires.
db.prepare(`INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at, class_key, weapon_key, hp, weapon_next_at)
  VALUES (?, 3800, 0, ?, 'runewright', 'sword', 100000, ?) ON CONFLICT(owner_key) DO UPDATE SET
  total_exp = 3800, class_key = 'runewright', hp = 100000`).run(me, now0, now0 + 600000);
db.prepare("INSERT INTO tender_resources (owner_key, energy, terrain_bank, updated_at) VALUES (?, 500, 200, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500, terrain_bank = 200").run(me, now0);
const tileId = new Map();
{
  const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, ?, ?, 0, ?)");
  for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > 3) continue;
    tileId.set(`${q},${r}`, Number(insTile.run(me, q, r, now0).lastInsertRowid));
  }
}
const frayId = Number(db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
  VALUES (?, ?, 'fray', ?, 100000, 2, 0, 1, 1, 0)`).run(me, tileId.get("2,0"), now0).lastInsertRowid);
let binderId;
{
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 300, 300, 'tide', ?, 'image/png', ?)")
      .run(`Tide Binder ${cat}`, cat, `target-profiles/tide-binder-${cat}.png`, now0).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `Tide Binder ${cat}`, category: cat, rarity: "common", power: 300, toughness: 300, element: "tide" });
  }
  binderId = Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run("Tide Binder", "Tide Binder", "target-profiles/tide-binder.png", JSON.stringify(parts), "Profile Tender", me, now0).lastInsertRowid);
  // Wounded (450 of 900) so Heal has something to mend; in
  // BINDING stance so her strikes never nibble the dark.
  db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
    VALUES (?, ?, ?, ?, ?, 'binding', 0, 450, 1, 0, NULL, NULL, 0)`).run(me, binderId, tileId.get("1,0"), now0, now0);
}
const stillIv = setInterval(() => {
  try { db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ?, wanderer_settled_beats = 0 WHERE owner_key = ?").run(Date.now(), me); } catch { /* ending */ }
}, 4000);
await call("getTerritory", {}, token);
await sleep(1500);
await call("getTerritory", {}, token);

const grim = await call("getGrimoire", {}, token);
const formOf = (engine) => {
  const sp = (grim.spells ?? []).find((s) => s.engine === engine);
  return sp ? (sp.forms?.unaligned ?? sp.name) : null;
};
ok("the book holds every working this drive readies",
  ["blade", "shatter", "heal", "lattice", "shardrain"].every((e) => !!formOf(e)),
  JSON.stringify((grim.spells ?? []).map((s) => s.key)));

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
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
await sleep(800);
for (let i = 0; i < 3; i++) {
  const stood = await page.evaluate(() => !!document.querySelector(".return-report-overlay"));
  if (!stood) break;
  await page.mouse.click(24, 24);
  await sleep(300);
}
await page.evaluate(() => {
  const p = document.querySelector(".admin-popup");
  if (p) p.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
});
await sleep(300);

// The fetch witness: every cast and loose the page sends.
await page.evaluate(`(() => {
  window.__castLog = [];
  const of = window.fetch.bind(window);
  window.fetch = async (...a) => {
    const r = await of(...a);
    try {
      const url = String(a[0]);
      if (url.includes("castMapWorking") || url.includes("looseBlade")) {
        const j = await r.clone().json().catch(() => null);
        const raw = JSON.stringify(j ?? {});
        window.__castLog.push({ at: Date.now(), url: url.split("/").pop(), ok: r.ok, fizzled: raw.includes('"fizzled":true'), loosed: raw.includes('"loosed":true'), spellKey: (raw.match(/"spellKey":"([^"]+)"/) || [])[1] ?? null, raw: raw.slice(0, 220) });
      }
    } catch { /* the witness never breaks the page */ }
    return r;
  };
})()`);
const logSince = async (mark) => (await page.evaluate(() => window.__castLog)).slice(mark);
const logMark = async () => page.evaluate(() => window.__castLog.length);
const noticeText = async () => page.evaluate(() => document.querySelector(".hex-notice")?.textContent ?? "");

const terr0 = await call("getTerritory", {}, token);
const tenderTileId = terr0.tender?.tileId;
const mapPairs = async () => page.evaluate((tilesArg) => {
  const polys = [...document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]')];
  const cents = polys.map((p) => {
    const pts = (p.getAttribute("points") ?? "").trim().split(/\s+/).map((s) => s.split(",").map(Number));
    return { x: pts.reduce((a, pt) => a + pt[0], 0) / pts.length, y: pts.reduce((a, pt) => a + pt[1], 0) / pts.length };
  });
  const k = 54 / 796, U = [1292 * k, 470 * k], V = [0, 948 * k];
  const out = [];
  for (const t of tilesArg) {
    const ex = 250 + t.q * U[0] + t.r * V[0], ey = 170 + t.q * U[1] + t.r * V[1];
    let bi = -1, bd = 1e9;
    cents.forEach((c, i) => { const d = Math.hypot(c.x - ex, c.y - ey); if (d < bd) { bd = d; bi = i; } });
    if (bd < 12) out.push({ id: t.id, q: t.q, r: t.r, poly: bi });
  }
  return out;
}, (terr0.tiles ?? []).map((t) => ({ id: t.id, q: t.q, r: t.r })));
let pairs = await mapPairs();
ok("every tile's hit polygon is found by its centroid", pairs.length === (terr0.tiles ?? []).length, `matched=${pairs.length} of ${(terr0.tiles ?? []).length}`);
const rectOf = async (tile) => {
  const read = (t) => page.evaluate((i) => {
    const p = document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]')[i];
    if (!p) return null;
    const r = p.getBoundingClientRect();
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: r.width, h: r.height };
  }, t.poly);
  let rect = await read(tile);
  if (!rect) {
    pairs = await mapPairs();
    const fresh = pairs.find((p) => p.id === tile.id);
    if (fresh) { Object.assign(tile, fresh); rect = await read(tile); }
  }
  if (!rect) throw new Error(`tile (${tile.q},${tile.r}) has no hit polygon to click`);
  return rect;
};
const clickDisc = async (sel, txt) => {
  const handle = await page.evaluateHandle((q, t) => [...document.querySelectorAll(q)].find((d) => ((d.getAttribute("aria-label") || "") + " " + (d.textContent || "")).includes(t)), sel, txt);
  const el = handle.asElement();
  if (!el) throw new Error("wheel disc not found: " + txt);
  const box = await el.boundingBox();
  if (!box) throw new Error("wheel disc has no box: " + txt);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};
const readyWorking = async (catLabel, formName) => {
  await page.keyboard.press("Escape");
  await sleep(250);
  await page.mouse.click(420, 300, { button: "right" });
  await page.waitForSelector(".gw-wheel", { timeout: 9000 });
  await clickDisc(".gw-disc.cat", catLabel);
  await sleep(500);
  await clickDisc(".gw-disc", formName);
  await page.waitForFunction((fn) => (document.querySelector(".hex-notice")?.textContent ?? "").includes(fn), { timeout: 9000 }, formName).catch(() => {});
  await sleep(300);
};
const tapTile = async (tile, offX = 0) => {
  const rect = await rectOf(tile);
  await page.evaluate(({ i, x, y }) => {
    const p = document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]')[i];
    if (!p) throw new Error("hit polygon gone at dispatch");
    p.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  }, { i: tile.poly, x: Math.round(rect.cx + offX), y: Math.round(rect.cy) });
  return rect;
};
const clickDark = async () => {
  await page.evaluate(() => {
    const c = [...document.querySelectorAll("circle")].find((el) => (el.querySelector("title")?.textContent ?? "").includes("Loose the Single Blade"));
    if (!c) throw new Error("the dark's tap circle is not on the map");
    const r = c.getBoundingClientRect();
    c.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: Math.round(r.x + r.width / 2), clientY: Math.round(r.y + r.height / 2) }));
  });
};
const workingsNow = async () => (await call("getTerritory", {}, token)).workings ?? [];
const bladeCharges = async () => {
  const w = (await workingsNow()).find((x) => x.engine === "blade");
  return w ? w.charges : null;
};

/* — plant the Blade within reach of the dark — */
await readyWorking("Rune", formOf("blade"));
{
  // One hex from the dark: the server measures the loose
  // from the writing's AIM POINT to the dark's own point,
  // and a centre tap's aim can sit a hair off the hex's
  // heart — at two hexes that hair straddles the reach
  // (seen in this drive's first run: aim (0.996,-1.073)
  // to (2,0) = 2.076). One hex keeps the staging honest.
  const plantTile = pairs.find((p) => p.q === 2 && p.r === -1);
  let stood = false;
  for (let i = 0; i < 12 && !stood; i++) {
    const m = await logMark();
    await tapTile(plantTile);
    await sleep(700);
    const mine = (await logSince(m)).filter((e) => e.url === "castMapWorking");
    stood = mine.some((e) => e.ok && !e.fizzled);
  }
  ok("(a) the Blade is written on the ground at (2,-1), one hex from the dark", stood && (await bladeCharges()) === 2,
    `charges=${await bladeCharges()}`);
}

/* — (a) the Blade's first clicks, then the readied working — */
await readyWorking("Spell", formOf("shatter"));
{
  let m = await logMark();
  await clickDark();
  await sleep(900);
  let mine = await logSince(m);
  ok("(a) FIRST enemy click springs the planted Blade, whatever is readied (the loose fires, no cast)",
    mine.some((e) => e.url === "looseBlade" && e.loosed) && !mine.some((e) => e.url === "castMapWorking"),
    JSON.stringify(mine).slice(0, 200));
  ok("(a) the spring spent one charge (2 → 1)", (await bladeCharges()) === 1, `charges=${await bladeCharges()}`);
  m = await logMark();
  await clickDark();
  await sleep(900);
  mine = await logSince(m);
  ok("(a) the Blade answers again while it stands armed (its second charge)",
    mine.some((e) => e.url === "looseBlade" && e.loosed) && (await bladeCharges()) === null,
    `charges=${await bladeCharges()} log=${JSON.stringify(mine).slice(0, 160)}`);
  m = await logMark();
  let castFired = false;
  for (let i = 0; i < 14 && !castFired; i++) {
    await clickDark();
    await sleep(700);
    mine = await logSince(m);
    castFired = mine.some((e) => e.url === "castMapWorking" && e.spellKey === "shatter");
    if (castFired) break;
  }
  ok("(a) once the Blade is spent, the next enemy click CASTS the readied Shatter at the dark",
    castFired && !mine.some((e) => e.url === "looseBlade"), JSON.stringify(mine).slice(0, 200));
}

/* — (b) no blade standing: the readied working takes the click — */
{
  const m = await logMark();
  let castFired = false;
  for (let i = 0; i < 14 && !castFired; i++) {
    await clickDark();
    await sleep(700);
    const mine = await logSince(m);
    castFired = mine.some((e) => e.url === "castMapWorking" && e.spellKey === "shatter");
    if (castFired) break;
  }
  const mine = await logSince(m);
  ok("(b) with NO blade planted, the enemy click casts the readied working outright",
    castFired && !mine.some((e) => e.url === "looseBlade"), JSON.stringify(mine).slice(0, 200));
  const n = await noticeText();
  ok("(b) no refusal speaks the Single Blade's name over a readied spell",
    !/single blade/i.test(n), `notice=${n.slice(0, 120)}`);
}

/* — (c) Heal readied: the naming refusal, then the ally click — */
await readyWorking("Binding", formOf("heal"));
{
  const m = await logMark();
  await clickDark();
  await sleep(800);
  const mine = await logSince(m);
  const n = await noticeText();
  ok("(c) Heal readied + enemy click casts NOTHING (no cast, no loose)",
    !mine.some((e) => e.url === "castMapWorking") && !mine.some((e) => e.url === "looseBlade"),
    JSON.stringify(mine).slice(0, 160));
  ok("(c) the refusal names the READIED working and what it targets — Heal, an ally",
    n.includes("Heal") && n.includes("one of your own Awokin") && !/single blade/i.test(n),
    `notice=${n.slice(0, 160)}`);
  // The ally click: the wounded Binder's own figure.
  const binderTile = pairs.find((p) => p.q === 1 && p.r === 0);
  const rect = await rectOf(binderTile);
  const m2 = await logMark();
  await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(Math.round(x), Math.round(y));
    if (!el) throw new Error("nothing stands at the Binder's point");
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: Math.round(x), clientY: Math.round(y) }));
  }, { x: rect.cx, y: rect.cy });
  await sleep(900);
  const mine2 = await logSince(m2);
  ok("(c) an ALLY click (the Binder's figure) casts the readied Heal on her",
    mine2.some((e) => e.url === "castMapWorking" && e.spellKey === "heal"),
    JSON.stringify(mine2).slice(0, 200));
}

/* — (d) ground and area workings on ground clicks, as before — */
await readyWorking("Rune", formOf("lattice"));
{
  const t = pairs.find((p) => p.q === -2 && p.r === 1);
  let stood = false;
  for (let i = 0; i < 12 && !stood; i++) {
    const m = await logMark();
    await tapTile(t);
    await sleep(700);
    stood = (await logSince(m)).some((e) => e.url === "castMapWorking" && e.ok && !e.fizzled);
  }
  const w = (await workingsNow()).find((x) => x.engine === "lattice");
  ok("(d) a GROUND working (the Lattice) is written by a ground click, as before", stood && !!w,
    `workings=${JSON.stringify((await workingsNow()).map((x) => x.engine))}`);
  ok("(d) the Lattice's stored diameter follows the runecasting level (Lv 10 → 5)",
    !!w && w.nums?.diameter === 5, `diameter=${w?.nums?.diameter}`);
}
await readyWorking("Spell", formOf("shardrain"));
{
  const t = pairs.find((p) => p.q === 0 && p.r === 3);
  let stood = false;
  for (let i = 0; i < 12 && !stood; i++) {
    const m = await logMark();
    await tapTile(t);
    await sleep(700);
    stood = (await logSince(m)).some((e) => e.url === "castMapWorking" && e.ok && !e.fizzled);
  }
  ok("(d) an AREA working (Shard Rain) is cast by a ground click, as before", stood);
}
await page.screenshot({ path: join(OUT, "router-scenes.png") }).catch(() => {});
await browser.close();
clearInterval(stillIv);

/* ══ §C THE T AND THE SIZES, OVER THE API ════════════════ */
console.log("§C the T and the sizes, over the real API (Lv 6 and Lv 3 tenders)");
function seedAwokinRow(ownerKey, tenderName, name) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 3, 3, 'root', ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, `profiles/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: 3, toughness: 3, element: "root" });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `profiles/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
async function claimAt(name, exp) {
  const c = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(c.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  const now = Date.now();
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, exp, now);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(ownerKey, now);
  seedAwokinRow(ownerKey, name, `${name} Wake One`);
  seedAwokinRow(ownerKey, name, `${name} Wake Two`);
  seedAwokinRow(ownerKey, name, `${name} Wake Three`);
  await call("chooseClass", { classKey: "runewright" }, c.token);
  const tiles = new Map();
  const ins = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, ?, ?, 0, ?)");
  for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > 4) continue;
    tiles.set(`${q},${r}`, Number(ins.run(ownerKey, q, r, now).lastInsertRowid));
  }
  await call("getTerritory", {}, c.token);
  return { token: c.token, ownerKey, tiles };
}
const defenceRow = (ownerKey, kind) => db.prepare("SELECT * FROM defence_works WHERE owner_key = ? AND kind = ? ORDER BY id DESC").get(ownerKey, kind);
const nodesOf = (row) => (row ? JSON.parse(row.nodes) : []);
const centroid = (nodes) => ({ q: nodes.reduce((a, n) => a + n.q, 0) / nodes.length, r: nodes.reduce((a, n) => a + n.r, 0) / nodes.length });

const T6 = await claimAt("Tender Six", 800); // Lv 6: ward count 3, diameter 3, rain reach 1
{
  const res = await castUntilStandsApi(T6.token, { spellKey: "blackgate", pointQ: 2, pointR: 0 });
  const nodes = nodesOf(defenceRow(T6.ownerKey, "blackgate"));
  const c = centroid(nodes);
  ok("§C the Black Gate casts in a T: its nodes centre on the cast point (2,0)",
    nodes.length === 3 && near(c.q, 2, 1e-6) && near(c.r, 0, 1e-6) && res.gateNodes === 3,
    JSON.stringify(nodes));
  ok("§C the Gate's crossbar runs perpendicular to the caster→point axis (east aim → the nodes spread in r)",
    nodes.every((n) => near(n.q, 2, 1e-6)) && near(Math.min(...nodes.map((n) => n.r)), -0.55, 1e-6) && near(Math.max(...nodes.map((n) => n.r)), 0.55, 1e-6),
    JSON.stringify(nodes));
  ok("§C each Gate node carries the shared table's HP at the cast level", nodes.every((n) => n.hp === res.wallHp && n.maxHp === res.wallHp), JSON.stringify(nodes));
}
{
  const res = await castUntilStandsApi(T6.token, { spellKey: "bulwark", pointQ: 0, pointR: 2 });
  const nodes = nodesOf(defenceRow(T6.ownerKey, "bulwark"));
  const c = centroid(nodes);
  ok("§C Bulwark casts in a T: shields centred on the cast point (0,2), spread across the axis (in q)",
    nodes.length === 3 && res.shields === 3 && near(c.q, 0, 1e-6) && near(c.r, 2, 1e-6)
      && nodes.every((n) => near(n.r, 2, 1e-6)) && near(Math.min(...nodes.map((n) => n.q)), -0.55, 1e-6) && near(Math.max(...nodes.map((n) => n.q)), 0.55, 1e-6),
    JSON.stringify(nodes));
}
{
  // The point-less road stands whole: an edge-named cast
  // centres on the edge's midpoint, as it always has.
  const before = db.prepare("SELECT COUNT(*) AS n FROM defence_works WHERE owner_key = ? AND kind = 'bulwark'").get(T6.ownerKey).n;
  await castUntilStandsApi(T6.token, { spellKey: "bulwark", tileId: T6.tiles.get("2,0"), dir: 0 });
  const rows = db.prepare("SELECT * FROM defence_works WHERE owner_key = ? AND kind = 'bulwark' ORDER BY id DESC").all(T6.ownerKey);
  const nodes = nodesOf(rows[0]);
  const c = centroid(nodes);
  ok("§C a point-less Bulwark keeps the edge road (centred on the edge's midpoint (2,-0.5))",
    rows.length === before + 1 && near(c.q, 2, 1e-6) && near(c.r, -0.5, 1e-6), JSON.stringify(nodes));
}
{
  await castUntilStandsApi(T6.token, { spellKey: "seal", pointQ: 1, pointR: 1 });
  const row = db.prepare("SELECT * FROM territory_workings WHERE owner_key = ? AND engine = 'seal' ORDER BY id DESC").get(T6.ownerKey);
  const nums = JSON.parse(row.nums ?? "{}");
  ok("§C a Seal cast by point stands as a LINE — no edge, its crossbar in its numbers",
    row && row.edge_key == null && typeof nums.linePx === "number" && nums.lineCount === 3 && near(nums.aimQ, 1, 1e-9) && near(nums.aimR, 1, 1e-9) && near(nums.lineLen, 1.1, 1e-9),
    JSON.stringify({ edge: row?.edge_key, nums }).slice(0, 200));
  await castUntilStandsApi(T6.token, { spellKey: "trees", tileId: T6.tiles.get("-2,1"), dir: 2 });
  const edgeRow = db.prepare("SELECT * FROM territory_workings WHERE owner_key = ? AND engine = 'trees' ORDER BY id DESC").get(T6.ownerKey);
  ok("§C a ward cast by edge stands by its edge, as the wards on the land already do",
    edgeRow && typeof edgeRow.edge_key === "string" && edgeRow.edge_key.length > 0, JSON.stringify(edgeRow?.edge_key));
}
{
  // The Lattice's footprint: a dark OFF its hex but within
  // its diameter's radius of the writing's point is pinned
  // at the cast (diameter 3 → radius 1.5 at Lv 6).
  const foeId = Number(db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
    VALUES (?, ?, 'fray', ?, 100000, 1.4, 0.8, 1, 1, 0)`).run(T6.ownerKey, T6.tiles.get("1,1"), Date.now()).lastInsertRowid);
  await castUntilStandsApi(T6.token, { spellKey: "lattice", tileId: T6.tiles.get("0,2"), pointQ: 0.4, pointR: 1.6 });
  const foe = db.prepare("SELECT pinned_beats AS pb FROM homeland_wanderers WHERE id = ?").get(foeId);
  ok("§C the Lattice's diameter springs a dark within its radius (1.0 away) though it stands off the writing's hex",
    (foe?.pb ?? 0) > 0, `pinned_beats=${foe?.pb}`);
  const w = db.prepare("SELECT nums FROM territory_workings WHERE owner_key = ? AND engine = 'lattice' ORDER BY id DESC").get(T6.ownerKey);
  ok("§C the Lattice's stored diameter is the runecasting reading (Lv 6 → 3)",
    w && JSON.parse(w.nums ?? "{}").diameter === 3, w?.nums);
}
{
  // Shard Rain's area: a dark on the ring beyond its hex
  // is under its fall at reach 1 (Lv 6).
  const foeId = Number(db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
    VALUES (?, ?, 'fray', ?, 100000, 1, -2, 1, 1, 0)`).run(T6.ownerKey, T6.tiles.get("1,-2"), Date.now()).lastInsertRowid);
  await castUntilStandsApi(T6.token, { spellKey: "shardrain", tileId: T6.tiles.get("0,-2"), pointQ: 0, pointR: -2 });
  const foe = db.prepare("SELECT hp FROM homeland_wanderers WHERE id = ?").get(foeId);
  ok("§C Shard Rain's area (reach 1 at Lv 6) falls on a dark standing on the ring beyond its hex",
    foe && foe.hp < 100000, `hp=${foe?.hp}`);
}
{
  const res = await castUntilStandsApi(T6.token, { spellKey: "springleaf", tileId: T6.tiles.get("0,0"), pointQ: 0, pointR: 0 });
  ok("§C the Springleaf's radius reads the binding function, quartered (Lv 6 → 1, the grove's own formula at Nigel's 2026-10-27 measure)",
    res.radiusHexes === 1, `radiusHexes=${res.radiusHexes}`);
}

const T3 = await claimAt("Tender Three", 150); // Lv 3: ward count 1, diameter 1, rain reach 0
{
  const foeId = Number(db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
    VALUES (?, ?, 'fray', ?, 100000, 1.4, 0.8, 1, 1, 0)`).run(T3.ownerKey, T3.tiles.get("1,1"), Date.now()).lastInsertRowid);
  await castUntilStandsApi(T3.token, { spellKey: "lattice", tileId: T3.tiles.get("0,2"), pointQ: 0.4, pointR: 1.6 });
  const foe = db.prepare("SELECT pinned_beats AS pb FROM homeland_wanderers WHERE id = ?").get(foeId);
  ok("§C at diameter 1 (Lv 3) the same dark, 1.0 from the writing's point, does NOT spring the Lattice",
    (foe?.pb ?? 0) === 0, `pinned_beats=${foe?.pb}`);
}
{
  const foeId = Number(db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
    VALUES (?, ?, 'fray', ?, 100000, 1, -2, 1, 1, 0)`).run(T3.ownerKey, T3.tiles.get("1,-2"), Date.now()).lastInsertRowid);
  await castUntilStandsApi(T3.token, { spellKey: "shardrain", tileId: T3.tiles.get("0,-2"), pointQ: 0, pointR: -2 });
  const foe = db.prepare("SELECT hp FROM homeland_wanderers WHERE id = ?").get(foeId);
  const standing = db.prepare("SELECT id FROM territory_workings WHERE owner_key = ? AND engine = 'shardrain'").get(T3.ownerKey);
  ok("§C at reach 0 (Lv 3) the Rain does not fall on the ring — the dark is unharmed and the writing stands",
    foe && foe.hp === 100000 && !!standing, `hp=${foe?.hp} standing=${!!standing}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
