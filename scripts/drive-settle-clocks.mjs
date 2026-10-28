// FIX THE CLOCKS — drive (Nigel, 2026-10-28: "Fix the
// clocks — standing pays only for the time actually
// stood.") Boots the real server on a scratch DATA_DIR and
// proves, against the aspect_attunement pools, the
// field_placements cursors and the territory_tiles ledgers
// in the DB:
//   S1. A binder placed mid-window earns only its own span:
//       with the pools' checkpoint left 26 hours stale (the
//       old law's trap — it would have paid every standing
//       binder a capped 24 hours), a 2-hour binder earns ~2
//       and a 30-minute binder earns ~0.5.
//   S2. Departed spans are paid, at the departure itself:
//       a binder lifted into the party is paid its 3 hours
//       with the field already empty; two tab reads with
//       nobody standing move NOTHING (bit for bit); a binder
//       leaving the stance is paid its span and its next
//       binding starts fresh (no re-pay).
//   S3. The press pours a departed company's stood spans:
//       two binders are MOVED off a tile they stood on for
//       hours with no map read ever made — the move settles
//       the tile and their beats are in its ledger, poured,
//       not wiped.
//   S4. The press slices by who actually stood: a tile's
//       window pours the early hours for the early company
//       alone and the shared hour for both; reopening one
//       member's cursor pours ITS element only — hours
//       nobody stood pour nothing. A matching company grows
//       the tile's tray by the same measure.
//   S5. Shrine doubling still applies — to a binder's own
//       interval (2 hours beside a blessing shrine = ~4).
//   S6. The map-open channeling is folded into the time law
//       (the same ruling, its own commit): a map read pays
//       no point by itself — a binder standing 2 hours is
//       settled ~2 by the read, and a second read at once
//       pays ~nothing more.
// The sky is assumed calm (attunement rate multiplier 1 —
// thinning would double every accrual figure alike).
// Run: node scripts/drive-settle-clocks.mjs
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const OUT = "/home/hatch/workspace/settle-clocks-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(OUT, "data-"));
process.env.PORT = "39944";
process.env.WORKSHOP_PASSWORD = "settle-clocks-drive";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:39944";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const H = 3600 * 1000;

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

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
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }
const now = Date.now();

const claim = await call("claimTender", { password: "settle-clocks-password", tenderName: "Clocks Tender" });
const token = claim.token;
const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id}`;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, hp, updated_at) VALUES (?, 3800, 0, 100, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800, hp = 100").run(me, now);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at, last_seen_at) VALUES (?, 100000, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 100000").run(me, now, now);
// The choosing opens only after the first three wakes — seed them.
for (const wakeName of ["Clocks Wake One", "Clocks Wake Two", "Clocks Wake Three"]) {
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 3, 3, 'root', ?, 'image/png', ?)")
      .run(`${wakeName} ${cat}`, cat, `settle-clocks/${wakeName}-${cat}.png`, now).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${wakeName} ${cat}`, category: cat, rarity: "common", power: 3, toughness: 3, element: "root" });
  }
  db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(wakeName, wakeName, `settle-clocks/${wakeName}.png`, JSON.stringify(parts), "Clocks Tender", me, now);
}
await call("chooseClass", { classKey: "warden" }, token);

// The ground: heart (0,0) root · T1 (1,0) neutral · T2 (0,1)
// root · T3 (2,0) stone · T4 (1,-1) neutral · T5 (2,-1) neutral.
const seedTile = (q, r, element, extra = {}) => {
  const cols = { owner_key: me, q, r, element, cursed: 0, created_at: now, ...extra };
  const keys = Object.keys(cols);
  return Number(db.prepare(`INSERT INTO territory_tiles (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`).run(...keys.map((k) => cols[k])).lastInsertRowid);
};
const heartId = seedTile(0, 0, "root");
const t1 = seedTile(1, 0, "neutral");
const t2 = seedTile(0, 1, "root");
const t3 = seedTile(2, 0, "stone");
const t4 = seedTile(1, -1, "neutral");
const t5 = seedTile(2, -1, "neutral");

// An Awoken of three pieces of named elements (counts: one
// point per piece toward its element).
const makeAw = (name, els) => {
  const parts = [];
  ["body", "arms", "head"].forEach((cat, i) => {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 3, 3, ?, ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, els[i], `settle-clocks/${name}-${cat}.png`, now).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: 3, toughness: 3, element: els[i] });
  });
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `settle-clocks/${name}.png`, JSON.stringify(parts), "Clocks Tender", me, now).lastInsertRowid);
};
const awA = makeAw("Binder A", ["root", "root", "root"]);
const awB = makeAw("Binder B", ["tide", "tide", "tide"]);
const awC = makeAw("Binder C", ["sky", "sky", "sky"]);
const awE = makeAw("Binder E", ["stone", "stone", "stone"]);
const awF = makeAw("Binder F", ["root", "root", "root"]);
const awP1 = makeAw("Press One", ["root", "root", "root"]);
const awP2 = makeAw("Press Two", ["tide", "tide", "tide"]);
const awP3 = makeAw("Press Three", ["root", "root", "root"]);
const awG = makeAw("Binder G", ["tide", "tide", "tide"]);

const stand = (awakenedId, tileId, stance, placedMsAgo) => {
  const placed = Date.now() - placedMsAgo;
  return Number(db.prepare("INSERT INTO field_placements (owner_key, actor_key, awakened_id, tile_id, placed_at, last_moved_at, stance) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(me, me, awakenedId, tileId, placed, placed, stance).lastInsertRowid);
};
const placementOf = (awakenedId) => db.prepare("SELECT id, stance, bind_paid_at AS bindPaidAt, press_paid_at AS pressPaidAt FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(me, awakenedId);
const poolOf = (el) => db.prepare("SELECT points FROM aspect_attunement WHERE owner_key = ? AND element = ?").get(me, el)?.points ?? 0;
const mixOf = (tileId) => {
  const row = db.prepare("SELECT mix_points AS mix, grow_points AS grow FROM territory_tiles WHERE id = ?").get(tileId);
  return { ledger: row.mix ? JSON.parse(row.mix) : { sky: 0, stone: 0, tide: 0, root: 0 }, grow: row.grow ?? 0 };
};

// The pools stand with a checkpoint 26 hours stale — the
// old law's trap. Under the old read-clock the next tab
// read would pay every standing binder a capped 24 hours.
for (const el of ["root", "tide", "sky", "stone"]) {
  db.prepare("INSERT INTO aspect_attunement (owner_key, element, points, updated_at) VALUES (?, ?, 0, ?)").run(me, el, now - 26 * H);
}

// ═══ S1. Each binder earns only its own span ═══
const pA = stand(awA, t1, "binding", 2 * H);
const pB = stand(awB, t1, "binding", 0.5 * H);
void pA; void pB;
await call("getAspectAttunement", {}, token);
ok("S1: the 2-hour binder earns ~2 root (not the stale window's 24)", near(poolOf("root"), 2, 0.05), `root=${poolOf("root")}`);
ok("S1: the 30-minute binder earns ~0.5 tide (its own span only)", near(poolOf("tide"), 0.5, 0.05), `tide=${poolOf("tide")}`);
ok("S1: both bind cursors advanced to the settle", placementOf(awA).bindPaidAt > now - 60000 && placementOf(awB).bindPaidAt > now - 60000,
  `A=${placementOf(awA).bindPaidAt} B=${placementOf(awB).bindPaidAt}`);

// ═══ S2. Departed spans are paid at the departure ═══
// A and B leave the stance — their spans settle as they go.
await call("setStance", { awakenedId: awA, stance: "defense", maxEnergy: 100000 }, token);
await call("setStance", { awakenedId: awB, stance: "defense", maxEnergy: 100000 }, token);
ok("S2: leaving binding clears the bind cursor", placementOf(awA).bindPaidAt === null && placementOf(awB).bindPaidAt === null,
  `A=${placementOf(awA).bindPaidAt} B=${placementOf(awB).bindPaidAt}`);
// C stands binding for 3 hours, then is lifted into the
// party — a departure. Its span must be in the pools with
// the field already empty of it.
stand(awC, t3, "binding", 3 * H);
await call("addToParty", { awakenedId: awC }, token);
ok("S2: the lifted binder's 3 hours are paid at the lift (~3 sky)", near(poolOf("sky"), 3, 0.05), `sky=${poolOf("sky")}`);
ok("S2: the lifted binder is off the field", !placementOf(awC), JSON.stringify(placementOf(awC)));
// Two tab reads with NOBODY standing binding: bit for bit,
// nothing moves — nothing paid, nothing burned.
const snap1 = ["root", "tide", "sky", "stone"].map(poolOf);
await call("getAspectAttunement", {}, token);
await call("getAspectAttunement", {}, token);
const snap2 = ["root", "tide", "sky", "stone"].map(poolOf);
ok("S2: consecutive tab reads with nobody standing move nothing", JSON.stringify(snap1) === JSON.stringify(snap2), `${snap1} -> ${snap2}`);
// E: the stance road pays a departed span too, and a fresh
// binding starts a fresh span (no re-pay of the old one).
stand(awE, t3, "binding", 2 * H);
const stone0 = poolOf("stone");
await call("setStance", { awakenedId: awE, stance: "defense", maxEnergy: 100000 }, token);
ok("S2: leaving the stance pays the stood span (~2 stone)", near(poolOf("stone") - stone0, 2, 0.05), `delta=${poolOf("stone") - stone0}`);
await call("setStance", { awakenedId: awE, stance: "binding", maxEnergy: 100000 }, token);
const stone1 = poolOf("stone");
await call("setStance", { awakenedId: awE, stance: "defense", maxEnergy: 100000 }, token);
ok("S2: a fresh binding pays only its fresh span (~0)", poolOf("stone") - stone1 < 0.03, `delta=${poolOf("stone") - stone1}`);

// ═══ S5. Shrine doubling, on the binder's own interval ═══
db.prepare("INSERT INTO territory_buildings (owner_key, tile_id, building_type, status, mode, placed_at) VALUES (?, ?, 'attunement-shrine', 'active', 'blessing', ?)").run(me, t2, now);
stand(awF, t2, "binding", 2 * H);
const rootBeforeShrine = poolOf("root");
await call("getAspectAttunement", {}, token);
ok("S5: 2 hours beside a blessing shrine earn ~4 root (doubling on the interval)", near(poolOf("root") - rootBeforeShrine, 4, 0.08), `delta=${poolOf("root") - rootBeforeShrine}`);
await call("addToParty", { awakenedId: awF }, token);
ok("S5: the shrine binder departs clean", !placementOf(awF), "");

// ═══ S3. A departed company's press beats are poured ═══
// A (root, stood 2h+) and B (tide, stood 0.5h+) still stand
// on T1 in defense. NO map read has been made in this drive
// — under the old law their hours lived only in T1's
// anchor, and their leaving would wipe it unpaid. The moves
// settle the tile with them in the company.
await call("moveAwoken", { awakenedId: awA, tileId: heartId }, token);
await call("moveAwoken", { awakenedId: awB, tileId: t4 }, token);
const mT1 = mixOf(t1).ledger;
ok("S3: T1's ledger holds the departed company's poured beats (root ~1.13)", near(mT1.root ?? 0, 1.125, 0.06), `root=${mT1.root}`);
ok("S3: T1's ledger holds the shorter stand too (tide ~0.28)", near(mT1.tide ?? 0, 0.281, 0.05), `tide=${mT1.tide}`);
ok("S3: both movers stand on their new ground", placementOf(awA) && placementOf(awB) && db.prepare("SELECT tile_id AS t FROM field_placements WHERE id = ?").get(placementOf(awA).id).t === heartId, "");

// ═══ S4. The press slices by who actually stood ═══
const baseT1 = { ...mixOf(t1).ledger };
stand(awP1, t1, "defense", 4 * H);
stand(awP2, t1, "defense", 1 * H);
await call("getTerritory", {}, token);
const afterT1 = mixOf(t1).ledger;
ok("S4: the early hours pour for the early company alone, the shared hour for both (root +2.25)",
  near((afterT1.root ?? 0) - (baseT1.root ?? 0), 2.25, 0.03), `delta=${(afterT1.root ?? 0) - (baseT1.root ?? 0)}`);
ok("S4: the latecomer pours only its own hour (tide +0.5625)",
  near((afterT1.tide ?? 0) - (baseT1.tide ?? 0), 0.5625, 0.03), `delta=${(afterT1.tide ?? 0) - (baseT1.tide ?? 0)}`);
// Reopen P2's cursor by two hours (it stands two more —
// its placed_at walks back with its cursor: a span can
// never run from before the placement stood), and stand
// P3 on the root-labelled T2 for two hours: one read
// settles both tiles.
const p2row = placementOf(awP2);
db.prepare("UPDATE field_placements SET placed_at = placed_at - ?, press_paid_at = press_paid_at - ? WHERE id = ?").run(2 * H, 2 * H, p2row.id);
stand(awP3, t2, "defense", 2 * H);
const t1Before = mixOf(t1).ledger;
const t2Before = mixOf(t2);
await call("getTerritory", {}, token);
const t1After = mixOf(t1).ledger;
const t2After = mixOf(t2);
ok("S4: the reopened span pours its own element (tide +1.125)", near((t1After.tide ?? 0) - (t1Before.tide ?? 0), 1.125, 0.03), `delta=${(t1After.tide ?? 0) - (t1Before.tide ?? 0)}`);
ok("S4: hours nobody stood pour nothing (root unmoved on T1)", Math.abs((t1After.root ?? 0) - (t1Before.root ?? 0)) < 0.01, `delta=${(t1After.root ?? 0) - (t1Before.root ?? 0)}`);
ok("S4: T2's ledger takes P3's two hours (root +1.125)", near((t2After.ledger.root ?? 0) - (t2Before.ledger.root ?? 0), 1.125, 0.03), `delta=${(t2After.ledger.root ?? 0) - (t2Before.ledger.root ?? 0)}`);
ok("S4: T2's growing tray drinks the same measure (grow +1.125)", near(t2After.grow - t2Before.grow, 1.125, 0.03), `delta=${t2After.grow - t2Before.grow}`);

// ═══ S3b. The retired anchor: cleared, and nothing pours ═══
db.prepare("UPDATE territory_tiles SET mix_points = ?, attune_anchor_at = ? WHERE id = ?")
  .run(JSON.stringify({ sky: 0, stone: 0, tide: 0, root: 2 }), now - 5 * H, t5);
await call("getTerritory", {}, token);
const t5row = db.prepare("SELECT mix_points AS mix, attune_anchor_at AS anchor, grow_points AS grow FROM territory_tiles WHERE id = ?").get(t5);
ok("S3b: a company-less tile's stale anchor is retired", t5row.anchor === null, `anchor=${t5row.anchor}`);
ok("S3b: and nothing poured for its empty hours (ledger and tray untouched)",
  t5row.mix === JSON.stringify({ sky: 0, stone: 0, tide: 0, root: 2 }) && (t5row.grow ?? 0) === 0, `mix=${t5row.mix} grow=${t5row.grow}`);

// ═══ S6. The map read pays no point by itself ═══
stand(awG, t3, "binding", 2 * H);
const tideBeforeMap = poolOf("tide");
await call("getTerritory", {}, token);
const tideAfterOne = poolOf("tide");
ok("S6: one map read settles the binder's interval (~2 tide for 2 hours stood — not 1 point for the read)",
  near(tideAfterOne - tideBeforeMap, 2, 0.06), `delta=${tideAfterOne - tideBeforeMap}`);
await call("getTerritory", {}, token);
ok("S6: a second map read at once pays ~nothing (no per-read point)", poolOf("tide") - tideAfterOne < 0.03, `delta=${poolOf("tide") - tideAfterOne}`);

console.log(`\nDRIVE (FIX THE CLOCKS — standing pays only for the time actually stood): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
