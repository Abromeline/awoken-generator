/**
 * Terrain stage art — the resolver between the map and the creator's
 * uploads (Nigel, 2026-10-15).
 *
 * Every hex wears one of three stages as it terraforms: stage 1, the
 * broken floating land of the art Nigel provided with the game (bundled
 * in ./assets/terrain-iso, the only art that ever ships in the build);
 * stage 2, the elements swelling; stage 3, the fully filled, flourishing
 * hex. Stages 2 and 3 are his to upload from the workshop's Terrain
 * Stages section, one face per (element, stage). Until he does, every
 * tile at every stage renders with his provided art — the fallback is
 * the law, not an error state.
 */
import { useQuery } from "@tanstack/react-query";
import { api, type TerrainArtMap } from "./api";
import tideImg from "./assets/terrain-iso/tide-v3.png";
import skyImg from "./assets/terrain-iso/sky-v3.png";
import stoneImg from "./assets/terrain-iso/stone-v3.png";
import rootImg from "./assets/terrain-iso/root-v3.png";
import neutralImg from "./assets/terrain-iso/neutral-v3.png";
import airLayerImg from "./assets/terrain-layer-air.png";
import rockLayerImg from "./assets/terrain-layer-rock.png";
import waterLayerImg from "./assets/terrain-layer-water.png";
import rootLayerImg from "./assets/terrain-layer-root.png";

/** The five elements that carry stage art. (Fire has no tiles of its own;
 *  cursed land keeps its bundled face — neither is uploadable here.) */
export const TERRAIN_ART_ELEMENTS = ["tide", "sky", "stone", "root", "neutral"] as const;
export type TerrainArtElement = (typeof TERRAIN_ART_ELEMENTS)[number];

/** Stage 1: Nigel's provided art, bundled with the game. */
export const BUNDLED_TERRAIN: Record<TerrainArtElement, string> = {
  tide: tideImg,
  sky: skyImg,
  stone: stoneImg,
  root: rootImg,
  neutral: neutralImg,
};

export const TERRAIN_ART_QUERY_KEY = ["terrainArt"] as const;

/** Fetch the creator's uploaded stage art once and share it — Territory
 *  (every tile, every render) and the workshop Terrain Stages section
 *  read the same cache; uploads and reverts invalidate it. */
export function useTerrainArt() {
  return useQuery({
    queryKey: TERRAIN_ART_QUERY_KEY,
    queryFn: async () => (await api.getTerrainArt()).art,
    staleTime: 5 * 60 * 1000,
  });
}

/** The image a tile of `element` at `stage` should wear: the creator's
 *  uploaded art for that exact (element, stage) when it exists, else his
 *  provided stage-1 art for the element. Stage 1 always resolves to the
 *  bundled art — it is not uploadable. */
export function terrainImgFor(element: string, stage: number, art?: TerrainArtMap | null): string {
  if (stage > 1) {
    const uploaded = art?.[element]?.[stage];
    if (uploaded) return uploaded;
  }
  return BUNDLED_TERRAIN[element as TerrainArtElement] ?? BUNDLED_TERRAIN.neutral;
}

/** The minimal tile shape the stage rule reads — the tray engine's
 *  word (trayStage) when the payload carries it, with the attunement
 *  bank fields accepted too so the rule survives older payloads. */
export type StageTile = {
  trayStage?: number | null;
  attunePoints?: number | null;
  attuneElement?: string | null;
  attune_points?: number | null;
  attune_element?: string | null;
};

/** The stage of a tray holding `points` attunement (Nigel, 2026-10-15):
 *  0–9 the broken land, 10–19 the swelling, 20–30 the flourishing.
 *  A sealed tray (30) is stage 3 by the same reading. */
export function trayStageOf(points: number): 1 | 2 | 3 {
  return points >= 20 ? 3 : points >= 10 ? 2 : 1;
}

/**
 * The stage a tile's TOP tray wears. The tray engine owns this now
 * (Nigel, 2026-10-15): getTerritory settles trayStage server-side
 * from the hex's sealed trays and its growing tray's fill, and the
 * map renders what it is told. Payloads older than the engine fall
 * back to the interim bank reading (land in flux → stage 2), so the
 * map never breaks mid-deploy.
 */
export function stageForTile(tile: StageTile): 1 | 2 | 3 {
  const s = tile.trayStage;
  if (s === 1 || s === 2 || s === 3) return s;
  const points = tile.attunePoints ?? tile.attune_points;
  const pressing = tile.attuneElement ?? tile.attune_element;
  if (points == null || pressing == null) return 1;
  return 2;
}

/* ── TERRAIN MIXING — THE LAYERED FACE (Nigel, 2026-10-25) ─────
 * His layered master (IMG_0773.psd), one texture per element,
 * lifted layer by layer from the file as drawn — each element's
 * own PSD layer, cropped to its own alpha bounds, never keyed
 * or redrawn: Root from the top-left quadrant's layer, Air from
 * the top-right, Water from the bottom-left, Rock from the
 * bottom-right. On the map, a purified hex's face is these four
 * textures STACKED: each layer's opacity is its element's
 * ledger line (points / 10) — 4 points stands ~40% solid, 10
 * full, 0 absent — so a fully attuned hex stands full and a
 * young hex looks ghostly, still filling in. All four stack
 * within the tile's own Z; height belongs to Air alone (the
 * server's lift). The new face carries NO glass rim — the
 * textures stand as he drew them. */

/** Nigel's layer order for the terrain stack, bottom → top —
 *  the ONE constant the render reads; nothing else in the
 *  client names an order. Ruled 2026-10-25 (16:46) as Air,
 *  Rock, Root, Tide; SUPERSEDED the same night by his tap
 *  (23:03 — "Water under Root — tonight's typed order
 *  stands"): Air, Rock, Water, Root on top. If his word
 *  changes again, this list is the whole change. Keys are the
 *  game's element names (sky = his Air, stone = his Rock,
 *  tide = his Water). */
export const TERRAIN_LAYER_ORDER = ["sky", "stone", "tide", "root"] as const;
export type TerrainLayerElement = (typeof TERRAIN_LAYER_ORDER)[number];

/** The four textures at native resolution, with each drawing's
 *  height per unit width (measured from the lifted files) and
 *  its seat: the downward shift, as a fraction of the drawing's
 *  own height, that seats the drawing's FACE on the hex's centre
 *  rather than its bounding-box centre. Root's island face
 *  rides high in its drawing (its drips hang below), so Root
 *  seats 0.15 lower; the others are centred as drawn. */
export const TERRAIN_LAYER_ART: Record<TerrainLayerElement, { src: string; hPerW: number; seatDy: number }> = {
  sky: { src: airLayerImg, hPerW: 1123 / 1681, seatDy: 0 },
  stone: { src: rockLayerImg, hPerW: 957 / 1701, seatDy: 0 },
  tide: { src: waterLayerImg, hPerW: 843 / 1268, seatDy: 0 },
  root: { src: rootLayerImg, hPerW: 1347 / 1732, seatDy: 0.15 },
};

/** A hex's per-element ledger, as getTerritory serves it. */
export type TileMix = Partial<Record<TerrainLayerElement, number>>;

/** The opacity a layer stands at: its points of the full
 *  measure (10). Beyond full, full — points past 10 buy the
 *  land's other goods (Air's lift), not a second showing. */
export function mixLayerOpacity(points: number | undefined): number {
  return Math.max(0, Math.min(1, (points ?? 0) / 10));
}

/** Whether the hex carries any mixture at all — an untouched
 *  ledger (a neutral hex, or an older payload) draws its tray
 *  face as it always did. */
export function mixStands(mix: TileMix | null | undefined): boolean {
  if (!mix) return false;
  return TERRAIN_LAYER_ORDER.some((el) => (mix[el] ?? 0) > 0);
}

/* ── THE BLENDED FACE (Nigel, 2026-11-09 — "Blend the stack
 *  into one face") ──────────────────────────────────────────
 * The four floating layers read as a purple stack of ghosts:
 * each texture drawn as its own translucent image, nothing
 * binding them into one piece of land. The cure is compositing,
 * not repainting: the four textures are laid onto ONE canvas,
 * in his order, each at the alpha of its ledger line, with
 * standard source-over — paint laid over paint, the way the
 * layers of his own file stack — and the map draws that single
 * finished face. A composite is rendered ONCE per distinct mix
 * and cached by its signature: the map redraws constantly, and
 * the same mixture must never be composited twice. The canvas
 * stands at the face's natural measure (1920 wide, the tray
 * template his textures seat on at width fw on the map), so a
 * composited face seats exactly where the four images stood. */

export const MIX_FACE_W = 1920;
export const MIX_FACE_H = Math.round(MIX_FACE_W * (1280 / 1920));

const layerImages: Partial<Record<TerrainLayerElement, HTMLImageElement>> = {};
let layerImagesReady = false;
const layerReadySubs = new Set<() => void>();

/** Load the four layer textures once. Until they stand ready the
 *  blended face is unavailable and the caller falls back to the
 *  four floating layers — the map never waits on art. */
function ensureLayerImages(): void {
  if (layerImagesReady || typeof document === "undefined") return;
  let pending = 0;
  const settle = () => {
    pending -= 1;
    if (pending > 0) return;
    layerImagesReady = true;
    for (const fn of [...layerReadySubs]) fn();
  };
  for (const el of TERRAIN_LAYER_ORDER) {
    if (layerImages[el]) continue;
    const img = new Image();
    layerImages[el] = img;
    pending += 1;
    img.onload = settle;
    img.onerror = settle;
    img.src = TERRAIN_LAYER_ART[el].src;
  }
  if (pending === 0) layerImagesReady = true;
}

/** Subscribe to the layer textures standing ready (the map
 *  repaints once when they land, then never needs this again). */
export function onMixLayersReady(fn: () => void): () => void {
  layerReadySubs.add(fn);
  return () => { layerReadySubs.delete(fn); };
}

/** The mix's signature: its four ledger lines at the precision
 *  the server serves (hundredths of a point). One signature, one
 *  composite — this string IS the cache's whole key. */
export function mixSignature(mix: TileMix): string {
  return TERRAIN_LAYER_ORDER.map((el) => Math.round((mix[el] ?? 0) * 100)).join("/");
}

const mixFaceCache = new Map<string, string>();
/** Test seam: how many composites stand rendered right now. */
export function mixFaceCacheSize(): number {
  return mixFaceCache.size;
}

/** The blended face for a mix, as a data URL — or null while the
 *  layer textures are still loading. Composited once per
 *  signature and served from the cache forever after. The four
 *  textures draw at the seats and sizes they held as separate
 *  images (TERRAIN_LAYER_ART geometry, fw = W × 1730/1920),
 *  source-over onto a transparent canvas, each layer's alpha set
 *  to its ledger line's opacity. */
export function blendedMixFace(mix: TileMix): string | null {
  ensureLayerImages();
  if (!layerImagesReady) return null;
  const sig = mixSignature(mix);
  const hit = mixFaceCache.get(sig);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = MIX_FACE_W;
  canvas.height = MIX_FACE_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const fw = MIX_FACE_W * (1730 / 1920);
  for (const el of TERRAIN_LAYER_ORDER) {
    const img = layerImages[el];
    if (!img || !img.complete || img.naturalWidth === 0) continue;
    const art = TERRAIN_LAYER_ART[el];
    const w = fw;
    const h = w * art.hPerW;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = mixLayerOpacity(mix[el]);
    ctx.drawImage(img, MIX_FACE_W / 2 - w / 2, MIX_FACE_H / 2 - h / 2 + art.seatDy * h, w, h);
  }
  ctx.globalAlpha = 1;
  const url = canvas.toDataURL("image/png");
  mixFaceCache.set(sig, url);
  return url;
}

/* ── THE CLIFF EDGE (Nigel, 2026-11-09 — the same ruling,
 *  amended by Nigel the same day) ────────────────────────────
 * A tall stack used to draw the full tile image once per level,
 * stepped — a staircase of hard-edged slabs. Now a raised tray
 * BLENDS with the one below it: no separate edge for each tray,
 * no seam where one level meets the next — the whole height is
 * ONE continuous body falling from the top face to the ground.
 * And what stands underneath another tray is BLACK, translucent
 * — never purple: the first cut stretched the face's own art
 * down the drop, and his sky/tide violet rode with it, which is
 * exactly what he rejected. So the side is the island's
 * silhouette filled with translucent black, shading deeper
 * toward the bottom and easing at its tip so it settles into
 * the land beneath instead of cutting off. The TOP face keeps
 * his art untouched; the black is only for what stands
 * underneath. Rendered once per drop and cached like the faces
 * above. The silhouette is the painted island's own: its side
 * edges run from the widest line (source y 546 of 1280, the
 * face's centre row) down and inward at the slope its lower
 * halves draw (measured on his sheets: the silhouette narrows
 * ~0.82 source px per source px of depth, reaching its point
 * near y 1235) — a band cut to that shape abuts the face above
 * it without a gap or an overhang. */

export const CLIFF_SIL = {
  faceCentreY: 546 / 1280,
  bottomY: 1235 / 1280,
  slope: 0.82 * (1280 / 1920),
} as const;

const cliffCache = new Map<string, string>();

/** Clip the canvas to the cliff's silhouette for a drop of
 *  `dropFrac` (of the face image's own height): the top edge is
 *  the face's widest line; the sides run inward at the painted
 *  slope until the drop runs out or the island's point does. */
function cliffPath(ctx: CanvasRenderingContext2D, w: number, h: number, dropFrac: number): void {
  ctx.beginPath();
  traceCliff(ctx, 0, 0, w, h, dropFrac);
}

/** One island silhouette as a subpath at offset (ox, oy) — the
 *  building block the group body below unions together. */
function traceCliff(ctx: CanvasRenderingContext2D, ox: number, oy: number, w: number, h: number, dropFrac: number): void {
  const yTop = oy + CLIFF_SIL.faceCentreY * h;
  const yBottom = Math.min(yTop + dropFrac * h, oy + CLIFF_SIL.bottomY * h);
  const inset = CLIFF_SIL.slope * (yBottom - yTop);
  const half = w / 2;
  ctx.moveTo(ox, yTop);
  ctx.lineTo(ox + w, yTop);
  ctx.lineTo(ox + half + (half - inset), yBottom);
  ctx.lineTo(ox + half - (half - inset), yBottom);
  ctx.closePath();
}

/** The cliff side standing underneath a raised tile: the
 *  island's silhouette over `dropFrac` of the face's height,
 *  filled with ONE unbroken wash of translucent black — lighter
 *  just under the face, deepening down the fall, easing again
 *  at the tip where it blends into the land below. No image is
 *  stretched into it, so no colour of any element — above all
 *  no violet — ever shows underneath another tray. The `src`
 *  argument is accepted for the caller's convenience and is
 *  deliberately unused: the underneath is black for every tile
 *  alike. Rendered on the face template's measure (1920×1280),
 *  once per drop, cached. */
export function cliffSide(src: string, dropFrac: number): string | null {
  void src;
  if (typeof document === "undefined") return null;
  const key = `${Math.round(dropFrac * 1000)}`;
  const hit = cliffCache.get(key);
  if (hit) return hit;
  const w = MIX_FACE_W;
  const h = MIX_FACE_H;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const yTop = CLIFF_SIL.faceCentreY * h;
  const yBottom = Math.min(yTop + dropFrac * h, CLIFF_SIL.bottomY * h);
  ctx.save();
  cliffPath(ctx, w, h, dropFrac);
  ctx.clip();
  const grad = ctx.createLinearGradient(0, yTop, 0, yBottom);
  grad.addColorStop(0, "rgba(0,0,0,0.34)");
  grad.addColorStop(0.55, "rgba(0,0,0,0.52)");
  grad.addColorStop(0.85, "rgba(0,0,0,0.60)");
  grad.addColorStop(1, "rgba(0,0,0,0.30)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, yTop, w, yBottom - yTop);
  ctx.restore();
  const url = canvas.toDataURL("image/png");
  cliffCache.set(key, url);
  return url;
}

/* ── THE FLOATING GROUP'S BODY (Nigel, 2026-11-09 — the
 *  floating-tiles reshape of the blend build) ────────────────
 * A tile that reaches Z 2 no longer stacks: it FLOATS. Tiles
 * floating side by side float together as one landmass, and
 * the black translucent body of the cliff above hangs only
 * around the group's OUTER edges — between joined tiles there
 * is no body and no seam. The body is therefore drawn once
 * per group: the union of the member islands' silhouettes
 * (the same traceCliff shape, the same black wash), filled in
 * a single pass so the wash runs unbroken around the whole
 * outside and never crosses the joins. A lone floater is a
 * group of one and wears the same body. Faces are named by
 * their image boxes' top-left corners, in units of one face
 * image's width/height, relative to the group's bounding box;
 * the caller draws the returned image stretched over exactly
 * that bounding box. Rendered once per group shape, cached. */

const groupBodyCache = new Map<string, string>();

export function floatGroupBody(faces: { x: number; y: number }[]): { url: string; wUnits: number; hUnits: number } | null {
  if (typeof document === "undefined" || !faces.length) return null;
  const minX = Math.min(...faces.map((f) => f.x));
  const minY = Math.min(...faces.map((f) => f.y));
  const rel = faces.map((f) => ({ x: f.x - minX, y: f.y - minY }));
  const wUnits = Math.max(...rel.map((f) => f.x)) + 1;
  const hUnits = Math.max(...rel.map((f) => f.y)) + 1;
  const key = rel.map((f) => `${Math.round(f.x * 1000)},${Math.round(f.y * 1000)}`).join("|");
  const hit = groupBodyCache.get(key);
  if (hit) return { url: hit, wUnits, hUnits };
  const W = MIX_FACE_W, H = MIX_FACE_H;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(wUnits * W);
  canvas.height = Math.round(hUnits * H);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.beginPath();
  for (const f of rel) traceCliff(ctx, f.x * W, f.y * H, W, H, 1);
  ctx.save();
  ctx.clip();
  const yTop = Math.min(...rel.map((f) => f.y * H + CLIFF_SIL.faceCentreY * H));
  const yBottom = Math.max(...rel.map((f) => f.y * H + CLIFF_SIL.bottomY * H));
  const grad = ctx.createLinearGradient(0, yTop, 0, yBottom);
  grad.addColorStop(0, "rgba(0,0,0,0.34)");
  grad.addColorStop(0.55, "rgba(0,0,0,0.52)");
  grad.addColorStop(0.85, "rgba(0,0,0,0.60)");
  grad.addColorStop(1, "rgba(0,0,0,0.30)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  const url = canvas.toDataURL("image/png");
  groupBodyCache.set(key, url);
  return { url, wUnits, hUnits };
}

/** Test seam: how many group bodies stand rendered right now. */
export function floatGroupBodyCacheSize(): number {
  return groupBodyCache.size;
}
