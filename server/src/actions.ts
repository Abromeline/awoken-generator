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
import { awardWakeExp, getTenderProgress } from "./tenderExp.js";
import { CREDITS_PER_PACK, PACK_PRICE_CENTS, PRICE_PER_WAKE_CENTS, formatUsd, DISCORD_STORIES_WEBHOOK_URL } from "./config.js";
import { stripeReady } from "./stripe.js";
import {
  claimTender, destroySession, destroyTenderSessions, loginTender, newTenderNameSuggestion,
  publicTender, setTenderName, suggestTenderCode, tenderOwnerKey,
  type TenderRow,
  requestPasswordReset, resetPasswordWithToken } from "./tenders.js";
import { adoptVisitorState } from "./adopt.js";
import { refreshGrimoire, saveGrimoire, spellByKey, hpForCast, spendAttunement, attunementPools, attunementLevel, pageAttunementsFor, pageTotalSlots, pageSlotsCastFor, fillPageSlot, PAGE_SLOTS, SLOT_COST, POUR_ENGINES, ENGINE_KEYS, type GrimoireState, type GrimoireSpell } from "./grimoire.js";
import { liveNodes, liveEdges, liveById, liveAdj, zodiacGraph, upsertNode, deleteNode, addEdge, deleteEdge, resetGraph, FX_PALETTE, BESPOKE_IDS } from "./zodiacLive.js";
import { workingEffects, skillAttunementGrants } from "./skills.js";
// HOMELAND CASTING (Nigel, 2026-10-20): the homeland rolls
// through the Table's OWN casting reckoning — castModFor is
// imported, never copied, so the two grounds can never drift
// apart on what a class's cast is worth. (table.ts already
// imports this module; the binding is only ever called at
// request time, long after both modules stand.)
import { castModFor } from "./table.js";
import { storyPromptFor, storyThreadNameFor } from "./storyPrompts.js";
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
// endpoints (birthNewbornToHand, birthFieldAwoken) consume exactly one
// claim per birth. Before this ledger existed, birthNewbornToHand
// granted a paid wake credit to any caller on demand — an open mint on
// the credits Stripe sells. (Corrected 2026-10-15: purification events
// recorded claims when the ledger was built, but Nigel's 2026-10-14
// ruling abolished purification births and those recording sites were
// removed; since the War-Ground fix the ONLY recording site is a
// verified boss victory in resolveBossBattle.)

function recordNewbornClaim(ownerKey: string, source: string): void {
  sqlite.prepare("INSERT INTO pending_newborn_claims (owner_key, source, created_at) VALUES (?, ?, ?)")
    .run(ownerKey, source, Date.now());
}

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
 *  size is LEVEL: the more powerful, the harder to move (÷√growth). */
const MARCH_SECONDS_PER_HEX: Record<string, number> = { sky: 1.6, fire: 2.2, tide: 2.6, root: 3.2, stone: 4.5, neutral: 3.0 };
function marchSecondsPerHexFor(layers: { element?: string | null }[], experience: number): number {
  let pace = MARCH_SECONDS_PER_HEX.neutral;
  if (layers.length) {
    pace = layers.reduce((sum, l) => sum + (MARCH_SECONDS_PER_HEX[l.element ?? "neutral"] ?? MARCH_SECONDS_PER_HEX.neutral), 0) / layers.length;
  }
  const level = Math.max(1, awokenLevelOf(experience));
  return pace * Math.sqrt(Math.pow(1.25, level - 1));
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
function marchWeightedSeconds(road: number[], secPerHex: number, cursedOf: (tileId: number) => boolean): number {
  let total = 0;
  for (let i = 1; i < road.length; i++) total += secPerHex * (cursedOf(road[i]) ? 2 : 1);
  return total;
}
/** The road between two of the Tender's hexes, over their own
 *  uncursed ground only (breadth-first; the grid makes every step
 *  equal). Returns the tile ids, origin first, or null when no road
 *  of home ground runs there. */
/** A road that dares cursed ground (the seed missions, 2026-10-17):
    patrols may enter cursed tiles by ruling — a fetch party rides
    where the march of settlement may not. Same breadth-first walk
    as findRoad, with the curse filter lifted. */
function findAnyRoad(tiles: { id: number; q: number; r: number; cursed: number; z?: number; buildStage?: number }[], fromId: number, toId: number): number[] | null {
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

function findRoad(tiles: { id: number; q: number; r: number; cursed: number; z?: number; buildStage?: number }[], fromId: number, toId: number): number[] | null {
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

// --- Boss state & pending aspect grants -------------------------------------
// The boss ladder is the server's record, never the client's: how many
// bosses this tender has broken, and the wavesDefeated count when the
// last one fell. A boss can be faced only when a fresh cycle of three
// Unravelings has been broken since then (War-Ground fix, 2026-10-15 —
// boss victories previously had NO server resolution path: the client
// sent waveNumber 901+ to resolveBattle, which rejected it as a ladder
// mismatch and swallowed the error, so no claim ever recorded).

interface BossStateRow {
  bossesDefeated: number;
  lastVictoryDefeated: number;
  lastBossAt: number | null;
}

function loadBossState(ownerKey: string): BossStateRow {
  sqlite.prepare("INSERT OR IGNORE INTO boss_state (owner_key) VALUES (?)").run(ownerKey);
  const row = sqlite.prepare(
    "SELECT bosses_defeated AS bd, last_victory_defeated AS lvd, last_boss_at AS lba FROM boss_state WHERE owner_key = ?"
  ).get(ownerKey) as { bd: number; lvd: number; lba: number | null };
  return { bossesDefeated: row.bd, lastVictoryDefeated: row.lvd, lastBossAt: row.lba };
}

/** A boss waits when a full 3-Unraveling cycle has been broken since
 *  the last boss victory (or since the beginning). */
function bossEligible(wavesDefeated: number, boss: BossStateRow): boolean {
  return wavesDefeated > 0 && wavesDefeated % 3 === 0 && wavesDefeated > boss.lastVictoryDefeated;
}

function recordAspectGrant(ownerKey: string, elements: AspectElement[], source: string): void {
  sqlite.prepare("INSERT INTO pending_aspect_grants (owner_key, elements, source, created_at) VALUES (?, ?, ?, ?)")
    .run(ownerKey, JSON.stringify(elements), source, Date.now());
}

/** The owner's oldest pending aspect grant, or null when none waits. */
function peekAspectGrant(ownerKey: string): { elements: AspectElement[]; source: string } | null {
  const row = sqlite.prepare("SELECT elements, source FROM pending_aspect_grants WHERE owner_key = ? ORDER BY id ASC LIMIT 1")
    .get(ownerKey) as { elements: string; source: string } | undefined;
  if (!row) return null;
  try {
    const elements = JSON.parse(row.elements) as AspectElement[];
    return Array.isArray(elements) ? { elements, source: row.source } : null;
  } catch { return null; }
}

/** Take the owner's oldest pending aspect grant, atomically — a grant
 *  pays out exactly once, like a newborn claim. */
function consumeAspectGrant(ownerKey: string): { elements: AspectElement[]; source: string } | null {
  return sqlite.transaction(() => {
    const row = sqlite.prepare("SELECT MIN(id) AS id FROM pending_aspect_grants WHERE owner_key = ?")
      .get(ownerKey) as { id: number | null } | undefined;
    if (!row || row.id == null) return null;
    const grant = sqlite.prepare("SELECT elements, source FROM pending_aspect_grants WHERE id = ?")
      .get(row.id) as { elements: string; source: string };
    sqlite.prepare("DELETE FROM pending_aspect_grants WHERE id = ?").run(row.id);
    try {
      const elements = JSON.parse(grant.elements) as AspectElement[];
      return Array.isArray(elements) ? { elements, source: grant.source } : null;
    } catch { return null; }
  })();
}

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
const statSchema = z.number().int().min(0).max(3);
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
  if (total <= 3) return "common";
  if (total === 4) return "uncommon";
  if (total === 5) return "rare";
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
const storedStatSchema = z.number().int().min(0).transform((v) => Math.min(v, 3));
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
 * - ACTIVE ASSAULT (deployBattle): The combined power of ALL Awoken standing
 *   on the tile must meet or exceed its toughness. If so, the dark breaks
 *   immediately. The tile takes the dominant element of its liberators.
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
   Awoken Forge he plans. Boss victories still free newborns;
   this event no longer pretends to be one. */
const FIRST_SEED_MAX_WAVE = 12;
const FIRST_SEED_MAX_LEVEL = 4;

type FirstSeedEventRow = {
  owner_key: string; seed_id: number; state: string; banked: number;
  waves_cleared: number; next_wave_at: number;
  // newborn_claimed_at rests: written by the struck law until
  // 2026-10-19, never written again — kept so old rows read true.
  newborn_claimed_at: number | null; created_at: number; updated_at: number;
  reward_element: string | null; reward_claimed_at: number | null;
};

function firstSeedEventRow(ownerKey: string): FirstSeedEventRow | null {
  const row = sqlite.prepare("SELECT * FROM first_seed_events WHERE owner_key = ?").get(ownerKey) as FirstSeedEventRow | undefined;
  return row ?? null;
}

function saveFirstSeedEvent(ev: FirstSeedEventRow): void {
  sqlite.prepare(`UPDATE first_seed_events
    SET state = ?, banked = ?, waves_cleared = ?, next_wave_at = ?, newborn_claimed_at = ?, reward_element = ?, reward_claimed_at = ?, updated_at = ?
    WHERE owner_key = ?`)
    .run(ev.state, ev.banked, ev.waves_cleared, ev.next_wave_at, ev.newborn_claimed_at, ev.reward_element, ev.reward_claimed_at, Date.now(), ev.owner_key);
}

/** When the wave AFTER `cleared` waves lands: the first three
 *  arrive a minute apart; later gaps turn sporadic (45–120s) —
 *  deliberately chaotic, as ruled. */
function firstSeedWaveGapMs(cleared: number): number {
  const arriving = cleared + 1;
  if (arriving <= 3) return 60 * 1000;
  return 45 * 1000 + Math.floor(Math.random() * 75 * 1000);
}

/** The seed's level for a ladder count: level 1 stands from the
 *  fall itself; every full three waves raise it one. */
function firstSeedLevelFor(wavesCleared: number): number {
  if (wavesCleared < 3) return 1;
  return Math.min(FIRST_SEED_MAX_LEVEL, Math.floor(wavesCleared / 3));
}

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

/** The element a victorious company claims land with: the dominant
 *  element of their layers, read from the parts' own records (fire
 *  never claims conquered land; a tie stays neutral). The same
 *  arithmetic the claim paths have always used, kept in one place. */
async function dominantClaimElement(standingRows: Array<{ compositionJson: string }>): Promise<"tide" | "sky" | "stone" | "root" | "neutral"> {
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
  let element: "tide" | "sky" | "stone" | "root" | "neutral" = "neutral";
  let maxCount = 0; let tie = false;
  for (const [el, count] of Object.entries(elementCounts)) {
    if (count > maxCount) { maxCount = count; element = el as typeof element; tie = false; }
    else if (count === maxCount && count > 0) { tie = true; }
  }
  if (tie) element = "neutral";
  return element;
}

/** Referee one arrived wave of the first-seed hold. The defenders
 *  strike first, each blow its filed power against the Fray line
 *  (canon: power 1, curse HP 3, from the game's own enemy config);
 *  surviving Fray answer against the weakest standing defender,
 *  through damagePlacement — the map's single damage path, so a
 *  defender at 0 HP dissipates back to hand. Pays the Table's
 *  fell numbers through the map's own seams (+3✦ capped to the
 *  slayer's Tender per Fray felled, +2 XP to the slayer, +10
 *  defense XP to every Awoken who stood), then settles the ladder:
 *  bank at wave 3, a rising every three, the reward laid up at
 *  the first reaching of level 3 (the newborn claim that once
 *  stood there is struck — Nigel, 2026-10-19), and the run's end
 *  whenever the defense falls. */
async function resolveFirstSeedWave(ownerKey: string, ev: FirstSeedEventRow): Promise<void> {
  const seed = sqlite.prepare("SELECT * FROM star_seeds WHERE id = ? AND owner_key = ?").get(ev.seed_id, ownerKey) as any;
  if (!seed) { ev.state = "done"; ev.next_wave_at = 0; saveFirstSeedEvent(ev); return; }
  const wave = ev.waves_cleared + 1;
  const cfg = await loadGameConfig();
  const frayPower = Math.max(0, cfg.enemies.fray?.power ?? 1);
  const frayHpEach = Math.max(1, cfg.enemies.fray?.hp ?? 3);

  type Defender = { row: PlacementRow; power: number; hp: number };
  const placementRows = await db.select().from(schema.fieldPlacements)
    .where(and(eq(schema.fieldPlacements.ownerKey, ownerKey), eq(schema.fieldPlacements.tileId, seed.tile_id)));
  const defenders: Defender[] = [];
  for (const row of placementRows) {
    const payload = await awakenedPayloadById(row.awakenedId);
    defenders.push({ row, power: payload?.power ?? 0, hp: row.hp ?? (await placementMaxHp(row.awakenedId)) });
  }
  const stoodIds = defenders.map(d => d.row.awakenedId);

  const xpById = new Map<number, XpGainReport>();
  let totalFells = 0;
  let waveCleared = false;

  if (defenders.length > 0) {
    const fray = Array.from({ length: wave }, () => frayHpEach);
    const frayAlive = () => fray.some(h => h > 0);
    const fellBy = new Map<number, number>();
    let standing = [...defenders];
    let rounds = 0;
    while (frayAlive() && standing.length > 0 && rounds < 500) {
      rounds++;
      // The company strikes: filed power, blow by blow down the line.
      for (const d of standing) {
        let blow = d.power;
        while (blow > 0 && frayAlive()) {
          const i = fray.findIndex(h => h > 0);
          const dealt = Math.min(blow, fray[i]);
          fray[i] -= dealt; blow -= dealt;
          if (fray[i] <= 0) fellBy.set(d.row.awakenedId, (fellBy.get(d.row.awakenedId) ?? 0) + 1);
        }
        if (!frayAlive()) break;
      }
      if (!frayAlive()) break;
      // The surviving Fray answer: each strikes the weakest standing.
      let strikes = fray.filter(h => h > 0).length * frayPower;
      while (strikes-- > 0 && standing.length > 0) {
        let weakest = standing[0];
        for (const d of standing) if (d.hp < weakest.hp) weakest = d;
        const res = await damagePlacement(weakest.row, frayPower);
        weakest.hp = res.hp;
        weakest.row = { ...weakest.row, hp: res.hp };
        if (res.dissipated) standing = standing.filter(d => d !== weakest);
      }
    }
    waveCleared = !frayAlive();
    // Fell rewards, the Table's numbers through the map's seams.
    for (const [id, fells] of fellBy) {
      totalFells += fells;
      await grantEventXp(xpById, id, 2 * fells);
    }
    if (totalFells > 0) {
      const maxEnergy = await calculateMaxEnergy(ownerKey);
      const current = await getEnergyFor(ownerKey);
      const next = Math.min(current + 3 * totalFells, maxEnergy);
      if (next !== current) {
        await db.update(schema.tenderResources)
          .set({ energy: next, updatedAt: new Date() })
          .where(eq(schema.tenderResources.ownerKey, ownerKey));
      }
    }
    // THE DRIZZLE (Nigel, 2026-10-19): the felled also drop
    // elemental energy — random, and only a fraction of a point,
    // "enough to barely move the attunement bar: 50 Fray = 1
    // point, that kind of math, but at least it's raising." Each
    // Fray felled has a 20% chance to drip +0.1 into a random
    // element's pool — an expectation of exactly that: 0.02 per
    // fell, one point per fifty. Silent bookkeeping: the waves
    // settle lazily on read, so no live enemy stands here to
    // pop from. The drip itself now lives in one place
    // (payFellDrip, above) — the hold's Fray name no ground
    // element of their own, so theirs still lights at random.
    for (let fell = 0; fell < totalFells; fell++) {
      await payFellDrip(ownerKey);
    }
    // Every Awoken who stood in the wave stood in its defense.
    for (const id of stoodIds) {
      await grantEventXp(xpById, id, XP_PER_DEFENSE);
    }
  }

  if (waveCleared) {
    ev.waves_cleared = wave;
    const newLevel = firstSeedLevelFor(wave);
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
    if (newLevel > Number(seed.level ?? 1)) {
      sqlite.prepare("UPDATE star_seeds SET level = ? WHERE id = ?").run(newLevel, seed.id);
      // THE THIRD RISING (Nigel, 2026-10-19): the newborn claim
      // that stood here is STRUCK — births from an event drop the
      // value of minted cards, and creation belongs to the Forge
      // he plans. In its place, once ever, the event lays up its
      // reward: a single attunement point of a random element,
      // shining on the Tender's home until gathered by hand
      // (claimFirstSeedReward). The guard is the reward itself:
      // once laid up it is never laid up again, claimed or not.
      if (newLevel === 3 && !ev.reward_element) {
        ev.reward_element = ATTUNEMENT_ELEMENTS[Math.floor(Math.random() * ATTUNEMENT_ELEMENTS.length)];
      }
    }
    if (wave >= FIRST_SEED_MAX_WAVE) {
      ev.state = "done";
      ev.next_wave_at = 0;
    } else {
      ev.next_wave_at = Date.now() + firstSeedWaveGapMs(wave);
    }
  } else {
    // THE DEFENSE FALLS: the run ends. Banked ground is never
    // clawed back — the ladder rolls back only to the banked
    // level's rung; unbanked, the seed simply waits, whole.
    ev.state = "waiting";
    ev.next_wave_at = 0;
    ev.waves_cleared = ev.banked ? Number(seed.level ?? 1) * 3 : 0;
  }
  saveFirstSeedEvent(ev);
}

/** The hold's lazy settle: at most one wave lands per read, and
 *  the next is always scheduled from now — absence is never
 *  punished with a pile of unattended waves (Anti-Duolingo). */
async function settleFirstSeedEvent(ownerKey: string): Promise<void> {
  const ev = firstSeedEventRow(ownerKey);
  if (!ev || ev.state !== "holding" || !ev.next_wave_at) return;
  if (Date.now() < ev.next_wave_at) return;
  await resolveFirstSeedWave(ownerKey, ev);
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

/** A column's force, from the Compendium's canon numbers,
    hardened by the hosting Tender's level (incursions scale
    with Tender level). */
export function incursionRoster(size: number, powerTier: number) {
  const bonus = Math.max(0, powerTier - 1);
  const kinds = [
    { kind: "fray", share: 0.5, power: 1, hp: 3, armor: 4 },
    { kind: "unraveler", share: 0.25, power: 4, hp: 6, armor: 6 },
    { kind: "tangle", share: 0.15, power: 3, hp: 8, armor: 8 },
    { kind: "hollow", share: 0.1, power: 0, hp: 5, armor: 5 },
  ];
  const out: { kind: string; count: number; power: number; hp: number; armor: number }[] = [];
  let left = size;
  kinds.forEach((k, i) => {
    const n = i === kinds.length - 1 ? left : Math.min(left, Math.round(size * k.share));
    if (n > 0) out.push({ kind: k.kind, count: n, power: k.power + Math.floor(bonus / 2), hp: k.hp + bonus, armor: k.armor + bonus });
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
 *  curse — a hex keeps whichever reckoning is kinder. */
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
async function heldSeedHexes(ownerKey: string): Promise<{ q: number; r: number }[]> {
  const rows = sqlite.prepare("SELECT tile_id FROM star_seeds WHERE owner_key = ? AND state = 'held'").all(ownerKey) as { tile_id: number }[];
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

// Boss scaling: significantly harder than regular waves.
// Boss N = equivalent to wave (5 + N*3) in power, with full enemy variety.
function bossPowerFor(bossLevel: number): { totalPower: number; frayCount: number; unravelers: number; hollows: number; tangles: number } {
  const effectiveWave = 5 + bossLevel * 3;
  const unravelers = Math.floor(effectiveWave / 3);
  const hollows = Math.floor(bossLevel / 2); // Hollows from boss 2
  const tangles = Math.floor((bossLevel + 1) / 3); // Tangles from boss 2
  const totalPower = 7 + (effectiveWave - 1) * 2 + unravelers * 4 + hollows * 3 + tangles * 3;
  const frayCount = Math.max(0, totalPower - unravelers * 4 - hollows * 3 - tangles * 3);
  return { totalPower, frayCount, unravelers, hollows, tangles };
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

// Experience, exponential (re-curved 2026-10-13, Nigel): the base constant
// dropped 100 → 20 so the Hall's peaceful path teaches itself — one 10✦
// feed (20 XP) now takes a fresh Awoken to level 1, while battles (60 XP)
// remain the faster road. Thresholds: L1=20, L2=50, L3=95, L5=264,
// L10≈2267. Total XP for level L = 20 * (1.5^L - 1) / (1.5 - 1), rounded.
function xpForLevel(level: number): number {
  if (level <= 0) return 0;
  // Geometric series: 20 * (1.5^level - 1) / (1.5 - 1)
  return Math.round(20 * (Math.pow(1.5, level) - 1) / 0.5);
}
function levelForXp(xp: number): number {
  let level = 0;
  xp = Math.max(0, xp);
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}
function xpProgress(xp: number): { level: number; current: number; next: number; progress: number } {
  const level = levelForXp(xp);
  const current = xpForLevel(level);
  const next = xpForLevel(level + 1);
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
 *  The single form of the scale deployBattle always charged inline. */
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

// ── THE SKILL ZODIAC (Nigel's directive via Law, 2026-10-17):
// the catalogue rides the wheel. Points: EVERY LEVEL grants
// multiple skill points — the per-level number is a single
// tunable constant (Law's arithmetic note: 5/level x 10
// levels = the budget law's 50 exactly); the canopy pool is
// separate (35 in a life, "a later light": it begins at
// level 6 and grows 7 a level to its 35 at level 10).
export const SKILL_POINTS_PER_LEVEL = 5;
export const CANOPY_POINTS_START_LEVEL = 6;
export const CANOPY_POINTS_PER_LEVEL = 7;

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

async function skillTreeState(ownerKey: string) {
  const progress = await getTenderProgress(ownerKey);
  const rows = sqlite.prepare("SELECT skill_key FROM tender_skills WHERE owner_key = ?").all(ownerKey) as { skill_key: string }[];
  const byId = liveById();
  const unlocked = rows.map(r => r.skill_key).filter(k => byId.has(k));
  const spent: Record<string, number> = { tree: 0, canopy: 0 };
  for (const k of unlocked) { const n = byId.get(k)!; spent[n.pool] += n.cost; }
  const level = progress.level;
  const totals = {
    tree: level * SKILL_POINTS_PER_LEVEL,
    canopy: Math.max(0, level - (CANOPY_POINTS_START_LEVEL - 1)) * CANOPY_POINTS_PER_LEVEL,
  };
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
    tree: { total: totals.tree, spent: spent.tree, left: totals.tree - spent.tree },
    canopy: { total: totals.canopy, spent: spent.canopy, left: totals.canopy - spent.canopy },
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
 *  hp 3 behind armor 4 (ENEMY_STATS / DARK_ARMOR there); the
 *  homeland's wanderers carry the same body now, so blows
 *  land, deepen, and fell — purification is no longer the
 *  only way a wanderer's walking ends. */
export const HOMELAND_FRAY_HP = 3;
export const HOMELAND_FRAY_ARMOR = 4;
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
 *  roll (min 1). */
async function groveBurstHealPlacement(placementId: number, awakenedId: number, half: boolean): Promise<number> {
  const payload = await awakenedPayloadById(awakenedId);
  const element = homelandPlacementElement((payload?.layers ?? []) as any[]);
  let amount = homelandDN(HOMELAND_FATE_DIE[element] ?? 6);
  if (half) amount = Math.max(1, Math.floor(amount / 2));
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
  const element = (["tide", "sky", "stone", "root", "fire"] as const).includes(hue as any) ? hue : "neutral";
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
 *  ground later. The Crown Shard keeps its own hunger: it
 *  springs only for dark of power 5+, and no such dark walks
 *  the homeland — it stands unsprung, as it would at a Table
 *  where only Fray tread. */
async function springHomelandWorking(ownerKey: string, workingId: number, tiles: any[]): Promise<{ sprung: boolean; felled: boolean; ground: number; purified: boolean; pinned: boolean; thrown: boolean }> {
  const none = { sprung: false, felled: false, ground: 0, purified: false, pinned: false, thrown: false };
  const w = sqlite.prepare("SELECT * FROM territory_workings WHERE owner_key = ? AND id = ?").get(ownerKey, workingId) as any;
  if (!w || (w.kind !== "rune" && w.kind !== "spell")) return none;
  const tile = tiles.find((t: any) => t.id === w.tile_id);
  if (!tile) return none;
  let nums: Record<string, number> = {};
  try { nums = JSON.parse(w.nums ?? "{}"); } catch { nums = {}; }
  const wanderer = sqlite.prepare("SELECT id, hp FROM homeland_wanderers WHERE owner_key = ? AND tile_id = ?").get(ownerKey, w.tile_id) as { id: number; hp: number | null } | undefined;
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
  if (w.engine === "blade" || w.engine === "blades") {
    if (!wanderer && !tile.cursed) return none;
    const power = (nums.power ?? (w.engine === "blade" ? 6 : 3)) + (bright ? (nums.brightBonus ?? 1) : 0);
    spendCharge();
    const felled = wanderer ? harmWanderer(power) : false;
    const g = tile.cursed ? await grindHomelandCurse(ownerKey, tile, power, w.hue) : { ground: 0, purified: false };
    return { sprung: true, felled, ground: g.ground, purified: g.purified, pinned: false, thrown: false };
  }
  if (w.engine === "shardrain") {
    if (!wanderer && !tile.cursed) return none;
    // The sky opens ONCE: the pool is rolled whole — the base
    // dice plus one per attunement level snapshotted at the
    // cast — and falls on everything under the writing.
    const dice = Math.max(1, (nums.diceBase ?? 2) + (nums.dicePerLevel ?? 1) * (nums.rainLevel ?? 0));
    let pool = 0;
    for (let i = 0; i < dice; i++) pool += homelandDN(6);
    sqlite.prepare("DELETE FROM territory_workings WHERE id = ?").run(w.id);
    const felled = wanderer ? harmWanderer(pool) : false;
    const g = tile.cursed ? await grindHomelandCurse(ownerKey, tile, pool, w.hue) : { ground: 0, purified: false };
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
    const res = await springHomelandWorking(ownerKey, r.id, tiles);
    // THE FELL DRIP: a wanderer the written light beat pays
    // as any beaten creature pays (Nigel, 2026-10-20).
    if (res.felled) {
      const t = tiles.find((x: any) => x.id === r.tileId);
      await payFellDrip(ownerKey, t?.element ?? null);
    }
  }
}

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
      const a = byQR.get(`${w.q},${w.r}`);
      const d = WALL_DIRS[Number(w.dir ?? 0)] ?? [0, 0];
      const b = byQR.get(`${Number(w.q) + d[0]},${Number(w.r) + d[1]}`);
      groundTiles = [a, b].filter(Boolean);
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
            if (pt && hexDistTiles(pt, st) <= sapRadius) await groveBurstHealPlacement(p.id, p.awakenedId, true);
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
          if (cover > 0) await mendPlacement(p.id, beats * healPerBreath * cover);
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

  async renameDeck(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z
      .object({ id: z.number().int().positive(), name: z.string().trim().min(1).max(60) })
      .safeParse(args);
    if (!parsed.success) badRequest("Invalid rename.");
    await ownDeck(parsed.data.id, ownerKey);
    await db.update(schema.decks).set({ name: parsed.data.name }).where(eq(schema.decks.id, parsed.data.id));
    return okResponse.parse({ ok: true });
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
      .set({ cursed: 0, element: "neutral", curseHp: null, curseMaxHp: null, ...PURIFIED_TILE_FIELDS })
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
      // Purify!
      await db.update(schema.territoryTiles)
        .set({ cursed: 0, element: "neutral", curseHp: null, curseMaxHp: null, ...PURIFIED_TILE_FIELDS })
        .where(eq(schema.territoryTiles.id, parsed.data.tileId));
      await expandFrontier(ownerKey, tiles[0].q, tiles[0].r);
      for (const id of parsed.data.survivorIds) {
        await grantEventXp(xpById, id, XP_PER_HEX_TAKEN);
      }
      // Only BOSS fights free new Awoken (Nigel, 2026-10-14):
      // purification births are abolished — too many unnamed Awoken
      // were simply popping up. No claim is recorded here, ever: the
      // old boss-wave (900+) check that stood in this spot could never
      // fire (the ladder never holds a 900+ wave number) and boss
      // victories now record their claim in resolveBossBattle, the
      // boss's own resolution path (War-Ground fix, 2026-10-15).
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

  async cleanDeckCards(args: unknown) {
    const parsed = z.object({
      dryRun: z.boolean().default(true),
      awakenedIds: z.array(z.number().int().positive()).optional(),
      imagelessOnly: z.boolean().default(false),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    // Find deck_cards to remove
    let cards;
    if (parsed.data.awakenedIds?.length) {
      // Specific cards
      cards = await db.select({
        deckId: schema.deckCards.deckId,
        awakenedId: schema.deckCards.awakenedId,
        imageBlobKey: schema.awakened.imageBlobKey,
        name: schema.awakened.name,
      }).from(schema.deckCards)
        .innerJoin(schema.awakened, eq(schema.deckCards.awakenedId, schema.awakened.id))
        .where(inArray(schema.deckCards.awakenedId, parsed.data.awakenedIds));
    } else {
      // All cards, optionally filtered to imageless only
      cards = await db.select({
        deckId: schema.deckCards.deckId,
        awakenedId: schema.deckCards.awakenedId,
        imageBlobKey: schema.awakened.imageBlobKey,
        name: schema.awakened.name,
      }).from(schema.deckCards)
        .innerJoin(schema.awakened, eq(schema.deckCards.awakenedId, schema.awakened.id));
    }
    const targets = parsed.data.imagelessOnly
      ? cards.filter(c => !c.imageBlobKey || c.imageBlobKey.trim() === "")
      : cards;
    if (!parsed.data.dryRun) {
      for (const t of targets) {
        await db.delete(schema.deckCards)
          .where(and(
            eq(schema.deckCards.deckId, t.deckId),
            eq(schema.deckCards.awakenedId, t.awakenedId)
          ));
      }
    }
    return { ok: true as const, removed: parsed.data.dryRun ? 0 : targets.length, found: targets.length, cards: targets.map(t => ({ deckId: t.deckId, awakenedId: t.awakenedId, name: t.name })) };
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
  // called. Aspect points now move only through claimAspectGrant,
  // which consumes a grant a verified boss victory recorded.

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

  /** Unlock a skill on the wheel. The catalogue's law is
   *  enforced whole: points from the right pool, the Heart
   *  first, named requirements held, attunement gates open,
   *  and a ROAD of held skills from the Heart — the wheel
   *  is walked, not jumped to. */
  async unlockSkill(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const key = String((args as any)?.key ?? "");
    const node = liveById().get(key);
    if (!node) badRequest("No such skill stands on the wheel.");
    if (node.kind === "center") badRequest("The Heart is not bought — it beats already, and its ring is the first road.");
    const state = await skillTreeState(ownerKey);
    const owned = new Set(state.unlocked);
    if (owned.has(key)) badRequest(`${node.name} is already yours.`);
    const pool = node.pool === "canopy" ? state.canopy : state.tree;
    if (pool.left < node.cost) badRequest(`${node.name} costs ${node.cost} ${node.pool} point${node.cost > 1 ? "s" : ""} — you hold ${pool.left}. Levels grant ${SKILL_POINTS_PER_LEVEL} tree points each; the wheel is a life's walking.`);
    const heartHeld = state.unlocked.some(k => liveById().get(k)?.sector === "heart");
    if (node.sector !== "heart" && !heartHeld) badRequest("The Heart must beat before the limbs move — take a heart-ring skill first.");
    if (node.anyCore && !state.unlocked.some(k => k.startsWith("c_"))) badRequest("The Long Watch keeps company — another heart-ring skill must be held first.");
    if (node.gate) {
      const lvl = state.attunementLevels[node.gate.el] ?? 0;
      if (lvl < node.gate.level) badRequest(`${node.name} stands behind the ${node.gate.el} gate: your ${node.gate.el} attunement is level ${lvl}, and the road opens at level ${node.gate.level}.`);
    }
    for (const req of node.requires) {
      if (!owned.has(req)) badRequest(`${node.name} requires ${liveById().get(req)?.name ?? req} first — the catalogue's law.`);
    }
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
  /** THE BASTION ANCHOR (Phase D, 2026-10-19): where a fallen
   *  Tender wakes. The bastion rule's own chain — his bastion's
   *  tile, else the pure heart, else his first purified hex —
   *  walked with one guard tenderStand does not need: the wake
   *  never lands mid-curse, so a cursed bastion tile is passed
   *  over for clean ground. */
  async bastionAnchorTileId(ownerKey: string, tiles: any[]): Promise<number | null> {
    const byId = new Map<number, any>(tiles.map((t: any) => [t.id, t]));
    try {
      const b = sqlite.prepare("SELECT b.tile_id AS tileId FROM star_seeds s JOIN territory_buildings b ON b.id = s.bastion_building_id WHERE s.owner_key = ? AND s.bastion_building_id IS NOT NULL LIMIT 1").get(ownerKey) as { tileId: number } | undefined;
      if (b && byId.has(b.tileId) && !byId.get(b.tileId).cursed) return b.tileId;
    } catch { /* no bastion yet — the chain walks on */ }
    const heart = tiles.find((t: any) => t.q === 0 && t.r === 0 && !t.cursed);
    if (heart) return heart.id;
    const pure = tiles.filter((t: any) => !t.cursed)
      .sort((a: any, b: any) => (Math.abs(a.q) + Math.abs(a.r)) - (Math.abs(b.q) + Math.abs(b.r)) || a.id - b.id);
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
   *  the nearest open ring hex, at their own gait — the homeland
   *  twin of the Table's musterFollowers, settled lazily on read
   *  exactly where marches already settle. */
  async settleTenderMuster(ownerKey: string, tiles: any[], anchorTileId: number): Promise<void> {
    const anchor = tiles.find((t: any) => t.id === anchorTileId);
    if (!anchor) return;
    const dist = (a: any, b: any) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
    const placements = await db.select().from(schema.fieldPlacements).where(eq(schema.fieldPlacements.ownerKey, ownerKey));
    const followers = (placements as any[]).filter(p => p.follow === 1 && !p.marchPath);
    if (!followers.length) return;
    const slots = tiles.filter((t: any) => !t.cursed && (t.z ?? 0) === 0 && (t.buildStage ?? 0) !== 1 && dist(t, anchor) <= 1)
      .sort((a: any, b: any) => dist(a, anchor) - dist(b, anchor) || a.id - b.id);
    if (!slots.length) return;
    const loadOf = (tileId: number) => (placements as any[]).reduce((n, p) => {
      if (p.tileId === tileId && !p.marchPath) return n + 1;
      if (p.marchPath) { try { const r = JSON.parse(p.marchPath); if (Array.isArray(r) && r[r.length - 1] === tileId) return n + 1; } catch { /* broken roads hold no room */ } }
      return n;
    }, 0);
    const now = Date.now();
    for (const p of followers) {
      const home = tiles.find((t: any) => t.id === p.tileId);
      if (!home || dist(home, anchor) <= 1) continue;
      for (const slot of slots) {
        if (loadOf(slot.id) >= 4) continue;
        const road = findRoad(tiles as any, p.tileId, slot.id);
        if (!road || road.length < 2) continue;
        const awRows = await db.select().from(schema.awakened).where(eq(schema.awakened.id, p.awakenedId)).limit(1);
        const aw = awRows[0] as any;
        let layers: { element?: string | null }[] = [];
        try { layers = JSON.parse(aw?.compositionJson ?? "[]"); } catch { layers = []; }
        const secPerHex = marchSecondsPerHexFor(layers, aw?.experience ?? 0);
        const cursedById = new Map((tiles as any[]).map((t: any) => [t.id, !!t.cursed]));
        await db.update(schema.fieldPlacements)
          .set({ marchPath: JSON.stringify(road), marchSince: now, marchEnds: now + Math.round(marchWeightedSeconds(road, secPerHex, (id) => !!cursedById.get(id)) * 1000), marchGoal: null })
          .where(eq(schema.fieldPlacements.id, p.id));
        p.marchPath = JSON.stringify(road);
        break;
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
   *  he WAKES AT THE BASTION, half-healed. */
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
      const anchor = await this.bastionAnchorTileId(ownerKey, tiles);
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

  /** PHASE D — THE BLIND FRAY LAW (Nigel, 2026-10-19): while the
   *  Tender is online (his map read is the world's pulse), cursed
   *  hexes in the OUTER view of his stand — rings 3–6 — roll on
   *  each spawn beat (~45s) to birth a Fray (THE TUNING, Nigel,
   *  2026-10-20: 20% a beat, at most 8 alive, and nothing is born
   *  at rings 0–2 beside him — at 35% with the curse three tiles
   *  out he was set upon from all sides the moment he looked).
   *  The Fray has no eyes:
   *  on cursed ground it only wanders, blind; it turns hostile
   *  ONLY at the purified border, chewing what stands on the
   *  clean hexes beside it — his fielded Awokin first (the
   *  shield law), the Tender himself only when nothing stands.
   *  Purified ground is death to it: the light takes its own.
   *  Settles lazily on read, like the marches and the columns. */
  async settleWanderers(ownerKey: string, tiles: any[], standTileId: number | null): Promise<{ views: { id: number; tileId: number; hp: number; maxHp: number }[] }> {
    // The chew's targets, read fresh inside the settle — the
    // response's own placement read happens AFTER this pass, so
    // what the map serves is the walking's true aftermath.
    const placements = await db.select().from(schema.fieldPlacements).where(eq(schema.fieldPlacements.ownerKey, ownerKey)) as any[];
    const SPAWN_BEAT_MS = 45000, SPAWN_CHANCE = 0.20, VIEW_RING = 6, BIRTH_RING = 3, CAP = 8, CATCHUP_BEATS = 4, CHEW = 0.05;
    const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    const now = Date.now();
    const byId = new Map<number, any>(tiles.map((t: any) => [t.id, t]));
    const byKey = new Map<string, any>(tiles.map((t: any) => [`${t.q},${t.r}`, t]));
    const hexDist = (a: any, b: any) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
    // The light takes its own: a wanderer standing on ground that
    // has been purified is unmade with the curse that bore it.
    let rows = sqlite.prepare("SELECT id, tile_id AS tileId, hp, pinned_beats AS pinnedBeats FROM homeland_wanderers WHERE owner_key = ?").all(ownerKey) as { id: number; tileId: number; hp: number | null; pinnedBeats?: number; pinTouched?: boolean }[];
    rows = rows.filter(w => {
      const t = byId.get(w.tileId);
      if (t && t.cursed) return true;
      sqlite.prepare("DELETE FROM homeland_wanderers WHERE id = ?").run(w.id);
      return false;
    });
    // SPAWN BEATS — rolled per beat due, a capped catch-up so an
    // absence is weather, not a flood; beats skipped past the cap
    // are settled as spent, never banked.
    if (standTileId != null) {
      const stand = byId.get(standTileId);
      const prow = sqlite.prepare("SELECT wanderer_anchor_at AS anchor, wanderer_settled_beats AS settled FROM tender_progress WHERE owner_key = ?").get(ownerKey) as any;
      if (stand && prow) {
        if (prow.anchor == null) {
          sqlite.prepare("UPDATE tender_progress SET wanderer_anchor_at = ?, wanderer_settled_beats = 0 WHERE owner_key = ?").run(now, ownerKey);
        } else {
          const due = Math.floor((now - Number(prow.anchor)) / SPAWN_BEAT_MS);
          const fresh = due - Number(prow.settled ?? 0);
          if (fresh > 0) {
            const beats = Math.min(fresh, CATCHUP_BEATS);
            // THE OUTER VIEW ONLY (the Tuning, Nigel 2026-10-20):
            // a cursed hex rolls for a birth only at rings
            // BIRTH_RING..VIEW_RING of his stand — nothing is
            // born on the dark beside him, at rings 0–2.
            const view = tiles.filter((t: any) => { if (!t.cursed) return false; const d = hexDist(t, stand); return d >= BIRTH_RING && d <= VIEW_RING; });
            for (let b = 0; b < beats && rows.length < CAP; b++) {
              const occupied = new Set(rows.map(w => w.tileId));
              for (const t of view) {
                if (rows.length >= CAP) break;
                if (occupied.has(t.id)) continue;
                if (Math.random() < SPAWN_CHANCE) {
                  const info = sqlite.prepare("INSERT INTO homeland_wanderers (owner_key, tile_id, kind, spawned_at, hp) VALUES (?, ?, 'fray', ?, ?)").run(ownerKey, t.id, now, HOMELAND_FRAY_HP);
                  rows.push({ id: Number(info.lastInsertRowid), tileId: t.id, hp: HOMELAND_FRAY_HP, pinnedBeats: 0 });
                  occupied.add(t.id);
                }
              }
            }
            sqlite.prepare("UPDATE tender_progress SET wanderer_settled_beats = ? WHERE owner_key = ?").run(due, ownerKey);
          }
        }
      }
    }
    // THE WARDS AT THE BORDER (Homeland Casting, Nigel
    // 2026-10-20): the Tender's cast wards of the holding kinds
    // — the Seal, the Trees — stand in the chew's road. Loaded
    // once per settle; their stops, wounds and breaking are
    // carried in memory across the walk's steps and written
    // back at its end, like the victims' hpCarry below. An
    // Engine standing anywhere on his land burns his workings
    // a degree brighter, as at the Table.
    const wardByEdge = new Map<string, any>();
    let mapBright = false;
    for (const w of sqlite.prepare("SELECT id, engine, edge_key AS edgeKey, nums, hp, max_hp AS maxHp, stops FROM territory_workings WHERE owner_key = ? AND kind = 'ward'").all(ownerKey) as any[]) {
      if (w.engine === "engine") mapBright = true;
      if ((w.engine === "seal" || w.engine === "trees") && w.edgeKey && (w.hp ?? 0) > 0) {
        try { w.nums = JSON.parse(w.nums ?? "{}"); } catch { w.nums = {}; }
        wardByEdge.set(w.edgeKey, w);
      }
    }
    const deadWanderers = new Set<number>();
    /** Turn one bite aside at a warded edge: the ward takes the
     *  blow that was aimed at what it guards. Returns true when
     *  a ward stood in the bite's road (the guarded is then
     *  untouched — the defense Nigel asked casting for). */
    const turnChewAtWard = (w: { id: number; hp: number | null }, fromTile: any, victimTile: any, bite: number): boolean => {
      const key = homelandEdgeKeyBetween(fromTile, victimTile);
      if (!key) return false;
      const ward = wardByEdge.get(key);
      if (!ward || ward.spent) return false;
      if (ward.engine === "seal") {
        ward.stops = (ward.stops ?? 0) + 1;
        ward.hp = (ward.hp ?? 0) - bite;
        ward.touched = true;
        // The Seal ANSWERS the striker (the book's riposte),
        // a degree brighter while an Engine burns.
        const riposte = (ward.nums.riposte ?? 3) + (mapBright ? (ward.nums.brightBonus ?? 1) : 0);
        const cur = w.hp == null ? HOMELAND_FRAY_HP : Number(w.hp);
        const next = cur - riposte;
        w.hp = next;
        if (next <= 0) {
          sqlite.prepare("DELETE FROM homeland_wanderers WHERE id = ?").run(w.id);
          deadWanderers.add(w.id);
        } else {
          sqlite.prepare("UPDATE homeland_wanderers SET hp = ? WHERE id = ?").run(next, w.id);
        }
        // The Seal goes out when its stops are spent or its
        // health is — the Table's two fuses, both honored.
        if (ward.stops >= (ward.nums.stops ?? 3) || ward.hp <= 0) ward.spent = true;
        return true;
      }
      if (ward.engine === "trees") {
        ward.hp = (ward.hp ?? 0) - bite;
        ward.touched = true;
        if (ward.hp <= 0) ward.spent = true;
        return true;
      }
      return false;
    };
    // THE WALK — steps of the curse's own beat from the watermark;
    // one settle never walks more than a minute of them.
    const dissipated = new Set<number>();
    const wrow = sqlite.prepare("SELECT wanderer_watermark AS wm FROM tender_progress WHERE owner_key = ?").get(ownerKey) as any;
    if (wrow) {
      if (wrow.wm == null) {
        sqlite.prepare("UPDATE tender_progress SET wanderer_watermark = ? WHERE owner_key = ?").run(now, ownerKey);
      } else {
        const elapsed = Math.min(now - Number(wrow.wm), 60000);
        if (elapsed >= 1000) {
          sqlite.prepare("UPDATE tender_progress SET wanderer_watermark = ? WHERE owner_key = ?").run(now, ownerKey);
          const steps = Math.floor(elapsed / 2800);
          const standTile = standTileId != null ? byId.get(standTileId) : null;
          // damagePlacement reckons from the row it is handed —
          // carry each victim's running wounds across this
          // settle's steps, or no bite would ever deepen.
          const hpCarry = new Map<number, number>();
          for (let s = 0; s < steps; s++) {
            // The Trees mend themselves as the curse's beats
            // pass — their regrow, toward the measure they
            // were raised with, never past it.
            for (const ward of wardByEdge.values()) {
              if (ward.engine === "trees" && !ward.spent) {
                const grown = Math.min(ward.maxHp ?? ward.hp ?? 0, (ward.hp ?? 0) + (ward.nums.regrow ?? 2));
                if (grown !== ward.hp) { ward.hp = grown; ward.touched = true; }
              }
            }
            for (const w of rows) {
              if (deadWanderers.has(w.id)) continue;
              const t = byId.get(w.tileId);
              if (!t || !t.cursed) continue;
              // PINNED (Homeland Casting): a Lattice's hold
              // stands over this dark — it neither wanders nor
              // chews while its beats run out.
              if ((w.pinnedBeats ?? 0) > 0) { w.pinnedBeats = (w.pinnedBeats ?? 0) - 1; w.pinTouched = true; continue; }
              const nbrs = DIRS.map(([dq, dr]) => byKey.get(`${t.q + dq},${t.r + dr}`)).filter(Boolean) as any[];
              const pureNbrs = nbrs.filter(n => !n.cursed);
              if (pureNbrs.length) {
                // HOSTILE AT THE BORDER: his Awokin standing on
                // the clean hexes beside it are chewed first;
                // the Tender only when nothing of his stands.
                let chewed = false;
                for (const n of pureNbrs) {
                  const cand = placements.find(p => p.tileId === n.id && !dissipated.has(p.id));
                  if (cand) {
                    const cMax = await placementMaxHp(cand.awakenedId);
                    const bite = Math.max(1, Math.round(cMax * CHEW));
                    // THE WARD AT THE BORDER (Homeland
                    // Casting): a holding ward on the edge
                    // between the dark and what it guards
                    // takes the bite itself — the guarded
                    // stands untouched while it holds.
                    if (turnChewAtWard(w, t, n, bite)) { chewed = true; break; }
                    const res = await damagePlacement({ ...cand, hp: hpCarry.get(cand.id) ?? cand.hp } as any, bite);
                    hpCarry.set(cand.id, res.hp);
                    if (res.dissipated) dissipated.add(cand.id);
                    chewed = true;
                    break;
                  }
                }
                if (!chewed && standTile && pureNbrs.some(n => n.id === standTile.id)) {
                  const progress = await getTenderProgress(ownerKey);
                  const bite = Math.max(1, Math.round(progress.maxTenderHp * CHEW));
                  if (!turnChewAtWard(w, t, standTile, bite)) {
                    await this.woundTender(ownerKey, bite);
                  }
                }
              } else {
                // BLIND: it wanders its own dark, one hex a step,
                // never two of its kind to a hex.
                const open = nbrs.filter(n => n.cursed && !rows.some(o => o !== w && o.tileId === n.id));
                if (open.length) {
                  const dest = open[Math.floor(Math.random() * open.length)];
                  sqlite.prepare("UPDATE homeland_wanderers SET tile_id = ? WHERE id = ?").run(dest.id, w.id);
                  w.tileId = dest.id;
                }
              }
            }
          }
          // The wards' and pins' new truth is written back
          // (Homeland Casting): a spent Seal and a broken
          // Trees leave the land; the standing carry their
          // wounds and their counted stops; a Lattice's hold
          // wears by the beats it has held.
          for (const ward of wardByEdge.values()) {
            if (ward.spent) sqlite.prepare("DELETE FROM territory_workings WHERE id = ?").run(ward.id);
            else if (ward.touched) sqlite.prepare("UPDATE territory_workings SET hp = ?, stops = ? WHERE id = ?").run(Math.max(0, Math.floor(ward.hp ?? 0)), ward.stops ?? 0, ward.id);
          }
          for (const w of rows) {
            if (w.pinTouched) sqlite.prepare("UPDATE homeland_wanderers SET pinned_beats = ? WHERE id = ?").run(Math.max(0, w.pinnedBeats ?? 0), w.id);
          }
        }
      }
    }
    // THE FELL DRIP: a wanderer the border Seal's answer
    // felled in the walk pays as any beaten creature pays
    // (Nigel, 2026-10-20) — the element of the ground it fell
    // on, or chance's choice. (The wanderers the turned ground
    // unmade above pay nothing: no blow beat them; the curse
    // simply lost its hold on the land beneath them.)
    for (const id of deadWanderers) {
      const w = rows.find(r => r.id === id);
      const t = w ? byId.get(w.tileId) : null;
      await payFellDrip(ownerKey, t?.element ?? null);
    }
    return { views: rows.filter(w => !deadWanderers.has(w.id)).map(w => ({ id: w.id, tileId: w.tileId, hp: w.hp == null ? HOMELAND_FRAY_HP : Number(w.hp), maxHp: HOMELAND_FRAY_HP })) };
  },

  /** THE HOMELAND WEAPON REFEREE (Nigel, 2026-10-20): while
   *  the Tender stands on his homeland — classed, armed, and
   *  not fallen — his runic weapon hunts on the homeland's own
   *  rhythm (this lazy settle, like the marches, the columns
   *  and the wanderers before it): on the Table's own cadence
   *  it strikes the nearest Blind Fray within its reach of his
   *  stand, with the Table's own roll — Fate's level step, and
   *  the Sage's +2 on her own blows — against the Fray's armor,
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
    // The tiles this settle's blows felled a wanderer on —
    // each fell pays the drip (payFellDrip) once the striking
    // is done, in the ground's own element where it holds one.
    const fellTiles: number[] = [];
    while (nextAt <= now && strikes < 40) {
      const foes = (sqlite.prepare("SELECT id, tile_id AS tileId, hp FROM homeland_wanderers WHERE owner_key = ?").all(ownerKey) as { id: number; tileId: number; hp: number | null }[])
        .map(w => ({ ...w, tile: tiles.find((t: any) => t.id === w.tileId), hpNow: w.hp == null ? HOMELAND_FRAY_HP : Number(w.hp) }))
        .filter(w => w.tile && hexDist(stand, w.tile) <= range)
        .sort((a, b) => hexDist(stand, a.tile) - hexDist(stand, b.tile) || a.id - b.id);
      if (!foes.length) { nextAt = now; dirty = true; break; } // no prey: the cadence is spent, never banked
      const strikeAt = nextAt;
      const blow = (foe: typeof foes[number]) => {
        const roll = homelandDN(20);
        const bonus = homelandWeaponBonusFor(progress.classKey, progress.level);
        const hit = roll === 20 || (roll !== 1 && roll + bonus >= HOMELAND_FRAY_ARMOR);
        let dmg = 0;
        if (hit) {
          dmg = homelandFateMitigate(homelandWeaponDamageFor(wk, contract.level, !!contract.signature), HOMELAND_FRAY_ARMOR, progress.level);
          foe.hpNow -= dmg;
        }
        const felled = hit && foe.hpNow <= 0;
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
    // Hourly binding heal: check if anything is wounded, heal if so
    await this.bindingHealTick({}, ctx);
    // Self-heal: if the frontier is stuck (no cursed tiles beyond purified land), grow it.
    await ensureFrontierBuffer(ownerKey);
    const tiles = await db.select().from(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
    // The Seed-Calm's reach, served (Nigel, 2026-10-17): any
    // tile within two rings of a held seed carries the level
    // the curse WOULD be reckoned at there — its distance
    // from the seed — so the map can show the calm lying on
    // the land.
    {
      const seedHexes = await heldSeedHexes(ownerKey);
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
    if (tenderStand) await this.settleTenderMuster(ownerKey, tiles as any[], tenderStand.tileId);
    // PHASE D — THE LIVING HOMELAND settles on the same read
    // (Nigel, 2026-10-19): the Tender's own body answers the
    // curse (and wakes at the bastion), and the Blind Fray walks.
    // Both passes run BEFORE the field is read for the response,
    // so a wake's new stand and a chew's wounds are what the map
    // serves — never their ghosts.
    let wandererViews: { id: number; tileId: number; hp: number; maxHp: number }[] = [];
    let weaponStrikeView: { tileId: number; wandererId: number; weaponKey: string; at: number; hit: boolean; dmg: number; felled: boolean } | null = null;
    let tenderView: any = tenderStand;
    if (tenderStand) {
      const stoodTileId = await this.settleTenderBody(ownerKey, tiles as any[], tenderStand.tileId);
      tenderStand.tileId = stoodTileId;
      const wres = await this.settleWanderers(ownerKey, tiles as any[], tenderStand.tileId);
      wandererViews = wres.views;
      // HOMELAND CASTING (Nigel, 2026-10-20): the written
      // ground answers the dark now standing on it — blades
      // spring, lattices pin, coils throw back — before the
      // weapon looks for its quarry among the survivors.
      await settleHomelandWorkings(ownerKey, tiles as any[]);
      // THE CURSE EATS THE WRITTEN LIGHT (Nigel, 2026-10-20):
      // the workings standing on cursed ground wither beside
      // their guests, on this same read — wards and runes are
      // cast anywhere now, and the cursed ground is the price.
      await settleHomelandWorkingAttrition(ownerKey, tiles as any[]);
      // THE HOMELAND WEAPON REFEREE settles after the walk
      // (Nigel, 2026-10-20): his weapon answers the dark that
      // stands within its reach of him. The wanderer views are
      // then read FRESH, so what the map serves is the strike's
      // true aftermath — wounds carried, the felled gone.
      weaponStrikeView = await this.settleHomelandWeapon(ownerKey, tiles as any[], tenderStand.tileId);
      // The Springleaf's groves mend on this same read, after
      // the fighting has had its say (Homeland Casting).
      await settleHomelandGroves(ownerKey, tiles as any[]);
      wandererViews = (sqlite.prepare("SELECT id, tile_id AS tileId, hp FROM homeland_wanderers WHERE owner_key = ?").all(ownerKey) as { id: number; tileId: number; hp: number | null }[])
        .map(w => ({ id: w.id, tileId: w.tileId, hp: w.hp == null ? HOMELAND_FRAY_HP : Number(w.hp), maxHp: HOMELAND_FRAY_HP }));
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
      // Pour pressure into a tile's bank and resolve its 10-point
      // steps. Returns the fields to persist, or null when unmoved.
      // WITNESS RULE (Nigel, 2026-10-15): a company's pour may not
      // complete a stage in the same beat its bank (re)starts — the
      // fresh bank caps at 9, so the seal and its countdown stand on
      // the tile for at least one full beat before the land turns.
      // (Before this, a heavy company flipped a hex between glances
      // and a turned hex fell back with no visible cause.) A shrine's
      // pour is exempt: its five-hour rhythm is its own witness.
      const pour = (tile: any, el: string, pts: number, completeStage = false) => {
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
      };
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
        let grow = (t.growPoints ?? 0) + pts;
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
        for (const v of victims) {
          await db.update(schema.awakened).set({ dispersedUntil }).where(eq(schema.awakened.id, v.awakenedId));
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
    return { tiles, placements, buildings, mood, walls, skills, workings, tender: tenderView, wanderers: wandererViews, weaponStrike: weaponStrikeView, terrainBank: await terrainBankFor(ownerKey) };
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
    await db.update(schema.fieldPlacements).set({ follow: parsed.data.follow ? 1 : 0 }).where(eq(schema.fieldPlacements.id, parsed.data.placementId));
    return { ok: true, follow: parsed.data.follow };
  },

  async deployAwoken(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ awakenedId: z.number().int().positive(), tileId: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid deploy request.");
    // Verify the Tender owns this Awoken and it is not already placed.
    const owned = await db.select({ id: schema.awakened.id }).from(schema.awakened)
      .where(and(eq(schema.awakened.id, parsed.data.awakenedId), eq(schema.awakened.ownerKey, ownerKey))).limit(1);
    if (!owned.length) badRequest("That Awokin is not yours.");
    const already = await db.select({ id: schema.fieldPlacements.id }).from(schema.fieldPlacements)
      .where(and(eq(schema.fieldPlacements.awakenedId, parsed.data.awakenedId), eq(schema.fieldPlacements.ownerKey, ownerKey))).limit(1);
    if (already.length) badRequest("Already on the field.");
    // Court-bound (Nigel, 2026-10-12): housed Awoken and the marked champion
    // stay in hand for battles — they cannot be stationed on field tiles.
    const courtHoused = await db.select({ awakenedId: schema.hallResidents.awakenedId }).from(schema.hallResidents)
      .where(eq(schema.hallResidents.ownerKey, ownerKey));
    const courtChamp = await db.select({ awakenedId: schema.tenderChampions.awakenedId }).from(schema.tenderChampions)
      .where(eq(schema.tenderChampions.ownerKey, ownerKey)).limit(1);
    const courtIds = new Set<number>([...courtHoused.map(r => r.awakenedId), ...(courtChamp.length ? [courtChamp[0].awakenedId] : [])]);
    if (courtIds.has(parsed.data.awakenedId)) badRequest("The court stays in hand — housed Awokin and the champion cannot be stationed on the field.");
    // STAGED AT THE BASTION (Station 4, Nigel 2026-10-20): a
    // waiting reinforcement is at the bastion, not in the
    // hand's play — it takes the field by mustering from the
    // bastion's own hex, or not at all.
    const stagedRow = sqlite.prepare("SELECT awakened_id FROM bastion_staged WHERE owner_key = ? AND awakened_id = ?").get(ownerKey, parsed.data.awakenedId) as any;
    if (stagedRow) badRequest("That Awokin waits at the bastion — muster it from the bastion's hex, or unstage it first.");
    // THE HAND OF TWENTY (Station 4): only the play hand takes
    // the field. The reserve waits in the deck — a free swap
    // away, never stranded, but not fielded from reserve.
    if (!handIdsFor(ownerKey).includes(parsed.data.awakenedId)) badRequest("That Awokin waits in your reserve — bring it into your hand of twenty before it takes the field.");
    // Verify the tile belongs to the Tender and is not cursed.
    const tile = await db.select().from(schema.territoryTiles)
      .where(and(eq(schema.territoryTiles.id, parsed.data.tileId), eq(schema.territoryTiles.ownerKey, ownerKey))).limit(1);
    if (!tile.length) badRequest("That tile is not yours.");
    if (tile[0].cursed) badRequest("Cursed tiles must be broken by attacks first.");
    if (tile[0].cursed) badRequest("Cannot deploy on cursed land.");
    // THE BUILDING SYSTEM (2026-10-19): no Awokin stands where
    // stone is still gathering, and no road climbs to a floating
    // isle — the isle waits for wings the company does not have.
    if (((tile[0] as any).buildStage ?? 0) === 1) badRequest("The stone has not finished gathering — that ground cannot hold them yet.");
    if (((tile[0] as any).z ?? 0) > 0) badRequest("No road climbs to the floating isle — it waits for wings.");
    const occupied = await db.select({ id: schema.fieldPlacements.id }).from(schema.fieldPlacements)
      .where(eq(schema.fieldPlacements.tileId, parsed.data.tileId));
    if (occupied.length >= 4) badRequest("Tile holds at most 4 Awokin.");
    // Entering the field costs the power-scaled deploy energy — the same
    // price deployBattle charges (deployCostForPower). This is also the
    // recast price for an Awoken that dissipated back to hand at 0 HP.
    const payload = await awakenedPayloadById(parsed.data.awakenedId);
    const cost = deployCostForPower(payload?.power ?? 1);
    if (!(await spendEnergy(ownerKey, cost))) badRequest("Not enough energy.");
    await db.insert(schema.fieldPlacements).values({
      ownerKey, awakenedId: parsed.data.awakenedId, tileId: parsed.data.tileId,
      hp: await placementMaxHp(parsed.data.awakenedId),
    });
    return okResponse.parse({ ok: true });
  },

  /**
   * Battle deployment: send 1-4 Awoken from the battle pool to a tile.
   * If the tile is cursed and the combined power on it meets the curse weight,
   * the dark breaks — the tile purifies, takes the attackers' dominant element,
   * and neighboring cursed tiles start their 48h passive timers.
   */
  async deployBattle(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      awakenedIds: z.array(z.number().int().positive()).min(1).max(4),
      tileId: z.number().int().positive(),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid battle deployment.");
    if (new Set(parsed.data.awakenedIds).size !== parsed.data.awakenedIds.length) {
      badRequest("Each Awokin fights once.");
    }
    const tile = await db.select().from(schema.territoryTiles)
      .where(and(eq(schema.territoryTiles.id, parsed.data.tileId), eq(schema.territoryTiles.ownerKey, ownerKey))).limit(1);
    if (!tile.length) badRequest("That tile is not yours.");
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
    for (const f of fighters) {
      if (!canTouchAwoken(f, ownerKey)) badRequest("That Awokin is not yours to send.");
      if (placedIds.has(f.id)) badRequest("Already on the field.");
      // Court-bound (Nigel, 2026-10-12): housed Awoken and the marked champion
      // stay in hand for battles — they cannot be stationed on field tiles.
      const courtHoused = await db.select({ awakenedId: schema.hallResidents.awakenedId }).from(schema.hallResidents)
        .where(eq(schema.hallResidents.ownerKey, ownerKey));
      const courtChamp = await db.select({ awakenedId: schema.tenderChampions.awakenedId }).from(schema.tenderChampions)
        .where(eq(schema.tenderChampions.ownerKey, ownerKey)).limit(1);
      const courtIds = new Set<number>([...courtHoused.map(r => r.awakenedId), ...(courtChamp.length ? [courtChamp[0].awakenedId] : [])]);
      if (courtIds.has(f.id)) badRequest(`${f.name} is of the court — housed Awokin and the champion stay in hand for battles.`);
      // STAGED AT THE BASTION (Station 4, Nigel 2026-10-20):
      // a waiting reinforcement fights from the bastion's hex
      // by mustering — it is not in the battle pool while staged.
      const stagedF = sqlite.prepare("SELECT awakened_id FROM bastion_staged WHERE owner_key = ? AND awakened_id = ?").get(ownerKey, f.id) as any;
      if (stagedF) badRequest(`${f.name} waits at the bastion — muster it onto the bastion's hex before it fights on the field.`);
    }
    const occupied = await db.select({ id: schema.fieldPlacements.id }).from(schema.fieldPlacements)
      .where(eq(schema.fieldPlacements.tileId, parsed.data.tileId));
    if (occupied.length + fighters.length > 4) badRequest("Tile holds at most 4 Awokin.");
    // Server-authoritative deploy cost: 2 + floor((power - 1) / 3) per fighter
    const assetRows = await db.select().from(schema.layerAssets);
    const assetStats = new Map<number, AssetStats>();
    for (const r of assetRows) {
      const rar = raritySchema.safeParse(r.rarity);
      if (rar.success) assetStats.set(r.id, { name: r.name, rarity: rar.data, power: r.power, toughness: r.toughness, element: (r as any).element ?? null });
    }
    let totalCost = 0;
    for (const f of fighters) {
      // True (payload) power — empowerment/stories/aspects count, matching
      // the cost the client quoted from the same payload stats.
      const layers = parseLayers(f.compositionJson, assetStats);
      const payload = await awakenedPayloadById(f.id);
      const power = payload?.power ?? layers.reduce((s, l) => s + (l.power ?? 0), 0);
      totalCost += deployCostForPower(power);
    }
    if (!(await spendEnergy(ownerKey, totalCost))) badRequest("Not enough energy.");
    for (const f of fighters) {
      await db.insert(schema.fieldPlacements).values({
        ownerKey, awakenedId: f.id, tileId: parsed.data.tileId,
        hp: await placementMaxHp(f.id),
      });
    }
    // ACTIVE ASSAULT resolution (Corruption Toughness Protocol, and fix
    // list #2, Nigel 2026-10-13: "make the purify real"). The promise in
    // this action's doc comment and the client's `purified` field is now
    // kept by code: assaulting a cursed tile is an ATTACK EVENT for each
    // fighter sent (+10 XP, the unified model), and if the combined true
    // power of ALL Awoken standing on the tile meets the corruption
    // toughness, the dark breaks on the spot.
    const xpShape = z.object({ awakenedId: z.number(), xpGain: z.number(), leveledUp: z.boolean(), newLevel: z.number() });
    const xpById = new Map<number, XpGainReport>();
    let purified = false;
    if (tile[0].cursed) {
      for (const f of fighters) {
        await grantEventXp(xpById, f.id, XP_PER_ATTACK);
      }
      // Every Awoken standing on the tile — the fighters just sent plus
      // any already holding it — lends their power to the break.
      const standing = await db.select({ awakenedId: schema.fieldPlacements.awakenedId })
        .from(schema.fieldPlacements)
        .where(eq(schema.fieldPlacements.tileId, tile[0].id));
      let combinedPower = 0;
      for (const s of standing) {
        const payload = await awakenedPayloadById(s.awakenedId);
        combinedPower += payload?.power ?? 0;
      }
      if (combinedPower >= corruptionToughness(tile[0].q, tile[0].r)) {
        // The tile becomes what its liberators are: the dominant element
        // of all standing Awoken's layers (fire never claims conquered
        // land). A tie stays neutral.
        const standingRows = owned.filter(a => standing.some(s => s.awakenedId === a.id));
        const elementCounts: Record<"tide" | "sky" | "stone" | "root", number> = { tide: 0, sky: 0, stone: 0, root: 0 };
        for (const a of standingRows) {
          for (const layer of parseLayers(a.compositionJson, assetStats)) {
            const el = storedElement((layer as any).element);
            if (el !== "fire" && el !== "neutral") elementCounts[el] += 1;
          }
        }
        let element: "tide" | "sky" | "stone" | "root" | "neutral" = "neutral";
        let maxCount = 0; let tie = false;
        for (const [el, count] of Object.entries(elementCounts)) {
          if (count > maxCount) { maxCount = count; element = el as typeof element; tie = false; }
          else if (count === maxCount && count > 0) { tie = true; }
        }
        if (tie) element = "neutral";
        await db.update(schema.territoryTiles)
          .set({ cursed: 0, element, curseHp: null, curseMaxHp: null, ...PURIFIED_TILE_FIELDS })
          .where(eq(schema.territoryTiles.id, tile[0].id));
        // The neighboring cursed land feels the shift — their 48h
        // passive timers start now (as directAttack does).
        const now = new Date();
        const neighborCoords = [
          [tile[0].q + 1, tile[0].r], [tile[0].q - 1, tile[0].r],
          [tile[0].q, tile[0].r + 1], [tile[0].q, tile[0].r - 1],
          [tile[0].q + 1, tile[0].r - 1], [tile[0].q - 1, tile[0].r + 1],
        ];
        for (const [nq, nr] of neighborCoords) {
          await db.update(schema.territoryTiles)
            .set({ lastPassiveAt: now })
            .where(and(
              eq(schema.territoryTiles.ownerKey, ownerKey),
              eq(schema.territoryTiles.q, nq),
              eq(schema.territoryTiles.r, nr),
              eq(schema.territoryTiles.cursed, 1),
            ));
        }
        // Reveal new cursed land at the frontier, as every other
        // purification does.
        await expandFrontier(ownerKey, tile[0].q, tile[0].r);
        // HEX TAKEN: the hex was taken by all who stood in the break —
        // the curse_broken deed and +50 XP go to every liberator.
        for (const s of standing) {
          await recordDeed(ownerKey, s.awakenedId, "curse_broken");
          await grantEventXp(xpById, s.awakenedId, XP_PER_HEX_TAKEN);
        }
        purified = true;
        // No newborn follows a purification any more (Nigel,
        // 2026-10-14): only boss fights free new Awoken.
      }
    }
    return z.object({ ok: z.literal(true), purified: z.boolean(), xpGains: z.array(xpShape) })
      .parse({ ok: true, purified, xpGains: [...xpById.values()] });
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
    if (tile[0].cursed) badRequest("Cannot move onto cursed land — attack it first.");
    // Must be adjacent.
    const fromTile = await db.select().from(schema.territoryTiles)
      .where(eq(schema.territoryTiles.id, placement[0].tileId)).limit(1);
    if (!fromTile.length) badRequest("Mover has no ground.");
    const dq = Math.abs(tile[0].q - fromTile[0].q);
    const dr = Math.abs(tile[0].r - fromTile[0].r);
    const dist = Math.max(dq, dr, Math.abs((tile[0].q + tile[0].r) - (fromTile[0].q + fromTile[0].r)));
    if (dist !== 1) badRequest("Can only move to adjacent tiles.");
    // Tile capacity: max 4.
    const occupied = await db.select({ id: schema.fieldPlacements.id })
      .from(schema.fieldPlacements)
      .where(eq(schema.fieldPlacements.tileId, parsed.data.tileId));
    if (occupied.length >= 4) badRequest("Tile holds at most 4 Awokin.");
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
      .set({ tileId: tile[0].id, lastMovedAt: new Date() })
      .where(eq(schema.fieldPlacements.id, placement[0].id));
    return z.object({ ok: z.literal(true) }).parse({ ok: true });
  },


  async getBossWave(args: unknown, ctx?: ActionContext) {
    const parsed = z.object({
      bossLevel: z.number().int().min(1).max(99),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid boss level.");
    const { totalPower, frayCount, unravelers, hollows, tangles } = bossPowerFor(parsed.data.bossLevel);
    return {
      waveNumber: 900 + parsed.data.bossLevel, // Boss waves are 901+
      wavesDefeated: 0,
      frayCount, unravelers, hollows, tangles, totalPower,
      isBoss: true,
      bossLevel: parsed.data.bossLevel,
    };
  },

  /** The boss ladder as the server holds it: how many bosses this
   *  tender has broken, which boss comes next, and whether a fresh
   *  3-Unraveling cycle has opened the boss window. (Replaces the
   *  client's old localStorage count, which the server never saw.) */
  async getBossState(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const boss = loadBossState(ownerKey);
    const waveRows = await db.select().from(schema.waveState)
      .where(eq(schema.waveState.ownerKey, ownerKey)).limit(1);
    const wavesDefeated = waveRows[0]?.wavesDefeated ?? 0;
    return {
      bossesDefeated: boss.bossesDefeated,
      nextBossLevel: boss.bossesDefeated + 1,
      eligible: bossEligible(wavesDefeated, boss),
      wavesDefeated,
      cycleProgress: wavesDefeated % 3,
    };
  },

  /** Resolve a boss battle — the boss's own verified path, beside the
   *  wave ladder rather than forced through it (War-Ground fix,
   *  2026-10-15). The reckoning mirrors resolveBattle: the boss's power
   *  is recomputed server-side from bossPowerFor, survivors must be
   *  committed fighters still placed, a victory needs at least one
   *  survivor and a company whose server-measured power matches the
   *  boss. A victory records the only things that free a newborn: the
   *  newborn claim in the ledger, and a pending aspect grant whose
   *  element split (5 + 2 per boss level, Nigel 2026-10-11) is rolled
   *  here, server-side, at the moment of victory. */
  async resolveBossBattle(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    await this.settleMarches(ownerKey);
    const parsed = z.object({
      victory: z.boolean(),
      bossLevel: z.number().int().min(1).max(99),
      survivorIds: z.array(z.number().int().positive()),
      wallState: z.array(z.object({ edgeKey: z.string(), hp: z.number() })).optional(),
      runesTriggered: z.array(z.string()).optional(),
      grimState: z.array(z.object({
        id: z.number().int().positive(),
        hp: z.number().optional(), stops: z.number().optional(), charges: z.number().optional(),
        spent: z.boolean().optional(),
      })).optional(),
      grimEnergy: z.number().int().min(0).max(500).optional(),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid boss battle result.");

    const boss = loadBossState(ownerKey);
    const expectedLevel = boss.bossesDefeated + 1;
    if (parsed.data.bossLevel !== expectedLevel) {
      badRequest(`Boss mismatch — the next boss is level ${expectedLevel}.`);
    }
    const waveRows = await db.select().from(schema.waveState)
      .where(eq(schema.waveState.ownerKey, ownerKey)).limit(1);
    const wavesDefeated = waveRows[0]?.wavesDefeated ?? 0;
    if (!bossEligible(wavesDefeated, boss)) {
      badRequest("No boss waits — break a full cycle of three Unravelings since the last boss fell.");
    }

    const { totalPower: bossPower } = bossPowerFor(parsed.data.bossLevel);
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
    let committedPower = 0;
    for (const id of fighterIds) {
      const payload = await awakenedPayloadById(id);
      committedPower += payload?.power ?? 0;
    }
    if (parsed.data.victory) {
      if (survivorIds.length === 0) badRequest("A victory with no survivors is no victory.");
      if (committedPower < bossPower) {
        badRequest(`The War-Ground does not reckon this victory — your committed company stands at ${committedPower} against the boss's ${bossPower}.`);
      }
    }

    // Unified XP: the survivors stood in the battle — a DEFENSE EVENT,
    // +10 XP each, win or lose. (No hex is taken from a boss; its prize
    // is the newborn and the aspects, not the +50 hex-taken grant.)
    const xpById = new Map<number, XpGainReport>();
    for (const id of survivorIds) {
      await grantEventXp(xpById, id, XP_PER_DEFENSE);
    }

    // The report is accepted — walls took their damage, win or lose.
    applyWallDamage(ownerKey, parsed.data.wallState);
    applyRunesTriggered(ownerKey, parsed.data.runesTriggered);
    await applyGrimoireState(ownerKey, parsed.data.grimState, parsed.data.grimEnergy);

    if (!parsed.data.victory) {
      sqlite.prepare("UPDATE boss_state SET last_boss_at = ? WHERE owner_key = ?")
        .run(Date.now(), ownerKey);
      return { ok: true as const, victory: false, bossesDefeated: boss.bossesDefeated, committedPower, bossPower, xpGains: [...xpById.values()] };
    }

    for (const id of survivorIds) {
      await recordDeed(ownerKey, id, "battle_won");
    }
    sqlite.prepare("UPDATE boss_state SET bosses_defeated = ?, last_victory_defeated = ?, last_boss_at = ? WHERE owner_key = ?")
      .run(boss.bossesDefeated + 1, wavesDefeated, Date.now(), ownerKey);
    // Only boss victories free newborns (Nigel, 2026-10-14) — the claim
    // is the server's record; birthNewbornToHand consumes it once.
    recordNewbornClaim(ownerKey, "bossVictory");
    // The aspect split is rolled here, not in the client: 5 + 2 per
    // boss level, split randomly among the four elements.
    const grantCount = 5 + parsed.data.bossLevel * 2;
    const elements: AspectElement[] = ["tide", "sky", "stone", "root"];
    const rolled: AspectElement[] = Array.from({ length: grantCount }, () =>
      elements[Math.floor(Math.random() * elements.length)]);
    recordAspectGrant(ownerKey, rolled, `bossVictory:${parsed.data.bossLevel}`);
    return {
      ok: true as const, victory: true,
      bossesDefeated: boss.bossesDefeated + 1,
      committedPower, bossPower,
      aspectElements: rolled, newbornClaimed: true,
      xpGains: [...xpById.values()],
    };
  },

  /** The oldest pending aspect grant waiting for this tender, if any —
   *  what the victory screen shows is the server's roll, not its own. */
  async getPendingAspectGrant(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const grant = peekAspectGrant(ownerKey);
    return { grant };
  },

  /** Claim the oldest pending aspect grant: the recorded elements are
   *  granted exactly once through the same addAspectPoint arithmetic
   *  every grant has always used (points accumulate; at 10 an aspect
   *  may be born into the inventory). */
  async claimAspectGrant(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const grant = consumeAspectGrant(ownerKey);
    if (!grant) badRequest("No aspect grant waits — aspects are earned by a boss victory, and this victory's grant has already been claimed.");
    const spawnedElements: AspectElement[] = [];
    for (const element of grant!.elements) {
      if (await addAspectPoint(ownerKey, element)) spawnedElements.push(element);
    }
    return { ok: true as const, elements: grant!.elements, spawnedElements, source: grant!.source };
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

  // ── The Written Light on the land (the Grimoire, Nigel
  // 2026-10-17) ─────────────────────────────────────────
  // The Tender casts from the book PERSONALLY (wards and runes
  // wake at Tender Lv 3; Heal is the Lv 1 art) — beside the edge
  // works, which remain the skilled Awoken hands' craft. A ward
  // stands on the edge of a hex the Tender's own Awoken holds;
  // a rune is written on a hex's floor (cursed ground included —
  // the light is sown ahead of the march); Heal mends a standing
  // Awoken by the tier law. Numbers snapshot from the book at
  // the cast. Workings stand until spent, broken, or faded here.
  async castMapWorking(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      spellKey: z.string().min(1).max(80),
      hue: z.string().max(20).optional(),
      tileId: z.number().int().positive().optional(),
      dir: z.number().int().min(0).max(5).optional(),
      awakenedId: z.number().int().positive().optional(),
    }).safeParse(args);
    if (!parsed.success) badRequest("The book needs a spell — and a hex, an edge, or an Awokin to receive it.");
    const { spellKey, tileId, dir, awakenedId } = parsed.data;
    const hue = ["unaligned", "tide", "sky", "stone", "root", "fire"].includes(parsed.data.hue ?? "") ? parsed.data.hue! : "unaligned";
    await refreshGrimoire();
    const spell = spellByKey(spellKey);
    if (!spell) badRequest("That spell is not in the book.");
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
    // fizzle spends the charge and lands nothing.
    const castTiles = await db.select().from(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
    const castTileById = new Map(castTiles.map((t) => [t.id, t]));
    const progressRow = sqlite.prepare("SELECT down_until FROM tender_progress WHERE owner_key = ?").get(ownerKey) as { down_until: number | null } | undefined;
    if (progressRow?.down_until != null && Number(progressRow.down_until) > Date.now()) {
      badRequest("Your Tender has fallen — no casting until he wakes at the bastion.");
    }
    const stand = await this.tenderStand(ownerKey, castTiles as any[]);
    const standTile = stand ? castTileById.get(stand.tileId) : null;
    const assertCastReach = (tile: any) => {
      if (!standTile || !tile) badRequest("You have no stand on this land to cast from.");
      if (hexDistTiles(standTile as any, tile as any) > HOMELAND_CAST_RING) {
        badRequest(`“${spell.name}” lies beyond your casting reach — ring ${HOMELAND_CAST_RING} of where you stand.`);
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
      const maxHp = (payload?.toughness ?? 3) + (myTile && towerTiles.some((tt) => hexDist(myTile, tt) <= 1) ? towerBonus : 0);
      const curHp = placement.hp ?? maxHp;
      if (curHp >= maxHp) badRequest(`${payload?.name ?? "That Awokin"} stands whole already.`);
      if (!(await spendEnergy(ownerKey, spell.cost))) badRequest(`Not enough energy — ${spell.name} costs ${spell.cost}.`);
      // The roll (Homeland Casting): the purse is already
      // charged — a fizzle spends it and mends nothing.
      const cast = homelandCastRoll(progress, spell);
      if (!cast.ok) return { ok: true as const, fizzled: true as const, roll: cast.roll, mod: cast.mod, dc: cast.dc, cost: spell.cost, spellKey: spell.key };
      const healed = Math.min(progress.healAmount, maxHp - curHp);
      await db.update(schema.fieldPlacements).set({ hp: curHp + healed })
        .where(eq(schema.fieldPlacements.id, placement.id));
      return { ok: true as const, healed, hp: curHp + healed, maxHp, cost: spell.cost, roll: cast.roll, mod: cast.mod, dc: cast.dc, spellKey: spell.key };
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
      assertCastReach(tile);
      if (!(await spendEnergy(ownerKey, spell.cost))) badRequest(`Not enough energy — ${spell.name} costs ${spell.cost}.`);
      const cast = homelandCastRoll(progress, spell);
      if (!cast.ok) return { ok: true as const, fizzled: true as const, roll: cast.roll, mod: cast.mod, dc: cast.dc, cost: spell.cost, spellKey: spell.key };
      const radiusHexes = Math.max(1, Math.floor(((66 + 12 * progress.level) * 2.75) / 80));
      const now = Date.now();
      // The raising burst: every one of his standing in the
      // glow rolls its OWN element die, as at the Table.
      let burst = 0;
      const placements = await db.select().from(schema.fieldPlacements).where(eq(schema.fieldPlacements.ownerKey, ownerKey));
      for (const p of placements as any[]) {
        const pt = castTileById.get(p.tileId);
        if (pt && hexDistTiles(pt as any, tile) <= radiusHexes) burst += await groveBurstHealPlacement(p.id, p.awakenedId, false);
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
      return { ok: true as const, id: Number(info.lastInsertRowid), tileId, cost: spell.cost, radiusHexes, burst, saplings: sapCount, roll: cast.roll, mod: cast.mod, dc: cast.dc, spellKey: spell.key };
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
    // counted once, there. Heal never reaches here:
    // binding healing requires energy only.

    if (spell.kind === "ward") {
      if (tileId == null || dir == null) badRequest("A ward stands on an edge: name the hex your Awokin holds and the edge (0–5).");
      const tileRows = await db.select().from(schema.territoryTiles)
        .where(and(eq(schema.territoryTiles.id, tileId), eq(schema.territoryTiles.ownerKey, ownerKey)));
      const tile = tileRows[0] as any;
      if (!tile) badRequest("That hex is not yours to ward.");
      assertCastReach(tile);
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
      const [dq, dr] = WALL_DIRS[dir];
      const nq = tile.q + dq, nr = tile.r + dr;
      const flip = nq < tile.q || (nq === tile.q && nr < tile.r);
      const cq = flip ? nq : tile.q, cr = flip ? nr : tile.r, cdir = flip ? WALL_OPP[dir] : dir;
      const edgeKey = `${cq},${cr},${cdir}`;
      const wallRow = sqlite.prepare("SELECT kind FROM hex_walls WHERE owner_key = ? AND edge_key = ?").get(ownerKey, edgeKey) as any;
      if (wallRow) badRequest(`That edge already carries a ${EDGE_WORK[wallRow.kind]?.name ?? "work"} — one work per edge.`);
      const wardRow = sqlite.prepare("SELECT id FROM territory_workings WHERE owner_key = ? AND edge_key = ? AND kind = 'ward'").get(ownerKey, edgeKey) as any;
      if (wardRow) badRequest("A ward of the Written Light already stands on that edge.");
      if (spell.engine === "standard") {
        const flying = sqlite.prepare("SELECT id FROM territory_workings WHERE owner_key = ? AND engine = 'standard'").get(ownerKey) as any;
        if (flying) badRequest("One Standard per Tender — yours already flies on the map.");
      }
      // Ebb Walker (tranche one): a Tide working cast on Tide
      // or neutral ground costs 1✦ less.
      const ebbWard = workingEffects(ownerKey).ebbWalker && hue === "tide" && (tile.element === "tide" || tile.element === "neutral");
      const wardCost = ebbWard ? Math.max(1, spell.cost - 1) : spell.cost;
      if (!(await spendEnergy(ownerKey, wardCost))) badRequest(`Not enough energy — ${spell.name} costs ${wardCost}.`);
      // The roll (Homeland Casting): the purse is charged
      // before it — a fizzle spends the charge alone and
      // raises nothing.
      const cast = homelandCastRoll(progress, spell);
      if (!cast.ok) return { ok: true as const, fizzled: true as const, roll: cast.roll, mod: cast.mod, dc: cast.dc, cost: wardCost, spellKey: spell.key };
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
      if (spell.engine === "seal") {
        mapNums.stops = (mapNums.stops ?? 3) + eff.sealStops + (hue === "stone" ? eff.deepSetSealStops : 0);
        mapNums.riposte = (mapNums.riposte ?? 3) + eff.riposte + slots;
      }
      if (spell.engine === "engine") mapNums.energyPerRound = (mapNums.energyPerRound ?? 1) + eff.engineEnergy;
      if (spell.engine === "trees" || spell.engine === "seal") {
        const bright = sqlite.prepare("SELECT id FROM territory_workings WHERE owner_key = ? AND engine = 'engine' AND kind = 'ward'").get(ownerKey) as any;
        hp = hpForCast(spell, progress.level, slots, !!bright);
        hp += eff.wardHp + (spell.engine === "trees" ? eff.treesHp : 0);
      }
      const info = sqlite.prepare(`INSERT INTO territory_workings
        (owner_key, spell_key, engine, kind, hue, tile_id, edge_key, q, r, dir, nums, hp, stops, charges, pour, max_hp, created_at)
        VALUES (?, ?, ?, 'ward', ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`)
        .run(ownerKey, spell.key, spell.engine, hue, tileId, edgeKey, cq, cr, cdir, JSON.stringify(mapNums), hp, slots, hp, Date.now());
      return { ok: true as const, id: Number(info.lastInsertRowid), edgeKey, cost: wardCost, pour: slots, hp, roll: cast.roll, mod: cast.mod, dc: cast.dc, spellKey: spell.key };
    }

    if (spell.kind === "rune" || spell.kind === "spell") {
      if (tileId == null) badRequest("A rune is written on a hex's ground — name the hex.");
      const tileRows = await db.select().from(schema.territoryTiles)
        .where(and(eq(schema.territoryTiles.id, tileId), eq(schema.territoryTiles.ownerKey, ownerKey)));
      const tile = tileRows[0] as any;
      if (!tile) badRequest("That hex is not on your map to write upon.");
      assertCastReach(tile);
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
      const runeCost = ebbRune ? Math.max(1, spell.cost - 1) : spell.cost;
      if (!(await spendEnergy(ownerKey, runeCost))) badRequest(`Not enough energy — ${spell.name} costs ${runeCost}.`);
      // The roll (Homeland Casting): charged before it — a
      // fizzle spends the charge alone and writes nothing.
      const cast = homelandCastRoll(progress, spell);
      if (!cast.ok) return { ok: true as const, fizzled: true as const, roll: cast.roll, mod: cast.mod, dc: cast.dc, cost: runeCost, spellKey: spell.key };
      // The cast carries the page's filled slots in its
      // element, as at the ward's raising on this ground
      // — nothing is spent at the cast; the power stands in
      // the book (pageSlotsCastFor).
      const slots = await pageSlotsCastFor(ownerKey, spell, hue);
      const effR = workingEffects(ownerKey);
      const charges = (spell.engine === "blade" || spell.engine === "blades") ? (spell.numbers.charges ?? 2) + effR.bladeSprings : spell.engine === "coil" ? 1 + effR.coilTurns : 1;
      // SHARD RAIN (Nigel, 2026-10-17): the caster's attunement
      // level in the spell's element rides inside the stored
      // numbers, snapshotted at the cast as HP is — on the map
      // the rain covers the one hex the rune is written on, and
      // the Battleground splits its pool over the dark standing
      // there when it springs.
      let numsToStore: Record<string, number> = { ...(spell.numbers ?? {}) };
      // The Zodiac rides the rune's stored numbers (tranche one).
      if (typeof numsToStore.power === "number") numsToStore.power += effR.runePower;
      if (typeof numsToStore.pinRounds === "number") numsToStore.pinRounds += effR.runePin;
      if (spell.engine === "shard" && effR.crownThreshold != null) numsToStore.minPower = Math.min(numsToStore.minPower ?? 5, effR.crownThreshold);
      if (spell.engine === "coil") numsToStore.energyPerDark = (numsToStore.energyPerDark ?? 1) + effR.coilReturn;
      if (spell.engine === "shardrain") {
        let lvl = 0;
        if (hue !== "unaligned") {
          const pools = await attunementPools(ownerKey);
          lvl = attunementLevel((pools[hue] ?? 0) + (skillAttunementGrants(ownerKey)[hue] ?? 0));
        }
        numsToStore = { ...numsToStore, rainLevel: lvl };
      }
      // The Lattice holds its ground with a health rating, like
      // the holding wards; harm and snare runes carry none.
      // (A Crown Shard written on this ground stands holding
      // its slots in the row below, but no spring on this
      // ground reads them — the homeland has no Shard spring;
      // standing flag, see the build report of 2026-10-21.)
      const hp = spell.engine === "lattice" ? hpForCast(spell, progress.level, slots, false) : 0;
      const info = sqlite.prepare(`INSERT INTO territory_workings
        (owner_key, spell_key, engine, kind, hue, tile_id, edge_key, q, r, dir, nums, hp, stops, charges, pour, max_hp, created_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?, ?, 0, ?, ?, ?, ?)`)
        .run(ownerKey, spell.key, spell.engine, spell.kind, hue, tileId, tile.q, tile.r, JSON.stringify(numsToStore), hp, charges, slots, hp, Date.now());
      const newId = Number(info.lastInsertRowid);
      // The writing springs the moment it lands, if the dark
      // already stands on its ground or the curse holds that
      // ground (Homeland Casting — the Table's cast-time
      // spring, honored on this ground too).
      const sprungNow = await springHomelandWorking(ownerKey, newId, castTiles as any[]);
      // THE FELL DRIP: if the writing's spring beat the dark
      // standing on it, the fell pays as any beaten creature
      // pays (Nigel, 2026-10-20).
      if (sprungNow.felled) await payFellDrip(ownerKey, tile.element ?? null);
      return { ok: true as const, id: newId, tileId, cost: runeCost, pour: slots, hp, roll: cast.roll, mod: cast.mod, dc: cast.dc, spellKey: spell.key, sprung: sprungNow.sprung, felled: sprungNow.felled, ground: sprungNow.ground, purified: sprungNow.purified };
    }

    badRequest("That page of the book cannot be cast on the land.");
  },

  /** Fade one of your own workings from the land — free, instant,
   *  the Tender's own hand (mirrors removeEdgeWork). */
  async fadeMapWorking(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ id: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Name the working to fade.");
    const gone = sqlite.prepare("DELETE FROM territory_workings WHERE owner_key = ? AND id = ?").run(ownerKey, parsed.data.id);
    if (!gone.changes) badRequest("No such working stands on your land.");
    return { ok: true as const };
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
        sqlite.prepare("UPDATE field_placements SET tile_id = ?, last_moved_at = ?, march_path = NULL, march_since = NULL, march_ends = NULL, march_goal = NULL WHERE id = ?")
          .run(dest, row.march_ends, row.id);
      } else {
        sqlite.prepare("UPDATE field_placements SET march_path = NULL, march_since = NULL, march_ends = NULL, march_goal = NULL WHERE id = ?")
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
      const dmg = maxHp * (0.01 * (ring + 1)) * (elapsed / 2800);
      if (dmg <= 0) continue;
      const result = await damagePlacement({ id: s.id, awakenedId: s.awakened_id, hp: s.hp } as any, dmg);
      if (!result.dissipated) sqlite.prepare("UPDATE field_placements SET curse_since = ? WHERE id = ?").run(now, s.id);
    }
  },

  /** THE COLUMNS SETTLE (Nigel, 2026-10-17): arrivals land,
      unheld seeds are CORRUPTED, and a lit Eye with no column
      walking sends one. Lazy, like the marches — the world
      moves when it is read. The column is only a traced line:
      it never crosses purified land; on arrival its force
      appears on the hexes beside the target at the fog's edge. */
  async settleIncursions(ownerKey: string) {
    const now = Date.now();
    // STARFALL (ruled 2026-10-16): a 13% roll each settled hour
    // drops 1–3 seeds anywhere on the map, the cursed ring
    // included. At most five lie fallen at once.
    {
      const attRow = sqlite.prepare("SELECT starfall_anchor_at FROM tender_attention WHERE owner_key = ?").get(ownerKey) as any;
      let anchor = Number(attRow?.starfall_anchor_at || 0);
      if (!anchor) {
        sqlite.prepare(`INSERT INTO tender_attention (owner_key, eye, updated_at, break_until, total_spent, starfall_anchor_at)
          VALUES (?, 0, ?, 0, 0, ?) ON CONFLICT(owner_key) DO UPDATE SET starfall_anchor_at = excluded.starfall_anchor_at`)
          .run(ownerKey, now, now);
        anchor = now;
      }
      const hours = Math.min(24, Math.floor((now - anchor) / 3600000));
      if (hours > 0) {
        const tilesAll = await db.select().from(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
        for (let h = 0; h < hours; h++) {
          if (Math.random() >= 0.13) continue;
          const fallen = sqlite.prepare("SELECT COUNT(*) AS n FROM star_seeds WHERE owner_key = ? AND state = 'fallen'").get(ownerKey) as any;
          if (Number(fallen?.n ?? 0) >= 5) break;
          const seededTiles = new Set((sqlite.prepare("SELECT tile_id FROM star_seeds WHERE owner_key = ? AND state IN ('fallen','held','corrupted','first')").all(ownerKey) as any[]).map(r => r.tile_id));
          const spots = tilesAll.filter(t => !(t.q === 0 && t.r === 0) && !seededTiles.has(t.id));
          const drop = 1 + Math.floor(Math.random() * 3);
          for (let d = 0; d < drop && spots.length; d++) {
            // The five-fallen cap binds DURING the drop too
            // (playtest, 2026-10-18): checking only before a
            // 1–3 drop let one settled hour land seven seeds.
            if (Number(fallen?.n ?? 0) + d >= 5) break;
            const spot = spots.splice(Math.floor(Math.random() * spots.length), 1)[0];
            sqlite.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at) VALUES (?, ?, 1, 'fallen', ?)").run(ownerKey, spot.id, now);
          }
        }
        sqlite.prepare("UPDATE tender_attention SET starfall_anchor_at = ? WHERE owner_key = ?").run(anchor + hours * 3600000, ownerKey);
      }
    }
    // Fetch parties land, gather, and ride home.
    await this.settleSeedMissions(ownerKey);
    // Arrivals.
    const arriving = sqlite.prepare(
      "SELECT id, target_tile_id, target_kind FROM incursion_columns WHERE owner_key = ? AND state = 'marching' AND arrives_at <= ?"
    ).all(ownerKey, now) as any[];
    for (const col of arriving) {
      sqlite.prepare("UPDATE incursion_columns SET state = 'arrived' WHERE id = ?").run(col.id);
      if (col.target_kind === "seed" && col.target_tile_id != null) {
        // Q4 RULED (Nigel, 2026-10-17): an unheld seed a column
        // reaches is CORRUPTED — it becomes theirs, a cursed
        // bastion, and the column stands as its guard: a siege.
        const seed = sqlite.prepare(
          "SELECT id FROM star_seeds WHERE owner_key = ? AND tile_id = ? AND state = 'fallen'"
        ).get(ownerKey, col.target_tile_id) as any;
        if (seed) {
          sqlite.prepare("UPDATE star_seeds SET state = 'corrupted' WHERE id = ?").run(seed.id);
          sqlite.prepare("UPDATE incursion_columns SET kind = 'siege' WHERE id = ?").run(col.id);
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
   *  held seed's reach has its curse strength re-reckoned at
   *  its effective ring — current HP clamps down when the
   *  calm falls on it — and a tile whose calm has COLLAPSED
   *  (its stored depth is shallower than its natural ring
   *  allows) re-thickens by the difference. Tiles the calm
   *  has never touched are left exactly as they were. */
  async settleSeedCalm(ownerKey: string) {
    const seedHexes = await heldSeedHexes(ownerKey);
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
              sqlite.prepare("UPDATE field_placements SET march_path = ?, march_since = ?, march_ends = ?, march_goal = NULL WHERE owner_key = ? AND awakened_id = ?")
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
        return {
          id: sd.id, tileId: sd.tile_id, q: t ? t.q : null, r: t ? t.r : null,
          level: sd.level, state: sd.state, defenses: sd.defenses ?? 0,
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
      generated (cursed rings + frontier, nothing purified) and a
      star seed is planted at the cursed center, state 'first',
      with its hold ledger opened. Territory calls this on mount
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

  /** Send Awoken onto the seed's hex. The field's own deploy law
      (deployBattle's guards and price) — but NOT its assault: the
      seed anchors this hex's curse, and standing power alone
      never breaks it. Only the hold purifies here. Casting never
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
    const occupied = await db.select({ id: schema.fieldPlacements.id }).from(schema.fieldPlacements)
      .where(eq(schema.fieldPlacements.tileId, seed.tile_id));
    if (occupied.length + fighters.length > 4) badRequest("The seed's hex holds at most 4 Awokin.");
    let totalCost = 0;
    for (const f of fighters) {
      const payload = await awakenedPayloadById(f.id);
      totalCost += deployCostForPower(payload?.power ?? 0);
    }
    if (!(await spendEnergy(ownerKey, totalCost))) badRequest("Not enough energy.");
    for (const f of fighters) {
      await db.insert(schema.fieldPlacements).values({
        ownerKey, awakenedId: f.id, tileId: seed.tile_id,
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
      it. The banked level is kept either way; an unfinished
      stretch rolls back to the banked rung, as a fall does. */
  async endFirstSeedRun(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const ev = firstSeedEventRow(ownerKey);
    if (!ev) badRequest("No starseed waits on your land.");
    if (ev!.state !== "holding") badRequest("No hold is underway.");
    const seed = sqlite.prepare("SELECT * FROM star_seeds WHERE id = ? AND owner_key = ?").get(ev!.seed_id, ownerKey) as any;
    ev!.state = "waiting";
    ev!.next_wave_at = 0;
    ev!.waves_cleared = ev!.banked ? Number(seed?.level ?? 1) * 3 : 0;
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
    const travelMs = Math.max(5000, Math.round(marchWeightedSeconds(road, slowest, (id) => !!fetchCursed.get(id)) * 1000));
    const arriveAt = now + travelMs;
    const ins = sqlite.prepare(`INSERT INTO seed_missions (owner_key, seed_id, kind, party, phase, depart_at, arrive_at)
      VALUES (?, ?, 'fetch', ?, 'out', ?, ?)`).run(ownerKey, seedId, JSON.stringify(awakenedIds), now, arriveAt) as any;
    for (const p of partyRows) {
      sqlite.prepare("UPDATE field_placements SET march_path = ?, march_since = ?, march_ends = ?, march_goal = NULL WHERE id = ?")
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
      const occupied = sqlite.prepare("SELECT COUNT(*) AS n FROM field_placements WHERE tile_id = ?").get(bastion.tileId) as any;
      if (Number(occupied?.n ?? 0) >= 4) badRequest("The bastion's hex stands full — four is the field's law, even at home.");
      sqlite.prepare("DELETE FROM bastion_staged WHERE owner_key = ? AND awakened_id = ?").run(ownerKey, awakenedId);
      await db.insert(schema.fieldPlacements).values({ ownerKey, awakenedId, tileId: bastion.tileId, hp: await placementMaxHp(awakenedId) });
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
    const seconds = marchWeightedSeconds(road!, pace, (id) => !!bastionCursed.get(id)) * (following ? 1 : 1.5);
    const now = Date.now();
    sqlite.prepare("UPDATE field_placements SET march_path = ?, march_since = ?, march_ends = ?, march_goal = 'bastion', patrol_path = NULL, patrol_since = NULL WHERE id = ?")
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
    // A HELD SEED DEFENDED (the personal bastion settlement,
    // ruled 2026-10-16): when the beaten column had come for a
    // held seed's hex, the hold is reckoned — every third
    // defense, the seed grows a level and an adjacent tile is
    // BANKED FOR GOOD (purified free, the light's expansion).
    const colRow = sqlite.prepare("SELECT target_tile_id FROM incursion_columns WHERE id = ?").get(columnId) as any;
    if (colRow?.target_tile_id != null) {
      const seed = sqlite.prepare("SELECT * FROM star_seeds WHERE owner_key = ? AND tile_id = ? AND state = 'held'").get(ownerKey, colRow.target_tile_id) as any;
      if (seed) {
        const defenses = Number(seed.defenses || 0) + 1;
        if (defenses % 3 === 0) {
          sqlite.prepare("UPDATE star_seeds SET defenses = ?, level = level + 1 WHERE id = ?").run(defenses, seed.id);
          const home = sqlite.prepare("SELECT q, r FROM territory_tiles WHERE id = ?").get(colRow.target_tile_id) as any;
          if (home) {
            const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
            for (const [dq, dr] of DIRS) {
              const n = sqlite.prepare("SELECT id FROM territory_tiles WHERE owner_key = ? AND q = ? AND r = ? AND cursed = 1").get(ownerKey, home.q + dq, home.r + dr) as any;
              if (n) { sqlite.prepare("UPDATE territory_tiles SET cursed = 0, element = 'neutral' WHERE id = ?").run(n.id); break; }
            }
          }
        } else {
          sqlite.prepare("UPDATE star_seeds SET defenses = ? WHERE id = ?").run(defenses, seed.id);
        }
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
      await db.update(schema.fieldPlacements).set({ patrolPath: null, patrolSince: null } as any)
        .where(eq(schema.fieldPlacements.id, placement.id));
      return { ok: true as const, awakenedId, patrolling: false };
    }
    if (new Set(tileIds).size !== tileIds.length) badRequest("A patrol road does not name the same hex twice.");
    if (tileIds.includes(placement.tileId)) badRequest("The home hex is the road's beginning and end — it is not named among the waypoints.");
    const mine = new Set((await db.select().from(schema.territoryTiles)
      .where(eq(schema.territoryTiles.ownerKey, ownerKey))).map(t => t.id));
    if (tileIds.some(id => !mine.has(id))) badRequest("A patrol road runs over your own ground only.");
    await db.update(schema.fieldPlacements).set({ patrolPath: JSON.stringify(tileIds), patrolSince: Date.now() } as any)
      .where(eq(schema.fieldPlacements.id, placement.id));
    return { ok: true as const, awakenedId, patrolling: true, waypoints: tileIds.length };
  },

  // SET MARCH (War-Ground, Nigel 2026-10-16): the plain move of the
  // marching system — point A to point B, for real. The road is found
  // over the Tender's own uncursed ground; the price and the duration
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
    const parsed = z.object({ awakenedId: z.number().int().positive(), tileId: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("A march is an Awokin and the hex it marches to.");
    const { awakenedId, tileId } = parsed.data;
    const rows = await db.select().from(schema.fieldPlacements)
      .where(and(eq(schema.fieldPlacements.awakenedId, awakenedId), eq(schema.fieldPlacements.ownerKey, ownerKey))).limit(1);
    const placement = rows[0] as any;
    if (!placement) badRequest("That Awokin does not stand on the field — only the stationed can march.");
    if (placement.marchPath) badRequest("That Awokin is already on the march — recall it, or let it arrive.");
    if (placement.tileId === tileId) badRequest("It stands there already.");
    const tiles = await db.select().from(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
    const dest = tiles.find(t => t.id === tileId) as any;
    if (!dest) badRequest("That hex is not yours to march to.");
    if (dest.cursed) badRequest("No marching onto cursed land — that ground is taken by fighting, not by walking.");
    const road = findRoad(tiles as any, placement.tileId, tileId);
    if (!road) badRequest("No road of your own ground runs there — the way is broken by cursed land.");
    const steps = road.length - 1;
    // Destination room: what stands there + what is already marching in.
    const allPlacements = await db.select().from(schema.fieldPlacements).where(eq(schema.fieldPlacements.ownerKey, ownerKey));
    let inbound = 0;
    for (const p of allPlacements as any[]) {
      if (p.tileId === tileId && !p.marchPath) inbound++;
      else if (p.marchPath) {
        try { const r = JSON.parse(p.marchPath); if (Array.isArray(r) && r[r.length - 1] === tileId) inbound++; } catch { /* broken roads hold no room */ }
      }
    }
    if (inbound >= 4) badRequest("That hex will hold no more — four Awokin to a hex, standing or marching in.");
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
    const seconds = marchWeightedSeconds(road, marchSecondsPerHexFor(layers, aw.experience ?? 0), (id) => !!marchCursed.get(id));
    if (!(await spendEnergy(ownerKey, energy))) badRequest(`Not enough energy — that march costs ${energy}.`);
    const now = Date.now();
    await db.update(schema.fieldPlacements).set({
      marchPath: JSON.stringify(road), marchSince: now, marchEnds: now + Math.round(seconds * 1000), marchGoal: null,
      patrolPath: null, patrolSince: null,
    } as any).where(eq(schema.fieldPlacements.id, placement.id));
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
      await db.update(schema.fieldPlacements).set({ marchPath: null, marchSince: null, marchEnds: null, marchGoal: null } as any)
        .where(eq(schema.fieldPlacements.id, placement.id));
      return { ok: true as const, awakenedId, recalled: true, stepsHome: 0 };
    }
    const steps = road.length - 1;
    const frac = Math.min(1, Math.max(0, (Date.now() - placement.marchSince) / Math.max(1, placement.marchEnds - placement.marchSince)));
    const reached = Math.floor(frac * steps); // whole hexes gained
    if (reached <= 0) {
      await db.update(schema.fieldPlacements).set({ marchPath: null, marchSince: null, marchEnds: null, marchGoal: null } as any)
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
    const now = Date.now();
    await db.update(schema.fieldPlacements).set({
      marchPath: JSON.stringify(homeRoad), marchSince: now, marchEnds: now + Math.round(marchWeightedSeconds(homeRoad, pace, (id) => !!recallCursed.get(id)) * 1000), marchGoal: null,
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

  // Admin: reset a tender's territory, field, waves, and timers. Keeps their Awoken.
  async adminResetTender(args: unknown, ctx?: ActionContext) {
    // TODO: verify admin workshop password
    const parsed = z.object({ ownerKey: z.string() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid reset.");
    const targetKey = parsed.data.ownerKey;
    // Clear field placements
    await db.delete(schema.fieldPlacements).where(eq(schema.fieldPlacements.ownerKey, targetKey));
    // Clear territory tiles
    await db.delete(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, targetKey));
    // Clear dispersed (return Awoken from time)
    await db.update(schema.awakened)
      .set({ dispersedUntil: null })
      .where(eq(schema.awakened.ownerKey, targetKey));
    // Reset waves
    await db.delete(schema.waveState).where(eq(schema.waveState.ownerKey, targetKey));
    // Reset energy to 5
    await db.insert(schema.tenderResources)
      .values({ ownerKey: targetKey, energy: 5 })
      .onConflictDoUpdate({ target: schema.tenderResources.ownerKey, set: { energy: 5 } });
    // Re-create the bastion: center purified + 6 cursed ring
    const now = new Date();
    const { mood: adminSky } = await getWorldMood();
    const adminRingHp = curseHpFor(1, adminSky);
    await db.insert(schema.territoryTiles).values({
      ownerKey: targetKey, q: 0, r: 0, element: "neutral", cursed: 0, createdAt: now,
    });
    for (const [dq, dr] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) {
      await db.insert(schema.territoryTiles).values({
        ownerKey: targetKey, q: dq, r: dr, element: "neutral", cursed: 1, createdAt: now,
        curseHp: adminRingHp, curseMaxHp: adminRingHp,
      });
    }
    return { ok: true };
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
    const actualBuildMinutes = Math.max(1, Math.floor(def.buildMinutes * synergyMultiplier / timeDivisor));
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

  async deleteUiSprite(args: unknown, ctx?: ActionContext) {
    const parsed = z.object({ id: z.number().int() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid.");
    await db.delete(schema.uiSprites).where(eq(schema.uiSprites.id, parsed.data.id));
    return { ok: true };
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
   *  Witch's doubling and the Sage's +2 (pourLaidFor) priced
   *  the retired point pour; how they bend slots is not
   *  ruled, so every hand fills at the same flat 4 until it
   *  is — the reckoning stands preserved in the book. Only
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
    const spent = await spendAttunement(ownerKey, element, SLOT_COST);
    if (!spent.ok) badRequest(`Filling a ${element} slot costs ${SLOT_COST} ${element} points — your ${element} pool holds ${Math.floor(spent.held)}. Nothing was spent.`);
    const { inElement, total } = await fillPageSlot(ownerKey, spellKey, element);
    const slots = await pageAttunementsFor(ownerKey);
    return { ok: true as const, spellKey, element, spent: SLOT_COST, inElement, filled: total, slots: slots[spellKey] ?? {} };
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
    const growMs = growHours * 60 * 60 * 1000;
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
  async dissipateAwoken(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ awakenedId: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    // Verify ownership and field placement
    const placement = await db.select().from(schema.fieldPlacements)
      .where(and(
        eq(schema.fieldPlacements.awakenedId, parsed.data.awakenedId),
        eq(schema.fieldPlacements.ownerKey, ownerKey)
      )).limit(1);
    if (!placement.length) badRequest("Awokin not on field.");
    // Remove from field
    await db.delete(schema.fieldPlacements)
      .where(eq(schema.fieldPlacements.awakenedId, parsed.data.awakenedId));
    // 8h re-coalescence (double the 4h for voluntary dissipation)
    const dispersedUntil = new Date(Date.now() + 8 * 60 * 60 * 1000);
    await db.update(schema.awakened)
      .set({ dispersedUntil })
      .where(eq(schema.awakened.id, parsed.data.awakenedId));
    return { ok: true };
  },


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
        for (const v of victims) {
          await db.update(schema.awakened)
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
    // 35% chance: pulled into one wave of the Unraveling instead of instant purify.
    if (Math.random() < 0.35) {
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
        let element: "tide" | "sky" | "stone" | "root" | "neutral" = "neutral";
        let maxCount = 0; let tie = false;
        for (const [el, count] of Object.entries(elementCounts)) {
          if (count > maxCount) { maxCount = count; element = el as typeof element; tie = false; }
          else if (count === maxCount && count > 0) { tie = true; }
        }
        if (tie) element = "neutral";
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

  async birthFieldAwoken(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsedResult = z.object({
      layers: z.array(layerRefShape),
      imageBase64: z.string(),
      tileId: z.number(),
      liberatorNames: z.array(z.string()),
      toHand: z.boolean().optional(),
    }).safeParse(args);
    if (!parsedResult.success) badRequest(`Invalid birth — ${describeValidationIssues(parsedResult.error)}.`);
    const parsed = parsedResult.data;
    const story = `Liberated by ${parsed.liberatorNames.join(", ")}. When the dark broke over this tile, I opened my eyes on reclaimed land. They stood over me — the ones who fought the Unraveler back. This is where I began, on ground they made safe.`;
    const blobKey = `fieldborn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const base64Data = parsed.imageBase64.split(",")[1] ?? parsed.imageBase64;
    const imageBytes = Buffer.from(base64Data, "base64");
    // Stored as image/png — so it must BE a PNG (uploadLayerAsset's test).
    assertPngBytes(imageBytes);
    // Placing the newborn obeys the same ground rules as any deployment
    // (deployBattle's checks): the tile must be the caller's own, already
    // reclaimed, and hold fewer than 4 Awoken. Before this, any caller
    // could pin a newborn onto another Tender's tile.
    if (!parsed.toHand) {
      const tile = await db.select().from(schema.territoryTiles)
        .where(and(eq(schema.territoryTiles.id, parsed.tileId), eq(schema.territoryTiles.ownerKey, ownerKey))).limit(1);
      if (!tile.length) badRequest("That tile is not yours.");
      if (tile[0].cursed) badRequest("A newborn can only be placed on reclaimed land.");
      const occupied = await db.select({ id: schema.fieldPlacements.id }).from(schema.fieldPlacements)
        .where(eq(schema.fieldPlacements.tileId, parsed.tileId));
      if (occupied.length >= 4) badRequest("Tile holds at most 4 Awokin.");
    }
    // A birth follows a victory, and the victory is the server's own
    // record: consume exactly one pending claim. No claim, no birth.
    if (!consumeNewbornClaim(ownerKey)) {
      badRequest("No newborn is waiting — a birth follows a victory, and this victory's newborn has already been gathered.");
    }
    blobs.put(blobKey, imageBytes, "image/png");
    const [newborn] = await db.insert(schema.awakened).values({
      name: "Newborn of the Purified Land",
      mintedName: "Newborn of the Purified Land",
      imageBlobKey: blobKey,
      compositionJson: JSON.stringify(parsed.layers),
      collection: "tender",
      ownerName: ownerKey,
      ownerKey,
      identityKey: `newborn-${Date.now()}`,
      flavorText: story,
      fieldBorn: 1,
    }).returning({ id: schema.awakened.id });
    // Newborns from battle purification join the hand, not the field.
    if (!parsed.toHand) {
      await db.insert(schema.fieldPlacements).values({
        ownerKey, awakenedId: newborn.id, tileId: parsed.tileId,
        hp: await placementMaxHp(newborn.id),
      });
    }
    return okResponse.parse({ ok: true, id: newborn.id });
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
    // A birth follows a BOSS victory, and the victory is the server's
    // own record: consume exactly one pending claim (recorded by
    // resolveBossBattle when a boss broke — the boss's own verified
    // resolution path since the War-Ground fix of 2026-10-15; before
    // it, the claim was recorded on a wave-state condition that could
    // never occur, so no boss birth could ever be gathered).
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
    const readyAt = new Date(Date.now() + cost.buildMinutes * 60 * 1000);
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

  /** THE CHOOSING (Nigel, 2026-10-19 — the Class Gate): a Tender
   *  picks their class at Lv 3. The first choosing is the calling;
   *  ONE free second-thoughts rite may unmake it; after that the
   *  class is sealed, and only a reclass token sent by a workshop
   *  hand (grantReclassToken) opens it again, consumed on use.
   *  Until a class is chosen the Tender's avatar shows nowhere
   *  and the Table will not seat them (see getTableBindCode). */
  async chooseClass(args: unknown, ctx?: ActionContext) {
    if (!ctx?.tender) badRequest("Log in first.");
    const parsed = z.object({
      classKey: z.enum(["warden", "runewright", "binder", "witch", "sage"]),
    }).safeParse(args);
    if (!parsed.success) badRequest("Name one of the five classes: Warden, Runewright, Binder, Witch, or Sage.");
    const ownerKey = ownerKeyFor(ctx);
    const progress = await getTenderProgress(ownerKey);
    if (progress.level < 3) badRequest("The choosing comes at Lv 3 — wake, tend, and grow; your class wakes with your third level.");
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
   *  gift — at Lv 3, with his class, the Tender names the weapon
   *  that will float at his side: sword & shield (d6, +3 AC),
   *  sword (d10, +1 AC), spear (d6, +1 range), arrow (d4, range
   *  4). It is the grimoire's first spell unlock at Lv 3, and it
   *  takes elemental attunement like an Awokin. Re-picking rides
   *  the class's own economy: the second-thoughts rite once, then
   *  reclass tokens — the choosing is one choosing. */
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
   * Direct attack: send exactly 3 Awoken at a cursed tile. Overwhelming force
   * breaks the dark — the tile is purified, takes the dominant element of the
   * attackers (fire is never inherited; ties stay neutral), and the attackers
   * stand on the reclaimed land. Energy cost is enforced client-side.
   */
  async directAttack(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      awakenedIds: z.array(z.number().int().positive()).length(3),
      tileId: z.number().int().positive(),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid direct attack.");
    if (new Set(parsed.data.awakenedIds).size !== 3) badRequest("Three distinct Awokin must strike together.");
    // Verify the tile belongs to the Tender and is cursed.
    const tile = await db.select().from(schema.territoryTiles)
      .where(and(eq(schema.territoryTiles.id, parsed.data.tileId), eq(schema.territoryTiles.ownerKey, ownerKey))).limit(1);
    if (!tile.length) badRequest("That tile is not yours.");
    if (!tile[0].cursed) badRequest("The dark has already broken there.");
    // Verify all three Awoken belong to the Tender and are not on the field.
    const owned = await db.select().from(schema.awakened)
      .where(and(eq(schema.awakened.ownerKey, ownerKey)));
    const attackers = owned.filter(t => parsed.data.awakenedIds.includes(t.id));
    if (attackers.length !== 3) badRequest("Those Awokin are not all yours.");
    const placedIds = new Set((await db.select({ awakenedId: schema.fieldPlacements.awakenedId })
      .from(schema.fieldPlacements)
      .where(eq(schema.fieldPlacements.ownerKey, ownerKey))).map(p => p.awakenedId));
    for (const a of attackers) {
      if (!canTouchAwoken(a, ownerKey)) badRequest("That Awokin is not yours to send.");
      if (placedIds.has(a.id)) badRequest("Already on the field.");
    }
    // The tile becomes what the attackers are: dominant element of their
    // layers, read from piece names. Fire never sparks on conquered land.
    const assetRows = await db.select().from(schema.layerAssets);
    const assetStats = new Map<number, AssetStats>();
    for (const assetRow of assetRows) {
      const rarity = raritySchema.safeParse(assetRow.rarity);
      if (rarity.success) assetStats.set(assetRow.id, { name: assetRow.name, rarity: rarity.data, power: assetRow.power, toughness: assetRow.toughness, element: (assetRow as any).element ?? null });
    }
    const elementCounts: Record<"tide" | "sky" | "stone" | "root", number> = { tide: 0, sky: 0, stone: 0, root: 0 };
    for (const a of attackers) {
      for (const layer of parseLayers(a.compositionJson, assetStats)) {
        const el = storedElement((layer as any).element);
        if (el !== "fire" && el !== "neutral") elementCounts[el] += 1;
      }
    }
    let element: "tide" | "sky" | "stone" | "root" | "neutral" = "neutral";
    let maxCount = 0; let tie = false;
    for (const [el, count] of Object.entries(elementCounts)) {
      if (count > maxCount) { maxCount = count; element = el as typeof element; tie = false; }
      else if (count === maxCount && count > 0) { tie = true; }
    }
    if (tie) element = "neutral";
    // Break the curse.
    await db.update(schema.territoryTiles)
      .set({ cursed: 0, element, ...PURIFIED_TILE_FIELDS })
      .where(eq(schema.territoryTiles.id, tile[0].id));
    // Unified XP: each striker made an ATTACK EVENT (+10), and their
    // combined blow took the hex — HEX-TAKEN XP (+50) to each.
    const xpById = new Map<number, XpGainReport>();
    for (const a of attackers) {
      await grantEventXp(xpById, a.id, XP_PER_ATTACK);
      await grantEventXp(xpById, a.id, XP_PER_HEX_TAKEN);
    }
    // The attackers stand on the reclaimed land (3 < 4 tile cap).
    for (const a of attackers) {
      await db.insert(schema.fieldPlacements).values({
        ownerKey, awakenedId: a.id, tileId: tile[0].id,
        hp: await placementMaxHp(a.id),
      });
    }
    // The neighboring cursed land feels the shift — their 48h passive timers
    // start now.
    const now = new Date();
    const neighborCoords = [
      [tile[0].q + 1, tile[0].r], [tile[0].q - 1, tile[0].r],
      [tile[0].q, tile[0].r + 1], [tile[0].q, tile[0].r - 1],
      [tile[0].q + 1, tile[0].r - 1], [tile[0].q - 1, tile[0].r + 1],
    ];
    for (const [nq, nr] of neighborCoords) {
      await db.update(schema.territoryTiles)
        .set({ lastPassiveAt: now })
        .where(and(
          eq(schema.territoryTiles.ownerKey, ownerKey),
          eq(schema.territoryTiles.q, nq),
          eq(schema.territoryTiles.r, nr),
          eq(schema.territoryTiles.cursed, 1),
        ));
    }
    return { ok: true as const, xpGains: [...xpById.values()] };
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
