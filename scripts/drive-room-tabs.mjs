// THE HOMELAND SERVES DISCORD — THE TAB BAR DRIVE (2026-10-28,
// Nigel's two amendments of 11:57). Boots the real server on a
// scratch DATA_DIR and proves the Discord interface's tab bar
// in a real browser:
//   §A THE TAB BAR stands over the page: The Room, the Test
//      Ground, Campaign Mode.
//   §B THE ROOM TAB is the seat: its doors stand (host
//      homeland / hunt a starseed), and hosting seats the
//      Tender on their own homeland — the homeland's own face
//      (the map) with the room's furniture beside it.
//      RESTATED (Nigel, 2026-10-28, 12:43: "use my meteor for
//      the starseed image in the table selection button and a
//      beacon for the host my homeland button plz"): the two
//      door buttons wear his artwork — the meteor the homeland
//      draws for a starseed on the starseed door, his beacon
//      from the land on the host door — and §B proves both
//      faces render on the buttons.
//   §C AN INVITE ARRIVAL seats: a second browser carrying
//      ?room=<the homeland's room> and the guest's own session
//      lands seated in the room; both pages' party panels name
//      both Tenders, and the host's map draws the guest's
//      figure with their name.
//   §D THE TEST GROUND TAB opens the old Table page, whole
//      (amendment 1: retired from serving the seat, kept).
//   §E THE CAMPAIGN TAB opens the campaign board (amendment
//      2): its door is the campaign door, and taking it seats
//      the storyteller board's room.
//   §F THE ROOM'S FACE STANDS AT ITS TRUE SIZES (the room's
//      stylesheet fix, 2026-10-28): at a Discord Activity
//      size the Pack's bag, the Eye's glyph, the view's fit
//      to its seat, and the page's scroll are measured —
//      theme.css must reach the table entry for any of them
//      to stand as drawn.
// Screenshots land in ~/workspace/homeland-discord-proof/.
// Run AFTER `npm run build`: node scripts/drive-room-tabs.mjs
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import Database from "../node_modules/better-sqlite3/lib/index.js";

process.env.PUPPETEER_CACHE_DIR = "/home/hatch/workspace/tools-chrome/.cache";
const require2 = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require2("puppeteer");

const OUT = "/home/hatch/workspace/homeland-discord-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-room-tabs-"));
process.env.PORT = "39872";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;
process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39872";
const PW = "room-tabs-drive-password";
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
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data?.data ?? data;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up */ }
const now = Date.now();
const ringOf = (q, r) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));

async function makeTender(name, { homeland = false } = {}) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, class_key, weapon_key, hp, updated_at) VALUES (?, 3800, 12, 'warden', 'sword', 100, ?) ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden', total_exp = 3800, hp = 100")
    .run(ownerKey, now);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000")
    .run(ownerKey, now);
  await call("ensureFirstSeed", {}, claim.token);
  if (homeland) {
    // A host who can host stands past their first seed: the
    // event is done and the beacon grown (the door-seat
    // drive's beacon sculpt), so the land's face is the map
    // itself, not the first-seed story.
    const seed = db.prepare("SELECT s.id FROM star_seeds s JOIN first_seed_events e ON e.seed_id = s.id WHERE e.owner_key = ?").get(ownerKey);
    if (seed) db.prepare("UPDATE star_seeds SET level = 3, fed_energy = 47 WHERE id = ?").run(seed.id);
    db.prepare("UPDATE first_seed_events SET state = 'done' WHERE owner_key = ?").run(ownerKey);
  }
  if (homeland) {
    await call("getTerritory", {}, claim.token);
    const have = new Set(db.prepare("SELECT q, r FROM territory_tiles WHERE owner_key = ? AND COALESCE(z, 0) = 0").all(ownerKey).map(t => `${t.q},${t.r}`));
    const ins = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, curse_hp, curse_max_hp, created_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)");
    const els = ["root", "tide", "sky", "stone", "fire"];
    for (let q = -6; q <= 6; q++) for (let r = -6; r <= 6; r++) {
      if (ringOf(q, r) > 6 || have.has(`${q},${r}`)) continue;
      const hp = 10 + ringOf(q, r) * 2;
      ins.run(ownerKey, q, r, els[Math.abs(q * 7 + r * 3) % 5], hp, hp, now);
    }
    db.prepare("UPDATE territory_tiles SET cursed = 0, element = 'sky', curse_hp = NULL, curse_max_hp = NULL WHERE owner_key = ? AND q = 0 AND r = 0 AND COALESCE(z, 0) = 0").run(ownerKey);
  }
  return { token: claim.token, tenderId, ownerKey, name };
}

console.log("§FIX the tenders");
const H = await makeTender("Tabs Host", { homeland: true });
const G = await makeTender("Tabs Guest");

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio"] });
async function tenderPage(token) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((t) => { try { window.localStorage.setItem("awoken-tender-token", t); } catch { /* */ } }, token);
  return page;
}
const pageText = (page) => page.evaluate(() => document.body.innerText);
const clickText = async (page, text) => page.evaluate((t) => {
  const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").includes(t));
  if (b) { b.click(); return true; }
  return false;
}, text);
const waitText = async (page, text, ms = 40000) =>
  page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: ms }, text).then(() => true).catch(() => false);

/* ── §A + §B THE TAB BAR AND THE ROOM ─────────────────── */
console.log("§A the tab bar; §B the room seats the host on their homeland");
const host = await tenderPage(H.token);
await host.goto(`${BASE}/table`, { waitUntil: "domcontentloaded", timeout: 60000 });
await host.waitForSelector(".table-tabs", { timeout: 30000 });
const tabs = await host.evaluate(() => [...document.querySelectorAll(".table-tabs button")].map(b => b.getAttribute("data-tab")));
ok("§A the tab bar carries the Room, the Test Ground, and Campaign Mode",
  JSON.stringify(tabs) === JSON.stringify(["room", "test", "campaign"]), JSON.stringify(tabs));
const doorsStand = (await waitText(host, "Host homeland")) && (await pageText(host)).includes("Hunt a new starseed");
const doorFaces = await host.evaluate(() => {
  const btn = (t) => [...document.querySelectorAll("button")].find((x) => (x.textContent || "").includes(t));
  const face = (b, needle, notNeedle) => {
    const img = b?.querySelector("img");
    const src = img?.getAttribute("src") || "";
    return !!img && src.includes(needle) && !(notNeedle && src.includes(notNeedle)) && img.complete && img.naturalWidth > 0;
  };
  return {
    meteor: face(btn("Hunt a new starseed"), "meteor-rain"),
    beacon: face(btn("Host homeland"), "beacon", "beacon-button"),
  };
});
ok("§B the room tab's doors stand (host homeland, hunt a starseed), wearing his meteor and his beacon",
  doorsStand && doorFaces.meteor && doorFaces.beacon, JSON.stringify(doorFaces));
await host.screenshot({ path: join(OUT, "01-room-doors.png") });
await host.screenshot({ path: join(OUT, "07-room-doors-art.png") });
await clickText(host, "Host homeland");
ok("§B hosting seats the host: the room's furniture stands beside the land",
  await waitText(host, "The party at this Table", 60000));
const hostText = await pageText(host);
ok("§B the party panel names the host on their own homeland room",
  hostText.includes("Tabs Host") && hostText.includes("homeland"), hostText.slice(0, 300));
const hostSvg = await host.waitForSelector(".room-seat-map svg", { timeout: 30000 }).then(() => true).catch(() => false);
ok("§B the homeland's own face (the map) renders in the room", hostSvg);
await host.screenshot({ path: join(OUT, "02-room-host-seated.png") });

/* ── §C THE INVITE ARRIVAL ────────────────────────────── */
console.log("§C the guest arrives by the room's invite address and seats");
const guest = await tenderPage(G.token);
await guest.goto(`${BASE}/table?room=homeland-${H.tenderId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
ok("§C the invite arrival lands seated (no door to knock at)",
  await waitText(guest, "The party at this Table", 60000));
await waitText(guest, "Tabs Guest", 30000); // the room-state poll lands
const guestText = await pageText(guest);
ok("§C the guest's party panel names both Tenders",
  guestText.includes("Tabs Guest") && guestText.includes("Tabs Host"), guestText.slice(0, 300));
await guest.screenshot({ path: join(OUT, "03-room-guest-seated.png") });
ok("§C the host's party panel takes the guest in (the room's poll)",
  await waitText(host, "Tabs Guest", 30000));
const guestFigureDrawn = await host.evaluate(() =>
  [...document.querySelectorAll(".room-seat-map svg text")].some(t => (t.textContent || "").includes("Tabs Guest")));
ok("§C the host's map draws the guest's figure, named, on the shared land", guestFigureDrawn);
// The homeland's face stacks its panels above the map (the
// bastion's face first, as at home): bring the guest's own
// figure — its name rides the map — to the frame's centre
// for the sitting's picture.
await host.evaluate(() => {
  const t = [...document.querySelectorAll(".room-seat-map svg text")]
    .find((x) => (x.textContent || "").includes("Tabs Guest"));
  if (t) t.scrollIntoView({ block: "center", inline: "center" });
});
await sleep(900);
await host.screenshot({ path: join(OUT, "04-room-two-seats.png") });

/* ── §F THE ROOM'S FACE STANDS AT ITS TRUE SIZES ────────
   (THE ROOM'S STYLESHEET, 2026-10-28: Push 48 mounted the
   homeland's Territory inside the room, but the rules that
   lay Territory out live in theme.css, which only the
   homeland's entry imported — in the room the face rendered
   unstyled: the Pack's bag at its art's intrinsic 468×509
   instead of the fixed 112×128, the Eye's glyph at 114×114
   instead of 22×22, the view thousands of px tall with the
   map far below the fold. Measured at a Discord Activity
   size, 1280×720, on the host's seated room.) */
console.log("§F the room's face at Discord Activity size (1280×720)");
await host.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await sleep(1200);
const geo = await host.evaluate(() => {
  const rect = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  };
  const bag = document.querySelector(".bag-btn");
  return {
    bag: rect(".bag-btn"),
    bagPos: bag ? getComputedStyle(bag).position : null,
    eye: rect(".eye-glyph"),
    viewH: rect(".territory-view")?.h ?? null,
    seatH: rect(".room-seat-map")?.h ?? null,
    scrollH: document.documentElement.scrollHeight,
    innerH: window.innerHeight,
  };
});
ok("§F the Pack's bag stands at its drawn size, fixed to the window (≤128px tall, position fixed)",
  !!geo.bag && geo.bag.h <= 128 && geo.bagPos === "fixed", JSON.stringify(geo));
ok("§F the Eye's glyph stands at 22×22",
  !!geo.eye && Math.abs(geo.eye.w - 22) <= 1 && Math.abs(geo.eye.h - 22) <= 1, JSON.stringify(geo.eye));
ok("§F the homeland's face fills its seat (the view's height is the seat's, within a few px)",
  geo.viewH != null && geo.seatH != null && Math.abs(geo.viewH - geo.seatH) <= 4,
  `view=${geo.viewH} seat=${geo.seatH}`);
ok("§F no vertical page scroll at Activity size (1280×720)",
  geo.scrollH <= geo.innerH + 1, `scrollH=${geo.scrollH} innerH=${geo.innerH}`);
await host.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
await sleep(600);

/* ── §D THE TEST GROUND TAB ───────────────────────────── */
console.log("§D the Test Ground tab opens the old Table page");
await host.evaluate(() => { document.querySelector('[data-tab="test"]')?.click(); });
ok("§D the old page's door stands in the Test Ground tab",
  await waitText(host, "A table for Tenders, played together", 40000));
await host.screenshot({ path: join(OUT, "05-test-ground.png") });

/* ── §E THE CAMPAIGN TAB ──────────────────────────────── */
console.log("§E the Campaign tab opens the campaign board");
await host.evaluate(() => { document.querySelector('[data-tab="campaign"]')?.click(); });
const campDoor = await host.waitForSelector('[data-campaign-door="true"]', { timeout: 40000 }).then(() => true).catch(() => false);
ok("§E the campaign tab's door is the campaign door", campDoor);
await host.type("#door-name", "Tabs Storyteller");
await host.click('[data-campaign-door="true"]');
ok("§E taking the campaign door seats the storyteller board's room",
  await waitText(host, "Storyteller:", 60000), (await pageText(host)).slice(0, 300));
await host.screenshot({ path: join(OUT, "06-campaign-board.png") });

await browser.close();
console.log(`\nROOM TABS DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
