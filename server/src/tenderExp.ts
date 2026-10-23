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
import { and, eq } from "drizzle-orm";
import { heartEffects } from "./skills.js";

/**
 * Cumulative EXP at which each level is reached (index 0 = Lv 1).
 *
 * THE LONG ROAD (Nigel, ruled 2026-10-22; design:
 * zodiac-tree-design-v2-2026-10-22.md, "The long road"): the
 * Tender level cap is 104, and at 2 skill points a level the
 * cap pays exactly 208 — the whole v2 wheel's cost, with
 * nothing to spare. Levels 1–10 are the original table,
 * unchanged (his anchor stands: 150 EXP = Lv 3, and no stored
 * EXP total changes its level). Levels 11–42 are the sane
 * road: each step costs the previous step × 1.035, rounded to
 * the nearest 50 (ties to even), so Lv 42 stands at 73,150.
 * Past 42 the curve turns steep, baked into this table — the
 * same road for everyone, with no per-Tender or per-pathway
 * multiplier anywhere (his escalation ruling, 2026-10-22:
 * "Baked in: one steep road past 42, the same for
 * everyone"): Lv 43's step doubles Lv 42's, and each step
 * after grows × 1.05, so Lv 104 stands at 2,768,700.
 */
export const TENDER_LEVEL_THRESHOLDS = [
  0, 50, 150, 300, 500, 800, 1200, 1800, 2600, 3800,  // Lv 1–10
  5050, 6350, 7700, 9100, 10550, 12050, 13600, 15200, 16850, 18550,  // Lv 11–20
  20300, 22100, 23950, 25850, 27800, 29800, 31850, 33950, 36100, 38350,  // Lv 21–30
  40700, 43150, 45700, 48350, 51100, 53950, 56900, 59950, 63100, 66350,  // Lv 31–40
  69700, 73150, 80050, 87300, 94900, 102900, 111300, 120100, 129350, 139050,  // Lv 41–50
  149250, 159950, 171200, 183000, 195400, 208400, 222050, 236400, 251450, 267250,  // Lv 51–60
  283850, 301300, 319600, 338800, 358950, 380100, 402300, 425600, 450050, 475700,  // Lv 61–70
  502650, 530950, 560650, 591850, 624600, 659000, 695100, 733000, 772800, 814600,  // Lv 71–80
  858500, 904600, 953000, 1003800, 1057150, 1113150, 1171950, 1233700, 1298550, 1366650,  // Lv 81–90
  1438150, 1513250, 1592100, 1674900, 1761850, 1853150, 1949000, 2049650, 2155350, 2266350,  // Lv 91–100
  2382900, 2505300, 2633800, 2768700,  // Lv 101–104
];

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

/** A Tender's HP, by level (Nigel, 2026-10-16): 20 + 5 per
 *  level. And the shield law that governs how it is ever
 *  spent: a Tender's standing Awoken shield them — enemies
 *  strike the field first, and a Tender is hurt only when
 *  nothing stands, or by things whose nature names Tenders
 *  directly (the Hollow drains instead of wounding). The
 *  referee implements targeting by this law. */
export function tenderMaxHpForLevel(level: number): number {
  return 20 + 5 * level;
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
  maxTenderHp: number;
  /** The Class Gate (Nigel, 2026-10-19): the chosen class, or
   *  null before the Lv 3 choosing; whether the one free
   *  second-thoughts rite still waits; held reclass tokens. */
  classKey: string | null;
  classRiteAvailable: boolean;
  reclassTokens: number;
  /** THE RUNIC WEAPON (Nigel, 2026-10-19): the blade, spear or
   *  bow chosen with the class — null until the choosing's
   *  second gift is taken. */
  weaponKey: string | null;
  /** THE ARSENAL (Nigel, 2026-10-19): all four weapons, each
   *  leveled and attuned separately; weaponKey above is the one
   *  in hand. Pools ride along so the attune pour shows honest
   *  numbers (the Tender's aspect_attunement balances). */
  arsenal: { key: string; level: number; xp: number; element: string | null; depth: number; manifest: boolean; signature: boolean }[];
  pools: Record<string, number>;
}

export const ARSENAL_KEYS = ["swordshield", "sword", "spear", "arrow"];
export function defaultArsenal() {
  return ARSENAL_KEYS.map((key) => ({ key, level: 1, xp: 0, element: null as string | null, depth: 0, manifest: false, signature: false }));
}

function view(totalExp: number, lifetimeWakes: number, cls?: { classKey: string | null; classFreeRiteUsed: number; reclassTokens: number; weaponKey?: string | null }, extra?: { arsenal: TenderProgressView["arsenal"]; pools: Record<string, number> }): TenderProgressView {
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
    maxTenderHp: tenderMaxHpForLevel(level),
    classKey: cls?.classKey ?? null,
    classRiteAvailable: !!cls?.classKey && !cls.classFreeRiteUsed,
    reclassTokens: cls?.reclassTokens ?? 0,
    weaponKey: cls?.weaponKey ?? null,
    arsenal: extra?.arsenal ?? defaultArsenal(),
    pools: extra?.pools ?? {},
  };
}

/** The Heart rides the standing (2026-10-18): Strong Hands,
 *  the Long Watch, Ember Constitution and the Mending Art add
 *  their promised HP and heal to every reading of a Tender's
 *  progress, so the Table, the header and the map never
 *  disagree about the same Tender. */
function withHeart(ownerKey: string, v: TenderProgressView): TenderProgressView {
  const h = heartEffects(ownerKey);
  if (h.tenderHp) v.maxTenderHp += h.tenderHp;
  if (h.heal) v.healAmount += h.heal;
  return v;
}

export async function getTenderProgress(ownerKey: string): Promise<TenderProgressView> {
  const [row] = await db.select().from(schema.tenderProgress)
    .where(eq(schema.tenderProgress.ownerKey, ownerKey)).limit(1);
  if (row) {
    const wrows = await db.select().from(schema.tenderWeapons)
      .where(eq(schema.tenderWeapons.ownerKey, ownerKey));
    const arsenal = defaultArsenal().map((d) => {
      const r = wrows.find((w) => w.weaponKey === d.key);
      return r ? { key: d.key, level: r.level, xp: r.xp, element: r.attunementElement ?? null, depth: r.attunementDepth, manifest: !!(r as any).manifestNode, signature: !!(r as any).signatureNode } : d;
    });
    const prows = await db.select().from(schema.aspectAttunement)
      .where(eq(schema.aspectAttunement.ownerKey, ownerKey));
    const pools: Record<string, number> = {};
    for (const pr of prows) pools[pr.element] = pr.points;
    return withHeart(ownerKey, view(row.totalExp, row.lifetimeWakes, { classKey: (row as any).classKey ?? null, classFreeRiteUsed: (row as any).classFreeRiteUsed ?? 0, reclassTokens: (row as any).reclassTokens ?? 0, weaponKey: (row as any).weaponKey ?? null }, { arsenal, pools }));
  }
  // First reading for a Tender whose waking predates the
  // ledger (2026-10-16): their standing collection is the
  // record of their wakes — seed the ledger from it, so
  // history counts. What was dismissed is gone; what stands
  // is what their waking has made.
  const mine = await db.select({ id: schema.awakened.id }).from(schema.awakened)
    .where(and(eq(schema.awakened.ownerKey, ownerKey), eq(schema.awakened.collection, "tender")));
  const tenderOwned = mine.length;
  if (tenderOwned > 0) {
    let exp = 0;
    for (let i = 0; i < tenderOwned; i++) exp += wakeExpFor(i);
    await db.insert(schema.tenderProgress)
      .values({ ownerKey, totalExp: exp, lifetimeWakes: tenderOwned, updatedAt: new Date() })
      .catch(() => null);
    return withHeart(ownerKey, view(exp, tenderOwned));
  }
  return withHeart(ownerKey, view(0, 0));
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
