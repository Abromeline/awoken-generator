// drive-inbox — THE WORKSHOP→TENDER INBOX, REAL (spec of
// record 2026-10-20; the tender-side Message button ordered
// by Nigel 2026-10-22 14:07). Proven against the real API on
// a scratch server: the send is workshop-gated and confirms
// against the stored ledger row; a letter sent to tender A
// arrives in A's inbox alone — tender B's inbox stays empty,
// B cannot stamp A's letter read, and opening the letter
// clears A's unread count. No facade: the rows are read back
// out of the tender_messages ledger itself.
import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-inbox-"));
process.env.DATA_DIR = DATA_DIR;
process.env.PORT = "39973";
process.env.WORKSHOP_PASSWORD = "test-workshop-password";
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

async function api(action, args, headers = {}) {
  const res = await fetch(`http://127.0.0.1:39973/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
const errText = (r) => String(r.data?.error ?? r.data?.message ?? "");

// The workshop unlocks by its word, as the real face does.
const unlock = await fetch("http://127.0.0.1:39973/api/workshop/unlock", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ password: "test-workshop-password" }),
});
const workshopToken = (await unlock.json())?.token;
check("the workshop unlocks with its word", unlock.status === 200 && !!workshopToken, `status ${unlock.status}`);
const WS = { "x-workshop-token": workshopToken };

const claimA = await api("claimTender", { password: "test-password-a", tenderName: "Inbox A" });
const claimB = await api("claimTender", { password: "test-password-b", tenderName: "Inbox B" });
check("two tenders claimed", claimA.status === 200 && claimB.status === 200, `A ${claimA.status} B ${claimB.status}`);
const tokenA = claimA.data.token, tokenB = claimB.data.token;
const idA = db.prepare("SELECT id FROM tenders WHERE tender_name = 'Inbox A'").get().id;
const keyA = `tender:${idA}`;
const A = { "x-tender-token": tokenA }, B = { "x-tender-token": tokenB };

// The gate holds: no workshop token, no send — and a
// tender's own session is NOT a workshop key.
let r = await api("adminSendTenderMessage", { ownerKey: keyA, body: "Ungated words." });
check("SEND REFUSED without the workshop key", r.status === 401 || r.status === 403, `status ${r.status}`);
r = await api("adminSendTenderMessage", { ownerKey: keyA, body: "A tender is not the workshop." }, A);
check("SEND REFUSED with only a tender session", r.status === 401 || r.status === 403, `status ${r.status}`);
check("the ledger is still empty after the refused sends", db.prepare("SELECT COUNT(*) c FROM tender_messages").get().c === 0);

// Validation: a ghost address and an empty letter both refuse.
r = await api("adminSendTenderMessage", { ownerKey: "tender:9999", body: "To nobody." }, WS);
check("SEND REFUSED to a tender who does not exist", r.status === 400, `status ${r.status} ${errText(r)}`);
r = await api("adminSendTenderMessage", { ownerKey: keyA, body: "   " }, WS);
check("SEND REFUSED when the letter is empty", r.status === 400, `status ${r.status} ${errText(r)}`);

// The real send — and its answer is the stored row itself.
r = await api("adminSendTenderMessage", { ownerKey: keyA, body: "The margin Awoken has a new greeting waiting for you." }, WS);
check("SEND: the workshop's letter is stored and the stored row answers", r.status === 200 && r.data.message?.ownerKey === keyA && r.data.message?.body === "The margin Awoken has a new greeting waiting for you." && typeof r.data.message?.id === "number" && r.data.message?.sentAt > 0 && r.data.message?.readAt === null, JSON.stringify(r.data).slice(0, 200));
const msgId = r.data.message.id;
const stored = db.prepare("SELECT owner_key, body, read_at FROM tender_messages WHERE id = ?").get(msgId);
check("the ledger row itself carries the letter, unread", stored?.owner_key === keyA && stored.body.includes("margin Awoken") && stored.read_at === null, JSON.stringify(stored));

// It arrives for A — and ONLY for A.
r = await api("getTenderMessages", {}, A);
check("TENDER A: the letter waits in the inbox, unread count 1", r.status === 200 && r.data.messages?.length === 1 && r.data.messages[0].id === msgId && r.data.unread === 1, JSON.stringify(r.data).slice(0, 160));
r = await api("getTenderMessages", {}, B);
check("TENDER B: sees nothing of A's letter", r.status === 200 && r.data.messages?.length === 0 && r.data.unread === 0, JSON.stringify(r.data).slice(0, 120));
r = await api("getTenderMessages", {});
check("A VISITOR: reads only a visitor's own (empty) inbox — never A's", r.status === 200 && r.data.messages?.length === 0, `status ${r.status}`);

// Privacy in the ledger: B cannot stamp A's letter read.
r = await api("markTenderMessageRead", { id: msgId }, B);
check("TENDER B: cannot open A's letter", r.status === 400 && errText(r).includes("not yours"), `status ${r.status} ${errText(r)}`);
r = await api("getTenderMessages", {}, A);
check("TENDER A: still unread after B's attempt", r.data.unread === 1 && r.data.messages[0].readAt === null, JSON.stringify(r.data).slice(0, 140));

// A opens it: the stamp lands, the unread count clears.
r = await api("markTenderMessageRead", { id: msgId }, A);
check("TENDER A: opening the letter stamps it read and clears the unread count", r.status === 200 && r.data.unread === 0 && r.data.messages[0].readAt > 0, JSON.stringify(r.data).slice(0, 160));

// A second letter arrives unread beside the read one.
r = await api("adminSendTenderMessage", { ownerKey: keyA, body: "Second letter: the forks are on the wheel." }, WS);
const msg2 = r.data.message.id;
r = await api("getTenderMessages", {}, A);
check("TENDER A: two letters held, exactly one unread, newest first", r.data.messages?.length === 2 && r.data.unread === 1 && r.data.messages[0].id === msg2, JSON.stringify(r.data).slice(0, 160));
r = await api("getTenderMessages", {}, B);
check("TENDER B: still nothing — privacy holds after the second letter", r.data.messages?.length === 0 && r.data.unread === 0, JSON.stringify(r.data).slice(0, 120));

console.log(`\ndrive-inbox: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
