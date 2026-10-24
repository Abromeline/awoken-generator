// drive-map-locked-until-tender — THE MAP LOCKED UNTIL A
// TENDER (Nigel, 2026-10-23 22:26): "lock the terrain map
// until somebody has a tender." A visitor with no Tender
// cannot open the Terrain Map; reaching for it routes them
// to the claim through the STANDING needClaim path (the gate
// opens carrying CLAIM_GATE_NOTE), exactly as other gated
// actions already route. A claimed Tender's map is
// untouched: same button, same flip, same map.
//
// The not-yet-Tender population is broader than "guest": a
// soft visitor holds Awoken under a visitor owner key with
// NO Tender record (server/src/adopt.ts exists to move that
// state onto a Tender account at claim), so studio.tender
// stands null for them exactly as for a brand-new guest —
// and the patrol banner's twenty-count (piece 1) is one a
// soft visitor can reach. Both doors onto the map therefore
// branch on the Tender's standing, and this drive censuses
// EVERY door, not only the header button.
//
// Component-level proof (stated plainly, as with the wheel
// fix, the join-gate build and the patrol-banner build):
// the doors stand in App's tender face behind live queries
// and a live deck, so this drive proves the ruling from the
// places that honestly carry it:
//   §A App.tsx — the two door handlers (deckDoor,
//      patrolDoor), READ OUT OF THE SOURCE AND EVALUATED as
//      written against Tender standing: no Tender routes to
//      needClaim and never opens the map; a Tender's doors
//      behave exactly as before; the way back (Return) is
//      never gated.
//   §B App.tsx + client/src — the wiring and the door
//      census: both buttons open through the handlers, the
//      old bare toggle is gone, every setShowDeck(true) in
//      the whole client stands inside the two handlers, the
//      map (Territory) renders behind the one showDeck gate,
//      and needClaim / CLAIM_GATE_NOTE / the gate they land
//      on stand unchanged.
//   §C the built client bundle — the door faces and the
//      claim note ship as built from this source.
// Run after `npm run build:client` so §C reads the bundle
// this source builds.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
const count = (hay, needle) => hay.split(needle).length - 1;

const app = readFileSync(join(root, "client/src/App.tsx"), "utf8");

// Extract a `function name() { ... }` body span by brace matching.
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

// ── §A THE DOOR HANDLERS, EVALUATED AS WRITTEN ───────────
console.log("\n§A App.tsx — deckDoor and patrolDoor, read from source and evaluated by Tender standing");
const deckSrc = extractFn(app, "deckDoor");
const patrolSrc = extractFn(app, "patrolDoor");
check("both door handlers are found in App.tsx (deckDoor, patrolDoor)", !!deckSrc && !!patrolSrc);
let doors = null;
try {
  doors = new Function("tender", "showDeck", "patrolThree",
    "setShowDeck", "setPatrolIds", "needClaim",
    `${deckSrc}\n${patrolSrc}\nreturn { deckDoor, patrolDoor };`);
  check("the extracted handlers compile for evaluation", true);
} catch (e) {
  check("the extracted handlers compile for evaluation", false, String(e));
}
// Run one scenario against fresh recorders; returns the call log.
function run(tender, showDeck, which) {
  const log = { showDeck: [], patrolIds: [], needClaim: 0 };
  const api = doors(
    tender, showDeck,
    [{ id: 11 }, { id: 22 }, { id: 33 }],
    (v) => log.showDeck.push(v),
    (ids) => log.patrolIds.push(ids),
    () => { log.needClaim++; },
  );
  api[which]();
  return log;
}
const TENDER = { tenderName: "Door Tender" };
if (doors) {
  let log = run(null, false, "deckDoor");
  check("NO Tender, map closed → deckDoor routes to the claim (needClaim once) and never opens the map",
    log.needClaim === 1 && log.showDeck.length === 0, JSON.stringify(log));
  log = run(undefined, false, "deckDoor");
  check("tender standing undefined (no record yet) → the same claim route, map never opens",
    log.needClaim === 1 && log.showDeck.length === 0, JSON.stringify(log));
  log = run(TENDER, false, "deckDoor");
  check("a Tender, map closed → deckDoor opens the map as ever (setShowDeck(true)), no claim route",
    log.needClaim === 0 && log.showDeck.length === 1 && log.showDeck[0] === true, JSON.stringify(log));
  log = run(TENDER, true, "deckDoor");
  check("a Tender, map open → deckDoor returns as ever (setShowDeck(false)), no claim route",
    log.needClaim === 0 && log.showDeck.length === 1 && log.showDeck[0] === false, JSON.stringify(log));
  log = run(null, true, "deckDoor");
  check("the way back is never gated: map standing open → deckDoor closes it (setShowDeck(false)) even with no Tender",
    log.needClaim === 0 && log.showDeck.length === 1 && log.showDeck[0] === false, JSON.stringify(log));
  log = run(null, false, "patrolDoor");
  check("NO Tender → the patrol banner's Send routes to the claim; the patrol is never set and the map never opens",
    log.needClaim === 1 && log.patrolIds.length === 0 && log.showDeck.length === 0, JSON.stringify(log));
  log = run(TENDER, false, "patrolDoor");
  check("a Tender → the patrol Send behaves as ever: the patrol is set (the three, in order) and the map opens; no claim route",
    log.needClaim === 0 && log.patrolIds.length === 1
    && JSON.stringify(log.patrolIds[0]) === "[11,22,33]"
    && log.showDeck.length === 1 && log.showDeck[0] === true, JSON.stringify(log));
}

// ── §B THE WIRING AND THE DOOR CENSUS ────────────────────
console.log("\n§B App.tsx + client/src — both buttons wired to the handlers; every door onto the map accounted for");
check("the header deck-button opens through deckDoor (class, aria-labels unchanged; the open face now reads RETURN — the way-back ruling, Nigel 2026-10-23 23:33, landed by the homeland tutorial redo)",
  app.includes('<button onClick={deckDoor} className="deck-button" aria-label={showDeck ? "Return to the ritual" : "View your decks"}>')
  && app.includes("<span>{showDeck ? \"RETURN\" : \"Terrain Map\"}</span>"));
check("the old bare toggle is gone (no setShowDeck flip remains in App.tsx)",
  !app.includes("setShowDeck((value) => !value)") && !app.includes("setShowDeck(v => !v)") && !app.includes("setShowDeck((v) => !v)"));
check("the patrol banner's Send opens through patrolDoor, its words unchanged",
  app.includes('<button type="button" className="patrol-banner-send" onClick={patrolDoor}>Send these three to claim the starseed</button>'));
const deckAt = app.indexOf("function deckDoor(");
const patrolAt = app.indexOf("function patrolDoor(");
const patrolEnd = patrolSrc ? patrolAt + patrolSrc.length : -1;
const trueAt = [...app.matchAll(/setShowDeck\(true\)/g)].map((m) => m.index);
check("exactly two setShowDeck(true) stand in App.tsx — one in each door handler, nowhere else",
  trueAt.length === 2 && deckAt >= 0 && patrolEnd > patrolAt
  && trueAt.every((i) => i > deckAt && i < patrolEnd),
  `found ${trueAt.length}`);
// Census the whole client: setShowDeck lives only in App.tsx,
// and Territory (the map) renders behind the one showDeck gate.
const srcDir = join(root, "client/src");
const offenders = [];
for (const f of readdirSync(srcDir)) {
  if (!/\.(ts|tsx)$/.test(f) || f === "App.tsx") continue;
  const text = readFileSync(join(srcDir, f), "utf8");
  if (text.includes("setShowDeck")) offenders.push(f);
}
check("no other client file touches setShowDeck (no side door onto the map)",
  offenders.length === 0, offenders.join(", "));
check("the map renders at exactly one site, behind the showDeck gate ({showDeck ? <Territory)",
  count(app, "<Territory ") === 1 && app.includes("{showDeck ? <Territory "));
check("needClaim stands unchanged — the gate opens carrying CLAIM_GATE_NOTE",
  app.includes("function needClaim() {\n    setGateNote(CLAIM_GATE_NOTE);\n    setShowGate(true);\n  }"));
check("CLAIM_GATE_NOTE stands unchanged, exactly once",
  count(app, "const CLAIM_GATE_NOTE = \"The Awokin are waiting — but the waking is for Tenders.") === 1);
check("the gate the route lands on is the standing TenderGate, receiving the note",
  app.includes("<TenderGate onDone={handleTenderDone} note={gateNote} />"));
check("the patrol banner's reckoning stands as piece 1 left it (twenty-count, standing seed conditions)",
  app.includes("const showPatrolBanner = tenderItems.length >= 20 && !!patrolTerritoryQ.data"));

// ── §C THE BUILT BUNDLE ──────────────────────────────────
console.log("\n§C the built client bundle — the door faces and the claim note ship");
const distAssets = join(root, "client/dist/assets");
check("client/dist/assets exists (build the client first)", existsSync(distAssets));
let bundle = "";
if (existsSync(distAssets)) {
  for (const f of readdirSync(distAssets)) {
    if (f.endsWith(".js")) bundle += readFileSync(join(distAssets, f), "utf8") + "\n";
  }
}
check("the bundle carries the header door's faces (Terrain Map / RETURN, the aria-label unchanged)",
  bundle.includes("Terrain Map") && bundle.includes("Return to the ritual") && bundle.includes("RETURN"));
check("the bundle carries the claim note the no-Tender route lands on",
  bundle.includes("The Awokin are waiting — but the waking is for Tenders."));
check("the bundle carries the patrol banner and its Send (the Tender's second door, intact)",
  bundle.includes("patrol-banner-send") && bundle.includes("Send these three to claim the starseed"));

console.log(`\ndrive-map-locked-until-tender: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
