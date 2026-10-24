// THE CLASS QUICKNESS LADDER — RECOVERY R14 DRIVE
// (2026-10-23; Nigel's ruling of 2026-10-22 04:22 — "characters
// need different movement speeds. warden+0 runewrite +1,
// binder +2 witch+3 sage +4 — can you also add that to jump
// height and sistance?" — with the jump gap doubled at 11:55
// and the speed gap doubled at 11:56 the same day, air time
// untouched by either; the class-cards spreadsheet carries
// the same ladders). The Proving Ground's rig, ported whole:
//   §A THE RECKONING READ DIRECTLY — the game's own ladder
//      (client/src/jump.ts, compiled fresh by the repo's tsc
//      and imported; the server mirror in server/dist/skills.js
//      read beside it): all five classes' speed/peak/air
//      exactly as ruled, strict ordering on all three
//      measures, the two reckonings in agreement, classless
//      on the base rung.
//   §B THE MEASURED RIG — the engine stepped at 5 ms: peaks,
//      air times and jump distances (ladder speed × air) in
//      strict order; the Witch's tap-jump distance under the
//      Sage's; her hover held at the peak on a 1-energy purse
//      (charge as the hover begins, the next at 3 s — an
//      empty purse ends it), a 2-energy purse holding past
//      3 s, release ending it; the hover's quarter-speed
//      drift state; the Sage's instant re-jump inside her
//      landing squash and the third chained leap's backflip
//      at the ladder's height; the chain's 1200 ms window;
//      the Runewright's mid-air rune leap past his single
//      peak (and a Warden's second press doing nothing); the
//      Binder's flattened arc; airborne curse-exemption on
//      every class; a classless key falling back to the
//      Warden's own arc.
//   §C THE BUILT CLIENT CARRIES IT — the ladder's numbers
//      read off the built bundle itself, and the homeland
//      stride's application points named in its source (the
//      stride is client-walked; its felt pace is Nigel's
//      play-proof, as this repo has stated before).
//   §D THE HOVER'S PURSE, LIVED — hoverSpend against the
//      real server: three charges land, the purse empties,
//      the fourth is refused and reports the true count.
//   §E THE TABLE GLIDE, LIVED — three seats glide the real
//      Table over its wire: a Sage at her ladder pace, a
//      Warden at the standing 30 px/s, an unbound (classless)
//      seat at the same base rung.
// Run AFTER `npm run build`: node scripts/drive-quickness-ladder.mjs
import { join } from "node:path";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-quickness-"));
process.env.PORT = "3914";
process.env["WORKSHOP_" + "PASSWORD"] = "quickness-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3914";
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
  return data;
}
const db = new Database(join(process.env.DATA_DIR, "app.db"));

/* ── §A THE RECKONING READ DIRECTLY ───────────────────── */
console.log("§A the reckoning — the game's own ladder, class by class");
const rigDir = mkdtempSync(join(tmpdir(), "awoken-rig-"));
execFileSync(join(process.cwd(), "node_modules/.bin/tsc"),
  ["client/src/jump.ts", "--outDir", rigDir, "--module", "es2022", "--target", "es2022", "--skipLibCheck"],
  { stdio: "pipe" });
const J = await import(join(rigDir, "jump.js"));
const skills = await import("../server/dist/skills.js");
{
  const t = J.ladderTable();
  const want = {
    warden:     { step: 0, speed: 165, peak: 26, air: 420 },
    runewright: { step: 1, speed: 195, peak: 38, air: 500 },
    binder:     { step: 2, speed: 225, peak: 50, air: 580 },
    witch:      { step: 3, speed: 255, peak: 62, air: 660 },
    sage:       { step: 4, speed: 285, peak: 74, air: 740 },
  };
  for (const k of Object.keys(want)) {
    const w = want[k], g = t[k];
    ok(`ladder/${k}: step +${w.step}, speed ${w.speed} px/s, peak ${w.peak} px, air ${w.air} ms`,
      g && g.step === w.step && g.speed === w.speed && g.peak === w.peak && g.air === w.air,
      JSON.stringify(g));
  }
  const order = ["warden", "runewright", "binder", "witch", "sage"];
  ok("strict ordering on speed, peak and air, Warden < Runewright < Binder < Witch < Sage",
    order.every((k, i) => i === 0 || (t[k].speed > t[order[i - 1]].speed && t[k].peak > t[order[i - 1]].peak && t[k].air > t[order[i - 1]].air)));
  ok("the traits' numbers ride the table: Binder's arc flattened to 0.65, the Witch's rise 300 ms",
    J.JPHYS.binder.flat === 0.65 && J.JPHYS.witch.rise === 300);
  ok("the server mirror agrees, class by class (quicknessSpeedFor 165/195/225/255/285)",
    order.every(k => skills.quicknessSpeedFor(k) === t[k].speed)
    && order.every(k => skills.quicknessStepFor(k) === t[k].step));
  ok("classless stands on the base rung in both reckonings (null, undefined, unknown key → +0, 165)",
    J.quicknessStep(null) === 0 && J.quicknessStep(undefined) === 0 && J.quicknessStep("mystery") === 0
    && J.ladderSpeedOf(null) === 165 && skills.quicknessStepFor(null) === 0 && skills.quicknessStepFor(undefined) === 0
    && skills.quicknessSpeedFor("mystery") === 165,
    JSON.stringify({ jn: J.quicknessStep(null), ju: J.quicknessStep(undefined), jm: J.quicknessStep("mystery"), jSpeed: J.ladderSpeedOf(null), sn: skills.quicknessStepFor(null), su: skills.quicknessStepFor(undefined), sSpeed: skills.quicknessSpeedFor("mystery") }));
  ok("a surface's standing pace is the Warden rung exactly, and rises by the ladder's ratio",
    J.ladderSpeedAt(57.5, "warden") === 57.5 && J.ladderSpeedAt(30, null) === 30
    && Math.abs(J.ladderSpeedAt(57.5, "sage") - 57.5 * 285 / 165) < 1e-9
    && Math.abs(J.ladderSpeedAt(30, "sage") - 30 * 285 / 165) < 1e-9);
}

/* ── §B THE MEASURED RIG ──────────────────────────────── */
console.log("§B the measured rig — the engine stepped, the traits lived");
{
  const STEP = 5;
  // Step one engine from `t0` for `dur` ms of simulated time,
  // calling fn(t) each step (presses, holds, spends live there).
  function run(cls, dur, fn) {
    const e = J.createJumpEngine();
    const t0 = 100000;
    const samples = [];
    for (let t = t0; t <= t0 + dur; t += STEP) {
      fn && fn(e, t - t0, t);
      const pose = J.jumpPoseInfo(e, t);
      samples.push({ dt: t - t0, h: pose.h, flipU: pose.flipU, air: pose.airborne, active: pose.active, landT: e.jump ? e.jump.landT : 0 });
    }
    return { e, samples };
  }
  const landAt = (samples) => { const s = samples.find(v => v.landT > 0); return s ? s.dt : Infinity; };

  // Peaks, air times, distances — the tap jump, class by class.
  // A tap is a press with Space NOT held: the rig ticks the
  // hover exactly as a surface does (Territory's stride clock,
  // the Table's stage clock), so the Witch's hover ends at her
  // rise and she sinks on her own air.
  const dist = {};
  for (const cls of ["warden", "runewright", "binder", "witch", "sage"]) {
    const { samples } = run(cls, 2400, (e, dt, t) => {
      if (dt === 0) J.jumpPress(e, cls, t);
      J.jumpHoverTick(e, t, false, () => true);
    });
    const peak = Math.max(...samples.map(v => v.h));
    const airMs = landAt(samples);
    dist[cls] = J.ladderSpeedOf(cls) * (airMs / 1000);
    ok(`rig/${cls}: peak ${J.JPHYS[cls].peak} px as ruled (measured ${peak.toFixed(1)})`,
      Math.abs(peak - J.JPHYS[cls].peak) < 1.5, `peak=${peak}`);
    ok(`rig/${cls}: air ${90 + J.JPHYS[cls].air} ms as ruled (measured ${airMs})`,
      Math.abs(airMs - (90 + J.JPHYS[cls].air)) <= 15, `air=${airMs}`);
  }
  ok("rig: jump distances (ladder speed × air) in strict ladder order",
    dist.warden < dist.runewright && dist.runewright < dist.binder && dist.binder < dist.witch && dist.witch < dist.sage,
    JSON.stringify(Object.fromEntries(Object.entries(dist).map(([k, v]) => [k, Math.round(v)]))));
  ok("rig: the Witch's tap-jump distance stays under the Sage's, despite her longer air",
    dist.witch < dist.sage, `witch=${dist.witch.toFixed(1)} sage=${dist.sage.toFixed(1)}`);

  // The Witch's hover on a 1-energy purse: charge at the
  // hover's beginning, the next falls due at 3 s and the
  // empty purse ends the hover — she sinks and lands.
  {
    let purse = 1, charges = 0, attempts = 0;
    const spend = () => { attempts++; if (purse > 0) { purse--; charges++; return true; } return false; };
    const { samples } = run("witch", 5200, (e, dt, t) => {
      if (dt === 0) J.jumpPress(e, "witch", t);
      J.jumpHoverTick(e, t, true, spend);
    });
    const at = (ms) => samples.reduce((best, v) => Math.abs(v.dt - ms) < Math.abs(best.dt - ms) ? v : best, samples[0]);
    ok("hover/1✦: she rises to her peak of 62 and holds it (h = 62 at 2 s and at 3 s)",
      Math.abs(at(2000).h - 62) < 0.6 && Math.abs(at(3000).h - 62) < 0.6,
      `h2000=${at(2000).h} h3000=${at(3000).h}`);
    ok("hover/1✦: exactly one charge was paid, the second fell due at 3 s and was refused",
      charges === 1 && attempts === 2, `charges=${charges} attempts=${attempts}`);
    ok("hover/1✦: the empty purse ends the hover — she lands (by 4.6 s)",
      landAt(samples) < 4600, `land=${landAt(samples)}`);
  }
  // A 2-energy purse holds her past 3 s; release ends it.
  {
    let purse = 2, charges = 0;
    const spend = () => { if (purse > 0) { purse--; charges++; return true; } return false; };
    let hoveringAt3s = false;
    const { samples } = run("witch", 5600, (e, dt, t) => {
      if (dt === 0) J.jumpPress(e, "witch", t);
      J.jumpHoverTick(e, t, dt < 4000, spend);
      if (dt === 3200) hoveringAt3s = J.jumpHovering(e, t);
    });
    ok("hover/2✦: the second charge lands at 3 s and she is still hovering past it",
      charges === 2 && hoveringAt3s, `charges=${charges} hovering=${hoveringAt3s}`);
    ok("hover/2✦: release ends the hover — she lands (by 5.4 s)",
      landAt(samples) < 5400, `land=${landAt(samples)}`);
  }
  // The hover's quarter-speed drift state: risen and holding,
  // neither rising nor sinking.
  {
    const e = J.createJumpEngine();
    const t0 = 200000;
    J.jumpPress(e, "witch", t0);
    let hoverRise = null, hoverPlateau = null, hoverSink = null;
    for (let t = t0; t <= t0 + 1600; t += STEP) {
      J.jumpHoverTick(e, t, t - t0 < 1000, () => true);
      J.jumpPoseInfo(e, t);
      if (t - t0 === 200) hoverRise = J.jumpHovering(e, t);
      if (t - t0 === 800) hoverPlateau = J.jumpHovering(e, t);
      if (t - t0 === 1400) hoverSink = J.jumpHovering(e, t);
    }
    ok("hover drift: quarter-speed state reads false on the rise, true on the plateau, false on the sink",
      hoverRise === false && hoverPlateau === true && hoverSink === false,
      `rise=${hoverRise} plateau=${hoverPlateau} sink=${hoverSink}`);
  }
  // The Sage: instant re-jump inside the landing squash,
  // the third chained leap a backflip at the ladder's height;
  // a chain left longer than 1200 ms between starts resets.
  {
    const e = J.createJumpEngine();
    let t = 300000;
    const leapOnce = (pressDuringSquash) => {
      J.jumpPress(e, "sage", t);
      let peak = 0, flipSeen = false;
      for (let i = 0; i < 400; i++) {
        t += STEP;
        const pose = J.jumpPoseInfo(e, t);
        peak = Math.max(peak, pose.h);
        if (pose.flipU != null && pose.flipU > 0 && pose.flipU < 1) flipSeen = true;
        if (e.jump && e.jump.landT) {
          if (pressDuringSquash) { t += 10; J.jumpPress(e, "sage", t); }
          break;
        }
      }
      return { peak, flipSeen };
    };
    const l1 = leapOnce(true);
    const duringSquashStart = e.jump ? e.jump.t0 : -1;
    ok("sage: a press inside the landing squash re-jumps at once (the next leap starts there)",
      duringSquashStart > 0 && e.jump && !e.jump.landT, `t0=${duringSquashStart}`);
    // finish leap 2, then leap 3
    let peak2 = 0;
    for (let i = 0; i < 400 && !(e.jump && e.jump.landT); i++) { t += STEP; peak2 = Math.max(peak2, J.jumpPoseInfo(e, t).h); }
    t += 10; const l3start = t;
    const l3 = (() => { J.jumpPress(e, "sage", t); let peak = 0, flipSeen = false;
      for (let i = 0; i < 400; i++) { t += STEP; const pose = J.jumpPoseInfo(e, t); peak = Math.max(peak, pose.h); if (pose.flipU != null && pose.flipU > 0 && pose.flipU < 1) flipSeen = true; if (e.jump && e.jump.landT) break; }
      return { peak, flipSeen }; })();
    ok("sage: the chain's heights are the ladder's 74 (leaps 1–3)",
      Math.abs(l1.peak - 74) < 1.5 && Math.abs(peak2 - 74) < 1.5 && Math.abs(l3.peak - 74) < 1.5,
      `peaks=${l1.peak.toFixed(1)}/${peak2.toFixed(1)}/${l3.peak.toFixed(1)}`);
    ok("sage: the third chained leap is the backflip, the first two are not",
      l3.flipSeen && !l1.flipSeen, `l1=${l1.flipSeen} l3=${l3.flipSeen}`);
    ok("sage: flipped() reads the backflip within its breath",
      J.jumpFlipped(e, l3start + 100) === true);
    // The window: starts more than 1200 ms apart break the chain.
    const e2 = J.createJumpEngine();
    let t2 = 500000, flips = 0;
    for (let j = 0; j < 3; j++) {
      J.jumpPress(e2, "sage", t2);
      for (let i = 0; i < 500; i++) { t2 += STEP; const pose = J.jumpPoseInfo(e2, t2); if (pose.flipU != null && pose.flipU > 0 && pose.flipU < 1) flips++; if (!e2.jump || e2.jump.landT) break; }
      t2 += 1500; // let the engine clear, and the window lapse
      for (let i = 0; i < 60 && e2.jump; i++) { t2 += STEP; J.jumpPoseInfo(e2, t2); }
    }
    ok("sage: three slow leaps (starts > 1200 ms apart) never flip — the chain had reset",
      flips === 0, `flips=${flips}`);
  }
  // The Runewright's rune leap; a Warden's second press is nothing.
  {
    const { e, samples } = run("runewright", 2400, (eng, dt, t) => {
      if (dt === 0) J.jumpPress(eng, "runewright", t);
      if (dt === 300) J.jumpPress(eng, "runewright", t);
    });
    const peak = Math.max(...samples.map(v => v.h));
    ok("runewright: the mid-air second press strikes the rune (runed reads true)",
      J.jumpRuned(e, 100000 + 400) === true);
    ok(`runewright: the rune leap carries him past his single peak of 38 (measured ${peak.toFixed(1)})`,
      peak > 44, `peak=${peak}`);
    const w = run("warden", 1200, (eng, dt, t) => {
      if (dt === 0) J.jumpPress(eng, "warden", t);
      if (dt === 250) J.jumpPress(eng, "warden", t);
    });
    const wPeak = Math.max(...w.samples.map(v => v.h));
    ok("warden control: a second press mid-air changes nothing (peak 26, lands on his own air)",
      Math.abs(wPeak - 26) < 1.5 && Math.abs(landAt(w.samples) - 510) <= 15,
      `peak=${wPeak} land=${landAt(w.samples)}`);
  }
  // The Binder's flattened arc; curse exemption; the classless arc.
  {
    const binderAt = run("binder", 1200, (e, dt, t) => { if (dt === 0) J.jumpPress(e, "binder", t); })
      .samples.find(v => Math.abs(v.dt - (90 + 145)) < 3);
    ok("binder: her arc is flattened — at a quarter of her air she stands above the plain sine (h/peak > 0.75)",
      binderAt && (binderAt.h / 50) > 0.75, `h=${binderAt && binderAt.h.toFixed(1)}`);
    for (const cls of ["warden", "runewright", "binder", "witch", "sage"]) {
      const e = J.createJumpEngine();
      const t0 = 700000;
      J.jumpPress(e, cls, t0);
      const midAir = (() => { for (let t = t0; t <= t0 + 400; t += STEP) { J.jumpPoseInfo(e, t); if (J.jumpAirborne(e, t)) return J.jumpCurseExempt(e, t); } return null; })();
      ok(`curse-exempt/${cls}: airborne reads exempt, the ground does not`,
        midAir === true && J.jumpCurseExempt(J.createJumpEngine(), t0) === false);
    }
    const { samples } = run("mystery", 1200, (e, dt, t) => { if (dt === 0) J.jumpPress(e, "mystery", t); });
    const peak = Math.max(...samples.map(v => v.h));
    ok("classless control: an unknown class key leaps the Warden's own arc (peak 26, air 510 ms)",
      Math.abs(peak - 26) < 1.5 && Math.abs(landAt(samples) - 510) <= 15, `peak=${peak} land=${landAt(samples)}`);
  }
}

/* ── §C THE BUILT CLIENT CARRIES IT ───────────────────── */
console.log("§C the built client — the ladder's numbers in the bundle");
{
  const assets = readdirSync(join(process.cwd(), "client/dist/assets")).filter(f => f.endsWith(".js"));
  const bundle = assets.map(f => readFileSync(join(process.cwd(), "client/dist/assets", f), "utf8")).join("\n");
  ok("bundle: QUICK stands as ruled (warden:0 … sage:4)",
    bundle.includes("warden:0,runewright:1,binder:2,witch:3,sage:4"));
  ok("bundle: the speed reckoning is 165 + 30 a step",
    bundle.includes("165+30*"));
  ok("bundle: JPHYS peaks and airs are the ladder's (26/420, 38/500, 50/580 flat .65, 62/660 rise 300, 74/740)",
    bundle.includes("peak:38,air:500") && bundle.includes("peak:50,air:580,flat:.65")
    && bundle.includes("peak:62,air:660,rise:300") && bundle.includes("peak:74,air:740")
    && bundle.includes("peak:26,air:420"));
  const terr = readFileSync(join(process.cwd(), "client/src/Territory.tsx"), "utf8");
  const table = readFileSync(join(process.cwd(), "client/src/Table.tsx"), "utf8");
  ok("application points: the homeland stride runs at ladderSpeedAt(57.5, class) and ticks the hover; the Table ticks the hover",
    terr.includes("ladderSpeedAt(SPEED, tenderStandRef.current.classKey)") && terr.includes("jumpHoverTick(tenderJumpRef.current")
    && terr.includes("jumpHovering(tenderJumpRef.current") && table.includes("jumpHoverTick(myJumpRef.current"));
}

/* ── §D THE HOVER'S PURSE, LIVED ──────────────────────── */
console.log("§D hoverSpend — the Witch's purse, charged for real");
{
  const c = await call("claimTender", { password: "quickness-drive-password", tenderName: "Hover Witch" });
  const id = db.prepare("SELECT id FROM tenders WHERE code = ?").get(c.tender.code).id;
  const ownerKey = `tender:${id}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, Date.now());
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 3, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 3").run(ownerKey, Date.now());
  await call("chooseClass", { classKey: "witch" }, c.token);
  const r1 = await call("hoverSpend", {}, c.token);
  const r2 = await call("hoverSpend", {}, c.token);
  const r3 = await call("hoverSpend", {}, c.token);
  const r4 = await call("hoverSpend", {}, c.token);
  ok("three charges land (3 → 2 → 1 → 0) and each answers spent",
    r1.spent && r1.energy === 2 && r2.spent && r2.energy === 1 && r3.spent && r3.energy === 0,
    JSON.stringify([r1, r2, r3]));
  ok("the fourth charge is refused on the empty purse, and reports the true count",
    r4.spent === false && r4.energy === 0, JSON.stringify(r4));
  const after = await call("getEnergy", {}, c.token);
  ok("the purse the game reads agrees: 0", after.energy === 0, `energy=${after.energy}`);
}

/* ── §E THE TABLE GLIDE, LIVED ────────────────────────── */
console.log("§E the Table glide — three seats at their ladder paces");
{
  const { issueTableToken } = await import("../server/dist/table.js");
  async function claimBound(name, classKey) {
    const c = await call("claimTender", { password: "quickness-drive-password", tenderName: name });
    const id = db.prepare("SELECT id FROM tenders WHERE code = ?").get(c.tender.code).id;
    const ownerKey = `tender:${id}`;
    db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, Date.now());
    db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 500, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500").run(ownerKey, Date.now());
    await call("chooseClass", { classKey }, c.token);
    return { token: c.token, ownerKey };
  }
  // Glide east off the landing tile and measure by SEGMENTS:
  // the landing tile is purified ground (the ladder pace
  // itself); the tile beyond it on this road is cursed, where
  // the standing law halves the pace — the halving rides on
  // top of the ladder, unchanged, and the segments prove both.
  async function glideSpeed(seatName, bound) {
    const tt = issueTableToken({ id: `glide-${seatName}`, name: seatName });
    if (bound) {
      const code = (await call("getTableBindCode", {}, bound.token)).code;
      const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code }) });
      if (!bindRes.ok) throw new Error(`table/bind -> ${bindRes.status}`);
    }
    const ws = new WebSocket(`ws://127.0.0.1:3914/table/ws`);
    const c = { state: null, you: null, errors: [] };
    ws.on("message", (raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === "state") { c.state = m.state; c.you = m.you; }
      if (m.type === "error" || m.type === "joinError") c.errors.push(m.message);
    });
    const send = (msg) => ws.send(JSON.stringify(msg));
    await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error(`${seatName}: join timeout; errors: ${c.errors.join(" | ")}`)), 15000);
      ws.on("open", () => { send({ type: "join", authToken: tt, room: `glide-${seatName}` }); const iv = setInterval(() => { if (c.state && c.you) { clearInterval(iv); clearTimeout(to); resolve(); } }, 100); });
    });
    const mine = () => c.state?.players.find(p => c.you && p.key === c.you.key) ?? null;
    const start = Date.now();
    while (!mine()?.pos && Date.now() - start < 10000) await sleep(200);
    const p0 = mine()?.pos;
    if (!p0) { ws.close(); return { pace1: 0, pace2: null, error: "no position" }; }
    const samples = [];
    const glideIv = setInterval(() => {
      const p = mine()?.pos; if (!p) return;
      send({ type: "glide", tx: p.x + 420, ty: p.y });
    }, 400);
    send({ type: "glide", tx: p0.x + 420, ty: p0.y });
    const t0 = Date.now();
    const sampleIv = setInterval(() => {
      const m = mine();
      if (m?.pos) samples.push({ t: Date.now() - t0, x: m.pos.x, y: m.pos.y, hex: m.hex });
    }, 150);
    await sleep(3600);
    clearInterval(glideIv); clearInterval(sampleIv);
    send({ type: "glideStop" });
    ws.close();
    // Segments: consecutive samples sharing a hex, from the
    // first settled sample on.
    const settled = samples.filter(v => v.t >= 250);
    const segs = [];
    for (const v of settled) {
      if (!segs.length || segs[segs.length - 1].hex !== v.hex) segs.push({ hex: v.hex, pts: [v] });
      else segs[segs.length - 1].pts.push(v);
    }
    const pace = (seg) => {
      if (!seg || seg.pts.length < 2) return null;
      const a = seg.pts[0], b = seg.pts[seg.pts.length - 1];
      const dt = (b.t - a.t) / 1000;
      if (dt < 0.3) return null;
      return Math.hypot(b.x - a.x, b.y - a.y) / dt;
    };
    return { pace1: pace(segs[0]), pace2: pace(segs[1]), segs: segs.map(g => `${g.hex}×${g.pts.length}`) };
  }
  const sage = await glideSpeed("Glide Sage", await claimBound("Glide Sage", "sage"));
  ok(`the Sage glides at her ladder pace on clean ground (30 × 285/165 ≈ 51.8 px/s; measured ${sage.pace1?.toFixed(1)})`,
    sage.pace1 != null && sage.pace1 > 40 && sage.pace1 < 64, JSON.stringify(sage));
  ok(`the Sage's cursed pace is her ladder pace halved, the standing law on top (measured ${sage.pace2?.toFixed(1)})`,
    sage.pace2 == null || (sage.pace1 != null && Math.abs(sage.pace2 - sage.pace1 / 2) < sage.pace1 * 0.22), JSON.stringify(sage));
  const warden = await glideSpeed("Glide Warden", await claimBound("Glide Warden", "warden"));
  ok(`the Warden glides at the standing pace on clean ground (30 px/s; measured ${warden.pace1?.toFixed(1)})`,
    warden.pace1 != null && warden.pace1 > 23 && warden.pace1 < 37, JSON.stringify(warden));
  ok(`the Warden's cursed pace is the standing pace halved (measured ${warden.pace2?.toFixed(1)})`,
    warden.pace2 == null || (warden.pace1 != null && Math.abs(warden.pace2 - warden.pace1 / 2) < warden.pace1 * 0.22), JSON.stringify(warden));
  const unbound = await glideSpeed("Glide Unbound", null);
  ok(`a classless seat glides at the base rung (30 px/s; measured ${unbound.pace1?.toFixed(1)})`,
    unbound.pace1 != null && unbound.pace1 > 23 && unbound.pace1 < 37, JSON.stringify(unbound));
  ok("the Sage outglides the Warden on clean ground (her short pure segment, jitter and all)",
    sage.pace1 != null && warden.pace1 != null && sage.pace1 > warden.pace1 * 1.25,
    `sage=${sage.pace1?.toFixed(1)} warden=${warden.pace1?.toFixed(1)}`);
  ok("the ladder's ratio, live on the long cursed segments (×1.45 or better of ×1.727)",
    sage.pace2 != null && warden.pace2 != null && sage.pace2 > warden.pace2 * 1.45,
    `sage=${sage.pace2?.toFixed(1)} warden=${warden.pace2?.toFixed(1)}`);
}

console.log(`\nQUICKNESS LADDER DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
