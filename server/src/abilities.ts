/**
 * THE ABILITIES SECTION — the ability registry, the server's
 * copy (2026-10-29). MUST MATCH client/src/abilities.ts: the
 * same abilities, the same names, the same requirements —
 * one law, two readers, in this codebase's buildGeometry
 * manner (the server build roots itself in server/src and
 * cannot reach across to the client's file).
 *
 * The client reads its copy to decide what an Awoken's
 * wheel shows and what the ability tab lists; the server
 * judges every cast by THIS copy, at its own door, whatever
 * the wheel showed — the two can never be allowed to
 * disagree about who may cast. They are held to it by
 * scripts/drive-wheel-abilities.mjs, which imports both
 * modules and fails if their tables differ.
 *
 * The law the table carries (Nigel, 2026-10-29 10:16): an
 * ability is gated by the casting Awoken's elemental power
 * levels — an amount of one element, or a specific mix of
 * elements — and qualifies only when every part of its
 * requirement is met in full.
 */

export type ElementName = "tide" | "sky" | "stone" | "root" | "fire";

/** The five elements, in the order a requirement is spoken. */
export const ELEMENTS: readonly ElementName[] = ["tide", "sky", "stone", "root", "fire"];

/** An Awoken's element sums: how much of each element its
 *  parts hold, counted the parts' way (a part is a point, an
 *  aspect part is its level in points). */
export type ElementSums = Record<ElementName, number>;

/** What an ability asks of an Awoken: an amount per element.
 *  An element not named asks nothing; a named amount must be
 *  met in full — a mix is met whole or not at all. */
export type AbilityRequirement = Partial<Record<ElementName, number>>;

export interface AbilityDef {
  /** The registry's key — the cast roads answer to it. */
  key: string;
  /** The ability's name, as the client speaks it. */
  name: string;
  /** The elemental amounts the casting Awoken must hold. */
  requires: AbilityRequirement;
}

/** THE REGISTRY — must match client/src/abilities.ts entry
 *  for entry. Its first entry is BUILDING, the Stone Cast
 *  (2026-10-28): the stone build pieces, raised from the
 *  ground by a fielded Awoken holding at least 2 Rock. */
export const ABILITY_REGISTRY: readonly AbilityDef[] = [
  {
    key: "building",
    name: "Building",
    requires: { stone: 2 },
  },
  {
    // MARCHING ISLANDS (Nigel, 2026-11-09): the registry's
    // elemental face of the gate — any Air at all in the sum
    // of the parts. The gate's other half (level above 3)
    // and its standing condition (the Awoken stands ON a
    // floating tile) are judged at the island order's own
    // door in actions.ts, where levels and land are read.
    key: "island-march",
    name: "Island March",
    requires: { sky: 1 },
  },
  {
    // MOON SHROOM (Nigel, 2026-11-10): a CHANNELED ability —
    // a mix met in full: at least 1 Root, 1 Tide and 1 Air in
    // the sum of the parts. The channel, the growth and the
    // harvest live in actions.ts (the moon shroom settle);
    // the registry carries only the gate, as it does for
    // every ability.
    key: "moon-shroom",
    name: "Moon Shroom",
    requires: { root: 1, tide: 1, sky: 1 },
  },
  {
    // THE RUNE (Nigel, 2026-11-10): a BUILDING ability — an
    // Awoken holding at least 4 Root in the sum of its parts
    // may begin the raising of a Rune, a monolith 2/3 a
    // bastion's size, for 400 Shadow Matter and four hours
    // of channeling. The raising, the channels and the
    // blessing live in actions.ts (the Rune settle); the
    // registry carries only the gate, as it does for every
    // ability.
    key: "the-rune",
    name: "The Rune",
    requires: { root: 4 },
  },
  {
    // THE SHRUB (Nigel, 2026-11-10): a CHANNELED ability —
    // at least 3 Root in the sum of the parts. The channel,
    // the growth, the wilt and the watering live in
    // actions.ts (the shrub settle); the registry carries
    // only the gate, as it does for every ability.
    key: "the-shrub",
    name: "The Shrub",
    requires: { root: 3 },
  },
];

export function abilityByKey(key: string): AbilityDef | undefined {
  return ABILITY_REGISTRY.find(a => a.key === key);
}

/** THE ONE CHECKER (the twin of the client's): an Awoken
 *  qualifies for an ability when its element sums meet EVERY
 *  part of the requirement — a mix must be met in full,
 *  never in part. */
export function abilityQualifies(requires: AbilityRequirement, sums: ElementSums): boolean {
  for (const el of ELEMENTS) {
    const need = requires[el];
    if (need != null && (sums[el] ?? 0) < need) return false;
  }
  return true;
}
