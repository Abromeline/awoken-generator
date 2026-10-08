// The Grove Fund: a share of every wake pack accrues toward planting native
// trees ($1 of every $5 pack by default).
//
// Fulfillment is MANUAL for now: once a month Nigel checks /api/grove,
// donates the accrued dollars to One Tree Planted (or another native-species
// project), and records the planting here. The ledger convention is simple:
//   - grove_cents_accrued: lifetime dollars grown for the grove (never decreases)
//   - grove_trees_planted: trees actually planted via monthly donations
//
// Future: an Ecologi (or similar) auto-plant integration can hook into this
// same accumulator — keep calling groveAccrue() on each pack sale (already
// wired in the Stripe webhook) and add a groveDisburse() that calls their
// planting API, then records the result with recordPlanting(). The Ecologi
// integration itself is NOT built yet, by design.

import { z } from "zod";
import { db, eq, schema } from "./store.js";
import { GROVE_PER_PACK_CENTS } from "./config.js";

const ACCRUED_KEY = "grove_cents_accrued";
const PLANTED_KEY = "grove_trees_planted";
const LAST_NOTE_KEY = "grove_last_note";

async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

async function getInt(key: string): Promise<number> {
  const raw = await getSetting(key);
  const parsed = raw === null ? 0 : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/** Add a pack's grove share to the accumulator. Idempotent callers only. */
export async function groveAccrue(cents: number): Promise<void> {
  if (!Number.isInteger(cents) || cents <= 0) return;
  await setSetting(ACCRUED_KEY, String((await getInt(ACCRUED_KEY)) + cents));
}

export async function groveStatus() {
  const centsAccrued = await getInt(ACCRUED_KEY);
  const treesPlanted = await getInt(PLANTED_KEY);
  return {
    centsAccrued,
    dollarsAccrued: `$${(centsAccrued / 100).toFixed(2)}`,
    treesPlanted,
    perPackCents: GROVE_PER_PACK_CENTS,
    perPackLabel: `$${(GROVE_PER_PACK_CENTS / 100).toFixed(2)}`,
  };
}

/** Workshop-only (until accounts exist): record a monthly tree donation. */
export async function recordPlanting(body: unknown) {
  const parsed = z
    .object({
      trees: z.number().int().min(1).max(100_000),
      note: z.string().trim().max(280).optional().default(""),
    })
    .safeParse(body);
  if (!parsed.success) throw Object.assign(new Error("Invalid planting record."), { status: 400 });
  const treesPlanted = (await getInt(PLANTED_KEY)) + parsed.data.trees;
  await setSetting(PLANTED_KEY, String(treesPlanted));
  if (parsed.data.note) await setSetting(LAST_NOTE_KEY, parsed.data.note);
  return { ok: true as const, treesPlanted };
}
