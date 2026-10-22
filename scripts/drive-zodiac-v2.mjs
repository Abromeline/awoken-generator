// drive-zodiac-v2 — THE V2 WHEEL, REAL (Nigel's build order,
// 2026-10-22): the 194-star tree replaces the old wheel in the
// game. Proven against the real API on a scratch server whose
// database is PRE-SEEDED with an old-tree world — old held
// skills in the ledger and an old persisted living graph — so
// the one-time migration is exercised exactly as production
// will meet it: the old ledger clears, the old graph falls,
// the v2 seed rises, and nothing else about the Tender moves.
//
// The walk itself proves the v2 law: Heart-first, buy the
// centre refused, predecessor sets (the connecting ring: ANY
// predecessor opens a ring star), off-road refusal where no
// predecessor is held, release stranding under set semantics,
// the one pool at 2 points a level — and a RUNEWRIGHT crossing
// the ring to buy MERCY, the Witch-tailored gift star, because
// no skill is class-locked and a gift belongs to whoever buys
// the star.
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
  pre.prepare("INSERT INTO tender_skills VALUES ('tender:1', 'w_thick', 'tree', 1), ('tender:1', 'c_hp1', 'tree', 1), ('tender:1', 'party_3', 'tree', 1)").run();
  pre.prepare("INSERT INTO ui_config VALUES ('zodiac.graph', ?, 1)").run(JSON.stringify({ nodes: [{ id: "w_thick" }], edges: [] }));
  pre.close();
}

await import("../server/dist/index.js");
await sleep(2500);

const db = new Database(join(DATA_DIR, "app.db"));
check("MIGRATION: the old held skills are cleared", db.prepare("SELECT COUNT(*) c FROM tender_skills").get().c === 0);
check("MIGRATION: the wheel-version marker stands at 2", db.prepare("SELECT value FROM ui_config WHERE key = 'zodiac.wheelVersion'").get()?.value === "2");

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
check("the wheel stands: 194 stars, 205 roads", st.nodes?.length === 194 && st.edges?.length === 205, `nodes ${st.nodes?.length} edges ${st.edges?.length}`);
const graphRow = db.prepare("SELECT value FROM ui_config WHERE key = 'zodiac.graph'").get();
const graph = graphRow ? JSON.parse(graphRow.value) : null;
check("MIGRATION: the living graph is the v2 seed (194 stars)", !!graph && graph.v === 2 && graph.nodes.length === 194, graph ? `v=${graph.v} nodes=${graph.nodes?.length}` : "no graph row");
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
r = await api("unlockSkill", { key: "w_a3" }, token);
check("OFF-ROAD REFUSAL: w_a3 with no predecessor held is refused", r.status === 400 && (errText(r).includes("requires") || errText(r).includes("No road")), `status ${r.status} ${errText(r)}`);

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
await api("unlockSkill", { key: "h1" }, token2);
await api("unlockSkill", { key: "h2" }, token2);
r = await api("unlockSkill", { key: "h3" }, token2);
check("POINTS: a Lv 1 tender's 2 points are spent after two stars", r.status === 400 && errText(r).includes("costs 1 point"), `status ${r.status} ${errText(r)}`);

console.log(`\ndrive-zodiac-v2: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
