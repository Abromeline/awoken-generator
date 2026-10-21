// ITEMS DROPPING — THE FELL DRIP drive (Nigel's kept item,
// 2026-10-20 23:03: "things beaten on both maps drop";
// 17:33: creatures beaten at the Table drop attunement
// points). Boots the real server on a scratch DATA_DIR and
// proves, against the aspect_attunement ledger in the DB:
//   §H HOMELAND — a Tender's weapon fells wanderers standing
//      on FIRE-filed cursed ground: the pools gain, every
//      point lands in FIRE (the ground's own element), in
//      exact tenths; a second batch of fells ACCUMULATES on
//      the first. A weaponless Tender beside living wanderers
//      gains nothing (the no-kill control).
//   §T1 THE TABLE, CAMPAIGN — the Storytender deals fray; the
//      standing Tender fells them (his written blades and his
//      Awoken's blows): his pools gain across two batches,
//      accumulating; a bound seat on the bench (no Awoken on
//      the field) gains nothing.
//   §T2 THE TABLE, CASUAL — waves are dealt and felled by the
//      killer's side: the killer's pools gain; a seated Tender
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
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
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

/* ── §H THE HOMELAND ────────────────────────────────────── */
{
  console.log("§H homeland — the weapon's fells pay the drip, in the ground's element");
  const claim = await call("claimTender", { password: "fell-drops-password", tenderName: "Drip Tender" });
  const token = claim.token;
  const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id}`;
  const now = Date.now();
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(me, now);
  await call("chooseClass", { classKey: "warden" }, token);
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
    for (let i = 0; i < 10 && wanderersLeft() > 0; i++) {
      keepStanding();
      db.prepare("UPDATE tender_progress SET weapon_next_at = ? WHERE owner_key = ?").run(Date.now() - 60000, me);
      await call("getTerritory", {}, token);
    }
    ok(`${label}: every seeded wanderer was felled by the weapon`, wanderersLeft() === 0, `${wanderersLeft()} left`);
  };

  seedWanderers(40);
  await fellAll("batch 1");
  const p1 = poolsOf(me);
  console.log("  pools after batch 1:", JSON.stringify(p1.m));
  ok("batch 1: the pools gained from the fells", p1.total > 0, `total ${p1.total}`);
  ok("batch 1: every point landed in FIRE — the ground the wanderers fell on", Math.abs((p1.m.fire ?? 0) - p1.total) < 1e-9, JSON.stringify(p1.m));
  ok("batch 1: the gains are exact tenths (the drizzle's measure)", inTenths(p1.total), `total ${p1.total}`);

  seedWanderers(40);
  await fellAll("batch 2");
  const p2 = poolsOf(me);
  console.log("  pools after batch 2:", JSON.stringify(p2.m));
  ok("batch 2: repeated kills ACCUMULATE on the first batch", p2.total > p1.total, `${p1.total} -> ${p2.total}`);
  ok("batch 2: still all fire, still exact tenths", Math.abs((p2.m.fire ?? 0) - p2.total) < 1e-9 && inTenths(p2.total), JSON.stringify(p2.m));

  // The no-kill control: classed, weaponless, wanderers alive.
  const cClaim = await call("claimTender", { password: "fell-drops-password", tenderName: "Quiet Tender" });
  const cMe = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(cClaim.tender.code).id}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(cMe, Date.now());
  await call("chooseClass", { classKey: "warden" }, cClaim.token);
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
  if (classKey) await call("chooseClass", { classKey }, token);
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
  const spots = c.state.map.filter((t) => !t.cursed && t.id !== "0,0" && axialDist(t.id, nearId) <= 1);
  for (const s of spots) {
    c.send({ type: "summon", cardId, hex: s.id });
    try { await c.waitFor((cc) => cc.state.field.some((u) => u.cardId === cardId), `summon onto ${s.id}`, 4000); return s.id; } catch { /* next spot */ }
  }
  throw new Error("no summonable pure neighbour of " + nearId);
}
/** Write the Single Blade under a named dark until it stands
 *  or springs (the cast roll fizzles sometimes — retry, as
 *  test63's castUnderDark does). */
async function castUnderDark(c, darkId, tries = 8) {
  for (let i = 0; i < tries; i++) {
    const d = c.state.dark.find((x) => x.id === darkId);
    if (!d) return true; // already felled
    const hex = d.hex;
    const taleLen = (c.state.tale ?? []).length;
    c.send({ type: "castRune", root: "blade", hue: "unaligned", hexes: [hex], pour: 0 });
    try {
      await c.waitFor((cc) =>
        !cc.state.dark.some((x) => x.id === darkId)
        || cc.state.workings.some((w) => w.kind === "rune" && w.hex === hex)
        || (cc.state.tale ?? []).slice(taleLen).some((t) => /unravels|springs/.test(t.text)),
        "the blade stands, springs, or the dark falls", 4000);
      if (!c.state.dark.some((x) => x.id === darkId)) return true;
      if (c.state.workings.some((w) => w.kind === "rune" && w.hex === hex)) return true;
    } catch { /* cast again */ }
    await sleep(250);
  }
  return false;
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
  seedAwokin(B.ownerKey, "Campaign Feller", "Campost One", "root");
  seedAwokin(B.ownerKey, "Campaign Feller", "Campost Two", "root");
  const ttB = await bindTable({ token: B.token, discordId: "fell-b", discordName: "Campaign Feller" });
  const C = await claimBound("Campaign Bench", "warden");
  seedAwokin(C.ownerKey, "Campaign Bench", "Benchwarmer", "stone");
  const ttC = await bindTable({ token: C.token, discordId: "fell-c", discordName: "Campaign Bench" });

  const room = "campaign-fell-drops";
  const st = client("ST");
  await st.join({ devName: "Drops Storytender", room, storytender: true });
  const b = client("B");
  await b.join({ authToken: ttB, room });
  const cc = client("C");
  await cc.join({ authToken: ttC, room });
  const landingB = b.you.landing;
  const handB = b.you.hand ?? [];
  await summonOnto(b, handB.find((cd) => cd.name === "Campost One").id, landingB);
  await summonOnto(b, handB.find((cd) => cd.name === "Campost Two").id, landingB);
  ok("campaign: the feller stands two Awoken on the field", b.state.field.filter((u) => u.ownerKey === b.you.key).length === 2);
  ok("campaign: the bench seat fields nothing", cc.state.field.filter((u) => u.ownerKey === cc.you.key).length === 0);

  const dealBatch = async (n) => {
    for (let i = 0; i < n; i++) st.send({ type: "stAdd", kind: "fray" });
    await st.waitFor((c2) => (c2.you?.storytender?.reserve.length ?? 0) >= n, `${n} fray held in reserve`, 15000);
    st.send({ type: "stDeal" });
    await b.waitFor((c2) => c2.state.dark.length >= n, `${n} fray dealt`, 20000);
    return b.state.dark.length;
  };

  const dealt1 = await dealBatch(30);
  ok(`campaign batch 1: ${dealt1} fray dealt`, dealt1 >= 30, `dealt ${dealt1}`);
  ok("campaign batch 1: the field is cleared by the feller's side", await clearField(b, 240000), `${b.state.dark.length} dark remain`);
  const t1 = poolsOf(B.ownerKey);
  console.log("  feller pools after batch 1:", JSON.stringify(t1.m));
  ok("campaign batch 1: the standing feller's pools gained", t1.total > 0, `total ${t1.total}`);
  ok("campaign batch 1: gains in exact tenths", inTenths(t1.total), `total ${t1.total}`);
  ok("campaign batch 1: the bench seat gained nothing", poolsOf(C.ownerKey).total === 0, JSON.stringify(poolsOf(C.ownerKey).m));

  const dealt2 = await dealBatch(30);
  ok(`campaign batch 2: ${dealt2} more fray dealt`, dealt2 >= 30, `dealt ${dealt2}`);
  ok("campaign batch 2: the field is cleared again", await clearField(b, 240000), `${b.state.dark.length} dark remain`);
  const t2 = poolsOf(B.ownerKey);
  console.log("  feller pools after batch 2:", JSON.stringify(t2.m));
  ok("campaign batch 2: repeated kills ACCUMULATE", t2.total > t1.total, `${t1.total} -> ${t2.total}`);
  ok("campaign batch 2: the bench seat still holds nothing", poolsOf(C.ownerKey).total === 0, JSON.stringify(poolsOf(C.ownerKey).m));
  b.ws.close(); cc.ws.close(); st.ws.close();
}

/* ── §T2 THE TABLE, CASUAL ──────────────────────────────── */
{
  console.log("§T2 table casual — the killer's pools catch the drip");
  const B = await claimBound("Casual Feller", "runewright");
  for (const n of ["One", "Two", "Three"]) seedAwokin(B.ownerKey, "Casual Feller", `Wavepost ${n}`, "root");
  const ttB = await bindTable({ token: B.token, discordId: "fell-b2", discordName: "Casual Feller", weaponKey: "sword" });
  const C = await claimBound("Casual Witness", "warden");
  seedAwokin(C.ownerKey, "Casual Witness", "Quietstander", "stone");
  const ttC = await bindTable({ token: C.token, discordId: "fell-c2", discordName: "Casual Witness" });

  // The hunt runs over TWO fresh rooms: a room's deep waves
  // wear deepening bodies (a wave-4 Tangle wears 11) and
  // grind long past the claim's need, and a single room's
  // geometry can strand a camper at the seed's doorstep out
  // of everyone's reach (probed, 2026-10-21). Two wave
  // ladders from the bottom average that weather out. The
  // seat's purse is its own (28 at the sit, +3 a fell,
  // blades at 2) — the hunt lives inside that economy:
  // three summons, then blades and blows paid by the fells
  // themselves. Marching is NOT used: a re-ordered unit
  // glides and strikes nothing, and a march costs 3 a hex
  // the blades need more.
  let totalFells = 0;
  const huntRoom = async (room, target) => {
    const b = client(`B2-${room}`);
    await b.join({ authToken: ttB, room });
    const cc = client(`C2-${room}`);
    await cc.join({ authToken: ttC, room });
    const landingB = b.you.landing;
    const handB = b.you.hand ?? [];
    for (const n of ["One", "Two", "Three"]) {
      await summonOnto(b, handB.find((cd) => cd.name === `Wavepost ${n}`).id, landingB);
    }
    ok(`casual ${room}: the feller stands three Awoken`, b.state.field.filter((u) => u.ownerKey === b.you.key).length === 3,
      `fielded ${b.state.field.filter((u) => u.ownerKey === b.you.key).length}, energy ${b.you.energy}`);
    // Re-summon any card the dark put down, so the field
    // never stands empty while tough bodies grind on.
    const reinforce = async () => {
      const fielded = new Set(b.state.field.filter((u) => u.ownerKey === b.you.key).map((u) => u.cardId));
      for (const cd of (b.you.hand ?? [])) {
        if (fielded.has(cd.id)) continue;
        try { await summonOnto(b, cd.id, landingB); } catch { /* no pure neighbour this cycle */ }
      }
    };
    const seen = new Set();
    const noteSeen = () => { for (const d of b.state.dark) seen.add(d.id); };
    const fellsHere = () => seen.size - b.state.dark.length;
    const beginWave = async () => {
      b.send({ type: "startWave" });
      try { await b.waitFor((c2) => c2.state.battle.active && c2.state.dark.length > 0, "the wave is dealt (startWave)", 6000); }
      catch { b.send({ type: "begin" }); await b.waitFor((c2) => c2.state.battle.active && c2.state.dark.length > 0, "the wave is dealt (begin)", 20000); }
      noteSeen();
    };
    let waves = 0;
    while (totalFells + fellsHere() < target && waves < 4) {
      waves++;
      await beginWave();
      await clearField(b, 240000, reinforce, () => { noteSeen(); return totalFells + fellsHere() >= target; });
      noteSeen();
      console.log(`  casual ${room} wave ${waves}: ${b.state.dark.length === 0 ? "fully felled" : "hunt moved on"} — ${fellsHere()} felled in this room, ${totalFells + fellsHere()} in the section`);
      await sleep(500);
    }
    const gained = fellsHere();
    b.ws.close(); cc.ws.close();
    return gained;
  };
  totalFells += await huntRoom("table-fell-drops-a", 24);
  if (totalFells < 24) totalFells += await huntRoom("table-fell-drops-b", 24);
  ok("casual: at least 24 dark were felled by the killer's side across the two rooms", totalFells >= 24, `felled ${totalFells}`);
  const tB = poolsOf(B.ownerKey);
  console.log("  killer pools:", JSON.stringify(tB.m));
  ok("casual: the killer's pools gained from his fells", tB.total > 0, `total ${tB.total}`);
  ok("casual: gains in exact tenths", inTenths(tB.total), `total ${tB.total}`);
  ok("casual: the witness who never took the field gained nothing", poolsOf(C.ownerKey).total === 0, JSON.stringify(poolsOf(C.ownerKey).m));
}

console.log(`\nFELL DROPS DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
