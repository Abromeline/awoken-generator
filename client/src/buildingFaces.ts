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
 *  corner — the grammar of wallArt.ts: (x1,y1)-(x2,y2) is the
 *  face's base segment in its own pixels (measured off the
 *  drawing: the panel's bottom edge, jamb foot to jamb foot),
 *  mapped onto the edge's ends by the seating law stated with the
 *  table. His walls stand at HIS drawn height — seated by base,
 *  the frontal pair rises ≈75 land units, the slants ≈63–67 —
 *  not the placeholder's 30. Nothing is squashed or redrawn: one
 *  uniform scale per face, anchored on its base line.
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
 * angles he has not drawn). Their rows say drawn: false and name
 * the nearest honest seating the game uses meanwhile: the frontal
 * elevation on the shallow lines (≈20° off true), a slant twin
 * turned ≈43° on the upright line — the stance of the tap-built
 * wall that stood turned against its edge in Nigel's example.
 * The template sheet (hex-building-pieces/make-draw-sheet.cjs,
 * sheet v4) carries a frame for every stance in this table, the
 * undrawn ones marked as frames awaiting his hand; sheet and
 * table agree stance for stance. When he draws them, their rows
 * take the new faces and the flags come off. */
export interface WallFace {
  src: string; w: number; h: number;
  /** The base segment in the face's own pixels. */
  x1: number; y1: number; x2: number; y2: number;
}

/* The six drawings, each named for the run of its base line in its
 * own frame, with the PSD layer each was cut from. */
const WALL_LONG: WallFace = { src: wallLong, w: 347, h: 441, x1: 3, y1: 440, x2: 344, y2: 440 }; // PSD layer L07 — the frontal wall
const WALL_DOWN_RIGHT: WallFace = { src: wallDownRight, w: 200, h: 621, x1: 3, y1: 421, x2: 176, y2: 615 }; // PSD layer L04 — base descends to the right; near jamb at its END
const WALL_DOWN_LEFT: WallFace = { src: wallDownLeft, w: 200, h: 621, x1: 23, y1: 615, x2: 199, y2: 419 }; // PSD layer L03 — base descends to the left; near jamb at its START
const DOOR_LONG: WallFace = { src: doorLong, w: 347, h: 440, x1: 3, y1: 439, x2: 344, y2: 439 }; // PSD layer L08 — the frontal doorway
const DOOR_DOWN_RIGHT: WallFace = { src: doorDownRight, w: 215, h: 621, x1: 3, y1: 421, x2: 189, y2: 615 }; // PSD layer L05 — near jamb at its END
const DOOR_DOWN_LEFT: WallFace = { src: doorDownLeft, w: 215, h: 621, x1: 15, y1: 630, x2: 195, y2: 425 }; // PSD layer L06 — near jamb at its START

/** One row of the perspective table. */
export interface WallPerspective {
  /** the stance's name — the template sheet labels its frames
   *  with these same names */
  stance: string;
  /** the drawing that dresses this stance (the nearest honest
   *  seating while `drawn` is false) */
  face: WallFace;
  /** the drawing's name and the PSD layer it was cut from */
  drawing: string;
  /** true when `face` IS this stance's own perspective among the
   *  pieces Nigel has drawn; false marks a stance he has not
   *  drawn yet — the row seats the nearest honest face and says so */
  drawn: boolean;
  /** the edges that present this stance, in plain words */
  edges: string;
}

const WALL_PERSPECTIVES: Record<"long" | "slantDescending" | "slantAscending", { wall: WallFace; door: WallFace; drawing: string }> = {
  long: { wall: WALL_LONG, door: DOOR_LONG, drawing: "the frontal pair (wall: PSD layer L07; doorway: L08)" },
  slantDescending: { wall: WALL_DOWN_RIGHT, door: DOOR_DOWN_RIGHT, drawing: "the descending twin (wall: PSD layer L04; doorway: L05)" },
  slantAscending: { wall: WALL_DOWN_LEFT, door: DOOR_DOWN_LEFT, drawing: "the ascending twin (wall: PSD layer L03; doorway: L06)" },
};

/** The perspective answering to an edge. Keys on the edge's LINE
 *  and, through seatWallFace's south-end law, on its FACING —
 *  never on the direction the edge happens to be stored in, and
 *  never on which floor carries it (a square's edges wind opposite
 *  to a wedge's; the stance is a fact about the edge on screen,
 *  not about its floor). */
export function wallPerspectiveFor(kind: string, ax: number, ay: number, bx: number, by: number): WallPerspective {
  const isDoor = kind === "door";
  const pick = (row: { wall: WallFace; door: WallFace }) => (isDoor ? row.door : row.wall);
  // the edge's undirected line angle on screen, folded to (−90, 90]
  let line = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
  if (line > 90) line -= 180;
  if (line <= -90) line += 180;
  if (Math.abs(line) <= 10) {
    // The long line. Both facings — the hex's back (top) edge and
    // its front (bottom) edge — take the frontal elevation: the
    // one flat front he drew, reading the same from either edge.
    const row = WALL_PERSPECTIVES.long;
    return {
      stance: "long (back and front edges)",
      face: pick(row),
      drawing: row.drawing,
      drawn: true,
      edges: "the hex's top and bottom edges; a square's or shoulder's edge lying on the same level line",
    };
  }
  if (Math.abs(line) <= 35) {
    // FLAGGED — NOT DRAWN: the shallow side lines of squares and
    // shoulders (±20.2°, along the hex's edge normals). No drawing
    // is this perspective and no mirror supplies it; the frontal
    // elevation is the nearest honest seating (≈20° off true).
    const row = WALL_PERSPECTIVES.long;
    return {
      stance: "shallow side line — NOT DRAWN",
      face: pick(row),
      drawing: `${row.drawing} — nearest honest seating only; this stance's own perspective is not among his drawings`,
      drawn: false,
      edges: "the side edges of a square or shoulder piece standing on a slanted hex edge (the sides run along the edge normals, ±20.2° on screen)",
    };
  }
  if (Math.abs(line) < 65) {
    // The slant lines (±47.7°). Two lines, two twins: the line
    // descending to the right takes the descending twin, the line
    // ascending to the right takes the ascending twin, and
    // seatWallFace lays each twin's lower (near-jamb) base end on
    // the edge's southern end — the facing is answered in the seat.
    const descending = line > 0;
    const row = descending ? WALL_PERSPECTIVES.slantDescending : WALL_PERSPECTIVES.slantAscending;
    return {
      stance: descending ? "slant descending right" : "slant ascending right",
      face: pick(row),
      drawing: row.drawing,
      drawn: true,
      edges: descending
        ? "the hex edges E–NE and W–SW (and any square or shoulder edge on the same descending line)"
        : "the hex edges NW–W and SE–E (and any square or shoulder edge on the same ascending line)",
    };
  }
  // FLAGGED — NOT DRAWN: the upright side line (90°) — the side
  // edges of a square or shoulder piece standing on a long edge run
  // straight up on screen, the wall seen edge-on. No drawing is
  // this perspective; the nearest by angle is a slant twin turned
  // ≈43°, seated by the same south-end law — on an upright line the
  // two twins differ only in which end carries the near jamb, and
  // the law puts this twin's near jamb at the southern end, as
  // everywhere. A wall standing thus is the turned wall of Nigel's
  // example; its own drawing is awaited, not invented.
  const row = WALL_PERSPECTIVES.slantDescending;
  return {
    stance: "upright side line (edge-on) — NOT DRAWN",
    face: pick(row),
    drawing: `${row.drawing} — nearest honest seating only; this stance's own perspective is not among his drawings`,
    drawn: false,
    edges: "the side edges of a square or shoulder piece standing on a long (level) hex edge — the sides run straight up on screen",
  };
}

/** Seat a wall face on its edge by similarity — base corner to
 *  base corner, the wallArt grammar — the wall standing at Nigel's
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
  return `translate(${P.x.toFixed(2)} ${P.y.toFixed(2)}) rotate(${(rot * 180 / Math.PI).toFixed(2)}) scale(${sc.toFixed(4)}) translate(${(-face.x1).toFixed(1)} ${(-face.y1).toFixed(1)})`;
}
