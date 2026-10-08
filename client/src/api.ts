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
  story_count: number;
  field_born: number;
  iteration: number;
  collection: Collection;
  owner_name: string;
  flavor_text: string;
  created_at: string;
}

export interface TerritoryTile {
  id: number;
  q: number;
  r: number;
  element: "tide" | "sky" | "stone" | "root" | "neutral" | "fire";
  cursed: number;
  spark: number;
  building: string | null;
}

export interface FieldPlacement {
  id: number;
  awakenedId: number;
  tileId: number;
  placedAt: string;
  lastMovedAt: string;
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
  tender: TenderInfo | null;
  credits: CreditInfo;
}

export interface TenderInfo {
  code: string;
  tenderName: string | null;
}

export interface TenderLeaderboardEntry {
  code: string;
  tenderName: string | null;
  displayName: string;
  createdAt: string;
  awokenCount: number;
}

export interface StripeConfig {
  configured: boolean;
  testMode: boolean;
  publishableKey: string | null;
  packPriceCents: number;
  creditsPerPack: number;
  packPriceLabel: string;
}

export interface GroveStatus {
  centsAccrued: number;
  dollarsAccrued: string;
  treesPlanted: number;
  perPackCents: number;
  perPackLabel: string;
}

export interface WaitingAwoken {
  awakened: Awakened | null;
  respinsUsed: number;
  respinsRemaining: number;
}

export interface WelcomeStatus {
  welcomeGranted: boolean;
  needsSeed: boolean;
  welcome: WaitingAwoken | null;
  freeWake: WaitingAwoken | null;
  freeWakeAvailable: boolean;
  nextFreeWakeAt: string | null;
}

// Soft visitor identity: a UUID kept in this browser, sent on every call so
// the server can greet first-timers and pace free wakes. Clearing storage
// starts over — real Tender accounts will replace this one day.
const VISITOR_KEY = "awoken-visitor-id";

export function visitorId(): string {
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
    const id = crypto.randomUUID();
    window.localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    return `anon-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

// Tender account token: minted by /api/claimTender or /api/loginTender, kept
// in this browser's localStorage. Sent on every call; the server resolves
// it to the Tender, or ignores it when absent/invalid.
const TENDER_TOKEN_KEY = "awoken-tender-token";

export function tenderToken(): string | null {
  try {
    const token = window.localStorage.getItem(TENDER_TOKEN_KEY);
    return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
  } catch {
    return null;
  }
}

export function storeTenderToken(token: string): void {
  try {
    window.localStorage.setItem(TENDER_TOKEN_KEY, token);
  } catch {
    /* the browser keeps no secrets */
  }
}

export function clearTenderToken(): void {
  try {
    window.localStorage.removeItem(TENDER_TOKEN_KEY);
  } catch {
    /* the browser keeps no secrets */
  }
}

// Workshop lock token: minted by /api/workshop/unlock, kept for the tab
// only (sessionStorage). Sent on every call; the server ignores it unless
// the workshop is locked.
const WORKSHOP_TOKEN_KEY = "awoken-workshop-token";

export function workshopToken(): string | null {
  try {
    return window.sessionStorage.getItem(WORKSHOP_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearWorkshopToken(): void {
  try {
    window.sessionStorage.removeItem(WORKSHOP_TOKEN_KEY);
  } catch {
    /* the tab keeps no secrets */
  }
}

export function storeWorkshopToken(token: string): void {
  try {
    window.sessionStorage.setItem(WORKSHOP_TOKEN_KEY, token);
  } catch {
    /* the tab keeps no secrets */
  }
}

function throwApiError(response: Response, data: { error?: string }): never {
  throw Object.assign(new Error(data.error ?? `Request failed (${response.status}).`), { status: response.status });
}

async function post<T>(name: string, args: unknown): Promise<T> {
  const response = await fetch(`/api/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Visitor-Id": visitorId(), "X-Workshop-Token": workshopToken() ?? "", "X-Tender-Token": tenderToken() ?? "" },
    body: JSON.stringify(args ?? {}),
  });
  const data = (await response.json()) as { error?: string };
  if (!response.ok) throwApiError(response, data);
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
  moveLayerAsset: (args: { id: number; category: string }) => post<{ ok: true }>("moveLayerAsset", args),
  saveAwoken: (args: { layers: LayerRef[]; imageBase64: string; collection: Collection; ownerName: string }) =>
    post<{ id: number; name: string; iteration: number; empowerment: number; flavor_text: string }>("saveAwoken", args),
  renameAwoken: (args: { id: number; name: string }) => post<{ ok: true }>("renameAwoken", args),
  shareStory: (args: { id: number; story: string }) => post<{ ok: true; storyCount: number }>("shareStory", args),
  createDeck: (args: { name: string }) => post<{ id: number; name: string; faceCardId: number | null; cardCount: number }>("createDeck", args),
  listDecks: () => post<{ decks: { id: number; name: string; faceCardId: number | null; cardCount: number }[] }>("listDecks", {}),
  renameDeck: (args: { id: number; name: string }) => post<{ ok: true }>("renameDeck", args),
  deleteDeck: (args: { id: number }) => post<{ ok: true }>("deleteDeck", args),
  addCardToDeck: (args: { deckId: number; awakenedId: number }) => post<{ ok: true }>("addCardToDeck", args),
  removeCardFromDeck: (args: { deckId: number; awakenedId: number }) => post<{ ok: true }>("removeCardFromDeck", args),
  setDeckFace: (args: { deckId: number; awakenedId: number }) => post<{ ok: true }>("setDeckFace", args),
  getDeckCards: (args: { deckId: number }) => post<{ deck: { id: number; name: string; faceCardId: number | null }; cardIds: number[] }>("getDeckCards", args),
  getTerritory: () => post<{ tiles: TerritoryTile[]; placements: FieldPlacement[] }>("getTerritory", {}),
  deployAwoken: (args: { awakenedId: number; tileId: number }) => post<{ ok: true }>("deployAwoken", args),
  directAttack: (args: { awakenedIds: number[]; tileId: number }) => post<{ ok: true }>("directAttack", args),
  deployBattle: (args: { awakenedIds: number[]; tileId: number }) => post<{ ok: true; purified: boolean }>("deployBattle", args),
  passivePurify: (args: { tileId: number }) => post<{
    ok: boolean;
    reason?: "resting" | "too-weak" | "not-yet";
    hoursLeft?: number;
    need?: number;
    have?: number;
    purified?: boolean;
  }>("passivePurify", args),
  claimFirstTile: (args: { teamIds: number[] }) => post<{ ok: true }>("claimFirstTile", args),
  birthFieldAwoken: (args: { layers: LayerRef[]; imageBase64: string; tileId: number; liberatorNames: string[]; toHand?: boolean }) =>
    post<{ ok: true; id: number }>("birthFieldAwoken", args),
  getBirthStatus: () => post<{ ready: boolean; msUntil: number }>("getBirthStatus", {}),
  claimTimedBirth: (args: { layers: LayerRef[]; imageBase64: string }) =>
    post<{ ok: true; id: number }>("claimTimedBirth", args),
  deleteAwoken: (args: { id: number }) => post<{ ok: true }>("deleteAwoken", args),
  stripeConfig: () => postPath<StripeConfig>("/api/stripe/config"),
  createCheckoutSession: () => postPath<{ url: string }>("/api/stripe/checkout", {}),
  createPortalSession: () => postPath<{ url: string }>("/api/stripe/portal", {}),
  getWelcome: () => postPath<WelcomeStatus>("/api/welcome"),
  seedWelcome: (args: { layers: LayerRef[]; imageBase64: string }) =>
    postPath<{ awakened: Awakened | null; respinsUsed: number; respinsRemaining: number }>("/api/welcome/seed", args),
  claimWelcome: (args: { slot: "welcome" | "free" }) =>
    postPath<{ ok: true; awakenedId: number }>("/api/welcome/claim", args),
  reconstituteWelcome: (args: { slot: "welcome" | "free"; layers: LayerRef[]; imageBase64: string }) =>
    postPath<{ awakened: Awakened | null; respinsUsed: number; respinsRemaining: number }>("/api/welcome/reconstitute", args),
  claimFreeWake: (args: { layers: LayerRef[]; imageBase64: string }) =>
    postPath<{ awakened: Awakened | null; respinsUsed: number; respinsRemaining: number }>("/api/welcome/free-wake", args),
  getGrove: () => postPath<GroveStatus>("/api/grove"),
  workshopStatus: () => postPath<{ locked: boolean }>("/api/workshop/status"),
  unlockWorkshop: (args: { password: string }) =>
    postPath<{ token: string; expiresAt: string }>("/api/workshop/unlock", args),
  getWorkshopStudio: () => post<Studio>("getWorkshopStudio", {}),
  // Self-serve Tender accounts: secret code + password.
  suggestTenderCode: () => post<{ code: string }>("suggestTenderCode", {}),
  claimTender: (args: { password: string }) =>
    post<{ token: string; tender: TenderInfo }>("claimTender", args),
  loginTender: (args: { identity: string; password: string }) =>
    post<{ token: string; tender: TenderInfo }>("loginTender", args),
  logoutTender: (token: string) => post<{ ok: true }>("logoutTender", { token }),
  suggestTenderName: () => post<{ name: string }>("suggestTenderName", {}),
  setTenderName: (args: { name: string }) => post<{ tenderName: string }>("setTenderName", args),
  listTenders: () => post<{ tenders: TenderLeaderboardEntry[] }>("listTenders", {}),
};

async function postPath<T>(path: string, args?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: args === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "X-Visitor-Id": visitorId(), "X-Workshop-Token": workshopToken() ?? "", "X-Tender-Token": tenderToken() ?? "" },
    body: args === undefined ? undefined : JSON.stringify(args),
  });
  const data = (await response.json()) as { error?: string };
  if (!response.ok) throwApiError(response, data);
  return data as T;
}
