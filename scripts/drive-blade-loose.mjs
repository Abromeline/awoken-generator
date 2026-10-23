// THE SINGLE BLADE, CLICK-TO-LOOSE — RECOVERY R4'S DRIVE
// (Nigel, 2026-10-20 spec; re-ruled 2026-10-23).
// Boots the real server on a scratch DATA_DIR and proves:
//   §A THE HOMELAND (the server referee, actions.ts):
//      (1) a written Blade WAITS armed — a dark thing
//          standing on its ground does NOT spring it;
//      (2) a click on a dark thing within two hexes looses
//          it for the book's flat harm (6) and spends a
//          charge;
//      (3) a click out of reach is answered plainly (400,
//          the reach named) and the Blade stays armed;
//      (4) with two armed Blades, the NEAREST answers;
//      (5) the new proximity rune — the Springing Blade —
//          springs on proximity as the Blade used to, and
//          a cast one springs at its writing, as the Blade
//          used to at its writing.
//   §B THE TABLE (the server referee, table.ts, over the
//      real websocket): a cast Blade waits while the dark
//      stands on it; a looseBlade order naming a dark with
//      no Blade armed is answered plainly; the click
//      looses the Blade for exactly 6 and spends a charge,
//      and the flight is served in the state; the Springing
//      Blade cast on a dark's ground springs at the cast.
// Run: node scripts/drive-blade-loose.mjs
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

const OUT = "/home/hatch/workspace/blade-loose-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-blade-"));
process.env.PORT = "3993";
process.env.WORKSHOP_PASSWORD = "<MASKED_SECRET_001>";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3993";
const PW = "blade-drive-password";
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
  return data?.data ?? data;
}
async function callRaw(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up */ }

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

async function claim(name, exp, classKey) {
  const c = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(c.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  const now = Date.now();
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, exp, now);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(ownerKey, now);
  if (classKey) await call("chooseClass", { classKey }, c.token);
  return { token: c.token, ownerKey, tenderId };
}
function seedAwokin(ownerKey, tenderName, name, partPower = 2) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, 'root', ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, partPower, partPower, `blade/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: partPower, toughness: partPower, element: "root" });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `blade/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}

/* ══ §A THE HOMELAND ══════════════════════════════════════ */
console.log("§A the homeland — the Blade waits, the click looses, the Springing Blade springs");
const T = await claim("Blade Tender", 3800, "runewright");
const tileId = new Map();
{
  const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', 0, ?)");
  const now = Date.now();
  for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > 4) continue;
    tileId.set(`${q},${r}`, Number(insTile.run(T.ownerKey, q, r, now).lastInsertRowid));
  }
}
await call("getTerritory", {}, T.token); // the land stands (the Tender's stand settles at the heart)

const seedWorking = (spellKey, engine, q, r, charges = 2) => Number(db.prepare(
  `INSERT INTO territory_workings (owner_key, spell_key, engine, kind, hue, tile_id, edge_key, q, r, dir, nums, hp, stops, charges, pour, max_hp, created_at)
   VALUES (?, ?, ?, 'rune', 'unaligned', ?, NULL, ?, ?, NULL, ?, 0, 0, ?, 0, 0, ?)`)
  .run(T.ownerKey, spellKey, engine, tileId.get(`${q},${r}`), q, r, JSON.stringify({ power: 6, brightBonus: 1, charges: 2 }), charges, Date.now()).lastInsertRowid);
const seedDark = (q, r, hp = 20) => Number(db.prepare(
  `INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
   VALUES (?, ?, 'tangle', ?, ?, ?, ?, 3, 14, 0)`)
  .run(T.ownerKey, tileId.get(`${q},${r}`), Date.now(), hp, q, r).lastInsertRowid);
const workingRow = (id) => db.prepare("SELECT id, engine, charges FROM territory_workings WHERE id = ?").get(id);
const darkHp = (id) => db.prepare("SELECT hp FROM homeland_wanderers WHERE id = ?").get(id)?.hp;

// (1) The Blade waits armed with the dark standing on it.
// (The living battle nibbles FRACTIONAL hp off a standing
// dark across a territory read — thousandths, never the
// Blade's flat 6: the tolerance below is that nibble, and
// the unspent charges are the spring's own ledger.)
const blade1 = seedWorking("blade", "blade", 2, 0);
const d1 = seedDark(2, 0);
await call("getTerritory", {}, T.token);
ok("(1) a dark thing standing ON a written Blade does not spring it — no flat-6 wound", Math.abs(darkHp(d1) - 20) < 0.1, `hp=${darkHp(d1)}`);
ok("(1) the Blade still stands armed, both charges unspent", workingRow(blade1)?.charges === 2, JSON.stringify(workingRow(blade1)));

// (5a) The Springing Blade springs on proximity, as the Blade used to.
const spring1 = seedWorking("springblade", "springblade", -2, 0);
const d2 = seedDark(-2, 0);
await call("getTerritory", {}, T.token);
ok("(5) the Springing Blade springs on the dark standing on its ground — flat 6 harm", Math.abs(darkHp(d2) - 14) < 0.1, `hp=${darkHp(d2)}`);
ok("(5) the spring spent one of its two charges", workingRow(spring1)?.charges === 1, JSON.stringify(workingRow(spring1)));

// (2) The click within reach looses the Blade.
const d3 = seedDark(1, 1);
const loose1 = await call("looseBlade", { wandererId: d3 }, T.token);
ok("(2) the loose is answered as a loose (no cast, no roll)", loose1?.loosed === true && loose1?.workingId === blade1, JSON.stringify(loose1));
ok("(2) the harm is the book's flat 6 — no die, no AC", loose1?.harm === 6 && darkHp(d3) === 14, `harm=${loose1?.harm} hp=${darkHp(d3)}`);
ok("(2) the loose spent one charge; the Blade hums on with one", workingRow(blade1)?.charges === 1, JSON.stringify(workingRow(blade1)));

// (3) The click out of reach is answered plainly; the Blade stays armed.
const d4 = seedDark(-3, 1);
const looseFar = await callRaw("looseBlade", { wandererId: d4 }, T.token);
ok("(3) an out-of-reach click is refused in plain words that name the reach",
  looseFar.status === 400 && /Beyond its reach/.test(JSON.stringify(looseFar.data)), `${looseFar.status} ${JSON.stringify(looseFar.data)}`);
ok("(3) the Blade stayed armed (charge unspent) and the dark unharmed",
  workingRow(blade1)?.charges === 1 && darkHp(d4) === 20, `charges=${workingRow(blade1)?.charges} hp=${darkHp(d4)}`);

// (4) Two armed Blades — the nearest answers.
const blade2 = seedWorking("blade", "blade", 0, 2);
const d5 = seedDark(1, 2); // 1 hex from blade2 (0,2); 2 hexes from blade1 (2,0)
const loose2 = await call("looseBlade", { wandererId: d5 }, T.token);
ok("(4) the NEAREST armed Blade answered the click", loose2?.workingId === blade2, JSON.stringify(loose2));
ok("(4) the nearer Blade spent its charge; the farther kept its own",
  workingRow(blade2)?.charges === 1 && workingRow(blade1)?.charges === 1,
  `near=${workingRow(blade2)?.charges} far=${workingRow(blade1)?.charges}`);
ok("(4) the mark took the flat 6", darkHp(d5) === 14, `hp=${darkHp(d5)}`);

// (5b) + the cast-time truth, through the real cast door:
// a cast Blade does NOT spring at its writing; a cast
// Springing Blade DOES, as the Blade used to.
async function castUntilStands(spellKey, q, r) {
  for (let i = 0; i < 16; i++) {
    const res = await call("castMapWorking", { spellKey, tileId: tileId.get(`${q},${r}`) }, T.token);
    if (!res.fizzled) return res;
  }
  throw new Error(`cast of ${spellKey} never stood in 16 casts`);
}
const d6 = seedDark(3, 0);
const castBlade = await castUntilStands("blade", 3, 0);
ok("(1b) a Blade cast onto the dark's own ground does NOT spring at its writing", castBlade?.sprung === false && darkHp(d6) === 20,
  `sprung=${castBlade?.sprung} hp=${darkHp(d6)}`);
const d7 = seedDark(-1, -2);
const castSpring = await castUntilStands("springblade", -1, -2);
ok("(5b) a Springing Blade cast onto the dark's ground springs at its writing — flat 6, as the Blade used to",
  castSpring?.sprung === true && darkHp(d7) === 14, `sprung=${castSpring?.sprung} hp=${darkHp(d7)}`);

/* ══ §B THE TABLE ═════════════════════════════════════════ */
console.log("§B the Table — the Blade waits at the Table too, and the click looses it there");
const TT = await claim("Blade Table Tender", 3800, "runewright");
for (let i = 0; i < 25; i++) seedAwokin(TT.ownerKey, "Blade Table Tender", `Table Bench ${i + 1}`, 2);
const { issueTableToken } = await import("../server/dist/table.js");
const tt = issueTableToken({ id: "disc-blade-table", name: "Blade Table Tender" });
const bindCode = (await call("getTableBindCode", {}, TT.token)).code;
const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
if (!bindRes.ok) throw new Error("table/bind failed: " + bindRes.status);

const wstate = { state: null };
const wws = new WebSocket(`ws://127.0.0.1:3993/table/ws`);
await new Promise((res, rej) => { wws.onopen = res; wws.onerror = rej; });
wws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") wstate.state = m.state; } catch { /* a torn frame is no evidence */ } };
wws.send(JSON.stringify({ type: "join", room: "blade-loose-watch", watch: true, name: "Blade Watcher" }));

class Actor {
  constructor() { this.state = null; this.you = null; this.errors = []; }
  async join(token, room) {
    this.ws = new WebSocket(`ws://127.0.0.1:3993/table/ws`);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data));
        if (m.type === "state") { this.state = m.state; this.you = m.you; }
        else if (m.type === "error") this.errors.push(String(m.message ?? ""));
      } catch { /* torn frame */ }
    };
    this.send({ type: "join", authToken: token, room });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
}
const waitFor = async (fn, what, ms = 20000) => {
  const s = Date.now();
  while (Date.now() - s < ms) { if (fn()) return true; await sleep(150); }
  throw new Error("drive wait: " + what);
};
const axOf = (state, hex) => (state?.map ?? []).find((t) => t.id === hex);
const axDist = (state, a, b) => { const ta = axOf(state, a), tb = axOf(state, b); return ta && tb ? hexDist(ta, tb) : 999; };

const actor = new Actor();
await actor.join(tt, "blade-loose");
await waitFor(() => !!actor.you, "the Table seat");
actor.send({ type: "startWave" });
await waitFor(() => (actor.state?.dark ?? []).length >= 3, "the wave stands on the field");
const dark1 = actor.state.dark[0];
const dark1Hp0 = dark1.hp;

// A loose ordered with NO Blade armed: a plain answer.
actor.errors.length = 0;
actor.send({ type: "looseBlade", enemyId: dark1.id });
await waitFor(() => actor.errors.some((e) => /No Single Blade/.test(e)), "the plain answer to a loose with no Blade armed");
ok("a loose with no Blade armed is answered plainly, and nothing is harmed",
  (actor.state.dark.find((e) => e.id === dark1.id)?.hp ?? -1) === dark1Hp0);

// Cast the Blade onto the dark's own ground — it must WAIT.
async function castTableUntilStands(root, hexOf) {
  for (let i = 0; i < 30; i++) {
    const hex = hexOf();
    if (!hex) return null;
    actor.send({ type: "castRune", root, hexes: [hex] });
    const s = Date.now();
    while (Date.now() - s < 1200) {
      const w = (actor.state?.workings ?? []).find((x) => x.root === root && x.ownerKey === actor.you.key);
      if (w) return w;
      await sleep(120);
    }
  }
  return null;
}
const bladeW = await castTableUntilStands("blade", () => actor.state.dark.find((e) => e.id === dark1.id)?.hex);
ok("the Blade was written at the Table (through its cast door, fizzles honestly retried)", !!bladeW, JSON.stringify(actor.errors.slice(-2)));
const dark1Now = actor.state.dark.find((e) => e.id === dark1.id);
ok("the written Blade WAITS at the Table — the dark standing on its ground is unharmed, its charges whole",
  !!dark1Now && dark1Now.hp === dark1Hp0 && bladeW?.charges === 2,
  `hp=${dark1Now?.hp}/${dark1Hp0} charges=${bladeW?.charges}`);

// The click looses it — flat 6, a charge spent, the flight served.
const hpBeforeLoose = actor.state.dark.find((e) => e.id === dark1.id)?.hp;
actor.send({ type: "looseBlade", enemyId: dark1.id });
await waitFor(() => {
  const w = (actor.state?.workings ?? []).find((x) => x.id === bladeW.id);
  return w && w.charges === 1;
}, "the Table loose spends the Blade's charge");
const dark1After = actor.state.dark.find((e) => e.id === dark1.id);
ok("the Table loose dealt the book's flat 6 (or felled the dark outright)",
  dark1After ? dark1After.hp === hpBeforeLoose - 6 : hpBeforeLoose <= 6,
  `before=${hpBeforeLoose} after=${dark1After?.hp ?? "felled"}`);
ok("the flight was served in the state — from the rune's hex, at the mark",
  (actor.state?.bladeFlights ?? []).some((f) => f.fromHex === bladeW.hex),
  JSON.stringify((actor.state?.bladeFlights ?? []).map((f) => f.fromHex)));

// The Springing Blade at the Table: cast on a standing
// dark's ground, it springs at the writing.
const dark2 = actor.state.dark.find((e) => e.id !== dark1.id) ?? actor.state.dark[0];
const dark2Hp0 = actor.state.dark.find((e) => e.id === dark2.id)?.hp;
let sprungSpring = null;
for (let i = 0; i < 20 && !sprungSpring; i++) {
  const target = actor.state.dark.find((e) => e.id === dark2.id) ?? actor.state.dark[0];
  if (!target) break;
  if ((actor.state.workings ?? []).some((x) => x.root === "springblade" && x.hex === target.hex)) { await sleep(200); continue; }
  actor.send({ type: "castRune", root: "springblade", hexes: [target.hex] });
  const s = Date.now();
  while (Date.now() - s < 1200) {
    const w = (actor.state?.workings ?? []).find((x) => x.root === "springblade" && x.charges === 1);
    if (w) { sprungSpring = w; break; }
    await sleep(120);
  }
}
ok("the Springing Blade cast at the Table springs at its writing — a charge spent by the spring itself",
  !!sprungSpring, JSON.stringify((actor.state?.workings ?? []).filter((x) => x.root === "springblade").map((x) => ({ hex: x.hex, charges: x.charges }))));
const dark2After = actor.state.dark.find((e) => e.id === dark2.id);
ok("the spring's harm landed at the Table — the dark it sprang on took its reckoning",
  dark2After ? dark2After.hp < dark2Hp0 : true, `before=${dark2Hp0} after=${dark2After?.hp ?? "felled"}`);

actor.ws.close();
wws.close();
console.log(`\nBLADE-LOOSE DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
