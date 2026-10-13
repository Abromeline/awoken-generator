#!/usr/bin/env node
/**
 * Schema audit — the drift catcher.
 *
 * The production crashes in this project's history (thorns column, element
 * column, site_colors) all share one shape: the drizzle schema in
 * server/src/schema.ts declares a column, the code reads it, but the DDL in
 * server/src/store.ts never creates it on an existing database (CREATE
 * TABLE IF NOT EXISTS does not add columns to tables that already exist —
 * only ALTER TABLE ... ADD COLUMN does).
 *
 * This audit compares, for every table:
 *   EXPECTED   — columns declared in schema.ts (what the code may read)
 *   GUARANTEED — columns store.ts DDL creates (CREATE TABLE bodies, plus
 *                every ALTER ... ADD COLUMN, plus rebuild staging tables
 *                named <table>_* whose contents are renamed into place)
 * and fails if any expected column is not guaranteed.
 *
 * Heuristic by design (regex + brace matching, no AST). It errs toward
 * reporting; a false alarm is a minute of reading, a missed drift is an
 * outage.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemaSrc = readFileSync(join(root, "server/src/schema.ts"), "utf8");
const storeSrc = readFileSync(join(root, "server/src/store.ts"), "utf8");

/** Return the substring spanning a balanced open/close pair from `start`. */
function balanced(src, start, open, close) {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close) {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return src.slice(start);
}

// --- EXPECTED: columns per table from the drizzle schema -------------------
const expected = new Map(); // table -> Set<column>
for (const m of schemaSrc.matchAll(/sqliteTable\(\s*"([a-z0-9_]+)"/g)) {
  const table = m[1];
  const braceStart = schemaSrc.indexOf("{", m.index);
  const body = balanced(schemaSrc, braceStart, "{", "}");
  const cols = new Set();
  for (const cm of body.matchAll(/(?:integer|text|real|blob)\(\s*"([a-z0-9_]+)"/g)) {
    cols.add(cm[1]);
  }
  expected.set(table, cols);
}

// --- GUARANTEED: columns per table from store.ts DDL -----------------------
const guaranteed = new Map();
const guarantee = (table, col) => {
  if (!guaranteed.has(table)) guaranteed.set(table, new Set());
  guaranteed.get(table).add(col);
};
const SKIP_FIRST = new Set(["PRIMARY", "FOREIGN", "UNIQUE", "CHECK", "CONSTRAINT"]);

for (const m of storeSrc.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([a-z0-9_]+)\s*\(/gi)) {
  const table = m[1].toLowerCase();
  const parenStart = storeSrc.indexOf("(", m.index + m[0].length - 1);
  const body = balanced(storeSrc, parenStart, "(", ")");
  // Split top-level commas (defaults may contain parens).
  let depth = 0, cur = "";
  const defs = [];
  for (const ch of body.slice(1, -1)) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { defs.push(cur); cur = ""; }
    else cur += ch;
  }
  if (cur.trim()) defs.push(cur);
  for (const def of defs) {
    const first = def.trim().split(/\s+/)[0]?.replace(/["`[\]]/g, "");
    if (first && !SKIP_FIRST.has(first.toUpperCase())) guarantee(table, first.toLowerCase());
  }
}
for (const m of storeSrc.matchAll(/ALTER TABLE\s+([a-z0-9_]+)\s+ADD\s+(?:COLUMN\s+)?([a-z0-9_]+)/gi)) {
  guarantee(m[1].toLowerCase(), m[2].toLowerCase());
}
// Loop-driven migrations: for (const col of ["level INTEGER ...", ...])
// { sqlite.exec(`ALTER TABLE t ADD COLUMN ${col}`) } — the column names live
// in the array literal, the table in the exec. Associate each dynamic ALTER
// with the nearest preceding string-array loop.
for (const m of storeSrc.matchAll(/ALTER TABLE\s+([a-z0-9_]+)\s+ADD\s+COLUMN\s+\$\{/gi)) {
  const before = storeSrc.slice(0, m.index);
  const loops = [...before.matchAll(/for\s*\(\s*const\s+\w+\s+of\s*\[([^\]]+)\]\s*\)/g)];
  const last = loops[loops.length - 1];
  if (!last) continue;
  for (const sm of last[1].matchAll(/"([a-z0-9_]+)\s+(?:INTEGER|TEXT|REAL|BLOB)/gi)) {
    guarantee(m[1].toLowerCase(), sm[1].toLowerCase());
  }
}

// --- Compare ---------------------------------------------------------------
console.log("Schema audit — does the DDL guarantee every column the code expects?");
let missing = 0;
for (const [table, cols] of [...expected.entries()].sort()) {
  const have = new Set(guaranteed.get(table) ?? []);
  // Rebuild staging tables (<table>_v2, <table>_new, ...) are renamed into
  // place, so their columns count toward the guarantee.
  for (const [t, cs] of guaranteed) {
    if (t.startsWith(table + "_")) for (const c of cs) have.add(c);
  }
  for (const col of cols) {
    if (!have.has(col)) {
      console.log(`  ✗ ${table}.${col} — declared in schema.ts, never created in store.ts DDL`);
      missing++;
    }
  }
}
if (missing > 0) {
  console.log(`\nSchema audit FAILED — ${missing} column(s) would be missing on a migrated database.`);
  console.log("Add an ALTER TABLE ... ADD COLUMN (or a rebuild) in store.ts for each.");
  process.exit(1);
}
console.log(`  ✓ all columns across ${expected.size} tables are guaranteed by the DDL`);
