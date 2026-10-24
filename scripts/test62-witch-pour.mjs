// test62 — ATTUNEMENT LIVES IN THE GRIMOIRE, IN SLOTS
// (Nigel, 2026-10-20: "remove pour functionality and make
// the grimoire the only way to ATTUNE spells and runes
// wards"; 2026-10-21: "cast should carry a grimoires spell
// lvl and attunement"; "each spell had 8 elemental slots
// that can be filled each grnting +1+1 ememental bonous";
// "attuneing spells costs 4 point per lvl"). The suite once
// proved the depth model (points poured into a page, its
// level band feeding casts); that model stood one unshipped
// night and the slots replaced it, so the suite is
// re-derived against the law that stands now:
//   §0 THE BOOK'S OWN MEASURES — the flat slot law read off
//      hpForCast (each carried slot is +1 health, exactly;
//      the Shard's page buys its slots into harm, for it
//      holds no health), the eight and the four standing in
//      the book, and the gifts' reckoning (pourLaidFor,
//      Recovery R9, Nigel's Binder ruling of 2026-10-22):
//      the book's door READS it — a slot spend lays the
//      reckoning's count of slots (Witch 2, Sage 3, Binder
//      3, every other hand 1) for the same flat 4 points,
//      and the Attune acts read it too (no page kind: only
//      the Binder's kind-unrestricted gift bends there).
//   §1 THE GRIMOIRE DOOR — filling a slot costs exactly 4
//      of that element from the pool, for every hand alike;
//      what the spend LAYS bends by the gifts (above); a page holds a mix
//      across its eight; the ninth slot is refused whole;
//      a pool that cannot pay the 4 is refused whole; a
//      page that takes no attunement refuses a slot; the
//      retired points-argument buys nothing; getGrimoire
//      serves the ledger to its owner and to no one else.
//   §2 THE TABLE CARRIES THE PAGE — a cast names no pour
//      and spends no pool: the working stands with the
//      filled slots of the CAST'S element (+1 health each;
//      the Seal's riposte — its power — +1 each) against a
//      bare control and an other-element control; a pour
//      field smuggled into the cast changes nothing; the
//      pourWorking message is dead.
//   §3 THE HOMELAND CARRIES THE PAGE — the same law through
//      the HTTP door: seal, lattice and shard casts carry
//      their pages' slots; the pourMapWorking action is
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
const SHARD = G.spellByKey("shard");
const expHp = (def, level, slots) => G.hpForCast(def, level, slots, false);

const poolOf = (ownerKey, el) => db.prepare("SELECT points FROM aspect_attunement WHERE owner_key = ? AND element = ?").get(ownerKey, el)?.points ?? 0;
const setPool = (ownerKey, el, pts) => db.prepare("INSERT INTO aspect_attunement (owner_key, element, points, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(owner_key, element) DO UPDATE SET points = excluded.points").run(ownerKey, el, pts, Date.now());
const pageSlots = (ownerKey, key, el) => db.prepare("SELECT slots FROM grimoire_attunements WHERE owner_key = ? AND spell_key = ? AND element = ?").get(ownerKey, key, el)?.slots ?? 0;
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

/* ── §0 THE BOOK'S OWN MEASURES: the flat law (+1 per slot,
      exactly), the eight and the four, and the gifts'
      reckoning — pourLaidFor reads as it always did, and
      (Recovery R9) the book's door and the Attune acts now
      call it: the Witch ×2 and the Sage +2 on spell, rune
      and ward pages, the Binder ×3 on every attune spend
      (no kind named in her ruling). */
console.log("\n§0 the book's measures — the flat slot law, the gifts' reckoning");
{
  const L = G.pourLaidFor;
  check("the pages that take attunement stand as ruled (seal, trees, lattice, shard)",
    JSON.stringify(G.POUR_ENGINES) === JSON.stringify(["seal", "trees", "lattice", "shard"]), G.POUR_ENGINES.join(","));
  check("the book holds the eight and the four (PAGE_SLOTS 8, SLOT_COST 4)",
    G.PAGE_SLOTS === 8 && G.SLOT_COST === 4, `${G.PAGE_SLOTS}/${G.SLOT_COST}`);
  check("FLAT +1: two carried slots raise a holding working's health by exactly 2 — seal, trees, lattice alike",
    G.hpForCast(SEAL, 10, 2, false) - G.hpForCast(SEAL, 10, 0, false) === 2 &&
    G.hpForCast(G.spellByKey("trees"), 10, 2, false) - G.hpForCast(G.spellByKey("trees"), 10, 0, false) === 2 &&
    G.hpForCast(LATTICE, 10, 2, false) - G.hpForCast(LATTICE, 10, 0, false) === 2);
  check("the Crown Shard holds no health for its slots to land on (hpForCast 0) — its slots feed its harm instead",
    G.hpForCast(SHARD, 10, 3, false) === 0);
  check("the reckoning: WITCH pours of 3 lay 6 into spell, rune and ward pages alike",
    L("witch", "spell", 3) === 6 && L("witch", "rune", 3) === 6 && L("witch", "ward", 3) === 6,
    `${L("witch", "spell", 3)}/${L("witch", "rune", 3)}/${L("witch", "ward", 3)}`);
  check("the reckoning: SAGE pours of 3 lay 5 into the same kinds",
    L("sage", "spell", 3) === 5 && L("sage", "rune", 3) === 5 && L("sage", "ward", 3) === 5,
    `${L("sage", "spell", 3)}/${L("sage", "rune", 3)}/${L("sage", "ward", 3)}`);
  check("the reckoning: BINDER pours of 3 lay 9 — her ×3 names no kind, and her own school is Binding itself (and at the Attune acts, where no page kind stands, her single spend lays 3)",
    L("binder", "binding", 3) === 9 && L("binder", "ward", 3) === 9 && L("binder", "spell", 3) === 9
    && L("binder", null, 1) === 3 && L("binder", "ward", 0) === 0,
    `${L("binder", "binding", 3)}/${L("binder", null, 1)}`);
  check("BINDINGS stand outside the Witch's and the Sage's gifts, and no other hand is bent",
    L("witch", "binding", 3) === 3 && L("sage", "binding", 3) === 3 &&
    L("warden", "ward", 3) === 3 && L("runewright", "rune", 3) === 3 &&
    L("witch", null, 1) === 1 && L("sage", null, 1) === 1 && L("warden", null, 1) === 1 &&
    L(null, "ward", 3) === 3 && L("witch", "ward", 0) === 0 && L("sage", "ward", 0) === 0);
  check("the pools' own band stands untouched (9 is Lv 0, 10 Lv I, 29 Lv II, 30 Lv III) — the pages' slots do not read it",
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

/* ── §1 THE GRIMOIRE DOOR: a slot costs exactly 4 of its
      element, for every hand alike — the price never bends.
      What a spend LAYS bends by the gifts (Recovery R9,
      pourLaidFor read at the door): the Witch lays 2 slots,
      the Sage 3, the Binder 3, the Warden 1, each for the
      same 4 points. A page mixes elements across its
      eight; the ninth is refused; the refusals stand guard
      around it. */
console.log("\n§1 the grimoire door — slots filled at 4 the slot, the eight, the refusals");
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

  const wdFill = await call("attuneGrimoirePage", { spellKey: "seal", element: "stone" }, wd.token);
  check("WARDEN: filling one stone slot in the Seal's page costs exactly 4 (pool 25 → 21) and stands 1 of 8",
    wdFill.data?.spent === 4 && wdFill.data?.inElement === 1 && wdFill.data?.filled === 1 &&
    wdFill.data?.slots?.stone === 1 && pageSlots(wd.me, "seal", "stone") === 1 && poolOf(wd.me, "stone") === 21,
    JSON.stringify(wdFill.data));
  const wiFill = await call("attuneGrimoirePage", { spellKey: "seal", element: "stone" }, wi.token);
  check("WITCH: the same spend at the same price — 4 paid, 2 standing (her doubling, read at the door)",
    wiFill.data?.spent === 4 && wiFill.data?.laid === 2 && wiFill.data?.inElement === 2 && wiFill.data?.filled === 2 && poolOf(wi.me, "stone") === 21,
    JSON.stringify(wiFill.data));
  const sgFill = await call("attuneGrimoirePage", { spellKey: "seal", element: "root" }, sg.token);
  check("SAGE: the same spend at the same price — 4 paid, 3 standing (her +2, read at the door)",
    sgFill.data?.spent === 4 && sgFill.data?.laid === 3 && sgFill.data?.inElement === 3 && sgFill.data?.filled === 3 && poolOf(sg.me, "root") === 21,
    JSON.stringify(sgFill.data));
  const bi = await mk("Book Binder", "binder");
  const biFill = await call("attuneGrimoirePage", { spellKey: "seal", element: "stone" }, bi.token);
  check("BINDER: the same spend at the same price — 4 paid, 3 standing (her Attune ×3, read at the door)",
    biFill.data?.spent === 4 && biFill.data?.laid === 3 && biFill.data?.inElement === 3 && biFill.data?.filled === 3 && poolOf(bi.me, "stone") === 21,
    JSON.stringify(biFill.data));

  const wdRoot1 = await call("attuneGrimoirePage", { spellKey: "seal", element: "root" }, wd.token);
  const wdRoot2 = await call("attuneGrimoirePage", { spellKey: "seal", element: "root" }, wd.token);
  check("THE MIX: the Warden's Seal page holds stone ×1 and root ×2 across its slots (3 of 8 filled)",
    wdRoot2.data?.filled === 3 && pageSlots(wd.me, "seal", "stone") === 1 && pageSlots(wd.me, "seal", "root") === 2 &&
    poolOf(wd.me, "root") === 17, JSON.stringify(wdRoot2.data));

  const legacy = await call("attuneGrimoirePage", { spellKey: "seal", element: "stone", points: 10 }, wd.token);
  check("THE RETIRED ARGUMENT: a points field smuggled into the fill buys nothing — exactly one slot, exactly 4 spent",
    legacy.data?.spent === 4 && legacy.data?.inElement === 2 && pageSlots(wd.me, "seal", "stone") === 2 && poolOf(wd.me, "stone") === 17,
    JSON.stringify(legacy.data));

  const greedy = await call("attuneGrimoirePage", { spellKey: "shard", element: "fire" }, wi.token, true);
  check("REFUSAL: a pool that cannot pay the 4 is refused whole (fire holds 3)",
    greedy.status === 400 && /pool holds/.test(JSON.stringify(greedy.data)), `status=${greedy.status} ${JSON.stringify(greedy.data)}`);
  check("REFUSAL: the refused fill spent nothing and laid nothing",
    poolOf(wi.me, "fire") === 3 && pageSlots(wi.me, "shard", "fire") === 0, `pool=${poolOf(wi.me, "fire")} slots=${pageSlots(wi.me, "shard", "fire")}`);
  const intoBinding = await call("attuneGrimoirePage", { spellKey: "springleaf", element: "root" }, wi.token, true);
  check("REFUSAL: a BINDING page takes no attunement — the exclusion lives at the book's door now",
    intoBinding.status === 400 && /takes no attunement/.test(JSON.stringify(intoBinding.data)), `status=${intoBinding.status} ${JSON.stringify(intoBinding.data)}`);
  const intoBlade = await call("attuneGrimoirePage", { spellKey: "blade", element: "root" }, wi.token, true);
  check("REFUSAL: a harm rune whose strength is not bought with points refuses it too",
    intoBlade.status === 400 && /takes no attunement/.test(JSON.stringify(intoBlade.data)), `status=${intoBlade.status} ${JSON.stringify(intoBlade.data)}`);
  check("REFUSAL: both refusals left the Witch's root pool untouched (25)", poolOf(wi.me, "root") === 25, `pool=${poolOf(wi.me, "root")}`);

  setPool(wd.me, "stone", 60); setPool(wd.me, "root", 60);
  for (let i = 0; i < 5; i++) await call("attuneGrimoirePage", { spellKey: "lattice", element: "stone" }, wd.token);
  let lastFill = null;
  for (let i = 0; i < 3; i++) lastFill = await call("attuneGrimoirePage", { spellKey: "lattice", element: "root" }, wd.token);
  check("THE EIGHT: the Lattice's page fills to 8 of 8 — five stone, three root (stone 60 → 40, root 60 → 48)",
    lastFill.data?.filled === 8 && pageSlots(wd.me, "lattice", "stone") === 5 && pageSlots(wd.me, "lattice", "root") === 3 &&
    poolOf(wd.me, "stone") === 40 && poolOf(wd.me, "root") === 48, JSON.stringify(lastFill.data));
  const ninth = await call("attuneGrimoirePage", { spellKey: "lattice", element: "stone" }, wd.token, true);
  check("THE NINTH: a page whose eight slots stand filled refuses another — and the refusal spends nothing",
    ninth.status === 400 && /eight slots/.test(JSON.stringify(ninth.data)) && poolOf(wd.me, "stone") === 40,
    `status=${ninth.status} pool=${poolOf(wd.me, "stone")}`);

  const mine = await call("getGrimoire", {}, wd.token);
  check("THE LEDGER SERVED: getGrimoire shows the Warden his own pages' slots (seal stone 2 · root 2; lattice stone 5 · root 3)",
    mine.data?.pageAttunements?.seal?.stone === 2 && mine.data?.pageAttunements?.seal?.root === 2 &&
    mine.data?.pageAttunements?.lattice?.stone === 5 && mine.data?.pageAttunements?.lattice?.root === 3,
    JSON.stringify(mine.data?.pageAttunements));
  const anon = await call("getGrimoire", {}, null);
  check("THE LEDGER KEPT: an unbound read of the book carries no one's slots",
    anon.data?.pageAttunements === undefined, JSON.stringify(Object.keys(anon.data ?? {})));
}

/* ── §2 THE TABLE CARRIES THE PAGE: the Witch's Seal page
      holds two stone slots, her Lattice three root slots;
      the Warden's book is bare. Casts name no pour — the
      workings stand with the slots of the CAST'S element
      (+1 health each in hpForCast; the Seal's riposte, its
      power, +1 each in the snapshot), the pools unmoved —
      and the two dead roads (a pour field in the cast, the
      pourWorking push) move nothing. THE COLOUR IS DERIVED
      (2026-10-21, the 19:35 ruling of 2026-10-20): the
      cast's element is judged from the page itself, so a
      hue NAMED in the cast message is inert — the "other
      element" cast of the slots build is now the smuggled-
      hue proof, and a bare PAGE (the Warden) is what casts
      bare. */
console.log("\n§2 the table carries the page — casts draw on the book, the old roads are dead");
{
  const wi = await seedBoundTender({ tenderName: "Table Witch", password: "table-wi-62", tag: "62W", classKey: "witch", filler: 120 });
  const wd = await seedBoundTender({ tenderName: "Table Warden", password: "table-wd-62", tag: "62D", classKey: "warden", filler: 40 });
  const rw = await seedBoundTender({ tenderName: "Table Runewright", password: "table-rw-62", tag: "62R", classKey: "runewright", filler: 40 });
  setPool(wi.ownerKey, "stone", 25); setPool(wi.ownerKey, "root", 25);
  setPool(wd.ownerKey, "stone", 25);
  setPage(wi.ownerKey, "seal", "stone", 2);
  setPage(wi.ownerKey, "lattice", "root", 3);
  const room = "table-62-a";
  const cWI = await joinBound(wi.tt, room, "TBL-WI");
  const cWD = await joinBound(wd.tt, room, "TBL-WD");
  const cRW = await joinBound(rw.tt, room, "TBL-RW");
  check("the seats carry their classes", cWI.you.classKey === "witch" && cWD.you.classKey === "warden" && cRW.you.classKey === "runewright",
    `${cWI.you.classKey}/${cWD.you.classKey}/${cRW.you.classKey}`);

  const castSeal = async (c, edgeIdx, hue, extra = {}) => {
    const landing = c.you.landing;
    const hexB = neighbours(landing)[edgeIdx];
    return castUntil(c,
      { type: "castWard", root: "seal", hue, hexA: landing, hexB, ...extra },
      cc => cc.state.workings.find(w => w.kind === "ward" && w.engine === "seal" && w.hexA === landing && w.hexB === hexB),
      "the seal stands");
  };
  const witchSeal = await castSeal(cWI, 1, "stone");
  check("WITCH (Table cast, ward): no pour named — her Seal carries the page's 2 stone slots",
    witchSeal.pour === 2, `pour=${witchSeal.pour}`);
  check("WITCH (Table cast, ward): the Seal's health is the bare health + 2, exact",
    witchSeal.hp === expHp(SEAL, 10, 2) && witchSeal.maxHp === expHp(SEAL, 10, 2) && witchSeal.hp - expHp(SEAL, 10, 0) === 2,
    `hp=${witchSeal.hp} expected ${expHp(SEAL, 10, 2)}`);
  check("WITCH (Table cast, ward): the Seal's riposte — its power — is the book's riposte + 2 slots",
    witchSeal.nums?.riposte === (SEAL.numbers?.riposte ?? 3) + 2, `riposte=${witchSeal.nums?.riposte}`);
  check("WITCH (Table cast, ward): the cast spent NO pool (stone still 25)", poolOf(wi.ownerKey, "stone") === 25, `pool=${poolOf(wi.ownerKey, "stone")}`);
  const witchSeal2 = await castSeal(cWI, 2, "stone", { pour: 3 });
  check("THE DEAD FIELD: a pour smuggled into the cast message changes nothing — the second Seal carries the same 2 slots",
    witchSeal2.pour === 2 && witchSeal2.hp === expHp(SEAL, 10, 2) && witchSeal2.nums?.riposte === (SEAL.numbers?.riposte ?? 3) + 2,
    `pour=${witchSeal2.pour} hp=${witchSeal2.hp} riposte=${witchSeal2.nums?.riposte}`);
  check("THE DEAD FIELD: the smuggled pour spent nothing either (stone still 25)", poolOf(wi.ownerKey, "stone") === 25, `pool=${poolOf(wi.ownerKey, "stone")}`);
  const witchSealRoot = await castSeal(cWI, 3, "root");
  check("THE SENT HUE IS INERT (Table cast, ward): a cast NAMING root still wears the page's derived colour — stone — and carries its 2 slots whole",
    witchSealRoot.hue === "stone" && witchSealRoot.pour === 2 && witchSealRoot.hp === expHp(SEAL, 10, 2) && witchSealRoot.nums?.riposte === (SEAL.numbers?.riposte ?? 3) + 2,
    `hue=${witchSealRoot.hue} pour=${witchSealRoot.pour} hp=${witchSealRoot.hp} riposte=${witchSealRoot.nums?.riposte}`);
  const wardenSeal = await castSeal(cWD, 1, "stone");
  check("CONTROL (Table cast, ward): the Warden's bare page casts bare — 0 carried at the bare health and riposte",
    wardenSeal.pour === 0 && wardenSeal.hp === expHp(SEAL, 10, 0) && wardenSeal.nums?.riposte === (SEAL.numbers?.riposte ?? 3),
    `pour=${wardenSeal.pour} hp=${wardenSeal.hp} riposte=${wardenSeal.nums?.riposte}`);

  const freeHex = cWI.state.map.map(t => t.id).find(id => id !== "0,0" && ![cWI, cWD, cRW].some(x => x.you?.landing === id));
  const witchLat = await castUntil(cWI,
    { type: "castRune", root: "lattice", hue: "root", hexes: [freeHex] },
    cc => cc.state.workings.find(w => w.kind === "rune" && w.engine === "lattice" && w.hex === freeHex),
    "the lattice stands");
  check("WITCH (Table cast, rune): her Lattice carries its page's 3 root slots, health exact, no pool spent",
    witchLat.pour === 3 && witchLat.hp === expHp(LATTICE, 10, 3) && poolOf(wi.ownerKey, "root") === 25,
    `pour=${witchLat.pour} hp=${witchLat.hp} expected ${expHp(LATTICE, 10, 3)} pool=${poolOf(wi.ownerKey, "root")}`);
  check("WITCH (Table cast, rune): the Lattice's pin stands at the book's rounds — the slots' +1 power has no body in a pin's length and invents none",
    witchLat.nums?.pinRounds === (LATTICE.numbers?.pinRounds ?? 2), `pinRounds=${witchLat.nums?.pinRounds}`);

  // THE PUSH IS GONE: a neutral lattice from the Runewright;
  // the Witch pushes it by the old message — nothing moves.
  const neutralHex = cWI.state.map.map(t => t.id).filter(id => id !== "0,0" && id !== freeHex && ![cWI, cWD, cRW].some(x => x.you?.landing === id))[5];
  const neutral = await castUntil(cRW,
    { type: "castRune", root: "lattice", hue: "unaligned", hexes: [neutralHex] },
    cc => cc.state.workings.find(w => w.kind === "rune" && w.hex === neutralHex),
    "the neutral lattice stands");
  check("a neutral lattice stands carrying 0", neutral.pour === 0 && neutral.hue === "unaligned", `pour=${neutral.pour} hue=${neutral.hue}`);
  cWI.send({ type: "pourWorking", workingId: neutral.id, hue: "root", pour: 3 });
  await sleep(1800);
  const unmoved = cWI.state.workings.find(w => w.id === neutral.id);
  check("THE DEAD ROAD: pourWorking moves nothing — the rune stands unaligned carrying 0, the Witch's pool untouched (25)",
    unmoved?.hue === "unaligned" && unmoved?.pour === 0 && poolOf(wi.ownerKey, "root") === 25,
    `hue=${unmoved?.hue} pour=${unmoved?.pour} pool=${poolOf(wi.ownerKey, "root")}`);
  cWI.ws.close(); cWD.ws.close(); cRW.ws.close();
}

/* ── §3 THE HOMELAND CARRIES THE PAGE: the Witch fills her
      pages' slots through the door itself, then casts on
      home ground — seal, lattice and shard all carry their
      pages' slots of the cast's element; the Warden's bare
      book casts bare; the old push action is gone. */
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

  await call("attuneGrimoirePage", { spellKey: "seal", element: "stone" }, wi.token);
  await call("attuneGrimoirePage", { spellKey: "seal", element: "stone" }, wi.token);
  await call("attuneGrimoirePage", { spellKey: "lattice", element: "root" }, wi.token);
  await call("attuneGrimoirePage", { spellKey: "shard", element: "fire" }, wi.token);
  await call("attuneGrimoirePage", { spellKey: "shard", element: "fire" }, wi.token);
  await call("attuneGrimoirePage", { spellKey: "shard", element: "fire" }, wi.token);
  check("the Witch's pages stand slotted by the door itself — each of her spends laid 2 (seal stone ×4, lattice root ×2, shard fire ×6; pools 25 → 17 / 21 / 13, the price per spend unchanged)",
    pageSlots(wi.me, "seal", "stone") === 4 && pageSlots(wi.me, "lattice", "root") === 2 && pageSlots(wi.me, "shard", "fire") === 6 &&
    poolOf(wi.me, "stone") === 17 && poolOf(wi.me, "root") === 21 && poolOf(wi.me, "fire") === 13,
    `${pageSlots(wi.me, "seal", "stone")}/${pageSlots(wi.me, "lattice", "root")}/${pageSlots(wi.me, "shard", "fire")} pools ${poolOf(wi.me, "stone")}/${poolOf(wi.me, "root")}/${poolOf(wi.me, "fire")}`);

  const wiSeal = await castUntilStands(wi.token, { spellKey: "seal", hue: "stone", tileId: wi.ids["2,0"], dir: 2 });
  check("WITCH (homeland cast, ward): the Seal carries its page's 4 stone slots — the response speaks it",
    wiSeal?.pour === 4, JSON.stringify(wiSeal));
  const wiSealRow = workingRow(wi.me, wiSeal?.id);
  check("WITCH (homeland cast, ward): the standing Seal holds the 4 slots at the bare health + 4",
    wiSealRow?.pour === 4 && wiSealRow?.hp === expHp(SEAL, 3, 4),
    `row=${JSON.stringify(wiSealRow)} expected hp ${expHp(SEAL, 3, 4)}`);
  check("WITCH (homeland cast, ward): the Seal's stored riposte — its power — is the book's riposte + 4 slots",
    JSON.parse(wiSealRow?.nums ?? "{}")?.riposte === (SEAL.numbers?.riposte ?? 3) + 4, `nums=${wiSealRow?.nums}`);
  check("WITCH (homeland cast, ward): the cast spent no pool (stone still 17 — the door's price alone)",
    poolOf(wi.me, "stone") === 17, `pool=${poolOf(wi.me, "stone")}`);
  const wiSeal2 = await castUntilStands(wi.token, { spellKey: "seal", hue: "stone", tileId: wi.ids["1,0"], dir: 2, pour: 5 });
  check("THE DEAD FIELD: a pour smuggled into the homeland cast changes nothing — 4 slots again, pool unmoved",
    wiSeal2?.pour === 4 && poolOf(wi.me, "stone") === 17, `res=${JSON.stringify(wiSeal2)} pool=${poolOf(wi.me, "stone")}`);
  const wdSeal = await castUntilStands(wd.token, { spellKey: "seal", hue: "stone", tileId: wd.ids["2,0"], dir: 2 });
  check("CONTROL (homeland cast, ward): the Warden's bare page casts bare — 0 carried at the bare health",
    wdSeal?.pour === 0 && workingRow(wd.me, wdSeal?.id)?.hp === expHp(SEAL, 3, 0), `res=${JSON.stringify(wdSeal)}`);

  const wiLat = await castUntilStands(wi.token, { spellKey: "lattice", hue: "root", tileId: wi.ids["1,1"] });
  check("WITCH (homeland cast, rune): the Lattice carries its page's 2 root slots, health exact",
    wiLat?.pour === 2 && wiLat?.hp === expHp(LATTICE, 3, 2) && workingRow(wi.me, wiLat?.id)?.pour === 2,
    `res=${JSON.stringify(wiLat)}`);
  const wiShard = await castUntilStands(wi.token, { spellKey: "shard", hue: "fire", tileId: wi.ids["2,1"] });
  check("WITCH (homeland cast, rune): the Crown Shard stands holding its page's 6 fire slots — the measure its fall reads where a fall exists",
    wiShard?.pour === 6 && workingRow(wi.me, wiShard?.id)?.pour === 6, `res=${JSON.stringify(wiShard)}`);

  const gone = await call("pourMapWorking", { id: wiLat.id, hue: "root", pour: 2 }, wi.token, true);
  check("THE DEAD ROAD: pourMapWorking is gone from the world (404) — the standing rune is untouched",
    gone.status === 404 && workingRow(wi.me, wiLat.id)?.pour === 2, `status=${gone.status}`);

  const grove = await castUntilStands(wi.token, { spellKey: "springleaf", hue: "root", tileId: wi.ids["3,0"], pour: 2 });
  check("THE BINDING STANDS BARE: a pour smuggled into the Springleaf's cast plants the grove carrying 0, pool untouched",
    !!grove && workingRow(wi.me, grove.id)?.pour === 0 && poolOf(wi.me, "root") === 21,
    `res=${JSON.stringify(grove)} pool=${poolOf(wi.me, "root")}`);
}

console.log(`\nGRIMOIRE SLOTS: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
