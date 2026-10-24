// THE WATERING DRIVE — TIDE × BRAMBLE (Nigel, 2026-10-24:
// "make bramble motes targetable by a tide awokin attack.
// each attack causes a new bramble mote to grow — effect
// called watering — allow bramble to spread and overlap
// slightly as well"; "add it to tide element"; "its the
// positive effect of wet"), REFINED the same day (19:23:
// "make the bramble motes grow by them selves overtime a
// little slower then the origional — what the watering
// does is causes the mote to spread another mote every
// 10 dmg"; pace tapped 19:26: SECONDS — a breath slower
// than the thicket's own growth-in). The proofs, against
// the real engine and the real map:
//   §0 a Root defender's raised bramble stands with MOTES
//      at its fringe — served in the work's node list,
//      three a node, each parented to its node, carrying
//      the node's own measure for its body — and (the
//      refinement) each mote carries its SERVED BIRTH
//      MOMENT from the raise and an EMPTY watering bank;
//   §P the map DRAWS the fringe as served: node-width
//      thickets and mote-width growths, all standing at
//      the full-grown frame (frame 32 — the motes grown
//      at mote scale) — and a young mote whose birth the
//      fixture sets seconds ahead is witnessed CLIMBING
//      the whole run on the map at the slowed tempo:
//      born small, its frames climbing in order through
//      the run to the grown frame over seconds, then
//      holding grown — and its grown moment lands on
//      the SERVED schedule (birth + the slowed run),
//      not on a first-sighting clock, which would have
//      finished its run a full birth-delay earlier;
//   §1 THE METER, weak hand (her parts powerless, the
//      dice stubbed to their floor — her rolled harm is
//      exactly 3 a strike): three strikes bank 3, 6, 9
//      and spread NOTHING; the fourth crosses the
//      every-10 measure (12) and spreads exactly ONE new
//      mote — a spread step beyond a watered mote on its
//      parent ray — the bank keeping the remainder (2),
//      the newborn born in the strike's own window with
//      an empty bank of its own;
//   §1b THE METER, fat strike (owner D; dice stubbed
//      mid — her rolled harm is exactly 24): one strike
//      spreads exactly TWO motes in a chain and banks
//      the remainder (4, on the one watered mote);
//   §2 with a dark in her reach she strikes the DARK
//      instead (defence first): no mote grows and NO
//      BANK MOVES while it stands there;
//   §3 the creep is capped and the bank outlives the
//      cap (owner D): the work fills to 12 living motes;
//      at the cap further strikes still BANK (the banked
//      total climbs 18 → 42) and spread nothing; then a
//      mote is struck from the list (as a hack fells
//      one — room returns) and the next strike's landing
//      converts banked damage into a spread back to 12
//      (the total keeping its exact measure, 56);
//   §4 the motes fall with the parent work: when the
//      defender's stance changes, nodes and motes are
//      gone together;
//   §5 a mote's ground hinders like a node's (owner B
//      against control owner C, identical worlds but for
//      the mote): the dark on mote ground walks at half
//      the control's pace and takes the thorn tick, while
//      never once standing within a node's own radius —
//      the hindrance is the mote's alone;
//   §6 the dark hacks the mote in its face down like a
//      node of the walls: the mote's HP falls by the
//      hack measure while the true node beside it (out
//      of hack reach) keeps its whole measure.
// The raising Fray of §0 is removed the moment the raise
// is witnessed, so no dark lingers to hack the fringe
// while the later scenes count motes exactly. The dice
// stubs (Math.random, this process only — the server
// runs in it) exist so a strike's rolled harm is a known
// figure and the meter's arithmetic is proven exactly,
// not sampled.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-watering.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

mkdirSync("/home/hatch/workspace/watering-proof", { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-watering-"));
process.env.PORT = "3996";
process.env.WORKSHOP_PASSWORD = "watering-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3996";
const PW = "watering-drive-password";
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
const now0 = Date.now();

/* Seed one Tender's world: progress, purse, and a radius-4
   land. cursed=1 worlds serve §5/§6 (a dark on cursed
   ground does not wither in the light, so every wound it
   takes there is the bramble's own). */
function seedWorld(name, cursed) {
  return (async () => {
    const claim = await call("claimTender", { password: PW, tenderName: name });
    const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
    const ownerKey = `tender:${tenderId}`;
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
      tileId.set(`${q},${r}`, Number(insTile.run(ownerKey, q, r, cursed, now).lastInsertRowid));
    }
    return { claim, token: claim.token, ownerKey, tileId };
  })();
}
function seedAwokin(ownerKey, name, element, power = 3, toughness = 3) {
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, power, toughness, element, `watering/${name}-${cat}.png`, now0).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power, toughness, element });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `watering/${name}.png`, JSON.stringify(parts), "Watering Tender", ownerKey, now0).lastInsertRowid);
}
function placeAwokin(ownerKey, awakenedId, tileId, q, r, { hp = 999, stance = "attack", ordered = false } = {}) {
  return Number(db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, NULL, NULL, ?)`).run(ownerKey, awakenedId, tileId, now0, now0, stance, hp, q, r, ordered ? 1 : 0).lastInsertRowid);
}
const brambleOf = (read) => (read.defenceWorks ?? []).find(w => w.kind === "bramble") ?? null;
const trueNodes = (w) => (w?.nodes ?? []).filter(n => !n.mote);
const liveMotes = (w) => (w?.nodes ?? []).filter(n => n.mote && n.hp > 0);
const bankSum = (w) => liveMotes(w).reduce((s, n) => s + (n.bank ?? 0), 0);

// Keep every cradle stilled for the drive's whole life.
const stillIv = setInterval(() => {
  try { db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ?, wanderer_settled_beats = 0").run(Date.now()); } catch { /* the drive is ending */ }
}, 4000);

/* Raise a real bramble for a fresh world: a Root defender
   in ordered defence, a Fray seeded within her reach,
   the engine's own settle — then the Fray is removed so
   nothing lingers to hack the fringe while scenes count
   exactly. */
async function raiseBramble(W, tileKey = "1,0", frayTileKey = "3,0") {
  const [dq, dr] = tileKey.split(",").map(Number);
  const [fq, fr] = frayTileKey.split(",").map(Number);
  const rootAwoken = seedAwokin(W.ownerKey, `Root Warden ${tileKey}`, "root");
  placeAwokin(W.ownerKey, rootAwoken, W.tileId.get(tileKey), dq, dr, { stance: "defense", ordered: true });
  await call("getTerritory", {}, W.token); // prime the watermark on a quiet land
  db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
    VALUES (?, ?, 'fray', ?, 100000, ?, ?, 1, 1, 0)`).run(W.ownerKey, W.tileId.get(frayTileKey), Date.now(), fq, fr);
  const read = await call("getTerritory", {}, W.token);
  db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(W.ownerKey);
  return { rootAwoken, work: brambleOf(read) };
}

/* ══ §0 THE RAISE, ITS FRINGE, ITS BIRTHS AND BANKS (owner A) ═ */
const A = await seedWorld("Watering Tender", 0);
const { rootAwoken, work: workA0 } = await raiseBramble(A);
ok("§0 the engine raised the Root defender's bramble", !!workA0, JSON.stringify(workA0).slice(0, 200));
const nodesA = trueNodes(workA0);
const motesA = liveMotes(workA0);
ok("§0 the raised work stands with 3 true nodes and 9 living motes (three a node)",
  nodesA.length === 3 && motesA.length === 9,
  `nodes ${nodesA.length}, motes ${motesA.length}`);
ok("§0 every mote stands at its parent node's fringe (a half-step out), parented to a node of the work, carrying the node's own measure for its body",
  motesA.every(m => nodesA.some(n => Math.abs(n.q - m.pq) < 1e-9 && Math.abs(n.r - m.pr) < 1e-9)
    && Math.abs(Math.hypot(m.q - m.pq, m.r - m.pr) - 0.5) < 0.06
    && nodesA.some(n => Math.abs(n.q - m.pq) < 1e-9 && n.hp === m.hp && n.maxHp === m.maxHp)),
  JSON.stringify(motesA).slice(0, 300));
ok("§0 every mote carries its SERVED BIRTH MOMENT from the raise (the engine's clock, in the raise's own window) and an empty watering bank — its growth is served, not guessed",
  motesA.every(m => typeof m.born === "number" && m.born >= now0 - 5000 && m.born <= Date.now() + 5000 && m.bank === 0),
  JSON.stringify(motesA.map(m => ({ born: m.born, bank: m.bank }))).slice(0, 300));

/* ══ §P THE MAP DRAWS THE FRINGE — AND A YOUNG MOTE CLIMBS ═
   A second defender stands far off; her work is set by
   hand (the §5/§6 fixture pattern) with ONE mote whose
   birth the fixture sets seconds ahead of the page's
   watching, so the page witnesses the mote's whole
   slowed run: born small, swelling frame by frame off
   its SERVED age, grown at last. */
const youngDef = seedAwokin(A.ownerKey, "Young Warden", "root");
const youngDefPl = placeAwokin(A.ownerKey, youngDef, A.tileId.get("-3,1"), -3, 1, { stance: "defense", ordered: true });
const youngBorn = Date.now() + 12000;
const youngNodes = [
  { q: -2.6, r: 1, hp: 50, maxHp: 50 },
  { q: -2.1, r: 1, hp: 50, maxHp: 50, mote: 1, pq: -2.6, pr: 1, born: youngBorn, bank: 0 },
];
db.prepare("INSERT INTO defence_works (owner_key, placement_id, kind, anchor_q, anchor_r, nodes, created_at) VALUES (?, ?, 'bramble', -3, 1, ?, ?)")
  .run(A.ownerKey, youngDefPl, JSON.stringify(youngNodes), Date.now());

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror:watering]", String(e).slice(0, 200)));
await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, A.token);
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
// The recorder: every bramble image on the map, its frame,
// its width and its standing centre, every 25 ms.
await page.evaluate(() => {
  const rec = { ticks: [] };
  window.__watRec = rec;
  rec.iv = setInterval(() => {
    const tick = { t: performance.now(), imgs: [] };
    for (const im of document.querySelectorAll("image")) {
      const href = im.getAttribute("href") || "";
      if (!href.includes("bramble-")) continue;
      const r = im.getBoundingClientRect();
      tick.imgs.push({ name: href.split("/").pop(), w: r.width, cx: r.x + r.width / 2, cy: r.y + r.height / 2 });
    }
    rec.ticks.push(tick);
  }, 25);
});
const installWall = Date.now(); // the recorder's wall anchor: its first tick stands within a breath of this moment
const frameNo = (name) => Number(/bramble-(\d+)/.exec(name ?? "")?.[1] ?? NaN);
let pop = { nodes: [], motes: [] };
for (let i = 0; i < 40; i++) {
  pop = await page.evaluate(() => {
    const last = window.__watRec.ticks[window.__watRec.ticks.length - 1];
    if (!last || !last.imgs.length) return { nodes: [], motes: [] };
    const maxW = Math.max(0, ...last.imgs.map((x) => x.w));
    return {
      nodes: last.imgs.filter((x) => x.w >= maxW * 0.8).map((x) => x.name),
      motes: last.imgs.filter((x) => x.w < maxW * 0.8).map((x) => x.name),
    };
  });
  if (pop.nodes.length === 4 && pop.motes.length === 10
    && pop.nodes.every((f) => f.includes("bramble-32")) && pop.motes.every((f) => f.includes("bramble-32"))) break;
  await sleep(600);
}
const watRec = await page.evaluate(() => { clearInterval(window.__watRec.iv); return window.__watRec; });
await page.screenshot({ path: "/home/hatch/workspace/watering-proof/watering-standing.png" }).catch(() => {});
ok("§P the map draws the fringe as it is served — 4 node-width thickets (the raise's three and the witness work's one) and 10 mote-width growths, every one standing at the full-grown frame 32, the motes grown at mote scale",
  pop.nodes.length === 4 && pop.nodes.every((f) => f.includes("bramble-32"))
  && pop.motes.length === 10 && pop.motes.every((f) => f.includes("bramble-32")),
  `nodes: ${pop.nodes.join(",")} | motes: ${pop.motes.join(",")}`);
// The young mote's climb, read off the record by its
// standing centre (its box never moves; only its frame
// walks). Its frame at a wall moment is found in the
// tick nearest that moment (the recorder's clock starts
// a breath after install — the two sample moments are
// read against the mote's own birth, which the page's
// clock shares with this process's wall time to the
// second; the accept windows carry the slack openly).
const youngSeq = (() => {
  const byKey = new Map();
  for (const tk of watRec.ticks) {
    const maxW = Math.max(0, ...tk.imgs.map((x) => x.w));
    for (const im of tk.imgs) {
      if (im.w >= maxW * 0.8) continue;
      const key = `${Math.round(im.cx / 6)},${Math.round(im.cy / 6)}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push({ t: tk.t, f: frameNo(im.name) });
    }
  }
  let best = null;
  for (const seq of byKey.values()) {
    if (!seq.length) continue;
    const first = seq[0].f;
    if (best === null || first < best[0].f) best = seq;
  }
  return best ?? [];
})();
const yFirst = youngSeq[0]?.f, yLast = youngSeq[youngSeq.length - 1]?.f;
const yDistinct = new Set(youngSeq.map((s) => s.f)).size;
const yMono = youngSeq.every((s, i) => i === 0 || s.f >= youngSeq[i - 1].f);
const yGrownAt = youngSeq.find((s) => s.f === 32)?.t;
const yElapsed = yGrownAt != null && youngSeq[0] ? yGrownAt - youngSeq[0].t : -1;
ok("§P the young mote CLIMBS the whole run on the map — born small (frame ≤ 3 at first sight), its frames climbing in order through many frames to the grown frame 32, over seconds (the slowed run), never snapping or stalling",
  yFirst <= 3 && yLast === 32 && yMono && yDistinct >= 8 && yElapsed >= 1300 && yElapsed <= 15000,
  `first ${yFirst}, last ${yLast}, distinct ${yDistinct}, monotone ${yMono}, first-sight-to-grown ${yElapsed}ms`);
// The grown moment, carried onto the wall clock by the
// recorder's install anchor, must land on the SERVED
// schedule: the birth the fixture set (youngBorn) plus
// the slowed run (2640 ms — a quarter slower than the
// node's 2112). A first-sighting clock would have
// finished the run at first sight + 2640 — the birth
// delay (seconds) earlier — and lands outside the
// window; the window's slack (1.4 s) honestly covers
// the install round-trip and the 25 ms tick grain.
const grownWallEst = installWall + (yGrownAt - (watRec.ticks[0]?.t ?? 0));
ok("§P the young mote's grown moment lands on its SERVED schedule (birth + the slowed run) — the map's clock is the engine's, not the page's first sighting",
  Math.abs(grownWallEst - (youngBorn + 2640)) <= 1400,
  `grown at ~${grownWallEst}, served schedule ${youngBorn + 2640}, first-sighting schedule would be ~${installWall + 2640}`);
await browser.close();
// The witness work has served: clear it and its defender
// away so the meter scenes count owner A's fringe alone.
db.prepare("DELETE FROM defence_works WHERE owner_key = ? AND placement_id = ?").run(A.ownerKey, youngDefPl);
db.prepare("DELETE FROM field_placements WHERE id = ?").run(youngDefPl);

/* ══ §1 THE METER — A WEAK HAND, DICE AT THEIR FLOOR ════
   Her parts are powerless and every die is stubbed to
   its floor, so her rolled harm is exactly 3 a strike:
   banked whole, it must take FOUR strikes to cross the
   every-10 measure — 3, 6, 9, then 12 → one spread and
   2 kept. */
const weakTide = seedAwokin(A.ownerKey, "Weak Tide Hand", "tide", 0, 3);
let readA = await call("getTerritory", {}, A.token);
let workA = brambleOf(readA);
// THE FIRST-THREE FIELDING (the engine's own intro law:
// his first three Awoken are his party, fielded beside
// him) fired on the read above — the weak hand's seeding
// made three in this deck, so the pass fielded her and
// the §P witness warden as party copies. The meter
// scenes count strikes exactly, so the fielded copies
// are swept away here and the drive's own placements
// stand alone; the party ledger the pass wrote stands
// written, and the pass never fires twice.
db.prepare("DELETE FROM field_placements WHERE owner_key = ? AND awakened_id != ?").run(A.ownerKey, rootAwoken);
db.prepare("DELETE FROM defence_works WHERE owner_key = ? AND placement_id NOT IN (SELECT id FROM field_placements WHERE owner_key = ?)").run(A.ownerKey, A.ownerKey);
let tideSpot = null;
for (const [key, tid] of A.tileId) {
  const [q, r] = key.split(",").map(Number);
  if (liveMotes(workA).some(m => hexDist({ q, r }, m) <= 3.3)) { tideSpot = { q, r, tid }; break; }
}
ok("§1 a standing place exists within her reach of the fringe", !!tideSpot, JSON.stringify(tideSpot));
const weakPl = placeAwokin(A.ownerKey, weakTide, tideSpot.tid, tideSpot.q, tideSpot.r, {});
await call("getTerritory", {}, A.token); // her cadence primes on this read; no strike is spent

const growthStep = (before, after) => {
  const key = (n) => `${n.q.toFixed(4)},${n.r.toFixed(4)}`;
  const bKeys = new Set(before.map(key));
  const added = after.filter((n) => !bKeys.has(key(n)));
  if (added.length !== 1) return { good: false, why: `added ${added.length}` };
  const P = added[0];
  for (const M of before) {
    if (M.pq == null) continue;
    const ux = M.q - M.pq, ur = M.r - M.pr;
    const len = Math.hypot(ux, ur);
    if (len < 1e-6) continue;
    const ex = M.q + (ux / len) * 0.55, er = M.r + (ur / len) * 0.55;
    if (Math.hypot(P.q - ex, P.r - er) <= 0.08 && Math.abs(P.pq - M.pq) < 1e-9 && Math.abs(P.pr - M.pr) < 1e-9) return { good: true, added: P };
  }
  return { good: false, why: "the new mote stands on no watered mote's parent ray" };
};
const realRandom = Math.random;
Math.random = () => 0; // every die at its floor: her rolled harm is exactly 3
const expectCount = [9, 9, 9, 10];
const expectBank = [3, 6, 9, 2];
let motesBefore4 = null, cycleStart4 = 0, step4 = null, after4 = null;
for (let i = 0; i < 4; i++) {
  if (i === 3) { motesBefore4 = liveMotes(brambleOf(await call("getTerritory", {}, A.token))); cycleStart4 = Date.now(); }
  await sleep(2800);
  const r = await call("getTerritory", {}, A.token);
  const w = brambleOf(r);
  const count = liveMotes(w).length, sum = bankSum(w);
  ok(`§1 strike ${i + 1} banks her 3 and ${i < 3 ? "spreads NOTHING (the bank stands below the every-10 measure)" : "crosses it — exactly one mote spreads and the bank keeps the remainder 2"}`,
    count === expectCount[i] && sum === expectBank[i],
    `count ${count} (want ${expectCount[i]}), banked total ${sum} (want ${expectBank[i]})`);
  if (i === 3) { after4 = liveMotes(w); step4 = growthStep(motesBefore4, after4); }
}
Math.random = realRandom;
ok("§1 the fourth strike's spread stands a step beyond a watered mote on its parent ray, outward from its parent",
  !!step4?.good, step4?.why ?? "");
ok("§1 the newborn is born in the strike's own window, its bank empty — born small, to grow on its own",
  !!step4?.added && step4.added.bank === 0 && typeof step4.added.born === "number"
  && step4.added.born >= cycleStart4 - 6000 && step4.added.born <= Date.now() + 1000,
  JSON.stringify(step4?.added ?? {}).slice(0, 200));

/* ══ §2 DEFENCE FIRST: A DARK IN REACH IS STRUCK, NOT WATERED ═ */
// The weak hand steps aside; a full hand takes her place.
// The bait stands on the tile nearest her own — inside
// the bite's hold (1.35), so it stands and bites rather
// than walking, and far from every mote (it can never
// come within hack reach, 0.75, of the fringe).
db.prepare("DELETE FROM field_placements WHERE id = ?").run(weakPl);
const tideAwoken = seedAwokin(A.ownerKey, "Tide Hand", "tide");
placeAwokin(A.ownerKey, tideAwoken, tideSpot.tid, tideSpot.q, tideSpot.r, {});
const primeRead2 = await call("getTerritory", {}, A.token); // prime her cadence on a quiet land
const s2Work = brambleOf(primeRead2);
const motesAfterWatering = liveMotes(s2Work).length, bankAfterWatering = bankSum(s2Work);
const baitTile = [...A.tileId.entries()].map(([key, tid]) => {
  const [q, r] = key.split(",").map(Number);
  return { q, r, tid, dTide: hexDist({ q, r }, tideSpot) };
}).filter((t) => t.dTide <= 1.2).sort((a, b) => a.dTide - b.dTide)[0];
ok("§2 a bait tile stands within her reach", !!baitTile, JSON.stringify(baitTile));
const bait = Number(db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
  VALUES (?, ?, 'fray', ?, 100000, ?, ?, 1, 1, 0)`).run(A.ownerKey, baitTile.tid, Date.now(), baitTile.q, baitTile.r).lastInsertRowid);
let baitHp = 100000, motesStable = true;
for (let i = 0; i < 4; i++) {
  await sleep(2800);
  const r = await call("getTerritory", {}, A.token);
  const w = brambleOf(r);
  if (liveMotes(w).length !== motesAfterWatering || bankSum(w) !== bankAfterWatering) motesStable = false;
  baitHp = db.prepare("SELECT hp FROM homeland_wanderers WHERE id = ?").get(bait)?.hp ?? 0;
  if (baitHp < 100000) break;
}
ok("§2 with a dark within her reach she strikes the dark — its hide is bitten and NO mote grows and NO BANK MOVES while it stands there",
  baitHp < 100000 && motesStable,
  `bait hp ${baitHp}; fringe + banks stable: ${motesStable}`);
db.prepare("DELETE FROM homeland_wanderers WHERE id = ?").run(bait);

/* ══ §1b + §3 THE FAT STRIKE AND THE CAP (owner D) ═════
   Dice stubbed mid: every die reads half its faces, so
   her rolled harm is exactly 24 a strike (three Tide
   parts: (5+3) × 3). One strike must spread two in a
   chain and bank 4; the next fills the work to its cap
   mid-chain (bank 18 kept); at the cap her harm still
   banks (42) and spreads nothing; room returns (a mote
   struck from the list, as a hack fells one) and the
   next landing converts the bank back to a full 12. */
const D = await seedWorld("Meter Cap Tender", 0);
const { work: workD0 } = await raiseBramble(D);
ok("§3 owner D's bramble stands raised with its fringe of 9", !!workD0 && liveMotes(workD0).length === 9,
  `motes ${workD0 ? liveMotes(workD0).length : "none"}`);
const strongTide = seedAwokin(D.ownerKey, "Strong Tide Hand", "tide");
let dSpot = null;
for (const [key, tid] of D.tileId) {
  const [q, r] = key.split(",").map(Number);
  if (liveMotes(workD0).some(m => hexDist({ q, r }, m) <= 3.3)) { dSpot = { q, r, tid }; break; }
}
ok("§3 a standing place exists within the strong hand's reach of the fringe", !!dSpot, JSON.stringify(dSpot));
placeAwokin(D.ownerKey, strongTide, dSpot.tid, dSpot.q, dSpot.r, {});
await call("getTerritory", {}, D.token); // prime her cadence
const chainStep = (before, after, want) => {
  const key = (n) => `${n.q.toFixed(4)},${n.r.toFixed(4)}`;
  const bKeys = new Set(before.map(key));
  const added = after.filter((n) => !bKeys.has(key(n)));
  if (added.length !== want) return { good: false, why: `added ${added.length}, want ${want}` };
  const pool = [...before];
  for (const P of added) {
    const hit = pool.some((M) => {
      if (M.pq == null) return false;
      const ux = M.q - M.pq, ur = M.r - M.pr;
      const len = Math.hypot(ux, ur);
      if (len < 1e-6) return false;
      return Math.hypot(P.q - (M.q + (ux / len) * 0.55), P.r - (M.r + (ur / len) * 0.55)) <= 0.08
        && Math.abs(P.pq - M.pq) < 1e-9 && Math.abs(P.pr - M.pr) < 1e-9;
    });
    if (!hit) return { good: false, why: "an added mote stands on no chained parent ray" };
    pool.push(P);
  }
  return { good: true };
};
Math.random = () => 0.5; // every die at half its faces: her rolled harm is exactly 24
const dCycle = async () => {
  const before = liveMotes(brambleOf(await call("getTerritory", {}, D.token)));
  await sleep(2800);
  const after = liveMotes(brambleOf(await call("getTerritory", {}, D.token)));
  return { before, after };
};
{
  const { before, after } = await dCycle();
  const banked = after.filter((n) => (n.bank ?? 0) > 0);
  ok("§1b ONE fat strike (24 banked) spreads exactly TWO motes in a chain — each a step beyond the last on its parent ray — and banks the remainder 4, on the one watered mote",
    after.length === 11 && bankSum(brambleOf(await call("getTerritory", {}, D.token))) === 4
    && banked.length === 1 && banked[0].bank === 4 && chainStep(before, after, 2).good,
    `count ${after.length}, banked total ${bankSum(brambleOf(await call("getTerritory", {}, D.token)))}, ${chainStep(before, after, 2).why ?? ""}`);
}
{
  const { after } = await dCycle();
  const w = brambleOf(await call("getTerritory", {}, D.token));
  ok("§3 the next strike fills the work to its cap mid-chain — 12 living motes, the unspread damage kept banked (18)",
    after.length === 12 && bankSum(w) === 18,
    `count ${after.length}, banked total ${bankSum(w)}`);
}
{
  const { after } = await dCycle();
  const w = brambleOf(await call("getTerritory", {}, D.token));
  ok("§3 at the cap her strike still lands as Watering — the damage BANKS (42) and nothing spreads",
    after.length === 12 && bankSum(w) === 42,
    `count ${after.length}, banked total ${bankSum(w)}`);
}
{
  // Room returns: one bankless mote is struck from the
  // list, as a dark's hack would fell it.
  const wRow = db.prepare("SELECT id, nodes FROM defence_works WHERE owner_key = ? AND kind = 'bramble'").get(D.ownerKey);
  const nodes = JSON.parse(wRow.nodes);
  const idx = nodes.findIndex((n) => n.mote && (n.bank ?? 0) === 0);
  nodes.splice(idx, 1);
  db.prepare("UPDATE defence_works SET nodes = ? WHERE id = ?").run(JSON.stringify(nodes), wRow.id);
  const { after } = await dCycle();
  const w = brambleOf(await call("getTerritory", {}, D.token));
  ok("§3 when room returns, the next landing converts banked damage into a spread — the work stands full at 12 again, the total keeping its exact measure (96 banked in, 4 spreads paid: 56)",
    after.length === 12 && bankSum(w) === 56,
    `count ${after.length}, banked total ${bankSum(w)}`);
}
Math.random = realRandom;

/* ══ §4 THE MOTES FALL WITH THE WORK (owner A) ═════════ */
db.prepare("UPDATE field_placements SET stance = 'attack' WHERE owner_key = ? AND awakened_id = ?").run(A.ownerKey, rootAwoken);
readA = await call("getTerritory", {}, A.token);
ok("§4 when the defender's stance changes, the work falls — and every mote falls with it (nothing of the bramble is served)",
  !brambleOf(readA) && !db.prepare("SELECT id FROM defence_works WHERE owner_key = ? AND kind = 'bramble'").get(A.ownerKey),
  JSON.stringify(readA.defenceWorks ?? []));

/* ══ §5/§6 A MOTE'S GROUND (owners B and C, cursed lands) ═ */
async function moteGroundWorld(name, withMote) {
  const W = await seedWorld(name, 1);
  const defender = seedAwokin(W.ownerKey, "Far Warden", "root");
  const defPl = placeAwokin(W.ownerKey, defender, W.tileId.get("-3,0"), -3, 0, { stance: "defense", ordered: true });
  const nodes = [{ q: 3.6, r: 0, hp: 50, maxHp: 50 }];
  if (withMote) nodes.push({ q: 2.2, r: 0, hp: 50, maxHp: 50, mote: 1, pq: 3.6, pr: 0 });
  db.prepare("INSERT INTO defence_works (owner_key, placement_id, kind, anchor_q, anchor_r, nodes, created_at) VALUES (?, ?, 'bramble', -3, 0, ?, ?)")
    .run(W.ownerKey, defPl, JSON.stringify(nodes), Date.now());
  await call("getTerritory", {}, W.token); // prime the watermark before the dark stands
  const dark = Number(db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
    VALUES (?, ?, 'fray', ?, 100000, 2.2, 0, 1, 1, 0)`).run(W.ownerKey, W.tileId.get("2,0"), Date.now()).lastInsertRowid);
  return { ...W, dark };
}
const darkRow = (id) => db.prepare("SELECT pos_q AS q, pos_r AS r, hp FROM homeland_wanderers WHERE id = ?").get(id);
const B = await moteGroundWorld("Mote Ground Tender", true);
const C = await moteGroundWorld("Open Ground Tender", false);
const bStart = darkRow(B.dark), cStart = darkRow(C.dark);
await sleep(3600);
await call("getTerritory", {}, B.token);
await call("getTerritory", {}, C.token);
const bMid = darkRow(B.dark), cMid = darkRow(C.dark);
await sleep(3600);
await call("getTerritory", {}, B.token);
await call("getTerritory", {}, C.token);
const bEnd = darkRow(B.dark), cEnd = darkRow(C.dark);
const travel = (a, b) => Math.hypot(b.q - a.q, b.r - a.r);
const bTravel = travel(bStart, bMid), cTravel = travel(cStart, cMid);
console.log(`  pace: on mote ground ${bTravel.toFixed(3)} axial in the first window; on open ground ${cTravel.toFixed(3)}`);
ok("§5 the dark on mote ground walks at half pace — its travel in the same window is near half the control's, though it never stood within the true node's own radius",
  cTravel > 0.5 && bTravel >= 0.25 * cTravel && bTravel <= 0.75 * cTravel
  && Math.hypot(bStart.q - 3.6, bStart.r) > 0.6 && Math.hypot(bMid.q - 3.6, bMid.r) > 0.6,
  `mote-ground travel ${bTravel.toFixed(3)} vs open ${cTravel.toFixed(3)}`);
// The control's hide: thorn wounds are whole points, so a
// whole control reads no whole-point loss. (In the run
// below it reads a hair less — 0.0016, the light's own
// attrition for the final partial step it stood on the
// Tender's safe hex at the land's heart, ring 0: a
// different law, named here so the hair is not mistaken
// for a thorn. The mote-ground dark never reached that
// hex; its loss is exactly one whole thorn point.)
ok("§5 the thorn tick answers on mote ground exactly as at a node — the hindered dark lost a whole thorn point, the unhindered control lost no whole point",
  bEnd.hp <= 99999 && cEnd.hp > 99999.9,
  `mote-ground hp ${bEnd.hp}; control hp ${cEnd.hp}`);
const workB = db.prepare("SELECT nodes FROM defence_works WHERE owner_key = ? AND kind = 'bramble'").get(B.ownerKey);
const bNodes = JSON.parse(workB.nodes);
const bMote = bNodes.find((n) => n.mote), bNode = bNodes.find((n) => !n.mote);
ok("§6 the dark hacked the mote in its face down like a node of the walls — the mote's measure fell by hack blows, the true node beyond hack reach keeps its whole measure, and the mote still stands",
  bMote.hp < 50 && bMote.hp >= 44 && bNode.hp === 50,
  `mote hp ${bMote.hp}; node hp ${bNode.hp}`);

clearInterval(stillIv);
console.log(`\nWATERING DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
