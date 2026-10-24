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
import { awakenedPayloadById, calculateMaxEnergy, resolveCurrentEnemyArt, handlers, incursionRoster, stagedIdsFor, payFellDrip, HOMELAND_CAST_RING, bulwarkShieldCountFor, rockWallHpForLevel } from "./actions.js";
import { enemyACFor, ENEMY_AC_BASE, ENEMY_ARMOR_DEFAULTS } from "./enemyAC.js";
import { getTenderProgress, healTierForLevel, healAmountForLevel, tenderMaxHpForLevel, awardTenderExp } from "./tenderExp.js";
import { refreshGrimoire, spellByKey, healSpell, hpForCast, spendAttunement, attunementPools, attunementLevel, pageSlotsCastFor, pageHueFor, castHuesFor, pourLaidFor } from "./grimoire.js";
import { workingEffects, skillAttunementGrants, companyCapFor, heartEffects, summonersPowerFor, attuneReachFor, companyAcBonusFor, curseReliefFor, bindingHealBonusFor, bindingHealRangeFor, witchCastCostFor, witchMiscastRefundFor, quicknessSpeedFor } from "./skills.js";
export { summonersPowerFor } from "./skills.js";
export { attuneReachFor } from "./skills.js";
import { partyIdsFor, partyCapFor, isPartyMember, tryAddPartyMember, removePartyMember } from "./party.js";

const TABLE_CONFIGURED = Boolean(DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET);
const MAX_SEATED = 8; // ruled 2026-10-15 at 5 Tenders to a table; raised to 8 by Nigel 2026-10-18, the night the map grew to 127 tiles
/** AWAY SEATS (Nigel, 2026-10-19): a dropped connection is a
 *  Tender stepping away, not leaving — their seat is held this
 *  long before it lapses into a true leaving. Env-tunable for
 *  the test harness. */
const AWAY_GRACE_MS = Number(process.env.TABLE_AWAY_GRACE_MS || 600_000);
/** REINFORCEMENTS' ROAD (Nigel, 2026-10-20: four minutes;
 *  RE-RULED Nigel, 2026-10-23 07:21–07:25 — Recovery R6):
 *  how long a reinforcement walks to the Table when NO
 *  bastion plays. With a bastion in play the air drop is
 *  instant, and on the homeland reinforcements are instant —
 *  this road is walked at the Table alone, and only while no
 *  bastion plays. Env-tunable for the test harness, as
 *  AWAY_GRACE_MS is. The duration itself never moved: it is
 *  the road's own four minutes, restored with the door. */
const REINFORCEMENT_MS = Number(process.env.TABLE_REINFORCEMENT_MS || 240_000);
const REINFORCEMENT_MINUTES = Math.max(1, Math.round(REINFORCEMENT_MS / 60_000));
/** The fall measure: a truly dissipated Awoken re-coalesces
 *  in four hours — the homeland's dispersal writes the same
 *  span on awakened.dispersed_until (actions.ts). */
const RECOALESCE_MS = 4 * 60 * 60 * 1000;
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
  /** THE SHIELD'S PARTS (the shield law, Nigel 2026-10-22):
   *  EVERY layer of the creature's payload, in payload order,
   *  carrying its own element alone — background, body, arms,
   *  aura, head and aspect layers alike, with NO category
   *  filter, exactly the layers the homeland's rollShieldFor
   *  reads off parseLayers in actions.ts. This is a separate
   *  reckoning from `parts` above: Fate's damage and the march
   *  pace read `parts`, and neither of those laws is this one,
   *  so `parts` must not grow to serve the shield. Real-deck
   *  cards only (built by cardFromPayload, which sets this
   *  field even when a payload somehow carries no layers);
   *  stand-in cards carry none, and shieldPoolFor keeps the
   *  old fallback for them. */
  shieldParts?: { element: string }[];
  /** The piece art itself (source, category, current image URL),
   *  so the field can stand the Awoken as a cutout — the battleground's
   *  own sources — never the flattened card face (Nigel, 2026-10-18:
   *  no backgrounds behind the figures at the Table). */
  layers?: { source_id: string; category: string; imageUrl: string | null }[];
}

/** The stand-in pool: the company an UNBOUND seat brings.
 *  Bound seats bring their Tender's party instead (the
 *  strict party law) — never this pool. */
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
  /** THE WHEEL'S COMPANY (Nigel, 2026-10-21 16:26 — the wheel
   *  summoning law): the cards this seat can call by the action
   *  wheel's summon cast. For a bound seat that is the Tender's
   *  PARTY alone (the strict party law), members not currently
   *  fielded at this Table; for an unbound seat, the stand-in
   *  pool it brought. The deck hand this field replaces is
   *  RETIRED — nothing is dealt any more. The full source set
   *  (before the fielded are set aside) rides in companySource
   *  for unbound seats; bound seats rebuild from the ledger. */
  company: TableCard[];
  /** The unbound seat's stand-in pool, minted at the join —
   *  its company's source, from which the fielded are set
   *  aside at every refresh. Bound seats carry none. */
  companySource?: TableCard[];
  /** The company's freshness mark: a signature of what it was
   *  built from (party ids + this seat's fielded), and when.
   *  sendState refreshes the company when the signature turns
   *  or a few seconds pass (a member's re-coalescence ending
   *  writes no signature change, so time covers it). */
  companySig?: string;
  companyAt?: number;
  notes: string;
  inventory: string[];
  /** The Tender this seat is bound to (display name), or null when
   *  the seat holds stand-in cards. */
  bound?: string | null;
  /** The bound Tender's CHOSEN class (the Class Gate, 2026-10-19) —
   *  their figure at the Table wears it; null for unbound seats. */
  classKey?: string | null;
  /** THE RUNIC WEAPON (Nigel, 2026-10-19): floats at his side. */
  weaponKey?: string | null;
  /** THE WEAPON CONTRACT (Phase C): the wielded weapon's own
   *  standing, read fresh from its tender_weapons row (via the
   *  progress view's arsenal entry, with the row itself as the
   *  fallback) at bind time and at every wield — level, attuned
   *  element and depth, and the Manifest / Signature nodes.
   *  Defaults (Lv 1, unattuned, no nodes) when no row stands. */
  weaponLevel?: number;
  weaponElement?: string | null;
  weaponDepth?: number;
  weaponManifest?: boolean;
  weaponSignature?: boolean;
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
   *  first-working discount (−1✦) has been spent — one flag
   *  shared by wards and runes. Reset at every deal. */
  steadyUsed?: boolean;
  /** Tranche one, per battle: the Second Thread spent? */
  secondThreadUsed?: boolean;
  /** Tranche one, per battle: the Ground's memory spent? */
  groundRemembered?: boolean;
  /** The tender-progress owner key for bound seats — where
   *  battle EXP is paid. Null for stand-in seats. */
  expKey: string | null;
  /** The seat's attunement pools (whole points), served for
   *  the Attune act — refreshed at the cast; the referee
   *  re-reads the pool itself before any point is spent.
   *  Null unbound. */
  pools: Record<string, number> | null;
  /** The colour each of this seat's casts will wear, derived
   *  from their pages' standing in the book (castHuesFor) —
   *  served with the seat's own state so the player sees the
   *  element before the tap. Read at the seat, refreshed on
   *  the room's pulse; the cast doors themselves always
   *  derive fresh (pageHueFor), so a stale serving can only
   *  mislabel, never miscast. Null/empty unbound. */
  castHues?: Record<string, string>;
  castHuesAt?: number;
  /** The company this seat can NOT call, and where each
   *  stands instead (the Table Fix Pass, 2026-10-20):
   *  Awokin on the Tender's homeland field, or staged at
   *  their bastion — one body, one place (Station 4), but
   *  NAMED beside the seat's company instead of silently
   *  missing. A seat-time reckoning, as the company is. */
  elsewhere?: { name: string; element: string; where: "fielded" | "staged" }[];
  /** This sitting's energy: for a bound seat, the game's own max
   *  energy for that Tender, calculated from their whole roster by
   *  the one law (calculateMaxEnergy) — all of it, as ruled. */
  energy: number;
  maxEnergy: number;
  /** THE STANDING RECKONING behind the living maximum (the
   *  bonus for the unfielded, Nigel 2026-10-21): the seat's maximum as it
   *  stands with NOTHING of this seat's fielded — calculateMax
   *  Energy plus the Heart's Deep Breath where it stands. The
   *  living `maxEnergy` is this reckoning minus the shares of
   *  the Awokin currently fielded at this Table, re-reckoned
   *  at the field's seams (reckonSeatEnergy). Bound seats
   *  only; unbound seats keep their flat portion and carry
   *  none. */
  standingMaxEnergy?: number;
  /** THE TENDER ON THE FIELD (Nigel, 2026-10-19): where this
   *  Tender stands on the instance — a tile id, derived from
   *  `pos` by the continuous referee. The Tender arrives at
   *  their landing tile and glides from there. The
   *  Storytender holds no ground — she deals. */
  hex?: string;
  pos?: Pt;
  target?: Pt | null;
  /** The runic weapon's next strike moment, and its tally. */
  weaponNext?: number;
  weaponKills?: number;
  /** When this Tender last cast a working — the room's screens
   *  play their casting gesture from it. */
  castAt?: number;
  /** REINFORCEMENTS STILL IN FLIGHT (the Party, build 2;
   *  the road RETIRED by the wheel law, 2026-10-21, then
   *  RE-RULED Nigel, 2026-10-23 07:21–07:25 — Recovery R6):
   *  the wheel calls reinforcements again — a deck Awoken
   *  named at the wheel walks this road when no bastion
   *  plays, and its membership lands when the timer completes
   *  if the battle still stands (settleReinforcements); a
   *  battle's end closes the road with its price returned
   *  whole. `cost` is what the road charged and `fromBank`
   *  which purse it was charged from, so a refund returns to
   *  the same purse. */
  incoming?: { awakenedId: number; name: string; arrivesAt: number; cost: number; fromBank: boolean }[];
  /** THE DECK THE WHEEL CAN CALL REINFORCEMENTS FROM
   *  (Recovery R6): this seat's Tender's owned Awoken that
   *  could be called in — not in the party, not already on
   *  the road, not fielded here, not kept at a post —
   *  rebuilt beside the company (same freshness watch), each
   *  with the road's price (its summon price). Bound seats
   *  only; this seat's eyes only, as the company is. */
  reinforcements?: { awakenedId: number; name: string; art: string | null; power: number; cost: number }[];
  reinforcementsSig?: string;
  reinforcementsAt?: number;
  /** This seat was dealt the instance host's staged company
   *  alone (Station 4) — the one standing exception to the
   *  law that a bound seat summons only its party. */
  stagedDeal?: boolean;
}

/** An Awoken standing on the field. The card rides inside it whole,
 *  so a recall returns exactly what was cast. */
interface FieldUnit {
  hex: string;
  pos: Pt;
  target: Pt | null;
  speedPx?: number;
  card: TableCard;
  hp: number;
  maxHp: number;
  /** FATE: the shield — the sum of the parts (shieldPoolFor),
   *  rolled at the summoning. Mitigated harm burns it before HP. */
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
  /** FOLLOW (Nigel, 2026-10-19): the standing order to trail
   *  one's Tender — when the Tender arrives anywhere, a
   *  following Awokin not already at their side musters to a
   *  formation slot around them. The rest hold their ground. */
  follow?: boolean;
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
  /** ELEMENT POINTS RESTING ON THE TILE (Nigel, 2026-10-20:
   *  "make the attune ability add element points to a hex
   *  tile"). The tile's ledger of attunement: every Attune
   *  spend lays one point of the spent element here, and the
   *  tile HOLDS the element with the most points resting on
   *  it; a tie leaves the standing element as it is — the
   *  homeland's tie habit (its trays hold on a tie too).
   *  Purification is born BARE of points: a turned tile's
   *  element is the turning light's by birthright until
   *  points are laid on it, so the first spend claims any
   *  purified tile, and ground a Tender has deepened takes
   *  out-laying, point for point. Only the five pool
   *  elements ever rest here. */
  points: Record<string, number>;
  /** The fractional accrual beneath the resting points:
   *  an Awokin STANDING on this tile lays its own element
   *  onto it slowly (settleStandingAttunement), and the
   *  fractions gather here until they whole into points.
   *  Server-kept only — the room serves the whole points
   *  (tile.points), never the gathering. Born bare with
   *  the tile, and bared again when the tile turns. */
  attuneAcc?: Record<string, number>;
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
  pos: Pt;
  target: Pt | null;
  lastTile?: string;
  kind: string;
  label: string;
  art: string | null;
  power: number;
  hp: number;
  maxHp: number;
  /** FATE: the dark thing's AC — base 10 + its kind's bonus
   *  (Enemy AC, Nigel 2026-10-22), with the wave/column
   *  scaling riding on top at spawn. It is the target of
   *  every to-hit roll against it AND the armor term in
   *  Diablo's equation when blows land: one number, both
   *  offices, the hit declared first and the damage
   *  calculated by the ratio after. */
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
  kind: "ward" | "rune" | "grove" | "spell";
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
   *  measure); its `pour` below is the count of its page's
   *  filled SLOTS in the cast's element, read off the
   *  Grimoire at the cast (Nigel, 2026-10-21 — the field
   *  keeps the name it was born with; the slots are what it
   *  counts now) — both snapshotted at the cast. */
  maxHp: number;
  /** The curse's accrued wither (2026-10-20): fractional
   *  attrition against the working's body — its health, or
   *  its charges where the book gives it no health — not yet
   *  eaten whole. */
  wither?: number;
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
  /** GROVES (the Springleaf, Phase C): a grove working carries
   *  its centre in pixels, its radius, its expiry, its sapling
   *  schedule (due times + pre-rolled rooting points), its last
   *  mend beat, and whether it is the mother grove of its cast. */
  pos?: Pt | null;
  radiusPx?: number;
  expiresAt?: number;
  saplingDue?: number[];
  saplingPos?: Pt[];
  lastMend?: number;
  mother?: boolean;
  /** PASSIVE WALLS (Phase C): the unit key sustaining a passive
   *  ward — when that unit no longer stands on one of the
   *  ward's two hexes, the wall comes down. */
  sustainer?: string;
  /** THE NEW WORKINGS (Nigel, 2026-10-22; seated 2026-10-23):
   *  Bats, the Hold Rune and Rune Shatter's held stream are
   *  living effects with clocks of their own, reckoned by
   *  processTransientWorkings on the room's tick — the swarm's
   *  birth and next bite and its quarry, the rune's cast
   *  moment and the strike that begins its hold, the stream's
   *  next piece and next charge and its end. */
  /** BULWARK (Nigel, 2026-10-23 — Recovery R12): the line
   *  of shields itself — free points on the field, each
   *  with its own wounds, raised across the cast's aim.
   *  The working's own hp/maxHp above carry the line's
   *  TOTAL (for the view); the shields' HP is the body
   *  the battle reckons, node by node. */
  shields?: { x: number; y: number; hp: number; maxHp: number }[];
  bornAt?: number;
  nextBiteAt?: number;
  bites?: number;
  targetId?: string | null;
  heading?: number;
  struckAt?: number | null;
  holdUntil?: number;
  streamUntil?: number;
  nextPieceAt?: number;
  nextChargeAt?: number;
}

/* The dark's body: power and hp. Its AC is NOT a stat
 * here — it is read live off the kind's workshop record
 * (enemyACFor in enemyAC.ts: base 10 + the recorded AC
 * bonus), so a workshop edit moves the referee's target. */
export const ENEMY_STATS: Record<string, { power: number; hp: number }> = {
  fray: { power: 1, hp: 3 },
  unraveler: { power: 4, hp: 6 },
  hollow: { power: 0, hp: 5 },
  tangle: { power: 3, hp: 8 },
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
/** CONTINUOUS GEOMETRY (Phase B, ported from client/src/Table.tsx:240-298):
 *  the same iso basis the client draws by, so a pixel means the
 *  same ground on both sides of the wire. */
const ISO_E: [number, number] = [1292, 470];
const ISO_SE: [number, number] = [0, 948];
const ISO_DEN = 796;
const TILE_SIZE = 40;
function isoOffset(q: number, r: number, size: number): { px: number; py: number } {
  const k = size / ISO_DEN;
  const u: [number, number] = [ISO_E[0] * k, ISO_E[1] * k];
  const v: [number, number] = [ISO_SE[0] * k, ISO_SE[1] * k];
  return { px: q * u[0] + r * v[0], py: q * u[1] + r * v[1] };
}
type Pt = { x: number; y: number };
/** One stable centre per tile — WITHOUT the client's 5px tray lift. */
const TILE_CENTERS: Map<string, { x: number; y: number }> = new Map(TILE_DEFS.map(t => {
  const { px, py } = isoOffset(t.q, t.r, TILE_SIZE);
  return [t.id, { x: px, y: py }] as [string, { x: number; y: number }];
}));
function distPx(a: Pt, b: Pt): number { return Math.hypot(a.x - b.x, a.y - b.y); }
function nearestTileId(pos: Pt): string {
  let best = SEED_TILE;
  let bestD = Infinity;
  for (const [id, c] of TILE_CENTERS) {
    const d = distPx(pos, c);
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}
function roundPos(p: Pt): Pt { return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }; }
const STANDABLE_TILES = TILE_DEFS.filter(t => t.id !== SEED_TILE).map(t => t.id);
/** How many of the light may share one tile — the March law's
 *  destination capacity, carried to the Table (design §2). */
const STACK_CAP = 4;
/** A cursed tile's corruption, by its ring from the seed —
 *  the land's own curse law (4 + 6 × ring). */
function curseHpForRing(ring: number): number { return 4 + 6 * ring; }

/** CURSE ATTRITION (Nigel, 2026-10-19): the curse no longer
 *  answers blow for blow — the thorns are gone, on the Table
 *  and on the land alike. What the curse does now is WITHER
 *  whatever stands in it: a share of the stander's greatest
 *  health per beat, growing ring by ring — ring 1 takes 2%,
 *  and +1% for every ring deeper. Great bodies bleed great
 *  numbers and small ones small, and everything bleeds more
 *  slowly than the old flat burn bit. */
function curseAttritionPct(ring: number): number { return 0.01 * (Math.max(0, ring) + 1); }
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
  /** THE PREPARED BASTION (Station 4, Nigel 2026-10-20): a
   *  bastion standing on the column's target seed when the
   *  column ARRIVED lends the host and his Awokin +3 AC
   *  against this enemy. Settled at claim from the land's
   *  own ledger: arrival corrupts an unheld seed on the
   *  spot, so a seed still held when the call is claimed
   *  was held — bastion and all — before the enemy landed. */
  prepared: boolean;
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
  from: Pt;
  to: Pt;
  element: string | null;
  side: "light" | "dark";
  hit: boolean;
  killed: boolean;
  weapon?: string | null;
  pierce?: boolean;
  /** Struck by a Manifest copy, not the true weapon. */
  copy?: boolean;
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
  /** THE STORYTELLER'S SEAT (Campaign Build 1, Nigel,
   *  2026-10-21): the seat stands UNCLAIMED until a seated
   *  participant claims it in the room — never at the door.
   *  The holder's seat key; null is unclaimed. When the
   *  holder's held seat lapses past the away grace, the
   *  seat returns to unclaimed here. */
  storytellerKey: string | null;
  /** Seat keys the storyteller has granted the panel to —
   *  the holder's to give and to take back. The grants fall
   *  when the seat itself falls vacant. */
  panelAccess: string[];
}

/** MANIFEST (Phase C): copies of a Tender's wielded weapon,
 *  lent by the light for twenty seconds. Each copy is its own
 *  strike source, anchored at its Tender's position, striking
 *  on the true weapon's cadence — `nexts` holds each copy's
 *  next strike moment, first strikes staggered ~200ms apart. */
interface ManifestSet {
  ownerKey: string;
  weaponKey: string;
  count: number;
  expiresAt: number;
  nexts: number[];
}

interface Room {
  id: string;
  /** Live Manifest sets, by the room — they fade at expiry
   *  (in the tick) and die at once when their Tender wields
   *  another weapon. */
  manifests: ManifestSet[];
  /** "campaign" rooms (id begins "campaign") run Phase B;
   *  every other room is the casual Table, unchanged. */
  mode: "casual" | "campaign";
  campaign: CampaignState | null;
  bastion: BastionState | null;
  strikes: Strike[];
  players: Map<WebSocket, Player>;
  /** Seats held for Tenders who stepped away (connection
   *  dropped): keyed by the seat's own key, with the moment
   *  they stepped away. A held seat keeps its company, energy,
   *  standing and landing whole until it is reclaimed or the
   *  grace lapses. */
  away: Map<string, { player: Player; leftAt: number }>;
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
  integrateAt?: number;
  driftTimer?: ReturnType<typeof setInterval> | null;
  /** THE ROOM'S STANDING PULSE (2026-10-20): every room's
   *  heartbeat for the curse's out-of-battle law, and the
   *  stamp its withering was last reckoned from. */
  pulseTimer?: ReturnType<typeof setInterval> | null;
  witherAt?: number;
  assaultToldAt?: number;
  roundNo: number;
  /** Lore Warden: edges where a ward has FALLEN this sitting
   *  — the next ward raised on one stands written stronger. */
  writtenEdges?: Set<string>;
  prevWardEdges?: Set<string>;
  /** Lore Binder: bindings scheduled to echo a round later. */
  pendingEchoes?: { hex: string; pin: number; due: number }[];
  /** SHARD RAIN FALLS (Phase C): the rain's fall is an event,
   *  not a standing working — the moment the sky opens over
   *  covered hexes, so clients can show the drawn rain there. */
  rainFalls?: { id: string; at: number; hexes: string[] }[];
  /** THE SINGLE BLADE'S FLIGHTS (Nigel, 2026-10-20; re-ruled
   *  2026-10-23 — Recovery R4): a loosed Blade is an event,
   *  like the rain's fall — the rune's hex and the mark's
   *  standing point at the loose, so clients can fly the
   *  blades up from the writing and spear them down. */
  bladeFlights?: { id: string; at: number; fromHex: string; to: Pt }[];
  /** PASSIVE WALLS (Phase C): when a passive ward on an edge
   *  is broken, the moment it may re-raise (edge|owner → at). */
  passiveRearm?: Map<string, number>;
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
// ENEMY AC (Nigel, 2026-10-22): a dark thing's armor IS
// its AC — base 10 + its kind's AC bonus, read off its
// workshop record (enemyACFor) — so the equation's armor
// term for the dark is the full AC the hit was declared
// against: one number serves both, hit first, ratio after.
// What survives burns the Awoken's SHIELD first: the sum
// of its parts — each part rolling its own element's die —
// rolled when it is summoned (shieldPoolFor, below); overflow
// wounds. A natural 20 always hits and rolls its harm dice
// twice; a natural 1 always misses. The Written Light is
// not a blow: workings' harm ignores AC and armor alike,
// as spell harm always has. Skills, spells, and runes that
// ADD to AC are named for the future — the hooks live in
// acOf() below, returning 0 until content fills them.
export const FATE_DIE: Record<string, number> = { sky: 4, root: 6, tide: 8, stone: 12, fire: 10, neutral: 6, unaligned: 6, dark: 6 };
const ELEMENT_HIT_BONUS: Record<string, number> = { stone: 1, root: 2, tide: 3, sky: 4, fire: 5 };
/** ELEMENT REACH (Phase B): how many hexes (×69px) an element's
 *  light strikes across the continuous field. */
export const ELEMENT_REACH: Record<string, number> = { stone: 1, root: 2, fire: 2, tide: 3, sky: 4 };
/** THE RUNIC WEAPON (Phase A2, striking from Phase B): its die,
 *  its reach in hexes, its cadence, and the AC it lends a bare
 *  Tender, by wielded key. The key is read LIVE at strike time. */
export const WEAPON_DIE: Record<string, number> = { swordshield: 6, sword: 10, spear: 6, arrow: 4 };
export const WEAPON_RANGE_HEX: Record<string, number> = { swordshield: 1, sword: 1, spear: 2, arrow: 4 };
export const WEAPON_COOLDOWN_MS: Record<string, number> = { swordshield: 1000, sword: 1100, spear: 1050, arrow: 1400 };
const WEAPON_AC: Record<string, number> = { swordshield: 3, sword: 1, spear: 0, arrow: 0 };
const WEAPON_KEYS = ["swordshield", "sword", "spear", "arrow"];
/** One weapon's contract standing (Phase C), as the menu
 *  stream files it: tender_weapons rows carry level,
 *  attunement_element, attunement_depth and the two node
 *  columns (manifest_node, signature_node); the progress
 *  view's arsenal entries mirror them as
 *  { level, element, depth, manifest, signature }. */
export interface WeaponContract { level: number; element: string | null; depth: number; manifest: boolean; signature: boolean; }
function defaultWeaponContract(): WeaponContract {
  return { level: 1, element: null, depth: 0, manifest: false, signature: false };
}
/** Read a weapon's contract FRESH, tolerating the contract
 *  columns/view fields being absent until the menu stream's
 *  build lands: the arsenal view first (when it carries the
 *  nodes), then the row itself for whatever columns stand. */
async function weaponContractFor(expKey: string | null, weaponKey: string | null): Promise<WeaponContract> {
  const c = defaultWeaponContract();
  if (!expKey || !weaponKey) return c;
  try {
    const progress = await getTenderProgress(expKey).catch(() => null) as any;
    const entry = progress?.arsenal?.find((w: any) => w.key === weaponKey);
    if (entry) {
      if (typeof entry.level === "number") c.level = entry.level;
      c.element = entry.element ?? null;
      if (typeof entry.depth === "number") c.depth = entry.depth;
      if (typeof entry.manifest === "boolean") c.manifest = entry.manifest;
      if (typeof entry.signature === "boolean") c.signature = entry.signature;
    }
  } catch { /* the contract is a reading; never let it break the room */ }
  try {
    const row = sqlite.prepare("SELECT * FROM tender_weapons WHERE owner_key = ? AND weapon_key = ?")
      .get(expKey, weaponKey) as any;
    if (row) {
      if (typeof row.level === "number") c.level = row.level;
      if ("attunement_element" in row) c.element = row.attunement_element ?? null;
      if (typeof row.attunement_depth === "number") c.depth = row.attunement_depth;
      if ("manifest_node" in row) c.manifest = !!row.manifest_node;
      if ("signature_node" in row) c.signature = !!row.signature_node;
    }
  } catch { /* as above */ }
  return c;
}
function applyWeaponContract(p: Player, c: WeaponContract): void {
  p.weaponLevel = c.level;
  p.weaponElement = c.element;
  p.weaponDepth = c.depth;
  p.weaponManifest = c.manifest;
  p.weaponSignature = c.signature;
}
/** The wielded weapon's reach in hexes (Phase C referee law):
 *  its base reach, or — once attuned (depth ≥ 1, an element
 *  set) — its ELEMENT's reach instead. The spear's Signature
 *  (LONGSHAFT) adds one hex on top of whichever applies. */
function weaponRangeHexOf(p: Player): number {
  const wk = p.weaponKey ?? "";
  let range = WEAPON_RANGE_HEX[wk] ?? 0;
  if ((p.weaponDepth ?? 0) >= 1 && p.weaponElement && ELEMENT_REACH[p.weaponElement] != null) {
    range = ELEMENT_REACH[p.weaponElement];
  }
  if (wk === "spear" && p.weaponSignature) range += 1;
  return range;
}
/** The wielded weapon's harm roll (Phase C): its die, plus a
 *  point per level past the first, plus the sword Signature's
 *  KEEN edge (+2) — all before Fate's mitigation. */
function weaponDamageOf(p: Player, wk: string): number {
  return dN(WEAPON_DIE[wk])
    + Math.max(0, (p.weaponLevel ?? 1) - 1)
    + (wk === "sword" && p.weaponSignature ? 2 : 0);
}
/** A wield-switch (or a fade) dismisses a Tender's live
 *  Manifest copies at once. */
function dismissManifests(room: Room, ownerKey: string): void {
  if (room.manifests) room.manifests = room.manifests.filter(m => m.ownerKey !== ownerKey);
}
/** The dark's AC under the default workshop record — base
 *  10 + each kind's bonus (Enemy AC, Nigel 2026-10-22).
 *  Spawns read the live record through enemyACFor; this
 *  table is the fallback for a roster entry that carries
 *  no armor of its own. */
export const DARK_ARMOR: Record<string, number> = Object.fromEntries(
  Object.entries(ENEMY_ARMOR_DEFAULTS).map(([k, v]) => [k, ENEMY_AC_BASE + v]),
);
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
/** THE SHIELD POOL (the shield law, Nigel 2026-10-22 — the
 *  homeland's rollShieldFor in actions.ts, mirrored exactly
 *  so both grounds reckon identically): an Awoken's shield
 *  pool is the SUM of its parts — EVERY layer of its payload
 *  rolls ONE die of its own element (Sky d4 · Root d6 · Tide
 *  d8 · Fire d10 · Stone d12; an unfiled layer is neutral,
 *  d6), aspect layers counted like any other part, and no
 *  layer's power or toughness feeds the roll: one layer, one
 *  die. Rolled at the summoning, when the Awoken takes the
 *  field; the pool burns before HP, as it always has. A card
 *  with no shieldParts at all never came from a payload —
 *  it is a stand-in (the TEST_POOL company an unbound seat
 *  brings, built at the join with synthetic strike parts but
 *  no real layers) — and for those the fallback preserves
 *  the old reading whole: toughness × one die of the card's
 *  single element. Exported so a proof can read the reckoning
 *  directly, as castModFor is read. */
export function shieldPoolFor(card: TableCard): number {
  if (card.shieldParts) {
    let pool = 0;
    for (const layer of card.shieldParts) pool += dN(FATE_DIE[layer.element ?? "neutral"] ?? 6);
    return pool;
  }
  return card.toughness * dN(FATE_DIE[card.element] ?? 6);
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

// ── THE CASTING LAW AT THE TABLE (Phase C; the book's law,
// grimoire.ts): each class owns a school — Warden the Ward,
// Runewright the Rune, Binder the Binding, Witch the Spell
// school itself. A cast IN the caster's school takes +2 plus
// the level ladder (fateLevelBonus: +1 at Lv 3, 6, 9…). The
// Spell school stands OPEN: any other tender casts it at ±0.
// Cross-class on the closed schools (ward / rune / binding)
// takes −3. The SAGE owns no school: −2 on EVERY cast, spells
// included (softened from −3 by Nigel's ruling, 2026-10-20). Classless and unknown classes stand as no school
// (spell ±0, closed schools −3). Every cast ROLLS: d20 + mod
// against DC = the spell's level (numbers.level, default 1)
// + 10. A natural 20 always stands; a natural 1 always
// unravels — the Keeper's manners, as Fate keeps them.
const CLASS_SCHOOL: Record<string, string | null> = {
  warden: "ward", runewright: "rune", binder: "binding", witch: "spell", sage: null,
};
/** The casting modifier, by class and school — the whole
 *  of the Casting Law's arithmetic in one pure place, so a
 *  proof can read the table directly (test56) instead of
 *  sampling dice for a one-pip truth. The Sage's line is
 *  Nigel's buff (2026-10-20): −2 on EVERY cast, where −3
 *  stood before — she is not so weak a caster. */
export function castModFor(classKey: string | null | undefined, tenderLevel: number, school: string): number {
  if (classKey === "sage") return -2;
  if (classKey && CLASS_SCHOOL[classKey] === school) return 2 + fateLevelBonus(tenderLevel);
  if (school === "spell") return 0;
  return -3;
}
/** THE CURSE TERM (Nigel, 2026-10-21 16:26): "tenders can
 *  summon in the cursed lands but they suffer a −3 to cast
 *  from the attrition. that applies to all casts." EVERY cast
 *  a tender makes at the Table while STANDING ON A CURSED
 *  TILE takes −3 — the summon cast and every Grimoire
 *  working alike. One shared term, sourced from the caster's
 *  standing tile at the moment of the cast, folded into the
 *  Table's cast reckonings ONLY — it lives here, never in
 *  castModFor, so it cannot leak into the homeland's rolls. */
function curseCastTerm(room: Room, player: Player): number {
  if (!player.hex) return 0;
  return room.map.get(player.hex)?.cursed ? -3 : 0;
}
/** A signed term in plain words, for the tale: +3, −2, +0. */
function signedTerm(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : `+${n}`;
}
function rollCast(room: Room, player: Player, def: { kind: string; name: string; numbers?: Record<string, number> }): { ok: boolean; roll: number; mod: number; dc: number; curse: number } {
  const school = def.kind;
  const curse = curseCastTerm(room, player);
  const mod = castModFor(player.classKey, player.tenderLevel, school) + curse;
  const dc = (def.numbers?.level ?? 1) + 10;
  const roll = dN(20);
  const ok = roll === 20 || (roll !== 1 && roll + mod >= dc);
  return { ok, roll, mod, dc, curse };
}
/** THE WITCH'S MISCAST MERCY AT THE TABLE (Nigel,
 *  2026-10-22; Recovery R8): a Witch whose cast unravels
 *  here is refunded the mercy's share of what the cast
 *  actually charged — witchMiscastRefundFor (skills.ts) is
 *  the one reckoning, read by the homeland too. The refund
 *  returns to the purse the charge was taken from: the
 *  campaign bank in a seeded campaign, the seat's own
 *  energy otherwise, or the bastion's one pool when the
 *  summon cast drew on it (fromBastionPool). Like every
 *  refund here it is uncapped, for it can never lift a
 *  purse above what it held before the cast. Returns the
 *  amount refunded (0 for every other class). */
function refundTableFizzle(room: Room, player: Player, paid: number, fromBastionPool = false): number {
  const refunded = witchMiscastRefundFor(player.classKey, paid);
  if (refunded <= 0) return 0;
  if (fromBastionPool && room.bastion) room.bastion.pool += refunded;
  else if (room.campaign && !room.campaign.over && room.campaign.seeded) room.campaign.bank += refunded;
  else player.energy += refunded;
  return refunded;
}

/** A fizzled cast (the Casting Law): the energy is already
 *  spent — the working simply does not happen. The tale names
 *  the unravel AND its reckoning, and the caster's gesture
 *  still plays. `paid` is what the cast actually charged
 *  (after every price reckoning that applied): a Witch's
 *  unravel refunds her mercy's share of it at once, and the
 *  tale names the return, so what she sees is what she got. */
function castUnravels(room: Room, player: Player, spellName: string, reck?: { roll: number; mod: number; dc: number; curse: number }, paid?: number): void {
  player.castAt = Date.now();
  const refunded = paid != null ? refundTableFizzle(room, player, paid) : 0;
  const mercy = refunded > 0 ? ` The Witch's mercy returns ✦${refunded} of the spent energy.` : "";
  tell(room, (reck
    ? `${player.name}'s ${spellName} unravels — rolled ${reck.roll} ${signedTerm(reck.mod)} against DC ${reck.dc}${reck.curse ? " (the curse presses −3)" : ""}: the roll falls short.`
    : `${player.name}'s ${spellName} unravels — the roll falls short.`) + mercy);
}
/** THE SUMMON CAST'S GIFT (Nigel, 2026-10-21 16:26; the
 *  Keeper's pencil, proceeding unstruck): summoning is not
 *  a Grimoire page, so the casting law's SCHOOL terms do not
 *  ride it — no in-school +2, no cross-school −3, no level
 *  ladder. What remains of the gift is the class truth that
 *  was never a school term: the Sage's −2 on EVERY cast. The
 *  rest of the summon reckoning — the summoner's power and
 *  the curse's −3 — is named at the cast road itself. */
function summonGiftFor(player: Player): number {
  return player.classKey === "sage" ? -2 : 0;
}
/** Is this seat a seated Sage? (Her company stands taller —
 *  keyed per-owner, so two sages in a room bless only their
 *  own companies.) */
function ownerIsSage(room: Room, ownerKey: string): boolean {
  return seatByKey(room, ownerKey)?.classKey === "sage";
}

/** AN AWOKIN'S ARMOR CLASS AT THE TABLE (the Company
 *  Bonuses, Nigel 2026-10-22 12:27; coded in 2026-10-23,
 *  Recovery R7): its toughness, plus acBonusOf's standing
 *  term, plus its Tender's COMPANY AC (companyAcBonusFor —
 *  the Warden's +4, the Sage's +2), plus the prepared
 *  bastion's +3 for the host's own Awokin behind walls
 *  raised in time. One reckoning, read by the dark's blow
 *  whole; exported so a proof can read it directly, as
 *  castModFor and shieldPoolFor are read. Fate's MITIGATION
 *  of a landed blow reads the same company term without
 *  the bastion's walls (the walls turn blows aside at the
 *  roll; they are not the Awokin's own hide) — see blowOnce. */
export function awokinAcFor(room: Room, victim: FieldUnit): number {
  return victim.card.toughness + acBonusOf(victim)
    + companyAcBonusFor(seatByKey(room, victim.ownerKey)?.classKey)
    + (room.bastion?.prepared && seatByKey(room, victim.ownerKey)?.expKey === room.bastion.hostKey ? 3 : 0);
}

/** THE WITCH'S COMPANY PRICE (Nigel, 2026-10-22 12:27;
 *  Recovery R7): "party members she has cast grant a
 *  half-energy bonus to her casting until they dissipate."
 *  At the Table every standing Awokin arrived by its
 *  owner's summon cast — placeUnit has no other caller —
 *  and the summon itself refuses any but party members for
 *  a bound seat, so a cast party member stands exactly
 *  when one of her Awokin stands whose card is of her
 *  party (an unbound seat's company counts whole, as its
 *  summon gate counts it). The price of every cast she
 *  makes — the summon cast and the Grimoire doors alike —
 *  reads through witchCastCostFor with that standing. */
function witchCompanyPrice(room: Room, player: Player, cost: number): number {
  if (player.classKey !== "witch") return cost;
  const standing = [...room.field.values()].some(u => u.ownerKey === player.key
    && (u.card.awokenId == null || !player.expKey || isPartyMember(player.expKey, u.card.awokenId)));
  return witchCastCostFor(player.classKey, cost, standing);
}

/** One roster creature's Table card, built from its payload
 *  — the single shaping of a roster creature's card, wherever
 *  the Table needs it. Its id is STABLE — "roster-" + the
 *  creature's ledger id — because the campaign recast ledger
 *  (recastCount / noteDissipation) keys a creature's returns
 *  by card id: a fresh random id per build would mint a new
 *  face each time and the recast price could never gather. */
function cardFromPayload(payload: NonNullable<Awaited<ReturnType<typeof awakenedPayloadById>>>): TableCard {
  return {
    id: `roster-${payload.id}`,
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
    // The shield's parts: the payload's layers WHOLE — no
    // category filter, payload order kept — so background
    // and aspect layers roll their dice beside body, arms,
    // head and aura, as the homeland's rollShieldFor reads
    // parseLayers' output (every layer it returns, one die
    // of the layer's own element apiece).
    shieldParts: ((payload.layers ?? []) as { element?: string | null }[])
      .map(l => ({ element: l.element ?? "neutral" })),
    layers: ((payload.layers ?? []) as { source_id?: string; category?: string; imageUrl?: string | null }[])
      .map(l => ({ source_id: l.source_id ?? "", category: l.category ?? "", imageUrl: l.imageUrl ?? null })),
  };
}

/** THE WHEEL'S COMPANY FOR A BOUND SEAT (Nigel, 2026-10-21
 *  16:26 — the wheel summoning law, replacing the deal this
 *  function used to be): the summonable set, in the party's
 *  own order — the wheel LISTS it, so nothing is shuffled.
 *  The exclusions are the deal's old honesty, kept whole:
 *  a member standing on the homeland field cannot also stand
 *  here (Nigel, 2026-10-18; champions and the housed court
 *  are NOT field placements and stay callable, as the
 *  Territory dock promises); a member staged at the bastion
 *  is kept back for the instance that carries it; a creature
 *  still re-coalescing from a fall is callable nowhere. The
 *  strict party law stands (Nigel, 2026-10-20; the strict
 *  reading 2026-10-21 12:11): the company is the party and
 *  ONLY the party — a Tender who keeps no party has an EMPTY
 *  company, nothing summonable, and fills a spot from the
 *  Zodiac's deck screen (the fill lands at once now; the
 *  wheel's cast is the only gate). An instance's staged
 *  company (stagedOnly) stands apart, as its own exception.
 *  Members currently FIELDED at this Table are set aside by
 *  the caller — the company is who can still be called. */
export async function companyForTender(tenderId: number, opts?: { stagedOnly?: boolean }): Promise<TableCard[]> {
  const ownerKey = tenderOwnerKey(tenderId);
  const placedRows = await db.select().from(schema.fieldPlacements)
    .where(eq(schema.fieldPlacements.ownerKey, ownerKey)).catch(() => [] as { awakenedId: number }[]);
  const placedIds = new Set(placedRows.map(r => r.awakenedId));
  const stagedAll = stagedIdsFor(ownerKey);
  const stagedSet = new Set(stagedAll);
  const nowMs = Date.now();
  const ids: number[] = opts?.stagedOnly ? stagedAll : partyIdsFor(ownerKey);
  const cards: TableCard[] = [];
  for (const id of ids.slice(0, 120)) {
    if (placedIds.has(id)) continue;
    if (!opts?.stagedOnly && stagedSet.has(id)) continue;
    const row = sqlite.prepare("SELECT dispersed_until FROM awakened WHERE id = ?").get(id) as { dispersed_until: number | null } | undefined;
    if (row?.dispersed_until && row.dispersed_until > nowMs) continue;
    const payload = await awakenedPayloadById(id).catch(() => null);
    if (!payload) continue;
    cards.push(cardFromPayload(payload));
  }
  return cards;
}

/** What a seat's company was built from, in one string: the
 *  summonable set's source (the party's ids, the staged set,
 *  or the stand-in pool) and which of it this seat currently
 *  has fielded. When the string turns, the company is stale. */
function companySignature(room: Room, player: Player): string {
  const fielded = [...room.field.values()]
    .filter(u => u.ownerKey === player.key)
    .map(u => u.card.awokenId ?? u.card.id)
    .sort()
    .join(",");
  const source = player.expKey
    ? player.stagedDeal
      ? `staged:${stagedIdsFor(player.expKey).join(",")}`
      : `party:${partyIdsFor(player.expKey).join(",")}`
    : "pool";
  return `${source}|fielded:${fielded}`;
}

/** Rebuild a seat's company from its source, the fielded set
 *  aside. Bound seats read the ledger (companyForTender);
 *  unbound seats set the fielded aside from the pool they
 *  brought. The signature is stamped at the end, so a send
 *  racing the build keeps the old company for one push and
 *  the next push carries the new. */
async function refreshCompany(room: Room, player: Player): Promise<void> {
  const sig = companySignature(room, player);
  const fieldedIds = new Set([...room.field.values()].filter(u => u.ownerKey === player.key).map(u => u.card.awokenId).filter((x): x is number => typeof x === "number"));
  const fieldedCardIds = new Set([...room.field.values()].filter(u => u.ownerKey === player.key).map(u => u.card.id));
  if (player.expKey) {
    const tenderId = Number(player.expKey.replace("tender:", "")) || 0;
    const full = tenderId ? await companyForTender(tenderId, player.stagedDeal ? { stagedOnly: true } : undefined).catch(() => [] as TableCard[]) : [];
    player.company = full.filter(cd => !(typeof cd.awokenId === "number" && fieldedIds.has(cd.awokenId)));
  } else if (player.companySource) {
    player.company = player.companySource.filter(cd => !fieldedCardIds.has(cd.id));
  }
  player.companySig = sig;
  player.companyAt = Date.now();
}

/** What a seat's reinforcement deck was built from, in
 *  one string: the Tender's whole roster (ids), the party,
 *  the roads in flight, and this seat's fielded — the deck
 *  is what falls out of that reckoning, so when any of it
 *  turns, the deck is stale. (Recovery R6.) */
function reinforcementsSignature(room: Room, player: Player): string {
  if (!player.expKey) return "none";
  const roster = (sqlite.prepare("SELECT id FROM awakened WHERE owner_key = ? ORDER BY id").all(player.expKey) as { id: number }[]).map(r => r.id).join(",");
  const party = partyIdsFor(player.expKey).join(",");
  const incoming = (player.incoming ?? []).map(i => i.awakenedId).join(",");
  const fielded = [...room.field.values()].filter(u => u.ownerKey === player.key).map(u => u.card.awokenId ?? "").join(",");
  return `${roster}|party:${party}|in:${incoming}|fielded:${fielded}`;
}

/** Rebuild a seat's reinforcement deck (Recovery R6): the
 *  Tender's owned Awoken the wheel can call in — the whole
 *  roster, minus the party (they ride the summon cast),
 *  minus the roads already in flight, minus what stands on
 *  this field, minus what a post keeps (the homeland field,
 *  the bastion's staging, a fall's re-coalescence — the
 *  company's own exclusions, mirrored from
 *  companyForTender). Each entry carries the road's
 *  price: its summon price, as the road always charged. */
async function refreshReinforcements(room: Room, player: Player): Promise<void> {
  const sig = reinforcementsSignature(room, player);
  player.reinforcementsSig = sig;
  player.reinforcementsAt = Date.now();
  if (!player.expKey) { player.reinforcements = []; return; }
  const expKey = player.expKey;
  const party = new Set(partyIdsFor(expKey));
  const incoming = new Set((player.incoming ?? []).map(i => i.awakenedId));
  const fielded = new Set([...room.field.values()].filter(u => u.ownerKey === player.key).map(u => u.card.awokenId).filter((x): x is number => typeof x === "number"));
  const placed = new Set((sqlite.prepare("SELECT awakened_id AS id FROM field_placements WHERE owner_key = ?").all(expKey) as { id: number }[]).map(r => r.id));
  const staged = new Set(stagedIdsFor(expKey));
  const rows = sqlite.prepare("SELECT id, dispersed_until FROM awakened WHERE owner_key = ? ORDER BY id").all(expKey) as { id: number; dispersed_until: number | null }[];
  const now = Date.now();
  const out: NonNullable<Player["reinforcements"]> = [];
  for (const row of rows) {
    if (party.has(row.id) || incoming.has(row.id) || fielded.has(row.id)) continue;
    if (placed.has(row.id) || staged.has(row.id)) continue;
    if (row.dispersed_until && row.dispersed_until > now) continue;
    const payload = await awakenedPayloadById(row.id).catch(() => null);
    if (!payload) continue;
    out.push({
      awakenedId: row.id,
      name: payload.name ?? "An Awokin",
      art: payload.image_url ?? null,
      power: payload.power ?? 1,
      cost: Math.max(1, payload.power ?? 1),
    });
  }
  player.reinforcements = out;
}

/** sendState's freshness watch: a company whose signature
 *  turned, or whose build is a few seconds old (a member's
 *  re-coalescence can end without any signature moving), is
 *  rebuilt in the background; the completed build pushes a
 *  fresh state of its own, so no caller waits on the ledger.
 *  The reinforcement deck rides the same watch (Recovery
 *  R6): its signature is the whole roster against the party,
 *  the roads and the field. */
function maybeRefreshCompany(room: Room, player: Player): void {
  if (player.watcher) return;
  const stale = player.companySig !== companySignature(room, player)
    || (player.companyAt ?? 0) < Date.now() - 10_000;
  const reinfStale = !!player.expKey
    && (player.reinforcementsSig !== reinforcementsSignature(room, player)
      || (player.reinforcementsAt ?? 0) < Date.now() - 10_000);
  if (!stale && !reinfStale) return;
  // Stamp the attempt now so a slow build is not started
  // again by the very next push; refreshCompany re-stamps
  // both marks when it lands.
  if (stale) {
    player.companySig = companySignature(room, player);
    player.companyAt = Date.now();
    void refreshCompany(room, player).then(() => sendState(room)).catch(() => {});
  }
  if (reinfStale) {
    player.reinforcementsSig = reinforcementsSignature(room, player);
    player.reinforcementsAt = Date.now();
    void refreshReinforcements(room, player).then(() => sendState(room)).catch(() => {});
  }
}

/** The company this Tender can NOT call, with where each
 *  one stands instead — the honest margin (the Table Fix
 *  Pass, 2026-10-20). The summoning law stands untouched
 *  (companyForTender above): a body standing on the homeland
 *  field, or staged at the bastion, cannot also be called
 *  here. What changes is only that the absence is NAMED —
 *  every roster member kept back for place comes back with
 *  its whereabouts, for the client's satchel to show beside
 *  the wheel's company. (The Keeper's reading: the silence
 *  was the defect, not the law.) An instance host is dealt
 *  the staged company itself, so for his company the staged
 *  are callable, not elsewhere; the fielded are out of every
 *  company. */
export async function elsewhereForTender(tenderId: number, opts?: { stagedOnly?: boolean }): Promise<{ name: string; element: string; where: "fielded" | "staged" }[]> {
  const ownerKey = tenderOwnerKey(tenderId);
  const placedRows = await db.select().from(schema.fieldPlacements)
    .where(eq(schema.fieldPlacements.ownerKey, ownerKey)).catch(() => [] as { awakenedId: number }[]);
  const placedIds = new Set(placedRows.map(r => r.awakenedId));
  const stagedIds = new Set(stagedIdsFor(ownerKey));
  const rows = await db.select().from(schema.awakened)
    .where(eq(schema.awakened.ownerKey, ownerKey));
  const out: { name: string; element: string; where: "fielded" | "staged" }[] = [];
  for (const row of rows) {
    const fielded = placedIds.has(row.id);
    const staged = stagedIds.has(row.id);
    if (!fielded && !staged) continue;
    if (!fielded && opts?.stagedOnly) continue;
    const payload = await awakenedPayloadById(row.id).catch(() => null);
    out.push({
      name: payload?.name ?? "An Awokin",
      element: payload ? dominantElement(payload.layers as { element?: string | null }[]) : "neutral",
      where: fielded ? "fielded" : "staged",
    });
  }
  return out;
}

/** ── THE PARTY AT THE TABLE (build 2, 2026-10-21; the
 *  wheel build, 2026-10-21) ───────────────────────────────
 *  The company above reads the membership ledger; what
 *  follows is the rest of the party's meeting with the
 *  Table: the seat's own party display, the calling of
 *  reinforcements (the road re-ruled by Nigel, 2026-10-23 —
 *  Recovery R6, below) and their settling, and the
 *  battle-end law. Membership itself lives in
 *  server/src/party.ts; these are its Table roads only. */

/** Every seat a room holds, live and held (away) alike. */
function allSeats(room: Room): Player[] {
  return [...room.players.values(), ...[...room.away.values()].map(h => h.player)];
}

export interface PartySeatView {
  cap: number;
  /** A member's standing for this Table: "field" — standing
   *  on it; "ready" — in the wheel's company, callable by
   *  the summon cast (the state the retired hand's name used
   *  to carry, translated by the wheel law: party members
   *  not currently fielded); "post" — keeping a post the
   *  company could not bring. */
  members: { awakenedId: number; name: string; standing: "field" | "ready" | "post" }[];
  /** Open spots after the members and any reinforcements
   *  still on the road. */
  openSpots: number;
  /** Who is on the road to this party, and when each
   *  arrives (Recovery R6: roads start again at the wheel
   *  when no bastion plays; with a bastion, and between
   *  battles, a fill lands at once and no road stands). */
  incoming: { awakenedId: number; name: string; arrivesAt: number; cost: number }[];
}

/** The seat's party as its own display reads it: who stands
 *  in the party and where each member stands for this Table
 *  (on the field, ready at the wheel, or keeping a post the
 *  company could not bring — the homeland field, the
 *  bastion, a re-coalescence), what spots stand open, and
 *  who is still on the road to the party. Choosing a
 *  member is the Zodiac deck screen's work, and calling a
 *  reinforcement is the wheel's — not this display's. */
function partySeatView(room: Room, player: Player): PartySeatView | null {
  const expKey = player.expKey;
  if (!expKey) return null;
  const nameOf = (id: number): string => {
    const row = sqlite.prepare("SELECT name FROM awakened WHERE id = ?").get(id) as { name: string } | undefined;
    return row?.name ?? "An Awokin";
  };
  const ids = partyIdsFor(expKey);
  const inCompany = new Set((player.company ?? []).map(c => c.awokenId).filter((x): x is number => typeof x === "number"));
  const onField = new Set([...room.field.values()].filter(u => u.ownerKey === player.key).map(u => u.card.awokenId).filter((x): x is number => typeof x === "number"));
  const members = ids.map(id => ({
    awakenedId: id,
    name: nameOf(id),
    standing: (onField.has(id) ? "field" : inCompany.has(id) ? "ready" : "post") as "field" | "ready" | "post",
  }));
  const incoming = (player.incoming ?? []).map(i => ({ awakenedId: i.awakenedId, name: i.name, arrivesAt: i.arrivesAt, cost: i.cost }));
  const cap = partyCapFor(expKey, player.tenderLevel);
  return { cap, members, openSpots: Math.max(0, cap - ids.length - incoming.length), incoming };
}

/** Return a closed road's price to the purse it was charged
 *  from — the seat's own energy, or the campaign bank in a
 *  seeded campaign. A road that LANDS keeps its price spent;
 *  only a road that never lands is refunded, and refunded
 *  whole (the Keeper's pencil, 2026-10-21). */
function refundReinforcement(room: Room, player: Player, inc: { cost: number; fromBank: boolean }): void {
  if (inc.fromBank && room.campaign) room.campaign.bank += inc.cost;
  else player.energy += inc.cost;
}

/** DOES A BASTION PLAY AT THIS TABLE? (Recovery R6): the
 *  room carries a claimed bastion battle — begun or still
 *  gathering — or this seat itself was dealt the bastion's
 *  staged company. Either way the flying bastion is in play
 *  for this seat, and the companies law answers: the air
 *  drop is INSTANT, with no reinforcement time, and the
 *  dropped company does not count against party size beyond
 *  the membership itself — the join below is the plain
 *  at-once fill, charged nothing. */
function bastionPlays(room: Room, player: Player): boolean {
  return (!!room.bastion && !room.bastion.resolved) || !!player.stagedDeal;
}

/** CALL A REINFORCEMENT (Nigel, 2026-10-23 07:21–07:25 —
 *  the re-ruling; Recovery R6). HISTORY: the road was built
 *  2026-10-20 (build 2), retired by the wheel law of
 *  2026-10-21 16:26 — the Keeper's reading, flagged at that
 *  build's release — and Nigel re-ruled it on 2026-10-23:
 *  "the action wheel was meant to be able to set party
 *  members and call reinforcements" — on the homeland too;
 *  reinforcement travel time applies ONLY at the Table when
 *  NO bastion plays; with a bastion the air drop is instant;
 *  on the homeland reinforcements are instant. From play the
 *  same morning (2026-10-23 11:12): "i have 60 awoken in my
 *  deck that could be reinforcements but i see no way to
 *  access them." This is the door.
 *  THE DOOR: the wheel names a deck Awoken that is NOT in
 *  the party (party members ride the summon cast already)
 *  and calls it in. Where a bastion plays, it AIR-DROPS:
 *  membership lands at once, free, exactly as a fill lands.
 *  Where no bastion plays, it walks THE ROAD: its summon
 *  price is charged from the seat's purse at the choosing
 *  (the campaign bank in a seeded campaign), it rides
 *  `incoming[]` for REINFORCEMENT_MS, and settleReinforce-
 *  ments lands its membership when the road completes —
 *  the wheel's summon cast is then the gate to the field,
 *  and the price is paid twice over, as the road always
 *  said: once to call it, and its summon price again to
 *  summon it when it arrives. A battle's end closes the
 *  road and returns the price whole (endBattle). The party
 *  cap counts members and roads together, as it always did. */
async function startReinforcement(room: Room, player: Player, awakenedId: number): Promise<{ ok: boolean; reason?: string }> {
  const expKey = player.expKey;
  if (!expKey) return { ok: false, reason: "Only a bound Tender can call reinforcements — an unbound seat brings its stand-in company whole." };
  const row = sqlite.prepare("SELECT name, dispersed_until FROM awakened WHERE id = ? AND owner_key = ?").get(awakenedId, expKey) as { name: string; dispersed_until: number | null } | undefined;
  if (!row) return { ok: false, reason: "That Awoken is not in your deck." };
  const name = row.name ?? "An Awokin";
  if (row.dispersed_until && row.dispersed_until > Date.now()) {
    return { ok: false, reason: `${name} is still re-coalescing from a fall — it cannot answer a call yet.` };
  }
  if (isPartyMember(expKey, awakenedId)) {
    return { ok: false, reason: `${name} already stands in your party — the wheel's summon cast calls it to the field.` };
  }
  if ((player.incoming ?? []).some(i => i.awakenedId === awakenedId)) {
    return { ok: false, reason: `${name} is already on the road to your party.` };
  }
  if ([...room.field.values()].some(u => u.ownerKey === player.key && u.card.awokenId === awakenedId)) {
    return { ok: false, reason: `${name} already stands on this field.` };
  }
  if (partyIdsFor(expKey).length + (player.incoming ?? []).length >= partyCapFor(expKey, player.tenderLevel)) {
    return { ok: false, reason: "Your party is full — a reinforcement takes a party spot, as a member does." };
  }
  // THE AIR DROP: a bastion plays — the reinforcement lands
  // at once, no road, no road price (the companies law,
  // Nigel 2026-10-22: a company assigned to a flying bastion
  // air-drops anywhere with NO reinforcement time).
  if (bastionPlays(room, player)) {
    const r = tryAddPartyMember(expKey, awakenedId, player.tenderLevel);
    if (!r.ok) return { ok: false, reason: r.reason };
    tell(room, `🪂 ${name} air-drops to ${player.name}'s party — the bastion carries it, and it stands in the party at once, callable by the wheel's summon cast.`);
    return { ok: true };
  }
  // THE ROAD: no bastion plays, so the reinforcement walks —
  // and a road is walked only while a battle stands to
  // receive it (between battles, the Party tab's fill lands
  // at once and costs nothing, as it always has).
  if (!room.battle.active) {
    return { ok: false, reason: "Reinforcements are called while a battle stands — between battles, fill your party from the Party tab of your Zodiac, and it lands at once." };
  }
  const payload = await awakenedPayloadById(awakenedId).catch(() => null);
  if (!payload) return { ok: false, reason: `${name}'s face could not be read — the call cannot be made.` };
  const cost = Math.max(1, payload.power ?? 1);
  const fromBank = !!(room.campaign && !room.campaign.over && room.campaign.seeded);
  if (!chargePurse(room, player, cost)) {
    return { ok: false, reason: `Not enough energy — the road to ${name} costs ✦${cost}.` };
  }
  (player.incoming ??= []).push({ awakenedId, name, arrivesAt: Date.now() + REINFORCEMENT_MS, cost, fromBank });
  tell(room, `🚶 ${name} is called to ${player.name}'s party — ✦${cost} paid for the road. The road takes ${REINFORCEMENT_MINUTES} minute${REINFORCEMENT_MINUTES === 1 ? "" : "s"}, and it lands only while the battle stands. The price is paid twice over, as the road has always charged: ✦${cost} to call it, and its summon price again to summon it when it arrives.`);
  return { ok: true };
}

/** The seat of a Tender standing in a RUNNING battle at any
 *  Table, live or held — the Zodiac's bench door asks this
 *  before it returns a member to the deck, because a party
 *  standing in a running battle is not benched out from
 *  under it (build 2's pencil, untouched by the wheel law:
 *  its rationale was never the road — the party stands in
 *  the battle, and only an order to the creature itself ends
 *  its standing there). */
export function partyBattleSeatFor(ownerKey: string): { room: Room; player: Player } | null {
  for (const room of rooms.values()) {
    if (!room.battle.active) continue;
    for (const p of allSeats(room)) {
      if (p.expKey === ownerKey && !p.watcher && !p.storytender) return { room, player: p };
    }
  }
  return null;
}

/** Land the roads whose time has come — called on the room's
 *  standing pulse. A road lands
 *  only while its battle still stands (endBattle closes the
 *  roads of a finished battle before this ever sees them).
 *  Membership lands; NO card is dealt — under wheel law the
 *  landed member simply stands in the party, and so in the
 *  wheel's company, callable by the summon cast — unless the
 *  elsewhere law keeps it at a post (the homeland field, the
 *  bastion's staging, a fall's re-coalescence fallen across
 *  the road, or a standing on this very field), where it
 *  joins the party and keeps its post. */
function settleReinforcements(room: Room): void {
  if (!room.battle.active) return;
  const now = Date.now();
  for (const player of allSeats(room)) {
    if (!player.incoming?.length || !player.expKey) continue;
    const due = player.incoming.filter(i => i.arrivesAt <= now);
    if (!due.length) continue;
    player.incoming = player.incoming.filter(i => i.arrivesAt > now);
    const expKey = player.expKey;
    for (const inc of due) {
      void (async () => {
        const already = isPartyMember(expKey, inc.awakenedId);
        if (!already) {
          const r = tryAddPartyMember(expKey, inc.awakenedId, player.tenderLevel);
          if (!r.ok) {
            // The road completed but the joining was refused:
            // the creature never lands, so its price returns
            // whole, as for a road the battle closed.
            refundReinforcement(room, player, inc);
            tell(room, `${inc.name} reached ${player.name}'s party too late — ${r.reason} The ✦${inc.cost} paid for its road is returned whole.`);
            sendState(room);
            return;
          }
        }
        const placed = sqlite.prepare("SELECT 1 AS one FROM field_placements WHERE owner_key = ? AND awakened_id = ?").get(expKey, inc.awakenedId) as { one: number } | undefined;
        const staged = stagedIdsFor(expKey).includes(inc.awakenedId);
        const row = sqlite.prepare("SELECT dispersed_until FROM awakened WHERE id = ?").get(inc.awakenedId) as { dispersed_until: number | null } | undefined;
        const dispersed = !!row?.dispersed_until && row.dispersed_until > Date.now();
        const onField = [...room.field.values()].some(u => u.ownerKey === player.key && u.card.awokenId === inc.awakenedId);
        const keptAtPost = !!placed || staged || dispersed || onField;
        tell(room, keptAtPost
          ? `👣 ${inc.name} arrives — it joins ${player.name}'s party, and keeps the post it already stands at.`
          : `👣 ${inc.name} arrives — it joins ${player.name}'s party, and answers the wheel's call from here.`);
        sendState(room);
      })();
    }
  }
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
  // Held seats stand in the party too (marked away), so an
  // absent Tender's figure stays on their hex for those who
  // remain — the room does not pretend they were never here.
  const awaySeated = [...room.away.values()].map(h => h.player).filter(p => !p.watcher);
  const awayKeys = new Set(awaySeated.map(p => p.key));
  return {
    room: room.id,
    mode: room.mode,
    sky: room.campaign?.skyNote ? { ...room.sky, description: room.campaign.skyNote } : room.sky,
    round: room.roundNo,
    threat: [...room.dark.values()].reduce((sum, e) => sum + e.power, 0),
    players: [...seated, ...awaySeated].map(p => ({ key: p.key, name: p.name, companyCount: (p.company ?? []).length, energy: Math.floor(room.campaign && !room.campaign.over && room.campaign.seeded ? room.campaign.bank : p.energy), maxEnergy: p.maxEnergy, tenderHp: p.tenderHp, maxTenderHp: p.maxTenderHp, fallen: p.fallen, storytender: !!p.storytender, hex: p.hex ?? null, pos: p.pos ? roundPos(p.pos) : null, tgt: p.target ? roundPos(p.target) : null, moving: p.pos ? isMoving(p as any) : false, weaponKills: p.weaponKills ?? 0, castAt: p.castAt ?? 0, away: awayKeys.has(p.key), classKey: p.classKey ?? null, weaponKey: p.weaponKey ?? null, weaponLevel: p.weaponLevel ?? 1, weaponElement: p.weaponElement ?? null, weaponDepth: p.weaponDepth ?? 0, weaponManifest: !!p.weaponManifest, weaponSignature: !!p.weaponSignature })),
    watcherCount: [...room.players.values()].filter(p => p.watcher).length,
    campaign: room.campaign ? {
      bank: Math.floor(room.campaign.bank),
      bankStart: room.campaign.bankStart,
      seeded: room.campaign.seeded,
      over: room.campaign.over,
      storytenderName: room.campaign.storytenderName,
      storytellerKey: room.campaign.storytellerKey,
      panelAccess: [...room.campaign.panelAccess],
      stage: room.campaign.stage,
      deals: room.campaign.deals,
    } : null,
    tale: room.tale.slice(-TALE_CAP),
    map: [...room.map.values()].map(t => ({
      id: t.id, q: t.q, r: t.r, cursed: t.cursed, element: t.element,
      points: { ...t.points },
      curseHp: Math.ceil(t.curseHp), curseMaxHp: t.curseMaxHp,
      landing: t.landingFor ? (seatByKey(room, t.landingFor)?.name ?? null) : null,
    })),
    dark: [...room.dark.values()].map(e => ({ ...e, pos: roundPos(e.pos), target: e.target ? roundPos(e.target) : null, moving: isMoving(e) })),
    workings: room.workings.map(w => ({ ...w })),
    battle: { active: room.battle.active, wave: room.battle.wave },
    field: [...room.field.values()].map(u => ({
      hex: u.hex, cardId: u.card.id, awokenId: u.card.awokenId ?? null, name: u.card.name, art: u.card.art ?? null, layers: u.card.layers ?? [], element: u.card.element,
      power: u.card.power, toughness: u.card.toughness, hp: u.hp, maxHp: u.maxHp,
      shield: u.shield, maxShield: u.maxShield,
      pos: roundPos(u.pos), tgt: u.target ? roundPos(u.target) : null, moving: isMoving(u),
      follow: !!u.follow,
      level: u.card.level ?? null, ownerKey: u.ownerKey, ownerName: u.ownerName,
    })),
    enemies: room.enemies,
    strikes: room.strikes,
    rainFalls: (room.rainFalls ?? []).filter(f => Date.now() - f.at < 3000),
    bladeFlights: (room.bladeFlights ?? []).filter(f => Date.now() - f.at < 3000),
    manifests: (room.manifests ?? []).filter(m => m.expiresAt > Date.now()).map(m => ({ ownerKey: m.ownerKey, weaponKey: m.weaponKey, count: m.count, expiresAt: m.expiresAt })),
    bastion: room.bastion ? {
      callId: room.bastion.callId, kind: room.bastion.kind, hostName: room.bastion.hostName,
      ambush: room.bastion.ambush, pool: Math.floor(room.bastion.pool), poolMax: room.bastion.poolMax,
      begun: room.bastion.begun, resolved: room.bastion.resolved, size: room.bastion.size,
      prepared: room.bastion.prepared,
    } : null,
  };
}

function sendState(room: Room): void {
  settleTenders(room);
  // The wheel's companies keep themselves fresh: a membership
  // written in the Zodiac, a summon, a recall — each turns a
  // signature somewhere, and the rebuild rides the next push.
  for (const p of room.players.values()) maybeRefreshCompany(room, p);
  const state = sharedState(room);
  for (const [ws, player] of room.players) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    ws.send(JSON.stringify({
      type: "state",
      state,
      // THE privacy law: a company (and the notes and inventory)
      // travels only inside its owner's own payload. Other
      // sockets never receive it — not hidden, absent.
      you: player.watcher ? null : {
        key: player.key,
        name: player.name,
        company: player.company ?? [],
        // SUMMONER'S POWER, served with the seat (Nigel,
        // 2026-10-21): the wheel's summon preview shows the
        // cast's shape before the tap — the term is computed
        // here, by the one helper the cast itself rolls with,
        // so the preview can never promise a different number.
        summonersPower: summonersPowerFor(player.expKey, player.tenderLevel, player.classKey),
        // ATTUNEMENT REACH, served with the seat (Nigel,
        // 2026-10-21): the wheel's Attune branch shows the
        // reach it will enforce — the Tender's hex, its
        // ring, and this skill bonus beyond it (the zodiac's
        // "attuneReach" clauses; no stars carry it yet, so
        // the bonus reads 0 until the effects build). Read
        // by the one helper the door itself reckons with.
        attuneReach: attuneReachFor(player.expKey),
        elsewhere: player.elsewhere ?? [],
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
        // THE PARTY (Nigel, 2026-10-20; built 2026-10-21):
        // the creature ids standing in this seat's Tender's
        // party — read fresh from the membership ledger at
        // every send, so an order given here (or a fill made
        // in the Zodiac) shows at once. Unbound seats hold
        // no party.
        party: player.expKey ? partyIdsFor(player.expKey) : [],
        // THE PARTY'S SEAT DISPLAY (build 2): the members
        // with their standings for this Table, the open
        // spots, and any reinforcements still on the road —
        // this seat's eyes only, as the company itself is.
        partyView: player.expKey && !player.storytender ? partySeatView(room, player) : null,
        // THE REINFORCEMENT DECK (Recovery R6): the deck
        // Awoken this seat's wheel can call in — served with
        // the seat, refreshed beside the company, this seat's
        // eyes only.
        reinforcements: player.expKey && !player.storytender ? (player.reinforcements ?? []) : [],
        tenderLevel: player.tenderLevel,
        healTier: player.healTier,
        healAmount: player.healAmount,
        wardRuneUnlocked: player.wardRuneUnlocked,
        classKey: player.classKey ?? null,
        weaponKey: player.weaponKey ?? null,
        weaponLevel: player.weaponLevel ?? 1,
        weaponElement: player.weaponElement ?? null,
        weaponDepth: player.weaponDepth ?? 0,
        weaponManifest: !!player.weaponManifest,
        weaponSignature: !!player.weaponSignature,
        tenderHp: player.tenderHp,
        maxTenderHp: player.maxTenderHp,
        pools: player.pools ?? null,
        castHues: player.castHues ?? {},
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
      id, players: new Map(), away: new Map(), manifests: [], tale: [], sky: await currentSky(),
      mode: campaignMode ? "campaign" : "casual",
      campaign: campaignMode ? loadCampaign(id) : null,
      field: new Map(),
      map: freshInstanceMap(campaignMode),
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
    // The standing pulse starts with the room (see roomPulse):
    // the curse's withering is standing law, owed even when
    // no battle has been called.
    const madeRoom = room;
    madeRoom.pulseTimer = setInterval(() => { roomPulse(madeRoom); }, 250);
    madeRoom.pulseTimer.unref?.();
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
  // A held (away) seat is still its owner's seat: landings keep
  // their names and a working still knows whose it is.
  return room.away.get(key)?.player;
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
/** A fresh instance map. The casual Table keeps its old
 *  law — every tile cursed at its ring's full corruption but
 *  the seed's own ground, the party's first purified earth.
 *  A CAMPAIGN map is born under the default-curse law (Nigel,
 *  2026-10-21 15:45: the default tile of every map is the
 *  curse, prevailing unless held back by some means) — all
 *  127 hexes cursed, the seed's included, corruption by
 *  ring, held-back ground arriving only through play (a
 *  tender's arrival purifies their landing; storyteller
 *  placement in later builds). Existing rooms are made, not
 *  remade: this applies to maps created from this build on. */
function freshInstanceMap(allCursed = false): Map<string, MapTile> {
  const map = new Map<string, MapTile>();
  for (const t of TILE_DEFS) {
    const ring = ringOf(t.id);
    const seed = t.id === SEED_TILE && !allCursed;
    map.set(t.id, {
      id: t.id, q: t.q, r: t.r,
      cursed: !seed, element: seed ? "sky" : null, points: {}, attuneAcc: {},
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
function placeUnit(room: Room, u: FieldUnit): void { room.field.set(unitKeyOf(u), u); reckonSeatEnergy(room, u.ownerKey); }
function removeUnit(room: Room, u: FieldUnit): void { room.field.delete(unitKeyOf(u)); reckonSeatEnergy(room, u.ownerKey); }

/** One Awokin's share of the one energy law, by the power
 *  band calculateMaxEnergy counts it in: 1–3 → +2, 4–6 → +4,
 *  7–9 → +6, 10+ → +8. The bands are the law's own; this is
 *  only their reading for a single creature. */
function awokinEnergyShare(power: number): number {
  if (power >= 10) return 8;
  if (power >= 7) return 6;
  if (power >= 4) return 4;
  if (power >= 1) return 2;
  return 0;
}

/** THE BONUS FOR THE UNFIELDED (Nigel, 2026-10-21 12:11 —
 *  ruled as the in-hand bonus: "party size 'in hand' on the
 *  zodiac wheel raises your total energy. when they are
 *  summoned, they no longer provide that bonus" — and
 *  TRANSLATED by the wheel law the same day, 16:26: the hand
 *  is retired, so "in hand" now reads "party members NOT
 *  currently fielded"; the numbers never moved, only the
 *  state's name). A bound seat's maximum is a LIVING
 *  reckoning: the standing maximum (calculateMaxEnergy,
 *  which counts every owned Awokin's share, fielded and
 *  unfielded alike, plus the Heart's Deep Breath where it
 *  stands) MINUS the shares of the Awokin this seat currently
 *  has FIELDED at this Table. It is re-reckoned at the
 *  field's only two seams — a unit placed, a unit removed
 *  (placeUnit / removeUnit, verified in this build) — so a
 *  summon lowers it, and every road off the field (a fall, a
 *  curse-unbinding, a recall, a battle-end dissipation)
 *  raises it again; members still standing when a battle
 *  ends keep their shares held back, as they stand. The
 *  readings, stated plainly: when the maximum DROPS, the
 *  seat's current energy CLAMPS to it; when the maximum
 *  RISES, the current energy does NOT fill to meet it — what
 *  returns is room, not energy. Unbound seats carry no
 *  standing reckoning and keep their flat portion untouched.
 *  The campaign bank and the bastion pool keep their own
 *  reckonings — this law governs the seat's own purse only. */
function reckonSeatEnergy(room: Room, ownerKey: string): void {
  const seat = seatByKey(room, ownerKey);
  if (!seat || seat.standingMaxEnergy == null) return;
  let held = 0;
  for (const u of room.field.values()) if (u.ownerKey === ownerKey) held += awokinEnergyShare(u.card.power);
  seat.maxEnergy = Math.max(0, seat.standingMaxEnergy - held);
  if (seat.energy > seat.maxEnergy) seat.energy = seat.maxEnergy;
}
/** CONTINUOUS MOVEMENT (Phase B): a thing moves while it has a
 *  target further than a step away. There are no roads on
 *  entities any more — only a position and a destination. */
function isMoving(e: { pos: Pt; target: Pt | null }): boolean {
  return !!e.target && distPx(e.pos, e.target) > 2;
}
/** The standing light: fielded, arrived, and able to be met. */
function standingUnits(room: Room): FieldUnit[] {
  return [...room.field.values()].filter(u => !isMoving(u));
}
/** TENDER PACE LAW (Nigel, 2026-10-20): the Tender's glide
 *  at the Table runs at a QUARTER of its old 120 px/s. And
 *  cursed ground halves the pace again — for the Tender and
 *  for every Awoken, on both grounds (the dark is NOT
 *  slowed; the ruling names the light). The homeland keeps
 *  its own stride law, halved the same day.
 *  THE QUICKNESS LADDER ON THE GLIDE (Nigel, 2026-10-22;
 *  Recovery R14): the 30 px/s above is the WARDEN rung's
 *  pace — a Tender's glide is raised from it by her class's
 *  ladder ratio (quicknessSpeedFor, server/src/skills.ts:
 *  165/195/225/255/285 against the base 165), so a Sage
 *  glides at 30 × 285/165 and a classless seat at the plain
 *  30. The cursed halving rides on top, unchanged. */
const TENDER_GLIDE_PX = 30;
/** Step one entity toward its target at `speedPx` px/s over `dt`
 *  seconds; on arrival the position is the target's copy and the
 *  target clears. */
function stepToward(e: { pos: Pt; target: Pt | null }, speedPx: number, dt: number): void {
  if (!e.target) return;
  const d = distPx(e.pos, e.target);
  const step = speedPx * dt;
  if (d <= 2 || step >= d) { e.pos = { ...e.target }; e.target = null; return; }
  e.pos = { x: e.pos.x + (e.target.x - e.pos.x) / d * step, y: e.pos.y + (e.target.y - e.pos.y) / d * step };
}
/** BULWARK (Nigel, 2026-10-23 — Recovery R12): the nearest
 *  standing Bulwark shield to a point, across every line on
 *  the field (a wall is a wall, whoever raised it — the
 *  passive walls' own law at this Table), or null when no
 *  shield stands within `reach` px. The shields are the
 *  working's body: a shield at 0 HP is no shield at all. */
function nearestBulwarkShield(room: Room, pos: Pt, reach: number): { w: Working; s: { x: number; y: number; hp: number; maxHp: number }; d: number } | null {
  let best: { w: Working; s: { x: number; y: number; hp: number; maxHp: number }; d: number } | null = null;
  for (const w of room.workings) {
    if (w.engine !== "bulwark" || !w.shields) continue;
    for (const s of w.shields) {
      if (s.hp <= 0) continue;
      const d = distPx(pos, s);
      if (d <= reach && (!best || d < best.d)) best = { w, s, d };
    }
  }
  return best;
}

/** THE INTEGRATOR: advance every position by the time since the
 *  last integration, steer the dark (in battle), then derive
 *  every entity's hex from its position. Enemies crossing into
 *  a new tile spring its runes. */
function integrate(room: Room, now: number): void {
  const dt = Math.min(1, Math.max(0, (now - (room.integrateAt ?? now)) / 1000));
  room.integrateAt = now;
  for (const p of room.players.values()) {
    if (p.watcher || p.storytender || !p.pos) continue;
    if (p.target) stepToward(p as { pos: Pt; target: Pt | null }, TENDER_GLIDE_PX * (quicknessSpeedFor(p.classKey) / 165) * (p.hex && room.map.get(p.hex)?.cursed ? 0.5 : 1), dt);
  }
  for (const u of room.field.values()) {
    if (u.target) stepToward(u, (u.speedPx ?? 110) * (u.hex && room.map.get(u.hex)?.cursed ? 0.5 : 1), dt);
  }
  if (room.battle.active) {
    const standing = standingUnits(room);
    const seedCenter = TILE_CENTERS.get(SEED_TILE)!;
    for (const e of room.dark.values()) {
      // THE PIN HOLDS THE FEET TOO (audit of 2026-10-20): a
      // dark the Lattice has bound "stands pinned" — the
      // book's own words — but the glide below never asked
      // after the pin, so a bound dark went on walking to
      // the seed while only its strike was held. A pinned
      // dark does not step.
      if ((e.pinnedUntil ?? 0) > now) { e.target = null; continue; }
      // BULWARK (Recovery R12): the line HALTS the dark as
      // the homeland's line does — a dark come up against a
      // standing shield (within half a hex of one) goes no
      // farther this beat; the strike pass below is where
      // it hits the shield and is shoved back. (The Table's
      // older wards never blocked movement — the passive
      // walls' note stands for them; Bulwark's ruling is
      // its own: a line of shields, in the Rock Wall's
      // working fashion, and the Rock Wall blocks.)
      if (nearestBulwarkShield(room, e.pos, 46)) { e.target = null; continue; }
      // STEERING: the nearest standing light, if it can be clawed
      // or is nearer than the seed; otherwise the seed itself —
      // but at the gate (ring 1) it halts and assaults.
      let light: FieldUnit | null = null;
      let lightD = Infinity;
      for (const u of standing) {
        const d = distPx(e.pos, u.pos);
        if (d < lightD) { lightD = d; light = u; }
      }
      if (light && lightD <= 69) {
        e.target = null; // clawHalt: in reach — it fights where it stands
      } else if (light && lightD < distPx(e.pos, seedCenter)) {
        e.target = { ...light.pos };
      } else if (distPx(e.pos, seedCenter) <= 69) {
        // THE GATE HALT: within claw reach of the seed's heart
        // it stops and claws. The halt is measured in px from
        // the seed's center, NOT at the derived ring's edge —
        // a dark that stopped at the ring-1 cell's outer edge
        // stood ~96px out, beyond a root light's answer and
        // clawing nothing, and a dealt wave could hang
        // unresolved forever (probe41's stalemate).
        e.target = null;
      } else {
        e.target = { ...seedCenter };
      }
      if (e.target) stepToward(e, 69 / (DARK_GAIT[e.kind] ?? 2.8), dt);
    }
  }
  for (const p of room.players.values()) {
    if (p.pos) p.hex = nearestTileId(p.pos);
  }
  for (const u of room.field.values()) u.hex = nearestTileId(u.pos);
  for (const e of room.dark.values()) {
    const hex = nearestTileId(e.pos);
    e.hex = hex;
    if (hex !== e.lastTile) { e.lastTile = hex; springHex(room, hex, new Set()); }
  }
}
/** A seated Tender stands somewhere: their landing tile first,
 *  any purified ground for a fallback. Called once a landing is
 *  assigned (and reset when a seat answers a call elsewhere). */
function ensureTenderHex(room: Room, player: Player): void {
  if (player.watcher || player.storytender || player.hex) return;
  const landing = [...room.map.values()].find(t => t.landingFor === player.key);
  if (landing) { player.hex = landing.id; player.pos = { ...TILE_CENTERS.get(landing.id)! }; player.target = null; return; }
  const any = [...room.map.values()].find(t => !t.cursed && t.id !== SEED_TILE);
  if (any) { player.hex = any.id; player.pos = { ...TILE_CENTERS.get(any.id)! }; player.target = null; }
}
/** The formation ground around a Tender: their own tile and
 *  its ring, the seed never among them — ordered so the
 *  company builds up BEHIND the Tender (nearest the ground
 *  they came from first), emptier tiles before fuller. */
function followSlots(room: Room, tender: Player, originId: string | null): string[] {
  if (!tender.hex) return [];
  const cands = [tender.hex, ...neighborsOf(tender.hex)]
    .filter((id, i, arr) => id !== SEED_TILE && TILE_BY_ID.has(id) && arr.indexOf(id) === i);
  cands.sort((a, b) => {
    const da = originId ? axialDist(a, originId) : 0;
    const db = originId ? axialDist(b, originId) : 0;
    if (da !== db) return da - db;
    return unitsAt(room, a).length - unitsAt(room, b).length;
  });
  return cands;
}
/** Positions settle before any state is read: integrate first,
 *  then the muster — a standing Tender's following Awokin that
 *  are not already at their side glide to a formation slot.
 *  A follower already within a tile rests: no shuffling. */
function settleTenders(room: Room, now = Date.now()): void {
  integrate(room, now);
  for (const p of room.players.values()) {
    if (p.watcher || p.storytender || !p.pos || p.target) continue;
    if (!p.hex) continue;
    const slots = followSlots(room, p, null);
    if (!slots.length) continue;
    for (const u of room.field.values()) {
      if (u.ownerKey !== p.key || !u.follow || u.target || !unitStanding(room, u)) continue;
      if (axialDist(u.hex, p.hex) <= 1) continue;
      const slot = slots.find(id => id !== u.hex && unitsAt(room, id).length < STACK_CAP);
      if (!slot) break;
      u.target = { ...TILE_CENTERS.get(slot)! };
      u.speedPx = 110;
    }
  }
  ensureDrift(room);
}
function stopDrift(room: Room): void {
  if (room.driftTimer) { clearInterval(room.driftTimer); room.driftTimer = null; }
}
/** THE DRIFT: while anything glides at a quiet table (no battle
 *  timer running), a light 250ms pulse keeps the room's state
 *  flowing so the movement is seen. It stops itself when every
 *  target is spent and no battle runs. */
function ensureDrift(room: Room): void {
  const anyMovers = () =>
    [...room.players.values()].some(p => !!p.target)
    || [...room.field.values()].some(u => !!u.target)
    || [...room.dark.values()].some(e => !!e.target);
  if (!anyMovers() || room.driftTimer || room.battle.timer) return;
  room.driftTimer = setInterval(() => {
    if (!rooms.get(room.id)) { stopDrift(room); return; }
    sendState(room);
    if (!anyMovers() && !room.battle.active) stopDrift(room);
  }, 250);
  room.driftTimer.unref?.();
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
 *  or the standing light grinds its corruption to nothing.
 *  The turn is a rebirth for the tile's point ledger too:
 *  whatever attunement rested on the cursed ground is gone
 *  with the curse, and the tile is born BARE of points —
 *  its element is the turning light's by birthright until
 *  a Tender lays points on it. */
function purifyTile(room: Room, tile: MapTile, element: string): void {
  if (!tile.cursed) return;
  tile.cursed = false;
  tile.element = element;
  tile.points = {};
  tile.attuneAcc = {};
  tile.curseHp = 0;
  tell(room, `🌿 The land turns — ${element} ground joins the light.`);
}

/** The element a tile's resting points make it hold: the
 *  element with the most points on the tile. A tie leaves the
 *  standing element as it is (ties hold — the homeland's
 *  habit with its trays and press alike), and bare ground
 *  keeps whatever it already holds. */
function elementFromPoints(tile: MapTile): string | null {
  let best: string | null = null;
  let bestPts = 0;
  for (const [el, pts] of Object.entries(tile.points)) {
    if (pts > bestPts) { best = el; bestPts = pts; }
  }
  if (!best) return tile.element;
  const standing = tile.element ? (tile.points[tile.element] ?? 0) : 0;
  return standing >= bestPts ? tile.element : best;
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
    // The landing wears the element of the company's first
    // member (the hand's first card, before the wheel law) —
    // the seat's company is built before its landing is
    // assigned, at the join.
    const first = (player.company ?? [])[0];
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

/** The curse withers its guests (attrition, Nigel,
 *  2026-10-19): a standing Awokin on cursed ground pays the
 *  ring's share of its greatest health each beat — its shield
 *  drinks first, as for any harm; what gets through unbinds.
 *  THE RUNEWRIGHT'S COMPANY (Nigel, 2026-10-22 12:27;
 *  Recovery R7): her Awokin suffer less of it — the burn is
 *  relieved by curseReliefFor (1 to start, +1 per 3rd tender
 *  level) for every beat the reckoning spans, never below
 *  nothing. Her Tender's own withering, above, is not her
 *  Awokin's and takes no relief. */
function hurtByCurse(room: Room, u: FieldUnit, burn: number, beats = 1): void {
  const seat = seatByKey(room, u.ownerKey);
  const relief = curseReliefFor(seat?.classKey, seat?.tenderLevel ?? 1) * Math.max(0, beats);
  let wound = Math.max(0, burn - relief);
  if (u.shield > 0) {
    const absorbed = Math.min(u.shield, wound);
    u.shield -= absorbed;
    wound -= absorbed;
  }
  u.hp -= wound;
  if (u.hp <= 0) {
    noteDissipation(room, u);
    removeUnit(room, u);
    // No card returns anywhere — the hand is retired. The
    // member is simply un-fielded, and the wheel's company
    // names it again at the next refresh.
    tell(room, `The curse unbinds ${u.card.name} where it stood — it dissipates to its Tender's roster.`);
  }
}

/** THE CURSE WITHERS, THE LIGHT GRINDS (the Instance Map;
 *  attrition ruled 2026-10-19): every Awokin standing on
 *  cursed ground pays the ring's attrition — a share of
 *  its greatest health per beat — and its presence wears
 *  the tile's corruption down by its power, unless the
 *  dark itself holds that tile. A tile ground to nothing
 *  turns NEUTRAL: the grind is a freeing, not an
 *  attunement — ground the light frees by standing on it
 *  takes no element from the freeing itself. (The
 *  2026-10-20 reading that ONLY THE TENDER ATTUNES TILES
 *  was superseded by Nigel, 2026-10-21: Awokin standing
 *  on PURIFIED ground do attune it, slowly, in their own
 *  element — settleStandingAttunement. On cursed ground
 *  their presence is spent here, grinding and withering,
 *  and lays no points.)
 *  THE TENDER WITHERS TOO: he may walk the cursed land —
 *  it is his road as much as theirs — and it takes the
 *  same share of him, standing or gliding, until he
 *  falls where he stands.
 *  This settle once lived only inside runRound, whose
 *  gate is a called battle — so at a quiet table the
 *  cursed land never withered anyone (Nigel's report,
 *  2026-10-20: "the cursed lands are not doing any
 *  damage"). Attrition is standing law, not a battle
 *  effect: runRound still calls it on the battle clock,
 *  and the room's standing pulse calls it whenever no
 *  battle runs. Returns true when anything visibly
 *  changed — a guest burned, or a tile ground down. */
function settleCurseWithering(room: Room, dtSec: number): boolean {
  let changed = false;
  const grind = new Map<string, { dmg: number; best: FieldUnit | null }>();
  const rate = dtSec / (BEAT_MS / 1000); // the old round's share of this tick
  for (const p of room.players.values()) {
    if (p.watcher || p.storytender || p.fallen || !p.hex) continue;
    const tile = room.map.get(p.hex);
    if (!tile || !tile.cursed) continue;
    p.tenderHp -= p.maxTenderHp * curseAttritionPct(ringOf(tile.id)) * rate;
    changed = true;
    if (p.tenderHp <= 0) {
      p.tenderHp = 0;
      p.fallen = true;
      p.target = null;
      tell(room, `The curse's attrition takes ${p.name} — they fall where they stand. The Bastion mourns — and fights on.`);
    }
  }
  for (const u of standingUnits(room)) {
    const tile = room.map.get(u.hex);
    if (!tile || !tile.cursed) continue;
    changed = true;
    hurtByCurse(room, u, u.maxHp * curseAttritionPct(ringOf(tile.id)) * rate, rate);
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
    changed = true;
    if (tile.curseHp <= 0) {
      purifyTile(room, tile, "neutral");
    }
  }
  return changed;
}

/** THE WRITTEN LIGHT WITHERS TOO (Nigel, 2026-10-20):
 *  wards and runes may now be cast ANYWHERE — and what
 *  stands on cursed ground suffers the curse's attrition,
 *  like the Tender: the ring's share of its greatest
 *  measure per beat, until it falls or the ground turns.
 *  A working's measure is the body the book gives it: its
 *  health rating where it carries one (the Seal, the
 *  Trees, the Lattice, the passive walls). A rune the book
 *  gives no health carries its CHARGES instead — they are
 *  its springs, the only endurance on its page — so the
 *  curse eats them at the same fractional rate, a whole
 *  charge at a time (the Keeper's reading, 2026-10-20:
 *  the wither accrues against charges exactly as against
 *  health, so a bodiless rune lives 1/rate beats on cursed
 *  ground, as a bodied one does). Workings with neither
 *  health nor charges (the Engine, the Standard, the
 *  Beacon) have no body for the curse to eat — the book
 *  gives them none, and none is invented here.
 *  A ward stands on the edge between two hexes: it pays
 *  for the worse of its two grounds, as a guest pays for
 *  the one tile he stands on (the Keeper's reading).
 *  Runs on the battle clock (runRound) and on the room's
 *  standing pulse alike. Returns true when a working's
 *  body visibly moved or a working fell. */
function settleWorkingWithering(room: Room, dtSec: number): boolean {
  const rate = dtSec / (BEAT_MS / 1000);
  if (rate <= 0) return false;
  let changed = false;
  for (const w of [...room.workings]) {
    if (w.kind === "grove") continue;
    // BULWARK (Recovery R12): its body is its shields' HP,
    // struck node by node in the battle pass — the curse
    // does not also eat the line through this ledger (the
    // homeland's defence works carry no wither either).
    if (w.engine === "bulwark") continue;
    const ground = w.kind === "rune"
      ? (w.hex ? [w.hex] : [])
      : [w.hexA, w.hexB].filter((h): h is string => !!h);
    let worst = -1;
    for (const hx of ground) {
      const t = room.map.get(hx);
      if (t && t.cursed) worst = Math.max(worst, ringOf(t.id));
    }
    if (worst < 0) continue;
    const pct = curseAttritionPct(worst);
    if (w.maxHp > 0) {
      w.wither = (w.wither ?? 0) + w.maxHp * pct * rate;
      const whole = Math.floor(w.wither);
      if (whole >= 1) {
        w.wither -= whole;
        w.hp -= whole;
        changed = true;
        if (w.hp <= 0) {
          room.workings = room.workings.filter(x => x !== w);
          tell(room, `The curse eats ${w.name} where it stands — unwritten by the ground it was written on.`);
        }
      }
    } else if (w.charges > 0) {
      w.wither = (w.wither ?? 0) + w.charges * pct * rate;
      const whole = Math.floor(w.wither);
      if (whole >= 1) {
        w.wither -= whole;
        w.charges -= whole;
        changed = true;
        if (w.charges <= 0) {
          room.workings = room.workings.filter(x => x !== w);
          tell(room, `The curse eats ${w.name} where it stands — unwritten by the ground it was written on.`);
        } else {
          tell(room, `The curse thins ${w.name} — ${w.charges} spring${w.charges === 1 ? "" : "s"} of it remain.`);
        }
      }
    }
  }
  return changed;
}

/** STANDING ATTUNEMENT (Nigel, 2026-10-21: "awoken still
 *  attune tiles by standing on the[m], creating elemental
 *  attunement points and the tender can use the attune
 *  ability to make attunement faster or instant"). An
 *  Awokin standing on purified ground lays its OWN
 *  element's points onto that tile — slowly, into the
 *  same resting ledger the Attune act spends into
 *  (tile.points), so the tile's held element turns by the
 *  one plurality law (elementFromPoints) whichever road
 *  laid the points. THE RATE IS A KEEPER'S CALL, unruled:
 *  one point per Awokin per twenty beats — 56 seconds of
 *  standing — in the homeland's spirit: its press accrues
 *  slowly (net points divided by 16/3, per hour) and only
 *  with presence; here, no presence, no accrual, and a
 *  tile vacated keeps the fractions it had gathered (as a
 *  homeland tray keeps its growth) but gathers no more.
 *  Cursed ground takes none: there the standing light's
 *  presence is already spent — grinding the curse down
 *  and withering under it (settleCurseWithering) — and
 *  attunement rests only on purified land, the act's own
 *  law. The seed tile takes none either: the act refuses
 *  it, and standing honors the same seal. Runs wherever
 *  the withering runs — the room's standing pulse and the
 *  battle clock alike. Returns true when a whole point
 *  landed (the only change a watcher can see). */
const STANDING_ATTUNE_BEATS_PER_POINT = 20;
function settleStandingAttunement(room: Room, dtSec: number): boolean {
  if (dtSec <= 0) return false;
  let changed = false;
  const touched = new Set<MapTile>();
  for (const u of standingUnits(room)) {
    const tile = room.map.get(u.hex);
    if (!tile || tile.cursed || tile.id === SEED_TILE) continue;
    const el = u.card.element;
    if (!(el in ELEMENT_REACH)) continue;
    const acc = tile.attuneAcc ?? (tile.attuneAcc = {});
    acc[el] = (acc[el] ?? 0) + (dtSec / (BEAT_MS / 1000)) / STANDING_ATTUNE_BEATS_PER_POINT;
    touched.add(tile);
  }
  for (const tile of touched) {
    const acc = tile.attuneAcc;
    if (!acc) continue;
    for (const [el, frac] of Object.entries(acc)) {
      const whole = Math.floor(frac);
      if (whole <= 0) continue;
      acc[el] = frac - whole;
      tile.points[el] = (tile.points[el] ?? 0) + whole;
      tile.element = elementFromPoints(tile);
      changed = true;
    }
  }
  return changed;
}

/** THE ROOM'S STANDING PULSE (the fix of 2026-10-20): a
 *  light 250 ms heartbeat every room keeps from its
 *  making, so the curse's standing law — the withering
 *  of guests and of the written light, and the light's
 *  grind — runs whenever a seated Tender is present,
 *  battle or no battle. While a battle runs, runRound's
 *  clock owns the settling and the pulse stands aside;
 *  when the room is put away the pulse stops itself.
 *  State is pushed only when the settling changed
 *  something — a quiet room stays quiet. */
function roomPulse(room: Room): void {
  if (!rooms.get(room.id)) {
    if (room.pulseTimer) { clearInterval(room.pulseTimer); room.pulseTimer = null; }
    return;
  }
  // The cast colours a seat is SERVED (player.castHues) are
  // refreshed off the book at a slow cadence — a Tender who
  // fills a slot in the Grimoire between battles sees the
  // new colour here within seconds. The cast doors derive
  // fresh regardless; this only keeps the label true.
  {
    const nowH = Date.now();
    for (const p of room.players.values()) {
      if (!p.expKey || nowH - (p.castHuesAt ?? 0) < 5000) continue;
      p.castHuesAt = nowH;
      const expKey = p.expKey;
      void castHuesFor(expKey).then((hues) => {
        if (JSON.stringify(hues) !== JSON.stringify(p.castHues ?? {})) { p.castHues = hues; sendState(room); }
      }).catch(() => {});
    }
  }
  // Reinforcements land on this pulse while their battle
  // still stands (build 2) — before the battle check below
  // hands the settling to runRound's clock, whose rounds
  // call sendState but never this pulse's landing.
  settleReinforcements(room);
  if (room.battle.active) { room.witherAt = undefined; return; }
  if (![...room.players.values()].some(p => !p.watcher)) { room.witherAt = undefined; return; }
  const now = Date.now();
  const dtMs = Math.min(1000, Math.max(0, now - (room.witherAt ?? now)));
  room.witherAt = now;
  if (dtMs <= 0) return;
  integrate(room, now);
  const changed = settleCurseWithering(room, dtMs / 1000) || settleWorkingWithering(room, dtMs / 1000);
  const attuned = settleStandingAttunement(room, dtMs / 1000);
  // The new workings keep their clocks at a quiet table too
  // (a swarm loosed before the wave is called still flies).
  const transient = room.workings.some(w => w.engine === "bats" || w.engine === "holdrune" || w.engine === "shatter");
  if (transient) processTransientWorkings(room, now, dtMs / 1000);
  if (changed || attuned || transient) sendState(room);
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

function fellDark(room: Room, enemy: EnemyUnit, killer: Player | null): void {
  room.dark.delete(enemy.id);
  tell(room, `The ${enemy.label} unravels!`);
  // The ground it held is freed by the felling (the Instance
  // Map): a cursed tile whose dark falls turns to the light —
  // as NEUTRAL ground, whatever struck the blow (Nigel,
  // 2026-10-20: only the Tender attunes tiles; a felling is
  // not an attunement, so freed ground takes no element
  // until a Tender spends one onto it — the attuneTile act).
  const tile = room.map.get(enemy.hex);
  // The element the ground held as the dark fell on it,
  // read before the freeing overwrites it — the fell drip's
  // element follows the ground (payFellDrip, actions.ts).
  const groundElement = tile?.element ?? null;
  if (tile) purifyTile(room, tile, "neutral");
  if (room.campaign && !room.campaign.over) { campaignFell(room, enemy, killer, groundElement); return; }
  if (killer && !killer.fallen) {
    killer.energy = Math.min(killer.maxEnergy + 10, killer.energy + 3);
    void payBattleExp(room, killer, 2, "The dark pays for its felling.");
    // THE FELL DRIP (Nigel, 2026-10-20: creatures beaten at
    // the Table drop attunement points): the killer's pools
    // may catch the drip, beside the energy and EXP he takes.
    if (killer.expKey) void payFellDrip(killer.expKey, groundElement);
  }
}

// ── GROVES AND PASSIVE WALLS (Phase C) ────────────────────
/** One burst of the Springleaf's healing: the mended one's
 *  OWN element die, rolled once through the castHeal
 *  machinery's dice (FATE_DIE), applied hp-then-shield as
 *  Heal applies it. `half` halves the roll (min 1) — the
 *  saplings' measure. `binderBonus` is the Binder's company
 *  gift (bindingHealBonusFor, Recovery R7): the Springleaf
 *  is a Binding working, so a grove a Binder planted heals
 *  +4 more with every burst, the mother's and the
 *  saplings' alike — the bonus rides the heal's amount,
 *  after the sapling's halving, as Heal's +4 rides its
 *  dice. Returns the amount that truly landed. */
function groveBurstHeal(u: FieldUnit, half: boolean, binderBonus = 0): number {
  let amount = dN(FATE_DIE[u.card.element] ?? 6);
  if (half) amount = Math.max(1, Math.floor(amount / 2));
  amount += binderBonus;
  const toHp = Math.min(u.maxHp - u.hp, amount);
  u.hp += toHp;
  const toShield = Math.min(u.maxShield - u.shield, amount - toHp);
  u.shield += toShield;
  return toHp + toShield;
}
/** Every ally standing in a grove's glow: the caster's company
 *  and every seated Tender's — at the Table the party is the
 *  alliance, and the field holds no other light. */
function alliesInRadius(room: Room, centre: Pt, radiusPx: number): FieldUnit[] {
  return [...room.field.values()].filter(u => distPx(u.pos, centre) <= radiusPx);
}
/** The groves' tending, on the referee's tick (runRound):
 *  saplings root on their schedule (~1.6s apart) and burst a
 *  half heal as they root; every living grove mends its
 *  allies +1 hp per beat (its own lastMend stamp); groves
 *  past their expiry fade. The mother lingers 34s from the
 *  cast, each sapling 20s from its rooting. */
function processGroves(room: Room, now: number): void {
  // Sapling rootings due.
  for (const mother of [...room.workings]) {
    if (mother.kind !== "grove" || !mother.mother || !mother.saplingDue?.length) continue;
    while (mother.saplingDue.length && mother.saplingDue[0] <= now) {
      mother.saplingDue.shift();
      const pos = mother.saplingPos?.shift() ?? mother.pos ?? { x: 0, y: 0 };
      const radiusPx = (mother.radiusPx ?? 0) / 2;
      const sapling: Working = {
        id: randomUUID(), kind: "grove", root: mother.root, engine: "springleaf", nums: mother.nums,
        name: mother.name, hue: mother.hue, ownerKey: mother.ownerKey, ownerName: mother.ownerName,
        hex: nearestTileId(pos), hexA: null, hexB: null, hp: 0, maxHp: 0, pour: 0, stops: 0, charges: 0,
        pos: { ...pos }, radiusPx, expiresAt: now + 20_000, lastMend: now, mother: false,
      };
      room.workings.push(sapling);
      let mended = 0;
      const sapBinderBonus = bindingHealBonusFor(seatByKey(room, mother.ownerKey)?.classKey);
      for (const u of alliesInRadius(room, pos, radiusPx)) mended += groveBurstHeal(u, true, sapBinderBonus);
      tell(room, `A sapling of ${mother.name} takes root — its first breath mends ${mended} among those standing in its glow.`);
    }
  }
  // The per-beat mend, and expiry.
  for (const g of [...room.workings]) {
    if (g.kind !== "grove") continue;
    if ((g.expiresAt ?? 0) <= now) {
      room.workings = room.workings.filter(w => w !== g);
      tell(room, `${g.name}'s grove fades — its glow was lent, not given.`);
      continue;
    }
    if (now - (g.lastMend ?? 0) >= BEAT_MS) {
      g.lastMend = now;
      if (g.pos && g.radiusPx) {
        // The per-beat mend is the grove's healing too: a
        // Binder's grove mends +4 more a breath (the
        // Binder's company, Recovery R7).
        const mendAmt = 1 + bindingHealBonusFor(seatByKey(room, g.ownerKey)?.classKey);
        for (const u of alliesInRadius(room, g.pos, g.radiusPx)) {
          if (u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + mendAmt);
        }
      }
    }
  }
}
/* ── THE NEW WORKINGS AT THE TABLE (Nigel, 2026-10-22;
 * seated 2026-10-23 — ported whole from the Proving Ground
 * under the porting law: counts, timings, motion and
 * behaviour unchanged).
 *  · BATS (spell, 5✦): the swarm flies the runic arrow's own
 *    road on this ground — its heading steered to its goal
 *    under the same turn clamp (3.6 rad/s), its speed checked
 *    as it closes (170–520 px/s by the page's own measure),
 *    wheeling on an orbit around the STRONGEST standing dark
 *    (orbit radius 46×26 px, turning 2.4 rad/s) and biting
 *    1d4 every 3 s when within 130 px of its quarry — past
 *    all armor, AC never consulted. Three bites over a fixed
 *    9 s; a fallen quarry sends it to the next strongest; an
 *    empty field sends it home to its caster, and reaching
 *    home (20 px) or the 9 s ends it.
 *  · HOLD RUNE (rune, 7✦): the rune forms over its target
 *    (33 slots × ~122 ms), and THE HOLD BEGINS AT THE CRASH'S
 *    FIRST STRIKE — the target stands pinned 3 s while the
 *    crash loops; then the working is spent. A target fallen
 *    before the crash takes the rune with it.
 *  · RUNE SHATTER (spell, 1✦): each piece is its own shot —
 *    d20 + the cast's bonus − 2 against the target's AC, 1
 *    damage a hit, fired in a straight shot at 700 px/s (the
 *    page's own flight reckoning, kept here as the shot's
 *    measure; the referee lands the harm as the piece lands).
 *    A tap looses three pieces; HELD, the stream runs on —
 *    1✦ a second, three pieces a second — until the held
 *    time is spent or the purse starves. */
export const BATS_LIFE_MS = 9000;
export const HOLD_RUNE_FORM_MS = 33 * 122;
export const HOLD_RUNE_HOLD_MS = 3000;
export const SHATTER_STREAM_PIECE_MS = 333;
export function shatterPieceHit(roll: number, bonus: number, ac: number): { total: number; hit: boolean } {
  const total = roll + bonus - 2;
  return { total, hit: roll === 20 || (roll !== 1 && total >= ac) };
}
function strongestDark(room: Room): EnemyUnit | null {
  let best: EnemyUnit | null = null;
  for (const e of room.dark.values()) if (!best || e.hp > best.hp) best = e;
  return best;
}
function fireShatterPiece(room: Room, caster: Player, from: Pt, aimHex: string): void {
  const aim = TILE_CENTERS.get(aimHex);
  if (!aim) return;
  const target = [...room.dark.values()].find(e => e.hex === aimHex) ?? null;
  const bonus = castModFor(caster.classKey, caster.tenderLevel, "spell");
  const ac = target ? target.armor : 10;
  const roll = dN(20);
  const { total, hit } = shatterPieceHit(roll, bonus, ac);
  if (room.strikes.length < 40) {
    room.strikes.push({ id: (room.strikeSeq = (room.strikeSeq ?? 0) + 1), at: Date.now(), from: roundPos(from), to: roundPos(aim), element: null, side: "light", hit, killed: !!(target && hit && target.hp <= 1), weapon: "shatter" });
  }
  tell(room, `Rune Shatter — a piece flies: 🎲 ${roll} ${signedTerm(bonus)} − 2 (the Shatter's tax) = ${total} vs AC ${ac}${hit ? " — it strikes." : " — it glances away."}`);
  if (target && hit) {
    target.hp -= 1;
    if (target.hp <= 0) fellDark(room, target, caster);
  }
}
function processTransientWorkings(room: Room, now: number, dtSec: number): void {
  for (const w of [...room.workings]) {
    const caster = seatByKey(room, w.ownerKey) ?? null;
    if (w.engine === "bats") {
      if (!w.pos) { room.workings = room.workings.filter(x => x !== w); continue; }
      if (now - (w.bornAt ?? now) >= BATS_LIFE_MS) { room.workings = room.workings.filter(x => x !== w); continue; }
      let target = w.targetId ? room.dark.get(w.targetId) ?? null : null;
      if (!target) { target = strongestDark(room); w.targetId = target?.id ?? null; }
      let gx: number, gy: number, home = false;
      if (target) {
        const orbit = ((now - (w.bornAt ?? now)) / 1000) * 2.4 + (w.id.charCodeAt(0) % 7);
        gx = target.pos.x + Math.cos(orbit) * 46;
        gy = target.pos.y - 6 + Math.sin(orbit) * 26;
      } else if (caster?.pos) { gx = caster.pos.x; gy = caster.pos.y - 58; home = true; }
      else { room.workings = room.workings.filter(x => x !== w); continue; }
      const want = Math.atan2(gy - w.pos.y, gx - w.pos.x);
      let dh = want - (w.heading ?? -Math.PI / 2);
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      const turn = 3.6 * dtSec;
      w.heading = (w.heading ?? -Math.PI / 2) + Math.max(-turn, Math.min(turn, dh));
      const gd = Math.hypot(gx - w.pos.x, gy - w.pos.y);
      const step = Math.max(170, Math.min(520, gd * 2.6)) * dtSec;
      w.pos = { x: w.pos.x + Math.cos(w.heading) * step, y: w.pos.y + Math.sin(w.heading) * step };
      if (home && Math.hypot(w.pos.x - gx, w.pos.y - gy) < 20) { room.workings = room.workings.filter(x => x !== w); continue; }
      if (target && (w.bites ?? 0) < 3 && now >= (w.nextBiteAt ?? Infinity)) {
        if (Math.hypot(w.pos.x - target.pos.x, w.pos.y - target.pos.y) < 130) {
          w.bites = (w.bites ?? 0) + 1;
          w.nextBiteAt = (w.nextBiteAt ?? now) + 3000;
          const dmg = dN(4);
          target.hp -= dmg;
          tell(room, `Bats — bite ${w.bites} of 3: 1d4 = ${dmg}, past all armor (AC never consulted).`);
          if (target.hp <= 0) { fellDark(room, target, caster); w.targetId = null; }
        }
      }
      continue;
    }
    if (w.engine === "holdrune") {
      const target = w.targetId ? room.dark.get(w.targetId) ?? null : null;
      if (!target) { room.workings = room.workings.filter(x => x !== w); continue; }
      w.hex = target.hex;
      w.pos = { ...target.pos };
      if (!w.struckAt) {
        if (now - (w.bornAt ?? now) >= HOLD_RUNE_FORM_MS) {
          w.struckAt = now;
          w.holdUntil = now + HOLD_RUNE_HOLD_MS;
          target.pinnedUntil = Math.max(target.pinnedUntil ?? 0, w.holdUntil);
          tell(room, "Hold Rune — the crash lands: the hold begins (3 s), and the runes keep falling while it holds.");
        }
        continue;
      }
      if (now >= (w.holdUntil ?? 0)) room.workings = room.workings.filter(x => x !== w);
      continue;
    }
    if (w.engine === "shatter") {
      const until = w.streamUntil ?? 0;
      if (!caster) { room.workings = room.workings.filter(x => x !== w); continue; }
      let starved = false;
      while ((w.nextChargeAt ?? Infinity) <= Math.min(now, until)) {
        if (!chargePurse(room, caster, 1)) { starved = true; tell(room, "Rune Shatter — the stream starves: no ✦ left."); break; }
        w.nextChargeAt = (w.nextChargeAt ?? now) + 1000;
        tell(room, "Rune Shatter — the held stream drinks 1 ✦ for its second.");
      }
      if (!starved) {
        const from = caster.pos ?? w.pos ?? { x: 0, y: 0 };
        while ((w.nextPieceAt ?? Infinity) <= Math.min(now, until)) {
          w.nextPieceAt = (w.nextPieceAt ?? now) + SHATTER_STREAM_PIECE_MS;
          if (w.hex) fireShatterPiece(room, caster, { x: from.x, y: from.y - 58 }, w.hex);
        }
      }
      if (starved || now >= until) room.workings = room.workings.filter(x => x !== w);
      continue;
    }
  }
}
/** PASSIVE WALLS (Phase C): a standing Awokin of stone or
 *  root raises walls around the caster on the edges of its
 *  derived hex — passive ward workings whose HP is the
 *  holding rating (hpForCast) at the unit's level: the Seal's
 *  rating for stone, the Trees' for root, the hue the unit's
 *  own element. Maintained on the referee's tick: a broken
 *  edge re-raises ~2.8s later while the unit stands; a real
 *  cast ward on an edge wins and the passive skips it; when
 *  the unit no longer stands on the edge, the wall comes down.
 *  HOW THEY BLOCK — plainly: cast wards at the Table do NOT
 *  block movement anywhere (the dark's steering in integrate
 *  never reads workings); the one interaction the written
 *  light has with a blow is the strike-side answer in
 *  blowOnce (the Seal stops, the Trees absorb, across the
 *  edge between the striker's hex and the victim's). Passive
 *  walls ride THAT interaction, in blowOnce below. */
function maintainPassiveWalls(room: Room, now: number): void {
  room.passiveRearm ??= new Map();
  const desired = new Map<string, { unit: FieldUnit; hexA: string; hexB: string }>();
  for (const u of standingUnits(room)) {
    if (u.card.element !== "stone" && u.card.element !== "root") continue;
    for (const nb of neighborsOf(u.hex)) {
      const key = edgeKeyOf(u.hex, nb);
      if (!desired.has(key)) desired.set(key, { unit: u, hexA: u.hex, hexB: nb });
    }
  }
  // Walls whose sustaining ground is gone come down.
  room.workings = room.workings.filter(w => {
    if (w.engine !== "passive") return true;
    const d = desired.get(edgeKeyOf(w.hexA ?? "", w.hexB ?? ""));
    return !!d && d.unit.ownerKey === w.ownerKey && w.sustainer === unitKeyOf(d.unit);
  });
  // Missing walls rise.
  for (const [key, d] of desired) {
    const onEdge = room.workings.filter(w => w.kind === "ward" && edgeKeyOf(w.hexA ?? "", w.hexB ?? "") === key);
    if (onEdge.some(w => w.engine !== "passive")) continue; // a real cast ward holds this edge — it wins
    if (onEdge.length) continue; // a passive already stands here
    const rearmKey = `${key}|${d.unit.ownerKey}`;
    if (now < (room.passiveRearm.get(rearmKey) ?? 0)) continue;
    const rootKey = d.unit.card.element === "stone" ? "seal" : "trees";
    const hpDef = spellByKey(rootKey);
    if (!hpDef) continue;
    const hp = hpForCast(hpDef, d.unit.card.level ?? 1, 0, false);
    room.workings.push({
      id: randomUUID(), kind: "ward", root: rootKey, engine: "passive", nums: { ...hpDef.numbers },
      name: d.unit.card.element === "stone" ? "Stone Wall" : "Root Wall", hue: d.unit.card.element,
      ownerKey: d.unit.ownerKey, ownerName: d.unit.ownerName, hex: null, hexA: d.hexA, hexB: d.hexB,
      hp, maxHp: hp, pour: 0, stops: 0, charges: 0, sustainer: unitKeyOf(d.unit),
    });
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
    storytellerKey: null, panelAccess: [],
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
    // THE SEAT UNDER THE NEW LAW (Build 1): rests written
    // before the claim-by-button law carry a name but no
    // holder's key. The seat stands unclaimed until it is
    // claimed in the room — a stale name never holds it.
    c.storytellerKey = typeof c.storytellerKey === "string" ? c.storytellerKey : null;
    c.panelAccess = Array.isArray(c.panelAccess) ? c.panelAccess.filter(k => typeof k === "string") : [];
    if (!c.storytellerKey) c.storytenderName = null;
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
function campaignFell(room: Room, enemy: EnemyUnit, _killer: Player | null, groundElement: string | null = null): void {
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
    // THE FELL DRIP (Nigel, 2026-10-20): as the Harvest's
    // EXP divides among the standing, so the fell's drip is
    // rolled for each standing Tender's pools — the bench
    // catches nothing, as it levels on nothing.
    for (const s of seats) if (s.expKey) void payFellDrip(s.expKey, groundElement);
  }
  tell(room, `The ${enemy.label}'s light is harvested — ✦${harvest} joins the bank (✦${c.bank}).`);
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
  tell(room, `The stakes are poured into one bank — ✦${total} of pooled light. What the dark yields joins it; what you cast draws from it; what remains when you turn home divides evenly among you.`);
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
  // The campaign's end is a battle end (build 2): fielded
  // Awokin outside their Tender's party truly dissipate.
  dissipateFieldedNonParty(room);
  if (how === "ended") {
    const seats = [...room.players.values()].filter(p => !p.watcher && !p.storytender);
    const share = seats.length ? Math.floor(c.bank / seats.length) : 0;
    for (const p of seats) p.energy += share;
    tell(room, share > 0
      ? `The campaign turns home. The bank's remaining ✦${c.bank} divides evenly — ✦${share} to each Tender still seated. The instance collapses; the growth goes home with you.`
      : "The campaign turns home. The bank stands empty — what was gathered was spent in the holding, and the growth goes home with you.");
    c.bank = 0;
  } else {
    tell(room, `THE BASTION FALLS. The dark takes the star-seed and the pooled light with it — ✦${c.bank} lost to the curse. This campaign is ended by the enemy's right. Begin again at the lower, poorer pools, when you will — no mark stands against you beyond this tale.`);
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
  // THE SINGLE BLADE NEVER SPRINGS HERE (Nigel, 2026-10-20;
  // re-ruled 2026-10-23 — Recovery R4): engine "blade"
  // waits armed for the click (the looseBlade door), so a
  // dark thing standing on its ground springs nothing —
  // and collects none of the spring's rewards below. One
  // writing stands per hex, so no other rune is masked.
  if (rune.engine === "blade") return;
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
  } else if (rune.engine === "blades" || rune.engine === "springblade") {
    // THE SINGLE BLADE IS NOT HERE (Nigel, 2026-10-20;
    // re-ruled 2026-10-23 — Recovery R4): engine "blade"
    // has no proximity spring at the Table — written, it
    // waits armed for the player's click on a dark thing
    // (the looseBlade door). Its old spring lives on in
    // the Springing Blade below, reckoning unchanged: the
    // Three Blades at power 3, the Springing Blade at the
    // Single Blade spring's own power 6.
    const eff = workingEffects(caster?.expKey);
    const power = (rune.nums.power ?? (rune.engine === "springblade" ? 6 : 3)) + bright * ((rune.nums.brightBonus ?? 1) + (eff.millwright ? 1 : 0))
      // War Runewright (tranche one): sprung on dark that has
      // not yet struck, the writing deals +2.
      + (eff.warRunewright && darkHere.some(e => !e.struck) ? 2 : 0);
    tell(room, `${rune.name} springs — ${power} harm to everything standing on its ground.`);
    let felledByRune = 0;
    for (const e of darkHere) { e.hp -= power; if (e.hp <= 0) { felledByRune++; fellDark(room, e, caster); } }
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
      e.pos = { ...TILE_CENTERS.get(spot)! };
      e.target = null;
      e.lastTile = spot;
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
      // THE FALL IS AN EVENT (Phase C): clients show Nigel's
      // drawn shard-rain.gif over the covered hexes as it falls.
      room.rainFalls = [...(room.rainFalls ?? []).filter(f => Date.now() - f.at < 3000),
        { id: randomUUID(), at: Date.now(), hexes: [...hexSet].filter((h): h is string => !!h) }];
      tell(room, `${rune.name} FALLS — the sky opens over ${hexSet.size} hex${hexSet.size === 1 ? "" : "es"}: ${dice} dice (${rolls.join(" + ")}) make a pool of ${pool}, split over ${foes.length} of the dark — ${share} harm each${rem ? `, and ${rem} of them take one more` : ""}.`);
      for (const e of foes) {
        const d = share + (rem > 0 ? (rem--, 1) : 0);
        e.hp -= d;
        if (e.hp <= 0) fellDark(room, e, caster);
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
      // The slots ride the fall at face value (Nigel,
      // 2026-10-21): the measure the cast carried IS the
      // bonus — +1 harm per filled slot of the cast's
      // element, no rate applied on top.
      const dmg = greatest * (rune.nums.multiplier ?? 2) + rune.pour;
      tell(room, `${rune.name} falls on the whole hex — ${dmg} harm, measured by the greatest standing there.`);
      let felledByShard = 0;
      for (const e of foes) { e.hp -= dmg; if (e.hp <= 0) { felledByShard++; fellDark(room, e, caster); } }
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
      const dmg = strongest.card.power * (w.nums.multiplier ?? 2) + w.pour;
      strongest.hp -= dmg;
      tell(room, `${w.name} went unfed — a doom owed is a doom paid: it falls on ${strongest.card.name}, ${dmg} harm.`);
      if (strongest.hp <= 0) {
        noteDissipation(room, strongest);
        removeUnit(room, strongest);
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
      power: base.power + Math.floor((wave - 1) / 3), hp, maxHp: hp, pinnedUntil: 0, pos: { ...TILE_CENTERS.get(hex)! }, target: null, lastTile: hex,
      // The AC is read live off the kind's workshop record
      // (base 10 + bonus); the wave scaling rides on top.
      armor: enemyACFor(kind) + Math.floor((wave - 1) / 3), lvl: wave, speedGauge: 0,
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
        power: entry.power, hp: entry.hp, maxHp: entry.hp, pinnedUntil: 0, pos: { ...TILE_CENTERS.get(hex)! }, target: null, lastTile: hex,
        armor: (entry as { armor?: number }).armor ?? DARK_ARMOR[entry.kind] ?? 5, lvl: b.tier, speedGauge: 0,
      };
      room.dark.set(foe.id, foe);
    }
  }
  for (const hex of new Set([...room.dark.values()].map(e => e.hex))) springHex(room, hex, new Set());
  room.battle.active = true;
  room.roundNo = 0;
  b.begun = true;
  tell(room, `${b.kind === "siege" ? "The cursed bastion" : "The column"} is met — ${b.size} of the dark stand at the field's edge. ${b.ambush ? "Warned ahead, you strike with the ambush's edge (+1)." : ""} One pool binds you: ✦${b.pool}.`);
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
        sqlite.prepare("UPDATE incursion_columns SET state = 'defeated', resolved_at = ? WHERE owner_key = ? AND target_tile_id = ? AND state IN ('arrived','landed')")
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
  // THE ROADS CLOSE (the Party, build 2): a reinforcement
  // whose battle ends before it arrives NEVER COMES — no
  // membership is written and nothing is dissipated — and
  // the ✦ paid for its road is returned whole to the purse
  // it was charged from (Nigel, 2026-10-21; the refund is
  // the Keeper's pencil). The tale names each closed road,
  // so the silence is never a mystery.
  for (const p of allSeats(room)) {
    if (!p.incoming?.length) continue;
    for (const inc of p.incoming) {
      refundReinforcement(room, p, inc);
      tell(room, `${inc.name} was on the road to ${p.name}'s party — the battle ended first, and the road is closed. It never came, and the ✦${inc.cost} paid for its road is returned whole. No one is lost.`);
    }
    p.incoming = [];
  }
}

/** BATTLE-END DISSIPATION (Nigel, 2026-10-20: "fielding is
 *  open; staying is party-only"; the destination ruled the
 *  same day: "truly dissipate — re-coalescence timers, like
 *  a fall"). Called at the Table's actual end states, AFTER
 *  each mode's own reckoning (a bastion's victory pays its
 *  standing survivors first): every Awokin standing on the
 *  field that is NOT in its Tender's party leaves the field
 *  and takes the fall measure's re-coalescence — the same
 *  dispersed_until the homeland's falls write, four hours —
 *  never a quiet return to the company, and no parallel
 *  timer is invented. Party members standing at the end do not
 *  dissipate. Units of unbound seats carry no roster id and
 *  stand outside the ledger entirely; a unit whose seat is
 *  gone from the room cannot be judged and is left as the
 *  room's other state is left. The tale names what was lost,
 *  by name. */
function dissipateFieldedNonParty(room: Room): void {
  for (const u of [...room.field.values()]) {
    const seat = seatByKey(room, u.ownerKey);
    if (!seat?.expKey || !u.card.awokenId) continue;
    if (isPartyMember(seat.expKey, u.card.awokenId)) continue;
    removeUnit(room, u);
    sqlite.prepare("UPDATE awakened SET dispersed_until = ? WHERE id = ?")
      .run(Date.now() + RECOALESCE_MS, u.card.awokenId);
    tell(room, `${u.card.name} stood outside ${seat.name}'s party when the battle ended — it truly dissipates, and will re-coalesce in four hours, as a fall is measured.`);
  }
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
  // AWAY SEATS (the Anti-Duolingo law): a battle no seated
  // Tender is present to watch does not advance — the world
  // waits rather than punish an absence. (lastTick is left
  // stale on purpose: the tick's dt is capped at a second, so
  // a return never fast-forwards the field.)
  if (![...room.players.values()].some(p => !p.watcher)) return;
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
    // MANIFEST copies fade when their twenty seconds run out.
    if (room.manifests?.length) {
      const kept = room.manifests.filter(m => now < m.expiresAt);
      if (kept.length < room.manifests.length) {
        room.manifests = kept;
        tell(room, "The manifested weapons fade back into the light that lent them.");
      }
    }
    const witness = (from: Pt, to: Pt, element: string | null, side: "light" | "dark", hit: boolean, killed: boolean, weapon?: string | null, extra?: { copy?: boolean; pierce?: boolean }) => {
      if (room.strikes.length < 40) room.strikes.push({ id: (room.strikeSeq = (room.strikeSeq ?? 0) + 1), at: now, from: roundPos(from), to: roundPos(to), element, side, hit, killed, weapon: weapon ?? null, ...(weapon === "arrow" || extra?.pierce ? { pierce: true } : {}), ...(extra?.copy ? { copy: true } : {}) });
    };
    if (beatDue) {
      await refreshGrimoire().catch(() => {});
      room.roundNo++;
    // The Returning Breath and Blood (the Heart's spine,
    // 2026-10-18): at the round's opening, a standing holder
    // breathes — +1✦ on the same purse the felling-harvest
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
    integrate(room, now);
    // GROVES + PASSIVE WALLS (Phase C): positions are derived
    // now — saplings root, groves mend and fade, and stone /
    // root hands raise their passive walls on this same tick.
    processGroves(room, now);
    // THE NEW WORKINGS (Nigel, 2026-10-22; seated 2026-10-23):
    // the swarm's flight and bites, the Hold Rune's crash and
    // grip, and Rune Shatter's held stream, on this same tick.
    processTransientWorkings(room, now, dtSec);
    maintainPassiveWalls(room, now);
    // The standing strike first — under FATE (Nigel,
    // 2026-10-17): a d20 against the dark thing's AC;
    // the element and the level lend the bonus; landed harm
    // is the parts' dice, summed, then mitigated by Diablo's
    // equation. Swifter elements strike again as their
    // speed gauge fills: the gauge banks (speed − 1) a
    // round, and every 5 banked buys another strike.
    const strikeOnce = async (unit: FieldUnit): Promise<void> => {
      let target: EnemyUnit | null = null;
      let best = Infinity;
      for (const e of room.dark.values()) {
        // REACH (Phase B): the light strikes across its
        // element's reach — beyond that, the dark is a shape
        // on the field, not yet a foe in hand.
        const d = distPx(unit.pos, e.pos);
        if (d > (ELEMENT_REACH[unit.card.element] ?? 2) * 69) continue;
        const dd = d - e.hp * 0.01;
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
        + (ownerIsSage(room, unit.ownerKey) ? 2 : 0) // THE SAGE'S COMPANY (Phase C): her Awokin strike at +2
        + (room.bastion?.ambush && room.bastion.begun ? 1 : 0); // the ambush lends its edge to the roll
      const hit = roll === 20 || (roll !== 1 && roll + bonus >= target.armor);
      if (!hit) {
        witness(unit.pos, target.pos, unit.card.element ?? "unaligned", "light", false, false);
        if (roll === 1) tell(room, `${unit.card.name}'s strike goes wide — a cast of one, and the dark keeps its ground.`);
        return;
      }
      let raw = fatePartsDamage(unit.card, roll === 20)
        + (stdWard ? (stdWard.nums.strikeBonus ?? 1) : 0)
        + (bcnWard ? (bcnWard.nums.darkBonus ?? 1) : 0);
      const dmg = fateMitigate(raw, target.armor, unit.card.level ?? 1);
      target.hp -= dmg;
      witness(unit.pos, target.pos, unit.card.element ?? "unaligned", "light", true, target.hp <= 0);
      if (roll === 20) tell(room, `${unit.card.name} rolls a natural twenty — the blow lands true and terrible (${dmg})!`);
      if (target.hp <= 0) {
        room.dark.delete(target.id);
        tell(room, `${unit.card.name} unravels the ${target.label}!`);
        const freedTile = room.map.get(target.hex);
        // The element the ground held as the dark fell on
        // it, read before the freeing — the drip's element.
        const groundElement = freedTile?.element ?? null;
        // Freed ground is NEUTRAL ground (Nigel, 2026-10-20):
        // the felling frees it, it does not attune it.
        if (freedTile) purifyTile(room, freedTile, "neutral");
        const owner = seatByKey(room, unit.ownerKey);
        if (room.campaign && !room.campaign.over) {
          campaignFell(room, target, owner ?? null, groundElement);
        } else if (owner && !owner.fallen) {
          owner.energy = Math.min(owner.maxEnergy + 10, owner.energy + 3); // the harvest
          // The Harvest (the Heart, 2026-10-18): when YOUR
          // Awoken fell the dark, the stars' fellHarvest
          // clauses pay their ✦ on top of the base three.
          const hv = owner.expKey ? heartEffects(owner.expKey).harvestAmount : 0;
          if (hv !== 0) {
            owner.energy = Math.max(0, Math.min(owner.maxEnergy + 10, owner.energy + hv));
          }
          await payBattleExp(room, owner, 2, "The dark pays for its felling.");
          // THE FELL DRIP (Nigel, 2026-10-20): the owner's
          // pools may catch the drip, beside the harvest.
          if (owner.expKey) void payFellDrip(owner.expKey, groundElement);
        }
      }
    };
    for (const unit of [...room.field.values()]) {
      if (!unitStanding(room, unit)) continue;
      if (room.dark.size === 0) break;
      if (isMoving(unit)) continue; // on the move: no strikes
      if ((unit.pinnedUntil ?? 0) > now) continue; // pinned: the moments pass
      if (now < (unit.nextStrike ?? 0)) continue; // the cadence has not come round
      if (![...room.dark.values()].some(e => distPx(unit.pos, e.pos) <= (ELEMENT_REACH[unit.card.element] ?? 2) * 69)) continue;
      unit.nextStrike = now + lightIntervalMs(unit);
      await strikeOnce(unit);
    }
    // THE RUNIC WEAPON STRIKES (Phase B): a Tender's wielded
    // weapon — its key read LIVE at strike time, never
    // snapshotted — strikes the nearest dark in its range,
    // even while its Tender glides (the one exemption).
    // Phase C: the range is the contract's (an attuned weapon
    // reaches as its element reaches; the spear's LONGSHAFT
    // Signature stretches further), the harm roll carries the
    // weapon's level and the sword's KEEN Signature, a
    // Signature arrow PIERCES to the next-nearest dark in the
    // same beat, and Manifest copies strike as their own
    // sources under the same law. One firing routine serves
    // the true weapon and its copies alike.
    const fireWeapon = (p: Player, wk: string, copy: boolean): boolean => {
      if (!p.pos) return false;
      const rangePx = weaponRangeHexOf(p) * 69;
      const inRange = [...room.dark.values()]
        .map(e => ({ e, d: distPx(p.pos!, e.pos) }))
        .filter(x => x.d <= rangePx)
        .sort((a, b) => a.d - b.d);
      if (!inRange.length) return false;
      const strikeFoe = (foe: EnemyUnit, pierce: boolean): void => {
        const roll = dN(20);
        // THE SAGE'S HAND (Nigel, 2026-10-20): +2 to her BASE
        // attack roll — her own blows with the runic weapon
        // aim truer, the buff that makes her a viable
        // mid-range melee. Her COMPANY's +2 attack is a
        // separate law, weighed on her Awokin's strikes in
        // strikeOnce; it is never added here, and this +2 is
        // never added there. One roll site serves the true
        // weapon and its Manifest copies alike, so copies of
        // her weapon carry her aim as they carry her die.
        const atkBonus = fateLevelBonus(p.tenderLevel) + (p.classKey === "sage" ? 2 : 0);
        const hit = roll === 20 || (roll !== 1 && roll + atkBonus >= foe.armor);
        if (!hit) {
          witness(p.pos!, foe.pos, null, "light", false, false, wk, { copy, pierce });
          return;
        }
        const dmg = fateMitigate(weaponDamageOf(p, wk), foe.armor, p.tenderLevel);
        foe.hp -= dmg;
        if (foe.hp <= 0) {
          p.weaponKills = (p.weaponKills ?? 0) + 1;
          witness(p.pos!, foe.pos, null, "light", true, true, wk, { copy, pierce });
          fellDark(room, foe, p);
          tell(room, `${p.name}'s ${wk} unravels the ${foe.label}!`);
        } else {
          witness(p.pos!, foe.pos, null, "light", true, false, wk, { copy, pierce });
        }
      };
      strikeFoe(inRange[0].e, false);
      // PIERCE (the arrow's Signature): the same beat carries
      // through to the next-nearest distinct dark in range.
      if (wk === "arrow" && p.weaponSignature && inRange[1]) strikeFoe(inRange[1].e, true);
      return true;
    };
    for (const p of room.players.values()) {
      if (p.watcher || p.storytender || p.fallen || !p.pos) continue;
      const wk = p.weaponKey ?? null;
      if (!wk || !WEAPON_DIE[wk]) continue;
      if (now < (p.weaponNext ?? 0)) continue;
      if (!fireWeapon(p, wk, false)) continue;
      p.weaponNext = now + WEAPON_COOLDOWN_MS[wk];
    }
    // MANIFEST COPIES STRIKE: each copy its own source on the
    // true weapon's cadence, anchored at its Tender's side.
    if (room.manifests?.length) {
      for (const m of [...room.manifests]) {
        const p = [...room.players.values()].find(pl => pl.key === m.ownerKey);
        if (!p || p.watcher || p.storytender || p.fallen || !p.pos || p.weaponKey !== m.weaponKey) {
          room.manifests = room.manifests.filter(x => x !== m);
          continue;
        }
        for (let i = 0; i < m.count; i++) {
          if (now < (m.nexts[i] ?? 0)) continue;
          if (fireWeapon(p, m.weaponKey, true)) m.nexts[i] = now + WEAPON_COOLDOWN_MS[m.weaponKey];
        }
      }
    }
    // THE DARK ACTS (Phase B): steering (in integrate) has
    // already carried it — toward the nearest standing light,
    // or the seed, halting at claw's reach and at the gate.
    // Here it only claws what stands within 69px, drains (the
    // Hollow), or, with no light standing, claws a bare Tender
    // at the gate. The Hollow only drifts and drains, at a rate.
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
      const standing = standingUnits(room);
      const inReach = standing.filter(u => distPx(enemy.pos, u.pos) <= 69);
      if (enemy.kind === "hollow") {
        // It never claws: steering in integrate moves and
        // halts it; here it only drains (above).
        continue;
      }
      // BULWARK (Recovery R12): a shield within claw's reach
      // is hit INSTEAD of any light standing no nearer — the
      // dark meets the line before it meets what the line
      // guards. The shield takes the blow's POWER (the
      // Seal's own Table measure: "every blow it stops costs
      // it that blow's power"), falls at 0 HP, and the line
      // opens where it fell; and the hit SHOVES THE STRIKER
      // BACK one tile (69px) along the line from the shield
      // to the striker — the ruling's knock back, at the
      // homeland line's own measure. No AC is reckoned here:
      // the hit is the meeting, as the homeland's hack has
      // never rolled; the dropped enemy ACs (enemyACFor —
      // Fray 11, Hollow 12, Unraveler 13, Tangle 15) stand
      // untouched in the rolls that read them (strikeOnce,
      // the runic weapon), and no pre-drop figure enters.
      {
        const hitShield = nearestBulwarkShield(room, enemy.pos, 69);
        const nearestUnitD = inReach.length ? Math.min(...inReach.map(u => distPx(enemy.pos, u.pos))) : Infinity;
        if (hitShield && hitShield.d <= nearestUnitD) {
          if (now < (enemy.nextStrike ?? 0)) continue;
          enemy.nextStrike = now + darkIntervalMs(enemy);
          enemy.struck = true;
          const { w, s } = hitShield;
          s.hp -= enemy.power;
          w.hp = (w.shields ?? []).reduce((sum, x) => sum + Math.max(0, x.hp), 0);
          const kb = Math.hypot(enemy.pos.x - s.x, enemy.pos.y - s.y);
          let ux = kb > 0 ? (enemy.pos.x - s.x) / kb : 0, uy = kb > 0 ? (enemy.pos.y - s.y) / kb : -1;
          if (kb === 0) { const sc = TILE_CENTERS.get(SEED_TILE)!; const sl = Math.hypot(enemy.pos.x - sc.x, enemy.pos.y - sc.y) || 1; ux = (enemy.pos.x - sc.x) / sl; uy = (enemy.pos.y - sc.y) / sl; }
          enemy.pos = { x: enemy.pos.x + ux * 69, y: enemy.pos.y + uy * 69 };
          enemy.target = null;
          witness(s, enemy.pos, w.hue && w.hue !== "unaligned" ? w.hue : "unaligned", "dark", true, s.hp <= 0);
          if (s.hp <= 0) {
            w.shields = (w.shields ?? []).filter(x => x.hp > 0);
            tell(room, `A shield of ${w.name} is struck through and falls — the ${enemy.label} is shoved back, and the line opens there.`);
            if (!w.shields.length) {
              room.workings = room.workings.filter(x => x !== w);
              tell(room, `${w.name} stands no more — its last shield has fallen.`);
            }
          } else {
            tell(room, `${w.name}'s shield takes the ${enemy.label}'s blow (${s.hp} HP stands) — and shoves it back.`);
          }
          continue;
        }
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
          const standingNow = standingUnits(room).filter(u => distPx(enemy.pos, u.pos) <= 69);
          if (!standingNow.length) return;
          let victim: FieldUnit;
          if (enemy.kind === "unraveler") victim = standingNow.reduce((a, b) => (b.card.power > a.card.power ? b : a));
          else if (enemy.kind === "fray") victim = standingNow.reduce((a, b) => (b.hp < a.hp ? b : a));
          else victim = standingNow[Math.floor(Math.random() * standingNow.length)];
          enemy.struck = true;
          const roll = dN(20);
          const bonus = fateLevelBonus(enemy.lvl);
          // THE AWOKIN'S AC, one reckoning (awokinAcFor): its
          // toughness, its Tender's company AC — THE WARDEN'S
          // +4 and THE SAGE'S +2 alike (the Company Bonuses,
          // Recovery R7) — and the prepared bastion's walls.
          const ac = awokinAcFor(room, victim);
          const hit = roll === 20 || (roll !== 1 && roll + bonus >= ac);
          if (!hit) {
            witness(enemy.pos, victim.pos, "dark", "dark", false, false);
            if (roll === 1) tell(room, `The ${enemy.label}'s blow goes wide — a cast of one.`);
            return;
          }
          // Brand Walker (tranche one): dark standing beside
          // a holder's FIRE working strikes at −1 power —
          // lit, and wary.
          const wary = room.workings.some(w => w.hue === "fire"
            && workingEffects(seatByKey(room, w.ownerKey)?.expKey).brandWalker
            && workingBeside(w, enemy.hex));
          // FATE'S MITIGATION reads the victim's own hide: its
          // toughness plus its Tender's company AC (the
          // Warden's +4, the Sage's +2 — the Company Bonuses,
          // Recovery R7), the same term the homeland's
          // victimAC carries into homelandFateMitigate. The
          // bastion's +3 stands only in the roll above: walls
          // turn blows aside, they do not thicken the hide.
          let dmg = fateMitigate(fateDarkDamage(wary ? { ...enemy, power: Math.max(0, enemy.power - 1) } : enemy, roll === 20), victim.card.toughness + companyAcBonusFor(seatByKey(room, victim.ownerKey)?.classKey), enemy.lvl);
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
                  if (nDark.hp <= 0) fellDark(room, nDark, sealSeat ?? null);
                }
              }
            }
            witness(victim.pos, enemy.pos, seal.hue && seal.hue !== "unaligned" ? seal.hue : "unaligned", "light", true, enemy.hp <= 0);
            // The Seal's health rating (Nigel, 2026-10-17):
            // every blow it stops costs it that blow's power.
            seal.hp -= enemy.power;
            tell(room, `${seal.name} stops the ${enemy.label}'s strike cold — and answers it.`);
            if (enemy.hp <= 0) {
              room.dark.delete(enemy.id);
              tell(room, `The ${enemy.label} unravels on the Seal's light!`);
              const freedTile = room.map.get(enemy.hex);
              // The element the ground held as the dark fell
              // on it, read before the freeing — the drip's.
              const groundElement = freedTile?.element ?? null;
              // Freed ground is NEUTRAL ground (Nigel,
              // 2026-10-20): the Seal's answer frees it, it
              // does not attune it — only the Tender attunes.
              if (freedTile) purifyTile(room, freedTile, "neutral");
              const owner = seatByKey(room, seal.ownerKey);
              if (room.campaign && !room.campaign.over) {
                campaignFell(room, enemy, owner ?? null, groundElement);
              } else if (owner && !owner.fallen) {
                owner.energy = Math.min(owner.maxEnergy + 10, owner.energy + 3);
                await payBattleExp(room, owner, 2, "The dark pays for its felling.");
                // THE FELL DRIP (Nigel, 2026-10-20): the
                // Seal's Tender may catch the drip too.
                if (owner.expKey) void payFellDrip(owner.expKey, groundElement);
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
          // PASSIVE WALLS (Phase C): a stone / root hand's wall
          // on the edge between the striker's hex and the
          // victim's takes the blow the way the Trees do —
          // whoever owns the victim; a wall is a wall. (This
          // strike-side answer is the only blocking the Table's
          // wards have ever had: movement is never blocked.)
          const passiveWall = room.workings.find(w => w.kind === "ward" && w.engine === "passive" &&
            ((w.hexA === enemy.hex && w.hexB === victim.hex) || (w.hexA === victim.hex && w.hexB === enemy.hex)));
          if (dmg > 0 && passiveWall) {
            passiveWall.hp -= dmg;
            dmg = 0;
            tell(room, `${passiveWall.name} takes the blow meant for ${victim.card.name}.`);
            if (passiveWall.hp <= 0) {
              room.workings = room.workings.filter(w => w !== passiveWall);
              room.passiveRearm ??= new Map();
              room.passiveRearm.set(`${edgeKeyOf(passiveWall.hexA ?? "", passiveWall.hexB ?? "")}|${passiveWall.ownerKey}`, now + BEAT_MS);
              tell(room, `${passiveWall.name} is broken — the hand that raised it will raise it again.`);
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
          witness(enemy.pos, victim.pos, "dark", "dark", true, felled);
          if (roll === 20) tell(room, `The ${enemy.label} rolls a natural twenty — the blow lands true and terrible!`);
          if (felled) {
            noteDissipation(room, victim);
            removeUnit(room, victim);
            tell(room, `The ${enemy.label} unravels ${victim.card.name} — it dissipates to its Tender's roster.`);
          }
        };
        await blowOnce();
      } else if (standing.length === 0) {
        // Nothing stands: the shield law leaves the Tenders
        // bare — but the blow lands only at the gate. Beyond
        // it, steering brings the dark on.
        if (ringOf(enemy.hex) > 1) continue;
        if (now < (enemy.nextStrike ?? 0)) continue;
        enemy.nextStrike = now + darkIntervalMs(enemy);
        const bare = [...room.players.values()].filter(p => !p.watcher && !p.storytender && !p.fallen);
        if (bare.length === 0) continue;
        const tender = bare[Math.floor(Math.random() * bare.length)];
        // The Thickened Skin (the Heart's spine, 2026-10-18):
        // strikes against the Tender are blunted by the
        // stars' tenderSkin clauses, never below 1.
        const skinAmt = tender.expKey ? heartEffects(tender.expKey).skinAmount : 0;
        // The bare Tender's AC: 10 plus the runic weapon's
        // guard, its key read LIVE (Phase B) — plus one more
        // for AEGIS, the Sword & Shield's Signature (Phase C;
        // this bare-Tender path only, never acBonusOf).
        const wac = (WEAPON_AC[tender.weaponKey ?? ""] ?? 0)
          + (tender.weaponKey === "swordshield" && tender.weaponSignature ? 1 : 0);
        const roll = dN(20);
        // THE PREPARED BASTION (Station 4): the host himself
        // stands behind the same walls as his Awokin.
        const ac = 10 + wac + (room.bastion?.prepared && tender.expKey === room.bastion.hostKey ? 3 : 0);
        const hit = roll === 20 || (roll !== 1 && roll + fateLevelBonus(enemy.lvl) >= ac);
        if (tender.pos) witness(enemy.pos, tender.pos, "dark", "dark", hit, false);
        if (hit) {
          const blow = Math.max(1, enemy.power - skinAmt);
          tender.tenderHp -= blow;
          if (tender.tenderHp <= 0) {
            tender.tenderHp = 0;
            tender.fallen = true;
            tell(room, `${tender.name} has fallen. The Bastion mourns — and fights on.`);
          }
        }
      } else {
        // Light stands, but beyond claw's reach: steering
        // (in integrate) closes the distance.
      }
    }
    // THE CURSE WITHERS, THE LIGHT GRINDS — settled by
    // settleCurseWithering below, on this same clock; the
    // workings written on cursed ground wither beside their
    // guests, by settleWorkingWithering. Both also run on the
    // room's standing pulse when no battle is called (the
    // fix of 2026-10-20: the curse does not wait for a wave).
    settleCurseWithering(room, dtSec);
    settleWorkingWithering(room, dtSec);
    settleStandingAttunement(room, dtSec);
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
      const exposed = [...room.dark.values()].filter(e => !isMoving(e) && ringOf(e.hex) <= 1 && !standing.some(u => distPx(u.pos, e.pos) <= (ELEMENT_REACH[u.card.element] ?? 2) * 69));
      if (exposed.length) {
        const drain = exposed.reduce((s, e) => s + e.power, 0) * dtSec / (BEAT_MS / 1000);
        if (drain > 0) {
          c.bank = Math.max(0, c.bank - drain);
          if (now - (room.assaultToldAt ?? 0) > 5000 || c.bank <= 0) {
            room.assaultToldAt = now;
            tell(room, `No light guards the heart — the dark turns on the star-seed. The bank bleeds (✦${Math.floor(c.bank)} remains). March a guard to the gate, cast something, anything, or lose the light.`);
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
        tell(room, `The Unraveling is broken. The bank stands at ✦${Math.floor(room.campaign.bank)} — the Storytender may deal again, call a rest, or turn the campaign home.`);
        room.battle.wave++;
      } else {
        tell(room, `Wave ${room.battle.wave} is broken. The field breathes again.`);
        for (const p of seatedAlive) {
          p.energy = Math.min(p.maxEnergy + 10, p.energy + 5);
          await payBattleExp(room, p, 5, "A wave broken together pays together.");
        }
        room.battle.wave++;
      }
      // The battle has ended (build 2): after the mode's
      // own reckoning above, fielded non-party Awokin
      // truly dissipate.
      dissipateFieldedNonParty(room);
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
      // The battle has ended in the dark's keeping (build
      // 2): fielded non-party Awokin truly dissipate.
      dissipateFieldedNonParty(room);
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
    // call's own room — their company, their standing, and
    // their Awoken travel with them. The key is the invitation:
    // any open call's key seats whoever carries it.
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
      player.hex = undefined;
      player.pos = undefined;
      player.target = null;
      assignLanding(room, player);
      ensureTenderHex(room, player);
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
      let joinCall: any = null;
      if (typeof msg.callKey === "string" && msg.callKey.trim()) {
        const k = msg.callKey.toUpperCase().replace(/[^A-Z0-9]/g, "");
        const call = sqlite.prepare("SELECT id, kind, owner_key FROM bastion_calls WHERE join_key = ? AND state = 'open'").get(k) as any;
        if (!call) { fail("No open call answers to that key — it may have ended, or the key is mistyped."); return; }
        joinCall = call;
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
      // AWAY SEATS (Nigel, 2026-10-19): a returning Tender is
      // handed their own seat back whole — never re-dealt,
      // never re-landed. Two roads home: the same identity
      // still sits live on a stale socket (the new arrival
      // takes the seat over), or the seat stands held in the
      // away registry since their connection dropped.
      if (!watcher) {
        for (const [oldWs, seated] of room.players) {
          if (seated.key !== key) continue;
          room.players.delete(oldWs);
          try { oldWs.close(); } catch {}
          player = seated;
          room.players.set(ws, player);
          tell(room, `${player.name} returns to the Table — their seat was held.`);
          sendState(room);
          return;
        }
        const heldSeat = room.away.get(key);
        if (heldSeat) {
          room.away.delete(key);
          player = heldSeat.player;
          room.players.set(ws, player);
          tell(room, `${player.name} returns to the Table — their seat was held.`);
          sendState(room);
          return;
        }
      }
      // THE STORYTELLER'S SEAT (Campaign Build 1, Nigel,
      // 2026-10-21): no one arrives AS the storyteller. Every
      // participant takes an ordinary seat at the door; the
      // campaign's storyteller seat stands unclaimed until a
      // seated participant claims it in the room (the
      // claimStoryteller road below), and the campaign record
      // — never the door — says who holds it. A returning
      // holder's seat comes back whole through the reclaim
      // roads above, flag and all.
      const seatedCount = [...room.players.values()].filter(p => !p.watcher).length
        + [...room.away.values()].filter(h => !h.player.watcher).length;
      if (!watcher && seatedCount >= MAX_SEATED) watcher = true; // a full table seats no ninth tender; watchers are welcome
      const profile = watcher ? { notes: "", inventory: [] as string[] } : await loadProfile(key, name);
      // A bound seat's wheel company is its Tender's party
      // (the strict party law), and its energy is that
      // roster's own calculation by the game's one law — all
      // of it. An unbound seat brings the whole stand-in pool
      // as its company and a stand-in's portion of energy.
      // Nothing is DEALT any more (the wheel law, 2026-10-21):
      // the company is built, in the party's own order.
      let company: TableCard[] = [];
      let companySource: TableCard[] | undefined;
      let elsewhereCards: { name: string; element: string; where: "fielded" | "staged" }[] = [];
      let bound: string | null = null;
      let stagedDeal = false;
      let energy = 12;
      let maxEnergy = 12;
      let tenderLevel = 1;
      let healTier = healTierForLevel(1);
      let healAmount = healAmountForLevel(1);
      let wardRuneUnlocked = false;
      let maxTenderHp = tenderMaxHpForLevel(1);
      let expKey: string | null = null;
      let boundClassKey: string | null = null;
      let boundWeaponKey: string | null = null;
      let boundWeaponContract: WeaponContract | null = null;
      if (!watcher && key.startsWith("discord:")) {
        const tenderId = await bindingFor(key.slice("discord:".length));
        if (tenderId !== null) {
          // An INSTANCE's host (Station 4) brings the staged
          // company alone as its wheel company — the bastion's
          // cargo, from the first push; any other seat, and any
          // guest of the instance, brings its party.
          const instanceHost = joinCall?.kind === "instance" && joinCall.owner_key === tenderOwnerKey(tenderId);
          stagedDeal = instanceHost;
          const cards = await companyForTender(tenderId, instanceHost ? { stagedOnly: true } : undefined).catch(() => [] as TableCard[]);
          // A BOUND SEAT IS ITS TENDER'S, EMPTY COMPANY OR NO
          // (the strict party law, 2026-10-21): the build
          // above brings the party alone, so a Tender who
          // keeps no party has NO company — nothing summonable
          // — and the seat must still stand bound (its energy,
          // its class, its party display), or the Zodiac's
          // deck screen could never fill its party and the
          // strict law would strand the unprepared at a
          // stand-in's table. The stand-in pool below is for
          // seats with no Tender behind them at all — never
          // for a bound Tender whose party is simply
          // uncomposed. (The class was already read on the
          // empty road before, found 2026-10-20, so the figure
          // at the Table is the Tender's true class.)
          company = cards;
          // The company's honest margin (the Fix Pass): who
          // was kept back for place, and where they stand.
          elsewhereCards = await elsewhereForTender(tenderId, instanceHost ? { stagedOnly: true } : undefined).catch(() => [] as { name: string; element: string; where: "fielded" | "staged" }[]);
          bound = await tenderDisplayName(tenderId);
          maxEnergy = await calculateMaxEnergy(tenderOwnerKey(tenderId)).catch(() => 12);
          energy = maxEnergy;
          expKey = tenderOwnerKey(tenderId);
          const progress = await getTenderProgress(tenderOwnerKey(tenderId)).catch(() => null);
          boundClassKey = progress?.classKey ?? null;
          boundWeaponKey = progress?.weaponKey ?? null;
          // The initially wielded weapon's contract rides the
          // seat from the first state push (Phase C).
          if (boundWeaponKey) boundWeaponContract = await weaponContractFor(expKey, boundWeaponKey);
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
      if (!watcher && !bound) {
        companySource = TEST_POOL.map(c => ({ ...c, id: randomUUID(), parts: [
          { element: c.element, power: Math.ceil(c.power / 2) },
          { element: c.element, power: Math.floor(c.power / 2) },
          { element: c.element, power: 0 },
        ] }));
        company = companySource;
        energy = 12;
        maxEnergy = 12;
      }
      player = { key, name, watcher, storytender: false, company, companySource, notes: profile.notes, inventory: profile.inventory, bound, stagedDeal, classKey: boundClassKey, weaponKey: boundWeaponKey, weaponLevel: boundWeaponContract?.level ?? 1, weaponElement: boundWeaponContract?.element ?? null, weaponDepth: boundWeaponContract?.depth ?? 0, weaponManifest: boundWeaponContract?.manifest ?? false, weaponSignature: boundWeaponContract?.signature ?? false, energy, maxEnergy, standingMaxEnergy: expKey ? maxEnergy : undefined, tenderLevel, healTier, healAmount, wardRuneUnlocked, tenderHp: maxTenderHp, maxTenderHp, fallen: false, expKey, pools: expKey ? await attunementPools(expKey).catch(() => null) : null, castHues: expKey ? await castHuesFor(expKey).catch(() => ({})) : {}, castHuesAt: Date.now(), elsewhere: elsewhereCards };
      room.players.set(ws, player);
      assignLanding(room, player);
      ensureTenderHex(room, player);
      if (!watcher && room.campaign?.seeded && !room.campaign.over && player.energy > 0) {
        // A late stake joins the pot entire (the Risk of
        // Confluence runs both ways: arrive invested).
        room.campaign.bank += player.energy;
        tell(room, `${name}'s stake of ✦${player.energy} joins the bank (✦${room.campaign.bank}).`);
        player.energy = 0;
      }
      if (!watcher) {
        tell(room, `${name} takes a seat at the Table.`);
      }
      sendState(room);
      return;
    }

    if (!room || !player) return;

    // WIELD ON THE WIRE (Phase C): a seated, bound Tender takes
    // another of the four weapons in hand, mid-room, freely —
    // the same law wieldWeapon keeps on the site: the pointer
    // in tender_progress moves, nothing else is spent. The
    // seat's live record follows at once (key + the new
    // weapon's contract, read fresh), and any live Manifest
    // copies of the old weapon are dismissed in the same beat.
    if (msg.type === "wield") {
      if (player.watcher) {
        ws.send(JSON.stringify({ type: "error", message: "Watchers hold no weapon — bind in the game to take a seat." }));
        return;
      }
      if (player.storytender) {
        ws.send(JSON.stringify({ type: "error", message: "The Storytender holds no weapon — she deals the dark, not the light." }));
        return;
      }
      if (!player.expKey) {
        ws.send(JSON.stringify({ type: "error", message: "Only a bound Tender holds the arsenal — bind in the game first." }));
        return;
      }
      const weaponKey = String(msg.weaponKey ?? "");
      if (!WEAPON_KEYS.includes(weaponKey)) {
        ws.send(JSON.stringify({ type: "error", message: "Name one of the four: Sword & Shield, Sword, Spear, or Arrow." }));
        return;
      }
      // Dismissal and the key land BEFORE the fresh contract is
      // read, so even a tick interleaved with the read never
      // shows copies of a weapon no longer in hand.
      dismissManifests(room, player.key);
      player.weaponKey = weaponKey;
      player.weaponNext = 0;
      try {
        sqlite.prepare("INSERT OR IGNORE INTO tender_progress (owner_key, total_exp, lifetime_wakes, updated_at) VALUES (?, 0, 0, ?)")
          .run(player.expKey, Date.now());
        sqlite.prepare("UPDATE tender_progress SET weapon_key = ? WHERE owner_key = ?")
          .run(weaponKey, player.expKey);
      } catch { /* the pointer is a courtesy copy; the seat's live record below is the room's truth */ }
      applyWeaponContract(player, await weaponContractFor(player.expKey, weaponKey));
      tell(room, `${player.name} takes the ${weaponKey} in hand.`);
      sendState(room);
      return;
    }

    // MANIFEST (Phase C): the wielded weapon doubles in the air
    // — one copy, or two for a Tender whose weapon carries the
    // Manifest node — at ✦4 from the purse every cast draws on
    // (the campaign bank, in a seeded campaign). The copies
    // strike as their own sources for twenty seconds, then
    // fade; a wield-switch dismisses them at once.
    if (msg.type === "manifest") {
      if (player.watcher) {
        ws.send(JSON.stringify({ type: "error", message: "Watchers hold no weapon to manifest — bind in the game to take a seat." }));
        return;
      }
      if (player.storytender) {
        ws.send(JSON.stringify({ type: "error", message: "The Storytender holds no weapon — she deals the dark, not the light." }));
        return;
      }
      if (player.fallen) {
        ws.send(JSON.stringify({ type: "error", message: "You have fallen — you will rise between waves." }));
        return;
      }
      if (!player.expKey) {
        ws.send(JSON.stringify({ type: "error", message: "Only a bound Tender holds the arsenal — bind in the game first." }));
        return;
      }
      const wk = player.weaponKey ?? null;
      if (!wk || !WEAPON_DIE[wk]) {
        ws.send(JSON.stringify({ type: "error", message: "No runic weapon floats at your side — the choosing grants the first." }));
        return;
      }
      const cost = 4;
      if (!chargePurse(room, player, cost)) {
        ws.send(JSON.stringify({ type: "error", message: `Manifest costs ✦${cost} — ${room.campaign && !room.campaign.over && room.campaign.seeded ? `the bank holds ✦${Math.floor(room.campaign.bank)}` : `you hold ✦${player.energy}`}.` }));
        return;
      }
      const copies = 1 + (player.weaponManifest ? 1 : 0);
      const nowM = Date.now();
      const myKey = player.key;
      room.manifests = [
        ...(room.manifests ?? []).filter(m => m.ownerKey !== myKey),
        { ownerKey: myKey, weaponKey: wk, count: copies, expiresAt: nowM + 20_000, nexts: Array.from({ length: copies }, (_, i) => nowM + i * 200) },
      ];
      tell(room, `${player.name}'s ${wk} doubles in the air — ${copies === 1 ? "a manifested copy hangs" : `${copies} manifested copies hang`} beside the true weapon (✦${cost}).`);
      sendState(room);
      return;
    }

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

    // THE STORYTELLER'S SEAT — CLAIMED IN THE ROOM (Campaign
    // Build 1, Nigel, 2026-10-21: "only the storyteller UI
    // belongs to the storyteller who claims the seat with a
    // button if it is unclaimed"). The campaign record holds
    // the seat: while a holder's key stands on it — seated,
    // or stepped away within the grace — no second claim
    // lands. The holder's seat lapsing past the grace (the
    // reaper's work) is what frees it.
    if (msg.type === "claimStoryteller") {
      if (!room.campaign) {
        ws.send(JSON.stringify({ type: "error", message: "There is no Storyteller's seat at a casual table — it belongs to a campaign." }));
        return;
      }
      if (player.watcher) {
        ws.send(JSON.stringify({ type: "error", message: "Watchers hold no seat to claim from — take a seat at the table first." }));
        return;
      }
      const c = room.campaign;
      if (c.storytellerKey === player.key) { sendState(room); return; }
      if (c.storytellerKey) {
        ws.send(JSON.stringify({ type: "error", message: `The Storyteller's seat is held by ${c.storytenderName ?? "another"} — it stands claimed until its holder's seat lapses.` }));
        return;
      }
      c.storytellerKey = player.key;
      c.storytenderName = player.name;
      player.storytender = true;
      tell(room, `📖 ${player.name} claims the Storyteller's seat — the dealing, the scene, and the sky are theirs to hold.`);
      saveCampaign(room);
      sendState(room);
      return;
    }

    // GRANTING THE PANEL (Build 1): the seated storyteller
    // opens the storyteller's panel to another participant —
    // "to help build an encounter together" — or closes it
    // again. Build 1 records the permission and shows it;
    // the console itself arrives in Build 2.
    if (msg.type === "grantPanel" || msg.type === "revokePanel") {
      if (!room.campaign || !player.storytender || room.campaign.storytellerKey !== player.key) {
        ws.send(JSON.stringify({ type: "error", message: "Only the seated Storyteller grants the panel." }));
        return;
      }
      const target = seatByKey(room, String(msg.targetKey ?? ""));
      if (!target || target.watcher) {
        ws.send(JSON.stringify({ type: "error", message: "That is no seated participant of this table." }));
        return;
      }
      if (target.key === player.key) {
        ws.send(JSON.stringify({ type: "error", message: "The seat itself holds the panel — there is nothing to grant yourself." }));
        return;
      }
      const c = room.campaign;
      if (msg.type === "grantPanel") {
        if (!c.panelAccess.includes(target.key)) {
          c.panelAccess.push(target.key);
          tell(room, `📖 ${player.name} opens the Storyteller's panel to ${target.name} — they build this encounter together.`);
        }
      } else if (c.panelAccess.includes(target.key)) {
        c.panelAccess = c.panelAccess.filter(k => k !== target.key);
        tell(room, `📖 The Storyteller's panel closes to ${target.name}.`);
      }
      saveCampaign(room);
      sendState(room);
      return;
    }

    if (msg.type === "summon") {
      // The hand-era summon message (Nigel, 2026-10-21): the
      // road is retired — a stale client hears it plainly
      // rather than silence.
      ws.send(JSON.stringify({ type: "error", message: "The dealt hand no longer answers — summoning rides the action wheel now: open its Awoken branch, choose a member of your party, and tap the ground at your side to cast the call." }));
      return;
    }

    // THE SUMMON CAST (Nigel, 2026-10-21 16:26 — the wheel
    // law, replacing the hand's summon road whole): "tenders
    // are now the only way to summon awoken in these modes.
    // summoning awokin is done through the action wheel" —
    // and it is a CAST: the wheel's Awoken branch names a
    // member of the tender's company, a landing tile is
    // tapped, and this road rolls for the call. The center
    // hex is the star-seed and is never stood upon.
    if (msg.type === "summonCast") {
      if (player.fallen) {
        ws.send(JSON.stringify({ type: "error", message: "You have fallen — you will rise between waves." }));
        return;
      }
      if (player.watcher) {
        ws.send(JSON.stringify({ type: "error", message: "Watchers hold no company to call from." }));
        return;
      }
      if (player.storytender) {
        ws.send(JSON.stringify({ type: "error", message: "The Storytender holds no company — she deals the dark, not the light." }));
        return;
      }
      // THE LANDING (Nigel, 2026-10-22 — the summoning fix:
      // "awoken just summon near the tender when summoned
      // they dont need a target"): the cast no longer DEMANDS
      // a named hex. The game's doors name none — the pick is
      // the cast, and the server chooses the landing below:
      // the Tender's own hex, or a free one beside it. A hex
      // still named by an older road is judged by the
      // at-your-side law, as ever — it is never an aim across
      // the map.
      const namedHex = typeof msg.hex === "string" && msg.hex ? msg.hex : null;
      let hex: string | null = namedHex;
      if (namedHex !== null) {
        const tile = room.map.get(namedHex);
        if (!tile) {
          ws.send(JSON.stringify({ type: "error", message: "That is no tile of this land." }));
          return;
        }
        if (namedHex === SEED_TILE) {
          ws.send(JSON.stringify({ type: "error", message: "An Awokin stands on the land — the center tile is the star-seed's." }));
          return;
        }
      }
      // Resolve the called member from the wheel's company —
      // a bound seat's party member by its ledger id, an
      // unbound seat's stand-in by its card id. The company
      // already holds only the callable (party members, or
      // the staged company, or the pool — never the fielded),
      // so a name outside it is refused here, at the cast
      // itself: the wheel calls nothing the company does not.
      const awakenedId = typeof msg.awakenedId === "number" ? msg.awakenedId : null;
      const cardId = typeof msg.cardId === "string" ? msg.cardId : null;
      const card = awakenedId !== null
        ? (player.company ?? []).find(c => c.awokenId === awakenedId)
        : cardId !== null
          ? (player.company ?? []).find(c => c.id === cardId)
          : undefined;
      if (!card) {
        ws.send(JSON.stringify({ type: "error", message: player.expKey && !player.stagedDeal
          ? "That Awokin is not in your party — the party is who you can summon, and only members not already standing. Fill a spot from the Party tab of your Zodiac; the fill lands at once, and the wheel's cast is the only gate."
          : "That Awokin is not in your company — the wheel calls only the company it lists, and only members not already standing." }));
        return;
      }
      // THE PARTY IS WHO YOU CAN SUMMON (Nigel, 2026-10-21;
      // the strict reading, ruled the same day): "the party
      // is the ONLY Awoken a Tender can summon" — the cast
      // road itself refuses a non-member, so no staleness (a
      // member benched since the company was last built, say)
      // can put one on the field. The instance host's staged
      // company (Station 4) stands as its own exception — its
      // seat is marked stagedDeal, at the join or the claim.
      if (player.expKey && !player.stagedDeal && typeof card.awokenId === "number"
        && !isPartyMember(player.expKey, card.awokenId)) {
        ws.send(JSON.stringify({ type: "error", message: `${card.name} is not in your party — the party is who you can summon. Fill a spot from the Party tab of your Zodiac; the fill lands at once, and the wheel's cast is the only gate.` }));
        return;
      }
      // Already standing: the company sets the fielded aside,
      // and the field itself has the last word (a cast racing
      // a refresh is still refused plainly, never doubled).
      const myKey0 = player.key;
      if ([...room.field.values()].some(u => u.ownerKey === myKey0
        && (typeof card.awokenId === "number" ? u.card.awokenId === card.awokenId : u.card.id === card.id))) {
        ws.send(JSON.stringify({ type: "error", message: `${card.name} already stands on the field.` }));
        return;
      }
      // SUMMON AT YOUR SIDE (Nigel, 2026-10-19): the light
      // answers where the Tender stands — their own hex, or
      // one beside it. No more calling across the map. Since
      // the summoning fix (Nigel, 2026-10-22) the distance is
      // the SERVER'S placement rule, not the player's aim:
      // a named hex is still refused beyond it; an unnamed
      // cast lands on the Tender's own hex, or the first
      // beside-hex with room to stand.
      if (hex !== null) {
        if (!player.hex || axialDist(player.hex, hex) > 1) {
          ws.send(JSON.stringify({ type: "error", message: "Your Awokin answers at your side — summon onto your own hex, or one beside it." }));
          return;
        }
      } else {
        if (!player.hex) {
          ws.send(JSON.stringify({ type: "error", message: "You stand nowhere — there is no side to summon at." }));
          return;
        }
        const rm: Room = room;
        const cands = [player.hex, ...neighborsOf(player.hex)];
        hex = cands.find(h => h !== SEED_TILE && rm.map.has(h) && unitsAt(rm, h).length < STACK_CAP) ?? null;
        if (!hex) {
          ws.send(JSON.stringify({ type: "error", message: "No ground at your side can hold them — every tile around you stands full." }));
          return;
        }
      }
      // THE LANDING MAY BE CURSED OR HELD (Nigel, 2026-10-21
      // 16:26): "tenders can summon in the cursed lands" —
      // the cleansed-only restriction this road used to keep
      // (2026-10-18) is SUPERSEDED. What the curse costs now
      // is in the cast itself: the −3 below, when the CASTER
      // stands in it.
      if (unitsAt(room, hex).length >= STACK_CAP) {
        ws.send(JSON.stringify({ type: "error", message: `That tile stands full — ${STACK_CAP} of the light to a tile, by the March law.` }));
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
      // THE PURSE, MATCHED TO THE TABLE'S SPELL DOORS
      // (castWard / castRune, and castMapWorking's law on both
      // grounds): the price is charged BEFORE the roll — so a
      // faltering call still spends it, exactly as a fizzled
      // working spends its energy (castUnravels). A begun
      // bastion charges its one pool instead, as the old
      // summon road did.
      // THE WITCH'S COMPANY PRICE (Recovery R7): the summon
      // is a cast like any other — while a party member she
      // has cast stands, this one costs her half.
      const cost = witchCompanyPrice(room, player, castCost(room, player, card));
      let fromBastionPool = false;
      if (room.bastion?.begun && !room.bastion.resolved) {
        // One pool binds the muster (Nigel, 2026-10-17): joining
        // Tenders' energy joins the pool, scaled by level.
        if (room.bastion.pool < cost) {
          ws.send(JSON.stringify({ type: "error", message: `${card.name} costs ✦${cost} — the pool holds ✦${room.bastion.pool}.` }));
          return;
        }
        room.bastion.pool -= cost;
        fromBastionPool = true;
      } else if (!chargePurse(room, player, cost)) {
        const n = recastCount(room, player.key, card.id);
        ws.send(JSON.stringify({ type: "error", message: room.campaign && !room.campaign.over && room.campaign.seeded
          ? `${card.name} costs ✦${cost}${n > 0 ? ` (recast ×${2 ** Math.min(n, 5)})` : ""} — the bank holds ✦${Math.floor(room.campaign.bank)}.`
          : `${card.name} costs ✦${cost} — you hold ✦${player.energy}.` }));
        return;
      }
      // THE CAST (the Keeper's pencil for the DC, proceeding
      // unstruck, 2026-10-21): d20 + the tender's gift (the
      // class truth alone — summoning is no Grimoire page, so
      // no school terms ride it) + SUMMONER'S POWER (Nigel,
      // 2026-10-21 17:13: the zodiac "summoner" clause sum +
      // 2 per 3 tender levels + 3 for the Sage) − 3 if the
      // caster stands in the curse, against DC 10 + the
      // Awokin's power. A natural 20 always lands; a natural
      // 1 always falters — Fate's manners, as at every cast.
      // The tale names every term it rolled with, so the
      // number is never a mystery.
      const gift = summonGiftFor(player);
      const sp = summonersPowerFor(player.expKey, player.tenderLevel, player.classKey);
      const curse = curseCastTerm(room, player);
      const roll = dN(20);
      const dc = 10 + card.power;
      const reckoning = `rolled ${roll}, gift ${signedTerm(gift)}, summoner's power ${signedTerm(sp)}${curse ? ", −3 the curse presses" : ""} — against DC ${dc}`;
      player.castAt = Date.now();
      if (!(roll === 20 || (roll !== 1 && roll + gift + sp + curse >= dc))) {
        // THE WITCH'S MISCAST MERCY (Recovery R8): a Witch's
        // faltering call refunds her mercy's share of the
        // price actually charged, back to the purse it was
        // taken from — and the tale names the return.
        const refunded = refundTableFizzle(room, player, cost, fromBastionPool);
        tell(room, `${player.name} calls ${card.name} — ${reckoning}: the call falters. The price (✦${cost}) is spent, and nothing stands.${refunded > 0 ? ` The Witch's mercy returns ✦${refunded} of the spent energy.` : ""}`);
        sendState(room);
        return;
      }
      const shield = shieldPoolFor(card);
      placeUnit(room, {
        hex, card, hp: card.toughness, maxHp: card.toughness,
        shield, maxShield: shield, speedGauge: 0,
        ownerKey: player.key, ownerName: player.name, pinnedUntil: 0, pos: { ...TILE_CENTERS.get(hex)! }, target: null,
      });
      tell(room, `${player.name} calls ${card.name} onto the field — ${reckoning}: the call lands (✦${cost}${room.campaign && recastCount(room, player.key, card.id) > 0 ? ` — the recast price` : ""}).`);
      sendState(room);
      return;
    }

    // RECALL: your own standing Awoken steps back off the
    // field — un-fielded, it stands in the wheel's company
    // again and can be called anew. The energy spent casting
    // is not returned — what was spent was spent.
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
      if (isMoving(unit)) {
        ws.send(JSON.stringify({ type: "error", message: `${unit.card.name} is on the march — it answers when it arrives.` }));
        return;
      }
      removeUnit(room, unit);
      tell(room, `${player.name} recalls ${unit.card.name} from the field.`);
      sendState(room);
      return;
    }

    // THE MARCH (Nigel, 2026-10-18 — the land's movement law
    // carried to the Table): a standing Awokin walks a road —
    // any road, cursed ground included (the seed-mission road)
    // — to any open tile. The price is the land's: hexes
    // crossed × (1 + ⌊(power−1)/3⌋)✦, from the purse (or the
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
      if (isMoving(unit)) { ws.send(JSON.stringify({ type: "error", message: `${unit.card.name} is already on the march.` })); return; }
      if (!TILE_BY_ID.has(to) || to === SEED_TILE) { ws.send(JSON.stringify({ type: "error", message: "The march ends on the land — never on the star-seed's tile." })); return; }
      if (to === from) { ws.send(JSON.stringify({ type: "error", message: `${unit.card.name} already stands there.` })); return; }
      if (unitsAt(room, to).length >= STACK_CAP) { ws.send(JSON.stringify({ type: "error", message: `That tile stands full — ${STACK_CAP} of the light to a tile.` })); return; }
      const road = findAnyRoad(from, to);
      if (!road || road.length < 2) { ws.send(JSON.stringify({ type: "error", message: "No road runs there." })); return; }
      const hexes = road.length - 1;
      const cost = hexes * marchRateFor(unit.card.power);
      if (!chargePurse(room, player, cost)) {
        ws.send(JSON.stringify({ type: "error", message: `The march costs ✦${cost} (${hexes} hex${hexes === 1 ? "" : "es"} at ✦${marchRateFor(unit.card.power)} for ${unit.card.name}'s power) — ${room.campaign && !room.campaign.over && room.campaign.seeded ? `the bank holds ✦${Math.floor(room.campaign.bank)}` : `you hold ✦${player.energy}`}.` }));
        return;
      }
      // A direct order ends the follow: the Awokin goes where
      // it is sent and holds there (Nigel, 2026-10-19). Its
      // hex is NOT set — the integrator derives it from the
      // gliding position; its pace rides from its gait.
      unit.follow = false;
      // ORDERS END PARTY MEMBERSHIP (Nigel, 2026-10-20): the
      // marched Awokin leaves the party as it leaves the
      // follow — it stands under orders now. The tale says
      // so when a membership actually stood to end.
      const leftParty = player.expKey && unit.card.awokenId
        ? removePartyMember(player.expKey, unit.card.awokenId)
        : false;
      unit.target = { ...TILE_CENTERS.get(to)! };
      unit.speedPx = Math.max(34, 69 / marchSecondsPerHexFor(unit.card));
      tell(room, `🚶 ${player.name} marches ${unit.card.name} — ${hexes} hex${hexes === 1 ? "" : "es"} of road (✦${cost}).`);
      if (leftParty) tell(room, `${unit.card.name} leaves ${player.name}'s party — an Awokin under orders stands outside it.`);
      sendState(room);
      return;
    }

    // THE TENDER GLIDES (Phase B): the Tender themself moves
    // continuously — a tap names a point on the field, and they
    // glide to it at a walker's pace (120px/s, in integrate).
    // A point on the star-seed's tile is refused; a point far
    // from any tile centre clamps to that centre.
    if (msg.type === "glide") {
      if (!player) return;
      if (player.fallen) { ws.send(JSON.stringify({ type: "error", message: "You have fallen — you will rise between waves." })); return; }
      if (player.watcher || player.storytender) { ws.send(JSON.stringify({ type: "error", message: "Only a seated Tender takes the road." })); return; }
      if (!player.pos) { ws.send(JSON.stringify({ type: "error", message: "You stand nowhere yet." })); return; }
      const tx = Number(msg.tx), ty = Number(msg.ty);
      if (!Number.isFinite(tx) || !Number.isFinite(ty)) return;
      const point: Pt = { x: tx, y: ty };
      const nearest = nearestTileId(point);
      if (nearest === SEED_TILE && distPx(point, TILE_CENTERS.get(SEED_TILE)!) <= 69) { ws.send(JSON.stringify({ type: "error", message: "The glide ends on the land — never on the star-seed's tile." })); return; }
      player.target = distPx(point, TILE_CENTERS.get(nearest)!) > 69 ? { ...TILE_CENTERS.get(nearest)! } : { x: tx, y: ty };
      sendState(room);
      return;
    }

    // GLIDE STOP: the Tender halts where they glide.
    if (msg.type === "glideStop") {
      if (!player) return;
      player.target = null;
      sendState(room);
      return;
    }

    // FOLLOW / HOLD (Nigel, 2026-10-19): the standing order
    // every Awokin carries. Follow: it trails its Tender,
    // mustering to their side whenever they arrive somewhere.
    // Hold: it keeps the ground it stands on. Only Awokin
    // ordered to follow, follow — the rest hold ground.
    if (msg.type === "setFollow") {
      if (!player) return;
      if (player.fallen) { ws.send(JSON.stringify({ type: "error", message: "You have fallen — you will rise between waves." })); return; }
      if (player.watcher || player.storytender) { ws.send(JSON.stringify({ type: "error", message: "Only a seated Tender gives orders." })); return; }
      const cardId = String(msg.cardId ?? "");
      const myKey = player.key;
      const unit = [...room.field.values()].find(u => u.ownerKey === myKey && u.card.id === cardId);
      if (!unit) { ws.send(JSON.stringify({ type: "error", message: "That Awokin does not stand on the field." })); return; }
      const follow = !!msg.follow;
      if (!!unit.follow === follow) { sendState(room); return; }
      unit.follow = follow;
      tell(room, follow
        ? `👣 ${unit.card.name} will follow ${player.name} — where they stand, it musters.`
        : `✋ ${unit.card.name} holds its ground.`);
      sendState(room);
      return;
    }

    // ADD TO THE PARTY FROM THE FIELD (Nigel, 2026-10-20;
    // built 2026-10-21): in Tender mode, selecting a fielded
    // Awokin of yours may add it to the party — it then
    // follows you (this ground's standing order, set here)
    // and stands in the party on the Zodiac tab. Membership
    // is the tender_party ledger, judged by the party module
    // — the band law's width, this seat's own level. An
    // unbound seat keeps no party and is told so plainly.
    if (msg.type === "addToParty") {
      if (!player) return;
      if (player.fallen) { ws.send(JSON.stringify({ type: "error", message: "You have fallen — you will rise between waves." })); return; }
      if (player.watcher || player.storytender) { ws.send(JSON.stringify({ type: "error", message: "Only a seated Tender keeps a party." })); return; }
      if (!player.expKey) { ws.send(JSON.stringify({ type: "error", message: "This seat is not bound to a Tender — there is no party to add to." })); return; }
      const cardId = String(msg.cardId ?? "");
      const myKey = player.key;
      const unit = [...room.field.values()].find(u => u.ownerKey === myKey && u.card.id === cardId);
      if (!unit) { ws.send(JSON.stringify({ type: "error", message: "That Awokin does not stand on the field." })); return; }
      if (!unit.card.awokenId) { ws.send(JSON.stringify({ type: "error", message: `${unit.card.name} stands outside the roster — it cannot join a party.` })); return; }
      const r = tryAddPartyMember(player.expKey, unit.card.awokenId, player.tenderLevel);
      if (!r.ok) { ws.send(JSON.stringify({ type: "error", message: r.reason })); return; }
      unit.follow = true;
      tell(room, `👣 ${unit.card.name} joins ${player.name}'s party — where they stand, it musters.`);
      sendState(room);
      return;
    }

    // CALL A REINFORCEMENT (Nigel, 2026-10-23 07:21–07:25 —
    // Recovery R6): the wheel's Awoken branch names a deck
    // Awoken outside the party and calls it in. Where a
    // bastion plays, the air drop lands its membership at
    // once; where none plays, it walks the road while a
    // battle stands (startReinforcement carries the whole
    // law). The pick IS the call — no target, no confirm.
    if (msg.type === "callReinforcement") {
      if (!player) return;
      if (player.fallen) { ws.send(JSON.stringify({ type: "error", message: "You have fallen — you will rise between waves." })); return; }
      if (player.watcher || player.storytender) { ws.send(JSON.stringify({ type: "error", message: "Only a seated Tender calls reinforcements." })); return; }
      if (!player.expKey) { ws.send(JSON.stringify({ type: "error", message: "This seat is not bound to a Tender — there is no deck to call from." })); return; }
      const awakenedId = Math.floor(Number(msg.awakenedId ?? 0));
      if (!awakenedId) { ws.send(JSON.stringify({ type: "error", message: "Name the Awokin to call in." })); return; }
      const r = await startReinforcement(room, player, awakenedId);
      if (!r.ok) { ws.send(JSON.stringify({ type: "error", message: r.reason })); return; }
      sendState(room);
      return;
    }

    // (No fillPartySpot door stands here: a member is CHOSEN
    // on the deck screen — an empty Awokin spot on the
    // Zodiac, filled from the deck list there (Nigel,
    // 2026-10-21). That door is build 1's addToParty, which
    // since the wheel law lands the membership AT ONCE, even
    // mid-battle. The wheel's reinforcement call (above) is
    // the Table's own door for the same naming: it walks the
    // road when no bastion plays, and air-drops when one
    // does — Recovery R6.)

    // STRIKE THE CURSE (Nigel, 2026-10-18 — the land's
    // blow-per-order, carried to the Table): the mechanic for
    // clearing curses for building applies to the Table's
    // Awoken too. A standing Awokin ordered against a cursed
    // tile within its lawful reach — the two tiles its strikes
    // already carry — lands ONE blow: ✦1, wearing the tile's
    // corruption by its filed power, the land's attackTile
    // arithmetic exactly. At nothing the tile turns in the
    // striker's dominant element, and every consequence of
    // pure ground follows (the summon gate reads the same
    // flag). The curse does not answer the blow (attrition
    // law, 2026-10-19 — the thorns are gone from both maps);
    // its harm is the withering of whatever stands in it.
    // Victory and the standing grind remain the other roads;
    // this is the deliberate one.
    // The referee's say is final: no client word is trusted
    // for the wear, the turn, or the thorns.
    if (msg.type === "strikeCurse") {
      if (player.fallen) { ws.send(JSON.stringify({ type: "error", message: "You have fallen — you will rise between waves." })); return; }
      if (player.watcher || player.storytender) { ws.send(JSON.stringify({ type: "error", message: "Only a seated Tender orders their Awokin against the curse." })); return; }
      const hex = String(msg.hex ?? "");
      const targetId = String(msg.target ?? "");
      const cardId = String(msg.cardId ?? "");
      const myKey = player.key;
      const unit = [...room.field.values()].find(u => u.ownerKey === myKey && u.card.id === cardId);
      if (!unit || (hex && unit.hex !== hex)) { ws.send(JSON.stringify({ type: "error", message: "That Awokin does not stand there." })); return; }
      if (!unitStanding(room, unit)) { ws.send(JSON.stringify({ type: "error", message: `${unit.card.name} no longer stands on the field.` })); return; }
      if (isMoving(unit)) { ws.send(JSON.stringify({ type: "error", message: `${unit.card.name} is on the march — it answers when it arrives.` })); return; }
      const now = Date.now();
      if ((unit.pinnedUntil ?? 0) > now) { ws.send(JSON.stringify({ type: "error", message: `${unit.card.name} is held fast — it cannot strike.` })); return; }
      const tile = room.map.get(targetId);
      if (!tile || targetId === SEED_TILE) { ws.send(JSON.stringify({ type: "error", message: "That is no tile of this land to strike." })); return; }
      if (!tile.cursed) { ws.send(JSON.stringify({ type: "error", message: "That ground is already pure." })); return; }
      // The reach is reckoned in HEXES, as the law speaks it
      // ("the light strikes two tiles out") — the pixel
      // measure it replaces disagreed with the land's own
      // geometry by a hair (an iso step is 69.09 px against
      // the 69 allowed), so a strike at an element's full
      // reach was refused in four of six directions
      // (found by the test-pass audit, 2026-10-20).
      if (axialDist(unit.hex, targetId) > (ELEMENT_REACH[unit.card.element] ?? 2)) { ws.send(JSON.stringify({ type: "error", message: "Beyond reach — the light strikes only as far as its element carries." })); return; }
      const cost = 1;
      if (!chargePurse(room, player, cost)) {
        ws.send(JSON.stringify({ type: "error", message: `A curse-strike costs ✦${cost} — ${room.campaign && !room.campaign.over && room.campaign.seeded ? `the bank holds ✦${Math.floor(room.campaign.bank)}` : `you hold ✦${player.energy}`}.` }));
        return;
      }
      // The blow is a strike: its cadence comes round, as the
      // referee's own strikes set it.
      unit.nextStrike = now + lightIntervalMs(unit);
      tile.curseHp -= unit.card.power;
      const purified = tile.curseHp <= 0;
      // The witness: the blow flies to the TILE, on the same
      // ledger the referee's strikes fly by.
      if (room.strikes.length < 40) room.strikes.push({ id: (room.strikeSeq = (room.strikeSeq ?? 0) + 1), at: now, from: roundPos(unit.pos), to: roundPos(TILE_CENTERS.get(targetId)!), element: unit.card.element ?? "unaligned", side: "light", hit: true, killed: purified, weapon: null });
      if (purified) {
        tell(room, `⚔️ ${unit.card.name}'s blow breaks the curse!`);
        purifyTile(room, tile, dominantElement(partsOf(unit.card) as { element?: string | null }[]));
      } else {
        tell(room, `⚔️ ${unit.card.name} strikes the curse — its corruption thins to ${Math.ceil(tile.curseHp)} of ${tile.curseMaxHp}.`);
      }
      // The curse does not answer (attrition law, 2026-10-19):
      // no thorns fly back at the striker. Its teeth are only
      // for those who stand in it.
      sendState(room);
      return;
    }

    // ATTUNE (the Table Fix Pass, 2026-10-20 — Nigel's play
    // report: "the Attune skill isn't working." In truth the
    // act did not exist at the Table at all: no client
    // surface, no act on the wire. Built then in its minimal
    // true form: one pool point turned the tile, whole.)
    // POINTS REST ON THE TILE (Nigel, 2026-10-20, later the
    // same night: "make the attune ability add element
    // points to a hex tile" — Part B §6 of the tile
    // attunement law: tiles hold element points, and
    // attuning adds them). One point of an element leaves
    // his aspect pool through the pools' own door
    // (spendAttunement) and RESTS ON THE TILE (tile.points);
    // the tile holds the element with the most points
    // resting on it, ties holding the standing element
    // (elementFromPoints). So a single spend claims any
    // ground no points rest on yet — its born element is
    // birthright, not points — while ground a Tender has
    // laid points on takes out-laying, point for point.
    // Spending MORE of the element the ground already holds
    // deepens it: there is no "already holds" refusal.
    // ATTUNE IS AN ABILITY NOW (Nigel, 2026-10-21 16:37):
    // the door is the action wheel — Ability → Attune →
    // element → tap a tile — on every ground; the Table's
    // attune row is retired. The tap may name a TILE, or
    // ground a placed RUNE or WARD stands on: the point
    // rests in the tile's ledger either way (the working's
    // ground is the tile's ground), and the tale names the
    // working when one stands there. THE RANGE (Nigel,
    // 2026-10-21 16:40, striking the Keeper's no-limit
    // pencil): a Tender's reach is the tile he stands on
    // and its ring — one tile away — PLUS the zodiac's
    // attunement-reach bonus (attuneReachFor; no stars
    // carry it yet). The old "his own ground only" law (his
    // standing tile, or his landing, from anywhere) is
    // superseded by the reach: any purified ground within
    // it may be attuned, whoever's landing it is, and his
    // own landing is beyond him once he has walked away
    // from it. The ground must stand purified: cursed
    // ground is refused plainly, for purifying is the
    // light's other work; the seed tile takes no points,
    // as it never has.
    // THE STORYTELLER'S JOIN (the Attune Ability build,
    // 2026-10-21): the seated storyteller attunes through
    // this same door with UNBOUNDED reach — the Keeper's
    // standing pencil, standing in for Campaign Build 3's
    // console attune — spending from their existing purse
    // (their bound Tender's pools), so removing the row
    // strands no one mid-campaign. The storyteller does not
    // stand on the board, so no ring is measured for them.
    // THE PRICE IS A PENCIL (the Keeper, 2026-10-20): the
    // homeland has no per-tile attune spend to mirror — its
    // land drinks by presence and by building pours of ten —
    // so the Table's price stands at 1 point per spend until
    // Nigel rules a measure of his own.
    if (msg.type === "attuneTile") {
      if (player.watcher) { ws.send(JSON.stringify({ type: "error", message: "Watchers hold no attunement — bind in the game to attune." })); return; }
      if (!player.storytender && player.fallen) { ws.send(JSON.stringify({ type: "error", message: "You have fallen — you will rise between waves." })); return; }
      if (!player.expKey) { ws.send(JSON.stringify({ type: "error", message: "Attuning draws on your aspect pools — bind your Tender at the Table to attune." })); return; }
      const hex = String(msg.hex ?? "");
      const element = String(msg.element ?? "");
      if (!(element in ELEMENT_REACH)) { ws.send(JSON.stringify({ type: "error", message: "That is no element of the five." })); return; }
      const tile = room.map.get(hex);
      if (!tile || hex === SEED_TILE) { ws.send(JSON.stringify({ type: "error", message: "That is no tile of this land to attune." })); return; }
      if (!player.storytender) {
        if (!player.hex) { ws.send(JSON.stringify({ type: "error", message: "You stand nowhere on this field — no ground lies within your attuning reach." })); return; }
        const reach = 1 + attuneReachFor(player.expKey);
        if (axialDist(player.hex, hex) > reach) { ws.send(JSON.stringify({ type: "error", message: `That ground lies beyond your attuning reach — Attune touches your own hex and its ring${reach > 1 ? `, and ${reach - 1} ring${reach > 2 ? "s" : ""} more by your skill` : ""}. Step closer, and attune again.` })); return; }
      }
      if (tile.cursed) { ws.send(JSON.stringify({ type: "error", message: "That ground is still cursed — attunement rests only on purified land. Fell what holds it, or grind it down, and it will turn." })); return; }
      // THE BINDER'S GIFT (Nigel, 2026-10-22; Recovery R9):
      // one point still leaves her pool, but what the spend
      // LAYS is the book's one reckoning (pourLaidFor, no
      // page kind at this door): a Binder's Attune lays
      // triple the points resting on the tile.
      const laid = pourLaidFor(player.classKey, null, 1);
      const spent = await spendAttunement(player.expKey, element, 1);
      if (!spent.ok) { ws.send(JSON.stringify({ type: "error", message: `Attuning a tile costs 1 ${element} point — your ${element} pool holds ${spent.held}.` })); return; }
      if (player.pools) player.pools[element] = Math.max(0, (player.pools[element] ?? 0) - 1);
      tile.points[element] = (tile.points[element] ?? 0) + laid;
      tile.element = elementFromPoints(tile);
      // A working standing on the tapped ground lends the
      // tale its name — the point still rests in the tile's
      // ledger, as the tile law holds.
      const mySeatKey = player.key;
      const runeHere = room.workings.filter(w => w.kind === "rune" && w.hex === hex)
        .sort((a, b) => Number(b.ownerKey === mySeatKey) - Number(a.ownerKey === mySeatKey))[0];
      const wardHere = !runeHere ? room.workings.filter(w => w.kind === "ward" && (w.hexA === hex || w.hexB === hex))
        .sort((a, b) => Number(b.ownerKey === mySeatKey) - Number(a.ownerKey === mySeatKey))[0] : undefined;
      const workingHere = runeHere ?? wardHere;
      if (workingHere) {
        tell(room, laid > 1
          ? `✦ ${player.name} attunes the ${workingHere.name} — her Attune lays triple: ${laid} ${element} points rest on its ground now (${tile.points[element]} ${element} in all), and the ground holds ${tile.element}.`
          : `✦ ${player.name} attunes the ${workingHere.name} — a ${element} point rests on its ground now (${tile.points[element]} ${element} in all), and the ground holds ${tile.element}.`);
      } else {
        tell(room, laid > 1
          ? `✦ ${player.name} attunes the ground — her Attune lays triple: ${laid} ${element} points rest on it now (${tile.points[element]} ${element} in all), and the ground holds ${tile.element}.`
          : `✦ ${player.name} attunes the ground — a ${element} point rests on it now (${tile.points[element]} ${element} in all), and the ground holds ${tile.element}.`);
      }
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
      // THE BINDER'S RANGE (Nigel, 2026-10-22; Recovery R9):
      // Heal is a Binding working that heals, and its reach
      // is the casting ring — six hexes, the measure the
      // homeland reads from this ground's own size
      // (HOMELAND_CAST_RING) — from where the caster stands
      // to the mended one's hex, doubled for a Binder's cast
      // (bindingHealRangeFor). Judged before any charge, as
      // every reach refusal is. A seat that stands nowhere
      // (the storytender) is measured by no ring, as with
      // Attune at this Table.
      if (player.hex) {
        const healRange = bindingHealRangeFor(player.classKey, HOMELAND_CAST_RING);
        if (axialDist(player.hex, unit.hex) > healRange) { ws.send(JSON.stringify({ type: "error", message: `Heal reaches ${healRange} hexes from where you stand — ${unit.card.name} stands beyond it.` })); return; }
      }
      if (unit.hp >= unit.maxHp && unit.shield >= unit.maxShield) { ws.send(JSON.stringify({ type: "error", message: `${unit.card.name} stands whole already — body and shield alike.` })); return; }
      const healCost = witchCompanyPrice(room, player, healSpell()?.cost ?? 2);
      if (!chargePurse(room, player, healCost)) { ws.send(JSON.stringify({ type: "error", message: `Heal costs ✦${healCost} — ${room.campaign && !room.campaign.over && room.campaign.seeded ? `the bank holds ✦${Math.floor(room.campaign.bank)}` : `you hold ✦${player.energy}`}.` })); return; }
      // THE CASTING LAW (Phase C): Heal is a binding-school
      // cast and rolls for its standing, energy already spent.
      const healDef = healSpell();
      if (healDef) { const reck = rollCast(room, player, healDef); if (!reck.ok) { castUnravels(room, player, healDef.name, reck, healCost); sendState(room); return; } }
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
      // THE BINDER'S COMPANY (Nigel, 2026-10-22 12:27;
      // Recovery R7): Heal is a Binding working, and a
      // Binder's Binding healing mends +4 more.
      const binderHeal = bindingHealBonusFor(player.classKey);
      const amount = dieAmount + heartHeal + binderHeal;
      const toHp = Math.min(unit.maxHp - unit.hp, amount);
      unit.hp += toHp;
      const toShield = Math.min(unit.maxShield - unit.shield, amount - toHp);
      unit.shield += toShield;
      tell(room, `${player.name} mends ${unit.card.name} — ${toHp + toShield} restored (${dieAmount} by the ${unit.card.element} die${heartHeal ? `, ${heartHeal} by the Heart's mending` : ""}${binderHeal ? `, ${binderHeal} by the Binder's company` : ""}; Heal, Tier ${player.healTier}).`);
      player.castAt = Date.now();
      sendState(room);
      return;
    }

    if (msg.type === "castWard") {
      if (!player) return;
      const caster = player;
      if (caster.watcher) { ws.send(JSON.stringify({ type: "error", message: "Watchers raise no wards — bind in the game to cast." })); return; }
      const def = spellByKey(String(msg.root || ""));
      // THE SPRINGLEAF (Phase C): its def kind is "binding",
      // not "ward" — it is routed through this handler with an
      // engine branch below, the old refusal gone for this
      // engine only. Every other non-ward def is still refused.
      const isSpringleaf = def?.engine === "springleaf";
      if (!def || (def.kind !== "ward" && !isSpringleaf)) { ws.send(JSON.stringify({ type: "error", message: "That is not a ward of the Written Light." })); return; }
      // BLACK GATE — THE TABLE SEAM, FLAGGED (Nigel,
      // 2026-10-23 — Recovery R13): the Gate is cast IN
      // FRONT OF THE CASTER in the direction they face —
      // eight facings, diagonals included. This door's
      // cast machinery names an AIM by hexes (hexA/hexB,
      // an edge — six directions, the diagonals have no
      // neighbouring hex) and the Table stores no facing
      // for a seat (its figure's facing is drawn from its
      // glide at render, never kept), so a facing cast
      // cannot be honestly expressed here. The door
      // refuses the Gate in plain words BEFORE any charge
      // rather than faking a facing from an aim or a
      // default; the Gate stands whole on the homeland,
      // where the figure's facing is real. (Its ward
      // filing itself is an UNRULED derivation — see its
      // page in grimoire.ts.)
      if (def.engine === "blackgate") { ws.send(JSON.stringify({ type: "error", message: "The Black Gate is cast in the direction you face — the Table names a cast's aim by hexes, not a facing, so the Gate cannot be cast here. It stands on the homeland, in front of your figure where it faces." })); return; }
      if (!caster.wardRuneUnlocked) { ws.send(JSON.stringify({ type: "error", message: `Wards wake at Tender Lv 3 — you stand at Lv ${caster.tenderLevel}.` })); return; }
      // THE CAST'S COLOUR IS DERIVED, NEVER SENT (Nigel,
      // 2026-10-20 19:35): a hue riding in on this message
      // is inert — the colour is judged from the page's own
      // standing in the book (pageHueFor), and a smuggled
      // hue changes nothing. An unbound seat holds no book
      // and casts unaligned.
      const hue = caster.expKey ? await pageHueFor(caster.expKey, def) : "unaligned";
      const hexA = String(msg.hexA || "");
      const hexB = String(msg.hexB || "");
      // WARDS STAND ANYWHERE (Nigel, 2026-10-20): "wards and
      // runes should be able to be cast anywhere." The held-
      // ground anchor is LIFTED — any edge of the map may
      // take a ward, cursed ground included. What the freedom
      // costs stands in settleWorkingWithering: a ward on
      // cursed ground suffers the curse's attrition, like the
      // Tender. The edge itself must still exist — the two
      // tiles share a side — for that is geometry, not ground.
      if (!neighborsOf(hexA).includes(hexB)) { ws.send(JSON.stringify({ type: "error", message: "That edge does not exist — the two tiles must share a side." })); return; }
      // BULWARK (Recovery R12) stands apart from the edge
      // law below: its line does not stand ON the edge the
      // cast names — the edge is the cast's aim (hexA the
      // anchor, hexB the neighbour the line faces) — so no
      // edge-occupancy refusal stands over it, and it takes
      // no edge away from another ward.
      if (!isSpringleaf && def.engine !== "bulwark") {
        const standingEdge = room.workings.find(w => w.kind === "ward" && ((w.hexA === hexA && w.hexB === hexB) || (w.hexA === hexB && w.hexB === hexA)));
        if (standingEdge && standingEdge.engine !== "passive") { ws.send(JSON.stringify({ type: "error", message: "A ward already stands on that edge." })); return; }
        // A passive wall yields to a real cast ward — the cast ward wins the edge.
        if (standingEdge) room.workings = room.workings.filter(w => w !== standingEdge);
      }
      if (def.engine === "standard" && room.workings.some(w => w.engine === "standard" && w.ownerKey === caster.key)) { ws.send(JSON.stringify({ type: "error", message: "One Standard per Tender — yours already flies." })); return; }
      // The Zodiac's workings tranche (2026-10-17): the
      // holder's skills ride the cast. Second Wall: once per
      // battle, a ward at half cost.
      const eff = workingEffects(caster.expKey);
      let castCost = def.cost;
      let secondWallSpent = false;
      // The Springleaf is a binding cast, not a ward: the
      // ward-side economies (Second Wall, Steady Attention)
      // do not ride it — its price is the def's ✦3, plain.
      if (!isSpringleaf && eff.secondWall && !caster.secondWallUsed) { castCost = Math.ceil(def.cost / 2); secondWallSpent = true; }
      // Steady Attention (the Heart, 2026-10-18): the first
      // ward or rune of the battle costs 1✦ less — it rides
      // after the Second Wall's halving when both are held.
      let steadySpent = false;
      const steadyAmt = caster.expKey ? heartEffects(caster.expKey).steadyAmount : 0;
      if (!isSpringleaf && steadyAmt > 0 && !caster.steadyUsed) { castCost = Math.max(0, castCost - steadyAmt); steadySpent = true; }
      // THE WITCH'S COMPANY PRICE (Recovery R7): the ward
      // door's final reckoned price, halved while a party
      // member she has cast stands.
      castCost = witchCompanyPrice(room, caster, castCost);
      if (purseOf(room, caster) < castCost) { ws.send(JSON.stringify({ type: "error", message: `${def.name} costs ✦${castCost} — ${purseName(room) === "the bank" ? `the bank holds ✦${room.campaign!.bank}` : `you hold ✦${caster.energy}`}.` })); return; }
      if (!chargePurse(room, caster, castCost)) { ws.send(JSON.stringify({ type: "error", message: `${def.name} costs ✦${castCost} — the purse no longer holds it.` })); return; }
      // THE CASTING LAW (Phase C): the roll comes after the
      // purse is charged — on a fizzle the energy is spent
      // and the working simply does not happen.
      { const reck = rollCast(room, caster, def); if (!reck.ok) { castUnravels(room, caster, def.name, reck, castCost); sendState(room); return; } }
      if (isSpringleaf) {
        // THE SPRINGLEAF AT THE TABLE (Phase C; shape ruled in
        // the book): a GROVE stands at the target hex — hexB,
        // the second hex the client names, its anchor hexA
        // held ground by this handler's existing law. Its
        // radius is the tender ward size: (66 + 12 × level)
        // × 2.75, read in Table pixels (× 69/80).
        const centre = TILE_CENTERS.get(hexB);
        if (!centre) { ws.send(JSON.stringify({ type: "error", message: "That is no tile of this land." })); return; }
        // THE BINDER'S RANGE (Recovery R9): the grove's
        // radius is the reach its burst and mending work
        // by — a Binder's grove spans twice the measure,
        // and the doubled radius is what stands on the
        // working the tick reads (its saplings' spread and
        // half-glow derive from it there, as for every hand).
        const radiusPx = bindingHealRangeFor(caster.classKey, (66 + 12 * caster.tenderLevel) * 2.75 * (69 / 80));
        const groveHue = hue === "unaligned" ? "root" : hue;
        // The BURST: every ally in the glow rolls its own
        // element die once, hp-then-shield — a Binder's
        // burst +4 more a head (her company, Recovery R7).
        let burst = 0;
        const castBinderBonus = bindingHealBonusFor(caster.classKey);
        for (const u of alliesInRadius(room, centre, radiusPx)) burst += groveBurstHeal(u, false, castBinderBonus);
        // 1d4 saplings, rooting ~1.6s apart within 0.55 × the
        // radius — their rooting points are rolled now, their
        // rooting itself rides processGroves on the tick.
        const sapCount = dN(4);
        const nowG = Date.now();
        const saplingDue: number[] = [];
        const saplingPos: Pt[] = [];
        for (let i = 0; i < sapCount; i++) {
          saplingDue.push(nowG + 1600 * (i + 1));
          const ang = Math.random() * Math.PI * 2;
          const rad = Math.random() * 0.55 * radiusPx;
          saplingPos.push({ x: centre.x + Math.cos(ang) * rad, y: centre.y + Math.sin(ang) * rad });
        }
        room.workings.push({
          id: randomUUID(), kind: "grove", root: def.key, engine: "springleaf", nums: { ...def.numbers },
          name: def.forms[hue] ?? def.name, hue: groveHue,
          ownerKey: caster.key, ownerName: caster.name, hex: hexB, hexA: null, hexB: null,
          hp: 0, maxHp: 0, pour: 0, stops: 0, charges: 0,
          pos: { ...centre }, radiusPx, expiresAt: nowG + 34_000, saplingDue, saplingPos, lastMend: nowG, mother: true,
        });
        tell(room, `${caster.name} plants ${def.forms[hue] ?? def.name} — a grove takes root on ${hexB}, its first breath mending ${burst} among those in its glow. ${sapCount} sapling${sapCount === 1 ? "" : "s"} will follow.`);
        caster.castAt = Date.now();
        sendState(room);
        return;
      }
      if (secondWallSpent) { caster.secondWallUsed = true; tell(room, `${caster.name}'s Second Wall rises at half its price — the Warden's economy.`); }
      if (steadySpent) { caster.steadyUsed = true; tell(room, `${caster.name}'s first writing of the battle comes easier — Steady Attention.`); }
      // THE PAGE CARRIES IT (Nigel, 2026-10-20; the slots,
      // 2026-10-21): no pour is named or taken at this cast —
      // powering lives in the Grimoire. The working stands
      // with the page's filled SLOTS in the cast's element,
      // laid into the book beforehand (pageSlotsCastFor, the
      // book's one reading) — each slot +1 power and +1
      // health — and the page's spell level already rode the
      // cast's roll (rollCast: DC = level + 10), counted
      // once, there. An unbound seat carries nothing.
      const slots = caster.expKey ? await pageSlotsCastFor(caster.expKey, def, hue) : 0;
      // The health rating: holding wards are raised with health
      // grown from the book's base, the caster's level, and one
      // per slot the cast carries (hpForCast). The slots'
      // POWER lands in the Seal's riposte below — the answer
      // it gives a striker is the ward's power.
      // The Zodiac rides the snapshot (tranche one): Thick
      // Light's +2 on every ward, the Living Wall's +4 more on
      // the Trees, the Seal's deeper stops and answered
      // riposte, the Engine's deeper song.
      let hp = hpForCast(def, caster.tenderLevel, slots, engineBright(room, caster.key));
      hp += eff.wardHp + (def.engine === "trees" ? eff.treesHp : 0);
      // Lore Warden (tranche one): a ward raised on an edge
      // where one of yours fell stands at +2 HP — the edge
      // remembers its last state.
      if (eff.loreWarden && room.writtenEdges?.has(edgeKeyOf(hexA, hexB))) hp += 2;
      const wardNums: Record<string, number> = { ...def.numbers };
      if (def.engine === "seal") {
        wardNums.stops = (wardNums.stops ?? 3) + eff.sealStops + (hue === "stone" ? eff.deepSetSealStops : 0);
        wardNums.riposte = (wardNums.riposte ?? 3) + eff.riposte + slots;
      }
      if (def.engine === "engine") wardNums.energyPerRound = (wardNums.energyPerRound ?? 1) + eff.engineEnergy;
      // BULWARK (Nigel, 2026-10-23 — Recovery R12): the line
      // of shields, raised across the cast's aim — hexA the
      // anchor, hexB the neighbour it faces: the line stands
      // centred on the midpoint between the two hexes'
      // hearts, its shields spread along the perpendicular
      // at the Rock Wall's spacing (0.55 of a hex ≈ 38px on
      // this ground). The count follows the warding cast
      // level and each shield's HP reads the shared 5–10
      // table at that level — the one reckoning in
      // actions.ts (bulwarkShieldCountFor /
      // rockWallHpForLevel), read here at the caster's
      // Tender level, never a forked copy. The book's
      // hpForCast and the Zodiac's wardHp do NOT ride it:
      // its health is the ruled table's, whole. The purse
      // was charged and the roll rolled above, by this
      // door's common law (the ward economies rode the
      // price there, as for every ward).
      if (def.engine === "bulwark") {
        const aC = TILE_CENTERS.get(hexA);
        const bC = TILE_CENTERS.get(hexB);
        if (!aC || !bC) { ws.send(JSON.stringify({ type: "error", message: "That is no edge of this land." })); return; }
        const count = bulwarkShieldCountFor(caster.tenderLevel);
        const shieldHp = rockWallHpForLevel(caster.tenderLevel);
        const mx = (aC.x + bC.x) / 2, my = (aC.y + bC.y) / 2;
        const dx = bC.x - aC.x, dy = bC.y - aC.y;
        const dl = Math.hypot(dx, dy) || 1;
        const px = -dy / dl, py = dx / dl;
        const shields: { x: number; y: number; hp: number; maxHp: number }[] = [];
        for (let i = 0; i < count; i++) {
          const off = (i - (count - 1) / 2) * 38;
          shields.push({ x: mx + px * off, y: my + py * off, hp: shieldHp, maxHp: shieldHp });
        }
        room.workings.push({
          id: randomUUID(), kind: "ward", root: def.key, engine: "bulwark", nums: wardNums, name: def.forms[hue] ?? def.name, hue,
          ownerKey: caster.key, ownerName: caster.name, hex: null, hexA, hexB,
          hp: shieldHp * count, maxHp: shieldHp * count, pour: slots, stops: 0, charges: 0,
          shields,
        });
        tell(room, `${caster.name} raises ${def.forms[hue] ?? def.name} — a line of ${count} shield${count === 1 ? "" : "s"} stands across the way, each with ${shieldHp} HP. What strikes them is shoved back.`);
        caster.castAt = Date.now();
        sendState(room);
        return;
      }
      room.workings.push({
        id: randomUUID(), kind: "ward", root: def.key, engine: def.engine, nums: wardNums, name: def.forms[hue] ?? def.name, hue,
        ownerKey: caster.key, ownerName: caster.name, hex: null, hexA, hexB,
        hp, maxHp: hp, pour: slots, stops: 0, charges: 0,
      });
      tell(room, `${caster.name} raises ${def.forms[hue] ?? def.name} on the edge between ${hexA} and ${hexB}.`);
      caster.castAt = Date.now();
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
      // THE CAST'S COLOUR IS DERIVED, NEVER SENT (Nigel,
      // 2026-10-20 19:35), as at the ward's raising above:
      // the message's hue is inert; the book judges.
      const hue = caster.expKey ? await pageHueFor(caster.expKey, def) : "unaligned";
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
        // The new workings are not writings on a hex — the
        // one-writing law is not theirs (Bats flies, the Hold
        // Rune hangs over its target, Shatter is a shot).
        if (def.engine !== "bats" && def.engine !== "holdrune" && def.engine !== "shatter"
          && room.workings.some(w => w.kind === "rune" && w.hex === hx)) { ws.send(JSON.stringify({ type: "error", message: "That ground is already written — one writing per hex." })); return; }
      }
      // THE NEW WORKINGS' OWN GATES (Nigel, 2026-10-22),
      // judged before any charge, as the page judged them:
      // Bats' cap of three standing swarms (the Witch suffers
      // none), the Hold Rune's need of a shade under the tap,
      // and Rune Shatter's 2-tile reach from the caster's
      // standing (a seat that stands nowhere — the
      // storytender — is measured by no ring, as with Attune).
      if (def.engine === "bats" && caster.classKey !== "witch"
        && room.workings.filter(w => w.engine === "bats" && w.ownerKey === caster.key).length >= 3) {
        ws.send(JSON.stringify({ type: "error", message: "Three swarms already hunt for you — the cap is three to a caster, and the Witch alone suffers none." })); return;
      }
      if (def.engine === "holdrune" && !darkAt(room, hexes[0])) {
        ws.send(JSON.stringify({ type: "error", message: "Hold Rune needs a shade under the tap." })); return;
      }
      if (def.engine === "shatter" && caster.hex && axialDist(caster.hex, hexes[0]) > 2) {
        ws.send(JSON.stringify({ type: "error", message: "Beyond reach — 2 tiles is Rune Shatter's edge." })); return;
      }
      // Steady Attention (the Heart, 2026-10-18): the first
      // ward or rune of the battle costs 1✦ less — one flag,
      // shared with the ward's raising.
      let runeCost = def.cost;
      let runeSteadySpent = false;
      const runeSteadyAmt = caster.expKey ? heartEffects(caster.expKey).steadyAmount : 0;
      if (runeSteadyAmt > 0 && !caster.steadyUsed) { runeCost = Math.max(0, runeCost - runeSteadyAmt); runeSteadySpent = true; }
      // THE WITCH'S COMPANY PRICE (Recovery R7), as at the
      // ward door: the rune door's final price, halved while
      // a party member she has cast stands.
      runeCost = witchCompanyPrice(room, caster, runeCost);
      if (purseOf(room, caster) < runeCost) { ws.send(JSON.stringify({ type: "error", message: `${def.name} costs ✦${runeCost} — ${purseName(room) === "the bank" ? `the bank holds ✦${room.campaign!.bank}` : `you hold ✦${caster.energy}`}.` })); return; }
      if (!chargePurse(room, caster, runeCost)) { ws.send(JSON.stringify({ type: "error", message: `${def.name} costs ✦${runeCost} — the purse no longer holds it.` })); return; }
      // THE CASTING LAW (Phase C): the roll comes after the
      // purse is charged — on a fizzle the energy is spent
      // and no writing stands.
      { const reck = rollCast(room, caster, def); if (!reck.ok) { castUnravels(room, caster, def.name, reck, runeCost); sendState(room); return; } }
      // ── THE NEW WORKINGS (Nigel, 2026-10-22; seated
      // 2026-10-23): they stand here, past the roll — Bats
      // loosed as a living swarm, the Hold Rune forming over
      // its shade, Rune Shatter's volley fired at once and
      // its held stream set running. Their reckoning rides
      // processTransientWorkings on the room's tick.
      if (def.engine === "bats" || def.engine === "holdrune" || def.engine === "shatter") {
        if (runeSteadySpent) { caster.steadyUsed = true; tell(room, `${caster.name}'s first writing of the battle comes easier — Steady Attention.`); }
        const nowC = Date.now();
        if (def.engine === "bats") {
          const from = caster.pos ?? TILE_CENTERS.get(caster.hex ?? "") ?? { x: 0, y: 0 };
          room.workings.push({
            id: randomUUID(), kind: "spell", root: def.key, engine: "bats", nums: { ...def.numbers },
            name: def.forms[hue] ?? def.name, hue, ownerKey: caster.key, ownerName: caster.name,
            hex: null, hexA: null, hexB: null, hp: 0, maxHp: 0, pour: 0, stops: 0, charges: 0,
            pos: { x: from.x, y: from.y - 58 }, bornAt: nowC, nextBiteAt: nowC + 3000, bites: 0, targetId: null, heading: -Math.PI / 2,
          });
          tell(room, `${caster.name} looses ${def.forms[hue] ?? def.name} — the swarm hunts the strongest standing.`);
        } else if (def.engine === "holdrune") {
          const target = darkAt(room, hexes[0])!;
          room.workings.push({
            id: randomUUID(), kind: "rune", root: def.key, engine: "holdrune", nums: { ...def.numbers },
            name: def.forms[hue] ?? def.name, hue, ownerKey: caster.key, ownerName: caster.name,
            hex: target.hex, hexA: null, hexB: null, hp: 0, maxHp: 0, pour: 0, stops: 0, charges: 0,
            pos: { ...target.pos }, bornAt: nowC, targetId: target.id, struckAt: null, holdUntil: 0,
          });
          tell(room, `${caster.name} casts ${def.forms[hue] ?? def.name} — the rune forms over the ${target.label}'s head.`);
        } else {
          const from = caster.pos ?? TILE_CENTERS.get(caster.hex ?? "") ?? { x: 0, y: 0 };
          const aimHex = hexes[0];
          // A tap looses the three pieces, 60 ms apart on the
          // page — the referee fires them in one breath here,
          // each its own shot (fireShatterPiece).
          for (let j = 0; j < 3; j++) fireShatterPiece(room, caster, { x: from.x, y: from.y - 58 }, aimHex);
          // HELD: the stream stands as a working — its
          // seconds and pieces are the tick's to reckon.
          const heldSeconds = Math.floor(Math.max(0, Math.min(60000, Number((msg as any).heldMs ?? 0))) / 1000);
          if (heldSeconds >= 1) {
            room.workings.push({
              id: randomUUID(), kind: "spell", root: def.key, engine: "shatter", nums: { ...def.numbers },
              name: def.forms[hue] ?? def.name, hue, ownerKey: caster.key, ownerName: caster.name,
              hex: aimHex, hexA: null, hexB: null, hp: 0, maxHp: 0, pour: 0, stops: 0, charges: 0,
              pos: { ...(TILE_CENTERS.get(aimHex) ?? from) },
              streamUntil: nowC + heldSeconds * 1000, nextChargeAt: nowC + 1000, nextPieceAt: nowC + SHATTER_STREAM_PIECE_MS,
            });
            tell(room, `${caster.name} holds Rune Shatter — the pieces stream on.`);
          }
        }
        caster.castAt = Date.now();
        sendState(room);
        return;
      }
      if (runeSteadySpent) { caster.steadyUsed = true; tell(room, `${caster.name}'s first writing of the battle comes easier — Steady Attention.`); }
      // THE PAGE CARRIES IT (Nigel, 2026-10-20; the slots,
      // 2026-10-21), as at the ward's raising: the cast takes
      // no pour — the writing holds the page's filled SLOTS
      // in the cast's element, laid into the book beforehand
      // (pageSlotsCastFor) — for the Lattice, health by
      // hpForCast; for the Crown Shard, the slots stand in
      // the working's measure, which is what its spring
      // reads. One standing measure feeds the whole cast,
      // however many hexes it writes.
      const slots = caster.expKey ? await pageSlotsCastFor(caster.expKey, def, hue) : 0;
      const hp = hpForCast(def, caster.tenderLevel, slots, false);
      // SHARD RAIN (Nigel, 2026-10-17): the caster's attunement
      // LEVEL in the spell's element is snapshotted at the cast,
      // as HP is — the rain that falls later rolls by the sky
      // the caster stood under when they wrote it. The element
      // is the DERIVED one (pageHueFor judged the Rain by these
      // same pool bands), and the band is the dice's ONE feed —
      // the page's slots never feed the Rain (it holds none).
      // An unaligned cast rolls the base dice alone.
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
        const chargesNow = (def.engine === "blade" || def.engine === "blades" || def.engine === "springblade") ? (def.numbers.charges ?? 2) + eff.bladeSprings : def.engine === "coil" ? 1 + eff.coilTurns : 1;
        const wNew: Working = {
          id: randomUUID(), kind: "rune", root: def.key, engine: def.engine, nums: thisNums, name: def.forms[hue] ?? def.name, hue,
          ownerKey: caster.key, ownerName: caster.name, hex: hx, hexA: null, hexB: null,
          hp, maxHp: hp, pour: slots, stops: 0, charges: chargesNow, maxCharges: chargesNow,
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
      caster.castAt = Date.now();
      sendState(room);
      return;
    }

    if (msg.type === "looseBlade") {
      // LOOSE THE SINGLE BLADE (Nigel, 2026-10-20, spec
      // single-blade-click-spring; re-ruled 2026-10-23 —
      // Recovery R4): the click on a dark thing is an ORDER
      // to the written Blade, not a cast — no roll, no
      // energy. The mark must stand within TWO HEXES of the
      // rune's hex (the book's own spring measure); the
      // NEAREST of the clicker's armed Blades answers; the
      // harm is the book's — flat power (6 on the page),
      // no die, no AC — and the loose spends a charge, as
      // a spring spent it. Out of reach, the answer is
      // plain and the Blade stays armed.
      if (!player) return;
      const caster = player;
      if (caster.watcher) { ws.send(JSON.stringify({ type: "error", message: "Watchers loose no blades — bind in the game to write and loose." })); return; }
      const enemy = room.dark.get(String((msg as any).enemyId ?? ""));
      if (!enemy) { ws.send(JSON.stringify({ type: "error", message: "That dark thing is gone — no blade answers, and every armed blade stays armed." })); return; }
      const armed = room.workings.filter(w => w.kind === "rune" && w.engine === "blade" && w.ownerKey === caster.key && !!w.hex && (w.charges ?? 0) > 0);
      if (!armed.length) { ws.send(JSON.stringify({ type: "error", message: "No Single Blade of yours stands armed — write one, and it will wait for your click." })); return; }
      let best: { w: Working; dist: number } | null = null;
      for (const w of armed) {
        const dist = axialDist(w.hex!, enemy.hex);
        if (dist <= 2 && (!best || dist < best.dist)) best = { w, dist };
      }
      if (!best) { ws.send(JSON.stringify({ type: "error", message: "Beyond its reach — a Single Blade answers only a dark thing within two hexes of its writing. The blade stays armed." })); return; }
      const rune = best.w;
      const eff = workingEffects(caster.expKey);
      // The spring's own honours ride the loose, as they
      // rode the spring (springHex's preamble): Lore keeps
      // the tale, and a first loose pays as a first spring.
      if (caster.expKey && eff.rememberingRay) void awardTenderExp(caster.expKey, 1).catch(() => {});
      if (eff.loreRunewright && !rune.firstPaid) {
        rune.firstPaid = true;
        caster.energy = Math.min(caster.maxEnergy + 10, caster.energy + 1);
      }
      const bright = engineBright(room, caster.key) ? 1 : 0;
      const power = (rune.nums.power ?? 6) + bright * ((rune.nums.brightBonus ?? 1) + (eff.millwright ? 1 : 0))
        + (eff.warRunewright && !enemy.struck ? 2 : 0);
      room.bladeFlights = [...(room.bladeFlights ?? []).filter(f => Date.now() - f.at < 3000),
        { id: randomUUID(), at: Date.now(), fromHex: rune.hex!, to: { ...enemy.pos } }];
      tell(room, `${rune.name} is LOOSED at ${caster.name}'s word — its blades rise from the written ground and spear down into the ${enemy.label} from above: ${power} harm.`);
      enemy.hp -= power;
      let felledByBlade = 0;
      if (enemy.hp <= 0) { felledByBlade = 1; fellDark(room, enemy, caster); }
      if (eff.hungryInk && felledByBlade > 0) caster.energy = Math.min(caster.maxEnergy + 10, caster.energy + felledByBlade);
      rune.charges--;
      if (rune.charges <= 0) retireSprungRune(room, rune);
      else tell(room, `${rune.name} hums on, waiting for one more word.`);
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
      // AN INSTANCE CLAIMED (Station 4, Nigel 2026-10-20): the
      // call is a doorway, not a battle — claiming it seats the
      // host with the bastion's STAGED company as their wheel
      // company, and the room stays the room's own (its
      // Unraveling is begun the common way). No column is
      // dealt by an instance; the staged company is the cargo,
      // and the band law still caps what of it may stand at
      // once.
      if (call.kind === "instance") {
        const tenderId = Number(String(player.expKey).replace("tender:", "")) || 0;
        const staged = tenderId ? await companyForTender(tenderId, { stagedOnly: true }).catch(() => [] as TableCard[]) : [];
        if (!staged.length) { ws.send(JSON.stringify({ type: "error", message: "No company stands staged at your bastion — the instance has no one to carry." })); return; }
        player.stagedDeal = true;
        player.company = staged;
        player.companySig = undefined; // the refresh now reads the staged set
        tell(room, `${player.name} claims the instance — the bastion's staged company, ${staged.length} strong, answers their wheel now.`);
        sendState(room);
        return;
      }
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
        // The pool is seeded from the seat's STANDING
        // reckoning, as it always was: the bonus for the
        // unfielded (2026-10-21) governs the seat's own purse,
        // not the pool's seeding — a seat whose members stand
        // fielded at the claim seeds the pool whole, exactly
        // as before the bonus was ruled.
        pool += (p.standingMaxEnergy ?? p.maxEnergy) + 2 * Math.max(0, p.tenderLevel - 1);
      }
      // THE PREPARED BASTION (Station 4, Nigel 2026-10-20):
      // the seed the column came for, still held with its
      // bastion standing, was fortified BEFORE the enemy
      // arrived — arrival corrupts an unheld seed on the spot,
      // so held-at-claim is proof of before-arrival.
      let prepared = false;
      if (call.column_id) {
        const colRow = sqlite.prepare("SELECT target_tile_id FROM incursion_columns WHERE id = ?").get(call.column_id) as any;
        if (colRow?.target_tile_id != null) {
          const held = sqlite.prepare("SELECT id FROM star_seeds WHERE owner_key = ? AND tile_id = ? AND state = 'held' AND bastion_building_id IS NOT NULL").get(call.owner_key, colRow.target_tile_id) as any;
          prepared = !!held;
        }
      }
      room.bastion = {
        callId: call.id, tier: call.column_id ? Number((sqlite.prepare("SELECT power FROM incursion_columns WHERE id = ?").get(call.column_id) as any)?.power ?? 1) : 2, kind: call.kind, hostKey: call.owner_key, hostTenderId: call.host_tender_id,
        hostName: player.name, columnId: call.column_id, seedId: call.seed_id,
        roster, size, ambush: call.kind === "ambush",
        pool, poolMax: pool, begun: false, resolved: false,
        prepared,
      };
      tell(room, `${player.name} claims the call: a ${call.kind.toUpperCase()} — ${size} of the dark. Friends, take your seats; the host begins it when the muster is ready. The pool stands at ✦${pool}.${prepared ? " The bastion stood ready before they came — its walls lend the host and his Awokin +3 AC against this enemy." : ""}`);
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
              power: base.power + Math.floor((lvl - 1) / 3), hp, maxHp: hp, pinnedUntil: 0, pos: { ...TILE_CENTERS.get(hex)! }, target: null, lastTile: hex,
              // The AC is read live off the kind's workshop
              // record (base 10 + bonus); the level scaling
              // rides on top.
              armor: enemyACFor(kind) + Math.floor((lvl - 1) / 2), lvl, speedGauge: 0,
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
          tell(R, `${player.name} deals — ${placed} of the dark take the field (threat ${threat}). The bank stands at ✦${c.bank}.`);
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
      // AWAY SEATS (Nigel, 2026-10-19): a dropped connection is
      // a Tender STEPPING AWAY, not leaving. Their seat moves
      // whole into the room's held registry; only when the
      // grace lapses unreturned does the seat truly leave (the
      // reaper in registerTableSocket speaks those words, the
      // Risk of Confluence among them — not here). A socket
      // whose seat was stolen by its own returning identity
      // (players no longer binds THIS socket to the player)
      // closes as a ghost: the seat lives on elsewhere.
      const stillBound = room.players.get(ws) === player;
      room.players.delete(ws);
      if (!player.watcher && stillBound) {
        room.away.set(player.key, { player, leftAt: Date.now() });
        tell(room, `${player.name} steps away from the Table — their seat is held.`);
      }
      if (room.players.size === 0 && room.away.size === 0) {
        if (room.campaign && !room.campaign.over) saveCampaign(room); // an emptied campaign room adjourns itself
        endBattle(room); rooms.delete(room.id);
      } else {
        // No one live, but seats stand held: a living campaign
        // adjourns itself to disk while the room waits.
        if (room.players.size === 0 && room.campaign && !room.campaign.over) saveCampaign(room);
        if (room.players.size > 0) sendState(room);
      }
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

  // AWAY SEATS lapse: a held seat whose Tender has not returned
  // within the grace becomes a TRUE leaving — this reaper, not
  // the socket's close, speaks the leaving words (the Risk of
  // Confluence stake tell among them, exactly as a departure
  // was always told). A room left with no one live and no seat
  // held is put away like an emptied room has always been.
  const reap = setInterval(() => {
    const now = Date.now();
    for (const room of [...rooms.values()]) {
      let lapsed = false;
      for (const [key, held] of [...room.away]) {
        if (now - held.leftAt < AWAY_GRACE_MS) continue;
        room.away.delete(key);
        lapsed = true;
        const p = held.player;
        if (room.players.size > 0) tell(room, `${p.name}'s held seat lapses — they have left the Table.`);
        // THE STORYTELLER'S SEAT (Campaign Build 1): a seat
        // held only stands while its holder's own seat
        // stands. When the holder's held seat lapses, the
        // storyteller's seat returns to unclaimed — and the
        // grants that holder gave fall with it, as does a
        // lapsed participant's own grant.
        if (room.campaign && room.campaign.storytellerKey === key) {
          room.campaign.storytellerKey = null;
          room.campaign.storytenderName = null;
          room.campaign.panelAccess = [];
          if (room.players.size > 0) tell(room, "📖 The Storyteller's seat stands unclaimed — its holder has left the Table.");
          saveCampaign(room);
        } else if (room.campaign && room.campaign.panelAccess.includes(key)) {
          room.campaign.panelAccess = room.campaign.panelAccess.filter(k => k !== key);
          saveCampaign(room);
        }
        // THE RISK OF CONFLUENCE (§4.3): a stake poured into a
        // living campaign stays in the pot when its Tender goes.
        if (room.campaign?.seeded && !room.campaign.over && !p.watcher && !p.storytender) {
          tell(room, `${p.name}'s stake stays in the pot (✦${room.campaign.bank}) — it divides only among those seated when the campaign turns home, unless they return.`);
        }
      }
      if (!lapsed) continue;
      if (room.players.size === 0 && room.away.size === 0) {
        if (room.campaign && !room.campaign.over) saveCampaign(room);
        endBattle(room); rooms.delete(room.id);
      } else if (room.players.size > 0) {
        sendState(room);
      }
    }
  }, 5_000);
  reap.unref?.();
}
