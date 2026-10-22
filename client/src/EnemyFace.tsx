/**
 * The Fray's animated face (Nigel's "Fray 1" walking cycle, 2026-10-22).
 *
 * Two renderers, one rule: while the bundled face is live, the Fray
 * walks — the five strides of its cycle, read off the wall clock so
 * every Fray on a surface marches in step. When the workshop has a
 * live upload for the Fray, the upload is the face and stands still,
 * exactly as uploads do on every other surface (see enemyArt.ts).
 */
import { useEffect, useState, type ImgHTMLAttributes } from "react";
import type { EnemyArtMap } from "./api";
import { FRAY_WALK_FRAMES, FRAY_WALK_FRAME_MS, frayFaceSrc, frayWalkFrameAt } from "./enemyArt";

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
 *  even while the map's own clock sleeps, and its face stays alive. */
export function FrayFaceSvgImage({ art, x, y, width, height, opacity }: {
  art?: EnemyArtMap | null;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
}) {
  const liveUrl = art?.fray?.url ?? null;
  useFrayWalkTick(!liveUrl);
  return (
    <image href={frayFaceSrc(art, Date.now())} x={x} y={y} width={width} height={height}
      preserveAspectRatio="xMidYMax meet" opacity={opacity} />
  );
}
