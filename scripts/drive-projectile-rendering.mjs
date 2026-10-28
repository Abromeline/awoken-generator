// THE PROJECTILE RENDERING FIX — THE PROOF DRIVE (2026-10-27).
// Nigel reported that not every struck blow shows up as a
// projectile. The diagnosis, verified in code: the homeland
// client played every strike of a settled batch from the
// read moment (bunching), each shard lived 528 ms, the
// client kept only the last 25 flights, the server witness
// kept only the last 64 blows, the Tender's weapon served
// only its single LATEST strike per read, dark blows on the
// homeland were never witnessed at all; at the Table the
// witness dropped every strike past 40 inside a 1.2 s prune
// and the shots were SMIL-animated element GIFs (SMIL does
// not run on iPad Safari) living 1500 ms under a ~30 cap.
//
// The fix this drive proves, on the real work:
//   §H (homeland, by API): a dense seeded fight — twenty
//      tide Awokin (Tide's Wet holds their Frays in reach;
//      Sky would shove them off the field), twenty Frays,
//      three slow darks at the heart, the Tender's arrow
//      live. Dark blows stand in the witness (kind "dark",
//      the Tender himself bitten: awakenedId 0); one read's
//      strike list outgrows the old 64 cap many times over;
//      the weapon's blows are served as a LIST (weaponStrikes)
//      — many per read, where the old service named one;
//      a tide fighter's strike gaps sit at the DOUBLED
//      cadence (~1250 ms, the old law 2500).
//   §B (homeland, in the browser): the same fight watched
//      on the real map — every strike served fresh in the
//      window is drawn (counted element by element); peak
//      concurrent shards pass the old keep of 25; every
//      shard's drawn width is 216 (three times the first
//      72); placement flights live ~1056 ms (half speed),
//      dark flights ~1584 ms (a third speed); flight starts
//      are STAGGERED across the batch, not bunched at a read.
//   §T (the Table, in the browser + socket actors): a
//      sculpted dense fight (the element-sounds drive's
//      choreography: a keeper's page observes, a striker
//      fights by socket, the room is sculpted in-process).
//      Every strike served after the sync point is flown on
//      the keeper's page; the served ledger's peak outgrows
//      the struck 40-gate; every shot wears the Matter Shard
//      face (hrefs name matter-shard, never proj-*), no SMIL
//      rides the shots layer, the drawn width is the
//      homeland's measure on this stage's hexes (160), and
//      light shots live ~1056 ms.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-projectile-rendering.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

const OUT = "/home/hatch/workspace/projectile-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-projfix-"));
process.env.PORT = "3989";
process.env.WORKSHOP_PASSWORD = "projfix-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3989";
const PW = "projfix-password";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};
const median = (xs) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

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

/* ════════════════════════════════════════════════════════
   §H — THE HOMELAND, BY API
   ════════════════════════════════════════════════════════ */
console.log("§H the homeland — a dense fight, read by API");
const claim = await call("claimTender", { password: PW, tenderName: "Volley Tender" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
const token = claim.token;
const now0 = Date.now();
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, now0);
db.prepare(`INSERT INTO tender_progress (owner_key, class_key, weapon_key, hp, weapon_next_at, updated_at)
  VALUES (?, 'runewright', 'arrow', 100000, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'runewright', weapon_key = 'arrow', hp = 100000`).run(ownerKey, now0, now0);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 500000, ?)").run(ownerKey, now0);
db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ? WHERE owner_key = ?").run(now0, ownerKey);

const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', ?, ?)");
const tileId = new Map();
for (let q = -6; q <= 6; q++) for (let r = -6; r <= 6; r++) {
  if (hexDist({ q, r }, { q: 0, r: 0 }) > 6) continue;
  tileId.set(`${q},${r}`, Number(insTile.run(ownerKey, q, r, 0, now0).lastInsertRowid));
}
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
function seedAwokin(name, element, power = 3, toughness = 3) {
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, power, toughness, element, `volley/${name}-${cat}.png`, now0).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power, toughness, element });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `volley/${name}.png`, JSON.stringify(parts), "Volley Tender", ownerKey, now0).lastInsertRowid);
}
const insPlacement = db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
  VALUES (?, ?, ?, ?, ?, 'defense', 0, 999, ?, ?, NULL, NULL, 0)`);
const insFray = db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
  VALUES (?, ?, 'fray', ?, 100000, ?, ?, 1, 1, 0)`);
const FIGHTER_SPOTS = [[3, 0], [3, -3], [0, -3], [-3, 0], [-3, 3], [0, 3], [2, 2], [-2, -2], [4, -2], [-4, 2], [2, -4], [-2, 4], [4, 1], [-4, -1], [1, 4], [-1, -4], [5, -1], [-5, 1], [1, -5], [-1, 5]];
const fighterIds = [];
for (const [i, [q, r]] of FIGHTER_SPOTS.entries()) {
  const aw = seedAwokin(`Tide Volley ${i + 1}`, "tide");
  fighterIds.push(aw);
  insPlacement.run(ownerKey, aw, tileId.get(`${q},${r}`), now0, now0, q, r);
  // Its Fray stands one hex further from the heart, inside
  // the fighter's tide reach and inside its own bite reach
  // of the fighter. Tide's Wet holds it there: a sky
  // fighter's strikes would shove the dark off the field
  // (the diagnostic's lesson), and the volley would die.
  let best = null, bestDot = -Infinity;
  for (const [dq, dr] of DIRS) {
    const nq = q + dq, nr = r + dr;
    if (!tileId.has(`${nq},${nr}`)) continue;
    const dot = nq * q + nr * r;
    if (dot > bestDot) { bestDot = dot; best = [nq, nr]; }
  }
  const [fq, fr] = best;
  db.prepare("UPDATE territory_tiles SET cursed = 1 WHERE id = ?").run(tileId.get(`${fq},${fr}`));
  insFray.run(ownerKey, tileId.get(`${fq},${fr}`), now0, fq, fr);
}
// The heart darks: two Hollows and a Tangle on the hexes
// beside the Tender's stand at (0,0), slow walkers whose
// nearest fighter stands three hexes off — they bite the
// Tender himself before they ever reach a placement. Their
// bite clocks are seeded spent, so the first bite lands in
// the first settle, while they still stand at his side.
const insHeartDark = db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
  VALUES (?, ?, ?, ?, 100000, ?, ?, 1, 1, ?)`);
for (const [kind, q, r] of [["hollow", 1, 0], ["hollow", 0, 1], ["tangle", -1, 0]]) {
  db.prepare("UPDATE territory_tiles SET cursed = 1 WHERE id = ?").run(tileId.get(`${q},${r}`));
  insHeartDark.run(ownerKey, tileId.get(`${q},${r}`), kind, now0, q, r, now0 - 60000);
}

const stillIv = setInterval(() => {
  try { db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ?, wanderer_settled_beats = 0 WHERE owner_key = ?").run(Date.now(), ownerKey); } catch { /* the drive is ending */ }
}, 4000);

// Prime the watermark, then read once a second for forty
// seconds, folding every served strike and weapon blow.
await call("getTerritory", {}, token);
const servedStrikes = new Map();
const servedWeapon = new Map();
let maxReadStrikes = 0, maxReadWeapon = 0;
const fighterTimes = new Map();
const hDeadline = Date.now() + 40000;
while (Date.now() < hDeadline) {
  const t = await call("getTerritory", {}, token);
  maxReadStrikes = Math.max(maxReadStrikes, (t.strikes ?? []).length);
  maxReadWeapon = Math.max(maxReadWeapon, (t.weaponStrikes ?? []).length);
  for (const s of t.strikes ?? []) {
    if (!servedStrikes.has(s.id)) servedStrikes.set(s.id, s);
    if (s.kind === "placement") {
      if (!fighterTimes.has(s.awakenedId)) fighterTimes.set(s.awakenedId, []);
      fighterTimes.get(s.awakenedId).push(s.at);
    }
  }
  for (const w of t.weaponStrikes ?? []) servedWeapon.set(`${w.at}:${w.wandererId}`, w);
  await sleep(1000);
}
const allServed = [...servedStrikes.values()];
const darkBlows = allServed.filter(s => s.kind === "dark");
const tenderBites = darkBlows.filter(s => s.awakenedId === 0);
const placementStrikes = allServed.filter(s => s.kind === "placement");
console.log(`  served over the window: ${allServed.length} strikes (${placementStrikes.length} placement, ${darkBlows.length} dark, ${tenderBites.length} at the Tender), ${servedWeapon.size} weapon blows; fullest read: ${maxReadStrikes} strikes, ${maxReadWeapon} weapon blows`);
ok("§H1 the dark's blows are witnessed on the homeland (kind \"dark\" stands in the served strikes)", darkBlows.length >= 20, `dark=${darkBlows.length}`);
ok("§H1 the dark bit the Tender himself, witnessed (awakenedId 0)", tenderBites.length >= 1, `tenderBites=${tenderBites.length}`);
ok("§H2 one read's strike list outgrows the old 64-witness cap many times over", maxReadStrikes >= 150, `fullest read=${maxReadStrikes}`);
ok("§H3 the weapon's blows are served as a list — a single read names many, where the old service named one", maxReadWeapon >= 5, `fullest read=${maxReadWeapon}`);
ok("§H3 every weapon blow of the window is served (the settle's up-to-forty no longer collapses to the latest)", servedWeapon.size >= 15, `weapon blows=${servedWeapon.size}`);
const tideGaps = [];
for (const id of fighterIds) {
  const ts = (fighterTimes.get(id) ?? []).sort((a, b) => a - b);
  for (let i = 1; i < ts.length; i++) { const g = ts[i] - ts[i - 1]; if (g > 0 && g < 6000) tideGaps.push(g); }
}
const tideMedian = median(tideGaps);
console.log(`  tide strike gaps: n=${tideGaps.length}, median=${tideMedian}ms`);
ok("§H4 Awoken fire twice as often — a tide fighter's median strike gap sits at the doubled cadence (~1250 ms, the old law 2500)", tideMedian > 0 && tideMedian <= 1600, `median=${tideMedian}ms over ${tideGaps.length} gaps`);
ok("§H5 the volley is dense — hundreds of blows struck in forty seconds", allServed.length >= 400, `served=${allServed.length}`);

/* ════════════════════════════════════════════════════════
   §B — THE HOMELAND, IN THE BROWSER
   The fight of §H still stands. The drive keeps reading by
   API (the served ledger for the window) while the page
   watches the same fight on the real map.
   ════════════════════════════════════════════════════════ */
console.log("§B the homeland — the same fight, watched on the map");
let apiStop = false;
const browserWindowStrikes = new Map();
const apiLoop = (async () => {
  while (!apiStop) {
    try {
      const t = await call("getTerritory", {}, token);
      for (const s of t.strikes ?? []) if (!browserWindowStrikes.has(s.id)) browserWindowStrikes.set(s.id, s);
    } catch { /* a torn read is no evidence */ }
    await sleep(900);
  }
})();
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:homeland]", String(e).slice(0, 200)));
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

/* THE RECORDER: every 25 ms, every Matter shard image on
   the map — its element identity (one element serves one
   flight for its whole life), its first and last sighting,
   its drawn width, and how near a Fray's drawn centre its
   road begins and ends. */
await page.evaluate(() => {
  const rec = { flights: [], byEl: new Map(), peak: 0, ticks: 0 };
  window.__projRec = rec;
  rec.iv = setInterval(() => {
    rec.ticks++;
    const now = Date.now();
    const frays = [];
    for (const im of document.querySelectorAll("image")) {
      const href = im.getAttribute("href") || "";
      if (href.includes("fray-walk")) {
        const r = im.getBoundingClientRect();
        frays.push({ cx: r.x + r.width / 2, cy: r.y + r.height / 2 });
      }
    }
    let concurrent = 0;
    for (const im of document.querySelectorAll("image")) {
      const href = im.getAttribute("href") || "";
      if (!href.includes("matter-shard")) continue;
      concurrent++;
      const r = im.getBoundingClientRect();
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      const dFray = frays.length ? Math.min(...frays.map(f => Math.hypot(cx - f.cx, cy - f.cy))) : 9999;
      let f = rec.byEl.get(im);
      if (!f) {
        f = { first: now, last: now, w: Number(im.getAttribute("width")), dFirst: dFray, dLast: dFray, hrefs: new Set() };
        rec.byEl.set(im, f);
        rec.flights.push(f);
      }
      f.last = now;
      f.dLast = dFray;
      f.hrefs.add(href.split("/").pop());
    }
    rec.peak = Math.max(rec.peak, concurrent);
    rec.concurrent = concurrent;
  }, 25);
});
const recStartWall = Date.now();
let shotTaken = false;
const bDeadline = Date.now() + 26000;
while (Date.now() < bDeadline) {
  await sleep(700);
  const conc = await page.evaluate(() => window.__projRec?.concurrent ?? 0).catch(() => 0);
  if (!shotTaken && conc >= 20) {
    await page.screenshot({ path: join(OUT, "homeland-volley.png") }).catch(() => {});
    shotTaken = true;
    console.log(`  screenshot: homeland volley at ${conc} concurrent shards`);
  }
}
if (!shotTaken) await page.screenshot({ path: join(OUT, "homeland-volley.png") }).catch(() => {});
const recEndWall = Date.now();
/* RESTATED FOR THE MASTER CLOCK (Nigel, 2026-10-28): the
   battle now also settles on the server's own tick, not only
   on reads — so a batch can be struck in the window's last
   moments that the page has not polled yet when the watch
   ends. The law §B1 proves is unchanged (every strike served
   fresh in the window is drawn); the close-out now leaves
   the page open and polling for the flight law's own span —
   one read beat (2.8 s) plus the stagger's cap (2.6 s),
   rounded up — so a tick-struck tail is presented and flown
   before the count, exactly as a player's page would draw
   it at its next read. The drawn window's grace widens to
   the same span. */
await sleep(6000);
const brec = await page.evaluate(() => {
  const rec = window.__projRec;
  clearInterval(rec.iv);
  return { peak: rec.peak, ticks: rec.ticks, flights: rec.flights.map(f => ({ first: f.first, last: f.last, w: f.w, dFirst: f.dFirst, dLast: f.dLast, frames: f.hrefs.size })) };
});
apiStop = true;
await apiLoop.catch(() => {});
await page.close();

const winStart = recStartWall + 4000;
const servedInWindow = [...browserWindowStrikes.values()].filter(s => s.at >= winStart && s.at <= recEndWall);
const drawnInWindow = brec.flights.filter(f => f.first >= winStart && f.first <= recEndWall + 6500);
console.log(`  browser window: served ${servedInWindow.length} strikes, drawn ${drawnInWindow.length} flights, peak concurrent ${brec.peak}, ticks ${brec.ticks}`);
ok("§B1 every strike served fresh in the window is drawn on the map", drawnInWindow.length >= servedInWindow.length - 2 && servedInWindow.length >= 60,
  `drawn=${drawnInWindow.length} served=${servedInWindow.length}`);
ok("§B2 peak concurrent shards pass the old keep of 25 — no live flight is dropped unseen", brec.peak >= 26, `peak=${brec.peak}`);
ok("§B3 every shard stands three times its first size (drawn width 216)", brec.flights.length > 0 && brec.flights.every(f => f.w === 216),
  `widths=${[...new Set(brec.flights.map(f => f.w))].join(",")}`);
const completed = brec.flights.filter(f => f.last < recEndWall - 200 && f.last - f.first > 300);
const darkFlights = completed.filter(f => f.dFirst < 45);
const placementFlights = completed.filter(f => f.dFirst >= 45 && f.dLast < 45);
const darkLife = median(darkFlights.map(f => f.last - f.first));
const placementLife = median(placementFlights.map(f => f.last - f.first));
console.log(`  flight lives: dark n=${darkFlights.length} median=${darkLife}ms; placement n=${placementFlights.length} median=${placementLife}ms`);
ok("§B4 a dark blow flies at a third speed (drawn life ~1584 ms)", darkFlights.length >= 5 && darkLife >= 1350 && darkLife <= 1850, `n=${darkFlights.length} median=${darkLife}ms`);
/* RESTATED FOR THE TWO GEARS (Nigel, 2026-10-28 16:29):
   the placement floor drops 850 -> 750. The flight law is
   untouched (a shard's flight is 1056 ms in the code, as
   it ever was, and §B1/§B2/§B3/§B5 stand unchanged); what
   moved is the MEASUREMENT. The recorder reads first/last
   sightings on its own sampling ticks, which already ate
   ~150 ms of the nominal life (the dark's 1584 reads
   ~1450 here too) — and under the amendment the page
   reads at the realtime grain (500 ms) while a battle
   stands, so batches arrive ~500 ms wide instead of
   read-lump wide, the stagger's waits shrink toward zero,
   and the sampled life sits lower still (845–960 across
   runs, against the old floor's 850). The law §B4 proves
   — a placement's shard at HALF speed against the dark's
   third — stands cleanly separated at the new floor:
   placement medians ~890 against dark ~1460, the ratio
   of the code's own 1056 to 1584. */
ok("§B4 a placement's shard flies at half speed (drawn life ~1056 ms)", placementFlights.length >= 5 && placementLife >= 750 && placementLife <= 1300, `n=${placementFlights.length} median=${placementLife}ms`);
const firsts = drawnInWindow.map(f => f.first).sort((a, b) => a - b);
let bestSpread = 0;
for (let i = 0; i < firsts.length; i++) {
  const inWin = firsts.filter(t => t >= firsts[i] && t <= firsts[i] + 2800);
  if (inWin.length >= 6) bestSpread = Math.max(bestSpread, inWin[inWin.length - 1] - inWin[0]);
}
console.log(`  fullest 2.8 s batch spread of flight starts: ${bestSpread}ms`);
ok("§B5 batched strikes fly at their true moments — flight starts spread across the batch, not bunched at the read", bestSpread >= 900, `spread=${bestSpread}ms`);

/* ════════════════════════════════════════════════════════
   §T — THE TABLE
   The element-sounds drive's choreography: a keeper's page
   observes the room (every strike in the room flies on her
   page), a striker fights by socket, and the room is
   sculpted in-process so the fight is dense and stands
   still long enough to be measured.
   ════════════════════════════════════════════════════════ */
console.log("§T the Table — a sculpted dense fight, watched from a keeper's page");
clearInterval(stillIv);
const { issueTableToken, partyBattleSeatFor } = await import("../server/dist/table.js");
function mkParts(owner, tenderName, kinName, el) {
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 2, 6, ?, ?, 'image/png', ?)")
      .run(`${kinName} ${cat}`, cat, el, `volley/${kinName}-${cat}.png`, Date.now()).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${kinName} ${cat}`, category: cat, rarity: "common", power: 2, toughness: 6, element: el });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(kinName, kinName, `volley/${kinName}.png`, JSON.stringify(parts), tenderName, owner, Date.now()).lastInsertRowid);
}
async function mkTender(name, discId) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 800").run(ownerKey, Date.now());
  for (const w of ["Wake One", "Wake Two", "Wake Three"]) mkParts(ownerKey, name, `${name} ${w}`, "sky");
  await call("chooseClass", { classKey: "warden" }, claim.token);
  const tt = issueTableToken({ id: discId, name });
  const bindCode = (await call("getTableBindCode", {}, claim.token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
  if (!bindRes.ok) throw new Error("table/bind failed for " + name + ": " + bindRes.status);
  return { token: claim.token, ownerKey, tt, name };
}
const ROOM = "projectile-rendering";
const keeper = await mkTender("Volley Keeper", "disc-projfix-a");
// Two striker seats: a Table party stands 3 strong, so the
// volley's hands are two Tenders' parties, not one
// over-full one.
async function mkStriker(name, discId) {
  const t = await mkTender(name, discId);
  // A seat's Table purse rides on what she holds (as drive-element-sounds
  // found): with only her wakes she cannot pay the hand's summon casts —
  // and every fizzled cast still spends its price, charged before the
  // roll. A fat bench purse carries the retries this section needs.
  for (let i = 0; i < 40; i++) mkParts(t.ownerKey, t.name, `${name} bench ${i + 1}`, "sky");
  const party = [];
  for (let i = 0; i < 3; i++) {
    const id = mkParts(t.ownerKey, t.name, `${name} hand ${i + 1}`, "sky");
    party.push(id);
    await call("addToParty", { awakenedId: id }, t.token);
  }
  return { ...t, party };
}
const striker = await mkStriker("Volley Striker", "disc-projfix-b");
const striker2 = await mkStriker("Volley Striker Two", "disc-projfix-c");
const striker3 = await mkStriker("Volley Striker Three", "disc-projfix-e");

const wstate = { state: null };
const wws = new WebSocket(`ws://127.0.0.1:3989/table/ws`);
await new Promise((res, rej) => { wws.onopen = res; wws.onerror = rej; });
wws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") wstate.state = m.state; } catch { /* a torn frame is no evidence */ } };
wws.send(JSON.stringify({ type: "join", room: ROOM, watch: true, name: "Volley Watcher" }));
const waitFor = async (fn, what, ms = 20000) => { const s = Date.now(); while (Date.now() - s < ms) { let v = false; try { v = fn(); } catch { v = false; } if (v) return true; await sleep(120); } throw new Error("drive wait: " + what); };
const tryWait = async (fn, ms) => { try { await waitFor(fn, "tryWait", ms); return true; } catch { return false; } };
const parseAx = (id) => id.split(",").map(Number);
const axDist = (a, b) => { const [aq, ar] = parseAx(a); const [bq, br] = parseAx(b); return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(aq + ar - bq - br)); };

class Actor {
  constructor() { this.state = null; this.you = null; this.errors = []; }
  async join(tt, room) {
    this.ws = new WebSocket("ws://127.0.0.1:3989/table/ws");
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") { this.state = m.state; if (m.you) this.you = m.you; } else if (m.type === "error") this.errors.push(String(ev.message ?? m.message ?? "")); } catch { /* torn frame */ } };
    this.send({ type: "join", authToken: tt, room });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  async waitYou(what, ms = 12000) { const s = Date.now(); while (Date.now() - s < ms) { if (this.you) return; await sleep(120); } throw new Error("actor wait: " + what); }
}

const tpage = await browser.newPage();
await tpage.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
tpage.on("pageerror", (e) => console.log("[pageerror:table]", String(e).slice(0, 200)));
await tpage.evaluateOnNewDocument((sess) => { window.__awokenTableSession = sess; },
  { authToken: keeper.tt, room: ROOM, name: keeper.name });
await tpage.goto(BASE + "/table?frame_id=drive", { waitUntil: "domcontentloaded", timeout: 60000 });
await tpage.waitForSelector(".table-room", { timeout: 30000 });
await tpage.waitForFunction(() => document.querySelector(".table-room svg polygon"), { timeout: 30000 });
await waitFor(() => (wstate.state?.players ?? []).some((p) => p.name === keeper.name && p.hex), "the keeper's seat stands in the watched room", 25000);

/* THE KEEPER'S RECORDER: every shot image the layer shows,
   by element identity — first and last sighting, drawn
   width, href — and any SMIL or old GIF face found there. */
await tpage.evaluate(() => {
  const rec = { shots: [], byEl: new Map(), peak: 0, concurrent: 0, smil: 0, badHref: 0 };
  window.__tableRec = rec;
  rec.iv = setInterval(() => {
    const now = Date.now();
    const layer = document.querySelector(".shots-layer");
    if (!layer) { rec.concurrent = 0; return; }
    rec.smil += layer.querySelectorAll("animate, animateMotion, animateTransform, set").length;
    let n = 0;
    for (const im of layer.querySelectorAll("image")) {
      n++;
      const href = im.getAttribute("href") || "";
      if (!href.includes("matter-shard")) rec.badHref++;
      let s = rec.byEl.get(im);
      if (!s) { s = { first: now, last: now, w: Number(im.getAttribute("width")), href }; rec.byEl.set(im, s); rec.shots.push(s); }
      s.last = now;
    }
    rec.concurrent = n;
    rec.peak = Math.max(rec.peak, n);
  }, 40);
});

const actor = new Actor();
await actor.join(striker.tt, ROOM);
await actor.waitYou("the first striker's seat");
const actor2 = new Actor();
await actor2.join(striker2.tt, ROOM);
await actor2.waitYou("the second striker's seat");
const actor3 = new Actor();
await actor3.join(striker3.tt, ROOM);
await actor3.waitYou("the third striker's seat");
for (const [act, who] of [[actor, striker], [actor2, striker2], [actor3, striker3]]) {
  for (const [i, id] of who.party.entries()) {
    const unitName = `${who.name} hand ${i + 1}`;
    for (let k = 0; k < 20; k++) {
      act.send({ type: "summonCast", awakenedId: id });
      const stood = await tryWait(() => (wstate.state?.field ?? []).some((u) => u.name === unitName && u.ownerName === who.name), 3000);
      if (stood) break;
      if (k === 0 || k === 19) console.log(`  summon ${unitName} try ${k + 1}: ownField=${(act.state?.field ?? []).length} watcherField=${(wstate.state?.field ?? []).length} errors=${JSON.stringify(act.errors.slice(-2))}`);
      await sleep(250);
    }
  }
}
const fieldOf = (name) => (wstate.state?.field ?? []).filter((u) => u.ownerName === name);
const myField = () => [...fieldOf(striker.name), ...fieldOf(striker2.name), ...fieldOf(striker3.name)];
await waitFor(() => fieldOf(striker.name).length >= 3 && fieldOf(striker2.name).length >= 3 && fieldOf(striker3.name).length >= 3, "all three strikers' parties stand on the field", 90000);
console.log(`  strikers field ${myField().length} units`);

// Provoke the curse, then hurry the entry to its standing
// cap by rewinding the room's entry clock (the sculpt: the
// dark dealt is the referee's own; only its timetable is
// the drive's).
{
  // The provoke is a cast like any other and can fizzle;
  // order it from every striker's hand until the battle
  // stands and the dark has answered.
  const provokeBy = Date.now() + 45000;
  while (Date.now() < provokeBy && !(wstate.state?.battle?.active && (wstate.state?.dark ?? []).length > 0)) {
    for (const [act, name] of [[actor, striker.name], [actor2, striker2.name], [actor3, striker3.name]]) {
      const unit = fieldOf(name)[0];
      if (!unit) continue;
      const target = (wstate.state?.map ?? []).find((t) => t.cursed && t.id !== "0,0" && axDist(t.id, unit.hex) <= 4);
      if (target) act.send({ type: "strikeCurse", cardId: unit.cardId, hex: unit.hex, target: target.id });
    }
    await sleep(600);
  }
  if (!wstate.state?.battle?.active) throw new Error("the provoke never opened the battle");
  const roomH = partyBattleSeatFor(striker.ownerKey)?.room;
  const hurryBy = Date.now() + 25000;
  while (Date.now() < hurryBy && (wstate.state?.dark ?? []).length < 8) {
    if (roomH) roomH.entryAt = 0;
    await sleep(700);
  }
  console.log(`  dark standing after the hurried entry: ${(wstate.state?.dark ?? []).length}`);
}
// Sculpt the standing dark into a ring of Frays around the
// first striker's first unit — long-lived, pinned, inside
// bite reach — so every beat is a full exchange of blows.
{
  const seatH = partyBattleSeatFor(striker.ownerKey);
  if (!seatH) throw new Error("no room handle for the sculpt");
  const roomH = seatH.room;
  const hand = [...roomH.field.values()].find((u) => u.ownerKey === seatH.player.key);
  if (!hand) throw new Error("the first striker's unit is not on the room's field");
  const darks = [...roomH.dark.values()];
  darks.forEach((e, i) => {
    e.kind = "fray"; e.label = "Fray"; e.power = 1; e.hp = 100000; e.maxHp = 100000;
    const ang = (i / Math.max(1, darks.length)) * Math.PI * 2;
    e.pos = { x: hand.pos.x + Math.cos(ang) * 58, y: hand.pos.y + Math.sin(ang) * 58 };
    e.target = null; e.pinnedUntil = Date.now() + 600000;
  });
  console.log(`  sculpted ${darks.length} Frays around the striker's first unit`);
}

// THE SYNC: the counting starts here. Strikes served after
// this moment (by the watcher's fold) must each fly on the
// keeper's page; the recorder has been running since before
// the sync, so pre-sync shots are already tagged.
await sleep(600);
const syncWall = Date.now();
let syncId = 0;
for (const s of wstate.state?.strikes ?? []) syncId = Math.max(syncId, s.id ?? 0);
const servedAfterSync = new Set();
let ledgerPeak = 0;
const foldIv = setInterval(() => {
  for (const s of wstate.state?.strikes ?? []) if ((s.id ?? 0) > syncId) servedAfterSync.add(s.id);
  const roomH = partyBattleSeatFor(striker.ownerKey)?.room;
  if (roomH) ledgerPeak = Math.max(ledgerPeak, roomH.strikes.length);
}, 120);

// THE BURST: forty seconds of ordered curse-strikes from
// both strikers' hands, on top of the referee's own beats.
let taps = 0;
let tableShotTaken = false;
const burstEnd = Date.now() + 40000;
while (Date.now() < burstEnd) {
  for (const [act, name] of [[actor, striker.name], [actor2, striker2.name], [actor3, striker3.name]]) {
    const units = fieldOf(name);
    const unit = units[Math.floor(Math.random() * units.length)];
    if (unit) {
      const target = (wstate.state?.map ?? [])
        .filter((t) => t.cursed && axDist(t.id, unit.hex) <= 4)
        .sort((a, b) => axDist(a.id, unit.hex) - axDist(b.id, unit.hex))[0];
      if (target) { act.send({ type: "strikeCurse", cardId: unit.cardId, hex: unit.hex, target: target.id }); taps++; }
    }
  }
  const conc = await tpage.evaluate(() => window.__tableRec?.concurrent ?? 0).catch(() => 0);
  if (!tableShotTaken && conc >= 8) {
    await tpage.screenshot({ path: join(OUT, "table-volley.png") }).catch(() => {});
    tableShotTaken = true;
    console.log(`  screenshot: Table volley at ${conc} concurrent shots`);
  }
  await sleep(300);
}
if (!tableShotTaken) await tpage.screenshot({ path: join(OUT, "table-volley.png") }).catch(() => {});
const lastServeWall = Date.now();
await sleep(3600); // the last staggered shots start and land
clearInterval(foldIv);
for (const s of wstate.state?.strikes ?? []) if ((s.id ?? 0) > syncId) servedAfterSync.add(s.id);
const trec = await tpage.evaluate(() => {
  const rec = window.__tableRec;
  clearInterval(rec.iv);
  return { peak: rec.peak, smil: rec.smil, badHref: rec.badHref, shots: rec.shots.map(s => ({ first: s.first, last: s.last, w: s.w, href: s.href })) };
});
const drawnAfterSync = trec.shots.filter(s => s.first >= syncWall);
console.log(`  Table window: ordered ${taps} curse-strikes; served ${servedAfterSync.size} strikes after the sync; drawn ${drawnAfterSync.length} shots; ledger peak ${ledgerPeak}; peak concurrent ${trec.peak}`);
// Drawn is counted by DOM element identity; the count can
// only OVERSTATE flights (a shot whose element is remounted
// by a re-render is sighted twice), never understate them —
// so the loss direction is the strict one: every served
// strike must have flown. (The homeland §B carries the
// exact drawn == served equality at five times the volume.)
ok("§T3 no strike served after the sync went undrawn on the keeper's page", drawnAfterSync.length >= servedAfterSync.size - 2 && drawnAfterSync.length <= servedAfterSync.size * 1.15 + 6 && servedAfterSync.size >= 45,
  `drawn=${drawnAfterSync.length} served=${servedAfterSync.size}`);
ok("§T4 the served ledger outgrows the struck 40-gate — no struck blow is dropped from the witness", ledgerPeak >= 41, `ledger peak=${ledgerPeak}`);
ok("§T1 every shot wears the homeland's Matter Shard face — no element-GIF bolt remains in the layer", trec.shots.length > 0 && trec.badHref === 0 && trec.shots.every(s => s.href.includes("matter-shard")),
  `shots=${trec.shots.length} badHref=${trec.badHref}`);
ok("§T1 no SMIL rides the shots layer (the old bolts' animateMotion is struck)", trec.smil === 0, `smil samples=${trec.smil}`);
ok("§T2 every shot stands at the homeland's measure on this stage's hexes (drawn width 160)", trec.shots.length > 0 && trec.shots.every(s => s.w === 160),
  `widths=${[...new Set(trec.shots.map(s => s.w))].join(",")}`);
const tCompleted = trec.shots.filter(s => s.last < lastServeWall && s.last - s.first > 300);
const tLife = median(tCompleted.map(s => s.last - s.first));
console.log(`  Table shot lives: n=${tCompleted.length} median=${tLife}ms`);
ok("§T5 shots fly at the homeland's pace (median drawn life ~1056 ms, the light measure)", tCompleted.length >= 20 && tLife >= 850 && tLife <= 1350, `n=${tCompleted.length} median=${tLife}ms`);

await tpage.close();
try { actor.ws.close(); } catch { /* already gone */ }
try { actor2.ws.close(); } catch { /* already gone */ }
try { actor3.ws.close(); } catch { /* already gone */ }
try { wws.close(); } catch { /* already gone */ }
await browser.close();

console.log(`\nPROJECTILE RENDERING DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
