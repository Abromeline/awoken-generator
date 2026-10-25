// STUDY DEEPENS THE CLASS OF ITS HOUSE — THE DRIVE
// (Nigel's ruling, 2026-10-25 12:39: "study should effect
// the class skill of the class the skill housed in. that
// is how multiclass characters are tailored"; commissioned
// the same day: "impliment it make it so #1 make it real
// GO"). Until this build the 19 Study stars' sums accrued
// and no reader acted — their faces still promised a
// school the choosing no longer holds. This drive proves,
// against controls, on both grounds:
//
//   §0 THE STUDY-TEXT PASS — a world saved BEFORE this
//      build (a v3 graph whose study stars carry the old
//      school faces, both fx passes already stamped) gains
//      the nineteen stars' new faces from the seed, once,
//      under the study-text stamp — clauses untouched, a
//      Starwright's words on another star untouched.
//   §1 THE HOUSES — attribution read off the served
//      placement: road stars by their pathway; the Heart
//      door h8 by the road it opens (Runewright); the
//      rim's Study Circle (rim8) in NO house, deepening
//      nothing; the Binder's house holding no Study star
//      at all. Depths pinned per house.
//   §2 THE READERS MOVE — the class gifts' own readers:
//      own-house study deepens the holder's own class
//      skill; foreign-house study BUILDS that class's
//      skill in a tender of another class; study in house
//      A leaves house B's skills untouched; and a
//      zero-Study tender of every class reads byte-for-
//      byte the standing bases.
//   §3 THE HOMELAND POINT OF USE — homelandVictimAcFor,
//      the reckoning the settle itself reads, plus the
//      bite sample: a Binder's Awokin stands at AC 12;
//      with Warden-house study it stands at 14, and the
//      Fray's teeth agree.
//   §4 THE TABLE POINT OF USE — the summon tale names the
//      reckoning it rolled with: a Warden whose study
//      stands in the Sage's house rolls at +4 where her
//      control rolls at +0; a Sage's own-house study
//      deepens her gift (+3) to +5.
//   §5 THE FACES AS SERVED — the skill tree a tender is
//      actually shown carries the new words and none of
//      the struck school's.
// Run: node scripts/drive-study-houses.mjs
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-study-houses-"));
process.env.PORT = "39937";
process.env.WORKSHOP_PASSWORD = ["study", "houses", "pass"].join("-");
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;
process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39937";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

const STUDY_IDS = ["h8", "r_a13", "r_a6", "r_a9", "r_b11", "r_b5", "rim8", "s_b11", "s_b2", "s_b6", "w_a10", "w_a4", "wi_a1", "wi_a12", "wi_a16", "wi_a5", "wi_a9", "wi_b10", "wi_b16"];
const OLD_FACE = "to casting in one school of the tender's choice";

// ── §0 pre-seed: a world saved BEFORE this build ───────
// Its wheel is the current writing (v3) with its clauses
// whole and BOTH fx passes already stamped — but the
// nineteen study stars still wear the struck school's
// faces, as a saved world stands today, and one unstudied
// star (wi_b5) carries a Starwright's own effect words
// that must survive. The seed graph the pre-seed is built
// from is read out of the built server itself, in a
// throwaway world, so the clauses are the seed's own.
const seedWorldDir = mkdtempSync(join(tmpdir(), "awoken-study-seed-"));
const seedGraphData = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e",
  `const { zodiacGraph } = await import(${JSON.stringify(new URL("../server/dist/zodiacLive.js", import.meta.url).href)}); process.stdout.write(JSON.stringify(zodiacGraph()));`],
  { env: { ...process.env, DATA_DIR: seedWorldDir }, maxBuffer: 64 * 1024 * 1024 }).toString());
const seedFxById = new Map(seedGraphData.nodes.map((n) => [n.id, n.fx ?? []]));
{
  const pre = new Database(join(process.env.DATA_DIR, "app.db"));
  pre.exec(`CREATE TABLE tender_skills (owner_key TEXT NOT NULL, skill_key TEXT NOT NULL, pool TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (owner_key, skill_key));
            CREATE TABLE ui_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);`);
  const grantN = { h8: 1, r_a13: 1, r_a6: 1, r_a9: 1, r_b11: 2, r_b5: 2, rim8: 3, s_b11: 2, s_b2: 2, s_b6: 2, w_a10: 1, w_a4: 1, wi_a1: 1, wi_a12: 1, wi_a16: 1, wi_a5: 1, wi_a9: 1, wi_b10: 2, wi_b16: 2 };
  const nodes = seedGraphData.nodes.map((n) => {
    if (STUDY_IDS.includes(n.id)) {
      return { ...n, effect: `Study: +1 ${OLD_FACE}`, grant: `Study: +${grantN[n.id]} ${OLD_FACE}` };
    }
    if (n.id === "wi_b5") return { ...n, fx: [{ verb: "tenderHp", amount: 7, el: null }], effect: "A Starwright's own words, written by hand" };
    return { ...n };
  });
  const ins = pre.prepare("INSERT INTO ui_config (key, value, updated_at) VALUES (?, ?, 1)");
  ins.run("zodiac.graph", JSON.stringify({ nodes, edges: seedGraphData.edges, v: 3 }));
  ins.run("zodiac.wheelVersion", "3");
  ins.run("zodiac.partyFxPass", "party-fx-2026-10-22");
  ins.run("zodiac.effectsFxPass", "effects-fx-2026-10-23");
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

// ── §0. THE STUDY-TEXT PASS ─────────────────────────────
console.log("§0 the study-text pass");
{
  const probe = await call("claimTender", { password: "study-houses-password", tenderName: "Pass Probe" });
  await call("getSkillTree", {}, probe.token); // one graph read runs the pass
  const { ZODIAC_NODES } = await import("../server/dist/zodiacData.js");
  const seedById = new Map(ZODIAC_NODES.map((n) => [n.id, n]));
  const graphRow = db.prepare("SELECT value FROM ui_config WHERE key = 'zodiac.graph'").get();
  const graph = graphRow ? JSON.parse(graphRow.value) : null;
  const byId = new Map((graph?.nodes ?? []).map((n) => [n.id, n]));
  ok("the saved wheel stands whole (194 stars, v3)", !!graph && graph.v === 3 && graph.nodes.length === 194, graph ? `v=${graph.v} n=${graph.nodes.length}` : "no graph");
  const bad = STUDY_IDS.filter((id) => byId.get(id)?.effect !== seedById.get(id)?.effect || byId.get(id)?.grant !== seedById.get(id)?.grant);
  ok("THE PASS: all nineteen study stars gained the seed's new faces (the house law, no school anywhere)", bad.length === 0, bad.join(","));
  ok("no study face in the served wheel names the struck school", STUDY_IDS.every((id) => !String(byId.get(id)?.effect ?? "").includes("school") && !String(byId.get(id)?.grant ?? "").includes("school")));
  ok("THE PASS IS TEXT ONLY: the study stars' clauses stand exactly as the seed wrote them, untouched by the pass",
    STUDY_IDS.every((id) => JSON.stringify(byId.get(id)?.fx ?? []) === JSON.stringify(seedFxById.get(id) ?? [])),
    STUDY_IDS.filter((id) => JSON.stringify(byId.get(id)?.fx ?? []) !== JSON.stringify(seedFxById.get(id) ?? [])).join(","));
  ok("THE PASS IS SURGICAL: the Starwright's own words on wi_b5 stand untouched, clause and all",
    byId.get("wi_b5")?.effect === "A Starwright's own words, written by hand" && JSON.stringify(byId.get("wi_b5")?.fx) === JSON.stringify([{ verb: "tenderHp", amount: 7, el: null }]),
    JSON.stringify(byId.get("wi_b5")));
  ok("the rim's honesty stands in its face: the Study Circle's grant names the rim as no class's house",
    /no class's house/.test(byId.get("rim8")?.grant ?? ""), byId.get("rim8")?.grant);
  const stamp = db.prepare("SELECT value FROM ui_config WHERE key = 'zodiac.studyTextPass'").get()?.value;
  ok("the study-text pass stands stamped (study-text-2026-10-25), so it never runs twice", stamp === "study-text-2026-10-25", String(stamp));
}

// ── shared fixtures ─────────────────────────────────────
async function claimTender(name, exp, classKey) {
  const claim = await call("claimTender", { password: "study-houses-password", tenderName: name });
  const token = claim.token;
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, exp, Date.now());
  if (classKey) {
    for (let i = 1; i <= 3; i++) seedAwokin(ownerKey, name, `${name} First ${i}`, "root", 1, 1);
    await call("chooseClass", { classKey }, token);
  }
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
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)").run(`${name} ${cat}`, cat, partPower, partToughness, el, `study/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: partPower, toughness: partToughness, element: el });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)").run(name, name, `study/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
const insertRow = (table, vals) => {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  const keys = Object.keys(vals).filter((k) => cols.includes(k));
  return Number(db.prepare(`INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`).run(...keys.map((k) => vals[k])).lastInsertRowid);
};
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

// ── §1. THE HOUSES AND THE DEPTHS ───────────────────────
console.log("§1 the houses — attribution and depth");
const { studyDepthFor, companyAcBonusFor, companyAttackBonusFor, bindingHealBonusFor, curseReliefFor, summonersPowerFor } = await import("../server/dist/skills.js");
const HOUSES = ["warden", "runewright", "binder", "witch", "sage"];
{
  const ALL = await claimTender("Every Star Holder", 3800, "warden");
  grantStars(ALL.ownerKey, STUDY_IDS);
  ok("a holder of all nineteen stands deepest where the wheel is deepest: Runewright 8 (the door's 1, three a-stars' 1s, two b-stars' 2s)",
    studyDepthFor(ALL.ownerKey, "runewright") === 8, String(studyDepthFor(ALL.ownerKey, "runewright")));
  ok("the Witch's house sums 9 (five a-stars at 1, two b-stars at 2)", studyDepthFor(ALL.ownerKey, "witch") === 9, String(studyDepthFor(ALL.ownerKey, "witch")));
  ok("the Sage's house sums 6 (three b-stars at 2)", studyDepthFor(ALL.ownerKey, "sage") === 6, String(studyDepthFor(ALL.ownerKey, "sage")));
  ok("the Warden's house sums 2 (two a-stars at 1)", studyDepthFor(ALL.ownerKey, "warden") === 2, String(studyDepthFor(ALL.ownerKey, "warden")));
  ok("the Binder's house sums 0 — NO Study star stands in it on the wheel as placed; the zero is the placement's, not the reader's",
    studyDepthFor(ALL.ownerKey, "binder") === 0);
  const RIM = await claimTender("Rim Holder", 3800, "sage");
  grantStars(RIM.ownerKey, ["rim8"]);
  ok("the Study Circle alone deepens NOTHING: the rim stands in no house, and rim8's +3 accrues to no class",
    HOUSES.every((h) => studyDepthFor(RIM.ownerKey, h) === 0),
    HOUSES.map((h) => `${h}=${studyDepthFor(RIM.ownerKey, h)}`).join(" "));
  const DOOR = await claimTender("Door Holder", 3800, "binder");
  grantStars(DOOR.ownerKey, ["h8"]);
  ok("the Runewright's Door stands in the Runewright's house: h8 alone gives Runewright depth 1 and no other house anything",
    studyDepthFor(DOOR.ownerKey, "runewright") === 1 && HOUSES.filter((h) => h !== "runewright").every((h) => studyDepthFor(DOOR.ownerKey, h) === 0));
}

// ── §2. THE READERS MOVE ────────────────────────────────
console.log("§2 the readers — own house, foreign house, isolation, the standing bases");
{
  // (d) THE STANDING BASES — a zero-Study tender of each
  // class reads exactly what the world read before this
  // build, number for number.
  const Z = {};
  for (const c of HOUSES) Z[c] = await claimTender(`Zero ${c}`, 3800, c);
  ok("(d) zero-Study standings: Warden company AC 4, Sage company AC 2, Sage company attack 2, Binder company healing 4, no other class's company gifts at all",
    companyAcBonusFor("warden", Z.warden.ownerKey) === 4 && companyAcBonusFor("sage", Z.sage.ownerKey) === 2
    && companyAttackBonusFor("sage", Z.sage.ownerKey) === 2 && companyAttackBonusFor("warden", Z.warden.ownerKey) === 0
    && bindingHealBonusFor("binder", Z.binder.ownerKey) === 4 && bindingHealBonusFor("witch", Z.witch.ownerKey) === 0
    && companyAcBonusFor("binder", Z.binder.ownerKey) === 0 && companyAcBonusFor("runewright", Z.runewright.ownerKey) === 0);
  ok("(d) zero-Study standings: Runewright relief 1 at level 1 and 3 at level 6 (the base formula alone), and none for any other class",
    curseReliefFor("runewright", 1, Z.runewright.ownerKey) === 1 && curseReliefFor("runewright", 6, Z.runewright.ownerKey) === 3
    && curseReliefFor("sage", 6, Z.sage.ownerKey) === 0);
  ok("(d) zero-Study standings: Summoner's Power at level 42 is the Spread's 6 alone — and a Sage's gift makes 9; at level 3 a Sage stands at her gift's 3",
    summonersPowerFor(Z.warden.ownerKey, 42, "warden") === 6 && summonersPowerFor(Z.sage.ownerKey, 42, "sage") === 9
    && summonersPowerFor(Z.sage.ownerKey, 3, "sage") === 3 && summonersPowerFor(Z.witch.ownerKey, 3, "witch") === 0);

  // (b) STUDY AT HOME deepens her own class skill.
  const W = await claimTender("Home Warden", 3800, "warden");
  grantStars(W.ownerKey, ["w_a4", "w_a10"]);
  ok("(b) at home: the Warden's own-house study (1 + 1) deepens her company AC — 4 + 2 = 6",
    companyAcBonusFor("warden", W.ownerKey) === 6, String(companyAcBonusFor("warden", W.ownerKey)));
  const S = await claimTender("Home Sage", 3800, "sage");
  grantStars(S.ownerKey, ["s_b2"]);
  ok("(b) at home: the Sage's own-house study (+2) deepens both halves of her gift — company AC 2 + 2 = 4, company attack 2 + 2 = 4",
    companyAcBonusFor("sage", S.ownerKey) === 4 && companyAttackBonusFor("sage", S.ownerKey) === 4);
  const R = await claimTender("Home Runewright", 3800, "runewright");
  grantStars(R.ownerKey, ["r_b5"]);
  ok("(b) at home: the Runewright's own-house study (+2) deepens her relief — 1 + 2 = 3 at level 1",
    curseReliefFor("runewright", 1, R.ownerKey) === 3, String(curseReliefFor("runewright", 1, R.ownerKey)));
  const SS = await claimTender("Home Sage Summoner", 3800, "sage");
  grantStars(SS.ownerKey, ["s_b11"]);
  ok("(b) at home: the Sage's own-house study (+2) deepens her summon gift — 3 + 2 = 5 at level 3",
    summonersPowerFor(SS.ownerKey, 3, "sage") === 5, String(summonersPowerFor(SS.ownerKey, 3, "sage")));

  // (a) STUDY ABROAD builds that class's skill in her.
  const B = await claimTender("Abroad Binder", 3800, "binder");
  grantStars(B.ownerKey, ["w_a4", "w_a10"]);
  ok("(a) abroad: a Binder who studied in the Warden's house (1 + 1) stands her company at the Warden's skill, depth 2 — her control (above) stands at 0",
    companyAcBonusFor("binder", B.ownerKey) === 2, String(companyAcBonusFor("binder", B.ownerKey)));
  const B2 = await claimTender("Abroad Binder Two", 3800, "binder");
  grantStars(B2.ownerKey, ["s_b2", "s_b6"]);
  ok("(a) abroad: a Binder who studied in the Sage's house (2 + 2) strikes with the Sage's company attack, depth 4 — and stands her company at the Sage's AC besides",
    companyAttackBonusFor("binder", B2.ownerKey) === 4 && companyAcBonusFor("binder", B2.ownerKey) === 4,
    `${companyAttackBonusFor("binder", B2.ownerKey)}/${companyAcBonusFor("binder", B2.ownerKey)}`);
  const W2 = await claimTender("Abroad Warden", 3800, "warden");
  grantStars(W2.ownerKey, ["r_a6", "r_a9", "r_a13"]);
  ok("(a) abroad: a Warden who studied in the Runewright's house (1 + 1 + 1) relieves the curse at depth 3 — her control stands at 0",
    curseReliefFor("warden", 1, W2.ownerKey) === 3, String(curseReliefFor("warden", 1, W2.ownerKey)));
  const WI = await claimTender("Abroad Witch", 3800, "witch");
  grantStars(WI.ownerKey, ["s_b11"]);
  ok("(a) abroad: a Witch who studied in the Sage's house (+2) rolls her summon with the Sage's gift built in — +2 where her control rolls +0",
    summonersPowerFor(WI.ownerKey, 3, "witch") === 2, String(summonersPowerFor(WI.ownerKey, 3, "witch")));

  // (c) ISOLATION — study in house A leaves house B's
  // skills exactly where they stood.
  ok("(c) isolation: the Binder with Warden-house study keeps her own healing at its base 4 (the Binder's house is empty of study) and gains no Sage attack",
    bindingHealBonusFor("binder", B.ownerKey) === 4 && companyAttackBonusFor("binder", B.ownerKey) === 0);
  ok("(c) isolation: the Warden with Runewright-house study keeps her company AC at its base 4 — relief was built, AC was not",
    companyAcBonusFor("warden", W2.ownerKey) === 4, String(companyAcBonusFor("warden", W2.ownerKey)));
  const EB = await claimTender("Every Star Binder", 3800, "binder");
  grantStars(EB.ownerKey, STUDY_IDS);
  ok("(c) isolation: the holder of EVERY study star, herself a Binder, still heals at the base 4 — the empty house deepens nothing even for her",
    bindingHealBonusFor("binder", EB.ownerKey) === 4, String(bindingHealBonusFor("binder", EB.ownerKey)));
}

// ── §3. THE HOMELAND POINT OF USE ───────────────────────
console.log("§3 the homeland point of use — the victim's AC, reckoned and bitten");
const { homelandVictimAcFor } = await import("../server/dist/actions.js");
{
  const B = await claimTender("Homeland Abroad Binder", 3800, "binder");
  grantStars(B.ownerKey, ["w_a4", "w_a10"]);
  const C = await claimTender("Homeland Binder Control", 3800, "binder");
  ok("homelandVictimAcFor (the settle's own reckoning): the foreign-study Binder's Awokin stands at toughness 12 + 2 = 14, the control's at 12",
    homelandVictimAcFor(12, "binder", B.ownerKey) === 14 && homelandVictimAcFor(12, "binder", C.ownerKey) === 12,
    `${homelandVictimAcFor(12, "binder", B.ownerKey)}/${homelandVictimAcFor(12, "binder", C.ownerKey)}`);
  const W = await claimTender("Homeland Home Warden", 3800, "warden");
  grantStars(W.ownerKey, ["w_a4", "w_a10"]);
  const WC = await claimTender("Homeland Warden Control", 3800, "warden");
  ok("homelandVictimAcFor: the home-study Warden's Awokin stands at 12 + 4 + 2 = 18, the control's at 16",
    homelandVictimAcFor(12, "warden", W.ownerKey) === 18 && homelandVictimAcFor(12, "warden", WC.ownerKey) === 16);

  // The bite sample, in the zodiac-effects drive's own
  // shape: one Fray, one standing victim, 96 settled
  // bites; each read is one settle whose watermark is
  // rewound a hair, the strike timers set long past.
  const run = async (T, starIds) => {
    grantStars(T.ownerKey, starIds);
    seedPatch(T.ownerKey, 2);
    const tileOf = (q, r) => db.prepare("SELECT id FROM territory_tiles WHERE owner_key = ? AND q = ? AND r = ?").get(T.ownerKey, q, r).id;
    const awId = seedAwokin(T.ownerKey, T.name, `${T.name} Victim`, "root", 1, 4); // toughness 12
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
  // The bite's holder stands tailored by study in TWO
  // foreign houses — the Warden's depth 2 and the Sage's
  // depth 6 both ride her company AC (the reckoning itself
  // is asserted exactly above: 12 + 2 = 14 for the Warden
  // part alone) — so she stands at AC 20, a gap wide
  // enough for sampled teeth to speak plainly. A 2-point
  // gap at this sample size is noise; the drive says so
  // rather than pretending otherwise.
  const BT = await claimTender("Homeland Tailored Binder", 3800, "binder");
  const c = await run(C, []);
  const h = await run(BT, ["w_a4", "w_a10", "s_b2", "s_b6", "s_b11"]);
  ok("bites (sampled, 96): the control Binder's Awokin at AC 12 is bitten at the world's rate", c.hits >= 24, `control ${c.hits}`);
  ok("bites (sampled): the study-tailored Binder's Awokin at AC 20 (12 + Warden depth 2 + Sage depth 6) is bitten far less — built class skills turn real blows",
    h.hits <= c.hits - 12 && h.lost < c.lost, `holder ${h.hits}/${h.lost} vs control ${c.hits}/${c.lost}`);
}

// ── §4. THE TABLE POINT OF USE ──────────────────────────
console.log("§4 the Table point of use — the summon tale names the reckoning");
const { issueTableToken } = await import("../server/dist/table.js");
function seedCard(ownerKey, tenderName, name, el, powers, toughs) {
  const nowT = Date.now();
  const cats = ["body", "arms", "head"];
  const parts = cats.map((cat, i) => {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)").run(`${name} ${cat}`, cat, powers[i], toughs[i], el, `study/${name}-${cat}.png`, nowT).lastInsertRowid);
    return { source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: powers[i], toughness: toughs[i], element: el };
  });
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)").run(name, name, `study/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
const seedBench = (T, n) => { for (let i = 0; i < n; i++) seedAwokin(T.ownerKey, T.name, `${T.name} Bench ${i + 1}`, "sky", 2, 0); };
async function bindSeat(T) {
  const tt = issueTableToken({ id: `disc-study-${T.ownerKey.replace("tender:", "")}`, name: T.name });
  const bindCode = (await call("getTableBindCode", {}, T.token)).code;
  const res = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
  if (!res.ok) throw new Error(`table/bind failed for ${T.name}: ${res.status}`);
  return tt;
}
class TActor {
  constructor() { this.state = null; this.you = null; this.errors = []; }
  async join(tt, room) {
    this.ws = new WebSocket("ws://127.0.0.1:39937/table/ws");
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
  async waitYou(what, ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { if (this.you) return; await sleep(120); } throw new Error("actor wait: " + what); }
}
const until = async (fn, ms = 10000) => { const s = Date.now(); while (Date.now() - s < ms) { if (fn()) return true; await sleep(150); } return false; };
{
  const taleOf = async (T, room) => {
    seedBench(T, 6);
    const awId = seedCard(T.ownerKey, T.name, `${T.name} Herald`, "sky", [2, 0, 0], [1, 0, 0]);
    await call("addToParty", { awakenedId: awId }, T.token);
    const a = new TActor(); await a.join(await bindSeat(T), room); await a.waitYou(`${T.name} seated`);
    a.send({ type: "summonCast", awakenedId: awId });
    await until(() => a.tale.some((t) => /summoner's power/.test(t)), 9000);
    return a.tale.find((t) => /summoner's power/.test(t)) ?? "";
  };
  const H = await claimTender("Table Abroad Warden", 150, "warden");
  grantStars(H.ownerKey, ["s_b2", "s_b6"]); // Sage-house study 2 + 2
  const th = await taleOf(H, "study-tale-h");
  ok("(e) at the Table: the Warden who studied in the Sage's house summons with the built gift — the tale names summoner's power +4",
    /summoner's power \+4/.test(th), th);
  const C = await claimTender("Table Tale Control", 150, "warden");
  const tc = await taleOf(C, "study-tale-c");
  ok("(e) control: the starless Warden's tale names +0 — no clause, no level step at Lv 3, no study",
    /summoner's power \+0/.test(tc), tc);
  const S = await claimTender("Table Home Sage", 150, "sage");
  grantStars(S.ownerKey, ["s_b2"]); // own-house study +2
  const ts = await taleOf(S, "study-tale-s");
  ok("(e) at the Table: the Sage's own gift (+3) deepened by her own-house study (+2) — the tale names +5",
    /summoner's power \+5/.test(ts), ts);
}

// ── §5. THE FACES AS SERVED ─────────────────────────────
console.log("§5 the faces as served");
{
  const T = await call("claimTender", { password: "study-houses-password", tenderName: "Face Reader" });
  const tree = await call("getSkillTree", {}, T.token);
  const served = JSON.stringify(tree);
  ok("the served tree carries the new law's words (the class skill of the house)", served.includes("class skill of the house"), served.slice(0, 120));
  ok("the served tree carries NONE of the struck school's words", !served.includes("one school of the tender's choice"));
}

console.log(`\nSTUDY HOUSES DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
