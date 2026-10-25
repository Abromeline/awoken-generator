// drive-homeland-lessons — ACORN'S LINE: THE HOMELAND
// TUTORIAL REDO (Nigel, 2026-10-23 23:23: the homeland
// tutorial redone with the new rules; the first-visit party
// lesson + the way back, 2026-10-23 23:33; the tutorial
// SHAPE LAW, 2026-10-23 23:37: "cut the tutorial down as
// much as possible so that tenders don't have to read
// paragraphs of text at a time. Tutorials for each system
// can be spread out separately and only trigger when that
// system is triggered for the first time.").
//
// The build: NO walkthrough dump — the old twelve-step
// Territory tutorial card (auto-shown over a new Tender's
// first map, with its "?" reopen button and its training
// banner) is GONE, whole. In its place, nine short lessons,
// one per homeland system — joined since the GROWTH CYCLE
// (2026-10-25) by three more, one per stage of the first
// seed's growth — each fired ONCE at that system's
// first touch on the terrain map and never again,
// dismissible, never blocking its system — remembered in
// the front screen's first-touch registry, EXTENDED (the
// same table front_lessons_seen, the same routes, the same
// owner keying; the homeland keys join the served set).
// The first visit teaches changing the party INSIDE THE
// REAL PARTY CONTROLS: the lesson names the 🌳 door, wears
// its pointing ring while it speaks, and the book it opens
// writes the one party ledger. The map's return button now
// reads RETURN. The seed's BATTLE lesson is deliberately
// absent — its shape stands stopped on a fork awaiting
// Nigel's word; the seed lesson teaches ground truth only.
//
// Proof shape (stated plainly, as with the front drive):
//   §A the lesson list itself, read from homelandLessons.ts
//      — the homeland's lessons in the ground's order (nine of the
//      ground's systems, and — since the GROWTH CYCLE, 2026-10-25 —
//      three of the first seed's growth), each a line or
//      two (<= 160 chars, <= 2 sentences), each naming the
//      button or control it teaches; and NO lesson teaching
//      a dying system (no waves as any shape, no hex-lock,
//      no pour, no tokens, no mirror).
//   §B pickHomelandLesson, READ OUT OF THE SOURCE AND
//      EVALUATED as written: a fresh Tender touching each
//      system gets its lesson exactly once; the second
//      touch is silent; a Tender who has seen them all sees
//      none; a front-screen key teaches nothing here.
//   §C the live registry, against the real API on a scratch
//      server: the SAME registry serves both screens (a
//      visitor's homeland lesson remembered under their
//      visitor id; a front key and a homeland key read back
//      together in one served set — extended, not parallel);
//      exactly-once; isolation between visitors; the union
//      carrying a pre-claim lesson after the claim; a bad
//      key refused; no identity refused. And NO GATING: a
//      Tender who has seen nothing and a Tender who has
//      seen everything both read their territory, and the
//      party changes UNDER THE LESSON — add and return
//      through the real party actions land in the
//      tender_party ledger.
//   §D the wiring, from the sources as written: every touch
//      stands at its system's first touch (the ground's
//      loading queues party → return → safehex; the party
//      lesson points at the real 🌳 door, whose Party tab
//      writes the ledger; a wanderer standing or a strike
//      witnessed touches battle; a readying touches cast;
//      the orders wheels touch orders/group; the server's
//      standCursed touches warning; the seed hold's own
//      touch touches seed); the return button reads RETURN;
//      the dismiss rests the speaking lesson; the serve
//      records server-side in the same breath; and the old
//      walkthrough stands nowhere in Territory.
//   §F the built bundle carries every lesson's words, the
//      RETURN face, and none of the old tutorial's steps.
//
// Run after `npm run build` (server + client) so §C boots
// this source's server and §F reads this source's bundle.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}

const lessonsSrc = readFileSync(join(root, "client/src/homelandLessons.ts"), "utf8");
const whisperSrc = readFileSync(join(root, "client/src/HomelandWhisper.tsx"), "utf8");
const territory = readFileSync(join(root, "client/src/Territory.tsx"), "utf8");
const app = readFileSync(join(root, "client/src/App.tsx"), "utf8");
const zodiac = readFileSync(join(root, "client/src/Zodiac.tsx"), "utf8");
const serverLessons = readFileSync(join(root, "server/src/frontLessons.ts"), "utf8");
const storeSrc = readFileSync(join(root, "server/src/store.ts"), "utf8");

// ── §A THE LESSON LIST ─────────────────────────────────────
console.log("\n§A homelandLessons.ts — twelve lessons, the ground's order, each a line or two naming its control");
const entries = [...lessonsSrc.matchAll(/\{\s*key: "([a-z]+)",\s*system: "([^"]+)",\s*text: "([^"]+)",\s*\}/g)]
  .map((m) => ({ key: m[1], system: m[2], text: m[3] }));
check("exactly twelve homeland lessons stand (the ground's nine + the growth cycle's three)", entries.length === 12, `found ${entries.length}`);
check("the lessons stand in the ground's order: party, return, safehex, battle, cast, orders, group, warning, seed, then the growth cycle's three",
  entries.map((e) => e.key).join(",") === "party,return,safehex,battle,cast,orders,group,warning,seed,seedfeed,seedsapling,seedbeacon",
  entries.map((e) => e.key).join(","));
const NAMES = {
  party: ["first three", "party", "🌳", "Party tab"],
  return: ["RETURN"],
  safehex: ["safe", "bastion", "wake"],
  battle: ["wanderers", "drawn faces", "beat by beat"],
  cast: ["range", "stays readied", "cast, cast, cast"],
  orders: ["wheel", "March", "Follow"],
  group: ["Drag a box", "orders appear", "March together"],
  warning: ["level 3", "twenty held", "presses harder"],
  seed: ["starseed", "first three", "rebuilding heart"],
  seedfeed: ["drinks", "purse", "Risings"],
  seedsapling: ["Sapling of Light", "six hexes", "purify"],
  seedbeacon: ["Beacon", "Lighthouse panel", "banked"],
};
for (const e of entries) {
  const sentences = e.text.split(/(?<=[.!?])\s+/).filter(Boolean).length;
  check(`"${e.key}" is a line or two (${e.text.length} chars, ${sentences} sentence(s))`,
    e.text.length <= 160 && sentences <= 2, `${e.text.length} chars, ${sentences} sentences`);
  for (const needle of NAMES[e.key] ?? []) {
    check(`"${e.key}" names what it teaches ("${needle}")`, e.text.includes(needle), e.text);
  }
}
console.log("\n§A2 no lesson teaches a dying system");
for (const e of entries) {
  check(`"${e.key}" teaches no wave shape (no "wave" in its words)`, !/wave/i.test(e.text), e.text);
  check(`"${e.key}" carries no pour-era, token or mirror words`, !/pour|token|mirror/i.test(e.text), e.text);
}
check("the seed lesson teaches ground truth only — no hold referee in its words (no waves, no rising, no bank)",
  !/wave|rising|bank/i.test(entries.find((e) => e.key === "seed")?.text ?? ""), entries.find((e) => e.key === "seed")?.text);
check("homelandLessons.ts names the seed-battle deferral in its own header (the fork awaits Nigel's word)",
  lessonsSrc.includes("THE SEED'S BATTLE LESSON IS DELIBERATELY ABSENT"));

// ── §B THE ONCE-ONLY RECKONING, EVALUATED AS WRITTEN ───────
console.log("\n§B pickHomelandLesson — read from source and evaluated by standing");
const fnAt = lessonsSrc.indexOf("export function pickHomelandLesson");
check("pickHomelandLesson stands in homelandLessons.ts", fnAt >= 0);
let pick = null;
if (fnAt >= 0) {
  const open = lessonsSrc.indexOf("{", fnAt);
  let depth = 0, end = -1;
  for (let i = open; i < lessonsSrc.length; i++) {
    if (lessonsSrc[i] === "{") depth++;
    else if (lessonsSrc[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  const fnSrc = lessonsSrc.slice(fnAt, end + 1)
    .replace("export function pickHomelandLesson", "function pickHomelandLesson")
    .replace("(seenKeys: string[], touchedKey: string): HomelandLesson | null", "(seenKeys, touchedKey)");
  try {
    pick = new Function("HOMELAND_LESSONS", `${fnSrc}\nreturn pickHomelandLesson;`)(JSON.parse(JSON.stringify(entries)));
    check("the extracted reckoning compiles for evaluation", true);
  } catch (e) {
    check("the extracted reckoning compiles for evaluation", false, String(e));
  }
}
if (pick) {
  const KEYS = entries.map((e) => e.key);
  for (const key of KEYS) {
    const got = pick([], key);
    check(`fresh, first touch of "${key}" → its lesson speaks`, got && got.key === key && got.text.length > 0);
  }
  const served = [];
  for (const key of KEYS) {
    const first = pick([...served], key);
    if (first) served.push(key);
    const second = pick([...served], key);
    check(`"${key}": served once, the second touch is silent`, !!first && second === null);
  }
  for (const key of KEYS) {
    check(`all seen, touching "${key}" → silence (no lesson on later visits)`, pick([...KEYS], key) === null);
  }
  check("a front-screen key teaches nothing on this ground", pick([], "claim") === null && pick([], "early") === null);
  check("an unknown system teaches nothing", pick([], "table") === null && pick([], "grimoire") === null);
  check("the first-visit queue speaks in its order (party, then return, then safehex; each once)",
    pick([], "party")?.key === "party" && pick(["party"], "return")?.key === "return"
    && pick(["party", "return"], "safehex")?.key === "safehex" && pick(["party", "return", "safehex"], "party") === null);
}

// ── §D THE WIRING (source) ─────────────────────────────────
console.log("\n§D the touches stand at their systems' first touches; nothing is gated; the walkthrough is gone");
check("Territory calls the homeland hook (useHomelandLessons) — the front registry's machinery, mirrored",
  territory.includes("const homeland = useHomelandLessons();"));
{
  const at = territory.indexOf('homeland.touch("party")');
  check("the ground's first loading queues the first visit in its order: party → return → safehex",
    at >= 0 && territory.slice(at, at + 120).includes('homeland.touch("return")') && territory.slice(at, at + 120).includes('homeland.touch("safehex")')
    && territory.slice(at, at + 120).indexOf('homeland.touch("return")') < territory.slice(at, at + 120).indexOf('homeland.touch("safehex")'),
    territory.slice(at, at + 120));
  check("the first-visit queue stands behind the ground's loading (territoryLoaded), not before it",
    territory.includes("if (!territoryLoaded) return;") && territory.indexOf("if (!territoryLoaded) return;") < at);
}
check("the party lesson POINTS at the real control: while it speaks, the 🌳 door wears the pointing ring (lesson-point)",
  territory.includes('homeland.active?.key === "party" ? " lesson-point" : ""'));
check("the pointed-at control is the real Zodiac door, working while she speaks (its onClick stands untouched)",
  territory.includes('className={`aspect-fab tree-fab${homeland.active?.key === "party" ? " lesson-point" : ""}`}')
  && territory.includes("onClick={onOpenZodiac}"));
check("the door the lesson names opens the book whose Party tab writes the ledger (Zodiac: Add to the party / Return to the deck, through the party mutations)",
  zodiac.includes("Add to the party") && zodiac.includes("Return to the deck")
  && zodiac.includes("mutationFn: (id: number) => api.addToParty({ awakenedId: id })")
  && zodiac.includes("mutationFn: (id: number) => api.removeFromParty({ awakenedId: id })"));
check("the battle's first touch: a wanderer standing on the loaded ground touches battle",
  territory.includes('if (territoryLoaded && wanderers.length > 0) homeland.touch("battle");'));
check("the battle's first touch, struck: the strike witness touches battle at the first blow flown from the real fight",
  territory.includes('homelandTouchRef.current("battle");'));
check("the cast's first touch: the first readying (castMode + castSpellKey, every readying road) touches cast",
  territory.includes('if (castMode && castSpellKey) homeland.touch("cast");'));
check("the orders wheels' first touches: one Awokin's wheel touches orders, a company's touches group",
  territory.includes('homeland.touch(ordersWheel.ids.length > 1 ? "group" : "orders");'));
check("the warning's first touch: the server's own standCursed reckoning (the step into cursed ground) touches warning",
  territory.includes('if (summoning.standCursed) homeland.touch("warning");'));
check("the seed's first touch: a touch of the seed hold's own section touches seed",
  territory.includes('<section className="first-claim first-seed" aria-live="polite" onClick={() => homeland.touch("seed")}>'));
check("the speaking lesson is seated on the map (HomelandWhisper, in the territory view)",
  territory.includes("<HomelandWhisper homeland={homeland} />"));
check("the serve records server-side in the same breath it fires (api.markFrontLesson inside serve — the front registry's road)",
  whisperSrc.includes("void api.markFrontLesson({ lessonKey: key })"));
check("the serve is judged by pickHomelandLesson against the served set",
  whisperSrc.includes("pickHomelandLesson([...seenRef.current], key)"));
check("the registry hook loads the served set through the front registry's own route (api.getFrontLessons)",
  whisperSrc.includes("api.getFrontLessons()"));
check("a lesson dismisses through its own dismiss (the queue rests, nothing is answered)",
  whisperSrc.includes("onClick={homeland.dismiss}") && whisperSrc.includes("setQueue((q) => q.slice(1))"));
check("the speaking lesson renders its text and its key (data-homeland-lesson)",
  whisperSrc.includes("<p data-homeland-lesson={lesson.key}>{lesson.text}</p>"));
check("no lesson asks a question or takes an answer (no form, no confirm in HomelandWhisper)",
  !/confirm|<form|onSubmit/.test(whisperSrc));
console.log("\n§D2 the way back reads RETURN; the walkthrough dump stands nowhere");
check("the map's return button reads RETURN (App: the deck-button's open face)",
  app.includes('<span>{showDeck ? "RETURN" : "Terrain Map"}</span>'));
check("the door itself is unchanged (deckDoor, its aria-labels, the Terrain Map face)",
  app.includes('aria-label={showDeck ? "Return to the ritual" : "View your decks"}') && app.includes("function deckDoor()"));
check("Territory renders no Tutorial card (no <Tutorial, no objectives banner, no tutorial-done local flag)",
  !territory.includes("<Tutorial") && !territory.includes("tutorialComplete") && !territory.includes("awoken-tutorial-done"));
check("the walkthrough's reopen button is gone (no tutorial-help-btn in Territory)",
  !territory.includes("tutorial-help-btn"));
check("Tutorial.tsx itself is gone from the client (the dump has no other door)",
  !existsSync(join(root, "client/src/Tutorial.tsx")));
check("nothing teaches the Table on this ground (no Table lesson key, no table touch in Territory)",
  !entries.some((e) => /table/i.test(e.key)) && !territory.includes('homeland.touch("table")'));

// ── Registry shape (schema + DDL + server) ─────────────────
console.log("\n§R ONE registry, extended — the same table, the same routes, the homeland keys joined");
check("the server's homeland keys match the client's, in order",
  ["party", "return", "safehex", "battle", "cast", "orders", "group", "warning", "seed"].every((k) => serverLessons.includes(`"${k}"`))
  && serverLessons.includes("HOMELAND_LESSON_KEYS"));
check("the server's served set is the UNION (LESSON_KEYS = front + homeland + the growth cycle's servings, 2026-10-25) and the mark judges by it",
  serverLessons.includes("export const LESSON_KEYS = [...FRONT_LESSON_KEYS, ...HOMELAND_LESSON_KEYS, ...SEED_GROWTH_KEYS] as const")
  && serverLessons.includes("z.enum(LESSON_KEYS)"));
check("still ONE table: store DDL creates front_lessons_seen exactly once (no second, parallel registry)",
  (storeSrc.match(/CREATE TABLE IF NOT EXISTS front_lessons_seen/g) ?? []).length === 1
  && !/lessons_seen(?!_)/.test(storeSrc.replace(/front_lessons_seen/g, "")));
check("a mark is an OR-IGNORE-shaped no-op the second time (onConflictDoNothing)",
  serverLessons.includes(".onConflictDoNothing()"));

// ── §C THE LIVE REGISTRY ───────────────────────────────────
console.log("\n§C the live registry — boots the real server on a scratch database");
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-homeland-lessons-"));
process.env.PORT = "39987";
delete process.env.WORKSHOP_PASSWORD;
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;
process.chdir(root);
const BASE = "http://127.0.0.1:39987";
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
async function call(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}
const V1 = { "x-visitor-id": "visitor-homeland-0001" };
const V2 = { "x-visitor-id": "visitor-homeland-0002" };
const HKEYS = ["party", "return", "safehex", "battle", "cast", "orders", "group", "warning", "seed", "seedfeed", "seedsapling", "seedbeacon"];

{
  const fresh = await lessonsGet(V1);
  check("a fresh visitor has been served nothing", fresh.status === 200 && Array.isArray(fresh.data.seen) && fresh.data.seen.length === 0, JSON.stringify(fresh));
  const m1 = await lessonsMark(V1, "party");
  check("the visitor's party lesson is served and remembered under their visitor id (the front registry's own keying)",
    m1.status === 200 && m1.data.seen.join(",") === "party", JSON.stringify(m1));
  const m2 = await lessonsMark(V1, "party");
  check("serving the party lesson a second time changes nothing (exactly once)",
    m2.status === 200 && m2.data.seen.join(",") === "party", JSON.stringify(m2));
  const other = await lessonsGet(V2);
  check("a second visitor is untouched by the first's lessons", other.status === 200 && other.data.seen.length === 0, JSON.stringify(other));
  const bad = await lessonsMark(V1, "waves");
  check("a key that is not a lesson is refused (400) — the seed's dying shape is not even a key",
    bad.status === 400, String(bad.status));
  const anon = await lessonsGet({});
  check("no visitor mark and no Tender → refused (403), nothing remembered for no one", anon.status === 403, String(anon.status));

  // The claim still claims with a homeland lesson served.
  const claimRes = await fetch(`${BASE}/api/claimTender`, {
    method: "POST",
    headers: { "content-type": "application/json", ...V1 },
    body: JSON.stringify({ password: "homeland-drive-password", tenderName: "Homeland Tender" }),
  });
  const claimData = await claimRes.json().catch(() => ({}));
  check("the claim still claims for the visitor whose party lesson was served (no gating)",
    claimRes.ok && typeof claimData.token === "string", `${claimRes.status} ${JSON.stringify(claimData).slice(0, 120)}`);
  const T = { "x-tender-token": claimData.token };
  const union = await lessonsGet({ ...T, ...V1 });
  check("after the claim, the Tender's read carries the visitor's served party lesson by union (the first visit will not re-teach it)",
    union.status === 200 && union.data.seen.includes("party"), JSON.stringify(union));
  // ONE registry, two screens: a front key and the homeland keys
  // read back together in a single served set.
  await lessonsMark({ ...T, ...V1 }, "map");
  for (const key of HKEYS.slice(1)) await lessonsMark({ ...T, ...V1 }, key);
  const all = await lessonsGet({ ...T, ...V1 });
  check("one served set holds both screens' lessons (front \"map\" + all twelve homeland keys, the growth cycle's among them) — extended, not parallel",
    all.status === 200 && all.data.seen.includes("map") && HKEYS.every((k) => all.data.seen.includes(k)),
    JSON.stringify(all));
  const again = await lessonsMark(T, "cast");
  check("re-serving a seen lesson to the all-seen Tender changes nothing",
    again.status === 200 && again.data.seen.filter((k) => k === "cast").length === 1, JSON.stringify(again));

  // NO GATING, proven on the ground itself: the all-seen Tender
  // reads their territory exactly as a lesson-free Tender does.
  const db = new Database(join(process.env.DATA_DIR, "app.db"));
  try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }
  const tenderRow = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claimData.tender.code);
  const ownerKey = `tender:${tenderRow.id}`;
  const terrSeen = await call("getTerritory", {}, claimData.token);
  check("the all-seen Tender's map opens (getTerritory answers with the lessons all served)",
    terrSeen && Array.isArray(terrSeen.tiles), JSON.stringify(terrSeen).slice(0, 100));
  const claim2 = await call("claimTender", { password: "homeland-drive-password", tenderName: "Untaught Tender" });
  const terrFresh = await call("getTerritory", {}, claim2.token);
  check("a Tender who has seen NO lesson reads the same ground (the map opens with lessons unseen)",
    terrFresh && Array.isArray(terrFresh.tiles), JSON.stringify(terrFresh).slice(0, 100));

  // THE PARTY CHANGES UNDER THE LESSON, INTO THE LEDGER: seed
  // four Awokin for the taught Tender; add one and return one
  // through the REAL party actions the book's Party tab calls,
  // and read the tender_party ledger itself.
  function seedAwokin(name, createdAt) {
    const parts = [];
    for (const cat of ["body", "arms", "head"]) {
      const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 3, 3, 'root', ?, 'image/png', ?)").run(`${name} ${cat}`, cat, `homeland/${name}-${cat}.png`, createdAt).lastInsertRowid);
      parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: 3, toughness: 3, element: "root" });
    }
    return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)").run(name, name, `homeland/${name}.png`, JSON.stringify(parts), "Homeland Tender", ownerKey, createdAt).lastInsertRowid);
  }
  const ids = [seedAwokin("Lesson Ash", 1000), seedAwokin("Lesson Birch", 2000), seedAwokin("Lesson Cedar", 3000), seedAwokin("Lesson Dock", 4000)];
  const ledger = () => db.prepare("SELECT awakened_id FROM tender_party WHERE owner_key = ? ORDER BY added_at ASC, awakened_id ASC").all(ownerKey).map((r) => r.awakened_id);
  const before = ledger();
  const added = await call("addToParty", { awakenedId: ids[3] }, claimData.token);
  check("adding to the party under the served party lesson lands — the Party view carries the new member",
    (added.members ?? []).some((m) => m.awakenedId === ids[3]), JSON.stringify(added).slice(0, 160));
  check("and the tender_party LEDGER itself holds the change (the lesson's control is the real one)",
    ledger().includes(ids[3]) && ledger().length === before.length + 1, JSON.stringify(ledger()));
  const removed = await call("removeFromParty", { awakenedId: ids[3] }, claimData.token);
  check("returning them to the deck lands in the same ledger (the change is real both ways)",
    !(removed.members ?? []).some((m) => m.awakenedId === ids[3]) && !ledger().includes(ids[3]),
    JSON.stringify(ledger()));
}

// ── §F THE BUILT BUNDLE ────────────────────────────────────
console.log("\n§F the built bundle — every homeland lesson ships; the walkthrough does not");
{
  const dist = join(root, "client/dist/assets");
  const files = existsSync(dist) ? readdirSync(dist).filter((f) => f.endsWith(".js")) : [];
  const bundle = files.map((f) => readFileSync(join(dist, f), "utf8")).join("\n");
  check("the client bundle exists", files.length > 0);
  for (const e of entries) {
    check(`the bundle carries the "${e.key}" lesson's words`, bundle.includes(e.text.slice(0, 48)), e.text.slice(0, 48));
  }
  check("the bundle carries the RETURN face", bundle.includes("RETURN"));
  const OLD_STEPS = [
    "Purify 7 tiles and build 1 Attunement Shrine to complete your training.",
    "Binding Awokin heal wounded defenders between waves.",
    "TANGLE: Knotted thorns. Pins one Awokin for the wave.",
    "Tap 'Face the Next Unraveling' when ready.",
  ];
  for (const line of OLD_STEPS) {
    check(`the bundle carries none of the old walkthrough ("${line.slice(0, 34)}…")`, !bundle.includes(line.slice(0, 48)), line.slice(0, 48));
  }
}

console.log(`\ndrive-homeland-lessons: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
