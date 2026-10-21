// CAMPAIGN BUILD 1 DRIVE — THE SEAT AND THE STATE (2026-10-21).
// Boots the real server in-process on a scratch DATA_DIR (with
// the away grace shortened to 1.5 s by the server's own env
// measure, TABLE_AWAY_GRACE_MS) and proves:
//   §A THE SEAT — a campaign starts with its storyteller seat
//      UNCLAIMED; a seated participant claims it with the
//      claimStoryteller road; a second claim is refused while
//      the first stands; the holder grants the panel to another
//      participant and revokes it; a non-holder's grant is
//      refused.
//   §B BORN CURSED (Nigel, 2026-10-21 15:45 — the default tile
//      of every map is the curse) — a fresh campaign map is
//      127 cursed hexes, 0 cleansed, the seed's own ground
//      cursed at ring-0 corruption; a tender's arrival holds
//      back exactly their landing (existing arrival play).
//      CONTROL: a casual room's map keeps the old law (the
//      seed cleansed, 126 cursed), and a claim at a casual
//      table is refused plainly.
//   §C THE LAPSE — the holder steps away: within the grace the
//      seat stands claimed; past it, the seat returns to
//      unclaimed and the holder's grants fall with it.
//   §D THE TENDER'S SEAT IN A CAMPAIGN — a bound Tender seats
//      and stands in a campaign: their landing is assigned,
//      their figure stands on the map, and their seat payload
//      reads their true class.
// SUPERSEDED MID-BUILD (Nigel, 2026-10-21 16:26 — the Table's
// deck hand is retired in favour of wheel summoning, and
// cursed-land casting is re-ruled): this drive asserts NOTHING
// about hands, deals, or summon refusals. Those belong to the
// wheel build queued next.
// Run: node scripts/drive-campaign-seat.mjs
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-campaign-seat-"));
process.env.PORT = "3987";
process.env.TABLE_AWAY_GRACE_MS = "1500";
process.env.WORKSHOP_PASSWORD = "campaign-seat-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3987";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

await import("../server/dist/index.js");
await sleep(2500);

async function call(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
// Fresh-DB stand-up for the known store migration-order
// defect (production untouched — the Audit carries it).
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }

async function claimBound(name, discordId) {
  const claim = await call("claimTender", { password: "campaign-seat-password", tenderName: name });
  const token = claim.token;
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, Date.now());
  await call("chooseClass", { classKey: "warden" }, token);
  await call("chooseWeapon", { weaponKey: "sword" }, token);
  const { issueTableToken } = await import("../server/dist/table.js");
  const tt = issueTableToken({ id: discordId, name });
  const code = (await call("getTableBindCode", {}, token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code }) });
  if (!bindRes.ok) throw new Error(`table/bind -> ${bindRes.status}`);
  return { token, ownerKey, tt };
}

function client(label) {
  const ws = new WebSocket("ws://127.0.0.1:3987/table/ws");
  const c = { label, ws, state: null, you: null, errors: [] };
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "state") { c.state = m.state; c.you = m.you; }
    if (m.type === "error" || m.type === "joinError") c.errors.push(m.message);
  });
  c.send = (msg) => ws.send(JSON.stringify(msg));
  c.join = (joinMsg) => new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error(`${label}: join timeout`)), 15000);
    ws.on("open", () => {
      c.send({ type: "join", ...joinMsg });
      const iv = setInterval(() => { if (c.state) { clearInterval(iv); clearTimeout(to); resolve(); } }, 100);
    });
  });
  c.waitFor = async (fn, what, timeout = 20000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) { if (c.state && fn(c)) return true; await sleep(200); }
    throw new Error(`${label}: timed out waiting for ${what}; errors: ${c.errors.join(" | ")}; tale tail: ${(c.state?.tale ?? []).slice(-3).map((t) => t.text).join(" | ")}`);
  };
  return c;
}

/* ── §A THE SEAT ─────────────────────────────────────────── */
{
  console.log("§A the seat — unclaimed at the door, claimed in the room");
  const a = client("A");
  await a.join({ devName: "Alice", room: "campaign-seat-a" });
  ok("a fresh campaign's storyteller seat stands UNCLAIMED",
    a.state.campaign && a.state.campaign.storytellerKey === null && a.state.campaign.storytenderName === null,
    JSON.stringify(a.state.campaign));
  const b = client("B");
  await b.join({ devName: "Bob", room: "campaign-seat-a" });
  ok("no one arrives as the storyteller — both seats are plain participants",
    a.state.players.every((p) => !p.storytender) && !a.you.storytender && !b.you.storytender);

  a.send({ type: "claimStoryteller" });
  await a.waitFor((c) => c.state.campaign.storytellerKey === c.you.key, "Alice's claim to land");
  ok("a seated participant claims the seat — the campaign record names her key and name",
    a.state.campaign.storytellerKey === a.you.key && a.state.campaign.storytenderName === "Alice");
  ok("the claimant's own payload gains the storytender's instruments",
    !!a.you.storytender && typeof a.you.storytender.bank === "number");
  await b.waitFor((c) => c.state.campaign.storytellerKey === a.state.campaign.storytellerKey && c.state.campaign.storytenderName === "Alice", "Bob to see the claimed seat");
  ok("every seat sees who holds the storyteller's seat", b.state.campaign.storytenderName === "Alice");

  const errBefore = b.errors.length;
  b.send({ type: "claimStoryteller" });
  await sleep(700);
  ok("a second claim is refused in plain words while the first stands",
    b.errors.slice(errBefore).some((e) => /seat is held by Alice/.test(e)), JSON.stringify(b.errors.slice(errBefore)));
  ok("the refused claim changed nothing", b.state.campaign.storytellerKey === a.you.key);

  const bobKey = b.you.key;
  a.send({ type: "grantPanel", targetKey: bobKey });
  await b.waitFor((c) => (c.state.campaign.panelAccess ?? []).includes(bobKey), "the grant to reach Bob");
  ok("the holder grants the panel — the access stands in the shared state",
    (b.state.campaign.panelAccess ?? []).includes(bobKey));
  a.send({ type: "revokePanel", targetKey: bobKey });
  await b.waitFor((c) => !(c.state.campaign.panelAccess ?? []).includes(bobKey), "the revocation to reach Bob");
  ok("the holder revokes the panel — the access is gone", !(b.state.campaign.panelAccess ?? []).includes(bobKey));

  const errB = b.errors.length;
  b.send({ type: "grantPanel", targetKey: a.you.key });
  await sleep(700);
  ok("a non-holder's grant is refused",
    b.errors.slice(errB).some((e) => /Only the seated Storyteller grants the panel/.test(e)), JSON.stringify(b.errors.slice(errB)));
  a.ws.close(); b.ws.close();
}

/* ── §B BORN CURSED ─────────────────────────────────────── */
{
  console.log("§B born cursed — the default tile of the map is the curse");
  const w = client("W");
  await w.join({ watch: true, name: "Map Watcher", room: "campaign-seat-b" });
  const map = w.state.map;
  ok("a fresh campaign map is 127 hexes", map.length === 127, String(map.length));
  ok("every hex is cursed — 127 cursed, 0 cleansed",
    map.every((t) => t.cursed === true), `${map.filter((t) => t.cursed).length} cursed`);
  const seed = map.find((t) => t.id === "0,0");
  ok("the seed's own ground is cursed too, at ring-0 corruption (4)",
    !!seed && seed.cursed === true && seed.curseHp === 4, JSON.stringify(seed));

  const t = client("T");
  await t.join({ devName: "Tess", room: "campaign-seat-b" });
  const held = t.state.map.filter((x) => !x.cursed);
  ok("a tender's arrival holds back exactly their landing — play, not a born exception",
    held.length === 1 && held[0].id !== "0,0" && t.state.map.find((x) => x.id === "0,0").cursed === true,
    `${held.length} held: ${held.map((x) => x.id).join(",")}`);
  w.ws.close(); t.ws.close();

  const cw = client("CW");
  await cw.join({ watch: true, name: "Casual Watcher", room: "seat-casual-control" });
  const cmap = cw.state.map;
  ok("CONTROL: a casual map keeps the old law — the seed cleansed, 126 cursed",
    cmap.find((x) => x.id === "0,0").cursed === false && cmap.filter((x) => x.cursed).length === 126,
    `${cmap.filter((x) => x.cursed).length} cursed`);
  const ct = client("CT");
  await ct.join({ devName: "Cas", room: "seat-casual-control" });
  const errC = ct.errors.length;
  ct.send({ type: "claimStoryteller" });
  await sleep(700);
  ok("a claim at a casual table is refused plainly — the seat belongs to a campaign",
    ct.errors.slice(errC).some((e) => /no Storyteller's seat at a casual table/.test(e)), JSON.stringify(ct.errors.slice(errC)));
  cw.ws.close(); ct.ws.close();
}

/* ── §C THE LAPSE ────────────────────────────────────────── */
{
  console.log("§C the lapse — away within grace holds the seat; past it, the seat stands unclaimed");
  const d = client("D");
  await d.join({ devName: "Dave", room: "campaign-seat-c" });
  const carol = client("C");
  await carol.join({ devName: "Carol", room: "campaign-seat-c" });
  carol.send({ type: "claimStoryteller" });
  await carol.waitFor((c) => c.state.campaign.storytellerKey === c.you.key, "Carol's claim");
  carol.send({ type: "grantPanel", targetKey: d.you.key });
  await d.waitFor((c) => (c.state.campaign.panelAccess ?? []).includes(d.you.key), "Carol's grant to Dave");
  const carolKey = carol.you.key;
  carol.ws.close();
  await sleep(800);
  ok("within the away grace, the stepped-away holder still holds the seat",
    d.state.campaign.storytellerKey === carolKey, JSON.stringify(d.state.campaign));
  await d.waitFor((c) => c.state.campaign.storytellerKey === null, "the seat to fall vacant", 25000);
  ok("past the grace, the storyteller's seat returns to UNCLAIMED",
    d.state.campaign.storytellerKey === null && d.state.campaign.storytenderName === null);
  ok("the lapsed holder's grants fall with the seat",
    (d.state.campaign.panelAccess ?? []).length === 0, JSON.stringify(d.state.campaign.panelAccess));
  d.ws.close();
}

/* ── §D THE TENDER'S SEAT IN A CAMPAIGN ──────────────────── */
{
  console.log("§D the tender's seat — a bound Tender seats, stands, and reads true in a campaign");
  const P = await claimBound("Seat Tender", "cs-d");
  const b = client("D2");
  await b.join({ authToken: P.tt, room: "campaign-seat-d" });
  ok("the bound seat stands in the campaign — bound to its Tender by name",
    !!b.you.bound && b.you.bound === "Seat Tender", JSON.stringify({ bound: b.you.bound }));
  ok("the seat payload reads the Tender's true class (Warden, chosen at the choosing)",
    b.you.classKey === "warden", JSON.stringify({ classKey: b.you.classKey }));
  ok("the seat is assigned its landing on the born-cursed board",
    typeof b.you.landing === "string" && b.you.landing !== "0,0", JSON.stringify({ landing: b.you.landing }));
  const me = b.state.players.find((p) => p.key === b.you.key);
  ok("the Tender's figure stands on the map at their landing",
    !!me && me.hex === b.you.landing, JSON.stringify(me && { hex: me.hex }));
  ok("the campaign's seed ground is cursed under the new law",
    b.state.map.find((x) => x.id === "0,0").cursed === true);
  b.send({ type: "roll", sides: 20 });
  await b.waitFor((c) => c.state.tale.some((t) => /Seat Tender rolled d20/.test(t.text)), "the roll in the tale");
  ok("the table's ordinary roads still run in a campaign (a roll is cast and told)", true);
  b.ws.close();
}

console.log(`\ndrive-campaign-seat: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
