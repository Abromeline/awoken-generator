// THE RUNIC WEAPON (Nigel, 2026-10-19): chosen with the class at
// Lv 3; the first pick is the choosing's gift; re-picking rides
// the second-thoughts rite, then reclass tokens, then seals.
// The stand on the homeland carries it. (test51)
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-weapon-"));
process.env.PORT = "39975";
process.env.WORKSHOP_PASSWORD = "weapon-word";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
await import("../server/dist/index.js");
await new Promise(r => setTimeout(r, 2500));
const base = "http://127.0.0.1:39975";
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

const claim = await call("claimTender", { password: "weapon-password-1", tenderName: "Weapon Tender" });
const token = claim.data.token;
const me = `tender:${db.prepare("SELECT id FROM tenders WHERE code = ?").get(claim.data.tender.code).id}`;
db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 200, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 200").run(me, Date.now());
db.prepare("INSERT INTO territory_tiles (owner_key, q, r, cursed, created_at) VALUES (?, 0, 0, 0, ?)").run(me, Date.now());

// 1. No class yet: the weapon refuses.
const early = await call("chooseWeapon", { weaponKey: "sword" }, token, true);
ok("classless: no weapon may be chosen", early.status >= 400);

// 2. Choose a class, then the weapon — the choosing's gift.
await call("chooseClass", { classKey: "runewright" }, token);
const w1 = await call("chooseWeapon", { weaponKey: "sword" }, token);
ok("the first weapon is the choosing's gift", w1.data.ok === true && w1.data.via === "the choosing");
let exp = (await call("getTenderExp", {}, token)).data;
ok("the record carries the sword", exp.weaponKey === "sword");
ok("the rite still waits after the gift", exp.classRiteAvailable === true);

// 3. The homeland stand carries it too.
let t = (await call("getTerritory", {}, token)).data;
ok("the stand carries the weapon", t.tender && t.tender.weaponKey === "sword");

// 4. Re-pick: the second-thoughts rite, spent once for the whole choosing.
const w2 = await call("chooseWeapon", { weaponKey: "spear" }, token);
ok("the re-pick rides the second-thoughts rite", w2.data.ok === true && w2.data.via === "the second-thoughts rite");
exp = (await call("getTenderExp", {}, token)).data;
ok("the spear now floats", exp.weaponKey === "spear");
ok("the rite is spent for class and weapon alike", exp.classRiteAvailable === false);

// 5. Sealed: a third pick refuses without a token.
const w3 = await call("chooseWeapon", { weaponKey: "arrow" }, token, true);
ok("sealed: a third pick refuses", w3.status >= 400 && /sealed/.test(w3.data.error ?? ""));

// 6. A workshop token unseals it, once.
const unlockRes = await fetch(`${base}/api/workshop/unlock`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "weapon-word" }) });
workshopToken = (await unlockRes.json()).token;
await call("grantReclassToken", { tenderName: "Weapon Tender" });
const w4 = await call("chooseWeapon", { weaponKey: "arrow" }, token);
ok("a reclass token unseals the pick", w4.data.ok === true && w4.data.via === "a reclass token");
exp = (await call("getTenderExp", {}, token)).data;
ok("the arrow now floats, the token spent", exp.weaponKey === "arrow" && exp.reclassTokens === 0);

// 7. The same weapon twice is not a choosing.
const w5 = await call("chooseWeapon", { weaponKey: "arrow" }, token, true);
ok("re-naming the same weapon refuses", w5.status >= 400);

// 8. A stranger's key is no weapon at all.
const w6 = await call("chooseWeapon", { weaponKey: "cannon" }, token, true);
ok("an unknown weapon refuses", w6.status >= 400);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
