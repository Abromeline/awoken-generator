// Standalone API client: fetch() against the Express REST endpoints.
// Method names and request/response shapes match the original action module
// one-to-one, so the UI code is untouched apart from imports.

// The choosable/fileable layer categories. Aura is gone (fix list #9,
// Nigel 2026-10-13: 'just remove the aura pool, it became assets') —
// legacy aura layers in old compositions still render (the renderers
// read category as a runtime string), they just can't be filed or
// chosen anymore.
export type Category = "background" | "arms" | "body" | "aspect" | "head";
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
  element?: string | null;
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
  experience?: number;
  level?: number;
  stat_points?: number;
  bonus_power?: number;
  spent_power?: number;
  spent_toughness?: number;
  bonus_toughness?: number;
  xp_current?: number;
  xp_next?: number;
  xp_progress?: number;
  xp_into_level?: number;
  xp_for_next_level?: number;
}

/** A story a Tender has told one of their Awoken. Personal by default;
 *  sentAt is set only when the Tender chose to send it to Discord. */
export interface AwokenStory {
  id: number;
  storyText: string;
  createdAt: string;
  sentAt: string | null;
}

/** One edge work on a hex border (War-Ground, Nigel 2026-10-15):
 *  kind wall / thorns / ward / rune, stored server-side under its
 *  canonical edge (q, r, dir) — a shared border is ONE work. Barrier
 *  works (wall, ward) carry hp/maxHp; runes carry their runeKind. */
export interface EdgeWork {
  edgeKey: string; q: number; r: number; dir: number;
  hp: number; maxHp: number;
  kind: "wall" | "thorns" | "ward" | "rune";
  level: number; runeKind?: "snare" | "harm" | "meld" | null;
  /** A wall's SKIN, chosen per edge at the building (Nigel, 2026-10-16). */
  style?: "stone" | "spire" | null;
}

/** A Written Light working standing on the land (the Grimoire):
 *  a ward on an edge (edgeKey/q/r/dir) or a rune on a floor
 *  (tileId). Its numbers were snapshotted from the book at the
 *  cast. */
export interface MapWorking {
  id: number; spellKey: string; engine: string;
  kind: "ward" | "rune" | "binding" | "spell"; hue: string;
  tileId: number | null; edgeKey: string | null;
  q: number | null; r: number | null; dir: number | null;
  nums: Record<string, number>;
  hp: number; stops: number; charges: number;
  pour: number; maxHp: number;
}

export interface TerritoryTile {
  id: number;
  q: number;
  r: number;
  element: "tide" | "sky" | "stone" | "root" | "neutral" | "fire";
  cursed: number;
  spark: number;
  building: string | null;
  lastPassiveAt?: string | null;
  height?: number;
  curseHp?: number | null;
  curseMaxHp?: number | null;
  /** The terrain attunement bank, as getTerritory serves it: which
   *  element is pressing this tile, and how full its 10-point bank is.
   *  Both absent/null until a company or a turned shrine first pours. */
  attunePoints?: number | null;
  attuneElement?: string | null;
  /** Terraforming trays (Nigel, 2026-10-15): the hex's stack as the
   *  server settles it — sealed trays, the growing tray's points,
   *  the TOP tray's stage (what the tile renders) and HP, and the
   *  whole stack's power. height (above) is the total tray count. */
  traysSealed?: number;
  growPoints?: number;
  trayStage?: number;
  topHp?: number;
  stackPower?: number;
}

export interface FieldPlacement {
  id: number;
  awakenedId: number;
  tileId: number;
  placedAt: string;
  lastMovedAt: string;
  stance: "attack" | "defense" | "binding";
  /** Marching layer: patrol road (tile ids, raw JSON from the server) + march start (ms). */
  patrolPath?: string | null;
  patrolSince?: number | null;
  /** The march: road (tile ids, origin first) + begin/arrival hours (ms). */
  marchPath?: string | null;
  marchSince?: number | null;
  marchEnds?: number | null;
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
  creatorGifts: number;
}

export interface TenderInfo {
  code: string;
  tenderName: string | null;
  email?: string | null;
}

export interface TenderLeaderboardEntry {
  code: string;
  tenderName: string | null;
  displayName: string;
  createdAt: string;
  awokenCount: number;
  ownerKey: string;
  energy: number;
  wakeBalance: number;
}

export interface WakeCodeEntry {
  code: string;
  createdAt: string;
  status: "unused" | "redeemed" | "revoked";
  redeemedByName: string | null;
  redeemedAt: string | null;
}

export interface StripeConfig {
  configured: boolean;
  testMode: boolean;
  publishableKey: string | null;
  packPriceCents: number;
  creditsPerPack: number;
  packPriceLabel: string;
}

/** The five elements of the canonical palette (see client/src/palette.ts). */
export type ElementName = "root" | "tide" | "sky" | "stone" | "fire";

/** The UI theme: the canonical element palette, stored server-side and
 *  tweakable from the UI Workspace's Elements section. */
export interface UITheme {
  elementColors: Record<ElementName, string>;
}

/** Terrain stage art the creator has uploaded: element → stage → image
 *  URL. Only filled slots appear; every other (element, stage) renders
 *  the bundled provided art (see client/src/terrainArt.ts). */
export type TerrainArtMap = Partial<Record<string, Partial<Record<number, string>>>>;

/** Enemy art resolution from the UI Workspace (see client/src/enemyArt.ts):
 *  per enemy name, the uploaded sprite currently LIVE ({ url, spriteId }),
 *  or null when the bundled art is live. `selection` is the creator's pin
 *  map: sprite id = that upload pinned, 0 = bundled pinned, absent = the
 *  latest upload is live by default. */
export type EnemyArtMap = Partial<Record<string, { url: string; spriteId: number } | null>>;
export type EnemySelection = Record<string, number>;
export type CardBorderFitName = "hug" | "morning";
export interface CardBorderState {
  imageUrl: string | null;
  fit: CardBorderFitName | null;
  selection: { kind: "none" | "birth" | "upload"; id?: string };
  birthFit: CardBorderFitName;
  uploads: { id: string; name: string; imageUrl: string; fit: CardBorderFitName }[];
}

export type GrimoireGlyphSort = "ward" | "rune" | "binding" | "spell" | "unsorted";
export type GrimoireSpellKind = "ward" | "rune" | "binding" | "spell";
export interface GrimoireGlyph {
  id: string;
  name: string;
  assetKey: string | null;
  imageUrl: string | null;
  sort: GrimoireGlyphSort;
  spellKey: string | null;
  builtin: boolean;
}
export interface GrimoireSpell {
  key: string;
  name: string;
  kind: GrimoireSpellKind;
  engine: string;
  glyphId: string | null;
  cost: number;
  blurb: string;
  numbers: Record<string, number>;
  forms: Record<string, string>;
  builtin: boolean;
}
export interface GrimoireSpellInput {
  key?: string;
  name: string;
  kind: GrimoireSpellKind;
  engine: string;
  glyphId?: string | null;
  cost: number;
  blurb: string;
  numbers: Record<string, number>;
  forms: Record<string, string>;
}
export interface GrimoireState {
  glyphs: GrimoireGlyph[];
  spells: GrimoireSpell[];
}
/** The number fields each engine carries — the client mirror of
 *  server/src/grimoire.ts ENGINE_NUMBER_FIELDS (labels + defaults
 *  for the workshop editor and for new spells). */
export const GRIMOIRE_ENGINE_FIELDS: Record<string, { key: string; label: string; def: number }[]> = {
  seal: [
    { key: "riposte", label: "Riposte power (harm answered to the striker)", def: 3 },
    { key: "brightBonus", label: "Extra riposte while an Engine burns", def: 1 },
    { key: "stops", label: "Strikes stopped before the Seal goes out", def: 3 },
    { key: "hp", label: "Health rating (base) — each stopped blow costs the blow's power", def: 6 },
    { key: "hpPerLevel", label: "Extra health per Tender level of the caster", def: 1 },
    { key: "hpPerPoint", label: "Extra health per elemental point poured in at the cast", def: 2 },
  ],
  engine: [{ key: "energyPerRound", label: "Energy to its tender each round", def: 1 }],
  standard: [{ key: "strikeBonus", label: "Strike bonus on either hex it divides", def: 1 }],
  trees: [
    { key: "hp", label: "Health rating (base) the Trees take before breaking", def: 8 },
    { key: "brightHpBonus", label: "Extra health while an Engine burns", def: 2 },
    { key: "regrow", label: "Health regrown each round", def: 2 },
    { key: "hpPerLevel", label: "Extra health per Tender level of the caster", def: 1 },
    { key: "hpPerPoint", label: "Extra health per elemental point poured in at the cast", def: 2 },
  ],
  beacon: [{ key: "darkBonus", label: "Bonus striking the dark on or beside its hexes", def: 1 }],
  lattice: [
    { key: "pinRounds", label: "Rounds the dark stands pinned", def: 2 },
    { key: "hp", label: "Health rating (base) — pinning a dark costs its power", def: 6 },
    { key: "hpPerLevel", label: "Extra health per Tender level of the caster", def: 1 },
    { key: "hpPerPoint", label: "Extra health per elemental point poured in at the cast", def: 2 },
  ],
  blade: [
    { key: "power", label: "Harm to everything on its ground", def: 6 },
    { key: "brightBonus", label: "Extra harm while an Engine burns", def: 1 },
    { key: "charges", label: "Times it springs before it is spent", def: 2 },
  ],
  blades: [
    { key: "power", label: "Harm on each planted hex", def: 3 },
    { key: "brightBonus", label: "Extra harm while an Engine burns", def: 1 },
    { key: "maxTargets", label: "Hexes it may be planted on at once", def: 3 },
  ],
  shard: [
    { key: "minPower", label: "Least power that wakes the Shard", def: 5 },
    { key: "multiplier", label: "Harm = greatest power × this", def: 2 },
    { key: "harmPerPoint", label: "Extra harm per elemental point poured in at the cast (the gated working's pour is capped)", def: 1 },
  ],
  coil: [
    { key: "energyPerDark", label: "Energy per dark thrown back", def: 1 },
    { key: "energyCap", label: "Most energy one Coil returns", def: 3 },
  ],
  heal: [],
  none: [],
};
export const GRIMOIRE_HUES = ["unaligned", "tide", "sky", "stone", "root", "fire"] as const;

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
    return window.localStorage.getItem(WORKSHOP_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearWorkshopToken(): void {
  try {
    window.localStorage.removeItem(WORKSHOP_TOKEN_KEY);
  } catch {
    /* the device keeps no secrets */
  }
}

export function storeWorkshopToken(token: string): void {
  try {
    window.localStorage.setItem(WORKSHOP_TOKEN_KEY, token);
  } catch {
    /* the device keeps no secrets */
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

export interface IncursionColumn {
  id: number; kind: "raid" | "siege"; state: "marching" | "arrived";
  size: number; power: number; targetKind: string; targetTileId: number | null;
  targetQ: number | null; targetR: number | null;
  originQ: number; originR: number;
  spawnedAt: number; arrivesAt: number;
  roster: { kind: string; count: number; power: number; hp: number }[];
}
export interface StarSeed {
  id: number; tileId: number; q: number | null; r: number | null;
  level: number; state: "fallen" | "held" | "corrupted"; defenses: number; tileCursed: boolean;
}
export interface SeedsView {
  seeds: StarSeed[];
  missions: { id: number; seedId: number; phase: string; arriveAt: number; returnAt: number }[];
}
export interface IncursionsView {
  eye: number; eyeFull: boolean; breakUntil: number; totalSpent: number;
  columns: IncursionColumn[];
}
export const api = {
  getStudio: () => post<Studio>("getStudio", {}),
  getTableBindCode: () => post<{ ok: true; code: string; expiresAt: string }>("getTableBindCode", {}),
  uploadLayerAsset: (args: { category: Category; imageBase64: string; mimeType: "image/png" }) =>
    post<{ id: number; name: string }>("uploadLayerAsset", args),
  getTerrainArt: () => post<{ art: TerrainArtMap }>("getTerrainArt", {}),
  getEnemyArt: () => post<{ art: EnemyArtMap; selection: EnemySelection }>("getEnemyArt", {}),
  setEnemySpriteSelection: (args: { name: string; spriteId: number | null }) =>
    post<{ ok: true; selection: EnemySelection }>("setEnemySpriteSelection", args),
  getCardBorder: () => post<CardBorderState>("getCardBorder", {}),
  uploadCardBorder: (args: { name: string; imageBase64: string }) =>
    post<CardBorderState>("uploadCardBorder", args),
  setCardBorderSelection: (args: { kind: "none" | "birth" | "upload"; id?: string }) =>
    post<CardBorderState>("setCardBorderSelection", args),
  setCardBorderFit: (args: { target: string; fit: CardBorderFitName }) =>
    post<CardBorderState>("setCardBorderFit", args),
  deleteCardBorder: (args: { id: string }) => post<CardBorderState>("deleteCardBorder", args),
  getGrimoire: () => post<GrimoireState>("getGrimoire", {}),
  uploadGrimoireGlyph: (args: { name: string; imageBase64: string }) =>
    post<GrimoireState>("uploadGrimoireGlyph", args),
  setGlyphSort: (args: { glyphId: string; sort: GrimoireGlyphSort }) =>
    post<GrimoireState>("setGlyphSort", args),
  setGlyphSpell: (args: { glyphId: string; spellKey: string | null }) =>
    post<GrimoireState>("setGlyphSpell", args),
  deleteGrimoireGlyph: (args: { glyphId: string }) => post<GrimoireState>("deleteGrimoireGlyph", args),
  upsertGrimoireSpell: (args: { spell: GrimoireSpellInput }) =>
    post<GrimoireState>("upsertGrimoireSpell", args),
  deleteGrimoireSpell: (args: { key: string }) => post<GrimoireState>("deleteGrimoireSpell", args),
  uploadTerrainArt: (args: { element: string; stage: 2 | 3; imageBase64: string; mimeType: "image/png" }) =>
    post<{ ok: true; element: string; stage: number; image_url: string }>("uploadTerrainArt", args),
  deleteTerrainArt: (args: { element: string; stage: 2 | 3 }) => post<{ ok: true }>("deleteTerrainArt", args),
  updateLayerAssetStats: (args: { id: number; power: number; toughness: number }) =>
    post<{ ok: true; rarity: Rarity }>("updateLayerAssetStats", args),
  renameLayerAsset: (args: { id: number; name: string }) => post<{ ok: true }>("renameLayerAsset", args),
  deleteLayerAsset: (args: { id: number }) => post<{ ok: true }>("deleteLayerAsset", args),
  moveLayerAsset: (args: { id: number; category: string }) => post<{ ok: true }>("moveLayerAsset", args),
  saveAwoken: (args: { layers: LayerRef[]; imageBase64: string; collection: Collection; ownerName: string }) =>
    post<{ id: number; name: string; iteration: number; empowerment: number; flavor_text: string }>("saveAwoken", args),
  renameAwoken: (args: { id: number; name: string }) => post<{ ok: true }>("renameAwoken", args),
  shareStory: (args: { id: number; story: string }) => post<{ ok: true; storyCount: number }>("shareStory", args),
  getAwokenStories: (args: { id: number }) => post<{ stories: AwokenStory[]; nextPrompt: string | null; nextThread: string | null; nextChapter: number | null }>("getAwokenStories", args),
  sendStoryToDiscord: (args: { storyId: number; cardPngBase64: string }) => post<{ ok: true; sentAt: string }>("sendStoryToDiscord", args),
  getVoiceState: () => post<{ webhookConfigured: boolean; weatherEnabled: boolean; weatherAudioMoods: string[]; lastAnnouncedEndsAt: string | null; currentMood: string; currentReignEndsAt: string }>("getVoiceState", {}),
  setVoiceWeatherEnabled: (args: { enabled: boolean }) => post<{ ok: true; weatherEnabled: boolean }>("setVoiceWeatherEnabled", args),
  postVoiceTestLine: () => post<{ ok: true }>("postVoiceTestLine", {}),
  postWorldNews: (args: { text: string }) => post<{ ok: true }>("postWorldNews", args),
  createDeck: (args: { name: string }) => post<{ id: number; name: string; faceCardId: number | null; cardCount: number }>("createDeck", args),
  listDecks: () => post<{ decks: { id: number; name: string; faceCardId: number | null; cardCount: number }[] }>("listDecks", {}),
  renameDeck: (args: { id: number; name: string }) => post<{ ok: true }>("renameDeck", args),
  deleteDeck: (args: { id: number }) => post<{ ok: true }>("deleteDeck", args),
  addCardToDeck: (args: { deckId: number; awakenedId: number }) => post<{ ok: true }>("addCardToDeck", args),
  removeCardFromDeck: (args: { deckId: number; awakenedId: number }) => post<{ ok: true }>("removeCardFromDeck", args),
  setDeckFace: (args: { deckId: number; awakenedId: number }) => post<{ ok: true }>("setDeckFace", args),
  getDeckCards: (args: { deckId: number }) => post<{ deck: { id: number; name: string; faceCardId: number | null }; cardIds: number[] }>("getDeckCards", args),
  getTerritory: () => post<{ tiles: TerritoryTile[]; placements: FieldPlacement[]; buildings: { id: number; type: string }[]; mood: { mood: string; description: string; endsAt: string }; walls: EdgeWork[]; skills: { awakenedId: number; skill: string }[]; workings: MapWorking[] }>("getTerritory", {}),
  castMapWorking: (args: { spellKey: string; hue?: string; tileId?: number; dir?: number; awakenedId?: number; pour?: number }) =>
    post<{ ok: true; id?: number; edgeKey?: string; tileId?: number; healed?: number; hp?: number; maxHp?: number; cost: number; pour?: number }>("castMapWorking", args),
  fadeMapWorking: (args: { id: number }) => post<{ ok: true }>("fadeMapWorking", args),
  pourMapWorking: (args: { id: number; hue: string; pour: number }) =>
    post<{ ok: true; id: number; hue: string; pour: number; hp: number; maxHp: number }>("pourMapWorking", args),
  deployAwoken: (args: { awakenedId: number; tileId: number }) => post<{ ok: true }>("deployAwoken", args),
  directAttack: (args: { awakenedIds: number[]; tileId: number }) => post<{ ok: true; xpGains?: { awakenedId: number; xpGain: number; leveledUp: boolean; newLevel: number }[] }>("directAttack", args),
  deployBattle: (args: { awakenedIds: number[]; tileId: number }) => post<{ ok: true; purified: boolean; xpGains?: { awakenedId: number; xpGain: number; leveledUp: boolean; newLevel: number }[] }>("deployBattle", args),
  setStance: (args: { awakenedId: number; stance: "attack" | "defense" | "binding"; maxEnergy: number }) =>
    post<{ ok: true }>("setStance", args),
  attackTile: (args: { awakenedId: number; tileId: number }) =>
    post<{ ok: true; purified: boolean; need?: number; have?: number; wavePull?: boolean; tileId?: number; sparked?: boolean; hp?: number; maxHp?: number; damage?: number; thorns?: number; thornsDamage?: number; attackerHp?: number; attackerMaxHp?: number; attackerDissipated?: boolean; awakenedId?: number; attackerXp?: { awakenedId: number; xpGain: number; leveledUp: boolean; newLevel: number } }>("attackTile", args),
  moveAwoken: (args: { awakenedId: number; tileId: number }) =>
    post<{ ok: true }>("moveAwoken", args),
  getWave: () => post<{
    waveNumber: number; wavesDefeated: number;
    frayCount: number; unravelers: number; totalPower: number;
    nextWaveAt: string | null;
    mood: string;
  }>("getWave", {}),
  getEnergy: () => post<{ energy: number; maxEnergy: number }>("getEnergy", {}),
  assignStatPoint: (args: { awakenedId: number; stat: "power" | "toughness" }) => post<{ ok: boolean }>("assignStatPoint", args),
  setChampion: (args: { awakenedId: number }) => post<{ ok: boolean }>("setChampion", args),
  getLegends: () => post<{ champion: Awakened | null; legends: { id: number; awakenedId: number; deed: string; count: number; awokenName: string }[] }>("getLegends", {}),
  sendFriendRequest: (args: { tenderName?: string; inviteCode?: string }) => post<{ ok: boolean; tenderName: string }>("sendFriendRequest", args),
  acceptFriendRequest: (args: { requestId: number }) => post<{ ok: boolean }>("acceptFriendRequest", args),
  declineFriendRequest: (args: { requestId: number }) => post<{ ok: boolean }>("declineFriendRequest", args),
  listFriends: () => post<{ friends: { ownerKey: string; tenderName: string; unread: number }[]; pending: { id: number; tenderName: string }[] }>("listFriends", {}),
  sendMessage: (args: { friendKey: string; text: string }) => post<{ ok: boolean }>("sendMessage", args),
  getMessages: (args: { friendKey: string }) => post<{ messages: { id: number; text: string; mine: boolean; createdAt: string }[] }>("getMessages", args),
  getReferralCode: () => post<{ code: string }>("getReferralCode", {}),
  getRandomBattleTrack: () => post<{ track: { id: number; name: string; trackData: string } | null }>("getRandomBattleTrack", {}),
  assignRandomAspects: () => post<{ ok: boolean; assigned: number; total: number }>("assignRandomAspects", {}),
  updateLayerAssetRarity: (value: { id: number; rarity: string }) => post<{ ok: boolean }>("updateLayerAssetRarity", value),
  updateLayerAssetElement: (value: { id: number; element: string | null }) => post<{ ok: boolean }>("updateLayerAssetElement", value),
  claimSpark: (value: { tileId: number }) => post<{ ok: boolean; fireLevel: number }>("claimSpark", value),
  getTenderRank: () => post<{ ok: boolean; myRank: number; myCount: number; totalTenders: number; nearby: { rank: number; name: string; count: number; isMe: boolean }[] }>("getTenderRank", {}),
  getTenderExp: () => post<{ totalExp: number; lifetimeWakes: number; level: number; expIntoLevel: number; expForNextLevel: number | null; healTier: number; healAmount: number; wardRuneUnlocked: boolean; maxTenderHp: number }>("getTenderExp", {}),
  setTenderPassword: (value: { password: string }) => post<{ ok: boolean }>("setTenderPassword", value),
  getSiteColors: () => post<{ ok: boolean; colors: Record<string, string> }>("getSiteColors", {}),
  setSiteColor: (value: { key: string; value: string }) => post<{ ok: boolean }>("setSiteColor", value),
  getUITheme: () => post<{ ok: boolean; theme: UITheme }>("getUITheme", {}),
  updateUITheme: (value: { elementColors: Partial<Record<ElementName, string>> }) =>
    post<{ ok: boolean; theme: UITheme }>("updateUITheme", value),
  adminResetTenderPassword: (value: { tenderName: string; newPassword: string }) => post<{ ok: boolean; tenderName: string | null }>("adminResetTenderPassword", value),
  submitFeedback: (value: { category: string; body: string }) => post<{ ok: boolean; id: number }>("submitFeedback", value),
  feedEnergy: (value: { awakenedId: number; energy: number }) => post<{ ok: boolean; xpGain: number; leveledUp: boolean; newLevel: number; statPointsGained: number }>("feedEnergy", value),
  getHall: () => post<{ hall: any }>("getHall", {}),
  fundHallEnergy: (value: { amount: number }) => post<{ ok: boolean; fund: any; nextCost: any }>("fundHallEnergy", value),
  fundHallElement: (value: { element: string; points: number }) => post<{ ok: boolean; fund: any; nextCost: any }>("fundHallElement", value),
  beginHallUpgrade: () => post<{ ok: boolean; upgradeReadyAt: string; targetLevel: number }>("beginHallUpgrade", {}),
  houseAwoken: (value: { roomIndex: number; awakenedId: number }) => post<{ ok: boolean }>("houseAwoken", value),
  unhouseAwoken: (value: { roomIndex: number }) => post<{ ok: boolean }>("unhouseAwoken", value),
  listMyFeedback: () => post<{ messages: any[] }>("listMyFeedback", {}),
  listFeedback: () => post<{ messages: any[] }>("listFeedback", {}),
  pinFeedback: (value: { id: number; pinned: boolean }) => post<{ ok: boolean }>("pinFeedback", value),
  replyFeedback: (value: { id: number; reply: string }) => post<{ ok: boolean }>("replyFeedback", value),
  deleteFeedback: (value: { id: number }) => post<{ ok: boolean }>("deleteFeedback", value),
  setTenderEmail: (value: { email: string | null }) => post<{ ok: boolean }>("setTenderEmail", value),
  igniteWildfire: (value: { awakenedId: number; tileId: number }) => post<{ ok: boolean; ignitedTileIds: number[] }>("igniteWildfire", value),
  getAspectAttunement: () => post<{ levels: Record<string, number>; threshold: number; inventoryCount: number; inventory: { id: number; name: string; element: string; imageUrl: string }[]; rates?: Record<string, number>; wornAspects?: { awakenedId: number; name: string; aspects: { key: string; name: string; element: string | null; level: number; imageUrl?: string | null }[] }[] }>("getAspectAttunement", {}),
  deepenAspect: (value: { awakenedId: number; targetAspectKey: string }) => post<{ ok: boolean; newLevel: number; element: string; targetName?: string; pointsLeft?: number }>("deepenAspect", value),
  listGlyphs: (value: { category: string }) => post<{ glyphs: { id: number; category: string; name: string; svgData: string }[] }>("listGlyphs", value),
  saveGlyph: (value: { id?: number; category: string; name: string; svgData: string }) => post<{ ok: boolean; id: number }>("saveGlyph", value),
  deleteGlyph: (value: { id: number }) => post<{ ok: boolean }>("deleteGlyph", value),
  cleanDeckCards: (value: { dryRun: boolean; awakenedIds?: number[]; imagelessOnly?: boolean }) => post<{ ok: boolean; removed: number; found: number; cards: { deckId: number; awakenedId: number; name: string }[] }>("cleanDeckCards", value),
  applyAspect: (value: { awakenedId: number; inventoryAspectId: number }) => post<{ ok: boolean; element: string; newLevel?: number; upgraded?: boolean; cost?: number; targetName?: string; targetKey?: string; imageUrl?: string; stacked?: number }>("applyAspect", value),
  updateTrackPages: (value: { id: number; pages: string[] }) => post<{ ok: boolean }>("updateTrackPages", value),
  getBossState: () => post<{ bossesDefeated: number; nextBossLevel: number; eligible: boolean; wavesDefeated: number; cycleProgress: number }>("getBossState", {}),
  placeWall: (args: { tileId: number; dir: number }) =>
    post<{ ok: true; wall: { edgeKey: string; q: number; r: number; dir: number; hp: number; maxHp: number }; cost: number }>("placeWall", args),
  placeEdgeWork: (args: { tileId: number; dir: number; kind: "wall" | "thorns" | "ward" | "rune"; runeKind?: "snare" | "harm" | "meld"; style?: "stone" | "spire" }) =>
    post<{ ok: true; work: EdgeWork; cost: number }>("placeEdgeWork", args),
  strengthenEdgeWork: (args: { tileId: number; dir: number }) =>
    post<{ ok: true; work: { edgeKey: string; kind: string; level: number; hp: number; maxHp: number }; cost: number; nextCost: number }>("strengthenEdgeWork", args),
  removeEdgeWork: (args: { tileId: number; dir: number }) =>
    post<{ ok: true; edgeKey: string }>("removeEdgeWork", args),
  teachSkill: (args: { awakenedId: number; skill: "warding" | "runeing" }) =>
    post<{ ok: true; awakenedId: number; skill: string; cost: number }>("teachSkill", args),
  setPatrol: (args: { awakenedId: number; tileIds: number[] }) =>
    post<{ ok: true; awakenedId: number; patrolling: boolean; waypoints?: number }>("setPatrol", args),
  setMarch: (args: { awakenedId: number; tileId: number }) =>
    post<{ ok: true; awakenedId: number; tileId: number; steps: number; seconds: number; energy: number }>("setMarch", args),
  recallMarch: (args: { awakenedId: number }) =>
    post<{ ok: true; awakenedId: number; recalled: boolean; stepsHome: number }>("recallMarch", args),
  resolveBossBattle: (args: { victory: boolean; bossLevel: number; survivorIds: number[]; wallState?: { edgeKey: string; hp: number }[]; runesTriggered?: string[]; grimState?: { id: number; hp?: number; stops?: number; charges?: number; spent?: boolean }[]; grimEnergy?: number; }) =>
    post<{ ok: true; victory: boolean; bossesDefeated: number; committedPower: number; bossPower: number; aspectElements?: string[]; newbornClaimed?: boolean; xpGains?: { awakenedId: number; xpGain: number; leveledUp: boolean; newLevel: number }[] }>("resolveBossBattle", args),
  getPendingAspectGrant: () => post<{ grant: { elements: string[]; source: string } | null }>("getPendingAspectGrant", {}),
  claimAspectGrant: () => post<{ ok: true; elements: string[]; spawnedElements: string[]; source: string }>("claimAspectGrant", {}),
  damageTileHp: (value: { tileId: number; damage: number }) => post<{ ok: boolean; hp: number; cursed: boolean }>("damageTileHp", value),
  damageAwokenHp: (value: { awakenedId: number; damage: number }) => post<{ ok: boolean; hp: number; maxHp: number; dissipated?: boolean; awakenedId?: number; xpGain?: number; leveledUp?: boolean; newLevel?: number }>("damageAwokenHp", value),
  demolishBuilding: (value: { buildingId: number }) => post<{ ok: boolean }>("demolishBuilding", value),
  listBattleTracks: () => post<{ tracks: { id: number; name: string; enabled: boolean; pages: string[] }[] }>("listBattleTracks", {}),
  getMood: () => post<{ mood: string; description: string; endsAt: string }>("getMood", {}),
  // Music's mood playlist for the terrain, computed by the server from the
  // current world mood at ask time (see server getTerrainPlaylist).
  getTerrainPlaylist: () => post<{
    mood: string; description: string; playlistMood: string;
    tracks: { id: number; name: string; url: string }[];
  }>("getTerrainPlaylist", {}),
  createConfluence: () => post<{ code: string; sessionId: number }>("createConfluence", {}),
  joinConfluence: (args: { code: string }) => post<{ sessionId: number; ok: boolean }>("joinConfluence", args),
  commitToConfluence: (args: { sessionId: number; awakenedId: number }) => post<{ ok: boolean }>("commitToConfluence", args),
  resolveConfluence: (args: { sessionId: number; victory: boolean }) => post<{ ok: boolean; xpGain: number; participants: number; twin: any }>("resolveConfluence", args),
  claimConfluenceTwin: (args: { sessionId: number }) => post<{ ok: boolean; id: number }>("claimConfluenceTwin", args),
  getConfluenceRoster: (args: { sessionId: number }) => post<{ fighters: any[]; wavePower: number; status: string }>("getConfluenceRoster", args),
  resolveWavePull: (args: { tileId: number; victory: boolean; survivorIds: number[] }) => post<{ ok: boolean; purified: boolean; xpGains?: { awakenedId: number; xpGain: number; leveledUp: boolean; newLevel: number }[] }>("resolveWavePull", args),
  adminResetTender: (args: { ownerKey: string }) => post<{ ok: true }>("adminResetTender", args),
  adminSetEnergy: (args: { ownerKey: string }) => post<{ ok: true; energy: number }>("adminSetEnergy", args),
  adminRefillAllEnergy: () => post<{ ok: true; refilled: number }>("adminRefillAllEnergy", {}),
  adminResetWorldTiles: () => post<{ ok: true; tilesReset: number; tendersAffected: number }>("adminResetWorldTiles", {}),
  adminClearTimers: (args: { ownerKey: string }) => post<{ ok: true }>("adminClearTimers", args),
  adminSetWave: (args: { ownerKey: string; waveNumber: number }) => post<{ ok: true; waveNumber: number }>("adminSetWave", args),
  adminGiftWake: (args: { ownerKey: string }) => post<{ ok: true; balance: number }>("adminGiftWake", args),
  adminMintWakeCodes: (args: { count: number }) => post<{ ok: true; codes: string[] }>("adminMintWakeCodes", args),
  adminListWakeCodes: () => post<{ codes: WakeCodeEntry[] }>("adminListWakeCodes", {}),
  adminRevokeWakeCode: (args: { code: string }) => post<{ ok: true }>("adminRevokeWakeCode", args),
  adminGrantAspectPoints: (args: { ownerKey: string; count: number }) =>
    post<{ ok: true; granted: Record<"tide" | "sky" | "stone" | "root", number>; spawned: Record<"tide" | "sky" | "stone" | "root", number> }>("adminGrantAspectPoints", args),
  redeemWakeCode: (args: { code: string }) => post<{ ok: true; balance: number }>("redeemWakeCode", args),
  ackCreatorGifts: () => post<{ ok: true }>("ackCreatorGifts", {}),
  adminGetTenderDeck: (args: { ownerKey: string }) => post<{ ok: true; field: Awakened[]; hand: Awakened[]; waveNumber: number }>("adminGetTenderDeck", args),
  getBuildingDefs: () => post<{ defs: Array<{ type: string; name: string; cost: number; buildMinutes: number; desc: string; icon: string }> }>("getBuildingDefs", {}),
  getBuildings: () => post<{ buildings: Array<{ id: number; tileId: number; buildingType: string; status: string; readyAt: string | null; element: string | null }> }>("getBuildings", {}),
  placeBuilding: (args: { tileId: number; buildingType: string; element?: string; builderIds?: number[] }) => post<{ ok: true; building: any }>("placeBuilding", args),
  call: (action: string, args: any) => post<any>(action, args),
  getBattleTrack: (args: { id: number }) => post<{ id: number; name: string; trackData: string }>("getBattleTrack", args),
  addBattleTrack: (args: { name: string; trackData: string }) => post<{ id: number }>("addBattleTrack", args),
  toggleBattleTrack: (args: { id: number; enabled: boolean }) => post<{ ok: true }>("toggleBattleTrack", args),
  deleteBattleTrack: (args: { id: number }) => post<{ ok: true }>("deleteBattleTrack", args),
  resolveBattle: (args: { victory: boolean; waveNumber: number; survivorIds: number[]; continueWave?: boolean; targetTileId?: number; wallState?: { edgeKey: string; hp: number }[]; runesTriggered?: string[]; grimState?: { id: number; hp?: number; stops?: number; charges?: number; spent?: boolean }[]; grimEnergy?: number; }) =>
    post<{ ok: true; bonusEligible?: { id: number; q: number; r: number }[]; xpGains?: { awakenedId: number; xpGain: number; leveledUp: boolean; newLevel: number }[]; committedPower?: number; wavePower?: number }>("resolveBattle", args),
  claimBonusTile: (args: { tileId: number }) =>
    post<{ ok: boolean }>("claimBonusTile", args),
  getIncursions: () => post<IncursionsView>("getIncursions", {}),
  getSeeds: () => post<SeedsView>("getSeeds", {}),
  fetchSeed: (args: { seedId: number; awakenedIds: number[] }) => post<{ ok: boolean; missionId: number; arriveAt: number; travelMs: number }>("fetchSeed", args),
  holdSeed: (args: { seedId: number }) => post<{ ok: boolean; building: any }>("holdSeed", args),
  failIncursion: (args: { columnId: number }) => post<{ ok: boolean; broken: boolean }>("failIncursion", args),
  defeatIncursion: (args: { columnId: number; survivorIds?: number[] }) => post<{ ok: boolean; breakUntil?: number; killXp?: number; completionXp?: number; xpGains?: { awakenedId: number; xpGain: number; leveledUp: boolean; newLevel: number }[] }>("defeatIncursion", args),
  dissipateAwoken: (args: { awakenedId: number }) => post<{ ok: true }>("dissipateAwoken", args),
  birthNewbornToHand: (args: { tileId?: number; liberatorNames: string[] }) => post<{ ok: true; id: number }>("birthNewbornToHand", args),
  claimFirstTile: (args: { teamIds: number[] }) => post<{ ok: true }>("claimFirstTile", args),
  birthFieldAwoken: (args: { layers: LayerRef[]; imageBase64: string; tileId: number; liberatorNames: string[]; toHand?: boolean }) =>
    post<{ ok: true; id: number }>("birthFieldAwoken", args),
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
  claimTender: (args: { password: string; refCode?: string; tenderName?: string }) =>
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
