// THE WEAPON TREE (Phase C, 2026-10-19): buyWeaponNode — the
// Manifest and Signature nodes on each runic weapon. Flat cost
// 3 aspect points, paid from the weapon's attunement element
// pool when attuned (depth ≥ 1), else from the Tender's richest
// pool; refused WHOLE when that pool holds < 3 or the node is
// already owned — nothing half-spent. getTenderProgress carries
// the flags on every arsenal entry. (test55)
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-weapontree-"));
process.env.PORT = "39979";
process.env.WORKSHOP_PASSWORD = "test-pass-55";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
await import("../server/dist/index.js");
await new Promise(r => setTimeout(r, 2500));
const base = "http://127.0.0.1:39979";
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log("  ok -", name); } else { fail++; console.log("  FAIL -", name); } };
async function call(action, args, token, expectFail = false) {
  const res = await fetch(`${base}/api/${action}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) }, body: JSON.stringify(args) });
  const data = await res.json().catch(() => ({}));
  if (!expectFail && !res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return { status: res.status, data };
}
const db = new Database(join(process.env.DATA_DIR, "app.db"));

const claim = await call("claimTender", { password: "weapontree-password-1", tenderName: "Tree Tender" });
const token = claim.data.token;
const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.data.tender.code).id}`;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 200, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 200").run(me, Date.now());
const setPool = (el, pts) => db.prepare("INSERT INTO aspect_attunement (owner_key, element, points, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(owner_key, element) DO UPDATE SET points = excluded.points").run(me, el, pts, Date.now());
const expOf = async () => (await call("getTenderExp", {}, token)).data;
const weaponOf = (exp, key) => exp.arsenal.find(w => w.key === key);

// 0. Classless: the tree is shut, and the view carries the flags.
ok("classless: buyWeaponNode refused", (await call("buyWeaponNode", { weaponKey: "sword", node: "manifest" }, token, true)).status >= 400);
let exp = await expOf();
ok("arsenal entries carry manifest/signature flags, all unset", exp.arsenal.every(w => w.manifest === false && w.signature === false));

await call("chooseClass", { classKey: "warden" }, token);
await call("chooseWeapon", { weaponKey: "sword" }, token);

// Attune the sword to sky (depth I costs 1), then top pools up.
setPool("sky", 10); setPool("stone", 7);
await call("attuneWeapon", { weaponKey: "sword", element: "sky" }, token);
exp = await expOf();
ok("setup: sword sky depth I, sky pool 9, stone pool 7", weaponOf(exp, "sword").depth === 1 && exp.pools.sky === 9 && exp.pools.stone === 7);

// (a) Manifest on an attuned weapon spends exactly 3 from the attuned pool.
const a = await call("buyWeaponNode", { weaponKey: "sword", node: "manifest" }, token);
ok("(a) manifest buy lands, cost 3 from sky", a.data.ok === true && a.data.cost === 3 && a.data.element === "sky");
exp = await expOf();
ok("(a) sky pool spent exactly 3 (9 -> 6), stone untouched", exp.pools.sky === 6 && exp.pools.stone === 7);
ok("(a) manifest flag set in getTenderProgress, signature still unset", weaponOf(exp, "sword").manifest === true && weaponOf(exp, "sword").signature === false);

// (c) Double-buy refused, nothing spent.
const c = await call("buyWeaponNode", { weaponKey: "sword", node: "manifest" }, token, true);
ok("(c) double-buy refused", c.status >= 400);
exp = await expOf();
ok("(c) the refusal spent nothing", exp.pools.sky === 6 && weaponOf(exp, "sword").manifest === true);

// (e) Signature is independent of manifest.
const e = await call("buyWeaponNode", { weaponKey: "sword", node: "signature" }, token);
exp = await expOf();
ok("(e) signature buys independently (sky 6 -> 3)", e.data.ok === true && weaponOf(exp, "sword").signature === true && exp.pools.sky === 3);

// (b) Refusal whole: the paying pool under 3 -> error, pool
// unchanged, flag unset. Setup: set sky to 3, attune the arrow to
// sky (depth I costs 1, leaving sky at exactly 2), then its
// manifest buy must refuse whole against that pool.
setPool("sky", 3);
await call("attuneWeapon", { weaponKey: "arrow", element: "sky" }, token);
exp = await expOf();
ok("(b) setup: arrow attuned to sky, sky pool now 2", weaponOf(exp, "arrow").depth === 1 && exp.pools.sky === 2);
const b2 = await call("buyWeaponNode", { weaponKey: "arrow", node: "manifest" }, token, true);
ok("(b) buy with attuned pool at 2 (< 3) refused", b2.status >= 400);
exp = await expOf();
ok("(b) pool unchanged at 2 and flag unset after refusal", exp.pools.sky === 2 && weaponOf(exp, "arrow").manifest === false);

// (d) Unattuned weapon pays from the richest pool.
setPool("stone", 8); setPool("tide", 4); setPool("sky", 1);
const d = await call("buyWeaponNode", { weaponKey: "spear", node: "manifest" }, token);
exp = await expOf();
ok("(d) unattuned spear manifest paid from richest pool (stone)", d.data.ok === true && d.data.element === "stone" && d.data.cost === 3);
ok("(d) stone spent exactly 3 (8 -> 5), other pools untouched, flag set", exp.pools.stone === 5 && exp.pools.tide === 4 && exp.pools.sky === 1 && weaponOf(exp, "spear").manifest === true);
ok("(d) spear signature still unset (nodes independent across weapons too)", weaponOf(exp, "spear").signature === false);

// Bad inputs refuse.
ok("unknown node refused", (await call("buyWeaponNode", { weaponKey: "spear", node: "third" }, token, true)).status >= 400);
ok("unknown weapon refused", (await call("buyWeaponNode", { weaponKey: "cannon", node: "manifest" }, token, true)).status >= 400);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
