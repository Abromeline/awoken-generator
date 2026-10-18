import { sqlite } from "./store.js";

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
  /** Ebb Walker: the Coil returns +1⚡ more per dark turned. */
  coilReturn: number;
  /** Millwright: the Engine sings +1⚡ more, and its brightening is +2. */
  millwright: boolean;
  engineEnergy: number;
  /** Hungry Ink: when your rune fells the dark, +1⚡. */
  hungryInk: boolean;
  /** The Lowered Crown: the Crown Shard feeds on power 4+. */
  crownThreshold: number | null;
  /** Split Writing: the Three Blades may plant a fourth blade. */
  bladesExtra: number;
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
  };
}
