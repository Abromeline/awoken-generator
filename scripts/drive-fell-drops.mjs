// ITEMS DROPPING — THE FELL DRIP drive (Nigel's kept item,
// 2026-10-20 23:03: "things beaten on both maps drop";
// 17:33: creatures beaten at the Table drop attunement
// points). Boots the real server on a scratch DATA_DIR and
// proves, against the aspect_attunement ledger in the DB:
//   §H HOMELAND — a Tender's weapon fells wanderers standing
//      on FIRE-filed cursed ground: the drip now rides to
//      her Pack as a physical drop (the loot table fix,
//      2026-10-25), and CLAIMING those drops is what lands
//      the pools — every point in FIRE (the ground's own
//      element), in exact tenths; a second batch of fells
//      ACCUMULATES on the first. A weaponless Tender beside
//      living wanderers gains nothing (the no-kill control).
//   §T1 THE TABLE, CAMPAIGN — the Storytender deals fray; the
//      standing Tender fells them (his written blades and his
//      Awoken's blows): his pools gain, in exact tenths; a
//      bound seat on the bench (no Awoken on the field)
//      gains nothing. (The campaign road is UNCHANGED by
//      the loot table fix — its drip still pays the pools
//      directly; this section is that proof. One batch is
//      the whole fixture — the campaign's bank/company
//      ledger carries a tender's spending across rooms,
//      so the old second batch was never independent.)
//   §T2 THE TABLE, CASUAL — waves are dealt and felled: the
//      take gathers in the room's SHARED Pack, seen by the
//      witness's client too; the witness claims an item
//      into her own inventory and a second claim of it is
//      refused; the killer's pools gain only when he
//      claims the attunement gatherings; a seated Tender
//      who never takes the field gains nothing.
// The drip's measure is Nigel's drizzle (2026-10-19): each
// fell rolls 20% for +0.1 — so batches are sized (40 / 20 /
// 25+ fells) to make a silent batch a <2% accident, and a
// failure here reads as a failure, never a pass.
// Run: node scripts/drive-fell-drops.mjs
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { WebSocket } from "ws";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const OUT = "/home/hatch/workspace/fell-drops-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(OUT, "data-"));
process.env.PORT = "3977";
process.env.WORKSHOP_PASSWORD = ["fell", "drops", "pw"].join("-");
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;
process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3977";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

await import("../server/dist/index.js");
await sleep(2500);

async function call(action, args, token) {
  // One retry on a socket reset (fixture restated,
  // 2026-10-25 — drive-drop-table's standing shape): the
  // scratch server is in-process, and a single reset
  // under load must not masquerade as a failed proof. A
  // second failure propagates and fails honestly.
  let res;
  try {
    res = await fetch(`${BASE}/api/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
      body: JSON.stringify(args ?? {}),
    });
  } catch {
    await sleep(300);
    res = await fetch(`${BASE}/api/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
      body: JSON.stringify(args ?? {}),
    });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
// Fresh-DB migration-order defect (carried by the Audit):
// stand the greeter column up so drizzle selects do not throw.
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }

const poolsOf = (ownerKey) => {
  const rows = db.prepare("SELECT element, points FROM aspect_attunement WHERE owner_key = ?").all(ownerKey);
  const m = {}; let total = 0;
  for (const r of rows) { m[r.element] = r.points; total += r.points; }
  return { m, total };
};
const inTenths = (v) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-6;
const qtyOfKey = (ownerKey, key) => (db.prepare("SELECT qty FROM tender_inventory WHERE owner_key = ? AND item_key = ?").get(ownerKey, key)?.qty) ?? 0;
/** Claim every waiting homeland Pack entry for a tender
 *  (the loot table fix: a fell's drip reaches her pools
 *  only when she claims the drop it rode in on). A claim
 *  a full purse or stack refuses is left standing — the
 *  pools read what landed. */
const claimPackFor = async (token) => {
  const t = await call("getTerritory", {}, token);
  for (const e of t.loot ?? []) {
    try { await call("claimPackDrop", { entryId: e.id }, token); } catch { /* refused claims wait */ }
  }
};

/* ── §H THE HOMELAND ────────────────────────────────────── */
{
  console.log("§H homeland — the weapon's fells pay the drip, in the ground's element");
  const claim = await call("claimTender", { password: "fell-drops-password", tenderName: "Drip Tender" });
  const token = claim.token;
  const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id}`;
  const now = Date.now();
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(me, now);
  // The class set by hand in her record (fixture
  // restated, 2026-10-25): the choosing gate now wants
  // three wakes before chooseClass answers — the game's
  // current law, and not this drive's road. The weapon
  // choosing still rides its API (it asks only that a
  // class stands).
  db.prepare("UPDATE tender_progress SET class_key = 'warden' WHERE owner_key = ?").run(me);
  await call("chooseWeapon", { weaponKey: "sword" }, token);
  const tileId = new Map();
  const seedTile = (q, r, cursed, element) => {
    const id = Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(me, q, r, element, cursed, now).lastInsertRowid);
    tileId.set(`${q},${r}`, id);
    return id;
  };
  seedTile(0, 0, 0, "root");
  const ring = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([q, r]) => seedTile(q, r, 1, "fire"));
  const seedWanderers = (n) => {
    for (let i = 0; i < n; i++) {
      db.prepare("INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp) VALUES (?, ?, 'fray', ?, 1)").run(me, ring[i % ring.length], Date.now());
    }
  };
  const wanderersLeft = () => db.prepare("SELECT COUNT(*) AS n FROM homeland_wanderers WHERE owner_key = ?").get(me).n;
  const keepStanding = () => db.prepare("UPDATE tender_progress SET hp = 100, down_until = NULL, wanderer_watermark = NULL WHERE owner_key = ?").run(me);
  const fellAll = async (label) => {
    // Forty reads of patience (fixture restated,
    // 2026-10-25): the weapon strikes inside the settled
    // watermark windows, and on an idle machine ten tight
    // reads give batch 2 almost no window to strike in —
    // the proof is the felling, not the read count.
    for (let i = 0; i < 40 && wanderersLeft() > 0; i++) {
      keepStanding();
      db.prepare("UPDATE tender_progress SET weapon_next_at = ? WHERE owner_key = ?").run(Date.now() - 60000, me);
      await call("getTerritory", {}, token);
    }
    ok(`${label}: every seeded wanderer was felled by the weapon`, wanderersLeft() === 0, `${wanderersLeft()} left`);
  };

  seedWanderers(40);
  await fellAll("batch 1");
  const packKinds1 = db.prepare("SELECT DISTINCT kind FROM tender_pack WHERE owner_key = ?").all(me).map(r => r.kind);
  ok("batch 1: the weapon road's Pack holds attunement drops only (its standing skeleton of numbers)", packKinds1.every(k => k === "attunement"), JSON.stringify(packKinds1));
  ok("batch 1: the pools stand at zero until she claims the drops", poolsOf(me).total === 0, JSON.stringify(poolsOf(me).m));
  await claimPackFor(token);
  const p1 = poolsOf(me);
  console.log("  pools after batch 1:", JSON.stringify(p1.m));
  ok("batch 1: the pools gained from the fells", p1.total > 0, `total ${p1.total}`);
  ok("batch 1: every point landed in FIRE — the ground the wanderers fell on", Math.abs((p1.m.fire ?? 0) - p1.total) < 1e-9, JSON.stringify(p1.m));
  ok("batch 1: the gains are exact tenths (the drizzle's measure)", inTenths(p1.total), `total ${p1.total}`);

  seedWanderers(40);
  await fellAll("batch 2");
  await claimPackFor(token);
  const p2 = poolsOf(me);
  console.log("  pools after batch 2:", JSON.stringify(p2.m));
  ok("batch 2: repeated kills ACCUMULATE on the first batch", p2.total > p1.total, `${p1.total} -> ${p2.total}`);
  ok("batch 2: still all fire, still exact tenths", Math.abs((p2.m.fire ?? 0) - p2.total) < 1e-9 && inTenths(p2.total), JSON.stringify(p2.m));

  // The no-kill control: classed, weaponless, wanderers alive.
  const cClaim = await call("claimTender", { password: "fell-drops-password", tenderName: "Quiet Tender" });
  const cMe = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(cClaim.tender.code).id}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(cMe, Date.now());
  db.prepare("UPDATE tender_progress SET class_key = 'warden' WHERE owner_key = ?").run(cMe);
  const cHeart = Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, 0, 0, 'root', 0, ?)").run(cMe, Date.now()).lastInsertRowid);
  const cDark = Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, 1, 0, 'fire', 1, ?)").run(cMe, Date.now()).lastInsertRowid);
  void cHeart;
  for (let i = 0; i < 10; i++) db.prepare("INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp) VALUES (?, ?, 'fray', ?, 1)").run(cMe, cDark, Date.now());
  for (let i = 0; i < 3; i++) await call("getTerritory", {}, cClaim.token);
  const cLeft = db.prepare("SELECT COUNT(*) AS n FROM homeland_wanderers WHERE owner_key = ?").get(cMe).n;
  const cPools = poolsOf(cMe);
  ok("control: the weaponless Tender's wanderers all still stand (nothing was beaten)", cLeft === 10, `${cLeft} left`);
  ok("control: no kills, no drip — the pools stand at zero", cPools.total === 0, JSON.stringify(cPools.m));
}

/* ── The Table harness (test63's client, kept whole) ────── */
const parseId = (id) => id.split(",").map(Number);
const axialDist = (a, b) => { const [aq, ar] = parseId(a), [bq, br] = parseId(b); return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs((aq + ar) - (bq + br))) / 2; };
function client(label) {
  const ws = new WebSocket("ws://127.0.0.1:3977/table/ws");
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
  c.waitFor = async (fn, what, timeout = 45000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) { if (c.state && fn(c)) return true; await sleep(200); }
    throw new Error(`${label}: timed out waiting for ${what}; tale tail: ${(c.state?.tale ?? []).slice(-3).map((t) => t.text).join(" | ")}`);
  };
  return c;
}
async function claimBound(name, classKey) {
  const claim = await call("claimTender", { password: "fell-drops-password", tenderName: name });
  const token = claim.token;
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, Date.now());
  // The class set by hand, as in §H (fixture restated,
  // 2026-10-25 — the choosing gate's three-wakes law is
  // not this drive's road).
  if (classKey) db.prepare("UPDATE tender_progress SET class_key = ? WHERE owner_key = ?").run(classKey, ownerKey);
  return { token, ownerKey };
}
function seedAwokin(ownerKey, tenderName, name, element, power = 3, toughness = 3) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)").run(`${name} ${cat}`, cat, power, toughness, element, `felldrops/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power, toughness, element });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)").run(name, name, `felldrops/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
async function bindTable({ token, discordId, discordName, weaponKey }) {
  if (weaponKey) await call("chooseWeapon", { weaponKey }, token);
  const { issueTableToken } = await import("../server/dist/table.js");
  const tt = issueTableToken({ id: discordId, name: discordName });
  const code = (await call("getTableBindCode", {}, token)).code;
  const bindRes = await fetch(`${BASE}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code }) });
  if (!bindRes.ok) throw new Error(`table/bind -> ${bindRes.status}`);
  return tt;
}
const unitByName = (c, frag) => c.state.field.find((u) => u.name.includes(frag));
async function summonOnto(c, cardId, nearId) {
  // THE WHEEL CAST (2026-10-21): the summon is a cast — it
  // can falter (and the falter spends the price), so cast
  // again at the same ground before walking the ring.
  const spots = c.state.map.filter((t) => !t.cursed && t.id !== "0,0" && axialDist(t.id, nearId) <= 1);
  for (const s of spots) {
    for (let i = 0; i < 6; i++) {
      c.send({ type: "summonCast", cardId, hex: s.id });
      try { await c.waitFor((cc) => cc.state.field.some((u) => u.cardId === cardId), `summon onto ${s.id}`, 2500); return s.id; } catch { /* a falter — cast again */ }
    }
  }
  throw new Error("no summonable pure neighbour of " + nearId + " | errors: " + JSON.stringify(c.errors.slice(-4)) + " | energy: " + c.you?.energy + " | company: " + JSON.stringify((c.you?.company ?? []).map((x) => x.name)));
}
/** Write the Single Blade under a named dark, then LOOSE
 *  it with the click-order (Recovery R4, Nigel 2026-10-23:
 *  written, the Blade WAITS armed — the fell comes from
 *  the looseBlade order, never a spring). The cast roll
 *  fizzles sometimes — retry, as test63's castUnderDark
 *  does. */
async function castUnderDark(c, darkId, tries = 8) {
  for (let i = 0; i < tries; i++) {
    const d = c.state.dark.find((x) => x.id === darkId);
    if (!d) return true; // already felled
    const hex = d.hex;
    // A player's real cadence: an armed Blade already
    // within reach of this dark looses at once — no new
    // writing, no waiting on the cast. Blades written for
    // earlier dark stand armed along the march road, and
    // the stream walks into their reach.
    const armed = c.state.workings.some((w) => w.kind === "rune" && w.root === "blade" && (w.charges ?? 0) > 0 && axialDist(w.hex, hex) <= 2);
    if (!armed) {
      c.send({ type: "castRune", root: "blade", hue: "unaligned", hexes: [hex], pour: 0 });
      try {
        await c.waitFor((cc) =>
          !cc.state.dark.some((x) => x.id === darkId)
          || cc.state.workings.some((w) => w.kind === "rune" && w.root === "blade" && w.hex === hex),
          "the blade stands under the dark", 4000);
      } catch { /* cast again */ }
      if (!c.state.dark.some((x) => x.id === darkId)) return true;
      if (!c.state.workings.some((w) => w.kind === "rune" && w.root === "blade" && w.hex === hex)) { await sleep(150); continue; }
    }
    // The click looses it — each loose is the book's
    // flat 6. Read the landing briefly, then move on:
    // the next cycle reads the field fresh, as a player
    // clicking down the stream does.
    const hp0 = c.state.dark.find((x) => x.id === darkId)?.hp ?? 0;
    c.send({ type: "looseBlade", enemyId: darkId });
    try {
      await c.waitFor((cc) => {
        const dd = cc.state.dark.find((x) => x.id === darkId);
        return !dd || dd.hp < hp0;
      }, "the loose lands", 1500);
    } catch { /* loose again next cycle */ }
    if (!c.state.dark.some((x) => x.id === darkId)) return true;
  }
  return !c.state.dark.some((x) => x.id === darkId);
}
const DIRS6 = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
function pathTo(from, to) {
  const path = []; let cur = from; let guard = 0;
  while (cur !== to && guard++ < 24) {
    const [cq, cr] = parseId(cur);
    let best = null, bestD = Infinity;
    for (const [dq, dr] of DIRS6) {
      const n = `${cq + dq},${cr + dr}`;
      if (n === "0,0") continue;
      const d = axialDist(n, to);
      if (d < bestD) { bestD = d; best = n; }
    }
    cur = best; path.push(cur);
  }
  return path;
}
/** Fell the dealt field: blades under the dark, the field's
 *  own blows between casts, until no dark stands. The
 *  optional reinforce runs each cycle — the casual section
 *  passes one that re-summons the fallen and marches the
 *  standing toward the nearest dark, so a wave's tough
 *  bodies (a wave-3 Tangle wears 10) cannot camp out of
 *  reach and stall the proof. */
async function clearField(c, timeoutMs, reinforce = null, stopWhen = null) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (!c.state.dark.length) return true;
    if (stopWhen && stopWhen()) return true;
    if (reinforce) await reinforce().catch(() => {});
    const ids = c.state.dark.map((d) => d.id);
    for (const id of ids) {
      if (!c.state.dark.length) break;
      await castUnderDark(c, id, 3);
    }
    await sleep(600);
  }
  return c.state.dark.length === 0;
}

/* ── §T1 THE TABLE, CAMPAIGN ────────────────────────────── */
{
  console.log("§T1 table campaign — the standing fell, the bench does not");
  const B = await claimBound("Campaign Feller", "runewright");
  // The Camposts are filed at power 1 a part (power 3
  // whole): their summon casts are paid from the
  // campaign bank, and the bank is seeded by the seated
  // Tenders' stakes — a seat's stake is its Table purse,
  // and the purse counts the whole owned roster. A
  // feller who owns nothing but his two posts stakes
  // almost nothing, and the falter charges (every
  // attempt charges the bank — the wheel law,
  // 2026-10-21) can burn it before the second post is
  // called (seen on the road, 2026-10-25). So the
  // feller owns a bench, as §T2's feller does (fixture
  // restated): twenty-four owned non-members deepen his
  // stake; only the two party posts can stand.
  const camp1 = seedAwokin(B.ownerKey, "Campaign Feller", "Campost One", "root", 1, 3);
  const camp2 = seedAwokin(B.ownerKey, "Campaign Feller", "Campost Two", "root", 1, 3);
  for (let i = 0; i < 24; i++) seedAwokin(B.ownerKey, "Campaign Feller", `Campbench ${i + 1}`, "root");
  // The strict company (2026-10-21): only party members
  // stand in the seat's company at the wheel — compose it.
  await call("addToParty", { awakenedId: camp1 }, B.token);
  await call("addToParty", { awakenedId: camp2 }, B.token);
  const ttB = await bindTable({ token: B.token, discordId: "fell-b", discordName: "Campaign Feller" });
  const C = await claimBound("Campaign Bench", "warden");
  seedAwokin(C.ownerKey, "Campaign Bench", "Benchwarmer", "stone");
  const ttC = await bindTable({ token: C.token, discordId: "fell-c", discordName: "Campaign Bench" });

  // ONE batch is the whole proof (fixture restated,
  // 2026-10-25): the old second batch was never an
  // independent fixture — in the same room, the first
  // batch's casts and falters bleed the campaign bank
  // until the bastion falls to ambient pressure before
  // a second dealing (seen on the road: "THE BASTION
  // FALLS" with no dark dealt); in a fresh room, the
  // campaign's bank and company ledger still carry the
  // first batch's spending for this tender (seen: ✦2
  // held, Campost One already spent). What this build
  // must prove about the campaign road — that it pays
  // the pools DIRECTLY, as it always did — one batch
  // proves whole. Accumulation across batches is
  // proven on the homeland road (§H) and at the casual
  // Table (§T2).
  const runBatch = async (room, label) => {
    const st = client(`ST-${label}`);
    await st.join({ devName: "Drops Storytender", room });
    // The seat is claimed in the room (Campaign Build 1) —
    // the join no longer confers it.
    st.send({ type: "claimStoryteller" });
    await st.waitFor((c2) => !!c2.you?.storytender, "the drops storytender's claim", 15000);
    const b = client(`B-${label}`);
    await b.join({ authToken: ttB, room });
    const cc = client(`C-${label}`);
    await cc.join({ authToken: ttC, room });
    const landingB = b.you.landing;
    const companyB = b.you.company ?? [];
    await summonOnto(b, companyB.find((cd) => cd.name === "Campost One").id, landingB);
    await summonOnto(b, companyB.find((cd) => cd.name === "Campost Two").id, landingB);
    ok(`campaign ${label}: the feller stands two Awoken on the field`, b.state.field.filter((u) => u.ownerKey === b.you.key).length === 2);
    ok(`campaign ${label}: the bench seat fields nothing`, cc.state.field.filter((u) => u.ownerKey === cc.you.key).length === 0);
    for (let i = 0; i < 30; i++) st.send({ type: "stAdd", kind: "fray" });
    await st.waitFor((c2) => (c2.you?.storytender?.reserve.length ?? 0) >= 30, "30 fray held in reserve", 15000);
    st.send({ type: "stDeal" });
    await b.waitFor((c2) => c2.state.dark.length >= 30, "30 fray dealt", 20000);
    ok(`campaign ${label}: 30 fray dealt`, b.state.dark.length >= 30, `dealt ${b.state.dark.length}`);
    ok(`campaign ${label}: the field is cleared by the feller's side`, await clearField(b, 240000), `${b.state.dark.length} dark remain`);
    b.ws.close(); cc.ws.close(); st.ws.close();
  };

  await runBatch("campaign-fell-drops", "batch 1");
  const t1 = poolsOf(B.ownerKey);
  console.log("  feller pools after batch 1:", JSON.stringify(t1.m));
  ok("campaign batch 1: the standing feller's pools gained", t1.total > 0, `total ${t1.total}`);
  ok("campaign batch 1: gains in exact tenths", inTenths(t1.total), `total ${t1.total}`);
  ok("campaign batch 1: the bench seat gained nothing", poolsOf(C.ownerKey).total === 0, JSON.stringify(poolsOf(C.ownerKey).m));

}

/* ── §T2 THE TABLE, CASUAL ──────────────────────────────── */
{
  console.log("§T2 table casual — the take gathers in the shared Pack; the drip reaches the killer's pools by his claim");
  const B = await claimBound("Casual Feller", "runewright");
  const waveIds = [];
  // The posts are filed at power 2 a part (power 6 whole):
  // their summon casts roll against DC 16, not 19 — the
  // section needs THREE landings from one purse, and at
  // the power-9 price (✦9, 40% a cast) an honest run of
  // falters starved it twice in three runs. Power 6 still
  // fells fray in good time inside the hunt's budgets.
  for (const n of ["One", "Two", "Three"]) waveIds.push(seedAwokin(B.ownerKey, "Casual Feller", `Wavepost ${n}`, "root", 2, 3));
  // The strict company: the three posts are the party.
  for (const id of waveIds) await call("addToParty", { awakenedId: id }, B.token);
  // A bench of owned non-members deepens the seat's purse
  // (the standing reckoning counts the whole roster) — the
  // summon casts below can falter, and their retries spend.
  for (let i = 0; i < 24; i++) seedAwokin(B.ownerKey, "Casual Feller", `Fellbench ${i + 1}`, "root");
  const ttB = await bindTable({ token: B.token, discordId: "fell-b2", discordName: "Casual Feller", weaponKey: "sword" });
  const C = await claimBound("Casual Witness", "warden");
  seedAwokin(C.ownerKey, "Casual Witness", "Quietstander", "stone");
  const ttC = await bindTable({ token: C.token, discordId: "fell-c2", discordName: "Casual Witness" });

  // The hunt runs over fresh rooms as needed: a single
  // room's geometry can strand a camper at the seed's
  // doorstep out of everyone's reach (probed, 2026-10-21),
  // or deal the landing a fully cursed ring with no pure
  // ground to summon onto (seen 2026-10-25) — fresh
  // rooms average that weather out. The seat's
  // purse is its own (166 at the sit with the bench
  // above, blades at 2) — and since the loot table fix
  // the fells pay their energy as ORBS IN THE PACK, so
  // the hunt claims them as it goes: three summon casts
  // (falters included), then blades and blows paid by
  // the fells themselves, through the Pack.
  // Marching is NOT used: a re-ordered unit glides and
  // strikes nothing, and a march costs 3 a hex the blades
  // need more.
  let totalFells = 0;
  const huntRoom = async (room, target) => {
    const b = client(`B2-${room}`);
    await b.join({ authToken: ttB, room });
    const cc = client(`C2-${room}`);
    await cc.join({ authToken: ttC, room });
    const landingB = b.you.landing;
    const companyB = b.you.company ?? [];
    // A deal can strand the landing: every neighbour
    // cursed means no pure ground to summon a first hand
    // onto, and no hand means no curse strike to open
    // the field (seen on the road, 2026-10-25). The
    // section re-rolls the room — the hunt's proof does
    // not live in any one deal.
    try {
      for (const n of ["One", "Two", "Three"]) {
        await summonOnto(b, companyB.find((cd) => cd.name === `Wavepost ${n}`).id, landingB);
      }
    } catch {
      b.ws.close(); cc.ws.close();
      return { gained: 0, packSeen: 0, packSeenByWitness: 0, witnessClaim: null, attCount: 0, setupFailed: true };
    }
    ok(`casual ${room}: the feller stands three Awoken`, b.state.field.filter((u) => u.ownerKey === b.you.key).length === 3,
      `fielded ${b.state.field.filter((u) => u.ownerKey === b.you.key).length}, energy ${b.you.energy}`);
    // Re-summon any card the dark put down, so the field
    // never stands empty while tough bodies grind on.
    const reinforce = async () => {
      const fielded = new Set(b.state.field.filter((u) => u.ownerKey === b.you.key).map((u) => u.cardId));
      for (const cd of (b.you.company ?? [])) {
        if (fielded.has(cd.id)) continue;
        try { await summonOnto(b, cd.id, landingB); } catch { /* no pure neighbour this cycle */ }
      }
    };
    const seen = new Set();
    const noteSeen = () => { for (const d of b.state.dark) seen.add(d.id); };
    const fellsHere = () => seen.size - b.state.dark.length;
    // THE PROVOKE (fixture restated, 2026-10-25): the
    // casual room has no Begin and no startWave road any
    // more (the Table entry build, live before this one)
    // — the dark enter on their own beat (45 s, two a
    // beat, eight standing at most) once a standing hand
    // strikes the curse. A Wavepost strikes it; then the
    // hunt fells what enters, beat by beat, and the
    // feller claims the Pack's energy orbs as they
    // gather — the fells fund the hunt, as the game now
    // runs. The hunt's patience is the beat's own:
    // twenty-four fells cannot arrive faster than the
    // entry deals them.
    const hand = b.state.field.find((u) => u.ownerKey === b.you.key);
    if (!hand) throw new Error("no standing hand to strike the curse");
    const reach = { stone: 1, root: 2, fire: 2, tide: 3, sky: 4 }[hand.element] ?? 2;
    const mark = b.state.map.find((t) => t.cursed && t.id !== "0,0" && axialDist(t.id, hand.hex) <= reach);
    if (!mark) throw new Error("no cursed tile in reach of " + hand.hex);
    b.send({ type: "strikeCurse", cardId: hand.cardId, hex: hand.hex, target: mark.id });
    await b.waitFor((c2) => c2.state.battle.active && c2.state.dark.length > 0, "the dark enter on their beat", 30000);
    noteSeen();
    const huntStart = Date.now();
    while (totalFells + fellsHere() < target && Date.now() - huntStart < 15 * 60 * 1000) {
      // Claim the orbs the last fells left standing in
      // the Pack — the hunt spends what the dark pays.
      for (const e of (b.state.pack ?? []).filter((x) => x.kind === "energy")) b.send({ type: "claimPack", entryId: e.id });
      await clearField(b, 100000, reinforce, () => { noteSeen(); return totalFells + fellsHere() >= target; });
      noteSeen();
      console.log(`  casual ${room}: ${fellsHere()} felled in this room, ${totalFells + fellsHere()} in the section — the beat deals on`);
      if (totalFells + fellsHere() >= target) break;
      try { await b.waitFor((c2) => c2.state.dark.length > 0, "the next beat's dark", 60000); noteSeen(); }
      catch { break; }
    }
    const gained = fellsHere();
    // THE PACK (the loot table fix): what the hunts left
    // standing in the room's shared Pack — read off BOTH
    // clients (the feller's and the witness's) before the
    // room empties. The witness claims an item into her
    // own inventory; the feller's claim of the same entry
    // must then be refused. The feller claims the
    // attunement gatherings — the road by which the
    // drip now reaches his pools.
    await sleep(500);
    const packSeen = (b.state.pack ?? []).length;
    const packSeenByWitness = (cc.state.pack ?? []).length;
    let witnessClaim = null;
    const itemEntry = (cc.state.pack ?? []).find(e => e.kind === "item" && e.itemKey && e.itemKey !== "rune-shard");
    if (itemEntry) {
      const before = qtyOfKey(C.ownerKey, itemEntry.itemKey);
      cc.send({ type: "claimPack", entryId: itemEntry.id });
      await sleep(700);
      const errMark = b.errors.length;
      b.send({ type: "claimPack", entryId: itemEntry.id });
      await sleep(700);
      witnessClaim = {
        key: itemEntry.itemKey,
        qty: itemEntry.qty,
        before,
        after: qtyOfKey(C.ownerKey, itemEntry.itemKey),
        gone: !(cc.state.pack ?? []).some(e => e.id === itemEntry.id),
        raceRefused: b.errors.slice(errMark).some(m => m.includes("no longer in the Pack")),
      };
    }
    const attEntries = (b.state.pack ?? []).filter(e => e.kind === "attunement");
    for (const e of attEntries) b.send({ type: "claimPack", entryId: e.id });
    if (attEntries.length) await sleep(700);
    b.ws.close(); cc.ws.close();
    return { gained, packSeen, packSeenByWitness, witnessClaim, attCount: attEntries.length };
  };
  let packSeen = 0, packSeenByWitness = 0, witnessClaim = null, attCount = 0;
  for (const roomName of ["table-fell-drops-a", "table-fell-drops-b", "table-fell-drops-c"]) {
    if (totalFells >= 24) break;
    const r = await huntRoom(roomName, 24);
    totalFells += r.gained;
    packSeen += r.packSeen;
    packSeenByWitness += r.packSeenByWitness;
    witnessClaim = witnessClaim ?? r.witnessClaim;
    attCount += r.attCount;
  }
  ok("casual: at least 24 dark were felled by the killer's side across the two rooms", totalFells >= 24, `felled ${totalFells}`);
  ok("casual: the fells' gatherings stood in the shared Pack", packSeen > 0, `pack entries ${packSeen}`);
  ok("casual: the witness's client saw the same Pack", packSeenByWitness > 0, `witness saw ${packSeenByWitness}`);
  ok("casual: the witness claimed an item into her own inventory", !!witnessClaim && witnessClaim.after === witnessClaim.before + witnessClaim.qty, JSON.stringify(witnessClaim));
  ok("casual: the claimed entry left the Pack, and a second claim of it was refused", !!witnessClaim && witnessClaim.gone && witnessClaim.raceRefused, JSON.stringify(witnessClaim));
  const tB = poolsOf(B.ownerKey);
  console.log("  killer pools:", JSON.stringify(tB.m), "| attunement gatherings claimed:", attCount);
  ok("casual: the killer's pools gained — by claiming the attunement gatherings", tB.total > 0, `total ${tB.total}`);
  ok("casual: gains in exact tenths", inTenths(tB.total), `total ${tB.total}`);
  ok("casual: the witness who never took the field gained no attunement", poolsOf(C.ownerKey).total === 0, JSON.stringify(poolsOf(C.ownerKey).m));
}

console.log(`\nFELL DROPS DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
