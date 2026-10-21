// test45 — AWAY SEATS (Nigel, 2026-10-19): a dropped
// connection is a Tender stepping away, not leaving. The seat
// is held whole — hand, energy, standing, landing — and a
// return with the same name is handed that seat back, never
// re-dealt and never re-landed (the bug: returners were dealt
// fresh, in join order, and two friends came back standing in
// each other's landings). Proven here: the hold, the rebind,
// the steal of a stale live socket, and — in a child process
// run with a breath of a grace — the lapse that makes a held
// seat a true leaving and puts the emptied room away.
import WebSocket from "ws";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const PHASE = process.env.TEST45_PHASE || "1";
process.env.DATA_DIR = process.env.DATA_DIR || mkdtempSync(join(tmpdir(), `awoken-test45-p${PHASE}-`));
process.env.PORT = process.env.PORT || (PHASE === "2" ? "39956" : "39955");
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
const PORT = Number(process.env.PORT);

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

await import("../server/dist/index.js");
await sleep(2500);

function client(label) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/table/ws`);
  const c = { label, ws, state: null, you: null, errors: [], closed: false };
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "state") { c.state = m.state; c.you = m.you; }
    if (m.type === "error" || m.type === "joinError") c.errors.push(m.message);
  });
  ws.on("close", () => { c.closed = true; });
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

const meIn = (c) => c.state.players.find(p => p.key === c.you.key);
const taleHas = (c, text) => (c.state?.tale ?? []).some(t => t.text.includes(text));

if (PHASE === "1") {
  const a = client("A");
  await a.join({ devName: "Held Hana", room: "away-room-1" });
  const keyA = a.you.key;
  const landingA = a.you.landing;
  const energyFull = a.you.energy;
  check("the first seat stands at its landing", meIn(a).hex === landingA, `hex=${meIn(a).hex} landing=${landingA}`);

  const b = client("B");
  await b.join({ devName: "Steady Sol", room: "away-room-1" });

  // Spend from the seat, so a re-deal would show: a fresh seat
  // would return with a full purse and new card faces. The
  // summon is a CAST now (the wheel law, 2026-10-21) — it can
  // falter, and each attempt spends; the helper casts the
  // power-1 Hushkeeper until the call lands, so what the
  // return must restore is the purse AFTER all its attempts.
  const card1 = a.you.company.find(c => c.name === "Hushkeeper") ?? a.you.company[0];
  for (let i = 0; i < 12; i++) {
    a.send({ type: "summonCast", cardId: card1.id, hex: landingA });
    try { await a.waitFor(c => c.state.field.some(u => u.cardId === card1.id && u.ownerKey === keyA), "the summon stands", 2500); break; } catch { /* a falter — cast again */ }
  }
  const energySpent = a.you.energy;
  check("the summon spent from the purse", energySpent < energyFull, `energy ${energyFull} → ${energySpent}`);
  // The seat's company as it stands NOW (the cast member has
  // left it for the field): this is what a return must hand
  // back, card for card — a re-deal would mint fresh faces.
  const handIdsA = a.you.company.map(c => c.id).join(",");

  // The drop: the connection dies, as a backgrounded iPad's does.
  a.ws.terminate();
  await b.waitFor(c => c.state.players.find(p => p.key === keyA)?.away === true, "B sees the held seat");
  check("the dropped seat is HELD, marked away — not deleted", b.state.players.some(p => p.key === keyA && p.away === true));
  check("the held seat still stands on its hex", b.state.players.find(p => p.key === keyA)?.hex === landingA,
    `hex=${b.state.players.find(p => p.key === keyA)?.hex}`);
  check("the held seat's landing keeps its name on the map", b.state.map.find(t => t.id === landingA)?.landing === "Held Hana",
    `landing=${b.state.map.find(t => t.id === landingA)?.landing}`);
  check("the tale speaks of stepping away, not leaving", taleHas(b, "steps away from the Table — their seat is held."));
  check("the held seat's Awokin still stands on the field", b.state.field.some(u => u.cardId === card1.id && u.ownerKey === keyA));
  check("the party list carries the away marker for the client", b.state.players.find(p => p.key === keyA)?.away === true);

  // The return: same name, new socket — the seat comes back whole.
  const a2 = client("A2");
  await a2.join({ devName: "Held Hana", room: "away-room-1" });
  check("the returner is the same seat", a2.you.key === keyA, `key=${a2.you.key}`);
  check("the returner stands where they stood", meIn(a2).hex === landingA, `hex=${meIn(a2).hex} landing=${landingA}`);
  check("the purse was NOT refilled — no re-deal", a2.you.energy === energySpent, `energy=${a2.you.energy} spent=${energySpent}`);
  check("the company is the same company, card for card", a2.you.company.map(c => c.id).join(",") === handIdsA);
  check("the returned seat is no longer marked away", meIn(a2).away === false || meIn(a2).away === undefined, `away=${meIn(a2).away}`);
  check("the Awokin still stands after the return", a2.state.field.some(u => u.cardId === card1.id && u.ownerKey === keyA));
  check("the tale welcomes the seat back", taleHas(a2, "returns to the Table — their seat was held."));
  await b.waitFor(c => c.state.players.find(p => p.key === keyA)?.away !== true, "B sees the return");
  check("the friend sees the seat live again", true);

  // The steal: the same name arrives on a third socket while
  // the second still lives (a zombie connection, a second
  // device). The seat moves over whole; the stale socket is
  // closed by the server and its ghost-close must NOT hold
  // the seat away from its new home.
  const a3 = client("A3");
  await a3.join({ devName: "Held Hana", room: "away-room-1" });
  check("the third arrival takes the same seat", a3.you.key === keyA && meIn(a3).hex === landingA, `hex=${meIn(a3).hex}`);
  check("the stolen seat keeps its purse", a3.you.energy === energySpent, `energy=${a3.you.energy}`);
  await a3.waitFor(() => a2.closed, "the stale socket is closed by the server");
  check("the stale socket was closed by the server", a2.closed);
  await sleep(800); // the ghost-close lands on the server here
  await b.waitFor(c => c.state.players.filter(p => p.key === keyA).length === 1, "one seat, once");
  check("exactly one seat stands for the returned Tender", b.state.players.filter(p => p.key === keyA).length === 1);
  check("the ghost-close did not hold the seat away", b.state.players.find(p => p.key === keyA)?.away !== true,
    `away=${b.state.players.find(p => p.key === keyA)?.away}`);
  check("the seat's hex survived the steal", b.state.players.find(p => p.key === keyA)?.hex === landingA);

  a3.ws.close(); b.ws.close();

  // Phase 2 runs as a child with a breath of a grace period.
  const childEnv = {
    ...process.env,
    TEST45_PHASE: "2",
    TABLE_AWAY_GRACE_MS: "1200",
    DATA_DIR: mkdtempSync(join(tmpdir(), "awoken-test45-p2-")),
    PORT: "39956",
  };
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], { env: childEnv, stdio: "inherit" });
  const code = await new Promise(r => child.on("exit", r));
  check("phase 2 (the lapse) passes in its own process", code === 0, `exit=${code}`);

  console.log(`\ntest45: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

// ── Phase 2: the lapse. Grace is 1200ms (env), the reaper
// sweeps every 5s. Two seats step away and never return: the
// grace lapses, the room is put away, and the next arrival
// finds a fresh Table — no held seats, no old landings.
{
  const c = client("C");
  await c.join({ devName: "Brief Bea", room: "away-room-2" });
  const landingC = c.you.landing;
  const d = client("D");
  await d.join({ devName: "Brief Dan", room: "away-room-2" });
  check("phase 2: both seats dealt their landings", !!landingC && !!d.you.landing && landingC !== d.you.landing);

  c.ws.terminate(); d.ws.terminate();
  await sleep(10000); // grace (1.2s) + a full reaper sweep, with room to spare

  const c2 = client("C2");
  await c2.join({ devName: "Brief Bea", room: "away-room-2" });
  check("phase 2: the lapsed room is gone — the tale is fresh", !taleHas(c2, "steps away"), (c2.state.tale ?? []).map(t => t.text).join(" | "));
  check("phase 2: the fresh tale opens with a taking of seats", taleHas(c2, "takes a seat at the Table."));
  const namedLandings = c2.state.map.filter(t => t.landing);
  check("phase 2: only the new arrival's landing is named", namedLandings.length === 1 && namedLandings[0].landing === "Brief Bea",
    `named=${namedLandings.map(t => `${t.id}:${t.landing}`).join(",")}`);
  check("phase 2: the field is empty in the fresh room", c2.state.field.length === 0);
  check("phase 2: the returner sits alone — no held ghosts", c2.state.players.length === 1, `players=${c2.state.players.length}`);
  c2.ws.close();

  console.log(`\ntest45 phase 2: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
