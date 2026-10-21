import { sqlite } from "./store.js";
import { liveById, type FxClause } from "./zodiacLive.js";

/**
 * THE SKILL ZODIAC'S EFFECTS — tranche one: THE WARD & RUNE
 * WORKINGS (Nigel's choosing, relayed by Law, 2026-10-17).
 * The Warden's and Runewright's sides, the cluster notables
 * that speak to workings, the Mending Wall, and the canopy
 * hybrids that answer workings wake first; the Fate
 * referee's AC hooks wait their turn after this tranche.
 *
 * Effects ride the snapshot law: cast-time modifiers bake
 * into a working's numbers exactly as the Pour does, so a
 * skill released later never rewrites a working already
 * standing. Round behaviors (the keystone's answer, the
 * Trees' deeper regrow, the Mending Wall's hospital) read
 * the holder's skills live, as the referee does.
 */
export function heldSkills(ownerKey: string | null | undefined): Set<string> {
  if (!ownerKey) return new Set();
  try {
    const rows = sqlite.prepare("SELECT skill_key FROM tender_skills WHERE owner_key = ?").all(ownerKey) as { skill_key: string }[];
    return new Set(rows.map(r => r.skill_key));
  } catch {
    return new Set();
  }
}

/** The Heart of the wheel (wired 2026-10-18, on Nigel's word
 *  that the Heart comes next): the CORE ring and the passive
 *  spine, each promise read off the tree's own copy —
 *    c_hp1  Strong Hands       Tender HP +5
 *    c_en   Deep Breath        Maximum energy +3 (Table/Bastion —
 *                              applied at the Table seat, not the
 *                              map's energy law, as its copy says)
 *    c_heal The Mending Art    Heal +3
 *    c_harv The Harvest        your Awoken fell the dark: +1✦
 *    c_steady Steady Attention first ward or rune each battle −1✦
 *    c_hp2  The Long Watch     Tender HP +5 and Heal +2
 *    p_constitution Ember Constitution  Tender HP +4
 *    p_breath The Returning Breath      +1✦ at each battle round's start
 *    p_blood  The Returning Blood       mend 1 HP at each battle round's start
 *    p_skin   The Thickened Skin        strikes against your Tender deal 1 less (min 1)
 *  HP and Heal ride the Tender-progress view (tenderExp), so
 *  every surface that reads a Tender's standing agrees; the
 *  battle-shaped ones are applied by the Table's referee. */
export interface HeartEffects {
  tenderHp: number;
  heal: number;
  tableEnergy: number;
  harvestAmount: number;
  steadyAmount: number;
  breathAmount: number;
  bloodAmount: number;
  skinAmount: number;
}
export function heartEffects(ownerKey: string | null | undefined): HeartEffects {
  // The Heart's law is now read off the stars' clauses (the
  // Living Wheel): the seed writes these exact numbers onto
  // the Heart's nodes, and the Starwright may re-write them.
  return {
    tenderHp: fxSum(ownerKey, "tenderHp"),
    heal: fxSum(ownerKey, "heal"),
    tableEnergy: fxSum(ownerKey, "tableEnergy"),
    harvestAmount: fxSum(ownerKey, "fellHarvest"),
    steadyAmount: fxSum(ownerKey, "firstWorkingDiscount"),
    breathAmount: fxSum(ownerKey, "roundEnergy"),
    bloodAmount: fxSum(ownerKey, "roundMend"),
    skinAmount: fxSum(ownerKey, "tenderSkin"),
  };
}

/** The Travelling Company (ruled by Nigel, 2026-10-18; the base
 *  re-ruled the same day): at the Table a tender's STANDING band
 *  is capped by the tender's own level — three at Lv 1, four
 *  from Lv 3, and from Lv 6 the full and true five a full-
 *  fledged tender leads without skill unlocks — and the tree
 *  teaches a tender to lead more: the Escort (Warden), the
 *  Company Pennant (Binder) and the Written Retinue (Runewright)
 *  widen the band by two each, and the Binder's crown, THE
 *  WHOLE MUSTER, by four. The roster itself is never capped;
 *  only the band standing on the field at once. */
export const COMPANY_BASE = 5;
export function bandBaseForLevel(level: number): number {
  if (level >= 6) return 5;
  if (level >= 3) return 4;
  return 3;
}
export function companyCapFor(ownerKey: string | null | undefined, tenderLevel?: number | null): number {
  // The Muster's width is clause law now (the Living Wheel):
  // the seed writes +2/+2/+2/+4 onto the four company stars.
  // Beneath the clauses stands the level base (Nigel, 2026-10-18);
  // an unknown level (an unbound seat) keeps the old full base.
  const base = tenderLevel == null ? COMPANY_BASE : bandBaseForLevel(tenderLevel);
  return base + fxSum(ownerKey, "company");
}

/** THE PARTY LEVEL (Nigel, 2026-10-21 — the fold-in: "party
 *  size comes from a party level, and the party level is a
 *  skill"): the Party skill's stars each carry one party
 *  level as a clause, and the level a Tender stands at is
 *  the sum of the levels their held stars carry. The
 *  party's WIDTH is reckoned from it in party.ts: 3 spots
 *  to start, +1 for every 3 party levels, plus the Muster
 *  clauses summed above ("company"). companyCapFor itself
 *  is untouched — it remains the Table's standing-band law,
 *  a different count from the party's width. */
export function partyLevelFor(ownerKey: string | null | undefined): number {
  return fxSum(ownerKey, "party");
}

/**
 * The attunement GRANTS (tranche one): cluster steps grant
 * +3 attunement in their hue, notables +3 more, crowns +6
 * (the catalogue §5). Grants raise the Tender's STANDING
 * in a hue — they count toward levels everywhere a level
 * is derived (the Zodiac's gates, the pour's depth cap,
 * Shard Rain's dice, a hue's crowning total) — but the
 * SPENDABLE pool stays the earned points: a grant deepens
 * the well, it does not fill it.
 */
/** Every effect clause a Tender's held stars carry (the Living
 *  Wheel, 2026-10-18): the derivations below are sums over
 *  these, so a star the Ancient One re-writes in the workshop —
 *  or a new star he sets in the sky — moves the game's numbers
 *  exactly as its clauses say. */
export function heldClauses(ownerKey: string | null | undefined): FxClause[] {
  const byId = liveById();
  const out: FxClause[] = [];
  for (const k of heldSkills(ownerKey)) {
    const n = byId.get(k);
    if (n) out.push(...n.fx);
  }
  return out;
}
export function fxSum(ownerKey: string | null | undefined, verb: string): number {
  return heldClauses(ownerKey).filter(c => c.verb === verb).reduce((a, c) => a + c.amount, 0);
}

export function skillAttunementGrants(ownerKey: string | null | undefined): Record<string, number> {
  const grants: Record<string, number> = { tide: 0, sky: 0, stone: 0, root: 0, fire: 0 };
  for (const c of heldClauses(ownerKey)) {
    if (c.verb === "attunement" && c.el) grants[c.el] = (grants[c.el] ?? 0) + c.amount;
  }
  return grants;
}

export interface WorkingEffects {
  /** Thick Light: every ward +2 HP at its raising. */
  wardHp: number;
  /** The Living Wall: Trees +4 HP more. */
  treesHp: number;
  /** Thick Light: the Seal stops +1 strike. */
  sealStops: number;
  /** Deep Set: in Stone, the Seal stops +1 strike more. */
  deepSetSealStops: number;
  /** The Answer: riposte +1 wherever wards answer. */
  riposte: number;
  /** THE WALL THAT ANSWERS: a Seal's riposte is the striker's own power. */
  keystoneRiposte: boolean;
  /** Rooted Walls + The Quickening: the Trees regrow deeper each round. */
  treesRegrow: number;
  /** The Mending Wall: wards mend the most-hurt ally behind them, +1 a round. */
  mendingWall: boolean;
  /** Second Wall: once per battle, a ward at half cost. */
  secondWall: boolean;
  /** Deep Ink + INSCRIPTION EVERLASTING: rune harm deeper. */
  runePower: number;
  /** Patient Light + INSCRIPTION EVERLASTING: pins last longer. */
  runePin: number;
  /** The Second Humming + INSCRIPTION EVERLASTING: the Blade springs more. */
  bladeSprings: number;
  /** The Second Humming: the Coil may turn twice. */
  coilTurns: number;
  /** Ebb Walker: the Coil returns +1✦ more per dark turned. */
  coilReturn: number;
  /** Millwright: the Engine sings +1✦ more, and its brightening is +2. */
  millwright: boolean;
  engineEnergy: number;
  /** Hungry Ink: when your rune fells the dark, +1✦. */
  hungryInk: boolean;
  /** The Lowered Crown: the Crown Shard feeds on power 4+. */
  crownThreshold: number | null;
  /** Split Writing: the Three Blades may plant a fourth blade. */
  bladesExtra: number;
  /** The Banner's Reach: the Standard's blessing covers the
   *  hexes neighbouring its two as well. */
  bannerReach: boolean;
  /** The Bright Pillar: the Beacon's reach widens one ring,
   *  and dark lit by it is struck at +1 by the whole party. */
  brightPillar: boolean;
  /** Falling Light: the Beacon and the Crown Shard reckon
   *  their ground one ring wider. */
  fallingLight: boolean;
  /** Brand Walker: dark standing beside your Fire workings
   *  strikes at −1 power, lit and wary. */
  brandWalker: boolean;
  /** Ebb Walker: your Tide workings cost 1✦ less on Tide or
   *  neutral ground (the land's clause; the Table's field
   *  has no ground to judge, so it sleeps there). */
  ebbWalker: boolean;
  /** War Warden: a strike your ward stops also wounds the
   *  striker's hex-neighbours for 1. */
  warWarden: boolean;
  /** Lore Warden: a ward that falls leaves its edge written —
   *  the next ward raised on that edge stands at +2 HP. */
  loreWarden: boolean;
  /** Lore Binder: a sprung rune's binding echoes a round
   *  later at half strength. */
  loreBinder: boolean;
  /** Lore Runewright: the first time each of your runes
   *  springs in a battle, it pays you +1✦. */
  loreRunewright: boolean;
  /** The Remembering Ray: +1 Tender EXP whenever one of your
   *  wards or runes springs in battle. */
  rememberingRay: boolean;
  /** War Runewright: a rune sprung on dark that has not yet
   *  struck deals +2. */
  warRunewright: boolean;
  /** The Second Thread: once per battle, a sprung rune of
   *  yours is re-written on the same ground, free. */
  secondThread: boolean;
  /** The Ground Remembers: one rune per battle does not
   *  fade when the battle ends — it waits for the next. */
  groundRemembers: boolean;
  /** The Long Script: HELD, and ledgered — but its premise
   *  (runes laid from where a Runeing Awoken STANDS) is not
   *  law anywhere yet: neither the land's cast nor the
   *  Table's requires the writer to stand near the writing.
   *  Wiring it would mean inventing a restriction no one
   *  ruled. It wakes the day placement gains a standing
   *  law; until then it sleeps, named here rather than
   *  dressed as working. */
  longScript: boolean;
}

export function workingEffects(ownerKey: string | null | undefined): WorkingEffects {
  const h = heldSkills(ownerKey);
  const has = (k: string) => h.has(k);
  return {
    wardHp: has("w_thick") ? 2 : 0,
    treesHp: has("w_living") ? 4 : 0,
    sealStops: has("w_thick") ? 1 : 0,
    deepSetSealStops: has("stone_warden_n") ? 1 : 0,
    riposte: has("w_answer") ? 1 : 0,
    keystoneRiposte: has("w_key"),
    treesRegrow: (has("w_rooted") ? 1 : 0) + (has("root_binder_n") ? 1 : 0),
    mendingWall: has("b_mendwall"),
    secondWall: has("w_second"),
    runePower: (has("r_ink") ? 1 : 0) + (has("r_key") ? 2 : 0),
    runePin: (has("r_patient") ? 1 : 0) + (has("r_key") ? 1 : 0),
    bladeSprings: (has("r_hum") ? 1 : 0) + (has("r_key") ? 1 : 0),
    coilTurns: has("r_hum") ? 1 : 0,
    coilReturn: (has("tide_binder_n") || has("tide_runewright_n")) ? 1 : 0,
    millwright: has("w_mill"),
    engineEnergy: has("w_mill") ? 1 : 0,
    hungryInk: has("r_hungry"),
    crownThreshold: has("r_crown") ? 4 : null,
    bladesExtra: has("r_split") ? 1 : 0,
    bannerReach: has("w_banner"),
    brightPillar: has("w_pillar"),
    fallingLight: has("sky_runewright_n"),
    brandWalker: has("fire_warden_n"),
    ebbWalker: has("tide_binder_n") || has("tide_runewright_n"),
    warWarden: has("hybW_warground"),
    loreWarden: has("hybW_lore"),
    loreBinder: has("hybB_lore"),
    loreRunewright: has("hybR_lore"),
    rememberingRay: has("ray_lore"),
    warRunewright: has("hybR_warground"),
    secondThread: has("b_thread"),
    groundRemembers: has("r_remembers"),
    longScript: has("r_long"),
  };
}
