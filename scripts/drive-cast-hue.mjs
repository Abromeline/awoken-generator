// drive-cast-hue — CASTS CARRY THE PAGE'S COLOUR AGAIN
// (Nigel's ruling, 2026-10-20 19:35: a spell's colour at
// cast comes from the greatest attunement on its Grimoire
// page; none = unaligned; ties = the standing form — and
// the book keeps no standing-form record, so a tie casts
// unaligned, the build's flagged fallback). Boots the real
// server on a scratch DATA_DIR and proves, on BOTH grounds:
//   §0 THE JUDGING ITSELF (pageHueFor / castHuesFor read
//      against seeded ledgers): a page's majority element
//      judges; a bare page is unaligned; a TIED page is
//      unaligned (no standing form stands in the book);
//      Shard Rain is judged by the pools' BANDS — the
//      greatest band, ties unaligned — for its page holds
//      no slots and its dice answer pool levels.
//   §T THE TABLE: a Seal page holding 3 fire slots is cast
//      with NO hue named (as the clients now send) — the
//      working stands FIRE, pour 3, riposte and health
//      exactly the bare measures + 3 — and the seat's
//      served castHues named "fire" before the tap. A cast
//      SMUGGLING hue "stone" changes nothing. A bare page
//      casts unaligned and plain; a tied page casts
//      unaligned (its served colour says so too). Shard
//      Rain written by a Tender whose fire pool stands at
//      band III stands with hue "fire" and rainLevel 3
//      snapshotted; the bare-pooled control stands
//      unaligned at rainLevel 0.
//   §H THE HOMELAND: the same Seal through the HTTP door
//      with a smuggled "stone" — the row stands fire,
//      pour 3, health and riposte exactly the bare control
//      + 3. Shard Rain stands on clean ground holding
//      rainLevel 3 in fire (control: 0, unaligned); and
//      written on cursed ground whose curse holds 4, the
//      derived rain's pool (5 dice, least 5) BREAKS it and
//      the ground turns FIRE — where the control's base
//      rain (2 dice, most 12) can never break a curse of
//      13, and its ground stays cursed.
// Run: node scripts/drive-cast-hue.mjs
import WebSocket from "ws";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

const OUT = "/home/hatch/workspace/cast-hue-proof";
mkdirSync(OUT, { recursive: true });
const DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-hue-"));
process.env.DATA_DIR = DATA_DIR;
process.env.PORT = "39871";
process.env.WORKSHOP_PASSWORD = "drive-hue-word";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

await import("../server/dist/index.js");
await sleep(2500);
const base = "http://127.0.0.1:39871";
const db = new Database(join(DATA_DIR, "app.db"));
// Fresh-DB migration-order defect (carried by the Audit):
// stand the greeter column up so full awakened selects do
// not throw, as every harness since 2026-10-20 records.
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }

const G = await import("../server/dist/grimoire.js");
const SEAL = G.spellByKey("seal");
const RAIN = G.spellByKey("shardrain");

const poolOf = (ownerKey, el) => db.prepare("SELECT points FROM aspect_attunement WHERE owner_key = ? AND element = ?").get(ownerKey, el)?.points ?? 0;
const setPool = (ownerKey, el, pts) => db.prepare("INSERT INTO aspect_attunement (owner_key, element, points, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(owner_key, element) DO UPDATE SET points = excluded.points").run(ownerKey, el, pts, Date.now());
const setPage = (ownerKey, key, el, slots) => db.prepare("INSERT INTO grimoire_attunements (owner_key, spell_key, element, slots, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(owner_key, spell_key, element) DO UPDATE SET slots = excluded.slots").run(ownerKey, key, el, slots, Date.now());

async function call(action, args, token, expectFail = false) {
  const res = await fetch(`${base}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!expectFail && !res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return { status: res.status, data };
}

/* ── §0 THE JUDGING ITSELF ──────────────────────────── */
console.log("\n§0 the judging — pageHueFor read against seeded ledgers");
{
  const claim = await call("claimTender", { password: "drive-hue-password", tenderName: "Judge Tender" });
  const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.data.tender.code).id}`;
  check("a bare page casts unaligned", (await G.pageHueFor(me, SEAL)) === "unaligned");
  setPage(me, "seal", "fire", 3); setPage(me, "seal", "stone", 1);
  check("the majority element judges (fire 3 over stone 1)", (await G.pageHueFor(me, SEAL)) === "fire");
  setPage(me, "seal", "stone", 3);
  check("a TIED page casts unaligned — the book keeps no standing form to keep (flagged fallback)",
    (await G.pageHueFor(me, SEAL)) === "unaligned", await G.pageHueFor(me, SEAL));
  check("Shard Rain with bare pools is unaligned", (await G.pageHueFor(me, RAIN)) === "unaligned");
  setPool(me, "fire", 30); setPool(me, "root", 10);
  check("Shard Rain is judged by the greatest pool BAND (fire III over root I)",
    (await G.pageHueFor(me, RAIN)) === "fire", await G.pageHueFor(me, RAIN));
  setPool(me, "root", 25);
  check("Shard Rain still judges fire while the bands differ (fire III over root II)",
    (await G.pageHueFor(me, RAIN)) === "fire");
  setPool(me, "root", 30);
  check("Shard Rain under TIED bands casts unaligned", (await G.pageHueFor(me, RAIN)) === "unaligned");
  const hues = await G.castHuesFor(me);
  check("castHuesFor serves the same judging in bulk (seal tie → unaligned, rain tie → unaligned)",
    hues.seal === "unaligned" && hues.shardrain === "unaligned", JSON.stringify({ seal: hues.seal, shardrain: hues.shardrain }));
  void poolOf;
}

/* ── Table harness (test62's shape) ─────────────────── */
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const neighbours = (id) => { const [q, r] = id.split(",").map(Number); return DIRS.map(([dq, dr]) => `${q + dq},${r + dr}`); };
function client(label) {
  const ws = new WebSocket("ws://127.0.0.1:39871/table/ws");
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
  c.waitFor = async (fn, what, timeout = 30000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (c.state && fn(c)) return true;
      await sleep(150);
    }
    throw new Error(`${label}: timed out waiting for ${what}`);
  };
  return c;
}
async function seedBoundTender({ tenderName, password, tag, classKey, filler = 120 }) {
  const claim = await call("claimTender", { password, tenderName });
  const token = claim.data.token;
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.data.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, Date.now());
  const now = Date.now();
  const insAsset = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
  const insAwokin = db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)");
  for (let i = 0; i < filler; i++) {
    const bodyId = Number(insAsset.run(`Body ${tag}-${i}`, "body", 2, 2, "sky", `test/body-${tag}-${i}.png`, now).lastInsertRowid);
    const composition = JSON.stringify([{ source_id: `db:${bodyId}`, name: `Body ${tag}-${i}`, category: "body", rarity: "common", power: 2, toughness: 2, element: "sky" }]);
    insAwokin.run(`Filler ${tag}-${i}`, `Filler ${tag}-${i}`, `test/awokin-${tag}-${i}.png`, composition, tenderName, ownerKey, now);
  }
  await call("chooseClass", { classKey }, token);
  const { issueTableToken } = await import("../server/dist/table.js");
  const tt = issueTableToken({ id: `disc-${tag}`, name: tenderName });
  const code = (await call("getTableBindCode", {}, token)).data.code;
  const bindRes = await fetch(`${base}/api/table/bind`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: tt, code }),
  });
  if (!bindRes.ok) throw new Error(`table/bind -> ${bindRes.status}`);
  return { token, tt, ownerKey };
}
async function joinBound(tt, room, label) {
  const c = client(label);
  await c.join({ authToken: tt, room });
  await c.waitFor(cc => !!cc.state.players.find(p => p.key === cc.you.key)?.pos, "the tender stands in pixel space");
  return c;
}
async function castUntil(c, msg, find, what, tries = 18) {
  for (let i = 0; i < tries; i++) {
    c.send(msg);
    try { await c.waitFor(cc => !!find(cc), what, 3000); return find(c); }
    catch { /* a fizzle — cast again */ }
  }
  throw new Error(`${c.label}: ${what} never stood`);
}

/* ── §T THE TABLE ───────────────────────────────────── */
console.log("\n§T the table — the cast wears its page's colour");
{
  const fire = await seedBoundTender({ tenderName: "Fire Page", password: "drive-fire-1", tag: "HUEF", classKey: "warden" });
  const bare = await seedBoundTender({ tenderName: "Bare Page", password: "drive-bare-1", tag: "HUEB", classKey: "warden" });
  const tied = await seedBoundTender({ tenderName: "Tied Page", password: "drive-tied-1", tag: "HUET", classKey: "warden" });
  setPage(fire.ownerKey, "seal", "fire", 3);
  setPool(fire.ownerKey, "fire", 30);
  setPage(tied.ownerKey, "seal", "fire", 2); setPage(tied.ownerKey, "seal", "stone", 2);
  const room = "table-hue-a";
  const cF = await joinBound(fire.tt, room, "HUE-F");
  const cB = await joinBound(bare.tt, room, "HUE-B");
  const cT = await joinBound(tied.tt, room, "HUE-T");

  check("THE PREVIEW: the seat is served its casts' colours — fire page 'fire', bare page 'unaligned', tied page 'unaligned', rain judged by pools 'fire'",
    cF.you.castHues?.seal === "fire" && cB.you.castHues?.seal === "unaligned" &&
    cT.you.castHues?.seal === "unaligned" && cF.you.castHues?.shardrain === "fire",
    JSON.stringify({ f: cF.you.castHues?.seal, b: cB.you.castHues?.seal, t: cT.you.castHues?.seal, rain: cF.you.castHues?.shardrain }));

  const castSeal = async (c, edgeIdx, extra = {}) => {
    const landing = c.you.landing;
    const hexB = neighbours(landing)[edgeIdx];
    return castUntil(c,
      { type: "castWard", root: "seal", hexA: landing, hexB, ...extra },
      cc => cc.state.workings.find(w => w.kind === "ward" && w.engine === "seal" && w.hexA === landing && w.hexB === hexB),
      "the seal stands");
  };
  const fireSeal = await castSeal(cF, 1);
  const bareSeal = await castSeal(cB, 1);
  check("NO HUE NAMED: the fire page's Seal stands FIRE, carrying its 3 slots",
    fireSeal.hue === "fire" && fireSeal.pour === 3, `hue=${fireSeal.hue} pour=${fireSeal.pour}`);
  check("the fire Seal's riposte and health are exactly the bare Seal's + 3",
    fireSeal.nums?.riposte === (bareSeal.nums?.riposte ?? 0) + 3 && fireSeal.hp === bareSeal.hp + 3,
    `riposte ${bareSeal.nums?.riposte} -> ${fireSeal.nums?.riposte}; hp ${bareSeal.hp} -> ${fireSeal.hp}`);
  check("the bare page's Seal stands unaligned and plain (0 carried)",
    bareSeal.hue === "unaligned" && bareSeal.pour === 0, `hue=${bareSeal.hue} pour=${bareSeal.pour}`);
  const smuggled = await castSeal(cF, 2, { hue: "stone" });
  check("A SMUGGLED HUE CHANGES NOTHING: named 'stone', the cast still stands fire with its 3 slots",
    smuggled.hue === "fire" && smuggled.pour === 3 && smuggled.nums?.riposte === fireSeal.nums?.riposte,
    `hue=${smuggled.hue} pour=${smuggled.pour}`);
  const tiedSeal = await castSeal(cT, 1);
  check("THE TIED PAGE casts unaligned and carries nothing (flagged fallback — no standing form in the book)",
    tiedSeal.hue === "unaligned" && tiedSeal.pour === 0, `hue=${tiedSeal.hue} pour=${tiedSeal.pour}`);

  const freeHex = cF.state.map.map(t => t.id).find(id => id !== "0,0" && ![cF, cB, cT].some(x => x.you?.landing === id));
  const rain = await castUntil(cF,
    { type: "castRune", root: "shardrain", hexes: [freeHex] },
    cc => cc.state.workings.find(w => w.kind === "rune" && w.engine === "shardrain" && w.hex === freeHex),
    "the rain stands written");
  check("SHARD RAIN AT THE TABLE: written in the derived element — hue fire, rainLevel 3 snapshotted from the fire band",
    rain.hue === "fire" && rain.nums?.rainLevel === 3, `hue=${rain.hue} rainLevel=${rain.nums?.rainLevel}`);
  const freeHex2 = cB.state.map.map(t => t.id).find(id => id !== "0,0" && id !== freeHex && ![cF, cB, cT].some(x => x.you?.landing === id));
  const rainBare = await castUntil(cB,
    { type: "castRune", root: "shardrain", hexes: [freeHex2] },
    cc => cc.state.workings.find(w => w.kind === "rune" && w.engine === "shardrain" && w.hex === freeHex2),
    "the bare rain stands written");
  check("SHARD RAIN CONTROL: bare pools write unaligned at the base dice (rainLevel 0)",
    rainBare.hue === "unaligned" && (rainBare.nums?.rainLevel ?? 0) === 0, `hue=${rainBare.hue} rainLevel=${rainBare.nums?.rainLevel}`);
  cF.ws.close(); cB.ws.close(); cT.ws.close();
}

/* ── §H THE HOMELAND ────────────────────────────────── */
console.log("\n§H the homeland — the same judging through the HTTP door");
{
  const claimH = async (name) => {
    const claim = await call("claimTender", { password: "drive-hue-home", tenderName: name });
    const token = claim.data.token;
    const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.data.tender.code).id}`;
    db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 200, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 200").run(me, Date.now());
    await call("chooseClass", { classKey: "warden" }, token);
    db.prepare("INSERT INTO tender_resources (owner_key, energy, terrain_bank, updated_at) VALUES (?, 500, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500").run(me, Date.now());
    return { token, me };
  };
  const seedTileH = (me) => (q, r, cursed) => Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, ?, ?, ?, ?)").run(me, q, r, cursed, Date.now()).lastInsertRowid);
  const seedAwakenedH = (me, name) => {
    const nowMs = Date.now();
    const pieceId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'body', 'common', 1, 40, 'root', 'test/p.png', 'image/png', ?)").run(name, nowMs).lastInsertRowid);
    const composition = JSON.stringify([{ source_id: `db:${pieceId}`, name, category: "body", rarity: "common", power: 1, toughness: 40, element: "root" }]);
    return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, 'test/a.png', ?, 'tender', 'Hue', ?, ?)").run(name, name, composition, me, nowMs).lastInsertRowid);
  };
  const castRawH = async (token, body) => call("castMapWorking", body, token, true);
  const castUntilStandsH = async (token, body, tries = 20) => {
    for (let i = 0; i < tries; i++) {
      const r = await castRawH(token, body);
      if (r.status === 200 && !r.data.fizzled) return r.data;
      if (r.status !== 200) return null;
    }
    return null;
  };
  const workingRow = (me, id) => db.prepare("SELECT * FROM territory_workings WHERE owner_key = ? AND id = ?").get(me, id);
  const tileRow = (id) => db.prepare("SELECT * FROM territory_tiles WHERE id = ?").get(id);

  const mkHome = async (name) => {
    const h = await claimH(name);
    const tile = seedTileH(h.me);
    const ids = {};
    for (const [q, r, c] of [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0], [0, 1, 0], [1, 1, 0], [2, 1, 0]]) ids[`${q},${r}`] = tile(q, r, c);
    const aw = seedAwakenedH(h.me, `${name} Guard`);
    db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, hp) VALUES (?, ?, ?, ?, ?, 40)").run(h.me, aw, ids["2,0"], Date.now(), Date.now());
    return { ...h, ids };
  };
  const hf = await mkHome("Home Fire");
  const hb = await mkHome("Home Bare");
  setPage(hf.me, "seal", "fire", 3);
  setPool(hf.me, "fire", 30);

  const fSeal = await castUntilStandsH(hf.token, { spellKey: "seal", hue: "stone", tileId: hf.ids["2,0"], dir: 2 });
  const bSeal = await castUntilStandsH(hb.token, { spellKey: "seal", tileId: hb.ids["2,0"], dir: 2 });
  const fRow = workingRow(hf.me, fSeal?.id);
  const bRow = workingRow(hb.me, bSeal?.id);
  check("A SMUGGLED HUE CHANGES NOTHING AT HOME: named 'stone', the Seal stands FIRE with its page's 3 slots",
    fRow?.hue === "fire" && fRow?.pour === 3, `hue=${fRow?.hue} pour=${fRow?.pour}`);
  check("the home fire Seal's health and riposte are exactly the bare control's + 3",
    fRow?.hp === (bRow?.hp ?? -999) + 3 && JSON.parse(fRow?.nums ?? "{}")?.riposte === JSON.parse(bRow?.nums ?? "{}")?.riposte + 3,
    `hp ${bRow?.hp} -> ${fRow?.hp}; riposte ${JSON.parse(bRow?.nums ?? "{}")?.riposte} -> ${JSON.parse(fRow?.nums ?? "{}")?.riposte}`);
  check("the bare control's Seal stands unaligned and plain", bRow?.hue === "unaligned" && bRow?.pour === 0, `hue=${bRow?.hue} pour=${bRow?.pour}`);

  const fRain = await castUntilStandsH(hf.token, { spellKey: "shardrain", tileId: hf.ids["1,1"] });
  const fRainRow = workingRow(hf.me, fRain?.id);
  check("SHARD RAIN AT HOME stands in the derived element holding its band (hue fire, rainLevel 3)",
    fRainRow?.hue === "fire" && JSON.parse(fRainRow?.nums ?? "{}")?.rainLevel === 3,
    `hue=${fRainRow?.hue} nums=${fRainRow?.nums}`);
  const bRain = await castUntilStandsH(hb.token, { spellKey: "shardrain", tileId: hb.ids["1,1"] });
  const bRainRow = workingRow(hb.me, bRain?.id);
  check("SHARD RAIN CONTROL stands unaligned at the base dice (rainLevel 0)",
    bRainRow?.hue === "unaligned" && (JSON.parse(bRainRow?.nums ?? "{}")?.rainLevel ?? 0) === 0,
    `hue=${bRainRow?.hue} nums=${bRainRow?.nums}`);

  // The ground turns: cursed tiles whose curse the two rains
  // can and cannot break — the derived pool (5 dice, least 5)
  // against a curse of 4; the base pool (2 dice, most 12)
  // against a curse of 13.
  const mkCursed = async (h, key, curseHp) => {
    const id = seedTileH(h.me)(3, 1, 1);
    db.prepare("UPDATE territory_tiles SET curse_hp = ?, curse_max_hp = ? WHERE id = ?").run(curseHp, curseHp, id);
    h.ids[key] = id;
  };
  await mkCursed(hf, "cursed", 4);
  await mkCursed(hb, "cursed", 13);
  const fBreak = await castUntilStandsH(hf.token, { spellKey: "shardrain", tileId: hf.ids["cursed"] });
  const fTile = tileRow(hf.ids["cursed"]);
  check("BROKEN GROUND TURNS TO THE CAST'S ELEMENT: the derived fire rain breaks the curse of 4 and the hex stands FIRE",
    fBreak?.purified === true && fTile?.cursed === 0 && fTile?.element === "fire",
    `purified=${fBreak?.purified} cursed=${fTile?.cursed} element=${fTile?.element}`);
  const bBreak = await castUntilStandsH(hb.token, { spellKey: "shardrain", tileId: hb.ids["cursed"] });
  const bTile = tileRow(hb.ids["cursed"]);
  check("CONTROL: the base rain can never break a curse of 13 (2 dice, most 12) — the ground stays cursed",
    bBreak?.purified === false && bTile?.cursed === 1,
    `purified=${bBreak?.purified} cursed=${bTile?.cursed} curse_hp=${bTile?.curse_hp}`);
}

console.log(`\nCAST HUE DERIVATION: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
