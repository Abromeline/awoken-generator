// test52 — THE TABLE GOES CONTINUOUS (Phase B): the Tender
// and every Awoken and every dark thing now move as points
// in pixel space, not as hexes on a road. Proven here:
// (a) a glide crosses the map through real intermediate
// positions, never a jump, and glideStop halts it dead;
// (b) the dark HUNTS — a fray glides continuously toward
// the standing light, off every tile center on its way;
// (c) ELEMENT REACH is measured in pixels from where a unit
// stands: sky (276px) answers a cluster a stone (69px)
// standing the same war can never touch;
// (d) THE RUNIC WEAPON flies from the Tender's own hand
// (strikes carry weapon:"swordshield", players carry
// weaponKills) and the sword-and-shield's +3 AC measurably
// blunts a gate assault against a weaponless control;
// (e) a seed assault still ends a campaign when nothing
// stands to answer it;
// (f) curse attrition withers a unit standing on its
// DERIVED tile — the hex its pos has crossed into.
import WebSocket from "ws";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

const DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-test52-"));
process.env.DATA_DIR = DATA_DIR;
process.env.PORT = "39977";
process.env.WORKSHOP_PASSWORD = "test52-word";
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
const base = "http://127.0.0.1:39977";
const db = new Database(join(DATA_DIR, "app.db"));

// ── The map's math (the contract's iso centers) ───────────
const U = [1292 * 40 / 796, 470 * 40 / 796], V = [0, 948 * 40 / 796];
const parseId = (id) => id.split(",").map(Number);
const centerOf = (id) => {
  const [q, r] = parseId(id);
  return { x: q * U[0] + r * V[0], y: q * U[1] + r * V[1] };
};
const axialDist = (a, b) => {
  const [aq, ar] = parseId(a), [bq, br] = parseId(b);
  return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs((aq + ar) - (bq + br))) / 2;
};
const ringOf = (id) => axialDist(id, "0,0");
const pxDist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const ALL_IDS = [];
for (let q = -6; q <= 6; q++) for (let r = Math.max(-6, -q - 6); r <= Math.min(6, -q + 6); r++) ALL_IDS.push(`${q},${r}`);
const ALL_CENTERS = ALL_IDS.map(centerOf);

const meIn = (c) => c.state.players.find(p => p.key === c.you.key);
const unitByName = (c, frag) => c.state.field.find(u => u.name.includes(frag));
const glideToTile = (c, id) => {
  const ctr = centerOf(id);
  c.send({ type: "glide", tx: ctr.x, ty: ctr.y });
};
function diag(c, label) {
  console.log(`DIAGNOSTIC (${label}):`);
  console.log("  field:", (c.state?.field ?? []).map(u => `${u.name} hex=${u.hex} hp=${u.hp}/${u.maxHp} pos=${JSON.stringify(u.pos)}`).join(", ") || "(empty)");
  console.log("  dark:", (c.state?.dark ?? []).map(d => `${d.label ?? d.kind} hex=${d.hex} hp=${d.hp}/${d.maxHp} pos=${JSON.stringify(d.pos)}`).join(", ") || "(empty)");
  console.log("  strikes tail:", JSON.stringify((c.allStrikes ?? []).slice(-8)));
  console.log("  tale tail:", (c.state?.tale ?? []).slice(-4).map(t => t.text).join("\n    "));
}

// ── The client harness (test40's, plus a push sampler) ────
// Every state push is sampled into c.snaps (the glide proof
// reads the road from them), and every strike ever flown is
// kept in c.allStrikes with the moment this client saw it —
// the shared ledger itself only keeps a moment's strikes.
function client(label) {
  const ws = new WebSocket("ws://127.0.0.1:39977/table/ws");
  const c = { label, ws, state: null, you: null, errors: [], snaps: [], allStrikes: [], strikeIds: new Set() };
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "state") {
      c.state = m.state; c.you = m.you;
      const me = m.you ? m.state.players.find(p => p.key === m.you.key) : null;
      c.snaps.push({ t: Date.now(), mePos: me?.pos ? { x: me.pos.x, y: me.pos.y } : null, meMoving: me?.moving ?? null });
      if (c.snaps.length > 3000) c.snaps.shift();
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

// A casual wave: the message that calls dealWave in
// server/src/table.ts is startWave; if a rebuild renames
// the door "begin", that is tried before giving up.
async function beginCasualWave(c) {
  c.send({ type: "startWave" });
  try {
    await c.waitFor(cc => cc.state.battle.active && cc.state.dark.length > 0, "the wave is dealt (startWave)", 4000);
  } catch {
    c.send({ type: "begin" });
    await c.waitFor(cc => cc.state.battle.active && cc.state.dark.length > 0, "the wave is dealt (begin)", 20000);
  }
}

// ── (a) GLIDE CONTINUITY ──────────────────────────────────
console.log("\n(a) glide continuity");
{
  const ga = client("GLIDE");
  await ga.join({ devName: "Glide Sue", room: "table-52-glide" });
  await ga.waitFor(c => !!meIn(c)?.pos, "the tender stands in pixel space");
  const startPos = { ...meIn(ga).pos };
  const startHex = meIn(ga).hex;
  check("the tender's players[] entry carries a pos", typeof startPos.x === "number" && typeof startPos.y === "number", JSON.stringify(startPos));
  check("the tender rests still (moving === false)", meIn(ga).moving === false);

  const targetId = ga.state.map.map(t => t.id)
    .filter(id => id !== "0,0" && axialDist(startHex, id) === 3)
    .sort((x, y) => pxDist(centerOf(y), startPos) - pxDist(centerOf(x), startPos))[0];
  const targetCtr = centerOf(targetId);
  ga.snaps.length = 0;
  ga.send({ type: "glide", tx: targetCtr.x, ty: targetCtr.y });
  await ga.waitFor(c => {
    const m = meIn(c);
    return m && m.moving === false && m.pos && pxDist(m.pos, targetCtr) <= 3;
  }, "the glide arrives", 30000);
  const positions = ga.snaps.map(s => s.mePos).filter(Boolean);
  const intermediates = new Set(positions
    .filter(p => pxDist(p, startPos) > 2 && pxDist(p, targetCtr) > 2)
    .map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`));
  check("the glide crossed real ground (≥3 distinct intermediate positions)", intermediates.size >= 3, `distinct=${intermediates.size} samples=${positions.length}`);
  let maxJump = 0;
  for (let i = 1; i < positions.length; i++) maxJump = Math.max(maxJump, pxDist(positions[i], positions[i - 1]));
  check("no step of the glide jumped (>60px between pushes)", maxJump <= 60, `maxJump=${maxJump.toFixed(1)}px`);
  const endMe = meIn(ga);
  check("the glide ends on the target, still", pxDist(endMe.pos, targetCtr) <= 3 && endMe.moving === false,
    `pos=${JSON.stringify(endMe.pos)} target=${JSON.stringify(targetCtr)} moving=${endMe.moving}`);

  // glideStop: a second glide, cut short — the point must hold.
  const target2 = ga.state.map.map(t => t.id)
    .filter(id => id !== "0,0" && axialDist(endMe.hex, id) >= 3)
    .sort((x, y) => pxDist(centerOf(y), endMe.pos) - pxDist(centerOf(x), endMe.pos))[0];
  glideToTile(ga, target2);
  await sleep(350);
  ga.send({ type: "glideStop" });
  await ga.waitFor(c => meIn(c)?.moving === false, "glideStop halts the tender", 10000);
  const stoppedPos = { ...meIn(ga).pos };
  await sleep(900);
  check("after glideStop the tender does not drift", pxDist(meIn(ga).pos, stoppedPos) <= 0.3 && meIn(ga).moving === false,
    `from=${JSON.stringify(stoppedPos)} to=${JSON.stringify(meIn(ga).pos)} moving=${meIn(ga).moving}`);
  ga.ws.close();
}

// ── (b) THE DARK HUNTS ────────────────────────────────────
// One fray, tracked from the deal: it must run from
// rim-distance (≥150px) down to claw reach (≤85px) of the
// standing light — a drop no tile-hopping march could fake —
// and mid-glide it must stand off every tile center
// (continuous ground, not road fractions). The light is the
// stone Keeper: its reach is the shortest there is (69px), so
// the hunter lives long enough to arrive — every longer
// element kills its hunter at its own reach boundary, and a
// min-distance-over-survivors reading would chase ghosts.
// (One strike from anything still one-shots a fray; what is
// proven here is the approach itself.)
console.log("\n(b) the dark hunts");
{
  const room = "campaign-test52-hunt";
  const st = client("ST-B");
  await st.join({ devName: "Hunt Storytender", room, storytender: true });
  const hb = client("HUNT");
  await hb.join({ devName: "Hunt Sue", room });
  const landing = hb.you.landing;
  const stoneCard = hb.you.hand.find(c => c.name === "Keeper of the Low Bell");
  hb.send({ type: "summon", cardId: stoneCard.id, hex: landing });
  await hb.waitFor(c => !!unitByName(c, "Keeper of the Low Bell"), "the light stands", 15000);
  // Six fray, and the tracked one is the fray NEAREST the
  // light at the deal: steering makes a dark run at the
  // nearest standing light only when that light is nearer
  // than the seed — a far-side fray lawfully gates at the
  // seed instead (and did, in an earlier run of this test).
  // The nearest of six rim-spawns is the light's hunter.
  for (let i = 0; i < 6; i++) st.send({ type: "stAdd", kind: "fray" });
  await st.waitFor(c => c.you?.storytender?.reserve.length === 6, "six fray held");
  st.send({ type: "stDeal" });
  await hb.waitFor(c => c.state.dark.length === 6, "the fray are dealt", 15000);
  const light0 = unitByName(hb, "Keeper of the Low Bell");
  const frayId = [...hb.state.dark].sort((a, b) => pxDist(a.pos, light0.pos) - pxDist(b.pos, light0.pos))[0].id;

  const dists = [];
  let offCenter = false;
  const huntStart = Date.now();
  while (Date.now() - huntStart < 30000) {
    const light = unitByName(hb, "Keeper of the Low Bell");
    const fray = hb.state.dark.find(d => d.id === frayId);
    if (!light || !fray) break;
    dists.push(pxDist(fray.pos, light.pos));
    if (ALL_CENTERS.every(ctr => pxDist(fray.pos, ctr) > 15)) offCenter = true;
    if (pxDist(fray.pos, light.pos) <= 78) break;
    await sleep(200);
  }
  // The reading is the CLOSEST approach, not the final
  // sample: the stone's first strike kills its hunter the
  // moment it steps inside 69px, so the last sample can sit
  // one interval short of the arrival it proves.
  const first = dists[0], closest = dists.length ? Math.min(...dists) : undefined;
  check("the hunt was sampled", dists.length >= 3, `samples=${dists.length}`);
  check("the fray closed on the light (spawn ≥150px, closest ≤85px, drop ≥80px)",
    first !== undefined && first >= 150 && closest !== undefined && closest <= 85 && first - closest >= 80,
    `first=${first?.toFixed(0)}px closest=${closest?.toFixed(0)}px samples=${dists.length}`);
  check("the fray glides — at some moment it stood off every tile center (>15px)", offCenter);
  st.ws.close(); hb.ws.close();
}

// ── (c) ELEMENT REACH ─────────────────────────────────────
// The whole band stands on the landing (summoning is
// purified-ground law) and eight fray converge from the rim.
// Every strike on the ledger carries its own geometry
// (from = the striker's ground point, to = its mark's), so
// the reaches prove themselves off the strikes' own spans:
//   sky   (276px) must strike a foe still ≥150px out —
//         impossible under the old flat two-tile law (≤138);
//   stone (69px)  must never strike beyond 69px;
//   root  (138px) must never strike beyond 138px;
// and the stone must strike at least once (foes did arrive
// at the stack — silence alone would prove nothing).
console.log("\n(c) element reach");
{
  const room = "campaign-test52-reach";
  const st = client("ST-C");
  await st.join({ devName: "Reach Storytender", room, storytender: true });
  const rc = client("REACH");
  await rc.join({ devName: "Reach Sue", room });
  const landing = rc.you.landing;
  const decoyCard = rc.you.hand.find(c => c.name === "Rootbound Confessor");
  const stoneCard = rc.you.hand.find(c => c.name === "Keeper of the Low Bell");
  const skyCard = rc.you.hand.find(c => c.name === "Spark of the First Forge") ?? rc.you.hand.find(c => c.name === "Mothwing Herald");
  check("the stand-in hand holds the decoy, the stone and the sky", !!decoyCard && !!stoneCard && !!skyCard,
    `hand=${rc.you.hand.map(c => c.name).join(", ")}`);

  // The whole band musters on the landing before the deal
  // (purse: root 1 + stone 2 + sky 7 = 10 of the ⚡12 stake).
  rc.send({ type: "summon", cardId: decoyCard.id, hex: landing });
  await rc.waitFor(c => !!unitByName(c, "Rootbound Confessor"), "the decoy stands", 15000);
  rc.send({ type: "summon", cardId: stoneCard.id, hex: landing });
  await rc.waitFor(c => !!unitByName(c, "Keeper of the Low Bell"), "the stone stands", 15000);
  rc.send({ type: "summon", cardId: skyCard.id, hex: landing });
  await rc.waitFor(c => !!unitByName(c, skyCard.name), "the sky stands", 15000);
  const bandStoodAt = Date.now();

  // Sixteen, not eight: a sky strike one-shots a fray, so the
  // proof needs volume — enough must survive the approach for
  // the stone to have its moment at the stack.
  for (let i = 0; i < 16; i++) st.send({ type: "stAdd", kind: "fray" });
  await st.waitFor(c => c.you?.storytender?.reserve.length === 16, "sixteen fray held");
  st.send({ type: "stDeal" });
  await rc.waitFor(c => c.state.dark.length === 16, "the sixteen are dealt", 15000);

  // Let the battle run: the fray cross sky's reach (276px)
  // long before they reach the stack, and the ledger fills.
  const watchEnd = Date.now() + 45000;
  while (Date.now() < watchEnd) {
    const skyLong = rc.allStrikes.some(x => x.element === "sky" && pxDist(x.from, x.to) >= 150);
    const stoneShort = rc.allStrikes.some(x => x.element === "stone");
    if (skyLong && stoneShort) break;
    if (!rc.state.dark.length) break;
    await sleep(300);
  }
  const spans = rc.allStrikes.filter(x => x.seenAt >= bandStoodAt);
  const spanOf = (el) => spans.filter(x => x.element === el).map(x => pxDist(x.from, x.to));
  const skySpans = spanOf("sky"), stoneSpans = spanOf("stone"), rootSpans = spanOf("root");
  check("the sky strikes a foe still ≥150px out (reach 276, no two-tile law allows it)",
    skySpans.some(d => d >= 150), `skySpans=${skySpans.map(d => d.toFixed(0)).join(",") || "(none)"}`);
  check("the stone strikes at least once (the foes arrived at the stack)", stoneSpans.length >= 1,
    `stoneStrikes=${stoneSpans.length} darkLeft=${rc.state.dark.length}`);
  check("the stone never strikes beyond its 69px reach",
    stoneSpans.every(d => d <= 70.5), `stoneSpans=${stoneSpans.map(d => d.toFixed(0)).join(",") || "(none)"}`);
  check("the root never strikes beyond its 138px reach",
    rootSpans.every(d => d <= 139.5), `rootSpans=${rootSpans.map(d => d.toFixed(0)).join(",") || "(none)"}`);
  st.ws.close(); rc.ws.close();
}

// ── (d) THE RUNIC WEAPON + WEAPON AC ──────────────────────
// A BOUND tender, seated through the in-process door
// (test51's claiming + test43's seeding, then the bind code):
// the sword-and-shield in hand flies as weapon strikes and
// scores weaponKills; its +3 AC is measured against a
// weaponless runewright control in the same dance.
console.log("\n(d) the runic weapon + weapon AC");
async function seedBoundTender({ tenderName, password, tag }) {
  const claim = await call("claimTender", { password, tenderName });
  const token = claim.data.token;
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.data.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 200, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 200").run(ownerKey, Date.now());
  // ONE Awokin for the tender (test43's insAsset/insAwokin
  // pattern and composition_json shape, exactly).
  const now = Date.now();
  const insAsset = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
  const bodyId = Number(insAsset.run(`Test Body ${tag}`, "body", 2, 2, "sky", `test/body-${tag}.png`, now).lastInsertRowid);
  const insAwokin = db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)");
  const composition = JSON.stringify([{ source_id: `db:${bodyId}`, name: `Test Body ${tag}`, category: "body", rarity: "common", power: 2, toughness: 2, element: "sky" }]);
  insAwokin.run(`Awokin ${tag}`, `Awokin ${tag}`, `test/awokin-${tag}.png`, composition, tenderName, ownerKey, now);
  return { token, ownerKey };
}
async function bindTender({ token, discordId, discordName, weaponKey }) {
  await call("chooseClass", { classKey: "runewright" }, token);
  if (weaponKey) await call("chooseWeapon", { weaponKey }, token);
  const { issueTableToken } = await import("../server/dist/table.js");
  const tt = issueTableToken({ id: discordId, name: discordName });
  const codeRes = await call("getTableBindCode", {}, token);
  const code = codeRes.data.code;
  const bindRes = await fetch(`${base}/api/table/bind`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: tt, code }),
  });
  const bindData = await bindRes.json().catch(() => ({}));
  if (!bindRes.ok) throw new Error(`table/bind -> ${bindRes.status}: ${JSON.stringify(bindData)}`);
  return tt;
}
async function setupWeaponRoom({ tt, room, label, expectWeapon }) {
  const c = client(label);
  await c.join({ authToken: tt, room });
  if (expectWeapon) check("the you DTO carries the swordshield", c.you.weaponKey === "swordshield", `weaponKey=${c.you.weaponKey}`);
  else check("the control's you DTO carries no weapon", c.you.weaponKey == null, `weaponKey=${c.you.weaponKey}`);
  await beginCasualWave(c);
  return c;
}
async function parkAtGate(c) {
  let gate = null;
  await c.waitFor(cc => {
    gate = cc.state.dark.find(d => ringOf(d.hex) <= 1) ?? null;
    return !!gate;
  }, "a dark thing reaches the gate ring (ring ≤ 1)", 90000);
  // Park 40px from the dark, on the line away from the seed.
  const dp = gate.pos ?? centerOf(gate.hex);
  const len = Math.hypot(dp.x, dp.y) || 1;
  const sentAt = Date.now();
  c.send({ type: "glide", tx: dp.x + (dp.x / len) * 40, ty: dp.y + (dp.y / len) * 40 });
  await c.waitFor(cc => meIn(cc)?.moving === false, "the tender parks beside the dark", 20000);
  return { parkedAt: Date.now(), glideSentAt: sentAt };
}
{
  // THREE rooms a side, aggregated: a single room yields
  // only a few dozen strike opportunities, and dice noise at
  // that count swallows a 15-point hit-rate gap. Three rooms
  // triple the strikes while the wall-clock stays one room's.
  const swordClients = [], ctrlClients = [];
  for (let i = 0; i < 3; i++) {
    const seed = await seedBoundTender({ tenderName: `Weapon Tender ${i + 1}`, password: `weapon-password-52a${i}`, tag: `52A${i}` });
    const tt = await bindTender({ token: seed.token, discordId: `disc-52a${i}`, discordName: `Weapon Tender ${i + 1}`, weaponKey: "swordshield" });
    swordClients.push(await setupWeaponRoom({ tt, room: `table-52-weapon-${i}`, label: `WEAPON-${i}`, expectWeapon: true }));
  }
  for (let i = 0; i < 3; i++) {
    const seed = await seedBoundTender({ tenderName: `Control Tender ${i + 1}`, password: `weapon-password-52b${i}`, tag: `52B${i}` });
    const tt = await bindTender({ token: seed.token, discordId: `disc-52b${i}`, discordName: `Control Tender ${i + 1}`, weaponKey: null });
    ctrlClients.push(await setupWeaponRoom({ tt, room: `table-52-control-${i}`, label: `CONTROL-${i}`, expectWeapon: false }));
  }
  const sw = swordClients[0];
  const swPark = await parkAtGate(sw);
  await parkAtGate(ctrlClients[0]);
  // The other rooms' tenders stand at their landings: the
  // bare-blow law never reads the tender's position, and the
  // purified landing keeps the curse's attrition from eating
  // the counted tenders before the count ripens.

  // The weapon proof, on the first sword room: strikes fly
  // from the parked tender, and the kills counter moves.
  let firstStrikeAt = null, firstKillAt = null;
  const proofStart = Date.now();
  while (Date.now() - proofStart < 45000) {
    const s = sw.allStrikes.find(x => x.weapon === "swordshield" && x.seenAt >= swPark.glideSentAt);
    if (s && firstStrikeAt === null) firstStrikeAt = s.seenAt;
    if ((meIn(sw)?.weaponKills ?? 0) >= 1 && firstKillAt === null) firstKillAt = Date.now();
    if (firstStrikeAt !== null && firstKillAt !== null) break;
    if (meIn(sw)?.fallen) break;
    await sleep(250);
  }
  check("a swordshield strike flies from the tender's hand", firstStrikeAt !== null, `strikes=${JSON.stringify(sw.allStrikes.slice(-6))}`);
  check("the weapon strike came within 20s of the park", firstStrikeAt !== null && firstStrikeAt <= swPark.parkedAt + 20000,
    `firstStrikeAt=${firstStrikeAt} parkedAt=${swPark.parkedAt}`);
  check("the runic weapon kills (weaponKills ≥ 1)", firstKillAt !== null, `weaponKills=${meIn(sw)?.weaponKills}`);
  check("the weapon kill came within 40s of the park", firstKillAt !== null && firstKillAt <= swPark.parkedAt + 40000,
    `firstKillAt=${firstKillAt} parkedAt=${swPark.parkedAt}`);

  // THE AC MEASUREMENT. HP-based readings saturate and
  // confound (attrition drips, the weapon thins the blowers),
  // so this counts the referee's own witnessed blows instead:
  // in these rooms no Awokin stands, so EVERY dark strike on
  // the ledger is a bare-Tender blow, with its hit flag flown
  // by the referee itself. Hits/attempts per side is the
  // hit rate, exactly — AC 13 must read ≈40% against AC 10's
  // ≈55%.
  const acStart = Date.now();
  const countBlows = (clients) => clients.reduce((a, c) => {
    const blows = c.allStrikes.filter(x => x.side === "dark" && (x.at ?? 0) >= acStart);
    return { attempts: a.attempts + blows.length, hits: a.hits + blows.filter(x => x.hit).length };
  }, { attempts: 0, hits: 0 });
  // When a room's field clears — the sword rooms' weapons
  // keep winning their battles outright — deal the next wave
  // so the blows keep coming to be counted. (A fallen
  // tender's room is left at rest; its count stands.)
  const redealtAt = new Map();
  const redealCount = new Map();
  const keepDealing = (clients) => {
    for (const c of clients) {
      const me = meIn(c);
      if (!me || me.fallen) continue;
      if ((redealCount.get(c) ?? 0) >= 2) continue;
      if (c.state.dark.length === 0 && Date.now() - (redealtAt.get(c) ?? 0) > 6000) {
        redealtAt.set(c, Date.now());
        redealCount.set(c, (redealCount.get(c) ?? 0) + 1);
        c.send({ type: "startWave" });
      }
    }
  };
  while (Date.now() - acStart < 150000) {
    keepDealing(swordClients); keepDealing(ctrlClients);
    const aSw = countBlows(swordClients), aCt = countBlows(ctrlClients);
    if (aSw.attempts >= 50 && aCt.attempts >= 70) break;
    if (swordClients.every(c => meIn(c)?.fallen) || ctrlClients.every(c => meIn(c)?.fallen)) break;
    await sleep(500);
  }
  const aSw = countBlows(swordClients), aCt = countBlows(ctrlClients);
  const rateSw = aSw.attempts > 0 ? aSw.hits / aSw.attempts : null;
  const rateCt = aCt.attempts > 0 ? aCt.hits / aCt.attempts : null;
  console.log(`  AC measurement (witnessed blows, 3 rooms a side): sword ${aSw.hits}/${aSw.attempts} (rate=${rateSw?.toFixed(2)}); control ${aCt.hits}/${aCt.attempts} (rate=${rateCt?.toFixed(2)})`);
  check("both sides saw enough witnessed blows (sword ≥40, control ≥60)", aSw.attempts >= 40 && aCt.attempts >= 60,
    `attemptsSword=${aSw.attempts} attemptsControl=${aCt.attempts}`);
  check("blows land in both rooms (hits > 0)", aSw.hits > 0 && aCt.hits > 0,
    `hitsSword=${aSw.hits} hitsControl=${aCt.hits}`);
  check("the +3 AC bites: the shielded tenders' hit rate is ≤87% of the controls'",
    rateSw !== null && rateCt !== null && rateSw <= 0.87 * rateCt,
    `rateSword=${rateSw?.toFixed(2)} rateControl=${rateCt?.toFixed(2)}`);
  for (const c of swordClients) c.ws.close();
  for (const c of ctrlClients) c.ws.close();
}

// ── (e) SEED ASSAULT (light version) ──────────────────────
console.log("\n(e) seed assault");
{
  const room = "campaign-test52-seed";
  const st = client("ST-E");
  await st.join({ devName: "Seed Storytender", room, storytender: true });
  const se = client("SEED");
  await se.join({ devName: "Seed Sue", room });
  for (let i = 0; i < 4; i++) st.send({ type: "stAdd", kind: "unraveler" });
  await st.waitFor(c => c.you?.storytender?.reserve.length === 4, "four unravelers held");
  st.send({ type: "stDeal" });
  await se.waitFor(c => c.state.campaign?.seeded && c.state.dark.length === 4, "the assault is dealt", 15000);
  check("bank seeded at 12 from the tender's stake", se.state.campaign.bank === 12, `bank=${se.state.campaign.bank}`);
  // The tender summons NOTHING. With no light hunting them,
  // the unravelers gate the seed and drain it to the fall.
  try {
    await se.waitFor(c => c.state.campaign?.over === "fallen", "the seed falls", 150000);
  } catch (e) {
    diag(se, "the seed assault stalled");
    throw e;
  }
  check("THE SEED FELL — campaign over by the assault", se.state.campaign.over === "fallen");
  check("the tale names the star-seed", se.state.tale.some(t => t.text.includes("star-seed")),
    `tale=${se.state.tale.slice(-6).map(t => t.text).join(" | ")}`);
  st.ws.close(); se.ws.close();
}

// ── (f) CURSE ATTRITION ON THE DERIVED TILE ───────────────
console.log("\n(f) curse attrition on the derived tile");
{
  const cf = client("CURSE");
  await cf.join({ devName: "Curse Sue", room: "table-52-curse" });
  const cf2 = client("CURSE-2");
  await cf2.join({ devName: "Curse Witness", room: "table-52-curse" });
  const landing = cf.you.landing;
  const rootCard = cf.you.hand.find(c => c.name === "Rootbound Confessor");
  cf.send({ type: "summon", cardId: rootCard.id, hex: landing });
  await cf.waitFor(c => !!unitByName(c, "Rootbound Confessor"), "the confessor stands", 15000);
  // The curse's attrition is the referee's work, and the
  // referee runs only while a battle is active — deal the
  // wave so the withering ticks. (The dealt dark hunt the
  // confessor, but the march and the window are short.)
  await beginCasualWave(cf);
  const target = cf.state.map
    .filter(t => t.cursed && ringOf(t.id) >= 4 && axialDist(landing, t.id) >= 1 && axialDist(landing, t.id) <= 4)
    .sort((x, y) => axialDist(landing, x.id) - axialDist(landing, y.id))[0]?.id;
  check("a cursed tile at ring ≥4 waits within a short march (≤4 hexes)", !!target, `landing=${landing}`);
  const rootUnit = () => unitByName(cf, "Rootbound Confessor");
  cf.send({ type: "march", cardId: rootCard.id, from: landing, to: target });
  await cf.waitFor(c => { const u = rootUnit(); return !!u && u.moving === false && u.hex === target; },
    "the confessor arrives — hex derived from its pos", 60000);
  // Attrition burns the shield before the body (hurtByCurse),
  // so the withering is measured in flesh = hp + shield.
  const fleshAtArrival = rootUnit().hp + (rootUnit().shield ?? 0);
  let minFlesh = fleshAtArrival;
  const watchStart = Date.now();
  while (Date.now() - watchStart < 7000) {
    const u = rootUnit();
    if (!u) break;
    minFlesh = Math.min(minFlesh, u.hp + (u.shield ?? 0));
    await sleep(200);
  }
  const tileAtEnd = cf.state.map.find(t => t.id === target);
  check("the curse withers the standing unit (hp+shield fell ≥0.4 in 7s on ring ≥4)",
    fleshAtArrival - minFlesh >= 0.4,
    `flesh ${fleshAtArrival} → min ${minFlesh} (hp=${rootUnit()?.hp}, shield=${rootUnit()?.shield}) target=${target} cursedAtEnd=${tileAtEnd?.cursed} darkLeft=${cf.state.dark.length} tenderFallen=${meIn(cf)?.fallen}`);
  cf.ws.close(); cf2.ws.close();
}

console.log(`\ntest52: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
