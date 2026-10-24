// THE ATTUNE ABILITY ON THE HOMELAND — drive (Nigel,
// 2026-10-21: "the tender can use the attune ability to
// make attunement faster or instant if they have enough
// elemental energysaved"). Boots the real server on a
// scratch DATA_DIR and proves, against the territory_tiles
// rows and the aspect_attunement ledger in the DB:
//   A. One spend = exactly one pool point out, exactly one
//      point into the bank of the tile the Tender stands
//      on — the same bank the standing press pours into,
//      under the same witness rule (a fresh bank stops at
//      9; the tenth spend completes the stage).
//   B. Ten spends turn bare NEUTRAL ground to the spent
//      element outright (one stage); the eleventh, landing
//      on ground that now holds the spent element, also
//      feeds the growing tray, as a matching standing
//      press point does.
//   C. Refusals spend nothing and lay nothing: an empty
//      pool, cursed ground beneath him, a work rising on
//      the ground, baked ground — and no login at all.
//   D. The reckoning the act writes is the reckoning the
//      land itself serves back on getTerritory.
//   E. THE WHEEL DOOR'S SHAPE (the Attune Ability build,
//      2026-10-21): the act names its tile — a ring-1 tile
//      takes the point from his stand; a ring-2 tile is
//      refused by the RANGE (his hex and its ring, plus
//      the zodiac's attunement-reach bonus — the reader
//      stands now, no stars carry it yet) and spends
//      nothing; ground his own RUNE stands on takes the
//      point into the same bank and the answer names the
//      rune; a tile that is not his is refused at the
//      door.
// Run: node scripts/drive-homeland-attune.mjs
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const OUT = "/home/hatch/workspace/homeland-attune-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(OUT, "data-"));
process.env.PORT = "3953";
process.env.WORKSHOP_PASSWORD = "homeland-attune-drive";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3953";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

await import("../server/dist/index.js");
await sleep(2500);

async function callRaw(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
async function call(action, args, token) {
  const { status, data } = await callRaw(action, args, token);
  if (status >= 300) throw new Error(`${action} -> ${status}: ${JSON.stringify(data)}`);
  return data;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
// Fresh-DB migration-order defect (named in earlier drives):
// stand the greeter column up so drizzle selects do not throw.
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }
const now = Date.now();

const claim = await call("claimTender", { password: "homeland-attune-password", tenderName: "Attune Tender" });
const token = claim.token;
const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id}`;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, hp, updated_at) VALUES (?, 3800, 0, 100, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800, hp = 100").run(me, now);
// FIXTURE REPAIR (2026-10-24, the no-hex-lock build): the
// choosing now opens only after the first three wakes
// (landed after this drive was written) — seed them first.
for (const wakeName of ["Attune Wake One", "Attune Wake Two", "Attune Wake Three"]) {
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 3, 3, 'root', ?, 'image/png', ?)")
      .run(`${wakeName} ${cat}`, cat, `homeland-attune/${wakeName}-${cat}.png`, now).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${wakeName} ${cat}`, category: cat, rarity: "common", power: 3, toughness: 3, element: "root" });
  }
  db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(wakeName, wakeName, `homeland-attune/${wakeName}.png`, JSON.stringify(parts), "Attune Tender", me, now);
}
await call("chooseClass", { classKey: "warden" }, token);

// The ground: a small hand-seeded territory around the heart.
// (0,0) root heart · (1,0) bare NEUTRAL — the turning proof ·
// (1,-1) cursed fire · (2,-1) stone with a work at stage 2 ·
// (0,1) root baked sealed.
const seedTile = (q, r, element, cursed, extra = {}) => {
  const cols = { owner_key: me, q, r, element, cursed, created_at: now, ...extra };
  const keys = Object.keys(cols);
  const id = Number(db.prepare(`INSERT INTO territory_tiles (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`).run(...keys.map((k) => cols[k])).lastInsertRowid);
  return id;
};
const heartId = seedTile(0, 0, "root", 0);
const neutralId = seedTile(1, 0, "neutral", 0);
const cursedId = seedTile(1, -1, "fire", 1);
const buildId = seedTile(2, -1, "stone", 0, { build_stage: 2, build_points: 40 });
const bakedId = seedTile(0, 1, "root", 0, { build_stage: 5, build_finish: "bake", baked: 1 });
const farId = seedTile(2, 0, "stone", 0);
void cursedId; void buildId; void bakedId;

db.prepare("INSERT INTO aspect_attunement (owner_key, element, points, updated_at) VALUES (?, 'root', 25, ?), (?, 'sky', 3, ?)").run(me, now, me, now);

const poolOf = (el) => db.prepare("SELECT points FROM aspect_attunement WHERE owner_key = ? AND element = ?").get(me, el)?.points ?? 0;
const tileRow = (id) => db.prepare("SELECT element, attune_element AS attuneElement, attune_points AS attunePoints, grow_points AS growPoints, sealed_trays AS sealedTrays FROM territory_tiles WHERE id = ?").get(id);
const standOn = async (tileId) => { await call("setTenderTile", { tileId }, token); };

// ═══ A + B. Spends on bare neutral ground ═══
await standOn(neutralId);
ok("the Tender stands on the bare neutral tile", db.prepare("SELECT tender_tile_id AS t FROM tender_progress WHERE owner_key = ?").get(me).t === neutralId);
const r1 = await call("attuneTile", { element: "root" }, token);
ok("one spend: the act answers for the tile he stands on", r1.ok === true && r1.tileId === neutralId, JSON.stringify(r1));
ok("one spend: the root pool paid exactly 1 (25 -> 24)", poolOf("root") === 24 && r1.pool === 24, `pool=${poolOf("root")}`);
ok("one spend: the tile's bank holds exactly 1 root point", tileRow(neutralId).attuneElement === "root" && tileRow(neutralId).attunePoints === 1, JSON.stringify(tileRow(neutralId)));
ok("one spend: the ground still holds neutral (a point is not a turning)", tileRow(neutralId).element === "neutral", tileRow(neutralId).element);

for (let i = 0; i < 8; i++) await call("attuneTile", { element: "root" }, token);
ok("nine spends in: the bank stands at 9 (the witness rule caps a fresh bank at 9)", tileRow(neutralId).attunePoints === 9 && tileRow(neutralId).element === "neutral", JSON.stringify(tileRow(neutralId)));
ok("nine spends in: the pool paid exactly 9 in all (25 -> 16)", poolOf("root") === 16, `pool=${poolOf("root")}`);

const r10 = await call("attuneTile", { element: "root" }, token);
ok("the tenth spend completes the stage: the ground TURNS to root", r10.turned === true && tileRow(neutralId).element === "root" && tileRow(neutralId).attunePoints === 0, JSON.stringify(tileRow(neutralId)));
ok("the tenth spend: the pool paid exactly 10 in all (25 -> 15)", poolOf("root") === 15, `pool=${poolOf("root")}`);

// The eleventh: a rival point banks without turning; a
// matching point then feeds bank AND tray, as the press does.
const rSky = await call("attuneTile", { element: "sky" }, token);
ok("a rival sky point banks beside the turned ground (bank sky 1, ground still root)", rSky.attuneElement === "sky" && rSky.attunePoints === 1 && tileRow(neutralId).element === "root", JSON.stringify(tileRow(neutralId)));
ok("the sky pool paid exactly 1 (3 -> 2)", poolOf("sky") === 2, `pool=${poolOf("sky")}`);
const rMatch = await call("attuneTile", { element: "root" }, token);
ok("a matching root point: the bank takes root again (bank root 1)", tileRow(neutralId).attuneElement === "root" && tileRow(neutralId).attunePoints === 1, JSON.stringify(tileRow(neutralId)));
ok("a matching root point also feeds the growing tray (grow 0 -> 1), as a standing press point does", tileRow(neutralId).growPoints === 1 && rMatch.growPoints === 1, JSON.stringify(tileRow(neutralId)));
ok("the root pool paid for it exactly (15 -> 14)", poolOf("root") === 14, `pool=${poolOf("root")}`);

// ═══ D. The land serves the same reckoning back ═══
const terr = await call("getTerritory", {}, token);
const served = (terr.tiles ?? []).find((t) => t.id === neutralId);
ok("getTerritory serves the turned tile as root, bank root 1, tray growing 1", !!served && served.element === "root" && served.attuneElement === "root" && Math.floor(served.attunePoints) === 1 && Math.floor(served.growPoints ?? 0) === 1, served && JSON.stringify({ el: served.element, bank: served.attuneElement, pts: served.attunePoints, grow: served.growPoints }));

// ═══ C. Refusals — each spends nothing, lays nothing ═══
const poolsBefore = { root: poolOf("root"), sky: poolOf("sky") };
const bankBefore = JSON.stringify(tileRow(neutralId));

// C1: an empty pool (the Tender holds no fire at all).
const e1 = await callRaw("attuneTile", { element: "fire" }, token);
ok("an empty pool is refused, naming what the pool holds", e1.status === 400 && String(e1.data.error ?? "").includes("your fire pool holds 0"), `${e1.status} ${JSON.stringify(e1.data)}`);

// C2: cursed ground beneath him.
await standOn(cursedId);
const e2 = await callRaw("attuneTile", { element: "root" }, token);
ok("cursed ground is refused plainly", e2.status === 400 && String(e2.data.error ?? "").includes("still cursed"), `${e2.status} ${JSON.stringify(e2.data)}`);
ok("the cursed tile's bank stayed empty", (tileRow(cursedId).attunePoints ?? 0) === 0 && tileRow(cursedId).attuneElement === null, JSON.stringify(tileRow(cursedId)));

// C3: a work rising on the ground (stage 2 — ground he may
// stand on, but its pours are the builder's).
await standOn(buildId);
const e3 = await callRaw("attuneTile", { element: "root" }, token);
ok("ground with a work rising is refused", e3.status === 400 && String(e3.data.error ?? "").includes("work is rising"), `${e3.status} ${JSON.stringify(e3.data)}`);

// C4: baked ground.
await standOn(bakedId);
const e4 = await callRaw("attuneTile", { element: "root" }, token);
ok("baked ground is refused", e4.status === 400 && String(e4.data.error ?? "").includes("baked sealed"), `${e4.status} ${JSON.stringify(e4.data)}`);

// C5: no login at all.
const e5 = await callRaw("attuneTile", { element: "root" }, null);
ok("an unclaimed hand is refused at the door", e5.status === 403, `${e5.status}`);

ok("every refusal spent NOTHING (pools read as before)", poolOf("root") === poolsBefore.root && poolOf("sky") === poolsBefore.sky, `root ${poolsBefore.root}->${poolOf("root")}, sky ${poolsBefore.sky}->${poolOf("sky")}`);
ok("every refusal laid NOTHING (the turned tile's reckoning is untouched)", JSON.stringify(tileRow(neutralId)) === bankBefore, `${bankBefore} -> ${JSON.stringify(tileRow(neutralId))}`);

// ═══ E. The wheel door's shape: named tiles, the range,
// a rune's ground ═══
await standOn(heartId);
const eRoot0 = poolOf("root");
const bankN0 = tileRow(neutralId);

// E1: a named ring-1 tile takes the point from his stand.
const g1 = await call("attuneTile", { element: "root", tileId: neutralId }, token);
ok("a named ring-1 tile: the act answers for THAT tile", g1.ok === true && g1.tileId === neutralId, JSON.stringify(g1));
ok("a named ring-1 tile: its bank took exactly 1 more root point", tileRow(neutralId).attuneElement === "root" && tileRow(neutralId).attunePoints === bankN0.attunePoints + 1, `${JSON.stringify(bankN0)} -> ${JSON.stringify(tileRow(neutralId))}`);
ok("a named ring-1 tile: the pool paid exactly 1", poolOf("root") === eRoot0 - 1, `root ${eRoot0} -> ${poolOf("root")}`);
ok("a named ring-1 tile with no working on it names none", g1.working === null, JSON.stringify(g1.working));

// E2: a named ring-2 tile is refused by the range alone
// (plain stone, unbuilt, unbaked — only distance speaks).
const g2 = await callRaw("attuneTile", { element: "root", tileId: farId }, token);
ok("a named ring-2 tile is refused by the range, in plain words", g2.status === 400 && String(g2.data.error ?? "").includes("beyond your attuning reach"), `${g2.status} ${JSON.stringify(g2.data)}`);
ok("the range refusal spent nothing and laid nothing", poolOf("root") === eRoot0 - 1 && (tileRow(farId).attunePoints ?? 0) === 0 && tileRow(farId).attuneElement === null, `pool=${poolOf("root")} far=${JSON.stringify(tileRow(farId))}`);

// E3: a tile that is not his at all is refused at the door.
const g3 = await callRaw("attuneTile", { element: "root", tileId: 999999 }, token);
ok("a tile that is not his is refused", g3.status === 400 && String(g3.data.error ?? "").includes("not yours to attune"), `${g3.status} ${JSON.stringify(g3.data)}`);
ok("the not-his refusal spent nothing", poolOf("root") === eRoot0 - 1, `root=${poolOf("root")}`);

// E4: his own RUNE stands on the neutral tile (written the
// way castMapWorking writes it) — a spend naming that
// ground pours into the same bank, and the answer names
// the rune.
db.prepare(`INSERT INTO territory_workings
  (owner_key, spell_key, engine, kind, hue, tile_id, edge_key, q, r, dir, nums, hp, stops, charges, pour, max_hp, created_at)
  VALUES (?, 'blade', 'blade', 'rune', 'root', ?, NULL, 1, 0, NULL, '{}', 0, 0, 2, 0, 0, ?)`).run(me, neutralId, now);
const bankN1 = tileRow(neutralId);
const g4 = await call("attuneTile", { element: "root", tileId: neutralId }, token);
ok("a rune's ground: the answer NAMES the working attuned", g4.working === "The Single Blade", JSON.stringify(g4.working));
ok("a rune's ground: the point poured into the tile's bank all the same", tileRow(neutralId).attuneElement === "root" && tileRow(neutralId).attunePoints === bankN1.attunePoints + 1, `${JSON.stringify(bankN1)} -> ${JSON.stringify(tileRow(neutralId))}`);
ok("a rune's ground: the pool paid exactly 1", poolOf("root") === eRoot0 - 2, `root ${eRoot0} -> ${poolOf("root")}`);

// The reach reader on this ground too: no stars carry the
// clause yet, so the homeland's reach stands at its ring.
const { attuneReachFor } = await import("../server/dist/skills.js");
ok("the reach reader returns 0 (no stars carry attuneReach yet)", attuneReachFor(me) === 0 && attuneReachFor(null) === 0, String(attuneReachFor(me)));

console.log(`\nDRIVE (the Attune ability on the homeland): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
