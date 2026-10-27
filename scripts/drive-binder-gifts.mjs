// THE BINDER'S GIFTS WIRED FOR REAL — RECOVERY R9 DRIVE
// (2026-10-23; the gifts ruled by Nigel 2026-10-22 and
// entered in the class-cards spreadsheet: "Attune ×3 — her
// Attune lays triple the points" and "her Binding workings
// that heal have 2× range"). Boots the real server on a
// scratch DATA_DIR and proves, against controls:
//   §A THE RECKONINGS, read directly: pourLaidFor (the
//      book's one reckoning of what an attunement spend
//      LAYS — Binder ×3 at every kind and at no kind, the
//      Witch ×2 and the Sage +2 on spell/rune/ward pages,
//      every other hand ×1); bindingHealRangeFor (a Binder
//      doubles a range, every other hand keeps it); and
//      bindingHealBonusFor standing as R7 left it (+4 —
//      the amount is NOT doubled by this build).
//   §B ATTUNE ×3 ON THE HOMELAND (attuneTile): one pool
//      point spent by each hand — the Binder's tile bank
//      takes 3, the Warden's takes 1; on ground already
//      holding the element, her growing tray takes 3 too.
//   §C ATTUNE ×3 AT THE TABLE (attuneTile): the same spend
//      rests 3 points on her tile against the control's 1,
//      and the tale names the triple laying.
//   §D THE BOOK'S DOOR LIVED (attuneGrimoirePage — the
//      pourLaidFor call site): one slot spend (4 points)
//      lays 3 slots for the Binder, 2 for the Witch, 3 for
//      the Sage, 1 for the Warden; a Binder page with one
//      slot of room left takes exactly that 1 (the cap).
//   §E HEAL'S RANGE ON THE HOMELAND: at 8 hexes from her
//      stand a Warden's Heal is refused (ring 6) and spends
//      nothing; a Binder's Heal lands (ring 12) and mends
//      exactly 9 (5 + R7's 4 — the amount not doubled); at
//      13 hexes the Binder's own Heal is refused (ring 12).
//   §F THE SPRINGLEAF'S RANGE ON THE HOMELAND: a Warden
//      cannot plant at 8 hexes (ring 6); a Binder plants
//      there, her grove spans the QUARTERED radius 1.5
//      against the control's 0.75 (Nigel's 2026-10-27
//      ruling — the reach quarters, fractionally), and
//      her raising burst mends an ally 1 hex from the
//      grove's heart where the control's burst (radius
//      0.75) cannot reach an ally the same 1 hex out; at
//      13 hexes her planting is refused.
//   §G AT THE TABLE: the Springleaf grove a Binder plants
//      spans exactly twice the Warden's radiusPx; and
//      Heal's gate — glided 7–9 hexes from her standing
//      Awokin, the Warden's Heal is refused by its reach
//      (6) while the Binder's passes the reach gate and
//      is answered by the next gate (the whole-standing
//      refusal), her doubled reach being 12.
// Run: node scripts/drive-binder-gifts.mjs
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { WebSocket } from "ws";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-binder-"));
process.env.PORT = "3994";
process.env.WORKSHOP_PASSWORD = "binder-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3994";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

await import("../server/dist/index.js");
await sleep(2500);

async function callRaw(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
async function call(action, args, token) {
  const { status, data } = await callRaw(action, args, token);
  if (status >= 300) throw new Error(`${action} -> ${status}: ${JSON.stringify(data)}`);
  return data;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }

const setPool = (ownerKey, el, pts) => db.prepare("INSERT INTO aspect_attunement (owner_key, element, points, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(owner_key, element) DO UPDATE SET points = excluded.points").run(ownerKey, el, pts, Date.now());
const poolOf = (ownerKey, el) => db.prepare("SELECT points FROM aspect_attunement WHERE owner_key = ? AND element = ?").get(ownerKey, el)?.points ?? 0;
const pageSlots = (ownerKey, key, el) => db.prepare("SELECT slots FROM grimoire_attunements WHERE owner_key = ? AND spell_key = ? AND element = ?").get(ownerKey, key, el)?.slots ?? 0;
const energyOf = (ownerKey) => db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(ownerKey)?.energy;
const setEnergy = (ownerKey, n) => db.prepare("INSERT INTO tender_resources (owner_key, energy, terrain_bank, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = excluded.energy").run(ownerKey, n, Date.now());

async function claim(name, classKey, expAfter) {
  const c = await call("claimTender", { password: "binder-drive-password", tenderName: name });
  const id = db.prepare("SELECT id FROM tenders WHERE code = ?").get(c.tender.code).id;
  const ownerKey = `tender:${id}`;
  const now = Date.now();
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, now);
  setEnergy(ownerKey, 500);
  await call("chooseClass", { classKey }, c.token);
  if (expAfter !== 3800) db.prepare("UPDATE tender_progress SET total_exp = ? WHERE owner_key = ?").run(expAfter, ownerKey);
  return { token: c.token, ownerKey };
}
function seedTile(ownerKey, q, r, element = "root", cursed = 0) {
  return Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(ownerKey, q, r, element, cursed, Date.now()).lastInsertRowid);
}
function seedAwokin(ownerKey, tenderName, name, partPower, partToughness, element = "root") {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)").run(`${name} ${cat}`, cat, partPower, partToughness, element, `binder/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: partPower, toughness: partToughness, element });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)").run(name, name, `binder/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
function placeAwokin(ownerKey, awakenedId, tileId, q, r, hp) {
  const info = db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max)
    VALUES (?, ?, ?, ?, ?, 'defense', 0, ?, ?, ?, NULL, NULL)`).run(ownerKey, awakenedId, tileId, Date.now(), Date.now(), hp, q, r);
  return Number(info.lastInsertRowid);
}
const tileRow = (id) => db.prepare("SELECT element, attune_element AS attuneElement, attune_points AS attunePoints, grow_points AS growPoints FROM territory_tiles WHERE id = ?").get(id);
const hpOf = (pid) => db.prepare("SELECT hp FROM field_placements WHERE id = ?").get(pid)?.hp;
/** Cast until the working stands; a 400 answers at once. */
async function castOutcome(token, body, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const r = await callRaw("castMapWorking", body, token);
    if (r.status === 400) return { refused: r.data };
    if (r.status === 200 && r.data && !r.data.fizzled) return { stood: r.data };
  }
  return {};
}

/* ── §A THE RECKONINGS, READ DIRECTLY ─────────────────── */
console.log("§A the reckonings — pourLaidFor, bindingHealRangeFor, the R7 amount standing");
{
  const G = await import("../server/dist/grimoire.js");
  const S = await import("../server/dist/skills.js");
  const L = G.pourLaidFor;
  ok("pourLaidFor: a Binder's spend lays ×3 at every page kind — and at no kind, the Attune acts' shape (1 → 3, 3 → 9)",
    L("binder", "ward", 1) === 3 && L("binder", "rune", 3) === 9 && L("binder", "spell", 3) === 9
    && L("binder", "binding", 3) === 9 && L("binder", null, 1) === 3 && L("binder", "ward", 0) === 0);
  ok("pourLaidFor: the Witch's ×2 and the Sage's +2 stand on spell/rune/ward pages, and neither bends a binding or a tile",
    L("witch", "ward", 3) === 6 && L("witch", "rune", 3) === 6 && L("sage", "spell", 3) === 5
    && L("witch", "binding", 3) === 3 && L("sage", "binding", 3) === 3 && L("witch", null, 1) === 1 && L("sage", null, 1) === 1);
  ok("pourLaidFor: every other hand lays what it spends (warden, runewright, classless)",
    L("warden", "ward", 3) === 3 && L("runewright", "rune", 1) === 1 && L(null, null, 1) === 1);
  ok("bindingHealRangeFor: a Binder doubles a range (6 → 12, 3 → 6); every other hand keeps it",
    S.bindingHealRangeFor("binder", 6) === 12 && S.bindingHealRangeFor("binder", 3) === 6
    && S.bindingHealRangeFor("warden", 6) === 6 && S.bindingHealRangeFor("witch", 6) === 6 && S.bindingHealRangeFor(null, 6) === 6);
  ok("bindingHealBonusFor stands as R7 left it (Binder +4, others +0) — the amount is read separately, never doubled here",
    S.bindingHealBonusFor("binder") === 4 && S.bindingHealBonusFor("warden") === 0);
}

/* ── §B ATTUNE ×3 ON THE HOMELAND ─────────────────────── */
console.log("§B Attune ×3 on the homeland — one point spent, three laid, against the control's one");
async function homelandAttune(classKey, label, targetElement) {
  const T = await claim(label, classKey, 3800);
  seedTile(T.ownerKey, 0, 0, "root");
  const target = seedTile(T.ownerKey, 1, 0, targetElement);
  setPool(T.ownerKey, "root", 25);
  await call("setTenderTile", { tileId: target }, T.token);
  const r = await call("attuneTile", { element: "root" }, T.token);
  return { T, r, target };
}
{
  const b = await homelandAttune("binder", "Homeland Binder Attune", "neutral");
  ok("the Binder's attune answers laid 3 for her 1-point spend", b.r.laid === 3, JSON.stringify(b.r));
  ok("the Binder's tile bank holds exactly 3 root points from one spend", tileRow(b.target).attuneElement === "root" && tileRow(b.target).attunePoints === 3, JSON.stringify(tileRow(b.target)));
  ok("the Binder's pool paid exactly 1 (25 → 24) — the same spend as any hand", poolOf(b.T.ownerKey, "root") === 24, `pool=${poolOf(b.T.ownerKey, "root")}`);
  const w = await homelandAttune("warden", "Homeland Warden Attune", "neutral");
  ok("control: the Warden's attune lays 1, her bank holds 1, her pool paid 1",
    w.r.laid === 1 && tileRow(w.target).attunePoints === 1 && poolOf(w.T.ownerKey, "root") === 24,
    `laid=${w.r.laid} bank=${JSON.stringify(tileRow(w.target))} pool=${poolOf(w.T.ownerKey, "root")}`);
  // The tray: ground already holding the spent element.
  const bt = await homelandAttune("binder", "Homeland Binder Tray", "root");
  ok("on ground already holding root, the Binder's spend feeds the growing tray 3 (not 1)",
    tileRow(bt.target).growPoints === 3, JSON.stringify(tileRow(bt.target)));
  const wt = await homelandAttune("warden", "Homeland Warden Tray", "root");
  ok("control: the Warden's matching spend feeds the tray 1", tileRow(wt.target).growPoints === 1, JSON.stringify(tileRow(wt.target)));
}

/* ── §D THE BOOK'S DOOR LIVED ─────────────────────────── */
console.log("§D the book's door lived — one 4-point slot spend, the gifts' layings, the cap");
{
  const fills = {};
  for (const [label, classKey] of [["Door Binder", "binder"], ["Door Warden", "warden"], ["Door Witch", "witch"], ["Door Sage", "sage"]]) {
    const T = await claim(label, classKey, 3800);
    setPool(T.ownerKey, "stone", 25);
    fills[classKey] = { T, r: await call("attuneGrimoirePage", { spellKey: "seal", element: "stone" }, T.token) };
  }
  ok("every hand paid the same 4 for the spend (pools 25 → 21, all four)",
    ["binder", "warden", "witch", "sage"].every(k => fills[k].r.spent === 4 && poolOf(fills[k].T.ownerKey, "stone") === 21),
    JSON.stringify(Object.fromEntries(Object.entries(fills).map(([k, v]) => [k, v.r]))));
  ok("the Binder's spend laid 3 slots standing in the Seal's page", fills.binder.r.laid === 3 && fills.binder.r.inElement === 3 && pageSlots(fills.binder.T.ownerKey, "seal", "stone") === 3, JSON.stringify(fills.binder.r));
  ok("the Witch's spend laid 2, the Sage's laid 3 (+2), the Warden's laid the 1 she sought",
    fills.witch.r.laid === 2 && fills.sage.r.laid === 3 && fills.warden.r.laid === 1
    && pageSlots(fills.witch.T.ownerKey, "seal", "stone") === 2 && pageSlots(fills.sage.T.ownerKey, "seal", "stone") === 3 && pageSlots(fills.warden.T.ownerKey, "seal", "stone") === 1,
    `witch=${fills.witch.r.laid} sage=${fills.sage.r.laid} warden=${fills.warden.r.laid}`);
  // The cap: a Binder page with 7 standing — one slot of room.
  const capT = fills.binder.T;
  db.prepare("UPDATE grimoire_attunements SET slots = 7 WHERE owner_key = ? AND spell_key = 'seal' AND element = 'stone'").run(capT.ownerKey);
  setPool(capT.ownerKey, "root", 25);
  const capR = await call("attuneGrimoirePage", { spellKey: "seal", element: "root" }, capT.token);
  ok("the cap stands over the gift: with one slot of room, her spend lays exactly that 1 (page full at 8) and still pays 4",
    capR.laid === 1 && capR.filled === 8 && poolOf(capT.ownerKey, "root") === 21, JSON.stringify(capR));
}

/* ── §E HEAL'S RANGE ON THE HOMELAND ──────────────────── */
console.log("§E Heal's range on the homeland — refused at 8 for the control, landed at 8 for the Binder, refused at 13 for the Binder");
async function healRangeTender(classKey, label) {
  const T = await claim(label, classKey, 0); // Lv 1: healAmount 5
  const ids = {};
  for (let q = 0; q <= 13; q++) ids[q] = seedTile(T.ownerKey, q, 0, "root");
  const aw8 = seedAwokin(T.ownerKey, label, `${label} Far`, 1, 10);
  const p8 = placeAwokin(T.ownerKey, aw8, ids[8], 8, 0, 10);
  const aw13 = seedAwokin(T.ownerKey, label, `${label} Farthest`, 1, 10);
  placeAwokin(T.ownerKey, aw13, ids[13], 13, 0, 10);
  return { T, aw8, p8, aw13 };
}
{
  const w = await healRangeTender("warden", "Range Warden");
  const e0 = energyOf(w.T.ownerKey);
  const wr = await callRaw("castMapWorking", { spellKey: "heal", awakenedId: w.aw8 }, w.T.token);
  ok("the Warden's Heal at 8 hexes is refused by the ring (6), in plain words", wr.status === 400 && /ring 6/.test(JSON.stringify(wr.data)), `${wr.status} ${JSON.stringify(wr.data)}`);
  ok("the refused Heal spent nothing and mended nothing", energyOf(w.T.ownerKey) === e0 && hpOf(w.p8) === 10, `energy=${energyOf(w.T.ownerKey)} hp=${hpOf(w.p8)}`);

  const b = await healRangeTender("binder", "Range Binder");
  const landed = await castOutcome(b.T.token, { spellKey: "heal", awakenedId: b.aw8 });
  ok("the Binder's Heal at the same 8 hexes LANDS (her ring is 12)", !!landed.stood && typeof landed.stood.healed === "number", JSON.stringify(landed));
  ok("and it mends exactly 9 — healAmount 5 + R7's +4, the amount NOT doubled by the range gift",
    landed.stood?.healed === 9 && hpOf(b.p8) === 19, `healed=${landed.stood?.healed} hp=${hpOf(b.p8)}`);
  const e1 = energyOf(b.T.ownerKey);
  const br = await callRaw("castMapWorking", { spellKey: "heal", awakenedId: b.aw13 }, b.T.token);
  ok("the Binder's Heal at 13 hexes is refused — beyond even her doubled ring (12)", br.status === 400 && /ring 12/.test(JSON.stringify(br.data)), `${br.status} ${JSON.stringify(br.data)}`);
  ok("that refusal spent nothing either", energyOf(b.T.ownerKey) === e1, `energy=${energyOf(b.T.ownerKey)}`);
}

/* ── §F THE SPRINGLEAF'S RANGE ON THE HOMELAND ────────── */
console.log("§F the Springleaf's range on the homeland — planting reach, grove radius, the burst's reach");
async function groveTender(classKey, label) {
  const T = await claim(label, classKey, 200); // Lv 3
  const ids = {};
  for (let q = 0; q <= 13; q++) ids[q] = seedTile(T.ownerKey, q, 0, "root");
  return { T, ids };
}
{
  const w = await groveTender("warden", "Grove Range Warden");
  const wr = await callRaw("castMapWorking", { spellKey: "springleaf", tileId: w.ids[8] }, w.T.token);
  ok("the Warden cannot plant the Springleaf at 8 hexes (ring 6)", wr.status === 400 && /ring 6/.test(JSON.stringify(wr.data)), `${wr.status} ${JSON.stringify(wr.data)}`);
  const wPlant = await castOutcome(w.T.token, { spellKey: "springleaf", tileId: w.ids[1] });
  ok("the Warden's grove at her own ring spans the quartered radius 0.75 (Lv 3, Nigel 2026-10-27)", wPlant.stood?.radiusHexes === 0.75, JSON.stringify(wPlant.stood));

  const b = await groveTender("binder", "Grove Range Binder");
  const bPlant = await castOutcome(b.T.token, { spellKey: "springleaf", tileId: b.ids[8] });
  ok("the Binder plants the Springleaf at the same 8 hexes (her ring is 12)", !!bPlant.stood, JSON.stringify(bPlant));
  ok("her grove spans radius 1.5 — twice the control's quartered 0.75", bPlant.stood?.radiusHexes === 1.5, `radius=${bPlant.stood?.radiusHexes}`);
  const br = await callRaw("castMapWorking", { spellKey: "springleaf", tileId: b.ids[13] }, b.T.token);
  ok("her planting at 13 hexes is refused — beyond her doubled ring (12)", br.status === 400 && /ring 12/.test(JSON.stringify(br.data)), `${br.status} ${JSON.stringify(br.data)}`);

  // The burst's reach, at the quartered measure: an ally
  // 1 hex from the grove's heart — INSIDE the Binder's
  // doubled quarter (1.5), OUTSIDE the Warden's quarter
  // (0.75). (Before the 2026-10-27 quartering this same
  // discrimination was staged 5 hexes out, inside 6 /
  // outside 3.)
  const burstCase = async (classKey, label, groveQ, allyQ) => {
    const { T, ids } = await groveTender(classKey, label);
    const aw = seedAwokin(T.ownerKey, label, `${label} Ally`, 1, 10);
    const pid = placeAwokin(T.ownerKey, aw, ids[allyQ], allyQ, 0, 10);
    const plant = await castOutcome(T.token, { spellKey: "springleaf", tileId: ids[groveQ] });
    return { plant, hp: hpOf(pid) };
  };
  const bb = await burstCase("binder", "Burst Binder", 8, 9); // ally 1 from the grove's heart, inside radius 1.5
  ok("the Binder's raising burst mends the ally 1 hex out (inside her doubled, quartered radius)", (bb.hp ?? 0) > 10, `hp=${bb.hp} burst=${bb.plant.stood?.burst}`);
  const wb = await burstCase("warden", "Burst Warden", 1, 2); // ally 1 from the grove's heart, outside radius 0.75
  ok("control: the Warden's burst cannot reach the ally the same 1 hex out (hp untouched)", wb.hp === 10, `hp=${wb.hp} burst=${wb.plant.stood?.burst}`);
}

/* ── Table harness (for §C and §G) ──────────────────────── */
const { issueTableToken } = await import("../server/dist/table.js");
async function seedBoundTender({ tenderName, password, tag, classKey, filler = 40 }) {
  const claimRes = await call("claimTender", { password, tenderName });
  const token = claimRes.token;
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claimRes.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, Date.now());
  const now = Date.now();
  const insAsset = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
  const insAwokin = db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)");
  const addAwokin = (name, element, power, toughness) => {
    const bodyId = Number(insAsset.run(`Body ${name}`, "body", power, toughness, element, `binder/body-${name}.png`, now).lastInsertRowid);
    const composition = JSON.stringify([{ source_id: `db:${bodyId}`, name: `Body ${name}`, category: "body", rarity: "common", power, toughness, element }]);
    return Number(insAwokin.run(name, name, `binder/awokin-${name}.png`, composition, tenderName, ownerKey, now).lastInsertRowid);
  };
  for (let i = 0; i < filler; i++) addAwokin(`Filler ${tag}-${i}`, "sky", 2, 2);
  await call("chooseClass", { classKey }, token);
  const tt = issueTableToken({ id: `disc-${tag}`, name: tenderName });
  const code = (await call("getTableBindCode", {}, token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code }) });
  if (!bindRes.ok) throw new Error(`table/bind -> ${bindRes.status}`);
  return { token, tt, ownerKey, addAwokin };
}
function client(label) {
  const ws = new WebSocket("ws://127.0.0.1:3994/table/ws");
  const c = { label, ws, state: null, you: null, errors: [] };
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "state") { c.state = m.state; c.you = m.you; }
    if (m.type === "error" || m.type === "joinError") c.errors.push(m.message);
  });
  c.send = (msg) => ws.send(JSON.stringify(msg));
  c.join = (join) => new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error(`${label}: join timeout`)), 10000);
    ws.on("open", () => {
      c.send({ type: "join", ...join });
      const iv = setInterval(() => { if (c.state) { clearInterval(iv); clearTimeout(to); resolve(); } }, 100);
    });
  });
  c.waitFor = async (fn, what, timeout = 30000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (c.state && fn(c)) return true;
      await sleep(150);
    }
    throw new Error(`${label}: timed out waiting for ${what}; errors: ${c.errors.slice(-2).join(" | ")}`);
  };
  return c;
}
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const neighboursOf = (id) => { const [q, r] = id.split(",").map(Number); return DIRS.map(([dq, dr]) => `${q + dq},${r + dr}`); };
const axDist = (a, b) => { const [aq, ar] = a.split(",").map(Number); const [bq, br] = b.split(",").map(Number); return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs((aq + ar) - (bq + br))) / 2; };
async function castTableUntil(c, msg, find, what, tries = 18) {
  for (let i = 0; i < tries; i++) {
    c.send(msg);
    try { await c.waitFor(cc => !!find(cc), what, 3000); return find(c); }
    catch { /* a fizzle — cast again */ }
  }
  throw new Error(`${c.label}: ${what} never stood`);
}

/* ── §C ATTUNE ×3 AT THE TABLE ──────────────────────────── */
console.log("§C Attune ×3 at the Table — 3 points resting for her 1-point spend");
{
  const mk = async (tenderName, tag, classKey, room) => {
    const T = await seedBoundTender({ tenderName, password: `binder-pw-${tag}`, tag, classKey, filler: 0 });
    setPool(T.ownerKey, "root", 5);
    const c = client(tag);
    await c.join({ authToken: T.tt, room });
    await c.waitFor(cc => !!cc.you?.landing, "the landing");
    return { T, c, landing: c.you.landing };
  };
  const b = await mk("Table Binder Attune", "R9B", "binder", "binder-attune-room");
  b.c.send({ type: "attuneTile", hex: b.landing, element: "root" });
  await b.c.waitFor(cc => (cc.state.map.find(t => t.id === b.landing)?.points?.root ?? 0) === 3, "3 root points resting");
  const bTile = b.c.state.map.find(t => t.id === b.landing);
  ok("the Binder's Table attune rests exactly 3 root points on the tile for one spend", bTile?.points?.root === 3, JSON.stringify(bTile?.points));
  ok("her pool paid exactly 1 (5 → 4)", poolOf(b.T.ownerKey, "root") === 4 && b.c.you.pools?.root === 4, `db=${poolOf(b.T.ownerKey, "root")} seat=${b.c.you.pools?.root}`);
  ok("the tale names the triple laying", b.c.state.tale.some(t => t.text.includes("lays triple") && t.text.includes("3 root points rest")), b.c.state.tale.slice(-2).map(t => t.text).join(" | "));
  const w = await mk("Table Warden Attune", "R9W", "warden", "warden-attune-room");
  w.c.send({ type: "attuneTile", hex: w.landing, element: "root" });
  await w.c.waitFor(cc => (cc.state.map.find(t => t.id === w.landing)?.points?.root ?? 0) === 1, "1 root point resting");
  const wTile = w.c.state.map.find(t => t.id === w.landing);
  ok("control: the Warden's Table attune rests exactly 1 root point, pool 5 → 4", wTile?.points?.root === 1 && poolOf(w.T.ownerKey, "root") === 4, JSON.stringify(wTile?.points));
  b.c.ws.close(); w.c.ws.close();
}

/* ── §G AT THE TABLE — SPRINGLEAF RADIUS + HEAL'S GATE ─── */
console.log("§G at the Table — the Binder's grove spans twice the control's, and Heal's gate opens twice as far");
{
  const groveAt = async (tenderName, tag, classKey, room) => {
    const T = await seedBoundTender({ tenderName, password: `binder-pw-${tag}`, tag, classKey, filler: 40 });
    const c = client(tag);
    await c.join({ authToken: T.tt, room });
    await c.waitFor(cc => !!cc.you?.landing, "the landing");
    const landing = c.you.landing;
    const hexB = neighboursOf(landing)[0];
    const grove = await castTableUntil(c,
      { type: "castWard", root: "springleaf", hexA: landing, hexB },
      cc => cc.state.workings.find(x => x.kind === "grove" && x.ownerKey === cc.you.key),
      "the grove stands");
    return { T, c, grove };
  };
  const w = await groveAt("Table Grove Warden", "R9GW", "warden", "grove-warden-room");
  const b = await groveAt("Table Grove Binder", "R9GB", "binder", "grove-binder-room");
  ok("the Binder's Table grove radius is exactly twice the Warden's (same level, same page)",
    b.grove.radiusPx === w.grove.radiusPx * 2, `binder=${b.grove.radiusPx} warden=${w.grove.radiusPx}`);
  w.c.ws.close(); b.c.ws.close();

  // Heal's gate, discriminated by gliding away from a
  // standing (whole) Awokin: at 7–9 hexes the Warden's
  // cast is refused BY THE REACH, the Binder's passes the
  // reach and is answered by the whole-standing gate.
  const glideTo = async (actor, targetHex, ms = 45000) => {
    const [tq, tr] = targetHex.split(",").map(Number);
    const k = 40 / 796;
    actor.send({ type: "glide", tx: tq * 1292 * k, ty: tq * 470 * k + tr * 948 * k });
    const s = Date.now();
    while (Date.now() - s < ms) {
      const me = actor.state?.players.find(p => p.key === actor.you.key);
      if (me?.hex === targetHex) return true;
      await sleep(200);
    }
    return false;
  };
  const healGateCase = async (tenderName, tag, classKey, room) => {
    const T = await seedBoundTender({ tenderName, password: `binder-pw-${tag}`, tag, classKey, filler: 40 });
    const M = T.addAwokin(`${tenderName} Kin`, "root", 1, 1);
    await call("addToParty", { awakenedId: M }, T.token);
    const c = client(tag);
    await c.join({ authToken: T.tt, room });
    await c.waitFor(cc => !!cc.you?.landing, "the landing");
    let summoned = false;
    for (let i = 0; i < 16 && !summoned; i++) {
      c.send({ type: "summonCast", awakenedId: M });
      await sleep(700);
      summoned = (c.state.field ?? []).some(u => u.awokenId === M);
    }
    if (!summoned) throw new Error(`${tag}: the Kin never stood`);
    const unit = c.state.field.find(u => u.awokenId === M);
    const far = c.state.map.map(t => t.id).find(id => { const d = axDist(unit.hex, id); return d >= 7 && d <= 9; });
    if (!far) throw new Error(`${tag}: no tile 7–9 hexes from the Kin`);
    const glided = await glideTo(c, far);
    if (!glided) throw new Error(`${tag}: the glide to ${far} never landed`);
    const errBefore = c.errors.length;
    c.send({ type: "castHeal", hex: unit.hex });
    await sleep(1500);
    return { c, errs: c.errors.slice(errBefore), dist: axDist(far, unit.hex) };
  };
  const wg = await healGateCase("Table Heal Warden", "R9HW", "warden", "heal-warden-room");
  ok(`the Warden, standing ${wg.dist} hexes off, is refused by Heal's reach (6)`, wg.errs.some(e => e.includes("Heal reaches 6 hexes")), wg.errs.join(" | "));
  const bg = await healGateCase("Table Heal Binder", "R9HB", "binder", "heal-binder-room");
  ok(`the Binder, standing ${bg.dist} hexes off, passes Heal's reach (12) — the next gate answers instead (her Awokin stands whole)`,
    !bg.errs.some(e => e.includes("Heal reaches")) && bg.errs.some(e => e.includes("stands whole already")), bg.errs.join(" | "));
  wg.c.ws.close(); bg.c.ws.close();
}

console.log(`\nBINDER'S GIFTS DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
