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
  identityKey: text("identity_key").notNull().default("legacy"),
  iteration: integer("iteration").notNull().default(0),
  flavorText: text("flavor_text").notNull().default("Every form begins as scattered matter."),
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
