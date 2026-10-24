// drive-free-wake-words-placement — FRONT INTRO PIECE 6:
// THE FREE-WAKE WORDS PLACEMENT (Nigel, 2026-10-23 22:36):
// "move the number of free wakes text closer to the green
// crystal and the free timer further away. People are
// getting confused thinking they need to wait for their
// next free wake even though they have 20."
//
// Where the cluster lived before this build (read from the
// code at HEAD b75b2c3): all three pieces stood in WakeRitual
// (client/src/App.tsx), but scattered — the green crystal
// (awakening.wakeReady) and the next-free-wake timer stood
// together INSIDE the wake-ready overlay on the canvas (the
// timer as the Wake One button's own <small>, reading as a
// gate on waking), while the wakes-held count ("20 wakes
// remaining") stood far below the stage in the credit line,
// beside "Get more wakes". What the player sees now: the
// count stands INSIDE the overlay, close by the crystal,
// in both overlay standings (free wake ready, and timer
// pending — the confused player's exact standing); the
// timer stands APART on its own line below the stage,
// after the credit line, no longer inside any Wake One
// button. Placement only: every word, number, reckoning
// and wake action is proved byte-identical below.
//
// Proof shape (stated plainly, as with pieces 1–4): the
// cluster stands in App's tender face behind live queries,
// so §A/§B prove the arrangement and the unchanged
// behaviour from the source as written — the held-count
// reckoning READ OUT AND EVALUATED by standing, the
// overlay spans and the timer line censused in source
// order, and the claim-first guard (piece 3) re-censused
// at the head of every wake entry. §C reads the built
// bundle and the built CSS.
//
// Run after `npm run build` (client) so §C reads this
// source's bundle.
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
const css = readFileSync(join(root, "client/src/theme.css"), "utf8");
const welcomeTs = readFileSync(join(root, "server/src/welcome.ts"), "utf8");

// Extract a `function name(...) { ... }` span by brace matching.
function extractFn(src, name, prefix = "") {
  const at = src.indexOf(`${prefix}function ${name}(`);
  if (at < 0) return null;
  const open = src.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  return null;
}

// The two overlay spans, cut out of the giant stage line.
function overlaySpan(marker) {
  const at = app.indexOf(marker);
  if (at < 0) return "";
  const start = app.lastIndexOf("{collection === \"tender\"", at);
  const end = app.indexOf("</button>)}", at);
  return start >= 0 && end > at ? app.slice(start, end) : "";
}
const freeOverlay = overlaySpan("a free wake is ready");
const timerOverlay = overlaySpan('aria-label="Wake One"><span>Wake One</span>');

// ── §A THE COUNT, CLOSE BY THE CRYSTAL ───────────────────
console.log("\n§A App.tsx — the wakes-held count stands within the crystal's cluster (the wake-ready overlay)");
const heldMatch = app.match(/const wakesHeldText = credits === null \? null : credits\.balance > 0 \? `\$\{credits\.balance\} \$\{credits\.balance === 1 \? "wake" : "wakes"\} remaining` : "The vessel is empty\.";/);
check("the held-count reckoning stands exactly once, in WakeRitual, with the credit line's own words and numbers", !!heldMatch && count(app, "const wakesHeldText") === 1);
let held = null;
try {
  held = new Function("credits", `${heldMatch[0]}\nreturn wakesHeldText;`);
  check("the extracted held-count reckoning compiles for evaluation", true);
} catch (e) {
  check("the extracted held-count reckoning compiles for evaluation", false, String(e));
}
if (held) {
  check("a Tender holding TWENTY reads '20 wakes remaining' — Nigel's confused player's exact standing",
    held({ balance: 20 }) === "20 wakes remaining", String(held({ balance: 20 })));
  check("one held reads '1 wake remaining' (the singular stands as it stood)",
    held({ balance: 1 }) === "1 wake remaining");
  check("none held reads 'The vessel is empty.' (the empty words stand as they stood)",
    held({ balance: 0 }) === "The vessel is empty.");
  check("no credits standing (the workshop face) reads no count at all",
    held(null) === null);
}
check("the FREE overlay carries the crystal (awakening.wakeReady) — the cluster the count must stand close by",
  freeOverlay.includes("<img src={awakening.wakeReady}"));
check("the FREE overlay renders the held count INSIDE the button, as its own wake-held-count element",
  freeOverlay.includes('<small className="wake-held-count">{wakesHeldText}</small>'));
check("in the FREE overlay the count stands CLOSE BY the crystal — immediately after the crystal image, before 'Wake One'",
  freeOverlay.indexOf("wake-held-count") > freeOverlay.indexOf("<img src={awakening.wakeReady}")
  && freeOverlay.indexOf("wake-held-count") < freeOverlay.indexOf("<span>Wake One</span>"));
check("the TIMER-PENDING overlay renders the held count INSIDE the button too — the player with 20 sees what they HOLD on the Wake One face itself",
  timerOverlay.includes('<small className="wake-held-count">{wakesHeldText}</small>'));
check("the held count is rendered exactly twice in the source (once per overlay standing — the two standings are mutually exclusive, so exactly one count ever shows)",
  count(app, 'className="wake-held-count"') === 2, `found ${count(app, 'className="wake-held-count"')}`);
check("the count's old home is vacated: the credit line no longer carries the count words (no 'remaining', no vessel text, no wakesHeldText in it)",
  (() => { const at = app.indexOf('className="credit-line"'); const span = at >= 0 ? app.slice(at, app.indexOf("</p>}", at)) : ""; return span.length > 0 && !span.includes("remaining") && !span.includes("vessel") && !span.includes("wakesHeldText"); })());
check("the credit line still carries its 'Get more wakes' button, wired to checkout as it stood",
  app.includes('<p className="credit-line"><button type="button" className="credit-more" onClick={() => checkout.mutate()} disabled={checkout.isPending}>{checkout.isPending ? "Opening…" : "Get more wakes"}</button></p>'));
check("theme.css gives the held count its own standing inside the overlay, grouped with the crystal (its green border rule stands)",
  css.includes(".wake-ready-overlay .wake-held-count{") && css.includes("rgba(140,255,170,.55)"));

// ── §B THE TIMER, FURTHER AWAY ───────────────────────────
console.log("\n§B App.tsx — the next-free-wake timer stands apart from the crystal/count cluster");
check("the timer's words stand exactly once in App.tsx, verbatim as they stood ('Next free wake {inAbout(nextFreeWakeAt)}')",
  count(app, "Next free wake {inAbout(nextFreeWakeAt)}") === 1, `found ${count(app, "Next free wake {inAbout(nextFreeWakeAt)}")}`);
check("NEITHER overlay carries the timer any more — no 'Next free wake' inside either Wake One button",
  !freeOverlay.includes("Next free wake") && !timerOverlay.includes("Next free wake"));
check("the timer stands on its own line (next-free-wake-line), a plain paragraph — not a button, not an overlay",
  app.includes('<p className="next-free-wake-line">Next free wake {inAbout(nextFreeWakeAt)}</p>'));
check("the timer line stands AFTER the credit line in the stage column (below the whole stage, apart from the canvas cluster)",
  app.indexOf('className="next-free-wake-line"') > app.indexOf('className="credit-line"')
  && app.indexOf('className="next-free-wake-line"') > app.indexOf('className="wake-held-count"'));
check("the timer line keeps the overlay's old standing exactly (tender face, no free wake available, a next wake reckoned, no form on the canvas)",
  app.includes('{collection === "tender" && !freeWakeAvailable && nextFreeWakeAt && !composition.length && <p className="next-free-wake-line">'));
check("theme.css sets the timer line apart (its own rule, a 26px margin above it, quiet dim text)",
  css.includes(".next-free-wake-line{") && css.includes(".next-free-wake-line{width:min(100%,540px);margin:26px auto 0"));
check("the timer's reckoning is untouched: inAbout stands as it stood ('very soon', minutes, hours)",
  (() => { const s = extractFn(app, "inAbout") ?? ""; return s.includes('return "very soon"') && s.includes("minute") && s.includes("hour"); })());
check("the server's free-wake pacing is untouched: welcome.ts still reckons nextFreeWakeAt off lastFreeWakeAt + FREE_WAKE_MS",
  welcomeTs.includes("nextFreeWakeAt: available || lastMs === null ? null : new Date(lastMs + FREE_WAKE_MS).toISOString()"));

// ── §W THE FREE WAKE WORKS EXACTLY AS IT WORKED ──────────
console.log("\n§W the wake actions are unmoved, unremoved, un-re-routed — placement touched no hand");
check("the FREE overlay's hand stands as it stood: onClick wakeFreeAtSpark, disabled on freeBusy/save, its aria-label unchanged",
  freeOverlay.includes("onClick={() => void wakeFreeAtSpark()}") && freeOverlay.includes("disabled={freeBusy || save.isPending}") && freeOverlay.includes('aria-label="Wake One — a free wake is ready"'));
check("the TIMER-PENDING overlay's hand stands as it stood: onClick onWakeButton (the credit Wake One), disabled on save/checkout, its aria-label unchanged",
  timerOverlay.includes("onClick={onWakeButton}") && timerOverlay.includes("disabled={save.isPending || checkout.isPending}") && timerOverlay.includes('aria-label="Wake One"'));
check("the spark-claim row's hands stand as they stood (claimWaitingFree / reconstituteWaitingFree from the row)",
  app.includes("onClick={() => void claimWaitingFree(false)}") && app.includes("onClick={() => void reconstituteWaitingFree(false)}"));
check("piece 3's claim-first guard stands untouched: defined once, called at exactly the four wake entries (5 standings of its name)",
  count(app, "routeGuestToClaim") === 5, `found ${count(app, "routeGuestToClaim")}`);
for (const [name, tokens] of [
  ["onWakeButton", ["checkout.mutate", "wakeOne()"]],
  ["wakeFreeAtSpark", ["startCeremony", "api.claimFreeWake"]],
  ["claimWaitingFree", ["api.claimWelcome"]],
  ["reconstituteWaitingFree", ["api.reconstituteWelcome"]],
]) {
  const body = extractFn(app, name) ?? extractFn(app, name, "async ") ?? "";
  const g = body.indexOf("if (routeGuestToClaim()) return;");
  check(`${name}: the guard still stands first, before ${tokens.join(" and ")}`,
    !!body && g >= 0 && tokens.every((t) => body.indexOf(t) > g), body.slice(0, 80));
}
check("the countdown-keeper effect stands as it stood (the spark's tick while the next free wake gathers)",
  app.includes("if (collection !== \"tender\" || freeWakeAvailable || !nextFreeWakeAt || composition.length) return;"));

// ── §C THE BUILT BUNDLE ──────────────────────────────────
console.log("\n§C the built client bundle carries the new arrangement");
const distAssets = join(root, "client/dist/assets");
check("client/dist/assets exists (build the client first)", existsSync(distAssets));
let bundle = "", bundleCss = "";
if (existsSync(distAssets)) {
  for (const f of readdirSync(distAssets)) {
    if (f.endsWith(".js")) bundle += readFileSync(join(distAssets, f), "utf8") + "\n";
    if (f.endsWith(".css")) bundleCss += readFileSync(join(distAssets, f), "utf8") + "\n";
  }
}
check("the bundle carries the held count's words ('remaining' / 'The vessel is empty.')", bundle.includes("remaining") && bundle.includes("The vessel is empty."));
check("the bundle carries the timer's words, once-removed from the button ('Next free wake')", bundle.includes("Next free wake"));
check("the bundle carries both new class standings (wake-held-count in the overlay, next-free-wake-line apart)",
  bundle.includes("wake-held-count") && bundle.includes("next-free-wake-line"));
check("the built CSS carries the apart line's rule and the count's crystal-grouped rule",
  bundleCss.includes(".next-free-wake-line") && bundleCss.includes(".wake-held-count"));

console.log(`\ndrive-free-wake-words-placement: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
