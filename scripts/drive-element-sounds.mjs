// THE ELEMENTAL ATTACK SOUNDS — THE PROOF (Nigel,
// 2026-10-26 08:43: "add these sounds for he elemental
// attacks"). The approved REAL recordings (ten clips cut
// from the audition pairs in ~/workspace/element-sound-
// real/) are wired into the attack flows by element; this
// drive proves, on BOTH grounds, against the servers' own
// strike ledgers, that the sounds follow the attacks
// exactly:
//
//   §H THE HOMELAND — a browser stands on the land map
//      while a ROOT Awoken's strikes and a NEUTRAL
//      Awoken's strikes settle against standing Frays.
//      Cross-checking the page's probe
//      (window.__awokenElementSounds, counting plays by
//      element:kind) against the getTerritory strike
//      ledger: (a) every root strike sounded exactly one
//      root cast, (b) exactly the root strikes the ledger
//      marks hit sounded a root hit, (c) root MISSES
//      sounded no hit, (d) the neutral Awoken's strikes
//      sounded NOTHING (neutral stays silent by law).
//   §T THE TABLE — a browser seat watches a room where a
//      SKY hand fights sculpted Frays (the empty-pack
//      drive's thinned sculpt, kept random so hits and
//      misses both fall naturally). Cross-checking the
//      page's probe against the watcher socket's strike
//      ledger: sky casts == flown sky strikes, sky hits
//      == the landed subset, misses silent, and the
//      dark's own strikes (element "dark") silent.
//
// Playback proof note: headless Chromium's audio is
// muted at the OS level (--mute-audio), but the WebAudio
// graph RUNS (autoplay policy lifted), so a play the
// probe counts is a clip genuinely started on a running
// context — the same start a hearing player gets.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "awoken-elsnd-"));
process.env.PORT = "3955";
process.env.TABLE_ROOM_SECRET = "elsnd-table-secret";
const BASE = "http://127.0.0.1:3955";
const PW = "elsnd-drive-pw";
const OUT = "/tmp/drive-elsnd";
fs.mkdirSync(OUT, { recursive: true });

await import("../server/dist/index.js");
const { default: Database } = await import("better-sqlite3");
const db = new Database(path.join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB migration-order defect — stood up by hand, as the other drives do */ }
const puppeteer = (await import("puppeteer")).default;

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) { pass++; console.log("  ✓", name); } else { fail++; console.log("  ✗", name, extra); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const realNow = Date.now;
async function call(action, args = {}, token = null) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}
await sleep(2500);

const hexDist = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r));
function mkParts(ownerKey, tenderName, kinName, parts) {
  const now = Date.now();
  const ids = {};
  for (const [cat, el, power, tough] of parts) {
    ids[cat] = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)")
      .run(`${kinName} ${cat}`, cat, power, tough, el, `elsnd/${kinName}-${cat}.png`, now).lastInsertRowid);
  }
  const comp = ["body", "arms", "head"].map((cat) => {
    const [, el, power, tough] = parts.find((p) => p[0] === cat);
    return { source_id: `db:${ids[cat]}`, name: `${kinName} ${cat}`, category: cat, rarity: "common", power, toughness: tough, element: el };
  });
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(kinName, kinName, `elsnd/${kinName}.png`, JSON.stringify(comp), tenderName, ownerKey, now).lastInsertRowid);
}
const probeOf = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__awokenElementSounds ?? { plays: {}, total: 0, ready: [] })));
const delta = (after, before, key) => (after.plays[key] ?? 0) - (before.plays[key] ?? 0);

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });

/* ══ §H THE HOMELAND ═════════════════════════════════════ */
console.log("§H the homeland — root strikes sound root, neutral strikes sound nothing");
{
  // The fixtures stand in drive-battle.mjs's exact shapes
  // (its §A is the standing proof these seeds fight).
  const claim = await call("claimTender", { password: PW, tenderName: "Sound Land" });
  const token = claim.token;
  const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id}`;
  const now = Date.now();
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(me, now);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(me, now);
  // The choosing gate opens only once three Awoken are
  // held — the two voices and a third stand in the roster
  // before the class is chosen (the gate's own terms).
  const rootKin = mkParts(me, "Sound Land", "Rootvoice", [["body", "root", 3, 3], ["arms", "root", 3, 3], ["head", "root", 3, 3]]);
  const stillKin = mkParts(me, "Sound Land", "Stillvoice", [["body", "neutral", 3, 3], ["arms", "neutral", 3, 3], ["head", "neutral", 3, 3]]);
  // The third voice is NEUTRAL on purpose: the homeland
  // auto-fields one roster Awoken at the tender's stand
  // (the greeter's place, (0,0)) — proved by a diagnostic
  // run of these very fixtures, where a sky third voice's
  // stand strikes flew with sky's reach. A neutral third
  // voice keeps every strike in this proof root or
  // neutral, and its stand strikes swell the neutral
  // ledger the silence assertion reads.
  mkParts(me, "Sound Land", "Thirdvoice", [["body", "neutral", 2, 2], ["arms", "neutral", 2, 2], ["head", "neutral", 2, 2]]);
  await call("chooseClass", { classKey: "warden" }, token);
  // The ground: pure stands for the two Awoken, cursed
  // hexes beside them holding their Frays.
  const seedTile = (q, r, cursed, element = "root") => Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(me, q, r, element, cursed, Date.now()).lastInsertRowid);
  const tileIdAt = (q, r) => db.prepare("SELECT id FROM territory_tiles WHERE owner_key = ? AND q = ? AND r = ?").get(me, q, r).id;
  seedTile(0, 0, 0); seedTile(1, 0, 0); seedTile(2, 0, 0);
  const t30 = seedTile(3, 0, 1, "fire");
  seedTile(4, 0, 0); seedTile(4, 1, 0); seedTile(3, 1, 0); seedTile(5, 0, 0);
  const t51 = seedTile(5, 1, 1, "fire");
  const placeAwokin = (awakenedId, tileId, q, r, hp) => db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
    VALUES (?, ?, ?, ?, ?, 'defense', 0, ?, ?, ?, NULL, NULL, 0)`).run(me, awakenedId, tileId, Date.now(), Date.now(), hp, q, r);
  placeAwokin(rootKin, tileIdAt(2, 0), 2, 0, 100000);
  placeAwokin(stillKin, tileIdAt(4, 1), 4, 1, 100000);
  const seedDark = (tileId, q, r) => db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
    VALUES (?, ?, 'fray', ?, 3000, ?, ?, 0, 1, 0)`).run(me, tileId, Date.now(), q, r);
  seedDark(t30, 3, 0); // beside Rootvoice
  seedDark(t51, 5, 1); // beside Stillvoice
  const advance = async (ms) => {
    db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now() - ms, me);
    return call("getTerritory", {}, token);
  };
  await call("getTerritory", {}, token); // the first read sets the battle watermark

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror:homeland]", String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2500);
  const door = await page.$(".deck-button");
  if (!door) throw new Error("homeland: no .deck-button on the home face");
  await door.click();
  await page.waitForFunction(() => !!window.__tenderJump && !!window.__tenderJump.pos(), { timeout: 30000 });
  // The first touch primes the clips (the module's own
  // priming); the probe must then stand ready with all
  // ten before any strike is counted.
  await page.mouse.click(700, 60);
  const readyAll = await (async () => { const s = Date.now(); while (Date.now() - s < 25000) { const p = await probeOf(page); if ((p.ready ?? []).length === 10) return true; await sleep(300); } return false; })();
  ok("the probe stands ready: all ten clips decoded before the battle", readyAll,
    JSON.stringify(await probeOf(page)));

  await advance(30_000); // let the page's own reads set their witness watermark
  await sleep(4000);
  const base = await probeOf(page);
  const seen = new Set();
  const ledger = [];
  const fold = (terr) => { for (const s of terr.strikes ?? []) { if (!seen.has(s.id)) { seen.add(s.id); ledger.push(s); } } };
  fold(await call("getTerritory", {}, token));
  const rootStrikes = () => ledger.filter((s) => s.element === "root");
  const neutralStrikes = () => ledger.filter((s) => s.element === "neutral");
  let probe = base, converged = false;
  const deadline = Date.now() + 260000;
  while (Date.now() < deadline) {
    fold(await advance(30_000));
    await sleep(4500);
    probe = await probeOf(page);
    const rs = rootStrikes();
    const enough = rs.length >= 6 && rs.some((s) => s.hit) && rs.some((s) => !s.hit) && neutralStrikes().length >= 2;
    if (enough
      && delta(probe, base, "root:cast") === rs.length
      && delta(probe, base, "root:hit") === rs.filter((s) => s.hit).length
      && probe.total - base.total === rs.length + rs.filter((s) => s.hit).length) { converged = true; break; }
    if (enough) await sleep(2500); // one more page loop for lag before judging
  }
  const rs = rootStrikes();
  console.log(`    [ledger] root strikes=${rs.length} (hits ${rs.filter((s) => s.hit).length}, misses ${rs.filter((s) => !s.hit).length}), neutral strikes=${neutralStrikes().length}, probe delta=${JSON.stringify(Object.fromEntries(Object.keys(probe.plays).map((k) => [k, delta(probe, base, k)])))}`);
  ok("(a) every root strike sounded exactly one root cast", delta(probe, base, "root:cast") === rs.length && rs.length >= 6,
    `cast=${delta(probe, base, "root:cast")} strikes=${rs.length}`);
  ok("(b) exactly the LANDED root strikes sounded a root hit", delta(probe, base, "root:hit") === rs.filter((s) => s.hit).length && rs.some((s) => s.hit),
    `hit=${delta(probe, base, "root:hit")} landed=${rs.filter((s) => s.hit).length}`);
  ok("(c) root misses sounded no hit (the hit count is the landed subset, and misses stand in the ledger)", rs.some((s) => !s.hit) && delta(probe, base, "root:hit") < rs.length);
  ok("(d) the neutral Awoken's strikes sounded NOTHING — the probe's whole growth is the root casts and hits",
    neutralStrikes().length >= 2 && probe.total - base.total === rs.length + rs.filter((s) => s.hit).length,
    `neutral=${neutralStrikes().length} totalDelta=${probe.total - base.total}`);
  ok("the probe converged on the ledger exactly (no strike lost, none invented)", converged);
  await page.screenshot({ path: `${OUT}/homeland.png` });
  await page.close();
}

/* ══ §T THE TABLE ═════════════════════════════════════════ */
console.log("§T the Table — a sky hand's strikes sound sky; the dark's strikes sound nothing");
{
  const { issueTableToken, partyBattleSeatFor } = await import("../server/dist/table.js");
  const stdKin = (ownerKey, tenderName, kinName, el) => mkParts(ownerKey, tenderName, kinName, [["body", el, 2, 6], ["arms", el, 2, 6], ["head", el, 2, 6]]);
  async function mkTender(name, discId) {
    const claim = await call("claimTender", { password: PW, tenderName: name });
    const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
    const ownerKey = `tender:${tenderId}`;
    db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 800").run(ownerKey, Date.now());
    for (const w of ["Wake One", "Wake Two", "Wake Three"]) stdKin(ownerKey, name, `${name} ${w}`, "sky");
    await call("chooseClass", { classKey: "warden" }, claim.token);
    const tt = issueTableToken({ id: discId, name });
    const bindCode = (await call("getTableBindCode", {}, claim.token)).code;
    const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
    if (!bindRes.ok) throw new Error("table/bind failed for " + name + ": " + bindRes.status);
    return { token: claim.token, ownerKey, tt, name };
  }
  // THE LEDGER folds from EVERY state push on BOTH
  // sockets (a polled watcher misses strikes the served
  // list trims between polls — the first run of this
  // drive proved exactly that gap: probe 15, polled
  // ledger 9).
  const ledger = [];
  const seenIds = new Set();
  let baseMaxId = 0;
  let folding = false;
  const foldState = (state) => {
    if (!folding || !state) return;
    for (const s of state.strikes ?? []) { if (s.id > baseMaxId && !seenIds.has(s.id)) { seenIds.add(s.id); ledger.push(s); } }
  };
  class Actor {
    constructor() { this.state = null; this.you = null; this.errors = []; }
    async join(tt, room) {
      this.ws = new WebSocket("ws://127.0.0.1:3955/table/ws");
      await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
      this.ws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") { this.state = m.state; if (m.you) this.you = m.you; foldState(m.state); } else if (m.type === "error") this.errors.push(String(m.message ?? "")); } catch { /* torn frame */ } };
      this.send({ type: "join", authToken: tt, room });
    }
    send(o) { this.ws.send(JSON.stringify(o)); }
    async waitYou(what, ms = 12000) { const s = Date.now(); while (Date.now() - s < ms) { if (this.you) return; await sleep(120); } throw new Error("actor wait: " + what); }
  }
  const watcher = { state: null };
  const wws = new WebSocket("ws://127.0.0.1:3955/table/ws");
  await new Promise((res, rej) => { wws.onopen = res; wws.onerror = rej; });
  wws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") { watcher.state = m.state; foldState(m.state); } } catch { /* torn frame */ } };
  wws.send(JSON.stringify({ type: "join", room: "element-sounds", watch: true, name: "Sound Watcher" }));
  const waitFor = async (fn, what, ms = 20000) => { const s = Date.now(); while (Date.now() - s < ms) { let v = false; try { v = fn(); } catch { v = false; } if (v) return true; await sleep(120); } throw new Error("drive wait: " + what); };
  const tryWait = async (fn, ms) => { try { await waitFor(fn, "tryWait", ms); return true; } catch { return false; } };
  const parseAx = (id) => id.split(",").map(Number);
  const axDist = (a, b) => { const [aq, ar] = parseAx(a); const [bq, br] = parseAx(b); return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(aq + ar - bq - br)); };
  const REACH = { stone: 1, root: 2, fire: 2, tide: 3, sky: 4 };

  const A = await mkTender("Sound Keeper", "disc-elsnd-a");
  const B = await mkTender("Sound Striker", "disc-elsnd-b");
  // The striker's bench (the empty-pack drive's fillers):
  // a seat's Table purse rides on what she holds — with
  // only her three wakes she held ✦2 against the hand's
  // ✦6 cost (this drive's second run proved it).
  for (let i = 0; i < 12; i++) stdKin(B.ownerKey, B.name, `Strikerbench ${i + 1}`, "sky");
  const handB = stdKin(B.ownerKey, B.name, "Strikerhand", "sky");
  await call("addToParty", { awakenedId: handB }, B.token);

  // The browser seat: the keeper watches from the real
  // client; the striker fights by socket (the empty-pack
  // drive's choreography). Every strike in the room flies
  // on the keeper's page, so her probe is the witness.
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror:table]", String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((sess) => { window.__awokenTableSession = sess; },
    { authToken: A.tt, room: "element-sounds", name: A.name });
  await page.goto(BASE + "/table?frame_id=drive", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".table-room", { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector(".table-room svg polygon"), { timeout: 30000 });
  await waitFor(() => (watcher.state?.players ?? []).some((p) => p.name === A.name && p.hex), "the keeper's seat stands in the watched room", 25000);
  await page.mouse.click(12, 12); // the priming touch
  const readyAll = await (async () => { const s = Date.now(); while (Date.now() - s < 25000) { const p = await probeOf(page); if ((p.ready ?? []).length === 10) return true; await sleep(300); } return false; })();
  ok("the Table page's probe stands ready: all ten clips decoded", readyAll, JSON.stringify(await probeOf(page)));

  // THE ACCOUNTING IS WHOLE-SESSION (this drive's third
  // run's lesson): folding runs from the first push, the
  // baseline is the silent page before the battle, and
  // the comparison happens after the battle is ENDED and
  // every shot in flight has landed — no window edges
  // for a cast or a hit to straddle.
  folding = true;
  const base = await probeOf(page);
  ok("the Table page starts silent — no sound before any attack", base.total === 0, JSON.stringify(base));

  const b = new Actor(); b.ownerKey = B.ownerKey; await b.join(B.tt, "element-sounds"); await b.waitYou("the striker's seat");
  // Summon the sky hand and provoke the battle (the
  // empty-pack drive's standing choreography).
  let handUnit = null;
  for (let i = 0; i < 20 && !handUnit; i++) {
    b.send({ type: "summonCast", awakenedId: handB });
    const stood = await tryWait(() => (watcher.state?.field ?? []).some((u) => u.name === "Strikerhand" && u.ownerName === B.name), 3500);
    if (stood) handUnit = watcher.state.field.find((u) => u.name === "Strikerhand" && u.ownerName === B.name);
    else await sleep(300);
  }
  if (!handUnit) throw new Error("summon never landed | seat errors: " + JSON.stringify(b.errors.slice(-3)));
  if (!watcher.state?.battle?.active) {
    const reach = REACH[handUnit.element] ?? 2;
    const target = (watcher.state?.map ?? []).find((t) => t.cursed && t.id !== "0,0" && axDist(t.id, handUnit.hex) <= reach);
    if (target) { b.send({ type: "strikeCurse", cardId: handUnit.cardId, hex: handUnit.hex, target: target.id }); await sleep(300); }
    const dealt = await tryWait(() => watcher.state?.battle?.active && (watcher.state?.dark ?? []).length > 0, 60000);
    if (!dealt) throw new Error("no battle dealt | errors: " + JSON.stringify(b.errors.slice(-3)));
  }
  // THE SCULPT (the empty-pack drive's, kept natural — no
  // dice pinning, so hits and misses both fall): three
  // 5-hp Frays beside the hand and one great anchor in the
  // far corner so the referee keeps ticking strikes.
  await sleep(700);
  const room = partyBattleSeatFor(B.ownerKey)?.room;
  if (!room) throw new Error("no room handle for the sculpt");
  const darks = [...room.dark.values()];
  const hand = [...room.field.values()].find((u) => u.card.name === "Strikerhand");
  const keep = darks.slice(0, 3);
  let anchor = null;
  for (const e of darks) { if (keep.includes(e)) continue; if (!anchor) { anchor = e; continue; } room.dark.delete(e.id); }
  keep.forEach((e, i) => {
    // hp 60, not the empty-pack drive's 5: these Frays
    // must LIVE long enough to strike back — the dark's
    // own strikes (element "dark") are the silence proof.
    // And they stand at 50–66 px: the dark answers only
    // victims within 69 px (the referee's own measure,
    // table.ts blowOnce) — the second run's 120–210 px
    // ring stood outside it and the dark never struck.
    e.kind = "fray"; e.label = "Fray"; e.power = 1; e.hp = 60; e.maxHp = 60;
    const dx = 0 - hand.pos.x, dy = 0 - hand.pos.y; const len = Math.hypot(dx, dy) || 1; const d = 50 + i * 8;
    e.pos = { x: hand.pos.x + (dx / len) * d, y: hand.pos.y + (dy / len) * d };
    e.target = null; e.pinnedUntil = Date.now() + 600000;
  });
  if (anchor) { anchor.kind = "fray"; anchor.label = "Fray"; anchor.power = 1; anchor.hp = 999999; anchor.maxHp = 999999; anchor.pos = { x: 30, y: 30 }; anchor.target = null; anchor.pinnedUntil = Date.now() + 600000; }

  const fold = () => { foldState(watcher.state); foldState(b.state); };
  const skyStrikes = () => ledger.filter((s) => s.element === "sky");
  const darkStrikes = () => ledger.filter((s) => s.side === "dark");
  let probe = base;
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    fold();
    await sleep(4000);
    fold();
    probe = await probeOf(page);
    const ss = skyStrikes();
    if (ss.length >= 6 && ss.some((s) => s.hit) && ss.some((s) => !s.hit) && darkStrikes().length >= 1) break;
  }
  // END THE BATTLE and let every shot in flight land:
  // the comparison below is whole-session, probe against
  // ledger, with nothing left straddling an edge.
  for (const id of [...room.dark.keys()]) room.dark.delete(id);
  {
    let stable = 0, lastTotal = -1, lastLedger = -1;
    const endBy = Date.now() + 60000;
    while (Date.now() < endBy && stable < 3) {
      await sleep(1600);
      fold();
      probe = await probeOf(page);
      if (probe.total === lastTotal && ledger.length === lastLedger) stable++;
      else { stable = 0; lastTotal = probe.total; lastLedger = ledger.length; }
    }
  }
  fold();
  const ss = skyStrikes();
  console.log(`    [ledger] sky strikes=${ss.length} (hits ${ss.filter((s) => s.hit).length}, misses ${ss.filter((s) => !s.hit).length}), dark strikes=${darkStrikes().length}, other=${ledger.filter((s) => s.element !== "sky" && s.side !== "dark").length}, probe delta=${JSON.stringify(Object.fromEntries(Object.keys(probe.plays).map((k) => [k, delta(probe, base, k)])))}`);
  ok("(a) every sky strike at the Table sounded exactly one sky cast", delta(probe, base, "sky:cast") === ss.length && ss.length >= 6,
    `cast=${delta(probe, base, "sky:cast")} strikes=${ss.length}`);
  ok("(b) exactly the LANDED sky strikes sounded a sky hit", delta(probe, base, "sky:hit") === ss.filter((s) => s.hit).length && ss.some((s) => s.hit),
    `hit=${delta(probe, base, "sky:hit")} landed=${ss.filter((s) => s.hit).length}`);
  ok("(c) sky misses sounded no hit (misses stand in the ledger, the hit count is the landed subset)", ss.some((s) => !s.hit) && delta(probe, base, "sky:hit") < ss.length);
  ok("(d) the dark's own strikes sounded NOTHING — the probe's whole growth is the sky casts and hits",
    darkStrikes().length >= 1 && probe.total - base.total === ss.length + ss.filter((s) => s.hit).length,
    `dark=${darkStrikes().length} totalDelta=${probe.total - base.total}`);
  ok("the Table probe matches the ledger whole-session: every play is a sky cast or a landed sky hit, nothing else sounded",
    probe.total - base.total === ss.length + ss.filter((s) => s.hit).length,
    `totalDelta=${probe.total - base.total} expected=${ss.length + ss.filter((s) => s.hit).length}`);
  await page.screenshot({ path: `${OUT}/table.png` });
  await page.close();
  try { b.ws.close(); } catch { /* already gone */ }
  try { wws.close(); } catch { /* already gone */ }
}

await browser.close();
console.log(`\n══ ELEMENT SOUNDS: ${pass} passed, ${fail} failed ══`);
process.exit(fail ? 1 : 0);
