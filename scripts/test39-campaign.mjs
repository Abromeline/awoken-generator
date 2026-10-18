// test39 — THE CAMPAIGN (Phase B): Storytender seating and
// privacy, bank seeding, bank-charged casts, the recast
// multiplier proven on a real dissipation, unharvested mercy,
// adjourn/resume persistence, settlement division — and a
// casual-room regression (the ladder still deals).
import WebSocket from "ws";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-test39-"));
process.env.PORT = "39951";
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
  const ws = new WebSocket("ws://127.0.0.1:39951/table/ws");
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

const ROOM = "campaign-test39";
const st = client("ST");
await st.join({ devName: "Storyteller Sue", room: ROOM, storytender: true });
check("storytender seated with her instruments", !!st.you?.storytender);
check("storytender holds no hand", (st.you?.hand ?? [1]).length === 0);
check("room reports campaign mode", st.state.mode === "campaign");

const a = client("A");
await a.join({ devName: "Tender A", room: ROOM });
const b = client("B");
await b.join({ devName: "Tender B", room: ROOM });
check("tenders dealt stand-in rosters", (a.you?.hand ?? []).length === 10 && (b.you?.hand ?? []).length === 10);
check("tender has no storytender instruments", a.you?.storytender === null);
check("party rail marks the storytender", st.state.players.some(p => p.storytender && p.name === "Storyteller Sue"));
check("storytender not counted as a tender seat in players energy view", a.state.players.length === 3);

const st2 = client("ST2");
await st2.join({ devName: "Second Sue", room: ROOM, storytender: true });
check("second storytender refused the seat (sits as tender)", st2.you?.storytender === null && (st2.you?.hand ?? []).length === 10);
st2.ws.close();
await sleep(300);

// Compose + privacy of the reserve.
st.send({ type: "stAdd", kind: "fray" });
st.send({ type: "stAdd", kind: "fray" });
st.send({ type: "stAdd", kind: "unraveler" });
await st.waitFor(c => c.you?.storytender?.reserve.length === 3, "reserve of 3");
check("reserve held: 3 pieces, threat 6", st.you.storytender.reserveThreat === 6, `threat=${st.you.storytender.reserveThreat}`);
check("reserve is sealed from tenders", !("reserve" in (a.state.campaign ?? {})) && a.you?.storytender === null);

// Deal: bank seeds from the two tenders' stakes (12 + 12).
st.send({ type: "stDeal" });
await a.waitFor(c => c.state.dark.length === 3 && c.state.campaign?.seeded, "deal + seed");
check("dark dealt onto the field", a.state.dark.length === 3);
check("bank seeded from stakes (24)", a.state.campaign.bank === 24, `bank=${a.state.campaign.bank}`);
check("tender's purse view is the bank", a.you.energy === 24, `energy=${a.you.energy}`);
check("the seed tale was told", a.state.tale.some(t => t.text.includes("poured into one bank")));

// A cast draws on the bank.
const hush = a.you.hand.find(c => c.name === "Hushkeeper");
const freeHex = (() => {
  const taken = new Set([...a.state.dark.map(d => d.hex), ...a.state.field.map(u => u.hex)]);
  return ["hex-0-0", "hex-0-1", "hex-1-0", "hex-5-4", "hex-5-0", "hex-0-4"].find(h => !taken.has(h));
})();
a.send({ type: "summon", cardId: hush.id, hex: freeHex });
await a.waitFor(c => c.state.field.some(u => u.name === "Hushkeeper"), "hushkeeper stands");
check("cast charged the bank (24 → 23)", a.state.campaign.bank === 23, `bank=${a.state.campaign.bank}`);

// The Unraveler hunts it; wait for the dissipation, then the
// recast must cost double.
await a.waitFor(c => c.you?.recasts?.[hush.id] === 1, "dissipation counted", 90000);
check("dissipation counted for the recast law", a.you.recasts[hush.id] === 1);
check("the card returned to the roster", a.you.hand.some(c => c.id === hush.id));
const bankBefore = a.state.campaign.bank;
const freeHex2 = (() => {
  const taken = new Set([...a.state.dark.map(d => d.hex), ...a.state.field.map(u => u.hex)]);
  return ["hex-0-0", "hex-0-1", "hex-1-0", "hex-5-4", "hex-5-0", "hex-0-4", "hex-3-2"].find(h => !taken.has(h));
})();
a.send({ type: "summon", cardId: hush.id, hex: freeHex2 });
await a.waitFor(c => c.state.field.some(u => u.name === "Hushkeeper"), "recast stands");
check("recast charged double (bank fell by 2)", bankBefore - a.state.campaign.bank === 2, `delta=${bankBefore - a.state.campaign.bank}`);

// Mercy is unharvested.
const bankM = a.state.campaign.bank;
const someDark = a.state.dark[0];
st.send({ type: "stDissipate", hex: someDark.hex });
await a.waitFor(c => !c.state.dark.some(d => d.hex === someDark.hex), "mercy dissipation");
check("storytender's mercy pays no harvest", a.state.campaign.bank === bankM, `bank=${a.state.campaign.bank} was ${bankM}`);

// Narration + scene ride the shared state.
st.send({ type: "stNarrate", text: "The lamps are lit. Something walks the road." });
st.send({ type: "stScene", title: "The Gate at Lamplight", text: "A gate, a road, a held breath.", imageUrl: "https://example.com/gate.png" });
await a.waitFor(c => c.state.campaign?.stage?.title === "The Gate at Lamplight", "scene set");
check("scene is on the shared stage", a.state.campaign.stage.text.includes("held breath"));
check("narration entered the tale", a.state.tale.some(t => t.text.includes("Something walks the road")));

// Adjourn + resume: everyone leaves (room dies, snapshot
// rests), then the room reopens with its bank and tale.
st.send({ type: "stAdjourn" });
await sleep(300);
const bankAtAdjourn = a.state.campaign.bank;
for (const c of [st, a, b]) c.ws.close();
await sleep(600);
const stR = client("ST-R");
await stR.join({ devName: "Storyteller Sue", room: ROOM, storytender: true });
check("adjourned campaign restored its bank", stR.state.campaign.bank === bankAtAdjourn, `bank=${stR.state.campaign.bank} was ${bankAtAdjourn}`);
check("adjourned campaign restored its tale", stR.state.tale.some(t => t.text.includes("poured into one bank")));
const aR = client("A-R");
await aR.join({ devName: "Tender A", room: ROOM });
check("rejoined tender pours a fresh stake into the restored bank", aR.state.campaign.bank === bankAtAdjourn + 12, `bank=${aR.state.campaign.bank}`);

// Settlement: the Storytender ends it; the leftover divides.
stR.send({ type: "stEnd" });
await aR.waitFor(c => c.state.campaign?.over === "ended", "campaign ended");
check("campaign ended by choice", aR.state.campaign.over === "ended");
check("leftover divided to the seated tender", aR.you.energy === Math.floor((bankAtAdjourn + 12) / 1), `energy=${aR.you.energy}`);

// Casual regression: the ladder still deals in a casual room.
const cas = client("CAS");
await cas.join({ devName: "Casual Cal", room: "the-table" });
check("casual room reports casual mode", cas.state.mode === "casual" && cas.state.campaign === null);
cas.send({ type: "startWave" });
await cas.waitFor(c => c.state.dark.length > 0 && c.state.battle.active, "casual wave dealt");
check("casual ladder still deals", cas.state.dark.length > 0);

console.log(`\ntest39: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
