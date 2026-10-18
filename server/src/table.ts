/**
 * THE TABLE — the server half of the Discord Activity
 * (design of record: ~/workspace/discord-voice/TABLE-DESIGN.md).
 *
 * P0 — THE EMPTY TABLE (the plumbing proof, built 2026-10-15):
 * the Activity launches, each opener is NAMED (Discord sign-in through
 * the Embedded App SDK's OAuth code, exchanged here; or a doorway-test
 * name while Discord is not yet configured on the server), seated
 * players see each other in the Party zone, and each is dealt a
 * DIFFERENT test hand that is sent to their socket and nowhere else —
 * privacy by architecture, not by promise: a hand exists only in its
 * owner's payload. Dice are rolled here, where the referee can witness
 * them, and written into the shared Tale. Personal notes and the typed
 * inventory persist per player (table_profiles) and are likewise only
 * ever sent to their owner.
 *
 * What P0 deliberately does NOT do (later phases, per the design):
 * real decks and account binding (P1), summoning and referee combat
 * (P1), the Storytender's Panel and campaign persistence (P2). The
 * room state is in memory; a server restart clears the room but never
 * a profile.
 */

import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { Express, Request, Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import { eq } from "drizzle-orm";
import { db, schema, sqlite } from "./store.js";
import { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET } from "./config.js";
import { tenderOwnerKey } from "./tenders.js";
import { awakenedPayloadById, calculateMaxEnergy, resolveCurrentEnemyArt, handlers, incursionRoster } from "./actions.js";
import { getTenderProgress, healTierForLevel, healAmountForLevel, tenderMaxHpForLevel, awardTenderExp } from "./tenderExp.js";
import { HUE_ORDER } from "./workings.js";
import { grimoireNow, refreshGrimoire, spellByKey, healSpell, pourCapFor, hpForCast, spendAttunement, attunementPools, attunementLevel, POUR_ENGINES } from "./grimoire.js";
import { workingEffects, skillAttunementGrants, companyCapFor, heartEffects } from "./skills.js";

const TABLE_CONFIGURED = Boolean(DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET);
const MAX_SEATED = 8; // ruled 2026-10-15 at 5 Tenders to a table; raised to 8 by Nigel 2026-10-18, the night the map grew to 127 tiles
const TALE_CAP = 100;

interface TableCard {
  id: string;
  name: string;
  power: number;
  toughness: number;
  element: string;
  /** Real-deck cards only: the Awoken's true card face, exactly as
   *  the site serves it, plus its level and ledger id. Stand-in
   *  cards carry none of these and show their glyph face. */
  art?: string;
  level?: number;
  awokenId?: number;
  /** FATE: the worn pieces (body, arms, head, aura), each
   *  rolling its own element's die when the Awoken strikes. */
  parts?: { element: string; power: number }[];
  /** The piece art itself (source, category, current image URL),
   *  so the field can stand the Awoken as a cutout — the battleground's
   *  own sources — never the flattened card face (Nigel, 2026-10-18:
   *  no backgrounds behind the figures at the Table). */
  layers?: { source_id: string; category: string; imageUrl: string | null }[];
}

/** The stand-in pool: the roster an UNBOUND seat brings. Bound
 *  seats bring their Tender's whole collection instead. */
const TEST_POOL: Omit<TableCard, "id">[] = [
  { name: "Warden of Small Rains", power: 3, toughness: 4, element: "tide" },
  { name: "Keeper of the Low Bell", power: 2, toughness: 5, element: "stone" },
  { name: "Mothwing Herald", power: 4, toughness: 2, element: "sky" },
  { name: "Rootbound Confessor", power: 1, toughness: 6, element: "root" },
  { name: "Ashen Choirling", power: 5, toughness: 3, element: "stone" },
  { name: "The Patient Knife", power: 6, toughness: 2, element: "sky" },
  { name: "Mender of Torn Sails", power: 2, toughness: 3, element: "tide" },
  { name: "Gloaming Pilgrim", power: 3, toughness: 3, element: "root" },
  { name: "Spark of the First Forge", power: 7, toughness: 4, element: "sky" },
  { name: "Hushkeeper", power: 1, toughness: 2, element: "tide" },
];

interface Player {
  key: string;
  name: string;
  watcher: boolean;
  /** CAMPAIGN (Phase B, 2026-10-18): the Storytender's seat —
   *  she holds no hand, is no combatant, and is never counted
   *  among the seated Tenders. Only in campaign rooms. */
  storytender?: boolean;
  /** The seat's roster — every card available to cast. For a bound
   *  seat that is the Tender's whole collection (Nigel, 2026-10-16:
   *  the full roster stands at the Table, not a dealt five). */
  hand: TableCard[];
  notes: string;
  inventory: string[];
  /** The Tender this seat is bound to (display name), or null when
   *  the seat holds stand-in cards. */
  bound?: string | null;
  /** The seat's Tender standing (Tender EXP, 2026-10-16): a
   *  bound seat carries its Tender's true level and what it
   *  unlocks; a stand-in seat stands at Lv 1. */
  tenderLevel: number;
  healTier: number;
  healAmount: number;
  wardRuneUnlocked: boolean;
  /** The Tender's HP for this sitting — full until the
   *  referee deals damage; by level, per the HP law. */
  tenderHp: number;
  maxTenderHp: number;
  /** True once this seat's Tender has fallen in the battle. */
  fallen: boolean;
  /** Second Wall (the Zodiac, tranche one): this battle's
   *  half-cost ward has been spent. Reset at every deal. */
  secondWallUsed?: boolean;
  /** Steady Attention (the Heart, 2026-10-18): this battle's
   *  first-working discount (−1⚡) has been spent — one flag
   *  shared by wards and runes. Reset at every deal. */
  steadyUsed?: boolean;
  /** Tranche one, per battle: the Second Thread spent? */
  secondThreadUsed?: boolean;
  /** Tranche one, per battle: the Ground's memory spent? */
  groundRemembered?: boolean;
  /** The tender-progress owner key for bound seats — where
   *  battle EXP is paid. Null for stand-in seats. */
  expKey: string | null;
  /** The seat's attunement pools (whole points), for the pour
   *  stepper — refreshed at the cast; the referee re-reads the
   *  pool itself before any point is spent. Null unbound. */
  pools: Record<string, number> | null;
  /** This sitting's energy: for a bound seat, the game's own max
   *  energy for that Tender, calculated from their whole roster by
   *  the one law (calculateMaxEnergy) — all of it, as ruled. */
  energy: number;
  maxEnergy: number;
}

/** An Awoken standing on the field. The card rides inside it whole,
 *  so a recall returns exactly what was cast. */
interface FieldUnit {
  hex: string;
  card: TableCard;
  hp: number;
  maxHp: number;
  /** FATE: the shield — toughness × the element die, rolled
   *  at the summoning. Mitigated harm burns it before HP. */
  shield: number;
  maxShield: number;
  /** FATE: the speed gauge — swifter elements bank extra
   *  strikes (the same 1–5 scale as the to-hit bonus). */
  speedGauge: number;
  ownerKey: string;
  ownerName: string;
  /** Until when this unit may not strike (a pin) — a moment
   *  in time, not a count of rounds: the referee runs on the
   *  clock now (Nigel, 2026-10-18). */
  pinnedUntil: number;
  /** When this unit may next strike (the clock's cadence —
   *  swifter elements sooner). */
  nextStrike?: number;
  /** THE MARCH: while set, the unit is on the road — it does
   *  not strike, cannot be struck, and does not shield its
   *  Tender. `hex` already names the DESTINATION (it reserves
   *  its place in the stack there); clients derive its drawn
   *  position from road + clock, as the land's marching layer
   *  does. Marching is a derived state: once now ≥ endsAt the
   *  unit simply stands (see isMarching). */
  march?: { road: string[]; since: number; endsAt: number } | null;
  /** Has this dark thing struck yet? (War Runewright's
   *  patience, tranche one.) */
  struck?: boolean;
}

/** One tile of the room's instance map. */
interface MapTile {
  id: string; q: number; r: number;
  cursed: boolean;
  /** The element of the light that holds it (purified tiles). */
  element: string | null;
  /** Corruption remaining (cursed tiles): ground down by the
   *  standing light's power each round; at zero the tile turns. */
  curseHp: number;
  curseMaxHp: number;
  /** The seat whose landing this is (a player key), or null. */
  landingFor: string | null;
}

/** One of the dark, standing on the field. Damage is its filed
 *  Power, health its filed HP — the Compendium's canon numbers,
 *  no hidden tables (Nigel, 2026-10-16). */
interface EnemyUnit {
  /** A stable name of its own: the dark is registered by ID,
   *  never by tile — an advancing thing changes tiles, and a
   *  registry keyed by its first tile would lose it (kills
   *  missing their delete, the slain striking on). Several of
   *  the dark may also share one tile, as the light stacks. */
  id: string;
  hex: string;
  kind: string;
  label: string;
  art: string | null;
  power: number;
  hp: number;
  maxHp: number;
  /** FATE: the dark thing's armor — its AC, and its armor
   *  in Diablo's equation when Awoken blows land on it. */
  armor: number;
  /** Its level for the mitigation denominator and its own
   *  level steps: the wave that dealt it, or a column's tier. */
  lvl: number;
  /** FATE: the speed gauge, as the Awoken's. */
  speedGauge: number;
  /** Until when this dark thing may not strike (a pin) — a
   *  moment in time, as the light's. */
  pinnedUntil: number;
  /** When this dark thing may next strike. */
  nextStrike?: number;
  /** THE ADVANCE: while set, the dark thing is travelling
   *  its road toward the seed or the nearest light — the
   *  clock carries it, as it carries the marching light.
   *  `hex` tracks the tile it stands on as it comes. */
  march?: { road: string[]; since: number; endsAt: number } | null;
  /** Has this dark thing struck yet? (War Runewright's patience.) */
  struck?: boolean;
}

/** A working of the Written Light on the field (Nigel, 2026-10-17:
 *  the glyphs and their functions come to the Table). WARDS stand
 *  on the edge between two hexes (hexA/hexB); RUNES are written
 *  on a hex's ground (hex). Written for one battle: when the
 *  battle ends, the light fades — after the Crown Shard, if any
 *  hangs unfed, has fallen where it must. */
interface Working {
  id: string;
  kind: "ward" | "rune";
  root: string;
  /** The Grimoire spell's engine and its numbers, snapshotted
   *  at the cast (Nigel, 2026-10-17): tuning the book changes
   *  the NEXT cast, never a working already standing. */
  engine: string;
  nums: Record<string, number>;
  name: string;
  hue: string;
  ownerKey: string;
  ownerName: string;
  hex: string | null;
  /** Multi-hex casts (the Three Blades, Shard Rain) share a
   *  group: the rain falls once for the whole covered ground. */
  group?: string;
  hexA: string | null;
  hexB: string | null;
  hp: number;
  /** The health the working was raised with (its rating's full
   *  measure) and the elemental points poured into it at the cast
   *  (the Pour, Nigel 2026-10-17) — both snapshotted at the cast. */
  maxHp: number;
  pour: number;
  stops: number;
  charges: number;
  /** Lore Runewright: this rune's first spring has paid. */
  firstPaid?: boolean;
  /** The charges it was written with (the Second Thread
   *  re-writes at full strength). */
  maxCharges?: number;
  /** The Ground Remembers: this rune waits out the fade. */
  rememberMark?: boolean;
}

const ENEMY_STATS: Record<string, { power: number; hp: number; armor: number }> = {
  fray: { power: 1, hp: 3, armor: 4 },
  unraveler: { power: 4, hp: 6, armor: 6 },
  hollow: { power: 0, hp: 5, armor: 5 },
  tangle: { power: 3, hp: 8, armor: 8 },
};

/** THE INSTANCE MAP (Nigel, 2026-10-18): the Table's field IS
 *  the terrain map — a fresh instance per room, dealt in axial
 *  coordinates on the land's own lattice (the same (q, r) the
 *  Territory marches by). Radius 6: 127 tiles — room enough
 *  to see the dark coming and send patrols out to meet it.
 *  The center tile
 *  holds the star-seed and is never stood upon. Every tile
 *  begins cursed but for the seed's own ground; each seated
 *  Tender's arrival purifies ONE landing tile (see
 *  assignLanding), and the party's light spreads from there —
 *  by felling the dark that holds a tile, or by standing on
 *  empty cursed ground and grinding its corruption down while
 *  the curse burns back (Nigel: "moving and patrolling in the
 *  curse is possible too, it's just damage over time until
 *  purified"). Tile ids are "q,r" — the client draws the
 *  identical lattice from Territory's iso geometry. */
const MAP_RADIUS = 6;
const TILE_DIRS: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
interface TileDef { id: string; q: number; r: number }
const TILE_DEFS: TileDef[] = [];
for (let q = -MAP_RADIUS; q <= MAP_RADIUS; q++) {
  for (let r = -MAP_RADIUS; r <= MAP_RADIUS; r++) {
    if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) > MAP_RADIUS) continue;
    TILE_DEFS.push({ id: `${q},${r}`, q, r });
  }
}
const TILE_BY_ID = new Map(TILE_DEFS.map(t => [t.id, t]));
const SEED_TILE = "0,0";
const STANDABLE_TILES = TILE_DEFS.filter(t => t.id !== SEED_TILE).map(t => t.id);
/** How many of the light may share one tile — the March law's
 *  destination capacity, carried to the Table (design §2). */
const STACK_CAP = 4;
/** A cursed tile's corruption, by its ring from the seed —
 *  the land's own curse law (4 + 6 × ring). */
function curseHpForRing(ring: number): number { return 4 + 6 * ring; }
function ringOf(tileId: string): number { return axialDist(tileId, SEED_TILE); }
function axialDist(a: string, b: string): number {
  const ta = TILE_BY_ID.get(a), tb = TILE_BY_ID.get(b);
  if (!ta || !tb) return 999;
  const dq = ta.q - tb.q, dr = ta.r - tb.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}
/** A road that dares any ground (the land's seed-mission road,
 *  findAnyRoad, ported): at the Table the march may cross and
 *  enter the curse — the burn is the price, not a wall.
 *  Returns the tile ids, origin first, or null. */
function findAnyRoad(fromId: string, toId: string): string[] | null {
  if (!TILE_BY_ID.has(fromId) || !TILE_BY_ID.has(toId)) return null;
  if (fromId === toId) return [fromId];
  const prev = new Map<string, string>([[fromId, fromId]]);
  const queue = [fromId];
  while (queue.length) {
    const cur = queue.shift()!;
    const c = TILE_BY_ID.get(cur)!;
    for (const [dq, dr] of TILE_DIRS) {
      const nid = `${c.q + dq},${c.r + dr}`;
      if (!TILE_BY_ID.has(nid) || prev.has(nid)) continue;
      prev.set(nid, cur);
      if (nid === toId) {
        const road = [toId];
        let walk = toId;
        while (walk !== fromId) { walk = prev.get(walk)!; road.unshift(walk); }
        return road;
      }
      queue.push(nid);
    }
  }
  return null;
}
/** THE MARCH's price in energy, per hex crossed — the land's
 *  moveCost law: 1 + ⌊(power − 1)/3⌋, charged per hex of road. */
function marchRateFor(power: number): number { return 1 + Math.floor((Math.max(1, power) - 1) / 3); }
/** MARCH SPEED LAW (the land's own; War-Ground, 2026-10-16):
 *  seconds to cross one hex — the element's gait, parts
 *  averaged, weighted by size, and size is level. */
const MARCH_SECONDS_PER_HEX: Record<string, number> = { sky: 1.6, fire: 2.2, tide: 2.6, root: 3.2, stone: 4.5, neutral: 3.0 };
function marchSecondsPerHexFor(card: TableCard): number {
  const parts = partsOf(card) as { element?: string | null }[];
  let pace = MARCH_SECONDS_PER_HEX.neutral;
  if (parts.length) {
    pace = parts.reduce((sum, l) => sum + (MARCH_SECONDS_PER_HEX[l.element ?? "neutral"] ?? MARCH_SECONDS_PER_HEX.neutral), 0) / parts.length;
  }
  const level = Math.max(1, card.level ?? 1);
  return pace * Math.sqrt(Math.pow(1.25, level - 1));
}
/** THE DARK's gaits (seconds per hex on its advance): the
 *  Fray skitters, the Hollow drifts, the Tangle creeps, the
 *  Unraveler looms — slow, and all the more terrible for it. */
const DARK_GAIT: Record<string, number> = { fray: 1.4, hollow: 2.2, tangle: 2.8, unraveler: 3.4 };
/** Strike cadences on the clock (the old speed gauges, made
 *  time): a base beat of 2.8s, quickened by the striker's
 *  speed on the same 1–5 scale FATE already uses. */
const BEAT_MS = 2800;
function lightIntervalMs(u: FieldUnit): number {
  return Math.round(BEAT_MS * 5 / ((ELEMENT_HIT_BONUS[u.card.element] ?? 1) + 4));
}
function darkIntervalMs(e: EnemyUnit): number {
  return Math.round(BEAT_MS * 5 / ((DARK_SPEED[e.kind] ?? 1) + 4));
}
/** Where a travelling thing stands right now: the tile of its
 *  road its journey's fraction has reached. */
function roadTileAt(march: { road: string[]; since: number; endsAt: number }, now: number): string {
  const road = march.road;
  if (road.length < 2) return road[0];
  const frac = Math.min(1, Math.max(0, (now - march.since) / Math.max(1, march.endsAt - march.since)));
  return road[Math.min(road.length - 1, Math.floor(frac * (road.length - 1)))];
}

/** The Dark roster the room shows — names and tellings; the faces
 *  resolve live from the game's current enemy art. */
const ENEMY_ROSTER = [
  { name: "fray", label: "Fray", note: "Small ink splatters. Weak alone, dangerous in groups." },
  { name: "unraveler", label: "Unraveler", note: "Looming ink mass. Hunts the strongest standing." },
  { name: "hollow", label: "Hollow", note: "Pure void. Drains energy instead of blood." },
  { name: "tangle", label: "Tangle", note: "Knotted thorns. Pins one Awokin where it stands." },
] as const;

interface TaleEntry {
  at: number;
  text: string;
}

/** A BASTION BATTLE at the Table (the Columns, 2026-10-17): a
 *  host's call to arms, claimed into a room. The seats fight the
 *  column's true roster; their energy is ONE POOL (joining
 *  Tenders' energy joins the pool, scaled by level); an AMBUSH
 *  call — warned ahead, while the column still marched — lends
 *  every strike +1. Victory and defeat report back to the land. */
interface BastionState {
  callId: number;
  /** The column's power tier — its dark things' level. */
  tier: number;
  kind: string; // bastion | ambush | siege
  hostKey: string; // the host seat's owner key (tender:<id>)
  hostTenderId: number;
  hostName: string;
  columnId: number | null;
  seedId: number | null;
  roster: { kind: string; count: number; power: number; hp: number }[];
  size: number;
  ambush: boolean;
  pool: number;
  poolMax: number;
  begun: boolean;
  resolved: boolean;
}

/** One visible strike of the round just resolved (2026-10-17):
 *  the referee reports who struck whom, and the Table flies
 *  the attacker's element across the field — the visualized
 *  combat Nigel asked for, seated from the Battleground's own
 *  projectile language. */
interface Strike {
  /** A running id + the moment it flew — the continuous
   *  referee's clients dedupe and age shots by these. */
  id?: number;
  at?: number;
  from: string;
  to: string;
  element: string;
  side: "light" | "dark";
  hit: boolean;
  killed: boolean;
}

/** A CAMPAIGN at the Table (Phase B, 2026-10-18; design of
 *  record: TABLE-DESIGN §4/§4.3–4.5). One Storytender deals
 *  from the whole roster; the party's energy is ONE BANK —
 *  seeded by the seated Tenders' stakes, fattened by the
 *  Harvest, spent on every cast (recasts at exponential
 *  prices), divided equally when the session ends by choice —
 *  or lost entire if the dark takes the star-seed while no
 *  one can cast: the Bastion falls, and the enemy ends the
 *  campaign by its own right. */
interface CampaignState {
  bank: number;
  bankStart: number;
  seeded: boolean;
  /** Enemy kinds the Storytender holds back, undealt. Hers
   *  alone — the Dark is sealed in campaign mode. */
  reserve: string[];
  deals: number;
  stage: { title: string; text: string; imageUrl: string | null; at: number } | null;
  skyNote: string | null;
  over: "ended" | "fallen" | null;
  /** Dissipations per seat per card — the recast multiplier. */
  recasts: Record<string, Record<string, number>>;
  storytenderName: string | null;
}

interface Room {
  id: string;
  /** "campaign" rooms (id begins "campaign") run Phase B;
   *  every other room is the casual Table, unchanged. */
  mode: "casual" | "campaign";
  campaign: CampaignState | null;
  bastion: BastionState | null;
  strikes: Strike[];
  players: Map<WebSocket, Player>;
  tale: TaleEntry[];
  sky: { mood: string; description: string; endsAt: string | null };
  field: Map<string, FieldUnit>;
  /** The instance map, dealt fresh with the room. The field
   *  map above is keyed by UNIT (owner|card), never by tile:
   *  up to STACK_CAP of the light may share a tile. */
  map: Map<string, MapTile>;
  workings: Working[];
  enemies: { name: string; label: string; note: string; art: string | null }[];
  dark: Map<string, EnemyUnit>;
  battle: { active: boolean; wave: number; timer: ReturnType<typeof setInterval> | null; ticking: boolean; lastTick?: number; beatAcc?: number };
  /** The continuous referee's strike ledger counter, and the
   *  last moment the seed-assault's warning was told. */
  strikeSeq?: number;
  assaultToldAt?: number;
  roundNo: number;
  /** Lore Warden: edges where a ward has FALLEN this sitting
   *  — the next ward raised on one stands written stronger. */
  writtenEdges?: Set<string>;
  prevWardEdges?: Set<string>;
  /** Lore Binder: bindings scheduled to echo a round later. */
  pendingEchoes?: { hex: string; pin: number; due: number }[];
}

const edgeKeyOf = (a: string, b: string): string => [a, b].sort().join("|");
/** Brand Walker's question: does this working's ground —
 *  its hex, or its edge's two — touch the named hex? */
function workingBeside(w: Working, hex: string): boolean {
  const ground = [w.hex, w.hexA, w.hexB].filter((x): x is string => !!x);
  return ground.includes(hex) || ground.some(g => neighborsOf(g).includes(hex));
}

const rooms = new Map<string, Room>();
/** Sign-in tokens issued by /api/table/auth: token → Discord user. */
const authTokens = new Map<string, { id: string; name: string }>();

// ── The real deck (Nigel's word, 2026-10-16) ─────────────────────
// A bound seat is dealt from its Tender's own collection: their
// Awoken, with the true card faces the site serves, the stats the
// game's own payload builder computes, and the element the sum of
// the parts declares. The binding is one Discord name ↔ one Tender.

async function bindingFor(discordId: string): Promise<number | null> {
  try {
    const rows = await db.select().from(schema.tableBindings)
      .where(eq(schema.tableBindings.discordId, discordId)).limit(1);
    return rows.length ? rows[0].tenderId : null;
  } catch { return null; }
}

async function tenderDisplayName(tenderId: number): Promise<string | null> {
  try {
    const rows = await db.select().from(schema.tenders)
      .where(eq(schema.tenders.id, tenderId)).limit(1);
    return rows.length ? (rows[0].tenderName ?? null) : null;
  } catch { return null; }
}

const ELEMENT_ORDER = ["tide", "sky", "stone", "root", "fire"];

/** An Awoken's element for the Table's one-glyph face: the dominant
 *  filed element across its parts (the sum-of-the-parts law), ties
 *  broken by the canonical order, no tally at all → neutral. */
function dominantElement(layers: { element?: string | null }[]): string {
  const tally = new Map<string, number>();
  for (const layer of layers) {
    const el = layer.element ?? null;
    if (el && el !== "neutral") tally.set(el, (tally.get(el) ?? 0) + 1);
  }
  let best = "neutral";
  let bestCount = 0;
  for (const el of ELEMENT_ORDER) {
    const count = tally.get(el) ?? 0;
    if (count > bestCount) { best = el; bestCount = count; }
  }
  return best;
}

// ── FATE AT THE TABLE (Nigel, 2026-10-17) ─────────────────
// Toughness IS the Armor Class. Every blow rolls a d20 to
// hit; the attack bonus is the striker's ELEMENT (stone +1,
// root +2, tide +3, sky +4, fire +5) plus its LEVEL steps
// (+1 at levels 3, 6, 9). A landed blow's harm is SUMS:
// each of the striker's parts rolls its own element's die
// (the skeleton's dice: sky d4, root d6, tide d8, stone
// d12, fire d10) plus its filed power, and the rolls add.
// Then DIABLO's equation mitigates what landed: harm ×
// (1 − armor/(armor + 50 × attacker's level)), the armor
// being the defender's toughness — or a dark thing's armor.
// What survives burns the Awoken's SHIELD first: toughness
// × its element die, rolled when it is summoned; overflow
// wounds. A natural 20 always hits and rolls its harm dice
// twice; a natural 1 always misses. The Written Light is
// not a blow: workings' harm ignores AC and armor alike,
// as spell harm always has. Skills, spells, and runes that
// ADD to AC are named for the future — the hooks live in
// acOf() below, returning 0 until content fills them.
const FATE_DIE: Record<string, number> = { sky: 4, root: 6, tide: 8, stone: 12, fire: 10, neutral: 6, unaligned: 6, dark: 6 };
const ELEMENT_HIT_BONUS: Record<string, number> = { stone: 1, root: 2, tide: 3, sky: 4, fire: 5 };
const DARK_ARMOR: Record<string, number> = { fray: 4, unraveler: 6, hollow: 5, tangle: 8 };
const DARK_SPEED: Record<string, number> = { fray: 3, unraveler: 2, hollow: 0, tangle: 1 };
function dN(sides: number): number { return 1 + Math.floor(Math.random() * sides); }
function fateLevelBonus(level: number): number { return Math.floor(Math.max(1, level) / 3); }
function fateMitigate(raw: number, armor: number, attackerLevel: number): number {
  if (raw <= 0) return 0;
  const cut = armor / (armor + 50 * Math.max(1, attackerLevel));
  return Math.max(1, Math.round(raw * (1 - cut)));
}
/** An Awoken's parts for Fate: its worn pieces, each with a
 *  filed element and power. A card dealt without parts
 *  strikes as one piece of its own element and whole power. */
function partsOf(card: TableCard): { element: string; power: number }[] {
  if (card.parts && card.parts.length) return card.parts;
  return [{ element: card.element, power: card.power }];
}
function fatePartsDamage(card: TableCard, crit: boolean): number {
  let total = 0;
  for (const part of partsOf(card)) {
    const die = FATE_DIE[part.element] ?? 6;
    total += dN(die) + part.power;
    if (crit) total += dN(die);
  }
  return total;
}
/** The dark's harm: its power, rolled as that many of the
 *  curse's dice (d6), summed; a critical rolls them twice. */
function fateDarkDamage(enemy: EnemyUnit, crit: boolean): number {
  let total = 0;
  const n = Math.max(1, enemy.power);
  for (let i = 0; i < n; i++) { total += dN(6); if (crit) total += dN(6); }
  return total;
}
/** AC beyond toughness: skills, spells, and runes will add
 *  here (Nigel's naming). Nothing adds yet. */
function acBonusOf(_unit: FieldUnit): number { return 0; }

export async function deckForTender(tenderId: number): Promise<TableCard[]> {
  const ownerKey = tenderOwnerKey(tenderId);
  // The Table deals the UN-FIELDED roster only (Nigel, 2026-10-18):
  // an Awokin standing on the Territory field cannot also stand
  // here. Champions and the housed court are NOT field placements —
  // they stay in hand for battles, as the Territory dock promises.
  const placedRows = await db.select().from(schema.fieldPlacements)
    .where(eq(schema.fieldPlacements.ownerKey, ownerKey)).catch(() => [] as { awakenedId: number }[]);
  const placedIds = new Set(placedRows.map(r => r.awakenedId));
  const rows = (await db.select().from(schema.awakened)
    .where(eq(schema.awakened.ownerKey, ownerKey)))
    .filter(row => !placedIds.has(row.id));
  const cards: TableCard[] = [];
  for (const row of rows.slice(0, 120)) {
    const payload = await awakenedPayloadById(row.id).catch(() => null);
    if (!payload) continue;
    cards.push({
      id: randomUUID(),
      name: payload.name,
      power: payload.power,
      toughness: payload.toughness,
      element: dominantElement(payload.layers as { element?: string | null }[]),
      art: payload.image_url,
      level: payload.level,
      awokenId: payload.id,
      parts: ((payload.layers ?? []) as { category?: string; element?: string | null; power?: number | null }[])
        .filter(l => ["body", "arms", "head", "aura"].includes(l.category ?? ""))
        .map(l => ({ element: l.element ?? "neutral", power: l.power ?? 0 })),
      layers: ((payload.layers ?? []) as { source_id?: string; category?: string; imageUrl?: string | null }[])
        .map(l => ({ source_id: l.source_id ?? "", category: l.category ?? "", imageUrl: l.imageUrl ?? null })),
    });
  }
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

async function currentSky(): Promise<Room["sky"]> {
  try {
    const rows = await db.select().from(schema.settings)
      .where(eq(schema.settings.key, "world_mood")).limit(1);
    if (rows.length) {
      const data = JSON.parse(rows[0].value) as { mood: string; description?: string; endsAt?: string };
      if (data?.mood) return { mood: data.mood, description: data.description ?? "", endsAt: data.endsAt ?? null };
    }
  } catch { /* the sky is a display truth; never let it break the room */ }
  return { mood: "quiet", description: "", endsAt: null };
}

async function loadProfile(key: string, name: string): Promise<{ notes: string; inventory: string[] }> {
  const rows = await db.select().from(schema.tableProfiles)
    .where(eq(schema.tableProfiles.playerKey, key)).limit(1);
  if (rows.length) {
    let inventory: string[] = [];
    try { const parsed = JSON.parse(rows[0].inventory); if (Array.isArray(parsed)) inventory = parsed.filter(x => typeof x === "string"); } catch {}
    return { notes: rows[0].notes, inventory };
  }
  await db.insert(schema.tableProfiles)
    .values({ playerKey: key, displayName: name, notes: "", inventory: "[]" })
    .onConflictDoNothing();
  return { notes: "", inventory: [] };
}

async function saveProfile(player: Player): Promise<void> {
  await db.insert(schema.tableProfiles)
    .values({
      playerKey: player.key,
      displayName: player.name,
      notes: player.notes.slice(0, 8000),
      inventory: JSON.stringify(player.inventory.slice(0, 100)),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.tableProfiles.playerKey,
      set: {
        displayName: player.name,
        notes: player.notes.slice(0, 8000),
        inventory: JSON.stringify(player.inventory.slice(0, 100)),
        updatedAt: new Date(),
      },
    });
}

function sharedState(room: Room) {
  const seated = [...room.players.values()].filter(p => !p.watcher);
  return {
    room: room.id,
    mode: room.mode,
    sky: room.campaign?.skyNote ? { ...room.sky, description: room.campaign.skyNote } : room.sky,
    round: room.roundNo,
    threat: [...room.dark.values()].reduce((sum, e) => sum + e.power, 0),
    players: seated.map(p => ({ key: p.key, name: p.name, handCount: p.hand.length, energy: Math.floor(room.campaign && !room.campaign.over && room.campaign.seeded ? room.campaign.bank : p.energy), maxEnergy: p.maxEnergy, tenderHp: p.tenderHp, maxTenderHp: p.maxTenderHp, fallen: p.fallen, storytender: !!p.storytender })),
    watcherCount: room.players.size - seated.length,
    campaign: room.campaign ? {
      bank: Math.floor(room.campaign.bank),
      bankStart: room.campaign.bankStart,
      seeded: room.campaign.seeded,
      over: room.campaign.over,
      storytenderName: room.campaign.storytenderName,
      stage: room.campaign.stage,
      deals: room.campaign.deals,
    } : null,
    tale: room.tale.slice(-TALE_CAP),
    map: [...room.map.values()].map(t => ({
      id: t.id, q: t.q, r: t.r, cursed: t.cursed, element: t.element,
      curseHp: Math.ceil(t.curseHp), curseMaxHp: t.curseMaxHp,
      landing: t.landingFor ? (seatByKey(room, t.landingFor)?.name ?? null) : null,
    })),
    dark: [...room.dark.values()].map(e => ({ ...e })),
    workings: room.workings.map(w => ({ ...w })),
    battle: { active: room.battle.active, wave: room.battle.wave },
    field: [...room.field.values()].map(u => ({
      hex: u.hex, cardId: u.card.id, name: u.card.name, art: u.card.art ?? null, layers: u.card.layers ?? [], element: u.card.element,
      power: u.card.power, toughness: u.card.toughness, hp: u.hp, maxHp: u.maxHp,
      shield: u.shield, maxShield: u.maxShield,
      march: u.march ?? null,
      level: u.card.level ?? null, ownerKey: u.ownerKey, ownerName: u.ownerName,
    })),
    enemies: room.enemies,
    strikes: room.strikes,
    bastion: room.bastion ? {
      callId: room.bastion.callId, kind: room.bastion.kind, hostName: room.bastion.hostName,
      ambush: room.bastion.ambush, pool: Math.floor(room.bastion.pool), poolMax: room.bastion.poolMax,
      begun: room.bastion.begun, resolved: room.bastion.resolved, size: room.bastion.size,
    } : null,
  };
}

function sendState(room: Room): void {
  const state = sharedState(room);
  for (const [ws, player] of room.players) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    ws.send(JSON.stringify({
      type: "state",
      state,
      // THE privacy law: a hand (and the notes and inventory) travel
      // only inside their owner's own payload. Other sockets never
      // receive them — not hidden, absent.
      you: player.watcher ? null : {
        key: player.key,
        name: player.name,
        hand: player.hand,
        notes: player.notes,
        inventory: player.inventory,
        bound: player.bound ?? null,
        energy: Math.floor(room.bastion?.begun && !room.bastion.resolved ? room.bastion.pool : room.campaign && !room.campaign.over && room.campaign.seeded ? room.campaign.bank : player.energy),
        recasts: room.campaign ? (room.campaign.recasts[player.key] ?? {}) : {},
        storytender: player.storytender && room.campaign ? {
          reserve: room.campaign.reserve,
          reserveThreat: room.campaign.reserve.reduce((s, k) => s + (ENEMY_STATS[k]?.power ?? 0), 0),
          partyPower: [...room.field.values()].reduce((s, u) => s + u.card.power, 0),
          deals: room.campaign.deals,
          bank: Math.floor(room.campaign.bank),
          seeded: room.campaign.seeded,
          over: room.campaign.over,
        } : null,
        yourCall: (() => {
          if (!player.expKey) return null;
          try {
            const c = sqlite.prepare("SELECT id, kind, column_id, seed_id, join_key FROM bastion_calls WHERE owner_key = ? AND state = 'open' ORDER BY created_at ASC LIMIT 1").get(player.expKey) as any;
            return c ? { id: c.id, kind: c.kind, columnId: c.column_id, seedId: c.seed_id, joinKey: c.join_key } : null;
          } catch { return null; }
        })(),
        maxEnergy: player.maxEnergy,
        band: [...room.field.values()].filter(u => u.ownerKey === player.key).length,
        landing: [...room.map.values()].find(t => t.landingFor === player.key)?.id ?? null,
        bandCap: companyCapFor(player.expKey, player.tenderLevel),
        tenderLevel: player.tenderLevel,
        healTier: player.healTier,
        healAmount: player.healAmount,
        wardRuneUnlocked: player.wardRuneUnlocked,
        tenderHp: player.tenderHp,
        maxTenderHp: player.maxTenderHp,
        pools: player.pools ?? null,
      },
    }));
  }
}

function tell(room: Room, text: string): void {
  room.tale.push({ at: Date.now(), text });
  if (room.tale.length > TALE_CAP * 2) room.tale = room.tale.slice(-TALE_CAP);
}

async function getRoom(id: string): Promise<Room> {
  let room = rooms.get(id);
  if (!room) {
    // The Dark's faces resolve once, at the room's making, under
    // the game's current-art law; null means the bundled face.
    const { art } = await resolveCurrentEnemyArt().catch(() => ({ art: {} as Record<string, { url: string } | null> }));
    const campaignMode = id.startsWith("campaign");
    room = {
      id, players: new Map(), tale: [], sky: await currentSky(),
      mode: campaignMode ? "campaign" : "casual",
      campaign: campaignMode ? loadCampaign(id) : null,
      field: new Map(),
      map: freshInstanceMap(),
      workings: [],
      enemies: ENEMY_ROSTER.map(e => ({ ...e, art: art[e.name]?.url ?? null })),
      dark: new Map(),
      bastion: null,
      strikes: [],
      battle: { active: false, wave: 1, timer: null, ticking: false },
      roundNo: 0,
    };
    rooms.set(id, room);
    if (campaignMode) restoreCampaignTale(room);
  }
  return room;
}

// ── The Referee (P1, 2026-10-16) ────────────────────────
// The battle loop, run by the room itself. Damage is always
// the attacker's filed Power; Tenders are shielded by their
// standing company and hurt only when nothing stands (or by
// the Hollow, which drains energy instead of blood). Class
// flavor lives in targeting, exactly as the Compendium files
// it: the Unraveler hunts the strongest standing, the Fray
// swarm the weakest, the Tangle pins.

function hexDist(a: string, b: string): number {
  return axialDist(a, b);
}

function seatByKey(room: Room, key: string): Player | undefined {
  for (const p of room.players.values()) if (p.key === key) return p;
  return undefined;
}

/** Pay battle EXP to a seat's Tender (bound seats) and keep
 *  the seat's standing true when a level is crossed. */
async function payBattleExp(room: Room, seat: Player, amount: number, why: string): Promise<void> {
  if (!seat.expKey || amount <= 0) return;
  const before = seat.tenderLevel;
  const view = await awardTenderExp(seat.expKey, amount).catch(() => null);
  if (!view) return;
  if (view.level > before) {
    const gained = view.level - before;
    seat.tenderLevel = view.level;
    seat.healTier = view.healTier;
    seat.healAmount = view.healAmount;
    seat.wardRuneUnlocked = view.wardRuneUnlocked;
    seat.maxTenderHp = view.maxTenderHp;
    seat.tenderHp = Math.min(view.maxTenderHp, seat.tenderHp + 5 * gained);
    tell(room, `${seat.name} has reached Tender Lv ${view.level} — ${why} The party feels it.`);
  }
}


// ── The Written Light at the Table (2026-10-17) ─────────
// Nigel's ruling brought the glyphs and their functions to
// the Table: WARDS stand on the edge between two hexes,
// RUNES are written on a hex's ground, and BINDING covers
// the whole hex — a sprung rune holds everything standing
// on it, never a chosen one. Workings are written for one
// battle; when the battle ends the light fades (after any
// unfed Crown Shard has fallen where it must).

function neighborsOf(hex: string): string[] {
  const t = TILE_BY_ID.get(hex);
  if (!t) return [];
  return TILE_DIRS.map(([dq, dr]) => `${t.q + dq},${t.r + dr}`).filter(id => TILE_BY_ID.has(id));
}

// ── The instance map's keepers ─────────────────────────────
/** A fresh instance: every tile cursed at its ring's full
 *  corruption but the seed's own ground, which is the party's
 *  first purified earth. */
function freshInstanceMap(): Map<string, MapTile> {
  const map = new Map<string, MapTile>();
  for (const t of TILE_DEFS) {
    const ring = ringOf(t.id);
    const seed = t.id === SEED_TILE;
    map.set(t.id, {
      id: t.id, q: t.q, r: t.r,
      cursed: !seed, element: seed ? "sky" : null,
      curseHp: seed ? 0 : curseHpForRing(ring), curseMaxHp: seed ? 0 : curseHpForRing(ring),
      landingFor: null,
    });
  }
  return map;
}

/** The field is keyed by unit, not by tile — the stack law. */
function unitKeyOf(u: FieldUnit): string { return `${u.ownerKey}|${u.card.id}`; }
function unitsAt(room: Room, tileId: string): FieldUnit[] {
  return [...room.field.values()].filter(u => u.hex === tileId);
}
function unitStanding(room: Room, u: FieldUnit): boolean {
  return room.field.get(unitKeyOf(u)) === u;
}
function placeUnit(room: Room, u: FieldUnit): void { room.field.set(unitKeyOf(u), u); }
function removeUnit(room: Room, u: FieldUnit): void { room.field.delete(unitKeyOf(u)); }
function isMarching(u: FieldUnit, now = Date.now()): boolean {
  return !!u.march && now < u.march.endsAt;
}
/** The standing light: fielded, arrived, and able to be met. */
function standingUnits(room: Room): FieldUnit[] {
  const now = Date.now();
  return [...room.field.values()].filter(u => !isMarching(u, now));
}
/** The dark registry is keyed by id (see EnemyUnit.id); the
 *  tile lookups scan, as springHex always has. */
let darkSeq = 0;
function nextDarkId(): string { return `dk${++darkSeq}`; }
function darkAt(room: Room, hex: string): EnemyUnit | undefined {
  return [...room.dark.values()].find(e => e.hex === hex);
}
function darkOn(room: Room, hex: string): boolean {
  return [...room.dark.values()].some(e => e.hex === hex);
}

/** A tile turns to the light: felled dark frees it at once,
 *  or the standing light grinds its corruption to nothing. */
function purifyTile(room: Room, tile: MapTile, element: string): void {
  if (!tile.cursed) return;
  tile.cursed = false;
  tile.element = element;
  tile.curseHp = 0;
  tell(room, `🌿 The land turns — ${element} ground joins the light.`);
}

/** ONE PURIFIED TILE PER PLAYER (Nigel, 2026-10-18): when a
 *  Tender takes a seat and holds no landing yet, a tile of the
 *  second ring purifies for them — spread as far from the
 *  other landings as the map allows — in the element of their
 *  first Awokin's aspect. Late seats land the same way. The
 *  land remembers: a landing stays purified when its Tender
 *  rises, and another may claim it after. */
function assignLanding(room: Room, player: Player): void {
  if (player.watcher || player.storytender) return;
  if ([...room.map.values()].some(t => t.landingFor === player.key)) return;
  const claimed = [...room.map.values()].find(t => !t.cursed && t.landingFor === null && t.id !== SEED_TILE && !darkOn(room, t.id) && unitsAt(room, t.id).length === 0);
  if (claimed) { claimed.landingFor = player.key; return; }
  for (const ring of [2, 1, 3]) {
    const taken = [...room.map.values()].filter(t => t.landingFor && t.landingFor !== player.key);
    const candidates = [...room.map.values()].filter(t => t.cursed && ringOf(t.id) === ring && !darkOn(room, t.id));
    if (!candidates.length) continue;
    candidates.sort((a, b) => {
      const spread = (t: MapTile) => taken.length ? Math.min(...taken.map(o => axialDist(t.id, o.id))) : 99;
      return spread(b) - spread(a);
    });
    const tile = candidates[0];
    const first = player.hand[0];
    const element = first ? dominantElement(partsOf(first) as { element?: string | null }[]) : "neutral";
    purifyTile(room, tile, element);
    tile.landingFor = player.key;
    tell(room, `🌱 ${player.name}'s light takes root — a first tile of ${element} ground is theirs to stand on.`);
    return;
  }
}

/** Where the dark is dealt: cursed ground, the rim first —
 *  the dark presses in from the instance's edge. */
function darkGround(room: Room, count: number): string[] {
  const cursed = [...room.map.values()].filter(t => t.cursed && !darkOn(room, t.id));
  cursed.sort((a, b) => ringOf(b.id) - ringOf(a.id) || Math.random() - 0.5);
  return cursed.slice(0, count).map(t => t.id);
}

/** The curse burns its guests (Nigel, 2026-10-18): a standing
 *  Awokin on cursed ground takes the ring's burn each round —
 *  its shield drinks first, as for any harm; what gets through
 *  unbinds. The seed's calm softens the inner rings. */
function hurtByCurse(room: Room, u: FieldUnit, burn: number): void {
  let wound = burn;
  if (u.shield > 0) {
    const absorbed = Math.min(u.shield, wound);
    u.shield -= absorbed;
    wound -= absorbed;
  }
  u.hp -= wound;
  if (u.hp <= 0) {
    noteDissipation(room, u);
    removeUnit(room, u);
    const owner = seatByKey(room, u.ownerKey);
    if (owner) owner.hand = [...owner.hand, u.card];
    tell(room, `The curse unbinds ${u.card.name} where it stood — it dissipates to its Tender's roster.`);
  }
}

function engineBright(room: Room, ownerKey: string): boolean {
  return room.workings.some(w => w.engine === "engine" && w.ownerKey === ownerKey);
}

function beaconReach(w: Working, extraRings = 0): Set<string> {
  const out = new Set<string>();
  let frontier: string[] = [];
  for (const hx of [w.hexA, w.hexB]) if (hx) { out.add(hx); frontier.push(hx); }
  for (let ring = 0; ring < 1 + extraRings; ring++) {
    const next: string[] = [];
    for (const hx of frontier) for (const n of neighborsOf(hx)) if (!out.has(n)) { out.add(n); next.push(n); }
    frontier = next;
  }
  return out;
}

function fellDark(room: Room, enemy: EnemyUnit, killer: Player | null, fellElement?: string): void {
  room.dark.delete(enemy.id);
  tell(room, `The ${enemy.label} unravels!`);
  // The ground it held is freed by the felling (the Instance
  // Map): a cursed tile whose dark falls turns to the light.
  const tile = room.map.get(enemy.hex);
  if (tile) purifyTile(room, tile, fellElement ?? "neutral");
  if (room.campaign && !room.campaign.over) { campaignFell(room, enemy, killer); return; }
  if (killer && !killer.fallen) {
    killer.energy = Math.min(killer.maxEnergy + 10, killer.energy + 3);
    void payBattleExp(room, killer, 2, "The dark pays for its felling.");
  }
}

// ── THE CAMPAIGN (Phase B, 2026-10-18) ───────────────────
// The Harvest economy and the Storytender's instruments.
// Tuning named where the design left it open (§8): the
// recast multiplier doubles per dissipation (capped ×32);
// the harvest a felled dark pays is its power ×2 plus a
// share of its hardiness; stakes are each seat's whole
// sitting energy, poured in entire.

function freshCampaign(): CampaignState {
  return {
    bank: 0, bankStart: 0, seeded: false, reserve: [], deals: 0,
    stage: null, skyNote: null, over: null, recasts: {}, storytenderName: null,
  };
}

/** Adjournment: a campaign is a bloodline, not a match — its
 *  state rests in ui_config until the room is opened again. */
function saveCampaign(room: Room): void {
  if (!room.campaign) return;
  try {
    const snap = {
      ...room.campaign,
      tale: room.tale.slice(-100),
      wave: room.battle.wave,
    };
    sqlite.prepare("INSERT INTO ui_config (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .run(`table.campaign.${room.id}`, JSON.stringify(snap), Date.now());
  } catch { /* an unsaved adjournment loses the rest, never the room */ }
}

function loadCampaign(id: string): CampaignState {
  const c = freshCampaign();
  try {
    const row = sqlite.prepare("SELECT value FROM ui_config WHERE key = ?").get(`table.campaign.${id}`) as { value: string } | undefined;
    if (!row) return c;
    const snap = JSON.parse(row.value);
    if (snap && typeof snap === "object" && !snap.over) {
      Object.assign(c, snap);
      delete (c as any).tale;
      delete (c as any).wave;
      c.reserve = Array.isArray(c.reserve) ? c.reserve.filter(k => k in ENEMY_STATS) : [];
    }
  } catch { /* a corrupt rest is a fresh campaign */ }
  return c;
}

function clearCampaignSave(id: string): void {
  try { sqlite.prepare("DELETE FROM ui_config WHERE key = ?").run(`table.campaign.${id}`); } catch {}
}

/** The adjourned tale and wave ride back into a reopened room. */
function restoreCampaignTale(room: Room): void {
  try {
    const row = sqlite.prepare("SELECT value FROM ui_config WHERE key = ?").get(`table.campaign.${room.id}`) as { value: string } | undefined;
    if (!row) return;
    const snap = JSON.parse(row.value);
    if (snap && !snap.over) {
      if (Array.isArray(snap.tale) && room.tale.length === 0) room.tale = snap.tale;
      if (typeof snap.wave === "number") room.battle.wave = snap.wave;
    }
  } catch {}
}

/** The purse a cast draws on: in a living campaign, the bank;
 *  otherwise the seat's own energy. (A bastion's pool keeps
 *  its own older law, handled at its own charge site.) */
function purseOf(room: Room, player: Player): number {
  if (room.campaign && !room.campaign.over && room.campaign.seeded) return room.campaign.bank;
  return player.energy;
}

function chargePurse(room: Room, player: Player, cost: number): boolean {
  if (room.campaign && !room.campaign.over && room.campaign.seeded) {
    if (room.campaign.bank < cost) return false;
    room.campaign.bank -= cost;
    return true;
  }
  if (player.energy < cost) return false;
  player.energy -= cost;
  return true;
}

function purseName(room: Room): string {
  return room.campaign && !room.campaign.over && room.campaign.seeded ? "the bank" : "you";
}

/** The recast law: a dissipated Awokin's return costs its
 *  base × 2 per dissipation this campaign (capped at ×32) —
 *  early mercy is cheap; deep in a long campaign, each return
 *  devours a fortune (TABLE-DESIGN §4.3). */
function recastCount(room: Room, playerKey: string, cardId: string): number {
  return room.campaign?.recasts[playerKey]?.[cardId] ?? 0;
}

function castCost(room: Room, player: Player, card: TableCard): number {
  const base = Math.max(1, card.power);
  if (!room.campaign || room.campaign.over) return base;
  return base * 2 ** Math.min(recastCount(room, player.key, card.id), 5);
}

function noteDissipation(room: Room, unit: FieldUnit): void {
  if (!room.campaign || room.campaign.over) return;
  const byCard = room.campaign.recasts[unit.ownerKey] ??= {};
  byCard[unit.card.id] = (byCard[unit.card.id] ?? 0) + 1;
}

/** What a felled dark pays the bank, and the XP that flows
 *  with it — split among the seats whose Awoken stand in
 *  this Unraveling: the bench does not level on the line's
 *  work (§4.3). */
function campaignFell(room: Room, enemy: EnemyUnit, _killer: Player | null): void {
  const c = room.campaign;
  if (!c || c.over) return;
  const harvest = Math.max(1, enemy.power * 2 + Math.floor(enemy.maxHp / 5));
  c.bank += harvest;
  const standingKeys = [...new Set([...room.field.values()].map(u => u.ownerKey))];
  const seats = standingKeys
    .map(k => seatByKey(room, k))
    .filter((p): p is Player => !!p && !p.fallen && !p.storytender);
  if (seats.length) {
    const share = Math.max(1, Math.floor(harvest / seats.length));
    for (const s of seats) void payBattleExp(room, s, share, "The Harvest divides among the standing.");
  }
  tell(room, `The ${enemy.label}'s light is harvested — ⚡${harvest} joins the bank (⚡${c.bank}).`);
}

/** The bank is seeded once, at the campaign's first dealing:
 *  every seated Tender's sitting energy pours into one pot. */
function seedBankIfNeeded(room: Room): void {
  const c = room.campaign;
  if (!c || c.seeded || c.over) return;
  let total = 0;
  for (const p of room.players.values()) {
    if (p.watcher || p.storytender) continue;
    total += p.energy;
    p.energy = 0;
  }
  c.bank = total;
  c.bankStart = total;
  c.seeded = true;
  tell(room, `The stakes are poured into one bank — ⚡${total} of pooled light. What the dark yields joins it; what you cast draws from it; what remains when you turn home divides evenly among you.`);
}

/** A campaign ends two ways. BY CHOICE (the Storytender's
 *  word, or the players' when no Storytender sits): the
 *  leftover divides equally among the seated Tenders.
 *  BY THE FALL: the dark took the star-seed — no division;
 *  the enemy holds the light, and the campaign closes by
 *  its right (§4.4). */
function endCampaign(room: Room, how: "ended" | "fallen"): void {
  const c = room.campaign;
  if (!c || c.over) return;
  c.over = how;
  endBattle(room);
  room.dark.clear();
  if (how === "ended") {
    const seats = [...room.players.values()].filter(p => !p.watcher && !p.storytender);
    const share = seats.length ? Math.floor(c.bank / seats.length) : 0;
    for (const p of seats) p.energy += share;
    tell(room, share > 0
      ? `The campaign turns home. The bank's remaining ⚡${c.bank} divides evenly — ⚡${share} to each Tender still seated. The instance collapses; the growth goes home with you.`
      : "The campaign turns home. The bank stands empty — what was gathered was spent in the holding, and the growth goes home with you.");
    c.bank = 0;
  } else {
    tell(room, `THE BASTION FALLS. The dark takes the star-seed and the pooled light with it — ⚡${c.bank} lost to the curse. This campaign is ended by the enemy's right. Begin again at the lower, poorer pools, when you will — no mark stands against you beyond this tale.`);
    c.bank = 0;
  }
  clearCampaignSave(room.id);
  sendState(room);
}

/** Spring the rune written on a hex, if the dark stands on it. */
function springHex(room: Room, hex: string, fired: Set<string>): void {
  const darkHere = [...room.dark.values()].filter(e => e.hex === hex);
  if (!darkHere.length) return;
  const rune = room.workings.find(w => w.kind === "rune" && w.hex === hex && !fired.has(w.id));
  if (!rune) return;
  fired.add(rune.id);
  const caster = seatByKey(room, rune.ownerKey) ?? null;
  const seff = workingEffects(caster?.expKey);
  // The Remembering Ray (tranche one): Lore keeps the tale
  // of every spring — +1 Tender EXP to the rune's Tender.
  if (caster?.expKey && seff.rememberingRay) void awardTenderExp(caster.expKey, 1).catch(() => {});
  // Lore Runewright: the first spring of each rune pays.
  if (caster && seff.loreRunewright && !rune.firstPaid) {
    rune.firstPaid = true;
    caster.energy = Math.min(caster.maxEnergy + 10, caster.energy + 1);
  }
  const bright = caster && engineBright(room, caster.key) ? 1 : 0;
  if (rune.engine === "lattice") {
    // The Lattice holds with a health rating (Nigel, 2026-10-17):
    // pinning a dark costs the Lattice that dark's power from its
    // health — it holds what it can afford, and stands on while
    // health remains instead of spending itself in one spring.
    let heldCount = 0;
    for (const e of darkHere) {
      const strain = Math.max(1, e.power);
      if (rune.hp >= strain) {
        rune.hp -= strain;
        e.pinnedUntil = Math.max(e.pinnedUntil ?? 0, Date.now() + (rune.nums.pinRounds ?? 2) * BEAT_MS);
        heldCount++;
      }
    }
    if (heldCount) tell(room, `${rune.name} springs — the floor is the snare, and ${heldCount} of the dark stand bound in light.`);
    // Lore Binder (tranche one): the binding ECHOES a round
    // later at half strength on the same ground.
    if (seff.loreBinder && heldCount > 0) {
      room.pendingEchoes ??= [];
      room.pendingEchoes.push({ hex, pin: Math.max(1, Math.floor((rune.nums.pinRounds ?? 2) / 2)), due: room.roundNo + 1 });
    }
    if (rune.hp <= 0) {
      room.workings = room.workings.filter(w => w !== rune);
      tell(room, `${rune.name} is worn through and goes out, spent and honored.`);
    } else if (heldCount) {
      tell(room, `${rune.name} holds on — ❤${rune.hp} of its light remains.`);
    }
  } else if (rune.engine === "blade" || rune.engine === "blades") {
    const eff = workingEffects(caster?.expKey);
    const power = (rune.nums.power ?? (rune.engine === "blade" ? 6 : 3)) + bright * ((rune.nums.brightBonus ?? 1) + (eff.millwright ? 1 : 0))
      // War Runewright (tranche one): sprung on dark that has
      // not yet struck, the writing deals +2.
      + (eff.warRunewright && darkHere.some(e => !e.struck) ? 2 : 0);
    tell(room, `${rune.name} springs — ${power} harm to everything standing on its ground.`);
    let felledByRune = 0;
    for (const e of darkHere) { e.hp -= power; if (e.hp <= 0) { felledByRune++; fellDark(room, e, caster, rune.hue && rune.hue !== "unaligned" ? rune.hue : "neutral"); } }
    // Hungry Ink (tranche one): the writing drinks the fell.
    if (caster && eff.hungryInk && felledByRune > 0) caster.energy = Math.min(caster.maxEnergy + 10, caster.energy + felledByRune);
    rune.charges--;
    if (rune.charges <= 0) retireSprungRune(room, rune);
    else tell(room, `${rune.name} hums on, waiting for one more.`);
  } else if (rune.engine === "coil") {
    const free = STANDABLE_TILES.filter(hx => hx !== hex && !darkOn(room, hx));
    let moved = 0;
    for (const e of darkHere) {
      if (!free.length) break;
      const spot = free.splice(Math.floor(Math.random() * free.length), 1)[0];
      e.hex = spot; // registered by id: the throw is just a new tile
      moved++;
    }
    if (caster && moved) caster.energy = Math.min(caster.maxEnergy + 10, caster.energy + Math.min(rune.nums.energyCap ?? 3, moved * (rune.nums.energyPerDark ?? 1)));
    tell(room, `${rune.name} turns the dark aside — ${moved} thrown back to far ground, their strikes forgotten.`);
    retireSprungRune(room, rune);
  } else if (rune.engine === "shardrain") {
    // SHARD RAIN (Nigel, 2026-10-17): ONE pool over ALL the
    // covered ground. The group's hexes gather every foe
    // standing under the same writing; the dice — the base,
    // plus one per attunement level snapshotted at the cast —
    // roll once, and the pool splits between them all, the
    // remainder walking down the line one point at a time.
    const group = rune.group ?? rune.id;
    const covered = room.workings.filter(w => w.kind === "rune" && w.engine === "shardrain" && (w.group ?? w.id) === group);
    const hexSet = new Set(covered.map(w => w.hex));
    const foes = [...room.dark.values()].filter(e => hexSet.has(e.hex));
    if (foes.length) {
      const dice = Math.max(1, (rune.nums.diceBase ?? 2) + (rune.nums.dicePerLevel ?? 1) * (rune.nums.rainLevel ?? 0));
      const rolls: number[] = [];
      let pool = 0;
      for (let i = 0; i < dice; i++) { const r = 1 + Math.floor(Math.random() * 6); rolls.push(r); pool += r; }
      const share = Math.floor(pool / foes.length);
      let rem = pool - share * foes.length;
      tell(room, `${rune.name} FALLS — the sky opens over ${hexSet.size} hex${hexSet.size === 1 ? "" : "es"}: ${dice} dice (${rolls.join(" + ")}) make a pool of ${pool}, split over ${foes.length} of the dark — ${share} harm each${rem ? `, and ${rem} of them take one more` : ""}.`);
      for (const e of foes) {
        const d = share + (rem > 0 ? (rem--, 1) : 0);
        e.hp -= d;
        if (e.hp <= 0) fellDark(room, e, caster, rune.hue && rune.hue !== "unaligned" ? rune.hue : "neutral");
      }
      room.workings = room.workings.filter(w => !covered.includes(w));
      if (covered[0]) maybeRewriteRune(room, covered[0]);
    }
  } else if (rune.engine === "shard") {
    // Falling Light (tranche one): the Shard reckons its
    // ground one ring wider — the fall measures, and lands
    // on, the neighbouring hexes' dark as well.
    const foes = seff.fallingLight
      ? [...room.dark.values()].filter(e => e.hex === hex || neighborsOf(hex).includes(e.hex))
      : darkHere;
    const greatest = Math.max(...foes.map(e => e.power));
    if (greatest >= (rune.nums.minPower ?? 5)) {
      const dmg = greatest * (rune.nums.multiplier ?? 2) + rune.pour * (rune.nums.harmPerPoint ?? 1);
      tell(room, `${rune.name} falls on the whole hex — ${dmg} harm, measured by the greatest standing there.`);
      let felledByShard = 0;
      for (const e of foes) { e.hp -= dmg; if (e.hp <= 0) { felledByShard++; fellDark(room, e, caster, rune.hue && rune.hue !== "unaligned" ? rune.hue : "neutral"); } }
      if (caster && workingEffects(caster.expKey).hungryInk && felledByShard > 0) caster.energy = Math.min(caster.maxEnergy + 10, caster.energy + felledByShard);
      retireSprungRune(room, rune);
    }
  }
}

/** The Second Thread (tranche one): when a holder's rune
 *  springs and spends itself, the Thread re-writes it once
 *  per battle on the same ground — fresh, full, and free. */
function maybeRewriteRune(room: Room, rune: Working): void {
  const caster = seatByKey(room, rune.ownerKey);
  if (!caster || caster.secondThreadUsed) return;
  if (!workingEffects(caster.expKey).secondThread) return;
  caster.secondThreadUsed = true;
  room.workings.push({
    ...rune, id: randomUUID(), hp: rune.maxHp, charges: rune.maxCharges ?? rune.charges,
    firstPaid: false, stops: 0,
  });
  tell(room, `The Second Thread holds — ${rune.name} is re-written on the same ground, free.`);
}
function retireSprungRune(room: Room, rune: Working): void {
  room.workings = room.workings.filter(w => w !== rune);
  maybeRewriteRune(room, rune);
}

/** Battle's end: unfed Shards fall where they must; then all
 *  written light fades — it was written for this battle. */
function settleShardsAndFade(room: Room): void {
  for (const w of [...room.workings]) {
    if (w.engine !== "shard") continue;
    const mine = [...room.field.values()].filter(u => u.ownerKey === w.ownerKey);
    if (mine.length) {
      const strongest = mine.reduce((a, b) => (b.card.power > a.card.power ? b : a));
      const dmg = strongest.card.power * (w.nums.multiplier ?? 2) + w.pour * (w.nums.harmPerPoint ?? 1);
      strongest.hp -= dmg;
      tell(room, `${w.name} went unfed — a doom owed is a doom paid: it falls on ${strongest.card.name}, ${dmg} harm.`);
      if (strongest.hp <= 0) {
        noteDissipation(room, strongest);
        removeUnit(room, strongest);
        const owner = seatByKey(room, strongest.ownerKey);
        if (owner) owner.hand = [...owner.hand, strongest.card];
        tell(room, `${strongest.card.name} dissipates to its Tender's roster.`);
      }
    } else {
      tell(room, `${w.name} went unfed, and falls on empty ground — the Balance accepts the smaller price.`);
    }
  }
  if (room.workings.length) {
    // The Ground Remembers (tranche one): one marked rune
    // per holder does not fade — it waits on the same field
    // for the next battle, its mark spent in the waiting.
    const remembered = room.workings.filter(w => w.rememberMark);
    for (const w of remembered) {
      w.rememberMark = false;
      tell(room, `${w.name} does not fade — the ground remembers it, and it waits.`);
    }
    if (remembered.length < room.workings.length) tell(room, "The written light fades from the field — it was written for this battle.");
    room.workings = remembered;
  }
}

function dealWave(room: Room): void {
  for (const p of room.players.values()) { p.secondWallUsed = false; p.secondThreadUsed = false; p.groundRemembered = false; p.steadyUsed = false; }
  const wave = room.battle.wave;
  const kinds = ["fray", "fray", "fray", "tangle", "tangle", "hollow", "unraveler"];
  const spots = darkGround(room, 3 + (wave - 1) * 2);
  const count = spots.length;
  for (const hex of spots) {
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const base = ENEMY_STATS[kind];
    const rosterFace = room.enemies.find(e => e.name === kind);
    const hp = base.hp + (wave - 1);
    const foe: EnemyUnit = {
      id: nextDarkId(),
      hex, kind, label: rosterFace?.label ?? kind, art: rosterFace?.art ?? null,
      power: base.power + Math.floor((wave - 1) / 3), hp, maxHp: hp, pinnedUntil: 0, march: null,
      armor: base.armor + Math.floor((wave - 1) / 3), lvl: wave, speedGauge: 0,
    };
    room.dark.set(foe.id, foe);
  }
  for (const hex of spots) springHex(room, hex, new Set());
  room.battle.active = true;
  room.roundNo = 0;
  tell(room, `Wave ${wave} is dealt — ${count} of the dark take the field.`);
  startBattleTimer(room);
}

/** The column takes the field (the Columns, 2026-10-17): the
 *  roster's true kinds and numbers, at the field's far edges,
 *  with the column's own hardened power and health. */
function dealBastion(room: Room): void {
  const b = room.bastion;
  if (!b) return;
  for (const p of room.players.values()) { p.secondWallUsed = false; p.secondThreadUsed = false; p.groundRemembered = false; p.steadyUsed = false; }
  const spots = darkGround(room, b.roster.reduce((s, e) => s + e.count, 0));
  let i = 0;
  for (const entry of b.roster) {
    for (let n = 0; n < entry.count && i < spots.length; n++, i++) {
      const hex = spots[i];
      const face = room.enemies.find(e => e.name === entry.kind);
      const foe: EnemyUnit = {
        id: nextDarkId(),
        hex, kind: entry.kind, label: face?.label ?? entry.kind, art: face?.art ?? null,
        power: entry.power, hp: entry.hp, maxHp: entry.hp, pinnedUntil: 0, march: null,
        armor: (entry as { armor?: number }).armor ?? DARK_ARMOR[entry.kind] ?? 5, lvl: b.tier, speedGauge: 0,
      };
      room.dark.set(foe.id, foe);
    }
  }
  for (const hex of new Set([...room.dark.values()].map(e => e.hex))) springHex(room, hex, new Set());
  room.battle.active = true;
  room.roundNo = 0;
  b.begun = true;
  tell(room, `${b.kind === "siege" ? "The cursed bastion" : "The column"} is met — ${b.size} of the dark stand at the field's edge. ${b.ambush ? "Warned ahead, you strike with the ambush's edge (+1)." : ""} One pool binds you: ⚡${b.pool}.`);
  startBattleTimer(room);
}

/** A bastion battle WON (the Columns, 2026-10-17): the victory
 *  is reported to the land — the column falls and its break
 *  begins (with the reckoning paid to the standing Awoken), a
 *  besieged seed is LIBERATED, and guests carry home nothing
 *  but energy, as ruled. */
async function resolveBastionVictory(room: Room): Promise<void> {
  const b = room.bastion;
  if (!b || b.resolved) return;
  b.resolved = true;
  const ctx = { tender: { id: b.hostTenderId, tenderName: b.hostName } };
  const survivorPairs = [...room.field.values()].flatMap(u => {
    const seat = seatByKey(room, u.ownerKey);
    const id = Number((u.card as any).awokenId);
    return seat?.expKey && id > 0 ? [{ awakenedId: id, ownerKey: seat.expKey }] : [];
  });
  try {
    if (b.columnId) {
      await handlers.defeatIncursion({ columnId: b.columnId, survivorPairs }, ctx as any);
    }
    if (b.seedId) {
      const seed = sqlite.prepare("SELECT * FROM star_seeds WHERE id = ?").get(b.seedId) as any;
      if (seed && seed.state === "corrupted") {
        sqlite.prepare("UPDATE star_seeds SET state = 'fallen' WHERE id = ?").run(b.seedId);
        sqlite.prepare("UPDATE territory_tiles SET cursed = 0, element = 'neutral' WHERE id = ?").run(seed.tile_id);
        sqlite.prepare("UPDATE incursion_columns SET state = 'defeated', resolved_at = ? WHERE owner_key = ? AND target_tile_id = ? AND state = 'arrived'")
          .run(Date.now(), b.hostKey, seed.tile_id);
        tell(room, "The cursed bastion FALLS — the seed is free, and its hex is light again.");
      }
    }
    // Guests: nothing but energy, carried home.
    for (const p of room.players.values()) {
      if (p.watcher || !p.expKey || p.expKey === b.hostKey) continue;
      try {
        const cur = sqlite.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(p.expKey) as any;
        const max = await calculateMaxEnergy(p.expKey);
        const nowE = Number(cur?.energy ?? 10);
        sqlite.prepare(`INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(owner_key) DO UPDATE SET energy = excluded.energy, updated_at = excluded.updated_at`)
          .run(p.expKey, Math.min(max, nowE + Math.max(3, b.size)), Date.now());
      } catch { /* the road home is rough; the tale stands */ }
    }
    sqlite.prepare("UPDATE bastion_calls SET state = 'won' WHERE id = ?").run(b.callId);
    tell(room, "The call is answered and the day is won — the land reckons it so.");
  } catch { /* the report rides the next telling */ }
}

/** A bastion battle LOST: reported to the land — a held seed's
 *  hold breaks (its bastion falls, the seed corrupts); a siege
 *  simply fails, and the cursed bastion stands. */
async function resolveBastionDefeat(room: Room): Promise<void> {
  const b = room.bastion;
  if (!b || b.resolved) return;
  b.resolved = true;
  const ctx = { tender: { id: b.hostTenderId, tenderName: b.hostName } };
  try {
    if (b.columnId) await handlers.failIncursion({ columnId: b.columnId }, ctx as any).catch(() => {});
    sqlite.prepare("UPDATE bastion_calls SET state = 'lost' WHERE id = ?").run(b.callId);
    tell(room, "The call ends in the dark's keeping — the land reckons that too.");
  } catch { /* as above */ }
}

/** The clock's start: a battle runs the sim every
 *  quarter-second until it ends (endBattle clears it). */
function startBattleTimer(room: Room): void {
  if (room.battle.timer) return;
  room.battle.lastTick = Date.now();
  room.battle.beatAcc = 0;
  room.battle.timer = setInterval(() => { void runRound(room); }, 250);
}

function endBattle(room: Room): void {
  room.battle.active = false;
  if (room.battle.timer) { clearInterval(room.battle.timer); room.battle.timer = null; }
}

/** THE REFEREE, ON THE CLOCK (Nigel, 2026-10-18: "instead of
 *  rounds we need distance traveled over time"). The sim ticks
 *  every quarter-second: movement is distance over time along
 *  roads — the light's marches, the dark's advance — strikes
 *  land on cadences, and the curse burns and the light grinds
 *  as rates. The slow bookkeeping (the Heart's breath, the
 *  written light's tending, the binding echoes) still keeps
 *  the old 2.8-second beat, accumulated from the same clock. */
async function runRound(room: Room): Promise<void> {
  if (!room.battle.active || room.battle.ticking) return;
  room.battle.ticking = true;
  try {
    const now = Date.now();
    const dtMs = Math.min(1000, Math.max(0, now - (room.battle.lastTick ?? now)));
    room.battle.lastTick = now;
    const dtSec = dtMs / 1000;
    room.battle.beatAcc = (room.battle.beatAcc ?? 0) + dtSec;
    const beatDue = room.battle.beatAcc >= BEAT_MS / 1000;
    if (beatDue) room.battle.beatAcc = 0;
    // Shots age off the ledger; clients fly what is fresh.
    room.strikes = room.strikes.filter(s => now - (s.at ?? 0) < 1200);
    const witness = (from: string, to: string, element: string, side: "light" | "dark", hit: boolean, killed: boolean) => {
      if (room.strikes.length < 40) room.strikes.push({ id: (room.strikeSeq = (room.strikeSeq ?? 0) + 1), at: now, from, to, element, side, hit, killed });
    };
    if (beatDue) {
      await refreshGrimoire().catch(() => {});
      room.roundNo++;
    // The Returning Breath and Blood (the Heart's spine,
    // 2026-10-18): at the round's opening, a standing holder
    // breathes — +1⚡ on the same purse the felling-harvest
    // fills — and the wounded mend 1 HP of their own body.
    for (const p of room.players.values()) {
      if (p.watcher || p.fallen || !p.expKey) continue;
      const heart = heartEffects(p.expKey);
      if (heart.breathAmount > 0) p.energy = Math.min(p.maxEnergy + 10, p.energy + heart.breathAmount);
      if (heart.bloodAmount > 0 && p.tenderHp > 0 && p.tenderHp < p.maxTenderHp) {
        const mend = Math.min(heart.bloodAmount, p.maxTenderHp - p.tenderHp);
        p.tenderHp += mend;
        tell(room, `The Returning Blood knits ${p.name} — ${mend} HP returns with the round.`);
      }
    }
    // (the witness is defined above the beat now — the strikes
    // it records fly on the clock, not on the beat.)
    // The written light tends itself: living walls regrow,
    // and a standing Engine sings energy to its Tender.
    // Lore Binder's echoes land a round after the spring.
    if (room.pendingEchoes?.length) {
      const due = room.pendingEchoes.filter(e2 => e2.due <= room.roundNo);
      room.pendingEchoes = room.pendingEchoes.filter(e2 => e2.due > room.roundNo);
      for (const e2 of due) {
        const d = darkAt(room, e2.hex);
        if (d) { d.pinnedUntil = Math.max(d.pinnedUntil ?? 0, now + e2.pin * BEAT_MS); tell(room, `The binding echoes — the dark on the written ground is held again, fainter and faithful.`); }
      }
    }
    // Lore Warden's ledger: an edge whose ward stood at the
    // last tending and stands no longer is WRITTEN.
    {
      const cur = new Set(room.workings.filter(w => w.kind === "ward").map(w => edgeKeyOf(w.hexA ?? "", w.hexB ?? "")));
      if (room.prevWardEdges) {
        room.writtenEdges ??= new Set();
        for (const e2 of room.prevWardEdges) if (!cur.has(e2)) room.writtenEdges.add(e2);
      }
      room.prevWardEdges = cur;
    }
    const effBySeat = new Map<string, ReturnType<typeof workingEffects>>();
    const effOf = (key: string) => {
      const seat = seatByKey(room, key);
      const ek = seat?.expKey ?? "";
      if (!effBySeat.has(ek)) effBySeat.set(ek, workingEffects(ek));
      return effBySeat.get(ek)!;
    };
    for (const w of room.workings) {
      if (w.engine === "trees" && w.hp > 0 && w.hp < (w.maxHp || (w.nums.hp ?? 8))) w.hp = Math.min(w.maxHp || (w.nums.hp ?? 8), w.hp + (w.nums.regrow ?? 2) + effOf(w.ownerKey).treesRegrow);
      if (w.engine === "engine") {
        const owner = seatByKey(room, w.ownerKey);
        if (owner && !owner.fallen) owner.energy = Math.min(owner.maxEnergy + 10, owner.energy + (w.nums.energyPerRound ?? 1));
      }
      // The Mending Wall (tranche one): a Binder's ward is a
      // hospital — each round it mends the most-hurt ally
      // standing on its edge's hexes by 1.
      if (w.kind === "ward" && effOf(w.ownerKey).mendingWall) {
        const behind = [...room.field.values()].filter(u => (u.hex === w.hexA || u.hex === w.hexB) && u.hp < u.maxHp);
        if (behind.length) {
          behind.sort((x, z) => (x.hp / x.maxHp) - (z.hp / z.maxHp));
          behind[0].hp = Math.min(behind[0].maxHp, behind[0].hp + 1);
        }
      }
    }
    } // — the beat's bookkeeping ends; the clock's work follows.
    // The standing strike first — under FATE (Nigel,
    // 2026-10-17): a d20 against the dark thing's armor;
    // the element and the level lend the bonus; landed harm
    // is the parts' dice, summed, then mitigated by Diablo's
    // equation. Swifter elements strike again as their
    // speed gauge fills: the gauge banks (speed − 1) a
    // round, and every 5 banked buys another strike.
    const strikeOnce = async (unit: FieldUnit): Promise<void> => {
      let target: EnemyUnit | null = null;
      let best = Infinity;
      for (const e of room.dark.values()) {
        // REACH (the Instance Map): the light strikes two
        // tiles out — beyond that, the dark is a shape on the
        // road, not yet a foe in hand.
        if (hexDist(unit.hex, e.hex) > 2) continue;
        const dd = hexDist(unit.hex, e.hex) - e.hp * 0.01;
        if (dd < best) { best = dd; target = e; }
      }
      if (!target) return;
      // The Banner's Reach (tranche one): a holder's Standard
      // blesses the hexes NEIGHBOURING its two as well.
      const myEff = workingEffects(seatByKey(room, unit.ownerKey)?.expKey);
      const stdWard = room.workings.find(w => w.engine === "standard" && w.ownerKey === unit.ownerKey
        && (w.hexA === unit.hex || w.hexB === unit.hex
          || (myEff.bannerReach && ((w.hexA && neighborsOf(w.hexA).includes(unit.hex)) || (w.hexB && neighborsOf(w.hexB).includes(unit.hex))))));
      // The Bright Pillar + Falling Light (tranche one): the
      // Beacon's reach widens a ring per gift, and a Pillar's
      // light serves the WHOLE party, not its Tender alone.
      const bcnWard = room.workings.find(w => {
        if (w.engine !== "beacon") return false;
        const oEff = workingEffects(seatByKey(room, w.ownerKey)?.expKey);
        const rings = (oEff.brightPillar ? 1 : 0) + (oEff.fallingLight ? 1 : 0);
        if (!beaconReach(w, rings).has(target.hex)) return false;
        return w.ownerKey === unit.ownerKey || oEff.brightPillar;
      });
      const roll = dN(20);
      const bonus = (ELEMENT_HIT_BONUS[unit.card.element] ?? 0)
        + fateLevelBonus(unit.card.level ?? 1)
        + (room.bastion?.ambush && room.bastion.begun ? 1 : 0); // the ambush lends its edge to the roll
      const hit = roll === 20 || (roll !== 1 && roll + bonus >= target.armor);
      if (!hit) {
        witness(unit.hex, target.hex, unit.card.element ?? "unaligned", "light", false, false);
        if (roll === 1) tell(room, `${unit.card.name}'s strike goes wide — a cast of one, and the dark keeps its ground.`);
        return;
      }
      let raw = fatePartsDamage(unit.card, roll === 20)
        + (stdWard ? (stdWard.nums.strikeBonus ?? 1) : 0)
        + (bcnWard ? (bcnWard.nums.darkBonus ?? 1) : 0);
      const dmg = fateMitigate(raw, target.armor, unit.card.level ?? 1);
      target.hp -= dmg;
      witness(unit.hex, target.hex, unit.card.element ?? "unaligned", "light", true, target.hp <= 0);
      if (roll === 20) tell(room, `${unit.card.name} rolls a natural twenty — the blow lands true and terrible (${dmg})!`);
      if (target.hp <= 0) {
        room.dark.delete(target.id);
        tell(room, `${unit.card.name} unravels the ${target.label}!`);
        const freedTile = room.map.get(target.hex);
        if (freedTile) purifyTile(room, freedTile, dominantElement(partsOf(unit.card) as { element?: string | null }[]));
        const owner = seatByKey(room, unit.ownerKey);
        if (room.campaign && !room.campaign.over) {
          campaignFell(room, target, owner ?? null);
        } else if (owner && !owner.fallen) {
          owner.energy = Math.min(owner.maxEnergy + 10, owner.energy + 3); // the harvest
          // The Harvest (the Heart, 2026-10-18): when YOUR
          // Awoken fell the dark, the stars' fellHarvest
          // clauses pay their ⚡ on top of the base three.
          const hv = owner.expKey ? heartEffects(owner.expKey).harvestAmount : 0;
          if (hv !== 0) {
            owner.energy = Math.max(0, Math.min(owner.maxEnergy + 10, owner.energy + hv));
          }
          await payBattleExp(room, owner, 2, "The dark pays for its felling.");
        }
      }
    };
    for (const unit of [...room.field.values()]) {
      if (!unitStanding(room, unit)) continue;
      if (room.dark.size === 0) break;
      if (isMarching(unit, now)) continue; // on the road: no strikes
      if ((unit.pinnedUntil ?? 0) > now) continue; // pinned: the moments pass
      if (now < (unit.nextStrike ?? 0)) continue; // the cadence has not come round
      if (![...room.dark.values()].some(e => hexDist(unit.hex, e.hex) <= 2)) continue;
      unit.nextStrike = now + lightIntervalMs(unit);
      await strikeOnce(unit);
    }
    // THE DARK ADVANCES (the Instance Map, on the clock): a
    // dark thing with no foe in claw's reach travels its road
    // toward the seed — or toward the nearest standing light,
    // when the light is nearer — at its kind's gait. A patrol
    // posted on its road stops it: within a tile, it halts and
    // fights. The Hollow only drifts and drains, at a rate.
    const beginAdvance = (enemy: EnemyUnit): void => {
      if (enemy.march) return;
      const standingNow = standingUnits(room);
      let quarry = SEED_TILE;
      let bestD = hexDist(enemy.hex, SEED_TILE);
      for (const u of standingNow) {
        const d = hexDist(enemy.hex, u.hex);
        if (d < bestD) { bestD = d; quarry = u.hex; }
      }
      if (quarry === enemy.hex) return;
      // AT THE GATE: a dark thing already standing on the
      // seed's own ring with the seed as its quarry HAS
      // arrived — it does not march the last step onto the
      // seed's tile (the travel law would halt it at the gate
      // again, forever). It claws the seed from here; the
      // assault reckons what that costs.
      if (quarry === SEED_TILE && ringOf(enemy.hex) <= 1) return;
      const road = findAnyRoad(enemy.hex, quarry);
      if (!road || road.length < 2) return;
      const gait = DARK_GAIT[enemy.kind] ?? 2.8;
      enemy.march = { road, since: now, endsAt: now + Math.round((road.length - 1) * gait * 1000) };
    };
    for (const enemy of [...room.dark.values()]) {
      if (enemy.kind === "hollow") {
        // The Hollow drains the air itself, at a rate — the
        // bastion's pool, or every standing Tender's purse.
        const drain = 2 * dtSec / (BEAT_MS / 1000);
        if (room.bastion?.begun && !room.bastion.resolved) {
          room.bastion.pool = Math.max(0, room.bastion.pool - drain);
        } else {
          for (const p of room.players.values()) {
            if (!p.watcher && !p.fallen) p.energy = Math.max(0, p.energy - drain);
          }
        }
      }
      if ((enemy.pinnedUntil ?? 0) > now) continue;
      // Travel: settle where the road has carried it.
      if (enemy.march) {
        const here = roadTileAt(enemy.march, now);
        if (here !== enemy.hex) { enemy.hex = here; springHex(room, here, new Set()); }
        const arrived = now >= enemy.march.endsAt;
        const blocked = standingUnits(room).some(u => hexDist(u.hex, here) <= 1);
        // The gate halts only a march whose road ENDS at the
        // seed. A hunt for a light beyond the ring passes
        // through the ring — transit is lawful — and the old
        // blanket halt froze those hunters on the seed's door-
        // step, where the seed became their quarry by default
        // and nothing could ever move again (probe40's stall).
        const dest = enemy.march.road[enemy.march.road.length - 1];
        const atGate = dest === SEED_TILE && ringOf(here) <= 1 && !blocked;
        if (arrived || blocked || atGate) {
          enemy.hex = arrived ? enemy.march.road[enemy.march.road.length - 1] : here;
          enemy.march = null;
          springHex(room, enemy.hex, new Set());
        } else {
          continue; // still on the road: it does not strike
        }
      }
      const standing = standingUnits(room);
      const inReach = standing.filter(u => hexDist(enemy.hex, u.hex) <= 1);
      if (enemy.kind === "hollow") {
        // It never claws — but it COMES: a Hollow left standing
        // on the rim would haunt the air forever, beyond every
        // reach, and no battle against it could ever end. It
        // drifts its road until the gate or a standing light
        // stops it, and drains where it stands.
        if (!enemy.march && ringOf(enemy.hex) > 1) beginAdvance(enemy);
        continue;
      }
      if (inReach.length > 0) {
        if (now < (enemy.nextStrike ?? 0)) continue;
        enemy.nextStrike = now + darkIntervalMs(enemy);
        // The dark answers — under FATE: a d20 against the
        // victim's Armor Class (its toughness). The dark's
        // element is the curse's own — no element bonus; its
        // level steps lend what they lend. A landed blow's
        // harm is its power in d6, summed, mitigated, and
        // the SHIELD burns before the body. The written
        // light answers a landed blow as it always has.
        const blowOnce = async (): Promise<void> => {
          const standingNow = standingUnits(room).filter(u => hexDist(enemy.hex, u.hex) <= 1);
          if (!standingNow.length) return;
          let victim: FieldUnit;
          if (enemy.kind === "unraveler") victim = standingNow.reduce((a, b) => (b.card.power > a.card.power ? b : a));
          else if (enemy.kind === "fray") victim = standingNow.reduce((a, b) => (b.hp < a.hp ? b : a));
          else victim = standingNow[Math.floor(Math.random() * standingNow.length)];
          enemy.struck = true;
          const roll = dN(20);
          const bonus = fateLevelBonus(enemy.lvl);
          const ac = victim.card.toughness + acBonusOf(victim);
          const hit = roll === 20 || (roll !== 1 && roll + bonus >= ac);
          if (!hit) {
            witness(enemy.hex, victim.hex, "dark", "dark", false, false);
            if (roll === 1) tell(room, `The ${enemy.label}'s blow goes wide — a cast of one.`);
            return;
          }
          // Brand Walker (tranche one): dark standing beside
          // a holder's FIRE working strikes at −1 power —
          // lit, and wary.
          const wary = room.workings.some(w => w.hue === "fire"
            && workingEffects(seatByKey(room, w.ownerKey)?.expKey).brandWalker
            && workingBeside(w, enemy.hex));
          let dmg = fateMitigate(fateDarkDamage(wary ? { ...enemy, power: Math.max(0, enemy.power - 1) } : enemy, roll === 20), victim.card.toughness, enemy.lvl);
          const edgeWards = room.workings.filter(w => w.kind === "ward" && w.ownerKey === victim.ownerKey &&
            ((w.hexA === enemy.hex && w.hexB === victim.hex) || (w.hexA === victim.hex && w.hexB === enemy.hex)));
          const seal = edgeWards.find(w => w.engine === "seal");
          if (seal && dmg > 0) {
            dmg = 0;
            // THE WALL THAT ANSWERS (tranche one): a keystone
            // holder's Seal answers with the STRIKER'S OWN
            // power; otherwise the snapshotted riposte (the
            // Answer already baked in at the cast). Millwright
            // deepens the brightening wherever it applies.
            const sealEff = workingEffects(seatByKey(room, seal.ownerKey)?.expKey);
            const brightTerm = engineBright(room, victim.ownerKey) ? (seal.nums.brightBonus ?? 1) + (sealEff.millwright ? 1 : 0) : 0;
            enemy.hp -= (sealEff.keystoneRiposte ? enemy.power : (seal.nums.riposte ?? 3)) + brightTerm;
            seal.stops++;
            // The Remembering Ray keeps this tale too.
            const sealSeat = seatByKey(room, seal.ownerKey);
            if (sealEff.rememberingRay && sealSeat?.expKey) void awardTenderExp(sealSeat.expKey, 1).catch(() => {});
            // War Warden (tranche one): the stopped strike
            // splashes — the striker's hex-neighbours are
            // wounded for 1 by the ward's answering light.
            if (sealEff.warWarden) {
              for (const nHex of neighborsOf(enemy.hex)) {
                const nDark = darkAt(room, nHex);
                if (nDark && nDark !== enemy) {
                  nDark.hp -= 1;
                  if (nDark.hp <= 0) fellDark(room, nDark, sealSeat ?? null, seal.hue && seal.hue !== "unaligned" ? seal.hue : "neutral");
                }
              }
            }
            witness(victim.hex, enemy.hex, seal.hue && seal.hue !== "unaligned" ? seal.hue : "unaligned", "light", true, enemy.hp <= 0);
            // The Seal's health rating (Nigel, 2026-10-17):
            // every blow it stops costs it that blow's power.
            seal.hp -= enemy.power;
            tell(room, `${seal.name} stops the ${enemy.label}'s strike cold — and answers it.`);
            if (enemy.hp <= 0) {
              room.dark.delete(enemy.id);
              tell(room, `The ${enemy.label} unravels on the Seal's light!`);
              const freedTile = room.map.get(enemy.hex);
              if (freedTile) purifyTile(room, freedTile, seal.hue && seal.hue !== "unaligned" ? seal.hue : "neutral");
              const owner = seatByKey(room, seal.ownerKey);
              if (room.campaign && !room.campaign.over) {
                campaignFell(room, enemy, owner ?? null);
              } else if (owner && !owner.fallen) {
                owner.energy = Math.min(owner.maxEnergy + 10, owner.energy + 3);
                await payBattleExp(room, owner, 2, "The dark pays for its felling.");
              }
            }
            if (seal.stops >= (seal.nums.stops ?? 3)) {
              room.workings = room.workings.filter(w => w !== seal);
              tell(room, `${seal.name} has stopped its third strike; its light goes out, spent and honored.`);
            } else if (seal.hp <= 0) {
              room.workings = room.workings.filter(w => w !== seal);
              tell(room, `${seal.name} is worn through by the blows it stopped; its light goes out, spent and honored.`);
            }
          }
          const trees = edgeWards.find(w => w.engine === "trees");
          if (dmg > 0 && trees) {
            trees.hp -= dmg;
            dmg = 0;
            tell(room, `${trees.name} take the blow meant for ${victim.card.name}.`);
            if (trees.hp <= 0) {
              room.workings = room.workings.filter(w => w !== trees);
              tell(room, `${trees.name} are broken — for this battle. The seed remembers them.`);
            }
          }
          let felled = false;
          if (dmg > 0) {
            if (enemy.kind === "tangle") victim.pinnedUntil = Math.max(victim.pinnedUntil ?? 0, now + BEAT_MS);
            let wound = dmg;
            if (victim.shield > 0) {
              const absorbed = Math.min(victim.shield, wound);
              victim.shield -= absorbed;
              wound -= absorbed;
            }
            victim.hp -= wound;
            felled = victim.hp <= 0;
          }
          witness(enemy.hex, victim.hex, "dark", "dark", true, felled);
          if (roll === 20) tell(room, `The ${enemy.label} rolls a natural twenty — the blow lands true and terrible!`);
          if (felled) {
            noteDissipation(room, victim);
            removeUnit(room, victim);
            const owner = seatByKey(room, victim.ownerKey);
            if (owner) owner.hand = [...owner.hand, victim.card];
            tell(room, `The ${enemy.label} unravels ${victim.card.name} — it dissipates to its Tender's roster.`);
          }
        };
        await blowOnce();
      } else if (standing.length === 0) {
        // Nothing stands: the shield law leaves the Tenders
        // bare — but the blow lands only at the gate. Out on
        // the road, the dark is still coming.
        if (ringOf(enemy.hex) > 1) { beginAdvance(enemy); continue; }
        if (now < (enemy.nextStrike ?? 0)) continue;
        enemy.nextStrike = now + darkIntervalMs(enemy);
        const bare = [...room.players.values()].filter(p => !p.watcher && !p.storytender && !p.fallen);
        if (bare.length === 0) continue;
        const tender = bare[Math.floor(Math.random() * bare.length)];
        // The Thickened Skin (the Heart's spine, 2026-10-18):
        // strikes against the Tender are blunted by the
        // stars' tenderSkin clauses, never below 1.
        const skinAmt = tender.expKey ? heartEffects(tender.expKey).skinAmount : 0;
        const blow = Math.max(1, enemy.power - skinAmt);
        tender.tenderHp -= blow;
        if (tender.tenderHp <= 0) {
          tender.tenderHp = 0;
          tender.fallen = true;
          tell(room, `${tender.name} has fallen. The Bastion mourns — and fights on.`);
        }
      } else {
        // Light stands, but beyond claw's reach: the dark comes on.
        beginAdvance(enemy);
      }
    }
    // THE CURSE BURNS, THE LIGHT GRINDS (the Instance Map;
    // Nigel, 2026-10-18): every Awokin standing on cursed
    // ground pays the ring's burn — and its presence wears
    // the tile's corruption down by its power, unless the
    // dark itself holds that tile. A tile ground to nothing
    // turns, in the element of the strongest light upon it.
    {
      const grind = new Map<string, { dmg: number; best: FieldUnit | null }>();
      const rate = dtSec / (BEAT_MS / 1000); // the old round's share of this tick
      for (const u of standingUnits(room)) {
        const tile = room.map.get(u.hex);
        if (!tile || !tile.cursed) continue;
        hurtByCurse(room, u, Math.max(1, ringOf(tile.id) - 1) * rate);
        if (!unitStanding(room, u)) continue; // the burn unbound it
        if (darkOn(room, tile.id)) continue; // the dark holds this ground
        const g = grind.get(tile.id) ?? { dmg: 0, best: null };
        g.dmg += u.card.power * rate;
        if (!g.best || u.card.power > g.best.card.power) g.best = u;
        grind.set(tile.id, g);
      }
      for (const [tileId, g] of grind) {
        const tile = room.map.get(tileId);
        if (!tile || !tile.cursed || !g.best) continue;
        tile.curseHp -= g.dmg;
        if (tile.curseHp <= 0) {
          purifyTile(room, tile, dominantElement(partsOf(g.best.card) as { element?: string | null }[]));
        }
      }
    }
    // THE SEED ASSAULTED (campaign, TABLE-DESIGN §4.4, made
    // physical by the Instance Map): dark standing AT THE
    // GATE — the seed's own ring — EXPOSED, with no standing
    // light able to reach it (the light strikes two tiles
    // out), claws the star-seed: the bank bleeds at the sum
    // of the exposed crawlers' power, as a rate, until a
    // guard is marched to the gate, the crawlers are felled,
    // or the bank — the Bastion's body — is gone. Exposure is
    // reckoned crawler by crawler: a guard posted on the far
    // ring does not cover the opposite gate, and a siege
    // there is a patrol's errand. An earlier draft also
    // required that no cast be affordable — but a full hand
    // never held the dark off a heart it had already reached;
    // only light at the gate does. That clause froze doom
    // itself: harvest kept the bank fat, a cast stayed
    // "affordable" forever, and the Bastion could neither
    // fall nor be saved (probe40's stall). Casting is the
    // ANSWER to the assault, not a shield against it.
    if (room.campaign && !room.campaign.over && room.campaign.seeded && room.battle.active && room.dark.size > 0) {
      const c = room.campaign;
      const standing = standingUnits(room);
      const exposed = [...room.dark.values()].filter(e => !e.march && ringOf(e.hex) <= 1 && !standing.some(u => hexDist(u.hex, e.hex) <= 2));
      if (exposed.length) {
        const drain = exposed.reduce((s, e) => s + e.power, 0) * dtSec / (BEAT_MS / 1000);
        if (drain > 0) {
          c.bank = Math.max(0, c.bank - drain);
          if (now - (room.assaultToldAt ?? 0) > 5000 || c.bank <= 0) {
            room.assaultToldAt = now;
            tell(room, `No light guards the heart — the dark turns on the star-seed. The bank bleeds (⚡${Math.floor(c.bank)} remains). March a guard to the gate, cast something, anything, or lose the light.`);
          }
          if (c.bank <= 0) {
            settleShardsAndFade(room);
            endCampaign(room, "fallen");
          }
        }
      }
    }
    // Endings.
    const seatedAlive = [...room.players.values()].filter(p => !p.watcher && !p.storytender && !p.fallen);
    if (room.dark.size === 0 && room.battle.active) {
      settleShardsAndFade(room);
      endBattle(room);
      if (room.bastion?.begun && !room.bastion.resolved) {
        tell(room, "The dark is broken at the bastion — the field breathes again.");
        for (const p of seatedAlive) await payBattleExp(room, p, 5, "A bastion held together pays together.");
        await resolveBastionVictory(room);
      } else if (room.campaign) {
        tell(room, `The Unraveling is broken. The bank stands at ⚡${Math.floor(room.campaign.bank)} — the Storytender may deal again, call a rest, or turn the campaign home.`);
        room.battle.wave++;
      } else {
        tell(room, `Wave ${room.battle.wave} is broken. The field breathes again.`);
        for (const p of seatedAlive) {
          p.energy = Math.min(p.maxEnergy + 10, p.energy + 5);
          await payBattleExp(room, p, 5, "A wave broken together pays together.");
        }
        room.battle.wave++;
      }
    } else if (seatedAlive.length === 0 && room.battle.active) {
      settleShardsAndFade(room);
      if (room.campaign && !room.campaign.over && room.field.size === 0 && room.dark.size > 0) {
        // Every Tender down, the field empty, the dark
        // standing: nothing shields the seed. It falls.
        endCampaign(room, "fallen");
      } else if (room.bastion?.begun && !room.bastion.resolved) {
        endBattle(room);
        await resolveBastionDefeat(room);
      } else {
        endBattle(room);
        tell(room, room.campaign
          ? `The party is down. The Storytender may call a rest and raise them, or turn the campaign home.`
          : `The dark holds the field. Wave ${room.battle.wave} stands unbroken — re-seat, recast, and begin it again.`);
      }
      room.dark.clear();
    }
    sendState(room);
  } finally {
    room.battle.ticking = false;
  }
}

function handleConnection(ws: WebSocket): void {
  let room: Room | null = null;
  let player: Player | null = null;

  const fail = (message: string) => {
    try { ws.send(JSON.stringify({ type: "joinError", message })); } catch {}
    try { ws.close(); } catch {}
  };

  ws.on("message", async (raw) => {
    // The Grimoire is a living book: a tuning saved in the
    // workshop is in the referee's hands by the next message.
    await refreshGrimoire().catch(() => {});
    let msg: any;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (!msg || typeof msg.type !== "string") return;

    // ANSWER A CALL (Nigel, 2026-10-17): a seated player with
    // a key rises from this room and takes their seat in the
    // call's own room — their hand, their standing, and their
    // Awoken travel with them. The key is the invitation: any
    // open call's key seats whoever carries it.
    if (msg.type === "switchRoom") {
      if (!room || !player) return;
      const k = String(msg.callKey ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const call = sqlite.prepare("SELECT * FROM bastion_calls WHERE join_key = ? AND state = 'open'").get(k) as any;
      if (!call) { ws.send(JSON.stringify({ type: "error", message: "No open call answers to that key — it may have ended, or the key is mistyped." })); return; }
      const targetId = `call-${k.toLowerCase()}`;
      if (room.id === targetId) { ws.send(JSON.stringify({ type: "error", message: "You already sit at that call's table." })); return; }
      if (room.battle.active) { ws.send(JSON.stringify({ type: "error", message: "Not mid-battle — the dark does not wait for travellers." })); return; }
      const target = await getRoom(targetId);
      const seatedThere = [...target.players.values()].filter(p => !p.watcher && !p.storytender).length;
      if (!player.watcher && seatedThere >= MAX_SEATED) { ws.send(JSON.stringify({ type: "error", message: `That call's table is full — ${MAX_SEATED} seats stand there already. You may still watch.` })); return; }
      const old = room;
      old.players.delete(ws);
      tell(old, `${player.name} rises to answer a call elsewhere.`);
      sendState(old);
      room = target;
      room.sky = await currentSky();
      room.players.set(ws, player);
      assignLanding(room, player);
      tell(room, `${player.name} answers the ${String(call.kind).toUpperCase()} call — key ${k} — and takes a seat, Awokin in hand.`);
      sendState(room);
      return;
    }

    if (msg.type === "join") {
      if (room) return; // one seat per socket
      // JOIN BY KEY (Nigel, 2026-10-17): a call key names its
      // own room — whoever enters it sits at that call's table,
      // wherever the Table was opened from.
      let roomId = String(msg.room || "the-table").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "the-table";
      if (typeof msg.callKey === "string" && msg.callKey.trim()) {
        const k = msg.callKey.toUpperCase().replace(/[^A-Z0-9]/g, "");
        const call = sqlite.prepare("SELECT id FROM bastion_calls WHERE join_key = ? AND state = 'open'").get(k) as any;
        if (!call) { fail("No open call answers to that key — it may have ended, or the key is mistyped."); return; }
        roomId = `call-${k.toLowerCase()}`;
      }
      let key = "";
      let name = "";
      let watcher = false;
      if (msg.watch === true) {
        watcher = true;
        key = `watch:${randomUUID()}`;
        name = String(msg.name || "A Watcher").slice(0, 40) || "A Watcher";
      } else if (typeof msg.authToken === "string" && authTokens.has(msg.authToken)) {
        const user = authTokens.get(msg.authToken)!;
        key = `discord:${user.id}`;
        name = user.name.slice(0, 60);
      } else if (!TABLE_CONFIGURED && typeof msg.devName === "string" && msg.devName.trim()) {
        // Doorway-test seats exist only while Discord itself is not
        // configured on the server. Once it is, a name at the Table is
        // a Discord name, proven by sign-in — never merely claimed.
        name = msg.devName.trim().slice(0, 40);
        key = `dev:${name.toLowerCase().replace(/\s+/g, "-")}`;
      } else {
        fail(TABLE_CONFIGURED
          ? "That seat needs a Discord sign-in. Reopen the Table from the voice channel, or watch instead."
          : "Give a name to take your seat.");
        return;
      }
      room = await getRoom(roomId);
      room.sky = await currentSky();
      // THE STORYTENDER'S SEAT (campaign rooms only): one seat,
      // no hand, never counted among the Tenders.
      const wantsStorytender = msg.storytender === true && room.mode === "campaign" && !watcher;
      const storytenderTaken = [...room.players.values()].some(p => p.storytender);
      const isStorytender = wantsStorytender && !storytenderTaken;
      const seatedCount = [...room.players.values()].filter(p => !p.watcher && !p.storytender).length;
      if (!watcher && !isStorytender && seatedCount >= MAX_SEATED) watcher = true; // a full table deals no ninth hand; watchers are welcome
      const profile = watcher ? { notes: "", inventory: [] as string[] } : await loadProfile(key, name);
      // The full roster stands at the Table (Nigel, 2026-10-16):
      // a bound seat brings its Tender's whole collection, and
      // its energy is that roster's own calculation by the game's
      // one law — all of it. An unbound seat brings the whole
      // stand-in pool and a stand-in's portion of energy.
      let hand: TableCard[] = [];
      let bound: string | null = null;
      let energy = 12;
      let maxEnergy = 12;
      let tenderLevel = 1;
      let healTier = healTierForLevel(1);
      let healAmount = healAmountForLevel(1);
      let wardRuneUnlocked = false;
      let maxTenderHp = tenderMaxHpForLevel(1);
      let expKey: string | null = null;
      if (!watcher && key.startsWith("discord:")) {
        const tenderId = await bindingFor(key.slice("discord:".length));
        if (tenderId !== null) {
          const cards = await deckForTender(tenderId).catch(() => [] as TableCard[]);
          if (cards.length) {
            hand = cards;
            bound = await tenderDisplayName(tenderId);
            maxEnergy = await calculateMaxEnergy(tenderOwnerKey(tenderId)).catch(() => 12);
            energy = maxEnergy;
            expKey = tenderOwnerKey(tenderId);
            const progress = await getTenderProgress(tenderOwnerKey(tenderId)).catch(() => null);
            if (progress) {
              tenderLevel = progress.level;
              healTier = progress.healTier;
              healAmount = progress.healAmount;
              wardRuneUnlocked = progress.wardRuneUnlocked;
              maxTenderHp = progress.maxTenderHp;
            }
            // Deep Breath (the Heart, 2026-10-18): maximum
            // energy +3 at the Table and on the Bastion — its
            // copy names those seats, so the bonus lands here
            // and not in the map's energy law.
            const breathBonus = heartEffects(tenderOwnerKey(tenderId)).tableEnergy;
            if (breathBonus) { maxEnergy += breathBonus; energy += breathBonus; }
          }
        }
      }
      if (!watcher && !bound && !isStorytender) {
        hand = TEST_POOL.map(c => ({ ...c, id: randomUUID(), parts: [
          { element: c.element, power: Math.ceil(c.power / 2) },
          { element: c.element, power: Math.floor(c.power / 2) },
          { element: c.element, power: 0 },
        ] }));
        energy = 12;
        maxEnergy = 12;
      }
      player = { key, name, watcher, storytender: isStorytender, hand: isStorytender ? [] : hand, notes: profile.notes, inventory: profile.inventory, bound, energy, maxEnergy, tenderLevel, healTier, healAmount, wardRuneUnlocked, tenderHp: maxTenderHp, maxTenderHp, fallen: false, expKey, pools: expKey ? await attunementPools(expKey).catch(() => null) : null };
      room.players.set(ws, player);
      assignLanding(room, player);
      if (isStorytender && room.campaign) {
        room.campaign.storytenderName = name;
        tell(room, `${name} takes the Storytender's seat — the dealing, the scene, and the sky are hers to hold.`);
        if (wantsStorytender && storytenderTaken) { /* unreachable: isStorytender covers it */ }
      } else if (wantsStorytender && storytenderTaken) {
        ws.send(JSON.stringify({ type: "error", message: "The Storytender's seat is already held — you sit as a Tender." }));
      }
      if (!watcher && !isStorytender && room.campaign?.seeded && !room.campaign.over && player.energy > 0) {
        // A late stake joins the pot entire (the Risk of
        // Confluence runs both ways: arrive invested).
        room.campaign.bank += player.energy;
        tell(room, `${name}'s stake of ⚡${player.energy} joins the bank (⚡${room.campaign.bank}).`);
        player.energy = 0;
      }
      if (!watcher && !isStorytender) {
        tell(room, `${name} takes a seat at the Table.`);
      }
      sendState(room);
      return;
    }

    if (!room || !player) return;

    if (msg.type === "roll") {
      if (player.watcher) {
        ws.send(JSON.stringify({ type: "error", message: "Watchers hold no dice — bind in the game to be dealt a hand." }));
        return;
      }
      const sides = [4, 6, 8, 10, 12, 20, 100].includes(msg.sides) ? msg.sides : 20;
      const result = 1 + Math.floor(Math.random() * sides);
      tell(room, `${player.name} rolled d${sides} → ${result}.`);
      sendState(room);
      return;
    }

    // CASTING (P1, 2026-10-16): a card leaves the roster and
    // stands on a ring hex, at a cost of its power in energy.
    // The center hex is the star-seed and is never stood upon.
    if (msg.type === "summon") {
      if (player.fallen) {
        ws.send(JSON.stringify({ type: "error", message: "You have fallen — you will rise between waves." }));
        return;
      }
      if (player.watcher) {
        ws.send(JSON.stringify({ type: "error", message: "Watchers hold no hand to cast from." }));
        return;
      }
      if (player.storytender) {
        ws.send(JSON.stringify({ type: "error", message: "The Storytender holds no hand — she deals the dark, not the light." }));
        return;
      }
      const hex = String(msg.hex ?? "");
      const cardId = String(msg.cardId ?? "");
      const card = player.hand.find(c => c.id === cardId);
      const tile = room.map.get(hex);
      if (!tile) {
        ws.send(JSON.stringify({ type: "error", message: "That is no tile of this land." }));
        return;
      }
      if (hex === SEED_TILE) {
        ws.send(JSON.stringify({ type: "error", message: "An Awokin stands on the land — the center tile is the star-seed's." }));
        return;
      }
      // SUMMON ONTO PURIFIED GROUND ONLY (Nigel, 2026-10-18 —
      // the land's own deploy law, carried to the Table): the
      // light takes the field where the light already holds.
      if (tile.cursed) {
        ws.send(JSON.stringify({ type: "error", message: "That ground is still cursed — your light takes the field on purified land. Fell the dark that holds it, or grind it down by standing patrols, and it will turn." }));
        return;
      }
      if (unitsAt(room, hex).length >= STACK_CAP) {
        ws.send(JSON.stringify({ type: "error", message: `That tile stands full — ${STACK_CAP} of the light to a tile, by the March law.` }));
        return;
      }
      if (!card) {
        ws.send(JSON.stringify({ type: "error", message: "That Awokin is not in your roster." }));
        return;
      }
      // The Travelling Company (ruled 2026-10-18): the band
      // standing on the field is capped by the tender's level
      // (3 at Lv 1, 4 at Lv 3, the true 5 at Lv 6), widened by
      // the Muster roads (companyCapFor).
      const bandCap = companyCapFor(player.expKey, player.tenderLevel);
      const myKey = player.key;
      const bandStanding = [...room.field.values()].filter(u => u.ownerKey === myKey).length;
      if (bandStanding >= bandCap) {
        ws.send(JSON.stringify({ type: "error", message: `Your band stands full — ${bandCap} strong. Levels widen it (three at Lv 1, four at Lv 3, the true five at Lv 6), and the Muster roads widen it further: the Escort, the Pennant, the Retinue, the Whole Muster.` }));
        return;
      }
      const cost = castCost(room, player, card);
      if (room.bastion?.begun && !room.bastion.resolved) {
        // One pool binds the muster (Nigel, 2026-10-17): joining
        // Tenders' energy joins the pool, scaled by level.
        if (room.bastion.pool < cost) {
          ws.send(JSON.stringify({ type: "error", message: `${card.name} costs ⚡${cost} — the pool holds ⚡${room.bastion.pool}.` }));
          return;
        }
        room.bastion.pool -= cost;
      } else if (!chargePurse(room, player, cost)) {
        const n = recastCount(room, player.key, card.id);
        ws.send(JSON.stringify({ type: "error", message: room.campaign && !room.campaign.over && room.campaign.seeded
          ? `${card.name} costs ⚡${cost}${n > 0 ? ` (recast ×${2 ** Math.min(n, 5)})` : ""} — the bank holds ⚡${Math.floor(room.campaign.bank)}.`
          : `${card.name} costs ⚡${cost} — you hold ⚡${player.energy}.` }));
        return;
      }
      player.hand = player.hand.filter(c => c.id !== cardId);
      const shield = card.toughness * dN(FATE_DIE[card.element] ?? 6);
      placeUnit(room, {
        hex, card, hp: card.toughness, maxHp: card.toughness,
        shield, maxShield: shield, speedGauge: 0,
        ownerKey: player.key, ownerName: player.name, pinnedUntil: 0, march: null,
      });
      tell(room, `${player.name} casts ${card.name} onto the field (⚡${cost}${room.campaign && recastCount(room, player.key, card.id) > 0 ? ` — the recast price` : ""}).`);
      sendState(room);
      return;
    }

    // RECALL: your own standing Awoken steps back into the
    // roster. The energy spent casting is not returned — what
    // was spent was spent.
    if (msg.type === "recall") {
      if (player.fallen) return;
      const myKey = player.key;
      const hex = String(msg.hex ?? "");
      const cardId = String(msg.cardId ?? "");
      const unit = unitsAt(room, hex).find(u => u.ownerKey === myKey && (!cardId || u.card.id === cardId))
        ?? (cardId ? [...room.field.values()].find(u => u.ownerKey === myKey && u.card.id === cardId) : undefined);
      if (!unit) {
        ws.send(JSON.stringify({ type: "error", message: "No Awokin of yours stands there to recall." }));
        return;
      }
      if (isMarching(unit)) {
        ws.send(JSON.stringify({ type: "error", message: `${unit.card.name} is on the march — it answers when it arrives.` }));
        return;
      }
      removeUnit(room, unit);
      player.hand = [...player.hand, unit.card];
      tell(room, `${player.name} recalls ${unit.card.name} from the field.`);
      sendState(room);
      return;
    }

    // THE MARCH (Nigel, 2026-10-18 — the land's movement law
    // carried to the Table): a standing Awokin walks a road —
    // any road, cursed ground included (the seed-mission road)
    // — to any open tile. The price is the land's: hexes
    // crossed × (1 + ⌊(power−1)/3⌋)⚡, from the purse (or the
    // campaign bank). The pace is its element's gait, weighted
    // by its level, and while it walks it neither strikes nor
    // shields — the road is its own exposure.
    if (msg.type === "march") {
      if (player.fallen) { ws.send(JSON.stringify({ type: "error", message: "You have fallen — you will rise between waves." })); return; }
      if (player.watcher || player.storytender) { ws.send(JSON.stringify({ type: "error", message: "Only a seated Tender marches their Awokin." })); return; }
      const from = String(msg.from ?? "");
      const to = String(msg.to ?? "");
      const cardId = String(msg.cardId ?? "");
      const myKey = player.key;
      const unit = [...room.field.values()].find(u => u.ownerKey === myKey && u.card.id === cardId);
      if (!unit || unit.hex !== from) { ws.send(JSON.stringify({ type: "error", message: "That Awokin does not stand there." })); return; }
      if (isMarching(unit)) { ws.send(JSON.stringify({ type: "error", message: `${unit.card.name} is already on the march.` })); return; }
      if (!TILE_BY_ID.has(to) || to === SEED_TILE) { ws.send(JSON.stringify({ type: "error", message: "The march ends on the land — never on the star-seed's tile." })); return; }
      if (to === from) { ws.send(JSON.stringify({ type: "error", message: `${unit.card.name} already stands there.` })); return; }
      if (unitsAt(room, to).length >= STACK_CAP) { ws.send(JSON.stringify({ type: "error", message: `That tile stands full — ${STACK_CAP} of the light to a tile.` })); return; }
      const road = findAnyRoad(from, to);
      if (!road || road.length < 2) { ws.send(JSON.stringify({ type: "error", message: "No road runs there." })); return; }
      const hexes = road.length - 1;
      const cost = hexes * marchRateFor(unit.card.power);
      if (!chargePurse(room, player, cost)) {
        ws.send(JSON.stringify({ type: "error", message: `The march costs ⚡${cost} (${hexes} hex${hexes === 1 ? "" : "es"} at ⚡${marchRateFor(unit.card.power)} for ${unit.card.name}'s power) — ${room.campaign && !room.campaign.over && room.campaign.seeded ? `the bank holds ⚡${Math.floor(room.campaign.bank)}` : `you hold ⚡${player.energy}`}.` }));
        return;
      }
      const duration = Math.round(hexes * marchSecondsPerHexFor(unit.card) * 1000);
      const now = Date.now();
      unit.hex = to;
      unit.march = { road, since: now, endsAt: now + duration };
      tell(room, `🚶 ${player.name} marches ${unit.card.name} — ${hexes} hex${hexes === 1 ? "" : "es"} of road (⚡${cost}).`);
      sendState(room);
      return;
    }

    // BEGIN THE UNRAVELING: any standing seat may call the
    // wave down. The referee deals and the rounds begin.
    // THE WRITTEN LIGHT (2026-10-17): wards raised on edges,
    // runes written on ground, heal by a Tender's tier. Priced in
    // energy, gated by Tender level (wards & runes at Lv 3+), and
    // refused plainly when the Table cannot honor them. The hue
    // is chosen at the pour: in this first seating it names and
    // dresses the working; the attunement twists ride the
    // Tender's own elemental tree when that is built.
    if (msg.type === "castHeal") {
      if (!player) return;
      if (player.watcher) { ws.send(JSON.stringify({ type: "error", message: "Watchers hold no mending — bind in the game to cast." })); return; }
      const myKey = player.key;
      const unit = unitsAt(room, String(msg.hex || "")).filter(u => u.ownerKey === myKey)
        .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
      if (!unit) { ws.send(JSON.stringify({ type: "error", message: "Heal reaches only your own standing Awokin." })); return; }
      if (unit.hp >= unit.maxHp && unit.shield >= unit.maxShield) { ws.send(JSON.stringify({ type: "error", message: `${unit.card.name} stands whole already — body and shield alike.` })); return; }
      const healCost = healSpell()?.cost ?? 2;
      if (!chargePurse(room, player, healCost)) { ws.send(JSON.stringify({ type: "error", message: `Heal costs ⚡${healCost} — ${room.campaign && !room.campaign.over && room.campaign.seeded ? `the bank holds ⚡${Math.floor(room.campaign.bank)}` : `you hold ⚡${player.energy}`}.` })); return; }
      // FATE's healing dice (the skeleton, Nigel 2026-10-17):
      // the mended Awoken's own element die — stone d4, sky
      // d6, tide d8, root d12, fire d10 — rolled once per
      // heal tier. The body mends first; overflow reweaves
      // the shield.
      let dieAmount = 0;
      const dieSides = FATE_DIE[unit.card.element] ?? 6;
      for (let i = 0; i < Math.max(1, player.healTier); i++) dieAmount += dN(dieSides);
      // The Mending Art and the Long Watch (the Heart,
      // 2026-10-18): the tree's promised heal rides on top of
      // the dice — flat mending, named in the tale.
      const heartHeal = player.expKey ? heartEffects(player.expKey).heal : 0;
      const amount = dieAmount + heartHeal;
      const toHp = Math.min(unit.maxHp - unit.hp, amount);
      unit.hp += toHp;
      const toShield = Math.min(unit.maxShield - unit.shield, amount - toHp);
      unit.shield += toShield;
      tell(room, `${player.name} mends ${unit.card.name} — ${toHp + toShield} restored (${dieAmount} by the ${unit.card.element} die${heartHeal ? `, ${heartHeal} by the Heart's mending` : ""}; Heal, Tier ${player.healTier}).`);
      sendState(room);
      return;
    }

    if (msg.type === "castWard") {
      if (!player) return;
      const caster = player;
      if (caster.watcher) { ws.send(JSON.stringify({ type: "error", message: "Watchers raise no wards — bind in the game to cast." })); return; }
      const def = spellByKey(String(msg.root || ""));
      if (!def || def.kind !== "ward") { ws.send(JSON.stringify({ type: "error", message: "That is not a ward of the Written Light." })); return; }
      if (def.engine === "springleaf") { ws.send(JSON.stringify({ type: "error", message: "The Springleaf Ward answers columns on the land — it has no purchase on the Table's dark." })); return; }
      if (!caster.wardRuneUnlocked) { ws.send(JSON.stringify({ type: "error", message: `Wards wake at Tender Lv 3 — you stand at Lv ${caster.tenderLevel}.` })); return; }
      const hue = (HUE_ORDER as readonly string[]).includes(String(msg.hue)) ? String(msg.hue) : "unaligned";
      const hexA = String(msg.hexA || "");
      const hexB = String(msg.hexB || "");
      const mine = unitsAt(room, hexA).find(u => u.ownerKey === caster.key);
      if (!mine) { ws.send(JSON.stringify({ type: "error", message: "A ward stands on the edge of a tile your own Awokin holds." })); return; }
      if (!neighborsOf(hexA).includes(hexB)) { ws.send(JSON.stringify({ type: "error", message: "That edge does not exist — the two tiles must share a side." })); return; }
      if (room.workings.some(w => w.kind === "ward" && ((w.hexA === hexA && w.hexB === hexB) || (w.hexA === hexB && w.hexB === hexA)))) { ws.send(JSON.stringify({ type: "error", message: "A ward already stands on that edge." })); return; }
      if (def.engine === "standard" && room.workings.some(w => w.engine === "standard" && w.ownerKey === caster.key)) { ws.send(JSON.stringify({ type: "error", message: "One Standard per Tender — yours already flies." })); return; }
      // The Zodiac's workings tranche (2026-10-17): the
      // holder's skills ride the cast. Second Wall: once per
      // battle, a ward at half cost.
      const eff = workingEffects(caster.expKey);
      let castCost = def.cost;
      let secondWallSpent = false;
      if (eff.secondWall && !caster.secondWallUsed) { castCost = Math.ceil(def.cost / 2); secondWallSpent = true; }
      // Steady Attention (the Heart, 2026-10-18): the first
      // ward or rune of the battle costs 1⚡ less — it rides
      // after the Second Wall's halving when both are held.
      let steadySpent = false;
      const steadyAmt = caster.expKey ? heartEffects(caster.expKey).steadyAmount : 0;
      if (steadyAmt > 0 && !caster.steadyUsed) { castCost = Math.max(0, castCost - steadyAmt); steadySpent = true; }
      if (purseOf(room, caster) < castCost) { ws.send(JSON.stringify({ type: "error", message: `${def.name} costs ⚡${castCost} — ${purseName(room) === "the bank" ? `the bank holds ⚡${room.campaign!.bank}` : `you hold ⚡${caster.energy}`}.` })); return; }
      // The Pour (Nigel, 2026-10-17): elemental points of the
      // poured hue, fed into the working at its cast — capped by
      // the book, drawn from the caster's own attunement pool,
      // and checked before anything is spent, so a refused cast
      // costs nothing.
      const pourWanted = Math.max(0, Math.floor(Number(msg.pour) || 0));
      let pour = 0;
      if (pourWanted > 0) {
        if (!(POUR_ENGINES as readonly string[]).includes(def.engine)) { ws.send(JSON.stringify({ type: "error", message: `${def.name} takes no pour — its strength is not bought with attunement.` })); return; }
        if (hue === "unaligned") { ws.send(JSON.stringify({ type: "error", message: "An unaligned cast has no element to pour — choose a hue, and its pool feeds the working." })); return; }
        if (!caster.expKey) { ws.send(JSON.stringify({ type: "error", message: "Pouring draws on your attunement pools — bind your Tender at the Table to pour." })); return; }
        const pools = await attunementPools(caster.expKey);
        const capPools = { ...pools, [hue]: (pools[hue] ?? 0) + (skillAttunementGrants(caster.expKey)[hue] ?? 0) };
        const cap = pourCapFor(def, capPools, hue);
        if (pourWanted > cap) { ws.send(JSON.stringify({ type: "error", message: `Your ${hue} attunement stands at Lv ${cap} — you pour no deeper than your attunement.` })); return; }
        const held = pools[hue] ?? 0;
        if (held < pourWanted) { ws.send(JSON.stringify({ type: "error", message: `Pouring ${pourWanted} ${hue} points — your ${hue} pool holds ${held}.` })); return; }
        pour = pourWanted;
      }
      if (!chargePurse(room, caster, castCost)) { ws.send(JSON.stringify({ type: "error", message: `${def.name} costs ⚡${castCost} — the purse no longer holds it.` })); return; }
      if (secondWallSpent) { caster.secondWallUsed = true; tell(room, `${caster.name}'s Second Wall rises at half its price — the Warden's economy.`); }
      if (steadySpent) { caster.steadyUsed = true; tell(room, `${caster.name}'s first writing of the battle comes easier — Steady Attention.`); }
      if (pour > 0 && caster.expKey) {
        await spendAttunement(caster.expKey, hue, pour);
        if (caster.pools) caster.pools[hue] = Math.max(0, (caster.pools[hue] ?? 0) - pour);
      }
      // The health rating: holding wards are raised with health
      // grown from the book's base, the caster's level, the pour.
      // The Zodiac rides the snapshot (tranche one): Thick
      // Light's +2 on every ward, the Living Wall's +4 more on
      // the Trees, the Seal's deeper stops and answered
      // riposte, the Engine's deeper song.
      let hp = hpForCast(def, caster.tenderLevel, pour, engineBright(room, caster.key));
      hp += eff.wardHp + (def.engine === "trees" ? eff.treesHp : 0);
      // Lore Warden (tranche one): a ward raised on an edge
      // where one of yours fell stands at +2 HP — the edge
      // remembers its last state.
      if (eff.loreWarden && room.writtenEdges?.has(edgeKeyOf(hexA, hexB))) hp += 2;
      const wardNums: Record<string, number> = { ...def.numbers };
      if (def.engine === "seal") {
        wardNums.stops = (wardNums.stops ?? 3) + eff.sealStops + (hue === "stone" ? eff.deepSetSealStops : 0);
        wardNums.riposte = (wardNums.riposte ?? 3) + eff.riposte;
      }
      if (def.engine === "engine") wardNums.energyPerRound = (wardNums.energyPerRound ?? 1) + eff.engineEnergy;
      room.workings.push({
        id: randomUUID(), kind: "ward", root: def.key, engine: def.engine, nums: wardNums, name: def.forms[hue] ?? def.name, hue,
        ownerKey: caster.key, ownerName: caster.name, hex: null, hexA, hexB,
        hp, maxHp: hp, pour, stops: 0, charges: 0,
      });
      tell(room, `${caster.name} raises ${def.forms[hue] ?? def.name} on the edge of ${mine.card.name}'s hex.`);
      sendState(room);
      return;
    }

    if (msg.type === "castRune") {
      if (!player) return;
      const caster = player;
      if (caster.watcher) { ws.send(JSON.stringify({ type: "error", message: "Watchers write no runes — bind in the game to cast." })); return; }
      const def = spellByKey(String(msg.root || ""));
      if (!def || (def.kind !== "rune" && def.kind !== "spell")) { ws.send(JSON.stringify({ type: "error", message: "That is not a rune of the Written Light." })); return; }
      if (!caster.wardRuneUnlocked) { ws.send(JSON.stringify({ type: "error", message: `Runes wake at Tender Lv 3 — you stand at Lv ${caster.tenderLevel}.` })); return; }
      const hue = (HUE_ORDER as readonly string[]).includes(String(msg.hue)) ? String(msg.hue) : "unaligned";
      const eff = workingEffects(caster.expKey);
      const hexes: string[] = Array.isArray(msg.hexes) ? [...new Set<string>(msg.hexes.map((h: unknown) => String(h)))].slice(0, 12) : [];
      if (def.engine === "blades") {
        const maxT = (def.numbers.maxTargets ?? 3) + eff.bladesExtra;
        if (hexes.length < 1 || hexes.length > maxT) { ws.send(JSON.stringify({ type: "error", message: `${def.name} is planted on one to ${maxT} hexes.` })); return; }
      } else if (def.engine === "shardrain") {
        const maxT = def.numbers.maxHexes ?? 3;
        if (hexes.length < 1 || hexes.length > maxT) { ws.send(JSON.stringify({ type: "error", message: `${def.name} is written over one to ${maxT} hexes of ground.` })); return; }
      } else if (hexes.length !== 1) { ws.send(JSON.stringify({ type: "error", message: "That rune is written on one hex's ground." })); return; }
      for (const hx of hexes) {
        if (!TILE_BY_ID.has(hx) || hx === SEED_TILE) { ws.send(JSON.stringify({ type: "error", message: hx === SEED_TILE ? "Runes are written on the land's ground — not on the star-seed's tile." : "That is no tile of this land." })); return; }
        if (room.workings.some(w => w.kind === "rune" && w.hex === hx)) { ws.send(JSON.stringify({ type: "error", message: "That ground is already written — one writing per hex." })); return; }
      }
      // Steady Attention (the Heart, 2026-10-18): the first
      // ward or rune of the battle costs 1⚡ less — one flag,
      // shared with the ward's raising.
      let runeCost = def.cost;
      let runeSteadySpent = false;
      const runeSteadyAmt = caster.expKey ? heartEffects(caster.expKey).steadyAmount : 0;
      if (runeSteadyAmt > 0 && !caster.steadyUsed) { runeCost = Math.max(0, runeCost - runeSteadyAmt); runeSteadySpent = true; }
      if (purseOf(room, caster) < runeCost) { ws.send(JSON.stringify({ type: "error", message: `${def.name} costs ⚡${runeCost} — ${purseName(room) === "the bank" ? `the bank holds ⚡${room.campaign!.bank}` : `you hold ⚡${caster.energy}`}.` })); return; }
      // The Pour, as at the ward's raising — one pour feeds the
      // whole cast (the Three Blades drink once, not per hex).
      const pourWanted = Math.max(0, Math.floor(Number(msg.pour) || 0));
      let pour = 0;
      if (pourWanted > 0) {
        if (!(POUR_ENGINES as readonly string[]).includes(def.engine)) { ws.send(JSON.stringify({ type: "error", message: `${def.name} takes no pour — its strength is not bought with attunement.` })); return; }
        if (hue === "unaligned") { ws.send(JSON.stringify({ type: "error", message: "An unaligned cast has no element to pour — choose a hue, and its pool feeds the working." })); return; }
        if (!caster.expKey) { ws.send(JSON.stringify({ type: "error", message: "Pouring draws on your attunement pools — bind your Tender at the Table to pour." })); return; }
        const pools = await attunementPools(caster.expKey);
        const capPools = { ...pools, [hue]: (pools[hue] ?? 0) + (skillAttunementGrants(caster.expKey)[hue] ?? 0) };
        const cap = pourCapFor(def, capPools, hue);
        if (pourWanted > cap) { ws.send(JSON.stringify({ type: "error", message: `Your ${hue} attunement stands at Lv ${cap} — you pour no deeper than your attunement.` })); return; }
        const held = pools[hue] ?? 0;
        if (held < pourWanted) { ws.send(JSON.stringify({ type: "error", message: `Pouring ${pourWanted} ${hue} points — your ${hue} pool holds ${held}.` })); return; }
        pour = pourWanted;
      }
      if (!chargePurse(room, caster, runeCost)) { ws.send(JSON.stringify({ type: "error", message: `${def.name} costs ⚡${runeCost} — the purse no longer holds it.` })); return; }
      if (runeSteadySpent) { caster.steadyUsed = true; tell(room, `${caster.name}'s first writing of the battle comes easier — Steady Attention.`); }
      if (pour > 0 && caster.expKey) {
        await spendAttunement(caster.expKey, hue, pour);
        if (caster.pools) caster.pools[hue] = Math.max(0, (caster.pools[hue] ?? 0) - pour);
      }
      const hp = hpForCast(def, caster.tenderLevel, pour, false);
      // SHARD RAIN (Nigel, 2026-10-17): the caster's attunement
      // LEVEL in the spell's element is snapshotted at the cast,
      // as HP is — the rain that falls later rolls by the sky
      // the caster stood under when they wrote it. An unaligned
      // cast rolls the base dice alone.
      let rainNums: Record<string, number> = { ...def.numbers };
      // The Zodiac rides the rune's snapshot (tranche one):
      // Deep Ink and the Everlasting Inscription deepen its
      // harm and its pins; Patient Light lengthens the hold;
      // the Lowered Crown feeds the Shard on lesser power;
      // Ebb Walker fattens the Coil's return.
      if (typeof rainNums.power === "number") rainNums.power += eff.runePower;
      if (typeof rainNums.pinRounds === "number") rainNums.pinRounds += eff.runePin;
      if (def.engine === "shard" && eff.crownThreshold != null) rainNums.minPower = Math.min(rainNums.minPower ?? 5, eff.crownThreshold);
      if (def.engine === "coil") rainNums.energyPerDark = (rainNums.energyPerDark ?? 1) + eff.coilReturn;
      if (def.engine === "shardrain") {
        let lvl = 0;
        if (hue !== "unaligned" && caster.expKey) {
          const pools = await attunementPools(caster.expKey).catch(() => null);
          if (pools) lvl = attunementLevel((pools[hue] ?? 0) + (skillAttunementGrants(caster.expKey)[hue] ?? 0));
        }
        rainNums = { ...def.numbers, rainLevel: lvl };
      }
      const group = randomUUID();
      let castIndex = 0;
      for (const hx of hexes) {
        // Split Writing (tranche one): the FOURTH blade is
        // planted at half power — its own numbers, its own
        // hunger.
        let thisNums = rainNums;
        if (def.engine === "blades" && eff.bladesExtra > 0 && castIndex === (def.numbers.maxTargets ?? 3)) {
          thisNums = { ...rainNums, power: Math.floor((rainNums.power ?? 3) / 2) };
        }
        castIndex++;
        const chargesNow = (def.engine === "blade" || def.engine === "blades") ? (def.numbers.charges ?? 2) + eff.bladeSprings : def.engine === "coil" ? 1 + eff.coilTurns : 1;
        const wNew: Working = {
          id: randomUUID(), kind: "rune", root: def.key, engine: def.engine, nums: thisNums, name: def.forms[hue] ?? def.name, hue,
          ownerKey: caster.key, ownerName: caster.name, hex: hx, hexA: null, hexB: null,
          hp, maxHp: hp, pour, stops: 0, charges: chargesNow, maxCharges: chargesNow,
          group,
        };
        // The Ground Remembers (tranche one): the FIRST rune
        // a holder writes each battle is marked to wait.
        if (eff.groundRemembers && !caster.groundRemembered) {
          wNew.rememberMark = true;
          caster.groundRemembered = true;
        }
        room.workings.push(wNew);
      }
      tell(room, hexes.length > 1
        ? `${caster.name} writes ${def.forms[hue] ?? def.name} across ${hexes.length} hexes.`
        : `${caster.name} writes ${def.forms[hue] ?? def.name} on the ground of the field.`);
      for (const hx of hexes) springHex(room, hx, new Set());
      sendState(room);
      return;
    }

    if (msg.type === "pourWorking") {
      // PUSH A NEUTRAL RUNE (Nigel, 2026-10-17): a neutral rune
      // already standing on the field — your own OR AN ALLY'S —
      // may be pushed either way: pour an element into it and it
      // takes that hue. The pour obeys the cast's law (your
      // attunement level in the pushed element is the depth cap,
      // the points are truly spent) and the rune gains the
      // pour's measure of health, as if fed at its raising.
      // Runes that take no pour cannot be pushed.
      const caster = player;
      const fail = (message: string) => { ws.send(JSON.stringify({ type: "error", message })); };
      const w = room.workings.find(x => x.id === String(msg.workingId));
      if (!w) { fail("No such working stands on the field."); return; }
      if (w.kind !== "rune") { fail("Only a rune can be pushed — a ward's hue is chosen at its raising."); return; }
      if (w.hue !== "unaligned") { fail(`That rune already burns ${w.hue} — its way is chosen.`); return; }
      const def = spellByKey(w.root);
      if (!def) { fail("That rune's spell is no longer in the book."); return; }
      if (!(POUR_ENGINES as readonly string[]).includes(def.engine)) { fail(`${def.name} takes no pour — there is nothing to push it with.`); return; }
      const hue = String(msg.hue ?? "");
      if (!(HUE_ORDER as readonly string[]).includes(hue) || hue === "unaligned") { fail("Name the element to push the rune toward."); return; }
      const pourWanted = Math.max(0, Math.floor(Number(msg.pour) || 0));
      if (pourWanted < 1) { fail("Name the depth to pour."); return; }
      if (!caster.expKey) { fail("Pouring draws on your attunement pools — bind your Tender at the Table to pour."); return; }
      const pools = await attunementPools(caster.expKey);
      const cap = attunementLevel(pools[hue] ?? 0);
      if (pourWanted > cap) { fail(`Your ${hue} attunement stands at Lv ${cap} — you pour no deeper than your attunement.`); return; }
      if ((pools[hue] ?? 0) < pourWanted) { fail(`Pouring ${pourWanted} ${hue} points — your ${hue} pool holds ${pools[hue] ?? 0}.`); return; }
      await spendAttunement(caster.expKey, hue, pourWanted);
      if (caster.pools) caster.pools[hue] = Math.max(0, (caster.pools[hue] ?? 0) - pourWanted);
      const gained = Math.floor((def.numbers.hpPerPoint ?? 0) * pourWanted);
      w.hue = hue; w.pour = (w.pour ?? 0) + pourWanted; w.name = def.forms[hue] ?? w.name;
      w.hp += gained; w.maxHp += gained;
      tell(room, `${caster.name} pushes ${def.name} toward ${hue} — poured ${pourWanted} deep, and the rune takes the hue.`);
      sendState(room);
      return;
    }

    if (msg.type === "startWave") {
      if (room.campaign) {
        ws.send(JSON.stringify({ type: "error", message: "In a campaign the Storytender deals — no ladder climbs itself here." }));
        return;
      }
      if (player.watcher) {
        ws.send(JSON.stringify({ type: "error", message: "Only a standing seat at the Table may begin the Unraveling." }));
        return;
      }
      if (player.fallen) {
        // The rise between waves lives just below — but a
        // fallen caller could never reach it, so a room where
        // EVERY seat has fallen was soft-locked (playtest,
        // 2026-10-18): the tale's own advice, "re-seat, recast,
        // and begin it again", freed no one. When no seat
        // stands, the fallen begin it themselves and rise at
        // half, exactly as a bastion's begin already lifts
        // them. While any seat stands, the standing seat
        // begins it — that law is untouched.
        const anyStanding = [...room.players.values()].some(p => !p.watcher && !p.fallen);
        if (anyStanding) {
          ws.send(JSON.stringify({ type: "error", message: "Only a standing seat at the Table may begin the Unraveling." }));
          return;
        }
      }
      if (room.battle.active) {
        ws.send(JSON.stringify({ type: "error", message: "The wave is already on the field." }));
        return;
      }
      if (room.dark.size > 0) room.dark.clear();
      // The fallen rise again between waves, at half their ward.
      for (const p of room.players.values()) {
        if (p.fallen) { p.fallen = false; p.tenderHp = Math.ceil(p.maxTenderHp / 2); }
      }
      dealWave(room);
      tell(room, `${player.name} begins the Unraveling.`);
      sendState(room);
      return;
    }

    // CLAIM A CALL (the Columns, 2026-10-17): the host seat of a
    // standing call seats it in this room. The pool is struck
    // from the seats then present — their max energy, each
    // scaled +2 per level above the first.
    if (msg.type === "claimBastion") {
      if (room.campaign) {
        ws.send(JSON.stringify({ type: "error", message: "A campaign table answers no column calls — the Convergence here is the Storytender's to deal." }));
        return;
      }
      if (player.watcher || !player.expKey) {
        ws.send(JSON.stringify({ type: "error", message: "Only a bound seat can claim its call." }));
        return;
      }
      if (room.bastion) {
        ws.send(JSON.stringify({ type: "error", message: "A call already stands claimed in this room." }));
        return;
      }
      const callId = Math.floor(Number(msg.callId ?? 0));
      const call = sqlite.prepare("SELECT * FROM bastion_calls WHERE id = ? AND state = 'open'").get(callId) as any;
      if (!call) { ws.send(JSON.stringify({ type: "error", message: "No open call by that name stands." })); return; }
      if (call.owner_key !== player.expKey) { ws.send(JSON.stringify({ type: "error", message: "That call is another Tender's to claim." })); return; }
      let roster: { kind: string; count: number; power: number; hp: number }[] = [];
      let size = 0;
      if (call.column_id) {
        const col = sqlite.prepare("SELECT * FROM incursion_columns WHERE id = ?").get(call.column_id) as any;
        if (!col) { ws.send(JSON.stringify({ type: "error", message: "The column that call named is gone." })); return; }
        roster = incursionRoster(Number(col.size), Number(col.power));
        size = Number(col.size);
      } else if (call.seed_id) {
        const seed = sqlite.prepare("SELECT * FROM star_seeds WHERE id = ?").get(call.seed_id) as any;
        size = 8 + 2 * Number(seed?.level ?? 1);
        roster = incursionRoster(size, 2);
      }
      let pool = 0;
      for (const p of room.players.values()) {
        if (p.watcher) continue;
        pool += p.maxEnergy + 2 * Math.max(0, p.tenderLevel - 1);
      }
      room.bastion = {
        callId: call.id, tier: call.column_id ? Number((sqlite.prepare("SELECT power FROM incursion_columns WHERE id = ?").get(call.column_id) as any)?.power ?? 1) : 2, kind: call.kind, hostKey: call.owner_key, hostTenderId: call.host_tender_id,
        hostName: player.name, columnId: call.column_id, seedId: call.seed_id,
        roster, size, ambush: call.kind === "ambush",
        pool, poolMax: pool, begun: false, resolved: false,
      };
      tell(room, `${player.name} claims the call: a ${call.kind.toUpperCase()} — ${size} of the dark. Friends, take your seats; the host begins it when the muster is ready. The pool stands at ⚡${pool}.`);
      sendState(room);
      return;
    }

    // BEGIN THE BASTION BATTLE: the host alone deals the column.
    if (msg.type === "startBastion") {
      if (!room.bastion) { ws.send(JSON.stringify({ type: "error", message: "No call stands claimed in this room." })); return; }
      if (player.expKey !== room.bastion.hostKey) { ws.send(JSON.stringify({ type: "error", message: "The host begins their own call." })); return; }
      if (room.battle.active || room.bastion.begun) { ws.send(JSON.stringify({ type: "error", message: "The battle is already joined." })); return; }
      if (room.dark.size > 0) room.dark.clear();
      for (const p of room.players.values()) {
        if (p.fallen) { p.fallen = false; p.tenderHp = Math.ceil(p.maxTenderHp / 2); }
      }
      dealBastion(room);
      sendState(room);
      return;
    }

    // ── THE STORYTENDER'S INSTRUMENTS (campaign rooms,
    // Phase B) — and the campaign's own way home. ──
    if (["stAdd", "stRemove", "stClear", "stDeal", "stNarrate", "stScene", "stSky", "stRest", "stRevive", "stDissipate", "stAdjourn", "stEnd"].includes(msg.type) && room.campaign) {
      if (!room || !player) return;
      const R: Room = room;
      const c = R.campaign as CampaignState;
      const isST = !!player.storytender;
      if (msg.type === "stEnd") {
        if (player.watcher) { ws.send(JSON.stringify({ type: "error", message: "Watchers do not end campaigns." })); return; }
        if (!isST && [...room.players.values()].some(p => p.storytender)) {
          ws.send(JSON.stringify({ type: "error", message: "The turning-home is the Storytender's word while she sits." }));
          return;
        }
        endCampaign(R, "ended");
        return;
      }
      if (!isST) { ws.send(JSON.stringify({ type: "error", message: "Only the Storytender holds that instrument." })); return; }
      if (c.over) { ws.send(JSON.stringify({ type: "error", message: "The campaign is over — its tale is told." })); return; }
      switch (msg.type) {
        case "stAdd": {
          const kind = String(msg.kind ?? "");
          if (!(kind in ENEMY_STATS)) { ws.send(JSON.stringify({ type: "error", message: "That is no dark the roster knows." })); return; }
          if (c.reserve.length >= 40) { ws.send(JSON.stringify({ type: "error", message: "Your hand of dark is full — forty pieces is a doom, not a dealing." })); return; }
          c.reserve.push(kind);
          break;
        }
        case "stRemove": {
          const i = Number(msg.index);
          if (Number.isInteger(i) && i >= 0 && i < c.reserve.length) c.reserve.splice(i, 1);
          break;
        }
        case "stClear": c.reserve = []; break;
        case "stDeal": {
          if (!c.reserve.length) { ws.send(JSON.stringify({ type: "error", message: "Your hand of dark is empty — compose the Unraveling first." })); return; }
          seedBankIfNeeded(R);
          for (const p of R.players.values()) {
            p.secondWallUsed = false; p.secondThreadUsed = false; p.groundRemembered = false; p.steadyUsed = false;
            if (p.fallen) { p.fallen = false; p.tenderHp = Math.ceil(p.maxTenderHp / 2); }
          }
          const spots = darkGround(R, c.reserve.length);
          const lvl = 1 + Math.floor(c.deals / 3);
          let placed = 0;
          for (const kind of c.reserve) {
            if (placed >= spots.length) break;
            const hex = spots[placed];
            const base = ENEMY_STATS[kind];
            const face = R.enemies.find(e => e.name === kind);
            const hp = base.hp + (lvl - 1);
            const foe: EnemyUnit = {
              id: nextDarkId(),
              hex, kind, label: face?.label ?? kind, art: face?.art ?? null,
              power: base.power + Math.floor((lvl - 1) / 3), hp, maxHp: hp, pinnedUntil: 0, march: null,
              armor: base.armor + Math.floor((lvl - 1) / 2), lvl, speedGauge: 0,
            };
            R.dark.set(foe.id, foe);
            placed++;
          }
          if (placed < c.reserve.length) tell(R, `The field holds no more ground — ${c.reserve.length - placed} of the dealt dark wait for room to stand.`);
          c.reserve = c.reserve.slice(placed);
          for (const hex of new Set([...R.dark.values()].map(e => e.hex))) springHex(R, hex, new Set());
          c.deals++;
          R.battle.active = true;
          R.roundNo = 0;
          const threat = [...room.dark.values()].reduce((s, e) => s + e.power, 0);
          tell(R, `${player.name} deals — ${placed} of the dark take the field (threat ${threat}). The bank stands at ⚡${c.bank}.`);
          startBattleTimer(R);
          break;
        }
        case "stNarrate": {
          const text = String(msg.text ?? "").trim().slice(0, 500);
          if (text) tell(R, `📖 ${player.name}: ${text}`);
          break;
        }
        case "stScene": {
          const title = String(msg.title ?? "").trim().slice(0, 80);
          const text = String(msg.text ?? "").trim().slice(0, 1000);
          const rawUrl = String(msg.imageUrl ?? "").trim().slice(0, 600);
          const imageUrl = /^https:\/\/\S+$/.test(rawUrl) ? rawUrl : null;
          c.stage = { title: title || "The scene", text, imageUrl, at: Date.now() };
          tell(R, `The Storytender sets the scene: ${c.stage.title}.`);
          break;
        }
        case "stSky": {
          const text = String(msg.text ?? "").trim().slice(0, 160);
          c.skyNote = text || null;
          if (text) tell(R, `The sky over the campaign turns: ${text}.`);
          break;
        }
        case "stRest": {
          for (const p of R.players.values()) {
            if (p.watcher || p.storytender) continue;
            p.fallen = false;
            p.tenderHp = p.maxTenderHp;
          }
          tell(R, `${player.name} calls a rest — wounds close, the fallen rise, and the party breathes.`);
          break;
        }
        case "stRevive": {
          const target = seatByKey(R, String(msg.playerKey ?? ""));
          if (target && target.fallen) {
            target.fallen = false;
            target.tenderHp = Math.ceil(target.maxTenderHp / 2);
            tell(R, `Mercy: ${target.name} is returned to the fight at half their ward.`);
          }
          break;
        }
        case "stDissipate": {
          const e = (msg.id ? R.dark.get(String(msg.id)) : undefined) ?? darkAt(R, String(msg.hex ?? ""));
          if (e) {
            R.dark.delete(e.id);
            tell(R, `The Storytender's mercy: the ${e.label} comes apart, unharvested.`);
          }
          break;
        }
        case "stAdjourn": {
          saveCampaign(R);
          tell(R, "The campaign is adjourned — its bank, its tale, and its reckonings rest in keeping until this room opens again.");
          break;
        }
        default: return;
      }
      sendState(R);
      return;
    }

    if (msg.type === "notes" && !player.watcher) {
      player.notes = String(msg.text ?? "").slice(0, 8000);
      await saveProfile(player);
      sendState(room);
      return;
    }

    if (msg.type === "inventory" && !player.watcher) {
      const items = Array.isArray(msg.items) ? msg.items.filter((x: unknown) => typeof x === "string").map((x: string) => x.slice(0, 120)).slice(0, 100) : [];
      player.inventory = items;
      await saveProfile(player);
      sendState(room);
      return;
    }
  });

  ws.on("close", () => {
    if (room && player) {
      room.players.delete(ws);
      if (!player.watcher) tell(room, `${player.name} leaves the Table.`);
      // THE RISK OF CONFLUENCE (§4.3): a stake poured into a
      // living campaign stays in the pot when its Tender goes.
      if (room.campaign?.seeded && !room.campaign.over && !player.watcher && !player.storytender) {
        tell(room, `${player.name}'s stake stays in the pot (⚡${room.campaign.bank}) — it divides only among those seated when the campaign turns home, unless they return.`);
      }
      if (room.players.size === 0) {
        if (room.campaign && !room.campaign.over) saveCampaign(room); // an emptied campaign room adjourns itself
        endBattle(room); rooms.delete(room.id);
      }
      else sendState(room);
    }
  });
  ws.on("error", () => { try { ws.close(); } catch {} });
}

/** Which page the Discord door opens: "table" (the room itself, the
 *  default) or "control" (the bare handshake instrument of the
 *  2026-10-16 audit), switched from the UI Workshop via the generic
 *  setUiConfig action, key "table.doorMode". Read fresh on every
 *  door request so the switch needs no restart. */
export function tableDoorMode(): string {
  try {
    const [row] = db.select().from(schema.uiConfig)
      .where(eq(schema.uiConfig.key, "table.doorMode")).limit(1).all();
    if (row && JSON.parse(row.value) === "control") return "control";
  } catch {}
  return "table";
}

/** Mint a seat token for a Discord-proven user (the auth route's
 *  last step, shared so a seat token means the same thing wherever
 *  it is issued). */
export function issueTableToken(user: { id: string; name: string }): string {
  const token = randomUUID();
  authTokens.set(token, user);
  return token;
}

/** Mount the Table's HTTP routes: config + sign-in exchange. These
 *  must be registered BEFORE the static bundle and its SPA fallback in
 *  index.ts, or the fallback answers /api/table/* with index.html.
 *  Secrets stay server-side, always. */
export function registerTableRoutes(app: Express): void {
  app.get("/api/table/config", (_req: Request, res: Response) => {
    res.json({ discordClientId: DISCORD_CLIENT_ID || null, devMode: !TABLE_CONFIGURED });
  });

  // Spend a binding code (minted in the game by getTableBindCode):
  // the seat's proven Discord token names who is binding; the code
  // names the Tender. One Discord name ↔ one Tender: binding moves
  // the Tender's bond wholesale and replaces this name's old bond.
  app.post("/api/table/bind", async (req: Request, res: Response) => {
    const token = String(req.body?.token ?? "");
    const code = String(req.body?.code ?? "").trim().toUpperCase();
    const user = authTokens.get(token);
    if (!user) { res.status(401).json({ error: "That seat is not signed in — reopen the Table from Discord." }); return; }
    if (!code) { res.status(400).json({ error: "Give the binding code from the game." }); return; }
    const rows = await db.select().from(schema.tableBindCodes)
      .where(eq(schema.tableBindCodes.code, code)).limit(1);
    const row = rows[0];
    if (!row || row.usedAt !== null || row.expiresAt < Date.now()) {
      res.status(400).json({ error: "That code has faded or was already spent. Take a fresh one in the game." });
      return;
    }
    await db.update(schema.tableBindCodes).set({ usedAt: Date.now() })
      .where(eq(schema.tableBindCodes.code, code));
    await db.delete(schema.tableBindings)
      .where(eq(schema.tableBindings.tenderId, row.tenderId));
    await db.insert(schema.tableBindings)
      .values({ discordId: user.id, tenderId: row.tenderId })
      .onConflictDoUpdate({ target: schema.tableBindings.discordId, set: { tenderId: row.tenderId } });
    res.json({ ok: true, tenderName: await tenderDisplayName(row.tenderId) });
  });

  app.post("/api/table/auth", async (req: Request, res: Response) => {
    const code = String(req.body?.code ?? "");
    if (!code) { res.status(400).json({ error: "Missing sign-in code." }); return; }
    if (!TABLE_CONFIGURED) { res.status(503).json({ error: "Discord is not configured on the server yet." }); return; }
    try {
      const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: DISCORD_CLIENT_ID,
          client_secret: DISCORD_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
        }),
      });
      if (!tokenRes.ok) { res.status(401).json({ error: "Discord refused the sign-in." }); return; }
      const tok = (await tokenRes.json()) as { access_token: string };
      const userRes = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${tok.access_token}` },
      });
      if (!userRes.ok) { res.status(401).json({ error: "Discord would not name you." }); return; }
      const user = (await userRes.json()) as { id: string; username: string; global_name?: string | null };
      const name = user.global_name || user.username;
      const token = issueTableToken({ id: String(user.id), name });
      res.json({ token, accessToken: tok.access_token, user: { id: String(user.id), name } });
    } catch {
      res.status(502).json({ error: "Discord could not be reached." });
    }
  });
}

/** Mount the Table's realtime room socket on the HTTP server. */
export function registerTableSocket(server: Server): void {
  void refreshGrimoire();
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    let pathname = "";
    try { pathname = new URL(req.url ?? "/", "http://localhost").pathname; } catch {}
    if (pathname === "/table/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    } else {
      socket.destroy();
    }
  });
  wss.on("connection", handleConnection);

  // Keep dead sockets from lingering as ghosts at the Table.
  const sweep = setInterval(() => {
    for (const client of wss.clients) {
      if (client.readyState !== WebSocket.OPEN && client.readyState !== WebSocket.CONNECTING) {
        try { client.terminate(); } catch {}
      }
    }
  }, 30_000);
  sweep.unref?.();
}
