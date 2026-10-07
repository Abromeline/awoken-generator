// Standalone API client: fetch() against the Express REST endpoints.
// Method names and request/response shapes match the original action module
// one-to-one, so the UI code is untouched apart from imports.

export type Category = "background" | "arms" | "body" | "aura" | "head";
export type Rarity = "common" | "uncommon" | "rare" | "mythic";
export type Collection = "tender" | "workshop";

export interface LayerRef {
  source_id: string;
  name: string;
  category: Category;
  rarity: Rarity;
  power: number | null;
  toughness: number | null;
}

export interface Asset {
  id: number;
  name: string;
  category: Category;
  rarity: Rarity;
  power: number | null;
  toughness: number | null;
  image_url: string;
  mime_type: string;
  created_at: string;
}

export interface Awakened {
  id: number;
  name: string;
  image_url: string;
  layers: LayerRef[];
  base_power: number;
  base_toughness: number;
  power: number;
  toughness: number;
  empowerment: number;
  iteration: number;
  collection: Collection;
  owner_name: string;
  flavor_text: string;
  created_at: string;
}

export interface CreditInfo {
  balance: number;
  packPriceCents: number;
  packPriceLabel: string;
  creditsPerPack: number;
  pricePerWakeCents: number;
  checkoutEnabled: boolean;
}

export interface Studio {
  assets: Asset[];
  awakened: Awakened[];
  credits: CreditInfo;
}

export interface StripeConfig {
  configured: boolean;
  testMode: boolean;
  publishableKey: string | null;
  packPriceCents: number;
  creditsPerPack: number;
  packPriceLabel: string;
}

async function post<T>(name: string, args: unknown): Promise<T> {
  const response = await fetch(`/api/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args ?? {}),
  });
  const data = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status}).`);
  return data as T;
}

export const api = {
  getStudio: () => post<Studio>("getStudio", {}),
  uploadLayerAsset: (args: { category: Category; imageBase64: string; mimeType: "image/png" }) =>
    post<{ id: number; name: string }>("uploadLayerAsset", args),
  updateLayerAssetStats: (args: { id: number; power: number; toughness: number }) =>
    post<{ ok: true; rarity: Rarity }>("updateLayerAssetStats", args),
  renameLayerAsset: (args: { id: number; name: string }) => post<{ ok: true }>("renameLayerAsset", args),
  deleteLayerAsset: (args: { id: number }) => post<{ ok: true }>("deleteLayerAsset", args),
  saveAwoken: (args: { layers: LayerRef[]; imageBase64: string; collection: Collection; ownerName: string }) =>
    post<{ id: number; name: string; iteration: number; empowerment: number; flavor_text: string }>("saveAwoken", args),
  renameAwoken: (args: { id: number; name: string }) => post<{ ok: true }>("renameAwoken", args),
  deleteAwoken: (args: { id: number }) => post<{ ok: true }>("deleteAwoken", args),
  stripeConfig: () => postPath<StripeConfig>("/api/stripe/config"),
  createCheckoutSession: () => postPath<{ url: string }>("/api/stripe/checkout", {}),
  createPortalSession: () => postPath<{ url: string }>("/api/stripe/portal", {}),
};

async function postPath<T>(path: string, args?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: args === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: args === undefined ? undefined : JSON.stringify(args),
  });
  const data = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status}).`);
  return data as T;
}
