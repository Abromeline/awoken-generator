// THE ARSENAL (Nigel, 2026-10-19): runic weapons are switchable
// gear — every classed Tender owns all four, wields any of them
// freely, and levels/attunes each SEPARATELY. Attunement pours
// spend real aspect points (raise FROM depth D costs D+1, cap
// IV); one element per weapon — a new element starts it over,
// and a pour the pool cannot pay is refused whole. (test53)
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-arsenal-"));
process.env.PORT = "39977";
process.env.WORKSHOP_PASSWORD = "test-pass-53";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
await import("../server/dist/index.js");
await new Promise(r => setTimeout(r, 2500));
const base = "http://127.0.0.1:39977";
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log("  ok -", name); } else { fail++; console.log("  FAIL -", name); } };
async function call(action, args, token, expectFail = false) {
  const res = await fetch(`${base}/api/${action}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) }, body: JSON.stringify(args) });
  const data = await res.json().catch(() => ({}));
  if (!expectFail && !res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return { status: res.status, data };
}
const db = new Database(join(process.env.DATA_DIR, "app.db"));

const claim = await call("claimTender", { password: "arsenal-password-1", tenderName: "Arsenal Tender" });
const token = claim.data.token;
const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.data.tender.code).id}`;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 200, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 200").run(me, Date.now());
db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, 0, 0, 0, ?)").run(me, Date.now());
const expOf = async () => (await call("getTenderExp", {}, token)).data;
const weaponOf = (exp, key) => exp.arsenal.find(w => w.key === key);

// 1. Classless: the arsenal is shut.
ok("classless: wield refused", (await call("wieldWeapon", { weaponKey: "sword" }, token, true)).status >= 400);
ok("classless: attune refused", (await call("attuneWeapon", { weaponKey: "sword", element: "sky" }, token, true)).status >= 400);

// 2. Classed: the arsenal stands open — all four, untouched.
await call("chooseClass", { classKey: "sage" }, token);
let exp = await expOf();
ok("the arsenal holds all four weapons", Array.isArray(exp.arsenal) && exp.arsenal.length === 4);
ok("each begins at level 1, unattuned", exp.arsenal.every(w => w.level === 1 && w.depth === 0 && w.element === null));

// 3. The choosing grants the first; wielding after is FREE.
await call("chooseWeapon", { weaponKey: "arrow" }, token);
const wield = await call("wieldWeapon", { weaponKey: "sword" }, token);
ok("wielding another weapon is free", wield.data.ok === true);
exp = await expOf();
ok("the sword is in hand", exp.weaponKey === "sword");
ok("wielding never touches the second-thoughts rite", exp.classRiteAvailable === true);
ok("re-wielding the same weapon is a quiet yes", (await call("wieldWeapon", { weaponKey: "sword" }, token)).data.ok === true);

// 4. The pour: real points, the ladder's price.
db.prepare("INSERT INTO aspect_attunement (owner_key, element, points, updated_at) VALUES (?, 'sky', 5, ?) ON CONFLICT(owner_key, element) DO UPDATE SET points = 5").run(me, Date.now());
db.prepare("INSERT INTO aspect_attunement (owner_key, element, points, updated_at) VALUES (?, 'stone', 1, ?) ON CONFLICT(owner_key, element) DO UPDATE SET points = 1").run(me, Date.now());
const a1 = await call("attuneWeapon", { weaponKey: "sword", element: "sky" }, token);
ok("the first pour costs 1 and lands at depth I", a1.data.ok === true && a1.data.cost === 1 && a1.data.depth === 1);
exp = await expOf();
ok("the sky pool paid", exp.pools.sky === 4);
const a2 = await call("attuneWeapon", { weaponKey: "sword", element: "sky" }, token);
ok("the second pour costs 2, depth II", a2.data.cost === 2 && a2.data.depth === 2 && (await expOf()).pools.sky === 2);
const a3 = await call("attuneWeapon", { weaponKey: "sword", element: "sky" }, token, true);
ok("a pour the pool cannot pay is refused whole", a3.status >= 400);
exp = await expOf();
ok("the refusal spent nothing and deepened nothing", weaponOf(exp, "sword").depth === 2 && exp.pools.sky === 2);

// 5. One element per weapon: a new element starts it over.
const sw = await call("attuneWeapon", { weaponKey: "sword", element: "stone" }, token);
ok("switching element resets and pours at the first price", sw.data.ok === true && sw.data.cost === 1 && sw.data.depth === 1);
exp = await expOf();
ok("the sword is stone-deep now, sky untouched in the pool", weaponOf(exp, "sword").element === "stone" && weaponOf(exp, "sword").depth === 1 && exp.pools.sky === 2 && exp.pools.stone === 0);

// 6. Separately means separately: the spear keeps its own attunement.
const sp = await call("attuneWeapon", { weaponKey: "spear", element: "sky" }, token);
exp = await expOf();
ok("the spear attunes on its own ledger", sp.data.depth === 1 && weaponOf(exp, "spear").element === "sky" && weaponOf(exp, "sword").element === "stone");

// 7. The cap: depth IV is the deepest.
db.prepare("UPDATE aspect_attunement SET points = 40 WHERE owner_key = ? AND element = 'sky'").run(me);
await call("attuneWeapon", { weaponKey: "spear", element: "sky" }, token); // II
await call("attuneWeapon", { weaponKey: "spear", element: "sky" }, token); // III
await call("attuneWeapon", { weaponKey: "spear", element: "sky" }, token); // IV
const cap = await call("attuneWeapon", { weaponKey: "spear", element: "sky" }, token, true);
ok("depth IV is the deepest — the fifth pour refuses", cap.status >= 400 && /deepest/.test(cap.data.error ?? ""));
ok("the spear rests at IV", weaponOf(await expOf(), "spear").depth === 4);

// 8. The wielded pointer is what the world reads.
await call("wieldWeapon", { weaponKey: "arrow" }, token);
const t = (await call("getTerritory", {}, token)).data;
ok("the homeland stand carries the wielded arrow", t.tender && t.tender.weaponKey === "arrow");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
