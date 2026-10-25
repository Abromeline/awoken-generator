// THE ROOM-LOAD DRIVE (2026-10-24 — Nigel's mute Table):
// the Table's front page once waited on the room chunk with
// NO guard: every other boot step carried a 20-second stuck
// guard that names itself, but loadRoom's import sat at
// "Taking your seat…" forever when Discord's proxy never
// delivered the chunk (Nigel left a stuck Table 45 seconds in
// total silence). The fix under proof here:
//   · the room load stands under the same stepTimeout guard,
//     labelled "Loading the room…", so a fetch that never
//     settles NAMES itself on the error card in ~20 s;
//   · the LATE-ROOM RULE: a room that lands after the guard
//     fired still mounts, replacing the stale error card —
//     unless the player already pressed the retry (a reload
//     underway wins);
//   · the in-Discord road also starts the room fetch early,
//     alongside the sign-in. These scenes run on the
//     OUTSIDE-Discord road (a bare page has no frame parent),
//     where loadRoom runs at once — the guard and the
//     late-room rule are the same code on both roads; the
//     early start itself is in-Discord only and is proved by
//     the source, not by these scenes.
// Scenes:
//   §A the TableApp chunk request is HELD by interception and
//      never answered (the proxy stall, reproduced): the
//      card first shows the waiting step "Loading the room…",
//      then — inside the guard window, not mute at 45 s — the
//      stuck message naming the room-load step, with the
//      error box and the retry button shown.
//   §B on that same page the held request is then RELEASED:
//      the late room mounts over the stale error card (the
//      late-room rule) and the door renders.
//   §C the chunk is merely DELAYED ~3 s: the room mounts and
//      the door renders, no stuck card.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-table-room-load.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-roomload-"));
process.env.PORT = "3949";
process.env.WORKSHOP_PASSWORD = "fix-password-1";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3949";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

await import("../server/dist/index.js");
await sleep(2500);

const ROOM_CHUNK = /\/assets\/TableApp-[^/]+\.js(?:\?|$)/;
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio"] });

// A page whose TableApp chunk request is intercepted: mode
// "hold" never answers it (the stall), mode "delay" answers
// after ~3 s. The held request is exposed for §B's release.
async function roomPage(mode) {
  const page = await browser.newPage();
  const held = { req: null };
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (!ROOM_CHUNK.test(req.url())) { void req.continue(); return; }
    if (mode === "hold") { held.req = req; return; } // never answered — the stall
    if (mode === "delay") { void sleep(3000).then(() => req.continue().catch(() => {})); return; }
    void req.continue();
  });
  return { page, held };
}

const stepText = (page) => page.evaluate(() => document.getElementById("boot-step")?.textContent ?? null);
async function waitStep(page, pred, ms) {
  const s = Date.now();
  while (Date.now() - s < ms) {
    const t = await stepText(page).catch(() => null);
    if (t !== null && pred(t)) return { text: t, elapsed: Date.now() - s };
    await sleep(400);
  }
  return { text: await stepText(page).catch(() => null), elapsed: Date.now() - s };
}

// ── §A the held chunk: the guard names the step in time ───
{
  const { page, held } = await roomPage("hold");
  const t0 = Date.now();
  await page.goto(BASE + "/table", { waitUntil: "domcontentloaded", timeout: 60000 });
  const waiting = await waitStep(page, (t) => t === "Loading the room…", 10000);
  ok("§A while the room fetch hangs, the card shows the waiting step “Loading the room…”",
    waiting.text === "Loading the room…", `saw: ${JSON.stringify(waiting.text)}`);
  const stuck = await waitStep(page, (t) => t.includes("got stuck at this step"), 30000);
  const stuckAt = Date.now() - t0;
  ok("§A the stuck message names the room-load step",
    !!stuck.text && stuck.text.includes("Loading the room"), `saw: ${JSON.stringify(stuck.text)}`);
  ok("§A the guard fired inside its window — not mute at 45 s",
    stuckAt < 25000, `stuck after ${stuckAt} ms`);
  console.log(`     (stuck card after ${stuckAt} ms)`);
  const chrome = await page.evaluate(() => ({
    errShown: getComputedStyle(document.getElementById("boot-error")).display !== "none",
    retryShown: getComputedStyle(document.getElementById("boot-retry")).display !== "none",
  }));
  ok("§A the error box and the retry button stand shown on the stuck card", chrome.errShown && chrome.retryShown, JSON.stringify(chrome));

  // ── §B the late room mounts over the stale error card ───
  // (On this road the mounted room shows its door: .table-door
  // is the room's face to a visitor who has not yet sat.)
  ok("§B the chunk request is still held, ready to release", !!held.req);
  await held.req.continue();
  let mounted = true;
  try { await page.waitForSelector(".table-door", { timeout: 20000 }); } catch { mounted = false; }
  ok("§B the late room mounts after the guard fired — recovery over the stale error card", mounted);
  const cardGone = await page.evaluate(() => document.getElementById("boot-step") === null);
  ok("§B the boot card is gone once the room stands", cardGone);
  await page.close();
}

// ── §C the merely-delayed chunk: the room mounts ──────────
{
  const { page } = await roomPage("delay");
  await page.goto(BASE + "/table", { waitUntil: "domcontentloaded", timeout: 60000 });
  let mounted = true;
  try { await page.waitForSelector(".table-door", { timeout: 30000 }); } catch { mounted = false; }
  ok("§C with the chunk delayed ~3 s, the room mounts and the door renders", mounted);
  await page.close();
}

await browser.close();
console.log(`\ndrive-table-room-load: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
