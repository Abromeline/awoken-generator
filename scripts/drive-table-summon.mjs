// THE TABLE FIX PASS — summon / elsewhere / attune drive
// (2026-10-20). Boots the real server in-process on a scratch
// DATA_DIR (the suites' own pattern), seeds ONE bound tender
// with three Awokin — one dealt, one standing on his homeland
// field, one staged at his bastion — then drives the real
// Table page with puppeteer and proves, against a watcher
// socket's room truth:
//   1. the hand NAMES the elsewhere company (fielded/staged)
//      instead of silently dealing short;
//   2. a readied card + a tap on the Tender's own figure is a
//      SUMMON attempt on his tile — it lands — where the old
//      hit circle swallowed the tap and cleared the card;
//   3. on cursed ground the same gesture is refused PLAINLY
//      by the referee and the readied card is NOT cleared;
//   4. the Attune act: one pool point turns his standing tile
//      to the chosen element (pool decremented, tale told),
//      and cursed ground offers no attune — only the plain note.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-table-summon.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-summon-"));
process.env.PORT = "3941";
process.env.WORKSHOP_PASSWORD = "<redacted>";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname); // the server resolves client/dist from CWD
const PW = ["fix", "password", "1"].join("-");
const BASE = "http://127.0.0.1:3941";
const OUT = "/home/hatch/workspace/table-fix-proof";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

await import("../server/dist/index.js");
await sleep(2500);

async function call(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

// ── Seed the bound tender (the wheel drive's recipe) ──────
const db = new Database(join(process.env.DATA_DIR, "app.db"));
// STORE MIGRATION-ORDER DEFECT (found by this drive,
// 2026-10-20 — not this pass's change): store.ts adds
// awakened.greeter by ALTER at :181, but the base DDL only
// executes at :213 — on a FRESH database the ALTER runs
// before the table exists and its own catch swallows the
// failure, so the column is never created and every drizzle
// select on schema.awakened (the Table's deal included)
// throws "no such column: greeter". Production's table
// pre-existed the code, so the ALTER landed there. Until
// store.ts is repaired, this drive stands the column up
// itself so the Table's law can be exercised at all; the
// defect and its repair are named in the fix pass's report.
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }
const claim = await call("claimTender", { password: PW, tenderName: "Fix Tender" });
const token = claim.token;
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, Date.now());
const now = Date.now();
const bodyId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'body', 'common', 2, 2, 'sky', ?, 'image/png', ?)").run("Fix Body", "fix/body.png", now).lastInsertRowid);
const armsId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'arms', 'common', 3, 3, 'sky', ?, 'image/png', ?)").run("Fix Arms", "fix/arms.png", now).lastInsertRowid);
const headId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'head', 'common', 3, 3, 'sky', ?, 'image/png', ?)").run("Fix Head", "fix/head.png", now).lastInsertRowid);
const compJson = JSON.stringify([
  { source_id: `db:${bodyId}`, name: "Fix Body", category: "body", rarity: "common", power: 2, toughness: 2, element: "sky" },
  { source_id: `db:${armsId}`, name: "Fix Arms", category: "arms", rarity: "common", power: 3, toughness: 3, element: "sky" },
  { source_id: `db:${headId}`, name: "Fix Head", category: "head", rarity: "common", power: 3, toughness: 3, element: "sky" },
]);
const mkAwokin = (name) => Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
  .run(name, name, "fix/awokin.png", compJson, "Fix Tender", ownerKey, now).lastInsertRowid);
const handId = mkAwokin("Handkin");
const fieldId = mkAwokin("Fieldkin");
const stageId = mkAwokin("Stagekin");
// A settled homeland disc, so Fieldkin can stand on its field.
const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, ?, ?, ?, ?)");
const tileIds = {};
for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) {
  const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
  if (ring > 3) continue;
  tileIds[`${q},${r}`] = Number(insTile.run(ownerKey, q, r, ring <= 2 ? 0 : 1, now).lastInsertRowid);
}
db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, hp) VALUES (?, ?, ?, ?, ?, 30)")
  .run(ownerKey, fieldId, tileIds["1,0"], now, now);
// Stagekin waits at the bastion.
db.prepare("INSERT INTO bastion_staged (owner_key, awakened_id, staged_at, via) VALUES (?, ?, ?, 'hand')").run(ownerKey, stageId, now);
// The attune pool: five root points.
db.prepare("INSERT INTO aspect_attunement (owner_key, element, points, updated_at) VALUES (?, 'root', 5, ?)").run(ownerKey, now);
await call("chooseClass", { classKey: "warden" }, token);
// THE STRICT DEAL (2026-10-21): the Table deals the party
// alone, so the party is composed here — all three of them
// (the untrained party stands three wide): Handkin to be
// dealt, Fieldkin and Stagekin to be named in the elsewhere
// row from their posts.
await call("addToParty", { awakenedId: handId }, token);
await call("addToParty", { awakenedId: fieldId }, token);
await call("addToParty", { awakenedId: stageId }, token);
const { issueTableToken } = await import("../server/dist/table.js");
const tt = issueTableToken({ id: "disc-fix", name: "Fix Tender" });
const bindCode = (await call("getTableBindCode", {}, token)).code;
const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
if (!bindRes.ok) throw new Error("table/bind failed: " + bindRes.status);
console.log("seeded: bound Lv10 tender — Handkin dealt, Fieldkin on the homeland field, Stagekin staged, root pool 5");

// ── Watcher socket: the room's own truth ──────────────────
const wstate = { state: null };
const wws = new WebSocket("ws://127.0.0.1:3941/table/ws");
await new Promise((res, rej) => { wws.onopen = res; wws.onerror = rej; });
wws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") wstate.state = m.state; } catch { /* a torn frame is no evidence */ } };
wws.send(JSON.stringify({ type: "join", room: "fix-summon", watch: true, name: "Drive Watcher" }));
const waitFor = async (fn, what, ms = 9000) => { const s = Date.now(); while (Date.now() - s < ms) { if (fn()) return true; await sleep(150); } throw new Error("drive wait: " + what); };
const waitPage = async (pg, fn, what, ms = 9000) => { const s = Date.now(); while (Date.now() - s < ms) { if (await pg.evaluate(fn)) return true; await sleep(150); } throw new Error("drive wait (page): " + what); };
const mySeat = () => wstate.state?.players.find((p) => p.name === "Fix Tender") ?? null;
const myField = () => (wstate.state?.field ?? []).filter((u) => u.ownerKey === mySeat()?.key);
const tileOf = (id) => wstate.state?.map.find((t) => t.id === id) ?? null;
const axDist = (a, b) => { const [aq, ar] = a.split(",").map(Number); const [bq, br] = b.split(",").map(Number); const dq = aq - bq, dr = ar - br; return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)); };

// ── The page ──────────────────────────────────────────────
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 240)));
await page.evaluateOnNewDocument((sess) => { window.__awokenTableSession = sess; },
  { authToken: tt, room: "fix-summon", name: "Fix Tender" });
await page.goto(BASE + "/table?frame_id=drive", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector(".table-room", { timeout: 30000 });
await page.waitForFunction(() => document.querySelector(".table-room svg polygon"), { timeout: 30000 });
await waitFor(() => !!mySeat() && !!mySeat().hex, "watcher reads the seat and its hex");
await waitPage(page, () => [...document.querySelectorAll(".tcard")].some((c) => c.textContent.includes("Handkin")), "the dealt card stands in the hand");
const landing = mySeat().hex;
console.log("  seat hex:", landing, "| landing element:", tileOf(landing)?.element);

// The tile lattice, solved as the wheel drive solves it:
// polygon order is NOT map order, so every tap goes by tile id.
const buildPerm = async (pg, selector, tiles, size) => pg.evaluate(({ selector, tiles, size }) => {
  const els = [...document.querySelectorAll(selector)];
  const cents = els.map((p) => {
    const pts = (p.getAttribute("points") ?? "").trim().split(/\s+/).map((s) => s.split(",").map(Number));
    return { x: pts.reduce((a, pt) => a + pt[0], 0) / pts.length, y: pts.reduce((a, pt) => a + pt[1], 0) / pts.length };
  });
  const U = [1292 * size / 796, 470 * size / 796], V = [0, 948 * size / 796];
  const score = (ox, oy) => {
    let h = 0;
    for (const t of tiles) {
      const ex = ox + t.q * U[0] + t.r * V[0], ey = oy + t.q * U[1] + t.r * V[1];
      if (cents.some((o) => Math.abs(o.x - ex) < 3 && Math.abs(o.y - ey) < 3)) h++;
    }
    return h;
  };
  let best = null;
  for (const c of cents) { const h = score(c.x, c.y); if (!best || h > best.hits) best = { ox: c.x, oy: c.y, hits: h }; }
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) {
    if (!a && !b) continue;
    const ox = best.ox + a * U[0] + b * V[0], oy = best.oy + a * U[1] + b * V[1];
    const h = score(ox, oy);
    if (h > best.hits) best = { ox, oy, hits: h };
  }
  const pairs = [];
  for (const t of tiles) {
    const ex = best.ox + t.q * U[0] + t.r * V[0], ey = best.oy + t.q * U[1] + t.r * V[1];
    let bi = -1, bd = 1e9;
    cents.forEach((o, i) => { const d = Math.hypot(o.x - ex, o.y - ey); if (d < bd) { bd = d; bi = i; } });
    pairs.push({ id: t.id, bi, bd });
  }
  pairs.sort((a, b) => a.bd - b.bd);
  const used = new Set(); const perm = {};
  for (const p of pairs) if (!used.has(p.bi)) { used.add(p.bi); perm[p.id] = p.bi; }
  const expected = new Map(tiles.map((t) => [t.id, { x: best.ox + t.q * U[0] + t.r * V[0], y: best.oy + t.q * U[1] + t.r * V[1] }]));
  for (const p of pairs) {
    if (perm[p.id] !== undefined) continue;
    const e = expected.get(p.id);
    let bi = -1, bd = 1e9;
    cents.forEach((o, i) => { if (used.has(i)) return; const d = Math.hypot(o.x - e.x, o.y - e.y); if (d < bd) { bd = d; bi = i; } });
    if (bi >= 0) { used.add(bi); perm[p.id] = bi; p.bd = bd; }
  }
  return { perm, hits: best.hits, worst: Math.max(...pairs.map((p) => p.bd)), matched: Object.keys(perm).length };
}, { selector, tiles, size });
const permRes = await buildPerm(page, '.table-room svg polygon[fill="transparent"]', (wstate.state?.map ?? []).map((t) => ({ id: t.id, q: t.q, r: t.r })), 40);
const perm = permRes.perm;
ok("the stage's tile lattice is solved", permRes.matched === (wstate.state?.map ?? []).length && permRes.worst < 20, JSON.stringify(permRes));
const tapTile = async (id) => {
  await page.evaluate((pi) => {
    const polys = [...document.querySelectorAll('.table-room svg polygon[fill="transparent"]')];
    polys[pi]?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }, perm[id]);
};
const tapFigure = async (r) => {
  await page.evaluate((rr) => {
    const c = [...document.querySelectorAll('.table-room svg circle')].find((x) => x.getAttribute("r") === String(rr) && x.getAttribute("fill") === "transparent");
    c?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }, r);
};
const clickText = async (sel, text) => page.evaluate(({ sel, text }) => {
  const el = [...document.querySelectorAll(sel)].find((b) => b.textContent.trim() === text || b.textContent.includes(text));
  if (el) { el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); return true; }
  return false;
}, { sel, text });
const clickCard = async (name) => page.evaluate((n) => {
  const el = [...document.querySelectorAll(".tcard")].find((c) => c.textContent.includes(n));
  if (el) { el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); return true; }
  return false;
}, name);
// A recalled card keeps its dealt id, so an earlier selection
// can stand again when it returns to hand — flows that need
// the Tender's bar (not a summon) clear the selection first.
const deselectIfNeeded = async () => {
  const sel = await page.evaluate(() => !!document.querySelector(".tcard.selected"));
  if (sel) { await clickCard("Handkin"); await sleep(300); }
};
// The hand-grab TOGGLES — raise the hand only when it is down,
// or the card click that follows is spent on the raising.
const raiseHand = async () => {
  const up = await page.evaluate(() => document.querySelector(".hand-grab")?.getAttribute("aria-expanded") === "true");
  if (!up) { await clickText(".hand-grab", "your hand"); await sleep(300); }
};

// ═══ 1. THE SILENT HAND, NAMED ═══
const handRead = await page.evaluate(() => ({
  cards: [...document.querySelectorAll(".tcard")].map((c) => c.textContent),
  chips: [...document.querySelectorAll(".elsewhere-chip")].map((c) => c.textContent),
}));
ok("the hand is dealt exactly the one free Awokin", handRead.cards.length === 1 && handRead.cards[0].includes("Handkin"), JSON.stringify(handRead.cards).slice(0, 160));
ok("Fieldkin is NAMED as kept back, on the homeland field", handRead.chips.some((c) => c.includes("Fieldkin") && c.includes("homeland field")), JSON.stringify(handRead.chips));
ok("Stagekin is NAMED as kept back, staged at the bastion", handRead.chips.some((c) => c.includes("Stagekin") && c.includes("staged at your bastion")), JSON.stringify(handRead.chips));
await page.screenshot({ path: `${OUT}/summon-hand.png` });

// ═══ 2. THE TRAP, DISARMED: figure tap summons ═══
await raiseHand();
await clickCard("Handkin");
await waitPage(page, () => !!document.querySelector(".tcard.selected") && (document.querySelector(".cast-hint")?.textContent ?? "").includes("Handkin"), "the card stands readied");
await tapFigure(24); // the Tender's own hit circle — the old trap
await waitFor(() => myField().length === 1, "the summon lands on the Tender's tile", 9000);
const stood = myField()[0];
ok("the figure tap SUMMONED onto the Tender's own hex", stood?.name === "Handkin" && stood?.hex === landing, JSON.stringify(stood ?? null).slice(0, 200));
await page.screenshot({ path: `${OUT}/summon-landed.png` });

// ═══ 3. RECALL — the hand receives it back ═══
await tapFigure(20); // the standing unit's own hit circle
await waitPage(page, () => (document.querySelector(".unit-bar")?.textContent ?? "").includes("Recall"), "the unit bar opens");
await clickText(".unit-bar button", "Recall");
await waitFor(() => myField().length === 0, "the recall returns the field to empty", 9000);
await waitPage(page, () => [...document.querySelectorAll(".tcard")].some((c) => c.textContent.includes("Handkin")), "the card stands in hand again");
ok("recall returns the card to hand", true);

// ═══ 4. THE ATTUNE ACT ═══
await deselectIfNeeded();
await tapFigure(24);
await waitPage(page, () => !!document.querySelector(".unit-bar"), "the Tender's bar opens");
const barBefore = await page.evaluate(() => document.querySelector(".unit-bar")?.textContent ?? "");
ok("the bar offers the Attune act on purified ground", barBefore.includes("Attune this ground"), barBefore.slice(0, 200));
ok("the landing holds sky — attuning root is a true turn, not a repeat", tileOf(landing)?.element === "sky", String(tileOf(landing)?.element));
const rootBtn = await page.evaluate(() => {
  const b = [...document.querySelectorAll(".attune-btn")].find((x) => x.textContent.trim().startsWith("root"));
  return b ? { text: b.textContent.trim(), disabled: b.disabled } : null;
});
ok("the root attune button stands armed with the pool's count (5)", !!rootBtn && !rootBtn.disabled && rootBtn.text.includes("5"), JSON.stringify(rootBtn));
await clickText(".attune-btn", "root");
await waitFor(() => tileOf(landing)?.element === "root", "the tile turns to root on the room's truth", 9000);
ok("the spent point TURNED the tile: the standing ground holds root", tileOf(landing)?.element === "root");
const tale = (wstate.state?.tale ?? []).map((t) => t.text).join("\n");
ok("the tale tells the attuning", tale.includes("attunes the ground"), tale.slice(-300));
// The page's own push converges a beat behind the watcher's —
// wait for the payment to show on the button's face.
await waitPage(page, () => ([...document.querySelectorAll(".attune-btn")].find((x) => x.textContent.trim().startsWith("root"))?.textContent ?? "").includes("· 4"), "the pool's payment shows on the button's face", 9000);
ok("the pool paid exactly one point (5 → 4 on the button's face)", true);
await page.screenshot({ path: `${OUT}/attune-landed.png` });
await clickText(".unit-bar button", "Done");
await sleep(300);

// ═══ 5+6. ON CURSED GROUND: no attune offered, and the ═══
// ═══ refused summon keeps its card ═══
const cursedId = (wstate.state?.map ?? []).find((t) => t.cursed && axDist(t.id, landing) === 1)?.id;
ok("a cursed neighbour stands ready for the refusal proofs", !!cursedId);
await deselectIfNeeded();
await tapFigure(24);
await waitPage(page, () => !!document.querySelector(".unit-bar"), "the Tender's bar opens for the glide");
await tapTile(cursedId);
await waitFor(() => mySeat()?.hex === cursedId, "the Tender glides onto the cursed tile", 20000);
await sleep(600); // let the glide settle; his hex must BE the cursed tile
ok("the Tender stands on cursed ground", tileOf(cursedId)?.cursed === true && mySeat()?.hex === cursedId, mySeat()?.hex ?? "");
await tapFigure(24);
await waitPage(page, () => (document.querySelector(".unit-bar")?.textContent ?? "").includes("still cursed"), "the bar answers with the plain cursed note", 9000);
const cursedBar = await page.evaluate(() => ({
  note: (document.querySelector(".unit-bar")?.textContent ?? "").includes("Attunement rests only on purified ground"),
  buttons: document.querySelectorAll(".attune-btn").length,
}));
ok("cursed ground offers NO attune buttons — only the plain word", cursedBar.note && cursedBar.buttons === 0, JSON.stringify(cursedBar));
await clickText(".unit-bar button", "Done");
await sleep(300);

await raiseHand();
await clickCard("Handkin");
await waitPage(page, () => !!document.querySelector(".tcard.selected"), "the card stands readied on cursed ground");
await tapFigure(24); // the summon attempt on his own (cursed) tile
await waitPage(page, () => (document.querySelector(".notice-line")?.textContent ?? "").includes("still cursed"), "the referee's refusal reaches the page plainly", 9000);
const kept = await page.evaluate(() => ({
  selected: !!document.querySelector(".tcard.selected"),
  hint: (document.querySelector(".cast-hint")?.textContent ?? "").includes("Handkin"),
  notice: document.querySelector(".notice-line")?.textContent ?? "",
}));
ok("the refusal is PLAIN (the referee's own words reach the eye)", kept.notice.includes("That ground is still cursed"), kept.notice);
ok("the readied card is NOT silently cleared by the refused tap", kept.selected && kept.hint, JSON.stringify(kept).slice(0, 200));
ok("and nothing stands summoned on the cursed tile", myField().length === 0);
await page.screenshot({ path: `${OUT}/summon-refused-card-kept.png` });

await browser.close();
wws.close();
console.log(`\nDRIVE (summon/elsewhere/attune): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
