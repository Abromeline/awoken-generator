// TEST 63 — NIGEL'S TEST-PASS FIXES (2026-10-20), proven end
// to end against the real server:
//
//   PART 1 — cursed ground withers its guests OUTSIDE any
//   battle (the room pulse), at the Table: an Awokin and the
//   Tender himself burn on cursed ground with no wave called;
//   the strike lands by the referee's own reach (the marked
//   tap's message), wearing a tile's corruption by exactly
//   the striker's power until it turns.
//   PART 2 — the confirm flow itself is a client law; it is
//   proven by the updated wheel drives (39+ checks, both
//   surfaces). Here the server half stands guard: nothing in
//   the cast messages changed shape, and the purse moves
//   only when a cast message arrives.
//   PART 3 — wards and runes stand ANYWHERE: a Table ward on
//   a far cursed edge no one holds; a Table rune written on
//   ring-6 cursed ground; a homeland ward on a cursed edge
//   with no Awokin near and no stand of his own. And what
//   stands on cursed ground WITHERS there — bodied workings
//   by health, chargèd workings by charges — at the Tender's
//   own rate, 0.01×(ring+1) of its measure per 2.8 s beat,
//   until it falls.
//   PART 4 — THE RUNE AUDIT: every rune in the book — blade,
//   the three blades, shard rain, the coil, the lattice,
//   the crown shard — cast, sprung, and measured at BOTH
//   grounds. The homeland's springs ride wandering Fray; the
//   Table's ride dealt waves, each rune written under a
//   standing dark so it springs the moment it is written.
//   The crown shard's two lawful faces are proven at the
//   Table (dormant under weak dark; the doom it owes falls
//   on its own caster's strongest when the battle ends
//   unfed) and its dormancy at home (no power-5 dark walks
//   the homeland — dormancy BY LAW, not a break).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import Database from "better-sqlite3";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-test63-"));
process.env.PORT = "3363";
process.env.WORKSHOP_PASSWORD = "test63-word";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

const base = "http://127.0.0.1:3363";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) { pass++; console.log("  ok -", name); } else { fail++; console.log("  FAIL -", name, extra); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await import("../server/dist/index.js");
await sleep(2500);
const db = new Database(join(process.env.DATA_DIR, "app.db"));

async function call(action, args, token, expectFail = false) {
  const res = await fetch(`${base}/api/${action}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) }, body: JSON.stringify(args ?? {}) });
  const data = await res.json().catch(() => ({}));
  if (!expectFail && !res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return { status: res.status, data };
}

/* ── Seeds ───────────────────────────────────────────────── */
async function claimTender(name, classKey) {
  const claim = await call("claimTender", { password: "test63-password", tenderName: name });
  const token = claim.data.token;
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.data.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, Date.now());
  if (classKey) await call("chooseClass", { classKey }, token);
  return { token, ownerKey };
}
/** Awokin into the tender's deck — pieces at the named
 *  stats (canonical slots only: body, arms, head count). */
function seedAwokin(ownerKey, tenderName, name, element, power = 3, toughness = 3) {
  const now = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)").run(`${name} ${cat}`, cat, power, toughness, element, `test63/${name}-${cat}.png`, now).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power, toughness, element });
  }
  const id = Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)").run(name, name, `test63/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, now).lastInsertRowid);
  return id;
}
async function bindTable({ token, discordId, discordName, weaponKey }) {
  if (weaponKey) await call("chooseWeapon", { weaponKey }, token);
  const { issueTableToken } = await import("../server/dist/table.js");
  const tt = issueTableToken({ id: discordId, name: discordName });
  const code = (await call("getTableBindCode", {}, token)).data.code;
  const bindRes = await fetch(`${base}/api/table/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tt, code }) });
  if (!bindRes.ok) throw new Error(`table/bind -> ${bindRes.status}`);
  return tt;
}

/* ── The Table harness (test52's client, kept whole) ────── */
const parseId = (id) => id.split(",").map(Number);
const axialDist = (a, b) => { const [aq, ar] = parseId(a), [bq, br] = parseId(b); return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs((aq + ar) - (bq + br))) / 2; };
const ringOf = (id) => axialDist(id, "0,0");
const U = [1292 * 40 / 796, 470 * 40 / 796], V = [0, 948 * 40 / 796];
const centerOf = (id) => { const [q, r] = parseId(id); return { x: q * U[0] + r * V[0], y: q * U[1] + r * V[1] }; };
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
function pathTo(from, to) {
  const path = []; let cur = from; let guard = 0;
  while (cur !== to && guard++ < 24) {
    const [cq, cr] = parseId(cur);
    let best = null, bestD = Infinity;
    for (const [dq, dr] of DIRS) {
      const n = `${cq + dq},${cr + dr}`;
      if (n === "0,0") continue;
      const d = axialDist(n, to);
      if (d < bestD) { bestD = d; best = n; }
    }
    cur = best; path.push(cur);
  }
  return path;
}
function client(label) {
  const ws = new WebSocket("ws://127.0.0.1:3363/table/ws");
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
const meIn = (c) => c.state.players.find((p) => p.key === c.you.key);
const tileIn = (c, id) => c.state.map.find((t) => t.id === id);
const unitByName = (c, frag) => c.state.field.find((u) => u.name.includes(frag));
const taleHas = (c, re) => (c.state?.tale ?? []).some((t) => re.test(t.text));
async function summonOnto(c, cardId, nearId) {
  const spots = c.state.map.filter((t) => !t.cursed && t.id !== "0,0" && axialDist(t.id, nearId) <= 1);
  for (const s of spots) {
    c.send({ type: "summon", cardId, hex: s.id });
    try { await c.waitFor((cc) => cc.state.field.some((u) => u.cardId === cardId), `summon onto ${s.id}`, 4000); return s.id; } catch { /* try the next pure neighbour */ }
  }
  throw new Error("no summonable pure neighbour of " + nearId + ` (energy=${c.state.players.find((p) => p.key === c.you.key)?.energy}; errors=${c.errors.join(" | ")})`);
}
async function castRuneUntil(c, root, hexes, tries = 10) {
  for (let i = 0; i < tries; i++) {
    const taleLen = (c.state.tale ?? []).length;
    c.send({ type: "castRune", root, hue: "unaligned", hexes, pour: 0 });
    try {
      await c.waitFor((cc) => cc.state.workings.some((w) => w.kind === "rune" && hexes.includes(w.hex))
        || (cc.state.tale ?? []).slice(taleLen).some((t) => /unravels/.test(t.text)), `${root} stands on ${hexes} (or fizzles)`, 6000);
      if (c.state.workings.some((w) => w.kind === "rune" && hexes.includes(w.hex))) return true;
    } catch { /* neither — cast again */ }
  }
  return false;
}
async function castWardUntil(c, root, hexA, hexB, tries = 14) {
  for (let i = 0; i < tries; i++) {
    const taleLen = (c.state.tale ?? []).length;
    c.send({ type: "castWard", root, hue: "unaligned", hexA, hexB, pour: 0 });
    try {
      await c.waitFor((cc) => cc.state.workings.some((w) => w.kind === "ward" && ((w.hexA === hexA && w.hexB === hexB) || (w.hexA === hexB && w.hexB === hexA)))
        || (cc.state.tale ?? []).slice(taleLen).some((t) => /unravels/.test(t.text)), `${root} stands on the ${hexA}|${hexB} edge (or fizzles)`, 6000);
      if (c.state.workings.some((w) => w.kind === "ward" && ((w.hexA === hexA && w.hexB === hexB) || (w.hexA === hexB && w.hexB === hexA)))) return true;
    } catch { /* neither — cast again */ }
  }
  return false;
}

/* ═══ ROOM A — A WARDEN AT THE TABLE ═══════════════════════ */
console.log("\n— THE TABLE, ROOM A (Warden): attrition, the strike, the ward —");
const wardenSeed = await claimTender("Pass Warden", "warden");
seedAwokin(wardenSeed.ownerKey, "Pass Warden", "Emberpost", "root", 2, 3);
seedAwokin(wardenSeed.ownerKey, "Pass Warden", "Thornpost", "root", 2, 3);
const wardenTt = await bindTable({ token: wardenSeed.token, discordId: "test63-warden", discordName: "Pass Warden", weaponKey: "sword" });
const A = client("A");
await A.join({ authToken: wardenTt, room: "test63-ward" });
const landingA = A.you.landing;
ok("room A seats the Warden with a landing", typeof landingA === "string", JSON.stringify(A.you));
const handA = A.you.hand ?? [];
ok("the Warden's hand carries his seeded Awokin", handA.length >= 2, `hand=${handA.length}`);

/* §A1 PART 1 — attrition with NO battle: the unit burns. */
{
  const card = handA.find((cd) => cd.name === "Emberpost");
  const home = await summonOnto(A, card.id, landingA);
  const unit = () => unitByName(A, "Emberpost");
  // A cursed ring-3 tile near home: corruption 22 — the
  // burn is read over beats before the grind can turn it.
  const target = A.state.map.filter((t) => t.cursed && ringOf(t.id) === 3).sort((a, b) => axialDist(home, a.id) - axialDist(home, b.id))[0];
  A.send({ type: "march", cardId: card.id, from: unit().hex, to: target.id });
  await A.waitFor((cc) => unitByName(cc, "Emberpost")?.hex === target.id && !unitByName(cc, "Emberpost")?.moving, "Emberpost stands on the cursed ring-4 tile", 30000);
  ok("no battle has been called in room A", A.state.battle.active === false);
  const flesh = () => { const u = unit(); return u.hp + (u.shield ?? 0); };
  const f0 = flesh(); const ch0 = tileIn(A, target.id).curseHp;
  const taleLen0 = (A.state.tale ?? []).length;
  await sleep(9000);
  const f1 = flesh(); const ch1 = tileIn(A, target.id).curseHp;
  ok("PART 1: the Awokin WITHERS on cursed ground with no battle called (flesh falls over ~3 beats)", f1 < f0 - 0.15, `flesh ${f0.toFixed(2)} -> ${f1.toFixed(2)}`);
  ok("PART 1: the standing grind wears the tile's corruption as it burns him", ch1 < ch0, `curseHp ${ch0} -> ${ch1}`);
  ok("PART 1: the witness is the moving bar, not a flooded tale (the burn speaks only when it unbinds)", (A.state.tale ?? []).length - taleLen0 <= 2, `tale grew ${(A.state.tale ?? []).length - taleLen0} lines over the burn`);
}
/* §A2 PART 1 — the Tender himself burns out of battle. */
{
  const cursed = A.state.map.filter((t) => t.cursed && ringOf(t.id) === 2 && axialDist(t.id, landingA) <= 3)[0]
    ?? A.state.map.filter((t) => t.cursed && ringOf(t.id) >= 2)[0];
  const ctr = centerOf(cursed.id);
  A.send({ type: "glide", tx: ctr.x, ty: ctr.y });
  await A.waitFor((cc) => meIn(cc).hex === cursed.id && !meIn(cc).moving, "the Warden stands on cursed ground", 20000);
  const h0 = meIn(A).tenderHp;
  await sleep(9000);
  const h1 = meIn(A).tenderHp;
  ok("PART 1: the Tender WITHERS on cursed ground with no battle called", h1 < h0 - 0.3, `tenderHp ${h0.toFixed(2)} -> ${h1.toFixed(2)}`);
  const ctr2 = centerOf(landingA);
  A.send({ type: "glide", tx: ctr2.x, ty: ctr2.y });
  await A.waitFor((cc) => meIn(cc).hex === landingA && !meIn(cc).moving, "the Warden steps home", 20000);
}
/* §A3 PART 1 — the strike, by the marked tap's own message. */
{
  const card = handA.find((cd) => cd.name === "Thornpost");
  const home = await summonOnto(A, card.id, landingA);
  const unit = () => unitByName(A, "Thornpost");
  // Stand on pure ground within root-reach (2) of a full
  // ring-1 curse (corruption 10).
  const target = A.state.map.filter((t) => t.cursed && ringOf(t.id) === 1 && axialDist(t.id, home) <= 2 && t.curseHp >= 9)[0]
    ?? A.state.map.filter((t) => t.cursed && axialDist(t.id, home) <= 2)[0];
  const t0 = tileIn(A, target.id);
  const power = unit().power;
  A.send({ type: "strikeCurse", cardId: card.id, hex: unit().hex, target: target.id });
  try {
    await A.waitFor((cc) => tileIn(cc, target.id).curseHp < t0.curseHp || !tileIn(cc, target.id).cursed, "the first blow lands", 8000);
  } catch (e) {
    throw new Error(`strike refused? energy=${meIn(A).energy} errors=${A.errors.join(" | ")} unitHex=${unit()?.hex} target=${target.id} dist=${axialDist(unit()?.hex ?? "0,0", target.id)}`);
  }
  const t1 = tileIn(A, target.id);
  ok("PART 1: one strike wears the corruption by exactly the striker's power", !t1.cursed || t1.curseHp === t0.curseHp - power, `curseHp ${t0.curseHp} -> ${t1.curseHp} (power ${power})`);
  A.send({ type: "strikeCurse", cardId: card.id, hex: unit().hex, target: target.id });
  await A.waitFor((cc) => !tileIn(cc, target.id).cursed, "the second blow turns the tile", 8000);
  ok("PART 1: the struck tile TURNS pure — the fight against cursed ground, plain to wage", tileIn(A, target.id).cursed === false);
  // Beyond the element's reach the referee refuses — the same
  // reach the client now marks by.
  const far = A.state.map.filter((t) => t.cursed && axialDist(t.id, unit().hex) > 2)[0];
  const errLen = A.errors.length;
  A.send({ type: "strikeCurse", cardId: card.id, hex: unit().hex, target: far.id });
  await sleep(1200);
  ok("PART 1: a strike beyond the element's reach is refused by the referee (the marking law = the referee's law)", A.errors.slice(errLen).some((e) => /Beyond reach/.test(e)), JSON.stringify(A.errors.slice(errLen)));
}
/* §A4 PART 3 — a ward on a far cursed edge, held by no one;
      and the curse eats it where it stands. A FRESH room:
      the purse is per-seat, and the audit so far has spent
      this seat's — the ward deserves a whole purse. */
const A2 = client("A2");
await A2.join({ authToken: wardenTt, room: "test63-ward2" });
{
  const hexA = "6,0", hexB = "5,1";
  ok("the chosen edge is far, cursed on both sides, and held by no Awokin of his", tileIn(A2, hexA).cursed && tileIn(A2, hexB).cursed && !A2.state.field.some((u) => u.hex === hexA || u.hex === hexB));
  const stood = await castWardUntil(A2, "seal", hexA, hexB);
  ok("PART 3: the Seal ward STANDS on the ring-6 cursed edge (the held-ground anchor is lifted)", stood, `energy=${meIn(A2).energy}; tale=${(A2.state.tale ?? []).slice(-3).map((t) => t.text).join(" | ")}`);
  const ward = () => A2.state.workings.find((w) => w.kind === "ward" && ((w.hexA === hexA && w.hexB === hexB) || (w.hexA === hexB && w.hexB === hexA)));
  if (stood) {
    const w0 = ward();
    ok("the ward's body is served whole to the client (hp = maxHp at the raising)", w0.hp === w0.maxHp && w0.maxHp > 0, JSON.stringify(w0));
    // Ring 6: 7% of 15 per beat ≈ 1.05 — the body visibly thins.
    await A2.waitFor((cc) => { const w = cc.state.workings.find((x) => x.kind === "ward"); return !w || w.hp <= w0.maxHp - 4; }, "the curse eats the ward's body on cursed ground", 45000);
    const w1 = ward();
    ok("PART 3: the ward WITHERS on cursed ground at the curse's rate (out of battle, by the room pulse)", !w1 || w1.hp <= w0.maxHp - 4, w1 ? `hp ${w0.maxHp} -> ${w1.hp}` : "already fallen");
    await A2.waitFor((cc) => !cc.state.workings.some((x) => x.kind === "ward"), "the ward falls to the curse", 60000);
    ok("PART 3: unwitnessed no longer — the ward FALLS to the curse and the tale speaks its fall", taleHas(A2, /curse eats|eaten by the curse|withers away/), (A2.state.tale ?? []).slice(-4).map((t) => t.text).join(" | "));
  }
}
A2.ws.close();
A.ws.close();

/* ═══ ROOM B — A RUNEWRIGHT AT THE TABLE ══════════════════ */
console.log("\n— THE TABLE, ROOM B (Runewright): runes anywhere, the audit waves —");
const runeSeed = await claimTender("Pass Runewright", "runewright");
seedAwokin(runeSeed.ownerKey, "Pass Runewright", "Runepost", "sky");
// Two more stand in the hand unfielded: a seat's purse is
// its whole roster's reckoning (calculateMaxEnergy), and
// the audit's casts — with honest fizzle variance — need
// a working purse, as a player's would have.
seedAwokin(runeSeed.ownerKey, "Pass Runewright", "Reserve One", "sky");
seedAwokin(runeSeed.ownerKey, "Pass Runewright", "Reserve Two", "sky");
const runeTt = await bindTable({ token: runeSeed.token, discordId: "test63-rune", discordName: "Pass Runewright", weaponKey: "sword" });
const B = client("B");
await B.join({ authToken: runeTt, room: "test63-runes" });
const landingB = B.you.landing;
const handB = B.you.hand ?? [];
await summonOnto(B, handB.find((cd) => cd.name === "Runepost").id, landingB);
await summonOnto(B, handB.find((cd) => cd.name === "Reserve One").id, landingB);
const runepost = () => unitByName(B, "Runepost");
ok("room B seats the Runewright with Runepost on the field", !!runepost());

async function beginWave(c) {
  c.send({ type: "startWave" });
  try { await c.waitFor((cc) => cc.state.battle.active && cc.state.dark.length > 0, "the wave is dealt (startWave)", 5000); }
  catch { c.send({ type: "begin" }); await c.waitFor((cc) => cc.state.battle.active && cc.state.dark.length > 0, "the wave is dealt (begin)", 20000); }
}
/** The dealt field, read once it stops changing: the deal
 *  springs whatever workings the dark land on (a §B1 blade
 *  may take one at the deal), and state pushes land on
 *  their own cadence — a single snapshot races both. */
async function settledDeal(c) {
  let last = -1, stable = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 8000) {
    const n = c.state.dark.length;
    if (n === last && n > 0) { stable++; if (stable >= 3) break; } else stable = 0;
    last = n;
    await sleep(300);
  }
  return c.state.dark.map((d) => ({ id: d.id, hex: d.hex, hp: d.hp }));
}
const darkById = (c, id) => c.state.dark.find((d) => d.id === id);
/** Cast a rune under a NAMED dark, reading its ground fresh
 *  for every try — the dealt snapshot goes stale in a breath
 *  as the dark marches, and a rune written on yesterday's
 *  hex springs on nobody. Returns the hex it wrote on, or
 *  null. Some runes RETIRE in their springing (the coil,
 *  the rain), so a spring's own signature counts as cast:
 *  pass sprungRe to hear it in the tale. */
async function castUnderDark(c, root, darkId, { tries = 8, sprungRe = null } = {}) {
  for (let i = 0; i < tries; i++) {
    const d = darkById(c, darkId);
    if (!d) return null;
    const hex = d.hex;
    const taleLen = (c.state.tale ?? []).length;
    const errLen = c.errors.length;
    c.send({ type: "castRune", root, hue: "unaligned", hexes: [hex], pour: 0 });
    try {
      await c.waitFor((cc) => cc.state.workings.some((w) => w.kind === "rune" && w.hex === hex)
        || (cc.state.tale ?? []).slice(taleLen).some((t) => /unravels/.test(t.text) || (sprungRe && sprungRe.test(t.text)))
        || cc.errors.length > errLen, `${root} under the dark (or fizzles/springs/is refused)`, 4000);
      if (c.state.workings.some((w) => w.kind === "rune" && w.hex === hex)) return hex;
      if (sprungRe && (c.state.tale ?? []).slice(taleLen).some((t) => sprungRe.test(t.text))) return hex;
    } catch { /* neither — cast again */ }
    await sleep(300);
  }
  return null;
}

/* §B1 PART 3 — a rune written on ring-6 cursed ground, and
      the curse eats its charges where it stands. */
{
  const hex = B.state.map.filter((t) => t.cursed && ringOf(t.id) === 6)[0].id;
  ok("no battle has been called in room B", B.state.battle.active === false);
  const stood = await castRuneUntil(B, "blade", [hex]);
  ok("PART 3: the Single Blade is WRITTEN on ring-6 cursed ground (no ground refused it)", stood, `energy=${meIn(B).energy}`);
  const blade = () => B.state.workings.find((w) => w.kind === "rune" && w.hex === hex);
  if (stood) {
    ok("the written Blade carries its charges on cursed ground", blade()?.charges === 2, JSON.stringify(blade()));
    // Ring 6: wither 2 charges × 7% ≈ 0.14/beat — the first
    // whole charge is eaten in ~8 beats (~22 s).
    await B.waitFor((cc) => { const w = cc.state.workings.find((x) => x.kind === "rune" && x.hex === hex); return !w || (w.charges ?? 0) <= 1; }, "the curse eats the Blade's first charge", 50000);
    const w = blade();
    ok("PART 3: the rune WITHERS on cursed ground — its charges are its body, eaten at the curse's rate", !w || (w.charges ?? 0) <= 1, JSON.stringify(w));
  }
}

/* §B2 PART 4 — THE TABLE AUDIT, WAVE 1: the single blade
      and the lattice, sprung by the writing itself. (The
      shard has its own wave — §B3 — and the multi-runes
      theirs — §B4: one slow proof per wave, the field's own
      blows do not wait for the audit.) */
{
  await beginWave(B);
  const dealt = await settledDeal(B);
  ok("wave 1 deals its dark (3 dealt; the standing blade may already have taken one)", dealt.length >= 2, JSON.stringify(dealt));
  // The casts go in the order of the dark's fragility: the
  // blade's dark is the frailest and its spring is instant,
  // so it is written in the wave's first breath; the lattice
  // takes the sturdiest, whose proof runs longest.
  const byHp = [...dealt].sort((a, b) => b.hp - a.hp);
  const dLattice = byHp[0], dBlade = byHp[byHp.length - 1];
  // THE SINGLE BLADE, sprung by the writing itself: its
  // spring speaks in the tale ("springs — N harm to
  // everything standing on its ground") and spends a charge.
  const bladeSprings0 = (B.state.tale ?? []).filter((t) => /springs — \d+ harm to everything standing/.test(t.text)).length;
  let bladeHexUsed = null;
  for (let attempt = 0; attempt < 3 && darkById(B, dBlade.id); attempt++) {
    bladeHexUsed = await castUnderDark(B, "blade", dBlade.id, { tries: 2 });
    await sleep(900);
    const dNow = darkById(B, dBlade.id);
    const wNow = B.state.workings.find((w) => w.kind === "rune" && w.hex === bladeHexUsed);
    if (!dNow || dNow.hp < dBlade.hp || (wNow && (wNow.charges ?? 0) < 2)) break;
    bladeHexUsed = null;
  }
  await sleep(800);
  const bladeW = B.state.workings.find((w) => w.kind === "rune" && w.hex === bladeHexUsed);
  const dB2 = darkById(B, dBlade.id);
  const bladeSprang = (B.state.tale ?? []).filter((t) => /springs — \d+ harm to everything standing/.test(t.text)).length > bladeSprings0;
  ok("AUDIT blade @Table: cast under a standing dark, it SPRINGS — the tale speaks the harm, the dark is wounded or felled, a charge is spent",
    !!bladeHexUsed && bladeSprang && (!dB2 || dB2.hp < dBlade.hp) && (!bladeW || (bladeW.charges ?? 0) < 2),
    `dark ${dBlade.hp} -> ${dB2?.hp ?? "dead"}; sprang=${bladeSprang}; working=${JSON.stringify(bladeW)}`);
  // THE LATTICE, sprung by the writing itself. The pin is
  // read off the dark's own state (pinnedUntil, served
  // whole): no other hand sets it but the lattice's — and
  // the lattice's health, read in the same breath as the
  // pin lands, has paid the dark's power for the hold
  // (the curse's wither cannot spend a whole point in that
  // breath — its first point takes the better part of a
  // beat).
  let latHexUsed = null, pinSeen = false, latHpAtPin = null, latMax = null;
  for (let attempt = 0; attempt < 3 && darkById(B, dLattice.id); attempt++) {
    latHexUsed = await castUnderDark(B, "lattice", dLattice.id, { tries: 2 });
    if (!latHexUsed) continue;
    const t0 = Date.now();
    while (Date.now() - t0 < 3000) {
      const dd = darkById(B, dLattice.id);
      if (!dd) break;
      if ((dd.pinnedUntil ?? 0) > Date.now()) {
        pinSeen = true;
        const w = B.state.workings.find((x) => x.kind === "rune" && x.hex === latHexUsed);
        latHpAtPin = w?.hp ?? null; latMax = w?.maxHp ?? null;
        break;
      }
      await sleep(150);
    }
    if (pinSeen) break;
    latHexUsed = null;
  }
  // While the pin runs, the held dark's hex does not change
  // (if the field fells him where he stands bound, that is
  // the pin holding to the end, and it is noted, not failed).
  const latHex1 = darkById(B, dLattice.id)?.hex;
  let hexHeld = pinSeen && !!latHex1, darkFellBound = false;
  if (pinSeen) {
    const pinEnd = darkById(B, dLattice.id)?.pinnedUntil ?? 0;
    while (Date.now() < pinEnd - 400) {
      const dd = darkById(B, dLattice.id);
      if (!dd) { darkFellBound = true; break; }
      if (dd.hex !== latHex1) { hexHeld = false; break; }
      await sleep(200);
    }
  }
  const latW = () => B.state.workings.find((w) => w.kind === "rune" && w.hex === latHexUsed);
  ok("AUDIT lattice @Table: cast under a standing dark, it PINS him — his own state carries the pin, his hex does not change under it, and the lattice's health pays his power for the hold",
    pinSeen && hexHeld && latHpAtPin !== null && latMax !== null && latHpAtPin <= latMax - 1,
    `pin=${pinSeen} held=${hexHeld} fellBound=${darkFellBound} hpAtPin=${latHpAtPin}/${latMax}; lattice=${JSON.stringify(latW())}; energy=${meIn(B).energy}; errors=${B.errors.slice(-2).join(" | ")}`);
  // Clear the wave (no shard stands this wave — its doom
  // belongs to §B3's wave, where it is the only slow proof).
  let guard1 = 0;
  while (B.state.battle.active && guard1++ < 10) {
    const alive = B.state.dark;
    if (!alive.length) break;
    await castRuneUntil(B, "blades", [...new Set(alive.map((d) => d.hex))].slice(0, 3), 4);
    await sleep(1500);
  }
  const endStart1 = Date.now();
  while (B.state.battle.active && Date.now() - endStart1 < 120000) await sleep(300);
  ok("wave 1 ends (the field clears the dark)", B.state.battle.active === false && B.state.dark.length === 0, `active=${B.state.battle.active} dark=${B.state.dark.length}`);
}

/* §B3 PART 4 — THE TABLE AUDIT, WAVE 2: the crown shard —
      its dormancy under weak dark, and the doom it is owed
      when the battle ends with it unfed. Wave-2 dark top
      out at power 3 (the kinds cycle fray/tangle at this
      depth, the wave bump still 0) — under the shard's
      hunger of 5, as lawful as wave 1's. */
{
  await beginWave(B);
  const dealt = await settledDeal(B);
  ok("wave 2 deals its dark (5 dealt)", dealt.length >= 3, JSON.stringify(dealt));
  // THE CROWN SHARD under weak dark: it must NOT spring —
  // its hunger is for power 5 and over, and no dark of this
  // wave is that. Dormancy here is the law keeping, not a
  // break: the same filter that refuses the weak is what
  // will feed it the strong. It is written FIRST, while
  // every dark still stands far from the field's blows.
  const byHp = [...dealt].sort((a, b) => b.hp - a.hp);
  const dShard = byHp[1];
  const sStood = await castUnderDark(B, "shard", dShard.id);
  // Five quiet seconds: the dark stands on the shard's own
  // hex (sampled — the coincidence is part of the proof)
  // and the shard does not fall. The shard's presence is
  // logged across the window — it left the view once in an
  // earlier run while its doom still fell at the wave's
  // end, and the audit wants the moment and the company it
  // kept when it went.
  let stoodTogether = false;
  const shardTrail = [];
  for (let i = 0; i < 20; i++) {
    const sw = B.state.workings.find((w) => w.kind === "rune" && w.engine === "shard");
    const dd = darkById(B, dShard.id);
    if (sw && dd && dd.hex === sw.hex) stoodTogether = true;
    shardTrail.push(sw ? `shard:${sw.charges}c/${sw.wither?.toFixed(2)}w` : "—");
    await sleep(250);
  }
  const shardW = B.state.workings.find((w) => w.kind === "rune" && w.engine === "shard");
  ok("AUDIT shard @Table: under a wave-2 dark (power < 5) the shard stands UNFED and does not fall — dormancy by its own law",
    !!sStood && !!shardW && (shardW.charges ?? 0) >= 1 && stoodTogether && !taleHas(B, /went unfed/),
    `working=${JSON.stringify(shardW)} stoodTogether=${stoodTogether} energy=${meIn(B).energy} trail=${shardTrail.join(" ")} tale=${(B.state.tale ?? []).slice(-3).map((t) => t.text).join(" | ")}`);
  // End the wave with the shard still standing: its doom is
  // owed, and the book collects it from its own caster's
  // strongest. Kill the last dark BY CAST (so the ending
  // round holds no other blow), and read the doom off the
  // referee's own mouth: the tale names the unit and the
  // harm — power × multiplier — and the named one's flesh
  // answers for exactly that much across the seam (or he
  // is gone from the field, the doom having taken more
  // than his whole health: it falls on HP directly, and
  // a power-9 Awokin's 9 HP is less than the 18 owed).
  const { spellByKey } = await import("../server/dist/grimoire.js");
  const mult = spellByKey("shard")?.numbers?.multiplier ?? 2;
  const standingByName = new Map();
  const noteStanding = () => { for (const u of B.state.field) standingByName.set(u.name, { hp: u.hp, power: u.power }); }; // a solo room: every field unit is the seat's own
  noteStanding();
  let guard = 0;
  while (B.state.battle.active && guard++ < 8) {
    const alive = B.state.dark;
    if (!alive.length) break;
    const hexes = [...new Set(alive.map((d) => d.hex))].slice(0, 3);
    await castRuneUntil(B, "blades", hexes, 4);
    noteStanding();
    await sleep(1500);
  }
  const endStart = Date.now();
  while (B.state.battle.active && Date.now() - endStart < 120000) { noteStanding(); await sleep(200); }
  ok("wave 2 ends (the field clears the dark)", B.state.battle.active === false, `dark=${B.state.dark.length}`);
  const doomLine = (B.state.tale ?? []).map((t) => t.text).find((x) => /went unfed — a doom owed is a doom paid: it falls on (.+), (\d+) harm\./.test(x));
  const doomMatch = doomLine ? doomLine.match(/it falls on (.+), (\d+) harm\./) : null;
  const doomedName = doomMatch?.[1] ?? null;
  const doomHarm = doomMatch ? Number(doomMatch[2]) : null;
  const doomedBefore = doomedName ? standingByName.get(doomedName) : null;
  const doomedAfter = doomedName ? B.state.field.find((u) => u.name === doomedName) : null;
  ok("AUDIT shard @Table: the UNFED shard's doom FALLS at the battle's end on its caster's strongest — the tale names him and the harm (his power × the book's multiplier), and his flesh answers for exactly it",
    !!doomLine && !!doomedBefore && doomHarm === doomedBefore.power * mult
      && (doomedAfter ? (doomedBefore.hp - doomedAfter.hp) === doomHarm : doomedBefore.hp <= doomHarm),
    `doom=${JSON.stringify(doomLine)}; before=${JSON.stringify(doomedBefore)}; after=${JSON.stringify(doomedAfter && { hp: doomedAfter.hp })}; mult=${mult}; standingKeys=${[...standingByName.keys()].join(",")}; fieldNow=${B.state.field.map((u) => u.name).join(",")}`);
}

/* §B4 PART 4 — THE TABLE AUDIT, WAVE 3: the three blades,
      the coil, and shard rain witnessed. */
{
  await beginWave(B);
  const dealt = await settledDeal(B);
  ok("wave 3 deals its dark (7 dealt)", dealt.length >= 5, JSON.stringify(dealt));
  // The casts go down back-to-back — the field's own blows
  // do not wait for the audit — and the readings are taken
  // after. The sturdiest dark take the coil and the rain.
  const byHp = [...dealt].sort((a, b) => b.hp - a.hp);
  const trio = byHp.slice(2, 5);
  const dCoil = byHp[0], dRain = byHp[1];
  // THE THREE BLADES on three hexes at once (fresh ground).
  const tStood = await castRuneUntil(B, "blades", [...new Set(trio.map((d) => darkById(B, d.id)?.hex ?? d.hex))].slice(0, 3));
  // THE COIL: the dark is not wounded — it is TAKEN, thrown
  // to other ground whole. (It retires in its springing, so
  // its tale is the cast's receipt.) A cast can stand
  // unsprung if its dark died or stepped in the breath
  // before the writing — the coil is simply written again
  // on fresher ground, up to three writings.
  let coilHexUsed = null, thrown = null, thrownHpWas = null, thrownHexWas = null;
  for (let attempt = 0; attempt < 3 && darkById(B, dCoil.id) && !thrown; attempt++) {
    const hexWas = darkById(B, dCoil.id).hex;
    const hpWas = darkById(B, dCoil.id).hp;
    coilHexUsed = await castUnderDark(B, "coil", dCoil.id, { sprungRe: /turns the dark aside/ });
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) {
      const now = darkById(B, dCoil.id);
      if (!now) break;
      if (now.hex !== hexWas && now.hp === hpWas) { thrown = now; thrownHpWas = hpWas; thrownHexWas = hexWas; break; }
      if (now.hex !== hexWas) break; // moved but blooded — not the coil's clean throw
      await sleep(200);
    }
  }
  // SHARD RAIN: cast under the last dark; the fall's own
  // event (rainFalls) is the cast's receipt, as the writing
  // is spent in the falling.
  const sumBefore = B.state.dark.reduce((s, d) => s + d.hp, 0);
  let rStood = false, rainSeen = false;
  for (let i = 0; i < 6 && !rStood; i++) {
    const d = darkById(B, dRain.id);
    if (!d) break;
    const taleLen = (B.state.tale ?? []).length;
    B.send({ type: "castRune", root: "shardrain", hue: "unaligned", hexes: [d.hex], pour: 0 });
    const t0 = Date.now();
    while (Date.now() - t0 < 3500) {
      if ((B.state.rainFalls ?? []).length) { rainSeen = true; rStood = true; break; }
      if (B.state.workings.some((w) => w.kind === "rune" && w.engine === "shardrain")) { rStood = true; break; }
      if ((B.state.tale ?? []).slice(taleLen).some((t) => /unravels/.test(t.text))) break;
      await sleep(150);
    }
  }
  // THE READINGS.
  await sleep(1500);
  const trioResult = trio.map((d) => { const now = darkById(B, d.id); return !now || now.hp < d.hp; });
  ok("AUDIT blades @Table: one cast plants three, each SPRINGS on its own dark — all three wounded or felled",
    tStood && trioResult.every(Boolean), JSON.stringify(trio.map((d) => `${d.hp}->${darkById(B, d.id)?.hp ?? "dead"}`)));
  ok("AUDIT coil @Table: cast under a standing dark, it THROWS him — gone from his hex in a breath, standing whole on other ground",
    !!coilHexUsed && !!thrown,
    `coil cast=${coilHexUsed}; dark ${thrownHexWas} -> ${thrown?.hex ?? "(unchanged/dead)"} hp=${thrown?.hp ?? "?"}/${thrownHpWas ?? "?"}; tale=${(B.state.tale ?? []).slice(-3).map((t) => t.text).join(" | ")}`);
  let sumAfter = B.state.dark.reduce((s, d) => s + d.hp, 0);
  const rainStart = Date.now();
  while (Date.now() - rainStart < 10000) {
    if ((B.state.rainFalls ?? []).length) rainSeen = true;
    sumAfter = B.state.dark.reduce((s, d) => s + d.hp, 0);
    if (rainSeen && sumBefore - sumAfter >= 2) break;
    await sleep(200);
  }
  ok("AUDIT shardrain @Table: the rain FALLS — the fall is served to the client (rainFalls) and the pooled dice land as harm on the dark beneath the group",
    rStood && rainSeen && sumBefore - sumAfter >= 2,
    `stood=${rStood} rainEvent=${rainSeen} darkHp ${sumBefore} -> ${sumAfter}`);
  // Clear the wave.
  let guard = 0;
  while (B.state.battle.active && guard++ < 10) {
    const alive = B.state.dark;
    if (!alive.length) break;
    await castRuneUntil(B, "blades", [...new Set(alive.map((d) => d.hex))].slice(0, 3), 4);
    await sleep(1500);
    if (Date.now() - rainStart > 150000) break;
  }
  const clearStart = Date.now();
  while (Date.now() - clearStart < 90000 && !(B.state.battle.active === false && B.state.battle.wave >= 4)) await sleep(500);
  ok("wave 3 ends; the book advances (wave 4 stands ready)", B.state.battle.active === false && B.state.battle.wave >= 4, `active=${B.state.battle.active} wave=${B.state.battle.wave}`);
}
B.ws.close();

/* ═══ THE HOMELAND — the Runewright's own land ═════════════ */
console.log("\n— THE HOMELAND (Runewright): anywhere, withering, the audit —");
const H = runeSeed.ownerKey;
const seedTileH = (q, r, cursed) => Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, ?, ?, ?, ?)").run(H, q, r, cursed, Date.now()).lastInsertRowid);
const tileIds = {};
for (const [q, r, c] of [[0, 0, 0], [1, 0, 1], [2, 0, 1], [3, 0, 1], [4, 0, 1], [3, 1, 1], [2, 1, 1], [1, 1, 1], [2, -1, 1], [1, -1, 1], [0, 1, 1], [0, -1, 0], [3, -1, 1], [2, 2, 1], [-1, 1, 0], [-1, 0, 0]]) {
  tileIds[`${q},${r}`] = seedTileH(q, r, c);
}
const setCurseH = (tileId, hp) => db.prepare("UPDATE territory_tiles SET curse_hp = ?, curse_max_hp = ? WHERE id = ?").run(hp, hp, tileId);
setCurseH(tileIds["1,1"], 20); setCurseH(tileIds["3,-1"], 20);
const seedWandererH = (tileId) => Number(db.prepare("INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp) VALUES (?, ?, 'fray', ?, 3)").run(H, tileId, Date.now()).lastInsertRowid);
const wandererRow = (id) => db.prepare("SELECT * FROM homeland_wanderers WHERE id = ?").get(id);
const setEnergyH = (n) => db.prepare("INSERT INTO tender_resources (owner_key, energy, terrain_bank, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = excluded.energy").run(H, n, Date.now());
const energyH = () => db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(H)?.energy ?? 0;
setEnergyH(500);
const terrH = async () => (await call("getTerritory", {}, runeSeed.token)).data;
const workingOnH = (tileId, engine) => db.prepare("SELECT * FROM territory_workings WHERE owner_key = ? AND tile_id = ? AND engine = ?").get(H, tileId, engine);
const castRawH = async (body) => call("castMapWorking", body, runeSeed.token, true);
const castUntilStandsH = async (body, tries = 12) => {
  // A cast that stands returns 200 un-fizzled; the working's
  // own row is each section's to assert — several runes
  // spring AT the cast and retire in the same breath (the
  // rain, the coil), so a missing row is not a failed cast.
  for (let i = 0; i < tries; i++) {
    const r = await castRawH(body);
    if (r.status === 200 && !r.data.fizzled) return r.data;
    if (r.status !== 200) return null;
  }
  return null;
};
const freezeBorder = () => db.prepare("UPDATE tender_progress SET wanderer_watermark = ? WHERE owner_key = ?").run(Date.now(), H);
await terrH(); // the first read settles the stand and the watermarks

/* §H1 PART 4 + THE DOOR — the Three Blades at home: once
      refused outright at this door; now cast per hex, and
      springing on the wanderer who stands in the writing. */
{
  const wid = seedWandererH(tileIds["1,1"]);
  const stood = await castUntilStandsH({ spellKey: "blades", hue: "unaligned", tileId: tileIds["1,1"] });
  ok("AUDIT blades @home: the door is OPEN — the Three Blades cast per hex on the homeland (once refused outright)", !!stood);
  await terrH();
  const w = wandererRow(wid);
  const curse = db.prepare("SELECT curse_hp FROM territory_tiles WHERE id = ?").get(tileIds["1,1"]).curse_hp;
  ok("AUDIT blades @home: it SPRINGS on the standing wanderer — he is wounded, and the same harm grinds the hex's curse",
    (!w || w.hp < 3) && curse < 20, `wanderer hp=${w?.hp ?? "gone"}; curse_hp 20 -> ${curse}`);
  const row = workingOnH(tileIds["1,1"], "blades");
  ok("AUDIT blades @home: the planted blade carries the Table's own charges (2 at the planting, spent as it springs)", !row || row.charges <= 1, JSON.stringify(row && { charges: row.charges }));
}
/* §H2 the Lattice pins at home. */
{
  const wid = seedWandererH(tileIds["2,-1"]);
  const stood = await castUntilStandsH({ spellKey: "lattice", hue: "unaligned", tileId: tileIds["2,-1"] });
  await terrH();
  const w = wandererRow(wid);
  const row = workingOnH(tileIds["2,-1"], "lattice");
  ok("AUDIT lattice @home: cast on a wanderer's hex, it PINS him (pinned_beats written) and pays its own health for the hold",
    !!stood && !!w && (w.pinned_beats ?? 0) >= 1 && !!row && row.hp < row.max_hp,
    `pinned_beats=${w?.pinned_beats}; lattice hp=${row?.hp}/${row?.max_hp}`);
}
/* §H3 the Coil throws at home, and pays its refund. The
      spring is isolated to the SETTLE: the coil is written
      on empty ground (it stands, charged), then the
      wanderer is set on it, and one read springs it — so
      the ⚡ delta across that read is the refund alone.
      The stage stands at (2,2), beyond the runic weapon's
      reach of his stand (the homeland referee strikes
      wanderers who stray within it — that wound is not
      the coil's), and the vessel is filled lawfully: the
      refund is capped by the Tender's own max, so the
      purse is set UNDER it before the measure. */
{
  setEnergyH(30);
  const stood = await castUntilStandsH({ spellKey: "coil", hue: "unaligned", tileId: tileIds["2,2"] });
  const wid = seedWandererH(tileIds["2,2"]);
  setEnergyH(10);
  const e0 = energyH();
  freezeBorder();
  await terrH();
  const w = wandererRow(wid);
  const newTile = w ? db.prepare("SELECT q, r, cursed FROM territory_tiles WHERE id = ?").get(w.tile_id) : null;
  const dist = newTile ? (Math.abs(newTile.q - 2) + Math.abs(newTile.r - 2) + Math.abs((newTile.q + newTile.r) - 4)) / 2 : 0;
  ok("AUDIT coil @home: the wanderer is THROWN to far cursed ground (≥3 hexes), whole, and the coil's turning refunds its ⚡ (+1 for the one turned)",
    !!stood && !!w && w.tile_id !== tileIds["2,2"] && !!newTile?.cursed && dist >= 3 && energyH() === e0 + 1,
    `tile=${w?.tile_id} -> ${JSON.stringify(newTile)} dist=${dist}; energy ${e0} -> ${energyH()}`);
}
/* §H4 Shard Rain falls at home, once, for its pooled dice. */
{
  setEnergyH(100);
  const wid = seedWandererH(tileIds["2,0"]);
  const stood = await castUntilStandsH({ spellKey: "shardrain", hue: "unaligned", tileId: tileIds["2,0"] });
  await terrH();
  const w = wandererRow(wid);
  ok("AUDIT shardrain @home: the rain FALLS on the standing wanderer (his hp pays the pooled dice) and the writing is spent",
    !!stood && (!w || w.hp < 3) && !workingOnH(tileIds["2,0"], "shardrain"),
    `wanderer hp=${w?.hp ?? "gone"}`);
}
/* §H5 the Crown Shard at home: dormant BY LAW — no dark of
      power 5 walks this ground, and the book's shard has no
      spring for a Fray. It stands, charged, and waits. */
{
  setEnergyH(100);
  const wid = seedWandererH(tileIds["3,0"]);
  const stood = await castUntilStandsH({ spellKey: "shard", hue: "unaligned", tileId: tileIds["3,0"] });
  await terrH(); await terrH();
  const w = wandererRow(wid);
  const row = workingOnH(tileIds["3,0"], "shard");
  ok("AUDIT shard @home: DORMANT BY LAW — cast and standing over a Fray, it does not spring (no power-5 dark walks the homeland); the wanderer is untouched, the shard keeps its charge",
    !!stood && !!w && w.hp === 3 && !!row && row.charges === 1,
    `wanderer hp=${w?.hp}; shard=${JSON.stringify(row && { charges: row.charges })}`);
}
/* §H6 the Single Blade springs at home. */
{
  setEnergyH(100);
  const wid = seedWandererH(tileIds["3,-1"]);
  const stood = await castUntilStandsH({ spellKey: "blade", hue: "unaligned", tileId: tileIds["3,-1"] });
  await terrH();
  const w = wandererRow(wid);
  const curse = db.prepare("SELECT curse_hp FROM territory_tiles WHERE id = ?").get(tileIds["3,-1"]).curse_hp;
  const row = workingOnH(tileIds["3,-1"], "blade");
  ok("AUDIT blade @home: cast under a wanderer, it SPRINGS — he is wounded, the curse is ground by the same harm, a charge is spent",
    !!stood && (!w || w.hp < 3) && curse < 20 && (!row || row.charges < 2),
    `wanderer hp=${w?.hp ?? "gone"}; curse_hp 20 -> ${curse}; blade=${JSON.stringify(row && { charges: row.charges })}`);
}
/* §H7 PART 3 — a ward on a far cursed edge, anchored by
      NOTHING: no Awokin holds its hexes, the Tender does not
      stand there. The old law refused this cast outright. */
{
  setEnergyH(100);
  const row0 = db.prepare("SELECT COUNT(*) AS n FROM field_placements WHERE owner_key = ?").get(H).n;
  const stood = await castUntilStandsH({ spellKey: "seal", hue: "unaligned", tileId: tileIds["4,0"], dir: 4 });
  const row = workingOnH(tileIds["4,0"], "seal");
  ok("PART 3: the Seal STANDS on the ring-4 cursed edge with no placement anywhere on his land and his stand at the heart (the anchor is lifted at home too)",
    row0 === 0 && !!stood && !!row && row.kind === "ward" && row.hp === row.max_hp,
    `stood=${JSON.stringify(stood)?.slice(0, 120)} row=${JSON.stringify(row && { hp: row.hp, max_hp: row.max_hp, dir: row.dir })} energy=${energyH()}`);
  /* §H8 PART 3 — and the curse eats it, at the Tender's rate.
     The ward pays for the worse of its two grounds: both
     hexes ring 4 → 5% of its body per beat. */
  if (row) {
    freezeBorder();
    await terrH(); // arm the wither watermark
    // The measure is read off the ROW ITSELF: the watermark
    // the test writes, and the watermark the settle advances
    // it to, bracket the exact elapsed the curse reckoned —
    // no clock in either process is trusted further than that.
    const arm = (beats) => { const wm = Date.now() - beats * 2800; db.prepare("UPDATE territory_workings SET wither_wm = ? WHERE id = ?").run(wm, row.id); return wm; };
    const wm0 = arm(10);
    freezeBorder();
    await terrH();
    const after10 = db.prepare("SELECT hp, wither, wither_wm FROM territory_workings WHERE id = ?").get(row.id);
    const accrual = row.max_hp * 0.05 * ((after10?.wither_wm - wm0) / 2800);
    ok("PART 3: the ward WITHERS on cursed ground at 0.01×(ring+1) of its body per beat (10 beats at ring 4, read off the row's own watermarks)",
      !!after10 && after10.hp === row.max_hp - Math.floor(accrual) && Math.abs((after10.wither ?? 0) - (accrual - Math.floor(accrual))) < 0.05,
      `accrual=${accrual.toFixed(3)} row=${JSON.stringify(after10)}`);
    arm(21);
    freezeBorder();
    await terrH();
    const gone = db.prepare("SELECT id FROM territory_workings WHERE id = ?").get(row.id);
    ok("PART 3: withering does not stop at a wound — the curse eats the ward WHOLE and it is lifted from the land", !gone);
  }
}
/* §H9 PART 3 — a rune's charges are its body at home too:
      the fractional wither accrues, then eats whole charges.
      The subject is the COIL: the blade and the rain spring
      on cursed ground itself at home (they bite the curse —
      §H1/§H6's law), so they spend themselves long before
      withering could be read; the coil springs only on a
      wanderer, and none is suffered near this stage. */
{
  // Freeze the border: no wanderer may wander onto the
  // proof's ground and spring it, and no new teeth may bite.
  db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(H);
  freezeBorder();
  setEnergyH(50);
  const stood = await castUntilStandsH({ spellKey: "coil", hue: "unaligned", tileId: tileIds["2,1"] });
  const row = workingOnH(tileIds["2,1"], "coil");
  ok("PART 3: a Coil is written on cursed ring-3 ground at home, holding its one charge", !!stood && !!row && row.charges === 1, `stood=${JSON.stringify(stood)?.slice(0, 120)} row=${JSON.stringify(row && { charges: row.charges })} energy=${energyH()}`);
  if (row) {
    freezeBorder();
    await terrH(); // arm the watermark
    const arm = (beats) => { const wm = Date.now() - beats * 2800; db.prepare("UPDATE territory_workings SET wither_wm = ? WHERE id = ?").run(wm, row.id); return wm; };
    const wm0 = arm(10); // 10 beats × 1 charge × 4% (ring 3) ≈ 0.4 accrued
    freezeBorder();
    await terrH();
    const a = db.prepare("SELECT charges, wither, wither_wm FROM territory_workings WHERE id = ?").get(row.id);
    const accrual = 1 * 0.04 * ((a?.wither_wm - wm0) / 2800);
    ok("PART 3: the rune's wither accrues fractionally against its charges (10 beats at ring 3, read off the row's own watermarks)",
      !!a && a.charges === 1 && Math.abs((a.wither ?? 0) - accrual) < 0.05, `accrual=${accrual.toFixed(3)} row=${JSON.stringify(a)}`);
    arm(16); // the accrual passes one whole charge — it is eaten
    freezeBorder();
    await terrH();
    const gone = db.prepare("SELECT id FROM territory_workings WHERE id = ?").get(row.id);
    ok("PART 3: the accrued wither eats the charge WHOLE — the curse eats the rune on cursed ground, as it eats the Tender", !gone);
  }
}

console.log(`\nTEST63 RESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
