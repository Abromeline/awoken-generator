// drive-long-road — THE LONG ROAD, REAL (Nigel, ruled
// 2026-10-22): the Tender level cap is 104, the road is sane
// to 42 and steep past it, baked into the one threshold
// table — the same road for everyone. Proven against the
// real API on a scratch server: the boundary EXP totals read
// their ruled levels through the game's own progress view,
// the skill purse pays level × 2 all the way to the wheel's
// whole cost of 208 at the cap, and at the cap the view
// honestly reports no next level. Levels 1–10 are the
// original table, so the anchor stands: 150 EXP = Lv 3, and
// no stored EXP total changes its level.
import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-long-road-"));
process.env.DATA_DIR = DATA_DIR;
process.env.PORT = "39983";
process.env.WORKSHOP_PASSWORD = "test-password-1";
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

const db = new Database(join(DATA_DIR, "app.db"));
const { levelForExp, TENDER_LEVEL_THRESHOLDS } = await import("../server/dist/tenderExp.js");

async function api(action, args, token) {
  const res = await fetch(`http://127.0.0.1:39983/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

check("the table holds 104 thresholds", TENDER_LEVEL_THRESHOLDS.length === 104, `length ${TENDER_LEVEL_THRESHOLDS.length}`);
check("levels 1–10 are the original table, byte-identical",
  JSON.stringify(TENDER_LEVEL_THRESHOLDS.slice(0, 10)) === JSON.stringify([0, 50, 150, 300, 500, 800, 1200, 1800, 2600, 3800]));
check("landmarks: Lv 42 = 73,150 · Lv 43 = 80,050 · Lv 50 = 139,050 · Lv 75 = 624,600 · Lv 104 = 2,768,700",
  TENDER_LEVEL_THRESHOLDS[41] === 73150 && TENDER_LEVEL_THRESHOLDS[42] === 80050 &&
  TENDER_LEVEL_THRESHOLDS[49] === 139050 && TENDER_LEVEL_THRESHOLDS[74] === 624600 &&
  TENDER_LEVEL_THRESHOLDS[103] === 2768700,
  `L42 ${TENDER_LEVEL_THRESHOLDS[41]} L43 ${TENDER_LEVEL_THRESHOLDS[42]} L50 ${TENDER_LEVEL_THRESHOLDS[49]} L75 ${TENDER_LEVEL_THRESHOLDS[74]} L104 ${TENDER_LEVEL_THRESHOLDS[103]}`);

const claim = await api("claimTender", { password: "test-password-1", tenderName: "Road Walker" });
check("tender claimed", claim.status === 200 && !!claim.data.token, JSON.stringify(claim.data).slice(0, 120));
const token = claim.data.token;
const tenderId = db.prepare("SELECT id FROM tenders WHERE tender_name = 'Road Walker'").get().id;
const ownerKey = `tender:${tenderId}`;
const setExp = (exp) => db.prepare(
  "INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp"
).run(ownerKey, exp, Date.now());

// The boundary readings — through the game's own progress
// view, so the level the player is shown is the level proven.
const cases = [
  [0, 1], [149, 2], [150, 3], [3800, 10],
  [73149, 41], [73150, 42], [80050, 43],
  [2768700, 104], [10 ** 12, 104],
];
for (const [exp, want] of cases) {
  check(`levelForExp(${exp}) = ${want}`, levelForExp(exp) === want, `got ${levelForExp(exp)}`);
  setExp(exp);
  const view = (await api("getTenderExp", {}, token)).data;
  check(`progress view at ${exp} EXP reads Lv ${want}`, view.level === want, `got ${view.level}`);
}

// The purse: 2 points a level, all the way up.
setExp(73150);
let tree = (await api("getSkillTree", {}, token)).data;
check("at Lv 42 the purse holds 84 (42 × 2)", tree.level === 42 && tree.tree?.total === 84, JSON.stringify({ level: tree.level, tree: tree.tree }));
setExp(2768700);
tree = (await api("getSkillTree", {}, token)).data;
check("at Lv 104 the purse holds 208 (104 × 2) — the whole wheel's cost", tree.level === 104 && tree.tree?.total === 208, JSON.stringify({ level: tree.level, tree: tree.tree }));

// At the cap the view has no next level to point at.
const capView = (await api("getTenderExp", {}, token)).data;
check("at the cap, expForNextLevel is null", capView.level === 104 && capView.expForNextLevel === null, JSON.stringify({ level: capView.level, next: capView.expForNextLevel }));
setExp(10 ** 12);
const pastCap = (await api("getTenderExp", {}, token)).data;
check("past the cap the level still holds at 104, next still null", pastCap.level === 104 && pastCap.expForNextLevel === null, JSON.stringify({ level: pastCap.level, next: pastCap.expForNextLevel }));

console.log(`\ndrive-long-road: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
