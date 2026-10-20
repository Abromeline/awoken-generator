// test44 — THE TENDER LEADS (Nigel, 2026-10-19): the Tender
// truly stands on the instance (their landing tile, in the
// room's shared state), glides across it themself —
// continuous movement, free — and the company obeys standing
// orders: an Awokin ordered to FOLLOW musters to a formation
// slot at the Tender's side when they arrive; one never
// ordered holds its ground; a direct march order ends the
// follow. Refusals proven: the seed's tile (a glide onto the
// seed's center is refused); a glide mid-glide simply retargets.
import WebSocket from "ws";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-test44-"));
process.env.PORT = "39954";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

await import("../server/dist/index.js");
await sleep(2500);

function client(label, port = 39954) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/table/ws`);
  const c = { label, ws, state: null, you: null, errors: [] };
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "state") { c.state = m.state; c.you = m.you; }
    if (m.type === "error" || m.type === "joinError") c.errors.push(m.message);
  });
  c.send = (msg) => ws.send(JSON.stringify(msg));
  c.join = (join) => new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error(`${label}: join timeout`)), 8000);
    ws.on("open", () => {
      c.send({ type: "join", ...join });
      const iv = setInterval(() => {
        if (c.state) { clearInterval(iv); clearTimeout(to); resolve(); }
      }, 100);
    });
  });
  c.waitFor = async (fn, what, timeout = 40000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (c.state && fn(c)) return true;
      await sleep(200);
    }
    throw new Error(`${label}: timed out waiting for ${what}`);
  };
  return c;
}

const parse = (id) => id.split(",").map(Number);
const dist = (a, b) => {
  const [aq, ar] = parse(a), [bq, br] = parse(b);
  const dq = aq - bq, dr = ar - br;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};
const meIn = (c) => c.state.players.find(p => p.key === c.you.key);
const unitIn = (c, cardId) => c.state.field.find(u => u.cardId === cardId);
// THE CONTINUOUS TABLE (Phase B): a tile's center in pixels,
// by the iso math — glide targets are points, and a Tender's
// tgt is where they are gliding to, proven within a hair.
const U = [1292 * 40 / 796, 470 * 40 / 796], V = [0, 948 * 40 / 796];
const centerOf = (id) => {
  const [q, r] = parse(id);
  return { x: q * U[0] + r * V[0], y: q * U[1] + r * V[1] };
};
const tgtNear = (p, id, tol = 1.5) => {
  if (!p?.tgt) return false;
  const ctr = centerOf(id);
  return Math.hypot(p.tgt.x - ctr.x, p.tgt.y - ctr.y) <= tol;
};
const glideTo = (c, id) => {
  const ctr = centerOf(id);
  c.send({ type: "glide", tx: ctr.x, ty: ctr.y });
};

const a = client("A");
await a.join({ devName: "Lead Sue", room: "follow-room-1" });
const landingA = a.you.landing;
check("the Tender stands on the instance — at their landing", meIn(a).hex === landingA, `hex=${meIn(a).hex} landing=${landingA}`);
check("the Tender is not moving at rest", !meIn(a).moving);

const b = client("B");
await b.join({ devName: "Watch Tom", room: "follow-room-1" });
check("the other seats see the Tender's ground", b.state.players.find(p => p.key === a.you.key)?.hex === landingA);

// Two of the company stand at the landing.
const card1 = a.you.hand[0], card2 = a.you.hand[1];
a.send({ type: "summon", cardId: card1.id, hex: landingA });
await a.waitFor(c => !!unitIn(c, card1.id), "first summon stands");
a.send({ type: "summon", cardId: card2.id, hex: landingA });
await a.waitFor(c => !!unitIn(c, card2.id), "second summon stands");

// Orders: the first follows; the second is never ordered.
a.send({ type: "setFollow", cardId: card1.id, follow: true });
await a.waitFor(c => unitIn(c, card1.id)?.follow === true, "the follow order lands");
check("the follow order shows in the room's state", unitIn(a, card1.id).follow === true);
check("the unordered Awokin holds no follow", !unitIn(a, card2.id).follow);

// Refusals.
a.send({ type: "glide", tx: 0, ty: 0 });
await sleep(400);
check("the seed's tile refuses the Tender's glide", a.errors.some(e => e.includes("star-seed")), a.errors.join(" | "));

// The Tender glides three hexes out; a glide mid-glide retargets.
const dest = a.state.map.map(t => t.id).find(id => dist(id, landingA) === 3);
const energyBefore = a.you.energy;
glideTo(a, dest);
await a.waitFor(c => meIn(c).moving === true, "the Tender glides");
check("the Tender is gliding, bound for the destination", tgtNear(meIn(a), dest), `tgt=${JSON.stringify(meIn(a).tgt)} center=${JSON.stringify(centerOf(dest))}`);
glideTo(a, landingA);
// Sample fast: tgt is the live heading and clears on arrival,
// so the retarget is caught in flight, not after the fact.
let retargetSeen = false;
for (let i = 0; i < 60 && !retargetSeen; i++) {
  if (tgtNear(meIn(a), landingA)) retargetSeen = true;
  else await sleep(25);
}
check("a glide mid-glide retargets (the road law is gone)", retargetSeen, `tgt=${JSON.stringify(meIn(a).tgt)} center=${JSON.stringify(centerOf(landingA))}`);
glideTo(a, dest);
await a.waitFor(c => !meIn(c).moving && meIn(c).hex === dest, "the Tender arrives");
check("the Tender's own glide costs nothing (Nigel, 2026-10-19: WASD walking is free)", energyBefore - a.you.energy === 0, `before=${energyBefore} after=${a.you.energy}`);
check("the Tender stands at the destination", meIn(a).hex === dest);

// The follower musters to the Tender's side — by itself, on
// arrival. (A unit's moving flag is the road, read directly
// from state, as every client reads it.)
const marchingNow = (u) => !!u?.moving;
await a.waitFor(c => { const u = unitIn(c, card1.id); return !!u && dist(u.hex, dest) <= 1 && !marchingNow(u); }, "the follower musters and settles");
check("the follower stands at the Tender's side", dist(unitIn(a, card1.id).hex, dest) <= 1, `unit=${unitIn(a, card1.id).hex} tender=${dest}`);
check("the follower keeps its order", unitIn(a, card1.id).follow === true);
check("the muster rode free (no further energy spent)", a.you.energy === energyBefore, `energy=${a.you.energy}`);
check("the unordered Awokin never moved", unitIn(a, card2.id).hex === landingA, `hex=${unitIn(a, card2.id).hex}`);

// A direct march order ends the follow.
const far = a.state.map.map(t => t.id).find(id => dist(id, unitIn(a, card1.id).hex) === 2 && id !== dest);
const e2 = a.you.energy;
a.send({ type: "march", cardId: card1.id, from: unitIn(a, card1.id).hex, to: far });
await a.waitFor(c => unitIn(c, card1.id)?.follow === false, "the direct order lands");
check("a direct march order ends the follow", unitIn(a, card1.id).follow === false);
check("the direct march still pays its own price", a.you.energy < e2, `energy=${a.you.energy}`);

// Hold order: set follow, then hold — the flag clears.
await a.waitFor(c => !marchingNow(unitIn(c, card1.id)), "the marched Awokin arrives");
a.send({ type: "setFollow", cardId: card1.id, follow: true });
await a.waitFor(c => unitIn(c, card1.id)?.follow === true, "follow re-ordered");
a.send({ type: "setFollow", cardId: card1.id, follow: false });
await a.waitFor(c => unitIn(c, card1.id)?.follow === false, "hold ordered");
check("the hold order clears the follow", unitIn(a, card1.id).follow === false);

// ── Attrition: the Tender in the cursed land ─────────────
// (Nigel, 2026-10-19): the Tender may travel into the curse
// — and it withers him: a share of his greatest health per
// beat while he stands in it, no dark required. The wave is
// called so the referee's clock runs; the proof watches his
// health fall while every dark thing is still far away.
{
  const tileOf = (c, id) => c.state.map.find(t => t.id === id);
  const neighborsOf = (id) => {
    const [q, r] = id.split(",").map(Number);
    return [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([dq, dr]) => `${q + dq},${r + dr}`);
  };
  let me = meIn(a);
  let cursedStep = neighborsOf(me.hex).map(id => tileOf(a, id)).find(t => t && t.cursed)?.id;
  if (!cursedStep) {
    const staging = a.state.map
      .filter(t => t.id !== "0,0" && dist(me.hex, t.id) <= 3 && neighborsOf(t.id).some(n => tileOf(a, n)?.cursed))
      .sort((x, y) => dist(me.hex, x.id) - dist(me.hex, y.id))[0];
    glideTo(a, staging.id);
    await a.waitFor(c => { const m = meIn(c); return m.hex === staging.id && !m.moving; }, "the Tender stages beside the curse", 30000);
    me = meIn(a);
    cursedStep = neighborsOf(me.hex).map(id => tileOf(a, id)).find(t => t && t.cursed)?.id;
  }
  check("a cursed tile waits beside the Tender", !!cursedStep);
  glideTo(a, cursedStep);
  await a.waitFor(c => { const m = meIn(c); return m.hex === cursedStep && !m.moving; }, "the Tender steps into the cursed land", 30000);
  const hpBefore = meIn(a).tenderHp;
  const maxHp = meIn(a).maxTenderHp;
  a.send({ type: "startWave" });
  await a.waitFor(c => c.state.battle.active, "the wave is called", 20000);
  await a.waitFor(c => {
    const m = meIn(c);
    return m.tenderHp < hpBefore - 0.05 && c.state.dark.every(d => dist(d.hex, cursedStep) >= 3);
  }, "attrition withers the Tender while the dark is far", 45000);
  check("the cursed land withers the Tender who stands in it (attrition, no blow landed)",
    meIn(a).tenderHp < hpBefore, `tenderHp ${hpBefore} → ${meIn(a).tenderHp} of ${maxHp}`);
  check("and he still stands — attrition is a withering, not a blow", meIn(a).tenderHp > 0 && !meIn(a).fallen);
}

console.log(`\ntest44: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
