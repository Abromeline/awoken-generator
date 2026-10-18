// test40 — THE BASTION FALLS (Phase B, TABLE-DESIGN §4.4):
// spend the bank dry, let the dark clear the field, and the
// star-seed is assaulted to the campaign's end by the
// enemy's right — no division, the light is lost.
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

// Twelve Unravelers: a doom no three-card band out-kills.
for (let i = 0; i < 12; i++) st.send({ type: "stAdd", kind: "unraveler" });
await st.waitFor(c => c.you?.storytender?.reserve.length === 12, "doom held");
st.send({ type: "stDeal" });
await a.waitFor(c => c.state.campaign?.seeded && c.state.dark.length === 12, "doom dealt");
check("bank seeded at one stake (12)", a.state.campaign.bank === 12, `bank=${a.state.campaign.bank}`);

// Spend the bank to nothing: Spark (7) + Mothwing (4) +
// Hushkeeper (1) = 12, a full band of three. (The Instance
// Map: the muster stands together on the seat's purified
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
check("bank spent dry by the muster", a.state.campaign.bank === 0, `bank=${a.state.campaign.bank}`);

// The dark clears the field; then, with no cast affordable,
// the assault falls on the seed itself.
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
