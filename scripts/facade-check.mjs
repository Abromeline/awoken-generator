#!/usr/bin/env node
/**
 * FACADE CHECK — part of the FLOP gate (Nigel, 2026-10-12).
 *
 * BUILD HONESTLY law: nothing ships with a face only. This script hunts the
 * mechanical signatures of a facade:
 *
 *   1. Building types whose name appears in server code ONLY in their
 *      definition and config defaults — never in a mechanic.
 *   2. Building config fields (damage, powerBonus, …) that are defined in
 *      the config builder but never READ anywhere else — a promised effect
 *      no code executes.
 *   3. Client API actions with no server handler behind them — buttons
 *      wired to nothing.
 *
 * It cannot judge description text or game feel; the manual FLOP pass still
 * compares every player-facing promise against the code. But a failure here
 * means a facade, full stop. Exit 1 on any flag. Waivers are Nigel's call,
 * recorded in the commit message — never silent.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const actions = read("server/src/actions.ts");
const serverFiles = readdirSync(join(root, "server/src"))
  .filter((f) => f.endsWith(".ts"))
  .map((f) => read(`server/src/${f}`));
const serverAll = serverFiles.join("\n");

let failures = 0;
const flag = (msg) => { failures++; console.log(`  ✗ FACADE: ${msg}`); };
const ok = (msg) => console.log(`  ✓ ${msg}`);

// --- 1. Building type liveness -------------------------------------------
console.log("Building types — is each one consumed by a mechanic?");
const defsStart = actions.indexOf("export const BUILDING_DEFS");
const defsEnd = actions.indexOf("\n};", defsStart);
const defsBlock = actions.slice(defsStart, defsEnd);
const types = [...defsBlock.matchAll(/"([a-z][a-z0-9-]*)":\s*{\s*name:/g)].map((m) => m[1]);

// Config-builder region: from the getGameConfig/buildings assembly to the defs.
const cfgStart = actions.lastIndexOf("overrides", defsStart);
const cfgRegionStart = actions.lastIndexOf("function", defsStart) > 0 ? actions.lastIndexOf("function", defsStart) : cfgStart;

const cfgFnStart = actions.indexOf("async function loadGameConfig()");
const inConfig = (idx) => idx > cfgFnStart && idx < defsStart;
for (const type of types) {
  const needle = `"${type}"`;
  let mechanicRefs = 0;
  let idx = 0;
  for (const line of actions.split("\n")) {
    const lineStart = idx; idx += line.length + 1;
    if (!line.includes(needle)) continue;
    if (lineStart > defsStart && lineStart < defsEnd) continue;   // the def itself
    if (inConfig(lineStart)) continue;                            // config assembly/defaults
    mechanicRefs++;
  }
  if (mechanicRefs === 0) flag(`"${type}" is defined and sold in the build menu, but no mechanic anywhere references it.`);
  else ok(`"${type}" — ${mechanicRefs} mechanic reference(s)`);
}

// --- 2. Config fields defined but never read ------------------------------
console.log("Building config fields — is each promised effect read by code?");
const assignments = [...actions.matchAll(/overrides\["building\.([a-z0-9-]+)\.([a-zA-Z]+)"\]/g)];
const fieldsByType = new Map();
for (const [, type, field] of assignments) {
  if (!fieldsByType.has(type)) fieldsByType.set(type, new Set());
  fieldsByType.get(type).add(field);
}
// Fields that are structural (consumed generically via the def spread).
const STRUCTURAL = new Set(["cost", "buildMinutes", "enabled", "upkeepPerHour", "growHours", "harvestEnergy", "energyBonus"]);
for (const [type, fields] of fieldsByType) {
  for (const field of fields) {
    if (STRUCTURAL.has(field)) continue;
    // A real read names the building config as the receiver — a bare
    // `.damage` on an enemy or a hit report does not count.
    const reads = actions.split("\n").filter((l, i) => {
      const pos = actions.split("\n").slice(0, i).join("\n").length;
      if (inConfig(pos) || (pos > defsStart && pos < defsEnd)) return false;
      return /building/i.test(l) && l.includes(`.${field}`);
    }).length;
    if (reads === 0) flag(`"${type}.${field}" is defined in config but never read — the effect it promises does not execute.`);
    else ok(`"${type}.${field}" — read in ${reads} place(s)`);
  }
}

// --- 3. Client actions without server handlers ----------------------------
console.log("Client actions — does every call have a server handler?");
const api = read("client/src/api.ts");
const clientActions = new Set([...api.matchAll(/post(?:<[^>]*>)?\(\s*"([a-zA-Z]+)"/g)].map((m) => m[1]));
const handlers = new Set([...actions.matchAll(/^\s+async ([a-zA-Z]+)\(/gm)].map((m) => m[1]));
const missing = [...clientActions].filter((a) => !handlers.has(a));
if (missing.length) for (const a of missing) flag(`client calls "${a}" but no server handler exists.`);
else ok(`all ${clientActions.size} client actions have handlers`);

console.log(failures ? `\nFACADE CHECK FAILED — ${failures} facade(s). Do not push.` : "\nFacade check passed — every face has machinery behind it.");
process.exit(failures ? 1 : 0);
