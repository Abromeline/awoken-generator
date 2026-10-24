// drive-lighthouse-upkeep — THE LIGHTHOUSE'S SHADOW UPKEEP,
// RULED (Nigel, 2026-10-24: "1 shadow matter 4 min").
// One Shadow Matter per FOUR minutes lit, replacing the
// flagged placeholder of 1 per minute that stood since the
// 2026-10-23 engine build.
// The hoard (shadow_matter) is a REAL column, so the rate
// accrues lawfully in fractions — proven here against the
// real server on a scratch DATA_DIR, through the lazy
// settlement itself (settleProtection, reckoned on map reads):
//   §S THE SEAM: the ruled constant stands in the source —
//      one per four minutes, the per-minute rate an exact
//      quarter of it; the old placeholder is gone.
//   §A THE RATE, LIVED: 3 minutes lit costs 0.75; one more
//      minute brings the four-minute total to exactly 1;
//      five more (nine in all) bring it to 2.25 — fractions
//      carried across settlements, never rounded.
//   §B THE PAUSE STANDS: a ten-minute absence burns nothing
//      and the light stays lit.
//   §C THE GUTTER STANDS: a hoard of 0.1 buys exactly 0.4
//      minutes of light (24s of bank), then the light goes
//      out and the unburned minutes stay banked.
// Run after `npm run build` (the drive boots server/dist).
import { readFileSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-lighthouse-"));
process.env.PORT = "39972";
const PW = "lighthouse-drive-password";
process.env.WORKSHOP_PASSWORD = PW;
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;
process.chdir(root);
const BASE = "http://127.0.0.1:39972";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

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
const progOf = (ownerKey) => db.prepare("SELECT * FROM tender_progress WHERE owner_key = ?").get(ownerKey);

/* ── §S THE SEAM ──────────────────────────────────────────── */
console.log("§S the seam — the ruled rate stands in the source");
{
  const actions = readFileSync("server/src/actions.ts", "utf8");
  ok("one Shadow Matter per four minutes stands as the named constant",
    actions.includes("export const LIGHTHOUSE_SHADOW_UPKEEP_PER_FOUR_MINUTES = 1;"));
  ok("the per-minute rate is an exact quarter of it (0.25 — the hoard is REAL, fractions lawful)",
    actions.includes("export const LIGHTHOUSE_SHADOW_UPKEEP_PER_MINUTE = LIGHTHOUSE_SHADOW_UPKEEP_PER_FOUR_MINUTES / 4;"));
  ok("the placeholder (1 per minute) is gone",
    !actions.includes("LIGHTHOUSE_SHADOW_UPKEEP_PER_MINUTE = 1;"));
}

/* ── The Tender and the lit light ─────────────────────────── */
const c = await call("claimTender", { password: PW, tenderName: "Lighthouse Keeper" });
const tenderId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(c.tender.code).id;
const ownerKey = `tender:${tenderId}`;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 3800, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 3800").run(ownerKey, Date.now());
db.prepare("INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, 5000, ?) ON CONFLICT(owner_key) DO UPDATE SET energy = 5000").run(ownerKey, Date.now());
// Three woken of his own (fixture rows, as the other drives seed
// theirs): the choosing opens only after the first three wakes,
// and a classless Tender has no stand for the settlement to ride on.
for (const name of ["Lamp One", "Lamp Two", "Lamp Three"]) {
  const nowT = Date.now();
  const parts = [];
  for (const cat of ["body", "arms", "head"]) {
    const pid = Number(db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', 3, 3, 'root', ?, 'image/png', ?)").run(`${name} ${cat}`, cat, `lighthouse/${name}-${cat}.png`, nowT).lastInsertRowid);
    parts.push({ source_id: `db:${pid}`, name: `${name} ${cat}`, category: cat, rarity: "common", power: 3, toughness: 3, element: "root" });
  }
  db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', 'Lighthouse Keeper', ?, ?)").run(name, name, `lighthouse/${name}.png`, JSON.stringify(parts), ownerKey, nowT);
}
await call("chooseClass", { classKey: "warden" }, c.token);
db.prepare("INSERT INTO territory_tiles (owner_key, q, r, element, cursed, created_at) VALUES (?, 0, 0, 'root', 0, ?)").run(ownerKey, Date.now());
await call("getTerritory", {}, c.token); // first read sets the clocks
// The fixture: a full hour of banked protection and ten Shadow Matter.
db.prepare("UPDATE tender_progress SET protection_bank_ms = 3600000, shadow_matter = 10 WHERE owner_key = ?").run(ownerKey);
const litRes = await call("setLighthouse", { lit: true }, c.token);
ok("the lighthouse lights by the Tender's own hand", litRes.battle.lighthouseLit === true, JSON.stringify(litRes.battle));

async function settleAfter(ms) {
  db.prepare("UPDATE tender_progress SET lighthouse_settled_at = ? WHERE owner_key = ?").run(Date.now() - ms, ownerKey);
  await call("getTerritory", {}, c.token);
  return progOf(ownerKey);
}

/* ── §A THE RATE, LIVED ───────────────────────────────────── */
console.log("§A the rate lived — 3 min costs 0.75, 4 min costs 1, 9 min costs 2.25");
{
  let p = await settleAfter(3 * 60000);
  console.log(`  after 3 lit minutes: shadow ${p.shadow_matter}, bank ${p.protection_bank_ms}`);
  ok("3 minutes lit cost three quarters of one Shadow Matter (fractions accrue, nothing rounded)",
    near(10 - p.shadow_matter, 0.75, 0.02), `spent ${10 - p.shadow_matter}`);
  ok("3 minutes lit burned ~3 minutes of banked protection", near(3600000 - p.protection_bank_ms, 180000, 2000), `${3600000 - p.protection_bank_ms}`);
  p = await settleAfter(1 * 60000);
  console.log(`  after 4 lit minutes: shadow ${p.shadow_matter}, bank ${p.protection_bank_ms}`);
  ok("four minutes lit cost exactly ONE Shadow Matter in all", near(10 - p.shadow_matter, 1, 0.02), `spent ${10 - p.shadow_matter}`);
  // Five more minutes, in two present stretches: a single
  // five-minute silence sits on the presence gap's edge and
  // reads as absence by a hair — the pause law, not the rate.
  await settleAfter(150000);
  p = await settleAfter(150000);
  console.log(`  after 9 lit minutes: shadow ${p.shadow_matter}, bank ${p.protection_bank_ms}`);
  ok("nine minutes lit cost 2.25 Shadow Matter in all", near(10 - p.shadow_matter, 2.25, 0.02), `spent ${10 - p.shadow_matter}`);
  ok("the light still burns (bank and fuel both stand)", p.lighthouse_lit === 1);
}

/* ── §B THE PAUSE STANDS ──────────────────────────────────── */
console.log("§B the pause — a long absence burns nothing");
{
  const before = progOf(ownerKey);
  const p = await settleAfter(10 * 60000);
  ok("a 10-minute absence burned no Shadow Matter", near(p.shadow_matter, before.shadow_matter, 0.001), `${before.shadow_matter} -> ${p.shadow_matter}`);
  ok("a 10-minute absence burned no banked protection", p.protection_bank_ms === before.protection_bank_ms, `${before.protection_bank_ms} -> ${p.protection_bank_ms}`);
  ok("the light stays lit across the absence", p.lighthouse_lit === 1);
}

/* ── §C THE GUTTER STANDS ─────────────────────────────────── */
console.log("§C the gutter — when the fuel runs dry mid-burn, the unburned minutes stay banked");
{
  db.prepare("UPDATE tender_progress SET shadow_matter = 0.1 WHERE owner_key = ?").run(ownerKey);
  const bankBefore = progOf(ownerKey).protection_bank_ms;
  const p = await settleAfter(1 * 60000);
  console.log(`  gutter: shadow ${p.shadow_matter}, bank ${bankBefore} -> ${p.protection_bank_ms}, lit ${p.lighthouse_lit}`);
  ok("0.1 Shadow Matter bought exactly its fuel: 0.4 minutes (24s) of bank burned, no more",
    near(bankBefore - p.protection_bank_ms, 24000, 2000), `${bankBefore - p.protection_bank_ms}`);
  ok("the hoard is spent to zero, never below", near(p.shadow_matter, 0, 0.001), `${p.shadow_matter}`);
  ok("the light guttered out when the fuel ran dry", p.lighthouse_lit === 0);
  ok("the unburned minutes stay banked", p.protection_bank_ms > 0, `${p.protection_bank_ms}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
