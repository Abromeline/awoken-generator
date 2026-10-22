// THE HOMELAND WEAPON REFEREE (Nigel, 2026-10-20): at the
// Table his runic weapon hunted on its own; on the homeland it
// floated at his shoulder and never struck — the defect Nigel
// met in his own play ("the weapon is on screen but not
// attacking enemies"). Now the homeland keeps the same
// referee, settled on the homeland's own rhythm: while he
// stands — classed, armed, not fallen — the weapon strikes
// the nearest Blind Fray within its reach of his stand, on the
// Table's cadence, die, armor and mitigation, and the Fray
// carries a wound track (hp 3, the Table's own body) so blows
// land, deepen, and fell. The map serves the wanderers'
// wounds and the last strike's record; the client lunges only
// where the server struck. (test60)
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-homeland-weapon-"));
process.env.PORT = "39960";
process.env.WORKSHOP_PASSWORD = "test60-workshop-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
await import("../server/dist/index.js");
await new Promise(r => setTimeout(r, 2500));
const base = "http://127.0.0.1:39960";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) { pass++; console.log("  ok -", name); } else { fail++; console.log("  FAIL -", name, extra); } };
async function call(action, args, token, expectFail = false) {
  const res = await fetch(`${base}/api/${action}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) }, body: JSON.stringify(args) });
  const data = await res.json().catch(() => ({}));
  if (!expectFail && !res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return { status: res.status, data };
}
const db = new Database(join(process.env.DATA_DIR, "app.db"));
// HARNESS NOTE (the migration-order defect, found 2026-10-20
// and carried by the Audit — NOT fixed in the server): on a
// FRESH database the server's greeter ALTER runs before the
// awakened table is created, so the column never lands and
// every full awakened select throws (getTerritory 500s —
// this suite died on it at §1 until the workaround below
// was carried over from test56's harness, 2026-10-22).
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }
const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
async function claimTender(name, exp = 0) {
  const claim = await call("claimTender", { password: "homeland-weapon-password", tenderName: name });
  const token = claim.data.token;
  const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.data.tender.code).id}`;
  if (exp) db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(me, exp, Date.now());
  return { token, me };
}
const seedTile = (me) => (q, r, cursed) => Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, ?, ?, ?, ?)").run(me, q, r, cursed, Date.now()).lastInsertRowid);
const seedWanderer = (me, tileId, hp = null) => Number(db.prepare("INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp) VALUES (?, ?, 'fray', ?, ?)").run(me, tileId, Date.now(), hp).lastInsertRowid);
const terr = async (token) => (await call("getTerritory", {}, token)).data;
const wandererRow = (id) => db.prepare("SELECT id, tile_id AS tileId, hp FROM homeland_wanderers WHERE id = ?").get(id);
const progressRow = (me) => db.prepare("SELECT weapon_next_at AS nextAt, weapon_strike AS strike, down_until AS downUntil FROM tender_progress WHERE owner_key = ?").get(me);
/** Keep a Tender standing through a proof's reads: his body
 *  topped, no blackout, and the wanderers' walk watermark
 *  re-armed so no step of theirs moves a fixture mid-proof
 *  (the border Fray chew at 5% a step is real law — this
 *  helper only keeps it from eating the measuring field). */
const keepStanding = (me, maxHp) => db.prepare("UPDATE tender_progress SET hp = ?, down_until = NULL, wanderer_watermark = NULL WHERE owner_key = ?").run(maxHp, me);
const forceWeaponDue = (me) => db.prepare("UPDATE tender_progress SET weapon_next_at = ? WHERE owner_key = ?").run(Date.now() - 1, me);

/* ── §0 THE MIRRORED LAW, READ DIRECTLY: the homeland's
      numbers are the Table's own, cell for cell — and the
      Sage's +2 stands at this ground's roll site exactly as
      at the Table's (proven by the reckoning itself, as
      test56's castModFor table proved the casting pip: not
      by dice weather). */
{
  const A = await import("../server/dist/actions.js");
  const T = await import("../server/dist/table.js");
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  ok("mirror: the weapon dice are the Table's", eq(A.HOMELAND_WEAPON_DIE, T.WEAPON_DIE), JSON.stringify(A.HOMELAND_WEAPON_DIE));
  ok("mirror: the base reaches are the Table's", eq(A.HOMELAND_WEAPON_RANGE_HEX, T.WEAPON_RANGE_HEX));
  ok("mirror: the cadences are the Table's", eq(A.HOMELAND_WEAPON_COOLDOWN_MS, T.WEAPON_COOLDOWN_MS));
  ok("mirror: the element reaches are the Table's", eq(A.HOMELAND_ELEMENT_REACH, T.ELEMENT_REACH));
  ok("mirror: the Fray's body is the Table's (hp 3, AC 11 — base 10 + the +1 bonus)", A.HOMELAND_FRAY_HP === T.ENEMY_STATS.fray.hp && A.HOMELAND_FRAY_ARMOR === T.DARK_ARMOR.fray);
  let bonusOk = true;
  for (const cls of ["warden", "runewright", "binder", "witch", "sage"]) {
    for (const lv of [1, 2, 3, 6, 9, 10]) {
      const want = Math.floor(Math.max(1, lv) / 3) + (cls === "sage" ? 2 : 0);
      if (A.homelandWeaponBonusFor(cls, lv) !== want) bonusOk = false;
    }
  }
  ok("the bonus table reads whole: Fate's level step for every class, the Sage +2 on top at every level", bonusOk);
  ok("the Sage's hand at Lv 1: +2 where every other class reads +0 (Nigel, 2026-10-20)",
    A.homelandWeaponBonusFor("sage", 1) === 2 && A.homelandWeaponBonusFor("warden", 1) === 0);
  ok("the Sage's hand at Lv 6: +4 against the field's +2",
    A.homelandWeaponBonusFor("sage", 6) === 4 && A.homelandWeaponBonusFor("witch", 6) === 2);
  let rangeOk = true;
  for (const wk of ["swordshield", "sword", "spear", "arrow"]) {
    if (A.homelandWeaponRangeFor(wk, null, 0, false) !== T.WEAPON_RANGE_HEX[wk]) rangeOk = false;
    if (A.homelandWeaponRangeFor(wk, "sky", 0, false) !== T.WEAPON_RANGE_HEX[wk]) rangeOk = false; // an element named but unpoured changes nothing
    for (const el of ["stone", "root", "fire", "tide", "sky"]) {
      if (A.homelandWeaponRangeFor(wk, el, 1, false) !== T.ELEMENT_REACH[el]) rangeOk = false;
    }
  }
  ok("the reach table reads whole: base by weapon, the element's reach once attuned (depth ≥ 1)", rangeOk);
  ok("LONGSHAFT: the spear's Signature adds a hex on either road (3 bare, 5 sky-attuned)",
    A.homelandWeaponRangeFor("spear", null, 0, true) === 3 && A.homelandWeaponRangeFor("spear", "sky", 1, true) === 5);
}

/* ── §1 FIRST BLOOD: a wanderer in reach is struck on the
      settle; its wounds are served with the map; a felled
      wanderer is removed. The target wears a deepened wound
      track (hp 100 by fixture) so the wound itself — not just
      the felling — is measurable exactly. */
{
  const { token, me } = await claimTender("First Blood Tender", 200); // Lv 3
  const tile = seedTile(me);
  const heart = tile(0, 0, 0);
  const dark = tile(1, 0, 1);
  tile(1, -1, 1); tile(0, -1, 1); tile(-1, 0, 1); tile(-1, 1, 1); tile(0, 1, 1);
  await call("chooseClass", { classKey: "warden" }, token);
  await call("chooseWeapon", { weaponKey: "sword" }, token);
  const wid = seedWanderer(me, dark, 100);
  const before = Date.now();
  const t = await terr(token);
  const after = Date.now();
  const rec = t.weaponStrike;
  ok("first blood: the map serves a strike", !!rec, JSON.stringify(t.weaponStrike));
  ok("first blood: the strike names his sword, the wanderer, and its hex",
    !!rec && rec.weaponKey === "sword" && rec.wandererId === wid && rec.tileId === dark, JSON.stringify(rec));
  ok("first blood: the strike's hour is this settle's", !!rec && rec.at >= before - 5000 && rec.at <= after + 5000, rec && `at=${rec.at}`);
  const served = (t.wanderers ?? []).find(w => w.id === wid);
  ok("first blood: the wanderer is served with its wound track (hp, and the lawful measure maxHp 3 — the fixture deepened only the hp)",
    !!served && served.maxHp === 3, JSON.stringify(served));
  ok("first blood: served wounds agree with the strike to the point",
    !!served && !!rec && served.hp === 100 - (rec.hit ? rec.dmg : 0), `served=${served && served.hp} rec=${JSON.stringify(rec)}`);
  ok("first blood: the ledger agrees with the map", !!rec && (wandererRow(wid)?.hp ?? 100) === 100 - (rec.hit ? rec.dmg : 0));
  // The die is fed by the WEAPON's own level (a fresh sword:
  // Lv 1, so raw d10 alone); the Tender's level feeds the
  // attack bonus and mitigation's attacker level, never the
  // die. (Re-derived 2026-10-20 in the homeland-casting pass:
  // the earlier bound "d10 + 2 levels" misread which level
  // feeds the die, and a d10 roll of 1 — honest weather, one
  // run in ten — mitigates to exactly 1 under the true law.)
  if (rec?.hit) ok("first blood: a fresh sword's harm is die-bounded (raw d10, mitigation only shaves, a landed blow always ≥ 1)", rec.dmg >= 1 && rec.dmg <= 10, `dmg=${rec.dmg}`);
  // The felling: restore the Fray's lawful body and let the
  // cadence finish it. Under Enemy AC (2026-10-22) the Lv 3
  // Warden's +1 needs 10+ against AC 11 — 55% a settle —
  // and the wounds accumulate in the ledger between hits,
  // so the wait is for a couple of honest hits, not for
  // one: the loop runs 16 deep (no-fell weather < 0.1%).
  db.prepare("UPDATE homeland_wanderers SET hp = 3 WHERE id = ?").run(wid);
  let felledRec = null;
  for (let i = 0; i < 16 && !felledRec; i++) {
    keepStanding(me, 35);
    forceWeaponDue(me);
    const tt = await terr(token);
    if (tt.weaponStrike?.felled && tt.weaponStrike.wandererId === wid) felledRec = tt.weaponStrike;
  }
  ok("the felling: a wanderer at its lawful 3 falls to the weapon and its record says so", !!felledRec, JSON.stringify(felledRec));
  ok("the felling: the felled wanderer is removed — gone from the ledger and the map",
    !wandererRow(wid) && !(await terr(token)).wanderers.some(w => w.id === wid));
}

/* ── §2 THE CADENCE: the Table's 1100 ms sword-clock, kept
      exactly — a strike writes the next hour to the
      millisecond; with live prey in reach and the hour not
      yet come, the map stays silent; and a window's strikes
      never outrun the cadence that paces them. */
{
  const { token, me } = await claimTender("Cadence Tender", 200); // Lv 3
  const tile = seedTile(me);
  tile(0, 0, 0);
  const ring = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([q, r]) => tile(q, r, 1));
  await call("chooseClass", { classKey: "warden" }, token);
  await call("chooseWeapon", { weaponKey: "sword" }, token);
  const ids = ring.map(tid => seedWanderer(me, tid, 3));
  const tA = await terr(token);
  const a1 = tA.weaponStrike?.at;
  ok("cadence: the first read strikes once, at the arming hour", !!tA.weaponStrike && typeof a1 === "number", JSON.stringify(tA.weaponStrike));
  ok("cadence: the next hour is written exactly one cooldown on (1100 ms, the sword's)",
    progressRow(me)?.nextAt === (a1 ?? 0) + 1100, `nextAt=${progressRow(me)?.nextAt} at=${a1}`);
  const hpAfterA = db.prepare("SELECT COALESCE(SUM(hp), 0) AS s FROM homeland_wanderers WHERE owner_key = ?").get(me).s;
  const countAfterA = db.prepare("SELECT COUNT(*) AS n FROM homeland_wanderers WHERE owner_key = ?").get(me).n;
  ok("cadence: that one blow is the only wound on the field (a hit fells at this measure — the field loses the Fray's whole 3 — or one clean miss)",
    (6 * 3 - hpAfterA) === (tA.weaponStrike?.hit ? 3 : 0) && countAfterA === 6 - (tA.weaponStrike?.hit ? 1 : 0) && tA.weaponStrike?.felled === !!tA.weaponStrike?.hit,
    `hpSum=${hpAfterA} n=${countAfterA} rec=${JSON.stringify(tA.weaponStrike)}`);
  // Normalize a fresh field, then hold the clock an hour ahead:
  // prey in reach, hour not come — silence, exactly.
  db.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(me);
  db.prepare("UPDATE tender_progress SET wanderer_anchor_at = ?, wanderer_settled_beats = 0 WHERE owner_key = ?").run(Date.now(), me);
  const ids2 = ring.map(tid => seedWanderer(me, tid, 3));
  keepStanding(me, 35);
  db.prepare("UPDATE tender_progress SET weapon_next_at = ? WHERE owner_key = ?").run(Date.now() + 60000, me);
  const tB = await terr(token);
  ok("cadence: with prey in reach and the hour held ahead, no strike — the record stands at the first blow",
    tB.weaponStrike?.at === a1 && db.prepare("SELECT COALESCE(SUM(hp), 0) AS s FROM homeland_wanderers WHERE owner_key = ?").get(me).s === 18,
    `at=${tB.weaponStrike?.at} a1=${a1}`);
  // The window: open the clock ~43 s into arrears. The strikes
  // that fall due proceed one per cooldown — at AC 11 the
  // Lv 3 sword lands 55% of them and the wounds accumulate
  // on the nearest Fray first, so the window's ~39 strikes
  // (were they all to run, ~21 hits and harm far past the
  // field's 18) empty the field of six with room to spare,
  // and the last strike's hour sits exactly on the cadence
  // grid. (The window was ~20 s under the old armor-as-target
  // law, when 90% landed.)
  const S = (a1 ?? 0) + 1100 - 42900;
  keepStanding(me, 35);
  db.prepare("UPDATE tender_progress SET weapon_next_at = ? WHERE owner_key = ?").run(S, me);
  const tC = await terr(token);
  const recC = tC.weaponStrike;
  const fired = recC ? (recC.at - S) / 1100 + 1 : 0;
  ok("cadence: the arrears window empties the field — every Fray felled by the weapon",
    db.prepare("SELECT COUNT(*) AS n FROM homeland_wanderers WHERE owner_key = ?").get(me).n === 0,
    `n=${db.prepare("SELECT COUNT(*) AS n FROM homeland_wanderers WHERE owner_key = ?").get(me).n}`);
  ok("cadence: the last strike's hour lies exactly on the 1100 ms grid, and the count respects it (≥ 6 blows for six fellings, never faster than the clock)",
    !!recC && (recC.at - S) % 1100 === 0 && fired >= 6 && fired <= 40, `at=${recC?.at} S=${S} fired=${fired}`);
  const tD = await terr(token);
  ok("cadence: with the field empty the clock re-arms — no phantom strikes", tD.weaponStrike?.at === recC?.at);
  void ids; void ids2;
}

/* ── §3 BEYOND REACH IS UNTOUCHED: the sword's single hex is
      a hard border — the Fray one hex past it is never struck,
      never wounded, never named. */
{
  const { token, me } = await claimTender("Border Tender", 200);
  const tile = seedTile(me);
  tile(0, 0, 0);
  const near = tile(1, 0, 1);
  const far = tile(2, 0, 1);
  await call("chooseClass", { classKey: "warden" }, token);
  await call("chooseWeapon", { weaponKey: "sword" }, token);
  const aId = seedWanderer(me, near, 100);
  const bId = seedWanderer(me, far, 100);
  let farEverNamed = false, nearStruck = false;
  // 16 settles: at AC 11 the sword lands 55% a settle, so
  // the wait for one landed blow is near-certain this deep
  // (under the old law's 90% it took a handful).
  for (let i = 0; i < 16; i++) {
    keepStanding(me, 35);
    forceWeaponDue(me);
    const t = await terr(token);
    if (t.weaponStrike?.tileId === far) farEverNamed = true;
    if (t.weaponStrike?.wandererId === aId && t.weaponStrike?.hit) nearStruck = true;
  }
  ok("reach: the Fray inside the sword's hex was struck (its wounds are real)", nearStruck && (wandererRow(aId)?.hp ?? 100) < 100, `hp=${wandererRow(aId)?.hp}`);
  ok("reach: the Fray one hex beyond was never struck, never wounded, never named",
    !farEverNamed && wandererRow(bId)?.hp === 100, `hp=${wandererRow(bId)?.hp} named=${farEverNamed}`);
}

/* ── §4 SILENCE: weaponless, classless, and fallen Tenders'
      maps stay silent — no strike, no wound, no record. */
{
  // (a) classed but weaponless
  const a = await claimTender("Weaponless Tender", 200);
  const tileA = seedTile(a.me);
  tileA(0, 0, 0);
  const darkA = tileA(1, 0, 1);
  await call("chooseClass", { classKey: "warden" }, a.token);
  const wa = seedWanderer(a.me, darkA, 100);
  const ta = await terr(a.token);
  ok("silence: the weaponless Tender stands (classed) with no weapon in hand", !!ta.tender && !ta.tender.weaponKey, JSON.stringify(ta.tender));
  ok("silence: no strike is served, and the Fray beside him is unwounded",
    !ta.weaponStrike && wandererRow(wa)?.hp === 100 && !progressRow(a.me)?.strike);
  // (b) classless: no stand at all
  const b = await claimTender("Classless Tender", 0);
  const tileB = seedTile(b.me);
  tileB(0, 0, 0);
  const darkB = tileB(1, 0, 1);
  const wb = seedWanderer(b.me, darkB, 100);
  const tb = await terr(b.token);
  ok("silence: the classless Tender has no stand, no served wanderers, no strike",
    !tb.tender && (tb.wanderers ?? []).length === 0 && !tb.weaponStrike, `tender=${JSON.stringify(tb.tender)}`);
  ok("silence: the classless map leaves its dark untouched", wandererRow(wb)?.hp === 100);
  // (c) fallen: armed and due, but down under the blackout
  const c = await claimTender("Fallen Tender", 200);
  const tileC = seedTile(c.me);
  tileC(0, 0, 0);
  const darkC = tileC(1, 0, 1);
  await call("chooseClass", { classKey: "warden" }, c.token);
  await call("chooseWeapon", { weaponKey: "sword" }, c.token);
  const wc = seedWanderer(c.me, darkC, 100);
  db.prepare("UPDATE tender_progress SET hp = 0, down_until = ?, weapon_next_at = ? WHERE owner_key = ?").run(Date.now() + 60000, Date.now() - 1, c.me);
  const tc = await terr(c.token);
  ok("silence: the fallen Tender is served as fallen", tc.tender?.down === true, JSON.stringify(tc.tender));
  ok("silence: the fallen hold no weapon — no strike though the hour was due, the Fray unwounded",
    !tc.weaponStrike && wandererRow(wc)?.hp === 100, `rec=${JSON.stringify(tc.weaponStrike)} hp=${wandererRow(wc)?.hp}`);
}

/* ── §5 THE SAGE'S HAND, LIVE AT THIS SITE: her strikes are
      served with her name on the weapon — the +2 itself is
      proven in §0's table, read from the reckoning. */
{
  const { token, me } = await claimTender("Sage Tender", 800); // Lv 6
  const tile = seedTile(me);
  tile(0, 0, 0);
  const dark = tile(1, 0, 1);
  await call("chooseClass", { classKey: "sage" }, token);
  await call("chooseWeapon", { weaponKey: "sword" }, token);
  const wid = seedWanderer(me, dark, 100);
  const t = await terr(token);
  ok("the Sage's hand: her homeland weapon strikes, and the record names her sword and her prey",
    !!t.weaponStrike && t.weaponStrike.weaponKey === "sword" && t.weaponStrike.wandererId === wid, JSON.stringify(t.weaponStrike));
  ok("the Sage's hand: her bonus at this site reads +4 at Lv 6 (Fate's +2 and her +2) where the field reads +2",
    (await import("../server/dist/actions.js")).homelandWeaponBonusFor("sage", 6) === 4);
}

/* ── §6 REACH BY ATTUNEMENT: an unattuned sword cannot touch
      a Fray three hexes out; poured to the sky it strikes
      there. And the spear's own arm is longer than the
      sword's, unpoured. */
{
  // (a) sky-attuned sword: reach 4
  const a = await claimTender("Sky Sword Tender", 200);
  const tileA = seedTile(a.me);
  tileA(0, 0, 0);
  tileA(1, 0, 1); tileA(2, 0, 1);
  const farA = tileA(3, 0, 1);
  await call("chooseClass", { classKey: "warden" }, a.token);
  await call("chooseWeapon", { weaponKey: "sword" }, a.token);
  db.prepare("INSERT INTO tender_weapons (owner_key, weapon_key, level, xp, attunement_element, attunement_depth) VALUES (?, 'sword', 1, 0, 'sky', 1) ON CONFLICT(owner_key, weapon_key) DO UPDATE SET attunement_element = 'sky', attunement_depth = 1").run(a.me);
  const wa = seedWanderer(a.me, farA, 100);
  const ta = await terr(a.token);
  ok("attunement: the sky-poured sword strikes three hexes out — past its bare arm of one",
    !!ta.weaponStrike && ta.weaponStrike.wandererId === wa && ta.weaponStrike.tileId === farA, JSON.stringify(ta.weaponStrike));
  // (b) the unattuned control: same field, bare sword
  const b = await claimTender("Bare Sword Tender", 200);
  const tileB = seedTile(b.me);
  tileB(0, 0, 0);
  tileB(1, 0, 1); tileB(2, 0, 1);
  const farB = tileB(3, 0, 1);
  await call("chooseClass", { classKey: "warden" }, b.token);
  await call("chooseWeapon", { weaponKey: "sword" }, b.token);
  const wb = seedWanderer(b.me, farB, 100);
  let struckB = false;
  for (let i = 0; i < 3; i++) {
    keepStanding(b.me, 35);
    db.prepare("UPDATE tender_progress SET wanderer_watermark = NULL WHERE owner_key = ?").run(b.me);
    forceWeaponDue(b.me);
    const tb = await terr(b.token);
    if (tb.weaponStrike) struckB = true;
  }
  ok("attunement: the bare sword's control never reaches it — no strike, no wound",
    !struckB && wandererRow(wb)?.hp === 100, `hp=${wandererRow(wb)?.hp}`);
  // (c) the spear's bare arm: two hexes, unpoured
  const c = await claimTender("Spear Tender", 200);
  const tileC = seedTile(c.me);
  tileC(0, 0, 0);
  tileC(1, 0, 1);
  const midC = tileC(2, 0, 1);
  await call("chooseClass", { classKey: "warden" }, c.token);
  await call("chooseWeapon", { weaponKey: "spear" }, c.token);
  const wc = seedWanderer(c.me, midC, 100);
  const tc = await terr(c.token);
  ok("the spear: its bare arm strikes two hexes out, where the sword could not",
    !!tc.weaponStrike && tc.weaponStrike.wandererId === wc && tc.weaponStrike.tileId === midC, JSON.stringify(tc.weaponStrike));
}

console.log(`\ntest60: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
