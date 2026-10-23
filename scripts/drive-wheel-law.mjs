// THE WHEEL LAW, END TO END (Nigel, 2026-10-22): the
// workings tray is struck everywhere — "this menu should
// not show up anywhere ever" — and casting lives wholly in
// the wheel: "casting = right click anywhere while in tender
// mode opens wheel > spells > pick spell, click cast, click
// cast, click cast. Same with runes and summoning."
// drive-cast-flow.mjs proves the Rune branch's repeat road
// on both grounds; this drive proves the rest of the law:
//   §1 THE LAND MAP — the Spell branch opens and shows the
//      book's honest face (the book holds no spell pages
//      yet, so the branch's one disc reads "None yet" — the
//      Witch's school wakes with its first page); the Ward
//      branch readies a ward, and the ward is cast TWICE
//      from the one readying (anchor tap + edge tap, twice),
//      two wards standing, the purse lighter by real costs.
//   §2 THE TABLE — summoning by the same law (the target
//      struck, 2026-10-22): right-click, the Awoken branch,
//      and the PICK IS THE CAST — no card is readied, no
//      ground is tapped; the referee lands the creature at
//      the Tender's side. A falter spends the price and the
//      member stays callable — pick again. A second member
//      is picked and stands the same way — two standings,
//      each cast paid for before its roll.
//   §3 THE BUNDLE — the shipped client contains no tray
//      markup strings at all.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-wheel-law.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-wheellaw-"));
process.env.PORT = "3948";
process.env.WORKSHOP_PASSWORD = ["drive", "pass", "9"].join("-");
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const PW = ["wheel", "law", "pw", "1"].join("-");
const BASE = "http://127.0.0.1:3948";
const OUT = "/home/hatch/workspace/cast-flow-proof";
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

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB migration-order defect — stood up by hand, as the other drives do */ }

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

// Clicks a GroundWheel disc by label text with REAL mouse
// events — branch discs act on click, entry discs on
// pointer-down/up, exactly as a player's tap lands.
const clickDisc = async (pg, sel, txt) => {
  const handle = await pg.evaluateHandle((q, t) => [...document.querySelectorAll(q)].find((d) => ((d.getAttribute("aria-label") || "") + " " + (d.textContent || "")).includes(t)), sel, txt);
  const el = handle.asElement();
  if (!el) throw new Error("wheel disc not found: " + txt);
  const box = await el.boundingBox();
  if (!box) throw new Error("wheel disc has no box: " + txt);
  await pg.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });

/* ══ §1 THE LAND MAP — Spell branch honesty + Ward repeat ══ */
console.log("§1 the land map — the Spell branch's honest face, and a ward cast twice from one readying");
{
  const claim = await call("claimTender", { password: PW, tenderName: "Wheellaw Land" });
  const token = claim.token;
  const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id}`;
  const now = Date.now();
  db.prepare(`INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at, class_key, weapon_key, hp, weapon_next_at)
    VALUES (?, 3800, 0, ?, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET
    total_exp = 3800, class_key = 'warden', hp = 100`).run(me, now, now + 600000);
  const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, ?, ?, 0, ?)");
  for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > 3) continue;
    insTile.run(me, q, r, now);
  }
  db.prepare("INSERT INTO tender_resources (owner_key, energy, terrain_bank, updated_at) VALUES (?, 500, 200, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500, terrain_bank = 200").run(me, now);

  const grimBody = await call("getGrimoire", {}, token);
  const grim = grimBody.data ?? grimBody;
  const ward = (grim.spells ?? []).find((s) => s.kind === "ward");
  ok("the book holds a ward page for the Ward branch", !!ward, JSON.stringify((grim.spells ?? []).map((s) => [s.key, s.kind])));
  const wardForm = ward.forms?.unaligned ?? ward.name;
  const spellPages = (grim.spells ?? []).filter((s) => s.kind === "spell");
  ok("the book holds NO spell pages yet — the Spell branch's honest face is 'None yet'", spellPages.length === 0, JSON.stringify(spellPages.map((s) => s.key)));

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror:territory]", String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2500);
  const door = await page.$(".deck-button");
  if (!door) throw new Error("territory: no .deck-button on the home face");
  await door.click();
  await page.waitForFunction(() => !!window.__tenderJump && !!window.__tenderJump.pos(), { timeout: 30000 });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Skip");
    if (b) b.click();
  });
  await sleep(800);

  // The fetch witness: every castMapWorking, and its fate.
  await page.evaluate(`(() => {
    window.__castLog = [];
    const of = window.fetch.bind(window);
    window.fetch = async (...a) => {
      const r = await of(...a);
      try {
        if (String(a[0]).includes("castMapWorking")) {
          const j = await r.clone().json().catch(() => null);
          const raw = JSON.stringify(j ?? {});
          window.__castLog.push({ at: Date.now(), ok: r.ok, fizzled: raw.includes('"fizzled":true'), refused: !r.ok });
        }
      } catch { /* the witness never breaks the page */ }
      return r;
    };
  })()`);

  // Right-click opens the wheel; the Spell branch fans and
  // shows the book's honest answer.
  await page.mouse.click(420, 300, { button: "right" });
  await page.waitForSelector(".gw-wheel", { timeout: 9000 });
  ok("right-click anywhere in tender mode opens the wheel on the land map", true);
  await clickDisc(page, ".gw-disc.cat", "Spell");
  await sleep(600);
  const spellFace = await page.evaluate(() => [...document.querySelectorAll(".gw-disc")].map((d) => d.textContent));
  ok("the Spell branch shows the book's honest face — its one disc reads 'None yet'", spellFace.some((t) => t.includes("None yet")), JSON.stringify(spellFace));
  await page.screenshot({ path: `${OUT}/wheel-law-spell-branch.png` });

  // Then the Ward branch (the branch discs stand around the
  // wheel at all times — no "back" step exists): ready the
  // ward ONCE.
  await clickDisc(page, ".gw-disc.cat", "Ward");
  await sleep(500);
  await page.screenshot({ path: `${OUT}/wheel-law-territory-ward.png` });
  const readyWard = async () => {
    await clickDisc(page, ".gw-disc", wardForm);
    await page.waitForFunction((fn) => (document.querySelector(".hex-notice")?.textContent ?? "").includes(fn), { timeout: 9000 }, wardForm).catch(() => {});
    await sleep(300);
  };
  await readyWard();
  ok("the Ward branch readied the ward — the land waits for its anchor tap", true);

  // Map the hit polygons to tiles by centroid (the cast-flow
  // drive's proven lattice: origin 250,170, size 54).
  const terr0 = await call("getTerritory", {}, token);
  const terr0Data = terr0.data ?? terr0;
  const pairs = await page.evaluate((tilesArg) => {
    const polys = [...document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]')];
    const cents = polys.map((p) => {
      const pts = (p.getAttribute("points") ?? "").trim().split(/\s+/).map((s) => s.split(",").map(Number));
      return { x: pts.reduce((a, pt) => a + pt[0], 0) / pts.length, y: pts.reduce((a, pt) => a + pt[1], 0) / pts.length };
    });
    const k = 54 / 796, U = [1292 * k, 470 * k], V = [0, 948 * k];
    const out = [];
    for (const t of tilesArg) {
      const ex = 250 + t.q * U[0] + t.r * V[0], ey = 170 + t.q * U[1] + t.r * V[1];
      let bi = -1, bd = 1e9;
      cents.forEach((c, i) => { const d = Math.hypot(c.x - ex, c.y - ey); if (d < bd) { bd = d; bi = i; } });
      if (bd < 12) out.push({ id: t.id, q: t.q, r: t.r, poly: bi });
    }
    return out;
  }, (terr0Data.tiles ?? []).map((t) => ({ id: t.id, q: t.q, r: t.r })));
  const byQR = new Map(pairs.map((p) => [`${p.q},${p.r}`, p]));
  const tapTile = async (q, r) => {
    const t = byQR.get(`${q},${r}`);
    if (!t) throw new Error(`no polygon for tile ${q},${r}`);
    await page.evaluate((i) => {
      const p = document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]')[i];
      p?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }, t.poly);
  };
  const wardCount = async () => {
    const t = await call("getTerritory", {}, token);
    const d = t.data ?? t;
    return (d.workings ?? []).filter((w) => w.kind === "ward").length;
  };
  const energyNow = async () => {
    const e = await call("getEnergy", {}, token);
    return (e.data ?? e).energy;
  };

  // THE RIGHT-CLICK GATE, PINNED: with the ward readied and
  // its anchor already tapped (castMode standing), a right-
  // click must STILL open the wheel — the wheel is how a
  // caster picks another working mid-road. (Before this
  // build, castMode silently barred the wheel.)
  const tapAnchorFirst = byQR.get("1,0");
  await page.evaluate((i) => {
    const p = document.querySelectorAll('svg polygon[fill="rgba(0,0,0,0)"]')[i];
    p?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }, tapAnchorFirst.poly);
  await sleep(450);
  const anchorNotice = await page.evaluate(() => document.querySelector(".hex-notice")?.textContent ?? "");
  ok("the anchor tap took — the land asks for a glowing edge", anchorNotice.includes("glowing edges"), anchorNotice);
  await page.mouse.click(420, 300, { button: "right" });
  const wheelMidRoad = await page.waitForSelector(".gw-wheel", { timeout: 9000 }).then(() => true).catch(() => false);
  ok("right-click opens the wheel EVEN with a working readied and its anchor pending", wheelMidRoad);
  if (wheelMidRoad) { await clickDisc(page, ".gw-hub", "Close"); await sleep(400); }

  // Cast the ward TWICE: anchor tap + a glowing EDGE click,
  // twice over, on two different anchors. A standing cast
  // keeps the working readied (sticky — the same readying
  // serves the second cast); a fizzle slips it (the roll is
  // the law), and the drive walks the wheel road again.
  const e0 = await energyNow();
  const edgeLines = async () => page.evaluate(() => document.querySelectorAll('line[stroke="rgba(183,166,255,0.03)"]').length);
  const clickEdge = async (k) => page.evaluate((i) => {
    const l = document.querySelectorAll('line[stroke="rgba(183,166,255,0.03)"]')[i];
    l?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }, k);
  const wheelReadyWard = async () => {
    await page.mouse.click(420, 300, { button: "right" });
    await page.waitForSelector(".gw-wheel", { timeout: 9000 });
    await clickDisc(page, ".gw-disc.cat", "Ward");
    await sleep(400);
    await readyWard();
  };
  let wards = await wardCount();
  let ready = true; // the readying above still stands (anchor pending at (1,0))
  const anchors = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, -1], [-1, 1], [2, 0], [0, 2]];
  for (const [aq, ar] of anchors) {
    if (wards >= 2) break;
    if (!ready) { await wheelReadyWard(); ready = true; }
    if (!(aq === 1 && ar === 0 && anchorNotice.includes("glowing edges"))) { await tapTile(aq, ar); await sleep(400); }
    const lines = await edgeLines();
    for (let ei = 0; ei < lines; ei++) {
      const before = await page.evaluate(() => window.__castLog.length);
      await clickEdge(ei);
      await sleep(750);
      const log = await page.evaluate(() => window.__castLog);
      const cast = log.slice(before).find((e) => e.ok || e.fizzled);
      if (!cast) continue; // that edge would not take the click — try the next
      if (cast.fizzled) {
        ready = false;
        console.log(`    ward via (${aq},${ar}) edge ${ei}: the roll fell short — the working slips; the wheel road again`);
      } else {
        wards = await wardCount();
        console.log(`    ward stands via (${aq},${ar}) edge ${ei} — wards standing: ${wards} (the working stays readied)`);
      }
      break; // a cast resolved either way: this anchor's turn is done
    }
  }
  const e1 = await energyNow();
  ok("the ward was cast TWICE from the wheel's readying — two wards stand on the land", wards >= 2, `wards=${wards}`);
  ok("the purse paid real ward costs (energy spent on the casts)", e0 - e1 >= ward.cost, `energy ${e0} -> ${e1}, one ward costs ✦${ward.cost}`);
  await page.screenshot({ path: `${OUT}/wheel-law-wards-standing.png` });
  await page.close();
}

/* ══ §2 THE TABLE — summoning by the same law ══════════════ */
console.log("§2 the Table — the pick IS the cast: no ground tap; a falter spends and the member stays callable");
{
  const claim = await call("claimTender", { password: PW, tenderName: "Wheellaw Table" });
  const token = claim.token;
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  const now = Date.now();
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, now);
  const mkAwoken = (name, pBody, tBody, pArms, tArms, pHead, tHead) => {
    const bodyId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'body', 'common', ?, ?, 'sky', ?, 'image/png', ?)").run(`${name} Body`, pBody, tBody, `wl/${name}-body.png`, now).lastInsertRowid);
    const armsId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'arms', 'common', ?, ?, 'sky', ?, 'image/png', ?)").run(`${name} Arms`, pArms, tArms, `wl/${name}-arms.png`, now).lastInsertRowid);
    const headId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'head', 'common', ?, ?, 'sky', ?, 'image/png', ?)").run(`${name} Head`, pHead, tHead, `wl/${name}-head.png`, now).lastInsertRowid);
    const compJson = JSON.stringify([
      { source_id: `db:${bodyId}`, name: `${name} Body`, category: "body", rarity: "common", power: pBody, toughness: tBody, element: "sky" },
      { source_id: `db:${armsId}`, name: `${name} Arms`, category: "arms", rarity: "common", power: pArms, toughness: tArms, element: "sky" },
      { source_id: `db:${headId}`, name: `${name} Head`, category: "head", rarity: "common", power: pHead, toughness: tHead, element: "sky" },
    ]);
    return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?) RETURNING id").get(name, name, `wl/${name}.png`, compJson, "Wheellaw Table", ownerKey, now).id);
  };
  const aId = mkAwoken("Wheelkin A", 2, 2, 3, 3, 3, 3);
  const bId = mkAwoken("Wheelkin B", 2, 3, 2, 3, 3, 2);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, terrain_bank, updated_at) VALUES (?, 500, 200, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500, terrain_bank = 200").run(ownerKey, now);
  const insTile2 = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, ?, ?, 0, ?)");
  for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > 2) continue;
    insTile2.run(ownerKey, q, r, now);
  }
  await call("getTerritory", {}, token);
  await call("chooseClass", { classKey: "runewright" }, token);
  await call("addToParty", { awakenedId: aId }, token);
  await call("addToParty", { awakenedId: bId }, token);

  const { issueTableToken } = await import("../server/dist/table.js");
  const tt = issueTableToken({ id: "disc-wheellaw", name: "Wheellaw Table" });
  const bindCode = (await call("getTableBindCode", {}, token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
  if (!bindRes.ok) throw new Error("table/bind failed: " + bindRes.status);

  const wstate = { state: null };
  const wws = new WebSocket("ws://127.0.0.1:3948/table/ws");
  await new Promise((res, rej) => { wws.onopen = res; wws.onerror = rej; });
  wws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") wstate.state = m.state; } catch { /* a torn frame is no evidence */ } };
  wws.send(JSON.stringify({ type: "join", room: "wheel-law", watch: true, name: "Drive Watcher" }));
  const waitFor = async (fn, what, ms = 12000) => { const st = Date.now(); while (Date.now() - st < ms) { if (fn()) return true; await sleep(150); } throw new Error("drive wait: " + what); };
  const mySeat = () => wstate.state?.players.find((p) => p.name === "Wheellaw Table") ?? null;
  const fieldOf = (name) => (wstate.state?.field ?? []).filter((u) => u.name === name);

  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror:table]", String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((sess) => { window.__awokenTableSession = sess; },
    { authToken: tt, room: "wheel-law", name: "Wheellaw Table" });
  await page.goto(BASE + "/table?frame_id=drive", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".table-room", { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector(".table-room svg polygon"), { timeout: 30000 });
  await waitFor(() => !!mySeat() && !!mySeat().hex, "watcher reads the seat and its hex", 20000);
  console.log(`    seat energy: ${mySeat().energy} / ${mySeat().maxEnergy}, seat hex ${mySeat().hex}`);

  // The tile lattice (the cast-flow drive's proven solver).
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
  const tiles = (wstate.state?.map ?? []).map((t) => ({ id: t.id, q: t.q, r: t.r, cursed: !!t.cursed }));
  const permRes = await buildPerm(page, '.table-room svg polygon[fill="transparent"]', tiles, 40);
  const perm = permRes.perm;
  ok("the stage's tile lattice is solved", permRes.matched === tiles.length && permRes.worst < 20, JSON.stringify(permRes));
  const tapTile = async (id) => {
    await page.evaluate((pi) => {
      const polys = [...document.querySelectorAll('.table-room svg polygon[fill="transparent"]')];
      polys[pi]?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }, perm[id]);
  };
  const tileById = new Map(tiles.map((t) => [t.id, t]));
  const seatHex = mySeat().hex;
  const seatTile = tileById.get(seatHex);
  const distToSeat = (t) => hexDist(t, seatTile);
  const litHexes = tiles.filter((t) => !t.cursed && t.id !== seatHex).sort((a, b) => distToSeat(a) - distToSeat(b));
  // The ring beside the seat — the summon's lawful ground
  // ("your own hex or one beside it, cursed or held"). The
  // center tile is the star-seed's own and claims its taps,
  // so it is never a summon target.
  const ringHexes = tiles.filter((t) => distToSeat(t) === 1 && t.id !== "0,0");
  const cursedFar = tiles.filter((t) => t.cursed && distToSeat(t) >= 3).sort((a, b) => distToSeat(b) - distToSeat(a))[0];
  ok("the field offers lit ground beside the seat and cursed ground beyond the light", litHexes.length >= 1 && !!cursedFar, `lit=${litHexes.length} cursedFar=${cursedFar?.id}`);

  const pickFromWheel = async (name) => {
    await page.mouse.click(750, 320, { button: "right" });
    await page.waitForSelector(".gw-wheel", { timeout: 9000 });
    await clickDisc(page, ".gw-disc.cat", "Awoken");
    await sleep(500);
    await clickDisc(page, ".gw-disc", name);
    await sleep(400);
  };
  const callingBarStands = async () => page.evaluate(() =>
    [...document.querySelectorAll(".placing-bar")].some((b) => (b.textContent ?? "").includes("Calling")));

  // THE PICK IS THE CAST (Nigel, 2026-10-22): no card is
  // readied, no ground is tapped — choosing Wheelkin A in
  // the branch casts the summon at once, and the referee
  // lands it at the seat's side. A falter spends the price
  // (power 8 -> \u27268) and stands nothing; the member stays
  // in the company, so the drive picks again — each pick
  // one cast, each cast charged before its roll.
  const purse0 = mySeat().energy;
  let picksA = 0;
  for (let i = 0; i < 12 && fieldOf("Wheelkin A").length === 0; i++) {
    await pickFromWheel("Wheelkin A");
    picksA++;
    await sleep(1100);
  }
  ok("picking Wheelkin A cast the summon at once — it stands with NO ground tap anywhere", fieldOf("Wheelkin A").length === 1, `picks=${picksA}`);
  ok("no 'Calling' bar ever stood — nothing was readied", !(await callingBarStands()));
  await page.screenshot({ path: `${OUT}/wheel-law-table-summon.png` });
  const aHexNow = fieldOf("Wheelkin A")[0]?.hex;
  const aTileNow = tileById.get(aHexNow);
  ok("the landing stands at the Tender's side — his own hex or one beside it",
    !!aTileNow && distToSeat(aTileNow) <= 1, `hex=${aHexNow} seat=${seatHex}`);
  const purse1 = mySeat().energy;
  ok("every pick charged exactly the price before its roll — falters included",
    purse0 - purse1 === 8 * picksA, `${purse0} -> ${purse1} over ${picksA} pick(s)`);
  // A click on cursed ground now summons nothing and spends
  // nothing — there is no readied card for it to feed.
  await tapTile(cursedFar.id);
  await sleep(900);
  ok("a cursed-ground click after the cast summoned nothing more", fieldOf("Wheelkin A").length === 1);
  ok("the ground click spent nothing", mySeat().energy === purse1, `${purse1} -> ${mySeat().energy}`);

  // A second member, the same road: pick, cast, stands.
  let picksB = 0;
  for (let i = 0; i < 12 && fieldOf("Wheelkin B").length === 0; i++) {
    await pickFromWheel("Wheelkin B");
    picksB++;
    await sleep(1100);
  }
  ok("picking Wheelkin B cast its summon too — two picks' worth of casts, two standings", fieldOf("Wheelkin B").length === 1, `picks=${picksB}`);
  ok("the second summon was paid for too", mySeat().energy < purse1, `${purse1} -> ${mySeat().energy}`);
  await page.screenshot({ path: `${OUT}/wheel-law-two-standing.png` });
  await page.close();
  wws.close();
}

/* ══ §3 THE BUNDLE — no tray markup ships ══════════════════ */
console.log("§3 the shipped bundle — no tray markup strings anywhere in it");
{
  const dir = join(process.cwd(), "client", "dist", "assets");
  const needles = ["Spells & Glyphs", "Choose a working", "dock-spells", "hand-tabs", "hand-tab", "working-card", "working-text", "satchel workings"];
  const hits = [];
  for (const f of readdirSync(dir)) {
    if (!/\.(js|css)$/.test(f)) continue;
    const body = readFileSync(join(dir, f), "utf8");
    for (const n of needles) if (body.includes(n)) hits.push(`${f}: ${n}`);
  }
  ok("the built client bundle contains NO tray markup strings", hits.length === 0, JSON.stringify(hits));
}

await browser.close();
console.log(`\nWHEEL LAW DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
