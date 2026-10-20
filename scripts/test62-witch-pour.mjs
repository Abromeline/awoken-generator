// test62 — THE WITCH'S POWERING (Nigel, 2026-10-20): "add a
// +2 spell attunement to spells for the witch — her spells
// and runes and wards can be powered at 2x the rate of other
// characters. Same cost, 2x effect." When a WITCH pours
// attunement into a working of kind SPELL, RUNE or WARD, the
// pour LAYS twice what it costs; every other class lays what
// it spends. BINDINGS stand outside the gift — the exclusion
// is deliberate (he named spells, runes, wards) and proven,
// not assumed. The rate is reckoned ONCE, in the book's
// pourLaidFor (grimoire.ts), and every pour door on both
// grounds calls it: the Table's cast and push, the homeland's
// cast and push. It is NOT the Sage's mastery — hers is a
// depth fiction at the Table's push (lays amount + 2); the
// two are proven apart in §3, at the same spend of 3: the
// common hand lays 3, the Sage lays 5, the Witch lays 6.
// The book holds no kind-"spell" page yet — the law runs by
// KIND, so the first spell page inherits it (§0 reads the
// grid straight off the reckoning itself).
import WebSocket from "ws";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

const DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-test62-"));
process.env.DATA_DIR = DATA_DIR;
process.env.PORT = "39962";
process.env.WORKSHOP_PASSWORD = "test62-word";
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
const base = "http://127.0.0.1:39962";
const db = new Database(join(DATA_DIR, "app.db"));

const G = await import("../server/dist/grimoire.js");
const SEAL = G.spellByKey("seal");
const LATTICE = G.spellByKey("lattice");
const expHp = (def, level, laid) => G.hpForCast(def, level, laid, false);
const perPoint = (def) => def.numbers.hpPerPoint ?? 0;

const poolOf = (ownerKey, el) => db.prepare("SELECT points FROM aspect_attunement WHERE owner_key = ? AND element = ?").get(ownerKey, el)?.points ?? 0;
const setPool = (ownerKey, el, pts) => db.prepare("INSERT INTO aspect_attunement (owner_key, element, points, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(owner_key, element) DO UPDATE SET points = excluded.points").run(ownerKey, el, pts, Date.now());

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

/* ── §0 THE RATE, READ OFF THE RECKONING ITSELF: the whole
      class × kind grid over pourLaidFor — the Witch doubles
      spell, rune and ward kinds; binding is NOT doubled;
      no other class is bent, the Sage included (her fiction
      lives elsewhere and is not a rate). */
console.log("\n§0 the witch's rate, read off pourLaidFor itself");
{
  const L = G.pourLaidFor;
  check("the book's kinds stand as the law expects (seal a ward, lattice a rune, springleaf a binding)",
    SEAL?.kind === "ward" && LATTICE?.kind === "rune" && G.spellByKey("springleaf")?.kind === "binding",
    `${SEAL?.kind}/${LATTICE?.kind}/${G.spellByKey("springleaf")?.kind}`);
  check("no kind-\"spell\" page stands in the book yet — the law runs by kind, so the first one inherits it",
    !G.grimoireNow().spells.some(s => s.kind === "spell"),
    G.grimoireNow().spells.filter(s => s.kind === "spell").map(s => s.key).join(","));
  check("WITCH: a pour of 3 lays 6 into spell, rune and ward kinds alike",
    L("witch", "spell", 3) === 6 && L("witch", "rune", 3) === 6 && L("witch", "ward", 3) === 6,
    `${L("witch", "spell", 3)}/${L("witch", "rune", 3)}/${L("witch", "ward", 3)}`);
  check("WITCH: a BINDING pour is NOT doubled — the exclusion is in the reckoning, not in the doors",
    L("witch", "binding", 3) === 3, `${L("witch", "binding", 3)}`);
  check("no other hand is bent: warden, runewright, binder, sage and the classless lay what they spend",
    L("warden", "ward", 3) === 3 && L("runewright", "rune", 3) === 3 && L("binder", "binding", 3) === 3 &&
    L("sage", "rune", 3) === 3 && L(null, "ward", 3) === 3 && L("witch", "ward", 0) === 0);
}

/* ── Table harness (test56's shape): a bound Tender at
      Lv 10 with a chosen class; filler Awokin are the
      max-energy law's refill. */
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const neighbours = (id) => { const [q, r] = id.split(",").map(Number); return DIRS.map(([dq, dr]) => `${q + dq},${r + dr}`); };
const meIn = (c) => c.state.players.find(p => p.key === c.you.key);
function client(label) {
  const ws = new WebSocket("ws://127.0.0.1:39962/table/ws");
  const c = { label, ws, state: null, you: null, errors: [], allStrikes: [], strikeIds: new Set() };
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
async function seedBoundTender({ tenderName, password, tag, classKey, filler = 0 }) {
  const claim = await call("claimTender", { password, tenderName });
  const token = claim.data.token;
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.data.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, Date.now());
  const now = Date.now();
  const insAsset = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
  const insAwokin = db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)");
  const addAwokin = (name, element, power, toughness) => {
    const bodyId = Number(insAsset.run(`Body ${name}`, "body", power, toughness, element, `test/body-${name}.png`, now).lastInsertRowid);
    const composition = JSON.stringify([{ source_id: `db:${bodyId}`, name: `Body ${name}`, category: "body", rarity: "common", power, toughness, element }]);
    insAwokin.run(name, name, `test/awokin-${name}.png`, composition, tenderName, ownerKey, now);
  };
  for (let i = 0; i < filler; i++) addAwokin(`Filler ${tag}-${i}`, "sky", 2, 2);
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
  await c.waitFor(cc => !!meIn(cc)?.pos, "the tender stands in pixel space");
  return c;
}
/** Cast until the working stands (a fizzle spends the ⚡ and
 *  places nothing — cast again, as a player would). */
async function castUntil(c, msg, find, what, tries = 18) {
  for (let i = 0; i < tries; i++) {
    c.send(msg);
    try { await c.waitFor(cc => !!find(cc), what, 3000); return find(c); }
    catch { /* a fizzle — cast again */ }
  }
  throw new Error(`${c.label}: ${what} never stood`);
}

/* ── §1 THE TABLE, AT THE CAST: the same Seal poured 2 by a
      Witch and by a Warden — hers stands at pour 4 with the
      health of 4 laid, his at pour 2 with the health of 2,
      and both pools paid exactly 2. The same Lattice poured
      2 by the Witch and by a Runewright, the same reading.
      §3 (the exclusion at this ground) rides first, while
      the Witch's pools stand pristine. */
console.log("\n§1 the table, at the cast — ward and rune, witch against controls");
{
  const wi = await seedBoundTender({ tenderName: "Pour Witch", password: "pour-wi-62", tag: "62W", classKey: "witch", filler: 120 });
  const wd = await seedBoundTender({ tenderName: "Pour Warden C", password: "pour-wd-62", tag: "62D", classKey: "warden", filler: 40 });
  const rw = await seedBoundTender({ tenderName: "Pour Runewright C", password: "pour-rw-62", tag: "62R", classKey: "runewright", filler: 40 });
  setPool(wi.ownerKey, "stone", 25); setPool(wi.ownerKey, "root", 25);
  setPool(wd.ownerKey, "stone", 25);
  setPool(rw.ownerKey, "root", 25);
  const room = "table-62-a";
  const cWI = await joinBound(wi.tt, room, "POUR-WI");
  const cWD = await joinBound(wd.tt, room, "POUR-WD");
  const cRW = await joinBound(rw.tt, room, "POUR-RW");
  check("the seats carry their classes", cWI.you.classKey === "witch" && cWD.you.classKey === "warden" && cRW.you.classKey === "runewright",
    `${cWI.you.classKey}/${cWD.you.classKey}/${cRW.you.classKey}`);

  // THE EXCLUSION AT THE TABLE: the Witch names a pour into
  // the Springleaf — a binding. The door refuses before any
  // charge: no grove stands, no pool is debited.
  const wiLanding = cWI.you.landing;
  const wiEdge = neighbours(wiLanding)[0];
  cWI.errors.length = 0;
  cWI.send({ type: "castWard", root: "springleaf", hue: "root", hexA: wiLanding, hexB: wiEdge, pour: 2 });
  await sleep(1800);
  check("EXCLUSION (Table): a pour named into a BINDING is refused — 'takes no pour'",
    cWI.errors.some(e => /takes no pour/.test(e)), JSON.stringify(cWI.errors));
  check("EXCLUSION (Table): no grove stands from the refused cast, and the Witch's root pool is untouched (25)",
    !cWI.state.workings.some(w => w.engine === "springleaf" && w.ownerKey === cWI.you.key) && poolOf(wi.ownerKey, "root") === 25,
    `groves=${cWI.state.workings.filter(w => w.engine === "springleaf").length} pool=${poolOf(wi.ownerKey, "root")}`);

  // THE SEAL — ward kind, poured 2 stone by each hand.
  const castSeal = async (c, ownerKey) => {
    const landing = c.you.landing;
    const hexB = neighbours(landing)[1];
    return castUntil(c,
      { type: "castWard", root: "seal", hue: "stone", hexA: landing, hexB, pour: 2 },
      cc => cc.state.workings.find(w => w.kind === "ward" && w.engine === "seal" && w.hexA === landing && w.hexB === hexB),
      "the seal stands");
  };
  const witchSeal = await castSeal(cWI, wi.ownerKey);
  check("WITCH (Table cast, ward): pouring 2 lays 4 into the Seal", witchSeal.pour === 4, `pour=${witchSeal.pour}`);
  check("WITCH (Table cast, ward): the Seal's health is the 4-laid measure, exact",
    witchSeal.hp === expHp(SEAL, 10, 4) && witchSeal.maxHp === expHp(SEAL, 10, 4), `hp=${witchSeal.hp} expected ${expHp(SEAL, 10, 4)}`);
  check("WITCH (Table cast, ward): her pool paid only the 2 she named (25 → 23)", poolOf(wi.ownerKey, "stone") === 23, `pool=${poolOf(wi.ownerKey, "stone")}`);
  const wardenSeal = await castSeal(cWD, wd.ownerKey);
  check("CONTROL (Table cast, ward): the Warden pouring 2 lays exactly 2, at the shipped health",
    wardenSeal.pour === 2 && wardenSeal.hp === expHp(SEAL, 10, 2), `pour=${wardenSeal.pour} hp=${wardenSeal.hp} expected ${expHp(SEAL, 10, 2)}`);
  check("CONTROL (Table cast, ward): the Warden's pool paid exactly 2 (25 → 23)", poolOf(wd.ownerKey, "stone") === 23, `pool=${poolOf(wd.ownerKey, "stone")}`);
  check("THE DOUBLING, EXACT: the Witch's pour-fed health (over the unpoured base) is twice the control's",
    (witchSeal.hp - expHp(SEAL, 10, 0)) === 2 * (wardenSeal.hp - expHp(SEAL, 10, 0)),
    `witch fed ${witchSeal.hp - expHp(SEAL, 10, 0)}, control fed ${wardenSeal.hp - expHp(SEAL, 10, 0)}`);

  // THE LATTICE — rune kind, poured 2 root by each hand.
  const freeHex = (c, used) => c.state.map.map(t => t.id).find(id => id !== "0,0" && !used.includes(id) && ![cWI, cWD, cRW].some(x => x.you?.landing === id));
  const used = [];
  const castLattice = async (c, hex) => castUntil(c,
    { type: "castRune", root: "lattice", hue: "root", hexes: [hex], pour: 2 },
    cc => cc.state.workings.find(w => w.kind === "rune" && w.engine === "lattice" && w.hex === hex),
    "the lattice stands");
  const wiHex = freeHex(cWI, used); used.push(wiHex);
  const witchLat = await castLattice(cWI, wiHex);
  check("WITCH (Table cast, rune): pouring 2 lays 4 into the Lattice", witchLat.pour === 4, `pour=${witchLat.pour}`);
  check("WITCH (Table cast, rune): the Lattice's health is the 4-laid measure, exact",
    witchLat.hp === expHp(LATTICE, 10, 4), `hp=${witchLat.hp} expected ${expHp(LATTICE, 10, 4)}`);
  check("WITCH (Table cast, rune): her root pool paid only 2 (25 → 23)", poolOf(wi.ownerKey, "root") === 23, `pool=${poolOf(wi.ownerKey, "root")}`);
  const rwHex = freeHex(cRW, used); used.push(rwHex);
  const rwLat = await castLattice(cRW, rwHex);
  check("CONTROL (Table cast, rune): the Runewright pouring 2 lays exactly 2, at the shipped health",
    rwLat.pour === 2 && rwLat.hp === expHp(LATTICE, 10, 2), `pour=${rwLat.pour} hp=${rwLat.hp} expected ${expHp(LATTICE, 10, 2)}`);
  check("CONTROL (Table cast, rune): the Runewright's pool paid exactly 2 (25 → 23)", poolOf(rw.ownerKey, "root") === 23, `pool=${poolOf(rw.ownerKey, "root")}`);
  cWI.ws.close(); cWD.ws.close(); cRW.ws.close();
}

/* ── §2 THE ANTI-TANGLE AT THE CAST: the Sage's mastery is
      a push fiction — at the CAST she lays what she spends,
      like everyone else. Her cast-time pour of 2 stands at
      pour 2, not 4: the Witch's rate did not leak onto her,
      and her own fiction did not leak onto the cast. */
console.log("\n§2 the anti-tangle — the sage at the cast lays what she spends");
{
  const sg = await seedBoundTender({ tenderName: "Pour Sage C", password: "pour-sg-62", tag: "62S", classKey: "sage", filler: 40 });
  setPool(sg.ownerKey, "stone", 25);
  const cSG = await joinBound(sg.tt, "table-62-b", "POUR-SG");
  const landing = cSG.you.landing;
  const hexB = neighbours(landing)[1];
  const seal = await castUntil(cSG,
    { type: "castWard", root: "seal", hue: "stone", hexA: landing, hexB, pour: 2 },
    cc => cc.state.workings.find(w => w.kind === "ward" && w.engine === "seal" && w.hexA === landing && w.hexB === hexB),
    "the sage's seal stands");
  check("SAGE (Table cast): pouring 2 lays exactly 2 — no rate, no fiction, at the cast",
    seal.pour === 2 && seal.hp === expHp(SEAL, 10, 2), `pour=${seal.pour} hp=${seal.hp}`);
  check("SAGE (Table cast): her pool paid exactly 2 (25 → 23)", poolOf(sg.ownerKey, "stone") === 23, `pool=${poolOf(sg.ownerKey, "stone")}`);
  cSG.ws.close();
}

/* ── §3 THE TABLE, AT THE PUSH (pourWorking): three neutral
      lattices, three hands, ONE spend of 3 root each — the
      common hand lays 3, the Sage lays 5 (her depth fiction,
      unchanged), the Witch lays 6 (her rate). The three
      numbers side by side are the proof the two bendings
      were never tangled. */
console.log("\n§3 the table, at the push — one spend of 3, three laid measures");
{
  const rw = await seedBoundTender({ tenderName: "Push Runewright", password: "push-rw-62", tag: "62PR", classKey: "runewright", filler: 20 });
  const wi = await seedBoundTender({ tenderName: "Push Witch", password: "push-wi-62", tag: "62PW", classKey: "witch", filler: 20 });
  const wd = await seedBoundTender({ tenderName: "Push Warden", password: "push-wd-62", tag: "62PD", classKey: "warden", filler: 20 });
  const sg = await seedBoundTender({ tenderName: "Push Sage", password: "push-sg-62", tag: "62PS", classKey: "sage", filler: 20 });
  for (const k of [wi.ownerKey, wd.ownerKey, sg.ownerKey]) setPool(k, "root", 40);
  const room = "table-62-c";
  const cRW = await joinBound(rw.tt, room, "PUSH-RW");
  const cWI = await joinBound(wi.tt, room, "PUSH-WI");
  const cWD = await joinBound(wd.tt, room, "PUSH-WD");
  const cSG = await joinBound(sg.tt, room, "PUSH-SG");
  const hexes = cRW.state.map.map(t => t.id).filter(id => id !== "0,0" && ![cRW, cWI, cWD, cSG].some(x => x.you?.landing === id));
  const castNeutral = async (hex) => castUntil(cRW,
    { type: "castRune", root: "lattice", hue: "unaligned", hexes: [hex], pour: 0 },
    cc => cc.state.workings.find(w => w.kind === "rune" && w.hex === hex),
    "the neutral lattice stands");
  const r1 = await castNeutral(hexes[10]);
  const r2 = await castNeutral(hexes[20]);
  const r3 = await castNeutral(hexes[30]);
  check("three neutral lattices stand at pour 0", r1.pour === 0 && r2.pour === 0 && r3.pour === 0, `${r1.pour}/${r2.pour}/${r3.pour}`);
  const push = async (c, rune) => {
    c.send({ type: "pourWorking", workingId: rune.id, hue: "root", pour: 3 });
    await c.waitFor(cc => cc.state.workings.find(w => w.id === rune.id)?.hue === "root", "the push lands", 8000);
    return c.state.workings.find(w => w.id === rune.id);
  };
  const aWI = await push(cWI, r1);
  check("WITCH (Table push): spending 3 lays 6 into the working", aWI.pour === 6, `pour=${aWI.pour}`);
  check("WITCH (Table push): the working's health gains the 6-laid measure (+6 × hpPerPoint)",
    aWI.hp === r1.hp + perPoint(LATTICE) * 6 && aWI.maxHp === r1.maxHp + perPoint(LATTICE) * 6, `hp ${r1.hp} → ${aWI.hp}`);
  check("WITCH (Table push): her pool pays only the 3 she named (40 → 37)", poolOf(wi.ownerKey, "root") === 37, `pool=${poolOf(wi.ownerKey, "root")}`);
  const aWD = await push(cWD, r2);
  check("CONTROL (Table push): the Warden spending 3 lays exactly 3, health +3 × hpPerPoint",
    aWD.pour === 3 && aWD.hp === r2.hp + perPoint(LATTICE) * 3, `pour=${aWD.pour} hp ${r2.hp} → ${aWD.hp}`);
  check("CONTROL (Table push): the Warden's pool pays exactly 3 (40 → 37)", poolOf(wd.ownerKey, "root") === 37, `pool=${poolOf(wd.ownerKey, "root")}`);
  const aSG = await push(cSG, r3);
  check("SAGE (Table push, unchanged): spending 3 lays 5 — her depth fiction, neither 3 nor the Witch's 6",
    aSG.pour === 5 && aSG.hp === r3.hp + perPoint(LATTICE) * 5, `pour=${aSG.pour} hp ${r3.hp} → ${aSG.hp}`);
  check("SAGE (Table push, unchanged): her pool pays exactly 3 (40 → 37)", poolOf(sg.ownerKey, "root") === 37, `pool=${poolOf(sg.ownerKey, "root")}`);
  cRW.ws.close(); cWI.ws.close(); cWD.ws.close(); cSG.ws.close();
}

/* ── Homeland harness (test61's shape): the same law read
      through the HTTP door. */
async function claimTender(name, exp = 0) {
  const claim = await call("claimTender", { password: "witch-pour-password", tenderName: name });
  const token = claim.data.token;
  const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.data.tender.code).id}`;
  if (exp) db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(me, exp, Date.now());
  return { token, me };
}
const seedTile = (me) => (q, r, cursed) => Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, ?, ?, ?, ?)").run(me, q, r, cursed, Date.now()).lastInsertRowid);
const seedAwakened = (me, name, toughness) => {
  const nowMs = Date.now();
  const pieceId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'body', 'common', 1, ?, 'root', 'test/p.png', 'image/png', ?)").run(name, toughness, nowMs).lastInsertRowid);
  const composition = JSON.stringify([{ source_id: `db:${pieceId}`, name, category: "body", rarity: "common", power: 1, toughness, element: "root" }]);
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, 'test/a.png', ?, 'tender', 'Witch Pour', ?, ?)").run(name, name, composition, me, nowMs).lastInsertRowid);
};
const seedPlacement = (me, awakenedId, tileId, hp) => Number(db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, hp) VALUES (?, ?, ?, ?, ?, ?)").run(me, awakenedId, tileId, Date.now(), Date.now(), hp).lastInsertRowid);
const castRaw = async (token, body) => call("castMapWorking", body, token, true);
const castUntilStands = async (token, body, tries = 20) => {
  for (let i = 0; i < tries; i++) {
    const r = await castRaw(token, body);
    if (r.status === 200 && !r.data.fizzled) return r.data;
    if (r.status !== 200) return null;
  }
  return null;
};
const energyOf = (me) => db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(me)?.energy ?? null;
const setEnergy = (me, n) => db.prepare("INSERT INTO tender_resources (owner_key, energy, terrain_bank, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = excluded.energy").run(me, n, Date.now());
const workingRow = (me, id) => db.prepare("SELECT * FROM territory_workings WHERE owner_key = ? AND id = ?").get(me, id);
const sowLand = (me) => {
  const tile = seedTile(me);
  const ids = {};
  for (const [q, r] of [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1]]) ids[`${q},${r}`] = tile(q, r, 0);
  return ids;
};

/* ── §4 THE HOMELAND, AT THE CAST: the same Seal and the
      same Lattice poured 2 on home ground — the Witch's
      workings stand at pour 4 with the 4-laid health, the
      Warden's at pour 2 with the 2-laid health, and both
      purses of attunement paid exactly 2. */
console.log("\n§4 the homeland, at the cast — ward and rune, witch against control");
{
  const mkHome = async (name, classKey) => {
    const t = await claimTender(name, 200); // Lv 3
    const ids = sowLand(t.me);
    await call("chooseClass", { classKey }, t.token);
    setEnergy(t.me, 500);
    setPool(t.me, "stone", 25); setPool(t.me, "root", 25);
    const aw = seedAwakened(t.me, `${name} Guard`, 40);
    seedPlacement(t.me, aw, ids["2,0"], 40);
    return { ...t, ids };
  };
  const wi = await mkHome("Home Witch", "witch");
  const wd = await mkHome("Home Warden", "warden");

  const wiSeal = await castUntilStands(wi.token, { spellKey: "seal", hue: "stone", tileId: wi.ids["2,0"], dir: 2, pour: 2 });
  check("WITCH (homeland cast, ward): pouring 2 lays 4 — the response speaks it", wiSeal?.pour === 4, JSON.stringify(wiSeal));
  check("WITCH (homeland cast, ward): the standing Seal holds pour 4 at the 4-laid health",
    workingRow(wi.me, wiSeal?.id)?.pour === 4 && workingRow(wi.me, wiSeal?.id)?.hp === expHp(SEAL, 3, 4),
    `row=${JSON.stringify(workingRow(wi.me, wiSeal?.id))} expected hp ${expHp(SEAL, 3, 4)}`);
  check("WITCH (homeland cast, ward): her stone pool paid only 2 (25 → 23)", poolOf(wi.me, "stone") === 23, `pool=${poolOf(wi.me, "stone")}`);
  const wdSeal = await castUntilStands(wd.token, { spellKey: "seal", hue: "stone", tileId: wd.ids["2,0"], dir: 2, pour: 2 });
  check("CONTROL (homeland cast, ward): the Warden pouring 2 lays exactly 2, at the shipped health",
    wdSeal?.pour === 2 && workingRow(wd.me, wdSeal?.id)?.hp === expHp(SEAL, 3, 2), `res=${JSON.stringify(wdSeal)}`);
  check("CONTROL (homeland cast, ward): the Warden's stone pool paid exactly 2 (25 → 23)", poolOf(wd.me, "stone") === 23, `pool=${poolOf(wd.me, "stone")}`);

  const wiLat = await castUntilStands(wi.token, { spellKey: "lattice", hue: "root", tileId: wi.ids["1,1"], pour: 2 });
  check("WITCH (homeland cast, rune): pouring 2 lays 4 into the Lattice, at the 4-laid health",
    wiLat?.pour === 4 && wiLat?.hp === expHp(LATTICE, 3, 4) && workingRow(wi.me, wiLat?.id)?.pour === 4,
    `res=${JSON.stringify(wiLat)}`);
  check("WITCH (homeland cast, rune): her root pool paid only 2 (25 → 23)", poolOf(wi.me, "root") === 23, `pool=${poolOf(wi.me, "root")}`);
  const wdLat = await castUntilStands(wd.token, { spellKey: "lattice", hue: "root", tileId: wd.ids["1,1"], pour: 2 });
  check("CONTROL (homeland cast, rune): the Warden pouring 2 lays exactly 2, at the shipped health",
    wdLat?.pour === 2 && wdLat?.hp === expHp(LATTICE, 3, 2), `res=${JSON.stringify(wdLat)}`);
  check("CONTROL (homeland cast, rune): the Warden's root pool paid exactly 2 (25 → 23)", poolOf(wd.me, "root") === 23, `pool=${poolOf(wd.me, "root")}`);

  /* ── §5 THE HOMELAND, AT THE PUSH (pourMapWorking) — and
        the exclusion on home ground, riding the same maps. */
  console.log("\n§5 the homeland, at the push — and the binding exclusion at home");
  const wiNeutral = await castUntilStands(wi.token, { spellKey: "lattice", hue: "unaligned", tileId: wi.ids["2,1"] });
  const wdNeutral = await castUntilStands(wd.token, { spellKey: "lattice", hue: "unaligned", tileId: wd.ids["2,1"] });
  check("two neutral lattices stand at home at pour 0",
    workingRow(wi.me, wiNeutral?.id)?.pour === 0 && workingRow(wd.me, wdNeutral?.id)?.pour === 0,
    `wi=${JSON.stringify(wiNeutral)} wd=${JSON.stringify(wdNeutral)}`);
  const wiHp0 = workingRow(wi.me, wiNeutral?.id)?.hp ?? -1;
  const wdHp0 = workingRow(wd.me, wdNeutral?.id)?.hp ?? -1;
  const wiPush = await call("pourMapWorking", { id: wiNeutral.id, hue: "root", pour: 2 }, wi.token);
  check("WITCH (homeland push): spending 2 lays 4 into the rune",
    wiPush.data?.pour === 4 && workingRow(wi.me, wiNeutral.id)?.pour === 4, JSON.stringify(wiPush.data));
  check("WITCH (homeland push): the rune's health gains the 4-laid measure (+4 × hpPerPoint)",
    wiPush.data?.hp === wiHp0 + perPoint(LATTICE) * 4, `hp ${wiHp0} → ${wiPush.data?.hp}`);
  check("WITCH (homeland push): her root pool paid only 2 more (23 → 21)", poolOf(wi.me, "root") === 21, `pool=${poolOf(wi.me, "root")}`);
  const wdPush = await call("pourMapWorking", { id: wdNeutral.id, hue: "root", pour: 2 }, wd.token);
  check("CONTROL (homeland push): the Warden spending 2 lays exactly 2, health +2 × hpPerPoint",
    wdPush.data?.pour === 2 && wdPush.data?.hp === wdHp0 + perPoint(LATTICE) * 2, JSON.stringify(wdPush.data));
  check("CONTROL (homeland push): the Warden's root pool paid exactly 2 (23 → 21)", poolOf(wd.me, "root") === 21, `pool=${poolOf(wd.me, "root")}`);

  // THE EXCLUSION AT HOME: a pour named into the Springleaf
  // is refused before any charge — energy and pool unmoved,
  // no grove planted.
  const eBefore = energyOf(wi.me);
  const rSpr = await castRaw(wi.token, { spellKey: "springleaf", hue: "root", tileId: wi.ids["1,0"], pour: 2 });
  check("EXCLUSION (homeland): a pour named into a BINDING is refused (400, 'takes no pour')",
    rSpr.status === 400 && /takes no pour/.test(JSON.stringify(rSpr.data)), `status=${rSpr.status} ${JSON.stringify(rSpr.data)}`);
  check("EXCLUSION (homeland): the refusal cost nothing and planted nothing",
    energyOf(wi.me) === eBefore && poolOf(wi.me, "root") === 21 &&
    !db.prepare("SELECT id FROM territory_workings WHERE owner_key = ? AND engine = 'springleaf'").get(wi.me),
    `energy ${eBefore} → ${energyOf(wi.me)} pool=${poolOf(wi.me, "root")}`);
}

console.log(`\nWITCH'S POWERING: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
