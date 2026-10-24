// THE SHARD FLIGHT DRIVE — THE PROJECTILE REPAIR'S PROOF
// (2026-10-24). Nigel, iPad-first, reported never seeing the
// new projectile: "im stil not seeing hte new projectile form
// the awoken". The diagnosis: the Matter shard's flight was
// drawn with SMIL — <animateMotion> for the road and a
// per-frame <animate> for the frame slices, each frame's base
// opacity 0 — and iPad Safari does not run SMIL, so every
// frame sat invisible at the SVG origin. The repair draws
// the flight from the map's own clock (marchNow, ticked at
// the stride's 50 ms while a flight is live — the weapon's
// own flight pattern), the position walked render by render.
//
// This drive makes the repair measurable in a real browser
// against the real server and the real fight:
//   §A a witnessed strike from the living battle draws a
//      Matter shard element on the map;
//   §B the shard's subtree carries NO SMIL at any sample —
//      no animate, animateMotion, animateTransform or set
//      nodes inside its group, ever;
//   §C the drawn position ADVANCES: the flight's samples
//      travel a real road (max pairwise distance well past
//      a figure's width), and the group's transform — the
//      clock's hand — changes across the flight;
//   §D the FRAME advances: at least two of the six shard
//      frames are drawn across one flight;
//   §E the flight REACHES ITS TARGET: a sample in the
//      flight's second half lands within a hex's grace of
//      the Fray figure's drawn centre at that same moment —
//      the shard arrives where the dark stands.
// The fight is the engine's own: a Tide Awokin placed on the
// land, a Fray standing three hexes off (Tide's reach, no
// shove to move the mark), the server's reads settling real
// strikes, the page's read loop witnessing them.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-shard-flight.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

const OUT = "/home/hatch/workspace/shard-flight-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-shard-"));
process.env.PORT = "3996";
process.env.WORKSHOP_PASSWORD = "shard-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3996";
const PW = "shard-drive-password";
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

/* ══ THE WORLD: a Tender, a quiet land, a Tide Awokin placed
   at (1,0), and a Fray standing at (4,0) — three hexes off,
   inside Tide's reach of 3 (+0.35), wearing enough hide to
   stand through many strikes. ════════════════════════════ */
const claim = await call("claimTender", { password: PW, tenderName: "Shard Tender" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
const token = claim.token;
const now = Date.now();
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, now);
db.prepare(`INSERT INTO tender_progress (owner_key, class_key, weapon_key, hp, weapon_next_at, updated_at)
  VALUES (?, 'runewright', 'sword', 100, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'runewright', hp = 100`).run(ownerKey, now + 600000, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?)").run(ownerKey, now);
// The cradle stilled: no births but the one Fray seeded below.
db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ? WHERE owner_key = ?").run(now, ownerKey);

const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', ?, ?)");
const tileId = new Map();
for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
  if (hexDist({ q, r }, { q: 0, r: 0 }) > 4) continue;
  const cursed = (q === 4 && r === 0) ? 1 : 0;
  tileId.set(`${q},${r}`, Number(insTile.run(ownerKey, q, r, cursed, now).lastInsertRowid));
}

function seedAwokin(name, element, power = 3, toughness = 3) {
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, power, toughness, element, `shard/${name}-${cat}.png`, now).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power, toughness, element });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `shard/${name}.png`, JSON.stringify(parts), "Shard Tender", ownerKey, now).lastInsertRowid);
}
const tideAwoken = seedAwokin("Tide Striker", "tide");
db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
  VALUES (?, ?, ?, ?, ?, 'defense', 0, 999, 1, 0, NULL, NULL, 0)`).run(ownerKey, tideAwoken, tileId.get("1,0"), now, now);
// The Fray wears a mountain of hide (100000) on purpose: the
// drive's window is a minute of real battle, and a Fray that
// falls mid-window ends the strikes — and the proof — early.
const frayId = Number(db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
  VALUES (?, ?, 'fray', ?, 100000, 4, 0, 1, 1, 0)`).run(ownerKey, tileId.get("4,0"), now).lastInsertRowid);

// Keep the cradle stilled for the drive's whole life: the
// anchor is re-set every few seconds, so no spawn beat ever
// comes due and the seeded Fray is the only dark on the land
// — the recorder's target is never confused with a cradle
// birth across the map.
const stillIv = setInterval(() => {
  try { db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ?, wanderer_settled_beats = 0 WHERE owner_key = ?").run(Date.now(), ownerKey); } catch { /* the drive is ending */ }
}, 4000);

// Prime the battle at the API: the first read sets the
// server's watermark so the fight is live before the page
// opens, exactly as a Tender's standing reads keep it.
await call("getTerritory", {}, token);
await sleep(3200);
const primeRead = await call("getTerritory", {}, token);
const primeStrikes = (primeRead.strikes ?? []).filter(s => s.awakenedId === tideAwoken);
console.log(`primed: ${primeStrikes.length} strike(s) already struck by the Tide Awokin before the page opens`);
ok("§0 the engine strikes before the page ever opens (the fight is real, not staged)", primeStrikes.length >= 1, JSON.stringify(primeRead.strikes ?? []).slice(0, 200));

/* ══ OPEN THE LAND ══════════════════════════════════════ */
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:shard]", String(e).slice(0, 200)));
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

/* ══ THE RECORDER: every 25 ms, the shard images on the map
   — where each stands, which frame it wears, what its group
   declares — and where the Fray's face stands at that same
   moment. ═══════════════════════════════════════════════ */
await page.evaluate(() => {
  const rec = { ticks: [] };
  window.__shardRec = rec;
  rec.iv = setInterval(() => {
    const tick = { t: performance.now(), shards: [], frays: [] };
    for (const im of document.querySelectorAll("image")) {
      const href = im.getAttribute("href") || "";
      if (href.includes("fray-walk")) {
        const r = im.getBoundingClientRect();
        tick.frays.push({ cx: r.x + r.width / 2, cy: r.y + r.height / 2 });
      }
      if (!href.includes("matter-shard")) continue;
      const g = im.closest("g");
      const r = im.getBoundingClientRect();
      tick.shards.push({
        href: href.split("/").pop(),
        cx: r.x + r.width / 2, cy: r.y + r.height / 2,
        transform: g ? (g.getAttribute("transform") || "") : "",
        smil: g ? g.querySelectorAll("animate, animateMotion, animateTransform, set").length : -1,
      });
    }
    rec.ticks.push(tick);
  }, 25);
});

// Watch until the record holds a flight track worth reading
// — one road followed for most of its life, its frames
// changing as it goes — or the window runs out. (A burst can
// witness several strikes at once; their flights overlap,
// so the reading below chains samples into tracks by the
// road they walk, and judges the longest track.)
const trackOf = (ticks) => {
  const all = [];
  for (const tk of ticks) for (const s of tk.shards) all.push({ ...s, t: tk.t, frays: tk.frays });
  all.sort((a, b) => a.t - b.t);
  const tracks = [];
  for (const s of all) {
    let best = null, bestD = Infinity;
    for (const tr of tracks) {
      const last = tr[tr.length - 1];
      if (s.t - last.t > 700) continue;
      const d = Math.hypot(s.cx - last.cx, s.cy - last.cy);
      if (d < bestD) { bestD = d; best = tr; }
    }
    if (best && bestD < 80) best.push(s); else tracks.push([s]);
  }
  tracks.sort((a, b) => (b[b.length - 1].t - b[0].t) - (a[a.length - 1].t - a[0].t));
  return tracks;
};
let sawFlightEnd = false;
for (let i = 0; i < 75; i++) {
  await sleep(1000);
  const state = await page.evaluate(() => {
    const ticks = window.__shardRec.ticks;
    const lastShardIdx = ticks.map(tk => tk.shards.length > 0).lastIndexOf(true);
    return { lastShardIdx, total: ticks.length, ticks };
  });
  const tracks = trackOf(state.ticks);
  const top = tracks[0];
  const rich = top && top.length >= 5 && (top[top.length - 1].t - top[0].t) >= 300 && new Set(top.map(s => s.href)).size >= 2;
  if (rich && state.lastShardIdx >= 0 && state.total - 1 - state.lastShardIdx >= 12) { sawFlightEnd = true; break; }
}
const rec = await page.evaluate(() => { clearInterval(window.__shardRec.iv); return window.__shardRec; });
clearInterval(stillIv);
await page.screenshot({ path: join(OUT, "shard-flight-end.png") }).catch(() => {});
await browser.close();

/* ══ THE READING OF THE RECORD ══════════════════════════ */
const samples = [];
for (const tk of rec.ticks) for (const s of tk.shards) samples.push({ ...s, t: tk.t, frays: tk.frays });
samples.sort((a, b) => a.t - b.t);
console.log(`recorded ${samples.length} shard sample(s) across ${rec.ticks.length} ticks; flight seen through: ${sawFlightEnd}`);

ok("§A a witnessed strike draws a Matter shard on the map", samples.length >= 6, `samples=${samples.length}`);
ok("§B no SMIL anywhere in the shard's subtree at any sample", samples.length > 0 && samples.every(s => s.smil === 0),
  `smil counts seen: ${[...new Set(samples.map(s => s.smil))].join(",")}`);

// The reading follows ONE road: samples chained into tracks
// by nearness along their walk (a burst's overlapping flights
// walk near-parallel roads; twins on one road at one age are
// one drawn road for this reading). The longest-lived track
// is the flight judged.
const tracks = trackOf(rec.ticks);
const flight = tracks[0] ?? [];
console.log(`tracks: ${tracks.map(c => c.length).join(", ")}; reading the longest-lived flight (${flight.length} samples, span ${flight.length ? (flight[flight.length - 1].t - flight[0].t).toFixed(0) : 0}ms)`);
for (const s of flight) console.log(`  sample t+${(s.t - flight[0].t).toFixed(0)}ms (${s.cx.toFixed(0)}, ${s.cy.toFixed(0)}) ${s.href} frays=${s.frays.map(f => `(${f.cx.toFixed(0)}, ${f.cy.toFixed(0)})`).join(" ") || "—"} transform=${s.transform.slice(0, 60)}`);

let maxPair = 0;
for (let i = 0; i < flight.length; i++) for (let j = i + 1; j < flight.length; j++) {
  maxPair = Math.max(maxPair, Math.hypot(flight[i].cx - flight[j].cx, flight[i].cy - flight[j].cy));
}
ok("§C the drawn position advances — the flight travels a real road", maxPair > 40, `max pairwise distance ${maxPair.toFixed(1)}px`);
const transforms = new Set(flight.map(s => s.transform));
ok("§C the group's transform — the clock's hand — moves the shard (no fewer than three distinct transforms)", transforms.size >= 3, `distinct=${transforms.size}`);
const frames = new Set(flight.map(s => s.href));
ok("§D the frame advances across the flight (at least two of the six frames drawn)", frames.size >= 2, `frames: ${[...frames].join(", ")}`);

const secondHalf = flight.slice(Math.floor(flight.length / 2));
const arrivals = [];
for (const s of secondHalf) for (const f of s.frays) arrivals.push(Math.hypot(s.cx - f.cx, s.cy - f.cy));
const bestArrival = arrivals.length ? Math.min(...arrivals) : Infinity;
ok("§E the flight reaches its target — a second-half sample lands within a hex's grace of a Fray's drawn centre at that moment", bestArrival < 70,
  `closest second-half approach: ${bestArrival === Infinity ? "no fray read" : bestArrival.toFixed(1) + "px"}`);

// The trajectory's ends, for the report: first sample, the
// sample nearest the target, and the last sample.
if (flight.length) {
  const first = flight[0];
  const last = flight[flight.length - 1];
  console.log(`flight road: first (${first.cx.toFixed(0)}, ${first.cy.toFixed(0)}) → last (${last.cx.toFixed(0)}, ${last.cy.toFixed(0)}); travelled ${Math.hypot(last.cx - first.cx, last.cy - first.cy).toFixed(0)}px of screen; closest approach to the Fray ${bestArrival === Infinity ? "—" : bestArrival.toFixed(1) + "px"}`);
}

console.log(`\nSHARD FLIGHT DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
