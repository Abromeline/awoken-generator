// THE ARROW FIX — weapon-motion proof drive (Nigel, 2026-10-20:
// "i want summong and the arow fix first"; the homeland weapon
// "bobing and path"). Boots the real server on a scratch
// DATA_DIR, seeds two classed, armed Tenders — one with the
// ARROW, one with the SWORD — each with a Blind Fray standing
// in reach, then drives the real homeland page with puppeteer
// and MEASURES the weapon's drawn position frame by frame:
//   arrow, at rest — it rides its elliptical orbit, tip locked
//     on the Fray (no sway: a hunting tip, not a hanging one);
//   arrow, struck — once the referee's blow is witnessed (the
//     Tender walks a hex line, the map's own witness road), the
//     arrow LEAVES his side, crosses to the foe's hex, leaves a
//     fading tracer, and loops home to the orbit;
//   sword, at rest — orbit and bob, with the Ground's sway in
//     its rotation; struck — the jab carries it to the foe's
//     hex and back.
// Screenshots are taken on the measured triggers. Run:
// PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-weapon-motion.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

const OUT = "/home/hatch/workspace/weapon-motion-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(OUT, "data-"));
process.env.PORT = "39962";
process.env.WORKSHOP_PASSWORD = ["motion", "proof", "pw"].join("-");
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;
process.chdir(new URL("..", import.meta.url).pathname); // the server resolves client/dist from CWD
const BASE = "http://127.0.0.1:39962";
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
  return data;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB migration-order defect — stood up by hand, as the other drives do */ }

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
async function seedTender(name, classKey, weaponKey, foeAt) {
  const claim = await call("claimTender", { password: "motion-proof-password", tenderName: name });
  const token = claim.token;
  const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id}`;
  const now = Date.now();
  db.prepare(`INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at, class_key, weapon_key, hp, weapon_next_at)
    VALUES (?, 3800, 0, ?, ?, ?, 100, ?) ON CONFLICT(owner_key) DO UPDATE SET
    total_exp = 3800, class_key = excluded.class_key, weapon_key = excluded.weapon_key, hp = 100, weapon_next_at = excluded.weapon_next_at`)
    .run(me, now, classKey, weaponKey, now + 600000);
  const tileId = new Map();
  for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > 3) continue;
    // The Fray's own tile is CURSED: the dark only stands in
    // the curse — a wanderer seeded on clean ground is
    // removed by the settle before the referee can see it
    // (proven while grounding this drive; test60's fixture
    // keeps the same law).
    const cursed = q === foeAt.q && r === foeAt.r ? 1 : 0;
    const id = Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, ?, ?, ?, ?)").run(me, q, r, cursed, now).lastInsertRowid);
    tileId.set(`${q},${r}`, id);
  }
  const foeTile = tileId.get(`${foeAt.q},${foeAt.r}`);
  const foeId = Number(db.prepare("INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp) VALUES (?, ?, 'fray', ?, 300)").run(me, foeTile, now).lastInsertRowid);
  return { token, me, foeTile, foeId };
}
const keepStanding = (me, foeId, foeTile) => {
  db.prepare("UPDATE tender_progress SET hp = 100, down_until = NULL, wanderer_watermark = NULL WHERE owner_key = ?").run(me);
  db.prepare("UPDATE homeland_wanderers SET tile_id = ?, hp = 300 WHERE id = ?").run(foeTile, foeId);
};

// ── The page-side reader: the weapon's drawn truth ─────────
// The weapon image rides in a <g transform="translate(x y)
// rotate(r)"> beside its gold glow ellipse; the tracer is a
// run of <line>s stroked rgba(255,236,180,…). The Tender's
// own position comes from the map's proof hook (__tenderJump).
const READ_WEAPON = `(() => {
  const ell = [...document.querySelectorAll("svg ellipse")].find(e => (e.getAttribute("fill") || "").includes("255,215,100"));
  if (!ell) return null;
  const g = ell.parentElement && ell.parentElement.querySelector(":scope > g");
  const tr = g && g.getAttribute("transform");
  const m = tr && tr.match(/translate\\(([\\d.-]+)[ ,]([\\d.-]+)\\) rotate\\(([\\d.-]+)\\)/);
  if (!m) return null;
  const lines = [...document.querySelectorAll("svg line")].filter(l => (l.getAttribute("stroke") || "").startsWith("rgba(255,236,180"));
  const alphas = lines.map(l => parseFloat((l.getAttribute("stroke") || "").split(",")[3] || "0"));
  const pos = window.__tenderJump && window.__tenderJump.pos();
  return { wx: +m[1], wy: +m[2], rot: +m[3], tracer: lines.length, tracerMax: alphas.length ? Math.max(...alphas) : 0,
           fx: pos ? pos.x : null, fy: pos ? pos.y : null };
})()`;

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });

async function openTerritory(token, label) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log(`[pageerror:${label}]`, String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2500);
  const door = await page.$(".deck-button");
  if (!door) throw new Error(`${label}: no .deck-button on the home face`);
  await door.click();
  await page.waitForFunction(() => !!window.__tenderJump && !!window.__tenderJump.pos(), { timeout: 30000 });
  // A fresh Tender meets the first-run tutorial card over
  // his map; dismiss it the way a player does, or every
  // frame is a portrait of the card instead of the land.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(x => x.textContent.trim() === "Skip");
    if (b) b.click();
  });
  await sleep(800);
  // let the figure settle onto its stand
  await page.waitForFunction(new Function(`return (${READ_WEAPON}) !== null;`), { timeout: 30000 });
  return page;
}

async function sample(page, ms, every = 60) {
  const out = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await page.evaluate(READ_WEAPON).catch(() => null);
    if (s) out.push({ t: Date.now() - t0, ...s });
    await sleep(every);
  }
  return out;
}
const shoulder = (s) => ({ x: s.fx, y: s.fy - 34 });
const distToShoulder = (s) => Math.hypot(s.wx - shoulder(s).x, s.wy - shoulder(s).y);

// Walk the Tender back and forth across a hex line: every
// crossing makes the map re-read the land (refreshTerritory),
// which is the road a witnessed strike travels in live play.
// A leg is 1.6 s at the stride's ~57 units/s — a true hex
// crossing each way, not a shuffle inside one hex.
async function walkAndSample(page, seconds) {
  const samples = [];
  const t0 = Date.now();
  let dir = "d";
  const walker = (async () => {
    while (Date.now() - t0 < seconds * 1000) {
      await page.keyboard.down(dir);
      await sleep(1600);
      await page.keyboard.up(dir);
      dir = dir === "d" ? "a" : "d";
      await sleep(150);
    }
  })();
  const sampler = (async () => {
    while (Date.now() - t0 < seconds * 1000) {
      const s = await page.evaluate(READ_WEAPON).catch(() => null);
      if (s) samples.push({ t: Date.now() - t0, ...s });
      await sleep(50);
    }
  })();
  await Promise.all([walker, sampler]);
  return samples;
}

/* ── THE ARROW ─────────────────────────────────────────── */
{
  console.log("§ arrow — the homing circuit on the homeland");
  const A = await seedTender("Arrow Tender", "sage", "arrow", { q: 2, r: 0 });
  const page = await openTerritory(A.token, "arrow");

  const idle = await sample(page, 4600, 150);
  const xs = idle.map(s => s.wx - s.fx), ys = idle.map(s => s.wy - (s.fy - 34));
  const range = (a) => Math.max(...a) - Math.min(...a);
  ok("arrow at rest rides the orbit (x sweep ≥ 25 units)", range(xs) >= 25, `range ${range(xs).toFixed(1)} over ${idle.length} frames`);
  ok("arrow at rest bobs on the ellipse (y sweep ≥ 5 units)", range(ys) >= 5, `range ${range(ys).toFixed(1)}`);
  const rots = idle.map(s => s.rot);
  // THE HUNTING TIP, PROVEN AS TRACKING: the arrow rides a
  // moving orbit, so its bearing to a fixed foe sweeps as it
  // goes (the Ground's arrow does the same) — the proof is
  // that every frame's aim line (rotation less the art's 28°)
  // passes through ONE common point, well away from the
  // Tender: the foe's hex, held in the tip the whole time.
  const aimLine = (s) => { const a = (s.rot - 28) * Math.PI / 180; return { x: s.wx, y: s.wy, dx: Math.cos(a), dy: Math.sin(a) }; };
  const sorted = [...idle].sort((a, b) => a.wx - b.wx);
  const L1 = aimLine(sorted[0]), L2 = aimLine(sorted[sorted.length - 1]);
  const det = L1.dx * L2.dy - L1.dy * L2.dx;
  let quarry = null;
  if (Math.abs(det) > 1e-6) {
    const t = ((L2.x - L1.x) * L2.dy - (L2.y - L1.y) * L2.dx) / det;
    quarry = { x: L1.x + t * L1.dx, y: L1.y + t * L1.dy };
  }
  const perpErr = (s) => {
    if (!quarry) return Infinity;
    const L = aimLine(s);
    const vx = quarry.x - L.x, vy = quarry.y - L.y;
    return Math.abs(vx * L.dy - vy * L.dx);
  };
  const onTarget = idle.filter(s => perpErr(s) <= 20).length;
  const meanShoulder = { x: idle.reduce((a, s) => a + s.fx, 0) / idle.length, y: idle.reduce((a, s) => a + s.fy - 34, 0) / idle.length };
  ok("arrow's tip TRACKS one fixed quarry at rest (≥ 80% of frames aim within 20 units of a single point ≥ 70 units from the shoulder)",
    !!quarry && onTarget / idle.length >= 0.8 && Math.hypot(quarry.x - meanShoulder.x, quarry.y - meanShoulder.y) >= 70,
    quarry ? `quarry at ${Math.hypot(quarry.x - meanShoulder.x, quarry.y - meanShoulder.y).toFixed(0)} units, ${onTarget}/${idle.length} frames on it, rotation swept ${range(rots).toFixed(1)}°` : "aim lines parallel — no quarry");
  await page.screenshot({ path: `${OUT}/arrow-orbit.png` });

  keepStanding(A.me, A.foeId, A.foeTile);
  db.prepare("UPDATE tender_progress SET weapon_next_at = ? WHERE owner_key = ?").run(Date.now() - 1, A.me);
  const flight = await walkAndSample(page, 11);
  const dists = flight.map(distToShoulder);
  const maxD = Math.max(...dists);
  ok("the referee struck during the walk (a strike record stands)", !!db.prepare("SELECT weapon_strike AS s FROM tender_progress WHERE owner_key = ?").get(A.me).s);
  ok("the arrow LEAVES the Tender's side (≥ 100 units from the shoulder; the orbit alone reaches ~31)", maxD >= 100, `max ${maxD.toFixed(1)}`);
  const awayIdx = dists.findIndex(d => d >= 100);
  const tracerAfter = awayIdx >= 0 ? flight.slice(awayIdx).find(s => s.tracer >= 2) : null;
  ok("a fading tracer trails the flight (≥ 2 tracer segments after the arrow is away)", !!tracerAfter, awayIdx < 0 ? "never away" : `tracer peak ${Math.max(...flight.map(s => s.tracer))}`);
  const homeAfter = awayIdx >= 0 ? flight.slice(awayIdx + 1).some(s => distToShoulder(s) <= 48) : false;
  ok("the arrow loops home to the orbit (back within 48 units of the shoulder)", homeAfter);
  // Frame captures on measured triggers, second pass.
  keepStanding(A.me, A.foeId, A.foeTile);
  db.prepare("UPDATE tender_progress SET weapon_next_at = ? WHERE owner_key = ?").run(Date.now() - 1, A.me);
  let shotAway = false, shotTracer = false;
  const t0 = Date.now(); let dir = "d";
  const walker2 = (async () => {
    while (Date.now() - t0 < 14000 && !(shotAway && shotTracer)) {
      await page.keyboard.down(dir); await sleep(1600); await page.keyboard.up(dir);
      dir = dir === "d" ? "a" : "d"; await sleep(150);
    }
  })();
  while (Date.now() - t0 < 14000 && !(shotAway && shotTracer)) {
    const s = await page.evaluate(READ_WEAPON).catch(() => null);
    if (s && !shotAway && distToShoulder(s) >= 85) { await page.screenshot({ path: `${OUT}/arrow-away.png` }); shotAway = true; }
    else if (s && !shotTracer && s.tracer >= 3) { await page.screenshot({ path: `${OUT}/arrow-tracer.png` }); shotTracer = true; }
    await sleep(40);
  }
  await walker2.catch(() => {});
  console.log(`  frames: arrow-away ${shotAway ? "captured" : "NOT captured"}, arrow-tracer ${shotTracer ? "captured" : "NOT captured"}`);
  await page.close();
}

/* ── THE SWORD ─────────────────────────────────────────── */
{
  console.log("§ sword — orbit, bob, sway, and the jab");
  const B = await seedTender("Sword Tender", "warden", "sword", { q: 1, r: 0 });
  const page = await openTerritory(B.token, "sword");

  const idle = await sample(page, 4600, 150);
  const xs = idle.map(s => s.wx - s.fx), ys = idle.map(s => s.wy - (s.fy - 34));
  const range = (a) => Math.max(...a) - Math.min(...a);
  ok("sword at rest rides the orbit (x sweep ≥ 25 units)", range(xs) >= 25, `range ${range(xs).toFixed(1)} over ${idle.length} frames`);
  ok("sword at rest bobs on the ellipse (y sweep ≥ 5 units)", range(ys) >= 5, `range ${range(ys).toFixed(1)}`);
  const rots = idle.map(s => s.rot);
  ok("sword sways in its orbit (rotation wanders ≥ 6° — the Ground's orbit sway)", range(rots) >= 6, `range ${range(rots).toFixed(1)}°`);
  await page.screenshot({ path: `${OUT}/sword-orbit.png` });

  keepStanding(B.me, B.foeId, B.foeTile);
  db.prepare("UPDATE tender_progress SET weapon_next_at = ? WHERE owner_key = ?").run(Date.now() - 1, B.me);
  const fight = await walkAndSample(page, 11);
  const dists = fight.map(distToShoulder);
  const maxD = Math.max(...dists);
  ok("the sword JABS to the foe's hex (≥ 50 units from the shoulder; the orbit alone reaches ~31)", maxD >= 50, `max ${maxD.toFixed(1)}`);
  const jabIdx = dists.findIndex(d => d >= 50);
  const homeAfter = jabIdx >= 0 ? fight.slice(jabIdx + 1).some(s => distToShoulder(s) <= 40) : false;
  ok("the sword returns to the orbit after the jab", homeAfter);
  await page.close();
}

await browser.close();
console.log(`\nWEAPON MOTION DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
