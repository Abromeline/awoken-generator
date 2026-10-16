/**
 * Enemy art — the resolver between every enemy renderer and the
 * creator's uploads (Nigel, 2026-10-15).
 *
 * The bundled faces in ./assets/enemies are the art that ships with the
 * game. From the UI Workspace's Enemies section Nigel uploads new faces
 * for the same enemies; an upload becomes the LIVE face everywhere the
 * enemy renders — territory battle, the main battleground, the tutorial —
 * by one shared rule the server resolves in getEnemyArt:
 *
 *   - a pinned upload (chosen with "Make current") is live;
 *   - the bundled art pinned ("Revert to bundled") is live;
 *   - otherwise the most recent upload is live;
 *   - no uploads at all → the bundled face.
 *
 * Before this resolver, each surface decided for itself: the
 * battleground never looked past the bundled art, and the territory
 * battle only saw uploads if the workshop had been opened earlier in
 * the same session. Now every surface reads the same answer.
 */
import { useQuery } from "@tanstack/react-query";
import { api, type EnemyArtMap } from "./api";
import frayImg from "./assets/enemies/fray.png";
import unravelerImg from "./assets/enemies/unraveler.png";
import hollowImg from "./assets/enemies/hollow.png";
import tangleImg from "./assets/enemies/tangle.png";

/** The four classic enemies, in the order the tutorial presents them. */
export const ENEMY_NAMES = ["fray", "unraveler", "hollow", "tangle"] as const;
export type EnemyName = (typeof ENEMY_NAMES)[number];

/** The bundled faces, shipped with the game. */
export const BUNDLED_ENEMIES: Record<EnemyName, string> = {
  fray: frayImg,
  unraveler: unravelerImg,
  hollow: hollowImg,
  tangle: tangleImg,
};

export const ENEMY_ART_QUERY_KEY = ["enemyArt"] as const;

/** Fetch the resolved enemy art once and share it — every renderer and
 *  the workshop's Enemies section read the same cache; uploads and
 *  selection changes invalidate it. */
export function useEnemyArt() {
  return useQuery({
    queryKey: ENEMY_ART_QUERY_KEY,
    queryFn: async () => await api.getEnemyArt(),
    staleTime: 5 * 60 * 1000,
  });
}

/** The image an enemy of `name` should wear right now: the live upload
 *  when one is live, else the bundled face. */
export function enemyImgFor(name: string, art?: EnemyArtMap | null): string {
  return art?.[name]?.url || BUNDLED_ENEMIES[name as EnemyName] || "";
}
