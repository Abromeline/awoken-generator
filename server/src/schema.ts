import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const layerAssets = sqliteTable("layer_assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category", {
    enum: ["background", "legs", "arms", "body", "aura", "accessory", "head"],
  }).notNull(),
  rarity: text("rarity", {
    enum: ["common", "uncommon", "rare", "mythic"],
  }).notNull(),
  power: integer("power"),
  toughness: integer("toughness"),
  imageBlobKey: text("image_blob_key").notNull(),
  mimeType: text("mime_type").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const awakened = sqliteTable("awakened", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().default("Unnamed Awoken"),
  imageBlobKey: text("image_blob_key").notNull(),
  compositionJson: text("composition_json").notNull().default("[]"),
  collection: text("collection", { enum: ["tender", "workshop"] }).notNull().default("workshop"),
  ownerName: text("owner_name").notNull().default("Nigel"),
  // Which Tender (or soft visitor) this belongs to. NULL = legacy shared
  // Tender-master-collection rows, visible to everyone.
  ownerKey: text("owner_key"),
  identityKey: text("identity_key").notNull().default("legacy"),
  iteration: integer("iteration").notNull().default(0),
  flavorText: text("flavor_text").notNull().default("Every form begins as scattered matter."),
  // Stories shared to the Confluence: each grants +1/+1, max 3.
  storyCount: integer("story_count").notNull().default(0),
  // Born on the field (purified land), not through Wake One. Marked with gold tree.
  fieldBorn: integer("field_born").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  dispersedUntil: integer("dispersed_until", { mode: "timestamp_ms" }),
  // Experience: XP from battles, level = floor(sqrt(xp/100)), stat point every 10 levels
  experience: integer("experience").notNull().default(0),
  // Unassigned stat points earned from levels
  statPoints: integer("stat_points").notNull().default(0),
  // Bonus stats from assigned points
  bonusPower: integer("bonus_power").notNull().default(0),
  bonusToughness: integer("bonus_toughness").notNull().default(0),
});

// Stories Tenders tell about their Awoken. Sharing to the Confluence is
// what grants the power-up: each story is +1/+1, max 3 per Awoken.
export const awokenStories = sqliteTable("awoken_stories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  awakenedId: integer("awakened_id").notNull(),
  tenderId: integer("tender_id").notNull(),
  storyText: text("story_text").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Standalone-only: minimal blob index replacing the runtime blob store.
export const blobIndex = sqliteTable("blob_index", {
  key: text("key").primaryKey(),
  objectId: text("object_id").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAtMs: integer("created_at_ms").notNull(),
});

// Wake-credit ledger. Single implicit owner ("tender") for now; user_id is
// here so per-Tender balances work the day accounts exist.
export const creditLedger = sqliteTable("credit_ledger", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().default("tender"),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  reference: text("reference"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Tiny key/value store (e.g. the lazily created Stripe customer id).
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// Welcome ritual: one row per browser-visitor (localStorage UUID, soft
// identity until Tender accounts exist). Keys the free-wake state.
export const visitors = sqliteTable("visitors", {
  visitorId: text("visitor_id").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  welcomeWakesGranted: integer("welcome_wakes_granted").notNull().default(0),
  welcomeClaimed: integer("welcome_claimed").notNull().default(0),
  lastFreeWakeAt: integer("last_free_wake_at", { mode: "timestamp_ms" }),
});

// Self-serve Tender accounts: a secret code + password. No email, no OAuth.
// The code is the Tender's identity; tender_name is chosen at the naming
// ritual (first creature entering the deck).
export const tenders = sqliteTable("tenders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  tenderName: text("tender_name"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// DB-backed sessions so logins survive restarts. Token lives in the
// Tender's localStorage, sent as X-Tender-Token.
export const tenderSessions = sqliteTable("tender_sessions", {
  token: text("token").primaryKey(),
  tenderId: integer("tender_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Awoken generated but not yet claimed: the first-visit "welcome" greeting
// and the 4-hourly "free" wake each get their own slot. While a row exists
// here, the awakened record is held out of every deck until claimed.
export const pendingWelcomes = sqliteTable("pending_welcomes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  visitorId: text("visitor_id").notNull(),
  slot: text("slot", { enum: ["welcome", "free"] }).notNull(),
  awakenedId: integer("awakened_id").notNull(),
  respinsUsed: integer("respins_used").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Tender decks: named gatherings of Awoken, each with a chosen face card.
// Decks belong to one owner key (a Tender account, or a soft visitor).
// Membership lives in deck_cards; the awakened rows themselves are never
// touched by deck operations.
export const decks = sqliteTable("decks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerKey: text("owner_key").notNull(),
  name: text("name").notNull(),
  faceCardId: integer("face_card_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const deckCards = sqliteTable("deck_cards", {
  deckId: integer("deck_id").notNull(),
  awakenedId: integer("awakened_id").notNull(),
  addedAt: integer("added_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Territory: the Tender's land. Each tile has axial coords (q, r),
// an element, and may be cursed (Unraveling-held) or sparked (fire-touched).
// Tiles belong to one Tender; the deck IS the territory.
export const territoryTiles = sqliteTable("territory_tiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerKey: text("owner_key").notNull(),
  q: integer("q").notNull(),
  r: integer("r").notNull(),
  element: text("element", {
    enum: ["tide", "sky", "stone", "root", "neutral", "fire"],
  }).notNull().default("neutral"),
  cursed: integer("cursed").notNull().default(1),
  spark: integer("spark").notNull().default(0),
  building: text("building"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  // 48h passive purification timer: last time this tile was considered for
  // passive purification. Null = never attempted.
  lastPassiveAt: integer("last_passive_at", { mode: "timestamp_ms" }),
  // XYZ grid: terrain height level. 0 = base. Future terraforming mechanic.
  height: integer("height").notNull().default(0),
  // Curse HP: attacks dwindle this; at 0 the tile becomes neutral.
  curseHp: integer("curse_hp"),
  curseMaxHp: integer("curse_max_hp"),
});

// Field placements: which Awoken stands on which tile.
// An Awoken on the field cannot return to hand except by dissipation.
export const fieldPlacements = sqliteTable("field_placements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerKey: text("owner_key").notNull(),
  awakenedId: integer("awakened_id").notNull(),
  tileId: integer("tile_id").notNull(),
  placedAt: integer("placed_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  lastMovedAt: integer("last_moved_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  // Stance: attack | defense | binding. Defense is the default — holding ground.
  stance: text("stance").notNull().default("defense"),
  // Binding upkeep: last time the hourly 3-energy charge was applied.
  lastBindingChargeAt: integer("last_binding_charge_at", { mode: "timestamp_ms" }),
});

// Wave defense: the Unraveling attacks in waves. The center is the last bastion.
export const waveState = sqliteTable("wave_state", {
  ownerKey: text("owner_key").primaryKey(),
  waveNumber: integer("wave_number").notNull().default(1),
  lastWaveAt: integer("last_wave_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  wavesDefeated: integer("waves_defeated").notNull().default(0),
});

// Tender energy: server-authoritative. Admin can refill.
export const tenderResources = sqliteTable("tender_resources", {
  ownerKey: text("owner_key").primaryKey(),
  energy: integer("energy").notNull().default(5),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date()),
});

// Territory buildings: placed by Tenders on purified tiles.
export const territoryBuildings = sqliteTable("territory_buildings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerKey: text("owner_key").notNull(),
  tileId: integer("tile_id").notNull(),
  buildingType: text("building_type").notNull(),
  status: text("status").notNull().default("building"),
  placedAt: integer("placed_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  readyAt: integer("ready_at", { mode: "timestamp_ms" }),
  element: text("element"),
  builderStances: text("builder_stances"),
  lastHarvestAt: integer("last_harvest_at", { mode: "timestamp_ms" }),
  lastUpkeepAt: integer("last_upkeep_at", { mode: "timestamp_ms" }),
});

// UI Workspace: editable sprites and config for enemies, buildings, timers.
export const uiSprites = sqliteTable("ui_sprites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  category: text("category").notNull(),
  name: text("name").notNull(),
  blobKey: text("blob_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const uiConfig = sqliteTable("ui_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

// Battle tracks: rotating 8-bit music for battlegrounds.
export const battleTracks = sqliteTable("battle_tracks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  trackData: text("track_data").notNull(),
  enabled: integer("enabled").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
