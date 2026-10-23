// THE TENDER'S BODY ON THE HOMELAND (Nigel, 2026-10-19): the
// Class Gate hides him until he chooses; the bastion rule plants
// his first stand; his anchor follows where he walks; a following
// Awokin musters to his ring on read. (test50)
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-stand-"));
process.env.PORT = "39974";
process.env.WORKSHOP_PASSWORD = "stand-word";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
await import("../server/dist/index.js");
await new Promise(r => setTimeout(r, 2500));
const base = "http://127.0.0.1:39974";
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log("  ok -", name); } else { fail++; console.log("  FAIL -", name); } };
let workshopToken = null;
async function call(action, args, token, expectFail = false) {
  const res = await fetch(`${base}/api/${action}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}), ...(workshopToken ? { "x-workshop-token": workshopToken } : {}) }, body: JSON.stringify(args) });
  const data = await res.json().catch(() => ({}));
  if (!expectFail && !res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return { status: res.status, data };
}
const db = new Database(join(process.env.DATA_DIR, "app.db"));

// A tender claims, chooses nothing yet.
const claim = await call("claimTender", { password: "stand-password-1", tenderName: "Stand Tender" });
const token = claim.data.token;
const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.data.tender.code).id}`;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 200, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 200").run(me, Date.now());

// His land: a cursed heart ringed by pure ground, a pure corridor east.
const tile = (q, r, cursed) => db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, ?, ?, ?, ?)").run(me, q, r, cursed, Date.now()).lastInsertRowid;
const heart = tile(0, 0, 1);
const p10 = tile(1, 0, 0), p01 = tile(0, 1, 0), p20 = tile(2, 0, 0), p30 = tile(3, 0, 0), p31 = tile(3, 1, 0);

// 1. Classless: no stand at all.
let t = (await call("getTerritory", {}, token)).data;
ok("classless: the Tender has no stand", t.tender === null);

// 2. He chooses (Sage) — the stand appears by the bastion rule:
//    heart cursed, so the first pure ring hex holds him.
await call("chooseClass", { classKey: "sage" }, token);
t = (await call("getTerritory", {}, token)).data;
ok("classed: the stand appears", !!t.tender && t.tender.classKey === "sage");
ok("the bastion rule plants him on pure ring ground", t.tender && [p10, p01].includes(t.tender.tileId));

// 3. The anchor follows his walk, and the stored anchor wins after.
const mv = await call("setTenderTile", { tileId: Number(p30) }, token);
ok("setTenderTile answers ok", mv.data.ok === true);
t = (await call("getTerritory", {}, token)).data;
ok("the stand now reads the walked-to hex", t.tender && t.tender.tileId === Number(p30));

// 4. Refusals: a stranger's hex, and a visitor's hand.
const bad = await call("setTenderTile", { tileId: 999999 }, token, true);
ok("a hex that is not his is refused", bad.status >= 400);
const anon = await call("setTenderTile", { tileId: Number(p10) }, undefined, true);
ok("a visitor cannot move the Tender", anon.status === 403);

// 5. A follower musters: a creature woken from an uploaded piece,
//    stationed far west, ordered to follow.
const nowMs = Date.now();
const pieceId = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES ('Muster Shell', 'body', 'common', 1, 2, 'root', 'test/shell.png', 'image/png', ?)").run(nowMs).lastInsertRowid);
ok("a piece stands in the pool for the waking", pieceId > 0);
const composition = JSON.stringify([{ source_id: `db:${pieceId}`, name: "Muster Shell", category: "body", rarity: "common", power: 1, toughness: 2, element: "root" }]);
const awId = Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES ('Muster One', 'Muster One', 'test/one.png', ?, 'tender', 'Stand Tender', ?, ?)").run(composition, me, nowMs).lastInsertRowid);
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 100, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = excluded.energy").run(me, nowMs);
// Seeded straight onto the field: this section's subject is
// the muster, not the fielding road (the hand's deploy road
// was retired 2026-10-22 — summoning rides the wheel's cast,
// which lands at the Tender's side, never far west).
db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, hp) VALUES (?, ?, ?, ?, ?, 30)").run(me, awId, Number(p01), nowMs, nowMs);
t = (await call("getTerritory", {}, token)).data;
const placement = t.placements.find(p => p.awakenedId === awId);
ok("the creature stands far from the Tender", !!placement && placement.tileId === Number(p01));
ok("follow starts lifted (0)", placement && (placement.follow ?? 0) === 0);

const fol = await call("setPlacementFollow", { placementId: placement.id, follow: true }, token);
ok("the follow order is given", fol.data.ok === true && fol.data.follow === true);
t = (await call("getTerritory", {}, token)).data;
const after = t.placements.find(p => p.awakenedId === awId);
ok("the follow flag rides the field", after && after.follow === 1);
let road = null;
try { road = JSON.parse(after.marchPath); } catch { /* stays null */ }
ok("the muster march is written on read", Array.isArray(road) && road.length >= 2);
ok("the march ends on the Tender's ring", Array.isArray(road) && [Number(p30), Number(p20), Number(p31)].includes(road[road.length - 1]));
ok("the march is timed", after && after.marchEnds > after.marchSince);

// 6. Lifting the order stops future musters once it arrives home:
//    (the written march completes on its own law; the flag is off)
const lift = await call("setPlacementFollow", { placementId: placement.id, follow: false }, token);
ok("the order lifts", lift.data.ok === true && lift.data.follow === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
