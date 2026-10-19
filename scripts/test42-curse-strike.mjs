// test42 — STRIKE THE CURSE (Nigel, 2026-10-18): the land's
// blow-per-order for clearing curses applies to the Table's
// Awoken too. Proven here: the refusals speak and charge
// nothing (pure ground, the seed's tile, beyond the two-tile
// reach, another Tender's warden); a lawful blow costs ⚡1 and
// wears the tile's corruption by the striker's filed power —
// the land's attackTile arithmetic — with the strike flown on
// the shared ledger (from the warden's hex, to the TILE) and
// the curse NOT answering (attrition law, 2026-10-19 — the
// thorns are gone; its teeth are the withering of standing
// in it, proven at the Table by test41's grind);
// blow by blow the corruption thins in the tale until the
// last blow breaks it, the tile turns in the striker's
// element, and the ground the curse held now takes a summon —
// the clearing was for building, and the building opens.
import WebSocket from "ws";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-test42-"));
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
  c.waitFor = async (fn, what, timeout = 30000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (c.state && fn(c)) return true;
      await sleep(200);
    }
    throw new Error(`${label}: timed out waiting for ${what}`);
  };
  return c;
}

const ringOf = (id) => {
  const [q, r] = id.split(",").map(Number);
  return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
};
const dist = (a, b) => {
  const [aq, ar] = a.split(",").map(Number);
  const [bq, br] = b.split(",").map(Number);
  return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs((aq + ar) - (bq + br))) / 2;
};
const tileOf = (c, id) => c.state.map.find(t => t.id === id);
const neighborsOf = (id) => {
  const [q, r] = id.split(",").map(Number);
  return [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([dq, dr]) => `${q + dq},${r + dr}`);
};

// ── The instance is dealt; A musters on her landing ───────
const a = client("A");
await a.join({ devName: "Strike Sue", room: "strike-room-1" });
const landing = a.you.landing;
check("A holds a landing", !!landing && tileOf(a, landing).cursed === false, `landing=${landing}`);

// Muster up to three of the band onto the landing (stacking
// is the March law), as test41's muster did.
const muster = a.you.hand.slice(0, 3);
for (const card of muster) a.send({ type: "summon", cardId: card.id, hex: landing });
await a.waitFor(c => c.state.field.filter(u => u.hex === landing).length === muster.length, "the band stands on the landing");
const strikers = () => a.state.field.filter(u => u.hex === landing && u.ownerKey === a.you.key);
check("the band stands on the landing", strikers().length === muster.length, `standing=${strikers().length}`);

// The mark: a cursed ring-1 neighbour — corruption 10 by the
// ring law (4 + 6 × 1), one tile from the landing.
const target = neighborsOf(landing).map(id => tileOf(a, id)).find(t => t && t.cursed && ringOf(t.id) === 1).id;
check("the mark starts at the ring law's corruption (10)", tileOf(a, target).curseHp === 10 && tileOf(a, target).curseMaxHp === 10,
  `curseHp=${tileOf(a, target).curseHp}/${tileOf(a, target).curseMaxHp}`);

// ── The refusals: they speak, and they charge nothing ─────
const energyAtRest = a.you.energy;
const striker0 = strikers()[0];
a.send({ type: "strikeCurse", cardId: striker0.cardId, hex: landing, target: landing });
await sleep(350);
check("pure ground refuses the blow", a.errors.some(e => e.includes("already pure")), `errors=${a.errors.join(" | ")}`);
a.send({ type: "strikeCurse", cardId: striker0.cardId, hex: landing, target: "0,0" });
await sleep(350);
check("the seed's tile refuses the blow", a.errors.some(e => e.includes("no tile of this land")), `errors=${a.errors.join(" | ")}`);
const farTile = a.state.map.find(t => t.cursed && dist(landing, t.id) >= 3).id;
a.send({ type: "strikeCurse", cardId: striker0.cardId, hex: landing, target: farTile });
await sleep(350);
check("beyond the two-tile reach refuses", a.errors.some(e => e.includes("Beyond reach")), `errors=${a.errors.join(" | ")}`);
check("the refusals charged nothing and wore nothing",
  a.you.energy === energyAtRest && tileOf(a, target).curseHp === 10 && tileOf(a, farTile).curseHp === tileOf(a, farTile).curseMaxHp,
  `energy=${a.you.energy} vs ${energyAtRest}`);

// Another Tender's word cannot spend A's warden.
const b = client("B");
await b.join({ devName: "Strike Tom", room: "strike-room-1" });
b.send({ type: "strikeCurse", cardId: striker0.cardId, hex: landing, target });
await sleep(350);
check("another Tender's order is refused", b.errors.some(e => e.includes("does not stand there")), `errors=${b.errors.join(" | ")}`);
check("the mark is unworn by the foreign order", tileOf(a, target).curseHp === 10);

// ── The first lawful blow ─────────────────────────────────
// The strongest of the band strikes — the purse is finite
// (the muster already spent from it), and the breaking is
// cheapest in the strongest hand. Every blow below is hers.
const striker = strikers().reduce((m, u) => (u.power > m.power ? u : m), strikers()[0]);
const before = strikers().find(u => u.cardId === striker.cardId);
const fleshBefore = before.hp + before.shield;
const energyBefore = a.you.energy;
a.send({ type: "strikeCurse", cardId: striker.cardId, hex: landing, target });
await sleep(400);
const worn = tileOf(a, target);
check("one blow wears the curse by the striker's filed power",
  worn.curseHp === 10 - before.power, `curseHp=${worn.curseHp}, power=${before.power}`);
check("the blow cost ⚡1", a.you.energy === energyBefore - 1, `energy=${a.you.energy} vs ${energyBefore}`);
check("the tale speaks the thinning",
  a.state.tale.some(t => t.text.includes("strikes the curse") && t.text.includes(String(10 - before.power))),
  `tale=${a.state.tale.slice(-3).map(t => t.text).join(" | ")}`);
check("the strike flew on the shared ledger — to the TILE",
  (a.state.strikes ?? []).some(s => s.from === landing && s.to === target && s.side === "light" && s.hit === true),
  `strikes=${JSON.stringify(a.state.strikes)}`);
const after = strikers().find(u => u.cardId === striker.cardId);
check("the curse does not answer — no thorns (attrition law, 2026-10-19): the striker's flesh is untouched by the blow",
  after.hp + after.shield === fleshBefore, `flesh ${fleshBefore} → ${after.hp + after.shield}`);

// ── Blow by blow, until the curse breaks ──────────────────
const lastStriker = striker;
let guard = 0;
while (tileOf(a, target).cursed && guard < 20) {
  guard++;
  const u = strikers().find(x => x.cardId === striker.cardId);
  if (!u) break;
  a.send({ type: "strikeCurse", cardId: u.cardId, hex: landing, target });
  await sleep(350);
}
check("blow by blow, the curse broke", tileOf(a, target).cursed === false,
  `curseHp=${tileOf(a, target).curseHp} energy=${a.you.energy} errors=${a.errors.join(" | ")}`);
check("the tile turned in the last striker's element",
  tileOf(a, target).element === lastStriker.element, `element=${tileOf(a, target).element} vs ${lastStriker.element}`);
check("the tale tells the breaking", a.state.tale.some(t => t.text.includes("breaks the curse")));

// ── The cleared ground takes a summon — the point of it ───
// A's purse is spent empty by the breaking (that was the
// price of the road), so B — whose purse is whole — sets
// her own light on the ground A's blows cleared. The gate
// that refused cursed ground at the dealing now opens.
const spare = b.you.hand[0];
check("a spare card waits in B's hand", !!spare, `hand=${b.you.hand.map(c => c.name).join(",")}`);
if (spare) {
  // SUMMON AT YOUR SIDE (Nigel, 2026-10-19): from across the
  // map the call is refused — the Tender must stand beside
  // the ground she would fill. B walks to A's landing (one
  // hex from the mark) and calls from there.
  b.send({ type: "summon", cardId: spare.id, hex: target });
  await sleep(500);
  check("a summon from afar is refused — the light answers at the Tender's side",
    b.errors.some(e => e.includes("answers at your side")), `errors=${b.errors.join(" | ")}`);
  const bMe = () => b.state.players.find(p => p.key === b.you.key);
  b.send({ type: "tenderMarch", to: landing });
  await b.waitFor(c => bMe() && bMe().hex === landing && !bMe().march, "B's Tender walks to the mark's side", 60000);
  b.send({ type: "summon", cardId: spare.id, hex: target });
  await sleep(600);
  check("the cleared ground takes a summon", b.state.field.some(u => u.hex === target && u.cardId === spare.id),
    `errors=${b.errors.join(" | ")} energy=${b.you.energy}`);
}
// And what is pure refuses the blow, as it should.
const anyUnit = strikers()[0] ?? a.state.field.find(u => u.ownerKey === a.you.key);
a.send({ type: "strikeCurse", cardId: anyUnit.cardId, hex: anyUnit.hex, target });
await sleep(350);
check("cleared ground refuses further blows", a.errors.filter(e => e.includes("already pure")).length >= 2,
  `errors=${a.errors.join(" | ")}`);

console.log(`\ntest42: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
