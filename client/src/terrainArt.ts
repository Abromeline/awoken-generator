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
