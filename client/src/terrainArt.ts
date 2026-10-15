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

/** The minimal tile shape the stage rule reads — the attunement bank as
 *  getTerritory serves it (camelCase), with the column spelling accepted
 *  too so the rule survives either payload. */
export type StageTile = {
  attunePoints?: number | null;
  attuneElement?: string | null;
  attune_points?: number | null;
  attune_element?: string | null;
};

/**
 * INTERIM stage rule — declared interim until the terraforming levels
 * engine lands (Nigel, 2026-10-15). The engine will own stage fully
 * (attunement depth, trays, the +30 fully-attuned threshold); until then
 * the map reads the land's flux directly:
 *
 *   - a tile with no attunement bank (attune_points == null, and no
 *     element pressing it) stands at stage 1 — the broken land;
 *   - a tile whose bank has started (an element is pressing, points
 *     gathering) is land in flux → stage 2, the swelling.
 *
 * Stage 3 art can already be uploaded, stored, and previewed in the
 * workshop; no tile renders it yet — the levels engine will be the first
 * thing that computes stage 3.
 */
export function stageForTile(tile: StageTile): 1 | 2 {
  const points = tile.attunePoints ?? tile.attune_points;
  const pressing = tile.attuneElement ?? tile.attune_element;
  if (points == null || pressing == null) return 1;
  return 2;
}
