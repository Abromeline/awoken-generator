// THE BACKPACK AT THE TABLE — THE SATCHEL IS REMOVED
// (Nigel, 2026-10-25 21:05, fork answered 21:43: "Remove
// the satchel and put the backpack ui for inventory locked
// on the right side of the screen. Flip the backpack
// horizontally though." — his chosen shape: the backpack
// stands PINNED AS A BUTTON on the right side, tap opens
// the inventory panel in place, tap again closes; the hand
// keeps a slim bottom row.)
// Boots the real server on a scratch DATA_DIR and proves
// the new furniture in a real browser, on the real
// surfaces:
//   §A THE SEATED ROW: a bound Tender's room stands; NO
//      satchel drawer, NO grab strip, NO tabs exist; her
//      standing stands in one slim in-flow row along the
//      bottom (party chips, energy, band); the dice open
//      and roll from the row; a click DEAD-CENTRE on the
//      map's + button ZOOMS (the grab-strip wart is dead —
//      the button is the top element at its own centre and
//      the stage's scale grows); the backpack pin stands
//      pinned at the right edge, a tap opens the Pack
//      panel, a second tap closes it.
//   §B THE BIND STRIP SPENDS FROM THE ROW: an unbound seat
//      finds the bind strip in the row, types a real code,
//      and the binding takes (the Bound word + the
//      Re-seat button stand in the row).
//   §C THE WATCHER'S ROAD STANDS WHOLE: the watcher's
//      plain footer is untouched by the removal.
//   §D THE DOOR COPY: the shipped Table bundle names the
//      bind strip's new home (the hand row) and nowhere
//      names the satchel as its place.
// Fixtures are the room-stands shapes: real Tenders by the
// real claim road, bound the way Discord binds.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-table-backpack.mjs
// (after npm run build:client — the server serves client/dist)
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-backpack-"));
process.env.PORT = "3967";
process.env.WORKSHOP_PASSWORD = "backpack-drive-word";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const PW = "backpack-password-1";
const BASE = "http://127.0.0.1:3967";
const ROOM_A = "backpack-drive-a";
const ROOM_B = "backpack-drive-b";
const OUT = "/home/hatch/workspace/table-backpack-proof";
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
  .run(name, category, power, toughness, `pack/${name}.png`, now).lastInsertRowid);
const mkAwokin = (ownerKey, ownerName, name, power) => {
  const comp = JSON.stringify([
    { source_id: `db:${part(name + " Body", "body", power, 5)}`, name: name + " Body", category: "body", rarity: "common", power, toughness: 5, element: "sky" },
    { source_id: `db:${part(name + " Arms", "arms", 0, 0)}`, name: name + " Arms", category: "arms", rarity: "common", power: 0, toughness: 0, element: "sky" },
    { source_id: `db:${part(name + " Head", "head", 0, 0)}`, name: name + " Head", category: "head", rarity: "common", power: 0, toughness: 0, element: "sky" },
  ]);
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, "pack/awokin.png", comp, ownerName, ownerKey, now).lastInsertRowid);
};

const { issueTableToken } = await import("../server/dist/table.js");
async function mkTender(name, exp, classKey, discId, bind) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, exp, Date.now());
  if (classKey) { mkAwokin(ownerKey, name, `${name} Wake One`, 2); mkAwokin(ownerKey, name, `${name} Wake Two`, 2); mkAwokin(ownerKey, name, `${name} Wake Three`, 2); }
  if (classKey) await call("chooseClass", { classKey }, claim.token);
  const tt = issueTableToken({ id: discId, name });
  if (bind) {
    const bindCode = (await call("getTableBindCode", {}, claim.token)).code;
    const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code: bindCode }) });
    if (!bindRes.ok) throw new Error("table/bind failed for " + name + ": " + bindRes.status);
  }
  return { token: claim.token, ownerKey, tt, name };
}

const A = await mkTender("Row Warden", 800, "warden", "disc-row-a", true);
const kin = mkAwokin(A.ownerKey, A.name, "Standskin", 2);
await call("addToParty", { awakenedId: kin }, A.token);
const B = await mkTender("Bind Bard", 800, "sage", "disc-row-b", false);
const bCode = (await call("getTableBindCode", {}, B.token)).code;
const C = { tt: issueTableToken({ id: "disc-row-c", name: "Unbound Guest" }), name: "Unbound Guest" };

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });

async function seatPage(sess, room) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  await page.evaluateOnNewDocument((s) => { window.__awokenTableSession = s; }, sess);
  await page.goto(BASE + "/table?frame_id=backpack-drive", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".table-room", { timeout: 30000 });
  await page.waitForSelector("footer.handzone", { timeout: 30000 });
  return { page, errors };
}

/* ══ §A THE SEATED ROW ═══════════════════════════════ */
{
  const { page, errors } = await seatPage({ authToken: A.tt, room: ROOM_A, name: A.name }, ROOM_A);
  await page.waitForFunction(() => (document.body.textContent ?? "").includes("Standskin"), { timeout: 20000 }).catch(() => {});
  const shape = await page.evaluate(() => {
    const footer = document.querySelector("footer.handzone");
    const rect = footer?.getBoundingClientRect();
    return {
      row: !!document.querySelector("footer.handzone.handrow"),
      drawer: !!document.querySelector(".handzone.drawer"),
      grab: !!document.querySelector(".hand-grab"),
      tabs: !!document.querySelector(".satchel-tabs"),
      position: footer ? getComputedStyle(footer).position : "(none)",
      height: rect ? Math.round(rect.height) : -1,
      energy: document.querySelector(".handrow-main .my-energy")?.textContent ?? "",
      chips: [...document.querySelectorAll(".handrow-chips .party-chip")].map((c) => c.textContent ?? ""),
      bound: document.querySelector(".handrow-bound")?.textContent ?? "",
      satchelWords: (document.body.textContent ?? "").includes("your satchel"),
    };
  });
  const pageErrors = errors.length;
  ok("the seated footer is the HAND ROW (.handzone.handrow stands)", shape.row);
  ok("NO satchel drawer exists in the room", !shape.drawer);
  ok("NO grab strip exists in the room", !shape.grab);
  ok("NO satchel tabs exist in the room", !shape.tabs);
  ok("the row stands in the room's flow — not fixed over the field", shape.position !== "fixed", shape.position);
  ok("the row is SLIM (one band along the bottom)", shape.height > 0 && shape.height <= 130, `height=${shape.height}`);
  ok("her energy stands in the row", shape.energy.includes("✦"), shape.energy);
  ok("her party stands in the row — Standskin's chip is there", shape.chips.some((c) => c.includes("Standskin")), shape.chips.join(" | "));
  ok("the bound company line stands in the row", shape.bound.includes("company of"), shape.bound);
  ok("no 'your satchel' wording stands anywhere on the page", !shape.satchelWords);
  ok("no page errors in the seated room", pageErrors === 0, errors.join(" | ").slice(0, 200));

  // Play from the row: the dice open and a roll is cast.
  await page.click(".handrow-main .dice-btn");
  let diceUp = true;
  try { await page.waitForSelector(".dice-pop", { timeout: 5000 }); } catch { diceUp = false; }
  ok("the dice open from the hand row", diceUp);
  if (diceUp) {
    await page.click(".dice-pop .die-btn");
    let diceGone = true;
    try { await page.waitForFunction(() => !document.querySelector(".dice-pop"), { timeout: 5000 }); } catch { diceGone = false; }
    ok("a die rolls from the row and the pop closes behind it", diceGone);
  }

  // The wart, dead: the + button is the top element at its
  // own centre, and a click there ZOOMS.
  const zoom = await page.evaluate(() => {
    const btn = document.querySelector('.stage-view-btns button[aria-label="Zoom the map in"]');
    if (!btn) return { found: false };
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    const g = [...document.querySelectorAll(".field-board svg g")].find((el) => (el.getAttribute("transform") ?? "").includes("scale"));
    return { found: true, cx, cy, topIsBtn: !!top && (top === btn || btn.contains(top)), before: g?.getAttribute("transform") ?? "" };
  });
  ok("the zoom-in button is found", zoom.found);
  ok("the + button is the TOP element at its own centre — nothing covers it", zoom.topIsBtn);
  if (zoom.found) {
    await page.mouse.click(zoom.cx, zoom.cy);
    await sleep(600);
    const after = await page.evaluate(() => {
      const g = [...document.querySelectorAll(".field-board svg g")].find((el) => (el.getAttribute("transform") ?? "").includes("scale"));
      return g?.getAttribute("transform") ?? "";
    });
    const scaleOf = (t) => { const m = /scale\(([-\d.]+)\)/.exec(t); return m ? parseFloat(m[1]) : NaN; };
    ok("a click dead-centre on + ZOOMS the stage", scaleOf(after) > scaleOf(zoom.before), `${zoom.before} -> ${after}`);
  }

  // The backpack: pinned at the right edge; tap opens, tap closes.
  // AMENDED 2026-10-25 (Nigel: "make the back pack 2 x bigger and
  // remove the red boarder"): the pin measures ~92×112, carries no
  // border, and the beacon pin stands clear above it.
  const pin = await page.evaluate(() => {
    const el = document.querySelector(".bag-pin");
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const beacon = document.querySelector(".beacon-pin");
    const br = beacon ? beacon.getBoundingClientRect() : null;
    return {
      found: true,
      rightGap: Math.round(window.innerWidth - (r.left + r.width)),
      cx: r.left + r.width / 2, cy: r.top + r.height / 2,
      w: Math.round(r.width), h: Math.round(r.height),
      borderW: cs.borderTopWidth,
      beaconFound: !!br,
      beaconClearAbove: br ? br.bottom <= r.top + 1 : false,
    };
  });
  ok("the backpack pin stands at the Table", pin.found);
  ok("the pin is LOCKED TO THE RIGHT SIDE (its right edge hugs the window's)", pin.rightGap >= 0 && pin.rightGap <= 24, `gap=${pin.rightGap}`);
  ok("the backpack stands TWICE THE SIZE (~92×112)", pin.w >= 90 && pin.w <= 94 && pin.h >= 110 && pin.h <= 114, `${pin.w}×${pin.h}`);
  ok("the backpack carries NO border (the red border is gone)", pin.borderW === "0px", `borderTopWidth=${pin.borderW}`);
  ok("the beacon pin stands CLEAR ABOVE the doubled backpack (no overlap)", pin.beaconFound && pin.beaconClearAbove);
  if (pin.found) {
    await page.mouse.click(pin.cx, pin.cy);
    let popUp = true;
    try { await page.waitForSelector(".bag-pop", { timeout: 5000 }); } catch { popUp = false; }
    ok("a tap on the backpack opens the Pack panel in place", popUp);
    if (popUp) {
      const popText = await page.evaluate(() => document.querySelector(".bag-pop")?.textContent ?? "");
      ok("the panel is the Pack — claim/give and her own inventory live there", popText.includes("The Pack"), popText.slice(0, 120));
      await page.mouse.click(pin.cx, pin.cy);
      let popGone = true;
      try { await page.waitForFunction(() => !document.querySelector(".bag-pop"), { timeout: 5000 }); } catch { popGone = false; }
      ok("a second tap on the backpack closes the panel", popGone);
    }
  }
  await page.screenshot({ path: `${OUT}/a-seated-hand-row.png` });
  await page.close();
}

/* ══ §B THE BIND STRIP SPENDS FROM THE ROW ═══════════ */
{
  const { page } = await seatPage({ authToken: C.tt, room: ROOM_B, name: C.name }, ROOM_B);
  let stripInRow = false;
  try {
    await page.waitForSelector("footer.handzone.handrow .bind-strip", { timeout: 20000 });
    stripInRow = true;
  } catch { /* stays false */ }
  ok("the bind strip stands IN THE HAND ROW for an unbound seat", stripInRow);
  if (stripInRow) {
    await page.type("footer.handzone .bind-strip input", bCode);
    const enabled = await page.evaluate(() => {
      const b = [...document.querySelectorAll("footer.handzone .bind-strip button")].find((x) => (x.textContent ?? "").includes("Bind my Tender"));
      return !!b && !b.disabled;
    });
    ok("the Bind button wakes with a whole code typed in the row", enabled);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("footer.handzone .bind-strip button")].find((x) => (x.textContent ?? "").includes("Bind my Tender"));
      b?.click();
    });
    let bound = true;
    try {
      await page.waitForFunction(() => (document.querySelector("footer.handzone")?.textContent ?? "").includes("Re-seat now"), { timeout: 15000 });
    } catch { bound = false; }
    const stripText = await page.evaluate(() => document.querySelector("footer.handzone .bind-strip")?.textContent ?? "");
    ok("the binding TAKES from the row — the Bound word stands", bound && stripText.includes("Bound"), stripText.slice(0, 160));
  }
  await page.screenshot({ path: `${OUT}/b-bind-strip-row.png` });
  await page.close();
}

/* ══ §C THE WATCHER'S ROAD STANDS WHOLE ══════════════ */
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
  await page.goto(BASE + "/table", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".table-door", { timeout: 30000 });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").includes("Watch instead"));
    b?.click();
  });
  let stands = true;
  try {
    await page.waitForSelector(".table-room", { timeout: 30000 });
    await page.waitForFunction(() => !!document.querySelector(".table-room svg polygon"), { timeout: 20000 });
  } catch { stands = false; }
  ok("the watcher still reaches a standing, painted room", stands);
  const w = await page.evaluate(() => ({
    plain: !!document.querySelector("footer.handzone.plain"),
    line: (document.querySelector(".watcher-line")?.textContent ?? "").includes("watching the Table"),
    drawer: !!document.querySelector(".handzone.drawer"),
    row: !!document.querySelector("footer.handzone.handrow"),
  }));
  ok("the watcher's plain footer stands as it stood", w.plain && w.line, JSON.stringify(w));
  ok("the watcher wears neither drawer nor hand row", !w.drawer && !w.row);
  await page.screenshot({ path: `${OUT}/c-watcher.png` });
  await page.close();
}

/* ══ §D THE DOOR COPY ════════════════════════════════ */
{
  const html = await (await fetch(BASE + "/table")).text();
  const assets = [...html.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map((m) => m[1]);
  let bundle = "";
  for (const a of assets) bundle += await (await fetch(BASE + a)).text();
  const tableChunkName = /TableApp-[A-Za-z0-9_-]+\.js/.exec(bundle)?.[0];
  if (tableChunkName) bundle += await (await fetch(`${BASE}/assets/${tableChunkName}`)).text();
  ok("the shipped Table bundle names the bind strip's new home — the hand row along the room's bottom",
    bundle.includes("the bind strip in the hand row along the room's bottom"));
  ok("the shipped Table bundle nowhere names the satchel as the bind strip's place",
    !bundle.includes("in your satchel"));
}

await browser.close();
console.log(`\ndrive-table-backpack: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
