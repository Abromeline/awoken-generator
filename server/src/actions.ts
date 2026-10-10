// Port of server/src/actions.ts from the Muse-space original.
// Every handler keeps the original validation shapes and behavior; only the
// runtime bindings changed: `ctx.db` -> the local drizzle instance,
// `ctx.blobs` -> the content-addressed blob store, `ctx.inference.complete`
// -> the curated naming/flavor pools in naming.ts.

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, blobs, schema, sqlite } from "./store.js";
import { mysticalPieceName, birthFlavorText } from "./naming.js";
import { creditBalance, spendWakeCredit, SINGLE_OWNER } from "./credits.js";
import { CREDITS_PER_PACK, PACK_PRICE_CENTS, PRICE_PER_WAKE_CENTS, formatUsd } from "./config.js";
import { stripeReady } from "./stripe.js";
import {
  claimTender, destroySession, loginTender, newTenderNameSuggestion,
  publicTender, setTenderName, suggestTenderCode, tenderOwnerKey,
  type TenderRow,
} from "./tenders.js";

export interface ActionContext {
  /** Browser-visitor mark from the X-Visitor-Id header (null when absent). */
  visitorId: string | null;
  /** Logged-in Tender from the X-Tender-Token header (null when absent). */
  tender: TenderRow | null;
}

/** Owner key for credits, welcome state, and deck ownership. */
function ownerKeyFor(ctx?: ActionContext): string {
  if (ctx?.tender) return tenderOwnerKey(ctx.tender.id);
  return ctx?.visitorId ?? SINGLE_OWNER;
}

/** Display name for newly woken creatures. */
function ownerNameFor(ctx?: ActionContext): string {
  return ctx?.tender?.tenderName ?? "Tender";
}

const layerCategorySchema = z.enum(["background", "arms", "body", "aura", "head"]);
const raritySchema = z.enum(["common", "uncommon", "rare", "mythic"]);
const collectionSchema = z.enum(["tender", "workshop"]);
const statSchema = z.number().int().min(1).max(3);
const statCategories = new Set<z.infer<typeof layerCategorySchema>>(["arms", "body", "head"]);
const okResponse = z.object({ ok: z.literal(true) });
const purifyResponse = z.object({
  ok: z.boolean(),
  reason: z.enum(["resting", "too-weak", "not-yet"]).optional(),
  hoursLeft: z.number().optional(),
  need: z.number().optional(),
  have: z.number().optional(),
  purified: z.boolean().optional(),
});

type Rarity = z.infer<typeof raritySchema>;
type AssetStats = { name: string; rarity: Rarity; power: number | null; toughness: number | null };

function rarityFromStats(power: number, toughness: number): Rarity {
  const total = power + toughness;
  if (total <= 3) return "common";
  if (total === 4) return "uncommon";
  if (total === 5) return "rare";
  return "mythic";
}

// Legacy machine labels ("Arm 1" …) are renamed to the mystical voice the
// first time the studio is read — identical to the original behavior.
const legacyNames: Record<"arms" | "body" | "head", string[]> = {
  arms: ["The Long Reaching", "Branches of Quiet Rain", "The Inkward Hands", "Limbs of the Far Bell", "The Patient Grasp", "Boughs Beneath Moonwater", "The Hollow Embrace", "Arms of Returning", "The Manyfold Reach", "Blackroot Gesture", "The Unfurling", "Hands of the First Weather", "The Between-Limbs", "Reach of the Waking Tide"],
  body: ["Vessel of Still Earth", "The Bound Hollow", "House of Soft Thunder", "The Listening Torso", "Rooted Chamber", "Vessel of the Pale Current", "The Remembering Form", "Body of Held Rain", "The Quiet Monolith", "Chamber of New Moss", "The Gathered Matter"],
  head: ["Crown of First Thought", "The Rain-Reader", "Face of the Unlit Moon", "The Listening Crown", "Head of Small Stars", "The Dreaming Aperture", "Crown of Rootlight", "The Witness Above", "The Opened Seed", "Face of the Deep Bell", "The Soft Oracle", "Crown of Returning Birds", "The First Awakening"],
};

function mysticalLegacyName(category: string, name: string) {
  const match = name.match(/^(Arm|Body|Head) (\d+)$/);
  if (!match?.[1] || !match[2]) return null;
  const key = match[1].toLowerCase() === "arm" ? "arms" : (match[1].toLowerCase() as "body" | "head");
  if (category !== key) return null;
  const index = Number(match[2]) - 1;
  return legacyNames[key][index] ?? null;
}

const storedLayerRefShape = z.object({
  source_id: z.string().min(1).max(100), name: z.string().min(1).max(100), category: layerCategorySchema,
  rarity: raritySchema, power: statSchema.nullable().optional(), toughness: statSchema.nullable().optional(),
});
export const layerRefShape = z.object({
  source_id: z.string().min(1).max(100), name: z.string().min(1).max(100), category: layerCategorySchema,
  rarity: raritySchema, power: statSchema.nullable(), toughness: statSchema.nullable(),
});
const assetShape = z.object({
  id: z.number(), name: z.string(), category: layerCategorySchema, rarity: raritySchema,
  power: statSchema.nullable(), toughness: statSchema.nullable(), image_url: z.string(), mime_type: z.string(), created_at: z.string(),
});
const awakenedShape = z.object({
  id: z.number(), name: z.string(), image_url: z.string(), layers: z.array(layerRefShape),
  base_power: z.number().int().min(0), base_toughness: z.number().int().min(0),
  power: z.number().int().min(0), toughness: z.number().int().min(0), empowerment: z.number().int().min(0),
  story_count: z.number().int().min(0).max(3),
  iteration: z.number().int().min(0), collection: collectionSchema, owner_name: z.string(), flavor_text: z.string(), created_at: z.string(),
});

function parseDbId(sourceId: string) {
  const match = sourceId.match(/^db:(\d+)$/);
  return match?.[1] ? Number(match[1]) : null;
}

function parseLayers(value: string, assetStats: Map<number, AssetStats>): z.infer<typeof layerRefShape>[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const result = storedLayerRefShape.safeParse(item);
      if (!result.success) return [];
      const id = parseDbId(result.data.source_id);
      const current = id === null ? undefined : assetStats.get(id);
      return [{ ...result.data, name: current?.name ?? result.data.name, rarity: current?.rarity ?? result.data.rarity, power: current?.power ?? result.data.power ?? null, toughness: current?.toughness ?? result.data.toughness ?? null }];
    });
  } catch { return []; }
}

function identityFor(layers: z.infer<typeof layerRefShape>[]) {
  return ["arms", "body", "head"].map((category) => layers.find((layer) => layer.category === category)?.source_id ?? "none").join("|");
}

/** Mirror of the client's element keyword read (App.tsx): a piece's element
 *  from its name. The server keeps its own copy so it never trusts the
 *  client's claim about what a team is. */
function elementForPieceName(name: string): "tide" | "sky" | "stone" | "root" | "fire" {
  const n = name.toLowerCase();
  if (/fire|ember|flame|ash|inferno/.test(n)) return "fire";
  if (/tide|water|current|pool|pond|rain|moonwater/.test(n)) return "tide";
  if (/mountain|monolith|stone|rock|crystal/.test(n)) return "stone";
  if (/sky|bird|moon|star|lantern|upward|weather|bell/.test(n)) return "sky";
  return "root";
}

export function blobUrl(key: string): string {
  return `/blobs/${Buffer.from(key, "utf8").toString("base64url")}`;
}

type AwakenedRow = typeof schema.awakened.$inferSelect;

/** One awakened row → the full creature payload the client renders. */
export function toAwakenedPayload(
  row: AwakenedRow,
  layers: z.infer<typeof layerRefShape>[],
  identity: string,
  idsByIdentity: Map<string, number[]>
) {
  const basePower = layers.reduce((sum, layer) => sum + (layer.power ?? 0), 0);
  const baseToughness = layers.reduce((sum, layer) => sum + (layer.toughness ?? 0), 0);
  const familyIds = idsByIdentity.get(identity) ?? [row.id];
  const empowerment = Math.max(0, familyIds.length - 1);
  const occurrenceIndex = familyIds.indexOf(row.id);
  const iteration = occurrenceIndex < 0 ? row.iteration : occurrenceIndex;
  const collection = collectionSchema.safeParse(row.collection);
  const storyCount = row.storyCount ?? 0;
  const xp = row.experience ?? 0;
  const level = levelForXp(xp);
  const bonusPower = row.bonusPower ?? 0;
  const bonusToughness = row.bonusToughness ?? 0;
  return {
    id: row.id, name: row.name, image_url: blobUrl(row.imageBlobKey), layers,
    base_power: basePower, base_toughness: baseToughness,
    power: basePower + empowerment + storyCount + bonusPower,
    toughness: baseToughness + empowerment + storyCount + bonusToughness,
    empowerment, story_count: storyCount, field_born: row.fieldBorn ?? 0, iteration, collection: collection.success ? collection.data : ("workshop" as const),
    owner_name: row.ownerName, flavor_text: row.flavorText, created_at: row.createdAt.toISOString(),
    experience: xp, level, stat_points: row.statPoints ?? 0,
    bonus_power: bonusPower, bonus_toughness: bonusToughness,
  };
}

/** Full creature payload for a single awakened id, or null when it is gone.
 *  Shared by the welcome endpoints so a waiting Awoken renders exactly like
 *  a decked one. */
export async function awakenedPayloadById(id: number) {
  const rows = await db.select().from(schema.awakened).where(eq(schema.awakened.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;
  const assetRows = await db.select().from(schema.layerAssets);
  const assetStats = new Map<number, AssetStats>();
  for (const assetRow of assetRows) {
    const rarity = raritySchema.safeParse(assetRow.rarity);
    if (rarity.success) assetStats.set(assetRow.id, { name: assetRow.name, rarity: rarity.data, power: assetRow.power, toughness: assetRow.toughness });
  }
  const layers = parseLayers(row.compositionJson, assetStats);
  const identity = row.identityKey === "legacy" ? identityFor(layers) : row.identityKey;
  const allRows = await db.select().from(schema.awakened);
  const idsByIdentity = new Map<string, number[]>();
  for (const other of allRows) {
    const otherIdentity = other.identityKey === "legacy" ? identityFor(parseLayers(other.compositionJson, assetStats)) : other.identityKey;
    idsByIdentity.set(otherIdentity, [...(idsByIdentity.get(otherIdentity) ?? []), other.id].sort((a, b) => a - b));
  }
  return toAwakenedPayload(row, layers, identity, idsByIdentity);
}

export interface AwakeningPlan {
  canonicalLayers: z.infer<typeof layerRefShape>[];
  identityKey: string;
  previousCount: number;
  name: string;
  flavorText: string;
  basePower: number;
  baseToughness: number;
}

/** Shared awakening arithmetic: canonicalize layers against current pool
 *  stats, derive the identity family, name and flavor the form. Used by both
 *  the paid Wake One and the free welcome-wake generation. */
export async function planAwakening(layers: z.infer<typeof layerRefShape>[]): Promise<AwakeningPlan> {
  const [latest, currentAssets, existing] = await Promise.all([
    db.select({ id: schema.awakened.id }).from(schema.awakened).orderBy(desc(schema.awakened.id)).limit(1),
    db.select({ id: schema.layerAssets.id, name: schema.layerAssets.name, rarity: schema.layerAssets.rarity, power: schema.layerAssets.power, toughness: schema.layerAssets.toughness }).from(schema.layerAssets),
    db.select({ identityKey: schema.awakened.identityKey, compositionJson: schema.awakened.compositionJson, iteration: schema.awakened.iteration }).from(schema.awakened),
  ]);
  const currentStats = new Map<number, AssetStats>(currentAssets.flatMap((row) => {
    const rarity = raritySchema.safeParse(row.rarity);
    return rarity.success ? [[row.id, { name: row.name, rarity: rarity.data, power: row.power, toughness: row.toughness }] as const] : [];
  }));
  const canonicalLayers = layers.map((layer) => {
    const id = parseDbId(layer.source_id); const current = id === null ? undefined : currentStats.get(id);
    return { ...layer, rarity: current?.rarity ?? layer.rarity, power: current?.power ?? layer.power, toughness: current?.toughness ?? layer.toughness };
  });
  const identityKey = identityFor(canonicalLayers);
  let previousCount = 0;
  for (const row of existing) {
    const rowIdentity = row.identityKey === "legacy" ? identityFor(parseLayers(row.compositionJson, currentStats)) : row.identityKey;
    if (rowIdentity === identityKey) previousCount += 1;
  }
  const nextNumber = (latest[0]?.id ?? 0) + 1;
  const name = `Awoken ${String(nextNumber).padStart(3, "0")}`;
  const namedMatter = canonicalLayers.filter((layer) => statCategories.has(layer.category)).map((layer) => layer.name);
  const flavorText = birthFlavorText(namedMatter);
  const basePower = canonicalLayers.reduce((sum, layer) => sum + (layer.power ?? 0), 0);
  const baseToughness = canonicalLayers.reduce((sum, layer) => sum + (layer.toughness ?? 0), 0);
  return { canonicalLayers, identityKey, previousCount, name, flavorText, basePower, baseToughness };
}

async function buildStudio(ctx: ActionContext | undefined, opts?: { tenderOnly?: boolean }) {
  const ownerKey = ownerKeyFor(ctx);
  let assetRows = await db.select().from(schema.layerAssets).orderBy(asc(schema.layerAssets.category), desc(schema.layerAssets.id));
  const renames = assetRows.flatMap((row) => {
    const next = mysticalLegacyName(row.category, row.name);
    return next ? [{ id: row.id, name: next }] : [];
  });
  if (renames.length) {
    await Promise.all(renames.map((item) => db.update(schema.layerAssets).set({ name: item.name }).where(eq(schema.layerAssets.id, item.id))));
    assetRows = await db.select().from(schema.layerAssets).orderBy(asc(schema.layerAssets.category), desc(schema.layerAssets.id));
  }
  const pendingIds = new Set(
    (await db.select({ awakenedId: schema.pendingWelcomes.awakenedId }).from(schema.pendingWelcomes))
      .map((row) => row.awakenedId)
  );
  const now = new Date();
  const awakenedRows = (await db.select().from(schema.awakened).orderBy(desc(schema.awakened.id)))
    // Held-apart forms (the welcome greeting, unclaimed free wakes) stay out
    // of every deck until their Tender claims them.
    // Dispersed Awoken (lost in waves) are in time until they re-coalesce.
    .filter((row) => !pendingIds.has(row.id))
    .filter((row) => !row.dispersedUntil || row.dispersedUntil <= now);
  const supportedAssetRows = assetRows.flatMap((row) => {
    const category = layerCategorySchema.safeParse(row.category); const rarity = raritySchema.safeParse(row.rarity);
    return category.success && rarity.success ? [{ ...row, category: category.data, rarity: rarity.data }] : [];
  });
  const assetStats = new Map<number, AssetStats>(supportedAssetRows.map((row) => [row.id, { name: row.name, rarity: row.rarity, power: row.power, toughness: row.toughness }]));
  const assets = supportedAssetRows.map((row) => ({
    id: row.id, name: row.name, category: row.category, rarity: row.rarity, power: row.power, toughness: row.toughness,
    image_url: blobUrl(row.imageBlobKey), mime_type: row.mimeType, created_at: row.createdAt.toISOString(),
  }));
  const parsedRows = (
    opts?.tenderOnly
      ? awakenedRows.filter(
          (row) =>
            row.collection === "tender" &&
            // Strict ownership: only the Tender's own Awoken.
            row.ownerKey === ownerKey
        )
      : awakenedRows
  ).map((row) => {
    const layers = parseLayers(row.compositionJson, assetStats);
    const identity = row.identityKey === "legacy" ? identityFor(layers) : row.identityKey;
    return { row, layers, identity };
  });
  const idsByIdentity = new Map<string, number[]>();
  for (const item of parsedRows) idsByIdentity.set(item.identity, [...(idsByIdentity.get(item.identity) ?? []), item.row.id].sort((a, b) => a - b));
  const awakened = parsedRows.map(({ row, layers, identity }) => toAwakenedPayload(row, layers, identity, idsByIdentity));
  return {
    assets,
    awakened,
    tender: ctx?.tender ? publicTender(ctx.tender) : null,
    credits: {
      balance: await creditBalance(ownerKey),
      packPriceCents: PACK_PRICE_CENTS,
      packPriceLabel: formatUsd(PACK_PRICE_CENTS),
      creditsPerPack: CREDITS_PER_PACK,
      pricePerWakeCents: PRICE_PER_WAKE_CENTS,
      checkoutEnabled: stripeReady(),
    },
  };
}

function badRequest(message: string): never {
  throw Object.assign(new Error(message), { status: 400 });
}



/**
 * CORRUPTION TOUGHNESS PROTOCOL
 *
 * Every cursed tile has a Corruption Toughness that the Awoken must overcome:
 *   Toughness = 3 + (2 × ring)
 * Where "ring" is the hex distance from the purified center (0,0):
 *   Ring 1 (adjacent to center): 5 toughness
 *   Ring 2: 7 toughness
 *   Ring 3: 9 toughness... and so on outward.
 *
 * How Awoken break it:
 * - ACTIVE ASSAULT (deployBattle): The combined power of ALL Awoken standing
 *   on the tile must meet or exceed its toughness. If so, the dark breaks
 *   immediately. The tile takes the dominant element of its liberators.
 * - PASSIVE SIEGE (passivePurify): Every 48 hours, each cursed tile adjacent
 *   to purified land may attempt to break. If the combined power of Awoken
 *   on neighboring purified tiles (plus defenders on the tile itself) meets
 *   the toughness, there is a 30% chance the dark breaks. The timer resets
 *   whether the attempt succeeds or fails.
 *
 * Power is always measured from the Awoken's layers (current pool stats),
 * never from the client's word.
 */
function corruptionToughness(q: number, r: number): number {
  const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
  return 3 + 2 * Math.max(ring, 1);
}



/** Binding bonus: Awoken in binding stance channel power into the land.
 *  Their own tile gets +3, adjacent tiles get +1. The energy cost is
 *  tracked client-side (2 to enter, 1 per hour). */
async function bindingBonuses(ownerKey: string): Promise<Map<number, number>> {
  const bonuses = new Map<number, number>();
  const binders = await db.select({
    tileId: schema.fieldPlacements.tileId,
  }).from(schema.fieldPlacements)
    .where(and(
      eq(schema.fieldPlacements.ownerKey, ownerKey),
      eq(schema.fieldPlacements.stance, "binding")
    ));
  if (!binders.length) return bonuses;
  const tiles = await db.select({
    id: schema.territoryTiles.id,
    q: schema.territoryTiles.q,
    r: schema.territoryTiles.r,
  }).from(schema.territoryTiles)
    .where(eq(schema.territoryTiles.ownerKey, ownerKey));
  const tileById = new Map(tiles.map(t => [t.id, t]));
  const tileByCoord = new Map(tiles.map(t => [`${t.q},${t.r}`, t]));
  for (const b of binders) {
    const tile = tileById.get(b.tileId);
    if (!tile) continue;
    // Own tile gets +3
    bonuses.set(tile.id, (bonuses.get(tile.id) ?? 0) + 3);
    // Neighbors get +1
    const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    for (const [dq, dr] of dirs) {
      const neighbor = tileByCoord.get(`${tile.q + dq},${tile.r + dr}`);
      if (neighbor) {
        bonuses.set(neighbor.id, (bonuses.get(neighbor.id) ?? 0) + 1);
      }
    }
  }
  return bonuses;
}

/** Expand the frontier: when a tile is purified, cursed wilds push outward.
 *  Any missing neighbor of (q,r) becomes a new cursed tile. */
async function expandFrontier(ownerKey: string, q: number, r: number) {
  const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const elements = ["tide", "sky", "stone", "root", "neutral"] as const;
  const existing = await db.select({ q: schema.territoryTiles.q, r: schema.territoryTiles.r })
    .from(schema.territoryTiles)
    .where(eq(schema.territoryTiles.ownerKey, ownerKey));
  const seen = new Set(existing.map(t => `${t.q},${t.r}`));
  const now = new Date();
  for (const [dq, dr] of dirs) {
    const nq = q + dq, nr = r + dr;
    if (seen.has(`${nq},${nr}`)) continue;
    const el = elements[Math.floor(Math.random() * elements.length)];
    // Curse HP scales with ring distance from center: ring 1 = 10, +6 per ring
    const ring = Math.max(Math.abs(nq), Math.abs(nr), Math.abs(nq + nr));
    const hp = 4 + ring * 6;
    await db.insert(schema.territoryTiles).values({
      ownerKey, q: nq, r: nr, element: el, cursed: 1, lastPassiveAt: now,
      curseHp: hp, curseMaxHp: hp,
    });
    seen.add(`${nq},${nr}`);
  }
}


// Energy helpers: server-authoritative energy per tender.
async function grantBirthEnergy(ownerKey: string, power: number): Promise<number> {
  // When an Awoken is born, recalculate max and grant the energy bonus immediately.
  let bonus = 0;
  if (power >= 10) bonus = 4;
  else if (power >= 7) bonus = 3;
  else if (power >= 4) bonus = 2;
  else if (power >= 1) bonus = 1;
  if (bonus > 0) {
    const maxEnergy = await calculateMaxEnergy(ownerKey);
    const current = await getEnergyFor(ownerKey);
    const next = Math.min(current + bonus, maxEnergy);
    await db.update(schema.tenderResources)
      .set({ energy: next, updatedAt: new Date() })
      .where(eq(schema.tenderResources.ownerKey, ownerKey));
  }
  return bonus;
}

async function calculateMaxEnergy(ownerKey: string): Promise<number> {
  // 10 base + power-scaled bonus per Awoken in hand, deployed, defending, or binding
  // 1-3pwr:+1, 4-6:+2, 7-9:+3, 10+:+4
  // Defending/binding only raise the cap, not the refresh rate.
  // Each active Dream Tree: +1 max energy.
  const awoken = await db.select().from(schema.awakened)
    .where(eq(schema.awakened.ownerKey, ownerKey));
  let max = 10;
  for (const a of awoken) {
    // Skip dispersed (in re-coalescence)
    if (a.dispersedUntil && new Date(a.dispersedUntil) > new Date()) continue;
    try {
      const layers = JSON.parse(a.compositionJson) as { power?: number }[];
      const p = layers.reduce((sum, l) => sum + (l.power ?? 0), 0);
      if (p >= 10) max += 4;
      else if (p >= 7) max += 3;
      else if (p >= 4) max += 2;
      else if (p >= 1) max += 1;
    } catch {}
  }
  // Dream Trees and Awakening Wells: configurable energy bonus each
  const gameConfig = await loadGameConfig();
  const trees = await db.select().from(schema.territoryBuildings)
    .where(and(
      eq(schema.territoryBuildings.ownerKey, ownerKey),
      eq(schema.territoryBuildings.buildingType, "tree"),
      eq(schema.territoryBuildings.status, "active"),
    ));
  max += trees.length * (gameConfig.buildings["tree"]?.energyBonus ?? 1);
  const wells = await db.select().from(schema.territoryBuildings)
    .where(and(
      eq(schema.territoryBuildings.ownerKey, ownerKey),
      eq(schema.territoryBuildings.buildingType, "awakening-well"),
      eq(schema.territoryBuildings.status, "active"),
    ));
  max += wells.length * (gameConfig.buildings["awakening-well"]?.energyBonus ?? 3);
  return max;
}

async function getEnergyFor(ownerKey: string): Promise<number> {
  const res = await db.select().from(schema.tenderResources)
    .where(eq(schema.tenderResources.ownerKey, ownerKey)).limit(1);
  if (!res.length) {
    await db.insert(schema.tenderResources).values({ ownerKey, energy: 10 });
    return 10;
  }
  return res[0].energy;
}

async function spendEnergy(ownerKey: string, amount: number): Promise<boolean> {
  const current = await getEnergyFor(ownerKey);
  if (current < amount) return false;
  await db.update(schema.tenderResources)
    .set({ energy: current - amount, updatedAt: new Date() })
    .where(eq(schema.tenderResources.ownerKey, ownerKey));
  return true;
}

// Experience: level = floor(sqrt(xp / 100)). Every 10 levels grants 1 stat point.
function levelForXp(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100));
}

async function grantXp(awakenedId: number, amount: number): Promise<{ leveledUp: boolean; newLevel: number; statPointsGained: number }> {
  const rows = await db.select().from(schema.awakened).where(eq(schema.awakened.id, awakenedId)).limit(1);
  if (!rows.length) return { leveledUp: false, newLevel: 0, statPointsGained: 0 };
  const oldXp = rows[0].experience ?? 0;
  const oldLevel = levelForXp(oldXp);
  const newXp = oldXp + amount;
  const newLevel = levelForXp(newXp);
  // Stat points: 1 per 10 levels crossed
  const oldTens = Math.floor(oldLevel / 10);
  const newTens = Math.floor(newLevel / 10);
  const statPointsGained = newTens - oldTens;
  await db.update(schema.awakened)
    .set({
      experience: newXp,
      statPoints: (rows[0].statPoints ?? 0) + statPointsGained,
    })
    .where(eq(schema.awakened.id, awakenedId));
  return { leveledUp: newLevel > oldLevel, newLevel, statPointsGained };
}

async function gainEnergy(ownerKey: string, amount: number, maxEnergy: number): Promise<void> {
  const current = await getEnergyFor(ownerKey);
  const next = Math.min(current + amount, maxEnergy);
  await db.update(schema.tenderResources)
    .set({ energy: next, updatedAt: new Date() })
    .where(eq(schema.tenderResources.ownerKey, ownerKey));
}

// Standalone game config loader (used by both handlers and internal functions)
async function loadGameConfig() {
  const rows = await db.select().from(schema.uiConfig);
  const overrides: Record<string, any> = {};
  for (const r of rows) {
    try { overrides[r.key] = JSON.parse(r.value); } catch {}
  }
  const buildings: Record<string, any> = {};
  for (const [type, def] of Object.entries(BUILDING_DEFS)) {
    buildings[type] = {
      ...def,
      cost: overrides[`building.${type}.cost`] ?? def.cost,
      buildMinutes: overrides[`building.${type}.buildMinutes`] ?? def.buildMinutes,
      enabled: overrides[`building.${type}.enabled`] ?? true,
    };
    if (type === "watchtower") {
      buildings[type].damage = overrides["building.watchtower.damage"] ?? 3;
      buildings[type].powerBonus = overrides["building.watchtower.powerBonus"] ?? 2;
      buildings[type].upkeepPerHour = overrides["building.watchtower.upkeepPerHour"] ?? 3;
    }
    if (type === "thorn-wall") {
      buildings[type].damage = overrides["building.thorn-wall.damage"] ?? 1;
    }
    if (type === "dream-wheat") {
      buildings[type].harvestEnergy = overrides["building.dream-wheat.harvestEnergy"] ?? 4;
    }
    if (type === "awakening-well" || type === "tree") {
      buildings[type].energyBonus = overrides[`building.${type}.energyBonus`] ?? (type === "tree" ? 1 : 3);
    }
  }
  const enemies: Record<string, any> = {};
  for (const name of ["fray", "unraveler", "hollow", "tangle"]) {
    enemies[name] = {
      power: overrides[`enemy.${name}.power`] ?? { fray: 2, unraveler: 4, hollow: 0, tangle: 3 }[name],
      hp: overrides[`enemy.${name}.hp`] ?? { fray: 3, unraveler: 6, hollow: 5, tangle: 8 }[name],
    };
  }
  const timers = {
    energyRegenMinutes: overrides["timer.energyRegenMinutes"] ?? 4,
    buildHelperDivisor: overrides["timer.buildHelperDivisor"] ?? 2,
    wheatWellSynergy: overrides["timer.wheatWellSynergy"] ?? 0.75,
  };
  return { buildings, enemies, timers };
}

// Single source of truth for building definitions
export const BUILDING_DEFS: Record<string, { name: string; cost: number; buildMinutes: number; desc: string; icon: string }> = {
  "watchtower": { name: "Watchtower", cost: 2, buildMinutes: 15, desc: "+2 power to defenders on tile and adjacent. 3 damage volley at battle start. 3⚡/hour upkeep.", icon: "🗼" },
  "dream-wheat": { name: "Dream Wheat", cost: 2, buildMinutes: 10, desc: "Grows in 4h. Harvest for +4 energy. Regrows automatically.", icon: "🌾" },
  "elemental-shrine": { name: "Elemental Shrine", cost: 2, buildMinutes: 15, desc: "+1 element power to adjacent births (24h).", icon: "⛩️" },
  "awakening-well": { name: "Awakening Well", cost: 2, buildMinutes: 20, desc: "+3 max energy. Dream Wheat adjacent grows 25% faster.", icon: "💧" },
  "thorn-wall": { name: "Thorn Wall", cost: 2, buildMinutes: 5, desc: "1 damage to every attacker. Permanent.", icon: "🌵" },
  "binding-circle": { name: "Binding Circle", cost: 2, buildMinutes: 10, desc: "+50% binding heal. Binding costs 1.", icon: "🔮" },
  "tree": { name: "Dream Tree", cost: 2, buildMinutes: 15, desc: "+1 max energy. Grows on stone/root/neutral/fire hexes.", icon: "🌳" },
};

export const handlers = {
  async getStudio(_args: unknown, ctx?: ActionContext) {
    // The Tender ritual's data: pool pieces, the Tender deck, credits.
    // Workshop pieces of the collection stay behind the workshop lock.
    return buildStudio(ctx, { tenderOnly: true });
  },

  async getWorkshopStudio(_args: unknown, ctx?: ActionContext) {
    // Everything, for the creator's eyes only. Gated by requireWorkshop in index.ts.
    return buildStudio(ctx);
  },

  async uploadLayerAsset(args: unknown) {
    const parsed = z.object({ category: layerCategorySchema, imageBase64: z.string().min(100).max(16_000_000), mimeType: z.literal("image/png") }).safeParse(args);
    if (!parsed.success) badRequest("Invalid upload request.");
    const { category, imageBase64, mimeType } = parsed.data;
    const bytes = Buffer.from(imageBase64, "base64");
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!signature.every((byte, index) => bytes[index] === byte) || bytes.length < 26) badRequest("That file is not a true PNG.");
    const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20);
    // Normalize uploads onto the shared 750×971 canvas. The artist's Procreate
    // exports are 2550×3300 (same aspect ratio); anything close to the template
    // ratio is resized with transparency preserved — never flattened, no
    // background fill. Anything else is rejected with the template message.
    const TEMPLATE_W = 750; const TEMPLATE_H = 971;
    let normalized = bytes;
    if (width !== TEMPLATE_W || height !== TEMPLATE_H) {
      const templateRatio = TEMPLATE_W / TEMPLATE_H;
      const ratioOk = Math.abs(width / height - templateRatio) / templateRatio <= 0.01;
      const sizeOk = width >= TEMPLATE_W && height >= TEMPLATE_H && Math.max(width, height) <= 4000;
      if (!ratioOk || !sizeOk) badRequest(`That PNG is ${width} × ${height}. Use the 750 × 971 template.`);
      // Lazy-load sharp: if its native binding ever fails in an environment,
      // only resizing breaks — the server still boots and 750×971 uploads work.
      const sharp = (await import("sharp")).default;
      normalized = await sharp(bytes).resize(TEMPLATE_W, TEMPLATE_H, { fit: "fill" }).png().toBuffer();
    }
    const existing = await db.select({ name: schema.layerAssets.name }).from(schema.layerAssets).where(eq(schema.layerAssets.category, category));
    const name = mysticalPieceName(category, new Set(existing.map((row) => row.name)));
    const blobKey = `layer-assets/${Date.now()}-${randomUUID()}.png`;
    const hasStats = statCategories.has(category);
    blobs.put(blobKey, normalized, mimeType);
    const rows = await db.insert(schema.layerAssets).values({ name, category, rarity: "common", power: hasStats ? 1 : null, toughness: hasStats ? 1 : null, imageBlobKey: blobKey, mimeType }).returning({ id: schema.layerAssets.id });
    const row = rows[0];
    if (!row) { blobs.delete(blobKey); badRequest("The drawing could not be added to the layer pool."); }
    return { id: (row as { id: number }).id, name };
  },

  async updateLayerAssetStats(args: unknown) {
    const parsed = z.object({ id: z.number().int().positive(), power: statSchema, toughness: statSchema }).safeParse(args);
    if (!parsed.success) badRequest("Invalid stats.");
    const rarity = rarityFromStats(parsed.data.power, parsed.data.toughness);
    await db.update(schema.layerAssets).set({ power: parsed.data.power, toughness: parsed.data.toughness, rarity }).where(eq(schema.layerAssets.id, parsed.data.id));
    return { ok: true as const, rarity };
  },

  async renameLayerAsset(args: unknown) {
    const parsed = z.object({ id: z.number().int().positive(), name: z.string().trim().min(2).max(60) }).safeParse(args);
    if (!parsed.success) badRequest("Invalid name.");
    await db.update(schema.layerAssets).set({ name: parsed.data.name }).where(eq(schema.layerAssets.id, parsed.data.id));
    return okResponse.parse({ ok: true });
  },

  async deleteLayerAsset(args: unknown) {
    const parsed = z.object({ id: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid id.");
    const rows = await db.select({ key: schema.layerAssets.imageBlobKey }).from(schema.layerAssets).where(eq(schema.layerAssets.id, parsed.data.id)).limit(1);
    await db.delete(schema.layerAssets).where(eq(schema.layerAssets.id, parsed.data.id));
    const key = rows[0]?.key; if (key) blobs.delete(key);
    return okResponse.parse({ ok: true });
  },

  async moveLayerAsset(args: unknown) {
    const parsed = z.object({ id: z.number().int().positive(), category: layerCategorySchema }).safeParse(args);
    if (!parsed.success) badRequest("Invalid move.");
    const rows = await db.select({ category: schema.layerAssets.category, power: schema.layerAssets.power, toughness: schema.layerAssets.toughness }).from(schema.layerAssets).where(eq(schema.layerAssets.id, parsed.data.id)).limit(1);
    const row = rows[0]; if (!row) badRequest("That piece is gone.");
    if (row.category === parsed.data.category) badRequest("It already rests in that pool.");
    // Stat-bearing pools (arms/body/head) carry power/toughness; background
    // and aura do not. Crossing that line resets or seeds the stats.
    const toStats = statCategories.has(parsed.data.category);
    const fromStats = statCategories.has(row.category as z.infer<typeof layerCategorySchema>);
    const power = toStats ? (fromStats ? row.power : 1) : null;
    const toughness = toStats ? (fromStats ? row.toughness : 1) : null;
    await db.update(schema.layerAssets).set({ category: parsed.data.category, power, toughness }).where(eq(schema.layerAssets.id, parsed.data.id));
    return okResponse.parse({ ok: true });
  },

  async saveAwoken(args: unknown, ctx?: ActionContext) {
    const parsed = z.object({ layers: z.array(layerRefShape).min(1).max(5), imageBase64: z.string().min(100).max(16_000_000), collection: collectionSchema, ownerName: z.string().trim().min(1).max(80) }).safeParse(args);
    if (!parsed.success) badRequest("Invalid awakening.");
    const { layers, imageBase64, collection } = parsed.data;
    // Tender wakes cost one credit; the workshop (Nigel's own hand) is free.
    // Tender wakes require a Tender account — the vessel belongs to someone.
    if (collection === "tender") {
      if (!ctx?.tender) {
        throw Object.assign(new Error("Claim your secret code to wake — the vessel belongs to a Tender."), { status: 403 });
      }
      const spent = await spendWakeCredit(tenderOwnerKey(ctx.tender.id));
      if (!spent.ok) {
        throw Object.assign(
          new Error(`The vessel is empty — ${formatUsd(PACK_PRICE_CENTS)} gathers ${CREDITS_PER_PACK} wakes.`),
          { status: 402 }
        );
      }
    }
    const plan = await planAwakening(layers);
    const blobKey = `awakened/${Date.now()}-${randomUUID()}.png`;
    const bytes = Buffer.from(imageBase64, "base64");
    blobs.put(blobKey, bytes, "image/png");
    const ownerName = collection === "tender" ? ownerNameFor(ctx) : parsed.data.ownerName;
    const ownerKey = collection === "tender" && ctx?.tender ? tenderOwnerKey(ctx.tender.id) : null;
    const rows = await db.insert(schema.awakened).values({ name: plan.name, imageBlobKey: blobKey, compositionJson: JSON.stringify(plan.canonicalLayers), collection, ownerName, ownerKey, identityKey: plan.identityKey, iteration: plan.previousCount, flavorText: plan.flavorText }).returning({ id: schema.awakened.id });
    const row = rows[0] as { id: number } | undefined;
    if (!row) { blobs.delete(blobKey); badRequest("This awakening could not be saved."); }
    // Grant birth energy if this is a tender's Awoken
    if (ownerKey && collection === "tender") {
      const power = plan.canonicalLayers.reduce((sum, l) => sum + (l.power ?? 0), 0);
      await grantBirthEnergy(ownerKey, power);
    }
    return { id: (row as { id: number }).id, name: plan.name, iteration: plan.previousCount, empowerment: plan.previousCount, flavor_text: plan.flavorText };
  },

  async renameAwoken(args: unknown) {
    const parsed = z.object({ id: z.number().int().positive(), name: z.string().trim().min(1).max(80) }).safeParse(args);
    if (!parsed.success) badRequest("Invalid name.");
    await db.update(schema.awakened).set({ name: parsed.data.name }).where(eq(schema.awakened.id, parsed.data.id));
    return okResponse.parse({ ok: true });
  },

  async deleteAwoken(args: unknown) {
    const parsed = z.object({ id: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid id.");
    const rows = await db.select({ key: schema.awakened.imageBlobKey }).from(schema.awakened).where(eq(schema.awakened.id, parsed.data.id)).limit(1);
    await db.delete(schema.awakened).where(eq(schema.awakened.id, parsed.data.id));
    const key = rows[0]?.key; if (key) blobs.delete(key);
    return okResponse.parse({ ok: true });
  },

  async shareStory(args: unknown, ctx?: ActionContext) {
    if (!ctx?.tender) badRequest("A Tender must share the story.");
    const parsed = z.object({ id: z.number().int().positive(), story: z.string().trim().min(100).max(2000) }).safeParse(args);
    if (!parsed.success) badRequest("A story is 100–2000 characters — a real telling, not a note.");
    const ownerKey = tenderOwnerKey(ctx.tender.id);
    const rows = await db.select().from(schema.awakened).where(eq(schema.awakened.id, parsed.data.id)).limit(1);
    const awoken = rows[0];
    if (!awoken) badRequest("That Awoken is not found.");
    if (awoken.ownerKey !== ownerKey) badRequest("You can only share stories of your own Awoken.");
    if ((awoken.storyCount ?? 0) >= 3) badRequest("This Awoken has already heard three stories — it is full.");
    await db.insert(schema.awokenStories).values({
      awakenedId: parsed.data.id, tenderId: ctx.tender.id, storyText: parsed.data.story, createdAt: new Date(),
    });
    await db.update(schema.awakened).set({ storyCount: (awoken.storyCount ?? 0) + 1 }).where(eq(schema.awakened.id, parsed.data.id));
    return okResponse.parse({ ok: true, storyCount: (awoken.storyCount ?? 0) + 1 });
  },

  // -- Self-serve Tender accounts -------------------------------------------
  async suggestTenderCode() {
    return { code: await suggestTenderCode() };
  },

  async claimTender(args: unknown, ctx?: ActionContext) {
    return claimTender(args, ctx?.visitorId ?? null);
  },

  async loginTender(args: unknown) {
    return loginTender(args);
  },

  async logoutTender(args: unknown, ctx?: ActionContext) {
    const token = (args as { token?: unknown } | null)?.token;
    await destroySession(token);
    return okResponse.parse({ ok: true });
  },

  async suggestTenderName() {
    return { name: newTenderNameSuggestion() };
  },

  async setTenderName(args: unknown, ctx?: ActionContext) {
    if (!ctx?.tender) throw Object.assign(new Error("Claim your secret code first."), { status: 403 });
    return setTenderName(ctx.tender.id, args);
  },

  // -- Workshop: the Tender leaderboard ------------------------------------
  // Nigel's private view of his Tenders, ranked by Awoken woken. Never
  // exposed publicly — Tenders never see each other's counts.
  async listTenders() {
    const tenderRows = await db.select().from(schema.tenders).orderBy(desc(schema.tenders.createdAt));
    const counts = await db
      .select({ ownerKey: schema.awakened.ownerKey, count: sql<number>`count(*)` })
      .from(schema.awakened)
      .where(isNotNull(schema.awakened.ownerKey))
      .groupBy(schema.awakened.ownerKey);
    const countByKey = new Map<string, number>();
    for (const row of counts) if (row.ownerKey) countByKey.set(row.ownerKey, row.count);
    const energyRows = await db.select().from(schema.tenderResources);
    const energyByKey = new Map<string, number>();
    for (const row of energyRows) energyByKey.set(row.ownerKey, row.energy);
    const tenders = tenderRows
      .map((t) => {
        const ownerKey = tenderOwnerKey(t.id);
        return {
          code: t.code,
          tenderName: t.tenderName,
          displayName: t.tenderName ?? t.code,
          createdAt: t.createdAt.toISOString(),
          awokenCount: countByKey.get(ownerKey) ?? 0,
          ownerKey,
          energy: energyByKey.get(ownerKey) ?? 5,
        };
      })
      .sort((a, b) => b.awokenCount - a.awokenCount || a.createdAt.localeCompare(b.createdAt));
    return { tenders };
  },

  // -- Tender decks ---------------------------------------------------------
  // Named gatherings of Awoken, each with a chosen face card. Decks belong
  // to one owner key (a Tender account, or a soft visitor). Deck operations
  // never touch the awakened rows themselves — only membership rows.
  async createDeck(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ name: z.string().trim().min(1).max(60) }).safeParse(args);
    if (!parsed.success) badRequest("Name your deck.");
    const rows = await db
      .insert(schema.decks)
      .values({ ownerKey, name: parsed.data.name })
      .returning({ id: schema.decks.id });
    const row = rows[0];
    if (!row) badRequest("The deck could not be gathered.");
    return { id: row.id, name: parsed.data.name, faceCardId: null as number | null, cardCount: 0 };
  },

  async listDecks(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const deckRows = await db
      .select()
      .from(schema.decks)
      .where(eq(schema.decks.ownerKey, ownerKey))
      .orderBy(asc(schema.decks.createdAt));
    const decks: { id: number; name: string; faceCardId: number | null; cardCount: number }[] = [];
    for (const deck of deckRows) {
      const count = await db
        .select({ n: sql<number>`count(*)` })
        .from(schema.deckCards)
        .where(eq(schema.deckCards.deckId, deck.id));
      decks.push({
        id: deck.id,
        name: deck.name,
        faceCardId: deck.faceCardId ?? null,
        cardCount: Number(count[0]?.n ?? 0),
      });
    }
    return { decks };
  },

  async renameDeck(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z
      .object({ id: z.number().int().positive(), name: z.string().trim().min(1).max(60) })
      .safeParse(args);
    if (!parsed.success) badRequest("Invalid rename.");
    await ownDeck(parsed.data.id, ownerKey);
    await db.update(schema.decks).set({ name: parsed.data.name }).where(eq(schema.decks.id, parsed.data.id));
    return okResponse.parse({ ok: true });
  },

  async deleteDeck(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ id: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid id.");
    await ownDeck(parsed.data.id, ownerKey);
    await db.delete(schema.deckCards).where(eq(schema.deckCards.deckId, parsed.data.id));
    await db.delete(schema.decks).where(eq(schema.decks.id, parsed.data.id));
    return okResponse.parse({ ok: true });
  },

  async addCardToDeck(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z
      .object({ deckId: z.number().int().positive(), awakenedId: z.number().int().positive() })
      .safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    await ownDeck(parsed.data.deckId, ownerKey);
    const rows = await db
      .select()
      .from(schema.awakened)
      .where(eq(schema.awakened.id, parsed.data.awakenedId))
      .limit(1);
    const awoken = rows[0];
    if (!awoken || !canTouchAwoken(awoken, ownerKey))
      badRequest("That Awoken does not belong to your collection.");
    await db
      .insert(schema.deckCards)
      .values({ deckId: parsed.data.deckId, awakenedId: parsed.data.awakenedId })
      .onConflictDoNothing();
    return okResponse.parse({ ok: true });
  },

  async removeCardFromDeck(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z
      .object({ deckId: z.number().int().positive(), awakenedId: z.number().int().positive() })
      .safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    const deck = await ownDeck(parsed.data.deckId, ownerKey);
    await db
      .delete(schema.deckCards)
      .where(
        and(
          eq(schema.deckCards.deckId, parsed.data.deckId),
          eq(schema.deckCards.awakenedId, parsed.data.awakenedId)
        )
      );
    if (deck.faceCardId === parsed.data.awakenedId) {
      await db.update(schema.decks).set({ faceCardId: null }).where(eq(schema.decks.id, deck.id));
    }
    return okResponse.parse({ ok: true });
  },

  async setDeckFace(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z
      .object({ deckId: z.number().int().positive(), awakenedId: z.number().int().positive() })
      .safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    await ownDeck(parsed.data.deckId, ownerKey);
    const ids = await deckCardIds(parsed.data.deckId);
    if (!ids.includes(parsed.data.awakenedId)) badRequest("The face must be one of the deck's own.");
    await db
      .update(schema.decks)
      .set({ faceCardId: parsed.data.awakenedId })
      .where(eq(schema.decks.id, parsed.data.deckId));
    return okResponse.parse({ ok: true });
  },

  async getDeckCards(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ deckId: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid id.");
    const deck = await ownDeck(parsed.data.deckId, ownerKey);
    const cardIds = await deckCardIds(deck.id);
    return {
      deck: { id: deck.id, name: deck.name, faceCardId: deck.faceCardId ?? null },
      cardIds,
    };
  },

  async grantEnergy(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ amount: z.number().int().min(1).max(10) }).safeParse(args);
    if (!parsed.success) badRequest("Invalid amount.");
    const energyRes = await this.getEnergy({}, ctx);
    await gainEnergy(ownerKey, parsed.data.amount, energyRes.maxEnergy);
    return { ok: true };
  },

  async claimBonusTile(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ tileId: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid tile.");
    const tile = await db.select().from(schema.territoryTiles)
      .where(and(
        eq(schema.territoryTiles.id, parsed.data.tileId),
        eq(schema.territoryTiles.ownerKey, ownerKey),
        eq(schema.territoryTiles.cursed, 1)
      )).limit(1);
    if (!tile.length) badRequest("That tile is not available.");
    // Must be adjacent to purified territory
    const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    const neighbors = await db.select().from(schema.territoryTiles)
      .where(and(
        eq(schema.territoryTiles.ownerKey, ownerKey),
        eq(schema.territoryTiles.cursed, 0)
      ));
    const purified = new Set(neighbors.map(t => `${t.q},${t.r}`));
    const adjacent = dirs.some(([dq, dr]) => purified.has(`${tile[0].q + dq},${tile[0].r + dr}`));
    if (!adjacent) badRequest("Must be adjacent to your territory.");
    await db.update(schema.territoryTiles)
      .set({ cursed: 0, element: "neutral", curseHp: null, curseMaxHp: null })
      .where(eq(schema.territoryTiles.id, tile[0].id));
    await expandFrontier(ownerKey, tile[0].q, tile[0].r);
    return { ok: true };
  },

  async assignStatPoint(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      awakenedId: z.number().int().positive(),
      stat: z.enum(["power", "toughness"]),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    const rows = await db.select().from(schema.awakened)
      .where(and(
        eq(schema.awakened.id, parsed.data.awakenedId),
        eq(schema.awakened.ownerKey, ownerKey)
      )).limit(1);
    if (!rows.length) badRequest("That Awoken is not yours.");
    if ((rows[0].statPoints ?? 0) < 1) badRequest("No stat points available.");
    const update = parsed.data.stat === "power"
      ? { bonusPower: (rows[0].bonusPower ?? 0) + 1 }
      : { bonusToughness: (rows[0].bonusToughness ?? 0) + 1 };
    await db.update(schema.awakened)
      .set({ ...update, statPoints: (rows[0].statPoints ?? 1) - 1 })
      .where(eq(schema.awakened.id, parsed.data.awakenedId));
    return { ok: true };
  },

  async getTerritory(_args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const tiles = await db.select().from(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
    const placements = await db.select().from(schema.fieldPlacements).where(eq(schema.fieldPlacements.ownerKey, ownerKey));
    
    // Binding upkeep: 3 energy per hour per binder. Unpaid binding drops to defense.
    const now = Date.now();
    const BINDING_PER_HOUR = 3;
    for (const p of placements) {
      if (p.stance !== "binding") continue;
      const lastCharge = p.lastBindingChargeAt ? new Date(p.lastBindingChargeAt).getTime() : new Date(p.placedAt).getTime();
      const hoursElapsed = (now - lastCharge) / (60 * 60 * 1000);
      if (hoursElapsed >= 1) {
        const hoursToCharge = Math.floor(hoursElapsed);
        const cost = hoursToCharge * BINDING_PER_HOUR;
        if (await spendEnergy(ownerKey, cost)) {
          await db.update(schema.fieldPlacements)
            .set({ lastBindingChargeAt: new Date() })
            .where(eq(schema.fieldPlacements.id, p.id));
          p.lastBindingChargeAt = new Date() as any;
        } else {
          // Can't pay — binding drops
          await db.update(schema.fieldPlacements)
            .set({ stance: "defense", lastBindingChargeAt: null })
            .where(eq(schema.fieldPlacements.id, p.id));
          p.stance = "defense";
        }
      }
    }
    
    // Process attunement: Awoken present for 13+ minutes attune neutral tiles to their dominant element
    const ATTUNE_MS = 13 * 60 * 1000;
    for (const p of placements) {
      const placedAt = new Date(p.placedAt).getTime();
      if (now - placedAt < ATTUNE_MS) continue;
      
      const tile = tiles.find(t => t.id === p.tileId);
      if (!tile || tile.cursed || tile.element !== "neutral") continue;
      
      // Get Awoken's dominant element from composition
      const aw = await db.select().from(schema.awakened)
        .where(eq(schema.awakened.id, p.awakenedId)).limit(1);
      if (!aw.length) continue;
      
      try {
        const comp = JSON.parse(aw[0].compositionJson || "[]");
        const counts: Record<string, number> = { tide: 0, sky: 0, stone: 0, root: 0, fire: 0 };
        for (const layer of comp) {
          const name = (layer.name || "").toLowerCase();
          let el = "root";
          if (/fire|ember|flame|ash|inferno/.test(name)) el = "fire";
          else if (/tide|water|current|pool|pond|rain|moonwater/.test(name)) el = "tide";
          else if (/mountain|monolith|stone|rock|crystal/.test(name)) el = "stone";
          else if (/sky|bird|moon|star|lantern|upward|weather|bell/.test(name)) el = "sky";
          counts[el]++;
        }
        let best = "root", max = -1;
        for (const [el, n] of Object.entries(counts)) {
          if (n > max) { max = n; best = el; }
        }
        // Attune the tile
        await db.update(schema.territoryTiles)
          .set({ element: best as any })
          .where(eq(schema.territoryTiles.id, tile.id));
        tile.element = best as any;
      } catch (e) {
        // Skip on parse error
      }
    }
    
    return { tiles, placements };
  },

  async deployAwoken(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ awakenedId: z.number().int().positive(), tileId: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid deploy request.");
    // Verify the Tender owns this Awoken and it is not already placed.
    const owned = await db.select({ id: schema.awakened.id }).from(schema.awakened)
      .where(and(eq(schema.awakened.id, parsed.data.awakenedId), eq(schema.awakened.ownerKey, ownerKey))).limit(1);
    if (!owned.length) badRequest("That Awoken is not yours.");
    const already = await db.select({ id: schema.fieldPlacements.id }).from(schema.fieldPlacements)
      .where(and(eq(schema.fieldPlacements.awakenedId, parsed.data.awakenedId), eq(schema.fieldPlacements.ownerKey, ownerKey))).limit(1);
    if (already.length) badRequest("Already on the field.");
    // Verify the tile belongs to the Tender and is not cursed.
    const tile = await db.select().from(schema.territoryTiles)
      .where(and(eq(schema.territoryTiles.id, parsed.data.tileId), eq(schema.territoryTiles.ownerKey, ownerKey))).limit(1);
    if (!tile.length) badRequest("That tile is not yours.");
    if (tile[0].cursed) badRequest("Cannot deploy on cursed land.");
    const occupied = await db.select({ id: schema.fieldPlacements.id }).from(schema.fieldPlacements)
      .where(eq(schema.fieldPlacements.tileId, parsed.data.tileId));
    if (occupied.length >= 4) badRequest("Tile holds at most 4 Awoken.");
    await db.insert(schema.fieldPlacements).values({
      ownerKey, awakenedId: parsed.data.awakenedId, tileId: parsed.data.tileId,
    });
    return okResponse.parse({ ok: true });
  },

  /**
   * Battle deployment: send 1-4 Awoken from the battle pool to a tile.
   * If the tile is cursed and the combined power on it meets the curse weight,
   * the dark breaks — the tile purifies, takes the attackers' dominant element,
   * and neighboring cursed tiles start their 48h passive timers.
   */
  async deployBattle(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      awakenedIds: z.array(z.number().int().positive()).min(1).max(4),
      tileId: z.number().int().positive(),
      energyCost: z.number().int().min(0),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid battle deployment.");
    // Server-authoritative energy check.
    if (!(await spendEnergy(ownerKey, parsed.data.energyCost))) {
      badRequest("Not enough energy.");
    }
    if (new Set(parsed.data.awakenedIds).size !== parsed.data.awakenedIds.length) {
      badRequest("Each Awoken fights once.");
    }
    const tile = await db.select().from(schema.territoryTiles)
      .where(and(eq(schema.territoryTiles.id, parsed.data.tileId), eq(schema.territoryTiles.ownerKey, ownerKey))).limit(1);
    if (!tile.length) badRequest("That tile is not yours.");
    const owned = await db.select().from(schema.awakened)
      .where(
        and(
          eq(schema.awakened.collection, "tender"),
          or(eq(schema.awakened.ownerKey, ownerKey), isNull(schema.awakened.ownerKey))
        )
      );
    const fighters = owned.filter(a => parsed.data.awakenedIds.includes(a.id));
    if (fighters.length !== parsed.data.awakenedIds.length) badRequest("Those Awoken are not all yours.");
    const placedIds = new Set((await db.select({ awakenedId: schema.fieldPlacements.awakenedId })
      .from(schema.fieldPlacements)
      .where(eq(schema.fieldPlacements.ownerKey, ownerKey))).map(p => p.awakenedId));
    for (const f of fighters) {
      if (!canTouchAwoken(f, ownerKey)) badRequest("That Awoken is not yours to send.");
      if (placedIds.has(f.id)) badRequest("Already on the field.");
    }
    const occupied = await db.select({ id: schema.fieldPlacements.id }).from(schema.fieldPlacements)
      .where(eq(schema.fieldPlacements.tileId, parsed.data.tileId));
    if (occupied.length + fighters.length > 4) badRequest("Tile holds at most 4 Awoken.");
    for (const f of fighters) {
      await db.insert(schema.fieldPlacements).values({
        ownerKey, awakenedId: f.id, tileId: parsed.data.tileId,
      });
    }
    let purified = false;
    if (tile[0].cursed) {
      const assetRows = await db.select().from(schema.layerAssets);
      const assetStats = new Map<number, AssetStats>();
      for (const assetRow of assetRows) {
        const rarity = raritySchema.safeParse(assetRow.rarity);
        if (rarity.success) assetStats.set(assetRow.id, { name: assetRow.name, rarity: rarity.data, power: assetRow.power, toughness: assetRow.toughness });
      }
      const allOnTile = await db.select({ awakenedId: schema.fieldPlacements.awakenedId })
        .from(schema.fieldPlacements)
        .where(eq(schema.fieldPlacements.tileId, parsed.data.tileId));
      let totalPower = 0;
      const elementCounts: Record<"tide" | "sky" | "stone" | "root", number> = { tide: 0, sky: 0, stone: 0, root: 0 };
      const weight = corruptionToughness(tile[0].q, tile[0].r);
      for (const p of allOnTile) {
        const a = owned.find(o => o.id === p.awakenedId);
        if (!a) continue;
        const layers = parseLayers(a.compositionJson, assetStats);
        totalPower += layers.reduce((s, l) => s + (l.power ?? 0), 0);
        for (const layer of layers) {
          const el = elementForPieceName(layer.name);
          if (el !== "fire") elementCounts[el] += 1;
        }
      }
      // Binding stance: binders channel +3 to their tile, +1 to neighbors.
      // (Defense does not aid purification — it holds purified land.)
      const bindBonus = await bindingBonuses(ownerKey);
      totalPower += bindBonus.get(tile[0].id) ?? 0;
      if (totalPower >= weight) {
        let element: "tide" | "sky" | "stone" | "root" | "neutral" = "neutral";
        let maxCount = 0; let tie = false;
        for (const [el, count] of Object.entries(elementCounts)) {
          if (count > maxCount) { maxCount = count; element = el as typeof element; tie = false; }
          else if (count === maxCount && count > 0) { tie = true; }
        }
        if (tie) element = "neutral";
        await db.update(schema.territoryTiles)
          .set({ cursed: 0, element })
          .where(eq(schema.territoryTiles.id, tile[0].id));
        const now = new Date();
        const neighborCoords = [
          [tile[0].q + 1, tile[0].r], [tile[0].q - 1, tile[0].r],
          [tile[0].q, tile[0].r + 1], [tile[0].q, tile[0].r - 1],
          [tile[0].q + 1, tile[0].r - 1], [tile[0].q - 1, tile[0].r + 1],
        ];
        for (const [nq, nr] of neighborCoords) {
          await db.update(schema.territoryTiles)
            .set({ lastPassiveAt: now })
            .where(and(
              eq(schema.territoryTiles.ownerKey, ownerKey),
              eq(schema.territoryTiles.q, nq),
              eq(schema.territoryTiles.r, nr),
              eq(schema.territoryTiles.cursed, 1),
            ));
        }
        purified = true;
        // The frontier pushes outward — new wilds to purify.
        await expandFrontier(ownerKey, tile[0].q, tile[0].r);
      }
    }
    return z.object({ ok: z.literal(true), purified: z.boolean() }).parse({ ok: true, purified });
  },



  async moveAwoken(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      awakenedId: z.number().int().positive(),
      tileId: z.number().int().positive(),
      energyCost: z.number().int().min(1).max(4),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid move.");
    if (!(await spendEnergy(ownerKey, parsed.data.energyCost))) {
      badRequest("Not enough energy.");
    }
    // The Awoken must be on the field.
    const placement = await db.select().from(schema.fieldPlacements)
      .where(and(
        eq(schema.fieldPlacements.awakenedId, parsed.data.awakenedId),
        eq(schema.fieldPlacements.ownerKey, ownerKey)
      )).limit(1);
    if (!placement.length) badRequest("That Awoken is not on your field.");
    // Target must be a purified tile owned by the Tender.
    const tile = await db.select().from(schema.territoryTiles)
      .where(and(
        eq(schema.territoryTiles.id, parsed.data.tileId),
        eq(schema.territoryTiles.ownerKey, ownerKey)
      )).limit(1);
    if (!tile.length) badRequest("That tile is not yours.");
    if (tile[0].cursed) badRequest("Cannot move onto cursed land — attack it first.");
    // Must be adjacent.
    const fromTile = await db.select().from(schema.territoryTiles)
      .where(eq(schema.territoryTiles.id, placement[0].tileId)).limit(1);
    if (!fromTile.length) badRequest("Mover has no ground.");
    const dq = Math.abs(tile[0].q - fromTile[0].q);
    const dr = Math.abs(tile[0].r - fromTile[0].r);
    const dist = Math.max(dq, dr, Math.abs((tile[0].q + tile[0].r) - (fromTile[0].q + fromTile[0].r)));
    if (dist !== 1) badRequest("Can only move to adjacent tiles.");
    // Tile capacity: max 4.
    const occupied = await db.select({ id: schema.fieldPlacements.id })
      .from(schema.fieldPlacements)
      .where(eq(schema.fieldPlacements.tileId, parsed.data.tileId));
    if (occupied.length >= 4) badRequest("Tile holds at most 4 Awoken.");
    // No timer — movement costs energy instead. Client enforces the cost.
    await db.update(schema.fieldPlacements)
      .set({ tileId: tile[0].id, lastMovedAt: new Date() })
      .where(eq(schema.fieldPlacements.id, placement[0].id));
    return z.object({ ok: z.literal(true) }).parse({ ok: true });
  },


  async getWave(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    let state = await db.select().from(schema.waveState)
      .where(eq(schema.waveState.ownerKey, ownerKey)).limit(1);
    if (!state.length) {
      const [row] = await db.insert(schema.waveState).values({ ownerKey }).returning();
      state = [row];
    }
    const wave = state[0].waveNumber;
    // First wave is 5. Waves build 3x slower: +2 power every 3 waves.
    // Composition: Unravelers (power 4) every 3rd wave, Fray (power 1) make up the rest.
    const unravelers = Math.floor(wave / 3);
    const totalPower = 5 + Math.floor((wave - 1) / 3) * 2 + unravelers * 4;
    const frayCount = totalPower - unravelers * 4;
    return {
      waveNumber: wave,
      wavesDefeated: state[0].wavesDefeated,
      frayCount, unravelers,
      totalPower,
    };
  },

  async defendWave(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    let state = await db.select().from(schema.waveState)
      .where(eq(schema.waveState.ownerKey, ownerKey)).limit(1);
    if (!state.length) {
      const [row] = await db.insert(schema.waveState).values({ ownerKey }).returning();
      state = [row];
    }
    const wave = state[0].waveNumber;
    const unravelers = Math.floor(wave / 3);
    const wavePower = 7 + (wave - 1) * 2 + unravelers * 4;

    // Defense: Awoken on the bastion (center tile) in defense stance.
    // The center is the last bastion — it never falls.
    const center = await db.select().from(schema.territoryTiles)
      .where(and(
        eq(schema.territoryTiles.ownerKey, ownerKey),
        eq(schema.territoryTiles.q, 0),
        eq(schema.territoryTiles.r, 0)
      )).limit(1);
    if (!center.length) badRequest("No bastion found.");

    const defenders = await db.select().from(schema.fieldPlacements)
      .where(and(
        eq(schema.fieldPlacements.ownerKey, ownerKey),
        eq(schema.fieldPlacements.tileId, center[0].id),
        eq(schema.fieldPlacements.stance, "defense")
      ));

    const owned = await db.select().from(schema.awakened)
      .where(and(
        eq(schema.awakened.collection, "tender"),
        or(eq(schema.awakened.ownerKey, ownerKey), isNull(schema.awakened.ownerKey))
      ));
    const assetRows = await db.select().from(schema.layerAssets);
    const assetStats = new Map<number, AssetStats>();
    for (const assetRow of assetRows) {
      const rarity = raritySchema.safeParse(assetRow.rarity);
      if (rarity.success) assetStats.set(assetRow.id, { name: assetRow.name, rarity: rarity.data, power: assetRow.power, toughness: assetRow.toughness });
    }

    let defensePower = 0;
    for (const d of defenders) {
      const a = owned.find(o => o.id === d.awakenedId);
      if (!a) continue;
      const layers = parseLayers(a.compositionJson, assetStats);
      // Full power: layers + empowerment + stories (same as client)
      const identity = a.identityKey === "legacy" ? identityFor(layers) : a.identityKey;
      const allRows = await db.select().from(schema.awakened);
      const idsByIdentity = new Map<string, number[]>();
      for (const other of allRows) {
        const otherLayers = parseLayers(other.compositionJson, assetStats);
        const otherIdentity = other.identityKey === "legacy" ? identityFor(otherLayers) : other.identityKey;
        idsByIdentity.set(otherIdentity, [...(idsByIdentity.get(otherIdentity) ?? []), other.id].sort((a, b) => a - b));
      }
      defensePower += toAwakenedPayload(a, layers, identity, idsByIdentity).power;
      defensePower += 2; // Defense stance bonus
    }

    const victory = defensePower >= wavePower;

    if (victory) {
      // Purify one adjacent cursed tile (player's choice comes later — auto for now).
      const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
      for (const [dq, dr] of dirs) {
        const target = await db.select().from(schema.territoryTiles)
          .where(and(
            eq(schema.territoryTiles.ownerKey, ownerKey),
            eq(schema.territoryTiles.q, dq),
            eq(schema.territoryTiles.r, dr),
            eq(schema.territoryTiles.cursed, 1)
          )).limit(1);
        if (target.length) {
          await db.update(schema.territoryTiles)
            .set({ cursed: 0, element: "neutral" })
            .where(eq(schema.territoryTiles.id, target[0].id));
          await expandFrontier(ownerKey, dq, dr);
          break;
        }
      }
      await db.update(schema.waveState)
        .set({
          waveNumber: wave + 1,
          wavesDefeated: state[0].wavesDefeated + 1,
          lastWaveAt: new Date(),
        })
        .where(eq(schema.waveState.ownerKey, ownerKey));
    } else {
      // Defeat: a random purified border tile becomes cursed.
      // The bastion never falls. Tiles held by binding Awoken are protected.
      const purified = await db.select().from(schema.territoryTiles)
        .where(and(
          eq(schema.territoryTiles.ownerKey, ownerKey),
          eq(schema.territoryTiles.cursed, 0)
        ));
      const binders = await db.select({ tileId: schema.fieldPlacements.tileId })
        .from(schema.fieldPlacements)
        .where(and(
          eq(schema.fieldPlacements.ownerKey, ownerKey),
          eq(schema.fieldPlacements.stance, "binding")
        ));
      const protectedIds = new Set(binders.map(b => b.tileId));
      const border = purified.filter(t =>
        !(t.q === 0 && t.r === 0) && !protectedIds.has(t.id)
      );
      if (border.length) {
        const victim = border[Math.floor(Math.random() * border.length)];
        // The tile falls: Awoken on it disperse into time (4h re-coalescence).
        // The land reverts to cursed, as it was before.
        const victims = await db.select({ awakenedId: schema.fieldPlacements.awakenedId })
          .from(schema.fieldPlacements)
          .where(eq(schema.fieldPlacements.tileId, victim.id));
        const dispersedUntil = new Date(Date.now() + 4 * 60 * 60 * 1000);
        for (const v of victims) {
          await db.update(schema.awakened)
            .set({ dispersedUntil })
            .where(eq(schema.awakened.id, v.awakenedId));
          await db.delete(schema.fieldPlacements)
            .where(eq(schema.fieldPlacements.awakenedId, v.awakenedId));
        }
        await db.update(schema.territoryTiles)
          .set({ cursed: 1 })
          .where(eq(schema.territoryTiles.id, victim.id));
      }
      // Wave number stays — you face it again.
      await db.update(schema.waveState)
        .set({ lastWaveAt: new Date() })
        .where(eq(schema.waveState.ownerKey, ownerKey));
    }

    return { victory, wavePower, defensePower, waveNumber: victory ? wave + 1 : wave };
  },


  async getEnergy(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    let res = await db.select().from(schema.tenderResources)
      .where(eq(schema.tenderResources.ownerKey, ownerKey)).limit(1);
    if (!res.length) {
      const [row] = await db.insert(schema.tenderResources).values({ ownerKey, energy: 10 }).returning();
      res = [row];
    }
    const maxEnergy = await calculateMaxEnergy(ownerKey);
    let energy = res[0].energy;
    const updatedAt = res[0].updatedAt ? new Date(res[0].updatedAt).getTime() : Date.now();
    const lastSeen = res[0].lastSeenAt ? new Date(res[0].lastSeenAt).getTime() : 0;
    const now = Date.now();
    // Online detection: if last seen within 5 min, Tender is online
    // Online: 4 min per energy (1/3 of 12 min). Offline: 12 min per energy.
    const isOnline = (now - lastSeen) < 5 * 60 * 1000;
    const regenMinutes = isOnline ? 4 : 12;
    const elapsedMin = (now - updatedAt) / (1000 * 60);
    const regen = Math.floor(elapsedMin / regenMinutes);
    if (regen > 0 && energy < maxEnergy) {
      energy = Math.min(energy + regen, maxEnergy);
      await db.update(schema.tenderResources)
        .set({ energy, updatedAt: new Date(), lastSeenAt: new Date() })
        .where(eq(schema.tenderResources.ownerKey, ownerKey));
    } else {
      // Update lastSeen even if no regen
      await db.update(schema.tenderResources)
        .set({ lastSeenAt: new Date() })
        .where(eq(schema.tenderResources.ownerKey, ownerKey));
    }
    if (energy > maxEnergy) {
      // Clamp to max (in case max decreased)
      await db.update(schema.tenderResources)
        .set({ energy: maxEnergy })
        .where(eq(schema.tenderResources.ownerKey, ownerKey));
      energy = maxEnergy;
    }
    return { energy, maxEnergy };
  },

  // Admin: reset a tender's territory, field, waves, and timers. Keeps their Awoken.
  async adminResetTender(args: unknown, ctx?: ActionContext) {
    // TODO: verify admin workshop password
    const parsed = z.object({ ownerKey: z.string() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid reset.");
    const targetKey = parsed.data.ownerKey;
    // Clear field placements
    await db.delete(schema.fieldPlacements).where(eq(schema.fieldPlacements.ownerKey, targetKey));
    // Clear territory tiles
    await db.delete(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, targetKey));
    // Clear dispersed (return Awoken from time)
    await db.update(schema.awakened)
      .set({ dispersedUntil: null })
      .where(eq(schema.awakened.ownerKey, targetKey));
    // Reset waves
    await db.delete(schema.waveState).where(eq(schema.waveState.ownerKey, targetKey));
    // Reset energy to 5
    await db.insert(schema.tenderResources)
      .values({ ownerKey: targetKey, energy: 5 })
      .onConflictDoUpdate({ target: schema.tenderResources.ownerKey, set: { energy: 5 } });
    // Re-create the bastion: center purified + 6 cursed ring
    const now = new Date();
    await db.insert(schema.territoryTiles).values({
      ownerKey: targetKey, q: 0, r: 0, element: "neutral", cursed: 0, createdAt: now,
    });
    for (const [dq, dr] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) {
      await db.insert(schema.territoryTiles).values({
        ownerKey: targetKey, q: dq, r: dr, element: "neutral", cursed: 1, createdAt: now,
      });
    }
    return { ok: true };
  },

  // Admin: set a tender's energy.
  async adminRefillAllEnergy(args: unknown, ctx?: ActionContext) {
    // TODO: verify admin workshop password
    // One-time: set all tenders to their calculated max energy
    const tenders = await db.select().from(schema.tenders);
    let count = 0;
    for (const t of tenders) {
      const ownerKey = tenderOwnerKey(t.id);
      const maxEnergy = await calculateMaxEnergy(ownerKey);
      await db.insert(schema.tenderResources)
        .values({ ownerKey, energy: maxEnergy, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: schema.tenderResources.ownerKey,
          set: { energy: maxEnergy, updatedAt: new Date() }
        });
      count++;
    }
    return { ok: true, refilled: count };
  },

  async adminSetEnergy(args: unknown, ctx?: ActionContext) {
    // TODO: verify admin workshop password
    const parsed = z.object({ ownerKey: z.string() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    // Refill to the tender's calculated max (not flat 50)
    const maxEnergy = await calculateMaxEnergy(parsed.data.ownerKey);
    await db.insert(schema.tenderResources)
      .values({ ownerKey: parsed.data.ownerKey, energy: maxEnergy })
      .onConflictDoUpdate({ target: schema.tenderResources.ownerKey, set: { energy: maxEnergy } });
    return { ok: true, energy: maxEnergy };
  },

  // Admin: set wave number for a tender (or reset to 1)
  async adminSetWave(args: unknown, ctx?: ActionContext) {
    const parsed = z.object({ 
      ownerKey: z.string(),
      waveNumber: z.number().int().min(1),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    const targetKey = parsed.data.ownerKey;
    await db.insert(schema.waveState)
      .values({ ownerKey: targetKey, waveNumber: parsed.data.waveNumber, wavesDefeated: 0 })
      .onConflictDoUpdate({ 
        target: schema.waveState.ownerKey, 
        set: { waveNumber: parsed.data.waveNumber, wavesDefeated: 0 } 
      });
    return { ok: true, waveNumber: parsed.data.waveNumber };
  },

  // Admin: get tender's deck (field + hand)
  async adminGetTenderDeck(args: unknown, ctx?: ActionContext) {
    const parsed = z.object({ ownerKey: z.string() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    const targetKey = parsed.data.ownerKey;
    // Field placements
    const placements = await db.select().from(schema.fieldPlacements)
      .where(eq(schema.fieldPlacements.ownerKey, targetKey));
    const fieldIds = new Set(placements.map(p => p.awakenedId));
    // All Awoken
    const allAwoken = await db.select().from(schema.awakened)
      .where(eq(schema.awakened.ownerKey, targetKey));
    const field = allAwoken.filter(a => fieldIds.has(a.id));
    const hand = allAwoken.filter(a => !fieldIds.has(a.id));
    // Get wave number
    const waveState = await db.select().from(schema.waveState)
      .where(eq(schema.waveState.ownerKey, targetKey)).limit(1);
    return { 
      ok: true, 
      field, 
      hand,
      waveNumber: waveState.length ? waveState[0].waveNumber : 1,
    };
  },

  // Admin: clear all timers (dispersed, passive, etc.) for a tender.
  getBuildingDefs() {
    return {
      defs: Object.entries(BUILDING_DEFS).map(([type, d]) => ({ type, ...d })),
    };
  },

  async getBuildings(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const buildings = await db.select().from(schema.territoryBuildings)
      .where(eq(schema.territoryBuildings.ownerKey, ownerKey));
    const now = Date.now();
    const gameConfig = await loadGameConfig();
    const upkeepCost = gameConfig.buildings["watchtower"]?.upkeepPerHour ?? 3;
    const upkeepMs = 60 * 60 * 1000;
    for (const b of buildings) {
      // Building completed -> active
      if (b.status === "building" && b.readyAt && new Date(b.readyAt).getTime() <= now) {
        await db.update(schema.territoryBuildings)
          .set({ status: "active", lastUpkeepAt: new Date() })
          .where(eq(schema.territoryBuildings.id, b.id));
        b.status = "active";
        b.lastUpkeepAt = new Date();
        // Builders return to their previous stance
        if (b.builderStances) {
          try {
            const memories = JSON.parse(b.builderStances) as { placementId: number; stance: string }[];
            for (const m of memories) {
              await db.update(schema.fieldPlacements)
                .set({ stance: m.stance })
                .where(eq(schema.fieldPlacements.id, m.placementId));
            }
          } catch {}
        }
      }
      // Watchtower upkeep: 3 energy/hour or goes dormant
      if (b.buildingType === "watchtower" && (b.status === "active" || b.status === "dormant")) {
        const lastUpkeep = b.lastUpkeepAt ? new Date(b.lastUpkeepAt).getTime() : now;
        if (now - lastUpkeep >= upkeepMs) {
          const res = await db.select().from(schema.tenderResources)
            .where(eq(schema.tenderResources.ownerKey, ownerKey)).limit(1);
          const energy = res.length ? res[0].energy : 0;
          if (energy >= upkeepCost) {
            await db.update(schema.tenderResources)
              .set({ energy: energy - upkeepCost })
              .where(eq(schema.tenderResources.ownerKey, ownerKey));
            await db.update(schema.territoryBuildings)
              .set({ status: "active", lastUpkeepAt: new Date() })
              .where(eq(schema.territoryBuildings.id, b.id));
            b.status = "active";
            b.lastUpkeepAt = new Date();
          } else if (b.status === "active") {
            await db.update(schema.territoryBuildings)
              .set({ status: "dormant" })
              .where(eq(schema.territoryBuildings.id, b.id));
            b.status = "dormant";
          }
        }
      }
    }
    return { buildings };
  },

  async placeBuilding(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      tileId: z.number().int(),
      buildingType: z.string(),
      element: z.string().optional(),
      builderIds: z.array(z.number().int()).optional(),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    const gameConfig = await loadGameConfig();
    const def = gameConfig.buildings[parsed.data.buildingType];
    if (!def) badRequest("Unknown building.");
    if (!def.enabled) badRequest("Building disabled.");
    // Builders: manually selected Awoken from the tile (any stance -> building)
    // Each builder exponentially reduces build time: time / 2^builders
    const builderIds = parsed.data.builderIds || [];
    const helpers = builderIds.length ? await db.select().from(schema.fieldPlacements)
      .where(and(
        eq(schema.fieldPlacements.ownerKey, ownerKey),
        eq(schema.fieldPlacements.tileId, parsed.data.tileId),
      )) : [];
    const validHelpers = helpers.filter(h => builderIds.includes(h.awakenedId));
    const helperCount = validHelpers.length;
    const timeDivisor = Math.pow(gameConfig.timers.buildHelperDivisor, helperCount);
    const tile = await db.select().from(schema.territoryTiles)
      .where(and(
        eq(schema.territoryTiles.id, parsed.data.tileId),
        eq(schema.territoryTiles.ownerKey, ownerKey),
        eq(schema.territoryTiles.cursed, 0)
      )).limit(1);
    if (!tile.length) badRequest("Tile must be purified.");
    // Trees cannot grow on sky or water (tide) hexes
    if (parsed.data.buildingType === "tree" && (tile[0].element === "sky" || tile[0].element === "tide")) {
      badRequest("Trees cannot grow on sky or water.");
    }
    // Dream Wheat synergy: 25% faster if Awakening Well on same or adjacent hex
    let synergyMultiplier = 1;
    if (parsed.data.buildingType === "dream-wheat") {
      const tileData = tile[0];
      const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
      const checkTiles = [{ q: tileData.q, r: tileData.r }];
      for (const [dq, dr] of dirs) {
        checkTiles.push({ q: tileData.q + dq, r: tileData.r + dr });
      }
      const nearbyTiles = await db.select().from(schema.territoryTiles)
        .where(eq(schema.territoryTiles.ownerKey, ownerKey));
      const nearbyIds = new Set(
        nearbyTiles.filter(t => checkTiles.some(ct => ct.q === t.q && ct.r === t.r)).map(t => t.id)
      );
      const wells = await db.select().from(schema.territoryBuildings)
        .where(and(
          eq(schema.territoryBuildings.ownerKey, ownerKey),
          eq(schema.territoryBuildings.buildingType, "awakening-well"),
          eq(schema.territoryBuildings.status, "active"),
        ));
      if (wells.some(w => nearbyIds.has(w.tileId))) {
        synergyMultiplier = gameConfig.timers.wheatWellSynergy;
      }
    }
    // Max 2 buildings per hex
    const existing = await db.select().from(schema.territoryBuildings)
      .where(and(
        eq(schema.territoryBuildings.ownerKey, ownerKey),
        eq(schema.territoryBuildings.tileId, parsed.data.tileId)
      ));
    if (existing.length >= 2) badRequest("Max 2 buildings per hex.");
    const actualBuildMinutes = Math.max(1, Math.floor(def.buildMinutes * synergyMultiplier / timeDivisor));
    const energyRes = await this.getEnergy({}, ctx);
    if (energyRes.energy < def.cost) badRequest("Not enough energy.");
    await db.update(schema.tenderResources)
      .set({ energy: energyRes.energy - def.cost })
      .where(eq(schema.tenderResources.ownerKey, ownerKey));
    const readyAt = new Date(Date.now() + actualBuildMinutes * 60 * 1000);
    // Builders enter build mode - remember their previous stance
    const stanceMemory: { placementId: number; stance: string }[] = [];
    for (const h of validHelpers) {
      stanceMemory.push({ placementId: h.id, stance: h.stance });
      await db.update(schema.fieldPlacements)
        .set({ stance: "building" })
        .where(eq(schema.fieldPlacements.id, h.id));
    }
    const [building] = await db.insert(schema.territoryBuildings).values({
      ownerKey,
      tileId: parsed.data.tileId,
      buildingType: parsed.data.buildingType,
      status: "building",
      readyAt,
      element: parsed.data.element || null,
      builderStances: stanceMemory.length ? JSON.stringify(stanceMemory) : null,
    }).returning();
    return { ok: true, building };
  },

  // UI Workspace APIs
  async uploadUiSprite(args: unknown, ctx?: ActionContext) {
    const parsed = z.object({
      category: z.enum(["enemy", "building", "timer", "ui"]),
      name: z.string().min(1).max(100),
      imageBase64: z.string().min(100).max(16_000_000),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid upload.");
    const bytes = Buffer.from(parsed.data.imageBase64, "base64");
    const blobKey = `ui-sprites/${Date.now()}-${randomUUID()}.png`;
    blobs.put(blobKey, bytes, "image/png");
    const [sprite] = await db.insert(schema.uiSprites).values({
      category: parsed.data.category,
      name: parsed.data.name,
      blobKey,
    }).returning();
    return { ok: true, sprite };
  },

  async listUiSprites(args: unknown, ctx?: ActionContext) {
    const sprites = await db.select().from(schema.uiSprites).orderBy(schema.uiSprites.createdAt);
    return { sprites: sprites.map(s => ({
      ...s,
      url: `/blobs/${Buffer.from(s.blobKey).toString("base64url")}`,
    })) };
  },

  async deleteUiSprite(args: unknown, ctx?: ActionContext) {
    const parsed = z.object({ id: z.number().int() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid.");
    await db.delete(schema.uiSprites).where(eq(schema.uiSprites.id, parsed.data.id));
    return { ok: true };
  },

  async getGameConfig() {
    return loadGameConfig();
  },

  async getUiConfig(args: unknown, ctx?: ActionContext) {
    const rows = await db.select().from(schema.uiConfig);
    const config: Record<string, any> = {};
    for (const r of rows) {
      try { config[r.key] = JSON.parse(r.value); } catch {}
    }
    return { config };
  },

  async setUiConfig(args: unknown, ctx?: ActionContext) {
    const parsed = z.object({
      key: z.string().min(1).max(100),
      value: z.any(),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid.");
    await db.insert(schema.uiConfig)
      .values({ key: parsed.data.key, value: JSON.stringify(parsed.data.value) })
      .onConflictDoUpdate({ target: schema.uiConfig.key, set: { value: JSON.stringify(parsed.data.value) } });
    return { ok: true };
  },

  async harvestWheat(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ buildingId: z.number().int() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid.");
    const [building] = await db.select().from(schema.territoryBuildings)
      .where(and(
        eq(schema.territoryBuildings.id, parsed.data.buildingId),
        eq(schema.territoryBuildings.ownerKey, ownerKey),
        eq(schema.territoryBuildings.buildingType, "dream-wheat"),
        eq(schema.territoryBuildings.status, "active"),
      )).limit(1);
    if (!building) badRequest("Wheat not found.");
    const gameConfig = await loadGameConfig();
    const harvestEnergy = gameConfig.buildings["dream-wheat"]?.harvestEnergy ?? 4;
    const growMs = 4 * 60 * 60 * 1000;
    const lastHarvest = building.lastHarvestAt ? new Date(building.lastHarvestAt).getTime()
      : building.readyAt ? new Date(building.readyAt).getTime() : Date.now();
    if (Date.now() - lastHarvest < growMs) badRequest("Not ready yet.");
    // Give energy
    const maxEnergy = await calculateMaxEnergy(ownerKey);
    const res = await db.select().from(schema.tenderResources)
      .where(eq(schema.tenderResources.ownerKey, ownerKey)).limit(1);
    const current = res.length ? res[0].energy : 0;
    await db.update(schema.tenderResources)
      .set({ energy: Math.min(current + harvestEnergy, maxEnergy) })
      .where(eq(schema.tenderResources.ownerKey, ownerKey));
    // Reset growth timer
    await db.update(schema.territoryBuildings)
      .set({ lastHarvestAt: new Date() })
      .where(eq(schema.territoryBuildings.id, building.id));
    return { ok: true, energyGained: harvestEnergy };
  },

  async adminClearTimers(args: unknown, ctx?: ActionContext) {
    // TODO: verify admin workshop password
    const parsed = z.object({ ownerKey: z.string() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    const targetKey = parsed.data.ownerKey;
    await db.update(schema.awakened)
      .set({ dispersedUntil: null })
      .where(eq(schema.awakened.ownerKey, targetKey));
    await db.update(schema.territoryTiles)
      .set({ lastPassiveAt: null })
      .where(eq(schema.territoryTiles.ownerKey, targetKey));
    return { ok: true };
  },


  // Battle tracks: workshop management (Nigel only).
  async listBattleTracks() {
    const tracks = await db.select().from(schema.battleTracks).orderBy(asc(schema.battleTracks.id));
    return { tracks: tracks.map(t => ({ id: t.id, name: t.name, enabled: !!t.enabled })) };
  },

  async getBattleTrack(args: unknown) {
    const parsed = z.object({ id: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid track.");
    const track = await db.select().from(schema.battleTracks)
      .where(eq(schema.battleTracks.id, parsed.data.id)).limit(1);
    if (!track.length) badRequest("Track not found.");
    return { id: track[0].id, name: track[0].name, trackData: track[0].trackData };
  },

  async getRandomBattleTrack() {
    const tracks = await db.select().from(schema.battleTracks)
      .where(eq(schema.battleTracks.enabled, 1));
    if (!tracks.length) return { track: null };
    const pick = tracks[Math.floor(Math.random() * tracks.length)];
    return { track: { id: pick.id, name: pick.name, trackData: pick.trackData } };
  },

  async addBattleTrack(args: unknown, ctx?: ActionContext) {
    // TODO: verify workshop password
    const parsed = z.object({
      name: z.string().min(1).max(100),
      trackData: z.string().min(1),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid track.");
    const [row] = await db.insert(schema.battleTracks).values({
      name: parsed.data.name,
      trackData: parsed.data.trackData,
    }).returning();
    return { id: row.id };
  },

  async toggleBattleTrack(args: unknown, ctx?: ActionContext) {
    // TODO: verify workshop password
    const parsed = z.object({ id: z.number().int().positive(), enabled: z.boolean() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    await db.update(schema.battleTracks)
      .set({ enabled: parsed.data.enabled ? 1 : 0 })
      .where(eq(schema.battleTracks.id, parsed.data.id));
    return { ok: true };
  },

  async deleteBattleTrack(args: unknown, ctx?: ActionContext) {
    // TODO: verify workshop password
    const parsed = z.object({ id: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    await db.delete(schema.battleTracks).where(eq(schema.battleTracks.id, parsed.data.id));
    return { ok: true };
  },


  // Resolve an interactive battleground battle. Client reports the outcome,
  // server validates plausibility and applies territory changes.
  async dissipateAwoken(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ awakenedId: z.number().int().positive() }).safeParse(args);
    if (!parsed.success) badRequest("Invalid request.");
    // Verify ownership and field placement
    const placement = await db.select().from(schema.fieldPlacements)
      .where(and(
        eq(schema.fieldPlacements.awakenedId, parsed.data.awakenedId),
        eq(schema.fieldPlacements.ownerKey, ownerKey)
      )).limit(1);
    if (!placement.length) badRequest("Awoken not on field.");
    // Remove from field
    await db.delete(schema.fieldPlacements)
      .where(eq(schema.fieldPlacements.awakenedId, parsed.data.awakenedId));
    // 8h re-coalescence (double the 4h for voluntary dissipation)
    const dispersedUntil = new Date(Date.now() + 8 * 60 * 60 * 1000);
    await db.update(schema.awakened)
      .set({ dispersedUntil })
      .where(eq(schema.awakened.id, parsed.data.awakenedId));
    return { ok: true };
  },

  async getWaveTarget(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    // The wave targets a random border tile (purified, non-center, non-binding)
    // If no border tiles, targets the bastion.
    const tiles = await db.select().from(schema.territoryTiles)
      .where(and(
        eq(schema.territoryTiles.ownerKey, ownerKey),
        eq(schema.territoryTiles.cursed, 0)
      ));
    const binders = await db.select({ tileId: schema.fieldPlacements.tileId })
      .from(schema.fieldPlacements)
      .where(and(
        eq(schema.fieldPlacements.ownerKey, ownerKey),
        eq(schema.fieldPlacements.stance, "binding")
      ));
    const protectedIds = new Set(binders.map(b => b.tileId));
    // Border = purified, not center, not protected by binding
    const border = tiles.filter(t => !(t.q === 0 && t.r === 0) && !protectedIds.has(t.id));
    let target;
    if (border.length > 0) {
      target = border[Math.floor(Math.random() * border.length)];
    } else {
      // Fallback to bastion
      target = tiles.find(t => t.q === 0 && t.r === 0);
    }
    if (!target) {
      // No territory to defend — return null instead of throwing.
      // Client will handle this gracefully.
      return { tile: null, defenderIds: [] };
    }
    // Get Awoken on the target hex
    const placements = await db.select().from(schema.fieldPlacements)
      .where(eq(schema.fieldPlacements.tileId, target.id));
    return {
      tile: { id: target.id, q: target.q, r: target.r, element: target.element },
      defenderIds: placements.map(p => p.awakenedId),
    };
  },

  async resolveBattle(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      victory: z.boolean(),
      waveNumber: z.number().int().positive(),
      survivorIds: z.array(z.number().int().positive()),
      energySpent: z.number().int().min(0),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid battle result.");

    // Validate: wave number must match current
    const state = await db.select().from(schema.waveState)
      .where(eq(schema.waveState.ownerKey, ownerKey)).limit(1);
    const currentWave = state.length ? state[0].waveNumber : 1;
    if (parsed.data.waveNumber !== currentWave) badRequest("Wave mismatch.");

    // Validate: survivors must be Awoken owned by the tender and placed on the field
    // (The battle defends the wave's target tile, not necessarily the bastion)
    if (parsed.data.survivorIds.length > 0) {
      const placements = await db.select().from(schema.fieldPlacements)
        .where(eq(schema.fieldPlacements.ownerKey, ownerKey));
      const placedIds = new Set(placements.map(p => p.awakenedId));
      for (const id of parsed.data.survivorIds) {
        if (!placedIds.has(id)) badRequest("Invalid survivor.");
      }
    }

    // Spend the reported energy
    if (parsed.data.energySpent > 0) {
      await spendEnergy(ownerKey, parsed.data.energySpent);
    }

    let bonusEligible: { id: number; q: number; r: number }[] = [];
    if (parsed.data.victory) {
      // Survivors gain XP: 50 + 10 per wave number
      const xpGain = 50 + currentWave * 10;
      for (const id of parsed.data.survivorIds) {
        await grantXp(id, xpGain);
      }
      const wavesDefeated = (state[0]?.wavesDefeated ?? 0) + 1;
      // Territory reward only every 3 waves — tender chooses from eligible tiles
      const grantTerritory = wavesDefeated % 3 === 0;
      if (grantTerritory) {
        // Eligible: cursed tiles adjacent to purified territory
        const allTiles = await db.select().from(schema.territoryTiles)
          .where(eq(schema.territoryTiles.ownerKey, ownerKey));
        const purified = new Set(allTiles.filter(t => !t.cursed).map(t => `${t.q},${t.r}`));
        const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
        for (const t of allTiles) {
          if (!t.cursed) continue;
          const adjacent = dirs.some(([dq, dr]) => purified.has(`${t.q + dq},${t.r + dr}`));
          if (adjacent) bonusEligible.push({ id: t.id, q: t.q, r: t.r });
        }
      }
      await db.update(schema.waveState)
        .set({
          waveNumber: currentWave + 1,
          wavesDefeated,
          lastWaveAt: new Date(),
        })
        .where(eq(schema.waveState.ownerKey, ownerKey));
    } else {
      // Defeat: unbound border tile falls, Awoken disperse
      const purified = await db.select().from(schema.territoryTiles)
        .where(and(
          eq(schema.territoryTiles.ownerKey, ownerKey),
          eq(schema.territoryTiles.cursed, 0)
        ));
      const binders = await db.select({ tileId: schema.fieldPlacements.tileId })
        .from(schema.fieldPlacements)
        .where(and(
          eq(schema.fieldPlacements.ownerKey, ownerKey),
          eq(schema.fieldPlacements.stance, "binding")
        ));
      const protectedIds = new Set(binders.map(b => b.tileId));
      const border = purified.filter(t => !(t.q === 0 && t.r === 0) && !protectedIds.has(t.id));
      if (border.length) {
        const victim = border[Math.floor(Math.random() * border.length)];
        const victims = await db.select({ awakenedId: schema.fieldPlacements.awakenedId })
          .from(schema.fieldPlacements)
          .where(eq(schema.fieldPlacements.tileId, victim.id));
        const dispersedUntil = new Date(Date.now() + 4 * 60 * 60 * 1000);
        for (const v of victims) {
          await db.update(schema.awakened)
            .set({ dispersedUntil })
            .where(eq(schema.awakened.id, v.awakenedId));
          await db.delete(schema.fieldPlacements)
            .where(eq(schema.fieldPlacements.awakenedId, v.awakenedId));
        }
        await db.update(schema.territoryTiles)
          .set({ cursed: 1 })
          .where(eq(schema.territoryTiles.id, victim.id));
      }
      await db.update(schema.waveState)
        .set({ lastWaveAt: new Date() })
        .where(eq(schema.waveState.ownerKey, ownerKey));
    }

    return { ok: true, bonusEligible };
  },

  async setStance(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      awakenedId: z.number().int().positive(),
      stance: z.enum(["attack", "defense", "binding"]),
      maxEnergy: z.number().int().min(1),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid stance.");
    // All stances cost 1 energy to enter.
    if (!(await spendEnergy(ownerKey, 1))) {
      badRequest("Not enough energy (need 1).");
    }
    // Verify the Awoken is on the field and owned by the Tender.
    const placement = await db.select().from(schema.fieldPlacements)
      .where(and(
        eq(schema.fieldPlacements.awakenedId, parsed.data.awakenedId),
        eq(schema.fieldPlacements.ownerKey, ownerKey)
      )).limit(1);
    if (!placement.length) badRequest("That Awoken is not on your field.");
    await db.update(schema.fieldPlacements)
      .set({
        stance: parsed.data.stance,
        lastBindingChargeAt: parsed.data.stance === "binding" ? new Date() : null,
      })
      .where(eq(schema.fieldPlacements.id, placement[0].id));
    return z.object({ ok: z.literal(true) }).parse({ ok: true });
  },

  async attackTile(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      awakenedId: z.number().int().positive(),
      tileId: z.number().int().positive(),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid attack.");
    if (!(await spendEnergy(ownerKey, 1))) {
      badRequest("Not enough energy (need 1).");
    }
    // The attacker must be on the field in attack stance.
    const placement = await db.select().from(schema.fieldPlacements)
      .where(and(
        eq(schema.fieldPlacements.awakenedId, parsed.data.awakenedId),
        eq(schema.fieldPlacements.ownerKey, ownerKey)
      )).limit(1);
    if (!placement.length) badRequest("That Awoken is not on your field.");
    if (placement[0].stance !== "attack") badRequest("Set attack stance first.");
    // The target must be a cursed tile owned by the Tender.
    const tile = await db.select().from(schema.territoryTiles)
      .where(and(
        eq(schema.territoryTiles.id, parsed.data.tileId),
        eq(schema.territoryTiles.ownerKey, ownerKey)
      )).limit(1);
    if (!tile.length) badRequest("That tile is not yours.");
    if (!tile[0].cursed) badRequest("That land is already pure.");
    // Target must be adjacent to the attacker's current tile.
    const fromTile = await db.select().from(schema.territoryTiles)
      .where(eq(schema.territoryTiles.id, placement[0].tileId)).limit(1);
    if (!fromTile.length) badRequest("Attacker has no ground.");
    const dq = Math.abs(tile[0].q - fromTile[0].q);
    const dr = Math.abs(tile[0].r - fromTile[0].r);
    const dist = Math.max(dq, dr, Math.abs((tile[0].q + tile[0].r) - (fromTile[0].q + fromTile[0].r)));
    if (dist !== 1) badRequest("Can only attack adjacent tiles.");
    // Power vs toughness: the attacker's power must meet the corruption.
    const owned = await db.select().from(schema.awakened)
      .where(and(
        eq(schema.awakened.collection, "tender"),
        or(eq(schema.awakened.ownerKey, ownerKey), isNull(schema.awakened.ownerKey))
      ));
    const attacker = owned.find(a => a.id === parsed.data.awakenedId);
    if (!attacker) badRequest("Attacker not found.");
    const assetRows = await db.select().from(schema.layerAssets);
    const assetStats = new Map<number, AssetStats>();
    for (const assetRow of assetRows) {
      const rarity = raritySchema.safeParse(assetRow.rarity);
      if (rarity.success) assetStats.set(assetRow.id, { name: assetRow.name, rarity: rarity.data, power: assetRow.power, toughness: assetRow.toughness });
    }
    const layers = parseLayers(attacker.compositionJson, assetStats);
    const power = layers.reduce((s, l) => s + (l.power ?? 0), 0);
    // HP system: each attack dwindles the curse HP by the attacker's power.
    // Initialize HP if missing (legacy tiles).
    const ring = Math.max(Math.abs(tile[0].q), Math.abs(tile[0].r), Math.abs(tile[0].q + tile[0].r));
    const maxHp = tile[0].curseMaxHp ?? (4 + ring * 6);
    const currentHp = tile[0].curseHp ?? maxHp;
    const newHp = Math.max(0, currentHp - power);
    if (newHp > 0) {
      // Curse holds — record the reduced HP.
      await db.update(schema.territoryTiles)
        .set({ curseHp: newHp, curseMaxHp: maxHp })
        .where(eq(schema.territoryTiles.id, tile[0].id));
      return z.object({ ok: z.literal(true), purified: z.literal(false), hp: z.number(), maxHp: z.number(), damage: z.number() })
        .parse({ ok: true, purified: false, hp: newHp, maxHp, damage: power });
    }
    // HP reached 0 — the curse breaks! Purify to neutral.
    {
        const elementCounts: Record<"tide" | "sky" | "stone" | "root", number> = { tide: 0, sky: 0, stone: 0, root: 0 };
        for (const layer of layers) {
          const el = elementForPieceName(layer.name);
          if (el !== "fire") elementCounts[el] += 1;
        }
        let element: "tide" | "sky" | "stone" | "root" | "neutral" = "neutral";
        let maxCount = 0; let tie = false;
        for (const [el, count] of Object.entries(elementCounts)) {
          if (count > maxCount) { maxCount = count; element = el as typeof element; tie = false; }
          else if (count === maxCount && count > 0) { tie = true; }
        }
        if (tie) element = "neutral";
        await db.update(schema.territoryTiles)
          .set({ cursed: 0, element, curseHp: null, curseMaxHp: null })
          .where(eq(schema.territoryTiles.id, tile[0].id));
        await db.update(schema.fieldPlacements)
          .set({ tileId: tile[0].id })
          .where(eq(schema.fieldPlacements.awakenedId, parsed.data.awakenedId));
        return z.object({ ok: z.literal(true), purified: z.literal(true) })
          .parse({ ok: true, purified: true });
    }
    // Victory: purify the tile, move the attacker onto it.
    const elementCounts: Record<"tide" | "sky" | "stone" | "root", number> = { tide: 0, sky: 0, stone: 0, root: 0 };
    for (const layer of layers) {
      const el = elementForPieceName(layer.name);
      if (el !== "fire") elementCounts[el as "tide" | "sky" | "stone" | "root"] += 1;
    }
    let element: "tide" | "sky" | "stone" | "root" | "neutral" = "neutral";
    let maxCount = 0; let tie = false;
    for (const [el, count] of Object.entries(elementCounts)) {
      if (count > maxCount) { maxCount = count; element = el as typeof element; tie = false; }
      else if (count === maxCount && count > 0) { tie = true; }
    }
    if (tie) element = "neutral";
    await db.update(schema.territoryTiles)
      .set({ cursed: 0, element })
      .where(eq(schema.territoryTiles.id, tile[0].id));
    // Move the attacker onto the purified tile.
    await db.update(schema.fieldPlacements)
      .set({ tileId: tile[0].id, lastMovedAt: new Date() })
      .where(eq(schema.fieldPlacements.id, placement[0].id));
    await expandFrontier(ownerKey, tile[0].q, tile[0].r);
    // A newborn joins the hand for the victory.
    return z.object({ ok: z.literal(true), purified: z.literal(true) }).parse({ ok: true, purified: true });
  },

  async claimFirstTile(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({ teamIds: z.array(z.number().int().positive()).min(1).max(6) }).safeParse(args);
    if (!parsed.success) badRequest("Invalid team.");
    // Must have no tiles yet.
    const existing = await db.select({ id: schema.territoryTiles.id }).from(schema.territoryTiles)
      .where(eq(schema.territoryTiles.ownerKey, ownerKey)).limit(1);
    if (existing.length) badRequest("Already claimed.");
    // Verify team ownership and combined power >= 7.
    // Legacy shared rows (ownerKey IS NULL) are visible to everyone in the
    // hand — match buildStudio's filter so the team the Tender sees is the
    // team the server accepts.
    const team = await db.select().from(schema.awakened)
      .where(
        and(
          eq(schema.awakened.collection, "tender"),
          or(eq(schema.awakened.ownerKey, ownerKey), isNull(schema.awakened.ownerKey))
        )
      );
    const teamRows = team.filter(t => parsed.data.teamIds.includes(t.id));
    if (teamRows.length !== parsed.data.teamIds.length) badRequest("Invalid team.");
    // The Unraveler at power 7: the server measures the team's true combined
    // power from their layers (current pool stats) + empowerment + stories —
    // never the client's word for it. Identical arithmetic to toAwakenedPayload.
    const assetRows = await db.select().from(schema.layerAssets);
    const assetStats = new Map<number, AssetStats>();
    for (const assetRow of assetRows) {
      const rarity = raritySchema.safeParse(assetRow.rarity);
      if (rarity.success) assetStats.set(assetRow.id, { name: assetRow.name, rarity: rarity.data, power: assetRow.power, toughness: assetRow.toughness });
    }
    const allRows = await db.select().from(schema.awakened);
    const idsByIdentity = new Map<string, number[]>();
    for (const other of allRows) {
      const otherLayers = parseLayers(other.compositionJson, assetStats);
      const otherIdentity = other.identityKey === "legacy" ? identityFor(otherLayers) : other.identityKey;
      idsByIdentity.set(otherIdentity, [...(idsByIdentity.get(otherIdentity) ?? []), other.id].sort((a, b) => a - b));
    }
    let totalPower = 0;
    const elementCounts: Record<"tide" | "sky" | "stone" | "root", number> = { tide: 0, sky: 0, stone: 0, root: 0 };
    for (const t of teamRows) {
      const layers = parseLayers(t.compositionJson, assetStats);
      const identity = t.identityKey === "legacy" ? identityFor(layers) : t.identityKey;
      totalPower += toAwakenedPayload(t, layers, identity, idsByIdentity).power;
      // The tile becomes what the team is: each layer's element, read from
      // its name with the same keyword rules the client uses. Fire is never
      // inherited here — it only ever sparks on wild land.
      for (const layer of layers) {
        const el = elementForPieceName(layer.name);
        if (el !== "fire") elementCounts[el] += 1;
      }
    }
    if (totalPower < 7) badRequest("Your combined power must reach 7 to face the Unraveler.");
    // Dominant element claims the tile; a tie stays neutral.
    let element: "tide" | "sky" | "stone" | "root" | "neutral" | "fire" = "neutral";
    let maxCount = 0; let tie = false;
    for (const [el, count] of Object.entries(elementCounts)) {
      if (count > maxCount) { maxCount = count; element = el as typeof element; tie = false; }
      else if (count === maxCount && count > 0) { tie = true; }
    }
    if (tie) element = "neutral";
    // Create center tile, purified.
    const [center] = await db.insert(schema.territoryTiles).values({
      ownerKey, q: 0, r: 0, element, cursed: 0,
    }).returning({ id: schema.territoryTiles.id });
    // Create ring of cursed tiles around it (random elements).
    // Their 48h passive timers start now — the center's purification stirs them.
    const now = new Date();
    const elements = ["tide", "sky", "stone", "root", "neutral"] as const;
    const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    for (const [dq, dr] of dirs) {
      const el = elements[Math.floor(Math.random() * elements.length)];
      await db.insert(schema.territoryTiles).values({
        ownerKey, q: dq, r: dr, element: el, cursed: 1, lastPassiveAt: now,
      });
    }
    // The wilds press in from beyond the first ring.
    for (const [dq, dr] of dirs) {
      await expandFrontier(ownerKey, dq, dr);
    }
    // Place team on center tile (max 4 total).
    // Newborn is birthed client-side via birthFieldAwoken (real Wake, not a clone).
    for (let i = 0; i < Math.min(4, teamRows.length); i++) {
      await db.insert(schema.fieldPlacements).values({
        ownerKey, awakenedId: teamRows[i].id, tileId: center.id,
      });
    }
    return okResponse.parse({ ok: true });
  },

  async birthFieldAwoken(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      layers: z.array(layerRefShape),
      imageBase64: z.string(),
      tileId: z.number(),
      liberatorNames: z.array(z.string()),
      toHand: z.boolean().optional(),
    }).parse(args);
    const story = `Liberated by ${parsed.liberatorNames.join(", ")}. When the dark broke over this tile, I opened my eyes on reclaimed land. They stood over me — the ones who fought the Unraveler back. This is where I began, on ground they made safe.`;
    const blobKey = `fieldborn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const base64Data = parsed.imageBase64.split(",")[1] ?? parsed.imageBase64;
    blobs.put(blobKey, Buffer.from(base64Data, "base64"), "image/png");
    const [newborn] = await db.insert(schema.awakened).values({
      name: "Newborn of the Purified Land",
      imageBlobKey: blobKey,
      compositionJson: JSON.stringify(parsed.layers),
      collection: "tender",
      ownerName: ownerKey,
      ownerKey,
      identityKey: `newborn-${Date.now()}`,
      flavorText: story,
      fieldBorn: 1,
    }).returning({ id: schema.awakened.id });
    // Newborns from battle purification join the hand, not the field.
    if (!parsed.toHand) {
      await db.insert(schema.fieldPlacements).values({
        ownerKey, awakenedId: newborn.id, tileId: parsed.tileId,
      });
    }
    return okResponse.parse({ ok: true, id: newborn.id });
  },


  /**
   * Server-side newborn birth: picks random layers from the pool, creates the
   * record, joins the hand. No client-side image composition — the card renders
   * from layers. Cannot hang the purification flow.
   */
  async birthNewbornToHand(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      tileId: z.number().int().positive(),
      liberatorNames: z.array(z.string()),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid birth request.");
    // Pick one random layer per category from the pool.
    const assetRows = await db.select().from(schema.layerAssets);
    const byCategory: Record<string, typeof assetRows> = {};
    for (const r of assetRows) {
      if (!byCategory[r.category]) byCategory[r.category] = [];
      byCategory[r.category].push(r);
    }
    const pick = (cat: string) => {
      const pool = byCategory[cat] ?? [];
      if (!pool.length) return null;
      return pool[Math.floor(Math.random() * pool.length)];
    };
    const body = pick("body"), arms = pick("arms"), head = pick("head"), aura = pick("aura");
    if (!body || !arms || !head) badRequest("The pool is not ready for births.");
    const layers = [body, arms, head, ...(aura ? [aura] : [])].map(l => ({
      source_id: l.id, name: l.name, category: l.category,
      rarity: l.rarity ?? "common", power: l.power ?? null, toughness: l.toughness ?? null,
    }));
    const story = `Liberated by ${parsed.data.liberatorNames.join(", ")}. When the dark broke over this tile, I opened my eyes on reclaimed land. They stood over me — the ones who fought the Unraveler back. This is where I began, on ground they made safe.`;
    // Placeholder image: simple SVG with the newborn's mark. The card renders
    // from layers via FieldAwoken; this is just so image_url isn't empty.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="92"><rect width="72" height="92" fill="#1a1a1a"/><text x="36" y="50" text-anchor="middle" fill="#b89b5e" font-size="10">✦</text></svg>`;
    const blobKey = `newborn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    blobs.put(blobKey, Buffer.from(svg), "image/svg+xml");
    const [newborn] = await db.insert(schema.awakened).values({
      name: "Newborn of the Purified Land",
      imageBlobKey: blobKey,
      compositionJson: JSON.stringify(layers),
      collection: "tender",
      ownerName: ownerKey,
      ownerKey,
      identityKey: `newborn-${Date.now()}`,
      flavorText: story,
      fieldBorn: 1,
    }).returning({ id: schema.awakened.id });
    // Joins the hand, not the field.
    // Recalculate max energy and grant the newborn's energy bonus immediately.
    const newbornPower = layers.reduce((sum, l) => sum + (l.power ?? 0), 0);
    const bonus = await grantBirthEnergy(ownerKey, newbornPower);
    return okResponse.parse({ ok: true, id: newborn.id, energyBonus: bonus });
  },

  async getBirthStatus(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const row = sqlite.prepare(`SELECT last_birth_at FROM tender_births WHERE owner_key = ?`).get(ownerKey) as { last_birth_at: number } | undefined;
    const now = Date.now();
    const fourHours = 4 * 60 * 60 * 1000;
    if (!row) {
      // First time: birth is ready
      return { ready: true, msUntil: 0 };
    }
    const elapsed = now - row.last_birth_at;
    if (elapsed >= fourHours) {
      return { ready: true, msUntil: 0 };
    }
    return { ready: false, msUntil: fourHours - elapsed };
  },

  async claimTimedBirth(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      layers: z.array(layerRefShape),
      imageBase64: z.string(),
    }).parse(args);
    const now = Date.now();
    const fourHours = 4 * 60 * 60 * 1000;
    const row = sqlite.prepare(`SELECT last_birth_at FROM tender_births WHERE owner_key = ?`).get(ownerKey) as { last_birth_at: number } | undefined;
    if (row && (now - row.last_birth_at) < fourHours) {
      badRequest("The next birth is not ready yet.");
    }
    const blobKey = `timed-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const base64Data = parsed.imageBase64.split(",")[1] ?? parsed.imageBase64;
    blobs.put(blobKey, Buffer.from(base64Data, "base64"), "image/png");
    const [newborn] = await db.insert(schema.awakened).values({
      name: "Child of Time",
      imageBlobKey: blobKey,
      compositionJson: JSON.stringify(parsed.layers),
      collection: "tender",
      ownerName: ownerKey,
      ownerKey,
      identityKey: `timed-${Date.now()}`,
      flavorText: "Born of patience. Every four hours, the world offers a new form.",
      fieldBorn: 0, // Born of time, not of battle
    }).returning({ id: schema.awakened.id });
    sqlite.prepare(`INSERT OR REPLACE INTO tender_births (owner_key, last_birth_at) VALUES (?, ?)`).run(ownerKey, now);
    return okResponse.parse({ ok: true, id: newborn.id });
  },

  /**
   * Direct attack: send exactly 3 Awoken at a cursed tile. Overwhelming force
   * breaks the dark — the tile is purified, takes the dominant element of the
   * attackers (fire is never inherited; ties stay neutral), and the attackers
   * stand on the reclaimed land. Energy cost is enforced client-side.
   */
  async directAttack(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      awakenedIds: z.array(z.number().int().positive()).length(3),
      tileId: z.number().int().positive(),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid direct attack.");
    if (new Set(parsed.data.awakenedIds).size !== 3) badRequest("Three distinct Awoken must strike together.");
    // Verify the tile belongs to the Tender and is cursed.
    const tile = await db.select().from(schema.territoryTiles)
      .where(and(eq(schema.territoryTiles.id, parsed.data.tileId), eq(schema.territoryTiles.ownerKey, ownerKey))).limit(1);
    if (!tile.length) badRequest("That tile is not yours.");
    if (!tile[0].cursed) badRequest("The dark has already broken there.");
    // Verify all three Awoken belong to the Tender and are not on the field.
    const owned = await db.select().from(schema.awakened)
      .where(and(eq(schema.awakened.ownerKey, ownerKey)));
    const attackers = owned.filter(t => parsed.data.awakenedIds.includes(t.id));
    if (attackers.length !== 3) badRequest("Those Awoken are not all yours.");
    const placedIds = new Set((await db.select({ awakenedId: schema.fieldPlacements.awakenedId })
      .from(schema.fieldPlacements)
      .where(eq(schema.fieldPlacements.ownerKey, ownerKey))).map(p => p.awakenedId));
    for (const a of attackers) {
      if (!canTouchAwoken(a, ownerKey)) badRequest("That Awoken is not yours to send.");
      if (placedIds.has(a.id)) badRequest("Already on the field.");
    }
    // The tile becomes what the attackers are: dominant element of their
    // layers, read from piece names. Fire never sparks on conquered land.
    const assetRows = await db.select().from(schema.layerAssets);
    const assetStats = new Map<number, AssetStats>();
    for (const assetRow of assetRows) {
      const rarity = raritySchema.safeParse(assetRow.rarity);
      if (rarity.success) assetStats.set(assetRow.id, { name: assetRow.name, rarity: rarity.data, power: assetRow.power, toughness: assetRow.toughness });
    }
    const elementCounts: Record<"tide" | "sky" | "stone" | "root", number> = { tide: 0, sky: 0, stone: 0, root: 0 };
    for (const a of attackers) {
      for (const layer of parseLayers(a.compositionJson, assetStats)) {
        const el = elementForPieceName(layer.name);
        if (el !== "fire") elementCounts[el] += 1;
      }
    }
    let element: "tide" | "sky" | "stone" | "root" | "neutral" = "neutral";
    let maxCount = 0; let tie = false;
    for (const [el, count] of Object.entries(elementCounts)) {
      if (count > maxCount) { maxCount = count; element = el as typeof element; tie = false; }
      else if (count === maxCount && count > 0) { tie = true; }
    }
    if (tie) element = "neutral";
    // Break the curse.
    await db.update(schema.territoryTiles)
      .set({ cursed: 0, element })
      .where(eq(schema.territoryTiles.id, tile[0].id));
    // The attackers stand on the reclaimed land (3 < 4 tile cap).
    for (const a of attackers) {
      await db.insert(schema.fieldPlacements).values({
        ownerKey, awakenedId: a.id, tileId: tile[0].id,
      });
    }
    // The neighboring cursed land feels the shift — their 48h passive timers
    // start now.
    const now = new Date();
    const neighborCoords = [
      [tile[0].q + 1, tile[0].r], [tile[0].q - 1, tile[0].r],
      [tile[0].q, tile[0].r + 1], [tile[0].q, tile[0].r - 1],
      [tile[0].q + 1, tile[0].r - 1], [tile[0].q - 1, tile[0].r + 1],
    ];
    for (const [nq, nr] of neighborCoords) {
      await db.update(schema.territoryTiles)
        .set({ lastPassiveAt: now })
        .where(and(
          eq(schema.territoryTiles.ownerKey, ownerKey),
          eq(schema.territoryTiles.q, nq),
          eq(schema.territoryTiles.r, nr),
          eq(schema.territoryTiles.cursed, 1),
        ));
    }
    return okResponse.parse({ ok: true });
  },

  /**
   * Passive purification: the slow work of presence. Once every 48 hours, a
   * cursed tile adjacent to purified land may purify on its own if the
   * combined power of nearby field Awoken exceeds the tile's curse weight.
   * 30% chance per attempt. The land grows because it is tended, not because
   * time passes.
   */
  async passivePurify(args: unknown, ctx?: ActionContext) {
    const ownerKey = ownerKeyFor(ctx);
    const parsed = z.object({
      tileId: z.number().int().positive(),
    }).safeParse(args);
    if (!parsed.success) badRequest("Invalid purification attempt.");
    const tile = await db.select().from(schema.territoryTiles)
      .where(and(eq(schema.territoryTiles.id, parsed.data.tileId), eq(schema.territoryTiles.ownerKey, ownerKey))).limit(1);
    if (!tile.length) badRequest("That tile is not yours.");
    if (!tile[0].cursed) badRequest("The dark has already broken there.");
    // 48-hour timer: the tile must rest between attempts.
    const now = Date.now();
    const lastAttempt = tile[0].lastPassiveAt ? tile[0].lastPassiveAt.getTime() : tile[0].createdAt.getTime();
    const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;
    if (now - lastAttempt < FORTY_EIGHT_HOURS) {
      const hoursLeft = Math.ceil((FORTY_EIGHT_HOURS - (now - lastAttempt)) / (60 * 60 * 1000));
      return purifyResponse.parse({ ok: false, reason: "resting", hoursLeft });
    }
    // Record the attempt now — the timer resets whether or not it succeeds.
    await db.update(schema.territoryTiles)
      .set({ lastPassiveAt: new Date(now) })
      .where(eq(schema.territoryTiles.id, tile[0].id));
    const weight = corruptionToughness(tile[0].q, tile[0].r);
    // Field power: sum of power of Awoken on adjacent purified tiles.
    const neighbors = [
      [tile[0].q + 1, tile[0].r], [tile[0].q - 1, tile[0].r],
      [tile[0].q, tile[0].r + 1], [tile[0].q, tile[0].r - 1],
      [tile[0].q + 1, tile[0].r - 1], [tile[0].q - 1, tile[0].r + 1],
    ];
    const placements = await db.select().from(schema.fieldPlacements)
      .where(eq(schema.fieldPlacements.ownerKey, ownerKey));
    const owned = await db.select().from(schema.awakened)
      .where(
        and(
          eq(schema.awakened.collection, "tender"),
          or(eq(schema.awakened.ownerKey, ownerKey), isNull(schema.awakened.ownerKey))
        )
      );
    // Power comes from layers, same formula the trial uses.
    const assetRows = await db.select().from(schema.layerAssets);
    const assetStats = new Map<number, AssetStats>();
    for (const assetRow of assetRows) {
      const rarity = raritySchema.safeParse(assetRow.rarity);
      if (rarity.success) assetStats.set(assetRow.id, { name: assetRow.name, rarity: rarity.data, power: assetRow.power, toughness: assetRow.toughness });
    }
    const powerById = new Map<number, number>();
    for (const a of owned) {
      const layers = parseLayers(a.compositionJson, assetStats);
      powerById.set(a.id, layers.reduce((s, l) => s + (l.power ?? 0), 0));
    }
    let nearbyPower = 0;
    const neighborTiles = await db.select().from(schema.territoryTiles)
      .where(eq(schema.territoryTiles.ownerKey, ownerKey));
    const neighborIds = new Set(
      neighborTiles
        .filter(t => !t.cursed && neighbors.some(([q, r]) => t.q === q && t.r === r))
        .map(t => t.id)
    );
    // Also count Awoken standing on the tile itself (defenders).
    neighborIds.add(tile[0].id);
    for (const p of placements) {
      if (neighborIds.has(p.tileId)) nearbyPower += powerById.get(p.awakenedId) ?? 0;
    }
    // Binding stance: binders channel power into the land.
    // (Defense does not aid purification — it holds purified land.)
    const bindBonus = await bindingBonuses(ownerKey);
    nearbyPower += bindBonus.get(tile[0].id) ?? 0;
    if (nearbyPower < weight) {
      return purifyResponse.parse({ ok: false, reason: "too-weak", need: weight, have: nearbyPower });
    }
    // 30% chance — the land decides in its own time.
    if (Math.random() >= 0.30) {
      return purifyResponse.parse({ ok: false, reason: "not-yet", need: weight, have: nearbyPower });
    }
    // The dark breaks. The tile takes the element of its liberators.
    await db.update(schema.territoryTiles)
      .set({ cursed: 0 })
      .where(eq(schema.territoryTiles.id, tile[0].id));
    await expandFrontier(ownerKey, tile[0].q, tile[0].r);
    return purifyResponse.parse({ ok: true, purified: true });
  },
};

/** A deck the caller owns — or a refusal. Decks are never shared. */
async function ownDeck(id: number, ownerKey: string) {
  const rows = await db
    .select()
    .from(schema.decks)
    .where(and(eq(schema.decks.id, id), eq(schema.decks.ownerKey, ownerKey)))
    .limit(1);
  const deck = rows[0];
  if (!deck) badRequest("That deck is not yours to touch.");
  return deck;
}

/** Card ids currently gathered in a deck. */
async function deckCardIds(deckId: number): Promise<number[]> {
  const rows = await db
    .select({ awakenedId: schema.deckCards.awakenedId })
    .from(schema.deckCards)
    .where(eq(schema.deckCards.deckId, deckId));
  return rows.map((row) => row.awakenedId);
}

/** A Tender may only gather their own Tender-collection Awoken. */
function canTouchAwoken(awoken: typeof schema.awakened.$inferSelect, ownerKey: string): boolean {
  return (
    awoken.collection === "tender" &&
    (awoken.ownerKey === null || awoken.ownerKey === ownerKey)
  );
}

export type ActionName = keyof typeof handlers;
export { assetShape, awakenedShape };
