// THE DECK WINDOW — THE R6 IN-WHEEL FIX DRIVE (2026-10-23;
// Nigel, 19:45: "i would prefer a fix that keeps summoning
// in the action wheel without a popup"). The deck panel is
// dead; the wheel's Awoken branch shows the company plus
// ONE window of six deck entries at a time, a "More" entry
// inside the wheel pages through the deck, and a deck
// entry's tap IS the call — tapOnly, no dragKey, no pinKey,
// so the GroundWheel's >9px drag reclassification and its
// pin badge can never eat it (the drag-to-hotbar for deck
// entries is gone; the tap won).
// Boots the real server in-process on a scratch DATA_DIR
// with the road shortened by its own env dial, seeds a
// SIXTY-Awoken deck, and proves:
//   §0 THE WINDOW CODE THE WHEEL RENDERS (client/src/
//      deckWindow.ts, bundled by esbuild and imported —
//      the very functions Table.tsx and Territory.tsx call):
//      a window is six, paging walks all 60 in order with
//      no repeats and reaches the last deck Awoken, "More"
//      wraps, and a page past a shrunken deck clamps.
//   §1 THE COMPONENT-LEVEL TAP PATH (no Chrome exists in
//      this sandbox for a true browser click run — this is
//      the component proof, stated plainly): both grounds
//      build their deck entries tapOnly with no dragKey and
//      no pinKey and a name-only label, the "More" entry
//      stands stayOpen in both, and GroundWheel's own code
//      refuses to arm the drag or draw the pin for tapOnly.
//   §2 THE TABLE, 60 DECK — the full deck is served as
//      DATA; the wheel's window (the §0 code over the served
//      list) holds six of them and its last page holds the
//      60th. The wheel entry's act body — the guarded
//      castTableDeckSummon send (Nigel, 2026-10-24: the tap
//      IS the summon cast; the R6 road this section proved
//      until tonight was the gate Nigel struck) — is run
//      for that entry: a name outside the deck is refused
//      in plain words ("not in your deck"); the cast lands
//      the 60th on the field FOLLOWING, and enrols it in
//      the party in the same act.
//   §3 THE HOMELAND, 60 DECK — the deck is served with the
//      field; the window's last page holds the 60th; its
//      entry's act body (api.summonAwoken, exactly what
//      castSummon runs) casts its summon: it stands on the
//      field following, enrolled in the party by the cast
//      at once, it stands in the summon company and leaves
//      the deck; calling it again is refused in plain words
//      ("already stands in your party").
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
const { DECK_WINDOW_SIZE, deckWindow, nextDeckPage, deckPageCount } = await import(bundleOut);
const deck60 = Array.from({ length: 60 }, (_, i) => i + 1);
{
  ok("the window size is six — the page the ring can hold", DECK_WINDOW_SIZE === 6);
  const w0 = deckWindow(deck60, 0);
  ok("the first window holds exactly six deck entries, never the whole deck",
    w0.entries.length === 6 && w0.total === 60 && w0.pageCount === 10 && w0.hasMore,
    JSON.stringify({ n: w0.entries.length, total: w0.total, pageCount: w0.pageCount }));
  const seen = [];
  let page = 0;
  for (let i = 0; i < 10; i++) {
    const w = deckWindow(deck60, page);
    seen.push(...w.entries);
    page = nextDeckPage(page, w.total);
  }
  ok("paging with the More step walks all 60 in order, no entry twice, none stacked or skipped",
    seen.join(",") === deck60.join(","), seen.slice(0, 8).join(","));
  ok("after the last page the More step wraps to the first", page === 0);
  const last = deckWindow(deck60, deckPageCount(60) - 1);
  ok("the last page reaches the last deck Awoken — the 60th stands in a window",
    last.entries.includes(60) && last.entries.length === 6, JSON.stringify(last.entries));
  const shrunk = deckWindow(deck60.slice(0, 59), 9);
  ok("a page left past a shrunken deck clamps to the last standing page — the wheel never opens blank",
    shrunk.page === 9 && shrunk.entries.length === 5 && shrunk.entries.includes(59),
    JSON.stringify({ page: shrunk.page, n: shrunk.entries.length }));
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
  ok("the wheel's first window over the served deck holds six entries — never all 60 as entries at once",
    win0.entries.length === 6 && win0.total === 60);
  const lastPage = deckPageCount(60) - 1;
  const winLast = deckWindow(b.you.reinforcements, lastPage);
  const sixtieth = deckIds[59];
  ok("paging reaches the last deck Awoken — the 60th stands in the last window",
    winLast.entries.some(r => r.awakenedId === sixtieth), JSON.stringify(winLast.entries.map(r => r.awakenedId)));

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
  const winLast = deckWindow(terr.summoning.reinforcements, deckPageCount(60) - 1);
  const sixtieth = deckIds[59];
  ok("the homeland window's last page holds the 60th deck Awoken",
    winLast.entries.some(r => r.awakenedId === sixtieth));
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
