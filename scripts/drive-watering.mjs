// THE WATERING DRIVE — TIDE × BRAMBLE (Nigel, 2026-10-24:
// "make bramble motes targetable by a tide awokin attack.
// each attack causes a new bramble mote to grow — effect
// called watering — allow bramble to spread and overlap
// slightly as well"; "add it to tide element"; "its the
// positive effect of wet"). The proofs, against the real
// engine and the real map:
//   §0 a Root defender's raised bramble stands with MOTES
//      at its fringe — served in the work's node list,
//      three a node, each parented to its node and
//      carrying the node's own measure for its body;
//   §P the map DRAWS them: node-width images wearing the
//      full-grown frame, mote-width images wearing the
//      flipbook's young held frame, counts matching the
//      served living counts;
//   §1 a Tide Awoken in reach of a mote, no dark near,
//      WATERS on her cadence: exactly one new mote a
//      beat, each a spread step beyond the watered one
//      on its parent ray — the creep chains;
//   §2 with a dark in her reach she strikes the DARK
//      instead (defence first): no mote grows, the dark
//      takes her blow;
//   §3 the creep is capped: a work bears at most 12
//      living motes, and further beats grow nothing;
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
// while the later scenes count motes exactly.
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

// Keep every cradle stilled for the drive's whole life.
const stillIv = setInterval(() => {
  try { db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ?, wanderer_settled_beats = 0").run(Date.now()); } catch { /* the drive is ending */ }
}, 4000);

/* ══ §0 THE RAISE AND ITS FRINGE (owner A) ══════════════ */
const A = await seedWorld("Watering Tender", 0);
const rootAwoken = seedAwokin(A.ownerKey, "Root Warden", "root");
placeAwokin(A.ownerKey, rootAwoken, A.tileId.get("1,0"), 1, 0, { stance: "defense", ordered: true });
await call("getTerritory", {}, A.token); // prime the watermark on a quiet land
db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
  VALUES (?, ?, 'fray', ?, 100000, 3, 0, 1, 1, 0)`).run(A.ownerKey, A.tileId.get("3,0"), Date.now());
let readA = await call("getTerritory", {}, A.token);
let workA = brambleOf(readA);
ok("§0 the engine raised the Root defender's bramble", !!workA, JSON.stringify(readA.defenceWorks ?? []).slice(0, 200));
const nodesA = trueNodes(workA);
const motesA = liveMotes(workA);
ok("§0 the raised work stands with 3 true nodes and 9 living motes (three a node)",
  nodesA.length === 3 && motesA.length === 9,
  `nodes ${nodesA.length}, motes ${motesA.length}`);
ok("§0 every mote stands at its parent node's fringe (a half-step out), parented to a node of the work, carrying the node's own measure for its body",
  motesA.every(m => nodesA.some(n => Math.abs(n.q - m.pq) < 1e-9 && Math.abs(n.r - m.pr) < 1e-9)
    && Math.abs(Math.hypot(m.q - m.pq, m.r - m.pr) - 0.5) < 0.06
    && nodesA.some(n => Math.abs(n.q - m.pq) < 1e-9 && n.hp === m.hp && n.maxHp === m.maxHp)),
  JSON.stringify(motesA).slice(0, 300));
// The cause has served: remove the raising Fray so nothing
// lingers to hack the fringe while the scenes count exactly.
db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(A.ownerKey);

/* ══ §P THE MAP DRAWS THE FRINGE ════════════════════════ */
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
let drawn = { nodes: [], motes: [] };
for (let i = 0; i < 30; i++) {
  drawn = await page.evaluate(() => {
    const imgs = [];
    for (const im of document.querySelectorAll("image")) {
      const href = im.getAttribute("href") || "";
      if (!href.includes("bramble-")) continue;
      imgs.push({ name: href.split("/").pop(), w: im.getBoundingClientRect().width });
    }
    const maxW = Math.max(0, ...imgs.map((x) => x.w));
    return {
      nodes: imgs.filter((x) => x.w >= maxW * 0.8).map((x) => x.name),
      motes: imgs.filter((x) => x.w < maxW * 0.8).map((x) => x.name),
    };
  });
  if (drawn.nodes.length === 3 && drawn.nodes.every((f) => f.includes("bramble-32"))
    && drawn.motes.length === 9 && drawn.motes.every((f) => f.includes("bramble-08"))) break;
  await sleep(600);
}
await page.screenshot({ path: "/home/hatch/workspace/watering-proof/watering-standing.png" }).catch(() => {});
ok("§P the map draws the work's fringe as it is served — 3 node-width thickets holding frame 32, 9 mote-width young growths holding the flipbook's young frame (frame 8)",
  drawn.nodes.length === 3 && drawn.nodes.every((f) => f.includes("bramble-32"))
  && drawn.motes.length === 9 && drawn.motes.every((f) => f.includes("bramble-08")),
  `nodes: ${drawn.nodes.join(",")} | motes: ${drawn.motes.join(",")}`);
await browser.close();

/* ══ §1 WATERING: ONE NEW MOTE A BEAT, ON ITS PARENT RAY ═ */
const tideAwoken = seedAwokin(A.ownerKey, "Tide Hand", "tide");
// Her standing place is read off the served state: within
// her reach (3.35) of a mote, and no dark anywhere on the
// land to draw her strike (the raising Fray is gone).
readA = await call("getTerritory", {}, A.token);
workA = brambleOf(readA);
const motesNow = liveMotes(workA);
let tideSpot = null;
for (const [key, tid] of A.tileId) {
  const [q, r] = key.split(",").map(Number);
  if (motesNow.some(m => hexDist({ q, r }, m) <= 3.3)) { tideSpot = { q, r, tid }; break; }
}
ok("§1 a standing place exists within her reach of the fringe", !!tideSpot, JSON.stringify(tideSpot));
placeAwokin(A.ownerKey, tideAwoken, tideSpot.tid, tideSpot.q, tideSpot.r, {});
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
    if (Math.hypot(P.q - ex, P.r - er) <= 0.08 && Math.abs(P.pq - M.pq) < 1e-9 && Math.abs(P.pr - M.pr) < 1e-9) return { good: true };
  }
  return { good: false, why: "the new mote stands on no watered mote's parent ray" };
};
let beforeMotes = liveMotes(brambleOf(await call("getTerritory", {}, A.token)));
await sleep(2800);
let afterMotes = liveMotes(brambleOf(await call("getTerritory", {}, A.token)));
const step1 = growthStep(beforeMotes, afterMotes);
ok("§1 on her cadence, with no dark near, her strike WATERS: exactly one new mote grows, a spread step beyond the watered one, outward from its parent",
  afterMotes.length === beforeMotes.length + 1 && step1.good,
  `motes ${beforeMotes.length} -> ${afterMotes.length}; ${step1.why ?? ""}`);
beforeMotes = afterMotes;
await sleep(2800);
afterMotes = liveMotes(brambleOf(await call("getTerritory", {}, A.token)));
const step2 = growthStep(beforeMotes, afterMotes);
ok("§1 the creep chains: the next beat grows exactly one more, again on a parent ray (any mote can be watered)",
  afterMotes.length === beforeMotes.length + 1 && step2.good,
  `motes ${beforeMotes.length} -> ${afterMotes.length}; ${step2.why ?? ""}`);
const motesAfterWatering = afterMotes.length;

/* ══ §2 DEFENCE FIRST: A DARK IN REACH IS STRUCK, NOT WATERED ═ */
// The bait stands on the tile nearest her own — inside
// the bite's hold (1.35), so it stands and bites rather
// than walking, and far from every mote (the nearest
// mote is within her 3.35 reach of HER, the bait within
// 1.2 on the other side of the reckoning — it can never
// come within hack reach, 0.75, of the fringe).
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
  if (liveMotes(brambleOf(r)).length !== motesAfterWatering) motesStable = false;
  baitHp = db.prepare("SELECT hp FROM homeland_wanderers WHERE id = ?").get(bait)?.hp ?? 0;
  if (baitHp < 100000) break;
}
ok("§2 with a dark within her reach she strikes the dark — its hide is bitten and NO mote grows while it stands there",
  baitHp < 100000 && motesStable,
  `bait hp ${baitHp}; motes stable: ${motesStable}`);
db.prepare("DELETE FROM homeland_wanderers WHERE id = ?").run(bait);

/* ══ §3 THE CAP HOLDS ═══════════════════════════════════ */
let capped = liveMotes(brambleOf(await call("getTerritory", {}, A.token))).length;
for (let i = 0; i < 6 && capped < 12; i++) {
  await sleep(2800);
  capped = liveMotes(brambleOf(await call("getTerritory", {}, A.token))).length;
}
ok("§3 the creep fills to the work's cap — 12 living motes", capped === 12, `living motes ${capped}`);
await sleep(2800);
const capped2 = liveMotes(brambleOf(await call("getTerritory", {}, A.token))).length;
await sleep(2800);
const capped3 = liveMotes(brambleOf(await call("getTerritory", {}, A.token))).length;
ok("§3 at the cap, further beats grow nothing — the work bears 12 living motes and no more",
  capped2 === 12 && capped3 === 12, `then ${capped2}, then ${capped3}`);

/* ══ §4 THE MOTES FALL WITH THE WORK ════════════════════ */
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
