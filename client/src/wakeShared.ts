/**
 * THE WAKE, SHARED (the Discord intro door build, 2026-10-26):
 * the layer-picking and composition the front page's ritual has
 * always run, lifted whole out of App.tsx so the Table's intro
 * door wakes Awokin by the SAME hands — the same endpoints'
 * payloads, the same weighted pick (the firstborn weighting for
 * the greeting), the same 750×971 canvas drawn back-to-front in
 * the artist's order. Nothing here is a second ritual: App.tsx
 * imports these very functions, and the intro door imports them
 * too, so a form woken at either door is woken identically.
 */
import type { Asset, Category, LayerRef, Rarity } from "./api";

export type WakeLayerAsset = {
  sourceId: string;
  serverId?: number;
  name: string;
  category: Category;
  rarity: Rarity;
  power: number | null;
  toughness: number | null;
  element?: string | null;
  imageUrl: string;
  mimeType: string;
  isStarter: boolean;
};

export const categories: { id: Category; label: string; note: string }[] = [
  { id: "background", label: "Background", note: "the world beneath" },
  { id: "body", label: "Body", note: "the held matter" },
  { id: "arms", label: "Arms", note: "reach and gesture" },
  { id: "aspect", label: "Aspect", note: "elemental manifestation" },
  { id: "head", label: "Head", note: "the final waking layer" },
];

const statCategories: Category[] = ["arms", "body", "head"];
const rarityWeight: Record<Rarity, number> = { common: 8, uncommon: 4, rare: 2, mythic: 1 };
const firstbornWeight: Record<Rarity, number> = { common: 2, uncommon: 4, rare: 6, mythic: 4 };
const rarityScore: Record<Rarity, number> = { common: 1, uncommon: 2, rare: 3, mythic: 4 };

export const TEMPLATE_WIDTH = 750;
export const TEMPLATE_HEIGHT = 971;

export function toLayerAssets(serverAssets: Asset[]): WakeLayerAsset[] {
  return serverAssets.map((asset) => ({ sourceId: `db:${asset.id}`, serverId: asset.id, name: asset.name, category: asset.category, rarity: asset.rarity, power: asset.power, toughness: asset.toughness, element: asset.element ?? null, imageUrl: asset.image_url, mimeType: asset.mime_type, isStarter: false }));
}

export function chooseWeighted(options: WakeLayerAsset[], lucky = false) {
  const weights = lucky ? firstbornWeight : rarityWeight;
  const total = options.reduce((sum, item) => sum + weights[item.rarity], 0); let cursor = Math.random() * total;
  for (const item of options) { cursor -= weights[item.rarity]; if (cursor <= 0) return item; }
  return options[options.length - 1];
}

/** Gather one piece per layer, weighted by rarity (or fixed choices in the workshop). */
/* Fire aspects are map-exclusive: only from wildfire sparks, never
   from wakes. Whether a piece IS fire is judged by its filed element
   (the Elements tab) alone — never by its name. A name-guessing
   helper that once lived here was removed under that law
   (Nigel, 2026-10-16); wakes exclude every aspect regardless. */
export function pickLayerSet(assets: WakeLayerAsset[], choices?: Record<Category, string>, lucky = false): WakeLayerAsset[] {
  return categories.flatMap((category) => {
    // Awoken are not born with aspects — those are earned later through binding
    if (category.id === "aspect") return [];
    let options = assets.filter((asset) => asset.category === category.id);
    if (!options.length) return [];
    const fixed = choices?.[category.id] ? options.find((asset) => asset.sourceId === choices[category.id]) : undefined;
    const picked = fixed ?? chooseWeighted(options, lucky);
    return picked ? [picked] : [];
  });
}

export function canWake(assets: WakeLayerAsset[]) {
  return statCategories.every((category) => assets.some((asset) => asset.category === category));
}

export function toLayerRefs(layers: WakeLayerAsset[]): LayerRef[] {
  return layers.map((layer) => ({ source_id: layer.sourceId, name: layer.name, category: layer.category, rarity: layer.rarity, power: layer.power, toughness: layer.toughness }));
}

export function loadImage(src: string) { return new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.crossOrigin = "anonymous"; image.onload = () => resolve(image); image.onerror = () => reject(new Error("One of the selected drawings could not be read.")); image.src = src; }); }

/** Back-to-front draw order, per the artist: background, body, arms, head.
 *  "aura" keeps its slot for legacy compositions only (fix list #9) —
 *  old Awoken bearing an aura layer still draw it between arms and
 *  head; no new aura piece can be filed or chosen. */
const LAYER_ORDER: readonly string[] = ["background", "aspect", "body", "arms", "aura", "head"];

export async function compose(layers: WakeLayerAsset[], target?: HTMLCanvasElement | null) {
  const canvas = target ?? document.createElement("canvas"); canvas.width = TEMPLATE_WIDTH; canvas.height = TEMPLATE_HEIGHT;
  const context = canvas.getContext("2d"); if (!context) throw new Error("This device could not prepare the awakening canvas.");
  const ranked = layers.filter((layer) => layer.power !== null && layer.toughness !== null);
  const score = ranked.reduce((sum, layer) => sum + rarityScore[layer.rarity], 0); const min = ranked.length; const max = ranked.length * 4;
  const auraOpacity = 1 / 3 + (max === min ? 0 : (score - min) / (max - min)) * (2 / 3);
  // Draw back-to-front in the artist's order, never in whatever order the
  // caller happened to pass. Preload every image before drawing so layers
  // never pop in piecemeal and get buried by a late arrival.
  const ordered = [...layers].sort((a, b) => LAYER_ORDER.indexOf(a.category) - LAYER_ORDER.indexOf(b.category));
  const images = await Promise.all(ordered.map((layer) => loadImage(layer.imageUrl)));
  context.fillStyle = "#f3f1ea"; context.fillRect(0, 0, 750, 971);
  ordered.forEach((layer, index) => {
    const image = images[index]; context.globalCompositeOperation = layer.category === "background" || layer.mimeType === "image/png" ? "source-over" : "multiply";
    // Legacy aura layers (fix list #9) still fade in by rarity, exactly
    // as before — the category is read as a runtime string here so old
    // compositions keep rendering even though "aura" is no longer a
    // choosable Category.
    const layerCategory: string = layer.category;
    context.globalAlpha = layerCategory === "aura" ? auraOpacity : 1; context.drawImage(image, 0, 0, 750, 971);
  });
  context.globalCompositeOperation = "source-over"; context.globalAlpha = 1;
  return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
}
