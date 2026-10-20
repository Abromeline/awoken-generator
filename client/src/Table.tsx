/**
 * THE TABLE — the Discord Activity's room
 * (design of record: ~/workspace/discord-voice/TABLE-DESIGN.md).
 *
 * P0 — THE EMPTY TABLE: the room itself, whole — Sky Bar, Party,
 * Battleground with the star-seed at its heart, the Dark, the private
 * hand with its tabbed satchel, the dice pop-up, the Tale, personal
 * notes and the typed inventory — with named players and private test
 * hands proving the plumbing. Dealing, summoning and referee combat
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
import { BUNDLED_ENEMIES } from "./enemyArt";
import { TENDER_CLASSES, TENDER_CLASS_ORDER, tenderDirOf, tenderPose, tenderCastPose, CAST_MS, type TenderClassId, type TenderDir } from "./tenderArt";
import { WEAPONS, WEAPON_ORDER, weaponImg, shieldImg, type WeaponKey } from "./weaponArt";
import { BUNDLED_TERRAIN } from "./terrainArt";
import cursedImg from "./assets/terrain-iso/cursed-v3.png";
import battlegroundBg from "./assets/battleground-bg.jpg";
import { WORKING_DEFS, HUE_ORDER } from "./workingsData";
import { coarsePointer, loadHotbar, saveHotbar, toggleHotbarKey } from "./hotbar";
import glyphEngine from "./assets/glyphs/engine.png";
import glyphStandard from "./assets/glyphs/standard.png";
import glyphBeacon from "./assets/glyphs/beacon.png";
import glyphBlade from "./assets/glyphs/blade.png";
import glyphBlades from "./assets/glyphs/blades.png";
import glyphCoil from "./assets/glyphs/coil.png";
import { ANIMATED_GLYPH, PROJECTILE_GIF } from "./effects";

const GLYPHS: Record<string, string> = { seal: ANIMATED_GLYPH.seal, engine: glyphEngine, standard: glyphStandard, trees: ANIMATED_GLYPH.trees, beacon: glyphBeacon, lattice: ANIMATED_GLYPH.lattice, blade: glyphBlade, blades: glyphBlades, shard: ANIMATED_GLYPH.shard, coil: glyphCoil, shardrain: ANIMATED_GLYPH.shardrain };

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
const HUE_LABELS: Record<string, string> = { unaligned: "Unaligned", tide: "Tide", sky: "Sky", stone: "Stone", root: "Root", fire: "Fire" };

interface WorkingView {
  id: string; kind: "ward" | "rune" | "grove"; root: string; name: string; hue: string;
  engine?: string;
  ownerKey: string; ownerName: string;
  hex: string | null; hexA: string | null; hexB: string | null;
  hp: number; stops: number; charges: number;
  /** GROVES (the Springleaf, Phase C): centre in stage px,
   *  radius, and expiry — the grove is drawn from these. */
  pos?: { x: number; y: number } | null;
  radiusPx?: number;
  expiresAt?: number;
  mother?: boolean;
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
  curseHp: number;
  curseMaxHp: number;
  landing: string | null;
}

interface FieldUnitView {
  hex: string;
  cardId: string;
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
    stage: { title: string; text: string; imageUrl: string | null; at: number } | null;
    deals: number;
  } | null;
  sky: { mood: string; description: string; endsAt: string | null };
  round: number;
  threat: number;
  players: { key: string; name: string; handCount: number; energy: number; maxEnergy: number; tenderHp: number; maxTenderHp: number; fallen: boolean; storytender?: boolean; hex: string | null; pos: { x: number; y: number } | null; tgt: { x: number; y: number } | null; moving: boolean; weaponKills?: number; castAt?: number; away?: boolean; classKey?: string | null; weaponKey?: string | null; weaponLevel?: number; weaponElement?: string | null; weaponDepth?: number; weaponManifest?: boolean; weaponSignature?: boolean }[];
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
  battle: { active: boolean; wave: number };
  strikes?: { id?: number; at?: number; from: { x: number; y: number }; to: { x: number; y: number }; element: string | null; side: "light" | "dark"; hit: boolean; killed: boolean; weapon: string | null; pierce?: boolean; copy?: boolean }[];
  /** MANIFEST (Phase C): live copies of a Tender's weapon,
   *  orbiting their figure until they fade. */
  manifests?: { ownerKey: string; weaponKey: string; count: number; expiresAt: number }[];
  bastion?: {
    callId: number; kind: string; hostName: string; ambush: boolean;
    pool: number; poolMax: number; begun: boolean; resolved: boolean; size: number;
  } | null;
}

interface YouState {
  key: string;
  name: string;
  hand: TableCard[];
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

type Phase = "boot" | "door" | "connecting" | "seated" | "lost" | "error";

const DICE = [4, 6, 8, 10, 12, 20, 100];

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
const SEED_TILE_ID = "0,0";
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

const ROSTER = [
  { name: "fray", label: "Fray", note: "Small ink splatters. Weak alone, dangerous in groups." },
  { name: "unraveler", label: "Unraveler", note: "Looming ink mass. Hunts the strongest standing." },
  { name: "hollow", label: "Hollow", note: "Pure void. Drains energy instead of blood." },
  { name: "tangle", label: "Tangle", note: "Knotted thorns. Pins one Awokin where it stands." },
] as const;

function PourRow({ hue, setHue }: { hue: string; setHue: (h: string) => void }) {
  return (
    <div className="pour-row">
      <span className="pour-label">Pour the light as:</span>
      {HUE_ORDER.map((hu) => (
        <button key={hu} className={`hue-chip${hue === hu ? " active" : ""}`} onClick={() => setHue(hu)} title={`Pour ${HUE_LABELS[hu]}`}>
          <span className="hue-dot" style={{ background: HUE_GLOWS[hu] }} />{HUE_LABELS[hu]}
        </button>
      ))}
    </div>
  );
}

export default function Table() {
  const [phase, setPhase] = useState<Phase>("boot");
  const [bootStep, setBootStep] = useState("Waking the Table…");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [devMode, setDevMode] = useState(false);
  const [devName, setDevName] = useState("");
  const [shared, setShared] = useState<SharedState | null>(null);
  const [you, setYou] = useState<YouState | null>(null);
  const [tab, setTab] = useState<"I" | "II" | "III" | "IV">("I");
  // The hand drawer (Phase A room, Nigel 2026-10-18): the hand
  // rests half off-screen and rises when reached for.
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
  // The workshop-chosen card border (Nigel, 2026-10-17) wraps the
  // hand cards here too — the same public read the game consumes.
  const [cardBorder, setCardBorder] = useState<{ imageUrl: string | null; fit: string | null }>({ imageUrl: null, fit: null });
  useEffect(() => {
    let live = true;
    fetch("/api/getCardBorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then((r) => r.json())
      .then((d) => { if (live && d && typeof d === "object") setCardBorder({ imageUrl: d.imageUrl ?? null, fit: d.fit ?? null }); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  // The Grimoire, read at mount (the same public read the game
  // uses): names, costs, blurbs, and glyph assignments all come
  // from the workshop's book. The referee refreshes its own
  // copy on every message, so a tuning lands within a cast.
  const [grimoire, setGrimoire] = useState<any | null>(null);
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
        glyph: glyph ? (glyph.imageUrl ?? (glyph.assetKey ? GLYPHS[glyph.assetKey] ?? null : null)) : null,
        cost: sp.cost, blurb: sp.blurb, forms: sp.forms ?? {}, numbers: sp.numbers ?? {},
      };
    }
    return out;
  })();
  const healDef = Object.values(defs).find((d) => d.engine === "heal");
  // The Written Light: what is being laid, in which poured hue,
  // and the placement steps (a ward wants an anchor hex, then a
  // neighbour; the Three Blades gather up to three hexes).
  const [pourHue, setPourHue] = useState<string>("unaligned");
  // The Pour (Nigel, 2026-10-17): elemental points fed into the
  // working being placed, chosen in the placing bar.
  const [pourPts, setPourPts] = useState(0);
  const [placing, setPlacing] = useState<{ kind: "ward" | "rune" | "heal"; root: string } | null>(null);
  const [pushTargetId, setPushTargetId] = useState<string | null>(null);
  const [pushHue, setPushHue] = useState<string>("root");
  const [pushPts, setPushPts] = useState(0);
  const [wardAnchor, setWardAnchor] = useState<string | null>(null);
  const [bladePicks, setBladePicks] = useState<string[]>([]);
  const [callKeyInput, setCallKeyInput] = useState("");
  // VISUALIZED COMBAT (Nigel, 2026-10-17): the referee reports
  // every strike of the round it just resolved; the Table
  // flies them — the attacker's element from its hex to its
  // mark's, the dark answering in a darkened bolt.
  const [shots, setShots] = useState<{ id: number; from: { x: number; y: number }; to: { x: number; y: number }; img: string; dark: boolean; hit: boolean; killed: boolean; idx: number; pierce?: boolean }[]>([]);
  const shotIdRef = useRef(0);
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
    const ids = new Set(fresh.map(f => f.id));
    const t = setTimeout(() => setShots(prev => prev.filter(x => !ids.has(x.id))), 1500);
    return () => clearTimeout(t);
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
  // The stage clock: the stage ticks gently while anyone
  // watches, so smoothed figures lerp across server ticks.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 150);
    return () => clearInterval(t);
  }, []);
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
  // Each seated tender's walk, kept off the wire: where their
  // figure stands, and the commute it is walking, if any. The
  // server never hears of it — a figure's place is read off the
  // room's own state (their company's ground, or a rim post).
  // You, selected: your own figure takes orders like an
  // Awokin — tap a tile and you glide there yourself.
  const [selTender, setSelTender] = useState(false);
  // THE GLYPH WHEEL (Nigel, 2026-10-19): right-click (or a
  // long press, for the iPad) opens a Zodiac-fashion radial of
  // your castable workings — glyphs only, no lard text. Left
  // click chooses the glyph; the next left clicks choose the
  // target, by the placing laws that already govern casting.
  const [radial, setRadial] = useState<{ x: number; y: number } | null>(null);
  // The wheel's ABILITY sub-ring (Phase C): the four weapons to
  // wield between, and Manifest — opened from the main ring's
  // ABILITY entry, in the same geometry and language.
  const [radialAbility, setRadialAbility] = useState(false);
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
  // WASD GLIDES THE TENDER (Phase B): the lattice's own
  // compass — Q/W/E across the top arc, A/S/D below it,
  // arrows riding the same steps. Held keys sum into one
  // direction; the tender glides continuously toward a point
  // 420px that way, refreshed every 120ms while keys are held.
  // Free, as his own walking is; ignored while placing, or
  // while he has fallen. The wheel no longer stills him
  // (Nigel, 2026-10-19): right-click mid-glide opens the
  // radial, and the glide rides on under it — the menu comes
  // to the Tender, not the Tender to the menu.
  const GLIDE_STEPS: Record<string, [number, number]> = {
    KeyW: [0, -1], KeyS: [0, 1], KeyQ: [-1, 0], KeyE: [1, -1], KeyA: [-1, 1], KeyD: [1, 0],
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, -1],
  };
  const heldKeysRef = useRef<Set<string>>(new Set());
  const glideTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const myPosRef = useRef<{ x: number; y: number } | null>(null);
  myPosRef.current = you && shared ? (shared.players.find(p => p.key === you.key)?.pos ?? null) : null;
  const glideGuardRef = useRef({ placing: false, radial: false, fallen: false });
  glideGuardRef.current = {
    placing: !!placing,
    radial: !!radial,
    fallen: !!(you && shared && shared.players.find(p => p.key === you.key)?.fallen),
  };
  const sendGlideRef = useRef<(() => void) | null>(null);
  sendGlideRef.current = () => {
    const pos = myPosRef.current;
    if (!pos || heldKeysRef.current.size === 0) return;
    if (!you || !shared || placing) return;
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
      if (e.code === "Escape") { setRadial(null); setRadialAbility(false); setControllerOpen(false); return; }
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const step = GLIDE_STEPS[e.code];
      if (!step) return;
      e.preventDefault();
      if (e.repeat || heldKeysRef.current.has(e.code)) return;
      heldKeysRef.current.add(e.code);
      if (glideGuardRef.current.placing || glideGuardRef.current.fallen) return;
      sendGlideRef.current?.();
      if (!glideTimerRef.current) {
        glideTimerRef.current = setInterval(() => { sendGlideRef.current?.(); }, 120);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
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
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean; t: number } | null>(null);
  const suppressTapRef = useRef(false);
  const [diceOpen, setDiceOpen] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [packDraft, setPackDraft] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
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
        setError(String(msg.message || "The Table would not seat you."));
        setPhase("error");
      } else if (msg.type === "error") {
        setNotice(String(msg.message || ""));
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
                <button
                  className="table-btn"
                  disabled={!devName.trim()}
                  onClick={() => connect({ devName: devName.trim(), room: `campaign-${campKey.trim() || "main"}`, storytender: true })}
                >
                  📖 Campaign — be the Storytender
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
                <button className="table-btn" onClick={() => connect({ authToken: authJoin.authToken, room: `campaign-${authJoin.instanceId}`, storytender: true })}>
                  📖 Campaign — be the Storytender
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="quiet">
                Open the Table from the voice channel in Discord to be named and dealt a hand.
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
              Table in Discord (the bind strip above your hand) — your Discord name is
              tied to this Tender, and the Table deals your real deck from then on.
            </p>
            {bindCode ? (
              <p className="bind-code-shown">Your code: <strong>{bindCode}</strong> — it fades in fifteen minutes and works once.</p>
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
  const selectedCard = you && selectedCardId ? you.hand.find(c => c.id === selectedCardId) ?? null : null;
  const bandFull = !!you && (you.band ?? 0) >= (you.bandCap ?? 5);
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
  const myUnitOn = (tileId: string): boolean => !!you && shared.field.some(u => u.hex === tileId && u.ownerKey === you.key);
  /** The ground the Tender themself holds (their figure's tile,
   *  at rest) — a ward may anchor on it as on an Awokin's. */
  const myTenderOn = (tileId: string): boolean => {
    if (!you) return false;
    const me = shared.players.find(p => p.key === you.key);
    return !!me?.hex && me.hex === tileId && !me.moving;
  };
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
  // radius the server deals, the whole flower fits at zoom 1.
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
  const onStageDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    dragRef.current = { x: e.clientX, y: e.clientY, panX: view.pan.x, panY: view.pan.y, moved: false, t: Date.now() };
    // No pointer capture yet (2026-10-19): capturing at the
    // press retargets the release — and with it the click —
    // to the stage itself, so the wheel's nodes, the figures
    // and the tiles never hear their own clicks in browsers
    // that honor the capture for mouse events. Capture is
    // taken in the move, once a drag is truly a drag.
  };
  const onStageMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    if (!d.moved) {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture is a courtesy */ }
    }
    d.moved = true;
    suppressTapRef.current = true;
    const rect = svgRef.current?.getBoundingClientRect();
    const f = rect && rect.width > 0 ? stageBox.w / rect.width : 1;
    setView(v => ({ ...v, pan: { x: d.panX + dx * f, y: d.panY + dy * f } }));
  };
  const onStageUp = (e?: ReactPointerEvent<SVGSVGElement>) => {
    // Release the drag's pointer capture (taken in the move
    // handler once a drag proved itself) so no held capture
    // can carry into the next press.
    if (e) { try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ } }
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.moved) setTimeout(() => { suppressTapRef.current = false; }, 80);
    // A long, still press (the iPad's right-click) opens the
    // glyph wheel where the finger rests.
    if (e && e.type === "pointerup" && d && !d.moved && Date.now() - d.t >= 500) {
      const pt = stagePointOf(e.clientX, e.clientY);
      if (pt && you && shared.players.some(p => p.key === you.key && p.hex)) {
        suppressTapRef.current = true;
        setTimeout(() => { suppressTapRef.current = false; }, 120);
        setRadialAbility(false);
        setRadial(pt);
      }
    }
  };
  /** A screen point in the stage's own (panned, zoomed)
   *  coordinates — where the glyph wheel blooms. */
  const stagePointOf = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    const vx = stageBox.x + (clientX - rect.left) * (stageBox.w / rect.width);
    const vy = stageBox.y + (clientY - rect.top) * (stageBox.h / rect.height);
    return { x: (vx - view.pan.x) / view.zoom, y: (vy - view.pan.y) / view.zoom };
  };
  const openRadialAt = (clientX: number, clientY: number) => {
    if (!you) return;
    if (!shared.players.some(p => p.key === you.key && p.hex)) return;
    const pt = stagePointOf(clientX, clientY);
    if (pt) { setRadialAbility(false); setRadial(pt); }
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
  const curseInReach = selUnit && selTile ? shared.map.filter(t => t.cursed && axialDist(selTile, t) <= 2) : [];
  const strikeArmed = strikeArm && !!selUnit && !selUnitMoving;

  // Which tiles the Written Light's placing flows may touch —
  // the same law the old hex field enforced, in axial terms.
  const tilePickable = (t: MapTileView): boolean => {
    if (!placing || !you) return false;
    if (placing.kind === "heal") return myUnitOn(t.id);
    if (placing.kind === "rune") return !shared.workings.some(w => w.kind === "rune" && w.hex === t.id);
    if (!wardAnchor) return myUnitOn(t.id) || myTenderOn(t.id);
    const anchor = tileById.get(wardAnchor);
    return !!anchor && axialDist(anchor, t) === 1;
  };

  // A tap on the land itself. The placing flows drink first;
  // then a chosen card is cast; then a chosen Awoken marches;
  // then the tap chooses (or cycles) my Awoken standing there.
  const onTileTap = (t: MapTileView) => {
    if (!you) return;
    if (suppressTapRef.current) return; // the tail of a pan-drag, not a tap
    if (placing) {
      if (placing.kind === "heal") {
        if (myUnitOn(t.id)) { send({ type: "castHeal", hex: t.id }); beginCast(t.id); setPlacing(null); }
        return;
      }
      if (placing.kind === "rune") {
        const eng = defs[placing.root]?.engine;
        if (eng === "blades" || eng === "shardrain") {
          const maxT = eng === "shardrain" ? (defs[placing.root]?.numbers.maxHexes ?? 3) : (defs[placing.root]?.numbers.maxTargets ?? 3);
          setBladePicks(prev => prev.includes(t.id) ? prev.filter(x => x !== t.id) : prev.length >= maxT ? prev : [...prev, t.id]);
          return;
        }
        if (!shared.workings.some(w => w.kind === "rune" && w.hex === t.id)) {
          send({ type: "castRune", root: placing.root, hue: pourHue, hexes: [t.id], pour: pourPts });
          beginCast(t.id);
          setPlacing(null); setPourPts(0);
        }
        return;
      }
      // ward: an anchor on my own ground, then a neighbour.
      if (!wardAnchor) { if (myUnitOn(t.id) || myTenderOn(t.id)) setWardAnchor(t.id); return; }
      const anchor = tileById.get(wardAnchor);
      if (anchor && axialDist(anchor, t) === 1) {
        send({ type: "castWard", root: placing.root, hue: pourHue, hexA: wardAnchor, hexB: t.id, pour: pourPts });
        beginCast(t.id);
        setPlacing(null); setWardAnchor(null); setPourPts(0);
      } else if (t.id === wardAnchor) setWardAnchor(null);
      return;
    }
    if (selectedCard) { send({ type: "summon", cardId: selectedCard.id, hex: t.id }); return; }
    // Armed against the curse, the chosen one's taps are
    // blows: cursed ground within two tiles is struck (one
    // order, one blow, ⚡1 — the server referees the wear);
    // any other tap is answered plainly, and the arm holds.
    if (strikeArmed && selUnit && selTile) {
      if (t.cursed && axialDist(selTile, t) <= 2) {
        send({ type: "strikeCurse", cardId: selUnit.cardId, hex: selUnit.hex, target: t.id });
      } else {
        setNotice(t.cursed ? "Beyond reach — the light strikes two tiles out." : "That ground is not cursed — there is nothing there to strike.");
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
    if (selUnitId) {
      const unit = shared.field.find(u => u.cardId === selUnitId && u.ownerKey === you.key);
      if (unit && t.id !== unit.hex && !unit.moving) {
        send({ type: "march", cardId: unit.cardId, from: unit.hex, to: t.id });
        setSelUnitId(null);
        return;
      }
    }
    const mineHere = shared.field.filter(u => u.hex === t.id && u.ownerKey === you.key && !u.moving);
    if (mineHere.length) {
      const idx = mineHere.findIndex(u => u.cardId === selUnitId);
      setSelUnitId(mineHere[(idx + 1) % mineHere.length].cardId);
      setSelectedCardId(null);
    } else {
      setSelUnitId(null);
    }
  };

  // A tap on one of my own figures chooses it for orders —
  // unless the Written Light is being placed, when the tap
  // belongs to the tile beneath it, as it always did.
  const onUnitTap = (u: FieldUnitView) => {
    if (suppressTapRef.current) return; // the tail of a pan-drag, not a tap
    if (placing) {
      const t = tileById.get(u.hex);
      if (t) onTileTap(t);
      return;
    }
    setSelUnitId(u.cardId);
    setSelectedCardId(null);
    setSelTender(false);
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
      <g key={`u-${u.ownerKey}-${u.cardId}`} pointerEvents="none">
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
        {moving && <text x={ax + 16} y={ay - 28} fontSize={9}>🚶</text>}
        {u.follow && <text x={ax - 16} y={ay - 28} fontSize={9}>👣</text>}
        {mine && !moving && (
          <circle
            cx={ax} cy={ay - 19} r={20} fill="transparent" pointerEvents="all"
            style={{ cursor: "pointer" }}
            onClick={(e) => { e.stopPropagation(); onUnitTap(u); }}
          />
        )}
      </g>
    );
  };

  // One of the dark at its ground point: its art mirrored to
  // face the light, its name, its health. Standing or walking,
  // it is drawn the same — only its place differs.
  const renderDarkFigure = (e: SharedState["dark"][number], ax: number, ay: number, moving: boolean): ReactNode => {
    const art = e.art ?? BUNDLED_ENEMIES[e.kind as keyof typeof BUNDLED_ENEMIES] ?? null;
    return (
      <g key={`${moving ? "dm" : "d"}-${e.id}`} pointerEvents="none">
        {art
          ? <g transform={`translate(${2 * ax} 0) scale(-1 1)`}><image className="ts-dark-img" href={art} x={ax - 20} y={ay - 38} width={40} height={40} /></g>
          : <text x={ax} y={ay - 13} textAnchor="middle" fontSize={20}>🕳️</text>}
        <text className="ts-name dark" x={ax} y={ay + 10}>{e.label}{e.pinnedUntil > nowMs ? ` ⛓${Math.max(1, Math.ceil((e.pinnedUntil - nowMs) / 1000))}` : ""}</text>
        <rect x={ax - 13} y={ay + 13} width={26} height={3} fill="#000000" opacity={0.65} />
        <rect x={ax - 13} y={ay + 13} width={26 * clamp01(e.hp / Math.max(1, e.maxHp))} height={3} fill="#b8412f" />
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
    const img = <image href={pose.src} x={gx - 29} y={gy - 58} width={58} height={58} preserveAspectRatio="xMidYMax meet" />;
    // THE RUNIC WEAPON floats at his side (Nigel, 2026-10-19):
    // presence only for now — its lunges land in a later phase.
    const weaponKey = (p.weaponKey ?? null) as WeaponKey | null;
    figures.push({
      key: `tender-${p.key}`, gy,
      node: (
        <g key={`tender-${p.key}`} pointerEvents="none" opacity={p.fallen ? 0.45 : 1}>
          <ellipse cx={gx} cy={gy + 1} rx={13} ry={3.5} fill="rgba(0,0,0,0.35)" />
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
          {mine && (
            <circle cx={gx} cy={gy - 26} r={24} fill="transparent" pointerEvents="all" style={{ cursor: "pointer" }}
              onClick={(e) => { e.stopPropagation(); if (suppressTapRef.current) return; setSelTender(true); setSelUnitId(null); setSelectedCardId(null); if (coarsePointer()) setControllerOpen(true); }} />
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
    offerings.push({ key: "ability", glyph: null, emoji: "⚔", cost: -1, locked: false, keepOpen: true, act: () => setRadialAbility(true) });
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
    nodes.push({ key: "manifest", img: myWeapon ? weaponImg(myWeapon) : null, emoji: "❖", label: "⚡4", lit: false, locked: myEnergy < 4, act: () => send({ type: "manifest" }) });
    return nodes;
  };

  // The wheel, opened over your own figure (the controller's
  // button, the hotbar's Ability slot).
  const openRadialAtMe = (ability: boolean) => {
    if (!you || !shared) return;
    const me = shared.players.find(p => p.key === you.key);
    if (!me) return;
    const pt = me.pos ? { x: me.pos.x, y: me.pos.y - 10 }
      : me.hex ? (() => { const c = centerOf(me.hex); return c ? { x: c.cx, y: c.cy - 10 } : null; })() : null;
    if (pt) { setRadial(pt); setRadialAbility(ability); }
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
    if (!me || me.fallen || placing) return;
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
  // from the wheel (or the hand) — no second language.
  const actHotbar = (key: string) => {
    if (key === "ability") { openRadialAtMe(true); return; }
    if (key.startsWith("card-")) {
      const id = key.slice(5);
      if (you?.hand.some(c => c.id === id)) { setSelUnitId(null); setSelectedCardId(id); }
      else toggleHotbar(key); // the card has left the hand — the slot looses itself
      return;
    }
    const off = buildOfferings().find(o => o.key === key);
    if (off) { if (!off.locked) off.act(); return; }
    const node = buildAbilityNodes().find(n => n.key === key);
    if (node && !node.locked) node.act();
  };
  const hotbarMeta = (key: string): { img: string | null; emoji: string; label: string; dim: boolean; lit: boolean; title: string } => {
    if (key === "ability") return { img: null, emoji: "⚔", label: "ABILITY", dim: false, lit: false, title: "Ability — the wheel's weapon ring, opened over your Tender" };
    if (key.startsWith("card-")) {
      const card = you?.hand.find(c => c.id === key.slice(5)) ?? null;
      return { img: card?.art ?? null, emoji: "✦", label: card ? card.name.split(" ")[0] : "gone", dim: !card, lit: !!card && selectedCardId === card.id, title: card ? `${card.name} — tap to ready the summoning, then tap the ground at your side` : "This Awokin has left your hand — tap to loose the slot" };
    }
    const off = buildOfferings().find(o => o.key === key);
    if (off) {
      const d = Object.values(defs).find(dd => `w-${dd.key}` === key || `b-${dd.key}` === key || `r-${dd.key}` === key);
      const root = key === "heal" ? "heal" : d?.key;
      return { img: off.glyph, emoji: off.emoji, label: `⚡${off.cost}`, dim: off.locked, lit: !!root && placing?.root === root, title: `${d?.root ?? "Heal"} — tap to ready it, then tap its ground (right-click the slot to loose it)` };
    }
    const node = buildAbilityNodes().find(n => n.key === key);
    if (node) return { img: node.img, emoji: node.emoji, label: node.label, dim: node.locked, lit: node.lit, title: node.key === "manifest" ? "Manifest — tap to call the copies (⚡4)" : `${node.label} — tap to wield it (right-click the slot to loose it)` };
    return { img: null, emoji: "✦", label: "?", dim: true, lit: false, title: "A locked thing the Table no longer knows — right-click to loose it" };
  };
  return (
    <div className="table-room">
      <header className="skybar">
        <span className="sky-reign">☁ <strong>{sky.mood}</strong>{sky.description ? ` — ${sky.description}` : ""}</span>
        <span className="sky-round">The Table · {shared.mode === "campaign" ? "campaign room" : "casual room"}</span>
        {shared.campaign?.seeded && !shared.campaign.over && (
          <span className="bank-chip" title="The party's one bank — every cast draws from it, every harvest joins it, and what remains divides evenly when the campaign turns home">🌟 The Bank ⚡{shared.campaign.bank}</span>
        )}
        {shared.campaign?.over === "fallen" && <span className="bank-chip fallen">🌑 The Bastion has fallen</span>}
        {shared.campaign?.over === "ended" && <span className="bank-chip">🏠 The campaign has turned home</span>}
        <span className="sky-threat">
          <label>Unraveling power</label>
          <span className="threat-track"><span className="threat-fill" style={{ width: "0%" }} /></span>
          <span className="threat-num">0 — the dark is not yet dealt</span>
        </span>
      </header>

      <main className="table-main">
        <aside className="panel party-panel">
          <h3>The Party</h3>
          {shared.players.length === 0 && <p className="quiet">No Tenders seated yet.</p>}
          {shared.players.map((p) => (
            <div key={p.key} className={`party-row${you && p.key === you.key ? " self" : ""}`}>
              <span className="party-name">{p.name}{you && p.key === you.key ? " (you)" : ""}{p.away ? " · away" : ""}</span>
              {p.storytender ? <span className="party-meta">📖 Storytender — she deals</span> : p.fallen ? <span className="party-meta fallen">💀 fallen — rises between waves</span> : <span className="party-meta">❤ {p.tenderHp}/{p.maxTenderHp} · ⚡ {p.energy} · 🂠 {p.handCount} in roster</span>}
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
            <img className="field-bg" src={battlegroundBg} alt="" aria-hidden="true" />
            <div className="field-board">
            <svg
              ref={svgRef}
              className="terrain-stage"
              viewBox={`${stageBox.x} ${stageBox.y} ${stageBox.w} ${stageBox.h}`}
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label="the instance — the terrain map, dealt fresh"
              onPointerDown={onStageDown}
              onPointerMove={onStageMove}
              onPointerUp={onStageUp}
              onPointerCancel={onStageUp}
              onContextMenu={(e) => { e.preventDefault(); openRadialAt(e.clientX, e.clientY); }}
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
                } else if (selectedCard) {
                  // Summoning answers at the Tender's side:
                  // only ground within a hex of their figure
                  // lights up as lawful.
                  const meP = you ? shared.players.find(p => p.key === you.key) : null;
                  const meT = meP?.hex ? tileById.get(meP.hex) : null;
                  if (!t.cursed && meT && axialDist(meT, t) <= 1) overlay = { fill: "#ffd977", opacity: 0.14 };
                } else if (strikeArmed && selTile) {
                  if (t.cursed && axialDist(selTile, t) <= 2) overlay = { fill: "#c22333", opacity: 0.3 };
                  else if (t.id !== selUnit?.hex) overlay = { fill: "#ffffff", opacity: 0.05 };
                } else if (selUnit) {
                  if (t.id !== selUnit.hex) overlay = { fill: "#ffffff", opacity: 0.07 };
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
                        {(t.curseHp < t.curseMaxHp || strikeArmed) && (
                          <text className="curse-hp-label" x={cx} y={cy + 34}>{Math.max(0, Math.ceil(t.curseHp))}</text>
                        )}
                      </>
                    )}
                    {overlay && <polygon points={hexCellPoints(cx, cy, TILE_SIZE)} fill={overlay.fill} opacity={overlay.opacity} pointerEvents="none" />}
                    <polygon
                      points={hexCellPoints(cx, cy, TILE_SIZE)}
                      fill="transparent"
                      pointerEvents="all"
                      onClick={() => onTileTap(t)}
                      style={{ cursor: overlay || selectedCard || myUnitOn(t.id) ? "pointer" : "default" }}
                    />
                  </g>
                );
              })}
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
                if (w.kind === "rune" && w.hex) {
                  const c = centerOf(w.hex);
                  if (!c) return null;
                  return (
                    <g key={w.id} pointerEvents="none">
                      {img
                        ? <image href={img} x={c.cx - 14} y={c.cy - 14} width={27} height={27} style={{ filter }} />
                        : <text className="ts-glyph-fallback" x={c.cx} y={c.cy + 7} style={{ filter }}>✦</text>}
                      {defs[w.root]?.engine === "blade" && <text className="ts-tag" x={c.cx} y={c.cy + 23}>{w.charges}✦</text>}
                      {defs[w.root]?.engine === "lattice" && <text className="ts-tag" x={c.cx} y={c.cy + 23}>❤{w.hp}</text>}
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
              {/* THE GLYPH WHEEL: your castable workings in a
                  ring, Zodiac fashion — glyphs only, the cost a
                  whisper of a numeral beneath each. A left click
                  chooses; the placing laws choose the target
                  after. Locked workings hang dimmed. */}
              {radial && you && (() => {
                const offerings = buildOfferings();
                const R = 58;
                if (radialAbility) {
                  // THE ABILITY SUB-RING: the four weapons (the
                  // wielded one lit) and MANIFEST at its ⚡4 —
                  // greyed, and silent, when the purse is short.
                  const nodes = buildAbilityNodes();
                  return (
                    <g key="ability-wheel">
                      <rect x={radial.x - 900} y={radial.y - 900} width={1800} height={1800} fill="transparent" pointerEvents="all"
                        onClick={() => { setRadial(null); setRadialAbility(false); }}
                        onContextMenu={(e) => { e.preventDefault(); setRadial(null); setRadialAbility(false); }} />
                      <circle cx={radial.x} cy={radial.y} r={20} fill="rgba(10,8,16,0.88)" stroke="#c9a227" strokeWidth={1} pointerEvents="all"
                        style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); setRadialAbility(false); }} />
                      <text x={radial.x} y={radial.y + 5} textAnchor="middle" fontSize={13} fill="#ffd977" pointerEvents="none">⚔</text>
                      {nodes.map((o, i) => {
                        const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, nodes.length);
                        const gx = radial.x + R * Math.cos(a), gy = radial.y + R * Math.sin(a);
                        return (
                          <g key={o.key} opacity={o.locked ? 0.32 : o.lit ? 1 : 0.85}
                            style={o.locked ? undefined : { cursor: "pointer" }}
                            onClick={o.locked ? undefined : (e) => { e.stopPropagation(); o.act(); setRadial(null); setRadialAbility(false); }}>
                            <circle cx={gx} cy={gy} r={19} fill="rgba(10,8,16,0.92)" stroke={o.lit ? "#ffd977" : "#c9a227"} strokeWidth={o.lit ? 2 : 1} />
                            {o.img
                              ? <image href={o.img} x={gx - 13} y={gy - 15} width={26} height={26} style={{ filter: o.lit ? "drop-shadow(0 0 6px #ffd977)" : undefined, pointerEvents: "none" }} />
                              : <text x={gx} y={gy + 2} textAnchor="middle" fontSize={15} fill="#ffd977" pointerEvents="none">{o.emoji}</text>}
                            <text x={gx} y={gy + 15} textAnchor="middle" fontSize={7.5} fill="#ffd977" pointerEvents="none">{o.label}</text>
                            {/* The hotbar pin: lock this to the belt without wielding it. */}
                            <g transform={`translate(${gx + 13} ${gy - 13})`} style={{ cursor: "pointer" }}
                              onClick={(e) => { e.stopPropagation(); toggleHotbar(o.key); }}>
                              <circle r={11} fill="transparent" />
                              <circle r={6.5} fill="rgba(10,8,16,0.92)" stroke="#c9a227" strokeWidth={0.8} />
                              <text y={2.8} textAnchor="middle" fontSize={8} fill={hotbarKeys.includes(o.key) ? "#ffd977" : "#cbb26a"} pointerEvents="none">{hotbarKeys.includes(o.key) ? "✓" : "＋"}</text>
                            </g>
                          </g>
                        );
                      })}
                    </g>
                  );
                }
                return (
                  <g key="glyph-wheel">
                    <rect x={radial.x - 900} y={radial.y - 900} width={1800} height={1800} fill="transparent" pointerEvents="all"
                      onClick={() => setRadial(null)}
                      onContextMenu={(e) => { e.preventDefault(); setRadial(null); }} />
                    <circle cx={radial.x} cy={radial.y} r={20} fill="rgba(10,8,16,0.88)" stroke="#c9a227" strokeWidth={1} pointerEvents="none" />
                    <text x={radial.x} y={radial.y + 5} textAnchor="middle" fontSize={13} fill="#ffd977" pointerEvents="none">✦</text>
                    {offerings.map((o, i) => {
                      const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, offerings.length);
                      const gx = radial.x + R * Math.cos(a), gy = radial.y + R * Math.sin(a);
                      return (
                        <g key={o.key} opacity={o.locked ? 0.32 : 1}
                          style={o.locked ? undefined : { cursor: "pointer" }}
                          onClick={o.locked ? undefined : (e) => { e.stopPropagation(); o.act(); if (!o.keepOpen) setRadial(null); }}>
                          <circle cx={gx} cy={gy} r={19} fill="rgba(10,8,16,0.92)" stroke="#c9a227" strokeWidth={1} />
                          {o.glyph
                            ? <image href={o.glyph} x={gx - 13} y={gy - 15} width={26} height={26} style={{ filter: `${HUE_FILTERS[pourHue]} drop-shadow(0 0 5px ${HUE_GLOWS[pourHue]})`, pointerEvents: "none" }} />
                            : <text x={gx} y={gy + 2} textAnchor="middle" fontSize={15} fill="#ffd977" pointerEvents="none">{o.emoji}</text>}
                          <text x={gx} y={gy + 15} textAnchor="middle" fontSize={o.key === "ability" ? 6 : 7.5} fill="#ffd977" pointerEvents="none">{o.key === "ability" ? "ABILITY" : `⚡${o.cost}`}</text>
                          {/* The hotbar pin: lock this working to the belt without casting it. */}
                          {!o.locked && (
                            <g transform={`translate(${gx + 13} ${gy - 13})`} style={{ cursor: "pointer" }}
                              onClick={(e) => { e.stopPropagation(); toggleHotbar(o.key); }}>
                              <circle r={11} fill="transparent" />
                              <circle r={6.5} fill="rgba(10,8,16,0.92)" stroke="#c9a227" strokeWidth={0.8} />
                              <text y={2.8} textAnchor="middle" fontSize={8} fill={hotbarKeys.includes(o.key) ? "#ffd977" : "#cbb26a"} pointerEvents="none">{hotbarKeys.includes(o.key) ? "✓" : "＋"}</text>
                            </g>
                          )}
                        </g>
                      );
                    })}
                  </g>
                );
              })()}
              {/* The round's strikes, flown on gravity's arc from
                  tile to tile. A shot lives exactly as long as
                  the strikes state keeps it — when the timeout
                  clears it, it unmounts; nothing is left stuck
                  on the field. */}
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
            {/* THE HOTBAR: what the wheel and the hand locked
                onto the belt. A tap runs the locked thing's own
                act; a right-click looses the slot. */}
            {you && hotbarKeys.length > 0 && (
              <div className={`table-hotbar${coarsePointer() ? " touch" : ""}`} role="toolbar" aria-label="Your hotbar">
                {hotbarKeys.map(key => {
                  const m = hotbarMeta(key);
                  return (
                    <button type="button" key={key} className={`table-slot${m.dim ? " dim" : ""}${m.lit ? " lit" : ""}`} title={m.title}
                      onClick={() => actHotbar(key)}
                      onContextMenu={(e) => { e.preventDefault(); toggleHotbar(key); }}>
                      {m.img ? <img src={m.img} alt="" /> : <span className="table-slot-emoji">{m.emoji}</span>}
                      <span className="table-slot-label">{m.label}</span>
                    </button>
                  );
                })}
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
            </div>
            {(() => {
              const neutrals = shared.workings.filter(w => w.kind === "rune" && w.hue === "unaligned" && ["lattice", "shard"].includes(defs[w.root]?.engine ?? ""));
              if (!neutrals.length) return null;
              const target = neutrals.find(w => w.id === pushTargetId) ?? null;
              const pool = Math.floor(you?.pools?.[pushHue] ?? 0);
              const lvl = Math.min(3, Math.floor(pool / 10));
              return (
                <div className="placing-bar">
                  <span className="placing-text">
                    {neutrals.map(w => (
                      <button key={w.id} className="table-btn" onClick={() => { setPushTargetId(target?.id === w.id ? null : w.id); setPushPts(0); }}>
                        ✦ {w.name} — {w.ownerName}&rsquo;s neutral rune{(target?.id === w.id) ? " (pushing)" : " — push it"}
                      </button>
                    ))}
                    {target && (
                      <>
                        <select value={pushHue} onChange={(e) => { setPushHue(e.target.value); setPushPts(0); }}>
                          {["tide", "sky", "stone", "root", "fire"].map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                        <button className="table-btn" disabled={pushPts <= 0} onClick={() => setPushPts(p => Math.max(0, p - 1))}>−</button>
                        <span>Pour {pushPts} (your {pushHue} Lv {lvl})</span>
                        <button className="table-btn" disabled={pushPts >= lvl} onClick={() => setPushPts(p => Math.min(lvl, p + 1))}>+</button>
                        <button className="table-btn primary" disabled={pushPts <= 0} onClick={() => { send({ type: "pourWorking", workingId: target.id, hue: pushHue, pour: pushPts }); setPushTargetId(null); setPushPts(0); }}>Push it toward {pushHue}</button>
                      </>
                    )}
                  </span>
                </div>
              );
            })()}
            {placing && (
              <div className="placing-bar">
                <span className="placing-text">
                  {placing.kind === "heal" && <>Mending — tap one of <strong>your own standing Awokin</strong> to restore {you?.healAmount ?? 5} HP (⚡{healDef?.cost ?? 2}).</>}
                  {placing.kind === "rune" && defs[placing.root]?.engine !== "blades" && defs[placing.root]?.engine !== "shardrain" && <>Writing the <strong>{defs[placing.root]?.forms[pourHue] ?? defs[placing.root]?.root}</strong> — tap a hex's ground to write it there. It springs the moment the dark stands on it.</>}
                  {placing.kind === "rune" && defs[placing.root]?.engine === "shardrain" && <>Writing the <strong>{defs[placing.root]?.forms[pourHue] ?? defs[placing.root]?.root}</strong> — tap up to {defs[placing.root]?.numbers.maxHexes ?? 3} hexes to cover ({bladePicks.length}/{defs[placing.root]?.numbers.maxHexes ?? 3} chosen), then let it fall. When the dark stands on its ground, the sky opens once: the dice pool splits over every foe beneath it.</>}
                  {placing.kind === "rune" && defs[placing.root]?.engine === "blades" && <>Planting the <strong>{defs[placing.root]?.forms[pourHue] ?? defs[placing.root]?.root}</strong> — tap up to {defs[placing.root]?.numbers.maxTargets ?? 3} hexes ({bladePicks.length}/{defs[placing.root]?.numbers.maxTargets ?? 3} chosen), then lay them.</>}
                  {placing.kind === "ward" && defs[placing.root]?.engine === "springleaf" && !wardAnchor && <>Planting the <strong>{defs[placing.root]?.forms[pourHue] ?? defs[placing.root]?.root}</strong> — tap a hex <strong>you hold</strong> — your own ground, or your Awokin's — to anchor the grove.</>}
                  {placing.kind === "ward" && defs[placing.root]?.engine === "springleaf" && wardAnchor && <>Now tap a <strong>neighbouring hex</strong> — the grove takes root there, and its glow mends those who stand in it.</>}
                  {placing.kind === "ward" && defs[placing.root]?.engine !== "springleaf" && !wardAnchor && <>Raising the <strong>{defs[placing.root]?.forms[pourHue] ?? defs[placing.root]?.root}</strong> — tap a hex <strong>you hold</strong> — your own ground, or your Awokin's: the ward will stand on one of its edges.</>}
                  {placing.kind === "ward" && defs[placing.root]?.engine !== "springleaf" && wardAnchor && <>Now tap a <strong>neighbouring hex</strong> — the ward stands on the edge between the two.</>}
                </span>
                {placing.kind !== "heal" && ["seal", "trees", "lattice", "shard"].includes(defs[placing.root]?.engine ?? "") && pourHue !== "unaligned" && you?.pools && (() => {
                  const def = defs[placing.root];
                  const n = def?.numbers ?? {};
                  const pool = Math.floor(you.pools[pourHue] ?? 0);
                  const cap = Math.min(3, Math.floor(pool / 10));
                  const maxPour = Math.min(cap, pool);
                  const bright = shared?.workings.some(w => defs[w.root]?.engine === "engine" && w.ownerKey === you.key) ? 1 : 0;
                  const hpPreview = def?.engine === "shard" ? null
                    : Math.max(1, Math.floor((n.hp ?? 6) + (n.hpPerLevel ?? 1) * (you.tenderLevel ?? 1) + (n.hpPerPoint ?? 2) * pourPts + (def?.engine === "trees" ? bright * (n.brightHpBonus ?? 2) : 0)));
                  return (
                    <span className="placing-pour">
                      <button className="table-btn" disabled={pourPts <= 0} onClick={() => setPourPts(p => Math.max(0, p - 1))}>−</button>
                      <span>Pour {pourPts} {pourHue} pt{pourPts === 1 ? "" : "s"} (pool {pool} · your {pourHue} Lv {cap})</span>
                      <button className="table-btn" disabled={pourPts >= maxPour} onClick={() => setPourPts(p => Math.min(maxPour, p + 1))}>+</button>
                      <span className="placing-pour-effect">{def?.engine === "shard" ? `→ +${pourPts * (n.harmPerPoint ?? 1)} harm when it falls` : `→ raised with ❤${hpPreview}`}</span>
                    </span>
                  );
                })()}
                {placing.kind === "rune" && (defs[placing.root]?.engine === "blades" || defs[placing.root]?.engine === "shardrain") && bladePicks.length > 0 && (
                  <button className="table-btn primary" onClick={() => { send({ type: "castRune", root: placing.root, hue: pourHue, hexes: bladePicks, pour: pourPts }); beginCast(bladePicks[0] ?? null); setPlacing(null); setBladePicks([]); setPourPts(0); }}>{defs[placing.root]?.engine === "shardrain" ? "Write the rain" : "Lay them"} · ⚡{defs[placing.root]?.cost ?? 4}</button>
                )}
                <button className="table-btn" onClick={() => { setPlacing(null); setWardAnchor(null); setBladePicks([]); }}>Set the light down</button>
              </div>
            )}
            {selUnit && !placing && (
              <div className="placing-bar unit-bar">
                <span className="placing-text">
                  {strikeArmed ? "⚔️" : "🚶"} <strong>{selUnit.name}</strong> — {selUnitMoving
                    ? "on the move — it answers when it arrives."
                    : strikeArmed
                      ? <>armed against the curse — tap cursed ground within two tiles: one blow (⚡1) wears its curse by {selUnit.power}. The curse does not answer; the withering is for those who stand in it.</>
                      : <>tap a tile to march (⚡{marchRateOf(selUnit)} per hex). The road may cross the curse; the standing may not.</>}
                </span>
                {!selUnitMoving && (
                  <>
                    <button className="table-btn" onClick={() => { send({ type: "castHeal", hex: selUnit.hex }); beginCast(selUnit.hex); }}>Heal · ⚡{healDef?.cost ?? 2}</button>
                    {strikeArmed ? (
                      <button className="table-btn" onClick={() => setStrikeArm(false)}>Stay the hand</button>
                    ) : curseInReach.length > 0 ? (
                      <button className="table-btn" onClick={() => setStrikeArm(true)}>Strike the curse · ⚡1</button>
                    ) : null}
                    <button className="table-btn" onClick={() => send({ type: "setFollow", cardId: selUnit.cardId, follow: !selUnit.follow })}>{selUnit.follow ? "👣 Following you — hold ground" : "👣 Follow me"}</button>
                    <button className="table-btn" onClick={() => { send({ type: "recall", hex: selUnit.hex, cardId: selUnit.cardId }); setSelUnitId(null); }}>Recall</button>
                  </>
                )}
                <button className="table-btn" onClick={() => setSelUnitId(null)}>Done</button>
              </div>
            )}
            {selTender && you && !placing && (
              <div className="placing-bar unit-bar">
                <span className="placing-text">
                  🚶 <strong>You</strong> — WASD walks you, free as breathing. Right-click the land (or long-press) for your glyph wheel — it opens mid-glide and the glide rides on; tap a tile and you glide there. Where you arrive, your followers muster to you; the rest hold their ground. On a touch hand, tap your own figure for the controller pad; the wheel's ＋ pins lock workings, weapons and Awokin onto your hotbar.
                </span>
                <button className="table-btn" onClick={() => setSelTender(false)}>Done</button>
              </div>
            )}
            <div className="battle-bar">
              {shared.battle.active ? (
                <span className="battle-status">🌑 Wave {shared.battle.wave} — {shared.dark.length} of the dark stand · round {shared.round}</span>
              ) : shared.campaign ? (
                <>
                <span className="battle-status">
                  {shared.campaign.over === "fallen"
                    ? "🌑 The Bastion has fallen — this campaign is ended by the enemy's right. A new campaign opens at the door."
                    : shared.campaign.over === "ended"
                      ? "🏠 The campaign has turned home — its growth goes with you. A new campaign opens at the door."
                      : <>📖 A campaign table — {shared.campaign.storytenderName ? <>{shared.campaign.storytenderName} deals the dark.</> : "awaiting a Storytender to deal."}{shared.campaign.seeded ? <> The bank ⚡{shared.campaign.bank} binds you.</> : null}</>}
                </span>
                {!shared.campaign.over && !shared.campaign.storytenderName && you && (
                  <button className="table-btn battle-btn" onClick={() => send({ type: "stEnd" })}>🏠 Turn the campaign home</button>
                )}
                </>
              ) : you ? (
                <>
                {shared.bastion ? (
                  <div className="bastion-banner">
                    ⚔ {shared.bastion.kind.toUpperCase()} — {shared.bastion.hostName}'s call · One pool ⚡{shared.bastion.pool}/{shared.bastion.poolMax}
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
                {!shared.bastion && <button className="table-btn primary battle-btn" onClick={() => send({ type: "startWave" })}>⚔ Begin the Unraveling — Wave {shared.battle.wave}</button>}
                </>
              ) : (
                <span className="battle-status">The field is at rest. A seated Tender may begin the Unraveling.</span>
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
                <img src={r.art ?? BUNDLED_ENEMIES[r.name as keyof typeof BUNDLED_ENEMIES]} alt={r.label} />
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
              <p className="quiet small">Yours alone, like your hand.</p>
            </details>
          )}
        </aside>
      </main>

      <footer className={you?.storytender ? "handzone st-zone" : you ? `handzone drawer${handUp ? " risen" : ""}` : "handzone plain"}>
        {you?.storytender ? (
          <div className="st-panel">
            <div className="st-head">
              <strong>📖 The Storytender's Panel</strong>
              <span className="quiet small">
                The bank ⚡{you.storytender.bank}
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
            <button type="button" className="hand-grab" onClick={() => setHandUp(v => !v)} aria-expanded={handUp} aria-label={handUp ? "Lower your hand" : "Raise your hand"}>
              <span className="grab-line" aria-hidden="true" />
              {handUp ? "▾ your hand" : "▴ your hand"}
            </button>
            <div className="satchel-head">
              <div className="satchel-tabs" role="tablist" aria-label="Your satchel">
                {(["I", "II", "III", "IV"] as const).map((t) => (
                  <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
                    {t}{t === "I" ? " · Awokin" : t === "II" ? " · Abilities" : t === "III" ? " · Spells" : " · Potions & Items"}
                  </button>
                ))}
              </div>
              <span className="my-energy" title="Your energy for this sitting — calculated from your whole roster by the game's law">⚡ {you.energy ?? 0}<span className="my-energy-max"> / {you.maxEnergy ?? 0}</span></span>
              <span className="my-band" title="Your travelling company — how many of your Awokin may stand on the field at once. Your level widens it (three at Lv 1, four at Lv 3, the true five at Lv 6), and the Muster roads widen it further: the Escort, the Pennant, the Retinue, the Whole Muster.">⚑ {you.band ?? 0}<span className="my-energy-max"> / {you.bandCap ?? 5}</span></span>
              <button className="dice-btn" onClick={() => setDiceOpen(true)} aria-label="Open your dice">🎲 Your dice</button>
            </div>
            {notice && <p className="notice-line">{notice}</p>}
            {tab === "I" && (
              <>
                <div className="hand-cards">
                  {you.hand.map((card) => {
                    const cost = castCostOf(card);
                    const afford = (you.energy ?? 0) >= cost;
                    const selected = selectedCardId === card.id;
                    return (
                      <div
                        key={card.id}
                        className={`tcard castable${selected ? " selected" : ""}${afford ? "" : " dim"}${bandFull && !selected ? " locked" : ""}`}
                        data-element={card.element}
                        role="button"
                        aria-pressed={selected}
                        title={bandFull && !selected ? `Your band stands full — ${you.bandCap ?? 5} strong.` : afford ? `Cast ${card.name} — ⚡${cost}. Tap, then tap purified ground at your side.` : `${card.name} costs ⚡${cost} — you hold ⚡${you.energy ?? 0}.`}
                        onClick={() => { if (!handUp) { setHandUp(true); return; } if (!selected && bandFull) { setNotice(`Your band stands full — ${you.bandCap ?? 5} strong. Recall a standing Awokin first, or widen the band: levels (Lv 3, Lv 6) and the Muster roads.`); return; } if (!selected) setSelUnitId(null); setSelectedCardId(selected ? null : card.id); }}
                      >
                        <button type="button" className={`tcard-pin${hotbarKeys.includes(`card-${card.id}`) ? " on" : ""}`}
                          title={hotbarKeys.includes(`card-${card.id}`) ? "Locked to your hotbar — tap to loose it" : "Lock this Awokin to your hotbar"}
                          onClick={(e) => { e.stopPropagation(); toggleHotbar(`card-${card.id}`); }}>
                          {hotbarKeys.includes(`card-${card.id}`) ? "✓" : "＋"}
                        </button>
                        <div className="tcard-banner">
                          <span className="tcard-name">{card.name}</span>
                          <span className="tcard-mark">{card.level ? `Lv ${card.level}` : ""}</span>
                        </div>
                        {card.art ? (
                          <div className="tcard-art real"><img src={card.art} alt={`${card.name}, your Awokin`} /></div>
                        ) : (
                          <div className="tcard-art"><ElementGlyph element={card.element as GlyphElement} width={54} height={54} /></div>
                        )}
                        <div className="tcard-stats"><span>⚔ {card.power}</span><span>❤ {card.toughness}</span><span className="cost-chip">⚡{cost}</span></div>
                        {selected && cardBorder.imageUrl && <img className={`card-border-frame fit-${cardBorder.fit ?? "hug"}`} src={cardBorder.imageUrl} alt="" aria-hidden="true" />}
                      </div>
                    );
                  })}
                </div>
                {selectedCard ? (
                  <p className="cast-hint">Casting <strong>{selectedCard.name}</strong> — it answers at your side: tap purified ground on your own hex or one beside it to set it standing (⚡{castCostOf(selectedCard)}). Once it stands, tap the Awokin itself to give it orders: march, follow, heal, strike the curse, recall.</p>
                ) : you.bound ? (
                  <p className="quiet small">Your roster — every Awokin of <strong>{you.bound}</strong> stands ready, sent to you alone. Tap one to cast it onto the field.</p>
                ) : (
                  <div className="bind-strip">
                    <p className="quiet small">Your roster — sent to you alone. These are stand-in cards: bind your Tender and your own Awokin take their places, true faces and all. Take a code in the game (the 🎲 The Table panel at the screen's right edge), then spend it here.</p>
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
            {tab === "II" && (
              <div className="arts-list">
                <PourRow hue={pourHue} setHue={(h) => { setPourHue(h); setPourPts(0); }} />
                {Object.values(defs).filter(d => d.kind === "ward").map(d => {
                  const formName = d.forms[pourHue] ?? d.root;
                  const locked = !you.wardRuneUnlocked;
                  return (
                    <button key={d.key} className={`working-card${placing?.root === d.key ? " selected" : ""}`} disabled={locked}
                      onClick={() => { setPlacing(placing?.root === d.key ? null : { kind: "ward", root: d.key }); setWardAnchor(null); setBladePicks([]); }}
                      title={locked ? `Wakes at Tender Lv 3 — you stand at Lv ${you.tenderLevel ?? 1}` : `${formName} — ⚡${d.cost}. Tap, choose the hex your Awokin holds, then its neighbour.`}>
                      {d.glyph ? <img src={d.glyph} alt="" style={{ filter: `${HUE_FILTERS[pourHue]} drop-shadow(0 0 6px ${HUE_GLOWS[pourHue]})` }} /> : <span className="heal-medal">✦</span>}
                      <span className="working-text">
                        <strong>{locked ? "🔒 " : ""}{formName}</strong>
                        <em>{d.root} · Ward · ⚡{d.cost}</em>
                        <span>{d.blurb}</span>
                      </span>
                    </button>
                  );
                })}
                <p className="quiet small">Wards are walls: they stand on a hex's edge and answer what crosses it. A ward is written for one battle — when the wave breaks, the light fades. The hue names and dresses the working in this first seating; its elemental twists wake with your attunement.</p>
              </div>
            )}
            {tab === "III" && (
              <div className="arts-list">
                <PourRow hue={pourHue} setHue={(h) => { setPourHue(h); setPourPts(0); }} />
                <button className={`working-card${placing?.kind === "heal" ? " selected" : ""}`}
                  onClick={() => { setPlacing(placing?.kind === "heal" ? null : { kind: "heal", root: "heal" }); setWardAnchor(null); setBladePicks([]); }}
                  title={`Heal — restore ${you.healAmount ?? 5} HP to one of your standing Awokin · ⚡${healDef?.cost ?? 2}`}>
                  {healDef?.glyph ? <img src={healDef.glyph} alt="" style={{ filter: `${HUE_FILTERS[pourHue]} drop-shadow(0 0 6px ${HUE_GLOWS[pourHue]})` }} /> : <span className="heal-medal">✚</span>}
                  <span className="working-text">
                    <strong>Heal · Tier {you.healTier ?? 1}</strong>
                    <em>The mending art · ⚡{healDef?.cost ?? 2} · yours from Tender Lv 1</em>
                    <span>Restore {you.healAmount ?? 5} HP to one of your standing Awokin. In our lore, the healers are the Binders.</span>
                  </span>
                </button>
                {Object.values(defs).filter(d => d.kind === "binding" && d.engine === "springleaf").map(d => {
                  const formName = d.forms[pourHue] ?? d.root;
                  const locked = !you.wardRuneUnlocked;
                  return (
                    <button key={d.key} className={`working-card${placing?.root === d.key ? " selected" : ""}`} disabled={locked}
                      onClick={() => { setPlacing(placing?.root === d.key ? null : { kind: "ward", root: d.key }); setWardAnchor(null); setBladePicks([]); }}
                      title={locked ? `Wakes at Tender Lv 3 — you stand at Lv ${you.tenderLevel ?? 1}` : `${formName} — ⚡${d.cost}. Tap, choose the hex your Awokin holds, then the hex the grove roots on.`}>
                      {d.glyph ? <img src={d.glyph} alt="" style={{ filter: `${HUE_FILTERS[pourHue]} drop-shadow(0 0 6px ${HUE_GLOWS[pourHue]})` }} /> : <span className="heal-medal">🌿</span>}
                      <span className="working-text">
                        <strong>{locked ? "🔒 " : ""}{formName}</strong>
                        <em>{d.root} · Binding · ⚡{d.cost}</em>
                        <span>{d.blurb}</span>
                      </span>
                    </button>
                  );
                })}
                {Object.values(defs).filter(d => d.kind === "rune" || d.kind === "spell").map(d => {
                  const formName = d.forms[pourHue] ?? d.root;
                  const locked = !you.wardRuneUnlocked;
                  return (
                    <button key={d.key} className={`working-card${placing?.root === d.key ? " selected" : ""}`} disabled={locked}
                      onClick={() => { setPlacing(placing?.root === d.key ? null : { kind: "rune", root: d.key }); setWardAnchor(null); setBladePicks([]); }}
                      title={locked ? `Wakes at Tender Lv 3 — you stand at Lv ${you.tenderLevel ?? 1}` : `${formName} — ⚡${d.cost}. Tap, then write it on a hex's ground.`}>
                      {d.glyph ? <img src={d.glyph} alt="" style={{ filter: `${HUE_FILTERS[pourHue]} drop-shadow(0 0 6px ${HUE_GLOWS[pourHue]})` }} /> : <span className="heal-medal">✦</span>}
                      <span className="working-text">
                        <strong>{locked ? "🔒 " : ""}{formName}</strong>
                        <em>{d.root} · {d.kind === "spell" ? "Spell" : "Rune"} · ⚡{d.cost}</em>
                        <span>{d.blurb}</span>
                      </span>
                    </button>
                  );
                })}
                <p className="quiet small">Runes are ground-writing: they wait in a hex's floor and spring when the dark stands on them — binding everything on the hex at once. One writing per hex; a rune is spent when it springs (the Blade hums on for one more).</p>
              </div>
            )}
            {tab === "IV" && (
              <div className="arts-list">
                <p className="quiet">Potions and carried things will gather here as the world deals them. What you write down yourself rides in your packing, under the Party.</p>
              </div>
            )}
          </>
        ) : (
          <p className="watcher-line">You are watching the Table. Bind in the game to be dealt a hand — the shared zones are yours to see; the hands are not.</p>
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
