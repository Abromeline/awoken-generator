// drive-zodiac-v2 — THE V2 WHEEL, REAL (Nigel's build order,
// 2026-10-22), CONTINUED the same day (14:07): forks on every
// road, the deep ring, the lure audit, the step rulings, the
// Shield conversions, the full refund and the Reset Skill
// Points action. Proven against the real API on a scratch
// server whose database is PRE-SEEDED with an old-tree
// world — fat old ledgers for the first eight tenders (one
// spender's old holdings far beyond any new purse) and an
// old persisted living graph — so the wheel-version
// migration is exercised exactly as production will meet it:
// the old ledger clears, the old graph falls, the new seed
// rises, every purse stands whole at 2 × level, and nothing
// else about a Tender moves.
//
// The walks prove the law: Heart-first, buy the centre
// refused, predecessor sets (the connecting rings, shallow
// and deep: ANY predecessor opens a ring star), off-road
// refusal where no predecessor is held, release stranding
// under set semantics, the one pool at 2 points a level,
// every fork walked on a single strand to its keystone,
// lures reached purely by crossing — and a RUNEWRIGHT
// crossing the ring to buy MERCY, the Witch-tailored gift
// star, because no skill is class-locked and a gift belongs
// to whoever buys the star.
import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-zodiac-v2-"));
process.env.DATA_DIR = DATA_DIR;
process.env.PORT = "39972";
process.env.WORKSHOP_PASSWORD = "test-workshop-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── The old world, pre-seeded ────────────────────────────────
{
  const pre = new Database(join(DATA_DIR, "app.db"));
  pre.exec(`CREATE TABLE tender_skills (owner_key TEXT NOT NULL, skill_key TEXT NOT NULL, pool TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (owner_key, skill_key));
            CREATE TABLE ui_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);`);
  // Heavy old spenders: tender:1's ledger is FAT with
  // old-tree and canopy holdings whose old cost ran far
  // beyond the new purse of 20 — the refund must still land
  // whole. The next seven tenders carry old rows too, so
  // every walker claimed below starts proven-refunded.
  const fat = ["w_thick", "c_hp1", "party_3", "w_wall", "summon_lore", "rim_90", "c_att", "b_grove", "r_rune9", "wi_song4", "s_deep2", "old_crown", "canopy_star", "w_thick2", "party_9", "c_hp9"];
  const ins = pre.prepare("INSERT INTO tender_skills VALUES (?, ?, ?, 1)");
  for (let t = 1; t <= 8; t++) for (const k of fat) ins.run(`tender:${t}`, `${k}_${t}`, t % 2 ? "tree" : "canopy");
  pre.prepare("INSERT INTO tender_skills VALUES ('tender:1', 'w_thick', 'tree', 1), ('tender:1', 'c_hp1', 'tree', 1), ('tender:1', 'party_3', 'tree', 1)").run();
  pre.prepare("INSERT INTO ui_config VALUES ('zodiac.graph', ?, 1)").run(JSON.stringify({ nodes: [{ id: "w_thick" }], edges: [] }));
  pre.close();
}

await import("../server/dist/index.js");
await sleep(2500);

const db = new Database(join(DATA_DIR, "app.db"));
check("MIGRATION: the old held skills are cleared", db.prepare("SELECT COUNT(*) c FROM tender_skills").get().c === 0);
check("MIGRATION: the wheel-version marker stands at 3", db.prepare("SELECT value FROM ui_config WHERE key = 'zodiac.wheelVersion'").get()?.value === "3");

async function api(action, args, token) {
  const res = await fetch(`http://127.0.0.1:39972/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
const errText = (r) => String(r.data?.error ?? r.data?.message ?? "");

const claim = await api("claimTender", { password: "test-password-1", tenderName: "Wheel Walker" });
check("tender claimed", claim.status === 200 && !!claim.data.token, JSON.stringify(claim.data).slice(0, 120));
const token = claim.data.token;
const tenderId = db.prepare("SELECT id FROM tenders WHERE tender_name = 'Wheel Walker'").get().id;
const ownerKey = `tender:${tenderId}`;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, Date.now());
const ch = await api("chooseClass", { classKey: "runewright" }, token);
check("the walker is a Runewright", ch.status === 200 && ch.data.classKey === "runewright", `status ${ch.status} ${errText(ch)}`);

let st = (await api("getSkillTree", {}, token)).data;
check("the wheel stands: 194 stars, 222 roads", st.nodes?.length === 194 && st.edges?.length === 222, `nodes ${st.nodes?.length} edges ${st.edges?.length}`);
const graphRow = db.prepare("SELECT value FROM ui_config WHERE key = 'zodiac.graph'").get();
const graph = graphRow ? JSON.parse(graphRow.value) : null;
check("MIGRATION: the living graph is the v3 seed (194 stars)", !!graph && graph.v === 3 && graph.nodes.length === 194, graph ? `v=${graph.v} nodes=${graph.nodes?.length}` : "no graph row");
check("REFUND: the seeded heavy spender — old spend far past the new purse — starts empty-handed with a whole purse", st.unlocked.length === 0 && st.tree?.spent === 0 && st.tree?.left === 20, JSON.stringify({ unlocked: st.unlocked.length, tree: st.tree }));
check("one pool at 2 points a level: Lv 10 holds 20, no canopy", st.pointsPerLevel === 2 && st.tree?.total === 20 && st.canopy === undefined, JSON.stringify({ ppl: st.pointsPerLevel, tree: st.tree, canopy: st.canopy }).slice(0, 140));
const mercy = st.nodes.find(n => n.id === "wi_a2");
check("MERCY stands early on the Witch road at 25%", mercy?.name === "MERCY" && mercy.effect.includes("25%") && mercy.pathway === "Witch", JSON.stringify(mercy).slice(0, 160));
const pronoun = /\b(her|his|she|he|him|hers)\b/i;
const dirty = st.nodes.filter(n => pronoun.test(n.name) || pronoun.test(n.effect) || pronoun.test(n.grant ?? ""));
check("no skill text reads her/his anywhere on the wheel", dirty.length === 0, dirty.map(n => n.id).join(","));

let r = await api("unlockSkill", { key: "w_a1" }, token);
check("HEART-FIRST: a road star before any Heart star is refused", r.status === 400 && errText(r).includes("Heart must beat"), `status ${r.status} ${errText(r)}`);
r = await api("unlockSkill", { key: "heart" }, token);
check("the centre is not bought", r.status === 400 && errText(r).includes("not bought"), `status ${r.status} ${errText(r)}`);

for (const k of ["h1", "h2", "h3", "h4", "h5", "h6", "h7"]) {
  r = await api("unlockSkill", { key: k }, token);
  if (r.status !== 200) break;
}
check("the Heart ring walks star by star to the Warden's door", r.status === 200 && r.data.unlocked.includes("h7"), `status ${r.status} ${errText(r)}`);
r = await api("unlockSkill", { key: "w_a1" }, token);
check("the Warden road opens past its door", r.status === 200 && r.data.unlocked.includes("w_a1"), `status ${r.status} ${errText(r)}`);
r = await api("unlockSkill", { key: "w_a4" }, token);
check("OFF-ROAD REFUSAL: w_a4 (the Written Line strand) with no predecessor held is refused", r.status === 400 && (errText(r).includes("requires") || errText(r).includes("No road")), `status ${r.status} ${errText(r)}`);

// The connecting ring, crossed: Warden a2 by its chain, then
// sideways — r_a2 opens on w_a2 alone (r_a1 never held), b_a2
// on r_a2, and MERCY on b_a2 — a Runewright holding the
// Witch's gift star.
r = await api("unlockSkill", { key: "w_a2" }, token);
check("w_a2 by its chain predecessor", r.status === 200, `status ${r.status} ${errText(r)}`);
r = await api("unlockSkill", { key: "r_a2" }, token);
check("THE RING: r_a2 opens sideways on w_a2 alone (r_a1 never held)", r.status === 200 && r.data.unlocked.includes("r_a2") && !r.data.unlocked.includes("r_a1"), `status ${r.status} ${errText(r)}`);
r = await api("unlockSkill", { key: "b_a2" }, token);
check("THE RING: b_a2 opens on r_a2", r.status === 200 && r.data.unlocked.includes("b_a2"), `status ${r.status} ${errText(r)}`);
r = await api("unlockSkill", { key: "wi_a2" }, token);
check("CROSS-CLASS GIFT: a Runewright buys MERCY, the Witch-tailored gift star", r.status === 200 && r.data.unlocked.includes("wi_a2"), `status ${r.status} ${errText(r)}`);
check("the walk cost 12 of 20 points", r.data.tree?.spent === 12 && r.data.tree?.left === 8, JSON.stringify(r.data.tree));

// The deepener's only gates are road and points — never class.
r = await api("unlockSkill", { key: "wi_b5" }, token);
check("wi_b5 (the mercy deepener) refuses on road/requires alone, no class word", r.status === 400 && !/class|witch/i.test(errText(r).replace(/Witch road|Witch-tailored/g, "")), `status ${r.status} ${errText(r)}`);

// Release under predecessor-set semantics. First lay a
// second bridge into the ring (h8 + r_a1): now the cluster
// hangs from two chain stars, and w_a1 may go — the ring
// holds w_a2 up through r_a2 and r_a1. But r_a2 may NOT go
// while it is the last road under w_a2.
await api("unlockSkill", { key: "h8" }, token);
r = await api("unlockSkill", { key: "r_a1" }, token);
check("a second bridge into the ring: h8 + r_a1", r.status === 200 && r.data.unlocked.includes("r_a1"), `status ${r.status} ${errText(r)}`);
r = await api("releaseSkill", { key: "w_a1" }, token);
check("RELEASE: w_a1 releases — the ring still holds w_a2", r.status === 200 && r.data.unlocked.includes("w_a2"), `status ${r.status} ${errText(r)}`);
r = await api("releaseSkill", { key: "r_a2" }, token);
check("RELEASE: r_a2 refuses — it is the last road under w_a2", r.status === 400 && errText(r).includes("strand"), `status ${r.status} ${errText(r)}`);
for (const k of ["wi_a2", "b_a2", "w_a2", "r_a2"]) {
  r = await api("releaseSkill", { key: k }, token);
  if (r.status !== 200) break;
}
check("RELEASE: the ring unwinds from the far side inward", r.status === 200 && !r.data.unlocked.includes("r_a2"), `status ${r.status} ${errText(r)}`);

// The Sage trap rung and THE FORK, walked whole through the
// API: ring to h11, s_a1, then BOTH rung stars in parallel
// (neither requires the other), the short Summon strand to
// its end — and the keystone opens on that strand's tail
// alone, the Swallow strand never walked.
for (const k of ["h9", "h10", "h11", "s_a1"]) await api("unlockSkill", { key: k }, token);
r = await api("unlockSkill", { key: "s_a2" }, token);
check("SWALLOW THE HEART bought at the rung", r.status === 200 && r.data.unlocked.includes("s_a2"), `status ${r.status} ${errText(r)}`);
const swallow = r.data.nodes.find(n => n.id === "s_a2");
check("SWALLOW THE HEART carries HP on kill at the ruled 1 HP", swallow?.name === "SWALLOW THE HEART" && swallow.effect.includes("1 HP returns"), JSON.stringify(swallow).slice(0, 140));
r = await api("unlockSkill", { key: "s_a3" }, token);
check("the rung-mate (Summoner's Power) bought in parallel — neither rung star required the other", r.status === 200 && r.data.unlocked.includes("s_a3"), `status ${r.status} ${errText(r)}`);
const rungMate = r.data.nodes.find(n => n.id === "s_a3");
check("the rung-mate carries Summoner's Power", (rungMate?.effect ?? "").includes("Summoner's Power"), JSON.stringify(rungMate).slice(0, 140));
for (const k of ["s_a7", "s_a11", "s_a14"]) {
  r = await api("unlockSkill", { key: k }, token);
  if (r.status !== 200) break;
}
check("the Summon strand walks to its end (s_a14)", r.status === 200 && r.data.unlocked.includes("s_a14"), `status ${r.status} ${errText(r)}`);
r = await api("unlockSkill", { key: "s_k" }, token);
check("THE FORK REJOINS: the keystone opens on the Summon strand's tail alone", r.status === 200 && r.data.unlocked.includes("s_k") && !r.data.unlocked.includes("s_a16"), `status ${r.status} ${errText(r)}`);

// The points refusal, on a fresh Lv 1 tender (2 points).
const claim2 = await api("claimTender", { password: "test-password-2", tenderName: "Young Walker" });
const token2 = claim2.data.token;
const stYoung = (await api("getSkillTree", {}, token2)).data;
check("REFUND: the young spender's old ledger is gone too — whole purse of 2 at Lv 1", stYoung.unlocked.length === 0 && stYoung.tree?.spent === 0 && stYoung.tree?.left === 2, JSON.stringify({ unlocked: stYoung.unlocked.length, tree: stYoung.tree }));
await api("unlockSkill", { key: "h1" }, token2);
await api("unlockSkill", { key: "h2" }, token2);
r = await api("unlockSkill", { key: "h3" }, token2);
check("POINTS: a Lv 1 tender's 2 points are spent after two stars", r.status === 400 && errText(r).includes("costs 1 point"), `status ${r.status} ${errText(r)}`);

// ── THE CONTINUATION (Nigel, 2026-10-22 14:07): every fork
// walked on ONE strand to its keystone, the deep ring
// crossed sideways, lures taken purely by crossing, the
// Shield conversions counted, and the Reset.
async function makeWalker(name) {
  const c = await api("claimTender", { password: "test-password-x", tenderName: name });
  const tk = c.data.token;
  const id = db.prepare("SELECT id FROM tenders WHERE tender_name = ?").get(name).id;
  const ok = `tender:${id}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ok, Date.now());
  const s0 = (await api("getSkillTree", {}, tk)).data;
  check(`REFUND: ${name} starts with a whole purse and empty hands`, s0.unlocked.length === 0 && s0.tree?.left === 20, JSON.stringify({ unlocked: s0.unlocked.length, tree: s0.tree }));
  return { tk, s0 };
}
async function walk(tk, keys) {
  let last = null;
  for (const k of keys) { last = await api("unlockSkill", { key: k }, tk); if (last.status !== 200) break; }
  return last;
}

// WARDEN — the Hold Fast strand alone carries the walker to
// the keystone; the Written Line is never touched.
{
  const { tk, s0 } = await makeWalker("Fork Walker Warden");
  const written = s0.nodes.find(n => n.id === "w_a2");
  const holdFast = s0.nodes.find(n => n.id === "w_a3");
  check("WARDEN FORK HEADS: The Written Line (wards gain HP) and Hold Fast (Tender AC) stand at the rung", written?.name === "The Written Line" && written.effect === "Wards gain +1 HP" && holdFast?.name === "Hold Fast" && holdFast.effect === "Tender AC +1", JSON.stringify({ written: written?.name, holdFast: holdFast?.name }).slice(0, 160));
  let r = await walk(tk, ["h1", "h2", "h3", "h4", "h5", "h6", "h7", "w_a1", "w_a3", "w_a6", "w_a7", "w_a9", "w_a12", "w_a13", "w_a15"]);
  check("HOLD FAST STRAND: walks from its head to its tail (w_a15)", r.status === 200 && r.data.unlocked.includes("w_a15"), `status ${r.status} ${errText(r)}`);
  r = await api("unlockSkill", { key: "w_k" }, tk);
  check("the keystone refuses mid-strand — neither tail held yet", r.status === 400 && errText(r).includes("requires"), `status ${r.status} ${errText(r)}`);
  r = await walk(tk, ["w_a16", "w_k"]);
  check("THE FORK REJOINS: the Law keystone opens on the Hold Fast tail alone", r.status === 200 && r.data.unlocked.includes("w_k") && !r.data.unlocked.includes("w_a2") && r.data.tree?.spent === 18, `status ${r.status} spent ${r.data.tree?.spent} ${errText(r)}`);
}

// RUNEWRIGHT — the Cutting Ink strand alone.
{
  const { tk, s0 } = await makeWalker("Fork Walker Runewright");
  const ink = s0.nodes.find(n => n.id === "r_a2");
  const eye = s0.nodes.find(n => n.id === "r_a3");
  check("RUNEWRIGHT FORK HEADS: The Cutting Ink (rune damage, step ruled +1) and The Patient Eye (Aim) stand at the rung", ink?.name === "The Cutting Ink" && ink.effect === "Rune damage +1" && ink.step === "ruled" && eye?.name === "The Patient Eye" && eye.effect.includes("Aim"), JSON.stringify({ ink: ink?.name, eye: eye?.name }).slice(0, 160));
  const r = await walk(tk, ["h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8", "r_a1", "r_a2", "r_a5", "r_a7", "r_a11", "r_a12", "r_a15", "r_k"]);
  check("THE FORK REJOINS: the Lore keystone opens on the Cutting Ink tail alone", r.status === 200 && r.data.unlocked.includes("r_k") && !r.data.unlocked.includes("r_a16") && r.data.tree?.spent === 17, `status ${r.status} spent ${r.data.tree?.spent} ${errText(r)}`);
}

// BINDER — the Triple Thread (holding) strand alone to the
// keystone, then the DEEP RING crossed sideways into the
// Witch's second arm.
{
  const { tk, s0 } = await makeWalker("Deep Walker Binder");
  const root = s0.nodes.find(n => n.id === "b_a2");
  const thread = s0.nodes.find(n => n.id === "b_a3");
  const deepStar = s0.nodes.find(n => n.id === "b_b2");
  const drum = s0.nodes.find(n => n.id === "w_b3");
  check("BINDER FORK HEADS: The Thrifty Root (plants, step ruled +5%) and The Triple Thread (attunement rate) stand at the rung", root?.name === "The Thrifty Root" && root.effect === "Plants grow 5% faster" && root.step === "ruled" && thread?.name === "The Triple Thread" && thread.effect.includes("Attunement rate"), JSON.stringify({ root: root?.name, thread: thread?.name }).slice(0, 160));
  check("THE DEEP RING: b_b2 names both sideways neighbours among its roads", deepStar?.requires.includes("r_b2") && deepStar.requires.includes("wi_b2") && deepStar.requires.includes("b_b1"), JSON.stringify(deepStar?.requires));
  check("LURE AUDIT: w_b3 is The Homeward Drum now — Return beside the deep ring", drum?.name === "The Homeward Drum" && drum.effect.includes("Return"), JSON.stringify({ name: drum?.name, effect: drum?.effect }).slice(0, 140));
  let r = await walk(tk, ["h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8", "h9", "b_a1", "b_a3", "b_a4", "b_a8", "b_a10", "b_a12", "b_k"]);
  check("THE FORK REJOINS: the Land keystone opens on the Triple Thread tail alone (the Thrifty Root never bought)", r.status === 200 && r.data.unlocked.includes("b_k") && !r.data.unlocked.includes("b_a2") && !r.data.unlocked.includes("b_a16"), `status ${r.status} ${errText(r)}`);
  r = await walk(tk, ["b_b1", "b_b2"]);
  check("down the second arm to the deep-ring star (b_b2)", r.status === 200 && r.data.unlocked.includes("b_b2") && !r.data.unlocked.includes("wi_b1"), `status ${r.status} ${errText(r)}`);
  r = await api("unlockSkill", { key: "wi_b2" }, tk);
  check("THE DEEP RING CROSSED: wi_b2 opens sideways on b_b2 alone, deep in the wheel", r.status === 200 && r.data.unlocked.includes("wi_b2") && r.data.tree?.spent === 20, `status ${r.status} spent ${r.data.tree?.spent} ${errText(r)}`);
}

// WITCH — MERCY's giving-song strand alone, the Quickening
// head bought in parallel; and the Shield census.
{
  const { tk, s0 } = await makeWalker("Fork Walker Witch");
  const quick = s0.nodes.find(n => n.id === "wi_a3");
  check("WITCH FORK HEAD 2: The Quickening (attunement rate) stands at the rung beside MERCY", quick?.name === "The Quickening" && quick.effect.includes("Attunement rate +1"), JSON.stringify({ name: quick?.name, effect: quick?.effect }).slice(0, 140));
  const shieldStars = s0.nodes.filter(n => n.effect.startsWith("Shield +1"));
  const acStars = s0.nodes.filter(n => n.effect === "The tender's Awokin gain +1 AC");
  check("SHIELD CONVERSIONS: exactly 3 Awokin AC stars became Shield stars (w_b6, w_b11, wi_b4); Awokin AC stands at 3 (h7, w_b1, wi_b14)", shieldStars.length === 3 && shieldStars.map(n => n.id).sort().join(",") === "w_b11,w_b6,wi_b4" && acStars.length === 3 && acStars.map(n => n.id).sort().join(",") === "h7,w_b1,wi_b14", `shield ${shieldStars.map(n => n.id)} ac ${acStars.map(n => n.id)}`);
  const r = await walk(tk, ["h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8", "h9", "h10", "wi_a1", "wi_a2", "wi_a5", "wi_a8", "wi_a9", "wi_a12", "wi_a16", "wi_a3", "wi_k"]);
  check("THE FORK REJOINS: the Song and Storm keystone opens on the giving-song tail (the Quickening head held, its strand unwalked)", r.status === 200 && r.data.unlocked.includes("wi_k") && !r.data.unlocked.includes("wi_a15") && r.data.tree?.spent === 20, `status ${r.status} spent ${r.data.tree?.spent} ${errText(r)}`);
}

// LURES BY CROSSING — a Warden-side walker who never buys a
// Runewright or Sage chain star still takes two lures
// sideways off the shallow ring: The Patient Eye (an Aim
// head) and SWALLOW THE HEART (HP on kill).
{
  const { tk } = await makeWalker("Lured Walker");
  let r = await walk(tk, ["h1", "h2", "h3", "h4", "h5", "h6", "h7", "w_a1", "w_a2", "r_a2"]);
  check("crossed to the Runewright rung off the Warden chain", r.status === 200 && r.data.unlocked.includes("r_a2"), `status ${r.status} ${errText(r)}`);
  r = await api("unlockSkill", { key: "r_a3" }, tk);
  check("LURE BY CROSSING: The Patient Eye opens on w_a2 — an Aim head one step off the ring", r.status === 200 && r.data.unlocked.includes("r_a3") && !r.data.unlocked.includes("r_a1"), `status ${r.status} ${errText(r)}`);
  r = await api("unlockSkill", { key: "s_a2" }, tk);
  check("LURE BY CROSSING: SWALLOW THE HEART opens on w_a2 — HP on kill one step off the ring", r.status === 200 && r.data.unlocked.includes("s_a2") && !r.data.unlocked.includes("s_a1"), `status ${r.status} ${errText(r)}`);
}

// RESET SKILL POINTS — the main walker stands at 20/20
// spent after the Sage walk; one call clears the ledger
// whole, and the purse is spendable again at once.
{
  let st = (await api("getSkillTree", {}, token)).data;
  check("the main walker stands fully spent before the reset", st.tree?.spent === 20 && st.tree?.left === 0, JSON.stringify(st.tree));
  let r = await api("resetSkillPoints", {}, token);
  check("RESET: every star released, every point refunded in one call", r.status === 200 && r.data.unlocked.length === 0 && r.data.tree?.spent === 0 && r.data.tree?.left === 20, `status ${r.status} ${JSON.stringify(r.data.tree ?? {})} ${errText(r)}`);
  check("RESET: the ledger rows are truly gone", db.prepare("SELECT COUNT(*) c FROM tender_skills WHERE owner_key = ?").get(ownerKey).c === 0);
  r = await api("unlockSkill", { key: "h1" }, token);
  check("RESET: re-buying starts at once (h1)", r.status === 200 && r.data.unlocked.includes("h1"), `status ${r.status} ${errText(r)}`);
  r = await walk(token, ["h2", "h3", "h4", "h5", "h6", "h7", "w_a1", "w_a2"]);
  check("RESET: and the roads walk again from the Heart (Written Line head re-bought)", r.status === 200 && r.data.unlocked.includes("w_a2") && r.data.tree?.spent === 9, `status ${r.status} spent ${r.data.tree?.spent} ${errText(r)}`);
}

console.log(`\ndrive-zodiac-v2: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
