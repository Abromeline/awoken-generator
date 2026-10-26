#!/usr/bin/env node
/**
 * pillar-audit — the pillar numbers live in TWO registries: the
 * server's (server/src/actions.ts — standingPillars, the law the
 * world settles by) and the client's mirror (client/src/
 * Territory.tsx — the stride the player feels). No shared-
 * constants route exists between the two builds, so this audit
 * is the single-sourcing: it reads the three radii and the two
 * drawn-seat offsets out of both files and FAILS if any pair
 * disagrees. Drift here would mean the map the player walks is
 * not the world the server settles — silently. Runs in prepush.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const server = readFileSync(join(root, "server/src/actions.ts"), "utf8");
const client = readFileSync(join(root, "client/src/Territory.tsx"), "utf8");

let failures = 0;
const fail = (msg) => { failures++; console.error(`  ✗ ${msg}`); };

function radiusOf(src, name) {
  const m = src.match(new RegExp(`PILLAR_RADIUS_${name}\\s*=\\s*([0-9.]+)`));
  return m ? Number(m[1]) : null;
}
for (const name of ["TOWER", "SAPLING", "BEACON"]) {
  const s = radiusOf(server, name), c = radiusOf(client, name);
  if (s === null) fail(`server registry: PILLAR_RADIUS_${name} not found in server/src/actions.ts`);
  else if (c === null) fail(`client mirror: PILLAR_RADIUS_${name} not found in client/src/Territory.tsx`);
  else if (s !== c) fail(`PILLAR_RADIUS_${name} drifts: server ${s} vs client ${c}`);
  else console.log(`  ✓ PILLAR_RADIUS_${name} = ${s} on both grounds`);
}

function seatOffsetsOf(src, file) {
  const m = src.match(/PILLAR_SEAT_OFFSETS\s*=\s*\[([\s\S]*?)\];/);
  if (!m) { fail(`PILLAR_SEAT_OFFSETS not found in ${file}`); return null; }
  const pairs = [...m[1].matchAll(/\{\s*dq:\s*(-?[0-9.]+),\s*dr:\s*(-?[0-9.]+)\s*\}/g)]
    .map((p) => ({ dq: Number(p[1]), dr: Number(p[2]) }));
  if (pairs.length !== 2) { fail(`PILLAR_SEAT_OFFSETS in ${file}: expected 2 seats, read ${pairs.length}`); return null; }
  return pairs;
}
const sSeats = seatOffsetsOf(server, "server/src/actions.ts");
const cSeats = seatOffsetsOf(client, "client/src/Territory.tsx");
if (sSeats && cSeats) {
  for (let i = 0; i < 2; i++) {
    if (sSeats[i].dq !== cSeats[i].dq || sSeats[i].dr !== cSeats[i].dr) {
      fail(`PILLAR_SEAT_OFFSETS[${i}] drifts: server {dq: ${sSeats[i].dq}, dr: ${sSeats[i].dr}} vs client {dq: ${cSeats[i].dq}, dr: ${cSeats[i].dr}}`);
    } else {
      console.log(`  ✓ PILLAR_SEAT_OFFSETS[${i}] = {dq: ${sSeats[i].dq}, dr: ${sSeats[i].dr}} on both grounds`);
    }
  }
}

if (failures) {
  console.error(`\nPILLAR AUDIT FAILED — ${failures} drift(s). The server registry (server/src/actions.ts) is the source; bring the client mirror to it, or rule a new number and change both together.`);
  process.exit(1);
}
console.log("PILLAR AUDIT PASSED — radii and drawn seats agree on both grounds.");
