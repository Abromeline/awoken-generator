/**
 * The Fray's animated face (Nigel's "Fray 1" walking cycle, 2026-10-22).
 *
 * Two renderers, two rules (the Token Strip, Nigel 2026-10-23:
 * "I have never seen the true face of the Fray since I added
 * the animated one anywhere. Is that going to come in now?"):
 *
 *  - HTML surfaces (FrayFaceImg — the battleground, the
 *    tutorial's parade): the workshop's upload-wins law stands
 *    as for every enemy — a live upload is the face and stands
 *    still; while the bundled face is live, the Fray walks.
 *  - The homeland map (FrayFaceSvgImage): the walking cycle IS
 *    the Fray's standing face, always — a resolver rule for
 *    the Fray alone, because its bundled face is an animation
 *    its author uploaded FOR that purpose, and a still upload
 *    standing in its place is exactly the stuck face Nigel
 *    named. His live Fray upload is NOT erased: it still
 *    rules the Fray on the HTML surfaces above and in the
 *    workshop's Enemies section; it simply no longer stands
 *    where the walk should be on his own map.
 */
import { useEffect, useState, type ImgHTMLAttributes } from "react";
import type { EnemyArtMap } from "./api";
import { FRAY_WALK_FRAMES, FRAY_WALK_FRAME_MS, frayWalkFrameAt } from "./enemyArt";

let preloaded = false;
/** Warm the browser's cache with the whole cycle once, so the first
 *  loop doesn't flicker through empty frames. */
function preloadFrayWalk() {
  if (preloaded || typeof window === "undefined") return;
  preloaded = true;
  for (const src of FRAY_WALK_FRAMES) {
    const im = new Image();
    im.src = src;
  }
}

/** A small heartbeat that re-renders only its owner at the cycle's
 *  cadence. `animate` is true exactly while the bundled face is the
 *  live one — a live upload stands still, so no heartbeat runs. */
function useFrayWalkTick(animate: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!animate) return;
    preloadFrayWalk();
    const t = window.setInterval(() => setTick(x => x + 1), FRAY_WALK_FRAME_MS);
    return () => window.clearInterval(t);
  }, [animate]);
}

/** The Fray's face for HTML surfaces (the battleground, the tutorial's
 *  enemy parade): an <img> that walks. All ordinary img props — class,
 *  style, alt — pass through untouched. */
export function FrayFaceImg({ art, ...props }: { art?: EnemyArtMap | null } & ImgHTMLAttributes<HTMLImageElement>) {
  const liveUrl = art?.fray?.url ?? null;
  useFrayWalkTick(!liveUrl);
  return <img src={liveUrl ?? FRAY_WALK_FRAMES[frayWalkFrameAt(Date.now())]} {...props} />;
}

/** The Fray's face for SVG surfaces (the homeland map): an <image>
 *  that walks, with its own heartbeat — a wanderer stands on the map
 *  even while the map's own clock sleeps, and its face stays alive.
 *  The homeland rule (above): the cycle is the standing face here,
 *  whatever the workshop holds — the `art` prop is accepted so
 *  callers keep one shape, and deliberately not consulted. */
export function FrayFaceSvgImage({ art: _art, x, y, width, height, opacity }: {
  art?: EnemyArtMap | null;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
}) {
  useFrayWalkTick(true);
  return (
    <image href={FRAY_WALK_FRAMES[frayWalkFrameAt(Date.now())]} x={x} y={y} width={width} height={height}
      preserveAspectRatio="xMidYMax meet" opacity={opacity} />
  );
}
