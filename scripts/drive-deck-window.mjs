// THE DECK WINDOW — THE R6 IN-WHEEL FIX DRIVE (2026-10-23;
// Nigel, 19:45: "i would prefer a fix that keeps summoning
// in the action wheel without a popup"; the window re-ruled
// 2026-10-24 16:19: "set a max in the action wheel to show
// only 5 pages of awoken but as they are cast pages
// refill"). The deck panel is dead; the wheel's Awoken
// branch shows the company plus ONE window of the deck —
// FIVE PAGES at most, thirty Awoken within reach — a
// "More" entry inside the wheel walks the window's pages,
// and a deck entry's tap IS the call — tapOnly, no
// dragKey, no pinKey, so the GroundWheel's >9px drag
// reclassification and its pin badge can never eat it
// (the drag-to-hotbar for deck entries is gone; the tap
// won). Pages beyond the window are never paged to: as
// casts empty the window, the next waiting Awoken refills
// its last page and the window slides over the deck.
// Boots the real server in-process on a scratch DATA_DIR
// with the road shortened by its own env dial, seeds a
// SIXTY-Awoken deck, and proves:
//   §0 THE WINDOW CODE THE WHEEL RENDERS (client/src/
//      deckWindow.ts, bundled by esbuild and imported —
//      the very functions Table.tsx and Territory.tsx call):
//      a page is six, the window is five pages (thirty
//      presented at most), the More step walks those five
//      pages and wraps inside them, a cast refills the
//      window's last page from beyond it, cast by cast the
//      window slides until the 60th stands presented, and
//      a page past a shrunken deck clamps.
//   §1 THE COMPONENT-LEVEL TAP PATH (no Chrome exists in
//      this sandbox for a true browser click run — this is
//      the component proof, stated plainly): both grounds
//      build their deck entries tapOnly with no dragKey and
//      no pinKey and a name-only label, the "More" entry
//      stands stayOpen in both, and GroundWheel's own code
//      refuses to arm the drag or draw the pin for tapOnly.
//   §2 THE TABLE, 60 DECK — the full deck is served as
//      DATA; the wheel's window (the §0 code over the served
//      list) presents thirty of them at most; the refill
//      slide over that list (presented entries removed one
//      by one, as thirty casts would empty them — simulated
//      on the list because thirty real casts would break
//      the following gate, a different law) brings the 60th
//      into the window's last page. The wheel entry's act
//      body — the guarded castTableDeckSummon send (Nigel,
//      2026-10-24: the tap IS the summon cast; the R6 road
//      this section proved until tonight was the gate Nigel
//      struck) — is run for that entry: a name outside the
//      deck is refused in plain words ("not in your deck");
//      the cast lands the 60th on the field FOLLOWING, and
//      enrols it in the party in the same act.
//   §3 THE HOMELAND, 60 DECK — the deck is served with the
//      field; the window presents thirty at most and the
//      refill slide over the served list brings the 60th
//      into its last page; its entry's act body
//      (api.summonAwoken, exactly what castSummon runs)
//      casts its summon: it stands on the field following,
//      enrolled in the party by the cast at once, it stands
//      in the summon company and leaves the deck; calling
//      it again is refused in plain words ("already stands
//      on your field").
// Run: node scripts/drive-deck-window.mjs
import { join } from "node:path";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { build } from "../node_modules/esbuild/lib/main.js";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { WebSocket } from "ws";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-deckwindow-"));
process.env.PORT = "3989";
process.env.WORKSHOP_PASSWORD = ["deckwindow", "drive", "pw"].join("-");
process.env.TABLE_REINFORCEMENT_MS = "2500"; // the road, shortened by its own dial — production keeps 240000
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3989";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

/* ── §0 THE WINDOW CODE ─────────────────────────────────── */
console.log("§0 the window code the wheel renders");
const bundleOut = join(process.env.DATA_DIR, "deckWindow.mjs");
await build({ entryPoints: ["client/src/deckWindow.ts"], bundle: true, format: "esm", outfile: bundleOut, logLevel: "silent" });
const { DECK_PAGE_SIZE, DECK_WINDOW_PAGES, DECK_WINDOW_SIZE, deckWindow, nextDeckPage, deckWindowPageCount } = await import(bundleOut);
const deck60 = Array.from({ length: 60 }, (_, i) => i + 1);
{
  ok("the page size is six — the page the ring can hold", DECK_PAGE_SIZE === 6);
  ok("the window is five pages — thirty Awoken within reach at most",
    DECK_WINDOW_PAGES === 5 && DECK_WINDOW_SIZE === 30,
    JSON.stringify({ pages: DECK_WINDOW_PAGES, size: DECK_WINDOW_SIZE }));
  const w0 = deckWindow(deck60, 0);
  ok("the first window fans six and presents thirty — five pages over a 60 deck, never the whole deck",
    w0.entries.length === 6 && w0.spanCount === 30 && w0.total === 60 && w0.pageCount === 5 && w0.hasMore,
    JSON.stringify({ n: w0.entries.length, span: w0.spanCount, total: w0.total, pageCount: w0.pageCount }));
  const presented = [];
  let page = 0;
  for (let i = 0; i < DECK_WINDOW_PAGES; i++) {
    const w = deckWindow(deck60, page);
    presented.push(...w.entries);
    page = nextDeckPage(page, w.total);
  }
  ok("the More step walks the window's five pages in order — the first thirty, each once, none stacked or skipped",
    presented.join(",") === deck60.slice(0, 30).join(","), presented.slice(0, 8).join(","));
  ok("after the window's last page the More step wraps to the window's first — pages beyond the window are never paged to",
    page === 0 && !presented.includes(31), JSON.stringify({ wrappedTo: page, saw31: presented.includes(31) }));
  // THE REFILL (Nigel, 2026-10-24): a cast removes the cast
  // entry from the live list; the window over the shrunken
  // list refills its last page from beyond itself.
  const live = [...deck60];
  live.splice(live.indexOf(25), 1); // the head of the last page is cast
  const refilled = deckWindow(live, DECK_WINDOW_PAGES - 1);
  ok("a cast from the last page refills it — the 31st, waiting beyond the window, slides into the last page",
    refilled.entries.join(",") === "26,27,28,29,30,31", refilled.entries.join(","));
  // THE SLIDE: cast the presented head away one by one, as
  // a Tender summoning through the window does; the window
  // slides over the deck until the 60th stands presented.
  const sliding = [...deck60];
  let casts = 0;
  while (casts < 60 && !deckWindow(sliding, deckWindowPageCount(sliding.length) - 1).entries.includes(60)) {
    const head = deckWindow(sliding, 0).entries[0];
    sliding.splice(sliding.indexOf(head), 1);
    casts++;
  }
  ok("cast by cast the window slides over the whole deck — after thirty casts the 60th stands in its last page",
    casts === 30 && deckWindow(sliding, DECK_WINDOW_PAGES - 1).entries.includes(60),
    JSON.stringify({ casts, lastPage: deckWindow(sliding, DECK_WINDOW_PAGES - 1).entries }));
  const shrunk = deckWindow(deck60.slice(0, 59), 9);
  ok("a page asked past the window clamps to the window's last standing page — the wheel never opens blank",
    shrunk.page === DECK_WINDOW_PAGES - 1 && shrunk.entries.length === 6,
    JSON.stringify({ page: shrunk.page, n: shrunk.entries.length }));
  const small = deckWindow(deck60.slice(0, 24), 4);
  ok("a deck that fits the window is presented whole — its last page clamps onto the deck's own end",
    small.pageCount === 4 && small.page === 3 && small.entries.includes(24) && small.spanCount === 24,
    JSON.stringify({ page: small.page, pageCount: small.pageCount, entries: small.entries }));
}

/* ── §1 THE COMPONENT-LEVEL TAP PATH ────────────────────── */
console.log("§1 the tap path at the component level (no Chrome — source-level proof, stated plainly)");
{
  const gw = readFileSync("client/src/GroundWheel.tsx", "utf8");
  ok("GroundWheel refuses to arm the drag for a tapOnly entry — drift can never reclassify its tap",
    gw.includes("!entry.tapOnly && !dragging && entry.dragKey"));
  ok("GroundWheel draws no pin badge for a tapOnly entry — the badge cannot eat its tap",
    gw.includes("entry.pinKey && !entry.tapOnly"));
  ok("GroundWheel spreads the Awoken fan evenly (evenFan) so a full window never stacks",
    gw.includes("evenFan && entries.length > 1"));
  for (const [file, marker] of [["client/src/Table.tsx", "THE DECK WINDOW (Nigel, 2026-10-23"], ["client/src/Territory.tsx", "THE DECK WINDOW (Nigel, 2026-10-23"]]) {
    const src = readFileSync(file, "utf8");
    const at = src.indexOf(marker);
    const block = at >= 0 ? src.slice(at, at + 3600) : "";
    ok(`${file}: its deck entries are built in a window of the deck (deckWindow over the served list)`,
      block.includes("deckWindow("), file);
    ok(`${file}: its deck entries are tapOnly, with NO dragKey and NO pinKey in their construction`,
      block.includes("tapOnly: true") && !block.includes("dragKey") && !block.includes("pinKey"),
      file);
    ok(`${file}: its deck entry label is the name alone — no sentence radiating from the fan`,
      /label: (?:r|c)\.name,/.test(block), file);
    ok(`${file}: a More entry stands inside the wheel, stayOpen, advancing the page (nextDeckPage)`,
      block.includes('key: "deck-more"') && block.includes("stayOpen: true") && block.includes("nextDeckPage"), file);
    ok(`${file}: the Awoken wheel is given the even fan`, src.includes('evenFan={wheelTab === "awoken"}'), file);
  }
  const tableSrc = readFileSync("client/src/Table.tsx", "utf8");
  ok("the Table's deck cast is socket-guarded — a cast that cannot be sent speaks instead of dropping silently",
    tableSrc.includes("castTableDeckSummon") && tableSrc.includes("could not be sent — the Table's connection is not open"));
}

/* ── server boot + seeding (drive-reinforcements' rails) ── */
await import("../server/dist/index.js");
await sleep(2500);

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
async function callRaw(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }

function seedAwokin(ownerKey, tenderName, name, partPower = 1) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, 'root', ?, 'image/png', ?)").run(`${name} ${cat}`, cat, partPower, partPower, `deckwin/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: partPower, toughness: partPower, element: "root" });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)").run(name, name, `deckwin/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
async function claimBound(name, discordId) {
  const claim = await call("claimTender", { password: "deckwindow-password", tenderName: name });
  const token = claim.token;
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, Date.now());
  // The class and weapon are written directly, as the
  // harness's other drives write them — the choosing door
  // itself (choose at three wakes, intro piece 3) is not
  // this drive's ground.
  db.prepare("UPDATE tender_progress SET class_key = 'warden', weapon_key = 'sword' WHERE owner_key = ?").run(ownerKey);
  const { issueTableToken } = await import("../server/dist/table.js");
  const tt = issueTableToken({ id: discordId, name });
  const code = (await call("getTableBindCode", {}, token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code }) });
  if (!bindRes.ok) throw new Error(`table/bind -> ${bindRes.status}`);
  return { token, ownerKey, tt, tenderId };
}
const partyRows = (ownerKey) => db.prepare("SELECT awakened_id FROM tender_party WHERE owner_key = ? ORDER BY awakened_id").all(ownerKey).map(r => r.awakened_id);

function client(label) {
  const ws = new WebSocket("ws://127.0.0.1:3989/table/ws");
  const c = { label, ws, state: null, you: null, errors: [] };
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "state") { c.state = m.state; c.you = m.you; }
    if (m.type === "error" || m.type === "joinError") c.errors.push(m.message);
  });
  c.send = (msg) => ws.send(JSON.stringify(msg));
  c.join = (joinMsg) => new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error(`${label}: join timeout`)), 15000);
    ws.on("open", () => {
      c.send({ type: "join", ...joinMsg });
      const iv = setInterval(() => { if (c.state) { clearInterval(iv); clearTimeout(to); resolve(); } }, 100);
    });
  });
  c.waitFor = async (fn, what, timeout = 30000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) { if (c.state && fn(c)) return true; await sleep(200); }
    throw new Error(`${label}: timed out waiting for ${what}; errors: ${c.errors.join(" | ")}`);
  };
  return c;
}

/* ── §2 THE TABLE AT 60-DECK SCALE ──────────────────────── */
{
  console.log("§2 the Table — 60 deck Awoken, windowed, the last one's tap casts its summon");
  const T = await claimBound("Window Caller", "dw-1");
  const M = seedAwokin(T.ownerKey, "Window Caller", "Standing Member");
  const deckIds = [];
  for (let i = 1; i <= 60; i++) deckIds.push(seedAwokin(T.ownerKey, "Window Caller", `Deck Awoken ${String(i).padStart(2, "0")}`));
  await call("addToParty", { awakenedId: M }, T.token);
  db.prepare("UPDATE tender_progress SET weapon_next_at = ? WHERE owner_key = ?").run(Date.now() + 3600_000, T.ownerKey);

  const b = client("DW1");
  await b.join({ authToken: T.tt, room: "deckwindow-cast" });
  await b.waitFor((cc) => (cc.you.reinforcements ?? []).length === 60, "the whole 60-Awoken deck served as data", 30000);
  const served = (b.you.reinforcements ?? []).map(r => r.awakenedId);
  ok("the Table serves the whole deck as data — all 60, in roster order (the wheel windows this list; it is not itself the fan)",
    served.join(",") === deckIds.join(","), served.slice(0, 5).join(","));
  const win0 = deckWindow(b.you.reinforcements, 0);
  ok("the wheel's first window over the served deck fans six and presents thirty — five pages at most, never all 60 at once",
    win0.entries.length === 6 && win0.spanCount === 30 && win0.pageCount === 5 && win0.total === 60,
    JSON.stringify({ n: win0.entries.length, span: win0.spanCount, pageCount: win0.pageCount }));
  const sixtieth = deckIds[59];
  // THE REFILL SLIDE over the served list — the very list
  // the wheel windows: presented entries are removed one
  // by one, exactly as thirty casts empty them (simulated
  // on the list because thirty real casts would break the
  // following gate — a different law, 3222984 — while the
  // window's own reckoning over the shrinking list is the
  // code the wheel renders). After thirty, the 60th stands
  // in the window's last page, and its tap — below — is a
  // real cast.
  const slideList = [...(b.you.reinforcements ?? [])];
  let slid = 0;
  while (slid < 60 && !deckWindow(slideList, deckWindowPageCount(slideList.length) - 1).entries.some(r => r.awakenedId === sixtieth)) {
    const head = deckWindow(slideList, 0).entries[0];
    slideList.splice(slideList.findIndex(r => r.awakenedId === head.awakenedId), 1);
    slid++;
  }
  ok("as casts empty the window it refills and slides — after thirty the 60th stands in the window's last page",
    slid === 30 && deckWindow(slideList, DECK_WINDOW_PAGES - 1).entries.some(r => r.awakenedId === sixtieth),
    JSON.stringify({ casts: slid }));

  // The tap IS the cast now (Nigel, 2026-10-24): the deck
  // entry's act body is the guarded send of summonCast by
  // ledger id (Table.tsx castTableDeckSummon). A name
  // outside the deck must refuse in plain words.
  const errMark = b.errors.length;
  b.send({ type: "summonCast", awakenedId: 999999 });
  await sleep(600);
  ok("a cast naming an Awokin outside the deck is refused in plain words — never silence",
    b.errors.slice(errMark).some(e => /not in your deck/.test(e)), JSON.stringify(b.errors.slice(errMark)));

  b.send({ type: "startWave" });
  await b.waitFor((cc) => cc.state.battle.active && cc.state.dark.length > 0, "the wave stands", 20000);
  // The cast can falter — the dice are the dice; the tap
  // is simply made again, as a player makes it.
  let stood = false;
  for (let i = 0; i < 14 && !stood; i++) {
    b.send({ type: "summonCast", awakenedId: sixtieth });
    await sleep(800);
    stood = (b.state?.field ?? []).some(u => u.awokenId === sixtieth);
  }
  const unit = (b.state?.field ?? []).find(u => u.awokenId === sixtieth);
  ok("the last window's tap casts the summon — the 60th stands on the field, following its Tender",
    stood && unit?.follow === true, JSON.stringify(unit ?? null));
  ok("the cast enrolled it in the party in the same act — following means in party",
    partyRows(T.ownerKey).includes(sixtieth), JSON.stringify(partyRows(T.ownerKey)));
  ok("the tale speaks the call in plain words", (b.state.tale ?? []).some(t => /calls Deck Awoken 60 onto the field/.test(t.text)),
    (b.state.tale ?? []).slice(-4).map(t => t.text).join(" | "));
  b.ws.close();
}

/* ── §3 THE HOMELAND AT 60-DECK SCALE ───────────────────── */
{
  console.log("§3 the homeland — 60 deck Awoken, windowed, the last one's tap casts its summon");
  const claim = await call("claimTender", { password: "deckwindow-password", tenderName: "Home Window" });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, Date.now());
  db.prepare("UPDATE tender_progress SET class_key = 'warden' WHERE owner_key = ?").run(ownerKey);
  const HM = seedAwokin(ownerKey, "Home Window", "Home Member");
  const deckIds = [];
  for (let i = 1; i <= 60; i++) deckIds.push(seedAwokin(ownerKey, "Home Window", `Home Deck ${String(i).padStart(2, "0")}`));
  await call("addToParty", { awakenedId: HM }, claim.token);
  const now = Date.now();
  const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', 0, ?)");
  insTile.run(ownerKey, 0, 0, now);
  insTile.run(ownerKey, 1, 0, now);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 100000, ?)").run(ownerKey, now);

  const terr = await call("getTerritory", {}, claim.token);
  ok("the homeland serves the whole deck with the field — all 60 as data for the wheel to window",
    (terr.summoning?.reinforcements ?? []).length === 60,
    JSON.stringify((terr.summoning?.reinforcements ?? []).length));
  const win0 = deckWindow(terr.summoning.reinforcements, 0);
  ok("the homeland wheel's window over the served deck fans six and presents thirty — five pages at most",
    win0.entries.length === 6 && win0.spanCount === 30 && win0.pageCount === 5 && win0.total === 60,
    JSON.stringify({ n: win0.entries.length, span: win0.spanCount, pageCount: win0.pageCount }));
  const sixtieth = deckIds[59];
  // THE REFILL SLIDE over the served list, as §2 frames it:
  // presented entries removed one by one, as thirty casts
  // empty them, until the 60th stands in the last page —
  // then its entry's act body casts it for real, below.
  const slideList = [...(terr.summoning.reinforcements ?? [])];
  let slid = 0;
  while (slid < 60 && !deckWindow(slideList, deckWindowPageCount(slideList.length) - 1).entries.some(r => r.awakenedId === sixtieth)) {
    const head = deckWindow(slideList, 0).entries[0];
    slideList.splice(slideList.findIndex(r => r.awakenedId === head.awakenedId), 1);
    slid++;
  }
  ok("the homeland window refills and slides as casts empty it — after thirty the 60th stands in its last page",
    slid === 30 && deckWindow(slideList, DECK_WINDOW_PAGES - 1).entries.some(r => r.awakenedId === sixtieth),
    JSON.stringify({ casts: slid }));
  // The entry's act body IS the summon cast (Nigel,
  // 2026-10-24): api.summonAwoken — exactly what castSummon
  // runs on the tap. The cast can falter; the tap is made
  // again, as a player makes it.
  let landed = null;
  for (let i = 0; i < 16 && !landed; i++) {
    const r = await call("summonAwoken", { awakenedId: sixtieth }, claim.token);
    if (r.summoned) landed = r;
  }
  const srow = db.prepare("SELECT follow FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(ownerKey, sixtieth);
  ok("the 60th's tap casts its summon — it stands on the field following, enrolled in the party by the cast",
    !!landed && srow?.follow === 1 && partyRows(ownerKey).includes(sixtieth),
    JSON.stringify({ landed: !!landed, follow: srow?.follow, party: partyRows(ownerKey) }));
  const terr2 = await call("getTerritory", {}, claim.token);
  ok("the deck the wheel windows now holds 59 — the summoned one stands placed, out of the window's list",
    (terr2.summoning?.reinforcements ?? []).length === 59,
    JSON.stringify((terr2.summoning?.reinforcements ?? []).length));
  const again = await callRaw("summonAwoken", { awakenedId: sixtieth }, claim.token);
  ok("summoning it again is refused in plain words — already standing on the field",
    again.status === 400 && /already stands on your field/.test(again.data?.error ?? ""), JSON.stringify(again.data));
}

console.log(`\nDECK WINDOW DRIVE (R6 in-wheel fix): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
