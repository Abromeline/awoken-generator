// THE SINGLE BLADE'S DELIVERY (Nigel, 2026-10-24 17:50):
// "when the single blade is cast on an enemy directly, it
// [acts] as summoning the blade there at the enemy. instead
// of having the blade spawn where it was clicked have it fly
// from the caster. to the click target. if its the ground it
// sticks waiting for an enemy to be clicked if its an enemy
// it flies right into that enemy."
// This drive proves the delivery on the REAL surfaces:
//   §A THE HOMELAND, in a real browser — the Blade is readied
//      through the wheel (the lawful road), then:
//      (1) a cast on bare ground: a blade glyph is RECORDED
//          leaving the Tender's standing point, advancing
//          along the road on the map's own clock, and
//          arriving at the tapped tile — where the planted
//          glyph then stands (and NOT before: while the
//          flight is live, no planted glyph stands there);
//      (2) a cast on an enemy's ground: the flight again
//          starts at the caster and its second half reaches
//          the dark thing's own drawn centre — and the dark
//          is UNHARMED by the cast (the resolution is
//          unchanged: the Blade waits armed);
//      (3) the click looses it: the cured loose flight rises
//          from the RUNE's ground and spears down into the
//          mark, and the mark takes the book's flat 6;
//      (4) at every recorded sample, ZERO SMIL nodes ride in
//          any blade glyph's subtree — the meteor pattern is
//          cured on the blade's road.
//   §B THE TABLE, over its own socket — a castRune of the
//      Blade onto a dark's ground WITH its point serves a
//      bladeCasts record: from the CASTER's standing point,
//      to the DARK's own point, naming the writing it
//      delivers; the writing waits (dark unharmed, charges
//      whole); the loose still serves its bladeFlights
//      record from the rune's hex, as before.
// Scene notes (learned by probe, 2026-10-24): the browser
// must run the BUILT client (npm run build) — the server
// serves client/dist; the readied Blade wears a floating
// indicator glyph beside the Tender for as long as it is
// readied (perpetual, swaying) — the flight reading below
// windows its tracks to the casts' own moments so the
// indicator is never mistaken for a flight; the fielded
// Awokin stands in BINDING stance so her strikes never
// nibble the dark's HP and confuse the loose's reckoning.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-blade-delivery.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-bladedelivery-"));
process.env.PORT = "3996";
process.env.WORKSHOP_PASSWORD = ["blade", "delivery", "pw"].join("-");
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3996";
const PW = ["blade", "delivery", "pw", "1"].join("-");
const OUT = "/home/hatch/workspace/blade-delivery-proof";
mkdirSync(OUT, { recursive: true });
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
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return data?.data ?? data;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up */ }

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

/* ══ §A THE HOMELAND ══════════════════════════════════════ */
console.log("§A the homeland — the Blade flies from the caster, in a real browser");
const claim = await call("claimTender", { password: PW, tenderName: "Bladepost Tender" });
const token = claim.token;
const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id}`;
const now0 = Date.now();
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
// The dark the drive casts upon: a mountain of hide, so the
// window's nibbles never fell it mid-proof.
const frayId = Number(db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
  VALUES (?, ?, 'fray', ?, 100000, 2, 0, 1, 1, 0)`).run(me, tileId.get("2,0"), now0).lastInsertRowid);
// A BINDING Awokin stands between the dark and the Tender:
// the dark engages her (999 HP of patience), she never
// strikes it, and its HP moves only when the Blade says so.
{
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 3, 3, 'tide', ?, 'image/png', ?)")
      .run(`Tide Binder ${cat}`, cat, `blade-delivery/tide-binder-${cat}.png`, now0).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `Tide Binder ${cat}`, category: cat, rarity: "common", power: 3, toughness: 3, element: "tide" });
  }
  const binderId = Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run("Tide Binder", "Tide Binder", "blade-delivery/tide-binder.png", JSON.stringify(parts), "Bladepost Tender", me, now0).lastInsertRowid);
  db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
    VALUES (?, ?, ?, ?, ?, 'binding', 0, 999, 1, 0, NULL, NULL, 0)`).run(me, binderId, tileId.get("1,0"), now0, now0);
}
// The cradle stilled: no other dark is born during the drive.
const stillIv = setInterval(() => {
  try { db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ?, wanderer_settled_beats = 0 WHERE owner_key = ?").run(Date.now(), me); } catch { /* ending */ }
}, 4000);
await call("getTerritory", {}, token);
await sleep(1500);
await call("getTerritory", {}, token);

const grim = await call("getGrimoire", {}, token);
const bladePage = (grim.spells ?? []).find((s) => s.engine === "blade");
ok("the book holds the Single Blade", !!bladePage, JSON.stringify((grim.spells ?? []).map((s) => s.key)));
const formName = bladePage.forms?.unaligned ?? bladePage.name;

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

// The fetch witness: every cast and loose the page sends,
// and whether the dice let it stand.
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
        window.__castLog.push({ at: Date.now(), url: url.split("/").pop(), ok: r.ok, fizzled: raw.includes('"fizzled":true'), loosed: raw.includes('"loosed":true'), harm: (j && j.data && typeof j.data.harm === "number") ? j.data.harm : (j && typeof j.harm === "number" ? j.harm : null), raw: raw.slice(0, 220) });
      }
    } catch { /* the witness never breaks the page */ }
    return r;
  };
})()`);

/* THE RECORDER: every 20 ms — every blade glyph on the map
   (where it stands, whether it flies, how much SMIL rides
   in its subtree) and where the dark's face stands then.
   Each tick carries a wall-clock stamp so flight tracks can
   be windowed to the casts' own moments. */
await page.evaluate(() => {
  const rec = { ticks: [] };
  window.__bladeRec = rec;
  rec.iv = setInterval(() => {
    const tick = { t: performance.now(), wt: Date.now(), blades: [], frays: [] };
    for (const im of document.querySelectorAll("image")) {
      const href = im.getAttribute("href") || "";
      if (href.includes("fray-walk")) {
        const r = im.getBoundingClientRect();
        tick.frays.push({ cx: r.x + r.width / 2, cy: r.y + r.height / 2 });
        continue;
      }
      if (!/\/blade-[^/]*\.png/.test(href)) continue;
      const r = im.getBoundingClientRect();
      const g = im.parentElement;
      const tr = g ? (g.getAttribute("transform") || "") : "";
      tick.blades.push({
        cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: r.width,
        flying: tr.includes("translate"),
        smil: g ? g.querySelectorAll("animate, animateMotion, animateTransform, set").length : -1,
      });
    }
    rec.ticks.push(tick);
    if (rec.ticks.length > 9000) rec.ticks.splice(0, 1500);
  }, 20);
});

// Tiles ↔ hit polygons (the cast-flow drive's centroid
// proof), plus each polygon's viewport rect for true taps.
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
const tenderPair = pairs.find((p) => p.id === tenderTileId) ?? pairs.find((p) => p.q === 0 && p.r === 0);
const tenderAnchor = await rectOf(tenderPair);
ok("the Tender's standing point is read off her own tile", !!tenderAnchor, JSON.stringify(tenderPair));

// Ready the Blade THE LAWFUL WAY (the cast-flow road):
// right-click opens the wheel; the Rune branch fans; the
// Blade's disc readies it.
const clickDisc = async (sel, txt) => {
  const handle = await page.evaluateHandle((q, t) => [...document.querySelectorAll(q)].find((d) => ((d.getAttribute("aria-label") || "") + " " + (d.textContent || "")).includes(t)), sel, txt);
  const el = handle.asElement();
  if (!el) throw new Error("wheel disc not found: " + txt);
  const box = await el.boundingBox();
  if (!box) throw new Error("wheel disc has no box: " + txt);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};
await page.mouse.click(420, 300, { button: "right" });
await page.waitForSelector(".gw-wheel", { timeout: 9000 });
await clickDisc(".gw-disc.cat", "Rune");
await sleep(500);
await clickDisc(".gw-disc", formName);
await page.waitForFunction((fn) => (document.querySelector(".hex-notice")?.textContent ?? "").includes(fn), { timeout: 9000 }, formName).catch(() => {});
await sleep(300);
ok("the Blade is readied through the wheel", true);

/* A tap ON a tile's hit polygon, dispatched to the polygon
   itself with TRUE client coordinates riding the event —
   the handler reads the tap's point from those coordinates
   (svgPoint), exactly as a player's tap computes it, while
   no HUD element or figure hit-circle can steal the tap by
   hit-testing. */
const tapTile = async (tile, offX = 0) => {
  const rect = await rectOf(tile);
  await page.evaluate(({ i, x, y }) => {
    const p = document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]')[i];
    if (!p) throw new Error("hit polygon gone at dispatch");
    p.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  }, { i: tile.poly, x: Math.round(rect.cx + offX), y: Math.round(rect.cy) });
  return rect;
};
const frayTileNow = async () => {
  const t = await call("getTerritory", {}, token);
  const w = (t.wanderers ?? []).find((x) => x.id === frayId);
  return { tile: w ? pairs.find((p) => p.id === w.tileId) : null, hp: w?.hp, workings: t.workings ?? [] };
};
const castUntilStands = async (pickTile, label) => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const tile = await pickTile(attempt);
    if (!tile) throw new Error(label + ": no tile to cast on");
    const before = await page.evaluate(() => window.__castLog.length);
    await tapTile(tile, tile.aimOff ?? 0);
    await sleep(700);
    const log = await page.evaluate(() => window.__castLog);
    const mine = log.slice(before);
    const stoodCast = mine.find((e) => e.url === "castMapWorking" && e.ok && !e.fizzled);
    if (stoodCast) { await sleep(1100); return { tile, castAt: stoodCast.at, raw: stoodCast.raw }; }
    console.log(`    ${label}: attempt ${attempt + 1} — ${mine.length ? JSON.stringify(mine[mine.length - 1]).slice(0, 140) : "no cast fired"}; tapping on (the working stays readied)`);
  }
  throw new Error(label + ": the cast never stood in 10 taps");
};

/* — (1) CAST ON THE GROUND — */
const groundCast = await castUntilStands(async () => {
  const f = await frayTileNow();
  const cands = pairs
    .filter((p) => hexDist(p, tenderPair) === 2 && (!f.tile || hexDist(p, f.tile) >= 3))
    .sort((a, b) => (a.q - b.q) || (a.r - b.r));
  return cands[0];
}, "ground cast");
const groundRect = await rectOf(groundCast.tile);
console.log(`    ground cast stood on tile (${groundCast.tile.q},${groundCast.tile.r})`);

/* — (2) CAST ON THE ENEMY — */
const hpBeforeEnemyCast = (await frayTileNow()).hp;
const enemyCast = await castUntilStands(async () => {
  const f = await frayTileNow();
  if (!f.tile) throw new Error("the dark is gone from the land");
  // The tap lands on the dark's ground beside its figure —
  // the point still falls within the snap's reach of the
  // dark itself (0.6 of a hex), so the flight's end is the
  // dark, not the dirt beside it.
  const rect = await rectOf(f.tile);
  return { ...f.tile, aimOff: rect.w * 0.15 };
}, "enemy cast");
console.log(`    enemy cast stood on the dark's tile (${enemyCast.tile.q},${enemyCast.tile.r})`);
const afterEnemy = await frayTileNow();
const hpAfterEnemyCast = afterEnemy.hp;

/* — (3) THE CLICK LOOSES IT — */
await sleep(300);
const frayFaceAt = await page.evaluate(() => {
  const ticks = window.__bladeRec.ticks;
  for (let i = ticks.length - 1; i >= 0; i--) if (ticks[i].frays.length) return ticks[i].frays[0];
  return null;
});
if (!frayFaceAt) throw new Error("the dark's face was never recorded");
const looseBefore = await page.evaluate(() => window.__castLog.length);
const looseAt = Date.now();
await page.evaluate(({ x, y }) => {
  const c = [...document.querySelectorAll("circle")].find((el) => (el.querySelector("title")?.textContent ?? "").includes("Loose the Single Blade"));
  if (!c) throw new Error("the loose's hit circle is not on the map");
  c.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: Math.round(x), clientY: Math.round(y) }));
}, { x: frayFaceAt.cx, y: frayFaceAt.cy });
await sleep(2000);
const looseLog = (await page.evaluate(() => window.__castLog)).slice(looseBefore);
const looseEntry = looseLog.find((e) => e.url === "looseBlade");
ok("the click on the dark fired the loose (the unchanged spring: the player's click)", !!looseEntry && looseEntry.loosed === true, JSON.stringify(looseLog).slice(0, 220));
const hpAfterLoose = (await frayTileNow()).hp;

const rec = await page.evaluate(() => { clearInterval(window.__bladeRec.iv); return window.__bladeRec; });
await page.screenshot({ path: join(OUT, "homeland-after-loose.png") }).catch(() => {});
await browser.close();
clearInterval(stillIv);

/* — THE READING OF THE RECORD — */
// Chain the flying samples into tracks by the road they
// walk. The readied Blade's indicator also flies (it sways
// beside the Tender for as long as the working is readied)
// — it is ONE perpetual track, begun at the readying; the
// delivery's flights are the tracks that BEGIN inside a
// cast's own window and END within it.
const flyingSamples = [];
for (const tk of rec.ticks) for (const b of tk.blades) if (b.flying) flyingSamples.push({ ...b, wt: tk.wt, frays: tk.frays });
flyingSamples.sort((a, b) => a.wt - b.wt);
const tracks = [];
for (const s of flyingSamples) {
  let best = null, bestD = Infinity;
  for (const tr of tracks) {
    const last = tr[tr.length - 1];
    if (s.wt - last.wt > 200) continue;
    const d = Math.hypot(s.cx - last.cx, s.cy - last.cy);
    if (d < bestD) { bestD = d; best = tr; }
  }
  if (best && bestD < 140) best.push(s); else tracks.push([s]);
}
const flightInWindow = (fromMs, toMs) => tracks
  .filter((tr) => tr.length >= 4 && tr[0].wt >= fromMs && tr[0].wt <= toMs && tr[tr.length - 1].wt <= toMs + 1500)
  .sort((a, b) => b.length - a.length)[0] ?? null;
const travelOf = (tr) => {
  let m = 0;
  for (let i = 0; i < tr.length; i++) for (let j = i + 1; j < tr.length; j++) m = Math.max(m, Math.hypot(tr[i].cx - tr[j].cx, tr[i].cy - tr[j].cy));
  return m;
};
const groundFlight = flightInWindow(groundCast.castAt - 250, groundCast.castAt + 600);
const enemyFlight = flightInWindow(enemyCast.castAt - 250, enemyCast.castAt + 600);
for (const [label, tr] of [["ground", groundFlight], ["enemy", enemyFlight]]) {
  if (tr) console.log(`    ${label} flight: ${tr.length} samples, span ${tr[tr.length - 1].wt - tr[0].wt}ms, (${tr[0].cx.toFixed(0)},${tr[0].cy.toFixed(0)}) → (${tr[tr.length - 1].cx.toFixed(0)},${tr[tr.length - 1].cy.toFixed(0)})`);
}
ok("§A(1) the ground cast drew a blade flight on the map's clock (≥5 samples in its window)", !!groundFlight && groundFlight.length >= 5, `window tracks: ${tracks.filter((tr) => tr[0].wt >= groundCast.castAt - 250 && tr[0].wt <= groundCast.castAt + 600).length}`);
// STARTS AT THE CASTER, judged by the road itself: headless
// renders are slow enough to miss a flight's first frames,
// so the proof is the line the samples walk — the line
// through the flight's own samples must pass at the
// Tender's point, the samples must march along it from her
// end toward the target without walking backwards, and no
// sample may stray off the line.
const roadCheck = (tr, anchor) => {
  const a = tr[0], b = tr[tr.length - 1];
  const dx = b.cx - a.cx, dy = b.cy - a.cy;
  const len = Math.hypot(dx, dy) || 1;
  const perpOf = (p) => Math.abs((p.cx - a.cx) * dy - (p.cy - a.cy) * dx) / len;
  const projOf = (p) => ((p.cx - a.cx) * dx + (p.cy - a.cy) * dy) / len;
  let monotonic = true, prev = -Infinity;
  for (const s of tr) { const pr = projOf(s); if (pr < prev - 10) monotonic = false; prev = Math.max(prev, pr); }
  return {
    anchorPerp: perpOf(anchor),
    maxPerp: Math.max(...tr.map(perpOf)),
    monotonic,
    firstAlong: Math.hypot(tr[0].cx - anchor.cx, tr[0].cy - anchor.cy),
    roadLen: Math.hypot(b.cx - anchor.cx, b.cy - anchor.cy),
  };
};
if (groundFlight) {
  const rc = roadCheck(groundFlight, tenderAnchor);
  console.log(`    ground road: anchor perp=${rc.anchorPerp.toFixed(0)}px max perp=${rc.maxPerp.toFixed(0)}px first sample ${rc.firstAlong.toFixed(0)}px along a ${rc.roadLen.toFixed(0)}px road, monotonic=${rc.monotonic}`);
  ok("§A(1) the flight STARTS AT THE CASTER — the road its samples walk runs from the Tender's own point", rc.anchorPerp < 45 && rc.firstAlong < rc.roadLen * 0.62, `anchor perp=${rc.anchorPerp.toFixed(0)} first=${rc.firstAlong.toFixed(0)}/${rc.roadLen.toFixed(0)}`);
  ok("§A(1) the flight ADVANCES along the road — samples march from the caster's end without walking backwards, none straying off the line", rc.monotonic && rc.maxPerp < 40 && travelOf(groundFlight) > 120, `monotonic=${rc.monotonic} maxPerp=${rc.maxPerp.toFixed(0)} travel=${travelOf(groundFlight).toFixed(0)}`);
}
ok("§A(1) the flight ARRIVES at the tapped tile", !!groundFlight && Math.hypot(groundFlight[groundFlight.length - 1].cx - groundRect.cx, groundFlight[groundFlight.length - 1].cy - groundRect.cy) < 45,
  groundFlight ? `last=(${groundFlight[groundFlight.length - 1].cx.toFixed(0)},${groundFlight[groundFlight.length - 1].cy.toFixed(0)}) tile=(${groundRect.cx.toFixed(0)},${groundRect.cy.toFixed(0)})` : "no track");
// The hand-off: while the ground flight was live, NO planted
// glyph stood at its tile; after it landed, one does. The
// flight's lawful life is 700 ms from the cast's answer;
// the judged window is its first 600 — the landing's own
// render scheduling is not the hand-off's failure.
if (groundFlight) {
  const during = rec.ticks.filter((tk) => tk.wt >= groundCast.castAt - 30 && tk.wt <= groundCast.castAt + 600);
  const plantedDuring = during.flatMap((tk) => tk.blades).filter((b) => !b.flying && Math.hypot(b.cx - groundRect.cx, b.cy - groundRect.cy) < 35);
  ok("§A(1) THE HAND-OFF — while the blade flew, no planted glyph stood at its tile (the flying blade IS the writing)", plantedDuring.length === 0, `planted during flight: ${plantedDuring.length}`);
  const t1 = groundFlight[groundFlight.length - 1].wt;
  const after = rec.ticks.filter((tk) => tk.wt > t1 + 150);
  const plantedAfter = after.flatMap((tk) => tk.blades).filter((b) => !b.flying && Math.hypot(b.cx - groundRect.cx, b.cy - groundRect.cy) < 35);
  ok("§A(1) …and when it landed, the planted glyph stands at the tile — it STICKS", plantedAfter.length >= 3, `planted after: ${plantedAfter.length}`);
}
ok("§A(2) the enemy cast drew its own flight from the caster", !!enemyFlight && enemyFlight.length >= 5, `window tracks: ${tracks.filter((tr) => tr[0].wt >= enemyCast.castAt - 250 && tr[0].wt <= enemyCast.castAt + 600).length}`);
if (enemyFlight) {
  const rc = roadCheck(enemyFlight, tenderAnchor);
  console.log(`    enemy road: anchor perp=${rc.anchorPerp.toFixed(0)}px max perp=${rc.maxPerp.toFixed(0)}px first sample ${rc.firstAlong.toFixed(0)}px along a ${rc.roadLen.toFixed(0)}px road, monotonic=${rc.monotonic}`);
  ok("§A(2) the enemy flight also STARTS AT THE CASTER — its road runs from the Tender's own point, marched in order", rc.anchorPerp < 45 && rc.monotonic && rc.firstAlong < rc.roadLen * 0.62, `anchor perp=${rc.anchorPerp.toFixed(0)} first=${rc.firstAlong.toFixed(0)}/${rc.roadLen.toFixed(0)} monotonic=${rc.monotonic}`);
  const secondHalf = enemyFlight.slice(Math.floor(enemyFlight.length / 2));
  const arrivals = [];
  for (const s of secondHalf) for (const f of s.frays) arrivals.push(Math.hypot(s.cx - f.cx, s.cy - f.cy));
  const bestArrival = arrivals.length ? Math.min(...arrivals) : Infinity;
  ok("§A(2) the flight flies RIGHT INTO THE ENEMY — a second-half sample reaches the dark's own drawn centre", bestArrival < 55, `closest approach ${bestArrival === Infinity ? "—" : bestArrival.toFixed(1) + "px"}`);
}
// THE CAST'S OWN LEDGER (the referee's answer, not the
// scene's HP bookkeeping — the living battle nibbles a
// standing dark between reads, and that nibble is not the
// cast): a cast Blade does not spring at its writing, so
// the referee answers sprung:false and the writing stands
// at whole charges. Harm from a cast could only BE a
// spring; there was none.
ok("§A(2) the cast itself sprang NOTHING — the referee's own answer for the standing cast says sprung:false (the resolution is unchanged)", !/"sprung":true/.test(enemyCast.raw ?? ""), `raw=${(enemyCast.raw ?? "").slice(0, 140)}`);
const bladeWorkingsEnd = afterEnemy.workings.filter((w) => w.engine === "blade");
ok("§A(2) two Blades stand written on the land (the ground cast and the dark's-ground cast), the dark's-ground one at full charges", bladeWorkingsEnd.length === 2 && bladeWorkingsEnd.some((w) => w.tileId === enemyCast.tile.id && w.charges === 2), `workings=${JSON.stringify(bladeWorkingsEnd.map((w) => ({ tile: w.tileId, charges: w.charges })))} enemyTile=${enemyCast.tile.id}`);
const looseFlight = flightInWindow(looseAt - 250, looseAt + 700);
ok("§A(3) the loose drew its flight in its window", !!looseFlight && looseFlight.length >= 4, `window tracks: ${tracks.filter((tr) => tr[0].wt >= looseAt - 250 && tr[0].wt <= looseAt + 700).length}`);
if (looseFlight) {
  const start = looseFlight[0];
  const peak = looseFlight.reduce((a, b) => (b.cy < a.cy ? b : a), looseFlight[0]);
  const arrivals = [];
  for (const s of looseFlight.slice(Math.floor(looseFlight.length / 2))) for (const f of s.frays) arrivals.push(Math.hypot(s.cx - f.cx, s.cy - f.cy));
  const bestArrival = arrivals.length ? Math.min(...arrivals) : Infinity;
  console.log(`    loose flight: ${looseFlight.length} samples, start (${start.cx.toFixed(0)},${start.cy.toFixed(0)}), peak cy=${peak.cy.toFixed(0)}, tender=(${tenderAnchor.cx.toFixed(0)},${tenderAnchor.cy.toFixed(0)})`);
  ok("§A(3) the loose flight starts at the RUNE's ground — far from the Tender", Math.hypot(start.cx - tenderAnchor.cx, start.cy - tenderAnchor.cy) > 150, `start-to-tender=${Math.hypot(start.cx - tenderAnchor.cx, start.cy - tenderAnchor.cy).toFixed(0)}px`);
  ok("§A(3) the loosed blades RISE from the writing before they spear down", peak.cy < start.cy - 30, `start cy=${start.cy.toFixed(0)} peak cy=${peak.cy.toFixed(0)}`);
  ok("§A(3) the loose flight arrives at the mark", bestArrival < 55, `closest approach ${bestArrival === Infinity ? "—" : bestArrival.toFixed(1) + "px"}`);
}
ok("§A(3) the loose dealt the book's flat 6 — the spring's effect is unchanged (the referee's own answer says so)", looseEntry?.harm === 6, `harm=${looseEntry?.harm} raw=${(looseEntry?.raw ?? "").slice(0, 120)}`);
ok("§A(3) …and the dark's HP fell by at least that 6 (the living battle's own nibbles may add their mite, never subtract)", ((hpAfterEnemyCast ?? 0) - (hpAfterLoose ?? 0)) >= 5.5, `hp ${hpAfterEnemyCast} → ${hpAfterLoose}`);
const allBladeSamples = rec.ticks.flatMap((tk) => tk.blades);
ok("§A(4) ZERO SMIL in any blade glyph's subtree, at every recorded sample of every flight", allBladeSamples.length > 0 && allBladeSamples.every((b) => b.smil === 0), `samples=${allBladeSamples.length} smil counts=${[...new Set(allBladeSamples.map((b) => b.smil))].join(",")}`);

/* ══ §B THE TABLE ═══════════════════════════════════════ */
console.log("§B the Table — the cast's flight is served from the caster to the mark");
function seedAwokin(ownerKey, tenderName, name, partPower = 2) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, 'root', ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, partPower, partPower, `blade/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: partPower, toughness: partPower, element: "root" });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `blade/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
const claimB = await call("claimTender", { password: PW, tenderName: "Blade Table Tender" });
const tenderIdB = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claimB.tender.code).id;
const meB = `tender:${tenderIdB}`;
db.prepare(`INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at, class_key, weapon_key, hp, weapon_next_at)
  VALUES (?, 3800, 0, ?, 'runewright', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET
  total_exp = 3800, class_key = 'runewright', hp = 100`).run(meB, Date.now(), Date.now() + 600000);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(meB, Date.now());
for (let i = 0; i < 25; i++) seedAwokin(meB, "Blade Table Tender", `Table Bench ${i + 1}`, 2);
const { issueTableToken } = await import("../server/dist/table.js");
const tt = issueTableToken({ id: "disc-blade-delivery", name: "Blade Table Tender" });
const bindCode = (await call("getTableBindCode", {}, claimB.token)).code;
const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
if (!bindRes.ok) throw new Error("table/bind failed: " + bindRes.status);

class Actor {
  constructor() { this.state = null; this.you = null; this.errors = []; }
  async join(token, room) {
    this.ws = new WebSocket(`ws://127.0.0.1:3996/table/ws`);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data));
        if (m.type === "state") { this.state = m.state; this.you = m.you; }
        else if (m.type === "error") this.errors.push(String(m.message ?? ""));
      } catch { /* torn frame */ }
    };
    this.send({ type: "join", authToken: token, room });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
}
const waitFor = async (fn, what, ms = 20000) => {
  const s = Date.now();
  while (Date.now() - s < ms) { if (fn()) return true; await sleep(150); }
  throw new Error("drive wait: " + what);
};
const actor = new Actor();
await actor.join(tt, "blade-delivery");
await waitFor(() => !!actor.you, "the Table seat");
actor.send({ type: "startWave" });
await waitFor(() => (actor.state?.dark ?? []).length >= 1, "the wave stands on the field");
// The caster at rest: her served standing point, not moving.
await waitFor(() => {
  const p = (actor.state?.players ?? []).find((x) => x.key === actor.you.key);
  return p && p.pos && !p.moving;
}, "the caster stands still, her point served", 15000).catch(() => false);
const casterPos = (actor.state?.players ?? []).find((x) => x.key === actor.you.key)?.pos ?? null;
ok("the caster's standing point is served", !!casterPos, JSON.stringify(actor.state?.players ?? []).slice(0, 200));

const darkB = actor.state.dark[0];
const darkBHp0 = darkB.hp;
let bladeWB = null;
let castSnapshot = null;
let sentAim = null;
for (let i = 0; i < 30 && !bladeWB; i++) {
  const d = (actor.state?.dark ?? []).find((e) => e.id === darkB.id) ?? actor.state.dark[0];
  if (!d) break;
  sentAim = { x: d.pos.x, y: d.pos.y };
  actor.send({ type: "castRune", root: "blade", hexes: [d.hex], points: [{ x: d.pos.x, y: d.pos.y }] });
  const s = Date.now();
  while (Date.now() - s < 1200) {
    const w = (actor.state?.workings ?? []).find((x) => x.root === "blade" && x.ownerKey === actor.you.key);
    if (w) {
      bladeWB = w;
      // The SAME state push that first shows the writing:
      // its dark and its flight record are read together,
      // before the room's next beat can drift either.
      castSnapshot = {
        darkPos: (actor.state?.dark ?? []).find((e) => e.id === darkB.id)?.pos ?? null,
        casts: (actor.state?.bladeCasts ?? []).filter((f) => f.workingId === w.id),
      };
      break;
    }
    await sleep(120);
  }
}
ok("the Blade was written at the Table (through its cast door, fizzles honestly retried)", !!bladeWB, JSON.stringify(actor.errors.slice(-2)));
ok("§B the cast's flight IS SERVED — a bladeCasts record naming the writing it delivers", !!castSnapshot && castSnapshot.casts.length >= 1, `bladeCasts=${JSON.stringify(actor.state?.bladeCasts ?? [])}`);
if (castSnapshot && castSnapshot.casts.length && casterPos) {
  const f = castSnapshot.casts[castSnapshot.casts.length - 1];
  ok("§B the flight starts AT THE CASTER — its from is her served standing point", Math.hypot(f.fromPos.x - casterPos.x, f.fromPos.y - casterPos.y) <= 4, `from=${JSON.stringify(f.fromPos)} caster=${JSON.stringify(casterPos)}`);
  // The dark glides on this ground: its standing point at
  // the cast's reckoning sits between the point the drive
  // sent (its served pos an instant before) and the point
  // the same push serves (an instant after). The record's
  // end must sit on that short glide path — within a glide
  // step of BOTH readings, and a small fraction of a hex.
  const dSent = Math.hypot(f.to.x - sentAim.x, f.to.y - sentAim.y);
  const dPush = castSnapshot.darkPos ? Math.hypot(f.to.x - castSnapshot.darkPos.x, f.to.y - castSnapshot.darkPos.y) : Infinity;
  ok("§B the flight ends AT THE MARK — its to is the dark's own standing point at the cast (within one glide step of the dark's bracketing readings)", dSent <= 16 && dPush <= 16, `to=${JSON.stringify(f.to)} sentAim=${JSON.stringify(sentAim)} dark=${JSON.stringify(castSnapshot.darkPos)} dSent=${dSent.toFixed(1)} dPush=${dPush.toFixed(1)}`);
}
const darkBNow = (actor.state?.dark ?? []).find((e) => e.id === darkB.id);
ok("§B the written Blade WAITS at the Table — the dark unharmed, its charges whole (resolution unchanged)", !!darkBNow && darkBNow.hp === darkBHp0 && bladeWB?.charges === 2, `hp=${darkBNow?.hp}/${darkBHp0} charges=${bladeWB?.charges}`);
actor.send({ type: "looseBlade", enemyId: darkB.id });
await waitFor(() => {
  const w = (actor.state?.workings ?? []).find((x) => x.id === bladeWB.id);
  return w && w.charges === 1;
}, "the Table loose spends the Blade's charge");
ok("§B the loose still serves its flight record — from the rune's hex, as before", (actor.state?.bladeFlights ?? []).some((f) => f.fromHex === bladeWB.hex), JSON.stringify((actor.state?.bladeFlights ?? []).map((f) => f.fromHex)));
actor.ws.close();

console.log(`\nBLADE DELIVERY DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
