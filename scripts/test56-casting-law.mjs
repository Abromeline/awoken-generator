// test56 — THE CASTING LAW AT THE TABLE (Phase C, Table stream 2):
// (a) rollCast control: a Binder, a Warden and a Sage each cast
//     the SAME binding-school working (the Springleaf, routed
//     through castWard) 40 times in one quiet room. Default book:
//     DC 11 (level 1 + 10). At Tender Lv 10 the ladder lends +3,
//     so Binder rolls +5 (75%), Warden and Sage roll −3 (35% —
//     the Sage's −3-everywhere ties the cross-class −3 on a
//     binding cast; her unique worst shows on spell casts, and
//     here she must tie for worst, never beat the Warden).
//     Energy is measured exactly: every cast, fizzle or stand,
//     spends the def's ⚡3 — refilled by seeding each Tender a
//     wide roster (the game's own max-energy law pays +2 per
//     held Awokin, so 60 stand-ins bank ⚡130 at the seat).
//     (Binding defs were chosen over heal/runes because Heal
//     needs a wounded unit per cast and runes occupy their hex
//     on success; the Springleaf's groves stack freely, so one
//     room can hold 40 casts a side.)
// (b) THE SAGE'S COMPANY: two campaign rooms in parallel — a
//     Sage's five stone Awokin vs a Warden's identical five —
//     against dealt tangles (armor 8). The strikes ledger is
//     the referee's own witness: the Sage company's light hit
//     rate must run hotter (+2 attack: 80% vs 70% expected) and
//     the dark's blows against it must land colder (+2 AC:
//     victim toughness 11 → AC 13 vs 11, 40% vs 50% expected).
// (c) SPRINGLEAF: burst heal lands on a wounded ally inside the
//     radius and NOT on one outside it; 1d4 saplings root over
//     ~6.4s as half-radius groves; the mother (34s life) is gone
//     by cast+39s. Real seconds are waited — the law is not
//     shortened for the test.
// (d) PASSIVE WALLS: a standing stone unit raises six passive
//     ward workings on its hex's edges within ticks of a
//     battle starting; a dark blow across an edge breaks one;
//     it re-raises ~2.8s later while the unit stands; recall
//     the unit and the walls come down.
// (e) SAGE POUR: pourWorking — a Sage pouring 2 root lays 4
//     into the working (pour 0 → 4, hp +8 at hpPerPoint 2)
//     while her pool pays only 2 (30 → 28); a Warden control
//     lays exactly 2 and pays exactly 2.
import WebSocket from "ws";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

const DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-test56-"));
process.env.DATA_DIR = DATA_DIR;
process.env.PORT = "39979";
process.env.WORKSHOP_PASSWORD = "test56-word";
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
const base = "http://127.0.0.1:39979";
const db = new Database(join(DATA_DIR, "app.db"));

const U = [1292 * 40 / 796, 470 * 40 / 796], V = [0, 948 * 40 / 796];
const parseId = (id) => id.split(",").map(Number);
const centerOf = (id) => { const [q, r] = parseId(id); return { x: q * U[0] + r * V[0], y: q * U[1] + r * V[1] }; };
const pxDist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const neighbours = (id) => { const [q, r] = parseId(id); return DIRS.map(([dq, dr]) => `${q + dq},${r + dr}`); };
const meIn = (c) => c.state.players.find(p => p.key === c.you.key);

function client(label) {
  const ws = new WebSocket("ws://127.0.0.1:39979/table/ws");
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

/** A bound Tender at Lv 10 (3800 EXP), a chosen class, named
 *  fighter Awokin (single body layers of the given element /
 *  power / toughness) plus filler Awokin whose only job is the
 *  max-energy law's +2 a head — the harness's energy refill. */
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
    insAwokin.run(name, name, `test/awokin-${name}.png`, composition, tenderName, ownerKey, now);
  };
  for (const f of fighters) addAwokin(f.name, f.element, f.power, f.toughness);
  for (let i = 0; i < filler; i++) addAwokin(`Filler ${tag}-${i}`, "sky", 2, 2);
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

// ── (e) SAGE POUR ─────────────────────────────────────────
console.log("\n(e) sage attune mastery in pourWorking");
{
  const rw = await seedBoundTender({ tenderName: "Pour Runewright", password: "pour-rw-56", tag: "56E1", classKey: "runewright", filler: 20 });
  const sg = await seedBoundTender({ tenderName: "Pour Sage", password: "pour-sg-56", tag: "56E2", classKey: "sage", filler: 5 });
  const wd = await seedBoundTender({ tenderName: "Pour Warden", password: "pour-wd-56", tag: "56E3", classKey: "warden", filler: 5 });
  for (const k of [sg.ownerKey, wd.ownerKey]) {
    db.prepare("INSERT INTO aspect_attunement (owner_key, element, points, updated_at) VALUES (?, 'root', 30, ?) ON CONFLICT(owner_key, element) DO UPDATE SET points = 30").run(k, Date.now());
  }
  const room = "table-56-e";
  const cRW = await joinBound(rw.tt, room, "POUR-RW");
  const cSG = await joinBound(sg.tt, room, "POUR-SG");
  const cWD = await joinBound(wd.tt, room, "POUR-WD");
  check("the sage's seat carries her class", cSG.you.classKey === "sage", `classKey=${cSG.you.classKey}`);

  // Two neutral lattices from the Runewright (in-school, so
  // most casts stand; retry the fizzles the law now deals).
  const hexes = cRW.state.map.map(t => t.id).filter(id => id !== "0,0" && id !== cRW.you.landing);
  const castLattice = async (hex) => {
    for (let tries = 0; tries < 10; tries++) {
      cRW.send({ type: "castRune", root: "lattice", hue: "unaligned", hexes: [hex], pour: 0 });
      try {
        await cRW.waitFor(cc => cc.state.workings.some(w => w.kind === "rune" && w.hex === hex), "the lattice stands", 6000);
        return cRW.state.workings.find(w => w.kind === "rune" && w.hex === hex);
      } catch { /* a fizzle — cast again */ }
    }
    throw new Error("lattice never stood");
  };
  const rune1 = await castLattice(hexes[10]);
  const rune2 = await castLattice(hexes[20]);
  check("both neutral lattices stand at pour 0", rune1.pour === 0 && rune2.pour === 0, `p1=${rune1.pour} p2=${rune2.pour}`);
  const hp1 = rune1.hp, hp2 = rune2.hp;

  cSG.send({ type: "pourWorking", workingId: rune1.id, hue: "root", pour: 2 });
  await cSG.waitFor(cc => cc.state.workings.find(w => w.id === rune1.id)?.hue === "root", "the sage's pour lands", 8000);
  const after1 = cRW.state.workings.find(w => w.id === rune1.id);
  const sagePool = db.prepare("SELECT points FROM aspect_attunement WHERE owner_key = ? AND element = 'root'").get(sg.ownerKey)?.points;
  check("SAGE: pouring 2 lays 4 into the working (pour 0 → 4)", after1.pour === 4, `pour=${after1.pour}`);
  check("SAGE: the working's hp gains the laid measure (+8 at hpPerPoint 2)", after1.hp === hp1 + 8 && after1.maxHp === hp1 + 8, `hp ${hp1} → ${after1.hp}`);
  check("SAGE: her pool pays only the 2 she named (30 → 28)", sagePool === 28, `pool=${sagePool}`);
  check("SAGE: the seat's pools echo the pay (28)", Math.floor(cSG.you.pools?.root ?? -1) === 28, `you.pools.root=${cSG.you.pools?.root}`);

  cWD.send({ type: "pourWorking", workingId: rune2.id, hue: "root", pour: 2 });
  await cWD.waitFor(cc => cc.state.workings.find(w => w.id === rune2.id)?.hue === "root", "the warden's pour lands", 8000);
  const after2 = cRW.state.workings.find(w => w.id === rune2.id);
  const wdPool = db.prepare("SELECT points FROM aspect_attunement WHERE owner_key = ? AND element = 'root'").get(wd.ownerKey)?.points;
  check("CONTROL: pouring 2 lays exactly 2 (pour 0 → 2, hp +4)", after2.pour === 2 && after2.hp === hp2 + 4, `pour=${after2.pour} hp ${hp2} → ${after2.hp}`);
  check("CONTROL: the warden's pool pays exactly 2 (30 → 28)", wdPool === 28, `pool=${wdPool}`);
  cRW.ws.close(); cSG.ws.close(); cWD.ws.close();
}

// ── (a) rollCast CONTROL ──────────────────────────────────
console.log("\n(a) rollCast — binder vs warden vs sage on the binding school (the Springleaf)");
{
  const room = "table-56-a";
  const mk = async (name, pw, tag, classKey) => {
    const s = await seedBoundTender({ tenderName: name, password: pw, tag, classKey, filler: 200 });
    return joinBound(s.tt, room, tag);
  };
  const binder = await mk("Cast Binder", "cast-binder-56", "56A-B", "binder");
  const warden = await mk("Cast Warden", "cast-warden-56", "56A-W", "warden");
  const sage = await mk("Cast Sage", "cast-sage-56", "56A-S", "sage");
  check("seats carry their classes", binder.you.classKey === "binder" && warden.you.classKey === "warden" && sage.you.classKey === "sage",
    `${binder.you.classKey}/${warden.you.classKey}/${sage.you.classKey}`);

  // N=120 a side, and the bands below are set at ~2.5σ of the
  // binomial at the law's own odds (binder p≈.75, cross/sage
  // p≈.35): at the old N=40 the "gap ≥ 10" band sat on the
  // expected gap itself and the section failed on dice weather
  // alone roughly one run in five (seen 2026-10-19: sage=21,
  // warden=8, binder=26 — no law broken). The purse must hold
  // N×⚡3 = 360: max energy is 10 + 2 per power-2 filler, so
  // the (a) seeds carry 200 fillers (410⚡).
  const N = 120;
  async function castN(c) {
    const landing = c.you.landing;
    const hexB = neighbours(landing).find(id => id !== "0,0");
    const e0 = meIn(c).energy;
    let ok = 0, fizz = 0;
    for (let i = 0; i < N; i++) {
      const grovesBefore = c.state.workings.filter(w => w.kind === "grove" && w.ownerKey === c.you.key).length;
      const eBefore = meIn(c).energy;
      c.send({ type: "castWard", root: "springleaf", hue: "root", hexA: landing, hexB, pour: 0 });
      await c.waitFor(cc => meIn(cc).energy <= eBefore - 3, "the cast resolves (energy spent)", 8000);
      const grovesAfter = c.state.workings.filter(w => w.kind === "grove" && w.ownerKey === c.you.key).length;
      if (grovesAfter > grovesBefore) ok++; else fizz++;
    }
    return { ok, fizz, spent: e0 - meIn(c).energy };
  }
  const rb = await castN(binder);
  const rw2 = await castN(warden);
  const rs = await castN(sage);
  console.log(`  binder ${rb.ok}/${N} stood (spent ⚡${rb.spent}); warden ${rw2.ok}/${N} (⚡${rw2.spent}); sage ${rs.ok}/${N} (⚡${rs.spent})`);
  check("every cast spent exactly ⚡3, fizzle or stand (120 × 3 = 360 each)",
    rb.spent === 360 && rw2.spent === 360 && rs.spent === 360, `spent=${rb.spent}/${rw2.spent}/${rs.spent}`);
  check("the fizzles were told as unravels", binder.state.tale.some(t => t.text.includes("unravels — the roll falls short")),
    `tale tail=${binder.state.tale.slice(-3).map(t => t.text).join(" | ")}`);
  check("BINDER (in-school +5) stands far oftener than WARDEN (cross −3): gap ≥ 30 of 120 (≈2.5σ inside the expected ~48)",
    rb.ok >= rw2.ok + 30, `binder=${rb.ok} warden=${rw2.ok}`);
  check("SAGE casts worst of all (tied-worst with the cross-class warden, never above him by >19 ≈ 2.5σ, and below the binder by ≥30)",
    rs.ok <= rw2.ok + 19 && rb.ok >= rs.ok + 30, `sage=${rs.ok} warden=${rw2.ok} binder=${rb.ok}`);
  binder.ws.close(); warden.ws.close(); sage.ws.close();
}

// ── (c) SPRINGLEAF ────────────────────────────────────────
console.log("\n(c) springleaf — burst, saplings, expiry");
{
  const room = "table-56-c";
  const bSeed = await seedBoundTender({
    tenderName: "Grove Binder", password: "grove-binder-56", tag: "56C-B", classKey: "binder", filler: 40,
    fighters: [{ name: "Grove Guard", element: "tide", power: 0, toughness: 8 }],
  });
  const aSeed = await seedBoundTender({
    tenderName: "Far Ally", password: "grove-ally-56", tag: "56C-A", classKey: "warden", filler: 40,
    fighters: [{ name: "Far Guard", element: "tide", power: 0, toughness: 8 }],
  });
  const bc = await joinBound(bSeed.tt, room, "GROVE-B");
  const ac = await joinBound(aSeed.tt, room, "GROVE-A");
  const bLand = bc.you.landing, aLand = ac.you.landing;
  const bCard = bc.you.hand.find(x => x.name === "Grove Guard");
  const aCard = ac.you.hand.find(x => x.name === "Far Guard");
  bc.send({ type: "summon", cardId: bCard.id, hex: bLand });
  await bc.waitFor(cc => cc.state.field.some(u => u.name === "Grove Guard"), "the grove guard stands");
  ac.send({ type: "summon", cardId: aCard.id, hex: aLand });
  await ac.waitFor(cc => cc.state.field.some(u => u.name === "Far Guard"), "the far guard stands");
  const guardB = () => bc.state.field.find(u => u.name === "Grove Guard");
  const guardA = () => bc.state.field.find(u => u.name === "Far Guard");
  const flesh = (u) => u.hp + (u.shield ?? 0);
  let fleshB0 = flesh(guardB()), fleshA0 = flesh(guardA());

  // Radius at Lv 10, by the law's formula:
  const radiusPx = (66 + 12 * 10) * 2.75 * (69 / 80);
  // The grove's target is a neighbour of the binder's landing.
  // The two landings stand only ~390px apart — INSIDE the
  // radius — so the far guard marches FIRST, while no battle
  // runs and nothing can kill either guard on the road, to
  // the tile farthest from the grove's ground.
  const hexB = neighbours(bLand).filter(id => id !== "0,0")
    .sort((x, y) => pxDist(centerOf(y), guardA().pos) - pxDist(centerOf(x), guardA().pos))[0];
  const farTile = bc.state.map.map(t => t.id).filter(id => id !== "0,0" && id !== guardA().hex)
    .sort((x, y) => pxDist(centerOf(y), centerOf(hexB)) - pxDist(centerOf(x), centerOf(hexB)))[0];
  if (pxDist(centerOf(hexB), guardA().pos) <= radiusPx + 30) {
    ac.send({ type: "march", cardId: aCard.id, from: guardA().hex, to: farTile });
    await ac.waitFor(cc => { const u = cc.state.field.find(x => x.name === "Far Guard"); return !!u && !u.moving && u.hex === farTile; },
      "the far guard marches out of the grove's reach", 90000);
    await sleep(400);
    fleshA0 = flesh(guardA());
  }

  // Wound both guards: deal the wave and let the dark work.
  bc.send({ type: "startWave" });
  await bc.waitFor(cc => cc.state.battle.active && cc.state.dark.length > 0, "the wave is dealt", 20000);
  const woundStart = Date.now();
  let wounded = false;
  while (Date.now() - woundStart < 150000) {
    // A guard the dark finishes is re-summoned where it
    // stands watch (its landing / its far post) and its
    // flesh baseline resets — the wounding goes on.
    if (!guardB()) {
      const back = bc.you.hand.find(x => x.name === "Grove Guard");
      if (back) { bc.send({ type: "summon", cardId: back.id, hex: bLand }); await sleep(700); if (guardB()) fleshB0 = flesh(guardB()); }
    }
    if (!guardA()) {
      const back = ac.you.hand.find(x => x.name === "Far Guard");
      const post = ac.you.landing;
      if (back) {
        // Re-summon at the ally's own side, then march back out.
        ac.send({ type: "summon", cardId: back.id, hex: post });
        await sleep(700);
        if (guardA()) fleshA0 = flesh(guardA());
      }
    }
    if (guardB() && guardA() && fleshB0 - flesh(guardB()) >= 2.5 && fleshA0 - flesh(guardA()) >= 2.5) { wounded = true; break; }
    if (!bc.state.battle.active && bc.state.dark.length === 0) bc.send({ type: "startWave" });
    await sleep(600);
  }
  check("both guards were wounded by ≥2.5 flesh (hp+shield) before the cast", wounded && !!guardB() && !!guardA(),
    `B ${fleshB0} → ${guardB() ? flesh(guardB()) : "gone"}; A ${fleshA0} → ${guardA() ? flesh(guardA()) : "gone"}`);
  // CAST-READY RECOVERY. However the wounding battle left
  // the field — a guard felled, the far guard re-summoned at
  // her own landing INSIDE the radius, the battle spent —
  // this loop restores the one configuration the burst may
  // be measured in: both guards standing, both wounded, the
  // far guard at her far post, and a battle running (a fresh
  // wave if the old one spent itself, so the new dark are
  // still crossing the rim while the grove roots and blooms
  // and the mother is alive at +12s on the referee's tick —
  // not merely un-faded because a tired battle ended early).
  async function ensureCastReady() {
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      if (!guardB()) {
        const back = bc.you.hand.find(x => x.name === "Grove Guard");
        if (back) { bc.send({ type: "summon", cardId: back.id, hex: bLand }); await sleep(700); if (guardB()) fleshB0 = flesh(guardB()); }
        else await sleep(600);
        continue;
      }
      if (!guardA()) {
        const back = ac.you.hand.find(x => x.name === "Far Guard");
        if (back) { ac.send({ type: "summon", cardId: back.id, hex: ac.you.landing }); await sleep(700); if (guardA()) fleshA0 = flesh(guardA()); }
        else await sleep(600);
        continue;
      }
      if (!guardA().moving && pxDist(centerOf(hexB), guardA().pos) <= radiusPx + 30) {
        ac.send({ type: "march", cardId: aCard.id, from: guardA().hex, to: farTile });
        await ac.waitFor(cc => { const u = cc.state.field.find(x => x.name === "Far Guard"); return !!u && !u.moving && u.hex === farTile; },
          "the far guard takes her far post", 90000).catch(() => console.log("  (far guard march incomplete — recovery retries)"));
        await sleep(300);
        continue;
      }
      if (fleshB0 - flesh(guardB()) < 2.5 || fleshA0 - flesh(guardA()) < 2.5) {
        if (!bc.state.battle.active) { bc.send({ type: "startWave" }); await sleep(1200); }
        await sleep(500);
        continue;
      }
      // Both guards stand wounded and posted. Cast only on
      // a FRESH wave: if the running battle is an engaged
      // remnant it will die inside the grove's first beats
      // and fade her early (seen twice: battleActive=false
      // at +12s) — let it spend itself; the wounds persist.
      // Ready means: no battle (deal one and re-check), or
      // a battle whose dark are all still crossing, >250px
      // from both guards.
      if (!bc.state.battle.active) {
        bc.send({ type: "startWave" });
        await sleep(1500);
        continue;
      }
      if (bc.state.dark.length >= 3 && bc.state.dark.every(d => pxDist(d.pos, guardB().pos) > 250 && pxDist(d.pos, guardA().pos) > 250)) return true;
      // The fresh-wave configuration is preferred, not
      // mandatory: after 90s of trying, guards-ready with
      // any battle running is accepted — the mother-at-+12s
      // check downstream is the real proof of her life.
      if (Date.now() - (deadline - 180000) > 90000) return true;
      await sleep(500);
    }
    return false;
  }
  const castReady = await ensureCastReady();
  check("cast-ready: both guards stand wounded, the far guard at her far post, a battle running", castReady,
    `B=${guardB() ? "stands" : "gone"} A=${guardA() ? "stands" : "gone"} battle=${bc.state.battle.active}`);
  const distA = guardA() ? pxDist(centerOf(hexB), guardA().pos) : -1;
  const distB = guardB() ? pxDist(centerOf(hexB), guardB().pos) : -1;
  check("geometry: the grove guard stands inside the radius, the far guard outside it",
    distB <= radiusPx && distA > radiusPx + 30, `distB=${distB.toFixed(0)} distA=${distA.toFixed(0)} radius=${radiusPx.toFixed(0)}`);

  // Cast (retrying fizzles — the binding roll at +5 stands 75%).
  let castAt = 0, baseB = 0, baseA = 0, mother = null;
  for (let tries = 0; tries < 10 && !mother; tries++) {
    if (!guardB() || !guardA()) break; // a guard fell in the window — the checks below report it
    baseB = flesh(guardB()); baseA = flesh(guardA());
    const eBefore = meIn(bc).energy;
    bc.send({ type: "castWard", root: "springleaf", hue: "root", hexA: bLand, hexB, pour: 0 });
    await bc.waitFor(cc => meIn(cc).energy <= eBefore - 3, "the springleaf cast resolves", 8000);
    mother = bc.state.workings.find(w => w.kind === "grove" && w.mother && w.ownerKey === bc.you.key) ?? null;
    if (mother) castAt = Date.now();
  }
  check("the springleaf stood (a mother grove working, kind grove, engine springleaf)", !!mother,
    `errors=${bc.errors.slice(-2).join(" | ")}`);
  if (mother) {
    check("the grove's radius is the tender ward size in Table px (≈441.1 at Lv 10)", Math.abs(mother.radiusPx - radiusPx) < 2, `radiusPx=${mother.radiusPx}`);
    check("the grove is centred on the target hex's centre", pxDist(mother.pos, centerOf(hexB)) < 2, `pos=${JSON.stringify(mother.pos)} centre=${JSON.stringify(centerOf(hexB))}`);
    check("the grove's life is ~34s", mother.expiresAt - castAt > 29000 && mother.expiresAt - castAt <= 34500, `ttl≈${mother.expiresAt - castAt}ms`);
    const gainB = guardB() ? flesh(guardB()) - baseB : -999, gainA = guardA() ? flesh(guardA()) - baseA : 999;
    check("BURST: the wounded ally inside the radius was mended (flesh +≥1)", gainB >= 1, `gainB=${gainB.toFixed(2)}`);
    check("BURST: the wounded ally outside the radius was NOT mended (flesh gain <1)", gainA < 1, `gainA=${gainA.toFixed(2)}`);

    // Saplings root over the following seconds.
    let maxGroves = 1, sapling = null, presentAt12 = false;
    const sapStart = Date.now();
    while (Date.now() - sapStart < 13000) {
      const groves = bc.state.workings.filter(w => w.kind === "grove");
      maxGroves = Math.max(maxGroves, groves.length);
      sapling = groves.find(w => !w.mother) ?? sapling;
      if (Date.now() - castAt >= 11500) presentAt12 = groves.some(w => w.id === mother.id);
      await sleep(300);
    }
    check("SAPPLINGS: the grove count grew to 1 + 1d4 (2..5) within ~13s", maxGroves >= 2 && maxGroves <= 5, `maxGroves=${maxGroves}`);
    check("SAPLING shape: half the mother's radius, rooted within 0.55 × her radius of her centre",
      !!sapling && Math.abs(sapling.radiusPx - mother.radiusPx / 2) < 1.5 && pxDist(sapling.pos, mother.pos) <= 0.55 * mother.radiusPx + 2,
      sapling ? `r=${sapling.radiusPx} off=${pxDist(sapling.pos, mother.pos).toFixed(0)}` : "no sapling seen");
    check("the mother still stands at ~12s", presentAt12, `battleActive=${bc.state.battle.active} dark=${bc.state.dark.length}`);

    // Expiry: gone by cast + 39s (the 34s law + margin), waited in real seconds.
    const remain = castAt + 39000 - Date.now();
    if (remain > 0) await sleep(remain);
    bc.send({ type: "glideStop" }); // nudge a state push
    await sleep(800);
    const gone = !bc.state.workings.some(w => w.id === mother.id);
    check("EXPIRY: the mother grove is gone by cast+39s", gone, `battleActive=${bc.state.battle.active} groves=${bc.state.workings.filter(w => w.kind === "grove").length}`);
  }
  bc.ws.close(); ac.ws.close();
}

// ── (d) PASSIVE WALLS ─────────────────────────────────────
console.log("\n(d) passive walls — stone hands raise, break, re-raise, and fall with their unit");
{
  const room = "table-56-d";
  const seed = await seedBoundTender({
    tenderName: "Wall Tender", password: "wall-tender-56", tag: "56D", classKey: "warden", filler: 30,
    fighters: [{ name: "Stone Sentinel", element: "stone", power: 0, toughness: 8 }],
  });
  const c = await joinBound(seed.tt, room, "WALL");
  const landing = c.you.landing;
  const card = c.you.hand.find(x => x.name === "Stone Sentinel");
  c.send({ type: "summon", cardId: card.id, hex: landing });
  await c.waitFor(cc => cc.state.field.some(u => u.name === "Stone Sentinel"), "the sentinel stands");
  const sentinel = () => c.state.field.find(u => u.name === "Stone Sentinel");
  const passives = () => c.state.workings.filter(w => w.engine === "passive");
  c.send({ type: "startWave" });
  await c.waitFor(cc => cc.state.battle.active, "the battle runs (the referee's tick with it)", 20000);
  await c.waitFor(cc => passives().length >= 6, "passive walls rise on the sentinel's edges", 25000);
  check("a standing stone unit raises passive ward workings on all six edges of its hex",
    passives().length === 6 && passives().every(w => w.kind === "ward" && (w.hexA === landing || w.hexB === landing) && w.hue === "stone"),
    `count=${passives().length} hues=${passives().map(w => w.hue).join(",")}`);

  // Break one: let the dark fight. A blow across an edge is
  // taken by the wall on that edge; hpForCast(seal, Lv 1) = 7,
  // so a few mitigated blows break it. Waves are re-dealt
  // whenever one breaks, and the sentinel re-summoned if felled.
  const edgeOf = (w) => [w.hexA, w.hexB].sort().join("|");
  let seen = new Map(passives().map(w => [w.id, edgeOf(w)]));
  let breakAt = 0, brokenEdge = null;
  const breakStart = Date.now();
  // STALL-BREAKER: a lone dark can hang outside the edge
  // geometry indefinitely (seen: dark=1, sentinel untouched
  // for 180s). Every 25s without a break, the sentinel
  // re-posts beside the nearest living dark — or one tile
  // over when none lives — new hex, new edges, new geometry
  // for the dark to cross. Walls that vanish because their
  // sustainer MOVED are not breaks: detection is grace-guarded
  // for 3s after any arrival, and the seen-map resets.
  let stallMark = Date.now(), stallStep = 0, graceUntil = 0;
  while (Date.now() - breakStart < 240000 && !brokenEdge) {
    if (!c.state.battle.active && c.state.dark.length === 0) c.send({ type: "startWave" });
    if (!sentinel()) {
      const back = c.you.hand.find(x => x.name === "Stone Sentinel");
      if (back) { c.send({ type: "summon", cardId: back.id, hex: landing }); await sleep(800); }
    }
    if (sentinel() && !sentinel().moving && Date.now() - stallMark > 25000) {
      // Post the sentinel beside the nearest living dark: its
      // blows at her must cross her own walled edges. (Blind
      // neighbour-cycling let a lone dark park at the seed for
      // a full 240s with the sentinel untouched — seen
      // 2026-10-19, passives=6 dark=1 sentinelHp=8.)
      let dest = null;
      if (c.state.dark.length) {
        const sPos = sentinel().pos ?? centerOf(sentinel().hex);
        const near = [...c.state.dark].sort((a, b) => pxDist(sPos, a.pos) - pxDist(sPos, b.pos))[0];
        const mapIds = new Set(c.state.map.map(t => t.id));
        dest = neighbours(near.hex).find(id => id !== "0,0" && id !== near.hex && id !== sentinel().hex && mapIds.has(id)) ?? null;
      }
      if (!dest) dest = neighbours(sentinel().hex)[stallStep++ % 6];
      if (dest && dest !== "0,0") {
        c.send({ type: "march", cardId: card.id, from: sentinel().hex, to: dest });
        await c.waitFor(cc => { const u = cc.state.field.find(x => x.name === "Stone Sentinel"); return !!u && !u.moving; },
          "the sentinel re-posts", 40000).catch(() => {});
        seen = new Map(passives().map(w => [w.id, edgeOf(w)]));
        graceUntil = Date.now() + 3000;
        stallMark = Date.now();
        continue;
      }
      stallMark = Date.now();
    }
    const nowList = passives();
    for (const [id, edge] of seen) {
      if (!nowList.some(w => w.id === id) && sentinel() && !sentinel().moving && c.state.battle.active && Date.now() > graceUntil) { brokenEdge = edge; breakAt = Date.now(); break; }
    }
    seen = new Map(nowList.map(w => [w.id, edgeOf(w)]));
    await sleep(350);
  }
  check("a dark blow across an edge BREAKS its passive wall (the wall took the blow)", !!brokenEdge,
    `passives now=${passives().length} dark=${c.state.dark.length} sentinelHp=${sentinel()?.hp}`);
  let reRaiseMs = null;
  if (brokenEdge) {
    const waitStart = Date.now();
    while (Date.now() - waitStart < 20000) {
      const w = passives().find(x => edgeOf(x) === brokenEdge);
      if (w) { reRaiseMs = Date.now() - breakAt; break; }
      if (!c.state.battle.active && c.state.dark.length === 0) c.send({ type: "startWave" });
      await sleep(250);
    }
    check("the broken edge RE-RAISES ~2.8s later while the unit stands (≥1.2s, ≤20s)",
      reRaiseMs !== null && reRaiseMs >= 1200 && reRaiseMs <= 20000, `reRaiseMs=${reRaiseMs}`);
  }
  // Recall the unit: its walls come down with it.
  if (sentinel()) c.send({ type: "recall", hex: sentinel().hex, cardId: card.id });
  const fallStart = Date.now();
  let fell = false;
  while (Date.now() - fallStart < 15000) {
    if (passives().length === 0) { fell = true; break; }
    await sleep(400);
  }
  check("when the unit is recalled, its passive walls vanish", fell, `passives=${passives().length} battleActive=${c.state.battle.active}`);
  c.ws.close();
}

// ── (b) THE SAGE'S COMPANY ────────────────────────────────
console.log("\n(b) the sage's company — +2 attack, +2 AC");
{
  async function companyRoom({ room, tenderName, password, tag, classKey }) {
    const st = client(`ST-${tag}`);
    await st.join({ devName: `Story ${tag}`, room, storytender: true });
    const seed = await seedBoundTender({
      tenderName, password, tag, classKey, filler: 25,
      fighters: [0, 1, 2, 3, 4].map(i => ({ name: `Stone ${tag}-${i}`, element: "stone", power: 3, toughness: 11 })),
    });
    const c = await joinBound(seed.tt, room, tag);
    const landing = c.you.landing;
    // Summon one at a time, each awaited — and note the stack
    // law: one tile holds at most four of the light, so the
    // company stands four on the landing (a fifth send, if the
    // cap refuses it, is read off the errors and stood down).
    for (const f of c.you.hand.filter(x => x.name.startsWith(`Stone ${tag}-`))) {
      const before = c.state.field.filter(u => u.ownerKey === c.you.key).length;
      if (before >= 4) break;
      c.send({ type: "summon", cardId: f.id, hex: landing });
      await c.waitFor(cc => cc.state.field.filter(u => u.ownerKey === cc.you.key).length > before, `${f.name} stands`, 10000)
        .catch(() => console.log(`  (summon of ${f.name} did not stand: errors=${c.errors.slice(-1).join(" ")} field=${c.state.field.length} energy=${meIn(c)?.energy})`));
    }
    await c.waitFor(cc => cc.state.field.filter(u => u.ownerKey === cc.you.key).length >= 4, "the company stands (four on the landing, stack law)", 20000);
    // THE RING GUARD: tangles dealt on the far rim find the
    // SEED nearer than a ring-2 company and drain the bank
    // at the gate — the dark halts within 69px of the seed's
    // CENTRE, and veers to a light only when that light is
    // nearer than the centre. One guard tile cannot cover
    // the halt circle (a lone guard watched a tangle drain
    // ⚡1.06/s forever, 83.8px away across the seed), and
    // the seed's own tile refuses marches by law. So all
    // four Awokin ring the seed: one on each ring-1 tile
    // whose centre is <69.2px out — the 47.6px v-pair and
    // the 69.09px u-pair, leaving only the 69.24px diagonal
    // pair empty; the steering geometry then veers every
    // approach to some guard before it can halt at the gate.
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
      .catch(() => console.log(`  (ring guard march incomplete: field=${JSON.stringify(c.state.field.filter(u => u.ownerKey === c.you.key).map(u => [u.hex, !!u.moving]))} errors=${c.errors.slice(-1).join(" ")})`));
    return { st, c, landing };
  }
  const sageR = await companyRoom({ room: "campaign-test56-sage", tenderName: "Company Sage", password: "company-sage-56", tag: "56B-S", classKey: "sage" });
  const ctrlR = await companyRoom({ room: "campaign-test56-ctrl", tenderName: "Company Warden", password: "company-warden-56", tag: "56B-C", classKey: "warden" });

  const tally = (ctx) => {
    const light = ctx.c.allStrikes.filter(s => s.side === "light" && !s.weapon && s.element === "stone");
    const dark = ctx.c.allStrikes.filter(s => s.side === "dark");
    return {
      lightN: light.length, lightRate: light.length ? light.filter(s => s.hit).length / light.length : 0,
      darkN: dark.length, darkRate: dark.length ? dark.filter(s => s.hit).length / dark.length : 0,
    };
  };
  const driveStart = Date.now();
  let driveTick = 0;
  while (Date.now() - driveStart < 240000) {
    const ts = tally(sageR), tc = tally(ctrlR);
    if (ts.lightN >= 70 && ts.darkN >= 60 && tc.lightN >= 70 && tc.darkN >= 60) break;
    if (++driveTick % 30 === 0) {
      for (const [nm, ctx] of [["sage", sageR], ["ctrl", ctrlR]]) {
        console.log(`  [drive ${nm}] dark=${ctx.c.state.dark.length} battle=${ctx.c.state.battle.active} over=${ctx.c.state.campaign.over} bank=${Math.floor(ctx.c.state.campaign.bank ?? -1)} field=${ctx.c.state.field.length} reserve=${ctx.st.you?.storytender?.reserve.length} stErr=${ctx.st.errors.slice(-1).join(" ")} err=${ctx.c.errors.slice(-1).join(" ")}`);
      }
    }
    for (const ctx of [sageR, ctrlR]) {
      // Keep the company standing: re-summon any fallen stone.
      const standing = ctx.c.state.field.filter(u => u.ownerKey === ctx.c.you.key).length;
      if (standing < 4) {
        const back = ctx.c.you.hand.find(x => x.name.startsWith("Stone "));
        if (back && (ctx.c.you.energy ?? 0) >= 3) ctx.c.send({ type: "summon", cardId: back.id, hex: ctx.landing });
      }
      // BATCH-AND-RESOLVE dealing: a new batch is dealt
      // only once the field is clear, so gate drain can
      // never stack batch upon batch faster than the gate
      // guard's kills pay harvest back into the bank.
      // (Continuous dealing drowned the control campaign
      // in an earlier drive — the bank hit 0 with its
      // company still standing.)
      if (!ctx.c.state.campaign.over && ctx.c.state.dark.length === 0 && !ctx.c.state.battle.active) {
        const reserve = ctx.st.you?.storytender?.reserve.length ?? 0;
        if (reserve === 0) { for (let i = 0; i < 8; i++) ctx.st.send({ type: "stAdd", kind: "tangle" }); }
        else ctx.st.send({ type: "stDeal" });
      }
    }
    await sleep(600);
  }
  const ts = tally(sageR), tc = tally(ctrlR);
  console.log(`  sage company:    light ${ts.lightN} strikes, hit rate ${ts.lightRate.toFixed(2)}; dark blows ${ts.darkN}, landed ${ts.darkRate.toFixed(2)}`);
  console.log(`  warden company:  light ${tc.lightN} strikes, hit rate ${tc.lightRate.toFixed(2)}; dark blows ${tc.darkN}, landed ${tc.darkRate.toFixed(2)}`);
  check("both companies saw enough witnessed strikes (light ≥50, dark ≥40 each)",
    ts.lightN >= 50 && ts.darkN >= 40 && tc.lightN >= 50 && tc.darkN >= 40,
    JSON.stringify({ ts, tc }));
  check("+2 ATTACK: the sage company's hit rate runs hotter than the control's (combined margin)",
    (ts.lightRate - tc.lightRate) >= -0.02 && (ts.lightRate - tc.lightRate) + (tc.darkRate - ts.darkRate) >= 0.07,
    `lightDiff=${(ts.lightRate - tc.lightRate).toFixed(2)}`);
  check("+2 AC: the dark's blows land colder on the sage company (combined margin)",
    (tc.darkRate - ts.darkRate) >= -0.02 && (ts.lightRate - tc.lightRate) + (tc.darkRate - ts.darkRate) >= 0.07,
    `darkDiff=${(tc.darkRate - ts.darkRate).toFixed(2)}`);
  sageR.st.ws.close(); sageR.c.ws.close(); ctrlR.st.ws.close(); ctrlR.c.ws.close();
}

console.log(`\ntest56: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
