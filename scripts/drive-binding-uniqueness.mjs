// ONE TENDER, ONE DISCORD BINDING — THE DRIVE (2026-10-26,
// FLOP fix item 1). The intro door's bind used to check both
// directions and then insert, with nothing underneath: two
// binds in the same instant could marry one Tender to two
// Discord identities, and the loser of a same-Discord race
// met a raw 500. The uniqueness now stands in the database
// (a UNIQUE index on table_bindings.tender_id, laid by
// store.ts after clearing doubled rows), and bind-intro
// answers a lost race with its standing 409 wordings.
//
//   §A THE MIGRATION, ON DOUBLED DATA: a scratch DB whose
//      table_bindings (old shape, no index) already holds one
//      Tender bound twice, another bound once, and a third
//      bound twice in the same instant — boot: the earliest
//      binding per Tender survives (smallest created_at,
//      ties by smallest rowid — the row every reader has
//      been resolving), later duplicates are gone, the index
//      stands, and a fresh duplicate insert is refused by
//      the database itself.
//   §B THE SECOND BOOT: same database again — the migration
//      is idempotent; the survivors stand unchanged.
//   §C THE RACE: two simultaneous bind-intro requests, one
//      Tender, two Discord identities → exactly one 200, the
//      other the tender-side 409, never a 500; one row
//      stands. A same-Discord race → one 200, one discord-
//      side 409; one row stands.
// Run AFTER `npm run build`:
//   node scripts/drive-binding-uniqueness.mjs
import { spawn } from "node:child_process";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-bindings-"));
const PORT = "39971";
const BASE = `http://127.0.0.1:${PORT}`;
const PW = "binding-drive-password";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

/* ── §A SEED THE DOUBLED WORLD ────────────────────────── */
console.log("§A the migration, on doubled data");
{
  const seed = new Database(join(DATA_DIR, "app.db"));
  seed.exec(`CREATE TABLE table_bindings (
    discord_id TEXT PRIMARY KEY,
    tender_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );`);
  const ins = seed.prepare("INSERT INTO table_bindings (discord_id, tender_id, created_at) VALUES (?, ?, ?)");
  ins.run("old-disc-a", 9001, 1000);   // the earliest — the survivor
  ins.run("old-disc-b", 9001, 2000);   // the race's second row — removed
  ins.run("old-disc-c", 9002, 3000);   // a clean single binding — untouched
  ins.run("old-disc-d", 9003, 4000);   // tied instant, laid first — the survivor
  ins.run("old-disc-e", 9003, 4000);   // tied instant, laid second — removed
  seed.close();
}

function bootChild() {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["server/dist/index.js"], {
      cwd: new URL("..", import.meta.url).pathname,
      env: { ...process.env, DATA_DIR, PORT },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    child.stdout.on("data", (d) => (log += d));
    child.stderr.on("data", (d) => (log += d));
    (async () => {
      for (let i = 0; i < 60; i++) {
        if (child.exitCode !== null) return reject(new Error(`server exited ${child.exitCode}:\n${log}`));
        try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return resolve(child); } catch { /* not up */ }
        await sleep(500);
      }
      reject(new Error(`server never healthy:\n${log}`));
    })();
  });
}
async function stopChild(child) {
  child.kill("SIGTERM");
  await sleep(300);
  if (child.exitCode === null) child.kill("SIGKILL");
  await sleep(200);
}
const bindingsNow = () => {
  const db = new Database(join(DATA_DIR, "app.db"), { readonly: true });
  try {
    const rows = db.prepare("SELECT discord_id AS d, tender_id AS t FROM table_bindings ORDER BY tender_id, discord_id").all();
    const index = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'table_bindings_tender_unique'").get();
    return { rows, index: !!index };
  } finally { db.close(); }
};

const EXPECTED = [
  { d: "old-disc-a", t: 9001 },
  { d: "old-disc-c", t: 9002 },
  { d: "old-disc-d", t: 9003 },
];

let child = await bootChild();
await stopChild(child);
{
  const { rows, index } = bindingsNow();
  ok("§A the doubled Tender keeps her EARLIEST binding (old-disc-a); the later row is gone",
    JSON.stringify(rows.filter((r) => r.t === 9001)) === JSON.stringify([{ d: "old-disc-a", t: 9001 }]), JSON.stringify(rows));
  ok("§A the clean single binding stands untouched",
    JSON.stringify(rows.filter((r) => r.t === 9002)) === JSON.stringify([{ d: "old-disc-c", t: 9002 }]), JSON.stringify(rows));
  ok("§A a tied instant breaks by the row laid first (old-disc-d stands, old-disc-e is gone)",
    JSON.stringify(rows.filter((r) => r.t === 9003)) === JSON.stringify([{ d: "old-disc-d", t: 9003 }]), JSON.stringify(rows));
  ok("§A exactly the three survivors stand", rows.length === 3, JSON.stringify(rows));
  ok("§A the UNIQUE index on tender_id stands in the database", index);
  const db = new Database(join(DATA_DIR, "app.db"));
  let refused = false;
  try { db.prepare("INSERT INTO table_bindings (discord_id, tender_id, created_at) VALUES ('old-disc-z', 9001, 5000)").run(); }
  catch { refused = true; }
  db.close();
  ok("§A the database itself now refuses a second binding for one Tender", refused);
}

/* ── §B THE SECOND BOOT ───────────────────────────────── */
console.log("§B the second boot — idempotent");
child = await bootChild();
await stopChild(child);
{
  const { rows, index } = bindingsNow();
  ok("§B the survivors stand unchanged after a re-boot", JSON.stringify(rows) === JSON.stringify(EXPECTED), JSON.stringify(rows));
  ok("§B the index still stands", index);
}

/* ── §C THE RACE ──────────────────────────────────────── */
console.log("§C the race, in-process");
process.env.DATA_DIR = DATA_DIR;
process.env.PORT = PORT;
process.env.DISCORD_CLIENT_ID = "binding-drive-dummy";
process.env.DISCORD_CLIENT_SECRET = "binding-drive-secret";
process.chdir(new URL("..", import.meta.url).pathname);
await import("../server/dist/index.js");
await sleep(2500);
const { issueTableToken } = await import("../server/dist/table.js");
const db = new Database(join(DATA_DIR, "app.db"));

async function call(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return data?.data ?? data;
}
async function bindIntro(seatToken, tenderToken) {
  const res = await fetch(`${BASE}/api/table/bind-intro`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: seatToken, tenderToken }),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const rowsFor = (tenderId) => db.prepare("SELECT discord_id AS d FROM table_bindings WHERE tender_id = ? ORDER BY discord_id").all(tenderId);

const race1 = await call("claimTender", { password: PW, tenderName: "Race One" });
const race1Id = db.prepare("SELECT id FROM tenders WHERE code = ?").get(race1.tender.code).id;
const seatA = issueTableToken({ id: "disc-race-a", name: "Racer A" });
const seatB = issueTableToken({ id: "disc-race-b", name: "Racer B" });
{
  const [r1, r2] = await Promise.all([bindIntro(seatA, race1.token), bindIntro(seatB, race1.token)]);
  const statuses = [r1.status, r2.status].sort((a, b) => a - b);
  const loser = r1.status === 409 ? r1 : r2;
  ok("§C one Tender, two Discord identities at once: exactly one binds (200), the other is refused (409)",
    JSON.stringify(statuses) === JSON.stringify([200, 409]), JSON.stringify([r1, r2]));
  ok("§C the refusal is the standing tender-side wording, never a 500",
    loser.data?.error === "That Tender is already bound to another Discord name — the intro door never moves a binding.",
    JSON.stringify(loser.data));
  ok("§C exactly one binding row stands for the raced Tender", rowsFor(race1Id).length === 1, JSON.stringify(rowsFor(race1Id)));
}

const race2 = await call("claimTender", { password: PW, tenderName: "Race Two" });
const race2Id = db.prepare("SELECT id FROM tenders WHERE code = ?").get(race2.tender.code).id;
const seatC = issueTableToken({ id: "disc-race-c", name: "Racer C" });
{
  const [r1, r2] = await Promise.all([bindIntro(seatC, race2.token), bindIntro(seatC, race2.token)]);
  const statuses = [r1.status, r2.status].sort((a, b) => a - b);
  const loser = r1.status === 409 ? r1 : r2;
  ok("§C one Discord identity, raced against itself: exactly one binds (200), the twin is refused (409)",
    JSON.stringify(statuses) === JSON.stringify([200, 409]), JSON.stringify([r1, r2]));
  ok("§C the refusal is the standing discord-side wording, never a 500",
    loser.data?.error === "This Discord name is already bound to a Tender — the intro door never moves a binding.",
    JSON.stringify(loser.data));
  ok("§C exactly one binding row stands for the second raced Tender", rowsFor(race2Id).length === 1, JSON.stringify(rowsFor(race2Id)));
}

console.log(`\ndrive-binding-uniqueness: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
