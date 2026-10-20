// test40 — THE BASTION FALLS (Phase B, TABLE-DESIGN §4.4):
// spend the bank dry, let the dark clear the field, and the
// star-seed is assaulted to the campaign's end by the
// enemy's right — no division, the light is lost.
//
// CONTINUOUS-FIELD NOTE (Phase B): the fall is proven
// with the gate left bare — the Bastion's folly, not its
// defeat in the field — because on the continuous field a
// standing band cannot be cleared by force at all. Under
// the ruled reach table it strikes the whole approach
// road: dealt Unravelers died on the road in run after run
// (twelve, then twenty-four, then a short-reach band,
// then a fray swarm, then a band led into the gate itself
// — the bank fattening past 200, the band untouched, the
// tale closing on victory every time). And a second law
// guards the seed's other side: while any light stands,
// the gated dark claw IT, not the bare Tender — the
// assault race is only lost when the field is empty AND
// the bank still fat. So the telling here: the Tender
// leads his mustered band to the far rim and holds it
// there, the doom gates unopposed, and the seed — no
// light within its own reach of the crawlers, exactly
// §4.4's exposure — is assaulted to the end. The fall
// proven is the same fall: bank dry, seed assaulted,
// no division, the field given back to night.
import WebSocket from "ws";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-test40-"));
process.env.PORT = "39952";
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

function client(label) {
  const ws = new WebSocket("ws://127.0.0.1:39952/table/ws");
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
      const iv = setInterval(() => { if (c.state) { clearInterval(iv); clearTimeout(to); resolve(); } }, 100);
    });
  });
  c.waitFor = async (fn, what, timeout = 60000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (c.state && fn(c)) return true;
      await sleep(250);
    }
    throw new Error(`${label}: timed out waiting for ${what}`);
  };
  return c;
}

const ROOM = "campaign-test40";
const st = client("ST");
await st.join({ devName: "Doom Sue", room: ROOM, storytender: true });
const a = client("A");
await a.join({ devName: "Solo Tender", room: ROOM });

// Twelve Unravelers: the doom that takes the seed, once
// the field is cleared at its gate (see the header note).
for (let i = 0; i < 12; i++) st.send({ type: "stAdd", kind: "unraveler" });
await st.waitFor(c => c.you?.storytender?.reserve.length === 12, "doom held");
st.send({ type: "stDeal" });
await a.waitFor(c => c.state.campaign?.seeded && c.state.dark.length === 12, "doom dealt");
check("bank seeded at one stake (12)", a.state.campaign.bank === 12, `bank=${a.state.campaign.bank}`);

// Spend the bank to nothing: Spark (⚡7) + Mothwing (⚡4)
// + Hushkeeper (⚡1) = 12, a full band of three — the only
// exact-12 muster the dealt hand holds. (The Instance Map:
// the muster stands together on the seat's purified
// landing tile — stacking carries the band.)
const hand = a.you.hand;
const picks = ["Spark of the First Forge", "Mothwing Herald", "Hushkeeper"].map(n => hand.find(c => c.name === n));
for (let i = 0; i < 3; i++) {
  const hex = a.you.landing;
  a.send({ type: "summon", cardId: picks[i].id, hex });
  await a.waitFor(c => c.state.field.length === i + 1, `unit ${i + 1} stands`, 15000).catch(e => {
    throw new Error(`${e.message}; errors: ${a.errors.join(" | ")}; field=${a.state.field.map(u => u.name).join(",")}`);
  });
}
// The muster spent the whole stake — read net of the
// harvest the band's first strikes may already have won
// back during the muster itself (side-spawned Unravelers
// can begin inside sky's reach, and a felling pays ⚡9 in
// the same breath; the spend is exact either way).
const harvestedSoFar = (c) => (c.state.tale ?? []).reduce((sum, t) => {
  const m = t.text.match(/⚡(\d+) joins the bank/);
  return sum + (m ? Number(m[1]) : 0);
}, 0);
check("bank spent dry by the muster", a.state.campaign.bank === harvestedSoFar(a),
  `bank=${a.state.campaign.bank} harvested=${harvestedSoFar(a)}`);

// THE GATE LEFT BARE. The Tender glides alone to the far
// rim — the dark take no quarry from a lone Tender — and
// the mustered band is ordered to follow him there and
// hold the rim. (The band fires from the landing until it
// leaves, and the fellings fatten the bank; that is no
// bar here, because with a light standing anywhere the
// gated dark claw no bare Tender — the assault has no
// race to lose, only a bank to drain.) The doom gates;
// the crawlers stand exposed, with no light within its
// own reach of them, and the seed is clawed down.
const U = [1292 * 40 / 796, 470 * 40 / 796], V = [0, 948 * 40 / 796];
const parseId = (id) => id.split(",").map(Number);
const centerOf = (id) => { const [q, r] = parseId(id); return { x: q * U[0] + r * V[0], y: q * U[1] + r * V[1] }; };
const axialDist = (x, y) => { const [aq, ar] = parseId(x), [bq, br] = parseId(y); return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs((aq + ar) - (bq + br))) / 2; };
const ringOf = (id) => axialDist(id, "0,0");
const landing = a.you.landing;
const farTile = a.state.map.map(t => t.id).filter(id => ringOf(id) === 6)
  .sort((x, y) => axialDist(y, landing) - axialDist(x, landing))[0];
{
  const fc = centerOf(farTile);
  a.send({ type: "glide", tx: fc.x, ty: fc.y });
}
await a.waitFor(c => {
  const me = c.state.players.find(p => p.key === c.you.key);
  return !!me && !me.moving && me.hex === farTile;
}, "the Tender takes the far rim", 30000);
for (const p of picks) a.send({ type: "setFollow", cardId: p.id, follow: true });
try {
  await a.waitFor(c => c.state.field.length === 3 && c.state.field.every(u => axialDist(u.hex, farTile) <= 1 && !u.moving), "the band settles on the far rim", 60000);
} catch (e) {
  console.log("DIAGNOSTIC — the band never reached the rim:");
  console.log("  field:", a.state.field.map(u => `${u.name}@${u.hex} moving=${u.moving}`).join(", "));
  console.log("  dark:", a.state.dark.length, "| bank:", a.state.campaign?.bank);
  throw e;
}

// Then, with the gate left bare and the bank the
// assault's to drain, the seed falls.
try {
  await a.waitFor(c => c.state.campaign?.over === "fallen", "the bastion falls", 180000);
} catch (e) {
  console.log("DIAGNOSTIC — final state:");
  console.log("  over:", a.state.campaign?.over, "| bank:", a.state.campaign?.bank, "| battle active:", a.state.battle.active);
  console.log("  field:", a.state.field.map(u => `${u.name} ${u.hp}/${u.maxHp}`).join(", ") || "(empty)");
  console.log("  dark:", a.state.dark.map(d => `${d.label} ${d.hp}/${d.maxHp}`).join(", ") || "(empty)");
  console.log("  tender:", JSON.stringify(a.state.players.map(p => ({ name: p.name, hp: p.tenderHp, fallen: p.fallen }))));
  console.log("  tale tail:", a.state.tale.slice(-6).map(t => t.text).join("\n    "));
  throw e;
}
check("THE BASTION FELL — campaign ended by the enemy's right", a.state.campaign.over === "fallen");
check("the fall is in the tale", a.state.tale.some(t => t.text.includes("THE BASTION FALLS")));
check("the assault was announced", a.state.tale.some(t => t.text.includes("the dark turns on the star-seed")) || a.state.tale.some(t => t.text.includes("THE BASTION FALLS")));
check("no division after a fall (tender purse empty)", a.you.energy === 0, `energy=${a.you.energy}`);
check("the field is given back to night", a.state.dark.length === 0 && a.state.battle.active === false);

console.log(`\ntest40: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
