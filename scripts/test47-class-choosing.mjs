// test47 — THE CHOOSING + THE CLASS GATE (Nigel, 2026-10-19): a
// Tender picks their class at Lv 3; one free second-thoughts rite
// unmakes it; after that only a workshop-sent reclass token opens
// the class again, consumed on use; and no Tender takes a Table
// binding code classless. Proven against the real API on a scratch
// server. (The bound seat's classKey display rides the same
// getTenderProgress read proven here; the seat itself needs a
// Discord-proven join, out of a scratch world's reach.)
import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-test47-"));
process.env.DATA_DIR = DATA_DIR;
process.env.PORT = "39967";
process.env.WORKSHOP_PASSWORD = "test-workshop-pw";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

await import("../server/dist/index.js");
await sleep(2500);

const db = new Database(join(DATA_DIR, "app.db"));

async function api(action, args, token, workshopToken) {
  const res = await fetch(`http://127.0.0.1:39967/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}), ...(workshopToken ? { "x-workshop-token": workshopToken } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
const errText = (r) => String(r.data?.error ?? r.data?.message ?? "");

const claim = await api("claimTender", { password: "test-password-1", tenderName: "Class Tester" });
check("tender claimed", claim.status === 200 && !!claim.data.token, JSON.stringify(claim.data).slice(0, 120));
const token = claim.data.token;
const tenderId = db.prepare("SELECT id FROM tenders WHERE tender_name = 'Class Tester'").get().id;
const ownerKey = `tender:${tenderId}`;

let exp = await api("getTenderExp", {}, token);
check("a new tender is Lv 1 and classless", exp.data.level === 1 && exp.data.classKey === null && exp.data.reclassTokens === 0, JSON.stringify(exp.data).slice(0, 160));

let bind = await api("getTableBindCode", {}, token);
check("THE GATE: no binding code while classless", bind.status === 400 && errText(bind).includes("chosen a class"), `status ${bind.status} ${errText(bind)}`);

let ch = await api("chooseClass", { classKey: "witch" }, token);
check("the choosing refuses before Lv 3", ch.status === 400 && errText(ch).includes("Lv 3"), `status ${ch.status} ${errText(ch)}`);

db.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 150, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET total_exp = 150").run(ownerKey, Date.now());
exp = await api("getTenderExp", {}, token);
check("Lv 3 reached (150 XP)", exp.data.level === 3, `level ${exp.data.level}`);

ch = await api("chooseClass", { classKey: "witch" }, token);
check("the calling: first choosing lands", ch.status === 200 && ch.data.classKey === "witch" && ch.data.via === "the calling", `status ${ch.status} ${JSON.stringify(ch.data).slice(0, 140)}`);
exp = await api("getTenderExp", {}, token);
check("the sheet reads Witch, rite waiting, no tokens", exp.data.classKey === "witch" && exp.data.classRiteAvailable === true && exp.data.reclassTokens === 0, JSON.stringify(exp.data).slice(0, 200));

bind = await api("getTableBindCode", {}, token);
check("the gate opens: a binding code is minted", bind.status === 200 && typeof bind.data.code === "string" && bind.data.code.length === 6, `status ${bind.status}`);

ch = await api("chooseClass", { classKey: "witch" }, token);
check("choosing your own class again is refused", ch.status === 400 && errText(ch).includes("already your class"), errText(ch));

ch = await api("chooseClass", { classKey: "sage" }, token);
check("the second-thoughts rite unmakes it, free", ch.status === 200 && ch.data.classKey === "sage" && ch.data.via === "the second-thoughts rite", `status ${ch.status} ${JSON.stringify(ch.data).slice(0, 140)}`);
exp = await api("getTenderExp", {}, token);
check("the rite is spent on the sheet", exp.data.classKey === "sage" && exp.data.classRiteAvailable === false, JSON.stringify(exp.data).slice(0, 200));

ch = await api("chooseClass", { classKey: "warden" }, token);
check("sealed: a third choosing is refused without a token", ch.status === 400 && errText(ch).includes("sealed"), `status ${ch.status} ${errText(ch)}`);

const unlock = await fetch("http://127.0.0.1:39967/api/workshop/unlock", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "test-workshop-pw" }),
});
const unlockData = await unlock.json().catch(() => ({}));
check("the workshop unlocks", unlock.status === 200 && !!unlockData.token, `status ${unlock.status}`);

let grant = await api("grantReclassToken", { tenderName: "Class Tester" }, null, unlockData.token);
check("a workshop hand sends a reclass token", grant.status === 200 && grant.data.reclassTokens === 1, `status ${grant.status} ${JSON.stringify(grant.data).slice(0, 120)}`);
exp = await api("getTenderExp", {}, token);
check("the token waits on the tender's ledger", exp.data.reclassTokens === 1, `tokens ${exp.data.reclassTokens}`);

ch = await api("chooseClass", { classKey: "warden" }, token);
check("the token unseals — and is spent", ch.status === 200 && ch.data.classKey === "warden" && ch.data.via === "a reclass token", `status ${ch.status} ${JSON.stringify(ch.data).slice(0, 140)}`);
exp = await api("getTenderExp", {}, token);
check("the ledger reads Warden, tokens back to none", exp.data.classKey === "warden" && exp.data.reclassTokens === 0, JSON.stringify(exp.data).slice(0, 200));

grant = await api("grantReclassToken", { tenderName: "Class Tester" }, null, null);
check("granting is workshop-gated (no token, no grant)", grant.status !== 200, `status ${grant.status}`);

console.log(`\nTEST47 (the choosing + the class gate): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
