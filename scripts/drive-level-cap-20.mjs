// drive-level-cap-20 — THE CAP AT TWENTY, THE CLIMB SOFTENED,
// THE SIZE SPREAD (Nigel, 2026-10-24: "lets increase awoken lvl
// cap to 20, and spread the size gain out over that distance with
// the current max" — and, the same hour: "soften the climb to
// make 20 more of a 3 month long goal of active play").
// Proven here against the real API on a scratch server:
//   §S THE SEAMS, read from the source as written: the cap
//      constant stands at 20 in the one derivation every card
//      level flows through; the softened ratio (1.381) stands
//      in xpForLevel; the growth step (×1.0848077 — the old
//      nine-step total, 1.1875^9 ≈ 4.6957, taken as nineteen
//      steps) stands in all four size readers and the old step
//      in none; the Tender's own level system carries no trace
//      of the Awoken cap.
//   §A THE DERIVATION, LIVED: a real Awoken woken through the
//      standing Wake One action, its stored XP set by hand in
//      the scratch DB (fixture state, as the other drives set
//      theirs), and its level read back through the real
//      getStudio payload — the very numbers the client renders.
//      Boundary by boundary: each landmark of the softened
//      table turns exactly where the table says, the twentieth
//      level stands at 100,096 XP, and no depth of XP beyond
//      it reads past 20 — at the cap the payload's next reads
//      as its current and the road-to-next reckons to zero.
//      (XP grants themselves flow through grantXp, whose old
//      and new levels both come from this same derivation.)
//   §B THE SIZE ROAD, EVALUATED: from the step as landed —
//      Lv1 ×1, Lv10 ≈ ×2.0805 (the size the old step gave at
//      ≈Lv5.26), Lv20 ≈ ×4.6957 — the old maximum itself,
//      reached now only at the cap.
// Run after `npm run build` (the drive boots server/dist).
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-cap20-"));
process.env.PORT = "39971";
process.env.WORKSHOP_PASSWORD = "cap20-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;
process.chdir(root);
const BASE = "http://127.0.0.1:39971";
const PW = "cap20-drive-password";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

await import("../server/dist/index.js");
await sleep(2500);

async function callRaw(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
async function call(action, args, token) {
  const r = await callRaw(action, args, token);
  if (r.status !== 200) throw new Error(`${action} -> ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));

/* ── §S THE SEAMS ─────────────────────────────────────────── */
console.log("§S the seams — cap, climb and step, read from the source as written");
{
  const actions = readFileSync("server/src/actions.ts", "utf8");
  const table = readFileSync("server/src/table.ts", "utf8");
  const territory = readFileSync("client/src/Territory.tsx", "utf8");
  const tenderExp = readFileSync("server/src/tenderExp.ts", "utf8");

  ok("the cap constant stands at 20, exported from the level derivation's own home",
    actions.includes("export const AWOKEN_LEVEL_CAP = 20;"));
  ok("levelForXp's climb stops at the cap — the loop itself is gated",
    actions.includes("while (level < AWOKEN_LEVEL_CAP && xpForLevel(level + 1) <= xp) level++;"));
  ok("at the cap, xpProgress reads next as current — no road past twenty is promised",
    actions.includes("const next = level >= AWOKEN_LEVEL_CAP ? current : xpForLevel(level + 1);"));
  ok("the softened climb stands in xpForLevel — base 60, ratio 1.381",
    actions.includes("return Math.round(60 * (Math.pow(1.381, level) - 1) / 0.381);"),
    "xpForLevel body not found as written");
  ok("the morning's steeper ratio survives nowhere in the derivation",
    !actions.includes("Math.pow(1.75, level)"));

  const stepCount = (src) => src.split("Math.pow(1.0848077").length - 1;
  ok("the spread step stands in the server's march figure (actions.ts)",
    stepCount(actions) === 1, `count ${stepCount(actions)}`);
  ok("the spread step stands in the Table's march figure (table.ts)",
    stepCount(table) === 1, `count ${stepCount(table)}`);
  ok("the spread step stands in BOTH of the homeland's readers — the march and the figure draw (Territory.tsx)",
    stepCount(territory) === 2, `count ${stepCount(territory)}`);
  ok("the old step (×1.1875) drives no reader anywhere — history in comments only, never in a pow",
    !actions.includes("Math.pow(1.1875") && !table.includes("Math.pow(1.1875") && !territory.includes("Math.pow(1.1875"));
  ok("the Tender's own level system is untouched by the Awoken cap — no trace of it in tenderExp.ts",
    !tenderExp.includes("AWOKEN_LEVEL_CAP") && !tenderExp.includes("1.381"));
}

/* ── §A THE DERIVATION, LIVED ─────────────────────────────── */
console.log("§A the derivation, lived — one real Awoken, its payload read at every boundary");
const claim = await call("claimTender", { password: PW, tenderName: "Cap Twenty" });
ok("the Tender claims first, as ruled", !!claim.token && !!claim.tender?.code);
const token = claim.token;
const portrait = readFileSync(join(root, "client/src/assets/auras/haze-01.png")).toString("base64");
const wakeLayers = ["body", "arms", "head"].map((cat) => ({ source_id: `cap20:${cat}`, name: `Cap Twenty ${cat}`, category: cat, rarity: "common", power: 3, toughness: 3, element: "root" }));
const woken = await call("saveAwoken", { layers: wakeLayers, imageBase64: portrait, collection: "tender", ownerName: "Cap Twenty" }, token);
ok("the Awoken wakes for real through the standing Wake One action", typeof woken.id === "number", JSON.stringify(woken).slice(0, 100));
const awId = woken.id;

const setXp = (xp) => db.prepare("UPDATE awakened SET experience = ? WHERE id = ?").run(xp, awId);
async function payloadAt(xp) {
  setXp(xp);
  const studio = await call("getStudio", {}, token);
  return (studio.awakened ?? []).find((a) => a.id === awId);
}

{
  // The softened table, hard-coded from the ruling's reckoning —
  // if the shipped curve disagreed, these boundaries would fail.
  const boundaries = [
    [0, 0], [59, 0], [60, 1],           // the first level at 60
    [142, 1], [143, 2], [257, 3],       // the early climb
    [633, 4], [634, 5],                 // mid-curve
    [3815, 9], [3816, 10],              // level 10 — the softened 3,816 (was 21,471 at 1.75)
    [19800, 14], [19801, 15],           // the deep road
    [100095, 19], [100096, 20],         // the cap itself, at ≈100k
  ];
  for (const [xp, want] of boundaries) {
    const p = await payloadAt(xp);
    ok(`at ${xp} XP the payload reads level ${want}`, p?.level === want, `read ${p?.level}`);
  }
  const at10 = await payloadAt(3816);
  ok("at level 10 the payload's span stands open toward 11 (current 3,816 · next 5,330)",
    at10?.xp_current === 3816 && at10?.xp_next === 5330,
    JSON.stringify({ cur: at10?.xp_current, next: at10?.xp_next }));

  for (const deep of [200000, 10000000]) {
    const p = await payloadAt(deep);
    ok(`at ${deep} XP the level holds at the cap — 20, never beyond`,
      p?.level === 20, `read ${p?.level}`);
    ok(`at ${deep} XP the cap reads whole: next = current (100,096), nothing owed, the bar full`,
      p?.xp_current === 100096 && p?.xp_next === 100096 && p?.xp_for_next_level === 0 && p?.xp_progress === 1,
      JSON.stringify({ cur: p?.xp_current, next: p?.xp_next, forNext: p?.xp_for_next_level, prog: p?.xp_progress }));
  }
  const stored = db.prepare("SELECT experience FROM awakened WHERE id = ?").get(awId);
  ok("the cap never touches stored XP — the veteran's total stands as earned, only the reading is capped",
    stored?.experience === 10000000, `stored ${stored?.experience}`);
}

/* ── §B THE SIZE ROAD, EVALUATED ──────────────────────────── */
console.log("§B the size road — the landed step, evaluated");
{
  const STEP = 1.0848077;
  const sizeAt = (level) => Math.pow(STEP, level - 1);
  ok("level 1 stands at base size — ×1 exactly", sizeAt(1) === 1);
  ok("level 10 stands ≈ ×2.0805 — the size the old step gave at ≈ level 5.26",
    Math.abs(sizeAt(10) - 2.0805) < 0.001, `read ${sizeAt(10)}`);
  ok("level 20 stands at the old maximum itself — ≈ ×4.6957, the old nine-step total untouched",
    Math.abs(sizeAt(20) - Math.pow(1.1875, 9)) < 0.001 && Math.abs(sizeAt(20) - 4.6957) < 0.001,
    `read ${sizeAt(20)} vs old total ${Math.pow(1.1875, 9)}`);
  ok("the spread is honest: nineteen of the new steps compound to the old nine (the total gain is preserved, only its road lengthened)",
    Math.abs(Math.pow(STEP, 19) - Math.pow(1.1875, 9)) < 0.001,
    `${Math.pow(STEP, 19)} vs ${Math.pow(1.1875, 9)}`);
}

console.log(`\ndrive-level-cap-20: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
