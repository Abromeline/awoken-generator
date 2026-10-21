// test41 — THE INSTANCE MAP (Nigel, 2026-10-18): the Table's
// field is the terrain map, dealt fresh per room — radius 6,
// 127 tiles, the whole horizon — and the referee runs on the
// clock: distance traveled over time, no rounds. Proven here:
// 127 axial tiles, only the seed's ground pure at the dealing;
// one purified landing per seated player, spread apart;
// a summon cast answers on cursed ground now (Nigel's
// wheel law, 2026-10-21 — the cleansed-only refusal is
// superseded) and is still refused on the seed's tile;
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
const axialDist = (a, b) => {
  const [aq, ar] = a.split(",").map(Number);
  const [bq, br] = b.split(",").map(Number);
  return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs((aq + ar) - (bq + br))) / 2;
};
const tileOf = (c, id) => c.state.map.find(t => t.id === id);
const neighborsOf = (id) => {
  const [q, r] = id.split(",").map(Number);
  return [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([dq, dr]) => `${q + dq},${r + dr}`);
};
// THE CONTINUOUS TABLE (Phase B): positions are pixels now —
// a tile's center by the iso math, and a unit's tgt is the
// march's destination point, proven within a hair of it.
const U = [1292 * 40 / 796, 470 * 40 / 796], V = [0, 948 * 40 / 796];
const centerOf = (id) => {
  const [q, r] = id.split(",").map(Number);
  return { x: q * U[0] + r * V[0], y: q * U[1] + r * V[1] };
};
const tgtNear = (u, id, tol = 1.5) => {
  if (!u?.tgt) return false;
  const ctr = centerOf(id);
  return Math.hypot(u.tgt.x - ctr.x, u.tgt.y - ctr.y) <= tol;
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

// Summons: the seed's tile still refuses; cursed ground
// ANSWERS now (the wheel law, 2026-10-21 — tenders can
// summon in the cursed lands; the −3 on the cast, when the
// caster stands in the curse, is proven in
// drive-table-summon §D). The summon is a CAST: it can
// falter, and every attempt spends — so the helper casts
// until the call lands, and the energy checks below reckon
// the counted spend from the tales' named prices.
async function castUntil(c, card, hex, name) {
  for (let i = 0; i < 14; i++) {
    const errMark = c.errors.length;
    c.send({ type: "summonCast", cardId: card.id, hex });
    try { await c.waitFor((cc) => cc.state.field.some(u => u.name === name), `${name} stands`, 2500); return; } catch { /* a falter — cast again */ }
    if (c.errors.slice(errMark).some(e => /costs ✦\d+ — you hold/.test(e))) throw new Error(`${name}: the seat's purse starved mid-proof (energy ${c.you.energy})`);
  }
  throw new Error(name + " never stood in 14 casts");
}
// The tale is the room's — a spend is counted only for the
// seat whose name the tale speaks (both seats here hold the
// same stand-in names, so the caster's name is the filter).
const summonSpend = (c) => (c.state.tale ?? []).reduce((sum, t) => {
  if (!t.text.startsWith(`${c.you.name} calls `) || !/the call (lands|falters)/.test(t.text)) return sum;
  const m = t.text.match(/\(✦(\d+)/);
  return sum + (m ? Number(m[1]) : 0);
}, 0);
const hush = a.you.company.find(c => c.name === "Hushkeeper");
a.send({ type: "summonCast", cardId: hush.id, hex: "0,0" });
await sleep(400);
check("no summon onto the star-seed's tile", !a.state.field.some(u => u.name === "Hushkeeper")
  && a.errors.some(e => e.includes("star-seed")), `errors=${a.errors.join(" | ")}`);
// The cursed-ground proof rides B's purse: A's ✦12 must
// also fund the stacking, the march and the wave below,
// and cast retries spend honestly — one seat's purse
// cannot carry every proof in an unlucky run.
const cursedTileB = b.state.map.find(t => t.cursed && axialDist(t.id, landingB) <= 1).id;
const hushB = b.you.company.find(c => c.name === "Hushkeeper");
await castUntil(b, hushB, cursedTileB, "Hushkeeper");
check("a summon cast answers on cursed ground — the call lands there", b.state.field.some(u => u.name === "Hushkeeper" && u.hex === cursedTileB));

// Stacking: three of A's band share the landing (band cap 3).
const keeper = a.you.company.find(c => c.name === "Keeper of the Low Bell");
const rootb = a.you.company.find(c => c.name === "Rootbound Confessor");
for (const card of [hush, keeper, rootb]) await castUntil(a, card, landingA, card.name);
check("stacking: three of the light share one tile", a.state.field.filter(u => u.hex === landingA).length === 3);
check("the muster was charged — every cast attempt at its named price", a.you.energy === 12 - summonSpend(a), `energy=${a.you.energy} spend=${summonSpend(a)}`);
const energyAfterStack = a.you.energy;

// THE MARCH: Rootbound steps one hex into the curse.
const rootUnit = () => a.state.field.find(u => u.name === "Rootbound Confessor");
const stepTile = neighborsOf(landingA).map(id => tileOf(a, id)).find(t => t && t.cursed && ringOf(t.id) === 1).id;
a.send({ type: "march", cardId: rootb.id, from: landingA, to: stepTile });
await a.waitFor(c => rootUnit()?.moving === true && tgtNear(rootUnit(), stepTile), "the march begins");
check("the march is bound for the cursed tile's center", rootUnit().moving === true && tgtNear(rootUnit(), stepTile),
  `tgt=${JSON.stringify(rootUnit().tgt)} center=${JSON.stringify(centerOf(stepTile))}`);
check("the march was priced by the land's law (1 hex × ✦1 for power 1)", a.you.energy === energyAfterStack - 1, `energy=${a.you.energy} afterStack=${energyAfterStack}`);
await a.waitFor(c => !rootUnit()?.moving && rootUnit()?.hex === stepTile, "the march arrives", 20000);
a.send({ type: "march", cardId: rootb.id, from: stepTile, to: landingA });
await a.waitFor(c => rootUnit()?.moving === true && tgtNear(rootUnit(), landingA), "the march back is accepted — arrival proven");
check("arrival proven by the march back (accepted from the cursed tile)", rootUnit().moving === true && tgtNear(rootUnit(), landingA));
await a.waitFor(c => !rootUnit()?.moving && rootUnit()?.hex === landingA, "the return lands", 20000);
check("the return stands on the landing", rootUnit().hex === landingA && !rootUnit().moving);
// March out again and stand patrol on the cursed tile.
a.send({ type: "march", cardId: rootb.id, from: landingA, to: stepTile });
await a.waitFor(c => rootUnit()?.moving === true && tgtNear(rootUnit(), stepTile), "patrol march begins");
await a.waitFor(c => !rootUnit()?.moving && rootUnit()?.hex === stepTile, "patrol arrives", 20000);

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
await st.join({ devName: "Map Storytender", room: "campaign-map-room" });
// The seat is claimed in the room now (Campaign Build 1) —
// and she must hold it before the deal, so her own stake
// stays out of the bank the deal seeds, as it always has.
st.send({ type: "claimStoryteller" });
await st.waitFor(c => !!c.you?.storytender, "the map storytender's claim");
const cb = client("CB");
await cb.join({ devName: "Camp Sue", room: "campaign-map-room" });
const cLanding = cb.you.landing;
check("the campaign room deals the same instance", cb.state.map.length === 127 && !!cLanding);

// The grinder musters BEFORE the deal (the purse is
// personal until the bank seeds) and takes her patrol post
// on a ring-1 tile. Under the wheel law the muster is a
// CAST that can falter — the section rides the Rootbound
// Confessor (power 1: the ✦12 purse funds her retries
// outright, where the power-7 Spark's single ✦7 cast could
// starve on one falter); the grind is a rate and her
// toughness (6) outlasts Spark's — what is proven is
// unchanged: the rate, the turning, the grinder's element,
// and the burn's isolation. Her element is root, so the
// tile turns root below.
const spark = cb.you.company.find(c => c.name === "Rootbound Confessor");
await castUntil(cb, spark, cLanding, "Rootbound Confessor");
const grindTile = neighborsOf(cLanding).map(id => tileOf(cb, id)).find(t => t && t.cursed && ringOf(t.id) === 1).id;
check("the grind tile starts at the ring law's corruption (10)", tileOf(cb, grindTile).curseHp === 10, `curseHp=${tileOf(cb, grindTile).curseHp}`);
cb.send({ type: "march", cardId: spark.id, from: cLanding, to: grindTile });
await cb.waitFor(c => c.state.field.find(u => u.name === "Rootbound Confessor")?.hex === grindTile, "the grinder marches to the cursed tile");
const sparkUnit = () => cb.state.field.find(u => u.name === "Rootbound Confessor");
await cb.waitFor(c => !sparkUnit()?.moving, "the grinder arrives on patrol", 20000);
const maxShield = sparkUnit().maxShield;

// ONE HOLLOW, dealt alone: it never strikes — it only drifts
// and drains purses that are already poured empty. So every
// point the grinder's shield loses on the cursed tile is
// the BURN's alone, and her body must stay whole. On the
// clock, the grind is a rate: her power 1 against
// corruption 10 — slow, and the window below allows it.
//
// CONTINUOUS-FIELD NOTE (Phase B): the grind is the referee's
// work and the referee ticks only while a battle runs — and
// under the ruled reach table a sky Awoken strikes four
// hexes out, so the drifting hollow is sniped down long
// before it can wander the field as it did under the old
// two-hex law, and each skirmish ends in seconds. The
// Storytender therefore keeps feeding hollows to the field
// while the grind is measured, so a battle — and so the
// referee — stays alive until the tile turns. What is
// proven is unchanged: the grind's rate, the turning, the
// element, and that the burn alone cost the grinder her shield.
st.send({ type: "stAdd", kind: "hollow" });
await st.waitFor(c => c.you?.storytender?.reserve.length === 1, "one hollow held");
st.send({ type: "stDeal" });
await cb.waitFor(c => c.state.campaign?.seeded && c.state.dark.length === 1, "the hollow is dealt");
check("the bank seeded from what the muster left (12 − the counted cast spend − the ✦1 march)", cb.state.campaign.bank === 12 - summonSpend(cb) - 1, `bank=${cb.state.campaign.bank} spend=${summonSpend(cb)}`);
{
  // The grind is observed across the kept-alive skirmish:
  // the lowest corruption seen while the tile still holds,
  // and the turning itself. (A single skirmish may end
  // before two points are ground — the hollow can spawn
  // inside the grinder's reach and die at her first strike — so
  // the rate is read over the whole feeding, not one deal.)
  let minCurse = tileOf(cb, grindTile).curseHp;
  const turnStart = Date.now();
  while (Date.now() - turnStart < 90000) {
    const t = tileOf(cb, grindTile);
    if (t.curseHp > 0) minCurse = Math.min(minCurse, t.curseHp);
    if (t.cursed === false) break;
    if (cb.state.dark.length === 0 && !cb.state.battle.active) {
      st.send({ type: "stAdd", kind: "hollow" });
      await st.waitFor(c => (c.you?.storytender?.reserve.length ?? 0) >= 1, "another hollow held", 10000).catch(() => {});
      st.send({ type: "stDeal" });
      await cb.waitFor(c => c.state.dark.length === 1, "another hollow dealt", 10000).catch(() => {});
    }
    await sleep(400);
  }
  check("the standing light grinds the corruption down, as a rate", minCurse <= 8, `minCurseHp=${minCurse}`);
  check("the tile turns under a kept-alive skirmish", tileOf(cb, grindTile).cursed === false,
    `cursed=${tileOf(cb, grindTile).cursed} curseHp=${tileOf(cb, grindTile).curseHp}`);
}
check("ground to nothing, the tile purifies", tileOf(cb, grindTile).cursed === false);
// The freeing itself turns the tile NEUTRAL (the grind is
// a freeing, not an attunement); the grinder's element
// comes after, slowly, from her standing on the purified
// ground (the standing attunement, 2026-10-21 — a first
// point at ~20 beats). The old check read the element
// whenever the skirmish happened to end and caught the
// attunement by luck; this one waits for it by name.
await cb.waitFor(c => tileOf(c, grindTile).element === "root", "the standing grinder attunes the freed tile to root", 120000).catch(() => {});
check("the freed tile is attuned in the grinder's element (root), by her standing on it", tileOf(cb, grindTile).element === "root", `element=${tileOf(cb, grindTile).element}`);
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
