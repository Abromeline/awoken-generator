// THE ERROR NET DRIVE (2026-10-24 — the room that died mute):
// in Discord the Table's boot card painted, the steps ran,
// the card vanished (the room mounted) — and then a brown
// empty screen, forever, under both the old front page and
// the guarded one. The room had NO error boundary: a throw
// in its render or in an effect's commit tore the whole
// React tree down — timers, guards and all — leaving
// table.css's brown. The net under proof here:
//   · an error boundary around the room (TableApp.tsx)
//     whose fallback stands on the room's own themed ground
//     and speaks the error's own words + the door record;
//   · a door-level trap (table-main.ts) for faults outside
//     the room, which speaks ONLY while the page holds no
//     standing room (boot card up, or root left empty) and
//     stays silent over a living room.
// The faults are injected by the room itself under the
// test-only ?tablefault= flag (Table.tsx) — no production
// road ever sets it.
// Scenes (all on the outside-Discord road, as the room-load
// drive's are — the boundary and trap are the same code on
// both roads):
//   §A ?tablefault=render — a throw as the room renders:
//      the boundary card stands with the fault's words and
//      the door record — not a brown void, not a torn root.
//   §B ?tablefault=effect — a throw as a mount effect
//      commits: likewise.
//   §C no flag — the door renders exactly as before, and
//      no fault card stands anywhere.
//   §D the door trap, in three tellings: (a) a genuine
//      uncaught exception at the door (a timer throw in the
//      page) paints the fault line into the boot card;
//      (b) a window error event carrying a named error
//      paints that error's own words + the door record
//      (a synthetic event: rejections born inside
//      puppeteer's evaluate never dispatch unhandled-
//      rejection to the page's listeners under CDP — a
//      probe at build time proved a genuine page error
//      reaches the trap and paints, and production's
//      Chromium fires unhandledrejection for true page
//      rejections as a matter of course); (c) once the
//      room stands, a further fault paints NOTHING over
//      it (the trap's silence rule).
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-table-error-net.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-errornet-"));
process.env.PORT = "3953";
process.env.WORKSHOP_PASSWORD = "fix-password-1";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3953";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

await import("../server/dist/index.js");
await sleep(2500);

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio"] });

async function faultScene(flag, words, label) {
  const page = await browser.newPage();
  await page.goto(`${BASE}/table?tablefault=${flag}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  let card = true;
  try { await page.waitForSelector(".room-fault", { timeout: 25000 }); } catch { card = false; }
  ok(`${label} the boundary card stands (no brown void, no torn-down root)`, card);
  const text = card ? await page.evaluate(() => document.querySelector(".room-fault")?.textContent ?? "") : "";
  ok(`${label} the card speaks the fault's own words`, text.includes(words), `card text: ${text.slice(0, 200)}`);
  ok(`${label} the card carries the candle and the Table's name`, text.includes("The Table"), `card text: ${text.slice(0, 120)}`);
  ok(`${label} the card carries the door record`, text.includes("Door record:") && text.includes("Framed by Discord:"), `card text: ${text.slice(0, 300)}`);
  const themed = await page.evaluate(() => !!document.querySelector(".table-door-wrap .table-door.room-fault"));
  ok(`${label} the card stands on the room's own themed ground`, themed);
  await page.close();
}

// ── §A a throw in the room's render ───────────────────────
await faultScene("render", "drive-injected render fault", "§A");

// ── §B a throw in an effect's commit ──────────────────────
await faultScene("effect", "drive-injected effect fault", "§B");

// ── §C no fault: the door renders exactly as before ───────
{
  const page = await browser.newPage();
  await page.goto(BASE + "/table", { waitUntil: "domcontentloaded", timeout: 60000 });
  let door = true;
  try { await page.waitForSelector(".table-door", { timeout: 30000 }); } catch { door = false; }
  ok("§C with no fault, the room mounts and the door renders", door);
  const snapshot = await page.evaluate(() => ({
    faultCard: !!document.querySelector(".room-fault"),
    doorText: document.querySelector(".table-door")?.textContent ?? "",
  }));
  ok("§C no fault card stands anywhere", !snapshot.faultCard);
  ok("§C the door is the door as it always was", snapshot.doorText.includes("A table for Tenders"), `door text: ${snapshot.doorText.slice(0, 160)}`);
  await page.close();
}

// ── §D the door trap speaks at the door, silent over a room ──
const ROOM_CHUNK = /\/assets\/TableApp-[^/]+\.js(?:\?|$)/;
async function heldRoomPage() {
  const page = await browser.newPage();
  const held = { req: null };
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (ROOM_CHUNK.test(req.url()) && !held.req) { held.req = req; return; } // held — the room never arrives yet
    void req.continue();
  });
  await page.goto(BASE + "/table", { waitUntil: "domcontentloaded", timeout: 60000 });
  let bootUp = false;
  for (let i = 0; i < 40 && !bootUp; i++) {
    bootUp = await page.evaluate(() => document.getElementById("boot-step")?.textContent === "Loading the room…").catch(() => false);
    if (!bootUp) await sleep(300);
  }
  return { page, held, bootUp };
}
const stepSaysFault = (page) => page.evaluate(() => (document.getElementById("boot-step")?.textContent ?? "").includes("fault at its door")).catch(() => false);
async function waitStepFault(page, tries = 33) {
  for (let i = 0; i < tries; i++) { if (await stepSaysFault(page)) return true; await sleep(300); }
  return false;
}

// §D-a a genuine uncaught exception at the door.
{
  const { page, held, bootUp } = await heldRoomPage();
  ok("§D-a the boot card stands at the room-load step, chunk held", bootUp && !!held.req);
  await page.evaluate(() => { setTimeout(() => { throw new Error("drive-injected door fault"); }, 10); });
  const spoke = await waitStepFault(page);
  ok("§D-a a genuine uncaught exception at the door paints the fault line into the boot card", spoke);
  const errText = await page.evaluate(() => document.getElementById("boot-error")?.textContent ?? "");
  ok("§D-a the painted fault carries the door record", errText.includes("Door:"), `error text: ${errText.slice(0, 200)}`);
  await page.close();
}

// §D-b a named error's own words, carried by its event.
{
  const { page, bootUp } = await heldRoomPage();
  ok("§D-b the boot card stands at the room-load step, chunk held", bootUp);
  await page.evaluate(() => {
    const err = new Error("drive-injected door fault");
    window.dispatchEvent(new ErrorEvent("error", { error: err, message: err.message }));
  });
  const spoke = await waitStepFault(page);
  ok("§D-b the trap paints while no room stands", spoke);
  const errText = await page.evaluate(() => document.getElementById("boot-error")?.textContent ?? "");
  ok("§D-b the painted fault carries the error's own words and the door record",
    errText.includes("drive-injected door fault") && errText.includes("Door:"), `error text: ${errText.slice(0, 240)}`);
  await page.close();
}

// §D-c over a standing room, the trap stays silent.
{
  const { page, held, bootUp } = await heldRoomPage();
  ok("§D-c the boot card stands at the room-load step, chunk held", bootUp && !!held.req);
  await held.req.continue();
  let door = true;
  try { await page.waitForSelector(".table-door", { timeout: 30000 }); } catch { door = false; }
  ok("§D-c the room mounts once released", door);
  await page.evaluate(() => {
    const err = new Error("drive-injected late fault");
    window.dispatchEvent(new ErrorEvent("error", { error: err, message: err.message }));
  });
  await sleep(1200);
  const after = await page.evaluate(() => ({
    bootCardBack: !!document.getElementById("boot-step"),
    roomStands: !!document.querySelector(".table-door"),
  }));
  ok("§D-c over a standing room the trap stays silent — nothing is painted over it",
    after.roomStands && !after.bootCardBack, JSON.stringify(after));
  await page.close();
}

await browser.close();
console.log(`\ndrive-table-error-net: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
