import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Awakened, type TerritoryTile, type FieldPlacement, type EdgeWork } from "./api";
import { useTerrainArt, terrainImgFor, stageForTile, trayStageOf } from "./terrainArt";
import { WALL_STYLES } from "./wallArt";
import EnergyTimer from "./EnergyTimer";
import { useCardBorder } from "./cardBorder";
import hallBanner from "./assets/hall-of-champions.jpg";
import meteorGif from "./assets/meteor-rain.gif";

import FieldAwoken from "./FieldAwoken";
import { playSummonFx, playRecallPoof, playFigureRise, figureArtEls } from "./summonFx";
import { TENDER_CLASSES, tenderDirOf, tenderPose, tenderCastPose, CAST_MS, type TenderClassId, type TenderDir } from "./tenderArt";
import { WEAPONS, WEAPON_ORDER, weaponImg, shieldImg, type WeaponKey } from "./weaponArt";
import { WORKING_DEFS } from "./workingsData";
import { coarsePointer, loadHotbar, saveHotbar, toggleHotbarKey, HOTBAR_MAX } from "./hotbar";
import GroundWheel, { type WheelEntry, type WheelTabId } from "./GroundWheel";
import { createJumpEngine, jumpPress, jumpPoseInfo, jumpAirborne, jumpApex, jumpFlipped, jumpRuned, JPHYS, type JumpEngine } from "./jump";
import { Corner, elementForPiece, type Element } from "./App";
import { randomWhisper, pickReturnReport } from "./whispers";
import Friends from "./Friends";
import { useCourtMarks } from "./courtMarks";
import { trackPlayer, type TrackData } from "./trackPlayer";
import Battleground from "./Battleground";
import BuildingMenu, { buildingImage, wheatStageImage, dreamWeedStageImage } from "./BuildingMenu";
import WarGrounds from "./WarGrounds";
import type { MapWorking, GrimoireState } from "./api";
import grimGlyphEngine from "./assets/glyphs/engine.png";
import grimGlyphStandard from "./assets/glyphs/standard.png";
import grimGlyphBeacon from "./assets/glyphs/beacon.png";
import grimGlyphBlade from "./assets/glyphs/blade.png";
import grimGlyphBlades from "./assets/glyphs/blades.png";
import grimGlyphCoil from "./assets/glyphs/coil.png";
import { ANIMATED_GLYPH } from "./effects";
const GRIM_BUNDLED: Record<string, string> = { seal: ANIMATED_GLYPH.seal, engine: grimGlyphEngine, standard: grimGlyphStandard, trees: ANIMATED_GLYPH.trees, beacon: grimGlyphBeacon, lattice: ANIMATED_GLYPH.lattice, blade: grimGlyphBlade, blades: grimGlyphBlades, shard: ANIMATED_GLYPH.shard, coil: grimGlyphCoil };
/** The hues of the Written Light — the grimoire's filter recipes,
 *  the same as the Table's (Table.tsx). */
const GRIM_HUE_FILTERS: Record<string, string> = {
  unaligned: "none",
  tide: "hue-rotate(155deg) saturate(1.25)",
  sky: "hue-rotate(212deg) saturate(.5) brightness(1.3)",
  stone: "hue-rotate(-8deg) saturate(1.45) brightness(.97)",
  root: "hue-rotate(74deg) saturate(1.15)",
  fire: "hue-rotate(-30deg) saturate(1.6) brightness(1.06)",
};
const GRIM_HUE_GLOWS: Record<string, string> = { unaligned: "#ffd98a", tide: "#57c8ff", sky: "#cdb9ff", stone: "#e8a33d", root: "#7dd069", fire: "#ff7a33" };
import AspectCelebration from "./AspectCelebration";
import { ElementGlyph, type GlyphElement } from "./glyphs";
import { AspectAttunement } from "./AspectAttunement";
import { elementPalette } from "./palette";
import { useEnemyArt, enemyImgFor, frayFaceSrc } from "./enemyArt";
import { FrayFaceSvgImage } from "./EnemyFace";
import Tutorial, { tutorialComplete } from "./Tutorial";
import tideImg from "./assets/terrain-iso/tide-v3.png";
import skyImg from "./assets/terrain-iso/sky-v3.png";
import stoneImg from "./assets/terrain-iso/stone-v3.png";
import rootImg from "./assets/terrain-iso/root-v3.png";
import neutralImg from "./assets/terrain-iso/neutral-v3.png";
import cursedImg from "./assets/terrain-iso/cursed-v3.png";

const TERRAIN: Record<string, string> = {
  tide: tideImg, sky: skyImg, stone: stoneImg, root: rootImg,
  neutral: neutralImg, cursed: cursedImg,
};

// Per-key seating offsets for the tile <image>, in units of s (the map
// tile size), converted from source px at the image's render scale
// (dx: ×2.41/1920, dy: ×1.608/1280). Five tiles share one canvas
// template and need none; neutral's slab sits off-template in its own
// canvas (+94, −24 source px from the shared registration), so only
// neutral is nudged to seat its painted face on the lattice point.
const TERRAIN_IMG_OFFSET: Record<string, { dx: number; dy: number }> = {
  neutral: { dx: -0.1180, dy: 0.0302 },
};

// Per-key render placement for art that leaves the shared 1920x1280
// template. Nigel's cursed tile (v3, hand-drawn 2026-10-14) carries
// flame-wisps rising above its face, so its canvas is 1920x1510 with
// the face centre at (960, 790): h is the render height in units of s,
// dy lifts the image so the face — never the canvas — seats the tile.
// Content-true placement for the buildings that stand alone
// (Nigel, 2026-10-15): each canvas was measured for where its ink
// actually sits, so the BUILDING — not its transparent canvas — is
// what centers on the hex. aspect = canvas W/H; (cx, cy) = the ink's
// centre as canvas fractions; hFrac = the ink's share of the height;
// displayH = the ink's height in tile-widths (the Hall a bit bigger
// than the Tower, on his measure).
const BUILDING_PLACE: Record<string, { aspect: number; cx: number; cy: number; hFrac: number; displayH: number }> = {
  "watchtower": { aspect: 0.3922, cx: 0.5194, cy: 0.5458, hFrac: 0.8874, displayH: 2.0 },
  "hall-of-champions": { aspect: 0.5350, cx: 0.5249, cy: 0.4999, hFrac: 0.9998, displayH: 2.35 },
};

const TERRAIN_IMG_PLACE: Record<string, { dy: number; h: number }> = {
  cursed: { dy: -0.3067, h: 1.8968 },
};

// ── THE hex geometry — one source for map, overlays, and hit-testing ──
//
// The polygon IS the painted face. Fix list #13 drew the Wigner–Seitz
// (Voronoi) cell of the tile lattice — but a Voronoi cell's edges are
// the perpendicular bisectors of the neighbor vectors, and the painted
// face's slants are not: measured, that cell is 1459×961 source px
// against a face of 1730×944, so the #13 outlines crossed the painted
// edges along every slant and no basis correction could ever seat
// them. (Before #13 it was worse: a hand-tuned regular hexagon that
// shared nothing with the lattice at all.)
//
// Measured 2026-10-13 (rim-fit sweep of all six terrain PNGs, ±5 px):
// the FACE_HEX polygon below, and the lattice that translates it —
// E (1292, 470), SE (0, 948) per 796 source px. The face tiles by
// translation: its edge midpoints sit at ±E/2, ±SE/2, ±(E−SE)/2 within
// painting tolerance, so adjacent polygons share full edges by
// construction. Every hex drawn over the map — terrain tint, click
// target, hover, mist, selection — is this face at the tile's lattice
// position, so any set of them reads as ONE fitted hexmap at every
// zoom/pan, and the click target is literally the hex you see.
// The ART is canonical: where measurement and art disagree, the code
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
/** The hex's base size — the boundary every Awoken and building
 *  lives inside. Nigel (2026-10-15): the hexes were easy to clutter,
 *  so the base grew 24 → 36, still crowded to his eye, then → 54
 *  (each hex's floor area ×5 over the original). EVERY
 *  position on this map derives from this one constant times the
 *  view's zoom — a single source, so the lattice can never drift. */
export const HEX_BASE_SIZE = 54;
/** Buildings keep their own measure: the size they had when the hex
 *  base was 36. The hexes grew for room; the buildings did not grow
 *  with them (Nigel, 2026-10-15). */
export const BUILDING_BASE_SIZE = 36;
/** The eight facings as unit vectors — the weapon's hunting
 *  tips aim along the Tender's facing when no dark stands on
 *  the field (the Proving Ground's fallback, ported 2026-10-20). */
const DIR_VEC: Record<string, [number, number]> = {
  E: [1, 0], SE: [Math.SQRT1_2, Math.SQRT1_2], S: [0, 1], SW: [-Math.SQRT1_2, Math.SQRT1_2],
  W: [-1, 0], NW: [-Math.SQRT1_2, -Math.SQRT1_2], N: [0, -1], NE: [Math.SQRT1_2, -Math.SQRT1_2],
};
function isoOffset(q: number, r: number, size: number): { px: number; py: number } {
  const { u, v } = isoBasis(size);
  return { px: q * u[0] + r * v[0], py: q * u[1] + r * v[1] };
}

/** A tile's screen center for a given camera — the SAME math as
 *  renderGrid's tilePos (origin 250,170, pan, tray lift), factored
 *  out so the Tender's glide engine, which lives outside renderGrid,
 *  reads the land through the one geometry and can never drift from
 *  what is drawn. */
/** A floating isle's hover above its own ground (the Building
 *  System, 2026-10-19): the risen tile floats about half a hex
 *  above the newborn beneath it — near the Sage's leap peak, so
 *  a jump at its height reads as landing on the isle's face. */
export function floatLift(size: number): number { return Math.round(size * 0.48); }

function tileCenterScreen(t: { q: number; r: number; height?: number; z?: number }, pan: { x: number; y: number }, zoom: number): { cx: number; cy: number } {
  const size = HEX_BASE_SIZE * zoom;
  const TRAY_LIFT = Math.round(size * 0.2);
  const { px, py } = isoOffset(t.q, t.r, size);
  return { cx: 250 + px + pan.x, cy: 170 + py + pan.y - (Math.max(1, t.height || 1) - 1) * TRAY_LIFT - ((t.z ?? 0) > 0 ? floatLift(size) : 0) };
}

/** The inverse of tileCenterScreen for ground points: a
 *  screen point read back into FRACTIONAL axial
 *  coordinates. The click law's blips become standing
 *  points through this door (Nigel, 2026-10-23): a dragged
 *  point is a place on the land, not a pixel, and it is
 *  sent to the march verb whole — never rounded to the
 *  centre of the hex it happens to fall in. */
function screenToAxial(x: number, y: number, pan: { x: number; y: number }, zoom: number): { q: number; r: number } {
  const size = HEX_BASE_SIZE * zoom;
  const { u, v } = isoBasis(size);
  const px = x - 250 - pan.x, py = y - 170 - pan.y;
  const det = u[0] * v[1] - v[0] * u[1];
  return { q: (px * v[1] - py * v[0]) / det, r: (u[0] * py - u[1] * px) / det };
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

/** The six wedge points of a hex (Nigel, 2026-10-18 — his design):
 *  the face divides into six FLAT-EDGED triangles — centre plus two
 *  neighbouring corners each — and the Dream Shroom's plots sit at
 *  their centroids, fitted evenly at the six points. Wedge i lies
 *  between corners i and i+1 (0 = the top wedge, then clockwise, in
 *  the FACE_HEX order). Never a pointy pie slice: the triangle's
 *  outer edge is the hex's own straight side. */
function hexWedgePoint(cx: number, cy: number, size: number, wedge: number): { x: number; y: number } {
  const verts = hexCellVertices(cx, cy, size);
  const w = ((wedge % 6) + 6) % 6;
  const a = verts[w], b = verts[(w + 1) % 6];
  return { x: cx + (a[0] - cx + (b[0] - cx)) / 3, y: cy + (a[1] - cy + (b[1] - cy)) / 3 };
}

/** The wedge a standing shroom holds: its stored wedge, or — for a
 *  row planted before the wedges were law — its seat by age among
 *  the hex's shrooms, exactly as the server seats it. */
function shroomWedgeOf(b: any, siblingsByAge: any[]): number {
  if (typeof b.wedge === "number") return b.wedge;
  const idx = siblingsByAge.findIndex(s => s.id === b.id);
  return idx >= 0 ? idx : 0;
}

/** Canonical wall edge key — MUST match the server (placeWall): the
 *  edge lives under the lexicographically smaller of its two tiles,
 *  so a shared border is one wall from either side. Dirs follow the
 *  FACE_HEX corner order (0 = top edge, then clockwise). */
const WALL_DIR_DELTAS: [number, number][] = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];
const WALL_OPPOSITE = [3, 4, 5, 0, 1, 2];
function canonicalWallEdgeKey(q: number, r: number, dir: number): string {
  const nq = q + WALL_DIR_DELTAS[dir][0], nr = r + WALL_DIR_DELTAS[dir][1];
  if (nq < q || (nq === q && nr < r)) return `${nq},${nr},${WALL_OPPOSITE[dir]}`;
  return `${q},${r},${dir}`;
}

interface Props {
  tenderItems: Awakened[];
  assets: { sourceId: string; name: string; imageUrl: string; category: string }[];
  onUpdate: () => void;
  /** The First Patrol (Wake, Nigel 2026-10-17): Awoken ids sent from the
   *  wake screen's patrol banner. They arrive gathered — as the first
   *  claim's company when no ground is held yet, or readied for battle
   *  when ground already stands. */
  initialPatrolIds?: number[];
  /** The book button at the top of the locked stack
   *  (Nigel, 2026-10-17): My Deck, the same on both
   *  screens — it toggles the collection panel, which
   *  renders above the Terrain as above the home. */
  onToggleDeck?: () => void;
  deckOpen?: boolean;
  /** The Skill Zodiac's door (Nigel's directive via Law,
   *  2026-10-17): the tree-glyph button and the attunement
   *  panel's bottom entry both open the wheel. */
  onOpenZodiac?: () => void;
}


// MARCH SPEED LAW (War-Ground, Nigel 2026-10-16): a walker's pace is
// its element's gait — sky quickest, stone slowest — weighted by
// SIZE, and size is LEVEL (the ×1.25-per-level growth the map draws).
// The trade-off is the law's heart: the more powerful an Awoken, the
// harder it is to move — speed divides by the square root of its
// growth, so a Lv10 sky veteran crosses a hex in ~4.3s where a Lv10
// stone one needs ~12.2s, and the young outrun them both. Mixed
// parts average by their sum; a part with no filed element votes
// the middle road (elementForPiece: the filing is the only judge).
const MARCH_SECONDS_PER_HEX: Record<string, number> = { sky: 1.6, fire: 2.2, tide: 2.6, root: 3.2, stone: 4.5, neutral: 3.0 };
function hexDistanceAxial(aq: number, ar: number, bq: number, br: number): number {
  return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs((aq + ar) - (bq + br))) / 2;
}

function marchSecondsPerHex(a: Awakened): number {
  const layers = a.layers ?? [];
  let pace = MARCH_SECONDS_PER_HEX.neutral;
  if (layers.length) {
    pace = layers.reduce((sum, l) => sum + (MARCH_SECONDS_PER_HEX[elementForPiece(l.name, (l as any).element)] ?? MARCH_SECONDS_PER_HEX.neutral), 0) / layers.length;
  }
  const level = Math.max(1, (a as any).level ?? Math.floor(Math.sqrt(((a as any).experience ?? 0) / 100)) ?? 1);
  return pace * Math.sqrt(Math.pow(1.25, level - 1));
}

// Dominant element of an Awoken, for corner motifs.
function dominantElement(a: Awakened): Element {
  const counts: Record<Element, number> = { tide: 0, sky: 0, stone: 0, root: 0, fire: 0 };
  for (const layer of a.layers ?? []) {
    const el = elementForPiece(layer.name, (layer as any).element);
    if (el !== "neutral") counts[el] = (counts[el] ?? 0) + 1;
  }
  let best: Element = "root";
  let max = -1;
  for (const [el, n] of Object.entries(counts)) {
    if (n > max) { max = n; best = el as Element; }
  }
  return best;
}

// The hex's four fixed keystone points stood here until
// 2026-10-23, when the standing-point system came out whole
// (Nigel): a figure now stands on its own stored free point
// (FieldPlacement.posQ/posR), and both readers this table
// served — the field render and the orders anchor — read
// the point instead. Nothing stands on a keystone any more.

// ORDERS BELOW THE FIGURE (Nigel, 2026-10-18): the stance picker and
// the march / company / patrol bars hang BELOW the Awoken (or the
// chosen company) they command — on the map, never in the fixed
// strip behind the deck hand. A surface asks for an anchor in
// percent of the territory view (the same 500×340 fiction the picker
// has always used); after layout, if that anchor would push the
// surface past the view's foot or sides, it is slid just inside —
// clamped into view, never flipped back behind the hand. The
// surfaces are translate(-50%, 0): the anchor is their top-centre.
function useClampedAnchor(desired: { xPct: number; yPct: number } | null) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [clamped, setClamped] = useState<{ xPct: number; yPct: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !desired) {
      if (clamped) setClamped(null);
      return;
    }
    const parent = el.offsetParent as HTMLElement | null;
    if (!parent) return;
    const viewW = parent.clientWidth, viewH = parent.clientHeight;
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!viewW || !viewH || !w || !h) return;
    let xPx = (desired.xPct / 100) * viewW;
    let yPx = (desired.yPct / 100) * viewH;
    xPx = Math.min(Math.max(xPx, w / 2 + 4), Math.max(w / 2 + 4, viewW - w / 2 - 4));
    yPx = Math.min(yPx, Math.max(0, viewH - h - 6));
    const next = { xPct: (xPx / viewW) * 100, yPct: (yPx / viewH) * 100 };
    if (!clamped || Math.abs(next.xPct - clamped.xPct) > 0.01 || Math.abs(next.yPct - clamped.yPct) > 0.01) {
      setClamped(next);
    }
  });
  if (!desired) return { ref, xPct: null as number | null, yPct: null as number | null };
  const eff = clamped ?? desired;
  return { ref, xPct: eff.xPct as number | null, yPct: eff.yPct as number | null };
}

export default function Territory({ tenderItems, assets, onUpdate, initialPatrolIds, onOpenZodiac, onToggleDeck, deckOpen }: Props) {
  const queryClient = useQueryClient();
  // The attunement panel works from this query's cache; the moment an
  // aspect is spent (applied or combined away), the cache must die —
  // a stale panel once offered already-consumed aspects and the server
  // answered "Aspect not found." (Nigel's report, 2026-10-17.)
  const refreshAspects = () => { queryClient.invalidateQueries({ queryKey: ["aspectAttunement"] }); };
  // The creator's uploaded stage art, shared cache with the workshop's
  // Terrain Stages section; tiles resolve through terrainImgFor below.
  const { data: terrainArt } = useTerrainArt();
  // The creator's live enemy art (UI Workspace uploads/selection),
  // resolved server-side; every enemy on the field wears it.
  const { data: enemyArtData } = useEnemyArt();
  const fireAspectImg = assets.find(a => a.category === "aspect" && (a as any).element === "fire" && /II/.test(a.name))?.imageUrl
    ?? assets.find(a => a.category === "aspect" && (a as any).element === "fire")?.imageUrl
    ?? null;
  const [selectedBuilding, setSelectedBuilding] = useState<any>(null);
  const [showBuildingMenu, setShowBuildingMenu] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialDone, setTutorialDone] = useState(() => localStorage.getItem("awoken-tutorial-done") === "1");
  const [showTutorial, setShowTutorial] = useState(false);
  const [objectivesMet, setObjectivesMet] = useState(false);
  const [buildings, setBuildings] = useState<any[]>([]);

  const [gameConfig, setGameConfig] = useState<any>(null);
  const [pendingTile, setPendingTile] = useState<number | null>(null);
  // Safety: clear pendingTile if selectedBuilding is lost
  useEffect(() => {
    if (pendingTile !== null && !selectedBuilding) {
      setPendingTile(null);
      setSelectedBuilders([]);
    }
  }, [pendingTile, selectedBuilding]);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [selectedBuilders, setSelectedBuilders] = useState<number[]>([]);
  // The Dream Shroom's chosen wedge in the builder popup (Nigel,
  // 2026-10-18); null lets the popup rest on the first free wedge.
  const [pendingWedge, setPendingWedge] = useState<number | null>(null);
  const [tiles, setTiles] = useState<TerritoryTile[]>([]);
  // The First Seed (Nigel via Wake, 2026-10-17): a fresh Tender holds
  // no ground — the empty state is where the Last Bastion begins, not
  // a dead end. The world is sown on mount (ensureFirstSeed), and the
  // seed's hold is how the first ground is earned.
  const [territoryLoaded, setTerritoryLoaded] = useState(false);
  const [seedTeam, setSeedTeam] = useState<number[]>([]);
  const [seedBusy, setSeedBusy] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [sparkAnimation, setSparkAnimation] = useState<{ phase: "center" | "fly" } | null>(null);
  const [fireFound, setFireFound] = useState(() => localStorage.getItem("awoken-fire-found") === "1");

  const handleSparkClick = async (tileId: number) => {
    try {
      const result = await api.claimSpark({ tileId });
      // Show animation: glyph center screen, then flies to attunement
      setSparkAnimation({ phase: "center" });
      setTimeout(() => setSparkAnimation({ phase: "fly" }), 1500);
      setTimeout(() => {
        setSparkAnimation(null);
        setFireFound(true);
        localStorage.setItem("awoken-fire-found", "1");
      }, 3000);
      // Refresh tiles
      const refreshed = await api.getTerritory();
      setTiles(refreshed.tiles);
      onUpdate();
    } catch (e) {
      console.error("Spark claim failed", e);
    }
  };

  // Check tutorial objectives
  useEffect(() => {
    if (!tutorialDone && !objectivesMet && tiles.length > 0) {
      if (tutorialComplete(tiles, buildings)) {
        setObjectivesMet(true);
      }
    }
  }, [tiles, buildings, tutorialDone, objectivesMet]);
  const [placements, setPlacements] = useState<FieldPlacement[]>([]);
  // THE WHEEL'S SUMMON COMPANY (the summoning fix, Nigel
  // 2026-10-22): who the wheel's Awoken branch can call —
  // served by getTerritory with the field (summonCompanyFor
  // on the server), with the summoner's power the cast rolls
  // with and whether the Tender's stand is cursed.
  const [summoning, setSummoning] = useState<{ company: { awakenedId: number; name: string; imageUrl: string | null; power: number; toughness: number; level: number | null; cost: number }[]; summonersPower: number; standCursed: boolean }>({ company: [], summonersPower: 0, standCursed: false });
  // The company the hand does NOT hold — fielded on this
  // ground, or staged at the bastion — named with where each
  // stands, served by getTerritory beside the placements (the
  // Table's honest margin, brought to the homeland hand).
  const [elsewhere, setElsewhere] = useState<{ name: string; element: string; where: "fielded" | "staged" }[]>([]);
  const [battlePool, setBattlePool] = useState<number[]>([]); // AWAKENED IDs staged for battle, max 4 — IDs, never hand indices: an index rots the moment the hand re-derives
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [musicOn, setMusicOn] = useState(false);
  const [trackIdx, setTrackIdx] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [libraryTracks, setLibraryTracks] = useState<{ name: string; url: string }[]>([]);
  // Music's weather-mood trigger (Nigel, 2026-10-13): the server computes
  // the terrain playlist from the CURRENT world mood (her categorization,
  // see server musicMoods). The client holds refs alongside state so the
  // audio handlers never chase stale closures.
  const tracksRef = useRef<{ name: string; url: string }[]>([]);
  const trackIdxRef = useRef(0);
  const moodSeenRef = useRef<string | null>(null);
  const fadeAudio = (audio: HTMLAudioElement, to: number, ms = 1200, done?: () => void) => {
    const from = audio.volume;
    const steps = 12;
    let i = 0;
    const iv = window.setInterval(() => {
      i++;
      audio.volume = Math.max(0, Math.min(1, from + (to - from) * (i / steps)));
      if (i >= steps) { window.clearInterval(iv); done?.(); }
    }, ms / steps);
  };
  const playSongAt = (idx: number) => {
    const tracks = tracksRef.current;
    if (!tracks.length) return;
    const i = ((idx % tracks.length) + tracks.length) % tracks.length;
    trackIdxRef.current = i;
    setTrackIdx(i);
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.loop = false;
      audioRef.current.onended = () => playSongAt(trackIdxRef.current + 1);
    }
    const a = audioRef.current;
    a.src = tracks[i].url;
    a.volume = 0.24;
    a.play().catch(() => {});
  };
  const applyPlaylist = (pl: { tracks: { name: string; url: string }[] }) => {
    tracksRef.current = pl.tracks;
    setLibraryTracks(pl.tracks);
    trackIdxRef.current = 0;
    setTrackIdx(0);
  };
  // Load the mood's playlist for the terrain page and arm the music
  useEffect(() => {
    api.getTerrainPlaylist().then(pl => {
      moodSeenRef.current = pl.mood;
      applyPlaylist(pl);
      if (pl.tracks.length) setMusicOn(true); // starts on first toggle tap (browser gesture rule), as before
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The trigger: when a fetched mood differs from the last one seen, the
  // weather has turned — re-ask for the playlist and, if the music is
  // sounding, crossfade the song over to the new mood's keeping.
  useEffect(() => {
    const iv = window.setInterval(async () => {
      try {
        const m = await api.getMood();
        if (!moodSeenRef.current) { moodSeenRef.current = m.mood; return; }
        if (m.mood === moodSeenRef.current) return;
        moodSeenRef.current = m.mood;
        setMood(m);
        const pl = await api.getTerrainPlaylist();
        const sounding = !!audioRef.current && !audioRef.current.paused;
        applyPlaylist(pl);
        if (sounding) {
          const a = audioRef.current!;
          fadeAudio(a, 0, 1200, () => playSongAt(0));
        }
      } catch {}
    }, 60000);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [zoom, setZoom] = useState(1);
  // ── THE TENDER'S BODY ON THE HOMELAND (Nigel, 2026-10-19) ──────
  // The server holds the ANCHOR: the hex the Tender stands on
  // (getTerritory's tender field — null until a class is chosen;
  // the Class Gate: no choosing, no figure). The GLIDE between
  // anchors is local and presentational, as every march on this
  // map is: the figure walks freely in screen space by key or by
  // tap, and the hex it crosses into is reported back
  // (setTenderTile), so the server keeps the truth of where he
  // stands and his followers muster to that hex. The engine's
  // clocks and mirrors live below, beside refreshTerritory.
  const [tenderStand, setTenderStand] = useState<{ tileId: number; classKey: string; weaponKey?: string | null; hp?: number; maxHp?: number; down?: boolean; downUntil?: number | null; fellCount?: number } | null>(null);
  // PHASE D — THE BLIND FRAY on the face: the homeland's dark,
  // served by getTerritory beside the Tender's own body — and,
  // since the homeland weapon referee (Nigel, 2026-10-20), with
  // the wound track his weapon writes on them.
  const [wanderers, setWanderers] = useState<{ id: number; tileId: number; kind: string; posQ: number; posR: number; hp?: number; maxHp?: number }[]>([]);
  // THE REAL-TIME BATTLE's face (Nigel, 2026-10-23): the
  // lighthouse and its ledgers, and the defence works the
  // defenders raise — all served by the territory read.
  const [battle, setBattle] = useState<{ shadowMatter: number; protectionBankMs: number; lighthouseLit: boolean; waveIntensity: number }>({ shadowMatter: 0, protectionBankMs: 0, lighthouseLit: false, waveIntensity: 1 });
  const [defenceWorks, setDefenceWorks] = useState<{ id: number; placementId: number; kind: string; nodes: { q: number; r: number; hp: number; maxHp: number }[] }[]>([]);
  // THE WEAPON'S WITNESS (Nigel, 2026-10-20): the server serves
  // the last strike its homeland referee struck; when a NEWER
  // strike arrives, the weapon lunges at that foe's hex on the
  // map's own clock. The client animates only what the server
  // struck — no blow is ever invented on this side of the glass.
  const [weaponStrikeAnim, setWeaponStrikeAnim] = useState<{ tileId: number; felled: boolean; localAt: number } | null>(null);
  const strikeSeenRef = useRef(0);
  const noteWeaponStrike = (s: { tileId: number; at: number; felled: boolean } | null | undefined) => {
    if (!s || s.at <= strikeSeenRef.current) return;
    strikeSeenRef.current = s.at;
    setWeaponStrikeAnim({ tileId: s.tileId, felled: s.felled, localAt: Date.now() });
  };
  // THE WEAPON'S FLIGHT (the Proving Ground's motion, ported
  // 2026-10-20): a witnessed strike becomes a flight of the
  // weapon itself — the bladed forms jab and return on the
  // Ground's own timing, the arrow steers its homing circuit
  // out and loops home with its fading tracer. The flight is
  // integrated on the map's renders; while one is live, the
  // weapon keeps its own 50 ms clock — the stride clock's
  // cadence — so the flight is drawn at the body's own rate.
  // The referee still strikes every blow: a flight begins
  // only where noteWeaponStrike witnessed one, and it flies
  // only to that foe's hex.
  const weaponFlightRef = useRef<null | {
    strikeLocalAt: number; key: WeaponKey; tileId: number;
    fx: number; fy: number; tx: number; ty: number;
    x: number; y: number; heading: number; phase: "out" | "loop";
    lastT: number; shx: number; shy: number;
  }>(null);
  const weaponTrailRef = useRef<{ x: number; y: number; t: number }[]>([]);
  const weaponLandedRef = useRef<{ x: number; y: number; at: number; felled: boolean } | null>(null);
  // The map's own clock (marchNow) only runs while a patrol
  // or a march is on the road — at rest the map is a still
  // painting, which is why the weapon hung frozen with it.
  // The weapon keeps a clock of its own while one is wielded:
  // the map's 125 ms cadence at rest (the orbit's period is
  // eight seconds; the map's motion has always lived at this
  // grain), and the stride's 50 ms while a flight is live, so
  // the arrow's steering is drawn at the body's own rate.
  const weaponTickRef = useRef(0);
  const [, setWeaponTick] = useState(0);
  useEffect(() => {
    const iv = window.setInterval(() => {
      if (!tenderStandRef.current?.weaponKey) return;
      const now = Date.now();
      if (weaponFlightRef.current || now - weaponTickRef.current >= 120) {
        weaponTickRef.current = now;
        setWeaponTick(t => t + 1);
      }
    }, 50);
    return () => window.clearInterval(iv);
  }, []);
  const [tenderFig, setTenderFig] = useState<{ x: number; y: number; dir: TenderDir; walking: boolean; step: number; jh?: number; flipU?: number | null } | null>(null);
  // THE JUMP (Nigel, 2026-10-19) come home to the real map: the
  // Proving Ground's engine (client/src/jump.ts) rides the stride
  // clock — Space leaps, the class's own arc raises the figure,
  // and the traversal law judges his crossings (walls, wards,
  // two-tray rises, floating isles) on the stride and the anchor
  // report, with the server's setTenderTile as the final word.
  const tenderJumpRef = useRef<JumpEngine>(createJumpEngine());
  const tenderWallsRef = useRef<EdgeWork[]>([]);
  // THE BUILDING SYSTEM's face (Nigel, 2026-10-19): the terrain
  // bank the land has paid, and the open build card — a ghost hex
  // on the void, or a work already rising.
  const [terrainBank, setTerrainBank] = useState(0);
  const [buildSel, setBuildSel] = useState<{ kind: "ghost"; q: number; r: number } | { kind: "tile"; tileId: number } | null>(null);
  const [buildPools, setBuildPools] = useState<Record<string, number> | null>(null);
  /** The locator's pulse (2026-10-19): when the compass's 🧭 is
   *  tapped, the camera swings to the Tender and a gold ring
   *  breathes over him for a moment — on a grown map a planted
   *  figure needs a way to be FOUND. */
  const [findPulseAt, setFindPulseAt] = useState(0);
  // THE TENDER CONTROLLER, THE WHEEL, THE HOTBAR (Nigel,
  // 2026-10-19): on a touch hand, tapping the Tender himself
  // pops his controller (a glide pad driving this engine's
  // own held-keys, the wheel's button beside it); on PC a
  // right-click anywhere on the map — mid-glide — opens the
  // same radial the Table wears. The wheel's branches are all
  // live: Weapon (the real wield), Ability (Follow, the
  // locator), and — since Homeland Casting (Nigel, 2026-10-20)
  // — the spell branches: the homeland keeps the Table's own
  // casting law now, and a row readies its working in the
  // hand's cast mode for the tap-to-cast on the land.
  const touchForm = coarsePointer();
  const [tenderCtl, setTenderCtl] = useState(false);
  const [tenderRadial, setTenderRadial] = useState<{ x: number; y: number } | null>(null);
  // THE WHEEL, RESTORED (Nigel, 2026-10-20): the branch
  // standing open on the Ground's two-tier radial — the tab
  // keeps its place between openings, as the Ground's does.
  const [wheelTab, setWheelTab] = useState<WheelTabId>("spell");
  const TERRITORY_HOTBAR_KEY = "awokin-hotbar-territory";
  const [hotbarKeys, setHotbarKeys] = useState<string[]>(() => loadHotbar(TERRITORY_HOTBAR_KEY));
  const toggleHotbar = (key: string) => {
    setHotbarKeys(ks => { const next = toggleHotbarKey(ks, key); saveHotbar(TERRITORY_HOTBAR_KEY, next); return next; });
  };
  const padKeysRef = useRef<string[]>([]);
  const [padKnob, setPadKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const rightPressRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const linePressRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const tenderStandRef = useRef<{ tileId: number; classKey: string; weaponKey?: string | null } | null>(null);
  const tenderPosRef = useRef<{ x: number; y: number } | null>(null);
  const tenderAnchorRef = useRef<number | null>(null);
  const tenderKeysRef = useRef<Set<string>>(new Set());
  const tenderTargetRef = useRef<{ x: number; y: number } | null>(null);
  const tenderFacingRef = useRef<TenderDir>("S");
  const tenderTravelRef = useRef(0);
  const tenderWasMovingRef = useRef(false);
  const tenderReportRef = useRef(0);
  const tenderRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tenderTilesRef = useRef<TerritoryTile[]>([]);
  const tenderPanRef = useRef({ x: 0, y: 0 });
  const tenderZoomRef = useRef(1);
  const tenderInputBlockedRef = useRef(false);
  const [energy, setEnergy] = useState(10);
  // The energy CAP is the server's word alone (calculateMaxEnergy:
  // the doubled scale over everything owned, plus building bonuses).
  // The client once kept its own tripled formula under a comment
  // claiming the two agreed — they did not, and the battle screen
  // promised room the server refused. (Nigel's retune was 2026-10-13;
  // the client half of it was found and fixed 2026-10-16.) The cap
  // now rides the same getEnergy reply the energy number already
  // takes — EnergyTimer has always read it this way.
  const [serverMaxEnergy, setServerMaxEnergy] = useState(10);
  const refreshEnergy = async () => {
    try {
      const { energy: e, maxEnergy: m } = await api.getEnergy();
      setEnergy(e);
      setServerMaxEnergy(m);
    } catch {}
  };
  const [selectedAwoken, setSelectedAwoken] = useState<number | null>(null); // awakenedId selected on field
  const [wgTileId, setWgTileId] = useState<number | null>(null); // War-Grounds fine-edit panel: the tile under the warden's hand
  // The marching layer (War-Ground, Nigel 2026-10-16): patrol roads
  // are data; positions are derived. Setting state + the march clock.
  const [patrolSettingFor, setPatrolSettingFor] = useState<number | null>(null);
  const [patrolDraft, setPatrolDraft] = useState<number[]>([]);
  // THE ORDERS WHEEL (Nigel, 2026-10-22 — the marching-orders
  // spec, ported from the Proving Ground's proof): clicking a
  // fielded Awokin opens ITS wheel; a drag-chosen company's
  // wheel speaks for the whole selection. The wheel carries
  // March · Attack · Defend · Follow (and the rest of the
  // Awokin's doors); picking March arms the order — the next
  // tap on the land, or a line dragged
  // under the button law, is obeyed AT ONCE. The quote→confirm march bars and
  // the under-figure stance picker are retired by this law:
  // click the action, tap the target, obey — no confirm.
  const [ordersWheel, setOrdersWheel] = useState<{ ids: number[]; x: number; y: number } | null>(null);
  const [pendingMarch, setPendingMarch] = useState<{ ids: number[] } | null>(null);
  const [lineDrag, setLineDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const lineDragRef = useRef<{ sx: number; sy: number } | null>(null);
  // The taught works' arming (Nigel, 2026-10-18): a work
  // chosen from the Awokin's wheel (its Binding constellation,
  // carried into the wheel by the orders law) arms the work
  // and opens the War-Grounds panel on the warden's hex,
  // where the edge is chosen by the panel's own flow — one
  // casting path, never two.
  const [wgArmedWork, setWgArmedWork] = useState<{ kind: "ward" | "rune"; runeKind?: "snare" | "harm" | "meld" } | null>(null);
  // Feeding lives in the energy globe now (Nigel, 2026-10-18): the
  // bump re-reads the orb's own energy after a feed lands.
  const [orbBump, setOrbBump] = useState(0);
  // Drag-selection (War-Ground, Nigel 2026-10-16): a left-drag on the
  // map draws a band; the wardens inside it are chosen together and
  // can be given a company march. (By the button law, Nigel
  // 2026-10-23, the left hand always chooses on a mouse — the
  // middle hand alone moves the screen, the right only clicks.)
  const [selectedGroup, setSelectedGroup] = useState<number[]>([]);
  const [band, setBand] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const bandRef = useRef<{ cx: number; cy: number; sx: number; sy: number; active: boolean } | null>(null);
  const bandClosedAt = useRef(0);
  const panDragRef = useRef<{ cx: number; cy: number; panX: number; panY: number; moved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const svgPoint = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  };
  const bandJustClosed = () => Date.now() - bandClosedAt.current < 300;
  const [marchNow, setMarchNow] = useState(() => Date.now());
  const anyPatrol = placements.some(p => !!p.patrolPath);
  const anyMarch = placements.some(p => !!p.marchPath);
  useEffect(() => {
    if (!anyPatrol && !anyMarch && patrolSettingFor === null) return;
    const iv = window.setInterval(() => setMarchNow(Date.now()), 125);
    return () => window.clearInterval(iv);
  }, [anyPatrol, anyMarch, patrolSettingFor]);
  // ── THE SUMMON SEQUENCE (Nigel, 2026-10-23 — the Proving
  // Ground's theatre, ported whole; see summonFx.ts) ────────
  // A landed summon cast leaves its reckoning here; the
  // placements effect below plays the sequence the moment
  // the figure stands in the field. NOTHING else raises it:
  // not the first read, not a figure marching in, not a
  // newborn — only the Tender's own landed cast.
  const pendingSummonRef = useRef<{ awakenedId: number; name: string; at: number } | null>(null);
  const prevPlacementsRef = useRef<FieldPlacement[] | null>(null);
  // The Tender's cast gesture — the Ground's cast() — raised
  // by castSummon at the tap and by doCastMap at a working
  // cast's firing, each in its facing of the moment.
  const [tenderCastAt, setTenderCastAt] = useState(0);
  const tenderCastDirRef = useRef<TenderDir>("S");
  // The gesture's clock: while it plays, the map's own clock
  // ticks so tenderLayer can walk tenderArt's beats.
  useEffect(() => {
    if (!tenderCastAt) return;
    const iv = window.setInterval(() => setMarchNow(Date.now()), 100);
    const to = window.setTimeout(() => { window.clearInterval(iv); setMarchNow(Date.now()); }, CAST_MS + 150);
    return () => { window.clearInterval(iv); window.clearTimeout(to); };
  }, [tenderCastAt]);
  /** A tile's centre (the svg's own 500×340 measure) carried
   *  into client coordinates through the letterboxed frame —
   *  the fx layer's tongue. */
  const territoryToClient = (cx: number, cy: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const k = Math.min(rect.width / 500, rect.height / 340);
    return { x: rect.left + (rect.width - 500 * k) / 2 + cx * k, y: rect.top + (rect.height - 340 * k) / 2 + cy * k };
  };
  /** A standing figure's height on the screen, for a poof
   *  whose figure is already gone: the Lv 1 measure (20 units
   *  at the standing scale), carried through the frame. */
  const fieldFigureHeightClient = (): number => {
    const svg = svgRef.current;
    if (!svg) return 73;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return 73;
    return 20 * (0.8 + tenderZoomRef.current * 0.5) * Math.min(rect.width / 500, rect.height / 340);
  };
  useEffect(() => {
    const prev = prevPlacementsRef.current;
    prevPlacementsRef.current = placements;
    if (!prev) return; // the first read only seeds the reckoning — the standing field plays nothing
    const nowIds = new Set(placements.map(p => p.id));
    // Departures take the recall's poof with them — the
    // Ground's toggle the other way, at the figure's last tile.
    for (const p of prev) {
      if (nowIds.has(p.id)) continue;
      const c = tenderTileCenter(p.tileId);
      const pt = c ? territoryToClient(c.cx, c.cy) : null;
      if (pt) playRecallPoof(pt.x, pt.y, fieldFigureHeightClient());
    }
    // The landed summon: the sequence plays at the figure
    // itself, timed as it appears — shards converging at its
    // ground point while the figure rises.
    const pend = pendingSummonRef.current;
    if (!pend) return;
    if (Date.now() - pend.at > 5000) { pendingSummonRef.current = null; return; }
    const prevIds = new Set(prev.map(p => p.id));
    const stood = placements.find(p => p.awakenedId === pend.awakenedId && !prevIds.has(p.id));
    if (!stood) return;
    pendingSummonRef.current = null;
    const node = document.querySelector(`g[data-summon-fig="${pend.awakenedId}"]`);
    if (node) {
      const rect = node.getBoundingClientRect();
      playSummonFx(rect.left + rect.width / 2, rect.bottom, rect.height, { name: pend.name });
      playFigureRise(node, figureArtEls(node));
    } else {
      const c = tenderTileCenter(stood.tileId);
      const pt = c ? territoryToClient(c.cx, c.cy) : null;
      if (pt) playSummonFx(pt.x, pt.y, fieldFigureHeightClient(), { name: pend.name });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placements]);
  const patrolRoadOf = (p: { patrolPath?: string | null }): number[] => {
    try {
      const v = JSON.parse(p.patrolPath ?? "[]");
      return Array.isArray(v) ? v.filter((x: any) => typeof x === "number") : [];
    } catch { return []; }
  };
  const marchRoadOf = (p: { marchPath?: string | null }): number[] => {
    try {
      const v = JSON.parse(p.marchPath ?? "[]");
      return Array.isArray(v) ? v.filter((x: any) => typeof x === "number") : [];
    } catch { return []; }
  };
  // The road over the Tender's own ground — the client's mirror
  // of the server's curse-daring road (findAnyRoad), for quoting
  // a march before it is given. Cursed ground is priced, never
  // barred (Nigel, 2026-10-23): the mirror dares it as the
  // server does. The server's road is the one the walker walks.
  const findRoadClient = (fromId: number, toId: number): number[] | null => {
    const byId = new Map(tiles.map(t => [t.id, t]));
    const byCoord = new Map(tiles.map(t => [`${t.q},${t.r}`, t]));
    const from = byId.get(fromId), to = byId.get(toId);
    if (!from || !to) return null;
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
  };
  const fmtMarchTime = (sec: number) => {
    const s = Math.max(0, Math.round(sec));
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  };
  const PATROL_SPEED = 26; // px per second — a hex crossing in ~3.5s
  const [walls, setWalls] = useState<EdgeWork[]>([]); // edge works (server-canonical edges): wall / thorns / ward / rune
  useEffect(() => { tenderWallsRef.current = walls; }, [walls]);
  // An armed work (chosen in the radial's Binding menu) is spent the
  // moment a work action resolves into fresh walls — the laying is
  // done; a refusal leaves the walls untouched and the arm in hand.
  const wallsSeenRef = useRef<EdgeWork[] | null>(null);
  useEffect(() => {
    if (wallsSeenRef.current === null) { wallsSeenRef.current = walls; return; }
    if (wallsSeenRef.current !== walls) { wallsSeenRef.current = walls; setWgArmedWork(null); }
  }, [walls]);
  // ── The Written Light on the land (the Grimoire, Nigel 2026-10-17) ──
  // The Tender's own castings from the book: standings served by
  // getTerritory, the book itself by getGrimoire, the Lv 3 gate by
  // getTenderExp. Casting mode turns hex taps into castings: a ward
  // wants an anchor hex (ANY hex of his land, since 2026-10-20)
  // then one of its edges; a rune wants a hex's floor; Heal wants
  // a hex my wounded stand on. A tap CASTS — no confirm stands
  // between the tap and the cast (Nigel, 2026-10-20: a misscast
  // is a skill issue) — and the mode is sticky: it casts on
  // until the player sets it down, the purse refuses, or a
  // roll fizzles and the working slips from the hand.
  const [workings, setWorkings] = useState<MapWorking[]>([]);
  const [grim, setGrim] = useState<GrimoireState | null>(null);
  const [grimGate, setGrimGate] = useState<{ level: number; wardRuneUnlocked: boolean; healAmount: number }>({ level: 1, wardRuneUnlocked: false, healAmount: 5 });
  const [castMode, setCastMode] = useState(false);
  // THE ATTUNE ABILITY (Nigel, 2026-10-21): Attune is an
  // ability on the wheel — Ability → Attune → element —
  // and the readied element stands here: while it stands,
  // taps on the land lay its points (one tap, one point of
  // that element from the pools) instead of casting or
  // marching. Sticky like casting: it ends when it is set
  // down (Esc, or readying a working), or when the pool's
  // refusal speaks. The reach — his hex and its ring, plus
  // the zodiac's attunement-reach bonus — is the server's
  // reckoning, refused in its own plain words.
  const [attuneElement, setAttuneElement] = useState<string | null>(null);
  // THE HAND HAS ONE FACE (Nigel, 2026-10-22): the hand
  // holds the Awoken cards, and nothing else — the Spells
  // & Glyphs tray that once stood as its second face is
  // gone everywhere, forever ("this menu should not show
  // up anywhere ever"). Casting lives wholly in the
  // wheel: right-click opens it, its branches ready the
  // book's workings into castMode, and taps on the land
  // cast them, click after click.
  const [castSpellKey, setCastSpellKey] = useState<string | null>(null);
  // THE POUR MENU IS GONE (Nigel, 2026-10-20): no hue/points
  // choice stands between readying and casting, and powering
  // lives in the Grimoire now: the server takes no pour at a
  // cast; a cast carries what its page holds in the book.
  // THE CAST'S COLOUR IS DERIVED (Nigel, 2026-10-20 19:35):
  // the server judges each cast's hue from its page's
  // standing — this mirror of the book's judging (pageHueFor)
  // names the form a cast will wear, here in the cast
  // controls, BEFORE the tap. No hue is sent with a cast;
  // the server derives its own, and this reading only ever
  // labels. Shard Rain is judged by the pools' bands, as the
  // book judges it (the Zodiac's grants ride the server's
  // reading only, so a granted band can outrun this label —
  // the cast itself is always the server's).
  const castHueFor = (sp: { key: string; engine: string } | null | undefined): string => {
    if (!sp) return "unaligned";
    const judge = (standing: Record<string, number>): string => {
      let best = 0;
      let winners: string[] = [];
      for (const el of ["tide", "sky", "stone", "root", "fire"]) {
        const n = standing[el] ?? 0;
        if (n > best) { best = n; winners = [el]; }
        else if (n === best && n > 0) winners.push(el);
      }
      return winners.length === 1 ? winners[0] : "unaligned";
    };
    if (["seal", "trees", "lattice", "shard"].includes(sp.engine)) return judge(grim?.pageAttunements?.[sp.key] ?? {});
    if (sp.engine === "shardrain") {
      const bands: Record<string, number> = {};
      for (const el of ["tide", "sky", "stone", "root", "fire"]) bands[el] = Math.min(3, Math.floor(Math.max(0, buildPools?.[el] ?? 0) / 10));
      return judge(bands);
    }
    return "unaligned";
  };
  // The chosen card border (Nigel, 2026-10-17): the hand in the dock
  // wears the same frame as the arena and the Table.
  const cardBorder = useCardBorder();
  const [castAnchor, setCastAnchor] = useState<number | null>(null);

  const [skills, setSkills] = useState<{ awakenedId: number; skill: string }[]>([]); // Awoken skills ledger (warding / runeing)
  const [wallTargeting, setWallTargeting] = useState(false); // true when the selected Awoken is choosing a hex edge to wall
  const [applyingAspect, setApplyingAspect] = useState<any | null>(null); // aspect orb selected, tap Awoken to apply
  // An aspect looking for a card brings the Awoken face forward.
  useEffect(() => { if (applyingAspect) { setCastMode(false); } }, [applyingAspect]);
  const [applyingToTarget, setApplyingToTarget] = useState<number | null>(null); // if set, orb tap applies directly to this Awoken ID
  const [celebration, setCelebration] = useState<any | null>(null);
  const [attackTargeting, setAttackTargeting] = useState(false); // true when attack stance Awoken awaits target
  // The hex currently targeted in a tap-to-target flow (fix list #13) —
  // set on the very tap that chooses it, cleared when the flow ends or
  // is cancelled, so the gold marker never lags a server round-trip.
  const [targetHexId, setTargetHexId] = useState<number | null>(null);
  // #13 refined (Nigel): it is about the hex you are ABOUT to touch.
  // Input modality decides the manners: desktop glows on hover and
  // shines on click (commit at once); touch has no hover, so the
  // first tap raises a MIST preview and a confirm bar commits.
  const [touchMode, setTouchMode] = useState<boolean>(
    () => {
      if (typeof window === "undefined") return false;
      // An iPad is a touch device even when a keyboard makes its PRIMARY
      // pointer report "fine", and webviews disagree with Safari here —
      // (pointer: coarse) alone left Nigel's iPad on the desktop path
      // (2026-10-14: card readied, tap deployed-or-died invisibly, no
      // mist, no confirm bar). Any touch capability earns touch manners:
      // the mist + confirm flow is strictly safer than instant commit.
      const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
      return coarse || navigator.maxTouchPoints > 0 || "ontouchstart" in window;
    }
  );
  const [hoverHexId, setHoverHexId] = useState<number | null>(null);
  const [hexConfirm, setHexConfirm] = useState<{ kind: "attack" | "move" | "deploy"; tileId: number } | null>(null);
  const raiseHexConfirm = (kind: "attack" | "move" | "deploy", tileId: number) => setHexConfirm({ kind, tileId });
  const clearHexConfirm = () => setHexConfirm(null);
  // Refusals must SPEAK (Nigel's iPad, 2026-10-14: "I tapped to place and
  // nothing happened at all"). Every guard on the hex flows — staging,
  // energy, and every server refusal — lands here in words, never in a
  // silent return or a console line the player will never see.
  const [hexNotice, setHexNotice] = useState<string | null>(null);
  const hexNoticeTimer = useRef<number | null>(null);
  const showHexNotice = (msg: string) => {
    setHexNotice(msg);
    if (hexNoticeTimer.current) window.clearTimeout(hexNoticeTimer.current);
    hexNoticeTimer.current = window.setTimeout(() => setHexNotice(null), 7000);
  };
  const refusalText = (e: unknown, fallback: string) =>
    (e as { message?: string })?.message && (e as { message?: string }).message !== "Failed to fetch"
      ? (e as { message?: string }).message as string
      : fallback;
  const runHexConfirm = () => {
    const pending = hexConfirm;
    if (!pending) return;
    setHexConfirm(null);
    // The mist gives way to the committed shine while it resolves.
    setTargetHexId(pending.tileId);
    if (pending.kind === "attack") handleAttack(pending.tileId);
    else if (pending.kind === "move") handleMove(pending.tileId);
    else handleDeploy(pending.tileId);
  };
  const [moveTargeting, setMoveTargeting] = useState(false); // true when move mode awaits target tile
  const [spendOpenId, setSpendOpenId] = useState<number | null>(null);
  // The Eye opens at a tap (Nigel, 2026-10-18): the
  // Curse's Eye panel no longer stands open on the land —
  // an eye glyph in the battle row opens it to show how
  // in danger of attack the land stands.
  const [eyeOpen, setEyeOpen] = useState(false);
  // THE BASTION (Station 4, Nigel 2026-10-20): the staging
  // hall's panel opens at a tap, like the Eye's.
  const [bastionOpen, setBastionOpen] = useState(false);
  const [wave, setWave] = useState<{ waveNumber: number; wavesDefeated: number; frayCount: number; unravelers: number; totalPower: number; nextWaveAt?: string | null; hollows?: number; tangles?: number; isBoss?: boolean; bossLevel?: number } | null>(null);
  // Wave simulation (preview only, no DB changes)
  const [simActive, setSimActive] = useState(false);
  const [battleActive, setBattleActive] = useState(false);
  const [battleWave, setBattleWave] = useState(0);
  const [battleUnits, setBattleUnits] = useState<typeof simUnits>([]);
  const [betweenWaves, setBetweenWaves] = useState(false);
  const [turnPhase, setTurnPhase] = useState<"towers" | "initiative" | "enemies" | null>(null);
  const [turnNumber, setTurnNumber] = useState(0);
  const [wavesCleared, setWavesCleared] = useState(0);
  const [bossLevel, setBossLevel] = useState(1);
  const [isBossFight, setIsBossFight] = useState(false);
  const [tileHp, setTileHp] = useState<Map<number, number>>(new Map());
  const [awokenHp, setAwokenHp] = useState<Map<number, number>>(new Map());
  const [battlePaused, setBattlePaused] = useState(false);
  const [battleSpeed, setBattleSpeed] = useState(1.3);
  const [battleManual, setBattleManual] = useState(false);
  // Cached tile positions for battle performance (tileId -> {cx, cy, q, r})
  const tilePosCache = useRef<Map<number, { cx: number; cy: number; q: number; r: number }>>(new Map());
  // Cached tile objects by ID (avoids tiles.find in hot loops)
  const tileByIdCache = useRef<Map<number, any>>(new Map());
  const [simUnits, setSimUnits] = useState<Array<{ id: number; type: string; tileId: number; hp: number; maxHp: number; power: number; x: number; y: number; targetX: number; targetY: number }>>([]);
  const simRef = useRef<{ units: typeof simUnits; timer: any } | null>(null);
  const battleRef = useRef<{ timer: any } | null>(null);
  const [waveResult, setWaveResult] = useState<{ victory: boolean; wavePower: number; defensePower: number } | null>(null);
  const [showBattleground, setShowBattleground] = useState(false);
  const [bonusTiles, setBonusTiles] = useState<{ id: number; q: number; r: number }[]>([]);
  const battleResolvedRef = useRef(false);
  // The company committed to the current in-map battle (attack/defense
  // placements at battle start) — the survivors reported to the server
  // at resolution are drawn from this list (War-Ground fix, 2026-10-15).
  const battleFighterIdsRef = useRef<number[]>([]);
  // Hex walls during the in-map battle sim: live HP per edge, seeded
  // from the server's walls when the battle starts; enemy damage to a
  // fighter is absorbed by its tile's walls first (damageAwoken), and
  // the remainder is reported at resolution (War-Ground, 2026-10-15).
  const battleWallHpRef = useRef<Map<string, number>>(new Map());
  const wallsTouchingTile = (t: { q: number; r: number }) => walls.filter(w =>
    (w.q === t.q && w.r === t.r) ||
    (w.q + WALL_DIR_DELTAS[w.dir][0] === t.q && w.r + WALL_DIR_DELTAS[w.dir][1] === t.r));
  const seedBattleWalls = () => {
    // Only the barrier works (wall, ward) carry HP into the sim.
    battleWallHpRef.current = new Map(
      walls.filter(w => w.kind === "wall" || w.kind === "ward").map(w => [w.edgeKey, w.hp]));
    simRunesTriggeredRef.current = [];
    simRuneFiredRef.current = new Set();
    simSkipRef.current = new Map();
    grimBattleRef.current = new Map(workings.map((w) => [w.id, { hp: w.hp, stops: w.stops, charges: w.charges, spent: false, maxHp: w.maxHp, pour: w.pour }]));
    grimYieldRef.current = 0;
  };
  const simWallState = (): { edgeKey: string; hp: number }[] =>
    [...battleWallHpRef.current.entries()].map(([edgeKey, hp]) => ({ edgeKey, hp }));
  // Edge-work traps in the in-map sim (War-Ground, Nigel 2026-10-15):
  // runes spring when an enemy ENTERS a runed tile or closes on a
  // fighter standing on one; thorns cost an enemy its next action
  // whenever it crosses or fights through them. Sprung runes are
  // one-shot — reported at resolution and consumed by the server.
  const simRunesTriggeredRef = useRef<string[]>([]);
  const simRuneFiredRef = useRef<Set<string>>(new Set());
  const simSkipRef = useRef<Map<string, number>>(new Map());
  const simHoldUnit = (unitId: string, ticks: number) => {
    simSkipRef.current.set(unitId, Math.max(simSkipRef.current.get(unitId) ?? 0, ticks));
  };
  const springRuneOnTile = (unitId: string, t: { q: number; r: number }): number => {
    const rune = wallsTouchingTile(t).find(w => w.kind === "rune" && !simRuneFiredRef.current.has(w.edgeKey));
    if (!rune) return 0;
    simRuneFiredRef.current.add(rune.edgeKey);
    simRunesTriggeredRef.current.push(rune.edgeKey);
    const scale = Math.pow(2, (rune.level ?? 1) - 1);
    if (rune.runeKind === "snare") {
      simHoldUnit(unitId, 2);
      showHexNotice("A snare rune springs — the Unraveling is held fast!");
      return 0;
    }
    if (rune.runeKind === "meld") {
      simHoldUnit(unitId, 1);
      showHexNotice("A meld rune springs — the Unraveling is bitten and held!");
      return 3 * scale;
    }
    showHexNotice("A harm rune springs — the Unraveling is torn!");
    return 6 * scale;
  };
  const thornsDragUnit = (unitId: string, t: { q: number; r: number }) => {
    if (wallsTouchingTile(t).some(w => w.kind === "thorns")) simHoldUnit(unitId, 1);
  };
  // ── The Written Light in the in-map sim (the Grimoire, Nigel
  // 2026-10-17) ─────────────────────────────────────────────
  // The standings fight by the same engines as at the Table,
  // tracked in a battle mirror seeded at the battle's start and
  // reported at its resolution (grimState / grimEnergy ride
  // resolveBattle beside wallState / runesTriggered, and the
  // server reckons them onto territory_workings). Runes spring
  // where the edge-runes spring — when the dark ENTERS their
  // hex; wards answer inside damageAwoken, the one funnel every
  // enemy blow to a fighter passes through.
  const grimBattleRef = useRef<Map<number, { hp: number; stops: number; charges: number; spent: boolean; maxHp: number; pour: number }>>(new Map());
  const grimYieldRef = useRef(0);
  const grimUnitsRef = useRef<any[]>([]);
  useEffect(() => { grimUnitsRef.current = battleUnits; }, [battleUnits]);
  const grimBright = () => workings.some((w) => w.engine === "engine" && !(grimBattleRef.current.get(w.id)?.spent));
  const grimFormName = (w: MapWorking) => grim?.spells.find((sp) => sp.key === w.spellKey)?.forms[w.hue] ?? w.spellKey;
  const grimEdgeTiles = (w: MapWorking): [{ q: number; r: number }, { q: number; r: number }] => {
    const a = { q: w.q ?? 0, r: w.r ?? 0 };
    const d = WALL_DIR_DELTAS[w.dir ?? 0];
    return [a, { q: a.q + d[0], r: a.r + d[1] }];
  };
  /** The overlay referee's lookups, precomputed from the map's
   *  geometry: each ward's two tiles, the tiles its Standard and
   *  Beacon light, and every standing's poured name. */
  const grimBattleProps = () => {
    const wardTiles: Record<number, [number, number]> = {};
    const wardsByTile: Record<number, number[]> = {};
    const stdTiles: Record<number, number> = {};
    const bcnTiles: Record<number, number> = {};
    const names: Record<number, string> = {};
    const tileAt = (q: number, r: number) => tiles.find((t) => t.q === q && t.r === r);
    for (const w of workings) {
      names[w.id] = grim?.spells.find((sp) => sp.key === w.spellKey)?.forms[w.hue] ?? w.spellKey;
      if (w.kind !== "ward") continue;
      const [ea, eb] = grimEdgeTiles(w);
      const ta = tileAt(ea.q, ea.r)?.id ?? w.tileId ?? -1;
      const tb = tileAt(eb.q, eb.r)?.id ?? (ta === w.tileId ? -1 : (w.tileId ?? -1));
      wardTiles[w.id] = [ta, tb];
      for (const tid of [ta, tb]) if (tid >= 0) (wardsByTile[tid] ??= []).push(w.id);
      if (w.engine === "standard") for (const tid of [ta, tb]) if (tid >= 0) stdTiles[tid] = Math.max(stdTiles[tid] ?? 0, w.nums.strikeBonus ?? 1);
      if (w.engine === "beacon") {
        for (const e of [ea, eb]) for (const t of tiles) if (hexDist({ q: e.q, r: e.r } as any, t) <= 1) bcnTiles[t.id] = Math.max(bcnTiles[t.id] ?? 0, w.nums.darkBonus ?? 1);
      }
    }
    return { wardTiles, wardsByTile, stdTiles, bcnTiles, names };
  };
  const grimReport = () => ({
    grimState: [...grimBattleRef.current.entries()].map(([id, st]) => ({ id, hp: st.hp, stops: st.stops, charges: st.charges, spent: st.spent })),
    grimEnergy: grimYieldRef.current,
  });
  /** A floor-rune springs as the dark enters its hex. Returns
   *  the units after the spring, and whether the entering unit
   *  was relocated (the Coil) — its own move then does not run. */
  const applyGrimoireEntry = (unit: any, tile: { id: number; q: number; r: number }, updated: any[]): { updated: any[]; moved: boolean } => {
    const rune = workings.find((w) => (w.kind === "rune" || w.kind === "spell") && w.tileId === tile.id);
    const st = rune ? grimBattleRef.current.get(rune.id) : undefined;
    if (!rune || !st || st.spent) return { updated, moved: false };
    const bright = grimBright() ? 1 : 0;
    let moved = false;
    if (rune.engine === "lattice") {
      // The Lattice holds with its health rating (Nigel,
      // 2026-10-17): pinning costs the entering dark's power,
      // and the writing stands on while health remains.
      const strain = Math.max(1, unit.power || 2);
      if (st.hp >= strain) {
        st.hp -= strain;
        simHoldUnit(unit.id, rune.nums.pinRounds ?? 2);
        showHexNotice(`${grimFormName(rune)} springs — the whole floor is the snare.`);
        if (st.hp <= 0) { st.spent = true; showHexNotice(`${grimFormName(rune)} is worn through and goes out, spent and honored.`); }
      } else {
        showHexNotice(`${grimFormName(rune)} strains to hold — its light is too worn (❤${Math.max(0, st.hp)}).`);
      }
    } else if (rune.engine === "blade" || rune.engine === "blades") {
      const power = (rune.nums.power ?? (rune.engine === "blade" ? 6 : 3)) + bright * (rune.nums.brightBonus ?? 1);
      updated = updated.map((u) => u.tileId === tile.id ? { ...u, hp: u.hp - power } : u).filter((u) => u.hp > 0);
      st.charges--;
      if (st.charges <= 0) st.spent = true;
      showHexNotice(`${grimFormName(rune)} springs — ${power} harm to everything standing on its ground.`);
    } else if (rune.engine === "coil") {
      const free = tiles.filter((t) => !t.cursed && t.id !== tile.id && !updated.some((u) => u.tileId === t.id) && !placements.some((p) => p.tileId === t.id));
      const dest = free.length ? free[Math.floor(Math.random() * free.length)] : null;
      if (dest && updated.some((u) => u.id === unit.id)) {
        const { cx, cy } = simTilePos(dest);
        updated = updated.map((u) => u.id === unit.id ? { ...u, tileId: dest.id, x: cx, y: cy } : u);
        grimYieldRef.current += Math.min(rune.nums.energyCap ?? 3, rune.nums.energyPerDark ?? 1);
        moved = true;
      }
      st.spent = true;
      showHexNotice(`${grimFormName(rune)} turns the dark aside — thrown back to far ground.`);
    } else if (rune.engine === "shard") {
      const here = updated.filter((u) => u.tileId === tile.id);
      const greatest = here.length ? Math.max(...here.map((u) => u.power || 2)) : 0;
      if (greatest >= (rune.nums.minPower ?? 5)) {
        const dmg = greatest * (rune.nums.multiplier ?? 2) + (rune.pour ?? 0);
        updated = updated.map((u) => u.tileId === tile.id ? { ...u, hp: u.hp - dmg } : u).filter((u) => u.hp > 0);
        st.spent = true;
        showHexNotice(`${grimFormName(rune)} falls on the whole hex — ${dmg} harm, measured by the greatest standing there.`);
      }
    }
    return { updated, moved };
  };
  /** Each turn: Engines sing their yield into the report, and
   *  the Trees regrow toward the health they were raised with. */
  const grimRoundTick = () => {
    for (const w of workings) {
      const st = grimBattleRef.current.get(w.id);
      if (!st || st.spent) continue;
      if (w.engine === "engine") grimYieldRef.current += w.nums.energyPerRound ?? 1;
      if (w.engine === "trees") st.hp = Math.min(st.maxHp || (w.nums.hp ?? 8), st.hp + (w.nums.regrow ?? 2));
    }
  };
  // Boss resolution recorded at victory detection (before the victory
  // screen opens), so handleBattleEnd never resolves a boss twice;
  // bossAspectGrant is the server's rolled grant the screen displays.
  const bossResolutionRef = useRef<{ victory: boolean; bossesDefeated?: number } | null>(null);
  const [bossAspectGrant, setBossAspectGrant] = useState<string[]>([]);
  // Cycle position toward the boss (0–3) from the server's own count:
  // every third victory completes a cycle and opens the boss window.
  const cycleFromDefeated = (defeated: number) =>
    defeated <= 0 ? 0 : (defeated % 3 === 0 ? 3 : defeated % 3);
  const [legends, setLegends] = useState<{ champion: Awakened | null; legends: { id: number; awakenedId: number; deed: string; count: number; awokenName: string }[] }>({ champion: null, legends: [] });
  const [showChampionPicker, setShowChampionPicker] = useState(false);
  const [showChampionTab, setShowChampionTab] = useState(false);

  const [showAspects, setShowAspects] = useState(false);
  const [returnReport, setReturnReport] = useState<{ awakenedId: number; text: string } | null>(null);
  const [mood, setMood] = useState<{ mood: string; description: string; endsAt: string } | null>(null);
  const [showFriends, setShowFriends] = useState(false);
  const [wavePullTile, setWavePullTile] = useState<number | null>(null);
  const [waveTarget, setWaveTarget] = useState<{ tile: { id: number; q: number; r: number } | null; defenderIds: number[] } | null>(null);
  // THE COLUMNS (2026-10-17): the Curse's Eye and its traced
  // lines — read from the server, refreshed as the land is.
  const incursionsQ = useQuery({ queryKey: ["incursions"], queryFn: () => api.getIncursions(), refetchInterval: 30000 });
  // THE PARTY (Nigel, 2026-10-20; built 2026-10-21): the
  // membership read — the War-Grounds orders bar below offers
  // adding the chosen Awokin to the party, and says so when
  // it already stands there.
  const partyQ = useQuery({ queryKey: ["party"], queryFn: () => api.getParty() });
  const seedsQ = useQuery({ queryKey: ["seeds"], queryFn: () => api.getSeeds(), refetchInterval: 30000 });
  // The First Seed's hold, polled gently — faster while waves fall.
  const firstSeedQ = useQuery({
    queryKey: ["firstSeedEvent"],
    queryFn: () => api.getFirstSeedEvent(),
    refetchInterval: (q) => ((q.state.data as any)?.event?.state === "holding" ? 5000 : 20000),
  });
  const firstSeedEv = firstSeedQ.data?.event ?? null;
  // When the hold's truth moves (a wave lands, the bank falls), the
  // map's own state is re-read so the ground agrees with the ledger.
  const firstSeedSig = firstSeedEv
    ? `${firstSeedEv.state}|${firstSeedEv.banked}|${firstSeedEv.wavesCleared}|${firstSeedEv.defenders.map(d => `${d.awakenedId}:${d.hp}`).join(",")}`
    : "";
  const lastFirstSeedSig = useRef("");
  useEffect(() => {
    if (!firstSeedEv) return;
    if (lastFirstSeedSig.current && lastFirstSeedSig.current !== firstSeedSig) {
      void refreshTerritory();
    }
    lastFirstSeedSig.current = firstSeedSig;
  }, [firstSeedSig]);
  const callsQ = useQuery({ queryKey: ["calls"], queryFn: () => api.getCalls(), refetchInterval: 30000 });
  const bastionQ = useQuery({ queryKey: ["bastion"], queryFn: () => api.getBastion(), refetchInterval: 30000 });
  const bastionAct = async (act: () => Promise<unknown>, done: string) => {
    try {
      await act();
      showHexNotice(done);
      void bastionQ.refetch();
      void refreshTerritory();
    } catch (e) { showHexNotice(refusalText(e, "The bastion could not answer.")); }
  };
  const handleCallToArms = async (args: { columnId?: number; seedId?: number }) => {
    try {
      await api.callToArms(args);
      showHexNotice("The call stands — carry it to your friends in Discord. The game sends nothing; the invitation is yours to give.");
      void callsQ.refetch();
    } catch (e) { showHexNotice(refusalText(e, "The call could not be raised.")); }
  };
  const handleFetchSeed = async (seedId: number, awakenedIds: number[]) => {
    try {
      await api.fetchSeed({ seedId, awakenedIds });
      showHexNotice("The fetch party rides — may they come home heavy.");
      void seedsQ.refetch();
    } catch (e) { showHexNotice(refusalText(e, "The fetch could not ride.")); }
  };
  const handleHoldSeed = async (seedId: number) => {
    try {
      await api.holdSeed({ seedId });
      showHexNotice("The bastion rises — the seed is HELD.");
      void seedsQ.refetch();
      const rb = await api.getBuildings();
      setBuildings(rb.buildings);
    } catch (e) { showHexNotice(refusalText(e, "The hold could not be raised.")); }
  };
  const [battleColumnId, setBattleColumnId] = useState<number | null>(null);
  const startColumnBattle = (col: import("./api").IncursionColumn) => {
    const count = (k: string) => col.roster.find(r => r.kind === k)?.count ?? 0;
    const totalPower = col.roster.reduce((acc, r) => acc + r.count * r.power, 0);
    setWave({
      waveNumber: 1, wavesDefeated: 0,
      frayCount: count("fray"), unravelers: count("unraveler"),
      totalPower, hollows: count("hollow"), tangles: count("tangle"),
    });
    const t = tiles.find(t => t.id === col.targetTileId);
    setWaveTarget(t ? {
      tile: { id: t.id, q: t.q, r: t.r },
      defenderIds: placements.filter(p => p.tileId === t.id).map(p => p.awakenedId),
    } : null);
    setBattleColumnId(col.id);
    setShowBattleground(true);
  };
  const fmtCountdown = (ms: number) => {
    const mins = Math.max(0, Math.round(ms / 60000));
    if (mins < 2) return "moments";
    if (mins < 90) return `~${mins}m`;
    const h = Math.floor(mins / 60), m = mins % 60;
    if (h < 30) return m ? `~${h}h ${m}m` : `~${h}h`;
    return `~${Math.round(h / 24 * 10) / 10}d`;
  };
  const [showTargetMap, setShowTargetMap] = useState(false);

  // Hand = Awoken not on field
  const placedIds = useMemo(() => new Set(placements.map(p => p.awakenedId)), [placements]);
  // THE HAND OF TWENTY (Station 4, Nigel 2026-10-20): the dock
  // holds the play hand — the twenty the Tender keeps ready —
  // once the bastion's ledger has been read. The reserve waits
  // in the deck (the collection hosts them all); the staged
  // wait at the bastion. Neither stands in the dock.
  const hand = useMemo(() => {
    const bv = bastionQ.data;
    if (!bv) return tenderItems.filter(a => !placedIds.has(a.id));
    const inHand = new Set(bv.hand.ids);
    const staged = new Set(bv.staged.map(s => s.awakenedId));
    return tenderItems.filter(a => !placedIds.has(a.id) && inHand.has(a.id) && !staged.has(a.id));
  }, [tenderItems, placedIds, bastionQ.data]);

  // Energy cap: 10 base + power-based bonus per Awoken (hand AND field).
  // TRIPLED 2026-10-13 (Nigel): 1-3 power: +3, 4-6: +6, 7-9: +9, 10+: +12.
  // The cap itself is serverMaxEnergy (see refreshEnergy above) —
  // no local formula remains to drift away from the server again.
  const maxEnergy = serverMaxEnergy;

  // Deploy cost scales with power: 2 base + 1 per 3 power.
  // 1-3: 2, 4-6: 3, 7-9: 4, 10+: 5.
  const deployCost = (power: number) => 2 + Math.floor((power - 1) / 3);

  // Whisper state: which field Awoken is speaking
  const [whisper, setWhisper] = useState<{ awakenedId: number; text: string } | null>(null);

  useEffect(() => {
    api.getLegends().then(setLegends).catch(() => {});
    // Return report: an Awoken speaks of buildings and needs
    api.getTerritory().then(t => {
      if (t.mood) { setMood(t.mood); moodSeenRef.current = t.mood.mood; }
      const fieldAwoken = t.placements.map((p: any) => p.awakenedId);
      if (!fieldAwoken.length) return;
      const buildings = t.buildings ?? [];
      const hasBuildings = buildings.length > 0;
      const hasWatchtower = buildings.some((b: any) => b.type === "watchtower");
      const hasDefense = buildings.some((b: any) => b.type === "thorn_wall" || b.type === "watchtower");
      const curseNear = t.tiles.some((tile: any) => tile.cursed);
      const text = pickReturnReport(hasBuildings, hasWatchtower, curseNear, hasDefense);
      if (text) {
        const speaker = fieldAwoken[Math.floor(Math.random() * fieldAwoken.length)];
        setReturnReport({ awakenedId: speaker, text });
        // Clear after 12 seconds
        setTimeout(() => setReturnReport(null), 12000);
      }
    }).catch(() => {});
    refreshEnergy();
    const onFocus = () => refreshEnergy();
    window.addEventListener("focus", onFocus);
    if (tiles.length) {
      api.getWave().then(w => {
        setWave(w);
        // The 3-Unraveling cycle toward the boss is derived from the
        // server's wavesDefeated, so it survives a reload (War-Ground
        // fix, 2026-10-15) instead of evaporating with local state.
        setWavesCleared(cycleFromDefeated(w.wavesDefeated));
      }).catch((e) => {
        console.error("[Territory] getWave failed:", e);
      });
    } else {
      console.warn("[Territory] Skipping getWave: tiles.length is 0");
    }
    return () => window.removeEventListener("focus", onFocus);
  }, [tiles.length]);

  // Load buildings + game config
  useEffect(() => {
    api.getBuildings().then(r => setBuildings(r.buildings)).catch(() => {});
    api.call("getGameConfig", {}).then(setGameConfig).catch(() => {});
  }, []);

  // Field Awoken whisper from time to time (only on field, never in hand)
  useEffect(() => {
    if (placements.length === 0) return;
    const whisperTimer = setInterval(() => {
      const placement = placements[Math.floor(Math.random() * placements.length)];
      setWhisper({ awakenedId: placement.awakenedId, text: randomWhisper() });
      setTimeout(() => setWhisper(null), 7000);
    }, 20000 + Math.random() * 15000);
    return () => clearInterval(whisperTimer);
  }, [placements]);

  useEffect(() => {
    (async () => {
      try {
        let t = await api.getTerritory();
        if (t.tiles.length === 0) {
          // No ground at all: sow the first seed's world (idempotent
          // on the server) and read the land again — the seed waits
          // at its cursed center from the first glance.
          await api.ensureFirstSeed().catch(() => {});
          t = await api.getTerritory();
        }
        setTiles(t.tiles); setPlacements(t.placements); setWalls(t.walls ?? []); setSkills(t.skills ?? []); setElsewhere(t.elsewhere ?? []);
        setWorkings(t.workings ?? []);
        setTenderStand(t.tender ?? null);
        setSummoning(t.summoning ?? { company: [], summonersPower: 0, standCursed: false });
        setWanderers(t.wanderers ?? []);
        if (t.battle) setBattle(t.battle);
        setDefenceWorks(t.defenceWorks ?? []);
        noteWeaponStrike(t.weaponStrike);
      } catch (e) {
        console.error("[Territory] getTerritory failed:", e);
      } finally {
        setTerritoryLoaded(true);
      }
    })();
  }, []);

  // The First Patrol arrives gathered (Wake, Nigel 2026-10-17): seed
  // the patrol ONCE, when the territory's true state is known. While
  // the first seed's hold stands open, the patrol is named to the
  // seed's company — the deploy selection, up to the hex's four.
  // The event done (or never sown) → they are simply readied in the
  // battle pool.
  const patrolSeededRef = useRef(false);
  useEffect(() => {
    if (patrolSeededRef.current || !territoryLoaded || firstSeedQ.isPending) return;
    if (!initialPatrolIds || initialPatrolIds.length === 0) return;
    patrolSeededRef.current = true;
    const mine = initialPatrolIds.filter(id => tenderItems.some(a => a.id === id));
    if (mine.length === 0) return;
    if (firstSeedEv && firstSeedEv.state !== "done") {
      setSeedTeam(mine.slice(0, 4));
    } else {
      setBattlePool(mine.filter(id => !placements.some(p => p.awakenedId === id)).slice(0, 4));
    }
  }, [territoryLoaded, tiles, placements, initialPatrolIds, tenderItems, firstSeedQ.isPending, firstSeedEv]);

  useEffect(() => {
    api.getGrimoire().then(setGrim).catch(() => {});
    api.getTenderExp().then((g) => setGrimGate({ level: g.level, wardRuneUnlocked: g.wardRuneUnlocked, healAmount: g.healAmount })).catch(() => {});
  }, []);

  const refreshTerritory = async () => {
    const refreshed = await api.getTerritory();
    setTiles(refreshed.tiles); setPlacements(refreshed.placements); setElsewhere(refreshed.elsewhere ?? []);
    setWalls(refreshed.walls ?? []); setSkills(refreshed.skills ?? []);
    setWorkings(refreshed.workings ?? []);
    setTenderStand(refreshed.tender ?? null);
    setSummoning(refreshed.summoning ?? { company: [], summonersPower: 0, standCursed: false });
    setWanderers(refreshed.wanderers ?? []);
    if (refreshed.battle) setBattle(refreshed.battle);
    setDefenceWorks(refreshed.defenceWorks ?? []);
    noteWeaponStrike(refreshed.weaponStrike);
    if (typeof refreshed.terrainBank === "number") setTerrainBank(refreshed.terrainBank);
  };

  // ── THE BUILDING SYSTEM (Nigel, 2026-10-19) ──────────────────
  // The map is the UI: a dashed ghost on the void founds the
  // work; a tap on a rising work opens its card; pours of 10
  // from the Tender's own pools fill its stages (the presence
  // of Awokin standing on it builds slowly for free).
  const fetchBuildPools = async () => {
    try {
      const att = await api.getAspectAttunement();
      setBuildPools(att.levels ?? {});
    } catch { setBuildPools(null); }
  };
  const openBuildGhost = (q: number, r: number) => {
    setBuildSel({ kind: "ghost", q, r });
    void fetchBuildPools();
  };
  const openBuildTile = (tileId: number) => {
    setBuildSel({ kind: "tile", tileId });
    void fetchBuildPools();
  };
  const handleBeginBuild = async (q: number, r: number) => {
    try {
      const res = await api.beginBuild({ q, r });
      await refreshTerritory();
      setBuildSel({ kind: "tile", tileId: res.tileId });
      showHexNotice("The work is founded — stone begins to gather, piece by piece.");
    } catch (err) {
      showHexNotice(err instanceof Error ? err.message : "The work would not begin.");
    }
  };
  // ── THE ATTUNE ABILITY'S TAP (Nigel, 2026-10-21):
  // Attune rides the wheel now — the readied element
  // (attuneElement) takes the tap: one point of it leaves
  // the pool and pours into the tapped tile's bank, the
  // very bank the standing press pours into. The tap names
  // its tile; the server measures the reach from where the
  // Tender stands (his hex, its ring, and his skill's
  // bonus) and answers in its own plain words. Ground a
  // rune or ward of his stands on takes the point the same
  // way, and the answer names the working. The mode is
  // sticky — tap on to lay on — and only the pool's dry
  // refusal sets it down unasked, as a cast run ends on
  // the purse's refusal.
  const handleAttuneTap = async (tile: { id: number }) => {
    if (!attuneElement) return;
    const element = attuneElement;
    try {
      const res = await api.attuneTile({ element, tileId: tile.id });
      await refreshTerritory();
      await fetchBuildPools();
      if (res.turned) showHexNotice(`The ground turns — it holds ${res.element} now.`);
      else if (res.working) showHexNotice(`A ${element} point rests on your ${res.working} — its ground's bank holds ${res.attuneElement} ${Math.floor(res.attunePoints)}/10 toward turning.`);
      else if (res.attuneElement) showHexNotice(`A ${element} point rests in that ground — its bank holds ${res.attuneElement} ${Math.floor(res.attunePoints)}/10 toward turning.`);
      else showHexNotice(`A ${element} point rests in that ground.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "The attuning was refused.";
      showHexNotice(msg);
      if (/pool holds 0/.test(msg)) setAttuneElement(null);
    }
  };
  const handlePourBuild = async (tileId: number, opts?: { branch?: "tide" | "sky"; finish?: "bake" | "lower" }) => {
    try {
      const res = await api.pourBuild({ tileId, ...opts });
      await refreshTerritory();
      await fetchBuildPools();
      if (res.buildStage >= 5) showHexNotice(res.lowered ? "The work stands finished — lowered deep, and the tide paid its yield." : "The work stands finished — baked sealed, its charge held fast.");
      else if (res.buildStage === 4) showHexNotice("The branch is crowned. Fire finishes what the elements began.");
      else if (res.buildStage === 3) showHexNotice("The hex is woven whole and green. Now the branch: tide's lake, or sky's isle.");
      else if (res.buildStage === 2) showHexNotice("The stone has coalesced — the ground holds. Root weaves it together now.");
    } catch (err) {
      showHexNotice(err instanceof Error ? err.message : "The pour was refused.");
    }
  };

  // ── THE TENDER'S GLIDE ENGINE ─────────────────────────────────
  // Mirror the live land, camera and input gates into refs the
  // engine's clocks read (the state block sits beside the zoom).
  useEffect(() => {
    tenderTilesRef.current = tiles;
    tenderPanRef.current = pan;
    tenderZoomRef.current = zoom;
    tenderStandRef.current = tenderStand;
    tenderInputBlockedRef.current = !!(
      castMode || moveTargeting || attackTargeting ||
      patrolSettingFor !== null || pendingMarch !== null || battlePool.length > 0 ||
      showBattleground || selectedBuilding || pendingTile !== null || hexConfirm
    );
  });

  const tenderTileCenter = (tileId: number) => {
    const t = tenderTilesRef.current.find(t => t.id === tileId);
    return t ? tileCenterScreen(t, tenderPanRef.current, tenderZoomRef.current) : null;
  };

  // ── THE TRAVERSAL LAW, the client's half (Nigel, 2026-10-19) ──
  // The same judgements the server makes on the anchor report,
  // kept here so the figure never presses its face into a closed
  // edge: a WALL stops a walk but not a leap; a WARD stops even
  // the sky; a rise of two trays wants a leap; a FLOATING ISLE
  // wants the leap at its height.
  const WALL_DIRS6: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];
  const WALL_OPP6: ReadonlyArray<number> = [3, 4, 5, 0, 1, 2];
  const hexDistOf = (a: { q: number; r: number }, b: { q: number; r: number }) =>
    (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
  const edgeKindClient = (a: TerritoryTile, b: TerritoryTile): string | null => {
    const d = WALL_DIRS6.findIndex(([dq, dr]) => a.q + dq === b.q && a.r + dr === b.r);
    if (d < 0) return null;
    const flip = b.q < a.q || (b.q === a.q && b.r < a.r);
    const cq = flip ? b.q : a.q, cr = flip ? b.r : a.r, cdir = flip ? WALL_OPP6[d] : d;
    const w = tenderWallsRef.current.find(w => w.q === cq && w.r === cr && w.dir === cdir);
    return w?.kind ?? null;
  };
  const crossingBlocked = (a: TerritoryTile, b: TerritoryTile, now: number): boolean => {
    const eng = tenderJumpRef.current;
    if ((b.z ?? 0) > 0) return !jumpApex(eng, now);
    if (hexDistOf(a, b) === 1) {
      const kind = edgeKindClient(a, b);
      if (kind === "ward") return true;
      if (kind === "wall" && !jumpAirborne(eng, now)) return true;
      if (((b.height ?? 1) - (a.height ?? 1)) >= 2 && !jumpAirborne(eng, now)) return true;
    }
    return false;
  };
  const crossingNeedsAir = (a: TerritoryTile, b: TerritoryTile): boolean => {
    if ((b.z ?? 0) > 0) return true;
    if (hexDistOf(a, b) === 1) {
      if (edgeKindClient(a, b) === "wall") return true;
      if (((b.height ?? 1) - (a.height ?? 1)) >= 2) return true;
    }
    return false;
  };
  /** The hex under a screen point, for the stride's judgement:
   *  the ground does the choosing; the isle above the winning
   *  hex is taken at a leap's height — or kept, while he stands
   *  on it (an isle holds its Tender until he walks off its air). */
  const tileUnderPoint = (x: number, y: number, now: number): TerritoryTile | null => {
    let best: TerritoryTile | null = null;
    let bestD = Infinity;
    for (const t of tenderTilesRef.current) {
      if ((t.z ?? 0) > 0) continue;
      const c = tileCenterScreen(t, tenderPanRef.current, tenderZoomRef.current);
      const d = Math.hypot(c.cx - x, c.cy - y);
      if (d < bestD) { bestD = d; best = t; }
    }
    if (!best) return null;
    const cur = tenderTilesRef.current.find(t => t.id === tenderAnchorRef.current);
    if (cur && (cur.z ?? 0) > 0 && cur.q === best.q && cur.r === best.r) return cur;
    if (jumpApex(tenderJumpRef.current, now)) {
      const isle = tenderTilesRef.current.find(t => (t.z ?? 0) > 0 && t.q === best!.q && t.r === best!.r);
      if (isle) return isle;
    }
    return best;
  };

  /** Leap: the Ground's engine, on the map's own body. */
  const pressTenderJump = () => {
    const stand = tenderStandRef.current;
    if (!stand) return;
    jumpPress(tenderJumpRef.current, stand.classKey, Date.now());
  };

  /** Report the hex under the figure's feet — the anchor follows
   *  the body. Fire-and-forget: the server's word returns on the
   *  next read, and the debounced refresh lets the musters his
   *  followers owe him visibly set out. Crossings the traversal
   *  law guards are reported with the airborne word, and only
   *  while the leap is truly off the ground. */
  const reportTenderAnchor = () => {
    const pos = tenderPosRef.current;
    if (!pos || !tenderStandRef.current || tenderTilesRef.current.length === 0) return;
    const now = Date.now();
    const best = tileUnderPoint(pos.x, pos.y, now);
    if (!best) return;
    if (best.id === tenderAnchorRef.current) return;
    // The reach is the lattice's own nearest-neighbour spacing: a
    // body between its land's hexes belongs to the nearest one, and
    // a body past the land's edge keeps its last true stand.
    const c = tileCenterScreen(best, tenderPanRef.current, tenderZoomRef.current);
    const bestD = Math.hypot(c.cx - pos.x, c.cy - pos.y);
    const size = HEX_BASE_SIZE * tenderZoomRef.current;
    const e = isoOffset(1, 0, size);
    const se = isoOffset(0, 1, size);
    const spacing = Math.min(
      Math.hypot(e.px, e.py), Math.hypot(se.px, se.py),
      Math.hypot(e.px - se.px, e.py - se.py),
    );
    if (bestD > spacing) return;
    const cur = tenderTilesRef.current.find(t => t.id === tenderAnchorRef.current);
    const airborne = !!(cur && crossingNeedsAir(cur, best) && jumpAirborne(tenderJumpRef.current, now));
    tenderAnchorRef.current = best.id;
    tenderReportRef.current = Date.now();
    void api.setTenderTile({ tileId: best.id, ...(airborne ? { airborne: true } : {}) }).catch(() => {});
    if (tenderRefreshTimerRef.current) clearTimeout(tenderRefreshTimerRef.current);
    tenderRefreshTimerRef.current = setTimeout(() => { void refreshTerritory(); }, 800);
  };

  // Spawn / re-anchor: when the server's stand first appears — or
  // changes beneath a still body — the figure takes its tile. A
  // body mid-glide is never snapped by a read.
  useEffect(() => {
    if (!tenderStand) {
      tenderPosRef.current = null;
      tenderAnchorRef.current = null;
      tenderTargetRef.current = null;
      tenderKeysRef.current.clear();
      setTenderFig(null);
      return;
    }
    const midGlide = tenderKeysRef.current.size > 0 || tenderTargetRef.current !== null;
    if (tenderPosRef.current === null || (!midGlide && tenderAnchorRef.current !== tenderStand.tileId)) {
      const c = tenderTileCenter(tenderStand.tileId);
      if (c) {
        tenderPosRef.current = { x: c.cx, y: c.cy };
        tenderAnchorRef.current = tenderStand.tileId;
        setTenderFig({ x: c.cx, y: c.cy, dir: tenderFacingRef.current, walking: false, step: 0 });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenderStand]);

  // The wheel's Attune branch spends from the pools (and
  // the building faces read them): keep their counts fresh
  // whenever the Tender's stand changes (and after every
  // spend, in handleAttuneTap).
  useEffect(() => {
    if (tenderStand) void fetchBuildPools();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenderStand?.tileId]);

  // Camera moves are deliberate: on pan or zoom the body re-anchors
  // to the hex the server holds, and any tap-road is forgotten.
  const tenderCamKey = `${pan.x}|${pan.y}|${zoom}`;
  useEffect(() => {
    if (tenderAnchorRef.current === null) return;
    const c = tenderTileCenter(tenderAnchorRef.current);
    if (!c) return;
    tenderPosRef.current = { x: c.cx, y: c.cy };
    tenderTargetRef.current = null;
    setTenderFig(f => (f ? { ...f, x: c.cx, y: c.cy, walking: false } : f));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenderCamKey]);

  // Keys: WASD and the arrows walk the body. Text fields keep
  // their keys, and so does every armed flow — the body answers
  // only on open ground, only when it stands on the map at all.
  useEffect(() => {
    const MOVE_KEYS = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"]);
    const isTextTarget = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return false;
      return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
    };
    const down = (e: KeyboardEvent) => {
      // SPACE LEAPS (Nigel, 2026-10-19): the jump is the body's
      // own verb — it answers even mid-glide, and the Runewright
      // answers it again off his rune.
      if (e.key === " ") {
        if (isTextTarget(e) || tenderInputBlockedRef.current || !tenderStandRef.current) return;
        e.preventDefault();
        if (!e.repeat) pressTenderJump();
        return;
      }
      const k = e.key.toLowerCase();
      if (!MOVE_KEYS.has(k)) return;
      if (isTextTarget(e) || tenderInputBlockedRef.current || !tenderStandRef.current) return;
      e.preventDefault();
      tenderKeysRef.current.add(k);
      tenderTargetRef.current = null; // the hand outranks the tap
    };
    const up = (e: KeyboardEvent) => { tenderKeysRef.current.delete(e.key.toLowerCase()); };
    const blur = () => tenderKeysRef.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // Escape puts the wheel and the controller away — and
  // unloads a readied cast run with them (Nigel, 2026-10-20:
  // a run ends when the player sets it down; Esc is one of
  // the standing unloads, as at the Table).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setTenderRadial(null); setTenderCtl(false); setOrdersWheel(null); setPendingMarch(null); endMapCastRunRef.current(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The belt under the number keys (the Ground's casting by
  // number): 1–6 run the locked slots' own acts, reached
  // through this ref, refreshed every render.
  const hotbarActRef = useRef<(i: number) => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const digit = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6"].indexOf(e.code);
      if (digit >= 0) hotbarActRef.current(digit);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** The locator, by name: the camera swings to the Tender
   *  and the gold pulse breathes over him — the compass
   *  button's own act, shared with the wheel and the belt. */
  const findMyTender = () => {
    if (!tenderStandRef.current) return;
    const c = tenderTileCenter(tenderAnchorRef.current ?? tenderStandRef.current.tileId);
    if (c) { setPan(p => ({ x: p.x + (250 - c.cx), y: p.y + (170 - c.cy) })); setFindPulseAt(Date.now()); }
  };

  // THE CONTROLLER'S PAD: a thumb's held direction, spoken
  // into the stride engine's own held-keys — the same road
  // the WASD hand walks, so the body cannot tell the two
  // apart. Eight ways, snapped like the lattice's compass.
  const padApply = (keys: string[]) => {
    for (const k of padKeysRef.current) tenderKeysRef.current.delete(k);
    padKeysRef.current = [];
    if (keys.length === 0) return;
    if (tenderInputBlockedRef.current || !tenderStandRef.current) return;
    for (const k of keys) { tenderKeysRef.current.add(k); padKeysRef.current.push(k); }
    tenderTargetRef.current = null; // the hand outranks the tap
  };
  const padClear = () => { padApply([]); setPadKnob({ x: 0, y: 0 }); };
  const onPadVec = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2), dy = e.clientY - (rect.top + rect.height / 2);
    if (Math.hypot(dx, dy) < 10) { padApply([]); setPadKnob({ x: 0, y: 0 }); return; }
    const a = Math.atan2(dy, dx);
    const DIRS: string[][] = [["d"], ["d", "s"], ["s"], ["s", "a"], ["a"], ["a", "w"], ["w"], ["w", "d"]];
    padApply(DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]);
    setPadKnob({ x: Math.cos(a) * 26, y: Math.sin(a) * 26 });
  };

  /** Wield on the homeland: the arsenal's own server law,
   *  then the land is re-read so the new weapon rides at
   *  his shoulder. */
  const wieldOnHomeland = async (wk: WeaponKey) => {
    try {
      await api.wieldWeapon({ weaponKey: wk });
      await refreshTerritory();
      showHexNotice(`${WEAPONS[wk].name} rides in your hand now.`);
    } catch (err) {
      showHexNotice(err instanceof Error ? err.message : "The wielding was refused.");
    }
  };

  /** THE SUMMON CAST (Nigel, 2026-10-22 — the summoning
   *  fix): the wheel's pick IS the cast. No tile is named —
   *  the server chooses the landing at the Tender's side and
   *  answers with the whole reckoning; a falter spends the
   *  price and stands nothing, and the branch — read fresh
   *  with the field — is ready to pick again at once. */
  const castSummon = async (entry: { awakenedId: number; name: string }) => {
    // The Tender's gesture begins with the order itself —
    // the Proving Ground's cast() at the tap, the Table's
    // beginCast law: he casts, and THEN the reckoning lands.
    tenderCastDirRef.current = tenderFig?.dir ?? "S";
    setTenderCastAt(Date.now());
    try {
      const r = await api.summonAwoken({ awakenedId: entry.awakenedId });
      // A landed cast leaves its reckoning for the placements
      // effect, which plays the Ground's summon sequence the
      // moment the figure stands (see the block at marchNow).
      if (r.summoned) pendingSummonRef.current = { awakenedId: entry.awakenedId, name: r.name, at: Date.now() };
      await refreshEnergy();
      await refreshTerritory();
      if (r.summoned) {
        showHexNotice(`${r.name} answers — the call lands (rolled ${r.roll} against DC ${r.dc}, ✦${r.cost} spent) and stands at your side.`);
      } else {
        showHexNotice(`${r.name} — the call falters (rolled ${r.roll} against DC ${r.dc}): the price (✦${r.cost}) is spent, and nothing stands. Pick again to call once more.`);
      }
    } catch (err) {
      showHexNotice(err instanceof Error ? err.message : "The summoning was refused.");
    }
  };

  /** Follow, toggled from the wheel or the belt: the one
   *  server order, then the marching read refreshes. */
  const toggleFollow = async (placementId: number, follow: boolean) => {
    try {
      await api.setPlacementFollow({ placementId, follow });
      await refreshMarching();
    } catch (err) {
      showHexNotice(err instanceof Error ? err.message : "The order was refused.");
    }
  };

  // THE RESTORED WHEEL'S ENTRIES for the homeland: the
  // Ground's six branches fed this ground's real doors — the
  // book's pages readying into the hand's cast mode, the real
  // wield, Find me, the Follow orders, the company read.
  // Every act is the act its row on the old branch card
  // already ran; only the FORM is the Ground's.
  const buildWheelEntries = (): WheelEntry[] => {
    if (wheelTab === "weapon") {
      const wielded = (tenderStand?.weaponKey ?? null) as WeaponKey | null;
      return WEAPON_ORDER.map(wk => ({
        key: `wp-${wk}`, img: weaponImg(wk), label: WEAPONS[wk].name,
        summoned: wielded === wk, pinKey: `wp-${wk}`,
        act: () => { void wieldOnHomeland(wk); },
      }));
    }
    if (wheelTab === "ability") {
      const out: WheelEntry[] = [
        { key: "nav-weapon", sigil: "weapon", label: "Weapon", nav: "weapon" as WheelTabId },
        { key: "nav-attune", sigil: "ability", label: "Attune", nav: "attune" as WheelTabId },
        { key: "findme", emoji: "🧭", label: "Find me", pinKey: "findme", dragKey: "findme", act: () => findMyTender() },
      ];
      for (const p of placements.slice(0, 5)) {
        out.push({
          key: `follow-${p.id}`, emoji: "👣", label: p.name,
          summoned: !!p.follow, pinKey: `follow-${p.id}`, dragKey: `follow-${p.id}`, stayOpen: true,
          act: () => { void toggleFollow(p.id, !p.follow); },
        });
      }
      return out;
    }
    if (wheelTab === "awoken") {
      // THE SUMMON BRANCH (Nigel, 2026-10-22 — the summoning
      // fix): the branch lists the PARTY the server can call
      // (summonCompanyFor's reckoning, served with the field)
      // — name, the summon price in ✦, the summoner's power
      // when it stands above nothing, and the curse's −3 while
      // the Tender stands in it, every cast's shape shown
      // before the tap, as the Table's branch shows it. The
      // pick IS the cast: no target, no ground tap — the
      // Awokin stands at the Tender's side, or the call
      // falters and the price is spent. (This branch READ the
      // company until tonight; the reading is the Zodiac's
      // party tab's office now.)
      if (!summoning.company.length) {
        return [{
          key: "sum-none", sigil: "awo", label: "None callable", locked: true,
          act: () => showHexNotice("No one can be called — your party stands fielded, staged at the bastion, or still re-coalescing. Fill a spot from the Party tab of your Zodiac; the wheel's cast is the only gate."),
        } as WheelEntry];
      }
      return summoning.company.map(c => ({
        key: `sum-${c.awakenedId}`,
        img: c.imageUrl,
        emoji: "✦",
        label: `${c.name} · ✦${c.cost}${summoning.summonersPower > 0 ? ` · +${summoning.summonersPower} summoner's power` : ""}${summoning.standCursed ? " · −3 the curse presses" : ""}`,
        pinKey: `sum-${c.awakenedId}`,
        dragKey: `sum-${c.awakenedId}`,
        act: () => { void castSummon(c); },
      } as WheelEntry));
    }
    if (wheelTab === "attune") {
      // ATTUNE IS AN ABILITY (Nigel, 2026-10-21): the five
      // elements stand on the branch, each showing what the
      // pools hold of it (the same reckoning the retired
      // centre card showed). Choosing one readies the
      // attuning and sets any readied working down — taps
      // on the land then lay points, one tap, one point,
      // within his reach (his hex and its ring, plus his
      // skill's bonus — the server measures it).
      const EL_MARK: Record<string, string> = { tide: "🌊", sky: "🌬️", stone: "🪨", root: "🌿", fire: "🔥" };
      return (["root", "tide", "sky", "stone", "fire"] as const).map(el => {
        const held = Math.floor(buildPools?.[el] ?? 0);
        return {
          key: `attune-${el}`, emoji: EL_MARK[el], label: `${el} · ${held}`,
          lit: attuneElement === el,
          act: () => {
            if (held < 1) { showHexNotice(`Your ${el} pool is empty — attuning costs 1 point of the element, laid from the pool.`); return; }
            endMapCastRun();
            setAttuneElement(el);
            showHexNotice(`Attuning with ${el} — tap the ground beside you (your hex and its ring) to lay a point; each tap spends 1 ${el} point. Esc, or readying a working, sets it down.`);
          },
        } as WheelEntry;
      });
    }
    // The spell branches: the book's own pages of the kind.
    const kindSpells = (grim?.spells ?? []).filter(sp => sp.kind === wheelTab && sp.engine !== "none");
    if (!kindSpells.length) {
      return [{
        key: `none-${wheelTab}`, sigil: wheelTab, label: "None yet", locked: true,
        act: () => showHexNotice(wheelTab === "spell"
          ? "No spell-school pages stand in the book yet — the Witch's school wakes with its first page."
          : "The book holds no such pages yet."),
      }];
    }
    return kindSpells.slice(0, 6).map(sp => {
      const locked = sp.engine !== "heal" && !grimGate.wardRuneUnlocked;
      return {
        key: `cast-${sp.key}`,
        img: grimGlyphImg(sp.key),
        emoji: "✦",
        label: `${sp.forms[castHueFor(sp)] ?? sp.name} · ✦${sp.cost}`,
        locked,
        lit: castSpellKey === sp.key && castMode,
        pinKey: `cast-${sp.key}`,
        dragKey: `cast-${sp.key}`,
        act: () => {
          setCastMode(true); setCastSpellKey(sp.key); setCastAnchor(null); setAttuneElement(null);
          showHexNotice(locked
            ? `${sp.name} wakes at Tender Lv 3 — the book will refuse it until then.`
            : `${sp.name} readied — tap the land to cast it.`);
        },
      } as WheelEntry;
    });
  };
  // ── THE ORDERS WHEELS' ENTRIES (Nigel, 2026-10-22 — the
  // marching-orders spec): one Awokin's wheel carries its
  // whole office — March (or Halt, while it marches), its
  // stances on the standing stance verbs, its taught works
  // while it stands in Binding (the arming door the star
  // chart's constellation carried, kept whole), Follow as
  // an ORDER (the pick sets it following; it never toggles
  // off from here), its patrol road, and its party door.
  // The company's wheel carries March · Attack · Defend ·
  // Follow for the whole selection. Picking March arms the
  // order; the next tap on the land — or a dragged
  // line under the button law — obeys at once.
  const buildOrdersEntries = (ids: number[]): WheelEntry[] => {
    if (ids.length > 1) {
      return [
        { key: "ord-march", sigil: "manifest", label: "March", act: () => { setPendingMarch({ ids: [...ids] }); showHexNotice("March — tap the ground the company should muster on, or drag a line for them to stand along."); } },
        { key: "ord-attack", sigil: "sword", label: "Attack", act: () => { void (async () => { for (const id of ids) await handleSetStance(id, "attack"); showHexNotice("The company takes the Attack stance."); })(); } },
        { key: "ord-defend", sigil: "swordshield", label: "Defend", act: () => { void (async () => { for (const id of ids) await handleSetStance(id, "defense"); showHexNotice("The company takes the Defend stance."); })(); } },
        { key: "ord-follow", sigil: "awo", label: "Follow", act: () => { void (async () => { for (const id of ids) { const p = placements.find(x => x.awakenedId === id); if (p) await toggleFollow(p.id, true); } showHexNotice("The company follows you."); })(); } },
      ] as WheelEntry[];
    }
    const id = ids[0];
    const p = placements.find(x => x.awakenedId === id);
    if (!p) return [];
    const entries: WheelEntry[] = [];
    if (p.marchPath) {
      entries.push({ key: "ord-recall", emoji: "✋", label: "Halt march", act: () => { void (async () => { try { await api.recallMarch({ awakenedId: id }); await refreshMarching(); showHexNotice(`${p.name} halts where it stands.`); } catch (err) { showHexNotice(err instanceof Error ? err.message : "The halt was refused."); } })(); } } as WheelEntry);
    } else {
      entries.push({ key: "ord-march", sigil: "manifest", label: "March", act: () => { setPendingMarch({ ids: [id] }); setSelectedAwoken(id); showHexNotice(`March — tap the ground ${p.name} should march to, or drag a line for it to stand on.`); } } as WheelEntry);
    }
    entries.push({ key: "ord-attack", sigil: "sword", label: "Attack", lit: p.stance === "attack", act: () => { setSelectedAwoken(id); void handleSetStance(id, "attack"); } } as WheelEntry);
    entries.push({ key: "ord-defend", sigil: "swordshield", label: "Defend", lit: p.stance === "defense", act: () => { void handleSetStance(id, "defense"); } } as WheelEntry);
    entries.push({ key: "ord-binding", sigil: "binding", label: "Binding", lit: p.stance === "binding", act: () => { void handleSetStance(id, "binding"); } } as WheelEntry);
    if (p.stance === "binding") {
      const taught = skills.filter(s => s.awakenedId === id).map(s => s.skill);
      const arm = (kind: "ward" | "rune", runeKind?: "snare" | "harm" | "meld") => {
        setWgArmedWork({ kind, runeKind });
        setAttackTargeting(false);
        setMoveTargeting(false);
        setWgTileId(p.tileId);
      };
      if (taught.includes("warding")) entries.push({ key: "ord-ward", emoji: "🔷", label: "Ward · 3✦", act: () => arm("ward") } as WheelEntry);
      if (taught.includes("runeing")) for (const rk of ["snare", "harm", "meld"] as const) entries.push({ key: `ord-rune-${rk}`, emoji: "🔶", label: `${rk.charAt(0).toUpperCase() + rk.slice(1)} · 3✦`, act: () => arm("rune", rk) } as WheelEntry);
    }
    entries.push({ key: "ord-follow", sigil: "awo", label: "Follow", summoned: !!p.follow, act: () => { void toggleFollow(p.id, true); } } as WheelEntry);
    entries.push({ key: "ord-patrol", sigil: "arrow", label: p.patrolPath ? "Re-lay patrol" : "Patrol", lit: !!p.patrolPath, act: () => { setPatrolDraft(patrolRoadOf(p)); setPatrolSettingFor(id); } } as WheelEntry);
    const inParty = !!partyQ.data?.members.some(m => m.awakenedId === id);
    if (!inParty) entries.push({ key: "ord-join", sigil: "ability", label: "Join party", act: () => { void (async () => { try { await api.addFieldToParty({ awakenedId: id }); await partyQ.refetch(); showHexNotice(`${p.name} comes off the field into your party.`); } catch (err) { showHexNotice(err instanceof Error ? err.message : "The party would not take them."); } })(); } } as WheelEntry);
    return entries;
  };

  const wheelCaption = (): string => {
    const drag = " · drag an entry onto the hotbar to key it";
    switch (wheelTab) {
      case "weapon": return "Ability — Weapon — wield the runic weapon";
      case "attune": return "Ability — Attune — tap an element, then tap the ground beside you to lay a point on it — one tap, one point of that element from your pools";
      case "ability": return placements.length
        ? `Ability — the tender's own deeds, beyond spellcraft${drag}`
        : "Ability — the tender's own deeds, beyond spellcraft · no Awokin stands on your land yet";
      case "awoken": return summoning.company.length
        ? `Awoken — your party, called by the cast: pick one and it stands at your side — no target; a falter spends the price${drag}`
        : "Awoken — no one can be called: your party stands fielded, staged, or re-coalescing";
      default: {
        const label = wheelTab === "spell" ? "Spell" : wheelTab === "ward" ? "Ward" : wheelTab === "rune" ? "Rune" : "Binding";
        const sub = wheelTab === "spell" ? "castings from the hand and the sky"
          : wheelTab === "ward" ? "the Written Light, raised on your land's edges"
          : wheelTab === "rune" ? "writings in the ground — they wait, and spring"
          : "threads that mend and hold — the Springleaf's grove among them";
        const has = (grim?.spells ?? []).some(sp => sp.kind === wheelTab && sp.engine !== "none");
        if (!has) return wheelTab === "spell"
          ? "Spell — no spell-school pages stand in the book yet · the Witch's school wakes with its first page"
          : `${label} — the book holds no such pages yet`;
        return `${label} — ${sub} · tap to ready, then tap the land — the roll is the Table's own${drag}`;
      }
    }
  };
  // The Attune branch reads the pools' standing — refresh
  // the reckoning whenever the branch is opened, so the
  // counts on the element discs are the pools' own.
  useEffect(() => {
    if (wheelTab === "attune") void fetchBuildPools();
  }, [wheelTab]);

  /** The wheel's bloom point in screen pixels: the radial
   *  state keeps the map's own coordinates; the Ground's
   *  wheel is a screen-fixed overlay, projected out here. */
  const wheelClientPoint = (): { x: number; y: number } | null => {
    if (!tenderRadial || !svgRef.current) return null;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(tenderRadial.x, tenderRadial.y).matrixTransform(ctm);
    return { x: p.x, y: p.y };
  };
  // A drag from the wheel keys its entry to the belt — the
  // pin's own road, walked by hand.
  const dropToHotbar = (key: string) => { if (!hotbarKeys.includes(key)) toggleHotbar(key); };

  /** A belt slot's act, by its key — the one door the slot's
   *  tap and its number key both walk through. */
  const actTerritorySlot = (key: string) => {
    if (key.startsWith("wp-") && WEAPONS[key.slice(3) as WeaponKey]) { void wieldOnHomeland(key.slice(3) as WeaponKey); return; }
    if (key === "findme") { findMyTender(); return; }
    if (key.startsWith("follow-")) {
      const pid = Number(key.slice(7));
      const p = placements.find(x => x.id === pid) ?? null;
      if (p) void toggleFollow(p.id, !p.follow); else toggleHotbar(key);
      return;
    }
    if (key.startsWith("sum-")) {
      const c = summoning.company.find(x => x.awakenedId === Number(key.slice(4))) ?? null;
      if (!c) { toggleHotbar(key); return; }
      void castSummon(c);
      return;
    }
    if (key.startsWith("cast-")) {
      const sp = grim?.spells.find(x => x.key === key.slice(5)) ?? null;
      if (!sp) { toggleHotbar(key); return; }
      if (castSpellKey === sp.key && castMode) { setCastSpellKey(null); setCastMode(false); setCastAnchor(null); return; }
      setCastMode(true); setCastSpellKey(sp.key); setCastAnchor(null); setAttuneElement(null);
      showHexNotice(`${sp.name} readied — tap the land to cast it.`);
      return;
    }
    toggleHotbar(key);
  };
  hotbarActRef.current = (i: number) => { const k = hotbarKeys[i]; if (k) actTerritorySlot(k); };

  // The stride: a 50 ms clock while the body walks — keys held, or
  // a tapped hex still ahead of it — at ~57 px/s (PACE LAW,
  // Nigel 2026-10-20: the homeland stride is HALF the preview's
  // old ~115 px/s, and cursed ground halves it again while he
  // stands on it). Facing follows the stride; the last facing is
  // kept at rest. Anchors are reported as hexes are crossed
  // (~150 ms) and once more when the body comes to rest.
  useEffect(() => {
    const SPEED = 57.5;
    // The Ground's figure stands ~117 demo px tall; the map's
    // stands 62 — the arc scales to the body it raises.
    const JUMP_SCALE = 62 / 117;
    const iv = setInterval(() => {
      const pos = tenderPosRef.current;
      if (!pos || !tenderStandRef.current) return;
      const now = Date.now();
      const jpose = jumpPoseInfo(tenderJumpRef.current, now);
      const jh = jpose.h * JUMP_SCALE * tenderZoomRef.current;
      let vx = 0, vy = 0;
      const keys = tenderKeysRef.current;
      if (keys.size > 0) {
        if (keys.has("a") || keys.has("arrowleft")) vx -= 1;
        if (keys.has("d") || keys.has("arrowright")) vx += 1;
        if (keys.has("w") || keys.has("arrowup")) vy -= 1;
        if (keys.has("s") || keys.has("arrowdown")) vy += 1;
        const len = Math.hypot(vx, vy);
        if (len > 0) { vx /= len; vy /= len; }
      } else if (tenderTargetRef.current) {
        const dx = tenderTargetRef.current.x - pos.x;
        const dy = tenderTargetRef.current.y - pos.y;
        const d = Math.hypot(dx, dy);
        if (d <= 4) tenderTargetRef.current = null;
        else { vx = dx / d; vy = dy / d; }
      }
      if (vx === 0 && vy === 0) {
        if (tenderWasMovingRef.current) {
          tenderWasMovingRef.current = false;
          reportTenderAnchor();
        }
        // A leap in place still rides the clock: the figure
        // rises, hangs, and lands where it stands.
        if (jpose.active) {
          setTenderFig(f => (f ? { ...f, walking: false, jh, flipU: jpose.flipU } : f));
        } else {
          setTenderFig(f => (f && (f.walking || f.jh) ? { ...f, walking: false, jh: 0, flipU: null } : f));
        }
        return;
      }
      const here = tileUnderPoint(pos.x, pos.y, now);
      const stepLen = SPEED * 0.05 * (here?.cursed ? 0.5 : 1);
      const nx = pos.x + vx * stepLen;
      const ny = pos.y + vy * stepLen;
      // THE TRAVERSAL LAW on the stride: a closed crossing
      // refuses the step — the body stops at the wall, the
      // ward, the tall rise, the isle's empty air — and a
      // tap-road dies at the barrier it cannot cross.
      const there = tileUnderPoint(nx, ny, now);
      if (here && there && there.id !== here.id && crossingBlocked(here, there, now)) {
        tenderTargetRef.current = null;
        setTenderFig(f => (f ? { ...f, walking: false, jh, flipU: jpose.flipU } : f));
        return;
      }
      tenderWasMovingRef.current = true;
      pos.x = nx;
      pos.y = ny;
      tenderTravelRef.current += stepLen;
      tenderFacingRef.current = tenderDirOf(vx, vy);
      setTenderFig({
        x: pos.x, y: pos.y, dir: tenderFacingRef.current, walking: true,
        step: Math.floor(tenderTravelRef.current / 14) % 2,
        jh, flipU: jpose.flipU,
      });
      if (Date.now() - tenderReportRef.current >= 150) reportTenderAnchor();
    }, 50);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Proofs ride the same hooks the Ground keeps (window.__jump
  // there; __tenderJump here): the leap measured on the real
  // map's real body, never a stand-in.
  useEffect(() => {
    (window as any).__tenderJump = {
      press: () => pressTenderJump(),
      height: () => tenderJumpRef.current.h,
      airborne: () => jumpAirborne(tenderJumpRef.current, Date.now()),
      apex: () => jumpApex(tenderJumpRef.current, Date.now()),
      flipped: () => jumpFlipped(tenderJumpRef.current, Date.now()),
      runed: () => jumpRuned(tenderJumpRef.current, Date.now()),
      classKey: () => tenderStandRef.current?.classKey ?? null,
      anchor: () => tenderAnchorRef.current,
      pos: () => tenderPosRef.current ? { ...tenderPosRef.current } : null,
    };
    return () => { delete (window as any).__tenderJump; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshWorkings = async () => {
    await refreshTerritory();
    onUpdate();
  };

  // Marching orders change the placements themselves — and this
  // screen keeps its OWN copy of them, so every marching handler
  // must refresh it, or the order lands on the server while the map
  // never learns of it (the first marching build's silence, found
  // by the Ancient One's thumb 2026-10-16: orders relayed, nothing
  // happened — the refresh was the missing half of the loop).
  const refreshMarching = async () => {
    const refreshed = await api.getTerritory();
    setTiles(refreshed.tiles); setPlacements(refreshed.placements); setElsewhere(refreshed.elsewhere ?? []);
    setWalls(refreshed.walls ?? []); setSkills(refreshed.skills ?? []);
    setSummoning(refreshed.summoning ?? { company: [], summonersPower: 0, standCursed: false });
    onUpdate();
  };

  // ── Hex walls (War-Ground, Nigel 2026-10-15) ──────────────────────
  // An Awoken standing on a hex raises a wall on one of its six edges:
  // one tap on the edge itself (a fat invisible hit-strip laid exactly
  // along the painted edge), 2 energy, instant. The wall blocks
  // enemies in battle — their strikes land on it first — and carries
  // its own HP. Edge dirs follow hexCellVertices order (0 = top edge,
  // then clockwise), the same numbering the server canonicalises.
  const handlePlaceWall = async (tileId: number, dir: number) => {
    try {
      await api.placeWall({ tileId, dir });
      const refreshed = await api.getTerritory();
      setTiles(refreshed.tiles); setPlacements(refreshed.placements); setWalls(refreshed.walls ?? []); setElsewhere(refreshed.elsewhere ?? []);
      onUpdate();
      showHexNotice("A wall rises on the hex edge — it will take the enemy's blows first.");
    } catch (e) {
      showHexNotice(e instanceof Error ? e.message : "The wall would not rise.");
    }
  };

  // ── Edge works (War-Ground, Nigel 2026-10-15) ────────────────────
  // The War-Grounds panel lays any of the four works through the one
  // server law (placeEdgeWork): wall, thorns, ward (Warding hands),
  // rune (Runeing hands, kind chosen at casting). Standing works can
  // be strengthened at exponential cost or taken down; skills are
  // taught through teachSkill. Every refusal speaks.
  const refreshWorks = async () => {
    const refreshed = await api.getTerritory();
    setTiles(refreshed.tiles); setPlacements(refreshed.placements); setElsewhere(refreshed.elsewhere ?? []);
    setWalls(refreshed.walls ?? []); setSkills(refreshed.skills ?? []);
    onUpdate();
  };
  const WORK_NOTICE: Record<string, string> = {
    wall: "A wall rises on the hex edge — passage closed, at no harm to any who test it.",
    thorns: "Thorns take the hex edge — the crossing stays open, and dear in time.",
    ward: "A ward is cast on the hex edge — a wall the sky cannot ignore.",
    rune: "A rune is set on the hex edge — a trap, sleeping until it is sprung.",
  };
  const handlePlaceWork = async (tileId: number, dir: number, kind: "wall" | "thorns" | "ward" | "rune", runeKind?: "snare" | "harm" | "meld", style?: "stone" | "spire") => {
    try {
      await api.placeEdgeWork({ tileId, dir, kind, runeKind, style });
      await refreshWorks();
      showHexNotice(WORK_NOTICE[kind]);
    } catch (e) {
      showHexNotice(e instanceof Error ? e.message : "The work would not stand.");
    }
  };
  const handleStrengthenWork = async (tileId: number, dir: number) => {
    try {
      const res = await api.strengthenEdgeWork({ tileId, dir });
      await refreshWorks();
      showHexNotice(`The ${res.work.kind} is strengthened to level ${res.work.level} — the next strengthening would cost ${res.nextCost}✦.`);
    } catch (e) {
      showHexNotice(e instanceof Error ? e.message : "The strengthening failed.");
    }
  };
  const handleRemoveWork = async (tileId: number, dir: number) => {
    try {
      await api.removeEdgeWork({ tileId, dir });
      await refreshWorks();
      showHexNotice("The work comes down. The edge is open ground again.");
    } catch (e) {
      showHexNotice(e instanceof Error ? e.message : "The work would not come down.");
    }
  };
  const handleTeachSkill = async (awakenedId: number, skill: "warding" | "runeing") => {
    try {
      await api.teachSkill({ awakenedId, skill });
      await refreshWorks();
      const aw = tenderItems.find(a => a.id === awakenedId);
      showHexNotice(`${aw?.name ?? "The Awokin"} learns the ${skill === "warding" ? "Warding" : "Runeing"} skill — the teaching holds.`);
    } catch (e) {
      showHexNotice(e instanceof Error ? e.message : "The teaching failed.");
    }
  };

  // Hand = Awoken not on field (defined above for energy calc)

  const handleDeploy = async (tileId: number) => {
    if (battlePool.length === 0) return;
    const tile = tiles.find(t => t.id === tileId);
    if (!tile) return;
    // The hand road's summoning door is RETIRED (Nigel,
    // 2026-10-22): the readied company assaults cursed
    // ground only. Fielding Awokin belongs to the wheel's
    // cast, which stands them at the Tender's side.
    if (!tile.cursed) {
      showHexNotice("Quiet ground takes no assault — summoning rides the wheel now: right-click to open it, pick your Awokin under its branch, and they stand at your side. A readied company is for cursed ground.");
      return;
    }
    const fighters = battlePool.map(id => hand.find(a => a.id === id)).filter(Boolean) as Awakened[];
    if (fighters.length === 0) {
      showHexNotice("The readied company has scattered — ready them again.");
      return;
    }
    // No client-side energy gate (round four): this client's `energy` is a
    // mount-time snapshot that regen leaves behind, while the orb reads
    // the server fresh — a stale gate here refused deploys the tender
    // could afford ("couldn't place, but had energy"). The server's
    // spendEnergy is the only honest cashier; its refusal speaks below.
    const fighterIds = fighters.map(a => a.id);
    try {
      const result = await api.deployBattle({ awakenedIds: fighterIds, tileId });
      await refreshEnergy();
      const after = await api.getTerritory();
      setTiles(after.tiles);
      setPlacements(after.placements); setElsewhere(after.elsewhere ?? []);
      setBattlePool([]);
      setTargetHexId(null);
      // If the dark broke, a newborn joins the hand. Server-side, fire-and-forget —
      // it can never hang the purification.
      if (result.purified) {
        const liberatorNames = fighters.map(a => a.name);
        api.birthNewbornToHand({ tileId, liberatorNames }).catch(e =>
          console.error("[Birth] Newborn failed — game continues", e)
        );
      }
      onUpdate();
    } catch (e) {
      console.error("Battle deployment failed", e);
      setTargetHexId(null);
      showHexNotice(refusalText(e, "The deployment was refused."));
    }
  };

  // The First Seed's company (Nigel via Wake, 2026-10-17): sending
  // Awoken onto the seed's hex rides the server's own deploy law
  // for the hold — no assault, no instant break; the waves decide.
  // Casting never closes, so this answers before and during a run.
  const handleDeployFirstSeed = async () => {
    if (seedBusy || seedTeam.length === 0) return;
    setSeedBusy(true);
    setSeedError(null);
    try {
      await api.deployFirstSeed({ awakenedIds: seedTeam });
      setSeedTeam([]);
      await refreshTerritory();
      await firstSeedQ.refetch();
      await refreshEnergy();
      onUpdate();
    } catch (e) {
      setSeedError(e instanceof Error ? e.message : "The company would not go.");
    } finally {
      setSeedBusy(false);
    }
  };

  const handleStartFirstSeedHold = async () => {
    if (seedBusy) return;
    setSeedBusy(true);
    setSeedError(null);
    try {
      await api.startFirstSeedHold();
      await firstSeedQ.refetch();
    } catch (e) {
      setSeedError(e instanceof Error ? e.message : "The hold would not begin.");
    } finally {
      setSeedBusy(false);
    }
  };

  const handleEndFirstSeedRun = async () => {
    if (seedBusy) return;
    setSeedBusy(true);
    setSeedError(null);
    try {
      await api.endFirstSeedRun();
      await firstSeedQ.refetch();
      await refreshTerritory();
    } catch (e) {
      setSeedError(e instanceof Error ? e.message : "The run would not end.");
    } finally {
      setSeedBusy(false);
    }
  };

  // The seed's third rising once freed a newborn here, gathered
  // through Wake One (Nigel, 2026-10-18) — STRUCK (Nigel,
  // 2026-10-19): the event grants no birth. Its reward now is a
  // single attunement point, gathered from the shining pop on
  // the Tender's home face (claimFirstSeedReward).

  const handleSetStance = async (awakenedId: number, stance: "attack" | "defense" | "binding", opts?: { keepOpen?: boolean }) => {
    void opts;
    try {
      await api.setStance({ awakenedId, stance, maxEnergy });
      await refreshEnergy();
      const refreshed = await api.getTerritory();
      setPlacements(refreshed.placements); setElsewhere(refreshed.elsewhere ?? []);
      if (stance === "attack") {
        setAttackTargeting(true);
      } else {
        setAttackTargeting(false);
      }

    } catch (e) {
      console.error("Stance change failed", e);
    }
  };

  const handleAttack = async (tileId: number) => {
    if (selectedAwoken === null) return;
    // (No client energy gate — the server's cashier decides; see deploy.)
    try {
      const result = await api.attackTile({ awakenedId: selectedAwoken, tileId }) as any;
      await refreshEnergy();
      // Thorns land server-side now: mirror the authoritative attacker HP
      // the server returns. At 0 HP the server has already dissipated the
      // attacker back to hand — the refreshed placements below show it.
      if (typeof result.attackerHp === "number") {
        setAwokenHp(prev => new Map(prev).set(selectedAwoken, result.attackerHp));
      }
      const refreshed = await api.getTerritory();
      setTiles(refreshed.tiles);
      setPlacements(refreshed.placements); setElsewhere(refreshed.elsewhere ?? []);
      // The blow speaks (Nigel, 2026-10-18: "a blow per order" —
      // the Attack seal is posture AND key: with targeting armed, a
      // tap on a cursed square is one strike of the warden's power
      // against that tile's curse HP). attackTile wears the curse
      // honestly server-side — power per blow, purification at 0 —
      // and the curse does not answer (attrition law, 2026-10-19:
      // its teeth are the withering of whatever stands in it).
      const attackerName = tenderItems.find(a => a.id === selectedAwoken)?.name ?? "Your warden";
      if (result.wavePull) {
        // Pulled into the Unraveling! Open a wave battle for this tile.
        setWavePullTile(result.tileId);
        setShowBattleground(true);
      } else if (result.purified) {
        // No newborn follows a purification (Nigel, 2026-10-14) —
        // the dead client call that still asked for one is gone;
        // the server refused it every time and the catch hid it.
        showHexNotice(`⚔ The curse breaks — the tile is purified.${result.sparked ? " The broken land smoulders with fire." : ""}`);
      } else if (typeof result.hp === "number") {
        showHexNotice(`⚔ ${attackerName} strikes the curse for ${result.damage} — curse ${result.hp}/${result.maxHp}.`);
      }
      setSelectedAwoken(null);
      setAttackTargeting(false);
      setTargetHexId(null);
      onUpdate();
    } catch (e) {
      console.error("Attack failed", e);
      showHexNotice(refusalText(e, "That strike was refused."));
      setAttackTargeting(false);
      setTargetHexId(null);
    }
  };

  // Move cost: 1 energy for small Awoken, up to 4 for fully powered.
  const moveCost = (power: number) => 1 + Math.floor((power - 1) / 3);

  const handleMove = async (tileId: number) => {
    if (selectedAwoken === null) return;
    const awoken = tenderItems.find(a => a.id === selectedAwoken);
    if (!awoken) return;
    // (No client energy gate — the server's cashier decides; see deploy.)
    try {
      await api.moveAwoken({ awakenedId: selectedAwoken, tileId });
      await refreshEnergy();
      const refreshed = await api.getTerritory();
      setPlacements(refreshed.placements); setElsewhere(refreshed.elsewhere ?? []);
      setSelectedAwoken(null);
      setMoveTargeting(false);
      setTargetHexId(null);
      onUpdate();
    } catch (e) {
      console.error("Move failed", e);
      showHexNotice(refusalText(e, "That move was refused."));
      setMoveTargeting(false);
      setTargetHexId(null);
    }
  };

  // The hex-tap law (round four): ONE chain decides what a tap on a hex
  // means, and every layer that can cover a hex — the tile polygon, a
  // building standing on it, an Awoken standing on it — routes its taps
  // here while a flow is armed. Before this, covered hexes were simply
  // unreachable: their taps died in the covering element's own handler.
  // ── Casting from the book (the Grimoire, Nigel 2026-10-17) ──
  const castSpell = grim?.spells.find((sp) => sp.key === castSpellKey) ?? null;
  const grimGlyphImg = (spellKey: string): string | null => {
    const sp = grim?.spells.find((x) => x.key === spellKey);
    const g = sp ? grim?.glyphs.find((x) => x.id === sp.glyphId) : null;
    return g?.imageUrl ?? (g?.assetKey ? GRIM_BUNDLED[g.assetKey] ?? null : null) ?? GRIM_BUNDLED[spellKey] ?? null;
  };
  // A cast run's end (Nigel, 2026-10-20): the readied
  // working leaves the hand — the mode unloads whole. Casts
  // themselves never end it (the mode is sticky); only the
  // player's own unload, the purse's refusal, or a fizzle's
  // slip does.
  const endMapCastRun = () => { setCastMode(false); setCastSpellKey(null); setCastAnchor(null); setAttuneElement(null); };
  // The mount-once Escape handler reaches the run's end
  // through this ref, kept current every render.
  const endMapCastRunRef = useRef<() => void>(() => {});
  endMapCastRunRef.current = endMapCastRun;
  const doCastMap = async (args: { tileId?: number; dir?: number; awakenedId?: number }) => {
    if (!castSpell) return;
    // THE CAST GESTURE FOR WORKINGS (Nigel, 2026-10-23 —
    // "I want casting animation on homeland too"): a working
    // cast raises the Tender's cast pose exactly as a summon
    // cast does — the Table's beginCast law: the gesture
    // begins with the order itself, at the firing, whatever
    // the reckoning (a fizzle was still cast; a refusal was
    // still ordered). He faces the working's ground where
    // the cast names it — the tapped hex, or the hex the
    // mended one stands on — and keeps his standing facing
    // where it names none. Every homeland door ends here:
    // the wheel's Spell/Ward/Rune/Binding branches and the
    // hotbar's pinned workings only READY the working; the
    // land's tap and the ward's edge fire through this one
    // mouth, so this one raising covers them all. The pours
    // and attunings (pourBuild, attuneTile) are not casts
    // and never come through here — no gesture for them,
    // as at the Table.
    const targetTileId = args.tileId ?? (args.awakenedId != null ? placements.find((p) => p.awakenedId === args.awakenedId)?.tileId : undefined);
    const targetC = targetTileId != null ? tilePosCache.current.get(targetTileId) : undefined;
    tenderCastDirRef.current = targetC && tenderFig
      ? tenderDirOf(targetC.cx - tenderFig.x, targetC.cy - tenderFig.y)
      : tenderFig?.dir ?? "S";
    setTenderCastAt(Date.now());
    try {
      const res = await api.castMapWorking({ spellKey: castSpell.key, ...args });
      const formName = castSpell.forms[castHueFor(castSpell)] ?? castSpell.name;
      // The fizzle (Homeland Casting): the purse was charged
      // and the roll fell short — the client only speaks what
      // the server's roll said, never invents the outcome.
      // The slip ends the run (Nigel, 2026-10-20): the working
      // leaves the hand and must be readied again to cast on.
      if (res.fizzled) {
        showHexNotice(`${formName} unravels — the roll falls short (rolled ${res.roll}, ${res.mod != null && res.mod >= 0 ? "+" : ""}${res.mod} against DC ${res.dc}); the ${res.cost}✦ is spent — and the working slips from your hand. Ready it again to cast on.`);
        endMapCastRun();
        await refreshWorkings();
        void refreshEnergy();
        return;
      }
      showHexNotice(castSpell.engine === "heal"
        ? `${formName} mends ${res.healed ?? 0} HP — the binding light, at your word.`
        : castSpell.engine === "springleaf"
          ? `${formName} takes root — a grove of ${res.radiusHexes ?? 1} hexes' glow; its burst mends ${res.burst ?? 0} HP, and ${res.saplings ?? 0} saplings follow.`
          : castSpell.kind === "ward"
            ? `${formName} rises on the edge — the Written Light stands on your land, and the border is guarded.`
            : res.purified
              ? `${formName} springs — and the curse on that ground BREAKS. The hex is yours.`
              : res.felled
                ? `${formName} springs — the dark standing on it falls.`
                : res.sprung
                  ? `${formName} springs as it is written — the dark and the curse take its harm.`
                  : `${formName} is written into the ground — it waits for the dark to stand on it.`);
      setCastAnchor(null);
      await refreshWorkings();
      void refreshEnergy();
    } catch (e) {
      // The refusal shows; and when the purse itself refuses
      // (the server's "Not enough energy" from castMapWorking),
      // the run ends too — the working leaves the hand
      // (Nigel, 2026-10-20). Other refusals (reach, the gate)
      // keep the mode, as they always have.
      const msg = e instanceof Error ? e.message : "The casting would not take.";
      showHexNotice(msg);
      if (/^Not enough energy/.test(msg)) endMapCastRun();
    }
  };
  const handleCastTap = (tile: { id: number; cursed: number | boolean }) => {
    if (!castSpell) { showHexNotice("No working is readied — right-click and pick one from the wheel."); return; }
    // The Springleaf is a binding by the book's filing, but
    // she is planted on GROUND, not cast on a body — the tap
    // casts her on her hex (Homeland Casting).
    if (castSpell.engine === "springleaf") { void doCastMap({ tileId: tile.id }); return; }
    if (castSpell.engine === "heal" || castSpell.kind === "binding") {
      const wounded = placements.filter((p) => p.tileId === tile.id).map((p) => {
        const a = tenderItems.find((x) => x.id === p.awakenedId);
        return { id: p.awakenedId, name: p.name, hp: awokenHp.get(p.awakenedId) ?? a?.toughness ?? 0, max: a?.toughness ?? 0 };
      }).filter((x) => x.max > 0 && x.hp < x.max).sort((x, y) => (x.hp / x.max) - (y.hp / y.max));
      if (!wounded.length) { showHexNotice("No wounded Awokin stands on that hex."); return; }
      void doCastMap({ awakenedId: wounded[0].id });
      return;
    }
    if (castSpell.kind === "ward") {
      if (castAnchor === null) {
        // WARDS STAND ANYWHERE (Nigel, 2026-10-20): any hex
        // of his land may anchor a ward now — his Awokin
        // need not hold it, nor he stand on it. Cursed
        // ground is lawful too; it eats what stands on it.
        setCastAnchor(tile.id);
        showHexNotice("Now tap one of the glowing edges of that hex.");
        return;
      }
      if (tile.id === castAnchor) { setCastAnchor(null); return; }
      showHexNotice("Tap one of the glowing edges — or the anchor hex again to choose another.");
      return;
    }
    void doCastMap({ tileId: tile.id });
  };

  // ── MARCH ORDERS OBEYED (Nigel, 2026-10-22 — the
  // marching-orders spec): the wheel arms the order; the tap
  // on the land — or the dragged line — IS the order.
  // No quote, no confirm: the server's march verb is fired
  // at once and speaks any refusal itself. The company
  // muster keeps the quote era's assignment arithmetic
  // (nearest first, open ground preferred, each by its
  // own road) but fires it instead of showing it.
  const fireMarchOne = async (awakenedId: number, tileId: number, point?: { q: number; r: number }): Promise<boolean> => {
    try {
      await api.setMarch({ awakenedId, tileId, ...(point ? { posQ: point.q, posR: point.r } : {}) });
      return true;
    } catch (err) {
      showHexNotice(err instanceof Error ? err.message : "The march was refused.");
      return false;
    }
  };

  const musterAssignments = (ids: number[], destTile: TerritoryTile): { awakenedId: number; tileId: number }[] => {
    const openTiles = tiles.filter(t => !t.cursed);
    const candidates = [...openTiles].sort((a, b) =>
      hexDistanceAxial(a.q, a.r, destTile.q, destTile.r) - hexDistanceAxial(b.q, b.r, destTile.q, destTile.r) || a.id - b.id);
    const occupants = new Map<number, number>();
    for (const p of placements) {
      if (!p.marchPath) occupants.set(p.tileId, (occupants.get(p.tileId) ?? 0) + 1);
      else { const r = marchRoadOf(p); if (r.length) occupants.set(r[r.length - 1], (occupants.get(r[r.length - 1]) ?? 0) + 1); }
    }
    const assigned = new Map<number, number>();
    const leaving = new Map<number, number>();
    const out: { awakenedId: number; tileId: number }[] = [];
    for (const id of ids) {
      const p = placements.find(p => p.awakenedId === id);
      if (!p || p.marchPath) continue;
      // Open ground is a PREFERENCE, never a gate (THE
      // CROWDING GATE, Nigel 2026-10-18): the company still
      // spreads over the nearest open hexes while open
      // hexes last — and when every hex around the muster
      // point stands crowded, the nearest roaded hex takes
      // the figure all the same. Numbers tax the pace on
      // the server's reckoning; they refuse no one a place.
      const crowdOf = (tileId: number) => (occupants.get(tileId) ?? 0) - (leaving.get(tileId) ?? 0) + (assigned.get(tileId) ?? 0);
      let fallback: number | null = null;
      let settled = false;
      for (const cand of candidates) {
        if (cand.id !== p.tileId && !findRoadClient(p.tileId, cand.id)) continue;
        if (crowdOf(cand.id) >= 4) { if (fallback === null) fallback = cand.id; continue; }
        if (cand.id === p.tileId) { leaving.set(cand.id, (leaving.get(cand.id) ?? 0) + 1); }
        else {
          assigned.set(cand.id, (assigned.get(cand.id) ?? 0) + 1);
          leaving.set(p.tileId, (leaving.get(p.tileId) ?? 0) + 1);
          out.push({ awakenedId: id, tileId: cand.id });
        }
        settled = true;
        break;
      }
      if (!settled && fallback !== null) {
        if (fallback === p.tileId) { leaving.set(fallback, (leaving.get(fallback) ?? 0) + 1); }
        else {
          assigned.set(fallback, (assigned.get(fallback) ?? 0) + 1);
          leaving.set(p.tileId, (leaving.get(p.tileId) ?? 0) + 1);
          out.push({ awakenedId: id, tileId: fallback });
        }
      }
    }
    return out;
  };

  const fireGroupMarch = async (ids: number[], destTile: TerritoryTile) => {
    const orders = musterAssignments(ids, destTile);
    if (!orders.length) { showHexNotice("None of the company can march there — no road runs to it."); return; }
    let marched = 0;
    for (const o of orders) { if (await fireMarchOne(o.awakenedId, o.tileId)) marched++; }
    await refreshMarching();
    if (marched) showHexNotice(`The company marches — ${marched} on the road, each at their own pace.`);
  };

  // The line spread (Nigel, 2026-10-23): the selection
  // stands EVENLY along the dragged line — figure i takes
  // the i-th even point of the segment AS ITS OWN STANDING
  // POINT, sent whole to the march verb. The road is found
  // to the hex the point falls in; the point itself is
  // never rounded to that hex's centre — when the road
  // ends, the figure stands where the blip stood. No
  // count refuses a place on the line (the Crowding Gate
  // taxes a crowd with pace, not with refusal).
  const fireLineMarch = async (ids: number[], a: { x: number; y: number }, b: { x: number; y: number }) => {
    const members = ids
      .map(id => placements.find(p => p.awakenedId === id))
      .filter((p): p is FieldPlacement => !!p && !p.marchPath);
    if (!members.length) { showHexNotice("None of the company can take the line — they are already on the road."); return; }
    const n = members.length;
    const pts = members.map((_, i) => n === 1
      ? { x: b.x, y: b.y } // a lone Awokin takes the line's FAR end (Nigel, 2026-10-23)
      : { x: a.x + (b.x - a.x) * (i / (n - 1)), y: a.y + (b.y - a.y) * (i / (n - 1)) });
    let marched = 0;
    for (let i = 0; i < n; i++) {
      const p = members[i];
      const pt = pts[i];
      const point = screenToAxial(pt.x, pt.y, pan, zoom);
      // The blip's hex is the nearest ground there is —
      // cursed ground included (Nigel, 2026-10-23): a
      // line may fall on or across the curse at its
      // prices; nothing snaps the point to cleaner land.
      const dest = tiles
        .map(t => { const c = tileCenterScreen(t, pan, zoom); return { t, d: Math.hypot(c.cx - pt.x, c.cy - pt.y) }; })
        .sort((x, y) => x.d - y.d)[0]?.t;
      if (!dest) continue;
      if (dest.id === p.tileId) continue; // already stands on its point's hex
      if (!findRoadClient(p.tileId, dest.id)) continue;
      if (await fireMarchOne(p.awakenedId, dest.id, point)) marched++;
    }
    await refreshMarching();
    if (marched) showHexNotice(`The line is taken — ${marched} on the road, spread evenly along it.`);
  };

  const handleHexTap = (tile: { id: number; cursed: number | boolean }) => {
    if (bandJustClosed()) return; // a drag just ended here — it was a choosing, not a tap
    if (attuneElement) { void handleAttuneTap(tile); return; }
    if (castMode && castSpellKey) { handleCastTap(tile); return; }
    if (pendingMarch) {
      // THE ORDER OBEYS (Nigel, 2026-10-22): the wheel armed
      // the march; this tap IS the order — fired at once, no
      // quote, no confirm. A refusal speaks and the order
      // stays armed for another tap.
      const ids = pendingMarch.ids;
      const destTile = tiles.find(t => t.id === tile.id);
      if (!destTile) { showHexNotice("That ground is not on the field."); return; }
      if (ids.length === 1) {
        const p = placements.find(x => x.awakenedId === ids[0]);
        if (p && p.tileId === tile.id) { showHexNotice(`${p.name} already stands there.`); setPendingMarch(null); return; }
        if (!p || !findRoadClient(p.tileId, tile.id)) { showHexNotice("No road runs there — the ground itself bars the way."); return; }
        void (async () => {
          if (await fireMarchOne(ids[0], tile.id)) {
            setPendingMarch(null);
            await refreshMarching();
            showHexNotice("On the road — each figure at its own pace.");
          }
        })();
        return;
      }
      void (async () => { await fireGroupMarch(ids, destTile); setPendingMarch(null); })();
      return;
    }
    // THE BUILDING SYSTEM: a tap on a work under construction
    // opens its card — the pours are given there, never by the
    // road. (Armed modes above have already claimed their taps.)
    {
      const bt = tiles.find(t => t.id === tile.id);
      const bs = (bt as any)?.buildStage ?? 0;
      if (bt && bs >= 1 && bs <= 4 && !selectedBuilding && !attackTargeting && !moveTargeting && battlePool.length === 0) {
        openBuildTile(bt.id);
        return;
      }
    }
    if (patrolSettingFor !== null) {
      // Laying a patrol road: taps name waypoints, nothing else.
      const homeId = placements.find(p => p.awakenedId === patrolSettingFor)?.tileId;
      if (tile.id === homeId) { showHexNotice("That is the patrol's home — the road begins and ends there on its own."); return; }
      if (patrolDraft.includes(tile.id)) { showHexNotice("That hex is already on the road."); return; }
      if (patrolDraft.length >= 8) { showHexNotice("A patrol road holds at most eight waypoints."); return; }
      setPatrolDraft(d => [...d, tile.id]);
      return;
    }
    if (selectedBuilding && !tile.cursed) {
      setPendingTile(tile.id);
      setSelectedBuilders([]);
      setTargetHexId(null);
      clearHexConfirm();
    } else if (attackTargeting && selectedAwoken !== null) {
      if (touchMode) raiseHexConfirm("attack", tile.id);
      else { setTargetHexId(tile.id); handleAttack(tile.id); }
    } else if (moveTargeting && selectedAwoken !== null) {
      if (touchMode) raiseHexConfirm("move", tile.id);
      else { setTargetHexId(tile.id); handleMove(tile.id); }
    } else if (battlePool.length > 0) {
      // The readied company is for the ASSAULT only (the
      // summoning fix): quiet ground takes no deploy — the
      // wheel's cast fields Awokin now, at the Tender's side.
      const bt = tiles.find(t => t.id === tile.id);
      if (bt && !bt.cursed) {
        showHexNotice("Quiet ground takes no assault — summoning rides the wheel now: right-click to open it, pick your Awokin under its branch, and they stand at your side. A readied company is for cursed ground.");
        return;
      }
      if (touchMode) raiseHexConfirm("deploy", tile.id);
      else { setTargetHexId(tile.id); handleDeploy(tile.id); }
    }
    // A plain tap on open ground, with a classed Tender standing
    // on it: his body glides to the tapped hex — the tap is a road
    // for him, as the keys are. Every armed flow above claimed its
    // own tap and returned; the trailing chain's taps are
    // re-checked here, so a tap that reaches this line unclaimed
    // and unarmed is his to answer. The tap's old behaviour is
    // untouched — a plain tap never did anything else.
    if (tenderStandRef.current && !selectedBuilding && !attackTargeting && !moveTargeting && battlePool.length === 0) {
      const full = tiles.find(t => t.id === tile.id);
      if (full) {
        const c = tileCenterScreen(full, pan, zoom);
        tenderTargetRef.current = { x: c.cx, y: c.cy };
      }
    }
  };

  const handleDefend = async (isBoss = false, bossLvl = 1) => {
    // Always ensure wave data — create a default if fetch fails
    let w = wave;
    if (isBoss) {
      try {
        bossResolutionRef.current = null;
        setBossAspectGrant([]);
        // The boss ladder is the server's record now (War-Ground fix,
        // 2026-10-15): the level fought is the server's next boss, and
        // the fight opens only when the server says a boss waits — the
        // old localStorage count is retired.
        const bs = await api.getBossState();
        setBossLevel(bs.nextBossLevel);
        if (!bs.eligible) {
          showHexNotice("No boss waits — break a full cycle of three Unravelings since the last boss fell.");
          setIsBossFight(false);
          return;
        }
        const bw: any = await api.call("getBossWave", { bossLevel: bs.nextBossLevel });
        w = {
          waveNumber: bw.waveNumber,
          wavesDefeated: 0,
          frayCount: bw.frayCount,
          unravelers: bw.unravelers,
          totalPower: bw.totalPower,
          hollows: bw.hollows,
          tangles: bw.tangles,
          isBoss: true,
          bossLevel: bs.nextBossLevel,
        };
        setWave(w);
      } catch (e) {
        console.error("Boss wave fetch failed", e);
        setIsBossFight(false);
        return;
      }
    }
    if (!w) {
      try {
        w = await api.getWave();
        setWave(w);
      } catch (e) {
        console.error("Failed to get wave, using default", e);
        // Default wave: wave 1, 7 Fray
        w = { waveNumber: 1, wavesDefeated: 0, frayCount: 7, unravelers: 0, totalPower: 7 };
        setWave(w);
      }
    }
    // The target is read from the land itself (the Columns pass,
    // 2026-10-17): getWaveTarget is retired — a boss strikes a
    // standing edge of the light, picked here the way the
    // Battleground's own fallback always could.
    const nonBastion = tiles.filter(t => !(t.q === 0 && t.r === 0) && !t.cursed);
    const pick = nonBastion.length
      ? nonBastion[Math.floor(Math.random() * nonBastion.length)]
      : tiles.find(t => t.q === 0 && t.r === 0);
    if (pick) {
      setWaveTarget({
        tile: { id: pick.id, q: pick.q, r: pick.r },
        defenderIds: placements.filter(p => p.tileId === pick.id).map(p => p.awakenedId),
      });
      setShowTargetMap(true);
    } else {
      setWaveTarget(null);
      setShowBattleground(true);
    }
  };

  const handleTargetConfirmed = () => {
    // Phase 2: Open the battleground with the target's defenders
    setShowTargetMap(false);
    setShowBattleground(true);
  };

  // === WAVE SIMULATION (preview only) ===
  const simTilePos = (t: any) => {
    const size = HEX_BASE_SIZE * zoom;
    const TRAY_LIFT = Math.round(size * 0.2);
    const originX = 250, originY = 170;
    const { px, py } = isoOffset(t.q, t.r, size);
    return { cx: originX + px + pan.x, cy: originY + py + pan.y - (Math.max(1, t.height || 1) - 1) * TRAY_LIFT };
  };
  const startSim = () => {
    if (!wave || !tiles.length) return;
    // Find cursed perimeter tiles (cursed tiles adjacent to purified)
    const cursed = tiles.filter(t => t.cursed);
    const purified = tiles.filter(t => !t.cursed);
    if (!cursed.length || !purified.length) return;
    
    // Spawn unravelers on random cursed tiles.
    // Enemy stats come from the one source of truth: gameConfig.enemies
    // (workshop-overridable; fallbacks match the design law — Fray power 1).
    const units: typeof simUnits = [];
    let id = 0;
    const frayCfg = (gameConfig as any)?.enemies?.["fray"] ?? { power: 1, hp: 3 };
    const unravCfg = (gameConfig as any)?.enemies?.["unraveler"] ?? { power: 4, hp: 6 };
    for (let i = 0; i < wave.frayCount; i++) {
      const tile = cursed[Math.floor(Math.random() * cursed.length)];
      const { cx, cy } = simTilePos(tile);
      units.push({ id: id++, type: "fray", tileId: tile.id, hp: frayCfg.hp, maxHp: frayCfg.hp, power: frayCfg.power, x: cx, y: cy, targetX: cx, targetY: cy });
    }
    for (let i = 0; i < wave.unravelers; i++) {
      const tile = cursed[Math.floor(Math.random() * cursed.length)];
      const { cx, cy } = simTilePos(tile);
      units.push({ id: id++, type: "unraveler", tileId: tile.id, hp: unravCfg.hp, maxHp: unravCfg.hp, power: unravCfg.power, x: cx, y: cy, targetX: cx, targetY: cy });
    }
    
    setSimUnits(units);
    setSimActive(true);
    
    // Get tower/defender info
    const watchtowers = buildings.filter(b => b.buildingType === "watchtower" && b.status === "active");
    const thornWalls = buildings.filter(b => b.buildingType === "thorn-wall" && b.status === "active");
    const simTowerDamage = (gameConfig as any)?.buildings?.["watchtower"]?.damage ?? 3;
    const simTowerBonus = (gameConfig as any)?.buildings?.["watchtower"]?.powerBonus ?? 2;
    const simThornDamage = (gameConfig as any)?.buildings?.["thorn-wall"]?.damage ?? 1;
    
    // Track which units have been hit by volley (once per tower)
    const volleyHit = new Set<string>();
    
    // Animation loop: move toward center, apply defenses
    const timer = setInterval(() => {
      setSimUnits(prev => {
        if (!prev.length) {
          clearInterval(timer);
          setSimActive(false);
          return prev;
        }
        const center = tiles.find(t => t.q === 0 && t.r === 0) || purified[0];
        const { cx: ccx, cy: ccy } = simTilePos(center);
        
        return prev.map(u => {
          const dx = ccx - u.x;
          const dy = ccy - u.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 5) return u;
          const speed = 1.5;
          const nx = u.x + (dx/dist) * speed;
          const ny = u.y + (dy/dist) * speed;
          let hp = u.hp;
          
          // Find current tile (closest tile to unit position)
          let closestTile = null;
          let closestDist = Infinity;
          for (const t of tiles) {
            const { cx, cy } = simTilePos(t);
            const d = Math.sqrt((nx-cx)**2 + (ny-cy)**2);
            if (d < closestDist) { closestDist = d; closestTile = t; }
          }
          
          if (closestTile) {
            // Watchtower volley: 3 damage once per tower when in range (own + adjacent)
            for (const wt of watchtowers) {
              const wtTile = tiles.find(t => t.id === wt.tileId);
              if (!wtTile) continue;
              const dq = Math.abs(wtTile.q - closestTile.q);
              const dr = Math.abs(wtTile.r - closestTile.r);
              const inRange = (dq <= 1 && dr <= 1);
              const key = `${wt.id}-${u.id}`;
              if (inRange && !volleyHit.has(key)) {
                volleyHit.add(key);
                hp -= simTowerDamage;
              }
            }
            // Thorn Wall: 1 damage when entering tile
            const wall = thornWalls.find(w => w.tileId === closestTile.id);
            if (wall && u.tileId !== closestTile.id) {
              hp -= simThornDamage;
            }
            // Defenders: Awoken on tile deal full power as damage per tick
            // Enemies are stopped (don't advance) while defenders are present
            const defenders = placements.filter(p => p.tileId === closestTile.id && (p.stance === "defense" || p.stance === "attack"));
            if (defenders.length > 0) {
              const nearTower = watchtowers.some(wt => {
                const wtTile = tiles.find(t => t.id === wt.tileId);
                return wtTile && Math.abs(wtTile.q - closestTile.q) <= 1 && Math.abs(wtTile.r - closestTile.r) <= 1;
              });
              for (const d of defenders) {
                const aw = tenderItems.find(a => a.id === d.awakenedId);
                if (aw) {
                  hp -= ((aw.power || 3) + (nearTower ? simTowerBonus : 0)) * 0.5; // Meaningful damage per tick
                }
              }
              // Don't move while defenders hold the tile
              return { ...u, x: u.x, y: u.y, hp, tileId: closestTile?.id ?? u.tileId };
            }
          }
          
          return { ...u, x: nx, y: ny, hp, tileId: closestTile?.id ?? u.tileId };
        }).filter(u => u.hp > 0);
      });
    }, 50);
    
    simRef.current = { units, timer };
  };
  
  const stopSim = () => {
    if (simRef.current?.timer) clearInterval(simRef.current.timer);
    setSimActive(false);
    setSimUnits([]);
  };

  /** Start a single wave (turn-based). */
  const startBattle = () => {
    if (!wave || !tiles.length || battleActive) return;
    // The committed company: Awoken placed in attack or defense stance.
    // Towers alone cannot claim a victory — the server reckons the
    // result against this company (War-Ground fix, 2026-10-15).
    const fighterIds = placements
      .filter(p => p.stance === "attack" || p.stance === "defense")
      .map(p => p.awakenedId);
    if (!fighterIds.length) {
      showHexNotice("Commit Awokin in attack or defense stance first — towers alone cannot claim a victory.");
      return;
    }
    battleFighterIdsRef.current = fighterIds;
    seedBattleWalls();
    const committedPower = fighterIds.reduce((sum, id) => {
      const aw = tenderItems.find(a => a.id === id);
      return sum + (aw?.power ?? 0);
    }, 0);
    if (committedPower < wave.totalPower) {
      showHexNotice(`Your committed company stands at ${committedPower} against the Unraveling's ${wave.totalPower} — the War-Ground will not reckon a victory until the company matches it.`);
    }
    setBattleActive(true);
    setBattleWave(wavesCleared + 1);
    setTurnNumber(1);
    spawnBattleWave();
  };

  /** Hex distance for range calculations. */
  const hexDist = (a: { q: number; r: number }, b: { q: number; r: number }) => {
    return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
  };

  /** Get cached tile position (fast). */
  const getTilePos = (tileId: number) => tilePosCache.current.get(tileId);
  /** Get cached tile object (fast, avoids tiles.find). */
  const getTile = (tileId: number) => tileByIdCache.current.get(tileId);

  /** Spawn a battle wave on cursed tiles. */
  const spawnBattleWave = () => {
    const cursed = tiles.filter(t => t.cursed);
    if (!cursed.length) return;
    // Cache all tile positions and objects once (performance)
    tilePosCache.current.clear();
    tileByIdCache.current.clear();
    for (const t of tiles) {
      const { cx, cy } = simTilePos(t);
      tilePosCache.current.set(t.id, { cx, cy, q: t.q, r: t.r });
      tileByIdCache.current.set(t.id, t);
    }
    const units: typeof simUnits = [];
    let id = Date.now();
    const frayCfgB = (gameConfig as any)?.enemies?.["fray"] ?? { power: 1, hp: 3 };
    const unravCfgB = (gameConfig as any)?.enemies?.["unraveler"] ?? { power: 4, hp: 6 };
    // The enemy company is the server's composition for the CURRENT
    // server wave, exactly as getWave served it — no local escalation
    // on top (War-Ground fix, 2026-10-15: one composition law, held
    // server-side, so the battle fought is the battle resolved).
    const frayCount = wave!.frayCount;
    const unravelerCount = wave!.unravelers;
    for (let i = 0; i < frayCount; i++) {
      const tile = cursed[Math.floor(Math.random() * cursed.length)];
      const { cx, cy } = simTilePos(tile);
      units.push({ id: id++, type: "fray", tileId: tile.id, hp: frayCfgB.hp, maxHp: frayCfgB.hp, power: frayCfgB.power, x: cx, y: cy, targetX: cx, targetY: cy });
    }
    for (let i = 0; i < unravelerCount; i++) {
      const tile = cursed[Math.floor(Math.random() * cursed.length)];
      const { cx, cy } = simTilePos(tile);
      // Wave scaling rides on the config base HP, as before.
      units.push({ id: id++, type: "unraveler", tileId: tile.id, hp: unravCfgB.hp + wave!.waveNumber * 2, maxHp: unravCfgB.hp + wave!.waveNumber * 2, power: unravCfgB.power, x: cx, y: cy, targetX: cx, targetY: cy });
    }
    setBattleUnits(units);
    setTurnPhase("towers");
    // Auto-advance through phases with delays for readability
    setTimeout(() => doTowerPhase(), 800);
  };

  /** Phase 1: All towers fire at range 3. */
  const doTowerPhase = () => {
    const watchtowers = buildings.filter(b => b.buildingType === "watchtower" && b.status === "active");
    const wtDamage = (gameConfig as any)?.buildings?.["watchtower"]?.damage ?? 3;
    setBattleUnits(prev => {
      let updated = [...prev];
      for (const wt of watchtowers) {
        const wtTile = getTile(wt.tileId);
        if (!wtTile) continue;
        // Find closest enemy within range 3
        let best: typeof updated[0] | null = null;
        let bestDist = 4;
        for (const u of updated) {
          const uTile = getTile(u.tileId);
          if (!uTile) continue;
          const d = hexDist(wtTile, uTile);
          if (d <= 3 && d < bestDist) { bestDist = d; best = u; }
        }
        if (best) {
          updated = updated.map(u => u.id === best!.id ? { ...u, hp: u.hp - wtDamage } : u).filter(u => u.hp > 0);
        }
      }
      return updated;
    });
    setTurnPhase("initiative");
    setTimeout(() => doInitiativePhase(), battleSpeed * 1000);
  };

  /** Phase 2: Awoken and enemies act in initiative order (lower toughness = faster). */
  const doInitiativePhase = () => {
    if (battlePaused) { setTimeout(() => doInitiativePhase(), 500); return; }
    grimRoundTick();

    const fighters = placements
      .filter(p => p.stance === "attack" || p.stance === "defense")
      .map(p => {
        const aw = tenderItems.find(a => a.id === p.awakenedId);
        const tile = tiles.find(t => t.id === p.tileId);
        return aw && tile ? { ...p, aw, tile, initiative: aw.toughness || 3, isAwoken: true } : null;
      })
      .filter(Boolean) as any[];

    // Initialize Awoken HP if not set (HP = toughness)
    setAwokenHp(prev => {
      const next = new Map(prev);
      for (const f of fighters) {
        if (!next.has(f.awakenedId)) {
          next.set(f.awakenedId, (f.aw.toughness || 3));
        }
      }
      return next;
    });

    setBattleUnits(prev => {
      const combatants: any[] = [
        ...fighters.map(f => ({ ...f, toughness: f.initiative })),
        ...prev.map(u => ({ ...u, toughness: u.type === "fray" ? 1 : 3, isAwoken: false })),
      ].sort((a, b) => a.toughness - b.toughness);

      let updated = [...prev];
      const purified = tiles.filter(t => !t.cursed);
      const towers = buildings.filter(b => b.buildingType === "watchtower" && b.status === "active");
      // Watchtower aura: defenders on the tower's tile or adjacent fight at
      // +powerBonus (config-driven). Thorn walls bite enemies entering.
      const towerBonus = (gameConfig as any)?.buildings?.["watchtower"]?.powerBonus ?? 2;
      const towerAura = new Set<number>();
      for (const t of towers) {
        const tt = tiles.find(ti => ti.id === t.tileId);
        if (!tt) continue;
        for (const tile of tiles) if (hexDist(tt, tile) <= 1) towerAura.add(tile.id);
      }
      const thornDmg = (gameConfig as any)?.buildings?.["thorn-wall"]?.damage ?? 1;
      const thornWallTiles = new Set(buildings.filter(b => b.buildingType === "thorn-wall" && b.status === "active").map(b => b.tileId));

      for (const c of combatants) {
        if (c.isAwoken) {
          // Awoken: fire at range with -1 per hex penalty
          let best: typeof updated[0] | null = null;
          let bestDmg = 0;
          for (const u of updated) {
            const uTile = getTile(u.tileId);
            if (!uTile) continue;
            const d = hexDist(c.tile, uTile);
            // Exponential falloff: damage = power * 0.65^distance (min 1)
            // The Written Light's auras (the Grimoire): a Standard
            // on an edge of the striker's hex lends its bonus; a
            // Beacon lends its bonus against dark standing on or
            // beside the hexes it lights.
            const stdBonus = workings.filter((w) => w.engine === "standard").reduce((best, w) => {
              const [ea, eb] = grimEdgeTiles(w);
              return (c.tile.q === ea.q && c.tile.r === ea.r) || (c.tile.q === eb.q && c.tile.r === eb.r) ? Math.max(best, w.nums.strikeBonus ?? 1) : best;
            }, 0);
            const bcnBonus = workings.filter((w) => w.engine === "beacon").reduce((best, w) => {
              const [ea, eb] = grimEdgeTiles(w);
              const reach = [ea, eb, ...[ea, eb].flatMap((e) => WALL_DIR_DELTAS.map((d) => ({ q: e.q + d[0], r: e.r + d[1] })))];
              return reach.some((e) => uTile.q === e.q && uTile.r === e.r) ? Math.max(best, w.nums.darkBonus ?? 1) : best;
            }, 0);
            const effPower = (c.aw.power || 3) + (towerAura.has(c.tile.id) ? towerBonus : 0) + stdBonus + bcnBonus;
            const dmg = Math.max(1, Math.round(effPower * Math.pow(0.65, d)));
            if (dmg > bestDmg) { bestDmg = dmg; best = u; }
          }
          if (best) {
            updated = updated.map(u => u.id === best!.id ? { ...u, hp: u.hp - bestDmg } : u).filter(u => u.hp > 0);
          }
        } else {
          // Held fast: a sprung snare, a meld's grip, or thorns crossed
          // cost this enemy its action (War-Ground, 2026-10-15).
          const heldTicks = simSkipRef.current.get(c.id) ?? 0;
          if (heldTicks > 0) { simSkipRef.current.set(c.id, heldTicks - 1); continue; }
          // Enemy targeting: check for corruptible hex in reach first
          const uTile = getTile(c.tileId);
          if (!uTile) continue;

          // Find corruptible hexes (purified, no defenders/towers) within 2 hexes
          let targetHex = null;
          for (const p of purified) {
            const d = hexDist(uTile, p);
            if (d <= 2) {
              const hasDefenders = placements.some(pl =>
                pl.tileId === p.id && (pl.stance === "attack" || pl.stance === "defense")
              );
              const hasTower = towers.some(t => {
                const tt = tiles.find(ti => ti.id === t.tileId);
                return tt && hexDist(tt, p) <= 1;
              });
              if (!hasDefenders && !hasTower) { targetHex = p; break; }
            }
          }

          if (targetHex) {
            // Move toward corruptible hex (away from defenders)
            const dq = Math.sign(targetHex.q - uTile.q);
            const dr = Math.sign(targetHex.r - uTile.r);
            const next = tiles.find(t =>
              Math.abs(t.q - (uTile.q + dq)) <= 1 && Math.abs(t.r - (uTile.r + dr)) <= 1 &&
              t.id !== uTile.id
            );
            if (next) {
              const { cx, cy } = simTilePos(next);
              const runeDmg = springRuneOnTile(c.id, next);
              const gr = applyGrimoireEntry(c, next, updated);
              updated = gr.updated;
              thornsDragUnit(c.id, next);
              updated = updated.map(u => u.id === c.id ? (gr.moved ? { ...u, hp: u.hp - (thornWallTiles.has(next.id) ? thornDmg : 0) - runeDmg } : { ...u, x: cx, y: cy, tileId: next.id, hp: u.hp - (thornWallTiles.has(next.id) ? thornDmg : 0) - runeDmg }) : u).filter(u => u.hp > 0);
              // If reached the hex, attack purification
              if (next.id === targetHex.id) {
                damageTile(next.id, c.power || 2);
              }
            }
          } else {
            // No corruptible hex: prioritize attacking Awoken/towers
            let bestTarget: any = null;
            let bestDist = Infinity;
            // Find nearest fighter
            for (const f of fighters) {
              const d = hexDist(uTile, f.tile);
              if (d < bestDist) { bestDist = d; bestTarget = { type: "awoken", ...f }; }
            }
            // Find nearest tower
            for (const t of towers) {
              const tt = tiles.find(ti => ti.id === t.tileId);
              if (!tt) continue;
              const d = hexDist(uTile, tt);
              if (d < bestDist) { bestDist = d; bestTarget = { type: "tower", tile: tt }; }
            }

            if (bestTarget && bestDist <= 1) {
              // Attack! Closing on a fighter springs its tile's rune
              // first — the trap is on the crossing (War-Ground).
              if (bestTarget.type === "awoken") {
                const runeDmg = springRuneOnTile(c.id, bestTarget.tile);
                if (runeDmg > 0) {
                  updated = updated.map(u => u.id === c.id ? { ...u, hp: u.hp - runeDmg } : u).filter(u => u.hp > 0);
                }
                updated = applyGrimoireEntry(c, bestTarget.tile, updated).updated;
                if (updated.some(u => u.id === c.id)) {
                  damageAwoken(bestTarget.awakenedId, c.power || 2);
                  thornsDragUnit(c.id, bestTarget.tile);
                }
              }
              // Towers don't have HP yet — skip
            } else if (bestTarget) {
              // Move toward target
              const dq = Math.sign(bestTarget.tile.q - uTile.q);
              const dr = Math.sign(bestTarget.tile.r - uTile.r);
              const next = tiles.find(t =>
                Math.abs(t.q - (uTile.q + dq)) <= 1 && Math.abs(t.r - (uTile.r + dr)) <= 1 &&
                t.id !== uTile.id
              );
              if (next) {
                const { cx, cy } = simTilePos(next);
                const runeDmg = springRuneOnTile(c.id, next);
                thornsDragUnit(c.id, next);
                updated = updated.map(u => u.id === c.id ? { ...u, x: cx, y: cy, tileId: next.id, hp: u.hp - (thornWallTiles.has(next.id) ? thornDmg : 0) - runeDmg } : u).filter(u => u.hp > 0);
              }
            } else {
              // No targets: move toward center
              const center = tiles.find(t => t.q === 0 && t.r === 0) || purified[0];
              if (center) {
                const dq = Math.sign(center.q - uTile.q);
                const dr = Math.sign(center.r - uTile.r);
                const next = tiles.find(t =>
                  Math.abs(t.q - (uTile.q + dq)) <= 1 && Math.abs(t.r - (uTile.r + dr)) <= 1 &&
                  t.id !== uTile.id
                );
                if (next) {
                  const { cx, cy } = simTilePos(next);
                  const runeDmg = springRuneOnTile(c.id, next);
                  thornsDragUnit(c.id, next);
                  updated = updated.map(u => u.id === c.id ? { ...u, x: cx, y: cy, tileId: next.id, hp: u.hp - (thornWallTiles.has(next.id) ? thornDmg : 0) - runeDmg } : u).filter(u => u.hp > 0);
                }
              }
            }
          }
        }
      }
      return updated;
    });

    if (!battleManual) {
      setTimeout(() => endTurn(), battleSpeed * 1000);
    }
  };

  /** Damage a tile (10 HP, visible when <10). Syncs to server. */
  const damageTile = async (tileId: number, dmg: number) => {
    try {
      const { hp, cursed } = await api.damageTileHp({ tileId, damage: Math.round(dmg) });
      setTileHp(prev => new Map(prev).set(tileId, hp));
      if (cursed) {
        // Tile fell — refresh territory
        onUpdate();
      }
    } catch (e) {
      console.error("Tile damage sync failed", e);
      // Fallback to local
      setTileHp(prev => {
        const next = new Map(prev);
        next.set(tileId, Math.max(0, (next.get(tileId) ?? 10) - dmg));
        return next;
      });
    }
  };

  /** Damage an Awoken (defends tile first). Syncs to server. */
  const damageAwoken = async (awakenedId: number, dmg: number) => {
    // The Written Light answers first (the Grimoire, Nigel
    // 2026-10-17): a Seal on the edge between the striker and
    // this fighter stops the blow cold and answers it; the
    // Trees take what crosses their edge into their own health.
    const placement = placements.find(p => p.awakenedId === awakenedId);
    const tile = placement ? tiles.find(t => t.id === placement.tileId) : null;
    if (tile) {
      for (const w of workings) {
        if (w.kind !== "ward" || w.engine !== "seal") continue;
        const st = grimBattleRef.current.get(w.id);
        if (!st || st.spent) continue;
        const [ea, eb] = grimEdgeTiles(w);
        const victimSide = (tile.q === ea.q && tile.r === ea.r) ? eb : (tile.q === eb.q && tile.r === eb.r) ? ea : null;
        if (!victimSide) continue;
        const attacker = grimUnitsRef.current.find((u) => {
          const ut = tiles.find((t) => t.id === u.tileId);
          return ut && ut.q === victimSide.q && ut.r === victimSide.r;
        });
        if (!attacker) continue;
        st.stops++;
        // The Seal's health rating: the stopped blow's power
        // comes out of the Seal's own health.
        st.hp -= dmg;
        if (st.stops >= (w.nums.stops ?? 3) || st.hp <= 0) st.spent = true;
        const rip = (w.nums.riposte ?? 3) + (grimBright() ? (w.nums.brightBonus ?? 1) : 0);
        setBattleUnits((prev) => prev.map((u) => u.id === attacker.id ? { ...u, hp: u.hp - rip } : u).filter((u) => u.hp > 0));
        showHexNotice(`${grimFormName(w)} stops the strike cold — and answers it (${rip}).`);
        return;
      }
      for (const w of workings) {
        if (dmg <= 0) break;
        if (w.kind !== "ward" || w.engine !== "trees") continue;
        const st = grimBattleRef.current.get(w.id);
        if (!st || st.spent || st.hp <= 0) continue;
        const [ea, eb] = grimEdgeTiles(w);
        if (!(tile.q === ea.q && tile.r === ea.r) && !(tile.q === eb.q && tile.r === eb.r)) continue;
        const absorbed = Math.min(st.hp, dmg);
        st.hp -= absorbed;
        dmg -= absorbed;
        if (st.hp <= 0) { st.spent = true; showHexNotice(`${grimFormName(w)} are broken — for this battle. The seed remembers them.`); }
        else showHexNotice(`${grimFormName(w)} take the blow meant for their Tender's own.`);
      }
      if (dmg <= 0) return;
    }
    // Hex walls absorb next (War-Ground, 2026-10-15): damage meant
    // for a fighter standing on a walled tile chews through that
    // tile's walls before it reaches the Awoken.
    if (tile) {
      let remaining = dmg;
      for (const w of wallsTouchingTile(tile)) {
        if (remaining <= 0) break;
        const hp = battleWallHpRef.current.get(w.edgeKey) ?? 0;
        if (hp <= 0) continue;
        const absorbed = Math.min(hp, remaining);
        battleWallHpRef.current.set(w.edgeKey, hp - absorbed);
        remaining -= absorbed;
        if (hp - absorbed <= 0) showHexNotice("A wall crumbles under the Unraveling's blows!");
      }
      if (remaining <= 0) return;
      dmg = remaining;
    }
    try {
      const { hp } = await api.damageAwokenHp({ awakenedId, damage: Math.round(dmg) });
      setAwokenHp(prev => new Map(prev).set(awakenedId, hp));
    } catch (e) {
      console.error("Awoken damage sync failed", e);
      setAwokenHp(prev => {
        const next = new Map(prev);
        next.set(awakenedId, Math.max(0, (next.get(awakenedId) ?? 6) - dmg));
        return next;
      });
    }
  };

  /** Curse a tile that hit 0 HP. */
  const curseTile = (tileId: number) => {
    // TODO: call server to curse the tile
    console.log(`[battle] Tile ${tileId} falls to curse!`);
  };

  /** End of turn: check win/loss, or next turn. */
  const endTurn = () => {
    setBattleUnits(prev => {
      if (prev.length === 0) {
        // Wave cleared!
        setTimeout(() => onWaveCleared(), 100);
        return prev;
      }
      // Defeat: enemies remain and every committed fighter has fallen
      // (HP is the server-synced map; an untouched fighter has no entry
      // and stands at full toughness). Before this check existed the
      // battle soft-locked here — enemies kept striking with no loss
      // ever declared (War-Ground fix, 2026-10-15).
      const fighterIds = battleFighterIdsRef.current;
      if (fighterIds.length > 0 && fighterIds.every(id => (awokenHp.get(id) ?? 1) <= 0)) {
        setTimeout(() => onBattleLost(), 100);
        return prev;
      }
      // Next turn — in manual step-through, wait for the next Step
      // instead of advancing the phases on a timer.
      setTurnNumber(t => t + 1);
      if (!battleManual) {
        setTurnPhase("towers");
        setTimeout(() => doTowerPhase(), battleSpeed * 1000);
      }
      return prev;
    });
  };

  /** Refresh map + wave state from the server after a resolution. */
  const refreshAfterResolution = async () => {
    try {
      const refreshed = await api.getTerritory();
      setTiles(refreshed.tiles);
      setPlacements(refreshed.placements); setElsewhere(refreshed.elsewhere ?? []);
      setWalls(refreshed.walls ?? []);
      setSkills(refreshed.skills ?? []);
      setWorkings(refreshed.workings ?? []);
    } catch (e) { console.error("Territory refresh after resolution failed", e); }
    try {
      const w = await api.getWave();
      setWave(w);
      setWavesCleared(cycleFromDefeated(w.wavesDefeated));
    } catch (e) { console.error("Wave refresh after resolution failed", e); }
    await refreshEnergy();
    onUpdate();
  };

  /** Called when a wave is cleared. The clear is reported to the server
   *  for its reckoning — wave_state, XP, territory and the recovery clock
   *  all move only there (War-Ground fix, 2026-10-15). Until this wiring
   *  the in-map battle was local theatre: nothing it won was real. */
  const onWaveCleared = async () => {
    setBattleActive(false);
    setBattleUnits([]);
    setTurnPhase(null);
    // Binding heal between waves
    doBindingHeal();
    if (!wave) return;
    const survivors = battleFighterIdsRef.current
      .filter(id => (awokenHp.get(id) ?? 1) > 0);
    try {
      const res = await api.resolveBattle({
        victory: true,
        waveNumber: wave.waveNumber,
        survivorIds: survivors,
        targetTileId: waveTarget?.tile?.id,
        wallState: simWallState(),
        runesTriggered: [...simRunesTriggeredRef.current],
        ...grimReport(),
      });
      if (res.bonusEligible && res.bonusEligible.length > 0) {
        setBonusTiles(res.bonusEligible);
      }
      showHexNotice(`The Unraveling breaks — victory reckoned by the War-Ground (${res.committedPower ?? "?"} against ${res.wavePower ?? wave.totalPower}).`);
    } catch (e) {
      showHexNotice(refusalText(e, "The War-Ground did not reckon this victory."));
    }
    await refreshAfterResolution();
  };

  /** Binding Awoken heal: total power divided by wounded Awoken in hex + adjacent. */
  const doBindingHeal = () => {
    const binders = placements.filter(p => p.stance === "binding");
    if (!binders.length) return;
    setAwokenHp(prev => {
      const next = new Map(prev);
      for (const b of binders) {
        const bAw = tenderItems.find(a => a.id === b.awakenedId);
        const bTile = tiles.find(t => t.id === b.tileId);
        if (!bAw || !bTile) continue;
        const power = bAw.power || 3;
        // Find wounded Awoken in hex + adjacent
        const wounded: number[] = [];
        for (const p of placements) {
          if (p.stance !== "attack" && p.stance !== "defense") continue;
          const pTile = tiles.find(t => t.id === p.tileId);
          if (!pTile) continue;
          if (hexDist(bTile, pTile) <= 1) {
            const hp = next.get(p.awakenedId) ?? 6;
            // Woundedness is judged on the same basis the heal caps
            // at — toughness, the field health the map itself shows
            // (❤ hp/toughness). The power+toughness test that stood
            // here counted full-health Awoken as wounded and diluted
            // the split (Law's audit, Obs. 4; fixed 2026-10-17).
            const maxHp = (tenderItems.find(a => a.id === p.awakenedId)?.toughness || 3);
            if (hp < maxHp) wounded.push(p.awakenedId);
          }
        }
        if (wounded.length > 0) {
          const healPer = power / wounded.length;
          for (const id of wounded) {
            const aw = tenderItems.find(a => a.id === id);
            const maxHp = (aw?.toughness || 3);
            next.set(id, Math.min(maxHp, (next.get(id) ?? 0) + healPer));
          }
        }
      }
      return next;
    });
  };

  /** Called when the committed company has fallen with enemies still
   *  standing. The defeat is reported to the server, which takes its
   *  price — an unbound border tile falls (War-Ground fix, 2026-10-15). */
  const onBattleLost = async () => {
    setBattleActive(false);
    setBattleUnits([]);
    setTurnPhase(null);
    showHexNotice("The line has fallen — the Unraveling takes its price.");
    if (!wave) return;
    try {
      await api.resolveBattle({
        victory: false,
        waveNumber: wave.waveNumber,
        survivorIds: [],
        wallState: simWallState(),
        runesTriggered: [...simRunesTriggeredRef.current],
        ...grimReport(),
      });
    } catch (e) {
      console.error("Defeat resolution failed", e);
    }
    await refreshAfterResolution();
  };


  // Called when victory is detected — before the victory screen opens.
  // For a boss fight the resolution happens HERE (War-Ground fix,
  // 2026-10-15): the server's reckoning records the newborn claim and
  // rolls the aspect grant, so the screen shows the server's own roll —
  // and handleBattleEnd, which runs when the screen's buttons are
  // pressed, does not resolve the same victory twice.
  const handleVictoryDetected = async (survivors: number[] = [], wallState?: { edgeKey: string; hp: number }[], runesTriggered?: string[], grim?: { grimState: { id: number; hp?: number; stops?: number; charges?: number; spent?: boolean }[]; grimEnergy: number }) => {
    if (battleResolvedRef.current) return;
    battleResolvedRef.current = true;
    if (isBossFight && wave?.isBoss) {
      try {
        const res = await api.resolveBossBattle({
          victory: true,
          bossLevel: wave.bossLevel ?? bossLevel,
          survivorIds: survivors,
          wallState,
          runesTriggered,
          grimState: grim?.grimState,
          grimEnergy: grim?.grimEnergy,
        });
        bossResolutionRef.current = { victory: true, bossesDefeated: res.bossesDefeated };
        // The screen claims the OLDEST pending grant (the ledger pays
        // FIFO) — fetch it, so what is shown is exactly what a claim pays.
        const pending = await api.getPendingAspectGrant();
        setBossAspectGrant(pending.grant?.elements ?? res.aspectElements ?? []);
      } catch (e) {
        bossResolutionRef.current = { victory: false };
        showHexNotice(refusalText(e, "The War-Ground did not reckon this boss victory."));
        setBossAspectGrant([]);
      }
    }
  };

  const handleBattleEnd = async (result: { victory: boolean; survivors: number[]; continueWave?: boolean; bonusTileId?: number; wallState?: { edgeKey: string; hp: number }[]; runesTriggered?: string[]; grimState?: { id: number; hp?: number; stops?: number; charges?: number; spent?: boolean }[]; grimEnergy?: number }) => {
    const wasBoss = isBossFight && !!wave?.isBoss;
    const bossLvl = wave?.bossLevel ?? bossLevel;
    setShowBattleground(false);
    setIsBossFight(false);
    battleResolvedRef.current = false; // reset for next battle
    // Boss battle: resolve through the boss's own server path
    // (War-Ground fix, 2026-10-15). A victory was already reckoned at
    // detection (handleVictoryDetected) — here we only gather what it
    // freed. The wave ladder is not touched by a boss, either way.
    if (wasBoss && wavePullTile === null) {
      try {
        if (result.victory) {
          if (!bossResolutionRef.current) {
            // Detection never resolved (screen closed early) — resolve now.
            const res = await api.resolveBossBattle({ victory: true, bossLevel: bossLvl, survivorIds: result.survivors, wallState: result.wallState, runesTriggered: result.runesTriggered, grimState: result.grimState, grimEnergy: result.grimEnergy });
            bossResolutionRef.current = { victory: true, bossesDefeated: res.bossesDefeated };
          }
          if (bossResolutionRef.current.victory) {
            // The newborn claim stands in the ledger — gather it.
            try {
              // No tileId: the server's schema accepts it only when
              // positive — the old call passed 0 and was refused on
              // shape before the claim was ever reached, one more dead
              // link in the boss chain.
              await api.birthNewbornToHand({ liberatorNames: [] });
              showHexNotice("The boss breaks — a newborn is freed, and a wake credit waits at the Wake One spark.");
            } catch (e) { console.error("Boss newborn birth failed", e); }
          }
        } else if (!bossResolutionRef.current) {
          await api.resolveBossBattle({ victory: false, bossLevel: bossLvl, survivorIds: result.survivors, wallState: result.wallState, runesTriggered: result.runesTriggered, grimState: result.grimState, grimEnergy: result.grimEnergy });
        }
      } catch (e) {
        showHexNotice(refusalText(e, "The boss resolution was refused."));
      }
      bossResolutionRef.current = null;
      setBossAspectGrant([]);
      await refreshAfterResolution();
      return;
    }
    // Wave-pull battle (from mystery purification): resolve separately
    if (wavePullTile !== null) {
      const tileId = wavePullTile;
      setWavePullTile(null);
      try {
        const res = await api.resolveWavePull({ tileId, victory: result.victory, survivorIds: result.survivors });
        if (res.purified) {
          api.birthNewbornToHand({ tileId, liberatorNames: [] }).catch(() => {});
        }
        const refreshed = await api.getTerritory();
        setTiles(refreshed.tiles);
        setPlacements(refreshed.placements); setElsewhere(refreshed.elsewhere ?? []);
        await refreshEnergy();
        onUpdate();
      } catch (e) { console.error("Wave-pull resolve failed", e); }
      return;
    }
    // Column battle (the Columns, 2026-10-17): a victory is
    // reported to the Eye — the column falls and the ruled
    // 12-minute break begins. The Unraveling ladder is not
    // touched: a column is not a wave.
    if (battleColumnId !== null) {
      const columnId = battleColumnId;
      setBattleColumnId(null);
      try {
        if (result.victory) {
          const reck = await api.defeatIncursion({ columnId, survivorIds: result.survivors });
          const earned = (reck.xpGains ?? []).reduce((acc, g) => acc + g.xpGain, 0);
          if (earned > 0) showHexNotice(`The attack breaks — your defenders earned ${earned} EXP from the killing and the victory.`);
        }
        else await api.failIncursion({ columnId }).catch(() => {});
        await refreshAfterResolution();
        void incursionsQ.refetch();
        void seedsQ.refetch();
      } catch (e) { console.error("Column resolution failed", e); }
      return;
    }
    if (!wave) return;
    try {
      // Always resolve with the real survivor list so XP and deeds are granted
      const battleRes = await api.resolveBattle({
        victory: result.victory,
        waveNumber: wave.waveNumber,
        survivorIds: result.survivors,
        continueWave: result.continueWave,
        targetTileId: waveTarget?.tile?.id,
        wallState: result.wallState,
        runesTriggered: result.runesTriggered,
        grimState: result.grimState,
        grimEnergy: result.grimEnergy,
      });
      if (battleRes.bonusEligible && battleRes.bonusEligible.length > 0) {
        setBonusTiles(battleRes.bonusEligible);
      }
      // Claim the picked bonus tile if one was chosen
      if (result.bonusTileId) {
        try {
          await api.claimBonusTile({ tileId: result.bonusTileId });
        } catch (e) { console.error("Bonus tile claim failed", e); }
        setBonusTiles([]);
      }
      const refreshed = await api.getTerritory();
      setTiles(refreshed.tiles);
      setPlacements(refreshed.placements); setElsewhere(refreshed.elsewhere ?? []);
      setWalls(refreshed.walls ?? []);
      setWorkings(refreshed.workings ?? []);
      const w = await api.getWave();
      setWave(w);
      await refreshEnergy();
      onUpdate();
    } catch (e) {
      console.error("Battle resolve failed", e);
    }
  };

  const courtMarks = useCourtMarks();
  const isCourt = (a: Awakened) => courtMarks.championId === a.id || courtMarks.housedIds.has(a.id);
  const toggleBattlePool = (a: Awakened) => {
    // Court-bound: housed Awoken and the champion stay in hand for battles —
    // they never stage for field deployment.
    if (isCourt(a) && !battlePool.includes(a.id)) {
      showHexNotice(`${a.name} is of the court — housed Awokin and the champion stay in hand for battles.`);
      return;
    }
    setBattlePool(prev => {
      if (prev.includes(a.id)) return prev.filter(id => id !== a.id);
      if (prev.length >= 4) return prev;
      return [...prev, a.id];
    });
  };

  // Helper: get dominant element from Awoken layers (simplified)
  const getDominantElement = (awoken: Awakened): string => {
    // TODO: detect from piece names; default to neutral for now
    return "neutral";
  };

  // The old 13-minute attunement countdown is retired (Nigel,
  // 2026-10-15): it counted toward a ghost — the legacy server block
  // that flipped neutral tiles by name-guessing, now removed. The
  // land's attunement is read where the real engine speaks: the
  // tile's own seal badge (bank ETA) and its stack bar (trays).
    // The empty state is the first seed's step above — the
    // Tutorial overlay teaches; it never claimed ground.
    // Simple grid layout for now; parallax via row scaling
  // Project a point from the tilted map plane to screen coordinates.
  // The map container has: perspective(900px) rotateX(32deg), origin at center 60%.
  const projectTilted = (cx: number, cy: number, viewW: number, viewH: number) => {
    const theta = 40 * Math.PI / 180;
    const ox = viewW / 2, oy = viewH * 0.6;
    const dy = cy - oy;
    const y1 = dy * Math.cos(theta);
    const z = dy * Math.sin(theta);
    const scale = 900 / (900 - z);
    return {
      x: ox + (cx - ox) * scale,
      y: oy + y1 * scale,
      scale,
    };
  };
  const tiltPoint = (x: number, y: number) => projectTilted(x, y, 500, 340);

  // ── Orders anchors (Nigel, 2026-10-18): the stance picker and the
  // march / company / patrol bars hang BELOW the figure they command
  // — under its feet, on the map — instead of above the Awoken or in
  // the fixed strip behind the deck hand. The anchor re-derives the
  // field render's own geometry (tilePos lives inside renderGrid, so
  // the iso math is walked again here, step for step): the figure's
  // standing point on its hex, the ground line its feet stand on (growth
  // rises UP from that line, so the feet do not move with level),
  // the tray lift, and the field layer's cursed/purified lift. A
  // warden out on a road is anchored at its post, as the picker has
  // always anchored there.
  const ORDER_GAP = 8; // viewBox units of air between feet and orders
  const ordersAnchorBelow = (p: FieldPlacement): { x: number; y: number } | null => {
    const tile = tiles.find(t => t.id === p.tileId);
    if (!tile) return null;
    const size = HEX_BASE_SIZE * zoom;
    const TRAY_LIFT = Math.round(size * 0.2);
    const { px, py } = isoOffset(tile.q, tile.r, size);
    const cx = 250 + px + pan.x;
    const cy = 170 + py + pan.y - (Math.max(1, tile.height || 1) - 1) * TRAY_LIFT;
    // The figure's own standing point (Nigel, 2026-10-23):
    // the bar hangs below the feet the figure actually
    // stands on — its stored free point, read through the
    // same iso delta as the render reads it.
    const dp = p.posQ != null && p.posR != null ? isoOffset(p.posQ, p.posR, size) : null;
    const dc = isoOffset(tile.q, tile.r, size);
    const fx = dp ? cx + (dp.px - dc.px) : cx;
    const fy = dp ? cy + (dp.py - dc.py) : cy;
    const awScale = 0.8 + zoom * 0.5;
    const feetY = fy + (20 * awScale) / 2 + (tile.cursed ? 0 : -5);
    return { x: fx, y: feetY + ORDER_GAP };
  };
  const anchorPct = (pt: { x: number; y: number } | null) =>
    pt ? { xPct: (pt.x / 500) * 100, yPct: (pt.y / 340) * 100 } : null;
  const placementOf = (id: number | null) =>
    id !== null ? placements.find(p => p.awakenedId === id) ?? null : null;

  const patrolPlacementForAnchor = placementOf(patrolSettingFor);
  const patrolAnchor = useClampedAnchor(
    patrolPlacementForAnchor ? anchorPct(ordersAnchorBelow(patrolPlacementForAnchor)) : null,
  );

  // The globe feeds the chosen warden (Nigel, 2026-10-18): feeding
  // left the individual Awoken screens; the energy globe houses it,
  // 10✦ at a time, through the same feedEnergy law — and refusals
  // speak through the hex notice, as the picker's messages read.
  const feedTarget = selectedAwoken !== null && placements.some(p => p.awakenedId === selectedAwoken)
    ? tenderItems.find(a => a.id === selectedAwoken) ?? null
    : null;
  const handleGlobeFeed = async () => {
    if (!feedTarget || selectedAwoken === null) return;
    const amt = 10;
    if (energy < amt) {
      showHexNotice(`Feeding ${feedTarget.name} takes ${amt}✦ — the globe holds ${energy}✦.`);
      return;
    }
    try {
      const r = await api.feedEnergy({ awakenedId: selectedAwoken, energy: amt });
      setEnergy(e => Math.max(0, e - amt));
      setOrbBump(b => b + 1);
      onUpdate();
      showHexNotice(r.leveledUp
        ? `${feedTarget.name} fed ${amt}✦ → +${r.xpGain} XP. Level ${r.newLevel}!${r.statPointsGained ? ` +${r.statPointsGained} stat point${r.statPointsGained > 1 ? "s" : ""}.` : ""}`
        : `${feedTarget.name} fed ${amt}✦ → +${r.xpGain} XP.`);
    } catch (e) {
      showHexNotice(e instanceof Error ? e.message : "Feeding failed");
    }
  };

  // Render hex grid with mathematical perspective tilt.
  // Hex tiles are tilted (landscape view), Awoken are projected to the tilted
  // positions but drawn upright (not skewed).
  const renderGrid = () => {
    // THE CAMERA (the flicker fix, Nigel 2026-10-23: "get the map
    // to stop flickering when its being moved"). The land is drawn
    // ONCE in stable land coordinates — hex size at the base 54,
    // no pan inside any tile's geometry — and the whole picture
    // rides on ONE transform carried by the two camera groups in
    // the return below (tile art behind the hit layer, everything
    // else in front of it). A pan or zoom therefore MOVES the
    // finished picture instead of repainting every tile at a new
    // place each frame: between state redraws the browser only
    // re-composites the moved layer, and the seams never re-paint.
    // Screen-constant marks inside the land (strokes, labels,
    // badges) divide by zoom so the camera's scale restores them
    // to exactly their old screen size; everything proportional
    // to the hex size converts by itself. The transparent hit
    // polygons stay OUTSIDE the camera, in screen coordinates
    // computed exactly as before (tileCenterScreen), so every
    // pointer conversion and every drive that solves the lattice
    // from their points reads the same numbers it always did.
    const size = HEX_BASE_SIZE;
    // XYZ grid (Nigel, 2026-10-15): one TRAY_LIFT of rise per tray
    // in a hex's stack. tilePos anchors the TOP tray; trays beneath
    // step down by TRAY_LIFT each, and everything standing on the
    // hex (Awoken, buildings) rides the same anchor to the top face.
    const TRAY_LIFT = Math.round(size * 0.2);
    // Center the (0,0) tile in the viewBox
    const originX = 250, originY = 170;
    const camTransform = `translate(${originX + pan.x} ${originY + pan.y}) scale(${zoom}) translate(${-originX} ${-originY})`;
    // Screen point -> land point (the camera's exact inverse);
    // the order line and the band box are born in screen pixels
    // and are painted in the land, so their ends convert here.
    const landX = (sx: number) => originX + (sx - originX - pan.x) / zoom;
    const landY = (sy: number) => originY + (sy - originY - pan.y) / zoom;
    // Isometric tiling vectors come from the ONE shared hex geometry
    // (ISO_E / ISO_SE / isoOffset at the top of this file) — the same
    // basis the overlay cells are solved from, so map, selection, and
    // hit-testing can never drift apart.
    const tilePos = (t: any) => {
      const { px, py } = isoOffset(t.q, t.r, size);
      const cx = originX + px;
      // A floating isle hovers above its own ground (the Building
      // System): the risen tile draws at its lift, its shadow
      // stays on the newborn beneath (drawn in the tile's face).
      const cy = originY + py - (Math.max(1, t.height || 1) - 1) * TRAY_LIFT - ((t.z ?? 0) > 0 ? floatLift(size) : 0);
      return { cx, cy };
    };
    // The marching layer's derivation (lives here, beside tilePos —
    // the walker's place is read off the same geometry as everything
    // else on this map): a MARCH runs its road once, by the fraction
    // of its hour gone; a PATROL runs out along its road and back the
    // same way, forever. Both from road + clock, on every screen.
    const patrolPositionOf = (p: FieldPlacement): { x: number; y: number } | null => {
      const mRoad = marchRoadOf(p).map(id => tiles.find(t => t.id === id)).filter(Boolean) as TerritoryTile[];
      if (mRoad.length >= 2 && p.marchSince && p.marchEnds && p.marchEnds > p.marchSince) {
        const centers = mRoad.map(t => tilePos(t));
        // THE FINAL APPROACH (Nigel, 2026-10-23): a march
        // carrying a free point ends AT the point — the
        // last segment is re-aimed from the destination's
        // centre to the standing point the figure will
        // hold when the road ends, so the walk and the
        // rest it arrives at are one unbroken motion.
        if (p.marchPosQ != null && p.marchPosR != null) {
          const destT = mRoad[mRoad.length - 1];
          const dp = isoOffset(p.marchPosQ, p.marchPosR, size);
          const dc = isoOffset(destT.q, destT.r, size);
          const lastC = centers[centers.length - 1];
          centers[centers.length - 1] = { cx: lastC.cx + (dp.px - dc.px), cy: lastC.cy + (dp.py - dc.py) };
        }
        // CURSED GROUND SLOWS THE MARCH (Nigel, 2026-10-20):
        // a segment whose destination tile is cursed takes
        // twice its share of the march's hour — the same
        // weighting the server lays on marchEnds.
        const segs: { a: { cx: number; cy: number }; b: { cx: number; cy: number }; len: number; w: number }[] = [];
        let totalW = 0;
        for (let i = 0; i < centers.length - 1; i++) {
          const len = Math.hypot(centers[i + 1].cx - centers[i].cx, centers[i + 1].cy - centers[i].cy);
          const w = mRoad[i + 1].cursed ? 2 : 1;
          segs.push({ a: centers[i], b: centers[i + 1], len, w }); totalW += len * w;
        }
        if (totalW <= 0) return null;
        const frac = Math.min(1, Math.max(0, (marchNow - p.marchSince) / (p.marchEnds - p.marchSince)));
        let d = frac * totalW;
        for (const s of segs) {
          const wl = s.len * s.w;
          if (d <= wl) { const k = wl ? d / wl : 0; return { x: s.a.cx + (s.b.cx - s.a.cx) * k, y: s.a.cy + (s.b.cy - s.a.cy) * k }; }
          d -= wl;
        }
        const last = centers[centers.length - 1];
        return { x: last.cx, y: last.cy };
      }
      const roadTiles = patrolRoadOf(p).map(id => tiles.find(t => t.id === id)).filter(Boolean) as TerritoryTile[];
      const home = tiles.find(t => t.id === p.tileId);
      if (!home || !roadTiles.length || !p.patrolSince) return null;
      const centers = [home, ...roadTiles].map(t => tilePos(t));
      // THE PATROL'S REST POINTS ARE ITS OWN (Nigel,
      // 2026-10-23): the road's home end stands on the
      // figure's own standing point, and its far end on
      // the patrol's stored destination point — the
      // interpolation may run tile to tile between the
      // waypoints, but at each end the figure rests on a
      // point of its record, never on a centre borrowed
      // from the tile or a fixed offset of the hex.
      if (p.posQ != null && p.posR != null) {
        const dp = isoOffset(p.posQ, p.posR, size);
        const dc = isoOffset(home.q, home.r, size);
        centers[0] = { cx: centers[0].cx + (dp.px - dc.px), cy: centers[0].cy + (dp.py - dc.py) };
      }
      if (p.patrolPosQ != null && p.patrolPosR != null) {
        const destT = roadTiles[roadTiles.length - 1];
        const dp = isoOffset(p.patrolPosQ, p.patrolPosR, size);
        const dc = isoOffset(destT.q, destT.r, size);
        const lastC = centers[centers.length - 1];
        centers[centers.length - 1] = { cx: lastC.cx + (dp.px - dc.px), cy: lastC.cy + (dp.py - dc.py) };
      }
      const route = [...centers, ...centers.slice(1, -1).reverse()];
      const routeTiles = [...[home, ...roadTiles], ...[home, ...roadTiles].slice(1, -1).reverse()];
      // CURSED GROUND SLOWS THE WALKER (Nigel, 2026-10-20):
      // a segment walked INTO cursed ground takes twice the
      // time — its weighted length doubles, here as in the
      // march law the server keeps.
      const segs: { a: { cx: number; cy: number }; b: { cx: number; cy: number }; len: number; w: number }[] = [];
      let total = 0;
      for (let i = 0; i < route.length; i++) {
        const a = route[i], b = route[(i + 1) % route.length];
        const len = Math.hypot(b.cx - a.cx, b.cy - a.cy);
        const w = routeTiles[(i + 1) % routeTiles.length]?.cursed ? 2 : 1;
        segs.push({ a, b, len, w }); total += len * w;
      }
      if (total <= 0) return null;
      // The walker's own pace (MARCH SPEED LAW): its element's gait
      // over one hex-step of this map, weighted by its level's size.
      const walker = tenderItems.find(x => x.id === p.awakenedId);
      const stepVec = isoOffset(1, 0, size);
      const stepPx = Math.hypot(stepVec.px, stepVec.py);
      const pxPerSec = walker && stepPx > 0 ? stepPx / marchSecondsPerHex(walker) : PATROL_SPEED;
      let d = ((marchNow - p.patrolSince) / 1000 * pxPerSec) % total;
      if (d < 0) d += total;
      for (const s of segs) {
        const wl = s.len * s.w;
        if (d <= wl) { const k = wl ? d / wl : 0; return { x: s.a.cx + (s.b.cx - s.a.cx) * k, y: s.a.cy + (s.b.cy - s.a.cy) * k }; }
        d -= wl;
      }
      return { x: route[0].cx, y: route[0].cy };
    };
    // Depth-sort by TILTED screen Y: further (higher on screen) drawn first.
    // This ensures front tiles always overlap back tiles, regardless of lift.
    // Build a set of cursed tile IDs adjacent to Awoken-occupied tiles (passive aura)
    const occupiedKeys = new Set(
      placements.map(p => {
        const t = tiles.find(t => t.id === p.tileId);
        return t ? `${t.q},${t.r}` : null;
      }).filter(Boolean)
    );
    const auraTiles = new Set<number>();
    for (const t of tiles) {
      if (!t.cursed) continue;
      const neighbors = [
        `${t.q+1},${t.r}`, `${t.q-1},${t.r}`,
        `${t.q},${t.r+1}`, `${t.q},${t.r-1}`,
        `${t.q+1},${t.r-1}`, `${t.q-1},${t.r+1}`,
      ];
      if (neighbors.some(n => occupiedKeys.has(n))) {
        auraTiles.add(t.id);
      }
    }
    const sortedTiles = [...tiles].sort((a, b) => {
      const pa = tilePos(a), pb = tilePos(b);
      return pa.cy - pb.cy;
    });
    // Entity layer: Awoken + buildings render ABOVE all terrain (Option A)
    // XYZ: entities sit on the tile top face, lifted by terrain height
    const buildingElements = sortedTiles.map((t) => {
      const { cx, cy } = tilePos(t);
      const s = size;
      // Two building slots per hex: offset left/right on the tile top face
      const slotOffset = s * 0.45;
      const tilePlacements = placements.filter(p => p.tileId === t.id);
      const awokens = tilePlacements.map(p => tenderItems.find(a => a.id === p.awakenedId)).filter(Boolean) as Awakened[];
      const awoken = awokens[0] ?? null;
      const lift = t.cursed ? 0 : -5;
      const tileBuildings = buildings.filter(b => b.tileId === t.id);
      // The hex's two populations (Nigel, 2026-10-18): the building
      // SEATS (max two, the old law) and the Dream Shroom WEDGES
      // (max six, the crop's own layer beside the seats).
      const seatBuildings = tileBuildings.filter(b => b.buildingType !== "dream-wheat");
      const shroomsByAge = tileBuildings.filter(b => b.buildingType === "dream-wheat").sort((a, b) => a.id - b.id);
      const hp = tileHp.get(t.id);
      const showHp = hp !== undefined && hp < 10;
      return (
        <g key={`entity-${t.id}`} transform={`translate(0,${lift / zoom})`}>
          {showHp && (
            <g transform={`translate(${cx},${cy - s * 0.7})`}>
              <rect x={-18 / zoom} y={-8 / zoom} width={36 / zoom} height={14 / zoom} rx={3 / zoom} fill="rgba(0,0,0,0.7)" stroke="#ff4444" strokeWidth={1 / zoom} />
              <text y={3 / zoom} textAnchor="middle" fontSize={10 / zoom} fill="#ff6666" fontWeight="bold">♥ {hp}/10</text>
            </g>
          )}
          {/* Buildings on this tile's seats (max 2) */}
          {seatBuildings.map((b, bi) => {
            const place = BUILDING_PLACE[b.buildingType];
            const bs = s * (BUILDING_BASE_SIZE / HEX_BASE_SIZE);
            // The seat is RECALCULATED for the bigger map (Nigel,
            // 2026-10-15): a building grounds on its hex's FLOOR, and
            // the floor dropped when the hexes grew — by 0.7174 (the
            // face's bottom-vertex depth) times the growth. Anchoring
            // at the old centre would leave every building floating
            // high in its hex; dropping the anchor by the floor's own
            // drop restores the exact seat each building held when
            // hex and building shared a measure.
            const seatDrop = 0.7174 * (s - bs);
            // A building ALONE on its tile anchors on the hex's own
            // heart (Nigel, 2026-10-15); the side offsets exist only
            // for a pair sharing one hex.
            const bpx = seatBuildings.length === 1 ? { x: cx, y: cy + seatDrop } : { x: cx + (bi === 0 ? -s * 0.45 : s * 0.45), y: cy - s * 0.35 + seatDrop };
            const pH = place ? (bs * place.displayH) / place.hFrac : 0;
            const pW = pH * (place?.aspect ?? 1);
            const isBuilding = b.status === "building";
            const isDormant = b.status === "dormant";
            const readyMs = b.readyAt ? new Date(b.readyAt).getTime() - Date.now() : 0;
            const readyMin = Math.max(0, Math.ceil(readyMs / 60000));
            return (
              <g key={`b-${b.id}`} className={isBuilding ? "building-constructing" : ""}
                onClick={async (e) => {
                  e.stopPropagation();
                  // A building stands ON a hex: while a flow is armed,
                  // a tap here is a tap on that hex (round four).
                  if (attackTargeting || moveTargeting || battlePool.length > 0) { handleHexTap(t); return; }
                  if (pendingTile !== null || moveTargeting) return; // Non-clickable in build/move mode
                  if (demoMode) {
                    if (confirm(`Demolish this ${b.buildingType}?`)) {
                      try {
                        await api.demolishBuilding({ buildingId: b.id });
                        const rb = await api.getBuildings();
                        setBuildings(rb.buildings);
                        onUpdate();
                      } catch (err) { console.error("Demolish failed", err); }
                    }
                    return;
                  }
                  if (b.buildingType === "attunement-shrine" && b.status === "active") {
                    // The shrine turns (Nigel, 2026-10-14): blessing
                    // (doubling nearby binders) or the LAND (pouring
                    // its congregation's element into the ring).
                    try {
                      const turning = (b as any).mode !== "attune";
                      await api.call("setShrineMode", { buildingId: b.id, mode: turning ? "attune" : "blessing" });
                      showHexNotice(turning
                        ? "The shrine turns to the land — its blessing sleeps while it pours its congregation's dominant element into its hex and the six around it, one hex about every five hours."
                        : "The shrine returns to its blessing — the doubling of nearby binders wakes again.");
                      const rb = await api.getBuildings();
                      setBuildings(rb.buildings);
                      onUpdate();
                    } catch (e) { showHexNotice(refusalText(e, "The shrine would not turn.")); }
                    return;
                  }
                  if (b.buildingType === "hall-of-champions") {
                    if (b.status !== "active") {
                      showHexNotice("The Hall of Champions is still rising — its doors open when the building stands complete.");
                      return;
                    }
                    setShowChampionTab(true);
                    window.setTimeout(() => document.getElementById("hall-panel-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
                    return;
                  }
                  const HARVESTABLE_TYPES = ["dream-wheat", "dream-weed", "sky-bloom"];
                  if (!HARVESTABLE_TYPES.includes(b.buildingType) || b.status !== "active") return;
                  const readyAt = b.readyAt ? new Date(b.readyAt).getTime() : Date.now();
                  const lastHarvest = b.lastHarvestAt ? new Date(b.lastHarvestAt).getTime() : readyAt;
                  const growHours = b.growHours ?? 4;
                  const isReady = Date.now() - lastHarvest >= growHours * 60 * 60 * 1000;
                  if (isReady) {
                    try {
                      const r: any = await api.call("harvestWheat", { buildingId: b.id });
                      const rb = await api.getBuildings();
                      setBuildings(rb.buildings);
                      onUpdate();
                    } catch (err) { console.error("Harvest failed", err); }
                  }
                }}
                style={{ cursor: demoMode ? "pointer" : (pendingTile !== null || moveTargeting) ? "default" : ["dream-wheat", "dream-weed", "sky-bloom", "hall-of-champions"].includes(b.buildingType) ? "pointer" : "default" }}>
                <image
                  href={b.buildingType === "dream-wheat" ? wheatStageImage(b) : b.buildingType === "dream-weed" ? dreamWeedStageImage(b) : buildingImage(b.buildingType)}
                  x={place ? bpx.x - place.cx * pW : bpx.x - bs * (b.buildingType === "dream-tree" ? 1 : 0.5)}
                  y={place ? bpx.y - place.cy * pH : bpx.y - bs * (b.buildingType === "dream-tree" ? 1 : 0.5)}
                  width={place ? pW : bs * (b.buildingType === "dream-tree" ? 2 : 1)}
                  height={place ? pH : bs * (b.buildingType === "dream-tree" ? 2 : 1)}
                  preserveAspectRatio="xMidYMid meet"
                  opacity={isBuilding ? 0.7 : isDormant ? 0.4 : 1}
                  style={isBuilding ? { filter: `drop-shadow(0 0 ${12 / zoom}px #ffcc88)` } : undefined}
                />
                {isBuilding && (
                  <text x={bpx.x} y={bpx.y + bs * 0.4} textAnchor="middle" fontSize={8 / zoom} fill="#ffcc88">
                    ⏱ {readyMin >= 60 ? `${Math.floor(readyMin/60)}h${readyMin%60}m` : `${readyMin}m`}
                  </text>
                )}
              </g>
            );
          })}
          {/* Dream Shrooms on their wedges: up to six to a hex,
              seated evenly at the six wedge points, each growing
              and harvested on its own clock — the seat buildings'
              tap law (harvest when ripe) rides along. */}
          {shroomsByAge.map((b) => {
            const wedge = shroomWedgeOf(b, shroomsByAge);
            const wp = hexWedgePoint(cx, cy, s, wedge);
            const bs = s * (BUILDING_BASE_SIZE / HEX_BASE_SIZE);
            const seatDrop = 0.7174 * (s - bs);
            const bpx = { x: wp.x, y: wp.y + seatDrop * 0.35 };
            const wSize = s * 0.55;
            const isBuilding = b.status === "building";
            const readyMs = b.readyAt ? new Date(b.readyAt).getTime() - Date.now() : 0;
            const readyMin = Math.max(0, Math.ceil(readyMs / 60000));
            return (
              <g key={`shroom-${b.id}`} className={isBuilding ? "building-constructing" : ""}
                onClick={async (e) => {
                  e.stopPropagation();
                  // A shroom stands ON a hex: while a flow is armed,
                  // a tap here is a tap on that hex (round four).
                  if (attackTargeting || moveTargeting || battlePool.length > 0) { handleHexTap(t); return; }
                  if (pendingTile !== null || moveTargeting) return; // Non-clickable in build/move mode
                  if (demoMode) {
                    if (confirm(`Demolish this Dream Shroom?`)) {
                      try {
                        await api.demolishBuilding({ buildingId: b.id });
                        const rb = await api.getBuildings();
                        setBuildings(rb.buildings);
                        onUpdate();
                      } catch (err) { console.error("Demolish failed", err); }
                    }
                    return;
                  }
                  if (b.status !== "active") return;
                  const readyAt = b.readyAt ? new Date(b.readyAt).getTime() : Date.now();
                  const lastHarvest = b.lastHarvestAt ? new Date(b.lastHarvestAt).getTime() : readyAt;
                  const growHours = b.growHours ?? 4;
                  const isReady = Date.now() - lastHarvest >= growHours * 60 * 60 * 1000;
                  if (isReady) {
                    try {
                      await api.call("harvestWheat", { buildingId: b.id });
                      const rb = await api.getBuildings();
                      setBuildings(rb.buildings);
                      onUpdate();
                    } catch (err) { console.error("Harvest failed", err); }
                  }
                }}
                style={{ cursor: demoMode ? "pointer" : (pendingTile !== null || moveTargeting) ? "default" : "pointer" }}>
                <image
                  href={wheatStageImage(b)}
                  x={bpx.x - wSize / 2}
                  y={bpx.y - wSize / 2}
                  width={wSize}
                  height={wSize}
                  preserveAspectRatio="xMidYMid meet"
                  opacity={isBuilding ? 0.7 : 1}
                  style={isBuilding ? { filter: `drop-shadow(0 0 ${12 / zoom}px #ffcc88)` } : undefined}
                />
                {isBuilding && (
                  <text x={bpx.x} y={bpx.y + wSize * 0.4} textAnchor="middle" fontSize={8 / zoom} fill="#ffcc88">
                    ⏱ {readyMin >= 60 ? `${Math.floor(readyMin/60)}h${readyMin%60}m` : `${readyMin}m`}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      );
    });

    // Awoken layer: renders ABOVE all buildings.
    // FREE STANDING (Nigel, 2026-10-23 — the standing-point
    // system is out): every figure is drawn at its OWN stored
    // standing point — never gathered under its tile, never
    // slotted into one of the hex's fixed offsets, and never
    // hidden for numbers: a tile may hold a whole company
    // and every one of them renders, the Crowding Gate
    // taxing the crowd with slowness, never invisibility.
    // A figure on a road is drawn at its derived place on
    // the road; a figure at rest stands on its point, read
    // through the same iso geometry as its tile so height
    // and lift agree with the ground beneath it. The
    // figures are ordered by the depth of the ground under
    // their feet, as a painter orders them.
    const standingPointOf = (p: FieldPlacement, t: TerritoryTile): { x: number; y: number } => {
      const c = tilePos(t);
      if (p.posQ == null || p.posR == null) return { x: c.cx, y: c.cy };
      const dp = isoOffset(p.posQ, p.posR, size);
      const dc = isoOffset(t.q, t.r, size);
      return { x: c.cx + (dp.px - dc.px), y: c.cy + (dp.py - dc.py) };
    };
    const figureRows = placements
      .map((placement) => {
        const a = tenderItems.find(x => x.id === placement.awakenedId);
        const t = tiles.find(x => x.id === placement.tileId);
        if (!a || !t) return null;
        const pPos = patrolPositionOf(placement);
        const sp = pPos ?? standingPointOf(placement, t);
        return { placement, a, t, pPos, fx: sp.x, fy: sp.y };
      })
      .filter(Boolean) as { placement: FieldPlacement; a: Awakened; t: TerritoryTile; pPos: { x: number; y: number } | null; fx: number; fy: number }[];
    figureRows.sort((x, y) => x.fy - y.fy || x.a.id - y.a.id);
    const awokenElements = figureRows.map(({ placement, a, t, pPos, fx, fy }) => {
      const s = size;
      const lift = t.cursed ? 0 : -5;
      const ws = 15, hs = 20;
      const kx = fx;
      const ky = pPos ? fy + 0.28 * s : fy;
      const awScale = 0.8 + zoom * 0.5; // Grows with zoom for visibility
      // LEVEL PRESENCE (Nigel, 2026-10-16): a field Awoken's
      // map size compounds ×1.25 for every level above 1 —
      // Lv5 stands ~2.4× a Lv1, Lv10 ~7.5×: veterans tower
      // over the field, exactly as ruled. The level is the
      // card's own number (the experience fallback mirrors
      // the card's math). Growth is grounded: the feet stay
      // on today's ground line (baseAhs) and the size rises.
      const awLevel = Math.max(1, (a as any).level ?? Math.floor(Math.sqrt(((a as any).experience ?? 0) / 100)) ?? 1);
      const lvlScale = Math.pow(1.25, awLevel - 1);
      // The figure's screen size is awScale's law (fieldFigure-
      // HeightClient reckons it the same way) — in land space the
      // dims divide by zoom and the camera restores them exactly.
      const baseAhs = hs * awScale / zoom;
      const aws = ws * awScale * lvlScale / zoom, ahs = hs * awScale * lvlScale / zoom;
      const isWhispering = whisper?.awakenedId === a.id;
      // Each Awoken drifts on its own rhythm — subtle, never leaves its ground.
      const driftDur = (6 + (a.id % 5)).toFixed(1);
      const driftDelay = (-(a.id % 7)).toFixed(1);
      const isSelected = selectedAwoken === a.id;
      return (
        <g key={`awoken-${a.id}`} transform={`translate(0,${lift / zoom})`}><g>
                  <g key={a.id} className={(pPos ? "field-patroller" : "field-drifter") + (selectedGroup.includes(a.id) ? " field-chosen" : "")}
                    style={{
                      ...(pPos
                        // The bob keeps time with the walker's own feet:
                        // two strides a hex, by the MARCH SPEED LAW.
                        ? { animationDuration: `${Math.min(2.2, Math.max(0.3, marchSecondsPerHex(a) / 2)).toFixed(2)}s` }
                        : { "--drift-dur": `${driftDur}s`, "--drift-delay": `${driftDelay}s` }),
                      cursor: selectedBuilding ? "pointer" : "pointer",
                      pointerEvents: selectedBuilding ? "none" : "auto",
                    } as React.CSSProperties}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (bandJustClosed()) return; // the band's release is not a tap
                      // An Awoken stands ON a hex: while a flow is armed,
                      // a tap here is a tap on that hex (round four).
                      if (attackTargeting || moveTargeting || battlePool.length > 0 || patrolSettingFor !== null || pendingMarch) { handleHexTap(t); return; }
                      if (selectedBuilding) return; // Let tile handle it in build mode
                      if (applyingAspect) {
                        try {
                          const awoken = tenderItems.find(x => x.id === a.id);
                          const oldP = awoken?.power ?? 0, oldT = awoken?.toughness ?? 0;
                          const result: any = await api.call("applyAspect", { awakenedId: a.id, inventoryAspectId: applyingAspect.id });
                          refreshAspects();
                          setApplyingAspect(null);
                          await onUpdate();
                          // Fetch updated Awoken for celebration
                          const updated = tenderItems.find(x => x.id === a.id);
                          setCelebration({
                            awoken: updated || awoken,
                            aspect: result.upgraded ? { name: result.targetName, imageUrl: result.imageUrl } : applyingAspect,
                            element: result.element,
                            newLevel: result.newLevel,
                            oldPower: oldP, oldToughness: oldT,
                            newPower: (updated?.power ?? oldP), newToughness: (updated?.toughness ?? oldT),
                          });
                        } catch (err) {
                          alert(err instanceof Error ? err.message : "Failed to apply");
                        }
                        return;
                      }
                      // THE ORDERS WHEEL (Nigel, 2026-10-22):
                      // a click on a fielded Awokin opens ITS
                      // wheel — March, its stances, Follow, its
                      // taught works and doors — where the
                      // orders bar and the under-figure picker
                      // used to stand.
                      setSelectedAwoken(a.id);
                      setSelectedGroup([]); // a single choosing ends the company's
                      setAttackTargeting(false);
                      setMoveTargeting(false);
                      setOrdersWheel({ ids: [a.id], x: e.clientX, y: e.clientY });
                    }}>
                    {/* Light aura glow behind Awoken */}
                    <ellipse cx={kx} cy={ky} rx={aws * 0.48} ry={ahs * 0.44}
                      fill="rgba(255,240,200,0.28)"
                      style={{ filter: `blur(${6 / zoom}px)` }} />
                    <ellipse cx={kx} cy={ky} rx={aws * 0.38} ry={ahs * 0.34}
                      fill="rgba(255,250,230,0.22)"
                      style={{ filter: `blur(${4 / zoom}px)` }} />
                    {isWhispering && (
                      <ellipse cx={kx} cy={ky} rx={aws * 0.6} ry={ahs * 0.55}
                        fill="rgba(255,235,180,0.35)"
                        style={{ filter: `blur(${8 / zoom}px)` }} />
                    )}
                    {isSelected && (
                      <circle cx={kx} cy={ky} r={14 * awScale * lvlScale / zoom} fill="none" stroke="#ffd700" strokeWidth={1.5 / zoom} opacity="0.9" />
                    )}
                    <g data-summon-fig={a.id} style={{ filter: `drop-shadow(0 ${2 / zoom}px ${4 / zoom}px rgba(0,0,0,0.7))` }}>
                    <FieldAwoken awoken={a} assets={assets}
                      x={kx - aws / 2} y={ky + baseAhs / 2 - ahs}
                      width={aws} height={ahs} />
                    </g>
                    {placement && placement.stance !== "defense" && (
                      <text x={kx} y={ky + baseAhs / 2 - ahs - 4 / zoom} textAnchor="middle" fontSize={7 / zoom}
                        fill={placement.stance === "attack" ? "#ff6666" : "#66aaff"}>
                        {placement.stance === "attack" ? "⚔" : "✦"}
                      </text>
                    )}
                    {/* The per-Awoken attunement countdown stood here
                        until 2026-10-15 — retired with the ghost it
                        counted toward (see getAttuneRemaining's note). */}
                    {isWhispering && (() => {
                      const words = whisper.text.split(" ");
                      const lines: string[] = [];
                      let line = "";
                      for (const w of words) {
                        if ((line + " " + w).trim().length > 32) {
                          lines.push(line.trim());
                          line = w;
                        } else {
                          line = (line + " " + w).trim();
                        }
                      }
                      if (line) lines.push(line.trim());
                      return (
                        <g className="whisper-bubble" opacity="0.9">
                          {lines.map((ln, i) => (
                            <text key={i} x={kx} y={ky + baseAhs / 2 - ahs - 12 / zoom - (lines.length - 1 - i) * 9 / zoom}
                              textAnchor="middle" fontSize={7.5 / zoom} fontStyle="italic"
                              fill="#e8d5a8" className="whisper-text">
                              {ln}
                            </text>
                          ))}
                        </g>
                      );
                    })()}
                  </g>
                  {/* The tile attunement pill stood here until 2026-10-15 —
                      retired with the ghost countdown it rendered. */}
            </g>
        </g>
      );
    });

    const elements = sortedTiles.map((t, i) => {
      // Flat-top XYZ: tilePos handles axial->pixel + height lift
      const { cx, cy } = tilePos(t);
      const s = size;
      // The fitted hex cell from the shared geometry (hexCellPoints) —
      // the same cell the terrain tiles by, so this tint, the click
      // target below, and every selection overlay share full edges
      // with their neighbors: one hexmap, never a lattice of strays.
      const pts = hexCellPoints(cx, cy, s);
      const tileKey = t.cursed ? "cursed" : (TERRAIN[t.element] ? t.element : "neutral");
      const imgOff = TERRAIN_IMG_OFFSET[tileKey] ?? { dx: 0, dy: 0 };

      const placement = placements.find(p => p.tileId === t.id);
      const tilePlacements = placements.filter(p => p.tileId === t.id);
      const awokens = tilePlacements.map(p => tenderItems.find(a => a.id === p.awakenedId)).filter(Boolean) as Awakened[];
      const awoken = awokens[0] ?? null;
      const lift = t.cursed ? 0 : -5; // Purified land hovers above the cursed
      return (
        <g key={t.id} transform={`translate(0,${lift / zoom})`}>
          {/* A FLOATING ISLE's shadow (the Building System,
              2026-10-19): the risen tile's shade lies on the
              ground it left — the newborn beneath wears it. */}
          {(t as any).z > 0 && (
            <ellipse cx={cx} cy={cy + floatLift(s) + s * 0.12} rx={s * 1.05} ry={s * 0.5}
              fill="rgba(0,0,0,0.32)" pointerEvents="none" />
          )}
          {/* Isometric tile: 1920x1280 PNG; painted face measured 1730×944
              with its center at (964, 546) source px. The x/y place the
              image so the face center lands exactly on the tile's
              lattice point (cx, cy); imgOff seats off-template art. */}
          {t.cursed ? (
            <image href={TERRAIN[tileKey]}
              x={cx - s * 1.2106 + imgOff.dx * s} y={cy - s * 0.6857 + (imgOff.dy + (TERRAIN_IMG_PLACE[tileKey]?.dy ?? 0)) * s} width={s * 2.41} height={s * (TERRAIN_IMG_PLACE[tileKey]?.h ?? 1.608)}
              preserveAspectRatio="xMidYMid meet"
              style={auraTiles.has(t.id) ? { filter: `drop-shadow(0 0 ${12 / zoom}px rgba(255,215,0,0.9)) brightness(1.15)` } : undefined} />
          ) : (
            /* The stack (Nigel, 2026-10-15): a purified hex is drawn
               as its trays — the growing tray at the bottom wearing
               the stage of its fill, every sealed tray above it at
               stage 3, the top tray (drawn last) at the tile's
               anchor. Each tray is the full tile image, stepped down
               by TRAY_LIFT per level beneath the top. */
            Array.from({ length: Math.max(1, (t as any).height || 1) }, (_, i) => {
              const total = Math.max(1, (t as any).height || 1);
              const sealed = (t as any).traysSealed ?? 0;
              const isGrowing = i === 0 && sealed < 6;
              // The top tray wears the engine's stage (stageForTile);
              // beneath it, the growing tray wears its fill's stage
              // and sealed trays wear stage 3.
              const stage = i === total - 1 ? stageForTile(t) : isGrowing ? trayStageOf((t as any).growPoints ?? 0) : 3;
              const drop = (total - 1 - i) * TRAY_LIFT;
              return (
                <image key={`tray-${t.id}-${i}`} href={terrainImgFor(tileKey, stage, terrainArt)}
                  x={cx - s * 1.2106 + imgOff.dx * s}
                  y={cy - s * 0.6857 + (imgOff.dy + (TERRAIN_IMG_PLACE[tileKey]?.dy ?? 0)) * s + drop}
                  width={s * 2.41} height={s * (TERRAIN_IMG_PLACE[tileKey]?.h ?? 1.608)}
                  preserveAspectRatio="xMidYMid meet"
                  style={i === total - 1 && auraTiles.has(t.id) ? { filter: `drop-shadow(0 0 ${12 / zoom}px rgba(255,215,0,0.9)) brightness(1.15)` } : undefined} />
              );
            })
          )}
          {/* The turning of the land, made visible (Nigel, 2026-10-15):
              a hex whose attunement bank is filling toward a switch
              wears a small dark seal — the glyph of the element it is
              about to become (◇ for the neutral shore between) — and
              beneath it the honest estimate of the wait, from the
              pressing company's weight or the shrine's five-hour pour. */}
          {!t.cursed && (t as any).attuneElement && ((t as any).attunePoints ?? 0) > 0 && t.element !== (t as any).attuneElement && (() => {
            const target = (t as any).attuneElement as string;
            const nextStage = t.element === "neutral" ? target : "neutral";
            const remaining = 10 - ((t as any).attunePoints ?? 0);
            const rate = (t as any).attuneRatePts ?? 0;
            let etaSec: number | null = null;
            // attuneRatePts is points per HOUR (the day-long quest,
            // 2026-10-16): the wait is the remaining points at that
            // hourly rate.
            if (rate > 0) etaSec = Math.ceil((remaining / rate) * 3600);
            else if ((t as any).attuneShrineNextSec != null) etaSec = Math.max(30, (t as any).attuneShrineNextSec);
            const eta = etaSec == null ? `${Math.floor((t as any).attunePoints ?? 0)}/10` : etaSec < 90 ? `~${etaSec}s` : etaSec < 5400 ? `~${Math.round(etaSec / 60)}m` : `~${Math.round(etaSec / 360) / 10}h`;
            const col = nextStage === "neutral" ? "#9a958c" : (elementPalette[nextStage as keyof typeof elementPalette] ?? "#d4af6a");
            return (
              <g pointerEvents="none">
                <circle cx={cx + s * 0.48} cy={cy - s * 0.52} r={s * 0.30} fill="rgba(8,6,10,0.85)" stroke={col} strokeWidth={1.6 / zoom} />
                {nextStage === "neutral"
                  ? <text x={cx + s * 0.48} y={cy - s * 0.40} textAnchor="middle" fontSize={s * 0.34} fill={col}>◇</text>
                  : <g transform={`translate(${cx + s * 0.22}, ${cy - s * 0.624})`}><ElementGlyph element={nextStage as GlyphElement} color={col} width={s * 0.52} height={s * 0.208} /></g>}
                {eta && <text x={cx + s * 0.48} y={cy + s * 0.18} textAnchor="middle" fontSize={s * 0.42} fill="#f0e6cc" stroke="rgba(0,0,0,0.9)" strokeWidth={3.4 / zoom} paintOrder="stroke">{eta}</text>}
              </g>
            );
          })()}
          {/* One info bar per hex (Nigel, 2026-10-15): the stack's
              facts ride in the tile's badge cluster — Z (its trays),
              the whole stack's power, and the top tray's HP, the
              only skin erosion or an enemy can wound. Every purified
              tile wears it (Nigel, 2026-10-16): ungrown land reads
              Z1 · ⚔0 · ♥0 rather than staying silent, and the power
              carries the crossed-swords mark — the same mark the
              War-Grounds panel reads stack power by — never ✦,
              which is the Tender's energy and nothing else's. */}
          {!t.cursed && (
            <g pointerEvents="none">
              <rect x={cx - s * 0.98} y={cy + s * 0.80} width={s * 1.96} height={s * 0.36} rx={s * 0.18} fill="rgba(8,6,10,0.82)" />
              <text x={cx} y={cy + s * 1.06} textAnchor="middle" fontSize={s * 0.26} fill="#f0e6cc">
                {`Z${(t as any).height ?? 1} · ⚔${(((t as any).stackPower ?? 0) as number).toFixed(1).replace(/\.0$/, "")} · ♥${(t as any).topHp ?? 0}`}
              </text>
            </g>
          )}
          {/* THE BUILDING SYSTEM on the face (Nigel, 2026-10-19):
              a work under construction wears its stage — the
              element it is drinking, and the fill of its pours —
              because the stages ARE the animation: every pour of
              10 visibly fills the bar. A finished work wears its
              fire finish: the gold seal of the bake, or the deep
              mark of the lowering. */}
          {!t.cursed && ((t as any).buildStage ?? 0) >= 1 && ((t as any).buildStage ?? 0) <= 4 && (() => {
            const stage = (t as any).buildStage as number;
            const fill = Math.max(0, Math.min(30, (t as any).buildPoints ?? 0)) / 30;
            const el = stage === 1 ? "stone" : stage === 2 ? "root" : stage === 3 ? ((t as any).buildBranch ?? null) : "fire";
            const col = el === "tide" ? "#7db8e8" : el === "sky" ? "#bfe3ff" : el === "stone" ? "#cbb493" : el === "root" ? "#9dc08b" : el === "fire" ? "#e89a6a" : "#d4af6a";
            const glyph = stage === 1 ? "🪨" : stage === 2 ? "🌿" : stage === 3 ? ((t as any).buildBranch === "sky" ? "☁" : "🌊") : "🔥";
            const word = stage === 1 ? "coalescing" : stage === 2 ? "weaving" : stage === 3 ? ((t as any).buildBranch === "sky" ? "rising" : (t as any).buildBranch === "tide" ? "flooding" : "the branch") : "the fire";
            return (
              <g pointerEvents="none">
                <circle cx={cx} cy={cy - s * 0.18} r={s * 0.34} fill="rgba(8,6,10,0.85)" stroke={col} strokeWidth={1.6 / zoom} />
                <text x={cx} y={cy - s * 0.06} textAnchor="middle" fontSize={s * 0.36}>{glyph}</text>
                <rect x={cx - s * 0.62} y={cy + s * 0.34} width={s * 1.24} height={s * 0.17} rx={s * 0.08} fill="rgba(8,6,10,0.85)" stroke={col} strokeWidth={0.8 / zoom} />
                <rect x={cx - s * 0.62} y={cy + s * 0.34} width={s * 1.24 * fill} height={s * 0.17} rx={s * 0.08} fill={col} />
                <text x={cx} y={cy + s * 0.78} textAnchor="middle" fontSize={s * 0.24} fill="#f0e6cc" stroke="rgba(0,0,0,0.9)" strokeWidth={3 / zoom} paintOrder="stroke">
                  {`${word} · ${Math.floor((t as any).buildPoints ?? 0)}/30`}
                </text>
              </g>
            );
          })()}
          {!t.cursed && ((t as any).buildStage ?? 0) === 5 && ((t as any).baked || (t as any).lowered) && (
            <text pointerEvents="none" x={cx} y={cy + s * 1.34} textAnchor="middle" fontSize={s * 0.24} fill={(t as any).baked ? "#ffd977" : "#7db8e8"} stroke="rgba(0,0,0,0.9)" strokeWidth={3 / zoom} paintOrder="stroke">
              {(t as any).baked ? `🔥 sealed · charge ${Math.round((t as any).buildCharge ?? 0)}` : "▽ lowered deep"}
            </text>
          )}
          {t.cursed && (
            <ellipse cx={cx} cy={cy + s * 0.12} rx={s * 1.42} ry={s * 0.92}
              fill="url(#corruptionHalo)" pointerEvents="none" />
          )}
          {/* Corruption made visible (Nigel, 2026-10-14): cursed hexes
              GLOW crimson-violet from within — the dark bruising the land
              itself, never a red grid laid over it. Always on: the wilds
              smolder at the edge of the light. When a company is readied
              the bruise deepens and its pulse quickens — the dark knows
              it is being aimed at. Layered polygons, no SVG filters, so
              the iPad stays smooth. */}
          {t.cursed && (
            <g className={battlePool.length > 0 ? "corruption-glow armed" : "corruption-glow"} pointerEvents="none">
              <polygon points={hexCellPoints(cx, cy, s, 1.14)} fill={battlePool.length > 0 ? "rgba(120,8,30,0.34)" : "rgba(110,6,26,0.16)"} stroke="none" />
              <polygon points={pts} fill={battlePool.length > 0 ? "rgba(165,18,60,0.38)" : "rgba(148,14,52,0.20)"} stroke="none" />
              {/* The mist climbs (Nigel, 2026-10-14): traces of deep red
                  drifting up off the corruption — the glow made taller.
                  Two soft wisps per hex, staggered by tile so the wilds
                  never breathe in lockstep. CSS-risen, no filters. */}
              <ellipse className="mist-wisp" cx={cx - s * 0.18} cy={cy - s * 0.30} rx={s * 0.30} ry={s * 0.55}
                fill={battlePool.length > 0 ? "rgba(178,24,44,0.16)" : "rgba(178,24,44,0.09)"} stroke="none"
                style={{ animationDelay: `${(t.id % 5) * 0.9}s` }} />
              <ellipse className="mist-wisp" cx={cx + s * 0.22} cy={cy - s * 0.42} rx={s * 0.22} ry={s * 0.44}
                fill={battlePool.length > 0 ? "rgba(160,20,70,0.14)" : "rgba(160,20,70,0.07)"} stroke="none"
                style={{ animationDelay: `${(t.id % 7) * 0.7 + 1.3}s` }} />
            </g>
          )}
          {/* Curse HP on cursed tiles */}
          {t.cursed && (() => {
            const ring = Math.max(Math.abs(t.q), Math.abs(t.r), Math.abs(t.q + t.r));
            const maxHp = (t as any).curseMaxHp ?? (4 + ring * 6);
            const hp = (t as any).curseHp ?? maxHp;
            const thorns = Math.pow(2, Math.max(0, ring - 1));
            return (
              <g>
              <text x={cx} y={cy + 8 / zoom} textAnchor="middle" fontSize={8 / zoom}
                fill="#ff6666" opacity="0.95" fontWeight="bold">
                ♥ {hp}
              </text>
              {thorns > 1 && (
                <text x={cx} y={cy + 18 / zoom} textAnchor="middle" fontSize={7 / zoom}
                  fill="#ffaa00" opacity="0.9" fontWeight="bold">
                  🌵 {thorns}
                </text>
              )}
              </g>
            );
          })()}
          {/* Burning tile: Fire III art */}
          {t.spark === 2 && fireAspectImg && (
            <image href={fireAspectImg} x={cx - 40 / zoom} y={cy - 50 / zoom} width={80 / zoom} height={80 / zoom}
              preserveAspectRatio="xMidYMid meet" opacity="0.7" pointerEvents="none" />
          )}
          {/* Spark: fire aspect waiting to be claimed */}
          {t.spark === 1 && (
            <g onClick={(e) => { e.stopPropagation(); if (bandJustClosed()) return; handleSparkClick(t.id); }} style={{ cursor: "pointer" }}>
              {fireAspectImg ? (
                <image href={fireAspectImg} x={cx - 30 / zoom} y={cy - 40 / zoom} width={60 / zoom} height={60 / zoom}
                  preserveAspectRatio="xMidYMid meet" opacity="0.95" />
              ) : (
                <text x={cx} y={cy - 10 / zoom} textAnchor="middle" fontSize={24 / zoom} fill="#ff6600" opacity="0.95">🔥</text>
              )}
              <text x={cx} y={cy + 25 / zoom} textAnchor="middle" fontSize={8 / zoom}
                fill="#ffaa00" opacity="0.9" fontWeight="bold">
                SPARK — tap to claim
              </text>
            </g>
          )}
          {t.element && t.element !== "neutral" && (
            <polygon points={pts} fill={
              t.element === "tide" ? "rgba(74,144,217,0.15)" :
              t.element === "sky" ? "rgba(135,206,235,0.15)" :
              t.element === "stone" ? "rgba(139,115,85,0.15)" :
              t.element === "root" ? "rgba(107,142,35,0.15)" :
              t.element === "fire" ? "rgba(255,68,68,0.15)" : "rgba(0,0,0,0)"
            } pointerEvents="none" />
          )}
          {/* The hit target is NOT here — it lives in the hit layer
              below, in screen coordinates between the two camera
              groups, so its points attribute keeps the exact numbers
              it always carried (see the camera note at the top of
              renderGrid). Awoken render in the entity layer. */}
        </g>
      );
    });
    // THE HIT LAYER (screen space, between the camera groups — the
    // tile art beneath it, buildings and figures above it, exactly
    // the stacking the hit polygons had inside the tile group):
    // the fitted cell of each hex, invisible itself, carrying the
    // tap. Its points are solved from tileCenterScreen with the
    // screen hex size, byte-for-byte the geometry the pointer
    // handlers and the drives have always read.
    const hitLayer = (
      <g key="tile-hits">
        {sortedTiles.map((t) => {
          const c = tileCenterScreen(t, pan, zoom);
          const hitPts = hexCellPoints(c.cx, c.cy, HEX_BASE_SIZE * zoom);
          const lift = t.cursed ? 0 : -5; // match the terrain layer's lift
          return (
            <g key={t.id} transform={`translate(0,${lift})`}>
              <polygon points={hitPts}
                fill="rgba(0,0,0,0)"
                stroke="transparent"
                style={{
                  cursor: (battlePool.length > 0 || attackTargeting) ? "pointer" : "default",
                  filter: auraTiles.has(t.id) ? "drop-shadow(0 0 6px rgba(100,255,100,0.6))" : undefined,
                  pointerEvents: "all"
                }}
                onMouseEnter={() => setHoverHexId(t.id)}
                onMouseLeave={() => setHoverHexId(h => (h === t.id ? null : h))}
                onClick={(e) => {
                  // A tile tap is not an empty-map tap: stop the click here,
                  // or it bubbles into the map's dismiss handler and erases
                  // the confirm/targeting this very tap just raised.
                  e.stopPropagation();
                  handleHexTap(t);
                }} />
            </g>
          );
        })}
      </g>
    );
    // THE VOID AT THE EDGE (the Building System, 2026-10-19):
    // empty hexes beside the land are the founding ground — a
    // faint dashed cell on the nothing, and a tap opens the
    // work. The map is the UI: no panel decides where land may
    // be born; the edge itself offers.
    const ghostLayer = (() => {
      const have = new Set(tiles.map(t => `${t.q},${t.r}`));
      const seen = new Set<string>();
      const ghosts: { q: number; r: number }[] = [];
      const DIRS6 = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
      for (const t of tiles) {
        if ((t.z ?? 0) > 0) continue;
        for (const [dq, dr] of DIRS6) {
          const q = t.q + dq, r = t.r + dr, key = `${q},${r}`;
          if (have.has(key) || seen.has(key)) continue;
          seen.add(key);
          ghosts.push({ q, r });
        }
      }
      return (
        <g key="build-ghosts">
          {ghosts.map(g => {
            const c = tilePos({ q: g.q, r: g.r, height: 1 } as any);
            return (
              <polygon key={`ghost-${g.q},${g.r}`} points={hexCellPoints(c.cx, c.cy, size, 0.94)}
                fill="rgba(212,175,106,0.05)" stroke="rgba(212,175,106,0.4)" strokeWidth={1.1 / zoom} strokeDasharray={`${4 / zoom} ${4 / zoom}`} strokeLinejoin="round"
                style={{ cursor: "pointer" }}
                onClick={(e) => { e.stopPropagation(); openBuildGhost(g.q, g.r); }}>
                <title>Unmade ground — found a new hex here</title>
              </polygon>
            );
          })}
        </g>
      );
    })();
    // Selection layers (fix list #13, refined) — drawn as the LAST
    // layers of the map, above terrain art and creatures, below the
    // modal UI, all from the fitted cell geometry:
    //  · HOVER (desktop): a soft gold glow on the hex under the cursor
    //    while a targeting flow is armed — the hex you are about to
    //    select.
    //  · MIST (touch, and the building flow's pending tile): a pale,
    //    translucent wash — this hex is about to be acted on, not yet
    //    committed; the confirm bar (or the builder popup) decides.
    //  · SHINE (committed): the gold double outline + chevron on the
    //    hex the tap chose, while its action resolves.
    const flowArmed = battlePool.length > 0 || attackTargeting || moveTargeting || !!selectedBuilding;
    const mistTileId = hexConfirm?.tileId ?? pendingTile;
    const cellLayer = (tileId: number | null, kind: "hover" | "mist" | "shine") => {
      if (tileId === null) return null;
      const tile = tiles.find(t => t.id === tileId);
      if (!tile) return null;
      const { cx, cy } = tilePos(tile);
      const s = size;
      const lift = tile.cursed ? 0 : -5; // match the terrain layer's lift
      if (kind === "hover") {
        return (
          <g key="target-hex-hover" transform={`translate(0,${lift / zoom})`} pointerEvents="none">
            <polygon points={hexCellPoints(cx, cy, s)} fill="rgba(255,215,0,0.07)" stroke="rgba(255,215,0,0.55)" strokeWidth={1.5 / zoom} strokeLinejoin="round" />
          </g>
        );
      }
      if (kind === "mist") {
        return (
          <g key="target-hex-mist" className="target-hex-mist" transform={`translate(0,${lift / zoom})`} pointerEvents="none">
            <polygon points={hexCellPoints(cx, cy, s)} fill="rgba(255,244,214,0.20)" stroke="rgba(255,236,180,0.85)" strokeWidth={2 / zoom} strokeDasharray={`${5 / zoom} ${4 / zoom}`} strokeLinejoin="round" />
            <polygon points={hexCellPoints(cx, cy, s, 0.82)} fill="rgba(255,248,228,0.12)" stroke="none" />
          </g>
        );
      }
      return (
        <g key="target-hex-marker" className="target-hex-marker" transform={`translate(0,${lift / zoom})`} pointerEvents="none">
          <polygon className="target-hex-pulse" points={hexCellPoints(cx, cy, s, 1.05)} fill="rgba(255,215,0,0.10)" stroke="#ffd700" strokeWidth={3 / zoom} strokeLinejoin="round" />
          <polygon points={hexCellPoints(cx, cy, s, 0.93)} fill="none" stroke="#ffedb0" strokeWidth={1.5 / zoom} strokeLinejoin="round" />
          <g>
            <animateTransform attributeName="transform" type="translate" values={`0 0; 0 ${3 / zoom}; 0 0`} dur="1.6s" repeatCount="indefinite" />
            <polygon points={`${cx - 7 / zoom},${cy - s * 1.14} ${cx + 7 / zoom},${cy - s * 1.14} ${cx},${cy - s * 0.82}`} fill="#ffd700" stroke="#7a5c00" strokeWidth={0.75 / zoom} strokeLinejoin="round" />
          </g>
        </g>
      );
    };
    const hoverLayer = !touchMode && flowArmed && hoverHexId !== null && hoverHexId !== mistTileId && hoverHexId !== targetHexId
      ? cellLayer(hoverHexId, "hover") : null;
    const mistLayer = cellLayer(mistTileId, "mist");
    const targetMarker = cellLayer(targetHexId, "shine");
    // Hex walls: a raised segment drawn along the wall's edge (a dark
    // outer face offset outward, a paler top), paling as its HP falls.
    // In wall-raising mode the selected Awoken's hex shows its six
    // edges — a gold guide line plus a FAT invisible hit-strip along
    // each free edge, so one tap (finger or mouse) picks exactly one
    // side. Edges already walled show grey and take no tap.
    // The Written Light standing on the land (the Grimoire):
    // wards burn along their edge with their glyph at its heart,
    // runes sleep on their hex's floor. A Trees pales as it is
    // spent, like a wall. In casting mode, the anchor hex's free
    // edges glow violet and take the tap that raises the ward.
    const workingsLayer = (
      <g key="workings">
        {workings.map((w) => {
          const img = grimGlyphImg(w.spellKey);
          const filter = `${GRIM_HUE_FILTERS[w.hue] ?? "none"} drop-shadow(0 0 ${5 / zoom}px ${GRIM_HUE_GLOWS[w.hue] ?? "#ffd98a"})`;
          const spName = grim?.spells.find((sp) => sp.key === w.spellKey)?.name ?? w.spellKey;
          const title = `${spName} — ${w.kind}${w.engine === "trees" ? ` · ❤${w.hp}` : ""}${w.engine === "seal" ? ` · ❤${w.hp} · ${Math.max(0, (w.nums.stops ?? 3) - w.stops)} stops left` : ""}${w.engine === "lattice" ? ` · ❤${w.hp}` : ""}${w.engine === "blade" ? ` · ${w.charges} springs left` : ""}${w.pour > 0 ? ` · ${w.pour} attunement slot${w.pour === 1 ? "" : "s"} carried` : ""}`;
          if (w.kind === "ward" && w.q != null && w.r != null && w.dir != null) {
            const wt = tiles.find((tt) => tt.q === w.q && tt.r === w.r);
            const c = wt ? tilePos(wt) : (() => { const { px, py } = isoOffset(w.q, w.r, size); return { cx: originX + px, cy: originY + py }; })();
            const verts = hexCellVertices(c.cx, c.cy, size);
            const [x1, y1] = verts[w.dir];
            const [x2, y2] = verts[(w.dir + 1) % 6];
            const frac = w.engine === "trees" ? Math.max(0, Math.min(1, w.hp / Math.max(1, w.maxHp || (w.nums.hp ?? 8)))) : w.engine === "seal" ? Math.max(0, Math.min(1, w.hp / Math.max(1, w.maxHp || 6))) : 1;
            return (
              <g key={w.id} opacity={(0.35 + 0.65 * frac).toFixed(2)}>
                <title>{title}</title>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(183,166,255,0.30)" strokeWidth={size * 0.13} strokeLinecap="round" />
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={GRIM_HUE_GLOWS[w.hue] ?? "#ffd98a"} strokeWidth={size * 0.045} strokeLinecap="round" opacity={0.85} />
                {img && <image href={img} x={(x1 + x2) / 2 - size * 0.21} y={(y1 + y2) / 2 - size * 0.21} width={size * 0.42} height={size * 0.42} style={{ filter }} pointerEvents="none" />}
              </g>
            );
          }
          const t = w.tileId != null ? tiles.find((tt) => tt.id === w.tileId) : null;
          if (!t) return null;
          const { cx, cy } = tilePos(t);
          if (w.engine === "springleaf") {
            // THE GROVE (Homeland Casting): the mother drawn
            // as her living glow — the radius the server
            // reckons her mending over — with each rooted
            // sapling a smaller light of its own. Nothing is
            // drawn the server did not plant.
            const gNums = (w.nums ?? {}) as any;
            const radiusPx = size * (0.95 + Math.max(1, gNums.radiusHexes ?? 1) * 1.45);
            const saps: { tileId: number; rooted?: boolean }[] = Array.isArray(gNums.saplings) ? gNums.saplings : [];
            return (
              <g key={w.id} opacity={0.92}>
                <title>{`${title} — a living grove; the company standing in her glow mends.`}</title>
                <circle cx={cx} cy={cy} r={radiusPx} fill="rgba(125,208,105,0.10)" stroke="rgba(125,208,105,0.35)" strokeWidth={1 / zoom} pointerEvents="none" />
                {saps.filter(s => s.rooted).map((s, i) => {
                  const st = tiles.find((tt) => tt.id === s.tileId);
                  if (!st) return null;
                  const sp2 = tilePos(st);
                  return <circle key={i} cx={sp2.cx} cy={sp2.cy} r={radiusPx / 2} fill="rgba(125,208,105,0.08)" stroke="rgba(125,208,105,0.25)" strokeWidth={0.7 / zoom} pointerEvents="none" />;
                })}
                {img
                  ? <image href={img} x={cx - size * 0.34} y={cy - size * 0.34} width={size * 0.68} height={size * 0.68} style={{ filter }} pointerEvents="none" />
                  : <text x={cx} y={cy + size * 0.22} textAnchor="middle" fontSize={size * 0.62} pointerEvents="none">🌿</text>}
              </g>
            );
          }
          return (
            <g key={w.id} opacity={0.92}>
              <title>{title}</title>
              {img && <image href={img} x={cx - size * 0.30} y={cy - size * 0.30} width={size * 0.60} height={size * 0.60} style={{ filter }} pointerEvents="none" />}
            </g>
          );
        })}
      </g>
    );
    const castEdgeLayer = castMode && castSpell?.kind === "ward" && castAnchor !== null ? (() => {
      const t = tiles.find((tt) => tt.id === castAnchor);
      if (!t) return null;
      const { cx, cy } = tilePos(t);
      const verts = hexCellVertices(cx, cy, size);
      return (
        <g key="cast-edges">
          {verts.map((v, d) => {
            const n = verts[(d + 1) % 6];
            const taken = walls.some((w) => w.edgeKey === canonicalWallEdgeKey(t.q, t.r, d))
              || workings.some((w) => w.kind === "ward" && w.edgeKey === canonicalWallEdgeKey(t.q, t.r, d));
            return (
              <g key={d}>
                <line x1={v[0]} y1={v[1]} x2={n[0]} y2={n[1]} stroke={taken ? "rgba(140,140,140,0.35)" : "rgba(183,166,255,0.8)"} strokeWidth={3 / zoom} strokeDasharray={`${6 / zoom} ${4 / zoom}`} pointerEvents="none" />
                {!taken && (
                  <line x1={v[0]} y1={v[1]} x2={n[0]} y2={n[1]} stroke="rgba(183,166,255,0.03)" strokeWidth={26 / zoom} strokeLinecap="round" style={{ cursor: "pointer" }}
                    onClick={(e) => { e.stopPropagation(); void doCastMap({ tileId: t.id, dir: d }); }} />
                )}
              </g>
            );
          })}
        </g>
      );
    })() : null;
    const wallLayer = (
      <g key="walls">
        {walls.map(w => {
          const wt = tiles.find(tt => tt.q === w.q && tt.r === w.r);
          const c = wt ? tilePos(wt) : (() => { const { px, py } = isoOffset(w.q, w.r, size); return { cx: originX + px, cy: originY + py }; })();
          const verts = hexCellVertices(c.cx, c.cy, size);
          const [x1, y1] = verts[w.dir];
          const [x2, y2] = verts[(w.dir + 1) % 6];
          const mx = (x1 + x2) / 2 - c.cx, my = (y1 + y2) / 2 - c.cy;
          const mlen = Math.hypot(mx, my) || 1;
          const ox = (mx / mlen) * size * 0.07, oy = (my / mlen) * size * 0.07;
          const frac = w.maxHp > 0 ? w.hp / w.maxHp : 0;
          // Each work draws in its own grammar (War-Ground, 2026-10-15):
          // walls timber, wards violet light, thorns green teeth,
          // runes amber dashes with a sleeping diamond at the middle.
          if (w.kind === "thorns") {
            const seg = 7; const pts: string[] = [];
            for (let i = 0; i <= seg; i++) {
              const t = i / seg;
              const bx = x1 + (x2 - x1) * t, by = y1 + (y2 - y1) * t;
              const off = i % 2 === 0 ? 0 : size * 0.055;
              pts.push(`${(bx + (mx / mlen) * off).toFixed(1)},${(by + (my / mlen) * off).toFixed(1)}`);
            }
            return (
              <g key={w.edgeKey}>
                <polyline points={pts.join(" ")} fill="none" stroke="#69a84f" strokeWidth={size * 0.045} strokeLinejoin="round" />
              </g>
            );
          }
          if (w.kind === "wall") {
            // Nigel's pieces (2026-10-16): the drawn segment for
            // this edge, seated corner-to-corner by similarity —
            // one wall of a hex, built at a time, as he layered
            // them. Which set a wall wears was chosen when it
            // was built, edge by edge (Nigel, 2026-10-16):
            // stone, or spires. Wear shows as fading, the
            // drawing intact.
            const piece = WALL_STYLES[w.style === "spire" ? "spire" : "stone"][w.dir];
            const pdx = piece.x2 - piece.x1, pdy = piece.y2 - piece.y1;
            const mdx = x2 - x1, mdy = y2 - y1;
            const sc = Math.hypot(mdx, mdy) / Math.max(1, Math.hypot(pdx, pdy));
            const rot = (Math.atan2(mdy, mdx) - Math.atan2(pdy, pdx)) * 180 / Math.PI;
            return (
              <g key={w.edgeKey} transform={`translate(${x1} ${y1}) rotate(${rot.toFixed(2)}) scale(${sc.toFixed(4)}) translate(${(-piece.x1).toFixed(1)} ${(-piece.y1).toFixed(1)})`} opacity={(0.3 + 0.7 * frac).toFixed(2)}>
                <image href={piece.src} x={0} y={0} width={piece.w} height={piece.h} />
              </g>
            );
          }
          if (w.kind === "ward") {
            return (
              <g key={w.edgeKey}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(150,130,255,0.35)" strokeWidth={size * 0.12} strokeLinecap="round" />
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={frac > 0.5 ? "#b7a6ff" : frac > 0.25 ? "#8d7bd8" : "#5d4d99"} strokeWidth={size * 0.04} strokeLinecap="round" />
              </g>
            );
          }
          if (w.kind === "rune") {
            const cxm = (x1 + x2) / 2, cym = (y1 + y2) / 2, dd = size * 0.07;
            return (
              <g key={w.edgeKey}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#e8a13c" strokeWidth={size * 0.035} strokeDasharray={`${2 / zoom} ${6 / zoom}`} strokeLinecap="round" />
                <polygon points={`${cxm},${cym - dd} ${cxm + dd},${cym} ${cxm},${cym + dd} ${cxm - dd},${cym}`} fill="#e8a13c" opacity={0.9} />
              </g>
            );
          }
          return (
            <g key={w.edgeKey}>
              <line x1={x1 + ox} y1={y1 + oy} x2={x2 + ox} y2={y2 + oy} stroke="#4a3826" strokeWidth={size * 0.11} strokeLinecap="round" />
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={frac > 0.5 ? "#d9c68f" : frac > 0.25 ? "#b39b5e" : "#7d5f30"} strokeWidth={size * 0.075} strokeLinecap="round" />
            </g>
          );
        })}
        {wallTargeting && selectedAwoken !== null && (() => {
          const p = placements.find(pp => pp.awakenedId === selectedAwoken);
          const t = p ? tiles.find(tt => tt.id === p.tileId) : null;
          if (!t || t.cursed) return null;
          const { cx, cy } = tilePos(t);
          const verts = hexCellVertices(cx, cy, size);
          return (
            <g>
              {verts.map((v, d) => {
                const n = verts[(d + 1) % 6];
                const taken = walls.some(w => w.edgeKey === canonicalWallEdgeKey(t.q, t.r, d));
                return (
                  <g key={d}>
                    <line x1={v[0]} y1={v[1]} x2={n[0]} y2={n[1]} stroke={taken ? "rgba(140,140,140,0.35)" : "rgba(255,215,0,0.6)"} strokeWidth={3 / zoom} strokeDasharray={`${6 / zoom} ${4 / zoom}`} pointerEvents="none" />
                    {!taken && (
                      <line x1={v[0]} y1={v[1]} x2={n[0]} y2={n[1]} stroke="rgba(255,215,0,0.02)" strokeWidth={24 / zoom} strokeLinecap="round" style={{ cursor: "pointer" }}
                        onClick={(e) => { e.stopPropagation(); handlePlaceWall(t.id, d); }} />
                    )}
                  </g>
                );
              })}
            </g>
          );
        })()}
      </g>
    );
    // War-Grounds guide (Nigel, 2026-10-16): while the dock stands
    // open, every hex where a work may be laid — an Awoken standing,
    // the ground uncursed — wears a dotted outline on the map, and
    // tapping one moves the dock to that hex. The hex the dock
    // currently holds is ringed solid.
    const wgGuideLayer = wgTileId !== null ? (
      <g key="wg-guide">
        {tiles.filter(t => !t.cursed && placements.some(p => p.tileId === t.id)).map(t => {
          const { cx, cy } = tilePos(t);
          const pts = hexCellVertices(cx, cy, size).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
          const isOpen = t.id === wgTileId;
          return (
            <polygon key={t.id} points={pts}
              fill={isOpen ? "rgba(255,215,0,0.10)" : "rgba(255,215,0,0.03)"}
              stroke={isOpen ? "#ffd700" : "rgba(255,215,0,0.75)"}
              strokeWidth={(isOpen ? 2.5 : 2) / zoom}
              strokeDasharray={isOpen ? undefined : `${1 / zoom} ${6 / zoom}`}
              strokeLinecap="round"
              style={{ cursor: "pointer" }}
              onClick={(e) => { e.stopPropagation(); if (t.id !== wgTileId) setWgArmedWork(null); setWgTileId(t.id); }}
            />
          );
        })}
      </g>
    ) : null;
    // Attunement labels (Nigel, 2026-10-17): while the
    // War-Grounds stand open, every hex its company is attuning
    // wears a label above it — the dominant element's glyph and
    // the net points of that element influencing its attunement,
    // served by the same net press that pours the bank.
    const wgAttuneLayer = wgTileId !== null ? (
      <g key="wg-attune" pointerEvents="none">
        {tiles.filter(t => !t.cursed && ((t as any).pressPts ?? 0) > 0).map(t => {
          const { cx, cy } = tilePos(t);
          const el = (t as any).pressEl as string;
          const pts = (t as any).pressPts as number;
          const col = elementPalette[el as keyof typeof elementPalette] ?? "#d4af6a";
          return (
            <g key={t.id}>
              <rect x={cx - size * 0.62} y={cy - size * 1.36} width={size * 1.24} height={size * 0.46} rx={size * 0.23} fill="rgba(8,6,10,0.88)" stroke={col} strokeWidth={1.4 / zoom} />
              <g transform={`translate(${cx - size * 0.55}, ${cy - size * 1.215})`}><ElementGlyph element={el as GlyphElement} color={col} width={size * 0.42} height={size * 0.168} /></g>
              <text x={cx + size * 0.24} y={cy - size * 1.02} textAnchor="middle" fontSize={size * 0.30} fill="#f0e6cc">{pts}</text>
            </g>
          );
        })}
      </g>
    ) : null;
    // THE SEED-CALM ON THE MAP (Nigel, 2026-10-17): every hex
    // a held seed's calm covers wears a soft golden ring —
    // the second home's light lying on the land — and a
    // cursed hex under it names the level the curse is now
    // reckoned at: tamable.
    const calmLayer = (
      <g key="seed-calm" pointerEvents="none">
        {tiles.filter(t => t.calmLevel != null).map(t => {
          const { cx, cy } = tilePos(t);
          const pts = hexCellPoints(cx, cy, size, 0.94);
          return (
            <g key={t.id}>
              <polygon points={pts} fill="rgba(240,214,140,0.07)" stroke="#f0d68c" strokeWidth={1.6 / zoom} strokeDasharray={`${5 / zoom} ${4 / zoom}`} opacity={0.9} />
              {t.cursed ? (
                <text x={cx} y={cy + size * 1.28} textAnchor="middle" fontSize={size * 0.30} fill="#f0d68c">curse Lv {t.calmLevel}</text>
              ) : null}
            </g>
          );
        })}
      </g>
    );
    // THE COLUMNS ON THE MAP (2026-10-17): a marching column is
    // only a traced dotted line from outside the map to its
    // target, with the warning mark at the threatened hex; an
    // arrived column's force STANDS on the cursed hexes beside
    // the target, lettered by kind.
    const axialPos = (q: number, r: number) => {
      const { px, py } = isoOffset(q, r, size);
      return { cx: originX + px, cy: originY + py };
    };
    const columnsLayer = (
      <g key="columns" pointerEvents="none">
        {(incursionsQ.data?.columns ?? []).map(col => {
          const target = tiles.find(t => t.id === col.targetTileId);
          if (!target) return null;
          const tp = tilePos(target);
          if (col.state === "marching") {
            const op = axialPos(col.originQ, col.originR);
            // THE COUNTDOWN ON THE LINE (Nigel, 2026-10-19): the
            // server has always sent arrivesAt; the face never
            // read it. The remaining march, riding the map's own
            // 125ms clock, lettered at the line's midpoint —
            // hours while the road is long, mm:ss as it closes.
            const remainMs = col.arrivesAt - marchNow;
            const remainS = Math.max(0, Math.ceil(remainMs / 1000));
            const eta = remainMs <= 0 ? "at the gates"
              : remainS >= 3600 ? `${Math.floor(remainS / 3600)}h ${String(Math.floor((remainS % 3600) / 60)).padStart(2, "0")}m`
              : `${Math.floor(remainS / 60)}:${String(remainS % 60).padStart(2, "0")}`;
            const midX = (op.cx + tp.cx) / 2, midY = (op.cy + tp.cy) / 2;
            return (
              <g key={col.id}>
                <line x1={op.cx} y1={op.cy} x2={tp.cx} y2={tp.cy} stroke="#b04df0" strokeWidth={2.5 / zoom} strokeDasharray={`${1 / zoom} ${8 / zoom}`} strokeLinecap="round" opacity={0.85} />
                <circle cx={tp.cx} cy={tp.cy} r={size * 0.95} fill="none" stroke="#ff5340" strokeWidth={2 / zoom} opacity={0.8} />
                <text x={tp.cx} y={tp.cy - size * 1.12} textAnchor="middle" fontSize={size * 0.42}>⚠</text>
                <text x={midX} y={midY - size * 0.16} textAnchor="middle" fontSize={size * 0.34} fontWeight={700} fill="#ffb4a6"
                  style={{ paintOrder: "stroke", stroke: "rgba(12,4,18,0.9)", strokeWidth: 3.5 / zoom, letterSpacing: "0.04em" }}>{eta}</text>
              </g>
            );
          }
          const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
          const cursedAdj = dirs
            .map(([dq, dr]) => tiles.find(t => t.q === target.q + dq && t.r === target.r + dr))
            .filter(t => t && t.cursed) as any[];
          const kinds = col.roster.flatMap(r => Array(r.count).fill(r.kind)) as string[];
          const marks = kinds.slice(0, 8).map((k, i) => {
            const host = cursedAdj.length ? cursedAdj[i % cursedAdj.length] : target;
            const hp = tilePos(host);
            return { x: hp.cx + (i % 3 - 1) * size * 0.34, y: hp.cy + (Math.floor(i / 3) % 2 ? size * 0.3 : -size * 0.1), k };
          });
          return (
            <g key={col.id}>
              <circle cx={tp.cx} cy={tp.cy} r={size * 1.0} fill="rgba(176,77,240,0.10)" stroke="#ff5340" strokeWidth={2.5 / zoom} />
              {marks.map((m, i) => (
                <g key={i}>
                  <circle cx={m.x} cy={m.y} r={size * 0.30} fill="#160b20" stroke="#b04df0" strokeWidth={1.6 / zoom} />
                  <text x={m.x} y={m.y + size * 0.13} textAnchor="middle" fontSize={size * 0.32} fill="#e8c8ff">{m.k === "fray" ? "F" : m.k === "unraveler" ? "U" : m.k === "tangle" ? "T" : "H"}</text>
                </g>
              ))}
            </g>
          );
        })}
      </g>
    );
    // THE SEEDS ON THE MAP (the Columns, 2026-10-17): a fallen
    // seed burns gold on its hex; a held seed wears its ring
    // and its growth; a corrupted seed is a skull on cursed
    // ground — the dark's bastion, waiting for a siege.
    const seedLayer = (
      <g key="seeds" pointerEvents="none">
        {(seedsQ.data?.seeds ?? []).map(sd => {
          const t = tiles.find(t => t.id === sd.tileId);
          if (!t) return null;
          const { cx, cy } = tilePos(t);
          if (sd.state === "first") {
            // THE FIRST SEED (Nigel via Wake, 2026-10-17): the tiny
            // meteor of the ceremony rain, sparkling on the center
            // cursed hex of a brand-new map — his own asset, seated
            // as the seed's face until the hold is done.
            return (
              <g key={sd.id}>
                <circle cx={cx} cy={cy - size * 0.5} r={size * 0.55} fill="rgba(232,182,76,0.14)" stroke="#e8b64c" strokeWidth={1.2 / zoom} strokeDasharray={`${3 / zoom} ${4 / zoom}`} />
                <image href={meteorGif} x={cx - size * 0.45} y={cy - size * 1.1} width={size * 0.9} height={size * 0.9} />
                {sd.level > 1 && <text x={cx} y={cy - size * 1.2} textAnchor="middle" fontSize={size * 0.25} fill="#ffd700">Lv {sd.level}</text>}
              </g>
            );
          }
          if (sd.state === "corrupted") {
            return (<g key={sd.id}><text x={cx} y={cy - size * 0.4} textAnchor="middle" fontSize={size * 0.52}>💀</text></g>);
          }
          return (
            <g key={sd.id}>
              <circle cx={cx} cy={cy - size * 0.6} r={size * 0.34} fill="rgba(20,14,4,0.85)" stroke={sd.state === "held" ? "#ffd700" : "#e8b64c"} strokeWidth={(sd.state === "held" ? 2.4 : 1.4) / zoom} />
              <text x={cx} y={cy - size * 0.47} textAnchor="middle" fontSize={size * 0.36}>⭐</text>
              {sd.state === "held" && <text x={cx} y={cy - size * 1.08} textAnchor="middle" fontSize={size * 0.25} fill="#ffd700">Lv {sd.level} · held {sd.defenses}/3</text>}
            </g>
          );
        })}
      </g>
    );
    // Patrol guide: while a road is being laid, the draft road is
    // drawn dotted over the map, its waypoints numbered in order.
    const patrolGuideLayer = patrolSettingFor !== null ? (() => {
      const home = tiles.find(t => t.id === placements.find(p => p.awakenedId === patrolSettingFor)?.tileId);
      if (!home) return null;
      const pts = [home, ...patrolDraft.map(id => tiles.find(t => t.id === id)).filter(Boolean) as TerritoryTile[]].map(t => tilePos(t));
      return (
        <g key="patrol-guide">
          {pts.length > 1 && (
            <polyline points={pts.map(c => `${c.cx},${c.cy}`).join(" ")} fill="none"
              stroke="rgba(255,215,0,0.85)" strokeWidth={2 / zoom} strokeDasharray={`${1 / zoom} ${6 / zoom}`} strokeLinecap="round" />
          )}
          {pts.slice(1).map((c, i) => (
            <g key={i}>
              <circle cx={c.cx} cy={c.cy} r={11 / zoom} fill="rgba(20,20,35,0.92)" stroke="#ffd700" strokeWidth={1.5 / zoom} />
              <text x={c.cx} y={c.cy + 4 / zoom} textAnchor="middle" fontSize={11 / zoom} fill="#ffd700" fontWeight={700}>{i + 1}</text>
            </g>
          ))}
        </g>
      );
    })() : null;
    // The line, while the right hand draws it (the orders
    // law; the blips ruled by Nigel, 2026-10-23): the line
    // itself, and on it one BLIP for each Awokin the order
    // targets — spread evenly with one at each end, so the
    // hand sees where every figure will stand before the
    // release speaks. A lone Awokin's blip sits at the far
    // end, the point dragged to.
    // The drag state is screen pixels; the layer paints in the
    // land, so both ends convert through the camera's inverse —
    // an affine map, so the blips' even spread is untouched.
    const lineLand = lineDrag ? { x0: landX(lineDrag.x0), y0: landY(lineDrag.y0), x1: landX(lineDrag.x1), y1: landY(lineDrag.y1) } : null;
    const lineBlips = (() => {
      if (!lineLand) return [] as { x: number; y: number }[];
      const n = pendingMarch?.ids.length ?? 1;
      if (n <= 1) return [{ x: lineLand.x1, y: lineLand.y1 }];
      return Array.from({ length: n }, (_, i) => ({
        x: lineLand.x0 + (lineLand.x1 - lineLand.x0) * (i / (n - 1)),
        y: lineLand.y0 + (lineLand.y1 - lineLand.y0) * (i / (n - 1)),
      }));
    })();
    const lineLayer = lineLand ? (
      <g key="march-line" pointerEvents="none">
        <line x1={lineLand.x0} y1={lineLand.y0} x2={lineLand.x1} y2={lineLand.y1}
          stroke="rgba(255,215,0,0.9)" strokeWidth={2 / zoom} strokeDasharray={`${6 / zoom} ${4 / zoom}`} strokeLinecap="round" />
        {lineBlips.map((bl, i) => (
          <circle key={`blip-${i}`} cx={bl.x} cy={bl.y} r={5 / zoom} fill="#ffd700" stroke="rgba(20,16,4,0.85)" strokeWidth={1.2 / zoom} />
        ))}
      </g>
    ) : null;
    // The drag band itself, while the hand is down.
    const bandLayer = band ? (
      <rect key="drag-band"
        x={landX(Math.min(band.x0, band.x1))} y={landY(Math.min(band.y0, band.y1))}
        width={Math.abs(band.x1 - band.x0) / zoom} height={Math.abs(band.y1 - band.y0) / zoom}
        fill="rgba(255,215,0,0.10)" stroke="#ffd700" strokeWidth={1.2 / zoom} strokeDasharray={`${5 / zoom} ${4 / zoom}`} pointerEvents="none" />
    ) : null;
    // THE TENDER HIMSELF (Nigel, 2026-10-19): drawn last, front-most
    // — his class figure at his gliding place, a soft shadow under
    // his feet, and a gold ring lying on the hex the server holds
    // as his stand. The figure's pose is the Table's own language
    // (tenderArt: direction by stride, west mirrored about his
    // centre), sized to stand a head above the company.
    const tenderLayer = (() => {
      if (!tenderStand || !tenderFig) return null;
      // The Tender is NOT land: his figure rides the glide engine
      // in SCREEN coordinates and is drawn outside the camera
      // groups (see the return), so this layer keeps the screen
      // measures — the screen hex size and the screen tile centre
      // — under the names the rest of renderGrid now reads as
      // land measures.
      const size = HEX_BASE_SIZE * zoom;
      const tilePos = (t: any) => tileCenterScreen(t, pan, zoom);
      const art = TENDER_CLASSES[tenderStand.classKey as TenderClassId];
      if (!art) return null;
      const anchorTile = tiles.find(t => t.id === (tenderAnchorRef.current ?? tenderStand.tileId));
      const anchorC = anchorTile ? tilePos(anchorTile) : null;
      // A cast in flight — a summon or a working — outranks
      // the stride: the Tender plays tenderArt's casting
      // beats (the Proving Ground's cast(), CAST_BEATS and
      // all) in the facing he cast in, for the gesture's
      // 950 ms.
      const castPose = tenderCastAt ? tenderCastPose(art, tenderCastDirRef.current, Date.now() - tenderCastAt) : null;
      const pose = castPose ?? tenderPose(art, tenderFig.dir, tenderFig.walking, tenderFig.step);
      const h = 62 * zoom;
      // THE JUMP on the face: the figure rises by the stride's
      // measured height; the Sage's backflip turns the sprite
      // itself (the game's sheets hold no flip frames — the
      // Ground's frames are its own; the rotation is honest
      // motion, not a borrowed drawing).
      const jh = tenderFig.jh ?? 0;
      const flipDeg = tenderFig.flipU != null && tenderFig.flipU > 0 && tenderFig.flipU < 1 ? tenderFig.flipU * 360 : 0;
      const img = (
        <image href={pose.src} x={tenderFig.x - h / 2} y={tenderFig.y + 4 - h - jh} width={h} height={h}
          preserveAspectRatio="xMidYMax meet" opacity={tenderStand.down ? 0.5 : 1} />
      );
      const imgTurned = flipDeg
        ? <g transform={`rotate(${flipDeg} ${tenderFig.x} ${tenderFig.y - h / 2 - jh})`}>{img}</g>
        : img;
      // PHASE D: his body is real — the pool rides above his
      // figure, green to ember as it empties; a fallen Tender
      // lies dimmed under his sentence until the bastion wake.
      const bodyBar = tenderStand.maxHp != null ? (() => {
        const max = tenderStand.maxHp;
        const hp = Math.max(0, Math.min(max, tenderStand.hp ?? max));
        const frac = max > 0 ? hp / max : 0;
        return (
          <g pointerEvents="none">
            <rect x={tenderFig.x - 18 * zoom} y={tenderFig.y - h - 10 * zoom - jh} width={36 * zoom} height={3.6 * zoom}
              fill="rgba(6,4,10,0.82)" stroke="rgba(201,162,39,0.55)" strokeWidth={0.5} />
            <rect x={tenderFig.x - 18 * zoom} y={tenderFig.y - h - 10 * zoom - jh} width={36 * zoom * frac} height={3.6 * zoom}
              fill={tenderStand.down ? "#8a2f26" : frac <= 0.35 ? "#d05a3a" : "#9dc08b"} />
            {tenderStand.down && (
              <text x={tenderFig.x} y={tenderFig.y + 13 * zoom} textAnchor="middle" fontSize={6.5 * zoom} fontWeight={700} fill="#e8a49a"
                style={{ paintOrder: "stroke", stroke: "rgba(8,2,4,0.9)", strokeWidth: 3 }}>fallen — he wakes at the bastion</text>
            )}
          </g>
        );
      })() : null;
      // THE RUNIC WEAPON rides with him (Nigel, 2026-10-19):
      // it floats at his shoulder on the map's own clock,
      // gold-lit; the Sword & Shield's shield keeps the
      // opposite side. Since the homeland weapon referee
      // (Nigel, 2026-10-20) it HUNTS here too: when the server
      // serves a strike newer than the last one witnessed, the
      // weapon lunges at that foe's hex and comes back — the
      // arc below only ever plays a blow the server struck.
      const weaponKey = (tenderStand.weaponKey ?? null) as WeaponKey | null;
      const wh = 30 * zoom;
      // THE GROUND'S MEASURE, PORTED (Nigel, 2026-10-20 — the
      // weapon-motion build): the Proving Ground's weapon rides
      // an elliptical orbit with a sin bob, its shield counter-
      // orbits, its tips track the foe, and its arrow flies a
      // homing circuit home under a fading tracer. The Ground's
      // constants are demo px; the map's body stands 62 where
      // the Ground's stands 117 — the jump arc's own ratio
      // (JUMP_SCALE above) carries them across, times the zoom.
      const WS = (62 / 117) * zoom;
      const wnow = Date.now();
      // The orbit's heart: the shoulder point the weapon
      // already haunts, riding the jump as it always has.
      const ocx = tenderFig.x;
      const ocy = tenderFig.y - 34 * zoom - jh;
      const orbitA = 0.6 + wnow * 0.00075;
      const orbitX = ocx + Math.cos(orbitA) * 56 * WS;
      const orbitY = ocy + Math.sin(orbitA) * 13 * WS + Math.sin(wnow / 480) * 3 * WS;
      const shieldOrbitX = ocx + Math.cos(orbitA + Math.PI) * 40 * WS;
      const shieldOrbitY = ocy + Math.sin(orbitA + Math.PI) * 11 * WS + Math.sin(wnow / 520 + 2) * 3 * WS;
      // THE FLIGHT: a newly witnessed strike launches the
      // weapon from its orbit point at that foe's hex. A
      // changed hand ends any flight — the striker is gone.
      let flight = weaponFlightRef.current;
      if (weaponStrikeAnim && weaponKey && (!flight || flight.strikeLocalAt !== weaponStrikeAnim.localAt)) {
        const tt = tiles.find(t => t.id === weaponStrikeAnim.tileId);
        const tp = tt ? tilePos(tt) : null;
        if (tp) {
          flight = weaponFlightRef.current = {
            strikeLocalAt: weaponStrikeAnim.localAt, key: weaponKey, tileId: weaponStrikeAnim.tileId,
            fx: orbitX, fy: orbitY, tx: tp.cx, ty: tp.cy,
            x: orbitX, y: orbitY, heading: Math.atan2(tp.cy - orbitY, tp.cx - orbitX),
            phase: "out", lastT: wnow, shx: shieldOrbitX, shy: shieldOrbitY,
          };
          weaponTrailRef.current = [];
        }
      }
      if (flight && flight.key !== weaponKey) { weaponFlightRef.current = null; flight = null; }
      if (flight && wnow - flight.strikeLocalAt > 4000) { weaponFlightRef.current = null; flight = null; }
      // Where the weapon stands this frame, and where its tip
      // points. Idle: the orbit, with the Ground's sway; the
      // arrow and the spear hunt with their tips even at rest.
      let wx = orbitX, wy = orbitY;
      let wrot = Math.sin(wnow / 620) * 7;
      // The hunting tips' quarry: the strike's foe in flight;
      // at rest, the nearest dark on the field; with no dark,
      // the Tender's own facing, a reach ahead of him.
      const aimPoint = (): { x: number; y: number } => {
        if (flight) return { x: flight.tx, y: flight.ty };
        let best: { x: number; y: number } | null = null; let bestD = Infinity;
        for (const w of wanderers) {
          const t = tiles.find(t => t.id === w.tileId);
          if (!t) continue;
          const p = tilePos(t);
          const d = (p.cx - wx) * (p.cx - wx) + (p.cy - wy) * (p.cy - wy);
          if (d < bestD) { bestD = d; best = { x: p.cx, y: p.cy }; }
        }
        if (best) return best;
        const v = DIR_VEC[tenderFig.dir] ?? [0, 1];
        return { x: tenderFig.x + v[0] * 120 * WS, y: tenderFig.y + v[1] * 120 * WS };
      };
      if (flight && flight.key !== "arrow") {
        // THE BLADED JAB (the Ground's lunge, verbatim
        // timing): 105 ms out on an ease-out cubic, the blow
        // lands, 250 ms home on a smoothstep to the moving
        // orbit point. The blade turns tip-to-target for the
        // whole flight — the Ground's tipDown measure: its
        // drawn tip rides down, so a−90 puts it on the line.
        const OUT_MS = 105, BACK_MS = 250;
        const el = wnow - flight.strikeLocalAt;
        const aimA = Math.atan2(flight.ty - flight.fy, flight.tx - flight.fx) * 180 / Math.PI;
        wrot = flight.key === "spear" ? aimA + 90 : aimA - 90;
        if (el < OUT_MS) {
          const t = el / OUT_MS, e = 1 - Math.pow(1 - t, 3);
          wx = flight.fx + (flight.tx - flight.fx) * e;
          wy = flight.fy + (flight.ty - flight.fy) * e;
        } else {
          if (!weaponLandedRef.current || weaponLandedRef.current.at !== flight.strikeLocalAt + OUT_MS) {
            weaponLandedRef.current = { x: flight.tx, y: flight.ty, at: flight.strikeLocalAt + OUT_MS, felled: !!weaponStrikeAnim?.felled };
          }
          if (el < OUT_MS + BACK_MS) {
            const t = (el - OUT_MS) / BACK_MS, e = t * t * (3 - 2 * t);
            wx = flight.tx + (orbitX - flight.tx) * e;
            wy = flight.ty + (orbitY - flight.ty) * e;
          } else { weaponFlightRef.current = null; flight = null; }
        }
      } else if (flight && flight.key === "arrow") {
        // THE HOMING ARROW (the Ground's circuit, steered on
        // the map's renders): out at 580, looping home at 500,
        // turning 3.6 out and 2.5 on the loop — the Ground's
        // rates, its speeds carried by the body's scale. The
        // catch is read off the swept segment, so a coarse
        // render step can never tunnel past its mark. One
        // circuit per witnessed strike: the referee's record
        // is the only launch there is.
        const dt = Math.min(0.06, Math.max(0, (wnow - flight.lastT) / 1000));
        flight.lastT = wnow;
        const tgt = flight.phase === "out" ? { x: flight.tx, y: flight.ty } : { x: orbitX, y: orbitY };
        const speed = (flight.phase === "out" ? 580 : 500) * WS;
        const turn = (flight.phase === "out" ? 3.6 : 2.5) * dt;
        const want = Math.atan2(tgt.y - flight.y, tgt.x - flight.x);
        let diff = want - flight.heading;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        flight.heading += Math.max(-turn, Math.min(turn, diff));
        const nx = flight.x + Math.cos(flight.heading) * speed * dt;
        const ny = flight.y + Math.sin(flight.heading) * speed * dt;
        const segD = (() => {
          const dx = nx - flight!.x, dy = ny - flight!.y;
          const len2 = dx * dx + dy * dy;
          const u = len2 > 0 ? Math.max(0, Math.min(1, ((tgt.x - flight!.x) * dx + (tgt.y - flight!.y) * dy) / len2)) : 0;
          const px = flight!.x + u * dx, py = flight!.y + u * dy;
          return Math.hypot(tgt.x - px, tgt.y - py);
        })();
        flight.x = nx; flight.y = ny;
        const catchR = (flight.phase === "out" ? 20 : 18) * WS;
        if (segD < catchR || Math.hypot(tgt.x - nx, tgt.y - ny) < catchR) {
          if (flight.phase === "out") {
            flight.phase = "loop";
            weaponLandedRef.current = { x: flight.tx, y: flight.ty, at: wnow, felled: !!weaponStrikeAnim?.felled };
          } else { weaponFlightRef.current = null; flight = null; }
        }
        if (flight) {
          weaponTrailRef.current.push({ x: flight.x, y: flight.y, t: wnow });
          wx = flight.x; wy = flight.y;
          // On the loop home the tip follows the arc; flying
          // out, it rides the heading onto the foe. The drawn
          // arrow's nose sits ~28° above its image axis (the
          // Ground's own measure for this art).
          wrot = flight.heading * 180 / Math.PI + 28;
        }
      }
      if (!flight && (weaponKey === "arrow" || weaponKey === "spear")) {
        const g = aimPoint();
        wrot = Math.atan2(g.y - wy, g.x - wx) * 180 / Math.PI + (weaponKey === "arrow" ? 28 : 90);
      }
      // The tracer: the arrow's flown path, pruned and faded
      // on the Ground's 420 ms measure.
      weaponTrailRef.current = weaponTrailRef.current.filter(p => wnow - p.t <= 420);
      const trail = weaponKey === "arrow" ? weaponTrailRef.current : [];
      const sh = 26 * zoom;
      const scx = flight && weaponKey === "swordshield" ? flight.shx : shieldOrbitX;
      const scy = flight && weaponKey === "swordshield" ? flight.shy : shieldOrbitY;
      const shrot = Math.sin(wnow / 700 + 1) * 5;
      const landed = weaponLandedRef.current;
      const landedLive = !!landed && wnow - landed.at >= 0 && wnow - landed.at < 320;
      // The ground shadow stays home and shrinks with height —
      // the Ground's own telling of how high he is.
      const hRatio = Math.min(1, jh / (46 * (62 / 117) * zoom));
      return (
        <g key="tender-figure" pointerEvents="none">
          {anchorC && (
            <ellipse cx={anchorC.cx} cy={anchorC.cy} rx={size * 0.42} ry={size * 0.2}
              fill="rgba(255,215,0,0.07)" stroke="rgba(255,215,0,0.75)" strokeWidth={1.4} />
          )}
          <ellipse cx={tenderFig.x} cy={tenderFig.y + 2} rx={13 * zoom * (1 - 0.32 * hRatio)} ry={3.5 * zoom * (1 - 0.32 * hRatio)} fill="rgba(0,0,0,0.35)" fillOpacity={1 - 0.35 * hRatio} />
          {pose.flip ? <g transform={`translate(${2 * tenderFig.x} 0) scale(-1 1)`}>{imgTurned}</g> : imgTurned}
          {bodyBar}
          {/* THE TENDER'S OWN TAP (touch hands): the figure
              takes the tap itself, and his controller pops —
              the tap never becomes a road through him. */}
          {touchForm && (
            <circle cx={tenderFig.x} cy={tenderFig.y - 26 * zoom} r={30 * zoom} fill="transparent" pointerEvents="all"
              style={{ cursor: "pointer" }}
              onClick={(e) => { e.stopPropagation(); setTenderCtl(true); }} />
          )}
          {trail.length > 1 && (
            <g pointerEvents="none" strokeLinecap="round">
              {trail.slice(1).map((p, i) => {
                const q = trail[i];
                const age = (wnow - p.t) / 420;
                return <line key={i} x1={q.x} y1={q.y} x2={p.x} y2={p.y}
                  stroke={`rgba(255,236,180,${(0.55 * (1 - age)).toFixed(3)})`} strokeWidth={1.6 * WS} />;
              })}
            </g>
          )}
          {weaponKey && WEAPONS[weaponKey] && (
            <g>
              <ellipse cx={wx} cy={wy} rx={wh * 0.66} ry={wh * 0.66} fill="rgba(255,215,100,0.13)" />
              <g transform={`translate(${wx} ${wy}) rotate(${wrot})`}>
                <image href={weaponImg(weaponKey)} x={-wh / 2} y={-wh / 2} width={wh} height={wh}
                  preserveAspectRatio="xMidYMid meet" style={{ filter: "drop-shadow(0 0 5px rgba(255,215,100,0.55))" }} />
              </g>
            </g>
          )}
          {landedLive && landed && (
            <g pointerEvents="none" opacity={Math.max(0, 1 - (wnow - landed.at) / 320)}>
              <path d={`M ${landed.x - 9 * zoom} ${landed.y - 7 * zoom} L ${landed.x + 9 * zoom} ${landed.y + 7 * zoom}`}
                stroke="#ffd977" strokeWidth={1.8 * zoom} strokeLinecap="round" />
              <path d={`M ${landed.x - 6 * zoom} ${landed.y + 8 * zoom} L ${landed.x + 8 * zoom} ${landed.y - 6 * zoom}`}
                stroke="rgba(255,240,200,0.75)" strokeWidth={1.1 * zoom} strokeLinecap="round" />
              {landed.felled && (
                <text x={landed.x} y={landed.y - 14 * zoom} textAnchor="middle" fontSize={9 * zoom} fill="#ffd977"
                  style={{ paintOrder: "stroke", stroke: "rgba(8,2,4,0.9)", strokeWidth: 3 }}>✦</text>
              )}
            </g>
          )}
          {weaponKey === "swordshield" && (
            <g transform={`translate(${scx} ${scy}) rotate(${shrot})`}>
              <image href={shieldImg()} x={-sh / 2} y={-sh / 2} width={sh} height={sh}
                preserveAspectRatio="xMidYMid meet" style={{ filter: "drop-shadow(0 0 4px rgba(255,215,100,0.4))" }} />
            </g>
          )}
          {findPulseAt > 0 && marchNow - findPulseAt < 2400 && (
            <circle cx={tenderFig.x} cy={tenderFig.y - 18 * zoom} r={(10 + ((marchNow - findPulseAt) % 800) / 800 * 30) * zoom}
              fill="none" stroke="#ffd977" strokeWidth={2}
              opacity={0.8 * (1 - (marchNow - findPulseAt) / 2400)} pointerEvents="none" />
          )}
        </g>
      );
    })();
    // DEFENCE WORKS on the face (Nigel, 2026-10-23): a Stone
    // defender's rock wall and a Root defender's bramble,
    // drawn at their nodes' own free points — rocks as
    // standing stones, the thicket as dark green knots —
    // each paling as its wounds deepen.
    const defenceWorksLayer = (
      <g key="defence-works" pointerEvents="none">
        {defenceWorks.map(wk => (
          <g key={wk.id}>
            {wk.nodes.filter(n => n.hp > 0).map((n, i) => {
              const dp = isoOffset(n.q, n.r, size);
              const cx = originX + dp.px;
              const cy = originY + dp.py;
              const frac = Math.max(0, Math.min(1, n.hp / Math.max(1, n.maxHp)));
              return wk.kind === "rockwall" ? (
                <g key={i} opacity={0.35 + 0.65 * frac}>
                  <ellipse cx={cx} cy={cy + size * 0.1} rx={size * 0.17} ry={size * 0.06} fill="rgba(0,0,0,0.4)" />
                  <polygon points={`${cx},${cy - size * 0.3} ${cx + size * 0.16},${cy + size * 0.08} ${cx - size * 0.16},${cy + size * 0.08}`} fill="#8d8578" stroke="#4c463c" strokeWidth={1 / zoom} strokeLinejoin="round" />
                </g>
              ) : (
                <g key={i} opacity={0.35 + 0.65 * frac}>
                  <circle cx={cx} cy={cy} r={size * 0.21} fill="rgba(38,64,30,0.55)" stroke="#69a84f" strokeWidth={1.2 / zoom} strokeDasharray="3 2" />
                  <path d={`M ${cx - size * 0.14} ${cy + size * 0.08} Q ${cx} ${cy - size * 0.16} ${cx + size * 0.14} ${cy + size * 0.08}`} fill="none" stroke="#69a84f" strokeWidth={1.2 / zoom} />
                </g>
              );
            })}
          </g>
        ))}
      </g>
    );
    // PHASE D — THE BLIND FRAY on the face: each wanderer wears
    // the Fray's own art (Nigel's drawn face, the workshop's live
    // choice respected), standing in its hex on the map's clock —
    // a slow, sightless sway, nothing like a march. Since "Fray 1"
    // (2026-10-22) the face itself walks: the five-stride cycle
    // loops on its own heartbeat while the bundled face is live.
    const wanderersLayer = (
      <g key="wanderers" pointerEvents="none">
        {wanderers.map(w => {
          const t = tiles.find(t => t.id === w.tileId);
          if (!t) return null;
          const base = tilePos(t);
          // THE FREE POINT (Nigel, 2026-10-23): the dark
          // stands where it walks — its own stored point on
          // the land, read through the same iso delta as
          // every figure's standing point.
          const dp = isoOffset(w.posQ, w.posR, size);
          const dc = isoOffset(t.q, t.r, size);
          const cx = base.cx + (dp.px - dc.px);
          const cy = base.cy + (dp.py - dc.py);
          const wh = size * 0.95;
          const sway = Math.sin(marchNow / 620 + w.id * 1.7) * 1.6 / zoom;
          // THE WOUND TRACK (Nigel, 2026-10-20): a Fray his
          // weapon has bitten wears its wounds — a thin dark
          // bar above it, emptying as the blows deepen.
          const wounded = w.hp != null && w.maxHp != null && w.hp < w.maxHp;
          return (
            <g key={w.id}>
              <ellipse cx={cx} cy={cy + size * 0.17} rx={size * 0.3} ry={size * 0.11} fill="rgba(0,0,0,0.42)" />
              <FrayFaceSvgImage art={enemyArtData?.art} x={cx - wh / 2} y={cy - wh * 0.66 + sway} width={wh} height={wh}
                opacity={0.95} />
              {wounded && (
                <g>
                  <rect x={cx - size * 0.26} y={cy - wh * 0.78 + sway} width={size * 0.52} height={2.6 / zoom} fill="rgba(6,4,10,0.82)" stroke="rgba(160,60,50,0.6)" strokeWidth={0.4 / zoom} />
                  <rect x={cx - size * 0.26} y={cy - wh * 0.78 + sway} width={size * 0.52 * Math.max(0, (w.hp ?? 0) / (w.maxHp ?? 1))} height={2.6 / zoom} fill="#b0402f" />
                </g>
              )}
            </g>
          );
        })}
      </g>
    );
    // The land rides the camera: tile art in the back group, the
    // screen-space hit layer at its old stacking place, every
    // other land layer in the front group — both groups carrying
    // the ONE camera transform — and the Tender last, in screen
    // space, exactly where he always stood.
    return (
      <>
        <g key="land-back" className="land-cam" transform={camTransform}>
          {elements}
        </g>
        {hitLayer}
        <g key="land-front" className="land-cam" transform={camTransform}>
          {buildingElements}
          {awokenElements}
          {wallLayer}
          {workingsLayer}
          {castEdgeLayer}
          {wgGuideLayer}
          {wgAttuneLayer}
          {calmLayer}
          {columnsLayer}
          {seedLayer}
          {wanderersLayer}
          {defenceWorksLayer}
          {patrolGuideLayer}
          {lineLayer}
          {bandLayer}
          {hoverLayer}
          {mistLayer}
          {targetMarker}
          {ghostLayer}
        </g>
        {tenderLayer}
      </>
    );
  };

  const deedLabel = (deed: string) => {
    switch (deed) {
      case "wave_survived": return "Unravelings survived";
      case "curse_broken": return "Curses broken";
      case "battle_won": return "Battles won";
      case "level_10": return "Reached level 10";
      case "level_20": return "Reached level 20";
      case "level_30": return "Reached level 30";
      default: return deed;
    }
  };

/** Hall of Champions: dwellings for champions — house, feed, and raise the Hall. */
function HallPanel({ tenderItems, onUpdate, onChampionChange }: { tenderItems: any[]; onUpdate: () => void; onChampionChange?: () => void }) {
  const queryClient = useQueryClient();
  const hallQ = useQuery({ queryKey: ["hall"], queryFn: () => api.getHall(), refetchInterval: 30000 });
  const legendsQ = useQuery({ queryKey: ["legends"], queryFn: () => api.getLegends() });
  const championId = (legendsQ.data as any)?.champion?.id ?? null;
  const makeChampion = useMutation({
    mutationFn: (awakenedId: number) => api.setChampion({ awakenedId }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["legends"] }); onChampionChange?.(); },
    onError: (e: any) => alert(e.message),
  });
  const attQ = useQuery({ queryKey: ["aspectAttunement"], queryFn: () => api.getAspectAttunement() });
  const [selectedRoom, setSelectedRoom] = useState<number>(0);
  // Feeding reports inline (browser alerts are clunky on iPad); a level-up
  // also pulses the resident card gold.
  const [feedNote, setFeedNote] = useState<{ text: string; tone: "plain" | "leveled" | "error" } | null>(null);
  const [pulse, setPulse] = useState(false);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerPulse = () => {
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    setPulse(false);
    // Restart the animation even on back-to-back level-ups.
    requestAnimationFrame(() => requestAnimationFrame(() => setPulse(true)));
    pulseTimer.current = setTimeout(() => setPulse(false), 2000);
  };
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ["hall"] }); queryClient.invalidateQueries({ queryKey: ["aspectAttunement"] }); onUpdate(); };
  const fundE = useMutation({ mutationFn: (amount: number) => api.fundHallEnergy({ amount }), onSuccess: refresh, onError: (e: any) => alert(e.message) });
  const fundEl = useMutation({ mutationFn: (v: { element: string; points: number }) => api.fundHallElement(v), onSuccess: refresh, onError: (e: any) => alert(e.message) });
  const begin = useMutation({ mutationFn: () => api.beginHallUpgrade(), onSuccess: refresh, onError: (e: any) => alert(e.message) });
  const house = useMutation({ mutationFn: (v: { roomIndex: number; awakenedId: number }) => api.houseAwoken(v), onSuccess: refresh, onError: (e: any) => alert(e.message) });
  const unhouse = useMutation({ mutationFn: (roomIndex: number) => api.unhouseAwoken({ roomIndex }), onSuccess: refresh, onError: (e: any) => alert(e.message) });
  const feed = useMutation({
    mutationFn: (v: { awakenedId: number; energy: number }) => api.feedEnergy(v),
    onSuccess: (r: any, v: any) => {
      refresh();
      const a = tenderItems.find(t => t.id === v.awakenedId);
      const name = a?.name ?? "Your champion";
      if (r.leveledUp) {
        setFeedNote({ tone: "leveled", text: `✦ ${name} rises to Lv ${r.newLevel}! (+${r.xpGain} XP${r.statPointsGained ? ` · +${r.statPointsGained} stat point${r.statPointsGained > 1 ? "s" : ""}` : ""})` });
        triggerPulse();
      } else {
        setFeedNote({ tone: "plain", text: `+${r.xpGain} XP — ${name} drinks deep.` });
      }
    },
    onError: (e: any) => setFeedNote({ tone: "error", text: e?.message ?? "Feeding failed." }),
  });

  if (hallQ.isPending) return <div className="champion-tab"><div className="celestial-title">Hall of Champions</div><img src={hallBanner} className="hall-banner" alt="The Hall of Champions" /><p className="quiet">Approaching the castle…</p></div>;
  const hall = hallQ.data?.hall;
  if (!hall) return (
    <div className="champion-tab">
      <div className="celestial-title">Hall of Champions</div>
      <img src={hallBanner} className="hall-banner" alt="The Hall of Champions" />
      <p className="quiet">No hall stands yet. Raise the 🏰 Hall of Champions from the build menu — a castle haunted by ancient Awokin, where your champions will dwell, be fed, and grow.</p>
    </div>
  );
  if (hall.status === "building") return (
    <div className="champion-tab">
      <div className="celestial-title">Hall of Champions</div>
      <img src={hallBanner} className="hall-banner" alt="The Hall of Champions" />
      <p className="quiet">The castle is rising from the stone… it will stand soon.</p>
    </div>
  );
  const housedIds = new Set(hall.rooms.map((r: any) => r.awakenedId).filter(Boolean));
  const room = hall.rooms[Math.min(selectedRoom, hall.rooms.length - 1)] ?? hall.rooms[0];
  const resident = room?.awakenedId ? tenderItems.find(t => t.id === room.awakenedId) : null;
  const cost = hall.nextCost;
  const fund = hall.fund;
  const elGlyph: Record<string, string> = { tide: "🌊", sky: "🌪️", stone: "🪨", root: "🌱" };
  const full = cost && fund.energy >= cost.energy && ["tide", "sky", "stone", "root"].every(el => fund[el] >= cost.elementalEach);
  const upgradeLeft = hall.upgradeReadyAt ? Math.max(0, new Date(hall.upgradeReadyAt).getTime() - Date.now()) : 0;

  return (
    <div className="champion-tab">
      <div className="celestial-title">🏰 Hall of Champions — Level {hall.level}</div>
      <img src={hallBanner} className="hall-banner" alt="The Hall of Champions" />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
        {hall.rooms.map((r: any) => {
          const a = r.awakenedId ? tenderItems.find(t => t.id === r.awakenedId) : null;
          return (
            <button key={r.roomIndex} className="abtn small" style={room?.roomIndex === r.roomIndex ? { outline: "2px solid #d4af6a" } : { opacity: 0.85 }} onClick={() => { setSelectedRoom(r.roomIndex); setFeedNote(null); }} title={a ? a.name : "Empty room"}>
              {a ? <img src={a.image_url} alt="" style={{ width: 34, height: 34, objectFit: "cover", borderRadius: 4, verticalAlign: "middle" }} /> : <span style={{ fontSize: 20 }}>🕯️</span>}
              <span style={{ marginLeft: 4 }}>Room {r.roomIndex + 1}</span>
            </button>
          );
        })}
      </div>
      {room && (resident ? (
        <div className={`champion-tab-card${pulse ? " levelup-pulse" : ""}`}>
          <img src={resident.image_url} alt={resident.name} />
          <div className="champion-name">{championId === resident.id ? "⭐ " : ""}{resident.name}</div>
          <div className="champion-stats">{resident.power}⚔ {resident.toughness}🛡 · Lv {resident.level ?? 0} · ✦ {resident.experience ?? 0} XP</div>
          {(() => {
            const into = resident.xp_into_level ?? Math.max(0, (resident.experience ?? 0) - (resident.xp_current ?? 0));
            const forNext = resident.xp_for_next_level ?? Math.max(0, (resident.xp_next ?? 0) - (resident.xp_current ?? 0));
            const pct = forNext > 0 ? Math.min(100, Math.round((into / forNext) * 100)) : 100;
            return (
              <div className="hall-xp">
                <div className="hall-xp-bar"><div className="hall-xp-fill" style={{ width: `${pct}%` }} /></div>
                <div className="hall-xp-text">✦ {into}/{forNext} XP — {Math.max(0, forNext - into)} to Lv {(resident.level ?? 0) + 1}</div>
              </div>
            );
          })()}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            {[1, 5, 10].map(amt => (
              <button key={amt} className="abtn small" disabled={feed.isPending} onClick={() => feed.mutate({ awakenedId: resident.id, energy: amt })} title={`Feed ${amt} energy → ${amt * 2} XP`}>
                Feed {amt}✦ → {amt * 2} XP
              </button>
            ))}
            <button className="abtn small" onClick={() => unhouse.mutate(room.roomIndex)}>Leave room</button>
            {championId === resident.id
              ? <span className="quiet" style={{ alignSelf: "center" }}>Your champion — represents you in the Confluence.</span>
              : <button className="abtn small" disabled={makeChampion.isPending} onClick={() => makeChampion.mutate(resident.id)} title="Crown this Awokin as your champion">⭐ Make Champion</button>}
          </div>
          {feedNote && <div className={`hall-feed-note ${feedNote.tone}`}>{feedNote.text}</div>}
        </div>
      ) : (
        <div>
          <p className="quiet">Room {room.roomIndex + 1} stands empty. House an Awokin:</p>
          <div className="champion-field-list" style={{ maxHeight: 150 }}>
            {tenderItems.filter(a => !housedIds.has(a.id)).map(a => (
              <div key={a.id} className="champion-field-item">
                <img src={a.image_url} alt={a.name} />
                <div className="champion-field-info"><div>{a.name}</div><div className="quiet">Lv {a.level ?? 0} · {a.xp_into_level ?? 0}/{a.xp_for_next_level ?? 0} XP · {a.power}⚔ {a.toughness}🛡</div></div>
                <button className="abtn small" onClick={() => house.mutate({ roomIndex: room.roomIndex, awakenedId: a.id })}>House</button>
              </div>
            ))}
            {tenderItems.filter(a => !housedIds.has(a.id)).length === 0 && <p className="quiet">Every Awokin is housed or none remain.</p>}
          </div>
        </div>
      ))}
      {cost && !hall.upgrading && (
        <div style={{ marginTop: 12 }}>
          <div className="celestial-title" style={{ fontSize: 14 }}>Raise the Hall to Level {hall.level + 1}</div>
          <div style={{ fontSize: 13, display: "grid", gap: 4 }}>
            <div>✦ Energy: {fund.energy}/{cost.energy}
              <button className="abtn small" style={{ marginLeft: 8 }} disabled={fundE.isPending} onClick={() => fundE.mutate(10)}>+10</button>
              <button className="abtn small" style={{ marginLeft: 4 }} disabled={fundE.isPending} onClick={() => fundE.mutate(50)}>+50</button>
            </div>
            {(["tide", "sky", "stone", "root"] as const).map(el => (
              <div key={el}>{elGlyph[el]} {el}: {fund[el]}/{cost.elementalEach} <span className="quiet">(meter: {Math.floor(attQ.data?.levels?.[el] ?? 0)})</span>
                <button className="abtn small" style={{ marginLeft: 8 }} disabled={fundEl.isPending} onClick={() => fundEl.mutate({ element: el, points: 1 })}>+1</button>
                <button className="abtn small" style={{ marginLeft: 4 }} disabled={fundEl.isPending} onClick={() => fundEl.mutate({ element: el, points: 10 })}>+10</button>
              </div>
            ))}
          </div>
          {full ? <button className="abtn" style={{ marginTop: 8 }} disabled={begin.isPending} onClick={() => begin.mutate()}>Begin the raising ({cost.buildMinutes >= 1440 ? `${Math.round(cost.buildMinutes / 1440 * 10) / 10} days` : cost.buildMinutes >= 60 ? `${Math.round(cost.buildMinutes / 60 * 10) / 10} h` : `${cost.buildMinutes} min`})</button>
            : <p className="quiet" style={{ marginTop: 6 }}>Fill every reservoir, then begin. The spirits stir as the stores grow.</p>}
        </div>
      )}
      {hall.upgrading && <p className="quiet" style={{ marginTop: 10 }}>🛠️ The Hall is being raised — a new room opens in {Math.ceil(upgradeLeft / 3600000)}h {Math.ceil((upgradeLeft % 3600000) / 60000)}m. Housed champions rest undisturbed.</p>}
      {hall.level >= 10 && <p className="quiet" style={{ marginTop: 10 }}>Ten rooms stand. The Hall is complete — for now, the castle dreams no deeper.</p>}
    </div>
  );
}



  return (
    <div className="territory-view">
      {territoryLoaded && firstSeedEv && firstSeedEv.state !== "done" && (() => {
        // The First Seed's hold (Nigel via Wake, 2026-10-17): the
        // event surface that replaced the old "Face the Unraveler"
        // first claim. The court stays in hand, as everywhere —
        // housed Awoken and the champion are never offered. Every
        // number here is the server's own ledger, read fresh. When
        // the hold is DONE the panel leaves entirely (Nigel,
        // 2026-10-20: "it never disappeared afterwords") — the
        // server keeps the record readable; the face stops
        // mounting it.
        const ev = firstSeedEv;
        const placedIds = new Set(placements.map(p => p.awakenedId));
        const standing = ev.defenders
          .map(d => { const a = tenderItems.find(x => x.id === d.awakenedId); return a ? { ...a, hp: d.hp, maxHp: d.maxHp } : null; })
          .filter(Boolean) as (Awakened & { hp: number; maxHp: number })[];
        const eligible = tenderItems.filter(a => !isCourt(a) && !placedIds.has(a.id));
        const room = Math.max(0, 4 - standing.length);
        const toggleSeedTeam = (id: number) => setSeedTeam(prev =>
          prev.includes(id) ? prev.filter(x => x !== id) : prev.length >= room ? prev : [...prev, id]);
        const waveInSec = ev.state === "holding" && ev.nextWaveAt
          ? Math.max(0, Math.round((ev.nextWaveAt - Date.now()) / 1000)) : null;
        return (
          <section className="first-claim first-seed" aria-live="polite">
            <p className="eyebrow">The Last Bastion · The First Seed</p>
            <h2>A starseed lies in the cursed heart of your land.</h2>
            {ev.state === "holding" ? (
              <>
                <p>The hold is underway. <strong>{ev.wavesCleared} wave{ev.wavesCleared === 1 ? "" : "s"} beaten</strong> · seed level <strong>{ev.seedLevel}</strong>{ev.banked ? " · banked" : ""}.{waveInSec !== null ? <> Wave {ev.nextWave} comes in <strong>{waveInSec}s</strong> — {ev.nextWave} Fray ride with it.</> : ""}</p>
                <p>Casting never closes: send more of your hand to the seed's hex whenever you can pay their way.</p>
              </>
            ) : ev.banked ? (
              <p>The seed is <strong>banked at level {ev.seedLevel}</strong> — the ground is yours and the company stands on it. Begin another hold to raise the seed: every three waves, a rising. <strong>Hold the seed to its third rising — level 3 — and it lays up a shining point of attunement, yours to gather.</strong></p>
            ) : (
              <>
                <p>Send your Awokin onto the seed's hex, then begin the hold. Waves of Fray will come, one upon the next — <strong>clear three waves and the seed banks</strong>: the ground purifies under the company, and your energy pool fills to its cap. Fail before then and nothing is lost — the seed waits, and you may try again whenever you like.</p>
                <p><strong>Hold the seed to its third rising — level 3 — and it lays up a shining point of attunement, yours to gather.</strong></p>
              </>
            )}
            {initialPatrolIds && initialPatrolIds.length > 0 && standing.length === 0 && seedTeam.length > 0 && ev.state !== "done" && (
              <p className="patrol-arrived">🚶 Your patrol from the spark is named below — the first three you woke, ready to be sent to the seed.</p>
            )}
            {standing.length > 0 && (
              <p className="quiet">Holding the seed: {standing.map(a => `${a.name} (${a.hp}/${a.maxHp})`).join(" · ")}</p>
            )}
            {ev.state !== "done" && (
              eligible.length === 0 && standing.length === 0 ? (
                <p className="quiet">Your deck is empty — wake Awokin at the spark first, then return to claim your ground.</p>
              ) : (
                <>
                  {eligible.length > 0 && (
                    <div className="first-claim-team">
                      {eligible.map(a => (
                        <button key={a.id} type="button" className={`first-claim-card ${seedTeam.includes(a.id) ? "in-pool" : ""}`} onClick={() => toggleSeedTeam(a.id)} aria-pressed={seedTeam.includes(a.id)}>
                          <img src={a.image_url} alt={a.name} />
                          <div className="first-claim-card-name">{a.name}</div>
                          <div className="quiet">{a.power}⚔ {a.toughness}🛡</div>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="first-claim-actions">
                    <button type="button" className="abtn" disabled={seedTeam.length === 0 || seedBusy} onClick={() => void handleDeployFirstSeed()}>
                      {seedBusy ? "Sending…" : `Send to the seed${seedTeam.length ? ` (${seedTeam.length})` : ""}`}
                    </button>
                    {ev.state === "waiting" && (
                      <button type="button" className="abtn" disabled={standing.length === 0 || seedBusy} onClick={() => void handleStartFirstSeedHold()}>
                        Begin the Hold
                      </button>
                    )}
                    {ev.state === "holding" && (
                      <button type="button" className="abtn" disabled={seedBusy} onClick={() => void handleEndFirstSeedRun()}>
                        End the Run
                      </button>
                    )}
                  </div>
                  {ev.state === "waiting" && standing.length === 0 && (
                    <p className="quiet">No defender stands on the seed's hex yet — name a company above and send them.</p>
                  )}
                  {seedError && <p className="notice error" role="status">{seedError}</p>}
                </>
              )
            )}
          </section>
        );
      })()}
      {showChampionTab && (
        <>
        <div id="hall-panel-anchor">
          <button className="aspect-close" onClick={() => setShowChampionTab(false)} title="Close">✕</button>
          <HallPanel tenderItems={tenderItems} onUpdate={onUpdate} onChampionChange={() => { api.getLegends().then(setLegends).catch(() => {}); }} />
        </div>
        <div className="champion-tab">
          <div className="celestial-title">Champion & Field</div>
          {legends.champion ? (
            <div className="champion-tab-card">
              <img src={legends.champion.image_url} alt={legends.champion.name} />
              <div className="champion-name">⭐ {legends.champion.name}</div>
              <div className="champion-stats">
                {legends.champion.power}⚔ {legends.champion.toughness}🛡 · Lv {legends.champion.level ?? 0}
              </div>
              <button
                className="abtn small"
                onClick={() => {
                  setShowChampionTab(false);
                  if (legends.champion) setApplyingToTarget(legends.champion.id);
                  setShowAspects(true);
                }}
                title="Apply an aspect to your champion"
              >
                Add Aspect
              </button>
              <button
                className="abtn small"
                onClick={() => {
                  setShowChampionTab(false);
                  setShowChampionPicker(true);
                }}
              >
                Change
              </button>
            </div>
          ) : (
            <div>
              <p className="quiet">No champion chosen yet.</p>
              <button className="abtn small" onClick={() => { setShowChampionTab(false); setShowChampionPicker(true); }}>
                Choose Champion
              </button>
            </div>
          )}
          <div className="celestial-title" style={{ marginTop: 12, fontSize: 14 }}>📜 Hall of Legends</div>
          <div className="champion-field-list" style={{ maxHeight: 120 }}>
            {legends.legends.length === 0 ? (
              <p className="quiet">No legends yet. Battle on.</p>
            ) : (
              legends.legends.map(l => (
                <div key={l.id} className="legend-entry">
                  <span className="legend-name">{l.awokenName}</span>
                  <span className="legend-deed">{deedLabel(l.deed)} ×{l.count}</span>
                </div>
              ))
            )}
          </div>
          <div className="celestial-title" style={{ marginTop: 12, fontSize: 14 }}>Field Awokin</div>
          <div className="champion-field-list">
            {tenderItems.filter(a => placedIds.has(a.id)).map(a => (
              <div key={a.id} className="champion-field-item">
                <img src={a.image_url} alt={a.name} />
                <div className="champion-field-info">
                  <div>{a.name}</div>
                  <div className="quiet">{a.power}⚔ {a.toughness}🛡</div>
                </div>
                <button
                  className="abtn small"
                  onClick={() => {
                    setShowChampionTab(false);
                    setApplyingToTarget(a.id);
                    setShowAspects(true);
                  }}
                >
                  Aspect
                </button>
              </div>
            ))}
            {tenderItems.filter(a => placedIds.has(a.id)).length === 0 && (
              <p className="quiet">No Awokin on the field.</p>
            )}
          </div>
        </div>
        </>
      )}
      <AspectAttunement onOpenZodiac={onOpenZodiac} visible={showAspects} onClose={() => { setShowAspects(false); setApplyingToTarget(null); }} tenderItems={tenderItems} placedIds={placedIds} onUpdate={onUpdate} targetAwokenId={applyingToTarget} onDeepenAspect={async (wornAspect: any) => {
        if (!applyingToTarget) return;
        try {
          const awoken = tenderItems.find(x => x.id === applyingToTarget);
          const oldP = awoken?.power ?? 0, oldT = awoken?.toughness ?? 0;
          const result: any = await api.call("deepenAspect", { awakenedId: applyingToTarget, targetAspectKey: wornAspect.key });
          refreshAspects();
          await onUpdate();
          setShowAspects(false);
          setCelebration({
            awoken: awoken,
            aspect: { name: result.targetName || wornAspect.name, imageUrl: result.imageUrl || wornAspect.imageUrl },
            element: result.element,
            newLevel: result.newLevel,
            oldPower: oldP, oldToughness: oldT,
            newPower: oldP + 1, newToughness: oldT + 1,
          });
        } catch (err) {
          alert(err instanceof Error ? err.message : "Failed to deepen");
        }
        setApplyingToTarget(null);
      }} onApplyAspect={async (aspect) => {
        setShowAspects(false);
        if (applyingToTarget) {
          try {
            const awoken = tenderItems.find(x => x.id === applyingToTarget);
            const oldP = awoken?.power ?? 0, oldT = awoken?.toughness ?? 0;
            const result: any = await api.call("applyAspect", { awakenedId: applyingToTarget, inventoryAspectId: aspect.id });
            refreshAspects();
            await onUpdate();
            setCelebration({
              awoken: awoken,
              aspect: result.upgraded ? { name: result.targetName, imageUrl: result.imageUrl } : aspect,
              element: result.element,
              newLevel: result.newLevel,
              oldPower: oldP, oldToughness: oldT,
              newPower: oldP + 1, newToughness: oldT + 1,
            });
          } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to apply");
          }
          setApplyingToTarget(null);
        } else {
          setApplyingAspect(aspect);
        }
      }} />
      {celebration && (
        <AspectCelebration
          awoken={celebration.awoken}
          aspect={celebration.aspect}
          element={celebration.element}
          newLevel={celebration.newLevel}
          oldPower={celebration.oldPower}
          oldToughness={celebration.oldToughness}
          newPower={celebration.newPower}
          newToughness={celebration.newToughness}
          onDone={() => setCelebration(null)}
        />
      )}
      {applyingAspect && (
        <div className="applying-aspect-banner" onClick={() => setApplyingAspect(null)}>
          Tap an Awokin to apply {applyingAspect.name} — tap here to cancel
        </div>
      )}
      <button
        className="champion-fab"
        onClick={() => setShowChampionTab(!showChampionTab)}
        title="Champion"
      >
        <svg viewBox="0 0 32 32"><path d="M16 4 C17.2 11 21 14.8 28 16 C21 17.2 17.2 21 16 28 C14.8 21 11 17.2 4 16 C11 14.8 14.8 11 16 4 Z"/><circle cx="16" cy="16" r="1.7"/></svg>
      </button>
      {onToggleDeck && (
        <button
          className={`aspect-fab deck-fab${deckOpen ? " active" : ""}`}
          onClick={onToggleDeck}
          title="My Deck — your awakened collection"
          aria-label="My Deck — your awakened collection"
        >
          <svg viewBox="0 0 32 32"><path d="M6 8.5 C9.5 7 13 7 16 9 C19 7 22.5 7 26 8.5 V23 C22.5 21.5 19 21.5 16 23.5 C13 21.5 9.5 21.5 6 23 Z"/><path d="M16 9 V23.5"/><path d="M9 12 C11 11.3 13 11.3 14.5 12.1"/><path d="M17.5 12.1 C19 11.3 21 11.3 23 12"/></svg>
        </button>
      )}
      {onOpenZodiac && (
        <button
          className="aspect-fab tree-fab"
          onClick={onOpenZodiac}
          title="The Skill Zodiac — the tree of skills"
          aria-label="The Skill Zodiac"
        >
          <svg viewBox="0 0 32 32"><path d="M16 27 V14"/><path d="M16 14 C13 11 10 10 7 10"/><path d="M16 12 C19 9 22 8 25 8"/><path d="M16 19 C13.5 17 11 16.5 8.5 16.5"/><path d="M16 18 C18.5 16 21 15.5 23.5 15.5"/><path d="M16 27 C14 25.5 12 25 10 25"/><path d="M16 27 C18 25.5 20 25 22 25"/><circle cx="16" cy="5.5" r="1.6"/></svg>
        </button>
      )}
      <button
        className="aspect-fab"
        onClick={() => setShowAspects(!showAspects)}
        title="Aspect Attunement"
      >
        <svg viewBox="0 0 32 32"><path d="M16 3.5 C16 3.5 10 10.2 10 16.3 C10 22.3 13.4 25.8 16 27.3 C18.6 25.8 22 22.3 22 16.3 C22 10.2 16 3.5 16 3.5 Z"/><path d="M16 9.5 C13.8 13.2 13.8 18.4 16 23"/></svg>
      </button>
      {/* Left panel: Champion + Hall of Legends (collapsable) */}

      {showChampionPicker && (
        <div className="champion-picker-overlay" onClick={() => setShowChampionPicker(false)}>
          <div className="champion-picker" onClick={e => e.stopPropagation()}>
            <h3>Choose your champion</h3>
            <p className="quiet">Any of your Awokin can bear the title, wherever they stand. The champion's pieces pass into confluence victory births. The Hall is where champions are trained — fed and leveled.</p>
            <div className="champion-grid">
              {tenderItems.map(a => (
                <button key={a.id} className="champion-option"
                  onClick={async () => {
                    try {
                      await api.setChampion({ awakenedId: a.id });
                      const updated = await api.getLegends();
                      setLegends(updated);
                      setShowChampionPicker(false);
                    } catch (e: any) { alert(e.message); }
                  }}>
                  <img src={a.image_url} alt={a.name} />
                  <div>{a.name}</div>
                  <div className="champion-option-stats">{a.power}/{a.toughness} · Lv {a.level ?? 0}</div>
                </button>
              ))}
            </div>
            <button className="abtn small" onClick={() => setShowChampionPicker(false)}>Close</button>
          </div>
        </div>
      )}
      {returnReport && (
        <div className="return-report-overlay" onClick={() => setReturnReport(null)}>
          <div className="return-report" onClick={e => e.stopPropagation()}>
            <div className="return-report-label">Upon your return, an Awokin speaks:</div>
            <div className="return-report-text">"{returnReport.text}"</div>
            <button className="abtn small" onClick={() => setReturnReport(null)}>Tend on</button>
          </div>
        </div>
      )}
      {mood && (
        <div className="world-mood" title={mood.description}>
          🌙 {mood.mood.charAt(0).toUpperCase() + mood.mood.slice(1)}
        </div>
      )}
      {/* THE LIGHTHOUSE (Nigel, 2026-10-23): a small golden
          timer on the right-hand side of the screen. The bank
          is protection bought with kills (a minute per point
          of the felled dark's bonus above AC 10); the light
          is lit by hand, never by default, and while it burns
          the bank drains, Shadow Matter feeds its upkeep,
          nothing spawns, and the waves stand pushed back at
          intensity 1. Unlit, every weather change raises the
          waves. */}
      <div className={`lighthouse-panel${battle.lighthouseLit ? " lit" : ""}`}>
        <div className="lighthouse-head">{battle.lighthouseLit ? "🔆" : "🗼"} The Lighthouse</div>
        <div className="lighthouse-bank">
          {battle.lighthouseLit ? "Burning" : "Banked"}: {Math.floor(battle.protectionBankMs / 60000)} min of protection
        </div>
        <div className="lighthouse-shadow" title="Shadow Matter — feeds upkeep, never casting">
          ◈ {Math.floor(battle.shadowMatter)} Shadow Matter
        </div>
        <div className="lighthouse-waves">
          {battle.lighthouseLit ? "The waves are pushed back" : `Wave intensity ${battle.waveIntensity}`}
        </div>
        {battle.lighthouseLit && battle.shadowMatter < 1 && (
          <div className="lighthouse-warn">The hoard is empty — when the fuel is spent, the light gutters out.</div>
        )}
        <button
          className="abtn small"
          onClick={async () => {
            try {
              const r = await api.setLighthouse({ lit: !battle.lighthouseLit });
              setBattle(r.battle);
              await refreshTerritory();
            } catch (e) {
              showHexNotice(refusalText(e, "The lighthouse refused."));
            }
          }}
        >
          {battle.lighthouseLit ? "Douse the light" : "Light the lighthouse"}
        </button>
      </div>
      {showFriends && <Friends onClose={() => setShowFriends(false)} hand={hand} />}
      {!legends.champion && (
        <button className="champion-fab" onClick={() => setShowChampionPicker(true)} title="Choose your champion">
          <svg viewBox="0 0 32 32"><path d="M16 4 C17.2 11 21 14.8 28 16 C21 17.2 17.2 21 16 28 C14.8 21 11 17.2 4 16 C11 14.8 14.8 11 16 4 Z"/><circle cx="16" cy="16" r="1.7"/></svg>
        </button>
      )}
      <button className="friends-btn" onClick={() => setShowFriends(true)} title="Friends">
        🤝
      </button>
      {wave && (
        <div className="wave-panel">
          <div className="wave-comp">
            {wave.frayCount} Fray{wave.unravelers > 0 && ` + ${wave.unravelers} Unraveler${wave.unravelers > 1 ? "s" : ""}`}
            {" "}· Power {wave.totalPower}
          </div>

          {waveResult && (
            <div className={`wave-result ${waveResult.victory ? "victory" : "defeat"}`}>
              {waveResult.victory
                ? `Victory! The Unraveling breaks. (${waveResult.defensePower} vs ${waveResult.wavePower})`
                : `The line bends... (${waveResult.defensePower} vs ${waveResult.wavePower})`}
            </div>
          )}
        </div>
      )}
      {incursionsQ.data && eyeOpen && (() => {
        const inc = incursionsQ.data;
        const nowMs = Date.now();
        const eyeWord = inc.eye >= 100 ? "Under investigation" : inc.eye >= 60 ? "Drawing attention" : inc.eye >= 25 ? "Stirring" : "Hidden";
        return (
          <div className="curse-eye-panel">
            <div className="curse-eye-head">
              <span className="curse-eye-glyph">👁</span>
              <span className="curse-eye-name">The Curse's Eye — {eyeWord}</span>
              <div className="curse-eye-bar"><div className="curse-eye-fill" style={{ width: `${Math.min(100, inc.eye)}%` }} /></div>
              <span className="curse-eye-num">{inc.eye}</span>
            </div>
            {inc.columns.map(col => {
              const call = (callsQ.data?.calls ?? []).find(c => c.column_id === col.id);
              const keyStr = call?.join_key ? ` Key: ${call.join_key}` : "";
              const invite = col.kind === "siege"
                ? `⚔️ SIEGE — a force of ${col.size} holds my land. Friends: open the Table, enter my SIEGE key, call your Awokin, and help me take it back.${keyStr}`
                : call?.kind === "ambush"
                  ? `⚔️ AMBUSH CALLED — a ${col.kind} of ${col.size} reaches my ${col.targetKind === "seed" ? "fallen seed" : "edge"} in ${fmtCountdown(col.arrivesAt - nowMs)}. Friends: open the Table, enter my AMBUSH key, and muster BEFORE it lands — warned ahead, our Awokin strike with the ambush's edge.${keyStr}`
                  : `⚔️ BASTION — a ${col.kind} of ${col.size} is at my ${col.targetKind === "seed" ? "seed" : "edge"}. Friends: open the Table, enter my BASTION key, call your Awokin, and hold the tide with me.${keyStr}`;
              return col.state === "marching" ? (
              <div key={col.id} className="curse-eye-line warn">
                ⚠ ATTACK INCOMING — a {col.kind === "siege" ? "SIEGE" : "raid"} of {col.size} walks for your {col.targetKind === "seed" ? "fallen seed" : "edge"} — here in {fmtCountdown(col.arrivesAt - nowMs)}. Move your companies to meet it.
                {!call && <button className="abtn small" onClick={() => void handleCallToArms({ columnId: col.id })}>📣 Call to arms — warn your friends</button>}
                {call && <div className="curse-eye-invite">📣 {call.kind.toUpperCase()} called — carry it to Discord: <em>{invite}</em> Then open the Table together and claim the call.</div>}
              </div>
            ) : (
              <div key={col.id} className="curse-eye-line here">
                🔥 THE {col.kind === "siege" ? "SIEGE" : "RAID"} IS HERE — {col.size} dark stand at your {col.targetKind === "seed" ? "seed" : "edge"}.
                <button className="abtn small" onClick={() => startColumnBattle(col)}>⚔ Face them</button>
                {!call && <button className="abtn small" onClick={() => void handleCallToArms({ columnId: col.id })}>📣 Call to arms</button>}
                {call && <div className="curse-eye-invite">📣 {call.kind.toUpperCase()} called — carry it to Discord: <em>{invite}</em> Then open the Table together and claim the call.</div>}
              </div>
            );
            })}
            {inc.columns.length === 0 && inc.breakUntil > nowMs && (
              <div className="curse-eye-line rest">The land rests — the Eye cannot send another for {fmtCountdown(inc.breakUntil - nowMs)}.</div>
            )}
            {inc.columns.length === 0 && inc.breakUntil <= nowMs && inc.eye >= 25 && (
              <div className="curse-eye-line warn">The Eye is lit — a column is gathering beyond the edge.</div>
            )}
            {seedsQ.data && seedsQ.data.seeds.filter(sd => sd.state === "corrupted").map(sd => {
              const call = (callsQ.data?.calls ?? []).find(c => c.seed_id === sd.id);
              return (
                <div key={sd.id} className="curse-eye-line here">
                  💀 A cursed bastion stands on your land — the seed that was, is theirs.
                  {!call && <button className="abtn small" onClick={() => void handleCallToArms({ seedId: sd.id })}>📣 Call a SIEGE</button>}
                  {call && <div className="curse-eye-invite">📣 SIEGE called — carry it to Discord: <em>⚔️ SIEGE — a cursed bastion stands on my land, and we take it back. Friends: open the Table, enter my SIEGE key, call your Awokin, and help in the taking — this one wants many hands, and the dark will not give it up gently.{call.join_key ? ` Key: ${call.join_key}` : ""}</em></div>}
                </div>
              );
            })}
            {seedsQ.data && seedsQ.data.seeds.some(sd => sd.state === "fallen") && (
              <div className="curse-eye-line">⭐ {seedsQ.data.seeds.filter(sd => sd.state === "fallen").length} seed{seedsQ.data.seeds.filter(sd => sd.state === "fallen").length > 1 ? "s lie" : " lies"} fallen on your land — fetch or hold them before the dark does. Open a seed's hex in the War-Grounds to choose.</div>
            )}
            <div className="curse-eye-line" style={{ marginTop: 8 }}>
        {!battleActive && wavesCleared < 3 && wave && (() => {
          // Wave recovery (fix list #4): after a victory the next wave
          // gathers for a while — show the wait instead of inviting a
          // fight the server would refuse.
          const readyMs = wave.nextWaveAt ? new Date(wave.nextWaveAt).getTime() - Date.now() : 0;
          if (readyMs > 0) {
            const mins = Math.ceil(readyMs / 60000);
            const label = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`;
            return (
              <button className="abtn" disabled style={{ marginLeft: 8, borderColor: "#666", opacity: 0.75 }}>
                🌑 Next Unraveling in {label}
              </button>
            );
          }
          return (
            <button className="abtn" onClick={startBattle} style={{ marginLeft: 8, borderColor: "#ff4444" }}>
              ⚔ Face the Next Unraveling ({wavesCleared + 1}/3)
            </button>
          );
        })()}
            </div>
          </div>
        );
      })()}
      {bastionOpen && bastionQ.data && (() => {
        const bv = bastionQ.data;
        const itemOf = (id: number) => tenderItems.find(a => a.id === id);
        const faceLine = (f: { name: string; power: number; toughness: number; level: number | null }) =>
          `${f.name} · Lv ${f.level ?? "?"} · ⚔ ${f.power} · 🛡 ${f.toughness}`;
        return (
          <div className="curse-eye-panel">
            <div className="curse-eye-head">
              <span className="curse-eye-glyph">🏯</span>
              <span className="curse-eye-name">The Bastion — the staging hall</span>
            </div>
            {!bv.bastion && (
              <div className="curse-eye-line">No bastion stands yet. Hold a fallen seed — raise its bastion from the seed's hex in the War-Grounds — and this hall opens: Awokin stage here, the field is sent home here, and instances depart from here.</div>
            )}
            {bv.bastion && (<>
              <div className="curse-eye-line">🏯 A held seed of level {bv.bastion.level} stands at ({bv.bastion.q}, {bv.bastion.r}) — a bastion raised before the enemy arrives lends you and your Awokin <strong>+3 AC</strong> against them.</div>
              <div className="curse-eye-line"><strong>Staged — reinforcements waiting</strong> ({bv.staged.length})</div>
              {bv.staged.map(s => (
                <div key={s.awakenedId} className="curse-eye-line">
                  {faceLine(s)} <span className="quiet">— came by {s.via === "hand" ? "the hand" : s.via === "field" ? "your side" : "the lone road"}</span>
                  <button className="abtn small" style={{ marginLeft: 8 }} onClick={() => void bastionAct(() => api.unstageAwokin({ awakenedId: s.awakenedId, toField: true }), `${s.name} musters onto the bastion's hex.`)}>⚔ Muster to the field</button>
                  <button className="abtn small" style={{ marginLeft: 4 }} onClick={() => void bastionAct(() => api.unstageAwokin({ awakenedId: s.awakenedId }), `${s.name} steps back into your hand's play.`)}>Unstage</button>
                </div>
              ))}
              {bv.staged.length === 0 && <div className="curse-eye-line quiet">None staged. Stage from the hand below — the staged company is who an instance carries.</div>}
              <div className="curse-eye-line">
                {bv.instanceCall
                  ? <>🚪 The instance stands open — carry its key to the Table: <strong>{bv.instanceCall.joinKey}</strong> <span className="quiet">Open the Table, enter the key, and claim the call — you will be seated with the staged company in hand.</span></>
                  : <button className="abtn small" disabled={bv.staged.length === 0} onClick={() => void bastionAct(() => api.createBastionInstance(), "The instance is made — carry its key to the Table.")}>🚪 Create an instance from the staged company</button>}
              </div>
              <div className="curse-eye-line"><strong>The hand of twenty</strong> ({bv.hand.ids.length}/{bv.hand.cap}) — only the hand takes the field and the Table</div>
              {bv.hand.ids.map(id => {
                const it = itemOf(id);
                const placed = placedIds.has(id);
                const staged = bv.staged.some(s => s.awakenedId === id);
                return (
                  <div key={id} className="curse-eye-line">
                    {it ? `${it.name} · ⚔ ${it.power} · 🛡 ${it.toughness}` : `Awokin #${id}`}
                    {placed && <span className="quiet"> — on the field</span>}
                    {staged && <span className="quiet"> — staged above</span>}
                    {!staged && !placed && <button className="abtn small" style={{ marginLeft: 8 }} onClick={() => void bastionAct(() => api.stageAwokin({ awakenedId: id }), `${it?.name ?? "The Awokin"} stages at the bastion.`)}>🏯 Stage</button>}
                    <button className="abtn small" style={{ marginLeft: 4 }} onClick={() => void bastionAct(() => api.setHandMember({ awakenedId: id, inHand: false }), `${it?.name ?? "The Awokin"} waits in reserve now.`)}>To reserve</button>
                  </div>
                );
              })}
              {bv.field.length > 0 && <div className="curse-eye-line"><strong>On the field</strong> — send them home to the bastion</div>}
              {bv.field.map(f => (
                <div key={f.awakenedId} className="curse-eye-line">
                  {faceLine(f)} <span className="quiet">— {f.follow ? "follows you: rides home in your company, by clean roads" : "not following: the lone road, slow through the curse"}</span>
                  <button className="abtn small" style={{ marginLeft: 8 }} disabled={f.marching} onClick={() => void bastionAct(() => api.sendToBastion({ awakenedId: f.awakenedId }), `${f.name} is sent to the bastion.`)}>{f.marching ? "On the march…" : "🏯 Send to the bastion"}</button>
                </div>
              ))}
              {bv.reserveIds.length > 0 && <div className="curse-eye-line"><strong>In reserve</strong> — the deck keeps them all</div>}
              {bv.reserveIds.map(id => {
                const it = itemOf(id);
                return (
                  <div key={id} className="curse-eye-line">
                    {it ? `${it.name} · ⚔ ${it.power} · 🛡 ${it.toughness}` : `Awokin #${id}`}
                    <button className="abtn small" style={{ marginLeft: 8 }} disabled={bv.hand.ids.length >= bv.hand.cap} onClick={() => void bastionAct(() => api.setHandMember({ awakenedId: id, inHand: true }), `${it?.name ?? "The Awokin"} rises into your hand.`)}>Bring into hand</button>
                  </div>
                );
              })}
            </>)}
          </div>
        );
      })()}
      <div className="territory-battle-trigger">
        {wavesCleared >= 3 && (
          <button className="abtn battle-cta" onClick={() => {
            setIsBossFight(true);
            // Boss level = the server's next boss (getBossState, asked
            // inside handleDefend) — no local count is kept anymore.
            handleDefend(true);
          }} style={{ borderColor: "#ffd700" }}>
            👑 BOSS FIGHT
          </button>
        )}
        {battleActive && (
          <span style={{ marginLeft: 8 }}>
            <button className="abtn small" onClick={() => setBattlePaused(p => !p)} title={battlePaused ? "Resume" : "Pause"}>
              {battlePaused ? "▶" : "⏸"}
            </button>
            <button className={`abtn small ${battleManual ? "active" : ""}`} onClick={() => setBattleManual(m => !m)} title={battleManual ? "Auto battle" : "Manual step-through"} style={{ marginLeft: 4 }}>
              {battleManual ? "⏭ Manual" : "▶ Auto"}
            </button>
            {battleManual && (
              <button className="abtn small" onClick={() => { doInitiativePhase(); setTimeout(() => endTurn(), 50); }} title="Next attack" style={{ marginLeft: 4 }}>
                → Step
              </button>
            )}
            <button className="abtn small" onClick={() => setBattleSpeed(s => s === 1.3 ? 0.6 : s === 0.6 ? 2.5 : 1.3)} title="Battle speed" style={{ marginLeft: 4 }}>
              {battleSpeed === 0.6 ? "2x" : battleSpeed === 2.5 ? "0.5x" : "1x"}
            </button>
          </span>
        )}

        {incursionsQ.data && (() => {
          const inc = incursionsQ.data;
          const eyeWord = inc.eye >= 100 ? "Under investigation" : inc.eye >= 60 ? "Drawing attention" : inc.eye >= 25 ? "Stirring" : "Hidden";
          const danger = inc.eye >= 60 || inc.columns.length > 0;
          return (
            <button className={`abtn eye-toggle${danger ? " warn" : ""}`} onClick={() => setEyeOpen(v => !v)} style={{ marginLeft: 8 }} title="The Curse's Eye — open it to see how in danger of attack your land stands">
              <svg className="eye-glyph" viewBox="0 0 32 32"><path d="M3 16 C7.5 9.5 12 6.5 16 6.5 C20 6.5 24.5 9.5 29 16 C24.5 22.5 20 25.5 16 25.5 C12 25.5 7.5 22.5 3 16 Z"/><circle cx="16" cy="16" r="5"/><circle className="pupil" cx="16" cy="16" r="1.8"/><path d="M10 4.8 L11.2 7"/><path d="M22 4.8 L20.8 7"/><path d="M16 2.8 V5.3"/></svg> The Eye — {eyeWord}
              <span className="curse-eye-bar mini"><span className="curse-eye-fill" style={{ width: `${Math.min(100, inc.eye)}%` }} /></span>
              {inc.eye}
            </button>
          );
        })()}
        <button className={`abtn eye-toggle${bastionQ.data?.bastion ? "" : " warn"}`} onClick={() => setBastionOpen(v => !v)} style={{ marginLeft: 8 }} title="The Bastion — stage your Awokin, send the field home to it, and create an instance to travel to">
          🏯 The Bastion{bastionQ.data?.staged.length ? ` — ${bastionQ.data.staged.length} staged` : ""}
        </button>
        {wavesCleared >= 3 && wave && (
          <span style={{ marginLeft: 12, color: "#ffd700", fontWeight: "bold" }}>
            All Unravelings broken — Boss awaits!
          </span>
        )}
        {battleActive && (
          <span style={{ marginLeft: 12, color: "#ff6666", fontWeight: "bold" }}>
            Unraveling {battleWave}/3 — Turn {turnNumber} ({turnPhase === "towers" ? "Towers" : turnPhase === "initiative" ? "Initiative" : "..."})
          </span>
        )}
        {simActive && (
          <button className="abtn small" onClick={stopSim} style={{ marginLeft: 8 }}>
            ⏹ Stop Sim
          </button>
        )}
      </div>

      {/* The centre-screen attune card stood here until
          2026-10-21 — retired by the Attune Ability law
          (Nigel: Attune is an ABILITY on the wheel, and the
          card rode centre-board under the movement
          tutorial): the wheel's Ability → Attune branch is
          the only door now, its taps naming their tile, its
          reach the hex and its ring. The ground's own
          reckoning — its element, its bank, its tray — is
          still drawn on the map itself, where it always was. */}

      <div className="territory-map"
        onPointerDown={(e) => {
          // Modality follows the actual input (#13 refined): a touch
          // raises mist + confirm; a mouse glows on hover and commits
          // on click. Pens count as touch — they tap like fingers.
          setTouchMode(e.pointerType !== "mouse");
          if (e.pointerType === "mouse") {
            // THE BUTTON LAW (Nigel, 2026-10-23): on a mouse the
            // buttons divide the drags — the LEFT hand chooses
            // (the band), the MIDDLE hand moves the screen, and
            // the RIGHT hand only ever clicks (the wheel, casts,
            // orders; the svg's own handlers keep its measure).
            // No tab gates the split: the War-Grounds' open state
            // no longer chooses what a mouse drag does.
            if (e.button === 2) return;
            if (e.button === 1) {
              e.preventDefault(); // a middle press must not wake the browser's autoscroll
              panDragRef.current = { cx: e.clientX, cy: e.clientY, panX: pan.x, panY: pan.y, moved: false };
              return;
            }
            // The left hand's choosing drag. (The March order's
            // line is the right hand's drag, kept by the svg's
            // own handlers below.)
            const p = svgPoint(e.clientX, e.clientY);
            if (p) bandRef.current = { cx: e.clientX, cy: e.clientY, sx: p.x, sy: p.y, active: false };
            return;
          }
          // THE DRAG LAW for a finger (Nigel, 2026-10-16 — touch
          // is untouched by the button law): a drag MOVES THE
          // SCREEN — until the War-Grounds are opened; while
          // they are open, the same drag draws the choosing
          // band instead.
          if (wgTileId !== null) {
            const p = svgPoint(e.clientX, e.clientY);
            if (p) bandRef.current = { cx: e.clientX, cy: e.clientY, sx: p.x, sy: p.y, active: false };
          } else {
            panDragRef.current = { cx: e.clientX, cy: e.clientY, panX: pan.x, panY: pan.y, moved: false };
          }
        }}
        onPointerMove={(e) => {
          const b = bandRef.current;
          if (b) {
            if (!b.active && Math.hypot(e.clientX - b.cx, e.clientY - b.cy) < 9) return;
            b.active = true;
            const p = svgPoint(e.clientX, e.clientY);
            if (p) setBand({ x0: b.sx, y0: b.sy, x1: p.x, y1: p.y });
            return;
          }
          const pd = panDragRef.current;
          if (pd) {
            const dx = e.clientX - pd.cx, dy = e.clientY - pd.cy;
            if (Math.hypot(dx, dy) > 3) pd.moved = true;
            if (pd.moved) setPan({ x: pd.panX + dx, y: pd.panY + dy });
          }
        }}
        onPointerUp={(e) => {
          const pd = panDragRef.current;
          panDragRef.current = null;
          if (pd?.moved) bandClosedAt.current = Date.now(); // a screen-drag's release-click is not a tap
          const b = bandRef.current;
          bandRef.current = null;
          if (!b?.active || !band) return;
          const x0 = Math.min(band.x0, band.x1), x1 = Math.max(band.x0, band.x1);
          const y0 = Math.min(band.y0, band.y1), y1 = Math.max(band.y0, band.y1);
          setBand(null);
          bandClosedAt.current = Date.now();
          // The wardens inside the band are chosen. A MARCHER is
          // caught by where it stands on its road (the same road +
          // clock derivation the map draws); a STANDING figure by
          // its own standing point (Nigel, 2026-10-23 — the band
          // gathers Awoken where they stand, never by a centre
          // borrowed from their tile); the patrolling by their
          // post, as ever.
          const chosen: number[] = [];
          const bandSize = HEX_BASE_SIZE * zoom; // the render block's own measure
          const centerOf = (t: TerritoryTile) => {
            const { px, py } = isoOffset(t.q, t.r, bandSize);
            return { cx: 250 + px + pan.x, cy: 170 + py + pan.y - (Math.max(1, t.height || 1) - 1) * Math.round(bandSize * 0.2) };
          };
          for (const p of placements) {
            const t = tiles.find(tt => tt.id === p.tileId);
            if (!t) continue;
            let anchor = centerOf(t);
            let onRoad = false;
            const road = marchRoadOf(p).map(id => tiles.find(tt => tt.id === id)).filter(Boolean) as TerritoryTile[];
            if (road.length >= 2 && p.marchSince && p.marchEnds && p.marchEnds > p.marchSince) {
              const centers = road.map(centerOf);
              // The same cursed weighting the walker's drawn
              // place uses (a segment into cursed ground takes
              // twice its share of the hour).
              const total = centers.reduce((s, c, i) => i === 0 ? 0 : s + Math.hypot(c.cx - centers[i - 1].cx, c.cy - centers[i - 1].cy) * (road[i].cursed ? 2 : 1), 0);
              if (total > 0) {
                onRoad = true;
                let d = Math.min(1, Math.max(0, (Date.now() - p.marchSince) / (p.marchEnds - p.marchSince))) * total;
                for (let i = 0; i < centers.length - 1; i++) {
                  const len = Math.hypot(centers[i + 1].cx - centers[i].cx, centers[i + 1].cy - centers[i].cy) * (road[i + 1].cursed ? 2 : 1);
                  if (d <= len) { const k = len ? d / len : 0; anchor = { cx: centers[i].cx + (centers[i + 1].cx - centers[i].cx) * k, cy: centers[i].cy + (centers[i + 1].cy - centers[i].cy) * k }; break; }
                  d -= len;
                  anchor = centers[centers.length - 1];
                }
              }
            }
            if (!onRoad && p.posQ != null && p.posR != null) {
              const dp = isoOffset(p.posQ, p.posR, bandSize);
              const dc = isoOffset(t.q, t.r, bandSize);
              anchor = { cx: anchor.cx + (dp.px - dc.px), cy: anchor.cy + (dp.py - dc.py) };
            }
            if (anchor.cx >= x0 && anchor.cx <= x1 && anchor.cy >= y0 && anchor.cy <= y1) chosen.push(p.awakenedId);
          }
          if (chosen.length === 1) {
            // One caught: ITS orders wheel, where the band's
            // release falls (Nigel, 2026-10-22).
            setSelectedGroup([]);
            setSelectedAwoken(chosen[0]);
            setOrdersWheel({ ids: [chosen[0]], x: e.clientX, y: e.clientY });
          } else if (chosen.length > 1) {
            // The company's wheel: ONE wheel for the whole
            // selection — March · Attack · Defend · Follow.
            setSelectedAwoken(null);
            setSelectedGroup(chosen);
            setOrdersWheel({ ids: chosen, x: e.clientX, y: e.clientY });
          }
        }}
        onClick={() => {
        if (bandJustClosed()) return; // the band's own click is not a dismissal
        // Clicking empty map dismisses the choosing
        setSelectedAwoken(null);
        setSelectedGroup([]);
        setAttackTargeting(false);
        setMoveTargeting(false);
        setTargetHexId(null);
        clearHexConfirm();
      }}>
        <svg ref={svgRef} viewBox="0 0 500 340" className="territory-svg" style={{ width: "100%", height: "100%" }}
          onContextMenu={(e) => e.preventDefault()}
          onMouseDown={(e) => {
            if (e.button === 2) { // Right press
              // THE LINE (Nigel, 2026-10-22 — the marching-
              // orders spec; its hand confirmed 2026-10-23):
              // while a March order is armed, a right-drag
              // draws the line the selection will stand along.
              // No tab gates the gesture — the armed order is
              // the gate, as on every ground.
              if (pendingMarch) {
                const p = svgPoint(e.clientX, e.clientY);
                if (p) {
                  lineDragRef.current = { sx: p.x, sy: p.y };
                  setLineDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
                  linePressRef.current = { x: e.clientX, y: e.clientY, moved: false };
                  return;
                }
              }
              // THE CLICK LAW (Nigel, 2026-10-23): the right
              // hand never casts and never drags the screen —
              // its plain press is only measured, so the
              // release can tell a click from a drag. A moved
              // press is simply spent; an unmoved one cancels
              // a readied working or calls the wheel.
              rightPressRef.current = { x: e.clientX, y: e.clientY, moved: false };
            }
          }}
          onMouseMove={(e) => {
            const rp = rightPressRef.current;
            if (rp && (e.buttons & 2) && Math.hypot(e.clientX - rp.x, e.clientY - rp.y) > 6) rp.moved = true;
            if (lineDragRef.current) {
              if (linePressRef.current && Math.hypot(e.clientX - linePressRef.current.x, e.clientY - linePressRef.current.y) > 6) linePressRef.current.moved = true;
              const p = svgPoint(e.clientX, e.clientY);
              if (p) setLineDrag(ld => ld ? { ...ld, x1: p.x, y1: p.y } : ld);
            }
          }}
          onMouseUp={(e) => {
            if (e.button === 2) {
              // A drawn line with a March order armed is the
              // order itself: the selection spreads EVENLY
              // along it, at once, no confirm.
              if (lineDragRef.current) {
                const ld = lineDrag;
                const wasMoved = !!linePressRef.current?.moved;
                lineDragRef.current = null;
                linePressRef.current = null;
                setLineDrag(null);
                if (wasMoved && ld && pendingMarch) {
                  const ids = pendingMarch.ids;
                  setPendingMarch(null);
                  setSelectedGroup([]);
                  void fireLineMarch(ids, { x: ld.x0, y: ld.y0 }, { x: ld.x1, y: ld.y1 });
                }
                return;
              }
              // A right CLICK — pressed and released unmoved.
              // THE CLICK LAW (Nigel, 2026-10-23): the right
              // hand never casts. While a working stands
              // readied, the first right-click CANCELS it —
              // the run is set down and no wheel opens; the
              // NEXT right-click opens the wheel, as an
              // unarmed right-click does (Nigel, 2026-10-19:
              // the wheel where the hand rests, even mid-
              // glide). A right DRAG is simply spent: it
              // neither cancels nor calls. This replaces the
              // 2026-10-22 carve-out that let an armed caster
              // re-pick on the wheel with the same click.
              const rp = rightPressRef.current;
              rightPressRef.current = null;
              if (rp && !rp.moved && tenderStandRef.current) {
                if (castMode) { endMapCastRunRef.current(); return; }
                if (!tenderInputBlockedRef.current) {
                  const p = svgPoint(e.clientX, e.clientY);
                  if (p) { setTenderRadial(p); }
                }
              }
            }
          }}
          onMouseLeave={() => { lineDragRef.current = null; linePressRef.current = null; setLineDrag(null); }}>
          <defs>
            <radialGradient id="corruptionHalo" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(96,4,18,0)" />
              <stop offset="58%" stopColor="rgba(96,4,18,0.10)" />
              <stop offset="80%" stopColor="rgba(52,2,10,0.55)" />
              <stop offset="100%" stopColor="rgba(52,2,10,0)" />
            </radialGradient>
          </defs>
          {renderGrid()}
          {/* Simulation units */}
          {battleUnits.map(u => {
            const imgSrc = u.type === "fray" ? frayFaceSrc(enemyArtData?.art, Date.now()) : enemyImgFor(u.type, enemyArtData?.art);
            return (
            <g key={`battle-${u.id}`} transform={`translate(${u.x},${u.y})`}>
              {imgSrc ? (
                <image href={imgSrc} x="-12" y="-12" width="24" height="24" />
              ) : (
                <circle r="8" fill="#3a1a1a" stroke="#ff4444" strokeWidth="1.5" />
              )}
              <rect x="-10" y="-14" width="20" height="3" fill="#333" />
              <rect x="-10" y="-14" width={20 * (u.hp / u.maxHp)} height="3" fill="#ff4444" />
            </g>
            );
          })}
          {simUnits.map(u => (
            <g key={`sim-${u.id}`} transform={`translate(${u.x},${u.y})`}>
              <circle r={8} fill={u.type === "unraveler" ? "#1a0a2a" : "#2a1a0a"} stroke="#ff4444" strokeWidth={1.5} opacity={0.9} />
              <text textAnchor="middle" dy={3} fontSize={8}>{u.type === "unraveler" ? "🌀" : "💥"}</text>
              {/* HP bar */}
              <rect x={-10} y={-14} width={20} height={3} fill="#333" />
              <rect x={-10} y={-14} width={20 * (u.hp / u.maxHp)} height={3} fill={u.hp / u.maxHp > 0.5 ? "#4f4" : "#f44"} />
            </g>
          ))}
        </svg>
        {/* THE TENDER CONTROLLER (Nigel, 2026-10-19): popped by
            tapping the Tender himself on a touch hand — the
            glide pad on the left driving the stride engine's
            own held-keys, the wheel's button beside it. A
            separate overlay, so the compass zoom and the map
            stay live under the other hand while he walks. */}
        {tenderCtl && tenderStand && (
          <div className="tender-controller" role="group" aria-label="Tender controller">
            <div className="tender-pad"
              onPointerDown={(e) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture is a courtesy */ } onPadVec(e); }}
              onPointerMove={(e) => { if (e.buttons & 1) onPadVec(e); }}
              onPointerUp={padClear}
              onPointerCancel={padClear}>
              <div className="tender-pad-knob" style={{ transform: `translate(${padKnob.x}px, ${padKnob.y}px)` }} />
            </div>
            <div className="tender-ctl-side">
              <button type="button" className="tender-ctl-btn" aria-label="Open the Tender's wheel"
                onClick={() => { if (tenderFig) { setTenderRadial({ x: tenderFig.x, y: tenderFig.y }); } }}>✦</button>
              <button type="button" className="tender-ctl-btn" aria-label="Leap — Space's own verb, under the thumb"
                onClick={() => pressTenderJump()}>⤒</button>
              <button type="button" className="tender-ctl-btn small" aria-label="Put the controller away"
                onClick={() => { padClear(); setTenderCtl(false); }}>✕</button>
            </div>
          </div>
        )}
        {/* THE WHEEL, RESTORED (Nigel, 2026-10-20): the
            Proving Ground's radial itself — six branches on
            the outer ring, the open branch's entries fanned
            on the inner, the Weapon a sub-ring under the
            Ability — drawn as a screen overlay at the bloom
            point, in the Ground's own geometry and dress.
            Its entries run this ground's own acts; nothing
            here casts, wields or orders of its own. */}
        {tenderRadial && tenderStand && (() => {
          const pt = wheelClientPoint();
          if (!pt) return null;
          return (
            <GroundWheel cx={pt.x} cy={pt.y} tab={wheelTab} onTab={setWheelTab}
              entries={buildWheelEntries()} caption={wheelCaption()}
              pinnedKeys={hotbarKeys} onTogglePin={toggleHotbar} onDropKey={dropToHotbar}
              onClose={() => setTenderRadial(null)} />
          );
        })()}
        {/* THE ORDERS WHEEL (Nigel, 2026-10-22): one Awokin's
            own wheel on its click, the company's wheel on a
            drag-chosen band's release — the orders bar and
            the under-figure picker are retired behind it. */}
        {ordersWheel && (() => {
          const entries = buildOrdersEntries(ordersWheel.ids);
          if (!entries.length) return null;
          const single = ordersWheel.ids.length === 1
            ? placements.find(p => p.awakenedId === ordersWheel.ids[0])
            : null;
          return (
            <GroundWheel cx={ordersWheel.x} cy={ordersWheel.y} tab="awoken" onTab={() => {}}
              entries={entries}
              caption={single
                ? `${single.name} — its orders: pick one and it is obeyed; March arms the tap on the land`
                : `The company — ${ordersWheel.ids.length} chosen: March · Attack · Defend · Follow, obeyed at once`}
              pinnedKeys={[]} onTogglePin={() => {}} onDropKey={() => {}}
              onClose={() => setOrdersWheel(null)} ordersMode />
          );
        })()}
        {/* THE HOTBAR: the wheel's live entries, locked. A tap
            runs the entry's own act (the wield, the toggle,
            the locator); a right-click looses the slot. While
            the wheel stands open the belt shows itself (with
            a dashed landing slot) so an entry can be dragged
            onto it, as the Ground teaches. */}
        {tenderStand && (hotbarKeys.length > 0 || tenderRadial) && (
          <div className={`tender-hotbar${touchForm ? " touch" : ""}`} role="toolbar" aria-label="Your hotbar" data-groundwheel-hotbar="territory">
            {hotbarKeys.map(key => {
              if (key.startsWith("wp-") && WEAPONS[key.slice(3) as WeaponKey]) {
                const wk = key.slice(3) as WeaponKey;
                const wielded = tenderStand.weaponKey === wk;
                return (
                  <button type="button" key={key} className={`tender-slot${wielded ? " lit" : ""}`}
                    title={`${WEAPONS[wk].name} — tap to wield (right-click to loose the slot)`}
                    onClick={() => actTerritorySlot(key)}
                    onContextMenu={(e) => { e.preventDefault(); toggleHotbar(key); }}>
                    <img src={weaponImg(wk)} alt="" />
                    <span className="tender-slot-label">{WEAPONS[wk].name.split(" ")[0]}</span>
                  </button>
                );
              }
              if (key === "findme") {
                return (
                  <button type="button" key={key} className="tender-slot"
                    title="Find me — the camera swings to your Tender (right-click to loose the slot)"
                    onClick={() => actTerritorySlot(key)}
                    onContextMenu={(e) => { e.preventDefault(); toggleHotbar(key); }}>
                    <span className="tender-slot-emoji">🧭</span>
                    <span className="tender-slot-label">Find me</span>
                  </button>
                );
              }
              if (key.startsWith("follow-")) {
                const pid = Number(key.slice(7));
                const p = placements.find(x => x.id === pid) ?? null;
                return (
                  <button type="button" key={key} className={`tender-slot${!p ? " dim" : ""}${p?.follow ? " lit" : ""}`}
                    title={p ? `${p.name} — ${p.follow ? "following you; tap to loose them" : "tap to call them to follow"} (right-click to loose the slot)` : "That Awokin no longer stands — tap to loose the slot"}
                    onClick={() => actTerritorySlot(key)}
                    onContextMenu={(e) => { e.preventDefault(); toggleHotbar(key); }}>
                    <span className="tender-slot-emoji">👣</span>
                    <span className="tender-slot-label">{p ? p.name.split(" ")[0] : "gone"}</span>
                  </button>
                );
              }
              if (key.startsWith("sum-")) {
                // A keyed summon (the summoning fix): the tap
                // IS the cast — the Awokin stands at the
                // Tender's side, or the call falters and the
                // price is spent.
                const c = summoning.company.find(x => x.awakenedId === Number(key.slice(4))) ?? null;
                return (
                  <button type="button" key={key} className={`tender-slot${!c ? " dim" : ""}`}
                    title={c ? `${c.name} — ✦${c.cost}; tap to cast the summon: it stands at your side (right-click to loose the slot)` : "That Awokin cannot be called now — tap to loose the slot"}
                    onClick={() => actTerritorySlot(key)}
                    onContextMenu={(e) => { e.preventDefault(); toggleHotbar(key); }}>
                    {c?.imageUrl ? <img src={c.imageUrl} alt="" /> : <span className="tender-slot-emoji">✦</span>}
                    <span className="tender-slot-label">{c ? c.name.split(" ")[0] : "gone"}</span>
                  </button>
                );
              }
              if (key.startsWith("cast-")) {
                // A pinned working (Homeland Casting): the tap
                // readies the spell in the hand's cast mode —
                // the same door the wheel and the book open —
                // and the placing is tapped out on the land.
                const spellKey = key.slice(5);
                const sp = grim?.spells.find(x => x.key === spellKey) ?? null;
                const readied = !!sp && castSpellKey === sp.key && castMode;
                return (
                  <button type="button" key={key} className={`tender-slot${!sp ? " dim" : ""}${readied ? " lit" : ""}`}
                    title={sp ? `${sp.forms[castHueFor(sp)] ?? sp.name} — ✦${sp.cost}; ${readied ? "readied; tap the land to cast, or tap here to unready" : "tap to ready, then tap the land to cast"} (right-click to loose the slot)` : "That page is no longer in the book — tap to loose the slot"}
                    onClick={() => actTerritorySlot(key)}
                    onContextMenu={(e) => { e.preventDefault(); toggleHotbar(key); }}>
                    <span className="tender-slot-emoji">✦</span>
                    <span className="tender-slot-label">{sp ? (sp.forms[castHueFor(sp)] ?? sp.name).split(" ")[0] : "loose"}</span>
                  </button>
                );
              }
              return (
                <button type="button" key={key} className="tender-slot dim" title="A locked thing this land no longer knows — tap to loose the slot"
                  onClick={() => actTerritorySlot(key)}>
                  <span className="tender-slot-emoji">✦</span>
                  <span className="tender-slot-label">loose</span>
                </button>
              );
            })}
            {tenderRadial && hotbarKeys.length < HOTBAR_MAX && <span className="gw-drop-slot" aria-hidden="true">＋</span>}
          </div>
        )}
      </div>
      {hexNotice && (
        <div className="hex-notice" role="alert" aria-live="polite">
          <p>{hexNotice}</p>
        </div>
      )}
      {hexConfirm && (() => {
        // The touch confirm (fix list #13 refined): the misted hex is
        // only a promise until the Tender speaks here.
        const tile = tiles.find(t => t.id === hexConfirm.tileId);
        const actor = selectedAwoken !== null ? tenderItems.find(a => a.id === selectedAwoken) : undefined;
        // Strike and move are a STANDING Awokin's acts: its name
        // rides its placement (served at the source); the studio
        // card is only the fallback read, for its power.
        const actorName = (selectedAwoken !== null ? placements.find(p => p.awakenedId === selectedAwoken)?.name : undefined) ?? actor?.name;
        let text = "";
        let confirmLabel = "Confirm";
        if (hexConfirm.kind === "attack") {
          text = `${actorName} will strike this cursed hex — its thorns answer back.`;
          confirmLabel = "Strike";
        } else if (hexConfirm.kind === "move") {
          text = `${actorName} will move to this hex — ${actor ? moveCost(actor.power) : 1}✦.`;
          confirmLabel = "Move";
        } else {
          const pooled = battlePool.map(id => hand.find(a => a.id === id)).filter(Boolean) as Awakened[];
          const names = pooled.map(a => a.name).join(", ");
          const cost = pooled.reduce((sum, a) => sum + deployCost(a.power), 0);
          text = `${names || "The readied company"} will assault this cursed hex — if their combined power breaks the corruption, the land becomes yours. ${cost}✦.`;
          confirmLabel = "Send them";
        }
        return (
          <div className="hex-confirm" role="dialog" aria-live="polite">
            <p>{text}</p>
            <div className="hex-confirm-actions">
              <button type="button" className="abtn" onClick={runHexConfirm}>{confirmLabel}</button>
              <button type="button" className="abtn ghost" onClick={clearHexConfirm}>Not yet</button>
            </div>
          </div>
        );
      })()}
      {/* Bottom dock: energy orb + hand. The orb houses feeding
          now (Nigel, 2026-10-18): while a warden is chosen it wears
          the lit feed-ready face and tapping it — or its caption —
          feeds that warden 10✦. Unchosen, it is its present self. */}
      <div className="energy-orb-fixed">
        <EnergyTimer feedName={feedTarget?.name ?? null} onFeed={handleGlobeFeed} refreshBump={orbBump} />
        {feedTarget && (
          <button type="button" className="energy-orb-feed-caption" onClick={() => void handleGlobeFeed()}
            title={`Feed ${feedTarget.name} 10✦ — energy becomes XP (×1 in the field)`}>
            Feed {feedTarget.name} · 10<span className="spark-glow">✦</span>
          </button>
        )}
      </div>
      <div className="bottom-dock">
        <div className="hand-label">Your Awokin. Summoning rides the wheel now — right-click anywhere, pick a party member under the Awoken branch, and they stand at your side. Tap cards here to ready a company for the assault on cursed ground.</div>
        <div className="dock-row">
                {battlePool.length > 0 && (
          <div className="battle-pool">
            <div className="battle-pool-label">Ready for battle ({battlePool.length}/4)</div>
            <div className="battle-pool-cards">
              {battlePool.map(id => {
                const a = hand.find(x => x.id === id);
                if (!a) return null;
                const el = dominantElement(a);
                return (
                  <button key={a.id} className="battle-pool-card" onClick={() => toggleBattlePool(a)} title="Remove">
                    <Corner element={el} className="hcorner tl" />
                    <Corner element={el} className="hcorner br" />
                    <img src={a.image_url} alt={a.name} />
                    <div className="battle-pool-card-name">{a.name}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="dock-hand">
          {hand.map((a, i) => {
            const el = dominantElement(a);
            const level = a.level ?? 0;
            const xp = a.experience ?? 0;
            const progress = a.xp_progress ?? 0;
            return (
            <button key={a.id} className={`dock-card ${battlePool.includes(a.id) ? "in-pool" : ""} ${applyingAspect ? "apply-target" : ""} ${courtMarks.championId === a.id ? "dock-court-champion" : courtMarks.housedIds.has(a.id) ? "dock-court-housed" : ""}`}
              title={courtMarks.championId === a.id ? "Your champion — the court stays in hand for battles" : courtMarks.housedIds.has(a.id) ? "Housed in the Hall — the court stays in hand for battles" : undefined}
              onClick={async () => {
                if (applyingAspect) {
                  try {
                    const oldP = a.power ?? 0, oldT = a.toughness ?? 0;
                    const result: any = await api.call("applyAspect", { awakenedId: a.id, inventoryAspectId: applyingAspect.id });
                          refreshAspects();
                    setApplyingAspect(null);
                    await onUpdate();
                    setCelebration({
                      awoken: a,
                      aspect: result.upgraded ? { name: result.targetName, imageUrl: result.imageUrl } : applyingAspect,
                      element: result.element,
                      newLevel: result.newLevel,
                      oldPower: oldP, oldToughness: oldT,
                      newPower: oldP + 1, newToughness: oldT + 1,
                    });
                  } catch (err) {
                    alert(err instanceof Error ? err.message : "Failed to apply");
                  }
                  return;
                }
                toggleBattlePool(a);
              }}>
              <Corner element={el} className="hcorner tl" />
              <Corner element={el} className="hcorner br" />
              <img src={a.image_url} alt={a.name} />
              <div className="dock-card-name">{a.name}</div>
              <div className="dock-card-stats">{a.power}/{a.toughness}</div>
              <div className="dock-xp" title={`Level ${level} — ${xp} XP`}>
                <div className="dock-xp-bar" style={{ width: `${progress * 100}%` }} />
                <span className="dock-xp-text">Lv {level}</span>
              </div>
              {(a.stat_points ?? 0) > 0 && (
                spendOpenId === a.id ? (
                  <div className="dock-stat-points dock-spend-open" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => { api.assignStatPoint({ awakenedId: a.id, stat: "power" }).then(() => { setSpendOpenId(null); onUpdate(); }).catch(console.error); }}>⚔ +1</button>
                    <button onClick={() => { api.assignStatPoint({ awakenedId: a.id, stat: "toughness" }).then(() => { setSpendOpenId(null); onUpdate(); }).catch(console.error); }}>♥ +1</button>
                  </div>
                ) : (
                  <div className="dock-stat-points" onClick={(e) => { e.stopPropagation(); setSpendOpenId(a.id); }}>
                    +{a.stat_points} point!
                  </div>
                )
              )}
              {battlePool.includes(a.id) && cardBorder.imageUrl && <img className={`card-border-frame fit-${cardBorder.fit ?? "hug"}`} src={cardBorder.imageUrl} alt="" aria-hidden="true" />}
            </button>
            );
          })}
          {hand.length === 0 && <div className="dock-empty">All Awokin stand on the field.</div>}
        </div>
        </div>
        {elsewhere.length > 0 && (
          <div className="hand-elsewhere">
            <p className="quiet small">Not in hand — one body stands in one place, so these keep their posts:</p>
            <div className="elsewhere-row">
              {elsewhere.map((e, i) => (
                <span key={`${e.name}-${i}`} className="elsewhere-chip" data-element={e.element}
                  title={e.where === "staged"
                    ? `${e.name} waits staged at your bastion — it stands ready there. Muster it from the bastion's hex, or unstage it, before it can deploy from hand.`
                    : `${e.name} stands on your homeland field — it is deployed already. Recall it there to bring it back to hand.`}>
                  {e.name} · {e.where === "staged" ? "🏯 staged at your bastion" : "🏠 on your homeland field"}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="nav-compass">
        <button className="compass-btn north" onClick={() => setPan(p => ({ ...p, y: p.y + 40 }))} aria-label="Pan up">▲</button>
        <button className="compass-btn west" onClick={() => setPan(p => ({ ...p, x: p.x + 40 }))} aria-label="Pan left">◀</button>
        <button className="compass-btn east" onClick={() => setPan(p => ({ ...p, x: p.x - 40 }))} aria-label="Pan right">▶</button>
        <button className="compass-btn south" onClick={() => setPan(p => ({ ...p, y: p.y - 40 }))} aria-label="Pan down">▼</button>
        <button className="compass-btn zoom-in" onClick={() => setZoom(z => Math.min(z + 0.2, 3))} aria-label="Zoom in">＋</button>
        <button className="compass-btn zoom-out" onClick={() => setZoom(z => Math.max(z - 0.2, 0.5))} aria-label="Zoom out">－</button>
        {tenderStand && (
          <button className="compass-btn find-tender" aria-label="Find my Tender"
            onClick={findMyTender}>🧭</button>
        )}
        <button className="compass-btn" onClick={() => {
          if (!tracksRef.current.length) {
            tracksRef.current = [{ name: "Aurora", url: "/music/aurora.mp3" }];
            setLibraryTracks(tracksRef.current);
          }
          const sounding = !!audioRef.current && !audioRef.current.paused;
          if (musicOn && sounding) {
            audioRef.current!.pause();
            setMusicOn(false);
          } else {
            // First tap (or resume): start the mood's playlist.
            if (audioRef.current && audioRef.current.src) {
              audioRef.current.play().catch(() => {});
            } else {
              playSongAt(trackIdxRef.current);
            }
            setMusicOn(true);
          }
        }} aria-label="Toggle music" title={(libraryTracks[trackIdx]?.name) ?? "Music"}>
          {musicOn ? "🎶" : "🎵"}
        </button>
      </div>
      {showTargetMap && waveTarget && wave && (
        <div className="target-map-overlay">
          <div className="target-map-modal">
            <h2 style={{ color: "#ff6666", fontFamily: "Georgia, serif" }}>⚠ The Unraveling Comes</h2>
            <p style={{ color: "#aaa" }}>Wave {wave.waveNumber} targets this territory:</p>
            <div className="target-minimap" style={{ position: "relative", width: "280px", height: "200px", margin: "16px auto" }}>
              {(() => {
                // Find bounds to center the territory
                const qs = tiles.map(t => t.q);
                const rs = tiles.map(t => t.r);
                const minQ = Math.min(...qs), maxQ = Math.max(...qs);
                const minR = Math.min(...rs), maxR = Math.max(...rs);
                const centerQ = (minQ + maxQ) / 2;
                const centerR = (minR + maxR) / 2;
                const scale = 22; // hex size
                return tiles.map(t => {
                  const isTarget = waveTarget.tile ? t.id === waveTarget.tile.id : false;
                  // Hex positioning from the shared iso basis, scaled down
                  const { px, py } = isoOffset(t.q - centerQ, t.r - centerR, scale);
                  return (
                    <div
                      key={t.id}
                      className={`target-hex ${isTarget ? "targeted" : ""} ${t.cursed ? "cursed" : ""}`}
                      title={isTarget ? "Under attack!" : t.cursed ? "Cursed wilds" : "Purified"}
                      style={{
                        position: "absolute",
                        left: `calc(50% + ${px}px)`,
                        top: `calc(50% + ${py}px)`,
                        transform: "translate(-50%, -50%)",
                      }}
                    />
                  );
                });
              })()}
            </div>
            <p style={{ color: waveTarget.defenderIds.length > 0 ? "#8f8" : "#fa0", fontSize: 14 }}>
              {waveTarget.defenderIds.length > 0
                ? `${waveTarget.defenderIds.length} defender(s) hold this land.`
                : "No defenders! You must play Awokin from hand (costs energy)."}
            </p>
            <button className="abtn battle-cta" onClick={handleTargetConfirmed}>
              ⚔ Defend
            </button>
            <button className="abtn small" onClick={() => setShowTargetMap(false)} style={{ marginLeft: 8, color: "#ffeebb", borderColor: "#b89b5e" }}>
              Retreat
            </button>
          </div>
        </div>
      )}
      {showBattleground && wave && (() => {
        // Use waveTarget tile if available, else pick any non-bastion purified tile.
        // Bastion (center) is the last resort — only if no other targets exist.
        const fallbackTile = (() => {
          const nonBastion = tiles.filter(t => !(t.q === 0 && t.r === 0) && !t.cursed);
          if (nonBastion.length > 0) {
            return nonBastion[Math.floor(Math.random() * nonBastion.length)];
          }
          return tiles.find(t => t.q === 0 && t.r === 0);
        })();
        const targetTileId = waveTarget?.tile?.id ?? fallbackTile?.id;
        const defs = placements
          .filter(p => p.tileId === targetTileId)
          .map(p => {
            const aw = tenderItems.find(a => a.id === p.awakenedId);
            return aw ? { placementId: p.id, awoken: aw, stance: p.stance, tileId: p.tileId } : null;
          })
          .filter(Boolean) as { placementId: number; awoken: Awakened; stance: string }[];
        return (
          <Battleground
            defenders={defs}
            thornWallTiles={buildings.filter(b => b.buildingType === "thorn-wall" && b.status === "active").map(b => b.tileId)}
            watchtowerTiles={buildings.filter(b => b.buildingType === "watchtower" && b.status === "active").map(b => b.tileId)}
            towerDamage={gameConfig?.buildings?.["watchtower"]?.damage ?? 3}
            thornDamage={gameConfig?.buildings?.["thorn-wall"]?.damage ?? 1}
            towerPowerBonus={gameConfig?.buildings?.["watchtower"]?.powerBonus ?? 2}
            enemyConfig={gameConfig?.enemies}
            towerAuraTiles={(() => {
              const towers = buildings.filter(b => b.buildingType === "watchtower" && b.status === "active");
              const aura = new Set<number>();
              const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
              for (const t of towers) {
                aura.add(t.tileId);
                const tile = tiles.find(tl => tl.id === t.tileId);
                if (!tile) continue;
                for (const [dq, dr] of dirs) {
                  const adj = tiles.find(tl => tl.q === tile.q + dq && tl.r === tile.r + dr);
                  if (adj) aura.add(adj.id);
                }
              }
              return [...aura];
            })()}
            wave={wave}
            hand={hand}
            assets={assets}
            energy={energy}
            maxEnergy={maxEnergy}
            onBattleEnd={handleBattleEnd}
            onClose={() => { setShowBattleground(false); setBattleColumnId(null); }}
            bonusTiles={bonusTiles}
            onVictoryDetected={handleVictoryDetected}
            aspectGrant={bossAspectGrant}
            mood={mood?.mood ?? null}
            wallsByTile={Object.fromEntries(tiles.map(t => [
              t.id,
              wallsTouchingTile(t)
                .filter(w => w.kind === "wall" || w.kind === "ward")
                .map(w => ({ edgeKey: w.edgeKey, hp: w.hp, kind: w.kind })),
            ]))}
            runesByTile={Object.fromEntries(tiles.map(t => [
              t.id,
              wallsTouchingTile(t)
                .filter(w => w.kind === "rune")
                .map(w => ({ edgeKey: w.edgeKey, runeKind: (w.runeKind ?? "meld") as "snare" | "harm" | "meld", level: w.level ?? 1 })),
            ]))}
            edgeThornTiles={tiles.filter(t => wallsTouchingTile(t).some(w => w.kind === "thorns")).map(t => t.id)}
            grimWorkings={workings}
            grimRunesByTile={Object.fromEntries(workings.filter(w => (w.kind === "rune" || w.kind === "spell") && w.tileId != null).map(w => [w.tileId!, w]))}
            grimWardsByTile={grimBattleProps().wardsByTile}
            grimWardTiles={grimBattleProps().wardTiles}
            grimStdTiles={grimBattleProps().stdTiles}
            grimBcnTiles={grimBattleProps().bcnTiles}
            grimCoilTiles={tiles.filter(t => !t.cursed).map(t => t.id)}
            grimNames={grimBattleProps().names}
          />
        );
      })()}
      {/* Castle button - toggles building menu (disabled during battle) */}
      <button
        className={`castle-toggle ${showBuildingMenu ? "open" : ""}`}
        onClick={() => { if (!battleActive) setShowBuildingMenu(v => !v); }}
        title={battleActive ? "Cannot build during battle" : "Buildings"}
        disabled={battleActive}
        style={battleActive ? { opacity: 0.4, cursor: "not-allowed" } : {}}
      >
        <svg viewBox="0 0 32 32"><path d="M7 26 V13 L10.5 13 V9 H14 V13 H18 V9 H21.5 V13 L25 13 V26 Z"/><path d="M13.5 26 V21 C13.5 18.8 18.5 18.8 18.5 21 V26"/><path d="M16 9 V5"/><path d="M16 5 L20 6.2 L16 7.4"/></svg>
      </button>

      {/* War-Grounds button — the fine-edit panel from the map screen
          itself (Nigel, 2026-10-16): one tap opens the panel on the
          selected Awoken's hex (or the first stationed Awoken's), the
          same panel the stance picker opens. Shut during battle. */}
      <button
        className={`wg-toggle ${wgTileId !== null ? "open" : ""}`}
        onClick={() => {
          if (battleActive) return;
          if (wgTileId !== null) { setWgTileId(null); setWgArmedWork(null); return; }
          const sel = selectedAwoken !== null ? placements.find(p => p.awakenedId === selectedAwoken) : undefined;
          const target = sel ?? placements[0];
          if (!target) { showHexNotice("Station an Awokin on the field first — the War-Grounds open on the hex an Awokin stands on."); return; }
          setWgArmedWork(null);
          setWgTileId(target.tileId);
          showHexNotice("The War-Grounds are open.");
        }}
        title={battleActive ? "The War-Grounds are shut while battle is joined" : "War-Grounds — fine work on one hex: edge works, buildings, readings"}
        disabled={battleActive}
        style={battleActive ? { opacity: 0.4, cursor: "not-allowed" } : {}}
      >
        <svg viewBox="0 0 32 32"><path d="M10 27 V5"/><path d="M10 6 C13.5 4.6 16.5 7 21.5 5.4 V12.4 C16.5 14 13.5 11.4 10 12.8"/><path d="M6 27 H14"/></svg>
      </button>

      {/* Right-side building panel */}
      {!tutorialDone && !objectivesMet && (
        <Tutorial onComplete={() => setTutorialDone(true)} />
      )}
      {showTutorial && (
        <Tutorial onComplete={() => setShowTutorial(false)} />
      )}
      {/* Question mark to reopen tutorial */}
      <button
        className="tutorial-help-btn"
        onClick={() => setShowTutorial(true)}
        title="Show tutorial"
        aria-label="Show tutorial"
      >
        ?
      </button>
      {objectivesMet && !tutorialDone && (
        <div className="tutorial-complete-banner">
          <p>✦ Training complete — 7 tiles purified, shrine raised. The land is yours.</p>
          <button className="abtn small" onClick={() => {
            localStorage.setItem("awoken-tutorial-done", "1");
            setTutorialDone(true);
          }}>Begin →</button>
        </div>
      )}
      {showBuildingMenu && (
        <div className="building-side-panel">
          <button
            className={`abtn small demo-toggle ${demoMode ? "active" : ""}`}
            onClick={() => setDemoMode(v => !v)}
            style={demoMode ? { background: "#aa3333", borderColor: "#ff6666" } : {}}
            title="Demolish mode: tap buildings to remove them"
          >
            {demoMode ? "🔨 Demolishing… (tap to exit)" : "🔨 Demolish"}
          </button>
          <BuildingMenu
            onSelect={(b) => { setSelectedBuilding(b); }}
            selected={selectedBuilding}
            energy={energy}
            alwaysOpen
          />
        </div>
      )}

      {/* THE BUILD CARD (the Building System, 2026-10-19): the
          work's own face — its stage, its fill, the pool it
          drinks from, and the pour. The terrain bank rides the
          header: every stage the land completes is a point in
          the vessel, and the vessel lifts the energy cap. */}
      {buildSel && (() => {
        const cardStyle: React.CSSProperties = {
          position: "absolute", left: "50%", bottom: 86, transform: "translateX(-50%)",
          width: "min(430px, calc(100vw - 24px))", zIndex: 95,
          background: "rgba(10,8,16,0.96)", border: "1px solid #c9a227", borderRadius: 12,
          padding: "12px 14px", color: "#f0e6cc", boxShadow: "0 10px 34px rgba(0,0,0,0.6)",
        };
        const pourBtn = (label: string, el: string, act: () => void) => {
          const pool = buildPools?.[el] ?? 0;
          const short = pool < 10;
          return (
            <button className="abtn" disabled={short} onClick={act}
              style={{ marginTop: 8, marginRight: 8, ...(short ? { opacity: 0.45 } : {}) }}>
              {label}{short ? ` — the ${el} pool holds ${Math.floor(pool)}` : ` · pool ${Math.floor(pool)}`}
            </button>
          );
        };
        if (buildSel.kind === "ghost") {
          return (
            <div style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <strong>Unmade ground</strong>
                <span style={{ fontSize: 12, opacity: 0.8 }}>terrain bank {terrainBank} · the vessel lifts your energy cap</span>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.45 }}>
                Found a new hex here, at your land's edge. Stone will gather first, piece by piece, until the
                ground holds; then root weaves it, tide or sky crowns it, and fire finishes it. Every stage
                the land completes pays a point into your terrain bank.
              </p>
              <button className="abtn" style={{ marginTop: 10 }} onClick={() => void handleBeginBuild(buildSel.q, buildSel.r)}>🪨 Found the work — let stone gather</button>
              <button className="abtn small" style={{ marginLeft: 8 }} onClick={() => setBuildSel(null)}>✕</button>
            </div>
          );
        }
        const t = tiles.find(t => t.id === buildSel.tileId);
        if (!t) return null;
        const stage = (t as any).buildStage ?? 0;
        const pts = Math.floor((t as any).buildPoints ?? 0);
        const stageName = stage === 1 ? "I · Stone coalesces" : stage === 2 ? "II · Root weaves" : stage === 3 ? "III · The branch" : stage === 4 ? "IV · Fire finishes" : "Finished";
        const wanted = stage === 1 ? "stone" : stage === 2 ? "root" : stage === 3 ? ((t as any).buildBranch ?? null) : stage === 4 ? "fire" : null;
        return (
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <strong>{(t as any).z > 0 ? "A floating isle" : "A work rising"} — {stageName}</strong>
              <span style={{ fontSize: 12, opacity: 0.8 }}>terrain bank {terrainBank}</span>
            </div>
            {stage >= 1 && stage <= 4 && (
              <>
                <div style={{ marginTop: 8, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(pts / 30) * 100}%`, background: "#c9a227" }} />
                </div>
                <p style={{ margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.45 }}>
                  {stage === 1 && "Stone gathers piece by piece. When the fill seals, the ground will hold a walker."}
                  {stage === 2 && "Root weaves the stone together and greens the hex over."}
                  {stage === 3 && !(t as any).buildBranch && "The branch is chosen by the first pour: tide comes in as a lake — or sky lifts the tile into an isle, and a new neutral hex is born beneath it."}
                  {stage === 3 && (t as any).buildBranch === "tide" && "Tide fills the hex — a lake takes the land."}
                  {stage === 3 && (t as any).buildBranch === "sky" && "The tile has risen. A new neutral hex lies beneath it, born of its rising."}
                  {stage === 4 && "Fire finishes the work: bake it sealed — a cell that holds its charge and cannot be unmade by pressure —" + ((t as any).buildBranch === "tide" ? " or lower it deep, and the sunken land pays tide back into your pools and double into the bank." : ".")}
                  {" "}Fill {pts}/30. Awokin standing on the work build it slowly by their press, for free.
                </p>
                {stage === 3 && !(t as any).buildBranch ? (
                  <>
                    {pourBtn("🌊 Attune 10 tide — a lake", "tide", () => void handlePourBuild(t.id, { branch: "tide" }))}
                    {pourBtn("☁ Attune 10 sky — an isle", "sky", () => void handlePourBuild(t.id, { branch: "sky" }))}
                  </>
                ) : stage === 4 && !(t as any).buildFinish ? (
                  <>
                    {pourBtn("🔥 Attune 10 fire — bake it sealed", "fire", () => void handlePourBuild(t.id, { finish: "bake" }))}
                    {(t as any).buildBranch === "tide" && pourBtn("▽ Attune 10 fire — lower it deep", "fire", () => void handlePourBuild(t.id, { finish: "lower" }))}
                  </>
                ) : wanted ? (
                  pourBtn(`Attune 10 ${wanted}`, wanted, () => void handlePourBuild(t.id))
                ) : null}
              </>
            )}
            {stage >= 5 && (
              <p style={{ margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.45 }}>
                {(t as any).lowered ? "Lowered deep by fire: its yield is paid, and it counts double in the vessel." : (t as any).baked ? `Baked sealed by fire: it holds a charge of ${Math.round((t as any).buildCharge ?? 0)}, turns for no pressure, and grows its own stack the faster for the charge it keeps.` : "The work stands finished."}
              </p>
            )}
            <button className="abtn small" style={{ marginTop: 10 }} onClick={() => setBuildSel(null)}>✕ Close</button>
          </div>
        );
      })()}

      {/* Builder selection popup */}
      {pendingTile !== null && selectedBuilding && (() => {
        const tileAwoken = placements
          .filter(p => p.tileId === pendingTile)
          .map(p => {
            const aw = tenderItems.find(a => a.id === p.awakenedId);
            return aw ? { ...aw, placement: p } : null;
          })
          .filter(Boolean);
        const helperCount = selectedBuilders.length;
        const timeDivisor = Math.pow(2, helperCount);
        const baseMinutes = selectedBuilding.buildMinutes;
        const actualMinutes = Math.max(1, Math.floor(baseMinutes / timeDivisor));
        // The Dream Shroom's wedges (Nigel, 2026-10-18): planting
        // the crop chooses a wedge of the hex, not a building seat.
        const isShroomPlant = selectedBuilding.type === "dream-wheat";
        const tileShrooms = isShroomPlant
          ? buildings.filter(b => b.tileId === pendingTile && b.buildingType === "dream-wheat").sort((a, b) => a.id - b.id)
          : [];
        const takenWedges = new Set(tileShrooms.map(b => shroomWedgeOf(b, tileShrooms)));
        const chosenWedge = isShroomPlant
          ? (pendingWedge !== null && !takenWedges.has(pendingWedge) ? pendingWedge : [0, 1, 2, 3, 4, 5].find(w => !takenWedges.has(w)) ?? null)
          : null;
        return (
          <div className="admin-popup" onClick={() => { setPendingTile(null); setSelectedBuilders([]); setPendingWedge(null); }}>
            <div className="admin-popup-inner" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
              <h3>{selectedBuilding.icon ?? "🗼"} {selectedBuilding.name}</h3>
              <p className="quiet">Tap Awokin on this tile to assign as builders. Each halves the build time.</p>
              {isShroomPlant && (() => {
                const verts = hexCellVertices(130, 118, 92);
                return (
                  <div className="wedge-picker">
                    <p className="quiet">Choose its wedge — six plots to a hex, each growing on its own clock. {tileShrooms.length}/6 planted.</p>
                    <svg viewBox="0 0 260 236" width="220" height="200" role="img" aria-label="Wedge picker">
                      {[0, 1, 2, 3, 4, 5].map(w => {
                        const a = verts[w], b = verts[(w + 1) % 6];
                        const c = hexWedgePoint(130, 118, 92, w);
                        const taken = takenWedges.has(w);
                        const shroom = tileShrooms.find(x => shroomWedgeOf(x, tileShrooms) === w);
                        const chosen = chosenWedge === w;
                        return (
                          <g key={w}>
                            <polygon points={`130,118 ${a[0]},${a[1]} ${b[0]},${b[1]}`}
                              fill={taken ? "rgba(120,90,40,0.35)" : chosen ? "rgba(255,215,0,0.30)" : "rgba(255,255,255,0.06)"}
                              stroke={chosen ? "#ffd700" : "rgba(255,215,0,0.5)"} strokeWidth={chosen ? 2.5 : 1.2}
                              style={{ cursor: taken ? "default" : "pointer" }}
                              onClick={() => { if (!taken) setPendingWedge(w); }} />
                            {shroom
                              ? <image href={wheatStageImage(shroom)} x={c.x - 17} y={c.y - 17} width={34} height={34} preserveAspectRatio="xMidYMid meet" pointerEvents="none" />
                              : <text x={c.x} y={c.y + 5} textAnchor="middle" fontSize={15} fill={chosen ? "#ffd700" : "rgba(255,215,0,0.75)"} pointerEvents="none">＋</text>}
                          </g>
                        );
                      })}
                    </svg>
                    {chosenWedge === null && <p className="notice error">Every wedge of this hex is planted.</p>}
                  </div>
                );
              })()}
              <div className="builder-grid">
                {tileAwoken.map((aw: any) => {
                  const isSelected = selectedBuilders.includes(aw.id);
                  const isBuilding = aw.placement.stance === "building";
                  return (
                    <button
                      key={aw.id}
                      className={`builder-card ${isSelected ? "selected" : ""}`}
                      disabled={isBuilding}
                      onClick={() => {
                        setSelectedBuilders(prev =>
                          isSelected ? prev.filter(id => id !== aw.id) : [...prev, aw.id]
                        );
                      }}
                    >
                      <span className="builder-name">{aw.name}</span>
                      <span className="builder-stance">{isBuilding ? "🔨 building" : aw.placement.stance}</span>
                      {isSelected && <span className="builder-check">✓</span>}
                    </button>
                  );
                })}
                {tileAwoken.length === 0 && <p className="quiet">No Awokin on this tile. The build will take full time.</p>}
              </div>
              <div className="builder-summary">
                <span>⏱ {baseMinutes >= 60 ? `${baseMinutes/60}h` : `${baseMinutes}m`} → <strong>{actualMinutes >= 60 ? `${(actualMinutes/60).toFixed(1)}h` : `${actualMinutes}m`}</strong></span>
                <span>🂠 {helperCount} helper{helperCount === 1 ? "" : "s"}</span>
              </div>
              {buildError && <p className="notice error">{buildError}</p>}
              <div className="wave-edit-actions">
                <button className="abtn" disabled={isShroomPlant && chosenWedge === null} onClick={async () => {
                  try {
                    setBuildError(null);
                    await api.placeBuilding({
                      tileId: pendingTile,
                      buildingType: selectedBuilding.type,
                      builderIds: selectedBuilders,
                      wedge: isShroomPlant ? chosenWedge ?? undefined : undefined,
                    });
                    setPendingTile(null);
                    setSelectedBuilders([]);
                    setPendingWedge(null);
                    setSelectedBuilding(null);
                    const r = await api.getBuildings();
                    setBuildings(r.buildings);
                    onUpdate();
                  } catch (e) {
                    setBuildError((e as Error).message || "Build failed");
                  }
                }}>Begin Build</button>
                <button className="abtn small" onClick={() => { setPendingTile(null); setSelectedBuilders([]); setPendingWedge(null); }}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* War-Grounds fine-edit panel (War-Ground, Nigel 2026-10-15):
          one hex enlarged — fat edges for walls, the building seat,
          the tile's readings. All actions ride existing server law. */}
      {wgTileId !== null && !battleActive && (() => {
        const tile = tiles.find(t => t.id === wgTileId);
        if (!tile) return null;
        const standing = placements
          .filter(p => p.tileId === tile.id)
          .map(p => {
            const a = tenderItems.find(x => x.id === p.awakenedId);
            return a ? {
              id: a.id, name: a.name, power: a.power, stance: p.stance, level: a.level,
              skills: skills.filter(s => s.awakenedId === a.id).map(s => s.skill),
            } : null;
          })
          .filter(Boolean) as { id: number; name: string; power: number; stance: string; level?: number; skills: string[] }[];
        return (
          <WarGrounds
            seed={seedsQ.data?.seeds.find(sd => sd.tileId === tile.id) ?? null}
            fieldParty={placements.map(p => {
              const a = tenderItems.find(x => x.id === p.awakenedId);
              return a ? { awakenedId: a.id, name: a.name, marching: !!(p as any).marchPath } : null;
            }).filter(Boolean) as { awakenedId: number; name: string; marching: boolean }[]}
            onFetchSeed={handleFetchSeed}
            onHoldSeed={handleHoldSeed}
            tile={tile}
            walls={walls}
            standing={standing}
            tileBuildings={buildings.filter(b => b.tileId === tile.id)}
            energy={energy}
            onClose={() => { setWgTileId(null); setWgArmedWork(null); }}
            onPlaceWork={(dir, kind, runeKind, style) => handlePlaceWork(tile.id, dir, kind, runeKind, style)}
            onStrengthenWork={(dir) => handleStrengthenWork(tile.id, dir)}
            onRemoveWork={(dir) => handleRemoveWork(tile.id, dir)}
            onTeachSkill={(awakenedId, skill) => handleTeachSkill(awakenedId, skill)}
            armedWork={wgArmedWork}
            onCancelArm={() => setWgArmedWork(null)}
            onChooseBuilding={(def) => {
              setSelectedBuilding(def);
              setPendingTile(tile.id);
              setSelectedBuilders([]);
              setWgTileId(null);
              setWgArmedWork(null);
            }}
            onDemolish={async (buildingId) => {
              try {
                await api.demolishBuilding({ buildingId });
                const rb = await api.getBuildings();
                setBuildings(rb.buildings);
                onUpdate();
                showHexNotice("The building comes down. The hex keeps the ground it stood on.");
              } catch (e) {
                showHexNotice(e instanceof Error ? e.message : "The building would not come down.");
              }
            }}
            onClaimSpark={tile.spark ? () => { setWgTileId(null); setWgArmedWork(null); void handleSparkClick(tile.id); } : undefined}
          />
        );
      })()}
      {/* The patrol bar — while a road is being laid (War-Ground,
          2026-10-16): the road's state and its settling controls,
          thumb-reachable at the screen's foot. */}
      {patrolSettingFor !== null && (() => {
        const who = tenderItems.find(a => a.id === patrolSettingFor);
        const existing = placements.find(p => p.awakenedId === patrolSettingFor);
        const settle = async (tileIds: number[], msg: string) => {
          try {
            await api.setPatrol({ awakenedId: patrolSettingFor, tileIds });
            setPatrolSettingFor(null);
            setPatrolDraft([]);
            await refreshMarching();
            showHexNotice(msg);
          } catch (e) {
            showHexNotice(e instanceof Error ? e.message : "The patrol could not be set.");
          }
        };
        return (
          <div className="patrol-bar" ref={patrolAnchor.ref}
            style={{ left: `${patrolAnchor.xPct ?? 50}%`, top: `${patrolAnchor.yPct ?? 92}%` }}>
            <span className="patrol-bar-label">🚶 Laying {who?.name ?? "the warden"}'s patrol — tap hexes ({patrolDraft.length}/8)</span>
            <button className="stance-btn" disabled={!patrolDraft.length}
              onClick={() => void settle(patrolDraft, "The patrol is set. The road will be walked, out and back, until the warden is called in.")}>
              ✓ Set patrol
            </button>
            <button className="stance-btn" disabled={!patrolDraft.length} onClick={() => setPatrolDraft(d => d.slice(0, -1))}>↩ Undo</button>
            {existing?.patrolPath && (
              <button className="stance-btn" onClick={() => void settle([], "The patrol is called in — the warden stands home again.")}>🛑 End patrol</button>
            )}
            <button className="stance-btn" onClick={() => { setPatrolSettingFor(null); setPatrolDraft([]); }}>✕ Cancel</button>
          </div>
        );
      })()}
      {/* Spark claim animation */}
      {sparkAnimation && (
        <div className={`spark-animation ${sparkAnimation.phase}`}>
          <svg className="glyph-svg large" viewBox="0 0 60 24" width="120" height="48">
            <path d="M14,20 Q10,14 14,8 Q16,4 14,2 Q20,4 22,10 Q24,6 22,2 Q28,6 26,12 Q25,16 28,18 L60,18" fill="none" stroke="#ff6600" strokeWidth="2" opacity="0.95"/>
            <path d="M18,20 Q16,16 18,12 Q20,14 19,17" fill="none" stroke="#ff6600" strokeWidth="1.2" opacity="0.7"/>
            <circle cx="22" cy="14" r="2" fill="#ff6600" opacity="0.6"/>
          </svg>
          <div className="spark-text">Fire found!</div>
        </div>
      )}
    </div>
  );
}
