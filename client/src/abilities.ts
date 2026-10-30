/**
 * THE ABILITIES SECTION — the ability registry (2026-10-29).
 *
 * Nigel (2026-10-29 10:16): "add an ability section to their
 * wheel so it can catch and abilities from the list of
 * abilities we add. i will create a list of different powers
 * gated by different amounts of energy. i want that ability
 * tab to pull any ability that qualifies for casting with
 * their elemental powers levels. some abilities might require
 * multiple elements of a specific mix of them."
 *
 * This file is the registry's home on the client. Every
 * ability the wheel's Abilities section can offer stands here
 * as ONE entry: its name, the elemental amounts it requires
 * (a single element, or a MIX of elements that must be met
 * in full), and the words its row speaks. The section PULLS
 * the abilities an Awoken qualifies for from this list: an
 * Awoken qualifies when its own element sums meet every part
 * of an ability's requirement.
 *
 * The section stands on an Awoken's wheel only when at
 * least one ability qualifies — Nigel's ruling (2026-10-29
 * 10:19, tapped): "Only appears when an ability qualifies."
 * An Awoken qualifying for nothing shows no door, and no
 * locked or dimmed list stands in its place; the tab, once
 * opened, lists exactly the qualified abilities, and
 * tapping one begins its cast.
 *
 * THE REQUIREMENT TABLE IS ONE SOURCE WITH TWO READERS.
 * server/src/abilities.ts carries the same table for the
 * server's cast gates, in this codebase's buildGeometry
 * manner — two physical copies, one law, because the server
 * build roots itself in server/src and cannot reach across.
 * The two must never drift: scripts/drive-wheel-abilities.mjs
 * imports BOTH modules and fails if their tables disagree,
 * and the server judges every cast by its own copy at its
 * own door, whatever the wheel showed.
 *
 * ADDING AN ABILITY = one entry here (and its twin in
 * server/src/abilities.ts) + its cast hook in Territory.tsx
 * (beginAbility and its surface in the ability tab). No
 * wheel surgery.
 */

export type ElementName = "tide" | "sky" | "stone" | "root" | "fire";

/** The five elements, in the order a requirement is spoken. */
export const ELEMENTS: readonly ElementName[] = ["tide", "sky", "stone", "root", "fire"];

/** The elements' names as a player speaks them — stone is Rock. */
export const ELEMENT_WORD: Record<ElementName, string> = {
  tide: "Tide", sky: "Sky", stone: "Rock", root: "Root", fire: "Fire",
};

/** An Awoken's element sums: how much of each element its
 *  parts hold, counted the parts' way (a part is a point, an
 *  aspect part is its level in points) — the same reckoning
 *  the server serves with the field and judges casts by. */
export type ElementSums = Record<ElementName, number>;

/** What an ability asks of an Awoken: an amount per element.
 *  An element not named asks nothing; a named amount must be
 *  met in full — a mix is met whole or not at all. */
export type AbilityRequirement = Partial<Record<ElementName, number>>;

export interface AbilityDef {
  /** The registry's key — the cast hook in Territory answers to it. */
  key: string;
  /** The ability's name, as its row speaks it. */
  name: string;
  /** The ability's mark, worn on its row. */
  mark: string;
  /** The elemental amounts the casting Awoken must hold. */
  requires: AbilityRequirement;
  /** What the ability is, in a breath — spoken on its row. */
  blurb: string;
}

/** THE REGISTRY — the list the Abilities section catches
 *  from. Nigel authors the abilities; each stands here as it
 *  is ruled. Its first entry is BUILDING, the Stone Cast
 *  (2026-10-28): the stone build pieces, raised from the
 *  ground by a fielded Awoken holding at least 2 Rock. */
export const ABILITY_REGISTRY: readonly AbilityDef[] = [
  {
    key: "building",
    name: "Building",
    mark: "🪨",
    requires: { stone: 2 },
    blurb: "the stone build pieces",
  },
];

export function abilityByKey(key: string): AbilityDef | undefined {
  return ABILITY_REGISTRY.find(a => a.key === key);
}

/** THE ONE CHECKER: an Awoken qualifies for an ability when
 *  its element sums meet EVERY part of the requirement — a
 *  mix must be met in full, never in part. The wheel's door,
 *  the tab's list and (by its twin in server/src/abilities.ts)
 *  the server's cast gate all judge by this one law. */
export function abilityQualifies(requires: AbilityRequirement, sums: ElementSums): boolean {
  for (const el of ELEMENTS) {
    const need = requires[el];
    if (need != null && (sums[el] ?? 0) < need) return false;
  }
  return true;
}

/** The abilities this Awoken's sums qualify it for, in registry order. */
export function qualifiedAbilities(sums: ElementSums): AbilityDef[] {
  return ABILITY_REGISTRY.filter(a => abilityQualifies(a.requires, sums));
}

/** A requirement spoken in player words: "2 Rock", "2 Tide · 1 Root". */
export function requirementText(def: AbilityDef): string {
  return ELEMENTS
    .filter(el => (def.requires[el] ?? 0) > 0)
    .map(el => `${def.requires[el]} ${ELEMENT_WORD[el]}`)
    .join(" · ");
}

const NO_SUMS: ElementSums = { tide: 0, sky: 0, stone: 0, root: 0, fire: 0 };

/** A placement's element sums, as the server serves them
 *  with the field (getTerritory's `elements`). A placement
 *  served by an older road carries only its Rock sum; the
 *  rest then read as none held. */
export function elementSumsOfPlacement(p: {
  elements?: Partial<Record<ElementName, number>> | null;
  stone?: number | null;
}): ElementSums {
  const out: ElementSums = { ...NO_SUMS };
  if (p.elements) {
    for (const el of ELEMENTS) out[el] = Math.max(0, Math.floor(p.elements[el] ?? 0));
  } else if (p.stone != null) {
    out.stone = Math.max(0, Math.floor(p.stone));
  }
  return out;
}
