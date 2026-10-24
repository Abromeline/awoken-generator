// drive-patrol-banner-twenty — THE PATROL BANNER AT TWENTY
// (Nigel, 2026-10-23 22:26): the patrol banner "shouldn't pop
// up until after 20" — the First Seed banner and its Send
// button appear only once the Tender holds TWENTY Awoken,
// with its standing seed conditions (the patrolTerritoryQ
// reckoning) kept exactly, and the patrol it sends still the
// first three (patrolThree, hatch order). The Send button's
// new words — "Send these three to claim the starseed" —
// are a KEEPER PENCIL, not Nigel's words, awaiting his strike.
//
// Component-level proof (stated plainly, as with the wheel
// fix and the join-gate build): the banner stands in App's
// tender face behind live queries and a live deck, so this
// drive proves the ruling from the places that honestly
// carry it:
//   §A App.tsx — the showPatrolBanner reckoning itself,
//      READ OUT OF THE SOURCE AND EVALUATED as written
//      against held-counts 0 / 3 / 19 / 20 and the standing
//      seed conditions: no banner at 3 or 19, the banner at
//      20 only while the seed conditions stand.
//   §B App.tsx — the banner markup stands behind that one
//      reckoning, its faces and copy unchanged, its Send
//      behaviour unchanged for a Tender (setPatrolIds(
//      patrolThree) + setShowDeck(true) — carried since
//      piece 2, 2026-10-23, by the patrolDoor handler, whose
//      no-Tender branch routes to the claim: the map locked
//      until a Tender), and the button carries exactly the
//      pencil words, the old words gone.
//   §C the built client bundle — the new button words ship,
//      the old words do not, the banner markup ships, and a
//      minified length>=20 reckoning stands in the shipped JS.
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

// ── §A THE RECKONING, EVALUATED AS WRITTEN ───────────────
console.log("\n§A App.tsx — the showPatrolBanner reckoning, read from source and evaluated");
const reckAt = app.indexOf("const showPatrolBanner =");
check("the showPatrolBanner reckoning is found", reckAt >= 0);
const reckEnd = reckAt >= 0 ? app.indexOf(";", reckAt) : -1;
const reckoning = reckAt >= 0 && reckEnd > reckAt ? app.slice(reckAt + "const showPatrolBanner =".length, reckEnd).trim() : "";
check("the reckoning reads the twenty-count (tenderItems.length >= 20)",
  reckoning.includes("tenderItems.length >= 20"), reckoning.slice(0, 120));
check("the reckoning no longer gates on the first three existing (patrolThree.length === 3 is gone)",
  !reckoning.includes("patrolThree.length === 3"), reckoning.slice(0, 120));
check("the standing patrolTerritoryQ condition is kept word for word",
  reckoning.includes("!!patrolTerritoryQ.data")
  && reckoning.includes("patrolTerritoryQ.data.tiles.length === 0")
  && reckoning.includes("!!firstSeedEv && !firstSeedEv.banked && firstSeedEv.state !== \"done\""),
  reckoning.replace(/\s+/g, " ").slice(0, 240));

// Evaluate the extracted reckoning exactly as written.
let gate = null;
try {
  gate = new Function("tenderItems", "patrolTerritoryQ", "firstSeedEv", `return (${reckoning});`);
} catch (e) {
  check("the extracted reckoning compiles for evaluation", false, String(e));
}
const items = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
const terr = (tiles) => ({ data: { tiles: Array.from({ length: tiles }, (_, i) => ({ id: i })) } });
if (gate) {
  check("0 held, empty land, no seed event → no banner", gate(items(0), terr(0), null) === false);
  check("3 held, empty land, no seed event → NO banner (the old gate showed it here)", gate(items(3), terr(0), null) === false);
  check("19 held, empty land, no seed event → no banner", gate(items(19), terr(0), null) === false);
  check("20 held, empty land, no seed event → banner", gate(items(20), terr(0), null) === true);
  check("21 held, empty land, no seed event → banner", gate(items(21), terr(0), null) === true);
  check("20 held, no territory data → no banner", gate(items(20), { data: null }, null) === false);
  check("20 held, ground held, no seed event → no banner", gate(items(20), terr(1), null) === false);
  check("20 held, ground held, seed unbanked and not done → banner", gate(items(20), terr(1), { banked: false, state: "rising" }) === true);
  check("20 held, ground held, seed banked → no banner", gate(items(20), terr(1), { banked: true, state: "rising" }) === false);
  check("20 held, ground held, seed done → no banner", gate(items(20), terr(1), { banked: false, state: "done" }) === false);
  check("19 held, ground held, seed unbanked and not done → no banner (twenty gates first)", gate(items(19), terr(1), { banked: false, state: "rising" }) === false);
}

// ── §B THE BANNER MARKUP AND ITS SEND BUTTON ─────────────
console.log("\n§B App.tsx — the banner behind the reckoning; faces, copy and Send behaviour unchanged; the pencil words on the button");
check("patrolThree still reckons the first three in hatch order",
  app.includes("const patrolThree = [...tenderItems].sort((a, b) => a.id - b.id).slice(0, 3);"));
check("exactly one patrol-banner section stands, guarded by showPatrolBanner",
  count(app, 'className="patrol-banner"') === 1 && app.includes('{showPatrolBanner && <section className="patrol-banner"'));
check("the banner's faces still show the first three", app.includes('<div className="patrol-banner-faces">{patrolThree.map((a) => <img'));
check("the banner's seed copy stands unchanged",
  app.includes("A starseed has landed</strong> on your land") && app.includes("stand ready as your first three.") && app.includes("The seed waits until your patrol claims it."));
check("the Send button opens through patrolDoor (piece 2, the map locked until a Tender)",
  app.includes('className="patrol-banner-send" onClick={patrolDoor}'));
check("the Send behaviour stands unchanged for a Tender — patrolDoor carries setPatrolIds(patrolThree) + setShowDeck(true), behind piece 2's no-Tender needClaim branch",
  /function patrolDoor\(\) \{\s*if \(!tender\) \{ needClaim\(\); return; \}\s*setPatrolIds\(patrolThree\.map\(\(a\) => a\.id\)\);\s*setShowDeck\(true\);\s*\}/.test(app));
check("the button reads exactly the pencil words, once",
  count(app, ">Send these three to claim the starseed</button>") === 1,
  `count=${count(app, ">Send these three to claim the starseed</button>")}`);
check("the old button words are gone from App.tsx", !app.includes("Send a Patrol"));

// ── §C THE BUILT BUNDLE ──────────────────────────────────
console.log("\n§C the built client bundle — the pencil words ship, the old words do not, a length>=20 reckoning stands");
const distAssets = join(root, "client/dist/assets");
check("client/dist/assets exists (build the client first)", existsSync(distAssets));
let bundle = "";
if (existsSync(distAssets)) {
  for (const f of readdirSync(distAssets)) {
    if (f.endsWith(".js")) bundle += readFileSync(join(distAssets, f), "utf8") + "\n";
  }
}
check("the bundle carries the patrol banner markup", bundle.includes("patrol-banner"));
check("the bundle carries the pencil button words", bundle.includes("Send these three to claim the starseed"));
check("the bundle does not carry the old button words", !bundle.includes("Send a Patrol"));
check("the bundle carries a minified length>=20 reckoning (the twenty gate as shipped)",
  /\.length>=20/.test(bundle));

console.log(`\ndrive-patrol-banner-twenty: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
