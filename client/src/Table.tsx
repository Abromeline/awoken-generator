/**
 * THE TABLE — the Discord Activity's room
 * (design of record: ~/workspace/discord-voice/TABLE-DESIGN.md).
 *
 * P0 — THE EMPTY TABLE: the room itself, whole — Sky Bar, Party,
 * Battleground with the star-seed at its heart, the Dark, the private
 * tabbed satchel, the dice pop-up, the Tale, personal
 * notes and the typed inventory — with named players and private test
 * companies proving the plumbing. Dealing, summoning and referee combat
 * are P1; the Storytender's Stage and Panel are P2. Nothing here
 * pretends otherwise: what cannot be done yet says so on its face.
 *
 * The skin is Ash & Ember (ruled 2026-10-15): charcoal and bone,
 * dried-blood browns, gold kept for light and law. The layout and
 * readability are the accepted prototype's, untouched.
 */

import { useEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { DiscordSDK } from "@discord/embedded-app-sdk";
import { reknockOnHello, takeTableBoot, takeTableSession } from "./tableSdk";
import { ElementGlyph, type GlyphElement } from "./glyphs";
import { BUNDLED_ENEMIES, FRAY_WALK_FRAMES, frayWalkFrameAt } from "./enemyArt";
import { FrayFaceImg } from "./EnemyFace";
import { TENDER_CLASSES, TENDER_CLASS_ORDER, tenderDirOf, tenderPose, tenderCastPose, CAST_MS, type TenderClassId, type TenderDir } from "./tenderArt";
import { WEAPONS, WEAPON_ORDER, weaponImg, shieldImg, type WeaponKey } from "./weaponArt";
import { BUNDLED_TERRAIN } from "./terrainArt";
import cursedImg from "./assets/terrain-iso/cursed-v3.png";
import nebulaNegative from "./assets/nebula-negative.jpg";
import meteorRain from "./assets/meteor-rain.gif";
import { WORKING_DEFS } from "./workingsData";
import { coarsePointer, loadHotbar, saveHotbar, toggleHotbarKey, HOTBAR_MAX } from "./hotbar";
import GroundWheel, { type WheelEntry, type WheelTabId } from "./GroundWheel";
import { deckWindow, nextDeckPage } from "./deckWindow";
import { createJumpEngine, jumpPress, jumpPoseInfo, jumpAirborne, jumpFlipped, jumpRuned, jumpHoverTick, jumpHovering, jumpCurseExempt, ladderTable, JPHYS, type JumpEngine } from "./jump";
import glyphEngine from "./assets/glyphs/engine.png";
import glyphStandard from "./assets/glyphs/standard.png";
import glyphBeacon from "./assets/glyphs/beacon.png";
import glyphBlade from "./assets/glyphs/blade.png";
import glyphBlades from "./assets/glyphs/blades.png";
import glyphCoil from "./assets/glyphs/coil.png";
import { ANIMATED_GLYPH, PROJECTILE_GIF } from "./effects";
import { batsFrameAt, holdRuneFrameAt, SHATTER_PIECES } from "./workingFx";
import { brambleFrameAt, brambleMoteFrameAt, BRAMBLE_DRAW_W, BRAMBLE_ASPECT, BRAMBLE_CENTRE_OFF, BRAMBLE_BASE_OFF, BRAMBLE_MOTE_SCALE } from "./brambleFx";
import seedSaplingArt from "./assets/starseed/sapling.png";
import seedBeaconArt from "./assets/starseed/beacon.png";
import { WORKING_FACE } from "./workingFaces";
import { api, type PackView } from "./api";
import { BACKPACK_FACE, faceForDrop, filterForDrop, dropSize, type DropLike } from "./dropFaces";
import bulwarkShieldImg from "./assets/effects/bulwark-shield.png";
import blackGateImg from "./assets/effects/black-gate.png";
import { playSummonFx, playRecallPoof, playFigureRise, figureArtEls } from "./summonFx";
import { elementPalette } from "./palette";

const GLYPHS: Record<string, string> = { seal: ANIMATED_GLYPH.seal, engine: glyphEngine, standard: glyphStandard, trees: ANIMATED_GLYPH.trees, beacon: glyphBeacon, lattice: ANIMATED_GLYPH.lattice, blade: glyphBlade, springblade: glyphBlade, blades: glyphBlades, shard: ANIMATED_GLYPH.shard, coil: glyphCoil, shardrain: ANIMATED_GLYPH.shardrain, ...WORKING_FACE };

/** A spell as the Table reads it — from the Grimoire (Nigel,
 *  2026-10-17): the workshop's book is the data of record now;
 *  the generated WORKING_DEFS are only the offline fallback. */
interface TableDef {
  key: string; root: string; kind: string; engine: string;
  glyph: string | null; cost: number; blurb: string;
  forms: Record<string, string>; numbers: Record<string, number>;
}
const STATIC_DEFS: Record<string, TableDef> = Object.fromEntries(
  Object.values(WORKING_DEFS as Record<string, any>).map((d: any) => [d.key, {
    key: d.key, root: d.root, kind: d.kind, engine: d.key,
    glyph: GLYPHS[d.key] ?? null, cost: d.cost, blurb: d.blurb,
    forms: d.forms as Record<string, string>, numbers: {} as Record<string, number>,
  }]),
);
/** The hues of the Written Light: filter recipes turn the gold
 *  master into the poured element (the grimoire's own recipes). */
const HUE_FILTERS: Record<string, string> = {
  unaligned: "none",
  tide: "hue-rotate(155deg) saturate(1.25)",
  sky: "hue-rotate(212deg) saturate(.5) brightness(1.3)",
  stone: "hue-rotate(-8deg) saturate(1.45) brightness(.97)",
  root: "hue-rotate(74deg) saturate(1.15)",
  fire: "hue-rotate(-30deg) saturate(1.6) brightness(1.06)",
};
const HUE_GLOWS: Record<string, string> = { unaligned: "#ffd98a", tide: "#57c8ff", sky: "#cdb9ff", stone: "#e8a33d", root: "#7dd069", fire: "#ff7a33" };

interface WorkingView {
  id: string; kind: "ward" | "rune" | "grove" | "spell"; root: string; name: string; hue: string;
  engine?: string;
  /** THE NEW WORKINGS (Nigel, 2026-10-22; seated 2026-10-23):
   *  the swarm's and the rune's clocks, for workingFx's frames. */
  bornAt?: number;
  struckAt?: number | null;
  targetId?: string | null;
  ownerKey: string; ownerName: string;
  hex: string | null; hexA: string | null; hexB: string | null;
  hp: number; stops: number; charges: number;
  /** GROVES (the Springleaf, Phase C): centre in stage px,
   *  radius, and expiry — the grove is drawn from these. */
  pos?: { x: number; y: number } | null;
  radiusPx?: number;
  expiresAt?: number;
  mother?: boolean;
  /** BULWARK (Recovery R12): the line of shields itself —
   *  each shield's field point and its own wounds. */
  shields?: { x: number; y: number; hp: number; maxHp: number }[];
  /** THE BLACK GATE AT THE TABLE (2026-10-24): its one
   *  wall node — the point it stands at and its wounds. */
  wall?: { x: number; y: number; hp: number; maxHp: number } | null;
  /** DEFENCE WORKS (the battle port — Twelve #1): a raised
   *  bramble's or rockwall's nodes — points in stage px with
   *  their own wounds; a bramble's motes carry mote, their
   *  parent node's point, their birth and watering bank. */
  nodes?: { x: number; y: number; hp: number; maxHp: number; mote?: 1; px?: number; py?: number; born?: number; bank?: number }[];
}

interface TableCard {
  id: string;
  name: string;
  power: number;
  toughness: number;
  element: string;
  art?: string;
  level?: number;
  awokenId?: number;
}

/** One tile of the instance map (the server's MapTile, as it
 *  crosses the wire): axial (q, r) on a radius-3 flower; "0,0"
 *  is the star-seed's ground. `landing` names the Tender whose
 *  arrival purified it, when one holds it. */
interface MapTileView {
  id: string;
  q: number;
  r: number;
  cursed: boolean;
  element: string | null;
  /** Element points resting on the tile (the Attune ledger):
   *  the tile holds the element with the most points here. */
  points?: Record<string, number>;
  curseHp: number;
  curseMaxHp: number;
  landing: string | null;
}

interface FieldUnitView {
  hex: string;
  cardId: string;
  /** The roster creature this unit is (THE PARTY, 2026-10-21):
   *  membership is reckoned by it; null for stand-in cards. */
  awokenId?: number | null;
  name: string;
  art: string | null;
  layers?: { source_id: string; category: string; imageUrl: string | null }[];
  element: string;
  power: number;
  toughness: number;
  hp: number;
  maxHp: number;
  shield?: number;
  maxShield?: number;
  /** Continuous position on the stage (Phase B). */
  pos: { x: number; y: number };
  tgt: { x: number; y: number } | null;
  moving: boolean;
  /** FOLLOW: the standing order to trail its Tender. */
  follow?: boolean;
  /** THE ORDERS (the battle port): attack / defense /
   *  binding — absent reads as attack, as on the homeland. */
  stance?: string;
  level: number | null;
  ownerKey: string;
  ownerName: string;
}

interface EnemyView { name: string; label: string; note: string; art: string | null }

interface SharedState {
  room: string;
  mode?: string;
  campaign?: {
    bank: number;
    bankStart: number;
    seeded: boolean;
    over: string | null;
    storytenderName: string | null;
    /** THE STORYTELLER'S SEAT (Campaign Build 1): the seat
     *  key of its holder — null stands unclaimed until a
     *  seated participant claims it in the room — and the
     *  seat keys granted the storyteller's panel. */
    storytellerKey?: string | null;
    panelAccess?: string[];
    stage: { title: string; text: string; imageUrl: string | null; at: number } | null;
    deals: number;
  } | null;
  sky: { mood: string; description: string; endsAt: string | null };
  round: number;
  threat: number;
  players: { key: string; name: string; companyCount: number; energy: number; maxEnergy: number; tenderHp: number; maxTenderHp: number; fallen: boolean; storytender?: boolean; hex: string | null; pos: { x: number; y: number } | null; tgt: { x: number; y: number } | null; moving: boolean; weaponKills?: number; castAt?: number; away?: boolean; classKey?: string | null; weaponKey?: string | null; weaponLevel?: number; weaponElement?: string | null; weaponDepth?: number; weaponManifest?: boolean; weaponSignature?: boolean }[];
  watcherCount: number;
  tale: { at: number; text: string }[];
  map: MapTileView[];
  field: FieldUnitView[];
  enemies: EnemyView[];
  dark: { id: string; hex: string; kind: string; label: string; art: string | null; power: number; hp: number; maxHp: number; pinnedUntil: number; armor?: number; lvl?: number; pos: { x: number; y: number }; tgt: { x: number; y: number } | null; moving: boolean }[];
  workings: WorkingView[];
  /** SHARD RAIN FALLS (Phase C): the moment the sky opened,
   *  and over which hexes — the drawn rain shows there. */
  rainFalls?: { id: string; at: number; hexes: string[] }[];
  /** THE SHARED PACK (the loot table fix, 2026-10-25):
   *  the casual room's unclaimed drops — every seat sees
   *  them; a click claims, or gives — and each fell's
   *  visible spring, flown to the nearest Tender. */
  pack?: { id: string; kind: "energy" | "attunement" | "item"; itemKey?: string; element?: string; name: string; qty: number }[];
  dropFx?: { id: string; at: number; from: { x: number; y: number }; to: { x: number; y: number }; drops: DropLike[] }[];
  /** THE SINGLE BLADE'S FLIGHTS (Recovery R4): a Blade was
   *  loosed — from its rune's hex, at the mark's point. */
  bladeFlights?: { id: string; at: number; fromHex: string; fromPos?: { x: number; y: number } | null; to: { x: number; y: number } }[];
  bladeCasts?: { id: string; at: number; workingId: string; fromPos: { x: number; y: number }; to: { x: number; y: number } }[];
  battle: { active: boolean; wave: number };
  /** THE STARSEED AT THE TABLE (the battle port): the
   *  room's seed — its level, the stage that level wears,
   *  the fed energy banked toward the next stage, and that
   *  stage's fed measure while one stands. */
  seed?: { level: number; stage: string; fedEnergy: number; nextStageAt: number | null };
  strikes?: { id?: number; at?: number; from: { x: number; y: number }; to: { x: number; y: number }; element: string | null; side: "light" | "dark"; hit: boolean; killed: boolean; weapon: string | null; pierce?: boolean; copy?: boolean }[];
  /** MANIFEST (Phase C): live copies of a Tender's weapon,
   *  orbiting their figure until they fade. */
  manifests?: { ownerKey: string; weaponKey: string; count: number; expiresAt: number }[];
  bastion?: {
    callId: number; kind: string; hostName: string; ambush: boolean;
    pool: number; poolMax: number; begun: boolean; resolved: boolean; size: number;
  } | null;
  /** HOSTED LAND (Twelve #2): whose land this room stands on,
   *  its door (the host's setting: public or kept by a word),
   *  and the lighthouse's face — lit, standing (lit and its
   *  keeper present), and the banked minutes whole. Null on
   *  the instanced world. */
  hosted?: {
    hostName: string;
    privacy: "public" | "password";
    /** Which ground the room stands on (the homeland port,
     *  2026-10-25): the host's original homeland, or their
     *  table-land record. Absent on older payloads — read as
     *  the table land. */
    source?: "tableland" | "homeland";
    beacon: { lit: boolean; standing: boolean; bankMinutes: number };
  } | null;
}

interface YouState {
  key: string;
  name: string;
  /** HOSTED LAND (Twelve #2): this seat is the standing
   *  land's keeper — the light and the door answer to their
   *  hand alone. */
  landHost?: boolean;
  /** The keeper's lighthouse purse while their land stands
   *  open here: their Shadow hoard and banked minutes. */
  beaconPurse?: { shadow: number; bankMinutes: number } | null;
  /** This Tender's own door, as their land's record keeps
   *  it — the beacon popup's starting shape when they open
   *  their land. Null for unbound seats. */
  landDoor?: { privacy: "public" | "password"; hasPassword: boolean } | null;
  /** THE WHEEL'S COMPANY (Nigel, 2026-10-21 — the wheel
   *  summoning law): the members this seat can call by the
   *  action wheel's summon cast — a bound seat's party,
   *  members not currently fielded; an unbound seat's
   *  stand-in pool likewise. The deck hand is retired; this
   *  list is what the wheel's Awoken branch reads. */
  company: TableCard[];
  /** THE REINFORCEMENT DECK (Nigel, 2026-10-23 — Recovery
   *  R6): the deck Awoken this seat's wheel can CALL IN —
   *  owned, outside the party, not on a road, not fielded
   *  here, not kept at a post — each with the road's price
   *  (its summon price). The wheel's Awoken branch shows
   *  them under the company a window of six at a time (the
   *  in-wheel fix, 2026-10-23 19:45); the tap is the call. */
  reinforcements?: { awakenedId: number; name: string; art: string | null; power: number; cost: number }[];
  /** SUMMONER'S POWER (Nigel, 2026-10-21): the term the
   *  summon cast rolls with beside the gift — the zodiac
   *  "summoner" clauses, +2 per 3 tender levels, +3 for the
   *  Sage — computed by the server's one helper, so the
   *  wheel's preview shows the cast's true shape. */
  summonersPower?: number;
  /** ATTUNEMENT REACH (Nigel, 2026-10-21): the skill bonus
   *  beyond the Attune ability's ring — the zodiac's
   *  "attuneReach" clauses summed by the server's one
   *  helper; 0 until the effects build sets its stars. The
   *  wheel's Attune branch reads it to show the reach the
   *  referee will enforce. */
  attuneReach?: number;
  /** The company kept back for place (the Fix Pass,
   *  2026-10-20): on the homeland field, or staged at the
   *  bastion — named beside the company, unavailable, with
   *  its whereabouts, instead of silently missing. */
  elsewhere?: { name: string; element: string; where: "fielded" | "staged" }[];
  notes: string;
  energy?: number;
  maxEnergy?: number;
  band?: number;
  bandCap?: number;
  tenderLevel?: number;
  healTier?: number;
  healAmount?: number;
  wardRuneUnlocked?: boolean;
  classKey?: string | null;
  weaponKey?: string | null;
  weaponLevel?: number;
  weaponElement?: string | null;
  weaponDepth?: number;
  weaponManifest?: boolean;
  weaponSignature?: boolean;
  tenderHp?: number;
  maxTenderHp?: number;
  pools?: Record<string, number> | null;
  /** THE PARTY (Nigel, 2026-10-20; built 2026-10-21): the
   *  creature ids standing in your party, served with your
   *  own payload only — the unit bar offers the add where a
   *  fielded Awokin of yours is not yet a member. */
  party?: number[];
  /** THE PARTY'S SEAT DISPLAY (build 2): the members with
   *  their standings for this Table ("field", "ready" at the
   *  wheel, or keeping a "post"), the open spots, and any
   *  reinforcements still on the road with their time left —
   *  served with your own payload. The display only shows
   *  the party; a member is CHOSEN on the Zodiac's deck
   *  screen, and a reinforcement is CALLED at the wheel —
   *  never here. */
  partyView?: {
    cap: number;
    members: { awakenedId: number; name: string; standing: "field" | "ready" | "post" }[];
    openSpots: number;
    incoming: { awakenedId: number; name: string; arrivesAt: number; cost: number }[];
  } | null;
  /** The colour each cast will wear, derived by the server
   *  from the page's standing in the Grimoire — served with
   *  the seat's own state (Nigel, 2026-10-20: the cast's hue
   *  is judged from the book, never picked in the field). */
  castHues?: Record<string, string>;
  inventory: string[];
  bound?: string | null;
  yourCall?: { id: number; kind: string; columnId: number | null; seedId: number | null; joinKey?: string | null } | null;
  /** CAMPAIGN (Phase B): dissipations per card — the recast
   *  multiplier the bank will charge for its return. */
  recasts?: Record<string, number>;
  /** The instance tile this Tender's landing purified. */
  landing?: string | null;
  /** The Storytender's private instruments (her eyes only). */
  storytender?: {
    reserve: string[];
    reserveThreat: number;
    partyPower: number;
    deals: number;
    bank: number;
    seeded: boolean;
    over: string | null;
  } | null;
}

type Phase = "boot" | "door" | "connecting" | "seated" | "lost" | "error" | "password";

const DICE = [4, 6, 8, 10, 12, 20, 100];

/** The five elements of the pools — the Attune ability's
 *  offerings (the Fix Pass, 2026-10-20; the wheel's Attune
 *  branch since 2026-10-21). */
const ATTUNE_ELEMENTS = ["root", "tide", "sky", "stone", "fire"] as const;

/** Each element's mark, as the Zodiac writes it. */
const ATTUNE_EMOJI: Record<string, string> = { tide: "🌊", sky: "🌬️", stone: "🪨", root: "🌿", fire: "🔥" };

/** The dice wear their shapes again (Nigel, 2026-10-18): every
 *  die in the pop-up is drawn as its own stone — the triangle,
 *  the pipped cube, the diamond, the kite, the pentagon, the
 *  hexagon — never bare text. */
function DieGlyph({ sides }: { sides: number }) {
  switch (sides) {
    case 4:
      return (<svg className="die-glyph" viewBox="0 0 34 34" aria-hidden="true"><polygon points="17,5 30,28 4,28" /><polygon points="17,16 22.5,24.5 11.5,24.5" /></svg>);
    case 6:
      return (<svg className="die-glyph" viewBox="0 0 34 34" aria-hidden="true"><rect x="8" y="8" width="18" height="18" rx="2.5" />{[[13, 12.5], [21, 12.5], [13, 17], [21, 17], [13, 21.5], [21, 21.5]].map(([cx, cy], i) => (<circle key={i} className="pip" cx={cx} cy={cy} r="1.5" />))}</svg>);
    case 8:
      return (<svg className="die-glyph" viewBox="0 0 34 34" aria-hidden="true"><polygon points="17,4 29,17 17,30 5,17" /><line x1="5" y1="17" x2="29" y2="17" /><line x1="17" y1="4" x2="17" y2="17" /><line x1="17" y1="30" x2="17" y2="17" /></svg>);
    case 10:
      return (<svg className="die-glyph" viewBox="0 0 34 34" aria-hidden="true"><polygon points="17,3 28,13 17,31 6,13" /><line x1="6" y1="13" x2="28" y2="13" /></svg>);
    case 12:
      return (<svg className="die-glyph" viewBox="0 0 34 34" aria-hidden="true"><polygon points="17,4 29.5,13 24.5,28.5 9.5,28.5 4.5,13" /><circle className="pip" cx="17" cy="18" r="1.6" /></svg>);
    case 20:
      return (<svg className="die-glyph" viewBox="0 0 34 34" aria-hidden="true"><polygon points="17,3 29,10.5 29,23.5 17,31 5,23.5 5,10.5" /><polygon points="17,11 23.5,22 10.5,22" /></svg>);
    default:
      return (<svg className="die-glyph" viewBox="0 0 34 34" aria-hidden="true"><polygon points="17,3 28,13 17,31 6,13" /><line x1="6" y1="13" x2="28" y2="13" /><text x="17" y="24.5" textAnchor="middle" fontSize="8.5" fill="currentColor" stroke="none">%</text></svg>);
  }
}
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

// ── THE INSTANCE MAP (Nigel, 2026-10-18): the Table's field is
// the terrain map now — a fresh instance dealt per room, drawn
// by the land's own isometric geometry. The constants and
// functions below are copied VERBATIM from Territory.tsx (the
// hex geometry section), so the Table's map and the land's map
// are one lattice and can never drift apart. The ART is
// canonical: where measurement and art disagree, the code
// moves, never the art.
const ISO_E: [number, number] = [1292, 470];
const ISO_SE: [number, number] = [0, 948];
const ISO_DEN = 796;

/** The lattice basis (east and south-east neighbor offsets) at a size. */
function isoBasis(size: number): { u: [number, number]; v: [number, number] } {
  const k = size / ISO_DEN;
  return { u: [ISO_E[0] * k, ISO_E[1] * k], v: [ISO_SE[0] * k, ISO_SE[1] * k] };
}

/** Axial → pixel offset, from the same basis (used with an origin). */
function isoOffset(q: number, r: number, size: number): { px: number; py: number } {
  const { u, v } = isoBasis(size);
  return { px: q * u[0] + r * v[0], py: q * u[1] + r * v[1] };
}

/** The painted face, measured from the tile art (source px, relative
 *  to face center, in angular order: TL, TR, R, BR, BL, L). */
const FACE_HEX: [number, number][] = [
  [-406, -468], [415, -468], [861, -6],
  [431, 476], [-431, 472], [-870, -6],
];

/** The six corners of the painted-face polygon around (cx, cy),
 *  optionally scaled about the center (pulses, double outlines). */
function hexCellVertices(cx: number, cy: number, size: number, scale = 1): [number, number][] {
  const k = (size / ISO_DEN) * scale;
  return FACE_HEX.map(([x, y]): [number, number] => [cx + x * k, cy + y * k]);
}

/** The fitted hex cell as an SVG points string. */
function hexCellPoints(cx: number, cy: number, size: number, scale = 1): string {
  return hexCellVertices(cx, cy, size, scale).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

/** The stage's one measure: the hex base size the instance is
 *  drawn at. The stage's frame is NOT fixed — the viewBox is
 *  computed from state.map's own extents (see stageBox), so the
 *  same drawing serves a radius-3 flower or a radius-5 one. */
const TILE_SIZE = 40;

/** THE BEACON BUTTON'S CHOICE, CARRIED IN (Nigel, 2026-10-25):
 *  the main page's beacon button — standing beside "The Table"
 *  once the Tender's first beacon is lit — offers two doors,
 *  and the chosen one rides the door page's address:
 *  ?land=homeland stands the room on the Tender's original
 *  homeland; ?land=new hunts a new starseed on a fresh table
 *  land. Read once, at the module's first breath; the room
 *  component speaks it to the server as a beaconOpen act the
 *  moment its seat stands (see the effect by `send`). No
 *  parameter, no act: the room opens exactly as it ever did,
 *  and the in-room beacon popup remains the manual door. */
const LAND_INTENT: string | null = (() => {
  try { return new URLSearchParams(window.location.search).get("land"); } catch { return null; }
})();
const SEED_TILE_ID = "0,0";
/** The strike's reach by the striker's element — the
 *  referee's own ELEMENT_REACH (table.ts), the same table
 *  the Zodiac reads: stone 1, root 2, fire 2, tide 3, sky 4. */
const STRIKE_REACH: Record<string, number> = { stone: 1, root: 2, fire: 2, tide: 3, sky: 4 };
const TILE_K = TILE_SIZE / ISO_DEN;

/** How a tile's painted face is drawn — Territory's seating law,
 *  carried verbatim (its TERRAIN_IMG_OFFSET + TERRAIN_IMG_PLACE,
 *  in units of TILE_SIZE). The tile PNGs are NOT face-sized: the
 *  element faces live on a 1920×1280 canvas with the face centre
 *  at (964, 546) source px, and the cursed face on a 1920×1510
 *  canvas (flame-wisps above the face) with its centre at
 *  (960, 790). Drawing the image AS IF the canvas were the face's
 *  own bounding box (1731×944) shrank every painted face to ~74%
 *  of its cell (cursed ~63%) under SVG's meet letterbox — the
 *  honeycomb read as separate tiles floating in gaps (Nigel,
 *  2026-10-18). Seated by the face centre instead, each painted
 *  face fills its fitted cell exactly, so neighbours share full
 *  edges by the lattice's construction. Neutral's slab sits
 *  off-template in its canvas, hence its nudge; cursed gets its
 *  own height and lift. */
const TILE_ART_PLACE: Record<string, { dx: number; dy: number; h: number }> = {
  neutral: { dx: -0.1180, dy: 0.0302, h: 1.608 },
  cursed: { dx: 0, dy: -0.3067, h: 1.8968 },
};
const TILE_ART_PLACE_DEFAULT = { dx: 0, dy: 0, h: 1.608 };

/** A tile's center in the stage's own coordinates (no origin:
 *  the viewBox frames wherever the tiles fall). Purified land
 *  rides 5px higher than the curse — Territory's own tray-lift
 *  law, one step: the light literally stands above the dark. */
function tilePos(q: number, r: number, cursed: boolean): { cx: number; cy: number } {
  const { px, py } = isoOffset(q, r, TILE_SIZE);
  return { cx: px, cy: py + (cursed ? 0 : -5) };
}

/** Axial hex distance between two tiles of the instance. */
function axialDist(a: { q: number; r: number }, b: { q: number; r: number }): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs((a.q + a.r) - (b.q + b.r))) / 2;
}

/** Where the stacked light stands on one tile: a 2×2 fan
 *  around the tile's standing point (STACK_CAP is 4), scaled
 *  to the stage's tile size. */
const STACK_OFF: [number, number][] = [[-19, -4], [19, -4], [-19, 15], [19, 15]];

/** A small court of colors: a figure's owner ring is filled
 *  by a steady hash of their name, so a Tender's light wears
 *  the same color on every screen. */
const OWNER_COLORS = ["#e8b13a", "#57c8ff", "#7dd069", "#ff7a9e", "#cdb9ff", "#ff9c4a", "#4ad6c2", "#f0e68c"];
function ownerColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return OWNER_COLORS[h % OWNER_COLORS.length];
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

// THE TABLE'S SKY (Nigel, 2026-10-25): the moon-and-spires
// scene that backed the field is struck. In its place the
// room stands under the second nebula — the Negative — held
// STILL (its turning and breathing belong to the front
// page's sky, not this room), with his meteors falling over
// it: a handful of instances of the meteor-rain the
// homeland's unrisen seeds wear, each on its own slow fall
// (transform only — the sky costs the room nothing it can
// feel, and no placement or readability moves for it).
// left/width in %/px of the field wrap; dur/delay in
// seconds, delays negative so the sky is already falling
// at first paint.
const TABLE_METEORS = [
  { left: "6%", w: 54, dur: "11s", delay: "-3s", o: 0.75 },
  { left: "22%", w: 38, dur: "14s", delay: "-9s", o: 0.55 },
  { left: "41%", w: 66, dur: "9.5s", delay: "-5.5s", o: 0.85 },
  { left: "63%", w: 42, dur: "12.5s", delay: "-1.5s", o: 0.6 },
  { left: "79%", w: 58, dur: "10.5s", delay: "-7.5s", o: 0.8 },
  { left: "92%", w: 34, dur: "15s", delay: "-11s", o: 0.5 },
] as const;

const ROSTER = [
  { name: "fray", label: "Fray", note: "Small ink splatters. Weak alone, dangerous in groups." },
  { name: "unraveler", label: "Unraveler", note: "Looming ink mass. Hunts the strongest standing." },
  { name: "hollow", label: "Hollow", note: "Pure void. Drains energy instead of blood." },
  { name: "tangle", label: "Tangle", note: "Knotted thorns. Pins one Awokin where it stands." },
] as const;

export default function Table() {
  // THE ERROR NET'S PROOF INJECTION (2026-10-24): a test-only
  // fault, set only by scripts/drive-table-error-net.mjs via
  // the ?tablefault= query flag — no production road ever sets
  // it. "render" throws as the room renders, "effect" throws
  // as a mount effect commits: the two teardown roads the
  // room's error boundary (TableApp.tsx) must catch and speak
  // for, where once either one left a mute brown screen.
  const driveFault = new URLSearchParams(window.location.search).get("tablefault");
  if (driveFault === "render") {
    throw new Error("drive-injected render fault — the error net's proof, set only by drive-table-error-net");
  }
  const [phase, setPhase] = useState<Phase>("boot");
  const [bootStep, setBootStep] = useState("Waking the Table…");
  const [error, setError] = useState("");
  // HOSTED LAND (Twelve #2): the land door's word — asked
  // only when a kept land refuses a seat (the server's
  // joinError carries needsPassword), and the beacon popup
  // with its door form.
  const [pwInput, setPwInput] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [beaconUp, setBeaconUp] = useState(false);
  // THE BAG (the loot table fix, 2026-10-25): the shared
  // Pack's door on the right side, the panel it opens,
  // my own inventory's face inside it, and the entry a
  // Give is being aimed from.
  const [bagUp, setBagUp] = useState(false);
  const [myPack, setMyPack] = useState<PackView | null>(null);
  const [giveFor, setGiveFor] = useState<string | null>(null);
  const refreshMyPack = () => {
    api.getInventory().then((r) => setMyPack(r.pack)).catch(() => setMyPack(null));
  };
  const [doorPrivacy, setDoorPrivacy] = useState<"public" | "password">("public");
  const [doorWord, setDoorWord] = useState("");
  const [notice, setNotice] = useState("");
  const [devMode, setDevMode] = useState(false);
  const [devName, setDevName] = useState("");
  const [shared, setShared] = useState<SharedState | null>(null);
  const [you, setYou] = useState<YouState | null>(null);
  // The satchel's faces (Nigel, 2026-10-22): I · Awokin
  // (your standing) and IV · Potions & Items only — the
  // workings faces that once stood between them (II ·
  // Abilities, III · Spells) were the workings menu, and
  // the menu is struck everywhere. Casting lives wholly
  // in the wheel: right-click, branch, pick, click-cast.
  const [tab, setTab] = useState<"I" | "IV">("I");
  // The satchel drawer (Phase A room, Nigel 2026-10-18; the
  // hand it once held was retired by the wheel law,
  // 2026-10-21): the satchel rests half off-screen and rises
  // when reached for.
  const [handUp, setHandUp] = useState(false);
  // CAMPAIGN doors (Phase B): the Discord door's proven name,
  // held while the opener chooses the room's nature; and the
  // doorway-test campaign key.
  const [authJoin, setAuthJoin] = useState<{ authToken: string; instanceId: string } | null>(null);
  const [campKey, setCampKey] = useState("");
  // The Stage: hidden by the viewer's own tap until a new
  // scene is set.
  const [stageHidden, setStageHidden] = useState(false);
  // The Storytender's instruments (her panel's drafts).
  const [stNarrate, setStNarrate] = useState("");
  const [stSceneTitle, setStSceneTitle] = useState("");
  const [stSceneText, setStSceneText] = useState("");
  const [stSceneImg, setStSceneImg] = useState("");
  const [stSkyText, setStSkyText] = useState("");
  // (The workshop-chosen card border dressed the hand cards
  // here until the wheel law retired the hand, 2026-10-21 —
  // the border's read and its state went with the cards it
  // wrapped. The game pages consume it as they always have.)
  // The Grimoire, read at mount (the same public read the game
  // uses): names, costs, blurbs, and glyph assignments all come
  // from the workshop's book. The referee refreshes its own
  // copy on every message, so a tuning lands within a cast.
  const [grimoire, setGrimoire] = useState<any | null>(null);
  // THE BROWSER MENU NEVER APPEARS IN THE GAME (Nigel,
  // 2026-10-22): one suppression at the app's root — the
  // right hand belongs to the wheel and the pan everywhere
  // on this ground. Typing keeps its menu: where a field
  // takes text (input, textarea, select, contentEditable),
  // paste and its kin keep working.
  useEffect(() => {
    const onMenu = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", onMenu);
    return () => document.removeEventListener("contextmenu", onMenu);
  }, []);
  // The effect half of the error net's proof injection (see
  // the component's head): a throw as this mount effect
  // commits must land in the room's error boundary, not tear
  // the tree down to brown.
  useEffect(() => {
    if (driveFault === "effect") {
      throw new Error("drive-injected effect fault — the error net's proof, set only by drive-table-error-net");
    }
  }, []);
  useEffect(() => {
    let live = true;
    fetch("/api/getGrimoire", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then((r) => r.json())
      .then((d) => { if (live && d && Array.isArray(d.spells)) setGrimoire(d); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  const defs: Record<string, TableDef> = (() => {
    if (!grimoire) return STATIC_DEFS;
    const out: Record<string, TableDef> = {};
    for (const sp of grimoire.spells as any[]) {
      const glyph = (grimoire.glyphs as any[]).find((g) => g.id === sp.glyphId);
      out[sp.key] = {
        key: sp.key, root: sp.name, kind: sp.kind, engine: sp.engine,
        glyph: glyph ? (glyph.imageUrl ?? (glyph.assetKey ? GLYPHS[glyph.assetKey] ?? null : null)) : (GLYPHS[sp.key] ?? null),
        cost: sp.cost, blurb: sp.blurb, forms: sp.forms ?? {}, numbers: sp.numbers ?? {},
      };
    }
    return out;
  })();
  const healDef = Object.values(defs).find((d) => d.engine === "heal");
  // The Written Light: what is being laid, and the placement
  // steps (a ward wants an anchor hex, then a neighbour; the
  // Three Blades gather up to three hexes). THE POUR MENU IS
  // GONE (Nigel, 2026-10-20): no hue/points choice stands
  // between readying and casting, and powering lives in the
  // Grimoire now. THE CAST'S COLOUR IS DERIVED (Nigel,
  // 2026-10-20 19:35): the server judges each cast's hue
  // from its page's standing in the book — the element the
  // page is most attuned to — and serves the seat those
  // colours (you.castHues) so the form a cast will wear is
  // the form shown here, before the tap. No hue is sent
  // with a cast; a sent one would be inert.
  const castHueFor = (key: string): string => you?.castHues?.[key] ?? "unaligned";
  // The readied placing: a working of the Written Light
  // (ward / rune / heal, root = the Grimoire page's key) —
  // or, since the Attune Ability build (Nigel, 2026-10-21),
  // the ATTUNE ability readied (kind "attune", root = the
  // element being laid). One flow, one unloading law: the
  // run stays armed across taps until it is set down.
  const [placing, setPlacing] = useState<{ kind: "ward" | "rune" | "heal" | "attune"; root: string } | null>(null);
  // RUNE SHATTER'S HELD CAST (Nigel, 2026-10-22): the press's
  // measure, taken at the tile's pointerdown and read at its
  // tap — the held stream is bought by that measure.
  const castPressAtRef = useRef<number>(0);
  const [wardAnchor, setWardAnchor] = useState<string | null>(null);
  /** NO HEX-LOCK (2026-10-24): the ward anchor's tapped
   *  POINT, carried beside its hex — the cast is aimed by
   *  the two points the player actually tapped. */
  const [wardAnchorPt, setWardAnchorPt] = useState<{ x: number; y: number } | null>(null);
  const [bladePicks, setBladePicks] = useState<string[]>([]);
  const [callKeyInput, setCallKeyInput] = useState("");
  // VISUALIZED COMBAT (Nigel, 2026-10-17): the referee reports
  // every strike of the round it just resolved; the Table
  // flies them — the attacker's element from its hex to its
  // mark's, the dark answering in a darkened bolt.
  const [shots, setShots] = useState<{ id: number; from: { x: number; y: number }; to: { x: number; y: number }; img: string; dark: boolean; hit: boolean; killed: boolean; idx: number; pierce?: boolean }[]>([]);
  const shotIdRef = useRef(0);
  // Each shot's removal timer, kept by the shot's own id
  // (the Fix Pass, 2026-10-20): a shot's 1500 ms of life is
  // ITS OWN, held in this ref — never again in an effect
  // whose cleanup the next state push (~250 ms) cancels,
  // which is why shots once piled to the cap and froze at
  // their endpoints mid-battle (Nigel's photo).
  const shotTimersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  useEffect(() => () => {
    for (const t of shotTimersRef.current.values()) clearTimeout(t);
    shotTimersRef.current.clear();
  }, []);
  // SMOOTHING (Phase B): drawn positions, lerped across ticks
  // toward the server's continuous positions.
  const smoothedPosRef = useRef(new Map<string, { x: number; y: number }>());
  // Every strike carries the referee's running id; the Table
  // flies each one it has not flown, while it is fresh. A
  // curse-strike ordered between beats therefore flies on
  // the order itself, not on the next round's turn — and an
  // antique strike, joined late, is marked seen without
  // flying, so no shot ever flies twice or out of its time.
  const flownStrikeRef = useRef(0);
  useEffect(() => {
    if (!shared) return;
    const strikes = shared.strikes ?? [];
    if (!strikes.length) return;
    const now = Date.now();
    const fresh = strikes.filter((st) => {
      if (typeof st.id !== "number") return false;
      if (st.id <= flownStrikeRef.current) return false;
      flownStrikeRef.current = st.id;
      return now - (st.at ?? 0) < 1600;
    }).map((st) => ({
      id: ++shotIdRef.current,
      from: st.from, to: st.to,
      img: st.side === "dark" ? PROJECTILE_GIF.unaligned : ((st.element ? PROJECTILE_GIF[st.element] : undefined) ?? PROJECTILE_GIF.unaligned),
      dark: st.side === "dark", hit: st.hit, killed: st.killed, idx: shotIdRef.current % 1000, pierce: st.pierce,
    }));
    if (!fresh.length) return;
    setShots(prev => [...prev.slice(-30), ...fresh]);
    // Removal is keyed per shot and lives outside this
    // effect's cleanup, so a state push can no longer cancel
    // a flying shot's end: each falls exactly 1500 ms after
    // it was loosed, whatever the room sends meanwhile.
    for (const f of fresh) {
      const prior = shotTimersRef.current.get(f.id);
      if (prior) clearTimeout(prior);
      const t = setTimeout(() => {
        shotTimersRef.current.delete(f.id);
        setShots(prev => prev.filter(x => x.id !== f.id));
      }, 1500);
      shotTimersRef.current.set(f.id, t);
    }
  }, [shared]);
  // THE MARCH (2026-10-18): a standing Awoken of mine, chosen
  // to receive orders — march, heal, recall (see the unit bar).
  const [selUnitId, setSelUnitId] = useState<string | null>(null);
  // STRIKE THE CURSE (Nigel, 2026-10-18): the chosen Awokin is
  // armed against the curse — its tile taps spend blows on
  // cursed ground instead of marching (see onTileTap), one
  // blow per tap, as the land's blow-per-order rules it.
  const [strikeArm, setStrikeArm] = useState(false);
  useEffect(() => { setStrikeArm(false); }, [selUnitId]);
  // SEAMLESS STICKY CASTING (Nigel, 2026-10-20; the run's
  // ends re-ruled 2026-10-23 23:39, corrected 23:40): a
  // target tap fires the cast at once — no confirm stands
  // in the flow, and the readied placing STAYS armed across
  // taps until the run ends: the player unloads it or
  // readies another working — changing workings is the
  // run's one true end. A fizzle does NOT end it ("if the
  // roll fails you can still re cast"), and neither does
  // the purse: an empty purse refuses that one cast while
  // the working stays readied. placingRef mirrors the
  // placing for the socket's own handlers and watchers,
  // which were bound once and cannot see fresh state.
  const placingRef = useRef<typeof placing>(null);
  placingRef.current = placing;
  // The run's end, reached from the mount-once key handler
  // and the player's own unload — each bound outside this
  // render's closures. No cast outcome comes through here.
  const unloadCastRef = useRef<(() => void) | null>(null);
  // The stage clock: the stage ticks gently while anyone
  // watches, so smoothed figures lerp across server ticks.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 150);
    return () => clearInterval(t);
  }, []);
  // THE BLADE'S CLOCK (the delivery, 2026-10-24): while any
  // blade flight is live — a loose or a cast — the stage
  // clock ticks at 50 ms, the homeland shard's cadence, so
  // the blade's road is walked step by step, not in five
  // 150 ms strides.
  const anyBladeFlightLive = (shared?.bladeFlights ?? []).length > 0 || (shared?.bladeCasts ?? []).length > 0;
  useEffect(() => {
    if (!anyBladeFlightLive) return;
    const t = setInterval(() => setNowMs(Date.now()), 50);
    return () => clearInterval(t);
  }, [anyBladeFlightLive]);
  // THE TENDERS TAKE THE FIELD (Nigel's class sprites, 2026-10-19):
  // which class figure the local tender wears on the stage. THE
  // CLASS GATE (ruled 2026-10-19): for a bound Tender the figure IS
  // their chosen class — the seat's classKey rules and the device
  // pick yields. The device pick remains only for unbound trial
  // seats (dev and stand-in play), kept on this device.
  const [myTenderClass, setMyTenderClass] = useState<TenderClassId>(() => {
    const v = localStorage.getItem("table-tender-class");
    return v === "runewright" || v === "binder" || v === "witch" || v === "sage" ? v : "warden";
  });
  const myServerClass = ((you?.classKey ?? shared?.players.find(p => you && p.key === you.key)?.classKey) ?? null) as TenderClassId | null;
  useEffect(() => {
    if (myServerClass) setMyTenderClass(myServerClass);
  }, [myServerClass]);
  // THE JUMP at the Table (Nigel, 2026-10-19): my own figure's
  // leap, kept in a ref like the walk — the Ground's engine, the
  // class's own arc. Motion only; the referee never hears of it.
  // THE QUICKNESS LADDER rides the same engine (Nigel,
  // 2026-10-22; Recovery R14): the arc is the ladder's, and the
  // Witch's hover holds while Space is held — ticked here on
  // the stage's own clock. The hover's PURSE is the homeland's
  // (the engine's charges are settled there, through
  // hoverSpend): at the Table the leap is motion only by the
  // standing law above, so the tick's purse answers as an
  // unpurse'd motion must — the hover holds while held and
  // ends on release, its charge schedule running in the
  // engine exactly as the Ground keeps it.
  const myJumpRef = useRef<JumpEngine>(createJumpEngine());
  const myClassRef = useRef<string | null>(null);
  const tableSpaceHeldRef = useRef(false);
  useEffect(() => { myClassRef.current = myServerClass ?? myTenderClass; }, [myServerClass, myTenderClass]);
  useEffect(() => {
    const t = setInterval(() => {
      jumpHoverTick(myJumpRef.current, Date.now(), tableSpaceHeldRef.current, () => true);
    }, 150);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    (window as any).__tableJump = {
      press: () => jumpPress(myJumpRef.current, myClassRef.current ?? "warden", Date.now()),
      height: () => myJumpRef.current.h,
      airborne: () => jumpAirborne(myJumpRef.current, Date.now()),
      flipped: () => jumpFlipped(myJumpRef.current, Date.now()),
      runed: () => jumpRuned(myJumpRef.current, Date.now()),
      hovering: () => jumpHovering(myJumpRef.current, Date.now()),
      curseExempt: () => jumpCurseExempt(myJumpRef.current, Date.now()),
      ladder: () => ladderTable(),
    };
    return () => { delete (window as any).__tableJump; };
  }, []);
  // Each seated tender's walk, kept off the wire: where their
  // figure stands, and the commute it is walking, if any. The
  // server never hears of it — a figure's place is read off the
  // room's own state (their company's ground, or a rim post).
  // You, selected: your own figure takes orders like an
  // Awokin — tap a tile and you glide there yourself.
  const [selTender, setSelTender] = useState(false);
  // THE WHEEL (Nigel, 2026-10-19; RESTORED to the Proving
  // Ground's design, 2026-10-20): right-click (or a long
  // press, for the iPad) opens the radial where the hand
  // rests — the Ground's two-tier zodiac wheel, drawn by
  // GroundWheel.tsx. Choosing an entry readies its working;
  // the next clicks choose the target, by the placing laws
  // that already govern casting.
  const [radial, setRadial] = useState<{ x: number; y: number } | null>(null);
  // THE WHEEL, RESTORED (Nigel, 2026-10-20): the Proving
  // Ground's radial is the design of record — six branches on
  // the outer ring, the open branch's entries on the inner,
  // the Ability's Weapon a sub-ring in the same fan. The tab
  // is the branch standing open; it keeps its place between
  // openings, as the Ground's wheel keeps its own.
  const [wheelTab, setWheelTab] = useState<WheelTabId>("spell");
  // THE DECK WINDOW'S PAGE (Nigel, 2026-10-23 — the R6
  // in-wheel fix): which window of six deck entries the
  // Awoken branch is showing. The "More" entry inside the
  // wheel advances it; deckWindow.ts clamps it when the
  // deck shrinks under a landed call.
  const [deckPage, setDeckPage] = useState(0);
  // THE TENDER CONTROLLER + HOTBAR (Nigel, 2026-10-19): on a
  // touch hand, tapping your own figure pops a dedicated
  // controller — a hold-to-glide pad on the left and the
  // wheel's button — while the hotbar carries what the wheel
  // (and the hand) locked onto it. Desktop keeps its scheme;
  // the bar simply waits empty until something is locked.
  const [controllerOpen, setControllerOpen] = useState(false);
  const TABLE_HOTBAR_KEY = "awokin-hotbar-table";
  const [hotbarKeys, setHotbarKeys] = useState<string[]>(() => loadHotbar(TABLE_HOTBAR_KEY));
  const toggleHotbar = (key: string) => {
    setHotbarKeys(ks => { const next = toggleHotbarKey(ks, key); saveHotbar(TABLE_HOTBAR_KEY, next); return next; });
  };
  const padVecRef = useRef<{ x: number; y: number } | null>(null);
  const padTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const padSendRef = useRef<(() => void) | null>(null);
  const [padKnob, setPadKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  // CASTING GESTURES (Nigel, 2026-10-19): who is mid-cast on
  // this screen, and toward what. Own casts begin the moment
  // the order is given; other seats' casts arrive on the
  // server's castAt echo and face their newest working.
  const castAnimRef = useRef(new Map<string, { startedAt: number; dir: TenderDir }>());
  const ownCastMarkRef = useRef(0);
  // THE SUMMON SEQUENCE'S RECKONING (Nigel, 2026-10-23): the
  // unit keys this screen has already seen standing, and each
  // standing unit's last drawn ground point — the field diff
  // below plays the Proving Ground's sequence for a unit that
  // newly stands, and the recall's poof for one that leaves.
  const seenUnitsRef = useRef<Set<string> | null>(null);
  const unitAnchorRef = useRef(new Map<string, { x: number; y: number }>());
  const seenCastRef = useRef(new Map<string, number>());
  const beginCast = (targetHexId: string | null) => {
    if (!you || !shared) return;
    const me = shared.players.find(p => p.key === you.key);
    const from = me?.pos ? { cx: me.pos.x, cy: me.pos.y } : me?.hex ? centerOf(me.hex) : null;
    const to = targetHexId ? centerOf(targetHexId) : null;
    const dir = from && to ? tenderDirOf(to.cx - from.cx, to.cy - from.cy) : "S";
    castAnimRef.current.set(you.key, { startedAt: Date.now(), dir });
    ownCastMarkRef.current = Date.now();
  };

  // THE RUN'S END (Nigel, 2026-10-20): unloading drops the
  // placing flow whole — the working leaves the readying, the
  // half-chosen ground (anchor, blade picks) goes with it —
  // and nothing is charged for the setting down. A fired
  // cast does NOT come through here: firing keeps the
  // placing armed (the sticky run), spending only the
  // cast's own transients (the anchor, the picks) at the
  // send.
  const unloadCast = () => {
    setPlacing(null); setWardAnchor(null); setWardAnchorPt(null); setBladePicks([]);
  };
  unloadCastRef.current = unloadCast;
  useEffect(() => {
    if (!shared) return;
    for (const p of shared.players) {
      if (!p.castAt || seenCastRef.current.get(p.key) === p.castAt) continue;
      seenCastRef.current.set(p.key, p.castAt);
      if (you && p.key === you.key && Date.now() - ownCastMarkRef.current < 1600) continue;
      const w = [...shared.workings].reverse().find(wk => wk.ownerKey === p.key);
      const targetId = w?.hex ?? w?.hexA ?? null;
      const fromC = p.hex ? centerOf(p.hex) : null;
      const from = p.pos ? { x: p.pos.x, y: p.pos.y } : fromC ? { x: fromC.cx, y: fromC.cy } : null;
      const toC = targetId ? centerOf(targetId) : null;
      const to = toC ? { x: toC.cx, y: toC.cy } : null;
      const dir = from && to ? tenderDirOf(to.x - from.x, to.y - from.y) : "S";
      castAnimRef.current.set(p.key, { startedAt: Date.now(), dir });
    }
  }, [shared]);
  // THE SUMMON SEQUENCE (Nigel, 2026-10-23 — the Proving
  // Ground's theatre, ported whole; see summonFx.ts): the
  // field is the programme. A player unit that newly stands
  // after this screen's first snapshot was landed by a summon
  // cast, and the Ground's whole sequence plays at its figure
  // for EVERY seat at the Table — shards converging while the
  // figure rises, the flash and poof at 640 ms, its name
  // answering at the rise's end. A unit that leaves the field
  // takes the recall's poof at its last ground point. The
  // first snapshot only seeds the reckoning — no one plays
  // for a figure already standing when a viewer arrives, and
  // the dark (shared.dark) never plays at all: enemies are
  // not summons.
  useEffect(() => {
    if (!shared) { seenUnitsRef.current = null; return; }
    const seen = seenUnitsRef.current;
    if (!seen) {
      seenUnitsRef.current = new Set(shared.field.map(u => `${u.ownerKey}|${u.cardId}`));
      return;
    }
    // A stage point (inside the board's pan/zoom group)
    // carried into the fx layer's client coordinates.
    const stageToClient = (ax: number, ay: number): { x: number; y: number } | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const k = Math.max(rect.width / stageBox.w, rect.height / stageBox.h);
      return {
        x: rect.left + (rect.width - stageBox.w * k) / 2 + (ax * view.zoom + view.pan.x - stageBox.x) * k,
        y: rect.top + (rect.height - stageBox.h * k) / 2 + (ay * view.zoom + view.pan.y - stageBox.y) * k,
      };
    };
    const unitHeightClient = (): number => {
      const svg = svgRef.current;
      if (!svg) return 40;
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0) return 40;
      return 40 * view.zoom * Math.max(rect.width / stageBox.w, rect.height / stageBox.h);
    };
    const nowKeys = new Set<string>();
    for (const u of shared.field) {
      const key = `${u.ownerKey}|${u.cardId}`;
      nowKeys.add(key);
      if (seen.has(key)) continue;
      seen.add(key);
      const color = (elementPalette as unknown as Record<string, string>)[u.element] ?? null;
      // The sequence anchors at the unit's own ground point —
      // the anchor the figures loop just drew it at (the unit
      // group's box runs on into its nameplate and bars, so
      // the box is not the ground) — and the rise plays on
      // the unit's rendered node.
      const anchor = unitAnchorRef.current.get(key);
      const node = Array.from(document.querySelectorAll("g[data-unit-key]")).find(n => (n as SVGGElement).dataset.unitKey === key);
      const pt = anchor ? stageToClient(anchor.x, anchor.y) : null;
      if (pt) playSummonFx(pt.x, pt.y, unitHeightClient(), { name: u.name, color });
      else if (node) {
        const rect = node.getBoundingClientRect();
        playSummonFx(rect.left + rect.width / 2, rect.bottom, rect.height, { name: u.name, color });
      }
      if (node) playFigureRise(node, figureArtEls(node));
    }
    for (const key of Array.from(seen)) {
      if (nowKeys.has(key)) continue;
      seen.delete(key);
      const anchor = unitAnchorRef.current.get(key);
      unitAnchorRef.current.delete(key);
      const pt = anchor ? stageToClient(anchor.x, anchor.y) : null;
      if (pt) playRecallPoof(pt.x, pt.y, unitHeightClient());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared]);
  // THE FIZZLE, SPOKEN (Nigel, 2026-10-20; the slip struck
  // 2026-10-23 23:39, corrected 23:40): a fizzled roll was
  // once read here as the run's end — the working slipped
  // and had to be readied again. That law is struck: the
  // fizzle is still read from the room's own tale, where
  // the referee writes every unravelling by name, and
  // spoken to the caster — but the placing is NOT
  // unloaded: the working stays readied and the next tap
  // casts it again, exactly as after a standing cast. (The
  // old slip's pattern named only the reckoning-less form
  // — "unravels — the roll falls short." — while every
  // cast the referee unravels carries its reckoning:
  // "unravels — rolled …: the roll falls short." The slip
  // therefore never fired on a real fizzle; the pattern
  // below reads both forms, so the fizzle is spoken at
  // last — with the new law's words, and no unloading.)
  // My own line only counts while a run stands armed and a
  // cast of mine is fresh (beginCast's mark) — the backlog
  // from before I sat down is primed past, never acted on.
  const taleSeenRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!shared || !you) return;
    const tale = shared.tale ?? [];
    if (!taleSeenRef.current) {
      taleSeenRef.current = new Set(tale.map(t => `${t.at}|${t.text}`));
      return;
    }
    const seen = taleSeenRef.current;
    const fresh = tale.filter(t => !seen.has(`${t.at}|${t.text}`));
    for (const t of tale) seen.add(`${t.at}|${t.text}`);
    if (!placingRef.current) return;
    if (Date.now() - ownCastMarkRef.current > 15000) return;
    const mine = fresh.find(t => t.text.startsWith(`${you.name}'s `) && t.text.includes("unravels —") && t.text.includes("the roll falls short."));
    if (!mine) return;
    setNotice(`${mine.text} The working stays readied in your hand — tap the ground to cast it again.`);
  }, [shared]);
  // WASD GLIDES THE TENDER (Phase B): the lattice's own
  // compass — Q/W/E across the top arc, A/S/D below it,
  // arrows riding the same steps. Held keys sum into one
  // direction; the tender glides continuously toward a point
  // 420px that way, refreshed every 120ms while keys are held.
  // Free, as his own walking is; ignored only while he has
  // fallen. A READIED WORKING DOES NOT STILL HIM (Twelve #6 —
  // Nigel, 2026-10-25: "casting is still causing movement to
  // be locked"): the glide, the leap and the controller's pad
  // all answer while a working stands readied and while a
  // cast fires — and no cast is ever judged from a stale
  // position: the referee reckons from where he stands when
  // the cast fires, so walking between casts is answered by
  // the range gate honestly, at the firing. The wheel no
  // longer stills him (Nigel, 2026-10-19): right-click
  // mid-glide opens the radial, and the glide rides on under
  // it — the menu comes to the Tender, not the Tender to the
  // menu.
  const GLIDE_STEPS: Record<string, [number, number]> = {
    KeyW: [0, -1], KeyS: [0, 1], KeyQ: [-1, 0], KeyE: [1, -1], KeyA: [-1, 1], KeyD: [1, 0],
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, -1],
  };
  const heldKeysRef = useRef<Set<string>>(new Set());
  const glideTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const myPosRef = useRef<{ x: number; y: number } | null>(null);
  myPosRef.current = you && shared ? (shared.players.find(p => p.key === you.key)?.pos ?? null) : null;
  const glideGuardRef = useRef({ radial: false, fallen: false });
  glideGuardRef.current = {
    radial: !!radial,
    fallen: !!(you && shared && shared.players.find(p => p.key === you.key)?.fallen),
  };
  // The hotbar under the number keys (the Ground's casting by
  // number): the key handler is mounted once, so it reaches
  // the belt through this ref, refreshed every render.
  const hotbarActRef = useRef<(i: number) => void>(() => {});
  const sendGlideRef = useRef<(() => void) | null>(null);
  sendGlideRef.current = () => {
    const pos = myPosRef.current;
    if (!pos || heldKeysRef.current.size === 0) return;
    if (!you || !shared) return;
    const me = shared.players.find(p => p.key === you.key);
    if (!me || me.fallen) return;
    let dq = 0, dr = 0;
    for (const code of heldKeysRef.current) {
      const s = GLIDE_STEPS[code];
      if (s) { dq += s[0]; dr += s[1]; }
    }
    const { u, v } = isoBasis(TILE_SIZE);
    const vx = dq * u[0] + dr * v[0];
    const vy = dq * u[1] + dr * v[1];
    const len = Math.hypot(vx, vy);
    if (len === 0) return;
    const nx = vx / len, ny = vy / len;
    send({ type: "glide", tx: pos.x + nx * 420, ty: pos.y + ny * 420 });
    setSelTender(true);
  };
  const sendGlideStopRef = useRef<(() => void) | null>(null);
  sendGlideStopRef.current = () => { send({ type: "glideStop" }); };
  useEffect(() => {
    const clearGlideTimer = () => {
      if (glideTimerRef.current) { clearInterval(glideTimerRef.current); glideTimerRef.current = null; }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        // An armed cast run is set down first — uncharged,
        // always (Nigel, 2026-10-20: Esc is a standing
        // unload). Then the wheel and controller close.
        if (placingRef.current) { unloadCastRef.current?.(); setRadial(null); setControllerOpen(false); return; }
        setRadial(null); setControllerOpen(false); return;
      }
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      // The belt under the number keys, as the Ground teaches:
      // 1–6 run the locked slots' own acts.
      const digit = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6"].indexOf(e.code);
      if (digit >= 0) { hotbarActRef.current(digit); return; }
      // SPACE LEAPS (Nigel, 2026-10-19) — at the Table the leap
      // is MOTION, honestly: the figure rises on the class's own
      // arc, but the referee's movement law is untouched — no
      // crossing changes hands here, and the jump crosses
      // nothing the glide could not. (The homeland, where his
      // body is his own, carries the true traversal law.)
      if (e.code === "Space") {
        e.preventDefault();
        // Held, not just pressed: the Witch's hover reads the
        // holding of Space (the Ground's spaceDown).
        tableSpaceHeldRef.current = true;
        if (!e.repeat && !glideGuardRef.current.fallen) {
          jumpPress(myJumpRef.current, myClassRef.current ?? "warden", Date.now());
        }
        return;
      }
      const step = GLIDE_STEPS[e.code];
      if (!step) return;
      e.preventDefault();
      if (e.repeat || heldKeysRef.current.has(e.code)) return;
      heldKeysRef.current.add(e.code);
      if (glideGuardRef.current.fallen) return;
      sendGlideRef.current?.();
      if (!glideTimerRef.current) {
        glideTimerRef.current = setInterval(() => { sendGlideRef.current?.(); }, 120);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") { tableSpaceHeldRef.current = false; return; }
      const step = GLIDE_STEPS[e.code];
      if (!step) return;
      e.preventDefault();
      heldKeysRef.current.delete(e.code);
      if (heldKeysRef.current.size === 0) {
        clearGlideTimer();
        sendGlideStopRef.current?.();
      } else {
        sendGlideRef.current?.();
      }
    };
    const onBlur = () => {
      tableSpaceHeldRef.current = false;
      heldKeysRef.current.clear();
      clearGlideTimer();
      sendGlideStopRef.current?.();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      clearGlideTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The stage's manners (Territory's, carried over 2026-10-18):
  // the map pans by drag and zooms by button, in the viewBox's
  // own coordinate space. A tap is a tap only when the pointer
  // barely moved — drags must never read as tile taps.
  const [view, setView] = useState<{ zoom: number; pan: { x: number; y: number } }>({ zoom: 1, pan: { x: 0, y: 0 } });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean; t: number; btn: number } | null>(null);
  // When a right-hand drag was last spent on this stage — its
  // release raises a contextmenu the click law must swallow
  // (the lineJustDrawnRef idiom, for the plainer drag).
  const rightDragAt = useRef(0);
  const suppressTapRef = useRef(false);
  const [diceOpen, setDiceOpen] = useState(false);
  // THE ORDERS WHEEL (Nigel, 2026-10-22 — the marching-
  // orders spec): a chosen Awokin's orders ride ITS wheel,
  // opened on its tap, where the unit bar stood; a
  // drag-chosen company's wheel speaks for the selection.
  // March picked there ARMS the march — the next tile tap,
  // or a right-dragged line, obeys at once. No confirm.
  const [tableOrders, setTableOrders] = useState<{ ids: string[]; x: number; y: number } | null>(null);
  const [marchArmed, setMarchArmed] = useState<string[] | null>(null);
  const [bandSel, setBandSel] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [lineSel, setLineSel] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const bandDragRef = useRef<{ sx: number; sy: number; moved: boolean } | null>(null);
  // The band's live rect, mirrored into a ref beside the
  // state, and the band's completion beside it (the
  // group-orders fix, 2026-10-24, carried to this ground by
  // the both-grounds law): the SAME completion runs from the
  // stage's own pointer-up and from a window-level release
  // listener, so a drag-select whose release lands over the
  // hand tray or another surface outside the stage still
  // raises the company's wheel, exactly as on the homeland.
  const bandSelRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const completeTableBandRef = useRef<(clientX: number, clientY: number) => void>(() => {});
  const lineDragRef = useRef<{ sx: number; sy: number; moved: boolean } | null>(null);
  const lineJustDrawnRef = useRef(0);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [packDraft, setPackDraft] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  /** The beacon button's carried choice fires once per page
   *  load, when this seat first stands (see LAND_INTENT). */
  const landIntentFiredRef = useRef(false);
  const heardRef = useRef<string[]>([]);
  const lastJoinRef = useRef<Record<string, unknown> | null>(null);
  const [bindCode, setBindCode] = useState("");
  const [bindCodeMsg, setBindCodeMsg] = useState("");
  const [bindInput, setBindInput] = useState("");
  const [bindMsg, setBindMsg] = useState("");

  // The binding code (door): minted by the game for the Tender this
  // browser is signed in as — the same session the game itself uses.
  async function fetchBindCode() {
    setBindCodeMsg("");
    try {
      const token = window.localStorage.getItem("awoken-tender-token") ?? "";
      const res = await fetch("/api/getTableBindCode", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tender-Token": token },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The game would not mint a code.");
      setBindCode(String(data.code));
    } catch (e) {
      setBindCodeMsg(e instanceof Error ? e.message : "The game would not mint a code.");
    }
  }

  // THE WEB SEAT (the door build, 2026-10-25): the door's seat
  // for a visitor the game already knows — the join carries the
  // game's own session token, and the server names the Tender
  // from it (never from a name claimed here). The token is read
  // fresh at the tap, the same read the binding panel makes.
  function takeWebSeat() {
    const token = window.localStorage.getItem("awoken-tender-token") ?? "";
    connect({ tenderToken: token, room: "the-table" });
  }

  // Spend a code at the Table (room): this seat's proven Discord
  // token names who is binding; the code names the Tender. On
  // success the seat is re-taken so the real deck is dealt.
  async function submitBind() {
    setBindMsg("");
    const token = String(lastJoinRef.current?.authToken ?? takeTableSession()?.authToken ?? "");
    if (!token) { setBindMsg("This seat was not Discord-proven, so it has nothing to bind with."); return; }
    try {
      const res = await fetch("/api/table/bind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, code: bindInput.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The binding did not take.");
      setBindMsg(`Bound${data.tenderName ? ` to ${data.tenderName}` : ""}. Re-seat to draw your real deck:`);
    } catch (e) {
      setBindMsg(e instanceof Error ? e.message : "The binding did not take.");
    }
  }
  const taleRef = useRef<HTMLDivElement>(null);

  const inDiscord = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("frame_id");

  // The boot names its step, and no step may hang silently: if the
  // Table sits at one step for 20 seconds, the door says which step
  // jammed instead of spinning forever (Nigel's stuck launch,
  // 2026-10-16 — the candle burned with no word of where). The error
  // carries the door record: what this page can see of its own
  // framing, so the Keeper can tell a launch that never entered
  // Discord's frame from a handshake Discord never answered.
  const doorRecord = () => {
    try {
      const q = new URLSearchParams(window.location.search);
      const embedded = window.parent !== window;
      const heard = heardRef.current.length ? heardRef.current.join("  ·  ") : "silence — nothing came back";
      return [
        `Framed by Discord: ${embedded ? "yes" : "NO"}`,
        `Sent by: ${document.referrer || "nothing"}`,
        `Door: ${window.location.host}`,
        `Frame tag: ${q.has("frame_id") ? "present" : "MISSING"}`,
        `Heard back: ${heard}`,
      ].join("\n");
    } catch { return "Door record unavailable."; }
  };
  useEffect(() => {
    if (phase !== "boot" && phase !== "connecting") return;
    const t = setTimeout(() => {
      setError(`The Table got stuck at this step: “${bootStep}”.\n${doorRecord()}`);
      setPhase("error");
    }, 20000);
    return () => clearTimeout(t);
  }, [phase, bootStep]);

  function connect(join: Record<string, unknown>) {
    lastJoinRef.current = join;
    setPhase("connecting");
    setBootStep("Taking your seat…");
    setError("");
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/table/ws`);
    wsRef.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: "join", ...join }));
    ws.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      if (msg.type === "state") {
        setShared(msg.state);
        setYou(msg.you);
        setPhase("seated");
      } else if (msg.type === "joinError") {
        // THE LAND'S DOOR (Twelve #2): a kept land's refusal
        // asks for its word and tries the seat again — the
        // word rides the same join, nothing else changes.
        if (msg.needsPassword) {
          setPwMsg(String(msg.message || "This land is kept by a word."));
          setPhase("password");
        } else {
          setError(String(msg.message || "The Table would not seat you."));
          setPhase("error");
        }
      } else if (msg.type === "error") {
        const m = String(msg.message || "");
        setNotice(m);
        // THE PURSE REFUSES THE CAST, NEVER THE READYING
        // (Nigel, 2026-10-23 23:39, corrected 23:40): a cast
        // refusal that names its price ("…costs ✦…") once
        // ended the run here — the working left the hand
        // because the purse could not pay. That law is
        // struck: poverty refuses that one cast alone; the
        // readied placing stays armed, and a later tap casts
        // again once the purse can pay. The refusal itself
        // shows above, as always — and nothing unloads.
      }
    };
    ws.onclose = () => {
      setPhase((p) => (p === "seated" || p === "connecting" ? "lost" : p));
    };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }

  // Boot: inside Discord, sign in silently and take the seat the SDK
  // names. Outside Discord, show the door.
  useEffect(() => {
    let cancelled = false;
    // The listening ear (2026-10-16): record every word spoken to
    // this frame while the boot knocks, so a stuck door can report
    // whether Discord answered in the new dialect (op tuples), the
    // old one (DISPATCH objects), or not at all. Observe only.
    const OP_NAMES: Record<number, string> = { 0: "HANDSHAKE", 1: "FRAME", 2: "CLOSE", 3: "HELLO (old greeting)" };
    const ear = (ev: MessageEvent) => {
      if (heardRef.current.length >= 8) return;
      const d: any = ev.data;
      let shape: string;
      if (Array.isArray(d)) shape = `op ${OP_NAMES[Number(d[0])] ?? String(d[0])}`;
      else if (d && typeof d === "object" && typeof d.cmd === "string") shape = `old-style ${d.cmd}${d.evt ? "/" + d.evt : ""}`;
      else shape = typeof d;
      heardRef.current.push(`${ev.origin} → ${shape}`);
    };
    window.addEventListener("message", ear);
    (async () => {
      if (!inDiscord) {
        try {
          const cfg = await (await fetch("/api/table/config")).json();
          if (!cancelled) setDevMode(Boolean(cfg.devMode));
        } catch {}
        if (!cancelled) setPhase("door");
        return;
      }
      // THE PREPARED SESSION (light front page, 2026-10-16): when
      // this room was imported by table-main.tsx after Discord had
      // already answered and vouched, there is nothing to knock
      // for — the seat ticket is waiting. Take the seat directly.
      const prepared = takeTableSession();
      if (prepared) {
        connect({ authToken: prepared.authToken, room: prepared.room });
        return;
      }
      try {
        // THE EARLY KNOCK (audit verdict, 2026-10-16): the SDK was
        // already constructed and the knock sent at module scope in
        // table-main.tsx (see tableSdk.ts) — Discord answered the
        // bare Control's identical knock there, while the knock from
        // inside this effect, however early, came after a bundle
        // load and a React mount and heard silence. Consume that
        // boot when it exists; only a framed launch off the proxy
        // host (no app id in the hostname) falls back to building
        // the SDK here, config-fetched, with the same re-aim.
        setBootStep("Knocking on Discord's door…");
        const early = takeTableBoot();
        let sdk: DiscordSDK;
        let clientId: string;
        if (early) {
          sdk = early.sdk;
          clientId = early.clientId;
          await early.ready;
        } else {
          const cfg = await (await fetch("/api/table/config")).json();
          clientId = typeof cfg.discordClientId === "string" ? cfg.discordClientId : "";
          if (!clientId) {
            setError("Discord is not configured on the server yet, so the Table cannot check your name. The Ancient One holds the keys that finish this door.");
            setPhase("error");
            return;
          }
          sdk = new DiscordSDK(clientId);
          try {
            const s = sdk as unknown as { sourceOrigin?: string; handshake?: () => void };
            if (s.sourceOrigin && !/^https:\/\/(ptb\.|canary\.)?discord(app)?\.com/.test(s.sourceOrigin) && typeof s.handshake === "function") {
              s.sourceOrigin = "https://discord.com";
              s.handshake();
            }
          } catch {}
          const readyP = sdk.ready();
          reknockOnHello(sdk, readyP);
          await readyP;
        }
        setBootStep("Asking Discord your name…");
        const { code } = await sdk.commands.authorize({
          client_id: clientId,
          response_type: "code",
          state: "",
          prompt: "none",
          scope: ["identify"],
        });
        setBootStep("Proving your name to the Table…");
        const authRes = await fetch("/api/table/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        if (!authRes.ok) {
          const body = await authRes.json().catch(() => ({}));
          throw new Error(body.error || "Discord refused the sign-in.");
        }
        const auth = await authRes.json();
        setBootStep("Discord is vouching for you…");
        await sdk.commands.authenticate({ access_token: auth.accessToken });
        // The door inside Discord (Phase B): the opener chooses
        // the room's nature — the casual table, or a campaign
        // (as a Tender, or as its Storytender). The instance id
        // names the room either way, so the whole party lands
        // together whichever door they take.
        if (!cancelled) {
          setAuthJoin({ authToken: auth.token, instanceId: sdk.instanceId || "the-table" });
          setPhase("door");
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "The door to the Table would not open.");
          setPhase("error");
        }
      }
    })();
    return () => { cancelled = true; window.removeEventListener("message", ear); try { wsRef.current?.close(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Notes follow the server copy until the Tender starts writing.
  useEffect(() => {
    if (you && !notesDirty) setNotesDraft(you.notes);
  }, [you, notesDirty]);

  // The Tale reads newest-last; keep its foot in view.
  useEffect(() => {
    const el = taleRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shared?.tale.length]);

  // A newly set scene raises the Stage again.
  useEffect(() => {
    if (shared?.campaign?.stage) setStageHidden(false);
  }, [shared?.campaign?.stage?.at]);

  const send = (msg: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  // THE DOOR ASKS WHOSE NAME THIS BROWSER CARRIES (the door
  // build, 2026-10-25): a land-carrying arrival (?land=) is a
  // promise the main page made to a signed-in Tender — so on
  // such an arrival the door reads the game's own session
  // truth: whether this browser is signed in as a Tender, and
  // whether a beacon stands in her name (Push 18's reckoning,
  // read through the same first-seed read the main page's
  // gate reads). The seat itself is proven again by the
  // server at the join; this read only shapes what the door
  // offers. Plain arrivals never ask — their door is
  // unchanged.
  const [webSeat, setWebSeat] = useState<{ signedIn: boolean; hasBeacon: boolean } | null>(null);
  useEffect(() => {
    if (!LAND_INTENT) return;
    let cancelled = false;
    (async () => {
      const token = window.localStorage.getItem("awoken-tender-token") ?? "";
      if (!token) { if (!cancelled) setWebSeat({ signedIn: false, hasBeacon: false }); return; }
      try {
        const res = await fetch("/api/getFirstSeedEvent", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Tender-Token": token },
          body: JSON.stringify({}),
        });
        const data = await res.json().catch(() => ({}));
        const beacon = !!(data?.hasBeacon ?? data?.data?.hasBeacon);
        if (!cancelled) setWebSeat(res.ok ? { signedIn: true, hasBeacon: beacon } : { signedIn: false, hasBeacon: false });
      } catch { if (!cancelled) setWebSeat({ signedIn: false, hasBeacon: false }); }
    })();
    return () => { cancelled = true; };
  }, []);

  // THE CARRIED CHOICE, SPOKEN (the homeland port): once this
  // seat stands in a casual room, a choice carried from the
  // main page's beacon button is spoken to the server as the
  // beaconOpen act it names — the homeland, or a fresh hunt.
  // The server adjudicates (a bound Tender, a quiet room, a
  // homeland that stands whole) and answers in its own words
  // where it cannot: the error strip carries the refusal.
  // Fires once; campaign rooms never hear it (their ground
  // is the campaign's, and the server refuses lands there).
  useEffect(() => {
    if (!LAND_INTENT || landIntentFiredRef.current) return;
    if (!shared || !you || shared.campaign) return;
    landIntentFiredRef.current = true;
    if (LAND_INTENT === "homeland") send({ type: "beaconOpen", source: "homeland" });
    else if (LAND_INTENT === "new") send({ type: "beaconOpen", source: "tableland", fresh: true });
  }, [shared, you]);

  // The release is the completion, wherever it lands: the
  // stage's own pointer-up consumes the band first when the
  // hand lifts over the stage (it clears bandDragRef); this
  // listener runs the SAME completion when the lift lands on
  // a surface outside the stage — the hand tray, a panel —
  // and a browser-cancelled drag just sets the band down.
  // IT STANDS ABOVE THE PHASE RETURNS BELOW, ALWAYS (the fall
  // of 2026-10-25, React error #310): this effect once lived
  // further down the body, past the early returns for the
  // boot/door phases — so the mount renders never called it,
  // and the first render that fell through to the standing
  // room called one hook more than every render before it.
  // React tore the room down for that, every seat, every
  // room. A hook must never live below those returns.
  useEffect(() => {
    const up = (e: PointerEvent) => {
      if (bandDragRef.current?.moved) {
        bandDragRef.current = null;
        setBandSel(null);
        completeTableBandRef.current(e.clientX, e.clientY);
      }
    };
    const cancel = () => {
      if (bandDragRef.current) { bandDragRef.current = null; bandSelRef.current = null; setBandSel(null); }
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => { window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); };
  }, []);

  if (phase === "boot" || phase === "connecting") {
    return (
      <div className="table-door-wrap">
        <div className="table-door">
          <h1>🕯️ The Table</h1>
          <p className="quiet">The Table is being set…</p>
          <p className="quiet" style={{ fontSize: 12, opacity: 0.75 }}>{bootStep}</p>
        </div>
      </div>
    );
  }

  if (phase === "password") {
    return (
      <div className="table-door-wrap">
        <div className="table-door">
          <h1>🕯️ The Table</h1>
          <p>{pwMsg}</p>
          <label className="door-label" htmlFor="land-word">The table's word</label>
          <input
            id="land-word"
            className="door-input"
            type="password"
            value={pwInput}
            onChange={(e) => setPwInput(e.target.value)}
            maxLength={64}
            autoComplete="off"
            placeholder="The word the host keeps this land by"
            onKeyDown={(e) => {
              if (e.key === "Enter" && lastJoinRef.current) connect({ ...lastJoinRef.current, tablePassword: pwInput });
            }}
          />
          <button
            className="table-btn"
            onClick={() => lastJoinRef.current && connect({ ...lastJoinRef.current, tablePassword: pwInput })}
          >
            Speak the word and take your seat
          </button>
          <button className="table-btn ghost" onClick={() => window.location.reload()}>Back to the door</button>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="table-door-wrap">
        <div className="table-door">
          <h1>🕯️ The Table</h1>
          <p className="error-line" style={{ whiteSpace: "pre-wrap", textAlign: "left" }}>{error}</p>
          <button className="table-btn" onClick={() => window.location.reload()}>Try the door again</button>
        </div>
      </div>
    );
  }

  if (phase === "lost") {
    return (
      <div className="table-door-wrap">
        <div className="table-door">
          <h1>🕯️ The Table</h1>
          <p className="quiet">The connection to the Table was lost — the room keeps your seat warm only a moment.</p>
          <button className="table-btn" onClick={() => lastJoinRef.current && connect(lastJoinRef.current)}>Rejoin the Table</button>
        </div>
      </div>
    );
  }

  if (phase === "door" || !shared) {
    return (
      <div className="table-door-wrap">
        <div className="table-door">
          <p className="door-back"><a href="/">← Back to the Awokin</a></p>
          <h1>🕯️ The Table</h1>
          <p>
            A table for Tenders, played together. Awokin never fight each other here —
            every battle is the party against the Unbinding.
          </p>
          {devMode ? (
            <>
              <p className="quiet">
                The doorway test: Discord sign-in is not configured on this server yet,
                so a name spoken here seats you. Once Discord is configured, only a
                proven Discord name can sit.
              </p>
              <label className="door-label" htmlFor="door-name">Your name at the Table</label>
              <input
                id="door-name"
                className="door-input"
                value={devName}
                onChange={(e) => setDevName(e.target.value)}
                maxLength={40}
                placeholder="e.g. Tender of the quiet moss"
              />
              <div className="door-actions">
                <button
                  className="table-btn primary"
                  disabled={!devName.trim()}
                  onClick={() => connect({ devName: devName.trim(), room: "the-table" })}
                >
                  Take your seat
                </button>
                <button className="table-btn" onClick={() => connect({ watch: true, name: devName.trim() || "A Watcher", room: "the-table" })}>
                  Watch instead
                </button>
              </div>
              <label className="door-label" htmlFor="door-campaign">Or open a campaign — a Storytender deals, one bank binds the party</label>
              <input
                id="door-campaign"
                className="door-input"
                value={campKey}
                onChange={(e) => setCampKey(e.target.value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24))}
                maxLength={24}
                placeholder="Campaign key (blank = the main campaign)"
              />
              <div className="door-actions">
                <button
                  className="table-btn"
                  disabled={!devName.trim()}
                  onClick={() => connect({ devName: devName.trim(), room: `campaign-${campKey.trim() || "main"}` })}
                >
                  📖 Campaign — take a seat
                </button>
              </div>
            </>
          ) : authJoin ? (
            <>
              <p className="quiet">
                Discord has vouched for your name. Choose the room's nature — the whole
                party lands together whichever door they take.
              </p>
              <div className="door-actions">
                <button className="table-btn primary" onClick={() => connect({ authToken: authJoin.authToken, room: authJoin.instanceId })}>
                  ⚔ The casual table
                </button>
                <button className="table-btn" onClick={() => connect({ watch: true, name: "A Watcher", room: authJoin.instanceId })}>
                  Watch instead
                </button>
              </div>
              <div className="door-actions">
                <button className="table-btn" onClick={() => connect({ authToken: authJoin.authToken, room: `campaign-${authJoin.instanceId}` })}>
                  📖 Campaign — take a seat
                </button>
              </div>
            </>
          ) : (
            <>
              {LAND_INTENT === "homeland" && (
                webSeat === null ? (
                  <p className="quiet">The door is asking the game whose name you carry…</p>
                ) : !webSeat.signedIn ? (
                  <p className="quiet">
                    You came carrying your homeland's name. Sign in as your Tender in the
                    game first, and this door will seat you at the Table standing on your land.
                  </p>
                ) : webSeat.hasBeacon ? (
                  <>
                    <p>
                      You came carrying your homeland's name, and your beacon stands. Take
                      your seat, and this Table will stand on your own land — friends who
                      sit with you fight its curse beside you.
                    </p>
                    <div className="door-actions">
                      <button className="table-btn primary" onClick={() => takeWebSeat()}>
                        🏠 Take your seat — the Table stands on your homeland
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p><strong>🌠 A starseed, not yet a beacon</strong></p>
                    <p>You must light the beacon first! Wake the Awokin, go to the cursed lands!</p>
                    <p className="quiet">
                      When your beacon stands, this door will seat you at the Table on your
                      land. Until then, the seat on your land cannot be taken — you may watch.
                    </p>
                  </>
                )
              )}
              {LAND_INTENT === "new" && (
                webSeat === null ? (
                  <p className="quiet">The door is asking the game whose name you carry…</p>
                ) : !webSeat.signedIn ? (
                  <p className="quiet">
                    You came to hunt a new starseed. Sign in as your Tender in the game
                    first, and this door will seat you at a fresh-land Table.
                  </p>
                ) : (
                  <>
                    <p>
                      You came to hunt a new starseed. Take your seat, and a fresh land
                      will be dealt at this Table for the hunt.
                    </p>
                    <div className="door-actions">
                      <button className="table-btn primary" onClick={() => takeWebSeat()}>
                        🌠 Take your seat — a fresh land for the hunt
                      </button>
                    </div>
                  </>
                )
              )}
              <p className="quiet">
                Open the Table from the voice channel in Discord to be named and take a seat.
                From a plain browser you may still watch the room.
              </p>
              <button className="table-btn" onClick={() => connect({ watch: true, name: "A Watcher", room: "the-table" })}>
                Watch the Table
              </button>
            </>
          )}
          <div className="bind-code-panel">
            <h4>🎲 Your Table binding code</h4>
            <p className="quiet">
              Signed in here as your Tender? Take a one-time code, then spend it at the
              Table in Discord (the bind strip in your satchel, under Awokin) — your Discord name is
              tied to this Tender, and the Table seats your real Tender from then on.
            </p>
            {bindCode ? (
              <p className="bind-code-shown">Your code: <strong>{bindCode}</strong> — this code ties your Discord name to this Tender. Spend it in the bind strip in your satchel at the Table in Discord, and from then on the Table seats your real Tender, with your real deck. It fades in fifteen minutes and works once.</p>
            ) : (
              <button className="table-btn" onClick={() => void fetchBindCode()}>Show my binding code</button>
            )}
            {bindCodeMsg && <p className="quiet small">{bindCodeMsg}</p>}
          </div>
        </div>
      </div>
    );
  }

  const sky = shared.sky;
  // CAMPAIGN: the star-seed swells with the bank — the bulb is
  // the pool's body, read at a glance (TABLE-DESIGN §4.5).
  const bankFrac = shared.campaign?.seeded && shared.campaign.bankStart > 0
    ? Math.max(0.05, Math.min(1.5, shared.campaign.bank / shared.campaign.bankStart))
    : null;
  const bulbR = bankFrac === null ? 6 : 3 + 4.5 * bankFrac;
  // CAMPAIGN: a dissipated Awokin's recast price doubles per
  // dissipation — the card chips show the bank's true price.
  const castCostOf = (card: TableCard): number => {
    const n = shared.mode === "campaign" && you?.recasts ? (you.recasts[card.id] ?? 0) : 0;
    return Math.max(1, card.power) * (n > 0 ? 2 ** Math.min(n, 5) : 1);
  };

  // THE SUMMON CAST (Nigel, 2026-10-22): the pick is the
  // cast — no hex is named; the referee lands the Awokin at
  // the Tender's side. A roster member is called by its
  // ledger id; a stand-in by its card id.
  const castSummonCard = (card: TableCard) => {
    if (typeof card.awokenId === "number") send({ type: "summonCast", awakenedId: card.awokenId });
    else send({ type: "summonCast", cardId: card.id });
  };

  // ── THE INSTANCE MAP, derived (2026-10-18) ─────────────────
  // Everything on the stage is read off the server's tiles and
  // the clock — the client keeps no second map.
  const tiles = shared.map ?? [];
  const tileById = new Map(tiles.map(t => [t.id, t]));
  const tileCenter = (t: MapTileView): { cx: number; cy: number } => tilePos(t.q, t.r, t.cursed);
  const centerOf = (id: string): { cx: number; cy: number } | null => {
    const t = tileById.get(id);
    return t ? tileCenter(t) : null;
  };
  const sortedTiles = [...tiles].sort((a, b) => tileCenter(a).cy - tileCenter(b).cy);
  // THE CURSE PRESSES (Nigel, 2026-10-21): while MY figure
  // stands on cursed ground, every cast I make at this Table
  // takes −3 — the summon cast and the Grimoire workings
  // alike. The previews say so before the tap, in plain
  // words, wherever a cast's shape is shown (the wheel's
  // entries, the placing bar, the readied-summon bar).
  const mySharedPlayer = you ? shared.players.find(p => p.key === you.key) ?? null : null;
  const myCursed = !!(mySharedPlayer?.hex && tileById.get(mySharedPlayer.hex)?.cursed);
  const curseNote = "−3 — the curse presses";
  const myUnitOn = (tileId: string): boolean => !!you && shared.field.some(u => u.hex === tileId && u.ownerKey === you.key);
  const isMovingNow = (u: FieldUnitView): boolean => u.moving;
  // SMOOTHING: lerp a drawn position toward the server's
  // continuous position; snap when far (a fresh figure, or a
  // teleport across the stage).
  const smoothedPos = (key: string, pos: { x: number; y: number }): { x: number; y: number } => {
    const prev = smoothedPosRef.current.get(key);
    if (!prev || Math.hypot(pos.x - prev.x, pos.y - prev.y) > 240) {
      const snapped = { x: pos.x, y: pos.y };
      smoothedPosRef.current.set(key, snapped);
      return snapped;
    }
    const next = { x: prev.x + (pos.x - prev.x) * 0.5, y: prev.y + (pos.y - prev.y) * 0.5 };
    smoothedPosRef.current.set(key, next);
    return next;
  };

  // The stage's frame, computed from the map's own extents:
  // the tiles' base centers (lift aside, so the frame never
  // breathes as tiles purify) grown by the tile art's true
  // reach on every side, plus a small margin. Whatever
  // radius the server deals, this frame is the one the
  // stage's cover fit (the svg's "slice", Nigel 2026-10-25)
  // scales to the whole window at zoom 1 — the flower's far
  // edges may run past the frame at extreme aspects, and
  // the zoom and pan frame it by hand from there.
  const stageBox = (() => {
    if (!tiles.length) return { x: -100, y: -100, w: 200, h: 200, cx: 0, cy: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of tiles) {
      const { px, py } = isoOffset(t.q, t.r, TILE_SIZE);
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    // The pad is the ART's true reach around a tile centre, not
    // the face's: the slabs' skirts hang ~750 source px below the
    // face centre, the cursed wisps rise ~790 above it, and
    // neutral's off-template slab reaches ~1000 to the left — a
    // face-sized frame would clip the rim tiles' ink.
    const x0 = minX - 1000 * TILE_K - 14, x1 = maxX + 900 * TILE_K + 14;
    const y0 = minY - 795 * TILE_K - 14, y1 = maxY + 755 * TILE_K + 14;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  })();

  // Pan and zoom, in the viewBox's coordinate space. Zooming
  // holds the stage's center still; dragging past a few
  // pixels is a pan, never a tap (suppressTapRef stands
  // guard until just after the click it would have fed).
  const zoomBy = (f: number) => {
    setView(v => {
      const zoom = Math.max(0.7, Math.min(2.2, v.zoom * f));
      const k = zoom / v.zoom;
      return { zoom, pan: { x: stageBox.cx - (stageBox.cx - v.pan.x) * k, y: stageBox.cy - (stageBox.cy - v.pan.y) * k } };
    });
  };
  const fireTableLine = (ids: string[], a: { x: number; y: number }, b: { x: number; y: number }) => {
    if (!you) return;
    const units = ids
      .map(id => shared.field.find(u => u.cardId === id && u.ownerKey === you.key))
      .filter((u): u is FieldUnitView => !!u && !u.moving);
    if (!units.length) return;
    const n = units.length;
    const load = new Map<string, number>();
    for (const u of shared.field) load.set(u.hex, (load.get(u.hex) ?? 0) + 1);
    for (const u of units) load.set(u.hex, (load.get(u.hex) ?? 1) - 1);
    units.forEach((u, i) => {
      const pt = n === 1
        ? { x: b.x, y: b.y } // a lone Awokin takes the line's FAR end (Nigel, 2026-10-23)
        : { x: a.x + (b.x - a.x) * (i / (n - 1)), y: a.y + (b.y - a.y) * (i / (n - 1)) };
      const cands = tiles
        .filter(t => !t.cursed)
        .map(t => { const c = tileCenter(t); return { t, d: Math.hypot(c.cx - pt.x, c.cy - pt.y) }; })
        .sort((x, y) => x.d - y.d);
      for (const { t } of cands) {
        if ((load.get(t.id) ?? 0) >= 4) continue;
        load.set(t.id, (load.get(t.id) ?? 0) + 1);
        if (t.id !== u.hex) send({ type: "march", cardId: u.cardId, from: u.hex, to: t.id });
        break;
      }
    });
  };

  const onStageDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    // THE LINE (Nigel, 2026-10-22 — the marching-orders
    // spec): with a March order armed, a right-drag draws
    // the line the selection stands along — it does not pan.
    if (e.button === 2 && marchArmed && marchArmed.length) {
      const pt = stagePointOf(e.clientX, e.clientY);
      if (pt) {
        lineDragRef.current = { sx: pt.x, sy: pt.y, moved: false };
        setLineSel({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y });
        dragRef.current = null;
        return;
      }
    }
    // DRAG-SELECT (the proof page's gesture, gated so the
    // Table's pan keeps its ground): a left-drag that BEGINS
    // on one of my own standing Awokin draws the choosing
    // band; a drag from empty ground pans, as ever.
    if (e.button === 0 && you && !placing) {
      const pt = stagePointOf(e.clientX, e.clientY);
      if (pt) {
        const t = tiles.find(tt => { const c = tileCenter(tt); return Math.hypot(c.cx - pt.x, c.cy - pt.y) < TILE_SIZE * 0.9; });
        if (t && shared.field.some(u => u.hex === t.id && u.ownerKey === you.key)) {
          bandDragRef.current = { sx: pt.x, sy: pt.y, moved: false };
          bandSelRef.current = { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y };
          setBandSel(bandSelRef.current);
          dragRef.current = null;
          return;
        }
      }
    }
    // THE CLICK LAW (Nigel, 2026-10-23 — one map on every
    // ground): on a mouse, only the MIDDLE hand drags the
    // screen. The left hand from empty ground only clicks;
    // the right hand's press is measured, never panned, so
    // its release can tell a click from a spent drag. A
    // finger keeps this ground's own ways (a drag pans; a
    // long, still press opens the wheel).
    if (e.pointerType === "mouse" && e.button === 0) return;
    if (e.button === 1) e.preventDefault(); // the middle press must not wake the browser's autoscroll
    dragRef.current = { x: e.clientX, y: e.clientY, panX: view.pan.x, panY: view.pan.y, moved: false, t: Date.now(), btn: e.button };
    // No pointer capture yet (2026-10-19): capturing at the
    // press retargets the release — and with it the click —
    // to the stage itself, so the wheel's nodes, the figures
    // and the tiles never hear their own clicks in browsers
    // that honor the capture for mouse events. Capture is
    // taken in the move, once a drag is truly a drag.
  };
  const onStageMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (lineDragRef.current) {
      const pt = stagePointOf(e.clientX, e.clientY);
      if (pt) {
        if (Math.hypot(pt.x - lineDragRef.current.sx, pt.y - lineDragRef.current.sy) > 4) lineDragRef.current.moved = true;
        setLineSel(l => l ? { ...l, x1: pt.x, y1: pt.y } : l);
      }
      return;
    }
    if (bandDragRef.current) {
      const pt = stagePointOf(e.clientX, e.clientY);
      if (pt) {
        if (Math.hypot(pt.x - bandDragRef.current.sx, pt.y - bandDragRef.current.sy) > 4) {
          bandDragRef.current.moved = true;
          suppressTapRef.current = true;
        }
        bandSelRef.current = bandSelRef.current ? { ...bandSelRef.current, x1: pt.x, y1: pt.y } : null;
        setBandSel(bandSelRef.current);
      }
      return;
    }
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    if (d.btn === 2) {
      // The right hand is measured, never dragged (the click
      // law): past the measure the press is spent — no pan,
      // and its release will open nothing.
      d.moved = true;
      suppressTapRef.current = true;
      return;
    }
    if (!d.moved) {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture is a courtesy */ }
    }
    d.moved = true;
    suppressTapRef.current = true;
    const rect = svgRef.current?.getBoundingClientRect();
    const f = rect && rect.width > 0 ? 1 / Math.max(rect.width / stageBox.w, rect.height / stageBox.h) : 1;
    setView(v => ({ ...v, pan: { x: d.panX + dx * f, y: d.panY + dy * f } }));
  };
  /** The band's completion (the group-orders fix, 2026-10-24):
   *  the units inside the band are chosen — one caught opens
   *  ITS wheel; a company opens the company's wheel (March ·
   *  Follow). One completion, run by the stage's pointer-up
   *  and by the window-level release listener below, so the
   *  choosing completes wherever the hand lifts. */
  const completeTableBand = (clientX: number, clientY: number) => {
    const bs = bandSelRef.current;
    bandSelRef.current = null;
    if (!bs || !you) return;
    const x0 = Math.min(bs.x0, bs.x1), x1 = Math.max(bs.x0, bs.x1);
    const y0 = Math.min(bs.y0, bs.y1), y1 = Math.max(bs.y0, bs.y1);
    const chosen = shared.field.filter(u => {
      if (u.ownerKey !== you.key || u.moving) return false;
      const t = tileById.get(u.hex);
      if (!t) return false;
      const c = tileCenter(t);
      return c.cx >= x0 && c.cx <= x1 && c.cy >= y0 && c.cy <= y1;
    });
    if (chosen.length === 1) {
      setSelUnitId(chosen[0].cardId);
      setTableOrders({ ids: [chosen[0].cardId], x: clientX, y: clientY });
    } else if (chosen.length > 1) {
      setSelUnitId(null);
      setTableOrders({ ids: chosen.map(u => u.cardId), x: clientX, y: clientY });
    }
    setTimeout(() => { suppressTapRef.current = false; }, 80);
  };
  completeTableBandRef.current = completeTableBand;

  const onStageUp = (e?: ReactPointerEvent<SVGSVGElement>) => {
    // Release the drag's pointer capture (taken in the move
    // handler once a drag proved itself) so no held capture
    // can carry into the next press.
    if (e) { try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ } }
    // A drawn line with a March order armed IS the order:
    // the selection spreads EVENLY along it, at once.
    if (lineDragRef.current) {
      const ld = lineDragRef.current;
      lineDragRef.current = null;
      const ls = lineSel;
      setLineSel(null);
      if (ld.moved && ls && marchArmed && marchArmed.length) {
        fireTableLine(marchArmed, { x: ls.x0, y: ls.y0 }, { x: ls.x1, y: ls.y1 });
        setMarchArmed(null);
        setSelUnitId(null);
        lineJustDrawnRef.current = Date.now();
      }
      return;
    }
    // The band's release chooses: one caught opens ITS
    // wheel; a company opens the company's wheel.
    if (bandDragRef.current) {
      const bd = bandDragRef.current;
      bandDragRef.current = null;
      setBandSel(null);
      if (bd.moved && e) completeTableBand(e.clientX, e.clientY);
      else bandSelRef.current = null;
      return;
    }
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.btn === 2 && d.moved) rightDragAt.current = Date.now();
    if (d?.moved) setTimeout(() => { suppressTapRef.current = false; }, 80);
    // A long, still press (the iPad's right-click) opens the
    // glyph wheel where the finger rests. The right hand
    // never comes through this door — its wheel rides the
    // contextmenu, under the click law.
    if (e && e.type === "pointerup" && d && d.btn !== 2 && !d.moved && Date.now() - d.t >= 500) {
      const pt = stagePointOf(e.clientX, e.clientY);
      if (pt && you && shared.players.some(p => p.key === you.key && p.hex)) {
        suppressTapRef.current = true;
        setTimeout(() => { suppressTapRef.current = false; }, 120);
        setWheelTab(t => (t === "weapon" ? "ability" : t));
        setRadial(pt);
      }
    }
  };
  /** A screen point in the stage's own (panned, zoomed)
   *  coordinates — where the glyph wheel blooms. */
  const stagePointOf = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    // THE COVER (Nigel, 2026-10-25): the stage fills the
    // window — the frame is scaled by the LARGER of the two
    // axis fits and centred, so a screen point unprojects
    // through that same cover scale and centring (the
    // centring offsets go negative on the axis the board
    // overflows, which is the cover working as ruled).
    const k = Math.max(rect.width / stageBox.w, rect.height / stageBox.h);
    const vx = stageBox.x + ((clientX - rect.left) - (rect.width - stageBox.w * k) / 2) / k;
    const vy = stageBox.y + ((clientY - rect.top) - (rect.height - stageBox.h * k) / 2) / k;
    return { x: (vx - view.pan.x) / view.zoom, y: (vy - view.pan.y) / view.zoom };
  };
  const openRadialAt = (clientX: number, clientY: number) => {
    if (!you) return;
    if (!shared.players.some(p => p.key === you.key && p.hex)) return;
    const pt = stagePointOf(clientX, clientY);
    if (pt) { setWheelTab(t => (t === "weapon" ? "ability" : t)); setRadial(pt); }
  };

  /** The wheel's bloom point in screen pixels — the Ground's
   *  wheel is a screen-fixed overlay, so the stage point the
   *  radial state keeps is projected back out for its DOM. */
  const stageToClient = (pt: { x: number; y: number }): { x: number; y: number } | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    const vx = pt.x * view.zoom + view.pan.x;
    const vy = pt.y * view.zoom + view.pan.y;
    const k = Math.max(rect.width / stageBox.w, rect.height / stageBox.h);
    return {
      x: rect.left + (rect.width - stageBox.w * k) / 2 + (vx - stageBox.x) * k,
      y: rect.top + (rect.height - stageBox.h * k) / 2 + (vy - stageBox.y) * k,
    };
  };

  // The selected Awoken and its march price (the land's rate:
  // 1 + ⌊(power−1)/3⌋ per hex crossed).
  const selUnit = selUnitId && you ? shared.field.find(u => u.cardId === selUnitId && u.ownerKey === you.key) ?? null : null;
  const selUnitMoving = !!selUnit && isMovingNow(selUnit);
  const marchRateOf = (u: FieldUnitView): number => 1 + Math.floor((Math.max(1, u.power) - 1) / 3);
  // The curse within the chosen one's lawful reach — the two
  // tiles its strikes carry (the referee's own reach). The
  // unit bar offers the curse-strike only when such ground
  // stands in reach; armed, its taps are blows, not marches.
  const selTile = selUnit ? tileById.get(selUnit.hex) ?? null : null;
  // MY OWN GROUND (the Fix Pass, 2026-10-20): the tile I stand
  // on — the Attune act's mark, offered in my bar when the
  // light holds it purified.
  const meStanding = you ? shared.players.find(p => p.key === you.key) ?? null : null;
  const myStandingTile = meStanding?.hex ? tileById.get(meStanding.hex) ?? null : null;
  const strikeReachOf = (u: FieldUnitView): number => STRIKE_REACH[u.element ?? ""] ?? 2;
  const curseInReach = selUnit && selTile ? shared.map.filter(t => t.cursed && axialDist(selTile, t) <= strikeReachOf(selUnit)) : [];
  const strikeArmed = strikeArm && !!selUnit && !selUnitMoving;

  // ── THE ORDERS WHEELS' ENTRIES (Nigel, 2026-10-22 — the
  // marching-orders spec): one Awokin's wheel carries the
  // Table's own orders — March (armed here, obeyed by the
  // next tile tap or a right-dragged line), Strike the
  // curse while cursed ground stands in its reach, Heal,
  // Follow as an ORDER (the pick sets it following; it
  // never toggles off from here), its party door, Recall.
  // The company's wheel carries March · Follow — the
  // Table's field holds no stance verbs; Attack/Defend
  // ride the homeland's stance law alone.
  const buildTableOrdersEntries = (ids: string[]): WheelEntry[] => {
    if (!you) return [];
    const units = ids
      .map(id => shared.field.find(u => u.cardId === id && u.ownerKey === you.key))
      .filter((u): u is FieldUnitView => !!u);
    if (!units.length) return [];
    if (units.length > 1) {
      return [
        { key: "ord-march", sigil: "manifest", label: "March", act: () => { setMarchArmed(units.map(u => u.cardId)); setNotice("March — tap the ground the company should muster on, or right-drag a line for them to stand along."); } },
        { key: "ord-follow", sigil: "awo", label: "Follow", act: () => { for (const u of units) send({ type: "setFollow", cardId: u.cardId, follow: true }); } },
      ] as WheelEntry[];
    }
    const u = units[0];
    const entries: WheelEntry[] = [];
    if (isMovingNow(u)) {
      entries.push({ key: "ord-moving", sigil: "manifest", label: "On the move", locked: true } as WheelEntry);
    } else {
      entries.push({ key: "ord-march", sigil: "manifest", label: "March", act: () => { setMarchArmed([u.cardId]); setSelUnitId(u.cardId); setNotice(`March — tap the ground ${u.name} should march to, or right-drag a line for it to stand on.`); } } as WheelEntry);
      // THE ORDERS (the battle port — Twelve #1): her
      // standing order, lit where it stands — Attack (strike
      // the dark in reach), Defend (strike, and raise her
      // bramble or rockwall when the dark comes near), Bind
      // (mend the most-wounded of your company in reach
      // instead of striking).
      const stanceNow = u.stance ?? "attack";
      entries.push({ key: "ord-attack", sigil: "sword", label: "Attack", lit: stanceNow === "attack", act: () => { send({ type: "setStance", cardId: u.cardId, stance: "attack" }); } } as WheelEntry);
      entries.push({ key: "ord-defend", emoji: "🛡", label: "Defend", lit: stanceNow === "defense", act: () => { send({ type: "setStance", cardId: u.cardId, stance: "defense" }); } } as WheelEntry);
      entries.push({ key: "ord-bind", sigil: "heal", label: "Bind", lit: stanceNow === "binding", act: () => { send({ type: "setStance", cardId: u.cardId, stance: "binding" }); } } as WheelEntry);
      const ut = tileById.get(u.hex);
      const reach = ut ? shared.map.filter(t => t.cursed && axialDist(ut, t) <= strikeReachOf(u)) : [];
      if (reach.length) entries.push({ key: "ord-strike", sigil: "sword", label: strikeArmed ? "Stay the hand" : "Strike the curse", lit: strikeArmed, act: () => { setStrikeArm(!strikeArmed); } } as WheelEntry);
      entries.push({ key: "ord-heal", sigil: "heal", label: `Heal · ✦${healDef?.cost ?? 2}`, act: () => { send({ type: "castHeal", hex: u.hex }); beginCast(u.hex); } } as WheelEntry);
    }
    entries.push({ key: "ord-follow", sigil: "awo", label: "Follow", summoned: !!u.follow, act: () => { send({ type: "setFollow", cardId: u.cardId, follow: true }); } } as WheelEntry);
    if (you.bound && u.awokenId != null && !(you.party ?? []).includes(u.awokenId)) {
      entries.push({ key: "ord-join", sigil: "ability", label: "Add to party", act: () => { send({ type: "addToParty", cardId: u.cardId }); } } as WheelEntry);
    }
    entries.push({ key: "ord-recall", emoji: "↩", label: "Recall", act: () => { send({ type: "recall", hex: u.hex, cardId: u.cardId }); setSelUnitId(null); } } as WheelEntry);
    return entries;
  };

  // Which tiles the Written Light's placing flows may touch —
  // the same law the old hex field enforced, in axial terms.
  const tilePickable = (t: MapTileView): boolean => {
    if (!placing || !you) return false;
    if (placing.kind === "attune") {
      // The attune reach, drawn where the referee measures
      // it: the standing hex and its ring, plus the skill's
      // bonus — the storyteller's reach is the whole field.
      if (you.storytender) return true;
      const meHex = shared.players.find(p => p.key === you.key)?.hex;
      const meTile = meHex ? tileById.get(meHex) : null;
      if (!meTile) return false;
      return axialDist(meTile, t) <= 1 + (you.attuneReach ?? 0);
    }
    if (placing.kind === "heal") return myUnitOn(t.id);
    if (placing.kind === "rune") {
      // NO ONE-PER-HEX (Nigel, 2026-10-26): a hex already
      // holding a rune stays tappable for another — the
      // one-writing greying that stood here is struck, for
      // the new workings and the writings alike. The
      // referee judges the cast (range alone gates it).
      return true;
    }
    if (!wardAnchor) return true; // WARDS STAND ANYWHERE (2026-10-20): any hex may anchor a ward.
    const anchor = tileById.get(wardAnchor);
    return !!anchor && axialDist(anchor, t) === 1;
  };

  // A tap on the land itself. The placing flows drink first;
  // then a chosen card is cast; then a chosen Awoken marches;
  // then the tap chooses (or cycles) my Awoken standing there.
  const onTileTap = (t: MapTileView, pt?: { x: number; y: number } | null) => {
    if (!you) return;
    if (suppressTapRef.current) return; // the tail of a pan-drag, not a tap
    // NO HEX-LOCK (Nigel, 2026-10-23 23:04; built
    // 2026-10-24): the tap's own POINT rides the cast —
    // the working is written where the player pointed,
    // and range from where they stand is the only gate.
    // A tap with no point to give (a programmatic tap)
    // falls back to the tapped tile's heart.
    if (placing) {
      if (placing.kind === "attune") {
        // The tap lays one point of the readied element on
        // the tapped ground — and the attuning stays in the
        // hand: tap on until it is set down, the pool runs
        // dry, or the ground refuses (the referee answers in
        // plain words, in the room's notices).
        send({ type: "attuneTile", hex: t.id, element: placing.root });
        return;
      }
      if (placing.kind === "heal") {
        // The tap casts — and the placing stays armed: mend
        // another standing, or set the light down to stop.
        if (myUnitOn(t.id)) { send({ type: "castHeal", hex: t.id, ...(pt ? { point: pt } : {}) }); beginCast(t.id); }
        return;
      }
      if (placing.kind === "rune") {
        const eng = defs[placing.root]?.engine;
        if (eng === "blades" || eng === "shardrain") {
          const maxT = eng === "shardrain" ? (defs[placing.root]?.numbers.maxHexes ?? 3) : (defs[placing.root]?.numbers.maxTargets ?? 3);
          setBladePicks(prev => prev.includes(t.id) ? prev.filter(x => x !== t.id) : prev.length >= maxT ? prev : [...prev, t.id]);
          return;
        }
        if (eng === "bats" || eng === "holdrune" || eng === "shatter") {
          // The new workings ride this same door; Shatter's
          // held stream is measured by the press itself.
          const heldMs = eng === "shatter" && castPressAtRef.current ? Math.max(0, Date.now() - castPressAtRef.current) : undefined;
          send({ type: "castRune", root: placing.root, hexes: [t.id], ...(pt ? { points: [pt] } : {}), ...(heldMs ? { heldMs } : {}) });
          beginCast(t.id);
          return;
        }
        // NO ONE-PER-HEX (Nigel, 2026-10-26): the tap casts
        // onto the hex whether or not a rune already stands
        // there — the silent swallow that stood here (a tap
        // on written ground simply did nothing) is struck.
        send({ type: "castRune", root: placing.root, hexes: [t.id], ...(pt ? { points: [pt] } : {}) });
        beginCast(t.id);
        return;
      }
      // THE BLACK GATE (2026-10-24): one tap, no anchor —
      // the Gate stands where the player points, a
      // hex-length from where they stand in the direction
      // of the point. The placing stays armed, as every
      // cast here does.
      if (defs[placing.root]?.engine === "blackgate") {
        const c = centerOf(t.id);
        send({ type: "castWard", root: placing.root, point: pt ?? (c ? { x: c.cx, y: c.cy } : null) });
        beginCast(t.id);
        return;
      }
      // ward: an anchor hex — ANY hex now (Nigel, 2026-10-20:
      // wards stand anywhere) — then a neighbour, for its edge.
      // The cast fires on the neighbour tap; the anchor alone
      // clears for the next edge, the placing stays armed.
      // The two tapped POINTS ride the cast (2026-10-24):
      // the edge is read from the ground the player
      // actually touched, and range alone gates it.
      if (!wardAnchor) { setWardAnchor(t.id); setWardAnchorPt(pt ?? null); return; }
      const anchor = tileById.get(wardAnchor);
      if (anchor && axialDist(anchor, t) === 1) {
        const cB = centerOf(t.id);
        send({ type: "castWard", root: placing.root, hexA: wardAnchor, hexB: t.id, pointA: wardAnchorPt, pointB: pt ?? (cB ? { x: cB.cx, y: cB.cy } : null) });
        beginCast(t.id);
        setWardAnchor(null);
        setWardAnchorPt(null);
      } else if (t.id === wardAnchor) { setWardAnchor(null); setWardAnchorPt(null); }
      return;
    }
    if (marchArmed && marchArmed.length) {
      // THE ORDER OBEYS (Nigel, 2026-10-22): the wheel armed
      // this march; the tap is the order — fired at once,
      // no confirm. (An unarmed chosen one's tile taps do
      // NOT march it any more: choosing and ordering are
      // two gestures now, as the Proving Ground proved.)
      const armed = marchArmed
        .map(id => shared.field.find(u => u.cardId === id && u.ownerKey === you.key))
        .filter((u): u is FieldUnitView => !!u && !u.moving);
      if (armed.length === 1) {
        const unit = armed[0];
        if (t.id !== unit.hex) {
          send({ type: "march", cardId: unit.cardId, from: unit.hex, to: t.id });
          setMarchArmed(null);
          setSelUnitId(null);
          return;
        }
      } else if (armed.length > 1) {
        // The company musters on and around the tapped hex:
        // nearest first, each to its own ground — the
        // standing may not be cursed, four to a hex.
        const load = new Map<string, number>();
        for (const u of shared.field) load.set(u.hex, (load.get(u.hex) ?? 0) + 1);
        for (const u of armed) load.set(u.hex, (load.get(u.hex) ?? 1) - 1);
        const cands = tiles
          .filter(x => !x.cursed)
          .sort((a, b) => axialDist(a, t) - axialDist(b, t) || (a.id < b.id ? -1 : 1));
        let marched = 0;
        for (const u of armed) {
          const dest = cands.find(x => (load.get(x.id) ?? 0) < 4);
          if (!dest) break;
          if (dest.id === u.hex) { load.set(dest.id, (load.get(dest.id) ?? 0) + 1); continue; }
          load.set(dest.id, (load.get(dest.id) ?? 0) + 1);
          send({ type: "march", cardId: u.cardId, from: u.hex, to: dest.id });
          marched++;
        }
        if (marched) { setMarchArmed(null); setSelUnitId(null); }
        return;
      }
    }
    // (This armed-order branch stands ABOVE the marked-
    // curse shortcut below on purpose: a March expressly
    // armed in the orders wheel is the player's stated
    // order, and the tap obeys IT — the ambient strike
    // belongs to a chosen-but-unordered Awokin's taps.)
    // THE MARKED CURSE (Nigel, 2026-10-20): with one of my
    // Awokin chosen, the cursed ground inside its strike
    // reach stands MARKED — its corruption numbered on the
    // tile for all to read — and tapping the mark IS the
    // order: one blow, ✦1, the referee's arithmetic. No
    // separate arming stands between the eye and the blow
    // any longer; the unit bar's button still arms the old
    // road beside this one.
    if (selUnit && selTile && !selUnitMoving && t.cursed && axialDist(selTile, t) <= strikeReachOf(selUnit)) {
      send({ type: "strikeCurse", cardId: selUnit.cardId, hex: selUnit.hex, target: t.id });
      return;
    }
    // Armed against the curse, the chosen one's taps are
    // blows: cursed ground within two tiles is struck (one
    // order, one blow, ✦1 — the server referees the wear);
    // any other tap is answered plainly, and the arm holds.
    if (strikeArmed && selUnit && selTile) {
      if (t.cursed && axialDist(selTile, t) <= strikeReachOf(selUnit)) {
        send({ type: "strikeCurse", cardId: selUnit.cardId, hex: selUnit.hex, target: t.id });
      } else {
        setNotice(t.cursed ? "Beyond its reach — the light strikes only as far as its element carries." : "That ground is not cursed — there is nothing there to strike.");
      }
      return;
    }
    if (selTender) {
      const me = shared.players.find(p => p.key === you.key);
      if (me?.hex && t.id !== me.hex) {
        const c = tileCenter(t);
        send({ type: "glide", tx: c.cx, ty: c.cy });
      }
      setSelTender(false);
      return;
    }
    const mineHere = shared.field.filter(u => u.hex === t.id && u.ownerKey === you.key && !u.moving);
    if (mineHere.length) {
      const idx = mineHere.findIndex(u => u.cardId === selUnitId);
      const next = mineHere[(idx + 1) % mineHere.length];
      setSelUnitId(next.cardId);
      const c = tileCenter(t);
      const cl = stageToClient({ x: c.cx, y: c.cy });
      if (cl) setTableOrders({ ids: [next.cardId], x: cl.x, y: cl.y });
    } else {
      setSelUnitId(null);
    }
  };

  // A tap on one of my own figures chooses it for orders —
  // unless the Written Light is being placed, when the tap
  // belongs to the tile beneath it, as it always did.
  const onUnitTap = (u: FieldUnitView, clientX?: number, clientY?: number) => {
    if (suppressTapRef.current) return; // the tail of a pan-drag, not a tap
    if (placing) {
      const t = tileById.get(u.hex);
      if (t) onTileTap(t);
      return;
    }
    // ITS ORDERS WHEEL (Nigel, 2026-10-22): the tap chooses
    // the Awokin AND opens its wheel where the tap fell —
    // the unit bar is retired behind this door.
    setSelUnitId(u.cardId);
    setSelTender(false);
    let pt: { x: number; y: number } | null = null;
    if (typeof clientX === "number" && typeof clientY === "number") pt = { x: clientX, y: clientY };
    else {
      const t = tileById.get(u.hex);
      if (t) { const c = tileCenter(t); pt = stageToClient({ x: c.cx, y: c.cy }); }
    }
    if (pt) setTableOrders({ ids: [u.cardId], x: pt.x, y: pt.y });
  };

  // A tap on one of the DARK (Nigel, 2026-10-20; re-ruled
  // 2026-10-23 — Recovery R4): the click is the ORDER that
  // looses the written Single Blade — the referee answers
  // (the nearest armed Blade within two hexes of its
  // writing, or a plain answer in the room's notices).
  // While a placing or a tile-order stands armed, the tap
  // belongs to the ground beneath the dark, as a tap on
  // one of my own figures always did.
  const onDarkTap = (e: SharedState["dark"][number]) => {
    if (suppressTapRef.current) return;
    if (placing || marchArmed?.length || strikeArmed) {
      const t = tileById.get(e.hex);
      if (t) onTileTap(t);
      return;
    }
    send({ type: "looseBlade", enemyId: e.id });
  };

  // A tap on MY OWN figure (the Fix Pass, 2026-10-20). With
  // a card readied — or the Written Light being placed — the
  // tap belongs to the ground I stand on, exactly as a tap
  // on one of my Awokin's figures does: the summon (or the
  // placing) is attempted on my tile, and the referee
  // answers plainly. The old hit circle swallowed the tap
  // and silently CLEARED the readied card — and at a fresh
  // seat my own hex is the only lawful summon ground (every
  // ring-1 neighbour of a ring-2 landing is cursed), so the
  // one natural gesture un-readied the summon instead of
  // casting it: "Awokin are still unsummonable" (Nigel,
  // live). Without a card readied, the tap still chooses me
  // (and opens the pad on a touch hand) as it always did —
  // but it never clears a readied card again.
  const onTenderTap = () => {
    if (suppressTapRef.current) return; // the tail of a pan-drag, not a tap
    if (placing) {
      const me = shared?.players.find(p => you && p.key === you.key);
      const t = me?.hex ? tileById.get(me.hex) : undefined;
      if (t) { onTileTap(t); return; }
    }
    setSelTender(true);
    setSelUnitId(null);
    if (coarsePointer()) setControllerOpen(true);
  };

  // One figure of the light at its ground point (ax, ay): the
  // piece art itself — body → arms → head, background and aura
  // layers never stand on a field (the game's one law) — its
  // name, its health and shield, and its owner's ring.
  const renderUnitFigure = (u: FieldUnitView, ax: number, ay: number, moving: boolean): ReactNode => {
    const mine = !!you && u.ownerKey === you.key;
    const cutout = (u.layers ?? [])
      .filter(l => {
        const c = (l.category || "").toLowerCase().trim();
        return c !== "background" && c !== "aura" && !c.includes("background") && !c.includes("aura") && !!l.imageUrl;
      })
      .sort((a, b) => {
        const order = ["aspect", "body", "arms", "head"];
        return order.indexOf(a.category) - order.indexOf(b.category);
      });
    const chosen = mine && selUnitId === u.cardId;
    return (
      <g key={`u-${u.ownerKey}-${u.cardId}`} data-unit-key={`${u.ownerKey}|${u.cardId}`} pointerEvents="none">
        {chosen && <circle cx={ax} cy={ay - 19} r={22} fill="none" stroke="#ffd977" strokeWidth={1.6} />}
        {cutout.length
          ? cutout.map((l, i) => <image key={i} href={l.imageUrl as string} x={ax - 20} y={ay - 38} width={40} height={40} />)
          : u.art
            ? <image href={u.art} x={ax - 20} y={ay - 38} width={40} height={40} />
            : <g transform={`translate(${ax - 11}, ${ay - 38})`}><ElementGlyph element={u.element as GlyphElement} width={22} height={22} /></g>}
        <circle cx={ax - 15} cy={ay - 34} r={2.6} fill={ownerColor(u.ownerName)} />
        <text className="ts-name" x={ax} y={ay + 10}>{u.name}</text>
        <rect x={ax - 13} y={ay + 13} width={26} height={3} fill="#000000" opacity={0.65} />
        <rect x={ax - 13} y={ay + 13} width={26 * clamp01(u.hp / Math.max(1, u.maxHp))} height={3} fill="#7fb069" />
        {(u.shield ?? 0) > 0 && (
          <>
            <rect x={ax - 13} y={ay + 17} width={26} height={2} fill="#000000" opacity={0.5} />
            <rect x={ax - 13} y={ay + 17} width={26 * clamp01((u.shield ?? 0) / Math.max(1, u.maxShield ?? 1))} height={2} fill="#cfd8dc" />
          </>
        )}
        {/* THE WITHERING, WITNESSED (2026-10-20): a mote of
            the curse's own red pulses under a figure standing
            on cursed ground — the burn is visible before the
            bar has visibly moved. */}
        {tileById.get(u.hex)?.cursed && <circle className="wither-mote" cx={ax} cy={ay + 22} r={2.4} fill="#c22333" />}
        {moving && <text x={ax + 16} y={ay - 28} fontSize={9}>🚶</text>}
        {u.follow && <text x={ax - 16} y={ay - 28} fontSize={9}>👣</text>}
        {/* THE ORDERS' MARK (the battle port): a small mark
            for a standing order other than attack, beside the
            follow mark — 🛡 she defends, 🕊 she binds. */}
        {!moving && (u.stance ?? "attack") === "defense" && <text x={ax + 16} y={ay - 16} fontSize={9}>🛡</text>}
        {!moving && (u.stance ?? "attack") === "binding" && <text x={ax + 16} y={ay - 16} fontSize={9}>🕊</text>}
        {mine && !moving && (
          <circle
            cx={ax} cy={ay - 19} r={20} fill="transparent" pointerEvents="all"
            style={{ cursor: "pointer" }}
            onClick={(e) => { e.stopPropagation(); onUnitTap(u, e.clientX, e.clientY); }}
          />
        )}
      </g>
    );
  };

  // One of the dark at its ground point: its art mirrored to
  // face the light, its name, its health. Standing or walking,
  // it is drawn the same — only its place differs.
  const renderDarkFigure = (e: SharedState["dark"][number], ax: number, ay: number, moving: boolean): ReactNode => {
    const art = e.art ?? (e.kind === "fray" ? FRAY_WALK_FRAMES[frayWalkFrameAt(nowMs)] : BUNDLED_ENEMIES[e.kind as keyof typeof BUNDLED_ENEMIES]) ?? null;
    return (
      <g key={`${moving ? "dm" : "d"}-${e.id}`} pointerEvents="none">
        {art
          ? <g transform={`translate(${2 * ax} 0) scale(-1 1)`}><image className="ts-dark-img" href={art} x={ax - 20} y={ay - 38} width={40} height={40} /></g>
          : <text x={ax} y={ay - 13} textAnchor="middle" fontSize={20}>🕳️</text>}
        <text className="ts-name dark" x={ax} y={ay + 10}>{e.label}{e.pinnedUntil > nowMs ? ` ⛓${Math.max(1, Math.ceil((e.pinnedUntil - nowMs) / 1000))}` : ""}</text>
        <rect x={ax - 13} y={ay + 13} width={26} height={3} fill="#000000" opacity={0.65} />
        <rect x={ax - 13} y={ay + 13} width={26 * clamp01(e.hp / Math.max(1, e.maxHp))} height={3} fill="#b8412f" />
        {/* THE CLICK THAT LOOSES (Recovery R4): the dark
            figure itself takes the tap that orders the
            written Blade — see onDarkTap. */}
        <circle
          cx={ax} cy={ay - 19} r={20} fill="transparent" pointerEvents="all"
          style={{ cursor: "pointer" }}
          onClick={(ev) => { ev.stopPropagation(); onDarkTap(e); }}
        />
      </g>
    );
  };

  // Everyone on the stage, back to front by ground point.
  const figures: { key: string; gy: number; node: ReactNode }[] = [];
  const hexGroupCount = new Map<string, number>();
  for (const u of shared.field) {
    const idx = hexGroupCount.get(u.hex) ?? 0;
    hexGroupCount.set(u.hex, idx + 1);
    const [dx, dy] = STACK_OFF[idx % STACK_OFF.length];
    const unitKey = `${u.ownerKey}|${u.cardId}`;
    const anchor = smoothedPos(unitKey, u.pos);
    const ax = anchor.x + dx, ay = anchor.y - 4 + dy;
    // The summon reckoning keeps each standing unit's ground
    // point (a ref written in render, as smoothedPos itself
    // is) — a departure's poof is read from it.
    unitAnchorRef.current.set(unitKey, { x: ax, y: ay });
    figures.push({ key: `u-${u.ownerKey}-${u.cardId}`, gy: ay, node: renderUnitFigure(u, ax, ay, u.moving) });
  }
  for (const e of shared.dark) {
    const anchor = smoothedPos(e.id, e.pos);
    const ax = anchor.x, ay = anchor.y - 4;
    figures.push({ key: `d-${e.id}`, gy: ay, node: renderDarkFigure(e, ax, ay, e.moving) });
  }
  // ── THE TENDERS THEMSELVES, standing on the stage ──────────
  // Every seated tender has a figure: their class sprite,
  // standing where the SERVER says they stand — the Tender
  // truly takes the field now (Nigel, 2026-10-19): at their
  // continuous position, smoothed across ticks, falling back
  // to their hex, then to the seed post. The Storytender
  // holds no ground; she keeps her post beside the seed.
  const TENDER_OFFS: [number, number][] = [[0, 0], [-17, 3], [17, 3]];
  for (const [i, p] of shared.players.entries()) {
    const art = (p.classKey ? TENDER_CLASSES[p.classKey as TenderClassId] : undefined) ?? TENDER_CLASSES[you && p.key === you.key ? myTenderClass : TENDER_CLASS_ORDER[i % TENDER_CLASS_ORDER.length]];
    let gx: number, gy: number, walking = false, dir: TenderDir = "S", step = 0;
    const anchor = p.pos ? smoothedPos(p.key, p.pos) : null;
    if (anchor) {
      gx = anchor.x + TENDER_OFFS[i % TENDER_OFFS.length][0];
      gy = anchor.y - 2 + TENDER_OFFS[i % TENDER_OFFS.length][1];
      walking = p.moving;
      if (walking && p.tgt && p.pos) {
        dir = tenderDirOf(p.tgt.x - p.pos.x, p.tgt.y - p.pos.y);
        step = Math.floor(nowMs / 150);
      }
    } else if (!p.hex) {
      const c = centerOf(SEED_TILE_ID);
      if (!c) continue;
      gx = c.cx + 20; gy = c.cy - 2;
    } else {
      const ctr = centerOf(p.hex);
      if (!ctr) continue;
      gx = ctr.cx + TENDER_OFFS[i % TENDER_OFFS.length][0];
      gy = ctr.cy - 2 + TENDER_OFFS[i % TENDER_OFFS.length][1];
      walking = p.moving;
      if (walking && p.tgt && p.pos) {
        dir = tenderDirOf(p.tgt.x - p.pos.x, p.tgt.y - p.pos.y);
        step = Math.floor(nowMs / 150);
      }
    }
    // A cast in flight outranks the road and the rest: the
    // figure plays its class's casting gesture toward its mark.
    const anim = castAnimRef.current.get(p.key);
    const castPose = anim ? tenderCastPose(art, anim.dir, nowMs - anim.startedAt) : null;
    if (anim && !castPose && nowMs - anim.startedAt > CAST_MS + 500) castAnimRef.current.delete(p.key);
    const pose = castPose ?? tenderPose(art, dir, walking, step);
    const mine = !!you && p.key === you.key;
    // MY leap rides my figure (motion only — see the Space law
    // above): the arc scales to this body (58 against the
    // Ground's ~117), the shadow stays home and shrinks.
    const jpose = mine ? jumpPoseInfo(myJumpRef.current, nowMs) : null;
    const jh = jpose ? jpose.h * (58 / 117) : 0;
    const jFlip = jpose?.flipU != null && jpose.flipU > 0 && jpose.flipU < 1 ? jpose.flipU * 360 : 0;
    const imgRaw = <image href={pose.src} x={gx - 29} y={gy - 58 - jh} width={58} height={58} preserveAspectRatio="xMidYMax meet" />;
    const img = jFlip ? <g transform={`rotate(${jFlip} ${gx} ${gy - 29 - jh})`}>{imgRaw}</g> : imgRaw;
    // THE RUNIC WEAPON floats at his side (Nigel, 2026-10-19):
    // presence only for now — its lunges land in a later phase.
    const weaponKey = (p.weaponKey ?? null) as WeaponKey | null;
    figures.push({
      key: `tender-${p.key}`, gy,
      node: (
        <g key={`tender-${p.key}`} pointerEvents="none" opacity={p.fallen ? 0.45 : 1}>
          <ellipse cx={gx} cy={gy + 1} rx={13 * (1 - 0.32 * Math.min(1, jh / (JPHYS.sage.peak * (58 / 117))))} ry={3.5 * (1 - 0.32 * Math.min(1, jh / (JPHYS.sage.peak * (58 / 117))))} fill="rgba(0,0,0,0.35)" fillOpacity={1 - 0.35 * Math.min(1, jh / (JPHYS.sage.peak * (58 / 117)))} />
          {pose.flip ? <g transform={`translate(${2 * gx} 0) scale(-1 1)`}>{img}</g> : img}
          {weaponKey && WEAPONS[weaponKey] && (
            <image className="ts-weapon-bob" href={weaponImg(weaponKey)} x={gx + 17} y={gy - 47} width={30} height={30}
              preserveAspectRatio="xMidYMid meet" style={{ filter: "drop-shadow(0 0 5px rgba(255,215,100,0.55))" }} />
          )}
          {weaponKey === "swordshield" && (
            <image className="ts-weapon-bob shield" href={shieldImg()} x={gx - 44} y={gy - 45} width={27} height={27}
              preserveAspectRatio="xMidYMid meet" style={{ filter: "drop-shadow(0 0 4px rgba(255,215,100,0.4))" }} />
          )}
          {/* MANIFEST copies (Phase C): small twin weapons
              orbiting opposite the true one while they last. */}
          {(shared.manifests ?? []).filter(m => m.ownerKey === p.key).map(m => (
            Array.from({ length: m.count }, (_, ci) => {
              const ang = nowMs / 900 + Math.PI + (ci * 2 * Math.PI) / Math.max(1, m.count);
              const ox = gx + Math.cos(ang) * 27, oy = gy - 26 + Math.sin(ang) * 9;
              const mk = m.weaponKey as WeaponKey;
              return WEAPONS[mk] ? (
                <image key={`manifest-${ci}`} className="ts-manifest-copy" href={weaponImg(mk)} x={ox - 10} y={oy - 10} width={20} height={20}
                  preserveAspectRatio="xMidYMid meet" style={{ filter: "drop-shadow(0 0 5px rgba(205,185,255,0.8))" }} />
              ) : null;
            })
          ))}
          <text className="ts-name tender" x={gx} y={gy + 21}>{p.name}</text>
          {p.hex && tileById.get(p.hex)?.cursed && <circle className="wither-mote" cx={gx} cy={gy + 27} r={2.4} fill="#c22333" />}
          {mine && (
            <circle cx={gx} cy={gy - 26} r={24} fill="transparent" pointerEvents="all" style={{ cursor: "pointer" }}
              onClick={(e) => { e.stopPropagation(); onTenderTap(); }} />
          )}
        </g>
      ),
    });
  }
  figures.sort((a, b) => a.gy - b.gy);

  // THE WHEEL'S OFFERINGS, built once for two mouths: the
  // radial itself, and the hotbar — a locked slot runs the
  // very act its wheel entry runs (Nigel, 2026-10-19).
  const buildOfferings = (): { key: string; glyph: string | null; emoji: string; cost: number; locked: boolean; keepOpen?: boolean; act: () => void }[] => {
    const offerings: { key: string; glyph: string | null; emoji: string; cost: number; locked: boolean; keepOpen?: boolean; act: () => void }[] = [];
    for (const d of Object.values(defs).filter(d => d.kind === "ward")) {
      offerings.push({ key: `w-${d.key}`, glyph: d.glyph, emoji: "✦", cost: d.cost, locked: !you?.wardRuneUnlocked, act: () => { setPlacing({ kind: "ward", root: d.key }); setWardAnchor(null); setBladePicks([]); } });
    }
    if (healDef) {
      offerings.push({ key: "heal", glyph: healDef.glyph, emoji: "✚", cost: healDef.cost, locked: false, act: () => { setPlacing({ kind: "heal", root: "heal" }); setWardAnchor(null); setBladePicks([]); } });
    }
    // THE SPRINGLEAF: a binding-school def the server routes
    // through castWard — it places by the ward flow.
    for (const d of Object.values(defs).filter(d => d.kind === "binding" && d.engine === "springleaf")) {
      offerings.push({ key: `b-${d.key}`, glyph: d.glyph ?? ANIMATED_GLYPH.trees, emoji: "🌿", cost: d.cost, locked: !you?.wardRuneUnlocked, act: () => { setPlacing({ kind: "ward", root: d.key }); setWardAnchor(null); setBladePicks([]); } });
    }
    for (const d of Object.values(defs).filter(d => d.kind === "rune" || d.kind === "spell")) {
      offerings.push({ key: `r-${d.key}`, glyph: d.glyph, emoji: "✦", cost: d.cost, locked: !you?.wardRuneUnlocked, act: () => { setPlacing({ kind: "rune", root: d.key }); setWardAnchor(null); setBladePicks([]); } });
    }
    // ABILITY: the ring's last entry opens the weapon
    // sub-ring instead of casting.
    offerings.push({ key: "ability", glyph: null, emoji: "⚔", cost: -1, locked: false, keepOpen: true, act: () => openRadialAtMe(true) });
    return offerings;
  };
  const buildAbilityNodes = (): { key: string; img: string | null; emoji: string; label: string; lit: boolean; locked: boolean; act: () => void }[] => {
    const meP = you && shared ? shared.players.find(p => p.key === you.key) : null;
    const myEnergy = meP?.energy ?? you?.energy ?? 0;
    const myWeapon = (meP?.weaponKey ?? you?.weaponKey ?? null) as WeaponKey | null;
    const nodes: { key: string; img: string | null; emoji: string; label: string; lit: boolean; locked: boolean; act: () => void }[] = [];
    for (const wk of WEAPON_ORDER) {
      nodes.push({ key: `wp-${wk}`, img: weaponImg(wk), emoji: "⚔", label: WEAPONS[wk].name.split(" ")[0], lit: myWeapon === wk, locked: false, act: () => send({ type: "wield", weaponKey: wk }) });
    }
    nodes.push({ key: "manifest", img: myWeapon ? weaponImg(myWeapon) : null, emoji: "❖", label: "✦4", lit: false, locked: myEnergy < 4, act: () => send({ type: "manifest" }) });
    return nodes;
  };

  // THE RESTORED WHEEL'S ENTRIES: the Ground's six branches,
  // fed the game's real offerings. Every entry's act is the
  // very act the belt already runs — buildOfferings' placing
  // acts, buildAbilityNodes' wield and manifest, the wheel
  // company's own choosing — only the FORM is the Ground's.
  // A branch the book cannot fill wears the Ground's own
  // answer: one dimmed disc, "None yet". Every cast's entry
  // shows its shape before the tap (Nigel, 2026-10-21): a
  // working's price, a summon's price and its summoner's
  // power, and — while the caster stands in the curse — the
  // −3 the curse presses on the cast.
  /** THE DECK WINDOW'S TAP IS THE SUMMON CAST (Nigel,
   *  2026-10-24 — the gate moved to the following): the
   *  deck entry's tap casts the summon itself, by the
   *  Awokin's ledger id, exactly as a company entry's tap
   *  does — the server builds its card from the roster,
   *  lands it at the Tender's side as a follower, and
   *  enrols it in the party in the same act. (Until tonight
   *  the tap sent R6's reinforcement call — the road or the
   *  air drop into the party first, and only then a summon:
   *  the two-step was the gate Nigel struck.) The outcome
   *  speaks in plain words: a landed cast is told in the
   *  room's tale by the server, a refusal comes back as an
   *  error and stands in the notice line, and a cast that
   *  cannot even be SENT (the socket is not open) says so
   *  here instead of dropping silently — the diagnosis
   *  named that silent drop as one of the ways Nigel's
   *  taps died. */
  const castTableDeckSummon = (r: { awakenedId: number; name: string }) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setNotice(`The call for ${r.name} could not be sent — the Table's connection is not open. Rejoin the Table, then tap again.`);
      return;
    }
    setSelUnitId(null);
    send({ type: "summonCast", awakenedId: r.awakenedId });
  };

  const buildWheelEntries = (): WheelEntry[] => {
    const offByKey = new Map(buildOfferings().map(o => [o.key, o]));
    const defEntry = (d: TableDef, hotKey: string): WheelEntry => {
      const off = offByKey.get(hotKey)!;
      return {
        key: hotKey,
        img: off.glyph,
        emoji: off.emoji,
        label: `${d.root} · ✦${d.cost}${myCursed ? ` · ${curseNote}` : ""}`,
        locked: off.locked,
        lit: placing?.root === d.key,
        pinKey: hotKey,
        dragKey: hotKey,
        act: off.locked ? () => setNotice(`${d.root} — not yet unlocked; its school wakes at Tender Lv 3.`) : off.act,
      };
    };
    const noneYet = (tab: WheelTabId, note: string): WheelEntry[] => [
      { key: `none-${tab}`, sigil: tab, label: "None yet", locked: true, act: () => setNotice(note) },
    ];
    switch (wheelTab) {
      case "spell": {
        const ds = Object.values(defs).filter(d => d.kind === "spell");
        return ds.length ? ds.map(d => defEntry(d, `r-${d.key}`))
          : noneYet("spell", "No spell-school pages stand in the book yet — the Witch's school wakes with its first page.");
      }
      case "ward": {
        const ds = Object.values(defs).filter(d => d.kind === "ward");
        return ds.length ? ds.map(d => defEntry(d, `w-${d.key}`))
          : noneYet("ward", "The book holds no ward pages yet.");
      }
      case "rune": {
        const ds = Object.values(defs).filter(d => d.kind === "rune");
        return ds.length ? ds.map(d => defEntry(d, `r-${d.key}`))
          : noneYet("rune", "The book holds no rune pages yet.");
      }
      case "binding": {
        const out: WheelEntry[] = [];
        for (const d of Object.values(defs).filter(d => d.kind === "binding" && d.engine === "springleaf")) out.push(defEntry(d, `b-${d.key}`));
        if (healDef) out.push(defEntry(healDef, "heal"));
        return out.length ? out : noneYet("binding", "The book holds no binding pages yet.");
      }
      case "awoken": {
        // THE SUMMON FLOW (Nigel, 2026-10-21 — the wheel law;
        // the target struck 2026-10-22): the branch lists the
        // wheel's company — name, figure, and the summon
        // price in ✦, in plain words, with the cast's shape
        // beside it (the summoner's power when it stands
        // above nothing; the curse's −3 while the caster
        // stands in it). The pick IS the cast: no ground is
        // named — the referee lands the Awokin on the
        // Tender's own hex or a free one beside it. A falter
        // spends the price and stands nothing; the branch is
        // read fresh with the room, ready to pick again.
        const companyEntries = (you?.company ?? []).map(card => ({
          key: `card-${card.id}`,
          img: card.art ?? null,
          emoji: "✦",
          label: `${card.name} · ✦${castCostOf(card)}${(you?.summonersPower ?? 0) > 0 ? ` · +${you?.summonersPower} summoner's power` : ""}${myCursed ? ` · ${curseNote}` : ""}`,
          pinKey: `card-${card.id}`,
          dragKey: `card-${card.id}`,
          act: () => { setSelUnitId(null); castSummonCard(card); },
        } as WheelEntry));
        // THE DECK WINDOW (Nigel, 2026-10-23 — Recovery
        // R6, presentation re-ruled 19:45: summoning stays
        // in the wheel, no pop-up, never the full deck
        // visible; the window re-ruled 2026-10-24: FIVE
        // PAGES at most): under the company, the branch
        // shows ONE WINDOW of the rest of the deck — five
        // pages of six at most, walked by the "More" entry
        // below, and refilling as casts slide the window
        // over the deck — never the whole deck fanned at
        // once. THE TAP IS THE SUMMON CAST (Nigel,
        // 2026-10-24), exactly as a company entry's tap is:
        // the server lands the Awoken at the Tender's side as
        // a follower and enrols it in the party in the same
        // act. A deck entry's face is its portrait and its
        // name, nothing more: the outcome words belong to the
        // tap's answer, spoken by the server in plain words
        // (the tale for a landed cast, the notice line for a
        // refusal). THE TAP IS THE CAST, and it is tap-only: no drag key and no
        // pin key are set on it, no drag reclassification and no pin badge can eat
        // it — the drag-to-hotbar for deck entries is gone,
        // by the ruling that the tap wins.
        const deckWin = deckWindow(you?.reinforcements ?? [], deckPage);
        const reinfEntries = deckWin.entries.map(r => ({
          key: `reinf-${r.awakenedId}`,
          img: r.art,
          emoji: "🚶",
          label: r.name,
          tapOnly: true,
          act: () => { castTableDeckSummon(r); },
        } as WheelEntry));
        // THE MORE STEP: inside the wheel, under the window —
        // it walks the window's five pages (wrapping at the
        // window's end) and keeps the wheel open. Pages beyond
        // the window are not paged to: they slide in by the
        // refill as casts empty the window's pages.
        const moreEntries: WheelEntry[] = deckWin.hasMore ? [{
          key: "deck-more",
          emoji: "›",
          label: `More · ${deckWin.page + 1}/${deckWin.pageCount}`,
          stayOpen: true,
          act: () => { setDeckPage(p => nextDeckPage(p, deckWin.total)); },
        } as WheelEntry] : [];
        return [...companyEntries, ...reinfEntries, ...moreEntries];
      }
      case "ability":
        return [
          { key: "nav-weapon", sigil: "weapon", label: "Weapon", nav: "weapon" as WheelTabId },
          { key: "nav-attune", sigil: "ability", label: "Attune", nav: "attune" as WheelTabId },
        ];
      case "attune": {
        // ATTUNE IS AN ABILITY (Nigel, 2026-10-21): the five
        // elements stand on the branch, each showing what
        // the seat's pool holds of it. Choosing one readies
        // the attuning — taps on the land then lay points,
        // one tap, one point, until it is set down. The
        // storyteller's reach is the whole field; a Tender's
        // is his hex, its ring, and his skill's bonus.
        return ATTUNE_ELEMENTS.map(el => {
          const held = Math.floor(you?.pools?.[el] ?? 0);
          return {
            key: `attune-${el}`,
            emoji: ATTUNE_EMOJI[el],
            label: `${el} · ${held}`,
            lit: placing?.kind === "attune" && placing.root === el,
            act: () => {
              if (!you?.pools) { setNotice("Attuning draws on your aspect pools — bind your Tender at the Table to attune."); return; }
              if (held < 1) { setNotice(`Your ${el} pool is empty — attuning costs 1 point of the element, laid from the pool.`); return; }
              setPlacing({ kind: "attune", root: el });
              setWardAnchor(null); setBladePicks([]);
            },
          };
        });
      }
      case "weapon":
        return buildAbilityNodes().map(n => n.key === "manifest"
          ? {
              key: n.key, sigil: "manifest", label: "Manifest", locked: n.locked, pinKey: "manifest",
              act: n.locked ? () => setNotice("Manifest wants ✦4 in the purse — the copies answer only a full call.") : n.act,
            }
          : {
              key: n.key, img: n.img, emoji: n.emoji,
              label: WEAPONS[n.key.slice(3) as WeaponKey].name,
              summoned: n.lit, pinKey: n.key, act: n.act,
            });
    }
  };
  const wheelCaption = (): string => {
    const drag = " · drag an entry onto the hotbar to key it";
    switch (wheelTab) {
      case "weapon": return "Ability — Weapon — wield the runic weapon · Manifest (✦4) calls its copies for 20s";
      case "spell": return Object.values(defs).some(d => d.kind === "spell")
        ? `Spell — castings from the book and the sky${drag}`
        : "Spell — no spell-school pages stand in the book yet · the Witch's school wakes with its first page";
      case "ward": return `Ward — the Written Light, raised on edges you hold${drag}`;
      case "rune": return `Rune — writings in the ground — they wait, and spring${drag}`;
      case "binding": return `Binding — threads that mend and hold — the Springleaf's grove among them${drag}`;
      case "awoken": return (you?.company.length ?? 0) || (you?.reinforcements?.length ?? 0)
        ? `Awoken — called by the cast: pick one and it stands at your side as a follower — no target; a falter spends the price. Below the company, one window of the rest of your deck — five pages at most: tap a deck Awokin to cast its summon the same way, tap More to walk the window's pages, and as you cast, the window refills from the deck beyond${drag}`
        : "Awoken — no one can be called: your whole deck already stands on the field, waits staged, or is still re-coalescing";
      case "ability": return `Ability — the tender's own deeds, beyond spellcraft${drag}`;
      case "attune": return you?.storytender
        ? "Ability — Attune — your reach is the whole field: tap an element, then tap any ground to lay a point on it, one point of that element from your pools per tap"
        : `Ability — Attune — tap an element, then tap ground within your reach (your hex and its ring${(you?.attuneReach ?? 0) > 0 ? `, and ${you?.attuneReach} ring${(you?.attuneReach ?? 0) > 1 ? "s" : ""} more by your skill` : ""}) to lay a point on it — one tap, one point of that element from your pools`;
    }
  };

  // The wheel, opened over your own figure (the controller's
  // button, the hotbar's Ability slot).
  const openRadialAtMe = (ability: boolean) => {
    if (!you || !shared) return;
    const me = shared.players.find(p => p.key === you.key);
    if (!me) return;
    const pt = me.pos ? { x: me.pos.x, y: me.pos.y - 10 }
      : me.hex ? (() => { const c = centerOf(me.hex); return c ? { x: c.cx, y: c.cy - 10 } : null; })() : null;
    if (pt) { setRadial(pt); setWheelTab(t => (ability ? "weapon" : t === "weapon" ? "ability" : t)); }
  };

  // THE CONTROLLER'S PAD: hold a direction and the Tender
  // glides that way — the WASD law under a thumb. Intents
  // refresh on the glide's own 120 ms clock; the stage takes
  // screen directions as its own (its scale is uniform, its
  // axes unrotated), and letting go sends the stop.
  padSendRef.current = () => {
    const v = padVecRef.current;
    const pos = myPosRef.current;
    if (!v || !pos || !you || !shared) return;
    const me = shared.players.find(p => p.key === you.key);
    if (!me || me.fallen) return;
    send({ type: "glide", tx: pos.x + v.x * 420, ty: pos.y + v.y * 420 });
    setSelTender(true);
  };
  const padStart = () => {
    padSendRef.current?.();
    if (!padTimerRef.current) padTimerRef.current = setInterval(() => { padSendRef.current?.(); }, 120);
  };
  const padStop = () => {
    padVecRef.current = null;
    setPadKnob({ x: 0, y: 0 });
    if (padTimerRef.current) { clearInterval(padTimerRef.current); padTimerRef.current = null; }
    send({ type: "glideStop" });
  };
  const onPadVec = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2), dy = e.clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len < 10) { padVecRef.current = null; setPadKnob({ x: 0, y: 0 }); return; }
    padVecRef.current = { x: dx / len, y: dy / len };
    setPadKnob({ x: (dx / len) * 24, y: (dy / len) * 24 });
    padStart();
  };

  // A hotbar slot pressed: the locked thing does what it does
  // from the wheel (or the company) — no second language.
  const actHotbar = (key: string) => {
    if (key === "ability") { openRadialAtMe(true); return; }
    if (key.startsWith("reinf-")) {
      // A slot keyed before the in-wheel fix: its tap runs
      // the same guarded call the wheel's deck entries run.
      const r = you?.reinforcements?.find(x => x.awakenedId === Number(key.slice(6))) ?? null;
      if (r) castTableDeckSummon(r);
      else toggleHotbar(key); // no longer callable — the slot looses itself
      return;
    }
    if (key.startsWith("card-")) {
      const id = key.slice(5);
      const card = you?.company.find(c => c.id === id) ?? null;
      if (card) { setSelUnitId(null); castSummonCard(card); }
      else toggleHotbar(key); // the member has left the company — the slot looses itself
      return;
    }
    const off = buildOfferings().find(o => o.key === key);
    if (off) { if (!off.locked) off.act(); return; }
    const node = buildAbilityNodes().find(n => n.key === key);
    if (node && !node.locked) node.act();
  };
  hotbarActRef.current = (i: number) => { const k = hotbarKeys[i]; if (k) actHotbar(k); };
  // A drag from the wheel keys its entry to the belt — the
  // pin's own road, walked by hand: present already, or the
  // belt full, and the drop simply lands as nothing.
  const dropToHotbar = (key: string) => { if (!hotbarKeys.includes(key)) toggleHotbar(key); };
  const hotbarMeta = (key: string): { img: string | null; emoji: string; label: string; dim: boolean; lit: boolean; title: string } => {
    if (key === "ability") return { img: null, emoji: "⚔", label: "ABILITY", dim: false, lit: false, title: "Ability — the wheel's weapon ring, opened over your Tender" };
    if (key.startsWith("card-")) {
      const card = you?.company.find(c => c.id === key.slice(5)) ?? null;
      return { img: card?.art ?? null, emoji: "✦", label: card ? card.name.split(" ")[0] : "gone", dim: !card, lit: false, title: card ? `${card.name} — tap to cast the summon: it stands at your side, no target` : "This Awokin is not in your company now — tap to loose the slot" };
    }
    if (key.startsWith("reinf-")) {
      const r = you?.reinforcements?.find(x => x.awakenedId === Number(key.slice(6))) ?? null;
      return { img: r?.art ?? null, emoji: "🚶", label: r ? r.name.split(" ")[0] : "gone", dim: !r, lit: false, title: r ? `${r.name} — tap to cast the summon: it stands at your side as a follower, ✦${r.cost} the cast's price` : "This Awokin cannot be called now — tap to loose the slot" };
    }
    const off = buildOfferings().find(o => o.key === key);
    if (off) {
      const d = Object.values(defs).find(dd => `w-${dd.key}` === key || `b-${dd.key}` === key || `r-${dd.key}` === key);
      const root = key === "heal" ? "heal" : d?.key;
      return { img: off.glyph, emoji: off.emoji, label: `✦${off.cost}`, dim: off.locked, lit: !!root && placing?.root === root, title: `${d?.root ?? "Heal"} — tap to ready it, then tap its ground (right-click the slot to loose it)` };
    }
    const node = buildAbilityNodes().find(n => n.key === key);
    if (node) return { img: node.img, emoji: node.emoji, label: node.label, dim: node.locked, lit: node.lit, title: node.key === "manifest" ? "Manifest — tap to call the copies (✦4)" : `${node.label} — tap to wield it (right-click the slot to loose it)` };
    return { img: null, emoji: "✦", label: "?", dim: true, lit: false, title: "A locked thing the Table no longer knows — right-click to loose it" };
  };
  return (
    <div className="table-room">
      <header className="skybar">
        <span className="sky-reign">☁ <strong>{sky.mood}</strong>{sky.description ? ` — ${sky.description}` : ""}</span>
        <span className="sky-round">The Table · {shared.mode === "campaign" ? "campaign room" : "casual room"}</span>
        {shared.campaign?.seeded && !shared.campaign.over && (
          <span className="bank-chip" title="The party's one bank — every cast draws from it, every harvest joins it, and what remains divides evenly when the campaign turns home">🌟 The Bank <span className="spark-glow">✦</span>{shared.campaign.bank}</span>
        )}
        {shared.campaign?.over === "fallen" && <span className="bank-chip fallen">🌑 The Bastion has fallen</span>}
        {shared.campaign?.over === "ended" && <span className="bank-chip">🏠 The campaign has turned home</span>}
        <span className="sky-threat">
          <label>Unraveling power</label>
          <span className="threat-track"><span className="threat-fill" style={{ width: "0%" }} /></span>
          <span className="threat-num">0 — the dark is not yet dealt</span>
        </span>
      </header>

      {/* THE SEED'S CLIMB, ON THE ROOM'S EDGE (Nigel,
          2026-10-25 15:23: "one more fix for discord. it
          need the starseed growh mechnics and ui"; the
          shape, 15:25: "i like the idea of a standing strip
          for the discord seed meeter since the goal is t
          osee how high you can make it go"): a slim strip
          along the room's bottom edge, always standing,
          riding the snapshot's own seed block — no new
          fetch, no new payload. It names the stage, meters
          the fed energy toward the next stage, marks the
          climb's stages in a row with the seed's own lit,
          and carries ONE line naming the feeding road. It
          stands under the skybar, on the room's scoreboard
          edge: the bottom edge belongs to the satchel
          drawer, which rests half off-screen there and
          covers anything laid beneath it (found by this
          build's first screenshots — the strip stood
          complete and was painted over); the campaign
          centre stays open below, the party rail and the
          tale keep their columns, and the beacon pin rides
          the right side's middle, far from this ground. */}
      {shared.seed && (() => {
        const seed = shared.seed;
        const climb = [
          { key: "starseed", label: "Starseed", level: 1 },
          { key: "sapling", label: "Sapling", level: 2 },
          { key: "beacon", label: "Beacon", level: 3 },
          { key: "bastion", label: "Bastion", level: 4 },
        ];
        const stageName = seed.stage === "sapling" ? "Sapling of Light"
          : seed.stage === "beacon" ? "Beacon of Light"
          : seed.stage === "bastion" ? "Bastion"
          : "Starseed";
        const atHeight = seed.nextStageAt == null;
        const spanBase = seed.level >= 2 ? 15 : 0;
        const meterPct = atHeight ? 100
          : Math.max(0, Math.min(100, ((seed.fedEnergy - spanBase) / (seed.nextStageAt! - spanBase)) * 100));
        return (
          <footer className="seed-strip" role="region" aria-label="The star-seed's climb">
            <span className="seed-strip-name">⭐ The star-seed stands a <strong>{stageName}</strong></span>
            <span className="seed-strip-meter" aria-hidden="true"><span className="seed-strip-fill" style={{ width: `${meterPct}%` }} /></span>
            <span className="seed-strip-fed">
              {atHeight
                ? <>fed {Math.floor(seed.fedEnergy)} — it stands at its height</>
                : <>fed {Math.floor(seed.fedEnergy)} of {seed.nextStageAt} toward the {seed.level >= 2 ? "Beacon" : "Sapling"}</>}
            </span>
            <span className="seed-strip-steps" aria-hidden="true">
              {climb.map((s, i) => (
                <span key={s.key} className={`seed-strip-step${seed.level >= s.level ? " on" : ""}${seed.level === s.level ? " now" : ""}`}>
                  {i > 0 && <span className="seed-strip-arrow">→</span>}{s.label}
                </span>
              ))}
            </span>
            <span className="seed-strip-feed">It feeds while a Tender stands on its hex.</span>
          </footer>
        );
      })()}

      <main className="table-main">
        <aside className="panel party-panel">
          <h3>The Party</h3>
          {shared.players.length === 0 && <p className="quiet">No Tenders seated yet.</p>}
          {shared.players.map((p) => (
            <div key={p.key} className={`party-row${you && p.key === you.key ? " self" : ""}`}>
              <span className="party-name">{p.name}{you && p.key === you.key ? " (you)" : ""}{p.away ? " · away" : ""}</span>
              {p.storytender ? <span className="party-meta">📖 Storytender — she deals</span> : p.fallen ? <span className="party-meta fallen">💀 fallen — rises between waves</span> : <span className="party-meta">❤ {p.tenderHp}/{p.maxTenderHp} · <span className="spark-glow">✦</span> {p.energy} · 🎡 {p.companyCount} at the wheel</span>}
            </div>
          ))}
          {shared.watcherCount > 0 && <p className="quiet">{shared.watcherCount} watching</p>}
          {you && myServerClass && (
            <div className="tender-class-row">
              <span className="quiet">You stand as the {TENDER_CLASSES[myServerClass].label} — your chosen class.</span>
            </div>
          )}
          {you && !myServerClass && (
            <div className="tender-class-row">
              <span className="quiet">You stand as:</span>
              {TENDER_CLASS_ORDER.map(id => (
                <button
                  key={id}
                  className={myTenderClass === id ? "tc-on" : ""}
                  onClick={() => { setMyTenderClass(id); localStorage.setItem("table-tender-class", id); }}
                >
                  {TENDER_CLASSES[id].icon} {TENDER_CLASSES[id].label}
                </button>
              ))}
            </div>
          )}
          {you && (
            <details className="packing">
              <summary>Your packing</summary>
              {you.inventory.length === 0 && <p className="quiet">Nothing written down yet.</p>}
              <ul className="packing-list">
                {you.inventory.map((item, i) => (
                  <li key={i}>
                    <span>{item}</span>
                    <button
                      className="mini-btn"
                      aria-label={`Remove ${item}`}
                      onClick={() => send({ type: "inventory", items: you.inventory.filter((_, j) => j !== i) })}
                    >✕</button>
                  </li>
                ))}
              </ul>
              <form
                className="packing-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = packDraft.trim();
                  if (!v) return;
                  send({ type: "inventory", items: [...you.inventory, v] });
                  setPackDraft("");
                }}
              >
                <input value={packDraft} onChange={(e) => setPackDraft(e.target.value)} maxLength={120} placeholder="Write an item…" aria-label="Add an item to your packing" />
                <button className="mini-btn add" type="submit">Add</button>
              </form>
              <p className="quiet small">Yours alone — typed, kept, and carried between sittings.</p>
            </details>
          )}
        </aside>

        <section className="panel field-panel">
          <div className="field-wrap">
            <div className="table-nebula" style={{ backgroundImage: `url(${nebulaNegative})` }} aria-hidden="true" />
            <div className="table-meteors" aria-hidden="true">
              {TABLE_METEORS.map((m, i) => (
                <img
                  key={i}
                  className="table-meteor"
                  src={meteorRain}
                  alt=""
                  style={{ left: m.left, width: m.w, opacity: m.o, animationDuration: m.dur, animationDelay: m.delay }}
                />
              ))}
            </div>
            <div className="field-board">
            <svg
              ref={svgRef}
              className="terrain-stage"
              viewBox={`${stageBox.x} ${stageBox.y} ${stageBox.w} ${stageBox.h}`}
              preserveAspectRatio="xMidYMid slice"
              role="img"
              aria-label="the instance — the terrain map, dealt fresh"
              onPointerDown={onStageDown}
              onPointerMove={onStageMove}
              onPointerUp={onStageUp}
              onPointerCancel={onStageUp}
              onContextMenu={(e) => {
                e.preventDefault();
                if (Date.now() - lineJustDrawnRef.current < 500) return; // a drawn line's release is not a click
                if (Date.now() - rightDragAt.current < 500) return; // neither is a spent right drag's
                // THE CLICK LAW (Nigel, 2026-10-23): the right
                // hand never casts — while a working stands
                // readied, this click CANCELS it and no wheel
                // opens; the next right-click opens the wheel.
                if (placing) { unloadCast(); return; }
                openRadialAt(e.clientX, e.clientY);
              }}
            >
            <g transform={`translate(${view.pan.x} ${view.pan.y}) scale(${view.zoom})`}>
              {/* The land itself, back tiles first: every tile
                  wears its painted face — the curse's face, or
                  the face of the element that holds it. */}
              {sortedTiles.map((t) => {
                const { cx, cy } = tileCenter(t);
                const isSeed = t.id === SEED_TILE_ID;
                const face = t.cursed ? cursedImg
                  : isSeed || !t.element || t.element === "fire" ? BUNDLED_TERRAIN.neutral
                  : BUNDLED_TERRAIN[t.element as keyof typeof BUNDLED_TERRAIN] ?? BUNDLED_TERRAIN.neutral;
                const faceKey = t.cursed ? "cursed"
                  : isSeed || !t.element || t.element === "fire" ? "neutral"
                  : t.element as string;
                const artPlace = TILE_ART_PLACE[faceKey] ?? TILE_ART_PLACE_DEFAULT;
                let overlay: { fill: string; opacity: number } | null = null;
                if (placing && you) {
                  if (tilePickable(t)) overlay = { fill: "#ffd977", opacity: 0.22 };
                  if (wardAnchor === t.id) overlay = { fill: "#ffd977", opacity: 0.35 };
                  if (bladePicks.includes(t.id)) overlay = { fill: "#ff7a33", opacity: 0.3 };
                } else if (selUnit && selTile) {
                  // The marked curse: cursed ground inside the
                  // chosen one's reach burns dark red, armed
                  // or not — the mark is the invitation.
                  if (t.cursed && !selUnitMoving && axialDist(selTile, t) <= strikeReachOf(selUnit)) overlay = { fill: "#c22333", opacity: 0.32 };
                  else if (t.id !== selUnit.hex) overlay = { fill: "#ffffff", opacity: strikeArmed ? 0.05 : 0.07 };
                }
                return (
                  <g key={t.id}>
                    <image href={face} x={cx - TILE_SIZE * 1.2106 + artPlace.dx * TILE_SIZE} y={cy - TILE_SIZE * 0.6857 + artPlace.dy * TILE_SIZE} width={TILE_SIZE * 2.41} height={TILE_SIZE * artPlace.h} preserveAspectRatio="xMidYMid meet" pointerEvents="none" />
                    {!t.cursed && t.element === "fire" && !isSeed && (
                      <polygon points={hexCellPoints(cx, cy, TILE_SIZE)} fill="#ff7733" opacity={0.18} pointerEvents="none" />
                    )}
                    {isSeed && (
                      <>
                        <circle className="seed-ground" cx={cx} cy={cy} r={22} />
                        <circle className="seed-bulb" cx={cx} cy={cy} r={bulbR * 1.63} />
                        {/* THE SEED GROWN (the battle port —
                            Twelve #1): fed past the Starseed,
                            the seed wears its stage's face —
                            the homeland's own art, the Sapling
                            at a figure's height, the Beacon at
                            twice that, as the homeland seats
                            them. */}
                        {shared.seed && shared.seed.level >= 2 && (
                          <image href={shared.seed.stage === "beacon" || shared.seed.stage === "bastion" ? seedBeaconArt : seedSaplingArt}
                            x={cx - (shared.seed.level >= 3 ? 20.5 : 12)} y={cy + 8 - (shared.seed.level >= 3 ? 80 : 40)}
                            width={shared.seed.level >= 3 ? 41 : 24} height={shared.seed.level >= 3 ? 80 : 40}
                            preserveAspectRatio="xMidYMax meet" pointerEvents="none" />
                        )}
                      </>
                    )}
                    {t.landing && (
                      <polygon points={hexCellPoints(cx, cy, TILE_SIZE, 0.96)} fill="none" stroke="#d9b45c" strokeWidth={2} opacity={0.8} pointerEvents="none" />
                    )}
                    {t.cursed && (
                      <>
                        {/* The curse made countable: its bar
                            stands on every cursed tile now, and
                            its remaining corruption is numbered
                            once it has been worn — or whenever a
                            warden stands armed against it. */}
                        <rect x={cx - 17} y={cy + 22} width={34} height={3} fill="#000000" opacity={0.55} pointerEvents="none" />
                        <rect x={cx - 17} y={cy + 22} width={34 * clamp01(t.curseHp / Math.max(1, t.curseMaxHp))} height={3} fill="#c22333" pointerEvents="none" />
                        {(t.curseHp < t.curseMaxHp || strikeArmed || (selUnit && selTile && !selUnitMoving && axialDist(selTile, t) <= strikeReachOf(selUnit))) && (
                          <text className="curse-hp-label" x={cx} y={cy + 34}>{Math.max(0, Math.ceil(t.curseHp))}</text>
                        )}
                      </>
                    )}
                    {overlay && <polygon points={hexCellPoints(cx, cy, TILE_SIZE)} fill={overlay.fill} opacity={overlay.opacity} pointerEvents="none" />}
                    <polygon
                      points={hexCellPoints(cx, cy, TILE_SIZE)}
                      fill="transparent"
                      pointerEvents="all"
                      onPointerDown={() => { castPressAtRef.current = Date.now(); }}
                      onClick={(e) => onTileTap(t, stagePointOf(e.clientX, e.clientY))}
                      style={{ cursor: overlay || myUnitOn(t.id) ? "pointer" : "default" }}
                    />
                  </g>
                );
              })}
              {/* The choosing band and the drawn line, while
                  the hand is down (the orders law, 2026-10-22):
                  the band chooses the company; the line is
                  where an armed march will spread them. */}
              {bandSel && (
                <rect x={Math.min(bandSel.x0, bandSel.x1)} y={Math.min(bandSel.y0, bandSel.y1)}
                  width={Math.abs(bandSel.x1 - bandSel.x0)} height={Math.abs(bandSel.y1 - bandSel.y0)}
                  fill="rgba(255,215,0,0.10)" stroke="#ffd700" strokeWidth={1.2} strokeDasharray="5 4" pointerEvents="none" />
              )}
              {lineSel && (
                <g pointerEvents="none">
                  <line x1={lineSel.x0} y1={lineSel.y0} x2={lineSel.x1} y2={lineSel.y1}
                    stroke="rgba(255,215,0,0.9)" strokeWidth={2} strokeDasharray="6 4" strokeLinecap="round" />
                  {/* THE BLIPS (Nigel, 2026-10-23): one for each
                      Awokin the order targets, spread evenly
                      with one at each end — a lone Awokin's at
                      the far end, the point dragged to. */}
                  {(marchArmed && marchArmed.length > 1
                    ? marchArmed.map((_, i) => ({
                        x: lineSel.x0 + (lineSel.x1 - lineSel.x0) * (i / (marchArmed.length - 1)),
                        y: lineSel.y0 + (lineSel.y1 - lineSel.y0) * (i / (marchArmed.length - 1)),
                      }))
                    : [{ x: lineSel.x1, y: lineSel.y1 }]
                  ).map((bl, i) => (
                    <circle key={`line-blip-${i}`} cx={bl.x} cy={bl.y} r={5} fill="#ffd700" stroke="rgba(20,16,4,0.85)" strokeWidth={1.2} />
                  ))}
                </g>
              )}
              {/* The Written Light, laid on the land: runes wait
                  in a tile's floor; wards stand on the edge
                  between two, a glowing line and its glyph. */}
              {shared.workings.map((w) => {
                const img = defs[w.root]?.glyph ?? GLYPHS[w.root] ?? null;
                const filter = `${HUE_FILTERS[w.hue] ?? "none"} drop-shadow(0 0 6px ${HUE_GLOWS[w.hue] ?? "#ffd98a"})`;
                if (w.kind === "grove" && w.pos && w.radiusPx) {
                  // THE SPRINGLEAF'S GROVE (Phase C): a soft
                  // green root-glow circle on the ground (the
                  // Root aspect's colour language), the drawn
                  // Trees glyph at its heart, fading as its
                  // lent time runs out.
                  const left = w.expiresAt ? Math.max(0, w.expiresAt - nowMs) : 20000;
                  const fade = Math.min(1, left / 6000);
                  return (
                    <g key={w.id} pointerEvents="none" className="grove-glow">
                      <circle cx={w.pos.x} cy={w.pos.y} r={w.radiusPx} fill="#7dd069" opacity={0.10 + 0.05 * fade} />
                      <circle cx={w.pos.x} cy={w.pos.y} r={w.radiusPx} fill="none" stroke="#7dd069" strokeWidth={1.6} opacity={0.28 + 0.25 * fade} style={{ filter: "drop-shadow(0 0 7px #7dd069)" }} />
                      <image href={ANIMATED_GLYPH.trees} x={w.pos.x - 17} y={w.pos.y - 17} width={34} height={34} opacity={0.55 + 0.4 * fade} />
                      <text className="ts-tag" x={w.pos.x} y={w.pos.y + 27}>{w.mother ? "🌿" : "🌱"} {Math.max(0, Math.ceil(left / 1000))}s</text>
                    </g>
                  );
                }
                if (w.engine === "bats" && w.pos) {
                  // THE SWARM (Nigel, 2026-10-22; seated
                  // 2026-10-23): Nigel's 43 frames at the
                  // swarm's flown position, the page's tempo.
                  const bw = 118, bh = bw * (348 / 660);
                  return (
                    <g key={w.id} pointerEvents="none">
                      <image href={batsFrameAt(nowMs)} x={w.pos.x - bw / 2} y={w.pos.y - bh / 2} width={bw} height={bh} opacity={0.95} />
                    </g>
                  );
                }
                if (w.engine === "holdrune" && w.pos) {
                  // THE HOLD RUNE (Nigel, 2026-10-22): the
                  // game copy's frames over its shade's head —
                  // form and hover once, then the crash loops
                  // for the hold (workingFx keeps the order).
                  const hw = 168, hh = hw * (388 / 768);
                  return (
                    <g key={w.id} pointerEvents="none">
                      <image href={holdRuneFrameAt(nowMs, w.bornAt ?? nowMs, w.struckAt ?? null)} x={w.pos.x - hw / 2} y={w.pos.y - hh - 26} width={hw} height={hh} opacity={0.95} />
                    </g>
                  );
                }
                if (w.engine === "shatter" && w.pos) {
                  // THE HELD STREAM (Nigel, 2026-10-22): the
                  // rune's pieces, cycling as they fly — the
                  // strikes themselves ride room.strikes.
                  const piece = SHATTER_PIECES[Math.floor(nowMs / 333) % SHATTER_PIECES.length];
                  return (
                    <g key={w.id} pointerEvents="none">
                      <image href={piece} x={w.pos.x - 21} y={w.pos.y - 21} width={42} height={42} opacity={0.9} />
                    </g>
                  );
                }
                if (w.kind === "rune" && w.hex) {
                  // THE DELIVERY'S HAND-OFF (Nigel, 2026-10-24):
                  // a Blade still flying in from its caster is
                  // not yet drawn standing — the glyph in the
                  // air IS this writing; when the flight lands,
                  // the planted glyph stands in its place.
                  if (w.engine === "blade" && (shared.bladeCasts ?? []).some((f) => f.workingId === w.id && nowMs - f.at < 700)) return null;
                  // Written at a tapped point, the writing is
                  // drawn where it was laid (2026-10-24);
                  // the hex road draws at the hex's heart.
                  const hc = centerOf(w.hex);
                  const c = w.pos ? { cx: w.pos.x, cy: w.pos.y } : hc;
                  if (!c) return null;
                  return (
                    <g key={w.id} pointerEvents="none">
                      {img
                        ? <image href={img} x={c.cx - 14} y={c.cy - 14} width={27} height={27} style={{ filter }} />
                        : <text className="ts-glyph-fallback" x={c.cx} y={c.cy + 7} style={{ filter }}>✦</text>}
                      {(defs[w.root]?.engine === "blade" || defs[w.root]?.engine === "springblade") && <text className="ts-tag" x={c.cx} y={c.cy + 23}>{w.charges}✦</text>}
                      {defs[w.root]?.engine === "lattice" && <text className="ts-tag" x={c.cx} y={c.cy + 23}>❤{w.hp}</text>}
                    </g>
                  );
                }
                if (w.engine === "blackgate" && w.wall) {
                  // THE BLACK GATE AT THE TABLE (2026-10-24):
                  // Nigel's own Black Gate piece standing at
                  // its wall point, paling as its wounds
                  // deepen, its HP worn beneath it — as the
                  // homeland draws it, and as Bulwark's
                  // shields are drawn beside it here.
                  const frac = Math.max(0, Math.min(1, w.wall.hp / Math.max(1, w.wall.maxHp)));
                  return (
                    <g key={w.id} pointerEvents="none" opacity={0.3 + 0.7 * frac}>
                      <image href={blackGateImg} x={w.wall.x - 40} y={w.wall.y - 40} width={80} height={80} preserveAspectRatio="xMidYMid meet" style={{ filter: "drop-shadow(0 0 7px rgba(0,0,0,0.8))" }} />
                      <text className="ts-tag" x={w.wall.x} y={w.wall.y + 48}>❤{w.wall.hp}</text>
                    </g>
                  );
                }
                if (w.engine === "bulwark" && w.shields) {
                  // BULWARK (Nigel, 2026-10-23 — Recovery R12):
                  // the cast line of shields, each drawn with
                  // his own uploaded Shield piece (the
                  // rune/ward set's "Artwork 4") at its own
                  // field point, paling as its wounds deepen
                  // and wearing its HP beneath it, as the
                  // Trees wear theirs.
                  return (
                    <g key={w.id} pointerEvents="none">
                      {w.shields.filter(s => s.hp > 0).map((s, i) => {
                        const frac = Math.max(0, Math.min(1, s.hp / Math.max(1, s.maxHp)));
                        return (
                          <g key={i} opacity={0.35 + 0.65 * frac}>
                            <image href={bulwarkShieldImg} x={s.x - 23} y={s.y - 24} width={46} height={48} preserveAspectRatio="xMidYMid meet" style={{ filter: "drop-shadow(0 0 5px rgba(255,217,138,0.55))" }} />
                            <text className="ts-tag" x={s.x} y={s.y + 34}>❤{s.hp}</text>
                          </g>
                        );
                      })}
                    </g>
                  );
                }
                if ((w.engine === "bramble" || w.engine === "rockwall") && w.nodes) {
                  // DEFENCE WORKS (the battle port — Twelve
                  // #1): a defender's raised work, drawn as
                  // the homeland draws it — the bramble's
                  // thicket from Nigel's flipbook, growing in
                  // frame by frame off each node's served
                  // birth; its motes the same run at mote
                  // scale off their own births; the rockwall
                  // as standing stones — each node paling as
                  // its wounds deepen.
                  return (
                    <g key={w.id} pointerEvents="none">
                      {w.nodes.filter(n => n.hp > 0).map((n, i) => {
                        const frac = Math.max(0, Math.min(1, n.hp / Math.max(1, n.maxHp)));
                        if (w.engine === "rockwall") {
                          return (
                            <g key={i} opacity={0.35 + 0.65 * frac}>
                              <ellipse cx={n.x} cy={n.y + TILE_SIZE * 0.1} rx={TILE_SIZE * 0.17} ry={TILE_SIZE * 0.06} fill="rgba(0,0,0,0.4)" />
                              <polygon points={`${n.x},${n.y - TILE_SIZE * 0.3} ${n.x + TILE_SIZE * 0.16},${n.y + TILE_SIZE * 0.08} ${n.x - TILE_SIZE * 0.16},${n.y + TILE_SIZE * 0.08}`} fill="#8d8578" stroke="#4c463c" strokeWidth={1} strokeLinejoin="round" />
                            </g>
                          );
                        }
                        if (n.mote) {
                          return (
                            <g key={i} opacity={0.35 + 0.65 * frac}>
                              <ellipse cx={n.x} cy={n.y + TILE_SIZE * 0.05} rx={TILE_SIZE * 0.09} ry={TILE_SIZE * 0.03} fill="rgba(0,0,0,0.4)" />
                              <image href={brambleMoteFrameAt(nowMs, typeof n.born === "number" ? n.born : nowMs)}
                                x={n.x + TILE_SIZE * BRAMBLE_CENTRE_OFF * BRAMBLE_MOTE_SCALE - TILE_SIZE * BRAMBLE_DRAW_W * BRAMBLE_MOTE_SCALE / 2} y={n.y + TILE_SIZE * BRAMBLE_BASE_OFF * BRAMBLE_MOTE_SCALE - TILE_SIZE * BRAMBLE_DRAW_W * BRAMBLE_MOTE_SCALE * BRAMBLE_ASPECT} width={TILE_SIZE * BRAMBLE_DRAW_W * BRAMBLE_MOTE_SCALE} height={TILE_SIZE * BRAMBLE_DRAW_W * BRAMBLE_MOTE_SCALE * BRAMBLE_ASPECT}
                                preserveAspectRatio="xMidYMax meet" />
                            </g>
                          );
                        }
                        return (
                          <g key={i} opacity={0.35 + 0.65 * frac}>
                            <ellipse cx={n.x} cy={n.y + TILE_SIZE * 0.12} rx={TILE_SIZE * 0.2} ry={TILE_SIZE * 0.07} fill="rgba(0,0,0,0.4)" />
                            <image href={brambleFrameAt(nowMs, typeof n.born === "number" ? n.born : nowMs)}
                              x={n.x + TILE_SIZE * BRAMBLE_CENTRE_OFF - TILE_SIZE * BRAMBLE_DRAW_W / 2} y={n.y + TILE_SIZE * BRAMBLE_BASE_OFF - TILE_SIZE * BRAMBLE_DRAW_W * BRAMBLE_ASPECT} width={TILE_SIZE * BRAMBLE_DRAW_W} height={TILE_SIZE * BRAMBLE_DRAW_W * BRAMBLE_ASPECT}
                              preserveAspectRatio="xMidYMax meet" />
                          </g>
                        );
                      })}
                    </g>
                  );
                }
                if (w.kind === "ward" && w.hexA && w.hexB) {
                  const a = centerOf(w.hexA);
                  const b = centerOf(w.hexB);
                  if (!a || !b) return null;
                  const mx = (a.cx + b.cx) / 2, my = (a.cy + b.cy) / 2;
                  const glow = HUE_GLOWS[w.hue] ?? "#ffd98a";
                  return (
                    <g key={w.id} pointerEvents="none">
                      <line x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy} stroke={glow} strokeWidth={2.5} strokeLinecap="round" opacity={0.75} style={{ filter: `drop-shadow(0 0 6px ${glow})` }} />
                      {img
                        ? <image href={img} x={mx - 16} y={my - 16} width={31} height={31} style={{ filter }} />
                        : <text className="ts-glyph-fallback" x={mx} y={my + 7} style={{ filter }}>✦</text>}
                      {defs[w.root]?.engine === "trees" && <text className="ts-tag" x={mx} y={my + 24}>❤{w.hp}</text>}
                      {defs[w.root]?.engine === "seal" && <text className="ts-tag" x={mx} y={my + 24}>❤{w.hp} · {(defs[w.root]?.numbers.stops ?? 3) - w.stops}✦</text>}
                    </g>
                  );
                }
                return null;
              })}
              {/* SHARD RAIN FALLS (Phase C): when the rain
                  springs, Nigel's drawn shard-rain.gif falls
                  over every covered hex for the fall's moment.
                  (The standing rune already wears the same gif
                  as its glyph — ANIMATED_GLYPH.shardrain in
                  effects.ts IS shard-rain.gif — this is the
                  fall itself, at the hexes it covers.) */}
              {(shared.rainFalls ?? []).filter(f => nowMs - f.at < 1800).map(f => (
                <g key={`rain-${f.id}`} pointerEvents="none">
                  {f.hexes.map(hx => {
                    const c = centerOf(hx);
                    if (!c) return null;
                    return <image key={hx} href={ANIMATED_GLYPH.shardrain} x={c.cx - 40} y={c.cy - 44} width={80} height={80} opacity={0.92} style={{ filter: "drop-shadow(0 0 6px #cdb9ff)" }} />;
                  })}
                </g>
              ))}
              {/* Everyone standing — and walking — back to front. */}
              {figures.map(f => f.node)}
              {/* The round's strikes, flown on gravity's arc from
                  tile to tile. Each shot lives its own 1500 ms
                  on a timer keyed to its id, then unmounts —
                  state pushes can no longer strand one at its
                  endpoint (the Fix Pass, 2026-10-20). */}
              {/* THE SINGLE BLADE'S FLIGHTS (Recovery R4;
                  the clock, 2026-10-24): a Blade loosed by
                  the click — its blades rise from the rune's
                  hex and spear down into the mark from above.
                  The road is the one the SMIL telling walked
                  — up from the writing, down into the mark,
                  the second blade 120 ms behind on a shorter
                  rise — now walked by this ground's own clock
                  (nowMs) at a constant pace along the whole
                  road, head-forward on each leg: <animateMotion>
                  is dead on the browsers the Tender plays on
                  (the meteor pattern), so no blade rides it. */}
              {(shared.bladeFlights ?? []).filter(f => nowMs - f.at < 1000).map(f => {
                const hc = centerOf(f.fromHex);
                const c = f.fromPos ? { cx: f.fromPos.x, cy: f.fromPos.y } : hc;
                if (!c) return null;
                const leg = (rise: number, delay: number, ox: number) => {
                  const elapsed = nowMs - f.at - delay;
                  if (elapsed < 0) return null;
                  const ax = c.cx + ox, ay = c.cy;
                  const bx = ax, by = ay - rise;
                  const spear = Math.hypot(f.to.x - bx, f.to.y - by);
                  const total = rise + spear;
                  const walked = total * (Math.min(elapsed, 650) / 650);
                  if (walked <= rise) return { x: ax, y: ay - walked, ang: -90 };
                  const k = spear > 0 ? (walked - rise) / spear : 1;
                  return { x: bx + (f.to.x - bx) * k, y: by + (f.to.y - by) * k, ang: Math.atan2(f.to.y - by, f.to.x - bx) * 180 / Math.PI };
                };
                const lead = leg(74, 0, 0);
                const follower = leg(64, 120, 9);
                return (
                  <g key={`bladeflight-${f.id}`} pointerEvents="none">
                    {lead && (
                      <g transform={`translate(${lead.x} ${lead.y}) rotate(${lead.ang})`}>
                        <image href={glyphBlade} x={-14} y={-14} width={28} height={28} style={{ filter: "drop-shadow(0 0 6px rgba(255,215,120,0.85))" }} />
                      </g>
                    )}
                    {follower && (
                      <g transform={`translate(${follower.x} ${follower.y}) rotate(${follower.ang})`}>
                        <image href={glyphBlade} x={-10} y={-10} width={20} height={20} style={{ filter: "drop-shadow(0 0 6px rgba(255,215,120,0.85))" }} />
                      </g>
                    )}
                  </g>
                );
              })}
              {/* THE CAST FLIGHTS (Nigel, 2026-10-24 — the
                  delivery): a written Blade flies straight
                  from the caster's standing point to the cast
                  target, head-forward on the same clock, and
                  lands where the planted glyph then stands. */}
              {(shared.bladeCasts ?? []).filter(f => nowMs - f.at < 700).map(f => {
                const road = Math.min(Math.max(nowMs - f.at, 0), 700) / 700;
                const x = f.fromPos.x + (f.to.x - f.fromPos.x) * road;
                const y = f.fromPos.y + (f.to.y - f.fromPos.y) * road;
                const heading = Math.atan2(f.to.y - f.fromPos.y, f.to.x - f.fromPos.x) * 180 / Math.PI;
                return (
                  <g key={`bladecast-${f.id}`} pointerEvents="none" transform={`translate(${x} ${y}) rotate(${heading})`}>
                    <image href={glyphBlade} x={-14} y={-14} width={28} height={28} style={{ filter: "drop-shadow(0 0 6px rgba(255,215,120,0.85))" }} />
                  </g>
                );
              })}
              {/* THE SPRING AND THE FLIGHT (the loot table
                  fix, 2026-10-25): a casual fell's take
                  springs out of the dissipated dark and
                  flies to the nearest Tender — each face on
                  its own short stagger along the straight
                  road, energy wearing its size law,
                  attunement the Root Sap at its hue. The
                  faces land in the shared Pack. */}
              {(shared.dropFx ?? []).filter(f => nowMs - f.at < 1250).map(f => (
                <g key={`dropfx-${f.id}`} pointerEvents="none">
                  {f.drops.map((d, i) => {
                    const t01 = Math.max(0, Math.min(1, (nowMs - f.at - i * 110) / 800));
                    if (t01 <= 0 || t01 >= 1) return null;
                    const ease = 1 - Math.pow(1 - t01, 2);
                    const x = f.from.x + (f.to.x - f.from.x) * ease;
                    const y = f.from.y + (f.to.y - f.from.y) * ease - Math.sin(t01 * Math.PI) * 26;
                    const s = dropSize(d);
                    return <image key={i} href={faceForDrop(d)} x={x - s / 2} y={y - s / 2} width={s} height={s} opacity={0.95} style={{ filter: filterForDrop(d) }} />;
                  })}
                </g>
              ))}
              <g className="shots-layer">
                {shots.map((shot) => {
                  const a = shot.from;
                  const b = shot.to;
                  const dist = Math.hypot(b.x - a.x, b.y - a.y);
                  const qx = (a.x + b.x) / 2;
                  const qy = shot.pierce ? (a.y + b.y) / 2 : Math.min(a.y, b.y) - (26 + dist * 0.38);
                  return (
                    <image
                      key={shot.id}
                      href={shot.img}
                      x={-13} y={-13} width={26} height={26}
                      className={shot.dark ? "dark-shot" : undefined}
                    >
                      <animateMotion dur="0.55s" fill="freeze" rotate="auto" path={`M ${a.x} ${a.y} Q ${qx} ${qy} ${b.x} ${b.y}`} />
                    </image>
                  );
                })}
              </g>
            </g>
            </svg>
            <div className="stage-view-btns">
              <button type="button" onClick={() => zoomBy(1.3)} aria-label="Zoom the map in">+</button>
              <button type="button" onClick={() => zoomBy(1 / 1.3)} aria-label="Zoom the map out">−</button>
              <button type="button" onClick={() => setView({ zoom: 1, pan: { x: 0, y: 0 } })} aria-label="Reset the map view">⌂</button>
            </div>
            </div>
            {/* THE TENDER CONTROLLER (Nigel, 2026-10-19): popped
                by tapping your own figure on a touch hand — the
                glide pad on the left, the wheel's button beside
                it. A separate overlay, so the zoom buttons and
                the map stay live under the other hand. */}
            {controllerOpen && you && (
              <div className="table-controller" role="group" aria-label="Tender controller">
                <div className="table-pad"
                  onPointerDown={(e) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture is a courtesy */ } onPadVec(e); }}
                  onPointerMove={(e) => { if (e.buttons & 1) onPadVec(e); }}
                  onPointerUp={padStop}
                  onPointerCancel={padStop}>
                  <div className="table-pad-knob" style={{ transform: `translate(${padKnob.x}px, ${padKnob.y}px)` }} />
                </div>
                <div className="table-ctl-side">
                  <button type="button" className="table-ctl-btn" onClick={() => openRadialAtMe(false)} aria-label="Open the glyph wheel">✦</button>
                  <button type="button" className="table-ctl-btn small" onClick={() => { padStop(); setControllerOpen(false); }} aria-label="Put the controller away">✕</button>
                </div>
              </div>
            )}
            {/* THE WHEEL, RESTORED (Nigel, 2026-10-20): the
                Proving Ground's radial itself — six branches on
                the outer ring, the open branch's entries fanned
                on the inner, the Weapon a sub-ring under the
                Ability — drawn as a screen overlay at the bloom
                point, in the Ground's own geometry and dress.
                Its entries run the belt's own acts; nothing here
                casts, wields or summons of its own. */}
            {radial && you && (() => {
              const pt = stageToClient(radial);
              if (!pt) return null;
              return (
                <GroundWheel cx={pt.x} cy={pt.y} tab={wheelTab} onTab={setWheelTab}
                  entries={buildWheelEntries()} caption={wheelCaption()}
                  pinnedKeys={hotbarKeys} onTogglePin={toggleHotbar} onDropKey={dropToHotbar}
                  onClose={() => setRadial(null)} evenFan={wheelTab === "awoken"} />
              );
            })()}
            {/* THE ORDERS WHEEL (Nigel, 2026-10-22): one
                Awokin's own wheel on its tap, the company's
                wheel on a drag-chosen band's release — the
                unit bar is retired behind it. */}
            {tableOrders && you && (() => {
              const entries = buildTableOrdersEntries(tableOrders.ids);
              if (!entries.length) return null;
              const single = tableOrders.ids.length === 1
                ? shared.field.find(u => u.cardId === tableOrders.ids[0])
                : null;
              return (
                <GroundWheel cx={tableOrders.x} cy={tableOrders.y} tab="awoken" onTab={() => {}}
                  entries={entries}
                  caption={single
                    ? `${single.name} — its orders: pick one and it is obeyed; March arms the tap on the land`
                    : `The company — ${tableOrders.ids.length} chosen: March · Follow, obeyed at once`}
                  pinnedKeys={[]} onTogglePin={() => {}} onDropKey={() => {}}
                  onClose={() => setTableOrders(null)} ordersMode />
              );
            })()}
            {/* THE HOTBAR: what the wheel and the hand locked
                onto the belt. A tap runs the locked thing's own
                act; a right-click looses the slot. While the
                wheel stands open the belt shows itself (with a
                dashed landing slot) so an entry can be dragged
                onto it, as the Ground teaches. */}
            {you && (hotbarKeys.length > 0 || radial) && (
              <div className={`table-hotbar${coarsePointer() ? " touch" : ""}`} role="toolbar" aria-label="Your hotbar" data-groundwheel-hotbar="table">
                {hotbarKeys.map(key => {
                  const m = hotbarMeta(key);
                  return (
                    <button type="button" key={key} className={`table-slot${m.dim ? " dim" : ""}${m.lit ? " lit" : ""}`} title={m.title}
                      onClick={() => actHotbar(key)}
                      onContextMenu={(e) => { e.preventDefault(); toggleHotbar(key); }}>
                      {m.img ? <img src={m.img} alt="" /> : <span className="table-slot-emoji">{m.emoji}</span>}
                      <span className="table-slot-label">{m.label.split("✦").map((part, i) => i === 0 ? part : <span key={i}><span className="spark-glow">✦</span>{part}</span>)}</span>
                    </button>
                  );
                })}
                {radial && hotbarKeys.length < HOTBAR_MAX && <span className="gw-drop-slot" aria-hidden="true">＋</span>}
              </div>
            )}
            {shared.campaign?.stage && !shared.battle.active && !stageHidden && (
            <div className="stage-overlay" role="region" aria-label="The Storytender's Stage">
              {shared.campaign.stage.imageUrl && <img className="stage-img" src={shared.campaign.stage.imageUrl} alt="" />}
              <div className="stage-body">
                <h3>{shared.campaign.stage.title}</h3>
                {shared.campaign.stage.text && <p>{shared.campaign.stage.text}</p>}
                <button className="table-btn" onClick={() => setStageHidden(true)}>⚔ To the field</button>
              </div>
            </div>
          )}
          <div className="field-caption">
              <strong>The star-seed</strong> — fallen light, rooted in cracked ground.
              The Bastion is what the party will build around it. Cast from your
              roster onto the field; when the party stands ready, begin the Unraveling.
              {shared.seed && (
                <>{" "}It grows by feeding alone — while the Tender herself stands on its hex, it feeds from her purse.
                {shared.seed.level >= 3
                  ? <> It stands a <strong>Beacon of Light</strong> — no dark is born on the ground around it.</>
                  : shared.seed.level === 2
                    ? <> It stands a <strong>Sapling of Light</strong> — fed {shared.seed.fedEnergy} of {shared.seed.nextStageAt} toward the Beacon.</>
                    : <> Fed {shared.seed.fedEnergy} of {shared.seed.nextStageAt} toward the Sapling.</>}
                </>
              )}
            </div>
            {placing && (
              <div className="placing-bar">
                <span className="placing-text">
                  {placing.kind === "attune" && <>Attuning with <strong>{placing.root}</strong> — tap ground {you?.storytender ? <>anywhere on the field</> : <>within your reach — your hex and its ring{(you?.attuneReach ?? 0) > 0 ? <> and {you?.attuneReach} ring{(you?.attuneReach ?? 0) > 1 ? "s" : ""} more by your skill</> : null}</>} to lay a {placing.root} point on it — 1 point of {placing.root} from your pool ({Math.floor(you?.pools?.[placing.root] ?? 0)} held). The point rests in the ground's own ledger; ground a rune or ward stands on takes the point the same way. Attune on until you set it down or the pool runs dry.</>}
                  {placing.kind === "heal" && <>Mending — tap one of <strong>your own standing Awokin</strong> to mend it (restores {you?.healAmount ?? 5} HP, ✦{healDef?.cost ?? 2}). The light stays in your hand — mend on until you set it down: a roll that falls short and an empty purse refuse that cast alone; the light stays readied.</>}
                  {placing.kind === "rune" && defs[placing.root]?.engine === "blade" && <>Writing the <strong>{defs[placing.root]?.forms[castHueFor(placing.root)] ?? defs[placing.root]?.root}</strong> — tap the ground to write it THERE, where you tap, within your reach — range alone gates the writing. Written, it waits ARMED: click a dark thing within two hexes of its ground and its blades rise and spear down into it from above. The writing stays in your hand — write on until you set it down: a roll that falls short and an empty purse refuse that cast alone; the writing stays readied.</>}
                  {placing.kind === "rune" && defs[placing.root]?.engine !== "blades" && defs[placing.root]?.engine !== "shardrain" && defs[placing.root]?.engine !== "blade" && <>Writing the <strong>{defs[placing.root]?.forms[castHueFor(placing.root)] ?? defs[placing.root]?.root}</strong> — tap a hex's ground to write it there. It springs the moment the dark stands on it. The writing stays in your hand — write on until you set it down: a roll that falls short and an empty purse refuse that cast alone; the writing stays readied.</>}
                  {placing.kind === "rune" && defs[placing.root]?.engine === "shardrain" && <>Writing the <strong>{defs[placing.root]?.forms[castHueFor(placing.root)] ?? defs[placing.root]?.root}</strong> — tap up to {defs[placing.root]?.numbers.maxHexes ?? 3} hexes to cover ({bladePicks.length}/{defs[placing.root]?.numbers.maxHexes ?? 3} chosen), then let it fall. When the dark stands on its ground, the sky opens once: the dice pool splits over every foe beneath it.</>}
                  {placing.kind === "rune" && defs[placing.root]?.engine === "blades" && <>Planting the <strong>{defs[placing.root]?.forms[castHueFor(placing.root)] ?? defs[placing.root]?.root}</strong> — tap up to {defs[placing.root]?.numbers.maxTargets ?? 3} hexes ({bladePicks.length}/{defs[placing.root]?.numbers.maxTargets ?? 3} chosen), then lay them.</>}
                  {placing.kind === "ward" && defs[placing.root]?.engine === "springleaf" && !wardAnchor && <>Planting the <strong>{defs[placing.root]?.forms[castHueFor(placing.root)] ?? defs[placing.root]?.root}</strong> — tap any hex to anchor the grove; it takes root on a neighbour.</>}
                  {placing.kind === "ward" && defs[placing.root]?.engine === "springleaf" && wardAnchor && <>Now tap a <strong>neighbouring hex</strong> — the grove takes root there, and its glow mends those who stand in it.</>}
                  {placing.kind === "ward" && defs[placing.root]?.engine === "blackgate" && <>Raising the <strong>{defs[placing.root]?.forms[castHueFor(placing.root)] ?? defs[placing.root]?.root}</strong> — tap the ground where you point: the Gate rises one hex-length from where you stand, in the direction of your tap. Range alone gates it — beyond your reach, it will not rise. The dark cannot pass it while it stands.</>}
                  {placing.kind === "ward" && defs[placing.root]?.engine !== "springleaf" && defs[placing.root]?.engine !== "blackgate" && !wardAnchor && <>Raising the <strong>{defs[placing.root]?.forms[castHueFor(placing.root)] ?? defs[placing.root]?.root}</strong> — tap any hex within your reach: the ward will stand on one of its edges. Range alone gates the cast now — but cursed ground eats what stands on it.</>}
                  {placing.kind === "ward" && defs[placing.root]?.engine !== "springleaf" && defs[placing.root]?.engine !== "blackgate" && wardAnchor && <>Now tap a <strong>neighbouring hex</strong> — the ward stands on the edge between the two. It stays in your hand — raise another edge when this one lands.</>}
                </span>
                {placing.kind === "rune" && (defs[placing.root]?.engine === "blades" || defs[placing.root]?.engine === "shardrain") && bladePicks.length > 0 && (
                  <button className="table-btn primary" onClick={() => {
                    const picks = [...bladePicks];
                    send({ type: "castRune", root: placing.root, hexes: picks });
                    beginCast(picks[0] ?? null);
                    setBladePicks([]);
                  }}>{defs[placing.root]?.engine === "shardrain" ? "Write the rain" : "Lay them"} · <span className="spark-glow">✦</span>{defs[placing.root]?.cost ?? 4}</button>
                )}
                {myCursed && placing.kind !== "attune" && <span className="curse-note">{curseNote} on this cast — you stand on cursed ground.</span>}
                <button className="table-btn" onClick={unloadCast}>{placing.kind === "attune" ? "Set the attuning down" : "Set the light down"}</button>
              </div>
            )}
            {/* The readied-summon bar and the unit bar stood
                here until 2026-10-22: the pick IS the cast
                now (no ground tap), and a chosen Awokin's
                orders ride its own wheel, opened on its tap.
                The tender bar below keeps its place. */}
            {selTender && you && !placing && (
              <div className="placing-bar unit-bar">
                <span className="placing-text">
                  🚶 <strong>You</strong> — WASD walks you, free as breathing. Right-click the land (or long-press) for your glyph wheel — it opens mid-glide and the glide rides on; tap a tile and you glide there. Where you arrive, your followers muster to you; the rest hold their ground. On a touch hand, tap your own figure for the controller pad; the wheel's ＋ pins lock workings, weapons and Awokin onto your hotbar.
                </span>
                {/* Attune stood in this bar as a row of
                    element buttons until 2026-10-21 — retired
                    by the Attune Ability law (Nigel: Attune is
                    an ABILITY on the wheel): the wheel's
                    Ability → Attune branch is the only door
                    now, and its reach is the hex and its ring,
                    not only the ground beneath him. */}
                <button className="table-btn" onClick={() => setSelTender(false)}>Done</button>
              </div>
            )}
            <div className="battle-bar">
              {shared.battle.active ? (
                <span className="battle-status">{shared.campaign
                  ? <>🌑 Wave {shared.battle.wave} — {shared.dark.length} of the dark stand · round {shared.round}</>
                  : <>🌑 The dark presses in — {shared.dark.length} of the dark stand · round {shared.round}</>}</span>
              ) : shared.campaign ? (
                <>
                <span className="battle-status">
                  {shared.campaign.over === "fallen"
                    ? "🌑 The Bastion has fallen — this campaign is ended by the enemy's right. A new campaign opens at the door."
                    : shared.campaign.over === "ended"
                      ? "🏠 The campaign has turned home — its growth goes with you. A new campaign opens at the door."
                      : <>📖 A campaign table — {shared.campaign.storytenderName ? <>{shared.campaign.storytenderName} deals the dark.</> : "awaiting a Storytender to deal."}{shared.campaign.seeded ? <> The bank ✦{shared.campaign.bank} binds you.</> : null}</>}
                </span>
                {!shared.campaign.over && !shared.campaign.storytenderName && you && (
                  <button className="table-btn battle-btn" onClick={() => send({ type: "stEnd" })}>🏠 Turn the campaign home</button>
                )}
                {/* THE STORYTELLER'S SEAT (Campaign Build 1): the
                    strip names the seat's holder — or that it
                    stands unclaimed — and who has been granted
                    the panel. The claim button shows only to a
                    seated participant while the seat is
                    unclaimed; the grant buttons only to the
                    holder. The console itself is Build 2. */}
                {!shared.campaign.over && (
                  <span className="battle-status">
                    📖 Storyteller: {shared.campaign.storytellerKey ? (shared.campaign.storytenderName ?? "claimed") : "unclaimed"}
                    {(shared.campaign.panelAccess ?? []).length > 0 && (
                      <> · panel open to {(shared.campaign.panelAccess ?? []).map(k => shared.players.find(p => p.key === k)?.name ?? k).join(", ")}</>
                    )}
                  </span>
                )}
                {!shared.campaign.over && !shared.campaign.storytellerKey && you && (
                  <button className="table-btn battle-btn" onClick={() => send({ type: "claimStoryteller" })}>📖 Claim the Storyteller's seat</button>
                )}
                {!shared.campaign.over && you && shared.campaign.storytellerKey === you.key && shared.players.filter(p => p.key !== you.key).map(p => {
                  const granted = (shared.campaign?.panelAccess ?? []).includes(p.key);
                  return (
                    <button key={p.key} className="table-btn battle-btn" onClick={() => send({ type: granted ? "revokePanel" : "grantPanel", targetKey: p.key })}>
                      {granted ? `📖 Close the panel to ${p.name}` : `📖 Open the panel to ${p.name}`}
                    </button>
                  );
                })}
                </>
              ) : you ? (
                <>
                {shared.bastion ? (
                  <div className="bastion-banner">
                    ⚔ {shared.bastion.kind.toUpperCase()} — {shared.bastion.hostName}'s call · One pool ✦{shared.bastion.pool}/{shared.bastion.poolMax}
                    {shared.bastion.ambush ? " · Ambush: strikes +1" : ""}
                    {shared.bastion.resolved ? " · the day is decided" : shared.bastion.begun ? " · the battle is joined" : " · waiting for the host to begin"}
                    {!shared.bastion.begun && !shared.bastion.resolved && you?.yourCall?.id === shared.bastion.callId && (
                      <button className="table-btn primary battle-btn" onClick={() => send({ type: "startBastion" })}>⚔ Begin the {shared.bastion.kind}</button>
                    )}
                  </div>
                ) : you?.yourCall ? (
                  you.yourCall.joinKey && shared.room !== `call-${you.yourCall.joinKey.toLowerCase()}` ? (
                    <div className="bastion-banner">
                      📣 Your {you.yourCall.kind.toUpperCase()} call stands in its own room — key <strong>{you.yourCall.joinKey}</strong>. Sit there to claim it; friends enter the key to join you.
                      <button className="table-btn primary battle-btn" onClick={() => send({ type: "switchRoom", callKey: you.yourCall!.joinKey })}>🪑 Sit at your call</button>
                    </div>
                  ) : (
                    <div className="bastion-banner">
                      📣 Your {you.yourCall.kind.toUpperCase()} call stands — claim this room for it, and your friends' energy joins the pool.{you.yourCall.joinKey ? <> Key: <strong>{you.yourCall.joinKey}</strong></> : null}
                      <button className="table-btn primary battle-btn" onClick={() => send({ type: "claimBastion", callId: you.yourCall!.id })}>📣 Claim this room</button>
                    </div>
                  )
                ) : null}
                {you && !shared.bastion && (
                  <div className="bastion-banner">
                    🔑 Answering a friend's call? Enter their key — a bastion key, an ambush key, a siege key — and take your seat at their defence, Awokin in hand.
                    <input className="call-key-input" value={callKeyInput} onChange={e => setCallKeyInput(e.target.value.toUpperCase())} placeholder="KEY" maxLength={6} />
                    <button className="table-btn battle-btn" disabled={callKeyInput.trim().length < 4} onClick={() => send({ type: "switchRoom", callKey: callKeyInput.trim() })}>Answer the call</button>
                  </div>
                )}
                {/* THE BEGINNING-OF-WAVES BUTTON IS REMOVED
                    (Nigel, 2026-10-25): no hand begins the
                    free field's Unraveling — the dark enters
                    on its own, at intensity one, from the
                    furthest ring of the curse, and makes its
                    way in. There is no button here because
                    there is nothing to begin. */}
                </>
              ) : (
                <span className="battle-status">The field is at rest — the dark finds its own way in, in its own time.</span>
              )}
            </div>
          </div>
          <div className="tale" ref={taleRef} aria-label="The Tale — the session's log">
            {shared.tale.length === 0 && <p className="quiet">The Tale is unwritten. For now.</p>}
            {shared.tale.map((t, i) => (
              <p key={i} className="tale-line">
                <time>{new Date(t.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time> {t.text}
              </p>
            ))}
          </div>
        </section>

        <aside className="panel dark-panel">
          <h3>The Dark</h3>
          <div className="roster">
            {(shared.enemies.length ? shared.enemies : ROSTER.map(r => ({ ...r, art: null }))).map((r) => (
              <div key={r.name} className="roster-row">
                {r.name === "fray" ? (
                  <FrayFaceImg art={r.art ? { fray: { url: r.art, spriteId: 0 } } : null} alt={r.label} />
                ) : (
                  <img src={r.art ?? BUNDLED_ENEMIES[r.name as keyof typeof BUNDLED_ENEMIES]} alt={r.label} />
                )}
                <div>
                  <strong>{r.label}</strong>
                  <p>{r.note}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="quiet small">The whole roster. When the dealing begins, the dark is dealt from here — face-up, never a bare number.</p>
          {you && (
            <details className="notes">
              <summary>Your notes</summary>
              <textarea
                value={notesDraft}
                onChange={(e) => { setNotesDraft(e.target.value); setNotesDirty(true); }}
                rows={6}
                maxLength={8000}
                placeholder="Suspicions, names, half-remembered omens…"
                aria-label="Your personal notes"
              />
              <button
                className="mini-btn add"
                disabled={!notesDirty}
                onClick={() => { send({ type: "notes", text: notesDraft }); setNotesDirty(false); }}
              >
                Keep these notes
              </button>
              <p className="quiet small">Yours alone.</p>
            </details>
          )}
        </aside>
      </main>

      {/* THE BAG (the loot table fix, Nigel, ruled
          2026-10-25 18:46): the Backpack pinned on the
          right side under the beacon — the shared Pack's
          door. Every seat sees the Pack; a click claims an
          entry into your own inventory, purse or pools,
          and GIVE stands beside claim (ruled 09:48).
          Campaign rooms keep their own road and show no
          bag (their item system is their own, 19:27). */}
      {!shared.campaign && (
        <>
          <button
            type="button"
            className="bag-pin"
            title="The Pack — what the felled dark leaves behind"
            aria-label="The Pack"
            onClick={() => { setBagUp((v) => !v); if (!bagUp) refreshMyPack(); }}
          >
            <img src={BACKPACK_FACE} alt="" />
            {(shared.pack ?? []).length > 0 && <span className="bag-pin-badge">{(shared.pack ?? []).length}</span>}
          </button>
          {bagUp && (
            <div className="bag-pop" role="dialog" aria-label="The Pack">
              <div className="beacon-pop-head">
                <strong>🎒 The Pack</strong>
                <button type="button" className="beacon-x" aria-label="Close the Pack" onClick={() => setBagUp(false)}>✕</button>
              </div>
              {(shared.pack ?? []).length === 0 ? (
                <p className="beacon-line">Nothing waits — fell the dark, and what it leaves gathers here for every seat to see.</p>
              ) : (
                (shared.pack ?? []).map((e) => (
                  <div key={e.id} className="bag-row">
                    <img className="bag-face" src={faceForDrop(e)} alt="" style={{ width: dropSize(e), height: dropSize(e), filter: filterForDrop(e) }} />
                    <span className="bag-name">{e.name}</span>
                    <span className="bag-qty">{e.kind === "attunement" ? Math.round(e.qty * 10) / 10 : `×${e.qty}`}</span>
                    <button type="button" className="table-btn" onClick={() => { send({ type: "claimPack", entryId: e.id }); window.setTimeout(refreshMyPack, 500); }}>Claim</button>
                    <button type="button" className="table-btn" onClick={() => setGiveFor(giveFor === e.id ? null : e.id)}>Give</button>
                    {giveFor === e.id && (
                      <span className="bag-give">
                        {shared.players.filter((p) => p.key !== you?.key && !p.storytender).map((p) => (
                          <button key={p.key} type="button" className="table-btn" onClick={() => { send({ type: "givePack", entryId: e.id, targetKey: p.key }); setGiveFor(null); window.setTimeout(refreshMyPack, 500); }}>{p.name}</button>
                        ))}
                      </span>
                    )}
                  </div>
                ))
              )}
              <h4>Your inventory</h4>
              {myPack === null ? (
                <p className="beacon-line">Bind your Tender in the game, and what you claim rests here.</p>
              ) : myPack.stacks.length === 0 ? (
                <p className="beacon-line">Empty — claim the Pack's gatherings, and they rest here.</p>
              ) : (
                myPack.stacks.map((s) => (
                  <div key={s.key} className="bag-row">
                    <img className="bag-face small" src={faceForDrop({ kind: "item", itemKey: s.key, qty: s.qty })} alt="" />
                    <span className="bag-name">{s.name}</span>
                    <span className="bag-qty">×{s.qty}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* THE BEACON (Twelve #2): a small button pinned to the
          right side of the room — protection and hosting open
          from it as one popup (Nigel, 2026-10-24 19:05: "use
          beacon ui but small, pinned/locked on right side —
          protection + hosting as popups"). Campaign rooms keep
          their own ground and show no beacon. */}
      {!shared.campaign && (
        <>
          <button
            type="button"
            className={`beacon-pin${shared.hosted?.beacon.standing ? " lit" : ""}`}
            title={shared.hosted ? `The Beacon — ${shared.hosted.hostName}'s land` : "The Beacon — open your land here"}
            aria-label="The Beacon — protection and hosting"
            onClick={() => {
              setDoorPrivacy(shared.hosted?.privacy ?? you?.landDoor?.privacy ?? "public");
              setDoorWord("");
              setBeaconUp((v) => !v);
            }}
          >
            <img src={glyphBeacon} alt="" />
          </button>
          {beaconUp && (
            <div className="beacon-pop" role="dialog" aria-label="The Beacon">
              <div className="beacon-pop-head">
                <strong>🕯 The Beacon</strong>
                <button type="button" className="beacon-x" aria-label="Close the beacon" onClick={() => setBeaconUp(false)}>✕</button>
              </div>
              {shared.hosted ? (
                <>
                  <p className="beacon-line">
                    {shared.hosted.source === "homeland" ? (
                      <>This room stands on <strong>{shared.hosted.hostName}</strong>'s HOMELAND — the ground around their first seed, as it stands at home. Every change here counts back home, for real.</>
                    ) : (
                      <>This room stands on <strong>{shared.hosted.hostName}</strong>'s land — every change here counts on it, for real.</>
                    )}
                    {" "}The door is {shared.hosted.privacy === "password" ? "kept by a word" : "open to all"}.
                  </p>
                  <h4>Protection</h4>
                  <p className="beacon-line">
                    {shared.hosted.beacon.lit
                      ? shared.hosted.beacon.standing
                        ? "The light burns over this land — no dark can be dealt while it stands."
                        : "The light is lit, but its keeper is away — it stands over the land again when they return."
                      : "The beacon stands dark."}
                    {" "}Banked protection: {shared.hosted.beacon.bankMinutes} min.
                  </p>
                  {you?.landHost ? (
                    <>
                      <p className="beacon-line">
                        Your lighthouse purse: {you.beaconPurse?.shadow ?? 0} Shadow held against the burn — upkeep is 1 Shadow per 4 minutes lit, paid from it.
                      </p>
                      <button type="button" className="table-btn" onClick={() => send({ type: "beaconLight", lit: !(shared.hosted?.beacon.lit ?? false) })}>
                        {shared.hosted?.beacon.lit ? "Douse the beacon" : "Light the beacon"}
                      </button>
                      <h4>The door</h4>
                      <label className="door-label" htmlFor="beacon-privacy">Who may sit on your land</label>
                      <select id="beacon-privacy" className="door-input" value={doorPrivacy} onChange={(e) => setDoorPrivacy(e.target.value as "public" | "password")}>
                        <option value="public">Public — any Tender in the channel may sit</option>
                        <option value="password">Password — guests speak the table's word</option>
                      </select>
                      {doorPrivacy === "password" && (
                        <>
                          <label className="door-label" htmlFor="beacon-word">The table's word{you.landDoor?.hasPassword ? " (leave blank to keep the word it holds)" : ""}</label>
                          <input id="beacon-word" className="door-input" type="password" value={doorWord} onChange={(e) => setDoorWord(e.target.value)} maxLength={64} autoComplete="off" placeholder="Four letters or more" />
                        </>
                      )}
                      <button type="button" className="table-btn" onClick={() => send({ type: "beaconDoor", privacy: doorPrivacy, password: doorWord || undefined })}>
                        Keep the door so
                      </button>
                      <button type="button" className="table-btn ghost" onClick={() => send({ type: "beaconClose" })}>
                        Fold my land away
                      </button>
                    </>
                  ) : (
                    <p className="beacon-line quiet">The light and the door are {shared.hosted.hostName}'s to tend. You are a guest on their land — your company, purse and Pack are your own, and your fells pay you.</p>
                  )}
                </>
              ) : (
                <>
                  <p className="beacon-line">This room stands on the instanced world — no Tender's land is open here.</p>
                  {you?.landDoor ? (
                    <>
                      <h4>Open your land</h4>
                      <p className="beacon-line">Your land takes this room's ground: guests who sit here fight its dark and change it for real, both ways — its starseed grows by whoever feeds it, and its lighthouse is your own.</p>
                      <label className="door-label" htmlFor="beacon-privacy">Who may sit on your land</label>
                      <select id="beacon-privacy" className="door-input" value={doorPrivacy} onChange={(e) => setDoorPrivacy(e.target.value as "public" | "password")}>
                        <option value="public">Public — any Tender in the channel may sit</option>
                        <option value="password">Password — guests speak the table's word</option>
                      </select>
                      {doorPrivacy === "password" && (
                        <>
                          <label className="door-label" htmlFor="beacon-word">The table's word{you.landDoor.hasPassword ? " (leave blank to keep the word it holds)" : ""}</label>
                          <input id="beacon-word" className="door-input" type="password" value={doorWord} onChange={(e) => setDoorWord(e.target.value)} maxLength={64} autoComplete="off" placeholder="Four letters or more" />
                        </>
                      )}
                      <button type="button" className="table-btn" onClick={() => send({ type: "beaconOpen", privacy: doorPrivacy, password: doorWord || undefined })}>
                        Open my land here
                      </button>
                    </>
                  ) : (
                    <p className="beacon-line quiet">Bind your Tender at the Table, and a land of your own waits to be opened.</p>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}

      <footer className={you?.storytender ? "handzone st-zone" : you ? `handzone drawer${handUp ? " risen" : ""}` : "handzone plain"}>
        {you?.storytender ? (
          <div className="st-panel">
            <div className="st-head">
              <strong>📖 The Storytender's Panel</strong>
              <span className="quiet small">
                The bank ✦{you.storytender.bank}
                {you.storytender.seeded ? " — every cast draws from it; every harvest joins it." : " — it seeds at your first dealing, from the party's poured stakes."}
                {you.storytender.over ? " This campaign is over." : ""}
              </span>
            </div>
            <div className="st-cols">
              <div className="st-col">
                <h4>Compose the dark</h4>
                {(shared.enemies.length ? shared.enemies : ROSTER.map(r => ({ ...r, art: null }))).map((r) => (
                  <div key={r.name} className="st-roster-row">
                    <span>{r.label}</span>
                    <button className="mini-btn add" onClick={() => send({ type: "stAdd", kind: r.name })}>Hold +</button>
                  </div>
                ))}
                <div className="st-reserve">
                  {you.storytender.reserve.length === 0 && <span className="quiet small">Nothing held back. The party sees none of this — the Dark is sealed until you deal.</span>}
                  {you.storytender.reserve.map((k, i) => (
                    <button key={i} className="mini-btn" title="Release this piece" onClick={() => send({ type: "stRemove", index: i })}>
                      {(shared.enemies.find(e => e.name === k)?.label ?? k)} ✕
                    </button>
                  ))}
                </div>
                <p className="quiet small">Threat held ⚔{you.storytender.reserveThreat} · the party stands ⚔{you.storytender.partyPower} — a fairness gauge, advice, not a leash.</p>
                <div className="st-actions">
                  <button className="table-btn primary" disabled={!you.storytender.reserve.length || !!you.storytender.over} onClick={() => send({ type: "stDeal" })}>🌑 Deal the dark</button>
                  <button className="table-btn" disabled={!you.storytender.reserve.length} onClick={() => send({ type: "stClear" })}>Clear</button>
                </div>
              </div>
              <div className="st-col">
                <h4>The telling</h4>
                <form className="packing-form" onSubmit={(e) => { e.preventDefault(); if (stNarrate.trim()) { send({ type: "stNarrate", text: stNarrate.trim() }); setStNarrate(""); } }}>
                  <input value={stNarrate} onChange={(e) => setStNarrate(e.target.value)} maxLength={500} placeholder="Speak into the Tale…" aria-label="Narration for the Tale" />
                  <button className="mini-btn add" type="submit">Tell</button>
                </form>
                <h4>The scene</h4>
                <input className="door-input st-input" value={stSceneTitle} onChange={(e) => setStSceneTitle(e.target.value)} maxLength={80} placeholder="Scene title — the place, named" aria-label="Scene title" />
                <textarea className="st-textarea" value={stSceneText} onChange={(e) => setStSceneText(e.target.value)} maxLength={1000} rows={3} placeholder="What the party sees…" aria-label="Scene text" />
                <input className="door-input st-input" value={stSceneImg} onChange={(e) => setStSceneImg(e.target.value)} maxLength={600} placeholder="Image address (https://…) — optional" aria-label="Scene image address" />
                <div className="st-actions">
                  <button className="table-btn" onClick={() => send({ type: "stScene", title: stSceneTitle, text: stSceneText, imageUrl: stSceneImg })}>🖼️ Set the scene</button>
                </div>
                <h4>The sky</h4>
                <form className="packing-form" onSubmit={(e) => { e.preventDefault(); send({ type: "stSky", text: stSkyText.trim() }); }}>
                  <input value={stSkyText} onChange={(e) => setStSkyText(e.target.value)} maxLength={160} placeholder="Name the weather over this place…" aria-label="The sky over the scene" />
                  <button className="mini-btn add" type="submit">Turn</button>
                </form>
              </div>
              <div className="st-col">
                <h4>Mercy &amp; pacing</h4>
                <div className="st-actions">
                  <button className="table-btn" onClick={() => send({ type: "stRest" })}>🛌 Call a rest</button>
                  <button className="table-btn" onClick={() => send({ type: "stAdjourn" })}>🌙 Adjourn</button>
                </div>
                {shared.players.filter(p => p.fallen).map(p => (
                  <div key={p.key} className="st-roster-row">
                    <span>💀 {p.name} has fallen</span>
                    <button className="mini-btn add" onClick={() => send({ type: "stRevive", playerKey: p.key })}>Return at half</button>
                  </div>
                ))}
                {shared.dark.length > 0 && <p className="quiet small">Mercy on the dark: tap a standing foe's hex is the field's business — to lift one early, use its hex below.</p>}
                {shared.dark.map(e => (
                  <div key={e.id} className="st-roster-row">
                    <span>{e.label} — ❤{e.hp}/{e.maxHp}</span>
                    <button className="mini-btn" onClick={() => send({ type: "stDissipate", hex: e.hex, id: e.id })}>Dissipate</button>
                  </div>
                ))}
                <div className="st-actions">
                  <button className="table-btn" disabled={!!you.storytender.over} onClick={() => send({ type: "stEnd" })}>🏠 End the campaign — divide the bank</button>
                </div>
                <p className="quiet small">Ending by choice divides what remains evenly. If the line falls, no hand can cast, and the bank bleeds dry — the Bastion falls, and the enemy ends it instead.</p>
              </div>
            </div>
          </div>
        ) : you ? (
          <>
            <button type="button" className="hand-grab" onClick={() => setHandUp(v => !v)} aria-expanded={handUp} aria-label={handUp ? "Lower your satchel" : "Raise your satchel"}>
              <span className="grab-line" aria-hidden="true" />
              {handUp ? "▾ your satchel" : "▴ your satchel"}
            </button>
            <div className="satchel-head">
              <div className="satchel-tabs" role="tablist" aria-label="Your satchel">
                {(["I", "IV"] as const).map((t) => (
                  <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
                    {t}{t === "I" ? " · Awokin" : " · Potions & Items"}
                  </button>
                ))}
              </div>
              <span className="my-energy" title="Your energy for this sitting — calculated from your whole roster by the game's law"><span className="spark-glow">✦</span> {you.energy ?? 0}<span className="my-energy-max"> / {you.maxEnergy ?? 0}</span></span>
              <span className="my-band" title="Your travelling company — how many of your Awokin may stand on the field at once. Your level widens it (three at Lv 1, four at Lv 3, the true five at Lv 6), and the Muster roads widen it further: the Escort, the Pennant, the Retinue, the Whole Muster.">⚑ {you.band ?? 0}<span className="my-energy-max"> / {you.bandCap ?? 5}</span></span>
              <button className="dice-btn" onClick={() => setDiceOpen(true)} aria-label="Open your dice">🎲 Your dice</button>
            </div>
            {notice && <p className="notice-line">{notice}</p>}
            {tab === "I" && (
              <>
                {/* THE HAND IS RETIRED (Nigel, 2026-10-21 — the
                    wheel law): no card row stands here any more.
                    Summoning rides the action wheel's Awoken
                    branch; this tab keeps the party's standing
                    and the kept-back company's names. */}
                <p className="quiet small">Summoning rides the <strong>action wheel</strong> now: open its Awoken branch, choose a member of your company, then tap ground at your side — cursed ground answers too, but while <em>you</em> stand in the curse, every cast you make takes −3.</p>
                {(you.elsewhere ?? []).length > 0 && (
                  <div className="hand-elsewhere">
                    <p className="quiet small">Keeping other posts — one body stands in one place, so these are not at this Table:</p>
                    <div className="elsewhere-row">
                      {(you.elsewhere ?? []).map((e, i) => (
                        <span key={`${e.name}-${i}`} className="elsewhere-chip" data-element={e.element}
                          title={e.where === "staged"
                            ? `${e.name} waits staged at your bastion — it stands ready there, and an instance claimed from the bastion brings it to your wheel.`
                            : `${e.name} stands on your homeland field — it cannot also stand here. Set it home there, and it answers your wheel at your next seat.`}>
                          {e.name} · {e.where === "staged" ? "🏯 staged at your bastion" : "🏠 on your homeland field"}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {you.partyView && (
                  <div className="hand-party">
                    <p className="quiet small">Your party at this Table — {you.partyView.members.length} of {you.partyView.cap} spots filled. The wheel's Awoken branch calls from this party.</p>
                    <div className="elsewhere-row">
                      {you.partyView.members.map((m) => (
                        <span key={m.awakenedId} className="elsewhere-chip party-chip"
                          title={m.standing === "field" ? `${m.name} stands on the field — a member standing when the battle ends stays standing.` : m.standing === "ready" ? `${m.name} stands in your party, ready at the wheel — call it by the summon cast.` : `${m.name} stands in your party but keeps another post — it cannot be called to this Table.`}>
                          👣 {m.name} · {m.standing === "field" ? "⚔ on the field" : m.standing === "ready" ? "🎡 ready at the wheel" : "keeps its post"}
                        </span>
                      ))}
                      {you.partyView.incoming.map((i) => {
                        const left = Math.max(0, i.arrivesAt - Date.now());
                        const mm = Math.floor(left / 60000);
                        const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
                        return (
                          <span key={i.awakenedId} className="elsewhere-chip party-chip incoming"
                            title={`${i.name} is on its way to your party — called in as a reinforcement; it joins when the road completes, and only while the battle still stands. If the battle ends first, the ✦${i.cost} paid for its road comes back whole.`}>
                            🚶 {i.name} · on its way — {mm}:{ss} left
                          </span>
                        );
                      })}
                    </div>
                    {shared.battle.active && you.partyView.openSpots > 0 && (
                      <p className="quiet small">{you.partyView.openSpots} spot{you.partyView.openSpots === 1 ? "" : "s"} open. Fill one from the Party tab of your Zodiac — the fill lands at once now, even mid-battle, and costs nothing — or summon straight from the wheel's Awoken branch: any Awokin in your deck can be cast from the branch's deck window, and a landed summon follows you and stands in your party from that act.</p>
                    )}
                    {shared.battle.active && you.partyView.openSpots === 0 && (
                      <p className="quiet small">Your party stands full — no spot stands open for a fill.</p>
                    )}
                    {!shared.battle.active && (
                      <p className="quiet small">Between battles, fill an open spot from the Party tab of your Zodiac — there the fill lands at once, and costs nothing.</p>
                    )}
                  </div>
                )}
                {you.bound ? (
                  <p className="quiet small">The company of <strong>{you.bound}</strong> — your party, callable from the action wheel's Awoken branch, sent to you alone.</p>
                ) : (
                  <div className="bind-strip">
                    <p className="quiet small">Your company — sent to you alone. These are stand-ins: bind your Tender and your own Awokin take their places at your wheel, true faces and all. Take a code in the game (the 🎲 The Table panel at the screen's right edge), then spend it here.</p>
                    <div className="bind-row">
                      <input
                        className="door-input"
                        value={bindInput}
                        onChange={(e) => setBindInput(e.target.value.toUpperCase())}
                        maxLength={6}
                        placeholder="Binding code"
                        aria-label="Binding code"
                      />
                      <button className="table-btn primary" disabled={bindInput.trim().length < 6} onClick={() => void submitBind()}>Bind my Tender</button>
                      {bindMsg.startsWith("Bound") && (
                        <button className="table-btn" onClick={() => window.location.reload()}>Re-seat now</button>
                      )}
                    </div>
                    {bindMsg && <p className="quiet small">{bindMsg}</p>}
                  </div>
                )}
              </>
            )}
            {tab === "IV" && (
              <div className="arts-list">
                <p className="quiet">Potions and carried things will gather here as the world deals them. What you write down yourself rides in your packing, under the Party.</p>
              </div>
            )}
          </>
        ) : (
          <p className="watcher-line">You are watching the Table. Bind in the game to take a seat — the shared zones are yours to see; the companies are not.</p>
        )}
      </footer>

      {diceOpen && (
        <div className="dice-overlay" role="dialog" aria-label="Your dice">
          <div className="dice-pop">
            <div className="dice-head">
              <strong>Your dice</strong>
              <button className="mini-btn" onClick={() => setDiceOpen(false)} aria-label="Close the dice">✕</button>
            </div>
            <div className="dice-grid">
              {DICE.map((d) => (
                <button
                  key={d}
                  className="die-btn"
                  onClick={() => { send({ type: "roll", sides: d }); setDiceOpen(false); }}
                >
                  <DieGlyph sides={d} /><span>d{d}</span>
                </button>
              ))}
            </div>
            <p className="quiet small">Rolled by the referee, in the open, and written into the Tale.</p>
          </div>
        </div>
      )}
    </div>
  );
}
