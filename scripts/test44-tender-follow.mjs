// test44 — THE TENDER LEADS (Nigel, 2026-10-19): the Tender
// truly stands on the instance (their landing tile, in the
// room's shared state), marches the road themself at a
// walker's ⚡1 the hex, and the company obeys standing
// orders: an Awokin ordered to FOLLOW musters to a formation
// slot at the Tender's side when they arrive; one never
// ordered holds its ground; a direct march order ends the
// follow. Refusals proven: the seed's tile, and a second
// march while already on the road.
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

const a = client("A");
await a.join({ devName: "Lead Sue", room: "follow-room-1" });
const landingA = a.you.landing;
check("the Tender stands on the instance — at their landing", meIn(a).hex === landingA, `hex=${meIn(a).hex} landing=${landingA}`);
check("the Tender is not on the road at rest", !meIn(a).march);

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
a.send({ type: "tenderMarch", to: "0,0" });
await sleep(400);
check("the seed's tile refuses the Tender's march", a.errors.some(e => e.includes("star-seed")), a.errors.join(" | "));

// The Tender marches three hexes out; a second order mid-road is refused.
const dest = a.state.map.map(t => t.id).find(id => dist(id, landingA) === 3);
const energyBefore = a.you.energy;
a.send({ type: "tenderMarch", to: dest });
await a.waitFor(c => !!meIn(c).march, "the Tender takes the road");
check("the Tender is on the road, bound for the destination", meIn(a).march.road[meIn(a).march.road.length - 1] === dest && meIn(a).hex === dest);
a.send({ type: "tenderMarch", to: landingA });
await sleep(400);
check("a second march while on the road is refused", a.errors.some(e => e.includes("already on the road")), a.errors.join(" | "));
await a.waitFor(c => !meIn(c).march, "the Tender arrives");
check("the road costs a walker's ⚡1 the hex", energyBefore - a.you.energy === 3, `before=${energyBefore} after=${a.you.energy}`);
check("the Tender stands at the destination", meIn(a).hex === dest);

// The follower musters to the Tender's side — by itself, on
// arrival. (A unit's march record persists in state; standing
// is derived from the clock, as every client reads it.)
const marchingNow = (u) => !!u?.march && Date.now() < u.march.endsAt;
await a.waitFor(c => { const u = unitIn(c, card1.id); return !!u && dist(u.hex, dest) <= 1 && !marchingNow(u); }, "the follower musters and settles");
check("the follower stands at the Tender's side", dist(unitIn(a, card1.id).hex, dest) <= 1, `unit=${unitIn(a, card1.id).hex} tender=${dest}`);
check("the follower keeps its order", unitIn(a, card1.id).follow === true);
check("the muster rode free (no further energy spent)", a.you.energy === energyBefore - 3, `energy=${a.you.energy}`);
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

console.log(`\ntest44: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
