// THE BRAMBLE FACE DRIVE — THE BRAMBLE 1 BINDING'S PROOF
// (2026-10-24). Nigel ruled (2026-10-22 15:24) that his
// Bramble 1 flipbook "plays over standing bramble on the
// field"; until this build the homeland map drew each
// standing bramble node as code — a dashed dark-green circle
// and an arc, the "knots". This drive proves the binding on
// the real map against the real engine:
//   §A a Root defender's raised bramble renders as an IMAGE
//      from the bundled flipbook frames;
//   §B the old knot drawing is ABSENT — no dashed circle
//      stands in any bramble node's group, at any sample;
//   §C a fresh raise ADVANCES through the frames in order;
//   §D a standing node then HOLDS its full-grown frame
//      (frame 32), steady across a held window.
// The raise is the engine's own: a Root Awokin standing in
// defence on an empty land, then a Fray seeded within her
// reach — her settle raises the thicket (one node per part)
// and the page's own read loop serves it.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-bramble-face.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

const OUT = "/home/hatch/workspace/bramble-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-bramble-"));
process.env.PORT = "3997";
process.env.WORKSHOP_PASSWORD = "bramble-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3997";
const PW = "bramble-drive-password";
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

/* ══ THE WORLD: a Tender, a quiet land, a Root Awokin in
   defence at (1,0) — and NO dark thing yet, so nothing can
   raise until the drive seeds one. ══════════════════════ */
const claim = await call("claimTender", { password: PW, tenderName: "Bramble Tender" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
const token = claim.token;
const now = Date.now();
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, now);
db.prepare(`INSERT INTO tender_progress (owner_key, class_key, weapon_key, hp, weapon_next_at, updated_at)
  VALUES (?, 'binder', 'sword', 100, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'binder', hp = 100`).run(ownerKey, now + 600000, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?)").run(ownerKey, now);
db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ? WHERE owner_key = ?").run(now, ownerKey);

const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', ?, ?)");
const tileId = new Map();
for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
  if (hexDist({ q, r }, { q: 0, r: 0 }) > 4) continue;
  tileId.set(`${q},${r}`, Number(insTile.run(ownerKey, q, r, 0, now).lastInsertRowid));
}

function seedAwokin(name, element, power = 3, toughness = 3) {
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, power, toughness, element, `bramble/${name}-${cat}.png`, now).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power, toughness, element });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `bramble/${name}.png`, JSON.stringify(parts), "Bramble Tender", ownerKey, now).lastInsertRowid);
}
const rootAwoken = seedAwokin("Root Warden", "root");
// stance_ordered = 1: an ordered stance is what the engine
// reads (no orders defaults to ATTACK, Nigel 2026-10-23) —
// only an ordered defender raises her work.
db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
  VALUES (?, ?, ?, ?, ?, 'defense', 0, 999, 1, 0, NULL, NULL, 1)`).run(ownerKey, rootAwoken, tileId.get("1,0"), now, now);

// Keep the cradle stilled for the drive's whole life.
const stillIv = setInterval(() => {
  try { db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ?, wanderer_settled_beats = 0 WHERE owner_key = ?").run(Date.now(), ownerKey); } catch { /* the drive is ending */ }
}, 4000);

const quietRead = await call("getTerritory", {}, token);
ok("§0 with no dark on the land, no bramble stands (the raise waits for its cause)",
  !(quietRead.defenceWorks ?? []).some(w => w.kind === "bramble"),
  JSON.stringify(quietRead.defenceWorks ?? []));

/* ══ OPEN THE LAND ══════════════════════════════════════ */
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:bramble]", String(e).slice(0, 200)));
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

/* ══ THE RECORDER: every 25 ms, the bramble images on the
   map — which frame each wears — and the knot's signature:
   any circle wearing a dash pattern, anywhere on the map. ═ */
await page.evaluate(() => {
  const rec = { ticks: [] };
  window.__brambleRec = rec;
  rec.iv = setInterval(() => {
    const tick = { t: performance.now(), frames: [], knots: 0, knotInNodeGroup: 0 };
    for (const im of document.querySelectorAll("image")) {
      const href = im.getAttribute("href") || "";
      if (!href.includes("bramble-")) continue;
      tick.frames.push(href.split("/").pop());
      const g = im.closest("g");
      if (g && g.querySelectorAll("circle, [stroke-dasharray]").length) tick.knotInNodeGroup++;
    }
    tick.knots = document.querySelectorAll("circle[stroke-dasharray]").length;
    rec.ticks.push(tick);
  }, 25);
});

/* ══ THE CAUSE: a Fray with a mountain of hide appears two
   hexes from the Root defender — inside her reach — and her
   own settle raises the thicket. ════════════════════════ */
db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
  VALUES (?, ?, 'fray', ?, 100000, 3, 0, 1, 1, 0)`).run(ownerKey, tileId.get("3,0"), Date.now());

// The engine's own word that the thicket stands.
let engineWorks = [];
for (let i = 0; i < 10; i++) {
  await sleep(1200);
  const read = await call("getTerritory", {}, token);
  engineWorks = (read.defenceWorks ?? []).filter(w => w.kind === "bramble");
  if (engineWorks.length) break;
}
ok("§0 the engine raised a real bramble work for the Root defender (three nodes, one per part)",
  engineWorks.length === 1 && engineWorks[0].nodes.filter(n => n.hp > 0).length === 3,
  JSON.stringify(engineWorks).slice(0, 300));

// Watch the page until the growth has fully played and the
// standing hold has been witnessed across a held window.
let heldLongEnough = false;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  const st = await page.evaluate(() => {
    const ticks = window.__brambleRec.ticks;
    const withFrames = ticks.filter(tk => tk.frames.length > 0);
    if (!withFrames.length) return { seen: 0 };
    const first = withFrames[0], last = withFrames[withFrames.length - 1];
    return { seen: withFrames.length, firstT: first.t, lastT: last.t, lastFrames: last.frames };
  });
  if (st.seen && st.lastT - st.firstT > 5500 && st.lastFrames.every(f => f.includes("bramble-32"))) { heldLongEnough = true; break; }
}
const rec = await page.evaluate(() => { clearInterval(window.__brambleRec.iv); return window.__brambleRec; });
clearInterval(stillIv);
await page.screenshot({ path: join(OUT, "bramble-standing.png") }).catch(() => {});
await browser.close();

/* ══ THE READING OF THE RECORD ══════════════════════════ */
const withFrames = rec.ticks.filter(tk => tk.frames.length > 0);
const frameNo = (f) => Number(/bramble-(\d+)(?:-[^/]*)?\.png/.exec(f)?.[1] ?? NaN);
console.log(`distinct hrefs in order: ${[...new Set(rec.ticks.flatMap(tk => tk.frames))].join(" | ") || "none"}`);
const sequence = [];
for (const tk of withFrames) {
  const f = tk.frames[0];
  if (sequence[sequence.length - 1] !== f) sequence.push(f);
}
console.log(`recorded ${withFrames.length} ticks wearing bramble art; frame walk: ${sequence.map(f => frameNo(f)).join(" → ") || "none"}`);

ok("§A the raised bramble renders as an image from the bundled flipbook frames",
  withFrames.length >= 10 && withFrames.every(tk => tk.frames.length >= 1 && tk.frames.every(f => /bramble-\d+/.test(f))),
  `ticks with art: ${withFrames.length}`);
ok("§B the old knot is absent — no dashed circle in any bramble node's group, and none anywhere on the map, at any sample",
  rec.ticks.length > 0 && rec.ticks.every(tk => tk.knots === 0 && tk.knotInNodeGroup === 0),
  `knot sightings: ${rec.ticks.filter(tk => tk.knots > 0 || tk.knotInNodeGroup > 0).length} ticks`);
const nos = sequence.map(frameNo);
const increasing = nos.every((n, i) => i === 0 || n > nos[i - 1]);
ok("§C a fresh raise advances through the frames in order (at least five distinct frames, strictly climbing)",
  nos.length >= 5 && increasing && nos[0] <= 3,
  `walk: ${nos.join(",")}`);
const lastTick = withFrames[withFrames.length - 1];
ok("§D the standing node holds its full-grown frame — frame 32, steady to the record's end",
  heldLongEnough && !!lastTick && lastTick.frames.every(f => f.includes("bramble-32")),
  `last frames: ${lastTick ? lastTick.frames.join(",") : "none"}; hold witnessed: ${heldLongEnough}`);

console.log(`\nBRAMBLE FACE DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
