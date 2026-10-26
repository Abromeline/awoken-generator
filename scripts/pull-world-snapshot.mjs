#!/usr/bin/env node
// PULL A WORLD SNAPSHOT (2026-10-26) — the Keeper's half of the
// export door (server/src/exportDoor.ts; runbook Phase 0/1:
// ~/workspace/vultr-move-runbook-2026-10-26.md).
//
//   EXPORT_TOKEN=… node scripts/pull-world-snapshot.mjs --base https://awokin.gg
//   EXPORT_TOKEN=… node scripts/pull-world-snapshot.mjs --base http://127.0.0.1:3000 --local
//
// The token is read from the EXPORT_TOKEN environment variable ONLY —
// never a CLI argument (args land in shell history and process
// lists), never written to disk. --local is accepted for symmetry
// with the door's other callers; localhost and remote pull exactly
// the same way.
//
// What lands on disk:
//   <out-root>/<YYYY-MM-DD-HHmm>/
//     app.db                 the consistent snapshot (SQLite backup API)
//     blobs/objects/<2 hex>/<sha256>   every blob object, by its hash
//     manifest.json          the door's manifest, as served
//     SNAPSHOT.json          the receipt: counts, the db's SHA-256,
//                            and every verdict below
// Default out-root: ~/workspace/world-snapshots (override: --out-root).
//
// Verification — the pull FAILS (exit 1) unless all of it holds:
//   · the snapshot db's received bytes equal the length AND the
//     SHA-256 the door declared for them (its Content-Length and
//     X-Snapshot-Sha256 headers) — the door's word, checked
//     against the arrival, never the file against itself;
//   · every blob's SHA-256 re-computes to its own filename;
//   · every blob's byte count equals the door's list;
//   · the snapshot db answers PRAGMA integrity_check with "ok";
//   · per-table row counts in the snapshot equal the manifest's;
//   · blob count and total bytes equal the manifest's.
// A snapshot that does not verify is kept on disk (it may still be
// evidence) but the receipt says so, loudly, in its verdicts.

import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import Database from "../node_modules/better-sqlite3/lib/index.js";

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const base = (argValue("--base") ?? "").replace(/\/$/, "");
if (!base || !/^https?:\/\//.test(base)) {
  console.error("Usage: EXPORT_TOKEN=… node scripts/pull-world-snapshot.mjs --base <url> [--local] [--out-root <dir>]");
  process.exit(2);
}
// THE TOKEN TRAVELS ONLY UNDER LOCK (FLOP fix, 2026-10-26): a
// plain-http base is refused HERE — before the token is read,
// let alone sent. The one exception is this machine itself.
{
  const u = new URL(base);
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "::1" || u.hostname === "[::1]";
  if (u.protocol !== "https:" && !local) {
    console.error(`Refusing ${base} — the export token never travels over plain http. Use the https door, or a localhost address for a local pull.`);
    process.exit(2);
  }
}
const token = process.env.EXPORT_TOKEN ?? "";
if (!token) {
  console.error("EXPORT_TOKEN is not set in the environment — the door will not open, and the token is never taken as an argument.");
  process.exit(2);
}
const outRoot = argValue("--out-root") ?? join(homedir(), "workspace", "world-snapshots");

const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
const dir = join(outRoot, stamp);
if (existsSync(dir)) {
  console.error(`A snapshot already stands at ${dir} — snapshots are never overwritten. Move it aside or wait a minute.`);
  process.exit(2);
}
mkdirSync(join(dir, "blobs", "objects"), { recursive: true });

const auth = { authorization: `Bearer ${token}` };
const failures = [];
const note = (line) => console.log(line);

/** Stream a response body to disk while hashing and counting it. */
async function download(url, dest, timeoutMs) {
  const res = await fetch(url, { headers: auth, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok || !res.body) throw new Error(`${url} -> ${res.status}`);
  const hash = createHash("sha256");
  let bytes = 0;
  const tap = new Transform({
    transform(chunk, _enc, cb) {
      hash.update(chunk);
      bytes += chunk.length;
      cb(null, chunk);
    },
  });
  await pipeline(res.body, tap, createWriteStream(dest));
  return { bytes, sha256: hash.digest("hex"), headers: res.headers };
}

async function getJson(path) {
  const res = await fetch(`${base}${path}`, { headers: auth, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

// ------------------------------------------------------------------
note(`Pulling a world snapshot from ${base} into ${dir}`);

const manifest = await getJson("/api/export/manifest");
writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
note(`  manifest: db ${manifest.db.bytes} bytes · ${manifest.db.totalRows} rows in ${Object.keys(manifest.db.tables).length} tables · blobs ${manifest.blobs.filesOnDisk} files / ${manifest.blobs.bytesOnDisk} bytes (indexed ${manifest.blobs.indexedObjects}, orphans ${manifest.blobs.orphanFiles}, missing ${manifest.blobs.missingFiles})`);

// The db snapshot.
const dbPart = join(dir, "app.db.part");
const dbGot = await download(`${base}/api/export/db`, dbPart, 1_800_000);
renameSync(dbPart, join(dir, "app.db"));
note(`  db: ${dbGot.bytes} bytes, sha256 ${dbGot.sha256}`);
// The door's own declarations for this snapshot — the pull is
// proven against THESE, never against the received file read
// back against itself (FLOP fix, 2026-10-26).
const doorDbLength = Number(dbGot.headers.get("content-length"));
const doorDbHash = dbGot.headers.get("x-snapshot-sha256");

// The blob list, then every object by its hash (small pool: per-object
// fetches are the resumable, provable shape the door was built for).
const list = await getJson("/api/export/blobs");
const objects = list.objects ?? [];
let blobBytes = 0;
let blobsVerified = 0;
const queue = [...objects];
const workers = Array.from({ length: 6 }, async () => {
  for (;;) {
    const obj = queue.shift();
    if (!obj) return;
    const shardDir = join(dir, "blobs", "objects", obj.objectId.slice(0, 2));
    mkdirSync(shardDir, { recursive: true });
    try {
      const got = await download(`${base}/api/export/blob/${obj.objectId}`, join(shardDir, obj.objectId), 300_000);
      if (got.sha256 !== obj.objectId) failures.push(`blob ${obj.objectId}: re-hash is ${got.sha256} — the copy is NOT the object`);
      else if (got.bytes !== obj.size) failures.push(`blob ${obj.objectId}: ${got.bytes} bytes pulled, the door listed ${obj.size}`);
      else blobsVerified++;
      blobBytes += got.bytes;
    } catch (error) {
      failures.push(`blob ${obj.objectId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
});
await Promise.all(workers);
note(`  blobs: ${blobsVerified}/${objects.length} verified by re-hash · ${blobBytes} bytes`);

// ------------------------------------------------------------------
// Verdicts against the manifest.
// ------------------------------------------------------------------
const verdicts = {};

const db = new Database(join(dir, "app.db"), { readonly: true });
try {
  const integrity = db.pragma("integrity_check", { simple: true });
  verdicts.integrityCheck = integrity === "ok" ? "ok" : String(integrity);
  if (integrity !== "ok") failures.push(`integrity_check: ${integrity}`);

  const dbTables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
    .all()
    .map((r) => r.name);
  let rowCountsMatch = true;
  for (const name of dbTables) {
    const n = db.prepare(`SELECT COUNT(*) AS n FROM "${name.replace(/"/g, '""')}"`).get().n;
    if (manifest.db.tables[name] !== n) {
      rowCountsMatch = false;
      failures.push(`table ${name}: manifest says ${manifest.db.tables[name]}, the snapshot holds ${n}`);
    }
  }
  for (const name of Object.keys(manifest.db.tables)) {
    if (!dbTables.includes(name)) {
      rowCountsMatch = false;
      failures.push(`table ${name}: in the manifest, missing from the snapshot`);
    }
  }
  verdicts.rowCountsMatch = rowCountsMatch;

  // Every object the snapshot's index names must stand on disk here.
  const indexedIds = db.prepare(`SELECT DISTINCT object_id AS id FROM blob_index`).all().map((r) => r.id);
  let indexedMissing = 0;
  for (const id of indexedIds) {
    if (!existsSync(join(dir, "blobs", "objects", id.slice(0, 2), id))) indexedMissing++;
  }
  verdicts.indexedObjectsOnDisk = indexedMissing === 0;
  if (indexedMissing > 0) failures.push(`${indexedMissing} indexed object(s) missing from the pulled blob store`);
} finally {
  db.close();
}

verdicts.blobHashesMatch = blobsVerified === objects.length;
verdicts.blobCountsMatch = objects.length === manifest.blobs.filesOnDisk && blobBytes === manifest.blobs.bytesOnDisk;
if (!verdicts.blobCountsMatch) {
  failures.push(`blob totals: pulled ${objects.length} objects / ${blobBytes} bytes; manifest says ${manifest.blobs.filesOnDisk} / ${manifest.blobs.bytesOnDisk}`);
}
verdicts.dbLengthMatchesDoor = doorDbLength === dbGot.bytes;
if (!verdicts.dbLengthMatchesDoor) {
  failures.push(`db length: the door declared ${doorDbLength} bytes, ${dbGot.bytes} arrived`);
}
verdicts.dbHashMatchesDoor = typeof doorDbHash === "string" && doorDbHash === dbGot.sha256;
if (!verdicts.dbHashMatchesDoor) {
  failures.push(`db hash: the door declared ${doorDbHash ?? "(no X-Snapshot-Sha256 header)"}, the received bytes hash to ${dbGot.sha256}`);
}

const receipt = {
  pulledAt: new Date().toISOString(),
  base,
  snapshotDir: dir,
  manifest: {
    dbBytes: manifest.db.bytes,
    totalRows: manifest.db.totalRows,
    tables: Object.keys(manifest.db.tables).length,
    blobFiles: manifest.blobs.filesOnDisk,
    blobBytes: manifest.blobs.bytesOnDisk,
    orphanFiles: manifest.blobs.orphanFiles,
    missingFiles: manifest.blobs.missingFiles,
  },
  db: { bytes: dbGot.bytes, sha256: dbGot.sha256 },
  blobs: { objects: objects.length, bytes: blobBytes, verifiedByRehash: blobsVerified },
  verdicts,
  failures,
  ok: failures.length === 0,
};
writeFileSync(join(dir, "SNAPSHOT.json"), JSON.stringify(receipt, null, 2));

if (receipt.ok) {
  note(`SNAPSHOT VERIFIED — db integrity ok, row counts match the manifest, ${blobsVerified} blobs re-hash to their names. Receipt: ${join(dir, "SNAPSHOT.json")}`);
} else {
  console.error(`SNAPSHOT NOT VERIFIED — ${failures.length} failure(s):`);
  for (const f of failures) console.error(`  · ${f}`);
  process.exit(1);
}
