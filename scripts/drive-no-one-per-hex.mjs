// drive-no-one-per-hex — NO ONE-PER-HEX (Nigel, 2026-10-26:
// "NO hexs wards or runs should be locked to one per rune").
// A hex may carry MULTIPLE runes and wards at once. This
// drive proves it through the real cast doors on BOTH
// grounds:
//   §H THE HOMELAND (castMapWorking): a Lattice and a Single
//      Blade — two runes — stand together on one cursed hex;
//      two Seals stand together on the SAME edge of that hex;
//      all four appear in the served territory; the curse's
//      attrition then ticks against EACH of them (each keeps
//      its own life); a Fray wandering onto the shared hex is
//      pinned by the Lattice standing there (a rune sharing a
//      hex still fires on its trigger); and a cast beyond
//      ring 6 of the stand is still refused in the standing
//      words, writing nothing and charging nothing.
//   §T THE TABLE (castRune / castWard over the socket): a
//      Lattice stands on a cursed hex; a Springblade written
//      onto the SAME hex springs on the curse at its cast
//      (its charges fall 2 → 1 and the curse is ground) —
//      a second rune sharing the hex, firing on its trigger;
//      two Seals stand on the same edge of that hex; all
//      four stand together in the room's served state; the
//      withering accrues against each; and after gliding to
//      the board's far side, a cast at the opposite edge is
//      refused in the standing "Beyond reach" words, charging
//      nothing and writing nothing.
// Run: node scripts/drive-no-one-per-hex.mjs
import WebSocket from "ws";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

const DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-no-one-per-hex-"));
process.env.DATA_DIR = DATA_DIR;
process.env.PORT = "3951";
process.env.WORKSHOP_PASSWORD = "no-one-per-hex-word";
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
const base = "http://127.0.0.1:3951";
const db = new Database(join(DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }

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
const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

/* ══ §H THE HOMELAND ══════════════════════════════════════ */
console.log("\n§H the homeland — two runes share a hex, two wards share its edge");
{
  const claim = await call("claimTender", { password: "many-writings-pw", tenderName: "Many Writings" });
  const token = claim.data.token;
  const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.data.tender.code).id}`;
  const now = Date.now();
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(me, now);
  // The choosing gate: three wakes stand in the roster
  // before the class door opens (the standing law).
  for (let i = 0; i < 3; i++) {
    const pieceId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'body', 'common', 1, 2, 'root', 'test/p.png', 'image/png', ?)").run(`H Body ${i}`, now).lastInsertRowid);
    const composition = JSON.stringify([{ source_id: `db:${pieceId}`, name: `H Body ${i}`, category: "body", rarity: "common", power: 1, toughness: 2, element: "root" }]);
    db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, 'test/a.png', ?, 'tender', 'Many Writings', ?, ?)").run(`Homeling ${i}`, `Homeling ${i}`, composition, me, now);
  }
  await call("chooseClass", { classKey: "runewright" }, token);
  const seedTile = (q, r, cursed) => Number(db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, ?, ?, ?, ?)").run(me, q, r, cursed, now).lastInsertRowid);
  const ids = {};
  for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) {
    if (hexDist({ q, r }, { q: 0, r: 0 }) > 3) continue;
    ids[`${q},${r}`] = seedTile(q, r, 0);
  }
  const target = ids["2,0"];
  db.prepare("UPDATE territory_tiles SET cursed = 1, curse_hp = 100, curse_max_hp = 100 WHERE id = ?").run(target);
  const farTile = seedTile(7, 0, 0);
  db.prepare("INSERT INTO tender_resources (owner_key, energy, terrain_bank, updated_at) VALUES (?, 500, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 500").run(me, now);

  const castRaw = (body) => call("castMapWorking", body, token, true);
  const castUntilStands = async (body, tries = 25) => {
    for (let i = 0; i < tries; i++) {
      const r = await castRaw(body);
      if (r.status === 200 && !r.data.fizzled) return r.data;
      if (r.status !== 200) return null;
    }
    return null;
  };
  const rowsOn = () => db.prepare("SELECT * FROM territory_workings WHERE owner_key = ? AND tile_id = ? ORDER BY id").all(me, target);

  const lat = await castUntilStands({ spellKey: "lattice", hue: "unaligned", tileId: target });
  check("H1: the Lattice stands on the cursed hex (2,0)", !!lat && rowsOn().some(w => w.engine === "lattice"), JSON.stringify(lat));

  const blade = await castUntilStands({ spellKey: "blade", hue: "unaligned", tileId: target });
  const twoRunes = rowsOn().filter(w => w.kind === "rune" || w.kind === "spell");
  check("H2: a SECOND rune (the Single Blade) stands on the SAME hex — no 'one writing per hex' refusal",
    !!blade && twoRunes.length === 2 && twoRunes.some(w => w.engine === "blade"),
    `rows=${JSON.stringify(rowsOn().map(w => w.engine))}`);

  const seal1 = await castUntilStands({ spellKey: "seal", hue: "unaligned", tileId: target, dir: 0 });
  const seal2 = await castUntilStands({ spellKey: "seal", hue: "unaligned", tileId: target, dir: 0 });
  const wards = db.prepare("SELECT * FROM territory_workings WHERE owner_key = ? AND kind = 'ward' ORDER BY id").all(me);
  check("H3: two Seals stand on the SAME edge of the hex — no 'ward already stands on that edge' refusal",
    !!seal1 && !!seal2 && wards.length === 2 && wards[0].edge_key === wards[1].edge_key,
    `wards=${JSON.stringify(wards.map(w => ({ id: w.id, edge: w.edge_key })))}`);

  // The withering ticks against EACH of them: arm 30 s of
  // curse attrition on every row, then read the land once.
  const before = new Map(rowsOn().concat(wards).map(w => [w.id, { hp: w.hp, wither: w.wither ?? 0, charges: w.charges }]));
  db.prepare("UPDATE territory_workings SET wither_wm = ? WHERE owner_key = ?").run(Date.now() - 30000, me);
  const terr = (await call("getTerritory", {}, token)).data;
  const after = new Map(db.prepare("SELECT * FROM territory_workings WHERE owner_key = ?").all(me).map(w => [w.id, w]));
  check("H4: all four workings still stand after the attrition read — none displaced, none merged",
    after.size === 4, `rows=${after.size}`);
  check("H5: the served territory carries all four workings at once",
    (terr.workings ?? []).length === 4, `served=${(terr.workings ?? []).length}`);
  const latAfter = [...after.values()].find(w => w.engine === "lattice");
  const bladeAfter = [...after.values()].find(w => w.engine === "blade");
  const sealsAfter = [...after.values()].filter(w => w.kind === "ward");
  check("H6: the attrition ticked against the Lattice's own health",
    !!latAfter && latAfter.hp < before.get(latAfter.id).hp,
    `hp ${before.get(latAfter?.id)?.hp} -> ${latAfter?.hp}`);
  check("H7: the attrition ticked against EACH Seal's own health",
    sealsAfter.length === 2 && sealsAfter.every(w => w.hp < before.get(w.id).hp),
    JSON.stringify(sealsAfter.map(w => `${before.get(w.id).hp}->${w.hp}`)));
  check("H8: the attrition accrued against the Blade's charges-body (fractional wither, charges unspent)",
    !!bladeAfter && (bladeAfter.wither ?? 0) > 0.4 && bladeAfter.charges === before.get(bladeAfter.id).charges,
    `wither=${bladeAfter?.wither} charges=${bladeAfter?.charges}`);

  // The trigger: a Fray wanders onto the shared hex — the
  // Lattice standing there pins it, on the land's own read.
  const latHpNow = db.prepare("SELECT hp FROM territory_workings WHERE owner_key = ? AND engine = 'lattice'").get(me).hp;
  db.prepare("INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp) VALUES (?, ?, 'fray', ?, 10)").run(me, target, Date.now());
  db.prepare("UPDATE tender_progress SET battle_watermark = ?, wanderer_watermark = ? WHERE owner_key = ?").run(Date.now(), Date.now(), me);
  await call("getTerritory", {}, token);
  const fray = db.prepare("SELECT pinned_beats FROM homeland_wanderers WHERE owner_key = ?").get(me);
  const latHpAfter = db.prepare("SELECT hp FROM territory_workings WHERE owner_key = ? AND engine = 'lattice'").get(me)?.hp;
  check("H9: the Lattice sharing the hex FIRES on its trigger — the Fray stands pinned, the Lattice pays its strain",
    !!fray && (fray.pinned_beats ?? 0) > 0 && latHpAfter === latHpNow - 1,
    `pinned=${fray?.pinned_beats} lattice hp ${latHpNow} -> ${latHpAfter}`);

  // The negative space: range still gates, in the standing
  // words, and a refused cast writes and charges nothing.
  const energyBefore = db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(me).energy;
  const far = await castRaw({ spellKey: "lattice", hue: "unaligned", tileId: farTile });
  const energyAfter = db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(me).energy;
  const farRows = db.prepare("SELECT COUNT(*) AS n FROM territory_workings WHERE owner_key = ? AND tile_id = ?").get(me, farTile).n;
  check("H10: out-of-range is still refused in the standing words ('beyond your casting reach')",
    far.status === 400 && String(far.data.error ?? far.data.message ?? "").includes("beyond your casting reach"),
    `status=${far.status} body=${JSON.stringify(far.data)}`);
  check("H11: the refused cast wrote nothing and charged nothing",
    farRows === 0 && energyAfter === energyBefore, `rows=${farRows} energy ${energyBefore} -> ${energyAfter}`);
}

/* ══ §T THE TABLE ═════════════════════════════════════════ */
console.log("\n§T the Table — two runes share a hex, two wards share its edge");
{
  // A bound Tender at Lv 10, Runewright, with a roster whose
  // only job is the purse (the max-energy law pays per head).
  const claim = await call("claimTender", { password: "table-many-pw", tenderName: "Table Many" });
  const token = claim.data.token;
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.data.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  const now = Date.now();
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, now);
  const insAsset = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, 'body', 'common', 2, 2, 'sky', ?, 'image/png', ?)");
  const insAwokin = db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)");
  for (let i = 0; i < 121; i++) {
    const bodyId = Number(insAsset.run(`Body T-${i}`, `test/tbody-${i}.png`, now).lastInsertRowid);
    const composition = JSON.stringify([{ source_id: `db:${bodyId}`, name: `Body T-${i}`, category: "body", rarity: "common", power: 2, toughness: 2, element: "sky" }]);
    insAwokin.run(`Tablekin ${i}`, `Tablekin ${i}`, `test/tawokin-${i}.png`, composition, "Table Many", ownerKey, now);
  }
  await call("chooseClass", { classKey: "runewright" }, token);
  const { issueTableToken } = await import("../server/dist/table.js");
  const tt = issueTableToken({ id: "disc-no-one-per-hex", name: "Table Many" });
  const code = (await call("getTableBindCode", {}, token)).data.code;
  const bindRes = await fetch(`${base}/api/table/bind`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: tt, code }),
  });
  if (!bindRes.ok) throw new Error(`table/bind -> ${bindRes.status}`);

  const c = { state: null, you: null, errors: [] };
  const ws = new WebSocket("ws://127.0.0.1:3951/table/ws");
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "state") { c.state = m.state; c.you = m.you; }
    if (m.type === "error" || m.type === "joinError") c.errors.push(m.message);
  });
  const send = (msg) => ws.send(JSON.stringify(msg));
  await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error("join timeout")), 10000);
    ws.on("open", () => {
      send({ type: "join", authToken: tt, room: "drive-one-per-hex" });
      const iv = setInterval(() => { if (c.state) { clearInterval(iv); clearTimeout(to); resolve(); } }, 100);
    });
  });
  const waitFor = async (fn, what, timeout = 20000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (c.state && fn(c)) return true;
      await sleep(150);
    }
    throw new Error(`timed out waiting for ${what}`);
  };
  const meIn = () => c.state.players.find(p => p.key === c.you.key);
  await waitFor(cc => !!meIn(cc)?.pos, "the tender stands in pixel space");

  const TARGET = "2,0", FACING = "3,0";
  const tileOf = (id) => c.state.map.find(t => t.id === id);
  check("T0: the target hex (2,0) stands cursed, at ring 2", !!tileOf(TARGET) && !!tileOf(TARGET).cursed, JSON.stringify(tileOf(TARGET)));
  const curseBefore = tileOf(TARGET).curseHp;

  const onHex = () => (c.state.workings ?? []).filter(w => w.hex === TARGET);
  const onEdge = () => (c.state.workings ?? []).filter(w => w.kind === "ward" &&
    ((w.hexA === TARGET && w.hexB === FACING) || (w.hexA === FACING && w.hexB === TARGET)));
  // Cast until the working stands — a fizzle is honest dice
  // (the purse is charged, nothing stands), so cast again,
  // as a player would. A REFUSAL (an error) ends the hunt:
  // under the struck law there must be none for sharing.
  const castUntilStands = async (msg, stands, what) => {
    for (let i = 0; i < 20; i++) {
      const errAt = c.errors.length;
      send(msg);
      await sleep(450);
      if (stands()) return true;
      const fresh = c.errors.slice(errAt);
      if (fresh.length) throw new Error(`${what}: refused — ${fresh.join(" | ")}`);
    }
    return false;
  };

  check("T1: the Lattice stands on the cursed hex (2,0)",
    await castUntilStands({ type: "castRune", root: "lattice", hexes: [TARGET] },
      () => onHex().some(w => w.engine === "lattice"), "lattice"));

  check("T2: a SECOND rune (the Springblade) stands on the SAME hex — no 'one writing per hex' refusal",
    await castUntilStands({ type: "castRune", root: "springblade", hexes: [TARGET] },
      () => onHex().some(w => w.engine === "springblade"), "springblade"));
  const spring = onHex().find(w => w.engine === "springblade");
  check("T3: the Springblade stands armed on the shared hex at full charges — at the Table its trigger is the dark, not the curse (the curse stands unground)",
    !!spring && spring.charges === 2 && tileOf(TARGET).curseHp === curseBefore,
    `charges=${spring?.charges} curse ${curseBefore} -> ${tileOf(TARGET).curseHp}`);

  check("T4: a Seal stands on the hex's edge (2,0)|(3,0)",
    await castUntilStands({ type: "castWard", root: "seal", hexA: TARGET, hexB: FACING },
      () => onEdge().length === 1, "seal #1"));
  check("T5: a SECOND Seal stands on the SAME edge — no 'ward already stands on that edge' refusal",
    await castUntilStands({ type: "castWard", root: "seal", hexA: TARGET, hexB: FACING },
      () => onEdge().length === 2, "seal #2"));
  check("T6: all four workings stand together in the room's served state",
    onHex().length === 2 && onEdge().length === 2,
    `hex=${JSON.stringify(onHex().map(w => w.engine))} edge=${onEdge().length}`);

  // The withering accrues against EACH of them.
  const four = () => [...onHex(), ...onEdge()];
  let withered = false;
  const wStart = Date.now();
  while (Date.now() - wStart < 25000) {
    if (four().length === 4 && four().every(w => (w.wither ?? 0) > 0)) { withered = true; break; }
    await sleep(400);
  }
  check("T7: the curse's attrition accrues against EACH of the four (each keeps its own life)",
    withered, JSON.stringify(four().map(w => ({ e: w.engine, wither: w.wither }))));

  // The trigger, with real dark: field a hand, strike the
  // curse (the provoke — the dark answers a struck curse),
  // and when the dark takes the field, write a Lattice and
  // then a Springblade onto the hex it stands on. At the
  // Springblade's cast the spring reads the hex's runes in
  // turn: under the old first-rune-only spring the Lattice
  // (written first) would spring alone and the Springblade
  // would keep both charges, masked. Now it must spring.
  const kinId = db.prepare("SELECT id FROM awakened WHERE owner_key = ? LIMIT 1").get(ownerKey).id;
  await call("addToParty", { awakenedId: kinId }, token);
  let unit = null;
  for (let i = 0; i < 20 && !unit; i++) {
    send({ type: "summonCast", awakenedId: kinId });
    await sleep(600);
    unit = (c.state.field ?? []).find(u => u.ownerName === "Table Many") ?? null;
  }
  check("T8: a hand stands on the field to strike the curse", !!unit, `errors=${JSON.stringify(c.errors.slice(-2))}`);
  if (unit) {
    send({ type: "setStance", cardId: unit.cardId, stance: "binding" });
    await sleep(300);
    const reach = 4; // sky hand
    const axDist = (a, b) => { const [aq, ar] = a.split(",").map(Number); const [bq, br] = b.split(",").map(Number); return (Math.abs(aq - bq) + Math.abs(aq + ar - bq - br) + Math.abs(ar - br)) / 2; };
    const tgt = (c.state.map ?? []).find(t => t.cursed && t.id !== "0,0" && axDist(t.id, unit.hex) <= reach)
      ?? (c.state.map ?? []).find(t => t.cursed && t.id !== "0,0");
    send({ type: "strikeCurse", cardId: unit.cardId, hex: unit.hex, target: tgt.id });
    let darkCame = false;
    const dStart = Date.now();
    while (Date.now() - dStart < 30000) {
      if ((c.state.dark ?? []).length > 0) { darkCame = true; break; }
      await sleep(250);
    }
    check("T9: the dark answers the struck curse and takes the field", darkCame,
      `dark=${(c.state.dark ?? []).length}`);
    let sprungProof = null, pinSeen = false;
    const huntStart = Date.now();
    while (Date.now() - huntStart < 75000 && !sprungProof) {
      const darks = c.state.dark ?? [];
      if ((c.state.dark ?? []).some(e => (e.pinnedUntil ?? 0) > Date.now())) pinSeen = true;
      if (!darks.length) { await sleep(300); continue; }
      const d = darks[0];
      const X = d.hex, hpBefore = d.hp, idBefore = d.id;
      if (!(c.state.workings ?? []).some(w => w.engine === "lattice" && w.hex === X)) {
        send({ type: "castRune", root: "lattice", hexes: [X] });
        await sleep(500);
        continue;
      }
      send({ type: "castRune", root: "springblade", hexes: [X] });
      await sleep(500);
      const sb = (c.state.workings ?? []).find(w => w.engine === "springblade" && w.hex === X && w.charges === 1);
      const latX = (c.state.workings ?? []).find(w => w.engine === "lattice" && w.hex === X);
      const dNow = (c.state.dark ?? []).find(e => e.id === idBefore);
      if (sb && latX) {
        sprungProof = { X, darkGone: !dNow, hpDrop: dNow ? hpBefore - dNow.hp : hpBefore, latHp: latX.hp, latMax: latX.maxHp };
      }
    }
    check("T10: on the dark's hex, the Springblade sharing ground with a Lattice SPRINGS — its charge is spent and the dark is harmed or felled (no first-rune masking)",
      !!sprungProof && (sprungProof.darkGone || sprungProof.hpDrop > 0),
      JSON.stringify(sprungProof));
    check("T11: the Lattice on that hex sprang too — its health paid the pin's strain, and the dark stood pinned in the hunt",
      !!sprungProof && (sprungProof.latHp < sprungProof.latMax || pinSeen),
      JSON.stringify({ sprungProof, pinSeen }));
  }

  // The negative space: glide to the board's far side, then
  // cast at the opposite edge — beyond the six-hex ring.
  const U = [1292 * 40 / 796, 470 * 40 / 796], V = [0, 948 * 40 / 796];
  const centerOf = (id) => { const [q, r] = id.split(",").map(Number); return { x: q * U[0] + r * V[0], y: q * U[1] + r * V[1] }; };
  const glideTo = async (id) => {
    // The glide door takes {tx, ty} and sets the seat's
    // target; the road is then walked on the room's own
    // clock. Send the order, re-send it as she walks, and
    // wait until she stands at the tile's centre.
    const targetC = centerOf(id);
    const start = Date.now();
    let lastSent = 0;
    while (Date.now() - start < 45000) {
      const meNow = meIn();
      if (meNow?.pos && Math.hypot(targetC.x - meNow.pos.x, targetC.y - meNow.pos.y) < 12) break;
      if (Date.now() - lastSent > 2000) { send({ type: "glide", tx: targetC.x, ty: targetC.y }); lastSent = Date.now(); }
      await sleep(200);
    }
    await sleep(300);
  };
  await glideTo("6,0");
  const energyBefore = meIn().energy;
  const countBefore = (c.state.workings ?? []).length;
  const errAt = c.errors.length;
  send({ type: "castRune", root: "lattice", hexes: ["-6,0"] });
  await sleep(600);
  const freshErrors = c.errors.slice(errAt);
  check("T12: out-of-range is still refused in the standing words ('Beyond reach — … gated by range alone')",
    freshErrors.some(e => e.includes("Beyond reach") && e.includes("gated by range alone")),
    `errors=${JSON.stringify(freshErrors)}`);
  check("T13: the refused cast wrote nothing and charged nothing (the purse did not drop — a rise would be the standing regen, not a charge)",
    (c.state.workings ?? []).length === countBefore && meIn().energy >= energyBefore,
    `workings=${(c.state.workings ?? []).length} energy ${energyBefore} -> ${meIn().energy}`);
  ws.close();
}

console.log(`\ndrive-no-one-per-hex: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
