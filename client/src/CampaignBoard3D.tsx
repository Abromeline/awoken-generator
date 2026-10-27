// THE CAMPAIGN BOARD (Twelve #12, Build 2 — Nigel, ruled
// 2026-10-21; built 2026-10-26): in a CAMPAIGN room, every
// seat's map is the 3D board — his hand-sculpted hex tiles
// (the decimated working set of record, served from
// /tiles3d) standing on the room's own ground, under the
// lighting system's dusk. Casual rooms never load this
// component; their flat Table stands exactly as it did.
//
// The board renders the room's SERVED state and nothing
// else: each hex wears the cursed glass while the curse
// holds it (the recipe of record from the proofs — matte
// shell, dark heart, glow weighted to the edges, the
// game's curse reds, rest-dim at 0.6), the bare slab once
// held back, or the pool tile the storyteller laid there.
// The light is the server's (t.light), drawn as pools over
// the ground and real point light at fighting hexes —
// figures are unlit sprites and tokens, never darkened.
//
// The geometry pipeline is the proofs' own (hex-map-proof
// REPORT.md): OBJLoader, vertex weld at 1e-4, planar UVs
// from the tile's own bounds, computed normals, seated by
// its lowest point. The five test skins dress the tiles
// until his own textures arrive (the road, step 4).
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { mergeVertices, mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** The tile pool, client's mirror of the server's
 *  TILE3D_POOL (table.ts) — the two must move together.
 *  The skin per tile is the proof arrangement's (REPORT.md):
 *  mountains and hills in rock, the blanks in grass, the
 *  cobbles in cobblestone, the slab in dungeon stone, mud
 *  in mud. */
export const TILE3D_POOL: Record<string, { name: string; file: string; tex: string }> = {
  blank: { name: "Blank Rocky Hex", file: "blank rocky hex.obj", tex: "grass" },
  cobble1: { name: "Cobblestone Slab", file: "Cobblestone 1.obj", tex: "dungeon" },
  cobblehex: { name: "Cobblestone Hex", file: "cobblestone hex .obj", tex: "cobblestone" },
  elev: { name: "Elevated Blank", file: "elevated blank_copy.obj", tex: "grass" },
  cave: { name: "Hill Cave", file: "hill cave.obj", tex: "rock" },
  largehill: { name: "Large Hill", file: "large hill_copy.obj", tex: "rock" },
  mtn1: { name: "Mountain I", file: "Mtn 1.obj", tex: "rock" },
  mtnhex1: { name: "Mountain Hex I", file: "mtn hex 1_copy.obj", tex: "rock" },
  mud: { name: "Mud Hex", file: "mud hex 1.obj", tex: "mud" },
  rockshill: { name: "Rocks Hill", file: "rocks hill 1.obj", tex: "rock" },
  rocky2: { name: "Rocky Hill II", file: "rocky hill 2.obj", tex: "rock" },
};
/** The building pieces of record — mirror of the server's
 *  BLD3D_PIECES: honest block forms (a wall slab, a
 *  foundation slab) in the family's skin. */
export const BLD3D_PIECES: Record<string, { name: string; form: "wall" | "slab" | "wedge" | "hexfloor" | "square" | "slantwall" | "doorwall" | "halfwall" | "post" | "hexcap" | "sqcap" | "step" | "bridge"; mat: "brick" | "stone" | "earth" | "dark" }> = {
  brickwall: { name: "Dark Brick Walls", form: "wall", mat: "brick" },
  brickfound: { name: "Dark Brick Foundations & Ceilings", form: "slab", mat: "brick" },
  stonewall: { name: "Stone Walls", form: "wall", mat: "stone" },
  stonefound: { name: "Stone Foundations & Ceilings", form: "slab", mat: "stone" },
  earthwall: { name: "Earth Walls", form: "wall", mat: "earth" },
  earthfound: { name: "Earth Foundations & Ceilings", form: "slab", mat: "earth" },
  // The fuller kit (Nigel, 2026-10-27): the twelve faces
  // of his building draw sheet — the homeland's own kit
  // (the one-map law) — as placeable forms in a dark
  // neutral skin; their drawn faces skin them when the
  // PSD intake lands (flagged in the build report).
  trifloor: { name: "Triangle Floor", form: "wedge", mat: "dark" },
  hexfloor: { name: "Whole-Hex Floor", form: "hexfloor", mat: "dark" },
  sqfound: { name: "Square Foundation", form: "square", mat: "dark" },
  longwall: { name: "Full Wall — Long Edge", form: "wall", mat: "dark" },
  slantwall: { name: "Full Wall — Slant Edge", form: "slantwall", mat: "dark" },
  doorwall: { name: "Doorway Wall", form: "doorwall", mat: "dark" },
  halfwall: { name: "Half Wall", form: "halfwall", mat: "dark" },
  post: { name: "Corner Post", form: "post", mat: "dark" },
  hexcap: { name: "Six-Slope Roof Cap", form: "hexcap", mat: "dark" },
  sqcap: { name: "Square Pitched Cap", form: "sqcap", mat: "dark" },
  step: { name: "Terrace Step", form: "step", mat: "dark" },
  bridge: { name: "Bridge Deck", form: "bridge", mat: "dark" },
};

export interface BoardTileView {
  id: string; q: number; r: number; cursed: boolean;
  element: string | null; light?: number;
}
export interface BoardUnitView {
  hex: string; cardId: string; name: string; art: string | null;
  hp: number; maxHp: number; pos: { x: number; y: number };
  ownerKey: string; ownerName: string;
}
export interface BoardDarkView {
  id: string; hex: string; kind: string; label: string; art: string | null;
  hp: number; maxHp: number; pos: { x: number; y: number };
}
export interface BoardWorkingView {
  id: string; kind: string; name: string; hue: string;
  hex: string | null; hexA: string | null;
}
export interface BoardPlayerView {
  key: string; name: string; hex: string | null;
  pos: { x: number; y: number } | null; storytender?: boolean;
}
export interface CampaignBoardApi {
  projectHex: (hexId: string) => { x: number; y: number } | null;
  projectStagePoint: (pt: { x: number; y: number }) => { x: number; y: number } | null;
  zoomBy: (f: number) => void;
  resetView: () => void;
  info: () => {
    ready: boolean; hexes: number; groundMeshes: number;
    litFighting: string[]; litFaint: string[];
    tileKinds: Record<string, string>; buildings: Record<string, string>;
    props: Record<string, string>; backdrop: string | null; propMeshes: number;
    pointLights: number; shadowLights: number;
  };
}

interface Props {
  tiles: BoardTileView[];
  tile3d: Record<string, string>;
  bld3d: Record<string, string>;
  props3d: Record<string, string>;
  propsPool: { key: string; name: string; objText: string }[];
  backdrop: string | null;
  seed: { level: number; stage: string } | null;
  field: BoardUnitView[];
  dark: BoardDarkView[];
  workings: BoardWorkingView[];
  players: BoardPlayerView[];
  canBuild: boolean;
  onHexTap: (tile: BoardTileView, stagePt: { x: number; y: number }) => void;
  onHexContext: (tile: BoardTileView, clientX: number, clientY: number, stagePt: { x: number; y: number }) => void;
  apiRef: React.MutableRefObject<CampaignBoardApi | null>;
}

const SQ3 = Math.sqrt(3);
const ASSET = "/tiles3d";
const axialToWorld = (q: number, r: number) => new THREE.Vector3(SQ3 * (q + r / 2), 0, 1.5 * r);
/** Stage px (the Table's iso measure) → the board's world.
 *  The iso basis is the geometry of record (table.ts
 *  isoOffset): px = q·1292k, py = q·470k + r·948k at
 *  k = 40/796 — inverted here, then laid on the hex grid. */
const ISO_K = 40 / 796;
function stageToWorld(x: number, y: number): THREE.Vector3 {
  const q = x / (1292 * ISO_K);
  const r = (y - q * 470 * ISO_K) / (948 * ISO_K);
  return axialToWorld(q, r);
}
function worldToStage(w: THREE.Vector3): { x: number; y: number } {
  const r = w.z / 1.5;
  const q = w.x / SQ3 - r / 2;
  return { x: q * 1292 * ISO_K, y: q * 470 * ISO_K + r * 948 * ISO_K };
}
function hash2(q: number, r: number): number { return ((q * 73856093) ^ (r * 19349663)) >>> 0; }
function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const cellYaw = (q: number, r: number) => THREE.MathUtils.degToRad(60 * (hash2(q, r) % 6));
const OWNER_COLORS = ["#e8b13a", "#57c8ff", "#7dd069", "#ff7a9e", "#cdb9ff", "#ff9c4a", "#4ad6c2", "#f0e68c"];
function ownerColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return OWNER_COLORS[h % OWNER_COLORS.length];
}

/* ── shared geometry/texture caches (loaded once) ─────── */
interface TileGeo { geo: THREE.BufferGeometry; height: number }
let geoPromise: Promise<Record<string, TileGeo>> | null = null;
function loadGeos(): Promise<Record<string, TileGeo>> {
  if (geoPromise) return geoPromise;
  const loader = new OBJLoader();
  geoPromise = (async () => {
    const out: Record<string, TileGeo> = {};
    await Promise.all(Object.entries(TILE3D_POOL).map(async ([key, def]) => {
      const res = await fetch(`${ASSET}/tiles/${encodeURIComponent(def.file)}`);
      const text = await res.text();
      const obj = loader.parse(text);
      const parts: THREE.BufferGeometry[] = [];
      obj.traverse((c) => { if ((c as THREE.Mesh).isMesh) parts.push((c as THREE.Mesh).geometry); });
      let geo = parts.length === 1 ? parts[0] : mergeGeometries(parts)!;
      geo = mergeVertices(geo, 1e-4);
      geo.computeBoundingBox();
      const bb = geo.boundingBox!;
      const sp = new THREE.Vector3(); bb.getSize(sp);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const uv = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        uv[i * 2] = (pos.getX(i) - bb.min.x) / sp.x;
        uv[i * 2 + 1] = (pos.getZ(i) - bb.min.z) / sp.z;
      }
      geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      geo.translate(0, -bb.min.y, 0);
      out[key] = { geo, height: sp.y };
    }));
    return out;
  })();
  return geoPromise;
}
/** THE BACKDROPS (Build 2): the sky the map is laid over,
 *  as the storyteller chose it — the dusk is the lighting's
 *  own; the rest are the standing set's colours. The board
 *  wears the served choice on every seat alike. */
export const BOARD_BACKDROPS: Record<string, { name: string; sky: number; ground: number }> = {
  dusk: { name: "The Dusk (as the light stands)", sky: 0x0a0b10, ground: 0x101116 },
  starfield: { name: "Starfield Deep", sky: 0x04060f, ground: 0x070a16 },
  emberdark: { name: "Ember Dark", sky: 0x120806, ground: 0x170c09 },
  deepwood: { name: "Deepwood Gloom", sky: 0x071009, ground: 0x0b130c },
  voidblack: { name: "The Void Black", sky: 0x000000, ground: 0x050505 },
  dawnmist: { name: "Dawn Mist", sky: 0x232a33, ground: 0x272d33 },
};
/* Prop geometry: Dougie from the client assets, uploads
 * from their served .obj text — parsed for real, normalised
 * (centred, seated, scaled to its span), exactly as the
 * proof's upload door stood them. A parse failure resolves
 * null and the board stands a named marker instead. */
const propGeoCache = new Map<string, Promise<THREE.BufferGeometry | null>>();
function loadPropGeo(cacheKey: string, textP: Promise<string>, span: number): Promise<THREE.BufferGeometry | null> {
  let pr = propGeoCache.get(cacheKey);
  if (pr) return pr;
  pr = (async () => {
    try {
      const text = await textP;
      const obj = new OBJLoader().parse(text);
      const parts: THREE.BufferGeometry[] = [];
      obj.traverse((c) => { if ((c as THREE.Mesh).isMesh) parts.push((c as THREE.Mesh).geometry); });
      if (!parts.length) return null;
      let geo = parts.length === 1 ? parts[0] : mergeGeometries(parts)!;
      geo = mergeVertices(geo, 1e-4);
      geo.computeBoundingBox();
      const bb = geo.boundingBox!;
      const size = new THREE.Vector3(); bb.getSize(size);
      const centre = new THREE.Vector3(); bb.getCenter(centre);
      const sc = span / Math.max(size.x, size.z, 0.001);
      geo.translate(-centre.x, -bb.min.y, -centre.z);
      geo.scale(sc, sc, sc);
      geo.computeVertexNormals();
      return geo;
    } catch { return null; }
  })();
  propGeoCache.set(cacheKey, pr);
  return pr;
}
const texCache = new Map<string, THREE.Texture>();
function skinTex(stem: string): THREE.Texture {
  let t = texCache.get(stem);
  if (!t) {
    t = new THREE.TextureLoader().load(`${ASSET}/tex/${stem}.png`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    texCache.set(stem, t);
  }
  return t;
}
const imgTexCache = new Map<string, THREE.Texture>();
function imgTex(url: string): THREE.Texture {
  let t = imgTexCache.get(url);
  if (!t) {
    t = new THREE.TextureLoader().load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    imgTexCache.set(url, t);
  }
  return t;
}
function labelSprite(text: string, color = "#ece5d3", scale = 2.3): THREE.Sprite {
  const cv = document.createElement("canvas"); cv.width = 512; cv.height = 72;
  const ctx = cv.getContext("2d")!;
  ctx.font = "34px Georgia, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.9)"; ctx.shadowBlur = 7;
  ctx.fillStyle = color; ctx.fillText(text, 256, 38);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(scale, scale * 0.14, 1);
  return s;
}
function barSprite(hp: number, maxHp: number): THREE.Sprite {
  const cv = document.createElement("canvas"); cv.width = 128; cv.height = 16;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "rgba(0,0,0,0.65)"; ctx.fillRect(0, 0, 128, 16);
  const f = Math.max(0, Math.min(1, maxHp > 0 ? hp / maxHp : 0));
  ctx.fillStyle = f > 0.45 ? "#c22333" : "#ff5a3c";
  ctx.fillRect(2, 2, 124 * f, 12);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(1.1, 0.14, 1);
  return s;
}

/* ── the cursed glass (recipe of record, hex-map-cursed,
 *  as the storyteller proof held it — rest-dim 0.6) ──── */
function glassBodyTexture(seed: number): THREE.Texture {
  const S = 512, cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const ctx = cv.getContext("2d")!;
  const rand = rng(seed);
  const heart = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  heart.addColorStop(0, "#190000"); heart.addColorStop(0.52, "#2d0000");
  heart.addColorStop(0.82, "#600412"); heart.addColorStop(1, "#940e34");
  ctx.fillStyle = heart; ctx.fillRect(0, 0, S, S);
  const tones = ["#190000", "#320000", "#3d0a12", "#170000"];
  for (let i = 0; i < 170; i++) {
    const x = rand() * S, y = rand() * S, rad = 12 + rand() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const c = tones[(rand() * tones.length) | 0];
    g.addColorStop(0, c + "bb"); g.addColorStop(1, c + "00");
    ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (const [fx, fy, rx, col] of [[0.22, 0.36, 0.15, "rgba(178,24,44,0.55)"], [0.74, 0.60, 0.15, "rgba(160,20,70,0.50)"], [0.68, 0.20, 0.12, "rgba(178,24,44,0.45)"], [0.26, 0.72, 0.11, "rgba(160,20,70,0.42)"]] as const) {
    const g = ctx.createRadialGradient(S * fx, S * fy, 0, S * fx, S * fy, S * rx);
    g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.save(); ctx.translate(S * fx, S * fy); ctx.scale(1, 1.9); ctx.translate(-S * fx, -S * fy);
    ctx.fillRect(S * fx - S * rx, S * fy - S * rx, S * rx * 2, S * rx * 2); ctx.restore();
  }
  ctx.lineCap = "round";
  for (let i = 0; i < 12; i++) {
    const a0 = rand() * Math.PI * 2, r0 = 70 + rand() * 110;
    let x = S / 2 + Math.cos(a0) * r0, y = S / 2 + Math.sin(a0) * r0;
    const pts: [number, number][] = [[x, y]];
    const steps = 3 + (rand() * 3 | 0);
    for (let j = 0; j < steps; j++) {
      const dx = x - S / 2, dy = y - S / 2, dl = Math.hypot(dx, dy) || 1;
      x += (dx / dl) * (26 + rand() * 34) + (rand() - 0.5) * 110;
      y += (dy / dl) * (26 + rand() * 34) + (rand() - 0.5) * 110;
      pts.push([x, y]);
    }
    for (const [w, col] of [[6, "rgba(194,35,51,0.30)"], [2.2, "rgba(194,35,51,0.98)"]] as const) {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
      pts.forEach(([px, py], k) => { if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
      ctx.stroke();
    }
  }
  ctx.fillStyle = "rgba(194,35,51,0.85)";
  for (let i = 0; i < 16; i++) { ctx.beginPath(); ctx.arc(rand() * S, rand() * S, 1.5 + rand() * 2.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalCompositeOperation = "multiply";
  const deepen = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  deepen.addColorStop(0, "rgb(92,92,92)"); deepen.addColorStop(0.6, "rgb(205,205,205)");
  deepen.addColorStop(0.85, "rgb(255,255,255)"); deepen.addColorStop(1, "rgb(255,255,255)");
  ctx.fillStyle = deepen; ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = "source-over";
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function glassAlphaTexture(): THREE.Texture {
  const S = 256, cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const ctx = cv.getContext("2d")!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgb(242,242,242)"); g.addColorStop(0.6, "rgb(216,216,216)");
  g.addColorStop(0.85, "rgb(186,186,186)"); g.addColorStop(1, "rgb(168,168,168)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cv); t.anisotropy = 4;
  return t;
}
function makeGlassMat(): THREE.MeshPhysicalMaterial {
  const tex = glassBodyTexture(707);
  const mat = new THREE.MeshPhysicalMaterial({
    map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.6,
    alphaMap: glassAlphaTexture(), transparent: true,
    roughness: 0.42, metalness: 0, clearcoat: 0, clearcoatRoughness: 0.6,
    envMapIntensity: 0.12, specularIntensity: 0.35, ior: 1.45,
    side: THREE.FrontSide, depthWrite: false,
  });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFresnelColor = { value: new THREE.Color(194 / 255, 35 / 255, 51 / 255) };
    sh.uniforms.uFresnelStrength = { value: 0.9 };
    sh.fragmentShader = "uniform vec3 uFresnelColor;\nuniform float uFresnelStrength;\n" +
      sh.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
      float gFres = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 4.5);
      totalEmissiveRadiance += uFresnelColor * gFres * uFresnelStrength;`);
  };
  return mat;
}
/** The building pieces' skins — canvas-painted brick,
 *  stone and earth, as the proof painted them. */
function pieceTexture(mat: string): THREE.Texture {
  const S = 256, cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const ctx = cv.getContext("2d")!;
  const rand = rng(mat === "brick" ? 41 : mat === "stone" ? 97 : 55);
  if (mat === "earth") {
    ctx.fillStyle = "#4a3826"; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = `rgba(${20 + rand() * 40 | 0},${14 + rand() * 26 | 0},${8 + rand() * 16 | 0},0.5)`;
      ctx.fillRect(rand() * S, rand() * S, 2 + rand() * 9, 2 + rand() * 5);
    }
    ctx.strokeStyle = "rgba(24,16,8,0.8)"; ctx.lineWidth = 3;
    for (let y = 0; y <= S; y += 52) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke(); }
  } else {
    const base = mat === "brick" ? [34, 33, 40] : mat === "dark" ? [52, 50, 58] : [96, 96, 102];
    const bh = 32, bw = 62;
    ctx.fillStyle = `rgb(${base[0] - 14},${base[1] - 14},${base[2] - 14})`; ctx.fillRect(0, 0, S, S);
    for (let row = 0; row * bh < S; row++) {
      const off = (row % 2) * bw / 2;
      for (let col = -1; col * bw < S + bw; col++) {
        const v = (rand() - 0.5) * 22;
        ctx.fillStyle = `rgb(${base[0] + v | 0},${base[1] + v | 0},${base[2] + v + 4 | 0})`;
        ctx.fillRect(col * bw + off + 2, row * bh + 2, bw - 4, bh - 4);
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fillRect(col * bw + off + 2, row * bh + 2, bw - 4, 4);
      }
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Cell {
  id: string; q: number; r: number;
  group: THREE.Group;
  ground: THREE.Object3D | null;
  building: THREE.Group | null;
  plot: THREE.Mesh | null;
  disc: THREE.Mesh | null;
  mat: THREE.MeshStandardMaterial | null;
  sig: string;
  topY: number;
  pick: THREE.Mesh | null;
}

export default function CampaignBoard3D(props: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [readyUi, setReadyUi] = useState(false);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    const SQ = Math.sqrt(3);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0b10);
    scene.fog = new THREE.Fog(0x0a0b10, 46, 110);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
    // The dusk rig: the seat rig of the proofs, dimmed to
    // the lighting system's evening — a low hemisphere and
    // one warm key. Real light at fighting hexes is added
    // per hex below; the stage's darkness is the default.
    scene.add(new THREE.HemisphereLight(0x8d99b0, 0x2a2620, 0.55));
    const sun = new THREE.DirectionalLight(0xffe8c4, 1.0);
    sun.position.set(13.5, 22.5, 10.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 2, far: 70 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0005;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xaebdd4, 0.22);
    fill.position.set(-8, 6, -9);
    scene.add(fill);
    const groundDisc = new THREE.Mesh(
      new THREE.CircleGeometry(80, 48),
      new THREE.MeshStandardMaterial({ color: 0x101116, roughness: 1, envMapIntensity: 0 }));
    groundDisc.rotation.x = -Math.PI / 2; groundDisc.position.y = -0.03;
    groundDisc.receiveShadow = true;
    scene.add(groundDisc);

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    /* camera rig — hand-rolled orbit: drag turns, the
     * wheel closes in, shift-drag (or the middle button)
     * pans. Right-click is the wheel's, never the camera's. */
    const cam = { az: 0.62, pol: 0.98, dist: 30, tx: 0, tz: 0, gaz: 0.62, gpol: 0.98, gdist: 30, gtx: 0, gtz: 0 };
    const applyCam = () => {
      const sp = Math.sin(cam.pol), y = Math.cos(cam.pol);
      camera.position.set(
        cam.tx + cam.dist * sp * Math.sin(cam.az),
        cam.dist * y,
        cam.tz + cam.dist * sp * Math.cos(cam.az));
      camera.lookAt(cam.tx, 0.2, cam.tz);
    };

    const cellsGroup = new THREE.Group(); scene.add(cellsGroup);
    const figGroup = new THREE.Group(); scene.add(figGroup);
    const pickGroup = new THREE.Group(); scene.add(pickGroup);
    const lightGroup = new THREE.Group(); scene.add(lightGroup);
    const propGroup = new THREE.Group(); scene.add(propGroup);
    const pickGeo = new THREE.CylinderGeometry(0.97, 0.97, 0.9, 6);
    const pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const discGeo = new THREE.CircleGeometry(0.98, 6);

    let geos: Record<string, TileGeo> | null = null;
    let baseMats: Record<string, THREE.MeshStandardMaterial> | null = null;
    let glassMat: THREE.MeshPhysicalMaterial | null = null;
    let plotMat: THREE.MeshStandardMaterial | null = null;
    let pieceMats: Record<string, THREE.MeshStandardMaterial> | null = null;
    const cells = new Map<string, Cell>();
    const pickMeshes: THREE.Mesh[] = [];
    let ready = false;

    const tileByIdNow = () => new Map(propsRef.current.tiles.map(t => [t.id, t]));
    const topYOf = (id: string): number => cells.get(id)?.topY ?? 0.25;

    function buildBuilding(cell: Cell, key: string) {
      if (cell.building) { cell.group.remove(cell.building); cell.building = null; }
      const def = BLD3D_PIECES[key];
      if (!def || !pieceMats) return;
      const grp = new THREE.Group();
      const M = pieceMats[def.mat];
      const T = cell.topY;
      const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0) => {
        const m = new THREE.Mesh(geo, M);
        m.position.set(x, y, z);
        m.rotation.y = ry;
        m.castShadow = true; m.receiveShadow = true;
        grp.add(m);
        return m;
      };
      // The forms of the kit. Every form is true geometry
      // with its sides standing — the square above all
      // (Nigel, 2026-10-27): a square prism whose top face
      // and four sides read at whatever angle the
      // placement's yaw sets it, never a bare flat diamond.
      let labY = T + 0.75;
      switch (def.form) {
        case "wall":
          add(new THREE.BoxGeometry(1.62, 0.95, 0.3), 0, T + 0.48, 0); labY = T + 1.45; break;
        case "slantwall": // along the slant edge: the wall box turned 60°
          add(new THREE.BoxGeometry(1.62, 0.95, 0.3), 0, T + 0.48, 0, Math.PI / 3); labY = T + 1.45; break;
        case "doorwall": // two standing segments, a real gap, a lintel over it
          add(new THREE.BoxGeometry(0.56, 0.95, 0.3), -0.53, T + 0.48, 0);
          add(new THREE.BoxGeometry(0.56, 0.95, 0.3), 0.53, T + 0.48, 0);
          add(new THREE.BoxGeometry(0.56, 0.3, 0.3), 0, T + 0.8, 0); labY = T + 1.45; break;
        case "halfwall":
          add(new THREE.BoxGeometry(1.62, 0.45, 0.3), 0, T + 0.23, 0); labY = T + 0.95; break;
        case "post":
          add(new THREE.BoxGeometry(0.3, 1.1, 0.3), 0.62, T + 0.55, 0.62); labY = T + 1.6; break;
        case "wedge": // the triangle floor: a three-sided prism plate
          add(new THREE.CylinderGeometry(0.98, 0.98, 0.14, 3), 0, T + 0.07, 0); break;
        case "hexfloor":
          add(new THREE.CylinderGeometry(0.98, 0.98, 0.14, 6), 0, T + 0.07, 0); break;
        case "square": // top face + four sides, at the placement's angle
          add(new THREE.BoxGeometry(1.3, 0.3, 1.3), 0, T + 0.15, 0); labY = T + 0.85; break;
        case "hexcap": // six slopes rising to a point
          add(new THREE.ConeGeometry(1.08, 0.72, 6), 0, T + 0.86, 0); labY = T + 1.7; break;
        case "sqcap": // a square pyramid, its faces true to the square
          add(new THREE.ConeGeometry(0.98, 0.66, 4), 0, T + 0.83, 0, Math.PI / 4); labY = T + 1.65; break;
        case "step": // two terrace treads
          add(new THREE.BoxGeometry(1.5, 0.18, 1.15), 0, T + 0.09, 0.1);
          add(new THREE.BoxGeometry(1.5, 0.18, 0.62), 0, T + 0.27, -0.16); labY = T + 0.9; break;
        case "bridge": // the deck spans past the hex, posts at its ends
          add(new THREE.BoxGeometry(2.35, 0.12, 0.9), 0, T + 0.42, 0);
          add(new THREE.BoxGeometry(0.16, 0.42, 0.8), -1.0, T + 0.21, 0);
          add(new THREE.BoxGeometry(0.16, 0.42, 0.8), 1.0, T + 0.21, 0); labY = T + 1.0; break;
        default: // "slab" — foundations & ceilings
          add(new THREE.BoxGeometry(1.66, 0.2, 1.66), 0, T + 0.1, 0);
      }
      const lab = labelSprite(def.name);
      lab.position.y = labY;
      grp.add(lab);
      grp.rotation.y = cellYaw(cell.q, cell.r);
      cell.group.add(grp);
      cell.building = grp;
    }

    function syncCell(t: BoardTileView) {
      if (!geos || !baseMats || !glassMat || !plotMat) return;
      const p = propsRef.current;
      const kind = p.tile3d[t.id] ?? null;
      const bld = p.bld3d[t.id] ?? null;
      const light = t.light ?? 0;
      const sig = `${t.cursed ? 1 : 0}|${kind}|${bld}|${light}`;
      let cell = cells.get(t.id);
      if (!cell) {
        const group = new THREE.Group();
        const w = axialToWorld(t.q, t.r);
        group.position.copy(w);
        cellsGroup.add(group);
        cell = { id: t.id, q: t.q, r: t.r, group, ground: null, building: null, plot: null, disc: null, mat: null, sig: "", topY: 0.25, pick: null };
        cells.set(t.id, cell);
        const pick = new THREE.Mesh(pickGeo, pickMat);
        pick.position.set(w.x, 0.35, w.z);
        pick.userData.cell = t.id;
        pickGroup.add(pick);
        pickMeshes.push(pick);
        cell.pick = pick;
      }
      if (cell.sig === sig) return;
      cell.sig = sig;
      // ground
      if (cell.ground) { cell.group.remove(cell.ground); cell.ground = null; cell.mat = null; }
      if (cell.plot) { cell.plot.visible = false; }
      if (kind && geos[kind]) {
        const mat = baseMats[kind].clone();
        mat.emissive = new THREE.Color(0xffdf9e);
        mat.emissiveIntensity = light === 2 ? 0.10 : light === 1 ? 0.08 : 0;
        const m = new THREE.Mesh(geos[kind].geo, mat);
        m.rotation.y = cellYaw(t.q, t.r);
        m.castShadow = true; m.receiveShadow = true;
        cell.group.add(m);
        cell.ground = m; cell.mat = mat;
        cell.topY = geos[kind].height;
      } else if (t.cursed) {
        const m = new THREE.Mesh(geos.cobble1.geo, glassMat);
        m.rotation.y = cellYaw(t.q, t.r);
        m.renderOrder = 3;
        cell.group.add(m);
        cell.ground = m;
        cell.topY = geos.cobble1.height;
        if (bld) {
          // a building on cursed ground stands on its held plot
          if (!cell.plot) {
            cell.plot = new THREE.Mesh(geos.cobble1.geo, plotMat);
            cell.plot.receiveShadow = true;
            cell.group.add(cell.plot);
          }
          cell.plot.visible = true;
          m.visible = false;
        }
      } else {
        const m = new THREE.Mesh(geos.cobble1.geo, plotMat);
        m.receiveShadow = true;
        cell.group.add(m);
        cell.ground = m;
        cell.topY = geos.cobble1.height;
      }
      // the faint glow's soft disc (fighting hexes wear
      // none — their light is the scene light itself,
      // radiating and falling off across the ground)
      if (cell.disc) { cell.group.remove(cell.disc); cell.disc = null; }
      if (light === 1) {
        const dm = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({
          color: 0xffdca3, transparent: true, opacity: 0.10,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        }));
        dm.rotation.x = -Math.PI / 2; dm.rotation.z = Math.PI / 6;
        dm.position.y = cell.topY + 0.03;
        dm.renderOrder = 4;
        cell.group.add(dm);
        cell.disc = dm;
      }
      // the building (rebuilt with the ground it seats on)
      if (cell.building) { cell.group.remove(cell.building); cell.building = null; }
      if (bld) buildBuilding(cell, bld);
      // The pick cylinder stands on the tile's own top:
      // a tap is aimed at the face the player sees, and a
      // cylinder left at ground height lets a tall tile's
      // tap sail over it onto the hex behind.
      if (cell.pick) cell.pick.position.y = cell.topY + 0.35;
    }

    /* THE CONTINUOUS LIGHT (Nigel, 2026-10-26 18:22: "i
     * would want continuous lighting from sources on the
     * map like the beacon lighting areas and casting
     * shadows where it meets towers walls and awoken"):
     * every FIGHTING hex is a real scene light at its
     * source — warm, with distance and decay, so the lit
     * area RADIATES and falls off across the ground and
     * its neighbours, never a hex-shaped pool. The
     * server's per-hex light stays the mechanics' truth;
     * this face only renders from those sources. The
     * iPad's budget, named: at most ten point lights
     * stand (a beacon's seven and a hand's few more);
     * of them at most TWO cast shadows, with 512-face
     * cube maps — the two sources nearest the board's
     * heart — and the casters are the standing structures
     * (tile, building, the seed crystal) and the figure
     * pawns. Past the shadow two, light still falls and
     * lifts; it simply casts no new shadow. */
    let shadowLightsNow = 0;
    let pointLightsNow = 0;
    function syncPointLights() {
      lightGroup.clear();
      const p = propsRef.current;
      const fighting = p.tiles.filter(t => (t.light ?? 0) === 2)
        .sort((a, b) => (Math.abs(a.q) + Math.abs(a.r)) - (Math.abs(b.q) + Math.abs(b.r)))
        .slice(0, 10);
      pointLightsNow = fighting.length;
      shadowLightsNow = 0;
      for (const t of fighting) {
        const w = axialToWorld(t.q, t.r);
        const pl = new THREE.PointLight(0xffc978, 26, 7.5, 1.8);
        pl.position.set(w.x, topYOf(t.id) + 1.5, w.z);
        if (shadowLightsNow < 2) {
          pl.castShadow = true;
          pl.shadow.mapSize.set(512, 512);
          pl.shadow.camera.near = 0.3;
          pl.shadow.camera.far = 9;
          pl.shadow.bias = -0.005;
          shadowLightsNow++;
        }
        lightGroup.add(pl);
      }
    }

    /* ── figures: unlit, always — the dusk never takes
     * them. Keyed and persistent, so a state push moves
     * them instead of remaking them. ── */
    interface Fig { grp: THREE.Group; sig: string; bar?: THREE.Sprite; barKey?: string }
    const figs = new Map<string, Fig>();
    function pawnUnder(color: string): THREE.Mesh {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.21, 0.82, 10),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.85, metalness: 0, envMapIntensity: 0 }));
      m.position.y = 0.41;
      m.castShadow = true;
      return m;
    }
    function discUnder(color: string, radius = 0.52): THREE.Mesh {
      const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 24),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.5, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.03; m.renderOrder = 2;
      return m;
    }
    function figSprite(url: string | null, fallback: string): THREE.Sprite {
      const mat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false });
      if (url) { mat.map = imgTex(url); mat.needsUpdate = true; }
      else {
        const cv = document.createElement("canvas"); cv.width = cv.height = 64;
        const ctx = cv.getContext("2d")!;
        ctx.fillStyle = fallback; ctx.beginPath(); ctx.arc(32, 32, 28, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#0e0f12"; ctx.font = "bold 34px Georgia"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("✦", 32, 34);
        const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
        mat.map = t; mat.needsUpdate = true;
      }
      const s = new THREE.Sprite(mat);
      s.scale.set(1.3, 1.3, 1); s.position.y = 0.72; s.renderOrder = 4;
      return s;
    }
    function placeFig(fig: Fig, w: THREE.Vector3, topY: number) {
      fig.grp.position.set(w.x, topY, w.z);
    }
    function syncFigures() {
      const p = propsRef.current;
      const seen = new Set<string>();
      const upsert = (key: string, make: () => Fig, sig: string, w: THREE.Vector3, topY: number) => {
        seen.add(key);
        let fig = figs.get(key);
        if (!fig) { fig = make(); figs.set(key, fig); figGroup.add(fig.grp); }
        if (fig.sig !== sig) { /* content rebuilt by caller via fig fields */ }
        placeFig(fig, w, topY);
        return fig;
      };
      // field Awokin
      for (const u of p.field) {
        const key = `u|${u.ownerKey}|${u.cardId}`;
        const w = stageToWorld(u.pos.x, u.pos.y);
        const fig = upsert(key, () => {
          const grp = new THREE.Group();
          grp.add(discUnder(ownerColor(u.ownerName)));
          grp.add(pawnUnder(ownerColor(u.ownerName)));
          grp.add(figSprite(u.art, ownerColor(u.ownerName)));
          const lab = labelSprite(u.name, "#ece5d3", 2.0); lab.position.y = 1.62; grp.add(lab);
          return { grp, sig: "" };
        }, "", w, topYOf(u.hex));
        fig.grp.position.y = topYOf(u.hex);
      }
      // the dark
      for (const e of p.dark) {
        const key = `d|${e.id}`;
        const w = stageToWorld(e.pos.x, e.pos.y);
        const fig = upsert(key, () => {
          const grp = new THREE.Group();
          grp.add(discUnder("#5a0f18"));
          grp.add(pawnUnder("#7c2432"));
          grp.add(figSprite(e.art, "#7c2432"));
          const lab = labelSprite(e.label, "#f0b8a6", 2.0); lab.position.y = 1.62; grp.add(lab);
          return { grp, sig: "" };
        }, "", w, topYOf(e.hex));
        fig.grp.position.y = topYOf(e.hex);
        const barKey = `${e.hp}/${e.maxHp}`;
        if (e.hp < e.maxHp && fig.barKey !== barKey) {
          if (fig.bar) { fig.grp.remove(fig.bar); fig.bar = undefined; }
          fig.bar = barSprite(e.hp, e.maxHp);
          fig.bar.position.y = 1.42;
          fig.grp.add(fig.bar);
          fig.barKey = barKey;
        } else if (e.hp >= e.maxHp && fig.bar) {
          fig.grp.remove(fig.bar); fig.bar = undefined; fig.barKey = undefined;
        }
      }
      // the Tenders themselves (seats with a standing point)
      for (const pl of p.players) {
        if (!pl.pos || pl.storytender) continue;
        const key = `p|${pl.key}`;
        const w = stageToWorld(pl.pos.x, pl.pos.y);
        upsert(key, () => {
          const grp = new THREE.Group();
          grp.add(discUnder(ownerColor(pl.name), 0.46));
          grp.add(pawnUnder(ownerColor(pl.name)));
          grp.add(figSprite(null, ownerColor(pl.name)));
          const lab = labelSprite(pl.name, "#ffd977", 2.0); lab.position.y = 1.62; grp.add(lab);
          return { grp, sig: "" };
        }, "", w, topYOf(pl.hex ?? "0,0"));
      }
      // workings: a small lit mark at their hex
      for (const wk of p.workings) {
        const hex = wk.hex ?? wk.hexA;
        if (!hex) continue;
        const key = `w|${wk.id}`;
        const [q, r] = hex.split(",").map(Number);
        const w = axialToWorld(q, r);
        upsert(key, () => {
          const grp = new THREE.Group();
          const col = wk.hue && wk.hue.startsWith("#") ? wk.hue : "#ffd977";
          const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.17),
            new THREE.MeshBasicMaterial({ color: new THREE.Color(col) }));
          gem.position.y = 0.55;
          gem.name = "working-gem";
          grp.add(gem);
          return { grp, sig: "" };
        }, "", w, topYOf(hex));
      }
      for (const [key, fig] of [...figs]) {
        if (!seen.has(key)) { figGroup.remove(fig.grp); figs.delete(key); }
      }
    }

    /* ── the seed: a crystal at the heart. Ungrown it
     * reads dim — a banked charge, no light of its own
     * (the source law); grown to the Beacon it wears the
     * warm read, and its light is the light map's. ── */
    const seedGroup = new THREE.Group();
    const seedCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.5),
      new THREE.MeshBasicMaterial({ color: 0x7787a8, transparent: true, opacity: 0.92 }));
    seedCrystal.position.y = 0.85;
    seedCrystal.castShadow = true;
    seedGroup.add(seedCrystal);
    const seedRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.78, 6),
      new THREE.MeshBasicMaterial({ color: 0xd9b36a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    seedRing.rotation.x = -Math.PI / 2; seedRing.rotation.z = Math.PI / 6;
    seedRing.position.y = 0.3;
    seedGroup.add(seedRing);
    const seedLabel = labelSprite("The Starseed", "#d8d2c2", 2.2);
    seedLabel.position.y = 1.9;
    seedGroup.add(seedLabel);
    scene.add(seedGroup);
    function syncSeed() {
      const s = propsRef.current.seed;
      const lvl = s?.level ?? 1;
      const w = axialToWorld(0, 0);
      seedGroup.position.set(w.x, topYOf("0,0"), w.z);
      const scale = 0.6 + 0.28 * lvl;
      seedCrystal.scale.set(scale, scale * 1.35, scale);
      const col = lvl >= 3 ? 0xffd977 : lvl === 2 ? 0xa8c69f : 0x7787a8;
      (seedCrystal.material as THREE.MeshBasicMaterial).color.setHex(col);
    }

    let backdropNow: string | null | undefined = undefined;
    function syncBackdrop() {
      const p = propsRef.current;
      const key = p.backdrop ?? "dusk";
      if (backdropNow === key) return;
      backdropNow = key;
      const def = BOARD_BACKDROPS[key] ?? BOARD_BACKDROPS.dusk;
      (scene.background as THREE.Color).setHex(def.sky);
      if (scene.fog) scene.fog.color.setHex(def.sky);
      (groundDisc.material as THREE.MeshStandardMaterial).color.setHex(def.ground);
    }
    /* The storyteller's scenic pieces: Dougie and her own
     * uploads, standing where she put them — scenic in this
     * build; they do not fight. */
    const propMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.9, metalness: 0.05, envMapIntensity: 0 });
    const propMarkerMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1, envMapIntensity: 0 });
    function syncProps() {
      const p = propsRef.current;
      const seen = new Set<string>();
      for (const [hex, key] of Object.entries(p.props3d)) {
        seen.add(hex);
        if (propGroup.children.some(g => g.userData.hex === hex && g.userData.key === key)) continue;
        for (const g of [...propGroup.children]) if (g.userData.hex === hex) propGroup.remove(g);
        const [q, r] = hex.split(",").map(Number);
        const w = axialToWorld(q, r);
        const grp = new THREE.Group();
        grp.userData.hex = hex; grp.userData.key = key;
        grp.position.set(w.x, topYOf(hex), w.z);
        propGroup.add(grp);
        const poolEntry = key === "dougie" ? null : p.propsPool.find(e => e.key === key);
        const name = key === "dougie" ? "Dougie" : poolEntry?.name ?? "Uploaded piece";
        const textP = key === "dougie"
          ? fetch(`${ASSET}/props/dougie.obj`).then(res => res.text())
          : Promise.resolve(poolEntry?.objText ?? "");
        loadPropGeo(key === "dougie" ? "dougie" : `${key}:${(poolEntry?.objText ?? "").length}`, textP, key === "dougie" ? 3.6 : 1.8).then(geo => {
          if (disposed || !propGroup.children.includes(grp)) return;
          if (geo) {
            const m = new THREE.Mesh(geo, propMat);
            m.castShadow = true; m.receiveShadow = true;
            grp.add(m);
          } else {
            const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), propMarkerMat);
            m.position.y = 0.5;
            grp.add(m);
          }
          const lab = labelSprite(name, "#d8d2c2", 2.2);
          lab.position.y = 2.1;
          grp.add(lab);
        });
      }
      for (const g of [...propGroup.children]) if (!seen.has(g.userData.hex as string)) propGroup.remove(g);
    }

    function syncAll() {
      if (!ready) return;
      const p = propsRef.current;
      for (const t of p.tiles) syncCell(t);
      // drop cells the room no longer serves
      const served = new Set(p.tiles.map(t => t.id));
      for (const [id, cell] of [...cells]) {
        if (!served.has(id)) { cellsGroup.remove(cell.group); cells.delete(id); }
      }
      syncPointLights();
      syncFigures();
      syncSeed();
      syncBackdrop();
      syncProps();
    }

    /* ── picking & pointer manners (the proof's law):
     * a tap is a tap, a drag is the camera; right-click
     * (or a long press) raises the wheel. ── */
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    function pick(clientX: number, clientY: number): { tile: BoardTileView; stagePt: { x: number; y: number } } | null {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(pickMeshes, false);
      if (!hits.length) return null;
      // The pick cylinders overlap in plan (radius 0.97
      // on centres 1.73 apart), and a TALL hex's cylinder
      // leans over the short hex behind it on screen — the
      // nearest surface along the ray is then the tall
      // neighbour's, and the tap is stolen. The tap means
      // the hex whose CENTRE it fell nearest, as the eye
      // reads the board: score every struck cylinder by
      // its cell's projected centre and take the nearest,
      // when that centre is truly under the tap.
      let hit = hits[0];
      if (hits.length > 1) {
        let best = Infinity;
        for (const h of hits.slice(0, 6)) {
          const cid = h.object.userData.cell as string;
          const cell = cells.get(cid);
          if (!cell) continue;
          const w = axialToWorld(cell.q, cell.r);
          w.y = cell.topY + 0.2;
          w.project(camera);
          const sx = rect.left + (w.x * 0.5 + 0.5) * rect.width;
          const sy = rect.top + (-w.y * 0.5 + 0.5) * rect.height;
          const d = Math.hypot(sx - clientX, sy - clientY);
          if (d < best) { best = d; hit = h; }
        }
        if (best > 60) hit = hits[0];
      }
      const id = hit.object.userData.cell as string;
      const tile = tileByIdNow().get(id);
      if (!tile) return null;
      return { tile, stagePt: worldToStage(hit.point) };
    }
    const el = renderer.domElement;
    el.style.touchAction = "none";
    let down: { x: number; y: number; t: number; button: number; moved: boolean } | null = null;
    let longTimer: ReturnType<typeof setTimeout> | null = null;
    let longFired = false;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchD = 0;
    const onCtx = (e: MouseEvent) => {
      e.preventDefault();
      const hit = pick(e.clientX, e.clientY);
      if (hit) propsRef.current.onHexContext(hit.tile, e.clientX, e.clientY, hit.stagePt);
    };
    el.addEventListener("contextmenu", onCtx);
    const onDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchD = Math.hypot(a.x - b.x, a.y - b.y);
        down = null;
        if (longTimer) { clearTimeout(longTimer); longTimer = null; }
        return;
      }
      down = { x: e.clientX, y: e.clientY, t: e.timeStamp, button: e.button, moved: false };
      longFired = false;
      if (e.button === 0) {
        const press = down;
        longTimer = setTimeout(() => {
          // The claim is deferred one beat and re-checked
          // against the SAME press: on a loaded renderer
          // (a big board, a working iPad) the release can
          // sit queued behind a long frame while this
          // timer comes due — a quick tap must still read
          // as a tap, never be swallowed as a long-press.
          setTimeout(() => {
            if (down !== press) return;
            longFired = true;
            const hit = pick(press.x, press.y);
            if (hit) propsRef.current.onHexContext(hit.tile, press.x, press.y, hit.stagePt);
          }, 60);
        }, 600);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchD > 0) { cam.gdist = THREE.MathUtils.clamp(cam.gdist * (pinchD / d), 10, 62); }
        pinchD = d;
        return;
      }
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.hypot(dx, dy) > 7) {
        down.moved = true;
        if (longTimer) { clearTimeout(longTimer); longTimer = null; }
      }
      if (down.moved) {
        if (down.button === 1 || (down.button === 0 && (e.shiftKey))) {
          const s = cam.dist * 0.0016;
          cam.gtx -= (dx * Math.cos(cam.az) - dy * Math.sin(cam.az)) * s;
          cam.gtz -= (-dx * Math.sin(cam.az) - dy * Math.cos(cam.az)) * s;
          cam.gtx = THREE.MathUtils.clamp(cam.gtx, -14, 14);
          cam.gtz = THREE.MathUtils.clamp(cam.gtz, -14, 14);
        } else if (down.button === 0) {
          cam.gaz -= dx * 0.0052;
          cam.gpol = THREE.MathUtils.clamp(cam.gpol - dy * 0.0042, 0.24, 1.36);
        }
        down.x = e.clientX; down.y = e.clientY;
      }
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (longTimer) { clearTimeout(longTimer); longTimer = null; }
      if (!down) return;
      const was = down;
      down = null;
      // The press's own timestamps judge it, never the
      // frame's: a hold of 600ms or more is the
      // long-press (its wheel stands if the timer spoke;
      // if a jammed renderer kept the timer from ever
      // running, the wheel rises here, at the release —
      // the press was still a hold, and it is still
      // honoured); anything shorter is a tap, even when
      // the long-press timer spoke first in error, in
      // which case the tap lands and its own hand sets
      // the wrongly-raised wheel back down.
      if (was.button === 0 && !was.moved) {
        const hit = pick(e.clientX, e.clientY);
        if (hit) {
          if (e.timeStamp - was.t >= 600) {
            if (!longFired) propsRef.current.onHexContext(hit.tile, e.clientX, e.clientY, hit.stagePt);
          } else {
            propsRef.current.onHexTap(hit.tile, hit.stagePt);
          }
        }
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cam.gdist = THREE.MathUtils.clamp(cam.gdist * Math.exp(e.deltaY * 0.0011), 10, 62);
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });

    /* ── the board's API (the Table's zoom buttons and
     * wheel projection read it; the drive proves by it) ── */
    const api: CampaignBoardApi = {
      projectHex: (hexId) => {
        const cell = cells.get(hexId);
        if (!cell) return null;
        const w = axialToWorld(cell.q, cell.r);
        w.y = cell.topY + 0.2;
        w.project(camera);
        const rect = el.getBoundingClientRect();
        return { x: rect.left + (w.x * 0.5 + 0.5) * rect.width, y: rect.top + (-w.y * 0.5 + 0.5) * rect.height };
      },
      projectStagePoint: (pt) => {
        const w = stageToWorld(pt.x, pt.y);
        w.y = 0.9;
        w.project(camera);
        const rect = el.getBoundingClientRect();
        if (rect.width === 0) return null;
        return { x: rect.left + (w.x * 0.5 + 0.5) * rect.width, y: rect.top + (-w.y * 0.5 + 0.5) * rect.height };
      },
      zoomBy: (f) => { cam.gdist = THREE.MathUtils.clamp(cam.gdist / f, 10, 62); },
      resetView: () => { cam.gaz = 0.62; cam.gpol = 0.98; cam.gdist = 30; cam.gtx = 0; cam.gtz = 0; },
      info: () => {
        const p = propsRef.current;
        return {
          ready,
          hexes: cells.size,
          groundMeshes: [...cells.values()].filter(c => c.ground).length,
          litFighting: p.tiles.filter(t => (t.light ?? 0) === 2).map(t => t.id),
          litFaint: p.tiles.filter(t => (t.light ?? 0) === 1).map(t => t.id),
          tileKinds: { ...p.tile3d },
          buildings: { ...p.bld3d },
          props: { ...p.props3d },
          backdrop: p.backdrop,
          propMeshes: propGroup.children.length,
          pointLights: pointLightsNow,
          shadowLights: shadowLightsNow,
        };
      },
    };
    propsRef.current.apiRef.current = api;
    (window as unknown as Record<string, unknown>).__campaignBoard = api;

    const fit = () => {
      const w = mount.clientWidth || 600, h = mount.clientHeight || 400;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(mount);

    let raf = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      cam.az += (cam.gaz - cam.az) * Math.min(1, dt * 9);
      cam.pol += (cam.gpol - cam.pol) * Math.min(1, dt * 9);
      cam.dist += (cam.gdist - cam.dist) * Math.min(1, dt * 9);
      cam.tx += (cam.gtx - cam.tx) * Math.min(1, dt * 9);
      cam.tz += (cam.gtz - cam.tz) * Math.min(1, dt * 9);
      applyCam();
      seedCrystal.rotation.y = t * 0.5;
      seedCrystal.position.y = 0.85 + Math.sin(t * 1.4) * 0.05;
      for (const fig of figs.values()) {
        const gem = fig.grp.getObjectByName("working-gem");
        if (gem) { gem.rotation.y = t * 1.3; gem.position.y = 0.55 + Math.sin(t * 2 + fig.grp.position.x) * 0.05; }
      }
      renderer.render(scene, camera);
    };
    animate();

    loadGeos().then((g) => {
      if (disposed) return;
      geos = g;
      baseMats = {};
      for (const [k, def] of Object.entries(TILE3D_POOL)) {
        baseMats[k] = new THREE.MeshStandardMaterial({ map: skinTex(def.tex), roughness: 0.96, metalness: 0, envMapIntensity: 0 });
      }
      glassMat = makeGlassMat();
      plotMat = new THREE.MeshStandardMaterial({ map: skinTex("cobblestone"), color: 0x777d84, roughness: 1, metalness: 0, envMapIntensity: 0 });
      pieceMats = {
        brick: new THREE.MeshStandardMaterial({ map: pieceTexture("brick"), roughness: 0.95, metalness: 0, envMapIntensity: 0 }),
        stone: new THREE.MeshStandardMaterial({ map: pieceTexture("stone"), roughness: 0.95, metalness: 0, envMapIntensity: 0 }),
        earth: new THREE.MeshStandardMaterial({ map: pieceTexture("earth"), roughness: 0.95, metalness: 0, envMapIntensity: 0 }),
        dark: new THREE.MeshStandardMaterial({ map: pieceTexture("dark"), roughness: 0.95, metalness: 0, envMapIntensity: 0 }),
      };
      ready = true;
      setReadyUi(true);
      syncAll();
    }).catch(() => { /* the veil stays up; the room stands */ });

    // prop changes re-sync the board (the parent re-renders
    // on every state push; this effect's closure reads
    // propsRef, and a light interval keeps sync honest
    // without a render-loop dependency).
    const syncIv = setInterval(syncAll, 450);

    return () => {
      disposed = true;
      clearInterval(syncIv);
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("contextmenu", onCtx);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      if (propsRef.current.apiRef.current === api) propsRef.current.apiRef.current = null;
      if ((window as unknown as Record<string, unknown>).__campaignBoard === api) {
        delete (window as unknown as Record<string, unknown>).__campaignBoard;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="campaign-board" ref={mountRef} role="img" aria-label="The campaign board — the storyteller's 3D map">
      {!readyUi && <div className="campaign-board-veil">Raising the board…</div>}
    </div>
  );
}
