// CLICK INFORMATION OVER THE ENERGY ORB — THIS BUILD'S DRIVE
// (Nigel, 2026-11-12: "when i click a tile i want a small box
// with its attunement levels to pop up over the energy meter
// orb, and when i click an awoken i want to see their hp and
// card appear in the same spot. i do not want the big gold
// text under them stating hp and such — all of that can be on
// the card that pops up." And the same morning's widening:
// "we can really de clutter the screen if we take all of
// those numbers off and only give that information on a tile
// card thats placed above the energy orb when a tender clicks
// that hex" — and its clarification: "i did mean for
// purified tiles. cursed tiles tint stays as it is.")
//
// Boots the real server on a scratch DATA_DIR and the real
// built client in headless Chrome, on a seeded land (the
// marching-islands fixture shape: a wiped world, a radius-4
// disc, a fallen seed on the stand, the stand set in
// tender_progress): a purified tile carrying a four-element
// mix, two cursed tiles (one damaged), and one field Awoken
// with a hurt placement and a standing shield. It proves:
//   §1 TILE CARD: a tap on the mixed tile raises the tile
//      card over the energy orb, and its rows ARE the tile's
//      served attunement ledger, element for element.
//   §2 CURSED CARD + FACE: a tap on the damaged cursed tile
//      raises the card carrying its curse health (9 of 22)
//      and its thorns (2, its ring); the tile's FACE shows no ♥ and no
//      🌵 text anywhere; its corruption glow stack (halo,
//      the two crimson polygons, the mist wisps) still
//      renders at its centre, untouched.
//   §3 THE TINT: no stand-in element-tint polygon stands on
//      any purified tile; every tint polygon in the face
//      stands on cursed ground (theirs stays as it is).
//   §4 AWOKEN CARD: a tap on the field Awoken raises its
//      card in the same spot — name, Health reading the
//      placement's hp against the card's own toughness,
//      Shield, Level, Experience — the orders wheel still
//      opens on the same click, and NO stat text stands
//      under the chosen figure's feet.
//   §4b THE CARD FITS an iPad viewport (1024×768) whole.
//   §5 DISMISSAL: an empty-map tap sets the card down with
//      the choosing, as selections already close.
// Screenshots land in ~/workspace/click-info-proof/.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-click-info-orb.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

const OUT = "/home/hatch/workspace/click-info-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-orbinfo-"));
process.env.PORT = "3995";
process.env.WORKSHOP_PASSWORD = "orbinfo-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3995";
const PW = "orbinfo-drive-password";
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
const now = Date.now();
const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

/* ══ THE SEEDED LAND ═══════════════════════════════════════ */
const claim = await call("claimTender", { password: PW, tenderName: "Orb Tender" });
const token = claim.token;
const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id}`;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 0, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800, class_key = 'warden', weapon_key = 'sword', hp = 100").run(me, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(me, now);
for (const tbl of ["territory_tiles", "star_seeds", "field_placements", "homeland_wanderers", "island_marches"]) {
  db.prepare(`DELETE FROM ${tbl} WHERE owner_key = ?`).run(me);
}
const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, spark, hp, sealed_trays, grow_points, height, z, mix_points, curse_hp, curse_max_hp, created_at) VALUES (?, ?, ?, ?, ?, 0, 10, 0, 0, 1, 0, ?, ?, ?, ?)");
const tileId = new Map();
const MIX = { sky: 6, stone: 2, tide: 3, root: 10 };
for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
  if (hexDist({ q, r }, { q: 0, r: 0 }) > 4) continue;
  const cursed = ((q === 1 && r === 1) || (q === -2 && r === 0)) ? 1 : 0;
  const mix = (q === -1 && r === 1) ? JSON.stringify(MIX) : null;
  const chp = (q === 1 && r === 1) ? 9 : null;
  const cmax = (q === 1 && r === 1) ? 22 : null;
  tileId.set(`${q},${r}`, Number(insTile.run(me, q, r, "root", cursed, mix, chp, cmax, now).lastInsertRowid));
}
db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at, defenses, fed_energy) VALUES (?, ?, 3, 'fallen', ?, 0, 0)").run(me, tileId.get("0,0"), now);
db.prepare("UPDATE tender_progress SET tender_tile_id = ? WHERE owner_key = ?").run(tileId.get("0,0"), me);

function seedAwokin(name, partPower = 2) {
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, 'root', ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, partPower, partPower, `orbinfo/${name}-${cat}.png`, now).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: partPower, toughness: partPower, element: "root" });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `orbinfo/${name}.png`, JSON.stringify(parts), "Orb Tender", me, now).lastInsertRowid);
}
const soloId = seedAwokin("Orb Solo", 2);
const soloTile = db.prepare("SELECT * FROM territory_tiles WHERE id = ?").get(tileId.get("1,0"));
db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
  VALUES (?, ?, ?, ?, ?, 'defense', 0, 30, ?, ?, 12, 12, 0)`).run(me, soloId, soloTile.id, now, now, soloTile.q, soloTile.r);

const served = await call("getTerritory", {}, token);
const servedTile = (q, r) => (served.tiles ?? []).find((t) => t.id === tileId.get(`${q},${r}`));
const servedPlacement = (served.placements ?? []).find((p) => p.awakenedId === soloId);
ok("the seeded mix is served whole", JSON.stringify(servedTile(-1, 1)?.mix ?? {}) === JSON.stringify(MIX), JSON.stringify(servedTile(-1, 1)?.mix));
ok("the damaged cursed tile is served at 9 of 22", (servedTile(1, 1)?.curseHp ?? null) === 9 && (servedTile(1, 1)?.curseMaxHp ?? null) === 22,
  JSON.stringify({ hp: servedTile(1, 1)?.curseHp, max: servedTile(1, 1)?.curseMaxHp }));
ok("the placement is served hurt (hp 30)", (servedPlacement?.hp ?? null) === 30, JSON.stringify(servedPlacement?.hp));

/* ══ OPEN THE LAND ════════════════════════════════════════ */
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:orbinfo]", String(e).slice(0, 200)));
await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
async function openLand() {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2500);
  const door = await page.$(".deck-button");
  if (!door) throw new Error("no .deck-button on the home face");
  await door.click();
  await page.waitForFunction(() => !!window.__tenderJump && !!window.__tenderJump.pos(), { timeout: 30000 }).catch(() => {});
  await sleep(1500);
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
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "×").forEach((b) => b.click());
  });
  await sleep(3500);
}
await openLand();

const tilesArg = (served.tiles ?? []).map((t) => ({ id: t.id, q: t.q, r: t.r, cursed: !!t.cursed }));
const solveLattice = async () => page.evaluate((tiles) => {
  const polys = [...document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]')];
  const cents = polys.map((p) => {
    const pts = (p.getAttribute("points") ?? "").trim().split(/\s+/).map((s) => s.split(",").map(Number));
    return { x: pts.reduce((a, pt) => a + pt[0], 0) / pts.length, y: pts.reduce((a, pt) => a + pt[1], 0) / pts.length };
  });
  if (!cents.length) return { error: "no hit polygons on the face" };
  const size = 54;
  const U = [1292 * size / 796, 470 * size / 796], V = [0, 948 * size / 796];
  const score = (ox, oy) => {
    let h = 0;
    for (const t of tiles) {
      const ex = ox + t.q * U[0] + t.r * V[0], ey = oy + t.q * U[1] + t.r * V[1];
      if (cents.some((o) => Math.abs(o.x - ex) < 3 && Math.abs(o.y - ey) < 3)) h++;
    }
    return h;
  };
  let best = null;
  for (const c of cents) { const h = score(c.x, c.y); if (!best || h > best.hits) best = { ox: c.x, oy: c.y, hits: h }; }
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) {
    if (!a && !b) continue;
    const ox = best.ox + a * U[0] + b * V[0], oy = best.oy + a * U[1] + b * V[1];
    const h = score(ox, oy);
    if (h > best.hits) best = { ox, oy, hits: h };
  }
  if (!best || best.hits < tiles.length) return { error: `lattice fit: ${best?.hits}/${tiles.length}` };
  const svg = document.querySelector("svg.territory-svg");
  const ctm = svg.getScreenCTM();
  const toClient = (sx, sy) => {
    const pt = new DOMPoint(sx, sy).matrixTransform(ctm);
    return { x: pt.x, y: pt.y };
  };
  const out = {};
  for (const t of tiles) {
    const sx = best.ox + t.q * U[0] + t.r * V[0], sy = best.oy + t.q * U[1] + t.r * V[1];
    out[t.id] = { svg: { x: sx, y: sy }, client: toClient(sx, sy) };
  }
  return { points: out, count: tiles.length };
}, tilesArg);
let lattice = await solveLattice();
ok("the land lattice is solved for the gestures", !lattice.error && lattice.count === tilesArg.length, JSON.stringify(lattice.error ?? lattice.count));
const clientOf = (q, r) => lattice.points[tileId.get(`${q},${r}`)].client;
const svgOf = (q, r) => lattice.points[tileId.get(`${q},${r}`)].svg;
const popupRows = () => page.evaluate(() =>
  [...document.querySelectorAll(".orb-info-popup .orb-info-row")].map((r) => [...r.querySelectorAll("span")].map((s) => s.textContent.trim())));
const popupGone = () => page.evaluate(() => !document.querySelector(".orb-info-popup"));
const waitPopup = (sel) => page.waitForFunction((s) => !!document.querySelector(s), { timeout: 10000 }, sel).then(() => true).catch(() => false);

/* ══ §1 THE TILE CARD ══════════════════════════════════════ */
{
  const pt = clientOf(-1, 1);
  await page.mouse.click(pt.x, pt.y);
  const stood = await waitPopup(".orb-info-tilebox");
  ok("§1 a tap on the mixed tile raises its card over the orb", stood);
  const rows = await popupRows();
  const want = [["Air", "6"], ["Rock", "2"], ["Water", "3"], ["Root", "10"]];
  ok("§1 the card's rows are the tile's served ledger, element for element",
    JSON.stringify(rows) === JSON.stringify(want), JSON.stringify(rows));
  const box = await page.evaluate(() => {
    const p = document.querySelector(".orb-info-tilebox");
    const o = document.querySelector(".energy-orb-fixed");
    if (!p || !o) return null;
    const pr = p.getBoundingClientRect(), or = o.getBoundingClientRect();
    return { popupLeft: pr.left, popupBottom: window.innerHeight - pr.bottom, orbLeft: or.left, orbTop: window.innerHeight - or.top };
  });
  ok("§1 the card stands over the energy orb (same left edge, above it)",
    !!box && Math.abs(box.popupLeft - box.orbLeft) < 2 && box.popupBottom > box.orbTop - 2,
    JSON.stringify(box));
  await page.evaluate(() => { [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "×").forEach((b) => b.click()); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "orb-tile-card.png") });
}

/* ══ §2 THE CURSED CARD, AND ITS FACE WITHOUT NUMBERS ══════ */
{
  const pt = clientOf(1, 1);
  await page.mouse.click(pt.x, pt.y);
  const stood = await waitPopup(".orb-info-tilebox");
  ok("§2 a tap on the cursed tile raises its card", stood);
  const rows = await popupRows();
  ok("§2 the card carries the curse health it lost from the face (9 of 22)",
    rows.some((r) => r[0] === "Curse health" && r[1] === "9 of 22"), JSON.stringify(rows));
  ok("§2 the card carries the thorns it lost from the face (2, its ring)",
    rows.some((r) => r[0] === "Thorns" && r[1] === "2"), JSON.stringify(rows));
  const faceTexts = await page.evaluate(() =>
    [...document.querySelectorAll("svg.territory-svg text")].map((t) => t.textContent ?? ""));
  ok("§2 no ♥ stands on any tile face", !faceTexts.some((t) => t.includes("♥")), JSON.stringify(faceTexts.filter((t) => t.includes("♥"))));
  ok("§2 no 🌵 stands on any tile face", !faceTexts.some((t) => t.includes("🌵")), JSON.stringify(faceTexts.filter((t) => t.includes("🌵"))));
  // Measured in CLIENT space (bounding-rect centres): the face
  // layer lives under the camera groups while the hit layer the
  // lattice reads is screen space, and a tap settles the camera
  // with a short glide — so poll until the face rests (the stack
  // is asserted whole at rest, as the eye meets it).
  const glowOnce = () => page.evaluate(({ cx, cy }) => {
    const rectC = (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
    const near = (p, tol) => Math.abs(p.x - cx) < tol && Math.abs(p.y - cy) < tol;
    const polyAt = (fill) => [...document.querySelectorAll("svg.territory-svg polygon")]
      .filter((p) => p.getAttribute("fill") === fill).map(rectC).some((p) => near(p, 26));
    const halo = [...document.querySelectorAll("svg.territory-svg ellipse")]
      .filter((e) => e.getAttribute("fill") === "url(#corruptionHalo)").map(rectC).some((p) => near(p, 40));
    const wisps = [...document.querySelectorAll("svg.territory-svg ellipse.mist-wisp")]
      .map(rectC).filter((p) => Math.hypot(p.x - cx, p.y - cy) < 110).length;
    return { outer: polyAt("rgba(110,6,26,0.16)"), inner: polyAt("rgba(148,14,52,0.20)"), halo, wisps };
  }, (() => { const p = clientOf(1, 1); return { cx: p.x, cy: p.y }; })());
  let glow = await glowOnce();
  for (let i = 0; i < 9 && !(glow.outer && glow.inner && glow.halo && glow.wisps >= 2); i++) {
    await sleep(500);
    lattice = await solveLattice();
    glow = await glowOnce();
  }
  ok("§2 the cursed glow stack still renders whole at its centre (halo, both crimson polygons, wisps)",
    glow.outer && glow.inner && glow.halo && glow.wisps >= 2, JSON.stringify(glow));
  await page.evaluate(() => { [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "×").forEach((b) => b.click()); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "orb-cursed-card.png") });
}

/* ══ §3 THE TINT STANDS ONLY ON CURSED GROUND ══════════════ */
{
  lattice = await solveLattice();
  const TINTS = ["rgba(74,144,217,0.15)", "rgba(135,206,235,0.15)", "rgba(139,115,85,0.15)", "rgba(107,142,35,0.15)", "rgba(255,68,68,0.15)"];
  const audit = await page.evaluate((tints) => {
    return [...document.querySelectorAll("svg.territory-svg polygon")]
      .filter((p) => tints.includes(p.getAttribute("fill") ?? ""))
      .map((p) => {
        const r = p.getBoundingClientRect();
        return { fill: p.getAttribute("fill"), x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
  }, TINTS);
  const cursedCentres = tilesArg.filter((t) => t.cursed).map((t) => lattice.points[t.id].client);
  const onCursed = (c) => cursedCentres.some((s) => Math.abs(s.x - c.x) < 8 && Math.abs(s.y - c.y) < 8);
  ok("§3 the tint survives on the seeded cursed tiles (theirs stays as it is)",
    audit.length >= 2, `tint polygons in the face: ${audit.length}`);
  ok("§3 no tint polygon stands on any purified tile",
    audit.every(onCursed), JSON.stringify(audit.filter((c) => !onCursed(c))));
}

/* ══ §4 THE AWOKEN CARD ════════════════════════════════════ */
{
  const pt = clientOf(1, 0);
  await page.mouse.click(pt.x, pt.y);
  let stood = await waitPopup(".orb-info-awoken");
  if (!stood) { // the figure's heart sits a little above its hex centre
    await page.mouse.click(pt.x, pt.y - 22);
    stood = await waitPopup(".orb-info-awoken");
  }
  ok("§4 a tap on the field Awoken raises its card over the orb", stood);
  const name = await page.evaluate(() => document.querySelector(".orb-info-awoken .orb-info-name")?.textContent?.trim() ?? "");
  ok("§4 the card names the Awoken", name === "Orb Solo", name);
  const pips = await page.evaluate(() => document.querySelector(".orb-info-awoken .tc-pips")?.textContent ?? "");
  const tough = Number((pips.match(/🛡\s*(\d+)/) ?? [])[1] ?? NaN);
  ok("§4 the card face carries its toughness (🛡 6 from its three parts)", tough === 6, pips);
  const rows = await popupRows();
  ok("§4 the card's Health reads the placement's hurt against that toughness (30 of 6)",
    rows.some((r) => r[0] === "Health" && r[1] === `30 of ${tough}`), JSON.stringify(rows));
  if (servedPlacement && Number(servedPlacement.shield ?? 0) > 0) {
    ok("§4 the card's Shield reads the served pool",
      rows.some((r) => r[0] === "Shield" && r[1] === String(Math.ceil(Number(servedPlacement.shield)))), JSON.stringify(rows));
  } else {
    console.log("  note - the served placement carried no shield; Shield row not asserted");
  }
  ok("§4 the card carries its Level and Experience",
    rows.some((r) => r[0] === "Level") && rows.some((r) => r[0] === "Experience" && /XP$/.test(r[1])), JSON.stringify(rows));
  const wheel = await page.evaluate(() => !!document.querySelector(".gw-wheel"));
  ok("§4 the orders wheel still opens on the same click", wheel);
  const faceTexts = await page.evaluate(() =>
    [...document.querySelectorAll("svg.territory-svg text")].map((t) => t.textContent ?? ""));
  ok("§4 no stat text stands under the chosen figure's feet",
    !faceTexts.some((t) => /HP \d+\/\d+/.test(t) || /Shield \d+ ·/.test(t) || /· Lv \d+/.test(t)),
    JSON.stringify(faceTexts.filter((t) => /HP \d+\/\d+|Shield \d+ ·|· Lv \d+/.test(t))));
  await page.screenshot({ path: join(OUT, "orb-awoken-card.png") });
  const pop = await page.$(".orb-info-awoken");
  if (pop) await pop.screenshot({ path: join(OUT, "orb-awoken-card-close.png") });
}

/* ══ §4b THE CARD FITS AN IPAD VIEWPORT ════════════════════ */
{
  await page.setViewport({ width: 1024, height: 768, deviceScaleFactor: 1 });
  await sleep(1200);
  lattice = await solveLattice();
  ok("§4b the lattice re-solves at iPad size", !lattice.error, JSON.stringify(lattice.error ?? lattice.count));
  const pt = clientOf(1, 0);
  await page.mouse.click(pt.x, pt.y);
  let stood = await waitPopup(".orb-info-awoken");
  if (!stood) { await page.mouse.click(pt.x, pt.y - 22); stood = await waitPopup(".orb-info-awoken"); }
  ok("§4b the card stands at iPad size", stood);
  const fit = await page.evaluate(() => {
    const p = document.querySelector(".orb-info-awoken");
    if (!p) return null;
    const r = p.getBoundingClientRect();
    return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, iw: window.innerWidth, ih: window.innerHeight };
  });
  ok("§4b the whole card is inside the screen (top, left, right within the viewport)",
    !!fit && fit.top >= 0 && fit.left >= 0 && fit.right <= fit.iw + 1, JSON.stringify(fit));
  await page.screenshot({ path: join(OUT, "orb-awoken-card-ipad.png") });
}

/* ══ §5 DISMISSAL ══════════════════════════════════════════ */
{
  const corner = await page.evaluate(() => {
    const r = document.querySelector("svg.territory-svg").getBoundingClientRect();
    return { x: r.left + 14, y: r.top + 14 };
  });
  await page.mouse.click(corner.x, corner.y);
  await sleep(600);
  ok("§5 an empty-map tap sets the card down with the choosing", await popupGone());
}

console.log(`\nCLICK-INFO-ORB DRIVE: ${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
