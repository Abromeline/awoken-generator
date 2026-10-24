// drive-claim-first-choose-at-three — FRONT INTRO PIECE 3:
// CLAIM FIRST, THEN WAKE, CHOOSE AT THREE (Nigel, 2026-10-23
// 22:26 as amended 22:36 — the amendment governs; the earlier
// choose-first reading is struck). The ruling's own sequence:
// (a) CLAIM FIRST — "Account name and password comes before
// waking any awoken": no Awoken can be woken before an account
// exists; an accountless reach for Wake One routes to the
// claim through the standing needClaim path (CLAIM_GATE_NOTE
// + the gate). (b) CHOOSE AT THREE — after waking their first
// three Awoken, a claimed Tender gets the choosing ceremony
// (class, then runic weapon; ClassChoosing's two gifts reused
// whole); the level-3 gate dies. (c) CATCH-UP — the new
// trigger itself serves any claimed classless Tender already
// holding three or more. (d) ENCOURAGEMENT, NOT A LOCK — after
// the choosing, words encourage waking all twenty and
// reaching for level 3 before the cursed lands; nothing gates
// the map/field on level or count. No side intro: everything
// inside the standing front flow and ceremony component.
//
// Proof shape (stated plainly, as with piece 2): the wake
// guard and the ceremony trigger stand in App's tender face
// behind live queries and a live deck, so §A/§B prove them
// from the source as written — the guard READ OUT AND
// EVALUATED by standing, every wake entry's guard-first
// order censused, and the host's trigger condition READ OUT
// AND EVALUATED by standing. §C lives the server half
// against the real API on a scratch server: the choosing's
// count gate, a claimed Tender waking for real, class +
// weapon binding through the standing actions, and the
// catch-up population. §D reads the built bundle.
//
// Run after `npm run build` (server + client) so §C boots
// this source's server and §D reads this source's bundle.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
const count = (hay, needle) => hay.split(needle).length - 1;

const app = readFileSync(join(root, "client/src/App.tsx"), "utf8");
const choosing = readFileSync(join(root, "client/src/ClassChoosing.tsx"), "utf8");
const actions = readFileSync(join(root, "server/src/actions.ts"), "utf8");
const tenderExpSrc = readFileSync(join(root, "server/src/tenderExp.ts"), "utf8");
const apiTs = readFileSync(join(root, "client/src/api.ts"), "utf8");

// Extract a `function name(...) { ... }` span by brace matching.
function extractFn(src, name) {
  const at = src.indexOf(`function ${name}(`);
  if (at < 0) return null;
  const open = src.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  return null;
}

// ── §A CLAIM FIRST — the guard, evaluated; every wake entry ──
console.log("\n§A App.tsx — routeGuestToClaim read from source and evaluated by standing");
const guardSrc = extractFn(app, "routeGuestToClaim");
check("the guard stands in WakeRitual (routeGuestToClaim)", !!guardSrc);
let guard = null;
try {
  guard = new Function("collection", "signedIn", "onNeedClaim",
    `${guardSrc}\nreturn routeGuestToClaim;`);
  check("the extracted guard compiles for evaluation", true);
} catch (e) {
  check("the extracted guard compiles for evaluation", false, String(e));
}
function runGuard(collection, signedIn) {
  let claims = 0;
  const fn = guard(collection, signedIn, () => { claims++; });
  return { routed: fn(), claims };
}
if (guard) {
  let r = runGuard("tender", false);
  check("tender face, NOT signed in → the guard routes to the claim (returns true, onNeedClaim once)",
    r.routed === true && r.claims === 1, JSON.stringify(r));
  r = runGuard("tender", undefined);
  check("tender face, signed-in standing undefined (no Tender record) → the same claim route",
    r.routed === true && r.claims === 1, JSON.stringify(r));
  r = runGuard("tender", true);
  check("tender face, signed in (a claimed Tender) → the guard stands aside (false, no claim route) — the wake proceeds",
    r.routed === false && r.claims === 0, JSON.stringify(r));
  r = runGuard("workshop", undefined);
  check("workshop face untouched → the guard never fires there (false, no claim route)",
    r.routed === false && r.claims === 0, JSON.stringify(r));
}
console.log("\n§A2 App.tsx — the guard stands at the head of EVERY wake entry, before any ceremony or API call");
const entries = [
  ["onWakeButton", ["checkout.mutate", "wakeOne()"]],
  ["wakeFreeAtSpark", ["startCeremony", "api.claimFreeWake"]],
  ["claimWaitingFree", ["api.claimWelcome"]],
  ["reconstituteWaitingFree", ["api.reconstituteWelcome"]],
];
for (const [name, tokens] of entries) {
  const src = extractFn(app, name) ?? (name === "onWakeButton" ? null : extractFn(app, name));
  const asyncSrc = src ?? (() => { const at = app.indexOf(`async function ${name}(`); if (at < 0) return null; const open = app.indexOf("{", at); let d = 0; for (let i = open; i < app.length; i++) { if (app[i] === "{") d++; else if (app[i] === "}") { d--; if (d === 0) return app.slice(at, i + 1); } } return null; })();
  const body = asyncSrc ?? "";
  const g = body.indexOf("if (routeGuestToClaim()) return;");
  check(`${name}: found, and its first move is the guard`, !!body && g >= 0, body.slice(0, 80));
  for (const t of tokens) {
    const ti = body.indexOf(t);
    check(`${name}: the guard stands before ${t} (no wake is served, no ceremony starts, accountless)`,
      g >= 0 && ti > g, `guard ${g}, ${t} ${ti}`);
  }
}
check("the guard is defined exactly once and called at exactly the four wake entries (5 standings of its name)",
  count(app, "routeGuestToClaim") === 5, `found ${count(app, "routeGuestToClaim")}`);
check("the tender face passes the Tender's standing into WakeRitual (signedIn={!!tender}); the workshop face passes nothing new",
  app.includes("signedIn={!!tender}") && app.includes('<WakeRitual assets={wassets} collection="workshop"'));
check("the route lands on the standing claim path — needClaim and CLAIM_GATE_NOTE unchanged",
  app.includes("function needClaim() {\n    setGateNote(CLAIM_GATE_NOTE);\n    setShowGate(true);\n  }")
  && count(app, "const CLAIM_GATE_NOTE = \"The Awokin are waiting — but the waking is for Tenders.") === 1);

// ── §B CHOOSE AT THREE — the ceremony trigger, evaluated ──
console.log("\n§B App.tsx — the ClassChoosingHost trigger, read from source and evaluated by standing");
const hostAt = app.indexOf("function ClassChoosingHost(");
const hostSpan = hostAt >= 0 ? app.slice(hostAt, hostAt + 1600) : "";
const condMatch = hostSpan.match(/if \(data && (.+?) && !seen\)/);
check("the host's trigger condition is found in ClassChoosingHost", !!condMatch, hostSpan.slice(0, 200));
let trigger = null;
if (condMatch) {
  try { trigger = new Function("data", `return !!(${condMatch[1]});`); check("the extracted trigger condition compiles for evaluation", true); }
  catch (e) { check("the extracted trigger condition compiles for evaluation", false, String(e)); }
}
if (trigger) {
  check("a LEVEL-1 Tender holding three woken, classless → the ceremony IS offered (no level 3 anywhere in it)",
    trigger({ awokenCount: 3, classKey: null, level: 1 }) === true);
  check("a LEVEL-2 Tender holding three woken, classless → the ceremony IS offered",
    trigger({ awokenCount: 3, classKey: null, level: 2 }) === true);
  check("CATCH-UP: an existing classless Tender holding twenty, at Lv 1 → the same trigger serves them",
    trigger({ awokenCount: 20, classKey: null, level: 1 }) === true);
  check("two woken, even at Lv 9 → NOT offered (level no longer substitutes for the count)",
    trigger({ awokenCount: 2, classKey: null, level: 9 }) === false);
  check("zero woken at Lv 3 → NOT offered (the dead gate stays dead)",
    trigger({ awokenCount: 0, classKey: null, level: 3 }) === false);
  check("a CLASSED Tender holding five → NOT re-offered by the intro trigger",
    trigger({ awokenCount: 5, classKey: "witch", level: 1 }) === false);
}
check("the trigger reckons by awokenCount (the held count), and the host span carries no level reckoning",
  !!condMatch && condMatch[1].includes("awokenCount >= 3") && !hostSpan.includes("data.level"));
check("TenderProgressView carries awokenCount, reckoned from awakened rows (collection \"tender\") under the owner key",
  tenderExpSrc.includes("awokenCount: number") && tenderExpSrc.includes('eq(schema.awakened.collection, "tender")'));
check("the api.ts getTenderExp type carries awokenCount", apiTs.includes("pools: Record<string, number>; awokenCount: number"));
console.log("\n§B2 server/src/actions.ts — chooseClass: the level gate dead, the count gate standing, the rite paths untouched");
const ccAt = actions.indexOf("async chooseClass(");
const cwAt = actions.indexOf("async chooseWeapon(");
const ccSpan = ccAt >= 0 && cwAt > ccAt ? actions.slice(ccAt, cwAt) : "";
check("chooseClass refuses a FIRST choosing only when classless and under three held",
  ccSpan.includes("if (!progress.classKey && progress.awokenCount < 3)"));
check("chooseClass carries no level reckoning and the old Lv-3 refusal is gone from the whole server",
  ccSpan.length > 0 && !ccSpan.includes("progress.level") && !actions.includes("The choosing comes at Lv 3"));
check("the refusal speaks the new law (first three wakes)", ccSpan.includes("first three wakes"));
check("the second-thoughts rite and reclass-token paths stand in chooseClass as they stood",
  ccSpan.includes("the second-thoughts rite") && ccSpan.includes("a reclass token") && ccSpan.includes("Your class is sealed"));
const cwSpan = cwAt >= 0 ? actions.slice(cwAt, cwAt + 2600) : "";
check("chooseWeapon binds as-is: its only standing gate is classKey (no level, no count)",
  cwSpan.includes("if (!progress.classKey)") && !cwSpan.includes("progress.level") && !cwSpan.includes("awokenCount"));
check("KNOWN TENSION, left standing as ruled: the ClassDoorChip still shows '· class at Lv 3' to a sub-3-level Tender",
  app.includes("· class at Lv 3") && app.includes("Your class wakes at Lv 3"));

// ── §C THE SERVER HALF, LIVED ─────────────────────────────
console.log("\n§C the choosing lived against the real API on a scratch server");
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-three-"));
process.env.PORT = "39969";
process.env.WORKSHOP_PASSWORD = "three-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
await import("../server/dist/index.js");
await new Promise((r) => setTimeout(r, 2500));
const BASE = "http://127.0.0.1:39969";
async function api(action, args, token, visitorId) {
  const res = await fetch(`http://127.0.0.1:39969/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}), ...(visitorId ? { "x-visitor-id": visitorId } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const errText = (r) => String(r.data?.error ?? r.data?.message ?? "");
const db = new Database(join(process.env.DATA_DIR, "app.db"));
const portrait = readFileSync(join(root, "client/src/assets/auras/haze-01.png")).toString("base64");
const layers = ["body", "arms", "head"].map((cat) => ({ source_id: `drive3:${cat}`, name: `Three ${cat}`, category: cat, rarity: "common", power: 1, toughness: 1, element: "root" }));

// The hole the guard closes, named on the server's own word:
// a grandfathered soft visitor is still SERVED a free wake
// end-to-end (welcome.ts untouched, as ruled) — the client
// guard is what now stands between that serving and a player.
db.prepare("INSERT INTO visitors (visitor_id, created_at, welcome_wakes_granted, welcome_claimed, last_free_wake_at) VALUES (?, ?, 1, 1, ?)").run("granddad123", Date.now(), Date.now() - 5 * 60 * 60 * 1000);
const served = await fetch(`${BASE}/api/welcome/free-wake`, { method: "POST", headers: { "content-type": "application/json", "x-visitor-id": "granddad123" }, body: JSON.stringify({ layers, imageBase64: portrait }) }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));
check("THE HOLE, NAMED: the server's welcome door still serves a grandfathered soft visitor a free wake (200) — the client guard is the closing door, per the plan",
  served.status === 200 && !!served.data.awakened, `status ${served.status} ${JSON.stringify(served.data).slice(0, 120)}`);
const brandNew = await fetch(`${BASE}/api/welcome/free-wake`, { method: "POST", headers: { "content-type": "application/json", "x-visitor-id": "brandnew999" }, body: JSON.stringify({ layers, imageBase64: portrait }) });
check("a brand-new soft visitor is refused by the welcome door itself (403)", brandNew.status === 403, `status ${brandNew.status}`);
const anonWake = await api("saveAwoken", { layers, imageBase64: portrait, collection: "tender", ownerName: "Nobody" });
check("the credit Wake One's server backstop stands: accountless saveAwoken refuses (403)",
  anonWake.status === 403, `status ${anonWake.status}`);

// A claimed Tender wakes — for real, through saveAwoken.
const claim = await api("claimTender", { password: "three-password-1", tenderName: "Three Tender" });
check("a Tender claims (name + password first, as ruled)", claim.status === 200 && !!claim.data.token, JSON.stringify(claim.data).slice(0, 120));
const token = claim.data.token;
let exp = await api("getTenderExp", {}, token);
check("the new Tender stands Lv 1, classless, holding none", exp.data.level === 1 && exp.data.classKey === null && exp.data.awokenCount === 0, JSON.stringify(exp.data).slice(0, 160));
for (let i = 1; i <= 3; i++) {
  const w = await api("saveAwoken", { layers, imageBase64: portrait, collection: "tender", ownerName: "Three Tender" }, token);
  check(`a claimed Tender wakes (${i} of 3) through the standing Wake One action`, w.status === 200 && typeof w.data.id === "number", `status ${w.status} ${JSON.stringify(w.data).slice(0, 100)}`);
  exp = await api("getTenderExp", {}, token);
  check(`after wake ${i}: awokenCount reads ${i}`, exp.data.awokenCount === i, `count ${exp.data.awokenCount}`);
  if (i === 2) {
    const early = await api("chooseClass", { classKey: "witch" }, token);
    check("at TWO held, the choosing still refuses — the count, not the level, is the gate",
      early.status === 400 && errText(early).includes("first three wakes"), `status ${early.status} ${errText(early)}`);
  }
}
check("the three wakes leave the Tender at LEVEL 1 (30 EXP) — what follows happens WITHOUT level 3",
  exp.data.level === 1, `level ${exp.data.level} exp ${exp.data.totalExp}`);
const chosen = await api("chooseClass", { classKey: "witch" }, token);
check("CHOOSE AT THREE, LIVED: at three held, Lv 1, the first choosing lands (via the calling)",
  chosen.status === 200 && chosen.data.classKey === "witch" && chosen.data.via === "the calling", `status ${chosen.status} ${JSON.stringify(chosen.data).slice(0, 140)}`);
const weapon = await api("chooseWeapon", { weaponKey: "sword" }, token);
check("the second gift binds through the standing action (via the choosing)",
  weapon.status === 200 && weapon.data.weaponKey === "sword" && weapon.data.via === "the choosing", `status ${weapon.status} ${JSON.stringify(weapon.data).slice(0, 120)}`);
exp = await api("getTenderExp", {}, token);
check("the record carries class + weapon, count still three",
  exp.data.classKey === "witch" && exp.data.weaponKey === "sword" && exp.data.awokenCount === 3, JSON.stringify(exp.data).slice(0, 200));

// Catch-up, lived: an existing classless Tender who already
// holds three (rows woken before this law) chooses at Lv 1.
const claimB = await api("claimTender", { password: "three-password-2", tenderName: "Catchup Tender" });
const tokenB = claimB.data.token;
const idB = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claimB.data.tender.code).id;
const keyB = `tender:${idB}`;
const insB = db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, '[]', 'tender', 'Catchup Tender', ?, ?)");
for (const n of ["Held One", "Held Two", "Held Three"]) insB.run(n, n, `drive3/${n}.png`, keyB, Date.now());
exp = await api("getTenderExp", {}, tokenB);
check("CATCH-UP: the existing classless Tender's read carries three held at Lv 1",
  exp.data.awokenCount === 3 && exp.data.level === 1 && exp.data.classKey === null, JSON.stringify(exp.data).slice(0, 160));
const chosenB = await api("chooseClass", { classKey: "binder" }, tokenB);
check("CATCH-UP, LIVED: the new trigger's population chooses — no level demanded",
  chosenB.status === 200 && chosenB.data.classKey === "binder", `status ${chosenB.status} ${JSON.stringify(chosenB.data).slice(0, 120)}`);

// ── §D ENCOURAGEMENT + THE BUILT BUNDLE ───────────────────
console.log("\n§D ClassChoosing.tsx — the encouragement stands on the completion panel; the bundle ships it");
const ENCOURAGEMENT = "Wake all twenty of your welcome wakes when you can, and grow toward level 3 before you press deep into the cursed lands. No door is locked to you — the map and the field stand open — but go early and the dark presses harder: while you stand on cursed ground before level 3, or with fewer than twenty Awoken held, what the cursed lands birth against you stands a step stronger, deeper in kind and greater in number, until both marks are met. Twenty friends at your side and a Tender's strength behind them will hold far steadier when the curse tests you.";
const doneAt = choosing.indexOf("You are the {TENDER_CLASSES[done.classKey].label}");
const encAt = choosing.indexOf(ENCOURAGEMENT);
const treeAt = choosing.indexOf("Open the skill tree");
check("the encouragement words stand verbatim, exactly once, in ClassChoosing.tsx",
  encAt >= 0 && count(choosing, ENCOURAGEMENT) === 1);
check("they stand on the COMPLETION panel (after both gifts are taken: after 'You are the …', with the panel's own buttons)",
  doneAt >= 0 && encAt > doneAt && treeAt > encAt);
check("the words encourage, and lock nothing: they name all twenty, level 3, the cursed lands — and that no door is locked",
  ENCOURAGEMENT.includes("all twenty") && ENCOURAGEMENT.includes("level 3") && ENCOURAGEMENT.includes("cursed lands") && ENCOURAGEMENT.includes("No door is locked to you"));
check("the words now carry the early-entry law's teeth in plain words (Nigel, 2026-10-23 23:33): go early and the dark presses harder, a step stronger until both marks are met",
  ENCOURAGEMENT.includes("go early and the dark presses harder") && ENCOURAGEMENT.includes("before level 3, or with fewer than twenty Awoken held") && ENCOURAGEMENT.includes("a step stronger, deeper in kind and greater in number, until both marks are met"));
check("the ceremony's eyebrows no longer speak the dead gate ('Level 3 — the choosing' gone; 'Three woken — the choosing' stands)",
  !choosing.includes("Level 3 — the choosing") && count(choosing, "Three woken — the choosing") === 2);
const distAssets = join(root, "client/dist/assets");
check("client/dist/assets exists (build the client first)", existsSync(distAssets));
let bundle = "";
if (existsSync(distAssets)) {
  for (const f of readdirSync(distAssets)) {
    if (f.endsWith(".js")) bundle += readFileSync(join(distAssets, f), "utf8") + "\n";
  }
}
check("the built bundle carries the encouragement words", bundle.includes("Wake all twenty of your welcome wakes"));
check("the built bundle carries the claim note the accountless route lands on",
  bundle.includes("The Awokin are waiting — but the waking is for Tenders."));
check("the built bundle carries the ceremony's new eyebrow (Three woken — the choosing)", bundle.includes("Three woken"));

console.log(`\ndrive-claim-first-choose-at-three: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
