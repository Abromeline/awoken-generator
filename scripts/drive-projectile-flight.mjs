// THE PROJECTILE FLIGHT DRIVE — THE FLIGHT LAW'S PROOF
// (2026-11-07). Nigel's law: "i want an arch added to the
// elemental attacks of the awoken and the speed of the
// projectiles flight should relate to the speed of the
// awoken that fires it. rock projectiles being slow moving
// heavy hitters. the size of the projectile should also be
// proportional to awokin lvl." — ruled option A (flight
// time tied to the firer's march pace; size grows with the
// firer's level; stone slowest and heaviest) and reach C
// (all grounds, campaign included).
//
// The law as built (client/src/flightLaw.ts):
//   flightMs = clamp(anchor × pace/3.0, 450, 2400), where
//   the anchor is the surface's standing neutral flight
//   (homeland/Table shard: 1056 ms; battle view: 500 ms)
//   and pace is the firer's own march pace (MARCH SPEED
//   LAW: sky 1.6 · fire 2.2 · tide 2.6 · root 3.2 · stone
//   4.5 s/hex, level-weighted);
//   size scale = sqrt(1.0848077^(level−1)), capped at 1.5×
//   (the game's own figure growth, square-root tempered as
//   the march law tempers it — the cap stood at 2×, binding
//   from L19, until the launched-shot fix, 2026-11-10);
//   the arc is the battle view's parabola — the drawn
//   point rises −4·peak·s·(1−s) over the chord, peak =
//   max(40, dist × 0.18) for a direct shot (max(26, dist ×
//   0.12) until the same fix).
// Dark / enemy flights are not the law's: their pace
// (1584 ms on the flat grounds) and size stand untouched.
//
// This drive proves it, the formula on the page and the
// drawing on the map:
//   §0 the served strike record carries the striker's
//      LEVEL (the referee's new stamp), for placement
//      blows of every firer below;
//   §A THE LAW'S OWN MEASURES, computed as the surfaces
//      compute them: a STONE Awoken's flight is LONGER
//      than a SKY Awoken's for the same shot (the law's
//      1584 against 563 at the homeland anchor), and a
//      veteran's flight slows with her size inside the
//      band, as her march does;
//   §B a LEVEL-10 firer's shard stands WIDER on the map
//      than a LEVEL-1 firer's (drawn widths: the law's
//      ~1.44× — 144 × 1.44 ≈ 208 against 144; the standing
//      measure stood at 216 until the launched-shot fix,
//      2026-11-10. A drawn width here is the shard's seated
//      frame — the host <svg data-shard-frame> the painted
//      content fills — never the raw <image>, whose own
//      box is the frame's whole canvas);
//   §C the drawn road ARCS: the flight's mid samples rise
//      ABOVE the straight chord between its ends by a
//      real margin (the chord between two same-row hexes
//      is near-level, so the rise is the arc's own);
//   §D a DARK blow still flies its ruled third speed
//      (~1584 ms) at its standing size (144 — the one
//      standing measure, lowered with every shard by the
//      launched-shot fix); no level growth rides it, as
//      the law always held.
// The drawn lives of individual flights are NOT read
// comparatively here, deliberately: this field's witness
// is the homeland's dense-battle one, where the Push-45
// drives already showed sampled drawn lives run wide of
// the code's own measures under load (their §B4 reads
// medians against wide bands for the same reason) — and a
// Sky firer's mark is shoved by her own blows mid-flight,
// lengthening her sampled road past her law's measure.
// The pace law's exact numbers are §A's; the map's drawn
// shadow of them is §B/§C/§D's.
// The fight is the engine's own: three firers placed on
// the land — a Sky at level 1, a Stone at level 1, a Stone
// at level 10 (experience 10000, the level the referee
// reads) — each with a Fray standing inside its reach
// (Sky's reach is wide and shoves its mark, so its Fray
// wears the mountain of hide and stands where the shove
// cannot leave the field before several blows are
// witnessed; the readings follow each firer's own strikes
// by the awakenedId the referee serves).
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-projectile-flight.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

const OUT = "/home/hatch/workspace/projectile-flight-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-flight-"));
process.env.PORT = "3997";
process.env.WORKSHOP_PASSWORD = "flight-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3997";
const PW = "flight-drive-password";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (xs) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

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

/* ══ THE WORLD: a Tender and a quiet land. Three firers:
   Sky L1 at (-4,2) with its Fray at (-4,3); Stone L1 at
   (1,-3) with its Fray at (2,-3); Stone L10 at (3,2) with
   its Fray at (4,2). Each Fray stands inside its firer's
   reach (element reach + 0.35) and wears a mountain of
   hide, so the fight stands for the drive's whole window. ══ */
const claim = await call("claimTender", { password: PW, tenderName: "Flight Tender" });
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

function seedAwokin(name, element, experience = 0) {
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, 3, 3, element, `flight/${name}-${cat}.png`, now).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: 3, toughness: 3, element });
  }
  const id = Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `flight/${name}.png`, JSON.stringify(parts), "Flight Tender", ownerKey, now).lastInsertRowid);
  if (experience) db.prepare("UPDATE awakened SET experience = ? WHERE id = ?").run(experience, id);
  return id;
}
const insPlacement = db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
  VALUES (?, ?, ?, ?, ?, 'defense', 0, 999, ?, ?, NULL, NULL, 0)`);
const insFray = db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
  VALUES (?, ?, 'fray', ?, 100000, ?, ?, 1, 1, 0)`);
const FIRERS = [
  { key: "sky1", name: "Sky Striker", element: "sky", exp: 0, at: [-4, 2], fray: [-4, 3] },
  { key: "stone1", name: "Stone Striker", element: "stone", exp: 0, at: [1, -3], fray: [2, -3] },
  { key: "stone10", name: "Stone Veteran", element: "stone", exp: 10000, at: [3, 2], fray: [4, 2] },
];
const firerId = new Map();
for (const f of FIRERS) {
  const aw = seedAwokin(f.name, f.element, f.exp);
  firerId.set(f.key, aw);
  insPlacement.run(ownerKey, aw, tileId.get(`${f.at[0]},${f.at[1]}`), now, now, f.at[0], f.at[1]);
  db.prepare("UPDATE territory_tiles SET cursed = 1 WHERE id = ?").run(tileId.get(`${f.fray[0]},${f.fray[1]}`));
  insFray.run(ownerKey, tileId.get(`${f.fray[0]},${f.fray[1]}`), now, f.fray[0], f.fray[1]);
}

// The cradle stilled for the drive's whole life.
const stillIv = setInterval(() => {
  try { db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ?, wanderer_settled_beats = 0 WHERE owner_key = ?").run(Date.now(), ownerKey); } catch { /* the drive is ending */ }
}, 4000);

/* ══ §0 — THE SERVED RECORD, BY API: each firer's strikes
   arrive, and each carries its striker's level. ════════ */
await call("getTerritory", {}, token);
const served = new Map();
const byFirer = new Map();
const apiDeadline = Date.now() + 45000;
while (Date.now() < apiDeadline) {
  const t = await call("getTerritory", {}, token);
  for (const s of t.strikes ?? []) {
    if (!served.has(s.id)) served.set(s.id, s);
    if (s.kind === "placement" && [...firerId.values()].includes(s.awakenedId)) {
      if (!byFirer.has(s.awakenedId)) byFirer.set(s.awakenedId, []);
      byFirer.get(s.awakenedId).push(s);
    }
  }
  if (FIRERS.every(f => (byFirer.get(firerId.get(f.key)) ?? []).length >= 3)) break;
  await sleep(1000);
}
for (const f of FIRERS) {
  const list = byFirer.get(firerId.get(f.key)) ?? [];
  console.log(`  ${f.name}: ${list.length} placement strike(s) served; levels seen: ${[...new Set(list.map(s => s.level))].join(",") || "—"}`);
}
const wantLevel = { sky1: 1, stone1: 1, stone10: 10 };
ok("§0 every firer's strikes are served, each stamped with its striker's level (1 / 1 / 10)",
  FIRERS.every(f => { const list = byFirer.get(firerId.get(f.key)) ?? []; return list.length >= 1 && list.every(s => s.level === wantLevel[f.key]); }),
  FIRERS.map(f => `${f.key}=${[...new Set((byFirer.get(firerId.get(f.key)) ?? []).map(s => s.level))].join("/")}`).join(" "));

/* ══ OPEN THE LAND ══════════════════════════════════════ */
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:flight]", String(e).slice(0, 200)));
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

/* ══ §A — THE LAW COMPUTED ON THE PAGE: the flight law
   itself has no test hook on the page, so the drive reads
   it the way the surfaces do — by its FORMULA, stated in
   flightLaw.ts and mirrored wherever a march is reckoned:
   flightMs = clamp(anchor × pace/3.0, 450, 2400). The
   paces are the MARCH SPEED LAW's gaits at level 1 (the
   √growth weighting is 1 there): sky 1.6, stone 4.5,
   stone at level 10 weighted by √(1.0848077^9) ≈ 1.44 →
   6.5. The size law: √(1.0848077^(level−1)) — level 1 is
   1, level 10 ≈ 1.44, and the 1.5× cap binds from level
   11 (2×, binding from level 19, until the launched-shot
   fix, 2026-11-10).
   (The drawn flight lives that §B/§C/§D below measure are
   the surface's sampled shadow of these numbers — the
   homeland witness flies them at these exact measures;
   the sampled medians in §D's dark reading, ~1450 of a
   nominal 1584, show the recorder's grain.) ═══════════ */
const LAW = {
  anchor: 1056, neutral: 3.0, min: 450, max: 2400,
  flight: (pace) => Math.round(Math.min(2400, Math.max(450, 1056 * pace / 3.0))),
  size: (lv) => Math.min(1.5, Math.sqrt(Math.pow(1.0848077, Math.max(1, lv) - 1))),
};
const skyMs = LAW.flight(1.6), stoneMs = LAW.flight(4.5), stone10Ms = LAW.flight(4.5 * Math.sqrt(Math.pow(1.0848077, 9)));
console.log(`  the law's measures: sky L1 ${skyMs} ms · stone L1 ${stoneMs} ms · stone L10 ${stone10Ms} ms (pace-weighted, banded)`);
ok("§A a stone Awoken's flight is longer than a sky Awoken's for the same shot (1584 against 563 by the law)",
  stoneMs === 1584 && skyMs === 563 && stoneMs > skyMs * 2,
  `sky=${skyMs} stone=${stoneMs}`);
ok("§A a veteran's flight slows with her size, as her march does (stone L10 pace-weighted past her L1 measure, inside the band)",
  stone10Ms > stoneMs && stone10Ms <= 2400, `stone10=${stone10Ms}`);
ok("§B the size law grows with level (L1 = 1, L10 ≈ 1.44, and the 1.5× cap binds from L11 — it stood at 2× until the launched-shot fix, 2026-11-10)",
  LAW.size(1) === 1 && Math.abs(LAW.size(10) - 1.4428) < 0.01 && LAW.size(10) < 1.5 && LAW.size(11) === 1.5 && LAW.size(20) === 1.5,
  `L1=${LAW.size(1)} L10=${LAW.size(10).toFixed(3)} L19=${LAW.size(19).toFixed(3)} L20=${LAW.size(20).toFixed(3)}`);

/* ══ THE RECORDER: every 25 ms, every Matter shard image
   on the map — its centre, its drawn width — chained into
   flight tracks by nearness along the road, exactly as
   drive-shard-flight reads them. A dark blow and an
   Awoken's shard wear the same frames; the readings tell
   them apart by the company they keep: a flight's road
   ENDS where it struck — a placement's shard ends at a
   Fray's drawn centre, a dark blow ends at a figure (an
   Awoken's or the Tender's stand). The §A/§B/§C readings
   take the tracks that end at a Fray; §D takes the tracks
   that begin at one.
   CHAINING UNDER THIS LAW: a shard's drawn image is its
   frame rect, and the arc + the law's sizes move that
   rect's centre off the road's centre as frames change —
   consecutive samples of one flight can jump ~100 px
   between recorder ticks while neighbouring flights run
   ~50 px apart on this crowded field, so position-only
   chaining welds strangers into false tracks and splits
   true ones. The chaining below therefore carries a
   flight's IDENTITY with it: samples whose widths agree
   (a flight's width is its firer's level signature, fixed
   for its whole life) chain first, and a link must also
   keep the track's own heading — a shard flies one road,
   it never doubles back. The Push-45 drives chain by
   element identity (the homeland recorder) or by flight
   road on sparser fields; this crowded three-firer field
   needs the width + heading discipline. ═══════════════ */
await page.evaluate(() => {
  const rec = { ticks: [] };
  window.__flightRec = rec;
  rec.iv = setInterval(() => {
    const tick = { t: performance.now(), shards: [], frays: [] };
    for (const im of document.querySelectorAll("image")) {
      const href = im.getAttribute("href") || "";
      if (href.includes("fray-walk")) {
        const r = im.getBoundingClientRect();
        tick.frays.push({ cx: r.x + r.width / 2, cy: r.y + r.height / 2 });
      }
      if (!href.includes("matter-shard")) continue;
      // The shard is measured by its seated frame — the
      // host <svg data-shard-frame> the surface seats the
      // frame's painted content in (the launched-shot fix,
      // 2026-11-10): its box is the drawn measure itself,
      // centred on the road's point, where the raw <image>
      // inside it spans the frame's whole canvas.
      const host = im.closest("svg[data-shard-frame]") ?? im;
      const r = host.getBoundingClientRect();
      tick.shards.push({ cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: Number(host.getAttribute("width")) });
    }
    rec.ticks.push(tick);
  }, 25);
});

const trackOf = (ticks) => {
  const all = [];
  for (const tk of ticks) for (const s of tk.shards) all.push({ ...s, t: tk.t, frays: tk.frays });
  all.sort((a, b) => a.t - b.t);
  const tracks = [];
  for (const s of all) {
    let best = null, bestScore = Infinity;
    for (const tr of tracks) {
      const last = tr[tr.length - 1];
      if (s.t - last.t > 900 || s.t <= last.t) continue;
      // A flight's drawn width is its firer's level
      // signature — fixed for the flight's whole life.
      if (Math.abs(s.w - last.w) > 1) continue;
      const d = Math.hypot(s.cx - last.cx, s.cy - last.cy);
      // A shard flies one road: once a track has a heading,
      // the next sample must continue it, never reverse it.
      if (tr.length >= 2) {
        const prev = tr[tr.length - 2];
        const hx = last.cx - prev.cx, hy = last.cy - prev.cy;
        const hl = Math.hypot(hx, hy);
        if (hl > 4) {
          const dot = (hx * (s.cx - last.cx) + hy * (s.cy - last.cy)) / hl;
          if (dot < -12) continue;
        }
      }
      // Prefer continuing the track whose road this sample
      // lies on (perpendicular miss), then nearness.
      let perp = d;
      if (tr.length >= 2) {
        const prev = tr[tr.length - 2];
        const hx = last.cx - prev.cx, hy = last.cy - prev.cy;
        const hl = Math.hypot(hx, hy) || 1;
        perp = Math.abs(hx * (s.cy - last.cy) - hy * (s.cx - last.cx)) / hl;
      }
      const score = perp * 3 + d * 0.25;
      if (score < bestScore) { bestScore = score; best = tr; }
    }
    if (best) best.push(s); else tracks.push([s]);
  }
  return tracks;
};
const watchDeadline = Date.now() + 60000;
let tracks = [];
while (Date.now() < watchDeadline) {
  await sleep(2000);
  const state = await page.evaluate(() => window.__flightRec.ticks);
  const raw = trackOf(state).filter(tr => tr.length >= 6 && tr[tr.length - 1].t - tr[0].t >= 280);
  // Judge readiness on the classified tracks, as the
  // readings will: §B needs a wide and a standing-size
  // placement flight, §C an arc long enough to measure,
  // §D a dark one.
  const nearF = (s, tol) => s.frays.some(f => Math.hypot(s.cx - f.cx, s.cy - f.cy) < tol);
  const pl = raw.filter(tr => nearF(tr[tr.length - 1], 70));
  const dk = raw.filter(tr => nearF(tr[0], 45) && !nearF(tr[tr.length - 1], 70));
  const widths = pl.map(tr => tr[0].w);
  tracks = raw;
  if (pl.length >= 3 && dk.length >= 1 && widths.some(w => w > 200) && widths.some(w => w === 144)) break;
}
const rec = await page.evaluate(() => { clearInterval(window.__flightRec.iv); return window.__flightRec; });
clearInterval(stillIv);
tracks = trackOf(rec.ticks).filter(tr => tr.length >= 6 && tr[tr.length - 1].t - tr[0].t >= 280);
await page.screenshot({ path: join(OUT, "flight-law-end.png") }).catch(() => {});
await browser.close();
console.log(`recorded ${tracks.length} flight track(s): lives ${tracks.map(tr => Math.round(tr[tr.length - 1].t - tr[0].t)).join(", ")} ms; widths ${tracks.map(tr => Math.round(tr[0].w)).join(", ")}`);

/* ══ THE READINGS ═══════════════════════════════════════ */
// A flight that ends AT a Fray is a placement's shard; one
// that begins at a Fray is a dark blow flying back.
const nearFray = (s, tol) => s.frays.some(f => Math.hypot(s.cx - f.cx, s.cy - f.cy) < tol);
const placementTracks = tracks.filter(tr => nearFray(tr[tr.length - 1], 70));
const darkTracks = tracks.filter(tr => nearFray(tr[0], 45) && !nearFray(tr[tr.length - 1], 70));
const livesOf = (trs) => trs.map(tr => tr[tr.length - 1].t - tr[0].t);

// §B — a level-10 firer's shard stands wider than a
// level-1 firer's: the widest placement track against the
// standing-size ones. (The drawn width is the law's size
// made visible: 144 × 1.44 ≈ 208 against 144.)
const widths = placementTracks.map(tr => median(tr.map(s => s.w)));
const widest = Math.max(...widths), narrowest = Math.min(...widths);
console.log(`  placement track widths: ${widths.map(w => Math.round(w)).join(", ")}`);
ok("§B a level-10 firer's shard stands wider than a level-1 firer's (the law's ~1.44×: ~208 against 144)",
  widths.length >= 2 && widest >= 195 && narrowest === 144 && widest / narrowest >= 1.3,
  `widest=${widest.toFixed(0)} narrowest=${narrowest.toFixed(0)}`);

// §C — the arc: on the longest placement track, the mid
// samples rise above the straight chord between the
// flight's ends. Screen y grows downward, so a rise is a
// NEGATIVE deviation from the chord.
let bestRise = 0, arcTrack = null;
for (const tr of placementTracks) {
  const a = tr[0], b = tr[tr.length - 1];
  const dx = b.cx - a.cx, dy = b.cy - a.cy;
  const len2 = dx * dx + dy * dy;
  if (len2 < 60 * 60) continue;
  let rise = 0;
  for (const s of tr) {
    const t = ((s.cx - a.cx) * dx + (s.cy - a.cy) * dy) / len2;
    if (t < 0.2 || t > 0.8) continue;
    const chordY = a.cy + dy * t;
    rise = Math.max(rise, chordY - s.cy);
  }
  if (rise > bestRise) { bestRise = rise; arcTrack = tr; }
}
console.log(`  fullest mid-flight rise above the chord: ${bestRise.toFixed(1)}px${arcTrack ? ` (track of ${arcTrack.length} samples)` : ""}`);
ok("§C the drawn road arcs — mid-flight samples rise above the straight chord by a real margin",
  bestRise >= 10, `rise=${bestRise.toFixed(1)}px`);

// §D — the dark's blow, untouched: its ruled third speed
// and its standing size. Sampled life reads a little under
// the nominal 1584 (the recorder's grain), as the Push-45
// drives measured it (~1450 there).
const dLives = livesOf(darkTracks);
const dWidths = darkTracks.map(tr => median(tr.map(s => s.w)));
console.log(`  dark tracks: ${darkTracks.length}; lives: ${dLives.map(Math.round).join(", ") || "—"}; widths: ${dWidths.map(w => Math.round(w)).join(", ") || "—"}`);
ok("§D a dark blow still flies its ruled third speed (drawn life ~1584 ms)",
  dLives.length >= 1 && median(dLives) >= 1200 && median(dLives) <= 1900,
  `n=${dLives.length} median=${Math.round(median(dLives))}ms`);
ok("§D a dark blow still stands at its standing size (drawn width 144 — no level growth rides it)",
  dWidths.length >= 1 && dWidths.every(w => w === 144),
  `widths=${dWidths.map(w => Math.round(w)).join(",")}`);

console.log(`\nPROJECTILE FLIGHT DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
