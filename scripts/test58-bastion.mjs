// Station 4 — THE BASTION UI (Nigel, 2026-10-20): staging,
// the instance, the two roads home, reinforcements inside the
// band law, the hand of twenty with its reserve, and the
// Prepared Bastion's +3 AC measured against a no-bastion
// control at the referee's own dice.
//
//   §1 staging round-trips at the bastion (API)
//   §2 the two roads: a follower rides the clean road in the
//      Tender's company; a non-follower slow-marches the curse
//      at ×1.5 pace, the road's attrition real on the way
//   §3 the hand of twenty: cap, overflow in reserve, free
//      swaps, nothing stranded; the Table deals the hand only
//   §4 the instance: created from the staged company, entered
//      by key, the staged company dealt — and reinforcements
//      join only inside the band cap
//   §5 the Prepared Bastion: a bastion standing on the seed
//      before the column arrived lends +3 AC — proven by hit
//      rates over 200 dark blows a side against a control
//      whose seed stood bare (FATE: d20 + fateLevelBonus(1)=0
//      vs AC 8 → 13/20 = 0.65; AC 11 → 10/20 = 0.50)
//
// Run from the repo root:  node scripts/test58-bastion.mjs
import WebSocket from "ws";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

const DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-test58-"));
process.env.DATA_DIR = DATA_DIR;
process.env.PORT = "39158";
process.env.WORKSHOP_PASSWORD = "test58-workshop-pw";
process.env.TABLE_REQUIRE_BIND = "1";
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
const base = "http://127.0.0.1:39158";
const db = new Database(join(DATA_DIR, "app.db"));

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
const terr = async (token) => (await call("getTerritory", {}, token)).data;

async function claimTender(name, exp = 0) {
  const claim = await call("claimTender", { password: "test58-password", tenderName: name });
  const token = claim.data.token;
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.data.tender.code).id;
  const me = `tender:${tenderId}`;
  if (exp) db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(me, exp, Date.now());
  return { token, tenderId, me };
}
const seedTile = (me) => (q, r, cursed) => Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, ?, ?, ?, ?)").run(me, q, r, cursed ? 1 : 0, Date.now()).lastInsertRowid);
/** Seed one Awokin from pieces: [{category, element, power, toughness}]. */
function seedAwokin(me, pieces, identityKey = null, bonusPower = 0) {
  const now = Date.now();
  const refs = pieces.map((p, i) => {
    const a = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)")
      .run(`T58 ${p.category} ${Math.random().toString(36).slice(2, 8)}`, p.category, p.power, p.toughness, p.element, `test58/p${i}.png`, now).lastInsertRowid);
    return { source_id: `db:${a}`, name: `piece${i}`, category: p.category, rarity: "common", power: p.power, toughness: p.toughness, element: p.element };
  });
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at, identity_key, bonus_power) VALUES (?, ?, ?, ?, 'tender', 'T58', ?, ?, ?, ?)")
    .run("T58 Awokin", "T58 Awokin", "test58/a.png", JSON.stringify(refs), me, now, identityKey ?? "legacy", bonusPower).lastInsertRowid);
}
const rootling = (me, toughness = 8) => seedAwokin(me, [{ category: "body", element: "root", power: 1, toughness }]);
function seedPlacement(me, awakenedId, tileId, { follow = 0, hp = null } = {}) {
  db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, follow, hp) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(me, awakenedId, tileId, Date.now(), Date.now(), follow, hp);
}
/** A held seed with its bastion standing — the anchor. */
function seedHeldBastion(me, tileId, level = 1) {
  const b = Number(db.prepare("INSERT INTO territory_buildings (owner_key, tile_id, building_type, status, placed_at) VALUES (?, ?, 'bastion', 'standing', ?)").run(me, tileId, Date.now()).lastInsertRowid);
  const s = Number(db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at, bastion_building_id) VALUES (?, ?, ?, 'held', ?, ?)").run(me, tileId, level, Date.now(), b).lastInsertRowid);
  return { buildingId: b, seedId: s };
}
function giveEnergy(me, amount) {
  db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = excluded.energy").run(me, amount, Date.now());
}
/** Bind a claimed Tender to the Table (test54's door). The
 *  caller's claimTender exp must already reach Lv 3. */
async function bindTender({ token, tenderId, me }, tag) {
  await call("chooseClass", { classKey: "runewright" }, token);
  const { issueTableToken } = await import("../server/dist/table.js");
  const tt = issueTableToken({ id: `disc58-${tag}`, name: `T58-${tag}` });
  const code = (await call("getTableBindCode", {}, token)).data.code;
  const bindRes = await fetch(`${base}/api/table/bind`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: tt, code }),
  });
  if (!bindRes.ok) throw new Error(`table/bind -> ${bindRes.status}: ${JSON.stringify(await bindRes.json().catch(() => ({})))}`);
  return tt;
}

/* The raw Table client (test54's pattern). */
const meIn = (c) => c.state.players.find(p => p.key === c.you.key);
function client(label) {
  const ws = new WebSocket("ws://127.0.0.1:39158/table/ws");
  const c = { label, ws, state: null, you: null, errors: [], allStrikes: [], strikeIds: new Set() };
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "state") {
      c.state = m.state; c.you = m.you;
      for (const s of m.state.strikes ?? []) {
        if (!c.strikeIds.has(s.id)) { c.strikeIds.add(s.id); c.allStrikes.push(s); }
      }
    }
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

try {
  /* ============ §1 STAGING ROUND-TRIPS ============ */
  console.log("§1 staging at the bastion");
  {
    const t = await claimTender("Staging Tender");
    const me = t.me, tile = seedTile(me);
    const center = tile(0, 0, false);
    tile(1, 0, false); tile(0, 1, false);
    seedHeldBastion(me, center);
    const a1 = rootling(me), a2 = rootling(me), a3 = rootling(me);
    giveEnergy(me, 500);

    const view0 = (await call("getBastion", {}, t.token)).data;
    check("the bastion answers on its held seed", view0.bastion?.tileId === center, JSON.stringify(view0).slice(0, 160));
    check("nothing staged at first", view0.staged.length === 0);
    const st = await call("stageAwokin", { awakenedId: a1 }, t.token);
    check("staging from the hand answers", st.status === 200, JSON.stringify(st.data));
    const view1 = (await call("getBastion", {}, t.token)).data;
    check("the staged row stands, come by hand", view1.staged.length === 1 && view1.staged[0].awakenedId === a1 && view1.staged[0].via === "hand", JSON.stringify(view1.staged));
    const again = await call("stageAwokin", { awakenedId: a1 }, t.token, true);
    check("staging twice is refused, honestly", again.status === 400, JSON.stringify(again.data));
    // The fielding door is the wheel's cast now (2026-10-22):
    // a staged Awokin cannot be SUMMONED past the bastion.
    // (The class is written directly — the choosing door
    // wakes at Lv 3 and this tender is young; the stand
    // needs only the class's name.)
    db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at, class_key) VALUES (?, 0, 0, ?, 'warden') ON CONFLICT(owner_key) DO UPDATE SET class_key = 'warden'").run(me, Date.now());
    await call("addToParty", { awakenedId: a1 }, t.token);
    const depWhileStaged = await call("summonAwoken", { awakenedId: a1 }, t.token, true);
    check("a staged Awokin cannot be summoned past the bastion", depWhileStaged.status === 400 && /waits at the bastion/.test(depWhileStaged.data?.error ?? ""), JSON.stringify(depWhileStaged.data));
    const un = await call("unstageAwokin", { awakenedId: a1 }, t.token);
    check("unstaging answers", un.status === 200);
    const view2 = (await call("getBastion", {}, t.token)).data;
    check("the staged ranks empty again", view2.staged.length === 0);
    await call("stageAwokin", { awakenedId: a2 }, t.token);
    const mu = await call("unstageAwokin", { awakenedId: a2, toField: true }, t.token);
    check("mustering from the staged ranks answers", mu.status === 200 && mu.data.mustered === true, JSON.stringify(mu.data));
    const terrNow = await terr(t.token);
    const placed = (terrNow.placements ?? []).find(p => p.awakenedId === a2);
    check("the mustered Awokin stands on the bastion's hex", !!placed && placed.tileId === center, JSON.stringify(placed));
    const t2 = await claimTender("Bastionless Tender");
    seedTile(t2.me)(0, 0, false);
    const b2 = rootling(t2.me);
    const noB = await call("stageAwokin", { awakenedId: b2 }, t2.token, true);
    check("no bastion, no staging", noB.status === 400, JSON.stringify(noB.data));
    check("a3 was never touched by any of it", db.prepare("SELECT COUNT(*) AS n FROM bastion_staged WHERE awakened_id = ?").get(a3).n === 0);
  }

  /* ============ §2 THE TWO ROADS ============ */
  console.log("§2 the two roads home");
  {
    const t = await claimTender("Following Tender");
    const me = t.me, tile = seedTile(me);
    const bTile = tile(0, 0, false);
    const mid = tile(1, 0, false);
    const far = tile(2, 0, false);
    seedHeldBastion(me, bTile);
    const fol = rootling(me);
    seedPlacement(me, fol, far, { follow: 1 });
    const sent = await call("sendToBastion", { awakenedId: fol }, t.token);
    check("the follower is sent", sent.status === 200 && sent.data.following === true, JSON.stringify(sent.data));
    const prow = db.prepare("SELECT march_path, march_goal FROM field_placements WHERE awakened_id = ?").get(fol);
    const road = JSON.parse(prow.march_path);
    check("the follower rides the clean road to the bastion", JSON.stringify(road) === JSON.stringify([far, mid, bTile]) && prow.march_goal === "bastion", prow.march_path);
    db.prepare("UPDATE field_placements SET march_ends = ? WHERE awakened_id = ?").run(Date.now() - 1000, fol);
    await terr(t.token);
    const view = (await call("getBastion", {}, t.token)).data;
    check("the follower steps off the road into the staged ranks", view.staged.some(s => s.awakenedId === fol && s.via === "field"), JSON.stringify(view.staged));
    check("no placement remains for the follower", db.prepare("SELECT COUNT(*) AS n FROM field_placements WHERE awakened_id = ?").get(fol).n === 0);

    const t3 = await claimTender("Lone Road Tender");
    const me3 = t3.me, tile3 = seedTile(me3);
    const b3 = tile3(0, 0, false);
    const curseMid = tile3(1, 0, true);
    const curseHome = tile3(2, 0, true);
    seedHeldBastion(me3, b3);
    const lone = seedAwokin(me3, [{ category: "body", element: "root", power: 1, toughness: 100 }]);
    seedPlacement(me3, lone, curseHome, { follow: 0, hp: 100 });
    const sent3 = await call("sendToBastion", { awakenedId: lone }, t3.token);
    check("the non-follower is sent onto the lone road", sent3.status === 200 && sent3.data.following === false, JSON.stringify(sent3.data));
    const prow3 = db.prepare("SELECT march_path, march_goal, march_since, march_ends FROM field_placements WHERE awakened_id = ?").get(lone);
    const road3 = JSON.parse(prow3.march_path);
    check("the lone road ends at the bastion and crosses the curse", road3[road3.length - 1] === b3 && road3.includes(curseMid) && prow3.march_goal === "bastion", prow3.march_path);
    const steps = road3.length - 1;
    const paceMs = (prow3.march_ends - prow3.march_since) / steps;
    // The lone pace under the standing laws: root gait
    // 3.2s a hex, ×1.5 for the lone road, and — since
    // 2026-10-20 — a step INTO cursed ground counts twice
    // in the road's weighting: this road's two steps weigh
    // 2 + 1 = 3, so the hour is 3 × 3.2 × 1.5 = 14.4s,
    // 7.2s a step on average. (The assertion's old 4.8s
    // premise predates the cursed-step weighting.)
    check("the lone road walks slow — ×1.5 the clean pace, with the cursed step weighing double", Math.abs(paceMs - 7200) < 700, `pace ${paceMs}ms over ${steps} steps`);
    await terr(t3.token); // settles curse_since
    db.prepare("UPDATE field_placements SET curse_since = ? WHERE awakened_id = ?").run(Date.now() - 30000, lone);
    const terr3 = await terr(t3.token);
    const walker = (terr3.placements ?? []).find(p => p.awakenedId === lone);
    check("the curse bites the walker on the road", !!walker && walker.hp !== null && walker.hp < 100 && walker.hp >= 55, `hp=${walker?.hp}`);
    const t4 = await claimTender("Pure Stand Tender");
    const pureTile = seedTile(t4.me)(5, 5, false);
    const stander = seedAwokin(t4.me, [{ category: "body", element: "root", power: 1, toughness: 100 }]);
    seedPlacement(t4.me, stander, pureTile, { follow: 0, hp: 100 });
    await terr(t4.token);
    db.prepare("UPDATE field_placements SET curse_since = ? WHERE awakened_id = ?").run(Date.now() - 30000, stander);
    const terr4 = await terr(t4.token);
    const control = (terr4.placements ?? []).find(p => p.awakenedId === stander);
    check("the control on pure ground stands untouched", !!control && (control.hp === 100 || control.hp === null), `hp=${control?.hp}`);
    db.prepare("UPDATE field_placements SET march_ends = ? WHERE awakened_id = ?").run(Date.now() - 1000, lone);
    await terr(t3.token);
    const view3 = (await call("getBastion", {}, t3.token)).data;
    check("the lone walker stages on arrival, come by the march", view3.staged.some(s => s.awakenedId === lone && s.via === "march"), JSON.stringify(view3.staged));
  }

  /* ============ §3 THE HAND OF TWENTY ============ */
  console.log("§3 the hand of twenty and its reserve");
  {
    const t = await claimTender("Hand Tender", 3800);
    const me = t.me, tile = seedTile(me);
    const center = tile(0, 0, false);
    tile(1, 0, false);
    seedHeldBastion(me, center);
    giveEnergy(me, 900);
    const ids = [];
    for (let i = 0; i < 25; i++) ids.push(rootling(me));
    const view = (await call("getBastion", {}, t.token)).data;
    check("the first twenty by muster are the hand", JSON.stringify(view.hand.ids) === JSON.stringify(ids.slice(0, 20)), JSON.stringify(view.hand.ids));
    check("the overflow waits in reserve", JSON.stringify(view.reserveIds) === JSON.stringify(ids.slice(20)), JSON.stringify(view.reserveIds));
    const intoFull = await call("setHandMember", { awakenedId: ids[20], inHand: true }, t.token, true);
    check("a full hand refuses a twenty-first", intoFull.status === 400, JSON.stringify(intoFull.data));
    const stageReserve = await call("stageAwokin", { awakenedId: ids[21] }, t.token, true);
    check("the reserve cannot stage past the hand", stageReserve.status === 400);
    // The reserve bound the retired hand road; the wheel's
    // cast is gated by the PARTY (2026-10-22) — a reserve
    // Awokin stands outside it, and the cast refuses it.
    await call("chooseClass", { classKey: "warden" }, t.token);
    const depReserve = await call("summonAwoken", { awakenedId: ids[21] }, t.token, true);
    check("the reserve cannot be summoned — it stands outside the party", depReserve.status === 400 && /is not in your party/.test(depReserve.data?.error ?? ""), JSON.stringify(depReserve.data));
    const out = await call("setHandMember", { awakenedId: ids[0], inHand: false }, t.token);
    check("a hand member steps down to reserve, freely", out.status === 200, JSON.stringify(out.data));
    const into = await call("setHandMember", { awakenedId: ids[20], inHand: true }, t.token);
    check("a reserve Awokin rises into the hand, freely", into.status === 200, JSON.stringify(into.data));
    const view2 = (await call("getBastion", {}, t.token)).data;
    check("the swap held: #21 in, #1 in reserve", view2.hand.ids.includes(ids[20]) && !view2.hand.ids.includes(ids[0]) && view2.reserveIds.includes(ids[0]));
    const union = new Set([...view2.hand.ids, ...view2.reserveIds, ...view2.staged.map(s => s.awakenedId), ...view2.field.map(f => f.awakenedId)]);
    check("no Awokin is stranded — the deck's union is the whole roster", ids.every(id => union.has(id)) && union.size === 25, `union ${union.size}`);
    // The risen member takes the field BY THE CAST
    // (2026-10-22): it joins the party, and the wheel's cast
    // fields it at the Tender's side — the hand road is gone.
    await call("addToParty", { awakenedId: ids[20] }, t.token);
    let dep = null;
    for (let i = 0; i < 12 && !dep?.data?.summoned; i++) dep = await call("summonAwoken", { awakenedId: ids[20] }, t.token);
    check("the risen reserve member takes the field by the cast", !!dep?.data?.summoned, JSON.stringify(dep?.data));
    const tt = await bindTender(t, "hand");
    const c = client("hand");
    await c.join({ authToken: tt, room: "hand-58" });
    // THE WHEEL LAW RETIRED THE DEALT HAND (2026-10-21):
    // the seat's payload carries no `hand` any more — its
    // company is the party, and the homeland's hand of
    // twenty never crosses to the Table. The tail's law
    // survives in the company's shape: the fielded member
    // (#21, fielded by the cast above) stands in the field,
    // not the company — and no reserve Awokin is callable.
    await c.waitFor(cc => !!cc.you && Array.isArray(cc.you.company), "the seat stands with its company");
    const dealt = (c.you.company ?? []).map(card => card.awokenId);
    check("the Table's company holds neither the fielded member nor any of the hand — the party alone is dealt", !dealt.includes(ids[20]) && !dealt.some(id => view2.hand.ids.includes(id)), `company ${JSON.stringify(dealt)}`);
    check("no reserve Awokin is dealt at the Table", !dealt.includes(ids[0]) && !dealt.some(id => view2.reserveIds.includes(id)));
    c.ws.close();
  }

  /* ============ §4 THE INSTANCE + REINFORCEMENTS ============ */
  console.log("§4 the instance, and reinforcements inside the band");
  {
    const t = await claimTender("Instance Tender", 150); // Lv 3 to pass the class gate; stood down to Lv 2 below
    const me = t.me, tile = seedTile(me);
    const center = tile(0, 0, false);
    seedHeldBastion(me, center);
    const company = [];
    for (let i = 0; i < 5; i++) company.push(rootling(me));
    const spare = rootling(me);
    const noCompany = await call("createBastionInstance", {}, t.token, true);
    check("an instance with no company staged is refused", noCompany.status === 400, JSON.stringify(noCompany.data));
    for (const id of company) await call("stageAwokin", { awakenedId: id }, t.token);
    const made = await call("createBastionInstance", {}, t.token);
    check("the instance is created from the staged company", made.status === 200 && made.data.call.kind === "instance" && !!made.data.call.join_key, JSON.stringify(made.data).slice(0, 200));
    const made2 = await call("createBastionInstance", {}, t.token);
    check("creating it twice answers the same doorway", made2.status === 200 && made2.data.call.id === made.data.call.id && made2.data.already === true);
    const callId = made.data.call.id, joinKey = made.data.call.join_key;
    const tt = await bindTender(t, "instance");
    // The class was chosen at Lv 3 (the gate's price); the
    // seat is then stood down to Lv 2, whose band cap (3) binds
    // BEFORE the per-tile cap (4) can speak — so the refusal
    // measured below is the band law's own.
    db.prepare("UPDATE tender_progress SET total_exp = 50 WHERE owner_key = ?").run(me);

    // The wheel law's shape (2026-10-21, carried 2026-10-22):
    // no hand is dealt — the instance seat's COMPANY is the
    // staged company alone (companyForTender, stagedOnly),
    // and its members are called by the summon CAST, which
    // names no hex: the referee lands them at the Tender's
    // side. The spare joins the party, so the lobby read
    // below can prove the two companies apart.
    await call("addToParty", { awakenedId: spare }, t.token);
    const c = client("instance");
    await c.join({ authToken: tt, callKey: joinKey });
    await c.waitFor(cc => !!cc.you?.company, "the staged company is dealt");
    const dealtIds = (c.you.company ?? []).map(card => card.awokenId);
    check("entering by key deals the staged company alone", JSON.stringify([...dealtIds].sort((a, b) => a - b)) === JSON.stringify([...company].sort((a, b) => a - b)), `dealt ${JSON.stringify(dealtIds)}`);
    check("the unstaged spare is not carried", !dealtIds.includes(spare));
    await c.waitFor(cc => !!meIn(cc)?.hex, "the tender stands");
    let summoned = 0;
    for (const id of company) {
      const card = c.you.company.find(x => x.awokenId === id);
      // The cast can falter — pick again; the band's cap,
      // not the dice, is what this section measures, and it
      // refuses before any roll.
      for (let i = 0; i < 10; i++) {
        c.send({ type: "summonCast", cardId: card.id });
        await sleep(350);
        const n = (c.state.field ?? []).filter(u => u.ownerKey === c.you.key).length;
        if (n > summoned) { summoned = n; break; }
        if (c.errors.some(e => /band stands full/.test(e))) break;
      }
    }
    check("three of the company stand — the band's cap at Lv 2", summoned === 3, `stood ${summoned}`);
    check("the fourth reinforcement is refused at the band cap", c.errors.some(e => /band stands full/.test(e)), JSON.stringify(c.errors.slice(-3)));
    const fieldedIds = (c.state.field ?? []).filter(u => u.ownerKey === c.you.key).map(u => u.awokenId);
    c.ws.close();

    const c2 = client("instance-claim");
    await c2.join({ authToken: tt, room: "lobby-58" });
    await c2.waitFor(cc => !!cc.you?.company, "the common company stands");
    const lobbyIds = (c2.you.company ?? []).map(card => card.awokenId);
    check("a common room deals the common company (the party's spare, not the staged)", lobbyIds.includes(spare) && !lobbyIds.some(id => company.includes(id)), `lobby ${JSON.stringify(lobbyIds)}`);
    c2.send({ type: "switchRoom", callKey: joinKey });
    await sleep(700);
    check("the switch lands in the call's room", c2.state?.room === `call-${joinKey.toLowerCase()}`, c2.state?.room);
    c2.send({ type: "claimBastion", callId });
    await sleep(700);
    const claimedIds = (c2.you?.company ?? []).map(card => card.awokenId);
    // The re-dealt company is the staged company MINUS
    // those already standing in the instance's field —
    // the company never lists the fielded, on any ground.
    const unfielded = company.filter(id => !fieldedIds.includes(id));
    check("claiming the instance re-deals the company to the staged company (minus the fielded)", JSON.stringify([...claimedIds].sort((a, b) => a - b)) === JSON.stringify([...unfielded].sort((a, b) => a - b)), `claimed ${JSON.stringify(claimedIds)} fielded ${JSON.stringify(fieldedIds)}`);
    c2.ws.close();
  }

  /* ============ §5 THE PREPARED BASTION ============ */
  // CONVERSION PENDING (noted 2026-10-22, the summoning-fix
  // build): this section's Table flow still speaks the
  // RETIRED hand dialect — it waits for `you.hand` and sends
  // the retired `summon` message, both struck by the wheel
  // law (2026-10-21), a build before this one; §1–§4 were
  // carried onto the company + summonCast in the fix build,
  // but §5's victims rotate through the dealt hand faster
  // than the party band (5 at Lv 10) holds, so its faithful
  // conversion is a rotation design of its own, not a
  // rename. The +3 AC law it measures is untouched; the
  // section errors at its first hand wait until converted.
  console.log("§5 the Prepared Bastion — +3 AC at the dice");
  {
    // The victim: a single SKY aspect (toughness 8) and
    // nothing else, under a UNIQUE seeded identity_key — so
    // the payload's empowerment law (identical shapes
    // empower each other, +(family−1)) never moves the armor
    // under measurement. A part-less card strikes by the
    // referee's fallback (its element die + its whole power):
    // the victim is seeded at bonus_power −4, so its blows
    // roll d4−4 and can never wound — the dark are never
    // thinned, one battle carries the whole count, and what
    // is measured is purely the referee's d20 against the
    // armor, identical rigging on both sides. The column is
    // 11: the largest with no Hollow (a Hollow drains the
    // pool that re-posting summons draw on).
    const TARGET = 200;
    const measureSide = async (label, preparedSide) => {
      const t = await claimTender(`AC ${label} Tender`, 3800);
      const me = t.me, tile = seedTile(me);
      const center = tile(0, 0, false);
      tile(1, 0, false); tile(-1, 0, false); tile(0, 1, false); tile(0, -1, false);
      if (preparedSide) seedHeldBastion(me, center);
      else db.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at) VALUES (?, ?, 1, 'fallen', ?)").run(me, center, Date.now());
      const victims = [];
      for (let i = 0; i < 8; i++) victims.push(seedAwokin(me, [
        { category: "aspect", element: "sky", power: 0, toughness: 8 },
      ], `t58-victim-${label}-${i}`, -4));
      seedAwokin(me, [{ category: "body", element: "root", power: 1, toughness: 2 }]); // a spare, so the hand is a hand
      // Ballast: power-5 Awokin who never field. A roster of
      // −4-power victims funds a purse of ~✦10, and marches
      // (✦3) and heals (✦2) bankrupt it mid-battle — the
      // ballast lifts maxEnergy so the seat can pay its way
      // through the whole count.
      for (let i = 0; i < 10; i++) seedAwokin(me, [{ category: "body", element: "stone", power: 7, toughness: 2 }]);
      const tt = await bindTender(t, `ac-${label}`);
      let blows = 0, hits = 0, battles = 0, checkedCards = false;
      const deadline = Date.now() + 600000;
      while (blows < TARGET && battles < 4 && Date.now() < deadline) {
        battles++;
        const now = Date.now();
        const col = db.prepare(
          "INSERT INTO incursion_columns (owner_key, target_tile_id, target_kind, kind, size, power, state, origin_q, origin_r, spawned_at, arrives_at) VALUES (?, ?, 'seed', 'raid', 11, 1, 'marching', 6, 0, ?, ?) RETURNING id"
        ).get(me, center, now - 60000, now - 1000);
        await call("getIncursions", {}, t.token); // the column arrives; a bare seed corrupts
        const made = await call("callToArms", { columnId: Number(col.id) }, t.token);
        const c = client(`ac-${label}-${battles}`);
        await c.join({ authToken: tt, callKey: made.data.call.join_key });
        await c.waitFor(cc => !!cc.you?.hand, "the hand is dealt");
        c.send({ type: "claimBastion", callId: made.data.call.id });
        await sleep(800);
        if (battles === 1) {
          const bast = c.state?.bastion;
          check(`${label}: the claim reads prepared=${preparedSide}`, !!bast && bast.prepared === preparedSide, JSON.stringify(bast));
          const victimCard = c.you.hand.find(x => victims.includes(x.awokenId));
          check(`${label}: the victim card deals at toughness 8`, !!victimCard && victimCard.toughness === 8, JSON.stringify(victimCard && { t: victimCard.toughness, p: victimCard.power }));
          checkedCards = true;
        }
        await c.waitFor(cc => !!meIn(cc)?.hex, "the tender stands");
        const standHex = meIn(c).hex;
        const myUnits = () => (c.state.field ?? []).filter(u => u.ownerKey === c.you.key);
        const gateUnit = () => myUnits().find(u => u.hex === "1,0");
        const guardUnit = () => myUnits().find(u => u.hex === standHex);
        const handCard = () => c.you.hand.find(x => victims.includes(x.awokenId));
        // A camp guard stands at the landing beside the
        // Tender: if the gate victim falls and NO light stands
        // anywhere, the horde steers to the bare Tender and
        // the battle is lost in seconds (probe58c).
        const postGuard = async () => {
          if (guardUnit()) return true;
          const card = handCard();
          if (!card) return false;
          c.send({ type: "summon", hex: standHex, cardId: card.id });
          await sleep(350);
          return !!guardUnit();
        };
        const gateUnits = () => myUnits().filter(u => u.hex === "1,0");
        const postVictim = async () => {
          // TWO victims share the gate hex: when one falls the
          // other soaks at the same center, so the count never
          // waits on a re-post march.
          if (gateUnits().length >= 2) return true;
          const card = handCard();
          if (!card) return gateUnits().length > 0;
          c.send({ type: "summon", hex: standHex, cardId: card.id });
          await sleep(350);
          const u0 = myUnits().find(u => u.hex === standHex && u.cardId !== guardUnit()?.cardId) ?? myUnits().find(u => u.hex === standHex);
          if (!u0) return gateUnits().length > 0;
          if (u0.hex === "1,0") return true;
          c.send({ type: "march", cardId: u0.cardId, from: u0.hex, to: "1,0" });
          for (let i = 0; i < 40; i++) {
            const u = gateUnits().find(x => x.cardId === u0.cardId);
            if (u && !u.moving) return true;
            await sleep(200);
          }
          return gateUnits().length > 0;
        };
        await postGuard();
        const posted = await postVictim() && await postVictim();
        if (battles === 1) check(`${label}: the victims are posted at the gate`, posted, JSON.stringify(c.errors.slice(-3)));
        c.send({ type: "startBastion" });
        await sleep(600);
        const counted = new Set();
        const battleDeadline = Date.now() + 330000;
        let lastLog = Date.now();
        let lastHeal = 0;
        while (Date.now() < battleDeadline) {
          if (Date.now() - lastLog > 45000) { lastLog = Date.now(); console.log(`  …${label} battle ${battles}: ${blows} blows | dark ${(c.state?.dark ?? []).length} | units [${myUnits().map(u => `${u.hex}${u.moving ? "~" : ""} hp${Math.round(u.hp)} sh${Math.round(u.shield)}`).join(" | ")}] | hand ${(c.you.hand ?? []).length} | tender ${c.you.tenderHp} | err ${JSON.stringify(c.errors.slice(-2))}`); }
          if (c.state?.bastion?.resolved) break;
          if (!guardUnit()) await postGuard();
          if (gateUnits().length < 2) await postVictim();
          const vu = gateUnit();
          const gd = guardUnit();
          // Mending is a last resort, not a drip: a ✦2 cast
          // buys ~10 soak while a fresh re-post buys ~28 for a
          // ✦3 march — so Heal fires only at death's door, at
          // most one cast every few seconds. (An earlier draft
          // healed at <12 and bankrupted the purse mid-count.)
          if (Date.now() - lastHeal > 4000) {
            const weakGate = gateUnits().sort((a, b) => (a.hp + a.shield) - (b.hp + b.shield))[0];
            if (weakGate && weakGate.hp + weakGate.shield < 6) { c.send({ type: "castHeal", hex: weakGate.hex }); lastHeal = Date.now(); }
            else if (gd && gd.hp + gd.shield < 6) { c.send({ type: "castHeal", hex: gd.hex }); lastHeal = Date.now(); }
          }
          // The count pools every posted victim: the dark
          // besiege the NEAREST light, so the landing guard
          // and the gate pair draw different arcs of the same
          // host — every victim wears the same AC 8 before the
          // same referee, and a blow against any of them is a
          // blow against the armor under measurement.
          const posts = myUnits();
          if (posts.length) {
            for (const s of c.allStrikes) {
              if (s.side !== "dark" || counted.has(s.id)) continue;
              if (posts.some(u => Math.abs(s.to.x - u.pos.x) <= 2 && Math.abs(s.to.y - u.pos.y) <= 2)) {
                counted.add(s.id); blows++;
                if (s.hit) hits++;
              }
            }
          }
          if (blows >= TARGET) break;
          await sleep(250);
        }
        c.ws.close();
        await sleep(300);
      }
      if (!checkedCards) check(`${label}: the side measured at all`, false, "no battle ran");
      return { blows, hits, battles };
    };
    const control = await measureSide("control", false);
    console.log(`  control: ${control.hits}/${control.blows} blows landed (${(control.hits / Math.max(1, control.blows)).toFixed(3)}) over ${control.battles} battles`);
    const prepared = await measureSide("prepared", true);
    console.log(`  prepared: ${prepared.hits}/${prepared.blows} blows landed (${(prepared.hits / Math.max(1, prepared.blows)).toFixed(3)}) over ${prepared.battles} battles`);
    const band = (n, p, label, got) => {
      const sigma = Math.sqrt(p * (1 - p) / Math.max(1, n));
      const frac = got / Math.max(1, n);
      check(`${label}: hit rate within 3.2σ of FATE's ${p}`, n >= 150 && Math.abs(frac - p) <= 3.2 * sigma, `frac ${frac.toFixed(3)} σ ${sigma.toFixed(3)} n ${n}`);
    };
    band(control.blows, 0.65, "control (AC 8, bare seed)", control.hits);
    band(prepared.blows, 0.50, "prepared (AC 8+3, bastion standing)", prepared.hits);
    const gap = control.hits / Math.max(1, control.blows) - prepared.hits / Math.max(1, prepared.blows);
    check("the walls show in the differential (≥ 0.08 fewer hits land)", gap >= 0.08, `gap ${gap.toFixed(3)}`);
  }

  console.log(`\nTEST58: ${pass} passed, ${fail} failed`);
} catch (err) {
  fail++;
  console.log("TEST58 ERRORED:", err?.message ?? err);
}
console.log(fail === 0 ? "TEST58 PASSED" : "TEST58 FAILED");
process.exit(fail ? 1 : 0);
