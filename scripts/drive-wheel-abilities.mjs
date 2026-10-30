// drive-wheel-abilities — THE ABILITIES SECTION (2026-10-29;
// Nigel's ruling 2026-10-29 10:16, visibility ruled 10:19,
// build resumed on his word 2026-10-30). Proven on the real
// homeland:
//   §A ONE DEFINITION: the ability registry's requirement
//      table is read by BOTH the wheel (client/src/abilities.ts)
//      and the server (server/src/abilities.ts). This drive
//      compiles the client's module and imports the server's
//      built module, and fails if their tables disagree —
//      key, name, or any part of any requirement.
//   §B THE MIX CASE: the one checker, exercised against a
//      SYNTHETIC mix requirement (Tide ≥2 + Root ≥1) that no
//      shipped ability carries — a mix is met in full or not
//      at all, both ways, on BOTH copies of the checker. The
//      shipped registry itself keeps Building alone.
//   §C THE SERVED PULL: the field is served with each Awoken's
//      full element sums; the client's own pull
//      (elementSumsOfPlacement + qualifiedAbilities) over the
//      served placements yields Building for a ≥2-Rock Awoken
//      and NOTHING for an Awoken holding no qualifying sums —
//      and the server's cast door refuses the unqualified
//      lead and accepts the qualified one, by the same table.
//   §D THE WHEEL, IN A REAL BROWSER: an Awoken qualifying for
//      nothing shows NO Abilities section on its wheel; a
//      qualified Awoken's wheel carries the door, the tab
//      opens on the registry's list, and Building's row
//      speaks its requirement. Portraits land in
//      ~/workspace/abilities-proof/.
// Run after `npm run build`:
//   PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-wheel-abilities.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";
import { buildSync } from "../node_modules/esbuild/lib/main.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-wheel-abilities-"));
process.env.PORT = "39993";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

const ROOT = new URL("..", import.meta.url).pathname;
process.chdir(ROOT);
const BASE = "http://127.0.0.1:39993";
const PW = "wheel-abilities-drive-password";
const SHOTS = "/home/hatch/workspace/abilities-proof";
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

/* ══ §A ONE DEFINITION — the two tables agree ══════════════ */
console.log("§A one definition — the wheel's table and the server's table are the same table");
const clientOut = join(mkdtempSync(join(tmpdir(), "awoken-abilities-client-")), "abilities.mjs");
buildSync({ entryPoints: [join(ROOT, "client/src/abilities.ts")], bundle: true, format: "esm", outfile: clientOut });
const CLIENT = await import(clientOut);
const SERVER = await import("../server/dist/abilities.js");
{
  const norm = (defs) => defs.map(d => ({
    key: d.key, name: d.name,
    requires: Object.fromEntries(Object.entries(d.requires).filter(([, v]) => (v ?? 0) > 0).sort(([a], [b]) => a.localeCompare(b))),
  }));
  const ct = norm(CLIENT.ABILITY_REGISTRY), st = norm(SERVER.ABILITY_REGISTRY);
  ok("the two registry tables agree — key, name, every requirement",
    JSON.stringify(ct) === JSON.stringify(st), `client=${JSON.stringify(ct)} server=${JSON.stringify(st)}`);
  ok("the shipped registry holds Building alone — Nigel's list fills it later, no invented abilities",
    ct.length === 1 && ct[0].key === "building" && ct[0].requires.stone === 2, JSON.stringify(ct));
  ok("Building's requirement speaks in player words — '2 Rock'",
    CLIENT.requirementText(CLIENT.abilityByKey("building")) === "2 Rock",
    CLIENT.requirementText(CLIENT.abilityByKey("building")));
}

/* ══ §B THE MIX CASE — a mix is met in full or not at all ══ */
console.log("§B the mix case — a synthetic mix (Tide ≥2 + Root ≥1) against both checkers");
{
  const MIX = { tide: 2, root: 1 };
  const sums = (o) => ({ tide: 0, sky: 0, stone: 0, root: 0, fire: 0, ...o });
  const cases = [
    ["the mix met exactly (2 Tide · 1 Root)", sums({ tide: 2, root: 1 }), true],
    ["the mix met and passed (3 Tide · 2 Root)", sums({ tide: 3, root: 2 }), true],
    ["Tide met, Root missing — a mix met in part is NOT met", sums({ tide: 2 }), false],
    ["Root heaped, Tide short — NOT met", sums({ tide: 1, root: 4 }), false],
    ["nothing held — NOT met", sums({}), false],
  ];
  for (const [name, s, want] of cases) {
    ok(`client checker: ${name}`, CLIENT.abilityQualifies(MIX, s) === want, `got ${CLIENT.abilityQualifies(MIX, s)}`);
    ok(`server checker: ${name}`, SERVER.abilityQualifies(MIX, s) === want, `got ${SERVER.abilityQualifies(MIX, s)}`);
  }
  ok("the single-element gate still reads true at the mark and false below it (Rock 2)",
    CLIENT.abilityQualifies({ stone: 2 }, sums({ stone: 2 })) && SERVER.abilityQualifies({ stone: 2 }, sums({ stone: 2 }))
    && !CLIENT.abilityQualifies({ stone: 2 }, sums({ stone: 1 })) && !SERVER.abilityQualifies({ stone: 2 }, sums({ stone: 1 })));
  ok("the pull yields Building at 2 Rock and nothing at 1 Rock, nothing at none",
    CLIENT.qualifiedAbilities(sums({ stone: 2 })).map(a => a.key).join() === "building"
    && CLIENT.qualifiedAbilities(sums({ stone: 1 })).length === 0
    && CLIENT.qualifiedAbilities(sums({})).length === 0);
}

/* ══ THE WORLD — a fresh Tender and two fielded Awoken ═════ */
await import("../server/dist/index.js");
await sleep(2500);

async function call(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, body: data?.data ?? data, raw: data };
}
async function callOk(action, args, token) {
  const r = await call(action, args, token);
  if (r.status !== 200) throw new Error(`${action} -> ${r.status}: ${JSON.stringify(r.raw).slice(0, 200)}`);
  return r.body;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up, as the other drives do */ }
const now = Date.now();

const claim = await callOk("claimTender", { password: PW, tenderName: "Wheel Tender" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
const token = claim.token;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 3, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', total_exp = 3800, hp = 100").run(ownerKey, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 1000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 1000").run(ownerKey, now);
await callOk("ensureFirstSeed", {}, token);
let land = await callOk("getTerritory", {}, token);
const tileAt = (q, r) => land.tiles.find(t => t.q === q && t.r === r && (t.z ?? 0) === 0);

const insAsset = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
function seedAwoken(name, parts) {
  const comp = parts.map(([n, c, p, t, el]) => {
    const id = Number(insAsset.run(n, c, p, t, el, `wheelabilities/${n}.png`, now).lastInsertRowid);
    return { source_id: `db:${id}`, name: n, category: c, rarity: "common", power: p, toughness: t, element: el };
  });
  const ins = db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', 'Wheel Tender', ?, ?)");
  return Number(ins.run(name, name, `wheelabilities/${name}.png`, JSON.stringify(comp), ownerKey, now).lastInsertRowid);
}
// Stonewright: 3 Stone (Rock 3) — qualified for Building.
// Skyhand: all Sky — qualifies for NOTHING in the registry.
const stonewright = seedAwoken("Stonewright", [["Granite Body", "body", 9, 9, "stone"], ["Granite Arms", "arms", 9, 9, "stone"], ["Granite Crown", "head", 9, 9, "stone"]]);
const skyhand = seedAwoken("Skyhand", [["Gale Body", "body", 10, 10, "sky"], ["Gale Arms", "arms", 10, 10, "sky"], ["Gale Crown", "head", 10, 10, "sky"]]);

await callOk("deployFirstSeed", { awakenedIds: [stonewright] }, token);
const place = (awakenedId, tile) => db.prepare(`INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, stance, follow, hp, pos_q, pos_r, shield, shield_max, stance_ordered)
  VALUES (?, ?, ?, ?, ?, 'defense', 0, 99, ?, ?, NULL, NULL, 0)`).run(ownerKey, awakenedId, tile.id, now, now, tile.q, tile.r);
place(skyhand, tileAt(0, 1));
land = await callOk("getTerritory", {}, token);

/* ══ §C THE SERVED PULL + THE SERVER'S DOOR ════════════════ */
console.log("§C the served pull — the wheel's checker over the served field, and the server's door");
{
  const byId = new Map(land.placements.map(p => [p.awakenedId, p]));
  const sw = byId.get(stonewright), sh = byId.get(skyhand);
  ok("the field is served with FULL element sums, not Rock alone (Stonewright 3 Rock · Skyhand 3 Sky)",
    sw?.elements?.stone === 3 && sh?.elements?.sky === 3 && sh?.elements?.stone === 0,
    JSON.stringify({ sw: sw?.elements, sh: sh?.elements }));
  ok("the client's pull over the served placements: Building for Stonewright, NOTHING for Skyhand",
    CLIENT.qualifiedAbilities(CLIENT.elementSumsOfPlacement(sw)).map(a => a.key).join() === "building"
    && CLIENT.qualifiedAbilities(CLIENT.elementSumsOfPlacement(sh)).length === 0);
  const GEO = await import("../server/dist/buildGeometry.js");
  const [m, n] = GEO.centerAddress(GEO.axialToPlate(0, 0));
  const square0 = GEO.piecesOfHex(Math.round(m), Math.round(n)).find(p => p.kind === "square");
  const skyLead = await call("placeBuildPiece", { kind: "square", verts: square0.verts, leadId: skyhand }, token);
  ok("the server's door refuses the lead the wheel hides — Skyhand cannot lead a cast", skyLead.status !== 200, `${skyLead.status}`);
  const lay = await callOk("placeBuildPiece", { kind: "square", verts: square0.verts, leadId: stonewright }, token);
  ok("the server's door accepts the lead the wheel offers — the cast begins, RISING at frac 0",
    lay.piece.state === "rising" && lay.piece.frac === 0, JSON.stringify(lay.piece));
}

/* ══ §D THE WHEEL, IN A REAL BROWSER ═══════════════════════ */
console.log("§D the wheel in a real browser — no section for the unqualified, the door and the list for the qualified");
{
  land = await callOk("getTerritory", {}, token);
  const farTile = land.tiles.find(t => t.q === 2 && t.r === -2 && (t.z ?? 0) === 0)
    ?? land.tiles.find(t => t.q === -2 && t.r === 2 && (t.z ?? 0) === 0);
  if (farTile) await callOk("setTenderTile", { tileId: farTile.id }, token);

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
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
  await sleep(1200);
  const clearOverlays = async () => {
    await page.evaluate(() => {
      const cer = [...document.querySelectorAll(".ceremony-card button")].find((b) => b.textContent.trim() === "Tend on");
      if (cer) cer.click();
      const rep = document.querySelector(".return-report-overlay:not(:has(.ceremony-card))");
      if (rep) rep.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      const p = document.querySelector(".admin-popup");
      if (p) p.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      document.querySelector(".margin-guide-dismiss")?.click();
    });
    await sleep(500);
  };
  await clearOverlays();
  const figBoxes = async () => page.evaluate(() => {
    const out = [];
    for (const g of document.querySelectorAll("g.field-drifter, g.field-patroller")) {
      const r = g.getBoundingClientRect();
      if (r.width) out.push({ cx: r.left + r.width / 2, cy: r.top + r.height / 2 });
    }
    return out;
  });
  const wheelState = async () => page.evaluate(() => ({
    wheel: !!document.querySelector(".gw-wheel"),
    discs: [...document.querySelectorAll(".gw-disc")].map((d) => d.textContent ?? ""),
    caption: document.querySelector(".gw-caption")?.textContent ?? "",
  }));
  const openWheelOf = async (name) => {
    await page.waitForFunction(() => document.querySelectorAll("g.field-drifter, g.field-patroller").length > 0, { timeout: 25000 }).catch(() => {});
    for (let sweep = 0; sweep < 3; sweep++) {
      await clearOverlays();
      for (const f of await figBoxes()) {
        await page.touchscreen.tap(f.cx, f.cy);
        await sleep(700);
        const s = await wheelState();
        if (s.wheel && s.caption.includes(name)) return s;
        if (s.wheel) { await page.touchscreen.tap(1350, 40); await sleep(500); }
      }
      await sleep(600);
    }
    return null;
  };

  const skyWheel = await openWheelOf("Skyhand");
  ok("an Awoken qualifying for NOTHING shows NO Abilities section on its wheel (Nigel's ruling, 10:19)",
    !!skyWheel && !skyWheel.discs.some(d => d.includes("Abilities")), JSON.stringify(skyWheel?.discs));
  await page.screenshot({ path: join(SHOTS, "02-unqualified-wheel-no-section.png") });
  if (skyWheel) { await page.touchscreen.tap(1350, 40); await sleep(500); }

  const stoneWheel = await openWheelOf("Stonewright");
  ok("the qualified Awoken's wheel carries the Abilities door",
    !!stoneWheel && stoneWheel.discs.some(d => d.includes("Abilities")), JSON.stringify(stoneWheel?.discs));
  await page.screenshot({ path: join(SHOTS, "01-qualified-wheel-with-section.png") });
  if (stoneWheel) {
    const box = await page.evaluate(() => {
      const d = [...document.querySelectorAll(".gw-disc")].find((x) => (x.textContent ?? "").includes("Abilities"));
      if (!d) return null;
      const r = d.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.touchscreen.tap(box.x, box.y);
    await sleep(800);
  }
  const listState = await page.evaluate(() => {
    const panel = document.querySelector(".ability-side-panel");
    return {
      tab: !!panel,
      lead: panel?.getAttribute("data-lead"),
      rows: [...(panel?.querySelectorAll(".ability-entry") ?? [])].map(r => r.textContent ?? ""),
      menu: !!panel?.querySelector(".pieces-menu"),
    };
  });
  ok("the tab opens on the registry's list — Building's row, speaking its requirement, on the lead Awoken",
    listState.tab && Number(listState.lead) === stonewright
    && listState.rows.length === 1 && listState.rows[0].includes("Building") && listState.rows[0].includes("2 Rock")
    && !listState.menu, JSON.stringify(listState));
  {
    const r = await page.evaluate(() => {
      const el = document.querySelector(".ability-side-panel");
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    });
    if (r) await page.screenshot({ path: join(SHOTS, "03-ability-tab-list.png"),
      clip: { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(1400 - Math.max(0, r.x), r.width), height: Math.min(950 - Math.max(0, r.y), r.height) } });
    ok("the ability tab's portrait is taken", !!r);
  }
  await browser.close();
}

console.log(`\ndrive-wheel-abilities: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
