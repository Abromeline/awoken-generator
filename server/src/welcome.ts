// The welcome ritual: free wakes for Tenders.
//
// First visit (with a Tender account): 20 welcome wakes are granted (a bonus
// "first deck") and one Awoken is held apart, already waiting, with a single
// free re-weaving ("Reconstitute matter"). Every 4 hours a free wake gathers
// — one at a time, never stacked, never announced. Pull only: the
// Anti-Duolingo law holds even here.
//
// Identity is the Tender account (secret code + password), keyed as
// "tender:<id>". Soft browser visitors (localStorage UUID) are grandfathered:
// a soft visitor whose welcome was already granted keeps working, but new
// soft visitors must claim a code first. Clearing storage no longer mints
// fresh wakes.

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, blobs, schema } from "./store.js";
import { awakenedPayloadById, layerRefShape, planAwakening } from "./actions.js";
import { CREDITS_PER_PACK } from "./config.js";
import { grantCredits } from "./credits.js";
import { tenderFromToken, tenderOwnerKey, type TenderRow } from "./tenders.js";

/** One free wake gathers every four hours. Not sooner, not stacked. */
export const FREE_WAKE_MS = 4 * 60 * 60 * 1000;

type Slot = "welcome" | "free";
const slotSchema = z.enum(["welcome", "free"]);
const generationInput = z.object({
  layers: z.array(layerRefShape).min(1).max(6),
  imageBase64: z.string().min(100).max(16_000_000),
});

function badRequest(message: string): never {
  throw Object.assign(new Error(message), { status: 400 });
}

/** The browser-visitor mark. Strict enough to be a key, loose enough to
 *  survive the localStorage fallback. */
export function visitorIdFromHeader(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(id) ? id : null;
}

type Visitor = typeof schema.visitors.$inferSelect;
type Pending = typeof schema.pendingWelcomes.$inferSelect;

/** Who may use the welcome ritual, and under what owner key. */
export type WelcomeIdentity = { ownerKey: string; ownerName: string; tender: TenderRow | null };

/**
 * Resolve the welcome identity for a request. Tender token wins; otherwise
 * a grandfathered soft visitor (whose welcome was already granted) keeps
 * working. Brand-new soft visitors must claim a secret code first.
 */
export async function welcomeIdentity(tenderToken: string | null, visitorId: string | null): Promise<WelcomeIdentity> {
  if (tenderToken) {
    const tender = await tenderFromToken(tenderToken);
    if (tender) {
      return { ownerKey: tenderOwnerKey(tender.id), ownerName: tender.tenderName ?? "Tender", tender };
    }
  }
  if (visitorId) {
    const rows = await db.select().from(schema.visitors).where(eq(schema.visitors.visitorId, visitorId)).limit(1);
    const visitor = rows[0];
    if (visitor && visitor.welcomeWakesGranted === 1) {
      return { ownerKey: visitorId, ownerName: "Tender", tender: null };
    }
  }
  throw Object.assign(new Error("Claim your secret code to begin — the welcome is for Tenders."), { status: 403 });
}

async function ensureVisitor(visitorId: string): Promise<{ visitor: Visitor; isNew: boolean }> {
  const rows = await db.select().from(schema.visitors).where(eq(schema.visitors.visitorId, visitorId)).limit(1);
  if (rows[0]) return { visitor: rows[0], isNew: false };
  const now = new Date();
  // The free-wake clock starts at first visit: the first free wake gathers
  // four hours later, not immediately.
  await db.insert(schema.visitors).values({
    visitorId, createdAt: now, welcomeWakesGranted: 1, welcomeClaimed: 0, lastFreeWakeAt: now,
  });
  await grantCredits(visitorId, CREDITS_PER_PACK, "welcome");
  const created = await db.select().from(schema.visitors).where(eq(schema.visitors.visitorId, visitorId)).limit(1);
  const visitor = created[0];
  if (!visitor) badRequest("The visitor could not be marked.");
  return { visitor: visitor as Visitor, isNew: true };
}

async function pendingFor(visitorId: string, slot: Slot): Promise<Pending | undefined> {
  const rows = await db
    .select()
    .from(schema.pendingWelcomes)
    .where(and(eq(schema.pendingWelcomes.visitorId, visitorId), eq(schema.pendingWelcomes.slot, slot)))
    .limit(1);
  return rows[0];
}

/** Remove a held-apart Awoken entirely: its deck record and its image. */
async function removePending(pending: Pending): Promise<void> {
  const rows = await db
    .select({ key: schema.awakened.imageBlobKey })
    .from(schema.awakened)
    .where(eq(schema.awakened.id, pending.awakenedId))
    .limit(1);
  await db.delete(schema.awakened).where(eq(schema.awakened.id, pending.awakenedId));
  const key = rows[0]?.key;
  if (key) blobs.delete(key);
  await db.delete(schema.pendingWelcomes).where(eq(schema.pendingWelcomes.id, pending.id));
}

/** Generate an Awoken with the same arithmetic as Wake One, but hold it
 *  apart in the Tender's slot instead of dropping it in the deck. Costs
 *  no credit — the welcome and the free wakes are gifts. */
async function holdAwakening(ownerKey: string, ownerName: string, slot: Slot, layers: unknown, imageBase64: unknown, respinsUsed: number) {
  const parsed = generationInput.safeParse({ layers, imageBase64 });
  if (!parsed.success) {
    const details = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    badRequest(`That awakening could not be gathered. [${details}]`);
  }
  const plan = await planAwakening(parsed.data.layers);
  const bytes = Buffer.from(parsed.data.imageBase64, "base64");
  const blobKey = `awakened/${Date.now()}-${randomUUID()}.png`;
  blobs.put(blobKey, bytes, "image/png");
  const rows = await db
    .insert(schema.awakened)
    .values({
      name: plan.name,
      imageBlobKey: blobKey,
      compositionJson: JSON.stringify(plan.canonicalLayers),
      collection: "tender",
      ownerName,
      ownerKey,
      identityKey: plan.identityKey,
      iteration: plan.previousCount,
      flavorText: plan.flavorText,
    })
    .returning({ id: schema.awakened.id });
  const row = rows[0] as { id: number } | undefined;
  if (!row) {
    blobs.delete(blobKey);
    badRequest("This awakening could not be saved.");
  }
  await db.insert(schema.pendingWelcomes).values({
    visitorId: ownerKey, slot, awakenedId: (row as { id: number }).id, respinsUsed,
  });
  return awakenedPayloadById((row as { id: number }).id);
}

async function waitingPayload(pending: Pending) {
  return {
    awakened: await awakenedPayloadById(pending.awakenedId),
    respinsUsed: pending.respinsUsed,
    respinsRemaining: Math.max(0, 1 - pending.respinsUsed),
  };
}

function freeWakeState(lastFreeWakeAt: Date | null, nowMs: number) {
  const lastMs = lastFreeWakeAt ? lastFreeWakeAt.getTime() : null;
  const available = lastMs === null || nowMs - lastMs >= FREE_WAKE_MS;
  return {
    available,
    nextFreeWakeAt: available || lastMs === null ? null : new Date(lastMs + FREE_WAKE_MS).toISOString(),
  };
}

export async function getWelcomeStatus(ownerKey: string) {
  const { visitor } = await ensureVisitor(ownerKey);
  const welcomeRow = await pendingFor(ownerKey, "welcome");
  const freeRow = await pendingFor(ownerKey, "free");
  const free = freeWakeState(visitor.lastFreeWakeAt, Date.now());
  return {
    welcomeGranted: visitor.welcomeWakesGranted === 1,
    needsSeed: visitor.welcomeWakesGranted === 1 && !welcomeRow && visitor.welcomeClaimed !== 1,
    welcome: welcomeRow ? await waitingPayload(welcomeRow) : null,
    freeWake: freeRow ? await waitingPayload(freeRow) : null,
    freeWakeAvailable: free.available,
    nextFreeWakeAt: free.nextFreeWakeAt,
  };
}

/** First visit: hold the greeting Awoken apart. Idempotent — a second call
 *  returns the already-waiting one instead of making another. */
export async function seedWelcome(ownerKey: string, ownerName: string, body: unknown) {
  const { visitor } = await ensureVisitor(ownerKey);
  if (visitor.welcomeClaimed === 1) badRequest("Your welcome has already been received.");
  const existing = await pendingFor(ownerKey, "welcome");
  if (existing) return waitingPayload(existing);
  if (visitor.welcomeWakesGranted !== 1) badRequest("No welcome is waiting for this visitor.");
  const parsed = generationInput.safeParse(body);
  if (!parsed.success) {
    const details = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    badRequest(`That awakening could not be gathered. [${details}]`);
  }
  const awakened = await holdAwakening(ownerKey, ownerName, "welcome", parsed.data.layers, parsed.data.imageBase64, 0);
  return { awakened, respinsUsed: 0, respinsRemaining: 1 };
}

/** Accept the waiting Awoken into the Tender deck. */
export async function claimWelcome(ownerKey: string, body: unknown) {
  const parsed = z.object({ slot: slotSchema }).safeParse(body);
  if (!parsed.success) badRequest("Invalid claim.");
  await ensureVisitor(ownerKey);
  const existing = await pendingFor(ownerKey, parsed.data.slot);
  if (!existing) badRequest("Nothing is waiting to be claimed.");
  await db.delete(schema.pendingWelcomes).where(eq(schema.pendingWelcomes.id, existing.id));
  if (parsed.data.slot === "welcome") {
    await db.update(schema.visitors).set({ welcomeClaimed: 1 }).where(eq(schema.visitors.visitorId, ownerKey));
  }
  return { ok: true as const, awakenedId: existing.awakenedId };
}

/** Reconstitute the waiting matter into a new form. Exactly once per
 *  waiting Awoken — one free re-weaving per free generation. */
export async function reconstituteWelcome(ownerKey: string, ownerName: string, body: unknown) {
  const parsed = z.object({ slot: slotSchema }).merge(generationInput).safeParse(body);
  if (!parsed.success) badRequest("That reconstitution could not be gathered.");
  await ensureVisitor(ownerKey);
  const existing = await pendingFor(ownerKey, parsed.data.slot);
  if (!existing) badRequest("Nothing is waiting to be reconstituted.");
  if (existing.respinsUsed >= 1) {
    throw Object.assign(
      new Error("The matter has already been reconstituted once — this form is yours to keep or to release."),
      { status: 403 }
    );
  }
  const awakened = await holdAwakening(ownerKey, ownerName, parsed.data.slot, parsed.data.layers, parsed.data.imageBase64, 1);
  await removePending(existing);
  return { awakened, respinsUsed: 1, respinsRemaining: 0 };
}

/** Receive the 4-hourly free wake. One at a time: an unclaimed waiting one
 *  is released back into the matter when the new one arrives. */
export async function claimFreeWake(ownerKey: string, ownerName: string, body: unknown) {
  const parsed = generationInput.safeParse(body);
  if (!parsed.success) {
    const details = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    badRequest(`That awakening could not be gathered. [${details}]`);
  }
  const { visitor } = await ensureVisitor(ownerKey);
  const free = freeWakeState(visitor.lastFreeWakeAt, Date.now());
  if (!free.available) {
    throw Object.assign(new Error("The next free wake is still gathering — it arrives in its own time."), { status: 429 });
  }
  const old = await pendingFor(ownerKey, "free");
  if (old) await removePending(old);
  const awakened = await holdAwakening(ownerKey, ownerName, "free", parsed.data.layers, parsed.data.imageBase64, 0);
  await db.update(schema.visitors).set({ lastFreeWakeAt: new Date() }).where(eq(schema.visitors.visitorId, ownerKey));
  return { awakened, respinsUsed: 0, respinsRemaining: 1 };
}
