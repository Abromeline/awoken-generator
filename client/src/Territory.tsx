import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Awakened, type TerritoryTile, type FieldPlacement, type EdgeWork } from "./api";
import { useTerrainArt, terrainImgFor, stageForTile, trayStageOf } from "./terrainArt";
import { WALL_STYLES } from "./wallArt";
import EnergyTimer from "./EnergyTimer";
import hallBanner from "./assets/hall-of-champions.jpg";

import FieldAwoken from "./FieldAwoken";
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
const GRIM_HUES = ["unaligned", "tide", "sky", "stone", "root", "fire"];
import AspectCelebration from "./AspectCelebration";
import { ElementGlyph, type GlyphElement } from "./glyphs";
import { elementPalette } from "./palette";
import { useEnemyArt, enemyImgFor } from "./enemyArt";
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

export default function Territory({ tenderItems, assets, onUpdate, initialPatrolIds }: Props) {
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
  const [tiles, setTiles] = useState<TerritoryTile[]>([]);
  // First-tile claim (fix list #3): a fresh Tender holds no ground — the
  // empty state is where the Last Bastion begins, not a dead end.
  const [territoryLoaded, setTerritoryLoaded] = useState(false);
  const [firstTeam, setFirstTeam] = useState<number[]>([]);
  const [firstClaimBusy, setFirstClaimBusy] = useState(false);
  const [firstClaimError, setFirstClaimError] = useState<string | null>(null);
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
    a.volume = 0.4;
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
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [zoom, setZoom] = useState(1);
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
  const [marchUiFor, setMarchUiFor] = useState<number | null>(null);
  const [marchQuote, setMarchQuote] = useState<{ tileId: number; road: number[]; steps: number; seconds: number; energy: number } | null>(null);
  // Drag-selection (War-Ground, Nigel 2026-10-16): a left-drag on the
  // map draws a band; the wardens inside it are chosen together and
  // can be given a company march. (Pan is right-drag, so the left
  // hand was free for this.)
  const [selectedGroup, setSelectedGroup] = useState<number[]>([]);
  const [band, setBand] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const bandRef = useRef<{ cx: number; cy: number; sx: number; sy: number; active: boolean } | null>(null);
  const bandClosedAt = useRef(0);
  const panDragRef = useRef<{ cx: number; cy: number; panX: number; panY: number; moved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [groupMarchUi, setGroupMarchUi] = useState(false);
  const [groupQuote, setGroupQuote] = useState<{ destId: number; orders: { awakenedId: number; tileId: number; steps: number; road: number[]; alreadyThere: boolean }[]; totalEnergy: number; slowest: number; excluded: number } | null>(null);
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
    if (!anyPatrol && !anyMarch && patrolSettingFor === null && marchUiFor === null) return;
    const iv = window.setInterval(() => setMarchNow(Date.now()), 125);
    return () => window.clearInterval(iv);
  }, [anyPatrol, anyMarch, patrolSettingFor, marchUiFor]);
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
  // The road over the Tender's own uncursed ground — the client's
  // mirror of the server's findRoad, for quoting a march before it is
  // given. The server's road is the one the walker walks.
  const findRoadClient = (fromId: number, toId: number): number[] | null => {
    const byId = new Map(tiles.map(t => [t.id, t]));
    const byCoord = new Map(tiles.map(t => [`${t.q},${t.r}`, t]));
    const from = byId.get(fromId), to = byId.get(toId);
    if (!from || !to || to.cursed) return null;
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
  };
  const fmtMarchTime = (sec: number) => {
    const s = Math.max(0, Math.round(sec));
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  };
  const PATROL_SPEED = 26; // px per second — a hex crossing in ~3.5s
  const [walls, setWalls] = useState<EdgeWork[]>([]); // edge works (server-canonical edges): wall / thorns / ward / rune
  // ── The Written Light on the land (the Grimoire, Nigel 2026-10-17) ──
  // The Tender's own castings from the book: standings served by
  // getTerritory, the book itself by getGrimoire, the Lv 3 gate by
  // getTenderExp. Casting mode turns hex taps into castings: a ward
  // wants an anchor hex (mine standing on it) then one of its edges;
  // a rune wants a hex's floor; Heal wants a hex my wounded stand on.
  const [workings, setWorkings] = useState<MapWorking[]>([]);
  const [grim, setGrim] = useState<GrimoireState | null>(null);
  const [grimGate, setGrimGate] = useState<{ level: number; wardRuneUnlocked: boolean; healAmount: number }>({ level: 1, wardRuneUnlocked: false, healAmount: 5 });
  const [castMode, setCastMode] = useState(false);
  const [castSpellKey, setCastSpellKey] = useState<string | null>(null);
  const [castHue, setCastHue] = useState<string>("unaligned");
  // The Pour (Nigel, 2026-10-17): elemental points of the poured
  // hue fed into the working at its cast, chosen here in the bar.
  const [castPour, setCastPour] = useState(0);
  const grimPoolsQ = useQuery({ queryKey: ["aspectAttunement"], queryFn: () => api.getAspectAttunement(), staleTime: 0 });
  const [castAnchor, setCastAnchor] = useState<number | null>(null);
  const [fadePick, setFadePick] = useState<number | null>(null);

  const [skills, setSkills] = useState<{ awakenedId: number; skill: string }[]>([]); // Awoken skills ledger (warding / runeing)
  const [wallTargeting, setWallTargeting] = useState(false); // true when the selected Awoken is choosing a hex edge to wall
  const [applyingAspect, setApplyingAspect] = useState<any | null>(null); // aspect orb selected, tap Awoken to apply
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
  const [stanceMinimized, setStanceMinimized] = useState(false); // bubble collapses after stance pick
  const [moveTargeting, setMoveTargeting] = useState(false); // true when move mode awaits target tile
  const [spendOpenId, setSpendOpenId] = useState<number | null>(null);
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
        const dmg = greatest * (rune.nums.multiplier ?? 2) + (rune.pour ?? 0) * (rune.nums.harmPerPoint ?? 1);
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
  const [showTargetMap, setShowTargetMap] = useState(false);

  // Hand = Awoken not on field
  const placedIds = useMemo(() => new Set(placements.map(p => p.awakenedId)), [placements]);
  const hand = useMemo(() => tenderItems.filter(a => !placedIds.has(a.id)), [tenderItems, placedIds]);

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
    api.getTerritory().then(({ tiles, placements, walls, skills, workings }) => {
      setTiles(tiles); setPlacements(placements); setWalls(walls ?? []); setSkills(skills ?? []);
      setWorkings(workings ?? []);
    }).catch((e) => {
      console.error("[Territory] getTerritory failed:", e);
    }).finally(() => setTerritoryLoaded(true));
  }, []);

  // The First Patrol arrives gathered (Wake, Nigel 2026-10-17): seed the
  // patrol ONCE, when the territory's true state is known. No ground yet
  // → they become the first claim's company, and claimFirstTile makes
  // the first ground they take PURIFIED with them standing on it.
  // Ground already held → they are simply readied in the battle pool.
  const patrolSeededRef = useRef(false);
  useEffect(() => {
    if (patrolSeededRef.current || !territoryLoaded) return;
    if (!initialPatrolIds || initialPatrolIds.length === 0) return;
    patrolSeededRef.current = true;
    const mine = initialPatrolIds.filter(id => tenderItems.some(a => a.id === id));
    if (mine.length === 0) return;
    if (tiles.length === 0) {
      setFirstTeam(mine.slice(0, 6));
    } else {
      setBattlePool(mine.filter(id => !placements.some(p => p.awakenedId === id)).slice(0, 4));
    }
  }, [territoryLoaded, tiles, placements, initialPatrolIds, tenderItems]);

  useEffect(() => {
    api.getGrimoire().then(setGrim).catch(() => {});
    api.getTenderExp().then((g) => setGrimGate({ level: g.level, wardRuneUnlocked: g.wardRuneUnlocked, healAmount: g.healAmount })).catch(() => {});
  }, []);

  const refreshWorkings = async () => {
    const refreshed = await api.getTerritory();
    setTiles(refreshed.tiles); setPlacements(refreshed.placements);
    setWalls(refreshed.walls ?? []); setSkills(refreshed.skills ?? []);
    setWorkings(refreshed.workings ?? []);
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
    setTiles(refreshed.tiles); setPlacements(refreshed.placements);
    setWalls(refreshed.walls ?? []); setSkills(refreshed.skills ?? []);
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
      setTiles(refreshed.tiles); setPlacements(refreshed.placements); setWalls(refreshed.walls ?? []);
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
    setTiles(refreshed.tiles); setPlacements(refreshed.placements);
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
      showHexNotice(`The ${res.work.kind} is strengthened to level ${res.work.level} — the next strengthening would cost ${res.nextCost}⚡.`);
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
      showHexNotice(`${aw?.name ?? "The Awoken"} learns the ${skill === "warding" ? "Warding" : "Runeing"} skill — the teaching holds.`);
    } catch (e) {
      showHexNotice(e instanceof Error ? e.message : "The teaching failed.");
    }
  };

  // Hand = Awoken not on field (defined above for energy calc)

  const handleDeploy = async (tileId: number) => {
    if (battlePool.length === 0) return;
    const tile = tiles.find(t => t.id === tileId);
    if (!tile) return;
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
      setPlacements(after.placements);
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

  // First-tile claim (fix list #3): the company faces the Unraveler
  // through the live server path — claimFirstTile measures the team's
  // true power itself; the client only gathers the company. On victory
  // the newborn step follows, exactly as after a battle purification.
  const handleFirstClaim = async () => {
    if (firstClaimBusy || firstTeam.length === 0) return;
    setFirstClaimBusy(true);
    setFirstClaimError(null);
    try {
      await api.claimFirstTile({ teamIds: firstTeam });
      const after = await api.getTerritory();
      setTiles(after.tiles);
      setPlacements(after.placements);
      const center = after.tiles.find(t => t.q === 0 && t.r === 0);
      if (center) {
        const liberatorNames = firstTeam
          .map(id => tenderItems.find(a => a.id === id)?.name)
          .filter((n): n is string => !!n);
        api.birthNewbornToHand({ tileId: center.id, liberatorNames }).catch(e =>
          console.error("[Birth] Newborn failed — game continues", e)
        );
      }
      setFirstTeam([]);
      onUpdate();
    } catch (e) {
      setFirstClaimError(e instanceof Error ? e.message : "The Unraveler would not yield.");
    } finally {
      setFirstClaimBusy(false);
    }
  };

  const handleSetStance = async (awakenedId: number, stance: "attack" | "defense" | "binding") => {
    setStanceMinimized(true); // collapse bubble so tiles behind are clickable
    try {
      await api.setStance({ awakenedId, stance, maxEnergy });
      await refreshEnergy();
      const refreshed = await api.getTerritory();
      setPlacements(refreshed.placements);
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
      } else if (result.thornsDamage > 0) {
        setAwokenHp(prev => {
          const next = new Map(prev);
          const current = next.get(selectedAwoken) ?? 3;
          next.set(selectedAwoken, Math.max(0, current - result.thornsDamage));
          return next;
        });
      }
      const refreshed = await api.getTerritory();
      setTiles(refreshed.tiles);
      setPlacements(refreshed.placements);
      if (result.wavePull) {
        // Pulled into the Unraveling! Open a wave battle for this tile.
        setWavePullTile(result.tileId);
        setShowBattleground(true);
      } else if (result.purified) {
        api.birthNewbornToHand({ tileId, liberatorNames: [] }).catch(() => {});
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
      setPlacements(refreshed.placements);
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
  const doCastMap = async (args: { tileId?: number; dir?: number; awakenedId?: number }) => {
    if (!castSpell) return;
    try {
      const res = await api.castMapWorking({ spellKey: castSpell.key, hue: castHue, pour: castSpell.engine === "heal" ? undefined : castPour, ...args });
      const formName = castSpell.forms[castHue] ?? castSpell.name;
      showHexNotice(castSpell.engine === "heal"
        ? `${formName} mends ${res.healed ?? 0} HP — the binding light, at your word.`
        : castSpell.kind === "ward"
          ? `${formName} rises on the edge — the Written Light stands on your land.`
          : `${formName} is written into the ground — it waits for the dark to stand on it.`);
      setCastAnchor(null);
      if (castPour > 0) { setCastPour(0); refreshAspects(); }
      await refreshWorkings();
    } catch (e) {
      showHexNotice(e instanceof Error ? e.message : "The casting would not take.");
    }
  };
  const handleCastTap = (tile: { id: number; cursed: number | boolean }) => {
    if (!castSpell) { showHexNotice("Choose a working from the book first."); return; }
    if (castSpell.engine === "heal" || castSpell.kind === "binding") {
      const wounded = placements.filter((p) => p.tileId === tile.id).map((p) => {
        const a = tenderItems.find((x) => x.id === p.awakenedId);
        return { id: p.awakenedId, hp: awokenHp.get(p.awakenedId) ?? a?.toughness ?? 0, max: a?.toughness ?? 0 };
      }).filter((x) => x.max > 0 && x.hp < x.max).sort((x, y) => (x.hp / x.max) - (y.hp / y.max));
      if (!wounded.length) { showHexNotice("No wounded Awoken stands on that hex."); return; }
      void doCastMap({ awakenedId: wounded[0].id });
      return;
    }
    if (castSpell.kind === "ward") {
      if (castAnchor === null) {
        if (!placements.some((p) => p.tileId === tile.id)) { showHexNotice("A ward stands on the edge of a hex your own Awoken holds — tap such a hex first."); return; }
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

  const handleHexTap = (tile: { id: number; cursed: number | boolean }) => {
    if (bandJustClosed()) return; // a drag just ended here — it was a choosing, not a tap
    if (castMode && castSpellKey) { handleCastTap(tile); return; }
    if (groupMarchUi) {
      // Company march quoting: the tapped hex is the muster point;
      // the company forms up on it and the open hexes around it,
      // nearest first, four to a hex, each by its own road.
      const destTile = tiles.find(t => t.id === tile.id);
      if (!destTile || destTile.cursed) { showHexNotice("The company cannot muster on cursed land."); return; }
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
      const orders: NonNullable<typeof groupQuote>["orders"] = [];
      let excluded = 0, totalEnergy = 0, slowest = 0;
      for (const id of selectedGroup) {
        const p = placements.find(p => p.awakenedId === id);
        const aw = tenderItems.find(a => a.id === id);
        if (!p || !aw || p.marchPath) { excluded++; continue; }
        let done = false;
        for (const cand of candidates) {
          const room = 4 - ((occupants.get(cand.id) ?? 0) - (leaving.get(cand.id) ?? 0) + (assigned.get(cand.id) ?? 0));
          if (room <= 0) continue;
          if (cand.id === p.tileId) {
            orders.push({ awakenedId: id, tileId: cand.id, steps: 0, road: [cand.id], alreadyThere: true });
            assigned.set(cand.id, (assigned.get(cand.id) ?? 0) + 1);
            done = true; break;
          }
          const road = findRoadClient(p.tileId, cand.id);
          if (!road) continue;
          const steps = road.length - 1;
          orders.push({ awakenedId: id, tileId: cand.id, steps, road, alreadyThere: false });
          assigned.set(cand.id, (assigned.get(cand.id) ?? 0) + 1);
          leaving.set(p.tileId, (leaving.get(p.tileId) ?? 0) + 1);
          totalEnergy += steps * moveCost(aw.power);
          slowest = Math.max(slowest, steps * marchSecondsPerHex(aw));
          done = true; break;
        }
        if (!done) excluded++;
      }
      if (!orders.some(o => !o.alreadyThere)) {
        showHexNotice(excluded ? "None of the company can march there — no road, or no room." : "The company already stands there.");
        return;
      }
      setGroupQuote({ destId: destTile.id, orders, totalEnergy, slowest, excluded });
      return;
    }
    if (marchUiFor !== null) {
      // March orders are open: a tap QUOTES the march — road, time and
      // energy calculated and shown for the Tender's confirm.
      const homeP = placements.find(p => p.awakenedId === marchUiFor);
      const aw = tenderItems.find(a => a.id === marchUiFor);
      if (!homeP || !aw) { setMarchUiFor(null); setMarchQuote(null); return; }
      if (tile.id === homeP.tileId) { showHexNotice("It stands there already — tap the hex it should march to."); return; }
      const dest = tiles.find(t => t.id === tile.id);
      if (!dest || dest.cursed) { showHexNotice("No marching onto cursed land — that ground is taken by fighting, not by walking."); return; }
      const road = findRoadClient(homeP.tileId, tile.id);
      if (!road) { showHexNotice("No road of your own ground runs there — cursed land breaks the way."); return; }
      const steps = road.length - 1;
      setMarchQuote({
        tileId: tile.id, road, steps,
        seconds: steps * marchSecondsPerHex(aw),
        energy: steps * moveCost(aw.power),
      });
      return;
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
      if (touchMode) raiseHexConfirm("deploy", tile.id);
      else { setTargetHexId(tile.id); handleDeploy(tile.id); }
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
    // Phase 1: Try to get the targeted territory (with 5s timeout)
    try {
      const targetPromise = api.getWaveTarget();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("getWaveTarget timeout")), 5000)
      );
      const target = await Promise.race([targetPromise, timeoutPromise]) as Awaited<ReturnType<typeof api.getWaveTarget>>;
      if (target.tile) {
        setWaveTarget(target);
        setShowTargetMap(true);
      } else {
        // No territory — open battleground directly with client fallback
        console.warn("No target tile, using client fallback");
        setWaveTarget(null);
        setShowBattleground(true);
      }
    } catch (e) {
      console.error("Failed to get wave target, opening battleground directly", e);
      // Fallback: open battleground — client will pick a target tile
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
      showHexNotice("Commit Awoken in attack or defense stance first — towers alone cannot claim a victory.");
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
      setPlacements(refreshed.placements);
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
        setPlacements(refreshed.placements);
        await refreshEnergy();
        onUpdate();
      } catch (e) { console.error("Wave-pull resolve failed", e); }
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
      setPlacements(refreshed.placements);
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
      showHexNotice(`${a.name} is of the court — housed Awoken and the champion stay in hand for battles.`);
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
    // The empty state is the first-tile step above (fix list #3) — the
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

  // Render hex grid with mathematical perspective tilt.
  // Hex tiles are tilted (landscape view), Awoken are projected to the tilted
  // positions but drawn upright (not skewed).
  const renderGrid = () => {
    const size = HEX_BASE_SIZE * zoom;
    // XYZ grid (Nigel, 2026-10-15): one TRAY_LIFT of rise per tray
    // in a hex's stack. tilePos anchors the TOP tray; trays beneath
    // step down by TRAY_LIFT each, and everything standing on the
    // hex (Awoken, buildings) rides the same anchor to the top face.
    const TRAY_LIFT = Math.round(size * 0.2);
    // Center the (0,0) tile in the viewBox
    const originX = 250, originY = 170;
    // Isometric tiling vectors come from the ONE shared hex geometry
    // (ISO_E / ISO_SE / isoOffset at the top of this file) — the same
    // basis the overlay cells are solved from, so map, selection, and
    // hit-testing can never drift apart.
    const tilePos = (t: any) => {
      const { px, py } = isoOffset(t.q, t.r, size);
      const cx = originX + px + pan.x;
      const cy = originY + py + pan.y - (Math.max(1, t.height || 1) - 1) * TRAY_LIFT;
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
        const segs: { a: { cx: number; cy: number }; b: { cx: number; cy: number }; len: number }[] = [];
        let total = 0;
        for (let i = 0; i < centers.length - 1; i++) {
          const len = Math.hypot(centers[i + 1].cx - centers[i].cx, centers[i + 1].cy - centers[i].cy);
          segs.push({ a: centers[i], b: centers[i + 1], len }); total += len;
        }
        if (total <= 0) return null;
        const frac = Math.min(1, Math.max(0, (marchNow - p.marchSince) / (p.marchEnds - p.marchSince)));
        let d = frac * total;
        for (const s of segs) {
          if (d <= s.len) { const k = s.len ? d / s.len : 0; return { x: s.a.cx + (s.b.cx - s.a.cx) * k, y: s.a.cy + (s.b.cy - s.a.cy) * k }; }
          d -= s.len;
        }
        const last = centers[centers.length - 1];
        return { x: last.cx, y: last.cy };
      }
      const roadTiles = patrolRoadOf(p).map(id => tiles.find(t => t.id === id)).filter(Boolean) as TerritoryTile[];
      const home = tiles.find(t => t.id === p.tileId);
      if (!home || !roadTiles.length || !p.patrolSince) return null;
      const centers = [home, ...roadTiles].map(t => tilePos(t));
      const route = [...centers, ...centers.slice(1, -1).reverse()];
      const segs: { a: { cx: number; cy: number }; b: { cx: number; cy: number }; len: number }[] = [];
      let total = 0;
      for (let i = 0; i < route.length; i++) {
        const a = route[i], b = route[(i + 1) % route.length];
        const len = Math.hypot(b.cx - a.cx, b.cy - a.cy);
        segs.push({ a, b, len }); total += len;
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
        if (d <= s.len) { const k = s.len ? d / s.len : 0; return { x: s.a.cx + (s.b.cx - s.a.cx) * k, y: s.a.cy + (s.b.cy - s.a.cy) * k }; }
        d -= s.len;
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
      const hp = tileHp.get(t.id);
      const showHp = hp !== undefined && hp < 10;
      return (
        <g key={`entity-${t.id}`} transform={`translate(0,${lift})`}>
          {showHp && (
            <g transform={`translate(${cx},${cy - s * 0.7})`}>
              <rect x="-18" y="-8" width="36" height="14" rx="3" fill="rgba(0,0,0,0.7)" stroke="#ff4444" strokeWidth="1" />
              <text y="3" textAnchor="middle" fontSize="10" fill="#ff6666" fontWeight="bold">♥ {hp}/10</text>
            </g>
          )}
          {/* Buildings on this tile (max 2) */}
          {tileBuildings.map((b, bi) => {
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
            const bpx = tileBuildings.length === 1 ? { x: cx, y: cy + seatDrop } : { x: cx + (bi === 0 ? -s * 0.45 : s * 0.45), y: cy - s * 0.35 + seatDrop };
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
                  style={isBuilding ? { filter: "drop-shadow(0 0 12px #ffcc88)" } : undefined}
                />
                {isBuilding && (
                  <text x={bpx.x} y={bpx.y + bs * 0.4} textAnchor="middle" fontSize={8} fill="#ffcc88">
                    ⏱ {readyMin >= 60 ? `${Math.floor(readyMin/60)}h${readyMin%60}m` : `${readyMin}m`}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      );
    });

    // Awoken layer: renders ABOVE all buildings
    const awokenElements = sortedTiles.map((t) => {
      const { cx, cy } = tilePos(t);
      const s = size;
      const tilePlacements = placements.filter(p => p.tileId === t.id);
      const awokens = tilePlacements.map(p => tenderItems.find(a => a.id === p.awakenedId)).filter(Boolean) as Awakened[];
      const awoken = awokens[0] ?? null;
      const lift = t.cursed ? 0 : -5;
      if (!awokens.length) return null;
      return (
        <g key={`awoken-${t.id}`} transform={`translate(0,${lift})`}>
            <g>
              {awokens.slice(0, 4).map((a, idx) => {
                // 4 keystone points, REELED IN (Nigel, 2026-10-16): the
                // old spread (offsets up to 0.7 of the hex size) set the
                // company on the hex's outer perimeter — even a lone
                // Awoken anchored below its hex's middle. They now
                // cluster in the hex's heart, a slight front bias kept
                // for the iso view.
                const keystones = [
                  { dx: 0, dy: 0.28 },      // middle-front (default)
                  { dx: -0.30, dy: 0.14 }, // front-left
                  { dx: 0.30, dy: 0.14 },  // front-right
                  { dx: 0, dy: -0.24 },    // back-center
                ];
                const ks = keystones[idx];
                const ws = 15, hs = 20;
                const placement = tilePlacements.find(p => p.awakenedId === a.id);
                // The marching layer: a patrolling Awoken is drawn at
                // its DERIVED position on the road, not at its keystone
                // — presentation only; its placement never moves.
                const pPos = placement ? patrolPositionOf(placement) : null;
                const kx = pPos ? pPos.x : cx + ks.dx * s;
                const ky = pPos ? pPos.y + 0.28 * s : cy + ks.dy * s;
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
                const baseAhs = hs * awScale;
                const aws = ws * awScale * lvlScale, ahs = hs * awScale * lvlScale;
                const isWhispering = whisper?.awakenedId === a.id;
                // Each Awoken drifts on its own rhythm — subtle, never leaves its hex.
                const driftDur = (6 + (a.id % 5)).toFixed(1);
                const driftDelay = (-(a.id % 7)).toFixed(1);
                const isSelected = selectedAwoken === a.id;
                return (
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
                      if (attackTargeting || moveTargeting || battlePool.length > 0 || patrolSettingFor !== null || marchUiFor !== null || groupMarchUi) { handleHexTap(t); return; }
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
                      setSelectedAwoken(isSelected ? null : a.id);
                      setSelectedGroup([]); // a single choosing ends the company's
                      setGroupMarchUi(false);
                      setGroupQuote(null);
                      setAttackTargeting(false);
                      setMoveTargeting(false);
                      setStanceMinimized(false);
                    }}>
                    {/* Light aura glow behind Awoken */}
                    <ellipse cx={kx} cy={ky} rx={aws * 0.48} ry={ahs * 0.44}
                      fill="rgba(255,240,200,0.28)"
                      style={{ filter: "blur(6px)" }} />
                    <ellipse cx={kx} cy={ky} rx={aws * 0.38} ry={ahs * 0.34}
                      fill="rgba(255,250,230,0.22)"
                      style={{ filter: "blur(4px)" }} />
                    {isWhispering && (
                      <ellipse cx={kx} cy={ky} rx={aws * 0.6} ry={ahs * 0.55}
                        fill="rgba(255,235,180,0.35)"
                        style={{ filter: "blur(8px)" }} />
                    )}
                    {isSelected && (
                      <circle cx={kx} cy={ky} r={14 * awScale * lvlScale} fill="none" stroke="#ffd700" strokeWidth="1.5" opacity="0.9" />
                    )}
                    <g style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.7))" }}>
                    <FieldAwoken awoken={a} assets={assets}
                      x={kx - aws / 2} y={ky + baseAhs / 2 - ahs}
                      width={aws} height={ahs} />
                    </g>
                    {placement && placement.stance !== "defense" && (
                      <text x={kx} y={ky + baseAhs / 2 - ahs - 4} textAnchor="middle" fontSize={7}
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
                            <text key={i} x={kx} y={ky + baseAhs / 2 - ahs - 12 - (lines.length - 1 - i) * 9}
                              textAnchor="middle" fontSize="7.5" fontStyle="italic"
                              fill="#e8d5a8" className="whisper-text">
                              {ln}
                            </text>
                          ))}
                        </g>
                      );
                    })()}
                  </g>
                );
              })}
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
        <g key={t.id} transform={`translate(0,${lift})`}>
          {/* Isometric tile: 1920x1280 PNG; painted face measured 1730×944
              with its center at (964, 546) source px. The x/y place the
              image so the face center lands exactly on the tile's
              lattice point (cx, cy); imgOff seats off-template art. */}
          {t.cursed ? (
            <image href={TERRAIN[tileKey]}
              x={cx - s * 1.2106 + imgOff.dx * s} y={cy - s * 0.6857 + (imgOff.dy + (TERRAIN_IMG_PLACE[tileKey]?.dy ?? 0)) * s} width={s * 2.41} height={s * (TERRAIN_IMG_PLACE[tileKey]?.h ?? 1.608)}
              preserveAspectRatio="xMidYMid meet"
              style={auraTiles.has(t.id) ? { filter: "drop-shadow(0 0 12px rgba(255,215,0,0.9)) brightness(1.15)" } : undefined} />
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
                  style={i === total - 1 && auraTiles.has(t.id) ? { filter: "drop-shadow(0 0 12px rgba(255,215,0,0.9)) brightness(1.15)" } : undefined} />
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
                <circle cx={cx + s * 0.48} cy={cy - s * 0.52} r={s * 0.30} fill="rgba(8,6,10,0.85)" stroke={col} strokeWidth={1.6} />
                {nextStage === "neutral"
                  ? <text x={cx + s * 0.48} y={cy - s * 0.40} textAnchor="middle" fontSize={s * 0.34} fill={col}>◇</text>
                  : <g transform={`translate(${cx + s * 0.22}, ${cy - s * 0.624})`}><ElementGlyph element={nextStage as GlyphElement} color={col} width={s * 0.52} height={s * 0.208} /></g>}
                {eta && <text x={cx + s * 0.48} y={cy + s * 0.18} textAnchor="middle" fontSize={s * 0.42} fill="#f0e6cc" stroke="rgba(0,0,0,0.9)" strokeWidth={3.4} paintOrder="stroke">{eta}</text>}
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
              War-Grounds panel reads stack power by — never ⚡,
              which is the Tender's energy and nothing else's. */}
          {!t.cursed && (
            <g pointerEvents="none">
              <rect x={cx - s * 0.98} y={cy + s * 0.80} width={s * 1.96} height={s * 0.36} rx={s * 0.18} fill="rgba(8,6,10,0.82)" />
              <text x={cx} y={cy + s * 1.06} textAnchor="middle" fontSize={s * 0.26} fill="#f0e6cc">
                {`Z${(t as any).height ?? 1} · ⚔${(((t as any).stackPower ?? 0) as number).toFixed(1).replace(/\.0$/, "")} · ♥${(t as any).topHp ?? 0}`}
              </text>
            </g>
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
              <text x={cx} y={cy + 8} textAnchor="middle" fontSize={8}
                fill="#ff6666" opacity="0.95" fontWeight="bold">
                ♥ {hp}
              </text>
              {thorns > 1 && (
                <text x={cx} y={cy + 18} textAnchor="middle" fontSize={7}
                  fill="#ffaa00" opacity="0.9" fontWeight="bold">
                  🌵 {thorns}
                </text>
              )}
              </g>
            );
          })()}
          {/* Burning tile: Fire III art */}
          {t.spark === 2 && fireAspectImg && (
            <image href={fireAspectImg} x={cx - 40} y={cy - 50} width={80} height={80}
              preserveAspectRatio="xMidYMid meet" opacity="0.7" pointerEvents="none" />
          )}
          {/* Spark: fire aspect waiting to be claimed */}
          {t.spark === 1 && (
            <g onClick={(e) => { e.stopPropagation(); if (bandJustClosed()) return; handleSparkClick(t.id); }} style={{ cursor: "pointer" }}>
              {fireAspectImg ? (
                <image href={fireAspectImg} x={cx - 30} y={cy - 40} width={60} height={60}
                  preserveAspectRatio="xMidYMid meet" opacity="0.95" />
              ) : (
                <text x={cx} y={cy - 10} textAnchor="middle" fontSize={24} fill="#ff6600" opacity="0.95">🔥</text>
              )}
              <text x={cx} y={cy + 25} textAnchor="middle" fontSize={8}
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
          {/* The hit target IS the visible hex (the fitted cell above) —
              invisible itself; the corruption glow over the terrain face
              is what marks cursed ground now. */}
          <polygon points={pts}
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

          {/* Awoken render in entity layer */}
        </g>
      );
    });
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
          <g key="target-hex-hover" transform={`translate(0,${lift})`} pointerEvents="none">
            <polygon points={hexCellPoints(cx, cy, s)} fill="rgba(255,215,0,0.07)" stroke="rgba(255,215,0,0.55)" strokeWidth={1.5} strokeLinejoin="round" />
          </g>
        );
      }
      if (kind === "mist") {
        return (
          <g key="target-hex-mist" className="target-hex-mist" transform={`translate(0,${lift})`} pointerEvents="none">
            <polygon points={hexCellPoints(cx, cy, s)} fill="rgba(255,244,214,0.20)" stroke="rgba(255,236,180,0.85)" strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />
            <polygon points={hexCellPoints(cx, cy, s, 0.82)} fill="rgba(255,248,228,0.12)" stroke="none" />
          </g>
        );
      }
      return (
        <g key="target-hex-marker" className="target-hex-marker" transform={`translate(0,${lift})`} pointerEvents="none">
          <polygon className="target-hex-pulse" points={hexCellPoints(cx, cy, s, 1.05)} fill="rgba(255,215,0,0.10)" stroke="#ffd700" strokeWidth={3} strokeLinejoin="round" />
          <polygon points={hexCellPoints(cx, cy, s, 0.93)} fill="none" stroke="#ffedb0" strokeWidth={1.5} strokeLinejoin="round" />
          <g>
            <animateTransform attributeName="transform" type="translate" values="0 0; 0 3; 0 0" dur="1.6s" repeatCount="indefinite" />
            <polygon points={`${cx - 7},${cy - s * 1.14} ${cx + 7},${cy - s * 1.14} ${cx},${cy - s * 0.82}`} fill="#ffd700" stroke="#7a5c00" strokeWidth={0.75} strokeLinejoin="round" />
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
          const filter = `${GRIM_HUE_FILTERS[w.hue] ?? "none"} drop-shadow(0 0 5px ${GRIM_HUE_GLOWS[w.hue] ?? "#ffd98a"})`;
          const spName = grim?.spells.find((sp) => sp.key === w.spellKey)?.name ?? w.spellKey;
          const title = `${spName} — ${w.kind}${w.engine === "trees" ? ` · ❤${w.hp}` : ""}${w.engine === "seal" ? ` · ❤${w.hp} · ${Math.max(0, (w.nums.stops ?? 3) - w.stops)} stops left` : ""}${w.engine === "lattice" ? ` · ❤${w.hp}` : ""}${w.engine === "blade" ? ` · ${w.charges} springs left` : ""}${w.pour > 0 ? ` · poured ${w.pour}` : ""}`;
          if (w.kind === "ward" && w.q != null && w.r != null && w.dir != null) {
            const wt = tiles.find((tt) => tt.q === w.q && tt.r === w.r);
            const c = wt ? tilePos(wt) : (() => { const { px, py } = isoOffset(w.q, w.r, size); return { cx: originX + px + pan.x, cy: originY + py + pan.y }; })();
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
                <line x1={v[0]} y1={v[1]} x2={n[0]} y2={n[1]} stroke={taken ? "rgba(140,140,140,0.35)" : "rgba(183,166,255,0.8)"} strokeWidth={3} strokeDasharray="6 4" pointerEvents="none" />
                {!taken && (
                  <line x1={v[0]} y1={v[1]} x2={n[0]} y2={n[1]} stroke="rgba(183,166,255,0.03)" strokeWidth={26} strokeLinecap="round" style={{ cursor: "pointer" }}
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
          const c = wt ? tilePos(wt) : (() => { const { px, py } = isoOffset(w.q, w.r, size); return { cx: originX + px + pan.x, cy: originY + py + pan.y }; })();
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
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#e8a13c" strokeWidth={size * 0.035} strokeDasharray="2 6" strokeLinecap="round" />
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
                    <line x1={v[0]} y1={v[1]} x2={n[0]} y2={n[1]} stroke={taken ? "rgba(140,140,140,0.35)" : "rgba(255,215,0,0.6)"} strokeWidth={3} strokeDasharray="6 4" pointerEvents="none" />
                    {!taken && (
                      <line x1={v[0]} y1={v[1]} x2={n[0]} y2={n[1]} stroke="rgba(255,215,0,0.02)" strokeWidth={24} strokeLinecap="round" style={{ cursor: "pointer" }}
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
              strokeWidth={isOpen ? 2.5 : 2}
              strokeDasharray={isOpen ? undefined : "1 6"}
              strokeLinecap="round"
              style={{ cursor: "pointer" }}
              onClick={(e) => { e.stopPropagation(); setWgTileId(t.id); }}
            />
          );
        })}
      </g>
    ) : null;
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
              stroke="rgba(255,215,0,0.85)" strokeWidth={2} strokeDasharray="1 6" strokeLinecap="round" />
          )}
          {pts.slice(1).map((c, i) => (
            <g key={i}>
              <circle cx={c.cx} cy={c.cy} r={11} fill="rgba(20,20,35,0.92)" stroke="#ffd700" strokeWidth={1.5} />
              <text x={c.cx} y={c.cy + 4} textAnchor="middle" fontSize={11} fill="#ffd700" fontWeight={700}>{i + 1}</text>
            </g>
          ))}
        </g>
      );
    })() : null;
    // March trace: a quoted march draws its road dotted to the
    // destination flag, so the Tender sees the way before confirming.
    // A quoted company march draws every warden's road the same way.
    const marchGuideLayer = (marchQuote || groupQuote) ? (() => {
      const roads: number[][] = marchQuote
        ? [marchQuote.road]
        : (groupQuote?.orders.filter(o => !o.alreadyThere).map(o => o.road) ?? []);
      if (!roads.length) return null;
      return (
        <g key="march-guide">
          {roads.map((road, i) => {
            const pts = road.map(id => tiles.find(t => t.id === id)).filter(Boolean).map(t => tilePos(t as TerritoryTile));
            if (pts.length < 2) return null;
            const dest = pts[pts.length - 1];
            return (
              <g key={i}>
                <polyline points={pts.map(c => `${c.cx},${c.cy}`).join(" ")} fill="none"
                  stroke="rgba(255,215,0,0.85)" strokeWidth={2} strokeDasharray="1 6" strokeLinecap="round" />
                <circle cx={dest.cx} cy={dest.cy} r={15} fill="rgba(255,215,0,0.08)" stroke="#ffd700" strokeWidth={2} strokeDasharray="3 4" />
                <text x={dest.cx} y={dest.cy + 5} textAnchor="middle" fontSize={14} fill="#ffd700">⚑</text>
              </g>
            );
          })}
        </g>
      );
    })() : null;
    // The drag band itself, while the hand is down.
    const bandLayer = band ? (
      <rect key="drag-band"
        x={Math.min(band.x0, band.x1)} y={Math.min(band.y0, band.y1)}
        width={Math.abs(band.x1 - band.x0)} height={Math.abs(band.y1 - band.y0)}
        fill="rgba(255,215,0,0.10)" stroke="#ffd700" strokeWidth={1.2} strokeDasharray="5 4" pointerEvents="none" />
    ) : null;
    return (
      <>
        {elements}
        {buildingElements}
        {awokenElements}
        {wallLayer}
        {workingsLayer}
        {castEdgeLayer}
        {wgGuideLayer}
        {patrolGuideLayer}
        {marchGuideLayer}
        {bandLayer}
        {hoverLayer}
        {mistLayer}
        {targetMarker}
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
      <p className="quiet">No hall stands yet. Raise the 🏰 Hall of Champions from the build menu — a castle haunted by ancient Awoken, where your champions will dwell, be fed, and grow.</p>
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
                Feed {amt}⚡ → {amt * 2} XP
              </button>
            ))}
            <button className="abtn small" onClick={() => unhouse.mutate(room.roomIndex)}>Leave room</button>
            {championId === resident.id
              ? <span className="quiet" style={{ alignSelf: "center" }}>Your champion — represents you in the Confluence.</span>
              : <button className="abtn small" disabled={makeChampion.isPending} onClick={() => makeChampion.mutate(resident.id)} title="Crown this Awoken as your champion">⭐ Make Champion</button>}
          </div>
          {feedNote && <div className={`hall-feed-note ${feedNote.tone}`}>{feedNote.text}</div>}
        </div>
      ) : (
        <div>
          <p className="quiet">Room {room.roomIndex + 1} stands empty. House an Awoken:</p>
          <div className="champion-field-list" style={{ maxHeight: 150 }}>
            {tenderItems.filter(a => !housedIds.has(a.id)).map(a => (
              <div key={a.id} className="champion-field-item">
                <img src={a.image_url} alt={a.name} />
                <div className="champion-field-info"><div>{a.name}</div><div className="quiet">Lv {a.level ?? 0} · {a.xp_into_level ?? 0}/{a.xp_for_next_level ?? 0} XP · {a.power}⚔ {a.toughness}🛡</div></div>
                <button className="abtn small" onClick={() => house.mutate({ roomIndex: room.roomIndex, awakenedId: a.id })}>House</button>
              </div>
            ))}
            {tenderItems.filter(a => !housedIds.has(a.id)).length === 0 && <p className="quiet">Every Awoken is housed or none remain.</p>}
          </div>
        </div>
      ))}
      {cost && !hall.upgrading && (
        <div style={{ marginTop: 12 }}>
          <div className="celestial-title" style={{ fontSize: 14 }}>Raise the Hall to Level {hall.level + 1}</div>
          <div style={{ fontSize: 13, display: "grid", gap: 4 }}>
            <div>⚡ Energy: {fund.energy}/{cost.energy}
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

/** Aspect attunement panel: hand-drawn element glyphs flowing into meters. Toggled by dock button. */
function AspectAttunement({ visible, onClose, tenderItems, placedIds, onUpdate, onApplyAspect, targetAwokenId, onDeepenAspect }: { visible: boolean; onClose: () => void; tenderItems: any[]; placedIds: Set<number>; onUpdate: () => void; onApplyAspect: (aspect: any) => void; targetAwokenId?: number | null; onDeepenAspect?: (wornAspect: any) => void }) {
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  if (!visible) return null;
  const { data } = useQuery({
    queryKey: ["aspectAttunement"],
    queryFn: () => api.getAspectAttunement(),
    refetchInterval: 30000,
    staleTime: 0,
  });
  if (!data) return null;

  const elements = [
    { id: "tide", label: "Tide" },
    { id: "sky", label: "Sky" },
    { id: "stone", label: "Stone" },
    { id: "root", label: "Root" },
  ];
  // Fire appears only after discovering the first spark
  const showFire = typeof window !== "undefined" && localStorage.getItem("awoken-fire-found") === "1";
  if (showFire) {
    elements.push({ id: "fire", label: "Fire" });
  }

  return (
    <div className="aspect-attunement celestial">
      <button className="aspect-close" onClick={onClose} title="Close">✕</button>
      <div className="celestial-title">Aspect Attunement</div>
      {elements.map(el => {
        const points = data.levels[el.id] ?? 0;
        const pct = Math.min(100, (points / data.threshold) * 100);
        const aspectCount = (data.inventory || []).filter((i: any) => i.element === el.id).length;
        const rate = (data.rates && data.rates[el.id]) || 0;
        return (
          <div key={el.id} className="celestial-row" title={`${el.label}: ${points.toFixed(1)}/${data.threshold} · +${rate}/hr`}>
            <ElementGlyph element={el.id as GlyphElement} className="glyph-svg" width={60} height={24} />
            <div className="celestial-track"><div className="celestial-progress" style={{ width: `${pct}%` }} /></div>
            <span className="celestial-rate" style={{ fontSize: 11, opacity: rate > 0 ? 0.95 : 0.45, minWidth: 52, textAlign: "right", color: "#e8d5a0" }}>{rate > 0 ? `+${rate}/hr` : "—"}</span>
            <button
              className="celestial-orb"
              title={`${aspectCount} ${el.label} aspects ready — tap, then tap an Awoken`}
              onClick={() => {
                const aspects = (data.inventory || []).filter((i: any) => i.element === el.id);
                if (aspects.length > 0) {
                  onApplyAspect(aspects[0]);
                }
              }}
              disabled={aspectCount === 0}
            >
              {aspectCount}
            </button>
          </div>
        );
      })}
      {targetAwokenId && onDeepenAspect && (() => {
        const wornEntry = (data.wornAspects || []).find((w: any) => w.awakenedId === targetAwokenId);
        if (!wornEntry) return null;
        return (
          <div style={{ marginTop: 10, borderTop: "1px solid rgba(232,213,160,0.25)", paddingTop: 8 }}>
            <div className="celestial-title" style={{ fontSize: 12 }}>Worn by {wornEntry.name} — tap an orb above: a new element stacks (up to 3); one already worn rises a level at the normal cost, if the pool can pay. Or deepen one here:</div>
            {wornEntry.aspects.map((wa: any) => {
              const pool = Math.floor((data.levels && data.levels[wa.element]) ?? 0);
              const maxed = (wa.level ?? 1) >= 4;
              const cost = wa.level ?? 1;
              const confirming = confirmKey === wa.key;
              return (
                <div key={wa.key} style={{ marginTop: 4 }}>
                  <div className="celestial-row">
                    <span style={{ fontSize: 12, color: "#e8d5a0", flex: 1 }}>{wa.name} · {wa.element} · Lv {wa.level}</span>
                    {!confirming && (
                      <button
                        className="abtn small"
                        disabled={maxed}
                        title={maxed ? "Already at max level" : `Raise ${wa.name} to Lv ${(wa.level ?? 1) + 1} — costs ${cost} ${wa.element} attunement point${cost > 1 ? "s" : ""} (the pool holds ${pool})`}
                        onClick={() => setConfirmKey(wa.key)}
                      >
                        {maxed ? "Max" : `Upgrade · ${cost} ${wa.element} pt${cost > 1 ? "s" : ""}`}
                      </button>
                    )}
                  </div>
                  {confirming && !maxed && (
                    <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "4px 0 2px", fontSize: 12, color: "#e8d5a0" }}>
                      <span style={{ flex: 1 }}>Raise {wa.name} to Lv {(wa.level ?? 1) + 1} for {cost} {wa.element} point{cost > 1 ? "s" : ""}? (Pool: {pool})</span>
                      <button className="abtn small" disabled={pool < cost} onClick={() => { setConfirmKey(null); onDeepenAspect(wa); }}>Confirm</button>
                      <button className="abtn small" onClick={() => setConfirmKey(null)}>Cancel</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}

  return (
    <div className="territory-view">
      {territoryLoaded && tiles.length === 0 && (() => {
        // The first-tile step (fix list #3): a Tender with no ground
        // gathers the company that faces the Unraveler. The court stays
        // in hand, as everywhere — housed Awoken and the champion are
        // never offered for the company.
        const eligible = tenderItems.filter(a => !isCourt(a));
        const teamPower = firstTeam.reduce((sum, id) => sum + (tenderItems.find(a => a.id === id)?.power ?? 0), 0);
        const handPower = eligible.reduce((sum, a) => sum + a.power, 0);
        const toggleFirstTeam = (id: number) => setFirstTeam(prev =>
          prev.includes(id) ? prev.filter(x => x !== id) : prev.length >= 6 ? prev : [...prev, id]);
        const suggestFirstTeam = () => {
          const picked: number[] = [];
          let sum = 0;
          for (const a of [...eligible].sort((x, y) => y.power - x.power)) {
            if (picked.length >= 6 || sum >= 7) break;
            picked.push(a.id);
            sum += a.power;
          }
          setFirstTeam(picked);
        };
        return (
          <section className="first-claim" aria-live="polite">
            <p className="eyebrow">The Last Bastion</p>
            <h2>No ground is held — yet.</h2>
            <p>The Unraveler waits in the wilds at power 7. Gather a company of up to six of your Awoken whose combined power reaches 7, and face it together. The first four named will stand upon the bastion when the dark breaks. Purification frees no newborn — only the Boss, when it falls, frees one.</p>
            {initialPatrolIds && initialPatrolIds.length > 0 && firstTeam.length > 0 && (
              <p className="patrol-arrived">🚶 Your patrol from the spark is gathered below — the first three you woke, already named to the company. Face the Unraveler together, and the first ground they take will be purified, with the patrol standing upon it.</p>
            )}
            {eligible.length === 0 ? (
              <p className="quiet">Your deck is empty — wake Awoken at the spark first, then return to claim your ground.</p>
            ) : (
              <>
                <div className="first-claim-team">
                  {eligible.map(a => (
                    <button key={a.id} type="button" className={`first-claim-card ${firstTeam.includes(a.id) ? "in-pool" : ""}`} onClick={() => toggleFirstTeam(a.id)} aria-pressed={firstTeam.includes(a.id)}>
                      <img src={a.image_url} alt={a.name} />
                      <div className="first-claim-card-name">{a.name}</div>
                      <div className="quiet">{a.power}⚔ {a.toughness}🛡</div>
                    </button>
                  ))}
                </div>
                <div className="first-claim-actions">
                  <span>Company power: {teamPower} / 7</span>
                  <button type="button" className="abtn" onClick={suggestFirstTeam}>Gather the strongest</button>
                  <button type="button" className="abtn" disabled={teamPower < 7 || firstTeam.length === 0 || firstClaimBusy} onClick={() => void handleFirstClaim()}>
                    {firstClaimBusy ? "Facing…" : "Face the Unraveler"}
                  </button>
                </div>
                {teamPower < 7 && (handPower >= 7
                  ? <p className="quiet">Choose more of your Awoken — together they must reach 7.</p>
                  : <p className="quiet">Even together, your Awoken reach only {handPower}. Wake more at the spark, and return when the company is strong enough.</p>)}
                {firstClaimError && <p className="notice error" role="status">{firstClaimError}</p>}
              </>
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
          <div className="celestial-title" style={{ marginTop: 12, fontSize: 14 }}>Field Awoken</div>
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
              <p className="quiet">No Awoken on the field.</p>
            )}
          </div>
        </div>
        </>
      )}
      <AspectAttunement visible={showAspects} onClose={() => { setShowAspects(false); setApplyingToTarget(null); }} tenderItems={tenderItems} placedIds={placedIds} onUpdate={onUpdate} targetAwokenId={applyingToTarget} onDeepenAspect={async (wornAspect: any) => {
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
          Tap an Awoken to apply {applyingAspect.name} — tap here to cancel
        </div>
      )}
      <button
        className="champion-fab"
        onClick={() => setShowChampionTab(!showChampionTab)}
        title="Champion"
      >
        <svg viewBox="0 0 32 32" width="28" height="28">
          <path d="M16,2 L20,12 L30,12 L22,18 L25,28 L16,22 L7,28 L10,18 L2,12 L12,12 Z"
            fill="none" stroke="#d4af6a" strokeWidth="1.5"/>
        </svg>
      </button>
      <button
        className="aspect-fab"
        onClick={() => setShowAspects(!showAspects)}
        title="Aspect Attunement"
      >
        <svg viewBox="0 0 32 32" width="28" height="28">
          <path d="M16,4 C16,4 10,10 10,16 C10,22 14,26 16,28 C18,26 22,22 22,16 C22,10 16,4 16,4 Z"
            fill="none" stroke="#d4af6a" strokeWidth="1.5"/>
          <path d="M16,8 C13,12 13,18 16,24" fill="none" stroke="#d4af6a" strokeWidth="1" opacity="0.6"/>
          <circle cx="16" cy="16" r="2.5" fill="#e8d5a0" opacity="0.9"/>
        </svg>
      </button>
      {/* Left panel: Champion + Hall of Legends (collapsable) */}

      {showChampionPicker && (
        <div className="champion-picker-overlay" onClick={() => setShowChampionPicker(false)}>
          <div className="champion-picker" onClick={e => e.stopPropagation()}>
            <h3>Choose your champion</h3>
            <p className="quiet">Any of your Awoken can bear the title, wherever they stand. The champion's pieces pass into confluence victory births. The Hall is where champions are trained — fed and leveled.</p>
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
            <div className="return-report-label">Upon your return, an Awoken speaks:</div>
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
      {showFriends && <Friends onClose={() => setShowFriends(false)} hand={hand} />}
      {!legends.champion && (
        <button className="champion-fab" onClick={() => setShowChampionPicker(true)} title="Choose your champion">
          🏆
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
      {selectedAwoken !== null && (() => {
        const placement = placements.find(p => p.awakenedId === selectedAwoken);
        const awoken = tenderItems.find(a => a.id === selectedAwoken);
        if (!placement || !awoken) return null;
        // Position the picker over the Awoken in the field
        const tile = tiles.find(t => t.id === placement.tileId);
        if (!tile) return null;
        const size = HEX_BASE_SIZE * zoom;
        const TRAY_LIFT = Math.round(size * 0.2);
        const { px, py } = isoOffset(tile.q, tile.r, size);
        const cx = 250 + px + pan.x;
        const cy = 170 + py + pan.y - (Math.max(1, tile.height || 1) - 1) * TRAY_LIFT;
        // Render as HTML overlay positioned over the Awoken
        return (
          <div 
            className={`stance-picker-field ${stanceMinimized ? "minimized" : ""}`} 
            style={{
              left: `${(cx / 500) * 100}%`,
              top: `${(cy / 340) * 100}%`,
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setSelectedAwoken(null);
              setAttackTargeting(false);
              setMoveTargeting(false);
              setStanceMinimized(false);
            }}
          >
            {stanceMinimized && (
              <button 
                className="stance-minimized-badge"
                onClick={() => setStanceMinimized(false)}
                title="Expand stance options"
              >
                {placement.stance === "attack" ? "⚔" : placement.stance === "defense" ? "🛡" : placement.stance === "binding" ? "✦" : "○"}
              </button>
            )}
            {!stanceMinimized && (<>
            <div className="stance-picker-name">{awoken.name}</div>
            <div className="stance-picker-stats">
              <span title="Power">⚔ {awoken.power}</span>
              <span title="Toughness">🛡 {awoken.toughness}</span>
              <span title="Health">❤ {awokenHp.get(awoken.id) ?? awoken.toughness}/{awoken.toughness}</span>
              <span title="Level">Lv {awoken.level ?? Math.floor(Math.sqrt((awoken.experience ?? 0) / 100))}</span>
              <span title="Experience">✦ {awoken.experience ?? 0} XP{typeof awoken.xp_into_level === "number" && typeof awoken.xp_for_next_level === "number" ? ` (${awoken.xp_into_level}/${awoken.xp_for_next_level} to Lv ${(awoken.level ?? 0) + 1})` : ""}</span>
            </div>
            <div className="stance-picker-elements">
              {(() => {
                // Elemental points: pieces = 1 pt; aspects = 1 pt per level (I/II/III).
                // Feeds the stronger-element calc for terraforming.
                const pts: Record<string, number> = {};
                for (const l of (awoken.layers || [])) {
                  const el = elementForPiece(l.name || "", (l as any).element);
                  if (el === "neutral") continue;
                  const w = l.category === "aspect" ? ((l as any).aspectLevel ?? 1) : 1;
                  pts[el] = (pts[el] ?? 0) + w;
                }
                return Object.entries(pts).map(([el, n]) => (
                  <span key={el} className={`element-tag ${el}`} title={`${n} ${el} point${n === 1 ? "" : "s"}`}>
                    {el === "tide" ? "🌊" : el === "sky" ? "🌪️" : el === "stone" ? "🪨" : el === "root" ? "🌱" : "🔥"} {el} {n}
                  </span>
                ));
              })()}
            </div>
            <div className="stance-buttons">
              <button
                className={`stance-btn ${placement.stance === "attack" ? "active" : ""}`}
                onClick={() => handleSetStance(selectedAwoken, "attack")}
                title="Focus all power on one tile. Attack an adjacent cursed tile to purify it.">
                ⚔ Attack
              </button>
              <button
                className={`stance-btn ${placement.stance === "defense" ? "active" : ""}`}
                onClick={() => handleSetStance(selectedAwoken, "defense")}
                title="Hold ground. Generates 1 energy. Protects your purified land.">
                🛡 Defense
              </button>
              <button
                className={`stance-btn ${placement.stance === "binding" ? "active" : ""}`}
                onClick={() => handleSetStance(selectedAwoken, "binding")}
                title="Channel power into the land: feeds attunement and mends the wounded. Costs 2 energy.">
                ✦ Binding
              </button>
              {(() => {
                // Check if this Awoken has Fire III aspect
                const layers = awoken.layers || [];
                const aspect = layers.find((l: any) => l.category === "aspect");
                // Judged by the aspect's own record alone — its
                // filed element and its level — never by its name
                // (Nigel, 2026-10-16; the name tests that stood here
                // could crown a fire-named level-I aspect as Fire III).
                const isFireIII = aspect &&
                  ((aspect as any).aspectElement === "fire" || (aspect as any).element === "fire") &&
                  (aspect as any).aspectLevel === 3;
                if (!isFireIII) return null;
                return (
                  <button
                    className="stance-btn ignite"
                    onClick={async () => {
                      try {
                        const result = await api.igniteWildfire({ awakenedId: selectedAwoken, tileId: placement.tileId });
                        alert(`Wildfire ignited! ${result.ignitedTileIds.length} tiles burning.`);
                        const refreshed = await api.getTerritory();
                        setTiles(refreshed.tiles);
                        onUpdate();
                      } catch (e) {
                        alert((e as Error).message || "Ignition failed");
                      }
                    }}
                    title="Ignite wildfire (13 energy). Requires Fire III aspect.">
                    🔥 Ignite (13⚡)
                  </button>
                );
              })()}
              <button
                className={`stance-btn ${wallTargeting ? "active" : ""}`}
                onClick={() => { setWallTargeting(w => !w); setAttackTargeting(false); setMoveTargeting(false); }}
                title="Raise a wall on one edge of this hex (2 energy). Tap the glowing edge itself — one tap, one wall. Enemies in battle strike the wall before the Awoken behind it.">
                🧱 {wallTargeting ? "Tap an edge…" : "Raise wall (2⚡)"}
              </button>
              <button
                className="stance-btn"
                disabled={battleActive}
                onClick={() => { setWgTileId(placement.tileId); setWallTargeting(false); setAttackTargeting(false); setMoveTargeting(false); }}
                title="Open the War-Grounds for this hex: one enlarged hex for fine work — raise walls on fat edges, seat or demolish buildings, and read the tile's state plainly.">
                ⚔️ War-Grounds
              </button>
              <button
                className="stance-btn dissipate"
                onClick={async () => {
                  if (confirm("Dissipate this Awoken? It will enter 8h re-coalescence.")) {
                    try {
                      await api.dissipateAwoken({ awakenedId: selectedAwoken });
                      setSelectedAwoken(null);
                      onUpdate();
                    } catch (e) {
                      console.error("Dissipate failed", e);
                    }
                  }
                }}
                title="Voluntarily dissipate. 8h re-coalescence (double the 4h).">
                🌫 Dissipate
              </button>
            </div>
            <div className="feed-energy-row" style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, opacity: 0.85 }}>Feed energy → XP (×2 in the Hall · ×1 in the field):</span>
              {[1, 5, 10].map(amt => (
                <button
                  key={amt}
                  className="stance-btn"
                  disabled={energy < amt}
                  title={`Give ${amt} energy — XP at ×2 while ${awoken.name} dwells in the Hall, ×1 in the field`}
                  onClick={async () => {
                    try {
                      const r = await api.feedEnergy({ awakenedId: selectedAwoken, energy: amt });
                      setEnergy(e => Math.max(0, e - amt));
                      onUpdate();
                      alert(r.leveledUp ? `${awoken.name} fed ${amt}⚡ → +${r.xpGain} XP. Level ${r.newLevel}!${r.statPointsGained ? ` +${r.statPointsGained} stat point${r.statPointsGained > 1 ? "s" : ""}.` : ""}` : `${awoken.name} fed ${amt}⚡ → +${r.xpGain} XP.`);
                    } catch (e) {
                      alert((e as Error).message || "Feeding failed");
                    }
                  }}
                >
                  {amt}⚡
                </button>
              ))}
            </div>
            {attackTargeting && placement.stance === "attack" && (
              <div className="attack-hint">Tap an adjacent cursed tile to attack (1 energy)</div>
            )}
            {moveTargeting && (
              <div className="attack-hint">Tap an adjacent purified tile to move ({moveCost(awoken.power)} energy)</div>
            )}
            {/* The marching systems live within Move (Nigel, 2026-10-16):
                the button opens the march orders — a plain march from
                A to B (quoted, confirmed, walked for real) or a patrol
                road. On the march, the picker shows the road's state
                and the recall instead. */}
            {placement.marchPath ? (
              <>
                <span style={{ fontSize: 12, opacity: 0.9 }}>
                  🚶 On the march — arrives in {fmtMarchTime(((placement.marchEnds ?? marchNow) - marchNow) / 1000)}
                </span>
                <button
                  className="stance-btn"
                  onClick={async () => {
                    try {
                      const r = await api.recallMarch({ awakenedId: selectedAwoken });
                      await refreshMarching();
                      showHexNotice(r.stepsHome > 0 ? "Recalled — the warden turns for home." : "Recalled — it had barely left its post.");
                    } catch (e) {
                      showHexNotice(e instanceof Error ? e.message : "The recall failed.");
                    }
                  }}
                  title="Call the marcher home: it turns where it stands and walks back. The march's energy is spent either way.">
                  ↩ Recall
                </button>
              </>
            ) : !attackTargeting && !moveTargeting && marchUiFor === null && patrolSettingFor === null && (
              <button
                className="stance-btn"
                onClick={() => { setMarchUiFor(selectedAwoken); setMarchQuote(null); setStanceMinimized(true); }}
                title="March orders: tap a hex and the march is quoted — the road traced, the time and energy calculated — then confirm and it walks. Or lay a patrol road instead.">
                ➤ Move — march & patrol{placement.patrolPath ? ` (patrolling, ${patrolRoadOf(placement).length} waypoints)` : ""}
              </button>
            )}
            <button className="stance-close" onClick={() => { setSelectedAwoken(null); setAttackTargeting(false); setMoveTargeting(false); setTargetHexId(null); clearHexConfirm(); setStanceMinimized(false); }}>
              ✕
            </button>
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
        <button className="abtn" onClick={() => { setCastMode((c) => !c); setCastSpellKey(null); setCastAnchor(null); }} style={{ marginLeft: 8, borderColor: castMode ? "#b7a6ff" : "#8d7bd8" }} title="Open the Grimoire on the land: cast wards on hex edges, write runes on hex floors, mend with the binding light. The numbers are the book's, tuned in the workshop.">
          ✎ {castMode ? "Close the Written Light" : "Written Light"}
        </button>
        {castMode && (
          <div style={{ margin: "10px 0", padding: "10px 12px", border: "1px solid rgba(183,166,255,.5)", borderRadius: 10, background: "rgba(24,18,44,.88)" }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <strong style={{ color: "#e6ddff" }}>Pour:</strong>
              {GRIM_HUES.map((h) => (
                <button key={h} onClick={() => { setCastHue(h); setCastPour(0); }} className="abtn" style={{ borderColor: castHue === h ? (GRIM_HUE_GLOWS[h]) : "#555", color: castHue === h ? GRIM_HUE_GLOWS[h] : "#ccc", textTransform: "capitalize" }}>{h}</button>
              ))}
              <span style={{ marginLeft: "auto", color: "#cfc4f5" }}>⚡{energy} · Tender Lv {grimGate.level}</span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {(grim?.spells ?? []).map((sp) => {
                const locked = sp.kind !== "binding" && sp.engine !== "heal" && !grimGate.wardRuneUnlocked;
                const img = grimGlyphImg(sp.key);
                const sel = castSpellKey === sp.key;
                return (
                  <button key={sp.key} disabled={locked} onClick={() => { setCastSpellKey(sel ? null : sp.key); setCastAnchor(null); setCastPour(0); }}
                    className="abtn" style={{ borderColor: sel ? "#ffd98a" : "#555", display: "inline-flex", alignItems: "center", gap: 6, opacity: locked ? 0.55 : 1 }}
                    title={locked ? `Wakes at Tender Lv 3 — you stand at Lv ${grimGate.level}` : `${sp.name} — ${sp.kind} · ⚡${sp.cost}. ${sp.blurb}`}>
                    {img ? <img src={img} alt="" style={{ width: 18, height: 18, objectFit: "contain", filter: `${GRIM_HUE_FILTERS[castHue]} drop-shadow(0 0 3px ${GRIM_HUE_GLOWS[castHue]})` }} /> : <span>✦</span>}
                    {locked ? "🔒 " : ""}{(sp.forms[castHue] ?? sp.name)} · ⚡{sp.cost}
                  </button>
                );
              })}
              {!grim && <span style={{ color: "#cfc4f5" }}>The book is opening…</span>}
            </div>
            {castSpell && (castSpell.numbers.pourCap ?? 0) > 0 && castHue !== "unaligned" && (() => {
              const cap = Math.floor(castSpell.numbers.pourCap ?? 0);
              const pool = Math.floor((grimPoolsQ.data?.levels as any)?.[castHue] ?? 0);
              const maxPour = Math.min(cap, pool);
              const n = castSpell.numbers;
              const hpPreview = castSpell.engine === "shard" ? null
                : Math.max(1, Math.floor((n.hp ?? 6) + (n.hpPerLevel ?? 1) * grimGate.level + (n.hpPerPoint ?? 2) * castPour
                  + (castSpell.engine === "trees" && workings.some((w) => w.engine === "engine") ? (n.brightHpBonus ?? 2) : 0)));
              return (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
                  <strong style={{ color: "#e6ddff" }}>Feed it:</strong>
                  <button className="abtn" disabled={castPour <= 0} onClick={() => setCastPour((p) => Math.max(0, p - 1))}>−</button>
                  <span style={{ color: "#cfc4f5", minWidth: 150, textAlign: "center" }}>
                    Pour {castPour} {castHue} pt{castPour === 1 ? "" : "s"} <span style={{ opacity: 0.75 }}>(pool {pool} · cap {cap})</span>
                  </span>
                  <button className="abtn" disabled={castPour >= maxPour} onClick={() => setCastPour((p) => Math.min(maxPour, p + 1))}>+</button>
                  <span style={{ color: "#ffd98a" }}>
                    {castSpell.engine === "shard"
                      ? `→ +${castPour * (n.harmPerPoint ?? 1)} harm when it falls`
                      : `→ raised with ❤${hpPreview}`}
                  </span>
                </div>
              );
            })()}
            <div style={{ marginTop: 8, color: "#e6ddff", fontSize: 13 }}>
              {!castSpell && <>Choose a working. <strong>Wards</strong> stand on a hex's edge, <strong>runes</strong> are written on a hex's floor, and <strong>Heal</strong> mends your standing — by the book's numbers, snapshotted at the cast. Workings stand until spent, broken, or faded.</>}
              {castSpell?.engine === "heal" && <>Tap a hex your <strong>wounded</strong> stand on — Heal mends the most wounded there by {grimGate.healAmount} HP (your tier).</>}
              {castSpell?.kind === "ward" && castAnchor === null && <>Tap a hex <strong>your Awoken holds</strong> — then tap one of its glowing edges.</>}
              {castSpell?.kind === "ward" && castAnchor !== null && <>Tap a <strong>glowing edge</strong> of the anchor hex — or the hex again to choose another.</>}
              {castSpell && (castSpell.kind === "rune" || castSpell.kind === "spell") && <>Tap a hex's <strong>ground</strong> to write it there — cursed ground takes the light too, ahead of the march. One writing per hex.</>}
            </div>
            {workings.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ color: "#cfc4f5" }}>{workings.length} working{workings.length === 1 ? "" : "s"} standing:</span>
                <select value={fadePick ?? ""} onChange={(e) => setFadePick(e.target.value ? Number(e.target.value) : null)} style={{ maxWidth: 260 }}>
                  <option value="">— choose one to fade —</option>
                  {workings.map((w) => <option key={w.id} value={w.id}>{grim?.spells.find((sp) => sp.key === w.spellKey)?.forms[w.hue] ?? w.spellKey} ({w.kind})</option>)}
                </select>
                <button className="abtn" disabled={fadePick === null} onClick={async () => {
                  if (fadePick === null) return;
                  try { await api.fadeMapWorking({ id: fadePick }); setFadePick(null); await refreshWorkings(); showHexNotice("The light fades from the land — the page rests."); }
                  catch (e) { showHexNotice(e instanceof Error ? e.message : "It would not fade."); }
                }}>Fade it</button>
              </div>
            )}
          </div>
        )}
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

      <div className="territory-map"
        onPointerDown={(e) => {
          // Modality follows the actual input (#13 refined): a touch
          // raises mist + confirm; a mouse glows on hover and commits
          // on click. Pens count as touch — they tap like fingers.
          setTouchMode(e.pointerType !== "mouse");
          if (e.button === 2) return; // the right hand pans via the svg's own handlers, as ever
          // THE DRAG LAW (Nigel, 2026-10-16): a drag MOVES THE SCREEN
          // — until the War-Grounds are opened; while they are open,
          // the same drag draws the choosing band instead.
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
          // clock derivation the map draws); everyone else — the
          // standing and the patrolling — by their post.
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
            const road = marchRoadOf(p).map(id => tiles.find(tt => tt.id === id)).filter(Boolean) as TerritoryTile[];
            if (road.length >= 2 && p.marchSince && p.marchEnds && p.marchEnds > p.marchSince) {
              const centers = road.map(centerOf);
              const total = centers.reduce((s, c, i) => i === 0 ? 0 : s + Math.hypot(c.cx - centers[i - 1].cx, c.cy - centers[i - 1].cy), 0);
              if (total > 0) {
                let d = Math.min(1, Math.max(0, (Date.now() - p.marchSince) / (p.marchEnds - p.marchSince))) * total;
                for (let i = 0; i < centers.length - 1; i++) {
                  const len = Math.hypot(centers[i + 1].cx - centers[i].cx, centers[i + 1].cy - centers[i].cy);
                  if (d <= len) { const k = len ? d / len : 0; anchor = { cx: centers[i].cx + (centers[i + 1].cx - centers[i].cx) * k, cy: centers[i].cy + (centers[i + 1].cy - centers[i].cy) * k }; break; }
                  d -= len;
                  anchor = centers[centers.length - 1];
                }
              }
            }
            if (anchor.cx >= x0 && anchor.cx <= x1 && anchor.cy >= y0 && anchor.cy <= y1) chosen.push(p.awakenedId);
          }
          if (chosen.length === 1) {
            setSelectedGroup([]);
            setSelectedAwoken(chosen[0]);
            setStanceMinimized(false);
          } else if (chosen.length > 1) {
            setSelectedAwoken(null);
            setSelectedGroup(chosen);
          }
        }}
        onClick={() => {
        if (bandJustClosed()) return; // the band's own click is not a dismissal
        // Clicking empty map dismisses the stance box
        setSelectedAwoken(null);
        setSelectedGroup([]);
        setGroupMarchUi(false);
        setGroupQuote(null);
        setAttackTargeting(false);
        setMoveTargeting(false);
        setTargetHexId(null);
        clearHexConfirm();
      }}>
        <svg ref={svgRef} viewBox="0 0 500 340" className="territory-svg" style={{ width: "100%", height: "100%" }}
          onContextMenu={(e) => e.preventDefault()}
          onMouseDown={(e) => {
            if (e.button === 2) { // Right click
              dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
            }
          }}
          onMouseMove={(e) => {
            if (dragRef.current) {
              const dx = e.clientX - dragRef.current.x;
              const dy = e.clientY - dragRef.current.y;
              setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
            }
          }}
          onMouseUp={(e) => {
            if (e.button === 2) dragRef.current = null;
          }}
          onMouseLeave={() => { dragRef.current = null; }}>
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
            const imgSrc = enemyImgFor(u.type, enemyArtData?.art);
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
        let text = "";
        let confirmLabel = "Confirm";
        if (hexConfirm.kind === "attack") {
          text = `${actor?.name ?? "Your Awoken"} will strike this cursed hex — its thorns answer back.`;
          confirmLabel = "Strike";
        } else if (hexConfirm.kind === "move") {
          text = `${actor?.name ?? "Your Awoken"} will move to this hex — ${actor ? moveCost(actor.power) : 1}⚡.`;
          confirmLabel = "Move";
        } else {
          const pooled = battlePool.map(id => hand.find(a => a.id === id)).filter(Boolean) as Awakened[];
          const names = pooled.map(a => a.name).join(", ");
          const cost = pooled.reduce((sum, a) => sum + deployCost(a.power), 0);
          text = tile?.cursed
            ? `${names || "The readied company"} will assault this hex — if their combined power breaks the corruption, the land becomes yours. ${cost}⚡.`
            : `${names || "The readied company"} will take position on this hex. ${cost}⚡.`;
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
      {/* Bottom dock: energy orb + hand */}
      <div className="energy-orb-fixed">
        <EnergyTimer />
      </div>
      <div className="bottom-dock">
        <div className="hand-label">Tap cards to ready them for battle — then tap a purified hex to deploy</div>
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
            </button>
            );
          })}
          {hand.length === 0 && <div className="dock-empty">All Awoken stand on the field.</div>}
        </div>
        </div>
      </div>
      <div className="nav-compass">
        <button className="compass-btn north" onClick={() => setPan(p => ({ ...p, y: p.y + 40 }))} aria-label="Pan up">▲</button>
        <button className="compass-btn west" onClick={() => setPan(p => ({ ...p, x: p.x + 40 }))} aria-label="Pan left">◀</button>
        <button className="compass-btn east" onClick={() => setPan(p => ({ ...p, x: p.x - 40 }))} aria-label="Pan right">▶</button>
        <button className="compass-btn south" onClick={() => setPan(p => ({ ...p, y: p.y - 40 }))} aria-label="Pan down">▼</button>
        <button className="compass-btn zoom-in" onClick={() => setZoom(z => Math.min(z + 0.2, 3))} aria-label="Zoom in">＋</button>
        <button className="compass-btn zoom-out" onClick={() => setZoom(z => Math.max(z - 0.2, 0.5))} aria-label="Zoom out">－</button>
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
                : "No defenders! You must play Awoken from hand (costs energy)."}
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
            onClose={() => setShowBattleground(false)}
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
        🏰
      </button>

      {/* War-Grounds button — the fine-edit panel from the map screen
          itself (Nigel, 2026-10-16): one tap opens the panel on the
          selected Awoken's hex (or the first stationed Awoken's), the
          same panel the stance picker opens. Shut during battle. */}
      <button
        className={`wg-toggle ${wgTileId !== null ? "open" : ""}`}
        onClick={() => {
          if (battleActive) return;
          if (wgTileId !== null) { setWgTileId(null); return; }
          const sel = selectedAwoken !== null ? placements.find(p => p.awakenedId === selectedAwoken) : undefined;
          const target = sel ?? placements[0];
          if (!target) { showHexNotice("Station an Awoken on the field first — the War-Grounds open on the hex an Awoken stands on."); return; }
          setWgTileId(target.tileId);
          showHexNotice("The War-Grounds are open — while they are open, dragging on the map chooses wardens. Close them (⚔️) to drag the map again.");
        }}
        title={battleActive ? "The War-Grounds are shut while battle is joined" : "War-Grounds — fine work on one hex: edge works, buildings, readings"}
        disabled={battleActive}
        style={battleActive ? { opacity: 0.4, cursor: "not-allowed" } : {}}
      >
        ⚔️
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
        return (
          <div className="admin-popup" onClick={() => { setPendingTile(null); setSelectedBuilders([]); }}>
            <div className="admin-popup-inner" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
              <h3>🗼 {selectedBuilding.name}</h3>
              <p className="quiet">Tap Awoken on this tile to assign as builders. Each halves the build time.</p>
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
                {tileAwoken.length === 0 && <p className="quiet">No Awoken on this tile. The build will take full time.</p>}
              </div>
              <div className="builder-summary">
                <span>⏱ {baseMinutes >= 60 ? `${baseMinutes/60}h` : `${baseMinutes}m`} → <strong>{actualMinutes >= 60 ? `${(actualMinutes/60).toFixed(1)}h` : `${actualMinutes}m`}</strong></span>
                <span>🂠 {helperCount} helper{helperCount === 1 ? "" : "s"}</span>
              </div>
              {buildError && <p className="notice error">{buildError}</p>}
              <div className="wave-edit-actions">
                <button className="abtn" onClick={async () => {
                  try {
                    setBuildError(null);
                    await api.placeBuilding({
                      tileId: pendingTile,
                      buildingType: selectedBuilding.type,
                      builderIds: selectedBuilders,
                    });
                    setPendingTile(null);
                    setSelectedBuilders([]);
                    setSelectedBuilding(null);
                    const r = await api.getBuildings();
                    setBuildings(r.buildings);
                    onUpdate();
                  } catch (e) {
                    setBuildError((e as Error).message || "Build failed");
                  }
                }}>Begin Build</button>
                <button className="abtn small" onClick={() => { setPendingTile(null); setSelectedBuilders([]); }}>Cancel</button>
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
            tile={tile}
            walls={walls}
            standing={standing}
            tileBuildings={buildings.filter(b => b.tileId === tile.id)}
            energy={energy}
            onClose={() => setWgTileId(null)}
            onPlaceWork={(dir, kind, runeKind, style) => handlePlaceWork(tile.id, dir, kind, runeKind, style)}
            onStrengthenWork={(dir) => handleStrengthenWork(tile.id, dir)}
            onRemoveWork={(dir) => handleRemoveWork(tile.id, dir)}
            onTeachSkill={(awakenedId, skill) => handleTeachSkill(awakenedId, skill)}
            onChooseBuilding={(def) => {
              setSelectedBuilding(def);
              setPendingTile(tile.id);
              setSelectedBuilders([]);
              setWgTileId(null);
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
            onClaimSpark={tile.spark ? () => { setWgTileId(null); void handleSparkClick(tile.id); } : undefined}
          />
        );
      })()}
      {/* The company bar — a drag-chosen company's orders (Nigel,
          2026-10-16): one march for the whole band, quoted whole —
          total energy, the slowest warden's arrival — then confirmed. */}
      {selectedGroup.length > 0 && marchUiFor === null && patrolSettingFor === null && (
        <div className="patrol-bar">
          {!groupMarchUi ? (
            <>
              <span className="patrol-bar-label">⚔ {selectedGroup.length} wardens chosen</span>
              <button className="stance-btn" onClick={() => { setGroupMarchUi(true); setGroupQuote(null); }}>➤ Company march</button>
              <button className="stance-btn" onClick={() => setSelectedGroup([])}>✕ Clear</button>
            </>
          ) : !groupQuote ? (
            <>
              <span className="patrol-bar-label">➤ Company march — tap the hex the company musters on; it forms up around it</span>
              <button className="stance-btn" onClick={() => setGroupMarchUi(false)}>✕ Done</button>
            </>
          ) : (
            <>
              <span className="patrol-bar-label">
                ⚑ Company march — {groupQuote.orders.filter(o => !o.alreadyThere).length} on the road · {groupQuote.totalEnergy}⚡ · last in ~{fmtMarchTime(groupQuote.slowest)}
                {groupQuote.excluded ? ` · ${groupQuote.excluded} cannot march` : ""}
                {groupQuote.orders.some(o => o.alreadyThere) ? " · some already stand there" : ""}
              </span>
              <button className="stance-btn" disabled={energy < groupQuote.totalEnergy}
                onClick={async () => {
                  const q = groupQuote;
                  let marched = 0, failed = 0;
                  for (const o of q.orders) {
                    if (o.alreadyThere) { marched++; continue; }
                    try { await api.setMarch({ awakenedId: o.awakenedId, tileId: o.tileId }); marched++; }
                    catch { failed++; }
                  }
                  setGroupMarchUi(false);
                  setGroupQuote(null);
                  setSelectedGroup([]);
                  await refreshMarching();
                  showHexNotice(failed
                    ? `${marched} of the company march — ${failed} were refused by the ground as the orders landed.`
                    : `The company marches — ${marched} wardens on the road. Boom.`);
                }}>
                ✓ March
              </button>
              <button className="stance-btn" onClick={() => setGroupQuote(null)}>↩ Pick again</button>
              <button className="stance-btn" onClick={() => { setGroupMarchUi(false); setGroupQuote(null); }}>✕ Cancel</button>
            </>
          )}
        </div>
      )}
      {/* The march bar — march orders from the Move button (Nigel,
          2026-10-16): tap a hex and the march is QUOTED (road traced
          on the map, time and energy calculated); hit confirm and —
          boom — it moves. Patrol is reached from here too. */}
      {marchUiFor !== null && (() => {
        const who = tenderItems.find(a => a.id === marchUiFor);
        const dest = marchQuote ? tiles.find(t => t.id === marchQuote.tileId) : null;
        return (
          <div className="patrol-bar">
            {!marchQuote ? (
              <>
                <span className="patrol-bar-label">➤ March orders — {who?.name ?? "the warden"}: tap a hex to quote the march</span>
                <button className="stance-btn" onClick={() => {
                  const p = placements.find(p => p.awakenedId === marchUiFor);
                  setPatrolDraft(p ? patrolRoadOf(p) : []);
                  setPatrolSettingFor(marchUiFor);
                  setMarchUiFor(null);
                }}>🚶 Patrol road instead</button>
                <button className="stance-btn" onClick={() => setMarchUiFor(null)}>✕ Close</button>
              </>
            ) : (
              <>
                <span className="patrol-bar-label">
                  ⚑ March to {dest ? `(${dest.q}, ${dest.r})` : "the marked hex"} — {marchQuote.steps} hex{marchQuote.steps === 1 ? "" : "es"} · ~{fmtMarchTime(marchQuote.seconds)} · {marchQuote.energy}⚡
                </span>
                <button className="stance-btn" disabled={energy < marchQuote.energy}
                  onClick={async () => {
                    try {
                      const r = await api.setMarch({ awakenedId: marchUiFor, tileId: marchQuote.tileId });
                      setMarchUiFor(null);
                      setMarchQuote(null);
                      await refreshMarching();
                      showHexNotice(`The order is given — the march will take ~${fmtMarchTime(r.seconds)} and cost ${r.energy}⚡. Boom: it moves.`);
                    } catch (e) {
                      showHexNotice(e instanceof Error ? e.message : "The march could not be given.");
                    }
                  }}>
                  ✓ March
                </button>
                <button className="stance-btn" onClick={() => setMarchQuote(null)}>↩ Pick again</button>
                <button className="stance-btn" onClick={() => { setMarchUiFor(null); setMarchQuote(null); }}>✕ Cancel</button>
              </>
            )}
          </div>
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
          <div className="patrol-bar">
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
