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
  // The width is clause law now (the Living Wheel): the
  // seed writes the party stars' company clauses (the Wide
  // Heart +1; each second-arm party star +2 — zodiacLive.ts).
  // Beneath the clauses stands the level base (Nigel, 2026-10-18);
  // an unknown level (an unbound seat) keeps the old full base.
  const base = tenderLevel == null ? COMPANY_BASE : bandBaseForLevel(tenderLevel);
  return base + fxSum(ownerKey, "company");
}

/** SUMMONER'S POWER (Nigel, 2026-10-21 17:13 — ruled while
 *  the wheel summoning build stood in progress): the term a
 *  Tender's summon cast rolls with, beside the gift and the
 *  curse's −3. Three grants summed:
 *    1. THE ZODIAC CLAUSE — stars carrying a "summoner"
 *       clause add their amounts, read through fxSum like
 *       every other clause sum ("company", "party"). The
 *       stars arrived with the effects build (Recovery #1,
 *       2026-10-23): the wheel's eight Summoner's Power
 *       stars carry the clause at their deepened values
 *       (the dictation's step for this family stands open;
 *       the held reading is +1 per level, deepened like
 *       every grant — flagged in the build report).
 *    2. LEVELS — THE SPREAD (Nigel, 2026-10-22): the
 *       dictation's +6 total, spread over the road — +1
 *       per 7 tender levels, +6 in all, the whole of it
 *       standing at level 42: min(6, ⌊level / 7⌋). The
 *       pre-Spread shape (+2 per 3 levels, +28 by 42) is
 *       struck whole — the re-curve is this build's.
 *    3. THE SAGE — +3 flat when the caster's class is Sage,
 *       read off the seat's bound class.
 *  One helper, so the summon cast's reckoning is the only
 *  reckoning there is. */
export function summonersPowerFor(ownerKey: string | null | undefined, tenderLevel?: number | null, classKey?: string | null): number {
  const fromLevels = Math.min(6, Math.floor(Math.max(0, tenderLevel ?? 0) / 7));
  return fxSum(ownerKey, "summoner") + fromLevels + (classKey === "sage" ? 3 : 0);
}

/** THE COMPANY BONUSES (Nigel, 2026-10-22 12:27 — set while
 *  editing the class cards, and entered in the class-cards
 *  spreadsheet as the CURRENT bonuses; coded in 2026-10-23,
 *  Recovery R7). What a Tender's company gains from her
 *  class, one honest reader per bonus, read by every path
 *  that reckons it on either ground:
 *    WARDEN     — her Awokin gain +4 AC.
 *    SAGE       — her Awokin gain +2 AC and +2 attack (the
 *                 attack half was already read at the strike
 *                 sites; the AC half reads through the same
 *                 reader below, so both grounds' AC agrees).
 *    RUNEWRIGHT — her Awokin suffer less curse damage: the
 *                 damage is relieved by 1 to start, the
 *                 relief growing +1 at every 3rd tender
 *                 level (Lv 3 → 2, Lv 6 → 3…). The relief is
 *                 reckoned per BEAT of the curse's own clock
 *                 (2.8 s), the grain attrition itself is
 *                 reckoned in on both grounds.
 *    BINDER     — healing from Binding workings +4: every
 *                 heal a Binding working of hers lands is
 *                 4 greater.
 *    WITCH      — party members she has cast grant a
 *                 half-energy bonus to her casting until
 *                 they dissipate: while one stands, her
 *                 casting costs half (halved upward, the
 *                 Second Wall's own rounding). Whether a
 *                 cast member stands is each ground's fact —
 *                 the readers below take it as given, so the
 *                 price reckoning is one reckoning. */
export function companyAcBonusFor(classKey: string | null | undefined, ownerKey?: string | null): number {
  // THE DEEPENING STARS (the zodiac's company stars; wired
  // with the effects build, 2026-10-25): a Warden who holds
  // her company stars stands her Awokin higher still — the
  // stars' own words, "+1 AC beyond the base +4", deepened
  // (w_b4, w_k: companyAcWarden); a Sage's company stars
  // likewise (s_a4, s_a12, s_b8: companyAcSage). The sums
  // ride only on their own class: a star deepens a base
  // the holder's class actually grants.
  if (classKey === "warden") return 4 + fxSum(ownerKey, "companyAcWarden");
  if (classKey === "sage") return 2 + fxSum(ownerKey, "companyAcSage");
  return 0;
}
export function curseReliefFor(classKey: string | null | undefined, tenderLevel?: number | null, ownerKey?: string | null): number {
  if (classKey !== "runewright") return 0;
  // THE DEEPENING STAR (r_k, THE MARK THAT SPEAKS):
  // "curse relief deepens by −1 more, beyond the base
  // formula" — relief +2 at its tier, read as the
  // companyRelief sum, on the base formula as it stands.
  return 1 + Math.floor(Math.max(0, tenderLevel ?? 0) / 3) + fxSum(ownerKey, "companyRelief");
}
export function bindingHealBonusFor(classKey: string | null | undefined, ownerKey?: string | null): number {
  // THE DEEPENING STARS (b_k, b_b7, b_b13): "Binding
  // healing +1 more, beyond the base +4", deepened — the
  // companyHeal sum, a Binder's alone to deepen.
  return classKey === "binder" ? 4 + fxSum(ownerKey, "companyHeal") : 0;
}
/** THE SAGE'S COMPANY ATTACK, one reckoning (the base +2
 *  stood inline at the strike sites since Phase C; gathered
 *  here with the effects build so its deepening has one
 *  home): her Awokin strike at +2, deepened by her company
 *  stars (s_a8, s_a15, s_k: "+1 attack beyond the base
 *  +2", deepened — the companyAbSage sum). Every other
 *  class's company strikes at the plain measure. */
export function companyAttackBonusFor(classKey: string | null | undefined, ownerKey?: string | null): number {
  return classKey === "sage" ? 2 + fxSum(ownerKey, "companyAbSage") : 0;
}
/** THE WITCH'S COMPANY SCOPE STARS (wi_b8 THE HAIL'S MERCY
 *  and wi_k SONG AND STORM; their grants are scope, not
 *  numbers — "the half-energy casting bonus from cast
 *  party members also covers the Awokin the tender summons
 *  at the Table"): a Witch holding either star reckons
 *  ANY Awokin she has standing at the Table as a cast
 *  party member for her company price, party member or
 *  not. Keeper-wired in code (the stars stand in
 *  BESPOKE_IDS), read by the Table's witchCompanyPrice.
 *  On the homeland the star names no ground: a summoned
 *  Awokin there follows and is of her party by the cast's
 *  own enrolment, so the scope is already whole there. */
export function witchCompanyScopeFor(ownerKey: string | null | undefined): boolean {
  const h = heldSkills(ownerKey);
  return h.has("wi_b8") || h.has("wi_k");
}
/** THE CLASS QUICKNESS LADDER (Nigel, 2026-10-22 04:22; the
 *  jump gap doubled 11:55 and the speed gap doubled 11:56 the
 *  same day; coded in 2026-10-23, Recovery R14): WARDEN +0,
 *  RUNEWRIGHT +1, BINDER +2, WITCH +3, SAGE +4 — one ordering
 *  on movement speed, jump height and jump distance. THE
 *  reckoning lives in the client's jump engine
 *  (client/src/jump.ts: QUICK, ladderSpeedOf, JPHYS), which
 *  every client surface that moves a Tender figure reads;
 *  these two readers are its server mirror, read by the one
 *  server path that moves a Tender figure — the Table's
 *  glide (server/src/table.ts, integrate). The R14 drive
 *  proves the mirror agrees with the reckoning number for
 *  number, classless included: an unknown or unchosen class
 *  stands on the base rung (+0), the Warden's figures. */
export function quicknessStepFor(classKey: string | null | undefined): number {
  switch (classKey) {
    case "runewright": return 1;
    case "binder": return 2;
    case "witch": return 3;
    case "sage": return 4;
    default: return 0;
  }
}
/** The ladder's run speed for a class, in the Proving
 *  Ground's demo px/s: 165 + 30 a step (165/195/225/255/285).
 *  A surface with its own standing Warden pace raises that
 *  pace by this speed's ratio to the base 165 — the Table's
 *  glide keeps its 30 px/s at the Warden rung. */
export function quicknessSpeedFor(classKey: string | null | undefined): number {
  return 165 + 30 * quicknessStepFor(classKey);
}
/** THE BINDER'S RANGE (Nigel, 2026-10-22 — entered in the
 *  class-cards spreadsheet beside the Attune ×3 ruling:
 *  "her Binding workings that heal have 2× range"; coded
 *  in 2026-10-23, Recovery R9): every range a Binding
 *  healing working is reckoned by — the Heal cast's reach
 *  from the caster's stand, the Springleaf's planting reach
 *  and the radius of the grove she plants (the measure its
 *  bursts and its per-beat mending reach by, on both
 *  grounds) — is TWICE the standing measure when the
 *  caster is a Binder, and the standing measure for every
 *  other hand. The AMOUNT is not this reader's business:
 *  it stands in bindingHealBonusFor above (+4, Recovery
 *  R7), read separately, never doubled here. One helper,
 *  so both grounds' range reckoning is the only reckoning
 *  there is. */
export function bindingHealRangeFor(classKey: string | null | undefined, baseRange: number): number {
  return classKey === "binder" ? baseRange * 2 : baseRange;
}
export function witchCastCostFor(classKey: string | null | undefined, cost: number, castPartyMemberStanding: boolean): number {
  if (classKey !== "witch" || !castPartyMemberStanding) return cost;
  return Math.ceil(cost / 2);
}

/** THE WITCH'S MISCAST MERCY (Nigel, 2026-10-22 — the class
 *  cards and their spreadsheet: "Half the spent energy
 *  returns on a miscast"; coded in 2026-10-23, Recovery R8):
 *  when a Witch's cast FIZZLES — the roll falls short and
 *  the working unravels, on either ground — this share of
 *  the energy the cast ACTUALLY charged returns to her
 *  purse. The share is reckoned on what was actually paid,
 *  after every other price reckoning that already applied
 *  (her half-energy company price above included), never on
 *  the book's sticker price, and it can never exceed what
 *  was paid. Every other class's fizzle still spends the
 *  whole charge, exactly as before, and a cast that STANDS
 *  refunds nothing to anyone.
 *  THE PERCENTAGE AND ITS SLIDER: Nigel ruled (2026-10-23)
 *  that the mercy "should work on the percentage slider it
 *  should" — 50% is the standing value he ruled on
 *  2026-10-22. NO SLIDER EXISTS in the game today: no
 *  per-tender or per-Witch percentage is stored in any
 *  setting, tender record or class data (searched in this
 *  build). So the reckoning below reads the standing ruled
 *  value, WITCH_MISCAST_MERCY_PERCENT; the day a slider is
 *  built — its natural home would be a per-tender setting
 *  beside the class record, or a workshop ui_config value —
 *  this constant is the one place its value should be read
 *  through. No slider UI is built in this build.
 *  The share of an odd payment rounds DOWN (a 3✦ fizzle
 *  returns 1✦): the mercy never rounds itself into more
 *  than half, and energy is counted whole on both grounds. */
export const WITCH_MISCAST_MERCY_PERCENT = 50;
export function witchMiscastRefundFor(classKey: string | null | undefined, paid: number): number {
  if (classKey !== "witch") return 0;
  const p = Math.max(0, Math.floor(paid));
  if (p <= 0) return 0;
  return Math.min(p, Math.floor((p * WITCH_MISCAST_MERCY_PERCENT) / 100));
}

/** ATTUNEMENT REACH (Nigel, 2026-10-21 16:40 — struck the
 *  Keeper's first no-limit pencil): the Attune ability's
 *  reach is ONE TILE away from where the Tender stands —
 *  his hex and its ring — PLUS a skill bonus, and the
 *  bonus is a zodiac skill effect like any other: stars
 *  carrying an "attuneReach" clause widen the reach by
 *  their amounts, read through fxSum like every other
 *  clause sum ("company", "party", "summoner"). NO star
 *  on the v2 wheel carries it (the effects build seated
 *  every grant the wheel's texts name, and reach is not
 *  among them); the reader stands and returns 0 cleanly
 *  until a star does
 *  do. One helper, so every attune door's reckoning is the
 *  only reckoning there is: the doors add their ring (1) to
 *  this sum. */
export function attuneReachFor(ownerKey: string | null | undefined): number {
  return fxSum(ownerKey, "attuneReach");
}

/** THE PARTY LEVEL (Nigel, 2026-10-21 — the fold-in: "party
 *  size comes from a party level, and the party level is a
 *  skill"): the Party skill's stars each carry one party
 *  level as a clause, and the level a Tender stands at is
 *  the sum of the levels their held stars carry. The
 *  party's WIDTH was reckoned from it in party.ts until
 *  Nigel's ruling of 2026-10-22 ("each party star is a
 *  spot") moved the reckoning onto the party stars' own
 *  "company" clauses; this reader stands for any "party"
 *  clauses the Starwright writes by hand. companyCapFor itself
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
