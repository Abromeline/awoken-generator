// JOINING TAKES A MEMBER OFF THE FIELD — THE JOIN LAW'S
// DRIVE (Nigel, 2026-10-23: "if a member is on the field
// when they join party take them off of the field").
// Boots the real server in-process on a scratch DATA_DIR
// and proves the law end to end against the real doors:
//   §1 a member stands summoned on the field — the wheel's
//      company (served with the territory) does NOT list
//      it, while a home member stands listed.
//   §2 the member is benched (its placement survives the
//      bench — benching alone lifts nothing), a fielded
//      NON-member stands seeded beside the story, and the
//      member JOINS again by the Party tab's road: the
//      placement row is GONE, dispersed_until untouched
//      (a join is not a fall), no energy spent, and the
//      non-member's placement stands untouched.
//   §3 the wheel's company now LISTS the member, and a
//      summonAwoken cast lands it at the Tender's side.
//   §4 the field wheel's own door (addFieldToParty): the
//      fielded non-member joins — and comes off the field
//      in the same act.
// CONTROLS: a member who was never fielded joins with no
// placement change anywhere (§2's home member), and one
// creature's join never touches another's placement (§2).
// Run: node scripts/drive-party-join-field.mjs
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-joinfield-"));
process.env.PORT = "3989";
process.env.WORKSHOP_PASSWORD = "joinfield-drive-password";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3989";
const PW = "joinfield-drive-password";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

await import("../server/dist/index.js");
await sleep(2500);

async function call(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return data?.data ?? data;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
// Fresh-DB stand-up, as the other drives do.
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }

const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

function seedAwokin(ownerKey, tenderName, name, partPower = 1) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, 'root', ?, 'image/png', ?)")
      .run(`${name} ${cat}`, cat, partPower, partPower, `joinfield/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: partPower, toughness: partPower, element: "root" });
  }
  return Number(db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', ?, ?, ?)")
    .run(name, name, `joinfield/${name}.png`, JSON.stringify(parts), tenderName, ownerKey, nowT).lastInsertRowid);
}
async function claimWithExp(name, exp) {
  const claim = await call("claimTender", { password: PW, tenderName: name });
  const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id;
  const ownerKey = `tender:${tenderId}`;
  db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = excluded.total_exp").run(ownerKey, exp, Date.now());
  return { token: claim.token, ownerKey };
}
const placedOf = (ownerKey, id) => db.prepare("SELECT COUNT(*) AS n FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(ownerKey, id).n;
const dispersedOf = (id) => db.prepare("SELECT dispersed_until AS d FROM awakened WHERE id = ?").get(id)?.d ?? null;
const energyOf = (ownerKey) => db.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(ownerKey).energy;
const partyRows = (ownerKey) => db.prepare("SELECT awakened_id FROM tender_party WHERE owner_key = ? ORDER BY awakened_id").all(ownerKey).map(r => r.awakened_id);

/* ── THE STAGE ────────────────────────────────────────── */
console.log("§0 the stage — a tender, three Awokin, home ground");
const T = await claimWithExp("Join Tender", 0);
// The class is written directly — classes wake at Lv 3 by
// the choosing door, and the summon cast needs the stand
// only (the homeland-summon drive's own stand-up).
db.prepare("UPDATE tender_progress SET class_key = 'warden' WHERE owner_key = ?").run(T.ownerKey);
const F = seedAwokin(T.ownerKey, "Join Tender", "Fieldjoin");   // the joining member
const G = seedAwokin(T.ownerKey, "Join Tender", "Homebody");    // the control member — never fielded
const H = seedAwokin(T.ownerKey, "Join Tender", "Outstander");  // the fielded non-member
const now = Date.now();
const insTile = db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, ?, ?, 'root', 0, ?)");
const tileAt = new Map();
for (const [q, r] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, -1], [-1, 1]]) {
  const id = Number(insTile.run(T.ownerKey, q, r, now).lastInsertRowid);
  tileAt.set(id, { q, r });
}
const heart = [...tileAt.entries()].find(([, t]) => t.q === 0 && t.r === 0)[0];
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 400, ?)").run(T.ownerKey, now);
const companyIds = async () => ((await call("getTerritory", {}, T.token)).summoning?.company ?? []).map(c => c.awakenedId);

await call("addToParty", { awakenedId: F }, T.token);
await call("addToParty", { awakenedId: G }, T.token);
ok("both members stand in the party", partyRows(T.ownerKey).join(",") === [F, G].sort((a, b) => a - b).join(","));

/* ── §1 FIELDED, THE WHEEL CANNOT CALL IT ─────────────── */
console.log("§1 the member stands on the field — the wheel's company cannot call it");
let landed = null;
for (let attempts = 0; attempts < 20 && !landed; attempts++) {
  const r = await call("summonAwoken", { awakenedId: F }, T.token);
  if (r.summoned) landed = r;
}
ok("the member is summoned onto the field by the cast", !!landed && placedOf(T.ownerKey, F) === 1, `placed ${placedOf(T.ownerKey, F)}`);
{
  const company = await companyIds();
  ok("the wheel's company does NOT list the fielded member", !company.includes(F), JSON.stringify(company));
  ok("the wheel's company DOES list the home member — the list itself is sound", company.includes(G), JSON.stringify(company));
}

/* ── §2 THE JOIN TAKES IT OFF THE FIELD ───────────────── */
console.log("§2 benched, then joined again — the join takes it off the field");
await call("removeFromParty", { awakenedId: F }, T.token);
ok("benching alone lifts nothing — the placement survives the bench",
  placedOf(T.ownerKey, F) === 1 && !partyRows(T.ownerKey).includes(F));
// The fielded non-member, seeded onto the field by hand
// (the party drive's own idiom) as the control bystander.
db.prepare("INSERT INTO field_placements (owner_key, awakened_id, tile_id, placed_at, last_moved_at, hp) VALUES (?, ?, ?, ?, ?, 30)")
  .run(T.ownerKey, H, heart, now, now);
ok("the fielded non-member stands placed", placedOf(T.ownerKey, H) === 1);

const energyBefore = energyOf(T.ownerKey);
await call("addToParty", { awakenedId: F }, T.token);
ok("the join writes the membership", partyRows(T.ownerKey).includes(F));
ok("the placement row is GONE — the join took it off the field", placedOf(T.ownerKey, F) === 0);
ok("no fall was written — dispersed_until stands untouched (null)",
  dispersedOf(F) === null, String(dispersedOf(F)));
ok("the join cost no energy", energyOf(T.ownerKey) === energyBefore, `${energyBefore} -> ${energyOf(T.ownerKey)}`);
ok("CONTROL: the fielded non-member's placement stands untouched by another's join",
  placedOf(T.ownerKey, H) === 1);
ok("CONTROL: the never-fielded member's join changed no placement anywhere",
  placedOf(T.ownerKey, G) === 0 && placedOf(T.ownerKey, H) === 1 && partyRows(T.ownerKey).includes(G));

/* ── §3 CALLABLE AGAIN — THE CAST LANDS IT ────────────── */
console.log("§3 the wheel lists it again, and the cast lands it at the Tender's side");
{
  const company = await companyIds();
  ok("the wheel's company now LISTS the member", company.includes(F), JSON.stringify(company));
}
landed = null;
for (let attempts = 0; attempts < 20 && !landed; attempts++) {
  const r = await call("summonAwoken", { awakenedId: F }, T.token);
  if (r.summoned) landed = r;
}
ok("a summonAwoken cast lands it again", !!landed && placedOf(T.ownerKey, F) === 1, `placed ${placedOf(T.ownerKey, F)}`);
{
  const terr = await call("getTerritory", {}, T.token);
  const row = db.prepare("SELECT tile_id AS t FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(T.ownerKey, F);
  const standTile = tileAt.get(terr.tender?.tileId);
  const landTile = row && tileAt.get(row.t);
  ok("the landing stands at the Tender's side — his tile or one beside it",
    !!standTile && !!landTile && hexDist(standTile, landTile) <= 1,
    `stand ${JSON.stringify(standTile)}, landed ${JSON.stringify(landTile)}`);
}

/* ── §4 THE FIELD WHEEL'S OWN DOOR ────────────────────── */
console.log("§4 addFieldToParty — the joining figure comes off the field in the same act");
{
  const v = await call("addFieldToParty", { awakenedId: H }, T.token);
  ok("the field door writes the membership", partyRows(T.ownerKey).includes(H) && v.members.some(m => m.awakenedId === H));
  ok("the field door's answer names the lifting", v.cameOffField === true, JSON.stringify(v.cameOffField));
  ok("its placement is GONE — it came off the field as it joined", placedOf(T.ownerKey, H) === 0);
  ok("and no fall was written for it either", dispersedOf(H) === null, String(dispersedOf(H)));
}

console.log(`\nJOIN-FIELD DRIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
