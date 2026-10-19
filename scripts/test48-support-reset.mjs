// test48 — SUPPORT/PRIVACY PAGES + THE RESET, REPAIRED (Nigel,
// 2026-10-19): the legal pages serve whole; the workshop reset now
// feeds on the pick-from-list source (listTenders) instead of a
// typed exact name; and a dead workshop token meets the server's
// locked word — the exact string the client's faded-word recovery
// keys on. Proven against the real API on a scratch server.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-test48-"));
process.env.DATA_DIR = DATA_DIR;
process.env.PORT = "39971";
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

async function page(path) {
  const res = await fetch(`http://127.0.0.1:39971${path}`);
  return { status: res.status, text: await res.text() };
}
async function api(action, args, token, workshopToken) {
  const res = await fetch(`http://127.0.0.1:39971/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}), ...(workshopToken ? { "x-workshop-token": workshopToken } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const sup = await page("/support");
check("the support page serves", sup.status === 200 && sup.text.includes("I forgot my password") && sup.text.includes("binding code"), `status ${sup.status}`);
const pri = await page("/privacy");
check("privacy serves, host-neutral, points at support", pri.status === 200 && pri.text.includes("Our hosting provider") && pri.text.includes('href="/support"') && !pri.text.includes("<strong>Railway</strong>"), `status ${pri.status}`);
const ter = await page("/terms");
check("terms serve with the support pointer", ter.status === 200 && ter.text.includes('href="/support"'), `status ${ter.status}`);

const claim = await api("claimTender", { password: "old-password-1", tenderName: "Reset Row Tester" });
check("tender claimed", claim.status === 200 && !!claim.data.token, JSON.stringify(claim.data).slice(0, 100));

const unlock = await fetch("http://127.0.0.1:39971/api/workshop/unlock", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "test-workshop-pw" }),
});
const wtok = (await unlock.json()).token;
check("the workshop unlocks", unlock.status === 200 && !!wtok, `status ${unlock.status}`);

const list = await api("listTenders", {}, null, wtok);
const entry = (list.data.tenders ?? []).find(t => t.displayName === "Reset Row Tester");
check("the picker source lists the tender by display name", !!entry, JSON.stringify(list.data).slice(0, 140));

const reset = await api("adminResetTenderPassword", { tenderName: entry.displayName, newPassword: "new-password-2" }, null, wtok);
check("reset by the picked name lands", reset.status === 200 && reset.data.ok === true, `status ${reset.status} ${JSON.stringify(reset.data).slice(0, 100)}`);

const oldLogin = await api("loginTender", { identity: "Reset Row Tester", password: "old-password-1" });
check("the old password is dead", oldLogin.status !== 200, `status ${oldLogin.status}`);
const newLogin = await api("loginTender", { identity: "Reset Row Tester", password: "new-password-2" });
check("the new password signs in", newLogin.status === 200 && !!newLogin.data.token, `status ${newLogin.status}`);

const dead = await api("adminResetTenderPassword", { tenderName: "Reset Row Tester", newPassword: "whatever-123" }, null, "deadbeef".repeat(8));
check("a dead token meets the locked word (the client's recovery trigger)", dead.status === 401 && String(dead.data.error ?? "").includes("workshop is locked"), `status ${dead.status} ${JSON.stringify(dead.data).slice(0, 120)}`);

console.log(`\nTEST48 (support pages + the reset, repaired): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
