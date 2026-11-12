// drive-triangle-floor-art — EVERY TRIANGLE FLOOR WEARS THE ART
// NIGEL UPLOADED FOR IT (Nigel, 2026-11-12: "the triangle floor
// is not using the art i uploaded for it").
// The first face matcher (2026-10-26) knew only triangles tied
// to a construction hex in the one stored winding: a wedge
// whose corners were recorded the other way round returned no
// face at all, a shoulder took its seat from the stored order
// (a mirrored wedge when the order turned), and every freely
// placed floor — the tap's own triangle, islands snapped onto
// other free pieces, triangles on a free square's edges —
// matched nothing, so Territory's floor layer fell back to
// the pale stand-in fill and his dark stone wedges never
// showed. The matcher now reads the seat from the piece's own
// shape (triangleSeats in client/src/buildingFaces.ts).
// Proven here, against the real client modules:
//   §A1 every real triangle shape the server can store — the
//      tiling's wedges and shoulders, free seeds, snaps across
//      standing edges (stored as the server stores them) and
//      free-island generations — seats a face in EVERY vertex
//      order, the identical seat in all six: zero stand-in
//      fills over the whole enumeration.
//   §A2 the tiling's seats are unchanged: a wedge wears its
//      own wedge's file with its heart on the hex's centre; a
//      shoulder wears the wedge of its corner, heart on the
//      corner the tiling's telling names.
//   §A3 a free piece wears the seat whose outer edge stands
//      frontmost on the land (southernmost under the iso
//      basis), so the drawing's slab depth hangs on the edge
//      the eye reads as the front; a free tap's own triangle
//      (apex up, as freePieceAt cuts it) wears the bottom
//      wedge with its heart on the apex.
//   §A4 the null that remains is honest: shapes that are not
//      kit triangles at all return no face. The square's face
//      path — untouched by this build — still seats.
//   §B  in a real browser: one full hex of six triangle floors,
//      seated exactly as Territory seats them, composes into
//      his whole-hex floor (pixel-compared against
//      whole-hex-floor.png under the same registration), and
//      the rosette and a free island wear their faces for the
//      Keeper's eye.
// Screenshots land in ~/workspace/triangle-floor-proof/.
// Run: PUPPETEER_CACHE_DIR=~/workspace/tools-chrome/.cache node scripts/drive-triangle-floor-art.mjs
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { build, buildSync } from "../node_modules/esbuild/lib/main.js";

const require = createRequire("/home/hatch/workspace/tools-chrome/package.json");
const puppeteer = require("puppeteer");

const ROOT = new URL("..", import.meta.url).pathname;
process.chdir(ROOT);
const SHOTS = "/home/hatch/workspace/triangle-floor-proof";
mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

// Transpile the real client modules; .png imports resolve to
// the real asset paths so a face's src names the very file
// Territory would serve.
const tmp = mkdtempSync(join(tmpdir(), "awoken-drive-trifloor-"));
const pngPaths = {
  name: "png-paths",
  setup(b) {
    b.onResolve({ filter: /\.png$/ }, (args) => ({
      path: join(dirname(args.importer), args.path), namespace: "pngpath",
    }));
    b.onLoad({ filter: /.*/, namespace: "pngpath" }, (args) => ({
      contents: `export default ${JSON.stringify(args.path)};`, loader: "js",
    }));
  },
};
await build({ entryPoints: [join(ROOT, "client/src/buildingFaces.ts")], bundle: true, format: "esm", outfile: join(tmp, "faces.mjs"), plugins: [pngPaths] });
buildSync({ entryPoints: [join(ROOT, "client/src/buildGeometry.ts")], bundle: true, format: "esm", outfile: join(tmp, "geo.mjs") });
const F = await import(join(tmp, "faces.mjs"));
const G = await import(join(tmp, "geo.mjs"));
const { triangleFaceFor, squareFaceFor, affineFor } = F;
const { HEX_CORNERS, EDGE_NORMALS, hexCenter, addPt, freePieceAt, pieceOnEdge, matchCandidate, plateToAxial } = G;

// The game's own screen for a plate point (Territory's iso
// basis at land size 796): px = 1292q, py = 470q + 948r.
const spt = (p) => { const [q, r] = plateToAxial(p); return [1292 * q, 470 * q + 948 * r]; };
const seatSig = (verts) => {
  const face = triangleFaceFor(verts);
  if (!face) return "NULL";
  return `${basename(face.src)}|${affineFor(face.frame, face.order.map((i) => spt(verts[i])))}`;
};
const permsOf = (v) => [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]].map((p) => p.map((i) => v[i]));
const heartOf = (v) => [v.reduce((s, p) => s + p[0], 0) / v.length, v.reduce((s, p) => s + p[1], 0) / v.length];
const southOf = (p) => { const [q, r] = plateToAxial(p); return 470 * q + 948 * r; };

const WEDGE_FILES = ["triangle-floor-upper-right.png", "triangle-floor-top.png", "triangle-floor-upper-left.png", "triangle-floor-lower-left.png", "triangle-floor-bottom.png", "triangle-floor-lower-right.png"];

// ---- the real shapes, as the server stores them ----------------
// stored: tiling pieces keep the canonical telling's verts
// (the server's seatVerts); snaps the tiling does not know keep
// the claim's own order (pieceOnEdge's [b, a, apex]); free
// pieces keep freePieceAt's order. (Pieces on raised or
// floating tiles carry these same verts — the lift is a screen
// offset in Territory, never a change to the stored shape.)
const shapes = []; // { fam, label, verts, stored }
const tilingWedges = []; // { m, n, k, verts }
const tilingShoulders = []; // { m, n, k, verts }
for (const [m, n] of [[0, 0], [1, 0], [0, 1], [-2, 1], [7, -3]]) {
  const c = hexCenter(m, n);
  for (let k = 0; k < 6; k++) {
    const ca = addPt(c, HEX_CORNERS[k]), cb = addPt(c, HEX_CORNERS[(k + 1) % 6]);
    const w = [c, ca, cb];
    tilingWedges.push({ m, n, k, verts: w });
    shapes.push({ fam: "tiling wedge", label: `W(${m},${n},k${k})`, verts: w });
    const sh = [ca, addPt(ca, EDGE_NORMALS[(k + 5) % 6]), addPt(ca, EDGE_NORMALS[k])];
    const canon = matchCandidate("triangle", sh);
    const stored = canon ? canon.verts : sh;
    tilingShoulders.push({ m, n, k, verts: stored, apex: sh[0] });
    shapes.push({ fam: "tiling shoulder", label: `S(${m},${n},k${k})`, verts: stored });
  }
}
const freeShapes = []; // shapes under the free-seat law
for (const c of [[0, 0], [3.7, -2.13], [-5.25, 8.4], [100.1, 50.6], [-40.75, -17.3]]) {
  const v = freePieceAt("triangle", c);
  shapes.push({ fam: "free seed", label: `F(${c})`, verts: v });
  freeShapes.push({ label: `F(${c})`, verts: v, seed: true });
}
{
  const c = hexCenter(0, 0), k = 2;
  const wedge = [c, addPt(c, HEX_CORNERS[k]), addPt(c, HEX_CORNERS[(k + 1) % 6])];
  const h = heartOf(wedge);
  [[wedge[0], wedge[1]], [wedge[1], wedge[2]], [wedge[2], wedge[0]]].forEach((e, ei) => {
    const raw = pieceOnEdge("triangle", e[0], e[1], h);
    const canon = matchCandidate("triangle", raw);
    shapes.push({ fam: "snap on wedge edge", label: `E1 edge${ei}`, verts: canon ? canon.verts : raw });
    if (!canon) freeShapes.push({ label: `E1 edge${ei} (gap)`, verts: raw });
  });
  const ca = addPt(c, HEX_CORNERS[1]);
  const sh = [ca, addPt(ca, EDGE_NORMALS[0]), addPt(ca, EDGE_NORMALS[1])];
  const hs = heartOf(sh);
  [[sh[0], sh[1]], [sh[1], sh[2]], [sh[2], sh[0]]].forEach((e, ei) => {
    const raw = pieceOnEdge("triangle", e[0], e[1], hs);
    const canon = matchCandidate("triangle", raw);
    shapes.push({ fam: "snap on shoulder edge", label: `E1s edge${ei}`, verts: canon ? canon.verts : raw });
    if (!canon) freeShapes.push({ label: `E1s edge${ei} (gap)`, verts: raw });
  });
  const sq = [addPt(c, HEX_CORNERS[1]), addPt(c, HEX_CORNERS[2]),
    addPt(addPt(c, HEX_CORNERS[2]), EDGE_NORMALS[1]), addPt(addPt(c, HEX_CORNERS[1]), EDGE_NORMALS[1])];
  const hq = heartOf(sq);
  [[sq[0], sq[1]], [sq[1], sq[2]], [sq[2], sq[3]], [sq[3], sq[0]]].forEach((e, ei) => {
    const raw = pieceOnEdge("triangle", e[0], e[1], hq);
    const canon = matchCandidate("triangle", raw);
    shapes.push({ fam: "snap on square edge", label: `E1q edge${ei}`, verts: canon ? canon.verts : raw });
    if (!canon) freeShapes.push({ label: `E1q edge${ei} (gap)`, verts: raw });
  });
}
{
  const seed = freePieceAt("triangle", [3.7, -2.13]);
  const h = heartOf(seed);
  const gen1 = [];
  [[seed[0], seed[1]], [seed[1], seed[2]], [seed[2], seed[0]]].forEach((e, ei) => {
    const raw = pieceOnEdge("triangle", e[0], e[1], h);
    gen1.push(raw);
    shapes.push({ fam: "free snap gen1", label: `E2 edge${ei}`, verts: raw });
    freeShapes.push({ label: `E2 edge${ei}`, verts: raw });
  });
  gen1.forEach((t, ti) => {
    const ht = heartOf(t);
    [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]].forEach((e, ei) => {
      if (ei === 0) return;
      const raw = pieceOnEdge("triangle", e[0], e[1], ht);
      shapes.push({ fam: "free snap gen2", label: `E2 g${ti} edge${ei}`, verts: raw });
      freeShapes.push({ label: `E2 g${ti} edge${ei}`, verts: raw });
    });
  });
  const sq = freePieceAt("square", [20.5, -11.25]);
  const hq = heartOf(sq);
  [[sq[0], sq[1]], [sq[1], sq[2]], [sq[2], sq[3]], [sq[3], sq[0]]].forEach((e, ei) => {
    const raw = pieceOnEdge("triangle", e[0], e[1], hq);
    shapes.push({ fam: "snap on free square", label: `E3 edge${ei}`, verts: raw });
    freeShapes.push({ label: `E3 edge${ei}`, verts: raw });
  });
}

// ---- §A1: every real shape seats, in every order ---------------
{
  let runs = 0, nulls = 0, divergent = 0;
  for (const s of shapes) {
    const ref = seatSig(s.verts);
    for (const pv of permsOf(s.verts)) {
      runs++;
      const sig = seatSig(pv);
      if (sig === "NULL") nulls++;
      else if (sig !== ref) divergent++;
    }
  }
  ok(`§A1 all ${shapes.length} real triangle shapes seat a face in every vertex order — ${runs} runs, zero stand-in fills`,
    nulls === 0 && divergent === 0, `nulls=${nulls} divergent=${divergent}`);
}

// ---- §A2: the tiling's seats are the seats they have always worn
{
  let bad = 0;
  for (const w of tilingWedges) {
    const face = triangleFaceFor(w.verts);
    const heartPt = face ? w.verts[face.order[0]] : null;
    const c = hexCenter(w.m, w.n);
    if (!face || basename(face.src) !== WEDGE_FILES[w.k] ||
        !heartPt || Math.hypot(heartPt[0] - c[0], heartPt[1] - c[1]) > 0.001) bad++;
  }
  ok(`§A2 every tiling wedge (30) wears its own wedge's art, heart on its hex's centre`, bad === 0, `bad=${bad}`);
  bad = 0;
  for (const s of tilingShoulders) {
    const face = triangleFaceFor(s.verts);
    // The canonical telling is a piecesOfHex shoulder of some
    // hex — the tiling shares each shoulder between the hexes
    // it brokers, and matchCandidate keeps the first telling.
    // Recover that telling exactly: the candidate whose verts
    // are the stored verts, in order.
    let telling = null;
    const [fm, fn] = G.centerAddress(heartOf(s.verts));
    outer:
    for (let m = Math.round(fm) - 3; m <= Math.round(fm) + 3; m++) {
      for (let n = Math.round(fn) - 3; n <= Math.round(fn) + 3; n++) {
        const c = hexCenter(m, n);
        for (let k = 0; k < 6; k++) {
          const ca = addPt(c, HEX_CORNERS[k]);
          const sh = [ca, addPt(ca, EDGE_NORMALS[(k + 5) % 6]), addPt(ca, EDGE_NORMALS[k])];
          if (sh.every((p, i) => Math.hypot(p[0] - s.verts[i][0], p[1] - s.verts[i][1]) < 1e-9)) {
            telling = { k, apex: ca };
            break outer;
          }
        }
      }
    }
    const heartPt = face ? s.verts[face.order[0]] : null;
    if (!telling || !face || basename(face.src) !== WEDGE_FILES[telling.k] ||
        !heartPt || Math.hypot(heartPt[0] - telling.apex[0], heartPt[1] - telling.apex[1]) > 0.001) bad++;
  }
  ok(`§A2 every tiling shoulder (30) wears the wedge of the corner its canonical telling hangs on, heart on that corner`, bad === 0, `bad=${bad}`);
}

// ---- §A3: the free seat's law ----------------------------------
{
  let bad = 0;
  for (const s of freeShapes) {
    const face = triangleFaceFor(s.verts);
    if (!face) { bad++; continue; }
    const heartIdx = face.order[0];
    const edgeSouth = [0, 1, 2].map((e) => {
      const a = s.verts[e], b = s.verts[(e + 1) % 3];
      return southOf([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    });
    const outerSouth = southOf([
      (s.verts[face.order[1]][0] + s.verts[face.order[2]][0]) / 2,
      (s.verts[face.order[1]][1] + s.verts[face.order[2]][1]) / 2,
    ]);
    if (edgeSouth.some((v) => v > outerSouth + 1e-6)) bad++;
    if (s.seed) {
      const heartPt = s.verts[heartIdx];
      if (basename(face.src) !== "triangle-floor-bottom.png" ||
          Math.hypot(heartPt[0] - s.verts[0][0], heartPt[1] - s.verts[0][1]) > 0.001) bad++;
    }
  }
  ok(`§A3 every free piece (${freeShapes.length}) wears the seat whose outer edge stands frontmost; a free seed's heart is its apex, wearing the bottom wedge`,
    bad === 0, `bad=${bad}`);
}

// ---- §A4: the honest null, and the square's untouched path -----
{
  const right = triangleFaceFor([[0, 0], [1, 0], [0, 1]]);
  const big = triangleFaceFor([[0, 0], [2, 0], [1, Math.sqrt(3)]]);
  const four = triangleFaceFor([[0, 0], [1, 0], [1, 1], [0, 1]]);
  ok("§A4 shapes that are not kit triangles return no face (right angle, double size, four points)",
    right === null && big === null && four === null,
    `right=${!!right} big=${!!big} four=${!!four}`);
  const c = hexCenter(0, 0);
  const sqT = [addPt(c, HEX_CORNERS[1]), addPt(c, HEX_CORNERS[2]),
    addPt(addPt(c, HEX_CORNERS[2]), EDGE_NORMALS[1]), addPt(addPt(c, HEX_CORNERS[1]), EDGE_NORMALS[1])];
  const sqF = freePieceAt("square", [20.5, -11.25]);
  const f1 = squareFaceFor(sqT), f2 = squareFaceFor(sqF);
  ok("§A4 the square foundation's face still seats, tiling and free (path untouched)",
    !!f1 && !!f2 && basename(f1.src) === "square-foundation.png" && basename(f2.src) === "square-foundation.png");
}

// ---- §B: the browser render ------------------------------------
{
  // A browser bundle of the same two modules.
  const shim = join(tmp, "shim.ts");
  writeFileSync(shim, `export * from ${JSON.stringify(join(ROOT, "client/src/buildingFaces.ts"))};\nexport * from ${JSON.stringify(join(ROOT, "client/src/buildGeometry.ts"))};\n`);
  await build({ entryPoints: [shim], bundle: true, format: "esm", outfile: join(tmp, "bundle.mjs"), plugins: [pngPaths] });

  const c0 = hexCenter(0, 0);
  const hexWedges = [];
  const rosette = [];
  for (let k = 0; k < 6; k++) {
    const w = [c0, addPt(c0, HEX_CORNERS[k]), addPt(c0, HEX_CORNERS[(k + 1) % 6])];
    hexWedges.push(w); rosette.push(w);
    const sh = [addPt(c0, HEX_CORNERS[k]), addPt(addPt(c0, HEX_CORNERS[k]), EDGE_NORMALS[(k + 5) % 6]), addPt(addPt(c0, HEX_CORNERS[k]), EDGE_NORMALS[k])];
    rosette.push(sh);
  }
  { // gap triangles across wedge k=2's edges and shoulder k=1's edges
    const wedge = [c0, addPt(c0, HEX_CORNERS[2]), addPt(c0, HEX_CORNERS[3])];
    const h = heartOf(wedge);
    [[wedge[0], wedge[1]], [wedge[1], wedge[2]], [wedge[2], wedge[0]]].forEach((e) => {
      const raw = pieceOnEdge("triangle", e[0], e[1], h);
      if (!matchCandidate("triangle", raw)) rosette.push(raw);
    });
    const ca = addPt(c0, HEX_CORNERS[1]);
    const sh = [ca, addPt(ca, EDGE_NORMALS[0]), addPt(ca, EDGE_NORMALS[1])];
    const hs = heartOf(sh);
    [[sh[0], sh[1]], [sh[1], sh[2]], [sh[2], sh[0]]].forEach((e) => {
      rosette.push(pieceOnEdge("triangle", e[0], e[1], hs));
    });
  }
  const island = [];
  {
    const seed = freePieceAt("triangle", [3.7, -2.13]);
    island.push(seed);
    const h = heartOf(seed);
    const gen1 = [];
    [[seed[0], seed[1]], [seed[1], seed[2]], [seed[2], seed[0]]].forEach((e) => {
      const raw = pieceOnEdge("triangle", e[0], e[1], h);
      gen1.push(raw); island.push(raw);
    });
    gen1.forEach((t) => {
      const ht = heartOf(t);
      [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]].forEach((e, ei) => {
        if (ei !== 0) island.push(pieceOnEdge("triangle", e[0], e[1], ht));
      });
    });
    const sq = freePieceAt("square", [8.3, -5.1]);
    const hq = heartOf(sq);
    [[sq[0], sq[1]], [sq[1], sq[2]], [sq[2], sq[3]], [sq[3], sq[0]]].forEach((e) => {
      island.push(pieceOnEdge("triangle", e[0], e[1], hq));
    });
  }
  // The island panel's seat: the cluster centred, at a size
  // that fits it whole.
  const islandView = (() => {
    const pts = island.flat().map((p) => spt(p));
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const size = 200, k = size / 796;
    return { size, ox: 950 - cx * k, oy: 700 - cy * k };
  })();
  const data = JSON.stringify({ hexWedges, rosette, island, islandView });
  const bundleUrl = "file://" + join(tmp, "bundle.mjs");
  const html = `<!doctype html><meta charset="utf-8"><title>triangle floor art</title>
<body style="margin:0;background:#20242a;font-family:sans-serif;color:#d8d2c4">
<div id="panels"></div>
<canvas id="cmpA" width="1100" height="750" style="display:none"></canvas>
<canvas id="cmpB" width="1100" height="750" style="display:none"></canvas>
<script type="module">
const M = await import(${JSON.stringify(bundleUrl)});
const DATA = ${data};
const IMG = {};
for (const name of ["triangle-floor-top.png","triangle-floor-upper-right.png","triangle-floor-upper-left.png","triangle-floor-lower-left.png","triangle-floor-bottom.png","triangle-floor-lower-right.png","whole-hex-floor.png"]) {
  IMG[name] = "file://${join(ROOT, "client/src/assets/building-faces")}/" + name;
}
const spt = (p, size) => { const [q, r] = M.plateToAxial(p); const k = size / 796; return [1292 * q * k, (470 * q + 948 * r) * k]; };
const base = (s) => s.split("/").pop();
function seatSVG(verts, size, ox, oy) {
  const face = M.triangleFaceFor(verts);
  const pts = verts.map((v) => spt(v, size));
  const poly = pts.map((p) => (p[0] + ox).toFixed(1) + "," + (p[1] + oy).toFixed(1)).join(" ");
  if (!face) return '<polygon points="' + poly + '" fill="rgba(178,142,88,0.30)" stroke="#97753f" stroke-width="2" stroke-dasharray="8 6"/>';
  const targets = face.order.map((i) => [pts[i][0] + ox, pts[i][1] + oy]);
  const m = M.affineFor(face.frame, targets);
  return '<g transform="' + m + '"><image href="' + IMG[base(face.src)] + '" x="0" y="0" width="702" height="431"/></g>' +
    '<polygon points="' + poly + '" fill="none" stroke="#97753f" stroke-width="2" stroke-dasharray="8 6" stroke-linejoin="round"/>';
}
function panel(id, title, pieces, size, w, h, ox, oy) {
  const el = document.createElement("div");
  el.innerHTML = '<h3 style="margin:10px 14px 2px">' + title + '</h3><svg id="' + id + '" width="' + w + '" height="' + h + '" style="background:#2b3038;display:block;margin:6px 14px">' +
    pieces.map((v) => seatSVG(v, size, ox, oy)).join("") + "</svg>";
  document.getElementById("panels").appendChild(el);
}
panel("panelHex", "One hex of six triangle floors — the composite", DATA.hexWedges, 796, 1900, 1300, 950, 650);
{ // the whole-hex floor under the same registration, beside it
  const face0 = M.triangleFaceFor(DATA.hexWedges[0]);
  const targets = face0.order.map((i) => { const p = spt(DATA.hexWedges[0][i], 796); return [p[0] + 950, p[1] + 650]; });
  const m = M.affineFor(face0.frame, targets);
  const el = document.createElement("div");
  el.innerHTML = '<h3 style="margin:10px 14px 2px">His whole-hex floor, the same registration</h3><svg id="panelWhole" width="1900" height="1300" style="background:#2b3038;display:block;margin:6px 14px"><g transform="' + m + '"><image href="' + IMG["whole-hex-floor.png"] + '" x="0" y="0" width="702" height="431"/></g></svg>';
  document.getElementById("panels").appendChild(el);
}
panel("panelRosette", "The rosette — wedges, shoulders, and the gap triangles across their edges", DATA.rosette, 796, 1900, 1500, 950, 750);
panel("panelIsland", "A free island — seeds and snaps that never touch the tiling", DATA.island, DATA.islandView.size, 1900, 1400, DATA.islandView.ox, DATA.islandView.oy);
// The pixel comparison: the six-wedge composite vs the whole-hex
// floor, both drawn on canvas at half land size, same seat.
async function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
const imgs = {};
for (const [name, url] of Object.entries(IMG)) imgs[name] = await loadImg(url);
function drawComposite(ctx, whole) {
  ctx.save(); ctx.translate(550, 375);
  if (whole) {
    const face0 = M.triangleFaceFor(DATA.hexWedges[0]);
    const targets = face0.order.map((i) => spt(DATA.hexWedges[0][i], 398));
    const m = M.affineFor(face0.frame, targets).match(/matrix\(([^)]+)\)/)[1].split(/[\s]+/).map(Number);
    ctx.setTransform(m[0], m[1], m[2], m[3], m[4] + 550, m[5] + 375);
    ctx.drawImage(imgs["whole-hex-floor.png"], 0, 0, 702, 431);
  } else {
    for (const verts of DATA.hexWedges) {
      const face = M.triangleFaceFor(verts);
      const targets = face.order.map((i) => spt(verts[i], 398));
      const m = M.affineFor(face.frame, targets).match(/matrix\(([^)]+)\)/)[1].split(/[\s]+/).map(Number);
      ctx.setTransform(m[0], m[1], m[2], m[3], m[4] + 550, m[5] + 375);
      ctx.drawImage(imgs[base(face.src)], 0, 0, 702, 431);
    }
  }
  ctx.restore();
}
const ca = document.getElementById("cmpA").getContext("2d");
const cb = document.getElementById("cmpB").getContext("2d");
drawComposite(ca, false); drawComposite(cb, true);
const da = ca.getImageData(0, 0, 1100, 750).data, db = cb.getImageData(0, 0, 1100, 750).data;
let painted = 0, sum = 0, within = 0;
for (let i = 0; i < da.length; i += 4) {
  if (da[i + 3] < 12 && db[i + 3] < 12) continue;
  painted++;
  const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
  sum += d; if (d <= 32) within++;
}
window.__metrics = { painted, meanAbsDiff: painted ? sum / painted : 999, withinShare: painted ? within / painted : 0 };
window.__done = true;
</script></body>`;
  const pagePath = join(tmp, "render.html");
  writeFileSync(pagePath, html);

  let browser = null;
  try {
    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--allow-file-access-from-files"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1980, height: 1200 });
    await page.goto("file://" + pagePath, { waitUntil: "networkidle0", timeout: 60000 });
    await page.waitForFunction("window.__done === true", { timeout: 60000 });
    const metrics = await page.evaluate("window.__metrics");
    ok(`§B the six wedges compose into his whole-hex floor (painted px=${metrics.painted}, mean |diff|=${metrics.meanAbsDiff.toFixed(2)}, ${(metrics.withinShare * 100).toFixed(1)}% of painted pixels within 32)`,
      metrics.painted > 100000 && metrics.meanAbsDiff <= 12 && metrics.withinShare >= 0.88,
      JSON.stringify(metrics));
    const shot = async (sel, file) => {
      const el = await page.$(sel);
      if (el) await el.screenshot({ path: join(SHOTS, file) });
    };
    await shot("#panelHex", "hex-composite.png");
    await shot("#panelWhole", "whole-hex.png");
    await shot("#panelRosette", "rosette.png");
    await shot("#panelIsland", "free-island.png");
    console.log("  screenshots:", join(SHOTS, "hex-composite.png"), join(SHOTS, "rosette.png"), join(SHOTS, "free-island.png"));
  } catch (e) {
    ok("§B browser render completed", false, String(e && e.message ? e.message : e));
  } finally {
    if (browser) await browser.close();
  }
}

console.log(`\ndrive-triangle-floor-art: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
