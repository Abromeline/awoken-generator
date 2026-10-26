/** Nigel's building faces (2026-10-26, sent through the File Post
 *  as two layered PSDs — "Untitled_Artwork 1.psd": the floor drawn
 *  as its six triangle wedges; "Untitled_Artwork.psd": the whole-
 *  hex floor and the walls). Each face was cut FROM ITS OWN LAYER
 *  (the layer's raw pixels, never a flattened composite), so every
 *  piece stands on true transparency exactly as drawn.
 *
 *  THE FLOOR FACES share one registration: each wedge PNG is the
 *  whole 702×431 floor frame with only its own wedge painted (its
 *  slab depth hangs below its outer edge, as drawn). The frame is
 *  the painted-face template (Territory's FACE_HEX, in source px)
 *  at the drawing's own scale: 702/1731 px per template unit, the
 *  hex's heart at (870·s, 468·s). A placed triangle is seated by
 *  the exact affine that carries its frame triangle onto its
 *  footprint — the same three corners, so the faces can never
 *  drift from the construction's geometry, and the six wedges of
 *  one hex compose into the floor he drew.
 *
 *  A plate wedge's corners (HEX_CORNERS order) land on the painted
 *  face's corners in the order PLATE_TO_FACE — read off the slant
 *  itself (plateToAxial through the land's iso basis, matched to
 *  FACE_HEX to within the template's own hand-measured rounding).
 *  A SHOULDER triangle wears the wedge face of its own corner's
 *  wedge (the wedge clockwise from the corner it hangs on), its
 *  base turned onto the shoulder's outer edge — the draw sheet's
 *  law: draw each face once, the grid turns it.
 *
 *  THE WALL FACES seat by similarity on their edge, corner to
 *  corner — the grammar of wallArt.ts: (x1,y1)-(x2,y2) is the
 *  face's base segment in its own pixels (measured off the
 *  drawing: the panel's bottom edge, jamb foot to jamb foot),
 *  mapped onto the edge's ends; if that seating would stand the
 *  face upside down, it seats from the other end instead. His
 *  walls stand at HIS drawn height — seated by base, the frontal
 *  pair rises ≈75 land units, the slants ≈63–67 — not the
 *  placeholder's 30. Nothing is squashed or redrawn: one uniform
 *  scale per face, anchored on its base line.
 *
 *  NOT HERE: the square foundation's face (not among the pieces
 *  he sent — squares keep their standing geometry until it
 *  comes), and any placement for the whole-hex floor: the
 *  construction carries no whole-hex piece kind, so the face
 *  ships in the registry below and waits for its kind. */
import type { Pt } from "./buildGeometry";
import { HEX_CORNERS, hexCenter, centerAddress } from "./buildGeometry";

import triTop from "./assets/building-faces/triangle-floor-top.png";
import triUpperRight from "./assets/building-faces/triangle-floor-upper-right.png";
import triUpperLeft from "./assets/building-faces/triangle-floor-upper-left.png";
import triLowerLeft from "./assets/building-faces/triangle-floor-lower-left.png";
import triLowerRight from "./assets/building-faces/triangle-floor-lower-right.png";
import triBottom from "./assets/building-faces/triangle-floor-bottom.png";
import wholeHexFloor from "./assets/building-faces/whole-hex-floor.png";
import wallLong from "./assets/building-faces/wall-long-edge.png";
import doorLong from "./assets/building-faces/doorway-long-edge.png";
import wallDownRight from "./assets/building-faces/wall-slant-down-right.png";
import doorDownRight from "./assets/building-faces/doorway-slant-down-right.png";
import wallDownLeft from "./assets/building-faces/wall-slant-down-left.png";
import doorDownLeft from "./assets/building-faces/doorway-slant-down-left.png";

/** The floor frame: every triangle face PNG is this size, sharing
 *  the one registration. */
export const FLOOR_FRAME_W = 702;
export const FLOOR_FRAME_H = 431;
const FRAME_S = FLOOR_FRAME_W / 1731; // drawn px per template unit
const FRAME_C: [number, number] = [870 * FRAME_S, 468 * FRAME_S];
/** The painted face's corners, Territory's FACE_HEX in source px. */
const FACE_HEX: [number, number][] = [
  [-406, -468], [415, -468], [861, -6],
  [431, 476], [-431, 472], [-870, -6],
];
/** Plate corner index → FACE_HEX index. */
const PLATE_TO_FACE = [2, 1, 0, 5, 4, 3];
const frameCorner = (plateIdx: number): [number, number] => {
  const f = FACE_HEX[PLATE_TO_FACE[plateIdx]];
  return [FRAME_C[0] + f[0] * FRAME_S, FRAME_C[1] + f[1] * FRAME_S];
};
/** The wedge faces by plate wedge index k (corners k, k+1). */
const WEDGE_SRC = [triUpperRight, triTop, triUpperLeft, triLowerLeft, triBottom, triLowerRight];

/** The whole-hex floor's face — drawn, cut and shipped, awaiting
 *  a whole-hex placement kind in the construction (see header). */
export const WHOLE_HEX_FLOOR_FACE = { src: wholeHexFloor, w: FLOOR_FRAME_W, h: FLOOR_FRAME_H };

export interface FloorFaceRender {
  src: string;
  /** The face's triangle in frame px, in the order of `order`. */
  frame: [number, number][];
  /** Which of the piece's stored footprint points the frame
   *  triangle's corners answer to, in the same order. */
  order: [number, number, number];
}

const nearPt = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.05;
/** The HEX_CORNERS index of a centre-relative plate point, or -1. */
function cornerIndexOf(rel: Pt): number {
  let best = -1, bd = Infinity;
  HEX_CORNERS.forEach((c, i) => {
    const d = Math.hypot(rel[0] - c[0], rel[1] - c[1]);
    if (d < bd) { bd = d; best = i; }
  });
  return bd < 0.05 ? best : -1;
}

/** The drawn face for a placed triangle piece, read from its
 *  stored plate vertices (canonical — the server re-derives them):
 *  a wedge of a construction hex wears its own wedge's face; a
 *  shoulder wears the face of the wedge clockwise from the corner
 *  it hangs on, turned onto its outer edge. Null when the shape
 *  is not one the faces know (the standing geometry serves). */
export function triangleFaceFor(verts: Pt[]): FloorFaceRender | null {
  if (!Array.isArray(verts) || verts.length !== 3) return null;
  // A wedge: one vertex is a construction hex's centre.
  for (let i = 0; i < 3; i++) {
    const [fm, fn] = centerAddress(verts[i]);
    const m = Math.round(fm), n = Math.round(fn);
    if (Math.abs(fm - m) > 0.02 || Math.abs(fn - n) > 0.02) continue;
    const c = hexCenter(m, n);
    if (!nearPt(verts[i], c)) continue;
    const rest = [0, 1, 2].filter(j => j !== i);
    const ka = cornerIndexOf([verts[rest[0]][0] - c[0], verts[rest[0]][1] - c[1]]);
    const kb = cornerIndexOf([verts[rest[1]][0] - c[0], verts[rest[1]][1] - c[1]]);
    if (ka < 0 || kb < 0 || (ka + 1) % 6 !== kb) return null;
    return {
      src: WEDGE_SRC[ka],
      frame: [FRAME_C, frameCorner(ka), frameCorner(kb)],
      order: [i, rest[0], rest[1]],
    };
  }
  // A shoulder: one vertex is a hex's corner — the corner it
  // hangs on. Its generating centre is a neighbouring lattice
  // point; the wedge clockwise from that corner lends its face.
  for (let i = 0; i < 3; i++) {
    const [fm, fn] = centerAddress(verts[i]);
    for (const m of [Math.floor(fm), Math.ceil(fm)]) {
      for (const n of [Math.floor(fn), Math.ceil(fn)]) {
        const c = hexCenter(m, n);
        const k = cornerIndexOf([verts[i][0] - c[0], verts[i][1] - c[1]]);
        if (k < 0) continue;
        const rest = [0, 1, 2].filter(j => j !== i);
        return {
          src: WEDGE_SRC[k],
          frame: [FRAME_C, frameCorner(k), frameCorner((k + 1) % 6)],
          order: [i, rest[0], rest[1]],
        };
      }
    }
  }
  return null;
}

/** The exact affine carrying a source triangle onto a target
 *  triangle, as an SVG transform string. Null if degenerate. */
export function affineFor(src: [number, number][], dst: [number, number][]): string | null {
  const [a, b, c] = src, [d, e, g] = dst;
  const m00 = b[0] - a[0], m10 = b[1] - a[1], m01 = c[0] - a[0], m11 = c[1] - a[1];
  const det = m00 * m11 - m01 * m10;
  if (Math.abs(det) < 1e-9) return null;
  const i00 = m11 / det, i01 = -m01 / det, i10 = -m10 / det, i11 = m00 / det;
  const u00 = e[0] - d[0], u10 = e[1] - d[1], u01 = g[0] - d[0], u11 = g[1] - d[1];
  const A = u00 * i00 + u01 * i10, B = u10 * i00 + u11 * i10;
  const C2 = u00 * i01 + u01 * i11, D = u10 * i01 + u11 * i11;
  const tx = d[0] - (A * a[0] + C2 * a[1]);
  const ty = d[1] - (B * a[0] + D * a[1]);
  const f = (v: number) => Math.round(v * 10000) / 10000;
  return `matrix(${f(A)} ${f(B)} ${f(C2)} ${f(D)} ${f(tx)} ${f(ty)})`;
}

export interface WallFace {
  src: string; w: number; h: number;
  /** The base segment in the face's own pixels. */
  x1: number; y1: number; x2: number; y2: number;
}

const WALL_FACE_TABLE: Record<"long" | "downRight" | "downLeft", { wall: WallFace; door: WallFace }> = {
  long: {
    wall: { src: wallLong, w: 347, h: 441, x1: 3, y1: 440, x2: 344, y2: 440 },
    door: { src: doorLong, w: 347, h: 440, x1: 3, y1: 439, x2: 344, y2: 439 },
  },
  downRight: {
    wall: { src: wallDownRight, w: 200, h: 621, x1: 3, y1: 421, x2: 176, y2: 615 },
    door: { src: doorDownRight, w: 215, h: 621, x1: 3, y1: 421, x2: 189, y2: 615 },
  },
  downLeft: {
    wall: { src: wallDownLeft, w: 200, h: 621, x1: 23, y1: 615, x2: 199, y2: 419 },
    door: { src: doorDownLeft, w: 215, h: 621, x1: 15, y1: 630, x2: 195, y2: 425 },
  },
};

/** The face a wall or door wears, by the stance of its edge on
 *  screen: the tiling's edges run in three lines — the long
 *  (near-horizontal) edges wear the frontal faces, the two slant
 *  families their leaning twins. */
export function wallFaceFor(kind: string, ax: number, ay: number, bx: number, by: number): WallFace {
  let ang = Math.atan2(by - ay, bx - ax) * 180 / Math.PI;
  if (ang > 90) ang -= 180;
  if (ang <= -90) ang += 180;
  const fam = Math.abs(ang) <= 24 ? "long" : ang > 24 ? "downRight" : "downLeft";
  return WALL_FACE_TABLE[fam][kind === "door" ? "door" : "wall"];
}

/** Seat a wall face on its edge by similarity — base corner to
 *  base corner, the wallArt grammar — keeping the face upright:
 *  if the seating would turn the drawing's up down-screen, it
 *  seats from the edge's other end. */
export function seatWallFace(face: WallFace, A: { x: number; y: number }, B: { x: number; y: number }): string {
  const baseAng = Math.atan2(face.y2 - face.y1, face.x2 - face.x1);
  let P = A, Q = B;
  let rot = Math.atan2(Q.y - P.y, Q.x - P.x) - baseAng;
  if (Math.cos(rot) < 0) {
    P = B; Q = A;
    rot = Math.atan2(Q.y - P.y, Q.x - P.x) - baseAng;
  }
  const sc = Math.hypot(Q.x - P.x, Q.y - P.y) / Math.hypot(face.x2 - face.x1, face.y2 - face.y1);
  return `translate(${P.x.toFixed(2)} ${P.y.toFixed(2)}) rotate(${(rot * 180 / Math.PI).toFixed(2)}) scale(${sc.toFixed(4)}) translate(${(-face.x1).toFixed(1)} ${(-face.y1).toFixed(1)})`;
}
