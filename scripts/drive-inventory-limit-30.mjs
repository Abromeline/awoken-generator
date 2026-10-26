// THE INVENTORY LIMIT drive (Nigel's ruling, 2026-10-26:
// "increase item limit to 30"). Boots the real server on
// a scratch DATA_DIR and proves the raised kinds cap at
// the real claim door (claimPackDrop), on sculpted
// shelves — the inventory rows and Pack entries are laid
// in the tables' own shapes; every claim itself rides
// the served road:
//   §T THE NEW BOUNDARY — a Tender holding 29 kinds
//      claims a 30th kind and it LANDS; a 31st kind does
//      not land — it waits in the Pack and the claim
//      answers in the standing spoken line ("…thirty
//      stacks are all it holds."); a kind already held
//      still grows in quantity at 30 kinds (the kinds
//      cap is not a quantity cap).
//   §T2 THE OLD BOUNDARY IS GONE — a Tender holding 15
//      kinds (the whole of the old law) claims a 16th
//      and it lands.
// Run: node scripts/drive-inventory-limit-30.mjs
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const OUT = "/home/hatch/workspace/inventory-limit-30-proof";
mkdirSync(OUT, { recursive: true });
process.env.DATA_DIR = mkdtempSync(join(OUT, "data-"));
process.env.PORT = "3961";
process.env.WORKSHOP_PASSWORD = "<MASKED_SECRET_002>";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;
process.chdir(new URL("..", import.meta.url).pathname);
const BASE = "http://127.0.0.1:3961";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

const drops = await import("../server/dist/drops.js");
await import("../server/dist/index.js");
await sleep(2500);

async function call(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

const db = new Database(join(process.env.DATA_DIR, "app.db"));
try { db.exec("ALTER TABLE awakened ADD COLUMN greeter INTEGER NOT NULL DEFAULT 0"); } catch { /* already there */ }

const invRows = (ownerKey) => db.prepare("SELECT item_key AS key, qty FROM tender_inventory WHERE owner_key = ? AND qty > 0").all(ownerKey);
const kindCount = (ownerKey) => invRows(ownerKey).length;
const qtyOf = (ownerKey, key) => (db.prepare("SELECT qty FROM tender_inventory WHERE owner_key = ? AND item_key = ?").get(ownerKey, key)?.qty) ?? 0;
const packRows = (ownerKey) => db.prepare("SELECT id, kind, item_key AS itemKey, element, qty FROM tender_pack WHERE owner_key = ?").all(ownerKey);
const layStack = (ownerKey, key, qty) => db.prepare("INSERT INTO tender_inventory (owner_key, item_key, qty, updated_at) VALUES (?, ?, ?, ?)").run(ownerKey, key, qty, Date.now());
const layPackItem = (ownerKey, key, qty) => db.prepare("INSERT INTO tender_pack (owner_key, kind, item_key, element, qty, created_at) VALUES (?, 'item', ?, NULL, ?, ?)").run(ownerKey, key, qty, Date.now());

const REAGENT_KEYS = ["dream-shroom", "ember-ash", "fray-ash", "hollow-silk", "moon-petal", "root-sap", "shadow-matter", "sky-salt", "star-seed", "stone-dust", "tidewater"].map(k => `reagent:${k}`);
const RELIC_KEYS = ["tenderHp", "heal", "tableEnergy", "company", "party", "attunement", "fellHarvest", "roundEnergy", "roundMend", "tenderSkin", "firstWorkingDiscount", "tenderAc", "tenderAb", "awokinAc", "awokinAb", "awokinRegen", "buildSpeed", "plantGrowth", "attunementRate"].map(v => `relic:${v}`);

async function makeTender(name) {
  const claim = await call("claimTender", { password: "<MASKED_SECRET_001>", tenderName: name });
  const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.tender.code).id}`;
  return { token: claim.token, me };
}

ok("the built module carries the raised cap (INVENTORY_STACK_KINDS = 30)", drops.INVENTORY_STACK_KINDS === 30, `got ${drops.INVENTORY_STACK_KINDS}`);
ok("the per-stack cap stands untouched (INVENTORY_STACK_CAP = 100)", drops.INVENTORY_STACK_CAP === 100, `got ${drops.INVENTORY_STACK_CAP}`);

/* ── §T THE NEW BOUNDARY ──────────────────────────────── */
{
  console.log("§T twenty-nine kinds held — the 30th lands, the 31st waits");
  const { token, me } = await makeTender("Boundary Tender");
  layStack(me, "rune-shard", 10);
  for (const k of REAGENT_KEYS) layStack(me, k, 1);
  for (const k of RELIC_KEYS.slice(0, 17)) layStack(me, k, 1);
  ok("the shelf is sculpted to 29 kinds", kindCount(me) === 29, `kinds ${kindCount(me)}`);

  layPackItem(me, RELIC_KEYS[17], 3); // the 30th kind waits in the Pack
  layPackItem(me, RELIC_KEYS[18], 2); // the 31st kind waits behind it
  layPackItem(me, "rune-shard", 5);   // more of a kind already held
  const pack = packRows(me);
  const entry30 = pack.find(e => e.itemKey === RELIC_KEYS[17]);
  const entry31 = pack.find(e => e.itemKey === RELIC_KEYS[18]);
  const entryHeld = pack.find(e => e.itemKey === "rune-shard");

  const r30 = await call("claimPackDrop", { entryId: entry30.id }, token);
  ok("the 30th kind LANDS at the claim", qtyOf(me, RELIC_KEYS[17]) === 3 && kindCount(me) === 30 && !packRows(me).some(e => e.id === entry30.id), JSON.stringify(r30));
  ok("the claim speaks its landing line", r30.ok === true && typeof r30.line === "string" && r30.line.includes("is yours"), JSON.stringify(r30.line));

  let refusal = "";
  try { await call("claimPackDrop", { entryId: entry31.id }, token); } catch (e) { refusal = String(e); }
  console.log("    the 31st kind's refusal, in the claim's own words:", refusal);
  ok("the 31st kind does NOT land — refused in the standing spoken line (thirty stacks)", refusal.includes("thirty stacks are all it holds"), refusal);
  ok("the refused good waits in the Pack, and the shelf still holds exactly 30 kinds", packRows(me).some(e => e.id === entry31.id) && qtyOf(me, RELIC_KEYS[18]) === 0 && kindCount(me) === 30);

  await call("claimPackDrop", { entryId: entryHeld.id }, token);
  ok("a kind already held still stacks at 30 kinds (10 + 5 = 15 shards; kinds unchanged)", qtyOf(me, "rune-shard") === 15 && kindCount(me) === 30, `shards ${qtyOf(me, "rune-shard")}, kinds ${kindCount(me)}`);
}

/* ── §T2 THE OLD BOUNDARY IS GONE ─────────────────────── */
{
  console.log("§T2 the old fifteen-kind wall no longer stands");
  const { token, me } = await makeTender("Old Wall Tender");
  layStack(me, "rune-shard", 1);
  for (const k of REAGENT_KEYS) layStack(me, k, 1);
  for (const k of RELIC_KEYS.slice(0, 3)) layStack(me, k, 1);
  ok("the shelf is sculpted to the old law's whole 15 kinds", kindCount(me) === 15, `kinds ${kindCount(me)}`);
  layPackItem(me, RELIC_KEYS[3], 4);
  const entry16 = packRows(me).find(e => e.itemKey === RELIC_KEYS[3]);
  await call("claimPackDrop", { entryId: entry16.id }, token);
  ok("a 16th kind LANDS — the claim the old cap refused", qtyOf(me, RELIC_KEYS[3]) === 4 && kindCount(me) === 16, `kinds ${kindCount(me)}`);
}

console.log(`\ndrive-inventory-limit-30: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
