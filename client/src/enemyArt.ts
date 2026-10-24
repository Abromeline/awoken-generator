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
import frayWalk1 from "./assets/enemies/fray-walk/fray-walk-1.png";
import frayWalk2 from "./assets/enemies/fray-walk/fray-walk-2.png";
import frayWalk3 from "./assets/enemies/fray-walk/fray-walk-3.png";
import frayWalk4 from "./assets/enemies/fray-walk/fray-walk-4.png";
import frayWalk5 from "./assets/enemies/fray-walk/fray-walk-5.png";

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

/** The Fray's walking cycle (Nigel's "Fray 1", uploaded 2026-10-22):
 *  the upload held 23 frames that proved to be five distinct strides
 *  repeated — pixel-identical copies — so the game copy carries the
 *  five, cropped to the cycle's bounds and scaled (originals untouched;
 *  see ~/workspace/fray-flipbook-2026-10-22/GAME-COPY.md). The cycle is
 *  the Fray's face wherever the bundled face is live; a live workshop
 *  upload still wins on the HTML surfaces, exactly as with every
 *  other enemy face, and stands still as uploads do — and on the
 *  homeland map the cycle is the standing face outright (the Token
 *  Strip, 2026-10-23; see frayFaceSrc's note below). */
export const FRAY_WALK_FRAMES = [frayWalk1, frayWalk2, frayWalk3, frayWalk4, frayWalk5] as const;

/** One stride's hold: 100 ms a frame, a half-second loop. */
export const FRAY_WALK_FRAME_MS = 100;

/** Which stride of the cycle a moment falls on — every Fray on a
 *  surface reads the same wall clock, so they march in step. */
export function frayWalkFrameAt(nowMs: number): number {
  return Math.floor(nowMs / FRAY_WALK_FRAME_MS) % FRAY_WALK_FRAMES.length;
}

/** The Fray's face at a moment: the live upload when one is live, else
 *  the walking cycle's frame for that moment. This remains the
 *  resolver for every surface that asks it — but note the homeland
 *  map no longer asks (the Token Strip, Nigel 2026-10-23): there
 *  the walking cycle is the Fray's standing face outright
 *  (FrayFaceSvgImage in EnemyFace.tsx), because the cycle is an
 *  animation its author uploaded FOR that purpose and a still
 *  upload standing in its place was the stuck face he named.
 *  The upload still rules wherever this resolver is read — the
 *  battleground and the tutorial's parade, through FrayFaceImg
 *  and enemyImgFor — and in the workshop's Enemies section. */
export function frayFaceSrc(art: EnemyArtMap | null | undefined, nowMs: number): string {
  const live = art?.["fray"]?.url;
  if (live) return live;
  return FRAY_WALK_FRAMES[frayWalkFrameAt(nowMs)];
}
