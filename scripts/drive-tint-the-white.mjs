// THE TINT TAKES THE WHITE (Nigel, 2026-11-12) — the pixel
// witness for the matter shard's corrected tint, plus his
// same-day amendment ("give that color more of an elemental
// glow").
//
// THE LAW under proof:
//   §R the page's own shard-tint filters (Territory's defs,
//      built from shardTintRamp in matterShard.ts) carry the
//      corrected ramp for every element: stop 0 is (0,0,0);
//      the glow's mass stands in the element colour (stop at
//      luminance 0.8); only luminance 1 takes the hot lift —
//      the colour walked 30% toward white. Midtones ×0.50 /
//      ×0.80 are the build's proposal and are read, not law.
//   §P by PIXELS, on the real homeland: the flight face —
//      his frame 1, drawn through the page's own filters at
//      native size over dark ground — renders a source-black
//      opaque pixel near-black (every channel ≤ 20) under
//      EVERY element's tint; a source-white opaque pixel
//      renders at the glow's top (the element colour walked
//      30% toward white, ±16 a channel); and with NO filter
//      (the neutral shot) the same pixels render in the
//      art's own colours (±8).
//   §H the glow halo stands in a real flight's group: a
//      seeded war (a Stone firer and a Sky firer beside a
//      mountain-hide Fray, the launched-shot drive's world)
//      flies real shots, and the recorder reads every seated
//      shard frame's group — the halo ellipse stands exactly
//      when the frame's image wears a tint filter, never
//      otherwise; on tinted flights its fill is the flight's
//      element colour, its measure is the halo's own
//      (rx ≈ 0.62 × the frame's width, ry ≈ 0.78 × its
//      height, soft-blurred like the wake).
//
// The source samples are found IN THE PAGE from the frame
// itself: the blackest opaque pixel with opaque, near-black
// neighbours (his black matter chunk) and the whitest opaque
// pixel with opaque, near-white neighbours (his white glow),
// so the assertions judge interior paint, never an edge.
//
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-tint-the-white.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

const OUT = "/home/hatch/workspace/tint-the-white-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-tint-"));
process.env.PORT = "3989";
process.env.WORKSHOP_PASSWORD = "tint-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3989";
const PW = "tint-drive-password";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

/* palette.ts's standing element colours — the same colours
   the surfaces' tint ramps and halos are built from. */
const PALETTE = { root: "#6a8a4e", tide: "#4e8a9b", sky: "#8d9fd6", stone: "#9c7c4c", fire: "#b8542e" };
const ELEMENTS = Object.keys(PALETTE);
const hexRgb = (hex) => [0, 1, 2].map(i => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16));
const glowTop = (hex) => hexRgb(hex).map(c => c + (255 - c) * 0.3);

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

const claim = await call("claimTender", { password: PW, tenderName: "Tint Tender" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
const token = claim.token;
const now = Date.now();
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, now);
db.prepare(`INSERT INTO tender_progress (owner_key, class_key, weapon_key, hp, weapon_next_at, updated_at)
  VALUES (?, 'runewright', 'sword', 100, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'runewright', hp = 100`).run(ownerKey, now + 600000, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?)").run(ownerKey, now);
db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ? WHERE owner_key = ?").run(now, ownerKey);

const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', ?, ?)");
const tileId = new Map();
for (let q = -6; q <= 6; q++) for (let r = -6; r <= 6; r++) {
  if (hexDist({ q, r }, { q: 0, r: 0 }) > 6) continue;
  tileId.set(`${q},${r}`, Number(insTile.run(ownerKey, q, r, 0, now).lastInsertRowid));
}
function seedAwokin(name, element) {
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, 3, 3, element, `tint/${name}-${cat}.png`, now).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: 3, toughness: 3, element });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `tint/${name}.png`, JSON.stringify(parts), "Tint Tender", ownerKey, now).lastInsertRowid);
}
const stone = seedAwokin("Stone Striker", "stone");
db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
  VALUES (?, ?, ?, ?, ?, 'defense', 0, 999, 1, -3, NULL, NULL, 0)`).run(ownerKey, stone, tileId.get("1,-3"), now, now);
const sky = seedAwokin("Sky Striker", "sky");
db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
  VALUES (?, ?, ?, ?, ?, 'defense', 0, 999, 3, -3, NULL, NULL, 0)`).run(ownerKey, sky, tileId.get("3,-3"), now, now);
db.prepare("UPDATE territory_tiles SET cursed = 1 WHERE id = ?").run(tileId.get("2,-3"));
db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
  VALUES (?, ?, 'fray', ?, 100000, 2, -3, 1, 1, 0)`).run(ownerKey, tileId.get("2,-3"), now);

const stillIv = setInterval(() => {
  try { db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ?, wanderer_settled_beats = 0 WHERE owner_key = ?").run(Date.now(), ownerKey); } catch { /* ending */ }
}, 4000);

/* Wake the referee; whether the war truly stands is judged
   in §H, from the flights themselves (a loaded box can take
   a while to deal the first strikes, and a readiness gate
   here once reported a famine that was only a slow door). */
await call("getTerritory", {}, token);

/* ══ OPEN THE LAND ══ */
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:tint]", String(e).slice(0, 200)));
await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
await sleep(2500);
const door = await page.$(".deck-button");
if (!door) throw new Error("territory: no .deck-button on the home face");
await door.click();
await page.waitForFunction(() => !!document.querySelector("#shard-tint-fire"), { timeout: 45000 });
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
console.log("  the homeland stands; its tint filters are in the DOM");

/* ══ §R — THE RAMP TABLES THEMSELVES, read off the page's
   own filter defs (which both grounds build from the one
   shardTintRamp). ══ */
const rampTables = await page.evaluate(() => {
  const out = {};
  for (const el of ["root", "tide", "sky", "stone", "fire"]) {
    const f = document.querySelector(`#shard-tint-${el}`);
    if (!f) { out[el] = null; continue; }
    const read = (tag) => f.querySelector(tag)?.getAttribute("tableValues")?.trim().split(/\s+/).map(Number) ?? null;
    out[el] = { r: read("feFuncR"), g: read("feFuncG"), b: read("feFuncB") };
  }
  return out;
});
for (const el of ELEMENTS) {
  const hex = PALETTE[el];
  const rgb = hexRgb(hex).map(c => c / 255);
  const expected = [
    [0, 0, 0],
    rgb.map(c => c * 0.5),
    rgb.map(c => c * 0.8),
    [...rgb],
    rgb.map(c => c + (1 - c) * 0.3),
  ];
  const t = rampTables[el];
  let worst = Infinity;
  if (t && t.r && t.g && t.b) {
    worst = 0;
    for (let s = 0; s < 5; s++) for (let ch = 0; ch < 3; ch++) {
      const got = [t.r, t.g, t.b][ch][s];
      worst = Math.max(worst, Math.abs(got - expected[s][ch]));
    }
  }
  console.log(`  ${el}: tables=${JSON.stringify(t)} worst deviation from the law's stops=${worst === Infinity ? "n/a" : worst.toFixed(4)}`);
  ok(`§R the ${el} filter carries the corrected ramp — black stop (0,0,0), the colour itself at 0.8, the 30%-toward-white lift at 1`, worst <= 0.002, `worst=${worst}`);
}

/* ══ §P — PIXELS. His frame 1 over dark ground, drawn
   through the page's own filters at native size. ══ */
const frameB64 = readFileSync(join(process.cwd(), "client/src/assets/effects/matter-shard/matter-shard-1.png")).toString("base64");
const samples = await page.evaluate(async (b64) => {
  const img = new Image();
  img.src = `data:image/png;base64,${b64}`;
  await img.decode();
  const cv = document.createElement("canvas");
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
  const W = cv.width;
  const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
  const lum = (p) => 0.213 * p[0] + 0.715 * p[1] + 0.072 * p[2];
  let black = null, white = null, mid = null;
  for (let y = 1; y < cv.height - 1 && !(black && white && mid); y++) {
    for (let x = 1; x < cv.width - 1; x++) {
      const [r, g, b, a] = at(x, y);
      if (a < 250) continue;
      const nb = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
      if (!nb.every(p => p[3] >= 250)) continue;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (!black && mx <= 4 && nb.every(p => Math.max(p[0], p[1], p[2]) <= 48)) black = { x, y, rgb: [r, g, b] };
      if (!white && mn >= 251 && nb.every(p => Math.min(p[0], p[1], p[2]) >= 207)) white = { x, y, rgb: [r, g, b] };
      const L = lum([r, g, b]);
      if (!mid && L >= 100 && L <= 160 && nb.every(p => Math.abs(lum(p) - L) <= 28)) mid = { x, y, rgb: [r, g, b] };
      if (black && white && mid) break;
    }
  }
  return { black, white, mid, w: cv.width, h: cv.height };
}, frameB64);
console.log(`  source samples in frame 1: black=${JSON.stringify(samples.black)} white=${JSON.stringify(samples.white)} mid=${JSON.stringify(samples.mid)}`);
ok("§P the frame offers judgeable paint — a pure opaque black, a pure opaque white, a midtone grey (his art is monochrome; the tint is the only colour a shot ever wears)", !!(samples.black && samples.white && samples.mid));
if (!(samples.black && samples.white && samples.mid)) { console.log("drive-tint-the-white: aborted — no judgeable samples"); process.exit(1); }

const RIG_X = 20, RIG_Y = 20;
async function renderRig(filterId) {
  await page.evaluate((b64, fid, rx, ry) => {
    document.querySelector("#tint-rig")?.remove();
    const host = document.createElement("div");
    host.id = "tint-rig";
    host.style.cssText = `position:fixed;left:0;top:0;width:560px;height:330px;background:#101418;z-index:99999;`;
    host.innerHTML = `<svg width="512" height="273" style="position:absolute;left:${rx}px;top:${ry}px" viewBox="0 0 512 273">
      <image href="data:image/png;base64,${b64}" x="0" y="0" width="512" height="273"${fid ? ` filter="url(#${fid})"` : ""}/>
    </svg>`;
    document.body.appendChild(host);
  }, frameB64, filterId, RIG_X, RIG_Y);
  await sleep(350);
  const shot = await page.screenshot();
  return page.evaluate(async (shotB64, pts) => {
    const img = new Image();
    img.src = `data:image/png;base64,${shotB64}`;
    await img.decode();
    const cv = document.createElement("canvas");
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const read = (x, y) => { const i = (y * cv.width + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    const out = {};
    for (const [name, p] of Object.entries(pts)) out[name] = read(p.x, p.y);
    return out;
  }, shot.toString("base64"), {
    black: { x: RIG_X + samples.black.x, y: RIG_Y + samples.black.y },
    white: { x: RIG_X + samples.white.x, y: RIG_Y + samples.white.y },
    mid: { x: RIG_X + samples.mid.x, y: RIG_Y + samples.mid.y },
  });
}
const near = (got, want, tol) => got.every((v, i) => Math.abs(v - want[i]) <= tol);

for (const el of ELEMENTS) {
  const got = await renderRig(`shard-tint-${el}`);
  const top = glowTop(PALETTE[el]);
  console.log(`  ${el}: black sample renders ${JSON.stringify(got.black)}; white sample renders ${JSON.stringify(got.white)} (glow top ${JSON.stringify(top.map(v => Math.round(v)))})`);
  ok(`§P under ${el}'s tint the black matter stays black — every channel ≤ 20`, got.black.every(v => v <= 20), `got=${JSON.stringify(got.black)}`);
  ok(`§P under ${el}'s tint the white glow stands at the glow's top — the colour walked 30% toward white, ±16`, near(got.white, top, 16), `got=${JSON.stringify(got.white)} want≈${JSON.stringify(top.map(v => Math.round(v)))}`);
  if (el === "fire" || el === "sky") {
    await page.screenshot({ path: join(OUT, `tinted-${el}.png`), clip: { x: 0, y: 0, width: 560, height: 330 } });
  }
}
const plain = await renderRig(null);
console.log(`  neutral: black=${JSON.stringify(plain.black)} white=${JSON.stringify(plain.white)} mid=${JSON.stringify(plain.mid)} (source mid ${JSON.stringify(samples.mid.rgb)})`);
ok("§P the neutral shot renders the art's own colours — black, white and midtone samples all within ±8 of the source",
  near(plain.black, samples.black.rgb, 8) && near(plain.white, samples.white.rgb, 8) && near(plain.mid, samples.mid.rgb, 8),
  `got black=${JSON.stringify(plain.black)} white=${JSON.stringify(plain.white)} mid=${JSON.stringify(plain.mid)}`);
await page.evaluate(() => document.querySelector("#tint-rig")?.remove());

/* ══ §H — THE HALO ON REAL FLIGHTS. The seeded war flies;
   the recorder reads every seated shard frame's group. ══ */
const sightings = new Map();
let haloShotEl = null;
const hDeadline = Date.now() + 150000;
while (Date.now() < hDeadline) {
  const seen = await page.evaluate(() => {
    const out = [];
    for (const svg of document.querySelectorAll("svg[data-shard-frame]")) {
      const img = svg.querySelector("image");
      const g = svg.parentElement;
      const halo = g?.querySelector("[data-shard-halo]");
      const r = svg.getBoundingClientRect();
      out.push({
        filter: img?.getAttribute("filter") ?? null,
        w: parseFloat(svg.getAttribute("width") ?? "0"),
        h: parseFloat(svg.getAttribute("height") ?? "0"),
        halo: halo ? {
          fill: halo.getAttribute("fill"),
          fillOpacity: parseFloat(halo.getAttribute("fill-opacity") ?? "0"),
          rx: parseFloat(halo.getAttribute("rx") ?? "0"),
          ry: parseFloat(halo.getAttribute("ry") ?? "0"),
          filter: halo.getAttribute("filter"),
        } : null,
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      });
    }
    return out;
  }).catch(() => []);
  for (const s of seen) {
    const el = s.filter?.match(/shard-tint-(\w+)/)?.[1] ?? null;
    const key = JSON.stringify([el, !!s.halo, Math.round(s.w)]);
    if (!sightings.has(key)) sightings.set(key, { ...s, el });
    if (el && s.halo && !haloShotEl && s.w >= 120 && s.rect.w > 0) {
      const clip = {
        x: Math.max(0, Math.floor(s.rect.x - 110)), y: Math.max(0, Math.floor(s.rect.y - 110)),
        width: Math.min(1400, Math.ceil(s.rect.w + 220)), height: Math.min(950, Math.ceil(s.rect.h + 220)),
      };
      await page.screenshot({ path: join(OUT, `flight-halo-${el}.png`), clip }).catch(() => {});
      haloShotEl = el;
    }
  }
  const tinted = [...sightings.values()].filter(s => s.el && s.halo).length;
  if (tinted >= 3 && haloShotEl) break;
  await sleep(25);
}
const all = [...sightings.values()];
const tintedWithHalo = all.filter(s => s.el && s.halo);
const untinted = all.filter(s => !s.el);
console.log(`  flight sightings: ${all.length} distinct (${tintedWithHalo.length} tinted with halo, ${untinted.length} untinted, halo screenshot: ${haloShotEl ?? "none"})`);
for (const s of all) console.log(`    sighting: element=${s.el ?? "none"} w=${s.w.toFixed(0)} halo=${s.halo ? `fill=${s.halo.fill} op=${s.halo.fillOpacity} rx/w=${(s.halo.rx / s.w).toFixed(2)} ry/h=${(s.halo.ry / s.h).toFixed(2)}` : "absent"}`);
ok("§H the war stood — real shard flights crossed the page", all.length >= 1, `sightings=${all.length}`);
ok("§H a tinted flight's group carries the glow halo", tintedWithHalo.length >= 1, `tintedWithHalo=${tintedWithHalo.length}`);
ok("§H the halo keeps the tint's condition exactly — present on every tinted flight sighted, absent on every untinted one",
  all.every(s => (!!s.halo) === (!!s.el)), `sightings=${all.length} untinted=${untinted.length}`);
const haloLaw = tintedWithHalo.every(s =>
  (s.halo.fill ?? "").toLowerCase() === PALETTE[s.el] &&
  Math.abs(s.halo.fillOpacity - 0.55) <= 0.03 &&
  s.halo.rx / s.w >= 0.59 && s.halo.rx / s.w <= 0.65 &&
  s.halo.ry / s.h >= 0.75 && s.halo.ry / s.h <= 0.81 &&
  s.halo.filter === "url(#shard-tail-soft)");
ok("§H the halo is the flight's own element colour at 0.55, soft-blurred like the wake, at its own measure (rx ≈ 0.62 × frame width, ry ≈ 0.78 × frame height)",
  tintedWithHalo.length >= 1 && haloLaw);

clearInterval(stillIv);
await browser.close();
console.log(`drive-tint-the-white: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
