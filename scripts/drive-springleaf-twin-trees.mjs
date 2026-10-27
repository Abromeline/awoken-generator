// SPRINGLEAF — THE TWIN TREES STAND, THE REACH QUARTERS
// FRACTIONALLY (Nigel, 2026-10-27: "spring leaf is using
// the wrong sprite. i much prefer my twin tree sprigs
// with the srites" · "the range of spring leaf needs
// reduces to 25% all around and matched to tthe same
// perspective of the map" · scope: ALL grounds · reach:
// "Fractional reach — the Grove mends part-way into the
// next hexes").
//
// Boots the real server on a scratch DATA_DIR and proves,
// on all three grounds:
//   §A THE RECKONINGS, read directly: bindingRadiusFor
//      is quartered and fractional (Lv 1 → 0.5, Lv 3 →
//      0.75, Lv 10 → 1.5); a Binder's hand still doubles
//      the fraction (0.75 → 1.5).
//   §B THE HOMELAND MEND, BY API: a Lv 3 Warden's grove
//      stands with radiusHexes 0.75; standers whose
//      standing POINTS lie 0.5 and exactly 0.75 hexes
//      from her anchor are mended by the settle, a
//      stander a full hex away is NOT (before this build
//      her radius was 3 whole hexes and the full-hex
//      neighbour stood well inside it); then, the mother
//      faded, a rooted sapling's half-glow (0.375) mends
//      a stander 0.3 hexes out and not one 0.6 out.
//   §C THE HOMELAND FACE, in a real browser: the Twin
//      Trees image STANDS in the depth pass for the
//      mother AND a rooted sapling (not inside the
//      workings layer that draws the glow); the drawn
//      ring is an ellipse squashed to the map's angle
//      (ry/rx ≈ 0.55) whose radius is the quartered
//      truth (size × 0.75 × 1.45). Screenshot.
//   §D THE TABLE, by its socket: a Warden's grove
//      radiusPx is the standing formula quartered —
//      (66 + 12 × level) × 2.75 × (69/80) × 0.25 — and a
//      rooted sapling's radiusPx is exactly half.
//   §E THE TABLE FACE, in a real browser: the Twin Trees
//      stand among the figures, the glow is a squashed
//      ellipse, and no flat centred trees image remains
//      in the grove's ground group. Screenshot.
//   §F THE CAMPAIGN BOARD: a campaign room (storyteller
//      lays held ground, a grove is planted by the real
//      cast) renders the grove in the scene as the
//      standing Twin Trees form — __campaignBoard.info()
//      reads "twin-trees" off the scene itself, never the
//      generic gem — with her ring lying in the scene,
//      for the mother and for a rooted sapling.
//      Screenshot.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-springleaf-twin-trees.mjs
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import Database from "better-sqlite3";
import { WebSocket } from "ws";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-springleaf-"));
process.env.PORT = "39955";
process.env[["WORKSHOP", "PASSWORD"].join("_")] = ["springleaf", "drive", "password"].join("-");
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39955";
const SHOTS = "/home/hatch/workspace/springleaf-proof";
mkdirSync(SHOTS, { recursive: true });
const PW = "springleaf-drive-password";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const realNow = () => Date.now();

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

await import("../server/dist/index.js");
await sleep(2500);

async function callRaw(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
async function call(action, args, token) {
  const { status, data } = await callRaw(action, args, token);
  if (status >= 300) throw new Error(`${action} -> ${status}: ${JSON.stringify(data)}`);
  return data;
}
const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }

const setEnergy = (ownerKey, n) => db.prepare("INSERT INTO tender_resources (owner_key, energy, terrain_bank, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = excluded.energy").run(ownerKey, n, Date.now());
function seedTile(ownerKey, q, r, element = "root", cursed = 0) {
  return Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(ownerKey, q, r, element, cursed, Date.now()).lastInsertRowid);
}
function seedAwokin(ownerKey, tenderName, name, partPower, partToughness, element = "root") {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)").run(`${name} ${cat}`, cat, partPower, partToughness, element, `springleaf/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: partPower, toughness: partToughness, element });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)").run(name, name, `springleaf/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
function placeAwokin(ownerKey, awakenedId, tileId, hp) {
  const info = db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max)
    VALUES (?, ?, ?, ?, ?, 'defense', 0, ?, NULL, NULL, NULL, NULL)`).run(ownerKey, awakenedId, tileId, Date.now(), Date.now(), hp);
  return Number(info.lastInsertRowid);
}
const setPos = (pid, q, r) => db.prepare("UPDATE field_placements SET pos_q = ?, pos_r = ? WHERE id = ?").run(q, r, pid);
const hpOf = (pid) => db.prepare("SELECT hp FROM field_placements WHERE id = ?").get(pid)?.hp;
/** A tender with her choosing done (three wakes seeded
 *  first — the intro door's order), then her experience
 *  set to the mark the section wants. */
async function claim(name, classKey, expAfter) {
  const c = await call("claimTender", { password: PW, tenderName: name });
  const id = db.prepare("SELECT id FROM tenders WHERE code = ?").get(c.tender.code).id;
  const ownerKey = `tender:${id}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 3, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, Date.now());
  setEnergy(ownerKey, 500);
  for (const w of ["Wake One", "Wake Two", "Wake Three"]) seedAwokin(ownerKey, name, `${name} ${w}`, 2, 2, "sky");
  await call("chooseClass", { classKey }, c.token);
  if (expAfter !== 3800) db.prepare("UPDATE tender_progress SET total_exp = ? WHERE owner_key = ?").run(expAfter, ownerKey);
  return { token: c.token, ownerKey, name };
}
async function castOutcome(token, body, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const r = await callRaw("castMapWorking", body, token);
    if (r.status === 400) return { refused: r.data };
    if (r.status === 200 && r.data && !r.data.fizzled) return { stood: r.data };
  }
  return {};
}

/* ── §A THE RECKONINGS, READ DIRECTLY ─────────────────── */
console.log("§A the reckonings — the quartered, fractional radius");
{
  const A = await import("../server/dist/actions.js");
  const S = await import("../server/dist/skills.js");
  ok("bindingRadiusFor quarters fractionally (Lv 1 → 0.5, Lv 3 → 0.75, Lv 6 → 1, Lv 10 → 1.5)",
    A.bindingRadiusFor(1) === 0.5 && A.bindingRadiusFor(3) === 0.75 && A.bindingRadiusFor(6) === 1 && A.bindingRadiusFor(10) === 1.5,
    `1→${A.bindingRadiusFor(1)} 3→${A.bindingRadiusFor(3)} 6→${A.bindingRadiusFor(6)} 10→${A.bindingRadiusFor(10)}`);
  ok("a Binder's hand doubles the fraction (0.75 → 1.5); every other hand keeps it",
    S.bindingHealRangeFor("binder", 0.75) === 1.5 && S.bindingHealRangeFor("warden", 0.75) === 0.75);
}

/* ── §B THE HOMELAND MEND, BY API ─────────────────────── */
console.log("§B the homeland mend — reckoned by the standing point, at the quartered radius");
{
  const T = await claim("Grove Mend Warden", "warden", 200); // Lv 3
  const ids = {};
  for (let q = 0; q <= 3; q++) ids[q] = seedTile(T.ownerKey, q, 0, "root");
  const plant = await castOutcome(T.token, { spellKey: "springleaf", tileId: ids[0] });
  ok("the Lv 3 Warden's grove stands with radiusHexes 0.75 (was 3 whole hexes before the quartering)",
    plant.stood?.radiusHexes === 0.75, JSON.stringify(plant.stood ?? plant.refused));
  const groveRow = () => db.prepare("SELECT * FROM territory_workings WHERE owner_key = ? AND engine = 'springleaf'").get(T.ownerKey);
  // Three standers, placed AFTER the raising burst so only
  // the settle's mend can touch them: their POINTS stand
  // 0.5, exactly 0.75 and a full 1.0 hexes from the grove's
  // anchor (the mother tile's heart, (0,0)).
  const mk = (label, tileId, pq, pr) => {
    const aw = seedAwokin(T.ownerKey, T.name, label, 1, 10);
    const pid = placeAwokin(T.ownerKey, aw, tileId, 10);
    setPos(pid, pq, pr);
    return pid;
  };
  const pIn = mk("Mend Inside", ids[0], 0.5, 0);
  const pEdge = mk("Mend Boundary", ids[1], 0.75, 0);
  const pOut = mk("Mend Outside", ids[1], 1.0, 0);
  const g1 = groveRow();
  const nums1 = JSON.parse(g1.nums);
  nums1.saplings = []; // the mother alone speaks in this round
  nums1.lastMendAt = Date.now() - (2800 * 3 + 1400); // three breaths owed
  db.prepare("UPDATE territory_workings SET nums = ? WHERE id = ?").run(JSON.stringify(nums1), g1.id);
  await call("getTerritory", {}, T.token);
  ok("the stander 0.5 hexes out is mended (+3 over three breaths)", hpOf(pIn) === 13, `hp=${hpOf(pIn)}`);
  ok("the stander exactly at the quartered edge (0.75) is mended", hpOf(pEdge) === 13, `hp=${hpOf(pEdge)}`);
  ok("the stander a full hex away is NOT mended (radius 3 reached him before this build)", hpOf(pOut) === 10, `hp=${hpOf(pOut)}`);

  // Round two: the mother faded; a rooted sapling's
  // half-glow (0.75 / 2 = 0.375) is the only zone left.
  const pSapIn = mk("Sapling Inside", ids[1], 1.3, 0);   // 0.3 from the sapling's heart (1,0)
  const pSapOut = mk("Sapling Outside", ids[2], 1.6, 0); // 0.6 from the sapling's heart
  const g2 = groveRow();
  const nums2 = JSON.parse(g2.nums);
  nums2.motherExpiresAt = Date.now() - 1000;
  nums2.saplings = [{ tileId: ids[1], dueAt: Date.now() - 1000, expiresAt: Date.now() + 20000, rooted: true }];
  nums2.lastMendAt = Date.now() - (2800 + 1400); // one breath owed
  db.prepare("UPDATE territory_workings SET nums = ? WHERE id = ?").run(JSON.stringify(nums2), g2.id);
  await call("getTerritory", {}, T.token);
  ok("the sapling's fractional half-glow (0.375) mends the stander 0.3 hexes out (+1)", hpOf(pSapIn) === 11, `hp=${hpOf(pSapIn)}`);
  ok("…and not the stander 0.6 hexes out (hp untouched)", hpOf(pSapOut) === 10, `hp=${hpOf(pSapOut)}`);
}

/* ── §C THE HOMELAND FACE, IN A REAL BROWSER ──────────── */
console.log("§C the homeland face — the Twin Trees standing in the depth pass, the ring at the map's angle");
{
  const claimC = await call("claimTender", { password: PW, tenderName: "Grove Face Tender" });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claimC.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  const nowC = Date.now();
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 3, 'warden', NULL, 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', total_exp = 3800, hp = 100")
    .run(ownerKey, nowC);
  setEnergy(ownerKey, 900);
  await call("ensureFirstSeed", {}, claimC.token);
  db.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(Date.now(), ownerKey);
  const land = await call("getTerritory", {}, claimC.token);
  const seedTileId = db.prepare("SELECT tile_id AS id FROM star_seeds WHERE owner_key = ?").get(ownerKey).id;
  const seedTile = land.tiles.find((t) => t.id === seedTileId);
  const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
  const neighbours = land.tiles.filter((t) => t.id !== seedTileId && hexDist(t, seedTile) === 1);
  const sapTile = neighbours[0];
  const figTile = neighbours.reduce((best, t) => ((470 * t.q + 948 * t.r) > (470 * best.q + 948 * best.r) ? t : best), neighbours[0]);
  ok("§C the seeded land holds the grove's tile and a neighbour for the sapling", !!seedTile && !!sapTile && !!figTile);
  // The grove standing on the land (the drive's own fixture
  // row, in the planted cast's exact shape — §B proved the
  // real cast; here the row is lent two minutes so the
  // photograph is not raced against the mother's 34 s).
  const numsC = {
    radiusHexes: 0.75, healPerBreath: 1,
    motherExpiresAt: nowC + 120000, lastMendAt: nowC,
    saplings: [{ tileId: sapTile.id, dueAt: nowC - 1000, expiresAt: nowC + 120000, rooted: true }],
  };
  db.prepare(`INSERT INTO territory_workings (owner_key, spell_key, engine, kind, hue, tile_id, edge_key, q, r, dir, nums, hp, stops, charges, pour, max_hp, created_at)
    VALUES (?, 'springleaf', 'springleaf', 'binding', 'root', ?, NULL, ?, ?, NULL, ?, 0, 0, 0, 0, 0, ?)`)
    .run(ownerKey, seedTileId, seedTile.q, seedTile.r, JSON.stringify(numsC), nowC);
  // (No fixture figure is seeded for the photograph: a
  // fixture Awoken's art blob does not exist on this
  // scratch land, and its broken portrait would sit in
  // the frame. The depth sort is proven by the DOM
  // assertions below and by the Table's photograph,
  // where the trees stand against real figures.)

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, claimC.token);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2500);
  const doorBtn = await page.$(".deck-button");
  if (doorBtn) await doorBtn.click();
  await page.waitForSelector(".territory-svg", { timeout: 30000 }).catch(() => {});
  await sleep(800);
  for (let i = 0; i < 12; i++) {
    const acted = await page.evaluate(() => {
      let hit = false;
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Skip");
      if (b) { b.click(); hit = true; }
      const cer = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Tend on");
      if (cer) { cer.click(); hit = true; }
      const mg = document.querySelector(".margin-guide-dismiss");
      if (mg) { mg.click(); hit = true; }
      return hit;
    }).catch(() => false);
    await sleep(700);
    if (!acted) break;
  }
  await page.mouse.move(700, 475);
  await page.mouse.wheel({ deltaY: -900 });
  await sleep(500);
  await page.mouse.wheel({ deltaY: -900 });
  await sleep(900);
  const face = await page.evaluate(() => {
    const svg = document.querySelector(".territory-svg");
    if (!svg) return { svg: false };
    const trees = [...svg.querySelectorAll("image.grove-tree")];
    const mother = trees.find((i) => i.getAttribute("data-grove-tree") === "mother") ?? null;
    const sapling = trees.find((i) => i.getAttribute("data-grove-tree") === "sapling") ?? null;
    const ring = svg.querySelector('ellipse.grove-ring[data-grove-ring="mother"]');
    const sapRing = svg.querySelector('ellipse.grove-ring[data-grove-ring="sapling"]');
    const polys = [...svg.querySelectorAll("polygon")]
      .map((p) => (p.getAttribute("points") ?? "").trim().split(/\s+/).map((s) => s.split(",").map(Number)))
      .filter((pts) => pts.length === 6 && pts.every((pt) => pt.length === 2 && pt.every(Number.isFinite)));
    // The land's size, read off the grove's OWN hex (the
    // polygon whose heart is the ring's heart) — the first
    // polygon on the page need not be a tile at all. The
    // painted face is drawn at 1.14× its cell (Territory's
    // face scale), so the face's measure is divided back
    // to the cell measure the workings layer reads by.
    const rcx = ring ? Number(ring.getAttribute("cx")) : 0, rcy = ring ? Number(ring.getAttribute("cy")) : 0;
    let size = 0, bestD = Infinity;
    for (const pts of polys) {
      const cxp = pts.reduce((a, p) => a + p[0], 0) / 6, cyp = pts.reduce((a, p) => a + p[1], 0) / 6;
      const d = Math.hypot(cxp - rcx, cyp - rcy);
      if (d < bestD) { bestD = d; size = (Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]))) * (796 / 944) / 1.14; }
    }
    const ringG = ring ? ring.closest("g") : null;
    const workingsG = ringG ? ringG.parentElement : null;
    return {
      svg: true,
      mother: mother ? { href: mother.getAttribute("href") ?? "", w: Number(mother.getAttribute("width")), h: Number(mother.getAttribute("height")) } : null,
      sapling: sapling ? { href: sapling.getAttribute("href") ?? "" } : null,
      ring: ring ? { rx: Number(ring.getAttribute("rx")), ry: Number(ring.getAttribute("ry")) } : null,
      sapRing: sapRing ? { rx: Number(sapRing.getAttribute("rx")), ry: Number(sapRing.getAttribute("ry")) } : null,
      size,
      flatImagesInGlowGroup: ringG ? ringG.querySelectorAll("image").length : -1,
      treeOutsideWorkings: !!(mother && workingsG && !workingsG.contains(mother)),
      ringPrecedesTree: !!(mother && ring && (mother.compareDocumentPosition(ring) & Node.DOCUMENT_POSITION_PRECEDING) !== 0),
    };
  });
  ok("§C the mother's Twin Trees STAND on the homeland (the trees art, in the depth pass — outside the workings layer)",
    !!face.mother && face.mother.href.includes("trees") && face.treeOutsideWorkings && face.ringPrecedesTree,
    JSON.stringify(face).slice(0, 300));
  ok("§C a rooted sapling's Twin Trees stand too", !!face.sapling && face.sapling.href.includes("trees"), JSON.stringify(face.sapling));
  ok("§C no flat glyph image remains in the grove's glow group", face.flatImagesInGlowGroup === 0, `images=${face.flatImagesInGlowGroup}`);
  ok("§C the mother's ring is an ellipse at the map's angle (ry/rx ≈ 0.55) with the quartered radius (size × 0.75 × 1.45)",
    !!face.ring && Math.abs(face.ring.ry / face.ring.rx - 0.55) < 0.02 && Math.abs(face.ring.rx - face.size * 0.75 * 1.45) < 2.5,
    JSON.stringify({ ring: face.ring, size: face.size }));
  ok("§C the sapling's ring is half the mother's, squashed the same", !!face.sapRing && Math.abs(face.sapRing.rx - face.ring.rx / 2) < 1 && Math.abs(face.sapRing.ry / face.sapRing.rx - 0.55) < 0.02,
    JSON.stringify(face.sapRing));
  // The photograph is taken with the land dragged so the
  // grove stands clear of the waking ceremony's cards,
  // which anchor the screen's centre whatever the land
  // does (they covered her in this drive's first frames).
  await page.mouse.move(300, 700);
  await page.mouse.down();
  await page.mouse.move(550, 500, { steps: 12 });
  await page.mouse.up();
  await sleep(900);
  await page.screenshot({ path: join(SHOTS, "homeland-grove.png") }).catch(() => {});
  await browser.close();
}

/* ── Table harness (for §D, §E, §F) ───────────────────── */
const { issueTableToken } = await import("../server/dist/table.js");
async function seedBoundTender({ tenderName, tag, classKey }) {
  const claimRes = await call("claimTender", { password: PW, tenderName });
  const token = claimRes.token;
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claimRes.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 3, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, Date.now());
  setEnergy(ownerKey, 500);
  // A full roster, not three kin: a Table seat's purse IS
  // its roster's measure (calculateMaxEnergy) — three kin
  // leave a seat holding single digits, and the drive's
  // casts and summons would race an empty purse. (The
  // Binder's-gifts harness seeds the same forty.)
  const kinIds = ["Wake One", "Wake Two", "Wake Three"].map((w) => seedAwokin(ownerKey, tenderName, `${tenderName} ${w}`, 2, 2, "sky"));
  for (let i = 0; i < 40; i++) seedAwokin(ownerKey, tenderName, `${tenderName} Roster ${i + 1}`, 2, 2, "sky");
  await call("chooseClass", { classKey }, token);
  const tt = issueTableToken({ id: `disc-${tag}`, name: tenderName });
  const code = (await call("getTableBindCode", {}, token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code }) });
  if (!bindRes.ok) throw new Error(`table/bind -> ${bindRes.status}`);
  return { token, tt, ownerKey, name: tenderName, kinIds };
}
function client(label) {
  const ws = new WebSocket(`ws://127.0.0.1:39955/table/ws`);
  const c = { label, ws, state: null, you: null, errors: [] };
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "state") { c.state = m.state; c.you = m.you; }
    if (m.type === "error" || m.type === "joinError") c.errors.push(m.message);
  });
  c.send = (msg) => ws.send(JSON.stringify(msg));
  c.join = (join) => new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error(`${label}: join timeout`)), 10000);
    ws.on("open", () => {
      c.send({ type: "join", ...join });
      const iv = setInterval(() => { if (c.state) { clearInterval(iv); clearTimeout(to); resolve(); } }, 100);
    });
  });
  c.waitFor = async (fn, what, timeout = 30000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (c.state && fn(c)) return true;
      await sleep(150);
    }
    throw new Error(`${label}: timed out waiting for ${what}; errors: ${c.errors.slice(-2).join(" | ")}`);
  };
  return c;
}
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const neighboursOf = (id) => { const [q, r] = id.split(",").map(Number); return DIRS.map(([dq, dr]) => `${q + dq},${r + dr}`); };
const axDist = (a, b) => { const [aq, ar] = a.split(",").map(Number); const [bq, br] = b.split(",").map(Number); return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(aq + ar - bq - br)); };
async function castTableUntil(c, msg, find, what, tries = 18) {
  for (let i = 0; i < tries; i++) {
    c.send(msg);
    try { await c.waitFor(cc => !!find(cc), what, 3000); return find(c); }
    catch { /* a fizzle — cast again */ }
  }
  throw new Error(`${c.label}: ${what} never stood; errors: ${c.errors.slice(-3).join(" | ")}; you: ${JSON.stringify({ energy: c.you?.energy, fallen: c.you?.fallen, tenderLevel: c.you?.tenderLevel })}`);
}

/* ── §D THE TABLE, BY ITS SOCKET ──────────────────────── */
console.log("§D the Table — the continuous radius quartered, the sapling's half of it");
const tableT = await seedBoundTender({ tenderName: "Table Grove Warden", tag: "SLW", classKey: "warden" });
const tc = client("SLW");
await tc.join({ authToken: tableT.tt, room: "springleaf-table-room" });
await tc.waitFor(cc => !!cc.you?.landing, "the landing");
let tableGrove = null;
{
  const landing = tc.you.landing;
  const L = tc.you.tenderLevel;
  // The grove is planted FIRST, on the seat's full purse
  // (the battle's economy spends a seat to nothing — a
  // Hollow's whole trade — and the cast must not race
  // it). Her lent 34 s run on the battle's clock, which
  // has not started: unticked, she stands while the
  // battle is joined under her.
  const hexB = neighboursOf(landing).find(h => (tc.state?.map ?? []).find(t => t.id === h)?.cursed === false) ?? neighboursOf(landing)[0];
  tableGrove = await castTableUntil(tc,
    { type: "castWard", root: "springleaf", hexA: landing, hexB },
    cc => cc.state.workings.find(x => x.kind === "grove" && x.ownerKey === cc.you.key && x.mother),
    "the grove stands");
  const expected = (66 + 12 * L) * 2.75 * (69 / 80) * 0.25;
  ok(`§D the Table grove's radiusPx is the standing formula QUARTERED (Lv ${L}: ${expected.toFixed(3)} px)`,
    near(tableGrove.radiusPx, expected, 1e-6), `radiusPx=${tableGrove.radiusPx} expected=${expected}`);
  // Now the battle is joined under her, by the room's own
  // road (a summoned kin strikes the curse — the road
  // drive-table-lighting-face proved), and her clock —
  // sapling rootings included — starts to run.
  await call("addToParty", { awakenedId: tableT.kinIds[0] }, tableT.token);
  let unit = null;
  const u0 = Date.now();
  while (Date.now() - u0 < 20000 && !unit) {
    tc.send({ type: "summonCast", awakenedId: tableT.kinIds[0] });
    const w0 = Date.now();
    while (Date.now() - w0 < 2500 && !unit) {
      unit = (tc.state?.field ?? []).find(u => u.awokenId === tableT.kinIds[0]) ?? null;
      if (!unit) await sleep(200);
    }
  }
  ok("§D the party kin stands on the casual field", !!unit, JSON.stringify(tc.errors.slice(-2)));
  tc.send({ type: "setStance", cardId: unit.cardId, stance: "binding" });
  const strikeTarget = (tc.state?.map ?? []).find(t => t.cursed && t.id !== "0,0" && axDist(t.id, unit.hex) <= 4);
  ok("§D a cursed tile stands in the kin's reach", !!strikeTarget);
  tc.send({ type: "strikeCurse", cardId: unit.cardId, hex: unit.hex, target: strikeTarget.id });
  await tc.waitFor(cc => cc.state?.battle?.active === true, "the battle joined", 25000);
  ok("§D the battle is joined — the grove's clock runs", true);
  let sapling = null;
  const s0 = Date.now();
  while (Date.now() - s0 < 30000 && !sapling) {
    sapling = (tc.state?.workings ?? []).find(x => x.kind === "grove" && x.ownerKey === tc.you.key && x.mother === false) ?? null;
    if (!sapling) await sleep(250);
  }
  ok("§D a sapling roots beside her, its radiusPx exactly half the mother's quartered span",
    !!sapling && near(sapling.radiusPx, tableGrove.radiusPx / 2, 1e-9),
    `sapling=${sapling?.radiusPx} mother=${tableGrove.radiusPx}`);
}

/* ── §E THE TABLE FACE, IN A REAL BROWSER ─────────────── */
console.log("§E the Table face — the Twin Trees among the figures, the glow squashed to the map's angle");
{
  const witness = await seedBoundTender({ tenderName: "Table Grove Witness", tag: "SLV", classKey: "warden" });
  // The face gets its own quiet room and a fresh caster
  // on a full purse: no battle ticks there, so the grove
  // stands unticked while the witness's page is raised
  // (the §D room's battle economy is no photograph's
  // friend).
  const faceT = await seedBoundTender({ tenderName: "Table Grove Planter", tag: "SLF", classKey: "warden" });
  const fc = client("SLF");
  await fc.join({ authToken: faceT.tt, room: "springleaf-table-face" });
  await fc.waitFor(cc => !!cc.you?.landing, "the planter's landing");
  const fLanding = fc.you.landing;
  const fHexB = neighboursOf(fLanding).find(h => (fc.state?.map ?? []).find(t => t.id === h)?.cursed === false) ?? neighboursOf(fLanding)[0];
  await castTableUntil(fc,
    { type: "castWard", root: "springleaf", hexA: fLanding, hexB: fHexB },
    cc => cc.state.workings.find(x => x.kind === "grove" && x.ownerKey === cc.you.key && x.mother),
    "the face grove stands");
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror:table]", String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((sess) => { window.__awokenTableSession = sess; }, { authToken: witness.tt, room: "springleaf-table-face", name: witness.name });
  await page.goto(BASE + "/table?frame_id=springleaf-table", { waitUntil: "domcontentloaded", timeout: 60000 });
  let roomStands = true;
  try { await page.waitForSelector(".table-room", { timeout: 30000 }); } catch { roomStands = false; }
  ok("§E the casual room stands for the witness's seat", roomStands);
  await sleep(1800);
  const face = await page.evaluate(() => {
    const tree = document.querySelector('image.grove-tree[data-grove-tree="mother"]');
    const ring = document.querySelector('ellipse.grove-ring[data-grove-ring="mother"]');
    return {
      tree: tree ? { href: tree.getAttribute("href") ?? "" } : null,
      ring: ring ? { rx: Number(ring.getAttribute("rx")), ry: Number(ring.getAttribute("ry")) } : null,
      flatInGlow: document.querySelectorAll("g.grove-glow image").length,
      ringPrecedesTree: !!(tree && ring && (tree.compareDocumentPosition(ring) & Node.DOCUMENT_POSITION_PRECEDING) !== 0),
    };
  });
  ok("§E the mother's Twin Trees STAND at the Table (in the figures pass, after the workings layer)",
    !!face.tree && face.tree.href.includes("trees") && face.ringPrecedesTree, JSON.stringify(face).slice(0, 240));
  ok("§E the Table's grove ring is an ellipse at the map's angle (ry/rx ≈ 0.55)",
    !!face.ring && Math.abs(face.ring.ry / face.ring.rx - 0.55) < 0.02, JSON.stringify(face.ring));
  ok("§E no flat centred trees image remains in the grove's ground group", face.flatInGlow === 0, `images=${face.flatInGlow}`);
  await page.screenshot({ path: join(SHOTS, "table-grove.png") }).catch(() => {});
  await browser.close();
  fc.ws.close();
}

/* ── §F THE CAMPAIGN BOARD ────────────────────────────── */
console.log("§F the campaign board — the grove stands as the Twin Trees in the 3D scene");
{
  const S = await seedBoundTender({ tenderName: "Campaign Grove Storytender", tag: "SLC", classKey: "warden" });
  // A watcher holds the room open for the whole section:
  // a room whose last seat leaves is torn down, and the
  // campaign's rest does not carry transient workings —
  // the grove would vanish between the two photographs.
  const wstate = { state: null };
  const wws = new WebSocket(`ws://127.0.0.1:39955/table/ws`);
  await new Promise((resolve) => {
    wws.onopen = () => { wws.send(JSON.stringify({ type: "join", room: "campaign-springleaf", watch: true, name: "Grove Watcher" })); resolve(); };
    wws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); if (m.type === "state") wstate.state = m.state; } catch { /* torn frame */ } };
  });
  const sc = client("SLC");
  await sc.join({ authToken: S.tt, room: "campaign-springleaf" });
  await sc.waitFor(cc => !!cc.you?.key, "the seat");
  sc.send({ type: "claimStoryteller" });
  await sc.waitFor(cc => (cc.state.players ?? []).some(p => p.key === cc.you.key && p.storytender), "the storyteller's seat claimed");
  const myHex = sc.you.landing ?? (sc.state.players ?? []).find(p => p.key === sc.you.key)?.hex;
  const hexB = neighboursOf(myHex)[0];
  for (const hex of [myHex, hexB]) sc.send({ type: "stTile", hex, ground: "mud" });
  await sc.waitFor(cc => [myHex, hexB].every(h => (cc.state.map ?? []).find(t => t.id === h)?.cursed === false), "held ground laid under the grove");
  // The planting rides the socket; the photograph rides
  // the browser — and a seat holds ONE connection (the
  // newest join displaces the older socket, probed and
  // proven in this drive's making), so the order is:
  // plant by socket, photograph by browser, then rejoin
  // by socket to start her clock. With no battle yet her
  // lent 34 s are unticked — she stands while framed.
  const grove = await castTableUntil(sc,
    { type: "castWard", root: "springleaf", hexA: myHex, hexB },
    cc => cc.state.workings.find(x => x.kind === "grove" && x.ownerKey === cc.you.key && x.mother),
    "the campaign grove stands");
  ok("§F the grove is planted in the campaign room by the real cast", !!grove?.id, JSON.stringify(sc.errors.slice(-2)));
  if (typeof sc.you.tenderLevel === "number") {
    const expected = (66 + 12 * sc.you.tenderLevel) * 2.75 * (69 / 80) * 0.25;
    ok("§F her radiusPx is the same quartered formula (one system, every ground)", near(grove.radiusPx, expected, 1e-6), `radiusPx=${grove.radiusPx} expected=${expected}`);
  }
  const openBoard = async (browser, frame) => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => console.log("[pageerror:campaign]", String(e).slice(0, 200)));
    await page.evaluateOnNewDocument((sess) => { window.__awokenTableSession = sess; }, { authToken: S.tt, room: "campaign-springleaf", name: S.name });
    await page.goto(BASE + `/table?frame_id=${frame}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".campaign-board canvas", { timeout: 45000 });
    await page.waitForFunction(() => window.__campaignBoard && window.__campaignBoard.info().ready, { timeout: 45000 });
    await page.evaluate(() => window.__campaignBoard.zoomBy(0.55));
    return page;
  };
  const browser = await puppeteer.launch({ headless: true, protocolTimeout: 180000, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--enable-unsafe-swiftshader"] });
  const page = await openBoard(browser, "springleaf-campaign");
  let info = null;
  const i0 = Date.now();
  while (Date.now() - i0 < 20000) {
    info = await page.evaluate(() => window.__campaignBoard.info()).catch(() => null);
    if (info?.workingForms?.[grove.id] === "twin-trees") break;
    await sleep(600);
  }
  ok("§F the board's scene holds the grove as the TWIN TREES form — not the generic gem",
    info?.workingForms?.[grove.id] === "twin-trees", JSON.stringify(info?.workingForms));
  ok("§F her ring lies in the scene (the stage circle in the board's own projection)",
    (info?.groveRings ?? []).includes(grove.id), JSON.stringify(info?.groveRings));
  await page.screenshot({ path: join(SHOTS, "campaign-grove-storytender.png") }).catch(() => {});
  await browser.close();
  sc.ws.close();
  // Her clock starts now — on its first ticks her due
  // saplings root, living 20 s from the rooting.
  // A defender must stand before any foe is set: an
  // undefended campaign's bastion falls the moment the
  // dark takes the field, and the campaign ends with
  // every working on it (the tale's own words, learned
  // in this drive's making). The Storytender holds no
  // company — "she deals the dark, not the light" — so
  // a second tender fields the defender. And the
  // photograph rides the FIGHTER's board, raised BEFORE
  // the foe is set: the storyteller's socket stays
  // alive to set the foe (a seat holds one connection),
  // and the sapling's 20 s are spent in full view of a
  // board already standing, not raced against its
  // raising.
  const F2 = await seedBoundTender({ tenderName: "Campaign Grove Fighter", tag: "SLD", classKey: "warden" });
  await call("addToParty", { awakenedId: F2.kinIds[0] }, F2.token);
  const fc2 = client("SLD");
  await fc2.join({ authToken: F2.tt, room: "campaign-springleaf" });
  await fc2.waitFor(cc => !!cc.you?.key, "the fighter's seat");
  let kinUnit = null;
  const k0 = Date.now();
  while (Date.now() - k0 < 20000 && !kinUnit) {
    fc2.send({ type: "summonCast", awakenedId: F2.kinIds[0] });
    const w0 = Date.now();
    while (Date.now() - w0 < 2500 && !kinUnit) {
      kinUnit = (fc2.state?.field ?? []).find(u => u.awokenId === F2.kinIds[0]) ?? null;
      if (!kinUnit) await sleep(200);
    }
  }
  ok("§F a defender stands on the campaign map", !!kinUnit, JSON.stringify(fc2.errors.slice(-2)));
  const browser2 = await puppeteer.launch({ headless: true, protocolTimeout: 180000, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--enable-unsafe-swiftshader"] });
  const page2 = await (async () => {
    const page = await browser2.newPage();
    await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => console.log("[pageerror:campaign]", String(e).slice(0, 200)));
    await page.evaluateOnNewDocument((sess) => { window.__awokenTableSession = sess; }, { authToken: F2.tt, room: "campaign-springleaf", name: F2.name });
    await page.goto(BASE + "/table?frame_id=springleaf-campaign-saplings", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".campaign-board canvas", { timeout: 45000 });
    await page.waitForFunction(() => window.__campaignBoard && window.__campaignBoard.info().ready, { timeout: 45000 });
    await page.evaluate(() => window.__campaignBoard.zoomBy(1.75));
    await page.evaluate(() => window.__campaignBoard.zoomBy(1.6));
    return page;
  })();
  // The keeper photograph of the mother on this ground:
  // the fighter's board, close, while she still stands
  // unticked (the storyteller's own page wears her
  // console over the board — that frame is kept too, as
  // campaign-grove-storytender.png). The frame waits
  // until THIS board's scene holds her as the trees —
  // her art loads async, and a photograph taken before
  // it lands catches the placeholder gem (seen in this
  // drive's earlier frames).
  await page2.waitForFunction(() => Object.values(window.__campaignBoard.info().workingForms).includes("twin-trees"), { timeout: 25000 }).catch(() => {});
  // The camera centres on the seed; the grove stands at
  // the storyteller's landing, hexes away — so the frame
  // is CLIPPED around her own projected hex (the board's
  // projectHex), which puts her at its centre however
  // the wide shot falls.
  const gpt = await page2.evaluate((hex) => window.__campaignBoard.projectHex(hex), grove.hex).catch(() => null);
  await sleep(400);
  if (gpt) {
    const clip = { x: Math.max(0, Math.min(1400 - 760, gpt.x - 380)), y: Math.max(0, Math.min(950 - 560, gpt.y - 300)), width: 760, height: 560 };
    await page2.screenshot({ path: join(SHOTS, "campaign-grove.png"), clip }).catch(() => {});
  } else {
    await page2.screenshot({ path: join(SHOTS, "campaign-grove.png") }).catch(() => {});
  }
  const sc2 = client("SLC2");
  await sc2.join({ authToken: S.tt, room: "campaign-springleaf" });
  await sc2.waitFor(cc => !!cc.you?.key, "the seat rejoined");
  // The board keeps its own log of the scene's forms,
  // polled inside the page: the saplings' window between
  // rooting and the battle's turn can be seconds wide,
  // and puppeteer round-trips are too slow to swear
  // they overlapped it.
  const installLog = () => page2.evaluate(() => {
    const w = window;
    w.__formsLog = [];
    if (w.__formsTimer) clearInterval(w.__formsTimer);
    w.__formsTimer = setInterval(() => {
      try { w.__formsLog.push({ ...window.__campaignBoard.info().workingForms }); } catch { /* the board is still raising */ }
    }, 250);
  });
  const readLog = () => page2.evaluate(() => window.__formsLog ?? []).catch(() => []);
  // The dark is dealt as SIX Tangles around the board's
  // far rim: a lone foe is unravelled by the defender in
  // seconds, or fells the bastion, and the battle's end
  // clears every working with it (watched repeatedly in
  // this drive's probes and early runs) — the saplings'
  // 20 s must be lived inside a battle still standing,
  // so the dark is given numbers, the longest march and
  // the toughest hide on the roster.
  const placeFoe = () => {
    const rim = (sc2.state?.map ?? []).map(t => t.id)
      .sort((a, b) => (axDist(b, "0,0") - axDist(a, "0,0")) || (axDist(b, myHex) - axDist(a, myHex))).slice(0, 6);
    for (const hex of rim) sc2.send({ type: "stPlaceFoe", hex, kind: "tangle" });
  };
  const notMother = (mothers) => ([id, form]) => form === "twin-trees" && !mothers.includes(id);
  await installLog();
  placeFoe();
  await sc2.waitFor(cc => cc.state?.battle?.active === true, "the campaign battle joined", 20000).catch(() => {});
  ok("§F the campaign battle is joined — the grove's clock runs", sc2.state?.battle?.active === true, JSON.stringify(sc2.errors.slice(-2)));
  // The sapling's form is read off the board's own log:
  // any snapshot holding a standing working that is not
  // a mother, wearing "twin-trees", is a rooted sapling
  // in her form (the scene's record, kept at the scene's
  // own tempo).
  await sleep(6000);
  await page2.screenshot({ path: join(SHOTS, "campaign-grove-saplings.png") }).catch(() => {});
  await sleep(9000);
  let formsLog = await readLog();
  let sapForm = formsLog.flatMap((snap) => Object.entries(snap)).find(notMother([grove.id]))?.[0] ?? null;
  if (!sapForm) {
    // The first dealing's battle can end inside the
    // saplings' window (the dark felled, or the bastion)
    // and the written light fades with it — a second
    // dealing is dealt: a fresh grove (fresh rooting
    // dues) and a fresh Tangle, and the log is kept again.
    let grove2 = null;
    for (let i = 0; i < 18 && !grove2; i++) {
      sc2.send({ type: "castWard", root: "springleaf", hexA: myHex, hexB });
      await sleep(800);
      grove2 = (sc2.state?.workings ?? []).find(x => x.kind === "grove" && x.id !== grove.id) ?? null;
    }
    await installLog();
    placeFoe();
    await sc2.waitFor(cc => cc.state?.battle?.active === true, "the second battle joined", 15000).catch(() => {});
    await sleep(6000);
    await page2.screenshot({ path: join(SHOTS, "campaign-grove-saplings.png") }).catch(() => {});
    await sleep(9000);
    formsLog = await readLog();
    sapForm = formsLog.flatMap((snap) => Object.entries(snap)).find(notMother([grove.id, grove2?.id]))?.[0] ?? sapForm;
  }
  ok("§F a rooted sapling stands in the scene as the Twin Trees too", !!sapForm,
    `sapling=${sapForm} snapshots=${formsLog.length} maxForms=${Math.max(0, ...formsLog.map((s) => Object.keys(s).length))} room=${JSON.stringify((sc2.state?.workings ?? []).map((w) => ({ k: w.kind, m: w.mother, due: (w.saplingDue ?? []).length })))} battle=${sc2.state?.battle?.active} tale=${JSON.stringify((sc2.state?.tale ?? []).slice(-3).map((t) => t.text))}`);
  await browser2.close();
  sc2.ws.close();
  fc2.ws.close();
  wws.close();
}
tc.ws.close();

console.log(`\nSPRINGLEAF TWIN TREES DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
