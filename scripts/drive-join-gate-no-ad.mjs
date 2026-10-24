// drive-join-gate-no-ad — THE AD AWOKEN OFF THE JOIN PAGE
// (Nigel, 2026-10-23 22:26): on the JOIN (gate) page only,
// the right-margin Awoken holding the Printful advertisement
// does not appear; the whispering guide at the left margin
// stays on the gate page untouched, and the ad keeps its
// seat everywhere else.
//
// Component-level proof (stated plainly, as with the wheel
// fix): MarginGuide returns null until its 2 s appear timer
// fires and needs a live deck, so this drive proves the
// ruling from the component source and the built client
// bundle — the two places that honestly carry it:
//   §A App.tsx — exactly two <MarginGuide> render sites;
//      the showGateUI (gate) return passes hideAd, the
//      tender-face return passes nothing new.
//   §B MarginGuide.tsx — hideAd is an optional prop; the
//      ONLY .margin-guide-ad markup in the file stands
//      inside the {!hideAd && (...)} guard, while the left
//      guide's markup stands before/outside that guard,
//      unconditional — so a gate render (hideAd set) must
//      contain the guide and cannot contain the ad, and a
//      tender-face render (no hideAd) still contains both.
//   §C the built client bundle — the ad markup, its words
//      and its shop link still ship (the tender face keeps
//      them), and exactly one hideAd:true prop stands in
//      the shipped JS (the gate site's).
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
const guide = readFileSync(join(root, "client/src/MarginGuide.tsx"), "utf8");

// ── §A THE RENDER SITES ──────────────────────────────────
console.log("\n§A App.tsx — the render sites, gate vs tender-face");
const sites = [...app.matchAll(/<MarginGuide\b[^>]*\/>/g)].map((m) => m[0]);
check("exactly two <MarginGuide> render sites stand in App.tsx", sites.length === 2, `found ${sites.length}`);
const gateIdx = app.indexOf("if (showGateUI) {");
const gateReturnEnd = gateIdx >= 0 ? app.indexOf("\n", gateIdx) : -1;
const gateLine = gateIdx >= 0 ? app.slice(gateIdx, app.indexOf(";", gateIdx) + 1) : "";
check("the showGateUI branch is found and its return renders TenderGate (the join form)",
  gateLine.includes("<TenderGate"), gateLine.slice(0, 120));
const gateSite = sites.find((s) => app.indexOf(s) > gateIdx && app.indexOf(s) < gateIdx + 2000) ?? "";
check("the gate branch's MarginGuide passes hideAd", /\bhideAd\b/.test(gateSite), gateSite);
const tenderSite = sites.find((s) => s !== gateSite) ?? "";
check("the tender-face MarginGuide passes nothing new (no hideAd)",
  tenderSite.length > 0 && !/\bhideAd\b/.test(tenderSite), tenderSite);
check("hideAd appears in App.tsx exactly once (the gate site only)",
  count(app, "hideAd") === 1, `count=${count(app, "hideAd")}`);

// ── §B THE COMPONENT ─────────────────────────────────────
console.log("\n§B MarginGuide.tsx — the ad stands only inside the hideAd guard; the guide stands outside it");
check("hideAd is an optional prop on MarginGuide", /hideAd\?: boolean;/.test(guide));
check("MarginGuide destructures hideAd", /\(\{\s*awoken, assets, guideId, hideAd\s*\}: Props\)/.test(guide));
const guardAt = guide.indexOf("{!hideAd && (");
check("exactly one {!hideAd && (...)} guard stands in the component",
  guardAt >= 0 && count(guide, "{!hideAd && (") === 1, `count=${count(guide, "{!hideAd && (")}`);
const guardEnd = guide.indexOf("\n      )}", guardAt);
check("the guard's close is found after it", guardEnd > guardAt);
const inside = guardAt >= 0 && guardEnd > guardAt ? guide.slice(guardAt, guardEnd) : "";
const before = guardAt >= 0 ? guide.slice(0, guardAt) : "";
check("the right margin (.margin-guide.right) stands inside the guard", inside.includes('className="margin-guide right"'));
check("the ad (.margin-guide-ad) stands inside the guard — its only occurrence in the file",
  inside.includes('className="margin-guide-ad"') && count(guide, "margin-guide-ad\"") >= 1 && count(guide, 'className="margin-guide-ad"') === 1,
  `ad occurrences=${count(guide, 'className="margin-guide-ad"')}`);
check("the ad's words and shop link stand inside the guard, unchanged",
  inside.includes("The art that inspires the Awokin world") && inside.includes("Visit the art shop") && inside.includes("SHOP_URL"));
check("the shop URL itself is unchanged", guide.includes('const SHOP_URL = "https://nigelroper.printful.me/";'));
check("the whispering guide (.margin-guide.left + her bubble) stands BEFORE/outside the guard, unconditional",
  before.includes('className="margin-guide left"') && before.includes('className="margin-guide-bubble"') && before.includes("{MESSAGES[messageIndex]}"));
check("the guide's greeting still opens MESSAGES, unchanged",
  guide.includes('"Welcome to the world of the Awoken, invited Tender.'));

// ── §C THE BUILT BUNDLE ──────────────────────────────────
console.log("\n§C the built client bundle — the ad still ships for the tender face; one hideAd:true stands (the gate's)");
const distAssets = join(root, "client/dist/assets");
check("client/dist/assets exists (build the client first)", existsSync(distAssets));
let bundle = "";
if (existsSync(distAssets)) {
  for (const f of readdirSync(distAssets)) {
    if (f.endsWith(".js")) bundle += readFileSync(join(distAssets, f), "utf8") + "\n";
  }
}
check("the bundle still carries the ad markup and its words (the tender face keeps the ad)",
  bundle.includes("margin-guide-ad") && bundle.includes("The art that inspires the Awokin world"));
check("the bundle still carries the guide's markup and greeting",
  bundle.includes("margin-guide left") && bundle.includes("Welcome to the world of the Awoken, invited Tender."));
const hideAdTrue = bundle.match(/hideAd\s*:\s*(?:!0|true)/g) ?? [];
check("exactly one hideAd:true prop stands in the shipped JS (the gate render site)",
  hideAdTrue.length === 1, `found ${hideAdTrue.length}`);

console.log(`\ndrive-join-gate-no-ad: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
