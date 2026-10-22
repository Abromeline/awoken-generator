// drive-proving-ground-spells — THE NEW SPELLS IN THE REAL
// PROVING GROUND (Nigel, 2026-10-22): Bats, the Hold Rune and
// Rune Shatter added into client/public/spell-preview.html
// itself — its purse, its casting die, its fx layer — plus the
// enemy dials over the shade rig and Bramble 1's flipbook over
// standing bramble. This drive opens the real page in Chrome
// and works the workings through their own gates (the drive
// handle walks purse → die → spend exactly as a tap does):
//   §0 the page boots clean; the art stands packed (43 / 32 /
//      47 / 3); the dials show on the ground.
//   §1 THE DIALS govern the rig: Shades + raises the standing
//      count, Temper steps the aggression (Fierce visibly
//      closes the shades on the company), and both step back.
//   §2 RUNE SHATTER: beyond 2 tiles refuses unspent; a tap
//      looses the rune's three pieces, every shot d20 + the
//      working's bonus − 2 vs the shade's AC, 1 damage a hit,
//      the foe's hp falling by exactly the hits; HELD, the
//      stream spends 1 ✦ a second and keeps firing until it
//      is let go.
//   §3 HOLD RUNE: the rune forms over the shade (~4 s of form
//      frames), THE HOLD BEGINS AT THE CRASH'S FIRST STRIKE —
//      the shade stands frozen, the crash frames looping —
//      and ends 3 s on, the animation gone with it.
//   §4 BATS: the swarm hunts the strongest standing (the
//      30-body shade, not the 6-body one), bites 1d4 every 3 s
//      past all armor (every bite lands whole), three bites
//      in 9 s, then dissipates; a felled quarry sends it to
//      the next strongest; the Witch stands four swarms where
//      another class is capped at three.
//   §5 BRAMBLE 1: on Defence the thicket's tiles play the
//      growth frames, then the standing frames — indices past
//      the growth run's end can only be the standing loop.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-proving-ground-spells.mjs
import { createRequire } from "node:module";
const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errs = [];
page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
await page.goto("file://" + new URL("../client/public/spell-preview.html", import.meta.url).pathname, { waitUntil: "load", timeout: 120000 });
await sleep(5000);

const S = () => page.evaluate(() => window.__newspells.state());
const ev = (fn, ...args) => page.evaluate(fn, ...args);
/** cast through the real gates until the working stands;
 *  returns the standing call's own energy delta */
async function castUntil(fnName, arg) {
  for (let i = 0; i < 14; i++) {
    const r = await ev((name, a) => {
      const st0 = window.__newspells.state();
      if (st0.energy < 20) window.__newspells.grant(40);
      const e0 = window.__newspells.state().energy;
      const res = a === undefined ? window.__newspells[name]() : window.__newspells[name](a);
      return { res, delta: e0 - window.__newspells.state().energy };
    }, fnName, arg);
    if (r.res === "cast") return r;
    await sleep(120);
  }
  return { res: "never-cast", delta: -1 };
}

// ── §0 boot ──────────────────────────────────────────────
console.log("\n§0 the ground boots with the new workings packed");
{
  const boot = await ev(() => ({
    ns: !!window.__newspells, br: !!window.__bramble,
    bats: BATS_FRAMES.length, bram: BRAMBLE_FRAMES.length, hold: HOLD_RUNE_FRAMES.length, pieces: SHATTER_PIECES.length,
    dials: !!document.getElementById("bram-dials"),
    foeCountShown: document.getElementById("foecount")?.textContent,
    aggShown: document.getElementById("aggname")?.textContent,
  }));
  ok("the page boots with no script error", errs.length === 0, errs.join(" | "));
  ok("the new workings' handle and the shade rig both stand", boot.ns && boot.br);
  ok("the art stands packed: Bats 43, Bramble 32, Hold Rune 47, Shatter 3", boot.bats === 43 && boot.bram === 32 && boot.hold === 47 && boot.pieces === 3, JSON.stringify(boot));
  ok("the enemy dials show on the ground (Shades 1 · Still)", boot.dials && boot.foeCountShown === "1" && boot.aggShown === "Still", JSON.stringify(boot));
}

// ── §1 the dials ─────────────────────────────────────────
console.log("\n§1 the enemy dials govern the shade rig");
{
  await page.click("#foeplus"); await page.click("#foeplus"); await sleep(400);
  let st = await S();
  ok("Shades + twice: three shades stand", st.foeCount === 3 && st.foes.filter(f => f.alive).length === 3, `count=${st.foeCount}`);
  ok("the dial reads the count back", await ev(() => document.getElementById("foecount").textContent) === "3");
  await page.click("#aggnext"); await sleep(200);
  st = await S();
  ok("Temper steps to Creeping", st.aggression === 1 && await ev(() => document.getElementById("aggname").textContent) === "Creeping");
  await page.click("#aggnext"); await page.click("#aggnext"); await sleep(300);
  const before = (await S()).foes.map(f => ({ id: f.id, x: f.x, y: f.y }));
  await sleep(2600);
  const after = (await S()).foes;
  const moved = Math.max(...before.map(b => { const a = after.find(f => f.id === b.id); return a ? Math.hypot(a.x - b.x, a.y - b.y) : 0; }));
  ok("Fierce: the shades close on the company (a shade moved ≥6px)", (await S()).aggression === 3 && moved >= 6, `moved=${moved.toFixed(1)}`);
  await page.click("#aggprev"); await page.click("#aggprev"); await page.click("#aggprev");
  await page.click("#foeminus"); await page.click("#foeminus"); await sleep(300);
  st = await S();
  ok("the dials step back down (Shades 1 · Still)", st.foeCount === 1 && st.aggression === 0 && st.foes.filter(f => f.alive).length === 1, `count=${st.foeCount} agg=${st.aggression}`);
}

// ── §2 rune shatter ──────────────────────────────────────
console.log("\n§2 Rune Shatter — the rune's pieces, straight, at −2");
{
  await ev(() => { setClass("runewright"); window.__bramble.placeFoe(0, 300, 60); });
  await sleep(300);
  const foePage = await ev(() => {
    const r = document.getElementById("bram-stage").getBoundingClientRect();
    const f = window.__bramble.foes()[0];
    return { x: r.left + f.x, y: r.top + f.y, ac: f.ac };
  });
  await ev((fx, fy) => { x = fx - 100; y = fy + 30; }, foePage.x, foePage.y);
  await sleep(300);
  const t = (await S()).tender;
  ok("the tender stands within the Shatter's 2 tiles of the shade", Math.hypot(t.x - foePage.x, t.y - foePage.y) <= 160, JSON.stringify(t));
  const eBefore = (await S()).energy, shotsBefore = (await S()).shots.length;
  const refused = await ev((px, py) => window.__newspells.shatterTap(px, py), foePage.x + 420, foePage.y);
  const stR = await S();
  ok("a shot beyond 2 tiles is refused and nothing is spent", refused === "beyond-reach" && stR.energy === eBefore && stR.shots.length === shotsBefore, `res=${refused}`);

  // (the volleys need an aim point, so they run through this loop)
  let foeHp0 = (await S()).foes[0].hp, logged = [];
  let volleys = 0;
  for (let v = 0; v < 8 && (logged.length < 6 || logged.filter(s => s.hit).length < 2); v++) {
    const r = await ev((px, py) => {
      const st0 = window.__newspells.state();
      if (st0.energy < 20) window.__newspells.grant(40);
      const e0 = window.__newspells.state().energy;
      const res = window.__newspells.shatterTap(px, py);
      return { res, delta: e0 - window.__newspells.state().energy };
    }, foePage.x, foePage.y);
    if (r.res === "cast") { volleys++; if (volleys === 1) ok("a standing tap cast spends exactly 1 ✦", r.delta === 1, `delta=${r.delta}`); }
    await sleep(650);
    logged = (await S()).shots;
  }
  const foeHp1 = (await S()).foes[0].hp;
  ok("every volley loosed exactly the rune's three pieces", logged.length === volleys * 3, `shots=${logged.length} volleys=${volleys}`);
  ok("every shot reads d20 + the working's bonus − 2 vs the shade's AC",
    logged.length > 0 && logged.every(s => s.total === s.roll + s.bonus - 2 && s.bonus === 2 && s.ac === foePage.ac), JSON.stringify(logged.slice(0, 4)));
  ok("the hit law on every shot (natural 20 strikes, 1 never, else total vs AC)",
    logged.every(s => s.hit === (s.roll === 20 || (s.roll !== 1 && s.total >= s.ac))));
  ok("the shade's hp fell by exactly the hits, 1 a piece", foeHp0 - foeHp1 === logged.filter(s => s.hit).length, `hp ${foeHp0}->${foeHp1} hits=${logged.filter(s => s.hit).length}`);

  // the held stream
  const foeNow = await ev(() => { const r = document.getElementById("bram-stage").getBoundingClientRect(); const f = window.__bramble.foes()[0]; return { x: r.left + f.x, y: r.top + f.y }; });
  let start = { res: "never" };
  for (let i = 0; i < 12 && start.res !== "cast"; i++) {
    start = await ev((px, py) => {
      loadSpell("shatter"); // as a player's tap would find it: the working loaded
      if (window.__newspells.state().energy < 20) window.__newspells.grant(40);
      const res = window.__newspells.streamStart(px, py);
      return { res, e0: window.__newspells.state().energy, shots0: window.__newspells.state().shots.length };
    }, foeNow.x, foeNow.y);
    if (start.res !== "cast") await sleep(150);
  }
  ok("the stream starts on a standing cast", start.res === "cast", JSON.stringify(start));
  await sleep(2300);
  await ev(() => window.__newspells.streamStop());
  const stStop = await S();
  const streamShots = stStop.shots.length - start.shots0;
  ok("held 2.3 s: the stream drank 1 ✦ a second (2 more after the cast's 1)", start.e0 - stStop.energy === 2, `e ${start.e0}->${stStop.energy}`);
  ok("held 2.3 s: the pieces kept coming (the volley's 3 + the stream's ~3 a second)", streamShots >= 8, `shots=${streamShots}`);
  const shotsAtStop = stStop.shots.length, eAtStop = stStop.energy;
  await sleep(900);
  const stAfter = await S();
  ok("let go, the stream stops — no more pieces, no more drink", stAfter.shots.length === shotsAtStop && stAfter.energy === eAtStop && !stAfter.streamOn);
}

// ── §3 hold rune ─────────────────────────────────────────
console.log("\n§3 Hold Rune — the hold begins at the crash's first strike");
{
  const r = await castUntil("castHold", "shade");
  ok("the standing cast spends exactly 7 ✦", r.res === "cast" && r.delta === 7, JSON.stringify(r));
  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 9500) {
    const st = await S();
    samples.push({ at: (Date.now() - t0) / 1000, hold: st.holds[0] || null, shade: st.shade });
    if (samples.length > 4 && !st.holds.length && samples.some(s => s.hold && s.hold.struck)) break;
    await sleep(150);
  }
  const strike = samples.find(s => s.hold && s.hold.struck);
  ok("the crash's first strike lands after the forming (~4.0 s of form frames)", !!strike && strike.at > 3.5 && strike.at < 5.0, strike ? `at=${strike.at.toFixed(2)}` : "never struck");
  const formFrames = samples.filter(s => s.hold && !s.hold.struck).map(s => s.hold.frame);
  ok("while forming, the frames run the form section in order (slots 1–33)",
    formFrames.length >= 8 && formFrames.every(f => f >= 0 && f <= 32) && formFrames.every((f, i) => i === 0 || f >= formFrames[i - 1]), JSON.stringify(formFrames.slice(0, 10)));
  const heldSamples = samples.filter(s => s.shade.held);
  ok("the shade is held from the strike, for 3 s", heldSamples.length >= 12 && heldSamples[0].at >= strike.at - 0.2 && heldSamples[heldSamples.length - 1].at - strike.at <= 3.6,
    `held ${heldSamples.length} samples, span=${heldSamples.length ? (heldSamples[heldSamples.length - 1].at - heldSamples[0].at).toFixed(2) : 0}`);
  const xs = new Set(heldSamples.map(s => s.shade.x)), ys = new Set(heldSamples.map(s => s.shade.y));
  ok("held, the shade does not drift a pixel", heldSamples.length > 0 && xs.size === 1 && ys.size === 1, `xs=${xs.size} ys=${ys.size}`);
  const crashFrames = samples.filter(s => s.hold && s.hold.struck).map(s => s.hold.frame);
  ok("the crash section loops for the whole hold (frames in 34–40, cycling)",
    crashFrames.length >= 8 && crashFrames.every(f => f >= 33 && f <= 39) && new Set(crashFrames).size >= 3, JSON.stringify(crashFrames));
  const last = samples[samples.length - 1];
  ok("when the hold ends the rune is gone and the shade walks free", !last.shade.held && !last.hold, JSON.stringify(last.shade));
}

// ── §4 bats ──────────────────────────────────────────────
console.log("\n§4 Bats — the swarm hunts the strongest, biting past armor");
{
  await ev(() => { window.__bramble.healFoe(0); if (window.__newspells.state().foes[0]?.hp !== 30) window.__bramble.reformFoe(0); setClass("witch"); });
  await sleep(300);
  const foeHp0 = (await S()).foes[0].hp, shadeHp0 = (await S()).shade.hp;
  ok("the field stands whole for the hunt (shade of the rig at 30)", foeHp0 === 30, `hp=${foeHp0}`);
  const r = await castUntil("castBats");
  ok("the standing cast spends exactly 5 ✦", r.res === "cast" && r.delta === 5, JSON.stringify(r));
  const t0 = Date.now(); let goneAt = 0, foeHpEnd = foeHp0, shadeHpEnd = shadeHp0;
  while (Date.now() - t0 < 13000) {
    const st = await S();
    foeHpEnd = st.foes[0]?.hp ?? foeHpEnd; shadeHpEnd = st.shade.hp;
    if (!st.swarms && Date.now() - t0 > 2000) { goneAt = (Date.now() - t0) / 1000; break; }
    await sleep(250);
  }
  const st = await S();
  const bites = st.bites;
  ok("the swarm bit the strongest standing (the rig's shade), never the 6-body shade", bites.length > 0 && bites.every(b => b.kind === "foe") && shadeHpEnd === shadeHp0, JSON.stringify(bites));
  ok("three bites in the 9 s — each 1d4, each landing whole past the AC", bites.length === 3 && bites.every(b => b.dmg >= 1 && b.dmg <= 4), JSON.stringify(bites));
  ok("the quarry's hp fell by exactly the bites' sum", foeHp0 - foeHpEnd === bites.reduce((a, b) => a + b.dmg, 0), `hp ${foeHp0}->${foeHpEnd}`);
  ok("at 9 s the swarm is gone (dissipated)", goneAt > 8.4 && goneAt < 11.5 && st.swarms === 0, `goneAt=${goneAt.toFixed(2)}`);

  // the retarget: fell the quarry mid-hunt
  await ev(() => { window.__bramble.healFoe(0); if (window.__newspells.state().foes[0]?.hp !== 30) window.__bramble.reformFoe(0); });
  const r2 = await castUntil("castBats");
  ok("a second swarm stands", r2.res === "cast", JSON.stringify(r2));
  await sleep(1600);
  const biteMark = (await S()).bites.length;
  await ev(() => window.__bramble.damageFoe(0, 999));
  const shade0 = (await S()).shade.hp;
  let shadeBitten = false;
  const t1 = Date.now();
  while (Date.now() - t1 < 9000) {
    const s2 = await S();
    if (s2.bites.slice(biteMark).some(b => b.kind === "shade")) { shadeBitten = true; break; }
    if (!s2.swarms && Date.now() - t1 > 2500) break;
    await sleep(250);
  }
  ok("the quarry felled mid-hunt, the swarm turns to the next strongest (the arena shade)", shadeBitten, `bites=${JSON.stringify((await S()).bites.slice(biteMark))}`);
  const t2 = Date.now();
  while (Date.now() - t2 < 10000 && (await S()).swarms > 0) await sleep(300);

  // the cap: the Witch suffers none, the Warden is capped at three
  let stands = 0;
  for (let i = 0; i < 16 && stands < 4; i++) { const rr = await castUntil("castBats"); if (rr.res === "cast") stands = (await S()).swarms; }
  ok("the Witch stands FOUR swarms — no cap on her", stands === 4, `swarms=${stands}`);
  const capped = await ev(() => { setClass("warden"); return window.__newspells.castBats(); });
  ok("another class is refused at three standing (the cap holds)", capped === "capped", `res=${capped}`);
  const t3 = Date.now();
  while (Date.now() - t3 < 12000 && (await S()).swarms > 0) await sleep(400);
  ok("the swarms all dissipate in their 9 s", (await S()).swarms === 0);
}

// ── §5 bramble ───────────────────────────────────────────
console.log("\n§5 Bramble 1 — the flipbook over the standing thicket");
{
  const framesOf = () => page.evaluate(() => [...document.querySelectorAll(".bram-bramtile img")].map(img => BRAMBLE_FRAMES.indexOf(img.src)).filter(i => i >= 0));
  await ev(() => { window.__bramble.select(0); window.__bramble.setStance("defence"); });
  await sleep(1800);
  const growing = await framesOf();
  ok("as the thicket grows, its tiles play the growth frames (0–16)", growing.length >= 3 && growing.every(i => i <= 16), JSON.stringify(growing));
  let stand1 = [];
  for (let w = 0; w < 24 && !stand1.some(i => i >= 17); w++) { await sleep(700); stand1 = await framesOf(); }
  await sleep(950);
  const stand2 = await framesOf();
  ok("standing, the tiles run past the growth run into the standing frames (17–31)", stand1.some(i => i >= 17), JSON.stringify(stand1));
  ok("the standing frames keep moving (the loop plays)", JSON.stringify(stand1) !== JSON.stringify(stand2), `${JSON.stringify(stand1)} -> ${JSON.stringify(stand2)}`);
}

console.log(`\ndrive-proving-ground-spells: ${pass} passed, ${fail} failed`);
console.log("page errors:", errs.length ? errs : "none");
await browser.close();
process.exit(fail || errs.length ? 1 : 0);
