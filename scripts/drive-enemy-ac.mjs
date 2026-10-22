// drive-enemy-ac — ENEMY AC (Nigel, 2026-10-22): an
// enemy's AC is base 10 + its kind's AC bonus; the bonus
// lives on its workshop record and the referees read it
// live. The old law used the bare bonus as the whole
// target (a Fray was hit on a roll total of 4). This drive
// proves, on a scratch server:
//   §0 the record is served: getGameConfig carries each
//      kind's bonus (4/6/5/8), and the module arithmetic
//      reads AC 14/16/15/18 with the homeland mirror whole.
//   §1 the Table: dealt Frays stand at AC 14 in the served
//      state, and a known striker (stone Awokin, Lv 1 card,
//      bonus +1 — a roll total of 9 was a HIT under the
//      old law) lands at the AC-14 truth of 40%, decisively
//      below the old law's 90%.
//   §2 the homeland: the weapon referee strikes the same
//      AC — a Lv 3 Warden's sword (bonus +1) lands ~40%
//      of 40 forced settles (old law ~90%).
//   §3 the workshop moves the target: setUiConfig writes
//      enemy.fray.armor = 9 through the real workshop API,
//      the served record shows 9, enemyACFor reads 19, and
//      Frays dealt after the edit stand at AC 19.
import WebSocket from "ws";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

const DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-enemy-ac-"));
process.env.DATA_DIR = DATA_DIR;
process.env.PORT = "39981";
process.env.WORKSHOP_PASSWORD = "test-workshop-" + "password";
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
const base = "http://127.0.0.1:39981";
const db = new Database(join(DATA_DIR, "app.db"));
// The migration-order harness workaround (test56's note):
// stand the greeter column up on a fresh database.
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }

const U = [1292 * 40 / 796, 470 * 40 / 796], V = [0, 948 * 40 / 796];
const parseId = (id) => id.split(",").map(Number);
const centerOf = (id) => { const [q, r] = parseId(id); return { x: q * U[0] + r * V[0], y: q * U[1] + r * V[1] }; };
const pxDist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const neighbours = (id) => { const [q, r] = parseId(id); return DIRS.map(([dq, dr]) => `${q + dq},${r + dr}`); };
const meIn = (c) => c.state.players.find(p => p.key === c.you.key);

function client(label) {
  const ws = new WebSocket("ws://127.0.0.1:39981/table/ws");
  const c = { label, ws, state: null, you: null, errors: [], allStrikes: [], strikeIds: new Set() };
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "state") {
      c.state = m.state; c.you = m.you;
      for (const s of m.state.strikes ?? []) {
        if (!c.strikeIds.has(s.id)) { c.strikeIds.add(s.id); c.allStrikes.push({ ...s, seenAt: Date.now() }); }
      }
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
      await sleep(150);
    }
    throw new Error(`${label}: timed out waiting for ${what}`);
  };
  return c;
}

async function call(action, args, token, headers = {}) {
  const res = await fetch(`${base}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}), ...headers },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return { status: res.status, data };
}

/** test56's seeding, kept whole: a bound Tender at Lv 10
 *  with named single-body fighters + energy filler. */
async function seedBoundTender({ tenderName, password, tag, classKey, fighters = [], filler = 0 }) {
  const claim = await call("claimTender", { password, tenderName });
  const token = claim.data.token;
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.data.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, Date.now());
  const now = Date.now();
  const insAsset = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
  const insAwokin = db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)");
  const addAwokin = (name, element, power, toughness) => {
    const bodyId = Number(insAsset.run(`Body ${name}`, "body", power, toughness, element, `test/body-${name}.png`, now).lastInsertRowid);
    const composition = JSON.stringify([{ source_id: `db:${bodyId}`, name: `Body ${name}`, category: "body", rarity: "common", power, toughness, element }]);
    return Number(insAwokin.run(name, name, `test/awokin-${name}.png`, composition, tenderName, ownerKey, now).lastInsertRowid);
  };
  const fighterIds = fighters.map(f => addAwokin(f.name, f.element, f.power, f.toughness));
  for (let i = 0; i < filler; i++) addAwokin(`Filler ${tag}-${i}`, "sky", 2, 2);
  // THE WHEEL LAW (2026-10-21): the deck hand is retired —
  // the party is who a Tender can summon. Stand the fighters
  // in the party ledger directly (harness seeding, as the
  // roster above is seeded), so the wheel's company lists
  // them at the Table.
  const insParty = db.prepare("INSERT OR IGNORE INTO tender_party (owner_key, awakened_id, added_at) VALUES (?, ?, ?)");
  for (const id of fighterIds) insParty.run(ownerKey, id, now);
  await call("chooseClass", { classKey }, token);
  const { issueTableToken } = await import("../server/dist/table.js");
  const tt = issueTableToken({ id: `disc-${tag}`, name: tenderName });
  const code = (await call("getTableBindCode", {}, token)).data.code;
  const bindRes = await fetch(`${base}/api/table/bind`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: tt, code }),
  });
  if (!bindRes.ok) throw new Error(`table/bind -> ${bindRes.status}`);
  return { token, tt, ownerKey };
}

async function joinBound(tt, room, label) {
  const c = client(label);
  await c.join({ authToken: tt, room });
  await c.waitFor(cc => !!meIn(cc)?.pos, "the tender stands in pixel space");
  return c;
}

/** test56 (b)'s company room, kept whole: four stone
 *  Awokin ring the seed so dealt dark veer to a guard
 *  before they can halt at the gate and drain the bank. */
async function companyRoom({ room, tenderName, password, tag }) {
  const st = client(`ST-${tag}`);
  await st.join({ devName: `Story ${tag}`, room });
  // The storytender's seat is claimed in the room, not at
  // the door (Campaign Build 1, 2026-10-21).
  st.send({ type: "claimStoryteller" });
  await st.waitFor(cc => !!cc.you?.storytender, "the storytender's claim lands", 20000);
  const seed = await seedBoundTender({
    tenderName, password, tag, classKey: "warden", filler: 25,
    fighters: [0, 1, 2, 3, 4].map(i => ({ name: `Stone ${tag}-${i}`, element: "stone", power: 3, toughness: 25 })),
  });
  const c = await joinBound(seed.tt, room, tag);
  const landing = c.you.landing;
  await c.waitFor(cc => (cc.you.company ?? []).some(x => x.name.startsWith(`Stone ${tag}-`)), "the wheel's company lists the fighters", 20000);
  // Summon through the action wheel, as the law now keeps it:
  // a cast naming a company member, retried through its
  // falters (each attempt spends its price, as at the Table).
  for (const f of c.you.company.filter(x => x.name.startsWith(`Stone ${tag}-`))) {
    const before = c.state.field.filter(u => u.ownerKey === c.you.key).length;
    if (before >= 4) break;
    let stood = false;
    for (let attempt = 0; attempt < 14 && !stood; attempt++) {
      c.send({ type: "summonCast", awakenedId: f.awokenId, hex: landing });
      stood = await c.waitFor(cc => cc.state.field.filter(u => u.ownerKey === cc.you.key).length > before, `${f.name} stands`, 4000)
        .then(() => true)
        .catch(() => false);
    }
    if (!stood) console.log(`  (summon cast of ${f.name} did not stand: errors=${c.errors.slice(-1).join(" ")} field=${c.state.field.length})`);
  }
  await c.waitFor(cc => cc.state.field.filter(u => u.ownerKey === cc.you.key).length >= 4, "the company stands (four on the landing, stack law)", 20000);
  const axial = (id) => { const [q, r] = parseId(id); return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2; };
  const gateTiles = c.state.map.map(t => t.id)
    .filter(id => axial(id) === 1 && pxDist(centerOf(id), centerOf("0,0")) < 69.2);
  const ring = c.state.field.filter(u => u.ownerKey === c.you.key);
  for (let i = 0; i < Math.min(ring.length, gateTiles.length); i++) {
    c.send({ type: "march", cardId: ring[i].cardId, from: landing, to: gateTiles[i] });
    await sleep(300);
  }
  await c.waitFor(cc => gateTiles.every(t => cc.state.field.some(x => x.ownerKey === cc.you.key && x.hex === t && !x.moving)),
    "the ring guard stands around the seed", 60000)
    .catch(() => console.log(`  (ring guard march incomplete: field=${JSON.stringify(c.state.field.filter(u => u.ownerKey === c.you.key).map(u => [u.hex, !!u.moving]))})`));
  return { st, c, landing, gateTiles };
}

/** Keep the field fed: re-summon the fallen, break gate
 *  stalls, and deal the next batch of Frays when clear —
 *  test56 (b)'s drive discipline, one room at a time. */
function tendRoom(ctx, kind) {
  const standing = ctx.c.state.field.filter(u => u.ownerKey === ctx.c.you.key).length;
  if (standing < 4) {
    const back = ctx.c.you.company.find(x => x.name.startsWith("Stone "));
    if (back && (ctx.c.you.energy ?? 0) >= 3) ctx.c.send({ type: "summonCast", awakenedId: back.awokenId, hex: ctx.landing });
  }
  ctx.bankHigh = Math.max(ctx.bankHigh ?? 0, ctx.c.state.campaign.bank ?? 0);
  if (ctx.c.state.dark.length > 0 && ctx.c.state.battle.active
    && (ctx.c.state.campaign.bank ?? 0) < ctx.bankHigh - 12
    && Date.now() - (ctx.lastStallBreak ?? 0) > 15000) {
    const dark0 = [...ctx.c.state.dark].sort((a, b) => pxDist(a.pos, centerOf("0,0")) - pxDist(b.pos, centerOf("0,0")))[0];
    const guard = ctx.c.state.field.filter(u => u.ownerKey === ctx.c.you.key && !u.moving)
      .sort((a, b) => pxDist(a.pos, dark0.pos) - pxDist(b.pos, dark0.pos))[0];
    const mapIds = new Set(ctx.c.state.map.map(t => t.id));
    const dest = neighbours(dark0.hex).find(id => id !== "0,0" && id !== dark0.hex && mapIds.has(id)
      && !ctx.c.state.field.some(u => u.ownerKey === ctx.c.you.key && u.hex === id));
    if (guard && dest) {
      ctx.c.send({ type: "march", cardId: guard.cardId, from: guard.hex, to: dest });
      ctx.lastStallBreak = Date.now();
    }
  }
  if (ctx.c.state.dark.length === 0) {
    ctx.bankHigh = ctx.c.state.campaign.bank ?? 0;
    for (const u of ctx.c.state.field.filter(x => x.ownerKey === ctx.c.you.key && !x.moving && !ctx.gateTiles.includes(x.hex))) {
      const free = ctx.gateTiles.find(t => !ctx.c.state.field.some(x => x.ownerKey === ctx.c.you.key && x.hex === t));
      if (free) ctx.c.send({ type: "march", cardId: u.cardId, from: u.hex, to: free });
    }
  }
  if (!ctx.c.state.campaign.over && ctx.c.state.dark.length === 0 && !ctx.c.state.battle.active) {
    const reserve = ctx.st.you?.storytender?.reserve.length ?? 0;
    if (reserve === 0) { for (let i = 0; i < 8; i++) ctx.st.send({ type: "stAdd", kind }); }
    else ctx.st.send({ type: "stDeal" });
  }
}

// ── §0 THE RECORD, SERVED ────────────────────────────────
console.log("\n§0 the record, served — bonuses on the config, AC by the arithmetic");
{
  const cfg = (await call("getGameConfig", {})).data;
  check("the served record carries each kind's AC bonus (fray 4, unraveler 6, hollow 5, tangle 8)",
    cfg.enemies.fray.armor === 4 && cfg.enemies.unraveler.armor === 6 && cfg.enemies.hollow.armor === 5 && cfg.enemies.tangle.armor === 8,
    JSON.stringify(cfg.enemies));
  const A = await import("../server/dist/actions.js");
  const T = await import("../server/dist/table.js");
  check("the AC arithmetic: base 10 + bonus reads 14 / 16 / 15 / 18",
    A.enemyACFor("fray") === 14 && A.enemyACFor("unraveler") === 16 && A.enemyACFor("hollow") === 15 && A.enemyACFor("tangle") === 18,
    `${A.enemyACFor("fray")}/${A.enemyACFor("unraveler")}/${A.enemyACFor("hollow")}/${A.enemyACFor("tangle")}`);
  check("the default AC table and the homeland mirror read the same 14 for the Fray",
    T.DARK_ARMOR.fray === 14 && A.HOMELAND_FRAY_ARMOR === 14 && JSON.stringify(T.DARK_ARMOR) === JSON.stringify({ fray: 14, unraveler: 16, hollow: 15, tangle: 18 }),
    JSON.stringify(T.DARK_ARMOR));
}

// ── §1 THE TABLE — Frays at AC 14 ────────────────────────
console.log("\n§1 the Table — dealt Frays stand at AC 14, and the stone company's rate tells it");
{
  // The dealt AC: base 10 + bonus 4, with the campaign's
  // own level scaling riding on top — floor((lvl−1)/2),
  // the scaling the law keeps.
  const dealtAC = (d) => 14 + Math.floor(((d.lvl ?? 1) - 1) / 2);
  let armorViolations = 0, armorSeen = 0;
  let strikes = [];
  // A campaign can FALL mid-proof (the bank drains while
  // the dark stand at the gate), ending its battle early —
  // so the tally gathers across up to two fresh campaigns,
  // each fought until it falls, clears, or fills the count.
  const ROOMS = [
    { room: "campaign-drive-ac-table", tenderName: "AC Table Tender", password: "ac-table-drive", tag: "AC1" },
    { room: "campaign-drive-ac-table-b", tenderName: "AC Table Tender B", password: "ac-table-drive-b", tag: "AC3" },
  ];
  for (const spec of ROOMS) {
    if (strikes.length >= 60) break;
    const ctx = await companyRoom(spec);
    const roomStrikes = () => ctx.c.allStrikes.filter(s => s.side === "light" && !s.weapon && s.element === "stone");
    const start = Date.now();
    while (Date.now() - start < 300000) {
      if (roomStrikes().length >= 45) break;
      if (ctx.c.state.campaign?.over) break;
      for (const d of ctx.c.state.dark) { armorSeen++; if (d.kind !== "fray" || d.armor !== dealtAC(d)) armorViolations++; }
      tendRoom(ctx, "fray");
      await sleep(600);
    }
    strikes = strikes.concat(roomStrikes());
    console.log(`  ${spec.room}: ${roomStrikes().length} stone strikes (campaign ${ctx.c.state.campaign?.over ?? "standing"})`);
    ctx.st.ws.close(); ctx.c.ws.close();
  }
  const n = strikes.length;
  const rate = n ? strikes.filter(s => s.hit).length / n : 0;
  console.log(`  stone company: ${n} strikes, hit rate ${rate.toFixed(3)}`);
  check("every dealt Fray the drive saw stood at base 10 + bonus 4 + the campaign's scaling in the served state",
    armorSeen > 0 && armorViolations === 0, `seen=${armorSeen} violations=${armorViolations}`);
  check("enough witnessed strikes accrued (≥45 stone strikes)", n >= 45, `n=${n}`);
  // The striker's truth: stone +1, Lv 1 card — a roll total
  // of 9 HIT under the old law (target 4); against AC 14
  // the rate centres on .40. The band is ±~2.3σ at n=45.
  check("the hit rate centres on the AC-14 truth (.25–.57; the old law centred on .90)",
    rate >= 0.25 && rate <= 0.57, `rate=${rate.toFixed(3)} n=${n}`);
  check("the old armor-as-target law is decisively excluded (rate < .65)",
    rate < 0.65, `rate=${rate.toFixed(3)}`);
}

// ── §2 THE HOMELAND — the same AC at the weapon referee ──
console.log("\n§2 the homeland — the sword strikes AC 14 there too");
{
  const claim = await call("claimTender", { password: "ac-homeland-drive", tenderName: "AC Homeland Tender" });
  const token = claim.data.token;
  const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.data.tender.code).id}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 200, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 200").run(me, Date.now());
  const seedTile = (q, r, cursed) => Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, ?, ?, ?, ?)").run(me, q, r, cursed, Date.now()).lastInsertRowid);
  seedTile(0, 0, 0);
  const darkTile = seedTile(1, 0, 1);
  seedTile(1, -1, 1); seedTile(0, -1, 1); seedTile(-1, 0, 1); seedTile(-1, 1, 1); seedTile(0, 1, 1);
  await call("chooseClass", { classKey: "warden" }, token);
  await call("chooseWeapon", { weaponKey: "sword" }, token);
  db.prepare("INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pinned_beats) VALUES (?, ?, 'fray', ?, ?, ?)").run(me, darkTile, Date.now(), 100000, 100000);
  const records = [];
  let lastAt = null;
  for (let i = 0; i < 90 && records.length < 40; i++) {
    db.prepare("UPDATE tender_progress SET hp = 9999, down_until = NULL, wanderer_watermark = NULL, weapon_next_at = ? WHERE owner_key = ?").run(Date.now() - 1, me);
    const t = (await call("getTerritory", {}, token)).data;
    const rec = t.weaponStrike;
    if (rec && rec.at !== lastAt) { records.push(rec); lastAt = rec.at; }
  }
  const hits = records.filter(r => r.hit).length;
  console.log(`  homeland sword: ${records.length} strikes, ${hits} hits`);
  check("40 forced settles each produced a fresh strike record", records.length === 40, `records=${records.length}`);
  // The truth: bonus +1 (Lv 3 ladder) vs AC 14 → 40%.
  // Under the old law (target 4) ~36 of 40 would land;
  // the band [6, 26] is the AC-14 truth at ±~3σ.
  check("the homeland hit count centres on the AC-14 truth (6–26 of 40; the old law would land ~36)",
    hits >= 6 && hits <= 26, `hits=${hits}`);
}

// ── §3 THE WORKSHOP MOVES THE TARGET ─────────────────────
console.log("\n§3 the workshop — editing the Fray's bonus moves the dealt AC");
{
  const unlock = await fetch(`${base}/api/workshop/unlock`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "test-workshop-password" }),
  });
  const workshopToken = (await unlock.json())?.token;
  check("the workshop unlocks with its word", unlock.status === 200 && !!workshopToken, `status ${unlock.status}`);
  const WS = { "x-workshop-token": workshopToken };
  await call("setUiConfig", { key: "enemy.fray.armor", value: 9 }, null, WS);
  const cfg = (await call("getGameConfig", {})).data;
  check("the served record now shows the Fray's bonus as 9", cfg.enemies.fray.armor === 9, JSON.stringify(cfg.enemies.fray));
  const A = await import("../server/dist/actions.js");
  check("the referee's arithmetic follows the record: the Fray's AC is now 19",
    A.enemyACFor("fray") === 19, `ac=${A.enemyACFor("fray")}`);

  const ctx = await companyRoom({ room: "campaign-drive-ac-table-2", tenderName: "AC Moved Tender", password: "ac-moved-drive", tag: "AC2" });
  const start = Date.now();
  let seen = [];
  while (Date.now() - start < 120000) {
    if (ctx.c.state.dark.length > 0) { seen = ctx.c.state.dark.map(d => ({ kind: d.kind, armor: d.armor, lvl: d.lvl })); break; }
    tendRoom(ctx, "fray");
    await sleep(600);
  }
  check("Frays dealt after the edit stand at AC 19 (base 10 + the edited bonus 9, plus the campaign's scaling)",
    seen.length > 0 && seen.every(d => d.kind === "fray" && d.armor === 19 + Math.floor(((d.lvl ?? 1) - 1) / 2)),
    JSON.stringify(seen));
  ctx.st.ws.close(); ctx.c.ws.close();
}

console.log(`\ndrive-enemy-ac: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
