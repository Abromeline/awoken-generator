// test49 — EMAIL RESET LINKS (Nigel, 2026-10-19): a Tender with an
// email on file asks at the gate, a sealed link is posted by the
// (dormant) mailer, and spending it sets a new password, kills
// every old session, and lands the Tender signed in. The asking
// NEVER enumerates: no-email and no-such-Tender asks answer the
// same bland ok and post nothing. Proven on a scratch server.
import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-test49-"));
process.env.DATA_DIR = DATA_DIR;
process.env.PORT = "39973";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
delete process.env.RESEND_API_KEY;

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

await import("../server/dist/index.js");
const mail = await import("../server/dist/mail.js");
await sleep(2500);
const db = new Database(join(DATA_DIR, "app.db"));

async function api(action, args, token) {
  const res = await fetch(`http://127.0.0.1:39973/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
const errText = (r) => String(r.data?.error ?? r.data?.message ?? "");

const claim = await api("claimTender", { password: "first-password-1", tenderName: "Mail Tester", email: "tester@example.com" });
check("claimed with an email planted", claim.status === 200 && !!claim.data.token, JSON.stringify(claim.data).slice(0, 100));
const row = db.prepare("SELECT email FROM tenders WHERE tender_name = 'Mail Tester'").get();
check("the email is on file", row?.email === "tester@example.com", JSON.stringify(row));

const noMail = await api("claimTender", { password: "first-password-1", tenderName: "No Mail Tester" });
check("a second tender claims without email", noMail.status === 200, `status ${noMail.status}`);

let ask = await api("requestPasswordReset", { identity: "Mail Tester" });
check("the ask answers ok — and honestly says the post is dormant", ask.status === 200 && ask.data.ok === true && ask.data.mailLive === false, JSON.stringify(ask.data));
let held = mail.__lastMailForTest();
check("the letter was held by the dormant mailer, addressed right", !!held && held.to === "tester@example.com" && held.link.includes("/reset?token="), JSON.stringify(held));
const token = new URL(held.link).searchParams.get("token");
check("the seal is a 64-char token", typeof token === "string" && token.length === 64, String(token).length);

const hashRow = db.prepare("SELECT token_hash FROM tender_password_resets ORDER BY id DESC LIMIT 1").get();
check("only the token's hash is kept", !!hashRow && hashRow.token_hash !== token && hashRow.token_hash.length === 64, JSON.stringify(hashRow));

ask = await api("requestPasswordReset", { identity: "Mail Tester" });
const held2 = mail.__lastMailForTest();
check("the cooldown holds: a second ask within two minutes posts nothing new", held2 === held, "");
ask = await api("requestPasswordReset", { identity: "No Mail Tester" });
check("a no-email ask answers the same ok and posts nothing", ask.status === 200 && ask.data.ok === true && mail.__lastMailForTest() === held, JSON.stringify(ask.data));
ask = await api("requestPasswordReset", { identity: "No Such Tender" });
check("a ghost ask answers the same ok and posts nothing", ask.status === 200 && ask.data.ok === true && mail.__lastMailForTest() === held, JSON.stringify(ask.data));

let spend = await api("resetPasswordWithToken", { token: "f".repeat(64), newPassword: "second-password-2" });
check("a forged seal is refused", spend.status === 400 && errText(spend).includes("faded"), `status ${spend.status} ${errText(spend)}`);

spend = await api("resetPasswordWithToken", { token, newPassword: "second-password-2" });
check("the true seal lands: fresh session in hand", spend.status === 200 && typeof spend.data.token === "string" && spend.data.token.length === 64, `status ${spend.status} ${JSON.stringify(spend.data).slice(0, 120)}`);

const oldLogin = await api("loginTender", { identity: "Mail Tester", password: "first-password-1" });
check("the old password is dead", oldLogin.status !== 200, `status ${oldLogin.status}`);
const newLogin = await api("loginTender", { identity: "Mail Tester", password: "second-password-2" });
check("the new password signs in", newLogin.status === 200 && !!newLogin.data.token, `status ${newLogin.status}`);
const oldSession = await api("setTenderName", { name: "Mail Tester" }, claim.data.token);
check("the pre-reset session is dead too", oldSession.status === 403, `status ${oldSession.status}`);

spend = await api("resetPasswordWithToken", { token, newPassword: "third-password-3" });
check("the seal cannot be spent twice", spend.status === 400 && errText(spend).includes("faded"), `status ${spend.status}`);

db.prepare("UPDATE tender_password_resets SET created_at = ?").run(Date.now() - 3 * 60 * 1000);
ask = await api("requestPasswordReset", { identity: "tester@example.com" });
const held3 = mail.__lastMailForTest();
check("asking by email works too (after the earlier seal retired)", ask.status === 200 && !!held3 && held3 !== held && held3.to === "tester@example.com", JSON.stringify(held3));
const token3 = new URL(held3.link).searchParams.get("token");
db.prepare("UPDATE tender_password_resets SET expires_at = ? WHERE token_hash IS NOT NULL AND used_at IS NULL").run(Date.now() - 1000);
spend = await api("resetPasswordWithToken", { token: token3, newPassword: "third-password-3" });
check("an expired seal is refused", spend.status === 400 && errText(spend).includes("faded"), `status ${spend.status} ${errText(spend)}`);

console.log(`\nTEST49 (email reset links): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
