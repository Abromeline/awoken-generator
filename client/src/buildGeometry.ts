/**
 * THE HEX BUILDING SYSTEM — construction geometry (the client's copy).
 * MUST MATCH server/src/buildGeometry.ts exactly: the same plate, the
 * same slant, the same keys. (Nigel, 2026-10-25 — "IMPLEMENT"; the
 * design as drawn back to him and ruled the same night.)
 *
 * THE PLATE PLANE is the builder's own flat plan — the plane of the
 * plates in ~/workspace/hex-building-pieces (gen_circular.py): three
 * shapes on ONE measure. The measure is 1: a construction hex's side,
 * a square's side and a triangle's side are all 1 in this plane.
 * Construction hexes are flat-top (corners at 0°, 60°, …), their
 * centres stand D = √3 + 1 apart, and the three shapes tile the
 * plane around them (the 3.4.6.4 tiling): the WEDGE (one of a hex's
 * six inner triangles), the SQUARE (standing on a hex's edge, one
 * measure outward; a square between two hexes is ONE square), and
 * the SHOULDER (the triangle in a corner's crook, brokering the
 * seam). Every vertex of the tiling is a hex centre or a hex corner.
 *
 * THE SLANT: the linear map A carries plate → axial (the land's own
 * coordinates): A(x, y) = (2x/3, −x/3 − y/√3), chosen so a
 * construction hex standing on the map's origin IS the land hex
 * there. Under A the squares fall to diamonds and the hexes take
 * the map's squashed stance, exactly as the angled plate draws
 * them; A being linear, the tiling's joins survive it whole.
 *
 * A piece's identity is its sorted vertex-key set. The server
 * re-derives every placement from these same functions — what the
 * client previews here, the server proves there.
 */
export const SQRT3 = Math.sqrt(3);
/** The six corners of a construction hex, CCW from east (plate y up). */
export const HEX_CORNERS: [number, number][] = [
  [1, 0], [0.5, SQRT3 / 2], [-0.5, SQRT3 / 2],
  [-1, 0], [-0.5, -SQRT3 / 2], [0.5, -SQRT3 / 2],
];
/** The outward unit normal of edge k (corner k → corner k+1). */
export const EDGE_NORMALS: [number, number][] = HEX_CORNERS.map((k, i) => {
  const j = HEX_CORNERS[(i + 1) % 6];
  return [(k[0] + j[0]) / SQRT3, (k[1] + j[1]) / SQRT3];
});
/** Centre spacing of neighbouring construction hexes. */
export const CENTER_D = SQRT3 + 1;
const G1: [number, number] = [CENTER_D * (SQRT3 / 2), -CENTER_D / 2];
const G2: [number, number] = [CENTER_D * (SQRT3 / 2), CENTER_D / 2];

export type Pt = [number, number];
export const addPt = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
export const hexCenter = (m: number, n: number): Pt =>
  [m * G1[0] + n * G2[0], m * G1[1] + n * G2[1]];

/** Plate → axial: the map's slant. */
export const plateToAxial = (p: Pt): Pt => [2 * p[0] / 3, -p[0] / 3 - p[1] / SQRT3];
/** Axial → plate: the slant read backwards. */
export const axialToPlate = (q: number, r: number): Pt =>
  [3 * q / 2, -SQRT3 * r - (SQRT3 / 2) * q];

const DET = G1[0] * G2[1] - G2[0] * G1[1];
/** The (fractional) centre-lattice address of a plate point. */
export function centerAddress(p: Pt): [number, number] {
  return [
    (p[0] * G2[1] - p[1] * G2[0]) / DET,
    (G1[0] * p[1] - G1[1] * p[0]) / DET,
  ];
}

const round3 = (v: number) => Math.round(v * 1000);
export const vertexKey = (p: Pt): string => `${round3(p[0])},${round3(p[1])}`;
export const pieceKeyOf = (kind: string, verts: Pt[]): string =>
  `${kind}#${verts.map(vertexKey).sort().join("|")}`;

export interface Candidate { kind: "triangle" | "square"; verts: Pt[]; key: string }

/** The eighteen pieces one construction hex generates: six wedges,
 *  six edge squares, six shoulder triangles (shoulders are the
 *  triangle kind — the brokers of every seam). */
export function piecesOfHex(m: number, n: number): Candidate[] {
  const c = hexCenter(m, n);
  const out: Candidate[] = [];
  for (let k = 0; k < 6; k++) {
    const a = HEX_CORNERS[k], b = HEX_CORNERS[(k + 1) % 6];
    const ca = addPt(c, a), cb = addPt(c, b);
    const wedge: Pt[] = [c, ca, cb];
    out.push({ kind: "triangle", verts: wedge, key: pieceKeyOf("triangle", wedge) });
    const sq: Pt[] = [ca, cb, addPt(cb, EDGE_NORMALS[k]), addPt(ca, EDGE_NORMALS[k])];
    out.push({ kind: "square", verts: sq, key: pieceKeyOf("square", sq) });
    const sh: Pt[] = [ca, addPt(ca, EDGE_NORMALS[(k + 5) % 6]), addPt(ca, EDGE_NORMALS[k])];
    out.push({ kind: "triangle", verts: sh, key: pieceKeyOf("triangle", sh) });
  }
  return out;
}

/** Every distinct tiling piece whose generating hexes stand within
 *  two centre-steps of the plate point — the neighbourhood a click
 *  can mean. Deduped by key: a square or shoulder found from two
 *  or three hexes is one candidate. */
export function candidatesNear(p: Pt): Candidate[] {
  const [fm, fn] = centerAddress(p);
  const m0 = Math.round(fm), n0 = Math.round(fn);
  const byKey = new Map<string, Candidate>();
  for (let dm = -2; dm <= 2; dm++) {
    for (let dn = -2; dn <= 2; dn++) {
      const dist = (Math.abs(dm) + Math.abs(dn) + Math.abs(dm + dn)) / 2;
      if (dist > 2) continue;
      for (const cand of piecesOfHex(m0 + dm, n0 + dn)) {
        if (!byKey.has(cand.key)) byKey.set(cand.key, cand);
      }
    }
  }
  return [...byKey.values()];
}

/** Find the canonical tiling candidate whose vertex set is exactly
 *  the claimed one (kind + vertices, to key precision). The
 *  server's placement law: only a true candidate may persist —
 *  any client's word is re-derived here, never trusted. */
export function matchCandidate(kind: string, verts: Pt[]): Candidate | null {
  if (kind !== "triangle" && kind !== "square") return null;
  if (!Array.isArray(verts) || verts.length !== (kind === "triangle" ? 3 : 4)) return null;
  for (const v of verts) {
    if (!Array.isArray(v) || v.length !== 2 || !Number.isFinite(v[0]) || !Number.isFinite(v[1])) return null;
  }
  const want = pieceKeyOf(kind, verts);
  const cx = verts.reduce((s, v) => s + v[0], 0) / verts.length;
  const cy = verts.reduce((s, v) => s + v[1], 0) / verts.length;
  for (const cand of candidatesNear([cx, cy])) {
    if (cand.key === want) return cand;
  }
  return null;
}

/** The undirected edge key of a floor piece's side. */
export const edgeKeyOf = (a: Pt, b: Pt): string => [vertexKey(a), vertexKey(b)].sort().join("|");

/** The edges of a floor footprint, in its own winding order. */
export function edgesOf(verts: Pt[]): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  for (let i = 0; i < verts.length; i++) out.push([verts[i], verts[(i + 1) % verts.length]]);
  return out;
}

/** A point in a polygon (plate or axial — the test is affine-true
 *  in either plane). Boundary counts as inside. */
export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const orient = (a: Pt, b: Pt, c: Pt): number =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** Do segments ab and cd cross (proper intersection or touching)?
 *  Touching counts: a wall's END standing on a road still bars it —
 *  the gap in a door is the only way through, and it is a real gap
 *  (the door's collision is two shorter segments, below). */
export function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const EPS = 1e-9;
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  if (((o1 > EPS && o2 < -EPS) || (o1 < -EPS && o2 > EPS)) &&
      ((o3 > EPS && o4 < -EPS) || (o3 < -EPS && o4 > EPS))) return true;
  const onSeg = (p: Pt, q: Pt, r: Pt) =>
    Math.abs(orient(p, q, r)) <= EPS &&
    q[0] >= Math.min(p[0], r[0]) - EPS && q[0] <= Math.max(p[0], r[0]) + EPS &&
    q[1] >= Math.min(p[1], r[1]) - EPS && q[1] <= Math.max(p[1], r[1]) + EPS;
  if (Math.abs(o1) <= EPS && onSeg(a, c, b)) return true;
  if (Math.abs(o2) <= EPS && onSeg(a, d, b)) return true;
  if (Math.abs(o3) <= EPS && onSeg(c, a, d)) return true;
  if (Math.abs(o4) <= EPS && onSeg(c, b, d)) return true;
  return false;
}

/** A PROPER crossing: the step passes from one side of the
 *  wall's line to the other, through the wall's own span. A
 *  step that merely TOUCHES a wall's end — or ends at its post
 *  — has not crossed it: a wall's ends are posts, and a body
 *  may round a post. Build collision everywhere (roads, the
 *  dark's walk, the Tender's stride) is judged by this test
 *  alone; the touching-counts segmentsCross above stays for
 *  the reckonings that were built on it. */
export function segmentsCrossProper(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const EPS = 1e-9;
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  return ((o1 > EPS && o2 < -EPS) || (o1 < -EPS && o2 > EPS)) &&
         ((o3 > EPS && o4 < -EPS) || (o3 < -EPS && o4 > EPS));
}

/** Distance from a point to a segment (same plane throughout). */
export function pointSegmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/* ── FREE PLACEMENT (Nigel, 2026-10-26 — "i dont want building
 * lock to hexes"; his tap the same day chose the form: pieces
 * SNAP TO EACH OTHER, never to the world) ─────────────────────
 * The tiling above is the kit's GRAMMAR — its shapes on the one
 * measure, its six turnings — and no longer its address book. A
 * floor is laid where the tap puts it: centred on the tap at
 * the kit's rest orientation, or (in snap mode) flush on a
 * standing piece's free edge, the join made of the NEIGHBOUR'S
 * own numbers so it can never drift. In free place there is no
 * snapping at all. What governs a free seat is the proof below:
 * a true kit shape, its grain on the kit's turnings, and no
 * overlap of anything already standing. */

/** A kit piece of `kind` centred on `c`, at its rest
 *  orientation: the triangle apex-up in the plate (its base on
 *  a hex's top-edge line), the square on the plate's axes (the
 *  stance of the square standing on a hex's top edge). Every
 *  other seat is this shape turned by the kit's turnings or
 *  joined by an edge — no arbitrary angle is ever offered. */
export function freePieceAt(kind: "triangle" | "square", c: Pt): Pt[] {
  if (kind === "triangle") {
    const h = SQRT3 / 2; // the triangle's height on the measure
    return [
      [c[0], c[1] + (2 * h) / 3],
      [c[0] + 0.5, c[1] - h / 3],
      [c[0] - 0.5, c[1] - h / 3],
    ];
  }
  return [
    [c[0] - 0.5, c[1] - 0.5], [c[0] + 0.5, c[1] - 0.5],
    [c[0] + 0.5, c[1] + 0.5], [c[0] - 0.5, c[1] + 0.5],
  ];
}

/** The piece of `kind` standing flush on the far side of the
 *  edge (a → b): it shares the edge whole, its body on the side
 *  AWAY from `awayFrom` (the standing piece's own heart). The
 *  shared edge keeps the standing piece's exact vertices — a
 *  join made of the neighbour's numbers, never the grid's. */
export function pieceOnEdge(kind: "triangle" | "square", a: Pt, b: Pt, awayFrom: Pt): Pt[] {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  let nx = -(b[1] - a[1]), ny = b[0] - a[0];
  const depth = kind === "triangle" ? SQRT3 / 2 : 1;
  const scale = depth / Math.hypot(nx, ny);
  nx *= scale; ny *= scale;
  const dPlus = (mx + nx - awayFrom[0]) ** 2 + (my + ny - awayFrom[1]) ** 2;
  const dMinus = (mx - nx - awayFrom[0]) ** 2 + (my - ny - awayFrom[1]) ** 2;
  if (dPlus < dMinus) { nx = -nx; ny = -ny; }
  if (kind === "triangle") return [b, a, [mx + nx, my + ny]];
  return [b, a, [a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny]];
}

/** Do two convex footprints share AREA? (Both kit shapes are
 *  convex, so the separating-axis test decides.) Sharing an
 *  edge or a corner is a JOIN, not an overlap: the test reads a
 *  touch as no overlap, to a hair's tolerance for the joins'
 *  own arithmetic. */
export function polygonsOverlap(p: Pt[], q: Pt[]): boolean {
  const EPS = 1e-6;
  const axes: Pt[] = [];
  for (const poly of [p, q]) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      axes.push([-(b[1] - a[1]), b[0] - a[0]]);
    }
  }
  for (const ax of axes) {
    let mnP = Infinity, mxP = -Infinity, mnQ = Infinity, mxQ = -Infinity;
    for (const v of p) { const d = v[0] * ax[0] + v[1] * ax[1]; if (d < mnP) mnP = d; if (d > mxP) mxP = d; }
    for (const v of q) { const d = v[0] * ax[0] + v[1] * ax[1]; if (d < mnQ) mnQ = d; if (d > mxQ) mxQ = d; }
    if (Math.min(mxP, mxQ) - Math.max(mnP, mnQ) <= EPS) return false;
  }
  return true;
}

const KIT_TOL = 0.01;
/** Prove a claimed floor is a true kit piece at its free seat:
 *  the kind's own shape on the one measure (the equilateral
 *  triangle of side 1; the square of side 1), every edge's
 *  grain on the kit's turnings (a multiple of 30° — the hex's
 *  edges and their normals, nothing else). Returns the
 *  vertices rounded for the record, or null: an invented or
 *  arbitrarily turned shape may not persist, any more than a
 *  tiling stranger could before. The server's placement law. */
export function proveKitPiece(kind: string, verts: Pt[]): Pt[] | null {
  if (kind !== "triangle" && kind !== "square") return null;
  if (!Array.isArray(verts) || verts.length !== (kind === "triangle" ? 3 : 4)) return null;
  for (const v of verts) {
    if (!Array.isArray(v) || v.length !== 2 || !Number.isFinite(v[0]) || !Number.isFinite(v[1])) return null;
  }
  const side = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i], b = verts[(i + 1) % verts.length];
    if (Math.abs(side(a, b) - 1) > KIT_TOL) return null;
    let deg = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
    deg = ((deg % 30) + 30) % 30;
    if (Math.min(deg, 30 - deg) > 1) return null;
  }
  if (kind === "square" && Math.abs(side(verts[0], verts[2]) - Math.SQRT2) > KIT_TOL * 2) return null;
  return verts.map(v => [Math.round(v[0] * 1e6) / 1e6, Math.round(v[1] * 1e6) / 1e6] as Pt);
}

/** THE DOOR'S GAP: a door wall's collision is its edge with the
 *  middle two-fifths OPEN — two standing parts, [0, 0.3] and
 *  [0.7, 1] of the edge. The gap is real at every level of the
 *  system: the Tender's stride, the dark's walk and the march
 *  roads all read these same segments. */
export const DOOR_GAP_HALF = 0.2; // the open middle is 2 × this of the edge

export function collisionSegments(kind: string, axialVerts: Pt[]): [Pt, Pt][] {
  if (kind === "wall") {
    return axialVerts.length === 2 ? [[axialVerts[0], axialVerts[1]]] : [];
  }
  if (kind === "door") {
    if (axialVerts.length !== 2) return [];
    const [a, b] = axialVerts;
    const at = (t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    return [[a, at(0.5 - DOOR_GAP_HALF)], [at(0.5 + DOOR_GAP_HALF), b]];
  }
  return [];
}
