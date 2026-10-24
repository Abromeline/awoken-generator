// EARLY ENTRY RAISES DIFFICULTY — DRIVE (Nigel, 2026-10-23
// 23:33: going into the cursed lands BEFORE LEVEL 3, or
// BEFORE HOLDING AT LEAST 20 AWOKEN, increases the
// difficulty).
// Boots the real server in-process on a scratch DATA_DIR
// and proves the build's reading against the real API:
//   §W SOURCE — the raise stands in settleWanderers only,
//      gated on the Tender's stand being cursed ground and
//      on either mark unmet (level < 3 OR held < 20); it
//      writes no stored intensity; table.ts carries none
//      of it; the amended warning words stand verbatim in
//      ClassChoosing.tsx and in the built bundle.
//   §A UNDER-PREPARED IN THE CURSED LANDS (Lv 1, 3 held,
//      standing on a cursed tile, standing wave intensity
//      1): the cradle births at ONE STEP HOTTER — cap 10
//      (standing 8 + 2), every newborn at level 2 with its
//      body deepened a point, kinds drawn from the
//      intensity-2 pool (Fray and Hollow only — no
//      Unraveler, no Tangle), and the STORED wave
//      intensity still reads 1 afterwards.
//   §B THE PREPARED CONTROL (Lv 3, 20 held, same cursed
//      stand): EXACTLY the standing reckoning — cap 8,
//      every newborn a level-1 Fray of 3 HP, stored
//      intensity 1. The control is the proof that a
//      prepared Tender's game is untouched.
//   §C ONE MARK ONLY STILL RAISES: (1) Lv 3 with 3 held
//      and (2) Lv 1 with 20 held each birth at the raised
//      step (level 2, cap 10), like §A.
//   §D SAFE GROUND IS NEVER PUNISHED: the §A Tender's
//      twin (Lv 1, 3 held) standing on PURIFIED ground
//      with the same cursed view births at the standing
//      reckoning exactly (level 1, cap 8, Fray only).
//   §E THE LIFT, ON ONE TENDER: under-prepared births
//      raised; the level mark alone lands — still raised;
//      the twentieth Awoken lands — the next cradle read
//      births at the standing reckoning exactly.
// Fixture shape, labelled: Tenders are claimed for real,
// then their ledgers are set by hand in the standing
// drives' own way (total_exp for level, awakened rows for
// the held count, class_key and tender_tile_id set
// directly, a hand-seeded hex map: purified rings 0–2,
// cursed rings 3–7, the stand at the heart). The cradle's
// clock is wound forward by hand (wanderer_anchor_at),
// as drive-battle and the uncle-run drive wind it. Every
// assertion reads the DB ledgers and the served territory
// after a real getTerritory read — the settle itself is
// the server's own, unmodified.
// Run after `npm run build` (server + client) so the
// drive boots this source's server and reads its bundle.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-early-entry-"));
process.env.PORT = "39984";
process.env.WORKSHOP_PASSWORD = "early-entry-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;
process.chdir(root);
const BASE = "http://127.0.0.1:39984";
const PW = "early-entry-drive-password";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};
const count = (hay, needle) => hay.split(needle).length - 1;

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
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }

const BASE_HP = { fray: 3, hollow: 4, unraveler: 5, tangle: 7 };
const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

let awSeq = 0;
function seedAwokin(ownerKey, tenderName, heldName) {
  const nowT = Date.now();
  const name = `${heldName} ${++awSeq}`;
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 3, 3, 'root', ?, 'image/png', ?)").run(`${name} ${cat}`, cat, `earlyentry/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: 3, toughness: 3, element: "root" });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)").run(name, name, `earlyentry/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}

/** A hand-seeded world: hexes to radius 7 of the heart;
 *  rings 3–7 cursed, rings 1–2 purified; the heart itself
 *  cursed or purified by the scenario. The stand is the
 *  heart, set on tender_tile_id directly. */
function seedLand(ownerKey, standCursed) {
  const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', ?, ?)");
  let standId = null;
  for (let q = -7; q <= 7; q++) {
    for (let r = -7; r <= 7; r++) {
      const d = hexDist({ q, r }, { q: 0, r: 0 });
      if (d > 7) continue;
      const cursed = d >= 3 ? 1 : (q === 0 && r === 0 ? (standCursed ? 1 : 0) : 0);
      const id = Number(insTile.run(ownerKey, q, r, cursed, Date.now()).lastInsertRowid);
      if (q === 0 && r === 0) standId = id;
    }
  }
  return standId;
}

async function makeTender(name, { exp, held, standCursed }) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, exp, Date.now());
  db.prepare("UPDATE tender_progress SET class_key = 'warden' WHERE owner_key = ?").run(ownerKey);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 500, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500").run(ownerKey, Date.now());
  for (let i = 0; i < held; i++) seedAwokin(ownerKey, name, "Held");
  const standId = seedLand(ownerKey, standCursed);
  db.prepare("UPDATE tender_progress SET tender_tile_id = ? WHERE owner_key = ?").run(standId, ownerKey);
  return { token: claim.token, ownerKey };
}

const darkRows = (ownerKey) => db.prepare("SELECT * FROM homeland_wanderers WHERE owner_key = ? ORDER BY id").all(ownerKey);
const storedIntensity = (ownerKey) => db.prepare("SELECT wave_intensity AS i FROM tender_progress WHERE owner_key = ?").get(ownerKey)?.i;

/** Prime (the first standing read arms the cradle's
 *  anchor and the battle watermark, birthing nothing),
 *  then wind the cradle's clock forward and read again:
 *  the births that read makes are the scenario's subject. */
async function spawnRead(T) {
  await call("getTerritory", {}, T.token);
  db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ?, wanderer_settled_beats = 0 WHERE owner_key = ?").run(Date.now() - 45000 * 30, T.ownerKey);
  const read = await call("getTerritory", {}, T.token);
  return { read, rows: darkRows(T.ownerKey) };
}

function expectRaised(label, T, { read, rows }) {
  const served = new Map((read.wanderers ?? []).map(w => [w.id, w]));
  ok(`${label}: the cradle filled to the RAISED cap — 10 standing dark (standing cap 8, +2 for the one hotter step)`,
    rows.length === 10, `born ${rows.length}: ${JSON.stringify(rows.map(w => [w.kind, w.lvl]))}`);
  ok(`${label}: every newborn stands at level 2 — the standing intensity 1 read one step hotter`,
    rows.length > 0 && rows.every(w => w.lvl === 2), JSON.stringify(rows.map(w => w.lvl)));
  ok(`${label}: kinds come from the deepened pool only (Fray, Hollow — no Unraveler below effective 3, no Tangle below effective 4)`,
    rows.every(w => w.kind === "fray" || w.kind === "hollow"), JSON.stringify(rows.map(w => w.kind)));
  ok(`${label}: every served newborn's body is deepened a point for its level (maxHp = its kind's base + 1)`,
    rows.length > 0 && rows.every(w => served.get(w.id)?.maxHp === (BASE_HP[w.kind] ?? 3) + 1),
    JSON.stringify(rows.map(w => [w.kind, served.get(w.id)?.maxHp])));
  ok(`${label}: the STORED wave intensity still reads 1 — the raise is a reading, never a writing`,
    storedIntensity(T.ownerKey) === 1, `stored ${storedIntensity(T.ownerKey)}`);
  console.log(`  ${label} kinds: ${JSON.stringify(rows.reduce((m, w) => ((m[w.kind] = (m[w.kind] ?? 0) + 1), m), {}))}`);
}

function expectStanding(label, T, { read, rows }) {
  const served = new Map((read.wanderers ?? []).map(w => [w.id, w]));
  ok(`${label}: the cradle filled to the STANDING cap — exactly 8 standing dark`,
    rows.length === 8, `born ${rows.length}: ${JSON.stringify(rows.map(w => [w.kind, w.lvl]))}`);
  ok(`${label}: every newborn is a level-1 Fray of 3 HP — the standing pool, the standing level, the standing body`,
    rows.length > 0 && rows.every(w => w.lvl === 1 && w.kind === "fray" && served.get(w.id)?.maxHp === 3),
    JSON.stringify(rows.map(w => [w.kind, w.lvl, served.get(w.id)?.maxHp])));
  ok(`${label}: the STORED wave intensity reads 1, as it stood`,
    storedIntensity(T.ownerKey) === 1, `stored ${storedIntensity(T.ownerKey)}`);
}

/* ── §W SOURCE — THE RAISE'S SHAPE, READ AS WRITTEN ──── */
console.log("§W the raise stands in the cradle only, gated and unwritten; the warning's words stand");
{
  const actions = readFileSync(join(root, "server/src/actions.ts"), "utf8");
  const table = readFileSync(join(root, "server/src/table.ts"), "utf8");
  const choosing = readFileSync(join(root, "client/src/ClassChoosing.tsx"), "utf8");
  const at = actions.indexOf("async settleWanderers(");
  const end = at >= 0 ? actions.indexOf("async settleHomelandWeapon(", at) : -1;
  const span = at >= 0 && end > at ? actions.slice(at, end) : "";
  ok("settleWanderers is found, and the raise stands inside it", !!span && span.includes("EARLY ENTRY RAISES DIFFICULTY (Nigel, 2026-10-23"));
  ok("the raise is ONE step of the engine's own lever: 'intensity += 1' stands exactly once in the whole server actions",
    count(actions, "intensity += 1") === 1 && span.includes("if (progress.level < 3 || progress.awokenCount < 20) intensity += 1;"));
  ok("the raise is gated on the Tender standing on cursed ground (stand.cursed) before the progress reckoning is read",
    span.indexOf("if (stand && stand.cursed)") >= 0
    && span.indexOf("if (stand && stand.cursed)") < span.indexOf("progress.level < 3"));
  ok("the raise reckons by the progress ledger's own marks (level, awokenCount — the held count piece 3 added)",
    span.includes("const progress = await getTenderProgress(ownerKey);") && span.includes("progress.awokenCount < 20"));
  ok("settleWanderers never WRITES a wave intensity — the stored reckoning is untouched by the pass",
    !!span && !/UPDATE[^;]*wave_intensity/.test(span) && !span.includes("wave_intensity ="));
  ok("the Table carries none of it — no early-entry condition stands in table.ts (its battles are not the cursed lands)",
    !table.includes("awokenCount < 20") && !table.includes("EARLY ENTRY RAISES"));
  const WORDS = "but go early and the dark presses harder: while you stand on cursed ground before level 3, or with fewer than twenty Awoken held, what the cursed lands birth against you stands a step stronger, deeper in kind and greater in number, until both marks are met.";
  ok("the choosing panel's warning now carries the law's teeth, verbatim, exactly once",
    count(choosing, WORDS) === 1);
  const distAssets = join(root, "client/dist/assets");
  ok("client/dist/assets exists (build the client first)", existsSync(distAssets));
  let bundle = "";
  if (existsSync(distAssets)) for (const f of readdirSync(distAssets)) if (f.endsWith(".js")) bundle += readFileSync(join(distAssets, f), "utf8") + "\n";
  ok("the built bundle carries the amended warning words", bundle.includes("go early and the dark presses harder"));
}

/* ── §A UNDER-PREPARED, ON CURSED GROUND ─────────────── */
console.log("§A an under-prepared Tender (Lv 1, three held) standing on cursed ground draws the raised pressure");
const A = await makeTender("Early Entry", { exp: 30, held: 3, standCursed: true });
{
  const expA = await call("getTenderExp", {}, A.token);
  ok("the fixture stands as named: level 1, three held", expA.level === 1 && expA.awokenCount === 3, JSON.stringify({ level: expA.level, n: expA.awokenCount }));
  expectRaised("§A", A, await spawnRead(A));
}

/* ── §B THE PREPARED CONTROL ─────────────────────────── */
console.log("§B a prepared Tender (Lv 3, twenty held) on the same cursed ground draws exactly the standing pressure");
const B = await makeTender("Prepared Control", { exp: 150, held: 20, standCursed: true });
{
  const expB = await call("getTenderExp", {}, B.token);
  ok("the fixture stands as named: level 3, twenty held", expB.level === 3 && expB.awokenCount === 20, JSON.stringify({ level: expB.level, n: expB.awokenCount }));
  expectStanding("§B", B, await spawnRead(B));
}

/* ── §C ONE MARK ONLY STILL RAISES ───────────────────── */
console.log("§C meeting only one mark still draws the raise — level without the twenty, and the twenty without the level");
const C1 = await makeTender("Level Only", { exp: 150, held: 3, standCursed: true });
expectRaised("§C1 (Lv 3, three held)", C1, await spawnRead(C1));
const C2 = await makeTender("Count Only", { exp: 30, held: 20, standCursed: true });
expectRaised("§C2 (Lv 1, twenty held)", C2, await spawnRead(C2));

/* ── §D SAFE GROUND ──────────────────────────────────── */
console.log("§D the same under-prepared Tender standing on purified ground draws the standing pressure — the raise never punishes safe ground");
const D = await makeTender("Safe Standing", { exp: 30, held: 3, standCursed: false });
expectStanding("§D", D, await spawnRead(D));

/* ── §E THE LIFT, ON ONE TENDER ──────────────────────── */
console.log("§E the lift: one Tender, three standings — neither mark, one mark, both marks");
const E = await makeTender("The Lift", { exp: 30, held: 3, standCursed: true });
expectRaised("§E stage 1 (Lv 1, three held)", E, await spawnRead(E));
db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(E.ownerKey);
db.prepare("UPDATE tender_progress SET total_exp = 150 WHERE owner_key = ?").run(E.ownerKey);
{
  const expE = await call("getTenderExp", {}, E.token);
  ok("stage 2 stands as named: the level mark landed (Lv 3), the count mark has not (three held)",
    expE.level === 3 && expE.awokenCount === 3, JSON.stringify({ level: expE.level, n: expE.awokenCount }));
}
expectRaised("§E stage 2 (Lv 3, three held — still raised)", E, await spawnRead(E));
db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(E.ownerKey);
for (let i = 0; i < 17; i++) seedAwokin(E.ownerKey, "The Lift", "Held");
{
  const expE = await call("getTenderExp", {}, E.token);
  ok("stage 3 stands as named: both marks met (Lv 3, twenty held)",
    expE.level === 3 && expE.awokenCount === 20, JSON.stringify({ level: expE.level, n: expE.awokenCount }));
}
expectStanding("§E stage 3 (both marks — the raise has lifted)", E, await spawnRead(E));

console.log(`\nEARLY ENTRY RAISE DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
