// Port of server/src/actions.ts from the Muse-space original.
// Every handler keeps the original validation shapes and behavior; only the
// runtime bindings changed: `ctx.db` -> the local drizzle instance,
// `ctx.blobs` -> the content-addressed blob store, `ctx.inference.complete`
// -> the curated naming/flavor pools in naming.ts.

import { randomUUID } from "node:crypto";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, blobs, schema } from "./store.js";
import { mysticalPieceName, birthFlavorText } from "./naming.js";
import { creditBalance, spendWakeCredit, SINGLE_OWNER } from "./credits.js";
import { CREDITS_PER_PACK, PACK_PRICE_CENTS, PRICE_PER_WAKE_CENTS, formatUsd } from "./config.js";
import { stripeReady } from "./stripe.js";

export interface ActionContext {
  /** Browser-visitor mark from the X-Visitor-Id header (null when absent). */
  visitorId: string | null;
}

const layerCategorySchema = z.enum(["background", "arms", "body", "aura", "head"]);
const raritySchema = z.enum(["common", "uncommon", "rare", "mythic"]);
const collectionSchema = z.enum(["tender", "workshop"]);
const statSchema = z.number().int().min(1).max(3);
const statCategories = new Set<z.infer<typeof layerCategorySchema>>(["arms", "body", "head"]);
const okResponse = z.object({ ok: z.literal(true) });

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
  return {
    id: row.id, name: row.name, image_url: blobUrl(row.imageBlobKey), layers,
    base_power: basePower, base_toughness: baseToughness, power: basePower + empowerment, toughness: baseToughness + empowerment,
    empowerment, iteration, collection: collection.success ? collection.data : ("workshop" as const),
    owner_name: row.ownerName, flavor_text: row.flavorText, created_at: row.createdAt.toISOString(),
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

async function buildStudio(visitorId: string | null, opts?: { tenderOnly?: boolean }) {
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
  const awakenedRows = (await db.select().from(schema.awakened).orderBy(desc(schema.awakened.id)))
    // Held-apart forms (the welcome greeting, unclaimed free wakes) stay out
    // of every deck until their Tender claims them.
    .filter((row) => !pendingIds.has(row.id));
  const supportedAssetRows = assetRows.flatMap((row) => {
    const category = layerCategorySchema.safeParse(row.category); const rarity = raritySchema.safeParse(row.rarity);
    return category.success && rarity.success ? [{ ...row, category: category.data, rarity: rarity.data }] : [];
  });
  const assetStats = new Map<number, AssetStats>(supportedAssetRows.map((row) => [row.id, { name: row.name, rarity: row.rarity, power: row.power, toughness: row.toughness }]));
  const assets = supportedAssetRows.map((row) => ({
    id: row.id, name: row.name, category: row.category, rarity: row.rarity, power: row.power, toughness: row.toughness,
    image_url: blobUrl(row.imageBlobKey), mime_type: row.mimeType, created_at: row.createdAt.toISOString(),
  }));
  const parsedRows = (opts?.tenderOnly ? awakenedRows.filter((row) => row.collection === "tender") : awakenedRows).map((row) => {
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
    credits: {
      balance: await creditBalance(visitorId ?? SINGLE_OWNER),
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

export const handlers = {
  async getStudio(_args: unknown, ctx?: ActionContext) {
    // The Tender ritual's data: pool pieces, the Tender deck, credits.
    // Workshop pieces of the collection stay behind the workshop lock.
    return buildStudio(ctx?.visitorId ?? null, { tenderOnly: true });
  },

  async getWorkshopStudio(_args: unknown, ctx?: ActionContext) {
    // Everything, for the creator's eyes only. Gated by requireWorkshop in index.ts.
    return buildStudio(ctx?.visitorId ?? null);
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

  async saveAwoken(args: unknown, ctx?: ActionContext) {
    const parsed = z.object({ layers: z.array(layerRefShape).min(1).max(5), imageBase64: z.string().min(100).max(16_000_000), collection: collectionSchema, ownerName: z.string().trim().min(1).max(80) }).safeParse(args);
    if (!parsed.success) badRequest("Invalid awakening.");
    const { layers, imageBase64, collection, ownerName } = parsed.data;
    // Tender wakes cost one credit; the workshop (Nigel's own hand) is free.
    if (collection === "tender") {
      const spent = await spendWakeCredit(ctx?.visitorId ?? SINGLE_OWNER);
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
    const rows = await db.insert(schema.awakened).values({ name: plan.name, imageBlobKey: blobKey, compositionJson: JSON.stringify(plan.canonicalLayers), collection, ownerName, identityKey: plan.identityKey, iteration: plan.previousCount, flavorText: plan.flavorText }).returning({ id: schema.awakened.id });
    const row = rows[0] as { id: number } | undefined;
    if (!row) { blobs.delete(blobKey); badRequest("This awakening could not be saved."); }
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
};

export type ActionName = keyof typeof handlers;
export { assetShape, awakenedShape };
