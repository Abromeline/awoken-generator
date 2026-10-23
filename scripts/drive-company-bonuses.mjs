// THE COMPANY BONUSES — RECOVERY R7 DRIVE (2026-10-23;
// Nigel's ruling of 2026-10-22 12:27, set while editing the
// class cards and entered in the class-cards spreadsheet as
// the CURRENT bonuses; the full check's L7 found four of the
// five with no code). Boots the real server on a scratch
// DATA_DIR and proves each bonus against a control:
//   §A THE RECKONINGS, read directly (the game's own exported
//      readers, as castModFor and shieldPoolFor are read):
//      Warden +4 AC and Sage +2 AC in both grounds' AC
//      reckonings; Runewright relief 1 at Lv 1, 2 at Lv 3,
//      3 at Lv 6; Binder +4; the Witch's halved price.
//   §B THE WARDEN'S AC LIVED (homeland battle): a Fray bites
//      two same-bodied Awokin for one settled minute — the
//      Warden's company loses a fraction of what the control
//      loses, because blows that land on the control glance
//      off AC 20.
//   §C THE RUNEWRIGHT'S RELIEF LIVED (homeland attrition):
//      one beat of the curse on cursed ground — the control
//      pays the full beat, the Lv 1 Runewright pays exactly
//      the relief less, and the Lv 3 Runewright, her relief
//      grown by 1, pays nothing of a 2-point beat.
//   §D THE BINDER'S +4 LIVED (homeland Heal cast): the same
//      Heal mends exactly 9 from a Binder and exactly 5 from
//      a Warden — +4, no more, no less.
//   §E THE WITCH'S HALF PRICE LIVED (homeland): her first
//      summon pays full price (none stands yet to grant the
//      bonus); while a cast party member stands, a summon
//      and a Heal each cost half; once they have dissipated,
//      the price is whole again.
//   §F THE WITCH'S HALF PRICE LIVED (the Table): the summon
//      cast's own tale names its price — full for the first
//      member, half for the second while the first stands,
//      full again once the field stands empty.
//   §G THE SAGE'S PAIR STILL READS: +2 AC in the Table's
//      reckoning (§A) and the homeland's (§A) — her strike
//      +2 stands in strikeOnce, untouched by this build.
// Run: node scripts/drive-company-bonuses.mjs
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-company-"));
process.env.PORT = "3993";
process.env["WORKSHOP_" + "PASSWORD"] = "company-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3993";
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
  const c = await call("claimTender", { password: "company-drive-password", tenderName: name });
  const id = db.prepare("SELECT id FROM tenders WHERE code = ?").get(c.tender.code).id;
  const ownerKey = `tender:${id}`;
  const now = Date.now();
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, now);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 500, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500").run(ownerKey, now);
  await call("chooseClass", { classKey }, c.token);
  // The choosing wakes at Lv 3; the proofs below need Tenders
  // standing at exact levels, so the EXP is set back down
  // after the choosing — the class stays chosen, and every
  // level-derived number (healAmount, the relief's ladder)
  // reads the level the Tender now stands at.
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
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)").run(`${name} ${cat}`, cat, partPower, partToughness, element, `company/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: partPower, toughness: partToughness, element });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)").run(name, name, `company/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
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
const hpOf = (placementId) => db.prepare("SELECT hp FROM field_placements WHERE id = ?").get(placementId)?.hp;

/* ── §A THE RECKONINGS, READ DIRECTLY ─────────────────── */
console.log("§A the reckonings — the readers themselves, class by class");
{
  const skills = await import("../server/dist/skills.js");
  const actions = await import("../server/dist/actions.js");
  const table = await import("../server/dist/table.js");
  ok("companyAcBonusFor: warden +4, sage +2, runewright/binder/witch/none +0",
    skills.companyAcBonusFor("warden") === 4 && skills.companyAcBonusFor("sage") === 2
    && skills.companyAcBonusFor("runewright") === 0 && skills.companyAcBonusFor("binder") === 0
    && skills.companyAcBonusFor("witch") === 0 && skills.companyAcBonusFor(null) === 0);
  ok("the homeland's victim AC: toughness 10 stands 14 under a Warden, 12 under a Sage, 10 under a Binder",
    actions.homelandVictimAcFor(10, "warden") === 14 && actions.homelandVictimAcFor(10, "sage") === 12
    && actions.homelandVictimAcFor(10, "binder") === 10);
  const roomWith = (classKey) => ({
    players: new Map([["seat-1", { key: "seat-1", classKey, expKey: "tender:1" }]]),
    away: new Map(), bastion: undefined,
  });
  const victim = { card: { toughness: 10 }, ownerKey: "seat-1" };
  ok("the Table's Awokin AC: toughness 10 stands 14 under a Warden, 12 under a Sage (her pair still reads), 10 under a Runewright",
    table.awokinAcFor(roomWith("warden"), victim) === 14 && table.awokinAcFor(roomWith("sage"), victim) === 12
    && table.awokinAcFor(roomWith("runewright"), victim) === 10);
  ok("curseReliefFor: a Runewright's relief is 1 at Lv 1, 1 at Lv 2, 2 at Lv 3, 3 at Lv 6; every other class 0",
    skills.curseReliefFor("runewright", 1) === 1 && skills.curseReliefFor("runewright", 2) === 1
    && skills.curseReliefFor("runewright", 3) === 2 && skills.curseReliefFor("runewright", 6) === 3
    && skills.curseReliefFor("warden", 6) === 0 && skills.curseReliefFor(null, 6) === 0);
  ok("bindingHealBonusFor: a Binder's Binding healing +4; every other class +0",
    skills.bindingHealBonusFor("binder") === 4 && skills.bindingHealBonusFor("warden") === 0 && skills.bindingHealBonusFor(null) === 0);
  ok("witchCastCostFor: a Witch with a cast party member standing pays half, halved upward (3→2, 4→2, 2→1); without one, or any other class, full price",
    skills.witchCastCostFor("witch", 3, true) === 2 && skills.witchCastCostFor("witch", 4, true) === 2
    && skills.witchCastCostFor("witch", 2, true) === 1 && skills.witchCastCostFor("witch", 3, false) === 3
    && skills.witchCastCostFor("warden", 3, true) === 3);
}

/* ── §B THE WARDEN'S AC, LIVED IN THE HOMELAND BATTLE ─── */
console.log("§B the Warden's AC lived — one settled minute under a Fray's teeth, Warden vs control");
async function bittenLoss(classKey, label) {
  const T = await claim(label, classKey, 0);
  seedTile(T.ownerKey, 0, 0, 0);
  const t1 = seedTile(T.ownerKey, 1, 0, 0);
  const aw = seedAwokin(T.ownerKey, label, `${label} Victim`, 1, 5, "root"); // power 3; toughness 5+5+5 = 15
  const pid = placeAwokin(T.ownerKey, aw, t1, 1, 0, { hp: 10000, shield: 0 });
  // Three Frays on her tile, each biting on its own 2 s
  // cadence — the bites multiply so the AC gap speaks over
  // the dice, where one Fray's minute alone can mumble.
  for (let f = 0; f < 3; f++) {
    db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
      VALUES (?, ?, 'fray', ?, 100000, 1, 0, 1, 1, 0)`).run(T.ownerKey, t1, Date.now());
  }
  // Three settled minutes of teeth (one settle never reckons
  // more than a minute).
  for (let w = 0; w < 3; w++) {
    db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now() - 60000, T.ownerKey);
    await call("getTerritory", {}, T.token);
  }
  return 10000 - (hpOf(pid) ?? 0);
}
{
  // Toughness 15 → control AC 15 (a Lv 1 Fray's blows land on
  // a roll of 15+, three in ten), the Warden's AC 19 (19+,
  // one in ten).
  const control = await bittenLoss("runewright", "Bitten Control");
  const warden = await bittenLoss("warden", "Bitten Warden");
  console.log(`    control lost ${control.toFixed(1)} HP; the Warden's Awokin lost ${warden.toFixed(1)} HP`);
  ok("the control was bitten (the minutes of teeth were real)", control > 10, `control loss ${control}`);
  ok("the Warden's Awokin lost less than half the control's loss — the +4 AC turned blows aside",
    warden < control / 2, `warden ${warden} vs control ${control}`);
}

/* ── §C THE RUNEWRIGHT'S RELIEF, LIVED IN ATTRITION ───── */
console.log("§C the Runewright's relief lived — one beat of the curse, three Tenders");
async function curseBeatLoss(classKey, exp, label) {
  const T = await claim(label, classKey, exp);
  seedTile(T.ownerKey, 0, 0, 0);
  const tc = seedTile(T.ownerKey, 3, 0, 1); // ring 3: the beat takes 4% of the greatest health
  const aw = seedAwokin(T.ownerKey, label, `${label} Stander`, 1, 17, "root"); // toughness 17+17+17 = 51
  const pid = placeAwokin(T.ownerKey, aw, tc, 3, 0, { hp: 50 });
  await call("getTerritory", {}, T.token); // warmup read: every other settle runs and quiets
  db.prepare("UPDATE field_placements SET curse_since = ?, hp = 50 WHERE id = ?").run(Date.now() - 2800, pid);
  await call("getTerritory", {}, T.token);
  return 50 - (hpOf(pid) ?? 50);
}
{
  // The beat is reckoned off the payload's toughness (51):
  // 51 × 4% = 2.04 a beat. The differences are what is
  // proven: the control pays the whole beat; Lv 1 relief
  // pays exactly 1 less per beat; Lv 3 relief (2) leaves
  // only 0.04 of the beat standing.
  const control = await curseBeatLoss("warden", 0, "Cursed Control");
  const lv1 = await curseBeatLoss("runewright", 0, "Cursed Runewright One");
  const lv3 = await curseBeatLoss("runewright", 150, "Cursed Runewright Three");
  console.log(`    one beat cost: control ${control.toFixed(3)}, Runewright Lv 1 ${lv1.toFixed(3)}, Runewright Lv 3 ${lv3.toFixed(3)}`);
  ok("the control paid the full beat (about 2.04)", control > 1.9 && control < 2.2, `control ${control}`);
  ok("the Lv 1 Runewright paid exactly the relief less (about 1.04 — one point of relief on the beat)",
    Math.abs((control - lv1) - 1) < 0.15, `control-lv1 ${control - lv1}`);
  ok("the Lv 3 Runewright's relief had grown by 1 (she paid about 0.04 — two points of relief on the beat)",
    Math.abs((control - lv3) - 2) < 0.15, `control-lv3 ${control - lv3}`);
}

/* ── §D THE BINDER'S +4, LIVED IN A HEAL CAST ─────────── */
console.log("§D the Binder's +4 lived — the same Heal cast by a Binder and by a Warden");
async function healCast(classKey, label) {
  const T = await claim(label, classKey, 0); // Lv 1: healAmount 5 for every class
  seedTile(T.ownerKey, 0, 0, 0);
  const aw = seedAwokin(T.ownerKey, label, `${label} Wounded`, 1, 10, "root"); // toughness 30
  placeAwokin(T.ownerKey, aw, db.prepare("SELECT id FROM territory_tiles WHERE owner_key = ? AND q = 0 AND r = 0").get(T.ownerKey).id, 0, 0, { hp: 10 });
  for (let i = 0; i < 16; i++) {
    const r = await callRaw("castMapWorking", { spellKey: "heal", awakenedId: aw }, T.token);
    if (r.status === 200 && r.data && !r.data.fizzled && typeof r.data.healed === "number") return r.data.healed;
    // A fizzle mends nothing and spends the price — cast again.
  }
  return null;
}
{
  const binder = await healCast("binder", "Binding Healer");
  const warden = await healCast("warden", "Warding Healer");
  console.log(`    the Binder's Heal mended ${binder}; the Warden's mended ${warden}`);
  ok("the Warden's Heal mended exactly her healAmount (5 at Lv 1)", warden === 5, `warden ${warden}`);
  ok("the Binder's Heal mended exactly +4 more (9)", binder === 9 && binder - warden === 4, `binder ${binder}`);
}

/* ── §E THE WITCH'S HALF PRICE, LIVED ON THE HOMELAND ─── */
console.log("§E the Witch's half price lived — full, half while a cast member stands, full once dissipated");
{
  const W = await claim("Homeland Witch", "witch", 3800); // Lv 10
  const home = seedTile(W.ownerKey, 0, 0, 0);
  seedTile(W.ownerKey, 1, 0, 0);
  const A = seedAwokin(W.ownerKey, "Homeland Witch", "First Cast", 2, 2); // power 6
  const B = seedAwokin(W.ownerKey, "Homeland Witch", "Second Cast", 2, 2); // power 6
  const C = seedAwokin(W.ownerKey, "Homeland Witch", "Never Cast", 1, 10); // toughness 30, never in the party
  await call("addToParty", { awakenedId: A }, W.token);
  await call("addToParty", { awakenedId: B }, W.token);
  placeAwokin(W.ownerKey, C, home, 0, 0, { hp: 10 }); // standing, wounded — but never cast by her, and not her party

  // Her first summon: none of her cast party stands yet.
  let e0 = energyOf(W.ownerKey);
  let r = await call("summonAwoken", { awakenedId: A }, W.token);
  ok("the first summon pays full price (✦6 — no cast party member stands yet to grant the bonus)",
    r.cost === 6 && e0 - energyOf(W.ownerKey) === 6, `cost ${r.cost}, energy ${e0} -> ${energyOf(W.ownerKey)}`);
  for (let i = 0; i < 12 && !r.summoned; i++) r = await call("summonAwoken", { awakenedId: A }, W.token);

  // While A stands: the second summon costs half.
  e0 = energyOf(W.ownerKey);
  r = await call("summonAwoken", { awakenedId: B }, W.token);
  ok("while a cast party member stands, the second summon costs half (✦3 of ✦6)",
    r.cost === 3 && e0 - energyOf(W.ownerKey) === 3, `cost ${r.cost}, energy ${e0} -> ${energyOf(W.ownerKey)}`);
  for (let i = 0; i < 12 && !r.summoned; i++) r = await call("summonAwoken", { awakenedId: B }, W.token);

  // While they stand: a Heal costs half (✦1 of ✦2), charged
  // before the roll — the spend is the proof, fizzle or no.
  db.prepare("UPDATE field_placements SET hp = 1 WHERE awakened_id = ?").run(B);
  e0 = energyOf(W.ownerKey);
  r = await call("castMapWorking", { spellKey: "heal", awakenedId: B }, W.token);
  ok("while a cast party member stands, a Heal costs half (✦1 of ✦2)",
    r.cost === 1 && e0 - energyOf(W.ownerKey) === 1, `cost ${r.cost}, energy ${e0} -> ${energyOf(W.ownerKey)}`);

  // They dissipate — the placements are gone — and the
  // price is whole again, even with another Awokin standing.
  db.prepare("DELETE FROM field_placements WHERE awakened_id IN (?, ?)").run(A, B);
  e0 = energyOf(W.ownerKey);
  r = await call("castMapWorking", { spellKey: "heal", awakenedId: C }, W.token);
  ok("once her cast party members have dissipated, the Heal costs full price again (✦2)",
    r.cost === 2 && e0 - energyOf(W.ownerKey) === 2, `cost ${r.cost}, energy ${e0} -> ${energyOf(W.ownerKey)}`);
}

/* ── §F THE WITCH'S HALF PRICE, LIVED AT THE TABLE ────── */
console.log("§F the Witch's half price lived at the Table — the summon tale names its price");
{
  const { issueTableToken } = await import("../server/dist/table.js");
  const W = await claim("Table Witch", "witch", 3800);
  await call("chooseWeapon", { weaponKey: "sword" }, W.token);
  db.prepare("UPDATE tender_progress SET weapon_next_at = ? WHERE owner_key = ?").run(Date.now() + 3600_000, W.ownerKey);
  const M1 = seedAwokin(W.ownerKey, "Table Witch", "Table First", 1, 1); // power 3
  const M2 = seedAwokin(W.ownerKey, "Table Witch", "Table Second", 1, 1);
  const M3 = seedAwokin(W.ownerKey, "Table Witch", "Table Third", 1, 1);
  for (const m of [M1, M2, M3]) await call("addToParty", { awakenedId: m }, W.token);
  // A deep deck behind the party: every owned Awokin raises
  // the seat's standing energy maximum (the one energy law),
  // so a run of faltering casts cannot starve the proof's
  // purse before the priced casts have spoken.
  for (let i = 0; i < 12; i++) seedAwokin(W.ownerKey, "Table Witch", `Deck Reserve ${i}`, 3, 3);
  const tt = issueTableToken({ id: "witch-table-1", name: "Table Witch" });
  const code = (await call("getTableBindCode", {}, W.token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code }) });
  if (!bindRes.ok) throw new Error(`table/bind -> ${bindRes.status}`);

  const ws = new WebSocket(`ws://127.0.0.1:3993/table/ws`);
  const c = { state: null, you: null, errors: [], tale: [] };
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "state") { c.state = m.state; c.you = m.you; c.tale = m.state.tale ?? []; }
    if (m.type === "error" || m.type === "joinError") c.errors.push(m.message);
  });
  const send = (msg) => ws.send(JSON.stringify(msg));
  const waitFor = async (fn, what, timeout = 20000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) { if (c.state && fn(c)) return true; await sleep(200); }
    throw new Error(`Table Witch: timed out waiting for ${what}; errors: ${c.errors.join(" | ")}; tale tail: ${c.tale.slice(-3).map(t => t.text).join(" | ")}`);
  };
  await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error("Table Witch: join timeout")), 15000);
    ws.on("open", () => { send({ type: "join", authToken: tt, room: "company-witch" }); const iv = setInterval(() => { if (c.state) { clearInterval(iv); clearTimeout(to); resolve(); } }, 100); });
  });
  // The prices the tale names for one member's summon casts.
  // The served tale is a capped window, so fresh entries are
  // told apart by their text, kept in a seen-set for the
  // whole sitting.
  const seenTale = new Set();
  const freshPrices = (name) => {
    const out = [];
    for (const t of c.tale ?? []) {
      const k = `${t.at}|${t.text}`;
      if (seenTale.has(k)) continue;
      seenTale.add(k);
      if (t.text.includes(name)) { const m = t.text.match(/✦(\d+)/); if (m) out.push(Number(m[1])); }
    }
    return out;
  };
  async function summonPriced(awakenedId, name) {
    const prices = [];
    for (let i = 0; i < 16; i++) {
      send({ type: "summonCast", awakenedId });
      await sleep(700);
      prices.push(...freshPrices(name));
      const standing = (c.state.field ?? []).some(u => u.awokenId === awakenedId);
      if (standing) return { prices, standing };
    }
    return { prices, standing: false, errors: c.errors.slice(-3) };
  }
  const s1 = await summonPriced(M1, "Table First");
  ok("at the Table her first summon pays full price (the tale names ✦3, no cast member standing)",
    s1.prices.length > 0 && s1.prices.every(p => p === 3) && s1.standing, JSON.stringify(s1));
  const s2 = await summonPriced(M2, "Table Second");
  ok("at the Table, while the first cast member stands, the second summon costs half (the tale names ✦2)",
    s2.prices.length > 0 && s2.prices.every(p => p === 2) && s2.standing, JSON.stringify(s2));
  // Both recalled — the field stands empty of her cast party.
  for (const u of [...(c.state.field ?? [])]) send({ type: "recall", hex: u.hex, cardId: u.cardId });
  await waitFor((cc) => (cc.state.field ?? []).length === 0, "the field emptied", 15000);
  const s3 = await summonPriced(M3, "Table Third");
  ok("at the Table, once her cast party members stand no longer, the price is whole again (the tale names ✦3)",
    s3.prices.length > 0 && s3.prices.every(p => p === 3) && s3.standing, JSON.stringify(s3));
  ws.close();
}

console.log(`\nCOMPANY BONUSES DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
