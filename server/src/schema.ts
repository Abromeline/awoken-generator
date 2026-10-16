import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const layerAssets = sqliteTable("layer_assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category", {
    enum: ["background", "legs", "arms", "body", "aura", "aspect", "accessory", "head"],
  }).notNull(),
  rarity: text("rarity", {
    enum: ["common", "uncommon", "rare", "mythic"],
  }).notNull(),
  power: integer("power"),
  toughness: integer("toughness"),
  element: text("element"),
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
  // Growth made permanent (Nigel, 2026-10-15): stat points the tender
  // has SPENT into this Awoken, tracked apart from aspect bonuses so
  // the card's litany can show what levels built.
  spentPower: integer("spent_power").notNull().default(0),
  spentToughness: integer("spent_toughness").notNull().default(0),
  // Bonus stats from assigned points
  bonusPower: integer("bonus_power").notNull().default(0),
  bonusToughness: integer("bonus_toughness").notNull().default(0),
});

// Tender champion: their favorite Awoken, displayed in the Hall of Legends.
export const tenderChampions = sqliteTable("tender_champions", {
  ownerKey: text("owner_key").primaryKey(),
  awakenedId: integer("awakened_id").notNull(),
});

// Hall of Legends: notable deeds by Awoken.
export const awokenLegends = sqliteTable("awoken_legends", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  awakenedId: integer("awakened_id").notNull(),
  ownerKey: text("owner_key").notNull(),
  deed: text("deed", { enum: ["wave_survived", "curse_broken", "battle_won", "level_10", "level_20", "level_30"] }).notNull(),
  count: integer("count").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

// Confluence encounters: two Tenders pool Awoken from hand against a shared wave.
// No territory gained — only experience.
export const confluenceSessions = sqliteTable("confluence_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  hostKey: text("host_key").notNull(),
  guestKey: text("guest_key"),
  status: text("status", { enum: ["waiting", "ready", "battle", "done"] }).notNull().default("waiting"),
  wavePower: integer("wave_power").notNull().default(10),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

// Awoken committed to a confluence (from hand only)
export const confluenceRoster = sqliteTable("confluence_roster", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").notNull(),
  ownerKey: text("owner_key").notNull(),
  awakenedId: integer("awakened_id").notNull(),
});

// Conceived victory twins: generated on confluence victory, claimed via birth popup.
export const confluenceTwins = sqliteTable("confluence_twins", {
  sessionId: integer("session_id").primaryKey(),
  name: text("name").notNull(),
  imageBlobKey: text("image_blob_key").notNull(),
  compositionJson: text("composition_json").notNull(),
  flavorText: text("flavor_text").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
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
  // Set when the Tender chooses to send this telling to Discord via the
  // Voice (2026-10-15). A story is sent at most once; null = still personal.
  sentAt: integer("sent_at", { mode: "timestamp_ms" }),
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
  email: text("email"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Friendships between Tenders.
export const friendships = sqliteTable("friendships", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  requesterKey: text("requester_key").notNull(),
  addresseeKey: text("addressee_key").notNull(),
  status: text("status", { enum: ["pending", "accepted", "declined"] }).notNull().default("pending"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

// Messages between friends only.
export const friendMessages = sqliteTable("friend_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  senderKey: text("sender_key").notNull(),
  receiverKey: text("receiver_key").notNull(),
  text: text("text").notNull(),
  readAt: integer("read_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

// Referral codes: invite a brand new player with a shareable link.
// Accepting births a twin Awoken (with duplicate empowerment bonus).
export const referralCodes = sqliteTable("referral_codes", {
  code: text("code").primaryKey(),
  inviterKey: text("inviter_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

// Wake gift codes: minted by The Ancient Creator (Nigel, in the workshop),
// each redeemable exactly once by a signed-in Tender for +1 wake.
export const wakeCodes = sqliteTable("wake_codes", {
  code: text("code").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  redeemedBy: text("redeemed_by"),
  redeemedAt: integer("redeemed_at", { mode: "timestamp_ms" }),
  revoked: integer("revoked").notNull().default(0),
});

// Gifts from The Ancient Creator: one row per gift (workshop button, gift
// code, or aspect-point grant). Unseen rows (seen_at NULL) surface the
// "...another seed grows" notice on the Tender's next visit.
export const creatorGifts = sqliteTable("creator_gifts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerKey: text("owner_key").notNull(),
  source: text("source", { enum: ["button", "code", "aspect"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  seenAt: integer("seen_at", { mode: "timestamp_ms" }),
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
// Aspects earned through binding attunement. Consumed when equipped at level 3.
export const aspectInventory = sqliteTable("aspect_inventory", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerKey: text("owner_key").notNull(),
  aspectAssetId: integer("aspect_asset_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
});

// Per-element attunement pool from binding Awoken. Fills → aspect is born.
export const aspectAttunement = sqliteTable("aspect_attunement", {
  ownerKey: text("owner_key").notNull(),
  element: text("element", { enum: ["tide", "sky", "stone", "root", "fire"] }).notNull(),
  points: real("points").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  // Realized-rate measurement: lifetime gains never decrease (births only
  // spend `points`), and a periodic sample turns gain deltas into an
  // honest points/hour figure that reflects every feeding system.
  lifetimeGains: real("lifetime_gains").notNull().default(0),
  sampleGains: real("sample_gains").notNull().default(0),
  sampledAt: integer("sampled_at", { mode: "timestamp_ms" }),
  displayRate: real("display_rate").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.ownerKey, t.element] })]);

// Glyph library: SVG symbols for elements, magic, hexes, buffs. Used throughout the game.
export const glyphs = sqliteTable("glyphs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  category: text("category", { enum: ["element", "magic", "hex", "buff"] }).notNull(),
  name: text("name").notNull(),
  svgData: text("svg_data").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
});

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
  hp: integer("hp").notNull().default(10),
  building: text("building"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  // 48h passive purification timer: last time this tile was considered for
  // passive purification. Null = never attempted.
  lastPassiveAt: integer("last_passive_at", { mode: "timestamp_ms" }),
  // XYZ grid: terrain height level. 0 = base. Future terraforming mechanic.
  height: integer("height").notNull().default(0),
  // Terrain attunement (Nigel, 2026-10-14): the 30-point flux. A tile's
  // element is held by a 10-point bank; Awoken standing on the tile pour
  // their dominant element's points into the bank, point for point.
  // 10 points carry a tile from its element to neutral, 10 more from
  // neutral to the pressing element, and pressure matching the current
  // element refills its bank — the shepherd's hold. No Awoken, no change:
  // the land is locked in its flux until one is near.
  attunePoints: real("attune_points").notNull().default(0),
  attuneElement: text("attune_element"),
  // The day-long quest clock (Nigel, 2026-10-16): when the standing
  // company's press was last settled on this tile. The press accrues
  // by the hour while the company stands (see the settle in
  // getTerritory); null while no company stands — no presence, no
  // accrual, and the clock restarts when a company returns.
  attuneAnchorAt: integer("attune_anchor_at", { mode: "timestamp_ms" }),
  // Terraforming trays (Nigel, 2026-10-15): a purified hex is a STACK
  // of trays, Z = total trays, cap 6. sealedTrays counts the trays
  // that filled to 30 and sealed as the hex's element; growPoints is
  // the one growing tray's attunement (0–30), born at the bottom of
  // the stack; topPoints is the top tray's remaining points when it
  // has been wounded (null = whole — and points ARE hit points: a
  // sealed top holds 30). height (above) is maintained by the tray
  // engine as the stack's total tray count.
  sealedTrays: integer("sealed_trays").notNull().default(0),
  growPoints: real("grow_points").notNull().default(0),
  topPoints: real("top_points"),
  // Curse HP: attacks dwindle this; at 0 the tile becomes neutral.
  curseHp: integer("curse_hp"),
  curseMaxHp: integer("curse_max_hp"),
});

// Terrain stage art (Nigel, 2026-10-15): the creator's uploaded faces for
// a hex's grown stages — stage 2 (the swelling) and stage 3 (the
// flourishing). Stage 1 is the bundled art he provided with the game and
// is never stored here. Keyed (element, stage): one living face per slot;
// uploading again replaces it. Until a slot is filled, the map renders
// his provided art for every stage (see client/src/terrainArt.ts).
export const terrainArt = sqliteTable("terrain_art", {
  element: text("element", {
    enum: ["tide", "sky", "stone", "root", "neutral"],
  }).notNull(),
  stage: integer("stage").notNull(),
  imageBlobKey: text("image_blob_key").notNull(),
  mimeType: text("mime_type").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  primaryKey({ columns: [table.element, table.stage] }),
]);

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
  hp: integer("hp"),
  // The marching layer (War-Ground, Nigel 2026-10-16): a patrol road
  // kept as data — a JSON array of tile ids — and the hour the march
  // began (raw ms). Positions are DERIVED from road + clock by every
  // viewer; no system of law reads them. Placements remain the truth.
  patrolPath: text("patrol_path"),
  patrolSince: integer("patrol_since"),
  // The MARCH (Nigel, 2026-10-16): a point-to-point order — the road
  // (JSON tile ids, origin first, destination last), the hour it
  // began and the hour it ends (raw ms). Unlike a patrol, a march
  // LANDS: when the hour passes, the placement itself settles onto
  // the destination (lazily, wherever the record is next read).
  marchPath: text("march_path"),
  marchSince: integer("march_since"),
  marchEnds: integer("march_ends"),
});

// Wave defense: the Unraveling attacks in waves. The center is the last bastion.
export const siteColors = sqliteTable("site_colors", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const waveState = sqliteTable("wave_state", {
  ownerKey: text("owner_key").primaryKey(),
  waveNumber: integer("wave_number").notNull().default(1),
  lastWaveAt: integer("last_wave_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  wavesDefeated: integer("waves_defeated").notNull().default(0),
  // Fix list #4 (Nigel, 2026-10-13): victories impose a recovery — the next
  // wave can be faced only 12 min × 1.15^wavesDefeated after the last
  // victory. Defeats never write this; only victories do.
  lastVictoryAt: integer("last_victory_at", { mode: "timestamp_ms" }),
  // Quiet's tooth (Weather, 2026-10-15): the recovery multiplier the
  // sky stamped at the last victory — 1.5 when it was won under a
  // quiet sky, 1 otherwise. nextWaveAtFor applies it to the cooldown.
  recoveryMult: real("recovery_mult").notNull().default(1),
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
  // The Attunement Shrine's calling (Nigel, 2026-10-14): "blessing"
  // (doubling nearby binders, its first nature) or "attune" — turned to
  // the LAND, pouring its congregation's dominant element into its hex
  // and the six around it, one hex about every five hours, while the
  // blessing sleeps. attuneAnchorAt starts the current five-hour step.
  mode: text("mode").notNull().default("blessing"),
  attuneAnchorAt: integer("attune_anchor_at", { mode: "timestamp_ms" }),
  // Hall of Champions: level (rooms), upgrade reservoir, upgrade timer.
  level: integer("level").notNull().default(1),
  fundJson: text("fund_json"),
  upgradeReadyAt: integer("upgrade_ready_at", { mode: "timestamp_ms" }),
});

// Hall of Champions residents: one Awoken per room, freely swappable.
export const hallResidents = sqliteTable("hall_residents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerKey: text("owner_key").notNull(),
  roomIndex: integer("room_index").notNull(),
  awakenedId: integer("awakened_id").notNull(),
  housedAt: integer("housed_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
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

// THE TABLE (Discord Activity): a Tender's own keeping at the Table —
// personal notes and their typed inventory, keyed by who they are
// ("discord:<id>" once binding lands; "dev:<name>" at the doorway test).
// Private by construction: only ever sent to the player it belongs to.
export const tableProfiles = sqliteTable("table_profiles", {
  playerKey: text("player_key").primaryKey(),
  displayName: text("display_name").notNull(),
  notes: text("notes").notNull().default(""),
  inventory: text("inventory").notNull().default("[]"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

// Battle tracks: rotating 8-bit music for battlegrounds.
export const battleTracks = sqliteTable("battle_tracks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  trackData: text("track_data").notNull(),
  enabled: integer("enabled").notNull().default(1),
  pages: text("pages").notNull().default('["territory"]'),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Tender feedback: bug reports, questions, suggestions. Two-way —
// Nigel replies from the workshop; tenders see replies on their screen.
export const feedbackMessages = sqliteTable("feedback_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerKey: text("owner_key").notNull(),
  tenderName: text("tender_name"),
  category: text("category", { enum: ["bug", "question", "suggestion"] }).notNull(),
  body: text("body").notNull(),
  pinned: integer("pinned").notNull().default(0),
  reply: text("reply"),
  repliedAt: integer("replied_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});
