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
//      (frame 32), steady across a held window;
//   §E the copies are cropped to the thicket alone (Nigel's
//      tap, 2026-10-24): every drawn frame bitmap is one
//      connected mass with no detached opaque pixel, and
//      the field where the art's spore dots floated is
//      clean on the rendered map.
// WATERING (Nigel, 2026-10-24, later the same day) seats
// MOTES in the work's node list — young growths at each
// node's fringe, drawn from the flipbook's young run at
// mote scale, holding the eighth frame. The recorder
// below reads node frames and mote frames apart by their
// drawn width (a mote stands at 0.45 of a node's width),
// and §0/§D assert both populations as the law now has
// them: three true nodes wearing frame 32, nine motes
// wearing the young held frame.
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
    const tick = { t: performance.now(), frames: [], nodeFrames: [], moteFrames: [], knots: 0, knotInNodeGroup: 0 };
    const imgs = [];
    for (const im of document.querySelectorAll("image")) {
      const href = im.getAttribute("href") || "";
      if (!href.includes("bramble-")) continue;
      imgs.push({ name: href.split("/").pop(), w: im.getBoundingClientRect().width });
      const g = im.closest("g");
      if (g && g.querySelectorAll("circle, [stroke-dasharray]").length) tick.knotInNodeGroup++;
    }
    const maxW = Math.max(0, ...imgs.map((x) => x.w));
    for (const x of imgs) {
      tick.frames.push(x.name);
      if (x.w >= maxW * 0.8) tick.nodeFrames.push(x.name);
      else tick.moteFrames.push(x.name);
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
ok("§0 the engine raised a real bramble work for the Root defender (three nodes, one per part — and since WATERING each node bears its three motes in the same list)",
  engineWorks.length === 1 && engineWorks[0].nodes.filter(n => n.hp > 0 && !n.mote).length === 3 && engineWorks[0].nodes.filter(n => n.hp > 0 && n.mote).length === 9,
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
    return { seen: withFrames.length, firstT: first.t, lastT: last.t, lastFrames: last.nodeFrames, lastMotes: last.moteFrames };
  });
  if (st.seen && st.lastT - st.firstT > 5500 && st.lastFrames.length === 3 && st.lastFrames.every(f => f.includes("bramble-32")) && st.lastMotes.length === 9 && st.lastMotes.every(f => f.includes("bramble-08"))) { heldLongEnough = true; break; }
}
const rec = await page.evaluate(() => { clearInterval(window.__brambleRec.iv); return window.__brambleRec; });
clearInterval(stillIv);
await page.screenshot({ path: join(OUT, "bramble-standing.png") }).catch(() => {});

/* ══ §E THE CROP'S PROOF (Nigel's tap, 2026-10-24: "Crop
   the game's copies to the thicket — the floating dots
   never appear"): the frames as first bound carried the
   art's detached spore dots onto the map. Now every frame
   bitmap the page actually drew is scanned in the page
   itself: one connected thicket (components joined through
   faint alpha, bridged at 3px as the crop bridged them),
   no opaque pixel standing free of it; the crop's base
   stands at the canvas's bottom; and on the rendered
   map, the field the first binding's box covered around
   the topmost node — where the dots floated — holds no
   bright-green mote outside the drawn images themselves. ═ */
const eRects = await page.evaluate(() => {
  const nodeImgs = [...document.querySelectorAll("image")].filter((im) => (im.getAttribute("href") || "").includes("bramble-"));
  const allImgs = [...document.querySelectorAll("image")].map((im) => {
    const r = im.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  let top = null;
  for (const im of nodeImgs) {
    const r = im.getBoundingClientRect();
    if (!top || r.y < top.rect.y) {
      const el = im.closest("g")?.querySelector("ellipse");
      const er = el?.getBoundingClientRect();
      top = { rect: { x: r.x, y: r.y, w: r.width, h: r.height }, ellipse: er ? { x: er.x, y: er.y, w: er.width, h: er.height } : null };
    }
  }
  return { allImgs, top };
});
const eShot64 = await page.screenshot({ encoding: "base64" });
const eScan = await page.evaluate(async (names, rects, shot64) => {
  // The recorder kept file names; the page's own resource
  // ledger holds the URLs it actually drew them from.
  const byName = new Map();
  for (const e of performance.getEntriesByType("resource")) {
    const base = e.name.split("/").pop();
    if (base?.includes("bramble-")) byName.set(base, e.name);
  }
  for (const im of document.querySelectorAll("image")) {
    const href = im.getAttribute("href") || "";
    if (href.includes("bramble-")) byName.set(href.split("/").pop(), new URL(href, location.href).href);
  }
  async function scanHref(href) {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = href; });
    const w = img.naturalWidth, h = img.naturalHeight;
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d"); ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;
    const alpha = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) alpha[i] = data[i * 4 + 3];
    let mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) mask[i] = alpha[i] > 16 ? 1 : 0;
    for (let d = 0; d < 3; d++) {
      const src = mask, out = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let v = 0;
        for (let dy = -1; dy <= 1 && !v; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && src[yy * w + xx]) { v = 1; break; }
        }
        out[y * w + x] = v;
      }
      mask = out;
    }
    const lab = new Int32Array(w * h).fill(-1);
    let ncomp = 0; const compTrue = [];
    for (let i = 0; i < w * h; i++) {
      if (!mask[i] || lab[i] >= 0) continue;
      const id = ncomp++; let cnt = 0;
      const stack = [i]; lab[i] = id;
      while (stack.length) {
        const p = stack.pop(); if (alpha[p] > 16) cnt++;
        const px = p % w, py = (p / w) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = px + dx, yy = py + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const q = yy * w + xx;
          if (mask[q] && lab[q] < 0) { lab[q] = id; stack.push(q); }
        }
      }
      compTrue.push(cnt);
    }
    let main = 0; for (let c = 1; c < ncomp; c++) if (compTrue[c] > compTrue[main]) main = c;
    let stray = 0, bottomRow = -1;
    for (let i = 0; i < w * h; i++) {
      if (alpha[i] >= 32 && lab[i] !== main) stray++;
      if (alpha[i] >= 4) { const y = (i / w) | 0; if (y > bottomRow) bottomRow = y; }
    }
    return { w, h, stray, bottomRow };
  }
  const frames = {};
  for (const name of names) {
    const url = byName.get(name);
    frames[name] = url ? await scanHref(url) : { missing: true };
  }
  // The screenshot scan: the first binding's box around the
  // topmost node, outside every drawn image on the map.
  let motes = -1, moteAt = null;
  if (rects.top?.ellipse) {
    const er = rects.top.ellipse;
    const size = er.w / 0.4;
    const cx = er.x + er.w / 2, cy = er.y + er.h / 2 - 0.12 * size;
    const box = { l: cx - 0.475 * size, r: cx + 0.475 * size, b: cy + 0.1 * size, t: cy + 0.1 * size - 0.95 * size * (524 / 512) };
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = "data:image/png;base64," + shot64; });
    const cv = document.createElement("canvas"); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const ctx = cv.getContext("2d"); ctx.drawImage(img, 0, 0);
    const W = cv.width, H = cv.height;
    const data = ctx.getImageData(0, 0, W, H).data;
    const excluded = (x, y) => rects.allImgs.some((r) => x >= r.x - 4 && x <= r.x + r.w + 4 && y >= r.y - 4 && y <= r.y + r.h + 4);
    motes = 0;
    for (let y = Math.max(0, Math.floor(box.t)); y < Math.min(H, box.b) && motes <= 40; y++)
      for (let x = Math.max(0, Math.floor(box.l)); x < Math.min(W, box.r); x++) {
        if (excluded(x, y)) continue;
        const o = (y * W + x) * 4, R = data[o], G = data[o + 1], B = data[o + 2];
        if (G >= 140 && G - R >= 45 && G - B >= 80) { motes++; if (!moteAt) moteAt = [x, y, R, G, B]; }
      }
  }
  return { frames, motes, moteAt };
}, [...new Set(rec.ticks.flatMap((tk) => tk.frames))], eRects, eShot64).catch((e) => ({ error: String(e).slice(0, 200) }));
await browser.close();

/* ══ THE READING OF THE RECORD ══════════════════════════ */
const withFrames = rec.ticks.filter(tk => tk.frames.length > 0);
const frameNo = (f) => Number(/bramble-(\d+)(?:-[^/]*)?\.png/.exec(f)?.[1] ?? NaN);
console.log(`distinct hrefs in order: ${[...new Set(rec.ticks.flatMap(tk => tk.frames))].join(" | ") || "none"}`);
const sequence = [];
for (const tk of withFrames) {
  const f = (tk.nodeFrames && tk.nodeFrames[0]) ?? tk.frames[0];
  if (f && sequence[sequence.length - 1] !== f) sequence.push(f);
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
  heldLongEnough && !!lastTick && lastTick.nodeFrames.length === 3 && lastTick.nodeFrames.every(f => f.includes("bramble-32")),
  `last node frames: ${lastTick ? lastTick.nodeFrames.join(",") : "none"}; hold witnessed: ${heldLongEnough}`);
ok("§D2 the motes stand drawn at the fringe — nine of them, small, holding the flipbook's young frame (frame 8) beside their parent thickets",
  heldLongEnough && !!lastTick && lastTick.moteFrames.length === 9 && lastTick.moteFrames.every(f => f.includes("bramble-08")),
  `last mote frames: ${lastTick ? lastTick.moteFrames.join(",") : "none"}`);

const eFrames = eScan?.frames ?? {};
const eNames = Object.keys(eFrames);
const eStrayTotal = eNames.reduce((s, k) => s + (eFrames[k].stray ?? 0), 0);
const eMissing = eNames.filter(k => eFrames[k].missing);
console.log(`§E scanned ${eNames.length} drawn frame bitmaps in the page; stray opaque px total: ${eStrayTotal}; motes in the floated field: ${eScan?.motes}; ${eScan?.error ?? ""}`);
ok("§E1 every frame bitmap the page drew is one connected thicket — no opaque pixel stands free of the mass (the detached spore dots are gone from the drawn art)",
  !eScan?.error && eNames.length >= 5 && eMissing.length === 0 && eStrayTotal === 0,
  `frames scanned: ${eNames.length}, missing: ${eMissing.join(",")}, stray: ${eStrayTotal}, error: ${eScan?.error ?? "none"}`);
const eDrawn = eNames.map(k => eFrames[k]).filter(f => !f.missing);
const eDeepest = eDrawn.length ? Math.max(...eDrawn.map(f => f.bottomRow)) : -1;
const eCanvasH = eDrawn[0]?.h ?? 0;
ok("§E2 the crop's base stands at the canvas's own bottom — the deepest drawn frame's lowest kept row (any alpha, the base the seating was derived from) reaches the canvas's last rows; individual frames sit on that shared base line, shallower as their own mass is",
  eDrawn.length >= 5 && eDeepest >= eCanvasH - 3,
  `deepest kept row: ${eDeepest} of canvas height ${eCanvasH}`);
ok("§E3 on the rendered map, the field where the dots floated — the first binding's box around the topmost node, outside every drawn image — holds no bright-green mote",
  !eScan?.error && eScan?.motes === 0,
  `motes: ${eScan?.motes} at ${JSON.stringify(eScan?.moteAt)}`);

console.log(`\nBRAMBLE FACE DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
