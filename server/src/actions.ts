// Port of server/src/actions.ts from the Muse-space original.
// Every handler keeps the original validation shapes and behavior; only the
// runtime bindings changed: `ctx.db` -> the local drizzle instance,
// `ctx.blobs` -> the content-addressed blob store, `ctx.inference.complete`
// -> the curated naming/flavor pools in naming.ts.

import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { and, asc, desc, eq, inArray, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, blobs, schema, sqlite } from "./store.js";
import { mysticalPieceName, birthFlavorText } from "./naming.js";
import { creditBalance, grantCredits, spendWakeCredit, SINGLE_OWNER } from "./credits.js";
import { awardWakeExp, getTenderProgress, levelForExp } from "./tenderExp.js";
import { CREDITS_PER_PACK, PACK_PRICE_CENTS, PRICE_PER_WAKE_CENTS, formatUsd, DISCORD_STORIES_WEBHOOK_URL } from "./config.js";
import { stripeReady } from "./stripe.js";
import {
  claimTender, destroySession, destroyTenderSessions, loginTender, newTenderNameSuggestion,
  publicTender, setTenderName, suggestTenderCode, tenderOwnerKey,
  type TenderRow,
  requestPasswordReset, resetPasswordWithToken } from "./tenders.js";
import { adoptVisitorState } from "./adopt.js";
import { refreshGrimoire, saveGrimoire, spellByKey, hpForCast, spendAttunement, attunementPools, attunementLevel, pageAttunementsFor, pageTotalSlots, pageSlotsCastFor, pageHueFor, fillPageSlot, pourLaidFor, PAGE_SLOTS, SLOT_COST, POUR_ENGINES, ENGINE_KEYS, type GrimoireState, type GrimoireSpell } from "./grimoire.js";
import { liveNodes, liveEdges, liveById, liveAdj, zodiacGraph, upsertNode, deleteNode, addEdge, deleteEdge, resetGraph, FX_PALETTE, BESPOKE_IDS } from "./zodiacLive.js";
import { workingEffects, skillAttunementGrants, attuneReachFor, summonersPowerFor, fxSum, companyAcBonusFor, companyAttackBonusFor, curseReliefFor, bindingHealBonusFor, bindingHealRangeFor, witchCastCostFor, witchMiscastRefundFor } from "./skills.js";
import { partyIdsFor, partyCapFor, partyCountFor, tryAddPartyMember, removePartyMember, isPartyMember } from "./party.js";
// HOMELAND CASTING (Nigel, 2026-10-20): the homeland rolls
// through the Table's OWN casting reckoning — castModFor is
// imported, never copied, so the two grounds can never drift
// apart on what a class's cast is worth. (table.ts already
// imports this module; the binding is only ever called at
// request time, long after both modules stand.)
import { castModFor, partyBattleSeatFor } from "./table.js";
import { enemyACFor, enemyArmorBonus, ENEMY_AC_BASE, ENEMY_ARMOR_DEFAULTS } from "./enemyAC.js";
import { rollFellDrops, drainDropNotices, inventoryView, trySpendRuneShards } from "./drops.js";
export { enemyACFor, ENEMY_AC_BASE, ENEMY_ARMOR_DEFAULTS } from "./enemyAC.js";
import { storyPromptFor, storyThreadNameFor } from "./storyPrompts.js";
import {
  matchCandidate, edgesOf, edgeKeyOf, plateToAxial, pointInPolygon,
  collisionSegments, segmentsCrossProper, type Pt,
} from "./buildGeometry.js";
// (Build collision is judged by the geometry module's PROPER
// crossing test: a step is barred when it passes through a
// wall's span, never when it merely touches a wall's end — a
// wall on a wedge's radial edge ends at a hex's centre, and
// the touching-counts test below, the Ward T's reckoning,
// would bar every road into that hex. That test stays exactly
// as it was for the reckonings built on it.)
import {
  WORLD_MOOD_TO_PLAYLIST, playlistForMood,
  type LibraryTrack,
} from "./musicMoods.js";

export interface ActionContext {
  /** Browser-visitor mark from the X-Visitor-Id header (null when absent). */
  visitorId: string | null;
  /** Logged-in Tender from the X-Tender-Token header (null when absent). */
  tender: TenderRow | null;
  /** The session token that produced `tender` (null when not logged in). */
  tenderToken?: string | null;
  /** Whether the request carries a live workshop token (true when the
   *  workshop lock is disabled, matching requireWorkshop's semantics). */
  workshopAuthorized?: boolean;
}

/** Owner key for credits, welcome state, and deck ownership. */
function ownerKeyFor(ctx?: ActionContext): string {
  if (ctx?.tender) return tenderOwnerKey(ctx.tender.id);
  return ctx?.visitorId ?? SINGLE_OWNER;
}

/** Display name for newly woken creatures. */
function ownerNameFor(ctx?: ActionContext): string {
  return ctx?.tender?.tenderName ?? "Tender";
}

/** The PNG truth test uploadLayerAsset applies: the real 8-byte signature
 *  and at least an IHDR's worth of bytes. Anything else is not a PNG,
 *  whatever its filename or declared type claims. */
function assertPngBytes(bytes: Buffer): void {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 26 || !signature.every((byte, index) => bytes[index] === byte)) {
    badRequest("That file is not a true PNG.");
  }
}

// --- Pending newborn claims -------------------------------------------------
// A newborn is EARNED, never asserted. The server-side event that
// qualifies records one claim in pending_newborn_claims, and the birth
// endpoint (birthNewbornToHand) consumes exactly one
// claim per birth. Before this ledger existed, birthNewbornToHand
// granted a paid wake credit to any caller on demand — an open mint on
// the credits Stripe sells. (Corrected 2026-10-15: purification events
// recorded claims when the ledger was built, but Nigel's 2026-10-14
// ruling abolished purification births and those recording sites were
// removed; since the War-Ground fix the ONLY recording site was a
// verified boss victory in resolveBossBattle.)
// (Abolition, Nigel 2026-10-24: the staged boss battle mode no longer
// exists — "that battle mode should no longer exist and its triggers
// should go too" — so resolveBossBattle is gone, and with it the last
// recording site. recordNewbornClaim, its recording helper, goes with
// its only caller. The ledger and the birth endpoint STAND: no living
// system records a claim today, birthNewbornToHand refuses every
// birth, and claims will be recorded again by the next qualifying
// event — creation belongs to the Awoken Forge Nigel plans.)

/** Take the owner's oldest pending claim, atomically — a claim pays out
 *  exactly once, even if two birth calls race. */
function consumeNewbornClaim(ownerKey: string): boolean {
  return sqlite.transaction(() => {
    const row = sqlite.prepare("SELECT MIN(id) AS id FROM pending_newborn_claims WHERE owner_key = ?")
      .get(ownerKey) as { id: number | null } | undefined;
    if (!row || row.id == null) return false;
    return sqlite.prepare("DELETE FROM pending_newborn_claims WHERE id = ?").run(row.id).changes === 1;
  })();
}

// --- Hex walls ---------------------------------------------------------------
// Edge geometry shared by placeWall and battle-damage reporting. Dirs
// follow the client's painted-face corner order (0 = top edge, then
// clockwise): WALL_DIRS[d] is the axial neighbour across edge d and
// WALL_OPP[d] is the same edge seen from that neighbour.
const WALL_DIRS: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];
const WALL_OPP: ReadonlyArray<number> = [3, 4, 5, 0, 1, 2];

/** Apply battle-reported wall damage: reported HP only ever LOWERS a
 *  wall (a client cannot heal or raise walls by reporting), and a
 *  wall at 0 is gone. Reports for unknown edges are ignored. Only the
 *  barrier works (wall, ward) carry HP — a damage report can never
 *  touch thorns or runes. */
function applyWallDamage(ownerKey: string, wallState: unknown): void {
  if (!Array.isArray(wallState)) return;
  for (const w of wallState.slice(0, 200)) {
    const edgeKey = (w as any)?.edgeKey;
    const hp = (w as any)?.hp;
    if (typeof edgeKey !== "string" || typeof hp !== "number" || !Number.isFinite(hp)) continue;
    const row = sqlite.prepare("SELECT hp, kind FROM hex_walls WHERE owner_key = ? AND edge_key = ?").get(ownerKey, edgeKey) as { hp: number; kind: string } | undefined;
    if (!row) continue;
    if (row.kind !== "wall" && row.kind !== "ward") continue;
    const next = Math.max(0, Math.min(row.hp, Math.floor(hp)));
    if (next === row.hp) continue;
    if (next <= 0) sqlite.prepare("DELETE FROM hex_walls WHERE owner_key = ? AND edge_key = ?").run(ownerKey, edgeKey);
    else sqlite.prepare("UPDATE hex_walls SET hp = ? WHERE owner_key = ? AND edge_key = ?").run(next, ownerKey, edgeKey);
  }
}

/** The map's Written Light, reckoned at a battle's resolution
 *  (the Grimoire, Nigel 2026-10-17): the sims report the state of
 *  every standing working the fight touched — hp / stops /
 *  charges only ever move as their engine allows, and a working
 *  reported spent is lifted from the land. Energy the workings
 *  yielded (an Engine's song, a Coil's returns) is granted here,
 *  capped by the Tender's own max, and never invented: no
 *  report, no yield. */
async function applyGrimoireState(ownerKey: string, grimState: unknown, grimEnergy: unknown): Promise<void> {
  if (Array.isArray(grimState)) {
    for (const g of grimState.slice(0, 200)) {
      const id = (g as any)?.id;
      if (typeof id !== "number" || !Number.isFinite(id)) continue;
      const row = sqlite.prepare("SELECT id, hp, stops, charges FROM territory_workings WHERE owner_key = ? AND id = ?").get(ownerKey, id) as any;
      if (!row) continue;
      if ((g as any)?.spent === true) {
        sqlite.prepare("DELETE FROM territory_workings WHERE owner_key = ? AND id = ?").run(ownerKey, id);
        continue;
      }
      const clamp = (v: unknown, cur: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100000, Math.floor(v))) : cur);
      sqlite.prepare("UPDATE territory_workings SET hp = ?, stops = ?, charges = ? WHERE owner_key = ? AND id = ?")
        .run(clamp((g as any)?.hp, row.hp), clamp((g as any)?.stops, row.stops), clamp((g as any)?.charges, row.charges), ownerKey, id);
    }
  }
  if (typeof grimEnergy === "number" && Number.isFinite(grimEnergy) && grimEnergy > 0) {
    const gain = Math.min(500, Math.floor(grimEnergy));
    const current = await getEnergyFor(ownerKey);
    const max = await calculateMaxEnergy(ownerKey);
    const next = Math.min(max, current + gain);
    if (next > current) {
      await db.update(schema.tenderResources)
        .set({ energy: next, updatedAt: new Date() })
        .where(eq(schema.tenderResources.ownerKey, ownerKey));
    }
  }
}

// --- Edge works (War-Ground, Nigel 2026-10-15) ------------------------------
// The four works an edge may carry — ONE per edge, six per hex:
//   wall   blocks passage, does no damage; any Awoken standing (HP 10)
//   thorns passage allowed but slowed; any Awoken standing (growth —
//          no HP, and the one work that cannot be strengthened)
//   ward   a wall of the other kind: blocks or traps EVERY reach,
//          fliers included; WARDING hands only (HP 15)
//   rune   a trap, not a barrier; RUNEING hands only; kind chosen at
//          casting — snare (stops, no damage) / harm (heavy damage,
//          no stop) / meld (some of both). One-shot: sprung is spent.
// Walls, wards and runes can be STRENGTHENED: each strengthening
// doubles the work's strength and costs exponentially more energy.
// Costs are stems (War-Ground, 2026-10-15) — retune by Nigel's ear.
const EDGE_WORK: Record<string, { cost: number; hp: number; name: string }> = {
  wall: { cost: 2, hp: 10, name: "Wall" },
  thorns: { cost: 1, hp: 0, name: "Thorns" },
  ward: { cost: 3, hp: 15, name: "Ward" },
  rune: { cost: 3, hp: 0, name: "Rune" },
};
const RUNE_KINDS: ReadonlyArray<string> = ["snare", "harm", "meld"];
const SKILL_FOR_WORK: Record<string, string> = { ward: "warding", rune: "runeing" };
const TEACH_COST = 5;   // stem — teaching a skill (level 5+ Awoken)
const TEACH_MIN_LEVEL = 5; // stem — skills are milestone teachings

function workMaxHp(kind: string, level: number): number {
  const base = EDGE_WORK[kind]?.hp ?? 0;
  return base > 0 ? base * Math.pow(2, Math.max(0, level - 1)) : 0;
}
/** Cost to strengthen a work FROM `level` to `level + 1`: the base
 *  cost doubles with every level already bought (2✦→4→8→16…). */
function strengthenCostFor(kind: string, level: number): number {
  return (EDGE_WORK[kind]?.cost ?? 0) * Math.pow(2, Math.max(0, level));
}
function awokenLevelOf(experience: number): number {
  return Math.floor(Math.sqrt(Math.max(0, experience) / 100));
}
/** MARCH SPEED LAW (War-Ground, Nigel 2026-10-16) — the server's copy
 *  of the law the client marches by (Territory's marchSecondsPerHex;
 *  the two must agree, as wall law lives in both engines): seconds to
 *  cross one hex — the element's gait, parts averaged by their sum,
 *  unfilled parts voting the middle road — weighted by SIZE, and
 *  size is LEVEL: the more powerful, the harder to move (÷√growth).
 *  The growth step is ×1.0848077 a level (2026-10-24: the old
 *  nine-step total, ×1.1875^9 ≈ 4.70, spread over the road to the
 *  level-20 cap as nineteen steps) — the same literal stands in all
 *  four readers (Territory's draw and march, this march, the
 *  Table's march) so no ground disagrees about how big she stands. */
const MARCH_SECONDS_PER_HEX: Record<string, number> = { sky: 1.6, fire: 2.2, tide: 2.6, root: 3.2, stone: 4.5, neutral: 3.0 };
function marchSecondsPerHexFor(layers: { element?: string | null }[], experience: number): number {
  let pace = MARCH_SECONDS_PER_HEX.neutral;
  if (layers.length) {
    pace = layers.reduce((sum, l) => sum + (MARCH_SECONDS_PER_HEX[l.element ?? "neutral"] ?? MARCH_SECONDS_PER_HEX.neutral), 0) / layers.length;
  }
  const level = Math.max(1, awokenLevelOf(experience));
  return pace * Math.sqrt(Math.pow(1.0848077, level - 1));
}
/** CURSED GROUND SLOWS THE MARCH (Nigel, 2026-10-20): a step
 *  whose destination tile is cursed takes TWICE as long —
 *  the gait's own reckoning stands underneath, and this
 *  weighting rides on top of it. Every march reckoning
 *  (the muster, the missions, the bastion road, the march
 *  itself, the recall) shares this one weighting, so the
 *  quote, the hour, and the road home all agree. The
 *  client's projections weight their segments the same
 *  way, by the destination tile. */
function marchWeightedSeconds(road: number[], secPerHex: number, cursedOf: (tileId: number) => boolean, crowdOf?: (tileId: number) => number): number {
  let total = 0;
  for (let i = 1; i < road.length; i++) {
    // THE CROWDING GATE rides the same weighting (Nigel,
    // 2026-10-18; purpose restated 2026-10-23): a step onto
    // ground holding more than four Awoken takes its share
    // again by n/4 — crowding never refuses a step, it
    // only ever costs speed. crowdOf, where a reckoning
    // supplies it, counts every Awoken the destination
    // tile will hold, the walker among them.
    const n = crowdOf ? crowdOf(road[i]) : 0;
    total += secPerHex * (cursedOf(road[i]) ? 2 : 1) * (n > 4 ? n / 4 : 1);
  }
  return total;
}
/** The crowding count for a march reckoning: how many
 *  Awoken each tile holds, read off the field's placements
 *  the way the room reckonings have always read them — a
 *  figure crowds the tile it stands on, or the tile its
 *  march will land it on; the travellers themselves are
 *  counted on every tile their road enters, so the walker
 *  is inside the n its own pace is weighed by. */
function marchCrowdOf(placements: { awakenedId: number; tileId: number; marchPath?: string | null }[], travellerIds: Set<number>): (tileId: number) => number {
  const count = new Map<number, number>();
  for (const p of placements) {
    if (travellerIds.has(p.awakenedId)) continue;
    let tileId = p.tileId;
    if (p.marchPath) {
      try { const r = JSON.parse(p.marchPath); if (Array.isArray(r) && r.length) tileId = r[r.length - 1]; } catch { /* a broken road crowds where it stands */ }
    }
    count.set(tileId, (count.get(tileId) ?? 0) + 1);
  }
  const party = travellerIds.size;
  return (tileId) => (count.get(tileId) ?? 0) + party;
}
/** The road between two of the Tender's hexes, over their own
 *  uncursed ground only (breadth-first; the grid makes every step
 *  equal). Returns the tile ids, origin first, or null when no road
 *  of home ground runs there. */
/** A road that dares cursed ground (the seed missions, 2026-10-17):
    patrols may enter cursed tiles by ruling — a fetch party rides
    where the march of settlement may not. Same breadth-first walk
    as findRoad, with the curse filter lifted. SINCE 2026-10-23
    (Nigel) the march of settlement rides it too: no curse refusal
    stands in setMarch or the muster — cursed ground is priced
    (twice the step, the standing attrition), never barred. */
function findAnyRoad(tiles: { id: number; q: number; r: number; cursed: number; z?: number; buildStage?: number }[], fromId: number, toId: number, stepBlocked?: (fx: number, fy: number, tx: number, ty: number) => boolean): number[] | null {
  const byId = new Map(tiles.map(t => [t.id, t]));
  // Roads run on the ground (z 0) over gathered land: a floating
  // isle is no road's rung, and stone still coalescing holds no
  // march (the Building System, 2026-10-19).
  const byCoord = new Map(tiles.filter(t => (t.z ?? 0) === 0 && (t.buildStage ?? 0) !== 1).map(t => [`${t.q},${t.r}`, t]));
  const from = byId.get(fromId), to = byId.get(toId);
  if (!from || !to || (to.z ?? 0) !== 0 || (to.buildStage ?? 0) === 1) return null;
  if (fromId === toId) return [fromId];
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const prev = new Map<number, number>([[fromId, fromId]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const [dq, dr] of DIRS) {
      const n = byCoord.get(`${cur.q + dq},${cur.r + dr}`);
      if (!n || prev.has(n.id)) continue;
      // A step the caller's ground bars (a build wall across the
      // centre line, the Hex Building System): the road goes
      // around, the way it goes around any barred ground.
      if (stepBlocked && stepBlocked(cur.q, cur.r, n.q, n.r)) continue;
      prev.set(n.id, cur.id);
      if (n.id === toId) {
        const road = [toId];
        let walk = toId;
        while (walk !== fromId) { walk = prev.get(walk)!; road.unshift(walk); }
        return road;
      }
      queue.push(n);
    }
  }
  return null;
}

function findRoad(tiles: { id: number; q: number; r: number; cursed: number; z?: number; buildStage?: number }[], fromId: number, toId: number, stepBlocked?: (fx: number, fy: number, tx: number, ty: number) => boolean): number[] | null {
  const byId = new Map(tiles.map(t => [t.id, t]));
  const byCoord = new Map(tiles.filter(t => (t.z ?? 0) === 0 && (t.buildStage ?? 0) !== 1).map(t => [`${t.q},${t.r}`, t]));
  const from = byId.get(fromId), to = byId.get(toId);
  if (!from || !to || to.cursed || (to.z ?? 0) !== 0 || (to.buildStage ?? 0) === 1) return null;
  if (fromId === toId) return [fromId];
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const prev = new Map<number, number>([[fromId, fromId]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const [dq, dr] of DIRS) {
      const n = byCoord.get(`${cur.q + dq},${cur.r + dr}`);
      if (!n || n.cursed || prev.has(n.id)) continue;
      if (stepBlocked && stepBlocked(cur.q, cur.r, n.q, n.r)) continue;
      prev.set(n.id, cur.id);
      if (n.id === toId) {
        const road = [toId];
        let walk = toId;
        while (walk !== fromId) { walk = prev.get(walk)!; road.unshift(walk); }
        return road;
      }
      queue.push(n);
    }
  }
  return null;
}
// ── THE HEX BUILDING SYSTEM (Nigel, 2026-10-25 — "IMPLEMENT") ──
// Slice 1, the ground floor: build mode's pieces on the homeland.
// A piece's record holds its own FOOTPRINT — a polygon in map
// coordinates (axial), never a hex it is locked to. Hex overlap
// and protection are DERIVED from the footprint at every read:
// a piece is protected only while every hex beneath it is the
// Tender's own un-cursed ground ("just protected if they are in
// a purified hex"). Walls and doors stand on floor edges; their
// collision is segments of the footprint's own plane — a wall's
// whole edge, a door's two standing parts with the middle open —
// and the field collides against those segments: the dark's walk
// below, the march roads through buildStepBlocked, the Tender's
// stride on the client through the same served segments' shape.
interface BuildPieceRow {
  id: number; kind: string; pieceKey: string;
  verts: Pt[]; footprint: Pt[];
}
function loadBuildPieces(ownerKey: string): BuildPieceRow[] {
  const rows = sqlite.prepare("SELECT id, kind, piece_key AS pieceKey, verts, footprint FROM build_pieces WHERE owner_key = ? ORDER BY id")
    .all(ownerKey) as any[];
  const out: BuildPieceRow[] = [];
  for (const r of rows) {
    try {
      out.push({
        id: Number(r.id), kind: String(r.kind), pieceKey: String(r.pieceKey),
        verts: JSON.parse(r.verts) as Pt[], footprint: JSON.parse(r.footprint) as Pt[],
      });
    } catch { /* a garbled row holds no ground — it is not served, blocks nothing */ }
  }
  return out;
}

/** The collision segments of the owner's standing build walls,
 *  in axial coordinates (walls whole; doors with their gap open). */
function buildWallSegments(ownerKey: string): [Pt, Pt][] {
  const segs: [Pt, Pt][] = [];
  for (const p of loadBuildPieces(ownerKey)) {
    if (p.kind === "wall" || p.kind === "door") segs.push(...collisionSegments(p.kind, p.footprint));
  }
  return segs;
}

/** The road law for build walls: a step between two hex centres
 *  is barred when its centre line crosses a wall segment. A door
 *  whose gap the line threads is no bar — the gap is real. */
function buildStepBlocked(ownerKey: string): (fx: number, fy: number, tx: number, ty: number) => boolean {
  const segs = buildWallSegments(ownerKey);
  if (!segs.length) return () => false;
  return (fx, fy, tx, ty) => segs.some(([a, b]) =>
    segmentsCrossProper([fx, fy], [tx, ty], a, b));
}

/** The hexes a footprint lies on: the hexes of its vertices, of
 *  its edge midpoints, of its centre, and every hex whose centre
 *  falls inside it. Overlap is derived, never stored. */
function footprintHexes(footprint: Pt[]): { q: number; r: number }[] {
  const seen = new Map<string, { q: number; r: number }>();
  const put = (q: number, r: number) => seen.set(`${q},${r}`, { q, r });
  // Axial rounding — the battle walk's own axialRound reckoning.
  const round = (p: Pt) => axialRound(p[0], p[1]);
  for (const v of footprint) { const h = round(v); put(h.q, h.r); }
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i], b = footprint[(i + 1) % footprint.length];
    const h = round([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    put(h.q, h.r);
  }
  const c: Pt = [
    footprint.reduce((s, v) => s + v[0], 0) / footprint.length,
    footprint.reduce((s, v) => s + v[1], 0) / footprint.length,
  ];
  const hc = round(c); put(hc.q, hc.r);
  // Centres inside the footprint, searched over its own bounds.
  let minQ = Infinity, maxQ = -Infinity, minR = Infinity, maxR = -Infinity;
  for (const v of footprint) {
    minQ = Math.min(minQ, v[0]); maxQ = Math.max(maxQ, v[0]);
    minR = Math.min(minR, v[1]); maxR = Math.max(maxR, v[1]);
  }
  for (let q = Math.floor(minQ); q <= Math.ceil(maxQ); q++) {
    for (let r = Math.floor(minR); r <= Math.ceil(maxR); r++) {
      if (pointInPolygon([q, r], footprint)) put(q, r);
    }
  }
  return [...seen.values()];
}

/** Protection, derived: the piece stands protected only while
 *  ground of the Tender's own lies beneath ALL of it and none of
 *  that ground is cursed. A piece hanging over the void or over
 *  cursed ground is unprotected — and the read says so. */
function buildPieceProtected(footprint: Pt[], tilesByKey: Map<string, any>): boolean {
  const hexes = footprintHexes(footprint);
  if (!hexes.length) return false;
  for (const h of hexes) {
    const t = tilesByKey.get(`${h.q},${h.r}`);
    if (!t || t.cursed) return false;
  }
  return true;
}

/** A build piece as getTerritory serves it: its record, its
 *  footprint, and its derived protection. */
function buildPieceView(p: BuildPieceRow, tilesByKey: Map<string, any>) {
  return {
    id: p.id, kind: p.kind, pieceKey: p.pieceKey,
    verts: p.verts, footprint: p.footprint,
    protected: buildPieceProtected(p.footprint, tilesByKey),
  };
}

function skillsHeldBy(ownerKey: string, awakenedIds: number[]): Set<string> {
  if (awakenedIds.length === 0) return new Set();
  const marks = awakenedIds.map(() => "?").join(",");
  const rows = sqlite.prepare(`SELECT DISTINCT skill FROM awoken_skills WHERE owner_key = ? AND awakened_id IN (${marks})`)
    .all(ownerKey, ...awakenedIds) as { skill: string }[];
  return new Set(rows.map(r => r.skill));
}
/** Consume runes the battle reports as sprung (one-shot traps). Only
 *  rows that are runes can be consumed this way. */
function applyRunesTriggered(ownerKey: string, runesTriggered: unknown): void {
  if (!Array.isArray(runesTriggered)) return;
  for (const edgeKey of runesTriggered.slice(0, 200)) {
    if (typeof edgeKey !== "string") continue;
    sqlite.prepare("DELETE FROM hex_walls WHERE owner_key = ? AND edge_key = ? AND kind = 'rune'").run(ownerKey, edgeKey);
  }
}

// --- The boss ladder is ABOLISHED (Nigel, 2026-10-24) ----------------------
// The staged boss battle mode — its server ladder (boss_state), its
// eligibility cycle, and its pending aspect-grant rail — no longer
// exists. The homeland's living battle engine is the only battle.
// Aspect points move through addAspectPoints' living roads (the
// attunement drip, the lake yield, the first-seed reward, the
// creator's gift), never through a boss's prize again.

type AspectElement = "tide" | "sky" | "stone" | "root";

/** Every element an attunement pool can hold — the palette's
 *  five. The aspect GRANTS above roll among four (fire is found,
 *  never dealt), but a pool is a pool: the first seed's reward
 *  and the fell drizzle below may light on any of the five, and
 *  the panel shows whichever pools hold points. */
type AttunementElement = AspectElement | "fire";
const ATTUNEMENT_ELEMENTS: AttunementElement[] = ["root", "tide", "sky", "stone", "fire"];

/**
 * Add attunement points to an element's pool for an owner — the exact
 * arithmetic aspect grants have always run: +amount (insert or
 * update, updatedAt touched), and at >= 10 points an aspect is born
 * into the inventory when a level piece FILED as this element exists
 * (10 points are then spent; without such a piece the points stay).
 * The birth chooses by the filed element, never by a name pattern
 * (Nigel, 2026-10-16 — the same law the getTerritory pool birth
 * already kept). Lifetime gains are never touched. Amounts may be
 * fractional — the fell drizzle pays in tenths. Returns true when
 * an aspect spawned.
 */
async function addAspectPoints(ownerKey: string, element: AttunementElement, amount: number): Promise<boolean> {
  const row = await db.select().from(schema.aspectAttunement)
    .where(and(
      eq(schema.aspectAttunement.ownerKey, ownerKey),
      eq(schema.aspectAttunement.element, element)
    )).limit(1);
  const current = row[0]?.points ?? 0;
  const newPoints = current + amount;
  if (row[0]) {
    await db.update(schema.aspectAttunement)
      .set({ points: newPoints, updatedAt: new Date() })
      .where(and(
        eq(schema.aspectAttunement.ownerKey, ownerKey),
        eq(schema.aspectAttunement.element, element)
      ));
  } else {
    await db.insert(schema.aspectAttunement)
      .values({ ownerKey, element, points: newPoints, updatedAt: new Date() });
  }
  // Check threshold (10) — spawn aspect if reached
  if (newPoints >= 10) {
    const pool = await db.select().from(schema.layerAssets)
      .where(eq(schema.layerAssets.category, "aspect"));
    const matches = birthableAspects(pool as any[], element);
    if (matches.length) {
      const pick = matches[Math.floor(Math.random() * matches.length)];
      await db.insert(schema.aspectInventory)
        .values({ ownerKey, aspectAssetId: pick.id });
      await db.update(schema.aspectAttunement)
        .set({ points: newPoints - 10 })
        .where(and(
          eq(schema.aspectAttunement.ownerKey, ownerKey),
          eq(schema.aspectAttunement.element, element)
        ));
      return true;
    }
  }
  return false;
}

/** Add ONE whole attunement point — the grants' historic step,
 *  kept as the thin wrapper its callers have always known. */
async function addAspectPoint(ownerKey: string, element: AspectElement): Promise<boolean> {
  return addAspectPoints(ownerKey, element, 1);
}

/** THE FELL DRIP — the one shape a beaten creature's attunement
 *  drop takes, on BOTH grounds. The measure is the drizzle
 *  Nigel ruled for the First Seed hold (2026-10-19): each fell
 *  has a 20% chance to drip +0.1 of a point — "enough to
 *  barely move the attunement bar: 50 Fray = 1 point, that
 *  kind of math, but at least it's raising." His kept ruling
 *  that things beaten on both maps drop, and that creatures
 *  beaten at the Table drop attunement points (2026-10-20
 *  17:33, kept 23:03), extends that same drip to every beaten
 *  creature: the Table's dark, the homeland's wanderers, by
 *  whatever hand of the Tender's side felled them — his
 *  weapon, his written light, his Awoken, his wards' answers.
 *  THE ELEMENT follows the ground the creature fell on when
 *  that ground holds one of the five (homeland tiles are born
 *  filed with an element under their curse; a Table tile
 *  holds an element only where the light already holds it);
 *  where the ground names none, the drip lights on a random
 *  element, as the drizzle always rolled. Paid through
 *  addAspectPoints — the pools' one writer — so a drip can
 *  birth an aspect at the threshold like any other gain.
 *  Silent bookkeeping, as the drizzle was: settles are lazy
 *  and no live enemy stands by to pop from. */
export async function payFellDrip(ownerKey: string, groundElement?: string | null): Promise<void> {
  if (!ownerKey) return;
  if (Math.random() >= 0.2) return;
  const element = groundElement && (ATTUNEMENT_ELEMENTS as string[]).includes(groundElement)
    ? (groundElement as AttunementElement)
    : ATTUNEMENT_ELEMENTS[Math.floor(Math.random() * ATTUNEMENT_ELEMENTS.length)];
  await addAspectPoints(ownerKey, element, 0.1);
}

/* ── THE BUILDING SYSTEM (Nigel, 2026-10-19) ────────────────────
 * Land is CREATED, not found: the Tender founds a hex on empty
 * ground at his land's edge, and four elemental stages make it —
 * (1) STONE coalesces piece by piece until the ground is walkable,
 * (2) ROOT weaves it together and greens it, (3) a branch: TIDE
 * comes in as a lake, or SKY lifts the tile off the ground into a
 * floating isle — and A NEW NEUTRAL TILE IS BORN UNDERNEATH IT —
 * (4) FIRE finishes: BAKE it sealed and hardened, or LOWER it a
 * level, and the deep land yields the richer pool for it.
 * Every stage fills in POURS OF 10: thirty points seal a stage.
 * Two roads fill it: the Tender pours his own attunement points
 * directly (fast), or Awokin standing on the work attune it by
 * presence at the day-long quest's tempo (free, slow).
 * Every stage of completeness a created hex reaches pays +1 to
 * the TERRAIN BANK (the fire-lower pays +2 — the deep vessel
 * holds more), and the bank is a VESSEL: it raises the home
 * energy cap point for point, and is safe unless the territory
 * falls — a created tile lost to the curse takes back exactly
 * the gift its own stages paid, never more. */
const BUILD_POUR = 10;
const BUILD_STAGE_SEAL = 30;
const BUILD_LAKE_YIELD = 10; // pool points of tide a lowered hex pays at its finishing
function buildStageOf(t: any): number { return t?.buildStage ?? 0; }
function buildUnderway(t: any): boolean { const s = buildStageOf(t); return s >= 1 && s <= 4; }
/** The ground holds a body: natural land, and created work once
 *  its stone has coalesced (stage 1 still filling = no floor). */
function buildWalkable(t: any): boolean { const s = buildStageOf(t); return s === 0 || s >= 2; }
/** The element a stage drinks. Stage 3 drinks its branch once
 *  chosen (null until then: tide or sky may still crown it). */
function stageWantedElement(t: any): string | null {
  const s = buildStageOf(t);
  if (s === 1) return "stone";
  if (s === 2) return "root";
  if (s === 3) return (t.buildBranch as string | null) ?? null;
  if (s === 4) return "fire";
  return null;
}
async function terrainBankFor(ownerKey: string): Promise<number> {
  const row = sqlite.prepare("SELECT terrain_bank AS bank FROM tender_resources WHERE owner_key = ?").get(ownerKey) as { bank: number } | undefined;
  return row?.bank ?? 0;
}
async function addTerrainBank(ownerKey: string, delta: number): Promise<number> {
  sqlite.prepare("INSERT OR IGNORE INTO tender_resources (owner_key, energy, terrain_bank, updated_at) VALUES (?, 10, 0, ?)").run(ownerKey, Date.now());
  sqlite.prepare("UPDATE tender_resources SET terrain_bank = MAX(0, terrain_bank + ?) WHERE owner_key = ?").run(delta, ownerKey);
  return terrainBankFor(ownerKey);
}
/** Spend whole attunement points from a pool — the pour road's
 *  other end. A plain decrement, as attuneWeapon spends: no
 *  births ride on money leaving the pool. */
async function spendAspectPoints(ownerKey: string, element: string, amount: number): Promise<boolean> {
  const row = await db.select().from(schema.aspectAttunement)
    .where(and(eq(schema.aspectAttunement.ownerKey, ownerKey), eq(schema.aspectAttunement.element, element as any))).limit(1);
  const current = row[0]?.points ?? 0;
  if (current < amount) return false;
  await db.update(schema.aspectAttunement)
    .set({ points: current - amount, updatedAt: new Date() })
    .where(and(eq(schema.aspectAttunement.ownerKey, ownerKey), eq(schema.aspectAttunement.element, element as any)));
  return true;
}
async function aspectPoolFor(ownerKey: string, element: string): Promise<number> {
  const row = await db.select().from(schema.aspectAttunement)
    .where(and(eq(schema.aspectAttunement.ownerKey, ownerKey), eq(schema.aspectAttunement.element, element as any))).limit(1);
  return row[0]?.points ?? 0;
}
/** Pour pressure into a tile's bank and resolve its 10-point
 *  steps. Returns the fields to persist, or null when unmoved.
 *  WITNESS RULE (Nigel, 2026-10-15): a pour may not complete
 *  a stage in the same beat its bank (re)starts — the fresh
 *  bank caps at 9, so the seal and its countdown stand on
 *  the tile for at least one full beat before the land turns.
 *  (Before this, a heavy company flipped a hex between glances
 *  and a turned hex fell back with no visible cause.) A
 *  shrine's pour is exempt: its five-hour rhythm is its own
 *  witness. THIS IS THE ONE BANK RECKONING: the territory
 *  settle pours the standing press through it, the shrine
 *  pours through it, and the Tender's Attune act (attuneTile)
 *  pours its spent point through it — a point counts the
 *  same whichever road laid it. */
function pourAttunementBank(tile: any, el: string, pts: number, completeStage = false): { element: string; attuneElement: string | null; attunePoints: number } | null {
  let bankEl = tile.attuneElement as string | null;
  let bank = tile.attunePoints ?? 0;
  const fresh = bankEl !== el || bank <= 0;
  if (bankEl !== el) { bankEl = el; bank = 0; }
  bank += pts;
  if (fresh && !completeStage && bank > 9) bank = 9;
  let element = tile.element as string;
  let crossed = false;
  while (bank >= 10) {
    if (element === el) { bank = 10; break; }
    element = element === "neutral" ? el : "neutral";
    bank -= 10;
    crossed = true;
    // One stage per beat (Nigel, 2026-10-15): a carried bank
    // may not sprint through the neutral shore in the same
    // answer — the crossing must be witnessed too.
    if (!completeStage) { if (bank > 9) bank = 9; break; }
  }
  if (element !== tile.element || bankEl !== (tile.attuneElement ?? null) || bank !== (tile.attunePoints ?? 0)) {
    return { element, attuneElement: bankEl, attunePoints: bank };
  }
  return null;
}

/** A created stage seals: its gift lands in the terrain bank and
 *  the land itself changes. Mutates the tile row object and its
 *  stored fields; the caller keeps filling or finishes. */
async function completeBuildStage(ownerKey: string, tile: any): Promise<void> {
  const stage = buildStageOf(tile);
  let bankGain = 1;
  if (stage === 1) {
    // The stone has coalesced: the hex is walkable ground,
    // born at Z1 like any purified land — one growing tray.
    tile.height = 1; tile.sealedTrays = 0; tile.growPoints = 0; tile.topPoints = null;
  } else if (stage === 2) {
    // Root has woven it through: the hex greens — its filed
    // element is root until the branch crowns it otherwise.
    tile.element = "root";
  } else if (stage === 3 && tile.buildBranch === "tide") {
    tile.element = "tide";
  } else if (stage === 3 && tile.buildBranch === "sky") {
    // THE BORN-UNDERNEATH LAW: the tile rises into the sky as a
    // floating isle (z 1), and a new neutral tile is born on the
    // ground it vacated — clean, at Z1, nobody's work yet.
    tile.element = "sky";
    tile.z = 1;
    await db.insert(schema.territoryTiles).values({
      ownerKey, q: tile.q, r: tile.r, element: "neutral", cursed: 0, spark: 0,
      hp: 10, height: 1, sealedTrays: 0, growPoints: 0, topPoints: null, z: 0, buildStage: 0,
    } as any);
  } else if (stage === 4 && tile.buildFinish === "lower") {
    // FIRE LOWERS: the deep land yields — a pour's worth of
    // tide comes back into the Tender's pool, and the sunken
    // vessel counts double in the bank.
    tile.lowered = 1;
    bankGain = 2;
    await addAspectPoints(ownerKey, "tide", BUILD_LAKE_YIELD);
  } else if (stage === 4) {
    // FIRE BAKES: a sealed cell. The charge of every pour the
    // hex ever drank is held in it (4 stages × 30) without
    // leaking, and sealed land neither turns nor erodes under
    // a company's press — its charge radiates into its own
    // stack's growth instead.
    tile.baked = 1;
    tile.buildCharge = BUILD_STAGE_SEAL * 4;
  }
  tile.bankPaid = (tile.bankPaid ?? 0) + bankGain;
  tile.buildStage = stage + 1;
  tile.buildPoints = Math.max(0, (tile.buildPoints ?? 0) - BUILD_STAGE_SEAL);
  await addTerrainBank(ownerKey, bankGain);
  await db.update(schema.territoryTiles).set({
    element: tile.element, height: tile.height, z: tile.z ?? 0,
    sealedTrays: tile.sealedTrays ?? 0, growPoints: tile.growPoints ?? 0, topPoints: tile.topPoints ?? null,
    buildStage: tile.buildStage, buildPoints: tile.buildPoints,
    buildBranch: tile.buildBranch ?? null, buildFinish: tile.buildFinish ?? null,
    baked: tile.baked ?? 0, lowered: tile.lowered ?? 0,
    buildCharge: tile.buildCharge ?? 0, bankPaid: tile.bankPaid ?? 0,
  } as any).where(eq(schema.territoryTiles.id, tile.id));
}
/** Feed points of an element into the stage now filling: the one
 *  funnel both construction roads pour through. The stage must
 *  want the element (stage 3 unbranched accepts tide or sky and
 *  is crowned by the first of them). Returns false when the work
 *  refuses the drink. */
async function feedBuild(ownerKey: string, tile: any, element: string, points: number): Promise<boolean> {
  if (!buildUnderway(tile)) return false;
  const stage = buildStageOf(tile);
  if (stage === 3 && !tile.buildBranch) {
    if (element !== "tide" && element !== "sky") return false;
    tile.buildBranch = element;
    await db.update(schema.territoryTiles).set({ buildBranch: element } as any).where(eq(schema.territoryTiles.id, tile.id));
  }
  const wanted = stageWantedElement(tile);
  if (!wanted || wanted !== element) return false;
  tile.buildPoints = (tile.buildPoints ?? 0) + points;
  let guard = 0;
  while (buildUnderway(tile) && (tile.buildPoints ?? 0) >= BUILD_STAGE_SEAL && guard++ < 5) {
    await completeBuildStage(ownerKey, tile);
  }
  if (buildUnderway(tile) || buildStageOf(tile) === 5) {
    await db.update(schema.territoryTiles).set({ buildPoints: tile.buildPoints ?? 0 } as any).where(eq(schema.territoryTiles.id, tile.id));
  }
  return true;
}
/** The work between two hexes, if any: the kind standing on the
 *  edge they share, read off the canonical edge (the same form
 *  placeWall stores). */
function edgeKindBetween(ownerKey: string, a: { q: number; r: number }, b: { q: number; r: number }): string | null {
  const d = WALL_DIRS.findIndex(([dq, dr]) => a.q + dq === b.q && a.r + dr === b.r);
  if (d < 0) return null;
  const flip = b.q < a.q || (b.q === a.q && b.r < a.r);
  const cq = flip ? b.q : a.q, cr = flip ? b.r : a.r, cdir = flip ? WALL_OPP[d] : d;
  const row = sqlite.prepare("SELECT kind FROM hex_walls WHERE owner_key = ? AND edge_key = ?")
    .get(ownerKey, `${cq},${cr},${cdir}`) as { kind: string } | undefined;
  return row?.kind ?? null;
}

/** Record a gift from The Ancient Creator (drives the Tender's gift notice). */
async function recordCreatorGift(ownerKey: string, source: "button" | "code" | "aspect"): Promise<void> {
  await db.insert(schema.creatorGifts).values({ ownerKey, source });
}

/** Resolve a `tender:<id>` owner key to its Tender row, or refuse. */
async function tenderForOwnerKey(ownerKey: string): Promise<TenderRow> {
  const match = /^tender:(\d+)$/.exec(ownerKey);
  if (!match) badRequest("That is not a Tender account.");
  const rows = await db.select().from(schema.tenders)
    .where(eq(schema.tenders.id, Number(match[1]))).limit(1);
  if (!rows[0]) badRequest("That Tender could not be found.");
  return rows[0];
}

const layerCategorySchema = z.enum(["background", "arms", "body", "aura", "aspect", "head"]);
/** Categories a piece may be FILED under (fix list #9, Nigel
 *  2026-10-13: the aura pool is removed — "it became assets").
 *  layerCategorySchema keeps "aura" so legacy rows and compositions
 *  still parse everywhere they are READ; only new filings and moves
 *  are held to this narrower list. */
const filingCategorySchema = z.enum(["background", "arms", "body", "aspect", "head"]);
const raritySchema = z.enum(["common", "uncommon", "rare", "mythic"]);
const collectionSchema = z.enum(["tender", "workshop"]);
const statSchema = z.number().int().min(0).max(6);
const statCategories = new Set<z.infer<typeof layerCategorySchema>>(["arms", "body", "head"]);
const okResponse = z.object({ ok: z.literal(true) });
const purifyResponse = z.object({
  ok: z.boolean(),
  reason: z.enum(["resting", "too-weak", "not-yet"]).optional(),
  hoursLeft: z.number().optional(),
  need: z.number().optional(),
  have: z.number().optional(),
  purified: z.boolean().optional(),
});

type Rarity = z.infer<typeof raritySchema>;
type AssetStats = { name: string; rarity: Rarity; power: number | null; toughness: number | null; element?: string | null; imageBlobKey?: string | null };

function rarityFromStats(power: number, toughness: number): Rarity {
  const total = power + toughness;
  if (total <= 6) return "common";
  if (total <= 8) return "uncommon";
  if (total <= 10) return "rare";
  return "mythic";
}

// Legacy machine labels ("Arm 1" …) are renamed to the mystical voice the
// first time the studio is read — identical to the original behavior.
const legacyNames: Record<"arms" | "body" | "head", string[]> = {
  arms: ["The Long Reaching", "Branches of Quiet Rain", "The Inkward Hands", "Limbs of the Far Bell", "The Patient Grasp", "Boughs Beneath Moonwater", "The Hollow Embrace", "Arms of Returning", "The Manyfold Reach", "Blackroot Gesture", "The Unfurling", "Hands of the First Weather", "The Between-Limbs", "Reach of the Waking Tide"],
  body: ["Vessel of Still Earth", "The Bound Hollow", "House of Soft Thunder", "The Listening Torso", "Rooted Chamber", "Vessel of the Pale Current", "The Remembering Form", "Body of Held Rain", "The Quiet Monolith", "Chamber of New Moss", "The Gathered Matter"],
  head: ["Crown of First Thought", "The Rain-Reader", "Face of the Unlit Moon", "The Listening Crown", "Head of Small Stars", "The Dreaming Aperture", "Crown of Rootlight", "The Witness Above", "The Opened Seed", "Face of the Deep Bell", "The Soft Oracle", "Crown of Returning Birds", "The First Awakening"],
};

function mysticalLegacyName(category: string, name: string) {
  const match = name.match(/^(Arm|Body|Head) (\d+)$/);
  if (!match?.[1] || !match[2]) return null;
  const key = match[1].toLowerCase() === "arm" ? "arms" : (match[1].toLowerCase() as "body" | "head");
  if (category !== key) return null;
  const index = Number(match[2]) - 1;
  return legacyNames[key][index] ?? null;
}

/** A STORED composition ref is a historical record, not a live
 *  write: a piece woken under an older scale may carry stored stats
 *  above today's cap, and this gate must never silently discard the
 *  whole piece over it — the layer then vanishes from every surface
 *  at once (Nigel, 2026-10-18: an Awoken stood with no body and no
 *  arms, twice). Stored stats are read tolerantly and clamped to
 *  the live cap; live writes keep the strict statSchema, and
 *  parseLayers re-stamps from the living asset whenever it survives,
 *  so the stored number is only ever a fallback. */
const storedStatSchema = z.number().int().min(0).transform((v) => Math.min(v, 6));
const storedLayerRefShape = z.object({
  source_id: z.string().min(1).max(100), name: z.string().min(1).max(100), category: layerCategorySchema,
  rarity: raritySchema, power: storedStatSchema.nullable().optional(), toughness: storedStatSchema.nullable().optional(),
  element: z.enum(["tide", "sky", "stone", "root", "fire", "neutral"]).nullable().optional(),
  // An equipped aspect's own record (Nigel, 2026-10-16): these rode
  // in the composition all along but were stripped at this gate, so
  // no served layer could ever show its aspect's level or element —
  // surfaces fell back to guessing from names. They pass now.
  aspectLevel: z.number().int().min(1).max(4).optional(),
  aspectElement: z.enum(["tide", "sky", "stone", "root", "fire", "neutral"]).nullable().optional(),
  // A worn aspect layer carries its own art key (the flattened card
  // image predates any aspect, so the deck must render the layers
  // themselves). It passes this gate now so parseLayers can serve it.
  imageBlobKey: z.string().max(300).nullable().optional(),
});
export const layerRefShape = z.object({
  source_id: z.string().min(1).max(100), name: z.string().min(1).max(100), category: layerCategorySchema,
  rarity: raritySchema, power: statSchema.nullable(), toughness: statSchema.nullable(),
  element: z.enum(["tide", "sky", "stone", "root", "fire", "neutral"]).nullable().optional(),
  aspectLevel: z.number().int().min(1).max(4).optional(),
  aspectElement: z.enum(["tide", "sky", "stone", "root", "fire", "neutral"]).nullable().optional(),
  imageUrl: z.string().nullable().optional(),
});
const assetShape = z.object({
  id: z.number(), name: z.string(), category: layerCategorySchema, rarity: raritySchema,
  power: statSchema.nullable(), toughness: statSchema.nullable(), image_url: z.string(), mime_type: z.string(), created_at: z.string(),
});
const awakenedShape = z.object({
  id: z.number(), name: z.string(), image_url: z.string(), layers: z.array(layerRefShape),
  base_power: z.number().int().min(0), base_toughness: z.number().int().min(0),
  power: z.number().int().min(0), toughness: z.number().int().min(0), empowerment: z.number().int().min(0),
  story_count: z.number().int().min(0).max(3),
  iteration: z.number().int().min(0), collection: collectionSchema, owner_name: z.string(), flavor_text: z.string(), created_at: z.string(),
});

function parseDbId(sourceId: string) {
  const match = sourceId.match(/^db:(\d+)$/);
  return match?.[1] ? Number(match[1]) : null;
}

/** The one resolution map every payload builder shares (Nigel,
 *  2026-10-18): a composition's pieces are resolved to their living
 *  name, stats and art through THIS map, gated on rarity alone —
 *  never on the piece's filed category. A piece filed under a
 *  category string the display schemas reject (the schema enum
 *  itself carries drifted values the actions layer does not know)
 *  still HAS art, a name and stats. buildStudio once built its map
 *  from the category-gated display rows instead, so the deck
 *  served those layers artless — heads alone on the cards — while
 *  awakenedPayloadById's rarity-only map let the Table's field
 *  render the very same Awoken whole. One map, one truth. */
function assetStatsFromRows(rows: { id: number; name: string; rarity: string; power: number | null; toughness: number | null; element?: string | null; imageBlobKey: string | null }[]): Map<number, AssetStats> {
  const map = new Map<number, AssetStats>();
  for (const row of rows) {
    const rarity = raritySchema.safeParse(row.rarity);
    if (rarity.success) map.set(row.id, { name: row.name, rarity: rarity.data, power: row.power, toughness: row.toughness, element: row.element ?? null, imageBlobKey: row.imageBlobKey ?? null });
  }
  return map;
}

function parseLayers(value: string, assetStats: Map<number, AssetStats>): z.infer<typeof layerRefShape>[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const result = storedLayerRefShape.safeParse(item);
      if (!result.success) return [];
      // Legacy compositions (the random-assignment pass) name their
      // piece by bare asset id; resolve those too, for reading only —
      // the stored string itself (and any identity built from it)
      // is never rewritten here.
      const sid = result.data.source_id;
      const id = parseDbId(sid) ?? (/^\d+$/.test(sid) ? Number(sid) : null);
      const current = id === null ? undefined : assetStats.get(id);
      // Live layer art (Nigel, 2026-10-18): the flattened card image
      // is stamped at birth and never learns of aspects applied or
      // deepened afterwards, so the deck renders the layers
      // themselves. Prefer the living asset's art; a worn aspect
      // layer's own stamped key is the fallback.
      const imageUrl = current?.imageBlobKey ? blobUrl(current.imageBlobKey)
        : result.data.imageBlobKey ? blobUrl(result.data.imageBlobKey)
        : null;
      return [{ ...result.data, name: current?.name ?? result.data.name, rarity: current?.rarity ?? result.data.rarity, power: current?.power ?? result.data.power ?? null, toughness: current?.toughness ?? result.data.toughness ?? null, element: (current as any)?.element ?? (result.data as any).element ?? (result.data as any).aspectElement ?? null, imageUrl }];
    });
  } catch { return []; }
}

function identityFor(layers: z.infer<typeof layerRefShape>[]) {
  return ["arms", "body", "head"].map((category) => layers.find((layer) => layer.category === category)?.source_id ?? "none").join("|");
}

/** THE LAW (Nigel, 2026-10-15, re-ruled 2026-10-16): a piece's element
 *  is judged ONLY by the element filed on it — the Elements tab — and
 *  an Awoken's element is the sum of its parts' filed elements. No
 *  system, server or client, reads an element out of a name; the
 *  keyword reads that once lived on both sides are abolished, and an
 *  unfiled piece is neutral — it counts as nothing until it is filed. */
const ELEMENTS_5 = ["tide", "sky", "stone", "root", "fire"] as const;
/** The stack law's two clean states (Nigel, via Land, 2026-10-16):
 *  neutral land exists ONLY at Z1 and neutral tiles NEVER stack —
 *  a stack belongs to an element. A tile that FALLS takes nothing
 *  down with it: bank emptied, trays gone, height 0. A tile that is
 *  PURIFIED is born clean at Z1: one growing tray, no bank, whatever
 *  element the victory names. Until these field-sets rode on every
 *  fall and purify path, a tile cursed by battle damage kept its
 *  trays in the dark, and purification resurrected them wearing
 *  neutral — neutral stacks, which the law forbids. */
const FALLEN_TILE_FIELDS = {
  attunePoints: 0, attuneElement: null,
  sealedTrays: 0, growPoints: 0, topPoints: null, height: 0,
} as const;
const PURIFIED_TILE_FIELDS = {
  attunePoints: 0, attuneElement: null,
  sealedTrays: 0, growPoints: 0, topPoints: null, height: 1,
} as const;
type Element5 = (typeof ELEMENTS_5)[number];
/** A part's element, from its own record alone. THE LAW (Nigel,
 *  2026-10-15): an Awoken's elements are ALWAYS read from the sum of
 *  its parts — the element recorded on the part — NEVER inferred
 *  from a part's name. (The name-regex that once guessed here, and
 *  defaulted everything unrecognized to root, is abolished; it made
 *  Awoken press elements their bodies never held.) A part with no
 *  recorded element contributes NONE — "neutral" — until its element
 *  is filed on the part itself (workshop: updateLayerAssetElement). */
function storedElement(dbElement?: string | null): Element5 | "neutral" {
  return dbElement && (ELEMENTS_5 as readonly string[]).includes(dbElement)
    ? (dbElement as Element5)
    : "neutral";
}
/** The level-art pieces ("Stone III") are the ARTWORK a worn aspect
 *  takes as it rises — they are not newborn aspects. Until today
 *  every birth drew from the whole filed pool, so attunement points
 *  were born AS "Aspect I / II / III" pieces and a tender holding
 *  sixty of them held artwork, not aspects (Nigel, 2026-10-18:
 *  "the system is still taking some aspect points as aspect 1,2,3").
 *  Births now draw only from pieces that are not level-art; when
 *  nothing else is filed for an element, the points simply stay. */
const LEVEL_ART_NAME = /^(tide|sky|stone|root|fire)\s+(I|II|III|IV)$/i;
function birthableAspects<T extends { name?: string | null; element?: string | null }>(pool: T[], el: string): T[] {
  return pool.filter((a) => storedElement((a as any).element) === el && !LEVEL_ART_NAME.test(a.name ?? ""));
}
/** Kept name for the truth above: the name argument is IGNORED —
 *  it is accepted only so older call sites compile while they are
 *  swept to the resolver; nothing may ever read it again. */
function elementForPieceName(_name: string, dbElement?: string | null): Element5 | "neutral" {
  return storedElement(dbElement);
}
/** Resolve every layer of a composition to its part's true element:
 *  the asset record its source_id names first (the living truth, as
 *  parseLayers stamps), then the element the layer itself carries
 *  (aspect layers), else "neutral". One asset query per composition. */
async function compositionElements(layers: any[]): Promise<(Element5 | "neutral")[]> {
  const ids = [...new Set(layers.map(l => parseDbId(l?.source_id ?? "")).filter((x): x is number => x !== null))];
  const byId = new Map<number, string | null>();
  if (ids.length) {
    const rows = await db.select({ id: schema.layerAssets.id, element: schema.layerAssets.element })
      .from(schema.layerAssets).where(inArray(schema.layerAssets.id, ids));
    for (const r of rows) byId.set(r.id, (r as any).element ?? null);
  }
  return layers.map(l => {
    const id = parseDbId(l?.source_id ?? "");
    const fromAsset = id === null ? undefined : storedElement(byId.get(id));
    if (fromAsset && fromAsset !== "neutral") return fromAsset;
    return storedElement((l as any)?.element ?? (l as any)?.aspectElement);
  });
}

export function blobUrl(key: string): string {
  return `/blobs/${Buffer.from(key, "utf8").toString("base64url")}`;
}

type AwakenedRow = typeof schema.awakened.$inferSelect;

/** One awakened row → the full creature payload the client renders. */
export function toAwakenedPayload(
  row: AwakenedRow,
  layers: z.infer<typeof layerRefShape>[],
  identity: string,
  idsByIdentity: Map<string, number[]>
) {
  const basePower = layers.reduce((sum, layer) => sum + (layer.power ?? 0), 0);
  const baseToughness = layers.reduce((sum, layer) => sum + (layer.toughness ?? 0), 0);
  const familyIds = idsByIdentity.get(identity) ?? [row.id];
  const empowerment = Math.max(0, familyIds.length - 1);
  const occurrenceIndex = familyIds.indexOf(row.id);
  const iteration = occurrenceIndex < 0 ? row.iteration : occurrenceIndex;
  const collection = collectionSchema.safeParse(row.collection);
  const storyCount = row.storyCount ?? 0;
  const xp = row.experience ?? 0;
  const xpInfo = xpProgress(xp);
  const level = xpInfo.level;
  const bonusPower = row.bonusPower ?? 0;
  const bonusToughness = row.bonusToughness ?? 0;
  return {
    id: row.id, name: row.name, minted_name: row.mintedName ?? null, image_url: blobUrl(row.imageBlobKey), layers,
    base_power: basePower, base_toughness: baseToughness,
    power: basePower + empowerment + storyCount + bonusPower,
    toughness: baseToughness + empowerment + storyCount + bonusToughness,
    empowerment, story_count: storyCount, field_born: row.fieldBorn ?? 0, iteration, collection: collection.success ? collection.data : ("workshop" as const),
    owner_name: row.ownerName, flavor_text: row.flavorText, created_at: row.createdAt.toISOString(),
    experience: xp, level, stat_points: row.statPoints ?? 0,
    bonus_power: bonusPower, bonus_toughness: bonusToughness,
    spent_power: (row as any).spentPower ?? 0, spent_toughness: (row as any).spentToughness ?? 0,
    xp_current: xpInfo.current, xp_next: xpInfo.next, xp_progress: xpInfo.progress,
    // Progress within the current level, for visible growth bars (Hall, dock):
    // XP earned into this level, and the size of this level's XP span.
    xp_into_level: xp - xpInfo.current, xp_for_next_level: Math.max(0, xpInfo.next - xpInfo.current),
  };
}

/** Full creature payload for a single awakened id, or null when it is gone.
 *  Shared by the welcome endpoints so a waiting Awoken renders exactly like
 *  a decked one. */
export async function awakenedPayloadById(id: number) {
  const rows = await db.select().from(schema.awakened).where(eq(schema.awakened.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;
  const assetRows = await db.select().from(schema.layerAssets);
  const assetStats = assetStatsFromRows(assetRows);
  const layers = parseLayers(row.compositionJson, assetStats);
  const identity = row.identityKey === "legacy" ? identityFor(layers) : row.identityKey;
  const allRows = await db.select().from(schema.awakened);
  const idsByIdentity = new Map<string, number[]>();
  for (const other of allRows) {
    const otherIdentity = other.identityKey === "legacy" ? identityFor(parseLayers(other.compositionJson, assetStats)) : other.identityKey;
    idsByIdentity.set(otherIdentity, [...(idsByIdentity.get(otherIdentity) ?? []), other.id].sort((a, b) => a - b));
  }
  return toAwakenedPayload(row, layers, identity, idsByIdentity);
}

export interface AwakeningPlan {
  canonicalLayers: z.infer<typeof layerRefShape>[];
  identityKey: string;
  previousCount: number;
  name: string;
  flavorText: string;
  basePower: number;
  baseToughness: number;
}

/** Shared awakening arithmetic: canonicalize layers against current pool
 *  stats, derive the identity family, name and flavor the form. Used by both
 *  the paid Wake One and the free welcome-wake generation. */
export async function planAwakening(layers: z.infer<typeof layerRefShape>[]): Promise<AwakeningPlan> {
  const [latest, currentAssets, existing] = await Promise.all([
    db.select({ id: schema.awakened.id }).from(schema.awakened).orderBy(desc(schema.awakened.id)).limit(1),
    db.select({ id: schema.layerAssets.id, name: schema.layerAssets.name, rarity: schema.layerAssets.rarity, power: schema.layerAssets.power, toughness: schema.layerAssets.toughness, element: schema.layerAssets.element, imageBlobKey: schema.layerAssets.imageBlobKey }).from(schema.layerAssets),
    db.select({ identityKey: schema.awakened.identityKey, compositionJson: schema.awakened.compositionJson, iteration: schema.awakened.iteration }).from(schema.awakened),
  ]);
  const currentStats = assetStatsFromRows(currentAssets);
  const canonicalLayers = layers.map((layer) => {
    const id = parseDbId(layer.source_id); const current = id === null ? undefined : currentStats.get(id);
    return { ...layer, rarity: current?.rarity ?? layer.rarity, power: current?.power ?? layer.power, toughness: current?.toughness ?? layer.toughness };
  });
  const identityKey = identityFor(canonicalLayers);
  let previousCount = 0;
  for (const row of existing) {
    const rowIdentity = row.identityKey === "legacy" ? identityFor(parseLayers(row.compositionJson, currentStats)) : row.identityKey;
    if (rowIdentity === identityKey) previousCount += 1;
  }
  const nextNumber = (latest[0]?.id ?? 0) + 1;
  const name = `Awokin ${String(nextNumber).padStart(3, "0")}`;
  const namedMatter = canonicalLayers.filter((layer) => statCategories.has(layer.category)).map((layer) => layer.name);
  const flavorText = birthFlavorText(namedMatter);
  const basePower = canonicalLayers.reduce((sum, layer) => sum + (layer.power ?? 0), 0);
  const baseToughness = canonicalLayers.reduce((sum, layer) => sum + (layer.toughness ?? 0), 0);
  return { canonicalLayers, identityKey, previousCount, name, flavorText, basePower, baseToughness };
}

async function buildStudio(ctx: ActionContext | undefined, opts?: { tenderOnly?: boolean }) {
  // Self-heal (claim adoption): accounts claimed before adoption existed —
  // or claimed on a different device than the one holding their soft
  // visitor state — can still have that state stranded under this
  // browser's visitor id. On the Tender face only, a signed-in Tender
  // whose browser carries a different visitor id adopts that state
  // before the studio is assembled. adoptVisitorState guards itself: it
  // only ever fires for a Tender who owns no Awoken of their own, so
  // two real accounts can never be merged, and once healed it is a
  // couple of count queries and a no-op.
  if (opts?.tenderOnly && ctx?.tender && ctx.visitorId) {
    const tenderKey = tenderOwnerKey(ctx.tender.id);
    if (ctx.visitorId !== tenderKey) {
      await adoptVisitorState(ctx.visitorId, tenderKey);
    }
  }
  const ownerKey = ownerKeyFor(ctx);
  let assetRows = await db.select().from(schema.layerAssets).orderBy(asc(schema.layerAssets.category), desc(schema.layerAssets.id));
  const renames = assetRows.flatMap((row) => {
    const next = mysticalLegacyName(row.category, row.name);
    return next ? [{ id: row.id, name: next }] : [];
  });
  if (renames.length) {
    await Promise.all(renames.map((item) => db.update(schema.layerAssets).set({ name: item.name }).where(eq(schema.layerAssets.id, item.id))));
    assetRows = await db.select().from(schema.layerAssets).orderBy(asc(schema.layerAssets.category), desc(schema.layerAssets.id));
  }
  const pendingIds = new Set(
    (await db.select({ awakenedId: schema.pendingWelcomes.awakenedId }).from(schema.pendingWelcomes))
      .map((row) => row.awakenedId)
  );
  const now = new Date();
  const awakenedRows = (await db.select().from(schema.awakened).orderBy(desc(schema.awakened.id)))
    // Held-apart forms (the welcome greeting, unclaimed free wakes) stay out
    // of every deck until their Tender claims them.
    // Dispersed Awoken (lost in waves) are in time until they re-coalesce.
    .filter((row) => !pendingIds.has(row.id))
    .filter((row) => !row.dispersedUntil || row.dispersedUntil <= now);
  const supportedAssetRows = assetRows.flatMap((row) => {
    const category = layerCategorySchema.safeParse(row.category); const rarity = raritySchema.safeParse(row.rarity);
    return category.success && rarity.success ? [{ ...row, category: category.data, rarity: rarity.data }] : [];
  });
  // Art and stat resolution reads the SHARED map (assetStatsFromRows),
  // never the display-gated rows below: the pool list may show only
  // fileable pieces, but a misfiled piece's art must still reach the
  // deck — that gate is what starved the deck to heads alone.
  const assetStats = assetStatsFromRows(assetRows);
  const assets = supportedAssetRows.map((row) => ({
    id: row.id, name: row.name, category: row.category, rarity: row.rarity, power: row.power, toughness: row.toughness, element: (row as any).element ?? null,
    image_url: blobUrl(row.imageBlobKey), mime_type: row.mimeType, created_at: row.createdAt.toISOString(),
  }));
  const parsedRows = (
    opts?.tenderOnly
      ? awakenedRows.filter(
          (row) =>
            row.collection === "tender" &&
            // Strict ownership: only the Tender's own Awoken.
            row.ownerKey === ownerKey
        )
      : awakenedRows
  ).map((row) => {
    const layers = parseLayers(row.compositionJson, assetStats);
    const identity = row.identityKey === "legacy" ? identityFor(layers) : row.identityKey;
    return { row, layers, identity };
  });
  const idsByIdentity = new Map<string, number[]>();
  for (const item of parsedRows) idsByIdentity.set(item.identity, [...(idsByIdentity.get(item.identity) ?? []), item.row.id].sort((a, b) => a - b));
  const awakened = parsedRows.map(({ row, layers, identity }) => toAwakenedPayload(row, layers, identity, idsByIdentity));
  // Unseen gifts from The Ancient Creator — the Tender face turns this count
  // into the "...another seed grows" notice.
  const giftRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.creatorGifts)
    .where(and(eq(schema.creatorGifts.ownerKey, ownerKey), isNull(schema.creatorGifts.seenAt)));
  return {
    assets,
    awakened,
    tender: ctx?.tender ? publicTender(ctx.tender) : null,
    creatorGifts: giftRows[0]?.count ?? 0,
    credits: {
      balance: await creditBalance(ownerKey),
      packPriceCents: PACK_PRICE_CENTS,
      packPriceLabel: formatUsd(PACK_PRICE_CENTS),
      creditsPerPack: CREDITS_PER_PACK,
      pricePerWakeCents: PRICE_PER_WAKE_CENTS,
      checkoutEnabled: stripeReady(),
    },
  };
}

function badRequest(message: string): never {
  throw Object.assign(new Error(message), { status: 400 });
}

/** Player-readable form of a validation failure (fix list #10, Nigel,
 *  2026-10-13): name the field and what's wrong with it — "the image
 *  is too small", "piece 2's kind is not one of the known kinds" —
 *  never the validation library's raw dump. Shared by the wake save
 *  (saveAwoken) and the whole welcome flow (welcome.ts). */
export function describeValidationIssues(error: z.ZodError): string {
  const fieldName = (path: readonly (string | number)[]): string => {
    const [head, index, sub] = path;
    if (head === "imageBase64") return "the image";
    if (head === "layers") {
      if (typeof index === "number") {
        if (sub === "category") return `piece ${index + 1}'s kind`;
        if (sub === "source_id") return `piece ${index + 1}'s identity`;
        if (sub === "name") return `piece ${index + 1}'s name`;
        if (sub === "rarity") return `piece ${index + 1}'s rarity`;
        if (sub === "power") return `piece ${index + 1}'s power`;
        if (sub === "toughness") return `piece ${index + 1}'s toughness`;
        return `piece ${index + 1}`;
      }
      return "the pieces";
    }
    if (head === "collection") return "the collection";
    if (head === "ownerName") return "the owner's name";
    if (head === "slot") return "the slot";
    if (head === "tileId") return "the tile";
    if (head === "liberatorNames") return "the liberators' names";
    if (head === "name") return "the name";
    return "the awakening";
  };
  const parts = error.issues.map((issue) => {
    const field = fieldName(issue.path as (string | number)[]);
    const head = issue.path[0];
    switch (issue.code) {
      case "too_small":
        if (head === "imageBase64") return "the image is too small — the picture did not arrive whole";
        if (head === "layers" && issue.path.length === 1) return "no pieces were gathered — an Awokin needs a body, arms and a head";
        return `${field} is too small`;
      case "too_big":
        if (head === "imageBase64") return "the image is too large";
        if (head === "layers" && issue.path.length === 1) return "too many pieces — five at most";
        return `${field} is too large`;
      case "invalid_type":
        return /undefined/.test(issue.message) ? `${field} is missing` : `${field} is the wrong shape`;
      case "invalid_value":
        return `${field} is not one of the known kinds`;
      default:
        return `${field} is not right`;
    }
  });
  // A sentence, not a dump: unique problems, at most three named.
  return [...new Set(parts)].slice(0, 3).join("; ");
}



/**
 * CORRUPTION TOUGHNESS PROTOCOL
 *
 * Every cursed tile has a Corruption Toughness that the Awoken must overcome:
 *   Toughness = 3 + (2 × ring)
 * Where "ring" is the hex distance from the purified center (0,0):
 *   Ring 1 (adjacent to center): 5 toughness
 *   Ring 2: 7 toughness
 *   Ring 3: 9 toughness... and so on outward.
 *
 * How Awoken break it:
 * - PASSIVE SIEGE (passivePurify): Every 48 hours, each cursed tile adjacent
 *   to purified land may attempt to break. If the combined power of Awoken
 *   on neighboring purified tiles (plus defenders on the tile itself) meets
 *   the toughness, there is a 30% chance the dark breaks. The timer resets
 *   whether the attempt succeeds or fails.
 *
 * Power is always measured from the Awoken's layers (current pool stats),
 * never from the client's word.
 */
function corruptionToughness(q: number, r: number): number {
  const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
  return 3 + 2 * Math.max(ring, 1);
}



// (bindingBonuses — a +3/+1 defense bonus for binding tiles — was
// deleted 2026-10-17 on Nigel's order: it had no caller, and under
// his law Binding is attunement and healing only. The copy that
// promised it was corrected the same day.)

/** Expand the frontier: when a tile is purified, cursed wilds push outward.
 *  Any missing neighbor of (q,r) becomes a new cursed tile. */
async function expandFrontier(ownerKey: string, q: number, r: number, depth: number = 2) {
  const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const elements = ["tide", "sky", "stone", "root", "neutral"] as const;
  const existing = await db.select({ q: schema.territoryTiles.q, r: schema.territoryTiles.r })
    .from(schema.territoryTiles)
    .where(eq(schema.territoryTiles.ownerKey, ownerKey));
  const seen = new Set(existing.map(t => `${t.q},${t.r}`));
  const now = new Date();
  const mood = await getWorldMood();
  // Expand outward in rings up to depth — ensures a buffer of cursed land.
  // The walk crosses land that already stands (PHASE D, 2026-10-19):
  // depth is measured in rings from the seed hex, not in rings of
  // fresh minting, so the push outward holds across the whole rim.
  let frontier = [[q, r]];
  const queued = new Set([`${q},${r}`]);
  for (let d = 0; d < depth; d++) {
    const next: number[][] = [];
    for (const [cq, cr] of frontier) {
      for (const [dq, dr] of dirs) {
        const nq = cq + dq, nr = cr + dr;
        const key = `${nq},${nr}`;
        if (!seen.has(key)) {
          seen.add(key);
          const el = elements[Math.floor(Math.random() * elements.length)];
          const ring = Math.max(Math.abs(nq), Math.abs(nr), Math.abs(nq + nr));
          const hp = curseHpFor(ring, mood.mood);
          await db.insert(schema.territoryTiles).values({
            ownerKey, q: nq, r: nr, element: el, cursed: 1, lastPassiveAt: now,
            curseHp: hp, curseMaxHp: hp,
          });
        }
        if (!queued.has(key)) { queued.add(key); next.push([nq, nr]); }
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
}

// Self-healing: ensure a living buffer of cursed tiles beyond the
// purified frontier. Called on getTerritory so a stuck map fixes
// itself on next load. PHASE D — THE CURSED FRONTIER (Nigel,
// 2026-10-19): the buffer deepens around the WHOLE purified rim,
// not at one edge tile — more dark beyond the homeland's edge, to
// explore and push back. THE TUNING (Nigel, 2026-10-20): the depth
// stands at FIVE rings — at three, the curse stood on his very
// doorstep and the Fray closed on him from every side at once.
const FRONTIER_DEPTH = 5;
async function ensureFrontierBuffer(ownerKey: string) {
  const tiles = await db.select().from(schema.territoryTiles)
    .where(eq(schema.territoryTiles.ownerKey, ownerKey));
  if (!tiles.length) return;
  const purified = tiles.filter(t => !t.cursed);
  if (!purified.length) return;
  const tileSet = new Set(tiles.map(t => `${t.q},${t.r}`));
  // Every hex within FRONTIER_DEPTH of any purified hex that does
  // not yet stand is owed to the frontier.
  const missing = new Set<string>();
  for (const t of purified) {
    for (let dq = -FRONTIER_DEPTH; dq <= FRONTIER_DEPTH; dq++) {
      for (let dr = Math.max(-FRONTIER_DEPTH, -dq - FRONTIER_DEPTH); dr <= Math.min(FRONTIER_DEPTH, -dq + FRONTIER_DEPTH); dr++) {
        const key = `${t.q + dq},${t.r + dr}`;
        if (!tileSet.has(key)) missing.add(key);
      }
    }
  }
  if (!missing.size) return;
  // Mint the debt with the frontier law's own values — the same
  // element draw and curse reckoning expandFrontier has always used.
  const elements = ["tide", "sky", "stone", "root", "neutral"] as const;
  const mood = await getWorldMood();
  const now = new Date();
  for (const key of missing) {
    const [nq, nr] = key.split(",").map(Number);
    const el = elements[Math.floor(Math.random() * elements.length)];
    const ring = Math.max(Math.abs(nq), Math.abs(nr), Math.abs(nq + nr));
    const hp = curseHpFor(ring, mood.mood);
    await db.insert(schema.territoryTiles).values({
      ownerKey, q: nq, r: nr, element: el, cursed: 1, lastPassiveAt: now,
      curseHp: hp, curseMaxHp: hp,
    });
  }
}


/* ── THE FIRST SEED (Nigel via Wake, 2026-10-17; built 2026-10-18) ──
   The Starfall Bastion intro, replacing the old "Face the Unraveler"
   first claim. A tile-less Tender's world is sown whole — cursed
   rings and frontier, exactly the world the old claim made — but
   NOTHING in it is purified: a star seed lies at the cursed center,
   and the Tender's first ground is earned by HOLDING that seed
   against waves of Fray, refereed here, lazily, on read, like the
   marches and the columns. The ladder is Law's personal-bastion
   ladder: every three waves the seed rises a level. Wave 3 banks
   the seed (the center purifies, the pool fills); fail before the
   bank and the seed simply WAITS — no loss, no clawback. Casting
   never closes. And at the seed's third rising (level 3, wave 9)
   the event lays up its reward, exactly once ever: a single
   attunement point of a random element, waiting to be gathered
   by hand (claimFirstSeedReward). A NEWBORN once stood here —
   the hold counted as a boss equivalent (Nigel, 2026-10-18) —
   struck (Nigel, 2026-10-19): births handed out by an event
   drop the value of minted cards, and creation belongs to the
   Awoken Forge he plans. Boss victories once freed newborns —
   the boss battle mode itself is abolished now (Nigel,
   2026-10-24), and this event no longer pretends to be one.
   THE RISINGS RIDE THE ENGINE (Nigel, 2026-10-24): the
   hold's own wave referee (resolveFirstSeedWave — an
   instant arithmetic struck on read) is RETIRED. The dark
   still arrives in its numbered risings — wave N brings N
   Fray, a minute apart, later sporadic; the seed banks at
   the third rising; the ladder climbs to twelve — but
   every rising now STANDS ON THE LAND as real wanderers
   and is fought by the homeland's living cadence battle,
   exactly as the columns' landed forces are fought. Only
   the referee changed: the risings, their gaps, the bank,
   the ladder, the reward and the fail terms stand
   untouched, and the hold's fell pay (+3✦ capped a Fray,
   +2 XP to the slayer, +10 defense XP to every Awoken who
   stood on the seed's hex during the rising, the fell
   drizzle) is paid on the battle's own fell path for the
   rising's marked Fray (homeland_wanderers.seed_rising),
   in place of the open land's bounty. A rising spawns
   only on a territory read, at the read's end — never
   off-read, never stacked on a rising still standing —
   so no rising can ever fall on a company unseen (the
   Uncle Run's failure shape). The ladder is judged on
   read from the land as the last settle left it, as
   every lazy reckoning in this house: a rising whose
   Fray all fell is cleared; a rising whose Fray hold the
   seed's ground with no defender standing on the seed's
   hex or its ring has broken the defense — the run ends,
   the rising's remaining Fray withdraw with it, and
   banked ground is never clawed back.
   THE GROWTH CYCLE (Nigel, 2026-10-24 18:18 + 18:32,
   ratified whole 19:21; commissioned 2026-10-25): THE
   LADDER IS STRUCK — "forget the waves survied, it will
   be by energy fed." The seed's level no longer derives
   from risings cleared (firstSeedLevelFor is gone, and
   nothing here writes a level): a seed's level is FEEDING'S
   ALONE (settleSeedFeeding, below), for this seed and for
   every seed on the map — Starseed → Sapling of Light →
   Beacon → Bastion is the life cycle of every starseed
   that is not corrupted or consumed. The risings STAND,
   as the defence that comes while the seed feeds — their
   numbers, gaps, pay, the bank at the third rising and
   the fall's terms are untouched — but they measure
   nothing: the hold's event completes when the seed is
   FED to level 3 (a full lighthouse at 30 energy fed),
   where the level-3 reward is laid up, and never at a
   rising count. A fall or an ended run now resets only
   the run's own rising count; banked ground and fed
   growth are never clawed back. */
const FIRST_SEED_MAX_WAVE = 12;
// FIRST_SEED_MAX_LEVEL (the struck ladder's cap of 4) is
// gone with firstSeedLevelFor — levels are feeding's now,
// and the stage names cap themselves in seedStageForLevel.

type FirstSeedEventRow = {
  owner_key: string; seed_id: number; state: string; banked: number;
  waves_cleared: number; next_wave_at: number;
  // newborn_claimed_at rests: written by the struck law until
  // 2026-10-19, never written again — kept so old rows read true.
  newborn_claimed_at: number | null; created_at: number; updated_at: number;
  reward_element: string | null; reward_claimed_at: number | null;
  // THE RISINGS RIDE THE ENGINE (2026-10-24): whether the
  // current rising stands spawned on the land, and the
  // ledger (JSON awakened ids) of the company that has
  // stood on the seed's hex while it stands.
  rising_live: number; rising_stood: string | null;
};

function firstSeedEventRow(ownerKey: string): FirstSeedEventRow | null {
  const row = sqlite.prepare("SELECT * FROM first_seed_events WHERE owner_key = ?").get(ownerKey) as FirstSeedEventRow | undefined;
  return row ?? null;
}

function saveFirstSeedEvent(ev: FirstSeedEventRow): void {
  sqlite.prepare(`UPDATE first_seed_events
    SET state = ?, banked = ?, waves_cleared = ?, next_wave_at = ?, newborn_claimed_at = ?, reward_element = ?, reward_claimed_at = ?, rising_live = ?, rising_stood = ?, updated_at = ?
    WHERE owner_key = ?`)
    .run(ev.state, ev.banked, ev.waves_cleared, ev.next_wave_at, ev.newborn_claimed_at, ev.reward_element, ev.reward_claimed_at, ev.rising_live, ev.rising_stood, Date.now(), ev.owner_key);
}

/** When the wave AFTER `cleared` waves lands: the first three
 *  arrive a minute apart; later gaps turn sporadic (45–120s) —
 *  deliberately chaotic, as ruled. */
function firstSeedWaveGapMs(cleared: number): number {
  const arriving = cleared + 1;
  if (arriving <= 3) return 60 * 1000;
  return 45 * 1000 + Math.floor(Math.random() * 75 * 1000);
}

/** STRUCK (Nigel, 2026-10-24 18:32: "forget the waves survied,
 *  it will be by energy fed"): the seed's level once derived
 *  from risings cleared — firstSeedLevelFor(wavesCleared),
 *  level 1 from the fall, one level every full three waves,
 *  capped at FIRST_SEED_MAX_LEVEL. The reading is dead law;
 *  a seed's level is FEEDING'S alone now (seedLevelForFed,
 *  at the growth cycle below). FIRST_SEED_MAX_WAVE survives
 *  above as the risings' own size cap — the fullest the
 *  dark's investigation ever stands at once. */

/** Sow a brand-new Tender's world: the same cursed rings + frontier
 *  the retired claimFirstTile generated — but the center stays
 *  CURSED, the seed's own hex, its curse reckoned by the ring law
 *  at ring 0. Returns the center tile id. */
async function generateFirstWorld(ownerKey: string): Promise<number> {
  const now = new Date();
  const { mood } = await getWorldMood();
  const elements = ["tide", "sky", "stone", "root", "neutral"] as const;
  const pick = () => elements[Math.floor(Math.random() * elements.length)];
  const centerHp = curseHpFor(0, mood);
  const [center] = await db.insert(schema.territoryTiles).values({
    ownerKey, q: 0, r: 0, element: pick(), cursed: 1, lastPassiveAt: now,
    curseHp: centerHp, curseMaxHp: centerHp,
  }).returning({ id: schema.territoryTiles.id });
  const ringHp = curseHpFor(1, mood);
  const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  for (const [dq, dr] of dirs) {
    await db.insert(schema.territoryTiles).values({
      ownerKey, q: dq, r: dr, element: pick(), cursed: 1, lastPassiveAt: now,
      curseHp: ringHp, curseMaxHp: ringHp,
    });
  }
  for (const [dq, dr] of dirs) {
    await expandFrontier(ownerKey, dq, dr);
  }
  return center.id;
}

/** ONE SAFE SQUARE, ALWAYS (Nigel, 2026-10-23 22:40: "The map
 *  at default needs to have one safe square at least, for the
 *  tender to rebuild from. My uncle is currently stuck and
 *  I'll bet other tenders are too."): every Tender's map
 *  guarantees AT LEAST ONE safe square — a purified, standing
 *  tile — the rebuilding ground a Tender falls back to when
 *  everything else is lost. The guarantee fires ONLY when no
 *  purified tile stands: a Tender holding safe ground is
 *  never touched by it — nothing re-purified, moved or
 *  minted, his tile states exactly as they stood. When it
 *  fires, ONE tile is purified in place, by the standing
 *  purification shape (the neutral purify the claim and the
 *  wave-victory paths write: cursed 0, element neutral, the
 *  curse HP cleared, PURIFIED_TILE_FIELDS — born clean at
 *  Z1: buildable, standable, dealing no curse damage). No
 *  new land is minted — the frontier buffer law owns minting
 *  on reads, as it always has.
 *  THE ANCHOR is the code's own chain — the one tenderStand
 *  and bastionAnchorTileId walk: (1) his bastion building's
 *  tile; (2) the heart (0,0) — the map's centre, the first
 *  seed's hex; (3) the nearest other ground to the heart, by
 *  the land's ring law, lowest id breaking the tie so the
 *  choice never wanders. Where the standing chain passes a
 *  cursed anchor OVER (the bastion wake never lands
 *  mid-curse), this guarantee does the opposite at the same
 *  address: it PURIFIES the anchor rather than choosing
 *  different ground — the square a groundless Tender is
 *  given back is his home square, not a stranger's.
 *  THE SEED STANDS APART: while the first seed's hold is
 *  live and unbanked, its hex is the seed referee's ground —
 *  the bank at wave 3 is the only law that may purify it,
 *  and its waves, state and ladder are never read for
 *  change or written here (the referee itself stands
 *  untouched by this build, stopped on Nigel's word at
 *  piece 5's fork). If the anchor chain names that hex, the
 *  guarantee steps to the nearest OTHER ground and purifies
 *  that instead: a fresh Tender's safe square stands beside
 *  his seed, and the hold he must fight for the centre is
 *  exactly as it was.
 *  `tiles`, when given, is the caller's just-loaded tile
 *  rows, mutated in place so the read that fired the
 *  guarantee serves the square it made. */
async function ensureOneSafeSquare(ownerKey: string, tiles?: any[]): Promise<{ ensured: boolean; tileId: number | null }> {
  const rows: any[] = tiles ?? await db.select().from(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
  if (!rows.length) return { ensured: false, tileId: null };
  if (rows.some((t: any) => !t.cursed)) return { ensured: false, tileId: null };
  // The first seed's hex, while its hold is live and
  // unbanked: the referee's ground, never this law's.
  let seedHexId: number | null = null;
  try {
    const ev = firstSeedEventRow(ownerKey);
    if (ev && !ev.banked && ev.state !== "done") {
      const seed = sqlite.prepare("SELECT tile_id AS tileId FROM star_seeds WHERE id = ? AND owner_key = ?").get(ev.seed_id, ownerKey) as { tileId: number } | undefined;
      if (seed) seedHexId = seed.tileId;
    }
  } catch { /* no seed ledger — the chain walks on */ }
  const standable = (t: any) => (t.z ?? 0) === 0 && (t.buildStage ?? 0) !== 1 && t.id !== seedHexId;
  const ring = (t: any) => Math.max(Math.abs(t.q), Math.abs(t.r), Math.abs(t.q + t.r));
  let chosen: any = null;
  try {
    const b = sqlite.prepare("SELECT b.tile_id AS tileId FROM star_seeds s JOIN territory_buildings b ON b.id = s.bastion_building_id WHERE s.owner_key = ? AND s.bastion_building_id IS NOT NULL LIMIT 1").get(ownerKey) as { tileId: number } | undefined;
    if (b) chosen = rows.find((t: any) => t.id === b.tileId && standable(t)) ?? null;
  } catch { /* no bastion yet — the chain walks on */ }
  if (!chosen) chosen = rows.find((t: any) => t.q === 0 && t.r === 0 && standable(t)) ?? null;
  if (!chosen) {
    chosen = rows.filter(standable).sort((a: any, b: any) => ring(a) - ring(b) || a.id - b.id)[0] ?? null;
  }
  if (!chosen) return { ensured: false, tileId: null };
  const upd = { cursed: 0, element: "neutral" as const, curseHp: null, curseMaxHp: null, ...PURIFIED_TILE_FIELDS };
  await db.update(schema.territoryTiles).set(upd as any).where(eq(schema.territoryTiles.id, chosen.id));
  Object.assign(chosen, upd);
  return { ensured: true, tileId: chosen.id };
}

/** The element a victorious company claims land with: the dominant
 *  element of their layers, read from the parts' own records (fire
 *  never claims conquered land; a tie falls to the DEFAULT — root
 *  since Nigel's ruling, 2026-10-25: "i hoped the default would be
 *  root"; before that ruling the default was neutral, per the
 *  2026-10-20 law "purifying defaults to NEUTRAL on all maps,
 *  never air" — never-air stands). The same arithmetic the claim
 *  paths have always used, kept in one place. */
async function dominantClaimElement(standingRows: Array<{ compositionJson: string }>): Promise<"tide" | "sky" | "stone" | "root"> {
  const assetRows = await db.select().from(schema.layerAssets);
  const assetStats = new Map<number, AssetStats>();
  for (const assetRow of assetRows) {
    const rarity = raritySchema.safeParse(assetRow.rarity);
    if (rarity.success) assetStats.set(assetRow.id, { name: assetRow.name, rarity: rarity.data, power: assetRow.power, toughness: assetRow.toughness, element: (assetRow as any).element ?? null });
  }
  const elementCounts: Record<"tide" | "sky" | "stone" | "root", number> = { tide: 0, sky: 0, stone: 0, root: 0 };
  for (const a of standingRows) {
    for (const layer of parseLayers(a.compositionJson, assetStats)) {
      const el = storedElement((layer as any).element);
      if (el !== "fire" && el !== "neutral") elementCounts[el] += 1;
    }
  }
  let element: "tide" | "sky" | "stone" | "root" = "root";
  let maxCount = 0; let tie = false;
  for (const [el, count] of Object.entries(elementCounts)) {
    if (count > maxCount) { maxCount = count; element = el as typeof element; tie = false; }
    else if (count === maxCount && count > 0) { tie = true; }
  }
  if (tie) element = "root";
  return element;
}

/** THE STANDARD AND THE BEACON, READ AT HOME (2026-10-21):
 *  the Twin Standard and the Beacon can be RAISED on the
 *  homeland — castMapWorking writes their rows — but until now
 *  nothing at home read them; their bonuses lived only in the
 *  client's battle mirror. At the Table the server reads both
 *  where strikes are reckoned (table.ts, strikeOnce), and this
 *  is that reading in the homeland's tongue, its numbers the
 *  Table's own:
 *   · THE STANDARD lends its book's strikeBonus to a striker
 *     standing on either hex it divides — the ward row's own
 *     two hexes, read off its canonical edge — widened to the
 *     hexes NEIGHBOURING its two when the Banner's Reach stands
 *     among the Tender's gifts, exactly as at the Table.
 *   · THE BEACON lends its book's darkBonus against dark
 *     standing on or beside its two hexes — its own ring,
 *     widened a ring apiece by the gifts the Table widens it
 *     by (the Bright Pillar, Falling Light). The Pillar's other
 *     clause — that its light serves the whole party — has no
 *     second Tender to serve on this ground; every working
 *     here is the one Tender's own.
 *  One Standard and one Beacon lend at a time, as at the Table
 *  (the first standing whose ground covers). Neither reading
 *  knows a hue: both pages are colourless — they hold no slots
 *  and cast unaligned — and the hue a raising was stored under
 *  is never consulted. The reading is spent where the homeland
 *  reckons its own company striking: THE LIVING BATTLE's
 *  answer pass (settleHomelandBattle), strike by strike —
 *  the Standard judged by the ground the striker stands on,
 *  the Beacon by the ground the dark stands on, both lent
 *  flat into the blow's raw harm before mitigation, exactly
 *  as the Table's strikeOnce spends them. (Until the risings
 *  rode the engine, 2026-10-24, the reading's only homeland
 *  spender was the first-seed hold's referee, which judged
 *  both halves at the seed's hex; that referee is retired
 *  and the battle is the homeland's striking referee now —
 *  the reading rides with it, or it would be read nowhere
 *  at home.) It is deliberately NOT spent at the weapon
 *  referee (the Table's weapon strikes carry neither bonus
 *  — fireWeapon reads its die alone). */
function homelandBannerBonus(ownerKey: string, striker: { q: number; r: number }, target: { q: number; r: number }): { std: number; bcn: number } {
  const rows = sqlite.prepare("SELECT engine, q, r, dir, nums FROM territory_workings WHERE owner_key = ? AND kind = 'ward' AND engine IN ('standard', 'beacon') ORDER BY id").all(ownerKey) as any[];
  if (!rows.length) return { std: 0, bcn: 0 };
  const eff = workingEffects(ownerKey);
  let std = 0, bcn = 0, stdFound = false, bcnFound = false;
  for (const w of rows) {
    if (stdFound && bcnFound) break;
    let nums: Record<string, number> = {};
    try { nums = JSON.parse(w.nums ?? "{}"); } catch { nums = {}; }
    const d = WALL_DIRS[Number(w.dir ?? 0)] ?? [0, 0];
    const ends = [{ q: Number(w.q), r: Number(w.r) }, { q: Number(w.q) + d[0], r: Number(w.r) + d[1] }];
    const near = (t: { q: number; r: number }) => Math.min(...ends.map(e => hexDistTiles(t, e)));
    if (w.engine === "standard" && !stdFound) {
      if (near(striker) <= (eff.bannerReach ? 1 : 0)) { std = nums.strikeBonus ?? 1; stdFound = true; }
    } else if (w.engine === "beacon" && !bcnFound) {
      const reach = 1 + (eff.brightPillar ? 1 : 0) + (eff.fallingLight ? 1 : 0);
      if (near(target) <= reach) { bcn = nums.darkBonus ?? 1; bcnFound = true; }
    }
  }
  return { std, bcn };
}

/** The marked Fray of the rising now standing: the rising
 *  numbered `wave` of this Tender's hold, spawned onto the
 *  land by spawnFirstSeedRising and fought by the living
 *  battle. Their rows are the rising's body: while any
 *  stands, the rising stands. */
function firstSeedRisingFray(ownerKey: string, wave: number): any[] {
  return sqlite.prepare("SELECT * FROM homeland_wanderers WHERE owner_key = ? AND seed_rising = ?").all(ownerKey, wave) as any[];
}

/** The rising's stood ledger, read: the awakened ids of the
 *  company that has stood on the seed's hex while the
 *  rising stands, accumulated on reads by the judgement
 *  below. A garbled ledger reads empty rather than false. */
function firstSeedStoodIds(ev: FirstSeedEventRow): Set<number> {
  const stood = new Set<number>();
  try {
    for (const id of JSON.parse(ev.rising_stood ?? "[]")) {
      if (Number.isFinite(Number(id))) stood.add(Number(id));
    }
  } catch { /* a garbled ledger pays the defense nothing twice over */ }
  return stood;
}

/** The defense's pay: every Awoken in the rising's stood
 *  ledger takes the standing defense XP (+10) — the old
 *  referee's pay to every Awoken who stood, made at the
 *  rising's end, cleared or fallen, exactly as it was made
 *  at its instant resolutions. (The living battle's own
 *  struck-pay does not ride on the rising's Fray: their
 *  blows are the hold's to reckon, and this is the whole
 *  of the defense's pay for them — see the strike pass.) */
async function payFirstSeedStood(ownerKey: string, ev: FirstSeedEventRow): Promise<void> {
  const stood = firstSeedStoodIds(ev);
  if (!stood.size) return;
  const xpById = new Map<number, XpGainReport>();
  for (const id of stood) await grantEventXp(xpById, id, XP_PER_DEFENSE);
}

/** A RISING'S CLEARING, SETTLED — the old referee's settle
 *  block, carried onto the living battle's event: the
 *  defense paid first (above), then the bank at the third
 *  rising, and the next rising scheduled by its gap. THE
 *  GROWTH CYCLE (2026-10-25) struck everything else this
 *  block once did: no level is read or written here (levels
 *  are feeding's alone), no reward is laid up here (it is
 *  laid up at the feeding rise to level 3), and no rising
 *  count completes the run (the event completes at that
 *  same feeding rise). The risings measure nothing now —
 *  they are the defence that comes while the seed feeds. */
async function settleFirstSeedLadder(ownerKey: string, ev: FirstSeedEventRow, seed: any, wave: number): Promise<void> {
  await payFirstSeedStood(ownerKey, ev);
  ev.waves_cleared = wave;
  if (wave === 3 && !ev.banked) {
    // THE BANK: the center purifies under the company standing on
    // it, wearing their dominant element; the pool fills to the
    // cap (the margin's gift — the cap itself grows only by
    // waking, as it always has).
    const standingRows = await db.select().from(schema.fieldPlacements)
      .where(and(eq(schema.fieldPlacements.ownerKey, ownerKey), eq(schema.fieldPlacements.tileId, seed.tile_id)));
    const standingAw = standingRows.length
      ? await db.select().from(schema.awakened).where(inArray(schema.awakened.id, standingRows.map(p => p.awakenedId)))
      : [];
    const element = await dominantClaimElement(standingAw);
    await db.update(schema.territoryTiles)
      .set({ cursed: 0, element, curseHp: null, curseMaxHp: null, ...PURIFIED_TILE_FIELDS })
      .where(eq(schema.territoryTiles.id, seed.tile_id));
    // The neighboring cursed land feels the shift — their passive
    // timers start now, as on every purification.
    const center = await db.select({ q: schema.territoryTiles.q, r: schema.territoryTiles.r })
      .from(schema.territoryTiles).where(eq(schema.territoryTiles.id, seed.tile_id)).limit(1);
    if (center.length) {
      const nowD = new Date();
      const neighborCoords = [
        [center[0].q + 1, center[0].r], [center[0].q - 1, center[0].r],
        [center[0].q, center[0].r + 1], [center[0].q, center[0].r - 1],
        [center[0].q + 1, center[0].r - 1], [center[0].q - 1, center[0].r + 1],
      ];
      for (const [nq, nr] of neighborCoords) {
        await db.update(schema.territoryTiles)
          .set({ lastPassiveAt: nowD })
          .where(and(
            eq(schema.territoryTiles.ownerKey, ownerKey),
            eq(schema.territoryTiles.q, nq),
            eq(schema.territoryTiles.r, nr),
            eq(schema.territoryTiles.cursed, 1),
          ));
      }
    }
    ev.banked = 1;
    const maxEnergy = await calculateMaxEnergy(ownerKey);
    await getEnergyFor(ownerKey); // the row exists before it is filled
    await db.update(schema.tenderResources)
      .set({ energy: maxEnergy, updatedAt: new Date() })
      .where(eq(schema.tenderResources.ownerKey, ownerKey));
  }
  // THE GROWTH CYCLE (2026-10-25): the level write and the
  // twelfth-rising completion that stood here are STRUCK
  // with the ladder — the seed's level rises only in the
  // feeding settle, the level-3 reward is laid up there
  // (applySeedStageRise carries the 2026-10-19 reward law:
  // once ever, a single attunement point of a random
  // element, gathered by hand), and the event completes
  // there. A clearing only ever schedules the next rising.
  ev.next_wave_at = Date.now() + firstSeedWaveGapMs(wave);
  ev.rising_live = 0;
  ev.rising_stood = null;
  saveFirstSeedEvent(ev);
}

/** THE HOLD'S JUDGEMENT, on read (the risings ride the
 *  engine, 2026-10-24): the living battle fights the
 *  rising; this pass reads the land as the last settle
 *  left it and settles the rising's fate:
 *   · the company standing on the seed's hex is entered
 *     into the rising's stood ledger, against the defense
 *     pay at its end;
 *   · if no Fray of the rising stands and the lighthouse
 *     burns, the rising FLED — driven off with all the
 *     standing dark, neither won nor lost: it comes again
 *     after its gap, nothing paid, nothing lost (the
 *     pushback lifts the mark itself in settleProtection;
 *     this is the same reading for any road that emptied
 *     the land under a lit light);
 *   · if no Fray of the rising stands under an unlit sky,
 *     the rising is CLEARED and the ladder settles;
 *   · if Fray of the rising hold the seed's own ground
 *     and no defender stands on the seed's hex or its
 *     ring, the defense has FALLEN — the old referee's
 *     verdict when its wave outlived its company: the run
 *     ends, the rising's remaining Fray withdraw with it,
 *     banked ground is never clawed back, and unbanked
 *     the seed simply waits, whole.
 *  A rising drawn away across the map by the company it
 *  chases has broken nothing — the fight has only moved,
 *  and the ladder waits on its end, as it waits on any
 *  living battle. Spawning is NOT this pass's work: a
 *  rising lands only at a territory read's end
 *  (spawnFirstSeedRising), in the open. */
async function settleFirstSeedEvent(ownerKey: string): Promise<void> {
  const ev = firstSeedEventRow(ownerKey);
  if (!ev || ev.state !== "holding") return;
  const seed = sqlite.prepare("SELECT * FROM star_seeds WHERE id = ? AND owner_key = ?").get(ev.seed_id, ownerKey) as any;
  if (!seed) { ev.state = "done"; ev.next_wave_at = 0; ev.rising_live = 0; ev.rising_stood = null; saveFirstSeedEvent(ev); return; }
  if (!ev.rising_live) return; // no rising stands: the spawn pass owns arrivals
  const wave = ev.waves_cleared + 1;

  // The stood ledger grows by whoever holds the hex now.
  const stood = firstSeedStoodIds(ev);
  const onTile = await db.select({ awakenedId: schema.fieldPlacements.awakenedId }).from(schema.fieldPlacements)
    .where(and(eq(schema.fieldPlacements.ownerKey, ownerKey), eq(schema.fieldPlacements.tileId, seed.tile_id)));
  let grew = false;
  for (const r of onTile) if (!stood.has(r.awakenedId)) { stood.add(r.awakenedId); grew = true; }
  if (grew) { ev.rising_stood = JSON.stringify([...stood]); saveFirstSeedEvent(ev); }

  const fray = firstSeedRisingFray(ownerKey, wave);
  if (!fray.length) {
    const prow = sqlite.prepare("SELECT lighthouse_lit AS lit FROM tender_progress WHERE owner_key = ?").get(ownerKey) as any;
    if (prow && Number(prow.lit) === 1) {
      ev.rising_live = 0;
      ev.rising_stood = null;
      ev.next_wave_at = Date.now() + firstSeedWaveGapMs(ev.waves_cleared);
      saveFirstSeedEvent(ev);
      return;
    }
    await settleFirstSeedLadder(ownerKey, ev, seed, wave);
    return;
  }

  const seedTile = sqlite.prepare("SELECT q, r FROM territory_tiles WHERE id = ?").get(seed.tile_id) as { q: number; r: number } | undefined;
  if (!seedTile) return;
  const ring = new Set<string>([`${seedTile.q},${seedTile.r}`]);
  for (const [dq, dr] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) ring.add(`${seedTile.q + dq},${seedTile.r + dr}`);
  const tiles = await db.select().from(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
  const tileById = new Map(tiles.map(t => [t.id, t]));
  const placements = await db.select().from(schema.fieldPlacements).where(eq(schema.fieldPlacements.ownerKey, ownerKey));
  const defended = placements.some(p => { const t = tileById.get(p.tileId); return !!t && ring.has(`${t.q},${t.r}`); });
  if (defended) return;
  const frayHolds = fray.some(w => {
    if (w.pos_q != null && w.pos_r != null) {
      const cell = axialRound(Number(w.pos_q), Number(w.pos_r));
      return ring.has(`${cell.q},${cell.r}`);
    }
    const t = tileById.get(w.tile_id);
    return !!t && ring.has(`${t.q},${t.r}`);
  });
  if (!frayHolds) return;

  // THE DEFENSE FALLS: the run ends. The defense is paid
  // for standing, as the old referee paid it at a fallen
  // wave's resolution; the rising's remaining Fray
  // withdraw with the run — they were the event's own,
  // and the seed waits whole, exactly as it waited when
  // the old referee's wave ceased at its resolution.
  // Banked ground is never clawed back, and under the
  // growth cycle (2026-10-25) neither is fed growth: the
  // fall resets only the run's own rising count, so the
  // next run's risings number from the first again.
  await payFirstSeedStood(ownerKey, ev);
  sqlite.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ? AND seed_rising = ?").run(ownerKey, wave);
  ev.state = "waiting";
  ev.next_wave_at = 0;
  ev.rising_live = 0;
  ev.rising_stood = null;
  ev.waves_cleared = 0;
  saveFirstSeedEvent(ev);
}

/** THE RISING LANDS (the risings ride the engine,
 *  2026-10-24): when a territory read finds the hold
 *  underway, no rising standing, and the next rising's
 *  hour come, the rising takes the land HERE — at the
 *  read's end, after every settle has had its say — as
 *  real wanderers on and around the seed's hex, in the
 *  Fray's own canon body (HOMELAND_DARK_HP / _POWER, the
 *  body the old referee read from the game's enemy
 *  config), each carrying its rising's number. Three
 *  guards keep the old lazy referee's promise in the
 *  living world:
 *   · ON PRESENCE ONLY: nothing spawns off a territory
 *     read, and this read's own response serves the new
 *     Fray standing whole at the seed — an arrival is
 *     always witnessed by the read that births it, and
 *     the fight begins with the NEXT read's window. No
 *     rising ever falls on a company unseen.
 *   · ONE AT A TIME: a rising still standing bars the
 *     next, however late it runs — risings never stack,
 *     and the ladder's clock is always set from a
 *     clearing, as it was set from a resolution.
 *   · THE LIGHT HOLDS SPAWNING SHUT: while the lighthouse
 *     burns, all spawning is shut (settleProtection's
 *     law), and the seed's risings wait with the dark. */
async function spawnFirstSeedRising(ownerKey: string, tiles: any[]): Promise<void> {
  const ev = firstSeedEventRow(ownerKey);
  if (!ev || ev.state !== "holding" || ev.rising_live || !ev.next_wave_at) return;
  if (Date.now() < ev.next_wave_at) return;
  const prow = sqlite.prepare("SELECT lighthouse_lit AS lit FROM tender_progress WHERE owner_key = ?").get(ownerKey) as any;
  if (prow && Number(prow.lit) === 1) return;
  const seed = sqlite.prepare("SELECT * FROM star_seeds WHERE id = ? AND owner_key = ?").get(ev.seed_id, ownerKey) as any;
  if (!seed) return;
  const byId = new Map((tiles as any[]).map(t => [t.id, t]));
  const byQR = new Map((tiles as any[]).map(t => [`${t.q},${t.r}`, t]));
  const seedTile = byId.get(seed.tile_id);
  if (!seedTile) return;
  const wave = ev.waves_cleared + 1;
  const hosts = [seedTile,
    ...[[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([dq, dr]) => byQR.get(`${seedTile.q + dq},${seedTile.r + dr}`)),
  ].filter(Boolean) as any[];
  if (!hosts.length) return;
  // Standing points within a host hex, cycled so the
  // rising spreads over the ground it holds instead of
  // stacking on one point — the columns' landing spread.
  const SPREAD: [number, number][] = [[0, 0], [0.32, 0], [0, 0.32], [-0.32, 0.16], [0.16, -0.32], [-0.32, -0.16], [0.32, 0.32], [-0.16, 0.32]];
  const now = Date.now();
  const ins = sqlite.prepare("INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, seed_rising) VALUES (?, ?, 'fray', ?, ?, ?, ?, ?, 1, ?)");
  // THE GROWTH CYCLE (2026-10-25): a rising's size is its
  // number, as it always was — but the count is capped at
  // the struck ladder's top (FIRST_SEED_MAX_WAVE): the hold
  // now runs until the seed is FED to level 3, however many
  // risings that takes, and past the twelfth the dark's
  // investigation stands at its fullest, twelve Fray, and
  // comes again at twelve.
  const risingSize = Math.min(wave, FIRST_SEED_MAX_WAVE);
  for (let i = 0; i < risingSize; i++) {
    const host = hosts[i % hosts.length];
    const [oq, orr] = SPREAD[Math.floor(i / hosts.length) % SPREAD.length];
    ins.run(ownerKey, host.id, now, HOMELAND_DARK_HP.fray, host.q + oq, host.r + orr, HOMELAND_DARK_POWER.fray, wave);
  }
  ev.rising_live = 1;
  ev.rising_stood = null;
  ev.next_wave_at = 0;
  saveFirstSeedEvent(ev);
}

/* ── THE STARSEED GROWTH CYCLE (Nigel, 2026-10-24: the life
   cycle at 18:03, the sanctuary + feeding law at 18:18, the
   waves ladder struck at 18:32, the footprint at 18:37;
   RATIFIED WHOLE 19:21 "all sounds good"; commissioned
   2026-10-25 00:28) ───────────────────────────────────────
   Starseed → Sapling of Light → Beacon → Bastion is the
   life cycle of EVERY starseed that is not corrupted or
   consumed for energy — the first seed's growth is simply
   the Tender's lighthouse growing (the ceremony's own
   words). A seed's LEVEL IS FEEDING'S ALONE: energy fed
   over time (the attunement share of the climb is an open
   pencil, unruled — no attunement channel is built here).
   Stage powers, as ruled: level 1 purifies its own hex
   (a fallen seed does it at its fall, in the starfall
   pass; the first seed's hex is the hold's bank, the one
   standing exception the intro's law keeps); level 2, the
   Sapling, purifies the surrounding 6; level 3, the
   Beacon, gains PROTECTION over its center hex and all 6
   around it (the 7-hex footprint — on the homeland the
   cradle births no dark inside a Beacon's light, and the
   first seed's protection is the Tender's own lighthouse,
   whose ending resets the wave intensity to 1 by the
   protection settle's standing law); level 4, the Bastion,
   stands in law with NO FACE YET — Nigel draws it; the map
   carries a Bastion-stage seed in the Beacon's face until
   his hand delivers its own (flagged, never invented).
   Feeding has ONE built channel: THE PASSIVE DRAW — the
   first time a Tender enters the field near a seed, the
   seed begins drawing energy from them on its own, and
   keeps drawing while the company stands within its field
   (the two rings its calm covers). The draw is settled
   lazily on territory reads, like every reckoning in this
   house, and only across presence (a silence longer than
   the protection settle's presence gap draws nothing).
   Expending energy excites the dark — the draw rides
   spendEnergy, so the Curse's Eye opens as a seed drinks,
   exactly as the dictation's example tells it (the
   defence comes investigating while the company feeds). */
export const SEED_STAGE_NAMES = ["starseed", "sapling", "beacon", "bastion"] as const;
export type SeedStage = (typeof SEED_STAGE_NAMES)[number];
export function seedStageForLevel(level: number): SeedStage {
  const l = Math.max(1, Math.min(4, Math.floor(Number(level) || 1)));
  return SEED_STAGE_NAMES[l - 1];
}
/** THE CLIMB'S PRICES. One figure is Nigel's own (18:18):
 *  level 3 — "a full lighthouse" — at 30 ENERGY FED. The
 *  level-2 step is NOT his figure: the climb divides into
 *  equal steps of 15 (the Keeper's derivation, named here
 *  for his strike, as the record's discipline requires —
 *  the alternative, no Sapling until 30, would strike the
 *  stage powers he ruled). Level 4's price is UNRULED —
 *  feeding raises no seed past 3 in this build; a seed
 *  stands at the Bastion only by the older roads' levels,
 *  kept as they were earned. */
export const SEED_FED_FOR_LEVEL_2 = 15;
export const SEED_FED_FOR_LEVEL_3 = 30;
export function seedLevelForFed(fedEnergy: number): number {
  const fed = Math.max(0, Math.floor(Number(fedEnergy) || 0));
  if (fed >= SEED_FED_FOR_LEVEL_3) return 3;
  if (fed >= SEED_FED_FOR_LEVEL_2) return 2;
  return 1;
}
/** THE DRAW SETTLES IN WHOLE ENERGY — the purse is whole
 *  points everywhere in this house — with the fractional
 *  pace carried in the seed's feed_credit; credit that
 *  cannot be paid is not banked beyond a point (the seed
 *  drinks only what the purse can give). The company's
 *  passive draw (0.25 a minute for company standing
 *  within two rings — the growth cycle's first shape of
 *  the draw, read off the lighthouse upkeep) stood here
 *  until Nigel struck it (2026-10-25 12:19: "Feeding is
 *  only the Tender on the hex — strike the company
 *  draw"); its constants went with it. What remains is
 *  the Tender's own rate, below. */
/** THE TENDER'S OWN STANDING RATE (Nigel, 2026-10-25
 *  11:42: "tenders feed rate is 5 energy per min"): while
 *  the Tender herself stands ON a living seed's own tile,
 *  that seed drinks from her purse at FIVE energy a minute
 *  — her own faster rate, named in this one place so a
 *  later ruling tunes it here alone. It STACKS with her
 *  company's draw above into the same credit ledger,
 *  under the same whole-energy, presence-gap and
 *  credit-cap laws. */
export const SEED_FEED_TENDER_PER_MINUTE = 5;
/** THE SUMMONING STEP (Nigel, 2026-10-25 11:51:
 *  "summing power increases the rate of energy fed to
 *  starsseed by .5 per lvl"): each point of the Tender's
 *  summoning power adds HALF an energy a minute to her
 *  standing feed. The measure is the LIVE one her summon
 *  cast already rolls with — summonersPowerFor: the
 *  zodiac's "summoner" clause sum, the level spread, the
 *  Sage's +3 — read whole, never re-derived here. */
export const SEED_FEED_TENDER_SUMMONING_STEP = 0.5;
/** THE TENDER'S STANDING RATE, kept in this one place:
 *  her base five a minute plus the summoning step per
 *  point of her summoning power. Nothing else rides any
 *  rate — feeding is the Tender's act alone now (the
 *  company draw struck, Nigel 2026-10-25 12:19). */
export function tenderStandingFeedRateFor(ownerKey: string | null | undefined, tenderLevel?: number | null, classKey?: string | null): number {
  return SEED_FEED_TENDER_PER_MINUTE + SEED_FEED_TENDER_SUMMONING_STEP * summonersPowerFor(ownerKey, tenderLevel, classKey);
}

/** The purification a stage rise writes: the house's own
 *  standing shape (the purify the claim and the bank paths
 *  write — born clean at Z1, at the DEFAULT element: root
 *  since Nigel's ruling, 2026-10-25; before, neutral). */
async function purifySeedGroundTile(tileId: number): Promise<void> {
  await db.update(schema.territoryTiles)
    .set({ cursed: 0, element: "root", curseHp: null, curseMaxHp: null, ...PURIFIED_TILE_FIELDS })
    .where(eq(schema.territoryTiles.id, tileId));
}

/** A seed's rise, made true on the land (the growth cycle):
 *  at the Sapling (level 2) its light widens — the six
 *  tiles around it purify, still-cursed ones only, wearing
 *  the neutral purification, their cursed neighbours'
 *  passive timers started as on every purification. (The
 *  seed's OWN hex is level 1's business: purified at the
 *  fall for fallen seeds; the first seed's centre stays
 *  the hold's bank, untouched here.) At the Beacon
 *  (level 3) the first seed's hold completes: the reward
 *  is laid up once ever (Nigel, 2026-10-19 — a single
 *  attunement point of a random element, shining until
 *  gathered by hand; the newborn claim that once stood at
 *  this level stays struck, creation belonging to the
 *  Forge), a rising still standing withdraws with the
 *  event as it does at an ended run, and the event rests
 *  done — the seed stands as the Tender's lighthouse. */
async function applySeedStageRise(ownerKey: string, seed: any, fromLevel: number, toLevel: number): Promise<void> {
  if (toLevel >= 2 && fromLevel < 2) {
    const home = sqlite.prepare("SELECT q, r FROM territory_tiles WHERE id = ?").get(seed.tile_id) as { q: number; r: number } | undefined;
    if (home) {
      const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
      const nowD = new Date();
      for (const [dq, dr] of DIRS) {
        const n = sqlite.prepare("SELECT id, cursed FROM territory_tiles WHERE owner_key = ? AND q = ? AND r = ?")
          .get(ownerKey, home.q + dq, home.r + dr) as { id: number; cursed: number } | undefined;
        if (!n || !n.cursed) continue;
        await purifySeedGroundTile(n.id);
        for (const [eq2, er2] of DIRS) {
          await db.update(schema.territoryTiles)
            .set({ lastPassiveAt: nowD })
            .where(and(
              eq(schema.territoryTiles.ownerKey, ownerKey),
              eq(schema.territoryTiles.q, home.q + dq + eq2),
              eq(schema.territoryTiles.r, home.r + dr + er2),
              eq(schema.territoryTiles.cursed, 1),
            ));
        }
      }
    }
  }
  if (toLevel >= 3 && fromLevel < 3) {
    const ev = firstSeedEventRow(ownerKey);
    if (ev && ev.seed_id === seed.id && ev.state !== "done") {
      if (!ev.reward_element) {
        ev.reward_element = ATTUNEMENT_ELEMENTS[Math.floor(Math.random() * ATTUNEMENT_ELEMENTS.length)];
      }
      if (ev.rising_live) {
        sqlite.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ? AND seed_rising = ?").run(ownerKey, ev.waves_cleared + 1);
        ev.rising_live = 0;
        ev.rising_stood = null;
      }
      ev.state = "done";
      ev.next_wave_at = 0;
      saveFirstSeedEvent(ev);
    }
  }
}

/** THE DRAW, settled on the territory read (the growth
 *  cycle): every living seed — fallen, held, the first —
 *  drinks while THE TENDER HERSELF stands on its own hex,
 *  in whole energy, against the purse as it stands. The
 *  seed's level follows its fed ledger and only ever
 *  rises here; a rise is made true on the land in the
 *  same pass (applySeedStageRise). Seeds the curse holds
 *  (corrupted) and seeds already taken up (fetched) do
 *  not drink — the cycle is for the living. FEEDING IS
 *  ONLINE ONLY (Nigel, 2026-10-25 12:18: "Seed feeding
 *  only happens online actively while the tender is on
 *  the hex"): presence is the read itself — the anchor
 *  walks with every settle, a span past the standing
 *  presence gap (PROTECTION_ONLINE_GAP_MS, the measure
 *  every presence economy in this house keeps) banks
 *  nothing, and no settle reckons the feed across an
 *  absence.
 *  THE TENDER IS THE ONLY FEEDER (Nigel, 2026-10-25):
 *  "standing on the tile of a starseed with your tender
 *  begins feeding it your energy" (11:34) — she feeds at
 *  HER OWN RATE, five a minute (his ruling of 11:42)
 *  plus half a point per point of her summoning power
 *  (his ruling of 11:51). The company's passive draw —
 *  the growth cycle's first shape, company within two
 *  rings drinking at the upkeep's rate — was STRUCK the
 *  same morning (12:19: "Feeding is only the Tender on
 *  the hex — strike the company draw"): no Awoken's
 *  presence, at any distance, feeds any seed now.
 *  Her standing tile is the server's own record — the
 *  tile the validated movement road (setTenderTile) last
 *  seated her on, read here exactly as tenderStand reads
 *  it.
 *  THE GROUND ANSWERS HER ARRIVAL (Nigel, 2026-10-25
 *  11:48: "instant purification on seed hex when a
 *  tender joins so he can feed the seed without dying
 *  to the curse"): when she takes the feeding stand on
 *  a living seed's hex and that hex is CURSED, the hex
 *  purifies in this same settle — instantly, the seed's
 *  one hex only, through the seed ground's standing
 *  purify — so she can feed in safety. It is her arrival
 *  that answers, not her purse: the purification is not
 *  gated on the feed paying. A corrupted seed is not a
 *  living seed and never reaches this loop at all — its
 *  ground is untouched by the ruling. */
async function settleSeedFeeding(ownerKey: string): Promise<void> {
  const seeds = sqlite.prepare("SELECT * FROM star_seeds WHERE owner_key = ? AND state IN ('fallen','held','first')").all(ownerKey) as any[];
  if (!seeds.length) return;
  const now = Date.now();
  const tiles = await db.select().from(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
  const byId = new Map(tiles.map(t => [t.id, t]));
  const tenderRow = sqlite.prepare("SELECT tender_tile_id AS tileId, total_exp AS totalExp, class_key AS classKey FROM tender_progress WHERE owner_key = ?").get(ownerKey) as { tileId: number | null; totalExp: number | null; classKey: string | null } | undefined;
  const tenderTile = tenderRow?.tileId != null ? byId.get(tenderRow.tileId) : undefined;
  // Her standing rate for this reckoning (base + the
  // summoning step), reckoned once when she stands
  // anywhere the read can see — the per-seed test below
  // spends it only on the seed she actually stands on.
  const tenderRate = tenderTile ? tenderStandingFeedRateFor(ownerKey, levelForExp(Number(tenderRow?.totalExp ?? 0)), tenderRow?.classKey) : 0;
  for (const seed of seeds) {
    const home = byId.get(seed.tile_id);
    const anchor = Number(seed.feed_anchor_at || 0);
    if (!home) {
      if (anchor !== now) sqlite.prepare("UPDATE star_seeds SET feed_anchor_at = ? WHERE id = ?").run(now, seed.id);
      continue;
    }
    // HER ARRIVAL PURIFIES THE SEED'S HEX (the ruling
    // above): the moment her recorded stand IS this
    // living seed's tile, cursed ground under it turns —
    // before any reckoning of the draw, and whether or
    // not the draw can pay this settle.
    if (tenderTile != null && tenderTile.id === home.id && home.cursed) {
      await purifySeedGroundTile(home.id);
      home.cursed = 0; home.element = "root"; home.curseHp = null; home.curseMaxHp = null;
      Object.assign(home, PURIFIED_TILE_FIELDS);
    }
    if (!anchor) {
      sqlite.prepare("UPDATE star_seeds SET feed_anchor_at = ? WHERE id = ?").run(now, seed.id);
      continue;
    }
    const elapsed = now - anchor;
    let credit = Number(seed.feed_credit || 0);
    let fed = Number(seed.fed_energy || 0);
    let changed = false;
    // THE ONE FEEDING TEST: her recorded stand IS this
    // seed's tile, inside an online span. (Her arrival's
    // purification above already read the same stand.)
    const tenderOn = tenderTile != null && tenderTile.id === home.id;
    if (elapsed > 0 && elapsed <= PROTECTION_ONLINE_GAP_MS && tenderOn) {
      credit += (elapsed / 60000) * tenderRate;
      const whole = Math.floor(credit);
      if (whole >= 1) {
        const purse = await getEnergyFor(ownerKey);
        const take = Math.min(whole, Math.max(0, Math.floor(purse)));
        if (take > 0) {
          await spendEnergy(ownerKey, take);
          fed += take;
          credit -= take;
        }
      }
      if (credit >= 2) credit = 1.999;
      changed = true;
    }
    const levelBefore = Math.max(1, Number(seed.level || 1));
    const level = Math.max(levelBefore, seedLevelForFed(fed));
    if (changed || level !== levelBefore || fed !== Number(seed.fed_energy || 0)) {
      sqlite.prepare("UPDATE star_seeds SET fed_energy = ?, feed_credit = ?, feed_anchor_at = ?, level = ? WHERE id = ?")
        .run(fed, credit, now, level, seed.id);
      seed.fed_energy = fed; seed.feed_credit = credit; seed.level = level;
    } else if (now - anchor > 1000) {
      sqlite.prepare("UPDATE star_seeds SET feed_anchor_at = ? WHERE id = ?").run(now, seed.id);
    }
    if (level > levelBefore) await applySeedStageRise(ownerKey, seed, levelBefore, level);
  }
}

// Energy helpers: server-authoritative energy per tender.
async function grantBirthEnergy(ownerKey: string, power: number): Promise<number> {
  // When an Awoken is born, recalculate max and grant the energy bonus immediately.
  let bonus = 0;
  if (power >= 10) bonus = 4;
  else if (power >= 7) bonus = 3;
  else if (power >= 4) bonus = 2;
  else if (power >= 1) bonus = 1;
  if (bonus > 0) {
    const maxEnergy = await calculateMaxEnergy(ownerKey);
    const current = await getEnergyFor(ownerKey);
    const next = Math.min(current + bonus, maxEnergy);
    await db.update(schema.tenderResources)
      .set({ energy: next, updatedAt: new Date() })
      .where(eq(schema.tenderResources.ownerKey, ownerKey));
  }
  return bonus;
}

export async function calculateMaxEnergy(ownerKey: string): Promise<number> {
  // 10 base + power-scaled bonus per Awoken owned (hand and deployed —
  // holding Awoken feeds the cap; Nigel, 2026-10-13: the contribution
  // DOUBLED so holding is rewarding — the tripled scale ran too high and
  // was retuned down the same evening):
  // 1-3pwr:+2, 4-6:+4, 7-9:+6, 10+:+8
  // Defending/binding only raise the cap, not the refresh rate.
  // Each active Dream Tree: +1 max energy.
  const awoken = await db.select().from(schema.awakened)
    .where(eq(schema.awakened.ownerKey, ownerKey));
  let max = 10;
  for (const a of awoken) {
    // Skip dispersed (in re-coalescence)
    if (a.dispersedUntil && new Date(a.dispersedUntil) > new Date()) continue;
    try {
      const layers = JSON.parse(a.compositionJson) as { power?: number }[];
      const p = layers.reduce((sum, l) => sum + (l.power ?? 0), 0);
      if (p >= 10) max += 8;
      else if (p >= 7) max += 6;
      else if (p >= 4) max += 4;
      else if (p >= 1) max += 2;
    } catch {}
  }
  // Dream Trees and Awakening Wells: configurable energy bonus each
  const gameConfig = await loadGameConfig();
  const trees = await db.select().from(schema.territoryBuildings)
    .where(and(
      eq(schema.territoryBuildings.ownerKey, ownerKey),
      eq(schema.territoryBuildings.buildingType, "tree"),
      eq(schema.territoryBuildings.status, "active"),
    ));
  max += trees.length * (gameConfig.buildings["tree"]?.energyBonus ?? 1);
  const wells = await db.select().from(schema.territoryBuildings)
    .where(and(
      eq(schema.territoryBuildings.ownerKey, ownerKey),
      eq(schema.territoryBuildings.buildingType, "awakening-well"),
      eq(schema.territoryBuildings.status, "active"),
    ));
  max += wells.length * (gameConfig.buildings["awakening-well"]?.energyBonus ?? 3);
  const skywells = await db.select().from(schema.territoryBuildings)
    .where(and(
      eq(schema.territoryBuildings.ownerKey, ownerKey),
      eq(schema.territoryBuildings.buildingType, "dream-weed"),
      eq(schema.territoryBuildings.status, "active"),
    ));
  max += skywells.length * (gameConfig.buildings["dream-weed"]?.energyBonus ?? 3);
  const skyBlooms = await db.select().from(schema.territoryBuildings)
    .where(and(
      eq(schema.territoryBuildings.ownerKey, ownerKey),
      eq(schema.territoryBuildings.buildingType, "sky-bloom"),
      eq(schema.territoryBuildings.status, "active"),
    ));
  max += skyBlooms.length * (gameConfig.buildings["sky-bloom"]?.energyBonus ?? 3);
  // THE VESSEL (the Building System, Nigel 2026-10-19): the land
  // a Tender creates and holds is a vessel for his energy — the
  // terrain bank raises the home cap point for point. Safe
  // unless the territory falls: nothing nibbles the bank, and a
  // created tile lost to the curse takes back only its own gift.
  max += await terrainBankFor(ownerKey);
  return max;
}

async function getEnergyFor(ownerKey: string): Promise<number> {
  const res = await db.select().from(schema.tenderResources)
    .where(eq(schema.tenderResources.ownerKey, ownerKey)).limit(1);
  if (!res.length) {
    await db.insert(schema.tenderResources).values({ ownerKey, energy: 10 });
    return 10;
  }
  return res[0].energy;
}

async function spendEnergy(ownerKey: string, amount: number): Promise<boolean> {
  const current = await getEnergyFor(ownerKey);
  if (current < amount) return false;
  await db.update(schema.tenderResources)
    .set({ energy: current - amount, updatedAt: new Date() })
    .where(eq(schema.tenderResources.ownerKey, ownerKey));
  noteEnergySpent(ownerKey, amount);
  return true;
}

/* ── THE CURSE'S EYE (Nigel, 2026-10-17, the columns) ──────────
   The true measure is ENERGY SPENT: every point a Tender spends
   opens the Eye a point wider, and the Eye — with the pool and
   its gain — sizes, speeds, and times the columns it sends.
   Time closes the Eye again (a point every two minutes). While
   the Eye stands lit (25+) and no column walks, one is coming:
   the curse always keeps at least one attack in flight against
   a lit Tender. Fully open (100+), the column is a SIEGE, and
   even a 2-energy spend feeds it. Beating a column buys a
   12-minute break before the next timer may start. */
const EYE_SPAWN_THRESHOLD = 25;
const EYE_SIEGE_THRESHOLD = 100;
const EYE_DECAY_PER_MIN = 0.5;
const EYE_SPAWN_RELIEF = 40;
const COLUMN_MIN_TRAVEL_MIN = 12;
const INCURSION_BREAK_MS = 12 * 60 * 1000;

function decayedEye(row: { eye: number; updated_at: number } | undefined, nowMs: number): number {
  if (!row) return 0;
  const mins = Math.max(0, (nowMs - Number(row.updated_at || 0)) / 60000);
  return Math.max(0, Number(row.eye || 0) - mins * EYE_DECAY_PER_MIN);
}

/** Every spend anywhere in the world feeds the spender's Eye.
    Fail-silent by law: attention must never break a purchase. */
function noteEnergySpent(ownerKey: string, amount: number) {
  if (!ownerKey || !(amount > 0)) return;
  try {
    const now = Date.now();
    const row = sqlite.prepare("SELECT eye, updated_at FROM tender_attention WHERE owner_key = ?").get(ownerKey) as any;
    const eye = decayedEye(row, now) + amount;
    sqlite.prepare(`INSERT INTO tender_attention (owner_key, eye, updated_at, break_until, total_spent)
      VALUES (?, ?, ?, 0, ?)
      ON CONFLICT(owner_key) DO UPDATE SET eye = excluded.eye, updated_at = excluded.updated_at, total_spent = tender_attention.total_spent + excluded.total_spent`)
      .run(ownerKey, eye, now, amount);
  } catch { /* the Eye blinks; the spend stands */ }
}

/** A SEED FALLS TO THE CURSE (Nigel, 2026-10-17 — Q4 and the
    failed-seed law): however it is lost — unheld when a column
    arrives, unfetched, its hold broken — the seed becomes a
    CURSED BASTION: the seed corrupts, and its hex is cursed
    ground again, the dark's fortress where the light failed. */
/** A call's join key (the Columns, 2026-10-17): six letters
    of an unambiguous alphabet, unique among open calls. */
const CALL_KEY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function mintCallKey(): string {
  for (;;) {
    let k = "";
    for (let i = 0; i < 6; i++) k += CALL_KEY_ALPHABET[Math.floor(Math.random() * CALL_KEY_ALPHABET.length)];
    const clash = sqlite.prepare("SELECT id FROM bastion_calls WHERE join_key = ? AND state = 'open'").get(k) as any;
    if (!clash) return k;
  }
}

function corruptSeed(ownerKey: string, seed: { id: number; tile_id: number }) {
  sqlite.prepare("UPDATE star_seeds SET state = 'corrupted' WHERE id = ?").run(seed.id);
  sqlite.prepare("UPDATE territory_tiles SET cursed = 1 WHERE id = ? AND owner_key = ?").run(seed.tile_id, ownerKey);
}

/* ENEMY AC (Nigel, 2026-10-22) lives in enemyAC.ts: an
 * enemy's AC is base 10 + its kind's AC bonus off its
 * workshop record; the roster's armor below is that AC,
 * read through enemyACFor. */

/** A column's force, from the Compendium's canon numbers,
    hardened by the hosting Tender's level (incursions scale
    with Tender level). */
export function incursionRoster(size: number, powerTier: number) {
  const bonus = Math.max(0, powerTier - 1);
  const kinds = [
    { kind: "fray", share: 0.5, power: 1, hp: 3 },
    { kind: "unraveler", share: 0.25, power: 4, hp: 6 },
    { kind: "tangle", share: 0.15, power: 3, hp: 8 },
    { kind: "hollow", share: 0.1, power: 0, hp: 5 },
  ];
  const out: { kind: string; count: number; power: number; hp: number; armor: number }[] = [];
  let left = size;
  kinds.forEach((k, i) => {
    const n = i === kinds.length - 1 ? left : Math.min(left, Math.round(size * k.share));
    // The roster's armor is the kind's full AC (enemyAC.ts),
    // hardened by the tier as power and hp are.
    if (n > 0) out.push({ kind: k.kind, count: n, power: k.power + Math.floor(bonus / 2), hp: k.hp + bonus, armor: enemyACFor(k.kind) + bonus });
    left -= Math.max(0, n);
  });
  return out.filter(r => r.count > 0);
}

/** THE HAND OF TWENTY (Station 4, Nigel 2026-10-20): a Tender
 *  keeps a play hand of twenty Awokin; the rest wait in reserve
 *  in the deck, which alone hosts the whole roster. Presence
 *  in tender_hand IS the choosing — and an untouched ledger
 *  reads as the default hand: the first twenty of the roster,
 *  by waking order, so no Tender wakes to an empty hand. */
export const HAND_CAP = 20;
export function rosterIdsFor(ownerKey: string): number[] {
  return (sqlite.prepare("SELECT id FROM awakened WHERE owner_key = ? ORDER BY id ASC").all(ownerKey) as { id: number }[]).map(r => r.id);
}
export function handIdsFor(ownerKey: string): number[] {
  const roster = rosterIdsFor(ownerKey);
  const chosen = (sqlite.prepare("SELECT awakened_id FROM tender_hand WHERE owner_key = ?").all(ownerKey) as { awakened_id: number }[])
    .map(r => r.awakened_id);
  if (!chosen.length) return roster.slice(0, HAND_CAP);
  const mine = new Set(roster);
  return chosen.filter(id => mine.has(id)).slice(0, HAND_CAP);
}
/** Awokin staged at the bastion, waiting as reinforcements. */
export function stagedIdsFor(ownerKey: string): number[] {
  return (sqlite.prepare("SELECT awakened_id FROM bastion_staged WHERE owner_key = ? ORDER BY staged_at ASC").all(ownerKey) as { awakened_id: number }[])
    .map(r => r.awakened_id);
}
/** THE BASTION (Station 4): the held seed whose bastion
 *  building stands — the staging hall's own row. Mirrors the
 *  anchor chain's first choice in bastionAnchorTileId. */
export function bastionRowFor(ownerKey: string): { seedId: number; tileId: number; level: number } | null {
  try {
    const b = sqlite.prepare(`SELECT s.id AS seedId, s.level AS level, b.tile_id AS tileId
      FROM star_seeds s JOIN territory_buildings b ON b.id = s.bastion_building_id
      WHERE s.owner_key = ? AND s.state = 'held' AND s.bastion_building_id IS NOT NULL LIMIT 1`).get(ownerKey) as any;
    return b ? { seedId: Number(b.seedId), tileId: Number(b.tileId), level: Number(b.level ?? 1) } : null;
  } catch { return null; }
}

// Record a deed for the Hall of Legends
async function recordDeed(ownerKey: string, awakenedId: number, deed: string) {
  const existing = await db.select().from(schema.awokenLegends)
    .where(and(
      eq(schema.awokenLegends.awakenedId, awakenedId),
      eq(schema.awokenLegends.deed, deed as any)
    )).limit(1);
  if (existing.length) {
    await db.update(schema.awokenLegends)
      .set({ count: existing[0].count + 1 })
      .where(eq(schema.awokenLegends.id, existing[0].id));
  } else {
    await db.insert(schema.awokenLegends).values({
      awakenedId, ownerKey, deed: deed as any, count: 1,
    });
  }
}

// Weather's sky (Nigel's ruling, the Sky's Terrace, 2026-10-15): world
// moods are short reigns of ROUGHLY 15 minutes — never a metronome.
// Weather sways each reign a few minutes either way as her mood
// pertains, and storms and calms (quiet) may linger a little longer at
// her discretion. The mood roll is the Pantheon app's weighted roll —
// same weights, same law: the manic sky prefers change over repetition,
// so a mood that just reigned is six times less likely to roll again.
// Great Storms are NOT part of this roll: authored events only,
// initiated by the Ancient One. The old week-long sequential rotation
// is deleted; a stored reign with more than a longest reign left to
// run can only be one of its leftovers, so it is cut short below.
export type WorldMood = "thickening" | "thinning" | "quiet" | "storm";
const MOODS: WorldMood[] = ["thickening", "thinning", "quiet", "storm"];
const MOOD_DESCRIPTIONS: Record<WorldMood, string> = {
  thickening: "The dark grows dense. Cursed tiles hold +50% HP.",
  thinning: "The veil is thin. Attunement completes twice as fast.",
  quiet: "A hush falls. Fewer waves, but the Awokin dream vividly.",
  storm: "The Unraveling rages. Waves strike with +50% power.",
};
const MOOD_WEIGHTS: Record<WorldMood, number> = {
  thickening: 30,
  thinning: 28,
  quiet: 27,
  storm: 15,
};
// Each reign's sway, in minutes: [shortest, longest]. Base ~15;
// thickening and thinning pass a little quicker, quiet and storm
// are the moods Weather may hold longer.
export const MOOD_REIGN_MINUTES: Record<WorldMood, [number, number]> = {
  thickening: [12, 16],
  thinning: [11, 15],
  quiet: [15, 21],
  storm: [15, 22],
};
const LONGEST_REIGN_MS = 22 * 60 * 1000;

export function rollWorldMood(current: WorldMood | null): WorldMood {
  const pool: WorldMood[] = [];
  for (const mood of MOODS) {
    let w = MOOD_WEIGHTS[mood];
    if (current !== null && mood === current) w = Math.max(1, Math.round(w / 6));
    for (let i = 0; i < w; i++) pool.push(mood);
  }
  return pool[Math.floor(Math.random() * pool.length)] ?? "quiet";
}

/** A reign's length, rolled within the mood's sway at its start so
 *  every reader (battle, terrain, Music's playlist) agrees on endsAt. */
export function worldMoodReignMs(mood: WorldMood, firstReign = false): number {
  if (firstReign) return (10 + Math.floor(Math.random() * 3)) * 60 * 1000; // 10–12 min
  const [min, max] = MOOD_REIGN_MINUTES[mood];
  return (min + Math.floor(Math.random() * (max - min + 1))) * 60 * 1000;
}

type WorldMoodState = { mood: WorldMood; description: string; endsAt: string };

// -- The Voice's weather pathway (Phase 1 of her Instrument, DESIGN.md
// §2; ordered by Nigel 2026-10-15 23:15, "using the same webhook") -----
// The game server posts to the Voice's Discord channel when the sky
// turns. The pipe is the SAME webhook the story-sending rides
// (DISCORD_STORIES_WEBHOOK_URL — one channel, one herald, per Nigel's
// word) and it FAILS CLOSED: unset, the Voice simply has no road and
// nothing is posted, ever. She speaks ONCE per reign: the reign's
// endsAt is claimed in settings before the post is attempted, so no
// reign is ever announced twice — not across restarts, not across
// readers — and a failed post is logged and forgotten, never retried
// into chatter (the Voice does not chatter; Anti-Duolingo whole).
// A workshop master switch (voice_weather_enabled) can still her.

const VOICE_WEATHER_LINES: Record<WorldMood, string> = {
  thickening: "The sky turns. The dark grows dense over the Bastion — cursed ground holds harder under this sky.",
  thinning: "The sky turns. The veil thins — attunement runs swift, and the world feels briefly near.",
  quiet: "The sky turns. A hush falls over the world — mist on the Bastion, and the Awokin dreaming vividly.",
  storm: "The sky turns. A storm is gathering — the Unraveling rages, and Music is already tuning to it.",
};
const VOICE_WEATHER_COLORS: Record<WorldMood, number> = {
  thickening: 0x4a3b2a,
  thinning: 0x7f9bb3,
  quiet: 0x8fa383,
  storm: 0xb03a2e,
};

async function getVoiceSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
  return rows.length ? rows[0].value : null;
}

async function setVoiceSetting(key: string, value: string): Promise<void> {
  await db.insert(schema.settings).values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

/** Post one message to the Voice's Discord channel through her one
 *  webhook. Returns false (never throws) when she has no road or
 *  Discord turns the message away — gameplay must never feel it. */
async function postToVoiceChannel(payload: { embeds: unknown[] }): Promise<boolean> {
  if (!DISCORD_STORIES_WEBHOOK_URL) return false;
  try {
    const response = await fetch(`${DISCORD_STORIES_WEBHOOK_URL}?wait=true`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "The Voice", ...payload }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Her voice, bundled (Nigel's word, 2026-10-15 23:30: "build the
// voice into the weather pathway"). Discord voice messages proper
// are a client-only feature — no webhook can send one — but a
// webhook CAN carry an audio file that plays in the channel. The
// weather is a finite tongue: four skies, four lines, so the Voice
// pre-rendered each reign's line in her own voice (Delighted
// Bellflower) and the recordings live with the server at
// server/assets/voice/weather-<mood>.mp3 (the Dockerfile copies
// server/ whole, so they ride every deploy). World news is
// arbitrary text and cannot be pre-rendered — it rides as text.

const VOICE_ASSET_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "voice");

async function weatherAudioFor(mood: WorldMood): Promise<Buffer | null> {
  try {
    return await readFile(join(VOICE_ASSET_DIR, `weather-${mood}.mp3`));
  } catch {
    return null;
  }
}

/** Post a weather telling, with the Voice's own voice attached when
 *  her recording for this sky exists (multipart, the story-send's
 *  shape); if the recording is missing the text still rides alone —
 *  the news is never held hostage to the voice. */
async function postWeatherToVoiceChannel(mood: WorldMood, embed: Record<string, unknown>): Promise<boolean> {
  if (!DISCORD_STORIES_WEBHOOK_URL) return false;
  const audio = await weatherAudioFor(mood);
  if (!audio) return postToVoiceChannel({ embeds: [embed] });
  try {
    const form = new FormData();
    form.append("payload_json", JSON.stringify({ username: "The Voice", embeds: [embed] }));
    form.append("files[0]", new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }), `weather-${mood}.mp3`);
    const response = await fetch(`${DISCORD_STORIES_WEBHOOK_URL}?wait=true`, { method: "POST", body: form });
    return response.ok;
  } catch {
    return false;
  }
}

/** Announce a freshly rolled reign, once. Fire-and-forget by design:
 *  the caller (getWorldMood) never waits on Discord. */
async function announceWeatherReign(mood: WorldMood, endsAt: string): Promise<void> {
  try {
    if ((await getVoiceSetting("voice_weather_last_announced")) === endsAt) return;
    // Claim this reign before speaking, so she can never speak it twice.
    await setVoiceSetting("voice_weather_last_announced", endsAt);
    if ((await getVoiceSetting("voice_weather_enabled")) === "0") return;
    const posted = await postWeatherToVoiceChannel(mood, {
      title: "The sky turns",
      description: `${VOICE_WEATHER_LINES[mood]}\n\n*${MOOD_DESCRIPTIONS[mood]}*`,
      color: VOICE_WEATHER_COLORS[mood],
      footer: { text: "The Voice · the weather of the Awokin world" },
    });
    if (!posted && DISCORD_STORIES_WEBHOOK_URL) {
      console.warn(`[voice] weather post for the ${mood} reign was not delivered; it will not be retried.`);
    }
  } catch (err) {
    console.warn("[voice] weather announcement failed quietly:", err);
  }
}

async function storeWorldMood(data: WorldMoodState): Promise<WorldMoodState> {
  await db.insert(schema.settings).values({ key: "world_mood", value: JSON.stringify(data) })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: JSON.stringify(data) } });
  return data;
}

async function getWorldMood(): Promise<WorldMoodState> {
  const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, "world_mood")).limit(1);
  const now = Date.now();
  let lastMood: WorldMood | null = null;
  if (rows.length) {
    try {
      const data = JSON.parse(rows[0].value) as WorldMoodState;
      if (MOODS.includes(data.mood)) {
        lastMood = data.mood;
        const remainingMs = new Date(data.endsAt).getTime() - now;
        if (remainingMs > 0 && remainingMs <= LONGEST_REIGN_MS) {
          return { mood: data.mood, description: MOOD_DESCRIPTIONS[data.mood], endsAt: data.endsAt };
        }
        if (remainingMs > LONGEST_REIGN_MS) {
          // A leftover week-long reign from the old sky: keep the mood
          // the world is under, but cut its reign to a swayed length.
          const endsAt = new Date(now + worldMoodReignMs(data.mood)).toISOString();
          return await storeWorldMood({ mood: data.mood, description: MOOD_DESCRIPTIONS[data.mood], endsAt });
        }
      }
    } catch { /* malformed stored sky: fall through and roll a fresh one */ }
  }
  // The reign has ended (or the world is new): roll the next sky. One
  // roll however many reigns passed unwatched, as in the Pantheon app.
  // A brand-new world opens quiet and brief — never the old accident
  // of a first mood that stormed for a week.
  const firstReign = lastMood === null;
  const mood = firstReign ? "quiet" : rollWorldMood(lastMood);
  const endsAt = new Date(now + worldMoodReignMs(mood, firstReign)).toISOString();
  const stored = await storeWorldMood({ mood, description: MOOD_DESCRIPTIONS[mood], endsAt });
  // THE WEATHER CHANGE, COUNTED (the battle engine, Nigel
  // 2026-10-23): every NEW reign — and only a new reign; the
  // cut-short leftover above keeps the sky it was under — is
  // one turn of the escalation clock. The count lives in
  // settings beside the sky itself, so every Tender's wave
  // intensity reckons from the same weather.
  if (!firstReign) {
    try {
      const cur = sqlite.prepare("SELECT value FROM settings WHERE key = 'weather_reign_count'").get() as { value: string } | undefined;
      const n = (cur ? Number(JSON.parse(cur.value)) || 0 : 0) + 1;
      sqlite.prepare("INSERT INTO settings (key, value) VALUES ('weather_reign_count', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(n));
    } catch { /* the count is bookkeeping; the sky never waits on it */ }
  }
  // A new reign is the one moment the Voice speaks the weather —
  // fire-and-forget, so no reader ever waits on Discord.
  void announceWeatherReign(mood, endsAt);
  return stored;
}

// Weather's teeth (Nigel's order, the Sky's Terrace, 2026-10-15): the
// mood effects the game's own descriptions have always promised, in
// one server-side table every system reads — no tooth without this
// table behind it. THE LIVE SKY APPLIES (Nigel's ruling, same day):
// no mood is ever snapshotted at a battle's start; every reckoning
// reads the sky at its own moment, so a storm that begins mid-battle
// surges mid-battle, and one that spends itself lifts mid-battle.
// (The one deliberate exception is quiet's recovery stretch, which is
// stamped at the victory — see waveRecoveryMult — because the
// alternative is a next-wave countdown that flickers as moods turn.)
export interface MoodEffects {
  wavePowerMult: number;      // storm: Unravelings strike harder
  curseHpMult: number;        // thickening: cursed births hold more HP
  attunementRateMult: number; // thinning: attunement completes faster
  waveRecoveryMult: number;   // quiet: the Unraveling gathers slower
}
export function moodEffects(mood: WorldMood): MoodEffects {
  return {
    wavePowerMult: mood === "storm" ? 1.5 : 1,
    curseHpMult: mood === "thickening" ? 1.5 : 1,
    attunementRateMult: mood === "thinning" ? 2 : 1,
    waveRecoveryMult: mood === "quiet" ? 1.5 : 1,
  };
}

/** Curse HP for a tile born (or reborn cursed) under the given sky:
 *  the ring law, 4 + ring × 6, thickened by the live mood. Tiles keep
 *  the HP they were born with — thickening bites at birth, everywhere
 *  a curse is born, and nowhere else. */
/** THE SEED-CALM (Nigel, 2026-10-17): a HELD star seed is a
 *  second home. The curse within TWO RINGS of it (19 hexes —
 *  his ruling) is reckoned by its distance from the SEED, as
 *  the land around the first hex is reckoned from home, so
 *  its level drops to tamable; the calm never raises a
 *  curse — a hex keeps whichever reckoning is kinder.
 *  EXTENDED by the sanctuary law (Nigel, 2026-10-24 18:18):
 *  a FALLEN seed thins the curse the same way — "a fallen
 *  seed purifies the tile it lands on and reduces the
 *  curse's strength all around for two rings, at the
 *  strength profile of the curse around the FIRST star" —
 *  so the calm's sources are every LIVING seed: fallen,
 *  held, and the first seed itself, the star the profile
 *  is named for. (A corrupted seed calms nothing: its
 *  light is in the dark's hands.) */
export const SEED_CALM_RADIUS = 2;
export function calmEffRing(seedHexes: { q: number; r: number }[], q: number, r: number, mapRing: number): number {
  let eff = mapRing;
  for (const sd of seedHexes) {
    const dq = q - sd.q, dr = r - sd.r;
    const dist = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
    if (dist <= SEED_CALM_RADIUS) eff = Math.min(eff, dist);
  }
  return eff;
}
async function livingSeedHexes(ownerKey: string): Promise<{ q: number; r: number }[]> {
  const rows = sqlite.prepare("SELECT tile_id FROM star_seeds WHERE owner_key = ? AND state IN ('fallen','held','first')").all(ownerKey) as { tile_id: number }[];
  if (!rows.length) return [];
  const tiles = await db.select({ id: schema.territoryTiles.id, q: schema.territoryTiles.q, r: schema.territoryTiles.r })
    .from(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
  const byId = new Map(tiles.map(t => [t.id, t]));
  return rows.flatMap(rw => { const t = byId.get(rw.tile_id); return t ? [{ q: t.q, r: t.r }] : []; });
}

export function curseHpFor(ring: number, mood: WorldMood): number {
  return Math.ceil((4 + ring * 6) * moodEffects(mood).curseHpMult);
}

// Single source of truth for wave power. Wave 1 = 7, +2 per wave, +4 per Unraveler (every 3rd wave).
// Under a live storm the total swells by half (Weather's tooth); the
// Unraveler count is the wave's own law and does not change — the
// surge arrives as Fray.
export function wavePowerFor(wave: number, mood: WorldMood | null = null): { totalPower: number; unravelers: number; frayCount: number } {
  const unravelers = Math.floor(wave / 3);
  const base = 7 + (wave - 1) * 2 + unravelers * 4;
  const totalPower = mood ? Math.round(base * moodEffects(mood).wavePowerMult) : base;
  const frayCount = totalPower - unravelers * 4;
  return { totalPower, unravelers, frayCount };
}

// Wave recovery (fix list #4, Nigel, 2026-10-13): after a victory the
// Unraveling needs time to gather itself — the next wave can be faced
// 12 minutes × 1.15^k after the last victory, where k is the waves
// defeated BEFORE that victory (wave 1 → 12 min, wave 2 ≈ 13.8,
// wave 5 ≈ 20.9, wave 10 ≈ 42.2). Gentle growth, never a wall.
export const WAVE_COOLDOWN_BASE_MS = 12 * 60 * 1000;
export function waveCooldownMs(defeatedBeforeVictory: number): number {
  return Math.round(WAVE_COOLDOWN_BASE_MS * Math.pow(1.15, Math.max(0, defeatedBeforeVictory)));
}

/** When the next wave may be faced, as an ISO string — or null when the
 *  way is open now (no victory yet, or the recovery has elapsed). The
 *  stored wavesDefeated already counts the victory that started the
 *  wait, so the exponent is that count minus the victory itself. */
export function nextWaveAtFor(state: { lastVictoryAt: Date | null; wavesDefeated: number; recoveryMult?: number | null }): string | null {
  if (!state.lastVictoryAt) return null;
  const exponent = Math.max(0, state.wavesDefeated - 1);
  // Quiet's tooth: a victory won under a quiet sky stamps a longer
  // recovery (×1.5) — fewer waves can be faced in its wake. Stamped
  // at the victory, not read live, so the countdown never flickers.
  const readyAt = new Date(state.lastVictoryAt).getTime() + waveCooldownMs(exponent) * (state.recoveryMult ?? 1);
  return readyAt > Date.now() ? new Date(readyAt).toISOString() : null;
}

// Conceive a victory twin from both tenders' champions.
// Body/arm/head drawn randomly per slot from the two champions' pieces (VICTORY BIRTH).
async function conceiveConfluenceTwin(hostKey: string, guestKey: string, sessionId: number) {
  const champions: any[] = [];
  for (const key of [hostKey, guestKey]) {
    const champRows = await db.select().from(schema.tenderChampions)
      .where(eq(schema.tenderChampions.ownerKey, key)).limit(1);
    if (champRows.length) {
      const a = await db.select().from(schema.awakened)
        .where(eq(schema.awakened.id, champRows[0].awakenedId)).limit(1);
      if (a.length) champions.push(a[0]);
    }
  }
  // Fallback: random Awoken from each tender if no champion
  if (champions.length < 2) {
    for (const key of [hostKey, guestKey]) {
      if (champions.some(ch => ch.ownerKey === key)) continue;
      const owned = await db.select().from(schema.awakened)
        .where(and(eq(schema.awakened.ownerKey, key), eq(schema.awakened.collection, "tender")))
        .limit(1);
      if (owned.length) champions.push(owned[0]);
    }
  }
  if (champions.length < 2) return null;

  // Draw one piece per slot from the two champions
  const pickFrom = (cat: string) => {
    const options = [];
    for (const ch of champions) {
      try {
        const layers = JSON.parse(ch.compositionJson);
        const piece = layers.find((l: any) => l.category === cat);
        if (piece) options.push(piece);
      } catch {}
    }
    return options[Math.floor(Math.random() * options.length)];
  };
  const body = pickFrom("body"), arms = pickFrom("arms"), head = pickFrom("head");
  if (!body || !arms || !head) return null;

  const layers = [body, arms, head];
  // Generate a simple composite image (placeholder — real art comes from the pieces)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="194"><rect width="150" height="194" fill="#1a1a1a"/><text x="75" y="100" text-anchor="middle" fill="#b89b5e" font-size="24">✦</text></svg>`;
  const blobKey = `twin-${sessionId}-${Date.now()}`;
  const { blobs } = await import("./store.js");
  blobs.put(blobKey, Buffer.from(svg), "image/svg+xml");

  const name = `Twin of ${champions[0].name} & ${champions[1].name}`;
  const flavorText = "Born of confluence — when two tenders stood together, I was conceived in victory.";
  await db.insert(schema.confluenceTwins).values({
    sessionId,
    name,
    imageBlobKey: blobKey,
    compositionJson: JSON.stringify(layers),
    flavorText,
  }).onConflictDoNothing();

  return { name, image_url: blobUrl(blobKey), compositionJson: JSON.stringify(layers), flavorText };
}

async function getConceivedTwin(sessionId: number) {
  const rows = await db.select().from(schema.confluenceTwins)
    .where(eq(schema.confluenceTwins.sessionId, sessionId)).limit(1);
  return rows[0] ?? null;
}

// Experience, exponential (re-curved 2026-10-13, Nigel; pool raised and
// curve steepened 2026-10-24, Nigel, from his first play of the cadence
// engine: "make them gain experience much slower… increase the experience
// pool and curve" — the living battle pays XP constantly, and under the
// old measure his Awoken maxed out in minutes). The base constant rises
// 20 → 60 and the ratio steepens 1.5 → 1.75. A fresh Awoken needs three
// 10✦ feeds (60 XP) to reach level 1 by the peaceful road; battles
// remain the faster road. Levels are DERIVED from stored XP, never
// stored: no one's XP is touched and no stat points already granted
// are clawed back — an existing veteran simply reads at the level the
// standing curve gives their total, and grows on from there.
//
// THE CAP AND THE SOFTENED CLIMB (Nigel, 2026-10-24, the same play,
// hours later): "lets increase awoken lvl cap to 20" — and "soften the
// climb to make 20 more of a 3 month long goal of active play." The
// diagnosis, stated plainly: this derivation had NO hard cap before —
// the while loop in levelForXp ran as far as XP could carry it, and
// "10" was only where the practical world ended (the deeds' thresholds
// and this comment's landmarks). AWOKEN_LEVEL_CAP is the cap now,
// enforced in levelForXp — the one derivation every card level, XP
// grant, milestone deed and payload flows through. The climb softens
// to suit the longer road: the base holds at 60 and the ratio eases
// 1.75 → 1.381, chosen so the twentieth level lands at ≈100,000 XP —
// a favoured Awoken in daily active play earns on the order of a
// thousand XP a day, so the cap is a season's goal, not a wall. The
// softening is felt mid-curve, and that is the ruling working, not an
// error: L10 falls from the morning's 21,471 to 3,816. Landmarks
// under the standing curve: L1=60, L2=143, L3=257, L5=634, L10=3,816,
// L15=19,801, L20=100,096.
// Total XP for level L = 60 * (1.381^L - 1) / (1.381 - 1), rounded.
/** The Awoken level cap (Nigel, 2026-10-24): twenty, for AWOKEN only —
 *  the Tender's own level is a different system, uncapped here. */
export const AWOKEN_LEVEL_CAP = 20;
function xpForLevel(level: number): number {
  if (level <= 0) return 0;
  // Geometric series: 60 * (1.381^level - 1) / (1.381 - 1)
  return Math.round(60 * (Math.pow(1.381, level) - 1) / 0.381);
}
function levelForXp(xp: number): number {
  let level = 0;
  xp = Math.max(0, xp);
  while (level < AWOKEN_LEVEL_CAP && xpForLevel(level + 1) <= xp) level++;
  return level;
}
function xpProgress(xp: number): { level: number; current: number; next: number; progress: number } {
  const level = levelForXp(xp);
  const current = xpForLevel(level);
  // At the cap there is no next level: next reads as current, so the
  // progress stands full and xp_for_next_level reckons to zero.
  const next = level >= AWOKEN_LEVEL_CAP ? current : xpForLevel(level + 1);
  return { level, current, next, progress: next > current ? Math.min(1, (xp - current) / (next - current)) : 1 };
}

async function grantXp(awakenedId: number, amount: number): Promise<{ leveledUp: boolean; newLevel: number; statPointsGained: number }> {
  const rows = await db.select().from(schema.awakened).where(eq(schema.awakened.id, awakenedId)).limit(1);
  if (!rows.length) return { leveledUp: false, newLevel: 0, statPointsGained: 0 };
  const oldXp = rows[0].experience ?? 0;
  const oldLevel = levelForXp(oldXp);
  const newXp = oldXp + amount;
  const newLevel = levelForXp(newXp);
  // Stat points: 1 per 3 levels crossed (Nigel's ruling, 2026-10-14 —
  // the earlier 1-per-10 law is superseded; veterans were reconciled to
  // this cadence once by reconcileStatEvery3 below).
  const oldThrees = Math.floor(oldLevel / 3);
  const newThrees = Math.floor(newLevel / 3);
  const statPointsGained = newThrees - oldThrees;
  await db.update(schema.awakened)
    .set({
      experience: newXp,
      statPoints: (rows[0].statPoints ?? 0) + statPointsGained,
    })
    .where(eq(schema.awakened.id, awakenedId));
  // Level milestone deeds
  const ownerKey = rows[0].ownerKey ?? "";
  if (newLevel >= 10 && oldLevel < 10) await recordDeed(ownerKey, awakenedId, "level_10");
  if (newLevel >= 20 && oldLevel < 20) await recordDeed(ownerKey, awakenedId, "level_20");
  if (newLevel >= 30 && oldLevel < 30) await recordDeed(ownerKey, awakenedId, "level_30");
  return { leveledUp: newLevel > oldLevel, newLevel, statPointsGained };
}

// --- Unified XP (Nigel, 2026-10-13): "UNify for simplicity… when an
// awoken attacks or is attacked it gains 10 xp." Flat event XP, the same
// on every path — the old per-path victory formulas (resolveBattle's
// 50 + 10×wave, resolveWavePull's flat 60, the short-lived defendWave
// formula) are folded into this one model:
//   ATTACK EVENT  — an Awoken attacks: +10 to that Awoken.
//   DEFENSE EVENT — an Awoken is attacked, or stands in a defense
//                   resolution (wave defense, battle defense): +10.
//   HEX TAKEN     — a hex is taken: +50 to the Awoken whose attack broke
//                   the curse. WAVE COMPLETION pays the same +50 to ALL
//                   Awoken involved in that wave's resolution (Nigel's
//                   refinement) — every participant it touched.
// All grants flow through grantXp — level-ups, stat points, and level
// deeds ride along exactly as before.
export const XP_PER_ATTACK = 10;
export const XP_PER_DEFENSE = 10;
/** HEX-TAKEN XP — the one invented constant: Nigel ruled the event but
 *  left its size unnumbered. 50 is a fill-in; retune here. */
export const XP_PER_HEX_TAKEN = 50;

export type XpGainReport = { awakenedId: number; xpGain: number; leveledUp: boolean; newLevel: number };

/** Grant event XP and accumulate a per-Awoken report for the response. */
async function grantEventXp(
  into: Map<number, XpGainReport>,
  awakenedId: number,
  amount: number
): Promise<void> {
  const r = await grantXp(awakenedId, amount);
  const entry = into.get(awakenedId) ?? { awakenedId, xpGain: 0, leveledUp: false, newLevel: r.newLevel };
  entry.xpGain += amount;
  entry.leveledUp = entry.leveledUp || r.leveledUp;
  entry.newLevel = r.newLevel;
  into.set(awakenedId, entry);
}

// ── XP DIVISION (Nigel, 2026-10-24 21:35–21:40) ─────────────
// "xp gets split between all involved on friend join" —
// corrected within minutes: "the exp is divided though not
// both parties receiving the same — also when awoken gain
// from battle they also split exp divided"; the Keeper's
// reading, adopted by his "yes build it": DIVIDED BY
// INVOLVEMENT — the greater share to those who did more of
// the fighting in that act. Every battle XP award the
// homeland engine pays is now a POT of its standing total,
// divided among the Awoken involved in the act, weighted by
// the DAMAGE each dealt in that act's fight (the living
// battle keeps the ledger per dark thing, in hurtDark — the
// one door every attributed blow passes through; the
// settlement window that fells it is the fight the ledger
// spans). The slayer or the stood defender is simply a
// shareholder, never the sole payee, while any other hand
// also fought. Shares are whole XP and sum EXACTLY to the
// pot: each share is floored, and the leftover points
// (always fewer than the shareholders) go to the LARGEST
// shareholder — greatest damage, ties to the greater floored
// share, then the lower awakened id, so the table never
// wobbles between reads. A shareholder whose floored share
// is nothing is paid nothing. A lone involved Awoken takes
// the pot whole, exactly as battle XP was paid before
// division — solo acts see no change but the bookkeeping.
/** Divide a pot of `pot` XP among shareholders weighted by
 *  involvement (damage dealt). Returns awakenedId → share. */
export function divideXpPot(pot: number, weights: Map<number, number>): Map<number, number> {
  const shares = new Map<number, number>();
  const involved = [...weights.entries()].filter(([, w]) => w > 0);
  if (pot <= 0 || !involved.length) return shares;
  const total = involved.reduce((s, [, w]) => s + w, 0);
  let paid = 0;
  for (const [id, w] of involved) {
    const sh = Math.floor((pot * w) / total);
    shares.set(id, sh);
    paid += sh;
  }
  const leftover = pot - paid;
  if (leftover > 0) {
    const largest = [...involved].sort((a, b) =>
      (b[1] - a[1]) || ((shares.get(b[0]) ?? 0) - (shares.get(a[0]) ?? 0)) || (a[0] - b[0]))[0];
    shares.set(largest[0], (shares.get(largest[0]) ?? 0) + leftover);
  }
  return shares;
}

/** A Tender's share of the same act, through the same
 *  divider: the sum of their own Awoken's shares of the pot.
 *  When friend-join / hosted land brings two Tenders into one
 *  battle, their portions divide by this one law and no
 *  second mechanism — and on the one-Tender homeland the
 *  single Tender's portion is the whole pot their side
 *  earned, the division biting among their Awoken. */
export function divideXpPotByOwner(
  pot: number,
  weights: Map<number, number>,
  ownerOf: (awakenedId: number) => string | null
): Map<string, number> {
  const byOwner = new Map<string, number>();
  for (const [id, share] of divideXpPot(pot, weights)) {
    const owner = ownerOf(id);
    if (owner == null) continue;
    byOwner.set(owner, (byOwner.get(owner) ?? 0) + share);
  }
  return byOwner;
}

/** Pay a divided pot into the standing grant, shareholders
 *  with a positive share only. Returns true when anyone was
 *  paid — the caller falls back to its sole involved party
 *  when no hand was involved at all. */
export async function grantDividedXpPot(pot: number, weights: Map<number, number>): Promise<boolean> {
  const shares = divideXpPot(pot, weights);
  let paid = false;
  const scratch = new Map<number, XpGainReport>();
  for (const [id, xp] of shares) {
    if (xp <= 0) continue;
    await grantEventXp(scratch, id, xp);
    paid = true;
  }
  return paid;
}

// --- 2026-10-13 XP re-curve reconciliation (one-time) ---------------------
// When xpForLevel's base dropped 100 → 20, every stored XP total suddenly
// meant a HIGHER level (levels are derived from XP, never stored). Nobody
// may lose what the gentler curve says they already crossed, so this pass
// grants the difference exactly once: stat points for tens boundaries the
// new curve crosses that the old one didn't (floor(newLv/10) −
// floor(oldLv/10)), and level_10/20/30 milestone deeds for newly reached
// thresholds. Idempotence is layered: a settings flag short-circuits the
// pass once it completes, and each Awoken's marker row (raw DDL, like
// tender_births) is claimed in the same transaction as its stat grant, so
// even a crash mid-pass can be re-run without double-granting anyone.
const XP_RECURVE_FLAG = "xp_recurve_2026_10_13_done";
// The pre-recurve curve, frozen here so old levels can be recomputed.
function oldXpForLevel(level: number): number {
  if (level <= 0) return 0;
  return Math.floor(100 * (Math.pow(1.5, level) - 1) / 0.5);
}
function oldLevelForXp(xp: number): number {
  let level = 0;
  xp = Math.max(0, xp);
  while (oldXpForLevel(level + 1) <= xp) level++;
  return level;
}

export async function reconcileXpRecurve(): Promise<void> {
  const flag = await db.select({ key: schema.settings.key }).from(schema.settings)
    .where(eq(schema.settings.key, XP_RECURVE_FLAG)).limit(1);
  if (flag.length) return;
  sqlite.exec(`CREATE TABLE IF NOT EXISTS xp_recurve_2026_10_13_grants (
    awakened_id INTEGER PRIMARY KEY NOT NULL,
    stat_points_granted INTEGER NOT NULL DEFAULT 0,
    processed_at INTEGER NOT NULL
  )`);
  const claimStmt = sqlite.prepare(
    `INSERT OR IGNORE INTO xp_recurve_2026_10_13_grants (awakened_id, stat_points_granted, processed_at) VALUES (?, ?, ?)`
  );
  const grantStmt = sqlite.prepare(`UPDATE awakened SET stat_points = ? WHERE id = ?`);
  // Marker claim + stat grant land in ONE transaction: a crash can neither
  // lose a grant (marker without points) nor double one (points re-granted
  // on re-run), because the marker insert is what reports "already done".
  const claimAndGrant = sqlite.transaction((id: number, statGain: number, newStatPoints: number): boolean => {
    const claim = claimStmt.run(id, statGain, Date.now());
    if (!claim.changes) return false;
    if (statGain > 0) grantStmt.run(newStatPoints, id);
    return true;
  });
  const rows = await db.select({
    id: schema.awakened.id, experience: schema.awakened.experience,
    statPoints: schema.awakened.statPoints, ownerKey: schema.awakened.ownerKey,
  }).from(schema.awakened);
  let reconciled = 0;
  for (const row of rows) {
    const xp = row.experience ?? 0;
    const oldLevel = oldLevelForXp(xp);
    const newLevel = levelForXp(xp);
    const statGain = Math.max(0, Math.floor(newLevel / 10) - Math.floor(oldLevel / 10));
    const claimed = claimAndGrant(row.id, statGain, (row.statPoints ?? 0) + statGain);
    if (!claimed) continue; // reconciled in an earlier partial run
    // Milestone deeds the new level reaches that the old one didn't;
    // checked against existing rows so recordDeed never double-counts.
    for (const threshold of [10, 20, 30]) {
      if (newLevel >= threshold && oldLevel < threshold) {
        const deed = `level_${threshold}`;
        const existing = await db.select({ id: schema.awokenLegends.id }).from(schema.awokenLegends)
          .where(and(
            eq(schema.awokenLegends.awakenedId, row.id),
            eq(schema.awokenLegends.deed, deed as any)
          )).limit(1);
        if (!existing.length) await recordDeed(row.ownerKey ?? "", row.id, deed);
      }
    }
    if (newLevel > oldLevel) reconciled++;
  }
  const stamp = new Date().toISOString();
  await db.insert(schema.settings).values({ key: XP_RECURVE_FLAG, value: stamp })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: stamp } });
  if (reconciled) console.log(`[xp] re-curve reconciliation: ${reconciled} Awoken stand higher under the gentler curve.`);
}

// --- Stat-point cadence reconciliation (one-time, 2026-10-14) -------------
// Nigel's ruling: an Awoken gains a stat point every 3 levels. The old law
// granted on 10-level boundaries, and both grantXp and the 2026-10-13
// re-curve kept every Awoken's LIFETIME grants at exactly floor(level/10).
// So the honest top-up is derivable from the level alone:
// floor(level/3) − floor(level/10), never negative, granted exactly once —
// marker claim and grant in one transaction, the re-curve's own pattern,
// so a crash mid-pass can be re-run without double-granting anyone.
const STAT_EVERY_3_FLAG = "stat_every_3_2026_10_14_done";

export async function reconcileStatEvery3(): Promise<void> {
  const flag = await db.select({ key: schema.settings.key }).from(schema.settings)
    .where(eq(schema.settings.key, STAT_EVERY_3_FLAG)).limit(1);
  if (flag.length) return;
  sqlite.exec(`CREATE TABLE IF NOT EXISTS stat_every_3_2026_10_14_grants (
    awakened_id INTEGER PRIMARY KEY NOT NULL,
    stat_points_granted INTEGER NOT NULL DEFAULT 0,
    processed_at INTEGER NOT NULL
  )`);
  const claimStmt = sqlite.prepare(
    `INSERT OR IGNORE INTO stat_every_3_2026_10_14_grants (awakened_id, stat_points_granted, processed_at) VALUES (?, ?, ?)`
  );
  const grantStmt = sqlite.prepare(`UPDATE awakened SET stat_points = ? WHERE id = ?`);
  const claimAndGrant = sqlite.transaction((id: number, statGain: number, newStatPoints: number): boolean => {
    const claim = claimStmt.run(id, statGain, Date.now());
    if (!claim.changes) return false;
    if (statGain > 0) grantStmt.run(newStatPoints, id);
    return true;
  });
  const rows = await db.select({
    id: schema.awakened.id, experience: schema.awakened.experience,
    statPoints: schema.awakened.statPoints,
  }).from(schema.awakened);
  let topped = 0;
  for (const row of rows) {
    const level = levelForXp(row.experience ?? 0);
    const statGain = Math.max(0, Math.floor(level / 3) - Math.floor(level / 10));
    const claimed = claimAndGrant(row.id, statGain, (row.statPoints ?? 0) + statGain);
    if (claimed && statGain > 0) topped++;
  }
  const stamp = new Date().toISOString();
  await db.insert(schema.settings).values({ key: STAT_EVERY_3_FLAG, value: stamp })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: stamp } });
  if (topped) console.log(`[xp] stat-cadence reconciliation: ${topped} Awoken received the every-3-levels top-up.`);
}

async function gainEnergy(ownerKey: string, amount: number, maxEnergy: number): Promise<void> {
  const current = await getEnergyFor(ownerKey);
  const next = Math.min(current + amount, maxEnergy);
  await db.update(schema.tenderResources)
    .set({ energy: next, updatedAt: new Date() })
    .where(eq(schema.tenderResources.ownerKey, ownerKey));
}

// --- Placement HP: health is toughness alone (design law) ------------------
// One damage path for every field placement. Damage lands, HP falls, and at
// 0 HP the Awoken DISSIPATES BACK TO HAND (Nigel, 2026-10-13): the placement
// is removed (stance goes with it) and the Awoken simply stands in hand
// again — no re-coalescence timer on this path. Re-entering the field costs
// the normal power-scaled deploy energy (deployCostForPower). The other
// dispersal paths — tile-fall defeat (4h) and voluntary dissipation (8h) —
// keep their own rules; they do not pass through here.

/** Deploy / re-entry cost by power: 1-3 → 2, 4-6 → 3, 7-9 → 4, 10+ → 5.
 *  The single form of the power-scaled deploy price — its live
 *  spender is the first seed's deploy door (deployFirstSeed). */
export function deployCostForPower(power: number): number {
  return 2 + Math.floor((Math.max(1, power) - 1) / 3);
}

/** A placement's max HP: the Awoken's toughness alone (payload stats, the
 *  numbers the card displays). Floored at 1 so a 0-toughness form is
 *  fragile, not dead on arrival. */
async function placementMaxHp(awakenedId: number): Promise<number> {
  const payload = await awakenedPayloadById(awakenedId);
  return Math.max(1, payload?.toughness ?? 1);
}

type PlacementRow = typeof schema.fieldPlacements.$inferSelect;

/** Apply damage to a field placement through the single path. At hp <= 0
 *  the placement is deleted and the Awoken returns to hand (dissipated). */
async function damagePlacement(
  placement: PlacementRow,
  damage: number
): Promise<{ hp: number; maxHp: number; dissipated: boolean }> {
  const maxHp = await placementMaxHp(placement.awakenedId);
  const currentHp = placement.hp ?? maxHp;
  const newHp = currentHp - damage;
  if (newHp <= 0) {
    await db.delete(schema.fieldPlacements)
      .where(eq(schema.fieldPlacements.id, placement.id));
    return { hp: 0, maxHp, dissipated: true };
  }
  await db.update(schema.fieldPlacements)
    .set({ hp: newHp })
    .where(eq(schema.fieldPlacements.id, placement.id));
  return { hp: newHp, maxHp, dissipated: false };
}

/** THE SHIELD ROLL (the shield law, Nigel 2026-10-22): an
 *  Awokin's shield pool is the SUM of its parts, each part
 *  rolling its own element's die (Sky d4 · Root d6 · Tide d8 ·
 *  Stone d12 · Fire d10 — HOMELAND_FATE_DIE carries the same
 *  table), rolled as the figure takes the field. The Table's
 *  older toughness × one-die reading is NOT this law; the
 *  homeland keeps the per-part sum. */
async function rollShieldFor(awakenedId: number, ownerKey?: string): Promise<number> {
  const payload = await awakenedPayloadById(awakenedId);
  const layers = (payload?.layers ?? []) as { element?: string | null }[];
  let pool = 0;
  for (const l of layers) pool += homelandDN(HOMELAND_FATE_DIE[l.element ?? "neutral"] ?? 6);
  // THE ZODIAC'S SHIELD DICE (Recovery #1): each shieldDice
  // point the Tender holds rolls ONE MORE DIE into the
  // pool — the parts' dice again, in their own order,
  // cycling as many times as the sum runs (the reading is
  // flagged in the build report: the star names dice, not
  // parts, and the parts' dice are the only dice a shield
  // is made of).
  const extra = ownerKey ? fxSum(ownerKey, "shieldDice") : 0;
  if (extra > 0 && layers.length > 0) {
    for (let i = 0; i < extra; i++) {
      const l = layers[i % layers.length];
      pool += homelandDN(HOMELAND_FATE_DIE[l.element ?? "neutral"] ?? 6);
    }
  }
  return pool;
}

/** Wound a placement through its shield: the pool burns
 *  before the body, always (the shield law). Legacy standings
 *  whose shield was never rolled roll it here, at the first
 *  blow that finds them — the roll is the summoning's, only
 *  its bookkeeping waited. Returns what damagePlacement
 *  returns, plus the shield that remains. */
async function damagePlacementShielded(
  placement: PlacementRow,
  damage: number
): Promise<{ hp: number; maxHp: number; dissipated: boolean; shield: number }> {
  let shield = placement.shield == null ? null : Number(placement.shield);
  let shieldMax = placement.shieldMax == null ? null : Number(placement.shieldMax);
  if (shield === null || shieldMax === null) {
    shieldMax = await rollShieldFor(placement.awakenedId, placement.ownerKey);
    shield = shieldMax;
    await db.update(schema.fieldPlacements)
      .set({ shield, shieldMax })
      .where(eq(schema.fieldPlacements.id, placement.id));
    placement.shield = shield; placement.shieldMax = shieldMax;
  }
  let rest = Math.max(0, damage);
  if (rest > 0 && shield > 0) {
    const absorbed = Math.min(shield, rest);
    shield -= absorbed; rest -= absorbed;
    await db.update(schema.fieldPlacements)
      .set({ shield })
      .where(eq(schema.fieldPlacements.id, placement.id));
    placement.shield = shield;
  }
  if (rest <= 0) {
    const maxHp = await placementMaxHp(placement.awakenedId);
    return { hp: placement.hp ?? maxHp, maxHp, dissipated: false, shield };
  }
  const res = await damagePlacement(placement, rest);
  if (res.dissipated) return { ...res, shield: 0 };
  return { ...res, shield };
}

/** MISCAS​T MERCY — THE STAR'S (the zodiac clause wi_a2;
 *  Recovery #1): "25% of the energy spent on a miscast
 *  returns." The homeland door of the Table's mercyRefund:
 *  the holder's mercy sum — a percent — of what a fizzled
 *  cast SPENT (the price actually charged), floored,
 *  returned to the Tender's pool. The Witch's own miscast
 *  gift is a separate law (Recovery #8), not added here.
 *  Returns the amount refunded (0 for no star), so the
 *  cast's answer can name it. */
async function mercyRefundHomeland(ownerKey: string, spent: number): Promise<number> {
  if (spent <= 0) return 0;
  const pct = fxSum(ownerKey, "mercy");
  if (pct <= 0) return 0;
  const back = Math.floor((spent * pct) / 100);
  if (back <= 0) return 0;
  await gainEnergy(ownerKey, back, await calculateMaxEnergy(ownerKey));
  return back;
}

// Standalone game config loader (used by both handlers and internal functions)
async function loadGameConfig() {
  const rows = await db.select().from(schema.uiConfig);
  const overrides: Record<string, any> = {};
  for (const r of rows) {
    try { overrides[r.key] = JSON.parse(r.value); } catch {}
  }
  const buildings: Record<string, any> = {};
  for (const [type, def] of Object.entries(BUILDING_DEFS)) {
    buildings[type] = {
      ...def,
      cost: overrides[`building.${type}.cost`] ?? def.cost,
      buildMinutes: overrides[`building.${type}.buildMinutes`] ?? def.buildMinutes,
      enabled: overrides[`building.${type}.enabled`] ?? true,
    };
    if (type === "watchtower") {
      buildings[type].damage = overrides["building.watchtower.damage"] ?? 3;
      buildings[type].powerBonus = overrides["building.watchtower.powerBonus"] ?? 2;
      buildings[type].upkeepPerHour = overrides["building.watchtower.upkeepPerHour"] ?? 2;
    }
    if (type === "thorn-wall") {
      buildings[type].damage = overrides["building.thorn-wall.damage"] ?? 1;
    }
    if (type === "attunement-shrine") {
      buildings[type].upkeepPerHour = overrides["building.attunement-shrine.upkeepPerHour"] ?? buildings[type].upkeepPerHour ?? 3;
    }
    if (type === "dream-wheat") {
      buildings[type].harvestEnergy = overrides["building.dream-wheat.harvestEnergy"] ?? 4;
    }
    if (type === "dream-weed") {
      buildings[type].harvestEnergy = overrides["building.dream-weed.harvestEnergy"] ?? 5;
      buildings[type].growHours = overrides["building.dream-weed.growHours"] ?? 1;
    }
    if (type === "sky-bloom") {
      buildings[type].harvestEnergy = overrides["building.sky-bloom.harvestEnergy"] ?? 10;
      buildings[type].growHours = overrides["building.sky-bloom.growHours"] ?? 8;
    }
    if (type === "awakening-well" || type === "tree") {
      buildings[type].energyBonus = overrides[`building.${type}.energyBonus`] ?? (type === "tree" ? 1 : 3);
    }
  }
  const enemies: Record<string, any> = {};
  for (const name of ["fray", "unraveler", "hollow", "tangle"]) {
    enemies[name] = {
      power: overrides[`enemy.${name}.power`] ?? { fray: 1, unraveler: 4, hollow: 0, tangle: 3 }[name],
      hp: overrides[`enemy.${name}.hp`] ?? { fray: 3, unraveler: 6, hollow: 5, tangle: 8 }[name],
      // The AC BONUS on the workshop record (Enemy AC,
      // Nigel 2026-10-22): served beside Power/HP; the full
      // AC (base 10 + this) is what the referees read live
      // through enemyACFor.
      armor: overrides[`enemy.${name}.armor`] ?? ENEMY_ARMOR_DEFAULTS[name],
    };
  }
  const timers = {
    energyRegenMinutes: overrides["timer.energyRegenMinutes"] ?? 4,
    buildHelperDivisor: overrides["timer.buildHelperDivisor"] ?? 2,
    wheatWellSynergy: overrides["timer.wheatWellSynergy"] ?? 0.75,
  };
  return { buildings, enemies, timers };
}

// Single source of truth for building definitions
export const BUILDING_DEFS: Record<string, { name: string; cost: number; buildMinutes: number; desc: string; icon: string; harvestEnergy?: number; growHours?: number; energyBonus?: number; upkeepPerHour?: number }> = {
  "watchtower": { name: "Watchtower", cost: 2, buildMinutes: 15, desc: "+2 power to defenders on tile and adjacent. 3 damage volley at battle start. 2✦/hour upkeep.", icon: "🗼" },
  "dream-wheat": { name: "Dream Shroom", cost: 2, buildMinutes: 10, desc: "Grows in 4h in the hex's six wedges — up to six to a hex, each on its own clock. Harvest for +4 energy. Regrows automatically.", icon: "🍄" },
  "attunement-shrine": { name: "Attunement Shrine", cost: 4, buildMinutes: 20, upkeepPerHour: 3, desc: "Doubles aspect attunement from adjacent Binding Awokin. Costs 3 energy/hour upkeep — unpaid, it falls dormant and the doubling stops. TAP the standing shrine on the map to turn it to the LAND: the doubling sleeps, and the shrine pours its congregation's dominant element into its own hex and the six around it — one hex about every five hours, its own first.", icon: "🛕" },
  "dream-weed": { name: "Dream Weed", cost: 5, buildMinutes: 25, desc: "Energy seaweed. Harvest for +5 energy every 1h. Only in water. Regrows forever.", icon: "🌊", harvestEnergy: 5, growHours: 1 },
  "sky-bloom": { name: "Sky Bloom", cost: 15, buildMinutes: 25, desc: "Floating sky bloom. Harvest for +10 energy every 8h. Only on sky. Regrows forever.", icon: "☁️", harvestEnergy: 10, growHours: 8 },
  "awakening-well": { name: "Awakening Well", cost: 2, buildMinutes: 20, desc: "+3 max energy. Dream Shroom adjacent grows 25% faster.", icon: "💧" },
  "thorn-wall": { name: "Thorn Wall", cost: 2, buildMinutes: 5, desc: "1 damage to every attacker. Permanent.", icon: "🌵" },
  "binding-circle": { name: "Binding Circle", cost: 2, buildMinutes: 10, desc: "+50% binding heal. Binding costs 1.", icon: "🔮" },
  "tree": { name: "Dream Tree", cost: 2, buildMinutes: 15, desc: "+1 max energy. Grows on stone/root/neutral/fire hexes.", icon: "🌳" },
  "bastion": { name: "Bastion", cost: 6, buildMinutes: 20, desc: "A fortress of the light and a beacon for friends: columns besiege bastions first, and allies muster here when the call goes out. Raise one upon a fallen seed's purified hex to HOLD the seed.", icon: "🏯" },
  "hall-of-champions": { name: "Hall of Champions", cost: 10, buildMinutes: 30, desc: "A castle haunted by the spirits of ancient Awokin. House champions in its dwellings to feed and level them. Upgrade to level 10 — each level opens a new room. One per tender; stands alone on its tile.", icon: "🏰" },
};

// Hall of Champions tier costs — exponential in energy, elemental points
// (spent from the attunement meters, all four equally) and build time.
// Target tier T (2..10): energy 20·2^(T-1), elemental 2^T each, 30·2^(T-1) min.
export function hallTierCost(targetTier: number) {
  return {
    energy: 20 * Math.pow(2, targetTier - 1),
    elementalEach: Math.pow(2, targetTier),
    buildMinutes: 30 * Math.pow(2, targetTier - 1),
  };
}

// Hall of Champions helpers (module-level: NOT action endpoints).
async function hallBuildingFor(ownerKey: string) {
  const rows = await db.select().from(schema.territoryBuildings)
    .where(and(
      eq(schema.territoryBuildings.ownerKey, ownerKey),
      eq(schema.territoryBuildings.buildingType, "hall-of-champions")
    )).limit(1);
  return rows[0] ?? null;
}

async function settleHallFor(ownerKey: string) {
  const hall = await hallBuildingFor(ownerKey);
  if (hall && hall.upgradeReadyAt && new Date(hall.upgradeReadyAt).getTime() <= Date.now() && hall.status === "active") {
    const newLevel = Math.min(10, (hall.level ?? 1) + 1);
    await db.update(schema.territoryBuildings)
      .set({ level: newLevel, upgradeReadyAt: null })
      .where(eq(schema.territoryBuildings.id, hall.id));
    hall.level = newLevel;
    hall.upgradeReadyAt = null;
  }
  return hall;
}

// --- UI theme: the ONE canonical element palette ("the new scheme") -------
// Stored as a single ui_config row ("uiTheme", JSON) — the same key-value
// store the UI Workspace already persists to. The client mirrors these
// defaults in client/src/palette.ts (ELEMENT_SCHEME); keep the two in step.
//   root  living green    tide  deep teal-blue    sky   pale violet-blue
//   stone warm amber-earth    fire  ember orange
export const ELEMENT_COLOR_KEYS = ["root", "tide", "sky", "stone", "fire"] as const;
export type ElementColorKey = (typeof ELEMENT_COLOR_KEYS)[number];
export const DEFAULT_ELEMENT_COLORS: Record<ElementColorKey, string> = {
  root: "#6a8a4e",
  tide: "#4e8a9b",
  sky: "#8d9fd6",
  stone: "#9c7c4c",
  fire: "#b8542e",
};
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export interface UITheme {
  elementColors: Record<ElementColorKey, string>;
}

/** The stored theme with the scheme defaults merged under any saved values.
 *  Stored values that are not valid #rrggbb hex are ignored, never served. */
async function loadUITheme(): Promise<UITheme> {
  const [row] = await db.select().from(schema.uiConfig)
    .where(eq(schema.uiConfig.key, "uiTheme"));
  let stored: { elementColors?: Record<string, unknown> } = {};
  try { stored = row ? JSON.parse(row.value) : {}; } catch { stored = {}; }
  const elementColors: Record<ElementColorKey, string> = { ...DEFAULT_ELEMENT_COLORS };
  if (stored.elementColors && typeof stored.elementColors === "object") {
    for (const key of ELEMENT_COLOR_KEYS) {
      const v = stored.elementColors[key];
      if (typeof v === "string" && HEX_COLOR.test(v)) elementColors[key] = v.toLowerCase();
    }
  }
  return { elementColors };
}

// ── THE MONSTERS COMPENDIUM ─────────────────────────────────────────
// The game's living copy of the roll kept in the Unseated's Atelier
// (the Monsters Compendium app + MONSTERS-COMPENDIUM.md). This seed
// is the founding copy of the app's entries as they stood at the
// founding (2026-10-16); since the connection was ruled the same day,
// the Keeper's syncs (importCompendium) keep compendium_entries the
// app's mirror — the app is the roll of record. Class blurbs/order
// below are the founding roll's own, used until the first sync's
// class list lands; a class invented in the editor simply sorts
// after the known ones until it is given a place here.
const COMPENDIUM_CLASS_META: Record<string, { blurb: string; order: number }> = {
  "The Canon Dark": { blurb: "In the game, with art, stats, and law.", order: 10 },
  "The Stitchers": { blurb: "The Seamother is not alone. A whole kindred works the world's seams.", order: 20 },
  "The Procession": { blurb: "The congregation that never arrived.", order: 30 },
  "The Unthreading": { blurb: "Where a thread has reached, she can simply be.", order: 40 },
  "The Mouthed": { blurb: "All mouth.", order: 50 },
  "The Counted": { blurb: "Not hunting you — counting you.", order: 60 },
  "The Thorned": { blurb: "Named for the Table; art owed.", order: 70 },
  "The Hollowed": { blurb: "Named for the Table; art owed.", order: 80 },
  "The Gloaming": { blurb: "Named for the Table; art owed.", order: 90 },
  "The Listeners": { blurb: "Every spell cast is a dinner bell.", order: 100 },
  "The Kneeling": { blurb: "He has never been seen standing.", order: 110 },
};

type CompendiumSeed = {
  className: string; name: string; status: "Canon" | "Named" | "Confirmed" | "Dreamed";
  power: number | null; hp: number | null; story: string;
  typeNote: string | null; layers: string | null; motion: string | null;
  slotKey: string | null; sortOrder: number;
};

const COMPENDIUM_SEED: CompendiumSeed[] = [
  { className: "The Canon Dark", name: "Fray", status: "Canon", power: 1, hp: 3, story: "Small ink splatter with twig legs; attacks in groups, the dark's least and most numerous grief.", typeNote: null, layers: null, motion: null, slotKey: null, sortOrder: 1 },
  { className: "The Canon Dark", name: "Unraveler", status: "Canon", power: 4, hp: 6, story: "Looming ink mass with tendrils; hunts the strongest Awokin standing.", typeNote: null, layers: null, motion: null, slotKey: null, sortOrder: 2 },
  { className: "The Canon Dark", name: "Hollow", status: "Canon", power: 0, hp: 5, story: "Pure void, no gold — it eats light. Drains the Tender's energy instead of dealing damage.", typeNote: null, layers: null, motion: null, slotKey: null, sortOrder: 3 },
  { className: "The Canon Dark", name: "Tangle", status: "Canon", power: 3, hp: 8, story: "Knotted thorns with gold sap; pins one played Awokin for the wave.", typeNote: null, layers: null, motion: null, slotKey: null, sortOrder: 4 },
  { className: "The Stitchers", name: "The Seamother", status: "Confirmed", power: null, hp: null, story: "A mother of mending gone wrong.", typeNote: null, layers: "Knotted shadow-cloth torso; spool head wound with black thread; stitch-X eyeless eyes; four needle-legs jointed three times too many; trailing thread-tendrils; one gold seam.", motion: "She stitches herself forward — a leg plants ahead, her body sews along the thread, turning only at knots, the ground unstitching behind her.", slotKey: "enemy_seamother", sortOrder: 1 },
  { className: "The Stitchers", name: "The Stitchlings", status: "Dreamed", power: null, hp: null, story: "The Seamother's smallest issue: hand-sized knots of black thread, each with one long needle for a spine, scuttling on thread legs.", typeNote: null, layers: "Knot-body; needle-spine; thread legs; one gold thread the swarm shares like a lifeline.", motion: "They travel as one frayed knot — where one goes, the seam pulls the rest; they enter a field through its edges and work inward, unstitching as they come.", slotKey: "enemy_stitchlings", sortOrder: 2 },
  { className: "The Stitchers", name: "The Buttonhole", status: "Dreamed", power: null, hp: null, story: "A squat fold of black cloth pierced by buttonhole slits rimmed with pale stitching — mouths sewn open. Three thread-stalks end in dull gold spiral buttons that are NOT eyes, whatever they behave like.", typeNote: null, layers: "Cloth body; slit-mouths; button stalks; needle fingers; a lower half frayed to loose threads.", motion: "It slips through seams — gaps in walls, tent-flaps, the space between a door and its frame — and is simply on the other side, mid-conversation with itself.", slotKey: "enemy_buttonhole", sortOrder: 3 },
  { className: "The Stitchers", name: "The Patchwork Saint", status: "Dreamed", power: null, hp: null, story: "Tall, robed, assembled: mismatched patches of cloth, fur, and pale leather joined by heavy gold crosshatch stitching — each patch cut from something different. A halo of bent needles; a featureless pale face; arms of uneven length ending in thread-knot fingers.", typeNote: null, layers: null, motion: "It lurches — the patches do not always agree on a direction — then arrives all at once, like a quilt remembering it is one thing.", slotKey: "enemy_patchwork_saint", sortOrder: 4 },
  { className: "The Stitchers", name: "The Skin-Tailor", status: "Dreamed", power: null, hp: null, story: "Gaunt, in a tailor's coat of layered rags, carrying enormous shears and a measuring tape of knotted cord that moves like a living thing. He measures the heroes — politely, thoroughly — for a garment they will be worn in.", typeNote: "Sprite owed — the dreaming engine declined him.", layers: null, motion: "Hems you in: never faster than a walk, but every path he takes shortens, as if the field were being taken in at the seams.", slotKey: null, sortOrder: 5 },
  { className: "The Stitchers", name: "The Hem", status: "Dreamed", power: null, hp: null, story: "The kindred's lowest thing: all hemline and pins, a creeping edge with pin-claws.", typeNote: null, layers: null, motion: "It travels by rolling itself along the borders of things — the rim of the field, the edge of the road, the hem of the Bastion's ground. Heroes who stand at edges meet it first.", slotKey: null, sortOrder: 6 },
  { className: "The Procession", name: "The Long Parish", status: "Confirmed", power: null, hp: null, story: "A congregation that never arrived.", typeNote: null, layers: "Five kneeling shadow segments under one robe; five hooded heads on jointed necks, faces smooth and eyeless, mouths stitched in gold; a cracked bell that has never rung; many small hands beneath, praying and walking at once.", motion: "Peristaltic procession — kneel, rise, kneel, rise; never hurrying, never stopping; the ground it crosses stays knelt-on.", slotKey: "enemy_long_parish", sortOrder: 1 },
  { className: "The Unthreading", name: "Mother of Ends", status: "Dreamed", power: null, hp: null, story: "Elite of the first dreaming — the First Unthreading.", typeNote: "The First Unthreading · elite", layers: "One great loosened knot of shadow; a spine of pale eyeless button-eyes facing different yesterdays; limbs ending in clawed tongues; a halo of fraying thread; one gold thread at her heart that does not loosen.", motion: "She does not travel — her threads spread hex by hex, and where a thread has reached, she can simply be.", slotKey: "enemy_mother_of_ends", sortOrder: 1 },
  { className: "The Mouthed", name: "The Grinstitch", status: "Dreamed", power: null, hp: null, story: "All mouth: black-bone jaw-plates, front teeth grown into digging claws, a seeing tongue whose underside is patterned with eyeless eyes.", typeNote: "Render declined twice by the dreaming engine; lives as words for now.", layers: null, motion: "Bites the ground and hauls itself jaw over jaw; the tongue tastes the air before every lunge — the telegraph.", slotKey: null, sortOrder: 1 },
  { className: "The Counted", name: "The Tallyman", status: "Dreamed", power: null, hp: null, story: "Not hunting you — counting you.", typeNote: "Render declined twice by the dreaming engine; lives as words for now.", layers: "Abacus-ribcage of teeth and counting-claws; over-jointed enumerating fingers; a knotted head with one gold tally-bead for an eye; a tail of tally-cord, each knot a finished count of something gone.", motion: "Ticks — long stillness, then suddenly nearer, in the blink between counts.", slotKey: null, sortOrder: 1 },
  { className: "The Thorned", name: "Thornrunner", status: "Named", power: null, hp: null, story: "Fast, thorn-limbed; the Storytender may deal it at the Table.", typeNote: null, layers: null, motion: null, slotKey: "enemy_thornrunner", sortOrder: 1 },
  { className: "The Hollowed", name: "The Hollow Choir", status: "Named", power: null, hp: null, story: "Many mouths, one song.", typeNote: null, layers: null, motion: null, slotKey: "enemy_hollow_choir", sortOrder: 1 },
  { className: "The Gloaming", name: "Gloaming Stag", status: "Named", power: null, hp: null, story: "Antlers in dusk-light.", typeNote: null, layers: null, motion: null, slotKey: "enemy_gloaming_stag", sortOrder: 1 },
  { className: "The Listeners", name: "The Hushword", status: "Dreamed", power: null, hp: null, story: "The Unraveling's listener.", typeNote: null, layers: "A smooth listening-dish of a head, all ear and no face; a body of layered hush-cloth that swallows sound the way the Hollow swallows light; long fingers made for cupping ears it does not have.", motion: "It drifts toward the loudest thing on the field — every spell cast is a dinner bell. Where it stands, the Tale itself writes quieter; dice rolled near it are rolled again, worse for the remembering.", slotKey: null, sortOrder: 1 },
  { className: "The Kneeling", name: "The Kneeling King", status: "Dreamed", power: null, hp: null, story: "A giant in a crown of bent nails who has never been seen standing.", typeNote: null, layers: "A vast layered cloak-body, jointed at knee and neck only; a crown-layer of black nails; hands the size of doors, palms up, in supplication or in waiting — no one has stayed to learn which.", motion: "He does not advance. He kneels closer — each round the kneel is taken one field nearer, the ground shaking its apology. What happens when he finishes kneeling, no telling keeps.", slotKey: null, sortOrder: 1 },
];

async function ensureCompendiumSeeded() {
  const existing = await db.select({ id: schema.compendiumEntries.id }).from(schema.compendiumEntries).limit(1);
  if (existing.length > 0) return;
  await db.insert(schema.compendiumEntries).values(COMPENDIUM_SEED.map(s => ({ ...s })));
}

const compendiumEntryShape = z.object({
  className: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  status: z.enum(["Canon", "Named", "Confirmed", "Dreamed"]),
  power: z.number().int().min(0).max(999).nullable(),
  hp: z.number().int().min(0).max(9999).nullable(),
  story: z.string().max(4000),
  typeNote: z.string().max(1000).nullable(),
  layers: z.string().max(4000).nullable(),
  motion: z.string().max(4000).nullable(),
  slotKey: z.string().regex(/^[a-z0-9_]+$/).max(80).nullable(),
  sortOrder: z.number().int().min(0).max(9999),
});

/** The current enemy art, resolved under the game's one law (the
 *  enemy-swap build, 2026-10-15): a pinned upload wins, pin 0 means
 *  the bundled art, otherwise the latest upload. Shared by the
 *  game's getEnemyArt and the Table's room state, so an enemy
 *  wears the same face in both worlds. */
export async function resolveCurrentEnemyArt(): Promise<{ art: Record<string, { url: string; spriteId: number } | null>; selection: Record<string, number> }> {
  const sprites = await db.select().from(schema.uiSprites)
    .where(eq(schema.uiSprites.category, "enemy"))
    .orderBy(schema.uiSprites.createdAt, schema.uiSprites.id);
  const [selRow] = await db.select().from(schema.uiConfig)
    .where(eq(schema.uiConfig.key, "enemy.sprite.selection")).limit(1);
  let selection: Record<string, number> = {};
  if (selRow) { try { selection = JSON.parse(selRow.value) || {}; } catch {} }
  const byName = new Map<string, typeof sprites>();
  for (const sp of sprites) {
    const arr = byName.get(sp.name) ?? [];
    arr.push(sp);
    byName.set(sp.name, arr);
  }
  const art: Record<string, { url: string; spriteId: number } | null> = {};
  for (const [name, arr] of byName) {
    const pinned = selection[name];
    let live: (typeof sprites)[number] | null;
    if (pinned === 0) live = null;
    else if (typeof pinned === "number") live = arr.find(sp => sp.id === pinned) ?? arr[arr.length - 1];
    else live = arr[arr.length - 1];
    art[name] = live ? { url: blobUrl(live.blobKey), spriteId: live.id } : null;
  }
  return { art, selection };
}


// ── Card borders (Nigel, 2026-10-17): a workshop shelf of card-frame
// art; the chosen one wraps every card on every page and app. State
// lives in ui_config (uploads list, selection, the birth frame's fit);
// uploaded art lives in the blob store. The birth frame — this
// morning's wake-ceremony frame — is the built-in first citizen,
// served at /card-border/birth.png with the fit measured for it.
type CardBorderFit = "hug" | "morning";
interface CardBorderUpload { id: string; name: string; blobKey: string; fit: CardBorderFit; createdAt: number }
async function readUiConfigJson(key: string): Promise<any> {
  const [row] = await db.select().from(schema.uiConfig).where(eq(schema.uiConfig.key, key)).limit(1);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}
async function writeUiConfigJson(key: string, value: unknown): Promise<void> {
  const text = JSON.stringify(value);
  await db.insert(schema.uiConfig).values({ key, value: text })
    .onConflictDoUpdate({ target: schema.uiConfig.key, set: { value: text } });
}
async function cardBorderState() {
  const uploads: CardBorderUpload[] = (await readUiConfigJson("card.border.uploads")) ?? [];
  const selection = (await readUiConfigJson("card.border.selection")) ?? { kind: "birth" as const };
  const birthFit: CardBorderFit = (await readUiConfigJson("card.border.birthFit")) ?? "morning";
  let imageUrl: string | null = null;
  let fit: CardBorderFit | null = null;
  if (selection.kind === "birth") { imageUrl = "/card-border/birth.png"; fit = birthFit; }
  else if (selection.kind === "upload") {
    const u = uploads.find((x) => x.id === selection.id);
    if (u) { imageUrl = blobUrl(u.blobKey); fit = u.fit; }
  }
  return {
    imageUrl, fit, selection, birthFit,
    uploads: uploads.map((u) => ({ id: u.id, name: u.name, imageUrl: blobUrl(u.blobKey), fit: u.fit })),
  };
}

// ── THE SKILL ZODIAC (Nigel's directive via Law, 2026-10-17;
// the v2 wheel, Nigel's build order 2026-10-22): the wheel is
// ONE pool of points — the old separate canopy pool is
// retired, because the v2 tree prices everything (194 stars,
// 208 points) in the one pool. EVERY LEVEL grants 2 points
// (Nigel, 2026-10-22 — supersedes the old 5-per-level budget
// law), so the points a Tender holds are level x 2, nothing
// else. NO SKILL IS CLASS-LOCKED: a star's road may be
// tailored to a class, but any Tender may buy any star; the
// only gates are Heart-first, the road walked star by star,
// and the point cost (Nigel, 2026-10-22 — off-road freedom:
// wandering roads carries no penalty beyond the Deepening
// Rule's own economics).
export const SKILL_POINTS_PER_LEVEL = 2;

/** The wheel walked from the Heart: the set of nodes lying
 *  on held roads (owned nodes connected to the Heart
 *  through owned nodes), the Heart itself included. */
function zodiacReached(owned: ReadonlySet<string>): Set<string> {
  const seen = new Set<string>(["heart"]);
  const queue = ["heart"];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nb of liveAdj()[cur] ?? []) {
      if (!seen.has(nb) && owned.has(nb)) { seen.add(nb); queue.push(nb); }
    }
  }
  return seen;
}

/** THE WORKSHOP→TENDER INBOX — the reader's half of the
 *  ledger (ruled 2026-10-20): a tender's letters, newest
 *  first, with the unread count read off the same rows.
 *  Reads are always scoped to the caller's own owner key —
 *  a tender sees ONLY their own letters. */
function tenderInboxState(ownerKey: string) {
  const rows = sqlite.prepare("SELECT id, body, sent_at, read_at FROM tender_messages WHERE owner_key = ? ORDER BY sent_at DESC, id DESC").all(ownerKey) as { id: number; body: string; sent_at: number; read_at: number | null }[];
  return {
    messages: rows.map(r => ({ id: r.id, body: r.body, sentAt: r.sent_at, readAt: r.read_at })),
    unread: rows.filter(r => r.read_at == null).length,
  };
}

async function skillTreeState(ownerKey: string) {
  const progress = await getTenderProgress(ownerKey);
  const rows = sqlite.prepare("SELECT skill_key FROM tender_skills WHERE owner_key = ?").all(ownerKey) as { skill_key: string }[];
  const byId = liveById();
  const unlocked = rows.map(r => r.skill_key).filter(k => byId.has(k));
  let spent = 0;
  for (const k of unlocked) { spent += byId.get(k)!.cost; }
  const level = progress.level;
  const total = level * SKILL_POINTS_PER_LEVEL;
  const attRows = await db.select().from(schema.aspectAttunement).where(eq(schema.aspectAttunement.ownerKey, ownerKey));
  const attunement: Record<string, number> = { tide: 0, sky: 0, stone: 0, root: 0, fire: 0 };
  for (const r of attRows as any[]) attunement[r.element] = r.points ?? 0;
  // The cluster GRANTS (tranche one): held steps, notables,
  // and crowns add their attunement to the Tender's standing
  // — the gates below judge the effective hue.
  const grants = skillAttunementGrants(ownerKey);
  for (const el of Object.keys(attunement)) attunement[el] += grants[el] ?? 0;
  const attunementLevels: Record<string, number> = {};
  for (const el of Object.keys(attunement)) attunementLevels[el] = attunementLevel(attunement[el]);
  return {
    nodes: liveNodes(), edges: liveEdges(), unlocked, level,
    pointsPerLevel: SKILL_POINTS_PER_LEVEL,
    tree: { total, spent, left: total - spent },
    attunement, attunementLevels,
  };
}

/* ── THE HOMELAND WEAPON REFEREE (Nigel, 2026-10-20) ─────────
 * At the Table his runic weapon hunts on its own (fireWeapon in
 * table.ts); on the homeland it floated at his shoulder and
 * never struck — presence without law, a one-field shortfall
 * against the standing law that both grounds carry the same
 * functionality. These numbers are the Table's own, mirrored
 * (table.ts imports this module, so the law cannot ride the
 * other way) — test60 holds the two copies to the same reading,
 * cell for cell, so the mirror can never quietly drift. */
export const HOMELAND_WEAPON_DIE: Record<string, number> = { swordshield: 6, sword: 10, spear: 6, arrow: 4 };
export const HOMELAND_WEAPON_RANGE_HEX: Record<string, number> = { swordshield: 1, sword: 1, spear: 2, arrow: 4 };
export const HOMELAND_WEAPON_COOLDOWN_MS: Record<string, number> = { swordshield: 1000, sword: 1100, spear: 1050, arrow: 1400 };
export const HOMELAND_ELEMENT_REACH: Record<string, number> = { stone: 1, root: 2, fire: 2, tide: 3, sky: 4 };
/** The Blind Fray's wound track: the Table's Fray stands at
 *  hp 3 behind AC 11 (base 10 + its +1 bonus — DARK_ARMOR
 *  there); the homeland's wanderers carry the same body
 *  now, so blows land, deepen, and fell — purification is
 *  no longer the only way a wanderer's walking ends.
 *  HOMELAND_FRAY_ARMOR is the Fray's AC under the default
 *  workshop record: the live referee reads enemyACFor
 *  (enemyAC.ts), so a workshop edit to the Fray's
 *  bonus moves this ground's target with the Table's. */
export const HOMELAND_FRAY_HP = 3;
export const HOMELAND_FRAY_ARMOR = ENEMY_AC_BASE + ENEMY_ARMOR_DEFAULTS.fray;
function homelandDN(sides: number): number { return 1 + Math.floor(Math.random() * sides); }
/** The wielded weapon's homeland reach in hexes — the Table's
 *  weaponRangeHexOf, read from the homeland contract: its base
 *  reach, or — once attuned (depth ≥ 1, an element set) — its
 *  ELEMENT's reach instead; the spear's Signature (LONGSHAFT)
 *  adds one hex on top of whichever applies. */
export function homelandWeaponRangeFor(weaponKey: string, element: string | null, depth: number, signature: boolean): number {
  let range = HOMELAND_WEAPON_RANGE_HEX[weaponKey] ?? 0;
  if ((depth ?? 0) >= 1 && element && HOMELAND_ELEMENT_REACH[element] != null) {
    range = HOMELAND_ELEMENT_REACH[element];
  }
  if (weaponKey === "spear" && signature) range += 1;
  return range;
}
/** The homeland strike's attack bonus — the Table's roll site
 *  read whole (fireWeapon): Fate's level step (a point at Lv 3,
 *  6, 9…) plus THE SAGE'S HAND (Nigel, 2026-10-20): +2 to HER
 *  base attack roll, her own blows only — the same law at this
 *  ground's roll site, never her company's blessing. */
export function homelandWeaponBonusFor(classKey: string | null, tenderLevel: number): number {
  return Math.floor(Math.max(1, tenderLevel) / 3) + (classKey === "sage" ? 2 : 0);
}
/** The wielded weapon's harm roll — the Table's weaponDamageOf:
 *  its die, plus a point per level past the first, plus the
 *  sword Signature's KEEN edge (+2), all before mitigation. */
export function homelandWeaponDamageFor(weaponKey: string, weaponLevel: number, signature: boolean): number {
  return homelandDN(HOMELAND_WEAPON_DIE[weaponKey])
    + Math.max(0, (weaponLevel ?? 1) - 1)
    + (weaponKey === "sword" && signature ? 2 : 0);
}
/** An Awokin's ARMOR CLASS on the homeland (the Company
 *  Bonuses, Nigel 2026-10-22 12:27; Recovery R7): its
 *  toughness plus its Tender's company AC — the Warden's
 *  +4, the Sage's +2 — read through the one reader both
 *  grounds share (companyAcBonusFor in skills.ts). The
 *  living battle's dark strikes reckon the hit AND Fate's
 *  mitigation against this one number, and a ward at the
 *  border turns a blow whose measure was reckoned against
 *  it. Exported so a proof can read the reckoning directly. */
export function homelandVictimAcFor(toughness: number, classKey: string | null | undefined, ownerKey?: string | null): number {
  return toughness + companyAcBonusFor(classKey, ownerKey);
}

/** THE WITCH'S COMPANY PRICE ON THE HOMELAND (Nigel,
 *  2026-10-22 12:27; Recovery R7): while a party member she
 *  has cast stands on her field, her casting costs half.
 *  The homeland keeps no record of which door a placement
 *  arrived by — the summon cast is the casting door, and
 *  only party members can be summoned at all — so the
 *  standing is read as the party's own: a member of her
 *  party standing among her field placements. (Fielded by
 *  the seed's deploy or returned from the bastion, a member
 *  reads as standing too; the ledger cannot tell the
 *  arrivals apart, and the reading is named here rather
 *  than hidden.) */
async function witchCompanyStanding(ownerKey: string): Promise<boolean> {
  const party = new Set(partyIdsFor(ownerKey));
  if (!party.size) return false;
  const rows = sqlite.prepare("SELECT awakened_id AS awakenedId FROM field_placements WHERE owner_key = ?").all(ownerKey) as { awakenedId: number }[];
  return rows.some(r => party.has(Number(r.awakenedId)));
}
async function witchPriceFor(ownerKey: string, classKey: string | null | undefined, cost: number): Promise<number> {
  if (classKey !== "witch") return cost;
  return witchCastCostFor(classKey, cost, await witchCompanyStanding(ownerKey));
}

/** THE WITCH'S MISCAST MERCY ON THE HOMELAND (Nigel,
 *  2026-10-22; Recovery R8): a Witch whose cast fizzles on
 *  this ground is refunded the mercy's share of what the
 *  cast actually charged — witchMiscastRefundFor (skills.ts)
 *  is the one reckoning, read by the Table too. The refund
 *  is credited straight back to her purse, uncapped by the
 *  vessel's maximum for the plain reason that it can never
 *  lift her above the balance she held before the cast: the
 *  share is reckoned on, and bounded by, the charge that was
 *  just taken from that same purse. Returns the amount
 *  refunded (0 for every other class, and for a free cast). */
async function refundHomelandFizzle(ownerKey: string, classKey: string | null | undefined, paid: number): Promise<number> {
  const refunded = witchMiscastRefundFor(classKey, paid);
  if (refunded <= 0) return 0;
  const current = await getEnergyFor(ownerKey);
  await db.update(schema.tenderResources)
    .set({ energy: current + refunded, updatedAt: new Date() })
    .where(eq(schema.tenderResources.ownerKey, ownerKey));
  return refunded;
}

/** Fate's mitigation, the Table's own formula: armor shaves a
 *  share that shrinks as the attacker's level grows; a landed
 *  blow always draws at least a point of blood. */
export function homelandFateMitigate(raw: number, armor: number, attackerLevel: number): number {
  if (raw <= 0) return 0;
  const cut = armor / (armor + 50 * Math.max(1, attackerLevel));
  return Math.max(1, Math.round(raw * (1 - cut)));
}

/* ── HOMELAND CASTING (Nigel, 2026-10-20) ─────────────────────
 * "casting entirely isn't on the homepage yet and we need it
 * to be so the tender can defend." The Tender cast only at the
 * Table; at home his wheel's spell branches stood read-only
 * because — as far as the Blind Fray's teeth go — no law made
 * his workings bite here: the map castings of 2026-10-17 stood
 * as furniture for the Battleground sim, unrolled and unblooded.
 * Now the homeland keeps the SAME casting law as the Table:
 * one roll, read from the Table's own castModFor (imported
 * above, never copied); the purse charged before the roll and
 * a fizzle spent; and the workings themselves DO their work on
 * this ground — a cast ward turns the Fray's chew aside, a
 * written rune springs on the dark that stands on it, strike
 * workings grind the curse they are sown in, and the
 * Springleaf's grove mends the company that shelters in it. */
/** Fate's dice by element, the Table's own table (FATE_DIE in
 *  table.ts), mirrored for the grove's burst — test61 holds
 *  the two to the same reading, cell for cell. */
export const HOMELAND_FATE_DIE: Record<string, number> = { sky: 4, root: 6, tide: 8, stone: 12, fire: 10, neutral: 6, unaligned: 6, dark: 6 };
/** The homeland casting reach: the Table's whole world is six
 *  rings, and the homeland reckons what the Tender can see the
 *  same way Phase D does — ring 6 of his stand (VIEW_RING in
 *  settleWanderers). A cast named beyond it is refused before
 *  any charge. */
export const HOMELAND_CAST_RING = 6;
/** One cast's roll on the homeland — the Table's rollCast read
 *  whole: d20 + castModFor(class, level, school) against DC =
 *  the spell's level + 10; a natural 20 always stands, a
 *  natural 1 always unravels. The modifier comes from the
 *  Table's exported reckoning itself, so a proof can read the
 *  homeland's mouth against the shared table (test61). */
export function homelandCastRoll(progress: { classKey: string | null; level: number }, spell: { kind: string; numbers?: Record<string, number> }): { ok: boolean; roll: number; mod: number; dc: number } {
  const mod = castModFor(progress.classKey, progress.level, spell.kind);
  const dc = (spell.numbers?.level ?? 1) + 10;
  const roll = homelandDN(20);
  const ok = roll === 20 || (roll !== 1 && roll + mod >= dc);
  return { ok, roll, mod, dc };
}
/** The canonical edge key between two adjacent tiles, in the
 *  WALL_DIRS tongue the edge ledgers speak (the smaller tile
 *  first, the direction from that tile) — the same key
 *  castMapWorking writes a ward under, so the chew can find
 *  the ward that guards its crossing. */
export function homelandEdgeKeyBetween(a: { q: number; r: number }, b: { q: number; r: number }): string | null {
  for (let d = 0; d < 6; d++) {
    const [dq, dr] = WALL_DIRS[d];
    if (a.q + dq === b.q && a.r + dr === b.r) {
      const flip = b.q < a.q || (b.q === a.q && b.r < a.r);
      return flip ? `${b.q},${b.r},${WALL_OPP[d]}` : `${a.q},${a.r},${d}`;
    }
  }
  return null;
}
/** Whether two segments cross (the ward line's test): a
 *  proper crossing, or one blow's end landing ON the other
 *  segment — a blow that reaches a victim standing at the
 *  line still crosses the line's guard. Read in axial
 *  space, an affine image of the ground, where crossing
 *  tests hold as they do on the plane. */
export function segmentsCross(
  a: { q: number; r: number }, b: { q: number; r: number },
  c: { q: number; r: number }, d: { q: number; r: number },
): boolean {
  const orient = (p: { q: number; r: number }, q2: { q: number; r: number }, r2: { q: number; r: number }): number => {
    const v = (q2.q - p.q) * (r2.r - p.r) - (q2.r - p.r) * (r2.q - p.q);
    return Math.abs(v) < 1e-9 ? 0 : (v > 0 ? 1 : -1);
  };
  const onSeg = (p: { q: number; r: number }, q2: { q: number; r: number }, r2: { q: number; r: number }): boolean =>
    q2.q >= Math.min(p.q, r2.q) - 1e-9 && q2.q <= Math.max(p.q, r2.q) + 1e-9
    && q2.r >= Math.min(p.r, r2.r) - 1e-9 && q2.r <= Math.max(p.r, r2.r) + 1e-9;
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSeg(a, c, b)) return true;
  if (o2 === 0 && onSeg(a, d, b)) return true;
  if (o3 === 0 && onSeg(c, a, d)) return true;
  if (o4 === 0 && onSeg(c, b, d)) return true;
  return false;
}
/** Whether a blow struck from `from` to `to` crosses a
 *  LINE ward's crossbar (the T's flat top): the ward's
 *  stored centre (its cast point), its stored unit
 *  direction and its stored length. A ward with no length
 *  (a one-node crossbar, the young cast) guards the point
 *  it stands on: a blow passing within half a hex of it
 *  is turned, the old point measure. */
export function lineWardTurnsBlow(ward: { nums: Record<string, number> }, from: { q: number; r: number }, to: { q: number; r: number }): boolean {
  const n = ward.nums;
  if (typeof n.linePx !== "number" || typeof n.aimQ !== "number" || typeof n.aimR !== "number") return false;
  const len = Number(n.lineLen ?? 0) || 0;
  if (len <= 1e-9) {
    const c = { q: n.aimQ, r: n.aimR };
    return (axialDist(from, c) <= 0.5) !== (axialDist(to, c) <= 0.5);
  }
  const half = len / 2;
  const a = { q: n.aimQ - n.linePx * half, r: n.aimR - n.linePr * half };
  const b = { q: n.aimQ + n.linePx * half, r: n.aimR + n.linePr * half };
  return segmentsCross(from, to, a, b);
}
/** A placement's own element for the grove's dice: the element
 *  of its strongest part (ties keep the first), read from the
 *  parts themselves as all element law is read here. */
export function homelandPlacementElement(layers: { element?: string | null; power?: number }[]): string {
  let best: string | null = null; let bestPower = -1;
  for (const l of layers ?? []) {
    const p = l.power ?? 0;
    if (l.element && p > bestPower) { best = l.element; bestPower = p; }
  }
  return best ?? "neutral";
}

function hexDistTiles(a: { q: number; r: number }, b: { q: number; r: number }): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

/** Mend one standing placement, its hp read fresh at the
 *  moment of mending (settles overlap; the ledger is the only
 *  truth). Returns the amount that truly landed. */
async function mendPlacement(placementId: number, amount: number): Promise<number> {
  const row = sqlite.prepare("SELECT hp, awakened_id AS awakenedId FROM field_placements WHERE id = ?").get(placementId) as any;
  if (!row) return 0;
  const maxHp = await placementMaxHp(row.awakenedId);
  const cur = row.hp ?? maxHp;
  const healed = Math.min(maxHp - cur, Math.max(0, Math.floor(amount)));
  if (healed > 0) sqlite.prepare("UPDATE field_placements SET hp = ? WHERE id = ?").run(cur + healed, placementId);
  return healed;
}

/** One burst of the Springleaf's healing on this ground — the
 *  Table's groveBurstHeal read whole: the mended one's OWN
 *  element die, rolled once; a sapling's breath is half the
 *  roll (min 1). `binderBonus` is the Binder's company gift
 *  (bindingHealBonusFor, Recovery R7): the Springleaf is a
 *  Binding working, so a grove a Binder planted heals +4
 *  more with every burst — the bonus rides the heal's
 *  amount, after the sapling's halving, as at the Table. */
async function groveBurstHealPlacement(placementId: number, awakenedId: number, half: boolean, binderBonus = 0): Promise<number> {
  const payload = await awakenedPayloadById(awakenedId);
  const element = homelandPlacementElement((payload?.layers ?? []) as any[]);
  let amount = homelandDN(HOMELAND_FATE_DIE[element] ?? 6);
  if (half) amount = Math.max(1, Math.floor(amount / 2));
  amount += binderBonus;
  return mendPlacement(placementId, amount);
}

/** Grind a cursed hex's curse HP by a working's harm — the
 *  strike workings bite the curse they are sown in, as they
 *  bite everything on their ground (the Single Blade's own
 *  page: "Harm to everything on its ground"). At 0 the curse
 *  breaks outright and the tile turns in the working's hue
 *  (the Awokin's Strike-the-Curse is the precedent; the
 *  Tender's dice are bigger, and his breaking carries no
 *  wave-pull — the spell is the hammer, not the summons).
 *  Mutates the tile row it is handed, so the read that
 *  settles it serves the ground truth. */
async function grindHomelandCurse(ownerKey: string, tile: any, harm: number, hue: string): Promise<{ ground: number; purified: boolean }> {
  if (!tile || !tile.cursed || harm <= 0) return { ground: 0, purified: false };
  const ring = Math.max(Math.abs(tile.q), Math.abs(tile.r), Math.abs(tile.q + tile.r));
  const maxHp = (tile.curseMaxHp as number | null) ?? curseHpFor(ring, (await getWorldMood()).mood);
  const curHp = (tile.curseHp as number | null) ?? maxHp;
  const ground = Math.min(curHp, harm);
  const next = curHp - ground;
  if (next > 0) {
    await db.update(schema.territoryTiles).set({ curseHp: next, curseMaxHp: maxHp }).where(eq(schema.territoryTiles.id, tile.id));
    tile.curseHp = next; tile.curseMaxHp = maxHp;
    return { ground, purified: false };
  }
  // A hue that names no element claims nothing — the tile takes
  // the DEFAULT (root since Nigel's ruling, 2026-10-25; before,
  // neutral). A true hue still claims the ground outright.
  const element = (["tide", "sky", "stone", "root", "fire"] as const).includes(hue as any) ? hue : "root";
  const sparked = Math.random() < 0.05;
  await db.update(schema.territoryTiles)
    .set({ cursed: 0, element: element as any, curseHp: null, curseMaxHp: null, spark: sparked ? 1 : 0, ...PURIFIED_TILE_FIELDS })
    .where(eq(schema.territoryTiles.id, tile.id));
  tile.cursed = 0; tile.element = element; tile.curseHp = null; tile.curseMaxHp = null; tile.spark = sparked ? 1 : 0;
  Object.assign(tile, PURIFIED_TILE_FIELDS);
  await expandFrontier(ownerKey, tile.q, tile.r);
  return { ground, purified: true };
}

/** Spring ONE written working of the land against the dark
 *  standing on its ground and the curse holding that ground —
 *  the Table's springHex, in the homeland's tongue. Called at
 *  the cast (the Table springs a rune the moment it is
 *  written, if the dark already stands there) and on the
 *  homeland settle, for the dark that wanders onto written
 *  ground later. The Crown Shard keeps its own hunger (its
 *  branch below, Recovery R5): it springs only for dark of
 *  power 5+ standing on its ground — under lesser dark it
 *  hovers on, unfed and unspent, as it would at a Table
 *  where only Fray tread. */
async function springHomelandWorking(ownerKey: string, workingId: number, tiles: any[]): Promise<{ sprung: boolean; felled: boolean; ground: number; purified: boolean; pinned: boolean; thrown: boolean }> {
  const none = { sprung: false, felled: false, ground: 0, purified: false, pinned: false, thrown: false };
  const w = sqlite.prepare("SELECT * FROM territory_workings WHERE owner_key = ? AND id = ?").get(ownerKey, workingId) as any;
  if (!w || (w.kind !== "rune" && w.kind !== "spell")) return none;
  const tile = tiles.find((t: any) => t.id === w.tile_id);
  if (!tile) return none;
  let nums: Record<string, number> = {};
  try { nums = JSON.parse(w.nums ?? "{}"); } catch { nums = {}; }
  let wanderer = sqlite.prepare("SELECT id, hp FROM homeland_wanderers WHERE owner_key = ? AND tile_id = ?").get(ownerKey, w.tile_id) as { id: number; hp: number | null } | undefined;
  // NO HEX-LOCK (Nigel, 2026-10-23 23:04; built 2026-10-24):
  // a writing laid at a tapped POINT also springs for a
  // dark thing standing on that point — within half a hex
  // of the writing, by its free point — not only for one
  // filed under the writing's tile. The tile spring stands
  // as it always has; the point widens the ground the
  // writing covers to the ground the player wrote on.
  // THE FOOTPRINT (Nigel, 2026-10-24 22:37): the point
  // measure is the writing's DIAMETER halved (its stored
  // numbers, laid at the cast by the runecasting level) —
  // at diameter 1 the radius is the same half hex it has
  // always been; a writing laid without a point reads from
  // its hex's own heart at the same measure.
  if (!wanderer) {
    const centre = (typeof nums.aimQ === "number" && typeof nums.aimR === "number")
      ? { q: nums.aimQ, r: nums.aimR }
      : { q: tile.q, r: tile.r };
    const radius = Math.max(0.5, (Number(nums.diameter ?? 1) || 1) / 2);
    const cand = (sqlite.prepare("SELECT id, hp, pos_q, pos_r FROM homeland_wanderers WHERE owner_key = ?").all(ownerKey) as any[])
      .find((x: any) => x.pos_q != null && x.pos_r != null
        && axialDist({ q: Number(x.pos_q), r: Number(x.pos_r) }, centre) <= radius + 1e-9);
    if (cand) wanderer = { id: cand.id, hp: cand.hp };
  }
  const bright = !!sqlite.prepare("SELECT id FROM territory_workings WHERE owner_key = ? AND engine = 'engine' AND kind = 'ward'").get(ownerKey);
  const harmWanderer = (harm: number): boolean => {
    if (!wanderer) return false;
    const cur = wanderer.hp == null ? HOMELAND_FRAY_HP : Number(wanderer.hp);
    const next = cur - harm;
    if (next <= 0) { sqlite.prepare("DELETE FROM homeland_wanderers WHERE id = ?").run(wanderer.id); return true; }
    sqlite.prepare("UPDATE homeland_wanderers SET hp = ? WHERE id = ?").run(next, wanderer.id);
    return false;
  };
  const spendCharge = (): void => {
    const charges = (w.charges ?? 1) - 1;
    if (charges <= 0) sqlite.prepare("DELETE FROM territory_workings WHERE id = ?").run(w.id);
    else sqlite.prepare("UPDATE territory_workings SET charges = ? WHERE id = ?").run(charges, w.id);
  };
  if (w.engine === "blade") {
    // THE SINGLE BLADE WAITS (Nigel, 2026-10-20, spec
    // single-blade-click-spring; re-ruled 2026-10-23 —
    // Recovery R4): the Blade has NO proximity spring on
    // this ground. Written, it stands armed until the
    // player's click on a dark thing within two hexes
    // looses it — that order is the looseBlade door below,
    // and it alone spends the Blade's charges here.
    return none;
  }
  if (w.engine === "blades") {
    if (!wanderer && !tile.cursed) return none;
    const power = (nums.power ?? 3) + (bright ? (nums.brightBonus ?? 1) : 0);
    spendCharge();
    const felled = wanderer ? harmWanderer(power) : false;
    const g = tile.cursed ? await grindHomelandCurse(ownerKey, tile, power, w.hue) : { ground: 0, purified: false };
    return { sprung: true, felled, ground: g.ground, purified: g.purified, pinned: false, thrown: false };
  }
  if (w.engine === "springblade") {
    // THE SPRINGING BLADE (Nigel, 2026-10-23 — Recovery R4,
    // Half B): the Single Blade's old proximity spring,
    // moved whole onto its own page — a pure-effect rune
    // with no solid body, springing as the Blade sprang,
    // with the Blade spring's own reckoning unchanged:
    // power 6 (the book's page), a charge a spring, and
    // the curse on its ground ground as the Blade ground it.
    if (!wanderer && !tile.cursed) return none;
    const power = (nums.power ?? 6) + (bright ? (nums.brightBonus ?? 1) : 0);
    spendCharge();
    const felled = wanderer ? harmWanderer(power) : false;
    const g = tile.cursed ? await grindHomelandCurse(ownerKey, tile, power, w.hue) : { ground: 0, purified: false };
    return { sprung: true, felled, ground: g.ground, purified: g.purified, pinned: false, thrown: false };
  }
  if (w.engine === "shardrain") {
    // THE RAIN'S AREA (Nigel, 2026-10-24 22:37): the fall
    // covers the writing's own hex and — by the spellcasting
    // level snapshotted at the cast (nums.areaReach) — the
    // rings beyond it. Every dark standing in the covered
    // ground is under the sky; at reach 0 the covered ground
    // is the writing's hex, exactly as it has always been.
    const areaReach = Math.max(0, Math.floor(Number(nums.areaReach ?? 0) || 0));
    const rainFoes = (sqlite.prepare("SELECT id, hp, tile_id AS tileId, pos_q AS posQ, pos_r AS posR FROM homeland_wanderers WHERE owner_key = ?").all(ownerKey) as any[])
      .filter((x: any) => {
        if (wanderer && x.id === wanderer.id) return true;
        let cell: { q: number; r: number } | null = null;
        if (x.posQ != null && x.posR != null) cell = axialRound(Number(x.posQ), Number(x.posR));
        else { const t = tiles.find((tt: any) => tt.id === x.tileId); if (t) cell = { q: t.q, r: t.r }; }
        return cell != null && hexDistTiles(tile, { q: cell.q, r: cell.r } as any) <= areaReach;
      });
    if (!rainFoes.length && !tile.cursed) return none;
    // The sky opens ONCE: the pool is rolled whole — the base
    // dice plus one per attunement level snapshotted at the
    // cast — and falls on everything under the writing.
    const dice = Math.max(1, (nums.diceBase ?? 2) + (nums.dicePerLevel ?? 1) * (nums.rainLevel ?? 0));
    let pool = 0;
    for (let i = 0; i < dice; i++) pool += homelandDN(6);
    sqlite.prepare("DELETE FROM territory_workings WHERE id = ?").run(w.id);
    let felled = false;
    for (const x of rainFoes) {
      const cur = x.hp == null ? HOMELAND_FRAY_HP : Number(x.hp);
      const next = cur - pool;
      if (next <= 0) { sqlite.prepare("DELETE FROM homeland_wanderers WHERE id = ?").run(x.id); felled = true; }
      else sqlite.prepare("UPDATE homeland_wanderers SET hp = ? WHERE id = ?").run(next, x.id);
    }
    const g = tile.cursed ? await grindHomelandCurse(ownerKey, tile, pool, w.hue) : { ground: 0, purified: false };
    return { sprung: true, felled, ground: g.ground, purified: g.purified, pinned: false, thrown: false };
  }
  if (w.engine === "shard") {
    // THE CROWN SHARD (Nigel, 2026-10-23 — Recovery R5): the
    // Table's reckoning (table.ts, springHex's shard branch
    // and the cast that measures it), ported WHOLE under
    // the porting law — nothing changed in measure or
    // behaviour, nothing dropped:
    //  · THE WAIT: the Shard hovers over its hex and springs
    //    only when a dark thing STANDING ON ITS GROUND
    //    measures power minPower or more (5 on the page;
    //    the Lowered Crown's lesser hunger rides in the
    //    cast's stored numbers, laid there by the cast
    //    snapshot on this ground as at the Table). Lesser
    //    dark leaves it standing, unfed and unspent.
    //  · THE MEASURE: the page's filled slots in the cast's
    //    element stand in the working's pour (laid at the
    //    cast by pageSlotsCastFor, as at the Table) and feed
    //    the fall at face value — +1 harm per slot.
    //  · THE FALL: it falls on the WHOLE hex — every foe
    //    standing there takes the GREATEST standing power
    //    × the book's multiplier (2 on the page) + the
    //    slots. Falling Light, the same zodiac honour the
    //    Table reads for this working, widens the measure
    //    — and the fall — one ring wider.
    //  · THE SPEND: the fall spends the working whole, as
    //    the Table retires it — no charge is kept.
    //  · CURSED GROUND: the fall grinds the curse holding
    //    its hex with the same harm, as every strike
    //    working sown in the curse does on this ground —
    //    but the curse alone never wakes it: it waits for
    //    a TARGET, as Nigel ruled it.
    // A foe stands on the ground by its filed tile or by
    // its free point's cell (the living battle's tongue),
    // and its measure is its power as the battle engine
    // reads it (the wanderer's own power, the kind's canon
    // power behind it).
    // The measure (Recovery R5) widens by the writing's own
    // DIAMETER (Nigel, 2026-10-24 22:37): each whole two
    // units of diameter beyond the first widens the fall
    // one ring, as Falling Light does.
    const reach = (workingEffects(ownerKey).fallingLight ? 1 : 0)
      + Math.max(0, Math.floor(((Number(nums.diameter ?? 1) || 1) - 1) / 2));
    const foes = (sqlite.prepare("SELECT * FROM homeland_wanderers WHERE owner_key = ?").all(ownerKey) as any[])
      .filter((x: any) => {
        let cell: { q: number; r: number } | null = null;
        if (x.pos_q != null && x.pos_r != null) cell = axialRound(Number(x.pos_q), Number(x.pos_r));
        else { const t = tiles.find((tt: any) => tt.id === x.tile_id); if (t) cell = { q: t.q, r: t.r }; }
        return cell != null && hexDistTiles(tile, { q: cell.q, r: cell.r } as any) <= reach;
      });
    if (!foes.length) return none;
    const powerOf = (x: any): number => Math.max(1, Number(x.power) || (HOMELAND_DARK_POWER[String(x.kind ?? "fray")] ?? 1));
    const greatest = Math.max(...foes.map(powerOf));
    if (greatest < (nums.minPower ?? 5)) return none;
    const dmg = greatest * (nums.multiplier ?? 2) + (w.pour ?? 0);
    sqlite.prepare("DELETE FROM territory_workings WHERE id = ?").run(w.id);
    let felled = false;
    for (const x of foes) {
      const maxHp = (HOMELAND_DARK_HP[String(x.kind ?? "fray")] ?? 3) + Math.max(0, (Number(x.lvl) || 1) - 1);
      const cur = x.hp == null ? maxHp : Number(x.hp);
      const next = cur - dmg;
      if (next <= 0) { sqlite.prepare("DELETE FROM homeland_wanderers WHERE id = ?").run(x.id); felled = true; }
      else sqlite.prepare("UPDATE homeland_wanderers SET hp = ? WHERE id = ?").run(next, x.id);
    }
    const g = tile.cursed ? await grindHomelandCurse(ownerKey, tile, dmg, w.hue) : { ground: 0, purified: false };
    return { sprung: true, felled, ground: g.ground, purified: g.purified, pinned: false, thrown: false };
  }
  if (w.engine === "lattice") {
    if (!wanderer) return none;
    // A hold already running is not a new spring — the
    // lattice does not burn its health re-pinning what it
    // already holds. When the pin lapses with the dark still
    // standing on the writing, it springs afresh.
    const held = sqlite.prepare("SELECT pinned_beats AS pb FROM homeland_wanderers WHERE id = ?").get(wanderer.id) as { pb: number } | undefined;
    if ((held?.pb ?? 0) > 0) return none;
    // The dark stands pinned for the book's rounds, counted
    // in the curse's own beats; pinning costs the lattice
    // the dark's power from its health rating (Fray power 1).
    sqlite.prepare("UPDATE homeland_wanderers SET pinned_beats = MAX(pinned_beats, ?) WHERE id = ?").run(Math.max(1, Math.floor(nums.pinRounds ?? 2)), wanderer.id);
    const hp = (w.hp ?? 0) - 1;
    if (hp <= 0) sqlite.prepare("DELETE FROM territory_workings WHERE id = ?").run(w.id);
    else sqlite.prepare("UPDATE territory_workings SET hp = ? WHERE id = ?").run(hp, w.id);
    return { sprung: true, felled: false, ground: 0, purified: false, pinned: true, thrown: false };
  }
  if (w.engine === "coil") {
    if (!wanderer) return none;
    // Thrown back to far ground: cursed ground three or more
    // hexes off, or the farthest dark there is; with no other
    // cursed ground in the world the Coil cannot spring.
    const cursedTiles = (tiles as any[]).filter(t => t.cursed && t.id !== tile.id);
    if (!cursedTiles.length) return none;
    const far = cursedTiles.filter(t => hexDistTiles(tile, t) >= 3);
    const poolTiles = far.length ? far : cursedTiles.slice().sort((a, b) => hexDistTiles(tile, b) - hexDistTiles(tile, a)).slice(0, 1);
    const dest = poolTiles[Math.floor(Math.random() * poolTiles.length)];
    sqlite.prepare("UPDATE homeland_wanderers SET tile_id = ? WHERE id = ?").run(dest.id, wanderer.id);
    spendCharge();
    // The turning pays its energy (capped by the book and by
    // the Tender's own vessel, as every grant is).
    const gain = Math.min(nums.energyCap ?? 3, nums.energyPerDark ?? 1);
    if (gain > 0) {
      const current = await getEnergyFor(ownerKey);
      const max = await calculateMaxEnergy(ownerKey);
      const nextEnergy = Math.min(max, current + gain);
      if (nextEnergy > current) {
        await db.update(schema.tenderResources).set({ energy: nextEnergy, updatedAt: new Date() }).where(eq(schema.tenderResources.ownerKey, ownerKey));
      }
    }
    return { sprung: true, felled: false, ground: 0, purified: false, pinned: false, thrown: true };
  }
  return none;
}

/** The settle pass for written ground (Homeland Casting):
 *  every rune and spell working of the land is read against
 *  the dark now standing on it and the curse now holding it.
 *  Runs on the territory read, after the wanderers walk and
 *  before the weapon answers. */
async function settleHomelandWorkings(ownerKey: string, tiles: any[]): Promise<void> {
  const rows = sqlite.prepare("SELECT id, tile_id AS tileId FROM territory_workings WHERE owner_key = ? AND kind IN ('rune', 'spell') ORDER BY id").all(ownerKey) as { id: number; tileId: number }[];
  for (const r of rows) {
    // The kind is read BEFORE the spring — the spring itself
    // removes the felled row.
    const wrow = sqlite.prepare("SELECT kind FROM homeland_wanderers WHERE owner_key = ? AND tile_id = ?").get(ownerKey, r.tileId) as any;
    const res = await springHomelandWorking(ownerKey, r.id, tiles);
    // A wanderer the written light beat pays its whole
    // bounty as any beaten creature pays (Nigel, 2026-10-20
    // the drip; 2026-10-23 the protection and the shadow):
    // creditBattleKill carries all three, the drip inside it.
    if (res.felled) {
      const t = tiles.find((x: any) => x.id === r.tileId);
      await creditBattleKill(ownerKey, String(wrow?.kind ?? "fray"), t?.element ?? null, null);
    }
  }
}

/* ── THE NEW WORKINGS ON THE LAND (Nigel, 2026-10-22; seated
 * 2026-10-23 — ported whole from the Proving Ground under the
 * porting law: counts, timings and behaviour unchanged).
 * These three are not writings that wait on a hex: they are
 * living effects with clocks of their own, stored in the
 * same territory_workings ledger (their state in nums) and
 * settled on the territory read, as every homeland reckoning
 * is settled — lazily, from timestamps.
 *  · BATS (spell, 5✦): the swarm hunts the STRONGEST standing
 *    wanderer (the most body left), biting 1d4 every 3 s
 *    IGNORING AC — three bites over a fixed 9 s, then it
 *    dissipates. A fallen quarry sends it to the next
 *    strongest; an empty field sends it home, and it is gone.
 *  · HOLD RUNE (rune, 7✦): the rune forms over its target —
 *    33 slots at ~122 ms (4026 ms) — and the HOLD BEGINS AT
 *    THE CRASH'S FIRST STRIKE: the struck wanderer stands
 *    held (held_until) for 3 s while the crash loops; then
 *    the working is spent. A target fallen before the crash
 *    takes the rune with it, as on the page.
 *  · RUNE SHATTER (spell, 1✦): its volley lands at the cast;
 *    a HELD cast stands here as a stream — 1✦ a second,
 *    three pieces a second, each piece its own shot (below). */
export const BATS_LIFE_MS = 9000;
export const BATS_BITE_MS = 3000;
export const HOLD_RUNE_FORM_MS = 33 * 122;
export const HOLD_RUNE_HOLD_MS = 3000;
export const SHATTER_RANGE = 2;
/** One Shatter piece's shot, in the page's own reckoning:
 *  d20 + the cast's bonus − 2 against the target's AC; a
 *  natural 20 always strikes, a natural 1 always glances. */
export function shatterPieceRoll(bonus: number, ac: number): { roll: number; total: number; hit: boolean } {
  const roll = homelandDN(20);
  const total = roll + bonus - 2;
  return { roll, total, hit: roll === 20 || (roll !== 1 && total >= ac) };
}

async function settleTransientWorkings(ownerKey: string, tiles: any[]): Promise<void> {
  const rows = sqlite.prepare("SELECT * FROM territory_workings WHERE owner_key = ? AND engine IN ('bats', 'holdrune', 'shatter') ORDER BY id").all(ownerKey) as any[];
  if (!rows.length) return;
  const now = Date.now();
  const byId = new Map<number, any>(tiles.map((t: any) => [t.id, t]));
  const saveNums = (id: number, nums: Record<string, any>): void => {
    sqlite.prepare("UPDATE territory_workings SET nums = ? WHERE id = ?").run(JSON.stringify(nums), id);
  };
  const drop = (id: number): void => { sqlite.prepare("DELETE FROM territory_workings WHERE id = ?").run(id); };
  const wandererById = (id: number): any => sqlite.prepare("SELECT * FROM homeland_wanderers WHERE owner_key = ? AND id = ?").get(ownerKey, id) as any;
  const harmWanderer = async (w: any, harm: number): Promise<boolean> => {
    const maxHp = (HOMELAND_DARK_HP[String(w.kind ?? "fray")] ?? 3) + Math.max(0, (Number(w.lvl) || 1) - 1);
    const cur = w.hp == null ? maxHp : Number(w.hp);
    const next = cur - harm;
    if (next <= 0) {
      sqlite.prepare("DELETE FROM homeland_wanderers WHERE id = ?").run(w.id);
      const t = byId.get(w.tile_id);
      await creditBattleKill(ownerKey, String(w.kind ?? "fray"), t?.element ?? null, null);
      return true;
    }
    sqlite.prepare("UPDATE homeland_wanderers SET hp = ? WHERE id = ?").run(next, w.id);
    return false;
  };
  for (const w of rows) {
    let nums: Record<string, any> = {};
    try { nums = JSON.parse(w.nums ?? "{}"); } catch { nums = {}; }
    if (w.engine === "bats") {
      const born = Number(nums.bornAt ?? w.created_at ?? now);
      if (now - born >= BATS_LIFE_MS) { drop(w.id); continue; }
      let bites = Number(nums.bites ?? 0);
      let nextBiteAt = Number(nums.nextBiteAt ?? born + BATS_BITE_MS);
      let targetId = nums.targetId != null ? Number(nums.targetId) : null;
      let acted = false;
      while (bites < 3 && now >= nextBiteAt) {
        // The strongest standing = the most body left.
        const foes = sqlite.prepare("SELECT * FROM homeland_wanderers WHERE owner_key = ?").all(ownerKey) as any[];
        if (!foes.length) { drop(w.id); acted = true; break; } // an empty field sends it home to dissipate
        foes.sort((a, b) => {
          const hpOf = (x: any) => x.hp == null ? (HOMELAND_DARK_HP[String(x.kind ?? "fray")] ?? 3) + Math.max(0, (Number(x.lvl) || 1) - 1) : Number(x.hp);
          return hpOf(b) - hpOf(a);
        });
        const target = foes[0];
        targetId = Number(target.id);
        await harmWanderer(target, homelandDN(4)); // 1d4, past all armor — AC is never consulted
        bites++; nextBiteAt += BATS_BITE_MS; acted = true;
      }
      if (!acted && targetId != null && !wandererById(targetId)) targetId = null;
      if (sqlite.prepare("SELECT id FROM territory_workings WHERE id = ?").get(w.id)) {
        saveNums(w.id, { ...nums, bornAt: born, bites, nextBiteAt, targetId });
      }
      continue;
    }
    if (w.engine === "holdrune") {
      const target = nums.targetId != null ? wandererById(Number(nums.targetId)) : null;
      if (!target) { drop(w.id); continue; }
      const born = Number(nums.bornAt ?? w.created_at ?? now);
      if (!nums.struckAt) {
        if (now - born >= HOLD_RUNE_FORM_MS) {
          const until = now + HOLD_RUNE_HOLD_MS;
          sqlite.prepare("UPDATE homeland_wanderers SET held_until = MAX(held_until, ?) WHERE id = ?").run(until, target.id);
          saveNums(w.id, { ...nums, bornAt: born, struckAt: now, holdUntil: until });
        }
        continue;
      }
      if (now >= Number(nums.holdUntil ?? 0)) drop(w.id);
      continue;
    }
    if (w.engine === "shatter") {
      // The held stream, settled on the read: its seconds are
      // charged as they pass and its pieces fired as they
      // fall due — three a second, each its own shot at the
      // dark standing on the aim tile.
      const until = Number(nums.streamUntil ?? 0);
      let nextChargeAt = Number(nums.nextChargeAt ?? until);
      let nextPieceAt = Number(nums.nextPieceAt ?? until);
      let starved = false;
      while (nextChargeAt <= Math.min(now, until)) {
        if (!(await spendEnergy(ownerKey, 1))) { starved = true; break; }
        nextChargeAt += 1000;
      }
      if (!starved) {
        const progress = await getTenderProgress(ownerKey);
        const bonus = castModFor(progress.classKey, progress.level, "spell");
        while (nextPieceAt <= Math.min(now, until)) {
          nextPieceAt += 333;
          const aimTile = byId.get(w.tile_id);
          if (!aimTile) continue;
          const allStreamFoes = sqlite.prepare("SELECT * FROM homeland_wanderers WHERE owner_key = ?").all(ownerKey) as any[];
          // A stream laid at a tapped point strikes the
          // dark standing on that point (2026-10-24); the
          // tile road strikes the dark on the aim tile.
          const streamAim = typeof nums.aimQ === "number" && typeof nums.aimR === "number" ? { q: nums.aimQ, r: nums.aimR } : null;
          const foe = (streamAim
            ? allStreamFoes
                .filter((x: any) => x.pos_q != null && x.pos_r != null
                  && axialDist({ q: Number(x.pos_q), r: Number(x.pos_r) }, streamAim) <= 0.5)
                .sort((a: any, b: any) => axialDist({ q: Number(a.pos_q), r: Number(a.pos_r) }, streamAim) - axialDist({ q: Number(b.pos_q), r: Number(b.pos_r) }, streamAim))[0]
            : undefined)
            ?? allStreamFoes
            .find((x: any) => {
              if (Number(x.tile_id) === Number(w.tile_id)) return true;
              if (x.pos_q == null || x.pos_r == null) return false;
              const cell = axialRound(Number(x.pos_q), Number(x.pos_r));
              return cell.q === aimTile.q && cell.r === aimTile.r;
            });
          if (!foe) continue;
          const shot = shatterPieceRoll(bonus, enemyACFor(String(foe.kind ?? "fray")));
          if (shot.hit) await harmWanderer(foe, 1);
        }
      }
      if (starved || now >= until) { drop(w.id); continue; }
      saveNums(w.id, { ...nums, nextChargeAt, nextPieceAt });
      continue;
    }
  }
}

/* ══ THE REAL-TIME BATTLE ENGINE (Nigel, 2026-10-23) ═══════════
 * The homeland battle is a LIVING simulation now, and this
 * block is its whole machinery. The model, in Nigel's words as
 * recorded (2026-10-23 10:28 + the 10:37 corrections):
 * cadence is the world's real-time clock — no turns; enemies
 * walk FREELY like the Proving Ground's shades, never locked
 * to hexes, slower than Awoken, and they BITE: Awoken first,
 * then the tiles themselves, spreading the curse. Awoken
 * answer by their orders — attack engages what comes in
 * range, defence holds ground and raises its works, binding
 * heals, and NO ORDERS DEFAULTS TO ATTACK. Crowding taxes
 * the pace of movement and battle alike (x n/4 beyond four,
 * the gate's own math). Kills bank PROTECTION (the enemy's
 * AC bonus above 10, in minutes — a Fray buys one minute)
 * and may pay Shadow Matter by the same number; the
 * LIGHTHOUSE — lit by the Tender's own hand, never by
 * default — spends the banked minutes, drinks Shadow Matter
 * for its upkeep while it burns, holds all spawning shut,
 * pushes the standing waves back and resets the wave
 * intensity to 1; unlit, every weather change steps the
 * intensity up. Everything settles lazily from timestamps on
 * the map read, as the marches and the wanderers taught the
 * homeland to reckon — there is no daemon.
 *
 * Numbers and their ground, stated once here:
 *  · Enemy AC and the bounty number: enemyACFor /
 *    enemyArmorBonus (enemyAC.ts) — the workshop record's law.
 *  · Enemy HP: the Fray's 3 is HOMELAND_FRAY_HP (the Table's
 *    body); the other kinds stand at 2 + their AC bonus
 *    (Hollow 4, Unraveler 5, Tangle 7) — DERIVED from the
 *    Fray anchor, flagged for Nigel.
 *  · Enemy power (d6 rolled per blow): Fray 1, Hollow 1,
 *    Unraveler 2, Tangle 2 — DERIVED, flagged. A Hollow's
 *    landed blow drains the Tender's energy instead of
 *    blood (the Table roster's own note for the kind).
 *  · Enemy speed: the Table's DARK_SPEED scale, made time —
 *    pace seconds per hex = twice the neutral march (6s; the
 *    "slower than Awoken" law against MARCH_SECONDS_PER_HEX
 *    neutral 3.0) shaped by 5/(speed+4), the darkIntervalMs
 *    form; strike interval = 2800ms x 5/(speed+4), the
 *    Table's own cadence made homeland law.
 *  · Awoken strike cadence by dominant element — the Proving
 *    Ground's attack-speed table, RE-BASED by Nigel
 *    (2026-10-24: "make base 3 seconds — for awoken"): the
 *    table DOUBLES (Stone 3500 · Root 3000 · Tide 2500 ·
 *    Sky 2000), the 4:5:6:7 spread preserved with its
 *    middle on the ruled 3-second base; Fire unranked there
 *    and stands at the Root anchor 3000, FLAGGED. Her SPEED
 *    BONUS (Nigel, 2026-10-24): each level above 1 trims her
 *    interval by 0.5% (x (1 - 0.005 x (level - 1)) — a
 *    level-20 fighter strikes at 0.905 of her table); the
 *    trim rides her cadence and the crowding tax multiplies
 *    the trimmed interval, as it taxed the plain one.
 *  · WATCHTOWERS IN THE FIGHT (Nigel, 2026-10-24: "towers
 *    fire once every 8 seconds"): an ACTIVE watchtower (its
 *    upkeep paid, not dormant) fights in this settlement —
 *    its documented +2 power stands in the strike reckoning
 *    of every Awoken on or beside its tile (the footprint
 *    the heal paths already keep), and every 8 seconds of
 *    settled battle time it looses its configured damage
 *    (3) at the nearest dark standing on or beside its
 *    tile. The 8-second beat is spent whether or not a foe
 *    stands in its guard, as the weapon referee's cadence
 *    is spent with no prey. Towers have no level and take
 *    no trim. A volley fell pays through fellDark as any
 *    unattributed engine fell pays (the thorn's, the
 *    bramble's): protection banks, the drip and the Shadow
 *    roll ride creditBattleKill; no slayer stands in the
 *    record, so no attack XP is paid.
 *  · Awoken reach: HOMELAND_ELEMENT_REACH (the grimoire's own
 *    "elemental reaches for the company": stone 1, root 2,
 *    fire 2, tide 3, sky 4). Enemy bite reach: 1.35 axial —
 *    DERIVED (adjacent centres stand 1.0 apart; a figure at a
 *    tile's edge must still reach its neighbour's heart).
 *  · Combat math is the standing law mirrored both ways:
 *    d20 + bonus vs AC (an Awokin's AC is its TOUGHNESS, as
 *    the Table reckons a victim's, plus the Sage's company
 *    +2 where she leads), damage by the AC-ratio equation
 *    with the full AC (homelandFateMitigate), shields burn
 *    before HP, a natural 20 always lands (and doubles the
 *    dice), a natural 1 always misses. No 4+ faces anywhere.
 *  · Elemental flavours are the Proving Ground's rulings
 *    (Nigel, 2026-10-22): Sky strikes SHOVE the struck dark
 *    floor(sky/3) tiles; Tide strikes leave it WET (10s, the
 *    PG's pencil): its speed drops 2 on the Table's scale
 *    and Sky strikes land +2 on it; Stone strikes CRACK:
 *    -1 AC a hit to -3; a Root Awokin answers a landed blow
 *    with THORNS, 1 + her Root aspects, no roll on the answer.
 *  · Defence works are the PG's stance bonuses seated: a
 *    Root defender grows BRAMBLE ahead of her (nodes = her
 *    parts — "the spread is her body"; a node carries her
 *    toughness in HP, FLAGGED), a Stone defender raises a
 *    ROCK WALL on a line ahead (count 3 + floor(level/3),
 *    cap 6; each rock's HP by level 5,6,6,7,8,8,9,9,10 —
 *    Nigel's table). Rocks BLOCK a walk outright and are
 *    hacked at 1 a strike (the PG's WALL_HACK_DMG pencil);
 *    bramble slows the dark that pushes through it by half
 *    and answers with 1 thorn a beat.
 *  · WATERING (Nigel, 2026-10-24: "make bramble motes
 *    targetable by a tide awokin attack. each attack
 *    causes a new bramble mote to grow — effect called
 *    watering — allow bramble to spread and overlap
 *    slightly as well"; "add it to tide element"; "its
 *    the positive effect of wet"): a standing bramble's
 *    nodes bear MOTES — young growths of the same work,
 *    standing at the node's fringe (up to 3 a node, born
 *    with the raise; a mote carries the node's own HP and
 *    remembers its parent node's point). A mote IS
 *    bramble: it stands in the work's node list, so the
 *    walk's own reckoning hinders the dark that crosses
 *    it exactly as at a node — half pace and the thorn
 *    tick, no new numbers. A dark can hack a mote down
 *    like a node of the walls (WALL_HACK_DMG a strike, in
 *    its face), and a mote falls with its work, as every
 *    node does. WATERING is the Tide rider's other face:
 *    the same Wet her strike leaves on a dark thing,
 *    landing on bramble, FEEDS it — on her strike step,
 *    where no dark stands within her reach but a mote
 *    does, her strike lands on the mote as Watering.
 *    Any mote can be watered, so the creep can chain; a
 *    work bears at most 12 living motes, and a step that
 *    would land off the land grows nothing. No roll is
 *    made against a mote: she tends her own side's
 *    growth, and her cadence is the price.
 *  · THE MOTE'S OWN GROWTH + THE WATERING METER (Nigel,
 *    2026-10-24 19:23, refining the paragraph above:
 *    "make the bramble motes grow by them selves
 *    overtime a little slower then the origional — what
 *    the watering does is causes the mote to spread
 *    another mote every 10 dmg"; the pace ruled by his
 *    tap, 19:26: SECONDS — a breath slower than the
 *    thicket's own growth-in, watched as it swells): a
 *    mote is BORN SMALL and grows ON ITS OWN through
 *    the flipbook's whole growth run, at mote scale,
 *    over a run a quarter slower than the node's
 *    growth-in (the client's brambleFx keeps the
 *    measure: 32 frames over ≈2.64 s against the node's
 *    ≈2.11 s). The growth is engine-true, not a client
 *    guess: each mote's entry in the work's node list
 *    carries its BIRTH MOMENT (born, the settle's own
 *    clock), served with the work, and the map reads
 *    the mote's frame off its served age. A mote that
 *    finishes its run stands GROWN and STAYS A MOTE —
 *    hackable, counted in the work's 12, sharing its
 *    parent's fate. And a watering no longer grows a
 *    mote a strike: each mote carries a WATERING BANK,
 *    and her strike's rolled harm — the raw sum a
 *    landed blow starts from, her parts' dice and
 *    powers with the banners' lendings and the tower's
 *    +2, banked whole because a mote has no AC for the
 *    fate mitigation to read — pours into the watered
 *    mote's bank; at EVERY 10 damage banked the mote
 *    SPREADS exactly one new mote, one spread step
 *    beyond it on its parent ray (a fat strike can
 *    spread several, stepping from each newborn in
 *    turn), and the bank keeps the remainder. At the
 *    cap the damage still banks and no spread occurs;
 *    the banked damage spreads when room returns and
 *    a later strike lands. The per-strike growth of
 *    the first telling is struck by these words.
 *  · The DEFENCE BONUS on strikes: no standing number exists
 *    in code or law for a defender's blows on this ground —
 *    defenders strike with the unmodified math and raise
 *    their works. FLAGGED, uninvented.
 *  · Spreading the curse: a bite worries a pure tile; when
 *    the worried harm meets the curse's own HP for that
 *    ground (curseHpFor, 4 + 6 x ring under the standing
 *    mood law) the tile turns. Seed-calm is not netted out
 *    of the threshold here (the grind's own reckoning uses
 *    the plain ring likewise) — FLAGGED as the reading.
 *  · The light takes its own: dark standing on purified
 *    ground withers at the curse attrition's own mirrored
 *    rate (0.01 x (ring+1) of its greatest health per 2.8s),
 *    and a withering death pays nothing — no blow beat it.
 * ════════════════════════════════════════════════════════════ */
export const HOMELAND_DARK_HP: Record<string, number> = { fray: 3, hollow: 4, unraveler: 5, tangle: 7 };
export const HOMELAND_DARK_POWER: Record<string, number> = { fray: 1, hollow: 1, unraveler: 2, tangle: 2 };
export const HOMELAND_DARK_SPEED: Record<string, number> = { fray: 3, unraveler: 2, hollow: 0, tangle: 1 };
export const AWOKEN_STRIKE_MS: Record<string, number> = { sky: 2000, tide: 2500, root: 3000, stone: 3500, fire: 3000, neutral: 3000 };
/** THE WATCHTOWER'S VOLLEY BEAT (Nigel, 2026-10-24):
 *  one volley every 8 seconds of settled battle time. */
export const TOWER_VOLLEY_MS = 8000;
/** The per-tower volley clocks, carried across settles in
 *  memory as the strike witness is carried: milliseconds of
 *  settled battle time each tower has banked toward its
 *  next volley, keyed owner:building. A restart starts the
 *  clocks empty, exactly as an unwitnessed blow is lost. */
const towerVolleyCarry = new Map<string, number>();
const BATTLE_BEAT_MS = 2800;
const ENEMY_BITE_REACH = 1.35;
const ENEMY_BASE_SEC_PER_HEX = 6; // twice the neutral march — the "slower than Awoken" law
const WET_MS = 10000; // the Proving Ground's pencil for Wet's length
/** WATERING's measures (Nigel, 2026-10-24, above): the
 *  motes a node bears at its fringe, the living motes a
 *  work may bear at once, the fringe's radius, and the
 *  creep's step — the work's own node spread step (0.55,
 *  raiseWork's measure) read again, not a new number.
 *  The last is the METER's price (Nigel, 2026-10-24
 *  19:23, above): the damage a mote must bank before
 *  it spreads another mote — "every 10 dmg", his own
 *  figure. */
const BRAMBLE_MOTES_PER_NODE = 3;
const BRAMBLE_MOTE_CAP = 12;
const BRAMBLE_MOTE_FRINGE = 0.5;
const BRAMBLE_MOTE_SPREAD_STEP = 0.55;
const BRAMBLE_MOTE_SPREAD_COST = 10;
const WALL_HACK_DMG = 1; // the Proving Ground's pencil: a shade's blow hacked into stone
export const ROCK_WALL_HP_BY_LEVEL = [5, 6, 6, 7, 8, 8, 9, 9, 10];
/** The shared 5–10 HP-by-level reading (Nigel, 2026-10-23 —
 *  the recovery's shared law for the Rock Wall's kin): the
 *  ONE table above, read at a level clamped to its span.
 *  The Rock Wall reads it at the raising Awoken's level;
 *  BULWARK (Recovery R12) reads it at the warding cast
 *  level — no second copy of the law stands anywhere. */
export function rockWallHpForLevel(level: number): number {
  return ROCK_WALL_HP_BY_LEVEL[Math.min(9, Math.max(1, Math.floor(level) || 1)) - 1];
}
/** BULWARK'S COUNT (Nigel, 2026-10-23 12:04 — Recovery
 *  R12): "BULWARK'S COUNT FOLLOWS THE WARDING CAST LEVEL:
 *  a high cast summons more shields, a low cast only one
 *  or 2." THE READING, named plainly: the warding cast
 *  level is the CASTER'S TENDER LEVEL — the same figure
 *  the cast's own roll is reckoned from (castModFor reads
 *  the Tender level) and the figure hpForCast calls the
 *  caster's level for every other ward; the Rock Wall
 *  likewise reads its raiser's level. THE FORMULA: one
 *  shield per two cast levels, ⌊level / 2⌋ — the shape of
 *  Nigel's own earlier pencil for this line ("tender lvl
 *  /2", 2026-10-21) — floored at 1 (a cast that stands
 *  raises a shield) and CAPPED AT 6 in the rock-wall
 *  fashion (the homeland Rock Wall's own cap), per the
 *  12:04 ruling where the two differ: Lv 3 → 1, Lv 4–5 →
 *  2, Lv 6–7 → 3, Lv 8–9 → 4, Lv 10–11 → 5, Lv 12+ → 6. */
export function bulwarkShieldCountFor(castLevel: number): number {
  return Math.min(6, Math.max(1, Math.floor(Math.max(1, Math.floor(castLevel) || 1) / 2)));
}
/** ── THE SIZE OF A WORK FOLLOWS THE CASTER'S LEVEL IN ITS
 *  CRAFT (Nigel, 2026-10-24 22:35–22:37 — ruled for wards,
 *  then runes, then "binding and spellcasting too": the
 *  general law for all four crafts): a ward's LINE LENGTH
 *  by the warding level, a rune's DIAMETER by the
 *  runecasting level, a binding's EXTENT by the binding
 *  level, a spell's SIZE by the spellcasting level.
 *  THE MEASURES, named plainly: the engine keeps ONE cast
 *  level for a caster — the Tender level — and the warding
 *  law already reads it AS the warding cast level (R12's
 *  reading above: "the warding cast level is the CASTER'S
 *  TENDER LEVEL"). No separate runecasting, binding or
 *  spellcasting level stands anywhere in the engine —
 *  THOSE THREE MEASURES ARE MISSING, flagged here rather
 *  than invented: their resolvers read the Tender level
 *  today, the same reading the warding law itself stands
 *  on, and each resolver is ONE named function — the day
 *  Nigel names a true per-craft level, it wires in there
 *  and nowhere else. Every size is read AT THE CAST, as
 *  HP and counts have always been, and stands in the
 *  working's stored numbers or its laid nodes. */
export const wardingCastLevelFor = (level: number): number => Math.max(1, Math.floor(level) || 1);
export const runecastLevelFor = (level: number): number => Math.max(1, Math.floor(level) || 1);
export const bindingCastLevelFor = (level: number): number => Math.max(1, Math.floor(level) || 1);
export const spellcastLevelFor = (level: number): number => Math.max(1, Math.floor(level) || 1);
/** THE WARD'S T (Nigel, 2026-10-24 22:35): "wards are a
 *  line — the distance between the two points of that line
 *  is locked correlated to the caster's warding level; the
 *  distance from the caster the ward is, is set by target
 *  click; the direction of the line is perpendicular to
 *  the line from the caster to the cast point. Simply put,
 *  wards cast in a T, with the caster being the bottom
 *  point of the T and the ward being the flat top."
 *  ONE CLICK aims a ward completely: the click point is
 *  the crossbar's centre (in the casting reach as ever),
 *  the crossbar runs perpendicular to the caster→click
 *  axis there, and its LENGTH follows the warding cast
 *  level: the crossbar holds wardLineCountFor nodes spaced
 *  WARD_LINE_SPACING apart (the Rock Wall's own spacing),
 *  the count on Bulwark's own formula (⌊level/2⌋, 1..6) —
 *  so the endpoint-to-endpoint length is (count − 1) ×
 *  0.55 axial units: Lv 3 → a point, Lv 4–5 → 0.55,
 *  Lv 6–7 → 1.1, Lv 8–9 → 1.65, Lv 10–11 → 2.2, Lv 12+ →
 *  2.75. */
export const WARD_LINE_SPACING = 0.55;
export function wardLineCountFor(castLevel: number): number { return bulwarkShieldCountFor(castLevel); }
export function wardLineLengthFor(castLevel: number): number { return (wardLineCountFor(castLevel) - 1) * WARD_LINE_SPACING; }
/** The crossbar's geometry: its unit direction (perpendicular
 *  to the caster→cast-point axis; a cast point on the
 *  caster's own ground has no axis to read, and the T
 *  stands on the east axis), its count and its length. */
export function wardCrossbarFor(caster: { q: number; r: number }, point: { q: number; r: number }, castLevel: number): { px: number; pr: number; count: number; length: number } {
  let ax = point.q - caster.q, ar = point.r - caster.r;
  const alen = Math.hypot(ax, ar);
  if (alen < 1e-6) { ax = 1; ar = 0; } else { ax /= alen; ar /= alen; }
  return { px: -ar, pr: ax, count: wardLineCountFor(castLevel), length: wardLineLengthFor(castLevel) };
}
/** The crossbar's nodes, laid evenly along it, centred on
 *  the cast point — the standing Edge Works line behaviour
 *  (the Rock Wall's and Bulwark's own laying). */
export function wardLineNodesFor(cx: number, cy: number, px: number, pr: number, castLevel: number, hp: number): { q: number; r: number; hp: number; maxHp: number }[] {
  const count = wardLineCountFor(castLevel);
  const nodes: { q: number; r: number; hp: number; maxHp: number }[] = [];
  for (let i = 0; i < count; i++) {
    const off = (i - (count - 1) / 2) * WARD_LINE_SPACING;
    nodes.push({ q: cx + px * off, r: cy + pr * off, hp, maxHp: hp });
  }
  return nodes;
}
/** A RUNE'S DIAMETER (Nigel, 2026-10-24 22:37): "diameter
 *  of runes is also runecasting lvl." The footprint a
 *  writing covers, in axial units, on the same count the
 *  ward line steps by (⌊level/2⌋, 1..6) read as the
 *  diameter itself. A spring reads a dark standing within
 *  the footprint's RADIUS of the writing's point — at
 *  diameter 1 the radius is 0.5, the very measure the point
 *  springs have always read by, so a young writing covers
 *  exactly the ground it covered before this law. The
 *  Single Blade keeps its spring law whole (the click
 *  looses it; its two-hexes loose reach is unchanged) —
 *  its footprint follows this diameter in its stored
 *  numbers and its drawn glyph, as any rune's does. */
export function runeDiameterFor(runecastLevel: number): number { return bulwarkShieldCountFor(runecastLevel); }
/** A BINDING'S EXTENT (Nigel, 2026-10-24 22:37): the
 *  Springleaf's radius — the formula the grove has always
 *  grown by ((66 + 12 per level) read through the land's
 *  scale), now named as the binding law's one function; a
 *  Binder's hand doubles it in bindingHealRangeFor, as it
 *  always has. Heal carries NO extent: it mends one named
 *  Awokin, and its reach is its range, not a size — said
 *  plainly rather than invented for it. */
export function bindingRadiusFor(bindingLevel: number): number {
  return Math.max(1, Math.floor(((66 + 12 * Math.max(1, Math.floor(bindingLevel) || 1)) * 2.75) / 80));
}
/** A SPELL'S SIZE (Nigel, 2026-10-24 22:37), by the spell's
 *  own geometry: Shard Rain is the book's AREA spell — the
 *  ground its fall covers, in hex steps beyond the hex it
 *  is written on, on the craft count's slower steps
 *  (⌊(count−1)/2⌋: 0 through Lv 5, 1 at Lv 6–9, 2 at
 *  Lv 10+). Bats has NO size dimension (a hunting swarm —
 *  its bites are a count and its field is the whole land)
 *  and Rune Shatter has NONE (its two tiles are range, and
 *  its stream stands on the one hex it was loosed on) —
 *  named as none rather than invented for them. */
export function shardRainReachFor(spellcastLevel: number): number {
  return Math.floor((bulwarkShieldCountFor(spellcastLevel) - 1) / 2);
}
/** BLACK GATE'S EIGHT FACINGS (Nigel, 2026-10-23 12:04 —
 *  Recovery R13): "cast IN FRONT OF THE CASTER in the
 *  direction they face — N, E, S, W AND THE DIAGONALS
 *  (8 facings)." The steps below are the eight compass
 *  directions read onto this land's axial lattice, each
 *  exactly ONE axial unit from the caster's point (axial
 *  distance 1, the measure the walk reckoning walks by).
 *  The land's six hex steps are (0,−1), (1,−1), (1,0),
 *  (0,1), (−1,1), (−1,0): north and south stand among
 *  them whole (N = (0,−1), S = (0,1)). East and west
 *  are the half-steps between their flanking hex steps
 *  (E = the mean of (1,−1) and (1,0) = (1,−0.5);
 *  W = (−1,0.5)), and the four diagonals are the
 *  half-steps between a cardinal hex step and an
 *  east/west half-step (NE = (0.5,−1), SE = (0.5,0.5),
 *  SW = (−0.5,1), NW = (−0.5,−0.5)). Every step's
 *  axial length is exactly 1, and read through the
 *  land's iso basis each step points along its own
 *  compass ray, within the lattice's own slant.
 *  THE FACING'S SOURCE, named plainly: the Tender's
 *  facing lives on the homeland figure itself — the
 *  client's tenderFacingRef, the 8-direction facing the
 *  figure is drawn and strides by (tenderArt's
 *  TenderDir) — and the server keeps NO facing of its
 *  own: no column, no record. So the cast carries the
 *  figure's facing in on the cast message itself (the
 *  `facing` field of castMapWorking), exactly as the
 *  ward casts carry their aim (tileId/dir) in on theirs,
 *  and the server REQUIRES it for this working: a cast
 *  naming no facing, or a word outside the eight, is
 *  refused — a default direction is never dressed up
 *  as the caster's facing. The caster's POINT the step
 *  is taken from is the server's own knowledge of where
 *  the Tender stands: his stand tile's point (his free
 *  pixel point lives client-side and is never sent; the
 *  tile's point is the point the server can swear to). */
export const BLACK_GATE_FACINGS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type BlackGateFacing = (typeof BLACK_GATE_FACINGS)[number];
export const BLACK_GATE_STEP: Record<BlackGateFacing, readonly [number, number]> = {
  N: [0, -1], NE: [0.5, -1], E: [1, -0.5], SE: [0.5, 0.5],
  S: [0, 1], SW: [-0.5, 1], W: [-1, 0.5], NW: [-0.5, -0.5],
};
export function blackGateStepFor(facing: string): readonly [number, number] | null {
  return (BLACK_GATE_FACINGS as readonly string[]).includes(facing)
    ? BLACK_GATE_STEP[facing as BlackGateFacing]
    : null;
}
const DEFENCE_WORK_ENGAGE = 2.5; // a work is raised when the dark comes within her reach + this
/** THE LIGHTHOUSE'S SHADOW UPKEEP — RULED (Nigel, 2026-10-24:
 *  "1 shadow matter 4 min"): while the light burns it drinks
 *  ONE Shadow Matter per FOUR minutes lit, on top of the
 *  banked minutes it spends. The hoard (shadow_matter) is a
 *  REAL column, so the rate is carried per minute below as an
 *  exact quarter (0.25) and fractions accrue lawfully across
 *  settlements — nothing is rounded away, nothing invented.
 *  When the hoard cannot pay, the light gutters out at the
 *  hour the fuel runs dry — protection is never silently
 *  free. */
export const LIGHTHOUSE_SHADOW_UPKEEP_PER_FOUR_MINUTES = 1;
export const LIGHTHOUSE_SHADOW_UPKEEP_PER_MINUTE = LIGHTHOUSE_SHADOW_UPKEEP_PER_FOUR_MINUTES / 4;
/** Presence, for the protection pause: the lighthouse's burn
 *  is settled only across map-read gaps no longer than this —
 *  a longer silence is the Tender away (home screen, or
 *  gone), and away hours burn nothing. DERIVED, flagged. */
export const PROTECTION_ONLINE_GAP_MS = 5 * 60 * 1000;

function axialDist(a: { q: number; r: number }, b: { q: number; r: number }): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}
/** The tile a free point stands in: axial (cube) rounding. */
function axialRound(q: number, r: number): { q: number; r: number } {
  const x = q, z = r, y = -x - z;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
}
/** An enemy kind's walking pace, seconds per hex: the base
 *  slowness shaped by its speed on the Table's scale, and
 *  Wet's -2 read on the same scale. */
function enemySecPerHex(kind: string, wet: boolean): number {
  const speed = HOMELAND_DARK_SPEED[kind] ?? 1;
  const s = wet ? speed - 2 : speed;
  return ENEMY_BASE_SEC_PER_HEX * 5 / (s + 4);
}
function enemyStrikeMs(kind: string, wet: boolean): number {
  const speed = HOMELAND_DARK_SPEED[kind] ?? 1;
  const s = wet ? speed - 2 : speed;
  return Math.round(BATTLE_BEAT_MS * 5 / (s + 4));
}
function crowdTax(n: number): number { return n > 4 ? n / 4 : 1; }
function fateStep(level: number): number { return Math.floor(Math.max(1, level) / 3); }

/** The weather's escalation clock: how many reigns have
 *  turned since the world began counting (settings, written
 *  by getWorldMood's roll — the ONE weather clock; no second
 *  is built here). */
function weatherReignCount(): number {
  try {
    const row = sqlite.prepare("SELECT value FROM settings WHERE key = 'weather_reign_count'").get() as { value: string } | undefined;
    return row ? Number(JSON.parse(row.value)) || 0 : 0;
  } catch { return 0; }
}

type BattleStateView = { shadowMatter: number; protectionBankMs: number; lighthouseLit: boolean; waveIntensity: number };

/** The battle ledgers as the map serves them (read-only). */
async function battleStateView(ownerKey: string): Promise<BattleStateView> {
  const row = sqlite.prepare("SELECT shadow_matter AS shadow, protection_bank_ms AS bank, lighthouse_lit AS lit, wave_intensity AS intensity FROM tender_progress WHERE owner_key = ?").get(ownerKey) as any;
  if (!row) return { shadowMatter: 0, protectionBankMs: 0, lighthouseLit: false, waveIntensity: 1 };
  return {
    shadowMatter: Math.max(0, Number(row.shadow) || 0),
    protectionBankMs: Math.max(0, Number(row.bank) || 0),
    lighthouseLit: Number(row.lit) === 1,
    waveIntensity: Math.max(1, Number(row.intensity) || 1),
  };
}

/** A kill on the Tender's land pays its bounty, whoever's
 *  hand struck it (Nigel, 2026-10-23): PROTECTION minutes
 *  equal to the kind's AC bonus above 10 bank at once; the
 *  SHADOW roll (20%) pays the same number into the hoard;
 *  the energy drip pays as it always has (payFellDrip, the
 *  live 20% — one roll, the ground's element or chance's).
 *  A kill struck by an Awokin's own blow also grants that
 *  Awokin its attack event XP; the written light's kills
 *  grant none, as before. Withering deaths never reach here:
 *  the light takes its own and pays nothing.
 *  XP DIVISION (2026-10-24): when the living battle fells
 *  the dark it passes the fell's damage ledger as
 *  killerXpWeights — the attack XP pot (XP_PER_ATTACK, the
 *  felling blow's standing 10) is DIVIDED among every Awoken
 *  who damaged the dark in that fight, the slayer a mere
 *  shareholder. Callers off the battle (the written light's
 *  springs) pass no weights and keep the old road whole:
 *  the named killer alone, or none. */
async function creditBattleKill(ownerKey: string, kind: string, groundElement: string | null, killerAwakenedId: number | null, killerXpWeights?: Map<number, number>): Promise<void> {
  const bonus = enemyArmorBonus(kind);
  if (bonus > 0) {
    sqlite.prepare("UPDATE tender_progress SET protection_bank_ms = protection_bank_ms + ? WHERE owner_key = ?")
      .run(Math.round(bonus * 60000), ownerKey);
    if (Math.random() < 0.2) {
      sqlite.prepare("UPDATE tender_progress SET shadow_matter = shadow_matter + ? WHERE owner_key = ?")
        .run(bonus, ownerKey);
    }
  }
  await payFellDrip(ownerKey, groundElement);
  // THE DROP TABLE (Nigel, ruled 2026-10-23; built
  // 2026-10-25): what the felled dark leaves behind —
  // shards, goods, relics and the guaranteed reagents —
  // gathers in the Tender's pack, whoever's hand struck
  // the blow, as the rest of this bounty pays. Guarded so
  // a fault in the new ledger can never break a kill's
  // older payments or the read that settled it; the fault
  // is logged, never silent.
  try { rollFellDrops(ownerKey, kind); } catch (e) { console.error("[drops] fell drop failed:", e); }
  if (killerXpWeights) {
    await grantDividedXpPot(XP_PER_ATTACK, killerXpWeights);
  } else if (killerAwakenedId != null) {
    const scratch = new Map<number, XpGainReport>();
    await grantEventXp(scratch, killerAwakenedId, XP_PER_ATTACK);
  }
}

/** PROTECTION + THE LIGHTHOUSE, settled (Nigel, 2026-10-23,
 *  as amended 10:48): the light is OFF by default and lit
 *  only by the Tender's hand (setLighthouse). While lit, the
 *  banked minutes burn — but only across the hours he is
 *  present: the burn is reckoned between homeland reads, and
 *  a silence longer than the presence gap burns nothing
 *  (returning to the home screen pauses the timer; the
 *  banked remainder persists untouched). The light also
 *  drinks its shadow upkeep — ONE Shadow Matter per FOUR
 *  minutes lit (LIGHTHOUSE_SHADOW_UPKEEP_PER_FOUR_MINUTES,
 *  ruled by Nigel 2026-10-24); when the hoard runs dry mid-burn the
 *  light gutters out at the hour the fuel ends — the minutes
 *  it never burned stay banked. While lit: no spawning (the
 *  spawn pass reads the same flag), the standing dark is
 *  PUSHED BACK (driven off the land, no bounty — peace, not
 *  victory), and the wave intensity stands reset at 1 under
 *  the current reign. Unlit: the intensity steps up once per
 *  weather change since the reset mark. */
async function settleProtection(ownerKey: string): Promise<void> {
  const row = sqlite.prepare("SELECT shadow_matter AS shadow, protection_bank_ms AS bank, lighthouse_lit AS lit, lighthouse_settled_at AS settledAt, wave_intensity AS intensity, intensity_reign_mark AS mark FROM tender_progress WHERE owner_key = ?").get(ownerKey) as any;
  if (!row) return;
  const now = Date.now();
  const reigns = weatherReignCount();
  let shadow = Math.max(0, Number(row.shadow) || 0);
  let bank = Math.max(0, Number(row.bank) || 0);
  let lit = Number(row.lit) === 1;
  let intensity = Math.max(1, Number(row.intensity) || 1);
  let mark = row.mark == null ? null : Number(row.mark);
  if (mark === null) { mark = reigns; intensity = 1; }
  if (lit) {
    const settledAt = row.settledAt == null ? now : Number(row.settledAt);
    const gap = Math.max(0, now - settledAt);
    let burnMs = gap <= PROTECTION_ONLINE_GAP_MS ? gap : 0;
    if (burnMs > 0) {
      // The upkeep drinks first in the reckoning: the light
      // burns only while BOTH the bank and the fuel last.
      const fuelMs = LIGHTHOUSE_SHADOW_UPKEEP_PER_MINUTE > 0
        ? Math.floor((shadow / LIGHTHOUSE_SHADOW_UPKEEP_PER_MINUTE) * 60000)
        : Number.POSITIVE_INFINITY;
      const litMs = Math.min(burnMs, bank, fuelMs);
      shadow -= (litMs / 60000) * LIGHTHOUSE_SHADOW_UPKEEP_PER_MINUTE;
      bank -= litMs;
      if (litMs < burnMs) lit = false; // the bank or the fuel ran dry mid-burn
      if (bank <= 0) { bank = 0; lit = false; }
    }
    if (lit) {
      // THE PUSHBACK: while the light burns, the standing
      // waves are driven off the land — they flee; nothing
      // is killed and nothing is paid.
      // First the seed's rising, if one stands: its Fray
      // are driven off with all the standing dark, and a
      // driven-off rising is neither won nor lost (the
      // risings ride the engine, 2026-10-24) — lift its
      // standing mark here, before the pushback takes the
      // rows, and set its return by its own gap, so the
      // hold's judgement never reads the flight as a
      // clearing. Nothing is paid; the seed simply waits
      // for its rising to come again.
      const fledEv = sqlite.prepare("SELECT waves_cleared FROM first_seed_events WHERE owner_key = ? AND state = 'holding' AND rising_live = 1").get(ownerKey) as any;
      if (fledEv) {
        sqlite.prepare("UPDATE first_seed_events SET rising_live = 0, rising_stood = NULL, next_wave_at = ? WHERE owner_key = ?")
          .run(Date.now() + firstSeedWaveGapMs(Number(fledEv.waves_cleared ?? 0)), ownerKey);
      }
      sqlite.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(ownerKey);
      intensity = 1; mark = reigns;
    }
  } else {
    intensity = 1 + Math.max(0, reigns - mark);
  }
  sqlite.prepare("UPDATE tender_progress SET shadow_matter = ?, protection_bank_ms = ?, lighthouse_lit = ?, lighthouse_settled_at = ?, wave_intensity = ?, intensity_reign_mark = ? WHERE owner_key = ?")
    .run(Math.max(0, shadow), Math.max(0, Math.round(bank)), lit ? 1 : 0, now, intensity, mark, ownerKey);
}

/** THE STRIKE WITNESS (the Token Strip, Nigel 2026-10-23):
 *  the living battle's blows, kept in the weaponStrike
 *  record's own shape and extended to the placements' strikes
 *  — who struck, from where, at which dark, and what came of
 *  it — so the map can draw projectiles from the ONE real
 *  fight and never from a second simulated one. The log is a
 *  witness, not a ledger: it lives in memory, keeps only the
 *  last two minutes, and a restart simply starts it empty,
 *  exactly as an unwitnessed blow is lost. */
export type HomelandStrike = {
  id: number; kind: "placement";
  tileId: number; wandererId: number; awakenedId: number; fromTileId: number;
  fromQ: number; fromR: number; toQ: number; toR: number;
  at: number; hit: boolean; dmg: number; felled: boolean;
  /** The striker's dominant element, as the referee reckoned
   *  it for this blow (the same `dominant` that set her reach,
   *  her cadence and her on-hit rider): the map tints the
   *  shot she loosed by it, so a shot's colour and its effect
   *  always name the same element (Nigel, 2026-10-24). */
  element: string;
};
const homelandStrikeLog = new Map<string, HomelandStrike[]>();
let homelandStrikeSeq = 0;
function recordHomelandStrike(ownerKey: string, s: Omit<HomelandStrike, "id" | "kind">): void {
  const log = homelandStrikeLog.get(ownerKey) ?? [];
  log.push({ ...s, id: ++homelandStrikeSeq, kind: "placement" });
  const keep = s.at - 120000;
  homelandStrikeLog.set(ownerKey, log.filter(x => x.at >= keep).slice(-64));
}
/** The strikes the map has yet to witness, newest last. */
export function recentHomelandStrikes(ownerKey: string): HomelandStrike[] {
  const log = homelandStrikeLog.get(ownerKey) ?? [];
  const keep = Date.now() - 120000;
  return log.filter(x => x.at >= keep);
}

/** Fractional regeneration banks, per placement id — the
 *  zodiac's Awokin regen accrues over real settled time
 *  (HP per 2.8 s beat), and the fraction between whole
 *  points is carried here between settles, as the Table
 *  carries its room state in memory. A restart forgets
 *  only the unlanded fraction; no point is ever invented. */
const regenBankByPlacement = new Map<number, number>();

/** THE LIVING BATTLE, settled on the map read. One settle
 *  never reckons more than a minute of world (the wanderer
 *  watermark's own cap), walked in half-second sub-steps so
 *  movement, strikes and deaths interleave as they would
 *  lived: a figure felled mid-window strikes no more. */
async function settleHomelandBattle(ownerKey: string, tiles: any[], standTileId: number | null, woundTender: (ownerKey: string, damage: number) => Promise<void>): Promise<void> {
  const prow = sqlite.prepare("SELECT battle_watermark AS wm, lighthouse_lit AS lit FROM tender_progress WHERE owner_key = ?").get(ownerKey) as any;
  if (!prow) return;
  const now = Date.now();
  if (prow.wm == null) {
    sqlite.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(now, ownerKey);
    return;
  }
  const elapsed = Math.min(Math.max(0, now - Number(prow.wm)), 60000);
  sqlite.prepare("UPDATE tender_progress SET battle_watermark = ? WHERE owner_key = ?").run(now, ownerKey);
  const lit = Number(prow.lit) === 1;
  const byId = new Map<number, any>(tiles.map((t: any) => [t.id, t]));
  const byKey = new Map<string, any>(tiles.map((t: any) => [`${t.q},${t.r}`, t]));
  const mood = (await getWorldMood()).mood;
  const progress = await getTenderProgress(ownerKey);
  const sageCompany = progress.classKey === "sage";

  // ── The field, loaded once and carried in memory ──────
  type Dark = {
    id: number; kind: string; tileId: number; q: number; r: number; hp: number; maxHp: number;
    power: number; lvl: number; wetUntil: number; cracked: number; lastStrikeAt: number;
    pinnedBeats: number; chewTileId: number | null; chewProgress: number; brambleCarry: number; dead: boolean; killer: number | null;
    /** The Hold Rune's grip: held until this moment (0 = free). */
    heldUntil: number;
    /** The first-seed rising this Fray rode in with (0 =
     *  the open land's own dark): its fells pay the hold's
     *  numbers, not the land's bounty (fellDark, below). */
    seedRising: number;
  };
  const darks: Dark[] = (sqlite.prepare(`SELECT id, kind, tile_id AS tileId, pos_q AS posQ, pos_r AS posR, hp, power, lvl, wet_until AS wetUntil, cracked, last_strike_at AS lastStrikeAt, pinned_beats AS pinnedBeats, chew_tile_id AS chewTileId, chew_progress AS chewProgress, held_until AS heldUntil, seed_rising AS seedRising FROM homeland_wanderers WHERE owner_key = ?`).all(ownerKey) as any[]).map(w => {
    const t = byId.get(w.tileId);
    const kind = String(w.kind ?? "fray");
    const maxHp = (HOMELAND_DARK_HP[kind] ?? 3) + Math.max(0, (Number(w.lvl) || 1) - 1);
    return {
      id: Number(w.id), kind, tileId: Number(w.tileId),
      q: w.posQ == null ? (t?.q ?? 0) : Number(w.posQ), r: w.posR == null ? (t?.r ?? 0) : Number(w.posR),
      hp: w.hp == null ? maxHp : Number(w.hp), maxHp,
      power: Math.max(1, Number(w.power) || (HOMELAND_DARK_POWER[kind] ?? 1)), lvl: Math.max(1, Number(w.lvl) || 1),
      wetUntil: Number(w.wetUntil) || 0, cracked: Number(w.cracked) || 0,
      lastStrikeAt: Number(w.lastStrikeAt) || 0, pinnedBeats: Number(w.pinnedBeats) || 0,
      chewTileId: w.chewTileId == null ? null : Number(w.chewTileId), chewProgress: Number(w.chewProgress) || 0,
      brambleCarry: 0, dead: false, killer: null,
      heldUntil: Number(w.heldUntil) || 0,
      seedRising: Number(w.seedRising) || 0,
    };
  });
  type Fighter = {
    row: any; id: number; awakenedId: number; tileId: number; q: number; r: number;
    stance: string; power: number; toughness: number; level: number; dominant: string;
    /** Standing on or beside an ACTIVE watchtower's tile:
     *  her strikes carry the tower's +2 power (below). */
    towerGuard: boolean;
    elSum: Record<string, number>; rootAspects: number; partCount: number; hp: number; maxHp: number; shield: number | null; shieldMax: number | null;
    nextAt: number; marching: boolean; dead: boolean;
  };
  const placementRows = await db.select().from(schema.fieldPlacements).where(eq(schema.fieldPlacements.ownerKey, ownerKey)) as any[];
  const fighters: Fighter[] = [];
  const xpDefensePaid = new Set<number>();
  // XP DIVISION's ledger (Nigel, 2026-10-24): the damage
  // each Awoken deals each dark thing, accumulated across
  // this settlement — the fight the division weighs. Every
  // attributed blow passes hurtDark, and hurtDark alone
  // writes here; unattributed harm (the thorn's tick, the
  // tower's volley, the shard's fall) involves no Awoken and
  // buys no share. The fells divide their pots by it in
  // fellDark; the defence pots below divide by it when the
  // window closes.
  const darkDamage = new Map<number, Map<number, number>>();
  // The defence pots this window owes: a stood defence is
  // recorded when the blow lands (the standing trigger,
  // once a window a victim, seed Fray excepted as ever) but
  // PAID when the window closes, by the finished ledger —
  // until then the assault's fight is still being fought.
  const defencePots: { victimAwakenedId: number; darkId: number }[] = [];
  for (const p of placementRows) {
    const payload = await awakenedPayloadById(p.awakenedId);
    if (!payload) continue;
    const layers = (payload.layers ?? []) as { element?: string | null; power?: number }[];
    const elSum: Record<string, number> = {};
    for (const l of layers) { const el = l.element ?? "neutral"; elSum[el] = (elSum[el] ?? 0) + (l.power ?? 0); }
    let rootAspects = 0;
    const awRow = sqlite.prepare("SELECT composition_json AS comp, experience FROM awakened WHERE id = ?").get(p.awakenedId) as any;
    if (awRow?.comp) {
      try {
        const comp = JSON.parse(awRow.comp);
        const els = await compositionElements(comp);
        comp.forEach((layer: any, i: number) => {
          if (layer?.category === "aspect" && els[i] === "root") rootAspects += Number((layer as any).aspectLevel ?? 1) || 1;
        });
      } catch { /* a garbled composition counts no aspects */ }
    }
    const t = byId.get(p.tileId);
    fighters.push({
      row: p, id: Number(p.id), awakenedId: Number(p.awakenedId), tileId: Number(p.tileId),
      q: p.posQ == null ? (t?.q ?? 0) : Number(p.posQ), r: p.posR == null ? (t?.r ?? 0) : Number(p.posR),
      stance: p.stanceOrdered ? String(p.stance ?? "defense") : "attack", // NO ORDERS DEFAULTS TO ATTACK (Nigel, 2026-10-23)
      towerGuard: false, // stamped once the towers are loaded, below
      power: payload.power ?? 0, toughness: payload.toughness ?? 1,
      level: Math.max(1, awokenLevelOf(Number(awRow?.experience ?? 0))),
      dominant: homelandPlacementElement(layers as any[]), elSum, rootAspects, partCount: Math.max(1, layers.length),
      hp: p.hp == null ? Math.max(1, payload.toughness ?? 1) : Number(p.hp), maxHp: Math.max(1, payload.toughness ?? 1),
      shield: p.shield == null ? null : Number(p.shield), shieldMax: p.shieldMax == null ? null : Number(p.shieldMax),
      nextAt: p.battleNextAt == null ? 0 : Number(p.battleNextAt),
      marching: !!(p.marchPath && p.marchEnds != null && Number(p.marchEnds) > now) || !!p.patrolPath,
      dead: false,
    });
  }
  // ── THE ZODIAC ON THIS GROUND (Recovery #1, "wire and
  // fix"): the map owner's clause sums, read once per
  // settle and ridden by every strike reckoning below —
  // his Tender AC and attack bonus, his Awokin's AC and
  // attack bonus, the lowered critical threshold and its
  // deepened damage, and the regeneration that knits his
  // standing figures over the settled window (HP per
  // 2.8 s beat, the Table's own rhythm, accrued
  // fractionally per figure until a whole point lands).
  const zTenderAc = fxSum(ownerKey, "tenderAc");
  const zAwokinAc = fxSum(ownerKey, "awokinAc");
  const zAwokinAb = fxSum(ownerKey, "awokinAb");
  const zCritAt = 20 - fxSum(ownerKey, "critChance");
  const zCritHalf = fxSum(ownerKey, "critDamage");
  const zRegen = fxSum(ownerKey, "awokinRegen");
  if (zRegen > 0 && elapsed > 0) {
    const alive = new Set<number>();
    for (const f of fighters) {
      if (f.dead) continue;
      alive.add(f.id);
      if (f.hp >= f.maxHp) { regenBankByPlacement.delete(f.id); continue; }
      const bank = (regenBankByPlacement.get(f.id) ?? 0) + (zRegen * elapsed) / BATTLE_BEAT_MS;
      const whole = Math.floor(bank);
      regenBankByPlacement.set(f.id, bank - whole);
      if (whole > 0) {
        const healed = await mendPlacement(f.id, whole);
        f.hp += healed;
        f.row.hp = f.hp;
      }
    }
    for (const id of [...regenBankByPlacement.keys()]) if (!alive.has(id)) regenBankByPlacement.delete(id);
  }
  const crowdOf = (tileId: number): number => {
    let n = 0;
    for (const f of fighters) if (!f.dead && f.tileId === tileId) n++;
    for (const d of darks) if (!d.dead && d.tileId === tileId) n++;
    return n;
  };
  // The border wards (the Seal, the Trees) still turn a blow
  // aimed across their line — loaded once, written back at
  // the end, as the old walk carried them. A ward stands in
  // one of two shapes (the T, Nigel 2026-10-24): by its
  // crossbar, for casts since the T (its geometry in its
  // numbers), or by its EDGE, for the casts that stood
  // before it — each read by its own shape below.
  const wardByEdge = new Map<string, any>();
  const wardLines: any[] = [];
  const borderWards: any[] = [];
  let mapBright = false;
  for (const w of sqlite.prepare("SELECT id, engine, edge_key AS edgeKey, nums, hp, max_hp AS maxHp, stops FROM territory_workings WHERE owner_key = ? AND kind = 'ward'").all(ownerKey) as any[]) {
    if (w.engine === "engine") mapBright = true;
    if ((w.engine === "seal" || w.engine === "trees") && (w.hp ?? 0) > 0) {
      try { w.nums = JSON.parse(w.nums ?? "{}"); } catch { w.nums = {}; }
      if (typeof w.nums.linePx === "number") { wardLines.push(w); borderWards.push(w); }
      else if (w.edgeKey) { wardByEdge.set(w.edgeKey, w); borderWards.push(w); }
    }
  }
  // ── THE THORNS, RE-HOMED (the Token Strip, Nigel
  // 2026-10-23): the edge-Thorns' skip cost and the Thorn
  // Wall building's bite lived ONLY in the retired battle
  // mirror (thornsDragUnit's held tick; the thorn-wall
  // tiles' entry damage in both of the mirror's tellings).
  // They stand in the one real fight now. Edge thorns
  // (hex_walls, kind 'thorns') touch their edge's two hexes;
  // a dark whose own walk carries it onto a thorned hex is
  // held one battle beat — it neither walks nor strikes for
  // that beat, the mirror's lost action in this engine's
  // measure. A Thorn Wall building bites a dark that enters
  // its hex for the building's own damage.
  const thornTiles = new Set<number>();
  for (const w of sqlite.prepare("SELECT q, r, dir FROM hex_walls WHERE owner_key = ? AND kind = 'thorns'").all(ownerKey) as any[]) {
    const a = byKey.get(`${w.q},${w.r}`);
    if (a) thornTiles.add(a.id);
    const d = WALL_DIRS[Number(w.dir) || 0];
    if (d) { const b = byKey.get(`${w.q + d[0]},${w.r + d[1]}`); if (b) thornTiles.add(b.id); }
  }
  const thornWallBites = new Map<number, number>();
  {
    const cfg = await loadGameConfig().catch(() => null) as any;
    const bite = Number(cfg?.buildings?.["thorn-wall"]?.damage ?? 1) || 1;
    for (const b of sqlite.prepare("SELECT tile_id AS tileId FROM territory_buildings WHERE owner_key = ? AND building_type = 'thorn-wall' AND status = 'active'").all(ownerKey) as any[]) {
      thornWallBites.set(Number(b.tileId), bite);
    }
  }
  // ── THE WATCHTOWERS TAKE THE FIELD (Nigel, 2026-10-24) ──
  // An ACTIVE watchtower (its row stands 'active' — the
  // upkeep paid, not dormant) fights in this battle: its
  // +2 power in the strike reckoning of the Awoken standing
  // on or beside its tile (the footprint the heal paths
  // already keep — hexDist of tiles <= 1), and its 8-second
  // volley in the step loop below. Its numbers are the
  // configured ones (building.watchtower.damage / .powerBonus).
  type Tower = { id: number; tileId: number; q: number; r: number };
  const towers: Tower[] = [];
  let towerDamage = 3, towerPowerBonus = 2;
  {
    const cfg = await loadGameConfig().catch(() => null) as any;
    towerDamage = Number(cfg?.buildings?.["watchtower"]?.damage ?? 3) || 3;
    towerPowerBonus = Number(cfg?.buildings?.["watchtower"]?.powerBonus ?? 2) || 2;
    for (const b of sqlite.prepare("SELECT id, tile_id AS tileId FROM territory_buildings WHERE owner_key = ? AND building_type = 'watchtower' AND status = 'active'").all(ownerKey) as any[]) {
      const t = byId.get(Number(b.tileId));
      if (t) towers.push({ id: Number(b.id), tileId: Number(b.tileId), q: t.q, r: t.r });
    }
  }
  if (towers.length) {
    for (const f of fighters) {
      const fTile = byId.get(f.tileId);
      if (fTile) f.towerGuard = towers.some(t => hexDistTiles(fTile, t) <= 1);
    }
  }
  // Defence works: raised by Root and Stone defenders.
  // A bramble MOTE stands in the same list as its work's
  // nodes, flagged (mote: 1) and carrying its parent
  // node's point (pq/pr), its BIRTH MOMENT (born — the
  // settle's clock at its growing, so its self-growth is
  // served, not guessed) and its WATERING BANK (bank —
  // the damage watered into it toward its next spread)
  // — WATERING's bookkeeping; every other work's nodes
  // carry none of these fields.
  type WorkNode = { q: number; r: number; hp: number; maxHp: number; mote?: number; pq?: number; pr?: number; born?: number; bank?: number };
  type DWork = { id: number; placementId: number; kind: string; nodes: WorkNode[]; dirty: boolean; gone: boolean };
  const works: DWork[] = (sqlite.prepare("SELECT id, placement_id AS placementId, kind, nodes FROM defence_works WHERE owner_key = ?").all(ownerKey) as any[]).map(w => {
    let nodes: WorkNode[] = [];
    try { nodes = JSON.parse(w.nodes ?? "[]"); } catch { nodes = []; }
    return { id: Number(w.id), placementId: Number(w.placementId), kind: String(w.kind), nodes, dirty: false, gone: false };
  });
  // A mote raised before the growth law carries no
  // birth moment: it is born at the first settle that
  // reads it under the new law, its bank empty, and the
  // stamping is written back with the work, so the
  // served age the map reads is the engine's own from
  // here on — never a client's guess.
  for (const w of works) {
    if (w.kind !== "bramble") continue;
    for (const n of w.nodes) {
      if (!n.mote) continue;
      if (typeof n.born !== "number") { n.born = now; w.dirty = true; }
      if (typeof n.bank !== "number") { n.bank = 0; w.dirty = true; }
    }
  }
  const raiseWork = (f: Fighter): void => {
    // The nearest dark sets her facing; the work stands a
    // hex ahead of her, turned with her (the PG's law).
    let near: Dark | null = null; let nearD = Infinity;
    for (const d of darks) { if (d.dead) continue; const dd = axialDist(f, d); if (dd < nearD) { nearD = dd; near = d; } }
    if (!near || nearD > (HOMELAND_ELEMENT_REACH[f.dominant] ?? 1) + DEFENCE_WORK_ENGAGE) return;
    const len = Math.hypot(near.q - f.q, near.r - f.r) || 1;
    const fx = (near.q - f.q) / len, fr = (near.r - f.r) / len;
    const px = -fr, pr = fx; // the line runs along her facing's perpendicular
    const nodes: WorkNode[] = [];
    if (f.dominant === "stone") {
      const count = Math.min(6, 3 + Math.floor(f.level / 3));
      const rockHp = rockWallHpForLevel(f.level);
      for (let i = 0; i < count; i++) {
        const off = (i - (count - 1) / 2) * 0.55;
        nodes.push({ q: f.q + fx * 1.0 + px * off, r: f.r + fr * 1.0 + pr * off, hp: rockHp, maxHp: rockHp });
      }
      const info = sqlite.prepare("INSERT INTO defence_works (owner_key, placement_id, kind, anchor_q, anchor_r, nodes, created_at) VALUES (?, ?, 'rockwall', ?, ?, ?, ?)").run(ownerKey, f.id, f.q, f.r, JSON.stringify(nodes), now);
      works.push({ id: Number(info.lastInsertRowid), placementId: f.id, kind: "rockwall", nodes, dirty: false, gone: false });
    } else if (f.dominant === "root") {
      // The thicket's spread is her body: one node per part.
      const nodeHp = f.maxHp;
      for (let i = 0; i < f.partCount; i++) {
        const off = (i - (f.partCount - 1) / 2) * 0.55;
        nodes.push({ q: f.q + fx * 0.8 + px * off, r: f.r + fr * 0.8 + pr * off, hp: nodeHp, maxHp: nodeHp });
      }
      // WATERING's ground (Nigel, 2026-10-24): each node
      // bears its motes at its fringe from the raise —
      // young growths of the same work, in the same list,
      // each carrying the node's own measure for its body
      // and remembering its parent node's point, so a
      // watering's creep can step outward from the parent.
      const raised = [...nodes];
      for (let i = 0; i < raised.length; i++) {
        const nd = raised[i];
        for (let k = 0; k < BRAMBLE_MOTES_PER_NODE; k++) {
          const ang = (k / BRAMBLE_MOTES_PER_NODE) * Math.PI * 2 + i * 0.9;
          // Born with the raise, at the settle's own
          // moment, its bank empty — the mote grows on
          // its own from here (the refinement, above).
          nodes.push({ q: nd.q + Math.cos(ang) * BRAMBLE_MOTE_FRINGE, r: nd.r + Math.sin(ang) * BRAMBLE_MOTE_FRINGE, hp: nodeHp, maxHp: nodeHp, mote: 1, pq: nd.q, pr: nd.r, born: now, bank: 0 });
        }
      }
      const info = sqlite.prepare("INSERT INTO defence_works (owner_key, placement_id, kind, anchor_q, anchor_r, nodes, created_at) VALUES (?, ?, 'bramble', ?, ?, ?, ?)").run(ownerKey, f.id, f.q, f.r, JSON.stringify(nodes), now);
      works.push({ id: Number(info.lastInsertRowid), placementId: f.id, kind: "bramble", nodes, dirty: false, gone: false });
    }
  };
  // Works stand while she defends; a changed stance or a
  // fallen figure takes hers down. Defenders without a work
  // and with the dark near raise theirs.
  // BULWARK (Recovery R12) stands apart from this law: its
  // shields are a ward the Tender cast (their row's
  // placement_id is 0 — no figure raises or sustains them),
  // and they stand by the working's own life — their HP
  // alone, reckoned in the strike pass below — never by a
  // figure's Defence stance. THE BLACK GATE (Recovery
  // R13) stands apart the same way, for the same reason:
  // its row's placement_id is 0 and its wall stands by
  // its HP alone.
  for (const w of works) {
    if (w.kind === "bulwark" || w.kind === "blackgate") continue;
    const f = fighters.find(x => x.id === w.placementId);
    if (!f || f.dead || f.stance !== "defense") w.gone = true;
  }
  for (const f of fighters) {
    if (f.dead || f.marching || f.stance !== "defense") continue;
    if (!works.some(w => w.placementId === f.id && !w.gone)) raiseWork(f);
  }

  const fellDark = async (d: Dark): Promise<void> => {
    if (d.dead) return;
    d.dead = true;
    // THE RISING'S FELL PAY (the risings ride the engine,
    // 2026-10-24): a Fray of the first seed's rising pays
    // the HOLD'S numbers, not the open land's bounty —
    // +3✦ to its Tender, capped, for the fell (the old
    // referee's arithmetic, made per fell here); a +2 XP
    // pot for the fell — paid to the slayer alone before XP
    // DIVISION (Nigel, 2026-10-24), now DIVIDED among every
    // Awoken who damaged this Fray in the fight, the slayer
    // a shareholder like any other; and the fell drizzle,
    // lit at random as the hold's Fray always lit
    // (payFellDrip with no ground named). No protection
    // banks and no Shadow rolls on the seed's ground: the
    // hold's skeleton of numbers stands untouched, and
    // creditBattleKill below remains the open land's law.
    if (d.seedRising > 0) {
      const maxEnergy = await calculateMaxEnergy(ownerKey);
      const current = await getEnergyFor(ownerKey);
      const next = Math.min(current + 3, maxEnergy);
      if (next !== current) {
        await db.update(schema.tenderResources)
          .set({ energy: next, updatedAt: new Date() })
          .where(eq(schema.tenderResources.ownerKey, ownerKey));
      }
      await payFellDrip(ownerKey);
      await grantDividedXpPot(2, darkDamage.get(d.id) ?? new Map());
      return;
    }
    const t = byId.get(d.tileId);
    await creditBattleKill(ownerKey, d.kind, t?.element ?? null, d.killer, darkDamage.get(d.id) ?? new Map());
    // SWALLOW THE HEART (the zodiac's HP-on-kill star;
    // Recovery #1): a kill one of his Awokin had a hand
    // in (the killer stands named on the body) returns
    // the holder's sum to the Tender and to every one of
    // his standing Awokin — the star's own words, "the
    // tender and the tender's Awokin". Kills the light
    // itself makes (attrition, the lighthouse) name no
    // killer and pay nothing here.
    if (d.killer != null) {
      const amt = fxSum(ownerKey, "hpOnKill");
      if (amt > 0) {
        const trow = sqlite.prepare("SELECT hp FROM tender_progress WHERE owner_key = ?").get(ownerKey) as any;
        if (trow && trow.hp != null && Number(trow.hp) > 0 && Number(trow.hp) < progress.maxTenderHp) {
          sqlite.prepare("UPDATE tender_progress SET hp = ? WHERE owner_key = ?")
            .run(Math.min(progress.maxTenderHp, Number(trow.hp) + amt), ownerKey);
        }
        for (const f of fighters) {
          if (f.dead || f.hp >= f.maxHp) continue;
          const healed = await mendPlacement(f.id, amt);
          f.hp += healed;
          f.row.hp = f.hp;
        }
      }
    }
  };
  // THE CROWN SHARD IN THE LIVING BATTLE (Nigel, 2026-10-23
  // — Recovery R5): the same reckoning springHomelandWorking
  // keeps for the written ground, read against the battle's
  // own dark as they walk — a dark that crosses a Shard's
  // hex mid-window falls under it in the step it stands
  // there, not only at the window's end. The measure is
  // the Table's, whole: it waits for a foe standing on its
  // ground (its free point's cell) of power minPower or
  // more (5 on the page, the Lowered Crown's 4 in the
  // cast's stored numbers), then falls on the whole hex —
  // every such foe takes the greatest standing power ×
  // the book's multiplier (2) + the cast's attunement
  // slots (the working's pour, at face value). Falling
  // Light widens the measure and the fall one ring, as at
  // the Table. The fall spends the working whole (its row
  // is lifted at once, so the written-ground settle that
  // follows this pass cannot fall it twice), every fell
  // pays through fellDark as any battle fell pays, and on
  // cursed ground the fall grinds the curse with the same
  // harm, as the written ground's own spring grinds it.
  type ShardWork = { id: number; tileId: number; q: number; r: number; minPower: number; multiplier: number; pour: number; hue: string; spent: boolean };
  const shardWorks: ShardWork[] = (sqlite.prepare("SELECT id, tile_id AS tileId, nums, pour, hue FROM territory_workings WHERE owner_key = ? AND engine = 'shard' AND kind IN ('rune', 'spell')").all(ownerKey) as any[])
    .flatMap((w: any) => {
      const t = byId.get(Number(w.tileId));
      if (!t) return [];
      let n: Record<string, number> = {};
      try { n = JSON.parse(w.nums ?? "{}"); } catch { n = {}; }
      return [{ id: Number(w.id), tileId: Number(w.tileId), q: t.q, r: t.r, minPower: n.minPower ?? 5, multiplier: n.multiplier ?? 2, pour: Number(w.pour ?? 0), hue: String(w.hue ?? "unaligned"), spent: false }];
    });
  const shardReach = workingEffects(ownerKey).fallingLight ? 1 : 0;
  const springShardsInBattle = async (): Promise<void> => {
    for (const s of shardWorks) {
      if (s.spent) continue;
      const foes = darks.filter(d => !d.dead && axialDist(axialRound(d.q, d.r), s) <= shardReach);
      if (!foes.length) continue;
      const greatest = Math.max(...foes.map(d => d.power));
      if (greatest < s.minPower) continue;
      const dmg = greatest * s.multiplier + s.pour;
      s.spent = true;
      sqlite.prepare("DELETE FROM territory_workings WHERE id = ?").run(s.id);
      for (const d of foes) await hurtDark(d, dmg, null);
      const t = byId.get(s.tileId);
      if (t?.cursed) await grindHomelandCurse(ownerKey, t, dmg, s.hue);
    }
  };
  const hurtDark = async (d: Dark, dmg: number, byAwakenedId: number | null): Promise<void> => {
    if (d.dead || dmg <= 0) return;
    d.hp -= dmg;
    if (byAwakenedId != null) {
      d.killer = byAwakenedId;
      // XP DIVISION's ledger: the blow's full figure —
      // overkill included, the same number the strike
      // witness reports — stands to this hand's involvement
      // in this dark's fight.
      let ledger = darkDamage.get(d.id);
      if (!ledger) { ledger = new Map(); darkDamage.set(d.id, ledger); }
      ledger.set(byAwakenedId, (ledger.get(byAwakenedId) ?? 0) + dmg);
    }
    if (d.hp <= 0) await fellDark(d);
  };
  /** THE TIDE RIDER (the Proving Ground's ruling): her
   *  strikes leave what they land on WET — on a dark
   *  thing, Wet stands for WET_MS (its pace drops on the
   *  Table's scale and Sky strikes land +2 on it, both
   *  read where the dark is read). WATERING (Nigel,
   *  2026-10-24) is this same Wet landing on bramble —
   *  "its the positive effect of wet": waterMote below
   *  is the rider's other face, kept beside it so the
   *  code itself says the one Wet has two landings. */
  const tideWetOnDark = (d: Dark, at: number): void => { d.wetUntil = at + WET_MS; };
  /** WATERING's meter (Nigel, 2026-10-24, refined
   *  19:23 — "causes the mote to spread another mote
   *  every 10 dmg"): a Tide strike landing on a mote
   *  pours its harm into the mote's BANK, and the bank
   *  — not the strike — grows the work: at every
   *  BRAMBLE_MOTE_SPREAD_COST banked, the mote spreads
   *  exactly one new mote, one spread step beyond it on
   *  its parent ray, and a fat strike spreads in a
   *  chain, each newborn the next step's foot. THE
   *  FIGURE BANKED, named: her strike's RAW ROLLED
   *  HARM — the sum a landed blow starts from (each
   *  part's fate die + its power, the banners' flat
   *  lendings for the ground she and the mote stand
   *  on, the tower's +2 where she stands guarded) —
   *  rolled as a fighting strike rolls it, but with no
   *  d20 and no crit: no hit roll is made against a
   *  mote, as ever, and the whole figure banks because
   *  a mote has no AC for homelandFateMitigate to read.
   *  At the work's cap the damage still banks and
   *  spreads nothing; banked damage spreads when room
   *  returns and a later strike lands. A spread step
   *  that would land off the ground grows nothing and
   *  spends nothing — the bank keeps its measure. The
   *  nearest living mote in her reach is the one she
   *  tends; a newborn is born at the strike's own
   *  moment, its bank empty, and grows on its own. */
  const waterMote = async (f: Fighter, reach: number, at: number): Promise<void> => {
    let bestW: DWork | null = null; let bestMote: WorkNode | null = null; let bestD = Infinity;
    for (const w of works) {
      if (w.gone || w.kind !== "bramble") continue;
      for (const n of w.nodes) {
        if (!n.mote || n.hp <= 0) continue;
        const dd = axialDist(f, n);
        if (dd <= reach && dd < bestD) { bestD = dd; bestW = w; bestMote = n; }
      }
    }
    if (!bestW || !bestMote) return;
    const payload = await awakenedPayloadById(f.awakenedId);
    const layers = (payload?.layers ?? []) as { element?: string | null; power?: number }[];
    let raw = 0;
    for (const l of layers) raw += homelandDN(HOMELAND_FATE_DIE[l.element ?? "neutral"] ?? 6) + (l.power ?? 0);
    const banner = homelandBannerBonus(ownerKey, axialRound(f.q, f.r), axialRound(bestMote.q, bestMote.r));
    raw += banner.std + banner.bcn;
    if (f.towerGuard) raw += towerPowerBonus;
    bestMote.bank = (bestMote.bank ?? 0) + raw;
    bestW.dirty = true;
    // One spread step beyond a mote, on its parent ray.
    // The newborn stands on the land or not at all.
    const spreadFrom = (base: WorkNode): WorkNode | null => {
      const pq = base.pq ?? base.q, pr = base.pr ?? base.r;
      let ux = base.q - pq, ur = base.r - pr;
      const len = Math.hypot(ux, ur);
      if (len < 1e-6) {
        // A mote standing on its parent's own point has
        // no outward of its own: the step reads from
        // her hand.
        ux = base.q - f.q; ur = base.r - f.r;
        const l2 = Math.hypot(ux, ur) || 1; ux /= l2; ur /= l2;
      } else { ux /= len; ur /= len; }
      const nq = base.q + ux * BRAMBLE_MOTE_SPREAD_STEP, nr = base.r + ur * BRAMBLE_MOTE_SPREAD_STEP;
      const cell = axialRound(nq, nr);
      if (!byKey.has(`${cell.q},${cell.r}`)) return null;
      const born: WorkNode = { q: nq, r: nr, hp: base.maxHp, maxHp: base.maxHp, mote: 1, pq, pr, born: at, bank: 0 };
      bestW!.nodes.push(born);
      return born;
    };
    let base = bestMote;
    while ((bestMote.bank ?? 0) >= BRAMBLE_MOTE_SPREAD_COST
      && bestW.nodes.filter(n => n.mote && n.hp > 0).length < BRAMBLE_MOTE_CAP) {
      const grown = spreadFrom(base);
      if (!grown) break; // off the land: nothing grows, nothing is spent
      bestMote.bank = (bestMote.bank ?? 0) - BRAMBLE_MOTE_SPREAD_COST;
      base = grown;
    }
  };

  // THE CONSTRUCTION'S WALLS (the Hex Building System, slice 1):
  // the standing build walls' collision segments, loaded once
  // for the whole settle — the walk below collides against the
  // footprints themselves, never against hex occupancy.
  const buildSegs = buildWallSegments(ownerKey);

  const STEP_MS = 500;
  const steps = Math.max(0, Math.ceil(elapsed / STEP_MS));
  const windowStart = now - elapsed;
  for (let s = 0; s < steps; s++) {
    const tNow = windowStart + (s + 1) * STEP_MS;
    const dt = Math.min(STEP_MS, elapsed - s * STEP_MS) / 1000;
    if (dt <= 0) break;
    // ── THE WALK ────────────────────────────────────────
    for (const d of darks) {
      if (d.dead || lit) continue;
      if (d.pinnedBeats > 0 || tNow < d.heldUntil) continue; // a Lattice's hold, or the Hold Rune's: it neither wanders nor chews
      const wet = tNow < d.wetUntil;
      let pace = 1 / enemySecPerHex(d.kind, wet); // axial units per second
      pace /= crowdTax(crowdOf(d.tileId));
      // Bramble underfoot halves the pace that pushes
      // through it. WATERING's motes stand in the same
      // node list (Nigel, 2026-10-24): a mote's ground
      // hinders exactly as a node's — this same check,
      // this same half pace and thorn tick, no new
      // numbers for the young growth.
      let inBramble = false;
      for (const w of works) {
        if (w.gone || w.kind !== "bramble") continue;
        if (w.nodes.some(n => n.hp > 0 && axialDist(d, n) <= 0.6)) { inBramble = true; break; }
      }
      if (inBramble) {
        pace *= 0.5;
        d.brambleCarry += dt;
        if (d.brambleCarry >= BATTLE_BEAT_MS / 1000) { d.brambleCarry -= BATTLE_BEAT_MS / 1000; await hurtDark(d, 1, null); if (d.dead) continue; }
      }
      // The goal: the nearest standing Awokin; failing any,
      // the nearest pure tile to worry; failing both, a blind
      // drift on its own dark, as the Fray has always wandered.
      let goal: { q: number; r: number } | null = null; let holdAt = 0;
      let nearF: Fighter | null = null; let nearFD = Infinity;
      for (const f of fighters) { if (f.dead) continue; const dd = axialDist(d, f); if (dd < nearFD) { nearFD = dd; nearF = f; } }
      if (nearF) { goal = { q: nearF.q, r: nearF.r }; holdAt = ENEMY_BITE_REACH; }
      else {
        let nearT: any = null; let nearTD = Infinity;
        for (const t of tiles as any[]) { if (t.cursed) continue; const dd = axialDist(d, t); if (dd < nearTD) { nearTD = dd; nearT = t; } }
        if (nearT) { goal = { q: nearT.q, r: nearT.r }; holdAt = ENEMY_BITE_REACH; }
      }
      if (!goal) {
        const here = byId.get(d.tileId);
        if (here?.cursed) {
          const nbrs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]
            .map(([dq, dr]) => byKey.get(`${here.q + dq},${here.r + dr}`)).filter((n: any) => n?.cursed);
          if (nbrs.length) { const dest: any = nbrs[Math.floor(Math.random() * nbrs.length)]; goal = { q: dest.q, r: dest.r }; holdAt = 0; }
        }
      }
      if (!goal) continue;
      const dist = axialDist(d, goal);
      const travel = Math.min(pace * dt, Math.max(0, dist - holdAt));
      if (travel <= 0) continue;
      const ux = (goal.q - d.q) / (dist || 1), ur = (goal.r - d.r) / (dist || 1);
      const nq = d.q + ux * travel, nr = d.r + ur * travel;
      // A standing rock blocks the step outright (the PG's
      // law): the dark halts at the line and hacks instead.
      // A Bulwark shield blocks the same way (Recovery R12:
      // the line is raised in the Rock Wall's working
      // fashion) — a fallen shield (hp 0) blocks nothing:
      // the line opens where it fell. THE BLACK GATE
      // blocks ABSOLUTELY (Recovery R13: "IMPASSABLE
      // WALL") — the same step is refused while any of
      // the Gate stands (its one node at hp > 0), onto
      // its ground or through it, and the ground opens
      // only when the Gate falls at 0 HP. IMPASSABLE TO
      // WHOM: the dark, in this walk reckoning — the
      // light's marches and the Tender's stride are not
      // reckoned here and are not blocked by the Gate.
      let blocked = false;
      for (const w of works) {
        if (w.gone || (w.kind !== "rockwall" && w.kind !== "bulwark" && w.kind !== "blackgate")) continue;
        if (w.nodes.some(n => n.hp > 0 && axialDist({ q: nq, r: nr }, n) <= 0.55)) { blocked = true; break; }
      }
      if (blocked) continue;
      // A build wall bars the step the same way (the Hex
      // Building System): the dark's path is a segment on the
      // land, and the wall is a segment on the land — where
      // they cross, the step is not taken. A door's open
      // middle is no segment at all, so a step threaded
      // through the gap walks through, as it should.
      if (buildSegs.length && buildSegs.some(([a, b]) =>
        segmentsCrossProper([d.q, d.r], [nq, nr], a, b))) continue;
      const cell = axialRound(nq, nr);
      if (!byKey.has(`${cell.q},${cell.r}`)) continue; // no ground there: the step is not taken
      d.q = nq; d.r = nr;
      const nt = byKey.get(`${cell.q},${cell.r}`);
      if (nt && nt.id !== d.tileId) {
        d.tileId = nt.id; d.chewTileId = null; d.chewProgress = 0;
        // THE THORNS ANSWER AN ENTRY (re-homed, above): the
        // skip cost and the Thorn Wall's bite fire on the
        // dark's own entry onto the ground, as they fired on
        // entry in the mirror — entries by shove (Bulwark's,
        // Sky's) are not the dark's own crossing and spring
        // neither.
        if (thornTiles.has(nt.id)) d.heldUntil = Math.max(d.heldUntil, tNow + BATTLE_BEAT_MS);
        const bite = thornWallBites.get(nt.id);
        if (bite) await hurtDark(d, bite, null);
      }
    }
    // ── THE CROWN SHARD FALLS ───────────────────────────
    // The written Shards reckon the ground the walk has
    // just dealt, before the dark strike back (Recovery
    // R5): a Shard whose measure is met falls in this
    // step, and what it fells strikes no more.
    await springShardsInBattle();
    // ── THE WATCHTOWERS VOLLEY (Nigel, 2026-10-24) ──────
    // Each tower banks this step's battle time toward its
    // 8-second beat; a full beat looses the tower's damage
    // at the NEAREST dark standing on or beside its tile
    // (the dark's own standing cell within one hex of the
    // tower's heart). The beat is spent whether or not a
    // foe stands in the guard — an empty beat is not
    // banked, as the weapon referee's cadence is spent
    // with no prey. The fell, when it comes, pays through
    // hurtDark/fellDark with no slayer in the record.
    if (towers.length) {
      for (const t of towers) {
        const key = `${ownerKey}:${t.id}`;
        let carry = (towerVolleyCarry.get(key) ?? 0) + dt * 1000;
        while (carry >= TOWER_VOLLEY_MS) {
          carry -= TOWER_VOLLEY_MS;
          let prey: Dark | null = null; let preyD = Infinity;
          for (const d of darks) {
            if (d.dead) continue;
            if (axialDist(axialRound(d.q, d.r), t) > 1) continue;
            const dd = axialDist(d, t);
            if (dd < preyD) { preyD = dd; prey = d; }
          }
          if (prey) await hurtDark(prey, towerDamage, null);
        }
        towerVolleyCarry.set(key, carry);
      }
    }
    // ── THE DARK STRIKES ────────────────────────────────
    for (const d of darks) {
      if (d.dead || lit) continue;
      if (d.pinnedBeats > 0 || tNow < d.heldUntil) continue;
      const wet = tNow < d.wetUntil;
      const interval = enemyStrikeMs(d.kind, wet) * crowdTax(crowdOf(d.tileId));
      if (d.lastStrikeAt === 0) { d.lastStrikeAt = tNow; continue; }
      if (tNow < d.lastStrikeAt + interval) continue;
      d.lastStrikeAt += interval * Math.max(1, Math.floor((tNow - d.lastStrikeAt) / interval));
      // BULWARK (Recovery R12): a shield in its face is hit
      // the way a rock is hacked — the shield takes the
      // blow's hack measure (WALL_HACK_DMG, the line's own
      // fashion) and falls at 0 HP — and the hit SHOVES THE
      // STRIKER BACK one tile: the ruling's own words, "it
      // KNOCKS BACK enemies that hit it". The shove's
      // measure is ONE TILE along the line from the shield
      // to the striker, landed with the Sky strike's own
      // fallback (the full step where ground stands, half
      // the step where only nearer ground stands, no shove
      // where no ground stands at all). The shove deals no
      // harm of its own — no AC is reckoned here, for the
      // shield rolls against nothing and nothing rolls
      // against the shield: the hack branch has never
      // rolled, and this build invents no AC for a shield.
      // (The dropped enemy ACs — enemyACFor: Fray 11,
      // Hollow 12, Unraveler 13, Tangle 15 — stand untouched
      // in every roll that does read them, below and in the
      // Awoken's answer; no pre-drop figure enters here.)
      let shoved = false;
      for (const w of works) {
        if (w.gone || w.kind !== "bulwark") continue;
        const node = w.nodes.find(n => n.hp > 0 && axialDist(d, n) <= 0.75);
        if (!node) continue;
        node.hp -= WALL_HACK_DMG; w.dirty = true; shoved = true;
        const len = Math.hypot(d.q - node.q, d.r - node.r) || 1;
        const ux = (d.q - node.q) / len, ur = (d.r - node.r) / len;
        let nq = d.q + ux * 1, nr = d.r + ur * 1;
        let cell = axialRound(nq, nr);
        if (!byKey.has(`${cell.q},${cell.r}`)) { nq = d.q + ux * 0.5; nr = d.r + ur * 0.5; cell = axialRound(nq, nr); }
        if (byKey.has(`${cell.q},${cell.r}`)) {
          d.q = nq; d.r = nr;
          const nt = byKey.get(`${cell.q},${cell.r}`);
          if (nt && nt.id !== d.tileId) { d.tileId = nt.id; d.chewTileId = null; d.chewProgress = 0; }
        }
        break;
      }
      if (shoved) continue;
      // THE BLACK GATE (Recovery R13): a Gate in its face
      // is struck the way a rock is hacked — WALL_HACK_DMG
      // through this same fashion, no roll, no AC invented
      // for it (the dropped enemy ACs stand untouched in
      // every roll that reads them) — and it falls at
      // 0 HP, where the walk above opens. Unlike Bulwark
      // the Gate answers with NO shove: impassable is its
      // whole office; knockback is Bulwark's own ruling,
      // not the Gate's.
      let gateHacked = false;
      for (const w of works) {
        if (w.gone || w.kind !== "blackgate") continue;
        const node = w.nodes.find(n => n.hp > 0 && axialDist(d, n) <= 0.75);
        if (node) { node.hp -= WALL_HACK_DMG; w.dirty = true; gateHacked = true; break; }
      }
      if (gateHacked) continue;
      // A rock in its face is hacked (WALL_HACK_DMG, the PG's pencil).
      let hacked = false;
      for (const w of works) {
        if (w.gone || w.kind !== "rockwall") continue;
        const node = w.nodes.find(n => n.hp > 0 && axialDist(d, n) <= 0.75);
        if (node) { node.hp -= WALL_HACK_DMG; w.dirty = true; hacked = true; break; }
      }
      if (hacked) continue;
      // A bramble MOTE in its face is hacked down like a
      // node of the walls (WATERING, Nigel 2026-10-24):
      // the same hack measure at the same reach. The
      // thicket's true nodes keep their standing fate —
      // they stand while their defender stands, as they
      // always have — the young growth is what the dark
      // can cut, and a cut mote hinders no more.
      let moteHacked = false;
      for (const w of works) {
        if (w.gone || w.kind !== "bramble") continue;
        const node = w.nodes.find(n => n.hp > 0 && n.mote && axialDist(d, n) <= 0.75);
        if (node) { node.hp -= WALL_HACK_DMG; w.dirty = true; moteHacked = true; break; }
      }
      if (moteHacked) continue;
      // Victims in bite reach, chosen by its kind's hunger
      // (the Table's own: the Fray worries the weakest, the
      // Unraveler hunts the strongest).
      const inReach = fighters.filter(f => !f.dead && axialDist(d, f) <= ENEMY_BITE_REACH);
      if (inReach.length) {
        let victim = inReach[0];
        if (d.kind === "fray") victim = inReach.reduce((a, b) => (b.hp < a.hp ? b : a));
        else if (d.kind === "unraveler") victim = inReach.reduce((a, b) => (b.power > a.power ? b : a));
        else victim = inReach.reduce((a, b) => (axialDist(d, b) < axialDist(d, a) ? b : a));
        const roll = homelandDN(20);
        // THE VICTIM'S AC, one reckoning (homelandVictimAcFor):
        // its toughness plus its Tender's company AC — the
        // Warden's +4 and the Sage's +2 alike (Recovery R7) —
        // plus THE ZODIAC'S AWOKIN AC (Recovery #1), the
        // owner's awokinAc clause sum read at this settle's
        // head. The hit roll, Fate's mitigation and the
        // border ward's turned blow all read this same
        // number below.
        const victimAC = homelandVictimAcFor(victim.toughness, progress.classKey, ownerKey) + zAwokinAc;
        let raw = 0; const dice = d.power * (roll === 20 ? 2 : 1);
        for (let i = 0; i < dice; i++) raw += homelandDN(6);
        const dmg = homelandFateMitigate(raw, victimAC, d.lvl);
        // THE WARD AT THE BORDER turns the blow as it turned
        // the chew — BEFORE the victim's own hide is reckoned:
        // the ward is the line's guard, and whether the blow
        // would have beaten her AC is what the ward exists to
        // make irrelevant. A Seal answers, the Trees take it.
        // The guard is read by the ward's own shape: by EDGE
        // for the wards that stood before the T, by the
        // CROSSBAR for the wards cast in a T — a blow whose
        // road from the dark's point to the victim's point
        // crosses the line is a blow across the ward.
        const fromTile = byId.get(d.tileId); const victimTile = byId.get(victim.tileId);
        let turned = false;
        if (fromTile && victimTile) {
          const key = homelandEdgeKeyBetween(fromTile, victimTile);
          let ward = key ? wardByEdge.get(key) : undefined;
          if (!ward) {
            for (const lw of wardLines) {
              if (lw.spent) continue;
              if (lineWardTurnsBlow(lw, { q: d.q, r: d.r }, { q: victim.q, r: victim.r })) { ward = lw; break; }
            }
          }
          if (ward && !ward.spent) {
            if (ward.engine === "seal") {
              ward.stops = (ward.stops ?? 0) + 1; ward.hp = (ward.hp ?? 0) - dmg; ward.touched = true;
              const riposte = (ward.nums.riposte ?? 3) + (mapBright ? (ward.nums.brightBonus ?? 1) : 0);
              await hurtDark(d, riposte, null);
              if (ward.stops >= (ward.nums.stops ?? 3) || ward.hp <= 0) ward.spent = true;
              turned = true;
            } else if (ward.engine === "trees") {
              ward.hp = (ward.hp ?? 0) - dmg; ward.touched = true;
              if (ward.hp <= 0) ward.spent = true;
              turned = true;
            }
          }
        }
        const hit = roll === 20 || (roll !== 1 && roll + fateStep(d.lvl) >= victimAC);
        if (!turned && hit && !d.dead) {
            if (d.kind === "hollow") {
              // The Hollow drains instead of blood: the
              // Tender's purse pays the blow's measure.
              const cur = await getEnergyFor(ownerKey);
              if (cur > 0) await spendEnergy(ownerKey, Math.min(cur, dmg));
            } else {
              victim.row.hp = victim.hp; victim.row.shield = victim.shield; victim.row.shieldMax = victim.shieldMax;
              const res = await damagePlacementShielded(victim.row as any, dmg);
              victim.hp = res.hp; victim.shield = res.shield; victim.shieldMax = victim.row.shieldMax == null ? victim.shieldMax : Number(victim.row.shieldMax);
              // The rising's blows are the hold's to reckon
              // (2026-10-24): a victim of a seed Fray is paid
              // her defense by the hold's own stood ledger at
              // the rising's end (payFirstSeedStood) — the +10
              // lands once, as the old referee paid it — so the
              // battle's struck-pay does not ride on them here.
              // XP DIVISION (2026-10-24): the stood defence is
              // a POT now, not the victim's sole pay — the
              // trigger stands exactly here (a landed blow, a
              // living victim of the open land's dark, once a
              // window), but the pot is recorded, not paid: it
              // divides when the window closes, among the
              // defenders engaged against this assailant, by
              // the damage they dealt it (below).
              if (!d.seedRising && !xpDefensePaid.has(victim.id)) { xpDefensePaid.add(victim.id); defencePots.push({ victimAwakenedId: victim.awakenedId, darkId: d.id }); }
              if (res.dissipated) { victim.dead = true; const wk = works.find(w => w.placementId === victim.id); if (wk) wk.gone = true; }
              // THORNS: a Root Awokin answers a landed blow —
              // 1 + her Root aspects, no roll on the answer.
              if (!d.dead && victim.dominant === "root") await hurtDark(d, 1 + victim.rootAspects, victim.awakenedId);
              if (d.kind === "tangle" && !victim.dead) {
                victim.row.pinnedUntil = tNow + BATTLE_BEAT_MS;
                sqlite.prepare("UPDATE field_placements SET pinned_until = ? WHERE id = ?").run(tNow + BATTLE_BEAT_MS, victim.id);
              }
            }
        }
        continue;
      }
      // Nothing of his in reach: the Tender himself, when he
      // stands within the bite and nothing of his stands —
      // the old border law's own priority.
      if (standTileId != null) {
        const stand = byId.get(standTileId);
        if (stand && axialDist(d, stand) <= ENEMY_BITE_REACH) {
          const roll = homelandDN(20);
          const tAC = 10 + zTenderAc; // the bare Tender stands at the base, as the Table's gate reckons him before his weapon's guard — plus THE ZODIAC'S TENDER AC (Recovery #1)
          if (roll === 20 || (roll !== 1 && roll + fateStep(d.lvl) >= tAC)) {
            let raw = 0; const dice = d.power * (roll === 20 ? 2 : 1);
            for (let i = 0; i < dice; i++) raw += homelandDN(6);
            const dmg = homelandFateMitigate(raw, tAC, d.lvl);
            await woundTender(ownerKey, Math.max(1, dmg));
          }
          continue;
        }
      }
      // Failing both, it worries the pure ground it stands
      // beside: harm gathers in the tile until the curse's
      // own HP for that ground is met and the tile turns.
      const here = byId.get(d.tileId);
      if (here) {
        const nbrs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]
          .map(([dq, dr]) => byKey.get(`${here.q + dq},${here.r + dr}`)).filter((n: any) => n && !n.cursed) as any[];
        const target = (!here.cursed ? here : undefined) ?? nbrs.find(n => axialDist(d, n) <= ENEMY_BITE_REACH + 0.5);
        if (target) {
          if (d.chewTileId !== target.id) { d.chewTileId = target.id; d.chewProgress = 0; }
          let raw = 0; for (let i = 0; i < d.power; i++) raw += homelandDN(6);
          d.chewProgress += raw;
          const ring = Math.max(Math.abs(target.q), Math.abs(target.r), Math.abs(target.q + target.r));
          if (d.chewProgress >= curseHpFor(ring, mood)) {
            const maxHp = curseHpFor(ring, mood);
            await db.update(schema.territoryTiles).set({ cursed: 1, curseHp: maxHp, curseMaxHp: maxHp, spark: 0 }).where(eq(schema.territoryTiles.id, target.id));
            target.cursed = 1; target.curseHp = maxHp; target.curseMaxHp = maxHp; target.spark = 0;
            d.chewTileId = null; d.chewProgress = 0;
          }
        }
      }
    }
    // ── THE AWOKEN ANSWER ───────────────────────────────
    // THE MID-MUSTER LAW (the Token Strip, Nigel 2026-10-23):
    // a follower a read has just mustered onto a march (the
    // Tender-muster in getTerritory) was SKIPPED here while
    // the dark above still chose her as its victim — mid-
    // muster the party stood disarmed. She answers now, from
    // the ground she stands on, like any fighter: the march
    // moves her between settles (settleMarches), and this
    // pass never moved her — it only refused her blow. A
    // marching or patrolling Awokin strikes what comes
    // within her reach, and is bitten as she always was.
    for (const f of fighters) {
      if (f.dead) continue;
      if ((f.row.pinnedUntil ?? 0) > tNow) continue;
      // Her cadence: the re-based table (Nigel, 2026-10-24),
      // trimmed by her SPEED BONUS — 0.5% a level above 1 off
      // the interval — with the crowding tax multiplying the
      // trimmed measure, as it taxed the plain one before.
      const baseMs = (AWOKEN_STRIKE_MS[f.dominant] ?? 3000) * (1 - 0.005 * Math.max(0, f.level - 1));
      const interval = baseMs * crowdTax(crowdOf(f.tileId));
      if (f.nextAt === 0) { f.nextAt = tNow + interval; f.row.battleNextAt = f.nextAt; continue; }
      if (tNow < f.nextAt) continue;
      f.nextAt += interval * Math.max(1, Math.floor((tNow - f.nextAt) / interval) + 1);
      f.row.battleNextAt = f.nextAt;
      const reach = (HOMELAND_ELEMENT_REACH[f.dominant] ?? 1) + 0.35;
      if (f.stance === "binding") {
        // Binders do their heal: the most-wounded ally in
        // her reach mends by her own element's die (the
        // grove's dice law, read for the binder's hand).
        const wounded = fighters.filter(o => !o.dead && o.id !== f.id && o.hp < o.maxHp && axialDist(f, o) <= reach)
          .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
        if (wounded) {
          const healed = await mendPlacement(wounded.id, homelandDN(HOMELAND_FATE_DIE[f.dominant] ?? 6));
          if (healed > 0) { wounded.hp += healed; wounded.row.hp = wounded.hp; }
        }
        continue;
      }
      // Attack, and Defence striking in place (the defence
      // bonus's number is unruled — the math stands plain).
      const target = darks.filter(d => !d.dead && axialDist(f, d) <= reach)
        .sort((a, b) => axialDist(f, a) - axialDist(f, b))[0];
      if (!target) {
        // WATERING (Nigel, 2026-10-24): no dark stands
        // within her reach — a Tide hand's strike is not
        // spent idle while bramble near her goes thirsty.
        // Her tending rides her ordinary strike, no new
        // door: where a mote stands within her reach, the
        // strike lands on it, and the Tide rider's Wet —
        // tideWetOnDark's own other face — feeds the work
        // instead of marking a foe: her rolled harm pours
        // into the mote's bank, and the bank spreads the
        // creep at its every-10 measure (the meter,
        // above). Defence first, as ever: a dark in
        // reach is fought, never watered past.
        if (f.dominant === "tide") await waterMote(f, reach, tNow);
        continue;
      }
      const roll = homelandDN(20);
      const bonus = fateStep(f.level) + ((ELEMENT_HIT_BONUS_MIRROR[f.dominant] ?? 0)) + companyAttackBonusFor(progress.classKey, ownerKey) + zAwokinAb; // THE SAGE'S COMPANY ATTACK (companyAttackBonusFor — its base +2 and the zodiac's deepening in one reckoning) + THE ZODIAC'S AWOKIN ATTACK BONUS (Recovery #1)
      const targetAC = Math.max(1, enemyACFor(target.kind) - target.cracked);
      // THE CRITICAL REACH (Recovery #1): the threshold
      // falls by the owner's crit stars from a natural 20;
      // a roll at or above it lands, and lands critical.
      const crit = roll >= zCritAt;
      const hit = crit || (roll !== 1 && roll + bonus >= targetAC);
      if (!hit) {
        // The witness keeps misses too (the weaponStrike
        // record's own shape): the map lunges only where the
        // referee struck, hit or miss.
        recordHomelandStrike(ownerKey, { tileId: target.tileId, wandererId: target.id, awakenedId: f.awakenedId, fromTileId: f.tileId, fromQ: f.q, fromR: f.r, toQ: target.q, toR: target.r, at: tNow, hit: false, dmg: 0, felled: false, element: f.dominant });
        continue;
      }
      const payload = await awakenedPayloadById(f.awakenedId);
      const layers = (payload?.layers ?? []) as { element?: string | null; power?: number }[];
      let raw = 0;
      for (const l of layers) {
        raw += homelandDN(HOMELAND_FATE_DIE[l.element ?? "neutral"] ?? 6) + (l.power ?? 0);
        if (crit) raw += homelandDN(HOMELAND_FATE_DIE[l.element ?? "neutral"] ?? 6);
      }
      // CRITICAL DEEPENING (Recovery #1): the doubled
      // total scales by (2 + 0.5 × half-steps) / 2 — at
      // zero held, exactly the crit the law already dealt.
      if (crit && zCritHalf > 0) raw = Math.round(raw * (2 + 0.5 * zCritHalf) / 2);
      if (f.dominant === "sky" && tNow < target.wetUntil) raw += 2; // Sky strikes land +2 on the wet
      // THE STANDARD AND THE BEACON, SPENT IN THE LIVING
      // BATTLE (the risings ride the engine, 2026-10-24):
      // the homeland's reader (homelandBannerBonus — the
      // Table's strikeOnce reading in this ground's tongue)
      // lends both numbers flat into the blow's raw harm,
      // judged strike by strike: the Standard by the ground
      // the striker stands on, the Beacon by the ground the
      // dark stands on. Until this build the reading's only
      // homeland spender was the first-seed hold's retired
      // referee; the living battle is where the homeland
      // reckons its company striking now, and the reading
      // rides with the referee — for the seed's risings and
      // for every fight on the land, as at the Table.
      const banner = homelandBannerBonus(ownerKey, axialRound(f.q, f.r), axialRound(target.q, target.r));
      raw += banner.std + banner.bcn;
      // THE WATCHTOWER'S +2 POWER (Nigel, 2026-10-24): she
      // stands on or beside an active tower, so the tower's
      // documented bonus stands in her strike — power enters
      // this reckoning additively (each part's die + its
      // power, summed into raw), so the +2 stands here in
      // the raw harm beside the banners' flat lendings.
      if (f.towerGuard) raw += towerPowerBonus;
      const dmg = homelandFateMitigate(raw, targetAC, f.level);
      await hurtDark(target, dmg, f.awakenedId);
      // THE STRIKE WITNESS (the Token Strip, above): the blow
      // is recorded where the referee struck it — the point
      // the dark stood on at the striking, before any shove
      // carries it — so the map's projectile flies true.
      recordHomelandStrike(ownerKey, { tileId: target.tileId, wandererId: target.id, awakenedId: f.awakenedId, fromTileId: f.tileId, fromQ: f.q, fromR: f.r, toQ: target.q, toR: target.r, at: tNow, hit: true, dmg, felled: target.dead, element: f.dominant });
      if (!target.dead) {
        if (f.dominant === "tide") tideWetOnDark(target, tNow);
        if (f.dominant === "stone") target.cracked = Math.min(3, target.cracked + 1);
        if (f.dominant === "sky") {
          const tilesPush = Math.floor((f.elSum.sky ?? 0) / 3);
          if (tilesPush >= 1) {
            const len = Math.hypot(target.q - f.q, target.r - f.r) || 1;
            const ux = (target.q - f.q) / len, ur = (target.r - f.r) / len;
            let nq = target.q + ux * tilesPush, nr = target.r + ur * tilesPush;
            let cell = axialRound(nq, nr);
            if (!byKey.has(`${cell.q},${cell.r}`)) { nq = target.q + ux * tilesPush * 0.5; nr = target.r + ur * tilesPush * 0.5; cell = axialRound(nq, nr); }
            if (byKey.has(`${cell.q},${cell.r}`)) {
              target.q = nq; target.r = nr;
              const nt = byKey.get(`${cell.q},${cell.r}`);
              if (nt && nt.id !== target.tileId) { target.tileId = nt.id; target.chewTileId = null; target.chewProgress = 0; }
            }
          }
        }
      }
    }
    // ── THE LIGHT TAKES ITS OWN ─────────────────────────
    for (const d of darks) {
      if (d.dead) continue;
      const t = byId.get(d.tileId);
      if (t && !t.cursed) {
        const ring = Math.max(Math.abs(t.q), Math.abs(t.r), Math.abs(t.q + t.r));
        d.hp -= d.maxHp * 0.01 * (ring + 1) * (dt / (BATTLE_BEAT_MS / 1000));
        if (d.hp <= 0) d.dead = true; // unmade by the light: no blow beat it, nothing is paid
      }
    }
  }
  // ── THE DEFENCE POTS, PAID (XP DIVISION, 2026-10-24) ──
  // Each stood defence recorded above divides its standing
  // 10 among the defenders engaged against that assailant,
  // weighted by the damage they dealt it across this window
  // — the victim's own thorns answer counts, as every
  // attributed blow counts. Where NO Awoken damaged the
  // assailant in the window (it struck first, and the
  // window closed before any answer landed), the stood
  // Awoken was the only one involved: she takes the pot
  // whole, as a solo act always has.
  for (const pot of defencePots) {
    const paid = await grantDividedXpPot(XP_PER_DEFENSE, darkDamage.get(pot.darkId) ?? new Map());
    if (!paid) {
      const scratch = new Map<number, XpGainReport>();
      await grantEventXp(scratch, pot.victimAwakenedId, XP_PER_DEFENSE);
    }
  }
  // Lattice pins wear by the beats that passed.
  const beatsPassed = Math.floor(elapsed / BATTLE_BEAT_MS);
  if (beatsPassed > 0) for (const d of darks) if (!d.dead && d.pinnedBeats > 0) d.pinnedBeats = Math.max(0, d.pinnedBeats - beatsPassed);
  // The Trees regrow as the beats pass (their standing law).
  for (const ward of borderWards) {
    if (ward.engine === "trees" && !ward.spent && beatsPassed > 0) {
      const grown = Math.min(ward.maxHp ?? ward.hp ?? 0, (ward.hp ?? 0) + (ward.nums.regrow ?? 2) * beatsPassed);
      if (grown !== ward.hp) { ward.hp = grown; ward.touched = true; }
    }
    if (ward.spent) sqlite.prepare("DELETE FROM territory_workings WHERE id = ?").run(ward.id);
    else if (ward.touched) sqlite.prepare("UPDATE territory_workings SET hp = ?, stops = ? WHERE id = ?").run(Math.max(0, Math.floor(ward.hp ?? 0)), ward.stops ?? 0, ward.id);
  }
  // ── Write the dark back ───────────────────────────────
  for (const d of darks) {
    if (d.dead) { sqlite.prepare("DELETE FROM homeland_wanderers WHERE id = ?").run(d.id); continue; }
    sqlite.prepare("UPDATE homeland_wanderers SET tile_id = ?, pos_q = ?, pos_r = ?, hp = ?, wet_until = ?, cracked = ?, last_strike_at = ?, pinned_beats = ?, chew_tile_id = ?, chew_progress = ?, held_until = ? WHERE id = ?")
      .run(d.tileId, d.q, d.r, d.hp, d.wetUntil, d.cracked, d.lastStrikeAt, d.pinnedBeats, d.chewTileId, d.chewProgress, d.heldUntil, d.id);
  }
  for (const f of fighters) {
    if (f.row.battleNextAt != null) sqlite.prepare("UPDATE field_placements SET battle_next_at = ? WHERE id = ?").run(f.row.battleNextAt, f.id);
  }
  for (const w of works) {
    if (w.gone || w.nodes.every(n => n.hp <= 0)) { sqlite.prepare("DELETE FROM defence_works WHERE id = ?").run(w.id); continue; }
    if (w.dirty) sqlite.prepare("UPDATE defence_works SET nodes = ? WHERE id = ?").run(JSON.stringify(w.nodes), w.id);
  }
}
/** The Table's element hit bonus, mirrored for the homeland's
 *  strike roll (table.ts ELEMENT_HIT_BONUS — test61's mirror
 *  discipline: the two grounds read one law). */
const ELEMENT_HIT_BONUS_MIRROR: Record<string, number> = { stone: 1, root: 2, tide: 3, sky: 4, fire: 5 };

/** THE WRITTEN LIGHT WITHERS AT HOME (Nigel, 2026-10-20):
 *  wards and runes may be cast anywhere on the homeland —
 *  and what stands on cursed ground suffers the curse's
 *  attrition, like the Tender: 0.01×(ring+1) of its greatest
 *  measure per 2.8 s beat, reckoned from each working's own
 *  watermark (wither_wm), one read never reckoning more
 *  than a minute — the Tender body's own caps and rate,
 *  exactly. The measure is the body the book gives the
 *  working: its health rating where it carries one (the
 *  Seal, the Trees, the Lattice); where it carries none,
 *  its charges are its body (the Keeper's reading, the
 *  same the Table keeps: the wither accrues against the
 *  charges at the same fractional rate, a whole charge at
 *  a time). A ward stands on an edge: it pays for the
 *  worse of its two grounds, as a guest pays for the one
 *  tile he stands on. Workings the curse has eaten whole
 *  are lifted from the land; getTerritory serves the
 *  workings fresh after this pass, so the fall is seen on
 *  the same read that reckoned it. */
async function settleHomelandWorkingAttrition(ownerKey: string, tiles: any[]): Promise<void> {
  const rows = sqlite.prepare("SELECT * FROM territory_workings WHERE owner_key = ? AND kind IN ('ward', 'rune', 'spell')").all(ownerKey) as any[];
  if (!rows.length) return;
  const now = Date.now();
  const byId = new Map<number, any>(tiles.map((t: any) => [t.id, t]));
  const byQR = new Map<string, any>(tiles.map((t: any) => [`${t.q},${t.r}`, t]));
  const ringOfTile = (t: any) => Math.max(Math.abs(t.q), Math.abs(t.r), Math.abs(t.q + t.r));
  for (const w of rows) {
    const wm = Number(w.wither_wm ?? 0);
    if (!wm) { sqlite.prepare("UPDATE territory_workings SET wither_wm = ? WHERE id = ?").run(now, w.id); continue; }
    const elapsed = Math.min(now - wm, 60000);
    if (elapsed < 1000) continue;
    let groundTiles: any[] = [];
    if (w.kind === "ward") {
      // A ward cast in a T stands on the ground of the hex
      // its point fell in (its filed tile); an edge ward
      // stands on its edge's two hexes, as it always has.
      let lineWard = false;
      try { lineWard = typeof (JSON.parse(w.nums ?? "{}") as any).linePx === "number"; } catch { lineWard = false; }
      if (lineWard) {
        const t = byId.get(w.tile_id);
        groundTiles = t ? [t] : [];
      } else {
        const a = byQR.get(`${w.q},${w.r}`);
        const d = WALL_DIRS[Number(w.dir ?? 0)] ?? [0, 0];
        const b = byQR.get(`${Number(w.q) + d[0]},${Number(w.r) + d[1]}`);
        groundTiles = [a, b].filter(Boolean);
      }
    } else {
      const t = byId.get(w.tile_id);
      if (t) groundTiles = [t];
    }
    let worst = -1;
    for (const t of groundTiles) if (t.cursed) worst = Math.max(worst, ringOfTile(t));
    sqlite.prepare("UPDATE territory_workings SET wither_wm = ? WHERE id = ?").run(now, w.id);
    if (worst < 0) continue;
    const beats = elapsed / 2800;
    const pct = 0.01 * (worst + 1);
    const maxHp = Number(w.max_hp ?? 0);
    const charges = Number(w.charges ?? 0);
    let wither = Number(w.wither ?? 0);
    if (maxHp > 0) {
      wither += maxHp * pct * beats;
      const whole = Math.floor(wither);
      if (whole >= 1) {
        const hp = Number(w.hp ?? 0) - whole;
        if (hp <= 0) { sqlite.prepare("DELETE FROM territory_workings WHERE id = ?").run(w.id); continue; }
        sqlite.prepare("UPDATE territory_workings SET hp = ?, wither = ? WHERE id = ?").run(hp, wither - whole, w.id);
      } else {
        sqlite.prepare("UPDATE territory_workings SET wither = ? WHERE id = ?").run(wither, w.id);
      }
    } else if (charges > 0) {
      wither += charges * pct * beats;
      const whole = Math.floor(wither);
      if (whole >= 1) {
        const left = charges - whole;
        if (left <= 0) { sqlite.prepare("DELETE FROM territory_workings WHERE id = ?").run(w.id); continue; }
        sqlite.prepare("UPDATE territory_workings SET charges = ?, wither = ? WHERE id = ?").run(left, wither - whole, w.id);
      } else {
        sqlite.prepare("UPDATE territory_workings SET wither = ? WHERE id = ?").run(wither, w.id);
      }
    }
  }
}

/** The Springleaf's grove, tended on the homeland settle
 *  (Homeland Casting): saplings root on their schedule and
 *  burst their half-heal; every living grove mends the
 *  company standing in its glow, +healPerBreath per beat of
 *  the curse's own clock (the Table's per-beat mend, the
 *  book's measure), one settle never reckoning more than a
 *  minute of breaths; a grove whose mother and saplings have
 *  all faded leaves the land. */
async function settleHomelandGroves(ownerKey: string, tiles: any[]): Promise<void> {
  const rows = sqlite.prepare("SELECT * FROM territory_workings WHERE owner_key = ? AND engine = 'springleaf'").all(ownerKey) as any[];
  if (!rows.length) return;
  // THE BINDER'S COMPANY (Recovery R7): every heal these
  // groves land — the saplings' rooting bursts and the
  // per-beat mending alike — is +4 when their planter is a
  // Binder, read once for the settle.
  const groveProgress = await getTenderProgress(ownerKey).catch(() => null);
  const groveBinderBonus = bindingHealBonusFor(groveProgress?.classKey, ownerKey);
  const now = Date.now();
  const byId = new Map<number, any>((tiles as any[]).map(t => [t.id, t]));
  const placements = await db.select().from(schema.fieldPlacements).where(eq(schema.fieldPlacements.ownerKey, ownerKey)) as any[];
  for (const w of rows) {
    let nums: any = {};
    try { nums = JSON.parse(w.nums ?? "{}"); } catch { nums = {}; }
    const motherTile = byId.get(w.tile_id);
    if (!motherTile) { sqlite.prepare("DELETE FROM territory_workings WHERE id = ?").run(w.id); continue; }
    const radius = Math.max(1, Math.floor(nums.radiusHexes ?? 1));
    const sapRadius = Math.max(1, Math.floor(radius / 2));
    const healPerBreath = nums.healPerBreath ?? 1;
    const saplings: any[] = Array.isArray(nums.saplings) ? nums.saplings : [];
    let dirty = false;
    // Sapling rootings due — each takes root with its own
    // breath, a half-strength burst over its smaller glow.
    for (const s of saplings) {
      if (!s.rooted && typeof s.dueAt === "number" && s.dueAt <= now) {
        s.rooted = true;
        s.expiresAt = s.dueAt + 20000;
        dirty = true;
        const st = byId.get(s.tileId);
        if (st) {
          for (const p of placements) {
            const pt = byId.get(p.tileId);
            if (pt && hexDistTiles(pt, st) <= sapRadius) await groveBurstHealPlacement(p.id, p.awakenedId, true, groveBinderBonus);
          }
        }
      }
    }
    // The per-beat mend, over the living zones (the mother
    // while she lingers; each rooted sapling while it does).
    const lastMend = typeof nums.lastMendAt === "number" ? nums.lastMendAt : now;
    const beats = Math.min(21, Math.floor(Math.max(0, now - lastMend) / 2800));
    if (beats > 0) {
      nums.lastMendAt = lastMend + beats * 2800;
      dirty = true;
      const zones: { tile: any; radius: number }[] = [];
      if (now <= (nums.motherExpiresAt ?? 0)) zones.push({ tile: motherTile, radius });
      for (const s of saplings) {
        if (s.rooted && now <= (s.expiresAt ?? 0)) {
          const st = byId.get(s.tileId);
          if (st) zones.push({ tile: st, radius: sapRadius });
        }
      }
      if (zones.length) {
        for (const p of placements) {
          const pt = byId.get(p.tileId);
          if (!pt) continue;
          let cover = 0;
          for (const z of zones) if (hexDistTiles(pt, z.tile) <= z.radius) cover++;
          if (cover > 0) await mendPlacement(p.id, beats * (healPerBreath + groveBinderBonus) * cover);
        }
      }
    }
    const motherLive = now <= (nums.motherExpiresAt ?? 0);
    const anySapLive = saplings.some(s => s.rooted && now <= (s.expiresAt ?? 0));
    const anySapPending = saplings.some(s => !s.rooted && typeof s.dueAt === "number" && s.dueAt <= (nums.motherExpiresAt ?? 0));
    if (!motherLive && !anySapLive && !anySapPending) {
      sqlite.prepare("DELETE FROM territory_workings WHERE id = ?").run(w.id);
      continue;
    }
    if (dirty) {
      sqlite.prepare("UPDATE territory_workings SET nums = ? WHERE id = ?").run(JSON.stringify(nums), w.id);
    }
  }
}

/** THE STAR ENGINE SINGS AT HOME (2026-10-21): an Engine
 *  raised on the homeland paid nothing in plain map play —
 *  its energyPerRound was read only inside the client's
 *  battle tally (the yield a battle's resolution grants
 *  through applyGrimoireState). Now a standing Engine sings
 *  on the homeland's own settle, in the grove's shape: a
 *  watermark kept in its stored numbers (sungAt), beats of
 *  the curse's own clock — 2.8 s, the Table's BEAT_MS, the
 *  round its page promises ("energy to its tender each
 *  round") — one read never reckoning more than a minute of
 *  song (the homeland's standing cap on a lazy settle: the
 *  attrition's, the weapon referee's); and the first sight
 *  of an Engine starts its song from that moment, paying
 *  nothing for time before it stood. The pay lands in the
 *  Tender's purse under the standing cap law
 *  (calculateMaxEnergy), as the battle yield is granted in
 *  applyGrimoireState: what a full purse cannot hold is
 *  simply not granted — never banked, never owed — and the
 *  settle never lowers a purse that already stands above
 *  the cap. While the Tender lies fallen the Engines hold
 *  their song, as at the Table, where a fallen owner's
 *  Engine is skipped by the round's tending. Every standing
 *  Engine sings its own song, as at the Table's tending,
 *  which pays once per Engine standing. */
async function settleHomelandEngines(ownerKey: string): Promise<void> {
  const rows = sqlite.prepare("SELECT id, nums FROM territory_workings WHERE owner_key = ? AND kind = 'ward' AND engine = 'engine' ORDER BY id").all(ownerKey) as any[];
  if (!rows.length) return;
  const prog = sqlite.prepare("SELECT down_until AS downUntil FROM tender_progress WHERE owner_key = ?").get(ownerKey) as any;
  const now = Date.now();
  if (prog?.downUntil != null && Number(prog.downUntil) > now) return;
  let gain = 0;
  for (const w of rows) {
    let nums: Record<string, any> = {};
    try { nums = JSON.parse(w.nums ?? "{}"); } catch { nums = {}; }
    const per = typeof nums.energyPerRound === "number" ? nums.energyPerRound : 1;
    if (typeof nums.sungAt !== "number") {
      nums.sungAt = now;
      sqlite.prepare("UPDATE territory_workings SET nums = ? WHERE id = ?").run(JSON.stringify(nums), w.id);
      continue;
    }
    const elapsed = Math.min(Math.max(0, now - Number(nums.sungAt)), 60000);
    const beats = Math.floor(elapsed / 2800);
    if (beats <= 0) continue;
    gain += beats * per;
    nums.sungAt = elapsed >= 60000 ? now : Number(nums.sungAt) + beats * 2800;
    sqlite.prepare("UPDATE territory_workings SET nums = ? WHERE id = ?").run(JSON.stringify(nums), w.id);
  }
  if (gain > 0) {
    const current = await getEnergyFor(ownerKey);
    const max = await calculateMaxEnergy(ownerKey);
    const next = Math.min(max, current + gain);
    if (next > current) {
      await db.update(schema.tenderResources)
        .set({ energy: next, updatedAt: new Date() })
        .where(eq(schema.tenderResources.ownerKey, ownerKey));
    }
  }
}

/** THE FIRST THREE ARE THE PARTY (Nigel, 2026-10-23 22:26 —
 *  front-intro redo, piece 4): "the Tender's first three
 *  Awoken must BE the party when the Tender first goes to
 *  the field — following along outside in the party as they
 *  should be to help defend and fight that first battle to
 *  defend the starseed." Wired at the honest joint: the
 *  first territory read on which the Tender STANDS on his
 *  land (getTerritory, once tenderStand has reckoned his
 *  stand — the standing flow, no side intro, no new area
 *  or door), before his followers muster and before the
 *  living battle settles, so the three stand in that very
 *  read's field and answer in its battle.
 *
 *  THE NEVER-OVERWRITE LAW: this pass runs only while the
 *  party ledger (tender_party, party.ts) stands EMPTY. A
 *  Tender who already has a party — any party, in any
 *  order — is passed over whole: no entry is added,
 *  removed, re-ordered or topped up, and no placement of
 *  his is touched. A Tender holding fewer than three
 *  Awoken gets nothing invented either: the pass writes
 *  nothing at all, and waits — the next standing read
 *  after his third Awoken exists completes it (in the
 *  ruled flow, piece 3's choose-at-three means a new
 *  Tender already holds three before the field matters).
 *  A Tender with no stand yet (no class chosen, or no
 *  ground to stand on) likewise waits whole: no ledger
 *  entry is made until he stands, so the ledger and the
 *  fielding always land together, in one read.
 *
 *  THE ENTRY is written directly into the ledger, NOT
 *  through tryAddPartyMember: that door is a JOIN, and a
 *  join lifts a fielded member off the field (the join
 *  law, 2026-10-23) — here the ruling is the opposite
 *  motion (into the party AND onto the field in one act),
 *  and a first-three creature that already stands placed
 *  keeps its standing row exactly as it stands; this pass
 *  only refrains from placing a second body for it.
 *
 *  THE FIELDING mirrors the summon cast's landing, free
 *  of its price and its roll — this is not a cast, it is
 *  the Tender arriving with his party already beside
 *  him: each of the three takes a standing point on the
 *  Tender's own tile or one beside it (the summon
 *  landing's own candidates, in its own order, the least
 *  crowded first), born at full HP with its shield rolled
 *  as any figure taking the field rolls it (rollShieldFor),
 *  FOLLOW raised (follow 1 — the party's own definition:
 *  a member follows when it stands on a ground), with no
 *  stance ever ordered, so the living battle reads it as
 *  ATTACK by the no-orders law and it strikes and is
 *  struck in settleHomelandBattle like any fighter. The
 *  summon company's exclusions are honoured whole: a
 *  member already placed, staged at the bastion, housed
 *  in the court or its champion, or still re-coalescing
 *  from a fall is entered in the ledger but NOT fielded
 *  by this pass — each already stands (or lies) somewhere
 *  this arrival cannot reach past. Energy is never spent
 *  and no roll is ever made here.
 *
 *  IDEMPOTENT by its gate: once the three stand in the
 *  ledger, the ledger is not empty, and every later read
 *  passes over — a second entry changes nothing. */
async function fieldFirstThreeParty(ownerKey: string, tiles: any[], standTileId: number): Promise<void> {
  if (!ownerKey.startsWith("tender:")) return;
  if (partyIdsFor(ownerKey).length) return;
  const roster = sqlite.prepare(
    "SELECT id, dispersed_until AS dispersedUntil FROM awakened WHERE owner_key = ? ORDER BY created_at ASC, id ASC",
  ).all(ownerKey) as { id: number; dispersedUntil: number | null }[];
  if (roster.length < 3) return;
  const firstThree = roster.slice(0, 3);
  const standTile = tiles.find((t: any) => t.id === standTileId);
  if (!standTile) return;
  // The ledger first — in hatch order, its own added_at
  // steps so partyIdsFor reads them back in that order.
  const now = Date.now();
  const ins = sqlite.prepare("INSERT INTO tender_party (owner_key, awakened_id, added_at) VALUES (?, ?, ?)");
  firstThree.forEach((r, i) => ins.run(ownerKey, r.id, now + i));
  // Then the fielding, beside the Tender.
  const placedRows = await db.select().from(schema.fieldPlacements).where(eq(schema.fieldPlacements.ownerKey, ownerKey)) as any[];
  const placedIds = new Set(placedRows.map(p => p.awakenedId));
  const stagedSet = new Set(stagedIdsFor(ownerKey));
  const courtHoused = await db.select({ awakenedId: schema.hallResidents.awakenedId }).from(schema.hallResidents)
    .where(eq(schema.hallResidents.ownerKey, ownerKey));
  const courtChamp = await db.select({ awakenedId: schema.tenderChampions.awakenedId }).from(schema.tenderChampions)
    .where(eq(schema.tenderChampions.ownerKey, ownerKey)).limit(1);
  const courtIds = new Set<number>([...courtHoused.map(r => r.awakenedId), ...(courtChamp.length ? [courtChamp[0].awakenedId] : [])]);
  const load = new Map<number, number>();
  for (const p of placedRows) load.set(p.tileId, (load.get(p.tileId) ?? 0) + 1);
  const candidates = (tiles as any[])
    .filter(t => hexDistTiles(t, standTile) <= 1 && (t.z ?? 0) === 0 && (t.buildStage ?? 0) !== 1)
    .sort((a, b) => (a.id === standTile.id ? 0 : 1) - (b.id === standTile.id ? 0 : 1)
      || hexDistTiles(a, standTile) - hexDistTiles(b, standTile) || a.id - b.id);
  const nowMs = Date.now();
  for (const r of firstThree) {
    if (placedIds.has(r.id) || stagedSet.has(r.id) || courtIds.has(r.id)) continue;
    if (r.dispersedUntil && Number(r.dispersedUntil) > nowMs) continue;
    const landing = candidates.find(t => (load.get(t.id) ?? 0) < 4) ?? candidates[0];
    if (!landing) return;
    const shield = await rollShieldFor(r.id);
    await db.insert(schema.fieldPlacements).values({
      ownerKey, awakenedId: r.id, tileId: landing.id,
      follow: 1,
      posQ: landing.q, posR: landing.r,
      hp: await placementMaxHp(r.id),
      shield, shieldMax: shield,
    });
    load.set(landing.id, (load.get(landing.id) ?? 0) + 1);
  }
}

/** THE PARTY, as the Zodiac reads it (Nigel, 2026-10-20;
 *  built 2026-10-21): the members standing in the party —
 *  each with the face its card carries — the width the band
 *  law allows, and the rest of the roster standing in the
 *  deck, from which an open spot is filled. Membership lives
 *  in server/src/party.ts; this is only its serving face. */
async function partyViewFor(ownerKey: string) {
  const progress = await getTenderProgress(ownerKey);
  const cap = partyCapFor(ownerKey, progress.level);
  const ids = partyIdsFor(ownerKey);
  const face = async (id: number) => {
    const p = await awakenedPayloadById(id).catch(() => null);
    if (!p) return null;
    return {
      awakenedId: p.id, name: p.name, imageUrl: p.image_url,
      power: p.power, toughness: p.toughness, level: p.level ?? null,
    };
  };
  const members: NonNullable<Awaited<ReturnType<typeof face>>>[] = [];
  for (const id of ids) { const f = await face(id); if (f) members.push(f); }
  const memberSet = new Set(ids);
  const rows = await db.select().from(schema.awakened).where(eq(schema.awakened.ownerKey, ownerKey));
  const deck: typeof members = [];
  for (const row of rows) {
    if (memberSet.has(row.id)) continue;
    const f = await face(row.id);
    if (f) deck.push(f);
  }
  // Reinforcements already on the road to this party (build
  // 2): a mid-battle deck fill does not stand in the ledger
  // until its timer lands, and the tab says so rather than
  // letting the spot look merely unfilled.
  const seat = partyBattleSeatFor(ownerKey);
  const incoming = seat ? (seat.player.incoming ?? []).map(i => ({ awakenedId: i.awakenedId, name: i.name, arrivesAt: i.arrivesAt, cost: i.cost })) : [];
  // The count's parts ride along (Nigel, 2026-10-21; the
  // reckoning Nigel, 2026-10-22): the surfaces name the
  // formula in plain words — 3 to start, plus a spot for
  // every party star held, at its deepened grant.
  const count = partyCountFor(ownerKey);
  return { members, deck, cap, size: members.length, level: progress.level, incoming, partyLevel: count.partyLevel, levelBonus: count.levelBonus, musterBonus: count.musterBonus };
}

/** THE HOMELAND WHEEL'S SUMMON COMPANY (Nigel, 2026-10-22 —
 *  the summoning fix: "summoning still needs fixed to be the
 *  way it was set in proving grounds on all tables"; "awoken
 *  just summon near the tender when summoned they dont need
 *  a target"): the party the homeland wheel's Awoken branch
 *  lists, in the party's own order — the Table's company
 *  (companyForTender) carried home. The exclusions mirror
 *  the Table's: a member standing on the field cannot be
 *  called again; a member staged at the bastion is kept back
 *  for the instance that carries it; a creature still
 *  re-coalescing from a fall is callable nowhere. The
 *  homeland field adds its own standing law (Nigel,
 *  2026-10-12): the court — housed Awokin and the marked
 *  champion — stays in hand and cannot be stationed on the
 *  field, so it is not listed here either. The price each
 *  entry carries is the Table's summon price: the Awokin's
 *  power, one at least (castCost's base, off campaign). */
export type SummonCompanyEntry = { awakenedId: number; name: string; imageUrl: string | null; power: number; toughness: number; level: number | null; cost: number };
async function summonCompanyFor(ownerKey: string): Promise<SummonCompanyEntry[]> {
  const placedRows = await db.select({ awakenedId: schema.fieldPlacements.awakenedId }).from(schema.fieldPlacements)
    .where(eq(schema.fieldPlacements.ownerKey, ownerKey));
  const placedIds = new Set(placedRows.map(r => r.awakenedId));
  const stagedSet = new Set(stagedIdsFor(ownerKey));
  const courtHoused = await db.select({ awakenedId: schema.hallResidents.awakenedId }).from(schema.hallResidents)
    .where(eq(schema.hallResidents.ownerKey, ownerKey));
  const courtChamp = await db.select({ awakenedId: schema.tenderChampions.awakenedId }).from(schema.tenderChampions)
    .where(eq(schema.tenderChampions.ownerKey, ownerKey)).limit(1);
  const courtIds = new Set<number>([...courtHoused.map(r => r.awakenedId), ...(courtChamp.length ? [courtChamp[0].awakenedId] : [])]);
  const nowMs = Date.now();
  const out: SummonCompanyEntry[] = [];
  for (const id of partyIdsFor(ownerKey)) {
    if (placedIds.has(id) || stagedSet.has(id) || courtIds.has(id)) continue;
    const row = sqlite.prepare("SELECT dispersed_until FROM awakened WHERE id = ?").get(id) as { dispersed_until: number | null } | undefined;
    if (row?.dispersed_until && row.dispersed_until > nowMs) continue;
    const payload = await awakenedPayloadById(id).catch(() => null);
    if (!payload) continue;
    out.push({
      awakenedId: payload.id, name: payload.name, imageUrl: payload.image_url,
      power: payload.power, toughness: payload.toughness, level: payload.level ?? null,
      cost: Math.max(1, payload.power),
    });
  }
  return out;
}

/** THE HOMELAND WHEEL'S REINFORCEMENT DECK (Nigel,
 *  2026-10-23 07:21–07:25 — Recovery R6): the deck Awoken
 *  the homeland wheel can CALL IN as reinforcements — the
 *  whole roster outside the party, in roster order. Party
 *  members are not here: they ride the summon cast
 *  (summonCompanyFor). The exclusions mirror the summon
 *  company's, for the same one-body-one-place law: standing
 *  on the field, staged at the bastion, housed in the court
 *  or its champion, or still re-coalescing from a fall —
 *  none of those can be called, because each already stands
 *  somewhere the call cannot reach past. On the homeland a
 *  reinforcement lands INSTANTLY (the re-ruling): the call
 *  below is a plain at-once fill of the party, free — the
 *  homeland's fill has always landed at once, and the call
 *  changes only WHO may be named: any deck Awoken, from the
 *  wheel, mid-battle or no. */
export type ReinforcementDeckEntry = { awakenedId: number; name: string; imageUrl: string | null; power: number; toughness: number; level: number | null; cost: number };
async function reinforcementDeckFor(ownerKey: string): Promise<ReinforcementDeckEntry[]> {
  const party = new Set(partyIdsFor(ownerKey));
  const placedRows = await db.select({ awakenedId: schema.fieldPlacements.awakenedId }).from(schema.fieldPlacements)
    .where(eq(schema.fieldPlacements.ownerKey, ownerKey));
  const placedIds = new Set(placedRows.map(r => r.awakenedId));
  const stagedSet = new Set(stagedIdsFor(ownerKey));
  const courtHoused = await db.select({ awakenedId: schema.hallResidents.awakenedId }).from(schema.hallResidents)
    .where(eq(schema.hallResidents.ownerKey, ownerKey));
  const courtChamp = await db.select({ awakenedId: schema.tenderChampions.awakenedId }).from(schema.tenderChampions)
    .where(eq(schema.tenderChampions.ownerKey, ownerKey)).limit(1);
  const courtIds = new Set<number>([...courtHoused.map(r => r.awakenedId), ...(courtChamp.length ? [courtChamp[0].awakenedId] : [])]);
  const rows = sqlite.prepare("SELECT id, dispersed_until FROM awakened WHERE owner_key = ? ORDER BY id").all(ownerKey) as { id: number; dispersed_until: number | null }[];
  const nowMs = Date.now();
  const out: ReinforcementDeckEntry[] = [];
  for (const row of rows) {
    if (party.has(row.id) || placedIds.has(row.id) || stagedSet.has(row.id) || courtIds.has(row.id)) continue;
    if (row.dispersed_until && row.dispersed_until > nowMs) continue;
    const payload = await awakenedPayloadById(row.id).catch(() => null);
    if (!payload) continue;
    out.push({
      awakenedId: payload.id, name: payload.name, imageUrl: payload.image_url,
      power: payload.power, toughness: payload.toughness, level: payload.level ?? null,
      cost: Math.max(1, payload.power),
    });
  }
  return out;
}

export const handlers = {
  async getStudio(_args: unknown, ctx?: ActionContext) {
    // The Tender ritual's data: pool pieces, the Tender deck, credits.
    // Workshop pieces of the collection stay behind the workshop lock.
    return buildStudio(ctx, { tenderOnly: true });
  },

  async getWorkshopStudio(_args: unknown, ctx?: ActionContext) {
    // Everything, for the creator's eyes only. Gated by requireWorkshop in index.ts.
    return buildStudio(ctx);
  },

  async uploadLayerAsset(args: unknown) {
    const parsed = z.object({ category: filingCategorySchema, imageBase64: z.string().min(100).max(16_000_000), mimeType: z.literal("image/png") }).safeParse(args);
    if (!parsed.success) badRequest(`Invalid upload request — ${describeValidationIssues(parsed.error)}.`);
    const { category, imageBase64, mimeType } = parsed.data;
    const bytes = Buffer.from(imageBase64, "base64");
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!signature.every((byte, index) => bytes[index] === byte) || bytes.length < 26) badRequest("That file is not a true PNG.");
    const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20);
    // Normalize uploads onto the shared 750×971 canvas. The artist's Procreate
    // exports are 2550×3300 (same aspect ratio); anything close to the template
    // ratio is resized with transparency preserved — never flattened, no
    // background fill. Anything else is rejected with the template message.
    const TEMPLATE_W = 750; const TEMPLATE_H = 971;
    let normalized = bytes;
    if (width !== TEMPLATE_W || height !== TEMPLATE_H) {
      const templateRatio = TEMPLATE_W / TEMPLATE_H;
      const ratioOk = Math.abs(width / height - templateRatio) / templateRatio <= 0.01;
      const sizeOk = width >= TEMPLATE_W && height >= TEMPLATE_H && Math.max(width, height) <= 4000;
      if (!ratioOk || !sizeOk) badRequest(`That PNG is ${width} × ${height}. Use the 750 × 971 template.`);
      // Lazy-load sharp: if its native binding ever fails in an environment,
      // only resizing breaks — the server still boots and 750×971 uploads work.
      const sharp = (await import("sharp")).default;
      normalized = await sharp(bytes).resize(TEMPLATE_W, TEMPLATE_H, { fit: "fill" }).png().toBuffer();
    }
    const existing = await db.select({ name: schema.layerAssets.name }).from(schema.layerAssets).where(eq(schema.layerAssets.category, category));
    const name = mysticalPieceName(category, new Set(existing.map((row) => row.name)));
    const blobKey = `layer-assets/${Date.now()}-${randomUUID()}.png`;
    const hasStats = statCategories.has(category);
    blobs.put(blobKey, normalized, mimeType);
    const rows = await db.insert(schema.layerAssets).values({ name, category, rarity: "common", power: hasStats ? 1 : null, toughness: hasStats ? 1 : null, imageBlobKey: blobKey, mimeType }).returning({ id: schema.layerAssets.id });
    const row = rows[0];
    if (!row) { blobs.delete(blobKey); badRequest("The drawing could not be added to the layer pool."); }
    return { id: (row as { id: number }).id, name };
  },

  async updateLayerAssetStats(args: unknown) {
    const parsed = z.object({ id: z.number().int().positive(), power: statSchema, toughness: statSchema }).safeParse(args);
    if (!parsed.success) badRequest("Invalid stats.");
    const rarity = rarityFromStats(parsed.data.power, parsed.data.toughness);
    await db.update(schema.layerAssets).set({ power: parsed.data.power, toughness: parsed.data.toughness, rarity }).where(eq(schema.layerAssets.id, parsed.data.id));
    return { ok: true as const, rarity };
  },

  async updateLayerAssetElement(args: unknown) {
    const parsed = z.object({
      id: z.number().int().positive(),
      element: z.enum(["tide", "sky", "stone", "root", "fire"]).nullable(),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid element update.");
    await db.update(schema.layerAssets).set({ element: parsed.data.element }).where(eq(schema.layerAssets.id, parsed.data.id));
    return { ok: true };
  },

  async updateLayerAssetRarity(args: unknown) {
    const parsed = z.object({ id: z.number().int().positive(), rarity: raritySchema }).safeParse(args);
    if (!parsed.success) badRequest("Invalid rarity.");
    await db.update(schema.layerAssets).set({ rarity: parsed.data.rarity }).where(eq(schema.layerAssets.id, parsed.data.id));
    return { ok: true as const };
  },

  async renameLayerAsset(args: unknown) {
    const parsed = z.object({ id: z.number().int().positive(), name: z.string().trim().min(2).max(60) }).safeParse(args);
    if (!parsed.success) badRequest("Invalid name.");
    await db.update(schema.layerAssets).set({ name: parsed.data.name }).where(eq(schema.layerAssets.id, parsed.data.id));
    return okResponse.parse({ ok: true });
  },

  async deleteLayerAsset(args: unknown) {
    const parsed = z.object({ id: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid id.");
    const rows = await db.select({ key: schema.layerAssets.imageBlobKey }).from(schema.layerAssets).where(eq(schema.layerAssets.id, parsed.data.id)).limit(1);
    await db.delete(schema.layerAssets).where(eq(schema.layerAssets.id, parsed.data.id));
    const key = rows[0]?.key; if (key) blobs.delete(key);
    return okResponse.parse({ ok: true });
  },

  async moveLayerAsset(args: unknown) {
    const parsed = z.object({ id: z.number().int().positive(), category: filingCategorySchema }).safeParse(args);
    if (!parsed.success) badRequest("Invalid move — pieces rest in the background, body, arms, aspect, or head pools.");
    const rows = await db.select({ category: schema.layerAssets.category, power: schema.layerAssets.power, toughness: schema.layerAssets.toughness, element: schema.layerAssets.element }).from(schema.layerAssets).where(eq(schema.layerAssets.id, parsed.data.id)).limit(1);
    const row = rows[0]; if (!row) badRequest("That piece is gone.");
    if (row.category === parsed.data.category) badRequest("It already rests in that pool.");
    // Stat-bearing pools (arms/body/head) carry power/toughness; background
    // and aura do not. Crossing that line resets or seeds the stats.
    const toStats = statCategories.has(parsed.data.category);
    const fromStats = statCategories.has(row.category as z.infer<typeof layerCategorySchema>);
    const power = toStats ? (fromStats ? row.power : 1) : null;
    const toughness = toStats ? (fromStats ? row.toughness : 1) : null;
    await db.update(schema.layerAssets).set({ category: parsed.data.category, power, toughness }).where(eq(schema.layerAssets.id, parsed.data.id));
    return okResponse.parse({ ok: true });
  },

  // --- Terrain stage art (Nigel, 2026-10-15) --------------------------------
  // The hex's grown faces. Stage 1 is the art bundled with the game; stages
  // 2 and 3 are the creator's to upload from the workshop's Terrain Stages
  // section. Upload and delete are workshop-gated in index.ts (the same
  // lock as uploadLayerAsset); the read is public — the map itself needs it.

  async getTerrainArt() {
    const rows = await db.select().from(schema.terrainArt);
    const art: Record<string, Record<number, string>> = {};
    for (const row of rows) {
      (art[row.element] ??= {})[row.stage] = blobUrl(row.imageBlobKey);
    }
    return { art };
  },

  async uploadTerrainArt(args: unknown) {
    const parsed = z.object({
      element: z.enum(["tide", "sky", "stone", "root", "neutral"]),
      stage: z.union([z.literal(2), z.literal(3)]),
      imageBase64: z.string().min(100).max(16_000_000),
      mimeType: z.literal("image/png"),
    }).safeParse(args);
    if (!parsed.success) badRequest(`Invalid terrain art upload — ${describeValidationIssues(parsed.error)}.`);
    const { element, stage, imageBase64, mimeType } = parsed.data;
    const bytes = Buffer.from(imageBase64, "base64");
    assertPngBytes(bytes);
    // The seating contract: terrain art registers on the shared
    // 1920 × 1280 canvas the provided tiles were measured on (Territory's
    // TERRAIN_IMG placement seats the painted face from those pixels).
    // Any other canvas would seat crooked on the lattice, so it is
    // refused here rather than silently misplaced on the map.
    const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20);
    if (width !== 1920 || height !== 1280) {
      badRequest(`That PNG is ${width} × ${height}. Terrain art uses the shared 1920 × 1280 canvas, like the tiles you provided.`);
    }
    const existing = await db.select({ imageBlobKey: schema.terrainArt.imageBlobKey })
      .from(schema.terrainArt)
      .where(and(eq(schema.terrainArt.element, element), eq(schema.terrainArt.stage, stage)))
      .limit(1);
    const blobKey = `terrain-art/${element}-stage${stage}-${Date.now()}-${randomUUID()}.png`;
    blobs.put(blobKey, bytes, mimeType);
    await db.insert(schema.terrainArt)
      .values({ element, stage, imageBlobKey: blobKey, mimeType, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [schema.terrainArt.element, schema.terrainArt.stage],
        set: { imageBlobKey: blobKey, mimeType, updatedAt: new Date() },
      });
    const replacedKey = existing[0]?.imageBlobKey;
    if (replacedKey && replacedKey !== blobKey) blobs.delete(replacedKey);
    return { ok: true as const, element, stage, image_url: blobUrl(blobKey) };
  },

  async deleteTerrainArt(args: unknown) {
    const parsed = z.object({
      element: z.enum(["tide", "sky", "stone", "root", "neutral"]),
      stage: z.union([z.literal(2), z.literal(3)]),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid terrain art removal.");
    const rows = await db.select({ imageBlobKey: schema.terrainArt.imageBlobKey })
      .from(schema.terrainArt)
      .where(and(eq(schema.terrainArt.element, parsed.data.element), eq(schema.terrainArt.stage, parsed.data.stage)))
      .limit(1);
    await db.delete(schema.terrainArt)
      .where(and(eq(schema.terrainArt.element, parsed.data.element), eq(schema.terrainArt.stage, parsed.data.stage)));
    const key = rows[0]?.imageBlobKey; if (key) blobs.delete(key);
    return okResponse.parse({ ok: true });
  },

  async saveAwoken(args: unknown, ctx?: ActionContext) {
    const parsed = z.object({ layers: z.array(layerRefShape).min(1).max(5), imageBase64: z.string().min(100).max(16_000_000), collection: collectionSchema, ownerName: z.string().trim().min(1).max(80) }).safeParse(args);
    if (!parsed.success) badRequest(`Invalid awakening — ${describeValidationIssues(parsed.error)}.`);
    const { layers, imageBase64, collection } = parsed.data;
    // Tender wakes cost one credit; the workshop (Nigel's own hand) is free.
    // Tender wakes require a Tender account — the vessel belongs to someone.
    if (collection === "tender") {
      if (!ctx?.tender) {
        throw Object.assign(new Error("Claim your secret code to wake — the vessel belongs to a Tender."), { status: 403 });
      }
      const spent = await spendWakeCredit(tenderOwnerKey(ctx.tender.id));
      if (!spent.ok) {
        throw Object.assign(
          new Error(`The vessel is empty — ${formatUsd(PACK_PRICE_CENTS)} gathers ${CREDITS_PER_PACK} wakes.`),
          { status: 402 }
        );
      }
    }
    // The workshop branch is gated HERE, not in the router's
    // WORKSHOP_ACTIONS — this handler is mixed, and the tender branch
    // above must stay public to logged-in Tenders. The gate is the same
    // token requireWorkshop checks, resolved by the router into ctx.
    if (collection === "workshop" && !ctx?.workshopAuthorized) {
      throw Object.assign(new Error("The workshop is locked — speak the word to enter."), { status: 401 });
    }
    const plan = await planAwakening(layers);
    const blobKey = `awakened/${Date.now()}-${randomUUID()}.png`;
    const bytes = Buffer.from(imageBase64, "base64");
    // Stored as image/png in BOTH branches — so it must BE a PNG, held
    // to the same truth test uploadLayerAsset applies.
    assertPngBytes(bytes);
    blobs.put(blobKey, bytes, "image/png");
    const ownerName = collection === "tender" ? ownerNameFor(ctx) : parsed.data.ownerName;
    const ownerKey = collection === "tender" && ctx?.tender ? tenderOwnerKey(ctx.tender.id) : null;
    const rows = await db.insert(schema.awakened).values({ name: plan.name, mintedName: plan.name, imageBlobKey: blobKey, compositionJson: JSON.stringify(plan.canonicalLayers), collection, ownerName, ownerKey, identityKey: plan.identityKey, iteration: plan.previousCount, flavorText: plan.flavorText }).returning({ id: schema.awakened.id });
    const row = rows[0] as { id: number } | undefined;
    if (!row) { blobs.delete(blobKey); badRequest("This awakening could not be saved."); }
    // Grant birth energy if this is a tender's Awoken
    if (ownerKey && collection === "tender") {
      const power = plan.canonicalLayers.reduce((sum, l) => sum + (l.power ?? 0), 0);
      await grantBirthEnergy(ownerKey, power);
      // A wake is a work of tending: the Tender grows by it
      // (Tender EXP, 2026-10-16 — the rate slows as wakes mount).
      await awardWakeExp(ownerKey).catch(() => null);
    }
    return { id: (row as { id: number }).id, name: plan.name, minted_name: plan.name, iteration: plan.previousCount, empowerment: plan.previousCount, flavor_text: plan.flavorText };
  },

  async renameAwoken(args: unknown, ctx?: ActionContext) {
    const parsed = z.object({ id: z.number().int().positive(), name: z.string().trim().min(1).max(80) }).safeParse(args);
    if (!parsed.success) badRequest("Invalid name.");
    const rows = await db.select({ ownerKey: schema.awakened.ownerKey }).from(schema.awakened).where(eq(schema.awakened.id, parsed.data.id)).limit(1);
    if (!rows[0]) badRequest("That Awokin is not found.");
    if (rows[0].ownerKey !== ownerKeyFor(ctx)) badRequest("You can only rename your own Awokin.");
    await db.update(schema.awakened).set({ name: parsed.data.name }).where(eq(schema.awakened.id, parsed.data.id));
    return okResponse.parse({ ok: true });
  },

  async deleteAwoken(args: unknown) {
    const parsed = z.object({ id: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid id.");
    const rows = await db.select({ key: schema.awakened.imageBlobKey }).from(schema.awakened).where(eq(schema.awakened.id, parsed.data.id)).limit(1);
    await db.delete(schema.awakened).where(eq(schema.awakened.id, parsed.data.id));
    const key = rows[0]?.key; if (key) blobs.delete(key);
    return okResponse.parse({ ok: true });
  },

  async shareStory(args: unknown, ctx?: ActionContext) {
    if (!ctx?.tender) badRequest("A Tender must share the story.");
    const parsed = z.object({ id: z.number().int().positive(), story: z.string().trim().min(100).max(2000) }).safeParse(args);
    if (!parsed.success) badRequest("A story is 100–2000 characters — a real telling, not a note.");
    const ownerKey = tenderOwnerKey(ctx.tender.id);
    const rows = await db.select().from(schema.awakened).where(eq(schema.awakened.id, parsed.data.id)).limit(1);
    const awoken = rows[0];
    if (!awoken) badRequest("That Awokin is not found.");
    if (awoken.ownerKey !== ownerKey) badRequest("You can only share stories of your own Awokin.");
    if ((awoken.storyCount ?? 0) >= 3) badRequest("This Awokin has already heard three stories — it is full.");
    await db.insert(schema.awokenStories).values({
      awakenedId: parsed.data.id, tenderId: ctx.tender.id, storyText: parsed.data.story, createdAt: new Date(),
    });
    await db.update(schema.awakened).set({ storyCount: (awoken.storyCount ?? 0) + 1 }).where(eq(schema.awakened.id, parsed.data.id));
    return okResponse.parse({ ok: true, storyCount: (awoken.storyCount ?? 0) + 1 });
  },

  // A Tender reads back the stories they have told one of their own Awoken.
  // Stories are personal (Nigel's ruling, 2026-10-15): owner-only, never
  // public, never another Tender's.
  async getAwokenStories(args: unknown, ctx?: ActionContext) {
    if (!ctx?.tender) badRequest("A Tender must ask for their own stories.");
    const parsed = z.object({ id: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid id.");
    const ownerKey = tenderOwnerKey(ctx.tender.id);
    const rows = await db.select().from(schema.awakened).where(eq(schema.awakened.id, parsed.data.id)).limit(1);
    const awoken = rows[0];
    if (!awoken) badRequest("That Awokin is not found.");
    if (awoken.ownerKey !== ownerKey) badRequest("You can only read stories of your own Awokin.");
    const stories = await db.select().from(schema.awokenStories)
      .where(eq(schema.awokenStories.awakenedId, parsed.data.id))
      .orderBy(asc(schema.awokenStories.id));
    return {
      stories: stories.map((s) => ({
        id: s.id,
        storyText: s.storyText,
        createdAt: s.createdAt.toISOString(),
        sentAt: s.sentAt ? s.sentAt.toISOString() : null,
      })),
      // This Awoken's own seed for its next telling, drawn from Lore's
      // Volume of Prompts — the same creature always meets the same seed
      // for a given slot (storyPrompts.ts). Every Awoken walks ONE thread
      // for life (Nigel's weaving, 2026-10-15), so its three seeds come
      // from that thread's chapters I, II, III in order. All three fields
      // are null once it holds three stories.
      nextPrompt: stories.length < 3 ? storyPromptFor(parsed.data.id, stories.length) : null,
      nextThread: stories.length < 3 ? storyThreadNameFor(parsed.data.id) : null,
      nextChapter: stories.length < 3 ? stories.length + 1 : null,
    };
  },

  // The chosen sending (Nigel's ruling, 2026-10-15): a Tender may send one
  // of their told stories to Discord, carried by the Voice with a true
  // image of the Awoken's card (rendered by the client, which alone knows
  // the card's face). Once per story, opt-in only, nothing automatic.
  // Fails closed when the Voice has no road (webhook unset in Railway).
  async sendStoryToDiscord(args: unknown, ctx?: ActionContext) {
    if (!ctx?.tender) badRequest("A Tender must send the story.");
    const parsed = z.object({
      storyId: z.number().int().positive(),
      cardPngBase64: z.string().min(1).max(14_000_000),
    }).safeParse(args);
    if (!parsed.success) badRequest("That sending is malformed.");
    const storyRows = await db.select().from(schema.awokenStories).where(eq(schema.awokenStories.id, parsed.data.storyId)).limit(1);
    const story = storyRows[0];
    if (!story) badRequest("That story is not found.");
    if (story.tenderId !== ctx.tender.id) badRequest("You can only send your own stories.");
    if (story.sentAt) badRequest("That telling has already been sent to Discord.");
    const awokenRows = await db.select().from(schema.awakened).where(eq(schema.awakened.id, story.awakenedId)).limit(1);
    const awoken = awokenRows[0];
    if (!awoken) badRequest("That Awokin is not found.");
    if (awoken.ownerKey !== tenderOwnerKey(ctx.tender.id)) badRequest("You can only send stories of your own Awokin.");
    if (!DISCORD_STORIES_WEBHOOK_URL) {
      badRequest("The Voice has no road to Discord yet — the stories webhook is not set on the server. Your story stays safe here, personal and unsent.");
    }
    const base64 = parsed.data.cardPngBase64.replace(/^data:image\/png;base64,/, "");
    const cardBytes = Buffer.from(base64, "base64");
    if (cardBytes.length > 10_000_000) badRequest("That card image is too large to carry.");
    assertPngBytes(cardBytes);
    const form = new FormData();
    form.append("payload_json", JSON.stringify({
      username: "The Voice",
      embeds: [{
        title: awoken.name,
        description: story.storyText,
        image: { url: "attachment://card.png" },
        footer: { text: `Told by ${ctx.tender.tenderName ?? "a Tender"}` },
      }],
    }));
    form.append("files[0]", new Blob([new Uint8Array(cardBytes)], { type: "image/png" }), "card.png");
    let response: Response;
    try {
      response = await fetch(`${DISCORD_STORIES_WEBHOOK_URL}?wait=true`, { method: "POST", body: form });
    } catch {
      badRequest("The Voice could not reach Discord — the telling was not sent. Try again in a little while.");
    }
    if (!response!.ok) badRequest("Discord turned the telling away — it was not sent. Try again in a little while.");
    const sentAt = new Date();
    await db.update(schema.awokenStories).set({ sentAt }).where(eq(schema.awokenStories.id, story.id));
    return { ok: true as const, sentAt: sentAt.toISOString() };
  },

  /** A Table binding code (Nigel's word, 2026-10-16): a signed-in
   *  Tender mints a one-time code here in the game, then spends it
   *  at the Table (POST /api/table/bind) to tie their Discord name
   *  to this Tender — from then on the Table deals their REAL deck,
   *  their own Awoken with their true card faces. One live code per
   *  Tender: minting fades any unspent predecessor. Fifteen minutes. */
  async getTableBindCode(args: unknown, ctx?: ActionContext) {
    if (!ctx?.tender) badRequest("Sign in as your Tender to take a binding code.");
    // THE CLASS GATE (Nigel, 2026-10-19): no Tender goes to the
    // Table without choosing a class — the bind code is the door,
    // so the door asks here.
    const gateProgress = await getTenderProgress(`tender:${ctx.tender.id}`);
    if (!gateProgress.classKey) badRequest("The Table seats only Tenders who have chosen a class — the choosing waits on your character sheet, at Lv 3 and beyond.");
    const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    const expiresAt = Date.now() + 15 * 60 * 1000;
    await db.delete(schema.tableBindCodes).where(eq(schema.tableBindCodes.tenderId, ctx.tender.id));
    await db.insert(schema.tableBindCodes).values({ code, tenderId: ctx.tender.id, expiresAt, usedAt: null });
    return { ok: true as const, code, expiresAt: new Date(expiresAt).toISOString() };
  },

  // -- The Voice's channel (workshop-held; Nigel's orders 2026-10-15) ---
  // Her weather pathway (above) runs on its own when the sky turns.
  // These are her workshop doors: read her state, still or loose her
  // weather voice, speak a test line, and post WORLD NEWS — the Ancient
  // One's own words, carried unbent (she is a herald, not an author).
  // All ride the same one webhook as the stories and fail closed
  // honestly when it is unset. Gated in-handler by the workshop token
  // (ctx.workshopAuthorized), as saveAwoken's workshop branch is.

  async getVoiceState(_args: unknown, ctx?: ActionContext) {
    if (!ctx?.workshopAuthorized) badRequest("The Voice's panel is the workshop's to hold.");
    const mood = await getWorldMood();
    const weatherAudioMoods: string[] = [];
    for (const m of MOODS) {
      if (await weatherAudioFor(m)) weatherAudioMoods.push(m);
    }
    return {
      webhookConfigured: !!DISCORD_STORIES_WEBHOOK_URL,
      weatherEnabled: (await getVoiceSetting("voice_weather_enabled")) !== "0",
      weatherAudioMoods,
      lastAnnouncedEndsAt: await getVoiceSetting("voice_weather_last_announced"),
      currentMood: mood.mood,
      currentReignEndsAt: mood.endsAt,
    };
  },

  async setVoiceWeatherEnabled(args: unknown, ctx?: ActionContext) {
    if (!ctx?.workshopAuthorized) badRequest("The Voice's panel is the workshop's to hold.");
    const parsed = z.object({ enabled: z.boolean() }).safeParse(args);
    if (!parsed.success) badRequest("That switch is malformed.");
    await setVoiceSetting("voice_weather_enabled", parsed.data.enabled ? "1" : "0");
    return { ok: true as const, weatherEnabled: parsed.data.enabled };
  },

  async postVoiceTestLine(_args: unknown, ctx?: ActionContext) {
    if (!ctx?.workshopAuthorized) badRequest("The Voice's panel is the workshop's to hold.");
    if (!DISCORD_STORIES_WEBHOOK_URL) {
      badRequest("The Voice has no road to Discord yet — the webhook is not set on the server (DISCORD_STORIES_WEBHOOK_URL in Railway). Nothing was posted.");
    }
    const posted = await postToVoiceChannel({
      embeds: [{
        title: "The Voice",
        description: "A test line, spoken once, so the road itself can be heard. The sky will speak for itself from here.",
        color: 0x8fa383,
        footer: { text: "The Voice · a test of the road" },
      }],
    });
    if (!posted) badRequest("Discord turned the test line away — it was not posted. Try again in a little while.");
    return { ok: true as const };
  },

  async postWorldNews(args: unknown, ctx?: ActionContext) {
    if (!ctx?.workshopAuthorized) badRequest("World news is the Ancient One's to speak, through the workshop.");
    const parsed = z.object({ text: z.string().trim().min(1).max(800) }).safeParse(args);
    if (!parsed.success) badRequest("World news must be a few living words — between 1 and 800 characters.");
    if (!DISCORD_STORIES_WEBHOOK_URL) {
      badRequest("The Voice has no road to Discord yet — the webhook is not set on the server (DISCORD_STORIES_WEBHOOK_URL in Railway). Your news is unposted, and unlost — it waits in your hands.");
    }
    const posted = await postToVoiceChannel({
      embeds: [{
        title: "World news",
        description: parsed.data.text,
        color: 0xc9a227,
        footer: { text: "The Voice · spoken for the Ancient One" },
      }],
    });
    if (!posted) badRequest("Discord turned the news away — it was not posted. Try again in a little while.");
    return { ok: true as const };
  },

  // -- Self-serve Tender accounts -------------------------------------------
  async suggestTenderCode() {
    return { code: await suggestTenderCode() };
  },

  async claimTender(args: unknown, ctx?: ActionContext) {
    return claimTender(args, ctx?.visitorId ?? null);
  },

  async loginTender(args: unknown) {
    return loginTender(args);
  },

  async requestPasswordReset(args: unknown) {
    return requestPasswordReset(args);
  },

  async resetPasswordWithToken(args: unknown) {
    return resetPasswordWithToken(args);
  },

  async logoutTender(args: unknown, ctx?: ActionContext) {
    const token = (args as { token?: unknown } | null)?.token;
    await destroySession(token);
    return okResponse.parse({ ok: true });
  },

  async suggestTenderName() {
    return { name: newTenderNameSuggestion() };
  },

  async setTenderName(args: unknown, ctx?: ActionContext) {
    if (!ctx?.tender) throw Object.assign(new Error("Claim your secret code first."), { status: 403 });
    return setTenderName(ctx.tender.id, args);
  },

  // -- Workshop: the Tender leaderboard ------------------------------------
  // Nigel's private view of his Tenders, ranked by Awoken woken. Never
  // exposed publicly — Tenders never see each other's counts.
  async listTenders() {
    const tenderRows = await db.select().from(schema.tenders).orderBy(desc(schema.tenders.createdAt));
    const counts = await db
      .select({ ownerKey: schema.awakened.ownerKey, count: sql<number>`count(*)` })
      .from(schema.awakened)
      .where(isNotNull(schema.awakened.ownerKey))
      .groupBy(schema.awakened.ownerKey);
    const countByKey = new Map<string, number>();
    for (const row of counts) if (row.ownerKey) countByKey.set(row.ownerKey, row.count);
    const energyRows = await db.select().from(schema.tenderResources);
    const energyByKey = new Map<string, number>();
    for (const row of energyRows) energyByKey.set(row.ownerKey, row.energy);
    const ledgerRows = await db.select().from(schema.creditLedger);
    const balanceByKey = new Map<string, number>();
    for (const row of ledgerRows) balanceByKey.set(row.userId, (balanceByKey.get(row.userId) ?? 0) + row.delta);
    const tenders = tenderRows
      .map((t) => {
        const ownerKey = tenderOwnerKey(t.id);
        return {
          code: t.code,
          tenderName: t.tenderName,
          displayName: t.tenderName ?? t.code,
          createdAt: t.createdAt.toISOString(),
          awokenCount: countByKey.get(ownerKey) ?? 0,
          ownerKey,
          energy: energyByKey.get(ownerKey) ?? 5,
          wakeBalance: balanceByKey.get(ownerKey) ?? 0,
        };
      })
      .sort((a, b) => b.awokenCount - a.awokenCount || a.createdAt.localeCompare(b.createdAt));
    return { tenders };
  },

  // -- Tender decks ---------------------------------------------------------
  // Named gatherings of Awoken, each with a chosen face card. Decks belong
  // to one owner key (a Tender account, or a soft visitor). Deck operations
  // never touch the awakened rows themselves — only membership rows.
  async createDeck(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ name: z.string().trim().min(1).max(60) }).safeParse(args);
    if (!parsed.success) badRequest("Name your deck.");
    const rows = await db
      .insert(schema.decks)
      .values({ ownerKey, name: parsed.data.name })
      .returning({ id: schema.decks.id });
    const row = rows[0];
    if (!row) badRequest("The deck could not be gathered.");
    return { id: row.id, name: parsed.data.name, faceCardId: null as number | null, cardCount: 0 };
  },

  async listDecks(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const deckRows = await db
      .select()
      .from(schema.decks)
      .where(eq(schema.decks.ownerKey, ownerKey))
      .orderBy(asc(schema.decks.createdAt));
    const decks: { id: number; name: string; faceCardId: number | null; cardCount: number }[] = [];
    for (const deck of deckRows) {
      const count = await db
        .select({ n: sql<number>`count(*)` })
        .from(schema.deckCards)
        .where(eq(schema.deckCards.deckId, deck.id));
      decks.push({
        id: deck.id,
        name: deck.name,
        faceCardId: deck.faceCardId ?? null,
        cardCount: Number(count[0]?.n ?? 0),
      });
    }
    return { decks };
  },

  async deleteDeck(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ id: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid id.");
    await ownDeck(parsed.data.id, ownerKey);
    await db.delete(schema.deckCards).where(eq(schema.deckCards.deckId, parsed.data.id));
    await db.delete(schema.decks).where(eq(schema.decks.id, parsed.data.id));
    return okResponse.parse({ ok: true });
  },

  async addCardToDeck(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z
      .object({ deckId: z.number().int().positive(), awakenedId: z.number().int().positive() })
      .safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    await ownDeck(parsed.data.deckId, ownerKey);
    const rows = await db
      .select()
      .from(schema.awakened)
      .where(eq(schema.awakened.id, parsed.data.awakenedId))
      .limit(1);
    const awoken = rows[0];
    if (!awoken || !canTouchAwoken(awoken, ownerKey))
      badRequest("That Awokin does not belong to your collection.");
    await db
      .insert(schema.deckCards)
      .values({ deckId: parsed.data.deckId, awakenedId: parsed.data.awakenedId })
      .onConflictDoNothing();
    return okResponse.parse({ ok: true });
  },

  async removeCardFromDeck(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z
      .object({ deckId: z.number().int().positive(), awakenedId: z.number().int().positive() })
      .safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    const deck = await ownDeck(parsed.data.deckId, ownerKey);
    await db
      .delete(schema.deckCards)
      .where(
        and(
          eq(schema.deckCards.deckId, parsed.data.deckId),
          eq(schema.deckCards.awakenedId, parsed.data.awakenedId)
        )
      );
    if (deck.faceCardId === parsed.data.awakenedId) {
      await db.update(schema.decks).set({ faceCardId: null }).where(eq(schema.decks.id, deck.id));
    }
    return okResponse.parse({ ok: true });
  },

  async setDeckFace(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z
      .object({ deckId: z.number().int().positive(), awakenedId: z.number().int().positive() })
      .safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    await ownDeck(parsed.data.deckId, ownerKey);
    const ids = await deckCardIds(parsed.data.deckId);
    if (!ids.includes(parsed.data.awakenedId)) badRequest("The face must be one of the deck's own.");
    await db
      .update(schema.decks)
      .set({ faceCardId: parsed.data.awakenedId })
      .where(eq(schema.decks.id, parsed.data.deckId));
    return okResponse.parse({ ok: true });
  },

  async getDeckCards(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ deckId: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid id.");
    const deck = await ownDeck(parsed.data.deckId, ownerKey);
    const cardIds = await deckCardIds(deck.id);
    return {
      deck: { id: deck.id, name: deck.name, faceCardId: deck.faceCardId ?? null },
      cardIds,
    };
  },

  async claimBonusTile(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ tileId: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid tile.");
    const tile = await db.select().from(schema.territoryTiles)
      .where(and(
        eq(schema.territoryTiles.id, parsed.data.tileId),
        eq(schema.territoryTiles.ownerKey, ownerKey),
        eq(schema.territoryTiles.cursed, 1)
      )).limit(1);
    if (!tile.length) badRequest("That tile is not available.");
    // Must be adjacent to purified territory
    const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    const neighbors = await db.select().from(schema.territoryTiles)
      .where(and(
        eq(schema.territoryTiles.ownerKey, ownerKey),
        eq(schema.territoryTiles.cursed, 0)
      ));
    const purified = new Set(neighbors.map(t => `${t.q},${t.r}`));
    const adjacent = dirs.some(([dq, dr]) => purified.has(`${tile[0].q + dq},${tile[0].r + dr}`));
    if (!adjacent) badRequest("Must be adjacent to your territory.");
    await db.update(schema.territoryTiles)
      .set({ cursed: 0, element: "root", curseHp: null, curseMaxHp: null, ...PURIFIED_TILE_FIELDS })
      .where(eq(schema.territoryTiles.id, tile[0].id));
    await expandFrontier(ownerKey, tile[0].q, tile[0].r);
    return { ok: true };
  },

  async assignStatPoint(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      awakenedId: z.number().int().positive(),
      stat: z.enum(["power", "toughness"]),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    const rows = await db.select().from(schema.awakened)
      .where(and(
        eq(schema.awakened.id, parsed.data.awakenedId),
        eq(schema.awakened.ownerKey, ownerKey)
      )).limit(1);
    if (!rows.length) badRequest("That Awokin is not yours.");
    if ((rows[0].statPoints ?? 0) < 1) badRequest("No stat points available.");
    const update = parsed.data.stat === "power"
      ? { bonusPower: (rows[0].bonusPower ?? 0) + 1, spentPower: ((rows[0] as any).spentPower ?? 0) + 1 }
      : { bonusToughness: (rows[0].bonusToughness ?? 0) + 1, spentToughness: ((rows[0] as any).spentToughness ?? 0) + 1 };
    await db.update(schema.awakened)
      .set({ ...update, statPoints: (rows[0].statPoints ?? 1) - 1 })
      .where(eq(schema.awakened.id, parsed.data.awakenedId));
    return { ok: true };
  },

  // Confluence: create a session and get a join code
  async createConfluence(_args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const [session] = await db.insert(schema.confluenceSessions).values({
      code, hostKey: ownerKey, status: "waiting", wavePower: 10,
    }).returning({ id: schema.confluenceSessions.id });
    return { code, sessionId: session.id };
  },

  // Join a confluence with a code
  async joinConfluence(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ code: z.string().min(4).max(8) }).safeParse(args);
    if (!parsed.success) badRequest("Invalid code.");
    const sessions = await db.select().from(schema.confluenceSessions)
      .where(eq(schema.confluenceSessions.code, parsed.data.code.toUpperCase())).limit(1);
    if (!sessions.length) badRequest("No confluence with that code.");
    const s = sessions[0];
    if (s.status !== "waiting") badRequest("That confluence already started.");
    if (s.hostKey === ownerKey) badRequest("That's your own confluence.");
    await db.update(schema.confluenceSessions)
      .set({ guestKey: ownerKey, status: "ready" })
      .where(eq(schema.confluenceSessions.id, s.id));
    return { sessionId: s.id, ok: true };
  },

  // Commit an Awoken from hand to the confluence roster
  async commitToConfluence(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      sessionId: z.number().int().positive(),
      awakenedId: z.number().int().positive(),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    const sessions = await db.select().from(schema.confluenceSessions)
      .where(eq(schema.confluenceSessions.id, parsed.data.sessionId)).limit(1);
    if (!sessions.length) badRequest("No such confluence.");
    const s = sessions[0];
    if (s.hostKey !== ownerKey && s.guestKey !== ownerKey) badRequest("Not your confluence.");
    if (s.status !== "ready" && s.status !== "waiting") badRequest("Confluence already in battle.");
    // Must be in hand (not placed on field)
    const placed = await db.select().from(schema.fieldPlacements)
      .where(and(
        eq(schema.fieldPlacements.awakenedId, parsed.data.awakenedId),
        eq(schema.fieldPlacements.ownerKey, ownerKey)
      )).limit(1);
    if (placed.length) badRequest("Only Awokin from hand can join a confluence.");
    // Verify ownership
    const owned = await db.select().from(schema.awakened)
      .where(and(
        eq(schema.awakened.id, parsed.data.awakenedId),
        eq(schema.awakened.ownerKey, ownerKey)
      )).limit(1);
    if (!owned.length) badRequest("That Awokin is not yours.");
    // The Hall sends its champions (Nigel, 2026-10-12): only housed Awoken
    // may march to a confluence, and the Hall's size caps the roster.
    // The marked champion is the quiet exception: housed or not, it may
    // always march, and unhoused it stands outside the Hall's count.
    const housed = await db.select().from(schema.hallResidents)
      .where(and(
        eq(schema.hallResidents.ownerKey, ownerKey),
        eq(schema.hallResidents.awakenedId, parsed.data.awakenedId)
      )).limit(1);
    const champRows = await db.select().from(schema.tenderChampions)
      .where(eq(schema.tenderChampions.ownerKey, ownerKey)).limit(1);
    const championId = champRows.length ? champRows[0].awakenedId : null;
    const isChampion = championId === parsed.data.awakenedId;
    if (!housed.length && !isChampion) badRequest("Only housed champions march to a confluence — house this Awokin in your Hall first.");
    const already = await db.select().from(schema.confluenceRoster)
      .where(and(
        eq(schema.confluenceRoster.sessionId, parsed.data.sessionId),
        eq(schema.confluenceRoster.ownerKey, ownerKey),
        eq(schema.confluenceRoster.awakenedId, parsed.data.awakenedId)
      )).limit(1);
    if (already.length) badRequest("That Awokin is already committed.");
    if (!(isChampion && !housed.length)) {
      const hall = await hallBuildingFor(ownerKey);
      const cap = hall && hall.status === "active" ? (hall.level ?? 1) : 0;
      const roster = await db.select().from(schema.confluenceRoster)
        .where(and(
          eq(schema.confluenceRoster.sessionId, parsed.data.sessionId),
          eq(schema.confluenceRoster.ownerKey, ownerKey)
        ));
      // An unhoused champion already in the roster doesn't consume a room's slot.
      const championHoused = championId !== null && (await db.select().from(schema.hallResidents)
        .where(and(
          eq(schema.hallResidents.ownerKey, ownerKey),
          eq(schema.hallResidents.awakenedId, championId)
        )).limit(1)).length > 0;
      const counted = roster.filter(r => championHoused || r.awakenedId !== championId).length;
      if (counted >= cap) badRequest(`Your Hall holds ${cap} — it can send no more champions to this confluence.`);
    }
    await db.insert(schema.confluenceRoster).values({
      sessionId: parsed.data.sessionId, ownerKey, awakenedId: parsed.data.awakenedId,
    });
    return { ok: true };
  },

  // Resolve a confluence battle: all roster Awoken gain XP, no territory
  async resolveConfluence(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      sessionId: z.number().int().positive(),
      victory: z.boolean(),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    const sessions = await db.select().from(schema.confluenceSessions)
      .where(eq(schema.confluenceSessions.id, parsed.data.sessionId)).limit(1);
    if (!sessions.length) badRequest("No such confluence.");
    const s = sessions[0];
    if (s.hostKey !== ownerKey && s.guestKey !== ownerKey) badRequest("Not your confluence.");
    if (s.status === "done") badRequest("This confluence is already resolved.");
    const roster = await db.select().from(schema.confluenceRoster)
      .where(eq(schema.confluenceRoster.sessionId, parsed.data.sessionId));
    // XP for all participants: 30 base + 5 per wave power, win or lose (more on win)
    const xpGain = parsed.data.victory ? 40 + s.wavePower * 2 : 20 + s.wavePower;
    for (const r of roster) {
      await grantXp(r.awakenedId, xpGain);
    }
    let twin = null;
    if (parsed.data.victory) {
      // Conceive the victory twin: body/arm/head drawn randomly per slot from both champions' pieces.
      // The twin is NOT added to decks yet — each tender claims it via the birth popup.
      twin = await conceiveConfluenceTwin(s.hostKey, s.guestKey!, parsed.data.sessionId);
    }
    await db.update(schema.confluenceSessions)
      .set({ status: "done" })
      .where(eq(schema.confluenceSessions.id, parsed.data.sessionId));
    return { ok: true, xpGain, participants: roster.length, twin };
  },

  // Claim the confluence twin into your deck (from the birth popup)
  async claimConfluenceTwin(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ sessionId: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    const sessions = await db.select().from(schema.confluenceSessions)
      .where(eq(schema.confluenceSessions.id, parsed.data.sessionId)).limit(1);
    if (!sessions.length) badRequest("No such confluence.");
    const s = sessions[0];
    if (s.hostKey !== ownerKey && s.guestKey !== ownerKey) badRequest("Not your confluence.");
    if (s.status !== "done") badRequest("The confluence isn't resolved yet.");
    // Check if already claimed
    const existing = await db.select().from(schema.awakened)
      .where(and(
        eq(schema.awakened.ownerKey, ownerKey),
        eq(schema.awakened.identityKey, `confluence-twin-${parsed.data.sessionId}`)
      )).limit(1);
    if (existing.length) badRequest("Twin already in your deck.");
    // Get the conceived twin data
    const twinData = await getConceivedTwin(parsed.data.sessionId);
    if (!twinData) badRequest("No twin was conceived.");
    const [twin] = await db.insert(schema.awakened).values({
      name: twinData.name,
      mintedName: twinData.name,
      imageBlobKey: twinData.imageBlobKey,
      compositionJson: twinData.compositionJson,
      collection: "tender",
      ownerName: ownerKey,
      ownerKey,
      identityKey: `confluence-twin-${parsed.data.sessionId}`,
      flavorText: twinData.flavorText,
      fieldBorn: 0,
    }).returning({ id: schema.awakened.id });
    return { ok: true, id: twin.id };
  },

  // Resolve a wave pull from mystery purification
  async resolveWavePull(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      tileId: z.number().int().positive(),
      victory: z.boolean(),
      survivorIds: z.array(z.number().int().positive()),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    const tiles = await db.select().from(schema.territoryTiles)
      .where(and(
        eq(schema.territoryTiles.id, parsed.data.tileId),
        eq(schema.territoryTiles.ownerKey, ownerKey),
        eq(schema.territoryTiles.cursed, 1)
      )).limit(1);
    if (!tiles.length) badRequest("No such cursed tile.");
    // Unified XP (Nigel, 2026-10-13): the survivors stood against the
    // pulled wave — a DEFENSE EVENT, +10 XP each, win or lose. The old
    // flat-60 victory grant is abolished; on victory the hex is taken
    // and HEX-TAKEN XP (+50) goes to each of them instead.
    const xpById = new Map<number, XpGainReport>();
    for (const id of parsed.data.survivorIds) {
      await grantEventXp(xpById, id, XP_PER_DEFENSE);
    }
    if (parsed.data.victory) {
      // Purify! No element claims this ground — it takes the
      // DEFAULT (root since Nigel's ruling, 2026-10-25; before,
      // neutral).
      await db.update(schema.territoryTiles)
        .set({ cursed: 0, element: "root", curseHp: null, curseMaxHp: null, ...PURIFIED_TILE_FIELDS })
        .where(eq(schema.territoryTiles.id, parsed.data.tileId));
      await expandFrontier(ownerKey, tiles[0].q, tiles[0].r);
      for (const id of parsed.data.survivorIds) {
        await grantEventXp(xpById, id, XP_PER_HEX_TAKEN);
      }
      // Purification births are abolished (Nigel, 2026-10-14) — too
      // many unnamed Awoken were simply popping up. No claim is
      // recorded here, ever. Boss victories once recorded the claim
      // (resolveBossBattle, War-Ground fix 2026-10-15), but the boss
      // battle mode is abolished (Nigel, 2026-10-24): no living
      // system records a newborn claim today, and creation belongs
      // to the Awoken Forge he plans.
    } else {
      // Wave lost — curse HP restores to half. A legacy tile with no
      // stored max is measured by the ring law under the live sky.
      const legacyRing = Math.max(Math.abs(tiles[0].q), Math.abs(tiles[0].r), Math.abs(tiles[0].q + tiles[0].r));
      const maxHp = tiles[0].curseMaxHp ?? curseHpFor(legacyRing, (await getWorldMood()).mood);
      await db.update(schema.territoryTiles)
        .set({ curseHp: Math.ceil(maxHp / 2) })
        .where(eq(schema.territoryTiles.id, parsed.data.tileId));
    }
    return { ok: true, purified: parsed.data.victory, xpGains: [...xpById.values()] };
  },

  async setChampion(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ awakenedId: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    const owned = await db.select().from(schema.awakened)
      .where(and(
        eq(schema.awakened.id, parsed.data.awakenedId),
        eq(schema.awakened.ownerKey, ownerKey)
      )).limit(1);
    if (!owned.length) badRequest("That Awokin is not yours.");
    // Court-bound: the champion stands in hand. An Awoken stationed on the
    // field cannot take the title until it returns.
    const champOnField = await db.select({ id: schema.fieldPlacements.id }).from(schema.fieldPlacements)
      .where(and(eq(schema.fieldPlacements.awakenedId, parsed.data.awakenedId), eq(schema.fieldPlacements.ownerKey, ownerKey))).limit(1);
    if (champOnField.length) badRequest("Your champion must stand in hand — an Awokin on the field cannot take the title.");
    // Any Awoken can be champion, anywhere (Nigel, 2026-10-12). The Hall
    // TRAINS champions — housing is where they are fed and leveled — but
    // the title is not gated by a room. The marked champion is still the
    // one whose pieces pass into confluence victory births.
    await db.insert(schema.tenderChampions)
      .values({ ownerKey, awakenedId: parsed.data.awakenedId })
      .onConflictDoUpdate({ target: schema.tenderChampions.ownerKey, set: { awakenedId: parsed.data.awakenedId } });
    return { ok: true };
  },

  async getLegends(_args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const champion = await db.select().from(schema.tenderChampions)
      .where(eq(schema.tenderChampions.ownerKey, ownerKey)).limit(1);
    let championAwoken = null;
    if (champion.length) {
      const rows = await db.select().from(schema.awakened)
        .where(eq(schema.awakened.id, champion[0].awakenedId)).limit(1);
      if (rows.length) {
        const assetRows = await db.select().from(schema.layerAssets);
        const assetStats = new Map();
        for (const r of assetRows) assetStats.set(r.id, { name: r.name, power: r.power, toughness: r.toughness, element: (r as any).element ?? null });
        const layers = parseLayers(rows[0].compositionJson, assetStats as any);
        championAwoken = toAwakenedPayload(rows[0] as any, layers, rows[0].identityKey, new Map());
      }
    }
    const legends = await db.select().from(schema.awokenLegends)
      .where(eq(schema.awokenLegends.ownerKey, ownerKey))
      .orderBy(desc(schema.awokenLegends.count)).limit(20);
    // Get Awoken names for legends
    const legendsWithNames = [];
    for (const l of legends) {
      const a = await db.select({ name: schema.awakened.name }).from(schema.awakened)
        .where(eq(schema.awakened.id, l.awakenedId)).limit(1);
      legendsWithNames.push({ ...l, awokenName: a[0]?.name ?? "Unknown" });
    }
    return { champion: championAwoken, legends: legendsWithNames };
  },

  async getMood(_args: unknown) {
    return await getWorldMood();
  },

  // Music's weather-mood trigger (Nigel, 2026-10-13): she categorizes,
  // code triggers. The client asks for the terrain playlist; the answer
  // is computed from the CURRENT world mood at ask time — no watcher,
  // no autonomy. When the fetched mood changes, the client re-asks and
  // the music follows the weather event. Workshop switches are law
  // here: a disabled track is never handed out for auto-play.
  async getTerrainPlaylist(_args: unknown) {
    const { mood, description } = await getWorldMood();
    const playlistMood = WORLD_MOOD_TO_PLAYLIST[mood] ?? "Calm";
    const rows = await db.select().from(schema.battleTracks).orderBy(asc(schema.battleTracks.id));
    const tracks: LibraryTrack[] = rows.map(t => ({
      id: t.id,
      name: t.name,
      url: (t.trackData.startsWith("/music/") || t.trackData.startsWith("data:audio")) ? t.trackData : null,
      enabled: !!t.enabled,
      pages: JSON.parse(t.pages || '["territory"]') as string[],
    }));
    const list = playlistForMood(playlistMood, tracks);
    const slim = (t: LibraryTrack) => ({ id: t.id, name: t.name, url: t.url as string });
    return {
      mood,
      description,
      playlistMood,
      tracks: list.map(slim),
    };
  },

  // Aspects deepen by ATTUNEMENT POINTS, never by combining
  // (Nigel, 2026-10-17): "aspects upgrade as you give an awoken
  // another attunement point... elements should not combine because
  // they would erode each other." So there is no combine action at
  // all. Give one point from the tender's pool of the aspect's own
  // element: the aspect rises a level (I -> II -> III) and takes the
  // level's artwork, and the Awoken strengthens (+1/+1), as a
  // deepening has always granted.
  async deepenAspect(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      awakenedId: z.number().int().positive(),
      targetAspectKey: z.string().min(1).max(160),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    const aw = await db.select().from(schema.awakened)
      .where(and(
        eq(schema.awakened.id, parsed.data.awakenedId),
        eq(schema.awakened.ownerKey, ownerKey)
      )).limit(1);
    if (!aw.length) badRequest("Awokin not found.");
    let layers: any[];
    try { layers = JSON.parse(aw[0].compositionJson || "[]"); }
    catch { badRequest("Invalid composition."); layers = []; }
    const wornAspects = layers.filter((l: any) => l.category === "aspect");
    if (!wornAspects.length) badRequest("This Awokin has no aspect equipped.");
    const target = wornAspects.find((l: any) => l.source_id === parsed.data.targetAspectKey);
    if (!target) badRequest("That aspect is not worn by this Awokin.");
    const currentLevel = target.aspectLevel ?? 1;
    // The ladder (Nigel, 2026-10-17): raising FROM a level costs that
    // level's number of points — 1=1, 2=2, 3=3, 4=4 — so I->II costs
    // 1, II->III costs 2, III->IV costs 3; three given points carry an
    // aspect to III, six to IV. Aspects stand to IV.
    const ASPECT_MAX_LEVEL = 4;
    if (currentLevel >= ASPECT_MAX_LEVEL) badRequest(`"${target.name}" is already at max level.`);
    const cost = currentLevel;
    const element = target.aspectElement || (await compositionElements([target]))[0];
    if (!element || element === "neutral") badRequest("That aspect's element is not filed yet.");
    // The point comes from the tender's own pool of that element.
    const pool = await db.select().from(schema.aspectAttunement)
      .where(and(
        eq(schema.aspectAttunement.ownerKey, ownerKey),
        eq(schema.aspectAttunement.element, element as any)
      )).limit(1);
    const points = pool.length ? (pool[0].points ?? 0) : 0;
    if (points < cost) {
      badRequest(`Raising "${target.name}" to level ${currentLevel + 1} costs ${cost} ${element} attunement point${cost > 1 ? "s" : ""} — the pool holds ${Math.floor(points)}. Let your companies attune the land, and the pool will fill.`);
    }
    await db.update(schema.aspectAttunement)
      .set({ points: points - cost, updatedAt: new Date() })
      .where(and(
        eq(schema.aspectAttunement.ownerKey, ownerKey),
        eq(schema.aspectAttunement.element, element as any)
      ));
    // Rise a level; take the level's artwork when a piece named
    // "<Element> <Roman>" is FILED as this element (art only).
    const newLevel = currentLevel + 1;
    target.aspectLevel = newLevel;
    const roman = ["", "I", "II", "III", "IV"][newLevel];
    const elementName = element.charAt(0).toUpperCase() + element.slice(1);
    const levelAsset = await db.select().from(schema.layerAssets)
      .where(and(
        eq(schema.layerAssets.category, "aspect"),
        like(schema.layerAssets.name, `${elementName} ${roman}`)
      )).limit(1);
    if (levelAsset.length && storedElement((levelAsset[0] as any).element) === element) {
      target.name = levelAsset[0].name;
      target.imageBlobKey = levelAsset[0].imageBlobKey;
      target.source_id = `db:${levelAsset[0].id}`;
    }
    await db.update(schema.awakened)
      .set({
        compositionJson: JSON.stringify(layers),
        bonusPower: (aw[0].bonusPower ?? 0) + 1,
        bonusToughness: (aw[0].bonusToughness ?? 0) + 1,
      })
      .where(eq(schema.awakened.id, parsed.data.awakenedId));
    return { ok: true as const, newLevel, element, targetName: target.name, targetKey: target.source_id, imageUrl: target.imageBlobKey ? blobUrl(target.imageBlobKey) : null, cost, pointsLeft: Math.floor((points - cost) * 10) / 10 };
  },

  async listGlyphs(args: unknown) {
    const parsed = z.object({ category: z.enum(["element", "magic", "hex", "buff"]) }).safeParse(args);
    if (!parsed.success) badRequest("Invalid category.");
    const rows = await db.select().from(schema.glyphs)
      .where(eq(schema.glyphs.category, parsed.data.category))
      .orderBy(asc(schema.glyphs.name));
    return { glyphs: rows };
  },

  async saveGlyph(args: unknown) {
    const parsed = z.object({
      id: z.number().int().positive().optional(),
      category: z.enum(["element", "magic", "hex", "buff"]),
      name: z.string().trim().min(1).max(60),
      svgData: z.string().trim().min(1).max(10000),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid glyph.");
    if (parsed.data.id) {
      await db.update(schema.glyphs)
        .set({ name: parsed.data.name, svgData: parsed.data.svgData, category: parsed.data.category })
        .where(eq(schema.glyphs.id, parsed.data.id));
      return { ok: true as const, id: parsed.data.id };
    }
    const result = await db.insert(schema.glyphs)
      .values({ category: parsed.data.category, name: parsed.data.name, svgData: parsed.data.svgData });
    return { ok: true as const, id: Number(result.lastInsertRowid) };
  },

  async deleteGlyph(args: unknown) {
    const parsed = z.object({ id: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid id.");
    await db.delete(schema.glyphs).where(eq(schema.glyphs.id, parsed.data.id));
    return { ok: true as const };
  },

  async applyAspect(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      awakenedId: z.number().int().positive(),
      inventoryAspectId: z.number().int().positive(),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    // Get the inventory aspect with its asset details
    const inv = await db.select({
      id: schema.aspectInventory.id,
      name: schema.layerAssets.name,
      imageBlobKey: schema.layerAssets.imageBlobKey,
      element: schema.layerAssets.element,
    }).from(schema.aspectInventory)
      .innerJoin(schema.layerAssets, eq(schema.aspectInventory.aspectAssetId, schema.layerAssets.id))
      .where(and(
        eq(schema.aspectInventory.id, parsed.data.inventoryAspectId),
        eq(schema.aspectInventory.ownerKey, ownerKey)
      )).limit(1);
    const aspect = inv[0];
    if (!aspect) badRequest("Aspect not found.");
    // The element is the piece's own FILED truth — never its name
    // (the sum-of-the-parts law, Nigel 2026-10-15). A name-guessing
    // regex lived here until 2026-10-16: it read keywords out of the
    // piece's name and so made applied aspects count as whatever
    // their names suggested — a piece named for crystal counted
    // stone whatever element it truly held. Combining, the inventory
    // list, and the pool births all read the filed element; this was
    // the last surface still guessing. An aspect whose element has
    // not been filed has no element to give — say so honestly rather
    // than invent one.
    const element = storedElement((aspect as any).element);
    if (element === "neutral") {
      badRequest("That aspect's element is not filed yet — file it on the piece in the workshop, then apply it.");
    }
    // Get the Awoken
    const aw = await db.select().from(schema.awakened)
      .where(and(
        eq(schema.awakened.id, parsed.data.awakenedId),
        eq(schema.awakened.ownerKey, ownerKey)
      )).limit(1);
    const awakened = aw[0];
    if (!awakened) badRequest("Awokin not found.");
    let layers: any[];
    try { layers = JSON.parse(awakened.compositionJson); }
    catch { layers = []; }
    // Aspects STACK (Nigel, 2026-10-17: "its not stacking aspects on
    // the awoken"). Every applied aspect stands on the Awoken as its
    // own layer, with its own filed element and its own level. The
    // stack is capped at three so a card stays readable and the
    // sum-of-the-parts stays sane.
    const ASPECT_STACK_MAX = 3;
    const worn = layers.filter((l: any) => l.category === "aspect");
    // ADD-TO-UPGRADE (Nigel, 2026-10-17, from the attunement menu):
    // adding an aspect whose element the Awoken ALREADY wears raises
    // the worn one a level instead of stacking a twin — at the normal
    // ladder cost in points of that element (raising FROM level L
    // costs L), and only when the pool can pay; a short pool refuses
    // honestly and nothing is spent or consumed. The stored aspect is
    // NOT consumed by an upgrade-add: the points are the price,
    // exactly as deepenAspect charges. A NEW element still stacks as
    // its own layer, and a worn aspect already at IV lets the add
    // place fresh beside it (when the stack has room).
    const ASPECT_MAX_LEVEL = 4;
    let match: any = null;
    for (const l of worn) {
      const el = l.aspectElement || (await compositionElements([l]))[0];
      if (el === element && (l.aspectLevel ?? 1) < ASPECT_MAX_LEVEL) {
        if (!match || (l.aspectLevel ?? 1) < (match.aspectLevel ?? 1)) match = l;
      }
    }
    if (match) {
      const currentLevel = match.aspectLevel ?? 1;
      const cost = currentLevel;
      const pool = await db.select().from(schema.aspectAttunement)
        .where(and(
          eq(schema.aspectAttunement.ownerKey, ownerKey),
          eq(schema.aspectAttunement.element, element as any)
        )).limit(1);
      const points = pool.length ? (pool[0].points ?? 0) : 0;
      if (points < cost) {
        badRequest(`Adding ${element} would raise "${match.name}" to level ${currentLevel + 1} — the normal cost is ${cost} ${element} attunement point${cost > 1 ? "s" : ""}, and the pool holds ${Math.floor(points)}. Nothing was spent.`);
      }
      await db.update(schema.aspectAttunement)
        .set({ points: points - cost, updatedAt: new Date() })
        .where(and(
          eq(schema.aspectAttunement.ownerKey, ownerKey),
          eq(schema.aspectAttunement.element, element as any)
        ));
      const newLevel = currentLevel + 1;
      match.aspectLevel = newLevel;
      // Take the level's artwork when a piece named "<Element>
      // <Roman>" is FILED as this element — the same swap
      // deepenAspect makes (art only; the level rises either way).
      const roman = ["", "I", "II", "III", "IV"][newLevel];
      const elementName = element.charAt(0).toUpperCase() + element.slice(1);
      const levelAsset = await db.select().from(schema.layerAssets)
        .where(and(
          eq(schema.layerAssets.category, "aspect"),
          like(schema.layerAssets.name, `${elementName} ${roman}`)
        )).limit(1);
      if (levelAsset.length && storedElement((levelAsset[0] as any).element) === element) {
        match.name = levelAsset[0].name;
        match.imageBlobKey = levelAsset[0].imageBlobKey;
        match.source_id = `db:${levelAsset[0].id}`;
      }
      await db.update(schema.awakened)
        .set({
          compositionJson: JSON.stringify(layers),
          bonusPower: (awakened.bonusPower ?? 0) + 1,
          bonusToughness: (awakened.bonusToughness ?? 0) + 1,
        })
        .where(eq(schema.awakened.id, parsed.data.awakenedId));
      return { ok: true as const, element, newLevel, upgraded: true as const, cost, targetName: match.name, targetKey: match.source_id, imageUrl: match.imageBlobKey ? blobUrl(match.imageBlobKey) : null, stacked: worn.length };
    }
    // THE SEAL (Nigel, 2026-10-18): an Awokin's first aspect seals
    // its element — every later aspect it takes, by stored piece or
    // by woven points alike, must be of the sealed element. (Raising
    // a worn aspect of the added element is deepening, not a new
    // pick, and stands outside the seal.) A stack that already mixes
    // elements from before the seal was law keeps what it wears; its
    // seal is its first aspect's element.
    if (worn.length && !match) {
      const sealEl = worn[0].aspectElement || (await compositionElements([worn[0]]))[0];
      if (sealEl && sealEl !== "neutral" && sealEl !== element) {
        badRequest(`This Awokin is sealed to ${sealEl} by its first aspect — a ${element} aspect cannot be woven into it. Nothing was spent or consumed.`);
      }
    }
    if (worn.length >= ASPECT_STACK_MAX) {
      badRequest(`This Awokin already wears ${ASPECT_STACK_MAX} aspects — its stack is full. Deepen one with attunement points instead.`);
    }
    // New aspect: add to composition (renders behind body), +1/+1
    layers.push({
      source_id: `aspect-inv:${aspect.id}`,
      name: aspect.name,
      category: "aspect",
      rarity: "common",
      power: null,
      toughness: null,
      aspectLevel: 1,
      aspectElement: element,
      imageBlobKey: aspect.imageBlobKey,
    });
    await db.update(schema.awakened)
      .set({
        compositionJson: JSON.stringify(layers),
        bonusPower: (awakened.bonusPower ?? 0) + 1,
        bonusToughness: (awakened.bonusToughness ?? 0) + 1,
      })
      .where(eq(schema.awakened.id, parsed.data.awakenedId));
    // Consume the inventory aspect
    await db.delete(schema.aspectInventory)
      .where(eq(schema.aspectInventory.id, parsed.data.inventoryAspectId));
    return { ok: true as const, element, newLevel: 1, upgraded: false as const, targetName: aspect.name, targetKey: `aspect-inv:${aspect.id}`, imageUrl: aspect.imageBlobKey ? blobUrl(aspect.imageBlobKey) : null, stacked: worn.length + 1 };
  },

  // Weave an aspect from attunement points alone (Nigel,
  // 2026-10-18 — the deck's aspect buttons): no stored piece is
  // consumed; the points are the price, on the aspect ladder — the
  // first aspect costs 1, the second 2, the third 3, paid from the
  // pool of the element woven. The FIRST pick is a choice of any
  // element, and that pick seals the Awokin: every later aspect it
  // ever takes must be of the sealed element (the same seal
  // applyAspect now honors). The aspect itself is drawn from the
  // pieces filed under the element — never level-art (the birth
  // rule), never a piece this Awokin already wears — and stands at
  // level I for the usual +1/+1 gift.
  async weaveAspect(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      awakenedId: z.number().int().positive(),
      element: z.enum(["tide", "sky", "stone", "root", "fire"]),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    const element = parsed.data.element as Element5;
    const aw = await db.select().from(schema.awakened)
      .where(and(
        eq(schema.awakened.id, parsed.data.awakenedId),
        eq(schema.awakened.ownerKey, ownerKey)
      )).limit(1);
    const awakened = aw[0];
    if (!awakened) badRequest("Awokin not found.");
    let layers: any[];
    try { layers = JSON.parse(awakened.compositionJson || "[]"); }
    catch { layers = []; }
    const worn = layers.filter((l: any) => l.category === "aspect");
    const ASPECT_STACK_MAX = 3;
    if (worn.length >= ASPECT_STACK_MAX) {
      badRequest(`This Awokin already wears ${ASPECT_STACK_MAX} aspects — its stack is full. Deepen one instead.`);
    }
    if (worn.length) {
      const sealEl = worn[0].aspectElement || (await compositionElements([worn[0]]))[0];
      if (sealEl && sealEl !== "neutral" && sealEl !== element) {
        badRequest(`This Awokin is sealed to ${sealEl} by its first aspect — only ${sealEl} aspects can be woven into it now. Nothing was spent.`);
      }
    }
    // The ladder (Nigel, 2026-10-18): "the same cost as normal
    // aspects — 1 for 1, 2 for 2, 3 for 3."
    const cost = worn.length + 1;
    const pool = await db.select().from(schema.aspectAttunement)
      .where(and(
        eq(schema.aspectAttunement.ownerKey, ownerKey),
        eq(schema.aspectAttunement.element, element as any)
      )).limit(1);
    const points = pool.length ? (pool[0].points ?? 0) : 0;
    if (points < cost) {
      badRequest(`Weaving a ${element} aspect costs ${cost} ${element} attunement point${cost > 1 ? "s" : ""} — the pool holds ${Math.floor(points)}. Nothing was spent.`);
    }
    const assetRows = await db.select().from(schema.layerAssets)
      .where(eq(schema.layerAssets.category, "aspect"));
    const wornIds = new Set(worn.map((l: any) => String(l.source_id ?? "")));
    const eligible = birthableAspects(assetRows as any[], element)
      .filter((a: any) => !wornIds.has(`db:${a.id}`));
    if (!eligible.length) {
      badRequest(`No unworn aspect of ${element} waits to be woven — when a piece of ${element} is filed as an aspect in the workshop, this button can spend points on it. Nothing was spent.`);
    }
    const piece: any = eligible[Math.floor(Math.random() * eligible.length)];
    await db.update(schema.aspectAttunement)
      .set({ points: points - cost, updatedAt: new Date() })
      .where(and(
        eq(schema.aspectAttunement.ownerKey, ownerKey),
        eq(schema.aspectAttunement.element, element as any)
      ));
    layers.push({
      source_id: `db:${piece.id}`,
      name: piece.name,
      category: "aspect",
      rarity: (piece as any).rarity ?? "common",
      power: null,
      toughness: null,
      aspectLevel: 1,
      aspectElement: element,
      imageBlobKey: piece.imageBlobKey,
    });
    await db.update(schema.awakened)
      .set({
        compositionJson: JSON.stringify(layers),
        bonusPower: (awakened.bonusPower ?? 0) + 1,
        bonusToughness: (awakened.bonusToughness ?? 0) + 1,
      })
      .where(eq(schema.awakened.id, parsed.data.awakenedId));
    return { ok: true as const, element, cost, newLevel: 1, targetName: piece.name, targetKey: `db:${piece.id}`, imageUrl: piece.imageBlobKey ? blobUrl(piece.imageBlobKey) : null, stacked: worn.length + 1, sealed: element };
  },

  // grantAspectPoint is GONE (War-Ground fix, 2026-10-15): it minted a
  // point for any caller with no victory behind it, as often as it was
  // called. Its gated successor claimAspectGrant is gone too — it paid
  // out the aspect grants a verified boss victory recorded, and the
  // boss battle mode is abolished (Nigel, 2026-10-24). Aspect points
  // now move through addAspectPoints' living roads: the attunement
  // drip, the lake yield, the first-seed reward, the creator's gift.

  /** Persist battle damage to a tile. Returns new HP, and whether it fell. */
  async damageTileHp(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      tileId: z.number().int().positive(),
      damage: z.number().int().min(1).max(20),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid damage.");
    const tile = await db.select().from(schema.territoryTiles)
      .where(and(
        eq(schema.territoryTiles.id, parsed.data.tileId),
        eq(schema.territoryTiles.ownerKey, ownerKey)
      )).limit(1);
    if (!tile.length) badRequest("Tile not found.");
    const newHp = Math.max(0, (tile[0].hp ?? 10) - parsed.data.damage);
    await db.update(schema.territoryTiles)
      .set({ hp: newHp })
      .where(eq(schema.territoryTiles.id, parsed.data.tileId));
    // If HP hit 0, curse the tile
    let cursed = false;
    if (newHp === 0 && !tile[0].cursed) {
      await db.update(schema.territoryTiles)
        .set({ cursed: 1, ...FALLEN_TILE_FIELDS })
        .where(eq(schema.territoryTiles.id, parsed.data.tileId));
      cursed = true;
    }
    return { ok: true as const, hp: newHp, cursed };
  },

  /** Persist battle damage to an Awoken placement. */
  async damageAwokenHp(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      awakenedId: z.number().int().positive(),
      damage: z.number().int().min(1).max(20),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid damage.");
    const placement = await db.select().from(schema.fieldPlacements)
      .where(and(
        eq(schema.fieldPlacements.awakenedId, parsed.data.awakenedId),
        eq(schema.fieldPlacements.ownerKey, ownerKey)
      )).limit(1);
    if (!placement.length) badRequest("Placement not found.");
    // Health is toughness alone (Nigel's law — the old power+toughness sum
    // here contradicted it). All placement damage flows through the single
    // path: at 0 HP the Awoken dissipates back to hand.
    const result = await damagePlacement(placement[0], parsed.data.damage);
    // Unified XP: being attacked is a DEFENSE EVENT — +10 XP to the
    // Awoken that took the hit, each time it is attacked (this action is
    // the server's per-hit report from battle). The XP lands even when
    // the hit dissipates it: it stood, it was struck.
    const xp = await grantXp(parsed.data.awakenedId, XP_PER_DEFENSE);
    return {
      ok: true as const,
      hp: result.hp,
      maxHp: result.maxHp,
      dissipated: result.dissipated,
      awakenedId: parsed.data.awakenedId,
      xpGain: XP_PER_DEFENSE,
      leveledUp: xp.leveledUp,
      newLevel: xp.newLevel,
    };
  },

  /** Demolish a building. */
  async setShrineMode(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      buildingId: z.number().int().positive(),
      mode: z.enum(["blessing", "attune"]),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    const rows = await db.select().from(schema.territoryBuildings)
      .where(and(
        eq(schema.territoryBuildings.id, parsed.data.buildingId),
        eq(schema.territoryBuildings.ownerKey, ownerKey)
      )).limit(1);
    if (!rows.length) badRequest("No such building.");
    const b = rows[0];
    if (b.buildingType !== "attunement-shrine") badRequest("Only an Attunement Shrine can turn between its blessing and the land.");
    if (b.status !== "active") badRequest("The shrine is not standing active — it is still rising, or its upkeep is unpaid.");
    const turn = parsed.data.mode === "attune";
    await db.update(schema.territoryBuildings)
      .set({ mode: turn ? "attune" : "blessing", attuneAnchorAt: turn ? new Date() : null } as any)
      .where(eq(schema.territoryBuildings.id, b.id));
    return { ok: true, mode: turn ? "attune" : "blessing" };
  },

  async demolishBuilding(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      buildingId: z.number().int().positive(),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid building.");
    const b = await db.select().from(schema.territoryBuildings)
      .where(and(
        eq(schema.territoryBuildings.id, parsed.data.buildingId),
        eq(schema.territoryBuildings.ownerKey, ownerKey)
      )).limit(1);
    if (!b.length) badRequest("Building not found.");
    await db.delete(schema.territoryBuildings)
      .where(eq(schema.territoryBuildings.id, parsed.data.buildingId));
    // A bastion torn down breaks the hold it anchored (the failed
    // seed law, 2026-10-17): the seed it held is the curse's now.
    if (b[0].buildingType === "bastion") {
      const seed = sqlite.prepare("SELECT id, tile_id FROM star_seeds WHERE owner_key = ? AND bastion_building_id = ? AND state = 'held'").get(ownerKey, parsed.data.buildingId) as any;
      if (seed) corruptSeed(ownerKey, seed);
    }
    return { ok: true as const };
  },

  /** Hourly binding heal: binding Awoken heal wounded fighters outside battle. Once per hour max. */
  async bindingHealTick(_args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;

    // Check last heal time (stored in aspect_attunement updatedAt as a proxy, or use a dedicated check)
    // Simple: check if any fighter was healed in the last hour by looking at a marker
    // For now, use a simple in-memory throttle per owner (resets on server restart, acceptable)
    const lastHeal = (global as any).__lastBindingHeal?.[ownerKey] || 0;
    if (now - lastHeal < ONE_HOUR) {
      return { ok: true as const, healed: 0, throttled: true };
    }

    // Get binding Awoken
    const binders = await db.select({
      awakenedId: schema.fieldPlacements.awakenedId,
      tileId: schema.fieldPlacements.tileId,
      compositionJson: schema.awakened.compositionJson,
    }).from(schema.fieldPlacements)
      .innerJoin(schema.awakened, eq(schema.fieldPlacements.awakenedId, schema.awakened.id))
      .where(and(
        eq(schema.fieldPlacements.ownerKey, ownerKey),
        eq(schema.fieldPlacements.stance, "binding")
      ));
    if (!binders.length) return { ok: true as const, healed: 0 };

    // Get all fighter placements with HP
    const fighters = await db.select({
      id: schema.fieldPlacements.id,
      awakenedId: schema.fieldPlacements.awakenedId,
      tileId: schema.fieldPlacements.tileId,
      hp: schema.fieldPlacements.hp,
      compositionJson: schema.awakened.compositionJson,
    }).from(schema.fieldPlacements)
      .innerJoin(schema.awakened, eq(schema.fieldPlacements.awakenedId, schema.awakened.id))
      .where(and(
        eq(schema.fieldPlacements.ownerKey, ownerKey),
        or(eq(schema.fieldPlacements.stance, "attack"), eq(schema.fieldPlacements.stance, "defense"))
      ));

    // Get tiles for distance calc
    const tiles = await db.select().from(schema.territoryTiles)
      .where(eq(schema.territoryTiles.ownerKey, ownerKey));
    const tileById = new Map(tiles.map(t => [t.id, t]));
    const circleRowsForHeal = await db.select().from(schema.territoryBuildings)
      .where(and(
        eq(schema.territoryBuildings.ownerKey, ownerKey),
        eq(schema.territoryBuildings.buildingType, "binding-circle"),
        eq(schema.territoryBuildings.status, "active")
      ));
    const circleTilesForHeal = circleRowsForHeal.map(b => tileById.get(b.tileId)).filter(Boolean) as any[];
    const towerRowsForHeal = await db.select().from(schema.territoryBuildings)
      .where(and(
        eq(schema.territoryBuildings.ownerKey, ownerKey),
        eq(schema.territoryBuildings.buildingType, "watchtower"),
        eq(schema.territoryBuildings.status, "active")
      ));
    const towerTilesForHeal = towerRowsForHeal.map(b => tileById.get(b.tileId)).filter(Boolean) as any[];
    const healConfig = await loadGameConfig();
    const towerBonus = healConfig.buildings["watchtower"]?.powerBonus ?? 2;
    const hexDist = (a: any, b: any) =>
      (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

    // True stats from payloads (live piece values + empowerment, stories,
    // aspects, stat points) — the heal honors the numbers the cards show,
    // not the values frozen into the composition JSON at birth.
    const statsById = new Map<number, { power: number; toughness: number }>();
    for (const id of new Set([...binders.map(b => b.awakenedId), ...fighters.map(f => f.awakenedId)])) {
      const p = await awakenedPayloadById(id);
      statsById.set(id, { power: p?.power ?? 3, toughness: p?.toughness ?? 3 });
    }
    const calcStats = (id: number) => statsById.get(id) ?? { power: 3, toughness: 3 };
    // Health cap (Nigel, 2026-10-12): toughness alone — plus the watchtower
    // bonus for a fighter standing on or beside an active watchtower,
    // mirroring the tower's defender aura.
    const maxHpFor = (f: { awakenedId: number; tileId: number }) => {
      const { toughness } = calcStats(f.awakenedId);
      const fTile = tileById.get(f.tileId);
      const nearTower = !!fTile && towerTilesForHeal.some(tt => hexDist(fTile, tt) <= 1);
      return toughness + (nearTower ? towerBonus : 0);
    };

    let healed = 0;
    for (const b of binders) {
      const bTile = tileById.get(b.tileId);
      if (!bTile) continue;
      const { power } = calcStats(b.awakenedId);
      // Find wounded in hex + adjacent
      const wounded = fighters.filter(f => {
        const fTile = tileById.get(f.tileId);
        if (!fTile) return false;
        if (hexDist(bTile, fTile) > 1) return false;
        const maxHp = maxHpFor(f);
        const curHp = f.hp ?? maxHp;
        return curHp < maxHp;
      });
      if (!wounded.length) continue;
      // Binding Circle: binders on or beside an active circle heal +50%.
      const healPer = (power / wounded.length) * (circleTilesForHeal.some(ct => hexDist(bTile, ct) <= 1) ? 1.5 : 1);
      for (const w of wounded) {
        const maxHp = maxHpFor(w);
        const newHp = Math.min(maxHp, (w.hp ?? maxHp) + healPer);
        await db.update(schema.fieldPlacements)
          .set({ hp: Math.round(newHp) })
          .where(eq(schema.fieldPlacements.id, w.id));
        healed++;
      }
    }
    if (healed > 0) {
      if (!(global as any).__lastBindingHeal) (global as any).__lastBindingHeal = {};
      (global as any).__lastBindingHeal[ownerKey] = now;
    }
    return { ok: true as const, healed };
  },

  /** THE SKILL ZODIAC — the wheel and the Tender's place
   *  on it (Nigel's directive via Law, 2026-10-17). */
  async getSkillTree(_args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    return skillTreeState(ownerKey);
  },

  /** Unlock a skill on the wheel. THE LAW IS CONNECTION
   *  ONLY (Nigel's Reset, 2026-10-25 01:16–01:18): "No
   *  paths... Remember I reset all the rules and now
   *  they're not supposed to be any paths. No blocks to
   *  the paths, I mean." — "Everybody starts in the center
   *  and they just go where they want to from there.
   *  Connecting. There's no other paths, no blocks,
   *  nothing." A star opens when it connects, through
   *  stars the Tender owns, back to the center — and its
   *  point cost is paid from the one pool. NOTHING else
   *  gates it: NO Heart-first gate (struck — the heart
   *  ring holds no privilege but its place beside the
   *  center), NO requirement entries (struck — a star
   *  never demands a named predecessor; the `requires`
   *  sets in the wheel's data stand inert, unenforced by
   *  any door), NO class gate, NO attunement gate, NO
   *  off-road penalty — a star belongs to whoever buys
   *  it, whatever class they walk (the effect follows
   *  the star, never the class). Spreading wide costs
   *  only time: points are finite, and that economy is
   *  the whole of the price. */
  async unlockSkill(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const key = String((args as any)?.key ?? "");
    const node = liveById().get(key);
    if (!node) badRequest("No such skill stands on the wheel.");
    if (node.kind === "center") badRequest("The Heart is not bought — it beats already, and its ring is the first road.");
    const state = await skillTreeState(ownerKey);
    const owned = new Set(state.unlocked);
    if (owned.has(key)) badRequest(`${node.name} is already yours.`);
    if (state.tree.left < node.cost) badRequest(`${node.name} costs ${node.cost} point${node.cost > 1 ? "s" : ""} — you hold ${state.tree.left}. Levels grant ${SKILL_POINTS_PER_LEVEL} points each; the wheel is a life's walking.`);
    const reached = zodiacReached(owned);
    if (!(liveAdj()[key] ?? []).some(nb => reached.has(nb))) badRequest(`No road of held skills reaches ${node.name} — unlock along the roads from your Heart, trunk to limb to twig.`);
    sqlite.prepare("INSERT INTO tender_skills (owner_key, skill_key, pool, created_at) VALUES (?, ?, ?, ?)")
      .run(ownerKey, key, node.pool, Date.now());
    return skillTreeState(ownerKey);
  },

  /** Release a skill — allowed only when its release
   *  strands nothing beyond it (Unlock Law §2). */
  async releaseSkill(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const key = String((args as any)?.key ?? "");
    const node = liveById().get(key);
    if (!node) badRequest("No such skill stands on the wheel.");
    const state = await skillTreeState(ownerKey);
    const owned = new Set(state.unlocked);
    if (!owned.has(key)) badRequest(`${node.name} is not yours to release.`);
    owned.delete(key);
    const reached = zodiacReached(owned);
    for (const k of owned) {
      if (!reached.has(k)) badRequest(`Releasing ${node.name} would strand ${liveById().get(k)?.name ?? k} beyond it — release from the twigs inward.`);
    }
    sqlite.prepare("DELETE FROM tender_skills WHERE owner_key = ? AND skill_key = ?").run(ownerKey, key);
    return skillTreeState(ownerKey);
  },

  /** RESET SKILL POINTS (Nigel, 2026-10-22 14:07): one tap
   *  releases EVERY star the Tender holds and refunds every
   *  point — a full clear of the ledger, so the stranding
   *  rule that guards a single release does not apply. The
   *  act is fully reversible by re-buying along any road,
   *  so it carries no confirmation (standing law: no
   *  unasked gates in a core flow). */
  async resetSkillPoints(_args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    sqlite.prepare("DELETE FROM tender_skills WHERE owner_key = ?").run(ownerKey);
    return skillTreeState(ownerKey);
  },

  // ── THE WORKSHOP→TENDER INBOX (ruled 2026-10-20; the
  // tender's Message button ordered by Nigel 2026-10-22) ──
  // One-way letters from the workshop to one tender, kept
  // in the tender_messages ledger. The send is workshop-
  // gated (WORKSHOP_ACTIONS in index.ts) and confirms
  // against the stored row it just wrote — never a bare
  // "sent" with nothing behind it.

  async adminSendTenderMessage(args: unknown, _ctx?: ActionContext) {
    const ownerKey = String((args as any)?.ownerKey ?? "");
    const body = String((args as any)?.body ?? "").trim();
    const addressed = /^tender:(\d+)$/.exec(ownerKey);
    if (!addressed) badRequest("That address names no tender — letters go to one tender's own key.");
    const tender = sqlite.prepare("SELECT id FROM tenders WHERE id = ?").get(Number(addressed[1])) as { id: number } | undefined;
    if (!tender) badRequest("No such tender walks the world.");
    if (!body) badRequest("The letter is empty — write the words first.");
    if (body.length > 2000) badRequest("The letter runs long — keep it under 2000 characters.");
    const written = sqlite.prepare("INSERT INTO tender_messages (owner_key, body, sent_at, read_at) VALUES (?, ?, ?, NULL)").run(ownerKey, body, Date.now());
    const row = sqlite.prepare("SELECT id, owner_key, body, sent_at, read_at FROM tender_messages WHERE id = ?").get(written.lastInsertRowid) as { id: number; owner_key: string; body: string; sent_at: number; read_at: number | null };
    return { ok: true as const, message: { id: row.id, ownerKey: row.owner_key, body: row.body, sentAt: row.sent_at, readAt: row.read_at } };
  },

  /** The tender's own inbox — session-bound: the reader is
   *  whoever holds the session, and the ledger answers for
   *  their key alone. */
  async getTenderMessages(_args: unknown, ctx?: ActionContext) {
    return tenderInboxState(ownerKeyFor(ctx));
  },

  /** Opening a letter stamps it read — and only its own
   *  tender can open it; another tender's key is refused
   *  outright, so privacy between tenders holds in the
   *  ledger itself, not just in what the screens show. */
  async markTenderMessageRead(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const id = Number((args as any)?.id ?? 0);
    const row = sqlite.prepare("SELECT id, owner_key FROM tender_messages WHERE id = ?").get(id) as { id: number; owner_key: string } | undefined;
    if (!row) badRequest("No such letter stands in the ledger.");
    if (row.owner_key !== ownerKey) badRequest("That letter is not yours to open.");
    sqlite.prepare("UPDATE tender_messages SET read_at = ? WHERE id = ? AND read_at IS NULL").run(Date.now(), id);
    return tenderInboxState(ownerKey);
  },

  // ── THE STARWRIGHT (workshop, 2026-10-18) ────────────────
  // The Ancient One re-writes the stars: the living wheel's
  // nodes, roads and effect clauses, edited in the workshop
  // and live in the game the moment they are saved. Gated by
  // WORKSHOP_ACTIONS in index.ts — these never answer a
  // player's call, only the workshop's key.

  async getZodiacGraph(_args: unknown, _ctx?: ActionContext) {
    return { graph: zodiacGraph(), palette: FX_PALETTE, bespoke: BESPOKE_IDS };
  },

  async saveZodiacNode(args: unknown, _ctx?: ActionContext) {
    try {
      const node = upsertNode((args as any)?.node);
      return { ok: true as const, node, graph: zodiacGraph() };
    } catch (e) { badRequest(e instanceof Error ? e.message : "The star refused its writing."); }
  },

  async deleteZodiacNode(args: unknown, _ctx?: ActionContext) {
    try {
      const id = String((args as any)?.id ?? "");
      const r = deleteNode(id);
      return { ...r, graph: zodiacGraph() };
    } catch (e) { badRequest(e instanceof Error ? e.message : "The star refused its unwriting."); }
  },

  async addZodiacEdge(args: unknown, _ctx?: ActionContext) {
    try {
      const r = addEdge(String((args as any)?.a ?? ""), String((args as any)?.b ?? ""));
      return { ...r, graph: zodiacGraph() };
    } catch (e) { badRequest(e instanceof Error ? e.message : "The road refused its laying."); }
  },

  async deleteZodiacEdge(args: unknown, _ctx?: ActionContext) {
    try {
      const r = deleteEdge(String((args as any)?.a ?? ""), String((args as any)?.b ?? ""));
      return { ...r, graph: zodiacGraph() };
    } catch (e) { badRequest(e instanceof Error ? e.message : "The road refused its cutting."); }
  },

  async resetZodiacGraph(_args: unknown, _ctx?: ActionContext) {
    return { ok: true as const, graph: resetGraph() };
  },

  async getAspectAttunement(_args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const now = Date.now();
    const THRESHOLD = 10;
    const POINTS_PER_HOUR = 1;
    // Thinning's tooth (Weather, 2026-10-15): attunement completes
    // twice as fast under a thinning sky. The live sky applies — the
    // rate of the sky at the moment this accrual is reckoned governs
    // the window being settled, exactly as a storm governs the battle
    // being resolved when it breaks.
    const { mood: attuneSky } = await getWorldMood();
    const attunementRateMult = moodEffects(attuneSky).attunementRateMult;

    // Get all Binding Awoken with their compositions
    const binders = await db.select({
      awakenedId: schema.fieldPlacements.awakenedId,
      tileId: schema.fieldPlacements.tileId,
      compositionJson: schema.awakened.compositionJson,
    }).from(schema.fieldPlacements)
      .innerJoin(schema.awakened, eq(schema.fieldPlacements.awakenedId, schema.awakened.id))
      .where(and(
        eq(schema.fieldPlacements.ownerKey, ownerKey),
        eq(schema.fieldPlacements.stance, "binding")
      ));

    // Load current attunement
    const rows = await db.select().from(schema.aspectAttunement)
      .where(eq(schema.aspectAttunement.ownerKey, ownerKey));
    const attunement = new Map<string, { points: number; updatedAt: Date }>();
    for (const r of rows) {
      attunement.set(r.element, { points: r.points, updatedAt: r.updatedAt });
    }
    // Ensure all 4 elements exist
    for (const el of ["tide", "sky", "stone", "root"]) {
      if (!attunement.has(el)) {
        attunement.set(el, { points: 0, updatedAt: new Date(now) });
        await db.insert(schema.aspectAttunement)
          .values({ ownerKey, element: el as any, points: 0, updatedAt: new Date(now) })
          .onConflictDoNothing();
      }
    }

    // Calculate elapsed time and accumulate points
    // Use the oldest updatedAt as the checkpoint (conservative)
    let oldestUpdate = now;
    for (const [, v] of attunement) {
      const t = v.updatedAt.getTime();
      if (t < oldestUpdate) oldestUpdate = t;
    }
    const hoursElapsed = Math.max(0, (now - oldestUpdate) / (1000 * 60 * 60));
    // Cap at 24h to prevent huge jumps after long absence
    const cappedHours = Math.min(hoursElapsed, 24);

    // Always advance the checkpoint (no retroactive attunement)
    // If no binders, just update timestamps without adding points
    if (binders.length === 0) {
      for (const [el] of attunement) {
        await db.update(schema.aspectAttunement)
          .set({ updatedAt: new Date(now) })
          .where(and(
            eq(schema.aspectAttunement.ownerKey, ownerKey),
            eq(schema.aspectAttunement.element, el as any)
          ));
      }
    }

    if (cappedHours > 0 && binders.length > 0) {
      // Find active attunement shrines and their tile positions
      const shrines = await db.select({
        tileId: schema.territoryBuildings.tileId,
      }).from(schema.territoryBuildings)
        .where(and(
          eq(schema.territoryBuildings.ownerKey, ownerKey),
          eq(schema.territoryBuildings.buildingType, "attunement-shrine"),
          eq(schema.territoryBuildings.status, "active"),
          // A shrine turned to the LAND gives no blessing (Nigel,
          // 2026-10-14): the doubling sleeps while it attunes.
          eq(schema.territoryBuildings.mode, "blessing")
        ));
      const shrineTileIds = new Set(shrines.map(s => s.tileId));
      // Get tile coordinates for adjacency check
      const allTiles = await db.select({
        id: schema.territoryTiles.id,
        q: schema.territoryTiles.q,
        r: schema.territoryTiles.r,
      }).from(schema.territoryTiles)
        .where(eq(schema.territoryTiles.ownerKey, ownerKey));
      const tileById = new Map(allTiles.map(t => [t.id, t]));
      const hexDist = (a: any, b: any) =>
        (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
      const isNearShrine = (binderTileId: number): boolean => {
        const bTile = tileById.get(binderTileId);
        if (!bTile) return false;
        for (const sid of shrineTileIds) {
          const sTile = tileById.get(sid);
          if (sTile && hexDist(bTile, sTile) <= 1) return true;
        }
        return false;
      };

      // For each binder, its 1 point/hour is divided across its elements
      // IN PROPORTION to its element points (pieces = 1 pt, aspects = 1 pt
      // per level) — the same rule the map tick uses, so the split is one
      // rule everywhere (Nigel, 2026-10-12). Total stays 1 pt/hour per
      // binder (doubled adjacent to an attunement shrine).
      const gains = new Map<string, number>();
      for (const b of binders) {
        let layers: any[];
        try { layers = JSON.parse(b.compositionJson || "[]"); }
        catch { continue; }
        const counts: Record<string, number> = { tide: 0, sky: 0, stone: 0, root: 0 };
        const layerEls = await compositionElements(layers);
        layers.forEach((l, i) => {
          const el = layerEls[i];
          if (el !== "fire" && el in counts) {
            counts[el] += l.category === "aspect" ? ((l as any).aspectLevel ?? 1) : 1;
          }
        });
        const totalPts = Object.values(counts).reduce((a, x) => a + x, 0);
        if (totalPts === 0) continue;
        const multiplier = (isNearShrine(b.tileId) ? 2 : 1) * attunementRateMult;
        const tickTotal = POINTS_PER_HOUR * cappedHours * multiplier;
        for (const [el, pts] of Object.entries(counts)) {
          if (pts === 0) continue;
          gains.set(el, (gains.get(el) || 0) + tickTotal * (pts / totalPts));
        }
      }
      // Apply gains and check for threshold
      for (const [el, gain] of gains) {
        const current = attunement.get(el)!;
        let newPoints = current.points + gain;
        // Spawn aspect if threshold reached. The birth chooses a
        // piece FILED as this element (never a name pattern), and
        // the points are spent only when a birth truly happens —
        // until today this loop spent them even when its name-match
        // found nothing and no aspect was born.
        while (newPoints >= THRESHOLD) {
          const pool = await db.select().from(schema.layerAssets)
            .where(eq(schema.layerAssets.category, "aspect"));
          const matches = birthableAspects(pool as any[], el);
          if (!matches.length) break;
          newPoints -= THRESHOLD;
          const pick = matches[Math.floor(Math.random() * matches.length)];
          await db.insert(schema.aspectInventory)
            .values({ ownerKey, aspectAssetId: pick.id });
        }
        attunement.set(el, { points: newPoints, updatedAt: new Date(now) });
        await db.update(schema.aspectAttunement)
          .set({ points: newPoints, updatedAt: new Date(now) })
          .where(and(
            eq(schema.aspectAttunement.ownerKey, ownerKey),
            eq(schema.aspectAttunement.element, el as any)
          ));
        await db.update(schema.aspectAttunement)
          .set({ lifetimeGains: sql`${schema.aspectAttunement.lifetimeGains} + ${gain}` })
          .where(and(
            eq(schema.aspectAttunement.ownerKey, ownerKey),
            eq(schema.aspectAttunement.element, el as any)
          ));
      }
      // Update timestamps for elements with no gains
      for (const [el, v] of attunement) {
        if (!gains.has(el)) {
          await db.update(schema.aspectAttunement)
            .set({ updatedAt: new Date(now) })
            .where(and(
              eq(schema.aspectAttunement.ownerKey, ownerKey),
              eq(schema.aspectAttunement.element, el as any)
            ));
        }
      }
    }

    const levels: Record<string, number> = { tide: 0, sky: 0, stone: 0, root: 0, fire: 0 };
    for (const [el, v] of attunement) {
      if (el in levels) levels[el] = Math.floor(v.points * 10) / 10; // Round to 1 decimal
    }
    const invRows = await db.select().from(schema.aspectInventory)
      .where(eq(schema.aspectInventory.ownerKey, ownerKey));
    const inventory = [];
    for (const inv of invRows) {
      const asset = await db.select().from(schema.layerAssets)
        .where(eq(schema.layerAssets.id, inv.aspectAssetId)).limit(1);
      if (asset.length) {
        inventory.push({
          id: inv.id,
          name: asset[0].name,
          element: storedElement((asset[0] as any).element),
          imageUrl: asset[0].imageBlobKey ? blobUrl(asset[0].imageBlobKey) : null,
        });
      }
    }
    // Realized inflow rate per element (points/hour), MEASURED from the
    // lifetime gains counter — every system that feeds a meter counts
    // (binding channeling while the map is open, the hourly accrual,
    // shrine doubling inside that accrual). Sampled over >=60s windows.
    const rates: Record<string, number> = { tide: 0, sky: 0, stone: 0, root: 0, fire: 0 };
    const freshRows = await db.select().from(schema.aspectAttunement)
      .where(eq(schema.aspectAttunement.ownerKey, ownerKey));
    for (const r of freshRows) {
      if (!(r.element in rates)) continue;
      const sampledAtMs = r.sampledAt ? new Date(r.sampledAt).getTime() : 0;
      if (!sampledAtMs) {
        await db.update(schema.aspectAttunement)
          .set({ sampleGains: r.lifetimeGains, sampledAt: new Date(now) })
          .where(and(eq(schema.aspectAttunement.ownerKey, ownerKey), eq(schema.aspectAttunement.element, r.element as any)));
        rates[r.element] = 0;
      } else if (now - sampledAtMs >= 60000) {
        const hours = (now - sampledAtMs) / 3600000;
        const rate = Math.max(0, (r.lifetimeGains - r.sampleGains) / hours);
        const rounded = Math.round(rate * 10) / 10;
        await db.update(schema.aspectAttunement)
          .set({ sampleGains: r.lifetimeGains, sampledAt: new Date(now), displayRate: rounded })
          .where(and(eq(schema.aspectAttunement.ownerKey, ownerKey), eq(schema.aspectAttunement.element, r.element as any)));
        rates[r.element] = rounded;
      } else {
        rates[r.element] = r.displayRate ?? 0;
      }
    }
    // The worn stacks (for the panel's Combine surface): every Awoken
    // of this tender that wears aspects, with each aspect's layer key,
    // filed element and level — so a combine can name its target.
    const wornRows = await db.select({ id: schema.awakened.id, name: schema.awakened.name, compositionJson: schema.awakened.compositionJson })
      .from(schema.awakened).where(eq(schema.awakened.ownerKey, ownerKey));
    const wornAspects: any[] = [];
    for (const w of wornRows) {
      let wLayers: any[] = [];
      try { wLayers = JSON.parse(w.compositionJson || "[]"); } catch { wLayers = []; }
      // Heal ghost aspect layers (Nigel, 2026-10-18): aspects worn
      // from before the aspect record rode in the composition — and
      // every aspect the random-assignment pass placed, which names
      // its piece by bare asset id and carries no record at all —
      // have no aspectElement, so the panel priced their deepening
      // from an empty pool and they could never rise. Resolve the
      // piece each such layer names (a "db:" id, a bare legacy id,
      // or an inventory aspect since spent), stamp its filed
      // element, level and art onto the layer, and write the
      // composition back healed.
      let healed = false;
      for (const l of wLayers) {
        if (l?.category !== "aspect") continue;
        if (l.aspectElement && l.aspectElement !== "neutral") continue;
        const sid = String(l.source_id ?? "");
        let assetId = parseDbId(sid);
        if (assetId === null && /^\d+$/.test(sid)) assetId = Number(sid);
        if (assetId === null) {
          const invMatch = sid.match(/^aspect-inv:(\d+)$/);
          if (invMatch) {
            const invRows = await db.select({ aspectAssetId: schema.aspectInventory.aspectAssetId })
              .from(schema.aspectInventory)
              .where(and(
                eq(schema.aspectInventory.id, Number(invMatch[1])),
                eq(schema.aspectInventory.ownerKey, ownerKey)
              ))
              .limit(1);
            assetId = invRows[0]?.aspectAssetId ?? null;
          }
        }
        if (assetId === null) continue;
        const assetRows = await db.select().from(schema.layerAssets)
          .where(eq(schema.layerAssets.id, assetId)).limit(1);
        const asset = assetRows[0] as any;
        if (!asset) continue;
        const el = storedElement(asset.element);
        if (el !== "neutral") l.aspectElement = el;
        if (l.aspectLevel == null) l.aspectLevel = 1;
        if (!l.imageBlobKey && asset.imageBlobKey) l.imageBlobKey = asset.imageBlobKey;
        if (/^\d+$/.test(sid)) l.source_id = `db:${assetId}`;
        healed = true;
      }
      if (healed) {
        await db.update(schema.awakened)
          .set({ compositionJson: JSON.stringify(wLayers) })
          .where(eq(schema.awakened.id, w.id));
      }
      const resolved = await compositionElements(wLayers);
      const aspects = wLayers
        .map((l: any, i: number) => ({ l, i }))
        .filter(({ l }: any) => l.category === "aspect")
        .map(({ l, i }: any) => ({
          key: l.source_id,
          name: l.name,
          element: resolved[i] && resolved[i] !== "neutral" ? resolved[i] : (l.aspectElement ?? null),
          level: l.aspectLevel ?? 1,
          imageUrl: l.imageBlobKey ? blobUrl(l.imageBlobKey) : null,
        }));
      if (aspects.length) wornAspects.push({ awakenedId: w.id, name: w.name, aspects });
    }
    return { levels, threshold: 10, inventoryCount: inventory.length, inventory, rates, wornAspects };
  },

  // Assign a random aspect to every Awoken missing one (workshop only).
  // Run once after uploading aspect pieces.
  async assignRandomAspects(_args: unknown, ctx?: ActionContext) {
    // TODO: verify workshop password (same as other workshop actions)
    const assetRows = await db.select().from(schema.layerAssets)
      .where(eq(schema.layerAssets.category, "aspect"));
    if (!assetRows.length) badRequest("No aspect pieces in the pool yet.");
    const all = await db.select().from(schema.awakened);
    let assigned = 0;
    for (const a of all) {
      let layers: any[];
      try { layers = JSON.parse(a.compositionJson); }
      catch { continue; }
      if (layers.some((l: any) => l.category === "aspect")) continue;
      const pick = assetRows[Math.floor(Math.random() * assetRows.length)];
      layers.push({
        source_id: pick.id, name: pick.name, category: "aspect",
        rarity: pick.rarity ?? "common", power: pick.power ?? null, toughness: pick.toughness ?? null,
      });
      await db.update(schema.awakened)
        .set({ compositionJson: JSON.stringify(layers) })
        .where(eq(schema.awakened.id, a.id));
      assigned++;
    }
    return { ok: true, assigned, total: all.length };
  },

  // Get the full roster for a confluence battle (both players' committed Awoken)
  async getConfluenceRoster(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ sessionId: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    const sessions = await db.select().from(schema.confluenceSessions)
      .where(eq(schema.confluenceSessions.id, parsed.data.sessionId)).limit(1);
    if (!sessions.length) badRequest("No such confluence.");
    const s = sessions[0];
    if (s.hostKey !== ownerKey && s.guestKey !== ownerKey) badRequest("Not your confluence.");
    const roster = await db.select().from(schema.confluenceRoster)
      .where(eq(schema.confluenceRoster.sessionId, parsed.data.sessionId));

    const assetRows = await db.select().from(schema.layerAssets);
    const assetStats = new Map<number, AssetStats>();
    for (const r of assetRows) {
      const rar = raritySchema.safeParse(r.rarity);
      if (rar.success) assetStats.set(r.id, { name: r.name, rarity: rar.data, power: r.power, toughness: r.toughness, element: (r as any).element ?? null });
    }

    const fighters = [];
    for (const r of roster) {
      const a = await db.select().from(schema.awakened)
        .where(eq(schema.awakened.id, r.awakenedId)).limit(1);
      if (!a.length) continue;
      const layers = parseLayers(a[0].compositionJson, assetStats);
      const identity = a[0].identityKey === "legacy" ? identityFor(layers) : a[0].identityKey;
      // Build idsByIdentity for empowerment
      const allRows = await db.select({ id: schema.awakened.id, identityKey: schema.awakened.identityKey, compositionJson: schema.awakened.compositionJson }).from(schema.awakened);
      const idsByIdentity = new Map<string, number[]>();
      for (const other of allRows) {
        const oid = other.identityKey === "legacy" ? identityFor(parseLayers(other.compositionJson, assetStats)) : other.identityKey;
        idsByIdentity.set(oid, [...(idsByIdentity.get(oid) ?? []), other.id]);
      }
      const payload = toAwakenedPayload(a[0] as any, layers, identity, idsByIdentity);
      fighters.push({ ...payload, ownerKey: r.ownerKey });
    }
    return { fighters, wavePower: s.wavePower, status: s.status };
  },

  // Get or create your referral link code
  async getReferralCode(_args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const existing = await db.select().from(schema.referralCodes)
      .where(eq(schema.referralCodes.inviterKey, ownerKey)).limit(1);
    if (existing.length) return { code: existing[0].code };
    const code = "AWK-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    await db.insert(schema.referralCodes).values({ code, inviterKey: ownerKey });
    return { code };
  },

  // Send a friend request by tender name or invite code
  async sendFriendRequest(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      tenderName: z.string().min(1).max(50).optional(),
      inviteCode: z.string().min(1).max(50).optional(),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    if (!parsed.data.tenderName && !parsed.data.inviteCode) badRequest("Provide a tender name or invite code.");

    let target: { id: number; tenderName: string | null } | null = null;
    if (parsed.data.tenderName) {
      const rows = await db.select().from(schema.tenders)
        .where(eq(schema.tenders.tenderName, parsed.data.tenderName)).limit(1);
      if (rows.length) target = rows[0];
    } else if (parsed.data.inviteCode) {
      const rows = await db.select().from(schema.tenders)
        .where(eq(schema.tenders.code, parsed.data.inviteCode)).limit(1);
      if (rows.length) target = rows[0];
    }
    if (!target) badRequest("No Tender found with that name or code.");
    const targetKey = tenderOwnerKey(target.id);
    if (targetKey === ownerKey) badRequest("That's you.");

    // Already friends or pending?
    const existing = await db.select().from(schema.friendships)
      .where(or(
        and(eq(schema.friendships.requesterKey, ownerKey), eq(schema.friendships.addresseeKey, targetKey)),
        and(eq(schema.friendships.requesterKey, targetKey), eq(schema.friendships.addresseeKey, ownerKey))
      )).limit(1);
    if (existing.length) badRequest(existing[0].status === "accepted" ? "Already friends." : "Request already pending.");

    await db.insert(schema.friendships).values({
      requesterKey: ownerKey, addresseeKey: targetKey, status: "pending",
    });
    return { ok: true, tenderName: target.tenderName ?? "Nameless" };
  },

  async acceptFriendRequest(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ requestId: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    const rows = await db.select().from(schema.friendships)
      .where(and(
        eq(schema.friendships.id, parsed.data.requestId),
        eq(schema.friendships.addresseeKey, ownerKey),
        eq(schema.friendships.status, "pending")
      )).limit(1);
    if (!rows.length) badRequest("No such request.");
    await db.update(schema.friendships).set({ status: "accepted" })
      .where(eq(schema.friendships.id, parsed.data.requestId));
    return { ok: true };
  },

  async declineFriendRequest(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ requestId: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    await db.update(schema.friendships).set({ status: "declined" })
      .where(and(
        eq(schema.friendships.id, parsed.data.requestId),
        eq(schema.friendships.addresseeKey, ownerKey),
        eq(schema.friendships.status, "pending")
      ));
    return { ok: true };
  },

  async listFriends(_args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const rows = await db.select().from(schema.friendships)
      .where(or(
        and(eq(schema.friendships.requesterKey, ownerKey), eq(schema.friendships.status, "accepted")),
        and(eq(schema.friendships.addresseeKey, ownerKey), eq(schema.friendships.status, "accepted"))
      ));
    const friends = [];
    for (const r of rows) {
      const friendKey = r.requesterKey === ownerKey ? r.addresseeKey : r.requesterKey;
      // ownerKey is tender:{id} — extract id
      const match = friendKey.match(/^tender:(\d+)$/);
      let name = "Nameless";
      if (match) {
        const t = await db.select().from(schema.tenders).where(eq(schema.tenders.id, parseInt(match[1]))).limit(1);
        if (t.length) name = t[0].tenderName ?? "Nameless";
      }
      // Unread count
      const unread = await db.select({ count: sql`count(*)` }).from(schema.friendMessages)
        .where(and(
          eq(schema.friendMessages.senderKey, friendKey),
          eq(schema.friendMessages.receiverKey, ownerKey),
          isNull(schema.friendMessages.readAt)
        ));
      friends.push({ ownerKey: friendKey, tenderName: name, unread: Number(unread[0]?.count ?? 0) });
    }
    const pending = await db.select().from(schema.friendships)
      .where(and(eq(schema.friendships.addresseeKey, ownerKey), eq(schema.friendships.status, "pending")));
    const pendingWithNames = [];
    for (const p of pending) {
      const match = p.requesterKey.match(/^tender:(\d+)$/);
      let name = "Nameless";
      if (match) {
        const t = await db.select().from(schema.tenders).where(eq(schema.tenders.id, parseInt(match[1]))).limit(1);
        if (t.length) name = t[0].tenderName ?? "Nameless";
      }
      pendingWithNames.push({ id: p.id, tenderName: name });
    }
    return { friends, pending: pendingWithNames };
  },

  // Send a message to a friend
  async sendMessage(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      friendKey: z.string().min(1),
      text: z.string().min(1).max(2000),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid message.");
    // Must be friends
    const f = await db.select().from(schema.friendships)
      .where(and(
        or(
          and(eq(schema.friendships.requesterKey, ownerKey), eq(schema.friendships.addresseeKey, parsed.data.friendKey)),
          and(eq(schema.friendships.requesterKey, parsed.data.friendKey), eq(schema.friendships.addresseeKey, ownerKey))
        ),
        eq(schema.friendships.status, "accepted")
      )).limit(1);
    if (!f.length) badRequest("You can only message friends.");
    await db.insert(schema.friendMessages).values({
      senderKey: ownerKey, receiverKey: parsed.data.friendKey, text: parsed.data.text.trim(),
    });
    return { ok: true };
  },

  // Get conversation with a friend
  async getMessages(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ friendKey: z.string().min(1) }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    const messages = await db.select().from(schema.friendMessages)
      .where(or(
        and(eq(schema.friendMessages.senderKey, ownerKey), eq(schema.friendMessages.receiverKey, parsed.data.friendKey)),
        and(eq(schema.friendMessages.senderKey, parsed.data.friendKey), eq(schema.friendMessages.receiverKey, ownerKey))
      ))
      .orderBy(asc(schema.friendMessages.createdAt)).limit(100);
    // Mark received as read
    await db.update(schema.friendMessages)
      .set({ readAt: new Date() })
      .where(and(
        eq(schema.friendMessages.senderKey, parsed.data.friendKey),
        eq(schema.friendMessages.receiverKey, ownerKey),
        isNull(schema.friendMessages.readAt)
      ));
    return { messages: messages.map(m => ({
      id: m.id, text: m.text, mine: m.senderKey === ownerKey,
      createdAt: m.createdAt.toISOString(),
    })) };
  },

  /** THE TENDER'S STAND (Nigel, 2026-10-19 — one field system,
   *  two grounds): where the Tender's body stands in his homeland.
   *  Only a CLASSED Tender has a stand at all (the Class Gate: no
   *  choosing, no figure). The anchor is the stored hex, or — the
   *  first time — the bastion rule: his bastion's tile, else the
   *  heart (0,0) once it is pure, else his first purified hex. A
   *  defaulted anchor is written down so it never wanders. */
  /** THE BASTION ANCHOR (Phase D, 2026-10-19), COMPLETED BY
   *  THE SAFE HEX'S OFFICE (Nigel, 2026-10-23 23:26: "The
   *  Tender respawns there if there is no bastion."): where a
   *  fallen Tender wakes. The reading stands in the office's
   *  own order — A STANDING BASTION FIRST; no bastion, THE
   *  SAFE HEX. Below the bastion the chain is the safe hex
   *  guarantee's own (the one ensureOneSafeSquare walks,
   *  piece 7): the heart (0,0) — the first seed's hex — once
   *  it stands pure, else the nearest other pure ground to
   *  the heart by the land's ring law, lowest id breaking
   *  the tie, so the hex the respawn reads is the very hex
   *  the guarantee restores when all his ground is gone —
   *  the backfill and this office are one reading, not two.
   *  (Before this build the fallback below the heart was
   *  reckoned by |q|+|r|, a measure the guarantee does not
   *  use, so the two readings could name different hexes.)
   *  One guard tenderStand does not need stands as Phase D
   *  left it: the wake never lands mid-curse, so a cursed
   *  bastion tile is passed over for the safe hex below it.
   *  The rebuilding ground is a HEX (Nigel, 2026-10-23
   *  23:25): the map is hexes. */
  async bastionAnchorTileId(ownerKey: string, tiles: any[]): Promise<number | null> {
    const byId = new Map<number, any>(tiles.map((t: any) => [t.id, t]));
    try {
      const b = sqlite.prepare("SELECT b.tile_id AS tileId FROM star_seeds s JOIN territory_buildings b ON b.id = s.bastion_building_id WHERE s.owner_key = ? AND s.bastion_building_id IS NOT NULL LIMIT 1").get(ownerKey) as { tileId: number } | undefined;
      if (b && byId.has(b.tileId) && !byId.get(b.tileId).cursed) return b.tileId;
    } catch { /* no bastion standing — the safe hex answers */ }
    const heart = tiles.find((t: any) => t.q === 0 && t.r === 0 && !t.cursed);
    if (heart) return heart.id;
    const ring = (t: any) => Math.max(Math.abs(t.q), Math.abs(t.r), Math.abs(t.q + t.r));
    const pure = tiles.filter((t: any) => !t.cursed)
      .sort((a: any, b: any) => ring(a) - ring(b) || a.id - b.id);
    return pure[0]?.id ?? null;
  },

  async tenderStand(ownerKey: string, tiles: any[]): Promise<{ tileId: number; classKey: string; weaponKey: string | null } | null> {
    const progress = await getTenderProgress(ownerKey);
    if (!progress.classKey) return null;
    const byId = new Map<number, any>(tiles.map((t: any) => [t.id, t]));
    const row = sqlite.prepare("SELECT tender_tile_id AS tileId FROM tender_progress WHERE owner_key = ?").get(ownerKey) as { tileId: number | null } | undefined;
    let tileId = row?.tileId ?? null;
    if (tileId != null && !byId.has(tileId)) tileId = null;
    if (tileId == null) {
      let chosen: number | null = null;
      try {
        const b = sqlite.prepare("SELECT b.tile_id AS tileId FROM star_seeds s JOIN territory_buildings b ON b.id = s.bastion_building_id WHERE s.owner_key = ? AND s.bastion_building_id IS NOT NULL LIMIT 1").get(ownerKey) as { tileId: number } | undefined;
        if (b && byId.has(b.tileId)) chosen = b.tileId;
      } catch { /* no bastion yet — the chain walks on */ }
      if (chosen == null) {
        const heart = tiles.find((t: any) => t.q === 0 && t.r === 0 && !t.cursed);
        if (heart) chosen = heart.id;
      }
      if (chosen == null) {
        const pure = tiles.filter((t: any) => !t.cursed)
          .sort((a: any, b: any) => (Math.abs(a.q) + Math.abs(a.r)) - (Math.abs(b.q) + Math.abs(b.r)) || a.id - b.id);
        if (pure[0]) chosen = pure[0].id;
      }
      if (chosen == null) return null;
      tileId = chosen;
      sqlite.prepare("INSERT INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 0, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET tender_tile_id = excluded.tender_tile_id")
        .run(ownerKey, Date.now());
      sqlite.prepare("UPDATE tender_progress SET tender_tile_id = ? WHERE owner_key = ?").run(tileId, ownerKey);
    }
    return { tileId, classKey: progress.classKey, weaponKey: progress.weaponKey };
  },

  /** THE MUSTER (the Table's follow law, come home): followers
   *  standing beyond the Tender's ring are given a free march to
   *  a free standing point near the Tender (2026-10-23: points,
   *  not ring-tile offsets; clean ring ground preferred, cursed
   *  ring ground dealt at its prices), at their own gait — the
   *  homeland twin of the Table's musterFollowers, settled
   *  lazily on read exactly where marches already settle. */
  async settleTenderMuster(ownerKey: string, tiles: any[], anchorTileId: number): Promise<void> {
    const anchor = tiles.find((t: any) => t.id === anchorTileId);
    if (!anchor) return;
    const dist = (a: any, b: any) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
    const placements = await db.select().from(schema.fieldPlacements).where(eq(schema.fieldPlacements.ownerKey, ownerKey));
    const followers = (placements as any[]).filter(p => p.follow === 1 && !p.marchPath);
    if (!followers.length) return;
    // THE RING DARES THE CURSE (Nigel, 2026-10-23): the
    // ring's slots are every passable hex around the
    // Tender — clean ground dealt FIRST by preference,
    // cursed ground dealt at its prices when the ring
    // offers nothing cleaner (the road's reckoning below
    // already charges cursed steps at twice the time,
    // and the curse's attrition settles as ever). Only
    // the collision exclusions bar a slot: floating
    // isles and stone still gathering hold no one.
    const slots = tiles.filter((t: any) => (t.z ?? 0) === 0 && (t.buildStage ?? 0) !== 1 && dist(t, anchor) <= 1)
      .sort((a: any, b: any) => (a.cursed ? 1 : 0) - (b.cursed ? 1 : 0) || dist(a, anchor) - dist(b, anchor) || a.id - b.id);
    if (!slots.length) return;
    const loadOf = (tileId: number) => (placements as any[]).reduce((n, p) => {
      if (p.tileId === tileId && !p.marchPath) return n + 1;
      if (p.marchPath) { try { const r = JSON.parse(p.marchPath); if (Array.isArray(r) && r[r.length - 1] === tileId) return n + 1; } catch { /* broken roads hold no room */ } }
      return n;
    }, 0);
    const now = Date.now();
    let mustered = 0;
    for (const p of followers) {
      const home = tiles.find((t: any) => t.id === p.tileId);
      if (!home || dist(home, anchor) <= 1) continue;
      // The ring's room is a PREFERENCE, never a gate (the
      // Crowding Gate, Nigel 2026-10-18): the nearest open
      // slot with a road takes the follower, as ever — and
      // when every ring slot stands crowded, the nearest
      // roaded slot takes it all the same. The crowd slows
      // the muster's pace (the gate rides the reckoning
      // below); it does not strand a follower beyond the
      // ring the Tender has walked away from.
      let slot: any = null, road: number[] | null = null;
      const musterBlocked = buildStepBlocked(ownerKey);
      for (const s of slots) {
        const r = findAnyRoad(tiles as any, p.tileId, s.id, musterBlocked);
        if (!r || r.length < 2) continue;
        if (loadOf(s.id) < 4) { slot = s; road = r; break; }
        if (!slot) { slot = s; road = r; }
      }
      if (!slot || !road) continue;
      {
        const awRows = await db.select().from(schema.awakened).where(eq(schema.awakened.id, p.awakenedId)).limit(1);
        const aw = awRows[0] as any;
        let layers: { element?: string | null }[] = [];
        try { layers = JSON.parse(aw?.compositionJson ?? "[]"); } catch { layers = []; }
        const secPerHex = marchSecondsPerHexFor(layers, aw?.experience ?? 0);
        const cursedById = new Map((tiles as any[]).map((t: any) => [t.id, !!t.cursed]));
        // THE MUSTER'S STANDING POINT (Nigel, 2026-10-23):
        // a follower does not land on a ring tile's fixed
        // offsets — it is given a free point NEAR THE
        // TENDER: partway from his ground toward the ring
        // slot the road runs to, spread follower by
        // follower (depth by thirds, then a lateral step
        // along the ring's own arc) so a company gathers
        // around him instead of stacking on one spot.
        const dq = slot.q - anchor.q, dr2 = slot.r - anchor.r;
        const depth = 0.45 + 0.15 * (mustered % 3);
        const lat = ((Math.floor(mustered / 3) % 3) - 1) * 0.18;
        const pointQ = anchor.q + dq * depth + (-dr2) * lat;
        const pointR = anchor.r + dr2 * depth + (dq + dr2) * lat;
        mustered++;
        await db.update(schema.fieldPlacements)
          .set({ marchPath: JSON.stringify(road), marchSince: now, marchEnds: now + Math.round(marchWeightedSeconds(road, secPerHex, (id) => !!cursedById.get(id), marchCrowdOf(placements as any[], new Set([p.awakenedId]))) * 1000), marchGoal: null, marchPosQ: pointQ, marchPosR: pointR })
          .where(eq(schema.fieldPlacements.id, p.id));
        p.marchPath = JSON.stringify(road);
      }
    }
  },

  /** PHASE D — TENDER ATTRITION (Nigel, 2026-10-19): the Tender's
   *  homeland body, settled like his Awokin's curse withering —
   *  from a watermark, at the same rate (0.01×(ring+1) of his
   *  greatest health per 2.8s beat, one settle never reckoning
   *  more than a minute), while he stands on cursed ground. On
   *  clean ground the land mends him instead, at the heart's
   *  share (1% per beat). The fall, when it comes, fires ONCE:
   *  hp rests at 0 under a blackout, and when the blackout lifts
   *  he wakes half-healed at the respawn's reading of ground —
   *  his standing bastion, or, with no bastion, his safe hex
   *  (THE SAFE HEX'S OFFICE, Nigel, 2026-10-23 23:26; the
   *  reading itself is bastionAnchorTileId's). */
  async settleTenderBody(ownerKey: string, tiles: any[], standTileId: number): Promise<number> {
    const TENDER_BLACKOUT_MS = 15000;
    const now = Date.now();
    const progress = await getTenderProgress(ownerKey);
    const maxHp = progress.maxTenderHp;
    const row = sqlite.prepare("SELECT hp, curse_watermark AS wm, down_until AS downUntil, fell_count AS fell FROM tender_progress WHERE owner_key = ?").get(ownerKey) as any;
    if (!row) return standTileId;
    let hp = row.hp == null ? maxHp : Number(row.hp);
    if (hp > maxHp) hp = maxHp;
    let wm: number | null = row.wm ?? null;
    let downUntil: number | null = row.downUntil ?? null;
    const save = () => sqlite.prepare("UPDATE tender_progress SET hp = ?, curse_watermark = ?, down_until = ? WHERE owner_key = ?")
      .run(hp, wm, downUntil, ownerKey);
    // THE WAKE: the blackout has run out.
    if (downUntil != null && now >= downUntil) {
      let anchor = await this.bastionAnchorTileId(ownerKey, tiles);
      if (anchor == null) {
        // THE SAFE HEX'S OFFICE, KEPT AT THE WAKE ITSELF
        // (Nigel, 2026-10-23 23:26): no bastion stands and
        // no safe hex stands either — the reading found no
        // ground to wake on at all. On the homeland read
        // (getTerritory) the guarantee has already fired,
        // first, before the battle settles, so this branch
        // is never reached there; but the office is kept
        // here too, at the placing itself, so no respawn
        // is ever read before the guarantee has had its
        // say: ensure the safe hex (ensureOneSafeSquare,
        // piece 7 — it mutates `tiles` in place), then read
        // the anchor again off the ground it restored.
        await ensureOneSafeSquare(ownerKey, tiles);
        anchor = await this.bastionAnchorTileId(ownerKey, tiles);
      }
      downUntil = null;
      hp = maxHp / 2;
      wm = null;
      save();
      if (anchor != null) {
        sqlite.prepare("UPDATE tender_progress SET tender_tile_id = ? WHERE owner_key = ?").run(anchor, ownerKey);
        return anchor;
      }
      return standTileId;
    }
    if (downUntil != null) { save(); return standTileId; } // still down: no drain, no mend, no second fall
    const tile = tiles.find((t: any) => t.id === standTileId);
    if (!tile) { save(); return standTileId; }
    if (wm == null) { wm = now; save(); return standTileId; }
    const elapsed = Math.min(now - wm, 60000);
    if (elapsed < 1000) { save(); return standTileId; }
    const beats = elapsed / 2800;
    if (tile.cursed) {
      const ring = Math.max(Math.abs(tile.q), Math.abs(tile.r), Math.abs(tile.q + tile.r));
      hp -= maxHp * (0.01 * (ring + 1)) * beats;
      if (hp <= 0) {
        // THE FALL — fires once; the blackout holds him at 0.
        hp = 0;
        wm = null;
        downUntil = now + TENDER_BLACKOUT_MS;
        sqlite.prepare("UPDATE tender_progress SET hp = 0, curse_watermark = NULL, down_until = ?, fell_count = fell_count + 1 WHERE owner_key = ?")
          .run(downUntil, ownerKey);
        return standTileId;
      }
      wm = now;
      save();
      return standTileId;
    }
    // Clean ground mends him at the heart's share.
    hp = Math.min(maxHp, hp + maxHp * 0.01 * beats);
    wm = now;
    save();
    return standTileId;
  },

  /** One wound to the Tender's homeland body, from a named
   *  peril (a border Fray's teeth). The shield law holds: this
   *  path is only ever called when nothing of his stands closer.
   *  A wound that empties the pool is a fall, with the same
   *  blackout and ledger as the curse's own. */
  async woundTender(ownerKey: string, damage: number): Promise<void> {
    const TENDER_BLACKOUT_MS = 15000;
    const now = Date.now();
    const row = sqlite.prepare("SELECT hp, down_until AS downUntil FROM tender_progress WHERE owner_key = ?").get(ownerKey) as any;
    if (!row || (row.downUntil != null && Number(row.downUntil) > now)) return; // already down: the fallen are not bitten twice
    const progress = await getTenderProgress(ownerKey);
    const hp = (row.hp == null ? progress.maxTenderHp : Number(row.hp)) - damage;
    if (hp <= 0) {
      sqlite.prepare("UPDATE tender_progress SET hp = 0, curse_watermark = NULL, down_until = ?, fell_count = fell_count + 1 WHERE owner_key = ?")
        .run(now + TENDER_BLACKOUT_MS, ownerKey);
    } else {
      sqlite.prepare("UPDATE tender_progress SET hp = ? WHERE owner_key = ?").run(hp, ownerKey);
    }
  },

  /** The Tender's body as the map serves it: the pool, its
   *  greatest measure, the blackout, and the fall ledger. */
  async tenderBodyView(ownerKey: string): Promise<{ hp: number; maxHp: number; down: boolean; downUntil: number | null; fellCount: number } | null> {
    const progress = await getTenderProgress(ownerKey);
    if (!progress.classKey) return null;
    const row = sqlite.prepare("SELECT hp, down_until AS downUntil, fell_count AS fell FROM tender_progress WHERE owner_key = ?").get(ownerKey) as any;
    if (!row) return null;
    const now = Date.now();
    const downUntil = row.downUntil ?? null;
    return {
      hp: row.hp == null ? progress.maxTenderHp : Math.min(Number(row.hp), progress.maxTenderHp),
      maxHp: progress.maxTenderHp,
      down: downUntil != null && Number(downUntil) > now,
      downUntil,
      fellCount: Number(row.fell ?? 0),
    };
  },

  /** THE SPAWNING (Phase D's Blind Fray tuning, kept and
   *  re-housed by the battle engine, Nigel 2026-10-23): while
   *  the Tender is online (his map read is the world's pulse),
   *  cursed hexes in the OUTER view of his stand — rings 3–6 —
   *  roll on each spawn beat (~45s) to birth the dark (THE
   *  TUNING, Nigel, 2026-10-20: 20% a beat, and nothing is
   *  born at rings 0–2 beside him). What is born now answers
   *  to the WAVE INTENSITY: its cap grows by 2 a step, its
   *  kinds deepen (Hollow steps in at 2, the Unraveler at 3,
   *  the Tangle at 4), and each stands at its wave's level —
   *  its body deepened a point a level past the first. While
   *  the LIGHTHOUSE BURNS, nothing is born at all (the
   *  protection settle has already driven the standing dark
   *  off). The walking, the biting and the answering live in
   *  settleHomelandBattle; this pass only keeps the cradle
   *  and the roll of the standing dark. EARLY ENTRY
   *  (Nigel, 2026-10-23 23:33): an under-prepared Tender
   *  standing on cursed ground (level < 3, or fewer than
   *  20 Awoken held — either mark unmet) births under an
   *  intensity one step hotter than the standing wave; the
   *  full reading stands at the raise itself, below. */
  async settleWanderers(ownerKey: string, tiles: any[], standTileId: number | null): Promise<{ views: { id: number; tileId: number; kind: string; posQ: number; posR: number; hp: number; maxHp: number }[] }> {
    const SPAWN_BEAT_MS = 45000, SPAWN_CHANCE = 0.20, VIEW_RING = 6, BIRTH_RING = 3, CATCHUP_BEATS = 4;
    const now = Date.now();
    const byId = new Map<number, any>(tiles.map((t: any) => [t.id, t]));
    const hexDist = (a: any, b: any) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
    const prow = sqlite.prepare("SELECT lighthouse_lit AS lit, wave_intensity AS intensity FROM tender_progress WHERE owner_key = ?").get(ownerKey) as any;
    const lit = Number(prow?.lit) === 1;
    // The STANDING wave intensity, as the protection settle
    // left it. The early-entry raise below reads ONE STEP
    // hotter than this into a local reckoning only — the
    // stored intensity is never written by this pass, so a
    // prepared Tender's reckoning, and the reign's own
    // escalation, stand exactly as they stood.
    let intensity = Math.max(1, Number(prow?.intensity) || 1);
    const viewOf = (w: { id: number; tileId: number; kind: string; posQ: number | null; posR: number | null; hp: number | null; lvl: number }) => {
      const t = byId.get(w.tileId);
      const maxHp = (HOMELAND_DARK_HP[w.kind] ?? 3) + Math.max(0, (Number(w.lvl) || 1) - 1);
      return { id: w.id, tileId: w.tileId, kind: w.kind, posQ: w.posQ == null ? (t?.q ?? 0) : Number(w.posQ), posR: w.posR == null ? (t?.r ?? 0) : Number(w.posR), hp: w.hp == null ? maxHp : Number(w.hp), maxHp };
    };
    let rows = sqlite.prepare("SELECT id, tile_id AS tileId, kind, pos_q AS posQ, pos_r AS posR, hp, lvl FROM homeland_wanderers WHERE owner_key = ?").all(ownerKey) as any[];
    // A wanderer whose tile is gone from the world is gone
    // with it; every other standing figure keeps its point.
    rows = rows.filter(w => {
      if (byId.has(w.tileId)) return true;
      sqlite.prepare("DELETE FROM homeland_wanderers WHERE id = ?").run(w.id);
      return false;
    });
    // SPAWN BEATS — rolled per beat due, a capped catch-up so
    // an absence is weather, not a flood; beats skipped past
    // the cap are settled as spent, never banked. The lit
    // lighthouse shuts the cradle whole.
    if (standTileId != null && !lit) {
      const stand = byId.get(standTileId);
      // EARLY ENTRY RAISES DIFFICULTY (Nigel, 2026-10-23
      // 23:33): going into the cursed lands BEFORE LEVEL 3,
      // or BEFORE HOLDING AT LEAST 20 AWOKEN, increases the
      // difficulty. THE BUILD'S READING, NAMED FOR NIGEL'S
      // STRIKE: while an under-prepared Tender STANDS ON A
      // CURSED TILE — the cursed lands themselves — this
      // cradle's pressure reckoning reads ONE STEP HOTTER:
      // the effective intensity below is the standing wave
      // intensity + 1, and that one step moves everything
      // the cradle already reckons by intensity — the
      // standing cap grows by 2, the kind pool deepens one
      // threshold sooner (Hollow at standing 1, the
      // Unraveler at standing 2, the Tangle at standing 3),
      // and each newborn stands one level higher with its
      // body deepened a point (its stored level then feeds
      // the living battle's own reckoning, as any wave's
      // level does). The step bites ONLY on births this
      // pass makes onto cursed tiles at rings 3–6 of his
      // stand: foes already standing keep the level they
      // were born at, the spawn beat and its 20% chance are
      // untouched, and a Tender standing on the safe hex or
      // any purified ground draws the standing intensity
      // exactly — the raise never punishes safe ground.
      // The raise applies while EITHER mark is unmet
      // (level < 3, or fewer than 20 held, by the progress
      // ledger's own reckonings: progress.level and
      // progress.awokenCount) and lifts the moment BOTH are
      // met — nothing is stored, so the first cradle read
      // after the second mark lands reckons at the standing
      // intensity again. A prepared Tender's pass is the
      // standing pass value for value. The Table runs its
      // own battles and is not the cursed lands: nothing
      // here touches it.
      if (stand && stand.cursed) {
        const progress = await getTenderProgress(ownerKey);
        if (progress.level < 3 || progress.awokenCount < 20) intensity += 1;
      }
      const arow = sqlite.prepare("SELECT wanderer_anchor_at AS anchor, wanderer_settled_beats AS settled FROM tender_progress WHERE owner_key = ?").get(ownerKey) as any;
      if (stand && arow) {
        if (arow.anchor == null) {
          sqlite.prepare("UPDATE tender_progress SET wanderer_anchor_at = ?, wanderer_settled_beats = 0 WHERE owner_key = ?").run(now, ownerKey);
        } else {
          const due = Math.floor((now - Number(arow.anchor)) / SPAWN_BEAT_MS);
          const fresh = due - Number(arow.settled ?? 0);
          if (fresh > 0) {
            const beats = Math.min(fresh, CATCHUP_BEATS);
            const cap = 8 + 2 * (intensity - 1);
            // A BEACON'S PROTECTION (the growth cycle,
            // 2026-10-25): a seed grown to Beacon (level 3+)
            // holds PROTECTION over its center hex and all
            // 6 around it — the cradle births no dark inside
            // a Beacon's light. (The first seed's protection
            // is the Tender's lighthouse itself, whose lit
            // light has already shut this cradle whole above.)
            const beaconTiles = (sqlite.prepare("SELECT tile_id FROM star_seeds WHERE owner_key = ? AND level >= 3 AND state IN ('fallen','held','first')").all(ownerKey) as { tile_id: number }[])
              .map(rw => byId.get(rw.tile_id)).filter(Boolean) as any[];
            const view = tiles.filter((t: any) => { if (!t.cursed) return false; const d = hexDist(t, stand); if (d < BIRTH_RING || d > VIEW_RING) return false; return !beaconTiles.some(b => hexDist(t, b) <= 1); });
            const kindPool = ["fray", "fray", "fray"];
            if (intensity >= 2) kindPool.push("hollow", "hollow");
            if (intensity >= 3) kindPool.push("unraveler", "unraveler");
            if (intensity >= 4) kindPool.push("tangle");
            for (let b = 0; b < beats && rows.length < cap; b++) {
              const occupied = new Set(rows.map(w => w.tileId));
              for (const t of view) {
                if (rows.length >= cap) break;
                if (occupied.has(t.id)) continue;
                if (Math.random() < SPAWN_CHANCE) {
                  const kind = kindPool[Math.floor(Math.random() * kindPool.length)];
                  const maxHp = (HOMELAND_DARK_HP[kind] ?? 3) + (intensity - 1);
                  const info = sqlite.prepare("INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
                    .run(ownerKey, t.id, kind, now, maxHp, t.q, t.r, HOMELAND_DARK_POWER[kind] ?? 1, intensity);
                  rows.push({ id: Number(info.lastInsertRowid), tileId: t.id, kind, posQ: t.q, posR: t.r, hp: maxHp, lvl: intensity });
                  occupied.add(t.id);
                }
              }
            }
            sqlite.prepare("UPDATE tender_progress SET wanderer_settled_beats = ? WHERE owner_key = ?").run(due, ownerKey);
          }
        }
      }
    }
    return { views: rows.map(viewOf) };
  },

  /** THE HOMELAND WEAPON REFEREE (Nigel, 2026-10-20): while
   *  the Tender stands on his homeland — classed, armed, and
   *  not fallen — his runic weapon hunts on the homeland's own
   *  rhythm (this lazy settle, like the marches, the columns
   *  and the wanderers before it): on the Table's own cadence
   *  it strikes the nearest Blind Fray within its reach of his
   *  stand, with the Table's own roll — Fate's level step, and
   *  the Sage's +2 on her own blows — against the Fray's AC,
   *  its harm the weapon's die as the Table reckons it, shaped
   *  by the weapon's level and Signature and shaved by Fate's
   *  mitigation. A felled wanderer is removed. The settle never
   *  reckons more than a minute of absence (the homeland's
   *  standing cap), and a cadence with no foe in reach is not
   *  banked — as at the Table, the weapon fires when there is
   *  something to strike, and not before. Returns the last
   *  strike's record (this settle's, or an earlier one's) so
   *  the map can serve the witness: the client lunges only
   *  where this referee struck. */
  async settleHomelandWeapon(ownerKey: string, tiles: any[], standTileId: number): Promise<{ tileId: number; wandererId: number; weaponKey: string; at: number; hit: boolean; dmg: number; felled: boolean } | null> {
    const readRecord = (): { tileId: number; wandererId: number; weaponKey: string; at: number; hit: boolean; dmg: number; felled: boolean } | null => {
      const r = sqlite.prepare("SELECT weapon_strike AS s FROM tender_progress WHERE owner_key = ?").get(ownerKey) as any;
      if (!r?.s) return null;
      try { return JSON.parse(r.s); } catch { return null; }
    };
    const progress = await getTenderProgress(ownerKey);
    const wk = progress.weaponKey;
    // Classless (no stand at all reaches here), weaponless, or
    // a key the roster doesn't know: the map stays silent.
    if (!progress.classKey || !wk || !(wk in HOMELAND_WEAPON_DIE)) return readRecord();
    const row = sqlite.prepare("SELECT weapon_next_at AS nextAt, down_until AS downUntil FROM tender_progress WHERE owner_key = ?").get(ownerKey) as any;
    if (!row) return readRecord();
    const now = Date.now();
    if (row.downUntil != null && Number(row.downUntil) > now) return readRecord(); // the fallen hold no weapon
    const stand = tiles.find((t: any) => t.id === standTileId);
    if (!stand) return readRecord();
    const contract = (progress.arsenal ?? []).find(w => w.key === wk) ?? { level: 1, element: null as string | null, depth: 0, signature: false };
    const range = homelandWeaponRangeFor(wk, contract.element ?? null, contract.depth ?? 0, !!contract.signature);
    const cooldown = HOMELAND_WEAPON_COOLDOWN_MS[wk];
    const hexDist = (a: any, b: any) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
    let nextAt = row.nextAt == null ? now : Number(row.nextAt);
    if (nextAt < now - 60000) nextAt = now - 60000; // a settle never reckons more than a minute
    let record = readRecord();
    let dirty = row.nextAt == null || nextAt !== Number(row.nextAt);
    let strikes = 0;
    // The Fray's AC, read live off its workshop record
    // (enemyAC.ts): the hit is declared against it, and
    // the ratio equation then shaves by the same AC.
    const frayAC = enemyACFor("fray");
    // The tiles this settle's blows felled a wanderer on —
    // each fell pays the drip (payFellDrip) once the striking
    // is done, in the ground's own element where it holds one.
    const fellTiles: number[] = [];
    // Fells of the first seed's rising, counted apart: they
    // pay the hold's +3✦ below (the risings ride the engine,
    // 2026-10-24), as the battle's fell path pays it for the
    // company's blows.
    let seedFells = 0;
    // THE ZODIAC RIDES HIS HAND (Recovery #1): his Tender
    // attack-bonus clauses join the weapon's roll, and his
    // crit stars lower the threshold the weapon crits on.
    const zTenderAb = fxSum(ownerKey, "tenderAb");
    const zCritAt = 20 - fxSum(ownerKey, "critChance");
    const zCritHalf = fxSum(ownerKey, "critDamage");
    while (nextAt <= now && strikes < 40) {
      const foes = (sqlite.prepare("SELECT id, tile_id AS tileId, hp, seed_rising AS seedRising FROM homeland_wanderers WHERE owner_key = ?").all(ownerKey) as { id: number; tileId: number; hp: number | null; seedRising: number | null }[])
        .map(w => ({ ...w, tile: tiles.find((t: any) => t.id === w.tileId), hpNow: w.hp == null ? HOMELAND_FRAY_HP : Number(w.hp) }))
        .filter(w => w.tile && hexDist(stand, w.tile) <= range)
        .sort((a, b) => hexDist(stand, a.tile) - hexDist(stand, b.tile) || a.id - b.id);
      if (!foes.length) { nextAt = now; dirty = true; break; } // no prey: the cadence is spent, never banked
      const strikeAt = nextAt;
      const blow = (foe: typeof foes[number]) => {
        const roll = homelandDN(20);
        const bonus = homelandWeaponBonusFor(progress.classKey, progress.level) + zTenderAb;
        const crit = roll >= zCritAt;
        const hit = crit || (roll !== 1 && roll + bonus >= frayAC);
        let dmg = 0;
        if (hit) {
          // A critical carries the crit law's 2×, deepened
          // by any crit-damage half-steps held — the same
          // reading the Table's strikeFoe keeps.
          const critScale = crit ? 2 + 0.5 * zCritHalf : 1;
          dmg = homelandFateMitigate(homelandWeaponDamageFor(wk, contract.level, !!contract.signature) * critScale, frayAC, progress.level);
          foe.hpNow -= dmg;
        }
        const felled = hit && foe.hpNow <= 0;
        if (felled && foe.seedRising) seedFells++;
        if (felled) sqlite.prepare("DELETE FROM homeland_wanderers WHERE id = ?").run(foe.id);
        else if (hit) sqlite.prepare("UPDATE homeland_wanderers SET hp = ? WHERE id = ?").run(foe.hpNow, foe.id);
        return { tileId: foe.tileId, wandererId: foe.id, weaponKey: wk, at: strikeAt, hit, dmg, felled };
      };
      record = blow(foes[0]);
      if (record.felled) fellTiles.push(record.tileId);
      // PIERCE (the arrow's Signature): the same beat carries
      // through to the next-nearest distinct dark in range.
      if (wk === "arrow" && contract.signature && foes[1]) {
        record = blow(foes[1]);
        if (record.felled) fellTiles.push(record.tileId);
      }
      nextAt += cooldown;
      strikes++;
      dirty = true;
    }
    // THE RISING'S FELL PAY AT THE WEAPON (2026-10-24): a
    // Fray of the first seed's rising felled by the Tender's
    // own weapon pays the hold's +3✦, capped, as any of the
    // rising's fells pays it on the battle's fell path. The
    // weapon referee's standing bypass of the open land's
    // bounty is NOT disturbed: no protection banks, no
    // Shadow rolls, and no slayer's XP — the slayer here is
    // the Tender himself.
    if (seedFells > 0) {
      const maxEnergy = await calculateMaxEnergy(ownerKey);
      const current = await getEnergyFor(ownerKey);
      const next = Math.min(current + 3 * seedFells, maxEnergy);
      if (next !== current) {
        await db.update(schema.tenderResources)
          .set({ energy: next, updatedAt: new Date() })
          .where(eq(schema.tenderResources.ownerKey, ownerKey));
      }
    }
    // THE FELL DRIP: a wanderer the weapon beat pays as any
    // beaten creature pays (Nigel, 2026-10-20) — the element
    // of the ground it fell on, or chance's choice.
    for (const tileId of fellTiles) {
      const t = tiles.find((x: any) => x.id === tileId);
      await payFellDrip(ownerKey, t?.element ?? null);
    }
    if (dirty) {
      sqlite.prepare("UPDATE tender_progress SET weapon_next_at = ?, weapon_strike = ? WHERE owner_key = ?")
        .run(nextAt, record ? JSON.stringify(record) : null, ownerKey);
    }
    return record;
  },

  async getTerritory(_args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    // Marches land before the territory is read (War-Ground, 2026-10-16).
    await this.settleMarches(ownerKey);
    // Columns land and launch before the territory is read
    // (the Columns, 2026-10-17): the Eye is settled here.
    await this.settleIncursions(ownerKey);
    // The first seed's waves land before the territory is read
    // (Nigel via Wake, 2026-10-17): the hold's lazy settle.
    await settleFirstSeedEvent(ownerKey);
    // THE DRAW (the growth cycle, 2026-10-25): every living
    // seed drinks while the Tender herself stands on its
    // hex — feeding settles here, on the field's own read,
    // so a seed's growth is witnessed by the read that fed
    // it.
    await settleSeedFeeding(ownerKey);
    // Hourly binding heal: check if anything is wounded, heal if so
    await this.bindingHealTick({}, ctx);
    // Self-heal: if the frontier is stuck (no cursed tiles beyond purified land), grow it.
    await ensureFrontierBuffer(ownerKey);
    const tiles = await db.select().from(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
    // ONE SAFE SQUARE, ALWAYS (Nigel, 2026-10-23 22:40):
    // the guarantee stands here, on the ordinary read, after
    // every settle above has had its say (the seed's bank
    // above may itself have purified the centre this read —
    // then the guarantee rightly sleeps) and BEFORE the
    // Tender's stand is reckoned below, so a groundless
    // Tender stands ON the square this same read gives him,
    // his first three muster beside it (piece 4, below) and
    // his body settles on clean ground. It fires only when
    // NO purified tile stands; a Tender holding safe ground
    // passes through it untouched. The sowing carries the
    // other half (ensureFirstSeed): a fresh map is born with
    // its square already standing.
    await ensureOneSafeSquare(ownerKey, tiles as any[]);
    // The Seed-Calm's reach, served (Nigel, 2026-10-17): any
    // tile within two rings of a living seed carries the
    // level the curse WOULD be reckoned at there — its
    // distance from the seed — so the map can show the calm
    // lying on the land.
    {
      const seedHexes = await livingSeedHexes(ownerKey);
      if (seedHexes.length) {
        for (const t of tiles as any[]) {
          const mapRing = Math.max(Math.abs(t.q), Math.abs(t.r), Math.abs(t.q + t.r));
          const eff = calmEffRing(seedHexes, t.q, t.r, mapRing);
          if (eff < mapRing) (t as any).calmLevel = eff;
        }
      }
    }
    // Self-heal the stack law (Land, 2026-10-16): tiles cursed or
    // purified before FALLEN/PURIFIED_TILE_FIELDS rode on those paths
    // may carry a stack they have no right to — a stack on cursed
    // land, or a stack (or any tray growth) on NEUTRAL or fire land,
    // which exists only at Z1 and never stacks. Zero any such stack
    // where it stands, once; the healed row then agrees with the law.
    for (const t of tiles as any[]) {
      const hasStack = (t.sealedTrays ?? 0) > 0 || (t.growPoints ?? 0) > 0 || t.topPoints != null;
      const unlawful = t.cursed ? hasStack
        : (t.element === "neutral" || t.element === "fire") ? hasStack
        : false;
      if (!unlawful) continue;
      const clean = { sealedTrays: 0, growPoints: 0, topPoints: null, height: t.cursed ? 0 : 1 };
      await db.update(schema.territoryTiles).set(clean as any).where(eq(schema.territoryTiles.id, t.id));
      Object.assign(t, clean);
    }
    // The Tender's body settles before the field is read: his
    // stand is reckoned, and his followers muster to his ring.
    const tenderStand = await this.tenderStand(ownerKey, tiles as any[]);
    // THE FIRST THREE ARE THE PARTY (Nigel, 2026-10-23
    // 22:26 — piece 4): on the first read where a Tender
    // stands on his land with an EMPTY party ledger and
    // three or more Awoken, his first three (hatch order)
    // are entered as his party and fielded beside him,
    // following — before the muster and the living battle
    // below settle, so they answer in this read's fight as
    // they answer in every later one. An existing party is
    // never touched by the pass (fieldFirstThreeParty
    // carries the whole law); fewer than three, nothing is
    // written and the pass waits for the third.
    if (tenderStand) await fieldFirstThreeParty(ownerKey, tiles as any[], tenderStand.tileId);
    if (tenderStand) await this.settleTenderMuster(ownerKey, tiles as any[], tenderStand.tileId);
    // PHASE D — THE LIVING HOMELAND settles on the same read
    // (Nigel, 2026-10-19): the Tender's own body answers the
    // curse (and wakes at the bastion), and the Blind Fray walks.
    // Both passes run BEFORE the field is read for the response,
    // so a wake's new stand and a chew's wounds are what the map
    // serves — never their ghosts.
    let wandererViews: { id: number; tileId: number; kind: string; posQ: number; posR: number; hp: number; maxHp: number }[] = [];
    let weaponStrikeView: { tileId: number; wandererId: number; weaponKey: string; at: number; hit: boolean; dmg: number; felled: boolean } | null = null;
    let tenderView: any = tenderStand;
    if (tenderStand) {
      const stoodTileId = await this.settleTenderBody(ownerKey, tiles as any[], tenderStand.tileId);
      tenderStand.tileId = stoodTileId;
      // THE REAL-TIME BATTLE settles on this same read
      // (Nigel, 2026-10-23): first the lighthouse and its
      // bank (a lit light has already driven the standing
      // dark off and shut the cradle), then what spawning
      // the unlit world still does, then the living battle
      // itself — walk, bites, answers — before the written
      // ground and the weapon reckon what survived.
      await settleProtection(ownerKey);
      const wres = await this.settleWanderers(ownerKey, tiles as any[], tenderStand.tileId);
      wandererViews = wres.views;
      await settleHomelandBattle(ownerKey, tiles as any[], tenderStand.tileId, this.woundTender.bind(this));
      // HOMELAND CASTING (Nigel, 2026-10-20): the written
      // ground answers the dark now standing on it — blades
      // spring, lattices pin, coils throw back — before the
      // weapon looks for its quarry among the survivors.
      await settleHomelandWorkings(ownerKey, tiles as any[]);
      // THE NEW WORKINGS (Nigel, 2026-10-22; seated
      // 2026-10-23): the swarm's bites, the Hold Rune's crash
      // and grip, and Rune Shatter's held stream settle on
      // this same read, from their own timestamps.
      await settleTransientWorkings(ownerKey, tiles as any[]);
      // THE CURSE EATS THE WRITTEN LIGHT (Nigel, 2026-10-20):
      // the workings standing on cursed ground wither beside
      // their guests, on this same read — wards and runes are
      // cast anywhere now, and the cursed ground is the price.
      await settleHomelandWorkingAttrition(ownerKey, tiles as any[]);
      // THE STAR ENGINE SINGS AT HOME (2026-10-21): what
      // still stands after the wither sings its rounds into
      // the purse on this same read (settleHomelandEngines).
      await settleHomelandEngines(ownerKey);
      // THE HOMELAND WEAPON REFEREE settles after the walk
      // (Nigel, 2026-10-20): his weapon answers the dark that
      // stands within its reach of him. The wanderer views are
      // then read FRESH, so what the map serves is the strike's
      // true aftermath — wounds carried, the felled gone.
      weaponStrikeView = await this.settleHomelandWeapon(ownerKey, tiles as any[], tenderStand.tileId);
      // The Springleaf's groves mend on this same read, after
      // the fighting has had its say (Homeland Casting).
      await settleHomelandGroves(ownerKey, tiles as any[]);
      // THE RISING LANDS (the risings ride the engine,
      // 2026-10-24): the first seed's next rising, if its
      // hour has come, takes the land at the read's end —
      // after the living battle above has settled, so the
      // new Fray stand whole in this very response (the
      // fresh views below are read after this pass) and
      // their fight begins with the next read's window.
      await spawnFirstSeedRising(ownerKey, tiles as any[]);
      wandererViews = (sqlite.prepare("SELECT id, tile_id AS tileId, kind, pos_q AS posQ, pos_r AS posR, hp, lvl FROM homeland_wanderers WHERE owner_key = ?").all(ownerKey) as any[])
        .map(w => {
          const t = (tiles as any[]).find((x: any) => x.id === w.tileId);
          const maxHp = (HOMELAND_DARK_HP[String(w.kind ?? "fray")] ?? 3) + Math.max(0, (Number(w.lvl) || 1) - 1);
          return { id: Number(w.id), tileId: Number(w.tileId), kind: String(w.kind ?? "fray"), posQ: w.posQ == null ? (t?.q ?? 0) : Number(w.posQ), posR: w.posR == null ? (t?.r ?? 0) : Number(w.posR), hp: w.hp == null ? maxHp : Number(w.hp), maxHp };
        });
      const body = await this.tenderBodyView(ownerKey);
      if (body) tenderView = { ...tenderStand, ...body };
    }
    const placements = await db.select().from(schema.fieldPlacements).where(eq(schema.fieldPlacements.ownerKey, ownerKey));

    // Binding upkeep: 3 energy per hour per binder. Unpaid binding drops to defense.
    // Binding Circle (real mechanic): binders on or beside an active circle
    // pay 1/hour instead — "Binding costs 1."
    const now = Date.now();
    const BINDING_PER_HOUR = 3;
    const circleRows = await db.select().from(schema.territoryBuildings)
      .where(and(
        eq(schema.territoryBuildings.ownerKey, ownerKey),
        eq(schema.territoryBuildings.buildingType, "binding-circle"),
        eq(schema.territoryBuildings.status, "active")
      ));
    const tileByIdForUpkeep = new Map(tiles.map(t => [t.id, t]));
    const circleTiles = circleRows.map(b => tileByIdForUpkeep.get(b.tileId)).filter(Boolean) as any[];
    const hexDistU = (a: any, b: any) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
    const nearCircle = (tileId: number) => {
      const t = tileByIdForUpkeep.get(tileId);
      return !!t && circleTiles.some(ct => hexDistU(t, ct) <= 1);
    };
    for (const p of placements) {
      if (p.stance !== "binding") continue;
      const lastCharge = p.lastBindingChargeAt ? new Date(p.lastBindingChargeAt).getTime() : new Date(p.placedAt).getTime();
      const hoursElapsed = (now - lastCharge) / (60 * 60 * 1000);
      if (hoursElapsed >= 1) {
        // Cap backlog at 1 hour: upkeep is ongoing, not a debt collector.
        // Billing the full absence would punish time away (Anti-Duolingo).
        const hoursToCharge = 1;
        const cost = hoursToCharge * (nearCircle(p.tileId) ? 1 : BINDING_PER_HOUR);
        if (await spendEnergy(ownerKey, cost)) {
          await db.update(schema.fieldPlacements)
            .set({ lastBindingChargeAt: new Date() })
            .where(eq(schema.fieldPlacements.id, p.id));
          p.lastBindingChargeAt = new Date() as any;
        } else {
          // Can't pay — binding drops
          await db.update(schema.fieldPlacements)
            .set({ stance: "defense", lastBindingChargeAt: null })
            .where(eq(schema.fieldPlacements.id, p.id));
          p.stance = "defense";
        }
      }
    }
    
    // Terrain attunement — the 30-point flux (Nigel, 2026-10-14).
    // The old dice (5% a tick to flip your own tile) are abolished.
    // Now: the Awoken on a hex pour the full combined weight of their
    // elements into that hex alone — point for point, exactly as
    // attunement counts (pieces 1 pt, aspects 1 pt per level, fire
    // aside) — and the company's press is the NET of that weight
    // (Nigel, 2026-10-15, the net press: the leading element minus
    // every mismatched point, which erode it; see netPressOf below).
    // The hex holds a
    // 10-point bank: 10 points carry it from its element to neutral,
    // 10 more from neutral to the pressing element, and pressure that
    // matches its current element refills the bank — the shepherd's
    // hold. No Awoken on the hex, no change: the land is locked in
    // its state of flux until one is near. Surrounding tiles are NOT
    // attuned by presence — that reach belongs to the shrine alone.
    // AMENDED (Nigel, 2026-10-16, the day-long quest): the pour is
    // settled by the clock, not by the reading — the press accrues
    // at one-eighth strength per hour of standing (see THE DAY-LONG
    // QUEST at the company loop below). The tally math itself — the
    // net press, the 10-point bank, the witness rule — is unchanged;
    // only its tempo is the land's now, not the glance's.
    try {
      const tileById = new Map(tiles.map(t => [t.id, t]));
      const elementPointsOf = async (aw: any): Promise<Record<string, number>> => {
        let layers: any[] = [];
        try { layers = JSON.parse(aw.compositionJson || "[]"); } catch { return {}; }
        const layerEls = await compositionElements(layers);
        const counts: Record<string, number> = {};
        layers.forEach((l, i) => {
          const el = layerEls[i] as string;
          if (el === "fire" || el === "neutral") return;
          counts[el] = (counts[el] || 0) + (l.category === "aspect" ? ((l as any).aspectLevel ?? 1) : 1);
        });
        return counts;
      };
      const netPressOf = (sums: Record<string, number>): { el: string; pts: number } => {
        // THE NET PRESS (Nigel, 2026-10-15, superseding the plain
        // pooled-dominant read an hour after it was ruled): no element
        // ever contributes to a MISMATCHED attunement — it ERODES it.
        // The leading element presses at its tally MINUS every
        // mismatched point pooled on the hex: 3 tide + 1 stone + 1
        // root + 1 sky cancels to nothing; 4 root + 2 tide presses
        // root at 2. The dominant neither cancels the weaker elements
        // nor takes their power — they spend it wearing its press
        // down. Net of zero or less presses NOTHING: the company
        // stands on the hex inert this beat — no bank movement, no
        // tray growth, no erosion. (Ties hold, as before, but now by
        // arithmetic rather than by rule: a tied lead always nets to
        // zero or below.) The parts still pool across the whole
        // company on the hex; only the press that leaves the pool
        // changed. Fire and neutral never enter the sums (see
        // elementPointsOf), so they erode nothing.
        let leadEl = "", leadPts = 0, totalPts = 0;
        for (const el of ["tide", "sky", "stone", "root"]) {
          const pts = sums[el] || 0;
          totalPts += pts;
          if (pts > leadPts) { leadEl = el; leadPts = pts; }
        }
        const net = leadPts - (totalPts - leadPts);
        if (!leadEl || net <= 0) return { el: "", pts: 0 };
        return { el: leadEl, pts: net };
      };
      // The bank reckoning is pourAttunementBank (module
      // scope) — the one reckoning the standing press, the
      // shrine, and the Tender's Attune act all pour through.
      const pour = pourAttunementBank;
      // Terraforming trays (Nigel, 2026-10-15): a purified hex is a
      // STACK of trays — Z trays, cap 6. One growing tray, born at
      // the BOTTOM of the stack, accrues the matching company's
      // dominant tally point for point; at 30 it SEALS as the hex's
      // element and a new growing tray is born beneath. Only the TOP
      // tray can be hurt, and its points are its HP: a mismatched
      // company erodes it at the same rate growth pours, and when
      // the top tray's points reach 0 the stack drops one. When the
      // LAST tray falls, the purification is defeated and the tile
      // reverts to the curse (Z-1). A hex whose element flips via
      // the bank resets to a single growing tray of the new element —
      // one stack, one element, always. Neutral hexes neither grow
      // nor erode (their trays wait for an element), and fire land
      // grows no trays (fire is map-exclusive, never a stack).
      const TRAY_CAP = 6;
      const TRAY_SEAL = 30;
      const stackHeight = (t: any) => {
        const sealed = t.sealedTrays ?? 0;
        return sealed >= TRAY_CAP ? TRAY_CAP : sealed + 1;
      };
      const persistTray = async (t: any) => {
        const upd = {
          sealedTrays: t.sealedTrays ?? 0,
          growPoints: t.growPoints ?? 0,
          topPoints: t.topPoints ?? null,
          height: t.cursed ? 0 : stackHeight(t),
        };
        await db.update(schema.territoryTiles).set(upd as any).where(eq(schema.territoryTiles.id, t.id));
        Object.assign(t, upd);
      };
      // Growth: pour points into the growing tray, sealing as it
      // fills. A full stack (6 sealed) grows no further.
      const growStack = async (t: any, pts: number) => {
        if ((t.sealedTrays ?? 0) >= TRAY_CAP) return;
        // PLANT GROWTH (the zodiac's clause, Recovery #1):
        // "Plants grow 5% faster" per level, deepened —
        // every growth point the press lays lands swelled
        // by the holder's plant-growth sum.
        const growPts = pts * (1 + fxSum(ownerKey, "plantGrowth") / 100);
        let grow = (t.growPoints ?? 0) + growPts;
        let sealed = t.sealedTrays ?? 0;
        while (grow >= TRAY_SEAL && sealed < TRAY_CAP) { grow -= TRAY_SEAL; sealed += 1; }
        if (sealed >= TRAY_CAP) grow = 0;
        t.growPoints = grow;
        t.sealedTrays = sealed;
        await persistTray(t);
      };
      // The purification defeated: the tile reverts to cursed with
      // its curse HP restored by the ring law (4 + ring x 6). The
      // Awoken standing on it disperse exactly as a wave-fallen
      // tile's do (4h re-coalescence, placements cleared); buildings
      // are left standing, as tile-fall leaves them.
      const revertToCurse = async (t: any) => {
        const ring = Math.max(Math.abs(t.q), Math.abs(t.r), Math.abs(t.q + t.r));
        // Reborn cursed under the live sky (thickening's tooth).
        const { mood: skyMood } = await getWorldMood();
        const curse = curseHpFor(ring, skyMood);
        const victims = placements.filter(p => p.tileId === t.id);
        const dispersedUntil = new Date(Date.now() + 4 * 60 * 60 * 1000);
        // RETURN (the zodiac's clause, Recovery #1): the
        // holder's returnHome sum is the count of this
        // fall's victims who return home WHOLE — their
        // placements clear with the tile, as all do here,
        // but no re-coalescence is written on them.
        let returnSaves = fxSum(ownerKey, "returnHome");
        for (const v of victims) {
          if (returnSaves > 0) returnSaves--;
          else await db.update(schema.awakened).set({ dispersedUntil }).where(eq(schema.awakened.id, v.awakenedId));
          await db.delete(schema.fieldPlacements).where(eq(schema.fieldPlacements.awakenedId, v.awakenedId));
          const idx = placements.indexOf(v);
          if (idx >= 0) placements.splice(idx, 1);
        }
        const upd = {
          cursed: 1, curseHp: curse, curseMaxHp: curse, spark: 0,
          attunePoints: 0, attuneElement: null,
          sealedTrays: 0, growPoints: 0, topPoints: null, height: 0,
          // A created work falls with its land (the Building
          // System, 2026-10-19): the curse takes the hex back
          // whole — no stages, no branch, no seal — and the
          // terrain bank gives back exactly what this tile's
          // stages paid into the vessel, never a point more.
          z: 0, buildStage: 0, buildPoints: 0, buildBranch: null, buildFinish: null,
          baked: 0, lowered: 0, buildCharge: 0, bankPaid: 0,
        };
        if ((t.bankPaid ?? 0) > 0) await addTerrainBank(ownerKey, -(t.bankPaid ?? 0));
        await db.update(schema.territoryTiles).set(upd as any).where(eq(schema.territoryTiles.id, t.id));
        Object.assign(t, upd);
      };
      // Damage lands on the TOP tray alone. One tray per beat: the
      // overflow of a heavy blow is spent breaking the tray it
      // broke (the witness rule's spirit) — it does not sprint
      // down the stack in a single answer.
      const damageTopTray = async (t: any, dmg: number) => {
        // BAKED LAND DOES NOT ERODE (the Building System,
        // 2026-10-19): fire sealed the cell — a company's
        // mismatched press cannot wear what the kiln hardened.
        if ((t as any).baked) return;
        if ((t.sealedTrays ?? 0) > 0) {
          const hp = (t.topPoints ?? TRAY_SEAL) - dmg;
          if (hp > 0) { t.topPoints = hp; await persistTray(t); return; }
          t.sealedTrays = (t.sealedTrays ?? 0) - 1;
          t.topPoints = null;
          await persistTray(t);
          return;
        }
        const grow = (t.growPoints ?? 0) - dmg;
        if (grow > 0) { t.growPoints = grow; await persistTray(t); return; }
        // The bastion (0,0) never falls — the same law the wave
        // defeat honors. Its last tray can be worn bare, not lost.
        if (t.q === 0 && t.r === 0) { t.growPoints = 0; await persistTray(t); return; }
        await revertToCurse(t);
      };
      const byTile = new Map<number, any[]>();
      for (const p of placements) {
        const arr = byTile.get(p.tileId) ?? [];
        arr.push(p);
        byTile.set(p.tileId, arr);
      }
      const awCache = new Map<number, any>();
      const awOf = async (id: number) => {
        if (!awCache.has(id)) {
          const r = await db.select().from(schema.awakened).where(eq(schema.awakened.id, id)).limit(1);
          awCache.set(id, r[0]);
        }
        return awCache.get(id);
      };
      const companySums = async (company: any[]): Promise<Record<string, number>> => {
        const sums: Record<string, number> = {};
        for (const p of company) {
          const aw = await awOf(p.awakenedId);
          if (!aw) continue;
          for (const [el, n] of Object.entries(await elementPointsOf(aw))) sums[el] = (sums[el] || 0) + n;
        }
        return sums;
      };
      // THE DAY-LONG QUEST (Nigel, 2026-10-16): the company's press
      // is no longer poured whole at every reading of the map — that
      // made attunement a matter of glances, with trays sealing
      // between one look and the next. The press is now a RATE,
      // settled by the clock the way the shrine's pour already was:
      // while a company stands on a hex, the land drinks its net
      // press at one-eighth strength per hour, so a full company
      // (net ~8) carries a hex through one 10-point stage in about
      // ten hours and turns it fully in about a day, and a 30-point
      // tray seals after about a day and a quarter of standing.
      // Each settled hour is one beat, so the witness rule keeps its
      // meaning — no stage completes in the beat its bank starts.
      // Catch-up settles at most a day per reading (the backlog then
      // drains a day at a time, as the shrine's does), and an empty
      // hex keeps no clock: its anchor clears when the company
      // leaves, and a returning company starts its own day.
      // Attunement quickened (Nigel, 2026-10-17): the time a
      // hex takes to attune is reduced by a third — the land
      // drinks the press at two-thirds the old divisor (8 -> 16/3),
      // so every stage lands in two-thirds the hours. The bank,
      // the trays, and the served rate all ride this one number.
      const PRESS_DIVISOR = 8 * 2 / 3;
      const QUEST_STEP_MS = 3600 * 1000;
      const QUEST_MAX_STEPS = 24;
      for (const [tileId, company] of byTile) {
        const tile = tileById.get(tileId);
        if (!tile || tile.cursed) continue;
        const dom = netPressOf(await companySums(company));
        (tile as any).attuneRatePts = dom.pts > 0 ? Math.round((dom.pts / PRESS_DIVISOR) * 100) / 100 : 0;
        // The War-Grounds readout (Nigel, 2026-10-17): the hex's
        // dominant element and the net points of it influencing
        // the hex's attunement right now — the same net press the
        // settle pours by, served on the tile for the label.
        (tile as any).pressEl = dom.el || null;
        (tile as any).pressPts = dom.pts;
        const nowMs = Date.now();
        let anchor = tile.attuneAnchorAt ? new Date(tile.attuneAnchorAt as any).getTime() : 0;
        if (!anchor) {
          // The company has just taken its stand: the clock starts
          // now, and nothing pours yet.
          await db.update(schema.territoryTiles).set({ attuneAnchorAt: new Date(nowMs) } as any)
            .where(eq(schema.territoryTiles.id, tile.id));
          tile.attuneAnchorAt = new Date(nowMs) as any;
          continue;
        }
        // THE BUILDING SYSTEM — THE PRESENCE ROAD (Nigel,
        // 2026-10-19): a company standing on a work under
        // construction BUILDS it instead of attuning it — free,
        // and slow, at the day-long quest's own tempo. The press
        // must speak the stage's element; at stage 3's fork, tide
        // or sky crowns the branch by standing there. Fire's
        // finish by presence is always the BAKE — lowering is
        // the Tender's deliberate act, by his own pours only.
        if (buildUnderway(tile)) {
          let stepsB = Math.floor((nowMs - anchor) / QUEST_STEP_MS);
          if (stepsB <= 0) continue;
          stepsB = Math.min(stepsB, QUEST_MAX_STEPS);
          const perStepB = dom.pts / PRESS_DIVISOR;
          for (let s = 0; s < stepsB; s++) {
            anchor += QUEST_STEP_MS;
            if (!dom.el || perStepB <= 0) continue;
            if (buildStageOf(tile) === 4 && !tile.buildFinish) tile.buildFinish = "bake";
            await feedBuild(ownerKey, tile, dom.el, perStepB);
          }
          await db.update(schema.territoryTiles).set({ attuneAnchorAt: new Date(anchor) } as any)
            .where(eq(schema.territoryTiles.id, tile.id));
          tile.attuneAnchorAt = new Date(anchor) as any;
          continue;
        }
        let steps = Math.floor((nowMs - anchor) / QUEST_STEP_MS);
        if (steps <= 0) continue;
        steps = Math.min(steps, QUEST_MAX_STEPS);
        const perStep = dom.pts / PRESS_DIVISOR;
        for (let s = 0; s < steps; s++) {
          anchor += QUEST_STEP_MS;
          // An inert company (net of zero or less) pours nothing,
          // but its standing still holds the clock honest.
          if (!dom.el || perStep <= 0) continue;
          if ((tile as any).baked) {
            // SEALED (the Building System, 2026-10-19): the
            // baked cell takes no press into its bank — its
            // element cannot turn, its trays cannot erode — and
            // the charge it holds radiates into its own stack:
            // its own element's company grows it twice as fast.
            if (dom.el === tile.element) await growStack(tile, perStep * 2);
            continue;
          }
          const elementBefore = tile.element as string;
          const upd = pour(tile, dom.el, perStep);
          if (upd) {
            await db.update(schema.territoryTiles).set(upd as any).where(eq(schema.territoryTiles.id, tile.id));
            Object.assign(tile, upd);
          }
          // Trays ride the same beat (Nigel, 2026-10-15).
          if ((tile.element as string) !== elementBefore) {
            // The land turned: the old stack belonged to the old
            // element. A single growing tray of the new element
            // remains — one stack, one element, always.
            tile.sealedTrays = 0;
            tile.growPoints = 0;
            tile.topPoints = null;
            await persistTray(tile);
          } else if (tile.element !== "neutral" && tile.element !== "fire") {
            if (dom.el === tile.element) await growStack(tile, perStep);
            else await damageTopTray(tile, perStep);
          }
        }
        await db.update(schema.territoryTiles).set({ attuneAnchorAt: new Date(anchor) } as any)
          .where(eq(schema.territoryTiles.id, tile.id));
        tile.attuneAnchorAt = new Date(anchor) as any;
      }
      // Empty hexes keep no clock (see the quest note above).
      for (const t of tiles as any[]) {
        if (t.cursed || byTile.has(t.id) || !t.attuneAnchorAt) continue;
        await db.update(schema.territoryTiles).set({ attuneAnchorAt: null } as any)
          .where(eq(schema.territoryTiles.id, t.id));
        t.attuneAnchorAt = null;
      }
      // The Attunement Shrine turned to the LAND (Nigel, 2026-10-14):
      // the one reach beyond a single hex. While turned, its blessing
      // sleeps (the doubling below honors the mode), and the shrine
      // pours its congregation's dominant element — the Awoken on its
      // hex and the six around it — into one hex about every five
      // hours, ten points at a time: its own hex first, then a random
      // neighbour still out of tune. Time is settled from the clock,
      // so a shrine left standing works unwatched.
      const turnedShrines = await db.select().from(schema.territoryBuildings)
        .where(and(
          eq(schema.territoryBuildings.ownerKey, ownerKey),
          eq(schema.territoryBuildings.buildingType, "attunement-shrine"),
          eq(schema.territoryBuildings.status, "active"),
          eq(schema.territoryBuildings.mode, "attune"),
        ));
      if (turnedShrines.length) {
        const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
        const tileByQR = new Map(tiles.map(t => [`${t.q},${t.r}`, t]));
        for (const sh of turnedShrines) {
          const home = tileById.get(sh.tileId);
          if (!home) continue;
          const ring = [home, ...DIRS.map(([dq, dr]) => tileByQR.get(`${home.q + dq},${home.r + dr}`)).filter(Boolean)] as any[];
          const sums: Record<string, number> = {};
          for (const rt of ring) {
            const part = await companySums(byTile.get(rt.id) ?? []);
            for (const [el, n] of Object.entries(part)) sums[el] = (sums[el] || 0) + n;
          }
          const voice = netPressOf(sums);
          if (!voice.el) continue;
          let anchor = sh.attuneAnchorAt ? new Date(sh.attuneAnchorAt as any).getTime() : 0;
          if (!anchor) {
            await db.update(schema.territoryBuildings).set({ attuneAnchorAt: new Date() } as any).where(eq(schema.territoryBuildings.id, sh.id));
            continue;
          }
          let steps = Math.floor((Date.now() - anchor) / (5 * 3600 * 1000));
          let guard = 0;
          while (steps > 0 && guard++ < 40) {
            let target: any = null;
            if (!home.cursed && home.element !== voice.el) target = home;
            else {
              const outs = ring.slice(1).filter(t => !t.cursed && t.element !== voice.el);
              if (outs.length) target = outs[Math.floor(Math.random() * outs.length)];
            }
            if (!target) break;
            const shrineElBefore = target.element as string;
            const upd = pour(target, voice.el, 10, true);
            if (upd) {
              await db.update(schema.territoryTiles).set(upd as any).where(eq(schema.territoryTiles.id, target.id));
              Object.assign(target, upd);
            }
            // The shrine's pour feeds the land's trays as it feeds
            // the bank (Nigel, 2026-10-15): if the pour turned the
            // hex, its stack resets like any turning; if the hex now
            // holds the poured element, ten points settle into its
            // growing tray.
            if ((target.element as string) !== shrineElBefore) {
              target.sealedTrays = 0;
              target.growPoints = 0;
              target.topPoints = null;
              await persistTray(target);
            }
            if (!target.cursed && target.element === voice.el) {
              await growStack(target, 10);
            }
            steps--;
            anchor += 5 * 3600 * 1000;
          }
          if (steps !== Math.floor((Date.now() - (sh.attuneAnchorAt ? new Date(sh.attuneAnchorAt as any).getTime() : 0)) / (5 * 3600 * 1000))) {
            await db.update(schema.territoryBuildings).set({ attuneAnchorAt: new Date(anchor) } as any).where(eq(schema.territoryBuildings.id, sh.id));
          }
          const nextPourSec = Math.max(0, Math.round((anchor + 5 * 3600 * 1000 - Date.now()) / 1000));
          for (const rt of ring) {
            if (!rt.cursed && rt.element !== voice.el) (rt as any).attuneShrineNextSec = nextPourSec;
          }
        }
      }
    } catch (e) {
      console.error("[TerrainAttune] failed", e);
    }

    // Aspect attunement: binding Awoken channel elements into the pool.
    // 10 points of an element → an aspect of that element is born.
    const ASPECT_THRESHOLD = 10;
    const binders = placements.filter(p => p.stance === "binding");
    if (binders.length) {
      const awakenedIds = [...new Set(binders.map(p => p.awakenedId))];
      const aws = await db.select().from(schema.awakened)
        .where(inArray(schema.awakened.id, awakenedIds));
      const awMap = new Map(aws.map(a => [a.id, a]));
      for (const p of binders) {
        const aw = awMap.get(p.awakenedId);
        if (!aw) continue;
        try {
          const comp = JSON.parse(aw.compositionJson || "[]");
          // Elemental points: pieces = 1 pt, aspects = 1 pt per level.
          // The binder's 1 channeled point per tick is DIVIDED across all
          // its elements in proportion to those points (Nigel, 2026-10-12) —
          // the stronger element receives the larger share.
          const counts: Record<string, number> = { tide: 0, sky: 0, stone: 0, root: 0 };
          const compEls = await compositionElements(comp);
          comp.forEach((layer: any, i: number) => {
            const el = compEls[i];
            if (el !== "fire" && el in counts) {
              counts[el] += layer.category === "aspect" ? ((layer as any).aspectLevel ?? 1) : 1;
            }
          });
          const totalPts = Object.values(counts).reduce((a, b) => a + b, 0);
          if (totalPts === 0) continue;
          for (const [el, pts] of Object.entries(counts)) {
            if (pts === 0) continue;
            const share = pts / totalPts; // fraction of the 1 channeled point
            const existing = await db.select().from(schema.aspectAttunement)
              .where(and(
                eq(schema.aspectAttunement.ownerKey, ownerKey),
                eq(schema.aspectAttunement.element, el as any)
              )).limit(1);
            const newPoints = (existing[0]?.points ?? 0) + share;
            if (existing.length) {
              await db.update(schema.aspectAttunement)
                .set({ points: newPoints, lifetimeGains: sql`${schema.aspectAttunement.lifetimeGains} + ${share}` })
                .where(and(
                  eq(schema.aspectAttunement.ownerKey, ownerKey),
                  eq(schema.aspectAttunement.element, el as any)
                ));
            } else {
              await db.insert(schema.aspectAttunement)
                .values({ ownerKey, element: el as any, points: share, lifetimeGains: share });
            }
            // Threshold reached → birth an aspect (overflow is kept)
            if (newPoints >= ASPECT_THRESHOLD) {
              const pool = await db.select().from(schema.layerAssets)
                .where(eq(schema.layerAssets.category, "aspect"));
              const matches = el === "fire" ? [] : birthableAspects(pool as any[], el);
              if (matches.length) {
                const pick = matches[Math.floor(Math.random() * matches.length)];
                await db.insert(schema.aspectInventory)
                  .values({ ownerKey, aspectAssetId: pick.id, createdAt: new Date() });
                await db.update(schema.aspectAttunement)
                  .set({ points: newPoints - ASPECT_THRESHOLD })
                  .where(and(
                    eq(schema.aspectAttunement.ownerKey, ownerKey),
                    eq(schema.aspectAttunement.element, el as any)
                  ));
              }
            }
          }
        } catch { /* skip malformed composition */ }
      }
    }

    const buildings = await db.select().from(schema.territoryBuildings).where(eq(schema.territoryBuildings.ownerKey, ownerKey));
    const mood = await getWorldMood();
    // Tray facts for the map (Nigel, 2026-10-15): each hex's stack as
    // the engine settles it — sealed trays, the growing tray's fill,
    // the TOP tray's stage (what the tile renders) and HP, the whole
    // stack's power (points / 10), and height as the stack's total
    // trays (Z). All tray math is the server's; the client renders
    // what it is told. Enemy reach reads these fields next.
    for (const t of tiles) {
      const sealed = (t as any).sealedTrays ?? 0;
      const grow = (t as any).growPoints ?? 0;
      (t as any).height = t.cursed ? 0 : sealed + (sealed >= 6 ? 0 : 1); // 6 = the tray cap
      (t as any).traysSealed = sealed;
      (t as any).growPoints = Math.round(grow * 10) / 10;
      (t as any).trayStage = t.cursed ? 1 : sealed > 0 ? 3 : grow >= 20 ? 3 : grow >= 10 ? 2 : 1;
      (t as any).topHp = t.cursed ? 0 : Math.round(sealed > 0 ? ((t as any).topPoints ?? 30) : grow);
      (t as any).stackPower = Math.round(((sealed * 30 + grow) / 10) * 10) / 10;
    }
    const walls = sqlite.prepare("SELECT edge_key AS edgeKey, q, r, dir, hp, max_hp AS maxHp, kind, level, rune_kind AS runeKind, style FROM hex_walls WHERE owner_key = ? ORDER BY id")
      .all(ownerKey);
    const skills = sqlite.prepare("SELECT awakened_id AS awakenedId, skill FROM awoken_skills WHERE owner_key = ? ORDER BY id")
      .all(ownerKey);
    const workings = (sqlite.prepare("SELECT id, spell_key AS spellKey, engine, kind, hue, tile_id AS tileId, edge_key AS edgeKey, q, r, dir, nums, hp, stops, charges, pour, max_hp AS maxHp FROM territory_workings WHERE owner_key = ? ORDER BY id")
      .all(ownerKey) as any[]).map((w) => { try { w.nums = JSON.parse(w.nums); } catch { w.nums = {}; } return w; });
    // THE NAME AT THE SOURCE (Nigel, 2026-10-21 — he prefers
    // the Table's summoning, whose cards carry each creature's
    // name baked in by the server): every placement is joined
    // ONCE, here, to its creature, and the given name rides the
    // placement itself. The homeland's screens read the name
    // from the placement and never re-derive it by joining two
    // lists in the browser — that join's miss was what stamped
    // every fielded creature's tab "An Awokin" at once. A
    // placement whose creature row is gone receives no name:
    // a defect to see, never a label to paper over.
    // The same single read names the company the hand does NOT
    // hold — fielded on this ground, or staged at the bastion —
    // for the hand's elsewhere row, the Table's honest margin
    // (elsewhereForTender on the Table's side): the absence is
    // NAMED, with where each one stands.
    const rosterRows = await db.select().from(schema.awakened).where(eq(schema.awakened.ownerKey, ownerKey));
    const nameById = new Map(rosterRows.map(r => [r.id, r.name]));
    for (const p of placements) {
      const nm = nameById.get(p.awakenedId);
      if (nm != null) (p as any).name = nm;
    }
    const placedIdSet = new Set(placements.map(p => p.awakenedId));
    const stagedIdSet = new Set(stagedIdsFor(ownerKey));
    const elsewhere: { name: string; element: string; where: "fielded" | "staged" }[] = [];
    const ELEMENT_ORDER = ["tide", "sky", "stone", "root", "fire"];
    for (const row of rosterRows) {
      const fielded = placedIdSet.has(row.id);
      const staged = stagedIdSet.has(row.id);
      if (!fielded && !staged) continue;
      // The dominant filed element across its parts — the same
      // sum-of-the-parts law the Table's elsewhere chips wear.
      let element = "neutral";
      try {
        const els = await compositionElements(JSON.parse(row.compositionJson || "[]"));
        const tally = new Map<string, number>();
        for (const el of els) if (el && el !== "neutral") tally.set(el, (tally.get(el) ?? 0) + 1);
        let bestCount = 0;
        for (const el of ELEMENT_ORDER) { const c = tally.get(el) ?? 0; if (c > bestCount) { element = el; bestCount = c; } }
      } catch { /* a malformed composition wears neutral */ }
      elsewhere.push({ name: row.name, element, where: fielded ? "fielded" : "staged" });
    }
    // THE WHEEL'S SUMMON COMPANY, served with the field (the
    // summoning fix, Nigel 2026-10-22): who the Awoken branch
    // can call, the summoner's power the cast will roll with,
    // and whether the Tender's own stand is cursed — the −3
    // the branch names beside each price, as the Table's does.
    const summonProgress = await getTenderProgress(ownerKey);
    const standTileRow = tenderStand ? (tiles as any[]).find(t => t.id === tenderStand.tileId) : null;
    const summoning = {
      company: tenderStand ? await summonCompanyFor(ownerKey) : [],
      // THE REINFORCEMENT DECK, served with the company
      // (Recovery R6): the wheel's Awoken branch lists these
      // under the company — a pick calls the Awoken into
      // the party at once, and it joins the company above.
      reinforcements: tenderStand ? await reinforcementDeckFor(ownerKey) : [],
      summonersPower: summonersPowerFor(ownerKey, summonProgress.level, summonProgress.classKey),
      standCursed: !!standTileRow?.cursed,
    };
    // THE HEX BUILDING SYSTEM (slice 1, 2026-10-25): the
    // construction's pieces ride the same read as the land they
    // stand on — each with its footprint and its DERIVED
    // protection (buildPieceProtected: every hex beneath it the
    // Tender's own, and none of it cursed).
    const buildTilesByKey = new Map<string, any>((tiles as any[]).map((t: any) => [`${t.q},${t.r}`, t]));
    const buildPieces = loadBuildPieces(ownerKey).map(p => buildPieceView(p, buildTilesByKey));
    return { tiles, placements, buildings, mood, walls, skills, workings, tender: tenderView, wanderers: wandererViews, weaponStrike: weaponStrikeView, strikes: recentHomelandStrikes(ownerKey), terrainBank: await terrainBankFor(ownerKey), elsewhere, summoning, battle: await battleStateView(ownerKey), pack: inventoryView(ownerKey), dropNotices: drainDropNotices(ownerKey), buildPieces, defenceWorks: (sqlite.prepare("SELECT id, placement_id AS placementId, kind, nodes FROM defence_works WHERE owner_key = ?").all(ownerKey) as any[]).map(w => { let nodes: { q: number; r: number; hp: number; maxHp: number; mote?: number; pq?: number; pr?: number; born?: number; bank?: number }[] = []; try { nodes = JSON.parse(w.nodes ?? "[]"); } catch { nodes = []; } return { id: Number(w.id), placementId: Number(w.placementId), kind: String(w.kind), nodes }; }) };
  },

  /** The Tender walks his own land: the client reports the hex
   *  his body has entered, and the anchor follows. Any hex of his
   *  own map may hold him — the curse is the company's peril, and
   *  his falls are reckoned by other laws.
   *  THE TRAVERSAL LAW (Nigel, 2026-10-19) rides here: a leap is
   *  the only road over a WALL, up a rise of two trays or more,
   *  or onto a FLOATING ISLE — and no leap crosses a WARD (a wall
   *  the sky cannot ignore), nor spans more than one hex. The
   *  client reports airborne only while its jump engine is
   *  truly off the ground; the crossings are judged here, on
   *  the server's own map, never on the client's say-so. */
  async setTenderTile(args: unknown, ctx?: ActionContext) {
    if (!ctx?.tender) throw Object.assign(new Error("Claim your secret code first."), { status: 403 });
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ tileId: z.number().int().positive(), airborne: z.boolean().optional() }).safeParse(args);
    if (!parsed.success) badRequest("A hex is needed.");
    const tiles = await db.select().from(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
    const next = tiles.find((t: any) => t.id === parsed.data.tileId) as any;
    if (!next) badRequest("That hex is not yours to stand on.");
    const progress = await getTenderProgress(ownerKey);
    if (!progress.classKey) badRequest("A Tender shows on his land only once he has chosen a class.");
    // PHASE D: a fallen Tender does not walk. The blackout holds
    // him where he fell until the bastion wake (settleTenderBody).
    const bodyRow = sqlite.prepare("SELECT down_until AS downUntil, tender_tile_id AS prevId FROM tender_progress WHERE owner_key = ?").get(ownerKey) as any;
    if (bodyRow?.downUntil != null && Number(bodyRow.downUntil) > Date.now()) {
      badRequest("Your Tender has fallen — he wakes at the bastion, half-healed, when the blackout lifts.");
    }
    const airborne = parsed.data.airborne === true;
    if ((next.buildStage ?? 0) === 1) {
      badRequest("The stone has not finished gathering — that ground cannot hold you yet.");
    }
    if ((next.z ?? 0) > 0 && !airborne) {
      badRequest("No road climbs to the floating isle — leap, and land at its height.");
    }
    const prev = bodyRow?.prevId != null ? (tiles.find((t: any) => t.id === bodyRow.prevId) as any) : null;
    if (prev && prev.id !== next.id) {
      const dist = (Math.abs(prev.q - next.q) + Math.abs(prev.q + prev.r - next.q - next.r) + Math.abs(prev.r - next.r)) / 2;
      if (airborne && dist > 1) {
        badRequest("A leap crosses one hex — that far is a road, not a jump.");
      }
      if (dist === 1) {
        const kind = edgeKindBetween(ownerKey, prev, next);
        if (kind === "ward") {
          badRequest("A ward is a wall the sky cannot ignore — land before it, never past it.");
        }
        if (kind === "wall" && !airborne) {
          badRequest("A wall closes that edge — leap it, or walk the long way round.");
        }
        if (((next.height ?? 0) - (prev.height ?? 0)) >= 2 && !airborne) {
          badRequest("That rise stands two trays tall — no walking climbs it. Leap.");
        }
      }
    }
    sqlite.prepare("UPDATE tender_progress SET tender_tile_id = ? WHERE owner_key = ?").run(parsed.data.tileId, ownerKey);
    return { ok: true, tileId: parsed.data.tileId };
  },

  /* ── THE BUILDING SYSTEM (Nigel, 2026-10-19) ──────────────────
   * Found a hex of new land on the empty ground at the land's
   * edge: the stone begins to coalesce the moment the work does.
   * Building never buries the curse — a cursed hex must be won
   * by the standing law first; creation happens on the void
   * beyond, and the founding itself is free: the pours are the
   * price, as attunement has always been the price of shaping. */
  async beginBuild(args: unknown, ctx?: ActionContext) {
    if (!ctx?.tender) throw Object.assign(new Error("Claim your secret code first."), { status: 403 });
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ q: z.number().int(), r: z.number().int() }).safeParse(args);
    if (!parsed.success) badRequest("The work needs a hex (q, r).");
    const { q, r } = parsed.data;
    const tiles = await db.select().from(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
    if ((tiles as any[]).some(t => t.q === q && t.r === r)) badRequest("Land already stands there — build on the void, or not at all.");
    const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    const touches = (tiles as any[]).some(t => (t.z ?? 0) === 0 && DIRS.some(([dq, dr]) => t.q + dq === q && t.r + dr === r));
    if (!touches) badRequest("New land must rise beside your own — the work begins at the edge of what you hold.");
    const ins: any = await db.insert(schema.territoryTiles).values({
      ownerKey, q, r, element: "stone", cursed: 0, spark: 0, hp: 10,
      height: 0, sealedTrays: 0, growPoints: 0, topPoints: null,
      z: 0, buildStage: 1, buildPoints: 0,
    } as any).returning({ id: schema.territoryTiles.id });
    return { ok: true as const, tileId: ins[0].id, buildStage: 1, buildPoints: 0, wanted: "stone", terrainBank: await terrainBankFor(ownerKey) };
  },

  /* Pour ten of the stage's element from the Tender's own pool
   * into the work — the fast road. Stage 3's first pour chooses
   * the branch (tide's lake or sky's isle); stage 4's first pour
   * chooses the finish (bake it sealed, or lower it deep — and
   * only a lake may be lowered; the sky is not unmade by fire). */
  async pourBuild(args: unknown, ctx?: ActionContext) {
    if (!ctx?.tender) throw Object.assign(new Error("Claim your secret code first."), { status: 403 });
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      tileId: z.number().int().positive(),
      branch: z.enum(["tide", "sky"]).optional(),
      finish: z.enum(["bake", "lower"]).optional(),
    }).safeParse(args);
    if (!parsed.success) badRequest("The pour needs a work and, at the forks, its choosing.");
    const rows = await db.select().from(schema.territoryTiles)
      .where(and(eq(schema.territoryTiles.id, parsed.data.tileId), eq(schema.territoryTiles.ownerKey, ownerKey))).limit(1);
    const tile = rows[0] as any;
    if (!tile) badRequest("That hex is not yours to build.");
    if (!buildUnderway(tile)) badRequest(buildStageOf(tile) === 5 ? "That work stands finished — its stages are sealed in the bank." : "No work is begun on that hex.");
    if (buildStageOf(tile) === 3 && !tile.buildBranch) {
      if (!parsed.data.branch) badRequest("The branch must be chosen: pour tide for a lake, or sky for an isle.");
      tile.buildBranch = parsed.data.branch;
      await db.update(schema.territoryTiles).set({ buildBranch: tile.buildBranch } as any).where(eq(schema.territoryTiles.id, tile.id));
    }
    if (buildStageOf(tile) === 4 && !tile.buildFinish) {
      if (!parsed.data.finish) badRequest("The finish must be chosen: bake it sealed, or lower it deep.");
      if (parsed.data.finish === "lower" && tile.buildBranch === "sky") badRequest("Fire does not unmake the sky — an isle may be baked, never lowered back.");
      tile.buildFinish = parsed.data.finish;
      await db.update(schema.territoryTiles).set({ buildFinish: tile.buildFinish } as any).where(eq(schema.territoryTiles.id, tile.id));
    }
    const wanted = stageWantedElement(tile)!;
    const pool = await aspectPoolFor(ownerKey, wanted);
    if (pool < BUILD_POUR) badRequest(`The ${wanted} pool holds ${Math.floor(pool)} — a pour needs ${BUILD_POUR}.`);
    if (!(await spendAspectPoints(ownerKey, wanted, BUILD_POUR))) badRequest(`The ${wanted} pool would not give up its pour.`);
    await feedBuild(ownerKey, tile, wanted, BUILD_POUR);
    return {
      ok: true as const, tileId: tile.id,
      buildStage: buildStageOf(tile), buildPoints: tile.buildPoints ?? 0,
      buildBranch: tile.buildBranch ?? null, buildFinish: tile.buildFinish ?? null,
      baked: tile.baked ?? 0, lowered: tile.lowered ?? 0, z: tile.z ?? 0, element: tile.element,
      wanted: stageWantedElement(tile), pool: await aspectPoolFor(ownerKey, wanted),
      terrainBank: await terrainBankFor(ownerKey), maxEnergy: await calculateMaxEnergy(ownerKey),
    };
  },

  /* ── ATTUNE (Nigel, 2026-10-21: "awoken still attune
   *  tiles by standing on the[m]... and the tender can use
   *  the attune ability to make attunement faster or
   *  instant if they have enough elemental energysaved") —
   *  the homeland twin of the Table's attuneTile act. One
   *  point of an element leaves the Tender's pool through
   *  the pools' own door (spendAttunement) and pours into
   *  the bank of the target tile — through
   *  pourAttunementBank, the very reckoning the standing
   *  press pours by, witness rule and all — so a spent
   *  point counts exactly as a standing-laid point does,
   *  only now, and repeated spends are the "faster or
   *  instant" road, as at the Table. If the pour turns the
   *  tile, its tray stack resets as any turning resets it
   *  in the settle; if the ground already holds the spent
   *  element, the point also feeds the growing tray, as a
   *  matching press point does on the same beat (the tray's
   *  own seal and cap: 30 points seal a tray, six trays
   *  stand at most).
   *  ATTUNE IS AN ABILITY NOW (Nigel, 2026-10-21 16:37):
   *  the door is the action wheel — Ability → Attune →
   *  element → tap a tile — on every ground; the homeland's
   *  centre-screen attune card is retired. The tap names
   *  its tile (tileId); unnamed, the act keeps its first
   *  shape and attunes the ground he stands on. THE RANGE
   *  (Nigel, 2026-10-21 16:40): the target must lie within
   *  his reach — the tile he stands on and its ring, one
   *  tile away, PLUS the zodiac's attunement-reach bonus
   *  (attuneReachFor; no stars carry it yet) — enforced
   *  here, server-side, and refused in plain words beyond
   *  it. The tap may also name ground a placed RUNE or
   *  WARD of his stands on: the point pours into that
   *  tile's bank all the same (the working's ground is the
   *  tile's ground), and the answer names the working.
   *  The refusals mirror the Table act where the homeland's
   *  law has equivalents: his own ground only — his
   *  territory rows are his alone, so another Tender's
   *  ground is not even in them; cursed ground refused
   *  (attunement rests only on purified land — the
   *  homeland press itself never pours into cursed ground,
   *  and a tile's fall back to curse zeroes its bank); a
   *  work underway refused (its pours are the builder's,
   *  ten at a time through pourBuild — a bank point there
   *  would vanish into the build); baked ground refused
   *  (the kiln sealed its bank — the settle pours nothing
   *  into baked ground either); and the pool enforced
   *  whole — nothing is half-spent. The bastion hex itself
   *  is NOT refused: no homeland law seals it, and a
   *  company standing there presses it like any ground —
   *  the Table's seed refusal is the Table's own law, not
   *  the land's. Fire may be spent, as the Table act takes
   *  all five, though no standing press ever speaks fire
   *  and fire grows no trays. */
  async attuneTile(args: unknown, ctx?: ActionContext) {
    if (!ctx?.tender) throw Object.assign(new Error("Claim your secret code first."), { status: 403 });
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      element: z.enum(["root", "tide", "sky", "stone", "fire"]),
      tileId: z.number().int().positive().optional(),
    }).safeParse(args);
    if (!parsed.success) badRequest("Name one of the five elements to attune the ground with.");
    const element = parsed.data.element;
    const stand = sqlite.prepare("SELECT tender_tile_id AS tileId FROM tender_progress WHERE owner_key = ?").get(ownerKey) as any;
    if (!stand?.tileId) badRequest("You stand nowhere on your land — step onto the ground you would attune.");
    const standRows = await db.select().from(schema.territoryTiles)
      .where(and(eq(schema.territoryTiles.id, Number(stand.tileId)), eq(schema.territoryTiles.ownerKey, ownerKey))).limit(1);
    const standTile = standRows[0] as any;
    if (!standTile) badRequest("The ground beneath you is not yours to attune.");
    let tile = standTile;
    if (parsed.data.tileId != null && parsed.data.tileId !== standTile.id) {
      const rows = await db.select().from(schema.territoryTiles)
        .where(and(eq(schema.territoryTiles.id, parsed.data.tileId), eq(schema.territoryTiles.ownerKey, ownerKey))).limit(1);
      tile = rows[0] as any;
      if (!tile) badRequest("That hex is not yours to attune.");
      const reach = 1 + attuneReachFor(ownerKey);
      if (hexDistTiles(standTile, tile) > reach) {
        badRequest(`That ground lies beyond your attuning reach — Attune touches your own hex and its ring${reach > 1 ? `, and ${reach - 1} ring${reach > 2 ? "s" : ""} more by your skill` : ""}. Step closer, and attune again.`);
      }
    }
    if (tile.cursed) badRequest("That ground is still cursed — attunement rests only on purified land. Win it first, and the ground will turn.");
    if (buildUnderway(tile)) badRequest("A work is rising on that ground — its pours are the builder's, ten at a time. Attune it when it stands finished, or stand elsewhere.");
    if ((tile as any).baked) badRequest("That ground is baked sealed — the kiln shut its bank, and no attunement pours into it.");
    // THE BINDER'S GIFT (Nigel, 2026-10-22; Recovery R9):
    // one point still leaves her pool — the spend is the
    // same spend every hand makes — but what the spend LAYS
    // is reckoned by the book's one reckoning (pourLaidFor,
    // no page kind at this door): a Binder's Attune lays
    // triple the points, into the bank and, where the ground
    // already holds the element, into the growing tray
    // alike, as each standing press point feeds both.
    const attuneProgress = await getTenderProgress(ownerKey);
    const laid = pourLaidFor(attuneProgress.classKey, null, 1);
    const spent = await spendAttunement(ownerKey, element, 1);
    if (!spent.ok) badRequest(`Attuning the ground costs 1 ${element} point — your ${element} pool holds ${Math.floor(spent.held)}.`);
    // THE ATTUNEMENT RATE (the zodiac's clause, Recovery
    // #1): "every attunement point laid grants one more"
    // — the spend stays one point; every point the lay
    // above reckons (pourLaidFor's, the Binder's triple
    // included) grants one more per rate point held, in
    // the bank and in the tray growth below alike. (The
    // composition — the rate multiplying the pour
    // reckoning's lay, not the spend — is this build's
    // reading of the star's own words, flagged in its
    // report; the effects ledger's pencil 1(c) left the
    // question open.)
    const laidPoints = laid * (1 + fxSum(ownerKey, "attunementRate"));
    // A working of his standing on the target ground lends
    // the answer its name — the point pours into the tile's
    // bank either way, as the tile law holds. A rune (or a
    // written spell) stands ON its tile; a ward stands on an
    // edge — its anchor tile, or the hex across the edge.
    let workingName: string | null = null;
    {
      const runeRow = sqlite.prepare("SELECT spell_key FROM territory_workings WHERE owner_key = ? AND tile_id = ? AND kind IN ('rune', 'spell') LIMIT 1").get(ownerKey, tile.id) as any;
      if (runeRow) workingName = spellByKey(runeRow.spell_key)?.name ?? runeRow.spell_key;
      else {
        const wardRows = sqlite.prepare("SELECT spell_key, tile_id, q, r, dir FROM territory_workings WHERE owner_key = ? AND kind = 'ward'").all(ownerKey) as any[];
        const ward = wardRows.find((w) => {
          if (w.tile_id === tile.id) return true;
          if (w.dir == null) return false;
          const [dq, dr] = WALL_DIRS[w.dir] ?? [0, 0];
          return w.q + dq === tile.q && w.r + dr === tile.r;
        });
        if (ward) workingName = spellByKey(ward.spell_key)?.name ?? ward.spell_key;
      }
    }
    const elementBefore = tile.element as string;
    const upd = pourAttunementBank(tile, element, laidPoints);
    if (upd) Object.assign(tile, upd);
    const turned = (tile.element as string) !== elementBefore;
    let traysMoved = false;
    if (turned) {
      // A turning resets the stack (the settle's own habit).
      tile.sealedTrays = 0; tile.growPoints = 0; tile.topPoints = null;
      traysMoved = true;
    } else if (tile.element === element && element !== "fire") {
      // The ground already holds the spent element: the
      // point feeds the growing tray, as a matching press
      // point does on the settle's beat (growStack's own
      // arithmetic: 30 points seal a tray, six stand at
      // most; fire and neutral grow no trays — neutral
      // never reaches this branch, its element is its own).
      const sealed = tile.sealedTrays ?? 0;
      if (sealed < 6) {
        let grow = (tile.growPoints ?? 0) + laidPoints;
        let sealedNow = sealed;
        while (grow >= 30 && sealedNow < 6) { grow -= 30; sealedNow += 1; }
        if (sealedNow >= 6) grow = 0;
        tile.growPoints = grow; tile.sealedTrays = sealedNow;
        traysMoved = true;
      }
    }
    const setFields: Record<string, unknown> = {
      element: tile.element, attuneElement: tile.attuneElement ?? null, attunePoints: tile.attunePoints ?? 0,
    };
    if (traysMoved) {
      setFields.sealedTrays = tile.sealedTrays ?? 0;
      setFields.growPoints = tile.growPoints ?? 0;
      setFields.topPoints = tile.topPoints ?? null;
      setFields.height = tile.cursed ? 0 : ((tile.sealedTrays ?? 0) >= 6 ? 6 : (tile.sealedTrays ?? 0) + 1);
    }
    await db.update(schema.territoryTiles).set(setFields as any).where(eq(schema.territoryTiles.id, tile.id));
    return {
      ok: true as const, tileId: tile.id, element: tile.element as string,
      attuneElement: (tile.attuneElement ?? null) as string | null, attunePoints: tile.attunePoints ?? 0,
      growPoints: tile.growPoints ?? 0, sealedTrays: tile.sealedTrays ?? 0, turned,
      working: workingName, laid,
      pool: await aspectPoolFor(ownerKey, element),
    };
  },

  /** Follow the Tender (the homeland twin of the Table's order):
   *  a following Awokin musters to the Tender's ring whenever the
   *  field is read. The order is the Tender's to give and lift. */
  async setPlacementFollow(args: unknown, ctx?: ActionContext) {
    if (!ctx?.tender) throw Object.assign(new Error("Claim your secret code first."), { status: 403 });
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ placementId: z.number().int().positive(), follow: z.boolean() }).safeParse(args);
    if (!parsed.success) badRequest("A placement and its order are needed.");
    const own = await db.select().from(schema.fieldPlacements)
      .where(and(eq(schema.fieldPlacements.id, parsed.data.placementId), eq(schema.fieldPlacements.ownerKey, ownerKey))).limit(1);
    if (!own[0]) badRequest("That Awokin does not stand on your field.");
    if (parsed.data.follow) {
      // THE FOLLOWING GATE stands on this door too (Nigel,
      // 2026-10-24): raising a follow while the following
      // stands full is refused plainly — orders given to
      // one who follows free the spot. And raising enrols
      // the creature in the party in the same act, as the
      // summon cast enrols its landed follower: following
      // means in party. (Lowering the flag only lowers it —
      // the orders that end membership are the march and
      // the patrol, as they have always been.)
      const progress = await getTenderProgress(ownerKey);
      const followCap = partyCapFor(ownerKey, progress.level);
      const rows = await db.select({ id: schema.fieldPlacements.id, follow: schema.fieldPlacements.follow }).from(schema.fieldPlacements)
        .where(eq(schema.fieldPlacements.ownerKey, ownerKey));
      const followingCount = rows.filter(p => p.follow === 1 && p.id !== parsed.data.placementId).length;
      if (followingCount >= followCap) {
        badRequest(`Your following stands full — ${followCap} at your side. Give orders to one who follows you — a march, a patrol — and her spot frees.`);
      }
      const placedAwakenedId = (own[0] as any).awakenedId as number;
      if (placedAwakenedId && !isPartyMember(ownerKey, placedAwakenedId)) {
        sqlite.prepare("INSERT INTO tender_party (owner_key, awakened_id, added_at) VALUES (?, ?, ?)")
          .run(ownerKey, placedAwakenedId, Date.now());
      }
    }
    await db.update(schema.fieldPlacements).set({ follow: parsed.data.follow ? 1 : 0 }).where(eq(schema.fieldPlacements.id, parsed.data.placementId));
    return { ok: true, follow: parsed.data.follow };
  },

  /** THE HOMELAND SUMMON CAST (Nigel, 2026-10-22 — the
   *  summoning fix: "awoken just summon near the tender when
   *  summoned they dont need a target"): the wheel's Awoken
   *  branch is the door, the pick IS the cast, and the server
   *  chooses the landing — the Tender's own tile or a free
   *  tile beside it (the Table's at-your-side distance, become
   *  the server's placement rule instead of the player's aim).
   *  The reckoning mirrors the Table's summon referee exactly:
   *  the purse is charged BEFORE the roll; the roll is d20 +
   *  the gift (the Sage's −2, the class truth that is no
   *  school term) + SUMMONER'S POWER − 3 when the caster
   *  stands in cursed land, against DC 10 + the Awokin's
   *  power; a natural 20 always lands, a natural 1 always
   *  falters; a falter spends the price and stands nothing.
   *  THE GATE IS THE FOLLOWING, NOT THE PARTY (Nigel,
   *  2026-10-24 15:48 + 15:51 + 15:52): any Awokin of the
   *  Tender's own deck can be summoned — membership is never
   *  asked at this door. What the party's width gates is the
   *  FOLLOWING: a landed summon follows by default, so while
   *  the following stands full the cast is refused whole, and
   *  the way past is the Tender's own hand — give orders to
   *  one who follows (a march, a patrol: orders end the
   *  follow and the membership both) and a spot frees.
   *  Awoken standing on the field under orders never count.
   *  The price is the Table's: the Awokin's power, one at least.
   *  This road replaces deployAwoken whole: the hand-card →
   *  tile-tap fielding is retired (the hand stays the
   *  collection). */
  async summonAwoken(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ awakenedId: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("A summon names the Awokin to call.");
    const awakenedId = parsed.data.awakenedId;
    const progress = await getTenderProgress(ownerKey);
    // The fallen silence, as at every homeland cast (Phase D).
    const progressRow = sqlite.prepare("SELECT down_until FROM tender_progress WHERE owner_key = ?").get(ownerKey) as { down_until: number | null } | undefined;
    if (progressRow?.down_until != null && Number(progressRow.down_until) > Date.now()) {
      badRequest("Your Tender has fallen — no summoning until he wakes at the bastion.");
    }
    const tiles = await db.select().from(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
    const stand = await this.tenderStand(ownerKey, tiles as any[]);
    if (!stand) badRequest("You have no stand on this land to summon from — choose your class first, and the calling wakes.");
    const tileById = new Map((tiles as any[]).map(t => [t.id, t]));
    const standTile = tileById.get(stand.tileId);
    if (!standTile) badRequest("You have no stand on this land to summon from.");
    // THE DECK IS WHO YOU CAN SUMMON (Nigel, 2026-10-24):
    // ownership is the only belonging ever asked at this
    // door — the party gate that stood here is struck, and
    // the gate lives on the following now, below.
    const ownedRow = sqlite.prepare("SELECT name FROM awakened WHERE id = ? AND owner_key = ?").get(awakenedId, ownerKey) as { name: string } | undefined;
    if (!ownedRow) badRequest("That Awokin is not yours to call.");
    // Already standing: one body stands in one place.
    const already = await db.select({ id: schema.fieldPlacements.id }).from(schema.fieldPlacements)
      .where(and(eq(schema.fieldPlacements.awakenedId, awakenedId), eq(schema.fieldPlacements.ownerKey, ownerKey))).limit(1);
    if (already.length) badRequest("That Awokin already stands on your field.");
    // The court stays in hand (Nigel, 2026-10-12): housed
    // Awokin and the marked champion cannot be stationed.
    const courtHoused = await db.select({ awakenedId: schema.hallResidents.awakenedId }).from(schema.hallResidents)
      .where(eq(schema.hallResidents.ownerKey, ownerKey));
    const courtChamp = await db.select({ awakenedId: schema.tenderChampions.awakenedId }).from(schema.tenderChampions)
      .where(eq(schema.tenderChampions.ownerKey, ownerKey)).limit(1);
    const courtIds = new Set<number>([...courtHoused.map(r => r.awakenedId), ...(courtChamp.length ? [courtChamp[0].awakenedId] : [])]);
    if (courtIds.has(awakenedId)) badRequest("The court stays in hand — housed Awokin and the champion cannot be stationed on the field.");
    // Staged at the bastion: kept back for its instance.
    if (stagedIdsFor(ownerKey).includes(awakenedId)) badRequest("That Awokin waits at the bastion — it is kept back for the instance that carries it.");
    // Still re-coalescing from a fall: callable nowhere.
    const dispRow = sqlite.prepare("SELECT dispersed_until FROM awakened WHERE id = ?").get(awakenedId) as { dispersed_until: number | null } | undefined;
    if (dispRow?.dispersed_until && dispRow.dispersed_until > Date.now()) badRequest("That Awokin is still re-coalescing from its fall — it can be called nowhere yet.");
    const payload = await awakenedPayloadById(awakenedId).catch(() => null);
    if (!payload) badRequest("That Awokin is not yours to call.");
    const power = payload.power;
    // THE WITCH'S COMPANY PRICE (Recovery R7): the summon is
    // a cast — while a party member she has cast already
    // stands, this call costs her half. The first member she
    // ever fields pays full price: none stands yet to grant it.
    const cost = await witchPriceFor(ownerKey, progress.classKey, Math.max(1, power));
    // THE FOLLOWING GATE (Nigel, 2026-10-24): the count is
    // the placements standing in the follow on this ground —
    // never the field's whole number, never the ledger's
    // rows. A landed summon follows by default, so a full
    // following refuses the cast whole, before any price is
    // charged: the way past is orders, spoken in the refusal.
    const followCap = partyCapFor(ownerKey, progress.level);
    const followingCount = (await db.select({ follow: schema.fieldPlacements.follow }).from(schema.fieldPlacements)
      .where(eq(schema.fieldPlacements.ownerKey, ownerKey))).filter(p => p.follow === 1).length;
    if (followingCount >= followCap) {
      badRequest(`Your following stands full — ${followCap} at your side, and a summon follows by default. Give orders to one who follows you — a march, a patrol — and her spot frees for the next call. (The width is reckoned: 3 to start, plus a spot for every party star you hold.)`);
    }
    // THE LANDING, chosen before the charge (as the Table
    // checks its ground before its purse): the Tender's own
    // tile first, then the tiles beside it — open ground that
    // can hold a standing figure (no floating isle, no stone
    // still gathering), the least crowded ground first,
    // cursed or held alike
    // (the Table's landing law, 2026-10-21: the curse's price
    // is in the cast, not in the ground).
    const allPlacements = await db.select().from(schema.fieldPlacements).where(eq(schema.fieldPlacements.ownerKey, ownerKey));
    const loadOf = (tileId: number) => (allPlacements as any[]).reduce((n, p) => {
      // THE OVERCROWD TALLY (Nigel, 2026-10-24 15:52):
      // Awoken in the party — the following — never count
      // toward a hex's crowding for a landing: summons land
      // at the Tender's side, where his followers cluster,
      // and their standing there must never block his call.
      // Only the non-party standing (and those marching in
      // to stand) weigh on the tally.
      if (p.follow === 1) return n;
      if (p.tileId === tileId && !p.marchPath) return n + 1;
      if (p.marchPath) { try { const r = JSON.parse(p.marchPath); if (Array.isArray(r) && r[r.length - 1] === tileId) return n + 1; } catch { /* broken roads hold no room */ } }
      return n;
    }, 0);
    const candidates = (tiles as any[])
      .filter(t => hexDistTiles(t, standTile) <= 1 && (t.z ?? 0) === 0 && (t.buildStage ?? 0) !== 1)
      .sort((a, b) => (a.id === standTile.id ? 0 : 1) - (b.id === standTile.id ? 0 : 1)
        || hexDistTiles(a, standTile) - hexDistTiles(b, standTile) || a.id - b.id);
    // THE OVERCROWDED HEX (Nigel, 2026-10-24 15:51 — for
    // this door superseding the 2026-10-18 crowding ruling's
    // fall-back landing): a summon cannot LAND on a hex
    // already holding four or more — the least crowded
    // lawful ground is still chosen first, but when every
    // hex at the Tender's side stands at four or more
    // non-party standing (the tally above), the call is
    // refused whole and the price is never reached. The
    // tally caps only this landing: more Awoken may still
    // walk or march onto such a hex afterward, and the
    // crowd's tax on pace and cadence stands untouched.
    // Only ground that does not exist at all refuses
    // otherwise, in the older words.
    if (!candidates.length) badRequest("No ground at your side can hold them — there is no land at your side to stand on.");
    const landing = candidates.find(t => loadOf(t.id) < 4);
    if (!landing) badRequest("No ground at your side can take another standing — every hex beside you already holds four or more who are not of your party. Step to clearer ground, or let the crowd move on.");
    // THE PURSE, BEFORE THE ROLL — a faltering call spends it.
    if (!(await spendEnergy(ownerKey, cost))) badRequest(`Not enough energy — ${payload.name} costs ✦${cost}.`);
    // THE CAST, the Table referee's arithmetic whole.
    const gift = progress.classKey === "sage" ? -2 : 0;
    const sp = summonersPowerFor(ownerKey, progress.level, progress.classKey);
    const curse = standTile.cursed ? -3 : 0;
    const roll = homelandDN(20);
    const dc = 10 + power;
    const landed = roll === 20 || (roll !== 1 && roll + gift + sp + curse >= dc);
    if (!landed) {
      // THE WITCH'S MISCAST MERCY (Recovery R8): a faltering
      // call is a fizzled cast — her share of the price she
      // actually paid (the company-halved price included)
      // returns; every other class's falter spends it whole.
      const refunded = await refundHomelandFizzle(ownerKey, progress.classKey, cost);
      return { ok: true as const, summoned: false as const, faltered: true as const, name: payload.name, roll, gift, summonersPower: sp, curse, dc, cost, refunded };
    }
    const bornShield = await rollShieldFor(awakenedId, ownerKey);
    await db.insert(schema.fieldPlacements).values({
      ownerKey, awakenedId, tileId: landing.id,
      // A SUMMONED AWOKEN FOLLOWS ITS TENDER (Nigel,
      // 2026-10-24, as it has always been on this ground):
      // the cast is the homeland's follow-raising moment —
      // the gate above saw the following had room, so the
      // flag is raised whole, and with it the muster keeps
      // the figure at the Tender's ring. (The other
      // placement births — the seed's deploy, the bastion
      // return — deliberately stay follow 0: fighters under
      // orders.)
      follow: 1,
      // Born standing on a real free point (Nigel,
      // 2026-10-23): the landing tile's centre — its own
      // spot on the record from its first breath, never a
      // fixed offset borrowed from the tile.
      posQ: landing.q, posR: landing.r,
      hp: await placementMaxHp(awakenedId),
      // Born shielded (the shield law): the per-part dice
      // pool is rolled at the summoning itself.
      shield: bornShield, shieldMax: bornShield,
    });
    // FOLLOWING MEANS IN PARTY (Nigel, 2026-10-24): the
    // landed follower is entered in the party ledger in
    // this same act — written directly, as the first-three
    // fielding writes it (party.ts's join door is not used:
    // a join would lift the creature OFF the field it has
    // just taken). A member already standing in the ledger
    // keeps her earlier seat untouched.
    if (!isPartyMember(ownerKey, awakenedId)) {
      sqlite.prepare("INSERT INTO tender_party (owner_key, awakened_id, added_at) VALUES (?, ?, ?)")
        .run(ownerKey, awakenedId, Date.now());
    }
    return { ok: true as const, summoned: true as const, faltered: false as const, name: payload.name, tileId: landing.id, roll, gift, summonersPower: sp, curse, dc, cost };
  },


  async moveAwoken(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      awakenedId: z.number().int().positive(),
      tileId: z.number().int().positive(),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid move.");
    // The Awoken must be on the field.
    // Server-authoritative move cost: 1 + floor((power - 1) / 3), computed after validation.
    const placement = await db.select().from(schema.fieldPlacements)
      .where(and(
        eq(schema.fieldPlacements.awakenedId, parsed.data.awakenedId),
        eq(schema.fieldPlacements.ownerKey, ownerKey)
      )).limit(1);
    if (!placement.length) badRequest("That Awokin is not on your field.");
    // Target must be a purified tile owned by the Tender.
    const tile = await db.select().from(schema.territoryTiles)
      .where(and(
        eq(schema.territoryTiles.id, parsed.data.tileId),
        eq(schema.territoryTiles.ownerKey, ownerKey)
      )).limit(1);
    if (!tile.length) badRequest("That tile is not yours.");
    // No curse refusal on the step (Nigel, 2026-10-23):
    // an Awokin may step onto cursed ground at its prices
    // — the curse's attrition for standing in it settles
    // as ever; the ground is priced, never barred.
    // Must be adjacent.
    const fromTile = await db.select().from(schema.territoryTiles)
      .where(eq(schema.territoryTiles.id, placement[0].tileId)).limit(1);
    if (!fromTile.length) badRequest("Mover has no ground.");
    const dq = Math.abs(tile[0].q - fromTile[0].q);
    const dr = Math.abs(tile[0].r - fromTile[0].r);
    const dist = Math.max(dq, dr, Math.abs((tile[0].q + tile[0].r) - (fromTile[0].q + fromTile[0].r)));
    if (dist !== 1) badRequest("Can only move to adjacent tiles.");
    // No tile capacity refuses a step (THE CROWDING GATE,
    // Nigel 2026-10-18): numbers cost speed, never ground.
    // Server-authoritative move cost: 1 + floor((power - 1) / 3)
    const awokenRows = await db.select().from(schema.awakened)
      .where(eq(schema.awakened.id, parsed.data.awakenedId)).limit(1);
    if (awokenRows.length) {
      const assetRows = await db.select().from(schema.layerAssets);
      const assetStats = new Map<number, AssetStats>();
      for (const r of assetRows) {
        const rar = raritySchema.safeParse(r.rarity);
        if (rar.success) assetStats.set(r.id, { name: r.name, rarity: rar.data, power: r.power, toughness: r.toughness, element: (r as any).element ?? null });
      }
      const layers = parseLayers(awokenRows[0].compositionJson, assetStats);
      const payload = await awakenedPayloadById(awokenRows[0].id);
      const power = payload?.power ?? layers.reduce((s, l) => s + (l.power ?? 0), 0);
      const cost = 1 + Math.floor((power - 1) / 3);
      if (!(await spendEnergy(ownerKey, cost))) badRequest("Not enough energy.");
    }
    await db.update(schema.fieldPlacements)
      .set({ tileId: tile[0].id, lastMovedAt: new Date(), posQ: tile[0].q, posR: tile[0].r, marchPosQ: null, marchPosR: null })
      .where(eq(schema.fieldPlacements.id, placement[0].id));
    return z.object({ ok: z.literal(true) }).parse({ ok: true });
  },


  // ── HEX WALLS (War-Ground charter extension, Nigel 2026-10-15) ──
  // An Awoken standing on a hex raises a wall on one of its six edges:
  // 2 energy, instant — fieldwork, not a building. The wall blocks
  // enemies in battle (their strikes land on it first) and carries
  // its own HP. Edge dirs follow the painted-face order used by the
  // client (0 top, then clockwise); WALL_DIRS[d] is the neighbour
  // across edge d, and the canonical form stores the edge under the
  // lexicographically smaller tile so a shared border is ONE wall.
  async placeWall(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ tileId: z.number().int(), dir: z.number().int().min(0).max(5) }).safeParse(args);
    if (!parsed.success) badRequest("The War-Ground needs a tile and an edge (0–5).");
    const { tileId, dir } = parsed.data;
    const WALL_COST = 2; // stem (War-Ground, 2026-10-15) — retune by Nigel's ear
    const WALL_HP = 10;   // stem
    const tileRows = await db.select().from(schema.territoryTiles)
      .where(and(eq(schema.territoryTiles.id, tileId), eq(schema.territoryTiles.ownerKey, ownerKey)));
    const tile = tileRows[0] as any;
    if (!tile) badRequest("That hex is not yours to wall.");
    if (tile.cursed) badRequest("The curse holds that hex — no wall stands on cursed ground.");
    const standing = await db.select().from(schema.fieldPlacements)
      .where(and(eq(schema.fieldPlacements.ownerKey, ownerKey), eq(schema.fieldPlacements.tileId, tileId)));
    if (standing.length === 0) badRequest("No Awokin stands on that hex — walls are raised by the Awokin who stand there.");
    const [dq, dr] = WALL_DIRS[dir];
    const nq = tile.q + dq, nr = tile.r + dr;
    const flip = nq < tile.q || (nq === tile.q && nr < tile.r);
    const cq = flip ? nq : tile.q, cr = flip ? nr : tile.r, cdir = flip ? WALL_OPP[dir] : dir;
    const edgeKey = `${cq},${cr},${cdir}`;
    const existing = sqlite.prepare("SELECT id FROM hex_walls WHERE owner_key = ? AND edge_key = ?").get(ownerKey, edgeKey);
    if (existing) badRequest("A wall already stands on that edge.");
    if (!(await spendEnergy(ownerKey, WALL_COST))) badRequest(`Not enough energy — a wall costs ${WALL_COST}.`);
    try {
      sqlite.prepare("INSERT INTO hex_walls (owner_key, edge_key, q, r, dir, hp, max_hp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(ownerKey, edgeKey, cq, cr, cdir, WALL_HP, WALL_HP, Date.now());
    } catch {
      badRequest("A wall already stands on that edge.");
    }
    return { ok: true as const, wall: { edgeKey, q: cq, r: cr, dir: cdir, hp: WALL_HP, maxHp: WALL_HP }, cost: WALL_COST };
  },

  // ── EDGE WORKS (War-Ground, Nigel 2026-10-15) ────────────────────
  // The general placement law behind placeWall: ONE work per edge.
  // Wards answer only to a Warding hand standing on the hex, runes
  // only to a Runeing hand (the awoken_skills ledger is the gate).
  async placeEdgeWork(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      tileId: z.number().int(), dir: z.number().int().min(0).max(5),
      kind: z.enum(["wall", "thorns", "ward", "rune"]),
      runeKind: z.enum(["snare", "harm", "meld"]).optional(),
      style: z.enum(["stone", "spire"]).optional(),
    }).safeParse(args);
    if (!parsed.success) badRequest("The War-Ground needs a tile, an edge (0–5) and a work (wall, thorns, ward or rune).");
    const { tileId, dir, kind, runeKind } = parsed.data;
    const style = kind === "wall" ? (parsed.data.style ?? "stone") : "stone";
    if (kind === "rune" && !runeKind) badRequest("A rune is chosen at the casting — snare, harm or meld.");
    const def = EDGE_WORK[kind];
    const tileRows = await db.select().from(schema.territoryTiles)
      .where(and(eq(schema.territoryTiles.id, tileId), eq(schema.territoryTiles.ownerKey, ownerKey)));
    const tile = tileRows[0] as any;
    if (!tile) badRequest("That hex is not yours to work.");
    if (tile.cursed) badRequest("The curse holds that hex — no work stands on cursed ground.");
    const standing = await db.select().from(schema.fieldPlacements)
      .where(and(eq(schema.fieldPlacements.ownerKey, ownerKey), eq(schema.fieldPlacements.tileId, tileId)));
    if (standing.length === 0) badRequest("No Awokin stands on that hex — edge works are laid by the Awokin who stand there.");
    const needSkill = SKILL_FOR_WORK[kind];
    if (needSkill) {
      const held = skillsHeldBy(ownerKey, standing.map((s: any) => s.awakenedId));
      if (!held.has(needSkill)) {
        badRequest(kind === "ward"
          ? "No Warding hand stands on that hex — wards are cast only by an Awokin with the Warding skill."
          : "No Runeing hand stands on that hex — runes are set only by an Awokin with the Runeing skill.");
      }
    }
    const [dq, dr] = WALL_DIRS[dir];
    const nq = tile.q + dq, nr = tile.r + dr;
    const flip = nq < tile.q || (nq === tile.q && nr < tile.r);
    const cq = flip ? nq : tile.q, cr = flip ? nr : tile.r, cdir = flip ? WALL_OPP[dir] : dir;
    const edgeKey = `${cq},${cr},${cdir}`;
    const existing = sqlite.prepare("SELECT kind FROM hex_walls WHERE owner_key = ? AND edge_key = ?").get(ownerKey, edgeKey) as { kind: string } | undefined;
    if (existing) badRequest(`That edge already carries a ${EDGE_WORK[existing.kind]?.name ?? "work"} — one work per edge. Take it down before laying another.`);
    if (!(await spendEnergy(ownerKey, def.cost))) badRequest(`Not enough energy — a ${def.name.toLowerCase()} costs ${def.cost}.`);
    const hp = workMaxHp(kind, 1);
    try {
      sqlite.prepare("INSERT INTO hex_walls (owner_key, edge_key, q, r, dir, hp, max_hp, kind, level, rune_kind, style, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(ownerKey, edgeKey, cq, cr, cdir, hp, hp, kind, 1, kind === "rune" ? runeKind : null, style, Date.now());
    } catch {
      badRequest("That edge already carries a work — one work per edge.");
    }
    return { ok: true as const, work: { edgeKey, q: cq, r: cr, dir: cdir, hp, maxHp: hp, kind, level: 1, runeKind: kind === "rune" ? runeKind : undefined, style }, cost: def.cost };
  },

  /** Strengthen a standing work: exponential energy, doubling
   *  strength (barrier HP, rune bite). Thorns are growth, not craft —
   *  they refuse. Wards and runes still answer to their skilled
   *  hands: the strengthening is cast work too. */
  async strengthenEdgeWork(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ tileId: z.number().int(), dir: z.number().int().min(0).max(5) }).safeParse(args);
    if (!parsed.success) badRequest("The War-Ground needs a tile and an edge (0–5).");
    const { tileId, dir } = parsed.data;
    const tileRows = await db.select().from(schema.territoryTiles)
      .where(and(eq(schema.territoryTiles.id, tileId), eq(schema.territoryTiles.ownerKey, ownerKey)));
    const tile = tileRows[0] as any;
    if (!tile) badRequest("That hex is not yours to work.");
    const [dq, dr] = WALL_DIRS[dir];
    const nq = tile.q + dq, nr = tile.r + dr;
    const flip = nq < tile.q || (nq === tile.q && nr < tile.r);
    const cq = flip ? nq : tile.q, cr = flip ? nr : tile.r, cdir = flip ? WALL_OPP[dir] : dir;
    const edgeKey = `${cq},${cr},${cdir}`;
    const row = sqlite.prepare("SELECT kind, level, hp, max_hp AS maxHp FROM hex_walls WHERE owner_key = ? AND edge_key = ?")
      .get(ownerKey, edgeKey) as { kind: string; level: number; hp: number; maxHp: number } | undefined;
    if (!row) badRequest("No work stands on that edge to strengthen.");
    if (row.kind === "thorns") badRequest("Thorns are growth, not craft — they cannot be strengthened.");
    const needSkill = SKILL_FOR_WORK[row.kind];
    if (needSkill) {
      const standing = await db.select().from(schema.fieldPlacements)
        .where(and(eq(schema.fieldPlacements.ownerKey, ownerKey), eq(schema.fieldPlacements.tileId, tileId)));
      const held = skillsHeldBy(ownerKey, standing.map((s: any) => s.awakenedId));
      if (!held.has(needSkill)) badRequest(`Strengthening a ${row.kind} is cast work — a ${needSkill === "warding" ? "Warding" : "Runeing"} hand must stand on the hex.`);
    }
    const cost = strengthenCostFor(row.kind, row.level);
    if (!(await spendEnergy(ownerKey, cost))) badRequest(`Not enough energy — the next strengthening costs ${cost}.`);
    const newLevel = row.level + 1;
    const newMax = workMaxHp(row.kind, newLevel);
    // Strengthening pours energy in: HP rises by the new strength
    // gained (damage already taken is not forgiven).
    const newHp = newMax > 0 ? row.hp + (newMax - row.maxHp) : 0;
    sqlite.prepare("UPDATE hex_walls SET level = ?, max_hp = ?, hp = ? WHERE owner_key = ? AND edge_key = ?")
      .run(newLevel, newMax, newHp, ownerKey, edgeKey);
    return { ok: true as const, work: { edgeKey, kind: row.kind, level: newLevel, hp: newHp, maxHp: newMax }, cost, nextCost: strengthenCostFor(row.kind, newLevel) };
  },

  /** Take a work down (the owner's own hand, free and instant). */
  async removeEdgeWork(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ tileId: z.number().int(), dir: z.number().int().min(0).max(5) }).safeParse(args);
    if (!parsed.success) badRequest("The War-Ground needs a tile and an edge (0–5).");
    const { tileId, dir } = parsed.data;
    const tileRows = await db.select().from(schema.territoryTiles)
      .where(and(eq(schema.territoryTiles.id, tileId), eq(schema.territoryTiles.ownerKey, ownerKey)));
    const tile = tileRows[0] as any;
    if (!tile) badRequest("That hex is not yours to work.");
    const [dq, dr] = WALL_DIRS[dir];
    const nq = tile.q + dq, nr = tile.r + dr;
    const flip = nq < tile.q || (nq === tile.q && nr < tile.r);
    const cq = flip ? nq : tile.q, cr = flip ? nr : tile.r, cdir = flip ? WALL_OPP[dir] : dir;
    const edgeKey = `${cq},${cr},${cdir}`;
    const gone = sqlite.prepare("DELETE FROM hex_walls WHERE owner_key = ? AND edge_key = ?").run(ownerKey, edgeKey);
    if (!gone.changes) badRequest("No work stands on that edge.");
    return { ok: true as const, edgeKey };
  },

  // ── THE HEX BUILDING SYSTEM (Nigel, 2026-10-25 — "IMPLEMENT") ──
  // Slice 1: lay and take away the construction's pieces. The
  // client names a piece by its plate-plane vertices; the server
  // RE-DERIVES the piece from the construction geometry
  // (matchCandidate) — only a true tiling piece may persist, and
  // its footprint is computed here, in axial map coordinates,
  // never taken on the client's word. No hex-lock: a piece is
  // laid where its shape falls; its only ground law is that some
  // of the Tender's own land must lie beneath it.
  async placeBuildPiece(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      kind: z.enum(["triangle", "square", "wall", "door"]),
      verts: z.array(z.tuple([z.number().finite(), z.number().finite()])).min(2).max(4),
    }).safeParse(args);
    if (!parsed.success) badRequest("The work needs a piece — a triangle, a square, a wall or a door, by its corners.");
    const { kind } = parsed.data;
    const verts = parsed.data.verts as Pt[];
    const tiles = await db.select().from(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
    const tilesByKey = new Map<string, any>((tiles as any[]).map((t: any) => [`${t.q},${t.r}`, t]));
    const pieces = loadBuildPieces(ownerKey);

    if (kind === "triangle" || kind === "square") {
      const cand = matchCandidate(kind, verts);
      if (!cand) badRequest("That shape is not one of the construction's pieces — the floors are the hex's own triangles and the squares that stand on their measure.");
      const footprint = cand.verts.map(v => plateToAxial(v));
      if (pieces.some(p => p.pieceKey === cand.key)) badRequest("That piece already stands there.");
      // The ground law: some of the Tender's own land beneath it.
      // (Cursed ground may be built over — the piece simply
      // stands unprotected there; protection is derived at read.)
      const hexes = footprintHexes(footprint);
      if (!hexes.some(h => tilesByKey.has(`${h.q},${h.r}`))) {
        badRequest("No land of yours lies beneath that piece — the construction stands on your ground.");
      }
      const info = sqlite.prepare("INSERT INTO build_pieces (owner_key, kind, piece_key, verts, footprint, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(ownerKey, kind, cand.key, JSON.stringify(cand.verts), JSON.stringify(footprint), Date.now());
      const row: BuildPieceRow = { id: Number(info.lastInsertRowid), kind, pieceKey: cand.key, verts: cand.verts, footprint };
      return { ok: true as const, piece: buildPieceView(row, tilesByKey) };
    }

    // Walls and doors stand on EDGES — of the Tender's own
    // standing floors. The claimed edge must be a floor's edge,
    // exactly, and carry no wall yet.
    if (verts.length !== 2) badRequest("A wall names the two ends of its edge.");
    const claimKey = edgeKeyOf(verts[0], verts[1]);
    let edge: [Pt, Pt] | null = null;
    for (const p of pieces) {
      if (p.kind !== "triangle" && p.kind !== "square") continue;
      for (const e of edgesOf(p.verts)) {
        if (edgeKeyOf(e[0], e[1]) === claimKey) { edge = e; break; }
      }
      if (edge) break;
    }
    if (!edge) badRequest("No floor of yours carries that edge — walls stand on the edges of your floors.");
    if (pieces.some(p => (p.kind === "wall" || p.kind === "door") && edgeKeyOf(p.verts[0], p.verts[1]) === claimKey)) {
      badRequest("A wall already stands on that edge — take it down before raising another.");
    }
    const footprint = edge.map(v => plateToAxial(v));
    const pieceKey = `${kind}#${claimKey}`;
    const info = sqlite.prepare("INSERT INTO build_pieces (owner_key, kind, piece_key, verts, footprint, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(ownerKey, kind, pieceKey, JSON.stringify(edge), JSON.stringify(footprint), Date.now());
    const row: BuildPieceRow = { id: Number(info.lastInsertRowid), kind, pieceKey, verts: edge, footprint };
    return { ok: true as const, piece: buildPieceView(row, tilesByKey) };
  },

  /** Take a piece of the construction away. Removing a floor
   *  takes down every wall that stood on its edges alone — a
   *  wall whose edge another standing floor still carries
   *  stands. The answer names what fell with it. */
  async removeBuildPiece(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ id: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("The taking-away names the piece.");
    const pieces = loadBuildPieces(ownerKey);
    const target = pieces.find(p => p.id === parsed.data.id);
    if (!target) badRequest("That piece is not yours to take away — or it no longer stands.");
    const removed: number[] = [target.id];
    if (target.kind === "triangle" || target.kind === "square") {
      const remaining = pieces.filter(p => p.id !== target.id);
      const carriedEdges = new Set<string>();
      for (const p of remaining) {
        if (p.kind !== "triangle" && p.kind !== "square") continue;
        for (const e of edgesOf(p.verts)) carriedEdges.add(edgeKeyOf(e[0], e[1]));
      }
      for (const e of edgesOf(target.verts)) {
        const ek = edgeKeyOf(e[0], e[1]);
        if (carriedEdges.has(ek)) continue;
        const wall = remaining.find(p => (p.kind === "wall" || p.kind === "door") && edgeKeyOf(p.verts[0], p.verts[1]) === ek);
        if (wall) removed.push(wall.id);
      }
    }
    const marks = removed.map(() => "?").join(",");
    sqlite.prepare(`DELETE FROM build_pieces WHERE owner_key = ? AND id IN (${marks})`).run(ownerKey, ...removed);
    return { ok: true as const, removed };
  },

  // ── The Written Light on the land (the Grimoire, Nigel
  // 2026-10-17) ─────────────────────────────────────────
  // The Tender casts from the book PERSONALLY (wards and runes
  // wake at Tender Lv 3; Heal is the Lv 1 art) — beside the edge
  // works, which remain the skilled Awoken hands' craft. A ward
  // stands on the edge of a hex the Tender's own Awoken holds;
  // a rune is written on a hex's floor (cursed ground included —
  // the light is sown ahead of the march); Heal mends a standing
  // Awoken by the tier law. Numbers snapshot from the book at
  // the cast. Workings stand until spent or broken here.
  async castMapWorking(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      spellKey: z.string().min(1).max(80),
      hue: z.string().max(20).optional(),
      tileId: z.number().int().positive().optional(),
      dir: z.number().int().min(0).max(5).optional(),
      awakenedId: z.number().int().positive().optional(),
      // RUNE SHATTER'S HELD CAST (Nigel, 2026-10-22): how long
      // the tap was held — the stream it buys is reckoned by
      // the settle, at 1✦ a second and three pieces a second.
      heldMs: z.number().int().min(0).max(60000).optional(),
      // BLACK GATE'S FACING (Nigel, 2026-10-23 — Recovery
      // R13): the caster's own 8-direction facing, carried
      // in on the cast as the ward casts carry their aim —
      // the server keeps no facing of its own (see
      // BLACK_GATE_STEP). Any string is taken in here; the
      // Black Gate branch itself judges it against the
      // eight and refuses the rest, so no other working's
      // cast is narrowed by this field's shape.
      facing: z.string().max(4).optional(),
      // NO HEX-LOCK — THE AIM IS A POINT (Nigel, 2026-10-23
      // 23:04; built 2026-10-24): the tapped point on the
      // land, in fractional axial — the tongue the marches,
      // the wanderers and Bulwark's nodes already speak on
      // this ground. A cast carrying a point is aimed THERE:
      // the distance from where the caster stands to the
      // point, against the working's own reach, is the only
      // gate on where it may land; the tile the point falls
      // in is named only as the ground the working stands
      // on. A cast carrying no point keeps the hex road
      // whole, for older clients and the standing drives.
      pointQ: z.number().min(-40).max(40).optional(),
      pointR: z.number().min(-40).max(40).optional(),
    }).safeParse(args);
    if (!parsed.success) badRequest("The book needs a spell — and a hex, an edge, or an Awokin to receive it.");
    const { spellKey, dir, awakenedId, heldMs, facing } = parsed.data;
    await refreshGrimoire();
    const spell = spellByKey(spellKey);
    if (!spell) badRequest("That spell is not in the book.");
    // THE CAST'S COLOUR IS DERIVED, NEVER SENT (Nigel,
    // 2026-10-20 19:35): the hue the action may still carry
    // is inert — the colour is judged from the page's own
    // standing in the book (pageHueFor: the filled slots of
    // the attunable pages; Shard Rain judged by the pools'
    // bands), and a smuggled hue changes nothing.
    const hue = await pageHueFor(ownerKey, spell);
    if (spell.engine === "none") badRequest(`“${spell.name}” is written in the book but not yet seated — give it an engine in the workshop before it can be cast.`);
    const progress = await getTenderProgress(ownerKey);

    // HOMELAND CASTING (Nigel, 2026-10-20) — the common ground
    // every homeland cast now stands on. THE SILENCES: while
    // he lies fallen (Phase D) no cast of any school leaves
    // him; and a classless Tender has no school at all — the
    // wards, runes and the grove are refused him below, while
    // Heal, the Lv 1 art that predates every class, still
    // answers and rolls at the closed school's word. THE
    // REACH: a working laid on the land goes no farther than
    // ring 6 of his stand — the Table's whole world, Phase
    // D's own in-view ring — and a cast named beyond it is
    // refused before any charge. THE ROLL: one law with the
    // Table — the purse is charged BEFORE the roll, and a
    // fizzle spends the charge and lands nothing. THE
    // WITCH'S MISCAST MERCY (Recovery R8) rides every fizzle
    // return below: her share of the charge comes back
    // (refundHomelandFizzle); every other class's fizzle
    // still spends the whole charge, and the unravelled cast
    // still counts as cast for every other purpose.
    const castTiles = await db.select().from(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
    const castTileById = new Map(castTiles.map((t) => [t.id, t]));
    const progressRow = sqlite.prepare("SELECT down_until FROM tender_progress WHERE owner_key = ?").get(ownerKey) as { down_until: number | null } | undefined;
    if (progressRow?.down_until != null && Number(progressRow.down_until) > Date.now()) {
      badRequest("Your Tender has fallen — no casting until he wakes at the bastion.");
    }
    const stand = await this.tenderStand(ownerKey, castTiles as any[]);
    const standTile = stand ? castTileById.get(stand.tileId) : null;
    const assertCastReach = (tile: any, range: number = HOMELAND_CAST_RING) => {
      if (!standTile || !tile) badRequest("You have no stand on this land to cast from.");
      if (hexDistTiles(standTile as any, tile as any) > range) {
        badRequest(`“${spell.name}” lies beyond your casting reach — ring ${range} of where you stand.`);
      }
    };
    // THE POINT AIM, resolved (2026-10-24): the tile the
    // tapped point falls in stands in for `tileId` wherever
    // a branch names ground, and the point itself is judged
    // by distance wherever a branch judges reach — so a
    // point cast and a hex cast are one law, two tongues.
    const aimPoint = parsed.data.pointQ != null && parsed.data.pointR != null
      ? { q: parsed.data.pointQ, r: parsed.data.pointR }
      : null;
    const aimCell = aimPoint ? axialRound(aimPoint.q, aimPoint.r) : null;
    const aimTile = aimCell
      ? (castTiles as any[]).find((t: any) => t.q === aimCell.q && t.r === aimCell.r) ?? null
      : null;
    const tileId = parsed.data.tileId ?? (aimTile ? (aimTile as any).id : undefined);
    const assertPointReach = (range: number = HOMELAND_CAST_RING) => {
      if (!aimPoint) return;
      if (!standTile) badRequest("You have no stand on this land to cast from.");
      if (axialDist({ q: (standTile as any).q, r: (standTile as any).r }, aimPoint) > range + 1e-9) {
        badRequest(`“${spell.name}” lies beyond your casting reach — ring ${range} of where you stand.`);
      }
    };

    // HEAL — the binding art, cast on one of your own standing.
    if (spell.engine === "heal") {
      if (!awakenedId) badRequest("Heal reaches one of your own standing Awokin — name it.");
      const placements = await db.select().from(schema.fieldPlacements)
        .where(and(eq(schema.fieldPlacements.ownerKey, ownerKey), eq(schema.fieldPlacements.awakenedId, awakenedId)));
      const placement = placements[0] as any;
      if (!placement) badRequest("That Awokin does not stand on your field.");
      const payload = await awakenedPayloadById(awakenedId);
      const tiles = await db.select().from(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
      const tileById = new Map(tiles.map((t) => [t.id, t]));
      const towerRows = await db.select().from(schema.territoryBuildings)
        .where(and(eq(schema.territoryBuildings.ownerKey, ownerKey), eq(schema.territoryBuildings.buildingType, "watchtower"), eq(schema.territoryBuildings.status, "active")));
      const towerTiles = towerRows.map((b) => tileById.get(b.tileId)).filter(Boolean) as any[];
      const cfg = await loadGameConfig();
      const towerBonus = cfg.buildings["watchtower"]?.powerBonus ?? 2;
      const hexDist = (a: any, b: any) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
      const myTile = tileById.get(placement.tileId);
      // THE BINDER'S RANGE (Nigel, 2026-10-22; Recovery R9):
      // Heal is a Binding working that heals, and its reach
      // is the homeland's casting ring (HOMELAND_CAST_RING,
      // the common reach every homeland cast stands on
      // above) measured from the Tender's stand to the
      // mended one's hex — doubled for a Binder's cast
      // (bindingHealRangeFor), the standing ring for every
      // other hand. Judged before any charge, as every
      // reach refusal on this ground is.
      if (standTile && myTile) {
        const healRange = bindingHealRangeFor(progress.classKey, HOMELAND_CAST_RING);
        if (hexDistTiles(standTile as any, myTile as any) > healRange) {
          badRequest(`“${spell.name}” lies beyond your casting reach — ring ${healRange} of where you stand.`);
        }
      }
      const maxHp = (payload?.toughness ?? 3) + (myTile && towerTiles.some((tt) => hexDist(myTile, tt) <= 1) ? towerBonus : 0);
      const curHp = placement.hp ?? maxHp;
      if (curHp >= maxHp) badRequest(`${payload?.name ?? "That Awokin"} stands whole already.`);
      // THE WITCH'S COMPANY PRICE (Recovery R7): while a
      // party member she has cast stands, the Heal costs her
      // half — here and at every homeland cast door below.
      const healPrice = await witchPriceFor(ownerKey, progress.classKey, spell.cost);
      if (!(await spendEnergy(ownerKey, healPrice))) badRequest(`Not enough energy — ${spell.name} costs ${healPrice}.`);
      // The roll (Homeland Casting): the purse is already
      // charged — a fizzle spends it and mends nothing.
      const cast = homelandCastRoll(progress, spell);
      if (!cast.ok) { const mercyBack = await mercyRefundHomeland(ownerKey, healPrice); return { ok: true as const, fizzled: true as const, roll: cast.roll, mod: cast.mod, dc: cast.dc, cost: healPrice, refunded: await refundHomelandFizzle(ownerKey, progress.classKey, healPrice), ...(mercyBack ? { mercyRefund: mercyBack } : {}), spellKey: spell.key }; }
      // THE BINDER'S COMPANY (Recovery R7): Heal is a Binding
      // working — a Binder's casting of it mends +4 more.
      const healed = Math.min(progress.healAmount + bindingHealBonusFor(progress.classKey, ownerKey), maxHp - curHp);
      await db.update(schema.fieldPlacements).set({ hp: curHp + healed })
        .where(eq(schema.fieldPlacements.id, placement.id));
      return { ok: true as const, healed, hp: curHp + healed, maxHp, cost: healPrice, roll: cast.roll, mod: cast.mod, dc: cast.dc, spellKey: spell.key };
    }

    // The classless silence (Homeland Casting): no choosing,
    // no school — the land's workings are refused whole. Heal
    // alone stands outside this refusal (it branches above).
    if (!progress.classKey) {
      badRequest("No class, no school — the wards, runes and groves wake only once you have chosen your way. Heal alone predates the choosing.");
    }

    // SPRINGLEAF — the grove, planted on the land (Homeland
    // Casting, Nigel 2026-10-20). On the homeland she grows in
    // the Table's ruled shape: a burst of healing over the
    // company standing in her glow at the raising, 1d4 saplings
    // rooting in her shade at the ruled tempo, the mother
    // lingering 34 s and each sapling 20 s, and a mending
    // breath over her ground for as long as any of her stands
    // (settleHomelandGroves tends her). Her SIZE is the
    // book's tender-cast measure read back into the land's own
    // tongue: the Table's grove spans (66 + 12 × Tender level)
    // px at 2.75× an Awokin's casting; a homeland hex is 80 px
    // of that same measure — so her glow covers that many
    // hexes of radius (Lv 1 → 2, Lv 10 → 6).
    if (spell.engine === "springleaf") {
      if (!progress.wardRuneUnlocked) {
        badRequest(`Wards and runes wake at Tender Lv 3 — you stand at Lv ${progress.level}.`);
      }
      if (tileId == null) badRequest("The Springleaf roots on a hex — name the ground.");
      const tile = castTileById.get(tileId) as any;
      if (!tile) badRequest("That hex is not yours to plant.");
      // THE BINDER'S RANGE (Recovery R9): the Springleaf is
      // a Binding working that heals — a Binder plants it at
      // twice the casting ring, and the grove she raises
      // below spans twice the radius. (2026-10-24: a point
      // cast is judged by the point's own distance, the
      // same ring in the point's tongue.)
      assertCastReach(tile, bindingHealRangeFor(progress.classKey, HOMELAND_CAST_RING));
      if (aimPoint) assertPointReach(bindingHealRangeFor(progress.classKey, HOMELAND_CAST_RING));
      const springleafPrice = await witchPriceFor(ownerKey, progress.classKey, spell.cost);
      if (!(await spendEnergy(ownerKey, springleafPrice))) badRequest(`Not enough energy — ${spell.name} costs ${springleafPrice}.`);
      const cast = homelandCastRoll(progress, spell);
      if (!cast.ok) { const mercyBack = await mercyRefundHomeland(ownerKey, springleafPrice); return { ok: true as const, fizzled: true as const, roll: cast.roll, mod: cast.mod, dc: cast.dc, cost: springleafPrice, refunded: await refundHomelandFizzle(ownerKey, progress.classKey, springleafPrice), ...(mercyBack ? { mercyRefund: mercyBack } : {}), spellKey: spell.key }; }
      // THE BINDER'S RANGE (Recovery R9): the grove's radius
      // is the reach its bursts and mending work by — a
      // Binder's grove spans twice the measure, and the
      // doubled radius is what stands in the stored numbers
      // the settle reads (its saplings' span and glow derive
      // from it there, as they derive for every hand).
      const radiusHexes = bindingHealRangeFor(progress.classKey, bindingRadiusFor(bindingCastLevelFor(progress.level)));
      const now = Date.now();
      // The raising burst: every one of his standing in the
      // glow rolls its OWN element die, as at the Table — a
      // Binder's burst +4 more a head (her company, R7).
      let burst = 0;
      const castBinderBonus = bindingHealBonusFor(progress.classKey, ownerKey);
      const placements = await db.select().from(schema.fieldPlacements).where(eq(schema.fieldPlacements.ownerKey, ownerKey));
      for (const p of placements as any[]) {
        const pt = castTileById.get(p.tileId);
        if (!pt) continue;
        // The burst is judged from where the grove was
        // planted: the tapped point when the cast carried
        // one, the tile's heart on the hex road (2026-10-24).
        const inGlow = aimPoint
          ? axialDist({ q: (pt as any).q, r: (pt as any).r }, aimPoint) <= radiusHexes + 1e-9
          : hexDistTiles(pt as any, tile) <= radiusHexes;
        if (inGlow) burst += await groveBurstHealPlacement(p.id, p.awakenedId, false, castBinderBonus);
      }
      // The saplings: 1d4, on distinct ground within 0.55 of
      // her radius (the Table's spacing), her own hex filling
      // the count when the land runs small.
      const sapSpan = Math.max(1, Math.floor(radiusHexes * 0.55));
      const near = castTiles.filter((t) => t.id !== tileId && hexDistTiles(t as any, tile) <= sapSpan);
      for (let i = near.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [near[i], near[j]] = [near[j], near[i]]; }
      const sapCount = homelandDN(4);
      const sapTiles: any[] = near.slice(0, sapCount);
      while (sapTiles.length < sapCount) sapTiles.push(tile);
      const saplings = sapTiles.map((t, i) => ({ tileId: t.id, dueAt: now + 1600 * (i + 1), expiresAt: 0, rooted: false }));
      const groveNums = {
        ...(spell.numbers ?? {}),
        // The planted point, when the cast carried one —
        // the view draws the grove's heart there (2026-10-24).
        ...(aimPoint ? { aimQ: aimPoint.q, aimR: aimPoint.r } : {}),
        radiusHexes,
        healPerBreath: spell.numbers?.healPerBreath ?? 1,
        motherExpiresAt: now + 34000,
        lastMendAt: now,
        saplings,
      };
      const info = sqlite.prepare(`INSERT INTO territory_workings
        (owner_key, spell_key, engine, kind, hue, tile_id, edge_key, q, r, dir, nums, hp, stops, charges, pour, max_hp, created_at)
        VALUES (?, ?, 'springleaf', 'binding', ?, ?, NULL, ?, ?, NULL, ?, 0, 0, 0, 0, 0, ?)`)
        .run(ownerKey, spell.key, hue, tileId, tile.q, tile.r, JSON.stringify(groveNums), now);
      return { ok: true as const, id: Number(info.lastInsertRowid), tileId, cost: springleafPrice, radiusHexes, burst, saplings: sapCount, roll: cast.roll, mod: cast.mod, dc: cast.dc, spellKey: spell.key };
    }

    // Wards and runes wake at Tender Lv 3 (the standing law).
    if (!progress.wardRuneUnlocked) {
      badRequest(`Wards and runes wake at Tender Lv 3 — you stand at Lv ${progress.level}.`);
    }

    // THE PAGE CARRIES IT (Nigel, 2026-10-20; the slots,
    // 2026-10-21): no pour is named or taken at a cast on
    // this ground any more — powering lives in the
    // Grimoire. A cast that stands draws the page's filled
    // SLOTS in the cast's element off the book's ledger
    // (pageSlotsCastFor, read in each branch below at the
    // moment the working is raised) — each slot +1 power
    // and +1 health to the working — and the page's spell
    // level rides the cast's roll above (DC = level + 10),
    // counted once, there. The cast's ELEMENT is the one
    // derived at the door above (pageHueFor), so the slots
    // drawn are the slots of the page's own greatest
    // attunement. Heal never reaches here: binding healing
    // requires energy only.

    if (spell.kind === "ward") {
      // BLACK GATE REBORN (Nigel, 2026-10-23 12:04 —
      // Recovery R13): the Gate is filed a ward (its kind
      // is an UNRULED derivation from Bulwark — flagged
      // at its page in grimoire.ts, beside its price), but
      // it stands on NO edge and names NO hex: it is cast
      // IN FRONT OF THE CASTER, at his own point stepped
      // one axial unit along his FACING — so it branches
      // here, before the ward door's edge law, under the
      // door's own common law (the Lv 3 gate above, the
      // purse charged before the roll, a fizzle spent,
      // the Witch's mercy and company price riding it as
      // at every door). THE FACING IS REQUIRED: it is the
      // figure's own facing, carried in on the cast (see
      // BLACK_GATE_STEP for its source) — a cast naming
      // none, or a word outside the eight, is refused
      // before any charge; no default is ever dressed up
      // as his facing. Its HP reads the ONE shared table
      // at the cast level (the caster's Tender level, the
      // reading R12 named for the same table) through
      // rockWallHpForLevel — the ruling's "10 HP" is that
      // table's top figure, standing at Lv 9+. The wall
      // lives in the defence-works ledger beside the Rock
      // Wall's nodes and Bulwark's shields, with
      // placement_id 0: no figure raises or sustains it,
      // it stands by its HP alone, and the battle reckons
      // it in its walk-blocking and its strike pass.
      if (spell.engine === "blackgate") {
        if (!standTile) badRequest("You have no stand on this land to cast from.");
        let step = facing ? blackGateStepFor(facing) : null;
        let gateFacing = facing;
        // NO HEX-LOCK (Nigel, 2026-10-23 23:04; built
        // 2026-10-24): a cast carrying a tapped POINT and
        // no facing reads its facing from the point — the
        // direction from where the caster stands to where
        // they pointed, taken as the nearest of the eight
        // steps (the step whose ray the direction rides
        // closest). The wall then stands exactly as a
        // facing cast's does: one axial unit along that
        // step from the stand tile's point. A facing named
        // on the cast still rules, as it always has.
        if (!step && aimPoint) {
          const dq = aimPoint.q - (standTile as any).q, dr = aimPoint.r - (standTile as any).r;
          if (Math.hypot(dq, dr) > 1e-6) {
            let bestDot = -Infinity;
            for (const f of BLACK_GATE_FACINGS) {
              const s = BLACK_GATE_STEP[f];
              const sl = Math.hypot(s[0], s[1]) || 1;
              const dot = (dq * s[0] + dr * s[1]) / sl;
              if (dot > bestDot) { bestDot = dot; step = s; gateFacing = f; }
            }
          }
        }
        if (!step && !aimPoint && tileId == null) badRequest("The Black Gate is cast in the direction you face — name your facing (N, NE, E, SE, S, SW, W or NW).");
        if (facing && !step) badRequest("The Black Gate is cast in the direction you face — name your facing (N, NE, E, SE, S, SW, W or NW).");
        const gateCost = await witchPriceFor(ownerKey, progress.classKey, spell.cost);
        if (!(await spendEnergy(ownerKey, gateCost))) badRequest(`Not enough energy — ${spell.name} costs ${gateCost}.`);
        const cast = homelandCastRoll(progress, spell);
        if (!cast.ok) return { ok: true as const, fizzled: true as const, roll: cast.roll, mod: cast.mod, dc: cast.dc, cost: gateCost, refunded: await refundHomelandFizzle(ownerKey, progress.classKey, gateCost), spellKey: spell.key };
        const wallHp = rockWallHpForLevel(progress.level);
        // THE GATE CASTS IN A T (Nigel, 2026-10-24 22:35 —
        // the ward law, Amendment 3): a cast carrying a
        // tapped point — or naming a hex, whose heart stands
        // as its point — raises the Gate as the crossbar of
        // a T: centred on that point, running perpendicular
        // to the caster→point axis, its nodes laid evenly
        // along the line at the warding cast level's count,
        // each with the shared table's HP. The FACING road
        // below stands for casts that carry a facing and no
        // ground at all (the API's tongue): one node, one
        // axial unit along the facing, exactly as R13 raised
        // it — the map's clicks all carry ground now, and
        // take the T.
        const gateTile = tileId != null ? castTileById.get(tileId) : null;
        const gatePoint = aimPoint ?? (gateTile ? { q: (gateTile as any).q, r: (gateTile as any).r } : null);
        // A facing NAMED on the cast rules the legacy road;
        // a step merely derived from the point above does
        // not — the point takes the T.
        if (gatePoint && !facing) {
          if (aimPoint) assertPointReach(); else if (gateTile) assertCastReach(gateTile);
          const cb = wardCrossbarFor({ q: (standTile as any).q, r: (standTile as any).r }, gatePoint, wardingCastLevelFor(progress.level));
          const nodes = wardLineNodesFor(gatePoint.q, gatePoint.r, cb.px, cb.pr, wardingCastLevelFor(progress.level), wallHp);
          const info = sqlite.prepare("INSERT INTO defence_works (owner_key, placement_id, kind, anchor_q, anchor_r, nodes, created_at) VALUES (?, 0, 'blackgate', ?, ?, ?, ?)")
            .run(ownerKey, gatePoint.q, gatePoint.r, JSON.stringify(nodes), Date.now());
          return { ok: true as const, id: Number(info.lastInsertRowid), tileId: gateTile ? (gateTile as any).id : standTile.id, cost: gateCost, wallHp, wallQ: gatePoint.q, wallR: gatePoint.r, gateNodes: nodes.length, roll: cast.roll, mod: cast.mod, dc: cast.dc, spellKey: spell.key };
        }
        if (!step) badRequest("The Black Gate is cast in the direction you face — name your facing (N, NE, E, SE, S, SW, W or NW).");
        const wallQ = standTile.q + step[0], wallR = standTile.r + step[1];
        const nodes = [{ q: wallQ, r: wallR, hp: wallHp, maxHp: wallHp }];
        const info = sqlite.prepare("INSERT INTO defence_works (owner_key, placement_id, kind, anchor_q, anchor_r, nodes, created_at) VALUES (?, 0, 'blackgate', ?, ?, ?, ?)")
          .run(ownerKey, wallQ, wallR, JSON.stringify(nodes), Date.now());
        return { ok: true as const, id: Number(info.lastInsertRowid), tileId: standTile.id, cost: gateCost, wallHp, facing: gateFacing, wallQ, wallR, roll: cast.roll, mod: cast.mod, dc: cast.dc, spellKey: spell.key };
      }
      if (tileId == null) badRequest("A ward stands on an edge: name the hex your Awokin holds and the edge (0–5).");
      const tileRows = await db.select().from(schema.territoryTiles)
        .where(and(eq(schema.territoryTiles.id, tileId), eq(schema.territoryTiles.ownerKey, ownerKey)));
      const tile = tileRows[0] as any;
      if (!tile) badRequest("That hex is not yours to ward.");
      assertCastReach(tile);
      if (aimPoint) assertPointReach();
      // THE EDGE FROM THE POINT (2026-10-24): a ward cast
      // carrying a tapped point and no edge direction takes
      // the edge of the named hex whose midpoint the point
      // lies nearest — the player pointed at the edge they
      // meant, and the wall stands on it. A direction named
      // on the cast still rules, as it always has.
      let effDir = dir;
      if (effDir == null && aimPoint) {
        let bestD = Infinity;
        for (let d = 0; d < 6; d++) {
          const [wdq, wdr] = WALL_DIRS[d];
          const mq = tile.q + wdq * 0.5, mr = tile.r + wdr * 0.5;
          const dd = Math.hypot(aimPoint.q - mq, aimPoint.r - mr);
          if (dd < bestD) { bestD = dd; effDir = d; }
        }
      }
      if (effDir == null) badRequest("A ward stands on an edge: name the hex your Awokin holds and the edge (0–5).");
      // BULWARK (Nigel, 2026-10-23 — Recovery R12): the line
      // of shields is raised HERE, through the ward door's
      // own law — the purse charged before the roll, a
      // fizzle spent (the Witch's mercy riding it as at
      // every door), the page's level on the roll — but it
      // does not stand on the edge the tap names: the edge
      // is the cast's AIM. The line stands across that edge,
      // centred on its midpoint, its nodes spread along the
      // edge's own line at the Rock Wall's spacing (0.55),
      // in the Rock Wall's working fashion. It takes no
      // edge's occupancy (it is a line of free-standing
      // shields, not an edge work, and no one work per edge
      // law stands over it), and its shields live in the
      // defence-works ledger beside the Rock Wall's nodes —
      // with placement_id 0, for no figure raises them and
      // no stance sustains them: they stand by their HP.
      if (spell.engine === "bulwark") {
        const bulwarkCost = await witchPriceFor(ownerKey, progress.classKey, spell.cost);
        if (!(await spendEnergy(ownerKey, bulwarkCost))) badRequest(`Not enough energy — ${spell.name} costs ${bulwarkCost}.`);
        const cast = homelandCastRoll(progress, spell);
        if (!cast.ok) return { ok: true as const, fizzled: true as const, roll: cast.roll, mod: cast.mod, dc: cast.dc, cost: bulwarkCost, refunded: await refundHomelandFizzle(ownerKey, progress.classKey, bulwarkCost), spellKey: spell.key };
        const count = bulwarkShieldCountFor(progress.level);
        const shieldHp = rockWallHpForLevel(progress.level);
        // BULWARK CASTS IN A T (Nigel, 2026-10-24 22:35 —
        // the ward law): a cast carrying a tapped point
        // raises the line as the crossbar of a T — centred
        // on the POINT, running perpendicular to the
        // caster→point axis, its shields laid evenly along
        // it at the warding cast level's count (the same
        // count law, the same spacing, the same HP table —
        // only the aim's geometry is new). A cast carrying
        // an edge and NO point keeps the road below — the
        // edge's own line across its midpoint — the tongue
        // the point-less casts have always spoken.
        if (aimPoint && standTile) {
          const cb = wardCrossbarFor({ q: (standTile as any).q, r: (standTile as any).r }, aimPoint, wardingCastLevelFor(progress.level));
          const nodes = wardLineNodesFor(aimPoint.q, aimPoint.r, cb.px, cb.pr, wardingCastLevelFor(progress.level), shieldHp);
          const info = sqlite.prepare("INSERT INTO defence_works (owner_key, placement_id, kind, anchor_q, anchor_r, nodes, created_at) VALUES (?, 0, 'bulwark', ?, ?, ?, ?)")
            .run(ownerKey, aimPoint.q, aimPoint.r, JSON.stringify(nodes), Date.now());
          return { ok: true as const, id: Number(info.lastInsertRowid), tileId, cost: bulwarkCost, shields: nodes.length, shieldHp, roll: cast.roll, mod: cast.mod, dc: cast.dc, spellKey: spell.key };
        }
        const [bdq, bdr] = WALL_DIRS[effDir];
        const blen = Math.hypot(bdq, bdr) || 1;
        const fx = bdq / blen, fr = bdr / blen;
        const px = -fr, pr = fx; // the line runs along the aim's perpendicular — the edge's own line
        const cx = tile.q + fx * 0.5, cy = tile.r + fr * 0.5; // the edge's midpoint, half a hex ahead of the anchor
        const nodes = [];
        for (let i = 0; i < count; i++) {
          const off = (i - (count - 1) / 2) * 0.55;
          nodes.push({ q: cx + px * off, r: cy + pr * off, hp: shieldHp, maxHp: shieldHp });
        }
        const info = sqlite.prepare("INSERT INTO defence_works (owner_key, placement_id, kind, anchor_q, anchor_r, nodes, created_at) VALUES (?, 0, 'bulwark', ?, ?, ?, ?)")
          .run(ownerKey, cx, cy, JSON.stringify(nodes), Date.now());
        return { ok: true as const, id: Number(info.lastInsertRowid), tileId, cost: bulwarkCost, shields: count, shieldHp, roll: cast.roll, mod: cast.mod, dc: cast.dc, spellKey: spell.key };
      }
      // WARDS STAND ANYWHERE (Nigel, 2026-10-20): "wards and
      // runes should be able to be cast anywhere." The held-
      // ground anchor is LIFTED on this ground as at the
      // Table's — a ward may rise on the edge of ANY hex of
      // his land within his reach, cursed hexes included;
      // his Awokin need not hold it, nor he stand on it.
      // What the freedom costs stands in
      // settleHomelandWorkingAttrition: a ward on cursed
      // ground suffers the curse's attrition, like the
      // Tender. (The edge must still be free — one work
      // per edge — and the hex still his: those are the
      // land's shape, not a holding.)
      // WARDS CAST IN A T (Nigel, 2026-10-24 22:35): a cast
      // carrying a tapped POINT raises the ward as the
      // crossbar of a T — centred on the point, running
      // perpendicular to the caster→point axis, its length
      // from the warding cast level (wardCrossbarFor) — and
      // it stands on NO edge: the edge reckoning below (the
      // canonical edge, the one-work-per-edge law) is the
      // road of point-less casts, and of every ward already
      // standing on the land by an edge. Both geometries
      // stand in the one ledger, and the battle reads each
      // by its own shape.
      const lineCast = aimPoint != null && standTile != null;
      let cq = aimCell ? aimCell.q : tile.q, cr = aimCell ? aimCell.r : tile.r, cdir: number | null = effDir;
      let edgeKey: string | null = null;
      if (!lineCast) {
        const [dq, dr] = WALL_DIRS[effDir];
        const nq = tile.q + dq, nr = tile.r + dr;
        const flip = nq < tile.q || (nq === tile.q && nr < tile.r);
        cq = flip ? nq : tile.q; cr = flip ? nr : tile.r; cdir = flip ? WALL_OPP[effDir] : effDir;
        edgeKey = `${cq},${cr},${cdir}`;
        const wallRow = sqlite.prepare("SELECT kind FROM hex_walls WHERE owner_key = ? AND edge_key = ?").get(ownerKey, edgeKey) as any;
        if (wallRow) badRequest(`That edge already carries a ${EDGE_WORK[wallRow.kind]?.name ?? "work"} — one work per edge.`);
        const wardRow = sqlite.prepare("SELECT id FROM territory_workings WHERE owner_key = ? AND edge_key = ? AND kind = 'ward'").get(ownerKey, edgeKey) as any;
        if (wardRow) badRequest("A ward of the Written Light already stands on that edge.");
      }
      if (spell.engine === "standard") {
        const flying = sqlite.prepare("SELECT id FROM territory_workings WHERE owner_key = ? AND engine = 'standard'").get(ownerKey) as any;
        if (flying) badRequest("One Standard per Tender — yours already flies on the map.");
      }
      // Ebb Walker (tranche one): a Tide working cast on Tide
      // or neutral ground costs 1✦ less.
      const ebbWard = workingEffects(ownerKey).ebbWalker && hue === "tide" && (tile.element === "tide" || tile.element === "neutral");
      const wardBase = ebbWard ? Math.max(1, spell.cost - 1) : spell.cost;
      // THE WITCH'S COMPANY PRICE (Recovery R7) rides the
      // ward door's final reckoned price, as at the Table.
      const wardCost = await witchPriceFor(ownerKey, progress.classKey, wardBase);
      if (!(await spendEnergy(ownerKey, wardCost))) badRequest(`Not enough energy — ${spell.name} costs ${wardCost}.`);
      // The roll (Homeland Casting): the purse is charged
      // before it — a fizzle spends the charge alone and
      // raises nothing.
      const cast = homelandCastRoll(progress, spell);
      if (!cast.ok) { const mercyBack = await mercyRefundHomeland(ownerKey, wardCost); return { ok: true as const, fizzled: true as const, roll: cast.roll, mod: cast.mod, dc: cast.dc, cost: wardCost, refunded: await refundHomelandFizzle(ownerKey, progress.classKey, wardCost), ...(mercyBack ? { mercyRefund: mercyBack } : {}), spellKey: spell.key }; }
      // The cast carries the page's filled slots in its
      // element — nothing is spent here; the power was laid
      // into the book, in the Grimoire, beforehand.
      const slots = await pageSlotsCastFor(ownerKey, spell, hue);
      // The health rating (Nigel, 2026-10-17): holding wards are
      // raised with health grown from the book's base, the
      // caster's Tender level, and one per slot the cast
      // carries (hpForCast). The slots' POWER lands in the
      // Seal's riposte below — the answer it gives a striker
      // is the ward's power, as at the Table.
      // Bright: an Engine of yours standing anywhere on the map
      // lifts a new Trees at its raising, as at the Table.
      let hp = 0;
      // The Zodiac rides the map cast (tranche one, 2026-10-17):
      // the same snapshot modifiers as at the Table.
      const eff = workingEffects(ownerKey);
      const mapNums: Record<string, number> = { ...(spell.numbers ?? {}) };
      // The tapped point rides the working, when the cast
      // carried one — the view may draw the ward's heart
      // where the player pointed (2026-10-24).
      if (aimPoint) { mapNums.aimQ = aimPoint.q; mapNums.aimR = aimPoint.r; }
      if (spell.engine === "seal") {
        mapNums.stops = (mapNums.stops ?? 3) + eff.sealStops + (hue === "stone" ? eff.deepSetSealStops : 0);
        mapNums.riposte = (mapNums.riposte ?? 3) + eff.riposte + slots;
      }
      if (spell.engine === "engine") mapNums.energyPerRound = (mapNums.energyPerRound ?? 1) + eff.engineEnergy;
      if (spell.engine === "trees" || spell.engine === "seal") {
        const bright = sqlite.prepare("SELECT id FROM territory_workings WHERE owner_key = ? AND engine = 'engine' AND kind = 'ward'").get(ownerKey) as any;
        hp = hpForCast(spell, progress.level, slots, !!bright);
        hp += eff.wardHp + (spell.engine === "trees" ? eff.treesHp : 0)
          + fxSum(ownerKey, "wardHp"); // THE ZODIAC'S WARD HEALTH (Recovery #1), at the Table's own application point
      }
      // THE T'S GEOMETRY RIDES THE NUMBERS (line casts):
      // the crossbar's unit direction and its length, read
      // by the battle (a blow across the line is turned, as
      // a blow across the edge was) and by the view (the
      // line drawn where it stands).
      if (lineCast && aimPoint && standTile) {
        const cb = wardCrossbarFor({ q: (standTile as any).q, r: (standTile as any).r }, aimPoint, wardingCastLevelFor(progress.level));
        mapNums.linePx = cb.px; mapNums.linePr = cb.pr; mapNums.lineLen = cb.length; mapNums.lineCount = cb.count;
      }
      const info = sqlite.prepare(`INSERT INTO territory_workings
        (owner_key, spell_key, engine, kind, hue, tile_id, edge_key, q, r, dir, nums, hp, stops, charges, pour, max_hp, created_at)
        VALUES (?, ?, ?, 'ward', ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`)
        .run(ownerKey, spell.key, spell.engine, hue, tileId, edgeKey, cq, cr, lineCast ? null : cdir, JSON.stringify(mapNums), hp, slots, hp, Date.now());
      return { ok: true as const, id: Number(info.lastInsertRowid), edgeKey: edgeKey ?? undefined, line: lineCast ? { px: mapNums.linePx, pr: mapNums.linePr, len: mapNums.lineLen, count: mapNums.lineCount } : undefined, cost: wardCost, pour: slots, hp, roll: cast.roll, mod: cast.mod, dc: cast.dc, spellKey: spell.key };
    }

    // ── THE NEW WORKINGS (Nigel, 2026-10-22; seated
    // 2026-10-23) — Bats, the Hold Rune and Rune Shatter,
    // cast on the land through this same door: the purse
    // charged before the roll, a fizzle spent, as every
    // homeland cast stands. They are not writings on a hex —
    // the one-writing-per-hex law below is not theirs — so
    // they branch here, before the written ground.
    if (spell.engine === "bats" || spell.engine === "holdrune" || spell.engine === "shatter") {
      const nowCast = Date.now();
      // THE WITCH'S COMPANY PRICE (Recovery R7): one price
      // for the branch's three doors, reckoned once here.
      const newWorkingPrice = await witchPriceFor(ownerKey, progress.classKey, spell.cost);
      if (spell.engine === "bats") {
        // The cap (Nigel, 2026-10-22): three swarms standing
        // for one caster — the Witch suffers no cap.
        if (progress.classKey !== "witch") {
          const standing = sqlite.prepare("SELECT COUNT(*) AS n FROM territory_workings WHERE owner_key = ? AND engine = 'bats'").get(ownerKey) as any;
          if ((standing?.n ?? 0) >= 3) badRequest("Three swarms already hunt for you — the cap is three to a caster, and the Witch alone suffers none.");
        }
        if (!standTile) badRequest("You have no stand on this land to cast from.");
        if (!(await spendEnergy(ownerKey, newWorkingPrice))) badRequest(`Not enough energy — ${spell.name} costs ${newWorkingPrice}.`);
        const cast = homelandCastRoll(progress, spell);
        if (!cast.ok) return { ok: true as const, fizzled: true as const, roll: cast.roll, mod: cast.mod, dc: cast.dc, cost: newWorkingPrice, refunded: await refundHomelandFizzle(ownerKey, progress.classKey, newWorkingPrice), spellKey: spell.key };
        const info = sqlite.prepare(`INSERT INTO territory_workings
          (owner_key, spell_key, engine, kind, hue, tile_id, edge_key, q, r, dir, nums, hp, stops, charges, pour, max_hp, created_at)
          VALUES (?, ?, 'bats', ?, ?, ?, NULL, ?, ?, NULL, ?, 0, 0, 0, 0, 0, ?)`)
          .run(ownerKey, spell.key, spell.kind, hue, standTile!.id, standTile!.q, standTile!.r,
            JSON.stringify({ bornAt: nowCast, nextBiteAt: nowCast + BATS_BITE_MS, bites: 0, targetId: null }), nowCast);
        return { ok: true as const, id: Number(info.lastInsertRowid), tileId: standTile!.id, cost: newWorkingPrice, roll: cast.roll, mod: cast.mod, dc: cast.dc, spellKey: spell.key };
      }
      if (spell.engine === "holdrune") {
        if (tileId == null) badRequest("Hold Rune needs a foe under the tap — name the hex it stands on.");
        const tile = castTileById.get(tileId) as any;
        if (!tile) badRequest("That hex is not on your map.");
        assertCastReach(tile);
        if (aimPoint) assertPointReach();
        // The dark standing on the named ground: by its tile,
        // or by its free point's cell (the living battle's
        // tongue — a wanderer stands where its point stands).
        // A point cast takes the shade standing ON the point
        // first (2026-10-24): within the rune's radius of
        // where the player tapped, the nearest answers — the
        // radius is the rune's DIAMETER halved (Nigel,
        // 2026-10-24 22:37), half a hex at diameter 1, the
        // measure this road has always read by.
        const holdRadius = Math.max(0.5, runeDiameterFor(runecastLevelFor(progress.level)) / 2);
        const allWanderers = sqlite.prepare("SELECT * FROM homeland_wanderers WHERE owner_key = ?").all(ownerKey) as any[];
        const target = (aimPoint
          ? allWanderers
              .filter((x: any) => x.pos_q != null && x.pos_r != null
                && axialDist({ q: Number(x.pos_q), r: Number(x.pos_r) }, aimPoint) <= holdRadius)
              .sort((a: any, b: any) => axialDist({ q: Number(a.pos_q), r: Number(a.pos_r) }, aimPoint) - axialDist({ q: Number(b.pos_q), r: Number(b.pos_r) }, aimPoint))[0]
          : undefined)
          ?? allWanderers
          .find((x: any) => {
            if (Number(x.tile_id) === tileId) return true;
            if (x.pos_q == null || x.pos_r == null) return false;
            const cell = axialRound(Number(x.pos_q), Number(x.pos_r));
            return cell.q === tile.q && cell.r === tile.r;
          });
        if (!target) badRequest("Hold Rune needs a shade under the tap — no dark stands on that ground.");
        if (!(await spendEnergy(ownerKey, newWorkingPrice))) badRequest(`Not enough energy — ${spell.name} costs ${newWorkingPrice}.`);
        const cast = homelandCastRoll(progress, spell);
        if (!cast.ok) return { ok: true as const, fizzled: true as const, roll: cast.roll, mod: cast.mod, dc: cast.dc, cost: newWorkingPrice, refunded: await refundHomelandFizzle(ownerKey, progress.classKey, newWorkingPrice), spellKey: spell.key };
        const info = sqlite.prepare(`INSERT INTO territory_workings
          (owner_key, spell_key, engine, kind, hue, tile_id, edge_key, q, r, dir, nums, hp, stops, charges, pour, max_hp, created_at)
          VALUES (?, ?, 'holdrune', ?, ?, ?, NULL, ?, ?, NULL, ?, 0, 0, 0, 0, 0, ?)`)
          .run(ownerKey, spell.key, spell.kind, hue, tileId, tile.q, tile.r,
            JSON.stringify({ bornAt: nowCast, targetId: Number(target.id), struckAt: null, holdUntil: 0 }), nowCast);
        return { ok: true as const, id: Number(info.lastInsertRowid), tileId, cost: newWorkingPrice, roll: cast.roll, mod: cast.mod, dc: cast.dc, spellKey: spell.key, targetId: Number(target.id) };
      }
      // RUNE SHATTER — a straight shot at the named ground,
      // 2 tiles from where he stands (the SPEC's reach).
      if (tileId == null) badRequest("Rune Shatter fires at a hex — name the ground.");
      const tile = castTileById.get(tileId) as any;
      if (!tile) badRequest("That hex is not on your map.");
      if (!standTile) badRequest("You have no stand on this land to cast from.");
      // Shatter's reach is a DISTANCE (2026-10-24): from
      // where the caster stands to where the cast lands —
      // the tapped point when the cast carries one, the
      // named hex's heart on the hex road.
      if (aimPoint
        ? axialDist({ q: (standTile as any).q, r: (standTile as any).r }, aimPoint) > SHATTER_RANGE + 1e-9
        : hexDistTiles(standTile as any, tile as any) > SHATTER_RANGE) {
        badRequest("Beyond reach — 2 tiles is Rune Shatter's edge.");
      }
      if (!(await spendEnergy(ownerKey, newWorkingPrice))) badRequest(`Not enough energy — ${spell.name} costs ${newWorkingPrice}.`);
      const cast = homelandCastRoll(progress, spell);
      if (!cast.ok) return { ok: true as const, fizzled: true as const, roll: cast.roll, mod: cast.mod, dc: cast.dc, cost: newWorkingPrice, refunded: await refundHomelandFizzle(ownerKey, progress.classKey, newWorkingPrice), spellKey: spell.key };
      const bonus = castModFor(progress.classKey, progress.level, spell.kind);
      const allFoes = sqlite.prepare("SELECT * FROM homeland_wanderers WHERE owner_key = ?").all(ownerKey) as any[];
      const foe = (aimPoint
        ? allFoes
            .filter((x: any) => x.pos_q != null && x.pos_r != null
              && axialDist({ q: Number(x.pos_q), r: Number(x.pos_r) }, aimPoint) <= 0.5)
            .sort((a: any, b: any) => axialDist({ q: Number(a.pos_q), r: Number(a.pos_r) }, aimPoint) - axialDist({ q: Number(b.pos_q), r: Number(b.pos_r) }, aimPoint))[0]
        : undefined)
        ?? allFoes
        .find((x: any) => {
          if (Number(x.tile_id) === tileId) return true;
          if (x.pos_q == null || x.pos_r == null) return false;
          const cell = axialRound(Number(x.pos_q), Number(x.pos_r));
          return cell.q === tile.q && cell.r === tile.r;
        });
      // A tap looses the three pieces; each is its own shot.
      const shots: { roll: number; total: number; ac: number; hit: boolean }[] = [];
      let felledShatter = false;
      if (foe) {
        const ac = enemyACFor(String(foe.kind ?? "fray"));
        const maxHp = (HOMELAND_DARK_HP[String(foe.kind ?? "fray")] ?? 3) + Math.max(0, (Number(foe.lvl) || 1) - 1);
        let hp = foe.hp == null ? maxHp : Number(foe.hp);
        for (let j = 0; j < 3; j++) {
          const shot = shatterPieceRoll(bonus, ac);
          shots.push({ ...shot, ac });
          if (shot.hit) hp -= 1;
          if (hp <= 0) break;
        }
        if (hp <= 0) {
          sqlite.prepare("DELETE FROM homeland_wanderers WHERE id = ?").run(foe.id);
          await creditBattleKill(ownerKey, String(foe.kind ?? "fray"), tile.element ?? null, null);
          felledShatter = true;
        } else if (shots.some(s => s.hit)) {
          sqlite.prepare("UPDATE homeland_wanderers SET hp = ? WHERE id = ?").run(hp, foe.id);
        }
      } else {
        for (let j = 0; j < 3; j++) { const shot = shatterPieceRoll(bonus, 10); shots.push({ ...shot, ac: 10 }); }
      }
      // HELD: the stream stands as a working of its own —
      // its seconds and pieces are the settle's to reckon.
      let streamId: number | null = null;
      const heldSeconds = Math.floor(Math.max(0, heldMs ?? 0) / 1000);
      if (heldSeconds >= 1) {
        const info = sqlite.prepare(`INSERT INTO territory_workings
          (owner_key, spell_key, engine, kind, hue, tile_id, edge_key, q, r, dir, nums, hp, stops, charges, pour, max_hp, created_at)
          VALUES (?, ?, 'shatter', ?, ?, ?, NULL, ?, ?, NULL, ?, 0, 0, 0, 0, 0, ?)`)
          .run(ownerKey, spell.key, spell.kind, hue, tileId, tile.q, tile.r,
            JSON.stringify({ streamUntil: nowCast + heldSeconds * 1000, nextChargeAt: nowCast + 1000, nextPieceAt: nowCast + 333, ...(aimPoint ? { aimQ: aimPoint.q, aimR: aimPoint.r } : {}) }), nowCast);
        streamId = Number(info.lastInsertRowid);
      }
      return { ok: true as const, id: streamId ?? undefined, tileId, cost: newWorkingPrice, roll: cast.roll, mod: cast.mod, dc: cast.dc, spellKey: spell.key, shots, felled: felledShatter, hits: shots.filter(s => s.hit).length };
    }

    if (spell.kind === "rune" || spell.kind === "spell") {
      if (tileId == null) badRequest("A rune is written on a hex's ground — name the hex.");
      const tileRows = await db.select().from(schema.territoryTiles)
        .where(and(eq(schema.territoryTiles.id, tileId), eq(schema.territoryTiles.ownerKey, ownerKey)));
      const tile = tileRows[0] as any;
      if (!tile) badRequest("That hex is not on your map to write upon.");
      assertCastReach(tile);
      if (aimPoint) assertPointReach();
      const existing = sqlite.prepare("SELECT id FROM territory_workings WHERE owner_key = ? AND tile_id = ? AND kind IN ('rune', 'spell')").get(ownerKey, tileId) as any;
      if (existing) badRequest("That ground is already written — one writing per hex.");
      // THE THREE BLADES ON THE MAP (the audit of 2026-10-20):
      // this branch once REFUSED the Blades outright — "planted
      // a hex at a time on the map" — so the page could never be
      // cast on this ground at all, though its springing stood
      // ready in springHomelandWorking. The refusal's own words
      // were the law: a hex at a time. The cast below writes ONE
      // of the three on the named hex, at the book's price per
      // cast, with the Table's own charges — cast it thrice for
      // the volley, as the Table plants it on up to three hexes.
      const ebbRune = workingEffects(ownerKey).ebbWalker && hue === "tide" && (tile.element === "tide" || tile.element === "neutral");
      const runeBase = ebbRune ? Math.max(1, spell.cost - 1) : spell.cost;
      // THE WITCH'S COMPANY PRICE (Recovery R7) rides the
      // rune door's final reckoned price, as at the Table.
      const runeCost = await witchPriceFor(ownerKey, progress.classKey, runeBase);
      if (!(await spendEnergy(ownerKey, runeCost))) badRequest(`Not enough energy — ${spell.name} costs ${runeCost}.`);
      // The roll (Homeland Casting): charged before it — a
      // fizzle spends the charge alone and writes nothing.
      const cast = homelandCastRoll(progress, spell);
      if (!cast.ok) { const mercyBack = await mercyRefundHomeland(ownerKey, runeCost); return { ok: true as const, fizzled: true as const, roll: cast.roll, mod: cast.mod, dc: cast.dc, cost: runeCost, refunded: await refundHomelandFizzle(ownerKey, progress.classKey, runeCost), ...(mercyBack ? { mercyRefund: mercyBack } : {}), spellKey: spell.key }; }
      // The cast carries the page's filled slots in its
      // element, as at the ward's raising on this ground
      // — nothing is spent at the cast; the power stands in
      // the book (pageSlotsCastFor).
      const slots = await pageSlotsCastFor(ownerKey, spell, hue);
      const effR = workingEffects(ownerKey);
      const charges = (spell.engine === "blade" || spell.engine === "blades" || spell.engine === "springblade") ? (spell.numbers.charges ?? 2) + effR.bladeSprings : spell.engine === "coil" ? 1 + effR.coilTurns : 1;
      // SHARD RAIN (Nigel, 2026-10-17): the caster's attunement
      // level in the spell's element rides inside the stored
      // numbers, snapshotted at the cast as HP is — on the map
      // the rain covers the one hex the rune is written on, and
      // the Battleground splits its pool over the dark standing
      // there when it springs. The element is the DERIVED one
      // (pageHueFor judged the Rain by these same pool bands),
      // and the band is the dice's ONE feed — the page's slots
      // never feed the Rain (it holds none).
      let numsToStore: Record<string, number> = { ...(spell.numbers ?? {}) };
      // The tapped point rides the writing (2026-10-24):
      // the spring reads it (a dark thing standing on the
      // point springs the writing), the loose reads it
      // (the Blade answers by the distance from it), and
      // the view draws the writing where it was laid.
      if (aimPoint) { numsToStore.aimQ = aimPoint.q; numsToStore.aimR = aimPoint.r; }
      // THE SIZE OF THE WORK (Nigel, 2026-10-24 22:37): a
      // rune's DIAMETER by the runecasting level, snapshotted
      // into its numbers as HP is — its springs read the
      // footprint it was written with (runeDiameterFor).
      if (spell.kind === "rune") numsToStore.diameter = runeDiameterFor(runecastLevelFor(progress.level));
      // The Zodiac rides the rune's stored numbers (tranche one).
      if (typeof numsToStore.power === "number") numsToStore.power += effR.runePower
        + fxSum(ownerKey, "runeDamage"); // THE ZODIAC'S RUNE DAMAGE (Recovery #1), snapshotted with the rest
      if (typeof numsToStore.pinRounds === "number") numsToStore.pinRounds += effR.runePin;
      if (spell.engine === "shard" && effR.crownThreshold != null) numsToStore.minPower = Math.min(numsToStore.minPower ?? 5, effR.crownThreshold);
      if (spell.engine === "coil") numsToStore.energyPerDark = (numsToStore.energyPerDark ?? 1) + effR.coilReturn;
      if (spell.engine === "shardrain") {
        let lvl = 0;
        if (hue !== "unaligned") {
          const pools = await attunementPools(ownerKey);
          lvl = attunementLevel((pools[hue] ?? 0) + (skillAttunementGrants(ownerKey)[hue] ?? 0));
        }
        // THE RAIN'S AREA (Nigel, 2026-10-24 22:37): the
        // ground its fall covers beyond its own hex, by the
        // spellcasting level — snapshotted with the rest.
        numsToStore = { ...numsToStore, rainLevel: lvl, areaReach: shardRainReachFor(spellcastLevelFor(progress.level)) };
      }
      // The Lattice holds its ground with a health rating, like
      // the holding wards; harm and snare runes carry none.
      // (A Crown Shard written on this ground stands holding
      // its slots in the row below — its pour — and its spring
      // reads them at face value when it falls:
      // springHomelandWorking's shard branch, Recovery R5.)
      const hp = spell.engine === "lattice" ? hpForCast(spell, progress.level, slots, false) : 0;
      const info = sqlite.prepare(`INSERT INTO territory_workings
        (owner_key, spell_key, engine, kind, hue, tile_id, edge_key, q, r, dir, nums, hp, stops, charges, pour, max_hp, created_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?, ?, 0, ?, ?, ?, ?)`)
        .run(ownerKey, spell.key, spell.engine, spell.kind, hue, tileId, tile.q, tile.r, JSON.stringify(numsToStore), hp, charges, slots, hp, Date.now());
      const newId = Number(info.lastInsertRowid);
      // The writing springs the moment it lands, if the dark
      // already stands on its ground or the curse holds that
      // ground (Homeland Casting — the Table's cast-time
      // spring, honored on this ground too). The Single
      // Blade alone does not: it waits armed for the click
      // (springHomelandWorking holds its law).
      const sprungNow = await springHomelandWorking(ownerKey, newId, castTiles as any[]);
      // THE FELL DRIP: if the writing's spring beat the dark
      // standing on it, the fell pays as any beaten creature
      // pays (Nigel, 2026-10-20).
      if (sprungNow.felled) await payFellDrip(ownerKey, tile.element ?? null);
      return { ok: true as const, id: newId, tileId, cost: runeCost, pour: slots, hp, roll: cast.roll, mod: cast.mod, dc: cast.dc, spellKey: spell.key, sprung: sprungNow.sprung, felled: sprungNow.felled, ground: sprungNow.ground, purified: sprungNow.purified };
    }

    badRequest("That page of the book cannot be cast on the land.");
  },

  /** LOOSE THE SINGLE BLADE (Nigel, 2026-10-20, spec
   *  single-blade-click-spring; re-ruled 2026-10-23 —
   *  Recovery R4): the player's click on a dark thing is an
   *  ORDER to the written Blade, not a cast — no roll, no
   *  energy, seamless casting untouched. The clicked dark
   *  must stand within TWO HEXES of the rune's hex (the
   *  book's own spring measure); the NEAREST armed Blade
   *  answers; the harm is the book's — flat power (6 on the
   *  page), no die, no AC — and the loose spends one of the
   *  working's charges, as a spring spent it. Out of reach,
   *  the click is answered in plain words and every armed
   *  Blade stays armed. The flight itself is the client's
   *  to draw (fromTileId is the rune's ground); the harm is
   *  refereed here, whole. */
  async looseBlade(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ wandererId: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("The order needs a dark thing to name.");
    const { wandererId } = parsed.data;
    const wanderer = sqlite.prepare("SELECT * FROM homeland_wanderers WHERE owner_key = ? AND id = ?").get(ownerKey, wandererId) as any;
    if (!wanderer) badRequest("That dark thing is gone — no blade answers, and every armed blade stays armed.");
    const tiles = await db.select().from(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
    const tileById = new Map((tiles as any[]).map((t: any) => [t.id, t]));
    // The dark stands where it walks: its free point's cell
    // when it carries one, else the tile it is filed under.
    let markTile: any = tileById.get(Number(wanderer.tile_id)) ?? null;
    if (wanderer.pos_q != null && wanderer.pos_r != null) {
      const cell = axialRound(Number(wanderer.pos_q), Number(wanderer.pos_r));
      markTile = (tiles as any[]).find((t: any) => t.q === cell.q && t.r === cell.r) ?? markTile;
    }
    if (!markTile) badRequest("That dark thing stands on no ground of yours — the blade stays armed.");
    const blades = sqlite.prepare("SELECT * FROM territory_workings WHERE owner_key = ? AND engine = 'blade' AND kind = 'rune' AND charges > 0 ORDER BY id").all(ownerKey) as any[];
    if (!blades.length) badRequest("No Single Blade stands armed on your land — write one first, and it will wait for your click.");
    let best: { w: any; tile: any; dist: number } | null = null;
    for (const w of blades) {
      const rt = tileById.get(Number(w.tile_id));
      if (!rt) continue;
      // NO HEX-LOCK (Nigel, 2026-10-23 23:04; built
      // 2026-10-24): a Blade written at a tapped point
      // answers by the DISTANCE from that point to the
      // dark thing's own standing point — two hexes of
      // ground, the book's own spring measure. A Blade
      // written on the hex road keeps its hex measure.
      let wNums: Record<string, number> = {};
      try { wNums = JSON.parse(w.nums ?? "{}"); } catch { wNums = {}; }
      const dist = typeof wNums.aimQ === "number" && typeof wNums.aimR === "number"
        && wanderer.pos_q != null && wanderer.pos_r != null
        ? axialDist({ q: wNums.aimQ, r: wNums.aimR }, { q: Number(wanderer.pos_q), r: Number(wanderer.pos_r) })
        : hexDistTiles(rt, markTile);
      if (dist <= 2 && (!best || dist < best.dist)) best = { w, tile: rt, dist };
    }
    if (!best) badRequest("Beyond its reach — a Single Blade answers only a dark thing within two hexes of its writing. The blade stays armed.");
    const chosen = best.w;
    let nums: Record<string, number> = {};
    try { nums = JSON.parse(chosen.nums ?? "{}"); } catch { nums = {}; }
    const bright = !!sqlite.prepare("SELECT id FROM territory_workings WHERE owner_key = ? AND engine = 'engine' AND kind = 'ward'").get(ownerKey);
    const power = (nums.power ?? 6) + (bright ? (nums.brightBonus ?? 1) : 0);
    const maxHp = (HOMELAND_DARK_HP[String(wanderer.kind ?? "fray")] ?? 3) + Math.max(0, (Number(wanderer.lvl) || 1) - 1);
    const cur = wanderer.hp == null ? maxHp : Number(wanderer.hp);
    const next = cur - power;
    const felled = next <= 0;
    if (felled) sqlite.prepare("DELETE FROM homeland_wanderers WHERE id = ?").run(wanderer.id);
    else sqlite.prepare("UPDATE homeland_wanderers SET hp = ? WHERE id = ?").run(next, wanderer.id);
    const chargesLeft = (chosen.charges ?? 1) - 1;
    if (chargesLeft <= 0) sqlite.prepare("DELETE FROM territory_workings WHERE id = ?").run(chosen.id);
    else sqlite.prepare("UPDATE territory_workings SET charges = ? WHERE id = ?").run(chargesLeft, chosen.id);
    if (felled) await creditBattleKill(ownerKey, String(wanderer.kind ?? "fray"), markTile.element ?? null, null);
    return { ok: true as const, loosed: true as const, workingId: Number(chosen.id), fromTileId: Number(chosen.tile_id), targetId: wandererId, harm: power, felled, chargesLeft: Math.max(0, chargesLeft) };
  },

  /** Teach an Awoken a skill (WARDING or RUNEING). Until the
   *  milestone ability picks are built, teaching is the bridge: the
   *  Tender teaches, the ledger records, the edge works obey. An
   *  Awoken must have reached level 5 — skills are milestone
   *  teachings (stems, War-Ground 2026-10-15). */
  async teachSkill(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ awakenedId: z.number().int().positive(), skill: z.enum(["warding", "runeing"]) }).safeParse(args);
    if (!parsed.success) badRequest("The War-Ground needs an Awokin and a skill (warding or runeing).");
    const { awakenedId, skill } = parsed.data;
    const rows = await db.select().from(schema.awakened)
      .where(and(eq(schema.awakened.id, awakenedId), eq(schema.awakened.ownerKey, ownerKey))).limit(1);
    const aw = rows[0] as any;
    if (!aw) badRequest("That Awokin is not yours to teach.");
    const level = awokenLevelOf(aw.experience ?? 0);
    if (level < TEACH_MIN_LEVEL) badRequest(`${aw.name ?? "That Awokin"} has not reached level ${TEACH_MIN_LEVEL} — skills are milestone teachings, earned by seasons of war.`);
    const known = sqlite.prepare("SELECT id FROM awoken_skills WHERE owner_key = ? AND awakened_id = ? AND skill = ?").get(ownerKey, awakenedId, skill);
    if (known) badRequest(`${aw.name ?? "That Awokin"} already holds the ${skill === "warding" ? "Warding" : "Runeing"} skill.`);
    if (!(await spendEnergy(ownerKey, TEACH_COST))) badRequest(`Not enough energy — a teaching costs ${TEACH_COST}.`);
    sqlite.prepare("INSERT INTO awoken_skills (owner_key, awakened_id, skill, created_at) VALUES (?, ?, ?, ?)")
      .run(ownerKey, awakenedId, skill, Date.now());
    return { ok: true as const, awakenedId, skill, cost: TEACH_COST };
  },

  // SET PATROL (War-Ground, Nigel 2026-10-16): the marching layer's
  // only law. A patrol road is DATA on the placement — tile ids the
  // Tender tapped — and the hour the march began; every viewer
  // derives the walker's position from road + clock, so all screens
  // agree without a simulation. COSMETIC by Nigel's ruling: no
  // system of war, works or attunement reads the road; the
  // placement (the home hex) remains the whole legal truth — which
  // is the point: staying means something because marching exists.
  // An empty road calls the walker home (clears the patrol).
  // MARCH SETTLEMENT (War-Ground, 2026-10-16): a march whose hour has
  // come LANDS — the placement itself moves to the destination and
  // the order clears. No ticker runs anywhere; the record settles
  // wherever it is next read with authority (territory reads, battle
  // resolutions, new orders). Until settlement the walker musters at
  // its ORIGIN — a march is answered where it began until it ends.
  async settleMarches(ownerKey: string) {
    const now = Date.now();
    const rows = sqlite.prepare(
      "SELECT id, awakened_id, follow, march_path, march_ends, march_goal FROM field_placements WHERE owner_key = ? AND march_path IS NOT NULL AND march_ends IS NOT NULL AND march_ends <= ?"
    ).all(ownerKey, now) as { id: number; awakened_id: number; follow: number; march_path: string; march_ends: number; march_goal: string | null }[];
    for (const row of rows) {
      let dest: number | null = null;
      try {
        const road = JSON.parse(row.march_path);
        if (Array.isArray(road) && road.length) dest = road[road.length - 1];
      } catch { /* a broken road settles nowhere — the order still clears */ }
      // SENT HOME (Station 4, Nigel 2026-10-20): a march whose
      // errand was the bastion does not land as a placement —
      // if the bastion still stands where the road ended, the
      // walker steps off the field into its staged ranks. If
      // the bastion fell while it walked, the road's end is
      // simply ground, and it lands as any marcher lands.
      if (dest !== null && row.march_goal === "bastion") {
        const bastion = bastionRowFor(ownerKey);
        if (bastion && bastion.tileId === dest) {
          sqlite.prepare("DELETE FROM field_placements WHERE id = ?").run(row.id);
          sqlite.prepare("INSERT OR IGNORE INTO bastion_staged (owner_key, awakened_id, staged_at, via) VALUES (?, ?, ?, ?)")
            .run(ownerKey, row.awakened_id, row.march_ends, row.follow === 1 ? "field" : "march");
          continue;
        }
      }
      if (dest !== null) {
        // The landing: the placement takes the destination
        // tile, and its standing point becomes the free
        // point the march carried — or, for a march that
        // carried none, the destination tile's CENTRE
        // point (SQLite reads every SET expression off the
        // row as it stood, so the copy lands before the
        // clearing in the same breath). A landed figure
        // always holds a real free position: the fixed
        // standing offsets are gone from the law.
        sqlite.prepare("UPDATE field_placements SET tile_id = ?, last_moved_at = ?, pos_q = COALESCE(march_pos_q, (SELECT q FROM territory_tiles WHERE id = ?)), pos_r = COALESCE(march_pos_r, (SELECT r FROM territory_tiles WHERE id = ?)), march_pos_q = NULL, march_pos_r = NULL, march_path = NULL, march_since = NULL, march_ends = NULL, march_goal = NULL WHERE id = ?")
          .run(dest, row.march_ends, dest, dest, row.id);
      } else {
        sqlite.prepare("UPDATE field_placements SET march_pos_q = NULL, march_pos_r = NULL, march_path = NULL, march_since = NULL, march_ends = NULL, march_goal = NULL WHERE id = ?")
          .run(row.id);
      }
    }
    // CURSE ATTRITION (Nigel, 2026-10-19): a placement standing
    // on cursed ground withers — the ring's share of its
    // greatest health per beat (2.8s) of standing, reckoned
    // from its watermark whenever the world settles. One
    // settle never reckons more than a minute of it: the
    // curse pressures the Tender who works in it — it does
    // not execute the absent. On the land the withering falls
    // on the Awokin standing in the curse; at the Table it
    // falls on everyone standing there, the Tender included.
    const standings = sqlite.prepare(
      `SELECT p.id, p.awakened_id, p.hp, p.curse_since, t.cursed, t.q, t.r
       FROM field_placements p LEFT JOIN territory_tiles t ON t.id = p.tile_id
       WHERE p.owner_key = ?`
    ).all(ownerKey) as any[];
    // THE RUNEWRIGHT'S COMPANY (Nigel, 2026-10-22 12:27;
    // Recovery R7): her Awokin suffer less of this withering
    // — curseReliefFor (1 to start, +1 per 3rd tender level)
    // off the damage for every beat of the curse's own clock
    // (2.8 s) the reckoning spans, read once for the settle.
    const marchProgress = await getTenderProgress(ownerKey).catch(() => null);
    const curseRelief = curseReliefFor(marchProgress?.classKey, marchProgress?.level ?? 1, ownerKey);
    for (const s of standings) {
      if (!s.cursed) {
        if (s.curse_since != null) sqlite.prepare("UPDATE field_placements SET curse_since = NULL WHERE id = ?").run(s.id);
        continue;
      }
      if (s.curse_since == null) {
        sqlite.prepare("UPDATE field_placements SET curse_since = ? WHERE id = ?").run(now, s.id);
        continue;
      }
      const elapsed = Math.min(now - Number(s.curse_since), 60000);
      if (elapsed < 1000) continue;
      const ring = Math.max(Math.abs(s.q ?? 0), Math.abs(s.r ?? 0), Math.abs((s.q ?? 0) + (s.r ?? 0)));
      const maxHp = await placementMaxHp(s.awakened_id);
      const dmg = Math.max(0, maxHp * (0.01 * (ring + 1)) * (elapsed / 2800) - curseRelief * (elapsed / 2800));
      if (dmg <= 0) continue;
      const result = await damagePlacement({ id: s.id, awakenedId: s.awakened_id, hp: s.hp } as any, dmg);
      if (!result.dissipated) sqlite.prepare("UPDATE field_placements SET curse_since = ? WHERE id = ?").run(now, s.id);
    }
  },

  /** THE COLUMNS SETTLE (Nigel, 2026-10-17): arrivals land,
      and a lit Eye with no column walking sends one. Lazy,
      like the marches — the world moves when it is read.
      (Unheld seeds were CORRUPTED on a column's arrival
      until the feeding law suspended the curse's power over
      starseeds, 2026-10-24 18:18 — see the landing below.)
      The column is only a traced line: it never crosses
      purified land; on arrival its force appears on the
      hexes beside the target at the fog's edge. */
  async settleIncursions(ownerKey: string) {
    const now = Date.now();
    // STARFALL (ruled 2026-10-16; re-founded by Nigel,
    // 2026-10-24 23:42–23:43): the hourly gate stands — a
    // 13% roll for each settled hour — under two new laws.
    // ONE STAR ON A MAP AT A TIME (23:42: "we need to cap
    // starfall to one star on a map at a time"): while a
    // star lies on the map untaken — fallen, or corrupted
    // in the dark's hands — the sky stays closed; it
    // reopens when the star is taken up (fetched, held,
    // grown past lying). A fall is a SINGLE star now: the
    // 1–3 drop and the five-fallen cap this block once
    // kept are superseded in count by the cap. And ONLINE
    // ONLY (23:43: "and they only fall online"): the gate
    // rolls only for hours the Tender was present — the
    // presence stamp (starfall_seen_at) walks with every
    // settle, and a silence longer than the house's
    // presence gap walks the anchor past the absent hours
    // unrolled, so no falls bank up offline. Where a star
    // lands, it makes its SANCTUARY (the feeding law,
    // 2026-10-24 18:18): it purifies the tile it falls on,
    // and the curse thins for two rings around it at the
    // first star's calm profile — the calm pass below
    // (settleSeedCalm) reckons fallen seeds into the calm
    // now, as it reckons held ones.
    {
      const attRow = sqlite.prepare("SELECT starfall_anchor_at, starfall_seen_at FROM tender_attention WHERE owner_key = ?").get(ownerKey) as any;
      let anchor = Number(attRow?.starfall_anchor_at || 0);
      const seen = Number(attRow?.starfall_seen_at || 0);
      if (!anchor) {
        sqlite.prepare(`INSERT INTO tender_attention (owner_key, eye, updated_at, break_until, total_spent, starfall_anchor_at, starfall_seen_at)
          VALUES (?, 0, ?, 0, 0, ?, ?) ON CONFLICT(owner_key) DO UPDATE SET starfall_anchor_at = excluded.starfall_anchor_at, starfall_seen_at = excluded.starfall_seen_at`)
          .run(ownerKey, now, now, now);
        anchor = now;
      } else if (!seen || now - seen > PROTECTION_ONLINE_GAP_MS) {
        // Absence: the sky was unwitnessed — those hours
        // never roll. (PROTECTION_ONLINE_GAP_MS is the
        // house's standing presence measure, the protection
        // settle's own.)
        anchor = now;
      }
      const hours = Math.min(24, Math.floor((now - anchor) / 3600000));
      if (hours > 0) {
        const tilesAll = await db.select().from(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
        for (let h = 0; h < hours; h++) {
          const lying = sqlite.prepare("SELECT COUNT(*) AS n FROM star_seeds WHERE owner_key = ? AND state IN ('fallen','corrupted')").get(ownerKey) as any;
          if (Number(lying?.n ?? 0) > 0) break; // one star at a time: the sky stays closed
          if (Math.random() >= 0.13) continue;
          const seededTiles = new Set((sqlite.prepare("SELECT tile_id FROM star_seeds WHERE owner_key = ? AND state IN ('fallen','held','corrupted','first')").all(ownerKey) as any[]).map(r => r.tile_id));
          const spots = tilesAll.filter(t => !(t.q === 0 && t.r === 0) && !seededTiles.has(t.id));
          if (!spots.length) break;
          const spot = spots[Math.floor(Math.random() * spots.length)];
          sqlite.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at) VALUES (?, ?, 1, 'fallen', ?)").run(ownerKey, spot.id, now);
          // THE SANCTUARY (2026-10-24 18:18): a fallen seed
          // purifies the tile it lands on — the standard
          // purification shape, as the bank writes it.
          if ((spot as any).cursed) {
            await db.update(schema.territoryTiles)
              .set({ cursed: 0, element: "root", curseHp: null, curseMaxHp: null, ...PURIFIED_TILE_FIELDS })
              .where(eq(schema.territoryTiles.id, spot.id));
            (spot as any).cursed = 0;
          }
        }
        anchor = anchor + hours * 3600000;
      }
      sqlite.prepare("UPDATE tender_attention SET starfall_anchor_at = ?, starfall_seen_at = ? WHERE owner_key = ?").run(anchor, now, ownerKey);
    }
    // Fetch parties land, gather, and ride home.
    await this.settleSeedMissions(ownerKey);
    // Arrivals — THE LANDING (the Token Strip, Nigel
    // 2026-10-23: "Get rid of all the letters and skull UI.
    // They have been stuck on my map for days."). A column
    // used to come to rest in 'arrived' and stand on the map
    // as lettered chips until a Table battle retired it —
    // columns and corrupted seeds had NO exit of their own,
    // so they persisted for days. A column now LANDS: its
    // roster takes the land as real wanderers on the cursed
    // hexes beside its target (the very hexes the letter
    // chips stood on), each carrying its column's id, and
    // the column itself comes to rest in 'landed' — fought
    // where it stands, by the living battle, the weapon and
    // the written ground, like any other dark. This pass
    // also lands every column already resting in 'arrived',
    // so a Tender whose map has carried the tokens for days
    // is cleared by the next read, not merely spared new
    // ones. An open call against a landing column closes
    // (state 'landed'): the fight has moved to the land.
    const arriving = sqlite.prepare(
      "SELECT * FROM incursion_columns WHERE owner_key = ? AND (state = 'arrived' OR (state = 'marching' AND arrives_at <= ?))"
    ).all(ownerKey, now) as any[];
    if (arriving.length) {
      const tilesAll = await db.select().from(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
      const tileById = new Map((tilesAll as any[]).map(t => [t.id, t]));
      const tileByQR = new Map((tilesAll as any[]).map(t => [`${t.q},${t.r}`, t]));
      const DIRS6 = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
      // Standing points within a host hex, cycled so the
      // landed force spreads over the ground it holds
      // instead of stacking on one point.
      const SPREAD: [number, number][] = [[0, 0], [0.32, 0], [0, 0.32], [-0.32, 0.16], [0.16, -0.32], [-0.32, -0.16], [0.32, 0.32], [-0.16, 0.32]];
      for (const col of arriving) {
        const target = col.target_tile_id != null ? tileById.get(col.target_tile_id) : null;
        if (target) {
          const hosts = DIRS6
            .map(([dq, dr]) => tileByQR.get(`${target.q + dq},${target.r + dr}`))
            .filter(t => t && t.cursed) as any[];
          const hostTiles = hosts.length ? hosts : [target];
          const kinds = incursionRoster(Number(col.size || 0), Number(col.power || 1))
            .flatMap(r => Array(r.count).fill(r.kind)) as string[];
          const lvl = Math.max(1, Number(col.power || 1));
          kinds.forEach((kind, i) => {
            const host = hostTiles[i % hostTiles.length];
            const [oq, orr] = SPREAD[Math.floor(i / hostTiles.length) % SPREAD.length];
            const maxHp = (HOMELAND_DARK_HP[kind] ?? 3) + (lvl - 1);
            sqlite.prepare("INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp, pos_q, pos_r, power, lvl, column_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
              .run(ownerKey, host.id, kind, now, maxHp, host.q + oq, host.r + orr, HOMELAND_DARK_POWER[kind] ?? 1, lvl, col.id);
          });
        }
        sqlite.prepare("UPDATE incursion_columns SET state = 'landed', resolved_at = ? WHERE id = ?").run(now, col.id);
        sqlite.prepare("UPDATE bastion_calls SET state = 'landed' WHERE column_id = ? AND state = 'open'").run(col.id);
        if (col.target_kind === "seed" && col.target_tile_id != null) {
          // Q4 RULED (Nigel, 2026-10-17) — SUSPENDED by the
          // feeding law (Nigel, 2026-10-24 18:18): "for now
          // give the curse no effect on starseeds. they can
          // not force their way into its light." A column
          // that reaches an unheld seed once CORRUPTED it —
          // a cursed bastion, the column its guard, a siege.
          // For now the seed is NOT taken: the column lands,
          // its force stands on the land as wanderers to be
          // fought there, and the seed lies fallen in its
          // own light, uncorrupted. Seeds already corrupted
          // before the suspension keep their road back (the
          // guard-exit below reads them as it always has).
          // The suspension is provisional by his own words;
          // the Q4 road stands written in this comment for
          // the day he lifts it.
        }
      }
    }
    // THE CORRUPTED SEED'S EXIT (the Token Strip): a corrupted
    // seed had no road back — it waited for a Table siege
    // forever. Its guard is the landed force that holds it:
    // when no wanderer of its guarding column still stands,
    // the corruption lifts and the seed lies FALLEN again,
    // to be fetched or held like any other. (A siege won at
    // the Table frees it the same way, by that road's own
    // reckoning in table.ts.)
    {
      const corrupted = sqlite.prepare("SELECT id, tile_id FROM star_seeds WHERE owner_key = ? AND state = 'corrupted'").all(ownerKey) as any[];
      for (const seed of corrupted) {
        const guards = sqlite.prepare("SELECT id FROM incursion_columns WHERE owner_key = ? AND target_tile_id = ? AND kind = 'siege' AND state IN ('arrived','landed')").all(ownerKey, seed.tile_id) as any[];
        const guardStands = guards.some(g =>
          Number((sqlite.prepare("SELECT COUNT(*) AS n FROM homeland_wanderers WHERE owner_key = ? AND column_id = ?").get(ownerKey, g.id) as any)?.n ?? 0) > 0);
        if (!guardStands) {
          sqlite.prepare("UPDATE star_seeds SET state = 'fallen' WHERE id = ?").run(seed.id);
        }
      }
    }
    // THE SPRINGLEAF'S OLD READING, RETIRED (Homeland
    // Casting, Nigel 2026-10-20): a referee from the columns'
    // first season treated a stored Springleaf row as a
    // column-stopper to be consumed on a marching line. The
    // spell's own page in the Grimoire never held that law —
    // the Springleaf is a GROVE, mother and saplings, that
    // mends the company standing in it — and from this build
    // the homeland keeps her true shape (settleHomelandGroves).
    // The columns face the grove as they face any other
    // homeland: by arriving.
    // The Eye: spawn when lit, unanswered, and the break has run.
    const att = sqlite.prepare("SELECT eye, updated_at, break_until FROM tender_attention WHERE owner_key = ?").get(ownerKey) as any;
    const eye = decayedEye(att, now);
    const active = sqlite.prepare(
      "SELECT COUNT(*) AS n FROM incursion_columns WHERE owner_key = ? AND state IN ('marching','arrived')"
    ).get(ownerKey) as any;
    if (att && Number(active?.n ?? 0) === 0 && now >= Number(att.break_until || 0) && eye >= EYE_SPAWN_THRESHOLD) {
      const tiles = await db.select().from(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
      if (tiles.length) {
        const tileById = new Map(tiles.map(t => [t.id, t]));
        // Targets, in the curse's hunger: a fallen seed first,
        // then a built edge hex, then any fog-edge hex.
        let target: any = null; let targetKind = "hex";
        const seed = sqlite.prepare(
          "SELECT tile_id FROM star_seeds WHERE owner_key = ? AND state = 'fallen' ORDER BY created_at ASC LIMIT 1"
        ).get(ownerKey) as any;
        if (seed && tileById.has(seed.tile_id)) { target = tileById.get(seed.tile_id); targetKind = "seed"; }
        if (!target) {
          const keyOf = (q: number, r: number) => `${q},${r}`;
          const byQR = new Map(tiles.map(t => [keyOf(t.q as number, t.r as number), t]));
          const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
          const edge = tiles.filter(t => !t.cursed && DIRS.some(([dq, dr]) => {
            const n = byQR.get(keyOf((t.q as number) + dq, (t.r as number) + dr));
            return !n || n.cursed;
          }));
          if (edge.length) {
            const built = sqlite.prepare(
              "SELECT tile_id, building_type FROM territory_buildings WHERE owner_key = ? AND status = 'active'"
            ).all(ownerKey) as any[];
            const builtIds = new Set(built.map(b => b.tile_id));
            const bastionIds = new Set(built.filter(b => b.building_type === "bastion").map(b => b.tile_id));
            // Bastions are besieged first — they are the beacons
            // the curse most wants dark (the Columns, 2026-10-17).
            const bastionEdge = edge.filter(t => bastionIds.has(t.id));
            const builtEdge = edge.filter(t => builtIds.has(t.id));
            const pool = bastionEdge.length ? bastionEdge : builtEdge.length ? builtEdge : edge;
            target = pool[Math.floor(Math.random() * pool.length)];
          }
        }
        if (target) {
          const sizeByEye = eye < 50 ? 3 + Math.floor((eye - 25) / 8)
            : eye < 100 ? 6 + Math.floor((eye - 50) / 10)
            : Math.min(20, 11 + Math.floor((eye - 100) / 15));
          // No two marches alike (playtest, 2026-10-18): the
          // Eye sets the column's weight, but the curse musters
          // unevenly — size strays a step either way, and the
          // road takes a little more or less time than the last.
          const size = Math.max(1, sizeByEye + Math.floor(Math.random() * 3) - 1);
          const progress = await getTenderProgress(ownerKey).catch(() => null) as any;
          const powerTier = 1 + Math.floor(((progress?.level ?? 1) - 1) / 3);
          const kind = eye >= EYE_SIEGE_THRESHOLD ? "siege" : "raid";
          const travelMin = Math.min(1440, Math.max(COLUMN_MIN_TRAVEL_MIN,
            Math.round((COLUMN_MIN_TRAVEL_MIN + size * 8) * (0.85 + Math.random() * 0.3))));
          // The line traces from OUTSIDE the map: from the
          // territory's heart through the target, nine hexes
          // beyond its edge.
          const cq = tiles.reduce((a, t) => a + (t.q as number), 0) / tiles.length;
          const cr = tiles.reduce((a, t) => a + (t.r as number), 0) / tiles.length;
          let dq = (target.q as number) - cq, dr = (target.r as number) - cr;
          const len = Math.hypot(dq, dr) || 1; dq /= len; dr /= len;
          sqlite.prepare(`INSERT INTO incursion_columns
            (owner_key, target_tile_id, target_kind, kind, size, power, state, origin_q, origin_r, spawned_at, arrives_at)
            VALUES (?, ?, ?, ?, ?, ?, 'marching', ?, ?, ?, ?)`)
            .run(ownerKey, target.id, targetKind, kind, size, powerTier,
              Math.round(((target.q as number) + dq * 9) * 10) / 10,
              Math.round(((target.r as number) + dr * 9) * 10) / 10,
              now, now + travelMin * 60000);
          sqlite.prepare("UPDATE tender_attention SET eye = ?, updated_at = ? WHERE owner_key = ?")
            .run(Math.max(0, eye - EYE_SPAWN_RELIEF), now, ownerKey);
        }
      }
    }
    // The seed-calm is reckoned last, over everything this
    // settle may have cursed or corrupted.
    await this.settleSeedCalm(ownerKey);
  },

  /** The calm made true on the tiles themselves (the
   *  Seed-Calm, Nigel 2026-10-17): every cursed tile within a
   *  living seed's reach has its curse strength re-reckoned
   *  at its effective ring — current HP clamps down when the
   *  calm falls on it — and a tile whose calm has COLLAPSED
   *  (its stored depth is shallower than its natural ring
   *  allows) re-thickens by the difference. Tiles the calm
   *  has never touched are left exactly as they were. */
  async settleSeedCalm(ownerKey: string) {
    const seedHexes = await livingSeedHexes(ownerKey);
    const mood = (await getWorldMood()).mood;
    const tiles = await db.select().from(schema.territoryTiles)
      .where(and(eq(schema.territoryTiles.ownerKey, ownerKey), eq(schema.territoryTiles.cursed, 1)));
    for (const t of tiles as any[]) {
      const mapRing = Math.max(Math.abs(t.q), Math.abs(t.r), Math.abs(t.q + t.r));
      const effRing = calmEffRing(seedHexes, t.q, t.r, mapRing);
      const baseNatural = 4 + mapRing * 6;
      const curMax = (t.curseMaxHp as number | null) ?? curseHpFor(mapRing, mood);
      const curHp = (t.curseHp as number | null) ?? curMax;
      const inCalm = effRing < mapRing;
      const wasCalmed = curMax < baseNatural;
      if (!inCalm && !wasCalmed) continue;
      const targetMax = curseHpFor(effRing, mood);
      if (targetMax === curMax) continue;
      let nextHp = curHp;
      if (targetMax < curMax) nextHp = Math.min(curHp, targetMax);
      else nextHp = Math.min(targetMax, curHp + (targetMax - curMax));
      await db.update(schema.territoryTiles)
        .set({ curseHp: nextHp, curseMaxHp: targetMax })
        .where(eq(schema.territoryTiles.id, t.id));
    }
  },

  /** A column battle LOST (the Columns, 2026-10-17): the
      column stands undefeated — and if it had come for a HELD
      seed, the hold BREAKS: the bastion falls, and by the
      failed-seed law the seed becomes a cursed bastion with
      the column as its guard. */
  async failIncursion(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const columnId = Math.floor(Number((args as any)?.columnId ?? 0));
    if (!columnId) badRequest("Which column was faced?");
    const col = sqlite.prepare("SELECT * FROM incursion_columns WHERE id = ? AND owner_key = ?").get(columnId, ownerKey) as any;
    if (!col) badRequest("No such column walks your land.");
    if (col.state !== "arrived") badRequest("That column has not landed — there is no battle to lose yet.");
    let broken = false;
    if (col.target_tile_id != null) {
      const seed = sqlite.prepare("SELECT * FROM star_seeds WHERE owner_key = ? AND tile_id = ? AND state = 'held'").get(ownerKey, col.target_tile_id) as any;
      if (seed) {
        if (seed.bastion_building_id) {
          await db.delete(schema.territoryBuildings).where(eq(schema.territoryBuildings.id, seed.bastion_building_id));
        }
        corruptSeed(ownerKey, seed);
        sqlite.prepare("UPDATE incursion_columns SET kind = 'siege' WHERE id = ?").run(columnId);
        broken = true;
      }
    }
    return { ok: true, broken };
  },

  /** Fetch parties settle (the seed missions, 2026-10-17):
      the outward leg lands (settleMarches puts the walkers on
      the seed's hex), the gather is reckoned, and the party
      rides the same road home. If the seed was taken first,
      the party rides home empty — its fate was never theirs
      to fail; the corruption law speaks for the seed itself. */
  async settleSeedMissions(ownerKey: string) {
    const now = Date.now();
    const rows = sqlite.prepare("SELECT * FROM seed_missions WHERE owner_key = ? AND phase IN ('out','back')").all(ownerKey) as any[];
    if (!rows.length) return;
    const tilesAll = await db.select().from(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
    const home = tilesAll.find(t => t.q === 0 && t.r === 0) ?? tilesAll[0];
    for (const m of rows) {
      let party: number[] = [];
      try { party = JSON.parse(m.party); } catch { party = []; }
      if (m.phase === "out" && now >= Number(m.arrive_at)) {
        const seed = sqlite.prepare("SELECT * FROM star_seeds WHERE id = ? AND owner_key = ?").get(m.seed_id, ownerKey) as any;
        let failed = 0;
        if (seed && seed.state === "fallen") {
          sqlite.prepare("UPDATE star_seeds SET state = 'fetched' WHERE id = ?").run(seed.id);
          const grant = 15 * Number(seed.level || 1);
          const cur = await getEnergyFor(ownerKey);
          let max = cur + grant;
          try { max = await calculateMaxEnergy(ownerKey); } catch { /* keep the generous bound */ }
          await db.update(schema.tenderResources)
            .set({ energy: Math.min(max, cur + grant), updatedAt: new Date() })
            .where(eq(schema.tenderResources.ownerKey, ownerKey));
        } else {
          failed = 1;
        }
        const travelBack = Math.max(1000, Number(m.arrive_at) - Number(m.depart_at));
        const returnAt = now + travelBack;
        if (seed && home) {
          const roadHome = findAnyRoad(tilesAll as any, seed.tile_id, home.id);
          if (roadHome && roadHome.length > 1) {
            for (const awId of party) {
              sqlite.prepare("UPDATE field_placements SET march_path = ?, march_since = ?, march_ends = ?, march_goal = NULL, march_pos_q = NULL, march_pos_r = NULL WHERE owner_key = ? AND awakened_id = ?")
                .run(JSON.stringify(roadHome), now, returnAt, ownerKey, awId);
            }
          }
        }
        sqlite.prepare("UPDATE seed_missions SET phase = 'back', return_at = ?, failed = ? WHERE id = ?").run(returnAt, failed, m.id);
        m.phase = "back"; m.return_at = returnAt; m.failed = failed;
      }
      if (m.phase === "back" && now >= Number(m.return_at)) {
        sqlite.prepare("UPDATE seed_missions SET phase = ? WHERE id = ?").run(m.failed ? "failed" : "done", m.id);
      }
    }
  },

  /** The fallen seeds and their fates, for the map's face. */
  async getSeeds(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    await this.settleIncursions(ownerKey);
    const seeds = sqlite.prepare("SELECT * FROM star_seeds WHERE owner_key = ? AND state IN ('fallen','held','corrupted','first') ORDER BY created_at ASC").all(ownerKey) as any[];
    const tiles = await db.select().from(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
    const tileById = new Map(tiles.map(t => [t.id, t]));
    const missions = sqlite.prepare("SELECT * FROM seed_missions WHERE owner_key = ? AND phase IN ('out','back')").all(ownerKey) as any[];
    return {
      seeds: seeds.map(sd => {
        const t = tileById.get(sd.tile_id);
        const level = Number(sd.level ?? 1);
        return {
          id: sd.id, tileId: sd.tile_id, q: t ? t.q : null, r: t ? t.r : null,
          level, state: sd.state, defenses: sd.defenses ?? 0,
          // THE GROWTH CYCLE (2026-10-25): the seed's stage
          // and its fed ledger ride the face — the map draws
          // the stage's own artwork, and a Tender can see
          // how much feeding the next stage stands at.
          stage: seedStageForLevel(level),
          fedEnergy: Number(sd.fed_energy ?? 0),
          nextStageAt: level === 1 ? SEED_FED_FOR_LEVEL_2 : level === 2 ? SEED_FED_FOR_LEVEL_3 : null,
          tileCursed: t ? !!t.cursed : false,
        };
      }),
      missions: missions.map(m => ({ id: m.id, seedId: m.seed_id, phase: m.phase, arriveAt: m.arrive_at, returnAt: m.return_at })),
    };
  },

  /** SOW THE FIRST SEED (Nigel via Wake, 2026-10-17; built
      2026-10-18): the Starfall Bastion's world-making. Idempotent:
      a Tender who holds any ground — or whose seed is already
      sown — is simply told so. Otherwise the whole world is
      generated (cursed rings + frontier) and a star seed is
      planted at the cursed center, state 'first', with its hold
      ledger opened — and ONE SAFE SQUARE, ALWAYS (Nigel,
      2026-10-23 22:40) is purified at the sowing, on the
      nearest ground beside the seed's hex, so the fresh map
      starts with a square to rebuild from while the centre
      stays the hold's to win. Territory calls this on mount
      when no tiles are held; getTerritory itself stays a read. */
  async ensureFirstSeed(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const existingTiles = await db.select({ id: schema.territoryTiles.id }).from(schema.territoryTiles)
      .where(eq(schema.territoryTiles.ownerKey, ownerKey)).limit(1);
    if (existingTiles.length) return { ok: true, created: false };
    const existing = firstSeedEventRow(ownerKey);
    if (existing) return { ok: true, created: false, seedId: existing.seed_id };
    const centerId = await generateFirstWorld(ownerKey);
    const now = Date.now();
    const ins = sqlite.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at) VALUES (?, ?, 1, 'first', ?)")
      .run(ownerKey, centerId, now) as any;
    const seedId = Number(ins.lastInsertRowid);
    sqlite.prepare(`INSERT INTO first_seed_events (owner_key, seed_id, state, banked, waves_cleared, next_wave_at, newborn_claimed_at, created_at, updated_at)
      VALUES (?, ?, 'waiting', 0, 0, 0, NULL, ?, ?)`)
      .run(ownerKey, seedId, now, now);
    // ONE SAFE SQUARE, ALWAYS (Nigel, 2026-10-23 22:40): a
    // fresh map starts WITH its safe square standing — the
    // guarantee fires at the sowing itself, not on some
    // later event. The seed's hex stays cursed for its hold
    // (the guarantee steps beside it, to the nearest other
    // ground — see ensureOneSafeSquare), so the hold's ruled
    // state is exactly as it was sown.
    await ensureOneSafeSquare(ownerKey);
    return { ok: true, created: true, seedId, tileId: centerId };
  },

  /** The first seed's face: its hold ledger, its level, and the
      company standing on its hex. Settles any arrived wave first,
      like every honest read in this house. */
  async getFirstSeedEvent(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    await settleFirstSeedEvent(ownerKey);
    const ev = firstSeedEventRow(ownerKey);
    if (!ev) return { event: null };
    const seed = sqlite.prepare("SELECT * FROM star_seeds WHERE id = ? AND owner_key = ?").get(ev.seed_id, ownerKey) as any;
    if (!seed) return { event: null };
    const tile = await db.select().from(schema.territoryTiles)
      .where(eq(schema.territoryTiles.id, seed.tile_id)).limit(1);
    const placements = await db.select().from(schema.fieldPlacements)
      .where(and(eq(schema.fieldPlacements.ownerKey, ownerKey), eq(schema.fieldPlacements.tileId, seed.tile_id)));
    const defenders = [];
    for (const p of placements) {
      defenders.push({ awakenedId: p.awakenedId, hp: p.hp ?? (await placementMaxHp(p.awakenedId)), maxHp: await placementMaxHp(p.awakenedId) });
    }
    return {
      event: {
        seedId: seed.id,
        seedLevel: Number(seed.level ?? 1),
        // THE GROWTH CYCLE (2026-10-25): the stage's name
        // and the fed ledger — the panel speaks of stages
        // and feeding now, never of a waves ladder.
        seedStage: seedStageForLevel(Number(seed.level ?? 1)),
        fedEnergy: Number(seed.fed_energy ?? 0),
        nextStageAt: Number(seed.level ?? 1) === 1 ? SEED_FED_FOR_LEVEL_2 : Number(seed.level ?? 1) === 2 ? SEED_FED_FOR_LEVEL_3 : null,
        tileId: seed.tile_id,
        tileCursed: tile.length ? !!tile[0].cursed : true,
        state: ev.state,
        banked: !!ev.banked,
        wavesCleared: ev.waves_cleared,
        nextWave: ev.waves_cleared + 1,
        nextWaveAt: ev.next_wave_at,
        reward: ev.reward_element && !ev.reward_claimed_at ? { element: ev.reward_element } : null,
        defenders,
      },
    };
  },

  /** Gather the third rising's reward (Nigel, 2026-10-19): the
      shining point the event laid up when the seed first reached
      level 3. One tap gathers it into its element's attunement
      pool through the grants' own arithmetic — should the pool
      stand at ten with this point, the aspect-birth inside that
      arithmetic may answer, and says so. The grant lands BEFORE
      the claim is marked: a crash between them is the only
      double-pay window, the same one the house's other grants
      live with; a marked claim can never pay twice. An unclaimed
      reward simply waits — no expiry, no nagging. */
  async claimFirstSeedReward(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    await settleFirstSeedEvent(ownerKey);
    const ev = firstSeedEventRow(ownerKey);
    if (!ev || !ev.reward_element || ev.reward_claimed_at) badRequest("No reward waits to be gathered.");
    const element = ev!.reward_element as AttunementElement;
    const aspectSpawned = await addAspectPoints(ownerKey, element, 1);
    ev!.reward_claimed_at = Date.now();
    saveFirstSeedEvent(ev!);
    return { ok: true, element, aspectSpawned };
  },

  /** Send Awoken onto the seed's hex. The field's own deploy
      guards and price stand here — but no assault: the seed
      anchors this hex's curse, and standing power alone never
      breaks it. Only the hold purifies here. Casting never
      closes: this answers in 'waiting' and 'holding' alike. */
  async deployFirstSeed(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      awakenedIds: z.array(z.number().int().positive()).min(1).max(4),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid deployment.");
    if (new Set(parsed.data.awakenedIds).size !== parsed.data.awakenedIds.length) {
      badRequest("Each Awokin fights once.");
    }
    const ev = firstSeedEventRow(ownerKey);
    if (!ev) badRequest("No starseed waits on your land.");
    if (ev!.state === "done") badRequest("The hold is complete — this ground is yours, and the field's ordinary law deploys here now.");
    const seed = sqlite.prepare("SELECT * FROM star_seeds WHERE id = ? AND owner_key = ?").get(ev!.seed_id, ownerKey) as any;
    if (!seed) badRequest("No starseed waits on your land.");
    const tile = await db.select().from(schema.territoryTiles)
      .where(and(eq(schema.territoryTiles.id, seed.tile_id), eq(schema.territoryTiles.ownerKey, ownerKey))).limit(1);
    if (!tile.length) badRequest("The seed's hex is not yours.");
    const owned = await db.select().from(schema.awakened)
      .where(
        and(
          eq(schema.awakened.collection, "tender"),
          or(eq(schema.awakened.ownerKey, ownerKey), isNull(schema.awakened.ownerKey))
        )
      );
    const fighters = owned.filter(a => parsed.data.awakenedIds.includes(a.id));
    if (fighters.length !== parsed.data.awakenedIds.length) badRequest("Those Awokin are not all yours.");
    const placedIds = new Set((await db.select({ awakenedId: schema.fieldPlacements.awakenedId })
      .from(schema.fieldPlacements)
      .where(eq(schema.fieldPlacements.ownerKey, ownerKey))).map(p => p.awakenedId));
    const courtHoused = await db.select({ awakenedId: schema.hallResidents.awakenedId }).from(schema.hallResidents)
      .where(eq(schema.hallResidents.ownerKey, ownerKey));
    const courtChamp = await db.select({ awakenedId: schema.tenderChampions.awakenedId }).from(schema.tenderChampions)
      .where(eq(schema.tenderChampions.ownerKey, ownerKey)).limit(1);
    const courtIds = new Set<number>([...courtHoused.map(r => r.awakenedId), ...(courtChamp.length ? [courtChamp[0].awakenedId] : [])]);
    for (const f of fighters) {
      if (!canTouchAwoken(f, ownerKey)) badRequest("That Awokin is not yours to send.");
      if (placedIds.has(f.id)) badRequest("Already on the field.");
      if (courtIds.has(f.id)) badRequest(`${f.name} is of the court — housed Awokin and the champion stay in hand.`);
    }
    // No count refuses the seed's guard either (THE
    // CROWDING GATE, Nigel 2026-10-18): the hex holds who
    // is sent; the crowd costs speed, never the spot.
    let totalCost = 0;
    for (const f of fighters) {
      const payload = await awakenedPayloadById(f.id);
      totalCost += deployCostForPower(payload?.power ?? 0);
    }
    if (!(await spendEnergy(ownerKey, totalCost))) badRequest("Not enough energy.");
    const seedTile = sqlite.prepare("SELECT q, r FROM territory_tiles WHERE id = ?").get(seed.tile_id) as { q: number; r: number } | undefined;
    for (const f of fighters) {
      await db.insert(schema.fieldPlacements).values({
        ownerKey, awakenedId: f.id, tileId: seed.tile_id,
        posQ: seedTile?.q ?? 0, posR: seedTile?.r ?? 0,
        hp: await placementMaxHp(f.id),
      });
    }
    return { ok: true, cost: totalCost };
  },

  /** Begin (or resume) the hold: the waves start coming. The
      ladder is the event's own — a resumed run climbs from the
      banked rung, never from nothing. */
  async startFirstSeedHold(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    await settleFirstSeedEvent(ownerKey);
    const ev = firstSeedEventRow(ownerKey);
    if (!ev) badRequest("No starseed waits on your land.");
    if (ev!.state === "done") badRequest("The seed's rising is complete.");
    if (ev!.state === "holding") badRequest("The hold is already underway.");
    const seed = sqlite.prepare("SELECT * FROM star_seeds WHERE id = ? AND owner_key = ?").get(ev!.seed_id, ownerKey) as any;
    if (!seed) badRequest("No starseed waits on your land.");
    const standing = await db.select({ id: schema.fieldPlacements.id }).from(schema.fieldPlacements)
      .where(and(eq(schema.fieldPlacements.ownerKey, ownerKey), eq(schema.fieldPlacements.tileId, seed.tile_id)));
    if (!standing.length) badRequest("No defender stands on the seed's hex — send Awokin to the seed before the hold begins.");
    ev!.state = "holding";
    ev!.next_wave_at = Date.now() + firstSeedWaveGapMs(ev!.waves_cleared);
    saveFirstSeedEvent(ev!);
    return { ok: true, nextWaveAt: ev!.next_wave_at, nextWave: ev!.waves_cleared + 1 };
  },

  /** End a run standing (after the bank) — or stand down before
      it. The bank and the seed's fed growth are kept either
      way; only the run's rising count resets, as at a fall. */
  async endFirstSeedRun(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const ev = firstSeedEventRow(ownerKey);
    if (!ev) badRequest("No starseed waits on your land.");
    if (ev!.state !== "holding") badRequest("No hold is underway.");
    // A rising standing on the land withdraws with the
    // run (the risings ride the engine, 2026-10-24): its
    // Fray are the event's own, and they do not outstay
    // the hold that called them.
    if (ev!.rising_live) {
      sqlite.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ? AND seed_rising = ?").run(ownerKey, ev!.waves_cleared + 1);
      ev!.rising_live = 0;
      ev!.rising_stood = null;
    }
    ev!.state = "waiting";
    ev!.next_wave_at = 0;
    // The growth cycle (2026-10-25): an ended run resets
    // only the run's rising count — the banked ground and
    // the seed's fed growth stand, as they stand at a fall.
    ev!.waves_cleared = 0;
    saveFirstSeedEvent(ev!);
    return { ok: true };
  },

  /** THE FETCH (Nigel, 2026-10-17): a party rides out from the
      home bastion to a far seed — through cursed land, which
      patrols may dare — gathers its energy, and rides back.
      No reinforcements follow through the curse: the party
      that goes is the party that must survive there and back. */
  async fetchSeed(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const seedId = Math.floor(Number((args as any)?.seedId ?? 0));
    const awakenedIds = (Array.isArray((args as any)?.awakenedIds) ? (args as any).awakenedIds : []).map((n: any) => Math.floor(Number(n))).filter((n: number) => n > 0).slice(0, 4);
    if (!seedId) badRequest("Which seed?");
    if (!awakenedIds.length) badRequest("A fetch party needs at least one Awokin.");
    const seed = sqlite.prepare("SELECT * FROM star_seeds WHERE id = ? AND owner_key = ?").get(seedId, ownerKey) as any;
    if (!seed) badRequest("No such seed lies on your land.");
    if (seed.state !== "fallen") badRequest("That seed can no longer be fetched.");
    const busy = sqlite.prepare("SELECT COUNT(*) AS n FROM seed_missions WHERE owner_key = ? AND seed_id = ? AND phase IN ('out','back')").get(ownerKey, seedId) as any;
    if (Number(busy?.n ?? 0) > 0) badRequest("A party already rides for that seed.");
    const tiles = await db.select().from(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
    const home = tiles.find(t => t.q === 0 && t.r === 0);
    if (!home) badRequest("No home bastion stands to ride from.");
    const road = findAnyRoad(tiles as any, home.id, seed.tile_id);
    if (!road) badRequest("No road runs to that seed, even through the curse.");
    // The party: my field Awoken, not already marching.
    const partyRows: any[] = [];
    for (const awId of awakenedIds) {
      const p = sqlite.prepare("SELECT * FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(ownerKey, awId) as any;
      if (!p) badRequest("One of the party is not standing in your field.");
      if (p.march_path) badRequest("One of the party is already on the march.");
      partyRows.push(p);
    }
    // The company rides at its slowest walker's pace (march law).
    let slowest = 0;
    for (const p of partyRows) {
      const aw = sqlite.prepare("SELECT composition_json, experience FROM awakened WHERE id = ? AND owner_key = ?").get(p.awakened_id, ownerKey) as any;
      let layers: any[] = [];
      try { layers = JSON.parse(aw?.composition_json || "[]"); } catch { layers = []; }
      const pace = marchSecondsPerHexFor(layers, Number(aw?.experience ?? 0));
      if (pace > slowest) slowest = pace;
    }
    const now = Date.now();
    const fetchCursed = new Map((tiles as any[]).map((t: any) => [t.id, !!t.cursed]));
    const fetchPlacements = sqlite.prepare("SELECT awakened_id AS awakenedId, tile_id AS tileId, march_path AS marchPath FROM field_placements WHERE owner_key = ?").all(ownerKey) as any[];
    const travelMs = Math.max(5000, Math.round(marchWeightedSeconds(road, slowest, (id) => !!fetchCursed.get(id), marchCrowdOf(fetchPlacements, new Set(awakenedIds))) * 1000));
    const arriveAt = now + travelMs;
    const ins = sqlite.prepare(`INSERT INTO seed_missions (owner_key, seed_id, kind, party, phase, depart_at, arrive_at)
      VALUES (?, ?, 'fetch', ?, 'out', ?, ?)`).run(ownerKey, seedId, JSON.stringify(awakenedIds), now, arriveAt) as any;
    for (const p of partyRows) {
      sqlite.prepare("UPDATE field_placements SET march_path = ?, march_since = ?, march_ends = ?, march_goal = NULL, march_pos_q = NULL, march_pos_r = NULL WHERE id = ?")
        .run(JSON.stringify(road), now, arriveAt, p.id);
    }
    return { ok: true, missionId: Number(ins.lastInsertRowid), arriveAt, travelMs };
  },

  /** THE HOLD (Nigel, 2026-10-17): raise a bastion upon the
      seed's purified hex and the seed is held — the heart of
      a place that may one day be a city. The seed's own energy
      is spent into the ground it will grow from. */
  async holdSeed(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const seedId = Math.floor(Number((args as any)?.seedId ?? 0));
    if (!seedId) badRequest("Which seed?");
    const seed = sqlite.prepare("SELECT * FROM star_seeds WHERE id = ? AND owner_key = ?").get(seedId, ownerKey) as any;
    if (!seed) badRequest("No such seed lies on your land.");
    if (seed.state !== "fallen") badRequest("That seed's fate is already chosen.");
    const tile = sqlite.prepare("SELECT cursed FROM territory_tiles WHERE id = ? AND owner_key = ?").get(seed.tile_id, ownerKey) as any;
    if (!tile) badRequest("The seed's hex is not yours to build on.");
    if (tile.cursed) badRequest("The seed lies in cursed ground — a patrol must purify its hex before a bastion can rise.");
    const res = await this.placeBuilding({ tileId: seed.tile_id, buildingType: "bastion" }, ctx);
    sqlite.prepare("UPDATE star_seeds SET state = 'held', bastion_building_id = ? WHERE id = ?").run((res as any).building.id, seedId);
    return { ok: true, building: (res as any).building };
  },

  /** THE CALL TO ARMS (Nigel, 2026-10-17): the warning is a
      standing invitation inside Discord, with the timer on it,
      naming the event — a BASTION (defend yours, arrived), an
      AMBUSH (warned ahead, while it still marches — your
      Awoken strike first and harder), or a SIEGE (a cursed
      bastion of theirs, to be taken back). The game sends no
      notification: the host carries this call to their friends
      themselves, and the Table room answers it. */
  async callToArms(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const columnId = Math.floor(Number((args as any)?.columnId ?? 0)) || null;
    const seedId = Math.floor(Number((args as any)?.seedId ?? 0)) || null;
    if (!columnId && !seedId) badRequest("Call against what — a column, or a cursed bastion?");
    if (columnId && seedId) badRequest("One call names one event.");
    let kind = "bastion";
    if (seedId) {
      const seed = sqlite.prepare("SELECT * FROM star_seeds WHERE id = ? AND owner_key = ?").get(seedId, ownerKey) as any;
      if (!seed) badRequest("No such seed lies on your land.");
      if (seed.state !== "corrupted") badRequest("Only a corrupted seed — a cursed bastion — is besieged. That one is not theirs.");
      kind = "siege";
    } else {
      const col = sqlite.prepare("SELECT * FROM incursion_columns WHERE id = ? AND owner_key = ?").get(columnId, ownerKey) as any;
      if (!col) badRequest("No such column walks your land.");
      if (col.state === "defeated") badRequest("That column is already broken.");
      // THE TOKEN STRIP (2026-10-23): a landed column is no
      // longer a column — its force stands on the land as
      // wanderers, fought there. There is nothing to call
      // against at the Table.
      if (col.state === "landed") badRequest("That column has landed — its force stands on your land now, as the wandering dark. Fight it where it stands.");
      kind = col.state === "marching" ? "ambush" : "bastion";
    }
    // THE KEY (Nigel, 2026-10-17): every call carries a short
    // join key, named by its kind in the telling — a BASTION
    // key, an AMBUSH key, a SIEGE key. The host carries it
    // into Discord; a friend opens the Table anywhere, enters
    // the key, and is seated in the call's own room with their
    // Awoken in hand, to help in the defence.
    const mintKey = mintCallKey;
    const existing = sqlite.prepare("SELECT * FROM bastion_calls WHERE owner_key = ? AND state = 'open' AND IFNULL(column_id, 0) = IFNULL(?, 0) AND IFNULL(seed_id, 0) = IFNULL(?, 0)")
      .get(ownerKey, columnId, seedId) as any;
    if (existing) {
      if (!existing.join_key) {
        existing.join_key = mintKey();
        sqlite.prepare("UPDATE bastion_calls SET join_key = ? WHERE id = ?").run(existing.join_key, existing.id);
      }
      return { ok: true, call: existing, already: true };
    }
    const tenderId = Number(ownerKey.replace("tender:", "")) || 0;
    const ins = sqlite.prepare("INSERT INTO bastion_calls (owner_key, host_tender_id, column_id, seed_id, kind, state, created_at, join_key) VALUES (?, ?, ?, ?, ?, 'open', ?, ?)")
      .run(ownerKey, tenderId, columnId, seedId, kind, Date.now(), mintKey()) as any;
    const call = sqlite.prepare("SELECT * FROM bastion_calls WHERE id = ?").get(Number(ins.lastInsertRowid)) as any;
    return { ok: true, call };
  },

  /** My standing calls, for the map's face and the Table. */
  async getCalls(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const calls = sqlite.prepare("SELECT * FROM bastion_calls WHERE owner_key = ? AND state = 'open' ORDER BY created_at ASC").all(ownerKey) as any[];
    return { calls };
  },

  /** THE BASTION'S FACE (Station 4, Nigel 2026-10-20): the
      staging hall's one read — the bastion itself, the company
      staged there as reinforcements, the hand of twenty and
      the reserve it overflows into, and the field company that
      may be sent home to it. Settles the marches first, like
      every honest read in this house, so an arrived sender
      already stands in the staged ranks. */
  async getBastion(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    await this.settleMarches(ownerKey);
    const tiles = await db.select().from(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
    const tileById = new Map((tiles as any[]).map(t => [t.id, t]));
    const bastion = bastionRowFor(ownerKey);
    const bastionTile = bastion ? tileById.get(bastion.tileId) : null;
    const face = async (awakenedId: number) => {
      const p = await awakenedPayloadById(awakenedId).catch(() => null);
      if (!p) return { awakenedId, name: "An Awokin", power: 0, toughness: 0, element: null as string | null, level: null as number | null };
      const layers = (p.layers ?? []) as { element?: string | null; power?: number | null }[];
      const weights = new Map<string, number>();
      for (const l of layers) if (l.element) weights.set(l.element, (weights.get(l.element) ?? 0) + (l.power ?? 0));
      const element = [...weights.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return { awakenedId, name: p.name, power: p.power, toughness: p.toughness, element, level: p.level ?? null };
    };
    const stagedRows = sqlite.prepare("SELECT awakened_id, via, staged_at FROM bastion_staged WHERE owner_key = ? ORDER BY staged_at ASC").all(ownerKey) as any[];
    const staged = [];
    for (const r of stagedRows) staged.push({ ...(await face(Number(r.awakened_id))), via: r.via, stagedAt: Number(r.staged_at) });
    const handIds = handIdsFor(ownerKey);
    const stagedSet = new Set(stagedRows.map(r => Number(r.awakened_id)));
    const handSet = new Set(handIds);
    const reserveIds = rosterIdsFor(ownerKey).filter(id => !handSet.has(id) && !stagedSet.has(id));
    const placements = await db.select().from(schema.fieldPlacements).where(eq(schema.fieldPlacements.ownerKey, ownerKey));
    const field = [];
    for (const p of placements as any[]) {
      field.push({ ...(await face(p.awakenedId)), tileId: p.tileId, follow: p.follow === 1, marching: !!p.marchPath, marchGoal: p.marchGoal ?? null });
    }
    const call = sqlite.prepare("SELECT id, join_key, created_at FROM bastion_calls WHERE owner_key = ? AND state = 'open' AND kind = 'instance' ORDER BY created_at ASC LIMIT 1").get(ownerKey) as any;
    return {
      bastion: bastion ? { seedId: bastion.seedId, tileId: bastion.tileId, level: bastion.level, q: bastionTile ? bastionTile.q : null, r: bastionTile ? bastionTile.r : null } : null,
      staged,
      hand: { cap: HAND_CAP, ids: handIds },
      reserveIds,
      field,
      instanceCall: call ? { id: Number(call.id), joinKey: call.join_key ?? null, createdAt: Number(call.created_at) } : null,
    };
  },

  /** STAGE AN AWOKIN (Station 4): from the hand, into the
      bastion's waiting ranks. A staged Awokin leaves the hand's
      play — it is not fielded, not dealt — it WAITS at the
      bastion as a reinforcement. */
  async stageAwokin(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const awakenedId = Math.floor(Number((args as any)?.awakenedId ?? 0));
    if (!awakenedId) badRequest("Which Awokin stages at the bastion?");
    const mine = sqlite.prepare("SELECT id FROM awakened WHERE id = ? AND owner_key = ?").get(awakenedId, ownerKey) as any;
    if (!mine) badRequest("That Awokin is not yours.");
    if (!bastionRowFor(ownerKey)) badRequest("No bastion stands — hold a seed and raise its bastion first, and the staging hall opens.");
    const placed = sqlite.prepare("SELECT id FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(ownerKey, awakenedId) as any;
    if (placed) badRequest("That Awokin stands on the field — send it to the bastion, and it will stage on arrival.");
    const already = sqlite.prepare("SELECT awakened_id FROM bastion_staged WHERE owner_key = ? AND awakened_id = ?").get(ownerKey, awakenedId) as any;
    if (already) badRequest("That Awokin already waits at the bastion.");
    if (!handIdsFor(ownerKey).includes(awakenedId)) badRequest("Only the hand stages — that Awokin waits in your reserve. Bring it into your hand of twenty first.");
    sqlite.prepare("INSERT INTO bastion_staged (owner_key, awakened_id, staged_at, via) VALUES (?, ?, ?, 'hand')").run(ownerKey, awakenedId, Date.now());
    return { ok: true };
  },

  /** UNSTAGE (Station 4): a waiting reinforcement steps back
      into the hand's play — or, with toField, MUSTERS onto the
      bastion's own hex under the field's standing law (room
      for four, the bastion's ground is purified by its hold). */
  async unstageAwokin(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const awakenedId = Math.floor(Number((args as any)?.awakenedId ?? 0));
    const toField = (args as any)?.toField === true;
    if (!awakenedId) badRequest("Which Awokin leaves the bastion's ranks?");
    const row = sqlite.prepare("SELECT awakened_id FROM bastion_staged WHERE owner_key = ? AND awakened_id = ?").get(ownerKey, awakenedId) as any;
    if (!row) badRequest("That Awokin does not wait at the bastion.");
    if (toField) {
      const bastion = bastionRowFor(ownerKey);
      if (!bastion) badRequest("No bastion stands to muster from.");
      const placed = sqlite.prepare("SELECT id FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(ownerKey, awakenedId) as any;
      if (placed) badRequest("That Awokin already stands on the field.");
      // No count refuses the muster home either (THE
      // CROWDING GATE, Nigel 2026-10-18): the bastion's
      // hex holds who returns; the crowd costs speed.
      sqlite.prepare("DELETE FROM bastion_staged WHERE owner_key = ? AND awakened_id = ?").run(ownerKey, awakenedId);
      const bastionTile = sqlite.prepare("SELECT q, r FROM territory_tiles WHERE id = ?").get(bastion.tileId) as { q: number; r: number } | undefined;
      await db.insert(schema.fieldPlacements).values({ ownerKey, awakenedId, tileId: bastion.tileId, posQ: bastionTile?.q ?? 0, posR: bastionTile?.r ?? 0, hp: await placementMaxHp(awakenedId) });
      return { ok: true, mustered: true };
    }
    sqlite.prepare("DELETE FROM bastion_staged WHERE owner_key = ? AND awakened_id = ?").run(ownerKey, awakenedId);
    return { ok: true };
  },

  /** SEND TO THE BASTION (Station 4): a field Awokin is ordered
      home to the staging hall. The two roads are the land's own:
      a FOLLOWER rides in the Tender's company — the clean road,
      home ground only; one NOT following walks alone, by any
      road that runs — through the curse if the curse is what's
      there — at a slower pace, and the curse's standing law
      answers it where it stands until it lands, as it answers
      every marcher. On arrival it does not take a hex: it joins
      the staged reinforcements (the settle in settleMarches
      keeps that promise). No energy is charged — coming home
      is a standing order, not a maneuver, as the muster and
      the fetch have always held. */
  async sendToBastion(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    await this.settleMarches(ownerKey);
    const awakenedId = Math.floor(Number((args as any)?.awakenedId ?? 0));
    if (!awakenedId) badRequest("Which Awokin is sent to the bastion?");
    const bastion = bastionRowFor(ownerKey);
    if (!bastion) badRequest("No bastion stands — hold a seed and raise its bastion first.");
    const placement = sqlite.prepare("SELECT * FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(ownerKey, awakenedId) as any;
    if (!placement) badRequest("That Awokin does not stand on the field.");
    if (placement.march_path) badRequest("That Awokin is already on the march — recall it, or let it arrive, before sending it home.");
    const tiles = await db.select().from(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
    if (placement.tile_id === bastion.tileId) {
      // Already home: it simply steps into the ranks.
      sqlite.prepare("DELETE FROM field_placements WHERE id = ?").run(placement.id);
      sqlite.prepare("INSERT OR IGNORE INTO bastion_staged (owner_key, awakened_id, staged_at, via) VALUES (?, ?, ?, 'field')").run(ownerKey, awakenedId, Date.now());
      return { ok: true, arrived: true };
    }
    const following = placement.follow === 1;
    const road = following
      ? findRoad(tiles as any, placement.tile_id, bastion.tileId)
      : findAnyRoad(tiles as any, placement.tile_id, bastion.tileId);
    if (!road || road.length < 2) {
      badRequest(following
        ? "No road of home ground runs to the bastion — your follower cannot reach it in your company until clean ground joins them."
        : "No road runs to the bastion, even through the curse.");
    }
    const aw = sqlite.prepare("SELECT composition_json, experience FROM awakened WHERE id = ? AND owner_key = ?").get(awakenedId, ownerKey) as any;
    let layers: any[] = [];
    try { layers = JSON.parse(aw?.composition_json || "[]"); } catch { layers = []; }
    const pace = marchSecondsPerHexFor(layers, Number(aw?.experience ?? 0));
    // The lone road is the slow road (the spec's own words):
    // half again the company's pace.
    const bastionCursed = new Map((tiles as any[]).map((t: any) => [t.id, !!t.cursed]));
    const bastionPlacements = sqlite.prepare("SELECT awakened_id AS awakenedId, tile_id AS tileId, march_path AS marchPath FROM field_placements WHERE owner_key = ?").all(ownerKey) as any[];
    const seconds = marchWeightedSeconds(road!, pace, (id) => !!bastionCursed.get(id), marchCrowdOf(bastionPlacements, new Set([awakenedId]))) * (following ? 1 : 1.5);
    const now = Date.now();
    sqlite.prepare("UPDATE field_placements SET march_path = ?, march_since = ?, march_ends = ?, march_goal = 'bastion', patrol_path = NULL, patrol_since = NULL, patrol_pos_q = NULL, patrol_pos_r = NULL, march_pos_q = NULL, march_pos_r = NULL WHERE id = ?")
      .run(JSON.stringify(road), now, now + Math.round(seconds * 1000), placement.id);
    return { ok: true, road: road!.length - 1, arrivesAt: now + Math.round(seconds * 1000), following };
  },

  /** THE HAND'S CHOOSING (Station 4): bring an Awokin into the
      play hand of twenty, or let one back to the reserve. A
      free act, always — the deck hosts them all either way,
      and no Awokin is ever stranded by the choosing: reserve
      is a waiting room, not a exile. The first choosing writes
      the default hand down, then applies itself. */
  async setHandMember(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const awakenedId = Math.floor(Number((args as any)?.awakenedId ?? 0));
    const inHand = (args as any)?.inHand === true;
    if (!awakenedId) badRequest("Which Awokin changes hands?");
    const mine = sqlite.prepare("SELECT id FROM awakened WHERE id = ? AND owner_key = ?").get(awakenedId, ownerKey) as any;
    if (!mine) badRequest("That Awokin is not yours.");
    const rows = sqlite.prepare("SELECT awakened_id FROM tender_hand WHERE owner_key = ?").all(ownerKey) as any[];
    if (!rows.length) {
      // Materialize the default hand so the choosing is exact.
      for (const id of handIdsFor(ownerKey)) {
        sqlite.prepare("INSERT OR IGNORE INTO tender_hand (owner_key, awakened_id) VALUES (?, ?)").run(ownerKey, id);
      }
    }
    const present = sqlite.prepare("SELECT awakened_id FROM tender_hand WHERE owner_key = ? AND awakened_id = ?").get(ownerKey, awakenedId) as any;
    if (inHand) {
      if (present) return { ok: true, already: true };
      const count = sqlite.prepare("SELECT COUNT(*) AS n FROM tender_hand WHERE owner_key = ?").get(ownerKey) as any;
      if (Number(count?.n ?? 0) >= HAND_CAP) badRequest("Your hand stands full — twenty is the law of the hand. Let one back to the reserve before another rises.");
      sqlite.prepare("INSERT INTO tender_hand (owner_key, awakened_id) VALUES (?, ?)").run(ownerKey, awakenedId);
    } else {
      sqlite.prepare("DELETE FROM tender_hand WHERE owner_key = ? AND awakened_id = ?").run(ownerKey, awakenedId);
    }
    return { ok: true, hand: handIdsFor(ownerKey) };
  },

  /** CREATE AN INSTANCE (Station 4): the bastion as departure
      hall — an open call of its own kind, keyed like every
      call, whose room seats the host with the STAGED company
      in hand (the Table's claim keeps that promise). Whatever
      is staged is the company that travels; if nothing is
      staged, there is no company to carry, and no instance. */
  async createBastionInstance(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const bastion = bastionRowFor(ownerKey);
    if (!bastion) badRequest("No bastion stands — hold a seed and raise its bastion first, and the hall opens.");
    if (!stagedIdsFor(ownerKey).length) badRequest("No company is staged at the bastion — stage your Awokin first, and the instance has someone to carry.");
    const existing = sqlite.prepare("SELECT * FROM bastion_calls WHERE owner_key = ? AND state = 'open' AND kind = 'instance'").get(ownerKey) as any;
    if (existing) {
      if (!existing.join_key) {
        existing.join_key = mintCallKey();
        sqlite.prepare("UPDATE bastion_calls SET join_key = ? WHERE id = ?").run(existing.join_key, existing.id);
      }
      return { ok: true, call: existing, already: true };
    }
    const tenderId = Number(ownerKey.replace("tender:", "")) || 0;
    const ins = sqlite.prepare("INSERT INTO bastion_calls (owner_key, host_tender_id, column_id, seed_id, kind, state, created_at, join_key) VALUES (?, ?, NULL, ?, 'instance', 'open', ?, ?)")
      .run(ownerKey, tenderId, bastion.seedId, Date.now(), mintCallKey()) as any;
    const call = sqlite.prepare("SELECT * FROM bastion_calls WHERE id = ?").get(Number(ins.lastInsertRowid)) as any;
    return { ok: true, call };
  },

  /** The Eye and its columns, for the map's face. */
  async getIncursions(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    await this.settleIncursions(ownerKey);
    const now = Date.now();
    const att = sqlite.prepare("SELECT eye, updated_at, break_until, total_spent FROM tender_attention WHERE owner_key = ?").get(ownerKey) as any;
    const eye = decayedEye(att, now);
    const cols = sqlite.prepare(
      "SELECT * FROM incursion_columns WHERE owner_key = ? AND state IN ('marching','arrived') ORDER BY spawned_at ASC"
    ).all(ownerKey) as any[];
    const tiles = await db.select().from(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
    const tileById = new Map(tiles.map(t => [t.id, t]));
    return {
      eye: Math.floor(eye),
      eyeFull: eye >= EYE_SIEGE_THRESHOLD,
      breakUntil: Number(att?.break_until || 0),
      totalSpent: Number(att?.total_spent || 0),
      columns: cols.map(c => {
        const t = c.target_tile_id != null ? tileById.get(c.target_tile_id) : null;
        return {
          id: c.id, kind: c.kind, state: c.state, size: c.size, power: c.power,
          targetKind: c.target_kind, targetTileId: c.target_tile_id,
          targetQ: t ? t.q : null, targetR: t ? t.r : null,
          originQ: c.origin_q, originR: c.origin_r,
          spawnedAt: c.spawned_at, arrivesAt: c.arrives_at,
          roster: incursionRoster(c.size, c.power),
        };
      }),
    };
  },

  /** A column beaten — by whatever battle beat it. Buys the
      ruled 12-minute break before the next timer may start. */
  async defeatIncursion(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const columnId = Math.floor(Number((args as any)?.columnId ?? 0));
    if (!columnId) badRequest("Which column was beaten?");
    const col = sqlite.prepare("SELECT * FROM incursion_columns WHERE id = ? AND owner_key = ?").get(columnId, ownerKey) as any;
    if (!col) badRequest("No such column walks your land.");
    if (col.state === "defeated") return { ok: true, already: true };
    const survivorIds = (Array.isArray((args as any)?.survivorIds) ? (args as any).survivorIds : [])
      .map((n: any) => Math.floor(Number(n))).filter((n: number) => n > 0);
    // At the Table, guests' Awoken stand beside the host's: each
    // survivor pair names the Awoken and ITS OWN Tender's key,
    // verified against the collection it came from.
    const survivorPairs = (Array.isArray((args as any)?.survivorPairs) ? (args as any).survivorPairs : [])
      .map((pr: any) => ({ awakenedId: Math.floor(Number(pr?.awakenedId)), ownerKey: String(pr?.ownerKey ?? "") }))
      .filter((pr: any) => pr.awakenedId > 0 && pr.ownerKey);
    const now = Date.now();
    sqlite.prepare("UPDATE incursion_columns SET state = 'defeated', resolved_at = ? WHERE id = ?").run(now, columnId);
    // A LANDED column beaten at the Table (the Token Strip,
    // 2026-10-23): its force stands on the land as wanderers —
    // they fall with their column, or the land would keep a
    // beaten force standing after its beating.
    if (col.state === "landed") {
      sqlite.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ? AND column_id = ?").run(ownerKey, columnId);
    }
    // A HELD SEED DEFENDED (the personal bastion settlement,
    // ruled 2026-10-16): when the beaten column had come for a
    // held seed's hex, the stand is tallied — the held seed's
    // defenses count rises by one, and that is all it does.
    // THE OLD ROAD IS ABOLISHED (Nigel's growth law — FEEDING
    // IS THE ONLY LADDER, ratified 2026-10-24 19:21: a seed
    // levels ONLY by being fed energy while her company
    // stands near, and by no other road): the every-third-
    // defense level and its banked neighbour tile, which the
    // 2026-10-16 settlement carried, came out with the Table
    // battle port (Twelve #1, 2026-10-25) — the growth build
    // cc6a3c5 flagged that this road contradicted the law,
    // and the port resolved it in the open: defences alone
    // never level a seed, on either ground.
    const colRow = sqlite.prepare("SELECT target_tile_id FROM incursion_columns WHERE id = ?").get(columnId) as any;
    if (colRow?.target_tile_id != null) {
      const seed = sqlite.prepare("SELECT * FROM star_seeds WHERE owner_key = ? AND tile_id = ? AND state = 'held'").get(ownerKey, colRow.target_tile_id) as any;
      if (seed) {
        const defenses = Number(seed.defenses || 0) + 1;
        sqlite.prepare("UPDATE star_seeds SET defenses = ? WHERE id = ?").run(defenses, seed.id);
      }
    }
    sqlite.prepare(`INSERT INTO tender_attention (owner_key, eye, updated_at, break_until, total_spent)
      VALUES (?, 0, ?, ?, 0)
      ON CONFLICT(owner_key) DO UPDATE SET break_until = excluded.break_until`)
      .run(ownerKey, now, now + INCURSION_BREAK_MS);
    // THE RECKONING (Nigel, 2026-10-17): EXP comes from enemies
    // killed — priced by the power of the force that died — and
    // defeating the whole attack pays 50 EXP per level of the
    // attack. Both ride to the Awoken left standing.
    const roster = incursionRoster(Number(col.size || 0), Number(col.power || 1));
    const totalPower = roster.reduce((acc, r) => acc + r.count * r.power, 0);
    const killXp = totalPower * 2;
    const completionXp = 50 * Number(col.power || 1);
    const xpById = new Map<number, XpGainReport>();
    for (const awId of survivorIds) {
      const mine = sqlite.prepare("SELECT id FROM awakened WHERE id = ? AND owner_key = ?").get(awId, ownerKey) as any;
      if (!mine) continue;
      await grantEventXp(xpById, awId, killXp + completionXp);
    }
    for (const pr of survivorPairs) {
      const theirs = sqlite.prepare("SELECT id FROM awakened WHERE id = ? AND owner_key = ?").get(pr.awakenedId, pr.ownerKey) as any;
      if (!theirs) continue;
      await grantEventXp(xpById, pr.awakenedId, killXp + completionXp);
    }
    return { ok: true, breakUntil: now + INCURSION_BREAK_MS, killXp, completionXp, xpGains: [...xpById.values()] };
  },

  async setPatrol(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    await this.settleMarches(ownerKey);
    const parsed = z.object({ awakenedId: z.number().int().positive(), tileIds: z.array(z.number().int().positive()).max(8) }).safeParse(args);
    if (!parsed.success) badRequest("A patrol road is an Awokin and up to eight hexes.");
    const { awakenedId, tileIds } = parsed.data;
    const rows = await db.select().from(schema.fieldPlacements)
      .where(and(eq(schema.fieldPlacements.awakenedId, awakenedId), eq(schema.fieldPlacements.ownerKey, ownerKey))).limit(1);
    const placement = rows[0] as any;
    if (!placement) badRequest("That Awokin does not stand on the field — only the stationed can patrol.");
    if (placement.marchPath) badRequest("That Awokin is on the march — recall it, or let it arrive, before laying a patrol.");
    if (tileIds.length === 0) {
      await db.update(schema.fieldPlacements).set({ patrolPath: null, patrolSince: null, patrolPosQ: null, patrolPosR: null } as any)
        .where(eq(schema.fieldPlacements.id, placement.id));
      return { ok: true as const, awakenedId, patrolling: false };
    }
    if (new Set(tileIds).size !== tileIds.length) badRequest("A patrol road does not name the same hex twice.");
    if (tileIds.includes(placement.tileId)) badRequest("The home hex is the road's beginning and end — it is not named among the waypoints.");
    const myTiles = await db.select().from(schema.territoryTiles)
      .where(eq(schema.territoryTiles.ownerKey, ownerKey));
    const mine = new Set((myTiles as any[]).map(t => t.id));
    if (tileIds.some(id => !mine.has(id))) badRequest("A patrol road runs over your own ground only.");
    // The patrol's stored destination point (Nigel,
    // 2026-10-23): the far end of the road stands on a
    // point of the record's own — today the destination
    // hex's centre, the point a hex-tap order can name.
    const destTile = (myTiles as any[]).find(t => t.id === tileIds[tileIds.length - 1]);
    await db.update(schema.fieldPlacements).set({ patrolPath: JSON.stringify(tileIds), patrolSince: Date.now(), follow: 0, patrolPosQ: destTile?.q ?? null, patrolPosR: destTile?.r ?? null } as any)
      .where(eq(schema.fieldPlacements.id, placement.id));
    // ORDERS END PARTY MEMBERSHIP (Nigel, 2026-10-20): a
    // patrol road is an order like a march — the Awokin
    // given it leaves the party, and leaves following to
    // carry the order out (2026-10-22, as the march does).
    // (Clearing a patrol above gives no order, and ends
    // nothing.)
    removePartyMember(ownerKey, awakenedId);
    return { ok: true as const, awakenedId, patrolling: true, waypoints: tileIds.length };
  },

  // SET MARCH (War-Ground, Nigel 2026-10-16): the plain move of the
  // marching system — point A to point B, for real. The road is found
  // over the Tender's own ground, cursed ground dared at its prices
  // (Nigel, 2026-10-23 — no curse refusal stands); the price and the duration
  // are CALCULATED and spoken before the order is given: energy =
  // hexes × the standing per-hex move cost (1 + ⌊(power−1)/3⌋, the
  // moveAwoken law), time = hexes × the walker's own pace under the
  // MARCH SPEED LAW. The energy is taken when the order is given; the
  // walker then marches (its position derived from road + clock on
  // every screen) and the placement settles on arrival. A march
  // supersedes a patrol. One march at a time per Awoken.
  async setMarch(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    await this.settleMarches(ownerKey);
    const parsed = z.object({
      awakenedId: z.number().int().positive(), tileId: z.number().int().positive(),
      // THE FREE STANDING POINT (Nigel, 2026-10-23): a march
      // may name the exact spot the walker will stand on —
      // fractional axial coordinates, the click law's blips
      // made law. Both axes or neither: a point is a point.
      posQ: z.number().finite().optional(), posR: z.number().finite().optional(),
    }).safeParse(args);
    if (!parsed.success) badRequest("A march is an Awokin and the hex it marches to.");
    const { awakenedId, tileId } = parsed.data;
    const freePoint = parsed.data.posQ !== undefined && parsed.data.posR !== undefined
      ? { q: parsed.data.posQ, r: parsed.data.posR }
      : null;
    if ((parsed.data.posQ === undefined) !== (parsed.data.posR === undefined)) {
      badRequest("A free standing point names both its axes, or neither.");
    }
    const rows = await db.select().from(schema.fieldPlacements)
      .where(and(eq(schema.fieldPlacements.awakenedId, awakenedId), eq(schema.fieldPlacements.ownerKey, ownerKey))).limit(1);
    const placement = rows[0] as any;
    if (!placement) badRequest("That Awokin does not stand on the field — only the stationed can march.");
    if (placement.marchPath) badRequest("That Awokin is already on the march — recall it, or let it arrive.");
    if (placement.tileId === tileId) badRequest("It stands there already.");
    const tiles = await db.select().from(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
    const dest = tiles.find(t => t.id === tileId) as any;
    if (!dest) badRequest("That hex is not yours to march to.");
    // THE ROAD DARES THE CURSE (Nigel, 2026-10-23): no
    // curse refusal stands in the march — a march may run
    // onto and through cursed ground, at the prices the
    // land already charges: cursed steps at twice the
    // time in the reckoning below, and the curse's
    // attrition for standing in it, settled as ever. The
    // only road-refusal left is the ground itself: no
    // path at all over passable land — and the road
    // graph's own exclusions (floating isles, stone
    // still gathering) are collision, not curse.
    // THE CONSTRUCTION'S WALLS bar the road (the Hex Building
    // System): a step whose centre line crosses a standing
    // build wall is no step — the road goes around, and only a
    // land with no way around at all refuses the march.
    const road = findAnyRoad(tiles as any, placement.tileId, tileId, buildStepBlocked(ownerKey));
    if (!road) badRequest("No road runs there — the ground itself bars the way.");
    const steps = road.length - 1;
    // A free point must belong to the ground it names:
    // within the destination hex or hard beside it, never
    // a spot across the map wearing this hex's name.
    if (freePoint && hexDistTiles({ q: freePoint.q, r: freePoint.r } as any, dest) > 1) {
      badRequest("That standing point does not lie on the hex it marches to.");
    }
    // No destination count refuses a march (THE CROWDING
    // GATE, Nigel 2026-10-18): the field's placements are
    // read for the crowd the road will wade through —
    // the gate taxes the pace below, it bars nothing.
    const allPlacements = await db.select().from(schema.fieldPlacements).where(eq(schema.fieldPlacements.ownerKey, ownerKey));
    // The walker's true power and pace, from its own record.
    const awRows = await db.select().from(schema.awakened).where(eq(schema.awakened.id, awakenedId)).limit(1);
    const aw = awRows[0] as any;
    if (!aw) badRequest("That Awokin is not yours to march.");
    const assetRows = await db.select().from(schema.layerAssets);
    const assetStats = new Map<number, AssetStats>();
    for (const r of assetRows) {
      const rar = raritySchema.safeParse(r.rarity);
      if (rar.success) assetStats.set(r.id, { name: r.name, rarity: rar.data, power: r.power, toughness: r.toughness, element: (r as any).element ?? null });
    }
    const layers = parseLayers(aw.compositionJson, assetStats);
    const payload = await awakenedPayloadById(aw.id);
    const power = payload?.power ?? layers.reduce((s, l) => s + (l.power ?? 0), 0);
    const energy = steps * (1 + Math.floor((power - 1) / 3));
    const marchCursed = new Map((tiles as any[]).map((t: any) => [t.id, !!t.cursed]));
    const seconds = marchWeightedSeconds(road, marchSecondsPerHexFor(layers, aw.experience ?? 0), (id) => !!marchCursed.get(id), marchCrowdOf(allPlacements as any[], new Set([awakenedId])));
    if (!(await spendEnergy(ownerKey, energy))) badRequest(`Not enough energy — that march costs ${energy}.`);
    const now = Date.now();
    await db.update(schema.fieldPlacements).set({
      marchPath: JSON.stringify(road), marchSince: now, marchEnds: now + Math.round(seconds * 1000), marchGoal: null,
      // The point this march will stand on (or none — the
      // destination's centre waits at settlement). The
      // standing point it leaves is not touched: a march is
      // answered where it began until it ends, and the
      // landing writes the new point whole.
      marchPosQ: freePoint ? freePoint.q : null, marchPosR: freePoint ? freePoint.r : null,
      patrolPath: null, patrolSince: null, patrolPosQ: null, patrolPosR: null,
      // AN ORDER ENDS THE FOLLOW (the marching-orders spec,
      // Nigel 2026-10-22 — the Table's march referee has
      // always read "a direct order ends the follow"; the
      // homeland's verb now reads the same, or the muster
      // would march the ordered Awokin home on its arrival
      // and the order would never be carried out).
      follow: 0,
    } as any).where(eq(schema.fieldPlacements.id, placement.id));
    // ORDERS END PARTY MEMBERSHIP (Nigel, 2026-10-20): a
    // marched Awokin leaves the party — it stands under
    // orders now, not at the Tender's side.
    removePartyMember(ownerKey, awakenedId);
    return { ok: true as const, awakenedId, tileId, steps, seconds: Math.round(seconds * 10) / 10, energy };
  },

  // RECALL MARCH (War-Ground, 2026-10-16): the Tender calls a marcher
  // home. The walker turns where it stands — the road home is the road
  // out, walked back from the hex it has reached — at its own pace.
  // The outbound energy is spent either way; a recall is free.
  async recallMarch(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    await this.settleMarches(ownerKey);
    const parsed = z.object({ awakenedId: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("A recall names the marching Awokin.");
    const { awakenedId } = parsed.data;
    const rows = await db.select().from(schema.fieldPlacements)
      .where(and(eq(schema.fieldPlacements.awakenedId, awakenedId), eq(schema.fieldPlacements.ownerKey, ownerKey))).limit(1);
    const placement = rows[0] as any;
    if (!placement) badRequest("That Awokin does not stand on the field.");
    if (!placement.marchPath || !placement.marchSince || !placement.marchEnds) badRequest("That Awokin is not on the march.");
    let road: number[] = [];
    try { const r = JSON.parse(placement.marchPath); if (Array.isArray(r)) road = r.filter((x: any) => typeof x === "number"); } catch { /* broken below */ }
    if (road.length < 2) {
      await db.update(schema.fieldPlacements).set({ marchPath: null, marchSince: null, marchEnds: null, marchGoal: null, marchPosQ: null, marchPosR: null } as any)
        .where(eq(schema.fieldPlacements.id, placement.id));
      return { ok: true as const, awakenedId, recalled: true, stepsHome: 0 };
    }
    const steps = road.length - 1;
    const frac = Math.min(1, Math.max(0, (Date.now() - placement.marchSince) / Math.max(1, placement.marchEnds - placement.marchSince)));
    const reached = Math.floor(frac * steps); // whole hexes gained
    if (reached <= 0) {
      await db.update(schema.fieldPlacements).set({ marchPath: null, marchSince: null, marchEnds: null, marchGoal: null, marchPosQ: null, marchPosR: null } as any)
        .where(eq(schema.fieldPlacements.id, placement.id));
      return { ok: true as const, awakenedId, recalled: true, stepsHome: 0 };
    }
    const awRows = await db.select().from(schema.awakened).where(eq(schema.awakened.id, awakenedId)).limit(1);
    const aw = awRows[0] as any;
    const assetRows = await db.select().from(schema.layerAssets);
    const assetStats = new Map<number, AssetStats>();
    for (const r of assetRows) {
      const rar = raritySchema.safeParse(r.rarity);
      if (rar.success) assetStats.set(r.id, { name: r.name, rarity: rar.data, power: r.power, toughness: r.toughness, element: (r as any).element ?? null });
    }
    const layers = aw ? parseLayers(aw.compositionJson, assetStats) : [];
    const pace = marchSecondsPerHexFor(layers, aw?.experience ?? 0);
    const homeRoad = road.slice(0, reached + 1).reverse();
    const recallTiles = await db.select().from(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
    const recallCursed = new Map((recallTiles as any[]).map((t: any) => [t.id, !!t.cursed]));
    const recallPlacements = await db.select().from(schema.fieldPlacements).where(eq(schema.fieldPlacements.ownerKey, ownerKey));
    const now = Date.now();
    await db.update(schema.fieldPlacements).set({
      marchPath: JSON.stringify(homeRoad), marchSince: now, marchEnds: now + Math.round(marchWeightedSeconds(homeRoad, pace, (id) => !!recallCursed.get(id), marchCrowdOf(recallPlacements as any[], new Set([awakenedId]))) * 1000), marchGoal: null,
      // The road home carries no free point of its own:
      // the walker lands on its home hex's centre, as
      // recalls always have.
      marchPosQ: null, marchPosR: null,
    } as any).where(eq(schema.fieldPlacements.id, placement.id));
    return { ok: true as const, awakenedId, recalled: true, stepsHome: reached };
  },

  async getWave(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    let state = await db.select().from(schema.waveState)
      .where(eq(schema.waveState.ownerKey, ownerKey)).limit(1);
    if (!state.length) {
      const [row] = await db.insert(schema.waveState).values({ ownerKey }).returning();
      state = [row];
    }
    const wave = state[0].waveNumber;
    // The live sky (Weather's teeth): the preview shows the power the
    // Unraveling strikes with under the mood reigning right now.
    const { mood } = await getWorldMood();
    const { totalPower, unravelers, frayCount } = wavePowerFor(wave, mood);
    return {
      waveNumber: wave,
      wavesDefeated: state[0].wavesDefeated,
      frayCount, unravelers,
      totalPower,
      mood,
      // Fix list #4: when the recovery from the last victory ends (ISO),
      // or null when the next wave can be faced now.
      nextWaveAt: nextWaveAtFor(state[0]),
    };
  },



  async getEnergy(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    let res = await db.select().from(schema.tenderResources)
      .where(eq(schema.tenderResources.ownerKey, ownerKey)).limit(1);
    if (!res.length) {
      const [row] = await db.insert(schema.tenderResources).values({ ownerKey, energy: 10 }).returning();
      res = [row];
    }
    const maxEnergy = await calculateMaxEnergy(ownerKey);
    let energy = res[0].energy;
    const updatedAt = res[0].updatedAt ? new Date(res[0].updatedAt).getTime() : Date.now();
    const lastSeen = res[0].lastSeenAt ? new Date(res[0].lastSeenAt).getTime() : 0;
    const now = Date.now();
    // Online detection: if last seen within 5 min, Tender is online.
    // Regen rate is the workshop timer (default 4 min online); offline
    // regen is 3x slower, as it has always been.
    const isOnline = (now - lastSeen) < 5 * 60 * 1000;
    const regenCfg = await loadGameConfig();
    const onlineRegenMinutes = regenCfg.timers.energyRegenMinutes ?? 4;
    const regenMinutes = isOnline ? onlineRegenMinutes : onlineRegenMinutes * 3;
    const elapsedMin = (now - updatedAt) / (1000 * 60);
    const regen = Math.floor(elapsedMin / regenMinutes);
    if (regen > 0 && energy < maxEnergy) {
      energy = Math.min(energy + regen, maxEnergy);
      await db.update(schema.tenderResources)
        .set({ energy, updatedAt: new Date(), lastSeenAt: new Date() })
        .where(eq(schema.tenderResources.ownerKey, ownerKey));
    } else {
      // Update lastSeen even if no regen
      await db.update(schema.tenderResources)
        .set({ lastSeenAt: new Date() })
        .where(eq(schema.tenderResources.ownerKey, ownerKey));
    }
    if (energy > maxEnergy) {
      // Clamp to max (in case max decreased)
      await db.update(schema.tenderResources)
        .set({ energy: maxEnergy })
        .where(eq(schema.tenderResources.ownerKey, ownerKey));
      energy = maxEnergy;
    }
    return { energy, maxEnergy };
  },

  // Admin: set a tender's energy.
  async adminRefillAllEnergy(args: unknown, ctx?: ActionContext) {
    // TODO: verify admin workshop password
    // One-time: set all tenders to their calculated max energy
    const tenders = await db.select().from(schema.tenders);
    let count = 0;
    for (const t of tenders) {
      const ownerKey = tenderOwnerKey(t.id);
      const maxEnergy = await calculateMaxEnergy(ownerKey);
      await db.insert(schema.tenderResources)
        .values({ ownerKey, energy: maxEnergy, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: schema.tenderResources.ownerKey,
          set: { energy: maxEnergy, updatedAt: new Date() }
        });
      count++;
    }
    return { ok: true, refilled: count };
  },

  // Admin: THE WORLD RESET (Nigel's ruling, via Land, 2026-10-16).
  // Every UNCURSED tile on every Tender's map returns to flat,
  // unclaimed ground: element neutral, Z1, trays zeroed, attunement
  // bank emptied — the same clean state a purification is born in
  // (PURIFIED_TILE_FIELDS). Cursed tiles are untouched, and so are
  // buildings, walls, and the Awoken standing on the land: only the
  // land's element and stack are laid down. Workshop-gated in
  // index.ts like every admin action.
  async adminResetWorldTiles(_args: unknown, _ctx?: ActionContext) {
    const before = await db.select({ ownerKey: schema.territoryTiles.ownerKey })
      .from(schema.territoryTiles)
      .where(eq(schema.territoryTiles.cursed, 0));
    await db.update(schema.territoryTiles)
      .set({ element: "neutral", curseHp: null, curseMaxHp: null, ...PURIFIED_TILE_FIELDS })
      .where(eq(schema.territoryTiles.cursed, 0));
    return {
      ok: true as const,
      tilesReset: before.length,
      tendersAffected: new Set(before.map(t => t.ownerKey)).size,
    };
  },

  async adminSetEnergy(args: unknown, ctx?: ActionContext) {
    // TODO: verify admin workshop password
    const parsed = z.object({ ownerKey: z.string() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    // Refill to the tender's calculated max (not flat 50)
    const maxEnergy = await calculateMaxEnergy(parsed.data.ownerKey);
    await db.insert(schema.tenderResources)
      .values({ ownerKey: parsed.data.ownerKey, energy: maxEnergy })
      .onConflictDoUpdate({ target: schema.tenderResources.ownerKey, set: { energy: maxEnergy } });
    return { ok: true, energy: maxEnergy };
  },

  // Admin: set wave number for a tender (or reset to 1)
  async adminSetWave(args: unknown, ctx?: ActionContext) {
    const parsed = z.object({ 
      ownerKey: z.string(),
      waveNumber: z.number().int().min(1),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    const targetKey = parsed.data.ownerKey;
    await db.insert(schema.waveState)
      .values({ ownerKey: targetKey, waveNumber: parsed.data.waveNumber, wavesDefeated: 0 })
      .onConflictDoUpdate({ 
        target: schema.waveState.ownerKey, 
        set: { waveNumber: parsed.data.waveNumber, wavesDefeated: 0 } 
      });
    return { ok: true, waveNumber: parsed.data.waveNumber };
  },

  // Admin: get tender's deck (field + hand)
  async adminGetTenderDeck(args: unknown, ctx?: ActionContext) {
    const parsed = z.object({ ownerKey: z.string() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    const targetKey = parsed.data.ownerKey;
    // Field placements
    const placements = await db.select().from(schema.fieldPlacements)
      .where(eq(schema.fieldPlacements.ownerKey, targetKey));
    const fieldIds = new Set(placements.map(p => p.awakenedId));
    // All Awoken
    const allAwoken = await db.select().from(schema.awakened)
      .where(eq(schema.awakened.ownerKey, targetKey));
    const field = allAwoken.filter(a => fieldIds.has(a.id));
    const hand = allAwoken.filter(a => !fieldIds.has(a.id));
    // Get wave number
    const waveState = await db.select().from(schema.waveState)
      .where(eq(schema.waveState.ownerKey, targetKey)).limit(1);
    return { 
      ok: true, 
      field, 
      hand,
      waveNumber: waveState.length ? waveState[0].waveNumber : 1,
    };
  },

  // Admin: clear all timers (dispersed, passive, etc.) for a tender.
  async getBuildingDefs() {
    // The build menu must show what will actually be charged: live config
    // (workshop overrides applied), and disabled buildings are not offered.
    const gameConfig = await loadGameConfig();
    return {
      defs: Object.entries(gameConfig.buildings)
        .filter(([, d]: any) => d.enabled !== false)
        .map(([type, d]: any) => ({ type, ...d })),
    };
  },

  async getBuildings(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    await settleHallFor(ownerKey);
    const buildings = await db.select().from(schema.territoryBuildings)
      .where(eq(schema.territoryBuildings.ownerKey, ownerKey));
    const now = Date.now();
    const gameConfig = await loadGameConfig();
    const upkeepCost = gameConfig.buildings["watchtower"]?.upkeepPerHour ?? 2;
    const upkeepMs = 60 * 60 * 1000;
    for (const b of buildings) {
      // Building completed -> active
      if (b.status === "building" && b.readyAt && new Date(b.readyAt).getTime() <= now) {
        await db.update(schema.territoryBuildings)
          .set({ status: "active", lastUpkeepAt: new Date() })
          .where(eq(schema.territoryBuildings.id, b.id));
        b.status = "active";
        b.lastUpkeepAt = new Date();
        // Builders return to their previous stance
        if (b.builderStances) {
          try {
            const memories = JSON.parse(b.builderStances) as { placementId: number; stance: string }[];
            for (const m of memories) {
              await db.update(schema.fieldPlacements)
                .set({ stance: m.stance })
                .where(eq(schema.fieldPlacements.id, m.placementId));
            }
          } catch {}
        }
      }
      // Attunement shrine upkeep: 3 energy/hour or goes dormant (doubling stops)
      if (b.buildingType === "attunement-shrine" && (b.status === "active" || b.status === "dormant")) {
        const shrineUpkeep = gameConfig.buildings["attunement-shrine"]?.upkeepPerHour ?? 3;
        const lastUpkeepS = b.lastUpkeepAt ? new Date(b.lastUpkeepAt).getTime() : now;
        if (now - lastUpkeepS >= upkeepMs) {
          const res = await db.select().from(schema.tenderResources)
            .where(eq(schema.tenderResources.ownerKey, ownerKey)).limit(1);
          const energy = res.length ? res[0].energy : 0;
          if (energy >= shrineUpkeep) {
            await db.update(schema.tenderResources)
              .set({ energy: energy - shrineUpkeep })
              .where(eq(schema.tenderResources.ownerKey, ownerKey));
            await db.update(schema.territoryBuildings)
              .set({ status: "active", lastUpkeepAt: new Date() })
              .where(eq(schema.territoryBuildings.id, b.id));
            b.status = "active";
            b.lastUpkeepAt = new Date();
          } else if (b.status === "active") {
            await db.update(schema.territoryBuildings)
              .set({ status: "dormant" })
              .where(eq(schema.territoryBuildings.id, b.id));
            b.status = "dormant";
          }
        }
      }
      // Watchtower upkeep: 2 energy/hour or goes dormant
      if (b.buildingType === "watchtower" && (b.status === "active" || b.status === "dormant")) {
        const lastUpkeep = b.lastUpkeepAt ? new Date(b.lastUpkeepAt).getTime() : now;
        if (now - lastUpkeep >= upkeepMs) {
          const res = await db.select().from(schema.tenderResources)
            .where(eq(schema.tenderResources.ownerKey, ownerKey)).limit(1);
          const energy = res.length ? res[0].energy : 0;
          if (energy >= upkeepCost) {
            await db.update(schema.tenderResources)
              .set({ energy: energy - upkeepCost })
              .where(eq(schema.tenderResources.ownerKey, ownerKey));
            await db.update(schema.territoryBuildings)
              .set({ status: "active", lastUpkeepAt: new Date() })
              .where(eq(schema.territoryBuildings.id, b.id));
            b.status = "active";
            b.lastUpkeepAt = new Date();
          } else if (b.status === "active") {
            await db.update(schema.territoryBuildings)
              .set({ status: "dormant" })
              .where(eq(schema.territoryBuildings.id, b.id));
            b.status = "dormant";
          }
        }
      }
    }
    // Attach harvest parameters so the client knows per-type grow times
    const withDefs = buildings.map(b => {
      const def = gameConfig.buildings[b.buildingType] || {};
      return {
        ...b,
        harvestEnergy: def.harvestEnergy ?? null,
        growHours: def.growHours ?? null,
      };
    });
    return { buildings: withDefs };
  },

  async placeBuilding(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      tileId: z.number().int(),
      buildingType: z.string(),
      element: z.string().optional(),
      builderIds: z.array(z.number().int()).optional(),
      wedge: z.number().int().min(0).max(5).optional(),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    const gameConfig = await loadGameConfig();
    const def = gameConfig.buildings[parsed.data.buildingType];
    if (!def) badRequest("Unknown building.");
    if (!def.enabled) badRequest("Building disabled.");
    // Builders: manually selected Awoken from the tile (any stance -> building)
    // Each builder exponentially reduces build time: time / 2^builders
    const builderIds = parsed.data.builderIds || [];
    const helpers = builderIds.length ? await db.select().from(schema.fieldPlacements)
      .where(and(
        eq(schema.fieldPlacements.ownerKey, ownerKey),
        eq(schema.fieldPlacements.tileId, parsed.data.tileId),
      )) : [];
    const validHelpers = helpers.filter(h => builderIds.includes(h.awakenedId));
    // Block Awoken already building elsewhere
    if (validHelpers.length) {
      const activeBuilds = await db.select().from(schema.territoryBuildings)
        .where(and(
          eq(schema.territoryBuildings.ownerKey, ownerKey),
          eq(schema.territoryBuildings.status, "building"),
        ));
      const busyPlacementIds = new Set<number>();
      for (const b of activeBuilds) {
        if (b.builderStances) {
          try {
            const memories = JSON.parse(b.builderStances) as { placementId: number; stance: string }[];
            for (const m of memories) busyPlacementIds.add(m.placementId);
          } catch {}
        }
      }
      const busy = validHelpers.filter(h => busyPlacementIds.has(h.id));
      if (busy.length) {
        const names = busy.map(h => h.awakenedId).join(", ");
        badRequest(`Awokin ${names} already assisting another build.`);
      }
    }
    const helperCount = validHelpers.length;
    const timeDivisor = Math.pow(gameConfig.timers.buildHelperDivisor, helperCount);
    const tile = await db.select().from(schema.territoryTiles)
      .where(and(
        eq(schema.territoryTiles.id, parsed.data.tileId),
        eq(schema.territoryTiles.ownerKey, ownerKey),
        eq(schema.territoryTiles.cursed, 0)
      )).limit(1);
    if (!tile.length) badRequest("Tile must be purified.");
    // Trees cannot grow on sky or water (tide) hexes
    if (parsed.data.buildingType === "tree" && (tile[0].element === "sky" || tile[0].element === "tide")) {
      badRequest("Trees cannot grow on sky or water.");
    }
    // Dream Weed can ONLY be built on water (tide) hexes
    if (parsed.data.buildingType === "dream-weed" && tile[0].element !== "tide") {
      badRequest("Dream Weed only grows in water.");
    }
    // Sky Bloom can ONLY be built on sky hexes
    if (parsed.data.buildingType === "sky-bloom" && tile[0].element !== "sky") {
      badRequest("Sky Bloom only floats on sky.");
    }
    // Dream Shroom synergy: 25% faster if Awakening Well on same or adjacent hex
    let synergyMultiplier = 1;
    if (parsed.data.buildingType === "dream-wheat") {
      const tileData = tile[0];
      const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
      const checkTiles = [{ q: tileData.q, r: tileData.r }];
      for (const [dq, dr] of dirs) {
        checkTiles.push({ q: tileData.q + dq, r: tileData.r + dr });
      }
      const nearbyTiles = await db.select().from(schema.territoryTiles)
        .where(eq(schema.territoryTiles.ownerKey, ownerKey));
      const nearbyIds = new Set(
        nearbyTiles.filter(t => checkTiles.some(ct => ct.q === t.q && ct.r === t.r)).map(t => t.id)
      );
      const wells = await db.select().from(schema.territoryBuildings)
        .where(and(
          eq(schema.territoryBuildings.ownerKey, ownerKey),
          eq(schema.territoryBuildings.buildingType, "awakening-well"),
          eq(schema.territoryBuildings.status, "active"),
        ));
      if (wells.some(w => nearbyIds.has(w.tileId))) {
        synergyMultiplier = gameConfig.timers.wheatWellSynergy;
      }
    }
    // The Tower stands alone upon its tile, like the Hall stands
    // alone in the world (Nigel, 2026-10-14): nothing may share a
    // Tower's hex, and a Tower may rise only upon an empty one.
    const existing = await db.select().from(schema.territoryBuildings)
      .where(and(
        eq(schema.territoryBuildings.ownerKey, ownerKey),
        eq(schema.territoryBuildings.tileId, parsed.data.tileId)
      ));
    if (parsed.data.buildingType === "watchtower" && existing.length > 0) badRequest("The Tower stands alone upon its tile — no other building may share its hex.");
    if (existing.some((b: any) => b.buildingType === "watchtower")) badRequest("A Tower already stands upon this tile, and it stands alone.");
    // The Dream Shroom's six wedges (Nigel, 2026-10-18): the crop
    // lives in its own layer beside the building seats — a hex holds
    // its two buildings AND up to six shrooms, one per wedge, each
    // growing on its own clock. The Tower and the Hall still stand
    // alone against everything, wedges included (their checks read
    // every row of the hex).
    const isShroom = parsed.data.buildingType === "dream-wheat";
    const shroomsHere = existing.filter((b: any) => b.buildingType === "dream-wheat");
    let wedge: number | null = null;
    if (isShroom) {
      if (shroomsHere.length >= 6) badRequest("Every wedge of this hex is planted — six Dream Shrooms already grow here.");
      const taken = new Set<number>();
      // Rows planted before the wedges were law may carry no wedge
      // until the boot migration seats them; mirror its seating
      // (oldest first, first free wedge) so such a row still holds
      // its ground in the meantime.
      for (const b of [...shroomsHere].sort((a: any, b: any) => a.id - b.id)) {
        if (typeof (b as any).wedge === "number") { taken.add((b as any).wedge); continue; }
        let w = 0; while (taken.has(w)) w++;
        taken.add(w);
      }
      if (parsed.data.wedge !== undefined) {
        if (taken.has(parsed.data.wedge)) badRequest("That wedge is already planted.");
        wedge = parsed.data.wedge;
      } else {
        let w = 0; while (taken.has(w)) w++;
        wedge = w;
      }
    } else if (existing.filter((b: any) => b.buildingType !== "dream-wheat").length >= 2) {
      badRequest("Max 2 buildings per hex.");
    }
    // Hall of Champions: one per tender, alone on its tile; nothing shares its tile.
    if (parsed.data.buildingType === "hall-of-champions") {
      const halls = await db.select().from(schema.territoryBuildings)
        .where(and(
          eq(schema.territoryBuildings.ownerKey, ownerKey),
          eq(schema.territoryBuildings.buildingType, "hall-of-champions")
        ));
      if (halls.length) badRequest("Your Hall of Champions already stands.");
      if (existing.length) badRequest("The Hall must stand alone on its tile.");
    } else if (existing.some(b => b.buildingType === "hall-of-champions")) {
      badRequest("The Hall of Champions stands alone.");
    }
    // BUILD SPEED (the zodiac's clause, Recovery #1):
    // "builds complete 5% faster" per level, deepened —
    // the clause's own direction: TIME DOWN by the sum.
    const actualBuildMinutes = Math.max(1, Math.floor(def.buildMinutes * synergyMultiplier / timeDivisor * (1 - fxSum(ownerKey, "buildSpeed") / 100)));
    const energyRes = await this.getEnergy({}, ctx);
    if (energyRes.energy < def.cost) badRequest("Not enough energy.");
    await db.update(schema.tenderResources)
      .set({ energy: energyRes.energy - def.cost })
      .where(eq(schema.tenderResources.ownerKey, ownerKey));
    noteEnergySpent(ownerKey, def.cost);
    const readyAt = new Date(Date.now() + actualBuildMinutes * 60 * 1000);
    // Builders enter build mode - remember their previous stance
    const stanceMemory: { placementId: number; stance: string }[] = [];
    for (const h of validHelpers) {
      stanceMemory.push({ placementId: h.id, stance: h.stance });
      await db.update(schema.fieldPlacements)
        .set({ stance: "building" })
        .where(eq(schema.fieldPlacements.id, h.id));
    }
    const [building] = await db.insert(schema.territoryBuildings).values({
      ownerKey,
      tileId: parsed.data.tileId,
      buildingType: parsed.data.buildingType,
      status: "building",
      readyAt,
      element: parsed.data.element || null,
      builderStances: stanceMemory.length ? JSON.stringify(stanceMemory) : null,
      wedge,
    }).returning();
    return { ok: true, building };
  },

  // UI Workspace APIs
  async uploadUiSprite(args: unknown, ctx?: ActionContext) {
    const parsed = z.object({
      category: z.enum(["enemy", "building", "terrain", "timer", "ui", "awakening", "table"]),
      name: z.string().min(1).max(100),
      imageBase64: z.string().min(100).max(16_000_000),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid upload.");
    const bytes = Buffer.from(parsed.data.imageBase64, "base64");
    const blobKey = `ui-sprites/${Date.now()}-${randomUUID()}.png`;
    blobs.put(blobKey, bytes, "image/png");
    const [sprite] = await db.insert(schema.uiSprites).values({
      category: parsed.data.category,
      name: parsed.data.name,
      blobKey,
    }).returning();
    return { ok: true, sprite };
  },

  async listUiSprites(args: unknown, ctx?: ActionContext) {
    const sprites = await db.select().from(schema.uiSprites).orderBy(schema.uiSprites.createdAt);
    return { sprites: sprites.map(s => ({
      ...s,
      url: `/blobs/${Buffer.from(s.blobKey).toString("base64url")}`,
    })) };
  },

  // Enemy sprite selection: which uploaded art is LIVE for each enemy.
  // Stored in ui_config under one key as { [enemyName]: spriteId | 0 } —
  // a sprite id pins that upload, 0 pins the bundled art, and no entry
  // means the default rule: the most recent upload is live. Every enemy
  // renderer resolves through getEnemyArt, so the choice is the same on
  // every surface and survives reload and deploy.
  async getEnemyArt() {
    const { art, selection } = await resolveCurrentEnemyArt();
    return { art, selection };
  },

  async setEnemySpriteSelection(args: unknown, ctx?: ActionContext) {
    const parsed = z.object({
      name: z.string().min(1).max(100),
      // sprite id pins that upload; 0 pins the bundled art; null clears
      // the pin and returns the enemy to the latest-upload default.
      spriteId: z.number().int().min(0).nullable(),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid.");
    const { name, spriteId } = parsed.data;
    if (spriteId !== null && spriteId > 0) {
      const [row] = await db.select().from(schema.uiSprites)
        .where(eq(schema.uiSprites.id, spriteId)).limit(1);
      if (!row || row.category !== "enemy" || row.name !== name) {
        badRequest("That sprite is not an upload for this enemy.");
      }
    }
    const key = "enemy.sprite.selection";
    const [existing] = await db.select().from(schema.uiConfig)
      .where(eq(schema.uiConfig.key, key)).limit(1);
    let selection: Record<string, number> = {};
    if (existing) { try { selection = JSON.parse(existing.value) || {}; } catch {} }
    if (spriteId === null) delete selection[name];
    else selection[name] = spriteId;
    await db.insert(schema.uiConfig)
      .values({ key, value: JSON.stringify(selection) })
      .onConflictDoUpdate({ target: schema.uiConfig.key, set: { value: JSON.stringify(selection) } });
    return { ok: true, selection };
  },

  // Card borders — the public read every card surface consumes
  // (TradingCard in the game, the hand cards at the Table, the
  // workshop section itself). Writers are workshop-gated in index.ts.
  async getCardBorder(_args: unknown) {
    return cardBorderState();
  },

  async uploadCardBorder(args: unknown) {
    const parsed = z.object({
      name: z.string().min(1).max(80),
      imageBase64: z.string().min(100).max(16_000_000),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid card border upload.");
    const bytes = Buffer.from(parsed.data.imageBase64, "base64");
    assertPngBytes(bytes);
    const uploads: CardBorderUpload[] = (await readUiConfigJson("card.border.uploads")) ?? [];
    const id = randomUUID();
    const blobKey = `card-border/${id}.png`;
    blobs.put(blobKey, bytes, "image/png");
    uploads.push({ id, name: parsed.data.name, blobKey, fit: "hug", createdAt: Date.now() });
    await writeUiConfigJson("card.border.uploads", uploads);
    return cardBorderState();
  },

  async setCardBorderSelection(args: unknown) {
    const parsed = z.object({
      kind: z.enum(["none", "birth", "upload"]),
      id: z.string().max(80).optional(),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid card border selection.");
    if (parsed.data.kind === "upload") {
      const uploads: CardBorderUpload[] = (await readUiConfigJson("card.border.uploads")) ?? [];
      if (!uploads.some((u) => u.id === parsed.data.id)) badRequest("That border is not on the shelf.");
    }
    await writeUiConfigJson("card.border.selection",
      parsed.data.kind === "upload" ? { kind: "upload", id: parsed.data.id } : { kind: parsed.data.kind });
    return cardBorderState();
  },

  async setCardBorderFit(args: unknown) {
    const parsed = z.object({
      target: z.string().min(1).max(80),
      fit: z.enum(["hug", "morning"]),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid card border fit.");
    if (parsed.data.target === "birth") {
      await writeUiConfigJson("card.border.birthFit", parsed.data.fit);
    } else {
      const uploads: CardBorderUpload[] = (await readUiConfigJson("card.border.uploads")) ?? [];
      const u = uploads.find((x) => x.id === parsed.data.target);
      if (!u) badRequest("That border is not on the shelf.");
      u.fit = parsed.data.fit;
      await writeUiConfigJson("card.border.uploads", uploads);
    }
    return cardBorderState();
  },

  async deleteCardBorder(args: unknown) {
    const parsed = z.object({ id: z.string().min(1).max(80) }).safeParse(args);
    if (!parsed.success) badRequest("Invalid card border delete.");
    const uploads: CardBorderUpload[] = (await readUiConfigJson("card.border.uploads")) ?? [];
    const next = uploads.filter((u) => u.id !== parsed.data.id);
    if (next.length === uploads.length) badRequest("That border is not on the shelf.");
    await writeUiConfigJson("card.border.uploads", next);
    const selection = (await readUiConfigJson("card.border.selection")) ?? { kind: "birth" };
    if (selection.kind === "upload" && selection.id === parsed.data.id) {
      await writeUiConfigJson("card.border.selection", { kind: "none" });
    }
    return cardBorderState();
  },

  // ── The Grimoire (Nigel, 2026-10-17) ──────────────────
  // The Written Light as a living book: glyphs sorted and
  // assigned, spells listed with their numbers, all tuned in
  // the workshop and read by the world (the Table's referee,
  // the territory map). getGrimoire is the public read every
  // surface consumes; the writers are workshop-gated in
  // index.ts. State: server/src/grimoire.ts (ui_config).
  async getGrimoire(_args: unknown, ctx?: ActionContext) {
    const state = await refreshGrimoire();
    // A bound Tender also reads their own attunement ledger:
    // the filled slots standing in each of their pages, by
    // element. The book itself stays the public read it
    // always was — the ledger rides only for the Tender it
    // belongs to.
    if (ctx?.tender) {
      const ownerKey = ownerKeyFor(ctx);
      return { ...state, pageAttunements: await pageAttunementsFor(ownerKey) };
    }
    return state;
  },

  /** ATTUNE A PAGE OF THE GRIMOIRE (Nigel, 2026-10-20:
   *  "remove pour functionality and make the grimoire the
   *  only way to ATTUNE spells and runes wards" — and the
   *  slots, 2026-10-21: "each spell had 8 elemental slots
   *  that can be filled"; "attuneing spells costs 4 point
   *  per lvl"). Powering lives in the book: each call fills
   *  ONE of the page's eight slots with ONE element, paid
   *  from that element's pool at 4 points the slot, and the
   *  slot STANDS — every cast of that page, on either
   *  ground, carries the filled slots of the cast's element
   *  (pageSlotsCastFor), each +1 power and +1 health to the
   *  working laid. A page may hold a mix of elements across
   *  its eight. The spend is refused whole when the pool
   *  cannot pay the 4 — nothing is half-spent — and a page
   *  whose eight slots all stand filled refuses more.
   *  Filling is one-way today: emptying or re-attuning a
   *  filled slot is not ruled and is not offered. The
   *  GIFTS BEND THE LAYING (Recovery R9): the price is the
   *  flat 4 for every hand, but what a spend LAYS is the
   *  book's one reckoning (pourLaidFor, in grimoire.ts):
   *  the Witch's slot spend lays 2 slots, the Sage's lays
   *  3 (hers is +2), the Binder's lays 3 (hers is ×3, her
   *  Attune gift of 2026-10-22), every other hand lays the
   *  1 it sought — capped by the page's room, as a hex's
   *  cap stands over a tile gift. Only
   *  pages whose strength is bought with attunement take
   *  slots at all (the book's POUR_ENGINES). */
  async attuneGrimoirePage(args: unknown, ctx?: ActionContext) {
    if (!ctx?.tender) badRequest("Log in first.");
    const parsed = z.object({
      spellKey: z.string().min(1).max(80),
      element: z.enum(["root", "tide", "sky", "stone", "fire"]),
    }).safeParse(args);
    if (!parsed.success) badRequest("Name a page of the book and one of the five elements to fill a slot with.");
    const { spellKey, element } = parsed.data;
    const ownerKey = ownerKeyFor(ctx);
    await refreshGrimoire();
    const spell = spellByKey(spellKey);
    if (!spell) badRequest("That page is not in the book.");
    if (!(POUR_ENGINES as readonly string[]).includes(spell.engine)) {
      badRequest(`“${spell.name}” takes no attunement — its strength is not bought with points. Power the pages whose strength is: the holding wards and the Crown Shard.`);
    }
    const totalNow = await pageTotalSlots(ownerKey, spellKey);
    if (totalNow >= PAGE_SLOTS) {
      badRequest(`That page's eight slots all stand filled — there is no room for another.`);
    }
    const progress = await getTenderProgress(ownerKey);
    // What this spend LAYS (pourLaidFor — the book's one
    // reckoning, read here at its own door): 1 slot sought;
    // a gifted hand's spend lays more standing in the page
    // for the same 4 points, capped by the page's room.
    const laid = Math.max(1, Math.min(pourLaidFor(progress.classKey, spell.kind, 1), PAGE_SLOTS - totalNow));
    const spent = await spendAttunement(ownerKey, element, SLOT_COST);
    if (!spent.ok) badRequest(`Filling a ${element} slot costs ${SLOT_COST} ${element} points — your ${element} pool holds ${Math.floor(spent.held)}. Nothing was spent.`);
    let inElement = 0, total = totalNow;
    for (let i = 0; i < laid; i++) {
      const fill = await fillPageSlot(ownerKey, spellKey, element);
      inElement = fill.inElement; total = fill.total;
    }
    const slots = await pageAttunementsFor(ownerKey);
    return { ok: true as const, spellKey, element, spent: SLOT_COST, laid, inElement, filled: total, slots: slots[spellKey] ?? {} };
  },

  /** THE PARTY, READ (Nigel, 2026-10-20; built 2026-10-21):
   *  who stands in the Tender's party, how wide it may stand,
   *  and the deck the open spots are filled from. */
  async getParty(_args: unknown, ctx?: ActionContext) {
    if (!ctx?.tender) badRequest("Log in first.");
    return partyViewFor(ownerKeyFor(ctx));
  },

  /** FILL AN OPEN SPOT FROM THE DECK (the same ruling):
   *  clicking an open party spot on the Zodiac adds an Awokin
   *  from the full deck list. MEMBERSHIP ONLY — the creature
   *  joins the party and so follows its Tender when it
   *  stands on a ground; fielding it still happens through
   *  the summon and deploy roads, as it always has. On the
   *  homeland the fill is immediate (no timer was ever named
   *  at home).
   *
   *  MID-BATTLE (the wheel law, Nigel 2026-10-21 16:26 —
   *  superseding build 2's mid-battle pencil): the fill
   *  lands the membership AT ONCE, even while a battle stands
   *  at this Tender's Table seat. The four-minute
   *  reinforcements road build 2 sent mid-battle fills down
   *  was the deck hand's choosing machinery, and the hand is
   *  retired: there is no road, no road price, and no
   *  reservation — the member stands in the party from this
   *  moment, and the wheel's summon cast at the Table is the
   *  only gate between the party and the field. This door IS
   *  the fill's choosing place — the deck screen, reached by
   *  tapping an empty Awokin spot on the Zodiac (Nigel,
   *  2026-10-21). */
  async addToParty(args: unknown, ctx?: ActionContext) {
    if (!ctx?.tender) badRequest("Log in first.");
    const parsed = z.object({ awakenedId: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Name the Awokin to add to your party.");
    const ownerKey = ownerKeyFor(ctx);
    const progress = await getTenderProgress(ownerKey);
    const r = tryAddPartyMember(ownerKey, parsed.data.awakenedId, progress.level);
    if (!r.ok) badRequest(r.reason);
    return partyViewFor(ownerKey);
  },

  /** CALL A REINFORCEMENT ON THE HOMELAND (Nigel, 2026-10-23
   *  07:21–07:25 — Recovery R6): the homeland wheel names a
   *  deck Awoken outside the party and calls it in. ON THE
   *  HOMELAND REINFORCEMENTS ARE INSTANT — no road, no road
   *  price: the membership lands at once, exactly as the
   *  homeland's fill has always landed, and the called
   *  Awoken stands in the party (and so in the wheel's
   *  summon company) from this moment; the summon cast is
   *  then the only gate to the field. What this door adds
   *  over addToParty is the NAMING, not the landing: the
   *  wheel's deck (reinforcementDeckFor) is what may be
   *  named — an Awoken kept at a post (fielded, staged,
   *  court-housed, re-coalescing) is refused plainly, as the
   *  Table's door refuses it. The party cap is the party
   *  module's own, unchanged. */
  async callReinforcement(args: unknown, ctx?: ActionContext) {
    if (!ctx?.tender) badRequest("Log in first.");
    const parsed = z.object({ awakenedId: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Name the Awokin to call in.");
    const ownerKey = ownerKeyFor(ctx);
    const awakenedId = parsed.data.awakenedId;
    const row = sqlite.prepare("SELECT name FROM awakened WHERE id = ? AND owner_key = ?").get(awakenedId, ownerKey) as { name: string } | undefined;
    if (!row) badRequest("That Awokin is not in your deck.");
    if (isPartyMember(ownerKey, awakenedId)) {
      badRequest(`${row.name} already stands in your party — the wheel's summon cast calls it to the field.`);
    }
    const deck = await reinforcementDeckFor(ownerKey);
    if (!deck.some(d => d.awakenedId === awakenedId)) {
      badRequest(`${row.name} cannot be called in — it already stands somewhere the call cannot reach past (on your field, staged at the bastion, housed in your court, or still re-coalescing).`);
    }
    const progress = await getTenderProgress(ownerKey);
    const r = tryAddPartyMember(ownerKey, awakenedId, progress.level);
    if (!r.ok) badRequest(r.reason);
    return { ...(await partyViewFor(ownerKey)), reinforcement: { awakenedId, name: row.name, instant: true as const } };
  },

  /** RETURN A MEMBER TO THE DECK (the Keeper's pencil,
   *  standing until Nigel rules otherwise): benching is free
   *  whenever the Tender is not mid-battle — and REFUSED,
   *  plainly, while one stands (build 2, 2026-10-21: the
   *  pencil's other half — a party standing in a running
   *  battle is not benched out from under it, and benching
   *  is no road OUT; the order roads, which end a membership
   *  by ordering the creature itself, are untouched by this
   *  refusal, exactly as build 1 left them; the wheel law
   *  retired the road IN, not this refusal — its rationale
   *  was never the road). This door is the Zodiac's own —
   *  it changes membership only, and it does not lift a
   *  follow order the creature stands under on a field —
   *  follow is each ground's own switch, as it was before
   *  the party. */
  async removeFromParty(args: unknown, ctx?: ActionContext) {
    if (!ctx?.tender) badRequest("Log in first.");
    const parsed = z.object({ awakenedId: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Name the Awokin to return to the deck.");
    const ownerKey = ownerKeyFor(ctx);
    if (partyBattleSeatFor(ownerKey)) {
      badRequest("Your party stands in a running battle at the Table — no member is returned to the deck until the battle ends. Benching is free between battles; mid-battle, only an order given to the creature itself ends its standing.");
    }
    removePartyMember(ownerKey, parsed.data.awakenedId);
    return partyViewFor(ownerKey);
  },

  /** ADD FROM THE FIELD — THE HOMELAND ROAD: the Awokin
   *  must stand on the Tender's own field to be named here
   *  at all; the joining itself is the party module's, and
   *  under the join law (Nigel, 2026-10-23 — "if a member
   *  is on the field when they join party take them off of
   *  the field") the join takes it OFF the field: the
   *  placement is deleted as part of the join, it comes
   *  home to the party, and it stands callable for
   *  summoning. This supersedes the older follow ruling
   *  (the placement's follow flag is no longer set — there
   *  is no placement left to set it on). */
  async addFieldToParty(args: unknown, ctx?: ActionContext) {
    if (!ctx?.tender) badRequest("Log in first.");
    const parsed = z.object({ awakenedId: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Name the Awokin to add to your party.");
    const ownerKey = ownerKeyFor(ctx);
    const rows = await db.select().from(schema.fieldPlacements)
      .where(and(eq(schema.fieldPlacements.awakenedId, parsed.data.awakenedId), eq(schema.fieldPlacements.ownerKey, ownerKey))).limit(1);
    const placement = rows[0] as any;
    if (!placement) badRequest("That Awokin does not stand on your field.");
    const progress = await getTenderProgress(ownerKey);
    const r = tryAddPartyMember(ownerKey, parsed.data.awakenedId, progress.level);
    if (!r.ok) badRequest(r.reason);
    return { ...(await partyViewFor(ownerKey)), cameOffField: r.cameOffField };
  },

  async uploadGrimoireGlyph(args: unknown) {
    const parsed = z.object({
      name: z.string().min(1).max(80),
      imageBase64: z.string().min(100).max(16_000_000),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid glyph upload.");
    const bytes = Buffer.from(parsed.data.imageBase64, "base64");
    assertPngBytes(bytes);
    const state = await refreshGrimoire();
    const id = `glyph-${randomUUID().slice(0, 8)}`;
    const blobKey = `grimoire-glyph/${id}.png`;
    blobs.put(blobKey, bytes, "image/png");
    state.glyphs.push({
      id, name: parsed.data.name, assetKey: null,
      imageUrl: blobUrl(blobKey), sort: "unsorted", spellKey: null, builtin: false,
    });
    await saveGrimoire(state);
    return state;
  },

  async setGlyphSort(args: unknown) {
    const parsed = z.object({
      glyphId: z.string().min(1).max(80),
      sort: z.enum(["ward", "rune", "binding", "spell", "unsorted"]),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid glyph sort.");
    const state = await refreshGrimoire();
    const glyph = state.glyphs.find((g) => g.id === parsed.data.glyphId);
    if (!glyph) badRequest("That glyph is not in the book.");
    glyph.sort = parsed.data.sort;
    await saveGrimoire(state);
    return state;
  },

  async setGlyphSpell(args: unknown) {
    const parsed = z.object({
      glyphId: z.string().min(1).max(80),
      spellKey: z.string().max(80).nullable(),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid glyph assignment.");
    const state = await refreshGrimoire();
    const glyph = state.glyphs.find((g) => g.id === parsed.data.glyphId);
    if (!glyph) badRequest("That glyph is not in the book.");
    const spell = parsed.data.spellKey
      ? state.spells.find((s) => s.key === parsed.data.spellKey)
      : null;
    if (parsed.data.spellKey && !spell) badRequest("That spell is not in the book.");
    // One display glyph per spell: the previous bearer steps back.
    if (spell && spell.glyphId && spell.glyphId !== glyph.id) {
      const prev = state.glyphs.find((g) => g.id === spell.glyphId);
      if (prev && prev.spellKey === spell.key) prev.spellKey = null;
    }
    // If this glyph was another spell's face, that spell loses it.
    if (glyph.spellKey && glyph.spellKey !== parsed.data.spellKey) {
      const old = state.spells.find((s) => s.key === glyph.spellKey);
      if (old && old.glyphId === glyph.id) old.glyphId = null;
    }
    glyph.spellKey = parsed.data.spellKey;
    if (spell) spell.glyphId = glyph.id;
    await saveGrimoire(state);
    return state;
  },

  async deleteGrimoireGlyph(args: unknown) {
    const parsed = z.object({ glyphId: z.string().min(1).max(80) }).safeParse(args);
    if (!parsed.success) badRequest("Invalid glyph delete.");
    const state = await refreshGrimoire();
    const glyph = state.glyphs.find((g) => g.id === parsed.data.glyphId);
    if (!glyph) badRequest("That glyph is not in the book.");
    if (glyph.builtin) badRequest("The Written Light's own glyphs cannot be torn out — reassign or re-sort them instead.");
    for (const s of state.spells) if (s.glyphId === glyph.id) s.glyphId = null;
    state.glyphs = state.glyphs.filter((g) => g.id !== glyph.id);
    await saveGrimoire(state);
    return state;
  },

  async upsertGrimoireSpell(args: unknown) {
    const parsed = z.object({
      spell: z.object({
        key: z.string().max(80).optional(),
        name: z.string().min(1).max(120),
        kind: z.enum(["ward", "rune", "binding", "spell"]),
        engine: z.string().max(40),
        glyphId: z.string().max(80).nullable().optional(),
        cost: z.number().int().min(0).max(99),
        blurb: z.string().max(600).default(""),
        numbers: z.record(z.string(), z.number().min(0).max(999)).default({}),
        forms: z.record(z.string(), z.string().max(120)).default({}),
      }),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid spell.");
    const incoming = parsed.data.spell;
    if (!ENGINE_KEYS.includes(incoming.engine) && incoming.engine !== "none") {
      badRequest("That engine is not one the world knows.");
    }
    const state: GrimoireState = await refreshGrimoire();
    let key = incoming.key ?? "";
    let existing: GrimoireSpell | undefined = key
      ? state.spells.find((s) => s.key === key)
      : undefined;
    if (!existing) {
      const base = incoming.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "spell";
      key = base;
      let n = 2;
      while (state.spells.some((s) => s.key === key)) key = `${base}-${n++}`;
    }
    const spell: GrimoireSpell = {
      key,
      name: incoming.name,
      kind: incoming.kind,
      engine: incoming.engine,
      glyphId: incoming.glyphId ?? existing?.glyphId ?? null,
      cost: incoming.cost,
      blurb: incoming.blurb,
      numbers: incoming.numbers,
      forms: incoming.forms,
      builtin: existing?.builtin ?? false,
    };
    if (existing) Object.assign(existing, spell);
    else state.spells.push(spell);
    // Keep the glyph assignment mirror true both ways.
    for (const g of state.glyphs) {
      if (g.spellKey === key && g.id !== spell.glyphId) g.spellKey = null;
      if (spell.glyphId && g.id === spell.glyphId) g.spellKey = key;
    }
    await saveGrimoire(state);
    return state;
  },

  async deleteGrimoireSpell(args: unknown) {
    const parsed = z.object({ key: z.string().min(1).max(80) }).safeParse(args);
    if (!parsed.success) badRequest("Invalid spell delete.");
    const state = await refreshGrimoire();
    if (!state.spells.some((s) => s.key === parsed.data.key)) badRequest("That spell is not in the book.");
    state.spells = state.spells.filter((s) => s.key !== parsed.data.key);
    for (const g of state.glyphs) if (g.spellKey === parsed.data.key) g.spellKey = null;
    await saveGrimoire(state);
    return state;
  },

  // The Monsters Compendium — the game's living copy of the Atelier's
  // roll (see the seed note above COMPENDIUM_SEED). Public read, like
  // listUiSprites; the writes are workshop-gated in index.ts. Sprites
  // resolve client-side through the ui_sprites slots (an entry's
  // slotKey) and getEnemyArt (the canon four) — never stored here.
  //
  // THE CONNECTION (Nigel, 2026-10-16: "i want the app and the workshop
  // connected"): the Compendium APP is the roll of record. The game
  // server cannot reach the app on its own — the app's actions run
  // through the Keeper's runtime and expose no endpoint the game could
  // poll — so the Keeper is the wire: on Nigel's word ("sync the
  // compendium", here or in the Atelier) the Keeper reads the app's
  // current roll and hands it to importCompendium below, which
  // reconciles this copy to the app's exactly and stamps the sync.
  // The app wins: entries edited only here are overwritten by a sync,
  // and entries the app no longer holds are removed here.
  async getCompendium() {
    await ensureCompendiumSeeded();
    const rows = await db.select().from(schema.compendiumEntries);
    // The class list (blurbs + order) travels with a sync; until the
    // first sync, the founding roll's own meta stands in.
    let storedClasses: { name: string; blurb: string; order: number }[] | null = null;
    const [clsRow] = await db.select().from(schema.uiConfig)
      .where(eq(schema.uiConfig.key, "compendium.classes")).limit(1);
    if (clsRow) { try { storedClasses = JSON.parse(clsRow.value); } catch {} }
    const classNames = [...new Set(rows.map(r => r.className))];
    const classes = classNames
      .map(name => {
        const stored = storedClasses?.find(c => c.name === name);
        return {
          name,
          blurb: stored?.blurb ?? COMPENDIUM_CLASS_META[name]?.blurb ?? "",
          order: stored?.order ?? COMPENDIUM_CLASS_META[name]?.order ?? 900,
        };
      })
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    const orderOf = new Map(classes.map(c => [c.name, c.order]));
    const entries = [...rows].sort((a, b) =>
      (orderOf.get(a.className) ?? 900) - (orderOf.get(b.className) ?? 900)
      || a.sortOrder - b.sortOrder
      || a.id - b.id);
    let lastSync: unknown = null;
    const [syncRow] = await db.select().from(schema.uiConfig)
      .where(eq(schema.uiConfig.key, "compendium.lastSync")).limit(1);
    if (syncRow) { try { lastSync = JSON.parse(syncRow.value); } catch {} }
    return { classes, entries, lastSync };
  },

  /** One sync of the Compendium, handed in by the Keeper from the app
   *  (see the connection note above getCompendium). A COMPLETE payload
   *  reconciles exactly: matched by (class, name) — updated in place,
   *  new entries added, entries the app no longer holds removed. The
   *  class list and the sync stamp are stored alongside. Idempotent:
   *  syncing an unchanged roll changes nothing. */
  async importCompendium(args: unknown, ctx?: ActionContext) {
    const parsed = z.object({
      complete: z.literal(true),
      classes: z.array(z.object({
        name: z.string().min(1).max(80),
        blurb: z.string().max(500).default(""),
        order: z.number().int().min(0).max(9999),
      })).max(100),
      entries: z.array(compendiumEntryShape).max(500),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid compendium sync payload.");
    await ensureCompendiumSeeded();
    const { classes, entries } = parsed.data;
    const keyOf = (className: string, name: string) => `${className}::${name}`;
    const existing = await db.select().from(schema.compendiumEntries);
    const byKey = new Map(existing.map(e => [keyOf(e.className, e.name), e]));
    let added = 0, updated = 0, removed = 0;
    const seen = new Set<string>();
    for (const entry of entries) {
      const key = keyOf(entry.className, entry.name);
      seen.add(key);
      const current = byKey.get(key);
      if (!current) {
        await db.insert(schema.compendiumEntries).values({ ...entry });
        added++;
      } else {
        const changed = current.status !== entry.status
          || current.power !== entry.power || current.hp !== entry.hp
          || current.story !== entry.story || current.typeNote !== entry.typeNote
          || current.layers !== entry.layers || current.motion !== entry.motion
          || current.slotKey !== entry.slotKey || current.sortOrder !== entry.sortOrder;
        if (changed) {
          await db.update(schema.compendiumEntries)
            .set({ ...entry, updatedAt: new Date() })
            .where(eq(schema.compendiumEntries.id, current.id));
          updated++;
        }
      }
    }
    for (const e of existing) {
      if (!seen.has(keyOf(e.className, e.name))) {
        await db.delete(schema.compendiumEntries).where(eq(schema.compendiumEntries.id, e.id));
        removed++;
      }
    }
    const stamp = { at: new Date().toISOString(), added, updated, removed, total: entries.length };
    for (const [key, value] of [
      ["compendium.classes", JSON.stringify(classes)],
      ["compendium.lastSync", JSON.stringify(stamp)],
    ] as const) {
      await db.insert(schema.uiConfig)
        .values({ key, value })
        .onConflictDoUpdate({ target: schema.uiConfig.key, set: { value } });
    }
    return { ok: true, ...stamp };
  },

  async addCompendiumEntry(args: unknown, ctx?: ActionContext) {
    const parsed = compendiumEntryShape.safeParse(args);
    if (!parsed.success) badRequest("Invalid compendium entry.");
    await ensureCompendiumSeeded();
    const [entry] = await db.insert(schema.compendiumEntries).values({ ...parsed.data }).returning();
    return { ok: true, entry };
  },

  async updateCompendiumEntry(args: unknown, ctx?: ActionContext) {
    const parsed = compendiumEntryShape.extend({ id: z.number().int() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid compendium entry.");
    const { id, ...fields } = parsed.data;
    const [entry] = await db.update(schema.compendiumEntries)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(schema.compendiumEntries.id, id))
      .returning();
    if (!entry) badRequest("No such compendium entry.");
    return { ok: true, entry };
  },

  async deleteCompendiumEntry(args: unknown, ctx?: ActionContext) {
    const parsed = z.object({ id: z.number().int() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid.");
    await db.delete(schema.compendiumEntries).where(eq(schema.compendiumEntries.id, parsed.data.id));
    return { ok: true };
  },

  async getGameConfig() {
    return loadGameConfig();
  },

  async getUiConfig(args: unknown, ctx?: ActionContext) {
    const rows = await db.select().from(schema.uiConfig);
    const config: Record<string, any> = {};
    for (const r of rows) {
      try { config[r.key] = JSON.parse(r.value); } catch {}
    }
    return { config };
  },

  async setUiConfig(args: unknown, ctx?: ActionContext) {
    const parsed = z.object({
      key: z.string().min(1).max(100),
      value: z.any(),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid.");
    await db.insert(schema.uiConfig)
      .values({ key: parsed.data.key, value: JSON.stringify(parsed.data.value) })
      .onConflictDoUpdate({ target: schema.uiConfig.key, set: { value: JSON.stringify(parsed.data.value) } });
    return { ok: true };
  },

  /** The UI theme (currently: the canonical element palette). Public read —
   *  every face of the app renders element colors from it on boot. */
  async getUITheme(args: unknown, ctx?: ActionContext) {
    return { ok: true, theme: await loadUITheme() };
  },

  /** Persist element palette tweaks from the UI Workspace. Workshop-gated
   *  in index.ts, like setUiConfig. Partial payloads merge over the stored
   *  theme (and the scheme defaults beneath it); colors must be #rrggbb. */
  async updateUITheme(args: unknown, ctx?: ActionContext) {
    const hex = z.string().regex(HEX_COLOR);
    const parsed = z.object({
      elementColors: z.object({
        root: hex.optional(),
        tide: hex.optional(),
        sky: hex.optional(),
        stone: hex.optional(),
        fire: hex.optional(),
      }).optional(),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid theme colors.");
    const theme = await loadUITheme();
    const incoming = parsed.data.elementColors ?? {};
    for (const key of ELEMENT_COLOR_KEYS) {
      const v = incoming[key];
      if (typeof v === "string") theme.elementColors[key] = v.toLowerCase();
    }
    await db.insert(schema.uiConfig)
      .values({ key: "uiTheme", value: JSON.stringify(theme) })
      .onConflictDoUpdate({ target: schema.uiConfig.key, set: { value: JSON.stringify(theme) } });
    return { ok: true, theme };
  },

  async harvestWheat(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ buildingId: z.number().int() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid.");
    const HARVESTABLE = ["dream-wheat", "dream-weed", "sky-bloom"];
    const [building] = await db.select().from(schema.territoryBuildings)
      .where(and(
        eq(schema.territoryBuildings.id, parsed.data.buildingId),
        eq(schema.territoryBuildings.ownerKey, ownerKey),
        eq(schema.territoryBuildings.status, "active"),
      )).limit(1);
    if (!building || !HARVESTABLE.includes(building.buildingType)) badRequest("Not harvestable.");
    const gameConfig = await loadGameConfig();
    const def: any = gameConfig.buildings[building.buildingType] || {};
    const harvestEnergy = def.harvestEnergy ?? 4;
    const growHours = def.growHours ?? 4;
    // PLANT GROWTH (Recovery #1): the crop's regrowth runs
    // faster by the holder's plant-growth sum — the same
    // clause that swells the trays' growth under a press.
    const growMs = (growHours * 60 * 60 * 1000) / (1 + fxSum(ownerKey, "plantGrowth") / 100);
    const lastHarvest = building.lastHarvestAt ? new Date(building.lastHarvestAt).getTime()
      : building.readyAt ? new Date(building.readyAt).getTime() : Date.now();
    if (Date.now() - lastHarvest < growMs) badRequest("Not ready yet.");
    // Give energy
    const maxEnergy = await calculateMaxEnergy(ownerKey);
    const res = await db.select().from(schema.tenderResources)
      .where(eq(schema.tenderResources.ownerKey, ownerKey)).limit(1);
    const current = res.length ? res[0].energy : 0;
    await db.update(schema.tenderResources)
      .set({ energy: Math.min(current + harvestEnergy, maxEnergy) })
      .where(eq(schema.tenderResources.ownerKey, ownerKey));
    // Reset growth timer
    await db.update(schema.territoryBuildings)
      .set({ lastHarvestAt: new Date() })
      .where(eq(schema.territoryBuildings.id, building.id));
    return { ok: true, energyGained: harvestEnergy };
  },

  async adminClearTimers(args: unknown, ctx?: ActionContext) {
    // TODO: verify admin workshop password
    const parsed = z.object({ ownerKey: z.string() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    const targetKey = parsed.data.ownerKey;
    await db.update(schema.awakened)
      .set({ dispersedUntil: null })
      .where(eq(schema.awakened.ownerKey, targetKey));
    await db.update(schema.territoryTiles)
      .set({ lastPassiveAt: null })
      .where(eq(schema.territoryTiles.ownerKey, targetKey));
    return { ok: true };
  },

  // -- The Ancient Creator's gifts ------------------------------------------
  // Nigel's reward system: +1 wake to a Tender (one press per wake), wake
  // gift codes for like-and-share rewards, and random elemental attunement
  // points. Every grant records a creator_gifts row so the Tender sees
  // "...another seed grows" on their next visit.

  /** Gift one wake to a Tender — The Ancient Creator's reward button. */
  async adminGiftWake(args: unknown, ctx?: ActionContext) {
    // TODO: verify admin workshop password
    const parsed = z.object({ ownerKey: z.string().min(1) }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    await tenderForOwnerKey(parsed.data.ownerKey);
    const balance = await grantCredits(parsed.data.ownerKey, 1, "creator_gift");
    await recordCreatorGift(parsed.data.ownerKey, "button");
    return { ok: true as const, balance };
  },

  /** Mint single-use wake gift codes (The Ancient Creator hands them out). */
  async adminMintWakeCodes(args: unknown, ctx?: ActionContext) {
    // TODO: verify admin workshop password
    const parsed = z.object({ count: z.number().int().min(1).max(20).default(1) }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no lookalikes
    const segment = () => {
      const bytes = randomBytes(4);
      return Array.from(bytes).map((b) => alphabet[b % alphabet.length]).join("");
    };
    const codes: string[] = [];
    for (let i = 0; i < parsed.data.count; i++) {
      // Retry on primary-key collision (astronomically unlikely, but safe).
      for (let attempt = 0; attempt < 10; attempt++) {
        const code = `WAKE-${segment()}-${segment()}`;
        try {
          await db.insert(schema.wakeCodes).values({ code });
          codes.push(code);
          break;
        } catch {
          // Collision — roll again.
        }
        if (attempt === 9) badRequest("The codes would not gather — try fewer at once.");
      }
    }
    return { ok: true as const, codes };
  },

  /** List wake gift codes, newest first — The Ancient Creator's ledger view. */
  async adminListWakeCodes(args: unknown, ctx?: ActionContext) {
    // TODO: verify admin workshop password
    const rows = await db.select().from(schema.wakeCodes)
      .orderBy(desc(schema.wakeCodes.createdAt)).limit(100);
    const tenderRows = await db.select().from(schema.tenders);
    const nameByKey = new Map<string, string>();
    for (const t of tenderRows) nameByKey.set(tenderOwnerKey(t.id), t.tenderName ?? t.code);
    return {
      codes: rows.map((row) => {
        const status = row.redeemedBy ? "redeemed" : row.revoked ? "revoked" : "unused";
        return {
          code: row.code,
          createdAt: row.createdAt.toISOString(),
          status: status as "unused" | "redeemed" | "revoked",
          redeemedByName: row.redeemedBy ? nameByKey.get(row.redeemedBy) ?? row.redeemedBy : null,
          redeemedAt: row.redeemedAt ? row.redeemedAt.toISOString() : null,
        };
      }),
    };
  },

  /** Revoke an unused wake gift code (redeemed codes are beyond revocation). */
  async adminRevokeWakeCode(args: unknown, ctx?: ActionContext) {
    // TODO: verify admin workshop password
    const parsed = z.object({ code: z.string().trim().min(1).max(32) }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    const code = parsed.data.code.toUpperCase();
    const rows = await db.select().from(schema.wakeCodes)
      .where(eq(schema.wakeCodes.code, code)).limit(1);
    if (!rows.length) badRequest("That code could not be found.");
    if (rows[0].redeemedBy) badRequest("That code has already been redeemed — it cannot be revoked.");
    if (!rows[0].revoked) {
      await db.update(schema.wakeCodes)
        .set({ revoked: 1 })
        .where(eq(schema.wakeCodes.code, code));
    }
    return { ok: true as const };
  },

  /** Grant random elemental attunement points — The Ancient Creator's hand. */
  async adminGrantAspectPoints(args: unknown, ctx?: ActionContext) {
    // TODO: verify admin workshop password
    const parsed = z.object({
      ownerKey: z.string().min(1),
      count: z.number().int().min(1).max(50),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    await tenderForOwnerKey(parsed.data.ownerKey);
    const ownerKey = parsed.data.ownerKey;
    const granted: Record<AspectElement, number> = { tide: 0, sky: 0, stone: 0, root: 0 };
    const spawned: Record<AspectElement, number> = { tide: 0, sky: 0, stone: 0, root: 0 };
    for (let i = 0; i < parsed.data.count; i++) {
      const elements: AspectElement[] = ["tide", "sky", "stone", "root"];
      const element = elements[Math.floor(Math.random() * elements.length)];
      granted[element] += 1;
      if (await addAspectPoint(ownerKey, element)) spawned[element] += 1;
    }
    await recordCreatorGift(ownerKey, "aspect");
    return { ok: true as const, granted, spawned };
  },

  /** Redeem a wake gift code from The Ancient Creator (+1 wake, once ever). */
  async redeemWakeCode(args: unknown, ctx?: ActionContext) {
    if (!ctx?.tender) badRequest("Claim your secret code and sign in as a Tender to redeem a gift code.");
    const parsed = z.object({ code: z.string().trim().min(1).max(32) }).safeParse(args);
    if (!parsed.success) badRequest("That gift code doesn't look right — check it and try again.");
    const code = parsed.data.code.toUpperCase();
    const ownerKey = tenderOwnerKey(ctx.tender.id);
    // Atomic claim: only one Tender can ever win this row.
    const claim = sqlite
      .prepare(`UPDATE wake_codes SET redeemed_by = ?, redeemed_at = ? WHERE code = ? AND redeemed_by IS NULL AND revoked = 0`)
      .run(ownerKey, Date.now(), code);
    if (claim.changes !== 1) {
      const rows = await db.select().from(schema.wakeCodes)
        .where(eq(schema.wakeCodes.code, code)).limit(1);
      if (!rows.length) badRequest("That gift code doesn't exist — check it and try again.");
      if (rows[0].revoked) badRequest("That gift code is no longer valid.");
      badRequest("That gift code has already been redeemed.");
    }
    const balance = await grantCredits(ownerKey, 1, "creator_gift_code", code);
    await recordCreatorGift(ownerKey, "code");
    return { ok: true as const, balance };
  },

  /** Acknowledge The Ancient Creator's gifts (hides the reinforcement notice). */
  async ackCreatorGifts(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    await db.update(schema.creatorGifts)
      .set({ seenAt: new Date() })
      .where(and(eq(schema.creatorGifts.ownerKey, ownerKey), isNull(schema.creatorGifts.seenAt)));
    return { ok: true as const };
  },


  // Battle tracks: workshop management (Nigel only).
  async listBattleTracks() {
    const tracks = await db.select().from(schema.battleTracks).orderBy(asc(schema.battleTracks.id));
    return { tracks: tracks.map(t => ({ id: t.id, name: t.name, enabled: !!t.enabled, pages: JSON.parse(t.pages || '["territory"]') })) };
  },

  async updateTrackPages(args: unknown) {
    const parsed = z.object({
      id: z.number().int().positive(),
      pages: z.array(z.enum(["territory", "tender", "workshop", "battle"])),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid pages.");
    await db.update(schema.battleTracks)
      .set({ pages: JSON.stringify(parsed.data.pages) })
      .where(eq(schema.battleTracks.id, parsed.data.id));
    return { ok: true as const };
  },

  async getBattleTrack(args: unknown) {
    const parsed = z.object({ id: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid track.");
    const track = await db.select().from(schema.battleTracks)
      .where(eq(schema.battleTracks.id, parsed.data.id)).limit(1);
    if (!track.length) badRequest("Track not found.");
    return { id: track[0].id, name: track[0].name, trackData: track[0].trackData };
  },

  async getRandomBattleTrack() {
    const tracks = await db.select().from(schema.battleTracks)
      .where(eq(schema.battleTracks.enabled, 1));
    if (!tracks.length) return { track: null };
    const pick = tracks[Math.floor(Math.random() * tracks.length)];
    return { track: { id: pick.id, name: pick.name, trackData: pick.trackData } };
  },

  async addBattleTrack(args: unknown, ctx?: ActionContext) {
    // TODO: verify workshop password
    const parsed = z.object({
      name: z.string().min(1).max(100),
      trackData: z.string().min(1),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid track.");
    const [row] = await db.insert(schema.battleTracks).values({
      name: parsed.data.name,
      trackData: parsed.data.trackData,
    }).returning();
    return { id: row.id };
  },

  async toggleBattleTrack(args: unknown, ctx?: ActionContext) {
    // TODO: verify workshop password
    const parsed = z.object({ id: z.number().int().positive(), enabled: z.boolean() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    await db.update(schema.battleTracks)
      .set({ enabled: parsed.data.enabled ? 1 : 0 })
      .where(eq(schema.battleTracks.id, parsed.data.id));
    return { ok: true };
  },

  async deleteBattleTrack(args: unknown, ctx?: ActionContext) {
    // TODO: verify workshop password
    const parsed = z.object({ id: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    await db.delete(schema.battleTracks).where(eq(schema.battleTracks.id, parsed.data.id));
    return { ok: true };
  },


  // Resolve an interactive battleground battle. Client reports the outcome,
  // server validates plausibility and applies territory changes.
  async resolveBattle(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    await this.settleMarches(ownerKey);
    const parsed = z.object({
      victory: z.boolean(),
      waveNumber: z.number().int().positive(),
      survivorIds: z.array(z.number().int().positive()),
      continueWave: z.boolean().optional(),
      targetTileId: z.number().int().positive().optional(),
      wallState: z.array(z.object({ edgeKey: z.string(), hp: z.number() })).optional(),
      runesTriggered: z.array(z.string()).optional(),
      grimState: z.array(z.object({
        id: z.number().int().positive(),
        hp: z.number().optional(), stops: z.number().optional(), charges: z.number().optional(),
        spent: z.boolean().optional(),
      })).optional(),
      grimEnergy: z.number().int().min(0).max(500).optional(),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid battle result.");

    // Validate: wave number must match current
    let state = await db.select().from(schema.waveState)
      .where(eq(schema.waveState.ownerKey, ownerKey)).limit(1);
    if (!state.length) {
      const [row] = await db.insert(schema.waveState).values({ ownerKey }).returning();
      state = [row];
    }
    const currentWave = state[0].waveNumber;
    if (parsed.data.waveNumber !== currentWave) badRequest("Unraveling mismatch.");

    // Verified resolution (War-Ground fix, Nigel's word 2026-10-15 — the
    // main loop reports here, and the server reckons the report before
    // anything is paid):
    // 1. The recovery clock is enforced at resolution, not only stamped:
    //    no battle can have been fought while the Unraveling was still
    //    gathering, so no resolution is accepted in that window.
    const nextWaveAt = nextWaveAtFor(state[0]);
    if (nextWaveAt) {
      badRequest(`The Unraveling is still gathering itself — the next Unraveling can be faced at ${nextWaveAt}.`);
    }
    // 2. The wave's composition is recomputed server-side from the single
    //    source of truth; the client's numbers are never consulted. The
    //    sky it is recomputed under is the LIVE sky at this moment
    //    (Weather's ruling: no snapshot — a storm that began mid-battle
    //    has already surged into this reckoning, and one that spent
    //    itself mid-battle has already lifted from it).
    const { mood } = await getWorldMood();
    const { totalPower: wavePower } = wavePowerFor(currentWave, mood);
    // 3. Survivors are checked against the committed company: Awoken the
    //    tender owns, placed on the field in attack or defense stance —
    //    the fighters who can actually stand in this battle. A fighter
    //    the server's own per-hit damage already dissipated mid-battle is
    //    no longer placed, and cannot be reported as a survivor.
    const survivorIds = [...new Set(parsed.data.survivorIds)];
    const placements = await db.select().from(schema.fieldPlacements)
      .where(eq(schema.fieldPlacements.ownerKey, ownerKey));
    const fighterIds = new Set(
      placements
        .filter(p => p.stance === "attack" || p.stance === "defense")
        .map(p => p.awakenedId)
    );
    for (const id of survivorIds) {
      if (!fighterIds.has(id)) badRequest("Invalid survivor.");
    }
    // 4. A victory must be claimable by the force that was committed:
    //    at least one survivor, and the company's combined power —
    //    measured server-side from the Awoken's true payloads, the same
    //    arithmetic as every claim path and defendWave — must match the
    //    Unraveling's recomputed power. Tactics, towers and thorns are
    //    the edge that lets a matching force hold; a force that does not
    //    match it on paper cannot claim to have broken it.
    let committedPower = 0;
    for (const id of fighterIds) {
      const payload = await awakenedPayloadById(id);
      committedPower += payload?.power ?? 0;
    }
    if (parsed.data.victory) {
      if (survivorIds.length === 0) badRequest("A victory with no survivors is no victory.");
      if (committedPower < wavePower) {
        badRequest(`The War-Ground does not reckon this victory — your committed company stands at ${committedPower} against the Unraveling's ${wavePower}.`);
      }
    }

    // The report is accepted — the walls took what they took during
    // the fight, win or lose (reported HP only ever lowers a wall).
    applyWallDamage(ownerKey, parsed.data.wallState);
    applyRunesTriggered(ownerKey, parsed.data.runesTriggered);
    await applyGrimoireState(ownerKey, parsed.data.grimState, parsed.data.grimEnergy);

    // Unified XP (Nigel, 2026-10-13): the survivors stood in the battle
    // defense — a DEFENSE EVENT, +10 XP each, win or lose. (The hits
    // they take inside the battleground also reach the server one by
    // one through damageAwokenHp, which pays its own defense XP; the
    // Awoken's attacks in the client simulation have no server-side
    // per-swing report, so no attack grant is invented here.)
    const xpById = new Map<number, XpGainReport>();
    for (const id of survivorIds) {
      await grantEventXp(xpById, id, XP_PER_DEFENSE);
    }

    let bonusEligible: { id: number; q: number; r: number }[] = [];
    if (parsed.data.victory) {
      // Wildfire: if the target was ignited, the fire purifies it
      if (parsed.data.targetTileId) {
        const target = await db.select().from(schema.territoryTiles)
          .where(and(
            eq(schema.territoryTiles.id, parsed.data.targetTileId),
            eq(schema.territoryTiles.ownerKey, ownerKey),
            eq(schema.territoryTiles.spark, 2),
          )).limit(1);
        if (target.length) {
          await db.update(schema.territoryTiles)
            .set({ cursed: 0, spark: 0, curseHp: null, curseMaxHp: null, hp: 10, ...PURIFIED_TILE_FIELDS })
            .where(eq(schema.territoryTiles.id, target[0].id));
        }
      }
      // Continue reward: +6 energy, server-side, one-time per victory
      if (parsed.data.continueWave) {
        const energyRes = await db.select().from(schema.tenderResources)
          .where(eq(schema.tenderResources.ownerKey, ownerKey)).limit(1);
        if (energyRes.length) {
          const maxEnergy = await calculateMaxEnergy(ownerKey);
          await db.update(schema.tenderResources)
            .set({ energy: Math.min(energyRes[0].energy + 6, maxEnergy), updatedAt: new Date() })
            .where(eq(schema.tenderResources.ownerKey, ownerKey));
        }
      }
      // Wave completion (Nigel's refinement, 2026-10-13): a completed
      // wave pays the HEX-TAKEN grant (+50) to ALL Awoken involved in
      // the resolution — every survivor the battle touched, not only
      // committed defenders.
      for (const id of survivorIds) {
        await grantEventXp(xpById, id, XP_PER_HEX_TAKEN);
      }
      // Deeds of victory (unchanged): the old 50 + 10×wave XP grant
      // that rode in this loop is abolished by the unified model —
      // event XP is granted above, and no deed was ever triggered BY
      // the grant itself (these recordDeed calls stand on their own),
      // so removing the grant loses no deed.
      for (const id of survivorIds) {
        await recordDeed(ownerKey, id, "wave_survived");
        await recordDeed(ownerKey, id, "battle_won");
      }
      const wavesDefeated = (state[0]?.wavesDefeated ?? 0) + 1;
      // Territory reward only every 3 waves — tender chooses from eligible tiles
      const grantTerritory = wavesDefeated % 3 === 0;
      if (grantTerritory) {
        // Eligible: cursed tiles adjacent to purified territory
        const allTiles = await db.select().from(schema.territoryTiles)
          .where(eq(schema.territoryTiles.ownerKey, ownerKey));
        const purified = new Set(allTiles.filter(t => !t.cursed).map(t => `${t.q},${t.r}`));
        const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
        for (const t of allTiles) {
          if (!t.cursed) continue;
          const adjacent = dirs.some(([dq, dr]) => purified.has(`${t.q + dq},${t.r + dr}`));
          if (adjacent) bonusEligible.push({ id: t.id, q: t.q, r: t.r });
        }
      }
      await db.update(schema.waveState)
        .set({
          waveNumber: currentWave + 1,
          wavesDefeated,
          lastWaveAt: new Date(),
          // A victory on the battleground path starts the same recovery
          // clock (fix list #4) — one ladder, one clock.
          lastVictoryAt: new Date(),
          // Quiet's tooth, same stamp as the defendWave path: the sky
          // at the victory sets the length of the hush that follows.
          recoveryMult: moodEffects(mood).waveRecoveryMult,
        })
        .where(eq(schema.waveState.ownerKey, ownerKey));
    } else {
      // Defeat: a border tile falls, Awoken disperse. Only the
      // bastion (center) is exempt, by its own law — no stance
      // shields a tile (binding shield struck, Nigel, 2026-10-16;
      // exemption deleted 2026-10-17).
      const purified = await db.select().from(schema.territoryTiles)
        .where(and(
          eq(schema.territoryTiles.ownerKey, ownerKey),
          eq(schema.territoryTiles.cursed, 0)
        ));
      const border = purified.filter(t => !(t.q === 0 && t.r === 0));
      if (border.length) {
        const victim = border[Math.floor(Math.random() * border.length)];
        const victims = await db.select({ awakenedId: schema.fieldPlacements.awakenedId })
          .from(schema.fieldPlacements)
          .where(eq(schema.fieldPlacements.tileId, victim.id));
        const dispersedUntil = new Date(Date.now() + 4 * 60 * 60 * 1000);
        // RETURN (the zodiac's clause, Recovery #1), as at
        // the tile-fall above: the first returnHome-many
        // victims return home whole — no timer written.
        let returnSaves = fxSum(ownerKey, "returnHome");
        for (const v of victims) {
          if (returnSaves > 0) returnSaves--;
          else await db.update(schema.awakened)
            .set({ dispersedUntil })
            .where(eq(schema.awakened.id, v.awakenedId));
          await db.delete(schema.fieldPlacements)
            .where(eq(schema.fieldPlacements.awakenedId, v.awakenedId));
        }
        // The curse is reborn under the live sky (thickening's tooth).
        const fallRing = Math.max(Math.abs(victim.q), Math.abs(victim.r), Math.abs(victim.q + victim.r));
        const fallHp = curseHpFor(fallRing, mood);
        await db.update(schema.territoryTiles)
          .set({ cursed: 1, curseHp: fallHp, curseMaxHp: fallHp, ...FALLEN_TILE_FIELDS })
          .where(eq(schema.territoryTiles.id, victim.id));
      }
      await db.update(schema.waveState)
        .set({ lastWaveAt: new Date() })
        .where(eq(schema.waveState.ownerKey, ownerKey));
    }

    return { ok: true, bonusEligible, xpGains: [...xpById.values()], committedPower, wavePower };
  },

  /** THE LIGHTHOUSE (Nigel, 2026-10-23, as amended 10:48):
   *  protection is OFF by default and lit only by the
   *  Tender's own hand on this switch. Lighting it takes
   *  hold at once: the standing dark is pushed back off the
   *  land (no bounty — peace, not victory), the wave
   *  intensity resets to 1 under the current reign, and the
   *  banked minutes begin to burn across the hours he is
   *  present (settleProtection reckons the burn; away hours
   *  burn nothing). Darkening it is always his to do. A
   *  light with no banked minutes behind it cannot be lit —
   *  kills buy the light. */
  async setLighthouse(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ lit: z.boolean() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid lighthouse switch.");
    const row = sqlite.prepare("SELECT protection_bank_ms AS bank FROM tender_progress WHERE owner_key = ?").get(ownerKey) as any;
    const now = Date.now();
    if (parsed.data.lit) {
      if (!row || Math.max(0, Number(row.bank) || 0) <= 0) {
        badRequest("The lighthouse stands dark for want of banked protection — kills buy the light. Fell the dark, and their minutes are yours to burn.");
      }
      sqlite.prepare("DELETE FROM homeland_wanderers WHERE owner_key = ?").run(ownerKey);
      sqlite.prepare("UPDATE tender_progress SET lighthouse_lit = 1, lighthouse_settled_at = ?, wave_intensity = 1, intensity_reign_mark = ? WHERE owner_key = ?")
        .run(now, weatherReignCount(), ownerKey);
    } else {
      sqlite.prepare("UPDATE tender_progress SET lighthouse_lit = 0, lighthouse_settled_at = ? WHERE owner_key = ?").run(now, ownerKey);
    }
    return z.object({ ok: z.literal(true), battle: z.object({ shadowMatter: z.number(), protectionBankMs: z.number(), lighthouseLit: z.boolean(), waveIntensity: z.number() }) }).parse({ ok: true, battle: await battleStateView(ownerKey) });
  },

  /** THE PACK (the drop table, ruled 2026-10-23; built
   *  2026-10-25): the item screen's read — every stack the
   *  Tender carries, named and counted. The territory read
   *  serves the same view; this action stands for the
   *  screen's own refreshes. */
  async getInventory(_args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    return { pack: inventoryView(ownerKey) };
  },

  /** Twenty rune shards turn into ONE attunement point,
   *  of an element the Tender chooses (ruled 2026-10-23
   *  09:13). The point pays through the pools' one writer,
   *  like every other gain — so it can birth an aspect at
   *  the threshold, as a drip can. */
  async convertRuneShards(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ element: z.enum(["root", "tide", "sky", "stone", "fire"]) }).safeParse(args);
    if (!parsed.success) badRequest("Name the element the point should carry.");
    if (!trySpendRuneShards(ownerKey)) {
      badRequest("Twenty rune shards turn into one point of attunement — your pack holds fewer. What the dark leaves behind will gather them.");
    }
    await addAspectPoints(ownerKey, parsed.data.element as AttunementElement, 1);
    return { ok: true as const, pack: inventoryView(ownerKey) };
  },

  async setStance(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      awakenedId: z.number().int().positive(),
      stance: z.enum(["attack", "defense", "binding"]),
      maxEnergy: z.number().int().min(1),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid stance.");
    // All stances cost 1 energy to enter.
    if (!(await spendEnergy(ownerKey, 1))) {
      badRequest("Not enough energy (need 1).");
    }
    // Verify the Awoken is on the field and owned by the Tender.
    const placement = await db.select().from(schema.fieldPlacements)
      .where(and(
        eq(schema.fieldPlacements.awakenedId, parsed.data.awakenedId),
        eq(schema.fieldPlacements.ownerKey, ownerKey)
      )).limit(1);
    if (!placement.length) badRequest("That Awokin is not on your field.");
    await db.update(schema.fieldPlacements)
      .set({
        stance: parsed.data.stance,
        stanceOrdered: 1, // an ORDERED stance (Nigel, 2026-10-23): unordered Awokin default to attack in the living battle
        lastBindingChargeAt: parsed.data.stance === "binding" ? new Date() : null,
      })
      .where(eq(schema.fieldPlacements.id, placement[0].id));
    return z.object({ ok: z.literal(true) }).parse({ ok: true });
  },

  async attackTile(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      awakenedId: z.number().int().positive(),
      tileId: z.number().int().positive(),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid attack.");
    if (!(await spendEnergy(ownerKey, 1))) {
      badRequest("Not enough energy (need 1).");
    }
    // The attacker must be on the field in attack stance.
    const placement = await db.select().from(schema.fieldPlacements)
      .where(and(
        eq(schema.fieldPlacements.awakenedId, parsed.data.awakenedId),
        eq(schema.fieldPlacements.ownerKey, ownerKey)
      )).limit(1);
    if (!placement.length) badRequest("That Awokin is not on your field.");
    if (placement[0].stance !== "attack") badRequest("Set attack stance first.");
    // The target must be a cursed tile owned by the Tender.
    const tile = await db.select().from(schema.territoryTiles)
      .where(and(
        eq(schema.territoryTiles.id, parsed.data.tileId),
        eq(schema.territoryTiles.ownerKey, ownerKey)
      )).limit(1);
    if (!tile.length) badRequest("That tile is not yours.");
    if (!tile[0].cursed) badRequest("That land is already pure.");
    // Target must be adjacent to the attacker's current tile.
    const fromTile = await db.select().from(schema.territoryTiles)
      .where(eq(schema.territoryTiles.id, placement[0].tileId)).limit(1);
    if (!fromTile.length) badRequest("Attacker has no ground.");
    const dq = Math.abs(tile[0].q - fromTile[0].q);
    const dr = Math.abs(tile[0].r - fromTile[0].r);
    const dist = Math.max(dq, dr, Math.abs((tile[0].q + tile[0].r) - (fromTile[0].q + fromTile[0].r)));
    if (dist !== 1) badRequest("Can only attack adjacent tiles.");
    // Power vs toughness: the attacker's power must meet the corruption.
    const owned = await db.select().from(schema.awakened)
      .where(and(
        eq(schema.awakened.collection, "tender"),
        or(eq(schema.awakened.ownerKey, ownerKey), isNull(schema.awakened.ownerKey))
      ));
    const attacker = owned.find(a => a.id === parsed.data.awakenedId);
    if (!attacker) badRequest("Attacker not found.");
    const assetRows = await db.select().from(schema.layerAssets);
    const assetStats = new Map<number, AssetStats>();
    for (const assetRow of assetRows) {
      const rarity = raritySchema.safeParse(assetRow.rarity);
      if (rarity.success) assetStats.set(assetRow.id, { name: assetRow.name, rarity: rarity.data, power: assetRow.power, toughness: assetRow.toughness, element: (assetRow as any).element ?? null });
    }
    const layers = parseLayers(attacker.compositionJson, assetStats);
    // True power from the payload — empowerment, story bonuses, aspect
    // bonuses and stat points all count, exactly as the card displays.
    const attackerPayload = await awakenedPayloadById(attacker.id);
    const power = attackerPayload?.power ?? layers.reduce((s, l) => s + (l.power ?? 0), 0);
    // HP system: each attack dwindles the curse HP by the attacker's power.
    // Initialize HP if missing (legacy tiles).
    const ring = Math.max(Math.abs(tile[0].q), Math.abs(tile[0].r), Math.abs(tile[0].q + tile[0].r));
    // A legacy tile with no stored curse HP is born now, under the
    // live sky (thickening's tooth reaches it too).
    const maxHp = tile[0].curseMaxHp ?? curseHpFor(ring, (await getWorldMood()).mood);
    const currentHp = tile[0].curseHp ?? maxHp;
    // Unified XP (Nigel, 2026-10-13): the attack has landed — an ATTACK
    // EVENT, +10 XP to the attacker, whatever the curse does next. If
    // the blow breaks the curse, HEX-TAKEN XP (+50) joins it below.
    const attackerXpById = new Map<number, XpGainReport>();
    await grantEventXp(attackerXpById, parsed.data.awakenedId, XP_PER_ATTACK);
    const xpShape = z.object({ awakenedId: z.number(), xpGain: z.number(), leveledUp: z.boolean(), newLevel: z.number() });
    // ATTRITION, NOT THORNS (Nigel, 2026-10-19): the curse no
    // longer answers the blow — striking it costs the striker
    // nothing in the moment. Its teeth are the withering of
    // whatever stands in it, reckoned at settle time (see
    // settleMarches). The striker's standing is reported as
    // it stands, untouched by the curse's reply — there is
    // no reply.
    const attackerMaxHp = await placementMaxHp(parsed.data.awakenedId);
    const attackerOutcome = {
      attackerHp: placement[0].hp ?? attackerMaxHp,
      attackerMaxHp,
      attackerDissipated: false,
      awakenedId: parsed.data.awakenedId,
    };
    const newHp = Math.max(0, currentHp - power);
    if (newHp > 0) {
      // Curse holds — record the reduced HP.
      await db.update(schema.territoryTiles)
        .set({ curseHp: newHp, curseMaxHp: maxHp })
        .where(eq(schema.territoryTiles.id, tile[0].id));
      return z.object({ ok: z.literal(true), purified: z.literal(false), hp: z.number(), maxHp: z.number(), damage: z.number(), attackerHp: z.number(), attackerMaxHp: z.number(), attackerDissipated: z.boolean(), awakenedId: z.number(), attackerXp: xpShape })
        .parse({ ok: true, purified: false, hp: newHp, maxHp, damage: power, ...attackerOutcome, attackerXp: attackerXpById.get(parsed.data.awakenedId) });
    }
    // HP reached 0 — the curse breaks!
    // 15% chance: pulled into one wave of the Unraveling instead of instant purify.
    // (Nigel, 2026-10-25: the pull is KEPT, its chance reduced from 35% to 15%.)
    if (Math.random() < 0.15) {
      // Don't purify yet — the wave must be beaten first.
      // Keep HP at 0 to mark it as "breaking".
      await db.update(schema.territoryTiles)
        .set({ curseHp: 0 })
        .where(eq(schema.territoryTiles.id, tile[0].id));
      return z.object({ ok: z.literal(true), purified: z.literal(false), wavePull: z.literal(true), tileId: z.number(), attackerHp: z.number(), attackerMaxHp: z.number(), attackerDissipated: z.boolean(), awakenedId: z.number(), attackerXp: xpShape })
        .parse({ ok: true, purified: false, wavePull: true, tileId: tile[0].id, ...attackerOutcome, attackerXp: attackerXpById.get(parsed.data.awakenedId) });
    }
    // Purify to neutral.
    await recordDeed(ownerKey, parsed.data.awakenedId, "curse_broken");
    // No newborn follows a purification any more (Nigel, 2026-10-14).
    {
        const elementCounts: Record<"tide" | "sky" | "stone" | "root", number> = { tide: 0, sky: 0, stone: 0, root: 0 };
        for (const layer of layers) {
          const el = storedElement((layer as any).element);
          if (el !== "fire" && el !== "neutral") elementCounts[el] += 1;
        }
        // The breaker's dominant element claims the tile; a tie
        // (or no counted element at all) falls to the DEFAULT —
        // root since Nigel's ruling, 2026-10-25 ("i hoped the
        // default would be root"); before, neutral (2026-10-20).
        let element: "tide" | "sky" | "stone" | "root" = "root";
        let maxCount = 0; let tie = false;
        for (const [el, count] of Object.entries(elementCounts)) {
          if (count > maxCount) { maxCount = count; element = el as typeof element; tie = false; }
          else if (count === maxCount && count > 0) { tie = true; }
        }
        if (tie) element = "root";
        // Wildfire spark: 5% chance the purified land smolders with Fire.
        // The next Awoken born from this tile gets a random Fire aspect.
        const sparked = Math.random() < 0.05;
        await db.update(schema.territoryTiles)
          .set({ cursed: 0, element, curseHp: null, curseMaxHp: null, spark: sparked ? 1 : 0, ...PURIFIED_TILE_FIELDS })
          .where(eq(schema.territoryTiles.id, tile[0].id));
        // The attacker advances onto the broken land. (Under
        // the old thorns this was gated on surviving the
        // curse's answer; there is no answer now.)
        await db.update(schema.fieldPlacements)
          .set({ tileId: tile[0].id })
          .where(eq(schema.fieldPlacements.awakenedId, parsed.data.awakenedId));
        // Reveal new cursed land at the frontier.
        await expandFrontier(ownerKey, tile[0].q, tile[0].r);
        // HEX TAKEN: this attacker's blow broke the curse — +50 XP.
        await grantEventXp(attackerXpById, parsed.data.awakenedId, XP_PER_HEX_TAKEN);
        return z.object({ ok: z.literal(true), purified: z.literal(true), sparked: z.boolean(), attackerHp: z.number(), attackerMaxHp: z.number(), attackerDissipated: z.boolean(), awakenedId: z.number(), attackerXp: xpShape })
          .parse({ ok: true, purified: true, sparked, ...attackerOutcome, attackerXp: attackerXpById.get(parsed.data.awakenedId) });
    }
  },


  /**
   * Server-side newborn birth: picks random layers from the pool, creates the
   * record, joins the hand. No client-side image composition — the card renders
   * from layers. Cannot hang the purification flow.
   */
  async birthNewbornToHand(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      tileId: z.number().int().positive().optional(),
      liberatorNames: z.array(z.string()),
    }).safeParse(args);
    if (!parsed.success) badRequest(`Invalid birth request — ${describeValidationIssues(parsed.error)}.`);
    // A birth follows a qualifying victory, and the victory is the
    // server's own record: consume exactly one pending claim. Boss
    // victories recorded the claims while the boss mode stood
    // (resolveBossBattle, War-Ground fix of 2026-10-15) — the mode
    // is abolished (Nigel, 2026-10-24), no living system records a
    // claim today, and this endpoint refuses every birth until the
    // next qualifying event (the planned Awoken Forge) records one.
    // Before this ledger, any caller could mint paid wake credits here on
    // demand — no victory, no limit, no record.
    if (!consumeNewbornClaim(ownerKey)) {
      badRequest("No newborn is waiting — a birth follows a victory, and this victory's newborn has already been gathered.");
    }
    // Newborns no longer pop directly into the hand. Instead, the tender gains
    // a wake credit — the newborn is fully born through the Wake One ritual.
    const { grantCredits } = await import("./credits.js");
    const balance = await grantCredits(ownerKey, 1, "newborn");
    return okResponse.parse({ ok: true, wakeCredits: balance });
  },

  async claimSpark(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      tileId: z.number().int().positive(),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid spark claim.");
    // Tile must be sparked and owned
    const tile = await db.select().from(schema.territoryTiles)
      .where(and(
        eq(schema.territoryTiles.id, parsed.data.tileId),
        eq(schema.territoryTiles.ownerKey, ownerKey),
        eq(schema.territoryTiles.spark, 1),
      )).limit(1);
    if (!tile.length) badRequest("No spark here.");
    // Clear the spark
    await db.update(schema.territoryTiles)
      .set({ spark: 0 })
      .where(eq(schema.territoryTiles.id, tile[0].id));
    // Grant 1 point to fire attunement (max level 3)
    const rows = await db.select().from(schema.aspectAttunement)
      .where(and(
        eq(schema.aspectAttunement.ownerKey, ownerKey),
        eq(schema.aspectAttunement.element, "fire"),
      ));
    let points = 0;
    if (rows.length) {
      points = Math.min(3, rows[0].points + 1);
      await db.update(schema.aspectAttunement)
        .set({ points, updatedAt: new Date() })
        .where(and(
          eq(schema.aspectAttunement.ownerKey, ownerKey),
          eq(schema.aspectAttunement.element, "fire"),
        ));
    } else {
      points = 1;
      await db.insert(schema.aspectAttunement)
        .values({ ownerKey, element: "fire" as any, points: 1, updatedAt: new Date() });
    }
    return { ok: true, fireLevel: points };
  },

  async igniteWildfire(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      awakenedId: z.number().int().positive(),
      tileId: z.number().int().positive(),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid ignition.");
    // Validate EVERYTHING before charging: a failed ignition must never
    // eat the 13 energy. (Charge sits just before the tiles are marked.)
    // Awoken must have Fire III aspect (level 3 fire)
    const aw = await db.select().from(schema.awakened)
      .where(and(
        eq(schema.awakened.id, parsed.data.awakenedId),
        eq(schema.awakened.ownerKey, ownerKey)
      )).limit(1);
    if (!aw.length) badRequest("Awokin not found.");
    let layers: any[];
    try { layers = JSON.parse(aw[0].compositionJson); }
    catch { layers = []; }
    const aspect = layers.find((l: any) => l.category === "aspect");
    if (!aspect) badRequest("This Awokin has no aspect.");
    const el = aspect.aspectElement || (await compositionElements([aspect]))[0];
    if (el !== "fire") badRequest("Only a Fire Awokin can ignite wildfire.");
    if ((aspect.aspectLevel ?? 1) < 3) badRequest("Requires Fire III (level 3).");
    // Must be on a border tile (adjacent to cursed)
    const tile = await db.select().from(schema.territoryTiles)
      .where(and(
        eq(schema.territoryTiles.id, parsed.data.tileId),
        eq(schema.territoryTiles.ownerKey, ownerKey),
        eq(schema.territoryTiles.cursed, 0)
      )).limit(1);
    if (!tile.length) badRequest("Must be on purified land.");
    // Find adjacent cursed tiles
    const allTiles = await db.select().from(schema.territoryTiles)
      .where(eq(schema.territoryTiles.ownerKey, ownerKey));
    const tileById = new Map(allTiles.map(t => [t.id, t]));
    const center = tile[0];
    const hexDist = (a: any, b: any) =>
      (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
    const ignited = allTiles.filter(t => t.cursed && hexDist(center, t) === 1);
    if (!ignited.length) badRequest("No cursed tiles adjacent to ignite.");
    // All checks passed — now charge the 13 energy.
    if (!(await spendEnergy(ownerKey, 13))) {
      badRequest("Not enough energy (need 13).");
    }
    // Mark them as ignited (wildfire)
    for (const t of ignited) {
      await db.update(schema.territoryTiles)
        .set({ spark: 2 }) // 2 = wildfire ignited
        .where(eq(schema.territoryTiles.id, t.id));
    }
    return { ok: true, ignitedTileIds: ignited.map(t => t.id) };
  },

  async getSiteColors(args: unknown, ctx?: ActionContext) {
    const rows = await db.select().from(schema.siteColors);
    const colors: Record<string, string> = {};
    for (const r of rows) colors[r.key] = r.value;
    return { ok: true, colors };
  },

  async setSiteColor(args: unknown, ctx?: ActionContext) {
    // Gated by requireWorkshop in index.ts
    const parsed = z.object({ key: z.string().min(1).max(64), value: z.string().min(1).max(32) }).safeParse(args);
    if (!parsed.success) badRequest("Invalid color.");
    await db.insert(schema.siteColors)
      .values({ key: parsed.data.key, value: parsed.data.value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: schema.siteColors.key, set: { value: parsed.data.value, updatedAt: new Date() } });
    return { ok: true };
  },

  // --- Hall of Champions ---
  async getHall(_args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const hall = await settleHallFor(ownerKey);
    if (!hall) return { hall: null };
    const level = hall.level ?? 1;
    let fund = { energy: 0, tide: 0, sky: 0, stone: 0, root: 0 };
    try { if (hall.fundJson) fund = { ...fund, ...JSON.parse(hall.fundJson) }; } catch {}
    const residents = await db.select().from(schema.hallResidents)
      .where(eq(schema.hallResidents.ownerKey, ownerKey));
    const rooms: ({ roomIndex: number; awakenedId: number } | { roomIndex: number; awakenedId: null })[] = [];
    for (let i = 0; i < level; i++) {
      const r = residents.find(x => x.roomIndex === i);
      rooms.push({ roomIndex: i, awakenedId: r ? r.awakenedId : null });
    }
    return {
      hall: {
        id: hall.id,
        status: hall.status,
        readyAt: hall.readyAt,
        level,
        rooms,
        fund,
        nextCost: level < 10 ? hallTierCost(level + 1) : null,
        upgrading: !!hall.upgradeReadyAt,
        upgradeReadyAt: hall.upgradeReadyAt,
      },
    };
  },

  async fundHallEnergy(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ amount: z.number().int().min(1).max(100000) }).safeParse(args);
    if (!parsed.success) badRequest("Invalid amount.");
    const hall = await settleHallFor(ownerKey);
    if (!hall || hall.status !== "active") badRequest("The Hall is not standing yet.");
    if (hall.upgradeReadyAt) badRequest("An upgrade is already underway.");
    const level = hall.level ?? 1;
    if (level >= 10) badRequest("The Hall is complete — ten rooms stand.");
    const cost = hallTierCost(level + 1);
    let fund = { energy: 0, tide: 0, sky: 0, stone: 0, root: 0 };
    try { if (hall.fundJson) fund = { ...fund, ...JSON.parse(hall.fundJson) }; } catch {}
    const remaining = cost.energy - fund.energy;
    if (remaining <= 0) badRequest("The energy reservoir for this tier is full.");
    const amount = Math.min(parsed.data.amount, remaining);
    const spent = await spendEnergy(ownerKey, amount);
    if (!spent) badRequest("Not enough energy.");
    fund.energy += amount;
    await db.update(schema.territoryBuildings)
      .set({ fundJson: JSON.stringify(fund) })
      .where(eq(schema.territoryBuildings.id, hall.id));
    return { ok: true, fund, nextCost: cost };
  },

  async fundHallElement(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      element: z.enum(["tide", "sky", "stone", "root"]),
      points: z.number().int().min(1).max(100000),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid.");
    const hall = await settleHallFor(ownerKey);
    if (!hall || hall.status !== "active") badRequest("The Hall is not standing yet.");
    if (hall.upgradeReadyAt) badRequest("An upgrade is already underway.");
    const level = hall.level ?? 1;
    if (level >= 10) badRequest("The Hall is complete — ten rooms stand.");
    const el = parsed.data.element;
    const cost = hallTierCost(level + 1);
    let fund = { energy: 0, tide: 0, sky: 0, stone: 0, root: 0 };
    try { if (hall.fundJson) fund = { ...fund, ...JSON.parse(hall.fundJson) }; } catch {}
    const remaining = cost.elementalEach - (fund as any)[el];
    if (remaining <= 0) badRequest(`The ${el} reservoir for this tier is full.`);
    const amount = Math.min(parsed.data.points, remaining);
    const rows = await db.select().from(schema.aspectAttunement)
      .where(and(
        eq(schema.aspectAttunement.ownerKey, ownerKey),
        eq(schema.aspectAttunement.element, el as any)
      )).limit(1);
    const available = rows.length ? Math.floor(rows[0].points) : 0;
    if (available < amount) badRequest(`Only ${available} ${el} points in the meter.`);
    await db.update(schema.aspectAttunement)
      .set({ points: rows[0].points - amount })
      .where(and(
        eq(schema.aspectAttunement.ownerKey, ownerKey),
        eq(schema.aspectAttunement.element, el as any)
      ));
    (fund as any)[el] += amount;
    await db.update(schema.territoryBuildings)
      .set({ fundJson: JSON.stringify(fund) })
      .where(eq(schema.territoryBuildings.id, hall.id));
    return { ok: true, fund, nextCost: cost };
  },

  async beginHallUpgrade(_args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const hall = await settleHallFor(ownerKey);
    if (!hall || hall.status !== "active") badRequest("The Hall is not standing yet.");
    if (hall.upgradeReadyAt) badRequest("An upgrade is already underway.");
    const level = hall.level ?? 1;
    if (level >= 10) badRequest("The Hall is complete — ten rooms stand.");
    const cost = hallTierCost(level + 1);
    let fund = { energy: 0, tide: 0, sky: 0, stone: 0, root: 0 };
    try { if (hall.fundJson) fund = { ...fund, ...JSON.parse(hall.fundJson) }; } catch {}
    if (fund.energy < cost.energy) badRequest(`Energy reservoir: ${fund.energy}/${cost.energy}.`);
    for (const el of ["tide", "sky", "stone", "root"] as const) {
      if (fund[el] < cost.elementalEach) badRequest(`${el} reservoir: ${fund[el]}/${cost.elementalEach}.`);
    }
    // The Hall's rising is a build too — the zodiac's
    // build-speed clause strikes its share of the time.
    const readyAt = new Date(Date.now() + cost.buildMinutes * (1 - fxSum(ownerKey, "buildSpeed") / 100) * 60 * 1000);
    await db.update(schema.territoryBuildings)
      .set({ fundJson: JSON.stringify({ energy: 0, tide: 0, sky: 0, stone: 0, root: 0 }), upgradeReadyAt: readyAt })
      .where(eq(schema.territoryBuildings.id, hall.id));
    return { ok: true, upgradeReadyAt: readyAt, targetLevel: level + 1 };
  },

  async houseAwoken(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      roomIndex: z.number().int().min(0).max(9),
      awakenedId: z.number().int(),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid.");
    const hall = await settleHallFor(ownerKey);
    if (!hall || hall.status !== "active") badRequest("The Hall is not standing yet.");
    if (parsed.data.roomIndex >= (hall.level ?? 1)) badRequest("That room has not been built yet.");
    // Court-bound: an Awoken stationed on the field cannot take a room —
    // the court is drawn from the hand. (Placed Awoken return only by dissipation.)
    const onField = await db.select({ id: schema.fieldPlacements.id }).from(schema.fieldPlacements)
      .where(and(eq(schema.fieldPlacements.awakenedId, parsed.data.awakenedId), eq(schema.fieldPlacements.ownerKey, ownerKey))).limit(1);
    if (onField.length) badRequest("That Awokin stands on the field — the court is drawn from the hand.");
    const aw = await db.select().from(schema.awakened)
      .where(eq(schema.awakened.id, parsed.data.awakenedId)).limit(1);
    if (!aw.length) badRequest("That Awokin is gone.");
    if ((aw[0] as any).ownerKey !== ownerKey) badRequest("That Awokin is not yours.");
    // Free the Awoken's previous room, clear the target room, then house.
    await db.delete(schema.hallResidents)
      .where(and(
        eq(schema.hallResidents.ownerKey, ownerKey),
        eq(schema.hallResidents.awakenedId, parsed.data.awakenedId)
      ));
    await db.delete(schema.hallResidents)
      .where(and(
        eq(schema.hallResidents.ownerKey, ownerKey),
        eq(schema.hallResidents.roomIndex, parsed.data.roomIndex)
      ));
    await db.insert(schema.hallResidents).values({
      ownerKey,
      roomIndex: parsed.data.roomIndex,
      awakenedId: parsed.data.awakenedId,
    });
    return { ok: true };
  },

  async unhouseAwoken(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ roomIndex: z.number().int().min(0).max(9) }).safeParse(args);
    if (!parsed.success) badRequest("Invalid.");
    await db.delete(schema.hallResidents)
      .where(and(
        eq(schema.hallResidents.ownerKey, ownerKey),
        eq(schema.hallResidents.roomIndex, parsed.data.roomIndex)
      ));
    return { ok: true };
  },

  // Feed energy to an Awoken as experience: 1 energy = 2 XP (Nigel, 2026-10-12).
  // The peaceful path — battle remains far more efficient per hour.
  /** THE WITCH'S HOVER TAKES ITS CHARGE (Nigel, 2026-10-22
   *  12:16, the rate corrected 12:42; Recovery R14): while a
   *  Witch holds her hover on the homeland, the jump engine's
   *  hover clock (client/src/jump.ts, jumpHoverTick) asks for
   *  1 energy as the hover begins and 1 more every 3 seconds
   *  of hovering. This action is the purse it asks: one real
   *  spend through the standing spendEnergy law, answering
   *  whether the charge was paid and the purse's true count
   *  after it — an unpaid charge is the engine's word to end
   *  the hover and begin the sink. No other class's leap ever
   *  asks, and nothing here judges the asking: the engine
   *  keeps the hover's law, this door only keeps its money
   *  honest. */
  async hoverSpend(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const spent = await spendEnergy(ownerKey, 1);
    return { spent, energy: await getEnergyFor(ownerKey) };
  },

  async feedEnergy(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      awakenedId: z.number().int(),
      energy: z.number().int().min(1).max(100),
    }).safeParse(args);
    if (!parsed.success) badRequest("Choose an Awokin and 1–100 energy.");
    const rows = await db.select().from(schema.awakened)
      .where(eq(schema.awakened.id, parsed.data.awakenedId)).limit(1);
    if (!rows.length) badRequest("That Awokin is gone.");
    if ((rows[0] as any).ownerKey && (rows[0] as any).ownerKey !== ownerKey) {
      badRequest("That Awokin is not yours to feed.");
    }
    const spent = await spendEnergy(ownerKey, parsed.data.energy);
    if (!spent) badRequest("Not enough energy.");
    // The Hall's teaching is for the HOUSED (Nigel, 2026-10-15,
    // Run #3 SUSPECT): feeding teaches at ×2 only while the Awoken
    // dwells in the Hall of Champions; in the field it teaches ×1.
    // Before this, the ×2 flowed anywhere and the Hall's training
    // ground meant nothing.
    const housed = await db.select().from(schema.hallResidents)
      .where(and(
        eq(schema.hallResidents.ownerKey, ownerKey),
        eq(schema.hallResidents.awakenedId, parsed.data.awakenedId)
      )).limit(1);
    const multiplier = housed.length ? 2 : 1;
    const xpGain = parsed.data.energy * multiplier;
    const result = await grantXp(parsed.data.awakenedId, xpGain);
    return { ok: true, xpGain, multiplier, ...result };
  },

  // --- Tender feedback (bug reports, questions, suggestions) ---
  async submitFeedback(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      category: z.enum(["bug", "question", "suggestion"]),
      body: z.string().trim().min(1).max(2000),
    }).safeParse(args);
    if (!parsed.success) badRequest("Pick a kind and write a message (up to 2000 characters).");
    // Tender name rides along for display in the workshop.
    let tenderName: string | null = null;
    const m = ownerKey.match(/^tender:(\d+)$/);
    if (m) {
      const t = await db.select({ tenderName: schema.tenders.tenderName })
        .from(schema.tenders)
        .where(eq(schema.tenders.id, Number(m[1]))).limit(1);
      tenderName = t[0]?.tenderName ?? null;
    }
    const [row] = await db.insert(schema.feedbackMessages).values({
      ownerKey,
      tenderName,
      category: parsed.data.category,
      body: parsed.data.body,
    }).returning();
    return { ok: true, id: row.id };
  },

  async listMyFeedback(_args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const rows = await db.select().from(schema.feedbackMessages)
      .where(eq(schema.feedbackMessages.ownerKey, ownerKey))
      .orderBy(desc(schema.feedbackMessages.createdAt));
    return { messages: rows };
  },

  async listFeedback(_args: unknown, ctx?: ActionContext) {
    // Workshop only (gated in index.ts)
    const rows = await db.select().from(schema.feedbackMessages)
      .orderBy(desc(schema.feedbackMessages.pinned), desc(schema.feedbackMessages.createdAt));
    return { messages: rows };
  },

  async pinFeedback(args: unknown, ctx?: ActionContext) {
    // Workshop only
    const parsed = z.object({ id: z.number().int(), pinned: z.boolean() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid.");
    await db.update(schema.feedbackMessages)
      .set({ pinned: parsed.data.pinned ? 1 : 0 })
      .where(eq(schema.feedbackMessages.id, parsed.data.id));
    return { ok: true };
  },

  async replyFeedback(args: unknown, ctx?: ActionContext) {
    // Workshop only
    const parsed = z.object({ id: z.number().int(), reply: z.string().trim().min(1).max(2000) }).safeParse(args);
    if (!parsed.success) badRequest("Write a reply first.");
    await db.update(schema.feedbackMessages)
      .set({ reply: parsed.data.reply, repliedAt: new Date() })
      .where(eq(schema.feedbackMessages.id, parsed.data.id));
    return { ok: true };
  },

  async deleteFeedback(args: unknown, ctx?: ActionContext) {
    // Workshop only
    const parsed = z.object({ id: z.number().int() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid.");
    await db.delete(schema.feedbackMessages)
      .where(eq(schema.feedbackMessages.id, parsed.data.id));
    return { ok: true };
  },

  async adminResetTenderPassword(args: unknown, ctx?: ActionContext) {
    // Workshop only (gated by requireWorkshop in index.ts)
    const parsed = z.object({
      tenderName: z.string().trim().min(1).max(64),
      newPassword: z.string().min(8).max(128),
    }).safeParse(args);
    if (!parsed.success) badRequest("Tender name and a new password (8+ chars) are needed.");
    const { hashPassword } = await import("./tenders.js");
    const rows = await db.select().from(schema.tenders)
      .where(sql`lower(${schema.tenders.tenderName}) = lower(${parsed.data.tenderName})`).limit(1);
    if (!rows[0]) badRequest("No tender found with that name.");
    await db.update(schema.tenders)
      .set({ passwordHash: hashPassword(parsed.data.newPassword) })
      .where(eq(schema.tenders.id, rows[0].id));
    // An admin reset is the compromised-account remedy: every live
    // session for this Tender dies with the old password, so a stolen
    // token cannot ride out the reset.
    await destroyTenderSessions(rows[0].id);
    return { ok: true, tenderName: rows[0].tenderName };
  },

  /** Send a RECLASS TOKEN (workshop only; Nigel, 2026-10-19):
   *  the only key that unseals a class after the free
   *  second-thoughts rite is spent. The token waits on the
   *  Tender's ledger until their next re-choosing spends it. */
  async grantReclassToken(args: unknown, ctx?: ActionContext) {
    // Workshop only (gated by requireWorkshop in index.ts)
    const parsed = z.object({
      tenderName: z.string().trim().min(1).max(64),
    }).safeParse(args);
    if (!parsed.success) badRequest("A tender name is needed.");
    const rows = await db.select().from(schema.tenders)
      .where(sql`lower(${schema.tenders.tenderName}) = lower(${parsed.data.tenderName})`).limit(1);
    if (!rows[0]) badRequest("No tender found with that name.");
    const ownerKey = `tender:${rows[0].id}`;
    sqlite.prepare("INSERT OR IGNORE INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 0, 0, ?)")
      .run(ownerKey, Date.now());
    sqlite.prepare("UPDATE tender_progress SET reclass_tokens = reclass_tokens + 1 WHERE owner_key = ?")
      .run(ownerKey);
    const row = sqlite.prepare("SELECT reclass_tokens FROM tender_progress WHERE owner_key = ?")
      .get(ownerKey) as { reclass_tokens: number };
    return { ok: true as const, tenderName: rows[0].tenderName, reclassTokens: row.reclass_tokens };
  },

  async setTenderEmail(args: unknown, ctx?: ActionContext) {
    if (!ctx?.tender) badRequest("Log in first.");
    const parsed = z.object({
      email: z.string().trim().email().max(200).nullable().or(z.literal("")),
    }).safeParse(args);
    if (!parsed.success) badRequest("That email doesn't look right.");
    const email = parsed.data.email ? parsed.data.email : null;
    await db.update(schema.tenders)
      .set({ email } as any)
      .where(eq(schema.tenders.id, ctx!.tender!.id));
    return { ok: true, email };
  },

  async setTenderPassword(args: unknown, ctx?: ActionContext) {
    // The target is ALWAYS the session's own Tender — never an id taken
    // from the owner key, a header, or the body. The old code derived the
    // target from ownerKeyFor(ctx) by stripping "tender-", which for an
    // unauthenticated caller is their own X-Visitor-Id: a crafted visitor
    // id of "tender-<victimId>" overwrote that Tender's password, while
    // the genuine path never worked at all (real owner keys are
    // "tender:<id>" — a colon, not a hyphen). The one live call site (the
    // naming ritual in TenderNaming) runs with a session in hand — its
    // setTenderName step already requires one — so session-only is the
    // honest shape.
    if (!ctx?.tender) {
      throw Object.assign(new Error("Claim your secret code first."), { status: 403 });
    }
    const parsed = z.object({ password: z.string().min(8).max(128) }).safeParse(args);
    if (!parsed.success) badRequest("Password must be at least 8 characters.");
    const { hashPassword } = await import("./tenders.js");
    await db.update(schema.tenders)
      .set({ passwordHash: hashPassword(parsed.data.password) })
      .where(eq(schema.tenders.id, ctx.tender.id));
    // The password changed: every OTHER session for this Tender is
    // revoked. The current session keeps its seat — the client drops
    // dead tokens quietly to the claim gate and does not re-login
    // gracefully mid-ritual, so revoking it too would strand the
    // naming flow it just completed.
    await destroyTenderSessions(ctx.tender.id, ctx.tenderToken ?? null);
    return { ok: true };
  },

  /** The caller's Tender standing: EXP, level, and what the
   *  level unlocks (Tender EXP, 2026-10-16). */
  async getTenderExp(args: unknown, ctx?: ActionContext) {
    return getTenderProgress(ownerKeyFor(ctx));
  },

  /** THE CHOOSING (Nigel, 2026-10-19 — the Class Gate; trigger
   *  amended 2026-10-23 22:26 as amended 22:36 — CHOOSE AT
   *  THREE): a Tender picks their class after waking their
   *  first three Awoken. The level-3 gate is dead: a FIRST
   *  choosing is refused only when the Tender is classless
   *  and holds fewer than three Awoken; the second-thoughts
   *  rite and the reclass-token paths below carry no count
   *  gate at all, exactly as they stood. The first choosing
   *  is the calling; ONE free second-thoughts rite may unmake
   *  it; after that the class is sealed, and only a reclass
   *  token sent by a workshop hand (grantReclassToken) opens
   *  it again, consumed on use. Until a class is chosen the
   *  Tender's avatar shows nowhere and the Table will not seat
   *  them (see getTableBindCode). */
  async chooseClass(args: unknown, ctx?: ActionContext) {
    if (!ctx?.tender) badRequest("Log in first.");
    const parsed = z.object({
      classKey: z.enum(["warden", "runewright", "binder", "witch", "sage"]),
    }).safeParse(args);
    if (!parsed.success) badRequest("Name one of the five classes: Warden, Runewright, Binder, Witch, or Sage.");
    const ownerKey = ownerKeyFor(ctx);
    const progress = await getTenderProgress(ownerKey);
    if (!progress.classKey && progress.awokenCount < 3) badRequest("The choosing comes after your first three wakes — wake three Awoken, and the choosing opens.");
    sqlite.prepare("INSERT OR IGNORE INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 0, 0, ?)")
      .run(ownerKey, Date.now());
    const row = sqlite.prepare("SELECT class_key, class_free_rite_used, reclass_tokens FROM tender_progress WHERE owner_key = ?")
      .get(ownerKey) as { class_key: string | null; class_free_rite_used: number; reclass_tokens: number };
    const want = parsed.data.classKey;
    if (row.class_key === want) badRequest("That is already your class — the Written Light does not repeat itself.");
    let via: string;
    if (!row.class_key) {
      sqlite.prepare("UPDATE tender_progress SET class_key = ?, class_chosen_at = ? WHERE owner_key = ?")
        .run(want, Date.now(), ownerKey);
      via = "the calling";
    } else if (!row.class_free_rite_used) {
      sqlite.prepare("UPDATE tender_progress SET class_key = ?, class_free_rite_used = 1, class_chosen_at = ? WHERE owner_key = ?")
        .run(want, Date.now(), ownerKey);
      via = "the second-thoughts rite";
    } else if (row.reclass_tokens > 0) {
      sqlite.prepare("UPDATE tender_progress SET class_key = ?, reclass_tokens = reclass_tokens - 1, class_chosen_at = ? WHERE owner_key = ?")
        .run(want, Date.now(), ownerKey);
      via = "a reclass token";
    } else {
      badRequest("Your class is sealed — the second-thoughts rite is spent. Only a reclass token from the workshop can unmake it now.");
    }
    return { ok: true as const, classKey: want, via, progress: await getTenderProgress(ownerKey) };
  },

  /** THE RUNIC WEAPON (Nigel, 2026-10-19): the choosing's second
   *  gift — with his class, the Tender names the weapon that
   *  will float at his side: sword & shield (d6, +3 AC), sword
   *  (d10, +1 AC), spear (d6, +1 range), arrow (d4, range 4).
   *  It takes elemental attunement like an Awokin. This door
   *  has never carried a level gate — classKey only — and
   *  binds as-is under choose at three (2026-10-23). Re-picking
   *  rides the class's own economy: the second-thoughts rite
   *  once, then reclass tokens — the choosing is one choosing. */
  async chooseWeapon(args: unknown, ctx?: ActionContext) {
    if (!ctx?.tender) badRequest("Log in first.");
    const parsed = z.object({
      weaponKey: z.enum(["swordshield", "sword", "spear", "arrow"]),
    }).safeParse(args);
    if (!parsed.success) badRequest("Name one of the four: Sword & Shield, Sword, Spear, or Arrow.");
    const ownerKey = ownerKeyFor(ctx);
    const progress = await getTenderProgress(ownerKey);
    if (!progress.classKey) badRequest("The weapon is chosen with a class — the choosing has not opened for you yet.");
    const row = sqlite.prepare("SELECT weapon_key, class_free_rite_used, reclass_tokens FROM tender_progress WHERE owner_key = ?")
      .get(ownerKey) as { weapon_key: string | null; class_free_rite_used: number; reclass_tokens: number } | undefined;
    if (!row) badRequest("The choosing has not opened for you yet.");
    const want = parsed.data.weaponKey;
    if (row.weapon_key === want) badRequest("That weapon already floats at your side.");
    let via: string;
    if (!row.weapon_key) {
      sqlite.prepare("UPDATE tender_progress SET weapon_key = ? WHERE owner_key = ?").run(want, ownerKey);
      via = "the choosing";
    } else if (!row.class_free_rite_used) {
      sqlite.prepare("UPDATE tender_progress SET weapon_key = ?, class_free_rite_used = 1 WHERE owner_key = ?").run(want, ownerKey);
      via = "the second-thoughts rite";
    } else if (row.reclass_tokens > 0) {
      sqlite.prepare("UPDATE tender_progress SET weapon_key = ?, reclass_tokens = reclass_tokens - 1 WHERE owner_key = ?").run(want, ownerKey);
      via = "a reclass token";
    } else {
      badRequest("Your weapon is sealed — the second-thoughts rite is spent. Only a reclass token from the workshop can unmake it now.");
    }
    return { ok: true as const, weaponKey: want, via, progress: await getTenderProgress(ownerKey) };
  },

  /** WIELD (Nigel, 2026-10-19 — the Arsenal law): weapons are
   *  gear, not vows. Any classed Tender owns all four and may
   *  take any of them in hand, freely, as often as they like;
   *  tender_progress.weapon_key is only the pointer to the one
   *  in hand. (chooseWeapon above remains the choosing's first
   *  grant.) */
  async wieldWeapon(args: unknown, ctx?: ActionContext) {
    if (!ctx?.tender) badRequest("Log in first.");
    const parsed = z.object({
      weaponKey: z.enum(["swordshield", "sword", "spear", "arrow"]),
    }).safeParse(args);
    if (!parsed.success) badRequest("Name one of the four: Sword & Shield, Sword, Spear, or Arrow.");
    const ownerKey = ownerKeyFor(ctx);
    const progress = await getTenderProgress(ownerKey);
    if (!progress.classKey) badRequest("The arsenal opens with your class — the choosing has not opened for you yet.");
    sqlite.prepare("UPDATE tender_progress SET weapon_key = ? WHERE owner_key = ?")
      .run(parsed.data.weaponKey, ownerKey);
    return { ok: true as const, weaponKey: parsed.data.weaponKey, progress: await getTenderProgress(ownerKey) };
  },

  /** ATTUNE A WEAPON (Nigel, 2026-10-19 + the Powering law):
   *  deepen one weapon's elemental attunement by pouring the
   *  Tender's own aspect points into it — the raise FROM depth
   *  D costs D+1 points of that element, cap IV. A weapon holds
   *  ONE element: pouring a different element starts its
   *  attunement over (depth resets), and the pour is refused
   *  whole if the pool cannot pay — nothing is half-spent. */
  async attuneWeapon(args: unknown, ctx?: ActionContext) {
    if (!ctx?.tender) badRequest("Log in first.");
    const parsed = z.object({
      weaponKey: z.enum(["swordshield", "sword", "spear", "arrow"]),
      element: z.enum(["root", "tide", "sky", "stone", "fire"]),
    }).safeParse(args);
    if (!parsed.success) badRequest("Name a weapon and one of the five elements.");
    const ownerKey = ownerKeyFor(ctx);
    const progress = await getTenderProgress(ownerKey);
    if (!progress.classKey) badRequest("The arsenal opens with your class — the choosing has not opened for you yet.");
    const { weaponKey, element } = parsed.data;
    sqlite.prepare(`INSERT OR IGNORE INTO tender_weapons (owner_key, weapon_key) VALUES (?, ?)`)
      .run(ownerKey, weaponKey);
    const wrow = sqlite.prepare("SELECT attunement_element, attunement_depth FROM tender_weapons WHERE owner_key = ? AND weapon_key = ?")
      .get(ownerKey, weaponKey) as { attunement_element: string | null; attunement_depth: number };
    const switching = wrow.attunement_element !== null && wrow.attunement_element !== element;
    const fromDepth = switching ? 0 : wrow.attunement_depth;
    if (fromDepth >= 4) badRequest("That attunement is already at its deepest (IV).");
    const cost = fromDepth + 1;
    const prow = sqlite.prepare("SELECT points FROM aspect_attunement WHERE owner_key = ? AND element = ?")
      .get(ownerKey, element) as { points: number } | undefined;
    const have = prow?.points ?? 0;
    if (have < cost) badRequest(`The pour needs ${cost} ${element} point${cost === 1 ? "" : "s"} — your pool holds ${have}. Nothing was spent.`);
    sqlite.prepare("UPDATE aspect_attunement SET points = points - ? WHERE owner_key = ? AND element = ?")
      .run(cost, ownerKey, element);
    sqlite.prepare("UPDATE tender_weapons SET attunement_element = ?, attunement_depth = ? WHERE owner_key = ? AND weapon_key = ?")
      .run(element, fromDepth + 1, ownerKey, weaponKey);
    return { ok: true as const, weaponKey, element, depth: fromDepth + 1, cost, progress: await getTenderProgress(ownerKey) };
  },

  /** BUY A WEAPON NODE (Phase C, 2026-10-19): the weapon tree's
   *  two bought nodes — MANIFEST (casts +1 copy) and SIGNATURE
   *  (the weapon's own gift: arrow Pierce, spear Longshaft,
   *  sword Keen, swordshield Aegis). Each costs a flat 3 aspect
   *  points, paid from the weapon's attunement element pool when
   *  the weapon is attuned (depth ≥ 1), else from the Tender's
   *  richest pool. Refused WHOLE — pool under 3 or node already
   *  owned spends nothing. The spend rides the real
   *  aspect_attunement rows, exactly as attuneWeapon's pour does. */
  async buyWeaponNode(args: unknown, ctx?: ActionContext) {
    if (!ctx?.tender) badRequest("Log in first.");
    const parsed = z.object({
      weaponKey: z.enum(["swordshield", "sword", "spear", "arrow"]),
      node: z.enum(["manifest", "signature"]),
    }).safeParse(args);
    if (!parsed.success) badRequest("Name a weapon and a node: manifest or signature.");
    const ownerKey = ownerKeyFor(ctx);
    const progress = await getTenderProgress(ownerKey);
    if (!progress.classKey) badRequest("The arsenal opens with your class — the choosing has not opened for you yet.");
    const { weaponKey, node } = parsed.data;
    const COST = 3;
    sqlite.prepare(`INSERT OR IGNORE INTO tender_weapons (owner_key, weapon_key) VALUES (?, ?)`)
      .run(ownerKey, weaponKey);
    const wrow = sqlite.prepare("SELECT attunement_element, attunement_depth, manifest_node, signature_node FROM tender_weapons WHERE owner_key = ? AND weapon_key = ?")
      .get(ownerKey, weaponKey) as { attunement_element: string | null; attunement_depth: number; manifest_node: number; signature_node: number };
    const owned = node === "manifest" ? wrow.manifest_node : wrow.signature_node;
    if (owned) badRequest(`That ${node} node is already yours — the tree does not sell the same star twice.`);
    // Which pool pays: the attuned element's, else the richest.
    let payElement: string | null = null;
    if (wrow.attunement_depth >= 1 && wrow.attunement_element) {
      payElement = wrow.attunement_element;
    } else {
      const pools = sqlite.prepare("SELECT element, points FROM aspect_attunement WHERE owner_key = ?")
        .all(ownerKey) as { element: string; points: number }[];
      pools.sort((a, b) => (b.points - a.points) || a.element.localeCompare(b.element));
      payElement = pools[0]?.element ?? null;
    }
    const prow = payElement
      ? sqlite.prepare("SELECT points FROM aspect_attunement WHERE owner_key = ? AND element = ?").get(ownerKey, payElement) as { points: number } | undefined
      : undefined;
    const have = prow?.points ?? 0;
    if (!payElement || have < COST) {
      badRequest(`The ${node} node costs ${COST} aspect points${payElement ? ` from your ${payElement} pool` : ""} — that pool holds ${have}. Nothing was spent.`);
    }
    sqlite.prepare("UPDATE aspect_attunement SET points = points - ? WHERE owner_key = ? AND element = ?")
      .run(COST, ownerKey, payElement);
    sqlite.prepare(`UPDATE tender_weapons SET ${node === "manifest" ? "manifest_node" : "signature_node"} = 1 WHERE owner_key = ? AND weapon_key = ?`)
      .run(ownerKey, weaponKey);
    return { ok: true as const, weaponKey, node, element: payElement, cost: COST, progress: await getTenderProgress(ownerKey) };
  },


  async getTenderRank(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    // Count Awoken per tender (tender collection only)
    const counts = await db.select({
      ownerKey: schema.awakened.ownerKey,
      ownerName: schema.awakened.ownerName,
      count: sql<number>`COUNT(*)`,
    }).from(schema.awakened)
      .where(eq(schema.awakened.collection, "tender"))
      .groupBy(schema.awakened.ownerKey, schema.awakened.ownerName)
      .orderBy(sql`COUNT(*) DESC`);
    // Find current tender's rank
    const myIndex = counts.findIndex(c => c.ownerKey === ownerKey);
    const myRank = myIndex >= 0 ? myIndex + 1 : counts.length + 1;
    const myCount = myIndex >= 0 ? counts[myIndex].count : 0;
    // Get 2 above and 2 below
    const start = Math.max(0, myIndex - 2);
    const end = Math.min(counts.length, myIndex + 3);
    const nearby = counts.slice(start, end).map((c, i) => ({
      rank: start + i + 1,
      name: c.ownerName || "Nameless",
      count: c.count,
      isMe: c.ownerKey === ownerKey,
    }));
    return {
      ok: true,
      myRank,
      myCount,
      totalTenders: counts.length,
      nearby,
    };
  },

  /**
   * Passive purification: the slow work of presence. Once every 48 hours, a
   * cursed tile adjacent to purified land may purify on its own if the
   * combined power of nearby field Awoken exceeds the tile's curse weight.
   * 30% chance per attempt. The land grows because it is tended, not because
   * time passes.
   */
};

/** A deck the caller owns — or a refusal. Decks are never shared. */
async function ownDeck(id: number, ownerKey: string) {
  const rows = await db
    .select()
    .from(schema.decks)
    .where(and(eq(schema.decks.id, id), eq(schema.decks.ownerKey, ownerKey)))
    .limit(1);
  const deck = rows[0];
  if (!deck) badRequest("That deck is not yours to touch.");
  return deck;
}

/** Card ids currently gathered in a deck. */
async function deckCardIds(deckId: number): Promise<number[]> {
  const rows = await db
    .select({ awakenedId: schema.deckCards.awakenedId })
    .from(schema.deckCards)
    .where(eq(schema.deckCards.deckId, deckId));
  return rows.map((row) => row.awakenedId);
}

/** A Tender may only gather their own Tender-collection Awoken. */
function canTouchAwoken(awoken: typeof schema.awakened.$inferSelect, ownerKey: string): boolean {
  return (
    awoken.collection === "tender" &&
    (awoken.ownerKey === null || awoken.ownerKey === ownerKey)
  );
}

export type ActionName = keyof typeof handlers;
export { assetShape, awakenedShape };
