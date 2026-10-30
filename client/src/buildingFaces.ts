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
 *  THE WALL FACES are chosen by THE WALL PERSPECTIVES (the table
 *  at the foot of this file): the drawing that is the edge's own
 *  stance × facing, seated by similarity on its edge, corner to
 *  corner — the grammar the wall faces have always kept: (x1,y1)-(x2,y2) is the
 *  face's base segment in its own pixels (measured off the
 *  drawing: the panel's bottom edge, jamb foot to jamb foot),
 *  mapped onto the edge's ends by the seating law stated with the
 *  table. His walls stand at HIS drawn height — seated by base,
 *  the frontal pair rises ≈75 land units, the slants ≈63–67 —
 *  not the placeholder's 30. Nothing is squashed or redrawn: one
 *  uniform scale per face, anchored on its base line.
 *
 *  THE SQUARE'S FACE CAME (2026-10-28, the pieces-faces-menu
 *  build): the square foundation's face is in his "Build 1.psd"
 *  — the flat square panel of stone slabs seated directly
 *  beneath the whole-hex floor on his canvas (L19 'Layer 24';
 *  the intake first misread it as a wall panel in a second
 *  style, and Nigel's word corrected it: "The square is right
 *  under the hex in the pieces I sent you"). It is cut below
 *  and seated like the wedges — by the exact affine of its
 *  corners onto the footprint. Still awaited: any placement
 *  for the whole-hex floor: the construction carries no
 *  whole-hex piece kind, so the face ships in the registry
 *  below and waits for its kind. */
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
import squareFoundation from "./assets/building-faces/square-foundation.png";
import wallNarrow from "./assets/building-faces/wall-narrow.png";
import halfLongImg from "./assets/building-faces/half-wall-long-edge.png";
import halfDownRightImg from "./assets/building-faces/half-wall-slant-down-right.png";
import halfDownLeftImg from "./assets/building-faces/half-wall-slant-down-left.png";

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
  /** The face's own frame size in px, when it does not share
   *  the floor frame (the square's face is its own cut). */
  w?: number;
  h?: number;
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

/** THE SQUARE FOUNDATION'S FACE (2026-10-28): cut from L19
 *  'Layer 24' of his "Build 1.psd" — the flat square panel of
 *  stone slabs that sits beneath the whole-hex floor on his
 *  canvas — by its own layer's raw pixels, the panel's own
 *  region only (its any-alpha bounds are inflated by a stray
 *  speck and strays, per the intake; the black plate beneath
 *  it on L18 is not part of the cut — whether the plate and
 *  the strip below are part of the piece is Nigel's open
 *  question, and the face ships without them). The panel's
 *  four corners, measured off the drawing in the cut's own
 *  pixels (hand-drawn, a breath off true): TL (13,5),
 *  TR (342,23), BR (333,332), BL (2,332) of the 353×342 cut.
 *  A placed square seats the face by the exact affine of
 *  three corners onto its footprint's — the fourth follows,
 *  both being parallelograms — the same law as the wedges:
 *  drawn once, the grid turns it, and it can never drift
 *  from the construction's geometry. The footprint keeps
 *  the stored winding (cyclic, in both the tiling's and the
 *  free seats' records), and the drawing's corners answer
 *  in the same cyclic order. */
export const SQUARE_FACE = {
  src: squareFoundation, w: 353, h: 342,
  corners: [[13, 5], [342, 23], [333, 332], [2, 332]] as [number, number][],
};

/** The drawn face for a placed square piece, read from its
 *  stored plate vertices (canonical — the server re-derives
 *  them): the panel's corners TL, TR, BL carried onto the
 *  footprint's corners 0, 1, 3. Null when the shape is not
 *  a square's four corners (the standing geometry serves). */
export function squareFaceFor(verts: Pt[]): FloorFaceRender | null {
  if (!Array.isArray(verts) || verts.length !== 4) return null;
  const [tl, tr, , bl] = SQUARE_FACE.corners;
  return {
    src: SQUARE_FACE.src, w: SQUARE_FACE.w, h: SQUARE_FACE.h,
    frame: [tl, tr, bl],
    order: [0, 1, 3],
  };
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

/* ── THE WALL PERSPECTIVES ──────────────────────────────────────────
 * Nigel's correction (2026-10-26): "some of the walls in your
 * example were turned the wrong way and i think you must have left
 * a few views out of your calculations" — his word for the views is
 * PERSPECTIVES. The first wiring seated a wall by its edge's angle
 * alone, one drawing per direction family, and never asked which
 * way the edge FACES. But he drew TWINS for the slanted edges —
 * two slant walls and two slant doorways — because a construction
 * edge is seen from the SOUTH (the camera never moves), and its
 * two ends are not alike from there: on a slanted edge the
 * SOUTHERN end is the near end, close to the viewer, and the
 * perspective answering to the stance is the drawing whose near
 * (thick, frontal) jamb stands at that end.
 *
 * THE COMPLETE TABLE, derived from the ground up. Every
 * construction edge runs on one of five straight lines on screen
 * (the plate geometry squashed by the board's isometric basis —
 * buildGeometry.ts + hexBoard.ts):
 *   · the LONG line, level (0°) — the hex's top and bottom edges;
 *   · the two SLANT lines (±47.7°) — the hex's four slanted edges;
 *   · the SHALLOW lines (±20.2°) and the UPRIGHT line (90°) — the
 *     side edges of squares and shoulder pieces, which run along
 *     the hex's edge NORMALS (buildGeometry's EDGE_NORMALS).
 *     Square and shoulder edges can also fall on the long and
 *     slant lines themselves; those stances are the hex stances.
 *
 * A stance = a line × the way the edge faces along it. On the long
 * line the facing is which edge of the hex it is (back/top or
 * front/bottom); on a slant line the facing is which end is south.
 * For each stance wallPerspectiveFor names the drawing that is its
 * TRUE perspective, and seatWallFace presents it truly (its law is
 * stated there). The drawings, each cut from its own layer of his
 * PSD "Untitled_Artwork.psd", never from a flattened image:
 *   · the frontal wall and frontal doorway are flat elevations —
 *     the SAME elevation answers to both facings of the long line
 *     (a flat front reads the same stood on the back edge as on
 *     the front edge; the seat never mirrors his drawing — a
 *     mirror is never the true perspective of any stance here —
 *     it only turns the drawing to its edge);
 *   · the slant twins are true isometric parallelograms, jambs
 *     upright, brick courses running with the edge's lean. In
 *     BOTH twins, and in both doorway twins, the near jamb — the
 *     thick frontal jamb, painted at the end where the dark
 *     inner-jamb strip stands — sits at the base end that lies
 *     LOWER in the drawing's own frame. So the seating law for a
 *     slant stance is one sentence: THE DRAWING'S LOWER BASE END
 *     MEETS THE EDGE'S SOUTHERN END, in either stored direction.
 *     That is what the twins are for: the descending line (E–NE,
 *     W–SW) is dressed by the descending twin, whose low end is
 *     its base END; the ascending line (NW–W, SE–E) by the
 *     ascending twin, whose low end is its base START. The old
 *     wiring reached the same seats on hex edges only by accident
 *     of the stored windings; the law is stated outright now, so
 *     the same edge seats the same way whoever stored it.
 *
 * STANCES WITH NO TRUE DRAWING — FLAGGED, NOT FAKED: the shallow
 * side lines (±20.2°) and the upright side line (90°) are real
 * stances — a square or shoulder piece standing on a long or slant
 * edge presents them — but NO drawing among his pieces is their
 * perspective, and no mirror of a drawn face supplies one (a
 * mirror keeps the drawing's own lean; these lines lean at
 * angles he has not drawn). Their rows say drawn: false.
 *
 * THE TRUE SEAT FOR AN UNDRAWN STANCE (2026-10-28, Nigel's
 * word over his own screenshot — "that wall is an angle that
 * you missed and is not sitting at the right perspective",
 * and: the template he was given never carried a wall at that
 * angle): the first wiring seated these stances with the
 * frontal elevation ROTATED RIGIDLY to the edge — the leaning
 * wall of his screenshot, a borrowed picture turned, wearing
 * the name of a perspective it is not. That seat is struck.
 * What stands now is the draw sheet's own frames for these
 * stances, drawn as the sheet draws them: on a shallow line
 * the wall's panel is the parallelogram the sheet sketches —
 * its base ON the edge, its sides rising straight up, its
 * courses running with the base — the frontal drawing carried
 * into that frame by the exact affine, never a rigid turn;
 * on the upright line the wall is seen edge-on, the sheet's
 * narrow upright strip standing on the edge's southern end.
 * Both seats are flagged in code (drawn: false, the seat
 * named) until he draws the stances' own faces — his full-
 * size template for exactly these angles was cut for him
 * 2026-10-27 — and when the drawings come, their rows take
 * the true faces and the flags come off, the way the drawn
 * stances' rows read today. The narrow wall's slant stances
 * ride the same affine law: he drew that piece frontally
 * only, and its panel rises from a slant edge in the sheet's
 * parallelogram frame, flagged the same way. */
export interface WallFace {
  src: string; w: number; h: number;
  /** The base segment in the face's own pixels. */
  x1: number; y1: number; x2: number; y2: number;
  /** The panel's height in its own pixels (base line to the
   *  panel's top), for the seats that rise from the base —
   *  the frontal faces declare it; the slant twins seat by
   *  similarity and never need it. */
  panelH?: number;
}

/* The six drawings, each named for the run of its base line in its
 * own frame, with the PSD layer each was cut from. */
const WALL_LONG: WallFace = { src: wallLong, w: 347, h: 441, x1: 3, y1: 440, x2: 344, y2: 440, panelH: 440 }; // PSD layer L07 — the frontal wall
const WALL_DOWN_RIGHT: WallFace = { src: wallDownRight, w: 200, h: 621, x1: 3, y1: 421, x2: 176, y2: 615 }; // PSD layer L04 — base descends to the right; near jamb at its END
const WALL_DOWN_LEFT: WallFace = { src: wallDownLeft, w: 200, h: 621, x1: 23, y1: 615, x2: 199, y2: 419 }; // PSD layer L03 — base descends to the left; near jamb at its START
const DOOR_LONG: WallFace = { src: doorLong, w: 347, h: 440, x1: 3, y1: 439, x2: 344, y2: 439, panelH: 439 }; // PSD layer L08 — the frontal doorway
const DOOR_DOWN_RIGHT: WallFace = { src: doorDownRight, w: 215, h: 621, x1: 3, y1: 421, x2: 189, y2: 615 }; // PSD layer L05 — near jamb at its END
const DOOR_DOWN_LEFT: WallFace = { src: doorDownLeft, w: 215, h: 621, x1: 15, y1: 630, x2: 195, y2: 425 }; // PSD layer L06 — near jamb at its START

/* THE NEW FACES (2026-10-28, the pieces-faces-menu build), each
 * cut from its own layer of his "Build 1.psd" by the layer's raw
 * pixels, base segments measured off the drawing:
 *   · THE HALF WALL in all three stances he drew it — the
 *     frontal (L16 'Layer 6', the solid body only: the layer
 *     carries faint residue beyond it, excluded as the slant
 *     twins' ghost strokes were) and the two slant twins
 *     (L09/L10 'Layer 11', their solid cores — the same layers
 *     carry ghost strokes of the unpainted full-height
 *     remainder below the solid piece). The twins answer to
 *     the same grammar as the full walls': the descending
 *     twin's base descends to the right with its lower end at
 *     its END; the ascending twin's lower end is its START.
 *   · THE NARROW WALL (L03 'Layer 10') — a frontal wall panel
 *     narrower than the full wall, with its end returns drawn
 *     at both sides: its own piece beside the full wall. He
 *     drew it frontally only; its slant and side stances are
 *     NOT DRAWN and seat by the affine law below, flagged. */
const HALF_LONG: WallFace = { src: halfLongImg, w: 339, h: 220, x1: 4, y1: 219, x2: 334, y2: 212, panelH: 216 }; // Build 1.psd layer L16 — the frontal half wall
const HALF_DOWN_RIGHT: WallFace = { src: halfDownRightImg, w: 279, h: 375, x1: 6, y1: 219, x2: 170, y2: 371 }; // Build 1.psd layer L10 — base descends to the right; near jamb at its END
const HALF_DOWN_LEFT: WallFace = { src: halfDownLeftImg, w: 201, h: 375, x1: 15, y1: 372, x2: 190, y2: 224 }; // Build 1.psd layer L09 — base descends to the left; near jamb at its START
const NARROW_LONG: WallFace = { src: wallNarrow, w: 352, h: 449, x1: 17, y1: 447, x2: 323, y2: 447, panelH: 447 }; // Build 1.psd layer L03 — the narrow frontal wall

/** One row of the perspective table. */
export interface WallPerspective {
  /** the stance's name — the template sheet labels its frames
   *  with these same names */
  stance: string;
  /** the drawing that dresses this stance (on an undrawn
   *  stance, the kind's frontal face, which the affine seat
   *  carries into the stance's frame) */
  face: WallFace;
  /** the drawing's name and the PSD layer it was cut from */
  drawing: string;
  /** true when `face` IS this stance's own perspective among the
   *  pieces Nigel has drawn; false marks a stance he has not
   *  drawn yet — the row seats the frontal face by the affine
   *  law and says so */
  drawn: boolean;
  /** how the face is seated: by similarity on its base (a drawn
   *  stance), or by the affine law into the sheet's frame for
   *  an undrawn one */
  seat: "similarity" | "shallow" | "upright" | "slantAffine";
  /** the edges that present this stance, in plain words */
  edges: string;
}

/** The perspective rows by piece kind: each kind's own drawings,
 *  stance for stance. A null twin means he has not drawn that
 *  kind in that stance (the narrow wall, drawn frontally only). */
const KIND_ROWS: Record<string, {
  long: WallFace; desc: WallFace | null; asc: WallFace | null;
  longName: string; descName?: string; ascName?: string;
}> = {
  wall: {
    long: WALL_LONG, desc: WALL_DOWN_RIGHT, asc: WALL_DOWN_LEFT,
    longName: "the frontal wall (PSD layer L07)",
    descName: "the descending twin (PSD layer L04)",
    ascName: "the ascending twin (PSD layer L03)",
  },
  door: {
    long: DOOR_LONG, desc: DOOR_DOWN_RIGHT, asc: DOOR_DOWN_LEFT,
    longName: "the frontal doorway (PSD layer L08)",
    descName: "the descending doorway twin (PSD layer L05)",
    ascName: "the ascending doorway twin (PSD layer L06)",
  },
  halfwall: {
    long: HALF_LONG, desc: HALF_DOWN_RIGHT, asc: HALF_DOWN_LEFT,
    longName: "the frontal half wall (Build 1.psd layer L16)",
    descName: "the descending half-wall twin (Build 1.psd layer L10)",
    ascName: "the ascending half-wall twin (Build 1.psd layer L09)",
  },
  narrow: {
    long: NARROW_LONG, desc: null, asc: null,
    longName: "the narrow frontal wall (Build 1.psd layer L03)",
  },
};

/** The perspective answering to an edge. Keys on the edge's LINE
 *  and, through seatWallFace's south-end law, on its FACING —
 *  never on the direction the edge happens to be stored in, and
 *  never on which floor carries it (a square's edges wind opposite
 *  to a wedge's; the stance is a fact about the edge on screen,
 *  not about its floor). */
export function wallPerspectiveFor(kind: string, ax: number, ay: number, bx: number, by: number): WallPerspective {
  const rows = KIND_ROWS[kind] ?? KIND_ROWS.wall;
  // the edge's undirected line angle on screen, folded to (−90, 90]
  let line = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
  if (line > 90) line -= 180;
  if (line <= -90) line += 180;
  if (Math.abs(line) <= 10) {
    // The long line. Both facings — the hex's back (top) edge and
    // its front (bottom) edge — take the frontal elevation: the
    // one flat front he drew, reading the same from either edge.
    return {
      stance: "long (back and front edges)",
      face: rows.long,
      drawing: rows.longName,
      drawn: true,
      seat: "similarity",
      edges: "the hex's top and bottom edges; a square's or shoulder's edge lying on the same level line",
    };
  }
  if (Math.abs(line) <= 35) {
    // FLAGGED — NOT DRAWN: the shallow side lines of squares and
    // shoulders (±20.2°, along the hex's edge normals). No drawing
    // is this perspective and no mirror supplies it. The seat is
    // the affine law (seatWallAffine): the frontal panel carried
    // into the sheet's parallelogram frame — base on the edge,
    // sides rising straight up — never the rigid turn of the
    // first wiring, which stood the elevation leaning.
    return {
      stance: "shallow side line — NOT DRAWN",
      face: rows.long,
      drawing: `${rows.longName} — carried into the stance's frame by the affine seat; this stance's own perspective is not among his drawings`,
      drawn: false,
      seat: "shallow",
      edges: "the side edges of a square or shoulder piece standing on a slanted hex edge (the sides run along the edge normals, ±20.2° on screen)",
    };
  }
  if (Math.abs(line) < 65) {
    // The slant lines (±47.7°). Two lines, two twins: the line
    // descending to the right takes the descending twin, the line
    // ascending to the right takes the ascending twin, and
    // seatWallFace lays each twin's lower (near-jamb) base end on
    // the edge's southern end — the facing is answered in the seat.
    // A kind he drew frontally only (the narrow wall) has no twin:
    // its slant stances are NOT DRAWN and ride the affine law.
    const descending = line > 0;
    const twin = descending ? rows.desc : rows.asc;
    if (twin) {
      return {
        stance: descending ? "slant descending right" : "slant ascending right",
        face: twin,
        drawing: (descending ? rows.descName : rows.ascName) ?? "",
        drawn: true,
        seat: "similarity",
        edges: descending
          ? "the hex edges E–NE and W–SW (and any square or shoulder edge on the same descending line)"
          : "the hex edges NW–W and SE–E (and any square or shoulder edge on the same ascending line)",
      };
    }
    return {
      stance: descending ? "slant descending right — NOT DRAWN" : "slant ascending right — NOT DRAWN",
      face: rows.long,
      drawing: `${rows.longName} — carried into the stance's frame by the affine seat; this kind was drawn frontally only`,
      drawn: false,
      seat: "slantAffine",
      edges: descending
        ? "the hex edges E–NE and W–SW (and any square or shoulder edge on the same descending line)"
        : "the hex edges NW–W and SE–E (and any square or shoulder edge on the same ascending line)",
    };
  }
  // FLAGGED — NOT DRAWN: the upright side line (90°) — the side
  // edges of a square or shoulder piece standing on a long edge run
  // straight up on screen, the wall seen edge-on. No drawing is
  // this perspective. The seat is the affine law's edge-on strip:
  // the sheet's own frame for the stance — a narrow upright strip
  // standing on the edge's southern end — in place of the first
  // wiring's slant twin turned ≈43° against its edge.
  return {
    stance: "upright side line (edge-on) — NOT DRAWN",
    face: rows.long,
    drawing: `${rows.longName} — carried into the stance's edge-on frame by the affine seat; this stance's own perspective is not among his drawings`,
    drawn: false,
    seat: "upright",
    edges: "the side edges of a square or shoulder piece standing on a long (level) hex edge — the sides run straight up on screen",
  };
}

/** Seat a wall face on its edge by similarity — base corner to
 *  base corner, the wall faces' own grammar — the wall standing at Nigel's
 *  drawn height (the piece scales so its base length equals the
 *  edge, and the height follows). Nothing is squashed or redrawn:
 *  one uniform scale per face, and the drawing is never mirrored —
 *  a turn of the whole drawing is the only transform it ever takes.
 *
 *  THE SEATING LAW — the facing, answered. Which end of the edge
 *  receives the drawing's base START is named from the edge's own
 *  run on screen, so the same edge seats the same way whoever
 *  stored it:
 *   · a face whose base line is SLANTED in its own frame (the
 *     slant twins, and the slant twin serving the upright line):
 *     the base end that sits LOWER in the drawing's frame — the
 *     near jamb's foot — meets the edge's SOUTHERN end (the end
 *     lower on screen), in either stored direction;
 *   · a face whose base line is LEVEL in its frame (the frontal
 *     pair): the seating that keeps the elevation standing
 *     upright, its base start (the drawing's left) toward the
 *     west — the face as read from the south. */
export function seatWallFace(face: WallFace, A: { x: number; y: number }, B: { x: number; y: number }): string {
  return seatWallFaceFull(face, A, B).transform;
}

/** The similarity seat, whole: its transform AND the face's
 *  standing rise — the greatest height of the seated drawing's
 *  box above the edge's line, in land units, measured vertically
 *  (the direction a rising piece travels). The Stone Cast's
 *  emergence reads it: a piece partway up is this same seat
 *  translated down by the un-emerged share of the rise and
 *  clipped at the ground line — never scaled (Nigel's
 *  correction, 2026-10-29: the piece stands at its perspective-
 *  correct size at every moment of the rise; only how much of
 *  it shows above the ground changes). */
export function seatWallFaceFull(face: WallFace, A: { x: number; y: number }, B: { x: number; y: number }): { transform: string; risePx: number } {
  const baseSlanted = Math.abs(face.y2 - face.y1) > 0.05 * Math.abs(face.x2 - face.x1);
  let P: { x: number; y: number }, Q: { x: number; y: number };
  if (baseSlanted) {
    // the drawing's lower base end meets the edge's southern end
    const startIsLower = face.y1 > face.y2;
    const aIsSouthern = A.y > B.y;
    const startAtA = startIsLower === aIsSouthern;
    P = startAtA ? A : B;
    Q = startAtA ? B : A;
  } else {
    // the level rule: keep the elevation upright, base start first
    const baseAng = Math.atan2(face.y2 - face.y1, face.x2 - face.x1);
    const rot = Math.atan2(B.y - A.y, B.x - A.x) - baseAng;
    const flip = Math.cos(rot) < 0;
    P = flip ? B : A;
    Q = flip ? A : B;
  }
  const baseAng = Math.atan2(face.y2 - face.y1, face.x2 - face.x1);
  const rot = Math.atan2(Q.y - P.y, Q.x - P.x) - baseAng;
  const sc = Math.hypot(Q.x - P.x, Q.y - P.y) / Math.hypot(face.x2 - face.x1, face.y2 - face.y1);
  const transform = `translate(${P.x.toFixed(2)} ${P.y.toFixed(2)}) rotate(${(rot * 180 / Math.PI).toFixed(2)}) scale(${sc.toFixed(4)}) translate(${(-face.x1).toFixed(1)} ${(-face.y1).toFixed(1)})`;
  // The drawing box's corners carried through the seat; the
  // rise is the highest any of them stands above the edge's
  // line (the line reached at the corner's own x).
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const lineYat = (x: number): number => {
    const dx = B.x - A.x;
    if (Math.abs(dx) < 0.001) return (A.y + B.y) / 2;
    return A.y + (B.y - A.y) * ((x - A.x) / dx);
  };
  let risePx = 0;
  for (const [fx, fy] of [[0, 0], [face.w, 0], [0, face.h], [face.w, face.h]]) {
    const lx = fx - face.x1, ly = fy - face.y1;
    const mx = P.x + sc * (cos * lx - sin * ly);
    const my = P.y + sc * (sin * lx + cos * ly);
    risePx = Math.max(risePx, lineYat(mx) - my);
  }
  return { transform, risePx };
}

/* ── THE AFFINE SEAT FOR AN UNDRAWN STANCE (2026-10-28) ────────
 * The draw sheet's frames for the stances no drawing serves,
 * built as geometry: a wall's panel in these stances is a
 * parallelogram (or, edge-on, a narrow strip) whose BASE is the
 * edge itself and whose sides rise STRAIGHT UP on screen. The
 * frontal drawing is carried into the frame by the exact affine
 * of three corners — base start, base end, and the top above
 * the base start — so its courses run with the base and its
 * jambs stand vertical: the wall sits IN the land's perspective
 * instead of leaning against it. The drawing is never rotated
 * rigidly and never mirrored.
 *
 * THE RISE: a wall stands at the same height on every edge of
 * the construction — the height its frontal face takes on a
 * long edge of the same measure. Each line of the plate
 * projects to its own screen length per measure (the map's
 * basis, Territory's ISO_E/ISO_SE over ISO_DEN, through the
 * slant): long 1.0821, shallow 0.9973, slant 0.8058, upright
 * 0.6877. The affine seat's rise is therefore the edge's screen
 * length × the face's own height-to-base ratio × the line's
 * correction back to the long line's measure. */
const RISE_K: Record<"shallow" | "upright" | "slantAffine", number> = {
  shallow: 1.0821 / 0.9973,
  slantAffine: 1.0821 / 0.8058,
  upright: 1.0821 / 0.6877,
};
/** The sheet's edge-on strip: 60 wide against 230 of height in
 *  its frame — the strip's width as a share of its rise. */
const EDGE_ON_STRIP_SHARE = 60 / 230;

/** Seat a frontal face into an undrawn stance's frame by the
 *  affine law. A and B are the edge's ends on screen. Returns
 *  the transform AND the panel's standing rise in land units:
 *  the Stone Cast's emergence seats the piece at this full
 *  frame at every moment and lets the ground line clip what
 *  has not yet emerged — the frame itself never shrinks toward
 *  its base (the squashed seat was struck by Nigel's correction
 *  of 2026-10-29). */
export function seatWallAffine(
  face: WallFace,
  A: { x: number; y: number },
  B: { x: number; y: number },
  seat: "shallow" | "upright" | "slantAffine",
): { transform: string; risePx: number } | null {
  const panelH = face.panelH ?? face.h;
  const baseLen = Math.hypot(face.x2 - face.x1, face.y2 - face.y1);
  if (baseLen < 1 || panelH < 1) return null;
  const edgeLen = Math.hypot(B.x - A.x, B.y - A.y);
  const rise = edgeLen * (panelH / baseLen) * RISE_K[seat];
  const src: [number, number][] = [
    [face.x1, face.y1], [face.x2, face.y2], [face.x1, face.y1 - panelH],
  ];
  let dst: [number, number][];
  if (seat === "upright") {
    // Edge-on: the strip stands on the edge's SOUTHERN end (the
    // end lower on screen — the front end, as the sheet frames
    // it), its base a short level run of the sheet's proportion,
    // rising straight up.
    const S = A.y >= B.y ? A : B;
    const w = rise * EDGE_ON_STRIP_SHARE;
    dst = [
      [S.x - w / 2, S.y], [S.x + w / 2, S.y], [S.x - w / 2, S.y - rise],
    ];
  } else {
    // The parallelogram frame: base on the edge, the top edge
    // directly above the base — jambs vertical, courses with
    // the base.
    dst = [
      [A.x, A.y], [B.x, B.y], [A.x, A.y - rise],
    ];
  }
  const transform = affineFor(src, dst);
  if (!transform) return null;
  return { transform, risePx: rise };
}

/** One wall piece's seat, whole: its perspective row, the
 *  transform that stands its face on its edge AT ITS STANDING
 *  SIZE — by similarity for a drawn stance, by the affine law
 *  for an undrawn one — and the face's standing rise (risePx),
 *  the measure the Stone Cast's emergence sinks and clips by.
 *  The one door the map's wall drawing walks through. The seat
 *  takes no rise fraction: a partway piece is seated whole and
 *  emerges through the ground line's clip, exactly the size it
 *  stands at when the rise completes (Nigel's correction,
 *  2026-10-29 — the squashed shrink seat is struck). */
export function wallSeatFor(
  kind: string,
  A: { x: number; y: number },
  B: { x: number; y: number },
): { transform: string; stance: string; drawn: boolean; face: WallFace; risePx: number } {
  const p = wallPerspectiveFor(kind, A.x, A.y, B.x, B.y);
  if (p.seat === "similarity") {
    const { transform, risePx } = seatWallFaceFull(p.face, A, B);
    return { transform, stance: p.stance, drawn: p.drawn, face: p.face, risePx };
  }
  const aff = seatWallAffine(p.face, A, B, p.seat);
  if (aff) return { transform: aff.transform, stance: p.stance, drawn: p.drawn, face: p.face, risePx: aff.risePx };
  const { transform, risePx } = seatWallFaceFull(p.face, A, B);
  return { transform, stance: p.stance, drawn: p.drawn, face: p.face, risePx };
}

/** THE PIECES MENU'S FACES (2026-10-28, Nigel's word: "keep
 *  the pieces menu but use my artwork for the pieces ui"): the
 *  drawing each piece choice in the menu is made FROM — the
 *  piece's own face, the button law's form (a button made from
 *  a thing is the thing's image). The triangle is met by one
 *  of its wedges; the rest by their frontal faces. */
export const PIECE_MENU_FACES: Record<string, string> = {
  triangle: triTop,
  square: squareFoundation,
  wall: wallLong,
  door: doorLong,
  halfwall: halfLongImg,
  narrow: wallNarrow,
};
