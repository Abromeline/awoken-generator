// THE LAUNCHED-SHOT PROOF (2026-11-10) — the frame-sampled
// witness for Nigel's ruling: a launched shot leaves the
// firer's hand at full presence, arcs with its path (a
// direct shot's peak now stands at max(40, dist × 0.18),
// where a one-hex shot once peaked at the 26-unit floor
// and read as a slide), and falls on the mark's CURRENT
// stand (the endpoint is re-read at the flight's staggered
// start, not frozen at the batch read). The matter-shard
// frames' open-close cycle no longer breathes the shot —
// the end frames carry 437 px of paint, the middle frames
// 274–282 px, and the surfaces seat every frame through
// its painted content box, so a frame's painted width is
// the drawn measure itself, whatever slice is showing.
//
// AMENDED THE SAME DAY — THE GROWTH TO THE ZENITH (Nigel,
// 2026-11-10, correcting the morning's reading): "i'm ok
// with the shot starting small and growing to its full
// size at the zenith — i just wanted to add that it should
// point in the direction of flight while doing so — and
// the reduction in size is good." The morning's §W (one
// constant width the whole flight) is STRUCK and restated
// as §G: the drawn width now follows flightLaw's
// shotGrowthScale — half the full measure at the hand,
// rising smoothly and monotonically (a smoothstep on the
// climb) to the full measure exactly at the zenith (the
// road's midpoint, where the arc's rise above its chord
// peaks), never past it, and mirrored on the descent; the
// frames still cannot breathe, because the growth is a
// continuous function of the road laid over the seated
// content. And §H is new: the shard's nose — read from the
// host group's rotate() in the DOM — must hold the road's
// own direction of travel at every sample while it grows.
//
// The world is a single Stone firer (level 1) beside a Fray
// wearing a mountain of hide: a stone shot flies 1584 ms
// (the flight law at her pace), long enough to sample and
// to photograph at its birth, its zenith and its fall.
// The recorder reads every shard's seated frame — the host
// <svg data-shard-frame> — its box, its slice (from the
// frame the <image> inside wears), its viewBox, the host
// group's rotation and the image's opacity, every 15 ms.
// A sample's PAINTED width is reckoned from the DOM itself:
// the box's width × (the frame's painted width ÷ the
// viewBox's width), with the painted widths measured from
// the bundled PNGs:
//   frames 1/6: 437 · frames 2/5: 282 · frames 3/4: 274
// (of a 512-wide canvas; the viewBox is the content box
// widened to the drawn aspect, so at FULL size the first
// frame's painted width reads ~137 of the 144 measure and
// the rest exact — the per-slice factor a sample's growth
// is reckoned against, so the growth readings below are
// slice-blind by construction).
// Screenshots are clipped around the flying shard at the
// three moments, plus one full-map frame at the zenith.
//
// THE TAIL'S TINT (Nigel, 2026-11-10, the amendment's third
// piece): "i also meant for those tails to be tinted with
// the elemental color of each Awokin." A second firer —
// Sky, beside the same Fray — flies in this world too, and
// §T reads the zenith photographs pixel by pixel: in the
// tail region (behind the shard's centre, along the axis
// opposite its heading) the palette colour of the firer's
// element must be present far more than in the head
// region. The colours judged are palette.ts's standing
// element colours — stone #9c7c4c, sky #8d9fd6 — the same
// colours the surfaces' tint ramps and tail wakes are
// built from.
//
// THE RECKONING (amended after the first zenith run's
// probe dumped raw tracks): a sample's SCREEN centre is
// its rotated frame's axis-aligned bounding-box centre,
// and that centre rides the road only while the frame's
// painted box stands near the drawn aspect — the end
// frames' seated box is 458 × 242 units, the middle
// frames' a 282 × 149 sliver, so on the long frames the
// box's centre is dragged along the shard's long axis and
// screen positions wander off the road by tens of pixels
// (the first run's §H read that wander as a broken nose,
// and its §G read tracks' truncated measured lives as
// broken growth). The flight's USER position — the
// translate in its own group's transform — is the road's
// point itself and never wanders. So below, the road is
// reckoned in USER space: a sample's road is its progress
// along its own flight's chord (first sighting → furthest
// sighting, user units), the nose is judged against the
// direction of travel between neighbouring DISTINCT
// renders in user space, and growth's smoothness is
// judged by the curve's fit (the recorder is starved by
// the map's own render weight — a flight is sighted ~9
// times, ~7 of them distinct renders — so adjacent-sample
// step bounds would judge the recorder, not the shot).
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-launched-shot-proof.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, readFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

const OUT = "/home/hatch/workspace/zenith-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-launched-"));
process.env.PORT = "3995";
process.env.WORKSHOP_PASSWORD = "launched-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3995";
const PW = "launched-drive-password";
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

const claim = await call("claimTender", { password: PW, tenderName: "Launched Tender" });
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
      .run(`${name} ${cat}`, cat, 3, 3, element, `launched/${name}-${cat}.png`, now).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: 3, toughness: 3, element });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `launched/${name}.png`, JSON.stringify(parts), "Launched Tender", ownerKey, now).lastInsertRowid);
}
const stone = seedAwokin("Stone Striker", "stone");
db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
  VALUES (?, ?, ?, ?, ?, 'defense', 0, 999, 1, -3, NULL, NULL, 0)`).run(ownerKey, stone, tileId.get("1,-3"), now, now);
/* THE SECOND FIRER (the tail's tint, 2026-11-10): a Sky
   striker on the Fray's other side — her shots fly the
   sky pace (~563 ms against the stone's 1584) and wear
   sky's colour on their tails, where the stone's wear
   stone's; §T reads both from the photographs. */
const sky = seedAwokin("Sky Striker", "sky");
db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
  VALUES (?, ?, ?, ?, ?, 'defense', 0, 999, 3, -3, NULL, NULL, 0)`).run(ownerKey, sky, tileId.get("3,-3"), now, now);
db.prepare("UPDATE territory_tiles SET cursed = 1 WHERE id = ?").run(tileId.get("2,-3"));
db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
  VALUES (?, ?, 'fray', ?, 100000, 2, -3, 1, 1, 0)`).run(ownerKey, tileId.get("2,-3"), now);

const stillIv = setInterval(() => {
  try { db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ?, wanderer_settled_beats = 0 WHERE owner_key = ?").run(Date.now(), ownerKey); } catch { /* ending */ }
}, 4000);

/* Wait until the referee serves the stone firer's strikes. */
await call("getTerritory", {}, token);
const apiDeadline = Date.now() + 45000;
let servedStrikes = 0;
while (Date.now() < apiDeadline) {
  const t = await call("getTerritory", {}, token);
  servedStrikes = (t.strikes ?? []).filter(s => s.kind === "placement" && s.awakenedId === stone).length;
  if (servedStrikes >= 3) break;
  await sleep(1000);
}
console.log(`  the referee served ${servedStrikes} stone strike(s) before the page opened`);
ok("§0 the stone firer's strikes are served (the fight stands)", servedStrikes >= 1, `served=${servedStrikes}`);

/* ══ OPEN THE LAND ══ */
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:launched]", String(e).slice(0, 200)));
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

/* THE WAR MUST STAND ON THE PAGE (hardened 2026-11-10):
   under a loaded box the intro's Skip and the report
   overlays can outlast the fixed sleeps above, and the
   page's own render can starve — the watch then reads an
   empty stage for its whole window and reports a famine
   that is only a late door. So the opening now waits for
   the war itself: it keeps dismissing what stands in the
   way and watches for the first shard image in the DOM
   (a flight airborne — with two firers striking and the
   dark answering, some shot is airborne most seconds
   once the war settles), up to 75 s, and photographs the
   opened page either way, so a famine run shows the
   stage it actually watched. */
for (let i = 0; i < 50; i++) {
  const seen = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Skip");
    if (b) b.click();
    if (document.querySelector(".return-report-overlay")) return "report";
    return [...document.querySelectorAll("image")].some((im) => (im.getAttribute("href") || "").includes("matter-shard")) ? "war" : "waiting";
  }).catch(() => "waiting");
  if (seen === "war") { console.log("  the war stands on the page — the watch begins"); break; }
  if (seen === "report") await page.mouse.click(24, 24);
  if (i === 49) console.log("  the war never showed a flight in the opening window — the watch proceeds and reports what it sees");
  await sleep(1500);
}
await page.screenshot({ path: join(OUT, "page-open.png") }).catch(() => {});

/* ══ THE RECORDER: every 15 ms, every seated shard frame —
   its identity, centre, box width, slice, viewBox, the
   host group's rotation (the nose's road, for §H), and the
   frame's opacity — with the Fray's centre beside it. ══ */
await page.evaluate(() => {
  const rec = { ticks: [], nextId: 1 };
  window.__launchRec = rec;
  rec.iv = setInterval(() => {
    const tick = { t: performance.now(), shards: [], frays: [] };
    for (const im of document.querySelectorAll("image")) {
      const href = im.getAttribute("href") || "";
      if (href.includes("fray-walk")) {
        const r = im.getBoundingClientRect();
        tick.frays.push({ cx: r.x + r.width / 2, cy: r.y + r.height / 2 });
      }
      if (!href.includes("matter-shard")) continue;
      const host = im.closest("svg[data-shard-frame]");
      if (!host) { tick.shards.push({ orphan: true }); continue; }
      if (!host.dataset.launchId) host.dataset.launchId = String(rec.nextId++);
      const r = host.getBoundingClientRect();
      const gTransform = host.parentElement?.getAttribute("transform") || "";
      const rotM = /rotate\((-?[\d.]+)\)/.exec(gTransform);
      const trM = /translate\((-?[\d.]+)[ ,]+(-?[\d.]+)\)/.exec(gTransform);
      tick.shards.push({
        id: Number(host.dataset.launchId),
        cx: r.x + r.width / 2, cy: r.y + r.height / 2,
        /* ux/uy: the flight's USER position — the translate
           in its own group's transform, the road's point
           itself. The rect centre above is the rotated
           frame's bounding-box centre, which the long
           frames drag along the shard's axis (see the
           header's reckoning note): it serves the photo
           clips and §C/§E's coarse truths only. */
        ux: trM ? Number(trM[1]) : null,
        uy: trM ? Number(trM[2]) : null,
        boxW: Number(host.getAttribute("width")),
        viewBox: host.getAttribute("viewBox") || "",
        slice: Number((href.match(/matter-shard-(\d)/) || [])[1] ?? 0),
        opacity: Number(im.getAttribute("opacity") ?? 1),
        rot: rotM ? Number(rotM[1]) : null,
      });
    }
    rec.ticks.push(tick);
  }, 15);
});

/* Painted widths by slice, measured from the bundled PNGs. */
const PAINTED_W = { 1: 437, 2: 282, 3: 274, 4: 274, 5: 282, 6: 437 };
const paintedOf = (s) => {
  const vb = s.viewBox.split(/\s+/).map(Number);
  const regionW = vb.length === 4 ? vb[2] : 512;
  return s.boxW * (PAINTED_W[s.slice] ?? 437) / regionW;
};

/* Watch the road: chain samples into tracks by identity,
   and photograph the flights at their moments. A
   placement flight ENDS at the Fray; a dark flight begins
   there. Photographs are triggered by the GROWTH itself —
   the drawn width against the measure — never by a
   reckoned fraction: a zenith is a shard standing at its
   full width, a birth a young shard still near half, a
   fall a shard small again and far along its chord. */
const med = (v) => { const s = [...v].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 999; };
const growthOf = (s) => {
  const vb = s.viewBox.split(/\s+/).map(Number);
  const regionW = vb.length === 4 ? vb[2] : 512;
  return paintedOf(s) / (144 * (PAINTED_W[s.slice] ?? 437) / regionW);
};
/* flightLaw's shotGrowthScale, mirrored for the fit
   judgement: half at the hand, full at the zenith,
   mirrored down, smoothstep on the climb. */
const lawG = (sh) => {
  const c = Math.min(1, Math.max(0, sh <= 0.5 ? sh * 2 : (1 - sh) * 2));
  return 0.5 + 0.5 * (c * c * (3 - 2 * c));
};
const shotsTaken = { birth: false, mid: false, midFull: false, fall: false };
const gatherTracks = (ticks) => {
  const byId = new Map();
  for (const tk of ticks) for (const s of tk.shards) {
    if (s.orphan) continue;
    if (!byId.has(s.id)) byId.set(s.id, []);
    byId.get(s.id).push({ ...s, t: tk.t, frays: tk.frays });
  }
  return [...byId.values()].filter(tr => tr.length >= 3);
};
const nearFray = (s, tol) => (s.frays ?? []).some(f => Math.hypot(s.cx - f.cx, s.cy - f.cy) < tol);

/* CLUSTERS: flights are clustered by their user-space
   origin — each firer's hand is one exact point, and a
   dark flight's origin is the Fray itself. A cluster is
   STONE when its completed placement flights (ending at
   the Fray) live ~1584 ms, SKY when ~563 ms; the dark's
   cluster never qualifies, because its flights end at a
   firer, not at the Fray. */
const clusterOrigin = [];
const clusterOf = new Map();
const clusterRec = new Map();
const clusterLives = new Map();
const countedLife = new Set();
const clusterIdxOf = (first) => {
  if (first.ux == null) return -1;
  if (clusterOf.has(first.id)) return clusterOf.get(first.id);
  let idx = clusterOrigin.findIndex(o => Math.hypot(o.ux - first.ux, o.uy - first.uy) <= 6);
  if (idx < 0) {
    clusterOrigin.push({ ux: first.ux, uy: first.uy });
    idx = clusterOrigin.length - 1;
    clusterRec.set(idx, { birth: false, zenith: false, fall: false, zenithMeta: null });
    clusterLives.set(idx, []);
  }
  clusterOf.set(first.id, idx);
  return idx;
};
const clusterKind = (idx) => {
  const lives = clusterLives.get(idx) ?? [];
  if (!lives.length) return null;
  const m = med(lives);
  return m >= 1000 ? "stone" : m <= 850 ? "sky" : null;
};
const clusterLetter = (idx) => "ab"[idx] ?? `c${idx}`;

const watchDeadline = Date.now() + 180000;
let allTicks = [];
while (Date.now() < watchDeadline) {
  await sleep(60);
  allTicks = await page.evaluate(() => window.__launchRec.ticks);
  if (!allTicks.length) continue;
  const nowT = allTicks[allTicks.length - 1].t;
  const tracks = gatherTracks(allTicks);
  for (const tr of tracks) {
    const first = tr[0], last = tr[tr.length - 1];
    const idx = clusterIdxOf(first);
    if (idx < 0) continue;
    const live = nowT - last.t < 250;
    const life = last.t - first.t;
    if (!live && life >= 300 && nearFray(last, 80) && !countedLife.has(first.id)) {
      countedLife.add(first.id);
      clusterLives.get(idx).push(life);
    }
    if (!live) continue;
    const recB = clusterRec.get(idx);
    const L = clusterLetter(idx);
    const gNow = growthOf(last);
    const distStart = first.ux != null && last.ux != null ? Math.hypot(last.ux - first.ux, last.uy - first.uy) : 0;
    if (!recB.birth && gNow <= 0.66 && life <= 600) {
      const clip = { x: Math.max(0, last.cx - 300), y: Math.max(0, last.cy - 220), width: 600, height: 440 };
      await page.screenshot({ path: join(OUT, `shot-birth-${L}.png`), clip }).catch(() => {});
      recB.birth = true;
      console.log(`  photographed a birth (cluster ${L}) at g=${gNow.toFixed(2)}`);
    } else if (!recB.zenith && gNow >= 0.93) {
      const clip = { x: Math.max(0, last.cx - 380), y: Math.max(0, last.cy - 280), width: 760, height: 560 };
      await page.screenshot({ path: join(OUT, `shot-zenith-${L}.png`), clip }).catch(() => {});
      await page.screenshot({ path: join(OUT, "shot-mid-full.png") }).catch(() => {});
      recB.zenith = true;
      recB.zenithMeta = { file: `shot-zenith-${L}.png`, cx: last.cx - clip.x, cy: last.cy - clip.y, rot: last.rot, boxW: last.boxW };
      console.log(`  photographed a zenith (cluster ${L}) at g=${gNow.toFixed(2)}`);
    } else if (!recB.fall && gNow <= 0.80 && distStart >= 55) {
      const clip = { x: Math.max(0, last.cx - 300), y: Math.max(0, last.cy - 220), width: 600, height: 440 };
      await page.screenshot({ path: join(OUT, `shot-fall-${L}.png`), clip }).catch(() => {});
      recB.fall = true;
      console.log(`  photographed a fall (cluster ${L}) at g=${gNow.toFixed(2)}`);
    }
  }
  const stoneIdx = clusterOrigin.findIndex((_, i) => clusterKind(i) === "stone");
  const skyIdx = clusterOrigin.findIndex((_, i) => clusterKind(i) === "sky");
  const done = tracks.filter(tr => tr[tr.length - 1].t - tr[0].t >= 1200 && nearFray(tr[tr.length - 1], 80));
  /* The watch ends on the stone flight's zenith and fall
     and the sky flight's zenith (its tint photograph); the
     birth photographs are attempted but not awaited — the
     photo window's standing gap — and §G's DOM record
     carries the birth either way. */
  if (done.length >= 2 && stoneIdx >= 0 && skyIdx >= 0 && clusterRec.get(stoneIdx)?.zenith && clusterRec.get(stoneIdx)?.fall && clusterRec.get(skyIdx)?.zenith) break;
}
const rec = await page.evaluate(() => { clearInterval(window.__launchRec.iv); return window.__launchRec; });
clearInterval(stillIv);
const tracks = gatherTracks(rec.ticks);
const placementTracks = tracks.filter(tr => nearFray(tr[tr.length - 1], 80) && tr[tr.length - 1].t - tr[0].t >= 1000);
const skyTracks = tracks.filter(tr => nearFray(tr[tr.length - 1], 80) && tr[tr.length - 1].t - tr[0].t >= 380 && tr[tr.length - 1].t - tr[0].t <= 850);
const orphans = rec.ticks.reduce((n, tk) => n + tk.shards.filter(s => s.orphan).length, 0);
console.log(`recorded ${tracks.length} track(s); placement (stone) flights long enough to judge: ${placementTracks.length}; sky flights: ${skyTracks.length}; orphan shard images: ${orphans}`);
ok("every drawn shard rides a seated frame (no raw <image> shard remains)", orphans === 0, `orphans=${orphans}`);
ok("placement flights were recorded whole (≥2 flights of ≥1000 ms sampled)", placementTracks.length >= 2, `n=${placementTracks.length}`);

/* The clusters resolved: the stone cluster's photographs
   take the canonical names the report carries. */
const stoneIdxF = clusterOrigin.findIndex((_, i) => clusterKind(i) === "stone");
const skyIdxF = clusterOrigin.findIndex((_, i) => clusterKind(i) === "sky");
console.log(`  clusters: ${clusterOrigin.map((o, i) => `${clusterLetter(i)}@${Math.round(o.ux)},${Math.round(o.uy)} kind=${clusterKind(i) ?? "?"} lives=${(clusterLives.get(i) ?? []).join("/")}`).join(" · ")}`);
if (stoneIdxF >= 0) {
  const L = clusterLetter(stoneIdxF);
  const recB = clusterRec.get(stoneIdxF);
  try {
    if (recB?.zenith) { copyFileSync(join(OUT, `shot-zenith-${L}.png`), join(OUT, "shot-mid-drift.png")); shotsTaken.mid = true; shotsTaken.midFull = true; }
    if (recB?.fall) { copyFileSync(join(OUT, `shot-fall-${L}.png`), join(OUT, "shot-fall.png")); shotsTaken.fall = true; }
    if (recB?.birth) { copyFileSync(join(OUT, `shot-birth-${L}.png`), join(OUT, "shot-birth.png")); shotsTaken.birth = true; }
  } catch { /* a failed screenshot leaves its flag down, and the photo assertion below says so */ }
}

/* THE ROAD, RECKONED IN USER SPACE (see the header): a
   track's frame of judgement — every sample's road
   (progress along its own chord, first sighting →
   furthest sighting, in user units) and growth, plus the
   DISTINCT renders (consecutive samples identical in
   user position and box are one render the starved
   recorder sighted twice; judgements walk the distinct
   series so a frozen render cannot fake a step, a
   direction, or a second vote). */
const trackFrame = (tr) => {
  const raw = tr.filter(s => s.ux != null && s.uy != null);
  if (raw.length < 3) return null;
  const o = raw[0];
  let e = o, best = -1;
  for (const p of raw) { const d = Math.hypot(p.ux - o.ux, p.uy - o.uy); if (d > best) { best = d; e = p; } }
  const cvx = e.ux - o.ux, cuy = e.uy - o.uy;
  const len2 = cvx * cvx + cuy * cuy;
  if (len2 < 30 * 30) return null;
  const all = raw.map(s => ({ s, shat: ((s.ux - o.ux) * cvx + (s.uy - o.uy) * cuy) / len2, g: growthOf(s) }));
  const distinct = [];
  for (const p of all) {
    const prev = distinct[distinct.length - 1];
    if (prev && prev.s.ux === p.s.ux && prev.s.uy === p.s.uy && prev.s.boxW === p.s.boxW) continue;
    distinct.push(p);
  }
  return { all, distinct, ox: o.ux, oy: o.uy };
};
const stoneFrames = placementTracks.map(trackFrame).filter(f => f && f.distinct.length >= 5);
const stonePts = stoneFrames.flatMap(f => f.distinct);

/* §G — THE GROWTH TO THE ZENITH (RESTATED 2026-11-10,
   replacing §W whole: the morning's constant width was
   Nigel's correction's first casualty — the width is now
   SUPPOSED to change, along the growth law, and this
   section proves the change is the law's and no other.
   Every sample's growth is reckoned from the DOM: its
   painted width against the painted width its own slice
   would wear at the FULL measure — so the reading is the
   growth multiplier itself (0.5 at the hand, 1 at the
   zenith), blind to which frame is showing. A sample's
   road is its progress along its own flight's chord in
   user space (the header's reckoning note). The curve
   the readings are judged against is flightLaw's:
   smoothstep on the climb, 0.5 → 1.0 at the road's
   midpoint → 0.5, never past 1. */
const samples = placementTracks.flat();
const painted = samples.map(paintedOf);
const pMin = Math.min(...painted), pMax = Math.max(...painted);
console.log(`  painted widths across ${samples.length} stone samples: min ${pMin.toFixed(1)} · max ${pMax.toFixed(1)} land units (the growth spans them now — the zenith's full measure is the max)`);
const gMax = stonePts.length ? Math.max(...stonePts.map(p => p.g)) : 0;
const early = stonePts.filter(p => p.shat <= 0.12);
const earlyMean = early.length ? early.reduce((a, p) => a + p.g, 0) / early.length : 0;
console.log(`  growth at the road's first eighth: n=${early.length} mean ${earlyMean.toFixed(3)} max ${early.length ? Math.max(...early.map(p => p.g)).toFixed(3) : "—"} (the law: 0.500 rising)`);
ok("§G the shot starts small — the road's first eighth reads at the growth's foot (mean within 0.42–0.64 of full, none past 0.72)",
  early.length >= 4 && earlyMean >= 0.42 && earlyMean <= 0.64 && Math.max(...early.map(p => p.g)) <= 0.72,
  `n=${early.length} mean=${earlyMean.toFixed(3)}`);
const devs = stonePts.filter(p => p.shat >= -0.02 && p.shat <= 1.02).map(p => Math.abs(p.g - lawG(Math.min(1, Math.max(0, p.shat)))));
const devShare = devs.length ? devs.filter(d => d <= 0.12).length / devs.length : 0;
console.log(`  the growth against the law's curve at ${devs.length} distinct renders: median deviation ${med(devs).toFixed(3)}, ${(devShare * 100).toFixed(0)}% within 0.12 of the curve`);
ok("§G the drawn growth FOLLOWS THE LAW'S CURVE along the whole road — ≥90% of distinct renders within 0.12 of shotGrowthScale at their road, median within 0.05 (this fit, not adjacent-sample steps, is the smoothness proof: the recorder sights a flight ~9 times, so neighbours stand far apart on the road)",
  devs.length >= 20 && devShare >= 0.9 && med(devs) <= 0.05,
  `n=${devs.length} share=${devShare.toFixed(2)} median=${med(devs).toFixed(3)}`);
let worstDrop = 0, climbSeries = 0;
for (const f of stoneFrames) {
  const climb = f.distinct.filter(p => p.shat <= 0.55).sort((a, b) => a.shat - b.shat);
  if (climb.length < 4) continue;
  climbSeries++;
  for (let i = 1; i < climb.length; i++) worstDrop = Math.max(worstDrop, climb[i - 1].g - climb[i].g);
}
console.log(`  the climb across ${climbSeries} judged flight(s): worst fall between distinct renders ${worstDrop.toFixed(3)}`);
ok("§G the climb never falls back — no distinct render on the way up reads more than 5% under the one before it",
  climbSeries >= 1 && worstDrop <= 0.05,
  `drop=${worstDrop.toFixed(3)}`);
const zen = stonePts.filter(p => p.shat >= 0.40 && p.shat <= 0.60);
const zenMin = zen.length ? Math.min(...zen.map(p => p.g)) : 0;
console.log(`  growth around the zenith (road 0.40–0.60): n=${zen.length} min ${zenMin.toFixed(3)}; the flight's fullest growth: ${gMax.toFixed(3)}`);
ok("§G the shot stands at full size at the zenith — every distinct render in the zenith's band reads ≥0.85 of full, and the fullest lands on the measure (0.97–1.03)",
  zen.length >= 4 && zenMin >= 0.85 && gMax >= 0.97 && gMax <= 1.03,
  `zenMin=${zenMin.toFixed(3)} gMax=${gMax.toFixed(3)}`);
const boxPeak = samples.length ? Math.max(...samples.map(s => s.boxW)) : 0;
ok("§G full size is the ceiling — no render's growth passes 1.03, and the seated box peaks at the law's one measure (144 at level 1, never 216)",
  gMax <= 1.03 && boxPeak >= 140 && boxPeak <= 145,
  `gMax=${gMax.toFixed(3)} boxPeak=${boxPeak.toFixed(1)}`);
const late = stonePts.filter(p => p.shat >= 0.88);
console.log(`  growth at the road's last eighth: n=${late.length} max ${late.length ? Math.max(...late.map(p => p.g)).toFixed(3) : "—"} (the mirror brings it home)`);
ok("§G the descent mirrors the climb — the road's last eighth reads back down toward the growth's foot (every render ≤0.74)",
  late.length >= 3 && Math.max(...late.map(p => p.g)) <= 0.74,
  `n=${late.length} max=${late.length ? Math.max(...late.map(p => p.g)).toFixed(3) : "—"}`);

/* §H — THE NOSE HOLDS THE ROAD (new, 2026-11-10): at
   every judged distinct render, the host group's
   rotate() — read from the DOM — against the shard's own
   direction of travel in USER space, reckoned as the
   secant across the neighbouring distinct renders (a
   parabola's secant over a window is its tangent at the
   window's middle, so the two must agree wherever the
   road is honestly flown). §H2 — THE TAIL DOES NOT POINT
   HOME (the sharpening, Nigel 2026-11-10 09:55): "what i
   disliked wasn't the breathing — it was the fact that
   the TAIL of the projectiles always pointed at the
   ORIGIN point rather than following the flight path."
   The fault has an exact shape: a shot rotated by the
   CHORD — the angle from the firer's hand to its current
   stand — flies with its tail locked on the hand the
   whole way. A tangent-true shot's nose reads the road's
   direction of travel instead, and on the FALL the two
   readings stand far apart: the tangent pitches
   down-forward toward the mark while the chord still
   points back up toward the hand. So §H2 judges the
   drawn rotation against BOTH angles at mid-fall renders:
   the axis must sit ON the tangent and FAR from the
   chord — and the two candidate angles must themselves
   stand far apart there, or the samples could not tell
   the two laws apart. The same walk buckets §H's samples
   by phase, so the climb, the zenith and the fall each
   answer for themselves. */
const angDiff = (a, b) => { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const phases = { climb: { n: 0, within: 0 }, zenith: { n: 0, within: 0 }, fall: { n: 0, within: 0 } };
const hDiffs = [];
const fallTan = [], fallChord = [], fallSep = [];
for (const f of stoneFrames) {
  const D = f.distinct;
  for (let i = 1; i < D.length - 1; i++) {
    const p = D[i];
    if (p.s.rot == null) continue;
    const tangent = Math.atan2(D[i + 1].s.uy - D[i - 1].s.uy, D[i + 1].s.ux - D[i - 1].s.ux) * 180 / Math.PI;
    const dTan = angDiff(p.s.rot, tangent);
    hDiffs.push(dTan);
    const phase = p.shat <= 0.40 ? phases.climb : p.shat <= 0.60 ? phases.zenith : phases.fall;
    phase.n++; if (dTan <= 7) phase.within++;
    if (p.shat >= 0.62 && p.shat <= 0.88) {
      const chord = Math.atan2(p.s.uy - f.oy, p.s.ux - f.ox) * 180 / Math.PI;
      fallTan.push(dTan);
      fallChord.push(angDiff(p.s.rot, chord));
      fallSep.push(angDiff(tangent, chord));
    }
  }
}
const hWithin = hDiffs.filter(d => d <= 7).length;
console.log(`  nose against the road (user space): ${hDiffs.length} distinct renders judged, ${hWithin} within 7°, median ${med(hDiffs).toFixed(1)}°`);
ok("§H the shard's nose holds its direction of flight while it grows (≥90% of judged distinct renders within 7° of the road's travel, median within 3°)",
  hDiffs.length >= 20 && hWithin / hDiffs.length >= 0.9 && med(hDiffs) <= 3,
  `n=${hDiffs.length} within=${hWithin} median=${med(hDiffs).toFixed(1)}`);
for (const [name, p] of Object.entries(phases)) console.log(`  nose by phase — ${name}: ${p.n} renders, ${p.within} within 7° of the tangent`);
ok("§H the nose holds the tangent in EVERY phase of the flight — climb, zenith and fall each ≥85% within 7° (the tail sweeps with the road, it never locks home)",
  Object.values(phases).every(p => p.n >= 5 && p.within / p.n >= 0.85),
  Object.entries(phases).map(([k, p]) => `${k}:${p.within}/${p.n}`).join(" "));
console.log(`  mid-fall (road 0.62–0.88), ${fallTan.length} renders: drawn axis vs tangent — median ${med(fallTan).toFixed(1)}°; drawn axis vs the chord back to the hand — median ${med(fallChord).toFixed(1)}°; the two candidate angles stand median ${med(fallSep).toFixed(1)}° apart there`);
ok("§H2 at mid-fall the drawn axis sits on the tangent and FAR from the chord back to the hand — the tail streams behind the shot along its road, it does not point at the origin (median axis-to-tangent ≤5°, median axis-to-chord ≥15°, the candidates themselves ≥15° apart)",
  fallTan.length >= 6 && med(fallTan) <= 5 && med(fallChord) >= 15 && med(fallSep) >= 15,
  `n=${fallTan.length} tan=${med(fallTan).toFixed(1)} chord=${med(fallChord).toFixed(1)} sep=${med(fallSep).toFixed(1)}`);

/* §P — FULL PRESENCE: mid-flight samples stand at opacity
   1 — no per-slice swell-in survives anywhere on the road. */
let midOpaque = 0, midCount = 0;
for (const f of stoneFrames) {
  for (const p of f.all) {
    if (p.shat >= 0.2 && p.shat <= 0.8) { midCount++; if (p.s.opacity === 1) midOpaque++; }
  }
}
console.log(`  mid-road samples at full opacity: ${midOpaque}/${midCount}`);
ok("§P the shard stands at full presence through the road's middle (no swell-in)", midCount >= 20 && midOpaque === midCount, `${midOpaque}/${midCount}`);

/* §C — THE ARC RISES: on the judged flights, mid samples
   rise above the straight chord (screen y grows downward;
   a rise is the chord's y minus the sample's). */
let bestRise = 0;
for (const tr of placementTracks) {
  const a = tr[0], b = tr[tr.length - 1];
  const dx = b.cx - a.cx, dy = b.cy - a.cy;
  const len2 = dx * dx + dy * dy;
  if (len2 < 30 * 30) continue;
  for (const s of tr) {
    const t = ((s.cx - a.cx) * dx + (s.cy - a.cy) * dy) / len2;
    if (t < 0.25 || t > 0.75) continue;
    bestRise = Math.max(bestRise, (a.cy + dy * t) - s.cy);
  }
}
console.log(`  fullest mid-flight rise above the chord: ${bestRise.toFixed(1)}px`);
ok("§C the drawn road arcs — mid-flight samples rise above the straight chord by a real margin", bestRise >= 8, `rise=${bestRise.toFixed(1)}px`);

/* §E — THE FALL LANDS ON THE MARK: each judged flight's
   last sample stands at the Fray's centre as that same
   tick served it (the mark walks; the endpoint was re-read
   at the flight's start). */
const endDist = placementTracks.map(tr => {
  const last = tr[tr.length - 1];
  return last.frays.length ? Math.min(...last.frays.map(f => Math.hypot(last.cx - f.cx, last.cy - f.cy))) : 9999;
});
console.log(`  flight-end distance to the Fray's live centre: ${endDist.map(d => d.toFixed(0)).join(", ")}px`);
ok("§E every judged flight falls on the mark's live stand (last sample within 80 px of the Fray's centre)",
  endDist.length >= 2 && endDist.every(d => d < 80), `ends=${endDist.map(d => d.toFixed(0)).join(",")}`);

/* §T — THE TAIL'S TINT (Nigel, 2026-11-10): the zenith
   photographs, read pixel by pixel in a second page. In
   each, a grid over the disc around the shard's recorded
   centre is split by the shard's own recorded heading:
   the TAIL band (behind the centre along the axis,
   0.30–0.90 of the drawn width back, within 0.30 of the
   axis across) against the HEAD band (the same, forward).
   A pixel carries the tint when its hue stands within
   30° of the element colour's hue (palette.ts: stone
   #9c7c4c, sky #8d9fd6) with real saturation — the wake
   is the element colour at half strength over the land,
   so hue is its signature. The law the bands judge: the
   tail band carries the colour FAR more than the head
   band — the tint lives on the tail, and the head reads
   as his art. */
ok("§T0 two elements' flights were witnessed — the stone firer's long shots and the sky firer's short ones",
  skyTracks.length >= 2 && placementTracks.length >= 2, `sky=${skyTracks.length} stone=${placementTracks.length}`);
const pxPerUnit = (list) => {
  const ratios = list.map(tr => {
    const f0 = tr[0];
    let u = 0, sc = 0;
    for (const s of tr) {
      if (s.ux != null) u = Math.max(u, Math.hypot(s.ux - f0.ux, s.uy - f0.uy));
      sc = Math.max(sc, Math.hypot(s.cx - f0.cx, s.cy - f0.cy));
    }
    return u > 10 ? sc / u : 0;
  }).filter(r => r > 0);
  return ratios.length ? med(ratios) : 0;
};
const ppage = await browser.newPage();
const tintMeasure = async (meta, hex, ppu) => {
  const boxWpx = meta.boxW * ppu;
  const dataUrl = "data:image/png;base64," + readFileSync(join(OUT, meta.file)).toString("base64");
  return ppage.evaluate(async ({ dataUrl, cx, cy, rotDeg, boxWpx, hex }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
    const cv = document.createElement("canvas");
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const ctx = cv.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const hueOf = (r, g, b) => {
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx === mn) return { h: 0, sat: 0, mx, mn };
      const dd = mx - mn;
      let h = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
      h *= 60; if (h < 0) h += 360;
      return { h, sat: dd / mx, mx, mn };
    };
    const tn = parseInt(hex.slice(1), 16);
    const th = hueOf(tn >> 16 & 255, tn >> 8 & 255, tn & 255).h;
    const rad = rotDeg * Math.PI / 180, hx = Math.cos(rad), hy = Math.sin(rad);
    let tailN = 0, tailHit = 0, headN = 0, headHit = 0;
    const R = boxWpx * 0.95;
    for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(cv.height - 1, cy + R); y += 3) {
      for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(cv.width - 1, cx + R); x += 3) {
        const dx = x - cx, dy = y - cy;
        const along = (dx * hx + dy * hy) / boxWpx;
        const perp = Math.abs(-dx * hy + dy * hx) / boxWpx;
        if (perp > 0.30) continue;
        const side = along <= -0.30 && along >= -0.90 ? "tail" : along >= 0.30 && along <= 0.90 ? "head" : null;
        if (!side) continue;
        const i = (y * cv.width + x) * 4;
        const { h, sat, mx, mn } = hueOf(d[i], d[i + 1], d[i + 2]);
        let hd = Math.abs(h - th); if (hd > 180) hd = 360 - hd;
        const tinted = hd <= 30 && sat >= 0.14 && (mx - mn) >= 22 && mx >= 60 && mx <= 250;
        if (side === "tail") { tailN++; if (tinted) tailHit++; } else { headN++; if (tinted) headHit++; }
      }
    }
    return { tailN, tailHit, headN, headHit };
  }, { dataUrl, cx: meta.cx, cy: meta.cy, rotDeg: meta.rot ?? 0, boxWpx, hex });
};
for (const [idxF, hex, name, list] of [[stoneIdxF, "#9c7c4c", "stone", placementTracks], [skyIdxF, "#8d9fd6", "sky", skyTracks]]) {
  const meta = idxF >= 0 ? clusterRec.get(idxF)?.zenithMeta : null;
  if (!meta) { ok(`§T a ${name} shot's tail carries ${name}'s palette colour`, false, "no zenith photograph for the cluster"); continue; }
  const m = await tintMeasure(meta, hex, pxPerUnit(list)).catch(e => { console.log("  tint measure failed:", String(e).slice(0, 160)); return null; });
  if (!m) { ok(`§T a ${name} shot's tail carries ${name}'s palette colour`, false, "pixel read failed"); continue; }
  const tailFrac = m.tailN ? m.tailHit / m.tailN : 0;
  const headFrac = m.headN ? m.headHit / m.headN : 0;
  console.log(`  ${name} tail tint: tail band ${m.tailHit}/${m.tailN} pixels carry ${hex} (${(tailFrac * 100).toFixed(0)}%); head band ${m.headHit}/${m.headN} (${(headFrac * 100).toFixed(0)}%)`);
  ok(`§T a ${name} shot's TAIL carries ${name}'s palette colour (${hex}) — the tail band reads the tint at ≥28% of its pixels and ≥15 points above the head band, so the colour lives on the tail and the head reads as his art`,
    m.tailN >= 20 && tailFrac >= 0.28 && tailFrac >= headFrac + 0.15,
    `tail=${tailFrac.toFixed(2)} head=${headFrac.toFixed(2)} n=${m.tailN}/${m.headN}`);
}
await browser.close();

console.log(`  screenshots: birth=${shotsTaken.birth} zenith=${shotsTaken.mid} fall=${shotsTaken.fall} (in ${OUT})`);
ok("the zenith and the fall were photographed (RESTATED 2026-11-10: the birth photograph is attempted but no longer required — it eluded the watcher in every Push-71 run, and §G's DOM record carries the birth; the zenith photograph is triggered by the growth itself, a shard standing at its full width)", shotsTaken.mid && shotsTaken.fall, JSON.stringify(shotsTaken));

console.log(`\nLAUNCHED-SHOT PROOF DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
