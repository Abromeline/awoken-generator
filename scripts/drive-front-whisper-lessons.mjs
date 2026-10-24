// drive-front-whisper-lessons — THE WHISPER'S FRONT-SCREEN
// TUTORIAL (Nigel, 2026-10-23 23:23: "We need the whisper to
// give a tutorial of the front screen, to tell people what
// the buttons mean"; the tutorial SHAPE LAW, 2026-10-23 23:37:
// "cut the tutorial down as much as possible so that tenders
// don't have to read paragraphs of text at a time. Tutorials
// for each system can be spread out separately and only
// trigger when that system is triggered for the first time.").
//
// The build: NO tour, NO walkthrough dump. Six short lessons,
// one per front-screen system, each fired ONCE at that
// system's first touch, dismissible, never blocking its
// system, remembered in a server-side registry
// (front_lessons_seen, keyed by the standing owner key —
// "tender:<id>" for a claimed Tender, the raw visitor id the
// front screen already carries for a pre-claim visitor). The
// MarginGuide's rotating tour of systems is gone; her greeting
// rotation keeps the welcome and the lore only.
//
// Proof shape (stated plainly, as with the claim-first drive):
//   §A the lesson list itself, read from frontLessons.ts —
//      six lessons in the game's order, each a line or two
//      (<= 140 chars, <= 2 sentences), each naming the button
//      or surface it teaches.
//   §B pickFrontLesson, READ OUT OF THE SOURCE AND EVALUATED
//      as written: a fresh Tender touching each system gets
//      its lesson exactly once; the second touch is silent; a
//      Tender who has seen them all sees none; an unknown
//      system teaches nothing.
//   §C the live registry, against the real API on a scratch
//      server: a visitor's claim lesson is remembered under
//      their visitor id, a second serve changes nothing, a
//      second visitor is untouched by the first's lessons, the
//      claim itself still claims with a lesson served, the
//      Tender key carries the visitor's served lesson by union
//      after the claim, a Tender who marks them all reads them
//      all back, a bad key is refused, and no identity at all
//      is refused.
//   §D the wiring, from the sources as written: every trigger
//      stands at its system's first touch (the gate's mount,
//      Wake One behind the claim guard, the choosing's opening,
//      the banner's appearance, the map doors), the dismiss
//      rests the speaking lesson, the serve records server-side
//      in the same breath — and no trigger stands in its
//      system's way (the guard, the claim route and the map
//      doors reckon exactly as they did).
//   §E MarginGuide: the greeting opens unchanged; the two
//      shortened standing lines stand shorter; the five
//      system-tour lines are gone from the guide.
//   §F the built bundle carries every lesson's words and none
//      of the removed tour lines.
//
// Run after `npm run build` (server + client) so §C boots this
// source's server and §F reads this source's bundle.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
const count = (hay, needle) => hay.split(needle).length - 1;

const lessonsSrc = readFileSync(join(root, "client/src/frontLessons.ts"), "utf8");
const whisperSrc = readFileSync(join(root, "client/src/FrontWhisper.tsx"), "utf8");
const app = readFileSync(join(root, "client/src/App.tsx"), "utf8");
const guide = readFileSync(join(root, "client/src/MarginGuide.tsx"), "utf8");
const serverLessons = readFileSync(join(root, "server/src/frontLessons.ts"), "utf8");
const schemaSrc = readFileSync(join(root, "server/src/schema.ts"), "utf8");
const storeSrc = readFileSync(join(root, "server/src/store.ts"), "utf8");

// ── §A THE LESSON LIST ─────────────────────────────────────
console.log("\n§A frontLessons.ts — six lessons, the game's order, each a line or two naming its surface");
const entries = [...lessonsSrc.matchAll(/\{\s*key: "([a-z]+)",\s*system: "([^"]+)",\s*text: "([^"]+)",\s*\}/g)]
  .map((m) => ({ key: m[1], system: m[2], text: m[3] }));
check("exactly six lessons stand", entries.length === 6, `found ${entries.length}`);
check("the lessons stand in the game's order: claim, wake, choose, twenty, map, early",
  entries.map((e) => e.key).join(",") === "claim,wake,choose,twenty,map,early",
  entries.map((e) => e.key).join(","));
const NAMES = {
  claim: ["Become a Tender", "password"],
  wake: ["Wake One", "green crystal"],
  choose: ["class", "runic weapon"],
  twenty: ["Twenty", "first three"],
  map: ["Terrain Map", "Become a Tender"],
  early: ["level 3", "twenty", "presses harder"],
};
for (const e of entries) {
  const sentences = e.text.split(/(?<=[.!?])\s+/).filter(Boolean).length;
  check(`"${e.key}" is a line or two (${e.text.length} chars, ${sentences} sentence(s))`,
    e.text.length <= 140 && sentences <= 2, `${e.text.length} chars, ${sentences} sentences`);
  for (const needle of NAMES[e.key] ?? []) {
    check(`"${e.key}" names what it teaches ("${needle}")`, e.text.includes(needle), e.text);
  }
}

// ── §B THE ONCE-ONLY RECKONING, EVALUATED AS WRITTEN ───────
console.log("\n§B pickFrontLesson — read from source and evaluated by standing");
// Rebuild FRONT_LESSONS + pickFrontLesson as a standalone function.
const fnAt = lessonsSrc.indexOf("export function pickFrontLesson");
check("pickFrontLesson stands in frontLessons.ts", fnAt >= 0);
let pick = null;
if (fnAt >= 0) {
  const open = lessonsSrc.indexOf("{", fnAt);
  let depth = 0, end = -1;
  for (let i = open; i < lessonsSrc.length; i++) {
    if (lessonsSrc[i] === "{") depth++;
    else if (lessonsSrc[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  const fnSrc = lessonsSrc.slice(fnAt, end + 1)
    .replace("export function pickFrontLesson", "function pickFrontLesson")
    .replace("(seenKeys: string[], touchedKey: string): FrontLesson | null", "(seenKeys, touchedKey)");
  const lessonsLiteral = `[${entries.map((e) => `{ key: ${JSON.stringify(e.key)}, system: ${JSON.stringify(e.system)}, text: ${JSON.stringify(e.text)} }`).join(",")}]`;
  try {
    pick = new Function("FRONT_LESSONS", `${fnSrc}\nreturn pickFrontLesson;`)(JSON.parse(JSON.stringify(entries)));
    void lessonsLiteral;
    check("the extracted reckoning compiles for evaluation", true);
  } catch (e) {
    check("the extracted reckoning compiles for evaluation", false, String(e));
  }
}
if (pick) {
  const KEYS = entries.map((e) => e.key);
  // A fresh visitor/Tender: every first touch teaches, exactly the lesson of that system.
  for (const key of KEYS) {
    const got = pick([], key);
    check(`fresh, first touch of "${key}" → its lesson speaks`, got && got.key === key && got.text.length > 0);
  }
  // The serve-and-dismiss road, walked whole: touch, serve, dismiss, touch again — silence.
  const served = [];
  for (const key of KEYS) {
    const first = pick([...served], key);
    if (first) served.push(key); // serve() records the key the moment it fires
    const second = pick([...served], key);
    check(`"${key}": served once, the second touch is silent`, !!first && second === null);
  }
  // A Tender who has seen them all sees none, whatever they touch.
  for (const key of KEYS) {
    check(`all seen, touching "${key}" → silence`, pick([...KEYS], key) === null);
  }
  check("an unknown system teaches nothing", pick([], "grimoire") === null && pick([], "nope") === null);
  check("a partially-served Tender is taught only what remains",
    pick(["claim", "wake"], "wake") === null && pick(["claim", "wake"], "map")?.key === "map");
}

// ── §D THE WIRING (source) ─────────────────────────────────
console.log("\n§D the triggers stand at their systems' first touches; nothing is gated");
check("the gate branch's mount is the claim lesson's touch (a LessonTrigger that lives only in that branch)",
  app.includes('<LessonTrigger when lessonKey="claim" onTouch={whisper.touch} />'));
check("TenderGate itself stands untouched, exactly as the standing drives keep it (the lesson is alongside, never inside the gate)",
  app.includes("<TenderGate onDone={handleTenderDone} note={gateNote} />"));
{
  const wakeBtn = app.slice(app.indexOf("function onWakeButton()"), app.indexOf("function onWakeButton()") + 220);
  check("Wake One: the claim guard still stands FIRST, the wake lesson behind it (a guest's reach teaches the claim, not the wake)",
    wakeBtn.indexOf("routeGuestToClaim()") >= 0 && wakeBtn.indexOf('onFirstTouch?.("wake")') > wakeBtn.indexOf("routeGuestToClaim()"),
    wakeBtn);
  const freeAt = app.indexOf("async function wakeFreeAtSpark()");
  const free = app.slice(freeAt, freeAt + 200);
  check("the spark's free Wake One: the guard first, then the wake lesson, then the wake",
    free.indexOf("routeGuestToClaim()") >= 0 && free.indexOf('onFirstTouch?.("wake")') > free.indexOf("routeGuestToClaim()") && free.indexOf("startCeremony") > free.indexOf('onFirstTouch?.("wake")'),
    free);
}
check("the choosing's opening is the choose lesson's touch",
  app.includes('useEffect(() => { if (door) onFirstTouch?.("choose"); }, [door, onFirstTouch]);'));
check("the banner's appearance is the twenty lesson's touch",
  app.includes('<LessonTrigger when={showPatrolBanner} lessonKey="twenty" onTouch={whisper.touch} />'));
{
  // The door handlers and their buttons are locked in shape by the
  // standing map-lock / patrol drives, so the lessons observe the
  // door's first touch from outside (MapDoorLessonWatcher) and the
  // handlers stand byte-for-byte as they did.
  check("deckDoor stands exactly as the map-lock build left it (claim route for a guest, open for a Tender, close on Return)",
    /function deckDoor\(\) \{\s*if \(showDeck\) \{ setShowDeck\(false\); return; \}\s*if \(!tender\) \{ needClaim\(\); return; \}\s*setShowDeck\(true\);\s*\}/.test(app));
  check("patrolDoor stands exactly as it did (claim route, then the patrol sets and the map opens)",
    /function patrolDoor\(\) \{\s*if \(!tender\) \{ needClaim\(\); return; \}\s*setPatrolIds\(patrolThree\.map\(\(a\) => a\.id\)\);\s*setShowDeck\(true\);\s*\}/.test(app));
  check("the watcher hears the Terrain Map button's first touch (.deck-button) and touches the map lesson",
    whisperSrc.includes('target.closest(".deck-button")') && whisperSrc.includes('onTouch("map")'));
  check("the watcher hears the banner's Send as the same door (.patrol-banner-send)",
    whisperSrc.includes('target.closest(".patrol-banner-send")'));
  check("a claimed Tender's door touch also touches the early lesson; a guest's does not (they are led to the claim, not into the curse)",
    whisperSrc.includes('if (tenderRef.current) onTouch("early")'));
  check("a click that closes the map teaches nothing (the watcher stands aside when the map is open)",
    whisperSrc.includes("if (openRef.current) return;"));
  check("the watcher only listens — it never calls the doors or prevents their work (no deckDoor/patrolDoor/preventDefault inside it)",
    !/deckDoor|patrolDoor|preventDefault|stopPropagation/.test(whisperSrc.slice(whisperSrc.indexOf("MapDoorLessonWatcher"), whisperSrc.indexOf("The speaking lesson"))));
  check("App seats the watcher on the tender face with the Tender's standing and the map's",
    app.includes('<MapDoorLessonWatcher isTender={!!tender} mapOpen={showDeck} onTouch={whisper.touch} />'));
}
check("the serve records server-side in the same breath it fires (api.markFrontLesson inside serve)",
  whisperSrc.includes("void api.markFrontLesson({ lessonKey: key })"));
check("the serve is judged by pickFrontLesson against the served set (FrontWhisper's serve)",
  whisperSrc.includes("pickFrontLesson([...seenRef.current], key)"));
check("a lesson dismisses through the whisper's own dismiss (the queue rests, nothing is answered)",
  whisperSrc.includes("onClick={whisper.dismiss}") && whisperSrc.includes("setQueue((q) => q.slice(1))"));
check("the speaking lesson renders its text and its key (data-front-lesson)",
  whisperSrc.includes("<p data-front-lesson={lesson.key}>{lesson.text}</p>"));
check("no lesson asks a question or takes an answer (no form, no confirm in FrontWhisper)",
  !/confirm|<form|onSubmit/.test(whisperSrc));
check("the registry hook loads the served set from the server (api.getFrontLessons)",
  whisperSrc.includes("api.getFrontLessons()"));

// ── §E MARGINGUIDE: THE TOUR IS GONE ────────────────────────
console.log("\n§E MarginGuide — the greeting opens unchanged; the tour lines are gone; the kept lines stand shorter or whole");
check("the greeting still opens MESSAGES, unchanged",
  guide.includes('"Welcome to the world of the Awoken, invited Tender. You have been given a special invitation — to help birth this world into existence."'));
const REMOVED = [
  "Wake more Awokin and your energy grows — energy is how you act here: to cast, to build, to defend.",
  "Your Awokin are woven from five elements — Root, Tide, Sky, Stone, and Fire. Weave aspects into them and they grow stronger, and stranger.",
  "Give each Awokin a stance upon your land: Attack, Defense, or Binding. Defenders guard you; binders mend wounds and attune the earth.",
  "The curse presses at your borders, and the Fray come crawling with it. Hold your homeland, purify the cursed tiles, grow your ground.",
  "Choose a class, open your Grimoire, and learn to cast — wards, runes, and bindings. Then take your deck to the Table, the Tenders' card room in Discord.",
];
for (const line of REMOVED) {
  check(`the system-tour line is gone from the guide (${line.length} chars, was: "${line.slice(0, 34)}…")`, !guide.includes(line));
}
check("the first-form line stands shortened (127 → 82 chars)",
  guide.includes('"Each Awokin is an original creature, drawn by hand in ink — no two are ever alike."')
  && !guide.includes("Begin with your first form of life"));
check("the Tender line stands shortened (142 → 88 chars)",
  guide.includes('"You are their Tender. Your attention is the binding force that holds an Awokin together."')
  && !guide.includes("Wake them, name them, tend them"));
check("the two lore lines stand whole (never fights / the prophecy)",
  guide.includes("An Awokin never fights another Awokin") && guide.includes("forests might grow. That is the prophecy."));
{
  const at = guide.indexOf("const MESSAGES = [");
  const block = guide.slice(at, guide.indexOf("];", at));
  const lines = [...block.matchAll(/^\s+"([^"]+)",?$/gm)].map((m) => m[1]);
  check("the rotation is the greeting + lore only: five lines, none touring a system",
    lines.length === 5 && lines.every((l) => !REMOVED.includes(l)), `found ${lines.length}`);
}

// ── Registry shape (schema + DDL + server) ─────────────────
console.log("\n§R the registry is honest server state, in the codebase's own convention");
check("schema declares front_lessons_seen(owner_key, lesson_key, seen_at)",
  schemaSrc.includes('sqliteTable("front_lessons_seen"') && schemaSrc.includes('ownerKey: text("owner_key")') && schemaSrc.includes('lessonKey: text("lesson_key")'));
check("store DDL creates front_lessons_seen with its composite primary key",
  storeSrc.includes("CREATE TABLE IF NOT EXISTS front_lessons_seen") && storeSrc.includes("PRIMARY KEY (owner_key, lesson_key)"));
check("the server's lesson keys match the client's, in order",
  serverLessons.includes('"claim"') && serverLessons.includes('"early"')
  && ["claim", "wake", "choose", "twenty", "map", "early"].every((k) => serverLessons.includes(`"${k}"`)));
check("a mark is an OR-IGNORE-shaped no-op the second time (onConflictDoNothing)",
  serverLessons.includes(".onConflictDoNothing()"));

// ── §C THE LIVE REGISTRY ───────────────────────────────────
console.log("\n§C the live registry — boots the real server on a scratch database");
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-front-whisper-"));
process.env.PORT = "39986";
delete process.env.WORKSHOP_PASSWORD;
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;
process.chdir(root);
const BASE = "http://127.0.0.1:39986";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await import("../server/dist/index.js");
await sleep(2500);

async function lessonsGet(headers) {
  const res = await fetch(`${BASE}/api/front-lessons`, { headers });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
async function lessonsMark(headers, lessonKey) {
  const res = await fetch(`${BASE}/api/front-lessons/seen`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ lessonKey }),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const V1 = { "x-visitor-id": "visitor-whisper-0001" };
const V2 = { "x-visitor-id": "visitor-whisper-0002" };

{
  const fresh = await lessonsGet(V1);
  check("a fresh visitor has been served nothing", fresh.status === 200 && Array.isArray(fresh.data.seen) && fresh.data.seen.length === 0, JSON.stringify(fresh));
  const m1 = await lessonsMark(V1, "claim");
  check("the visitor's claim lesson is served and remembered under their visitor id",
    m1.status === 200 && m1.data.seen.join(",") === "claim", JSON.stringify(m1));
  const m2 = await lessonsMark(V1, "claim");
  check("serving the claim lesson a second time changes nothing (exactly once)",
    m2.status === 200 && m2.data.seen.join(",") === "claim", JSON.stringify(m2));
  const other = await lessonsGet(V2);
  check("a second visitor is untouched by the first's lessons", other.status === 200 && other.data.seen.length === 0, JSON.stringify(other));
  const bad = await lessonsMark(V1, "grimoire");
  check("a key that is not a front-screen lesson is refused (400)", bad.status === 400, String(bad.status));
  const anon = await lessonsGet({});
  check("no visitor mark and no Tender → refused (403), nothing remembered for no one", anon.status === 403, String(anon.status));

  // The system works with the lesson served: the claim still claims.
  const claimRes = await fetch(`${BASE}/api/claimTender`, {
    method: "POST",
    headers: { "content-type": "application/json", ...V1 },
    body: JSON.stringify({ password: "whisper-drive-password", tenderName: "Whisper Tender" }),
  });
  const claimData = await claimRes.json().catch(() => ({}));
  check("the claim still claims for the visitor whose claim lesson was served (no gating)",
    claimRes.ok && typeof claimData.token === "string", `${claimRes.status} ${JSON.stringify(claimData).slice(0, 120)}`);
  const T = { "x-tender-token": claimData.token };
  const union = await lessonsGet({ ...T, ...V1 });
  check("after the claim, the Tender's read carries the visitor's served lesson by union (it will not fire again)",
    union.status === 200 && union.data.seen.includes("claim"), JSON.stringify(union));
  // The Tender works through the rest; each serve lands on the Tender key.
  for (const key of ["wake", "choose", "twenty", "map", "early"]) {
    await lessonsMark({ ...T, ...V1 }, key);
  }
  const all = await lessonsGet({ ...T, ...V1 });
  check("a Tender who has been served them all reads them all back (the client's real headers: Tender token + the visitor id it always sends)",
    all.status === 200 && ["claim", "wake", "choose", "twenty", "map", "early"].every((k) => all.data.seen.includes(k)),
    JSON.stringify(all));
  const tenderOnly = await lessonsGet(T);
  check("under the Tender key alone, the five lessons served after the claim stand (the claim lesson was the visitor's, and its system is never touched again once claimed)",
    tenderOnly.status === 200 && ["wake", "choose", "twenty", "map", "early"].every((k) => tenderOnly.data.seen.includes(k)),
    JSON.stringify(tenderOnly));
  const again = await lessonsMark(T, "wake");
  check("re-serving a seen lesson to the all-seen Tender changes nothing",
    again.status === 200 && again.data.seen.filter((k) => k === "wake").length === 1, JSON.stringify(again));
  // And the front door still opens for them: the welcome answers.
  const welcomeRes = await fetch(`${BASE}/api/welcome`, { headers: T });
  check("the welcome still answers the all-seen Tender (the systems work with every lesson seen)",
    welcomeRes.ok, String(welcomeRes.status));
}

// ── §F THE BUILT BUNDLE ────────────────────────────────────
console.log("\n§F the built bundle — every lesson ships; none of the tour lines do");
{
  const dist = join(root, "client/dist/assets");
  const files = existsSync(dist) ? readdirSync(dist).filter((f) => f.endsWith(".js")) : [];
  const bundle = files.map((f) => readFileSync(join(dist, f), "utf8")).join("\n");
  check("the client bundle exists", files.length > 0);
  for (const e of entries) {
    check(`the bundle carries the "${e.key}" lesson's words`, bundle.includes(e.text.slice(0, 48)), e.text.slice(0, 48));
  }
  for (const line of REMOVED) {
    check(`the bundle carries none of the removed tour line ("${line.slice(0, 34)}…")`, !bundle.includes(line.slice(0, 48)), line.slice(0, 48));
  }
  check("the bundle carries the registry's road (/api/front-lessons)", bundle.includes("/api/front-lessons"));
}

console.log(`\ndrive-front-whisper-lessons: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
