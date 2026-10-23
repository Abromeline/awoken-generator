// THE ZODIAC EFFECTS, WIRED FOR REAL — RECOVERY #1 DRIVE
// (Nigel's order, 2026-10-23 11:46: "1. wire and fix").
// The full check (L1) found the wheel's grants were
// display text: only the 13 party clauses were live. This
// drive proves the wiring against CONTROLS — the same
// tender with and without the star — on both grounds:
//
//   §0 THE SEED AND THE PASS — a world saved BEFORE this
//      build (a v3 graph whose wired stars carry no
//      clauses, the party pass already stamped) gains the
//      164 wired stars' clauses from the seed, once,
//      under the effects stamp — and nothing else in the
//      graph moves: a Starwright-written clause on an
//      unwired star stands untouched, and the party stars
//      stay exactly as their own pass left them.
//   §1 THE SUMS ACCRUE PER STAR (Nigel, 2026-10-23 13:12)
//      — fxSum, the one reader every seam reads, against
//      held-star sets: one star adds its deepened amount,
//      two stars stack, a ×2 star counts its 2, a rim
//      star its 3. Every wired family is pinned here,
//      including the four whose final seam is not yet in
//      the world (Study, Aim, Life Giver, Attune depth —
//      their blockers are named in the build report; the
//      sums themselves are real and proven).
//   §2 THE HOMELAND — the Attune door lays 1 + the rate;
//      builds finish faster; the crops regrow faster; a
//      summoned shield gains its dice; a fizzle refunds
//      Mercy's quarter; Return spares a tile-fall's first
//      victim whole; the wounded knit over a settled
//      minute; a kill feeds the Tender and the bystander
//      (Swallow the Heart); and the sampled strikes — the
//      bare Tender's AC, the Awokin's AC, the critical
//      reach — move the way the clauses say, against
//      starless controls run through the same windows.
//   §3 THE TABLE — the summon shield gains its dice; the
//      summon tale names the Spread's power plus the
//      clause; the Attune door lays 2 for 1; a fizzle
//      refunds; a raised ward stands +HP; a written rune
//      strikes +damage; the beat knits regen; a kill
//      feeds the wounded (Swallow); Return spares one
//      fielded non-party Awokin at the battle's end; and
//      a Starwright-written crit-damage clause lands
//      blows past the plain critical's ceiling, on a
//      threshold a 19 can crit — which the control's tale
//      never shows.
// Run: node scripts/drive-zodiac-effects.mjs
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-zodiac-effects-"));
process.env.PORT = "39931";
process.env.WORKSHOP_PASSWORD = "<MASKED_SECRET_001>";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;
process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39931";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

// ── §0 pre-seed: a world saved BEFORE the effects build ──
// Its wheel is the current writing (v3, wheelVersion "3")
// with the party pass already stamped — but every star
// this build wires stands there with EMPTY clauses, as
// production's saved wheel stands today. One unwired star
// (w_b4, a Warden-company star — Recovery #7's, not this
// build's) carries a Starwright-written clause that must
// survive the pass untouched.
const EXPECTED_SEED = {
  b_a1: [{ verb: "plantGrowth", amount: 5 }],
  b_a10: [{ verb: "wardHp", amount: 1 }],
  b_a11: [{ verb: "buildSpeed", amount: 5 }],
  b_a12: [{ verb: "attunementRate", amount: 1 }],
  b_a13: [{ verb: "lifeGiver", amount: 1 }],
  b_a14: [{ verb: "plantGrowth", amount: 5 }],
  b_a15: [{ verb: "buildSpeed", amount: 5 }],
  b_a16: [{ verb: "lifeGiver", amount: 1 }],
  b_a2: [{ verb: "plantGrowth", amount: 5 }],
  b_a3: [{ verb: "attunementRate", amount: 1 }],
  b_a4: [{ verb: "awokinRegen", amount: 1 }],
  b_a5: [{ verb: "buildSpeed", amount: 5 }],
  b_a6: [{ verb: "plantGrowth", amount: 5 }],
  b_a7: [{ verb: "lifeGiver", amount: 1 }],
  b_a8: [{ verb: "attunementRate", amount: 1 }],
  b_a9: [{ verb: "plantGrowth", amount: 5 }],
  b_b1: [{ verb: "returnHome", amount: 2 }],
  b_b10: [{ verb: "awokinRegen", amount: 2 }],
  b_b11: [{ verb: "attuneDepth", amount: 2 }],
  b_b14: [{ verb: "attuneDepth", amount: 2 }],
  b_b15: [{ verb: "summoner", amount: 2 }],
  b_b16: [{ verb: "returnHome", amount: 2 }],
  b_b2: [{ verb: "attuneDepth", amount: 2 }],
  b_b4: [{ verb: "wardHp", amount: 2 }],
  b_b5: [{ verb: "attuneDepth", amount: 2 }],
  b_b8: [{ verb: "attuneDepth", amount: 2 }],
  b_b9: [{ verb: "summoner", amount: 2 }],
  b_c: [{ verb: "attuneDepth", amount: 3 }],
  h1: [{ verb: "attunementRate", amount: 1 }],
  h10: [{ verb: "aim", amount: 1 }],
  h11: [{ verb: "awokinAb", amount: 1 }],
  h2: [{ verb: "tenderAc", amount: 1 }],
  h3: [{ verb: "tenderAb", amount: 1 }],
  h4: [{ verb: "awokinRegen", amount: 1 }],
  h6: [{ verb: "buildSpeed", amount: 5 }],
  h7: [{ verb: "awokinAc", amount: 1 }],
  h8: [{ verb: "study", amount: 1 }],
  h9: [{ verb: "returnHome", amount: 1 }],
  r_a1: [{ verb: "runeDamage", amount: 1 }],
  r_a10: [{ verb: "aim", amount: 1 }],
  r_a11: [{ verb: "runeDamage", amount: 1 }],
  r_a12: [{ verb: "attunementRate", amount: 1 }],
  r_a13: [{ verb: "study", amount: 1 }],
  r_a14: [{ verb: "aim", amount: 1 }],
  r_a15: [{ verb: "runeDamage", amount: 1 }],
  r_a16: [{ verb: "attunementRate", amount: 1 }],
  r_a2: [{ verb: "runeDamage", amount: 1 }],
  r_a3: [{ verb: "aim", amount: 1 }],
  r_a4: [{ verb: "aim", amount: 1 }],
  r_a5: [{ verb: "attunementRate", amount: 1 }],
  r_a6: [{ verb: "study", amount: 1 }],
  r_a7: [{ verb: "runeDamage", amount: 1 }],
  r_a8: [{ verb: "attunementRate", amount: 1 }],
  r_a9: [{ verb: "study", amount: 1 }],
  r_b1: [{ verb: "summoner", amount: 2 }],
  r_b10: [{ verb: "summoner", amount: 2 }],
  r_b11: [{ verb: "study", amount: 2 }],
  r_b12: [{ verb: "tenderAb", amount: 2 }],
  r_b13: [{ verb: "returnHome", amount: 2 }],
  r_b14: [{ verb: "summoner", amount: 2 }],
  r_b15: [{ verb: "critChance", amount: 2 }],
  r_b2: [{ verb: "tenderAb", amount: 2 }],
  r_b3: [{ verb: "returnHome", amount: 2 }],
  r_b5: [{ verb: "study", amount: 2 }],
  r_b6: [{ verb: "awokinAb", amount: 2 }],
  r_b7: [{ verb: "summoner", amount: 2 }],
  r_b9: [{ verb: "runeDamage", amount: 2 }],
  r_c: [{ verb: "runeDamage", amount: 3 }],
  rim1: [{ verb: "attunementRate", amount: 3 }],
  rim10: [{ verb: "attuneDepth", amount: 3 }],
  rim11: [{ verb: "attunementRate", amount: 3 }],
  rim12: [{ verb: "attunementRate", amount: 3 }],
  rim2: [{ verb: "attuneDepth", amount: 3 }],
  rim3: [{ verb: "summoner", amount: 3 }],
  rim4: [{ verb: "plantGrowth", amount: 15 }],
  rim5: [{ verb: "lifeGiver", amount: 3 }],
  rim6: [{ verb: "runeDamage", amount: 3 }],
  rim7: [{ verb: "wardHp", amount: 3 }],
  rim8: [{ verb: "study", amount: 3 }],
  rim9: [{ verb: "aim", amount: 3 }],
  s_a1: [{ verb: "plantGrowth", amount: 5 }],
  s_a10: [{ verb: "lifeGiver", amount: 1 }],
  s_a11: [{ verb: "attuneDepth", amount: 1 }],
  s_a13: [{ verb: "buildSpeed", amount: 5 }],
  s_a14: [{ verb: "attuneDepth", amount: 1 }],
  s_a16: [{ verb: "plantGrowth", amount: 5 }],
  s_a2: [{ verb: "hpOnKill", amount: 1 }],
  s_a3: [{ verb: "summoner", amount: 1 }],
  s_a5: [{ verb: "plantGrowth", amount: 5 }],
  s_a6: [{ verb: "lifeGiver", amount: 1 }],
  s_a7: [{ verb: "attuneDepth", amount: 1 }],
  s_a9: [{ verb: "plantGrowth", amount: 5 }],
  s_b1: [{ verb: "attuneDepth", amount: 2 }],
  s_b10: [{ verb: "attuneDepth", amount: 2 }],
  s_b11: [{ verb: "study", amount: 2 }],
  s_b12: [{ verb: "attunementRate", amount: 2 }],
  s_b13: [{ verb: "critChance", amount: 2 }],
  s_b14: [{ verb: "attuneDepth", amount: 2 }],
  s_b15: [{ verb: "aim", amount: 2 }],
  s_b16: [{ verb: "attuneDepth", amount: 2 }],
  s_b2: [{ verb: "study", amount: 2 }],
  s_b3: [{ verb: "attunementRate", amount: 2 }],
  s_b4: [{ verb: "critChance", amount: 2 }],
  s_b5: [{ verb: "attuneDepth", amount: 2 }],
  s_b6: [{ verb: "study", amount: 2 }],
  s_b7: [{ verb: "attunementRate", amount: 2 }],
  s_b9: [{ verb: "aim", amount: 2 }],
  s_c: [{ verb: "attuneDepth", amount: 3 }],
  w_a1: [{ verb: "tenderAc", amount: 1 }],
  w_a10: [{ verb: "study", amount: 1 }],
  w_a11: [{ verb: "wardHp", amount: 1 }],
  w_a12: [{ verb: "tenderAc", amount: 1 }],
  w_a13: [{ verb: "aim", amount: 1 }],
  w_a14: [{ verb: "buildSpeed", amount: 5 }],
  w_a15: [{ verb: "tenderAb", amount: 1 }],
  w_a16: [{ verb: "tenderAc", amount: 1 }],
  w_a2: [{ verb: "wardHp", amount: 1 }],
  w_a3: [{ verb: "tenderAc", amount: 1 }],
  w_a4: [{ verb: "study", amount: 1 }],
  w_a5: [{ verb: "buildSpeed", amount: 5 }],
  w_a6: [{ verb: "tenderAc", amount: 1 }],
  w_a7: [{ verb: "aim", amount: 1 }],
  w_a8: [{ verb: "wardHp", amount: 1 }],
  w_a9: [{ verb: "tenderAb", amount: 1 }],
  w_b1: [{ verb: "awokinAc", amount: 2 }],
  w_b11: [{ verb: "shieldDice", amount: 2 }],
  w_b12: [{ verb: "returnHome", amount: 2 }],
  w_b13: [{ verb: "awokinRegen", amount: 2 }],
  w_b14: [{ verb: "awokinAb", amount: 2 }],
  w_b15: [{ verb: "critChance", amount: 2 }],
  w_b3: [{ verb: "returnHome", amount: 2 }],
  w_b5: [{ verb: "returnHome", amount: 2 }],
  w_b6: [{ verb: "shieldDice", amount: 2 }],
  w_b8: [{ verb: "awokinAb", amount: 2 }],
  w_b9: [{ verb: "awokinRegen", amount: 2 }],
  w_c: [{ verb: "returnHome", amount: 3 }],
  wi_a1: [{ verb: "study", amount: 1 }],
  wi_a10: [{ verb: "aim", amount: 1 }],
  wi_a11: [{ verb: "critChance", amount: 1 }],
  wi_a12: [{ verb: "study", amount: 1 }],
  wi_a13: [{ verb: "tenderAb", amount: 1 }],
  wi_a14: [{ verb: "aim", amount: 1 }],
  wi_a15: [{ verb: "attunementRate", amount: 1 }],
  wi_a16: [{ verb: "study", amount: 1 }],
  wi_a2: [{ verb: "mercy", amount: 25 }],
  wi_a3: [{ verb: "attunementRate", amount: 1 }],
  wi_a4: [{ verb: "critChance", amount: 1 }],
  wi_a5: [{ verb: "study", amount: 1 }],
  wi_a6: [{ verb: "aim", amount: 1 }],
  wi_a7: [{ verb: "tenderAb", amount: 1 }],
  wi_a8: [{ verb: "awokinRegen", amount: 1 }],
  wi_a9: [{ verb: "study", amount: 1 }],
  wi_b1: [{ verb: "attunementRate", amount: 2 }],
  wi_b10: [{ verb: "study", amount: 2 }],
  wi_b13: [{ verb: "attunementRate", amount: 2 }],
  wi_b14: [{ verb: "awokinAc", amount: 2 }],
  wi_b15: [{ verb: "awokinAb", amount: 2 }],
  wi_b16: [{ verb: "study", amount: 2 }],
  wi_b2: [{ verb: "awokinAb", amount: 2 }],
  wi_b3: [{ verb: "critChance", amount: 2 }],
  wi_b4: [{ verb: "shieldDice", amount: 2 }],
  wi_b6: [{ verb: "awokinRegen", amount: 2 }],
  wi_b9: [{ verb: "awokinAb", amount: 2 }],
  wi_c: [{ verb: "returnHome", amount: 3 }]
};
{
  const pre = new Database(join(process.env.DATA_DIR, "app.db"));
  pre.exec(`CREATE TABLE tender_skills (owner_key TEXT NOT NULL, skill_key TEXT NOT NULL, pool TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (owner_key, skill_key));
            CREATE TABLE ui_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);`);
  const { ZODIAC_NODES, ZODIAC_EDGES } = await import("../server/dist/zodiacData.js");
  const nodes = ZODIAC_NODES.map((n) => ({
    ...n,
    fx: n.id === "w_b4" ? [{ verb: "tenderHp", amount: 7, el: null }] : [],
  }));
  const ins = pre.prepare("INSERT INTO ui_config (key, value, updated_at) VALUES (?, ?, 1)");
  ins.run("zodiac.graph", JSON.stringify({ nodes, edges: ZODIAC_EDGES, v: 3 }));
  ins.run("zodiac.wheelVersion", "3");
  ins.run("zodiac.partyFxPass", "party-fx-2026-10-22");
  pre.close();
}

await import("../server/dist/index.js");
await sleep(2500);
const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }

async function callRaw(action, args, token, headers = {}) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}), ...headers },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
async function call(action, args, token, headers) {
  const { status, data } = await callRaw(action, args, token, headers);
  if (status >= 300) throw new Error(`${action} -> ${status}: ${JSON.stringify(data)}`);
  return data;
}

// ── §0. THE SEED AND THE PASS ────────────────────────────
console.log("§0 the seed and the surgical pass");
{
  // One graph read through the game's own door runs the
  // pass (it lives inside zodiacGraph()); then the saved
  // graph in the ledger is the witness.
  const probe = await call("claimTender", { password: "zodiac-effects-password", tenderName: "Pass Probe" });
  await call("getSkillTree", {}, probe.token);
  const graphRow = db.prepare("SELECT value FROM ui_config WHERE key = 'zodiac.graph'").get();
  const graph = graphRow ? JSON.parse(graphRow.value) : null;
  ok("the saved wheel stands whole (194 stars, v3)", !!graph && graph.v === 3 && graph.nodes.length === 194, graph ? `v=${graph.v} n=${graph.nodes.length}` : "no graph");
  const byId = new Map((graph?.nodes ?? []).map((n) => [n.id, n]));
  const bad = [];
  for (const [id, clauses] of Object.entries(EXPECTED_SEED)) {
    const got = byId.get(id)?.fx ?? [];
    if (JSON.stringify(got) !== JSON.stringify(clauses)) bad.push(`${id}: got ${JSON.stringify(got)} want ${JSON.stringify(clauses)}`);
  }
  ok("THE PASS: all 164 wired stars gained their clauses at the deepened amounts (step × tier), written from the seed", bad.length === 0, bad.slice(0, 4).join(" | "));
  ok("THE PASS IS SURGICAL: the Starwright's clause on the unwired w_b4 stands untouched",
    JSON.stringify(byId.get("w_b4")?.fx) === JSON.stringify([{ verb: "tenderHp", amount: 7, el: null }]),
    JSON.stringify(byId.get("w_b4")?.fx));
  ok("THE PASS IS NOT THE PARTY PASS: the party stars stand exactly as the pre-seed left them (their own stamp already stood)",
    ["h5", "w_b2", "b_b3", "wi_b11"].every((id) => (byId.get(id)?.fx ?? []).length === 0),
    ["h5", "w_b2"].map((id) => `${id}=${JSON.stringify(byId.get(id)?.fx)}`).join(" "));
  const stamp = db.prepare("SELECT value FROM ui_config WHERE key = 'zodiac.effectsFxPass'").get()?.value;
  ok("the effects pass stands stamped (effects-fx-2026-10-23), so it never runs twice", stamp === "effects-fx-2026-10-23", String(stamp));
  const unseeded = ["r_k", "b_b13", "s_a12", "wi_b5", "wi_b12", "heart"];
  ok("company-bonus stars, the step-open Witch gifts and the Heart carry NO clauses from this build (Recovery #7's and the record's, not this one's)",
    unseeded.every((id) => (byId.get(id)?.fx ?? []).length === 0),
    unseeded.map((id) => `${id}=${JSON.stringify(byId.get(id)?.fx)}`).join(" "));
}

// ── shared fixtures ──────────────────────────────────────
const now = Date.now();
async function claimTender(name, exp, classKey) {
  const claim = await call("claimTender", { password: "zodiac-effects-password", tenderName: name });
  const token = claim.token;
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, exp, Date.now());
  if (classKey) await call("chooseClass", { classKey }, token);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 100000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 100000").run(ownerKey, Date.now());
  return { token, ownerKey, name };
}
const grantStars = (ownerKey, ids) => {
  const ins = db.prepare("INSERT INTO tender_skills (owner_key, skill_key, pool, created_at) VALUES (?, ?, 'tree', ?) ON CONFLICT DO NOTHING");
  for (const id of ids) ins.run(ownerKey, id, Date.now());
};
function seedAwokin(ownerKey, tenderName, name, el, partPower, partToughness) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)").run(`${name} ${cat}`, cat, partPower, partToughness, el, `zeffects/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: partPower, toughness: partToughness, element: el });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)").run(name, name, `zeffects/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
const seedTile = (ownerKey, q, r, element, cursed, extra = {}) => {
  const cols = { owner_key: ownerKey, q, r, element, cursed, created_at: Date.now(), ...extra };
  const keys = Object.keys(cols);
  return Number(db.prepare(`INSERT INTO territory_tiles (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`).run(...keys.map((k) => cols[k])).lastInsertRowid);
};
function seedPatch(ownerKey, radius = 3) {
  const ids = new Map();
  for (let q = -radius; q <= radius; q++) for (let r = -radius; r <= radius; r++) {
    const d = (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
    if (d > radius) continue;
    ids.set(`${q},${r}`, seedTile(ownerKey, q, r, "root", 0));
  }
  return ids;
}

// ── §1. THE SUMS ACCRUE PER STAR ─────────────────────────
console.log("§1 the sums — per star, deepened, stacked");
const { fxSum } = await import("../server/dist/skills.js");
{
  const A = await claimTender("Sum Holder", 3800, "warden");
  const C = await claimTender("Sum Control", 3800, "warden");
  ok("the control's sums all stand at 0",
    ["tenderAc", "tenderAb", "awokinAc", "awokinAb", "awokinRegen", "buildSpeed", "plantGrowth", "attunementRate", "attuneDepth", "lifeGiver", "returnHome", "summoner", "critChance", "critDamage", "runeDamage", "wardHp", "shieldDice", "hpOnKill", "mercy", "study", "aim"]
      .every((v) => fxSum(C.ownerKey, v) === 0));
  grantStars(A.ownerKey, ["h2"]);
  ok("one Heart star adds its step ×1 (tenderAc 1)", fxSum(A.ownerKey, "tenderAc") === 1);
  grantStars(A.ownerKey, ["w_a1", "w_a3"]);
  ok("each further star adds its own (tenderAc 3)", fxSum(A.ownerKey, "tenderAc") === 3);
  grantStars(A.ownerKey, ["w_b1"]);
  ok("a second-arm star counts its deepened 2 (awokinAc 2)", fxSum(A.ownerKey, "awokinAc") === 2);
  grantStars(A.ownerKey, ["h7", "wi_b14"]);
  ok("the family stacks across arms (awokinAc 1 + 2 + 2 = 5)", fxSum(A.ownerKey, "awokinAc") === 5);
  grantStars(A.ownerKey, ["rim4", "b_a1"]);
  ok("a rim star counts its deepened 3 (plantGrowth 15 + 5 = 20)", fxSum(A.ownerKey, "plantGrowth") === 20);
  grantStars(A.ownerKey, ["rim7", "w_a2"]);
  ok("wardHp stacks (3 + 1 = 4)", fxSum(A.ownerKey, "wardHp") === 4);
  grantStars(A.ownerKey, ["rim6", "r_a2"]);
  ok("runeDamage stacks (3 + 1 = 4)", fxSum(A.ownerKey, "runeDamage") === 4);
  grantStars(A.ownerKey, ["wi_a2", "s_a2", "h9", "r_b7", "w_b6", "r_b15", "h11", "h3", "h4", "h6", "h1"]);
  ok("mercy reads its percent whole (25)", fxSum(A.ownerKey, "mercy") === 25);
  ok("hpOnKill, returnHome, summoner, shieldDice, critChance read their deepened steps (1, 1, 2, 2, 2)",
    fxSum(A.ownerKey, "hpOnKill") === 1 && fxSum(A.ownerKey, "returnHome") === 1 && fxSum(A.ownerKey, "summoner") === 2
    && fxSum(A.ownerKey, "shieldDice") === 2 && fxSum(A.ownerKey, "critChance") === 2);
  ok("awokinAb, tenderAb, awokinRegen, buildSpeed, attunementRate read 1, 1, 1, 5, 1",
    fxSum(A.ownerKey, "awokinAb") === 1 && fxSum(A.ownerKey, "tenderAb") === 1 && fxSum(A.ownerKey, "awokinRegen") === 1
    && fxSum(A.ownerKey, "buildSpeed") === 5 && fxSum(A.ownerKey, "attunementRate") === 1);
  grantStars(A.ownerKey, ["h8", "h10", "b_a13", "b_b11"]);
  ok("the carried families accrue too — study 1, aim 1, lifeGiver 1, attuneDepth 2 (their seams are named blockers, their sums are real)",
    fxSum(A.ownerKey, "study") === 1 && fxSum(A.ownerKey, "aim") === 1 && fxSum(A.ownerKey, "lifeGiver") === 1 && fxSum(A.ownerKey, "attuneDepth") === 2);
  const { summonersPowerFor } = await import("../server/dist/skills.js");
  ok("SUMMONER'S POWER, THE SPREAD: the clause rides and the level grant is +1 per 7, +6 in all (Lv 6: 2 + 0; Lv 7: 2 + 1; Lv 42: 2 + 6; a Sage at Lv 42: 2 + 6 + 3)",
    summonersPowerFor(A.ownerKey, 6, "warden") === 2 && summonersPowerFor(A.ownerKey, 7, "warden") === 3
    && summonersPowerFor(A.ownerKey, 42, "warden") === 8 && summonersPowerFor(A.ownerKey, 42, "sage") === 11
    && summonersPowerFor(C.ownerKey, 104, "warden") === 6);
}

// ── §2. THE HOMELAND ─────────────────────────────────────
console.log("§2 the homeland doors");
const insertRow = (table, vals) => {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  const keys = Object.keys(vals).filter((k) => cols.includes(k));
  return Number(db.prepare(`INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`).run(...keys.map((k) => vals[k])).lastInsertRowid);
};
const tileRowOf = (id) => db.prepare("SELECT element, cursed, attune_element AS attuneElement, attune_points AS attunePoints, grow_points AS growPoints FROM territory_tiles WHERE id = ?").get(id);
const energyOf = (ownerKey) => db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(ownerKey)?.energy ?? 0;

// §2.1 THE ATTUNE DOOR — one point spent, 1 + rate laid.
{
  const H = await claimTender("Rate Holder", 3800, "warden");
  const C = await claimTender("Rate Control", 3800, "warden");
  grantStars(H.ownerKey, ["h1"]); // attunementRate +1
  for (const T of [H, C]) {
    const patch = seedPatch(T.ownerKey, 1);
    const standId = patch.get("0,0");
    db.prepare("UPDATE territory_tiles SET element = 'neutral' WHERE id = ?").run(standId);
    db.prepare("INSERT INTO aspect_attunement (owner_key, element, points, updated_at) VALUES (?, 'root', 25, ?)").run(T.ownerKey, Date.now());
    await call("setTenderTile", { tileId: standId }, T.token);
    T.standId = standId;
  }
  const rc = await call("attuneTile", { element: "root" }, C.token);
  ok("control: one spend lays exactly 1 (the bank holds 1, the pool paid 1)",
    tileRowOf(C.standId).attunePoints === 1 && rc.pool === 24, JSON.stringify(tileRowOf(C.standId)));
  const rh = await call("attuneTile", { element: "root" }, H.token);
  ok("the rate: one spend lays 1 + the sum (the bank holds 2, the pool still paid exactly 1)",
    tileRowOf(H.standId).attunePoints === 2 && rh.pool === 24, JSON.stringify(tileRowOf(H.standId)));
}

// §2.2 BUILD SPEED — the ready hour falls by the sum.
{
  const H = await claimTender("Build Holder", 3800, "warden");
  const C = await claimTender("Build Control", 3800, "warden");
  grantStars(H.ownerKey, ["h6", "b_a5"]); // buildSpeed 5 + 5 = 10%
  const span = async (T) => {
    const patch = seedPatch(T.ownerKey, 1);
    const tileId = patch.get("1,0");
    await call("placeBuilding", { tileId, buildingType: "watchtower" }, T.token);
    const row = db.prepare("SELECT ready_at AS readyAt, placed_at AS placedAt FROM territory_buildings WHERE owner_key = ? AND tile_id = ?").get(T.ownerKey, tileId);
    return (new Date(row.readyAt).getTime() - new Date(row.placedAt).getTime()) / 60000;
  };
  const cMin = await span(C);
  const hMin = await span(H);
  ok("build speed: the holder's watchtower rises at the shortened span — 10% off, floored to the game's whole minutes (15 → 13)",
    hMin < cMin && Math.abs(hMin - Math.floor(cMin * 0.9)) < 0.05, `control ${cMin} min, holder ${hMin} min`);
}

// §2.3 PLANT GROWTH — the crop's regrowth runs faster.
{
  const H = await claimTender("Plant Holder", 3800, "warden");
  const C = await claimTender("Plant Control", 3800, "warden");
  grantStars(H.ownerKey, ["b_a1", "rim4"]); // plantGrowth 5 + 15 = 20%
  const plant = (T) => {
    const patch = seedPatch(T.ownerKey, 1);
    const tileId = patch.get("1,0");
    // A Dream Shroom (dream-wheat) harvested 3.9 hours
    // ago: its regrowth is 4 hours at the base rate.
    return insertRow("territory_buildings", {
      owner_key: T.ownerKey, tile_id: tileId, building_type: "dream-wheat", status: "active",
      placed_at: Date.now() - 5 * 3600 * 1000, ready_at: Date.now() - 5 * 3600 * 1000,
      last_harvest_at: Date.now() - 3.9 * 3600 * 1000,
    });
  };
  const cId = plant(C);
  const cTry = await callRaw("harvestWheat", { buildingId: cId }, C.token);
  ok("control: at 3.9 of 4 hours the crop is not ready (refused)", cTry.status === 400, `${cTry.status} ${JSON.stringify(cTry.data)}`);
  const hId = plant(H);
  db.prepare("UPDATE tender_resources SET energy = 5 WHERE owner_key = ?").run(H.ownerKey); // below the base cap (10), so the capped gain still shows whole
  const e0 = energyOf(H.ownerKey);
  const hTry = await call("harvestWheat", { buildingId: hId }, H.token);
  ok("plant growth: at +20% the same 3.9 hours is past the shortened regrowth (4h / 1.2 = 3.33h) — the harvest lands and pays",
    hTry.ok === true && energyOf(H.ownerKey) === e0 + (hTry.energyGained ?? 4), JSON.stringify(hTry));
}

// §2.4 SHIELD DICE — the summoned pool gains its dice.
{
  const H = await claimTender("Shield Holder", 3800, "warden");
  const C = await claimTender("Shield Control", 3800, "warden");
  grantStars(H.ownerKey, ["w_b6"]); // shieldDice +2
  const sample = async (T) => {
    seedPatch(T.ownerKey, 3);
    const standId = db.prepare("SELECT id FROM territory_tiles WHERE owner_key = ? AND q = 0 AND r = 0").get(T.ownerKey).id;
    await call("setTenderTile", { tileId: standId }, T.token);
    const awId = seedAwokin(T.ownerKey, T.name, `${T.name} Kin`, "root", 1, 1); // 3 root parts: shield = 3d6, max 18
    await call("addToParty", { awakenedId: awId }, T.token);
    let best = 0;
    for (let i = 0; i < 14; i++) {
      const r = await call("summonAwoken", { awakenedId: awId }, T.token);
      if (!r.summoned) continue; // a faltered call spends and stands nothing — call again
      const row = db.prepare("SELECT shield FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(T.ownerKey, awId);
      best = Math.max(best, row?.shield ?? 0);
      db.prepare("DELETE FROM field_placements WHERE owner_key = ? AND awakened_id = ?").run(T.ownerKey, awId);
    }
    return best;
  };
  const cBest = await sample(C);
  const hBest = await sample(H);
  ok("control: fourteen summoned shields never pass the parts' own ceiling (3 dice, max 18)", cBest >= 3 && cBest <= 18, `best ${cBest}`);
  ok("shield dice: the holder's pool rolls the parts' dice + 2 more — a shield past the parts' ceiling (18) shows within fourteen summons",
    hBest > 18, `best ${hBest}`);
}

// §2.5 MISCAS​T MERCY — the fizzle refunds its quarter.
{
  const H = await claimTender("Mercy Holder", 3800, "sage");
  grantStars(H.ownerKey, ["wi_a2"]); // mercy 25%
  // A modest purse, under the energy cap, so the refund's
  // own arithmetic is what the ledger shows. The bench of
  // owned Awokin is what lifts the cap past the purse
  // (10 + 10 × the power-6 band's 4 = 50).
  for (let i = 0; i < 10; i++) seedAwokin(H.ownerKey, H.name, `${H.name} Bench ${i + 1}`, "root", 2, 0);
  db.prepare("UPDATE tender_resources SET energy = 40 WHERE owner_key = ?").run(H.ownerKey);
  seedPatch(H.ownerKey, 3);
  const standId = db.prepare("SELECT id FROM territory_tiles WHERE owner_key = ? AND q = 0 AND r = 0").get(H.ownerKey).id;
  await call("setTenderTile", { tileId: standId }, H.token);
  const grim = await call("getGrimoire", {}, H.token);
  const ward = (grim.spells ?? []).filter((s) => s.kind === "ward" && (s.cost ?? 0) >= 4)
    .sort((a, b) => (b.numbers?.level ?? 1) - (a.numbers?.level ?? 1))[0];
  ok("a ward page stands to miscast (cost ≥ 4, the deepest level)", !!ward, JSON.stringify(ward && { key: ward.key, cost: ward.cost, level: ward.numbers?.level }));
  let proven = false;
  for (let dir = 0; dir < 6 && !proven; dir++) {
    for (let tries = 0; tries < 10 && !proven; tries++) {
      const eBefore = energyOf(H.ownerKey);
      const rr = await callRaw("castMapWorking", { spellKey: ward.key, tileId: standId, dir }, H.token);
      if (rr.status >= 300) break; // the edge is spoken for (a landed cast stands there) — the next dir is tried
      const r = rr.data;
      if (!r.fizzled) continue; // a landed cast spends whole and raises its ward on this edge
      const want = Math.floor(r.cost * 25 / 100);
      ok("mercy: the fizzled cast's answer names the refund (25% of the spent price, floored)",
        r.mercyRefund === want && want >= 1, JSON.stringify(r));
      ok("mercy: the pool itself moved by −cost + refund, no more, no less",
        energyOf(H.ownerKey) === eBefore - r.cost + want, `${eBefore} -> ${energyOf(H.ownerKey)} (cost ${r.cost}, refund ${want})`);
      proven = true;
    }
  }
  ok("a fizzle showed itself within the tries (the Sage casts at −2 against a deep page)", proven);
}

// §2.6 RETURN — the tile-fall spares the first victim whole.
{
  const run = async (T, withStar) => {
    if (withStar) grantStars(T.ownerKey, ["h9"]); // returnHome +1
    seedTile(T.ownerKey, 0, 0, "root", 0);
    const targetId = seedTile(T.ownerKey, 2, 0, "root", 0, { attune_anchor_at: Date.now() - 3 * 3600 * 1000 });
    seedTile(T.ownerKey, 1, 0, "root", 0);
    seedTile(T.ownerKey, 2, -1, "root", 0);
    seedTile(T.ownerKey, 2, 1, "root", 0);
    // Three of his stand on the target tile: one Root
    // Awokin (3 root parts) against two Tide (6 tide
    // parts) — the press counts PARTS, so the net is
    // tide 3, mismatched to the root ground: it wears
    // the bare tile down in its first settled step and
    // the ground reverts under all three.
    const v1 = seedAwokin(T.ownerKey, T.name, `${T.name} Root`, "root", 1, 1);
    const v2 = seedAwokin(T.ownerKey, T.name, `${T.name} Tide A`, "tide", 1, 1);
    const v3 = seedAwokin(T.ownerKey, T.name, `${T.name} Tide B`, "tide", 1, 1);
    insertRow("field_placements", { owner_key: T.ownerKey, awakened_id: v1, tile_id: targetId, placed_at: Date.now(), last_moved_at: Date.now(), hp: 3 });
    insertRow("field_placements", { owner_key: T.ownerKey, awakened_id: v2, tile_id: targetId, placed_at: Date.now(), last_moved_at: Date.now(), hp: 3 });
    insertRow("field_placements", { owner_key: T.ownerKey, awakened_id: v3, tile_id: targetId, placed_at: Date.now(), last_moved_at: Date.now(), hp: 3 });
    await call("getTerritory", {}, T.token);
    const tile = tileRowOf(targetId);
    const dOf = (id) => db.prepare("SELECT dispersed_until AS d FROM awakened WHERE id = ?").get(id)?.d ?? null;
    const placed = db.prepare("SELECT COUNT(*) AS c FROM field_placements WHERE owner_key = ? AND tile_id = ?").get(T.ownerKey, targetId).c;
    return { tile, d1: dOf(v1), d2: dOf(v2), d3: dOf(v3), placed };
  };
  const C = await claimTender("Return Control", 3800, "warden");
  const rc = await run(C, false);
  ok("control: the worn tile reverts and ALL standing Awokin disperse for four hours",
    rc.tile.cursed === 1 && rc.placed === 0 && rc.d1 != null && rc.d2 != null && rc.d3 != null
    && Math.abs(new Date(rc.d1).getTime() - (Date.now() + 4 * 3600 * 1000)) < 10 * 60 * 1000,
    JSON.stringify(rc));
  const H = await claimTender("Return Holder", 3800, "warden");
  const rh = await run(H, true);
  ok("Return: the tile still falls and the field still clears — but the FIRST victim returns home whole (no timer written)",
    rh.tile.cursed === 1 && rh.placed === 0 && rh.d1 == null, JSON.stringify(rh));
  ok("Return: the save is counted — the other two disperse as always",
    rh.d2 != null && rh.d3 != null && Math.abs(new Date(rh.d2).getTime() - (Date.now() + 4 * 3600 * 1000)) < 10 * 60 * 1000, JSON.stringify(rh.d2));
}

// §2.7 REGENERATION — a settled minute knits the wounded.
{
  const run = async (T, withStar) => {
    if (withStar) grantStars(T.ownerKey, ["h4"]); // awokinRegen +1 per beat
    seedPatch(T.ownerKey, 2);
    const tileId = db.prepare("SELECT id FROM territory_tiles WHERE owner_key = ? AND q = 1 AND r = 0").get(T.ownerKey).id;
    const awId = seedAwokin(T.ownerKey, T.name, `${T.name} Wounded`, "root", 1, 4); // toughness 12
    const pid = insertRow("field_placements", { owner_key: T.ownerKey, awakened_id: awId, tile_id: tileId, placed_at: Date.now(), last_moved_at: Date.now(), hp: 2, shield: 0, shield_max: 0 });
    db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now() - 60000, T.ownerKey);
    await call("getTerritory", {}, T.token);
    return db.prepare("SELECT hp FROM field_placements WHERE id = ?").get(pid)?.hp;
  };
  const C = await claimTender("Regen Control", 3800, "warden");
  ok("control: a wounded figure reads back unwoven after a settled minute", (await run(C, false)) === 2);
  const H = await claimTender("Regen Holder", 3800, "warden");
  ok("regen: 1 HP per beat over the 60 s window (21 beats banked) knits the 10 missing HP whole",
    (await run(H, true)) === 12);
}

// §2.8 SWALLOW THE HEART — a kill feeds Tender + Awokin.
{
  const run = async (T, withStar) => {
    if (withStar) grantStars(T.ownerKey, ["s_a2"]); // hpOnKill +1
    seedPatch(T.ownerKey, 3);
    const tileOf = (q, r) => db.prepare("SELECT id FROM territory_tiles WHERE owner_key = ? AND q = ? AND r = ?").get(T.ownerKey, q, r).id;
    const killer = seedAwokin(T.ownerKey, T.name, `${T.name} Killer`, "stone", 3, 10); // toughness 30
    const byst = seedAwokin(T.ownerKey, T.name, `${T.name} Bystander`, "root", 1, 4); // toughness 12
    insertRow("field_placements", { owner_key: T.ownerKey, awakened_id: killer, tile_id: tileOf(0, 0), placed_at: Date.now(), last_moved_at: Date.now(), hp: 30, shield: 0, shield_max: 0, pos_q: 0, pos_r: 0 });
    const bystPid = insertRow("field_placements", { owner_key: T.ownerKey, awakened_id: byst, tile_id: tileOf(3, 0), placed_at: Date.now(), last_moved_at: Date.now(), hp: 7, shield: 0, shield_max: 0, pos_q: 3, pos_r: 0 });
    insertRow("homeland_wanderers", { owner_key: T.ownerKey, tile_id: tileOf(0, 0), kind: "fray", spawned_at: Date.now(), hp: 1, pos_q: 0, pos_r: 0, power: 1, lvl: 1 });
    const body = (await call("getTerritory", {}, T.token)).tender; // the territory read carries the Tender's body (hp / maxHp)
    db.prepare("UPDATE tender_progress SET hp = ?, battle_watermark = ? WHERE owner_key = ?").run(body.maxHp - 5, Date.now() - 20000, T.ownerKey);
    await call("getTerritory", {}, T.token);
    const darks = db.prepare("SELECT COUNT(*) AS c FROM homeland_wanderers WHERE owner_key = ?").get(T.ownerKey).c;
    const tenderHp = db.prepare("SELECT hp FROM tender_progress WHERE owner_key = ?").get(T.ownerKey)?.hp;
    const bystHp = db.prepare("SELECT hp FROM field_placements WHERE id = ?").get(bystPid)?.hp;
    return { darks, tenderHp, bystHp, maxHp: body.maxHp };
  };
  const H = await claimTender("Swallow Holder", 3800, "warden");
  const rh = await run(H, true);
  ok("the kill lands in the settled window (the 1-HP Fray falls to the standing Killer)", rh.darks === 0, JSON.stringify(rh));
  ok("Swallow the Heart: the Tender's body takes +1 from the kill (max − 5 → max − 4)", rh.tenderHp === rh.maxHp - 4, JSON.stringify(rh));
  ok("Swallow the Heart: a standing Awokin far from the blow takes +1 too (7 → 8) — the star names the tender's Awokin, not the killer alone",
    rh.bystHp === 8, JSON.stringify(rh));
  const C = await claimTender("Swallow Control", 3800, "warden");
  const rc = await run(C, false);
  ok("control: the same kill feeds no one (Tender stays at max − 5, the bystander at 7)",
    rc.darks === 0 && rc.tenderHp === rc.maxHp - 5 && rc.bystHp === 7, JSON.stringify(rc));
}

// ── The sampled strikes ──────────────────────────────────
// AC and the critical reach are dice laws; they are proven
// the way the house proves dice — many identical windows
// against a starless control run through the same windows,
// with margins set wide (the counts below sit ~2σ inside
// their expectations). Each "read" is one getTerritory
// settle whose watermark is rewound a hair — a single
// half-second sub-step of world — with the strike timers
// set LONG PAST in the ledger (never zero: the settle
// reads a zero timer as "never struck" and merely primes
// it). A past timer is due in that one sub-step, and its
// catch-up arithmetic lands it beyond the window, so
// every read deals exactly one bite / strike — no more.

// §2.9 TENDER AC — the bare Tender is bitten, or not.
{
  const run = async (T, starIds) => {
    grantStars(T.ownerKey, starIds);
    seedPatch(T.ownerKey, 2);
    const tileOf = (q, r) => db.prepare("SELECT id FROM territory_tiles WHERE owner_key = ? AND q = ? AND r = ?").get(T.ownerKey, q, r).id;
    await call("setTenderTile", { tileId: tileOf(0, 0) }, T.token);
    insertRow("homeland_wanderers", { owner_key: T.ownerKey, tile_id: tileOf(1, 0), kind: "fray", spawned_at: Date.now(), hp: 3, pos_q: 1, pos_r: 0, power: 1, lvl: 1 });
    let hits = 0;
    const N = 80;
    for (let i = 0; i < N; i++) {
      // The Tender's body is re-seated at 60 of its 70
      // before every read: a fallen Tender is bitten no
      // more, and an unwounded pool of 100000 is clamped
      // to the measure at the first settle — either would
      // end the sampling early and lie about the rate.
      // The Fray's own body is topped up too (it bleeds a
      // little standing on pure ground).
      db.prepare("UPDATE tender_progress SET hp = 60, down_until = NULL, battle_watermark = ? WHERE owner_key = ?").run(Date.now() - 100, T.ownerKey);
      db.prepare("UPDATE homeland_wanderers SET last_strike_at = ?, hp = 3 WHERE owner_key = ?").run(Date.now() - 60000, T.ownerKey);
      await call("getTerritory", {}, T.token);
      const hp1 = db.prepare("SELECT hp FROM tender_progress WHERE owner_key = ?").get(T.ownerKey).hp;
      if (hp1 < 60) hits++;
    }
    return hits;
  };
  const C = await claimTender("TenderAC Control", 3800, "warden");
  const cHits = await run(C, []);
  const H = await claimTender("TenderAC Holder", 3800, "warden");
  const hHits = await run(H, ["h2", "w_a1", "w_a3", "w_a6", "w_a12", "w_a16"]); // tenderAc 6 → AC 16
  ok("tender AC (sampled, 80 bites): the control at AC 10 is bitten at Fate's rate (~44 of 80)", cHits >= 33, `control ${cHits}`);
  ok("tender AC (sampled): the holder at AC 16 is bitten at the lowered rate (~20 of 80)", hHits <= 28, `holder ${hHits}`);
  ok("tender AC (sampled): the gap is the clause's, one way (expected ~22; the floor sits ~2.7σ below it)", cHits - hHits >= 6, `${cHits} vs ${hHits}`);
}

// §2.10 AWOKIN AC — the standing figure is bitten, or not.
{
  const run = async (T, starIds) => {
    grantStars(T.ownerKey, starIds);
    seedPatch(T.ownerKey, 2);
    const tileOf = (q, r) => db.prepare("SELECT id FROM territory_tiles WHERE owner_key = ? AND q = ? AND r = ?").get(T.ownerKey, q, r).id;
    const awId = seedAwokin(T.ownerKey, T.name, `${T.name} Victim`, "root", 1, 4); // toughness 12 → AC 12
    const pid = insertRow("field_placements", { owner_key: T.ownerKey, awakened_id: awId, tile_id: tileOf(0, 0), placed_at: Date.now(), last_moved_at: Date.now(), hp: 100000, shield: 0, shield_max: 0, pos_q: 0, pos_r: 0 });
    insertRow("homeland_wanderers", { owner_key: T.ownerKey, tile_id: tileOf(0, 0), kind: "fray", spawned_at: Date.now(), hp: 100000, pos_q: 0, pos_r: 0, power: 2, lvl: 1 });
    let hits = 0, lost = 0;
    const N = 96;
    for (let i = 0; i < N; i++) {
      const hp0 = db.prepare("SELECT hp FROM field_placements WHERE id = ?").get(pid).hp;
      db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now() - 100, T.ownerKey);
      db.prepare("UPDATE homeland_wanderers SET last_strike_at = ?, hp = 100000 WHERE owner_key = ?").run(Date.now() - 60000, T.ownerKey);
      db.prepare("UPDATE field_placements SET battle_next_at = 0 WHERE id = ?").run(pid);
      await call("getTerritory", {}, T.token);
      const hp1 = db.prepare("SELECT hp FROM field_placements WHERE id = ?").get(pid).hp;
      if (hp1 < hp0) { hits++; lost += hp0 - hp1; }
    }
    return { hits, lost };
  };
  const C = await claimTender("AwokinAC Control", 3800, "warden");
  const c = await run(C, []);
  const H = await claimTender("AwokinAC Holder", 3800, "warden");
  const h = await run(H, ["h7", "w_b1", "wi_b14"]); // awokinAc 1 + 2 + 2 = 5 → AC 17
  ok("Awokin AC (sampled, 96 bites): the control at AC 12 is bitten ~43 times", c.hits >= 33, `control ${c.hits}`);
  ok("Awokin AC (sampled): the holder at AC 17 is bitten ~19 times", h.hits <= 28, `holder ${h.hits}`);
  ok("Awokin AC (sampled): the blood tells the same story — the control loses far more", c.lost > h.lost * 1.3, `${c.lost} vs ${h.lost}`);
}

// §2.11 THE CRITICAL REACH — crit-tier harm, counted.
// A Sky figure with powerless parts strikes for at most
// 12 raw (3 × d4); mitigated against AC 11 that is 10 at
// the very ceiling. Any single strike past 10 is a
// critical's doubled dice — no other road reaches it.
{
  const run = async (T, starIds) => {
    grantStars(T.ownerKey, starIds);
    seedPatch(T.ownerKey, 2);
    const tileOf = (q, r) => db.prepare("SELECT id FROM territory_tiles WHERE owner_key = ? AND q = ? AND r = ?").get(T.ownerKey, q, r).id;
    const awId = seedAwokin(T.ownerKey, T.name, `${T.name} Striker`, "sky", 0, 4);
    const pid = insertRow("field_placements", { owner_key: T.ownerKey, awakened_id: awId, tile_id: tileOf(0, 0), placed_at: Date.now(), last_moved_at: Date.now(), hp: 100000, shield: 0, shield_max: 0, pos_q: 0, pos_r: 0 });
    insertRow("homeland_wanderers", { owner_key: T.ownerKey, tile_id: tileOf(0, 0), kind: "fray", spawned_at: Date.now(), hp: 100000, pos_q: 0, pos_r: 0, power: 1, lvl: 1 });
    let critTier = 0;
    const N = 170;
    for (let i = 0; i < N; i++) {
      db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now() - 100, T.ownerKey);
      db.prepare("UPDATE homeland_wanderers SET last_strike_at = ?, hp = 100000 WHERE owner_key = ?").run(Date.now() - 60000, T.ownerKey);
      // The striker's own timer is set at 1 — long past,
      // never zero (zero only primes it) — so exactly one
      // of its strikes lands in each window.
      db.prepare("UPDATE field_placements SET battle_next_at = 1 WHERE id = ?").run(pid);
      await call("getTerritory", {}, T.token);
      const hp = db.prepare("SELECT hp FROM homeland_wanderers WHERE owner_key = ?").get(T.ownerKey)?.hp ?? 100000;
      if (100000 - hp > 10) critTier++;
    }
    return critTier;
  };
  const C = await claimTender("Crit Control", 3800, "warden");
  const c = await run(C, []);
  const H = await claimTender("Crit Holder", 3800, "warden");
  const h = await run(H, ["r_b15"]); // critChance +2 → crits land on 18–20 (15%)
  ok("crit reach (sampled, 170 strikes): the control crits only on a natural 20 (~7 crit-tier strikes; the ceiling sits ~2.7σ out)", c <= 14, `control ${c}`);
  ok("crit reach (sampled): the holder crits on 18–20 (~19 crit-tier strikes)", h >= 11, `holder ${h}`);
  ok("crit reach (sampled): the holder's count stands clear of the control's", h > c, `${h} vs ${c}`);
}

// ── §3. THE TABLE ────────────────────────────────────────
console.log("§3 the Table doors");
const { issueTableToken } = await import("../server/dist/table.js");

// Per-part card seeding for the Table: the shared
// seedAwokin deals one measure to all three parts, but
// the Table proofs want their own — a shield card IS its
// toughness (the pool is toughness × the element die), a
// striking card is its parts' dice and nothing else.
function seedCard(ownerKey, tenderName, name, el, powers, toughs) {
  const nowT = Date.now();
  const cats = ["body", "arms", "head"];
  const parts = cats.map((cat, i) => {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)").run(`${name} ${cat}`, cat, powers[i], toughs[i], el, `zeffects/${name}-${cat}.png`, nowT).lastInsertRowid);
    return { source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: powers[i], toughness: toughs[i], element: el };
  });
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)").run(name, name, `zeffects/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
// A bench of owned fillers: a bound seat's purse is its
// roster's own reckoning (calculateMaxEnergy), so a deep
// bench is a deep purse — the casts below spend honestly.
const seedBench = (T, n) => { for (let i = 0; i < n; i++) seedAwokin(T.ownerKey, T.name, `${T.name} Bench ${i + 1}`, "sky", 2, 0); };

async function bindSeat(T) {
  const tt = issueTableToken({ id: `disc-zfx-${T.ownerKey.replace("tender:", "")}`, name: T.name });
  const bindCode = (await call("getTableBindCode", {}, T.token)).code;
  const res = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
  if (!res.ok) throw new Error(`table/bind failed for ${T.name}: ${res.status}`);
  return tt;
}

class TActor {
  constructor() { this.state = null; this.you = null; this.errors = []; this.taleSeen = 0; }
  async join(tt, room) {
    this.ws = new WebSocket("ws://127.0.0.1:39931/table/ws");
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data));
        if (m.type === "state") { this.state = m.state; this.you = m.you; }
        else if (m.type === "error") this.errors.push(String(m.message ?? ""));
      } catch { /* torn frame */ }
    };
    this.send({ type: "join", authToken: tt, room });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  get tale() { return (this.state?.tale ?? []).map((t) => (typeof t === "string" ? t : t?.text ?? "")); }
  newTales() { const t = this.tale; if (t.length < this.taleSeen) this.taleSeen = 0; const out = t.slice(this.taleSeen); this.taleSeen = t.length; return out; }
  async waitYou(what, ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { if (this.you) return; await sleep(120); } throw new Error("actor wait: " + what); }
}
async function watchRoom(room, name) {
  const W = { state: null };
  const ws = new WebSocket("ws://127.0.0.1:39931/table/ws");
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") W.state = m.state; } catch { /* torn frame */ } };
  ws.send(JSON.stringify({ type: "join", room, watch: true, name }));
  return W;
}
const until = async (fn, ms = 10000) => { const s = Date.now(); while (Date.now() - s < ms) { if (fn()) return true; await sleep(150); } return false; };

// The Table's own geometry, read off its lattice: tile
// centres ride the iso basis the referee reckons by
// (1292, 470) / (0, 948) at size 40 over 796.
const DIRS3 = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const parseAx3 = (id) => id.split(",").map(Number);
const axDist3 = (a, b) => { const [aq, ar] = parseAx3(a); const [bq, br] = parseAx3(b); return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(aq + ar - bq - br)); };
const neighbours3 = (id) => { const [q, r] = parseAx3(id); return DIRS3.map(([dq, dr]) => `${q + dq},${r + dr}`); };
const centreOf3 = (id) => { const [q, r] = parseAx3(id); const k = 40 / 796; return { x: q * 1292 * k, y: q * 470 * k + r * 948 * k }; };
const seatOf3 = (W, name) => (W.state?.players ?? []).find((p) => p.name === name) ?? null;
const unitOf3 = (W, name) => (W.state?.field ?? []).find((u) => u.name === name) ?? null;

// Cast the summon until the call lands (a faltered call
// spends and stands nothing — call again, as a player
// would).
async function summonLands(actor, W, awakenedId, name, tries = 24) {
  for (let i = 0; i < tries; i++) {
    if (unitOf3(W, name)) return true;
    actor.send({ type: "summonCast", awakenedId });
    if (await until(() => !!unitOf3(W, name), 3500)) return true;
  }
  return !!unitOf3(W, name);
}

// One step of the hunt: if the named unit stands and the
// nearest dark is beyond its striking reach (a hex, 69px),
// march it to the open neighbour of that dark's hex
// nearest itself. Marching is also how a unit leaves its
// party — the Return proof leans on exactly that law.
function huntStep(actor, W, unitName) {
  const st = W.state;
  const unit = st ? unitOf3(W, unitName) : null;
  const foes = st?.dark ?? [];
  if (!unit || !foes.length || unit.moving) return;
  let foe = null, bd = Infinity;
  for (const e of foes) { const d = Math.hypot(unit.pos.x - e.pos.x, unit.pos.y - e.pos.y); if (d < bd) { bd = d; foe = e; } }
  if (!foe || bd <= 70) return;
  const counts = new Map();
  for (const u of st.field ?? []) counts.set(u.hex, (counts.get(u.hex) ?? 0) + 1);
  const cands = neighbours3(foe.hex)
    .filter((h) => h !== "0,0" && h !== unit.hex && (counts.get(h) ?? 0) < 4)
    .sort((a, b) => axDist3(a, unit.hex) - axDist3(b, unit.hex));
  if (cands[0]) actor.send({ type: "march", cardId: unit.cardId, from: unit.hex, to: cands[0] });
}
async function hunt(actor, W, unitName, stop, budgetMs, onTick) {
  const t0 = Date.now();
  while (Date.now() - t0 < budgetMs) {
    const st = W.state;
    if (st) { if (onTick) onTick(st); if (stop(st)) return true; }
    huntStep(actor, W, unitName);
    await sleep(400);
  }
  return false;
}

// §3.1 THE SUMMON SHIELD AND THE SPREAD'S TALE — a Tide
// card of toughness 5 rolls 5d8 for its pool (never past
// 40); the holder's six shield-dice stars roll six more.
{
  const H = await claimTender("Table Shield Holder", 3800, "warden");
  const C = await claimTender("Table Shield Control", 3800, "warden");
  grantStars(H.ownerKey, ["w_b6", "w_b11", "wi_b4"]); // shieldDice 2 + 2 + 2 = 6
  for (const T of [H, C]) {
    seedBench(T, 25);
    T.awId = seedCard(T.ownerKey, T.name, `${T.name} Aegis`, "tide", [0, 0, 0], [5, 0, 0]);
    await call("addToParty", { awakenedId: T.awId }, T.token);
  }
  const room = "zfx-shield";
  const W = await watchRoom(room, "Shield Watcher");
  const sample = async (T) => {
    const a = new TActor(); await a.join(await bindSeat(T), room); await a.waitYou(`${T.name} seated`);
    let best = 0, seen = 0;
    for (let i = 0; i < 10; i++) {
      if (!await summonLands(a, W, T.awId, `${T.name} Aegis`, 8)) break;
      const u = unitOf3(W, `${T.name} Aegis`);
      if (u) { best = Math.max(best, u.shield); seen++; }
      a.send({ type: "recall", cardId: u?.cardId ?? `roster-${T.awId}` });
      await until(() => !unitOf3(W, `${T.name} Aegis`), 4000);
    }
    return { best, seen };
  };
  const rc = await sample(C);
  ok("control: ten summoned Tide shields all stand inside the parts' own pool (5d8 — never past 40)",
    rc.seen === 10 && rc.best <= 40 && rc.best >= 5, JSON.stringify(rc));
  const rh = await sample(H);
  ok("shield dice at the Table: the holder's pool rolls the parts' dice + 6 more (11d8) — a shield past the parts' ceiling (40) shows within ten summons",
    rh.seen === 10 && rh.best > 40, JSON.stringify(rh));
}
// The summon tale names the reckoning it rolled with —
// the clause rides it, beside the Spread's level grant.
{
  const H = await claimTender("Table Tale Holder", 150, "warden");
  const C = await claimTender("Table Tale Control", 150, "warden");
  grantStars(H.ownerKey, ["r_b7"]); // summoner +2
  for (const T of [H, C]) {
    seedBench(T, 6);
    T.awId = seedCard(T.ownerKey, T.name, `${T.name} Herald`, "sky", [2, 0, 0], [1, 0, 0]);
    await call("addToParty", { awakenedId: T.awId }, T.token);
  }
  const taleOf = async (T, room) => {
    const W = await watchRoom(room, `${T.name} Watcher`);
    const a = new TActor(); await a.join(await bindSeat(T), room); await a.waitYou(`${T.name} seated`);
    a.send({ type: "summonCast", awakenedId: T.awId });
    await until(() => a.tale.some((t) => /summoner's power/.test(t)), 9000);
    return a.tale.find((t) => /summoner's power/.test(t)) ?? "";
  };
  const th = await taleOf(H, "zfx-tale-h");
  ok("the tale names the clause: at Lv 3 the Spread grants no step yet, so the +2 standing there is the star's alone",
    /summoner's power \+2/.test(th), th);
  const tc = await taleOf(C, "zfx-tale-c");
  ok("control: the tale names +0 — no clause held, no level step at Lv 3", /summoner's power \+0/.test(tc), tc);
}

// §3.2 THE ATTUNE DOOR — one point spent, 1 + rate laid,
// on the landing ground the Table dealt.
{
  const H = await claimTender("Table Attune Holder", 3800, "warden");
  const C = await claimTender("Table Attune Control", 3800, "warden");
  grantStars(H.ownerKey, ["h1"]); // attunementRate +1
  for (const T of [H, C]) db.prepare("INSERT INTO aspect_attunement (owner_key, element, points, updated_at) VALUES (?, 'root', 25, ?)").run(T.ownerKey, Date.now());
  const room = "zfx-attune";
  const W = await watchRoom(room, "Attune Watcher");
  const run = async (T) => {
    const a = new TActor(); await a.join(await bindSeat(T), room); await a.waitYou(`${T.name} seated`);
    const landing = a.you.landing;
    a.send({ type: "attuneTile", hex: landing, element: "root" });
    await until(() => ((W.state?.map ?? []).find((t) => t.id === landing)?.points?.root ?? 0) > 0, 9000);
    const tile = (W.state?.map ?? []).find((t) => t.id === landing);
    const pool = db.prepare("SELECT points FROM aspect_attunement WHERE owner_key = ? AND element = 'root'").get(T.ownerKey)?.points;
    return { laid: tile?.points?.root ?? 0, pool };
  };
  const rc = await run(C);
  ok("control: one spend lays exactly 1 on the landing ground (the pool paid 25 → 24)", rc.laid === 1 && rc.pool === 24, JSON.stringify(rc));
  const rh = await run(H);
  ok("the rate at the Table: one spend lays 1 + the sum — 2 rest on the ground, the pool still paid exactly 1",
    rh.laid === 2 && rh.pool === 24, JSON.stringify(rh));
}

// §3.3 THE WARD'S HEALTH — the Seal's measure is the
// book's base plus the caster's level; the clause adds
// its sum on top. (The measure is read off the standing
// ward's maxHp: a ward on the curse's edge withers in hp,
// but the measure it was RAISED at never moves.)
{
  const H = await claimTender("Table Ward Holder", 3800, "warden");
  const C = await claimTender("Table Ward Control", 3800, "warden");
  grantStars(H.ownerKey, ["rim7", "w_a2"]); // wardHp 3 + 1 = 4
  for (const T of [H, C]) seedBench(T, 25);
  const room = "zfx-ward";
  const W = await watchRoom(room, "Ward Watcher");
  const cast = async (T) => {
    const a = new TActor(); await a.join(await bindSeat(T), room); await a.waitYou(`${T.name} seated`);
    const seatKey = seatOf3(W, T.name)?.key;
    const landing = a.you.landing;
    const mine = () => (W.state?.workings ?? []).filter((w) => w.kind === "ward" && w.root === "seal" && w.ownerKey === seatKey);
    for (const nb of neighbours3(landing)) {
      for (let tries = 0; tries < 14; tries++) {
        const before = mine().length;
        const errAt = a.errors.length;
        a.send({ type: "castWard", root: "seal", hexA: landing, hexB: nb });
        if (await until(() => mine().length > before, 2200)) return mine()[mine().length - 1];
        if (a.errors.slice(errAt).some((e) => /already stands/.test(e))) break; // the edge is taken — try the next
      }
    }
    return null;
  };
  const wc = await cast(C);
  ok("control: the Seal is raised at the book's reckoning — base 6 + the caster's Lv 10 = 16",
    !!wc && wc.maxHp === 16 && wc.hp <= 16 && wc.hp > 13, JSON.stringify(wc && { hp: wc.hp, maxHp: wc.maxHp }));
  const wh = await cast(H);
  ok("ward HP: the holder's Seal is raised 4 deeper — 20, the clause's sum exactly",
    !!wh && wh.maxHp === 20 && wh.hp <= 20 && wh.hp > 17, JSON.stringify(wh && { hp: wh.hp, maxHp: wh.maxHp }));
}

// §3.4 THE RUNE'S DAMAGE — the Single Blade's power is
// written into the standing rune's own numbers at the
// cast; the clause deepens the writing.
{
  const H = await claimTender("Table Rune Holder", 3800, "runewright");
  const C = await claimTender("Table Rune Control", 3800, "runewright");
  grantStars(H.ownerKey, ["rim6", "r_a2"]); // runeDamage 3 + 1 = 4
  for (const T of [H, C]) seedBench(T, 25);
  const room = "zfx-rune";
  const W = await watchRoom(room, "Rune Watcher");
  const cast = async (T, salt) => {
    const a = new TActor(); await a.join(await bindSeat(T), room); await a.waitYou(`${T.name} seated`);
    const seatKey = seatOf3(W, T.name)?.key;
    const mine = () => (W.state?.workings ?? []).filter((w) => w.kind === "rune" && w.root === "blade" && w.ownerKey === seatKey);
    const ground = (W.state?.map ?? []).filter((t) => axDist3(t.id, "0,0") === 4 && t.id !== a.you.landing);
    const hex = ground[(salt * 7) % ground.length]?.id;
    for (let tries = 0; tries < 20; tries++) {
      const before = mine().length;
      a.send({ type: "castRune", root: "blade", hexes: [hex] });
      if (await until(() => mine().length > before, 2200)) return mine()[mine().length - 1];
    }
    return null;
  };
  const rc2 = await cast(C, 1);
  ok("control: the Blade stands written at the book's power (6)", !!rc2 && rc2.nums?.power === 6, JSON.stringify(rc2 && { power: rc2.nums?.power }));
  const rh2 = await cast(H, 2);
  ok("rune damage: the holder's Blade stands written 4 deeper — power 10, snapshotted at the cast",
    !!rh2 && rh2.nums?.power === 10, JSON.stringify(rh2 && { power: rh2.nums?.power }));
}

// §3.5 MISCAS​T MERCY — the Star Engine's page costs 4✦;
// a fizzle spends it whole for the control, and spends
// 3 of it for the holder: a quarter of the price returns.
{
  const run = async (T, withStar, room) => {
    if (withStar) grantStars(T.ownerKey, ["wi_a2"]); // mercy 25%
    seedBench(T, 25);
    const W = await watchRoom(room, `${T.name} Watcher`);
    const a = new TActor(); await a.join(await bindSeat(T), room); await a.waitYou(`${T.name} seated`);
    const edges = [];
    for (const t of W.state?.map ?? []) for (const nb of neighbours3(t.id)) edges.push([t.id, nb]);
    let ei = 0;
    for (let attempt = 0; attempt < 48; attempt++) {
      const standing = new Set((W.state?.workings ?? []).filter((w) => w.kind === "ward").map((w) => [w.hexA, w.hexB].sort().join("|")));
      let edge = null;
      while (ei < edges.length) { const e = edges[ei++]; if (!standing.has([...e].sort().join("|"))) { edge = e; break; } }
      if (!edge) return { fizzle: false, drop: null, tales: a.tale };
      const before = a.you?.energy ?? 0;
      const wBefore = (W.state?.workings ?? []).length;
      a.send({ type: "castWard", root: "engine", hexA: edge[0], hexB: edge[1] });
      await until(() => (a.you?.energy ?? before) !== before || (W.state?.workings ?? []).length !== wBefore, 2600);
      const after = a.you?.energy ?? before;
      const wAfter = (W.state?.workings ?? []).length;
      if (after < before && wAfter === wBefore) return { fizzle: true, drop: before - after, tales: a.tale }; // spent, and nothing stands: the cast unravelled
    }
    return { fizzle: false, drop: null, tales: a.tale };
  };
  const C = await claimTender("Table Mercy Control", 3800, "warden");
  const rc3 = await run(C, false, "zfx-mercy-c");
  ok("control: a fizzle spends the Engine's whole price (✦4) and nothing returns",
    rc3.fizzle && rc3.drop === 4 && !rc3.tales.some((t) => /Mercy rides/.test(t)), JSON.stringify({ fizzle: rc3.fizzle, drop: rc3.drop }));
  const H = await claimTender("Table Mercy Holder", 3800, "warden");
  const rh3 = await run(H, true, "zfx-mercy-h");
  ok("mercy at the Table: the holder's fizzle spends ✦3 of the ✦4 — the quarter returns, and the tale names it",
    rh3.fizzle && rh3.drop === 3 && rh3.tales.some((t) => /Mercy rides .*unravelled cast — ✦1 of the spent price returns/.test(t)),
    JSON.stringify({ fizzle: rh3.fizzle, drop: rh3.drop }));
}

// §3.6 RETURN — a fielded Awokin under orders stands
// OUTSIDE its Tender's party (the march law). When the
// battle ends it truly dissipates — unless the wheel's
// Return carries it home whole.
{
  const run = async (T, withStar, room) => {
    if (withStar) grantStars(T.ownerKey, ["h9"]); // returnHome +1
    seedBench(T, 10);
    const awId = seedCard(T.ownerKey, T.name, `${T.name} Stone`, "stone", [0, 0, 0], [10, 10, 10]);
    await call("addToParty", { awakenedId: awId }, T.token);
    const W = await watchRoom(room, `${T.name} Watcher`);
    const a = new TActor(); await a.join(await bindSeat(T), room); await a.waitYou(`${T.name} seated`);
    await summonLands(a, W, awId, `${T.name} Stone`);
    const u0 = unitOf3(W, `${T.name} Stone`);
    const dest = neighbours3(u0.hex).find((h) => h !== "0,0" && h !== u0.hex);
    a.send({ type: "march", cardId: u0.cardId, from: u0.hex, to: dest });
    await until(() => { const u = unitOf3(W, `${T.name} Stone`); return !!u && !u.moving && u.hex === dest; }, 25000);
    // The departure is read off the Tender's own view,
    // waited for: her "you" frame lands a breath after
    // the watcher sees the march done, and a stale frame
    // still shows the party whole — reading it early
    // makes a carried-home Awokin look like it never left.
    await until(() => !(a.you?.party ?? []).includes(awId), 10000);
    const inParty = (a.you?.party ?? []).includes(awId);
    a.send({ type: "startWave" });
    await until(() => !!W.state?.battle?.active, 9000);
    await hunt(a, W, `${T.name} Stone`, (st) => !st.battle.active && (st.dark ?? []).length === 0, 240000);
    // The ending's tale can land a breath after the state
    // flag settles — wait for this room's own ending word
    // before reading the ledger, rather than sleeping a
    // fixed breath and racing it.
    await until(() => a.tale.some((t) => withStar ? /the wheel's Return carries it home whole/.test(t) : /truly dissipates/.test(t)), 15000);
    const d = db.prepare("SELECT dispersed_until AS d FROM awakened WHERE id = ?").get(awId)?.d ?? null;
    return { d, inParty, tales: a.tale };
  };
  const C = await claimTender("Table Return Control", 3800, "warden");
  const rc = await run(C, false, "zfx-return-c");
  ok("the march law stands in both rooms: the ordered Awokin left its party before the wave",
    rc.inParty === false);
  ok("control: the battle over, the non-party Awoken truly dissipates — four hours written in the ledger, the tale plain",
    rc.d != null && Math.abs(rc.d - (Date.now() + 4 * 3600 * 1000)) < 15 * 60 * 1000
    && rc.tales.some((t) => /truly dissipates/.test(t)), JSON.stringify({ d: rc.d }));
  const H = await claimTender("Table Return Holder", 3800, "warden");
  const rh = await run(H, true, "zfx-return-h");
  ok("Return at the Table: the holder's non-party Awoken is carried home whole — no timer written, the tale names the wheel's Return",
    rh.inParty === false && rh.d == null
    && rh.tales.some((t) => /the wheel's Return carries it home whole/.test(t)), JSON.stringify({ d: rh.d }));
}

// §3.7 SWALLOW THE HEART — the Tender withers a little
// on deep cursed ground, then her Awokin makes a kill:
// her body takes the star's +1 at the kill. The control's
// kill feeds no one.
{
  const run = async (T, withStar, room) => {
    if (withStar) grantStars(T.ownerKey, ["s_a2"]); // hpOnKill +1
    seedBench(T, 10);
    const awId = seedCard(T.ownerKey, T.name, `${T.name} Stone`, "stone", [0, 0, 0], [10, 10, 10]);
    await call("addToParty", { awakenedId: awId }, T.token);
    const W = await watchRoom(room, `${T.name} Watcher`);
    const a = new TActor(); await a.join(await bindSeat(T), room); await a.waitYou(`${T.name} seated`);
    // Wither: glide out to a ring-6 cursed tile and stand
    // in the curse until her body has paid at least 2.
    const landing = a.you.landing;
    const deep = (W.state?.map ?? []).filter((t) => t.cursed && axDist3(t.id, "0,0") === 6)[0];
    const dc = centreOf3(deep.id);
    a.send({ type: "glide", tx: dc.x, ty: dc.y });
    await until(() => !!a.you && a.you.tenderHp <= a.you.maxTenderHp - 2, 45000);
    const home = centreOf3(landing);
    a.send({ type: "glide", tx: home.x, ty: home.y });
    await until(() => seatOf3(W, T.name)?.hex === landing, 25000);
    await sleep(1300); // pure ground: the withering stops; what is gone stays gone
    await summonLands(a, W, awId, `${T.name} Stone`);
    a.send({ type: "startWave" });
    await until(() => (W.state?.dark ?? []).length > 0, 9000);
    const darkWas = (W.state?.dark ?? []).length;
    let hpBefore = a.you?.tenderHp ?? 0;
    await hunt(a, W, `${T.name} Stone`, (st) => (st.dark ?? []).length < darkWas, 180000,
      () => { if ((W.state?.dark ?? []).length >= darkWas) hpBefore = a.you?.tenderHp ?? hpBefore; });
    let hpAfter = hpBefore;
    for (let i = 0; i < 8; i++) { hpAfter = Math.max(hpAfter, a.you?.tenderHp ?? hpAfter); await sleep(200); }
    return { hpBefore, hpAfter, tales: a.tale };
  };
  const C = await claimTender("Table Swallow Control", 3800, "warden");
  const rc = await run(C, false, "zfx-swallow-c");
  ok("control: the kill lands and the Tender's body does not rise — no tale, no feeding",
    rc.hpAfter <= rc.hpBefore + 0.01 && !rc.tales.some((t) => /Swallow the Heart/.test(t)),
    JSON.stringify({ before: rc.hpBefore, after: rc.hpAfter }));
  const H = await claimTender("Table Swallow Holder", 3800, "warden");
  const rh = await run(H, true, "zfx-swallow-h");
  ok("Swallow the Heart at the Table: at her Awokin's kill the withered Tender takes +1, and the tale names the feeding",
    rh.hpAfter >= rh.hpBefore + 0.9 && rh.tales.some((t) => /Swallow the Heart — the kill feeds/.test(t)),
    JSON.stringify({ before: rh.hpBefore, after: rh.hpAfter }));
}

// §3.8 REGENERATION — the wounded knit on the beat. The
// wound is taken from the curse itself, not from the
// dark's dice: a Root Awokin (body 6) marches out to a
// ring-6 cursed tile and stands in the withering — the
// curse pays a ring's share of its measure every beat,
// shield first, a steady fractional burn with no narrow
// band where the wound hides between one bite and death.
// (Its card power is 0, so its standing grinds nothing
// back — the tile stays cursed and the burn never stops.)
// It soaks until its body is cut by 2 or the soak has run
// its course — the holder's regen outpaces the curse, so
// her wound stays shallow and the soak ends by the clock —
// then it marches home and its body is watched on the
// road and at rest on pure ground: the holder's climbs
// by the clause back to whole, the control's never
// rises at all.
{
  const run = async (T, withStar, room) => {
    if (withStar) grantStars(T.ownerKey, ["h4", "w_b13", "wi_b6"]); // awokinRegen 1 + 2 + 2 = 5
    seedBench(T, 10);
    const awId = seedCard(T.ownerKey, T.name, `${T.name} Rootkin`, "root", [0, 0, 0], [2, 2, 2]);
    await call("addToParty", { awakenedId: awId }, T.token);
    const W = await watchRoom(room, `${T.name} Watcher`);
    const a = new TActor(); await a.join(await bindSeat(T), room); await a.waitYou(`${T.name} seated`);
    await summonLands(a, W, awId, `${T.name} Rootkin`);
    a.send({ type: "startWave" });
    let minHp = null, soakFrom = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 300000) {
      const st = W.state;
      const u = st ? unitOf3(W, `${T.name} Rootkin`) : null;
      if (!u) { // unbound whole on the road — call it again and send it back out
        if (st && !st.battle.active) a.send({ type: "startWave" });
        await summonLands(a, W, awId, `${T.name} Rootkin`, 6);
        await sleep(400); continue;
      }
      if (u.hp < u.maxHp) {
        minHp = minHp == null ? u.hp : Math.min(minHp, u.hp);
        soakFrom ??= Date.now();
      }
      if (minHp != null && (minHp <= 4 || Date.now() - soakFrom > 36000)) break; // soaked deep enough, or long enough
      if (st && !st.battle.active) { a.send({ type: "startWave" }); await sleep(800); continue; }
      const deep = (st?.map ?? []).filter((t) => t.cursed && axDist3(t.id, "0,0") === 6)[0];
      if (deep && !u.moving && u.hex !== deep.id) a.send({ type: "march", cardId: u.cardId, from: u.hex, to: deep.id });
      await sleep(300);
    }
    let maxAfter = minHp;
    if (minHp != null) {
      // The watch is spent walking home and standing on
      // PURE ground: on cursed ground the withering's
      // micro-ticks shave the body a hair below whole in
      // the same breath the regen tops it, so wholeness
      // can only ever be SEEN where the curse does not
      // reach. The window runs long enough for the march
      // home from the rim and a beat or two at rest.
      const landing = a.you?.landing;
      const t1 = Date.now();
      while (Date.now() - t1 < 34000) {
        const st = W.state;
        if (st && !st.battle.active) a.send({ type: "startWave" });
        const u = unitOf3(W, `${T.name} Rootkin`);
        if (u) {
          maxAfter = Math.max(maxAfter ?? 0, u.hp);
          if (!u.moving && landing && u.hex !== landing) a.send({ type: "march", cardId: u.cardId, from: u.hex, to: landing });
        }
        await sleep(300);
      }
    }
    return { woundedAt: minHp, maxAfter };
  };
  const C = await claimTender("Table Regen Control", 3800, "warden");
  const rc = await run(C, false, "zfx-regen-c");
  ok("control: the Rootkin was wounded in the withering (its body cut below its measure)",
    rc.woundedAt != null && rc.woundedAt < 6, JSON.stringify(rc));
  ok("control: unwatched by any star, the wounded body never rises on the road home or at rest",
    rc.maxAfter != null && rc.maxAfter <= (rc.woundedAt ?? 0), JSON.stringify(rc));
  const H = await claimTender("Table Regen Holder", 3800, "warden");
  const rh = await run(H, true, "zfx-regen-h");
  ok("regen at the Table: the holder's wounded Rootkin knits its 5 a beat and stands whole again (6) inside the window",
    rh.woundedAt != null && rh.maxAfter === 6, JSON.stringify(rh));
}

// §3.9 THE CRITICAL REACH AND ITS DEEPENING — no star on
// the wheel carries critDamage, so the Starwright writes
// one for this proof (the workshop's own door), on a star
// no pass of this build seeds. The holder crits on
// 18–20; a deepened crit (scale 2) breaks the plain
// critical's ceiling — 59, the most 6d12 mitigated
// against the Fray's AC 11 can ever pay. The strikers are
// two Stone Hammers that HUNT — and hunting is marching,
// and a marched Awokin stands outside its party, so when
// a wave is felled the battle's end would dissipate them
// for four hours and starve the proof. Both Tenders
// therefore also hold the wheel's Return (three saves):
// each ending carries the Hammers home whole, and they
// are summoned again for the next wave. (A parked Hammer
// starves instead: the dealt dark settles on the seed's
// ring and chews the light, out of a standing Hammer's
// reach — the hunt is the only road that keeps strikes
// flowing.) Each room keeps its OWN deadline: the
// holder's early success must never cut the control's
// sampling short. The control crits only on a natural
// twenty, and never past 59.
{
  const unlockRes = await fetch(`${BASE}/api/workshop/unlock`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "<MASKED_SECRET_001>" }) });
  const unlock = await unlockRes.json().catch(() => ({}));
  ok("the workshop opens to the Starwright", typeof unlock.token === "string" && unlock.token.length > 0, `status ${unlockRes.status}`);
  const wsHead = { "x-workshop-token": unlock.token };
  const g = await call("getZodiacGraph", {}, null, wsHead);
  const node = (g.graph?.nodes ?? []).find((n) => n.id === "w_b7");
  ok("w_b7 stands on the wheel unwritten — no pass of this build seeds it", !!node && (node.fx ?? []).length === 0, JSON.stringify(node?.fx));
  const saved = await call("saveZodiacNode", { node: { ...node, fx: [{ verb: "critDamage", amount: 4, el: null }] } }, null, wsHead);
  ok("the Starwright's clause stands written: critDamage 4 on w_b7",
    saved.ok === true && (saved.node?.fx ?? []).some((c) => c.verb === "critDamage" && c.amount === 4), JSON.stringify(saved.node?.fx));

  const parseCrits = (T, actor, crits) => {
    let kills = 0;
    for (const t of actor.newTales()) {
      if (!t.includes(`${T.name} Hammer`)) continue;
      let m = t.match(/lands critical on a (\d+) — the blow lands true and terrible \((\d+)\)/);
      if (m) { crits.push({ roll: Number(m[1]), dmg: Number(m[2]) }); continue; }
      m = t.match(/natural twenty — the blow lands true and terrible \((\d+)\)/);
      if (m) { crits.push({ roll: 20, dmg: Number(m[1]) }); continue; }
      if (/unravels the/.test(t)) kills++;
    }
    return kills;
  };
  const critRun = async (T, withFx, room) => {
    seedBench(T, 10);
    const hammers = [];
    for (const tag of ["A", "B"]) {
      const id = seedCard(T.ownerKey, T.name, `${T.name} Hammer ${tag}`, "stone", [0, 0, 0], [10, 10, 10]);
      try { await call("addToParty", { awakenedId: id }, T.token); hammers.push({ id, name: `${T.name} Hammer ${tag}` }); } catch { /* the party is full — the Hammer that joined carries the proof */ }
    }
    const W = await watchRoom(room, `${T.name} Watcher`);
    const a = new TActor(); await a.join(await bindSeat(T), room); await a.waitYou(`${T.name} seated`);
    for (const h of hammers) await summonLands(a, W, h.id, h.name);
    a.send({ type: "startWave" });
    const crits = []; let kills = 0;
    const stopAt = Date.now() + 300000; // this room's own deadline
    while (Date.now() < stopAt) {
      kills += parseCrits(T, a, crits);
      if (withFx && crits.some((c) => (c.roll === 18 || c.roll === 19) && c.dmg >= 60)) break;
      if (!withFx && kills >= 1 && crits.length >= 1) break; // the control's proof is complete: it fought, felled, and crit
      const st = W.state;
      if (st && !st.battle.active) {
        // The ending has spoken: the wheel's Return has
        // carried the marched-out Hammers home whole (no
        // timer), so they can simply be called again.
        await sleep(1200);
        for (const h of hammers) if (!unitOf3(W, h.name)) await summonLands(a, W, h.id, h.name, 6);
        a.send({ type: "startWave" });
        await sleep(800);
        continue;
      }
      for (const h of hammers) huntStep(a, W, h.name);
      await sleep(300);
    }
    kills += parseCrits(T, a, crits);
    return { crits, kills };
  };
  const H = await claimTender("Table Crit Holder", 3800, "warden");
  const C = await claimTender("Table Crit Control", 3800, "warden");
  grantStars(H.ownerKey, ["r_b15", "w_b7", "h9", "b_b1"]); // critChance +2, the Starwright's critDamage 4, Return 1 + 2 = 3
  grantStars(C.ownerKey, ["h9", "b_b1"]); // Return alone — the road home is not the reach
  const [rh4, rc4] = await Promise.all([critRun(H, true, "zfx-crit-h"), critRun(C, false, "zfx-crit-c")]);
  ok("the clause sums stand behind the proof (critChance 2, critDamage 4 by the Starwright's writing; Return 3 on both sides)",
    fxSum(H.ownerKey, "critChance") === 2 && fxSum(H.ownerKey, "critDamage") === 4 && fxSum(C.ownerKey, "critChance") === 0
    && fxSum(H.ownerKey, "returnHome") === 3 && fxSum(C.ownerKey, "returnHome") === 3,
    JSON.stringify({ cc: fxSum(H.ownerKey, "critChance"), cd: fxSum(H.ownerKey, "critDamage") }));
  ok("crit reach: the holder's Hammer crits on a 19 or 18 — a threshold no natural-twenty law allows — and the deepened blow breaks the plain ceiling (60+ against a plain crit's best 59)",
    rh4.crits.some((c) => (c.roll === 18 || c.roll === 19) && c.dmg >= 60),
    JSON.stringify(rh4.crits.slice(0, 8)));
  ok("control: the Hammer fought and felled (its strikes were real), and it did crit — on natural twenties only",
    rc4.kills >= 1 && rc4.crits.length >= 1 && rc4.crits.every((c) => c.roll === 20),
    JSON.stringify({ kills: rc4.kills, crits: rc4.crits.slice(0, 8) }));
  ok("control: no plain critical ever breaks the ceiling — every one pays 59 or less",
    rc4.crits.every((c) => c.dmg <= 59), JSON.stringify(rc4.crits.slice(0, 8)));
}

console.log(`\nZODIAC EFFECTS DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
