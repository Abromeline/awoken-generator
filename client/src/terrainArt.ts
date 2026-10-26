/**
 * Terrain stage art — the resolver between the map and the creator's
 * uploads (Nigel, 2026-10-15).
 *
 * Every hex wears one of three stages as it terraforms: stage 1, the
 * broken floating land of the art Nigel provided with the game (bundled
 * in ./assets/terrain-iso, the only art that ever ships in the build);
 * stage 2, the elements swelling; stage 3, the fully filled, flourishing
 * hex. Stages 2 and 3 are his to upload from the workshop's Terrain
 * Stages section, one face per (element, stage). Until he does, every
 * tile at every stage renders with his provided art — the fallback is
 * the law, not an error state.
 */
import { useQuery } from "@tanstack/react-query";
import { api, type TerrainArtMap } from "./api";
import tideImg from "./assets/terrain-iso/tide-v3.png";
import skyImg from "./assets/terrain-iso/sky-v3.png";
import stoneImg from "./assets/terrain-iso/stone-v3.png";
import rootImg from "./assets/terrain-iso/root-v3.png";
import neutralImg from "./assets/terrain-iso/neutral-v3.png";
import airLayerImg from "./assets/terrain-layer-air.png";
import rockLayerImg from "./assets/terrain-layer-rock.png";
import waterLayerImg from "./assets/terrain-layer-water.png";
import rootLayerImg from "./assets/terrain-layer-root.png";

/** The five elements that carry stage art. (Fire has no tiles of its own;
 *  cursed land keeps its bundled face — neither is uploadable here.) */
export const TERRAIN_ART_ELEMENTS = ["tide", "sky", "stone", "root", "neutral"] as const;
export type TerrainArtElement = (typeof TERRAIN_ART_ELEMENTS)[number];

/** Stage 1: Nigel's provided art, bundled with the game. */
export const BUNDLED_TERRAIN: Record<TerrainArtElement, string> = {
  tide: tideImg,
  sky: skyImg,
  stone: stoneImg,
  root: rootImg,
  neutral: neutralImg,
};

export const TERRAIN_ART_QUERY_KEY = ["terrainArt"] as const;

/** Fetch the creator's uploaded stage art once and share it — Territory
 *  (every tile, every render) and the workshop Terrain Stages section
 *  read the same cache; uploads and reverts invalidate it. */
export function useTerrainArt() {
  return useQuery({
    queryKey: TERRAIN_ART_QUERY_KEY,
    queryFn: async () => (await api.getTerrainArt()).art,
    staleTime: 5 * 60 * 1000,
  });
}

/** The image a tile of `element` at `stage` should wear: the creator's
 *  uploaded art for that exact (element, stage) when it exists, else his
 *  provided stage-1 art for the element. Stage 1 always resolves to the
 *  bundled art — it is not uploadable. */
export function terrainImgFor(element: string, stage: number, art?: TerrainArtMap | null): string {
  if (stage > 1) {
    const uploaded = art?.[element]?.[stage];
    if (uploaded) return uploaded;
  }
  return BUNDLED_TERRAIN[element as TerrainArtElement] ?? BUNDLED_TERRAIN.neutral;
}

/** The minimal tile shape the stage rule reads — the tray engine's
 *  word (trayStage) when the payload carries it, with the attunement
 *  bank fields accepted too so the rule survives older payloads. */
export type StageTile = {
  trayStage?: number | null;
  attunePoints?: number | null;
  attuneElement?: string | null;
  attune_points?: number | null;
  attune_element?: string | null;
};

/** The stage of a tray holding `points` attunement (Nigel, 2026-10-15):
 *  0–9 the broken land, 10–19 the swelling, 20–30 the flourishing.
 *  A sealed tray (30) is stage 3 by the same reading. */
export function trayStageOf(points: number): 1 | 2 | 3 {
  return points >= 20 ? 3 : points >= 10 ? 2 : 1;
}

/**
 * The stage a tile's TOP tray wears. The tray engine owns this now
 * (Nigel, 2026-10-15): getTerritory settles trayStage server-side
 * from the hex's sealed trays and its growing tray's fill, and the
 * map renders what it is told. Payloads older than the engine fall
 * back to the interim bank reading (land in flux → stage 2), so the
 * map never breaks mid-deploy.
 */
export function stageForTile(tile: StageTile): 1 | 2 | 3 {
  const s = tile.trayStage;
  if (s === 1 || s === 2 || s === 3) return s;
  const points = tile.attunePoints ?? tile.attune_points;
  const pressing = tile.attuneElement ?? tile.attune_element;
  if (points == null || pressing == null) return 1;
  return 2;
}

/* ── TERRAIN MIXING — THE LAYERED FACE (Nigel, 2026-10-25) ─────
 * His layered master (IMG_0773.psd), one texture per element,
 * lifted layer by layer from the file as drawn — each element's
 * own PSD layer, cropped to its own alpha bounds, never keyed
 * or redrawn: Root from the top-left quadrant's layer, Air from
 * the top-right, Water from the bottom-left, Rock from the
 * bottom-right. On the map, a purified hex's face is these four
 * textures STACKED: each layer's opacity is its element's
 * ledger line (points / 10) — 4 points stands ~40% solid, 10
 * full, 0 absent — so a fully attuned hex stands full and a
 * young hex looks ghostly, still filling in. All four stack
 * within the tile's own Z; height belongs to Air alone (the
 * server's lift). The new face carries NO glass rim — the
 * textures stand as he drew them. */

/** Nigel's layer order for the terrain stack, bottom → top —
 *  the ONE constant the render reads; nothing else in the
 *  client names an order. Ruled 2026-10-25 (16:46) as Air,
 *  Rock, Root, Tide; SUPERSEDED the same night by his tap
 *  (23:03 — "Water under Root — tonight's typed order
 *  stands"): Air, Rock, Water, Root on top. If his word
 *  changes again, this list is the whole change. Keys are the
 *  game's element names (sky = his Air, stone = his Rock,
 *  tide = his Water). */
export const TERRAIN_LAYER_ORDER = ["sky", "stone", "tide", "root"] as const;
export type TerrainLayerElement = (typeof TERRAIN_LAYER_ORDER)[number];

/** The four textures at native resolution, with each drawing's
 *  height per unit width (measured from the lifted files) and
 *  its seat: the downward shift, as a fraction of the drawing's
 *  own height, that seats the drawing's FACE on the hex's centre
 *  rather than its bounding-box centre. Root's island face
 *  rides high in its drawing (its drips hang below), so Root
 *  seats 0.15 lower; the others are centred as drawn. */
export const TERRAIN_LAYER_ART: Record<TerrainLayerElement, { src: string; hPerW: number; seatDy: number }> = {
  sky: { src: airLayerImg, hPerW: 1123 / 1681, seatDy: 0 },
  stone: { src: rockLayerImg, hPerW: 957 / 1701, seatDy: 0 },
  tide: { src: waterLayerImg, hPerW: 843 / 1268, seatDy: 0 },
  root: { src: rootLayerImg, hPerW: 1347 / 1732, seatDy: 0.15 },
};

/** A hex's per-element ledger, as getTerritory serves it. */
export type TileMix = Partial<Record<TerrainLayerElement, number>>;

/** The opacity a layer stands at: its points of the full
 *  measure (10). Beyond full, full — points past 10 buy the
 *  land's other goods (Air's lift), not a second showing. */
export function mixLayerOpacity(points: number | undefined): number {
  return Math.max(0, Math.min(1, (points ?? 0) / 10));
}

/** Whether the hex carries any mixture at all — an untouched
 *  ledger (a neutral hex, or an older payload) draws its tray
 *  face as it always did. */
export function mixStands(mix: TileMix | null | undefined): boolean {
  if (!mix) return false;
  return TERRAIN_LAYER_ORDER.some((el) => (mix[el] ?? 0) > 0);
}
