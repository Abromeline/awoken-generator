// test54 — WIELD ON THE WIRE, THE WEAPON CONTRACT AT THE
// REFEREE, AND MANIFEST (Phase C, Table stream 1):
// (a) a mid-room wield switch sword→spear: a foe parked
//     between sword range (69px) and spear range (138px) is
//     untouchable by the sword, then struck by the spear —
//     the strike ledger's own spans prove the reach, and the
//     switch persists to tender_progress.weapon_key;
// (b) ATTUNEMENT REACH: a sky-attuned sword (depth ≥ 1)
//     strikes at sky's reach (276px) — a foe ~3.5 hexes out
//     falls under it; the same sword re-attuned to stone
//     (reach 1 hex) cannot touch that foe, but strikes at
//     1 hex — the control closes the proof;
// (c) WEAPON LEVEL (+ (e) KEEN): three solo sword rooms in
//     parallel — plain Lv 1, Lv 3, and Lv 1 + the KEEN
//     signature — driven through wave after wave. Damage is
//     accounted per foe from the state's own hp ledger:
//     counted damage (every hp a foe provably lost, the
//     killing blow counted at its remaining hp) divided by
//     attributed hit strikes, over foes that provably died.
//     Lv 3's mean must clear Lv 1's by ≥0.5, KEEN's by ≥0.4.
// (d) MANIFEST: a quiet-room cast costs exactly ⚡4 and files
//     manifests:[{ownerKey, weaponKey, count:1, expiresAt}]
//     ~20s out; in battle the copies strike on their own
//     (copy:true) while the original strikes too; no copy
//     strike lands after expiry (read off the strikes' own
//     server `at` against the filed expiresAt — the expiry
//     proof waits the real 20s out); a second cast with the
//     Manifest node seeded files count:2 — and a wield
//     switch dismisses live copies in the same state push.
// (e) PIERCE: an arrow without its signature strikes one foe
//     per beat (grouped by the strikes' `at`); with the
//     signature seeded and the arrow re-wielded, one beat
//     carries two arrow strikes to two distinct foes, the
//     second flagged pierce:true.
import WebSocket from "ws";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

const DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-test54-"));
process.env.DATA_DIR = DATA_DIR;
process.env.PORT = "39978";
process.env.WORKSHOP_PASSWORD = "test54-word";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

await import("../server/dist/index.js");
await sleep(2500);
const base = "http://127.0.0.1:39978";
const db = new Database(join(DATA_DIR, "app.db"));
// The weapon contract's node columns are the menu stream's to
// land; if this scratch server predates them, stand them up
// here so the rows below can carry the nodes either way.
try { db.exec("ALTER TABLE tender_weapons ADD COLUMN manifest_node INTEGER NOT NULL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE tender_weapons ADD COLUMN signature_node INTEGER NOT NULL DEFAULT 0"); } catch {}

// ── The map's math (the contract's iso centers) ───────────
const U = [1292 * 40 / 796, 470 * 40 / 796], V = [0, 948 * 40 / 796];
const parseId = (id) => id.split(",").map(Number);
const centerOf = (id) => {
  const [q, r] = parseId(id);
  return { x: q * U[0] + r * V[0], y: q * U[1] + r * V[1] };
};
const pxDist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const SEED_CTR = { x: 0, y: 0 };

const meIn = (c) => c.state.players.find(p => p.key === c.you.key);

function client(label) {
  const ws = new WebSocket("ws://127.0.0.1:39978/table/ws");
  const c = { label, ws, state: null, you: null, errors: [], allStrikes: [], strikeIds: new Set(), onState: [] };
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "state") {
      c.state = m.state; c.you = m.you;
      c.stateAt = Date.now(); // the receipt stamp — server and harness share the host clock (the expiry proof reads it)
      for (const s of m.state.strikes ?? []) {
        if (!c.strikeIds.has(s.id)) { c.strikeIds.add(s.id); c.allStrikes.push({ ...s, seenAt: Date.now() }); }
      }
      for (const fn of c.onState) { try { fn(c); } catch (e) { console.log(`  (onState ${label}: ${e.message})`); } }
    }
    if (m.type === "error" || m.type === "joinError") c.errors.push(m.message);
  });
  c.send = (msg) => ws.send(JSON.stringify(msg));
  c.join = (join) => new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error(`${label}: join timeout`)), 8000);
    ws.on("open", () => {
      c.send({ type: "join", ...join });
      const iv = setInterval(() => { if (c.state) { clearInterval(iv); clearTimeout(to); resolve(); } }, 100);
    });
  });
  c.waitFor = async (fn, what, timeout = 30000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (c.state && fn(c)) return true;
      await sleep(200);
    }
    throw new Error(`${label}: timed out waiting for ${what}`);
  };
  return c;
}

async function call(action, args, token, expectFail = false) {
  const res = await fetch(`${base}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!expectFail && !res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return { status: res.status, data };
}

/** Seed one weapon row on the contract: level, attunement, nodes. */
function seedWeaponRow(ownerKey, weaponKey, { level = 1, element = null, depth = 0, manifest = 0, signature = 0 } = {}) {
  db.prepare(`INSERT INTO tender_weapons (owner_key, weapon_key, level, xp, attunement_element, attunement_depth, manifest_node, signature_node)
    VALUES (?, ?, ?, 0, ?, ?, ?, ?)
    ON CONFLICT(owner_key, weapon_key) DO UPDATE SET level = excluded.level, attunement_element = excluded.attunement_element,
      attunement_depth = excluded.attunement_depth, manifest_node = excluded.manifest_node, signature_node = excluded.signature_node`)
    .run(ownerKey, weaponKey, level, element, depth, manifest, signature);
}

/** A bound Tender, seated through the in-process door
 *  (test52's claiming + seeding + bind), Lv 10 by EXP so the
 *  bare-Tender blows and the curse cannot end a proof early. */
async function seedBoundTender({ tenderName, password, tag, weaponKey, rows = [] }) {
  const claim = await call("claimTender", { password, tenderName });
  const token = claim.data.token;
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.data.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, Date.now());
  const now = Date.now();
  const insAsset = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
  const bodyId = Number(insAsset.run(`Test Body ${tag}`, "body", 2, 2, "sky", `test/body-${tag}.png`, now).lastInsertRowid);
  const insAwokin = db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)");
  const composition = JSON.stringify([{ source_id: `db:${bodyId}`, name: `Test Body ${tag}`, category: "body", rarity: "common", power: 2, toughness: 2, element: "sky" }]);
  insAwokin.run(`Awokin ${tag}`, `Awokin ${tag}`, `test/awokin-${tag}.png`, composition, tenderName, ownerKey, now);
  await call("chooseClass", { classKey: "runewright" }, token);
  if (weaponKey) await call("chooseWeapon", { weaponKey }, token);
  for (const r of rows) seedWeaponRow(ownerKey, r.key, r);
  const { issueTableToken } = await import("../server/dist/table.js");
  const tt = issueTableToken({ id: `disc-${tag}`, name: tenderName });
  const code = (await call("getTableBindCode", {}, token)).data.code;
  const bindRes = await fetch(`${base}/api/table/bind`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: tt, code }),
  });
  if (!bindRes.ok) throw new Error(`table/bind -> ${bindRes.status}: ${JSON.stringify(await bindRes.json().catch(() => ({})))}`);
  return { token, tt, ownerKey };
}

async function joinBound(tt, room, label) {
  const c = client(label);
  await c.join({ authToken: tt, room });
  await c.waitFor(cc => !!meIn(cc)?.pos, "the tender stands in pixel space");
  return c;
}

/** Deal a casual wave and wait until at least one foe stands
 *  halted at the gate (≤80px from the seed's heart, its
 *  position steady across two polls) — a parked target. */
async function waveAndGate(c, timeout = 90000) {
  c.send({ type: "startWave" });
  await c.waitFor(cc => cc.state.battle.active && cc.state.dark.length > 0, "the wave is dealt", 20000);
  const seen = new Map();
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const gate = c.state.dark.filter(d => pxDist(d.pos, SEED_CTR) <= 80);
    for (const d of gate) {
      const prev = seen.get(d.id);
      if (prev && pxDist(prev, d.pos) < 1) return d;
      seen.set(d.id, { ...d.pos });
    }
    await sleep(400);
  }
  throw new Error(`${c.label}: no foe halted at the gate`);
}

/** Wait until every living foe has reached the gate (≤85px
 *  from the seed's heart) — only then are foe positions stable
 *  enough to park against by the pixel. */
async function waitAllAtGate(c, timeout = 90000) {
  await c.waitFor(cc => cc.state.dark.length > 0 && cc.state.dark.every(d => pxDist(d.pos, SEED_CTR) <= 85),
    "every foe stands at the gate", timeout);
}

/** Find a tile whose center satisfies pred(center, minFoeDist). */
function findTile(c, pred) {
  const foes = c.state.dark.map(d => d.pos);
  for (const t of c.state.map) {
    if (t.id === "0,0") continue;
    const ctr = centerOf(t.id);
    const minFoe = foes.length ? Math.min(...foes.map(f => pxDist(ctr, f))) : Infinity;
    if (pred(ctr, minFoe, t)) return t.id;
  }
  return null;
}

async function glideAndSettle(c, tileId, timeout = 25000) {
  const ctr = centerOf(tileId);
  c.send({ type: "glide", tx: ctr.x, ty: ctr.y });
  await c.waitFor(cc => {
    const m = meIn(cc);
    return m && m.moving === false && m.pos && pxDist(m.pos, ctr) <= 3;
  }, `the tender settles on ${tileId}`, timeout);
  return { ...meIn(c).pos };
}

const weaponStrikesSince = (c, idx, weapon = null) =>
  c.allStrikes.slice(idx).filter(s => s.side === "light" && s.weapon && (!weapon || s.weapon === weapon));

// ── (a) WIELD SWITCH: SWORD → SPEAR ───────────────────────
console.log("\n(a) mid-room wield switch — sword to spear");
{
  const seed = await seedBoundTender({ tenderName: "Switch Tender", password: "switch-password-54", tag: "54A", weaponKey: "sword" });
  const c = await joinBound(seed.tt, "table-54-a", "SWITCH");
  check("bind time: the sword is in hand on the you DTO and the party entry",
    c.you.weaponKey === "sword" && meIn(c).weaponKey === "sword", `you=${c.you.weaponKey} party=${meIn(c).weaponKey}`);
  check("bind time: the contract defaults ride along (Lv 1, unattuned, no nodes)",
    meIn(c).weaponLevel === 1 && meIn(c).weaponDepth === 0 && meIn(c).weaponManifest === false && meIn(c).weaponSignature === false,
    JSON.stringify({ l: meIn(c).weaponLevel, d: meIn(c).weaponDepth, m: meIn(c).weaponManifest, s: meIn(c).weaponSignature }));

  await waveAndGate(c);
  await waitAllAtGate(c);
  // Park where EVERY foe is beyond the sword (69px) yet the
  // nearest is inside the spear (138px).
  let tile = null;
  for (let tries = 0; tries < 10 && !tile; tries++) {
    tile = findTile(c, (ctr, minFoe) => minFoe >= 75 && minFoe <= 130);
    if (!tile) await sleep(1500);
  }
  check("a parking tile stands between sword and spear range of every foe", !!tile, `dark=${c.state.dark.map(d => `${d.kind}@${JSON.stringify(d.pos)}`).join(" ")}`);
  const parked = await glideAndSettle(c, tile);
  const minFoeDist = Math.min(...c.state.dark.map(d => pxDist(parked, d.pos)));
  check("the park measures between the two ranges", minFoeDist > 69 && minFoeDist <= 138, `minFoeDist=${minFoeDist.toFixed(1)}px`);

  const markSword = c.allStrikes.length;
  await sleep(5000);
  const swordStrikes = weaponStrikesSince(c, markSword);
  check("the sword strikes nothing from the park (0 weapon strikes in 5s)", swordStrikes.length === 0,
    `strikes=${JSON.stringify(swordStrikes)}`);

  // A bogus key is refused in the house style, and the hand
  // does not change.
  const errMark = c.errors.length;
  c.send({ type: "wield", weaponKey: "axe" });
  await c.waitFor(cc => cc.errors.length > errMark, "the bogus wield is refused", 8000);
  check("a bogus weapon key draws the house error", /Name one of the four/.test(c.errors[c.errors.length - 1]), c.errors[c.errors.length - 1]);
  check("the sword stays in hand after the refusal", meIn(c).weaponKey === "sword", meIn(c).weaponKey);

  const markWield = c.allStrikes.length;
  c.send({ type: "wield", weaponKey: "spear" });
  await c.waitFor(cc => meIn(cc).weaponKey === "spear" && cc.you.weaponKey === "spear", "the spear is in hand on the wire", 8000);
  check("the wield lands live: party entry and you DTO both carry the spear", true);
  const persisted = db.prepare("SELECT weapon_key FROM tender_progress WHERE owner_key = ?").get(seed.ownerKey);
  check("the wield persists through the arsenal law (tender_progress.weapon_key = spear)",
    persisted?.weapon_key === "spear", `weapon_key=${persisted?.weapon_key}`);

  await c.waitFor(cc => weaponStrikesSince(cc, markWield, "spear").some(s => s.hit), "a spear strike lands", 25000);
  const spearHits = weaponStrikesSince(c, markWield, "spear").filter(s => s.hit);
  const spans = spearHits.map(s => pxDist(s.from, s.to));
  check("spear strikes fly after the switch, all spans beyond sword range and within spear range",
    spans.length >= 1 && spans.every(d => d > 69 && d <= 139), `spans=${spans.map(d => d.toFixed(0)).join(",")}`);
  console.log(`  spear: ${spearHits.length} hit strike(s), spans ${spans.map(d => d.toFixed(0)).join("/")}px (sword 69 / spear 138)`);
  c.ws.close();
}

// ── (b) ATTUNEMENT REACH: SKY STRIKES FAR, STONE DOES NOT ─
console.log("\n(b) attunement reach — the element's reach replaces the weapon's");
{
  const seed = await seedBoundTender({
    tenderName: "Attuned Tender", password: "attuned-password-54", tag: "54B", weaponKey: "sword",
    rows: [{ key: "sword", level: 1, element: "sky", depth: 1 }],
  });
  const c = await joinBound(seed.tt, "table-54-b", "ATTUNED");
  check("bind time: the sky attunement rides the contract (element sky, depth 1)",
    meIn(c).weaponElement === "sky" && meIn(c).weaponDepth === 1 && c.you.weaponElement === "sky",
    `element=${meIn(c).weaponElement} depth=${meIn(c).weaponDepth}`);

  // The sky proof needs no park: the Tender stands at their
  // landing, and every foe must cross sky's 276px ring to
  // reach the gate (a gate foe is never more than ~207px from
  // a ring-2 landing). A hit strike whose own span is ≥200px
  // is the proof — no 69px sword law can write it.
  const markSky = c.allStrikes.length;
  c.send({ type: "startWave" });
  await c.waitFor(cc => weaponStrikesSince(cc, markSky, "sword").some(s => s.hit && pxDist(s.from, s.to) >= 200),
    "the sky-attuned sword lands from ~3.5 hexes", 60000);
  const skySpans = weaponStrikesSince(c, markSky, "sword").filter(s => s.hit).map(s => pxDist(s.from, s.to));
  check("the attuned sword strikes at sky reach (a hit span ≥200px; the bare sword reaches 69)",
    skySpans.some(d => d >= 200), `spans=${skySpans.map(d => d.toFixed(0)).join(",")}`);
  console.log(`  sky sword: hit spans ${skySpans.map(d => d.toFixed(0)).join("/")}px (sky reach 276)`);

  // CONTROL: the same sword, re-attuned to stone (reach 1).
  // Re-wielding at the Table refreshes the contract live.
  seedWeaponRow(seed.ownerKey, "sword", { level: 1, element: "stone", depth: 1 });
  c.send({ type: "wield", weaponKey: "sword" });
  await c.waitFor(cc => meIn(cc).weaponElement === "stone" && meIn(cc).weaponDepth === 1, "the stone re-attunement reads live", 8000);
  check("the re-wield refreshes the contract (element stone, depth 1)", true);
  // A fresh wave, and the Tender parks as far from every foe
  // as the field allows — the stone sword must stay silent
  // there while the dark lives and closes on the gate. First
  // the sky wave's leavings are run down at the gate (from
  // the landing, a 69px sword cannot reach a far-side foe,
  // and the wave would outlast any patient wait).
  {
    const chaseStart = Date.now();
    while (Date.now() - chaseStart < 90000) {
      if (!c.state.battle.active && c.state.dark.length === 0) break;
      const me = meIn(c);
      const nearest = [...c.state.dark].sort((x, y) => pxDist(me.pos, x.pos) - pxDist(me.pos, y.pos))[0];
      if (nearest && pxDist(me.pos, nearest.pos) > 55) c.send({ type: "glide", tx: nearest.pos.x, ty: nearest.pos.y });
      await sleep(500);
    }
    await c.waitFor(cc => !cc.state.battle.active && cc.state.dark.length === 0, "the sky wave breaks", 15000);
  }
  c.send({ type: "startWave" });
  await c.waitFor(cc => cc.state.battle.active && cc.state.dark.length > 0, "the control wave is dealt", 20000);
  let tile2 = null, tile2Dist = 0;
  for (const t of c.state.map) {
    if (t.id === "0,0") continue;
    const ctr = centerOf(t.id);
    const minFoe = Math.min(...c.state.dark.map(d => pxDist(ctr, d.pos)));
    if (minFoe > tile2Dist) { tile2Dist = minFoe; tile2 = t.id; }
  }
  check("the control park stands far from every foe (≥180px)", !!tile2 && tile2Dist >= 180, `tile=${tile2} minFoe=${tile2Dist.toFixed(0)}px`);
  await glideAndSettle(c, tile2);
  const markStone = c.allStrikes.length;
  await sleep(6000);
  const stoneFar = weaponStrikesSince(c, markStone);
  check("the stone-attuned sword strikes NOTHING from the far park (0 weapon strikes in 6s)",
    stoneFar.length === 0, `strikes=${JSON.stringify(stoneFar)}`);
  check("foes still live through the control window (the silence is reach, not an empty field)",
    c.state.dark.length >= 1, `dark=${c.state.dark.length}`);

  // …and the same stone sword strikes at one hex: march on
  // the gate cluster and read the strikes that fly on the way
  // in and at the park — every span within stone's 69px.
  await waitAllAtGate(c);
  let tile3 = null;
  for (let tries = 0; tries < 10 && !tile3; tries++) {
    tile3 = findTile(c, (ctr, minFoe) => minFoe <= 66);
    if (!tile3) await sleep(1200);
  }
  check("a parking tile stands within one hex of a foe", !!tile3);
  const markClose = c.allStrikes.length;
  await glideAndSettle(c, tile3);
  await c.waitFor(cc => weaponStrikesSince(cc, markClose, "sword").length >= 1, "the stone sword strikes at one hex", 25000);
  const closeSpans = weaponStrikesSince(c, markClose, "sword").map(s => pxDist(s.from, s.to));
  check("the stone sword's strikes stay within its 69px reach",
    closeSpans.length >= 1 && closeSpans.every(d => d <= 70.5), `spans=${closeSpans.map(d => d.toFixed(0)).join(",")}`);
  console.log(`  stone sword at one hex: spans ${closeSpans.map(d => d.toFixed(0)).join("/")}px (stone reach 69)`);
  c.ws.close();
}

// ── (d) MANIFEST ──────────────────────────────────────────
console.log("\n(d) manifest — copies strike, fade, and die at a wield switch");
{
  const seed = await seedBoundTender({ tenderName: "Manifest Tender", password: "manifest-password-54", tag: "54D", weaponKey: "sword" });
  const c = await joinBound(seed.tt, "table-54-d", "MANIFEST");
  const myManifests = (cc) => (cc.state.manifests ?? []).filter(m => m.ownerKey === cc.you.key);

  // The quiet-room cast: no battle runs, no harvest can move
  // the purse — the ⚡4 is measured exactly.
  const energy0 = meIn(c).energy;
  c.send({ type: "manifest" });
  await c.waitFor(cc => myManifests(cc).length === 1, "the manifest files in state", 8000);
  const m0 = myManifests(c)[0];
  check("state gains manifests:[{ownerKey, weaponKey, count, expiresAt}] — one sword copy",
    m0.ownerKey === c.you.key && m0.weaponKey === "sword" && m0.count === 1 && typeof m0.expiresAt === "number",
    JSON.stringify(m0));
  check("the copy's life is ~20s", m0.expiresAt - Date.now() > 14000 && m0.expiresAt - Date.now() <= 20500,
    `ttl=${m0.expiresAt - Date.now()}ms`);
  check("manifest costs exactly ⚡4", energy0 - meIn(c).energy === 4, `${energy0} → ${meIn(c).energy}`);

  // Into battle: parked at a gate foe's side, the copy strikes
  // on its own cadence while the true weapon strikes too.
  await waveAndGate(c);
  await waitAllAtGate(c);
  let tile = null;
  for (let tries = 0; tries < 10 && !tile; tries++) {
    tile = findTile(c, (ctr, minFoe) => minFoe <= 66);
    if (!tile) await sleep(1200);
  }
  await glideAndSettle(c, tile);
  // Gather copy strikes for the rest of the cast's life; if
  // the dark was slow and the copy faded ungathered, cast
  // again — now in range — and gather from the fresh copy.
  let copyStrikes = [];
  const gatherUntil = Math.min(m0.expiresAt + 1000, Date.now() + 30000);
  while (Date.now() < gatherUntil) {
    copyStrikes = c.allStrikes.filter(s => s.copy === true && s.weapon === "sword");
    if (copyStrikes.length >= 2) break;
    await sleep(400);
  }
  if (copyStrikes.length < 2) {
    // The referee lawfully refuses a cast from a fallen Tender
    // or a purse under ⚡4 — and mid-battle either can hold for
    // the whole gather: he rises only between waves, and the
    // purse refills only on a wave break's harvest. The first
    // form of this branch merely OFFERED the cast while
    // standing-and-funded for 60s and then threw on an 8s
    // waitFor — if he lay fallen in an unbroken battle, no
    // offer was ever made and the suite died here with no
    // tally (reproduced solo, Station 2). Now the branch
    // WORKS the conditions back, the way the top-up loop
    // below does: deal a fresh wave when the field is quiet,
    // walk him to the fight so the wave breaks (he rises,
    // the harvest lands), offer the cast whenever he stands
    // funded — and the filing is judged by a check carrying
    // the last witnessed state, never by a thrown timeout.
    let filed = false, lastState = "";
    {
      const castStart = Date.now();
      while (Date.now() - castStart < 120000) {
        if (myManifests(c).length === 1) { filed = true; break; }
        const me = meIn(c);
        lastState = `fallen=${!!me?.fallen} energy=${me?.energy} battle=${c.state.battle.active} dark=${c.state.dark.length} manifests=${myManifests(c).length} err=${c.errors.slice(-1).join(" ")}`;
        if (!c.state.battle.active && c.state.dark.length === 0) { c.send({ type: "startWave" }); await sleep(800); continue; }
        if (me && !me.fallen && c.state.dark.length > 0) {
          const nearest = [...c.state.dark].sort((x, y) => pxDist(me.pos, x.pos) - pxDist(me.pos, y.pos))[0];
          if (nearest && pxDist(me.pos, nearest.pos) > 55) c.send({ type: "glide", tx: nearest.pos.x, ty: nearest.pos.y });
        }
        if (me && !me.fallen && me.energy >= 4 && myManifests(c).length === 0) c.send({ type: "manifest" });
        if ((Date.now() - castStart) % 12000 < 600) console.log(`  [recast] ${lastState}`);
        await sleep(600);
      }
    }
    check("the second manifest files (the cast worked standing and funded)", filed, lastState);
    if (filed) {
      await sleep(7000);
      copyStrikes = c.allStrikes.filter(s => s.copy === true && s.weapon === "sword");
    }
  }
  // Top-up: a fast wave can die under three strike sources
  // before the copies have flown twice. Keep dealing waves,
  // parking at the gate, and re-casting (harvest and wave
  // breaks refill the purse faster than ⚡4 drains it) until
  // two copy strikes stand on the ledger.
  {
    const topStart = Date.now();
    while (copyStrikes.length < 2 && Date.now() - topStart < 90000) {
      if (!c.state.battle.active && c.state.dark.length === 0) { c.send({ type: "startWave" }); await sleep(800); continue; }
      if (c.state.dark.length > 0) {
        const me = meIn(c);
        const nearest = [...c.state.dark].sort((x, y) => pxDist(me.pos, x.pos) - pxDist(me.pos, y.pos))[0];
        if (nearest && pxDist(me.pos, nearest.pos) > 60 && c.state.dark.every(d => pxDist(d.pos, SEED_CTR) <= 120)) {
          c.send({ type: "glide", tx: nearest.pos.x, ty: nearest.pos.y });
        }
        if (myManifests(c).length === 0 && me.energy >= 4) c.send({ type: "manifest" });
      }
      await sleep(500);
      copyStrikes = c.allStrikes.filter(s => s.copy === true && s.weapon === "sword");
    }
  }
  check("manifest copies strike independently (≥2 strikes with copy:true)",
    copyStrikes.length >= 2, `copyStrikes=${copyStrikes.length} all=${JSON.stringify(c.allStrikes.filter(s => s.weapon).slice(-8))}`);
  const trueStrikes = c.allStrikes.filter(s => s.weapon === "sword" && !s.copy);
  check("the true weapon strikes alongside its copies", trueStrikes.length >= 1, `trueStrikes=${trueStrikes.length}`);
  console.log(`  manifest window: ${copyStrikes.length} copy strikes, ${trueStrikes.length} true-weapon strikes`);

  // Expiry: the state empties at expiresAt (the method: read
  // the filed expiresAt and wait the real twenty seconds out)
  // and no copy strike is witnessed after it. A quiet room
  // pushes no state on its own, so the wait nudges a push
  // (glideStop — a harmless sendState) to read the fade.
  const live = myManifests(c);
  const exp = live.length ? live[0].expiresAt : m0.expiresAt;
  {
    // STAMPED-PUSH REPAIR (Station 2): the first form of
    // this wait read the fade off whatever push the harness
    // happened to hold when its budget ran out — under
    // starved pushes that could be a push GENERATED before
    // expiresAt, and the check judged the copy by a portrait
    // painted before its death (Station 1's flake). Now the
    // wait holds out for a push RECEIVED at/after
    // expiresAt + 1.5s whose manifests read empty: server
    // and harness share the host clock, and sendState
    // sweeps expired copies at generation (it files only
    // expiresAt > now), so an empty read on a late-received
    // push is the fade itself, never a stale frame of it.
    const fadeStart = Date.now();
    while (Date.now() - fadeStart < Math.max(8000, exp - Date.now() + 45000)) {
      if (myManifests(c).length === 0 && (c.stateAt ?? 0) >= exp + 1500) break;
      c.send({ type: "glideStop" });
      await sleep(1200);
    }
  }
  check("the copies are gone after expiry (read on a push received after expiresAt)", myManifests(c).length === 0 && (c.stateAt ?? 0) >= exp + 1500,
    `manifests=${JSON.stringify(c.state.manifests)} stateAt=${c.stateAt} exp=${exp}`);
  await sleep(1500);
  const lateCopies = c.allStrikes.filter(s => s.copy === true && (s.at ?? 0) > exp + 400);
  check("no copy strike lands after expiry", lateCopies.length === 0, `late=${JSON.stringify(lateCopies)}`);

  // The node + the dismissal, in quiet: wait out the battle,
  // seed the Manifest node, re-wield to read it, cast (two
  // copies now), then wield-switch and watch them die in the
  // same state push that changes the hand. If the Tender fell
  // in the long battle (the field rests just the same), a
  // fresh wave raises them at half — and its dark is still
  // crossing the rim, minutes of road from any kill or
  // harvest, so the purse readings below stay exact.
  await c.waitFor(cc => !cc.state.battle.active && cc.state.dark.length === 0, "the field rests", 120000);
  if (meIn(c).fallen) {
    c.send({ type: "startWave" });
    await c.waitFor(cc => cc.state.battle.active && cc.state.dark.length > 0 && !meIn(cc).fallen, "the fallen tender rises with the new wave", 20000);
    console.log("  (the tender had fallen in the manifest battle — raised by the next wave for the node cast)");
  }
  seedWeaponRow(seed.ownerKey, "sword", { level: 1, element: null, depth: 0, manifest: 1 });
  c.send({ type: "wield", weaponKey: "sword" });
  await c.waitFor(cc => cc.you.weaponManifest === true, "the manifest node reads live at re-wield", 8000);
  check("the Manifest node rides the contract after re-wield", meIn(c).weaponManifest === true);
  const energy1 = meIn(c).energy;
  c.send({ type: "manifest" });
  await c.waitFor(cc => myManifests(cc).length === 1, "the node cast files", 8000);
  check("with the node, the cast files TWO copies", myManifests(c)[0].count === 2, JSON.stringify(myManifests(c)));
  check("the node cast also costs exactly ⚡4", energy1 - meIn(c).energy === 4, `${energy1} → ${meIn(c).energy}`);
  c.send({ type: "wield", weaponKey: "spear" });
  await c.waitFor(cc => meIn(cc).weaponKey === "spear", "the spear is in hand", 8000);
  check("a wield switch dismisses live copies at once (same push: spear in hand, manifests empty)",
    myManifests(c).length === 0, `manifests=${JSON.stringify(c.state.manifests)}`);
  c.ws.close();
}

// ── (e) PIERCE ────────────────────────────────────────────
console.log("\n(e) pierce — the signature arrow strikes through");
{
  const seed = await seedBoundTender({ tenderName: "Pierce Tender", password: "pierce-password-54", tag: "54E", weaponKey: "arrow" });
  const c = await joinBound(seed.tt, "table-54-e", "PIERCE");
  // Park near the seed, where at least two foes stand inside
  // arrow range. The arrow works while we look — a wave can
  // thin below two foes — so the search re-deals and retries.
  let tile = null;
  for (let attempt = 0; attempt < 4 && !tile; attempt++) {
    if (!c.state.battle.active) {
      c.send({ type: "startWave" });
      await c.waitFor(cc => cc.state.battle.active && cc.state.dark.length >= 2, "a wave with two foes is dealt", 30000).catch(() => {});
    }
    await waveAndGate(c).catch(() => {});
    tile = findTile(c, (ctr) => pxDist(ctr, SEED_CTR) <= 150 && c.state.dark.filter(d => pxDist(ctr, d.pos) <= 260).length >= 2);
    if (!tile) await sleep(1000);
  }
  check("a parking tile holds two foes inside arrow range", !!tile, `dark=${c.state.dark.length}`);
  if (!tile) { c.ws.close(); throw new Error("pierce proof could not park — see the failed check above"); }
  await glideAndSettle(c, tile);

  const beatsOf = (list) => {
    const by = new Map();
    for (const s of list) { if (!by.has(s.at)) by.set(s.at, []); by.get(s.at).push(s); }
    return [...by.values()];
  };
  const markCtl = c.allStrikes.length;
  await sleep(13000);
  const ctlBeats = beatsOf(c.allStrikes.slice(markCtl).filter(s => s.weapon === "arrow"));
  check("control: the unsigned arrow strikes ONE foe per beat",
    ctlBeats.length >= 2 && ctlBeats.every(b => b.length === 1),
    `beats=${ctlBeats.map(b => b.length).join(",")}`);
  console.log(`  control beats: ${ctlBeats.map(b => b.length).join("/")} strikes per beat over ${ctlBeats.length} beats`);

  seedWeaponRow(seed.ownerKey, "arrow", { level: 1, element: null, depth: 0, signature: 1 });
  c.send({ type: "wield", weaponKey: "arrow" });
  await c.waitFor(cc => cc.you.weaponSignature === true, "the signature reads live at re-wield", 8000);
  check("the Signature node rides the contract after re-wield", meIn(c).weaponSignature === true);
  if (!c.state.dark.length || !c.state.battle.active) await waveAndGate(c);
  if (c.state.dark.length < 2) {
    // The control's beats thinned the field; deal company for
    // the pierce to strike through into.
    await c.waitFor(cc => !cc.state.battle.active && cc.state.dark.length === 0, "the control wave breaks", 60000).catch(() => {});
    if (!c.state.battle.active) { c.send({ type: "startWave" }); await c.waitFor(cc => cc.state.dark.length >= 2, "fresh foes for the pierce", 30000).catch(() => {}); }
  }
  const markSig = c.allStrikes.length;
  let pierceBeat = null;
  const start = Date.now();
  while (Date.now() - start < 40000 && !pierceBeat) {
    const beats = beatsOf(c.allStrikes.slice(markSig).filter(s => s.weapon === "arrow"));
    pierceBeat = beats.find(b => b.length >= 2 && pxDist(b[0].to, b[1].to) > 5) ?? null;
    if (!pierceBeat) await sleep(400);
  }
  check("with the signature, one beat strikes TWO distinct foes", !!pierceBeat,
    `beats=${beatsOf(c.allStrikes.slice(markSig).filter(s => s.weapon === "arrow")).map(b => b.length).join(",")}`);
  if (pierceBeat) {
    const second = pierceBeat[pierceBeat.length - 1];
    check("the second strike of the beat is flagged pierce:true", second.pierce === true, JSON.stringify(second));
    console.log(`  pierce beat at ${pierceBeat[0].at}: ${pierceBeat.length} arrow strikes, targets ${pierceBeat.map(s => `${s.to.x.toFixed(0)},${s.to.y.toFixed(0)}`).join(" + ")}`);
  }
  c.ws.close();
}

// ── (c) WEAPON LEVEL + KEEN — counted damage per hit ──────
console.log("\n(c) weapon level & keen — counted damage per hit, three rooms in parallel");
{
  async function dmgRoom({ tenderName, password, tag, room, rows }) {
    const seed = await seedBoundTender({ tenderName, password, tag, weaponKey: "sword", rows });
    const c = await joinBound(seed.tt, room, tag);
    const ctx = { c, foes: new Map(), strikePtr: 0, glideAt: 0 };
    c.onState.push((cc) => {
      const me = meIn(cc);
      const dark = cc.state.dark;
      const ids = new Set(dark.map(d => d.id));
      const diedNow = [];
      for (const d of dark) {
        let f = ctx.foes.get(d.id);
        if (!f) { f = { kind: d.kind, maxHp: d.maxHp, lastHp: d.hp, lastPos: d.pos, hits: 0, counted: 0, dead: false, truncated: false }; ctx.foes.set(d.id, f); }
        if (d.hp < f.lastHp) f.counted += f.lastHp - d.hp;
        f.lastHp = d.hp; f.lastPos = d.pos;
      }
      for (const [id, f] of ctx.foes) {
        if (ids.has(id) || f.dead || f.truncated) continue;
        if (me?.fallen) f.truncated = true;
        else { f.dead = true; f.counted += f.lastHp; diedNow.push(f); }
      }
      const fresh = cc.allStrikes.slice(ctx.strikePtr);
      ctx.strikePtr = cc.allStrikes.length;
      for (const s of fresh) {
        if (s.weapon !== "sword" || !s.hit || s.copy) continue;
        const cands = [...dark.map(d => ({ pos: d.pos, f: ctx.foes.get(d.id) })), ...diedNow.map(f => ({ pos: f.lastPos, f }))];
        let best = null, bestD = 6;
        for (const cand of cands) { const dd = pxDist(s.to, cand.pos); if (dd < bestD) { bestD = dd; best = cand.f; } }
        if (best) best.hits++;
      }
    });
    return ctx;
  }
  const plain = await dmgRoom({ tenderName: "Plain Tender", password: "plain-password-54", tag: "54C1", room: "table-54-c-plain", rows: [] });
  const level3 = await dmgRoom({ tenderName: "Level Tender", password: "level-password-54", tag: "54C3", room: "table-54-c-level3", rows: [{ key: "sword", level: 3 }] });
  const keen = await dmgRoom({ tenderName: "Keen Tender", password: "keen-password-54", tag: "54CK", room: "table-54-c-keen", rows: [{ key: "sword", level: 1, signature: 1 }] });
  check("the Lv 3 room's contract carries level 3", meIn(level3.c).weaponLevel === 3, `level=${meIn(level3.c).weaponLevel}`);
  check("the keen room's contract carries the signature", meIn(keen.c).weaponSignature === true);

  const tally = (ctx) => {
    let dmg = 0, hits = 0, foes = 0;
    for (const f of ctx.foes.values()) if (f.dead) { dmg += f.counted; hits += f.hits; foes++; }
    return { dmg, hits, foes, mean: hits ? dmg / hits : 0 };
  };
  const ctxs = [plain, level3, keen];
  const driveStart = Date.now();
  while (Date.now() - driveStart < 420000) {
    const tallies = ctxs.map(tally);
    if (tallies.every(t => t.hits >= 34 && t.foes >= 10)) break;
    for (const ctx of ctxs) {
      const cc = ctx.c, me = meIn(cc);
      if (!me) continue;
      if (!cc.state.battle.active && cc.state.dark.length === 0) { cc.send({ type: "startWave" }); continue; }
      if (!cc.state.dark.length) continue;
      const nearest = [...cc.state.dark].sort((a, b) => pxDist(me.pos, a.pos) - pxDist(me.pos, b.pos))[0];
      if (nearest && pxDist(me.pos, nearest.pos) > 60 && Date.now() - ctx.glideAt > 700) {
        ctx.glideAt = Date.now();
        cc.send({ type: "glide", tx: nearest.pos.x, ty: nearest.pos.y });
      }
    }
    await sleep(400);
  }
  const [tp, tl, tk] = ctxs.map(tally);
  console.log(`  plain Lv1: ${tp.foes} foes, ${tp.hits} hits, counted dmg ${tp.dmg}, mean ${tp.mean.toFixed(2)}/hit`);
  console.log(`  sword Lv3: ${tl.foes} foes, ${tl.hits} hits, counted dmg ${tl.dmg}, mean ${tl.mean.toFixed(2)}/hit`);
  console.log(`  keen Lv1:  ${tk.foes} foes, ${tk.hits} hits, counted dmg ${tk.dmg}, mean ${tk.mean.toFixed(2)}/hit`);
  check("each room accounted enough dead foes and hits (≥10 foes, ≥34 hits)",
    [tp, tl, tk].every(t => t.foes >= 10 && t.hits >= 34), JSON.stringify([tp, tl, tk]));
  check("LEVEL: the Lv 3 sword's counted damage per hit exceeds Lv 1's by ≥0.5",
    tl.mean >= tp.mean + 0.5, `${tl.mean.toFixed(2)} vs ${tp.mean.toFixed(2)}`);
  check("KEEN: the signature sword's counted damage per hit exceeds plain by ≥0.4",
    tk.mean >= tp.mean + 0.4, `${tk.mean.toFixed(2)} vs ${tp.mean.toFixed(2)}`);
  for (const ctx of ctxs) ctx.c.ws.close();
}

console.log(`\ntest54: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
