/**
 * THE FACES OF THE FALLEN'S LEAVINGS (the loot table fix,
 * Nigel, ruled 2026-10-25 18:46 + 19:40) — the art every
 * drop wears, on both grounds, in flight and at rest:
 * each of the twelve reagents wears its own face (his
 * PSD masters, exported to PNG — never JPG); energy
 * wears the Energy Orb, DRAWN AT A SIZE SCALED TO THE
 * AMOUNT IT CARRIES (19:40: "the more energy inside an
 * energy orb, the larger it is. make small amounts
 * smaller too" — one proportional law, below, so any
 * amount lands sensibly); attunement wears the Root Sap
 * (his Moonroot Sap) recoloured to the drawn element's
 * hue. Relics have no face of their own in his folder —
 * they wear the Star Seed's face, the closest verified
 * art (a fallen star-thing for a once-cursed thing),
 * flagged in the build report for his striking.
 */
import dreamShroom from "./assets/drops/dream-shroom.png";
import emberAsh from "./assets/drops/ember-ash.png";
import frayAsh from "./assets/drops/fray-ash.png";
import hollowSilk from "./assets/drops/hollow-silk.png";
import moonPetal from "./assets/drops/moon-petal.png";
import rootSap from "./assets/drops/root-sap.png";
import runeShardFace from "./assets/drops/rune-shard.png";
import shadowMatter from "./assets/drops/shadow-matter.png";
import skySalt from "./assets/drops/sky-salt.png";
import starSeed from "./assets/drops/star-seed.png";
import stoneDust from "./assets/drops/stone-dust.png";
import tidewater from "./assets/drops/tidewater.png";
import energyOrb from "./assets/drops/energy-orb.png";
import backpack from "./assets/drops/backpack-flipped.png";

/** The bag button's face (Nigel, ruled 2026-10-25
 *  21:05): the Backpack stands FLIPPED HORIZONTALLY
 *  where it is pinned as the right-side bag button —
 *  the shipped art is the flipped export, on the
 *  terrain map and at the Table alike. (The unflipped
 *  master export stands beside it in this folder,
 *  unused by the button.) */
export const BACKPACK_FACE = backpack;
export const ENERGY_ORB_FACE = energyOrb;
export const ROOT_SAP_FACE = rootSap;

const REAGENT_FACES: Record<string, string> = {
  "reagent:dream-shroom": dreamShroom,
  "reagent:ember-ash": emberAsh,
  "reagent:fray-ash": frayAsh,
  "reagent:hollow-silk": hollowSilk,
  "reagent:moon-petal": moonPetal,
  "reagent:root-sap": rootSap,
  "rune-shard": runeShardFace,
  "reagent:shadow-matter": shadowMatter,
  "reagent:sky-salt": skySalt,
  "reagent:star-seed": starSeed,
  "reagent:stone-dust": stoneDust,
  "reagent:tidewater": tidewater,
};

export interface DropLike {
  kind: "energy" | "attunement" | "item";
  itemKey?: string;
  element?: string;
  qty: number;
}

/** The face a drop wears. Items name their own good;
 *  relics (no art of their own in the folder) wear the
 *  Star Seed's face — flagged in the build report. */
export function faceForDrop(drop: DropLike): string {
  if (drop.kind === "energy") return energyOrb;
  if (drop.kind === "attunement") return rootSap;
  if (drop.itemKey && REAGENT_FACES[drop.itemKey]) return REAGENT_FACES[drop.itemKey];
  if (drop.itemKey?.startsWith("relic:")) return starSeed;
  return runeShardFace;
}

/** The Root Sap recoloured to an element's hue (the
 *  canonical palette: root #6a8a4e · tide #4e8a9b ·
 *  sky #8d9fd6 · stone #9c7c4c · fire #b8542e). Root
 *  wears the art as drawn — it is Root's own sap. */
export const ELEMENT_HUE_FILTER: Record<string, string> = {
  root: "none",
  tide: "hue-rotate(48deg) saturate(1.05)",
  sky: "hue-rotate(105deg) saturate(0.9) brightness(1.12)",
  stone: "hue-rotate(-32deg) saturate(0.75) brightness(0.98)",
  fire: "hue-rotate(-58deg) saturate(1.35) brightness(1.05)",
};

export function filterForDrop(drop: DropLike): string | undefined {
  if (drop.kind !== "attunement") return undefined;
  return ELEMENT_HUE_FILTER[drop.element ?? "root"] ?? undefined;
}

/** THE ORB'S SIZE LAW (Nigel, 2026-10-25 19:40): an
 *  energy orb's drawn diameter grows in proportion to
 *  the energy inside it — a Fray's 3-energy orb stands
 *  visibly small, a Tangle's 12-energy orb visibly
 *  large, every amount between on the same straight
 *  scale, clamped only at the edges of sense. */
export function orbDiameter(qty: number): number {
  return Math.round(Math.max(14, Math.min(48, 10 + qty * 2.6)));
}

/** The drawn size of any drop, in flight or at rest:
 *  energy by its law; everything else one standing
 *  measure. */
export function dropSize(drop: DropLike): number {
  return drop.kind === "energy" ? orbDiameter(drop.qty) : 26;
}
