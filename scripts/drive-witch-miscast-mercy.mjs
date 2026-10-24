// THE WITCH'S MISCAST MERCY — RECOVERY R8 DRIVE (2026-10-23;
// Nigel's ruling of 2026-10-22: on an unravelled cast, half
// the spent energy returns to the Witch's purse; every other
// class still loses the full spent energy). THE PERCENTAGE
// SLIDER THE ORDER NAMES DOES NOT EXIST anywhere in code or
// data — no per-tender or per-Witch percentage is stored in
// any setting, tender record, class data or ui_config — so
// the refund reads the standing ruled value, 50%
// (WITCH_MISCAST_MERCY_PERCENT in skills.ts), and the missing
// slider is flagged as its own separate issue in the build
// report; no slider UI is built here. Boots the real server
// on a scratch DATA_DIR and proves:
//   §A THE RECKONING, read directly (the game's own exported
//      reader): the Witch is refunded half of what she paid,
//      rounded DOWN (3→1, 2→1, 1→0, 0→0); every other class
//      is refunded nothing at any price; across 0..40 the
//      refund is exactly floor(paid/2) and never exceeds what
//      was paid.
//   §B THE HOMELAND, LIVED (a Witch's Heal casts): every
//      fizzle answers with refunded = half the price she
//      actually paid and her purse falls by only the other
//      half; every success refunds nothing and spends whole.
//   §C THE CONTROL, LIVED (a Warden's Heal casts on the same
//      ground): his fizzles refund nothing — the full price
//      is spent, exactly as before this build.
//   §D THE HOMELAND SUMMON, LIVED: a Witch's faltering call
//      at full price (✦6) returns ✦3; while a cast party
//      member stands, her price is the R7 half (✦3) and a
//      falter returns half of THAT (✦1) — the mercy is
//      reckoned on what she actually paid, never the list
//      price.
//   §E THE TABLE, LIVED (the Springleaf through castWard,
//      ✦3): a Witch's unravelled cast spends only ✦2 net —
//      the tale names the return ("The Witch's mercy returns
//      ✦1 of the spent energy"); a standing cast spends the
//      whole ✦3 and names no return.
//   §F THE TABLE SUMMON + THE HALVED PRICE, LIVED: her
//      faltering call at ✦6 returns ✦3 in the tale and the
//      purse; once a cast member stands, the Springleaf
//      costs ✦2 and its unravel spends only ✦1 net, the
//      mercy still naming ✦1 — half of what she paid.
//   §G THE TABLE CONTROL, LIVED (a Warden's Springleaf): his
//      unravel spends the whole ✦3 and his tale names no
//      mercy.
// Run: node scripts/drive-witch-miscast-mercy.mjs
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-mercy-"));
process.env.PORT = "3996";
process.env["WORKSHOP_" + "PASSWORD"] = "mercy-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3996";
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
async function callRaw(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }

async function claim(name, classKey, exp) {
  const c = await call("claimTender", { password: "mercy-drive-password", tenderName: name });
  const id = db.prepare("SELECT id FROM tenders WHERE code = ?").get(c.tender.code).id;
  const ownerKey = `tender:${id}`;
  const now = Date.now();
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, now);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(ownerKey, now);
  await call("chooseClass", { classKey }, c.token);
  if (exp !== 3800) db.prepare("UPDATE tender_progress SET total_exp = ? WHERE owner_key = ?").run(exp, ownerKey);
  return { token: c.token, ownerKey };
}
function seedTile(ownerKey, q, r, cursed, element = "root") {
  return Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(ownerKey, q, r, element, cursed, Date.now()).lastInsertRowid);
}
function seedAwokin(ownerKey, tenderName, name, partPower, partToughness, element = "root") {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)").run(`${name} ${cat}`, cat, partPower, partToughness, element, `mercy/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: partPower, toughness: partToughness, element });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)").run(name, name, `mercy/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
function placeAwokin(ownerKey, awakenedId, tileId, q, r, opts = {}) {
  const info = db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`).run(
    ownerKey, awakenedId, tileId, Date.now(), Date.now(),
    opts.stance ?? "defense", opts.hp ?? 99, q, r,
    opts.shield ?? null, opts.shield ?? null);
  return Number(info.lastInsertRowid);
}
const energyOf = (ownerKey) => db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(ownerKey)?.energy;

/* ── §A THE RECKONING, READ DIRECTLY ──────────────────── */
console.log("§A the reckoning — the reader itself, class by class, price by price");
{
  const skills = await import("../server/dist/skills.js");
  ok("the standing value wired is the ruled 50% (WITCH_MISCAST_MERCY_PERCENT === 50)",
    skills.WITCH_MISCAST_MERCY_PERCENT === 50, `got ${skills.WITCH_MISCAST_MERCY_PERCENT}`);
  ok("a Witch is refunded half of what she paid, rounded down (10→5, 6→3, 3→1, 2→1, 1→0, 0→0)",
    skills.witchMiscastRefundFor("witch", 10) === 5 && skills.witchMiscastRefundFor("witch", 6) === 3
    && skills.witchMiscastRefundFor("witch", 3) === 1 && skills.witchMiscastRefundFor("witch", 2) === 1
    && skills.witchMiscastRefundFor("witch", 1) === 0 && skills.witchMiscastRefundFor("witch", 0) === 0);
  ok("every other class is refunded nothing at any price (warden, sage, binder, runewright, classless)",
    ["warden", "sage", "binder", "runewright", null, undefined].every(k => skills.witchMiscastRefundFor(k, 10) === 0));
  let sweep = true;
  for (let p = 0; p <= 40; p++) {
    const r = skills.witchMiscastRefundFor("witch", p);
    if (r !== Math.floor(p / 2) || r > p || r < 0) sweep = false;
  }
  ok("across every price 0..40 the Witch's refund is exactly half rounded down and never exceeds what was paid", sweep);
}

/* ── §B/§C HOMELAND HEAL CASTS — WITCH vs WARDEN ──────── */
async function healCasts(classKey, label, wantFizzles, wantSuccess) {
  const T = await claim(label, classKey, 0); // Lv 1
  const home = seedTile(T.ownerKey, 0, 0, 0);
  const aw = seedAwokin(T.ownerKey, label, `${label} Wounded`, 1, 10); // toughness 30
  placeAwokin(T.ownerKey, aw, home, 0, 0, { hp: 10 });
  let fizzles = 0, successes = 0, bad = [];
  for (let i = 0; i < 60 && (fizzles < wantFizzles || successes < wantSuccess); i++) {
    db.prepare("UPDATE field_placements SET hp = 1 WHERE awakened_id = ?").run(aw);
    const e0 = energyOf(T.ownerKey);
    const r = await callRaw("castMapWorking", { spellKey: "heal", awakenedId: aw }, T.token);
    if (r.status !== 200 || !r.data) { bad.push(`attempt ${i}: status ${r.status} ${JSON.stringify(r.data)}`); continue; }
    const spent = e0 - energyOf(T.ownerKey);
    const refunded = r.data.refunded ?? 0;
    if (r.data.fizzled) {
      fizzles++;
      const want = classKey === "witch" ? Math.floor(r.data.cost / 2) : 0;
      if (refunded !== want || spent !== r.data.cost - want) bad.push(`fizzle ${fizzles}: cost ${r.data.cost} refunded ${refunded} spent ${spent}`);
    } else if (typeof r.data.healed === "number") {
      successes++;
      if (refunded !== 0 || spent !== r.data.cost) bad.push(`success ${successes}: cost ${r.data.cost} refunded ${refunded} spent ${spent}`);
    } else {
      bad.push(`attempt ${i}: neither fizzle nor heal: ${JSON.stringify(r.data)}`);
    }
  }
  return { fizzles, successes, bad };
}
console.log("§B the homeland — a Witch's Heal casts, fizzle by fizzle");
{
  const w = await healCasts("witch", "Mercy Witch", 3, 1);
  console.log(`    the Witch: ${w.fizzles} fizzles, ${w.successes} standings observed`);
  ok("the Witch's fizzles were observed (at least 3) and a standing cast was observed", w.fizzles >= 3 && w.successes >= 1, JSON.stringify(w));
  ok("every Witch fizzle refunded exactly half of what she paid and her purse fell by only the other half; her standing cast refunded nothing",
    w.bad.length === 0, w.bad.join(" | "));
}
console.log("§C the homeland control — a Warden's Heal casts on the same ground");
{
  const w = await healCasts("warden", "Mercy Warden", 2, 1);
  console.log(`    the Warden: ${w.fizzles} fizzles, ${w.successes} standings observed`);
  ok("the Warden's fizzles were observed (at least 2) and a standing cast was observed", w.fizzles >= 2 && w.successes >= 1, JSON.stringify(w));
  ok("every Warden fizzle refunded nothing — the full price was spent, as before this build",
    w.bad.length === 0, w.bad.join(" | "));
}

/* ── §D THE HOMELAND SUMMON — FULL PRICE, THEN HALVED ─── */
console.log("§D the homeland summon — a faltering call at full price, then at her company price");
{
  const W = await claim("Mercy Summoner", "witch", 3800); // Lv 10
  seedTile(W.ownerKey, 0, 0, 0);
  seedTile(W.ownerKey, 1, 0, 0);
  const A = seedAwokin(W.ownerKey, "Mercy Summoner", "Mercy Anchor", 2, 2); // power 6
  const B = seedAwokin(W.ownerKey, "Mercy Summoner", "Mercy Second", 2, 2); // power 6
  await call("addToParty", { awakenedId: A }, W.token);
  await call("addToParty", { awakenedId: B }, W.token);

  // Full price: hunt a falter of A (✦6 → ✦3 back). If A lands
  // first, its placement is lifted and the hunt goes on —
  // nothing of hers stands, so the price stays whole.
  let fullFalter = null;
  for (let i = 0; i < 40 && !fullFalter; i++) {
    const e0 = energyOf(W.ownerKey);
    const r = await call("summonAwoken", { awakenedId: A }, W.token);
    const spent = e0 - energyOf(W.ownerKey);
    if (r.faltered) fullFalter = { cost: r.cost, refunded: r.refunded ?? 0, spent };
    else if (r.summoned) db.prepare("DELETE FROM field_placements WHERE awakened_id = ?").run(A);
  }
  ok("a full-price falter was observed on the homeland summon", !!fullFalter, "no falter in 40 calls");
  if (fullFalter) ok("the full-price falter (✦6) returned ✦3 and her purse fell by ✦3 alone",
    fullFalter.cost === 6 && fullFalter.refunded === 3 && fullFalter.spent === 3, JSON.stringify(fullFalter));

  // A stands for true now — the company price wakes.
  let aStands = false;
  for (let i = 0; i < 40 && !aStands; i++) {
    const r = await call("summonAwoken", { awakenedId: A }, W.token);
    if (r.summoned) aStands = true;
  }
  ok("the anchor member stands (the company price is awake)", aStands);

  // Halved price: hunt a falter of B (✦3 → ✦1 back — half of
  // what she actually paid, not half of the ✦6 list price).
  let halfFalter = null;
  for (let i = 0; i < 40 && !halfFalter; i++) {
    const e0 = energyOf(W.ownerKey);
    const r = await call("summonAwoken", { awakenedId: B }, W.token);
    const spent = e0 - energyOf(W.ownerKey);
    if (r.faltered) halfFalter = { cost: r.cost, refunded: r.refunded ?? 0, spent };
    else if (r.summoned) db.prepare("DELETE FROM field_placements WHERE awakened_id = ?").run(B);
  }
  ok("a falter at her company price was observed", !!halfFalter, "no falter in 40 calls");
  if (halfFalter) ok("the falter at her company price (✦3 paid) returned ✦1 — half of what she PAID, not half of ✦6 — and her purse fell by ✦2",
    halfFalter.cost === 3 && halfFalter.refunded === 1 && halfFalter.spent === 2, JSON.stringify(halfFalter));
}

/* ── §E/§F/§G THE TABLE ───────────────────────────────── */
const AXIAL = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
function neighboursOf(id, mapIds) {
  const [q, r] = id.split(",").map(Number);
  return AXIAL.map(([dq, dr]) => `${q + dq},${r + dr}`).filter(x => mapIds.has(x));
}
async function tableSeat(name, classKey, fillers, members) {
  const T = await claim(name, classKey, 3800); // Lv 10
  await call("chooseWeapon", { weaponKey: "sword" }, T.token);
  db.prepare("UPDATE tender_progress SET weapon_next_at = ? WHERE owner_key = ?").run(Date.now() + 3600_000, T.ownerKey);
  const ids = {};
  for (const [key, label, pp] of members) {
    ids[key] = seedAwokin(T.ownerKey, name, label, pp, pp);
    await call("addToParty", { awakenedId: ids[key] }, T.token);
  }
  for (let i = 0; i < fillers; i++) seedAwokin(T.ownerKey, name, `${name} Reserve ${i}`, 1, 1);
  const { issueTableToken } = await import("../server/dist/table.js");
  const tt = issueTableToken({ id: `mercy-${name}`, name });
  const code = (await call("getTableBindCode", {}, T.token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code }) });
  if (!bindRes.ok) throw new Error(`table/bind -> ${bindRes.status}`);
  const ws = new WebSocket(`ws://127.0.0.1:3996/table/ws`);
  const c = { state: null, you: null, errors: [], tale: [], ws };
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "state") { c.state = m.state; c.you = m.you; c.tale = m.state.tale ?? []; }
    if (m.type === "error" || m.type === "joinError") c.errors.push(m.message);
  });
  c.send = (msg) => ws.send(JSON.stringify(msg));
  await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error(`${name}: join timeout`)), 15000);
    ws.on("open", () => {
      c.send({ type: "join", authToken: tt, room: `mercy-${name}` });
      const iv = setInterval(() => { if (c.state && c.you?.landing) { clearInterval(iv); clearTimeout(to); resolve(); } }, 100);
    });
  });
  c.seenTale = new Set();
  c.freshTales = () => {
    const out = [];
    for (const t of c.tale ?? []) {
      const k = `${t.at}|${t.text}`;
      if (c.seenTale.has(k)) continue;
      c.seenTale.add(k);
      out.push(t.text);
    }
    return out;
  };
  c.freshTales(); // drain the joining words
  return c;
}
async function tableSpringleaf(c, myName) {
  const before = c.you.energy;
  const mapIds = new Set((c.state.map ?? []).map(t => t.id));
  const hexB = neighboursOf(c.you.landing, mapIds).find(id => id !== "0,0");
  c.send({ type: "castWard", root: "springleaf", hue: "root", hexA: c.you.landing, hexB, pour: 0 });
  await sleep(850);
  const tales = c.freshTales().filter(t => t.includes(myName));
  const spent = before - c.you.energy;
  const unravel = tales.find(t => t.includes("unravels"));
  const stood = tales.find(t => t.includes("takes root"));
  const mercy = unravel ? unravel.match(/mercy returns ✦(\d+)/) : null;
  return { kind: unravel ? "fizzle" : stood ? "stood" : "unknown", spent, mercy: mercy ? Number(mercy[1]) : null, tales };
}
console.log("§E the Table — a Witch's Springleaf at full price (✦3)");
{
  var witchSeat = await tableSeat("Mercy Table Witch", "witch", 120, [["six", "Mercy Six", 2]]);
  let fizz = [], stood = [], unknown = [];
  for (let i = 0; i < 40 && (fizz.length < 2 || stood.length < 1); i++) {
    const r = await tableSpringleaf(witchSeat, "Mercy Table Witch");
    (r.kind === "fizzle" ? fizz : r.kind === "stood" ? stood : unknown).push(r);
  }
  console.log(`    the Witch at the Table: ${fizz.length} unravels, ${stood.length} standings`);
  ok("Table fizzles and a standing were observed", fizz.length >= 2 && stood.length >= 1 && unknown.length === 0,
    `fizz=${fizz.length} stood=${stood.length} unknown=${JSON.stringify(unknown.map(u => u.tales))}`);
  ok("every Table unravel spent only ✦2 net and the tale named the mercy's ✦1 return",
    fizz.every(r => r.spent === 2 && r.mercy === 1), JSON.stringify(fizz));
  ok("the standing Table cast spent the whole ✦3 and named no return",
    stood.every(r => r.spent === 3 && r.mercy === null), JSON.stringify(stood));

  /* §F THE TABLE SUMMON FALTER + THE HALVED PRICE */
  console.log("§F the Table — her faltering call at ✦6, then the Springleaf at her company price (✦2)");
  const sixId = db.prepare("SELECT id FROM awakened WHERE name = 'Mercy Six'").get().id;
  let falter = null, badSummons = [];
  for (let i = 0; i < 40 && !falter; i++) {
    const before = witchSeat.you.energy;
    witchSeat.send({ type: "summonCast", awakenedId: sixId });
    await sleep(850);
    const tales = witchSeat.freshTales().filter(t => t.includes("Mercy Six"));
    const spent = before - witchSeat.you.energy;
    const f = tales.find(t => t.includes("the call falters"));
    const l = tales.find(t => t.includes("the call lands"));
    if (f) {
      const m = f.match(/mercy returns ✦(\d+)/);
      falter = { spent, mercy: m ? Number(m[1]) : null, tale: f };
    } else if (l) {
      // Landed before any falter: recall and hunt on — with
      // the field empty again the price is whole once more.
      const u = (witchSeat.state.field ?? []).find(x => x.awokenId === sixId);
      if (u) { witchSeat.send({ type: "recall", hex: u.hex, cardId: u.cardId }); await sleep(600); witchSeat.freshTales(); }
    } else badSummons.push(tales.join(" | ") || "(no tale)");
  }
  ok("a faltering call was observed at the Table", !!falter, badSummons.slice(-2).join(" | "));
  if (falter) ok("the Table falter (✦6 paid) named the mercy's ✦3 return and her purse fell by ✦3 alone",
    falter.spent === 3 && falter.mercy === 3, JSON.stringify(falter));

  // The member stands for true — her company price wakes.
  let stands = (witchSeat.state.field ?? []).some(x => x.awokenId === sixId);
  for (let i = 0; i < 40 && !stands; i++) {
    witchSeat.send({ type: "summonCast", awakenedId: sixId });
    await sleep(850);
    witchSeat.freshTales();
    stands = (witchSeat.state.field ?? []).some(x => x.awokenId === sixId);
  }
  ok("the called member stands at the Table (her company price is awake)", stands);
  let hf = [], hs = [], hu = [];
  for (let i = 0; i < 40 && (hf.length < 1 || hs.length < 1); i++) {
    const r = await tableSpringleaf(witchSeat, "Mercy Table Witch");
    (r.kind === "fizzle" ? hf : r.kind === "stood" ? hs : hu).push(r);
  }
  ok("at her company price the Springleaf's unravel spent only ✦1 net (✦2 paid, ✦1 returned and named) and its standing spent the whole ✦2",
    hf.length >= 1 && hs.length >= 1 && hu.length === 0
    && hf.every(r => r.spent === 1 && r.mercy === 1) && hs.every(r => r.spent === 2 && r.mercy === null),
    `hf=${JSON.stringify(hf)} hs=${JSON.stringify(hs)} hu=${JSON.stringify(hu.map(u => u.tales))}`);
  witchSeat.ws.close();
}
console.log("§G the Table control — a Warden's Springleaf");
{
  const wardenSeat = await tableSeat("Mercy Table Warden", "warden", 60, []);
  let fizz = [], stood = [], unknown = [];
  for (let i = 0; i < 40 && (fizz.length < 1 || stood.length < 1); i++) {
    const r = await tableSpringleaf(wardenSeat, "Mercy Table Warden");
    (r.kind === "fizzle" ? fizz : r.kind === "stood" ? stood : unknown).push(r);
  }
  ok("the Warden's Table unravel and standing were observed", fizz.length >= 1 && stood.length >= 1 && unknown.length === 0,
    `fizz=${fizz.length} stood=${stood.length} unknown=${JSON.stringify(unknown.map(u => u.tales))}`);
  ok("the Warden's unravel spent the whole ✦3 and his tale named no mercy — as before this build",
    fizz.every(r => r.spent === 3 && r.mercy === null) && stood.every(r => r.spent === 3),
    JSON.stringify({ fizz, stood }));
  wardenSeat.ws.close();
}

console.log(`\nWITCH MISCAST MERCY DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
