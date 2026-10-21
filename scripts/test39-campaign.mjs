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
await st.join({ devName: "Storyteller Sue", room: ROOM });
check("no one arrives as the storyteller — she sat as a participant, dealt a roster", (st.you?.hand ?? []).length === 10 && st.you?.storytender === null);
// THE SEAT IS CLAIMED IN THE ROOM (Campaign Build 1, Nigel,
// 2026-10-21): the door no longer confers the storytender's
// seat — a seated participant claims it while it is unclaimed.
st.send({ type: "claimStoryteller" });
await st.waitFor(c => !!c.you?.storytender, "Sue's claim on the seat");
check("storytender seated with her instruments — by her claim, in the room", !!st.you?.storytender);
check("room reports campaign mode", st.state.mode === "campaign");

const a = client("A");
await a.join({ devName: "Tender A", room: ROOM });
const b = client("B");
await b.join({ devName: "Tender B", room: ROOM });
check("tenders dealt stand-in rosters", (a.you?.hand ?? []).length === 10 && (b.you?.hand ?? []).length === 10);
check("tender has no storytender instruments", a.you?.storytender === null);
check("party rail marks the storytender", st.state.players.some(p => p.storytender && p.name === "Storyteller Sue"));
check("all three seats stand in the players view — the storyteller among them", a.state.players.length === 3);

const st2 = client("ST2");
await st2.join({ devName: "Second Sue", room: ROOM });
st2.send({ type: "claimStoryteller" });
await sleep(700);
check("a second claim is refused while the seat is held (she sits as a tender)", st2.you?.storytender === null && (st2.you?.hand ?? []).length === 10 && st2.errors.some(e => /seat is held by Storyteller Sue/.test(e)), JSON.stringify(st2.errors));
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
//
// CONTINUOUS-FIELD NOTE (Phase B): under the ruled reach
// table the lone Hushkeeper (tide, three hexes) fells
// approaching dark from the first seconds — under the old
// two-hex road law the dealt three were still walking when
// this check read the bank, and it read exactly 23. The
// cast's charge is the same law it always was; the check
// now nets the bank against the harvest the tale itself
// records, so what is proven is the charge, exactly.
const harvestedSoFar = (c) => (c.state.tale ?? []).reduce((sum, t) => {
  const m = t.text.match(/✦(\d+) joins the bank/);
  return sum + (m ? Number(m[1]) : 0);
}, 0);
const hush = a.you.hand.find(c => c.name === "Hushkeeper");
// The Instance Map: summons land on the seat's own purified
// landing tile (stacking lets the band share it).
const freeHex = a.you.landing;
a.send({ type: "summon", cardId: hush.id, hex: freeHex });
await a.waitFor(c => c.state.field.some(u => u.name === "Hushkeeper"), "hushkeeper stands");
check("cast charged the bank (24 → 23, plus the light's own harvest)",
  a.state.campaign.bank === 23 + harvestedSoFar(a),
  `bank=${a.state.campaign.bank} harvested=${harvestedSoFar(a)}`);

// The kill: under the old referee the first dealing's dark
// struck from anywhere and the lone Hushkeeper fell to it.
// On the clock and the big map she fells each approaching
// thing at reach, one strike at a time — what brings her
// down is a swarm arriving faster than her cadence: Fray,
// skittering, more claws than she can answer.
//
// CONTINUOUS-FIELD NOTE (Phase B): the swarm is twenty, not
// ten. On the continuous field the hunt spreads the dark —
// some run at her, the rest gate at the seed and are felled
// at her reach one by one — and ten no longer guarantees
// the overwhelm: in one run of this test she beat ten
// outright. Twenty restores the premise the law needs —
// more claws arrive than one cadence can answer — and the
// dissipation it proves is the same event it always was.
for (let i = 0; i < 20; i++) st.send({ type: "stAdd", kind: "fray" });
await st.waitFor(c => c.you?.storytender?.reserve.length === 20, "the swarm held");
// The first deal's three may already be felled and harvested
// (the note above) — the swarm is ten MORE dark, counted
// against however many still stand.
const aliveBeforeSwarm = a.state.dark.length;
st.send({ type: "stDeal" });
// A rise of six or more can only be the swarm arriving —
// an exact count is not readable here: the first deal's
// survivors are still falling to the Hushkeeper's reach
// while the count is being taken.
await a.waitFor(c => c.state.dark.length > aliveBeforeSwarm + 5, "the swarm is dealt");

// The Unraveler hunts it; wait for the dissipation, then the
// recast must cost double.
await a.waitFor(c => c.you?.recasts?.[hush.id] === 1, "dissipation counted", 90000);
check("dissipation counted for the recast law", a.you.recasts[hush.id] === 1);
check("the card returned to the roster", a.you.hand.some(c => c.id === hush.id));
const bankBefore = a.state.campaign.bank;
const harvestBefore = harvestedSoFar(a);
const freeHex2 = a.you.landing;
a.send({ type: "summon", cardId: hush.id, hex: freeHex2 });
await a.waitFor(c => c.state.field.some(u => u.name === "Hushkeeper"), "recast stands");
// Netted against the interval's harvest, as the cast check
// above: the recast Hushkeeper strikes at tide's reach the
// moment she stands, and a felling in the same breath must
// not be allowed to mask the double charge.
check("recast charged double (bank fell by 2, net of harvest)",
  (bankBefore - a.state.campaign.bank) + (harvestedSoFar(a) - harvestBefore) === 2,
  `bankDelta=${bankBefore - a.state.campaign.bank} harvestDelta=${harvestedSoFar(a) - harvestBefore}`);

// The swarm is still on the field, clawing at the gate —
// the Storytender calls it off entirely (mercy, unharvested),
// so the room is calm for what follows.
for (const d of [...a.state.dark]) st.send({ type: "stDissipate", hex: d.hex, id: d.id });
await a.waitFor(c => c.state.dark.length === 0 && !c.state.battle.active, "the field is called off", 30000);

// Mercy is unharvested: one fresh Fray, dealt and dismissed.
st.send({ type: "stAdd", kind: "fray" });
await st.waitFor(c => c.you?.storytender?.reserve.length === 1, "one fray held for mercy");
st.send({ type: "stDeal" });
await a.waitFor(c => c.state.dark.length === 1, "the mercy fray is dealt");
const bankM = a.state.campaign.bank;
const someDark = a.state.dark[0];
st.send({ type: "stDissipate", hex: someDark.hex, id: someDark.id });
await a.waitFor(c => !c.state.dark.some(d => d.id === someDark.id), "mercy dissipation");
check("storytender's mercy pays no harvest", a.state.campaign.bank === bankM, `bank=${a.state.campaign.bank} was ${bankM}`);

// Narration + scene ride the shared state.
st.send({ type: "stNarrate", text: "The lamps are lit. Something walks the road." });
st.send({ type: "stScene", title: "The Gate at Lamplight", text: "A gate, a road, a held breath.", imageUrl: "https://example.com/gate.png" });
await a.waitFor(c => c.state.campaign?.stage?.title === "The Gate at Lamplight", "scene set");
check("scene is on the shared stage", a.state.campaign.stage.text.includes("held breath"));
check("narration entered the tale", a.state.tale.some(t => t.text.includes("Something walks the road")));

// Adjourn + resume: everyone steps away (AWAY SEATS,
// 2026-10-19: a closed socket within the grace is a held
// seat, not a leaving — the room waits, the snapshot rests),
// then each return is handed their own seat back whole.
st.send({ type: "stAdjourn" });
await sleep(300);
const bankAtAdjourn = a.state.campaign.bank;
for (const c of [st, a, b]) c.ws.close();
await sleep(600);
const stR = client("ST-R");
await stR.join({ devName: "Storyteller Sue", room: ROOM });
check("adjourned campaign restored its bank", stR.state.campaign.bank === bankAtAdjourn, `bank=${stR.state.campaign.bank} was ${bankAtAdjourn}`);
check("adjourned campaign restored its tale", stR.state.tale.some(t => t.text.includes("poured into one bank")));
const aR = client("A-R");
await aR.join({ devName: "Tender A", room: ROOM });
// A return within the grace REBINDS the held seat — it is
// not a fresh arrival, so no fresh stake is minted into the
// bank (that pour belongs to genuinely new seats only; a
// rebind that re-poured would print energy from nothing on
// every reconnect). The bank stands exactly as adjourned.
check("rejoined tender's seat is restored whole — no fresh stake minted", aR.state.campaign.bank === bankAtAdjourn, `bank=${aR.state.campaign.bank}`);

// Settlement: the Storytender ends it; the leftover divides.
stR.send({ type: "stEnd" });
await aR.waitFor(c => c.state.campaign?.over === "ended", "campaign ended");
check("campaign ended by choice", aR.state.campaign.over === "ended");
check("leftover divided to the seated tender", aR.you.energy === Math.floor(bankAtAdjourn / 1), `energy=${aR.you.energy}`);

// Casual regression: the ladder still deals in a casual room.
const cas = client("CAS");
await cas.join({ devName: "Casual Cal", room: "the-table" });
check("casual room reports casual mode", cas.state.mode === "casual" && cas.state.campaign === null);
cas.send({ type: "startWave" });
await cas.waitFor(c => c.state.dark.length > 0 && c.state.battle.active, "casual wave dealt");
check("casual ladder still deals", cas.state.dark.length > 0);

console.log(`\ntest39: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
