// Self-serve Tender accounts: a secret code + password. No email, no OAuth.
//
// A Tender claims a code on first visit (given one, or their own), sets a
// password, and that's their identity — same browser, new device, anywhere.
// Sessions are DB-backed so logins survive restarts. The 20 welcome wakes
// are granted once per tender account, keyed to the tender — not to the
// soft browser visitor — which closes the clear-storage farming loop.

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./store.js";
import { suggestTenderName } from "./naming.js";
import { grantCredits } from "./credits.js";
import { CREDITS_PER_PACK } from "./config.js";

export type TenderRow = typeof schema.tenders.$inferSelect;

/** Owner key used for credits, welcome state, and deck ownership. */
export function tenderOwnerKey(tenderId: number): string {
  return `tender:${tenderId}`;
}

// ---------------------------------------------------------------------------
// Passwords (scrypt, stdlib only)
// ---------------------------------------------------------------------------

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, expected] = parts;
  const actual = scryptSync(password, salt, 32);
  const expectedBuf = Buffer.from(expected, "hex");
  if (actual.length !== expectedBuf.length) return false;
  return timingSafeEqual(actual, expectedBuf);
}

// ---------------------------------------------------------------------------
// Secret codes
// ---------------------------------------------------------------------------

const codeWords = [
  "EMBER", "MOSS", "RAIN", "INK", "POND", "MOON", "FERN", "STONE",
  "BELL", "WREN", "THORN", "REED", "FROST", "LOAM", "DRIFT", "HUSH",
];

const codeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no lookalikes

function codeSegment(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (const b of bytes) out += codeAlphabet[b % codeAlphabet.length];
  return out;
}

/** An in-voice secret code, e.g. EMBER-4X7K-2P9Q. Unique-checked by caller. */
export function generateTenderCode(): string {
  const word = codeWords[Math.floor(Math.random() * codeWords.length)];
  return `${word}-${codeSegment(4)}-${codeSegment(4)}`;
}

export const codeSchema = z
  .string()
  .trim()
  .min(4)
  .max(32)
  .regex(/^[A-Za-z0-9-]+$/, "Letters, numbers, and dashes only.")
  .transform((s) => s.toUpperCase());

async function codeTaken(code: string): Promise<boolean> {
  const rows = await db.select({ id: schema.tenders.id }).from(schema.tenders).where(eq(schema.tenders.code, code)).limit(1);
  return rows.length > 0;
}

/** A fresh, unused code for the claim screen (with re-roll). */
export async function suggestTenderCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = generateTenderCode();
    if (!(await codeTaken(code))) return code;
  }
  // Vanishingly unlikely; fall back to a longer random code.
  return `TENDER-${codeSegment(6)}-${codeSegment(6)}`;
}

// ---------------------------------------------------------------------------
// Sessions & identity
// ---------------------------------------------------------------------------

const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // ~90 days

export async function createSession(tenderId: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await db.insert(schema.tenderSessions).values({ token, tenderId, createdAt: new Date() });
  return token;
}

export async function tenderFromToken(token: unknown): Promise<TenderRow | null> {
  if (typeof token !== "string" || !token) return null;
  const rows = await db.select().from(schema.tenderSessions).where(eq(schema.tenderSessions.token, token)).limit(1);
  const session = rows[0];
  if (!session) return null;
  if (Date.now() - session.createdAt.getTime() > SESSION_TTL_MS) {
    await db.delete(schema.tenderSessions).where(eq(schema.tenderSessions.token, token));
    return null;
  }
  const tenderRows = await db.select().from(schema.tenders).where(eq(schema.tenders.id, session.tenderId)).limit(1);
  return tenderRows[0] ?? null;
}

export async function destroySession(token: unknown): Promise<void> {
  if (typeof token !== "string" || !token) return;
  await db.delete(schema.tenderSessions).where(eq(schema.tenderSessions.token, token));
}

export function tenderTokenFromHeader(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const token = value.trim();
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export function publicTender(tender: TenderRow): { code: string; tenderName: string | null } {
  return { code: tender.code, tenderName: tender.tenderName };
}

// ---------------------------------------------------------------------------
// Claim / login
// ---------------------------------------------------------------------------

function badRequest(message: string): never {
  throw Object.assign(new Error(message), { status: 400 });
}

/**
 * Claim a secret code as a new Tender account. Migrates the current soft
 * visitor's state (credits, welcome progress, waiting Awoken) onto the new
 * account so nothing is stranded — and so an already-welcomed browser does
 * not grant itself a second 20.
 */
export async function claimTender(args: unknown, softVisitorId: string | null): Promise<{ token: string; tender: { code: string; tenderName: string | null }; twinBirthed?: boolean }> {
  const parsed = z
    .object({ password: z.string().min(8).max(128), refCode: z.string().max(20).optional() })
    .safeParse(args);
  if (!parsed.success) badRequest("A password of at least 8 characters.");
  // The key is given, never chosen — it is the account's immutable lock.
  const code = await suggestTenderCode();
  const tenderRows = await db
    .insert(schema.tenders)
    .values({ code, passwordHash: hashPassword(parsed.data.password), tenderName: null, createdAt: new Date() })
    .returning();
  const tender = tenderRows[0];
  if (!tender) badRequest("The Tender could not be gathered.");

  const ownerKey = tenderOwnerKey(tender.id);
  // Migrate the soft visitor's state, if any. A browser that already
  // received its welcome keeps it — no second 20.
  let granted = false;
  if (softVisitorId) {
    const softRows = await db.select().from(schema.visitors).where(eq(schema.visitors.visitorId, softVisitorId)).limit(1);
    const soft = softRows[0];
    if (soft) {
      await db.update(schema.creditLedger).set({ userId: ownerKey }).where(eq(schema.creditLedger.userId, softVisitorId));
      await db.update(schema.pendingWelcomes).set({ visitorId: ownerKey }).where(eq(schema.pendingWelcomes.visitorId, softVisitorId));
      await db.insert(schema.visitors).values({
        visitorId: ownerKey,
        createdAt: new Date(),
        welcomeWakesGranted: soft.welcomeWakesGranted,
        welcomeClaimed: soft.welcomeClaimed,
        lastFreeWakeAt: soft.lastFreeWakeAt,
      });
      // Do NOT delete the soft row: it stays dormant so logging out later
      // cannot re-trigger a fresh welcome for the same browser.
      granted = soft.welcomeWakesGranted === 1;
    }
  }
  if (!granted) {
    const existing = await db.select().from(schema.visitors).where(eq(schema.visitors.visitorId, ownerKey)).limit(1);
    if (!existing[0]) {
      await db.insert(schema.visitors).values({
        visitorId: ownerKey, createdAt: new Date(), welcomeWakesGranted: 1, welcomeClaimed: 0, lastFreeWakeAt: new Date(),
      });
    } else if (existing[0].welcomeWakesGranted !== 1) {
      await db.update(schema.visitors).set({ welcomeWakesGranted: 1 }).where(eq(schema.visitors.visitorId, ownerKey));
    }
    await grantCredits(ownerKey, CREDITS_PER_PACK, "welcome");
  }

  const fresh = await db.select().from(schema.tenders).where(eq(schema.tenders.id, tender.id)).limit(1);
  // Referral: if a refCode was provided, birth a twin of the inviter's champion (or random Awoken)
  let twinBirthed = false;
  if (parsed.data.refCode) {
    const refRows = await db.select().from(schema.referralCodes)
      .where(eq(schema.referralCodes.code, parsed.data.refCode.toUpperCase())).limit(1);
    if (refRows.length) {
      const inviterKey = refRows[0].inviterKey;
      // Prefer the inviter's champion, else a random Awoken
      let source = null;
      const champRows = await db.select().from(schema.tenderChampions)
        .where(eq(schema.tenderChampions.ownerKey, inviterKey)).limit(1);
      if (champRows.length) {
        const a = await db.select().from(schema.awakened)
          .where(eq(schema.awakened.id, champRows[0].awakenedId)).limit(1);
        if (a.length) source = a[0];
      }
      if (!source) {
        const owned = await db.select().from(schema.awakened)
          .where(and(eq(schema.awakened.ownerKey, inviterKey), eq(schema.awakened.collection, "tender")))
          .limit(1);
        if (owned.length) source = owned[0];
      }
      if (source) {
        // Twin: same identityKey → duplicate empowerment bonus applies to both
        await db.insert(schema.awakened).values({
          name: "Twin of " + source.name,
          imageBlobKey: source.imageBlobKey,
          compositionJson: source.compositionJson,
          collection: "tender",
          ownerName: publicTender(fresh[0] ?? tender).tenderName ?? "Tender",
          ownerKey,
          identityKey: source.identityKey,
          iteration: source.iteration,
          flavorText: "Born of fellowship — a twin woken when a friend arrived.",
        });
        twinBirthed = true;
      }
    }
  }

  const token = await createSession(tender.id);
  return { token, tender: publicTender(fresh[0] ?? tender), twinBirthed };
}

/** Log in with Tender name + password, or secret key + password as fallback. */
export async function loginTender(args: unknown): Promise<{ token: string; tender: { code: string; tenderName: string | null } }> {
  const parsed = z.object({ identity: z.string().trim().min(1).max(64), password: z.string().min(1).max(128) }).safeParse(args);
  if (!parsed.success) badRequest("A Tender name (or secret key) and password are needed.");
  const identity = parsed.data.identity;
  // Try the name first, then the immutable key.
  let rows = await db.select().from(schema.tenders).where(eq(schema.tenders.tenderName, identity)).limit(1);
  if (!rows[0]) {
    rows = await db.select().from(schema.tenders).where(eq(schema.tenders.code, identity)).limit(1);
  }
  const tender = rows[0];
  if (!tender || !verifyPassword(parsed.data.password, tender.passwordHash)) {
    throw Object.assign(new Error("That name (or key) and password do not match any Tender."), { status: 401 });
  }
  const token = await createSession(tender.id);
  return { token, tender: publicTender(tender) };
}

/** Set (or change) the Tender's name — the naming ritual and later renames.
 *  Names are unique: they are the login identity. */
export async function setTenderName(tenderId: number, args: unknown): Promise<{ tenderName: string }> {
  const parsed = z.object({ name: z.string().trim().min(2).max(40) }).safeParse(args);
  if (!parsed.success) badRequest("A Tender name is 2–40 characters.");
  const name = parsed.data.name;
  const taken = await db.select({ id: schema.tenders.id }).from(schema.tenders).where(eq(schema.tenders.tenderName, name)).limit(1);
  if (taken[0] && taken[0].id !== tenderId) {
    throw Object.assign(new Error("That name is already held by another Tender — choose another."), { status: 409 });
  }
  await db.update(schema.tenders).set({ tenderName: name }).where(eq(schema.tenders.id, tenderId));
  // Keep already-woken creatures' attribution in step.
  await db
    .update(schema.awakened)
    .set({ ownerName: name })
    .where(eq(schema.awakened.ownerKey, tenderOwnerKey(tenderId)));
  return { tenderName: name };
}

export function newTenderNameSuggestion(): string {
  return suggestTenderName();
}
