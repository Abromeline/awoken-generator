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
void heartId; void cursedId; void buildId; void bakedId;

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

console.log(`\nDRIVE (the Attune ability on the homeland): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
