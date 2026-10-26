// THE EXPORT DOOR (Nigel, 2026-10-26: "prepare the export door and
// snapshot") — one purpose, read-only: let the Keeper pull a provable,
// point-in-time copy of the whole living world — app.db plus the blob
// store — for the Vultr move and, later, for standing backups.
// Runbook: ~/workspace/vultr-move-runbook-2026-10-26.md, Phase 0.
//
// The door exists ONLY while EXPORT_TOKEN is set in the environment
// (Nigel sets it in the Railway variables, the way WORKSHOP_PASSWORD
// is set). Unset, every route below answers 404 — as if the door was
// never built. The token is a dedicated env secret: NOT a Tender
// session token, NOT the workshop password, never tied to a game
// account. It is compared by SHA-256 digest under timingSafeEqual
// (the workshopAuth pattern) and is never logged or echoed.
//
// Consistency, stated plainly: /api/export/db takes its copy through
// SQLite's online backup API (better-sqlite3's .backup()), so the
// snapshot is one atomic moment while the world keeps writing; and
// every blob was fully written before its blob_index row exists (the
// store's own write order in store.ts), so an indexed blob pulled by
// its hash is always whole. Blobs are content-addressed — each file
// is named by the SHA-256 of its own bytes — so the puller proves
// every object by re-hashing it.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, createReadStream, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { Express, Request, Response } from "express";
import { DATA_DIR, sqlite } from "./store.js";

const OBJECTS_DIR = join(DATA_DIR, "blobs", "objects");
const HASH_RE = /^[0-9a-f]{64}$/;

/** The door's token floor (FLOP fix, 2026-10-26): a set-but-
 *  short EXPORT_TOKEN is treated as UNSET — the door closes
 *  uniformly (404), fail-closed in configuration as in auth. */
export const EXPORT_TOKEN_MIN = 32;

export function exportDoorEnabled(): boolean {
  return (process.env.EXPORT_TOKEN ?? "").length >= EXPORT_TOKEN_MIN;
}

/** Digest-compared bearer check. The token itself is never logged. */
function tokenMatches(req: Request): boolean {
  const expected = process.env.EXPORT_TOKEN ?? "";
  if (!expected) return false;
  const header = req.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const offered = header.slice("Bearer ".length);
  if (!offered) return false;
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(offered), digest(expected));
}

type ObjectOnDisk = { objectId: string; size: number };

/** Every object file under blobs/objects/<2 hex>/<sha256>, sorted by id. */
function walkObjects(): ObjectOnDisk[] {
  const out: ObjectOnDisk[] = [];
  if (!existsSync(OBJECTS_DIR)) return out;
  for (const shard of readdirSync(OBJECTS_DIR)) {
    const shardDir = join(OBJECTS_DIR, shard);
    if (!statSync(shardDir).isDirectory()) continue;
    for (const name of readdirSync(shardDir)) {
      const path = join(shardDir, name);
      const st = statSync(path);
      if (st.isFile()) out.push({ objectId: name, size: st.size });
    }
  }
  out.sort((a, b) => (a.objectId < b.objectId ? -1 : a.objectId > b.objectId ? 1 : 0));
  return out;
}

function tableRowCounts(): Record<string, number> {
  const tables = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
    .all() as { name: string }[];
  const counts: Record<string, number> = {};
  for (const { name } of tables) {
    const row = sqlite.prepare(`SELECT COUNT(*) AS n FROM "${name.replace(/"/g, '""')}"`).get() as { n: number };
    counts[name] = row.n;
  }
  return counts;
}

function buildManifest() {
  const files = walkObjects();
  const bytesOnDisk = files.reduce((sum, f) => sum + f.size, 0);
  const indexed = sqlite
    .prepare(`SELECT COUNT(DISTINCT object_id) AS objects, COALESCE(SUM(size_bytes), 0) AS bytes FROM (SELECT DISTINCT object_id, size_bytes FROM blob_index)`)
    .get() as { objects: number; bytes: number };
  const indexedIds = new Set(
    (sqlite.prepare(`SELECT DISTINCT object_id AS id FROM blob_index`).all() as { id: string }[]).map((r) => r.id)
  );
  const onDisk = new Set(files.map((f) => f.objectId));
  let orphanFiles = 0;
  for (const id of onDisk) if (!indexedIds.has(id)) orphanFiles++;
  let missingFiles = 0;
  for (const id of indexedIds) if (!onDisk.has(id)) missingFiles++;
  const tables = tableRowCounts();
  const dbPath = join(DATA_DIR, "app.db");
  return {
    generatedAt: new Date().toISOString(),
    dataDirName: basename(DATA_DIR),
    db: {
      bytes: existsSync(dbPath) ? statSync(dbPath).size : 0,
      tables,
      totalRows: Object.values(tables).reduce((a, b) => a + b, 0),
    },
    blobs: {
      indexedObjects: indexed.objects,
      indexedBytes: indexed.bytes,
      filesOnDisk: files.length,
      bytesOnDisk,
      orphanFiles,
      missingFiles,
    },
  };
}

/**
 * Mount the door. Disabled (no EXPORT_TOKEN), the four routes answer
 * 404 so the surface does not exist in any observable way.
 */
export function registerExportDoor(app: Express): void {
  // ORPHANED SNAPSHOTS SWEPT (FLOP fix, 2026-10-26): a door
  // process killed mid-download leaves its snapshot temp in
  // the data dir — a whole copy of the world sitting behind
  // no guard but the filesystem. Every leftover is swept at
  // registration, before this process can write one of its
  // own; a live download's temp is never another boot's.
  try {
    for (const name of readdirSync(DATA_DIR)) {
      if (name.startsWith(".export-snapshot-") && name.endsWith(".db")) {
        rmSync(join(DATA_DIR, name), { force: true });
      }
    }
  } catch { /* no data dir yet — nothing to sweep */ }

  const guard = (req: Request, res: Response): boolean => {
    if (!exportDoorEnabled()) {
      res.status(404).json({ error: "Not found." });
      return false;
    }
    if (!tokenMatches(req)) {
      res.status(401).json({ error: "The export door does not know that token." });
      return false;
    }
    return true;
  };

  app.get("/api/export/manifest", (req, res) => {
    if (!guard(req, res)) return;
    try {
      res.json(buildManifest());
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "The manifest could not be read." });
    }
  });

  app.get("/api/export/db", async (req, res) => {
    if (!guard(req, res)) return;
    // Snapshot beside the world (same filesystem), under a name no
    // other reader walks: the blob walker only reads blobs/objects/.
    const tmp = join(DATA_DIR, `.export-snapshot-${process.pid}-${randomBytes(6).toString("hex")}.db`);
    try {
      await sqlite.backup(tmp);
      // The snapshot belongs to its owner alone while it
      // stands (FLOP fix, 2026-10-26).
      chmodSync(tmp, 0o600);
      const { size } = statSync(tmp);
      // The snapshot's own hash rides with it, so the puller
      // proves what ARRIVED against what the door SENT —
      // against the door's word, not against the received
      // file read back against itself (FLOP fix, 2026-10-26).
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(tmp)) hash.update(chunk as Buffer);
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Length", String(size));
      res.setHeader("X-Snapshot-Sha256", hash.digest("hex"));
      res.setHeader("Content-Disposition", 'attachment; filename="app.db"');
      const stream = createReadStream(tmp);
      stream.on("close", () => rmSync(tmp, { force: true }));
      stream.on("error", () => {
        rmSync(tmp, { force: true });
        if (!res.headersSent) res.status(500).json({ error: "The snapshot stream failed." });
        else res.destroy();
      });
      stream.pipe(res);
    } catch (error) {
      rmSync(tmp, { force: true });
      if (!res.headersSent) {
        res.status(500).json({ error: error instanceof Error ? error.message : "The snapshot could not be taken." });
      }
    }
  });

  app.get("/api/export/blobs", (req, res) => {
    if (!guard(req, res)) return;
    try {
      const objects = walkObjects().map((f) => ({
        objectId: f.objectId,
        path: `${f.objectId.slice(0, 2)}/${f.objectId}`,
        size: f.size,
      }));
      res.json({ generatedAt: new Date().toISOString(), count: objects.length, objects });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "The blob list could not be read." });
    }
  });

  app.get("/api/export/blob/:objectId", (req, res) => {
    if (!guard(req, res)) return;
    const objectId = req.params.objectId;
    // Strict hash shape only — no separators, no traversal, ever.
    if (!HASH_RE.test(objectId)) {
      res.status(400).json({ error: "That is not a blob hash." });
      return;
    }
    const path = join(OBJECTS_DIR, objectId.slice(0, 2), objectId);
    if (!existsSync(path)) {
      res.status(404).json({ error: "No such object." });
      return;
    }
    const { size } = statSync(path);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", String(size));
    const stream = createReadStream(path);
    stream.on("error", () => {
      if (!res.headersSent) res.status(500).json({ error: "The object stream failed." });
      else res.destroy();
    });
    stream.pipe(res);
  });

  if (exportDoorEnabled()) {
    console.log("[export] the export door is OPEN — EXPORT_TOKEN is set; world snapshots can be pulled at /api/export/*.");
  }
}
