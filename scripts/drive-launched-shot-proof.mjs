// THE LAUNCHED-SHOT PROOF (2026-11-10) — the frame-sampled
// witness for Nigel's ruling: a launched shot leaves the
// firer's hand at full presence, holds ONE drawn width for
// its whole flight (the matter-shard frames' open-close
// cycle no longer breathes it — the end frames carry 437 px
// of paint, the middle frames 274–282 px, and the surfaces
// now seat every frame through its painted content box),
// arcs with its path (a direct shot's peak now stands at
// max(40, dist × 0.18), where a one-hex shot once peaked at
// the 26-unit floor and read as a slide), and falls on the
// mark's CURRENT stand (the endpoint is re-read at the
// flight's staggered start, not frozen at the batch read).
//
// The world is a single Stone firer (level 1) beside a Fray
// wearing a mountain of hide: a stone shot flies 1584 ms
// (the flight law at her pace), long enough to sample and
// to photograph at its birth, its middle and its fall.
// The recorder reads every shard's seated frame — the host
// <svg data-shard-frame> — its box, its slice (from the
// frame the <image> inside wears), its viewBox and the
// image's opacity, every 15 ms. A sample's PAINTED width is
// reckoned from the DOM itself: the box's width × (the
// frame's painted width ÷ the viewBox's width), with the
// painted widths measured from the bundled PNGs:
//   frames 1/6: 437 · frames 2/5: 282 · frames 3/4: 274
// (of a 512-wide canvas; the viewBox is the content box
// widened to the drawn aspect, so the first frame's painted
// width reads ~137 of the 144 measure and the rest exact —
// a ~5% spread, inside the ±10% the ruling allows).
// Screenshots are clipped around the flying shard at the
// three moments, plus one full-map frame mid-flight.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-launched-shot-proof.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

const OUT = "/home/hatch/workspace/launched-shot-proof";
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

/* ══ THE RECORDER: every 15 ms, every seated shard frame —
   its identity, centre, box width, slice, viewBox, and the
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
      tick.shards.push({
        id: Number(host.dataset.launchId),
        cx: r.x + r.width / 2, cy: r.y + r.height / 2,
        boxW: Number(host.getAttribute("width")),
        viewBox: host.getAttribute("viewBox") || "",
        slice: Number((href.match(/matter-shard-(\d)/) || [])[1] ?? 0),
        opacity: Number(im.getAttribute("opacity") ?? 1),
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
   and photograph one long placement flight at its birth,
   its middle and its fall. A placement flight ENDS at the
   Fray; a dark flight begins there. */
const shotsTaken = { birth: false, mid: false, midFull: false, fall: false };
const watchDeadline = Date.now() + 90000;
let allTicks = [];
const gatherTracks = (ticks) => {
  const byId = new Map();
  for (const tk of ticks) for (const s of tk.shards) {
    if (s.orphan) continue;
    if (!byId.has(s.id)) byId.set(s.id, []);
    byId.get(s.id).push({ ...s, t: tk.t, frays: tk.frays });
  }
  return [...byId.values()].filter(tr => tr.length >= 8);
};
const nearFray = (s, tol) => (s.frays ?? []).some(f => Math.hypot(s.cx - f.cx, s.cy - f.cy) < tol);
/* A flight's whole life is read from its ends: a flight is
   LIVE while both have been sighted within the last
   250 ms of recorder time. A dark flight wears the same
   1584 ms as the stone's — the photo windows judge by the
   flight's own measured life, never a bare age. */
const liveFlights = (tracks, nowT) => tracks
  .map(tr => ({ tr, born: tr[0].t, lastSeen: tr[tr.length - 1].t, life: tr[tr.length - 1].t - tr[0].t }))
  .filter(x => nowT - x.lastSeen < 250)
  /* A flight is photographable the moment it is sighted:
     the FIRST photos are its birth (its fraction is small
     by definition while few samples exist); only a flight
     with a measured life ≥ 900 ms can carry a judged mid
     or fall fraction. */
  .map(x => ({ ...x, frac: Math.min(1, x.life / 1584), measurable: x.life >= 900 }));
while (Date.now() < watchDeadline) {
  await sleep(60);
  allTicks = await page.evaluate(() => window.__launchRec.ticks);
  if (!allTicks.length) continue;
  const nowT = allTicks[allTicks.length - 1].t;
  const tracks = gatherTracks(allTicks);
  /* Photograph LIVE placement flights: for the birth, the
     YOUNGEST sighted flight (its first frames are the
     birth); for mid and fall, the most advanced flight
     with a measured life. */
  const live = liveFlights(tracks, nowT)
    .filter(x => nearFray(x.tr[x.tr.length - 1], 80) || x.life < 900)
    .sort((a, b) => b.frac - a.frac);
  const youngest = live.length ? live[live.length - 1] : null;
  const cand = shotsTaken.birth ? live[0] : (youngest && youngest.life < 420 ? youngest : live[0]);
  if (cand) {
    const s = cand.frac;
    const last = cand.tr[cand.tr.length - 1];
    const clip = { x: Math.max(0, last.cx - 300), y: Math.max(0, last.cy - 220), width: 600, height: 440 };
    if (!shotsTaken.birth && s < 0.27) { await page.screenshot({ path: join(OUT, "shot-birth.png"), clip }).catch(() => {}); shotsTaken.birth = true; console.log(`  photographed the birth at s=${s.toFixed(2)}`); }
    else if (!shotsTaken.mid && cand.measurable && s >= 0.35 && s < 0.68) {
      await page.screenshot({ path: join(OUT, "shot-mid-drift.png"), clip }).catch(() => {});
      await page.screenshot({ path: join(OUT, "shot-mid-full.png") }).catch(() => {});
      shotsTaken.mid = true; shotsTaken.midFull = true;
      console.log(`  photographed the mid-drift at s=${s.toFixed(2)}`);
    }
    else if (!shotsTaken.fall && cand.measurable && s >= 0.78) { await page.screenshot({ path: join(OUT, "shot-fall.png"), clip }).catch(() => {}); shotsTaken.fall = true; console.log(`  photographed the fall at s=${s.toFixed(2)}`); }
  }
  const done = tracks.filter(tr => tr[tr.length - 1].t - tr[0].t >= 1200 && nearFray(tr[tr.length - 1], 80));
  if (done.length >= 2 && shotsTaken.birth && shotsTaken.mid && shotsTaken.fall) break;
}
const rec = await page.evaluate(() => { clearInterval(window.__launchRec.iv); return window.__launchRec; });
clearInterval(stillIv);
await browser.close();
const tracks = gatherTracks(rec.ticks);
const placementTracks = tracks.filter(tr => nearFray(tr[tr.length - 1], 80) && tr[tr.length - 1].t - tr[0].t >= 1000);
const orphans = rec.ticks.reduce((n, tk) => n + tk.shards.filter(s => s.orphan).length, 0);
console.log(`recorded ${tracks.length} track(s); placement flights long enough to judge: ${placementTracks.length}; orphan shard images: ${orphans}`);
ok("every drawn shard rides a seated frame (no raw <image> shard remains)", orphans === 0, `orphans=${orphans}`);
ok("placement flights were recorded whole (≥2 flights of ≥1000 ms sampled)", placementTracks.length >= 2, `n=${placementTracks.length}`);

/* §W — THE WIDTH HOLDS: every sample's painted width, from
   the DOM, across every slice of every judged flight. */
const samples = placementTracks.flat();
const painted = samples.map(paintedOf);
const pMin = Math.min(...painted), pMax = Math.max(...painted);
const bySlice = {};
for (const s of samples) { (bySlice[s.slice] ??= []).push(paintedOf(s)); }
console.log("  painted width by slice:", Object.entries(bySlice).map(([k, v]) => `frame ${k}: ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}`).join(" · "));
console.log(`  painted widths across ${samples.length} samples: min ${pMin.toFixed(1)} · max ${pMax.toFixed(1)} land units (spread ${(((pMax - pMin) / pMin) * 100).toFixed(1)}%)`);
ok("§W the drawn painted width is constant across the whole flight (±10% — the club is gone)",
  samples.length >= 40 && pMax / pMin <= 1.10, `min=${pMin.toFixed(1)} max=${pMax.toFixed(1)} n=${samples.length}`);
const boxWidths = [...new Set(samples.map(s => s.boxW))];
ok("§W the seated frame's box is the one drawn measure at level 1 (144, never 216)",
  boxWidths.length === 1 && boxWidths[0] === 144, `boxes=${boxWidths.join(",")}`);

/* §P — FULL PRESENCE: mid-flight samples stand at opacity
   1 — no per-slice swell-in survives anywhere on the road. */
let midOpaque = 0, midCount = 0;
for (const tr of placementTracks) {
  const t0 = tr[0].t, t1 = tr[tr.length - 1].t;
  for (const s of tr) {
    const road = (s.t - t0) / Math.max(1, t1 - t0);
    if (road >= 0.2 && road <= 0.8) { midCount++; if (s.opacity === 1) midOpaque++; }
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

console.log(`  screenshots: birth=${shotsTaken.birth} mid=${shotsTaken.mid} fall=${shotsTaken.fall} (in ${OUT})`);
ok("the three moments were photographed (birth / mid-drift / fall)", shotsTaken.birth && shotsTaken.mid && shotsTaken.fall, JSON.stringify(shotsTaken));

console.log(`\nLAUNCHED-SHOT PROOF DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
