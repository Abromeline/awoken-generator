#!/usr/bin/env node
/**
 * prepush — the FLOP gate, scripted. Run before every `git push`.
 *
 *   1. typecheck        client + server compile
 *   2. facade-check     no surface without machinery behind it
 *   3. schema-audit     every column the code expects is created by the DDL
 *   4. build            the server builds clean
 *   5. boot smoke       the server boots against a FRESH scratch database
 *                       (every migration runs), answers health + a few
 *                       anonymous reads — then boots AGAIN against the same
 *                       database, because migrations must survive re-runs
 *                       on databases that already exist. This is the exact
 *                       shape of every production schema crash to date.
 *
 * Any failure stops the run with a non-zero exit. Nothing here touches the
 * real DATA dir, the network, or git.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3199;
const BASE = `http://127.0.0.1:${PORT}`;

let step = 0;
function run(title, cmd, args) {
  step++;
  console.log(`\n[${step}] ${title}`);
  try {
    execFileSync(cmd, args, { cwd: root, stdio: "inherit" });
  } catch {
    console.error(`\nPREPUSH FAILED at step ${step}: ${title}`);
    process.exit(1);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function bootOnce(dataDir, label) {
  const child = spawn("node", ["server/dist/index.js"], {
    cwd: root,
    env: { ...process.env, DATA_DIR: dataDir, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  try {
    // Wait for health (boot runs every migration first — a bad one hangs
    // or crashes the process, and either way we never see a 200).
    let healthy = false;
    for (let i = 0; i < 60 && !healthy; i++) {
      if (child.exitCode !== null) break;
      try {
        const r = await fetch(`${BASE}/api/health`);
        healthy = r.ok;
      } catch { /* not up yet */ }
      if (!healthy) await sleep(500);
    }
    if (!healthy) {
      console.error(`Server did not become healthy (${label}). Boot log:\n${log}`);
      return false;
    }
    // Anonymous smokes: each reads tables that have drifted before.
    const checks = [
      ["GET", "/api/stripe/config"],
      ["GET", "/api/workshop/status"],
    ];
    for (const [method, path] of checks) {
      const r = await fetch(`${BASE}${path}`, { method });
      if (!r.ok) { console.error(`Smoke failed: ${method} ${path} → ${r.status}`); return false; }
    }
    const colors = await fetch(`${BASE}/api/getSiteColors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!colors.ok) { console.error(`Smoke failed: POST /api/getSiteColors → ${colors.status}`); return false; }
    console.log(`  ✓ ${label}: healthy, smokes pass`);
    return true;
  } finally {
    child.kill("SIGTERM");
    await sleep(300);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}

run("Typecheck (client + server)", "npm", ["run", "typecheck"]);
run("Facade check", "node", ["scripts/facade-check.mjs"]);
run("Schema audit (DDL guarantees every column)", "node", ["scripts/schema-audit.mjs"]);
run("Build server", "npm", ["run", "build:server"]);

step++;
console.log(`\n[${step}] Boot smoke (fresh DB, then re-boot for migration idempotency)`);
const scratch = mkdtempSync(join(tmpdir(), "awoken-prepush-"));
try {
  if (!(await bootOnce(scratch, "fresh database"))) {
    console.error(`\nPREPUSH FAILED at step ${step}: boot on fresh database`);
    process.exit(1);
  }
  if (!(await bootOnce(scratch, "re-boot, same database"))) {
    console.error(`\nPREPUSH FAILED at step ${step}: migration re-run`);
    process.exit(1);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log("\nPREPUSH PASSED — typecheck, facades, schema, and migrations all verified.");
