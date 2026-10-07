// Wake-credit ledger. One Wake One costs one credit. The Tender face spends;
// the workshop face (Nigel's own hand) never does.
import { sql } from "drizzle-orm";
import { db, eq, schema } from "./store.js";

/** Single implicit owner until Tender accounts exist. */
export const SINGLE_OWNER = "tender";

export async function creditBalance(userId: string = SINGLE_OWNER): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${schema.creditLedger.delta}), 0)` })
    .from(schema.creditLedger)
    .where(eq(schema.creditLedger.userId, userId));
  return rows[0]?.total ?? 0;
}

export async function grantCredits(
  userId: string,
  amount: number,
  reason: string,
  reference?: string
): Promise<number> {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Invalid credit grant.");
  await db.insert(schema.creditLedger).values({ userId, delta: amount, reason, reference: reference ?? null });
  return creditBalance(userId);
}

/** Returns false (without spending) when the vessel is empty. */
export async function spendWakeCredit(
  userId: string = SINGLE_OWNER
): Promise<{ ok: true; balance: number } | { ok: false; balance: number }> {
  const balance = await creditBalance(userId);
  if (balance < 1) return { ok: false, balance };
  await db.insert(schema.creditLedger).values({ userId, delta: -1, reason: "wake", reference: null });
  return { ok: true, balance: balance - 1 };
}

/** True when this payment reference was already credited (webhook idempotency). */
export async function alreadyCredited(reference: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.creditLedger.id })
    .from(schema.creditLedger)
    .where(eq(schema.creditLedger.reference, reference))
    .limit(1);
  return rows.length > 0;
}
