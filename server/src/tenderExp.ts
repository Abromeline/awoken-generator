/**
 * Tender EXP — the Tender's own growth (Nigel, 2026-10-16).
 *
 * A Tender earns EXP for the three works of tending: WAKING
 * Awoken, BATTLING with them, and RAISING them (leveling them
 * up). The level it buys gates the Tender's own arts:
 *
 *   Heal — held from Lv 1, strengthening every 3 levels
 *          (tier 1 +⌊level/3⌋; restores 5 × tier HP).
 *   Ward, Rune — unlocked at Lv 3.
 *
 * The wake rate is his anchor, verbatim: "waking the first
 * 20 Awoken gets you into Lv 3, but it slows down after
 * that." So a wake pays by lifetime count — 10 EXP for each
 * of the first ten wakes, 5 for the next ten (20 wakes =
 * 150 EXP = Lv 3 exactly), then 2, then 1. Battle and
 * raising awards ride awardTenderExp through the same
 * ledger; their rates are set where those systems live.
 */
import { db, schema } from "./store.js";
import { eq } from "drizzle-orm";

/** Cumulative EXP at which each level is reached (index 0 = Lv 1). */
export const TENDER_LEVEL_THRESHOLDS = [0, 50, 150, 300, 500, 800, 1200, 1800, 2600, 3800];

export function levelForExp(exp: number): number {
  let level = 1;
  for (let i = 0; i < TENDER_LEVEL_THRESHOLDS.length; i++) {
    if (exp >= TENDER_LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  return level;
}

/** EXP a wake pays, by how many wakes came before it. */
export function wakeExpFor(lifetimeWakesBefore: number): number {
  if (lifetimeWakesBefore < 10) return 10;
  if (lifetimeWakesBefore < 20) return 5;
  if (lifetimeWakesBefore < 40) return 2;
  return 1;
}

/** Heal strengthens every 3 levels: Lv 1–2 tier 1, Lv 3–5 tier 2, Lv 6–8 tier 3… */
export function healTierForLevel(level: number): number {
  return 1 + Math.floor(level / 3);
}
export function healAmountForLevel(level: number): number {
  return 5 * healTierForLevel(level);
}

export interface TenderProgressView {
  totalExp: number;
  lifetimeWakes: number;
  level: number;
  expIntoLevel: number;
  expForNextLevel: number | null;
  healTier: number;
  healAmount: number;
  wardRuneUnlocked: boolean;
}

function view(totalExp: number, lifetimeWakes: number): TenderProgressView {
  const level = levelForExp(totalExp);
  const floor = TENDER_LEVEL_THRESHOLDS[level - 1] ?? 0;
  const next = TENDER_LEVEL_THRESHOLDS[level] ?? null;
  return {
    totalExp,
    lifetimeWakes,
    level,
    expIntoLevel: totalExp - floor,
    expForNextLevel: next === null ? null : next - floor,
    healTier: healTierForLevel(level),
    healAmount: healAmountForLevel(level),
    wardRuneUnlocked: level >= 3,
  };
}

export async function getTenderProgress(ownerKey: string): Promise<TenderProgressView> {
  const [row] = await db.select().from(schema.tenderProgress)
    .where(eq(schema.tenderProgress.ownerKey, ownerKey)).limit(1);
  return view(row?.totalExp ?? 0, row?.lifetimeWakes ?? 0);
}

/** Award EXP for any work of tending; returns the Tender's new standing. */
export async function awardTenderExp(ownerKey: string, amount: number): Promise<TenderProgressView> {
  if (amount <= 0) return getTenderProgress(ownerKey);
  const now = new Date();
  const [row] = await db.select().from(schema.tenderProgress)
    .where(eq(schema.tenderProgress.ownerKey, ownerKey)).limit(1);
  if (row) {
    await db.update(schema.tenderProgress)
      .set({ totalExp: row.totalExp + amount, updatedAt: now })
      .where(eq(schema.tenderProgress.ownerKey, ownerKey));
  } else {
    await db.insert(schema.tenderProgress)
      .values({ ownerKey, totalExp: amount, lifetimeWakes: 0, updatedAt: now });
  }
  return getTenderProgress(ownerKey);
}

/** Award a wake: counts the wake and pays its (slowing) rate. */
export async function awardWakeExp(ownerKey: string): Promise<TenderProgressView> {
  const [row] = await db.select().from(schema.tenderProgress)
    .where(eq(schema.tenderProgress.ownerKey, ownerKey)).limit(1);
  const before = row?.lifetimeWakes ?? 0;
  const amount = wakeExpFor(before);
  const now = new Date();
  if (row) {
    await db.update(schema.tenderProgress)
      .set({ totalExp: row.totalExp + amount, lifetimeWakes: before + 1, updatedAt: now })
      .where(eq(schema.tenderProgress.ownerKey, ownerKey));
  } else {
    await db.insert(schema.tenderProgress)
      .values({ ownerKey, totalExp: amount, lifetimeWakes: 1, updatedAt: now });
  }
  return getTenderProgress(ownerKey);
}
