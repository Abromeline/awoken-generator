// STAND-IN BINDINGS — BIND THEM ALL — DRIVE (Nigel's tap,
// 2026-10-24 23:40: "Bind them all — the three enemy faces
// and the six workings' faces"). Boots the real server on a
// scratch DATA_DIR and proves, on the real work:
//   §B THE BOOK OF RECORD: the served Grimoire carries the
//      binding in its own data — six glyph records whose
//      assetKey names each working's face, and the six
//      pages' glyphId bound to them; the still-owed pages
//      (Heal, Twin Trees) stand untouched.
//   §M THE STORED BOOK MIGRATES: a pre-binding book in
//      ui_config gains the records and the bindings on
//      refresh — and a page Nigel has re-pointed by hand
//      KEEPS his pointing.
//   §S THE SOURCE: every face map the game keeps consumes
//      the one binding (workingFaces.ts), and the homeland
//      map draws each wanderer through the kind-true face.
//   §E THE ENEMY FACES stand on the live homeland map: one
//      wanderer of each kind, each wearing its OWN art —
//      the Fray its walk, the Hollow, Unraveler and Tangle
//      their bundled stills; no kind wears another's face.
//   §W THE SIX FACES ON THE WHEEL: each of the six discs
//      shows an <img> of its own art — no ✦ stands where a
//      bound face belongs.
//   §P THE SIX FACES IN THE BOOK: each page's rune wears
//      its own art through the gold mask; none of the six
//      opens on the owed frame. Heal and the Twin Trees
//      still open owed (Class B — not in Nigel's tap).
//   §O THE ORBS (Nigel's markup, 2026-10-25 13:24; the
//      form corrected 23:43): EVERY workings page of the
//      book carries five small attunement orbs — one per
//      element, a glowing number over each — and neither
//      the struck slots row nor a fill bar stands anywhere.
//   §F THE ORBS AT WORK: a tap on a page's orb deepens
//      that element on that page (the served ledger and
//      the pool agree after); a page outside the old
//      four-page set (Bats) now attunes at the door; a
//      refused tap (empty pool) answers in the door's
//      words and spends nothing; a full page refuses too.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache \
//      node scripts/drive-standin-bindings.mjs
import { join } from "node:path";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const shaOf = (buf) => createHash("sha256").update(buf).digest("hex");
const fileSha = (p) => shaOf(readFileSync(p));
const servedSha = async (url) => {
  const res = await fetch(url.startsWith("http") ? url : BASE + url);
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  return shaOf(Buffer.from(await res.arrayBuffer()));
};
/** The six faces' TRUE bytes, from the source art itself. */
const FACE_SHA = {
  shardrain: fileSha("client/src/assets/effects/shard-rain.gif"),
  bats: fileSha("client/src/assets/effects/bats/bats-35.png"),
  holdrune: fileSha("client/src/assets/effects/hold-rune/hold-rune-33.png"),
  shatter: fileSha("client/src/assets/effects/shatter/shatter-piece-2.png"),
  bulwark: fileSha("client/src/assets/effects/bulwark-shield.png"),
  blackgate: fileSha("client/src/assets/effects/black-gate.png"),
};
const ENEMY_SHA = Object.fromEntries(["fray", "hollow", "unraveler", "tangle"].map((k) => [k, fileSha(`client/src/assets/enemies/${k}.png`)]));
const FRAY_FRAME_SHAS = new Set([1, 2, 3, 4, 5].map((i) => fileSha(`client/src/assets/enemies/fray-walk/fray-walk-${i}.png`)));

const puppeteer = createRequire("/home/hatch/workspace/tools-chrome/package.json")("puppeteer");
const OUT = "/home/hatch/workspace/standin-bindings-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(OUT, "data-"));
process.env.PORT = "3996";
process.env.WORKSHOP_PASSWORD = "standin-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;
process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3996";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

/* ══ §S THE SOURCE ═══════════════════════════════════════ */
console.log("§S the source — one binding, consumed everywhere");
{
  const faces = readFileSync("client/src/workingFaces.ts", "utf8");
  for (const key of ["shardrain", "bats", "holdrune", "shatter", "bulwark", "blackgate"]) {
    ok(`workingFaces binds ${key}`, new RegExp(`${key}:`).test(faces));
  }
  ok("shard rain's face is its own gif", faces.includes("ANIMATED_GLYPH.shardrain"));
  ok("bats' face is a still of its own swarm (frame 35)", faces.includes("BATS_FRAMES[34]"));
  ok("the hold rune's face is its formed rune (slot 33)", faces.includes("HOLD_RUNE_FRAMES[32]"));
  ok("shatter's face is the greatest of its pieces (piece 2)", faces.includes("SHATTER_PIECES[1]"));
  const terr = readFileSync("client/src/Territory.tsx", "utf8");
  ok("the homeland map draws each wanderer through the kind-true face", terr.includes("<EnemyFaceSvgImage kind={w.kind}"));
  ok("the homeland wheel's face map consumes the binding", terr.includes("...WORKING_FACE"));
  ok("the wheel's working branches are windowed, not cut (the More step stands)", terr.includes("spells-more-") && !terr.includes("kindSpells.slice(0, 6)"));
  const zod = readFileSync("client/src/Zodiac.tsx", "utf8");
  ok("the book's face map consumes the binding", zod.includes("...WORKING_FACE"));
  const tab = readFileSync("client/src/Table.tsx", "utf8");
  ok("the Table's face map consumes the binding", tab.includes("...WORKING_FACE"));
  ok("the Table's defs fall to the binding when a served page stands unbound", tab.includes(": (GLYPHS[sp.key] ?? null)"));
  const ws = readFileSync("client/src/UIWorkspace.tsx", "utf8");
  ok("the workshop's glyph map consumes the binding", ws.includes("...WORKING_FACE"));
  const ef = readFileSync("client/src/EnemyFace.tsx", "utf8");
  ok("the kind-true SVG face resolves non-Fray kinds by enemyImgFor", ef.includes("enemyImgFor(kind, art)"));
  ok("the Fray still walks on the SVG road", ef.includes('kind === "fray"'));
  const grim = readFileSync("server/src/grimoire.ts", "utf8");
  ok("the book's data carries the binding (BOUND_FACE_KEYS)", grim.includes("BOUND_FACE_KEYS") && grim.includes("spell.glyphId = glyphId"));
}

/* ══ server boot + the book of record ══════════════════ */
await import("../server/dist/index.js");
await sleep(2500);

async function call(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return data?.data ?? data;
}
/** The same door, unthrown: status + body, for refusals. */
async function callRaw(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, body: data };
}
const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* fresh-DB stand-up */ }

const claim = await call("claimTender", { password: "standin-drive-password", tenderName: "Binding Tender" });
const token = claim.token;
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
const ownerKey = `tender:${tenderId}`;
const now = Date.now();
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = excluded.energy").run(ownerKey, now);
db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ? WHERE owner_key = ?").run(now, ownerKey);

function seedAwokin(name, element) {
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 2, 2, ?, ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, element, `standin/${name}-${cat}.png`, now).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: 2, toughness: 2, element });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `standin/${name}.png`, JSON.stringify(parts), "Binding Tender", ownerKey, now).lastInsertRowid);
}
for (let i = 0; i < 3; i++) seedAwokin(`Binding Wake ${i + 1}`, "root");
await call("chooseClass", { classKey: "warden" }, token);
// §F's purse: a root pool to spend from (200 pts); every
// other pool stands empty, for the refusal proof.
db.prepare("INSERT INTO aspect_attunement (owner_key, element, points, updated_at) VALUES (?, 'root', 200, ?)").run(ownerKey, now);

/* ══ §B THE BOOK OF RECORD ═══════════════════════════════ */
console.log("§B the book of record — the binding in the served data");
const SIX = [
  ["shardrain", "spell"], ["bats", "spell"], ["holdrune", "rune"],
  ["shatter", "spell"], ["bulwark", "ward"], ["blackgate", "ward"],
];
{
  const book = await call("getGrimoire", {}, token);
  ok("the book carries seventeen glyph records (eleven drawn + six bound)", book.glyphs.length === 17, `glyphs=${book.glyphs.length}`);
  for (const [key, kind] of SIX) {
    const spell = book.spells.find((s) => s.key === key);
    const glyph = book.glyphs.find((g) => g.id === `glyph-${key}`);
    ok(`${key}: the page is bound to its own glyph record`, spell?.glyphId === `glyph-${key}`, `glyphId=${spell?.glyphId}`);
    ok(`${key}: the record names the working's own face by assetKey`, !!glyph && glyph.assetKey === key && glyph.imageUrl === null && glyph.builtin === true && glyph.sort === kind && glyph.spellKey === key,
      JSON.stringify(glyph));
  }
  const heal = book.spells.find((s) => s.key === "heal");
  const trees = book.spells.find((s) => s.key === "trees");
  ok("Heal still stands owed (Class B — not in the tap)", heal?.glyphId === null, `heal glyphId=${heal?.glyphId}`);
  ok("the Twin Trees' standing is untouched (its pre-existing glyph-trees record, whose page the book opens owed by Nigel's ruling)",
    trees?.glyphId === "glyph-trees", `trees glyphId=${trees?.glyphId}`);
}

/* ══ §M THE STORED BOOK MIGRATES ════════════════════════ */
console.log("§M a stored pre-binding book takes the binding on refresh");
{
  const G = await import("../server/dist/grimoire.js");
  const served = await call("getGrimoire", {}, token);
  const old = JSON.parse(JSON.stringify(served));
  old.glyphs = old.glyphs.filter((g) => !SIX.some(([k]) => g.id === `glyph-${k}`));
  for (const s of old.spells) if (SIX.some(([k]) => s.key === k)) s.glyphId = null;
  // A page Nigel re-pointed by hand: Bats wears the Seal's
  // glyph in this stored book — his pointing must survive.
  old.spells.find((s) => s.key === "bats").glyphId = "glyph-08";
  db.prepare("INSERT INTO ui_config (key, value, updated_at) VALUES ('grimoire.state', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify(old), now);
  await G.refreshGrimoire();
  const migrated = G.grimoireNow();
  ok("the six records are appended to the stored book", SIX.every(([k]) => migrated.glyphs.some((g) => g.id === `glyph-${k}` && g.assetKey === k)),
    `glyphs=${migrated.glyphs.length}`);
  ok("the unbound five take the binding", ["shardrain", "holdrune", "shatter", "bulwark", "blackgate"].every((k) => migrated.spells.find((s) => s.key === k)?.glyphId === `glyph-${k}`));
  ok("the hand-pointed page KEEPS Nigel's pointing (Bats still wears glyph-08)", migrated.spells.find((s) => s.key === "bats")?.glyphId === "glyph-08",
    `bats glyphId=${migrated.spells.find((s) => s.key === "bats")?.glyphId}`);
  const servedAgain = await call("getGrimoire", {}, token);
  ok("the API serves the migrated book", servedAgain.glyphs.length === 17 && servedAgain.spells.find((s) => s.key === "shardrain")?.glyphId === "glyph-shardrain");
}

/* ══ THE WORLD: tiles + one wanderer of each kind ════════ */
const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', ?, ?)");
const tileId = new Map();
for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
  if (hexDist({ q, r }, { q: 0, r: 0 }) > 4) continue;
  tileId.set(`${q},${r}`, Number(insTile.run(ownerKey, q, r, 0, now).lastInsertRowid));
}
const stillIv = setInterval(() => {
  try { db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ?, wanderer_settled_beats = 0 WHERE owner_key = ?").run(Date.now(), ownerKey); } catch { /* ending */ }
}, 4000);

/* ══ OPEN THE LAND ═══════════════════════════════════════ */
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
await page.evaluateOnNewDocument((tok) => { window.localStorage.setItem("awoken-tender-token", tok); }, token);
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
await sleep(2500);
const door = await page.$(".deck-button");
if (!door) throw new Error("no .deck-button on the home face");
await door.click();
await page.waitForFunction(() => !!window.__tenderJump && !!window.__tenderJump.pos(), { timeout: 30000 });
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Skip");
  if (b) b.click();
});
await sleep(1000);
for (let i = 0; i < 3; i++) {
  const stood = await page.evaluate(() => !!document.querySelector(".return-report-overlay"));
  if (!stood) break;
  await page.mouse.click(24, 24);
  await sleep(300);
}
await page.evaluate(() => {
  const p = document.querySelector(".admin-popup");
  if (p) p.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
});
await sleep(300);

/* ══ §E THE ENEMY FACES ON THE MAP ═══════════════════════ */
console.log("§E the enemy faces on the live homeland map");
{
  const insW = db.prepare(`INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, last_strike_at)
    VALUES (?, ?, ?, ?, 100000, ?, ?, 1, 1, 0)`);
  insW.run(ownerKey, tileId.get("2,0"), "fray", now, 2, 0);
  insW.run(ownerKey, tileId.get("0,2"), "hollow", now, 0, 2);
  insW.run(ownerKey, tileId.get("-2,1"), "unraveler", now, -2, 1);
  insW.run(ownerKey, tileId.get("1,-2"), "tangle", now, 1, -2);
  const read = await call("getTerritory", {}, token);
  ok("the engine serves one wanderer of each kind", ["fray", "hollow", "unraveler", "tangle"].every((k) => (read.wanderers ?? []).some((w) => w.kind === k)),
    JSON.stringify((read.wanderers ?? []).map((w) => w.kind)));
  let faces = null;
  for (let i = 0; i < 20; i++) {
    await sleep(700);
    faces = await page.evaluate(() => [...document.querySelectorAll("image")].map((im) => im.getAttribute("href") || ""));
    const stems = faces.filter((h) => /fray-walk-|hollow-|unraveler-|tangle-/.test(h));
    if (stems.length >= 4) break;
  }
  const enemyFaces = (faces ?? []).filter((h) => /fray-walk-|hollow-|unraveler-|tangle-/.test(h));
  ok("exactly four enemy faces stand on the map (one per wanderer)", enemyFaces.length === 4, JSON.stringify(enemyFaces));
  // THE TRUE ART, byte for byte: what the map serves for
  // each face against Nigel's bundled files themselves.
  const provenKinds = new Set();
  for (const href of enemyFaces) {
    const sha = await servedSha(href);
    if (FRAY_FRAME_SHAS.has(sha)) provenKinds.add("fray (walk frame, byte-true)");
    for (const k of ["hollow", "unraveler", "tangle"]) if (ENEMY_SHA[k] === sha) provenKinds.add(k);
  }
  ok("the Fray wears its walk — a true frame of the cycle, byte for byte", [...provenKinds].some((k) => k.startsWith("fray")), [...provenKinds].join(","));
  ok("the Hollow wears its OWN bundled face, byte for byte", provenKinds.has("hollow"), [...provenKinds].join(","));
  ok("the Unraveler wears its OWN bundled face, byte for byte", provenKinds.has("unraveler"), [...provenKinds].join(","));
  ok("the Tangle wears its OWN bundled face, byte for byte", provenKinds.has("tangle"), [...provenKinds].join(","));
  await page.screenshot({ path: `${OUT}/01-enemy-faces-on-the-map.png` });
}

/* ══ §W THE SIX FACES ON THE WHEEL ═══════════════════════ */
console.log("§W the six faces on the homeland wheel");
const clickDisc = async (sel, txt) => {
  const handle = await page.evaluateHandle((q, t) => [...document.querySelectorAll(q)].find((d) => ((d.getAttribute("aria-label") || "") + " " + (d.textContent || "")).includes(t)), sel, txt);
  const el = handle.asElement();
  if (!el) throw new Error("wheel disc not found: " + txt);
  const box = await el.boundingBox();
  if (!box) throw new Error("wheel disc has no box: " + txt);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};
{
  await page.mouse.click(700, 450, { button: "right" });
  await page.waitForSelector(".gw-wheel", { timeout: 9000 });
  const WHEEL_FACES = [
    ["Spell", "Shard Rain", "shardrain"],
    ["Spell", "Bats", "bats"],
    ["Spell", "Rune Shatter", "shatter"],
    ["Rune", "Hold Rune", "holdrune"],
    ["Ward", "Bulwark", "bulwark"],
    ["Ward", "Black Gate", "blackgate"],
  ];
  const shotFor = { Spell: "02-wheel-spell-branch.png", Rune: "03-wheel-rune-branch.png", Ward: "04-wheel-ward-branch.png" };
  const readDiscs = () => page.evaluate(() => [...document.querySelectorAll(".gw-disc")].map((d) => ({
    label: (d.getAttribute("aria-label") || "") + " " + (d.textContent || ""),
    img: d.querySelector("img")?.getAttribute("src") || null,
    text: d.textContent || "",
  })));
  for (const branch of ["Spell", "Rune", "Ward"]) {
    await clickDisc(".gw-disc.cat", branch);
    await sleep(900);
    // Walk the branch's windows by its More step until
    // every face this branch owes stands in a window —
    // the discs of every window walked are kept together
    // (a face in window 1 is not lost by walking to 2).
    const targets = WHEEL_FACES.filter(([bb]) => bb === branch);
    let discs = await readDiscs();
    for (let w = 0; w < 3 && !targets.every(([, name]) => discs.some((d) => d.label.includes(name))); w++) {
      const more = discs.find((d) => d.label.includes("More ·"));
      if (!more) break;
      await clickDisc(".gw-disc", "More ·");
      await sleep(700);
      const next = await readDiscs();
      for (const d of next) if (!discs.some((x) => x.label === d.label)) discs.push(d);
    }
    console.log(`  [${branch} branch discs]`, JSON.stringify(discs.map((d) => d.label.trim().slice(0, 42))));
    for (const [b, name, key] of targets) {
      const disc = discs.find((d) => d.label.includes(name));
      ok(`${name}: its wheel disc stands in the ${branch} branch`, !!disc, JSON.stringify(discs.map((d) => d.label)));
      if (disc) {
        ok(`${name}: the disc wears a face (no ✦ stands in its place)`, !!disc.img, `text=${disc.text.slice(0, 40)}`);
        if (disc.img) {
          ok(`${name}: the wheel face is the working's TRUE art, byte for byte`, (await servedSha(disc.img)) === FACE_SHA[key], `img=${disc.img}`);
        }
      }
    }
    await page.screenshot({ path: `${OUT}/${shotFor[branch]}` });
  }
  await page.keyboard.press("Escape");
  await sleep(400);
}

/* ══ §P THE SIX FACES IN THE BOOK ════════════════════════ */
console.log("§P the six faces in the Spellbook");
{
  const back = await page.$(".deck-button");
  await back.click();
  await sleep(1200);
  const fab = await page.$(".tree-fab");
  if (!fab) throw new Error("no .tree-fab on the home face");
  await fab.click();
  await sleep(1500);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Grimoire");
    if (b) b.click();
  });
  await sleep(1200);
  // RESTATED TO THE BOOK'S SHAPE (the Grimoire rebuilt as
  // a book, 2026-10-25): the book stands OPEN — two facing
  // leaves to a spread — so a page is read within ITS OWN
  // leaf (found by the page's name), never as the only
  // rune on the screen as the old card kept it. The same
  // assertions stand: the page stands, it is not owed, and
  // its face is the working's true art byte for byte —
  // plus the rebuild's own law: the face stands WHOLE
  // within its page frame, inside the leaf's bounds.
  const readPage = async (name) => page.evaluate((n) => {
    const leaves = [...document.querySelectorAll(".book-leaf")];
    // A page's served name may carry its line ("Heal — the
    // Binding Light") and its article ("The Twin Trees"):
    // match on the name's root, never a substring.
    const root = (t) => t.replace(/^The /, "").split(" — ")[0].trim();
    const leaf = leaves.find((l) => root((l.querySelector(".book-name")?.textContent || "").trim()) === root(n));
    const rune = leaf?.querySelector(".book-rune");
    if (!rune) return null;
    const st = rune.getAttribute("style") || "";
    const rr = rune.getBoundingClientRect(), lr = leaf.getBoundingClientRect();
    const contained = rr.left >= lr.left - 1 && rr.right <= lr.right + 1 && rr.top >= lr.top - 1 && rr.bottom <= lr.bottom + 1;
    return { cls: rune.className, style: st, owed: rune.classList.contains("owed"), contained, leaves: leaves.length, covered: !!document.querySelector(".book-cover") };
  }, name);
  const openPage = async (chapter, name) => {
    await page.evaluate((c) => {
      const b = [...document.querySelectorAll('[role="tab"]')].find((x) => x.textContent.trim() === c);
      if (b) b.click();
    }, chapter);
    await sleep(700);
    const clicked = await page.evaluate((n) => {
      const pip = [...document.querySelectorAll(".book-pip")].find((x) => (x.getAttribute("aria-label") || "").includes(n));
      if (pip) { pip.click(); return true; }
      return false;
    }, name);
    if (!clicked) throw new Error("no book pip for " + name);
    await sleep(700);
    return readPage(name);
  };
  const BOOK_FACES = [
    ["Spells", "Shard Rain", "shardrain", "05-book-shard-rain.png"],
    ["Spells", "Bats", "bats", "06-book-bats.png"],
    ["Spells", "Rune Shatter", "shatter", "07-book-rune-shatter.png"],
    ["Runes/Wards", "Hold Rune", "holdrune", "08-book-hold-rune.png"],
    ["Runes/Wards", "Bulwark", "bulwark", "09-book-bulwark.png"],
    ["Runes/Wards", "Black Gate", "blackgate", "10-book-black-gate.png"],
  ];
  for (const [chapter, name, key, shot] of BOOK_FACES) {
    const p = await openPage(chapter, name);
    ok(`${name}: its page stands in the book`, !!p);
    if (p) {
      ok(`${name}: the book stands open — a cover over two facing leaves`, p.covered && p.leaves === 2, `leaves=${p.leaves} covered=${p.covered}`);
      ok(`${name}: its face stands whole within its page frame`, p.contained, `cls=${p.cls}`);
      const url = /url\("([^"]+)"\)/.exec(p.style)?.[1] ?? null;
      ok(`${name}: the page is not owed — its face stands in the gold mask`, !!url && !p.owed, `style=${p.style.slice(0, 160)} cls=${p.cls}`);
      if (url) {
        ok(`${name}: the book face is the working's TRUE art, byte for byte`, (await servedSha(url)) === FACE_SHA[key], `url=${url}`);
      }
    }
    await page.screenshot({ path: `${OUT}/${shot}` });
  }
  const heal = await openPage("Spells", "Heal");
  ok("Heal still opens on the owed frame (Class B — untouched)", !!heal && heal.owed, JSON.stringify(heal));
  const trees = await openPage("Runes/Wards", "Twin Trees");
  ok("the Twin Trees still opens on the owed frame (Class B — untouched)", !!trees && trees.owed, JSON.stringify(trees));
}

/* ══ §O THE ORBS ON EVERY PAGE ══════════════════════════ */
console.log("§O the attunement orbs — every workings page carries them");
const rootOf = (t) => t.replace(/^The /, "").split(" — ")[0].trim();
const readOrbs = async (name) => page.evaluate((n) => {
  const root = (t) => t.replace(/^The /, "").split(" — ")[0].trim();
  const leaf = [...document.querySelectorAll(".book-leaf")].find((l) => root((l.querySelector(".book-name")?.textContent || "").trim()) === root(n));
  if (!leaf) return { found: false };
  return {
    found: true,
    orbs: [...leaf.querySelectorAll(".attune-orb")].map((b) => ({ el: b.getAttribute("data-element"), num: (b.querySelector(".attune-orb-num")?.textContent || "").trim() })),
    slotsRow: !!leaf.querySelector(".book-slots"),
    fillBar: [...leaf.querySelectorAll("button")].some((b) => (b.textContent || "").includes("— fill ·")),
  };
}, name);
const openBookPage = async (chapter, name) => {
  await page.evaluate((c) => {
    const b = [...document.querySelectorAll('[role="tab"]')].find((x) => x.textContent.trim() === c);
    if (b) b.click();
  }, chapter);
  await sleep(700);
  const clicked = await page.evaluate((n) => {
    const pip = [...document.querySelectorAll(".book-pip")].find((x) => (x.getAttribute("aria-label") || "").includes(n));
    if (pip) { pip.click(); return true; }
    return false;
  }, name);
  if (!clicked) throw new Error("no book pip for " + name);
  await sleep(700);
  return readOrbs(name);
};
const chapterOf = (s) => (s.kind === "spell" || s.kind === "binding" ? "Spells" : "Runes/Wards");
const bookNow = await call("getGrimoire", {}, token);
const FIVE = ["root", "tide", "sky", "stone", "fire"];
{
  ok("the book serves its workings pages for the orb walk", bookNow.spells.length >= 17, `spells=${bookNow.spells.length}`);
  for (const s of bookNow.spells) {
    const r = await openBookPage(chapterOf(s), rootOf(s.name));
    ok(`${s.name}: its page stands for the orb walk`, r.found, JSON.stringify(r));
    if (!r.found) continue;
    ok(`${s.name}: five orbs stand under the working — one per element`, r.orbs.length === 5 && FIVE.every((el) => r.orbs.some((o) => o.el === el)), JSON.stringify(r.orbs));
    ok(`${s.name}: every orb carries a number — the ledger's depth (all bare at first)`, r.orbs.every((o) => o.num === "0"), JSON.stringify(r.orbs));
    ok(`${s.name}: the struck forms are gone — no slots row, no fill bar`, !r.slotsRow && !r.fillBar, JSON.stringify(r));
  }
}

/* ══ §F THE ORBS AT WORK ════════════════════════════════ */
console.log("§F the orbs at work — taps deepen, refusals speak, nothing half-spends");
const poolOf = (el) => db.prepare("SELECT points FROM aspect_attunement WHERE owner_key = ? AND element = ?").get(ownerKey, el)?.points ?? 0;
{
  const seal = bookNow.spells.find((s) => s.key === "seal");
  // A BROWSER TAP on the Seal's root orb (a page of the old
  // standing set, deepened through the new form).
  await openBookPage(chapterOf(seal), rootOf(seal.name));
  const leafHandle = await page.evaluateHandle((n) => {
    const root = (t) => t.replace(/^The /, "").split(" — ")[0].trim();
    return [...document.querySelectorAll(".book-leaf")].find((l) => root((l.querySelector(".book-name")?.textContent || "").trim()) === root(n)) ?? null;
  }, rootOf(seal.name));
  const leafEl = leafHandle.asElement();
  ok("the Seal's leaf stands for the tap", !!leafEl);
  const orb = await leafEl.$('.attune-orb[data-element="root"]');
  ok("the Seal's root orb stands in its leaf", !!orb);
  await orb.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await sleep(300);
  await orb.click();
  let after = null;
  for (let i = 0; i < 16; i++) { await sleep(500); after = await readOrbs(rootOf(seal.name)); if (after?.orbs?.find((o) => o.el === "root")?.num === "1") break; }
  ok("the tap deepened the Seal in root — the orb's glowing number now reads 1", after?.orbs?.find((o) => o.el === "root")?.num === "1", JSON.stringify(after?.orbs));
  const led1 = (await call("getGrimoire", {}, token)).pageAttunements ?? {};
  ok("the served ledger agrees: the Seal holds one root slot", led1.seal?.root === 1, JSON.stringify(led1.seal));
  ok("the pool paid the standing price — 4 of its 200 root points", poolOf("root") === 196, `root=${poolOf("root")}`);

  // A PAGE OUTSIDE THE OLD SET attunes at the door (Bats —
  // its engine stood refused as a non-attunement page).
  const batsR = await call("attuneGrimoirePage", { spellKey: "bats", element: "root" }, token);
  ok("Bats attunes at the door — 4 spent, one root slot stands", batsR.spent === 4 && batsR.inElement === 1 && batsR.filled === 1, JSON.stringify(batsR));
  const led2 = (await call("getGrimoire", {}, token)).pageAttunements ?? {};
  ok("the served ledger agrees: Bats holds one root slot", led2.bats?.root === 1, JSON.stringify(led2.bats));
  ok("the pool paid again — 192 root points stand", poolOf("root") === 192, `root=${poolOf("root")}`);

  // A REFUSED TAP: the sky pool is empty — the door answers
  // in its words and spends nothing.
  const refusal = await callRaw("attuneGrimoirePage", { spellKey: "bats", element: "sky" }, token);
  ok("the empty-pool tap is refused in the door's words", refusal.status !== 200 && String(refusal.body?.error ?? "").includes("costs 4 sky points") && String(refusal.body?.error ?? "").includes("Nothing was spent"), JSON.stringify(refusal));
  const led3 = (await call("getGrimoire", {}, token)).pageAttunements ?? {};
  ok("the refusal spent nothing and laid nothing", poolOf("sky") === 0 && !(led3.bats?.sky > 0), `sky=${poolOf("sky")} bats=${JSON.stringify(led3.bats)}`);

  // THE PAGE'S ROOM: fill the Seal to its eight at the door,
  // then the next tap refuses — in words, spending nothing.
  let lastFill = null;
  for (let i = 0; i < 7; i++) lastFill = await call("attuneGrimoirePage", { spellKey: "seal", element: "root" }, token);
  ok("the Seal fills to its eight slots at the door", lastFill?.filled === 8, JSON.stringify(lastFill));
  const full = await callRaw("attuneGrimoirePage", { spellKey: "seal", element: "root" }, token);
  ok("a full page refuses in the door's words", full.status !== 200 && String(full.body?.error ?? "").includes("eight slots all stand filled"), JSON.stringify(full));
  ok("the full-page refusal spent nothing — 164 root points stand", poolOf("root") === 164, `root=${poolOf("root")}`);
}

clearInterval(stillIv);
await browser.close();
console.log(`\ndrive-standin-bindings: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
