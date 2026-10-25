// drive-one-pass-render.mjs — THE ONE-PASS RENDER (Nigel,
// 2026-10-25 13:54: "im still getting a lot of flickerin on
// screen"). The homeland map's layers once painted from
// separate state on separate beats: the ground and the
// figures rode the read loop's 2.8 s sequenced beat while
// the seed layer and the incursion-columns layer read
// react-query snapshots up to THIRTY SECONDS old, and every
// action handler applied only the slices it fancied from
// its own read — so a frame could (and did) mix moments.
// The Battleground held the same ghost in miniature: its
// referee reckoned from refs that were only synced from
// state in an effect AFTER the paint.
//
// This drive proves the cure on the real screens:
//
// §A THE FABRICATED FIELD — one tile per element (tide,
//    sky, stone, root, fire, neutral), all purified, plus
//    two cursed tiles, a fallen seed, a marching column, a
//    wanderer and a standing company. Every tile's drawn
//    face is read out of the real map's DOM and checked
//    against the element written on it — the standing
//    "defaulting to air" question (open since 2026-10-16)
//    settled in the render itself: each written element
//    must draw its OWN face, sky the green moss-isle,
//    neutral the pale tray, a cursed tile the cursed face
//    whatever its element says.
// §B ONE FRAME, EVERY LAYER — the map stamps each applied
//    snapshot with a frame number on the svg root, and the
//    window keeps the frame's census. (The stamp rides the
//    root alone: the land's own law — proven by the flicker
//    drive — is that nothing inside the camera groups
//    mutates while the camera moves.) Sampled every 120 ms
//    across three read-loop beats: the stamp must equal
//    the census's number on every sample, the painted
//    counts (hit polygons, seed figures, column lines)
//    must equal that frame's census, and the frame number
//    must never go backwards (no layer rewinds).
// §C THE SEED MOVES WITH THE WORLD — a seed fed in the
//    database mid-watch must appear on the map within one
//    loop beat or so, in the SAME frame as everything else
//    (the old split left it up to thirty seconds behind).
// §D THE BATTLEGROUND — opened the real way (a curse strike
//    that pulls the Tender in). Its overlay wears its own
//    frame stamp and living census; sampled through the
//    fight, the stamp and the window's battle frame must
//    agree and the painted living counts must equal the
//    frame's census on every sample.
//
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-one-pass-render.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

const OUT = "/home/hatch/workspace/one-pass-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-one-pass-"));
process.env.PORT = "3997";
process.env.WORKSHOP_PASSWORD = "one-pass-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3997";
const PW = "one-pass-drive-password";
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
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up, as the other drives do */ }

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

function seedAwokin(ownerKey, tenderName, name, partPower = 10) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, 'root', ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, partPower, partPower, `onepass/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: partPower, toughness: partPower, element: "root" });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `onepass/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
async function claimWithExp(name, exp) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, exp, Date.now());
  return { token: claim.token, ownerKey };
}

/* ══ THE FABRICATED FIELD ════════════════════════════════ */
const T = await claimWithExp("One Pass Tender", 3800);
const now = Date.now();
db.prepare(`INSERT INTO tender_progress (owner_key, class_key, weapon_key, hp, weapon_next_at, updated_at)
  VALUES (?, 'warden', 'sword', 100, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', hp = 100`).run(T.ownerKey, now + 600000, now);
// One tile per element in the inner ring, a neutral heart,
// a mixed outer ring, and two cursed tiles (elements root
// and sky — a cursed tile must wear the cursed face
// whatever its element says).
const ELEMENT_AT = new Map([
  ["0,0", "neutral"],
  ["1,0", "tide"], ["0,1", "sky"], ["-1,1", "stone"],
  ["-1,0", "root"], ["0,-1", "fire"], ["1,-1", "neutral"],
  ["2,0", "root"], ["2,-1", "sky"], ["2,-2", "tide"],
  ["1,1", "stone"], ["0,2", "fire"], ["-1,2", "tide"],
  ["-2,2", "sky"], ["-2,1", "stone"], ["-2,0", "fire"],
  ["-1,-1", "root"], ["0,-2", "stone"], ["1,-2", "sky"],
]);
const CURSED = new Set(["2,0", "2,-1"]);
const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, curse_hp, curse_max_hp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
const tileId = new Map();
for (const [key, el] of ELEMENT_AT) {
  const [q, r] = key.split(",").map(Number);
  const cursed = CURSED.has(key) ? 1 : 0;
  tileId.set(key, Number(insTile.run(T.ownerKey, q, r, el, cursed, cursed ? 10 : null, cursed ? 10 : null, now).lastInsertRowid));
}
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?)").run(T.ownerKey, now);
const insPlace = db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, follow, hp) VALUES (?, ?, ?, ?, ?, 0, 30)");
const wardenId = seedAwokin(T.ownerKey, "One Pass Tender", "One Pass Warden", 10);
insPlace.run(T.ownerKey, wardenId, tileId.get("0,0"), now, now);
const friendId = seedAwokin(T.ownerKey, "One Pass Tender", "One Pass Friend", 4);
insPlace.run(T.ownerKey, friendId, tileId.get("1,-1"), now, now);
// Two more in the hand, unplaced — the Battleground's deck.
seedAwokin(T.ownerKey, "One Pass Tender", "One Pass Third", 4);
seedAwokin(T.ownerKey, "One Pass Tender", "One Pass Fourth", 4);
// THE STRIKER (for §D): stood at (-1,0), beside the tile the
// rounds will curse. She — like every Awokin this drive
// fields — is created BEFORE the page loads: the screen
// only draws figures for the Awokin in its deck, and the
// deck is read at load. (A drive-made Awokin inserted
// mid-session stands in the ledger but never on the map.)
const strikerId = seedAwokin(T.ownerKey, "One Pass Tender", "One Pass Striker", 10);
db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, follow, hp) VALUES (?, ?, ?, ?, ?, 0, 500)").run(T.ownerKey, strikerId, tileId.get("-1,0"), now, now);
// A fallen seed on the tide tile, a marching column aimed at
// the heart, a wanderer on the far stone.
const seedTileId = tileId.get("1,0");
db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at, fed_energy) VALUES (?, ?, 1, 'fallen', ?, 0)").run(T.ownerKey, seedTileId, now);
db.prepare("INSERT INTO incursion_columns (owner_key, target_tile_id, target_kind, kind, size, power, state, origin_q, origin_r, spawned_at, arrives_at) VALUES (?, ?, 'hex', 'raid', 3, 2, 'marching', 9, -9, ?, ?)").run(T.ownerKey, tileId.get("0,0"), now, now + 600000);
db.prepare("INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at) VALUES (?, ?, 'fray', ?)").run(T.ownerKey, tileId.get("-2,1"), now);

const terr0 = await call("getTerritory", {}, T.token);
const seeds0 = await call("getSeeds", {}, T.token);
const inc0 = await call("getIncursions", {}, T.token);
// The first read deals the homeland's full disc around the
// fabricated field (the founding deal) — the fabricated
// tiles must stand in it exactly as written.
const fabricatedReadback = [...ELEMENT_AT].every(([key, el]) => {
  const [q, r] = key.split(",").map(Number);
  const t = terr0.tiles.find((x) => x.q === q && x.r === r);
  return t && t.element === el && !!t.cursed === CURSED.has(key);
});
ok("the fabricated field stands in the dealt world exactly as written (element and curse per tile)", fabricatedReadback && seeds0.seeds.length === 1 && (inc0.columns ?? []).length === 1,
  `tiles ${terr0.tiles.length}, seeds ${seeds0.seeds.length}, columns ${(inc0.columns ?? []).length}`);
const tilesById = new Map(terr0.tiles.map((t) => [t.id, t]));
// THE GUARDS (for §D): the battle a wave-pull opens is
// fought by the Awokin standing on a fallback tile the
// screen picks at random from the purified land — so a
// strong guard stands on nearly every purified tile from
// the start (also before the page loads, for the deck
// reason above). A pick with no defender falls the moment
// it opens (the game's standing law) — such a round is
// spent and the next begins.
const guardTiles = terr0.tiles.filter((t) => !t.cursed && !(t.q === 0 && t.r === 0) && t.id !== tileId.get("-1,1") && t.id !== tileId.get("-1,0") && t.id !== tileId.get("0,0") && t.id !== tileId.get("1,-1"));
let guardCount = 0;
for (const t of guardTiles) {
  const gid = seedAwokin(T.ownerKey, "One Pass Tender", `One Pass Guard ${guardCount}`, 6);
  db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, follow, hp) VALUES (?, ?, ?, ?, ?, 0, 500)").run(T.ownerKey, gid, t.id, now, now);
  guardCount++;
}
console.log(`  stood ${guardCount} guards across the purified field for the battle's fallback pick (of ${guardTiles.length + 4} purified tiles in the dealt world)`);

/* ══ OPEN THE LAND ═══════════════════════════════════════ */
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:one-pass]", String(e).slice(0, 200)));
await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, T.token);
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
await sleep(1000);
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
await page.waitForFunction(() => {
  const svg = document.querySelector("svg.territory-svg");
  return svg && Number(svg.getAttribute("data-frame") ?? 0) >= 1 && window.__awokenWorldFrame;
}, { timeout: 30000 });
await page.screenshot({ path: `${OUT}/homeland-fabricated-field.png` });

/* ══ §A — EVERY WRITTEN ELEMENT DRAWS ITS OWN FACE ═══════ */
// Faces are matched to tiles by GEOMETRY: the lattice is
// fit from the hit polygons' own points (the flicker
// drive's solver), giving every tile its centre on the
// plate; a terrain image belongs to the tile whose centre
// its painted face sits on (the glyph image is placed so
// its face centre — at 964/1730, 546/1280 of the canvas —
// lands on the tile's centre; the tray underlay centres
// plainly). Only the nineteen fabricated tiles are judged:
// they are the ones whose written element this drive knows
// by its own hand.
const tilesArg = [...ELEMENT_AT].map(([key, el]) => {
  const [q, r] = key.split(",").map(Number);
  const t = terr0.tiles.find((x) => x.q === q && x.r === r);
  return { id: t.id, q, r, element: el, cursed: CURSED.has(key) };
});
const allTilesArg = terr0.tiles.map((t) => ({ id: t.id, q: t.q, r: t.r }));
const faceReport = await page.evaluate((tiles, allTiles) => {
  const svg = document.querySelector("svg.territory-svg");
  const polys = [...svg.querySelectorAll('polygon[fill="rgba(0,0,0,0)"]')];
  const cents = polys.map((p) => {
    const pts = (p.getAttribute("points") ?? "").trim().split(/\s+/).map((s) => s.split(",").map(Number));
    return { x: pts.reduce((a, pt) => a + pt[0], 0) / pts.length, y: pts.reduce((a, pt) => a + pt[1], 0) / pts.length };
  });
  const size = 54;
  const U = [1292 * size / 796, 470 * size / 796], V = [0, 948 * size / 796];
  const score = (ox, oy) => {
    let h = 0;
    for (const t of allTiles) {
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
  if (!best || best.hits < allTiles.length) return { error: `lattice fit: ${best?.hits}/${allTiles.length}` };
  const images = [...svg.querySelectorAll("image")].map((im) => {
    const href = im.getAttribute("href") ?? "";
    const x = Number(im.getAttribute("x")), y = Number(im.getAttribute("y"));
    const w = Number(im.getAttribute("width")), h = Number(im.getAttribute("height"));
    return { href, face: { x: x + 0.502 * w, y: y + 0.427 * h }, plain: { x: x + w / 2, y: y + h / 2 } };
  }).filter((im) => im.href.includes("-v3"));
  const rows = tiles.map((t) => {
    const cx = best.ox + t.q * U[0] + t.r * V[0], cy = best.oy + t.q * U[1] + t.r * V[1];
    const hrefs = images.filter((im) => Math.hypot(im.face.x - cx, im.face.y - cy) < 22 || Math.hypot(im.plain.x - cx, im.plain.y - cy) < 22).map((im) => im.href);
    return { id: t.id, element: t.element, cursed: t.cursed, hrefs };
  });
  const fills = [...svg.querySelectorAll("polygon")].map((p) => p.getAttribute("fill") ?? "");
  return { rows, fills, fit: best.hits };
}, tilesArg, allTilesArg);
ok("§A the lattice fits the whole dealt map (faces are matched to tiles by where they are painted)", !faceReport.error && faceReport.fit === allTilesArg.length,
  JSON.stringify({ fit: faceReport.fit, tiles: allTilesArg.length, error: faceReport.error }));
const STEM = { tide: "tide-v3", sky: "sky-v3", stone: "stone-v3", root: "root-v3", neutral: "neutral-v3" };
let faceBad = [];
for (const row of faceReport.rows ?? []) {
  const stems = row.hrefs.map((h) => Object.values(STEM).concat(["cursed-v3"]).find((s) => h.includes(s)) ?? h);
  if (row.cursed) {
    if (!stems.every((s) => s === "cursed-v3")) faceBad.push(`${row.id} cursed/${row.element}: ${stems.join(",")}`);
  } else if (row.element === "fire") {
    // Fire owns no bundled tray — its face is the neutral
    // tray under the fire tint (the shipped design); the
    // tint itself is checked below.
    if (!stems.every((s) => s === "neutral-v3")) faceBad.push(`${row.id} fire: ${stems.join(",")}`);
  } else {
    if (!stems.length || !stems.every((s) => s === STEM[row.element])) faceBad.push(`${row.id} ${row.element}: ${stems.join(",")}`);
  }
}
ok("§A every tile draws its own element's face (cursed wears the cursed face; fire the neutral tray under its tint)", faceBad.length === 0, faceBad.join(" | "));
const skyRow = (faceReport.rows ?? []).find((r) => r.element === "sky" && !r.cursed);
const neutralRow = (faceReport.rows ?? []).find((r) => r.element === "neutral" && !r.cursed);
ok("§A the discriminator: the sky tile wears sky-v3 and NOT the neutral tray; the neutral tile wears neutral-v3 and NOT sky",
  !!skyRow && skyRow.hrefs.some((h) => h.includes("sky-v3")) && !skyRow.hrefs.some((h) => h.includes("neutral-v3")) &&
  !!neutralRow && neutralRow.hrefs.some((h) => h.includes("neutral-v3")) && !neutralRow.hrefs.some((h) => h.includes("sky-v3")),
  JSON.stringify({ sky: skyRow?.hrefs, neutral: neutralRow?.hrefs }));
ok("§A the element tints ride with their elements (fire's tint and sky's tint are both on the map, in the ground layer's own colours)",
  (faceReport.fills ?? []).some((f) => f === "rgba(255,68,68,0.15)") && (faceReport.fills ?? []).some((f) => f === "rgba(135,206,235,0.15)"),
  (faceReport.fills ?? []).filter((f) => f.startsWith("rgba")).slice(0, 8).join(","));

/* ══ §B — ONE FRAME, EVERY LAYER, SAMPLED ════════════════ */
const sampleFrames = (page, ms) => page.evaluate((dur) => new Promise((resolve) => {
  const out = [];
  const grab = () => {
    const svg = document.querySelector("svg.territory-svg");
    if (!svg) return;
    const groups = [...svg.querySelectorAll("g")];
    // The two once-foreign layers, found by what they paint:
    // the seed layer's figures carry the seed's own readings
    // ("Lv 1", and the feeding line once it has been fed);
    // the columns layer's carry the ⚠ of a marching column.
    // Ancestor groups contain those texts too — the layer
    // itself is the smallest group that does.
    const smallestWithText = (re) => {
      const hits = groups.filter((g) => [...g.querySelectorAll("text")].some((t) => re.test(t.textContent ?? "")));
      return hits.sort((a, b) => a.childElementCount - b.childElementCount)[0];
    };
    const seedG = smallestWithText(/Lv \d|fed \d/);
    const colG = smallestWithText(/⚠/);
    out.push({
      at: Date.now(),
      svg: Number(svg.getAttribute("data-frame")),
      win: window.__awokenWorldFrame ? window.__awokenWorldFrame.id : null,
      hit: svg.querySelectorAll('polygon[fill="rgba(0,0,0,0)"]').length,
      winTiles: window.__awokenWorldFrame ? window.__awokenWorldFrame.tiles : null,
      seedKids: seedG ? seedG.childElementCount : null,
      winSeeds: window.__awokenWorldFrame ? window.__awokenWorldFrame.seeds : null,
      colKids: colG ? colG.childElementCount : null,
      winCols: window.__awokenWorldFrame ? window.__awokenWorldFrame.columns : null,
    });
  };
  grab();
  const iv = setInterval(grab, 120);
  setTimeout(() => { clearInterval(iv); resolve(out); }, dur);
}), ms);

const samples = await sampleFrames(page, 9000);
const badStamp = samples.filter((s) => s.win === null || s.svg !== s.win);
ok(`§B across ${samples.length} samples the map's frame stamp is the window census's number (one snapshot, stamped once)`, badStamp.length === 0, JSON.stringify(badStamp.slice(0, 3)));
const badCount = samples.filter((s) => s.hit !== s.winTiles || (s.seedKids !== null && s.winSeeds >= 0 && s.seedKids !== s.winSeeds) || (s.colKids !== null && s.winCols >= 0 && s.colKids !== s.winCols));
ok("§B the painted counts equal the frame's census on every sample (tiles, seeds, columns)", badCount.length === 0, JSON.stringify(badCount.slice(0, 3)));
let rewound = false, lastId = -1, advanced = 0;
for (const s of samples) { if (s.win < lastId) rewound = true; if (s.win > lastId) advanced++; lastId = s.win; }
ok("§B the frame number never goes backwards, and the world advanced while watched", !rewound && advanced >= 2, `advanced ${advanced}, rewound ${rewound}`);

/* ══ §C — THE SEED MOVES WITH THE WORLD ══════════════════ */
const seedRowId = db.prepare("SELECT id FROM star_seeds WHERE owner_key = ?").get(T.ownerKey).id;
db.prepare("UPDATE star_seeds SET fed_energy = 5 WHERE id = ?").run(seedRowId);
const seenFed = await page.evaluate(() => new Promise((resolve) => {
  const t0 = Date.now();
  const iv = setInterval(() => {
    const svg = document.querySelector("svg.territory-svg");
    const groups = svg ? [...svg.querySelectorAll("g")] : [];
    const hits = groups.filter((g) => [...g.querySelectorAll("text")].some((t) => /fed \d/.test(t.textContent ?? "")));
    const seedG = hits.sort((a, b) => a.childElementCount - b.childElementCount)[0];
    const txt = seedG ? [...seedG.querySelectorAll("text")].map((t) => t.textContent).join(" ") : "";
    if (txt.includes("fed 5")) { clearInterval(iv); resolve({ ms: Date.now() - t0, txt }); }
    if (Date.now() - t0 > 20000) { clearInterval(iv); resolve({ ms: -1, txt }); }
  }, 150);
}));
ok("§C a seed fed in the world shows its new feeding on the map within one loop beat's grace (under 8 s; the old split lagged up to 30 s)", seenFed.ms >= 0 && seenFed.ms < 8000, JSON.stringify(seenFed));
await page.screenshot({ path: `${OUT}/homeland-after-feed.png` });

/* ══ §D — THE BATTLEGROUND, OPENED BY A REAL PULL ════════ */
// The lattice solver from the flicker drive: fit the map's
// own geometry from the hit polygons, so clicks land on the
// tiles themselves.
const terrNow = await call("getTerritory", {}, T.token);
const tilesNowArg = terrNow.tiles.map((t) => ({ id: t.id, q: t.q, r: t.r }));
const solveLattice = async () => page.evaluate((tiles) => {
  const polys = [...document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]')];
  const cents = polys.map((p) => {
    const pts = (p.getAttribute("points") ?? "").trim().split(/\s+/).map((s) => s.split(",").map(Number));
    return { x: pts.reduce((a, pt) => a + pt[0], 0) / pts.length, y: pts.reduce((a, pt) => a + pt[1], 0) / pts.length };
  });
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
  const out = {};
  for (const t of tiles) {
    const sx = best.ox + t.q * U[0] + t.r * V[0], sy = best.oy + t.q * U[1] + t.r * V[1];
    const pt = new DOMPoint(sx, sy).matrixTransform(ctm);
    out[t.id] = { x: pt.x, y: pt.y };
  }
  return { points: out };
}, tilesNowArg);

const clickDisc = async (txt) => {
  const handle = await page.evaluateHandle((t) => [...document.querySelectorAll(".gw-disc")].find((d) => (d.getAttribute("aria-label") || "") === t), txt);
  const el = handle.asElement();
  if (!el) return false;
  const box = await el.boundingBox();
  if (!box) return false;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return true;
};

// The tile (-1,1) is cursed fresh each round (curse_hp 1 —
// one blow breaks it). A striker stands alone on (-1,0),
// beside it (the tile (0,1) is the Tender's own standing
// ground — her figure covers whoever stands there, so the
// striker does not share it); her own orders wheel opens
// on a click on her figure; its Attack entry sets her
// stance and arms the tap; the tap on the cursed tile
// strikes it.
//
const targetTileId = tileId.get("-1,1");
const strikerTileId = tileId.get("-1,0");
let pulled = false, pullRounds = 0;
for (let round = 0; round < 10 && !pulled; round++) {
  pullRounds = round + 1;
  db.prepare("UPDATE territory_tiles SET cursed = 1, curse_hp = 1, curse_max_hp = 10 WHERE id = ?").run(targetTileId);
  // The striker is one Awokin, created before the page
  // loaded; between rounds the homeland's own teeth may
  // have felled her — stand her back on her tile, whole,
  // from the ledger. (Same id every round: the screen knows
  // her from its deck and draws her the moment she stands.)
  const stoodRow = db.prepare("SELECT id FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(T.ownerKey, strikerId);
  if (stoodRow) db.prepare("UPDATE field_placements SET hp = 500, tile_id = ? WHERE id = ?").run(strikerTileId, stoodRow.id);
  else db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, follow, hp) VALUES (?, ?, ?, ?, ?, 0, 500)").run(T.ownerKey, strikerId, strikerTileId, now, now);
  await sleep(3200); // one read-loop beat: the curse and the striker reach the map
  const lattice = await solveLattice();
  if (lattice.error) { console.log("  lattice:", lattice.error); break; }
  const fpt = lattice.points[strikerTileId], tpt = lattice.points[targetTileId];
  // A fresh placement GLIDES to her tile from the Tender's
  // side — wait until a figure truly stands at the tile
  // before clicking her, however long the walk takes.
  const stood = await page.evaluate((pt) => new Promise((resolve) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const svg = document.querySelector("svg.territory-svg");
      const els = svg ? [...svg.querySelectorAll("image, svg")] : [];
      const hit = els.some((s) => { const r = s.getBoundingClientRect(); return r.width > 6 && r.width < 170 && Math.hypot(r.x + r.width / 2 - pt.x, r.y + r.height / 2 - pt.y) < 46; });
      if (hit) { clearInterval(iv); resolve(true); }
      if (Date.now() - t0 > 20000) { clearInterval(iv); resolve(false); }
    }, 250);
  }), fpt).catch(() => false);
  if (!stood) { console.log("  round", pullRounds, ": the striker never stood at her tile"); continue; }
  let wheelUp = false;
  for (const dy of [0, -18, -36, -54]) {
    await page.mouse.click(fpt.x, fpt.y + dy);
    wheelUp = await page.waitForSelector(".gw-wheel", { timeout: 4000 }).then(() => true).catch(() => false);
    if (wheelUp) break;
  }
  if (!wheelUp) {
    console.log("  round", pullRounds, ": no orders wheel");
    await page.screenshot({ path: `${OUT}/debug-no-wheel-round-${pullRounds}.png` });
    continue;
  }
  const armed = await clickDisc("Attack");
  if (!armed) { console.log("  round", pullRounds, ": no Attack disc"); await page.keyboard.press("Escape"); continue; }
  await sleep(400);
  // Strike the cursed tile. Its centre may be covered by a
  // wanderer standing on it (the homeland's war is hot by
  // now), so the tap walks the hex's face until the blow
  // lands — proven by the world itself: the tile purified
  // (no pull) or the Battleground opened (the pull).
  let opened = false, struck = false;
  for (const [dx, dy] of [[0, 0], [44, 0], [-44, 0], [0, 30], [0, -30], [44, 26], [-44, -26]]) {
    await page.mouse.click(tpt.x + dx, tpt.y + dy);
    opened = await page.waitForSelector(".battleground-overlay", { timeout: 1600 }).then(() => true).catch(() => false);
    if (opened) { struck = true; break; }
    const tNow = await call("getTerritory", {}, T.token);
    const tt = tNow.tiles.find((x) => x.id === targetTileId);
    if (tt && !tt.cursed) { struck = true; break; }
    const wheelStray = await page.evaluate(() => !!document.querySelector(".gw-wheel"));
    if (wheelStray) await page.keyboard.press("Escape");
  }
  if (!struck) { console.log("  round", pullRounds, ": the strike never landed"); await page.keyboard.press("Escape"); continue; }
  if (!opened) continue; // the blow landed and the land purified — no pull this round
  // A battle with no defender on its tile falls at once;
  // give it three seconds to prove it stands.
  await sleep(3000);
  pulled = await page.evaluate(() => !!document.querySelector(".battleground-overlay"));
  if (!pulled) console.log("  round", pullRounds, ": the pull came, but no defender stood on the battle's tile — it fell at once; round spent");
}
ok(`§D a curse strike pulled the Tender into a Battleground that stands (round ${pullRounds} of up to 10; each break carries the pull's 35% chance, and the battle's tile must hold a defender)`, pulled);

if (pulled) {
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/battleground-open.png` });
  // Field a fighter from the hand so the fight truly moves.
  const card = await page.$(".deck-card-mini");
  if (card) { await card.click().catch(() => {}); await sleep(600); }
  const bgSamples = await page.evaluate((dur) => new Promise((resolve) => {
    const out = [];
    const grab = () => {
      const ov = document.querySelector(".battleground-overlay");
      if (!ov) return;
      const win = window.__awokenBattleFrame;
      out.push({
        frame: Number(ov.getAttribute("data-frame")),
        fighters: Number(ov.getAttribute("data-fighters")),
        enemies: Number(ov.getAttribute("data-enemies")),
        winId: win ? win.id : null,
        winFighters: win ? win.fighters : null,
        winEnemies: win ? win.enemies : null,
        domFighters: document.querySelectorAll(".battle-fighter:not(.enemy)").length,
        domEnemies: document.querySelectorAll(".battle-fighter.enemy").length,
      });
    };
    grab();
    const iv = setInterval(grab, 150);
    setTimeout(() => { clearInterval(iv); resolve(out); }, dur);
  }), 12000);
  const bgBad = bgSamples.filter((s) => s.winId === null || s.frame !== s.winId || s.fighters !== s.winFighters || s.enemies !== s.winEnemies || s.domFighters !== s.fighters || s.domEnemies !== s.enemies);
  ok(`§D across ${bgSamples.length} battle samples the overlay, the window's battle frame and the painted figures agree (one snapshot)`, bgSamples.length >= 10 && bgBad.length === 0, JSON.stringify(bgBad.slice(0, 3)));
  let bgRewound = false, bgLast = -1, bgAdvanced = 0;
  for (const s of bgSamples) { if (s.frame < bgLast) bgRewound = true; if (s.frame > bgLast) bgAdvanced++; bgLast = s.frame; }
  ok("§D the battle frame never rewinds and the fight advanced while watched", !bgRewound && bgAdvanced >= 1, `advanced ${bgAdvanced}, rewound ${bgRewound}`);
  await page.screenshot({ path: `${OUT}/battleground-mid-fight.png` });
}

await browser.close();
console.log(`\ndrive-one-pass-render: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
