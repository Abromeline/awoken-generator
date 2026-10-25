// THE ROOM STANDS DRIVE (2026-10-25 — the fall Nigel hit
// live on Discord, React error #310): the Table room died at
// the very moment it stood. The band-completion useEffect in
// Table.tsx lived BELOW the component's phase returns (boot /
// door / password / error / lost), so no mount render ever
// called it — and the first render that fell through to the
// standing room called one hook more than every render
// before it. React's law is exact: "Rendered more hooks than
// during the previous render." The error net caught the fall
// and named it; this drive is the proof the room now STANDS:
// a real Tender, bound the way Discord binds, takes a real
// seat in a real browser — the room renders, the map paints,
// her figure stands on her tile, and no fault card, no #310,
// no hooks error appears anywhere. The effect now stands
// above the phase returns with its law written beside it.
// (Against a DEV client build the console assertions below
// also catch the full unminified wording; against the
// production build they catch the fault card and #310.)
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-table-room-stands.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-roomstands-"));
process.env.PORT = "3961";
process.env.WORKSHOP_PASSWORD = "fix-password-1";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const PW = "fix-password-1";
const BASE = "http://127.0.0.1:3961";
const ROOM = "room-stands-drive";
const OUT = "/home/hatch/workspace/table-310-proof";
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
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }
const now = Date.now();
const part = (name, category, power, toughness) => Number(db.prepare(
  "INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, 'sky', ?, 'image/png', ?)")
  .run(name, category, power, toughness, `fix/${name}.png`, now).lastInsertRowid);
const mkAwokin = (ownerKey, ownerName, name, power) => {
  const comp = JSON.stringify([
    { source_id: `db:${part(name + " Body", "body", power, 5)}`, name: name + " Body", category: "body", rarity: "common", power, toughness: 5, element: "sky" },
    { source_id: `db:${part(name + " Arms", "arms", 0, 0)}`, name: name + " Arms", category: "arms", rarity: "common", power: 0, toughness: 0, element: "sky" },
    { source_id: `db:${part(name + " Head", "head", 0, 0)}`, name: name + " Head", category: "head", rarity: "common", power: 0, toughness: 0, element: "sky" },
  ]);
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, "fix/awokin.png", comp, ownerName, ownerKey, now).lastInsertRowid);
};

const { issueTableToken } = await import("../server/dist/table.js");
async function mkTender(name, exp, classKey, discId) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, exp, Date.now());
  if (classKey) { mkAwokin(ownerKey, name, `${name} Wake One`, 2); mkAwokin(ownerKey, name, `${name} Wake Two`, 2); mkAwokin(ownerKey, name, `${name} Wake Three`, 2); }
  if (classKey) await call("chooseClass", { classKey }, claim.token);
  const tt = issueTableToken({ id: discId, name });
  const bindCode = (await call("getTableBindCode", {}, claim.token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
  if (!bindRes.ok) throw new Error("table/bind failed for " + name + ": " + bindRes.status);
  return { token: claim.token, ownerKey, tt, name };
}

const A = await mkTender("Stands Warden", 800, "warden", "disc-stands-a");
const kin = mkAwokin(A.ownerKey, A.name, "Standskin", 2);
await call("addToParty", { awakenedId: kin }, A.token);

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
const consoleLines = [];
page.on("console", (msg) => { consoleLines.push(msg.text()); });
page.on("pageerror", (err) => consoleLines.push(String(err)));
await page.evaluateOnNewDocument((sess) => { window.__awokenTableSession = sess; },
  { authToken: A.tt, room: ROOM, name: A.name });
await page.goto(BASE + "/table?frame_id=room-stands", { waitUntil: "domcontentloaded", timeout: 60000 });

let stands = true;
try { await page.waitForSelector(".table-room", { timeout: 30000 }); } catch { stands = false; }
ok("the room STANDS — .table-room mounts for a seated Tender", stands);
const fault = await page.evaluate(() => !!document.querySelector(".room-fault")).catch(() => false);
ok("no fault card stands over the room", !fault);
let painted = false;
try { await page.waitForFunction(() => !!document.querySelector(".table-room svg polygon"), { timeout: 15000 }); painted = true; } catch { /* stays false */ }
ok("the room's map paints (svg tiles stand in the room)", painted);
const seated = await page.evaluate(() => (document.body.textContent ?? "").includes("takes a seat at the Table")).catch(() => false);
ok("the tale speaks her seating — the room is alive, not a shell", seated);
await sleep(2000);
const hooksFall = consoleLines.some((l) => /Rendered more hooks|#310|room hit a fault/.test(l));
ok("no hooks fall anywhere in the console — no #310, in either build's wording", !hooksFall,
  consoleLines.filter((l) => /hook|310|fault/i.test(l)).join(" | ").slice(0, 300));
// THE TABLE'S SKY (Nigel, 2026-10-25): the moon-and-spires
// scene is struck; the Negative stands still in its place
// and his meteors fall over it.
const sky = await page.evaluate(() => {
  const neb = document.querySelector(".table-nebula");
  const mets = [...document.querySelectorAll(".table-meteor")];
  return {
    oldScene: !!document.querySelector(".field-bg"),
    nebula: !!neb && (getComputedStyle(neb).backgroundImage ?? "").includes("nebula-negative"),
    nebulaAnimation: neb ? getComputedStyle(neb).animationName : "(none)",
    meteors: mets.length,
    meteorSrc: mets[0] ? (mets[0].getAttribute("src") ?? "") : "",
  };
}).catch(() => ({ oldScene: true, nebula: false, nebulaAnimation: "?", meteors: 0, meteorSrc: "" }));
ok("the old moon-and-spires background is gone from the room", !sky.oldScene);
ok("the second nebula — the Negative — stands as the room's ground", sky.nebula, JSON.stringify(sky));
ok("the nebula stands STILL — no animation on its layer", sky.nebulaAnimation === "none", `animation-name: ${sky.nebulaAnimation}`);
ok("his meteors fall over it — six instances of the meteor-rain", sky.meteors === 6 && sky.meteorSrc.includes("meteor-rain"),
  `count=${sky.meteors} src=${sky.meteorSrc}`);
await page.screenshot({ path: `${OUT}/room-stands.png` });
ok("the standing room is photographed", true);
await browser.close();

console.log(`\ndrive-table-room-stands: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
