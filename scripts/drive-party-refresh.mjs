// drive-party-refresh — THE PARTY-FX PASS, REAL (Nigel's
// choice, 2026-10-22 20:51: "Build the surgical refresh,
// then push both together"). A world whose wheel was saved
// before the party wiring (bb107a0) holds the thirteen
// party stars with empty clauses; this drive builds exactly
// that stale world, boots the built server against it, and
// proves the one-time stamped pass carries the seed's
// clauses onto those thirteen stars — and nothing else in
// the world moves: not a node's name, cost or roads, not
// another node's clauses, not the Tender's held skills or
// party. A second boot proves the pass never runs twice.
import Database from "better-sqlite3";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-party-refresh-"));
const PORT = "39986";
const BASE = `http://127.0.0.1:${PORT}`;
const PW = "test-password-1";
const STAMP_KEY = "zodiac.partyFxPass";
const STAMP = "party-fx-2026-10-22";
const PARTY_STARS = ["h5", "w_b2", "w_b7", "w_b10", "w_b16", "r_b4", "r_b8", "r_b16", "b_b3", "b_b6", "b_b12", "wi_b7", "wi_b11"];
const seedFxFor = (id) => [{ verb: "company", amount: id === "h5" ? 1 : 2 }];

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function boot(label, fn) {
  const child = spawn("node", ["server/dist/index.js"], {
    cwd: root,
    env: { ...process.env, DATA_DIR, PORT, WORKSHOP_PASSWORD: PW, DISCORD_CLIENT_ID: "", DISCORD_CLIENT_SECRET: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", d => (log += d));
  child.stderr.on("data", d => (log += d));
  try {
    let healthy = false;
    for (let i = 0; i < 60 && !healthy; i++) {
      if (child.exitCode !== null) break;
      try { const r = await fetch(`${BASE}/api/health`); healthy = r.ok; } catch { /* not up yet */ }
      if (!healthy) await sleep(500);
    }
    if (!healthy) throw new Error(`server did not become healthy (${label}):\n${log}`);
    await fn();
  } finally {
    child.kill("SIGTERM");
    await sleep(400);
    if (child.exitCode === null) child.kill("SIGKILL");
    await sleep(200);
  }
}

async function api(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const dbPath = join(DATA_DIR, "app.db");
let token, ownerKey;

// ── Boot 1: a fresh world, born under the current code ────
await boot("fresh world", async () => {
  const claim = await api("claimTender", { password: PW, tenderName: "Refresh Tender" });
  check("tender claimed", claim.status === 200 && !!claim.data.token, JSON.stringify(claim.data).slice(0, 120));
  token = claim.data.token;
  const tree = await api("getSkillTree", {}, token);
  check("the wheel serves on the fresh world", tree.status === 200 && (tree.data.nodes?.length ?? 0) > 0);
  const party = await api("getParty", {}, token);
  check("fresh control: no party stars held, the cap reads the bare 3", party.data.cap === 3 && party.data.musterBonus === 0, JSON.stringify(party.data).slice(0, 160));
});

// ── Surgery: rewind this world to the morning before the
// party wiring — the thirteen party stars' clauses emptied
// (their exact pre-bb107a0 state: none of the thirteen
// carries an element or attunement of its own), the pass's
// stamp struck, and a Tender standing in it who holds the
// Wide Heart and the Company Standard with a party of 3.
const db = new Database(dbPath);
const now = Date.now();
const graphRow = db.prepare("SELECT value FROM ui_config WHERE key = 'zodiac.graph'").get();
check("the fresh world persisted its wheel", !!graphRow?.value);
const stampRow = db.prepare("SELECT value FROM ui_config WHERE key = ?").get(STAMP_KEY);
check("the fresh world was stamped at its seeding", stampRow?.value === STAMP, JSON.stringify(stampRow));
const tenderId = db.prepare("SELECT id FROM tenders WHERE tender_name = 'Refresh Tender'").get().id;
ownerKey = `tender:${tenderId}`;

const seeded = JSON.parse(graphRow.value);
const byId = new Map(seeded.nodes.map(n => [n.id, n]));
check("all thirteen party stars stand in the seeded wheel", PARTY_STARS.every(id => byId.has(id)));
check("the seeded wheel carries the seed's clauses on the thirteen",
  PARTY_STARS.every(id => same(byId.get(id).fx, seedFxFor(id))),
  JSON.stringify(PARTY_STARS.map(id => [id, byId.get(id)?.fx])));

for (const id of PARTY_STARS) byId.get(id).fx = [];
db.prepare("UPDATE ui_config SET value = ?, updated_at = ? WHERE key = 'zodiac.graph'").run(JSON.stringify(seeded), now);
db.prepare("DELETE FROM ui_config WHERE key = ?").run(STAMP_KEY);
check("the stamp is struck — the world now stands as a stale world stands",
  !db.prepare("SELECT value FROM ui_config WHERE key = ?").get(STAMP_KEY));

const part = (name, category, power, toughness) => Number(db.prepare(
  "INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, 'sky', ?, 'image/png', ?)")
  .run(name, category, power, toughness, `fix/${name}.png`, now).lastInsertRowid);
const mkAwokin = (name, power) => {
  const comp = JSON.stringify([
    { source_id: `db:${part(name + " Body", "body", power, 5)}`, name: name + " Body", category: "body", rarity: "common", power, toughness: 5, element: "sky" },
    { source_id: `db:${part(name + " Arms", "arms", 0, 0)}`, name: name + " Arms", category: "arms", rarity: "common", power: 0, toughness: 0, element: "sky" },
    { source_id: `db:${part(name + " Head", "head", 0, 0)}`, name: name + " Head", category: "head", rarity: "common", power: 0, toughness: 0, element: "sky" },
  ]);
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, "fix/awokin.png", comp, "Refresh Tender", ownerKey, now).lastInsertRowid);
};
const band = [mkAwokin("Alpha", 8), mkAwokin("Beta", 2), mkAwokin("Gamma", 2)];
for (const id of band) db.prepare("INSERT INTO tender_party (owner_key, awakened_id, added_at) VALUES (?, ?, ?)").run(ownerKey, id, now);
for (const key of ["h5", "w_b2"]) db.prepare("INSERT INTO tender_skills (owner_key, skill_key, pool, created_at) VALUES (?, ?, 'tree', ?)").run(ownerKey, key, now);

const skillsBefore = db.prepare("SELECT owner_key, skill_key, pool, created_at FROM tender_skills WHERE owner_key = ? ORDER BY skill_key").all(ownerKey);
const partyBefore = db.prepare("SELECT owner_key, awakened_id, added_at FROM tender_party WHERE owner_key = ? ORDER BY awakened_id").all(ownerKey);
const graphStaleRaw = db.prepare("SELECT value FROM ui_config WHERE key = 'zodiac.graph'").get().value;
const graphStale = JSON.parse(graphStaleRaw);
// The stale fixture's own arithmetic — the reckoning
// partyCountFor performs, read off the fixture itself,
// since any live read now runs the pass (that is its job):
// the two held party stars carry no company clause in the
// stale wheel, so this Tender's width stands at 3 + 0.
const staleById = new Map(graphStale.nodes.map(n => [n.id, n]));
const staleCompany = ["h5", "w_b2"].flatMap(k => staleById.get(k).fx).filter(c => c.verb === "company").reduce((a, c) => a + c.amount, 0);
check("the stale fixture reads cap 3 by its own arithmetic (held party stars carry no company clause)",
  staleCompany === 0 && staleById.get("h5").fx.length === 0 && staleById.get("w_b2").fx.length === 0);
db.close();

// ── Boot 2: the pass runs ─────────────────────────────────
await boot("the pass", async () => {
  const party = await api("getParty", {}, token);
  check("the party reads cap 6 (3 + the Wide Heart's 1 + the Company Standard's 2)",
    party.data.cap === 6, JSON.stringify(party.data).slice(0, 200));
  check("the count's parts agree: partyLevel 2, musterBonus 3, levelBonus 0",
    party.data.partyLevel === 2 && party.data.musterBonus === 3 && party.data.levelBonus === 0,
    JSON.stringify({ p: party.data.partyLevel, m: party.data.musterBonus, l: party.data.levelBonus }));
  check("the party of 3 still stands in it", party.data.size === 3, `size ${party.data.size}`);
});

// ── The diff: exactly thirteen fx arrays moved ────────────
const db2 = new Database(dbPath);
const stampAfter = db2.prepare("SELECT value FROM ui_config WHERE key = ?").get(STAMP_KEY);
check("the stamp stands after the pass", stampAfter?.value === STAMP, JSON.stringify(stampAfter));
const graphAfterRaw = db2.prepare("SELECT value FROM ui_config WHERE key = 'zodiac.graph'").get().value;
const graphAfter = JSON.parse(graphAfterRaw);
check("the wheel's version is untouched (no version bump, no refund road)", graphAfter.v === graphStale.v);
check("the node count and the roads are byte-for-byte the stale wheel's",
  graphAfter.nodes.length === graphStale.nodes.length && same(graphAfter.edges, graphStale.edges));
const afterById = new Map(graphAfter.nodes.map(n => [n.id, n]));
let fxMoved = 0, othersKept = true, fieldsKept = true;
for (const staleNode of graphStale.nodes) {
  const afterNode = afterById.get(staleNode.id);
  if (!afterNode) { fieldsKept = false; continue; }
  const { fx: _sf, ...staleRest } = staleNode;
  const { fx: _af, ...afterRest } = afterNode;
  if (!same(staleRest, afterRest)) fieldsKept = false;
  if (PARTY_STARS.includes(staleNode.id)) {
    if (!same(afterNode.fx, seedFxFor(staleNode.id))) othersKept = false;
    if (!same(afterNode.fx, staleNode.fx)) fxMoved++;
  } else if (!same(afterNode.fx, staleNode.fx)) othersKept = false;
}
check("every field of every node but fx is the stale wheel's own", fieldsKept);
check("the thirteen party stars now carry the seed's clauses, and no other node's clauses moved", othersKept);
check("exactly thirteen fx arrays changed", fxMoved === 13, `moved ${fxMoved}`);
const skillsAfter = db2.prepare("SELECT owner_key, skill_key, pool, created_at FROM tender_skills WHERE owner_key = ? ORDER BY skill_key").all(ownerKey);
const partyAfter = db2.prepare("SELECT owner_key, awakened_id, added_at FROM tender_party WHERE owner_key = ? ORDER BY awakened_id").all(ownerKey);
check("the Tender's held skills are untouched by the pass", same(skillsAfter, skillsBefore), JSON.stringify({ before: skillsBefore, after: skillsAfter }));
check("the Tender's party ledger is untouched by the pass", same(partyAfter, partyBefore));
db2.close();

// ── Boot 3: the pass never runs twice ─────────────────────
await boot("idempotency", async () => {
  const party = await api("getParty", {}, token);
  check("the second boot still reads cap 6", party.data.cap === 6, JSON.stringify(party.data).slice(0, 160));
});
const db3 = new Database(dbPath);
const graphThirdRaw = db3.prepare("SELECT value FROM ui_config WHERE key = 'zodiac.graph'").get().value;
check("the persisted wheel is byte-identical after the second boot", graphThirdRaw === graphAfterRaw);
check("the stamp stands unchanged", db3.prepare("SELECT value FROM ui_config WHERE key = ?").get(STAMP_KEY)?.value === STAMP);
db3.close();

console.log(`\ndrive-party-refresh: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
