#!/usr/bin/env node
/**
 * FACADE CHECK — part of the FLOP gate (Nigel, 2026-10-12).
 *
 * BUILD HONESTLY law: nothing ships with a face only. This script hunts the
 * mechanical signatures of a facade, on BOTH sides of the wire (an earlier
 * server-only version missed real client-side battle mechanics — the check
 * itself must be honest):
 *
 *   1. Building types whose name appears ONLY in their definition, config
 *      defaults, or art maps — never in a mechanic, server or client.
 *   2. Building config fields (damage, powerBonus, …) that are defined in
 *      the config builder but never READ by mechanic code anywhere — a
 *      promised effect no code executes. (A read must name the building
 *      config as its source; a bare `.damage` on an enemy does not count,
 *      and neither does the workshop's own defaults table.)
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
  .map((f) => ({ name: f, text: read(`server/src/${f}`) }));
// Client files that hold art maps / workshop defaults rather than mechanics.
const ART_OR_CONFIG_FILES = new Set(["BuildingMenu.tsx", "UIWorkspace.tsx", "api.ts"]);
const clientFiles = readdirSync(join(root, "client/src"))
  .filter((f) => (f.endsWith(".ts") || f.endsWith(".tsx")))
  .map((f) => ({ name: f, text: read(`client/src/${f}`) }));

let failures = 0;
const flag = (msg) => { failures++; console.log(`  ✗ FACADE: ${msg}`); };
const ok = (msg) => console.log(`  ✓ ${msg}`);

// Regions of actions.ts that are definition/config, not mechanics.
const defsStart = actions.indexOf("export const BUILDING_DEFS");
const defsEnd = actions.indexOf("\n};", defsStart);
const cfgFnStart = actions.indexOf("async function loadGameConfig()");
const inDefs = (idx) => idx > defsStart && idx < defsEnd;
const inConfig = (idx) => idx > cfgFnStart && idx < defsStart;
const isConfigKeyLine = (line) => /"building\.[a-z0-9-]+\.[a-zA-Z]+"\s*:/.test(line);

// --- 1. Building type liveness -------------------------------------------
console.log("Building types — is each one consumed by a mechanic?");
const defsBlock = actions.slice(defsStart, defsEnd);
const types = [...defsBlock.matchAll(/"([a-z][a-z0-9-]*)":\s*{\s*name:/g)].map((m) => m[1]);

for (const type of types) {
  const needle = `"${type}"`;
  let mechanicRefs = 0;
  // Server (actions.ts with regions; other server files count wholesale)
  let idx = 0;
  for (const line of actions.split("\n")) {
    const lineStart = idx; idx += line.length + 1;
    if (!line.includes(needle)) continue;
    if (inDefs(lineStart) || inConfig(lineStart)) continue;
    mechanicRefs++;
  }
  for (const f of serverFiles) {
    if (f.name === "actions.ts") continue;
    mechanicRefs += f.text.split("\n").filter((l) => l.includes(needle)).length;
  }
  // Client mechanics (art maps and workshop config files don't count)
  for (const f of clientFiles) {
    if (ART_OR_CONFIG_FILES.has(f.name)) continue;
    mechanicRefs += f.text.split("\n").filter((l) => l.includes(needle) && !isConfigKeyLine(l)).length;
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
// Fields consumed generically via the def/config spread.
const STRUCTURAL = new Set(["cost", "buildMinutes", "enabled", "upkeepPerHour", "growHours", "harvestEnergy", "energyBonus"]);
const fieldReadIn = (text, field, regionFilter) => {
  let n = 0, idx = 0;
  for (const line of text.split("\n")) {
    const lineStart = idx; idx += line.length + 1;
    if (regionFilter && !regionFilter(lineStart)) continue;
    if (isConfigKeyLine(line)) continue;
    if (/building/i.test(line) && line.includes(`.${field}`)) n++;
  }
  return n;
};
for (const [type, fields] of fieldsByType) {
  for (const field of fields) {
    if (STRUCTURAL.has(field)) continue;
    let reads = fieldReadIn(actions, field, (pos) => !inConfig(pos) && !inDefs(pos));
    for (const f of clientFiles) reads += fieldReadIn(f.text, field, null);
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
