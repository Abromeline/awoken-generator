// test62 — ATTUNEMENT LIVES IN THE GRIMOIRE (Nigel,
// 2026-10-20): "remove pour functionality and make the
// grimoire the only way to ATTUNE spells and runes wards."
// This suite once proved the Witch's powering at the cast
// and the push on both grounds; those doors are RETIRED, and
// the suite is re-derived against the law that replaced
// them, as the writ ordered:
//   §0 THE RECKONING — pourLaidFor's grid: a Witch's pour
//      into a spell, rune or ward page lays TWICE what it
//      costs; a Sage's lays +2 beyond what she pays (her
//      mastery, re-homed from the Table's dead push);
//      bindings stand outside both gifts; every other hand
//      lays what it spends. At a spend of 3 the three
//      measures stand apart: common 3, Sage 5, Witch 6.
//   §1 THE GRIMOIRE DOOR — the three hands pour stone into
//      the Seal's page and reach the same Lv I standing at
//      three prices (Witch 5, Sage 8, Warden 10); the pool
//      is debited exactly the spend; a pour beyond the pool
//      is refused whole; a page that takes no attunement
//      (a binding, a harm rune) refuses it; a page at the
//      thirty cap refuses more; getGrimoire serves the
//      ledger to its owner and to no one else.
//   §2 THE TABLE CARRIES THE PAGE — a cast names no pour
//      and spends no pool: the working stands with the
//      page's LEVEL in the cast's element and the health of
//      that measure, against an unattuned control; a pour
//      field smuggled into the cast message changes
//      nothing; the pourWorking message is dead — a neutral
//      rune pushed by it stands unmoved, its pusher's pool
//      untouched.
//   §3 THE HOMELAND CARRIES THE PAGE — the same law through
//      the HTTP door: seal, lattice and shard casts carry
//      their pages' levels; the pourMapWorking action is
//      gone (404); a pour field smuggled into a binding's
//      cast plants the grove bare, pool untouched.
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
// HARNESS NOTE (the migration-order defect, found 2026-10-20
// and carried by the Audit — NOT fixed here): on a FRESH
// database the server's greeter ALTER runs before the
// awakened table is created, so the column never lands, and
// every full awakened select throws — the Table then deals
// an empty deck and seats a Lv 1 Tender whose wards never
// wake. Stand the column up here, as the harness lessons
// record; production's database already carries it.
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }

const G = await import("../server/dist/grimoire.js");
const SEAL = G.spellByKey("seal");
const LATTICE = G.spellByKey("lattice");
const expHp = (def, level, laid) => G.hpForCast(def, level, laid, false);

const poolOf = (ownerKey, el) => db.prepare("SELECT points FROM aspect_attunement WHERE owner_key = ? AND element = ?").get(ownerKey, el)?.points ?? 0;
const setPool = (ownerKey, el, pts) => db.prepare("INSERT INTO aspect_attunement (owner_key, element, points, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(owner_key, element) DO UPDATE SET points = excluded.points").run(ownerKey, el, pts, Date.now());
const pageDepth = (ownerKey, key, el) => db.prepare("SELECT depth FROM grimoire_attunements WHERE owner_key = ? AND spell_key = ? AND element = ?").get(ownerKey, key, el)?.depth ?? 0;
const setPage = (ownerKey, key, el, depth) => db.prepare("INSERT INTO grimoire_attunements (owner_key, spell_key, element, depth, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(owner_key, spell_key, element) DO UPDATE SET depth = excluded.depth").run(ownerKey, key, el, depth, Date.now());

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

/* ── §0 THE RECKONING, READ OFF THE BOOK ITSELF: the whole
      class × kind grid over pourLaidFor — the Witch doubles
      spell, rune and ward kinds; the Sage adds +2 to the
      same kinds; binding stands outside BOTH gifts; no
      other class is bent. */
console.log("\n§0 the reckoning — what a pour into a page lays, by class and kind");
{
  const L = G.pourLaidFor;
  check("the book's kinds stand as the law expects (seal a ward, lattice a rune, springleaf a binding)",
    SEAL?.kind === "ward" && LATTICE?.kind === "rune" && G.spellByKey("springleaf")?.kind === "binding",
    `${SEAL?.kind}/${LATTICE?.kind}/${G.spellByKey("springleaf")?.kind}`);
  check("no kind-\"spell\" page stands in the book yet — the law runs by kind, so the first one inherits it",
    !G.grimoireNow().spells.some(s => s.kind === "spell"),
    G.grimoireNow().spells.filter(s => s.kind === "spell").map(s => s.key).join(","));
  check("WITCH: a pour of 3 lays 6 into spell, rune and ward pages alike",
    L("witch", "spell", 3) === 6 && L("witch", "rune", 3) === 6 && L("witch", "ward", 3) === 6,
    `${L("witch", "spell", 3)}/${L("witch", "rune", 3)}/${L("witch", "ward", 3)}`);
  check("SAGE: a pour of 3 lays 5 into spell, rune and ward pages alike — her mastery, at the book",
    L("sage", "spell", 3) === 5 && L("sage", "rune", 3) === 5 && L("sage", "ward", 3) === 5,
    `${L("sage", "spell", 3)}/${L("sage", "rune", 3)}/${L("sage", "ward", 3)}`);
  check("BINDINGS stand outside both gifts: the Witch's 3 lays 3, the Sage's 3 lays 3",
    L("witch", "binding", 3) === 3 && L("sage", "binding", 3) === 3,
    `${L("witch", "binding", 3)}/${L("sage", "binding", 3)}`);
  check("no other hand is bent: warden, runewright, binder and the classless lay what they spend",
    L("warden", "ward", 3) === 3 && L("runewright", "rune", 3) === 3 && L("binder", "binding", 3) === 3 &&
    L(null, "ward", 3) === 3 && L("witch", "ward", 0) === 0 && L("sage", "ward", 0) === 0);
  check("the level band the casts read: 9 deep is Lv 0, 10 is Lv I, 29 is Lv II, 30 is Lv III",
    G.attunementLevel(9) === 0 && G.attunementLevel(10) === 1 && G.attunementLevel(29) === 2 && G.attunementLevel(30) === 3);
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
/** Cast until the working stands (a fizzle spends the ✦ and
 *  places nothing — cast again, as a player would). */
async function castUntil(c, msg, find, what, tries = 18) {
  for (let i = 0; i < tries; i++) {
    c.send(msg);
    try { await c.waitFor(cc => !!find(cc), what, 3000); return find(c); }
    catch { /* a fizzle — cast again */ }
  }
  throw new Error(`${c.label}: ${what} never stood`);
}

/* ── Homeland harness (test61's shape): the same law read
      through the HTTP door. */
async function claimTender(name, exp = 0) {
  const claim = await call("claimTender", { password: "grimoire-password", tenderName: name });
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
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, 'test/a.png', ?, 'tender', 'Grimoire', ?, ?)").run(name, name, composition, me, nowMs).lastInsertRowid);
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

/* ── §1 THE GRIMOIRE DOOR: three hands pour stone into the
      Seal's page. The standing they reach is the same — ten
      deep, Lv I — at three prices, because the gifts ride
      the pour: the Witch pays 5, the Sage pays 8, the
      Warden pays 10. The refusals stand guard around it. */
console.log("\n§1 the grimoire door — pours into a page, the gifts, the refusals");
{
  const mk = async (name, classKey) => {
    const t = await claimTender(name, 3800);
    await call("chooseClass", { classKey }, t.token);
    setPool(t.me, "stone", 25); setPool(t.me, "root", 25); setPool(t.me, "fire", 3);
    return t;
  };
  const wi = await mk("Book Witch", "witch");
  const sg = await mk("Book Sage", "sage");
  const wd = await mk("Book Warden", "warden");

  const wiPour = await call("attuneGrimoirePage", { spellKey: "seal", element: "stone", points: 5 }, wi.token);
  check("WITCH: pouring 5 stone lays 10 into the Seal's page — Lv I standing",
    wiPour.data?.spent === 5 && wiPour.data?.laid === 10 && wiPour.data?.depth === 10 && wiPour.data?.level === 1 &&
    pageDepth(wi.me, "seal", "stone") === 10, JSON.stringify(wiPour.data));
  check("WITCH: her stone pool paid exactly the 5 she named (25 → 20)", poolOf(wi.me, "stone") === 20, `pool=${poolOf(wi.me, "stone")}`);
  const sgPour = await call("attuneGrimoirePage", { spellKey: "seal", element: "stone", points: 8 }, sg.token);
  check("SAGE: pouring 8 stone lays 10 into the Seal's page — the same Lv I, at her price",
    sgPour.data?.spent === 8 && sgPour.data?.laid === 10 && sgPour.data?.depth === 10 && sgPour.data?.level === 1 &&
    pageDepth(sg.me, "seal", "stone") === 10, JSON.stringify(sgPour.data));
  check("SAGE: her stone pool paid exactly the 8 she named (25 → 17)", poolOf(sg.me, "stone") === 17, `pool=${poolOf(sg.me, "stone")}`);
  const wdPour = await call("attuneGrimoirePage", { spellKey: "seal", element: "stone", points: 10 }, wd.token);
  check("CONTROL: the Warden pouring 10 lays exactly 10 — Lv I at the common price",
    wdPour.data?.spent === 10 && wdPour.data?.laid === 10 && wdPour.data?.depth === 10 && wdPour.data?.level === 1 &&
    pageDepth(wd.me, "seal", "stone") === 10, JSON.stringify(wdPour.data));
  check("CONTROL: the Warden's stone pool paid exactly 10 (25 → 15)", poolOf(wd.me, "stone") === 15, `pool=${poolOf(wd.me, "stone")}`);

  const greedy = await call("attuneGrimoirePage", { spellKey: "shard", element: "fire", points: 5 }, wi.token, true);
  check("REFUSAL: a pour beyond the pool is refused whole (fire holds 3, she named 5)",
    greedy.status === 400 && /pool holds/.test(JSON.stringify(greedy.data)), `status=${greedy.status} ${JSON.stringify(greedy.data)}`);
  check("REFUSAL: the refused pour spent nothing and laid nothing",
    poolOf(wi.me, "fire") === 3 && pageDepth(wi.me, "shard", "fire") === 0, `pool=${poolOf(wi.me, "fire")} depth=${pageDepth(wi.me, "shard", "fire")}`);
  const intoBinding = await call("attuneGrimoirePage", { spellKey: "springleaf", element: "root", points: 2 }, wi.token, true);
  check("REFUSAL: a BINDING page takes no attunement — the exclusion lives at the book's door now",
    intoBinding.status === 400 && /takes no attunement/.test(JSON.stringify(intoBinding.data)), `status=${intoBinding.status} ${JSON.stringify(intoBinding.data)}`);
  const intoBlade = await call("attuneGrimoirePage", { spellKey: "blade", element: "root", points: 2 }, wi.token, true);
  check("REFUSAL: a harm rune whose strength is not bought with points refuses it too",
    intoBlade.status === 400 && /takes no attunement/.test(JSON.stringify(intoBlade.data)), `status=${intoBlade.status} ${JSON.stringify(intoBlade.data)}`);
  check("REFUSAL: both refusals left the Witch's root pool untouched (25)", poolOf(wi.me, "root") === 25, `pool=${poolOf(wi.me, "root")}`);

  setPool(wd.me, "root", 40);
  const deep = await call("attuneGrimoirePage", { spellKey: "lattice", element: "root", points: 30 }, wd.token);
  check("THE CAP: thirty root stands the Lattice's page at Lv III, the deepest band",
    deep.data?.depth === 30 && deep.data?.level === 3 && pageDepth(wd.me, "lattice", "root") === 30, JSON.stringify(deep.data));
  const pastCap = await call("attuneGrimoirePage", { spellKey: "lattice", element: "root", points: 1 }, wd.token, true);
  check("THE CAP: a page at its deepest refuses more — and the refusal spends nothing (40 − 30 = 10 stands)",
    pastCap.status === 400 && /deepest/.test(JSON.stringify(pastCap.data)) && poolOf(wd.me, "root") === 10,
    `status=${pastCap.status} pool=${poolOf(wd.me, "root")}`);

  const mine = await call("getGrimoire", {}, wi.token);
  check("THE LEDGER SERVED: getGrimoire shows the Witch her own page standings (seal · stone 10)",
    mine.data?.pageAttunements?.seal?.stone === 10, JSON.stringify(mine.data?.pageAttunements));
  const anon = await call("getGrimoire", {}, null);
  check("THE LEDGER KEPT: an unbound read of the book carries no one's standings",
    anon.data?.pageAttunements === undefined, JSON.stringify(Object.keys(anon.data ?? {})));
}

/* ── §2 THE TABLE CARRIES THE PAGE: the Witch's Seal page
      stands Lv I in stone, her Lattice Lv II in root; the
      Warden's book is bare. Casts name no pour — the
      workings stand with the pages' measures, the pools
      unmoved — and the two dead roads (a pour field in the
      cast, the pourWorking push) move nothing. */
console.log("\n§2 the table carries the page — casts draw on the book, the old roads are dead");
{
  const wi = await seedBoundTender({ tenderName: "Table Witch", password: "table-wi-62", tag: "62W", classKey: "witch", filler: 120 });
  const wd = await seedBoundTender({ tenderName: "Table Warden", password: "table-wd-62", tag: "62D", classKey: "warden", filler: 40 });
  const rw = await seedBoundTender({ tenderName: "Table Runewright", password: "table-rw-62", tag: "62R", classKey: "runewright", filler: 40 });
  setPool(wi.ownerKey, "stone", 25); setPool(wi.ownerKey, "root", 25);
  setPool(wd.ownerKey, "stone", 25);
  setPage(wi.ownerKey, "seal", "stone", 10);
  setPage(wi.ownerKey, "lattice", "root", 20);
  const room = "table-62-a";
  const cWI = await joinBound(wi.tt, room, "TBL-WI");
  const cWD = await joinBound(wd.tt, room, "TBL-WD");
  const cRW = await joinBound(rw.tt, room, "TBL-RW");
  check("the seats carry their classes", cWI.you.classKey === "witch" && cWD.you.classKey === "warden" && cRW.you.classKey === "runewright",
    `${cWI.you.classKey}/${cWD.you.classKey}/${cRW.you.classKey}`);

  const castSeal = async (c, edgeIdx, extra = {}) => {
    const landing = c.you.landing;
    const hexB = neighbours(landing)[edgeIdx];
    return castUntil(c,
      { type: "castWard", root: "seal", hue: "stone", hexA: landing, hexB, ...extra },
      cc => cc.state.workings.find(w => w.kind === "ward" && w.engine === "seal" && w.hexA === landing && w.hexB === hexB),
      "the seal stands");
  };
  const witchSeal = await castSeal(cWI, 1);
  check("WITCH (Table cast, ward): no pour named — her Seal stands at the page's Lv I",
    witchSeal.pour === 1, `pour=${witchSeal.pour}`);
  check("WITCH (Table cast, ward): the Seal's health is the Lv I measure, exact",
    witchSeal.hp === expHp(SEAL, 10, 1) && witchSeal.maxHp === expHp(SEAL, 10, 1), `hp=${witchSeal.hp} expected ${expHp(SEAL, 10, 1)}`);
  check("WITCH (Table cast, ward): the cast spent NO pool (stone still 25)", poolOf(wi.ownerKey, "stone") === 25, `pool=${poolOf(wi.ownerKey, "stone")}`);
  const witchSeal2 = await castSeal(cWI, 2, { pour: 3 });
  check("THE DEAD FIELD: a pour smuggled into the cast message changes nothing — the second Seal also stands at Lv I",
    witchSeal2.pour === 1 && witchSeal2.hp === expHp(SEAL, 10, 1), `pour=${witchSeal2.pour} hp=${witchSeal2.hp}`);
  check("THE DEAD FIELD: the smuggled pour spent nothing either (stone still 25)", poolOf(wi.ownerKey, "stone") === 25, `pool=${poolOf(wi.ownerKey, "stone")}`);
  const wardenSeal = await castSeal(cWD, 1);
  check("CONTROL (Table cast, ward): the Warden's bare page casts bare — pour 0 at the unpoured health",
    wardenSeal.pour === 0 && wardenSeal.hp === expHp(SEAL, 10, 0), `pour=${wardenSeal.pour} hp=${wardenSeal.hp} expected ${expHp(SEAL, 10, 0)}`);

  const freeHex = cWI.state.map.map(t => t.id).find(id => id !== "0,0" && ![cWI, cWD, cRW].some(x => x.you?.landing === id));
  const witchLat = await castUntil(cWI,
    { type: "castRune", root: "lattice", hue: "root", hexes: [freeHex] },
    cc => cc.state.workings.find(w => w.kind === "rune" && w.engine === "lattice" && w.hex === freeHex),
    "the lattice stands");
  check("WITCH (Table cast, rune): her Lattice stands at its page's Lv II, health exact, no pool spent",
    witchLat.pour === 2 && witchLat.hp === expHp(LATTICE, 10, 2) && poolOf(wi.ownerKey, "root") === 25,
    `pour=${witchLat.pour} hp=${witchLat.hp} expected ${expHp(LATTICE, 10, 2)} pool=${poolOf(wi.ownerKey, "root")}`);

  // THE PUSH IS GONE: a neutral lattice from the Runewright;
  // the Witch pushes it by the old message — nothing moves.
  const neutralHex = cWI.state.map.map(t => t.id).filter(id => id !== "0,0" && id !== freeHex && ![cWI, cWD, cRW].some(x => x.you?.landing === id))[5];
  const neutral = await castUntil(cRW,
    { type: "castRune", root: "lattice", hue: "unaligned", hexes: [neutralHex] },
    cc => cc.state.workings.find(w => w.kind === "rune" && w.hex === neutralHex),
    "the neutral lattice stands");
  check("a neutral lattice stands at pour 0", neutral.pour === 0 && neutral.hue === "unaligned", `pour=${neutral.pour} hue=${neutral.hue}`);
  cWI.send({ type: "pourWorking", workingId: neutral.id, hue: "root", pour: 3 });
  await sleep(1800);
  const unmoved = cWI.state.workings.find(w => w.id === neutral.id);
  check("THE DEAD ROAD: pourWorking moves nothing — the rune stands unaligned at pour 0, the Witch's pool untouched (25)",
    unmoved?.hue === "unaligned" && unmoved?.pour === 0 && poolOf(wi.ownerKey, "root") === 25,
    `hue=${unmoved?.hue} pour=${unmoved?.pour} pool=${poolOf(wi.ownerKey, "root")}`);
  cWI.ws.close(); cWD.ws.close(); cRW.ws.close();
}

/* ── §3 THE HOMELAND CARRIES THE PAGE: the Witch powers
      her pages through the door itself, then casts on home
      ground — seal, lattice and shard all carry their
      pages' Lv I; the Warden's bare book casts bare; the
      old push action is gone from the world. */
console.log("\n§3 the homeland carries the page — and the old push action is gone");
{
  const mkHome = async (name, classKey) => {
    const t = await claimTender(name, 200); // Lv 3
    const ids = sowLand(t.me);
    await call("chooseClass", { classKey }, t.token);
    setEnergy(t.me, 500);
    setPool(t.me, "stone", 25); setPool(t.me, "root", 25); setPool(t.me, "fire", 25);
    const aw = seedAwakened(t.me, `${name} Guard`, 40);
    seedPlacement(t.me, aw, ids["2,0"], 40);
    return { ...t, ids };
  };
  const wi = await mkHome("Home Witch", "witch");
  const wd = await mkHome("Home Warden", "warden");

  await call("attuneGrimoirePage", { spellKey: "seal", element: "stone", points: 5 }, wi.token);
  await call("attuneGrimoirePage", { spellKey: "lattice", element: "root", points: 5 }, wi.token);
  await call("attuneGrimoirePage", { spellKey: "shard", element: "fire", points: 5 }, wi.token);
  check("the Witch's three pages stand Lv I deep, laid by the door itself (5 paid, 10 laid, each)",
    pageDepth(wi.me, "seal", "stone") === 10 && pageDepth(wi.me, "lattice", "root") === 10 && pageDepth(wi.me, "shard", "fire") === 10,
    `${pageDepth(wi.me, "seal", "stone")}/${pageDepth(wi.me, "lattice", "root")}/${pageDepth(wi.me, "shard", "fire")}`);

  const wiSeal = await castUntilStands(wi.token, { spellKey: "seal", hue: "stone", tileId: wi.ids["2,0"], dir: 2 });
  check("WITCH (homeland cast, ward): the Seal carries its page's Lv I — the response speaks it",
    wiSeal?.pour === 1, JSON.stringify(wiSeal));
  check("WITCH (homeland cast, ward): the standing Seal holds Lv I at the Lv I health",
    workingRow(wi.me, wiSeal?.id)?.pour === 1 && workingRow(wi.me, wiSeal?.id)?.hp === expHp(SEAL, 3, 1),
    `row=${JSON.stringify(workingRow(wi.me, wiSeal?.id))} expected hp ${expHp(SEAL, 3, 1)}`);
  check("WITCH (homeland cast, ward): the cast spent no pool (stone 25 → 20 was the door's price alone)",
    poolOf(wi.me, "stone") === 20, `pool=${poolOf(wi.me, "stone")}`);
  const wiSeal2 = await castUntilStands(wi.token, { spellKey: "seal", hue: "stone", tileId: wi.ids["1,0"], dir: 2, pour: 5 });
  check("THE DEAD FIELD: a pour smuggled into the homeland cast changes nothing — Lv I again, pool unmoved",
    wiSeal2?.pour === 1 && poolOf(wi.me, "stone") === 20, `res=${JSON.stringify(wiSeal2)} pool=${poolOf(wi.me, "stone")}`);
  const wdSeal = await castUntilStands(wd.token, { spellKey: "seal", hue: "stone", tileId: wd.ids["2,0"], dir: 2 });
  check("CONTROL (homeland cast, ward): the Warden's bare page casts bare — pour 0 at the unpoured health",
    wdSeal?.pour === 0 && workingRow(wd.me, wdSeal?.id)?.hp === expHp(SEAL, 3, 0), `res=${JSON.stringify(wdSeal)}`);

  const wiLat = await castUntilStands(wi.token, { spellKey: "lattice", hue: "root", tileId: wi.ids["1,1"] });
  check("WITCH (homeland cast, rune): the Lattice carries its page's Lv I, health exact",
    wiLat?.pour === 1 && wiLat?.hp === expHp(LATTICE, 3, 1) && workingRow(wi.me, wiLat?.id)?.pour === 1,
    `res=${JSON.stringify(wiLat)}`);
  const wiShard = await castUntilStands(wi.token, { spellKey: "shard", hue: "fire", tileId: wi.ids["2,1"] });
  check("WITCH (homeland cast, rune): the Crown Shard stands holding its page's Lv I — the measure its spring will read",
    wiShard?.pour === 1 && workingRow(wi.me, wiShard?.id)?.pour === 1, `res=${JSON.stringify(wiShard)}`);

  const gone = await call("pourMapWorking", { id: wiLat.id, hue: "root", pour: 2 }, wi.token, true);
  check("THE DEAD ROAD: pourMapWorking is gone from the world (404) — the standing rune is untouched",
    gone.status === 404 && workingRow(wi.me, wiLat.id)?.pour === 1, `status=${gone.status}`);

  const grove = await castUntilStands(wi.token, { spellKey: "springleaf", hue: "root", tileId: wi.ids["3,0"], pour: 2 });
  check("THE BINDING STANDS BARE: a pour smuggled into the Springleaf's cast plants the grove at pour 0, pool untouched",
    !!grove && workingRow(wi.me, grove.id)?.pour === 0 && poolOf(wi.me, "root") === 20,
    `res=${JSON.stringify(grove)} pool=${poolOf(wi.me, "root")}`);
}

console.log(`\nGRIMOIRE ATTUNEMENT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
