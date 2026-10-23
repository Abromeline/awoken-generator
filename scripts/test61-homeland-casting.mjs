// HOMELAND CASTING (Nigel, 2026-10-20): "casting entirely
// isn't on the homepage yet and we need it to be so the
// tender can defend." The Tender cast only at the Table; at
// home his wheel's spell branches stood read-only because no
// law made his workings bite on this ground. Now the homeland
// keeps the SAME casting law as the Table — one roll read
// from the Table's own castModFor (imported, never copied),
// the purse charged before the roll and a fizzle spent — and
// the workings DO their work here: a cast Seal turns the
// Blind Fray's chew aside at a warded border and answers it,
// a written Blade springs on the dark standing on it and
// grinds the curse it is sown in, a Lattice pins, and the
// Springleaf's grove mends the company sheltering in it.
// Silences hold: no casting while fallen, classless (Heal
// alone, the Lv 1 art, still answers), or purse-empty — all
// refused before any charge; and no cast reaches beyond
// ring 6 of his stand. (test61)
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-homeland-casting-"));
process.env.PORT = "39961";
process.env.WORKSHOP_PASSWORD = "homeland-casting-test";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
await import("../server/dist/index.js");
await new Promise(r => setTimeout(r, 2500));
const base = "http://127.0.0.1:39961";
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
// and carried by the Audit — NOT fixed here): on a FRESH
// database the server's greeter ALTER runs before the
// awakened table is created, so the column never lands and
// every full awakened select throws. Stand the column up
// here, as the harness lessons record; production's
// database already carries it.
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }
async function claimTender(name, exp = 0) {
  const claim = await call("claimTender", { password: "homeland-casting-password", tenderName: name });
  const token = claim.data.token;
  const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.data.tender.code).id}`;
  if (exp) db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(me, exp, Date.now());
  return { token, me };
}
const seedTile = (me) => (q, r, cursed) => Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, ?, ?, ?, ?)").run(me, q, r, cursed, Date.now()).lastInsertRowid);
const seedWanderer = (me, tileId, hp = null) => Number(db.prepare("INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp) VALUES (?, ?, 'fray', ?, ?)").run(me, tileId, Date.now(), hp).lastInsertRowid);
const seedAwakened = (me, name, toughness) => {
  const nowMs = Date.now();
  const pieceId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'body', 'common', 1, ?, 'root', 'test/p.png', 'image/png', ?)").run(name, toughness, nowMs).lastInsertRowid);
  const composition = JSON.stringify([{ source_id: `db:${pieceId}`, name, category: "body", rarity: "common", power: 1, toughness, element: "root" }]);
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, 'test/a.png', ?, 'tender', 'Homeland Casting', ?, ?)").run(name, name, composition, me, nowMs).lastInsertRowid);
};
const seedPlacement = (me, awakenedId, tileId, hp) => Number(db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, hp) VALUES (?, ?, ?, ?, ?, ?)").run(me, awakenedId, tileId, Date.now(), Date.now(), hp).lastInsertRowid);
const setCurse = (tileId, hp) => db.prepare("UPDATE territory_tiles SET curse_hp = ?, curse_max_hp = ? WHERE id = ?").run(hp, hp, tileId);
const terr = async (token) => (await call("getTerritory", {}, token)).data;
const castRaw = async (token, body) => call("castMapWorking", body, token, true);
/** Cast until the roll stands (a fizzle is an honest 200 that
 *  places nothing — the loop simply casts again, as a player
 *  would). Returns the standing cast's response, or null. */
const castUntilStands = async (token, body, tries = 12) => {
  for (let i = 0; i < tries; i++) {
    const r = await castRaw(token, body);
    if (r.status === 200 && !r.data.fizzled) return r.data;
    if (r.status !== 200) return null;
  }
  return null;
};
const energyOf = (me) => db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(me)?.energy ?? null;
const setEnergy = (me, n) => db.prepare("INSERT INTO tender_resources (owner_key, energy, terrain_bank, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = excluded.energy").run(me, n, Date.now());
/** Arm exactly N steps of the curse's walk for the next read:
 *  the watermark set mid-window (N beats + half a beat) so
 *  the count survives this box's jitter, the body topped and
 *  standing (the border's teeth are the proof's subject, not
 *  the Tender's attrition). */
// The battle engine (Nigel, 2026-10-23) keeps its own clock:
// the same armed span is written to the battle watermark, so
// the beats this helper names are battle time now, settled
// continuously — the old wanderer watermark is written too,
// for the settles that still read it.
const armSteps = (me, steps, maxHp) => { const span = 2800 * steps + 1400; db.prepare("UPDATE tender_progress SET hp = ?, down_until = NULL, wanderer_watermark = ?, battle_watermark = ? WHERE owner_key = ?").run(maxHp, Date.now() - span, Date.now() - span, me); };
const workingOn = (me, tileId, engine) => db.prepare("SELECT * FROM territory_workings WHERE owner_key = ? AND tile_id = ?" + (engine ? " AND engine = ?" : "")).get(...(engine ? [me, tileId, engine] : [me, tileId]));
const placementHp = (id) => db.prepare("SELECT hp FROM field_placements WHERE id = ?").get(id)?.hp;

/* ── §0 THE SHARED TABLE, READ FROM THE HOMELAND'S OWN
      MOUTH: the homeland's roll reckoning IS the Table's
      castModFor — asserted over the whole class × school ×
      level grid through the exported homelandCastRoll (which
      is what castMapWorking rolls with), not by dice weather.
      The grove's dice are the Table's FATE_DIE, cell for
      cell, and the reach is the Table's whole world: ring 6. */
{
  const A = await import("../server/dist/actions.js");
  const T = await import("../server/dist/table.js");
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  ok("mirror: the grove's dice (HOMELAND_FATE_DIE) are the Table's FATE_DIE, cell for cell", eq(A.HOMELAND_FATE_DIE, T.FATE_DIE), JSON.stringify(A.HOMELAND_FATE_DIE));
  ok("the casting reach is ring 6 of his stand — the Table's whole world", A.HOMELAND_CAST_RING === 6);
  let grid = true; let where = "";
  for (const cls of [null, "warden", "runewright", "binder", "witch", "sage"]) {
    for (const school of ["ward", "rune", "binding", "spell"]) {
      for (const lv of [1, 3, 6, 10]) {
        const got = A.homelandCastRoll({ classKey: cls, level: lv }, { kind: school, numbers: { level: 1 } });
        if (got.mod !== T.castModFor(cls, lv, school) || got.dc !== 11) { grid = false; where = `${cls}/${school}/Lv${lv}: got mod ${got.mod} dc ${got.dc}`; }
      }
    }
  }
  ok("the grid reads whole: homelandCastRoll's modifier IS castModFor's, class × school × level", grid, where);
  ok("the Sage reads −2 in EVERY school (Nigel's law), at Lv 1 and Lv 10 alike",
    A.homelandCastRoll({ classKey: "sage", level: 1 }, { kind: "ward", numbers: { level: 1 } }).mod === -2 &&
    A.homelandCastRoll({ classKey: "sage", level: 10 }, { kind: "spell", numbers: { level: 1 } }).mod === -2 &&
    A.homelandCastRoll({ classKey: "sage", level: 6 }, { kind: "binding", numbers: { level: 1 } }).mod === -2);
  ok("in-school reads +2 + the level ladder; the closed schools −3; the open school ±0",
    T.castModFor("warden", 3, "ward") === 3 && T.castModFor("warden", 3, "rune") === -3 &&
    T.castModFor("witch", 3, "spell") === 3 && T.castModFor("binder", 3, "spell") === 0 &&
    T.castModFor(null, 3, "binding") === -3);
  ok("the DC is the spell's level + 10 (a level-2 page reads DC 12 through the homeland's roll)",
    A.homelandCastRoll({ classKey: "warden", level: 3 }, { kind: "ward", numbers: { level: 2 } }).dc === 12);
}

/* ── §1 THE PURSE, EXACT ON BOTH FACES OF THE ROLL: a Warden
      casting a Rune (a closed school to him, mod −3 against
      DC 11 — the fizzle is the common face) pays the book's
      price whether the working stands or unravels, and
      every response carries the shared table's own numbers. */
{
  const { token, me } = await claimTender("Purse Tender", 200); // Lv 3
  const tile = seedTile(me);
  tile(0, 0, 0);
  const hexes = [[1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, -1], [2, -1], [3, -1], [1, 2], [2, 2]].map(([q, r]) => tile(q, r, 0));
  await call("chooseClass", { classKey: "warden" }, token);
  setEnergy(me, 100);
  const T = await import("../server/dist/table.js");
  let fizzle = null, stood = null, modsTrue = true;
  for (const hexId of hexes) {
    if (fizzle && stood) break;
    const before = energyOf(me);
    const r = await castRaw(token, { spellKey: "blade", hue: "unaligned", tileId: hexId });
    if (r.status !== 200) { modsTrue = false; break; }
    if (r.data.mod !== T.castModFor("warden", 3, "rune") || r.data.dc !== 11) modsTrue = false;
    if (energyOf(me) !== before - 2) modsTrue = false; // the book's price, exact, either face
    if (r.data.fizzled) { if (!workingOn(me, hexId)) fizzle = { hexId }; }
    else if (workingOn(me, hexId, "blade")) stood = { hexId };
  }
  ok("every cast's mouth reads the shared table (mod −3 cross-school, DC 11) and every debit is the price exact", modsTrue);
  ok("a fizzle was met within the hunt and spent the charge while placing NOTHING", !!fizzle, "no fizzle in 12 cross-school casts (p ≈ 3e-6 by chance)");
  ok("a standing cast placed its Blade and paid the same price", !!stood);
}

/* ── §2 THE WARDED BORDER (the defense Nigel asked for):
      under the living battle engine (2026-10-23) the Fray's
      bites are fate dice on its strike cadence, not the old
      flat 5% chew — the control guard (a binder on orders,
      soft hide) ends bloodied by them. Behind a cast Seal,
      the same Fray's bite never reaches the guarded: the
      ward turns the blow at its edge before her hide is
      reckoned — the Seal counts the stop, takes the bite on
      its own health, and its riposte (3, the book's measure)
      fells the Fray (hp 3) with the first turned blow. */
{
  // THE CONTROL — no ward on the edge.
  const c = await claimTender("Unwatched Tender", 200);
  const ct = seedTile(c.me);
  ct(0, 0, 0);
  const cVictim = ct(2, 0, 0);
  const cDark = ct(3, 0, 1);
  await call("chooseClass", { classKey: "warden" }, c.token);
  const cAw = seedAwakened(c.me, "Unwatched Guard", 1);
  const cPl = seedPlacement(c.me, cAw, cVictim, 40);
  // A binder on orders: she holds the border and never
  // strikes back (placements struck nothing at all under the
  // old bite law this scenario was written for; the binder is
  // its faithful shape under the living engine).
  db.prepare("UPDATE field_placements SET stance = 'binding', stance_ordered = 1 WHERE id = ?").run(cPl);
  seedWanderer(c.me, cDark, 3);
  armSteps(c.me, 5, 35);
  await terr(c.token);
  ok("control: unguarded, the Fray's bites land on the border guard — she ends bloodied, still standing (fate dice now, not the old flat five bites of 2)",
    placementHp(cPl) < 40 && placementHp(cPl) > 0, `hp=${placementHp(cPl)}`);

  // THE WARDED BORDER — the Seal on the edge between them.
  const w = await claimTender("Warded Tender", 200);
  const wt = seedTile(w.me);
  wt(0, 0, 0);
  const wVictim = wt(2, 0, 0);
  const wDark = wt(3, 0, 1);
  await call("chooseClass", { classKey: "warden" }, w.token);
  setEnergy(w.me, 100);
  const wAw = seedAwakened(w.me, "Warded Guard", 40);
  const wPl = seedPlacement(w.me, wAw, wVictim, 40);
  db.prepare("UPDATE field_placements SET stance = 'binding', stance_ordered = 1 WHERE id = ?").run(wPl);
  const wWid = seedWanderer(w.me, wDark, 3);
  // WALL_DIRS: the edge from (2,0) toward (3,0) is dir 2.
  const sealCast = await castUntilStands(w.token, { spellKey: "seal", hue: "unaligned", tileId: wVictim, dir: 2 });
  ok("the Seal was raised on the border edge by the cast", !!sealCast?.id, JSON.stringify(sealCast));
  const sealRow = () => db.prepare("SELECT * FROM territory_workings WHERE owner_key = ? AND engine = 'seal'").get(w.me);
  const sealMax = sealRow()?.max_hp ?? 0;
  armSteps(w.me, 5, 35);
  await terr(w.token);
  const sealAfter = sealRow();
  ok("warded: the guarded placement stands UNTOUCHED behind the Seal (40 of 40)", placementHp(wPl) === 40, `hp=${placementHp(wPl)}`);
  ok("warded: the Seal counted the stop and took the bite itself (stops 1, its health bitten by the blow's fate measure — a d6 softened by the guard's AC 40, never the whole 9)",
    !!sealAfter && sealAfter.stops === 1 && sealAfter.hp < sealMax && sealAfter.hp >= sealMax - 4, JSON.stringify(sealAfter));
  ok("warded: the Seal's riposte felled the Fray — the border's attacker is GONE",
    !db.prepare("SELECT id FROM homeland_wanderers WHERE id = ?").get(wWid));
}

/* ── §3 THE SPRINGLEAF: a grove planted on homeland ground
      bursts its healing over the company in its glow at the
      raising (each mended one rolls its OWN element die —
      the fixture's company is root, d6), mends +1 per beat
      over its ground as the settle breathes, and roots its
      promised saplings on schedule, each with its own
      half-strength breath. */
{
  const { token, me } = await claimTender("Grove Tender", 200); // Lv 3 Binder
  const tile = seedTile(me);
  tile(0, 0, 0);
  const mother = tile(1, 0, 0);
  await call("chooseClass", { classKey: "binder" }, token);
  setEnergy(me, 100);
  const aw = seedAwakened(me, "Grove Friend", 40);
  const pl = seedPlacement(me, aw, mother, 10);
  const res = await castUntilStands(token, { spellKey: "springleaf", hue: "root", tileId: mother });
  ok("the Springleaf was planted by the cast", !!res?.id, JSON.stringify(res));
  ok("her size is the tender-cast measure read into hexes (Lv 3 → radius 3)", res?.radiusHexes === 3, `radius=${res?.radiusHexes}`);
  ok("she promises 1d4 saplings", (res?.saplings ?? 0) >= 1 && (res?.saplings ?? 9) <= 4, `saplings=${res?.saplings}`);
  ok("the raising burst healed by the wounded one's own die (root d6: 10 → 10+burst, burst 1–6)",
    (res?.burst ?? 0) >= 1 && (res?.burst ?? 9) <= 6 && placementHp(pl) === 10 + (res?.burst ?? 0),
    `burst=${res?.burst} hp=${placementHp(pl)}`);
  const groveRow = () => db.prepare("SELECT * FROM territory_workings WHERE owner_key = ? AND engine = 'springleaf'").get(me);
  // The mend: fixture the grove's record to the mother alone
  // (saplings held back) and three breaths owed — the settle
  // pays exactly 3 × healPerBreath (the book's 1).
  const g1 = groveRow();
  const nums1 = JSON.parse(g1.nums);
  nums1.saplings = [];
  nums1.lastMendAt = Date.now() - (2800 * 3 + 1400);
  db.prepare("UPDATE territory_workings SET nums = ? WHERE id = ?").run(JSON.stringify(nums1), g1.id);
  const hpBeforeMend = placementHp(pl);
  await terr(token);
  ok("the grove's breath mends +1 per beat over its ground (3 beats → +3)",
    placementHp(pl) === hpBeforeMend + 3, `hp ${hpBeforeMend} → ${placementHp(pl)}`);
  // The rooting: a sapling whose hour has come takes root on
  // the settle and breathes its half-die over the same friend.
  db.prepare("UPDATE field_placements SET hp = 20 WHERE id = ?").run(pl);
  const g2 = groveRow();
  const nums2 = JSON.parse(g2.nums);
  nums2.saplings = [{ tileId: mother, dueAt: Date.now() - 1000, expiresAt: 0, rooted: false }];
  nums2.lastMendAt = Date.now();
  db.prepare("UPDATE territory_workings SET nums = ? WHERE id = ?").run(JSON.stringify(nums2), g2.id);
  await terr(token);
  const nums3 = JSON.parse(groveRow().nums);
  const rootedHp = placementHp(pl);
  ok("the sapling rooted on schedule (rooted, with its own 20 s of life written)",
    nums3.saplings?.[0]?.rooted === true && (nums3.saplings?.[0]?.expiresAt ?? 0) > 0, JSON.stringify(nums3.saplings));
  ok("the rooting breath healed at half the die (20 → 21–23)", rootedHp >= 21 && rootedHp <= 23, `hp=${rootedHp}`);
}

/* ── §4 THE STRIKE WORKINGS: a Blade written under a standing
      Fray springs at the cast — its harm (6, the book's
      power) fells the Fray (hp 3) AND grinds the curse of
      the ground it stands on by the same harm; written on
      cursed ground with no dark present, it springs on the
      curse itself, and curse HP ground to 0 turns the hex. */
{
  const { token, me } = await claimTender("Strike Tender", 200); // Lv 3 Runewright
  const tile = seedTile(me);
  tile(0, 0, 0);
  const darkHex = tile(1, 0, 1); setCurse(darkHex, 20);
  const curseHex = tile(2, 0, 1); setCurse(curseHex, 5);
  await call("chooseClass", { classKey: "runewright" }, token);
  setEnergy(me, 100);
  const wid = seedWanderer(me, darkHex, 3);
  const r1 = await castUntilStands(token, { spellKey: "blade", hue: "unaligned", tileId: darkHex });
  ok("the Blade sprang at its own cast (sprung, and the Fray felled by it)", r1?.sprung === true && r1?.felled === true, JSON.stringify(r1));
  ok("the Fray is gone from the ledger", !db.prepare("SELECT id FROM homeland_wanderers WHERE id = ?").get(wid));
  ok("the same harm ground the hex's curse (20 → 14 by the Blade's power of 6)",
    db.prepare("SELECT curse_hp AS ch FROM territory_tiles WHERE id = ?").get(darkHex).ch === 14 && r1?.ground === 6,
    `curse=${JSON.stringify(db.prepare("SELECT curse_hp AS ch FROM territory_tiles WHERE id = ?").get(darkHex))} ground=${r1?.ground}`);
  ok("the Blade stands with one spring spent of its two", (workingOn(me, darkHex, "blade")?.charges ?? -1) === 1,
    `charges=${workingOn(me, darkHex, "blade")?.charges}`);
  const r2 = await castUntilStands(token, { spellKey: "blade", hue: "unaligned", tileId: curseHex });
  const t2 = db.prepare("SELECT cursed FROM territory_tiles WHERE id = ?").get(curseHex);
  ok("on cursed ground alone the Blade springs on the curse itself — and 6 harm against 5 curse HP TURNS the hex",
    r2?.purified === true && t2.cursed === 0, `purified=${r2?.purified} cursed=${t2.cursed}`);
}

/* ── §5 THE REACH: a cast named beyond ring 6 of his stand is
      refused before any charge — the purse untouched, the
      ground unwritten. */
{
  const { token, me } = await claimTender("Reach Tender", 200);
  const tile = seedTile(me);
  tile(0, 0, 0);
  let far = 0;
  for (let q = 1; q <= 7; q++) far = tile(q, 0, 1);
  await call("chooseClass", { classKey: "warden" }, token);
  setEnergy(me, 50);
  const r = await castRaw(token, { spellKey: "blade", hue: "unaligned", tileId: far });
  ok("a cast at ring 7 is refused (400)", r.status === 400, `status=${r.status} ${JSON.stringify(r.data)}`);
  ok("the refusal cost nothing and wrote nothing", energyOf(me) === 50 &&
    db.prepare("SELECT COUNT(*) AS n FROM territory_workings WHERE owner_key = ?").get(me).n === 0);
}

/* ── §6 THE SILENCES: fallen, classless, purse-empty — each
      refused before charge. The classless Tender keeps Heal
      alone: the Lv 1 art predates the choosing, and it rolls
      (and charges) at the closed school's word, −3. */
{
  // Fallen.
  const f = await claimTender("Fallen Tender", 200);
  const ft = seedTile(f.me);
  ft(0, 0, 0); const fHex = ft(1, 0, 0);
  await call("chooseClass", { classKey: "warden" }, f.token);
  setEnergy(f.me, 50);
  db.prepare("UPDATE tender_progress SET down_until = ? WHERE owner_key = ?").run(Date.now() + 60000, f.me);
  const rf = await castRaw(f.token, { spellKey: "blade", hue: "unaligned", tileId: fHex });
  ok("fallen: no cast leaves him (400) and the purse is untouched", rf.status === 400 && energyOf(f.me) === 50,
    `status=${rf.status} energy=${energyOf(f.me)}`);

  // Classless: the land's workings refused; Heal answers.
  const n = await claimTender("Classless Tender", 200);
  const nt = seedTile(n.me);
  const nHeart = nt(0, 0, 0);
  setEnergy(n.me, 50);
  const rn = await castRaw(n.token, { spellKey: "seal", hue: "unaligned", tileId: nHeart, dir: 0 });
  ok("classless: a ward is refused (400) before charge", rn.status === 400 && energyOf(n.me) === 50,
    `status=${rn.status} energy=${energyOf(n.me)}`);
  const nAw = seedAwakened(n.me, "Classless Friend", 40);
  seedPlacement(n.me, nAw, nHeart, 30);
  const rh = await castRaw(n.token, { spellKey: "heal", hue: "unaligned", awakenedId: nAw });
  const T = await import("../server/dist/table.js");
  ok("classless: Heal still answers — it rolls at the closed school's −3 against DC 11, and charges its 2✦ either face",
    rh.status === 200 && rh.data.mod === T.castModFor(null, 3, "binding") && rh.data.dc === 11 && energyOf(n.me) === 48,
    `status=${rh.status} mod=${rh.data?.mod} dc=${rh.data?.dc} energy=${energyOf(n.me)}`);

  // Empty purse.
  const e = await claimTender("Empty Purse Tender", 200);
  const et = seedTile(e.me);
  const eHeart = et(0, 0, 0);
  await call("chooseClass", { classKey: "warden" }, e.token);
  setEnergy(e.me, 1);
  const re = await castRaw(e.token, { spellKey: "seal", hue: "unaligned", tileId: eHeart, dir: 0 });
  ok("empty purse: the cast is refused before charge (400), the 1✦ stays",
    re.status === 400 && energyOf(e.me) === 1, `status=${re.status} energy=${energyOf(e.me)}`);
}

/* ── §7 THE LATTICE'S HOLD: written on cursed ground, the
      Lattice springs on the settle when the dark stands on
      it — the wanderer is pinned for the book's rounds
      (counted in curse beats), the pinning costs the
      lattice the dark's power (1) from its health; while
      pinned the dark neither wanders nor chews — the Tender
      beside it stands untouched — and when the pin lapses
      with the dark still on the writing, the lattice springs
      afresh at its next measure of health. */
{
  const { token, me } = await claimTender("Pin Tender", 200); // Lv 3 Runewright
  const tile = seedTile(me);
  tile(0, 0, 0);
  const latHex = tile(1, 0, 1); setCurse(latHex, 30);
  await call("chooseClass", { classKey: "runewright" }, token);
  setEnergy(me, 100);
  const cast = await castUntilStands(token, { spellKey: "lattice", hue: "unaligned", tileId: latHex });
  ok("the Lattice was written on the cursed hex", !!cast?.id, JSON.stringify(cast));
  const latRow = () => db.prepare("SELECT * FROM territory_workings WHERE owner_key = ? AND engine = 'lattice'").get(me);
  const latHp0 = latRow()?.hp ?? -1;
  const wid = seedWanderer(me, latHex, 3);
  await terr(token);
  const wRow = () => db.prepare("SELECT tile_id AS tileId, pinned_beats AS pb FROM homeland_wanderers WHERE id = ?").get(wid);
  ok("the settle sprang the Lattice: the dark stands pinned for the book's 2 rounds",
    wRow()?.pb === 2 && wRow()?.tileId === latHex, JSON.stringify(wRow()));
  ok("the pinning cost the Lattice the Fray's power (1) from its health", latRow()?.hp === latHp0 - 1,
    `hp ${latHp0} → ${latRow()?.hp}`);
  armSteps(me, 2, 35);
  await terr(token);
  const tenderHp = db.prepare("SELECT hp FROM tender_progress WHERE owner_key = ?").get(me)?.hp;
  ok("two beats pinned: the dark never moved and never chewed — the Tender beside it stands whole (35 of 35)",
    wRow()?.tileId === latHex && tenderHp === 35, `tile=${wRow()?.tileId} tenderHp=${tenderHp}`);
  ok("the lapsed pin sprang afresh on the standing dark (pinned 2 again, another measure of the Lattice's health)",
    wRow()?.pb === 2 && latRow()?.hp === latHp0 - 2, `pb=${wRow()?.pb} latHp=${latRow()?.hp} (was ${latHp0})`);
}

/* ── §8 THE NEW WORKINGS ON THE LAND (Nigel, 2026-10-22;
      seated 2026-10-23 — ported whole from the Proving
      Ground): Bats hunts the strongest and bites 1d4 past
      all armour, three bites over 9 s, capped at three
      swarms to a caster (the Witch suffers no cap); the
      Hold Rune's hold BEGINS at the crash — 33 slots at
      ~122 ms after the cast — and lasts 3 s, dying with its
      target; Rune Shatter looses three pieces, each its own
      d20 + bonus − 2 against AC for 1 damage, reaches only
      2 tiles, and HELD stands a stream that drinks 1✦ a
      second and fires three pieces a second. The settle is
      timestamp-driven, so the proofs set the workings' own
      clocks back and let the territory read reckon them —
      the same road a player's wait travels. */
{
  const wandererHp = (id) => db.prepare("SELECT hp FROM homeland_wanderers WHERE id = ?").get(id)?.hp;
  const workingRow = (me, engine) => db.prepare("SELECT * FROM territory_workings WHERE owner_key = ? AND engine = ? ORDER BY id DESC").get(me, engine);
  const setNums = (id, patch) => { const row = db.prepare("SELECT nums FROM territory_workings WHERE id = ?").get(id); const nums = { ...JSON.parse(row.nums ?? "{}"), ...patch }; db.prepare("UPDATE territory_workings SET nums = ? WHERE id = ?").run(JSON.stringify(nums), id); };

  // BATS — the hunt and the bites.
  const b = await claimTender("Bat Tender", 200); // Lv 3
  const bt = seedTile(b.me);
  bt(0, 0, 0); bt(1, 0, 0); bt(2, 0, 0); bt(3, 0, 0);
  await call("chooseClass", { classKey: "witch" }, b.token);
  setEnergy(b.me, 500);
  const strongTile = Number(db.prepare("SELECT id FROM territory_tiles WHERE owner_key = ? AND q = 2 AND r = 0").get(b.me).id);
  const weakTile = Number(db.prepare("SELECT id FROM territory_tiles WHERE owner_key = ? AND q = 1 AND r = 0").get(b.me).id);
  const strongId = seedWanderer(b.me, strongTile, 10);
  const weakId = seedWanderer(b.me, weakTile, 2);
  const swarm = await castUntilStands(b.token, { spellKey: "bats", hue: "unaligned" });
  ok("bats: the cast stands a swarm working on the land (spell, 5✦)", !!swarm?.id && !!workingRow(b.me, "bats"), JSON.stringify(swarm));
  const swarmRow = workingRow(b.me, "bats");
  setNums(swarmRow.id, { nextBiteAt: Date.now() - 1 }); // the first bite falls due
  await terr(b.token);
  const strongAfter1 = wandererHp(strongId);
  ok("bats: the first bite found the STRONGEST standing (10 hp), past all armour — 1d4 gone, the weak one untouched",
    strongAfter1 != null && strongAfter1 <= 9 && strongAfter1 >= 6 && wandererHp(weakId) === 2,
    `strong=${strongAfter1} weak=${wandererHp(weakId)}`);
  ok("bats: the bite is counted on the working (1 of 3)", JSON.parse(workingRow(b.me, "bats")?.nums ?? "{}").bites === 1);
  setNums(swarmRow.id, { bites: 2, nextBiteAt: Date.now() - 1 }); // the third bite falls due
  await terr(b.token);
  setNums(swarmRow.id, { bornAt: Date.now() - 9001, nextBiteAt: Date.now() + 60000 }); // its 9 s spent
  await terr(b.token);
  ok("bats: after three bites and its 9 s the swarm is gone from the land", !workingRow(b.me, "bats"));

  // BATS — the cap, and the Witch's exemption.
  const c = await claimTender("Capped Tender", 200);
  const ct2 = seedTile(c.me);
  ct2(0, 0, 0); const cField = ct2(1, 0, 0);
  await call("chooseClass", { classKey: "binder" }, c.token);
  setEnergy(c.me, 500);
  seedWanderer(c.me, cField, 10);
  let stood3 = 0;
  for (let i = 0; i < 3; i++) { if (await castUntilStands(c.token, { spellKey: "bats", hue: "unaligned" })) stood3++; }
  ok("bats: three swarms stand for one caster", stood3 === 3 &&
    db.prepare("SELECT COUNT(*) AS n FROM territory_workings WHERE owner_key = ? AND engine = 'bats'").get(c.me).n === 3, `stood=${stood3}`);
  const capBefore = energyOf(c.me);
  const capTry = await castRaw(c.token, { spellKey: "bats", hue: "unaligned" });
  ok("bats: the fourth swarm is refused at the cap BEFORE any charge", capTry.status === 400 && energyOf(c.me) === capBefore,
    `status=${capTry.status} energy ${capBefore}→${energyOf(c.me)}`);
  const w = await claimTender("Witch Tender", 200);
  const wt2 = seedTile(w.me);
  wt2(0, 0, 0); const wField = wt2(1, 0, 0);
  await call("chooseClass", { classKey: "witch" }, w.token);
  setEnergy(w.me, 500);
  seedWanderer(w.me, wField, 10);
  let stood4 = 0;
  for (let i = 0; i < 4; i++) { if (await castUntilStands(w.token, { spellKey: "bats", hue: "unaligned" })) stood4++; }
  ok("bats: the Witch suffers NO cap — her fourth swarm stands", stood4 === 4, `stood=${stood4}`);

  // HOLD RUNE — the hold begins at the crash.
  const h = await claimTender("Hold Tender", 200); // Lv 3
  const ht = seedTile(h.me);
  ht(0, 0, 0); const hField = ht(1, 0, 0);
  await call("chooseClass", { classKey: "runewright" }, h.token);
  setEnergy(h.me, 500);
  const hTarget = seedWanderer(h.me, hField, 10);
  const holdCast = await castUntilStands(h.token, { spellKey: "holdrune", hue: "unaligned", tileId: hField });
  ok("hold rune: the cast stands over its named shade (rune, 7✦)", !!holdCast?.id && holdCast.targetId === hTarget, JSON.stringify(holdCast));
  const holdRow = workingRow(h.me, "holdrune");
  const heldBefore = db.prepare("SELECT held_until AS hu FROM homeland_wanderers WHERE id = ?").get(hTarget)?.hu ?? 0;
  ok("hold rune: before the crash the shade stands FREE (the hold has not begun)", !(heldBefore > Date.now()), `held_until=${heldBefore}`);
  setNums(holdRow.id, { bornAt: Date.now() - 5000 }); // the form's 4026 ms are spent — the crash falls
  await terr(h.token);
  const heldAfter = db.prepare("SELECT held_until AS hu FROM homeland_wanderers WHERE id = ?").get(hTarget)?.hu ?? 0;
  ok("hold rune: at the crash's first strike the hold BEGINS — held_until stands ~3 s out",
    heldAfter > Date.now() + 1500 && heldAfter <= Date.now() + 3100, `held_until-now=${heldAfter - Date.now()}`);
  setNums(holdRow.id, { holdUntil: Date.now() - 1 }); // the hold is spent
  await terr(h.token);
  ok("hold rune: when the hold ends the working is spent and gone", !workingRow(h.me, "holdrune"));
  const hField2 = ht(2, 0, 0);
  const hTarget2 = seedWanderer(h.me, hField2, 10);
  const holdCast2 = await castUntilStands(h.token, { spellKey: "holdrune", hue: "unaligned", tileId: hField2 });
  ok("hold rune: a second cast stands over the second shade", !!holdCast2?.id);
  db.prepare("DELETE FROM homeland_wanderers WHERE id = ?").run(hTarget2); // its shade falls before the crash
  await terr(h.token);
  ok("hold rune: a target fallen before the crash takes the rune with it", !workingRow(h.me, "holdrune"));

  // RUNE SHATTER — the volley, the reach, the held stream.
  const s = await claimTender("Shatter Tender", 200); // Lv 3 Witch: the spell school is hers
  const st = seedTile(s.me);
  st(0, 0, 0); const sNear = st(1, 0, 0); const sFar = st(3, 0, 0);
  await call("chooseClass", { classKey: "witch" }, s.token);
  setEnergy(s.me, 500);
  const farBefore = energyOf(s.me);
  const farTry = await castRaw(s.token, { spellKey: "shatter", hue: "unaligned", tileId: sFar });
  ok("shatter: a shot beyond 2 tiles is refused BEFORE any charge", farTry.status === 400 && energyOf(s.me) === farBefore,
    `status=${farTry.status} energy ${farBefore}→${energyOf(s.me)}`);
  const sTarget = seedWanderer(s.me, sNear, 3);
  let volley = null;
  for (let i = 0; i < 12 && !volley; i++) { const r = await castRaw(s.token, { spellKey: "shatter", hue: "unaligned", tileId: sNear }); if (r.status === 200 && !r.data.fizzled) volley = r.data; }
  ok("shatter: the tap looses THREE pieces, each its own shot (hits counted on the answer)", !!volley && typeof volley.hits === "number" && volley.hits >= 0 && volley.hits <= 3, JSON.stringify(volley));
  const sHpAfter = wandererHp(sTarget);
  ok("shatter: the standing shade bears exactly the hits — 1 damage apiece (3 hp − hits, or fallen at 3)",
    volley && ((volley.hits === 3 && sHpAfter == null) || sHpAfter === 3 - volley.hits), `hits=${volley?.hits} hp=${sHpAfter}`);
  // The held stream: 1✦ a second, three pieces a second.
  const sTarget2 = seedWanderer(s.me, sNear, 10);
  let streamCast = null;
  for (let i = 0; i < 12 && !streamCast; i++) { const r = await castRaw(s.token, { spellKey: "shatter", hue: "unaligned", tileId: sNear, heldMs: 3000 }); if (r.status === 200 && !r.data.fizzled) streamCast = r.data; }
  const streamRow = workingRow(s.me, "shatter");
  ok("shatter: a HELD cast stands the stream as a working of its own", !!streamCast && !!streamRow, JSON.stringify(streamCast));
  const energyBeforeStream = energyOf(s.me);
  const hpBeforeStream = wandererHp(sTarget2);
  setNums(streamRow.id, { nextChargeAt: Date.now() - 500, nextPieceAt: Date.now() - 900, streamUntil: Date.now() + 60000 }); // one second of the stream falls due (one charge, three pieces)
  await terr(s.token);
  ok("shatter: the stream's passed second drank exactly 1✦", energyOf(s.me) === energyBeforeStream - 1,
    `energy ${energyBeforeStream}→${energyOf(s.me)}`);
  const hpAfterStream = wandererHp(sTarget2);
  ok("shatter: the stream's due pieces (three in the second) struck for at most 1 apiece and never healed",
    hpAfterStream != null && hpBeforeStream != null && hpAfterStream <= hpBeforeStream && hpAfterStream >= hpBeforeStream - 3,
    `hp ${hpBeforeStream}→${hpAfterStream}`);
}

console.log(`\nHOMELAND CASTING: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
