// test41 — THE INSTANCE MAP (Nigel, 2026-10-18): the Table's
// field is the terrain map, dealt fresh per room — radius 6,
// 127 tiles, the whole horizon — and the referee runs on the
// clock: distance traveled over time, no rounds. Proven here:
// 127 axial tiles, only the seed's ground pure at the dealing;
// one purified landing per seated player, spread apart;
// summons refused on cursed ground and on the seed's tile;
// stacking (the March law's four-to-a-tile, band permitting);
// THE MARCH — any-road, priced hexes × (1 + ⌊(power−1)/3⌋),
// paced by the element's gait, arrival proven by the march
// back; the dark dealt onto cursed rim ground; a felling frees
// its tile; and in a campaign room, the curse's burn isolated
// (a Fray that dies before it can strike — the shield's loss
// is the burn's alone) while a patrol grinds a tile's
// corruption (10 → 3 → turned, in the grinder's element).
import WebSocket from "ws";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-test41-"));
process.env.PORT = "39953";
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

function client(label, port = 39953) {
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
const tileOf = (c, id) => c.state.map.find(t => t.id === id);
const neighborsOf = (id) => {
  const [q, r] = id.split(",").map(Number);
  return [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([dq, dr]) => `${q + dq},${r + dr}`);
};

// ── The casual instance ────────────────────────────────────
const a = client("A");
await a.join({ devName: "Map Sue", room: "map-room-1" });
check("the instance is dealt: 127 tiles", a.state.map.length === 127, `map=${a.state.map.length}`);
check("the seed's tile stands purified", tileOf(a, "0,0").cursed === false);
const landingA = a.you.landing;
check("one purified tile per player: A's landing", !!landingA && tileOf(a, landingA).cursed === false, `landing=${landingA}`);
check("the landing is a second-ring tile", ringOf(landingA) === 2, `ring=${ringOf(landingA)}`);
check("only the seed and the landing are pure", a.state.map.filter(t => !t.cursed).length === 2,
  `pure=${a.state.map.filter(t => !t.cursed).map(t => t.id).join(" ")}`);

const b = client("B");
await b.join({ devName: "Map Tom", room: "map-room-1" });
const landingB = b.you.landing;
check("B lands too — a different tile", !!landingB && landingB !== landingA, `landingB=${landingB}`);
check("the pure grow by one per player", b.state.map.filter(t => !t.cursed).length === 3);

// Summons: refused on cursed ground, refused on the seed.
const cursedTile = a.state.map.find(t => t.cursed && ringOf(t.id) === 1).id;
const hush = a.you.hand.find(c => c.name === "Hushkeeper");
a.send({ type: "summon", cardId: hush.id, hex: cursedTile });
await sleep(400);
check("no summon onto cursed ground", !a.state.field.some(u => u.name === "Hushkeeper")
  && a.errors.some(e => e.includes("cursed")), `errors=${a.errors.join(" | ")}`);
a.send({ type: "summon", cardId: hush.id, hex: "0,0" });
await sleep(400);
check("no summon onto the star-seed's tile", !a.state.field.some(u => u.name === "Hushkeeper")
  && a.errors.some(e => e.includes("star-seed")));

// Stacking: three of A's band share the landing (band cap 3).
const keeper = a.you.hand.find(c => c.name === "Keeper of the Low Bell");
const rootb = a.you.hand.find(c => c.name === "Rootbound Confessor");
for (const card of [hush, keeper, rootb]) a.send({ type: "summon", cardId: card.id, hex: landingA });
await a.waitFor(c => c.state.field.filter(u => u.hex === landingA).length === 3, "three stand on one tile");
check("stacking: three of the light share one tile", a.state.field.filter(u => u.hex === landingA).length === 3);
check("the muster was charged (12 − 1 − 2 − 1)", a.you.energy === 8, `energy=${a.you.energy}`);

// THE MARCH: Rootbound steps one hex into the curse.
const rootUnit = () => a.state.field.find(u => u.name === "Rootbound Confessor");
const stepTile = neighborsOf(landingA).map(id => tileOf(a, id)).find(t => t && t.cursed && ringOf(t.id) === 1).id;
a.send({ type: "march", cardId: rootb.id, from: landingA, to: stepTile });
await a.waitFor(c => rootUnit()?.hex === stepTile && !!rootUnit()?.march, "the march begins");
const road = rootUnit().march.road;
check("the road runs from the landing to the cursed tile", road[0] === landingA && road[road.length - 1] === stepTile, `road=${road.join("→")}`);
check("the march was priced by the land's law (1 hex × ⚡1 for power 1)", a.you.energy === 7, `energy=${a.you.energy}`);
await a.waitFor(c => Date.now() > rootUnit().march.endsAt + 300, "the march arrives", 20000);
a.send({ type: "march", cardId: rootb.id, from: stepTile, to: landingA });
await a.waitFor(c => rootUnit()?.hex === landingA && !!rootUnit()?.march, "the march back is accepted — arrival proven");
check("arrival proven by the march back", rootUnit().hex === landingA);
await a.waitFor(c => Date.now() > rootUnit().march.endsAt + 300, "the return lands", 20000);
// March out again and stand patrol on the cursed tile.
a.send({ type: "march", cardId: rootb.id, from: landingA, to: stepTile });
await a.waitFor(c => rootUnit()?.hex === stepTile && !!rootUnit()?.march, "patrol march begins");
await a.waitFor(c => Date.now() > rootUnit().march.endsAt + 300, "patrol arrives", 20000);

// The wave: the dark is dealt onto cursed ground only, and a
// felling frees the tile it held.
a.send({ type: "startWave" });
await a.waitFor(c => c.state.battle.active && c.state.dark.length === 3, "the wave is dealt");
check("the wave deals three of the dark", a.state.dark.length === 3);
check("the dark stands only on cursed ground", a.state.dark.every(d => tileOf(a, d.hex).cursed),
  `dark=${a.state.dark.map(d => `${d.hex}:${tileOf(a, d.hex).cursed}`).join(" ")}`);
const pureBeforeWave = a.state.map.filter(t => !t.cursed).length;
await a.waitFor(c => !c.state.battle.active, "the wave resolves", 180000);
check("the wave was broken by the light", !a.state.tale.some(t => t.text.includes("The dark holds the field")));
check("the fighting freed ground (a felling frees the tile the dark died on)", a.state.map.filter(t => !t.cursed).length > pureBeforeWave,
  `pure ${pureBeforeWave} → ${a.state.map.filter(t => !t.cursed).length}`);

// ── The campaign instance: burn + grind, isolated ─────────
const st = client("ST");
await st.join({ devName: "Map Storytender", room: "campaign-map-room", storytender: true });
const cb = client("CB");
await cb.join({ devName: "Camp Sue", room: "campaign-map-room" });
const cLanding = cb.you.landing;
check("the campaign room deals the same instance", cb.state.map.length === 127 && !!cLanding);

// Spark musters BEFORE the deal (the purse is personal until
// the bank seeds) and takes her patrol post on a ring-1 tile.
const spark = cb.you.hand.find(c => c.name.startsWith("Spark"));
cb.send({ type: "summon", cardId: spark.id, hex: cLanding });
await cb.waitFor(c => c.state.field.some(u => u.name.startsWith("Spark")), "Spark stands on the landing");
const grindTile = neighborsOf(cLanding).map(id => tileOf(cb, id)).find(t => t && t.cursed && ringOf(t.id) === 1).id;
check("the grind tile starts at the ring law's corruption (10)", tileOf(cb, grindTile).curseHp === 10, `curseHp=${tileOf(cb, grindTile).curseHp}`);
cb.send({ type: "march", cardId: spark.id, from: cLanding, to: grindTile });
await cb.waitFor(c => c.state.field.find(u => u.name.startsWith("Spark"))?.hex === grindTile, "Spark marches to the cursed tile");
const sparkUnit = () => cb.state.field.find(u => u.name.startsWith("Spark"));
await cb.waitFor(c => Date.now() > sparkUnit().march.endsAt + 300, "Spark arrives on patrol", 20000);
const maxShield = sparkUnit().maxShield;

// ONE HOLLOW, dealt alone: it never strikes — it only drifts
// and drains purses that are already poured empty. So every
// point Spark's shield loses on the cursed tile is the BURN's
// alone, and her body must stay whole. On the clock, the
// grind is a rate: Spark's power 7 against corruption 10.
st.send({ type: "stAdd", kind: "hollow" });
await st.waitFor(c => c.you?.storytender?.reserve.length === 1, "one hollow held");
st.send({ type: "stDeal" });
await cb.waitFor(c => c.state.campaign?.seeded && c.state.dark.length === 1, "the hollow is dealt");
check("the bank seeded from what the muster left (2)", cb.state.campaign.bank === 2, `bank=${cb.state.campaign.bank}`);
await cb.waitFor(c => tileOf(c, grindTile).curseHp <= 8 && tileOf(c, grindTile).curseHp > 0, "the grind bites", 20000);
check("the standing light grinds the corruption down, as a rate", tileOf(cb, grindTile).curseHp <= 8);
await cb.waitFor(c => tileOf(c, grindTile).cursed === false, "the tile turns", 30000);
check("ground to nothing, the tile purifies", tileOf(cb, grindTile).cursed === false);
check("it turns in the grinder's element (sky)", tileOf(cb, grindTile).element === "sky", `element=${tileOf(cb, grindTile).element}`);
check("the curse burned back — the shield alone paid (no blow ever landed)", sparkUnit().shield < maxShield && sparkUnit().hp === sparkUnit().maxHp,
  `shield=${sparkUnit().shield}/${maxShield} hp=${sparkUnit().hp}/${sparkUnit().maxHp}`);
await cb.waitFor(c => !c.state.battle.active, "the first skirmish ends", 60000);

// Purified ground is safe ground: deal a second hollow and
// stand in the skirmish's opening — the shield must not move.
const shieldAtRest = sparkUnit().shield;
st.send({ type: "stAdd", kind: "hollow" });
await st.waitFor(c => c.you?.storytender?.reserve.length === 1, "second hollow held");
st.send({ type: "stDeal" });
await cb.waitFor(c => c.state.battle.active && c.state.dark.length === 1, "the second hollow is dealt");
await sleep(5000);
check("no burn on purified ground", sparkUnit().shield === shieldAtRest && sparkUnit().hp === sparkUnit().maxHp,
  `shield=${sparkUnit().shield} vs ${shieldAtRest}`);

console.log(`\ntest41: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
