// THE DISCORD INTRO DOOR — THE DRIVE (2026-10-26).
// Nigel's word: "Build the Discord intro door next." A visitor
// Discord has already vouched for becomes a REAL Tender without
// leaving the Table — or binds the Tender she already holds —
// and walks the beginning in its settled order: account first,
// three wakes, class, runic weapon, then the room choice, bound.
//
// THE ONE LINK THAT STANDS ON ITS PRODUCTION USE: the real
// Discord OAuth exchange (sdk.commands.authorize → POST
// /api/table/auth → Discord's token/user endpoints) cannot be
// exercised without real Discord. Everything DOWNSTREAM of the
// seat token is proved here: the drive mints seat tokens with
// the server's own exported issueTableToken (the exchange's
// last step — the same function production calls, no test
// backdoor in production code), seeds the prepared session the
// way table-main.tsx sets it after a real exchange (window
// .__awokenTableSession, carrying the bound answer the exchange
// now returns), and walks the real door in a real browser.
//
//   §S SOURCE SEAMS: the bind road, the shared wake, the lazy
//      load, the untouched code road.
//   §A THE UNBOUND DOOR: the intro offers stand ALONGSIDE the
//      standing choices (casual, watch, campaign).
//   §B BEGIN: claim → automatic bind on both proofs → three
//      REAL wakes (the first the greeter) → the Choosing →
//      the weapon → the bound door → the raw-socket seat is
//      BOUND (her name, her party as her company, class +
//      weapon read) → the website road logs her in.
//   §C THE CHOOSING'S GATE: chooseClass before three wakes is
//      refused in the server's own words.
//   §D THE RETURN VISIT: a fresh seat token for the same
//      Discord identity, with the exchange's bound answer,
//      seats her directly — no door, no intro offered.
//   §E I ALREADY HAVE A TENDER: a pre-claimed, completed
//      Tender binds a second Discord identity at the door;
//      a wrong password is refused in the game's own words
//      with NOTHING bound.
//   §F THE BIND ROAD'S REFUSALS: already-bound identity,
//      already-bound Tender, faded Tender proof, unproven
//      seat — each refused in plain words; nothing moves.
//   §G THE STANDING ROADS, UNCHANGED: an unbound identity's
//      casual seat is the stand-in company of today; watch
//      watches.
// Run AFTER `npm run build`:
//   PUPPETEER_CACHE_DIR=$HOME/workspace/tools-chrome/.cache node scripts/drive-discord-intro-door.mjs
import { join } from "node:path";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";
import sharp from "sharp";

process.env.PUPPETEER_CACHE_DIR = "/home/hatch/workspace/tools-chrome/.cache";
const require2 = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require2("puppeteer");

const OUT = "/home/hatch/workspace/discord-intro-door-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-intro-door-"));
process.env.PORT = "3971";
// Discord CONFIGURED (dummy keys) — the production door shape.
// Nothing here ever calls Discord: seat tokens are minted by
// the server's own issueTableToken, downstream of the exchange.
process.env.DISCORD_CLIENT_ID = "intro-door-drive-dummy";
process.env.DISCORD_CLIENT_SECRET = "intro-door-drive-secret";
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3971";
const PW = "intro-door-password";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const realNow = Date.now;

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

/* ── §S SOURCE SEAMS ──────────────────────────────────── */
console.log("§S the seams in the sources");
const tableSrv = readFileSync("server/src/table.ts", "utf8");
const tableCli = readFileSync("client/src/Table.tsx", "utf8");
const introCli = readFileSync("client/src/TableIntro.tsx", "utf8");
const appCli = readFileSync("client/src/App.tsx", "utf8");
ok("§S the intro bind road stands in table.ts, asking BOTH proofs (authTokens + tenderFromToken)",
  tableSrv.includes('"/api/table/bind-intro"') || tableSrv.includes("/api/table/bind-intro")
  && tableSrv.includes("tenderFromToken(tenderToken)"));
ok("§S the auth exchange answers the binding (bound + tenderName ride its response)",
  tableSrv.includes("bound: boundTenderId !== null") && tableSrv.includes("tenderName: boundTenderId !== null"));
ok("§S the code road is untouched (its words stand as they were)",
  tableSrv.includes("That code has faded or was already spent. Take a fresh one in the game.")
  && tableSrv.includes("Give the binding code from the game."));
ok("§S the wake is SHARED: App.tsx and TableIntro.tsx both import the helpers from wakeShared",
  appCli.includes('from "./wakeShared"') && introCli.includes('from "./wakeShared"')
  && introCli.includes("seedWelcome") && introCli.includes("saveAwoken"));
ok("§S the intro lazy-loads from the door (dynamic import in Table.tsx) and the real ClassChoosing rides it",
  tableCli.includes('import("./TableIntro")') && introCli.includes('from "./ClassChoosing"'));
ok("§S the intro carries NO spell step (the spell point rides Twelve #3's ledger, unbuilt)",
  // The test is the intro's own closed phase set plus the
  // absence of any spell-choosing call: a spell step would
  // have to stand as a phase of the walk or call the
  // choosing. (An earlier version banned the prose words
  // "spellbook"/"first-page" — which the intro's law-flag
  // comment must carry to say the step is NOT HERE, BY
  // LAW; the flag tripped its own check, arbitration
  // 2026-10-26.)
  introCli.includes('type Phase = "form" | "wakes" | "choosing" | "paused" | "finishing"')
  && !introCli.includes("chooseSpell") && !introCli.includes("Phase = \"form\" | \"wakes\" | \"choosing\" | \"spell\""));
ok("§S the intro offers stand only for the unbound (the door renders them under !authJoin.bound)",
  tableCli.includes("!authJoin.bound") && tableCli.includes("Begin as a new Tender") && tableCli.includes("I already have a Tender"));

/* ── BOOT + FIXTURES ──────────────────────────────────── */
await import("../server/dist/index.js");
await sleep(2500);
const { issueTableToken } = await import("../server/dist/table.js");
const { blobs } = await import("../server/dist/store.js");

async function call(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return data?.data ?? data;
}
async function callRaw(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
async function pathRaw(path, args, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up, as the other drives do */ }

/* REAL served images for the layer pool: the browser's wake
 * composition loads each piece's image for real (loadImage in
 * compose), so fake blob keys would fail the ritual. Each
 * piece is a true 750×971 PNG, written through the server's
 * own blob store and served at /blobs/… like any upload. */
const pngFor = (r, g, b) => sharp({
  create: { width: 750, height: 971, channels: 4, background: { r, g, b, alpha: 1 } },
}).png().toBuffer();
const fixtureAssets = [];
{
  const pieces = [
    ["Intro Backdrop", "background", null, null, "root", 40, 34, 28],
    ["Intro Body", "body", 3, 3, "root", 90, 120, 70],
    ["Intro Arms", "arms", 2, 2, "sky", 90, 110, 150],
    ["Intro Head", "head", 2, 3, "stone", 150, 120, 80],
  ];
  for (const [name, category, power, toughness, element, r, g, b] of pieces) {
    const key = `intro-fixtures/${name}.png`;
    blobs.put(key, await pngFor(r, g, b), "image/png");
    const id = Number(db.prepare(
      "INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)")
      .run(name, category, power, toughness, element, key, Date.now()).lastInsertRowid);
    fixtureAssets.push({ id, name, category, power, toughness });
  }
}
const fixtureRefs = () => fixtureAssets.map((a) => ({
  source_id: `db:${a.id}`, name: a.name, category: a.category, rarity: "common", power: a.power, toughness: a.toughness,
}));
const fixtureImage = () => pngFor(120, 100, 80).then((buf) => buf.toString("base64"));

/* ── SOCKET HELPERS ───────────────────────────────────── */
class Actor {
  constructor() { this.state = null; this.you = null; this.joinErrors = []; }
  async join(join, room = "the-table") {
    this.ws = new WebSocket("ws://127.0.0.1:3971/table/ws");
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data));
        if (m.type === "state") { this.state = m.state; if (m.you) this.you = m.you; }
        else if (m.type === "joinError") this.joinErrors.push(m);
      } catch { /* torn frame */ }
    };
    this.send({ type: "join", room, ...join });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  close() { try { this.ws.close(); } catch { /* already gone */ } }
}
async function waitFor(what, cond, ms = 20000) {
  const s = realNow();
  while (realNow() - s < ms) { let v = false; try { v = cond(); } catch { v = false; } if (v) return true; await sleep(150); }
  console.log("  .. waited out:", what);
  return false;
}
async function joinProbe(join, room = "the-table", ms = 12000) {
  const a = new Actor();
  await a.join(join, room);
  await waitFor("a seat payload", () => !!a.you || a.joinErrors.length > 0, ms);
  return a;
}

/* ── BROWSER HELPERS ──────────────────────────────────── */
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio"] });
async function doorPage(session) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror:intro-door]", String(e).slice(0, 240)));
  // The prepared session, seeded exactly as table-main.tsx
  // sets it after a real exchange — the seat ticket, the
  // room, and the exchange's bound answer.
  await page.evaluateOnNewDocument((s) => { window.__awokenTableSession = s; }, session);
  await page.goto(`${BASE}/table?frame_id=intro-drive`, { waitUntil: "domcontentloaded", timeout: 60000 });
  return page;
}
const pageText = (page) => page.evaluate(() => document.body.innerText);
async function clickButtonWithText(page, text, ms = 25000) {
  const found = await page.waitForFunction(
    (t) => [...document.querySelectorAll("button")].some((b) => (b.textContent || "").includes(t)),
    { timeout: ms }, text).then(() => true).catch(() => false);
  if (!found) return false;
  return page.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").includes(t));
    if (b) { b.click(); return true; }
    return false;
  }, text);
}
// The exact-text sibling: the substring click above
// cannot tell "Take the Sword" from "Take the Sword &
// Shield" (the Choosing offers both, swordshield first) —
// it named the wrong weapon while reporting the right one
// (arbitration, 2026-10-26). Where a gift's name is a
// prefix of another's, the click must be exact.
async function clickButtonExactText(page, text, ms = 25000) {
  const found = await page.waitForFunction(
    (t) => [...document.querySelectorAll("button")].some((b) => (b.textContent || "").trim() === t),
    { timeout: ms }, text).then(() => true).catch(() => false);
  if (!found) return false;
  return page.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim() === t);
    if (b) { b.click(); return true; }
    return false;
  }, text);
}
async function waitText(page, text, ms = 25000) {
  return page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: ms }, text)
    .then(() => true).catch(() => false);
}

const DISC_A = "disc-intro-a";
const DISC_B = "disc-intro-b";
const DISC_C = "disc-intro-c";
const DISC_D = "disc-intro-d";
const seatFor = (id, name, bound, tenderName = null) => ({
  authToken: issueTableToken({ id, name }), room: "intro-room", name, bound, tenderName,
});

/* ── §A + §B BEGIN, AT THE DOOR ───────────────────────── */
console.log("§A the unbound door — the offers stand alongside the standing choices");
const sessionA = seatFor(DISC_A, "Intro A on Discord", false);
let tenderA = null;
{
  const page = await doorPage(sessionA);
  await page.waitForSelector(".table-door", { timeout: 30000 });
  const doorText0 = await pageText(page);
  ok("§A the standing choices stand as today (casual, watch, campaign)",
    doorText0.includes("The casual table") && doorText0.includes("Watch instead") && doorText0.includes("Campaign — take a seat"),
    doorText0.slice(0, 300));
  ok("§A the intro offers stand alongside them for the unbound",
    doorText0.includes("Begin as a new Tender") && doorText0.includes("I already have a Tender"));
  await page.screenshot({ path: `${OUT}/a-unbound-door-offers.png` });

  console.log("§B Begin — claim, bind, three wakes, the Choosing, the weapon");
  ok("§B the Begin offer opens the claim form (name + password before any waking)",
    await clickButtonWithText(page, "Begin as a new Tender"));
  await page.waitForSelector("#intro-name", { timeout: 20000 });
  await page.type("#intro-name", "Intro Door Tender");
  await page.type("#intro-password", PW);
  await page.type("#intro-confirm", PW);
  ok("§B the claim is spoken (Begin as a Tender)", await clickButtonWithText(page, "Begin as a Tender"));
  ok("§B the waking step stands inside the Discord-shaped door",
    await waitText(page, "Wake your first three Awokin"));
  // The Tender row + the binding row already stand (the bind
  // rode the claim's own breath).
  tenderA = db.prepare("SELECT * FROM tenders WHERE tender_name = ?").get("Intro Door Tender");
  ok("§B the Tender row exists (a real account, sown by claimTender)", !!tenderA);
  const bindA = tenderA && db.prepare("SELECT * FROM table_bindings WHERE discord_id = ?").get(DISC_A);
  ok("§B the binding row ties this Discord identity to that Tender (both proofs)",
    !!bindA && bindA.tender_id === tenderA.id, JSON.stringify(bindA));
  const loginA = await callRaw("loginTender", { identity: "Intro Door Tender", password: PW });
  ok("§B the website road knows her: loginTender with the same name + password succeeds",
    loginA.status === 200 && loginA.data?.tender?.tenderName === "Intro Door Tender", JSON.stringify(loginA.data).slice(0, 160));

  ok("§B the first wake is offered", await clickButtonWithText(page, "Wake your first Awokin"));
  ok("§B the greeting joins (1 of three woken)", await waitText(page, "1 of three woken"));
  await page.screenshot({ path: `${OUT}/b-waking-step.png` });
  ok("§B the second wake is offered", await clickButtonWithText(page, "Wake your second Awokin"));
  ok("§B the second joins (2 of three woken)", await waitText(page, "2 of three woken"));
  ok("§B the third wake is offered", await clickButtonWithText(page, "Wake your third Awokin"));
  ok("§B after three wakes the Choosing opens (the settled order)",
    await waitText(page, "What manner of tender are you?"));
  await page.screenshot({ path: `${OUT}/c-the-choosing.png` });

  const ownerKeyA = `tender:${tenderA.id}`;
  const kinA = db.prepare("SELECT * FROM awakened WHERE owner_key = ? ORDER BY id").all(ownerKeyA);
  ok("§B the three wakes are REAL awakened rows owned by tender:<id>",
    kinA.length === 3 && kinA.every((k) => k.collection === "tender"), `rows=${kinA.length}`);
  ok("§B the first of them is the greeter (the greeter law rides the welcome road)",
    kinA.length === 3 && kinA[0].greeter === 1 && kinA[1].greeter === 0 && kinA[2].greeter === 0,
    JSON.stringify(kinA.map((k) => k.greeter)));

  ok("§B a class is chosen (the Warden)", await clickButtonWithText(page, "Choose the Warden"));
  ok("§B the Choosing's second gift follows (name your runic weapon)",
    await waitText(page, "name your runic weapon"));
  ok("§B the weapon is named (the Sword)", await clickButtonExactText(page, "Take the Sword"));
  ok("§B the door returns, BOUND — her name on it, the intro offers GONE",
    await waitText(page, "You are bound as") && !(await pageText(page)).includes("Begin as a new Tender"));
  const partyA = db.prepare("SELECT awakened_id FROM tender_party WHERE owner_key = ? ORDER BY awakened_id").all(ownerKeyA);
  ok("§B her first three stand as her party (the Table's company source)",
    partyA.map((r) => r.awakened_id).join(",") === kinA.map((k) => k.id).join(","),
    JSON.stringify(partyA));
  ok("§B the remaining wakes are ENCOURAGED in words at the door, never a gate",
    (await pageText(page)).includes("seventeen welcome wakes still wait"));

  // The raw-socket seat, bound (a fresh seat token for the
  // same Discord identity — the return visit's ticket).
  const probeA = await joinProbe({ authToken: issueTableToken({ id: DISC_A, name: "Intro A on Discord" }) }, "intro-room");
  ok("§B the join seats BOUND (you.bound names her Tender)", probeA.you?.bound === "Intro Door Tender",
    JSON.stringify(probeA.you?.bound ?? probeA.joinErrors));
  ok("§B her company is her real party (the three she woke, by name)",
    (probeA.you?.company ?? []).length === 3
    && kinA.every((k) => (probeA.you?.company ?? []).some((c) => c.name === k.name)),
    JSON.stringify((probeA.you?.company ?? []).map((c) => c.name)));
  ok("§B her party rides the payload (party = the first three)",
    JSON.stringify([...(probeA.you?.party ?? [])].sort((x, y) => x - y)) === JSON.stringify(kinA.map((k) => k.id)),
    JSON.stringify(probeA.you?.party));
  ok("§B class + weapon read on the seat (warden, sword)",
    probeA.you?.classKey === "warden" && probeA.you?.weaponKey === "sword",
    JSON.stringify({ classKey: probeA.you?.classKey, weaponKey: probeA.you?.weaponKey }));
  probeA.close();

  ok("§B the casual door seats her from the page, bound and in the room",
    await clickButtonWithText(page, "The casual table"));
  const seated = await page.waitForFunction(
    () => !document.querySelector(".table-door") && document.body.innerText.includes("The Party"),
    { timeout: 25000 }).then(() => true).catch(() => false);
  ok("§B she is SEATED in the room (the door is gone, the party stands)", seated);
  await page.screenshot({ path: `${OUT}/d-bound-seat-taken.png` });
  await page.close();
}

/* ── §C THE CHOOSING'S GATE ───────────────────────────── */
console.log("§C chooseClass before three wakes — refused in the server's own words");
{
  const claimC = await call("claimTender", { password: PW, tenderName: "Gate Tender" });
  const refused = await callRaw("chooseClass", { classKey: "warden" }, claimC.token);
  ok("§C the choosing is refused before three wakes, in its own words",
    refused.status === 400 && String(refused.data?.error ?? "").includes("The choosing comes after your first three wakes — wake three Awoken, and the choosing opens."),
    JSON.stringify(refused.data));
}

/* ── §D THE RETURN VISIT ──────────────────────────────── */
console.log("§D the return visit — bound at the exchange, seated directly, no intro offered");
{
  // The seeded bound answer is what a real exchange returns
  // for this identity now (its binding stands in the ledger,
  // proved in §B) — the exchange itself is the named link
  // standing on its production use.
  const page = await doorPage(seatFor(DISC_A, "Intro A on Discord", true, "Intro Door Tender"));
  const seatedDirect = await page.waitForFunction(
    () => !document.querySelector(".table-door") && document.body.innerText.includes("The Party"),
    { timeout: 30000 }).then(() => true).catch(() => false);
  const text = await pageText(page);
  ok("§D the bound return seats her directly — the door never stands",
    seatedDirect && !text.includes("Begin as a new Tender"), text.slice(0, 200));
  await page.close();
}

/* ── §E I ALREADY HAVE A TENDER ───────────────────────── */
console.log("§E the login road — a second Discord identity binds a pre-claimed Tender");
let tenderB = null;
{
  // Tender B, claimed and completed by the game's own roads
  // (the website's roads — seed, two wakes, class, weapon).
  const claimB = await call("claimTender", { password: PW, tenderName: "Returning Tender" });
  tenderB = db.prepare("SELECT * FROM tenders WHERE tender_name = ?").get("Returning Tender");
  const img = await fixtureImage();
  const seed = await pathRaw("/api/welcome/seed", { layers: fixtureRefs(), imageBase64: img }, claimB.token);
  ok("§E her greeting seeds by the welcome road", seed.status === 200, JSON.stringify(seed.data).slice(0, 140));
  for (let i = 0; i < 2; i++) {
    await call("saveAwoken", { layers: fixtureRefs(), imageBase64: img, collection: "tender", ownerName: "Returning Tender" }, claimB.token);
  }
  await call("chooseClass", { classKey: "warden" }, claimB.token);
  await call("chooseWeapon", { weaponKey: "spear" }, claimB.token);
  const kinB = db.prepare("SELECT * FROM awakened WHERE owner_key = ? ORDER BY id").all(`tender:${tenderB.id}`);
  ok("§E the stage stands: three woken, class + weapon chosen, unbound",
    kinB.length === 3 && !db.prepare("SELECT * FROM table_bindings WHERE discord_id = ?").get(DISC_B));

  const page = await doorPage(seatFor(DISC_B, "Intro B on Discord", false));
  await page.waitForSelector(".table-door", { timeout: 30000 });
  ok("§E the login offer opens its form", await clickButtonWithText(page, "I already have a Tender"));
  await page.waitForSelector("#intro-identity", { timeout: 20000 });
  await page.type("#intro-identity", "Returning Tender");
  await page.type("#intro-login-password", "the-wrong-password");
  ok("§E the sign-in is spoken", await clickButtonWithText(page, "Bind my Tender and continue"));
  ok("§E a wrong password is refused in the game's own words",
    await waitText(page, "That name (or key) and password do not match any Tender."));
  ok("§E NOTHING was bound by the refused attempt",
    !db.prepare("SELECT * FROM table_bindings WHERE discord_id = ?").get(DISC_B));
  await page.click("#intro-login-password");
  await page.keyboard.down("Control");
  await page.keyboard.press("a");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.type("#intro-login-password", PW);
  ok("§E the true password is spoken", await clickButtonWithText(page, "Bind my Tender and continue"));
  ok("§E the door returns BOUND to her Tender (the beginning already walked — no wake walk forced)",
    await waitText(page, "You are bound as"));
  const bindB = db.prepare("SELECT * FROM table_bindings WHERE discord_id = ?").get(DISC_B);
  ok("§E the binding row ties the second Discord identity to the pre-claimed Tender",
    !!bindB && bindB.tender_id === tenderB.id, JSON.stringify(bindB));
  const probeB = await joinProbe({ authToken: issueTableToken({ id: DISC_B, name: "Intro B on Discord" }) }, "intro-room");
  ok("§E her seat is bound, with her party as her company and her spear read",
    probeB.you?.bound === "Returning Tender" && (probeB.you?.company ?? []).length === 3 && probeB.you?.weaponKey === "spear",
    JSON.stringify({ bound: probeB.you?.bound, company: (probeB.you?.company ?? []).length, weaponKey: probeB.you?.weaponKey }));
  probeB.close();
  await page.close();
}

/* ── §F THE BIND ROAD'S REFUSALS ──────────────────────── */
console.log("§F bind-intro refusals — plain words, nothing moves");
{
  const bindRaw = async (token, tenderToken) => {
    const res = await fetch(`${BASE}/api/table/bind-intro`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, tenderToken }),
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
  const loginB = await call("loginTender", { identity: "Returning Tender", password: PW });
  const r1 = await bindRaw(issueTableToken({ id: DISC_A, name: "Intro A on Discord" }), loginB.token);
  ok("§F an already-bound identity is refused (never offered Begin, and the road refuses too)",
    r1.status === 409 && String(r1.data?.error ?? "").includes("This Discord name is already bound to a Tender — the intro door never moves a binding."),
    JSON.stringify(r1.data));
  const r2 = await bindRaw(issueTableToken({ id: DISC_C, name: "Intro C on Discord" }), loginB.token);
  ok("§F an already-bound Tender is refused to a fresh identity, in plain words",
    r2.status === 409 && String(r2.data?.error ?? "").includes("That Tender is already bound to another Discord name — the intro door never moves a binding."),
    JSON.stringify(r2.data));
  ok("§F the refused roads moved NOTHING (B still bound to DISC_B alone)",
    db.prepare("SELECT COUNT(*) AS n FROM table_bindings WHERE tender_id = ?").get(tenderB.id).n === 1
    && !db.prepare("SELECT * FROM table_bindings WHERE discord_id = ?").get(DISC_C));
  const r3 = await bindRaw(issueTableToken({ id: DISC_C, name: "Intro C on Discord" }), "f".repeat(64));
  ok("§F a faded Tender proof is refused (both proofs required, always)",
    r3.status === 401 && String(r3.data?.error ?? "").includes("That Tender sign-in has faded"),
    JSON.stringify(r3.data));
  const r4 = await bindRaw("no-such-seat-token", loginB.token);
  ok("§F an unproven seat is refused in the bind road's standing words",
    r4.status === 401 && String(r4.data?.error ?? "").includes("That seat is not signed in — reopen the Table from Discord."),
    JSON.stringify(r4.data));
}

/* ── §G THE STANDING ROADS, UNCHANGED ─────────────────── */
console.log("§G watch and the stand-in company behave exactly as today");
{
  const probeD = await joinProbe({ authToken: issueTableToken({ id: DISC_D, name: "Intro D on Discord" }) }, "intro-room");
  ok("§G an unbound casual seat is UNBOUND (you.bound is null) with the stand-in company of today",
    !!probeD.you && probeD.you.bound === null && (probeD.you.company ?? []).length > 0 && (probeD.you.party ?? []).length === 0,
    JSON.stringify({ bound: probeD.you?.bound, company: (probeD.you?.company ?? []).length }));
  probeD.close();
  const watch = new Actor();
  await watch.join({ watch: true, name: "Intro Watcher" }, "intro-room");
  ok("§G watch watches (state served, no seat payload)", await waitFor("the watcher sees the room", () => !!watch.state) && watch.you === null);
  watch.close();
  const cfg = await (await fetch(`${BASE}/api/table/config`)).json();
  ok("§G the door's config stands in its production shape here (devMode false — the dev door is another server's shape, untouched)",
    cfg.devMode === false && typeof cfg.discordClientId === "string");
}

await browser.close().catch(() => {});
console.log(`\ndrive-discord-intro-door: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
