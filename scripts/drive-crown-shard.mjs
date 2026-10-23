// THE CROWN SHARD'S HOMELAND SPRING — RECOVERY R5'S DRIVE
// (Nigel, 2026-10-23 12:04, recovery order #5; the law
// itself: the Shard HOVERS over a hex, WAITS for a target,
// and COLLAPSES onto it for HIGH DAMAGE — its damage law
// ported WHOLE from the Table under the porting law).
// Boots the real server on a scratch DATA_DIR and proves:
//   §A THE HOMELAND (the server referee, actions.ts):
//      (1) a cast Crown Shard stands hovering with no
//          target — it does not fire, and is not spent;
//      (2) a dark thing BELOW its hunger (power 5 on the
//          page) standing on its hex does NOT wake it —
//          the shard stands on, the dark unharmed by it;
//      (3) when a dark of power 6 stands on its ground the
//          shard COLLAPSES on the whole hex: every foe
//          there takes the greatest's power × the book's
//          multiplier + the cast's slots — here 6 × 2 + 0
//          = 12 — and the working is spent whole;
//      (4) with 3 attunement slots standing in its page
//          (seeded in the book's own ledger, cast through
//          the real cast door) the same dark takes
//          6 × 2 + 3 = 15 — the slots ride at face value;
//      (5) on cursed ground the fall grinds the curse with
//          the same harm the foe takes (5 × 2 + 3 = 13);
//      (6) the hunger stored in the working's numbers
//          governs: at minPower 4 (the Lowered Crown's
//          shape, as the cast snapshot lays it) a power-4
//          dark wakes it, for 4 × 2 + 0 = 8.
//   §B THE TABLE (the server referee, table.ts, over the
//      real websocket): the SAME inputs give the SAME
//      number — a bastion column's Unraveler (power 6)
//      under a Crown Shard cast carrying 3 fire slots
//      takes 6 × 2 + 3 = 15, the tale naming the harm;
//      and under a Fray of power 3 the Table's shard
//      stands dormant, as it always has. (The Table's
//      shard was not touched by this build; test63's
//      audit covers its two lawful faces besides.)
// The arithmetic is the port's whole claim: greatest 6,
// multiplier 2, slots 3 → 15 on BOTH grounds; greatest 6,
// multiplier 2, slots 0 → 12 at home.
// Run: node scripts/drive-crown-shard.mjs
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-shard-"));
process.env.PORT = "3994";
process.env.WORKSHOP_PASSWORD = "<MASKED_SECRET_002>";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3994";
const PW = "shard-drive-password";
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
      .run(`${name} ${cat}`, cat, partPower, partPower, `shard/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: partPower, toughness: partPower, element: "root" });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `shard/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}

/* ══ §A THE HOMELAND ══════════════════════════════════════ */
console.log("§A the homeland — the Shard hovers, waits, and collapses by the Table's measure");
const T = await claim("Shard Tender", 3800, "runewright");
const tileId = new Map();
{
  const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', 0, ?)");
  const now = Date.now();
  for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > 4) continue;
    tileId.set(`${q},${r}`, Number(insTile.run(T.ownerKey, q, r, now).lastInsertRowid));
  }
  // One cursed hex for §A5, its curse weighed at 20.
  db.prepare("UPDATE territory_tiles SET cursed = 1, curse_hp = 20, curse_max_hp = 20 WHERE id = ?").run(tileId.get("1,2"));
}
await call("getTerritory", {}, T.token); // the land stands (the Tender's stand settles at the heart)

const seedShardWorking = (q, r, { pour = 0, minPower = 5, multiplier = 2, hue = "unaligned" } = {}) => Number(db.prepare(
  `INSERT INTO territory_workings (owner_key, spell_key, engine, kind, hue, tile_id, edge_key, q, r, dir, nums, hp, stops, charges, pour, max_hp, created_at)
   VALUES (?, 'shard', 'shard', 'rune', ?, ?, NULL, ?, ?, NULL, ?, 0, 0, 1, ?, 0, ?)`)
  .run(T.ownerKey, hue, tileId.get(`${q},${r}`), q, r, JSON.stringify({ minPower, multiplier }), pour, Date.now()).lastInsertRowid);
const seedDark = (q, r, hp, power) => Number(db.prepare(
  `INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
   VALUES (?, ?, 'tangle', ?, ?, ?, ?, ?, 1, 0)`)
  .run(T.ownerKey, tileId.get(`${q},${r}`), Date.now(), hp, q, r, power).lastInsertRowid);
const workingRow = (id) => db.prepare("SELECT id, engine, charges, pour FROM territory_workings WHERE id = ?").get(id);
const shardOn = (q, r) => db.prepare("SELECT id, charges, pour FROM territory_workings WHERE owner_key = ? AND engine = 'shard' AND tile_id = ?").get(T.ownerKey, tileId.get(`${q},${r}`));
const darkHp = (id) => db.prepare("SELECT hp FROM homeland_wanderers WHERE id = ?").get(id)?.hp;
const near = (a, b, tol = 0.6) => a != null && Math.abs(a - b) <= tol;

async function castUntilStands(spellKey, q, r) {
  for (let i = 0; i < 16; i++) {
    const res = await call("castMapWorking", { spellKey, tileId: tileId.get(`${q},${r}`) }, T.token);
    if (!res.fizzled) return res;
  }
  throw new Error(`cast of ${spellKey} never stood in 16 casts`);
}

// (1) A cast Crown Shard stands hovering with NO target.
const cast1 = await castUntilStands("shard", 2, 0);
await call("getTerritory", {}, T.token);
ok("(1) a cast Crown Shard stands on the homeland (through the real cast door)", !!shardOn(2, 0), JSON.stringify(cast1));
ok("(1) with no target it does NOT fire and is NOT spent — it hovers, its charge whole",
  shardOn(2, 0)?.charges === 1, JSON.stringify(shardOn(2, 0)));

// (2) A dark BELOW its hunger stands on its hex: no fall.
const weak = seedDark(2, 0, 30, 2);
await call("getTerritory", {}, T.token);
ok("(2) a power-2 dark standing on the Shard's hex does not wake it — the Shard stands on",
  !!shardOn(2, 0), JSON.stringify(shardOn(2, 0)));
ok("(2) the weak dark is unharmed by the Shard (no fall, no wound of its measure)",
  near(darkHp(weak), 30), `hp=${darkHp(weak)}`);

// (3) A dark of power 6 joins it: the fall, on the WHOLE
// hex — greatest 6 × multiplier 2 + slots 0 = 12 to each.
const strong = seedDark(2, 0, 40, 6);
await call("getTerritory", {}, T.token);
ok("(3) the Shard COLLAPSED — the working is spent whole, gone from the land",
  !shardOn(2, 0), JSON.stringify(shardOn(2, 0)));
ok("(3) the greatest took exactly the Table's measure: 6 × 2 + 0 slots = 12 harm (40 → 28)",
  near(darkHp(strong), 28), `hp=${darkHp(strong)}`);
ok("(3) the fall is on the WHOLE hex — the lesser dark standing there took the same 12 (30 → 18)",
  near(darkHp(weak), 18), `hp=${darkHp(weak)}`);

// (4) The slots ride at face value, through the real cast
// door: 3 fire slots stand in the Shard's page (the book's
// own ledger), so the cast carries pour 3 — and a power-6
// dark under the writing at its cast takes 6 × 2 + 3 = 15.
db.prepare("INSERT INTO grimoire_attunements (owner_key, spell_key, element, slots, updated_at) VALUES (?, 'shard', 'fire', 3, ?)").run(T.ownerKey, Date.now());
const strong2 = seedDark(3, 0, 40, 6);
const cast4 = await castUntilStands("shard", 3, 0);
ok("(4) the cast carried the page's 3 slots (pour 3, judged fire by the book)",
  cast4?.pour === 3 && cast4?.sprung === true, JSON.stringify(cast4));
ok("(4) the fall at the cast dealt 6 × 2 + 3 = 15 (40 → 25) — the Table's arithmetic, at home",
  near(darkHp(strong2), 25), `hp=${darkHp(strong2)}`);
ok("(4) the sprung Shard is spent whole at its cast", !shardOn(3, 0), JSON.stringify(shardOn(3, 0)));

// (5) Cursed ground: the fall grinds the curse with the
// same harm — a power-5 dark, pour 3: 5 × 2 + 3 = 13.
// (The baseline is read off the land as it stands after
// the setup read: the land's own passes re-weigh a seeded
// curse to its ring measure — 22 on this hex — before the
// fall, and it is that standing weight the fall grinds.)
const curseBefore = db.prepare("SELECT curse_hp AS hp FROM territory_tiles WHERE id = ?").get(tileId.get("1,2"))?.hp;
const cursedDark = seedDark(1, 2, 40, 5);
seedShardWorking(1, 2, { pour: 3, hue: "fire" });
await call("getTerritory", {}, T.token);
const curseAfter = db.prepare("SELECT curse_hp AS hp, cursed FROM territory_tiles WHERE id = ?").get(tileId.get("1,2"));
ok("(5) on cursed ground the Shard fell for 5 × 2 + 3 = 13 (40 → 27)",
  near(darkHp(cursedDark), 27), `hp=${darkHp(cursedDark)}`);
ok("(5) the same 13 ground the hex's curse (curse HP → 13 less, the hex still cursed)",
  curseBefore != null && curseAfter?.hp === curseBefore - 13 && curseAfter?.cursed === 1,
  `before=${curseBefore} after=${JSON.stringify(curseAfter)}`);
ok("(5) the fallen Shard is spent whole", !shardOn(1, 2), JSON.stringify(shardOn(1, 2)));

// (6) The hunger stored in the working's numbers governs:
// at minPower 4 a power-4 dark wakes it, for 4 × 2 + 0 = 8.
const four = seedDark(0, 3, 30, 4);
seedShardWorking(0, 3, { minPower: 4 });
await call("getTerritory", {}, T.token);
ok("(6) at the stored hunger of 4, a power-4 dark wakes the Shard — 4 × 2 + 0 = 8 harm (30 → 22), the working spent",
  near(darkHp(four), 22) && !shardOn(0, 3), `hp=${darkHp(four)} shard=${JSON.stringify(shardOn(0, 3))}`);

/* ══ §B THE TABLE ═════════════════════════════════════════ */
console.log("§B the Table — the same inputs give the same number, and the Table's shard is unchanged");
const TT = await claim("Shard Table Tender", 3800, "runewright");
for (let i = 0; i < 12; i++) seedAwokin(TT.ownerKey, "Shard Table Tender", `Shard Bench ${i + 1}`, 2);
const { issueTableToken } = await import("../server/dist/table.js");
const tt = issueTableToken({ id: "disc-shard-table", name: "Shard Table Tender" });
const bindCode = (await call("getTableBindCode", {}, TT.token)).code;
const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
if (!bindRes.ok) throw new Error("table/bind failed: " + bindRes.status);
// The same 3 fire slots stand in this Tender's Shard page.
db.prepare("INSERT INTO grimoire_attunements (owner_key, spell_key, element, slots, updated_at) VALUES (?, 'shard', 'fire', 3, ?)").run(TT.ownerKey, Date.now());
// A column of power tier 5: its Unravelers stand at power
// 4 + ⌊(5−1)/2⌋ = 6, its Tangles at 5, its Fray at 3.
const colId = Number(db.prepare("INSERT INTO incursion_columns (owner_key, target_tile_id, target_kind, kind, size, power, state, origin_q, origin_r, spawned_at, arrives_at) VALUES (?, NULL, 'hex', 'raid', 8, 5, 'arrived', 0, 0, ?, ?)")
  .run(TT.ownerKey, Date.now(), Date.now()).lastInsertRowid);
const callId = Number(db.prepare("INSERT INTO bastion_calls (owner_key, host_tender_id, column_id, seed_id, kind, state, created_at) VALUES (?, ?, ?, NULL, 'raid', 'open', ?)")
  .run(TT.ownerKey, TT.tenderId, colId, Date.now()).lastInsertRowid);

class Actor {
  constructor() { this.state = null; this.you = null; this.errors = []; }
  async join(token, room) {
    this.ws = new WebSocket(`ws://127.0.0.1:3994/table/ws`);
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
const actor = new Actor();
await actor.join(tt, "shard-table");
await waitFor(() => !!actor.you, "the Table seat");
actor.send({ type: "claimBastion", callId });
await waitFor(() => !!actor.state?.bastion, "the bastion call claimed");
actor.send({ type: "startBastion" });
await waitFor(() => (actor.state?.dark ?? []).length >= 6, "the column stands on the field");
const dealtDark = actor.state.dark.map((d) => ({ id: d.id, kind: d.kind, power: d.power, hp: d.hp }));
ok("the column dealt its dark — Unravelers of power 6 among them (the bastion roster's own measure)",
  dealtDark.some((d) => d.power === 6), JSON.stringify(dealtDark));

// Dormancy at the Table, as it always was: a Fray of
// power 3 under a written Shard wakes nothing.
const fray = actor.state.dark.find((d) => d.power === 3) ?? actor.state.dark[0];
const frayHp0 = fray.hp;
actor.send({ type: "castRune", root: "shard", hexes: [fray.hex] });
await waitFor(() => (actor.state?.workings ?? []).some((w) => w.engine === "shard"), "the Shard written at the Table", 8000);
await sleep(900);
const shardW = (actor.state?.workings ?? []).find((w) => w.engine === "shard");
const frayNow = actor.state.dark.find((d) => d.id === fray.id);
ok("the Table's Shard stands DORMANT under a power-3 Fray — unharmed by it, the working unspent, as before this build",
  !!shardW && !!frayNow && frayNow.hp === frayHp0,
  `working=${JSON.stringify(shardW && { hex: shardW.hex, charges: shardW.charges })} frayHp=${frayNow?.hp}/${frayHp0}`);

// The fall at the Table, same inputs as §A4: greatest 6,
// multiplier 2, slots 3 → 15, the tale naming the harm.
let fallLine = null;
for (let i = 0; i < 14 && !fallLine; i++) {
  const un = actor.state.dark.find((d) => d.power === 6);
  if (!un) break;
  actor.send({ type: "castRune", root: "shard", hexes: [un.hex] });
  const s = Date.now();
  while (Date.now() - s < 1500 && !fallLine) {
    fallLine = (actor.state?.tale ?? []).map((t) => t.text).find((x) => /falls on the whole hex — 15 harm, measured by the greatest/.test(x)) ?? null;
    if (!fallLine) await sleep(120);
  }
}
ok("the Table's Shard fell on the power-6 Unraveler for 6 × 2 + 3 = 15 — the SAME number as the homeland's fall in §A4",
  !!fallLine, `tale=${(actor.state?.tale ?? []).slice(-4).map((t) => t.text).join(" | ")} errors=${actor.errors.slice(-2).join(" | ")}`);

actor.ws.close();
console.log(`\nCROWN-SHARD DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
